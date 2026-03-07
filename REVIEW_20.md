# Review: Plan 20 -- Dual FPS Indicators

## Domain Expert Review

### FPS Measurement Accuracy

The `FPSMeasurement` type is well-structured and includes all fields necessary for professional playback monitoring: `targetFps`, `effectiveTargetFps`, `actualFps`, `droppedFrames`, `ratio`, and `playbackSpeed`. The ratio calculation correctly uses `Math.min(1, actualFps / effectiveTargetFps)` to clamp at 1.0, preventing confusing super-100% ratios.

The EMA smoothing implementation is correct. An alpha of 0.5 is applied only to the display value (`displayedFps = displayedFps * 0.5 + newFps * 0.5`), while the color coding uses the raw `FPSMeasurement.ratio`. This means a sudden FPS drop from 24 to 12 will immediately turn the indicator red, even though the displayed number is still converging. This matches the plan's explicit requirement and is the correct design for an early-warning system.

The 500ms measurement window from `PlaybackTimingController.trackFrameAdvance()` is inherited unchanged, which is appropriate -- it provides a good balance between responsiveness and stability for professional review workflows.

### FPS Inflation Issue (Pre-existing, Not Fixed)

The plan identified a pre-existing FPS inflation issue: `trackFrameAdvance()` is called inside `advanceFrame()`, and `advanceFrame()` is called for every frame including skipped ones. In the starvation skip path (PlaybackEngine.ts line 676), after calling `tc.trackDroppedFrame(this._ts)`, the code immediately calls `this.advanceFrame(this._playDirection)` which increments `fpsFrameCount`. In the non-gated accumulator path (lines 749-751), the loop calls `advanceFrame()` for all `framesToAdvance` frames, including the ones tracked as dropped. This means skipped frames inflate the FPS count.

The implementation chose not to fix this, which is acceptable as the plan listed it as optional ("either fix this... or document it as a known limitation"). However, there is no code comment documenting the inflation. This means the dropped frame counter and the displayed FPS can be contradictory: the FPS may show 24.0 (green) while there are dropped frames, because the skipped frames are counted toward FPS measurement.

### Threshold Values

The default thresholds (0.97 warning, 0.85 critical) are well-chosen for professional VFX review. At 24fps, 0.97 corresponds to ~23.3 fps and 0.85 to ~20.4 fps. These are configurable via `FPSIndicatorState` and `FPSIndicatorPrefs`, allowing studio customization.

### Effective Target at Non-1x Speeds

The effective target FPS calculation (`targetFps * playbackSpeed`) is correctly computed in `PlaybackEngine.advanceFrame()` and propagated through the event chain. The display format at non-1x speeds (e.g., `"/ 48 eff. fps (2x)"`) matches the plan specification.

### Dropped Frame Detection

Dropped frame tracking is correctly wired at both detection points:
1. Starvation timeout (PlaybackEngine.ts line 672): `tc.trackDroppedFrame(this._ts)` with count=1.
2. Accumulator overflow (PlaybackEngine.ts line 746): `tc.trackDroppedFrame(this._ts, framesToAdvance - 1)`.

The counter is reset in `resetFpsTracking()` which is called from `play()`, so it resets at each play start. This matches the plan's "per-playback" counter design.

---

## QA Review

### Test Coverage

The test suite is comprehensive with 500 tests passing across 7 test files:

| Test File | Tests | Coverage |
|---|---|---|
| `FPSIndicator.test.ts` | 40 | Default state, toggle, color coding, dropped frames, positions, auto-hide, EMA smoothing, effective target, disposal |
| `PlaybackTimingController.test.ts` | 106 (4 new) | `trackDroppedFrame` increment, batch increment, accumulation, reset |
| `Session.playback.test.ts` | 114 (5 new) | `droppedFrameCount` getter, `fpsUpdated` forwarding, effective target, dropped frames in event, ratio clamping |
| `PreferencesManager.test.ts` | 79 (10 new) | Defaults, persistence, events, clamping, sanitization, invalid data |
| `OverlayManager.test.ts` | 24 (4 new) | Lazy creation, singleton, dispose, DOM attachment |
| `Timeline.test.ts` | 71 (7 new) | Green/yellow/red color coding, paused state, skipped count, effective target, no-skip-when-zero |
| `KeyboardActionMap.test.ts` | 66 (mock updates) | Mock includes `getFPSIndicator` |
| **E2E** (`e2e/fps-indicator.spec.ts`) | 8 | DOM existence, keyboard toggle, view tab button, active state, click toggle, playback visibility, hide after pause, tooltip |

**Test quality**: Tests use numbered IDs (e.g., `FPS-001`, `TML-FPS-001`) for traceability. The critical test `FPS-023` explicitly verifies that color coding uses raw `effectiveFps` (not smoothed) by checking that after a sudden drop, the ratio reads 0.5 while `getDisplayedFps()` is still converging above 12.

### Test Gaps

1. No test verifies that the `fpsUpdated` event is emitted from `PlaybackEngine.advanceFrame()` with correct field values (the Session.playback tests only verify forwarding by manually emitting from `_playback`).
2. No test for the Timeline's `drawMiddleAlignedText` call to verify the full combined string format (e.g., `"Playing | 24.0/24 fps | loop"`).
3. The E2E tests are cautious (using `count >= 0` checks), which means some tests may pass vacuously if the indicator is never created during the test flow.
4. No render-level test verifies the actual DOM text content after `requestAnimationFrame` fires (tests check state but not rendered output).

### Architecture Fit

The implementation follows established codebase patterns correctly:
- **Overlay pattern**: Matches `TimecodeOverlay` with `position: absolute`, `pointer-events: none`, monospace font, semi-transparent background.
- **Lifecycle**: Uses `DisposableSubscriptionManager` (following `CacheIndicator`, not the bare `unsubscribers` array from `TimecodeOverlay`).
- **Lazy creation**: `OverlayManager.getFPSIndicator()` follows the same lazy-creation + DOM append pattern as other overlays.
- **Event forwarding**: `PlaybackEngine` -> `SessionPlayback` -> `Session` chain is consistent with how `playbackChanged`, `frameChanged`, and other events are forwarded.

### Performance Impact

The performance impact on the playback loop is minimal:
- `trackDroppedFrame()` is a single integer addition -- negligible.
- The `fpsUpdated` event emission in `advanceFrame()` fires only when `effectiveFps` changes (every ~500ms), not on every frame. The guard `this._ts.effectiveFps !== prevFps && this._ts.effectiveFps > 0` ensures emission is rate-limited.
- The `FPSIndicator` uses `requestAnimationFrame` batching for DOM updates, and `pointer-events: none` to avoid hit-testing overhead.
- No new timers are introduced (the auto-hide uses a single `setTimeout`).

---

## Issues Found

### CRITICAL

None.

### MAJOR

**MAJOR-1: Persistence not wired to FPSIndicator component**
The `PreferencesManager` has full `FPSIndicatorPrefs` get/set/sanitize/event support, but the `FPSIndicator` component never reads from or writes to preferences. There is no code in `FPSIndicator.ts` that imports or references `PreferencesManager`. There is no code in `persistenceHandlers.ts` for FPS indicator state restoration. This means:
- Toggling the FPS indicator off and reloading the page will reset it to enabled (the default).
- Changing position, thresholds, or opacity will not persist.
- The `PreferencesManager` infrastructure is dead code with no consumer.

Affected files:
- `/Users/lifeart/Repos/openrv-web/src/ui/components/FPSIndicator.ts` -- needs to read prefs on init and write on state changes.
- `/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts` -- needs restoration logic.
- Plan reference: Step 9 ("Persistence") -- `persistenceHandlers.ts` listed as a modified file.

**MAJOR-2: Timeline color-codes entire status line, not just FPS portion**
In `Timeline.ts` (lines 783-788), `ctx.fillStyle` is set to green/yellow/red before calling `drawMiddleAlignedText(...)` which renders the full combined string `"Playing | 24.0/24 fps | loop"`. This means the playback status, the pipe separators, and the loop mode text are all drawn in the FPS color. The plan specifies: "Apply color coding to the actual FPS portion" and "Render actual FPS with the computed color, target FPS in the dim text color." The implementation should draw the FPS portion separately with the color, and the rest in the dim text color.

Affected file: `/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts` (line 799).

**MAJOR-3: FPS indicator not auto-created on playback start**
The `FPSIndicator` is lazy-created via `OverlayManager.getFPSIndicator()`, which is only called when the user interacts with the View tab button or presses the keyboard shortcut. Since the indicator is enabled by default (for professional workflows per the plan), it should be visible during playback without requiring user interaction. The overlay is never auto-created on app load or playback start. The `buildViewTab.ts` does call `viewer.getFPSIndicator()` to wire the button's `stateChanged` listener, which would trigger lazy creation, but only when the View tab content is built -- which may or may not happen before playback.

Affected files:
- `/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts`

### MINOR

**MINOR-1: Dead ternary in FPSIndicator.ts**
In `/Users/lifeart/Repos/openrv-web/src/ui/components/FPSIndicator.ts` lines 240-242:
```typescript
const speedStr = measurement.playbackSpeed % 1 === 0
  ? `${measurement.playbackSpeed}x`
  : `${measurement.playbackSpeed}x`;
```
Both branches produce the identical string. The ternary is redundant. Presumably the integer branch was intended to omit the decimal (e.g., `"2x"` vs `"2.0x"`), but both branches use template literal formatting which preserves the number's default toString().

**MINOR-2: FPSIndicator uses hardcoded hex colors instead of CSS variables**
The plan specifies: "Use CSS variable colors (`--success`, `--warning`, `--error`) resolved at runtime for theme compatibility, following the `CacheIndicator` pattern with `getComputedStyle(document.documentElement).getPropertyValue(...)`." The `CacheIndicator` correctly uses `getComputedStyle(document.documentElement).getPropertyValue('--success')` with hex fallbacks. The `FPSIndicator.ts` and `Timeline.ts` use hardcoded hex values (`#4ade80`, `#facc15`, `#ef4444`) directly without CSS variable resolution. This breaks theme compatibility if a custom theme redefines these variables.

Affected files:
- `/Users/lifeart/Repos/openrv-web/src/ui/components/FPSIndicator.ts` (`getFPSColor()` function)
- `/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts` (lines 784-788)

**MINOR-3: FPS inflation not documented in code**
The plan states: "If not fixed, add a code comment explaining the inflation and consider it for a follow-up." No code comment was added in `PlaybackEngine.advanceFrame()` or `PlaybackTimingController.trackFrameAdvance()` documenting that skipped frames inflate the FPS measurement.

Affected file: `/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts` (line 797, `advanceFrame` method).

**MINOR-4: `warningThreshold` and `criticalThreshold` relationship not validated**
If a user sets `warningThreshold` to 0.5 and `criticalThreshold` to 0.9, the yellow range would be empty (since yellow requires `ratio >= criticalThreshold && ratio < warningThreshold`, but 0.9 > 0.5). The `sanitizeFPSIndicatorPrefs()` function clamps both to 0-1 range but does not enforce `warningThreshold >= criticalThreshold`. The `FPSIndicator.setState()` also does not validate this invariant.

Affected files:
- `/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts` (`sanitizeFPSIndicatorPrefs`)
- `/Users/lifeart/Repos/openrv-web/src/ui/components/FPSIndicator.ts` (`setState`)

**MINOR-5: HUD display format slightly differs from plan**
The plan specifies the HUD should show `"24.0 / 24 fps"` (with spaces around the slash) as a single line. The implementation splits it into two DOM elements: the actual FPS element shows `"24.0 fps"` and the target element shows `"/ 24 fps"`. This is a valid layout choice but means the format is `"24.0 fps\n/ 24 fps"` (vertically stacked) rather than the single-line `"24.0 / 24 fps"` shown in the plan's ASCII art.

---

## Missing from Plan

| Plan Step | Status | Notes |
|---|---|---|
| Step 1: Extend TimingState + PlaybackTimingController | Done | `droppedFrameCount` added, `trackDroppedFrame()` added, reset in `resetFpsTracking()`. |
| Step 2: Wire dropped frame tracking in PlaybackEngine | Done | Starvation skip and accumulator overflow both tracked. `droppedFrameCount` getter exposed. |
| Step 3: FPSMeasurement type and event | Done | Type defined, event emitted from `advanceFrame()`, forwarded through SessionPlayback -> Session. |
| Step 4: Create FPSIndicator component | Done | DOM-based overlay, EMA smoothing, color coding, auto-hide. |
| Step 5: FPSIndicator.test.ts | Done | 40 tests covering all specified scenarios. |
| Step 6: Register in OverlayManager | Done | Lazy accessor, DOM append, dispose. |
| Step 7: Color-code timeline FPS display | Partial | Color coding works but applies to entire status line (MAJOR-2). |
| Step 8: Keyboard shortcut and controls | Done | `Ctrl+Shift+F` shortcut, View tab button, `KeyboardActionMap` registered. |
| Step 9: Persistence | **Partial** | `PreferencesManager` infrastructure exists but is not consumed by `FPSIndicator` or `persistenceHandlers` (MAJOR-1). |
| Step 10: E2E tests | Done | 8 E2E test cases covering indicator lifecycle, toggle, and keyboard shortcut. |

Additional items from the plan not implemented:
- `persistenceHandlers.ts` was listed as a modified file but has no changes.
- The plan mentioned `'fpsUpdated'` should be added to `SessionPlaybackEvents` -- this is done.
- The plan mentioned subscribing to `sourceLoaded` event in FPSIndicator -- not subscribed, but `abSourceChanged` is subscribed which covers the A/B source switch case.
- The plan noted CSS variable usage for theme compatibility -- hardcoded hex values used instead (MINOR-2).

---

## Recommendations

1. **Wire persistence end-to-end (MAJOR-1)**: In `FPSIndicator` constructor, read `PreferencesManager.getFPSIndicatorPrefs()` to initialize state. In `setState()`, write back to `PreferencesManager.setFPSIndicatorPrefs()`. In `persistenceHandlers.ts`, add a listener for `fpsIndicatorPrefsChanged` if any cross-component sync is needed.

2. **Fix timeline color scope (MAJOR-2)**: Split the `drawMiddleAlignedText` call into three separate `fillText` calls: one for the status portion in dim color, one for the FPS portion in the computed color, and one for the loop mode in dim color. Alternatively, use `ctx.measureText()` to position separate draw calls.

3. **Ensure FPSIndicator is created eagerly or on first playback (MAJOR-3)**: Either create the `FPSIndicator` eagerly in `OverlayManager` constructor, or have the Viewer/App wire a `playbackChanged` listener that calls `getFPSIndicator()` on first play, ensuring the overlay subscribes to events before the first `fpsUpdated` is emitted.

4. **Use CSS variables for colors (MINOR-2)**: Replace hardcoded hex values in `getFPSColor()` and `Timeline.ts` with `getComputedStyle(document.documentElement).getPropertyValue('--success')` etc., following the `CacheIndicator` pattern. Keep hex values as fallbacks.

5. **Add code comment for FPS inflation (MINOR-3)**: Add a JSDoc note on `advanceFrame()` explaining that `trackFrameAdvance()` counts skipped frames, inflating the reported FPS. Reference this plan's Risk #7 for context.

6. **Clean up dead ternary (MINOR-1)**: Replace the redundant ternary with a direct template literal, or implement the intended formatting (e.g., `Number.isInteger(speed) ? speed + 'x' : speed.toFixed(1) + 'x'`).

7. **Validate threshold ordering (MINOR-4)**: In `sanitizeFPSIndicatorPrefs`, add a check: if `warningThreshold < criticalThreshold`, swap them or reset to defaults.
