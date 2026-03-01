# Plan 17: Procedural Sources (movieproc)

## Overview

Desktop OpenRV provides procedural sources (movieproc) that generate test patterns, color bars, solid fills, and calibration images without requiring external files. The web version has a partially-implemented `ProceduralSourceNode` with four pattern generators (SMPTE bars, color chart, gradient, solid) and `.movieproc` URL parsing, but this node is **not wired into the session, media manager, viewer, or UI**. No user-facing way to create procedural sources exists.

This plan covers:
1. Adding missing pattern generators (EBU bars, checkerboard, resolution test pattern, grey ramp)
2. Integrating `ProceduralSourceNode` into the session/media/viewer pipeline so patterns actually render
3. Adding a menu UI so users can create procedural sources without typing `.movieproc` URLs
4. Extending `.movieproc` URL parsing to support the new patterns and desktop OpenRV pattern name aliases
5. Enabling configurable resolution and frame count

## Current State

### What exists

**`/src/nodes/sources/ProceduralSourceNode.ts`** -- fully implemented node with:
- `PatternName` type: `'smpte_bars' | 'color_chart' | 'gradient' | 'solid'`
- Four generator functions: `generateSMPTEBars()`, `generateColorChart()`, `generateGradient()`, `generateSolid()`
- `.movieproc` URL parser: `parseMovieProc()` supporting `pattern,key=value,...,.movieproc` format
- `loadFromMovieProc(url)` and `loadPattern(pattern, width, height, options)` APIs
- Node registered as `'RVMovieProc'` via `@RegisterNode` decorator
- Float32 RGBA output via `IPImage` with `dataType: 'float32'`
- Comprehensive test suite (477 lines, all passing)

**`/src/nodes/sources/index.ts`** -- exports `ProceduralSourceNode` (import triggers registration)

### What is missing

1. **No session integration** -- `SessionMedia.ts` and `MediaManager.ts` have no `loadProceduralSource()` or `loadMovieProc()` method. There is no `proceduralSourceNode` field on `MediaSource`.

2. **No viewer rendering path** -- `Viewer.ts` renders sources by checking `source.videoSourceNode`, `source.fileSourceNode`, or `source.element`. Procedural sources produce an `IPImage` directly (float32), but the viewer has no code path to handle a `proceduralSourceNode` field on `MediaSource`.

3. **No UI** -- HeaderBar has no menu item for creating procedural sources. There is no dialog for selecting pattern type, resolution, or frame count.

4. **Missing patterns** -- No EBU color bars, checkerboard, resolution test pattern, or grey ramp generators exist.

5. **`MediaType` union** -- Defined as `'image' | 'video' | 'sequence'` in `/src/core/types/session.ts`. No `'procedural'` type exists, though procedural sources could use the existing `'image'` type since they produce static frames.

6. **No serialization support** -- `SessionSerializer` and GTO export/import do not handle procedural sources.

7. **No desktop OpenRV pattern name aliases** -- Desktop OpenRV uses shorter names (`smpte`, `ebu`, `checker`, `colorchart`, `ramp`) while the web implementation uses underscored names (`smpte_bars`, `ebu_bars`, etc.). `.rv` session files containing desktop-style `.movieproc` URLs will fail to parse.

## Proposed Architecture

### Design Principle: Treat Procedural Sources as HDR Images

Procedural sources output `IPImage` with `dataType: 'float32'` and 4 channels. This is identical to how `FileSourceNode` handles HDR images (EXR, DPX, HDR). The viewer already has a working WebGL rendering path for `hdrFileSource.getIPImage()` that accepts `IPImage` directly.

Rather than creating an entirely new rendering path, the plan is to make procedural sources flow through the existing `fileSourceNode`-like path by adding a `proceduralSourceNode` field to `MediaSource` and teaching the viewer to handle it alongside `fileSourceNode`.

**Transfer function semantics:** Pattern generator values are **sRGB-encoded** (not linear). When the shader's `u_inputTransfer` defaults to `INPUT_TRANSFER_SRGB` (code 0), it applies the sRGB EOTF to linearize these values. This means a 0.75 SMPTE bar value is treated as sRGB-encoded 0.75, linearized to ~0.522 for rendering. This is consistent with how `FileSourceNode` handles SDR 8-bit images (they also go through the sRGB EOTF). The pattern generators should document this encoding assumption in code comments.

### Source Loading Flow

```
User action (menu click / .movieproc URL)
  -> SessionMedia.loadProceduralSource(pattern, options)
    -> new ProceduralSourceNode()
    -> node.loadPattern() or node.loadFromMovieProc()
    -> Create MediaSource { type: 'image', proceduralSourceNode: node, ... }
    -> addSource(source)
    -> emit 'sourceLoaded'
```

### Rendering Flow

```
Viewer.renderImage()
  -> source.proceduralSourceNode exists?
    -> const ipImage = source.proceduralSourceNode.getIPImage()
    -> renderHDRWithWebGL(ipImage, ...)  // reuses existing HDR path
    -> [or] fallback: ipImage.toImageData() -> 2D canvas
```

**Critical: Viewer placeholder guard integration.** The existing guard at ~line 1432 of `Viewer.ts`:
```typescript
if (!source || (!element && !hdrFileSource && !isHDRVideo)) {
    // Placeholder mode
```
will send procedural sources (which have no `element`, no `hdrFileSource`, and no `isHDRVideo`) straight to placeholder mode. The fix requires adding `&& !source?.proceduralSourceNode` to this guard, and ensuring the procedural WebGL rendering block runs before this guard is evaluated. See Step 6 for full details.

### Pattern Module Organization

All pattern generators stay in or near `ProceduralSourceNode.ts`. New patterns are added as exported generator functions following the existing `PatternResult` return type:

```typescript
interface PatternResult {
  width: number;
  height: number;
  data: Float32Array;  // RGBA float32, 4 channels, sRGB-encoded values
}
```

### Pattern Name Aliases (Desktop OpenRV Compatibility)

To ensure `.rv` session file interoperability, the parser must accept both web and desktop OpenRV pattern names. The alias map:

```typescript
const PATTERN_ALIASES: Record<string, PatternName> = {
  'smpte': 'smpte_bars',
  'ebu': 'ebu_bars',
  'checker': 'checkerboard',
  'colorchart': 'color_chart',
  'ramp': 'gradient',
};
```

The `parseMovieProc()` function resolves aliases before validation. This means `smpte.movieproc`, `smpte_bars.movieproc`, `ebu.movieproc`, `ebu_bars.movieproc`, `checker.movieproc`, `checkerboard.movieproc`, `colorchart.movieproc`, `color_chart.movieproc`, and `ramp.movieproc`/`gradient.movieproc` all work.

## Pattern Generation

### Existing Patterns (no changes needed)

| Pattern | Function | Description |
|---------|----------|-------------|
| `smpte_bars` | `generateSMPTEBars()` | 7-bar 75% SMPTE color bars (sRGB-encoded values; the "White" bar is 75% grey per the standard) |
| `color_chart` | `generateColorChart()` | Macbeth ColorChecker 6x4 grid |
| `gradient` | `generateGradient()` | Linear ramp (horizontal or vertical) |
| `solid` | `generateSolid()` | Flat fill with configurable RGBA |

### New Patterns

#### 1. EBU Color Bars (`ebu_bars`)

EBU (European Broadcasting Union) color bars follow a similar structure to SMPTE but at 100% intensity and with 8 bars (adding black). The standard layout is:

```
White | Yellow | Cyan | Green | Magenta | Red | Blue | Black
```

All at 100% intensity (1.0 instead of 0.75 for SMPTE). These values are sRGB-encoded, matching the EBU Tech 3325 100/0/100/0 system.

```typescript
// Values are sRGB-encoded (not linear). The shader applies sRGB EOTF to linearize.
const EBU_BARS_100: readonly [number, number, number][] = [
  [1.0, 1.0, 1.0],  // White
  [1.0, 1.0, 0.0],  // Yellow
  [0.0, 1.0, 1.0],  // Cyan
  [0.0, 1.0, 0.0],  // Green
  [1.0, 0.0, 1.0],  // Magenta
  [1.0, 0.0, 0.0],  // Red
  [0.0, 0.0, 1.0],  // Blue
  [0.0, 0.0, 0.0],  // Black
];

function generateEBUBars(width: number, height: number): PatternResult
```

#### 2. Checkerboard (`checkerboard`)

A configurable checkerboard pattern for detecting spatial distortion, alignment, and resolution limits. Parameters:
- `cellSize`: size of each square in pixels (default: 64, **clamped to >= 1** to prevent division-by-zero)
- `colorA`: first color RGBA (default: `[1, 1, 1, 1]` white)
- `colorB`: second color RGBA (default: `[0, 0, 0, 1]` black)

```typescript
function generateCheckerboard(
  width: number,
  height: number,
  cellSize?: number,
  colorA?: [number, number, number, number],
  colorB?: [number, number, number, number],
): PatternResult
```

The cell assignment uses integer division: `isWhite = ((Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2) === 0`.

**Input guards:** `cellSize` is clamped to `Math.max(1, Math.floor(cellSize))` before use.

#### 3. Grey Ramp (`grey_ramp`)

A stepped grey ramp showing discrete luminance levels. Useful for gamma/transfer function verification. Parameters:
- `steps`: number of grey levels (default: 16, **clamped to >= 2** to prevent division-by-zero in `i / (steps - 1)`)
- `direction`: `'horizontal' | 'vertical'` (default: `'horizontal'`)

Unlike the smooth `gradient` pattern, this produces discrete bands:

```typescript
function generateGreyRamp(
  width: number,
  height: number,
  steps?: number,
  direction?: GradientDirection,
): PatternResult
```

Each step occupies `width / steps` pixels (horizontal) or `height / steps` pixels (vertical). The value for step `i` is `i / (steps - 1)`.

**Input guards:** `steps` is clamped to `Math.max(2, Math.floor(steps))` before use.

#### 4. Resolution Test Pattern (`resolution_chart`)

A procedural resolution/alignment chart with:
- Center crosshair with circle
- Corner crosshairs for alignment verification
- Horizontal and vertical line pairs at varying frequencies for resolution limit detection
- Text-free (no font rendering required -- uses pixel-level line drawing)
- Border frame (1px white outline)

```typescript
function generateResolutionChart(width: number, height: number): PatternResult
```

Implementation approach:
- Draw on a Float32Array using helper functions: `drawLine(data, width, x0, y0, x1, y1, color)`, `drawCircle(data, width, cx, cy, r, color)`, `drawRect(data, width, x, y, w, h, color)`
- Center crosshair: horizontal + vertical lines spanning 20% of image, with a circle at center (radius = 5% of min dimension)
- Corner markers: small crosshairs at 5% inset from each corner
- Frequency gratings: alternating black/white vertical and horizontal line pairs at 1px, 2px, 4px, 8px, 16px periods, arranged in horizontal and vertical bands near center

### Input Guards (All Generators)

All generator functions clamp `width` and `height` to `>= 1` before use. The procedural source resolution is additionally capped at a maximum of **8192x8192** (see Procedural Resolution Cap section below). This prevents the creation of excessively large Float32Arrays that would crash the browser.

```typescript
// Applied at the start of every generator function:
width = Math.max(1, Math.min(width, PROCEDURAL_MAX_DIMENSION));
height = Math.max(1, Math.min(height, PROCEDURAL_MAX_DIMENSION));

// Additionally in specific generators:
// generateCheckerboard: cellSize = Math.max(1, Math.floor(cellSize));
// generateGreyRamp: steps = Math.max(2, Math.floor(steps));
```

### Procedural Resolution Cap

The general `IMAGE_LIMITS` in `/src/config/ImageLimits.ts` allows up to 65536 pixels per dimension and 256 megapixels total. For Float32 RGBA procedural sources, these limits are dangerously high (65536x65536 = 64 GB, 256 MP = ~4 GB). A procedural-specific cap is applied:

```typescript
const PROCEDURAL_MAX_DIMENSION = 8192;  // Hard max per dimension
const PROCEDURAL_MAX_PIXELS = 8192 * 8192;  // ~1 GB for float32 RGBA
```

This cap is enforced in `loadPattern()` and `loadFromMovieProc()` before generating the pattern. The cap is independent of `IMAGE_LIMITS` and provides an additional safety net for procedural sources.

### Extended PatternName Type

```typescript
export type PatternName =
  | 'smpte_bars'
  | 'ebu_bars'
  | 'color_chart'
  | 'gradient'
  | 'solid'
  | 'checkerboard'
  | 'grey_ramp'
  | 'resolution_chart';
```

### Extended MovieProcParams

```typescript
export interface MovieProcParams {
  pattern: PatternName;
  start?: number;
  end?: number;
  fps?: number;
  width?: number;
  height?: number;
  color?: [number, number, number, number];
  direction?: GradientDirection;
  // New fields:
  cellSize?: number;      // checkerboard cell size (clamped to >= 1)
  colorA?: [number, number, number, number];  // checkerboard color A
  colorB?: [number, number, number, number];  // checkerboard color B
  steps?: number;         // grey_ramp step count (clamped to >= 2)
}
```

### Extended .movieproc URL Format

New URLs (including desktop OpenRV aliases):
```
ebu_bars.movieproc
ebu.movieproc                   # alias for ebu_bars
ebu_bars,width=1920,height=1080.movieproc
checkerboard,cellSize=32.movieproc
checker,cellSize=32.movieproc   # alias for checkerboard
checkerboard,cellSize=64,colorA=1 1 0 1,colorB=0 0 0.5 1.movieproc
grey_ramp,steps=16,direction=horizontal.movieproc
resolution_chart,width=1920,height=1080.movieproc
smpte.movieproc                 # alias for smpte_bars
colorchart.movieproc            # alias for color_chart
ramp.movieproc                  # alias for gradient
```

## UI Design

### Menu Integration

Add a "Sources" dropdown button to the HeaderBar file operations group, positioned after the existing Open button. The dropdown uses the existing `DropdownMenu` component.

```
[Open] [Save] [Open Project] [Export] | [Sources v] | ...
```

The Sources dropdown contains:

| Item | Value | Description |
|------|-------|-------------|
| SMPTE Color Bars | `smpte_bars` | 75% intensity SMPTE bars |
| EBU Color Bars | `ebu_bars` | 100% intensity EBU bars |
| Color Chart | `color_chart` | Macbeth ColorChecker |
| Solid Color... | `solid` | Opens color picker (see below) |
| Gradient (horizontal) | `gradient` | Horizontal linear ramp |
| Checkerboard | `checkerboard` | Black/white checker grid |
| Grey Ramp | `grey_ramp` | 16-step discrete grey levels |
| Resolution Chart | `resolution_chart` | Alignment/resolution test |
| --- | | |
| Custom Resolution... | `custom` | Prompts for width/height, then pattern |

Clicking most items immediately loads the pattern at the default resolution (1920x1080). "Solid Color..." opens a color input dialog. "Custom Resolution..." prompts for width and height, then shows the pattern list.

### Solid Color Input (Improved)

Instead of a raw text prompt expecting 0-1 float values, the solid color input accepts multiple formats with auto-detection and validation:

```typescript
private parseSolidColorInput(input: string): [number, number, number, number] | null {
  const trimmed = input.trim();

  // Hex format: #RGB, #RRGGBB, #RRGGBBAA
  if (trimmed.startsWith('#')) {
    return parseHexColor(trimmed);
  }

  const parts = trimmed.split(/[\s,]+/).map(Number);
  if (parts.some(isNaN)) return null;

  // 0-255 integer range (any value > 1.0 triggers this)
  if (parts.some(v => v > 1.0)) {
    return [
      (parts[0] ?? 0) / 255,
      (parts[1] ?? 0) / 255,
      (parts[2] ?? 0) / 255,
      parts[3] !== undefined ? parts[3] / 255 : 1,
    ];
  }

  // 0-1 float range
  return [
    parts[0] ?? 0,
    parts[1] ?? 0,
    parts[2] ?? 0,
    parts[3] ?? 1,
  ];
}
```

The prompt text is updated to:
```
Enter a color:
  Hex: #FF0000 or #FF0000FF
  RGB (0-255): 255 0 0
  RGB (0-1): 1.0 0.0 0.0
Values are interpreted as sRGB-encoded.
```

On invalid input, a validation error is shown and the user can retry. The `showPrompt` utility is called in a loop until valid input is received or the user cancels.

### Configuration Dialog (Phase 2, not MVP)

A future enhancement could add a modal dialog for configuring:
- Resolution presets: 720p, 1080p, 2K, UHD
- Custom width/height
- Frame count (for multi-frame procedural "clips")
- Pattern-specific parameters (cell size, step count, gradient direction)

For the initial implementation, sensible defaults are used (1920x1080, 1 frame, default pattern parameters).

> **Review Note (Phase 2):** A full configuration dialog with resolution presets, pattern parameters, and a live preview thumbnail is a strong candidate for Phase 2 (N7). Dropdown section separators (Color Bars / Test Patterns / Ramps / Fill) would also improve scanning of the 8+ item list (N1).

## Implementation Steps

### Step 1: Add New Pattern Generators

**File:** `/src/nodes/sources/ProceduralSourceNode.ts`

1. Add `PROCEDURAL_MAX_DIMENSION` constant (8192) and `PROCEDURAL_MAX_PIXELS` constant
2. Add `PATTERN_ALIASES` map for desktop OpenRV compatibility (`smpte` -> `smpte_bars`, `ebu` -> `ebu_bars`, `checker` -> `checkerboard`, `colorchart` -> `color_chart`, `ramp` -> `gradient`)
3. Add input guard helper: `clampDimensions(width, height)` that enforces `>= 1` and `<= PROCEDURAL_MAX_DIMENSION`
4. Add `EBU_BARS_100` constant array and `generateEBUBars()` function
5. Add `generateCheckerboard()` function with `cellSize`, `colorA`, `colorB` params (cellSize clamped to >= 1)
6. Add `generateGreyRamp()` function with `steps` and `direction` params (steps clamped to >= 2)
7. Add `generateResolutionChart()` function with line-drawing helpers
8. Extend `PatternName` type to include new pattern names
9. Extend `MovieProcParams` interface with new fields (`cellSize`, `colorA`, `colorB`, `steps`)
10. Update `parseMovieProc()` to resolve aliases via `PATTERN_ALIASES` map before validation, and to parse new parameters from URLs
11. Update `validPatterns` array in `parseMovieProc()` to accept new pattern names
12. Update `generatePattern()` switch statement to dispatch to new generators
13. Add sRGB-encoding documentation comment to all generator functions
14. Export new generator functions

### Step 2: Add Tests for New Patterns

**File:** `/src/nodes/sources/ProceduralSourceNode.test.ts`

Add test suites for:
- `generateEBUBars`: correct bar colors at 100%, correct dimensions, alpha = 1.0
- `generateCheckerboard`: alternating cells, custom colors, custom cell size, edge cases (cellSize=0 clamped to 1)
- `generateGreyRamp`: correct step values, step boundaries, both directions, edge cases (steps=0 clamped to 2, steps=1 clamped to 2)
- `generateResolutionChart`: correct dimensions, crosshair presence, border frame
- `parseMovieProc`: new pattern parsing, new parameter parsing, **alias resolution** (`smpte.movieproc` -> `smpte_bars`, `ebu.movieproc` -> `ebu_bars`, etc.)
- Input guards: dimension clamping, resolution cap enforcement
- `PROCEDURAL_MAX_DIMENSION` enforcement

### Step 3: Extend MediaSource Interface

**File:** `/src/core/session/Session.ts`

Add `proceduralSourceNode` field to `MediaSource`:

```typescript
export interface MediaSource {
  type: MediaType;
  name: string;
  url: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  element?: HTMLImageElement | HTMLVideoElement | ImageBitmap;
  sequenceInfo?: SequenceInfo;
  sequenceFrames?: SequenceFrame[];
  videoSourceNode?: VideoSourceNode;
  fileSourceNode?: FileSourceNode;
  proceduralSourceNode?: ProceduralSourceNode;  // NEW
  opfsCacheKey?: string;
}
```

Import `ProceduralSourceNode` at the top of the file.

### Step 4: Add Session Loading Method

**Files:**
- `/src/core/session/SessionMedia.ts`
- `/src/core/session/MediaManager.ts`

Add `loadProceduralSource()` method to both `SessionMedia` and `MediaManager`:

```typescript
import { ProceduralSourceNode, type PatternName, type GradientDirection } from '../../nodes/sources/ProceduralSourceNode';

// In SessionMedia:
loadProceduralSource(
  pattern: PatternName,
  options?: {
    width?: number;
    height?: number;
    color?: [number, number, number, number];
    direction?: GradientDirection;
    cellSize?: number;
    steps?: number;
    fps?: number;
    duration?: number;
  },
): void {
  this._host!.clearGraphData();

  const width = options?.width ?? 1920;
  const height = options?.height ?? 1080;
  const fps = options?.fps ?? this._host!.getFps();
  const duration = options?.duration ?? 1;

  const node = new ProceduralSourceNode();
  node.loadPattern(pattern, width, height, {
    color: options?.color,
    direction: options?.direction,
    cellSize: options?.cellSize,
    steps: options?.steps,
    fps,
    duration,
  });

  // Use a counter to ensure unique source names
  const sourceName = this.generateUniqueSourceName(pattern, width, height);

  const source: MediaSource = {
    type: 'image',
    name: sourceName,
    url: `movieproc://${pattern}`,
    width,
    height,
    duration,
    fps,
    proceduralSourceNode: node,
  };

  this.addSource(source);
  this._host!.setInPoint(1);
  this._host!.setOutPoint(duration);
  this._host!.setCurrentFrame(1);

  this.emit('sourceLoaded', source);
  this.emit('durationChanged', duration);
}

// Helper for unique names:
private _proceduralCounter = 0;
private generateUniqueSourceName(pattern: string, width: number, height: number): string {
  this._proceduralCounter++;
  if (this._proceduralCounter === 1) {
    return `${pattern} (${width}x${height})`;
  }
  return `${pattern} #${this._proceduralCounter} (${width}x${height})`;
}
```

Similarly, add a `loadMovieProc(url: string)` method that parses the URL and delegates:

```typescript
loadMovieProc(url: string): void {
  const params = parseMovieProc(url);
  const node = new ProceduralSourceNode();
  node.loadFromMovieProc(url);

  const metadata = node.getMetadata();
  // ... create MediaSource and addSource, same pattern as above
}
```

Add corresponding methods to `MediaManager` following the same `MediaManagerHost` callback pattern.

### Step 5: Extend Session Public API

**File:** `/src/core/session/Session.ts`

Add public methods that delegate to `SessionMedia` / `MediaManager`:

```typescript
loadProceduralSource(
  pattern: PatternName,
  options?: { width?: number; height?: number; ... }
): void {
  this._media.loadProceduralSource(pattern, options);
}

loadMovieProc(url: string): void {
  this._media.loadMovieProc(url);
}
```

### Step 6: Viewer Rendering Path

**File:** `/src/ui/components/Viewer.ts`

This step requires careful integration with the existing branching logic. The key issue is the **placeholder guard** at ~line 1432:

```typescript
const hdrFileSource = source?.fileSourceNode?.isHDR() ? source.fileSourceNode : null;
const isHDRVideo = source?.videoSourceNode?.isHDR() === true;
if (!source || (!element && !hdrFileSource && !isHDRVideo)) {
    // Placeholder mode -- shows grey instead of the pattern!
```

Without modification, this guard rejects procedural sources (which have no `element`, no `hdrFileSource`, and no `isHDRVideo`), routing them to placeholder mode.

**Fix:** Update the guard and add procedural source handling in the correct location.

**6a. Update the placeholder guard (~line 1432):**

```typescript
const hdrFileSource = source?.fileSourceNode?.isHDR() ? source.fileSourceNode : null;
const isHDRVideo = source?.videoSourceNode?.isHDR() === true;
const hdrProceduralSource = source?.proceduralSourceNode ?? null;
if (!source || (!element && !hdrFileSource && !isHDRVideo && !hdrProceduralSource)) {
    // Placeholder mode
```

**6b. Add procedural rendering block alongside hdrFileSource block (~line 1558-1582):**

Insert a check for `proceduralSourceNode` in the rendering section, alongside the existing `fileSourceNode` and `videoSourceNode` checks:

```typescript
} else if (source?.proceduralSourceNode) {
  // Procedural sources produce float32 IPImage -- render via WebGL HDR path
  const ipImage = source.proceduralSourceNode.getIPImage();
  if (ipImage) {
    const { width: displayWidth, height: displayHeight } = calculateDisplayDimensions(
      source.width, source.height, containerWidth, containerHeight, this.transformManager.zoom
    );
    // ... set source dimensions, calculate display dimensions ...
    if (this.renderHDRWithWebGL(ipImage, displayWidth, displayHeight)) {
      this.updateCanvasPosition();
      this.updateWipeLine();
      return;
    }
    // Fallback: convert to ImageData and use 2D canvas
    element = this.proceduralFallbackCanvas(ipImage);
  }
```

**6c. Add fallback helper:**

```typescript
private proceduralFallbackCanvas(ipImage: IPImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ipImage.width;
  canvas.height = ipImage.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(ipImage.toImageData(), 0, 0);
  return canvas;
}
```

**6d. Update HDR detection logic (~line 1288):**

```typescript
const isCurrentHDR = source?.fileSourceNode?.isHDR() === true
  || source?.videoSourceNode?.isHDR() === true
  || source?.proceduralSourceNode != null;  // float32 = HDR path
```

Note: Procedural sources are not truly HDR (they contain sRGB-range values 0-1), but routing through the HDR path is correct because the float32 texture upload and sRGB EOTF handling match the procedural source data format. For values in [0, 1], tone mapping operators are typically a no-op.

### Step 7: HeaderBar UI

**File:** `/src/ui/components/layout/HeaderBar.ts`

Add a Sources dropdown button in the file operations group. Import `DropdownMenu` and wire up pattern selection:

```typescript
import { DropdownMenu, type DropdownMenuItem } from '../shared/DropdownMenu';

// In the file group setup (after the Open button, around line 220):

const sourcesMenu = new DropdownMenu({
  minWidth: '180px',
  onSelect: (value) => this.handleProceduralSource(value),
});
sourcesMenu.setItems([
  { value: 'smpte_bars', label: 'SMPTE Color Bars' },
  { value: 'ebu_bars', label: 'EBU Color Bars' },
  { value: 'color_chart', label: 'Color Chart' },
  { value: 'solid', label: 'Solid Color...' },
  { value: 'gradient', label: 'Gradient (horizontal)' },
  { value: 'checkerboard', label: 'Checkerboard' },
  { value: 'grey_ramp', label: 'Grey Ramp' },
  { value: 'resolution_chart', label: 'Resolution Chart' },
  { value: 'custom_resolution', label: 'Custom Resolution...' },
]);

const sourcesButton = this.createCompactButton(
  'Sources',
  () => sourcesMenu.toggle(sourcesButton),
  'Load procedural test pattern',
  'image',
);
sourcesButton.setAttribute('aria-haspopup', 'menu');
fileGroup.appendChild(sourcesButton);
```

Handler method with improved color input:

```typescript
private async handleProceduralSource(pattern: string): Promise<void> {
  let options: Record<string, unknown> = {};

  if (pattern === 'custom_resolution') {
    const resStr = await showPrompt(
      'Enter resolution (e.g. "1920 1080" or "3840 2160"):',
      { defaultValue: '1920 1080', title: 'Custom Resolution' }
    );
    if (!resStr) return;
    const [w, h] = resStr.split(/[\sx,]+/).map(Number);
    if (!w || !h || isNaN(w) || isNaN(h) || w < 1 || h < 1) {
      await showPrompt('Invalid resolution. Please enter two positive integers.', { title: 'Error' });
      return;
    }
    options = { width: Math.min(w, 8192), height: Math.min(h, 8192) };
    // After getting resolution, prompt for pattern selection
    // For MVP, default to SMPTE bars at the custom resolution
    this.session.loadProceduralSource('smpte_bars', options);
    this.emit('fileLoaded', undefined);
    return;
  }

  if (pattern === 'solid') {
    const colorStr = await showPrompt(
      'Enter a color:\n  Hex: #FF0000\n  RGB 0-255: 255 0 0\n  RGB 0-1: 1.0 0.0 0.0\nValues are sRGB-encoded.',
      { defaultValue: '0.5 0.5 0.5', title: 'Solid Color' }
    );
    if (!colorStr) return;
    const color = this.parseSolidColorInput(colorStr);
    if (!color) {
      await showPrompt('Could not parse color. Use hex (#FF0000), 0-255 (255 0 0), or 0-1 (1.0 0.0 0.0).', { title: 'Invalid Color' });
      return;
    }
    this.session.loadProceduralSource('solid', { color });
  } else {
    this.session.loadProceduralSource(pattern as PatternName, options);
  }
  this.emit('fileLoaded', undefined);
}

private parseSolidColorInput(input: string): [number, number, number, number] | null {
  const trimmed = input.trim();

  // Hex format: #RGB, #RRGGBB, #RRGGBBAA
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    let r: number, g: number, b: number, a = 1;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16) / 255;
      g = parseInt(hex[1] + hex[1], 16) / 255;
      b = parseInt(hex[2] + hex[2], 16) / 255;
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16) / 255;
      g = parseInt(hex.slice(2, 4), 16) / 255;
      b = parseInt(hex.slice(4, 6), 16) / 255;
    } else if (hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16) / 255;
      g = parseInt(hex.slice(2, 4), 16) / 255;
      b = parseInt(hex.slice(4, 6), 16) / 255;
      a = parseInt(hex.slice(6, 8), 16) / 255;
    } else {
      return null;
    }
    if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) return null;
    return [r, g, b, a];
  }

  const parts = trimmed.split(/[\s,]+/).map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return null;

  // 0-255 integer range (any value > 1.0 triggers this)
  if (parts.some(v => v > 1.0)) {
    return [
      (parts[0] ?? 0) / 255,
      (parts[1] ?? 0) / 255,
      (parts[2] ?? 0) / 255,
      parts[3] !== undefined ? parts[3] / 255 : 1,
    ];
  }

  // 0-1 float range
  return [
    parts[0] ?? 0,
    parts[1] ?? 0,
    parts[2] ?? 0,
    parts[3] ?? 1,
  ];
}
```

### Step 8: Extend ProceduralSourceNode.loadPattern Options

**File:** `/src/nodes/sources/ProceduralSourceNode.ts`

Add `cellSize`, `colorA`, `colorB`, `steps` to the `loadPattern` options parameter and thread them through to `generatePattern()`:

```typescript
loadPattern(
  pattern: PatternName,
  width: number,
  height: number,
  options?: {
    color?: [number, number, number, number];
    direction?: GradientDirection;
    cellSize?: number;
    colorA?: [number, number, number, number];
    colorB?: [number, number, number, number];
    steps?: number;
    fps?: number;
    duration?: number;
  },
): void { ... }
```

The method should enforce the procedural resolution cap before generating:

```typescript
width = Math.max(1, Math.min(width, PROCEDURAL_MAX_DIMENSION));
height = Math.max(1, Math.min(height, PROCEDURAL_MAX_DIMENSION));
if (width * height > PROCEDURAL_MAX_PIXELS) {
  // Scale down proportionally
  const scale = Math.sqrt(PROCEDURAL_MAX_PIXELS / (width * height));
  width = Math.floor(width * scale);
  height = Math.floor(height * scale);
}
```

### Step 9: Session Serialization (GTO)

**File:** `/src/core/session/SessionGTOExporter.ts`

When serializing sources, if a `proceduralSourceNode` is present, serialize using the desktop OpenRV-compatible GTO structure:

- **Protocol:** `RVMovieProc`
- **Component:** `movie`
- **Property:** `url` (string) containing the full `.movieproc` URL

Example GTO structure:
```
Object "sourceGroup000001_movieProc" protocol "RVMovieProc" {
  component "movie" {
    string url = "smpte_bars,width=1920,height=1080.movieproc"
  }
}
```

This matches desktop OpenRV's serialization format for round-trip compatibility.

**File:** `/src/core/session/GTOGraphLoader.ts`

When loading GTO data that contains `RVMovieProc` node entries, instantiate `ProceduralSourceNode` and call `loadFromMovieProc()` with the stored URL. The `NodeFactory` already handles unknown types by returning `null` with a warning, so older sessions without procedural support will degrade gracefully.

### Step 10: Disposal

**File:** `/src/core/session/SessionMedia.ts` and `/src/core/session/MediaManager.ts`

In `dispose()`, add cleanup for procedural sources alongside the existing `fileSourceNode` and `videoSourceNode` disposal:

```typescript
if (source.proceduralSourceNode) {
  source.proceduralSourceNode.dispose();
}
```

This must be added to the dispose loop -- it is a one-line addition but must not be forgotten.

### Step 11: API Exposure

**File:** `/src/api/MediaAPI.ts`

Add `loadProceduralSource()` and `loadMovieProc()` to the public API, delegating to session methods.

## Files to Create/Modify

### Files to Modify

| File | Changes |
|------|---------|
| `/src/nodes/sources/ProceduralSourceNode.ts` | Add 4 new generator functions, extend `PatternName`, extend `MovieProcParams`, extend parser and dispatcher, add pattern name aliases (`PATTERN_ALIASES` map), add input guards (dimension clamping, cellSize/steps clamping), add procedural resolution cap (`PROCEDURAL_MAX_DIMENSION`), add new `loadPattern` options, add sRGB-encoding comments |
| `/src/nodes/sources/ProceduralSourceNode.test.ts` | Add test suites for EBU bars, checkerboard, grey ramp, resolution chart, extended parsing, alias resolution, input guard edge cases, resolution cap enforcement |
| `/src/core/types/session.ts` | No change needed (procedural uses `'image'` type) |
| `/src/core/session/Session.ts` | Add `proceduralSourceNode` to `MediaSource` interface, add `loadProceduralSource()` and `loadMovieProc()` public methods, import `ProceduralSourceNode` |
| `/src/core/session/SessionMedia.ts` | Add `loadProceduralSource()` and `loadMovieProc()` methods, add `generateUniqueSourceName()` helper, import node, add disposal logic |
| `/src/core/session/MediaManager.ts` | Add `loadProceduralSource()` and `loadMovieProc()` methods, import node, add disposal logic |
| `/src/ui/components/layout/HeaderBar.ts` | Add Sources dropdown button and `handleProceduralSource()` handler with improved color input parsing (`parseSolidColorInput`), add "Custom Resolution..." entry, import DropdownMenu |
| `/src/ui/components/Viewer.ts` | Add rendering path for `proceduralSourceNode`, **fix placeholder guard** to include `!hdrProceduralSource`, handle in HDR detection, add fallback canvas helper |
| `/src/core/session/SessionGTOExporter.ts` | Serialize `ProceduralSourceNode` data using `RVMovieProc` protocol with `movie.url` property |
| `/src/core/session/GTOGraphLoader.ts` | Deserialize and instantiate `ProceduralSourceNode` from GTO data |
| `/src/api/MediaAPI.ts` | Expose `loadProceduralSource()` and `loadMovieProc()` in public API |
| `/src/handlers/sourceLoadedHandlers.ts` | Handle transfer function detection for procedural sources (sRGB by default) |

### Files to Create

None. All implementation fits within existing files.

### Test Files to Modify

| File | Changes |
|------|---------|
| `/src/nodes/sources/ProceduralSourceNode.test.ts` | Add tests for new generators, parser extensions, alias resolution, input guards, resolution cap |
| `/src/ui/components/layout/HeaderBar.test.ts` | Add tests for Sources dropdown menu creation, pattern selection, solid color input parsing (hex, 0-255, 0-1, invalid input) |
| `/src/core/session/SessionMedia.test.ts` | Add tests for `loadProceduralSource()` method, unique name generation |
| `/src/core/session/Session.media.test.ts` | Add tests for session-level procedural source loading |

## Risks

### 1. Float32 Rendering Path Assumptions

**Risk:** The viewer's HDR WebGL path (`renderHDRWithWebGL`) may make assumptions specific to `FileSourceNode` or `VideoSourceNode` that fail for procedural sources (e.g., checking `isHDR()`, transfer function metadata).

**Mitigation:** Procedural sources use `dataType: 'float32'` which the renderer already handles. The `isHDRContent()` function in `Renderer.ts` returns `true` for `float32` data, so texture upload will use `gl.RGBA32F`. Transfer function defaults to sRGB (no EOTF needed since values are already sRGB-encoded and the shader applies the sRGB EOTF consistently with SDR file sources). Test with the existing SMPTE bars pattern first before adding new patterns.

### 2. Memory Usage for Large Resolutions

**Risk:** A 4K (3840x2160) float32 RGBA image is 3840 * 2160 * 4 * 4 = ~127 MB. Users could create very large procedural sources.

**Mitigation:** A procedural-specific resolution cap of 8192x8192 (~1 GB) is enforced independently of the general `IMAGE_LIMITS`. The `loadPattern()` method clamps dimensions and total pixel count before generation. The default 1920x1080 is ~32 MB which is reasonable. The general `IMAGE_LIMITS` (65536x65536 / 256 MP) is not sufficient for procedural sources because even the pixel count cap allows ~4 GB of float32 data.

### 3. Pattern Accuracy (SMPTE/EBU Standards)

**Risk:** Professional users expect color bar patterns to match broadcast standards exactly. The existing SMPTE bars use simplified 75% values without the standard bottom-row pluge/sub-carrier patterns.

**Mitigation:** For the MVP, the simplified patterns are acceptable and match the desktop OpenRV movieproc behavior. Document that these are approximate test patterns, not ITU-R BT.2111 compliance targets. Pattern values are sRGB-encoded, which is consistent with how the rendering pipeline handles SDR content.

> **Review Note (Phase 2):** A full SMPTE RP 219 pattern with the complete three-row layout (75% bars, reverse bars + pluge, pluge + black) would be a valuable Phase 2 addition (N5).

### 4. Viewer Rendering Path Complexity

**Risk:** The `renderImage()` method in `Viewer.ts` is already complex with multiple conditional branches for different source types. Adding another branch for procedural sources increases complexity. Additionally, the existing placeholder guard at ~line 1432 will reject procedural sources if not updated.

**Mitigation:** The placeholder guard must be updated to include `!hdrProceduralSource` (see Step 6a). The procedural source branch is structurally identical to the `fileSourceNode` HDR branch. It retrieves an `IPImage` and passes it to `renderHDRWithWebGL()`. The fallback is a simple `toImageData()` conversion. Keep the branch minimal and consider a future refactoring that unifies all `IPImage`-producing source types (file HDR, video HDR, procedural) behind a common interface.

### 5. No Font Rendering for Resolution Chart

**Risk:** The resolution test pattern cannot include text labels (frequency values, resolution identifiers) because the web app has no built-in bitmap font renderer for drawing text into Float32Array pixel buffers.

**Mitigation:** The resolution chart uses purely geometric elements (lines, circles, crosshairs, gratings). This is sufficient for visual alignment verification. Text overlay can be added later via a separate annotation/burn-in system if needed.

### 6. Serialization Backward Compatibility

**Risk:** Adding `proceduralSourceNode` to `MediaSource` and serializing it to GTO format could cause issues when loading older project files.

**Mitigation:** The field is optional on `MediaSource`. GTO deserialization should gracefully skip unknown node types. The `NodeFactory` already handles unknown types by returning `null` with a warning. Procedural sources serialized as `RVMovieProc` nodes with a `movie.url` property match desktop OpenRV's format and can be re-created via `loadFromMovieProc()` on load.

### 7. Source Switching and A/B Compare

**Risk:** Procedural sources added via the menu need to integrate correctly with the A/B source compare system. The `ABCompareManager` auto-assigns source B when a second source is added.

**Mitigation:** Procedural sources flow through the standard `addSource()` path which already handles A/B auto-assignment. No special handling is needed. Test A/B compare with a procedural source as source A and a file as source B (and vice versa).

### 8. Animated Procedural Patterns (Known Limitation)

**Risk:** The `MovieProcParams` interface includes `start`, `end`, `fps`, and `duration` fields, suggesting multi-frame procedural clips. However, the current `ProceduralSourceNode.generatePattern()` creates a single `IPImage` and caches it. The `process()` method mutates `cachedIPImage.metadata.frameNumber` without regenerating pattern data.

**Mitigation:** All MVP patterns are static, so this is acceptable. Document as a known limitation. Animated patterns (e.g., crawling checkerboard, frame counter burn-in) would require `process()` to regenerate per frame based on `context.frame`.

> **Review Note (Phase 2):** Animated procedural patterns are a Phase 2 candidate (N6). Additional Phase 2 pattern candidates include noise (N2), zone plate (N3), and color wheel/hue sweep (N4).
