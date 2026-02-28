# Plan 11: Fixed Scale Presets (1:1 through 8:1)

## Overview

Desktop OpenRV provides number keys 1-8 for zoom presets (1:1 through 8:1 magnification and corresponding reductions). The web version currently only supports fit-to-window and a 50% zoom via the `Digit0` key and ZoomControl dropdown (which offers Fit, 25%, 50%, 100%, 200%, 400%). This plan adds a complete set of fixed scale presets covering both magnification (1:1 through 8:1) and reduction (1:2 through 1:8), keyboard shortcuts, centering behavior, and a visual scale ratio indicator.

### Key Challenge

Keys `Digit1` through `Digit6` are already bound to tab switching (`tab.view` through `tab.qc`). Keys `Digit7` and `Digit8` are free but lack matching magnification counterparts. This creates a fundamental key conflict that must be resolved thoughtfully.

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

### Scale Presets

| Preset | Pixel Ratio | Label | Meaning |
|--------|-------------|-------|---------|
| 1:8 | 0.125 | 12.5% | 1 display pixel = 8 source pixels |
| 1:4 | 0.25 | 25% | 1 display pixel = 4 source pixels |
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

When a scale preset is activated:
1. **Default**: Center on the current view center (pan stays proportional to new zoom).
2. **With cursor**: If the cursor is over the viewer canvas, center on the cursor position using `calculateZoomPan()` from `ViewerInteraction.ts`.

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
| `Ctrl+Shift+4` | `view.zoom1to4` | 1:4 (25%) |
| `Ctrl+Shift+8` | `view.zoom1to8` | 1:8 (12.5%) |

**Rationale**:
- `Ctrl+S` and `Ctrl+C` are already used (quick export, copy frame), so `Ctrl+Number` is consistent as a "global command" modifier.
- No collision with tab switching (`Digit1-6` bare).
- `Ctrl+3`/`Ctrl+4` do not collide with existing `Alt+3`/`Alt+4` (layout presets).
- Browser zoom (`Ctrl+=`/`Ctrl+-`) uses different keys.

**Conflict check**: `Ctrl+Digit3` is not currently bound. `Ctrl+Digit4` is not currently bound. All `Ctrl+Digit1` through `Ctrl+Digit8` are free. `Ctrl+Shift+Digit2/4/8` are all free (existing `Ctrl+Shift` combos use letters).

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
  { ratio: 0.5,   label: '1:2', percentage: '50%' },
  { ratio: 0.25,  label: '1:4', percentage: '25%' },
  { ratio: 0.125, label: '1:8', percentage: '12.5%' },
];

export const ALL_PRESETS: ScalePreset[] = [
  ...REDUCTION_PRESETS.reverse(),
  ...MAGNIFICATION_PRESETS,
];

/**
 * Calculate the fitScale for a given source and container size.
 * This is the base scale at zoom=1 (fit to window).
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

### Step 2: Add Viewer Methods for Scale-Preset Zoom

Extend the `Viewer` class with methods that compute the correct zoom multiplier from a pixel ratio.

**File**: `src/ui/components/Viewer.ts` (modify)

Add to public API:

```typescript
/**
 * Get the current fitScale (base scale at zoom=1).
 * Returns the ratio between display size and source size when fitting to window.
 */
getFitScale(): number {
  const containerRect = this.getContainerRect();
  return calculateFitScale(
    this.sourceWidth,
    this.sourceHeight,
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
 * Centers on the view center (pan 0,0).
 */
smoothSetPixelRatio(ratio: number): void {
  const fitScale = this.getFitScale();
  const targetZoom = ratioToZoom(ratio, fitScale);
  this.transformManager.smoothZoomTo(targetZoom, 200, 0, 0);
}

/**
 * Get the source image dimensions.
 */
getSourceDimensions(): { width: number; height: number } {
  return { width: this.sourceWidth, height: this.sourceHeight };
}
```

Also add to the `ActionViewer` interface in `KeyboardActionMap.ts`:
```typescript
smoothSetPixelRatio(ratio: number): void;
```

### Step 3: Register Keyboard Bindings

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
'view.zoom1to4': {
  code: 'Digit4',
  ctrl: true,
  shift: true,
  description: 'Zoom to 1:4 (25%) pixel ratio',
},
'view.zoom1to8': {
  code: 'Digit8',
  ctrl: true,
  shift: true,
  description: 'Zoom to 1:8 (12.5%) pixel ratio',
},
```

### Step 4: Register Action Handlers

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
'view.zoom1to4': () => viewer.smoothSetPixelRatio(0.25),
'view.zoom1to8': () => viewer.smoothSetPixelRatio(0.125),
```

### Step 5: Update ZoomControl Dropdown

**File**: `src/ui/components/ZoomControl.ts` (modify)

1. Expand `ZoomLevel` type to include more presets:
   ```typescript
   export type ZoomLevel = 'fit' | 0.125 | 0.25 | 0.5 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
   ```

2. Add entries to `ZOOM_LEVELS` array (the dropdown items). Keep it manageable -- show Fit, 25%, 50%, 100%, 200%, 400%, 800% in the dropdown (matching common usage). The full set of presets is accessible via keyboard only.

3. The dropdown still emits `zoomChanged` with the zoom multiplier value (not the pixel ratio). The wiring in `AppViewWiring.ts` calls `viewer.smoothSetZoom()` for these values, which sets the zoom multiplier directly. **Important**: The dropdown values are zoom multiplier values (where 1 = fit), NOT pixel ratios. To unify behavior:
   - Add a new event `pixelRatioChanged` to ZoomControl that emits pixel ratio values.
   - Or convert in the wiring layer. The recommended approach is to keep the dropdown emitting raw zoom multiplier values for backward compatibility, and add a separate "Scale" indicator that shows the pixel ratio. This avoids changing the meaning of existing zoom values.

**Alternative (simpler)**: Keep the ZoomControl as-is. It already has 100%, 200%, 400%. The keyboard shortcuts are the primary entry point for precise pixel-ratio presets. The ZoomControl dropdown serves casual users who click a dropdown.

### Step 6: Add Visual Scale Ratio Indicator

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

### Step 7: Update Shortcuts Dialog

**File**: `src/AppKeyboardHandler.ts` (modify)

Add a `SCALE PRESETS` category to the `categories` object in `showShortcutsDialog()`:

```typescript
'SCALE PRESETS': [
  'view.zoom1to1', 'view.zoom2to1', 'view.zoom3to1', 'view.zoom4to1',
  'view.zoom5to1', 'view.zoom6to1', 'view.zoom7to1', 'view.zoom8to1',
  'view.zoom1to2', 'view.zoom1to4', 'view.zoom1to8',
],
```

### Step 8: Wire ScaleRatioIndicator to Viewer

**File**: `src/ui/components/Viewer.ts` (modify)

- Create a `ScaleRatioIndicator` instance in the Viewer constructor.
- Show the indicator whenever zoom changes (after animation completes or on instant set).
- Compute pixel ratio from `zoomToRatio(zoom, fitScale)` and pass to indicator.

Alternatively, wire it in `AppViewWiring.ts` by listening to TransformManager zoom changes.

### Step 9: Update ZoomControl Label to Show Pixel Ratio

**File**: `src/ui/components/ZoomControl.ts` (modify)

Add a method `updateFromViewer(zoom: number, fitScale: number)` that:
- Computes the pixel ratio from `zoom * fitScale`.
- Updates the button label to show both percentage and ratio, e.g. "100% (1:1)".
- Or shows just the ratio for recognized presets.

This requires the wiring layer to call this method when the viewer zoom changes.

**File**: `src/AppViewWiring.ts` (modify)

After the existing zoom wiring, add a listener for viewer zoom changes to update the ZoomControl display. This would require the Viewer or TransformManager to emit a zoom change event.

### Step 10: Tests

**File**: `src/ui/components/ScalePresets.test.ts` (new)

```
- calculateFitScale: returns correct fitScale for various source/container combos
- ratioToZoom: converts 1:1 ratio to correct zoom for given fitScale
- ratioToZoom: converts 2:1 ratio to correct zoom
- zoomToRatio: round-trips correctly
- formatRatio: formats integer magnifications correctly
- formatRatio: formats integer reductions correctly
- formatRatio: formats non-integer ratios as percentages
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
- buildActionHandlers includes view.zoom1to2, view.zoom1to4, view.zoom1to8
- view.zoom1to1 calls viewer.smoothSetPixelRatio(1)
- view.zoom8to1 calls viewer.smoothSetPixelRatio(8)
```

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/ui/components/ScalePresets.ts` | Scale preset definitions, fitScale calculation, ratio/zoom conversion, ratio formatting |
| `src/ui/components/ScalePresets.test.ts` | Unit tests for ScalePresets |
| `src/ui/components/ScaleRatioIndicator.ts` | Transient overlay showing current pixel ratio |
| `src/ui/components/ScaleRatioIndicator.test.ts` | Unit tests for ScaleRatioIndicator |

### Modified Files

| File | Changes |
|------|---------|
| `src/ui/components/Viewer.ts` | Add `getFitScale()`, `getPixelRatio()`, `smoothSetPixelRatio()`, `getSourceDimensions()` methods; create and wire ScaleRatioIndicator |
| `src/utils/input/KeyBindings.ts` | Add 11 new `view.zoomNtoM` entries to `DEFAULT_KEY_BINDINGS` |
| `src/services/KeyboardActionMap.ts` | Add `smoothSetPixelRatio()` to `ActionViewer` interface; add 11 action handlers in `buildActionHandlers()` |
| `src/services/KeyboardActionMap.test.ts` | Add tests for new action handlers |
| `src/AppKeyboardHandler.ts` | Add `SCALE PRESETS` category to shortcuts dialog |
| `src/ui/components/ZoomControl.ts` | Optionally extend `ZoomLevel` type and dropdown items; add method to update label from viewer state |
| `src/AppViewWiring.ts` | Wire viewer zoom changes to ZoomControl label update |

---

## Risks

### 1. Key Binding Conflicts (Medium)

**Risk**: `Ctrl+1` through `Ctrl+8` may conflict with browser-native shortcuts on some platforms. Chrome uses `Ctrl+1-8` to switch browser tabs.

**Mitigation**: Web apps calling `e.preventDefault()` on keydown override browser behavior, which the KeyboardManager already does. Users in browser contexts may lose tab-switching ability when the app is focused. This is acceptable for a professional media review tool. Custom rebinding provides an escape hatch.

### 2. fitScale Instability During Resize (Low)

**Risk**: If the browser window is resized after a scale preset is applied, the pixel ratio drifts because fitScale changes but the zoom multiplier stays constant. A 1:1 preset applied at one window size becomes slightly off after resize.

**Mitigation**: This is inherent to the fitScale model and is consistent with how all current zoom presets (50%, 100%, etc.) behave. A future enhancement could re-apply the preset on resize, but that would require storing the "last preset intention" which adds complexity. Not in scope for this plan.

### 3. Performance at High Magnification (Low)

**Risk**: At 8:1, a 4K image (3840x2160) would render at 30720x17280 display pixels. The canvas and WebGL framebuffer may hit size limits or cause GPU memory issues.

**Mitigation**: The existing `calculateWheelZoom()` already caps zoom at `maxZoom = 10`. The TransformManager does not enforce limits on `smoothZoomTo()`, but the value 8/fitScale for a 4K image in a 1280x720 container is ~24, which would exceed the maxZoom cap. However, the maxZoom cap only applies to wheel zoom, not programmatic zoom. Two options:
- (a) Let it zoom to 8:1 regardless -- the canvas CSS sizing handles display, and the internal canvas resolution stays at source resolution. The browser will upscale via CSS transform, which is cheap.
- (b) Add a maxZoom guard to `smoothZoomTo()`. Risk: could silently clamp presets without feedback.

**Recommendation**: Option (a) is correct. The `displayWidth/Height` computed by `calculateDisplayDimensions()` is the actual canvas resolution. At 8:1, this would be `sourceWidth * fitScale * zoom` = e.g., 3840 * 0.333 * 24 = 30,720. This is too large. But looking more carefully at the code: `displayWidth` is the CSS size of the canvas element, and the canvas internal resolution is set to `physicalWidth = displayWidth * dpr`. At DPR=2, this could be 61,440 pixels. This will fail.

**Revised mitigation**: The maximum safe canvas dimension is typically 16,384 or 32,768 pixels depending on GPU. The implementation should either:
- Clamp the canvas resolution and let CSS upscaling handle the remaining magnification (the image will look pixelated, which is expected at high zoom).
- Or cap the pixel ratio at a level where the canvas stays within safe bounds.

The cleanest approach is to separate the concept of canvas resolution from display size at high zoom. The canvas stays at source resolution (or some capped maximum), and the CSS transform scales it up for display. This is already partially how the system works (the `canvasContainer` gets `translate()` for pan) -- extending it with `scale()` for zoom would make high magnification efficient. However, this is a significant architectural change and should be noted as a **future optimization**, not a blocker for the initial implementation.

For the initial implementation, the `calculateDisplayDimensions()` function could be modified to cap the output at a maximum canvas size (e.g., 8192 or 16384 per dimension), and the remaining zoom would be applied via CSS scaling on the container. This ensures the canvas never exceeds GPU limits while still achieving the desired pixel ratio visually.

### 4. Zoom Multiplier vs Pixel Ratio Confusion (Low)

**Risk**: The ZoomControl dropdown shows values like "100%" and "200%" which are zoom multiplier percentages (where 100% = fit to window), NOT pixel ratios. Adding scale presets that use pixel ratios ("1:1 = 100%") creates semantic confusion.

**Mitigation**: The ScaleRatioIndicator overlay clearly uses "N:M" notation to distinguish pixel ratio from zoom percentage. The ZoomControl dropdown could be updated to show both, or the percentage label could include a parenthetical note. Long-term, aligning the dropdown to use pixel ratios would be cleaner.

### 5. Mac Cmd+Number Conflicts (Low)

**Risk**: On macOS, `Cmd+1` through `Cmd+8` switch browser tabs (same as `Ctrl+1-8`). The KeyboardManager treats `metaKey` (Cmd) as `ctrl`, so `Cmd+1` maps to the same binding as `Ctrl+1`.

**Mitigation**: This is already how the KeyboardManager works for all Ctrl shortcuts. Professional users of media review tools accept that the tool captures keyboard shortcuts when focused. The Custom Key Bindings dialog allows remapping if needed.
