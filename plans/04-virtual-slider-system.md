# Virtual Slider Parameter Editing

## Overview

Desktop OpenRV provides key-activated "virtual sliders" -- the user presses and holds a single letter key (e.g., E for exposure) and then drags the mouse horizontally to adjust the value. The current web version relies exclusively on traditional `<input type="range">` sliders inside the Color Controls panel and the Left Panel sidebar. This plan describes how to add the same modal, key-hold-to-adjust interaction to the web viewer so that colorists can grade without leaving the viewport or opening panels.

**Known UX deviation from desktop OpenRV:** Desktop OpenRV does not have the ARMED intermediary state described below. In the desktop app, the virtual slider keys are dedicated and do not serve double duty as tap shortcuts, so activation feels instantaneous. The web version's ARMED state is a necessary adaptation to preserve existing tap shortcuts (Y for vectorscope, H for histogram, etc.), but it introduces a perceptible ~150 ms latency on activation. Power users performing rapid successive adjustments will feel this penalty.

### Key mappings (Desktop OpenRV reference)

| Key | Parameter       | Default range       | Fine step |
|-----|-----------------|---------------------|-----------|
| E   | Exposure        | -5 .. +5 stops      | 0.002     |
| Y   | Gamma           | 0.1 .. 4.0          | 0.01      |
| B   | Brightness      | -1 .. +1            | 0.005     |
| H   | Hue Rotation    | 0 .. 360 degrees    | 0.5       |
| S   | Saturation      | 0 .. 2              | 0.005     |
| K   | Contrast        | 0 .. 2              | 0.005     |

Additional controls: `+`/`-` for fine increment, `L` to lock (keep adjusting until toggled off), numeric entry to type an exact value, `Escape` to cancel and restore the original value.

**Omissions from desktop OpenRV:** Temperature and Tint (desktop OpenRV uses T for temperature) are intentionally excluded because `KeyT` conflicts with `paint.text`. Clarity, Vibrance, Highlights, Shadows, Whites, and Blacks are also excluded from the initial implementation. The `ColorAdjustments` interface has 14 numeric parameters, but only 6 are mapped here to keep the initial scope manageable. Additional parameters can be added in a future phase using modifier-key combinations (e.g., Alt+E for Temperature).

---

## Current State

### Keyboard handling

1. **KeyboardManager** (`src/utils/input/KeyboardManager.ts`) receives `keydown` events, maps `KeyCombination` objects to callbacks, and skips input elements. It only fires on key-*down* -- there is no key-*up* or key-hold tracking.

2. **ActiveContextManager** (`src/utils/input/ActiveContextManager.ts`) provides context scoping (`global`, `paint`, `timeline`, `channel`, `transform`, `viewer`). A virtual-slider mode would need its own context or an override mechanism.

3. **ContextualKeyboardManager** (`src/utils/input/ContextualKeyboardManager.ts`) resolves collisions between same-key bindings in different contexts. **Important:** The keyboard dispatch path goes through `ContextualKeyboardManager.resolve()` first (see `KeyboardManager.handleKeydown`). Any key suppression mechanism must be applied *before* the contextual resolver runs, not after.

4. **DEFAULT_KEY_BINDINGS** (`src/utils/input/KeyBindings.ts`) and **buildActionHandlers** (`src/services/KeyboardActionMap.ts`) define the full keyboard shortcut map.

### Existing key conflicts (bare-key presses)

| Key | Current binding                   | Scope   | Notes |
|-----|-----------------------------------|---------|-------|
| E   | `paint.eraser` (Annotate tab)     | Global (no `context` property set) | Conflicts in ALL contexts, not just paint |
| Y   | `panel.vectorscope`               | Global  | Bare key |
| B   | `paint.toggleBrush` (Annotate tab)| Global (no `context` property set) | Conflicts in ALL contexts, not just paint |
| H   | `panel.histogram`                 | Global  | Bare key |
| S   | `export.quickExport` (Ctrl+S only)| N/A     | Bare S is **unbound** |
| K   | `playback.stop`                   | Global  | Bare key (JKL system) |

**Correction from review:** `paint.eraser` (E) and `paint.toggleBrush` (B) do NOT have a `context: 'paint'` property in `KeyBindings.ts`, meaning they are globally scoped. The ARMED hold-vs-tap distinction is the sole conflict resolution mechanism for these keys in all contexts. The implementer should either:
- Add `context: 'paint'` to these bindings in `KeyBindings.ts` (breaking change to existing behavior), or
- Rely entirely on the hold-vs-tap mechanism for conflict resolution (recommended, as the plan already describes this).

This means E, Y, B, H, K are already bound. The virtual slider system must *not* fire on single tap -- it should only activate when the key is **held** beyond a brief dead-zone time (~150 ms) OR when the mouse moves while the key is held, so the existing tap shortcuts remain functional.

### Color controls pipeline

- **ColorControls** (`src/ui/components/ColorControls.ts`) stores `ColorAdjustments`, provides `getAdjustments()` / `setAdjustments(partial)`, and emits `adjustmentsChanged` (throttled at ~30 fps).
- **AppColorWiring** (`src/AppColorWiring.ts`) subscribes to `adjustmentsChanged`, forwards to `viewer.setColorAdjustments()`, updates scopes, and records debounced history.
- **LeftPanelContent** (`src/ui/layout/panels/LeftPanelContent.ts`) has a secondary set of sliders that sync bidirectionally with `ColorControls`.
- **Viewer** (`src/ui/components/Viewer.ts`) calls `colorPipeline.setColorAdjustments()` and `glRendererManager.setColorAdjustments()`, followed by `scheduleRender()`.
- **ShaderStateManager** (`src/render/ShaderStateManager.ts`) pushes per-frame uniform values (`exposure`, `gamma`, `saturation`, `contrast`, `brightness`, `hueRotation`) into the WebGL2 fragment shader.

All slider changes go through the same `ColorAdjustments` pathway. The virtual slider system only needs to call `colorControls.setAdjustments({ [param]: newValue })` to integrate seamlessly.

**Undo/history concern:** During virtual slider drag, `adjustmentsChanged` fires at ~30fps. `AppColorWiring` has a debounced history recording timer (500ms). If the drag lasts longer than 500ms (most will), `AppColorWiring` will record intermediate history entries before the virtual slider commits its own entry. This will produce duplicate or conflicting undo entries. **Resolution:** Add a `suppressHistory` flag to `ColorControls` (or pass a flag through the event payload) that `AppColorWiring` respects. The virtual slider sets `suppressHistory = true` on activation and clears it on commit/cancel. The virtual slider records its own single undo entry on commit encompassing the full pre-activation-to-committed-value change.

### Overlay / HUD patterns

Existing viewer overlays follow one of two patterns:

1. **Canvas overlays** (SpotlightOverlay, SafeAreasOverlay): extend a `CanvasOverlay` base class, render to their own `<canvas>`, and are managed by `OverlayManager`.
2. **DOM overlays** (TimecodeOverlay, PixelProbe, MissingFrameOverlay): create a positioned `<div>` inside the canvas container with `position: absolute` and a z-index.

The virtual slider HUD is transient and lightweight (text + bar). A **DOM overlay** is the correct choice -- it avoids canvas repaints and is trivially positioned/styled.

---

## Proposed Architecture

### New module: `VirtualSliderController`

A single class that owns:

- **Activation state machine** (idle -> armed -> active -> locked)
- **Mouse capture** during active state (pointer lock not required -- relative `movementX` from `pointermove` suffices)
- **HUD DOM element** lifecycle (create on activate, remove on deactivate)
- **Value computation** (delta from mouse movement, fine/coarse step, numeric entry)
- **Integration** with `ColorControls.setAdjustments()` for live feedback
- **History integration** (record undo/redo entry on commit; suppress `AppColorWiring`'s debounced history during operation)
- **Full key interception** during ACTIVE/LOCKED states to prevent other shortcuts from firing

### State machine

```
           keydown(E/Y/B/H/S/K)
  IDLE  ─────────────────────────>  ARMED
   ^                                  │
   │  keyup (no mouse move            │ pointermove (cumulative |dx| > 3px)
   │   AND held < 150ms)              │ OR held > 150ms (auto-transition
   │  => original shortcut fires      │    for keyboard-only activation)
   │                                  v
   │                               ACTIVE
   │                                  │
   │  Escape => cancel, restore       │ keyup => commit value
   │  L => toggle LOCKED              │
   │                                  v
   │                               LOCKED
   │                                  │
   │  L again OR Escape => commit     │ mouse continues adjusting
   │  Enter / numeric entry => commit │
   └──────────────────────────────────┘
```

**ARMED** state is critical: it creates a brief window (~150 ms) where we wait to see if the user intends a tap (existing shortcut) or a hold (virtual slider). If `pointermove` fires with cumulative `|movementX| > 3px` during ARMED, we transition to ACTIVE. If the key is released during ARMED without significant mouse motion and before the 150ms threshold, we let the original shortcut fire.

**Keyboard-only activation:** If the ARMED state timeout (150 ms) elapses while the key is still held (even without mouse movement), auto-transition to ACTIVE. This enables keyboard-only users to activate the virtual slider and then use `+/-` or numeric entry to adjust values without touching the mouse.

**Mouse movement measurement during ARMED:** The 3px threshold must be measured as **cumulative absolute displacement**, not a single `movementX` sample. A user's hand drifts slightly even when intending a tap, so a single-sample check could produce false activations.

**Key event interception during ACTIVE/LOCKED states:** When the virtual slider is ACTIVE or LOCKED, the controller must intercept ALL keyboard events (not just the activator key) to prevent:
- `L` from triggering `playback.faster`
- `Escape` from closing panels (`panel.close`)
- Digit keys from triggering tab switches or other bindings
- Any other global shortcuts from firing

Only the following keys are processed by the controller during ACTIVE/LOCKED: the activator key, `+`, `-`, digits (0-9), `.`, `-` (minus for numeric entry), `Enter`, `Escape`, `L`, `Backspace`, and `Shift`. All other key events are consumed via `stopPropagation()` and `preventDefault()`.

**Handling `keydown` repeat events:** When a key is held, browsers fire repeated `keydown` events with `e.repeat === true`. The controller must track this and ignore repeat events after the initial ARMED transition to prevent re-triggering the state machine.

**Multiple rapid key presses:** If the user presses E (entering ARMED for exposure) and then presses Y (gamma) before releasing E, the controller cancels the first ARMED state and switches to the new parameter. Only one virtual slider may be active at a time.

### Parameter configuration

```typescript
interface VirtualSliderParam {
  key: NumericAdjustmentKey;      // maps to ColorAdjustments field
  label: string;                  // display name in HUD
  min: number;
  max: number;
  defaultValue: number;           // from DEFAULT_COLOR_ADJUSTMENTS
  coarseStep: number;             // value change per pixel of mouse movement
  fineStep: number;               // +/- key step (also Shift+drag step)
  format: (v: number) => string;  // display format
}
```

A static `VIRTUAL_SLIDER_PARAMS` map indexed by `KeyboardEvent.code` provides the config:

```typescript
const VIRTUAL_SLIDER_PARAMS: Record<string, VirtualSliderParam> = {
  KeyE: { key: 'exposure',    label: 'Exposure',    min: -5,   max: 5,   defaultValue: 0,   coarseStep: 0.01,  fineStep: 0.002, format: ... },
  KeyY: { key: 'gamma',       label: 'Gamma',       min: 0.1,  max: 4.0, defaultValue: 1.0, coarseStep: 0.01,  fineStep: 0.01,  format: ... },
  KeyB: { key: 'brightness',  label: 'Brightness',  min: -1,   max: 1,   defaultValue: 0,   coarseStep: 0.005, fineStep: 0.005, format: ... },
  KeyH: { key: 'hueRotation', label: 'Hue',         min: 0,    max: 360, defaultValue: 0,   coarseStep: 1.0,   fineStep: 0.5,   format: ... },
  KeyS: { key: 'saturation',  label: 'Saturation',  min: 0,    max: 2,   defaultValue: 1.0, coarseStep: 0.005, fineStep: 0.005, format: ... },
  KeyK: { key: 'contrast',    label: 'Contrast',    min: 0,    max: 2,   defaultValue: 1.0, coarseStep: 0.005, fineStep: 0.005, format: ... },
};
```

**Sensitivity note (from review):** Exposure `coarseStep` was reduced from 0.02 to 0.01 per pixel. At 0.02/px, a single pixel of mouse movement produces a visible shift on a calibrated display, which is too coarse for professional color grading. The fineStep (Shift+drag) is 0.002/px. Hue at 1 degree per pixel is correct for large sweeps.

**`movementX` clamping:** To prevent single-frame value jumps caused by browser quirks (especially Safari/WebKit reporting very large `movementX` spikes when the pointer enters/leaves the browser window under pointer capture), clamp `movementX` per frame: `Math.abs(movementX) > 100 ? 0 : movementX`.

### Event handling strategy

The virtual slider must intercept keys *before* `KeyboardManager` handles them, but only consume them when the interaction qualifies as a hold.

**Recommended: Approach C -- Separate key listener with suppression flag**

`VirtualSliderController` adds its own `keydown`/`keyup` listener at capture phase. When an activator key is pressed, it sets an `isArmed` flag. `KeyboardManager.handleKeydown` checks this flag and skips the binding if the virtual slider has claimed the key. This is the simplest to implement.

The `VirtualSliderController` is given a reference to `KeyboardManager` so it can call `suppressKey(code: string)` / `releaseKey(code: string)` methods. These methods prevent specific key codes from triggering bindings while suppressed. **The suppression check must occur at the top of `handleKeydown`, before both the `ContextualKeyboardManager` resolver and the direct binding lookup.**

During ACTIVE/LOCKED states, the controller suppresses ALL keys (not just the activator) to prevent any other shortcuts from firing. Only the virtual-slider-relevant keys (+, -, digits, Enter, Escape, L, Backspace, Shift) are processed by the controller; all others are silently consumed.

**Touch device early-return:** The event listeners will fire on touch devices even though this feature is desktop-only. The controller should early-return if `e.pointerType === 'touch'` to avoid wasted processing.

---

## Interaction Design

### Activation

1. User presses and **holds** E/Y/B/H/S/K while cursor is over the viewer area.
2. If mouse moves horizontally by more than a 3px cumulative dead zone, the virtual slider activates. OR if the key is held for more than 150ms (even without mouse movement), the slider auto-activates for keyboard-only use.
3. The HUD overlay appears, the cursor changes to `ew-resize`.

### Adjustment

- **Horizontal mouse movement**: `delta = movementX * coarseStep`. Value is clamped to `[min, max]`. The `movementX` value is clamped to `[-100, 100]` per frame to prevent browser-quirk jumps.
- **Shift held**: Applies a 0.1x multiplier for fine adjustment.
- **+/- keys**: Increment/decrement by `fineStep`. Works in both ACTIVE and LOCKED states.
- **Numeric entry**: While active, typing digits (0-9), period, and minus sign enters a numeric string. Pressing Enter confirms the typed value. Backspace deletes the last character. The HUD shows the typed string in place of the slider bar.
- **`requestAnimationFrame` coalescing**: Multiple `pointermove` events per frame (common at 120Hz+ refresh rates) are batched into a single `setAdjustments()` call per animation frame. This is the default behavior, not optional.

### Lock mode

- Press `L` while in ACTIVE state to enter LOCKED state. The key can be released; adjustment continues with mouse movement alone.
- Press `L` again or `Enter` to commit and exit.
- Press `Escape` to cancel and restore the pre-activation value.
- Note: `L` is currently bound to `playback.faster` globally. The controller must suppress this binding during ACTIVE/LOCKED states.

### Cancellation

- `Escape` at any point cancels the adjustment and restores the value that was in effect before activation. `Escape` is consumed (`stopPropagation`) during ACTIVE/LOCKED states and does NOT propagate to close panels.
- Clicking any mouse button also cancels (to avoid interfering with other interactions).

### Commit

- Releasing the activator key (when not locked) commits the current value.
- Pressing `Enter` commits (when locked or during numeric entry).
- Pressing `L` again commits (when locked).

### History integration

When the value is committed, a single undo/redo entry is recorded via `getGlobalHistoryManager().recordAction()`, capturing the pre-activation and committed values. Cancellation records nothing.

**Undo/history isolation:** During the entire virtual slider operation (from ARMED to commit/cancel), `AppColorWiring`'s debounced history recording must be suppressed. The controller sets a `suppressHistory` flag on `ColorControls` when entering ARMED and clears it on commit/cancel. `AppColorWiring` checks this flag and skips history recording when it is set. This prevents duplicate or conflicting undo entries.

**Per-shot vs. global adjustments:** The current implementation applies adjustments globally via `ColorControls`, matching desktop OpenRV's primary mode. Per-shot grading (applying adjustments to a specific source in a playlist) is a future extension and is out of scope.

---

## UI Feedback (HUD)

### Layout

The HUD appears as a horizontal bar centered near the bottom of the viewer area, overlaying the image. It consists of:

```
  ┌─────────────────────────────────────────────────────────┐
  │  Exposure  ━━━━━━━━━━━━━━●━━━━━━━━━━━━━━  +0.4  [LOCK] │
  └─────────────────────────────────────────────────────────┘
```

- **Parameter name** (left): Bold, 13px, white with slight text shadow.
- **Slider track** (center): A horizontal bar showing the value position. The fill portion uses the accent color. The background is a thin track.
- **Value readout** (right): Monospace, shows current value in the parameter's display format.
- **Lock indicator**: Shows `[LOCK]` badge when in locked state. Hidden otherwise.
- **Background**: Semi-transparent dark (`rgba(0, 0, 0, 0.75)`) with `backdrop-filter: blur(4px)`, rounded corners.

### Positioning

- Horizontally centered in the viewer canvas container.
- Vertically positioned at ~85% of the container height (above the timeline, below center).
- Width: `clamp(300px, 50%, 500px)`.
- z-index: 60 (above timecode overlay at 50, below modals at 9999).

### Numeric entry mode

When the user starts typing digits, the slider bar is replaced with a text display:

```
  ┌─────────────────────────────────────────────────────────┐
  │  Exposure  [ -2.5_ ]                          [ENTER]   │
  └─────────────────────────────────────────────────────────┘
```

The blinking cursor and the typed string are shown. `Enter` applies. `Escape` cancels.

### Animation

- Fade in over 100 ms on activation.
- Fade out over 150 ms on commit/cancel.
- Value changes animate the slider fill width smoothly with CSS `transition: width 32ms`.

### Accessibility

- The HUD container has `role="status"` and `aria-live="assertive"` for the initial appearance so screen readers announce it (since it appears in response to intentional user action). Switch to `aria-live="polite"` for ongoing value updates during drag to avoid screen reader spam.
- The parameter name and value are in `aria-label` text.
- **Focus management:** When the virtual slider activates, the HUD should receive focus (or at least `aria-activedescendant`) so screen readers can announce it. When it deactivates, focus should return to the previously focused element.

---

## Implementation Steps

### Phase 1: Core controller, HUD, and discoverability (MVP)

1. **Create `VirtualSliderConfig.ts`** - Parameter configuration map and types.
2. **Create `VirtualSliderHUD.ts`** - DOM element creation, positioning, value display updates, show/hide animation, numeric entry input mode.
3. **Create `VirtualSliderController.ts`** - State machine, event listeners (`keydown`, `keyup`, `pointermove`), integration with `ColorControls.setAdjustments()`, cancel/commit logic, `requestAnimationFrame` coalescing, `suppressHistory` flag management, `movementX` clamping, `e.repeat` handling, touch-device early-return, full key interception during ACTIVE/LOCKED states.
4. **Wire into App** - Instantiate `VirtualSliderController` in `App.ts` constructor, passing `ColorControls`, the viewer container element, and a reference to `KeyboardManager`.
5. **Add suppression to KeyboardManager** - Add a `suppressKey(code: string)` / `releaseKey(code: string)` mechanism so the virtual slider can prevent the normal shortcut from firing during the armed/active window without disabling all keyboard shortcuts. **The suppression check must be at the top of `handleKeydown`, before the `ContextualKeyboardManager` resolver and direct binding lookup.**
6. **Add `suppressHistory` flag to ColorControls** - A boolean flag that `AppColorWiring` checks before recording debounced history entries. Set by the virtual slider controller during operation.
7. **Add `isInteracting()` to ViewerInputHandler** - A public method (or `get panning(): boolean` getter) that exposes whether a viewer interaction (pan, draw, drag) is in progress. The controller checks this to suppress virtual slider activation during other interactions.
8. **Discoverability** - Add tooltips on slider labels in the Color Controls panel (e.g., "Hold E to adjust in viewport"). Add a VIRTUAL SLIDERS section to the keyboard shortcuts dialog (`showShortcutsDialog()`) and the cheat sheet (`help.toggleCheatSheet`).

### Phase 2: Lock mode and numeric entry

9. **Implement lock state** - `L` key handling within the controller, HUD badge, suppression of `playback.faster` binding.
10. **Implement numeric entry** - Key accumulation buffer, validation, display mode switch in HUD, Enter/Escape handling.

### Phase 3: History integration and polish

11. **Undo/redo recording** - On commit, record a history entry via `getGlobalHistoryManager().recordAction()`. Ensure `suppressHistory` flag is cleared.
12. **Bidirectional sync** - When virtual slider is active, update the `ColorControls` sliders and `LeftPanelContent` sliders in real time (they already react to `setAdjustments()`).
13. **Persistence sync** - Trigger `persistenceManager.syncGTOStore()` on commit only (not during drag). The existing debounce in `AppColorWiring` helps, but GTO persistence on every throttled frame is wasteful. Defer to commit.
14. **Network sync** - Changes flow through the existing `adjustmentsChanged` event path, so `AppNetworkBridge` and `ExternalPresentation` sync automatically.

### Phase 4: Conflict resolution and context awareness

15. **Dead-zone timing** - Tune the ARMED->ACTIVE transition threshold (default 150 ms / 3px cumulative). Make configurable.
16. **Context-aware suppression** - If `activeContextManager.activeContext === 'paint'` AND the key bindings for `paint.eraser` / `paint.toggleBrush` have been scoped to `context: 'paint'`, disable virtual slider for `E` and `B` keys. If they remain globally scoped, rely solely on the hold-vs-tap mechanism.
17. **Custom key bindings** - If the user has rebound E/Y/B/H/S/K to different actions, disable the corresponding virtual slider (check `customKeyBindingsManager.hasCustomBinding()`).

### Phase 5: Tests

18. **Unit tests for VirtualSliderController** - State transitions, value clamping, cancel/commit, lock mode, `e.repeat` handling, `movementX` clamping, `suppressHistory` flag, multi-key-press handling, touch-device early-return.
19. **Unit tests for VirtualSliderHUD** - DOM creation, display updates, numeric entry, focus management, aria attributes.
20. **Integration test** - Simulate keydown, pointermove, keyup sequence; verify `ColorControls.getAdjustments()` reflects the change and only a single undo entry is recorded.

---

## Files to Create/Modify

### New files

| File | Description |
|------|-------------|
| `src/ui/components/VirtualSliderConfig.ts` | `VirtualSliderParam` interface, `VIRTUAL_SLIDER_PARAMS` map, sensitivity constants. |
| `src/ui/components/VirtualSliderHUD.ts` | HUD overlay DOM creation, positioning, slider bar rendering, numeric entry mode, show/hide animation, focus management, dispose. |
| `src/ui/components/VirtualSliderController.ts` | State machine (IDLE/ARMED/ACTIVE/LOCKED), event binding, value computation, `rAF` coalescing, `movementX` clamping, `suppressHistory` management, full key interception during ACTIVE/LOCKED, ColorControls integration, history recording. |
| `src/ui/components/VirtualSliderConfig.test.ts` | Tests for parameter config validation and format functions. |
| `src/ui/components/VirtualSliderHUD.test.ts` | Tests for HUD DOM creation, display updates, numeric entry, focus management. |
| `src/ui/components/VirtualSliderController.test.ts` | Tests for state transitions, value clamping, event handling, cancel/commit, lock mode, numeric entry, `e.repeat` handling, multi-key-press, touch early-return. |

### Modified files

| File | Change |
|------|--------|
| `src/utils/input/KeyboardManager.ts` | Add `suppressKey(code)` / `releaseKey(code)` methods. The `handleKeydown` method checks the suppressed set **at the top**, before both the `ContextualKeyboardManager` resolver and the direct binding lookup. |
| `src/ui/components/ColorControls.ts` | Add `suppressHistory: boolean` flag (default `false`). Expose it so `AppColorWiring` can check before recording debounced history. |
| `src/AppColorWiring.ts` | Check `colorControls.suppressHistory` before recording debounced history entries. Skip history recording when the flag is set. |
| `src/ui/components/Viewer.ts` / `src/ui/components/ViewerInputHandler.ts` | Add a public `isInteracting(): boolean` method (or `get panning()` getter) that exposes whether a pan/draw/drag interaction is in progress. |
| `src/App.ts` | Import and instantiate `VirtualSliderController` in the constructor, passing dependencies. Wire disposal. |
| `src/services/KeyboardActionMap.ts` | Add `ActionControls` interface extension if the virtual slider controller needs to be accessible from keyboard actions (e.g., a "toggle virtual sliders" action). |
| `src/utils/input/KeyBindings.ts` | Optionally add `'virtualSlider.toggle'` binding for enabling/disabling the feature globally (e.g., `Ctrl+Shift+V`). |
| `src/AppKeyboardHandler.ts` | Update `showShortcutsDialog()` to include a "VIRTUAL SLIDERS" category documenting E/Y/B/H/S/K hold-to-adjust. This is Phase 1, not Phase 4. |
| `src/AppControlRegistry.ts` | No changes needed -- the controller communicates directly with `ColorControls` which is already accessible. |

---

## Risks

### 1. Key conflict with existing shortcuts

**Risk**: The E, Y, B, H, K keys are already bound to important features (eraser, vectorscope, brush, histogram, playback stop). **Critically, `paint.eraser` (E) and `paint.toggleBrush` (B) are globally scoped, not paint-context-scoped**, meaning they conflict with virtual sliders in all contexts.

**Mitigation**: The hold-vs-tap distinction ensures that quick key presses still trigger the original shortcuts. The 150 ms / 3px cumulative dead zone is critical. The ARMED state with cumulative displacement measurement prevents false activations from hand drift.

### 2. Dead-zone tuning

**Risk**: Too short a dead zone causes accidental slider activations; too long makes the feature feel laggy.

**Mitigation**: Make the thresholds configurable (stored in localStorage or preferences). Start with 150 ms / 3px and adjust based on user testing. Consider allowing users to choose "always activate on hold" (zero dead zone, disables original key tap) as an option.

### 3. Pointer capture on different browsers

**Risk**: `movementX`/`movementY` from `pointermove` may behave differently across browsers or when the pointer leaves the window.

**Mitigation**: Use `element.setPointerCapture(e.pointerId)` on activation so that `pointermove` events continue even if the cursor leaves the viewer. Release capture on commit/cancel. Fall back to `clientX` delta tracking if `movementX` is unreliable. **Clamp `movementX` per frame** to prevent single-frame jumps from browser quirks (especially Safari/WebKit): `Math.abs(movementX) > 100 ? 0 : movementX`.

### 4. Interaction with other viewer modes

**Risk**: Virtual sliders could interfere with spotlight dragging, wipe line dragging, crop handles, spherical projection dragging, or paint strokes if those modes are active.

**Mitigation**: The controller checks `ViewerInputHandler.isInteracting()` (new public method). If any interaction is in progress, virtual slider activation is suppressed. The controller should only activate when the viewer is in its default idle state.

### 5. Performance during rapid mouse movement

**Risk**: Emitting `adjustmentsChanged` on every `pointermove` (which can fire at 60+ Hz, or 120+ Hz on high-refresh-rate displays) could cause excessive GPU work.

**Mitigation**: The controller uses `requestAnimationFrame` coalescing to batch multiple `pointermove` events into a single `setAdjustments()` call per frame. The existing `throttledEmitAdjustments()` in `ColorControls` already caps downstream updates at ~30 fps. `ShaderStateManager` uses dirty flags and only uploads changed uniforms. **Persistence sync (`syncGTOStore()`) is deferred until commit**, not called during drag.

### 6. Accessibility concerns

**Risk**: The virtual slider interaction relies on mouse movement, which is inaccessible to keyboard-only or assistive technology users.

**Mitigation**: The traditional slider panels remain fully functional and are the primary editing interface. The virtual slider is a power-user accelerator, not a replacement. The +/- and numeric entry modes provide keyboard-only adjustment within the virtual slider flow. **Keyboard-only activation** is supported: holding the activator key for 150ms without mouse movement auto-transitions to ACTIVE, enabling +/- and numeric entry. The HUD uses ARIA roles for screen reader compatibility with assertive announcement on appearance and polite updates during drag.

### 7. Mobile / touch devices

**Risk**: Touch devices do not have a concept of "hold a key while moving a finger."

**Mitigation**: The virtual slider feature is desktop-only by design. The controller early-returns if `e.pointerType === 'touch'` to avoid wasted processing. A touch-specific alternative (e.g., long-press on a parameter label then drag) is out of scope for this plan but could be added later.

### 8. State leaks on unexpected interrupts

**Risk**: If the browser tab loses focus, the window is minimized, or a modal dialog appears while a virtual slider is active, the controller could be left in a dangling state.

**Mitigation**: Listen for `blur`, `visibilitychange`, and `focusout` events. On any of these, cancel the current virtual slider operation and restore the original value. Also clear the `suppressHistory` flag on `ColorControls`. The dispose method must clean up all event listeners.

### 9. Undo/history duplication

**Risk**: `AppColorWiring`'s debounced history recording (500ms timer) fires during virtual slider drag, creating intermediate undo entries that conflict with the virtual slider's commit-time entry.

**Mitigation**: The `suppressHistory` flag on `ColorControls` prevents `AppColorWiring` from recording history during virtual slider operation. The virtual slider records a single undo entry on commit encompassing the full pre-activation-to-committed-value change. Cancellation records nothing and restores the original value.

### 10. ESC key conflict

**Risk**: `Escape` is bound to `panel.close` in `KeyBindings.ts`. When the virtual slider is ACTIVE and the user presses Escape, it must cancel the slider, not close a panel.

**Mitigation**: During ACTIVE/LOCKED states, the controller intercepts all keyboard events at capture phase and calls `stopPropagation()` + `preventDefault()` for Escape (and all other non-virtual-slider keys). Escape cancels the virtual slider and does not propagate.

---

## Review Notes

The following items from the expert review are deferred as "nice to have" for future iterations:

1. **Nonlinear acceleration curve**: Apply a power curve to `movementX` so slow movements produce finer adjustments and fast sweeps produce larger ones. This significantly improves grading precision at low speeds and matches the feel of desktop OpenRV. Consider a simple quadratic or power curve: `adjustedDelta = sign(dx) * pow(abs(dx), 1.3)`.

2. **Configurable HUD position**: Allow "at cursor" vs "bottom bar" positioning. Desktop OpenRV positions the HUD at the cursor; some colorists prefer this because it avoids eye travel from the cursor to the bottom of the screen. The fixed-position approach is a defensible simplification for v1.

3. **Undo grouping for consecutive adjustments**: Group rapid successive virtual slider operations on different parameters (within a 2-second window) into a single undo entry. In desktop OpenRV, a colorist might adjust exposure then immediately gamma, wanting both as a single undo entry. Consider adding a "session" concept.

4. **Visual feedback during ARMED state**: Show a subtle cursor change or parameter name tooltip near the cursor during the 150ms ARMED window to provide feedback that the key hold was detected. Without this, the user has no feedback until ACTIVE state.

5. **Extended parameter mappings**: Map Temperature, Tint, Vibrance, Clarity to virtual sliders using modifier-key combinations (e.g., Alt+E for Temperature) in a future phase.

6. **Touch device alternative**: Long-press on a slider label in the left panel, then drag up/down to adjust. Out of scope but worth noting for tablet users in review sessions.
