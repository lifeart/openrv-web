# Plan 11: Fixed Scale Presets (1:1 through 8:1)

## Overview

Desktop OpenRV provides number keys 1-8 for zoom presets (1:1 through 8:1 magnification and corresponding reductions). The web version currently only supports fit-to-window and a 50% zoom via the `Digit0` key and ZoomControl dropdown (which offers Fit, 25%, 50%, 100%, 200%, 400%). This plan adds a complete set of fixed scale presets covering both magnification (1:1 through 8:1) and reduction (1:2 through 1:8), keyboard shortcuts, centering behavior, and a visual scale ratio indicator.

### Key Challenge

Keys `Digit1` through `Digit6` are already bound to tab switching (`tab.view` through `tab.qc`). Keys `Digit7` and `Digit8` are free but lack matching magnification counterparts. This creates a fundamental key conflict that must be resolved thoughtfully.

### Priority Note

**1:1 (100%) is the hero feature.** QC artists overwhelmingly use 1:1 for pixel-level inspection (noise, compression artifacts, edge aliasing, texture detail). The constant toggle between Fit and 1:1 is the bread-and-butter workflow. The keyboard shortcut for 1:1 must be the most ergonomic (Ctrl+1 achieves this). The dropdown should prominently include 1:1.

Usage tiers in practice:
1. **1:1 (100%)** and **Fit** -- constant toggling, the core QC workflow.
2. **1:2 (50%)** and **2:1 (200%)** -- quick overview vs. closer inspection.
3. **1:4 (25%)** and **4:1 (400%)** -- high-res plate overview / sub-pixel artifact hunting.
4. **3:1 through 8:1** and **1:3 through 1:8** -- rare, but included for desktop RV parity.

---

## Current State

### Zoom System Architecture

The zoom system is built on a **fitScale-multiplied model**:

- **`calculateDisplayDimensions()`** in `ViewerRenderingUtils.ts` computes:
  ```
  fitScale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight, 1)
  displayWidth = sourceWidth * fitScale * zoom
  ```
- A `zoom` of 1.0 means "fit to window" (or native size if smaller than container).
- A `zoom` of 2.0 means "2x the fit size", NOT necessarily 2:1 pixel ratio.
- **1:1 pixel ratio** requires `zoom = 1 / fitScale`. For a 4K image (3840x2160) in a 1280x720 container, fitScale = 0.333, so 1:1 zoom = 3.0.

### Zoom API Surface

| Layer | Method | Behavior |
|-------|--------|----------|
| `Viewer` | `smoothSetZoom(level)` | Animated zoom to level, resets pan to (0,0) |
| `Viewer` | `smoothFitToWindow()` | Animated zoom to 1.0 with pan (0,0) |
| `Viewer` | `smoothZoomTo(zoom, duration, panX?, panY?)` | Full animated zoom with target pan |
| `TransformManager` | `smoothZoomTo(...)` | Underlying animation engine with easeOutCubic |
| `TransformManager` | `setZoom(level)` | Instant zoom, resets pan |
| `ViewerInteraction` | `calculateZoomPan()` | Computes pan offset to keep a point stationary during zoom |

### ZoomControl Widget

`ZoomControl.ts` provides a dropdown with levels: `'fit' | 0.25 | 0.5 | 1 | 2 | 4`. These values are `zoom` multiplier values, NOT pixel ratios. Its `handleKeyboard()` method currently returns `false` for keys 1-4 (acknowledging the tab-switching conflict). It emits `zoomChanged` events consumed by `AppViewWiring.ts`.

**Important semantic issue**: The current dropdown labels "25%", "50%", "100%" etc. are zoom multiplier percentages (where 100% = fit to window). This conflicts with the universal industry convention (Nuke, RV, Flame, Photoshop, DaVinci Resolve) where "100%" means 1:1 pixel ratio. This must be resolved as part of this plan -- see Step 5.

### Keyboard System

- **`DEFAULT_KEY_BINDINGS`** in `KeyBindings.ts`: Maps action names to `KeyCombination` objects.
- **`KeyboardManager`**: Global keydown handler, supports contextual resolution via `ContextualKeyboardManager`.
- **`ContextualKeyboardManager`**: Resolves key conflicts by context (`'global'`, `'timeline'`, `'paint'`, `'viewer'`, `'panel'`, `'channel'`, `'transform'`).
- **`ActiveContextManager`**: Tracks which context is active; bindings in active context take priority over global.
- **`CustomKeyBindingsManager`**: localStorage-backed custom rebinding; merged with defaults via `getEffectiveCombo()`.
- **`AppKeyboardHandler`**: Registers all bindings from `DEFAULT_KEY_BINDINGS` with handlers from `buildActionHandlers()`.
- **Conflicting defaults mechanism**: `CONFLICTING_DEFAULTS` set in `AppKeyboardHandler` skips registration of certain actions whose default combos conflict.

### Current Tab Key Bindings

| Key | Action | Context |
|-----|--------|---------|
| `Digit1` | `tab.view` | global |
| `Digit2` | `tab.color` | global |
| `Digit3` | `tab.effects` | global |
| `Digit4` | `tab.transform` | global |
| `Digit5` | `tab.annotate` | global |
| `Digit6` | `tab.qc` | global |
| `Digit0` | `view.zoom50` | global (guarded by `tabBar.activeTab === 'view'`) |

### What the Viewer Exposes

- `getZoom(): number` -- current zoom multiplier
- `getDisplayWidth() / getDisplayHeight()` -- current display dimensions in logical pixels
- `sourceWidth / sourceHeight` -- available via internal context but not directly public
- `getContainerRect()` -- private, used inside Viewer

---

## Proposed Architecture

### Core Concept: Pixel Ratio vs Zoom Multiplier

The system needs to distinguish between:
- **Zoom multiplier** (`zoom`): The internal TransformManager value. `1.0` = fit to window.
- **Pixel ratio** (`N:1` or `1:N`): The ratio between source pixels and display pixels. `1:1` means one source pixel = one screen pixel.

The conversion formula:
```
zoomForRatio(ratio) = ratio / fitScale
where fitScale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight, 1)
```

**DPR note**: "1:1" means one source pixel per CSS/logical pixel, not per physical pixel. On Retina displays (DPR=2), source pixels will be rendered across 2x2 physical pixels. This matches desktop RV, Nuke, and DaVinci Resolve behavior and is the correct convention for professional review tools.

### Scale Presets

| Preset | Pixel Ratio | Label | Meaning |
|--------|-------------|-------|---------|
| 1:8 | 0.125 | 12.5% | 1 display pixel = 8 source pixels |
| 1:7 | ~0.143 | ~14.3% | 1 display pixel = 7 source pixels |
| 1:6 | ~0.167 | ~16.7% | 1 display pixel = 6 source pixels |
| 1:5 | 0.2 | 20% | 1 display pixel = 5 source pixels |
| 1:4 | 0.25 | 25% | 1 display pixel = 4 source pixels |
| 1:3 | ~0.333 | ~33.3% | 1 display pixel = 3 source pixels |
| 1:2 | 0.5 | 50% | 1 display pixel = 2 source pixels |
| 1:1 | 1.0 | 100% | Pixel-perfect |
| 2:1 | 2.0 | 200% | 2 display pixels per source pixel |
| 3:1 | 3.0 | 300% | 3 display pixels per source pixel |
| 4:1 | 4.0 | 400% | 4 display pixels per source pixel |
| 5:1 | 5.0 | 500% | 5 display pixels per source pixel |
| 6:1 | 6.0 | 600% | 6 display pixels per source pixel |
| 7:1 | 7.0 | 700% | 7 display pixels per source pixel |
| 8:1 | 8.0 | 800% | 8 display pixels per source pixel |

### Centering Strategy

When a scale preset is activated via keyboard shortcut, center on the image center (pan 0,0). This matches desktop RV's default behavior for keyboard-triggered scale presets.

> **Review Note (Nice to Have)**: A future iteration could add center-on-cursor behavior when the cursor is over the viewer canvas, using `calculateZoomPan()` from `ViewerInteraction.ts`. This is deferred from the initial implementation.

---

## Key Binding Strategy

### Option A: Ctrl+Number for Scale Presets (Recommended)

Use `Ctrl+1` through `Ctrl+8` for magnification presets and `Ctrl+Shift+1` through `Ctrl+Shift+8` for reduction presets. This avoids all conflicts with existing tab switching and is consistent with browser-style zoom idioms.

| Key | Action | Pixel Ratio |
|-----|--------|-------------|
| `Ctrl+1` | `view.zoom1to1` | 1:1 (100%) |
| `Ctrl+2` | `view.zoom2to1` | 2:1 (200%) |
| `Ctrl+3` | `view.zoom3to1` | 3:1 (300%) |
| `Ctrl+4` | `view.zoom4to1` | 4:1 (400%) |
| `Ctrl+5` | `view.zoom5to1` | 5:1 (500%) |
| `Ctrl+6` | `view.zoom6to1` | 6:1 (600%) |
| `Ctrl+7` | `view.zoom7to1` | 7:1 (700%) |
| `Ctrl+8` | `view.zoom8to1` | 8:1 (800%) |
| `Ctrl+Shift+2` | `view.zoom1to2` | 1:2 (50%) |
| `Ctrl+Shift+3` | `view.zoom1to3` | 1:3 (~33%) |
| `Ctrl+Shift+4` | `view.zoom1to4` | 1:4 (25%) |
| `Ctrl+Shift+5` | `view.zoom1to5` | 1:5 (20%) |
| `Ctrl+Shift+6` | `view.zoom1to6` | 1:6 (~17%) |
| `Ctrl+Shift+7` | `view.zoom1to7` | 1:7 (~14%) |
| `Ctrl+Shift+8` | `view.zoom1to8` | 1:8 (12.5%) |

**Rationale**:
- `Ctrl+S` and `Ctrl+C` are already used (quick export, copy frame), so `Ctrl+Number` is consistent as a "global command" modifier.
- No collision with tab switching (`Digit1-6` bare).
- `Ctrl+3`/`Ctrl+4` do not collide with existing `Alt+3`/`Alt+4` (layout presets).
- Browser zoom (`Ctrl+=`/`Ctrl+-`) uses different keys.

**Conflict check**: All `Ctrl+Digit1` through `Ctrl+Digit8` are free. All `Ctrl+Shift+Digit2` through `Ctrl+Shift+Digit8` are free (existing `Ctrl+Shift` combos use letters).

**Desktop RV divergence note**: Desktop RV uses bare `1-8` for magnification and `Shift+1-8` for reduction. This web version uses `Ctrl+N` and `Ctrl+Shift+N` due to tab-switching key conflicts. Users who prefer desktop RV behavior can rebind via the Custom Key Bindings dialog: rebind `tab.view` etc. away from `Digit1-6`, then bind `Digit1-8` to scale presets.

### Fallback: Custom Rebinding

Users who prefer bare number keys for zoom (like desktop OpenRV) can rebind via the Custom Key Bindings dialog. The existing `CustomKeyBindingsManager` supports this without any code changes. Users would rebind `tab.view` etc. to other keys, then bind `view.zoom1to1` etc. to `Digit1-8`.

---

## Implementation Steps

### Step 1: Add Scale Preset Calculator Utility

Create a pure function for converting between pixel ratios and zoom multipliers.

**File**: `src/ui/components/ScalePresets.ts` (new)

```typescript
/**
 * ScalePresets - Pixel-ratio-based zoom presets
 *
 * Converts between pixel ratios (1:1, 2:1, etc.) and the internal zoom
 * multiplier used by TransformManager. The zoom multiplier is relative to
 * fit-to-window scale, so 1:1 pixel ratio requires zoom = 1/fitScale.
 */

export interface ScalePreset {
  ratio: number;       // e.g. 1.0 for 1:1, 2.0 for 2:1, 0.5 for 1:2
  label: string;       // e.g. "1:1", "2:1", "1:2"
  percentage: string;  // e.g. "100%", "200%", "50%"
}

export const MAGNIFICATION_PRESETS: ScalePreset[] = [
  { ratio: 1, label: '1:1', percentage: '100%' },
  { ratio: 2, label: '2:1', percentage: '200%' },
  { ratio: 3, label: '3:1', percentage: '300%' },
  { ratio: 4, label: '4:1', percentage: '400%' },
  { ratio: 5, label: '5:1', percentage: '500%' },
  { ratio: 6, label: '6:1', percentage: '600%' },
  { ratio: 7, label: '7:1', percentage: '700%' },
  { ratio: 8, label: '8:1', percentage: '800%' },
];

export const REDUCTION_PRESETS: ScalePreset[] = [
  { ratio: 0.5,           label: '1:2', percentage: '50%' },
  { ratio: 1 / 3,         label: '1:3', percentage: '33.3%' },
  { ratio: 0.25,          label: '1:4', percentage: '25%' },
  { ratio: 0.2,           label: '1:5', percentage: '20%' },
  { ratio: 1 / 6,         label: '1:6', percentage: '16.7%' },
  { ratio: 1 / 7,         label: '1:7', percentage: '14.3%' },
  { ratio: 0.125,         label: '1:8', percentage: '12.5%' },
];

// IMPORTANT: Use toReversed() or spread+reverse to avoid mutating REDUCTION_PRESETS.
// Array.prototype.reverse() mutates in place, which would corrupt REDUCTION_PRESETS.
export const ALL_PRESETS: ScalePreset[] = [
  ...[...REDUCTION_PRESETS].reverse(),
  ...MAGNIFICATION_PRESETS,
];

/**
 * Maximum canvas dimension (CSS pixels) to prevent GPU buffer overflow.
 * Most GPUs support 16384; some support 32768. We use a conservative value.
 * At high zoom, display dimensions beyond this cap are achieved via CSS scaling.
 */
export const MAX_CANVAS_DIMENSION = 16384;

/**
 * Calculate the fitScale for a given source and container size.
 * This is the base scale at zoom=1 (fit to window).
 *
 * IMPORTANT: For rotated images, pass the effective (post-rotation) source
 * dimensions, not the raw source dimensions. When the image is rotated
 * 90 or 270 degrees, sourceWidth and sourceHeight should be swapped.
 */
export function calculateFitScale(
  sourceWidth: number,
  sourceHeight: number,
  containerWidth: number,
  containerHeight: number,
): number {
  if (sourceWidth <= 0 || sourceHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return 1;
  }
  return Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight, 1);
}

/**
 * Convert a pixel ratio to the internal zoom multiplier.
 * zoom = ratio / fitScale
 */
export function ratioToZoom(
  ratio: number,
  fitScale: number,
): number {
  if (fitScale <= 0) return ratio;
  return ratio / fitScale;
}

/**
 * Convert the internal zoom multiplier to an approximate pixel ratio.
 * ratio = zoom * fitScale
 */
export function zoomToRatio(
  zoom: number,
  fitScale: number,
): number {
  return zoom * fitScale;
}

/**
 * Format a pixel ratio as a human-readable label (e.g. "1:1", "2:1", "1:4").
 * For ratios >= 1, format as "N:1". For ratios < 1, format as "1:N".
 * Falls back to percentage for non-integer ratios.
 */
export function formatRatio(ratio: number): string {
  if (ratio >= 1) {
    if (Number.isInteger(ratio)) {
      return ratio === 1 ? '1:1' : `${ratio}:1`;
    }
    return `${Math.round(ratio * 100)}%`;
  }
  const inverse = 1 / ratio;
  if (Number.isInteger(inverse)) {
    return `1:${inverse}`;
  }
  return `${Math.round(ratio * 100)}%`;
}
```

### Step 2: Add `zoomChanged` Event to TransformManager

The ScaleRatioIndicator (Step 6), ZoomControl label updates (Step 9), and wiring (Step 8) all depend on being notified when zoom changes. Currently neither `TransformManager` nor `Viewer` emits such an event.

**File**: `src/ui/components/TransformManager.ts` (modify)

Add a `zoomChanged` callback or event:

```typescript
// Add to TransformManager class:
private onZoomChanged: ((zoom: number) => void) | null = null;

setOnZoomChanged(callback: ((zoom: number) => void) | null): void {
  this.onZoomChanged = callback;
}

// Emit at the end of smoothZoomTo() animation completion and in setZoom():
// In setZoom():
setZoom(level: number): void {
  this.zoom = level;
  this.panX = 0;
  this.panY = 0;
  this.onZoomChanged?.(level);
}

// In smoothZoomTo() -- at animation completion callback:
// ... existing animation code ...
// At completion:
this.onZoomChanged?.(targetZoom);
```

This event is consumed by the Viewer (Step 8) to update the ScaleRatioIndicator and ZoomControl.

### Step 3: Add Canvas Size Guard

At high magnification (e.g. 8:1 on a 4K image), `calculateDisplayDimensions()` can return dimensions exceeding GPU texture limits (e.g. 30720x17280). The GL path caps physical dimensions via `getMaxTextureSize()`, but the 2D canvas path in `resetCanvasFromHiDPI()` has no such cap, causing GPU allocation failures.

**File**: `src/ui/components/ViewerRenderingUtils.ts` (modify)

Add a cap to `calculateDisplayDimensions()`:

```typescript
import { MAX_CANVAS_DIMENSION } from './ScalePresets';

// After computing displayWidth and displayHeight, add:
const maxDim = MAX_CANVAS_DIMENSION;
if (displayWidth > maxDim || displayHeight > maxDim) {
  const scaleFactor = Math.min(maxDim / displayWidth, maxDim / displayHeight);
  displayWidth = Math.floor(displayWidth * scaleFactor);
  displayHeight = Math.floor(displayHeight * scaleFactor);
}
```

Alternatively, apply the cap in `setCanvasSize()` so both the GL and 2D paths are protected. The remaining magnification beyond the cap is achieved via CSS scaling on the container, which is cheap and produces the expected pixelated appearance at high zoom.

### Step 4: Add Viewer Methods for Scale-Preset Zoom

Extend the `Viewer` class with methods that compute the correct zoom multiplier from a pixel ratio.

**File**: `src/ui/components/Viewer.ts` (modify)

Add to public API:

```typescript
/**
 * Get the current fitScale (base scale at zoom=1).
 * Returns the ratio between display size and source size when fitting to window.
 *
 * IMPORTANT: Uses effective (post-rotation) source dimensions to account
 * for 90/270 degree rotation, where width and height are swapped.
 */
getFitScale(): number {
  const containerRect = this.getContainerRect();
  const { width: effectiveWidth, height: effectiveHeight } = this.getEffectiveDimensions();
  return calculateFitScale(
    effectiveWidth,
    effectiveHeight,
    containerRect.width,
    containerRect.height,
  );
}

/**
 * Get the current pixel ratio (source pixels per display pixel).
 */
getPixelRatio(): number {
  return zoomToRatio(this.transformManager.getZoom(), this.getFitScale());
}

/**
 * Smoothly zoom to a specific pixel ratio (e.g. 1.0 for 1:1, 2.0 for 2:1).
 * Centers on the image center (pan 0,0).
 *
 * Note: "1:1" means one source pixel per CSS/logical pixel, not per physical
 * pixel. On Retina displays, source pixels will span multiple physical pixels.
 * This matches desktop RV, Nuke, and DaVinci Resolve behavior.
 */
smoothSetPixelRatio(ratio: number): void {
  const fitScale = this.getFitScale();
  const targetZoom = ratioToZoom(ratio, fitScale);
  this.transformManager.smoothZoomTo(targetZoom, 200, 0, 0);
}

/**
 * Get the effective source image dimensions (post-rotation).
 * When rotated 90/270 degrees, width and height are swapped.
 */
getEffectiveDimensions(): { width: number; height: number } {
  // Use getEffectiveDimensions() from ViewerRenderingUtils.ts
  // which accounts for rotation transforms.
  return getEffectiveDimensions(this.sourceWidth, this.sourceHeight, this.rotation);
}
```

Also add to the `ActionViewer` interface in `KeyboardActionMap.ts`:
```typescript
smoothSetPixelRatio(ratio: number): void;
```

### Step 5: Update ZoomControl Dropdown to Use Pixel Ratio Semantics

The current ZoomControl dropdown labels use zoom multiplier percentages (100% = fit to window), which conflicts with the universal industry convention where 100% means 1:1 pixel ratio. This must be fixed to avoid confusion now that pixel-ratio-based scale presets are being introduced.

**File**: `src/ui/components/ZoomControl.ts` (modify)

1. Change the dropdown to emit **pixel ratio values** instead of zoom multiplier values. The "Fit" option remains special-cased.

2. Update `ZoomLevel` type:
   ```typescript
   // Values are now pixel ratios, except for 'fit' which is a zoom mode.
   export type ZoomLevel = 'fit' | 0.25 | 0.5 | 1 | 2 | 4;
   ```

3. Update dropdown labels to use pixel ratio notation:
   ```typescript
   // Dropdown items (manageable subset for casual users):
   // Fit, 1:4 (25%), 1:2 (50%), 1:1 (100%), 2:1 (200%), 4:1 (400%)
   ```

4. The "Fit" entry stays as-is. The numeric entries now represent pixel ratios and the wiring layer calls `viewer.smoothSetPixelRatio()` for them.

**File**: `src/AppViewWiring.ts` (modify)

Update the zoom change handler:
```typescript
// When ZoomControl emits a zoom level change:
if (level === 'fit') {
  viewer.smoothFitToWindow();
} else {
  // level is now a pixel ratio, not a zoom multiplier
  viewer.smoothSetPixelRatio(level);
}
```

### Step 6: Register Keyboard Bindings

**File**: `src/utils/input/KeyBindings.ts` (modify)

Add new entries to `DEFAULT_KEY_BINDINGS`:

```typescript
// Scale presets - magnification
'view.zoom1to1': {
  code: 'Digit1',
  ctrl: true,
  description: 'Zoom to 1:1 (100%) pixel ratio',
},
'view.zoom2to1': {
  code: 'Digit2',
  ctrl: true,
  description: 'Zoom to 2:1 (200%) pixel ratio',
},
'view.zoom3to1': {
  code: 'Digit3',
  ctrl: true,
  description: 'Zoom to 3:1 (300%) pixel ratio',
},
'view.zoom4to1': {
  code: 'Digit4',
  ctrl: true,
  description: 'Zoom to 4:1 (400%) pixel ratio',
},
'view.zoom5to1': {
  code: 'Digit5',
  ctrl: true,
  description: 'Zoom to 5:1 (500%) pixel ratio',
},
'view.zoom6to1': {
  code: 'Digit6',
  ctrl: true,
  description: 'Zoom to 6:1 (600%) pixel ratio',
},
'view.zoom7to1': {
  code: 'Digit7',
  ctrl: true,
  description: 'Zoom to 7:1 (700%) pixel ratio',
},
'view.zoom8to1': {
  code: 'Digit8',
  ctrl: true,
  description: 'Zoom to 8:1 (800%) pixel ratio',
},

// Scale presets - reduction
'view.zoom1to2': {
  code: 'Digit2',
  ctrl: true,
  shift: true,
  description: 'Zoom to 1:2 (50%) pixel ratio',
},
'view.zoom1to3': {
  code: 'Digit3',
  ctrl: true,
  shift: true,
  description: 'Zoom to 1:3 (~33%) pixel ratio',
},
'view.zoom1to4': {
  code: 'Digit4',
  ctrl: true,
  shift: true,
  description: 'Zoom to 1:4 (25%) pixel ratio',
},
'view.zoom1to5': {
  code: 'Digit5',
  ctrl: true,
  shift: true,
  description: 'Zoom to 1:5 (20%) pixel ratio',
},
'view.zoom1to6': {
  code: 'Digit6',
  ctrl: true,
  shift: true,
  description: 'Zoom to 1:6 (~17%) pixel ratio',
},
'view.zoom1to7': {
  code: 'Digit7',
  ctrl: true,
  shift: true,
  description: 'Zoom to 1:7 (~14%) pixel ratio',
},
'view.zoom1to8': {
  code: 'Digit8',
  ctrl: true,
  shift: true,
  description: 'Zoom to 1:8 (12.5%) pixel ratio',
},
```

### Step 7: Register Action Handlers

**File**: `src/services/KeyboardActionMap.ts` (modify)

Add to the `ActionViewer` interface:
```typescript
smoothSetPixelRatio(ratio: number): void;
```

Add to `buildActionHandlers()` return object:
```typescript
// -- Scale presets (magnification) -----------------------------------
'view.zoom1to1': () => viewer.smoothSetPixelRatio(1),
'view.zoom2to1': () => viewer.smoothSetPixelRatio(2),
'view.zoom3to1': () => viewer.smoothSetPixelRatio(3),
'view.zoom4to1': () => viewer.smoothSetPixelRatio(4),
'view.zoom5to1': () => viewer.smoothSetPixelRatio(5),
'view.zoom6to1': () => viewer.smoothSetPixelRatio(6),
'view.zoom7to1': () => viewer.smoothSetPixelRatio(7),
'view.zoom8to1': () => viewer.smoothSetPixelRatio(8),

// -- Scale presets (reduction) ----------------------------------------
'view.zoom1to2': () => viewer.smoothSetPixelRatio(0.5),
'view.zoom1to3': () => viewer.smoothSetPixelRatio(1 / 3),
'view.zoom1to4': () => viewer.smoothSetPixelRatio(0.25),
'view.zoom1to5': () => viewer.smoothSetPixelRatio(0.2),
'view.zoom1to6': () => viewer.smoothSetPixelRatio(1 / 6),
'view.zoom1to7': () => viewer.smoothSetPixelRatio(1 / 7),
'view.zoom1to8': () => viewer.smoothSetPixelRatio(0.125),
```

### Step 8: Add Visual Scale Ratio Indicator

**File**: `src/ui/components/ScaleRatioIndicator.ts` (new)

A small, non-interactive overlay element in the viewer that transiently displays the current pixel ratio when zoom changes. Similar to how video players show volume level as a brief overlay.

```typescript
/**
 * ScaleRatioIndicator - Transient overlay showing current pixel ratio
 *
 * Appears briefly (e.g. 1.5 seconds) in the bottom-right of the viewer
 * when zoom changes, showing labels like "1:1", "2:1", "50%", "Fit".
 */
export class ScaleRatioIndicator {
  private container: HTMLElement;
  private labelEl: HTMLElement;
  private fadeTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(parentContainer: HTMLElement) { /* ... */ }

  show(ratio: number, isFit: boolean): void { /* ... */ }

  dispose(): void { /* ... */ }
}
```

The indicator shows:
- "Fit" when zoom = 1.0 (fitScale mode)
- "1:1" / "2:1" / "1:2" etc. for exact integer ratios
- "150%" etc. for non-integer ratios

### Step 9: Wire ScaleRatioIndicator and ZoomControl to Zoom Changes

This step depends on the `zoomChanged` event added in Step 2.

**File**: `src/ui/components/Viewer.ts` (modify)

- Create a `ScaleRatioIndicator` instance in the Viewer constructor.
- Register a `zoomChanged` callback on `TransformManager`.
- When zoom changes, compute pixel ratio from `zoomToRatio(zoom, fitScale)` and pass to indicator.

**File**: `src/AppViewWiring.ts` (modify)

- After the existing zoom wiring, listen for viewer zoom changes to update the ZoomControl display label.
- The ZoomControl label should show both percentage and ratio for recognized presets, e.g. "1:1 (100%)".

### Step 10: Update ZoomControl Label to Show Pixel Ratio

**File**: `src/ui/components/ZoomControl.ts` (modify)

Add a method `updateFromViewer(zoom: number, fitScale: number)` that:
- Computes the pixel ratio from `zoom * fitScale`.
- Updates the button label to show the ratio, e.g. "1:1", "2:1", or percentage for non-integer ratios.
- Highlights the matching dropdown entry if one exists.

### Step 11: Update Shortcuts Dialog

**File**: `src/AppKeyboardHandler.ts` (modify)

Add a `SCALE PRESETS` category to the `categories` object in `showShortcutsDialog()`:

```typescript
'SCALE PRESETS': [
  'view.zoom1to1', 'view.zoom2to1', 'view.zoom3to1', 'view.zoom4to1',
  'view.zoom5to1', 'view.zoom6to1', 'view.zoom7to1', 'view.zoom8to1',
  'view.zoom1to2', 'view.zoom1to3', 'view.zoom1to4', 'view.zoom1to5',
  'view.zoom1to6', 'view.zoom1to7', 'view.zoom1to8',
],
```

### Step 12: Tests

**File**: `src/ui/components/ScalePresets.test.ts` (new)

```
- calculateFitScale: returns correct fitScale for various source/container combos
- ratioToZoom: converts 1:1 ratio to correct zoom for given fitScale
- ratioToZoom: converts 2:1 ratio to correct zoom
- ratioToZoom: converts 1:3 ratio to correct zoom
- zoomToRatio: round-trips correctly
- formatRatio: formats integer magnifications correctly
- formatRatio: formats integer reductions correctly
- formatRatio: formats non-integer ratios as percentages
- ALL_PRESETS does not mutate REDUCTION_PRESETS (verify order after access)
```

**File**: `src/ui/components/ScaleRatioIndicator.test.ts` (new)

```
- show: creates and displays indicator element
- show: formats 1:1 correctly
- show: formats non-integer ratio as percentage
- show: auto-fades after timeout
- show: replaces previous indicator on rapid calls
- dispose: cleans up DOM and timers
```

**File**: Update `src/services/KeyboardActionMap.test.ts`

```
- buildActionHandlers includes view.zoom1to1 through view.zoom8to1
- buildActionHandlers includes view.zoom1to2 through view.zoom1to8
- view.zoom1to1 calls viewer.smoothSetPixelRatio(1)
- view.zoom8to1 calls viewer.smoothSetPixelRatio(8)
- view.zoom1to3 calls viewer.smoothSetPixelRatio(1/3)
```

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/ui/components/ScalePresets.ts` | Scale preset definitions, fitScale calculation, ratio/zoom conversion, ratio formatting, MAX_CANVAS_DIMENSION constant |
| `src/ui/components/ScalePresets.test.ts` | Unit tests for ScalePresets |
| `src/ui/components/ScaleRatioIndicator.ts` | Transient overlay showing current pixel ratio |
| `src/ui/components/ScaleRatioIndicator.test.ts` | Unit tests for ScaleRatioIndicator |

### Modified Files

| File | Changes |
|------|---------|
| `src/ui/components/TransformManager.ts` | Add `zoomChanged` callback, emit on `setZoom()` and `smoothZoomTo()` completion |
| `src/ui/components/ViewerRenderingUtils.ts` | Add canvas dimension cap in `calculateDisplayDimensions()` using `MAX_CANVAS_DIMENSION` |
| `src/ui/components/Viewer.ts` | Add `getFitScale()` (using post-rotation dimensions), `getPixelRatio()`, `smoothSetPixelRatio()`, `getEffectiveDimensions()` methods; create and wire ScaleRatioIndicator |
| `src/utils/input/KeyBindings.ts` | Add 15 new `view.zoomNtoM` entries to `DEFAULT_KEY_BINDINGS` (8 magnification + 7 reduction) |
| `src/services/KeyboardActionMap.ts` | Add `smoothSetPixelRatio()` to `ActionViewer` interface; add 15 action handlers in `buildActionHandlers()` |
| `src/services/KeyboardActionMap.test.ts` | Add tests for new action handlers |
| `src/AppKeyboardHandler.ts` | Add `SCALE PRESETS` category to shortcuts dialog |
| `src/ui/components/ZoomControl.ts` | Change dropdown to emit pixel ratios instead of zoom multipliers; update labels to match industry convention; add `updateFromViewer()` method |
| `src/AppViewWiring.ts` | Wire viewer zoom changes to ZoomControl label update; update zoom handler to call `smoothSetPixelRatio()` for pixel ratio values |

---

## Risks

### 1. Key Binding Conflicts (Medium)

**Risk**: `Ctrl+1` through `Ctrl+8` may conflict with browser-native shortcuts on some platforms. Chrome uses `Ctrl+1-8` to switch browser tabs.

**Mitigation**: Web apps calling `e.preventDefault()` on keydown override browser behavior, which the KeyboardManager already does. Users in browser contexts may lose tab-switching ability when the app is focused. This is acceptable for a professional media review tool. Custom rebinding provides an escape hatch.

### 2. fitScale Instability During Resize (Low)

**Risk**: If the browser window is resized after a scale preset is applied, the pixel ratio drifts because fitScale changes but the zoom multiplier stays constant. A 1:1 preset applied at one window size becomes slightly off after resize.

**Mitigation**: This is inherent to the fitScale model and is consistent with how all current zoom presets behave. Desktop RV also exhibits this behavior -- it does not re-apply zoom presets on resize. A future enhancement could re-apply the preset on resize (storing the "last preset intention"), but this adds complexity and is not in scope for the initial implementation.

> **Review Note (Nice to Have)**: Store the "intended pixel ratio" and recompute zoom on resize. Deferred since desktop RV does not do this either.

### 3. Performance at High Magnification (Medium -- Mitigated)

**Risk**: At 8:1, a 4K image (3840x2160) would produce `displayWidth = sourceWidth * fitScale * zoom` = 3840 * 0.333 * 24 = 30,720 CSS pixels. On DPR=2, the physical canvas would be 61,440 pixels, exceeding GPU texture limits (typically 16,384 or 32,768).

**Mitigation (Implemented in Step 3)**: `calculateDisplayDimensions()` is modified to cap output at `MAX_CANVAS_DIMENSION` (16384) per dimension. The remaining magnification beyond the cap is applied via CSS scaling on the container, which is cheap and produces the expected pixelated appearance at high zoom. The GL path already caps via `getMaxTextureSize()`. The 2D path now also has a guard.

### 4. Zoom Multiplier vs Pixel Ratio Semantic Confusion (Medium -- Resolved)

**Risk**: The ZoomControl dropdown previously showed "100%" meaning "fit to window" (zoom multiplier = 1.0), while the industry convention and the new scale presets use "100%" to mean 1:1 pixel ratio. This dual-semantics problem would cause deep confusion.

**Mitigation (Implemented in Step 5)**: The ZoomControl dropdown is converted to emit pixel ratio values and use pixel-ratio-based labels, matching the universal convention in Nuke, RV, Flame, Photoshop, and DaVinci Resolve. The "Fit" entry remains as a special zoom mode. The wiring layer is updated to call `smoothSetPixelRatio()` for numeric values.

### 5. Mac Cmd+Number Conflicts (Low)

**Risk**: On macOS, `Cmd+1` through `Cmd+8` switch browser tabs (same as `Ctrl+1-8`). The KeyboardManager treats `metaKey` (Cmd) as `ctrl`, so `Cmd+1` maps to the same binding as `Ctrl+1`.

**Mitigation**: This is already how the KeyboardManager works for all Ctrl shortcuts. Professional users of media review tools accept that the tool captures keyboard shortcuts when focused. The Custom Key Bindings dialog allows remapping if needed.

### 6. Rotation Interaction (Medium -- Mitigated)

**Risk**: When the image is rotated 90/270 degrees, the effective source dimensions are swapped. Using raw `sourceWidth/sourceHeight` in `getFitScale()` would produce incorrect pixel ratios for rotated images.

**Mitigation (Implemented in Step 4)**: `getFitScale()` uses `getEffectiveDimensions()` which returns post-rotation dimensions, accounting for the 90/270 degree swap. The `calculateDisplayDimensions()` function in the render path already uses post-rotation dimensions, so this keeps behavior consistent.

---

## Review Notes (Deferred Items)

The following items from the expert review are acknowledged as valuable but deferred from the initial implementation:

| # | Item | Rationale for deferral |
|---|------|----------------------|
| 1 | **Center-on-cursor for keyboard presets** -- When cursor is over the viewer, center on cursor position instead of image center. | Desktop RV defaults to image center for keyboard presets. Cursor-centering is a polish feature. |
| 2 | **Re-apply preset on window resize** -- Store intended pixel ratio and recompute zoom when the window is resized. | Desktop RV does not do this. Adds state management complexity. |
| 3 | **Dedicated 1:1 toolbar button** -- A persistent button or double-click-to-1:1 gesture for the most-used preset. | Valuable for discoverability but requires toolbar UI design work. Could be added as a follow-up. |
| 4 | **Unify zoom50 semantics** -- Decide whether `Digit0` / `view.zoom50` should become a pixel ratio preset (1:2) or remain a zoom multiplier (0.5x fit). | Existing behavior is shipped. Changing it risks user confusion. Should be evaluated after scale presets are in use. |
| 5 | **Explicit DPR documentation** -- Add a code comment in `smoothSetPixelRatio()` stating that 1:1 means per-CSS-pixel, not per-physical-pixel. | Addressed inline in Step 4 code comments but could be expanded in developer docs. |
