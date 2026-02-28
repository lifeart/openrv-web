# Plan 17: Procedural Sources (movieproc)

## Overview

Desktop OpenRV provides procedural sources (movieproc) that generate test patterns, color bars, solid fills, and calibration images without requiring external files. The web version has a partially-implemented `ProceduralSourceNode` with four pattern generators (SMPTE bars, color chart, gradient, solid) and `.movieproc` URL parsing, but this node is **not wired into the session, media manager, viewer, or UI**. No user-facing way to create procedural sources exists.

This plan covers:
1. Adding missing pattern generators (EBU bars, checkerboard, resolution test pattern, grey ramp)
2. Integrating `ProceduralSourceNode` into the session/media/viewer pipeline so patterns actually render
3. Adding a menu UI so users can create procedural sources without typing `.movieproc` URLs
4. Extending `.movieproc` URL parsing to support the new patterns
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

## Proposed Architecture

### Design Principle: Treat Procedural Sources as HDR Images

Procedural sources output `IPImage` with `dataType: 'float32'` and 4 channels. This is identical to how `FileSourceNode` handles HDR images (EXR, DPX, HDR). The viewer already has a working WebGL rendering path for `hdrFileSource.getIPImage()` that accepts `IPImage` directly.

Rather than creating an entirely new rendering path, the plan is to make procedural sources flow through the existing `fileSourceNode`-like path by adding a `proceduralSourceNode` field to `MediaSource` and teaching the viewer to handle it alongside `fileSourceNode`.

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

### Pattern Module Organization

All pattern generators stay in or near `ProceduralSourceNode.ts`. New patterns are added as exported generator functions following the existing `PatternResult` return type:

```typescript
interface PatternResult {
  width: number;
  height: number;
  data: Float32Array;  // RGBA float32, 4 channels
}
```

## Pattern Generation

### Existing Patterns (no changes needed)

| Pattern | Function | Description |
|---------|----------|-------------|
| `smpte_bars` | `generateSMPTEBars()` | 7-bar 75% SMPTE color bars |
| `color_chart` | `generateColorChart()` | Macbeth ColorChecker 6x4 grid |
| `gradient` | `generateGradient()` | Linear ramp (horizontal or vertical) |
| `solid` | `generateSolid()` | Flat fill with configurable RGBA |

### New Patterns

#### 1. EBU Color Bars (`ebu_bars`)

EBU (European Broadcasting Union) color bars follow a similar structure to SMPTE but at 100% intensity and with 8 bars (adding black). The standard layout is:

```
White | Yellow | Cyan | Green | Magenta | Red | Blue | Black
```

All at 100% intensity (1.0 instead of 0.75 for SMPTE).

```typescript
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
- `cellSize`: size of each square in pixels (default: 64)
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

#### 3. Grey Ramp (`grey_ramp`)

A stepped grey ramp showing discrete luminance levels. Useful for gamma/transfer function verification. Parameters:
- `steps`: number of grey levels (default: 16, producing levels from 0.0 to 1.0)
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
  cellSize?: number;      // checkerboard cell size
  colorA?: [number, number, number, number];  // checkerboard color A
  colorB?: [number, number, number, number];  // checkerboard color B
  steps?: number;         // grey_ramp step count
}
```

### Extended .movieproc URL Format

New URLs:
```
ebu_bars.movieproc
ebu_bars,width=1920,height=1080.movieproc
checkerboard,cellSize=32.movieproc
checkerboard,cellSize=64,colorA=1 1 0 1,colorB=0 0 0.5 1.movieproc
grey_ramp,steps=16,direction=horizontal.movieproc
resolution_chart,width=1920,height=1080.movieproc
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
| Solid Color... | `solid` | Opens color picker prompt |
| Gradient | `gradient` | Horizontal linear ramp |
| Checkerboard | `checkerboard` | Black/white checker grid |
| Grey Ramp | `grey_ramp` | 16-step discrete grey levels |
| Resolution Chart | `resolution_chart` | Alignment/resolution test |

Clicking most items immediately loads the pattern at the default resolution (1920x1080). "Solid Color..." opens a simple prompt dialog (using the existing `showPrompt` utility) asking for an RGB color specification.

### Configuration Dialog (Phase 2, not MVP)

A future enhancement could add a modal dialog for configuring:
- Resolution presets: 720p, 1080p, 2K, UHD
- Custom width/height
- Frame count (for multi-frame procedural "clips")
- Pattern-specific parameters (cell size, step count, gradient direction)

For the initial implementation, sensible defaults are used (1920x1080, 1 frame, default pattern parameters).

## Implementation Steps

### Step 1: Add New Pattern Generators

**File:** `/src/nodes/sources/ProceduralSourceNode.ts`

1. Add `EBU_BARS_100` constant array and `generateEBUBars()` function
2. Add `generateCheckerboard()` function with `cellSize`, `colorA`, `colorB` params
3. Add `generateGreyRamp()` function with `steps` and `direction` params
4. Add `generateResolutionChart()` function with line-drawing helpers
5. Extend `PatternName` type to include new pattern names
6. Extend `MovieProcParams` interface with new fields (`cellSize`, `colorA`, `colorB`, `steps`)
7. Update `parseMovieProc()` to parse new parameters from URLs
8. Update `validPatterns` array in `parseMovieProc()` to accept new pattern names
9. Update `generatePattern()` switch statement to dispatch to new generators
10. Export new generator functions

### Step 2: Add Tests for New Patterns

**File:** `/src/nodes/sources/ProceduralSourceNode.test.ts`

Add test suites for:
- `generateEBUBars`: correct bar colors at 100%, correct dimensions, alpha = 1.0
- `generateCheckerboard`: alternating cells, custom colors, custom cell size, edge cases
- `generateGreyRamp`: correct step values, step boundaries, both directions
- `generateResolutionChart`: correct dimensions, crosshair presence, border frame
- `parseMovieProc`: new pattern parsing, new parameter parsing

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

  const source: MediaSource = {
    type: 'image',
    name: `${pattern} (${width}x${height})`,
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

In `renderImage()`, add a check for `proceduralSourceNode` alongside the existing `fileSourceNode` checks. Insert after the `fileSourceNode` block (around line 1415):

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

Add a helper for the 2D fallback path:

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

Also update the HDR detection logic (around line 1288) to recognize procedural sources:

```typescript
const isCurrentHDR = source?.fileSourceNode?.isHDR() === true
  || source?.videoSourceNode?.isHDR() === true
  || source?.proceduralSourceNode != null;  // float32 = HDR path
```

And update the `hdrFileSource` assignment (around line 1430):

```typescript
const hdrProceduralSource = source?.proceduralSourceNode ?? null;
```

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
  { value: 'gradient', label: 'Gradient' },
  { value: 'checkerboard', label: 'Checkerboard' },
  { value: 'grey_ramp', label: 'Grey Ramp' },
  { value: 'resolution_chart', label: 'Resolution Chart' },
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

Handler method:

```typescript
private async handleProceduralSource(pattern: string): Promise<void> {
  if (pattern === 'solid') {
    const colorStr = await showPrompt(
      'Enter RGB color (0-1 range, e.g. "1 0 0" for red):',
      { defaultValue: '0.5 0.5 0.5', title: 'Solid Color' }
    );
    if (!colorStr) return;
    const parts = colorStr.split(/\s+/).map(Number);
    const color: [number, number, number, number] = [
      parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1
    ];
    this.session.loadProceduralSource('solid', { color });
  } else {
    this.session.loadProceduralSource(pattern as PatternName);
  }
  this.emit('fileLoaded', undefined);
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

### Step 9: Session Serialization (GTO)

**File:** `/src/core/session/SessionGTOExporter.ts`

When serializing sources, if a `proceduralSourceNode` is present, serialize the movieproc URL and pattern parameters. On load, detect `RVMovieProc` nodes and re-create the procedural source.

**File:** `/src/core/session/GTOGraphLoader.ts`

When loading GTO data that contains `RVMovieProc` node entries, instantiate `ProceduralSourceNode` and call `loadFromMovieProc()` with the stored URL.

### Step 10: Disposal

**File:** `/src/core/session/SessionMedia.ts` and `/src/core/session/MediaManager.ts`

In `dispose()`, add cleanup for procedural sources:

```typescript
if (source.proceduralSourceNode) {
  source.proceduralSourceNode.dispose();
}
```

### Step 11: API Exposure

**File:** `/src/api/MediaAPI.ts`

Add `loadProceduralSource()` and `loadMovieProc()` to the public API, delegating to session methods.

## Files to Create/Modify

### Files to Modify

| File | Changes |
|------|---------|
| `/src/nodes/sources/ProceduralSourceNode.ts` | Add 4 new generator functions, extend `PatternName`, extend `MovieProcParams`, extend parser and dispatcher, add new `loadPattern` options |
| `/src/nodes/sources/ProceduralSourceNode.test.ts` | Add test suites for EBU bars, checkerboard, grey ramp, resolution chart, extended parsing |
| `/src/core/types/session.ts` | No change needed (procedural uses `'image'` type) |
| `/src/core/session/Session.ts` | Add `proceduralSourceNode` to `MediaSource` interface, add `loadProceduralSource()` and `loadMovieProc()` public methods, import `ProceduralSourceNode` |
| `/src/core/session/SessionMedia.ts` | Add `loadProceduralSource()` and `loadMovieProc()` methods, import node, add disposal logic |
| `/src/core/session/MediaManager.ts` | Add `loadProceduralSource()` and `loadMovieProc()` methods, import node, add disposal logic |
| `/src/ui/components/layout/HeaderBar.ts` | Add Sources dropdown button and `handleProceduralSource()` handler, import DropdownMenu |
| `/src/ui/components/Viewer.ts` | Add rendering path for `proceduralSourceNode`, handle in HDR detection, add fallback canvas helper |
| `/src/core/session/SessionGTOExporter.ts` | Serialize `ProceduralSourceNode` data |
| `/src/core/session/GTOGraphLoader.ts` | Deserialize and instantiate `ProceduralSourceNode` from GTO data |
| `/src/api/MediaAPI.ts` | Expose `loadProceduralSource()` and `loadMovieProc()` in public API |
| `/src/handlers/sourceLoadedHandlers.ts` | Handle transfer function detection for procedural sources (sRGB by default) |

### Files to Create

None. All implementation fits within existing files.

### Test Files to Modify

| File | Changes |
|------|---------|
| `/src/nodes/sources/ProceduralSourceNode.test.ts` | Add tests for new generators and parser extensions |
| `/src/ui/components/layout/HeaderBar.test.ts` | Add tests for Sources dropdown menu creation and pattern selection |
| `/src/core/session/SessionMedia.test.ts` | Add tests for `loadProceduralSource()` method |
| `/src/core/session/Session.media.test.ts` | Add tests for session-level procedural source loading |

## Risks

### 1. Float32 Rendering Path Assumptions

**Risk:** The viewer's HDR WebGL path (`renderHDRWithWebGL`) may make assumptions specific to `FileSourceNode` or `VideoSourceNode` that fail for procedural sources (e.g., checking `isHDR()`, transfer function metadata).

**Mitigation:** Procedural sources use `dataType: 'float32'` which the renderer already handles. The `isHDRContent()` function in `Renderer.ts` returns `true` for `float32` data, so texture upload will use `gl.RGBA32F`. Transfer function defaults to sRGB (no EOTF needed since values are already linear). Test with the existing SMPTE bars pattern first before adding new patterns.

### 2. Memory Usage for Large Resolutions

**Risk:** A 4K (3840x2160) float32 RGBA image is 3840 * 2160 * 4 * 4 = ~127 MB. Users could create very large procedural sources.

**Mitigation:** Apply the existing `ImageLimits` validation (`/src/config/ImageLimits.ts`) to procedural source resolution. Cap maximum at the same limit used for file sources. The default 1920x1080 is ~32 MB which is reasonable.

### 3. Pattern Accuracy (SMPTE/EBU Standards)

**Risk:** Professional users expect color bar patterns to match broadcast standards exactly. The existing SMPTE bars use simplified 75% values without the standard bottom-row pluge/sub-carrier patterns.

**Mitigation:** For the MVP, the simplified patterns are acceptable and match the desktop OpenRV movieproc behavior. Document that these are approximate test patterns, not ITU-R BT.2111 compliance targets. A future enhancement could add a full SMPTE RP 219 pattern with the complete three-row layout (75% bars, reverse bars + pluge, pluge + black).

### 4. Viewer Rendering Path Complexity

**Risk:** The `renderImage()` method in `Viewer.ts` is already complex with multiple conditional branches for different source types. Adding another branch for procedural sources increases complexity.

**Mitigation:** The procedural source branch is structurally identical to the `fileSourceNode` HDR branch. It retrieves an `IPImage` and passes it to `renderHDRWithWebGL()`. The fallback is a simple `toImageData()` conversion. Keep the branch minimal and consider a future refactoring that unifies all `IPImage`-producing source types (file HDR, video HDR, procedural) behind a common interface.

### 5. No Font Rendering for Resolution Chart

**Risk:** The resolution test pattern cannot include text labels (frequency values, resolution identifiers) because the web app has no built-in bitmap font renderer for drawing text into Float32Array pixel buffers.

**Mitigation:** The resolution chart uses purely geometric elements (lines, circles, crosshairs, gratings). This is sufficient for visual alignment verification. Text overlay can be added later via a separate annotation/burn-in system if needed.

### 6. Serialization Backward Compatibility

**Risk:** Adding `proceduralSourceNode` to `MediaSource` and serializing it to GTO format could cause issues when loading older project files.

**Mitigation:** The field is optional on `MediaSource`. GTO deserialization should gracefully skip unknown node types. The `NodeFactory` already handles unknown types by returning `null` with a warning. Procedural sources serialized as `RVMovieProc` nodes with a `url` property can be re-created via `loadFromMovieProc()` on load.

### 7. Source Switching and A/B Compare

**Risk:** Procedural sources added via the menu need to integrate correctly with the A/B source compare system. The `ABCompareManager` auto-assigns source B when a second source is added.

**Mitigation:** Procedural sources flow through the standard `addSource()` path which already handles A/B auto-assignment. No special handling is needed. Test A/B compare with a procedural source as source A and a file as source B (and vice versa).
