# Plan 18: Fit Width Mode (and Fit Height Mode)

## Overview

Desktop OpenRV provides W to fit image width to the viewport. The web version currently only supports a single "Fit" mode that scales the image to fit both dimensions (equivalent to `Math.min(containerW/sourceW, containerH/sourceH, 1)`). This plan adds three distinct fit modes:

1. **Fit All** (existing) -- scales so the entire image is visible, letterboxed if needed.
2. **Fit Width** -- scales so the image fills the container width; the user can pan vertically.
3. **Fit Height** -- scales so the image fills the container height; the user can pan horizontally.

Keyboard shortcuts: `F` for fit-all (already exists), `W` for fit-width, `H` for fit-height (discrete keys matching desktop OpenRV). The active fit mode is shown in the ZoomControl dropdown and persists across window resizes and source changes. Manual zoom exits the fit mode.

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
   The H key is currently bound to `panel.histogram`.

7. **`calculateDisplayDimensions()`** is the single bottleneck for sizing. It is called from `Viewer.renderImage()` (line ~1476) and from placeholder mode. The function takes `sourceWidth`, `sourceHeight`, `containerWidth`, `containerHeight`, and `zoom`, and returns `{ width, height }`.

8. **`calculateZoomPan()`** in `ViewerInteraction.ts` (lines 68-119) hardcodes the fit scale formula:
   ```ts
   const fitScale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight, 1);
   ```
   This function handles zoom-to-cursor calculations during scroll-wheel zoom. It must be updated to use the active fit mode's scale formula.

9. **Resize handling**: `Viewer` uses a `ResizeObserver` on the container (line ~700). On resize it invalidates layout cache and schedules a render. Because `calculateDisplayDimensions()` reads the container dimensions on each render, the fit mode implicitly re-fits on resize. Note: resize does not reset pan offsets, so in fit-width mode the user's vertical scroll position is preserved across window resizes.

10. **Pan clamping**: Currently there is no clamping -- the user can pan freely in any direction regardless of fit mode. The `ViewerInputHandler.onPointerMove` adds `dx`/`dy` directly to `panX`/`panY`.

11. **Network sync state** (`/Users/lifeart/Repos/openrv-web/src/network/SyncStateManager.ts`): `ViewState` has `{ panX, panY, zoom, channelMode }` but no fit mode field.

12. **API** (`/Users/lifeart/Repos/openrv-web/src/api/ViewAPI.ts`): `ViewerProvider` interface has `fitToWindow()`, `setZoom()`, `getZoom()`, `setPan()`, `getPan()`. No fit-mode concept.

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
  -> buildActionHandlers['view.fitToWidth'] fires
  -> viewer.smoothFitToWidth()
  -> TransformManager: fitMode = 'width'
  -> TransformManager: panX reset to 0, panY reset to 0, zoom reset to 1
  -> Viewer.scheduleRender()
  -> Viewer.render() -> renderImage()
  -> calculateDisplayDimensions(..., fitMode) uses width formula
  -> updateCanvasPosition() centers horizontally, allows vertical pan
  -> ZoomControl updates via fitModeChanged event to show "Fit Width"
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

In fit-width mode, vertical pan should be clamped so the user cannot pan the image entirely off-screen. A small margin (50px or 10% of the container dimension, whichever is smaller) is included so the image edge does not park exactly at the viewport edge, giving the user a visual signal that they have reached the scroll boundary. This matches desktop OpenRV's slight overscroll allowance.

```ts
const margin = Math.min(50, containerHeight * 0.1);
const maxPanY = Math.max(0, (displayHeight - containerHeight) / 2 + margin);
panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
```

Similarly for fit-height mode on the horizontal axis:
```ts
const margin = Math.min(50, containerWidth * 0.1);
const maxPanX = Math.max(0, (displayWidth - containerWidth) / 2 + margin);
panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
```

### Exiting Fit Mode

Any manual zoom action (scroll wheel, pinch zoom, ZoomControl selection of a numeric level) should exit the active fit mode and return to free zoom/pan. This matches desktop OpenRV behavior where fit modes are "sticky until overridden."

### Fit Mode Preservation on Source Change

The fit mode is preserved when the user navigates to a different source (next/previous shot in a playlist, loading a new image). If the user is in fit-width mode and advances to the next shot, the new shot should also fit to width. This means:

- Source-change codepaths must **not** call `fitToWindow()` (which would reset fitMode to `'all'`).
- Instead, source-change codepaths should reset only `panX`, `panY`, and `zoom` to their defaults (0, 0, 1) while preserving the current `fitMode`.
- If `fitMode` is set, the `calculateDisplayDimensions` call during the next render will apply the correct fit formula for the new source dimensions.
- If no fit mode is active (manual zoom), source change resets to fit-all as before.

---

## Implementation Steps

### Step 1: Add FitMode to TransformManager

**File**: `/Users/lifeart/Repos/openrv-web/src/ui/components/TransformManager.ts`

1. Add a `_fitMode: FitMode | null` property (null = no active fit, free zoom).
2. Add getter/setter: `get fitMode()`, `set fitMode()`.
3. Add `fitToWidth()`, `fitToHeight()` methods that set `_fitMode`, reset pan/zoom.
4. Update `fitToWindow()` to set `_fitMode = 'all'`.
5. Add `clearFitMode()` called when manual zoom/pan breaks the fit constraint.
6. Update `setZoom()` to call `clearFitMode()` since a manual zoom overrides fit.
7. Add `smoothFitToWidth()`, `smoothFitToHeight()` that animate to fit then set the mode.
8. Add `resetForSourceChange()` method that resets pan/zoom to defaults but preserves `_fitMode`. Source-change codepaths should call this instead of `fitToWindow()`.

### Step 2: Update calculateDisplayDimensions

**File**: `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.ts`

1. Add an optional `fitMode` parameter (default `'all'` for backward compatibility).
2. Change the fit scale calculation:
   ```ts
   let fitScale: number;
   switch (fitMode) {
     case 'width':
       fitScale = containerWidth / sourceWidth;
       break;
     case 'height':
       fitScale = containerHeight / sourceHeight;
       break;
     case 'all':
     default:
       fitScale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight, 1);
       break;
   }
   ```
   Note: the `Math.min(..., 1)` cap is **not applied** for fit-width/fit-height modes, matching desktop OpenRV behavior where fit-width always fills the width regardless of image size. Images smaller than the viewport will be upscaled. Pixel-accurate review at 100% is available via the existing zoom levels.

### Step 3: Update calculateZoomPan in ViewerInteraction.ts

**File**: `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInteraction.ts`

This step is critical: the `calculateZoomPan` function hardcodes the fit-all formula `Math.min(cW/sW, cH/sH, 1)`. When the user scroll-zooms while in fit-width mode, this function computes the wrong fit scale, causing the image to jump on the first scroll event.

1. Add a `fitMode` parameter to `calculateZoomPan()`.
2. Update the internal fit scale calculation to match the active fit mode:
   ```ts
   let fitScale: number;
   switch (fitMode) {
     case 'width':
       fitScale = containerWidth / sourceWidth;
       break;
     case 'height':
       fitScale = containerHeight / sourceHeight;
       break;
     case 'all':
     default:
       fitScale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight, 1);
       break;
   }
   ```
3. Update all callers of `calculateZoomPan()` (in `ViewerInputHandler.ts`, `onWheel` handler at line ~595) to pass the current `fitMode` from `TransformManager`.

### Step 4: Update Viewer to Pass FitMode Through

**File**: `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts`

1. In `renderImage()`, pass `this.transformManager.fitMode` to `calculateDisplayDimensions()`.
2. In `updateCanvasPosition()`, apply pan clamping based on active fit mode:
   - If `fitMode === 'all'`: force panX = 0, panY = 0.
   - If `fitMode === 'width'`: force panX = 0, clamp panY with margin.
   - If `fitMode === 'height'`: force panY = 0, clamp panX with margin.
3. Add `fitToWidth()`, `fitToHeight()` public methods that delegate to TransformManager, emit `fitModeChanged` event, and schedule render.
4. Add `smoothFitToWidth()`, `smoothFitToHeight()` public methods.
5. Add `getFitMode()` public method.
6. Emit a `fitModeChanged` event (with the new FitMode value) whenever the fit mode changes, so that AppViewWiring can sync the ZoomControl.

### Step 5: Wire ZoomControl Sync via fitModeChanged Event

**File**: `/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts`

This step ensures the ZoomControl dropdown stays in sync when the user changes fit mode via keyboard.

1. Listen for the `fitModeChanged` event from Viewer:
   ```ts
   viewer.on('fitModeChanged', (fitMode: FitMode | null) => {
     if (fitMode === 'all') {
       controls.zoomControl.setZoom('fit');
     } else if (fitMode === 'width') {
       controls.zoomControl.setZoom('fit-width');
     } else if (fitMode === 'height') {
       controls.zoomControl.setZoom('fit-height');
     }
     // If fitMode is null (manual zoom), ZoomControl is already updated
     // by the zoomChanged flow.
   });
   ```

2. Update the `zoomChanged` listener to handle new zoom levels:
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

### Step 6: Update ZoomControl

**File**: `/Users/lifeart/Repos/openrv-web/src/ui/components/ZoomControl.ts`

1. Expand `ZoomLevel` type to include `'fit-width'` and `'fit-height'`.
2. Add these to the `ZOOM_LEVELS` array:
   ```ts
   { value: 'fit', label: 'Fit All' },
   { value: 'fit-width', label: 'Fit Width' },
   { value: 'fit-height', label: 'Fit Height' },
   ```
3. Update `updateButtonLabel()` to show "Fit Width" for fit-width and "Fit Height" for fit-height. Use fully spelled-out labels for clarity (the current `min-width: 70px` should accommodate these at 12px font).

### Step 7: Add Keyboard Shortcuts (Discrete Keys)

**File**: `/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts`

Use discrete keys matching desktop OpenRV convention rather than cycling:

- `F` -> fit-all (already exists as `view.fitToWindow`)
- `W` -> fit-width (new: `view.fitToWidth`)
- `H` -> fit-height (new: `view.fitToHeight`)

Since `W` is currently bound to `view.toggleWaveform`/`panel.waveform` and `H` is bound to `panel.histogram`, these are conflicts that must be managed:

1. Add new bindings:
   ```ts
   'view.fitToWidth': {
     code: 'KeyW',
     description: 'Fit image width to window'
   },
   'view.fitToHeight': {
     code: 'KeyH',
     description: 'Fit image height to window'
   },
   ```

2. Move the existing `view.toggleWaveform` from `KeyW` and `panel.histogram` from `KeyH` to the `CONFLICTING_DEFAULTS` set in `AppKeyboardHandler.ts`. The waveform toggle is also accessible via the toolbar Scopes button, and histogram is accessible from the toolbar. Users who prefer the old bindings can reassign them via custom key bindings.

### Step 8: Wire Keyboard Actions

**File**: `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts`

1. Add to `ActionViewer` interface:
   ```ts
   fitToWidth(): void;
   fitToHeight(): void;
   ```

2. Add handlers in `buildActionHandlers`:
   ```ts
   'view.fitToWidth': () => viewer.smoothFitToWidth(),
   'view.fitToHeight': () => viewer.smoothFitToHeight(),
   ```

### Step 9: Update Shortcuts Dialog Categories

**File**: `/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts`

1. Add `'view.fitToWidth'` and `'view.fitToHeight'` to the `'VIEW'` category array in `showShortcutsDialog()`.
2. Add the old `view.toggleWaveform` and `panel.histogram` to `CONFLICTING_DEFAULTS` so they only activate when the user assigns a custom binding.

### Step 10: Visual Indicator

When a fit mode is active, the user needs visual feedback. Two indicators:

1. **ZoomControl button label** already shows "Fit All", "Fit Width", or "Fit Height" (from Step 6).

2. **Transient toast notification**: Show a brief overlay text like "Fit Width" for ~1.5 seconds when the mode changes. Implemented as a small absolutely-positioned div inside the viewer container that fades out. Reuse any existing transient notification pattern in the codebase for consistency; if none exists, keep the implementation minimal.

   **File**: `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts` -- add a `showFitModeIndicator(mode: FitMode)` private method.

### Step 11: Break Fit Mode on Manual Zoom

1. **Wheel zoom** (`ViewerInputHandler.onWheel`): After applying zoom, call `this.ctx.getTransformManager().clearFitMode()`. This is already implicit if `TransformManager.setZoom()` calls `clearFitMode()`.

2. **Pinch zoom** (`ViewerInputHandler.handlePinchZoom`): Same as above.

3. **ZoomControl numeric selection**: When a numeric zoom level is selected, the `setZoom()` call on TransformManager already clears fit mode (from Step 1).

4. **Panning should NOT break fit mode** -- panning is the expected interaction in fit-width/fit-height modes. Only zoom changes break it.

### Step 12: Source Change Behavior

**Files**: Source-change codepaths in Viewer.ts and related files.

1. Identify all codepaths that are triggered on source change (next/previous frame, playlist navigation, file load).
2. Ensure these codepaths call `TransformManager.resetForSourceChange()` (added in Step 1) instead of `fitToWindow()`, so that the active fit mode is preserved.
3. If no fit mode is active (fitMode is null), `resetForSourceChange()` should behave identically to the current `fitToWindow()` behavior (reset to fit-all).
4. Add tests to verify that fit-width mode persists when advancing through playlist shots.

### Step 13: Network Sync Support

**File**: `/Users/lifeart/Repos/openrv-web/src/network/SyncStateManager.ts`

1. Add `fitMode: string | null` to the `ViewState` interface.
2. Update `DEFAULT_VIEW_STATE` to include `fitMode: null`.
3. This is a backward-compatible addition; older clients that do not send `fitMode` will default to `null` (no fit mode).

### Step 14: Public API Extension

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

### Step 15: Session Serialization

**File**: `/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts` (and related)

1. Optionally persist the fit mode in the session GTO data. This is low priority since fit mode is a display preference rather than session state. Could be stored in a `display.fitMode` field on the display transform.

### Step 16: Tests

Create or update the following test files:

1. **`/Users/lifeart/Repos/openrv-web/src/ui/components/TransformManager.test.ts`** -- Add tests for:
   - `fitToWidth()` sets fitMode to 'width', resets pan/zoom.
   - `fitToHeight()` sets fitMode to 'height', resets pan/zoom.
   - `clearFitMode()` resets fitMode to null.
   - `setZoom()` clears fitMode.
   - `resetForSourceChange()` preserves fitMode while resetting pan/zoom.

2. **`/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.test.ts`** -- Add tests for:
   - `calculateDisplayDimensions()` with `fitMode = 'width'` produces correct dimensions.
   - `calculateDisplayDimensions()` with `fitMode = 'height'` produces correct dimensions.
   - Backward compatibility: default `fitMode` behaves as before.
   - No upscale cap for fit-width/fit-height (small image is scaled up to fill).

3. **`/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInteraction.test.ts`** -- Add tests for:
   - `calculateZoomPan()` with `fitMode = 'width'` uses correct fit scale.
   - `calculateZoomPan()` with `fitMode = 'height'` uses correct fit scale.
   - Backward compatibility: default fitMode uses fit-all formula.

4. **`/Users/lifeart/Repos/openrv-web/src/ui/components/ZoomControl.test.ts`** -- Add tests for:
   - New zoom levels 'fit-width' and 'fit-height' are supported.
   - Button label shows "Fit Width" and "Fit Height" correctly.

5. **`/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.test.ts`** -- Add tests for `view.fitToWidth` and `view.fitToHeight` action handlers.

6. **`/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.test.ts`** -- Add tests for new `fitToWidth()`, `fitToHeight()`, `getFitMode()` API methods.

7. **`/Users/lifeart/Repos/openrv-web/src/AppViewWiring.test.ts`** -- Add tests for:
   - fit-width/fit-height wiring in the `zoomChanged` listener.
   - `fitModeChanged` event correctly syncs ZoomControl state.

8. **`/Users/lifeart/Repos/openrv-web/src/network/SyncStateManager.test.ts`** -- Add fitMode field tests.

9. **Rotation + fit-width test** (in ViewerRenderingUtils.test.ts): A 1920x1080 image rotated 90 degrees has effective dimensions 1080x1920. In fit-width mode, `fitScale = containerWidth / 1080`. Verify the result matches expected dimensions.

10. **Source change + fit mode preservation test**: Verify that navigating to the next source while in fit-width mode preserves fit-width and applies it to the new source dimensions.

---

## Files to Create/Modify

### Files to Modify

| File | Change |
|------|--------|
| `/Users/lifeart/Repos/openrv-web/src/ui/components/TransformManager.ts` | Add `FitMode` type, `_fitMode` state, `fitToWidth()`, `fitToHeight()`, `clearFitMode()`, `smoothFitToWidth()`, `smoothFitToHeight()`, `resetForSourceChange()`. Update `fitToWindow()` to set fitMode. Update `setZoom()` to clear fit mode. |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.ts` | Add `fitMode` parameter to `calculateDisplayDimensions()`. Add width-only and height-only scaling formulas (without upscale cap). |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInteraction.ts` | Add `fitMode` parameter to `calculateZoomPan()`. Update internal fit scale calculation to use the active fit mode formula instead of hardcoded fit-all. |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts` | Pass fitMode to `calculateDisplayDimensions()`. Add pan clamping with margin in `updateCanvasPosition()`. Add `fitToWidth()`, `fitToHeight()`, `smoothFitToWidth()`, `smoothFitToHeight()`, `getFitMode()` public methods. Emit `fitModeChanged` event. Add transient fit-mode indicator. |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts` | In `onWheel`, pass fitMode to `calculateZoomPan()`. Clear fit mode after zoom change. |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/ZoomControl.ts` | Expand `ZoomLevel` type. Add 'fit-width' and 'fit-height' to dropdown with "Fit Width"/"Fit Height" labels. Update button label display. |
| `/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts` | Handle 'fit-width' and 'fit-height' in `zoomChanged` listener. Listen for `fitModeChanged` event and sync ZoomControl state. |
| `/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts` | Add `view.fitToWidth` binding on `KeyW`. Add `view.fitToHeight` binding on `KeyH`. |
| `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts` | Add `fitToWidth()`, `fitToHeight()` to `ActionViewer`. Add `view.fitToWidth`, `view.fitToHeight` handlers. |
| `/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts` | Add `view.fitToWidth`, `view.fitToHeight` to VIEW shortcuts category. Add `view.toggleWaveform` and `panel.histogram` to `CONFLICTING_DEFAULTS`. |
| `/Users/lifeart/Repos/openrv-web/src/network/SyncStateManager.ts` | Add `fitMode` to `ViewState` interface and default. |
| `/Users/lifeart/Repos/openrv-web/src/api/ViewAPI.ts` | Add `fitToWidth()`, `fitToHeight()`, `getFitMode()` methods. |
| `/Users/lifeart/Repos/openrv-web/src/api/types.ts` | Add `fitToWidth()`, `fitToHeight()`, `getFitMode()` to `ViewerProvider`. |

### Files to Create

None. All changes fit within existing files.

### Test Files to Modify

| File | Change |
|------|--------|
| `/Users/lifeart/Repos/openrv-web/src/ui/components/TransformManager.test.ts` | Add fit mode tests including source change preservation |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.test.ts` | Add `calculateDisplayDimensions` fit mode tests, rotation + fit-width test |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInteraction.test.ts` | Add `calculateZoomPan` fit mode tests |
| `/Users/lifeart/Repos/openrv-web/src/ui/components/ZoomControl.test.ts` | Add fit-width/fit-height zoom level tests |
| `/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.test.ts` | Add `view.fitToWidth`, `view.fitToHeight` handler tests |
| `/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.test.ts` | Add new API method tests |
| `/Users/lifeart/Repos/openrv-web/src/AppViewWiring.test.ts` | Add fit-width/fit-height wiring tests and fitModeChanged sync tests |
| `/Users/lifeart/Repos/openrv-web/src/network/SyncStateManager.test.ts` | Add fitMode field tests |

---

## Risks

### 1. W and H Key Conflicts
The W key is currently bound to `view.toggleWaveform` / `panel.waveform` and the H key to `panel.histogram`. Reassigning them to fit-width and fit-height will change existing shortcuts. **Mitigation**: Both waveform and histogram are accessible via the toolbar buttons. Add the old bindings to `CONFLICTING_DEFAULTS` so they only activate when the user assigns a custom binding. Document the change in release notes.

### 2. calculateDisplayDimensions Backward Compatibility
`calculateDisplayDimensions` is called from multiple locations including test mocks. Adding a parameter must be backward-compatible (optional with default `'all'`). **Mitigation**: Default parameter value ensures all existing call sites work unchanged.

### 3. calculateZoomPan Fit Scale Mismatch
`calculateZoomPan` in `ViewerInteraction.ts` hardcodes the fit-all scale formula. When the user scroll-zooms while in fit-width mode, the wrong fit scale causes the image to jump on the first scroll event. **Mitigation**: Step 3 explicitly addresses this by adding a `fitMode` parameter and updating all callers.

### 4. Image Overflow in Fit Width/Height
In fit-width mode, the image may be taller than the container. Current code uses `translate()` on the canvasContainer div, which already supports images larger than the viewport. **Mitigation**: Verify that the existing CSS and canvas positioning handles overflow correctly. Pan clamping with margin ensures the image stays partially visible and provides scroll-boundary feedback.

### 5. Performance During Resize
Fit-width/fit-height modes trigger re-layout on every resize, same as fit-all mode. The `calculateDisplayDimensions` function is cheap (simple arithmetic), so no performance concern.

### 6. PAR and Rotation Interaction
The fit scale calculation in `renderImage()` is applied after PAR correction and rotation. The `effectiveWidth`/`effectiveHeight` values already account for these transforms. The fitMode parameter flows through correctly since it is applied at the `calculateDisplayDimensions` level. **Mitigation**: Add specific test cases for fit-width with 90-degree rotation and PAR correction to verify correct behavior.

### 7. Network Sync Compatibility
Adding `fitMode` to `ViewState` is additive. Older clients will ignore the unknown field, and the local client will default to `null` when receiving state without it. **Risk**: Low.

### 8. Smooth Animation for Mode Transitions
When switching fit modes, the target zoom is always 1 (the fit scale is computed from the fit formula, not from the zoom multiplier). The animation should smoothly transition from the current display state to the new fit. Since `smoothFitToWindow()` already animates zoom to 1 with pan to (0, 0), the same approach works for fit-width (animate zoom to 1, panX to 0, panY to 0). **Mitigation**: Test the animation transitions between all mode combinations.

### 9. Source Change Resetting Fit Mode
If `fitToWindow()` is called on source change, it would reset fitMode to `'all'`, silently breaking the user's mode preference. **Mitigation**: Step 12 introduces `resetForSourceChange()` which preserves fitMode. All source-change codepaths must use this method instead of `fitToWindow()`.

### 10. Crop / Uncrop Interaction
When crop is active, the display dimensions represent the full uncropped image with crop overlay drawn on top. Fit-width mode fits the **full image width** to the container (not the cropped region). With `UncropState` active, the effective dimensions include uncrop padding, meaning fit-width fits the expanded dimensions. This may not be intuitive. **Mitigation**: Document this behavior; consider a future enhancement to fit the original image width when uncrop is active.

---

## Review Notes (Future Enhancements)

The following items were identified during expert review as "Nice to Have" improvements that can be addressed in follow-up work:

1. **Trackpad vertical scroll for panning in fit-width mode**: When fit-width is active, non-pinch scroll gestures could pan vertically instead of zooming, matching the mental model of "scrolling a tall page." Could be gated behind a preference.

2. **Add `setFitMode(mode)` to the public API** alongside the discrete `fitToWidth()`/`fitToHeight()` methods for programmatic flexibility.

3. **Persist fit mode in session serialization** (Step 15). Low priority but valuable for professional workflows where artists have preferred review modes.

4. **Optional upscale cap for fit-width/fit-height**: The plan removes the `Math.min(..., 1)` cap, meaning small images are upscaled. An optional "never upscale" setting could be added for users who prefer native resolution review.

5. **Toast notification styling**: Consider reusing any existing transient notification pattern in the codebase for consistency. If none exists, keep the implementation minimal.

---

## Implementation Order

Recommended implementation order for incremental, testable progress:

1. **TransformManager** -- add FitMode type, state, and resetForSourceChange (Step 1)
2. **calculateDisplayDimensions** -- add fitMode parameter (Step 2)
3. **calculateZoomPan** -- add fitMode parameter to fix zoom-to-cursor (Step 3)
4. **Viewer** -- wire fitMode through render pipeline, emit fitModeChanged event, add public API (Step 4)
5. **Tests** -- verify core behavior before wiring UI (Step 16, partial)
6. **ZoomControl** -- add new zoom levels to dropdown (Step 6)
7. **AppViewWiring** -- handle new zoom levels and fitModeChanged sync (Step 5)
8. **KeyBindings + KeyboardActionMap** -- add discrete W/H keys (Steps 7, 8, 9)
9. **Visual indicator** -- add toast/label feedback (Step 10)
10. **Pan clamping with margin + fit-mode exit** -- refine interaction (Step 11)
11. **Source change behavior** -- preserve fit mode across source changes (Step 12)
12. **Network sync + API** -- extend interfaces (Steps 13, 14)
13. **Session serialization** -- optional persistence (Step 15)
14. **Full test coverage** -- remaining test updates (Step 16)

Estimated effort: 2-3 days for core functionality (Steps 1-8), plus 1 day for polish (toast, pan clamping, sync) and 1 day for comprehensive test coverage. Total: 4-5 days.
