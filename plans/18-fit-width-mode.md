# Plan 18: Fit Width Mode (and Fit Height Mode)

## Overview

Desktop OpenRV provides W to fit image width to the viewport. The web version currently only supports a single "Fit" mode that scales the image to fit both dimensions (equivalent to `Math.min(containerW/sourceW, containerH/sourceH, 1)`). This plan adds three distinct fit modes:

1. **Fit All** (existing) -- scales so the entire image is visible, letterboxed if needed.
2. **Fit Width** -- scales so the image fills the container width; the user can pan vertically.
3. **Fit Height** -- scales so the image fills the container height; the user can pan horizontally.

A keyboard shortcut (W) cycles through the three modes. The active fit mode is shown as a visual indicator in the ZoomControl dropdown and persists across window resizes. Manual zoom/pan exits the fit mode.

---

## Current State

### How "Fit" Works Today

1. **`calculateDisplayDimensions()`** in `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.ts` computes the display size:
   ```ts
   const fitScale = Math.min(
     containerWidth / sourceWidth,
     containerHeight / sourceHeight,
     1
   );
   const scale = fitScale * zoom;
   ```
   The `zoom` field on `TransformManager` acts as a multiplier on top of the fit scale. When zoom = 1, the image fits both dimensions.

2. **`TransformManager`** (`/Users/lifeart/Repos/openrv-web/src/ui/components/TransformManager.ts`) owns `panX`, `panY`, and `zoom`. Its `fitToWindow()` simply resets zoom to 1 and pan to (0, 0).

3. **`Viewer.fitToWindow()`** delegates to `TransformManager.fitToWindow()` then schedules a render. `Viewer.smoothFitToWindow()` does the same with an animation.

4. **`ZoomControl`** (`/Users/lifeart/Repos/openrv-web/src/ui/components/ZoomControl.ts`) has a `ZoomLevel` type of `'fit' | 0.25 | 0.5 | 1 | 2 | 4`. It emits `zoomChanged` with the selected level.

5. **`AppViewWiring`** (`/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts`) listens to `zoomChanged`:
   ```ts
   if (zoom === 'fit') {
     viewer.smoothFitToWindow();
   } else {
     viewer.smoothSetZoom(zoom);
   }
   ```

6. **`KeyBindings`** (`/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts`):
   - `view.fitToWindow` -> `KeyF` -> "Fit image to window"
   - `view.toggleWaveform` -> `KeyW` -> "Toggle waveform scope"
   - `view.cycleWipeMode` -> `Shift+W` -> "Cycle wipe mode"
   The plain W key is currently bound to `view.toggleWaveform`/`panel.waveform`.

7. **`calculateDisplayDimensions()`** is the single bottleneck for sizing. It is called from `Viewer.renderImage()` (line ~1476) and from placeholder mode. The function takes `sourceWidth`, `sourceHeight`, `containerWidth`, `containerHeight`, and `zoom`, and returns `{ width, height }`.

8. **Resize handling**: `Viewer` uses a `ResizeObserver` on the container (line ~700). On resize it invalidates layout cache and schedules a render. Because `calculateDisplayDimensions()` reads the container dimensions on each render, the fit mode implicitly re-fits on resize.

9. **Pan clamping**: Currently there is no clamping -- the user can pan freely in any direction regardless of fit mode. The `ViewerInputHandler.onPointerMove` adds `dx`/`dy` directly to `panX`/`panY`.

10. **Network sync state** (`/Users/lifeart/Repos/openrv-web/src/network/SyncStateManager.ts`): `ViewState` has `{ panX, panY, zoom, channelMode }` but no fit mode field.

11. **API** (`/Users/lifeart/Repos/openrv-web/src/api/ViewAPI.ts`): `ViewerProvider` interface has `fitToWindow()`, `setZoom()`, `getZoom()`, `setPan()`, `getPan()`. No fit-mode concept.

### Key Insight: Fit Mode as a Constraint, not a Zoom Level

The current "fit" is really just zoom = 1 with pan = (0, 0). The `calculateDisplayDimensions` function does the actual fitting. A "Fit Width" mode needs a **different fit scale formula**: `containerWidth / sourceWidth` instead of `Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight, 1)`. Importantly, the fit mode must be **re-evaluated on every render** so that resizing the window re-fits.

---

## Proposed Architecture

### New Type: `FitMode`

```ts
export type FitMode = 'all' | 'width' | 'height';
```

This replaces the implicit "fit means zoom=1" behavior. The fit mode is stored on the `TransformManager` and controls which scale formula `calculateDisplayDimensions` uses.

### Updated `ZoomLevel`

```ts
export type ZoomLevel = 'fit' | 'fit-width' | 'fit-height' | 0.25 | 0.5 | 1 | 2 | 4;
```

The `'fit'` value remains backward-compatible. `'fit-width'` and `'fit-height'` are new.

### Flow

```
User presses W key
  -> buildActionHandlers['view.cycleFitMode'] fires
  -> viewer.cycleFitMode()
  -> TransformManager: fitMode cycles 'all' -> 'width' -> 'height' -> 'all'
  -> TransformManager: pan reset, zoom reset to 1
  -> Viewer.scheduleRender()
  -> Viewer.render() -> renderImage()
  -> calculateDisplayDimensions(..., fitMode) uses new formula
  -> updateCanvasPosition() centers (or partially centers) the image
  -> visual indicator updates on ZoomControl
```

### Pan Constraint by Fit Mode

| Mode       | Pan X  | Pan Y  | Behavior                                    |
|------------|--------|--------|---------------------------------------------|
| `all`      | locked 0 | locked 0 | Image fits entirely; no pan needed          |
| `width`    | locked 0 | free   | Width fills viewport; vertical pan allowed  |
| `height`   | free   | locked 0 | Height fills viewport; horizontal pan allowed |
| (manual zoom) | free | free | No fit mode active, free pan in all directions |

When in a fit mode, the locked axis pan is forced to 0 on each render. The free axis allows panning to view the overflowing dimension.

### Pan Clamping

In fit-width mode, vertical pan should be clamped so the user cannot pan the image entirely off-screen. The clamping formula:

```ts
const maxPanY = Math.max(0, (displayHeight - containerHeight) / 2);
panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
```

Similarly for fit-height mode on the horizontal axis.

### Exiting Fit Mode

Any manual zoom action (scroll wheel, pinch zoom, ZoomControl selection of a numeric level) should exit the active fit mode and return to free zoom/pan. This matches desktop OpenRV behavior where fit modes are "sticky until overridden."

---

## Implementation Steps

### Step 1: Add FitMode to TransformManager

**File**: `/Users/lifeart/Repos/openrv-web/src/ui/components/TransformManager.ts`

1. Add a `_fitMode: FitMode | null` property (null = no active fit, free zoom).
2. Add getter/setter: `get fitMode()`, `set fitMode()`.
3. Add `fitToWidth()`, `fitToHeight()` methods that set `_fitMode`, reset pan/zoom.
4. Update `fitToWindow()` to set `_fitMode = 'all'`.
5. Add `cycleFitMode()` that cycles `null` -> `'all'` -> `'width'` -> `'height'` -> `'all'`. If currently in no fit mode, start with 'all'. If currently in a fit mode, cycle to the next.
6. Add `clearFitMode()` called when manual zoom/pan breaks the fit constraint.
7. Update `setZoom()` to call `clearFitMode()` since a manual zoom overrides fit.
8. Add `smoothFitToWidth()`, `smoothFitToHeight()` that animate to fit then set the mode.

### Step 2: Update calculateDisplayDimensions

**File**: `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.ts`

1. Add an optional `fitMode` parameter (default `'all'` for backward compatibility).
2. Change the fit scale calculation:
   ```ts
   let fitScale: number;
   switch (fitMode) {
     case 'width':
       fitScale = Math.min(containerWidth / sourceWidth, 1);
       break;
     case 'height':
       fitScale = Math.min(containerHeight / sourceHeight, 1);
       break;
     case 'all':
     default:
       fitScale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight, 1);
       break;
   }
   ```
   Note: the `Math.min(..., 1)` cap prevents upscaling images smaller than the viewport. For fit-width/fit-height modes, we may want to remove this cap (images narrower than the viewport in fit-width mode should scale up to fill width). Decision: **do NOT cap at 1** for fit-width/fit-height, matching desktop OpenRV behavior where fit-width always fills the width.

   Updated formula for width/height modes:
   ```ts
   case 'width':
     fitScale = containerWidth / sourceWidth;
     break;
   case 'height':
     fitScale = containerHeight / sourceHeight;
     break;
   ```

### Step 3: Update Viewer to Pass FitMode Through

**File**: `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts`

1. In `renderImage()`, pass `this.transformManager.fitMode` to `calculateDisplayDimensions()`.
2. In `updateCanvasPosition()`, apply pan clamping based on active fit mode:
   - If `fitMode === 'all'`: force panX = 0, panY = 0.
   - If `fitMode === 'width'`: force panX = 0, clamp panY.
   - If `fitMode === 'height'`: force panY = 0, clamp panX.
3. Add `cycleFitMode()`, `fitToWidth()`, `fitToHeight()` public methods that delegate to TransformManager and schedule render.
4. Add `smoothFitToWidth()`, `smoothFitToHeight()` public methods.
5. Add `getFitMode()` public method.

### Step 4: Update ZoomControl

**File**: `/Users/lifeart/Repos/openrv-web/src/ui/components/ZoomControl.ts`

1. Expand `ZoomLevel` type to include `'fit-width'` and `'fit-height'`.
2. Add these to the `ZOOM_LEVELS` array:
   ```ts
   { value: 'fit', label: 'Fit All' },
   { value: 'fit-width', label: 'Fit Width' },
   { value: 'fit-height', label: 'Fit Height' },
   ```
3. Update `updateButtonLabel()` to show "Fit W" for fit-width and "Fit H" for fit-height.
4. Consider using a compact label to avoid overflowing the toolbar: "Fit", "W-Fit", "H-Fit".

### Step 5: Update AppViewWiring

**File**: `/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts`

1. Update the `zoomChanged` listener:
   ```ts
   if (zoom === 'fit') {
     viewer.smoothFitToWindow();
   } else if (zoom === 'fit-width') {
     viewer.smoothFitToWidth();
   } else if (zoom === 'fit-height') {
     viewer.smoothFitToHeight();
   } else {
     viewer.smoothSetZoom(zoom);
   }
   ```

### Step 6: Add Keyboard Shortcut for Cycling

**File**: `/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts`

1. Since `KeyW` is currently bound to `view.toggleWaveform` / `panel.waveform`, we have two options:
   - **Option A**: Reassign plain W to fit-mode cycling and move waveform to a different key.
   - **Option B**: Use a modifier (e.g., `Ctrl+W`) for fit-mode cycling.
   - **Recommendation**: Use **Option A** to match desktop OpenRV convention. Move waveform toggle from `KeyW` to keep it as a secondary binding or shift it. Since `panel.waveform` duplicates `view.toggleWaveform` and waveform is also accessible from the toolbar, reassigning W is acceptable.

   Add new binding:
   ```ts
   'view.cycleFitMode': {
     code: 'KeyW',
     description: 'Cycle fit mode (All / Width / Height)'
   },
   ```

   Move the existing `view.toggleWaveform` from `KeyW` to a less-common key, or remove it (the `panel.waveform` duplicate already exists). Note: the W key duplication between `view.toggleWaveform` and `panel.waveform` means both currently point to the same action. We should migrate them.

   **Alternative**: If changing the W key mapping is too disruptive, bind fit-mode cycling to a different key. However, W for "fit width" is the desktop OpenRV convention. The plan recommends adding `view.cycleFitMode` on `KeyW` and adding the waveform duplicate entry to the `CONFLICTING_DEFAULTS` set in `AppKeyboardHandler.ts`.

### Step 7: Wire Keyboard Action

**File**: `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts`

1. Add to `ActionViewer` interface:
   ```ts
   cycleFitMode(): void;
   ```

2. Add handler in `buildActionHandlers`:
   ```ts
   'view.cycleFitMode': () => viewer.cycleFitMode(),
   ```

### Step 8: Update Shortcuts Dialog Categories

**File**: `/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts`

1. Add `'view.cycleFitMode'` to the `'VIEW'` category array in `showShortcutsDialog()`.

### Step 9: Visual Indicator

When a fit mode is active, the user needs visual feedback. Two indicators:

1. **ZoomControl button label** already shows "Fit", "Fit W", or "Fit H" (from Step 4).

2. **Transient toast notification** (optional but recommended): Show a brief overlay text like "Fit Width" for ~1.5 seconds when the mode changes. This can be implemented as a small absolutely-positioned div inside the viewer container that fades out. This approach is consistent with other transient indicators in the codebase.

   **File**: `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts` -- add a `showFitModeIndicator(mode: FitMode)` private method.

### Step 10: Break Fit Mode on Manual Zoom/Pan

1. **Wheel zoom** (`ViewerInputHandler.onWheel`): After applying zoom, call `this.ctx.getTransformManager().clearFitMode()`. This is already implicit if `TransformManager.zoom` setter calls `clearFitMode()`.

2. **Pinch zoom** (`ViewerInputHandler.handlePinchZoom`): Same as above.

3. **ZoomControl numeric selection**: When a numeric zoom level is selected, the `setZoom()` call on TransformManager already clears fit mode (from Step 1).

4. **Panning should NOT break fit mode** -- panning is the expected interaction in fit-width/fit-height modes. Only zoom changes break it.

### Step 11: Network Sync Support

**File**: `/Users/lifeart/Repos/openrv-web/src/network/SyncStateManager.ts`

1. Add `fitMode: string | null` to the `ViewState` interface.
2. Update `DEFAULT_VIEW_STATE` to include `fitMode: null`.
3. This is a backward-compatible addition; older clients that do not send `fitMode` will default to `null` (no fit mode).

### Step 12: Public API Extension

**File**: `/Users/lifeart/Repos/openrv-web/src/api/ViewAPI.ts`

1. Add methods:
   ```ts
   fitToWidth(): void;
   fitToHeight(): void;
   getFitMode(): string | null;
   ```

2. Update `ViewerProvider` interface in `/Users/lifeart/Repos/openrv-web/src/api/types.ts`:
   ```ts
   fitToWidth(): void;
   fitToHeight(): void;
   getFitMode(): string | null;
   ```

### Step 13: Session Serialization

**File**: `/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts` (and related)

1. Optionally persist the fit mode in the session GTO data. This is low priority since fit mode is a display preference rather than session state. Could be stored in a `display.fitMode` field on the display transform.

### Step 14: Tests

Create or update the following test files:

1. **`/Users/lifeart/Repos/openrv-web/src/ui/components/TransformManager.test.ts`** -- Add tests for:
   - `fitToWidth()` sets fitMode to 'width', resets pan/zoom.
   - `fitToHeight()` sets fitMode to 'height', resets pan/zoom.
   - `cycleFitMode()` cycles correctly.
   - `clearFitMode()` resets fitMode to null.
   - `setZoom()` clears fitMode.

2. **`/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.test.ts`** -- Add tests for:
   - `calculateDisplayDimensions()` with `fitMode = 'width'` produces correct dimensions.
   - `calculateDisplayDimensions()` with `fitMode = 'height'` produces correct dimensions.
   - Backward compatibility: default `fitMode` behaves as before.

3. **`/Users/lifeart/Repos/openrv-web/src/ui/components/ZoomControl.test.ts`** -- Add tests for:
   - New zoom levels 'fit-width' and 'fit-height' are supported.
   - Button label updates correctly.
   - Keyboard handler for new keys (if any ZoomControl-local keys are added).

4. **`/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.test.ts`** -- Add test for `view.cycleFitMode` action handler.

5. **`/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.test.ts`** -- Add tests for new `fitToWidth()`, `fitToHeight()`, `getFitMode()` API methods.

---

## Files to Create/Modify

### Files to Modify

| File | Change |
|------|--------|
| `/Users/lifeart/Repos/openrv-web/src/ui/components/TransformManager.ts` | Add `FitMode` type, `_fitMode` state, `fitToWidth()`, `fitToHeight()`, `cycleFitMode()`, `clearFitMode()`, `smoothFitToWidth()`, `smoothFitToHeight()`. Update `setZoom()` to clear fit mode. |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.ts` | Add `fitMode` parameter to `calculateDisplayDimensions()`. Add width-only and height-only scaling formulas. |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts` | Pass fitMode to `calculateDisplayDimensions()`. Add pan clamping in `updateCanvasPosition()`. Add `cycleFitMode()`, `fitToWidth()`, `fitToHeight()`, `smoothFitToWidth()`, `smoothFitToHeight()`, `getFitMode()` public methods. Add transient fit-mode indicator. |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/ZoomControl.ts` | Expand `ZoomLevel` type. Add 'fit-width' and 'fit-height' to dropdown. Update button labels. |
| `/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts` | Handle 'fit-width' and 'fit-height' in `zoomChanged` listener. |
| `/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts` | Add `view.cycleFitMode` binding on `KeyW`. Reassign or annotate `view.toggleWaveform`/`panel.waveform` as conflicting. |
| `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts` | Add `cycleFitMode()` to `ActionViewer`. Add `view.cycleFitMode` handler. |
| `/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts` | Add `view.cycleFitMode` to VIEW shortcuts category. Optionally add `view.toggleWaveform` to `CONFLICTING_DEFAULTS`. |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts` | In `onWheel`, clear fit mode after zoom change. |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInteraction.ts` | Update `calculateZoomPan()` to be aware of fit mode for proper zoom-to-cursor behavior (or ensure TransformManager handles this). |
| `/Users/lifeart/Repos/openrv-web/src/network/SyncStateManager.ts` | Add `fitMode` to `ViewState` interface and default. |
| `/Users/lifeart/Repos/openrv-web/src/api/ViewAPI.ts` | Add `fitToWidth()`, `fitToHeight()`, `getFitMode()` methods. |
| `/Users/lifeart/Repos/openrv-web/src/api/types.ts` | Add `fitToWidth()`, `fitToHeight()`, `getFitMode()` to `ViewerProvider`. |

### Files to Create

None. All changes fit within existing files.

### Test Files to Modify

| File | Change |
|------|--------|
| `/Users/lifeart/Repos/openrv-web/src/ui/components/TransformManager.test.ts` | Add fit mode tests |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.test.ts` | Add `calculateDisplayDimensions` fit mode tests |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/ZoomControl.test.ts` | Add fit-width/fit-height zoom level tests |
| `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.test.ts` | Add `view.cycleFitMode` handler test |
| `/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.test.ts` | Add new API method tests |
| `/Users/lifeart/Repos/openrv-web/src/AppViewWiring.test.ts` | Add fit-width/fit-height wiring tests |
| `/Users/lifeart/Repos/openrv-web/src/network/SyncStateManager.test.ts` | Add fitMode field tests |

---

## Risks

### 1. W Key Conflict
The W key is currently bound to `view.toggleWaveform` / `panel.waveform`. Reassigning it to `view.cycleFitMode` will break the muscle memory of users who rely on W for waveform. **Mitigation**: The waveform toggle is also accessible via the toolbar Scopes button and the `panel.waveform` shortcut entry. Add the old `view.toggleWaveform` to `CONFLICTING_DEFAULTS` so it only activates when the user assigns a custom binding. Document the change in release notes.

### 2. calculateDisplayDimensions Backward Compatibility
`calculateDisplayDimensions` is called from multiple locations including test mocks. Adding a parameter must be backward-compatible (optional with default `'all'`). **Mitigation**: Default parameter value ensures all existing call sites work unchanged.

### 3. Image Overflow in Fit Width/Height
In fit-width mode, the image may be taller than the container. The canvas container will need `overflow: visible` (or the canvasContainer transform approach already handles this). Current code uses `translate()` on the canvasContainer div, which already supports images larger than the viewport. **Mitigation**: Verify that the existing CSS and canvas positioning handles overflow correctly. The canvasContainer is a child of the viewer container which likely has `overflow: hidden`; pan clamping ensures the image stays partially visible.

### 4. Performance During Resize
Fit-width/fit-height modes trigger re-layout on every resize, same as fit-all mode. Since `ResizeObserver` already triggers `scheduleRender()`, no additional work is needed. However, the `calculateDisplayDimensions` function is cheap (simple arithmetic), so no performance concern.

### 5. PAR and Rotation Interaction
The fit scale calculation in `renderImage()` is applied after PAR correction and rotation. The `effectiveWidth`/`effectiveHeight` values already account for these transforms. The fitMode parameter flows through correctly since it is applied at the `calculateDisplayDimensions` level. **Mitigation**: Add specific test cases for fit-width with 90-degree rotation and PAR correction to verify correct behavior.

### 6. Network Sync Compatibility
Adding `fitMode` to `ViewState` is additive. Older clients will ignore the unknown field, and the local client will default to `null` when receiving state without it. **Risk**: Low.

### 7. Smooth Animation for Mode Transitions
When cycling fit modes, the target zoom is always 1 (the fit scale is computed from the fit formula, not from the zoom multiplier). The animation should smoothly transition from the current display state to the new fit. Since `smoothFitToWindow()` already animates zoom to 1 with pan to (0, 0), the same approach works for fit-width (animate zoom to 1, panX to 0, leave panY as-is or reset to 0). **Mitigation**: Test the animation transitions between all mode combinations.

### 8. Zoom Control Sync
When the user cycles fit mode via keyboard, the ZoomControl dropdown needs to update its visual state. The Viewer or wiring code must call `zoomControl.setZoom('fit-width')` when fit mode changes. **Mitigation**: Add a `fitModeChanged` event or integrate with the existing `zoomChanged` flow by having `cycleFitMode()` also update the ZoomControl through the wiring layer.

---

## Implementation Order

Recommended implementation order for incremental, testable progress:

1. **TransformManager** -- add FitMode type and state (Step 1)
2. **calculateDisplayDimensions** -- add fitMode parameter (Step 2)
3. **Viewer** -- wire fitMode through render pipeline and add public API (Step 3)
4. **Tests** -- verify core behavior before wiring UI (Step 14, partial)
5. **ZoomControl** -- add new zoom levels to dropdown (Step 4)
6. **AppViewWiring** -- handle new zoom levels (Step 5)
7. **KeyBindings + KeyboardActionMap** -- add W key cycling (Steps 6, 7, 8)
8. **Visual indicator** -- add toast/label feedback (Step 9)
9. **Pan clamping + fit-mode exit** -- refine interaction (Step 10)
10. **Network sync + API** -- extend interfaces (Steps 11, 12)
11. **Session serialization** -- optional persistence (Step 13)
12. **Full test coverage** -- remaining test updates (Step 14)
