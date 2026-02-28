# Virtual Slider Parameter Editing

## Overview

Desktop OpenRV provides key-activated "virtual sliders" -- the user presses and holds a single letter key (e.g., E for exposure) and then drags the mouse horizontally to adjust the value. The current web version relies exclusively on traditional `<input type="range">` sliders inside the Color Controls panel and the Left Panel sidebar. This plan describes how to add the same modal, key-hold-to-adjust interaction to the web viewer so that colorists can grade without leaving the viewport or opening panels.

### Key mappings (Desktop OpenRV reference)

| Key | Parameter       | Default range       | Fine step |
|-----|-----------------|---------------------|-----------|
| E   | Exposure        | -5 .. +5 stops      | 0.01      |
| Y   | Gamma           | 0.1 .. 4.0          | 0.01      |
| B   | Brightness      | -1 .. +1            | 0.005     |
| H   | Hue Rotation    | 0 .. 360 degrees    | 0.5       |
| S   | Saturation      | 0 .. 2              | 0.005     |
| K   | Contrast        | 0 .. 2              | 0.005     |

Additional controls: `+`/`-` for fine increment, `L` to lock (keep adjusting until toggled off), numeric entry to type an exact value, `Escape` to cancel and restore the original value.

---

## Current State

### Keyboard handling

1. **KeyboardManager** (`src/utils/input/KeyboardManager.ts`) receives `keydown` events, maps `KeyCombination` objects to callbacks, and skips input elements. It only fires on key-*down* -- there is no key-*up* or key-hold tracking.

2. **ActiveContextManager** (`src/utils/input/ActiveContextManager.ts`) provides context scoping (`global`, `paint`, `timeline`, `channel`, `transform`, `viewer`). A virtual-slider mode would need its own context or an override mechanism.

3. **ContextualKeyboardManager** (`src/utils/input/ContextualKeyboardManager.ts`) resolves collisions between same-key bindings in different contexts.

4. **DEFAULT_KEY_BINDINGS** (`src/utils/input/KeyBindings.ts`) and **buildActionHandlers** (`src/services/KeyboardActionMap.ts`) define the full keyboard shortcut map.

### Existing key conflicts (bare-key presses)

| Key | Current binding                   | Notes |
|-----|-----------------------------------|-------|
| E   | `paint.eraser` (Annotate tab)     | Context `paint` (not global) |
| Y   | `panel.vectorscope`               | Global bare key |
| B   | `paint.toggleBrush` (Annotate tab)| Global bare key |
| H   | `panel.histogram`                 | Global bare key |
| S   | `export.quickExport` (Ctrl+S only)| Bare S is **unbound** |
| K   | `playback.stop`                   | Global bare key (JKL system) |

This means E, Y, B, H, K are already bound. The virtual slider system must *not* fire on single tap -- it should only activate when the key is **held** beyond a brief dead-zone time (~150 ms) OR when the mouse moves while the key is held, so the existing tap shortcuts remain functional.

### Color controls pipeline

- **ColorControls** (`src/ui/components/ColorControls.ts`) stores `ColorAdjustments`, provides `getAdjustments()` / `setAdjustments(partial)`, and emits `adjustmentsChanged` (throttled at ~30 fps).
- **AppColorWiring** (`src/AppColorWiring.ts`) subscribes to `adjustmentsChanged`, forwards to `viewer.setColorAdjustments()`, updates scopes, and records debounced history.
- **LeftPanelContent** (`src/ui/layout/panels/LeftPanelContent.ts`) has a secondary set of sliders that sync bidirectionally with `ColorControls`.
- **Viewer** (`src/ui/components/Viewer.ts`) calls `colorPipeline.setColorAdjustments()` and `glRendererManager.setColorAdjustments()`, followed by `scheduleRender()`.
- **ShaderStateManager** (`src/render/ShaderStateManager.ts`) pushes per-frame uniform values (`exposure`, `gamma`, `saturation`, `contrast`, `brightness`, `hueRotation`) into the WebGL2 fragment shader.

All slider changes go through the same `ColorAdjustments` pathway. The virtual slider system only needs to call `colorControls.setAdjustments({ [param]: newValue })` to integrate seamlessly.

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
- **History integration** (record undo/redo entry on commit)

### State machine

```
           keydown(E/Y/B/H/S/K)
  IDLE  ─────────────────────────>  ARMED
   ^                                  │
   │  keyup (no mouse move)           │ pointermove OR held > 150ms
   │  => original shortcut fires      │
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

**ARMED** state is critical: it creates a brief window (~150 ms) where we wait to see if the user intends a tap (existing shortcut) or a hold (virtual slider). If `pointermove` fires with `|movementX| > 2px` during ARMED, we transition to ACTIVE. If the key is released during ARMED without significant mouse motion, we let the original shortcut fire.

### Parameter configuration

```typescript
interface VirtualSliderParam {
  key: NumericAdjustmentKey;      // maps to ColorAdjustments field
  label: string;                  // display name in HUD
  min: number;
  max: number;
  defaultValue: number;           // from DEFAULT_COLOR_ADJUSTMENTS
  coarseStep: number;             // pixels of mouse movement per unit
  fineStep: number;               // +/- key step
  format: (v: number) => string;  // display format
}
```

A static `VIRTUAL_SLIDER_PARAMS` map indexed by `KeyboardEvent.code` provides the config:

```typescript
const VIRTUAL_SLIDER_PARAMS: Record<string, VirtualSliderParam> = {
  KeyE: { key: 'exposure',    label: 'Exposure',    min: -5,   max: 5,   defaultValue: 0,   coarseStep: 0.02,  fineStep: 0.01, format: ... },
  KeyY: { key: 'gamma',       label: 'Gamma',       min: 0.1,  max: 4.0, defaultValue: 1.0, coarseStep: 0.01,  fineStep: 0.01, format: ... },
  KeyB: { key: 'brightness',  label: 'Brightness',  min: -1,   max: 1,   defaultValue: 0,   coarseStep: 0.005, fineStep: 0.005, format: ... },
  KeyH: { key: 'hueRotation', label: 'Hue',         min: 0,    max: 360, defaultValue: 0,   coarseStep: 1.0,   fineStep: 0.5, format: ... },
  KeyS: { key: 'saturation',  label: 'Saturation',  min: 0,    max: 2,   defaultValue: 1.0, coarseStep: 0.005, fineStep: 0.005, format: ... },
  KeyK: { key: 'contrast',    label: 'Contrast',    min: 0,    max: 2,   defaultValue: 1.0, coarseStep: 0.005, fineStep: 0.005, format: ... },
};
```

### Event handling strategy

The virtual slider must intercept keys *before* `KeyboardManager` handles them, but only consume them when the interaction qualifies as a hold. Two approaches:

**Approach A -- Pre-interceptor on `document` (recommended):**
Register a `keydown` listener on `document` at **capture phase** with higher priority than `KeyboardManager`. When a virtual-slider key is detected:
1. Set state to ARMED and record `startTime`.
2. **Do not** call `e.preventDefault()` or `e.stopPropagation()` yet.
3. Register a one-shot `pointermove` listener.
4. If mouse moves significantly or hold time exceeds threshold, call `e.stopImmediatePropagation()` on the *next* keydown repeat event and transition to ACTIVE.
5. On `keyup` during ARMED, let the event propagate naturally (original shortcut fires).

Actually, since we need to intercept the initial `keydown` *and* decide retroactively, we need a slightly different approach:

**Approach B -- Deferred shortcut firing (recommended):**
Add a concept of "deferrable shortcuts" to `KeyboardManager`. When a keydown matches a virtual-slider key, `KeyboardManager` does not fire the handler immediately -- it defers for up to 150 ms. `VirtualSliderController` listens for the same key and, if activated (mouse moved), tells `KeyboardManager` to cancel the deferred handler. If the key is released before activation, `KeyboardManager` fires the original handler.

This approach is cleaner because it keeps event handling centralized.

**Approach C -- Separate key listener with suppression flag:**
`VirtualSliderController` adds its own `keydown`/`keyup` listener at capture phase. When an activator key is pressed, it sets an `isArmed` flag. `KeyboardManager.handleKeydown` checks this flag and skips the binding if the virtual slider has claimed the key. This is the simplest to implement and the recommended starting point.

### Recommended: Approach C

Approach C requires the least refactoring of existing code. The `VirtualSliderController` is given a reference to `KeyboardManager` so it can call `setEnabled(false)` during the armed/active phases for the specific key, or alternatively expose a `suppressNextBinding(code)` method.

---

## Interaction Design

### Activation

1. User presses and **holds** E/Y/B/H/S/K while cursor is over the viewer area.
2. If mouse moves horizontally by more than a 3px dead zone, the virtual slider activates.
3. The HUD overlay appears, the cursor changes to `ew-resize`.

### Adjustment

- **Horizontal mouse movement**: `delta = movementX * coarseStep`. Value is clamped to `[min, max]`.
- **Shift held**: Applies a 0.1x multiplier for fine adjustment.
- **+/- keys**: Increment/decrement by `fineStep`. Works in both ACTIVE and LOCKED states.
- **Numeric entry**: While active, typing digits (0-9), period, and minus sign enters a numeric string. Pressing Enter confirms the typed value. Backspace deletes the last character. The HUD shows the typed string in place of the slider bar.

### Lock mode

- Press `L` while in ACTIVE state to enter LOCKED state. The key can be released; adjustment continues with mouse movement alone.
- Press `L` again or `Enter` to commit and exit.
- Press `Escape` to cancel and restore the pre-activation value.

### Cancellation

- `Escape` at any point cancels the adjustment and restores the value that was in effect before activation.
- Clicking any mouse button also cancels (to avoid interfering with other interactions).

### Commit

- Releasing the activator key (when not locked) commits the current value.
- Pressing `Enter` commits (when locked or during numeric entry).
- Pressing `L` again commits (when locked).

### History integration

When the value is committed, a single undo/redo entry is recorded via `getGlobalHistoryManager().recordAction()`, capturing the pre-activation and committed values. Cancellation records nothing.

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

- The HUD container has `role="status"` and `aria-live="polite"` so screen readers announce changes.
- The parameter name and value are in `aria-label` text.

---

## Implementation Steps

### Phase 1: Core controller and HUD (MVP)

1. **Create `VirtualSliderConfig.ts`** - Parameter configuration map and types.
2. **Create `VirtualSliderHUD.ts`** - DOM element creation, positioning, value display updates, show/hide animation, numeric entry input mode.
3. **Create `VirtualSliderController.ts`** - State machine, event listeners (`keydown`, `keyup`, `pointermove`), integration with `ColorControls.setAdjustments()`, cancel/commit logic.
4. **Wire into App** - Instantiate `VirtualSliderController` in `App.ts` constructor, passing `ColorControls`, the viewer container element, and a reference to `KeyboardManager`.
5. **Add suppression to KeyboardManager** - Add a `suppressKey(code: string)` / `releaseKey(code: string)` mechanism so the virtual slider can prevent the normal shortcut from firing during the armed/active window without disabling all keyboard shortcuts.

### Phase 2: Lock mode and numeric entry

6. **Implement lock state** - `L` key handling within the controller, HUD badge.
7. **Implement numeric entry** - Key accumulation buffer, validation, display mode switch in HUD, Enter/Escape handling.

### Phase 3: History integration and polish

8. **Undo/redo recording** - On commit, record a history entry via `getGlobalHistoryManager().recordAction()`.
9. **Bidirectional sync** - When virtual slider is active, update the `ColorControls` sliders and `LeftPanelContent` sliders in real time (they already react to `setAdjustments()`).
10. **Persistence sync** - Trigger `persistenceManager.syncGTOStore()` on commit (same as current slider path via `AppColorWiring`).
11. **Network sync** - Changes flow through the existing `adjustmentsChanged` event path, so `AppNetworkBridge` and `ExternalPresentation` sync automatically.

### Phase 4: Conflict resolution and context awareness

12. **Dead-zone timing** - Tune the ARMED->ACTIVE transition threshold (default 150 ms / 3px). Make configurable.
13. **Paint context exclusion** - When `activeContextManager.activeContext === 'paint'`, disable virtual slider for `E` and `B` keys (they map to eraser and brush tools).
14. **Custom key bindings** - If the user has rebound E/Y/B/H/S/K to different actions, disable the corresponding virtual slider (check `customKeyBindingsManager.hasCustomBinding()`).

### Phase 5: Tests

15. **Unit tests for VirtualSliderController** - State transitions, value clamping, cancel/commit, lock mode.
16. **Unit tests for VirtualSliderHUD** - DOM creation, display updates, numeric entry.
17. **Integration test** - Simulate keydown, pointermove, keyup sequence; verify `ColorControls.getAdjustments()` reflects the change.

---

## Files to Create/Modify

### New files

| File | Description |
|------|-------------|
| `src/ui/components/VirtualSliderConfig.ts` | `VirtualSliderParam` interface, `VIRTUAL_SLIDER_PARAMS` map, sensitivity constants. |
| `src/ui/components/VirtualSliderHUD.ts` | HUD overlay DOM creation, positioning, slider bar rendering, numeric entry mode, show/hide animation, dispose. |
| `src/ui/components/VirtualSliderController.ts` | State machine (IDLE/ARMED/ACTIVE/LOCKED), event binding, value computation, ColorControls integration, history recording. |
| `src/ui/components/VirtualSliderConfig.test.ts` | Tests for parameter config validation and format functions. |
| `src/ui/components/VirtualSliderHUD.test.ts` | Tests for HUD DOM creation, display updates, numeric entry. |
| `src/ui/components/VirtualSliderController.test.ts` | Tests for state transitions, value clamping, event handling, cancel/commit, lock mode, numeric entry. |

### Modified files

| File | Change |
|------|--------|
| `src/utils/input/KeyboardManager.ts` | Add `suppressKey(code)` / `releaseKey(code)` methods that prevent specific key codes from triggering bindings while suppressed. The `handleKeydown` method checks the suppressed set before dispatching. |
| `src/App.ts` | Import and instantiate `VirtualSliderController` in the constructor, passing dependencies. Wire disposal. |
| `src/services/KeyboardActionMap.ts` | Add `ActionControls` interface extension if the virtual slider controller needs to be accessible from keyboard actions (e.g., a "toggle virtual sliders" action). |
| `src/utils/input/KeyBindings.ts` | Optionally add `'virtualSlider.toggle'` binding for enabling/disabling the feature globally (e.g., `Ctrl+Shift+V`). |
| `src/AppKeyboardHandler.ts` | Update `showShortcutsDialog()` to include a "VIRTUAL SLIDERS" category documenting E/Y/B/H/S/K hold-to-adjust. |
| `src/AppControlRegistry.ts` | No changes needed -- the controller communicates directly with `ColorControls` which is already accessible. |
| `src/AppColorWiring.ts` | No changes needed -- the existing `adjustmentsChanged` event pipeline handles all downstream effects (viewer, scopes, persistence, history debounce). |

---

## Risks

### 1. Key conflict with existing shortcuts

**Risk**: The E, Y, B, H, K keys are already bound to important features (eraser, vectorscope, brush, histogram, playback stop). Changing their behavior could confuse existing users.

**Mitigation**: The hold-vs-tap distinction ensures that quick key presses still trigger the original shortcuts. The 150 ms / 3px dead zone is critical. Additionally, in paint context, E and B virtual sliders are disabled entirely.

### 2. Dead-zone tuning

**Risk**: Too short a dead zone causes accidental slider activations; too long makes the feature feel laggy.

**Mitigation**: Make the thresholds configurable (stored in localStorage or preferences). Start with 150 ms / 3px and adjust based on user testing. Consider allowing users to choose "always activate on hold" (zero dead zone, disables original key tap) as an option.

### 3. Pointer capture on different browsers

**Risk**: `movementX`/`movementY` from `pointermove` may behave differently across browsers or when the pointer leaves the window.

**Mitigation**: Use `element.setPointerCapture(e.pointerId)` on activation so that `pointermove` events continue even if the cursor leaves the viewer. Release capture on commit/cancel. Fall back to `clientX` delta tracking if `movementX` is unreliable.

### 4. Interaction with other viewer modes

**Risk**: Virtual sliders could interfere with spotlight dragging, wipe line dragging, crop handles, spherical projection dragging, or paint strokes if those modes are active.

**Mitigation**: The controller checks `ViewerInputHandler`'s active state (is panning, is drawing, is dragging). If any interaction is in progress, virtual slider activation is suppressed. The controller should only activate when the viewer is in its default idle state.

### 5. Performance during rapid mouse movement

**Risk**: Emitting `adjustmentsChanged` on every `pointermove` (which can fire at 60+ Hz) could cause excessive GPU work.

**Mitigation**: The existing `throttledEmitAdjustments()` in `ColorControls` already caps updates at ~30 fps. Additionally, the WebGL renderer only re-uploads uniforms when values actually change (dirty checking in `ShaderStateManager`). This should be sufficient. If needed, the controller can add its own `requestAnimationFrame` coalescing.

### 6. Accessibility concerns

**Risk**: The virtual slider interaction relies on mouse movement, which is inaccessible to keyboard-only or assistive technology users.

**Mitigation**: The traditional slider panels remain fully functional and are the primary editing interface. The virtual slider is a power-user accelerator, not a replacement. The +/- and numeric entry modes provide keyboard-only adjustment within the virtual slider flow. The HUD uses ARIA roles for screen reader compatibility.

### 7. Mobile / touch devices

**Risk**: Touch devices do not have a concept of "hold a key while moving a finger."

**Mitigation**: The virtual slider feature is desktop-only by design. The `KeyboardManager.shouldSkipEvent` already filters based on input elements. A touch-specific alternative (e.g., long-press on a parameter label then drag) is out of scope for this plan but could be added later.

### 8. State leaks on unexpected interrupts

**Risk**: If the browser tab loses focus, the window is minimized, or a modal dialog appears while a virtual slider is active, the controller could be left in a dangling state.

**Mitigation**: Listen for `blur`, `visibilitychange`, and `focusout` events. On any of these, cancel the current virtual slider operation and restore the original value. The dispose method must clean up all event listeners.
