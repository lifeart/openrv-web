# Plan 20: Dual FPS Indicators (Target vs. Actual)

## Overview

Desktop OpenRV displays both a target FPS (from source metadata) and a measured actual FPS on the timeline, giving operators immediate feedback on whether playback is meeting real-time requirements. The web version currently computes effective FPS internally (`PlaybackTimingController.trackFrameAdvance`) and displays it only in the Timeline's bottom-right info text as a compact `actual/target fps` string. There is no standalone, color-coded, always-visible HUD element, no dropped-frame counter, and no ability to position the indicator independently of the timeline.

This plan introduces a dedicated **FPS Indicator** component that:
1. Shows **target FPS** from source metadata alongside **measured actual FPS** (rolling average).
2. Color-codes the display (green / yellow / red) based on actual-vs-target ratio, using the **raw** `effectiveFps` value for threshold comparison (not the EMA-smoothed display value).
3. Can be displayed as a **HUD overlay** on the viewer or embedded in the **timeline** bar.
4. Provides an optional **dropped frame counter** (labeled "skipped" in the UI -- see Review Notes).
5. Updates smoothly without flicker using the existing rolling-average mechanism.
6. Shows the **effective target FPS** when playback speed is not 1x (e.g., `"24.0 / 48 eff. fps (2x)"`).

---

## Current State

### Where FPS lives today

| Layer | File | What it does |
|---|---|---|
| `PlaybackTimingController` | `src/core/session/PlaybackTimingController.ts` | `trackFrameAdvance()` increments `fpsFrameCount` and recalculates `effectiveFps` every 500 ms as a rolling window. |
| `PlaybackEngine` | `src/core/session/PlaybackEngine.ts` | Owns `TimingState` (includes `effectiveFps`, `fpsFrameCount`, `fpsLastTime`). Exposes `effectiveFps` getter (returns 0 when paused). Calls `trackFrameAdvance` inside `advanceFrame()`. |
| `SessionPlayback` | `src/core/session/SessionPlayback.ts` | Delegates `effectiveFps` from `PlaybackEngine`. |
| `Session` | `src/core/session/Session.ts` | Exposes `session.effectiveFps` and `session.fps` (target). |
| `Timeline.draw()` | `src/ui/components/Timeline.ts` (line ~775) | Reads `session.effectiveFps` and `session.fps`, renders `"24.0/24 fps"` in bottom-right corner of the timeline canvas. Only visible during playback. |
| `InfoPanel` | `src/ui/components/InfoPanel.ts` | Has an `fps` field in `InfoPanelData`; the `infoPanelHandlers.ts` passes `session.fps` (target only). No actual FPS. |
| `PerfTrace` | `src/utils/PerfTrace.ts` | Console-only fps log every ~1 second. Not user-facing. |

### What is missing

- **No standalone FPS HUD overlay** -- the only visual is buried in timeline text.
- **No color coding** -- the timeline text is always the same dim color.
- **No dropped frame counter** -- `PerfTrace.count('frame.cacheMiss')` and starvation skips are tracked internally but never surfaced to the user.
- **No configurable position** -- the indicator is locked to the timeline's bottom-right.
- **No smooth interpolation** -- `effectiveFps` updates every 500 ms (discrete jumps). Acceptable for measurement, but the display could benefit from easing between samples for a smoother visual feel.
- **No effective target display at non-1x speeds** -- when playback speed is 2x on a 24fps clip, the user sees "24" as the target, but the effective target is 48fps. This is misleading.

### Related existing patterns

- **TimecodeOverlay** (`src/ui/components/TimecodeOverlay.ts`): DOM-based HUD overlay, positioned absolutely over the viewer canvas, configurable position, font size, background opacity. Managed by `OverlayManager` with lazy creation.
- **CacheIndicator** (`src/ui/components/CacheIndicator.ts`): Session-subscribed component with `scheduleUpdate()` / `requestAnimationFrame` batching, color-coded bar, stats text. Uses `DisposableSubscriptionManager` for robust subscription lifecycle management.
- **OverlayManager** (`src/ui/components/OverlayManager.ts`): Central registry for all viewer overlays. Lazy creation, dispose, dimension updates. New overlays should follow this pattern.

---

## Proposed Architecture

### New class: `FPSIndicator`

A DOM-based HUD overlay (similar to `TimecodeOverlay`) that:
- Subscribes to Session events (`playbackChanged`, `frameChanged`, `fpsChanged`, `sourceLoaded`, `abSourceChanged`).
- Reads `session.fps` (target) and `session.effectiveFps` (actual) on each update cycle.
- Renders two numbers with a color-coded background.
- Optionally shows a dropped frame counter.
- Supports configurable position (same `OverlayPosition` type as TimecodeOverlay).
- Uses `DisposableSubscriptionManager` for subscription lifecycle (following the `CacheIndicator` pattern, not the bare `unsubscribers` array pattern from `TimecodeOverlay`).

### New type: `FPSIndicatorState`

```typescript
export interface FPSIndicatorState {
  enabled: boolean;
  position: OverlayPosition;              // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  showDroppedFrames: boolean;
  showTargetFps: boolean;
  backgroundOpacity: number;              // 0-1
  warningThreshold: number;               // ratio below which color turns yellow (default 0.97)
  criticalThreshold: number;              // ratio below which color turns red (default 0.85)
}
```

### New type: `FPSMeasurement` (internal to PlaybackEngine)

```typescript
export interface FPSMeasurement {
  targetFps: number;
  effectiveTargetFps: number;             // targetFps * playbackSpeed
  actualFps: number;
  droppedFrames: number;                  // cumulative since play() started
  ratio: number;                          // actualFps / effectiveTargetFps, clamped 0-1
  playbackSpeed: number;
}
```

### Integration points

```
PlaybackEngine
  |
  +-- TimingState gains: droppedFrameCount (number)
  |
  +-- PlaybackTimingController gains: trackDroppedFrame(state)
  |
  +-- New event on PlaybackEngine: 'fpsUpdated' emitting FPSMeasurement
  |
SessionPlayback  (forwards 'fpsUpdated')
  |
Session  (forwards 'fpsUpdated')
  |
FPSIndicator  (subscribes to 'fpsUpdated' + 'abSourceChanged', renders)
  |
OverlayManager  (lazy-creates FPSIndicator, manages lifecycle)
  |
Timeline.draw()  (optionally reads FPSMeasurement for color-coded inline display)
```

---

## Measurement Strategy

### Actual FPS (rolling average)

The existing mechanism in `PlaybackTimingController.trackFrameAdvance()` already computes a rolling average every 500 ms:

```typescript
// Current code in PlaybackTimingController.ts line 312-325
trackFrameAdvance(state: TimingState, now = performance.now()): number {
  state.fpsFrameCount++;
  const elapsed = now - state.fpsLastTime;
  if (elapsed >= 500) {
    state.effectiveFps = Math.round((state.fpsFrameCount / elapsed) * 1000 * 10) / 10;
    state.fpsFrameCount = 0;
    state.fpsLastTime = now;
  }
  return state.effectiveFps;
}
```

This 500 ms window provides a good balance between responsiveness and stability. No change needed to the measurement interval.

**Known limitation -- FPS inflation from skipped frames**: The current `trackFrameAdvance()` is called once per `advanceFrame()` invocation. When frames are skipped (starvation timeout or accumulator overflow), `advanceFrame()` is still called for each skipped frame, so they count toward the FPS measurement. This inflates the reported FPS because a frame was "advanced" but not truly rendered to screen. Specifically:
- In the mediabunny path (line 653), when a starvation skip occurs, `advanceFrame()` IS called (line 657), which calls `trackFrameAdvance()`.
- In the non-gated path (lines 722-728), `framesToAdvance` can be > 1, and the loop calls `advanceFrame()` for each frame.

This is a pre-existing measurement issue. The implementation should either fix this by only calling `trackFrameAdvance()` for frames that are actually rendered to screen, or document it as a known limitation. Fixing it would make the dropped frame counter more meaningful -- the displayed FPS would reflect actual rendered frames, and the gap between target and actual would correspond to the dropped count.

**Smoothing for display**: The `FPSIndicator` component will apply a simple exponential moving average (EMA) on the received `effectiveFps` value before rendering, so the number does not jump abruptly:

```typescript
displayedFps = displayedFps * 0.5 + newFps * 0.5;
```

An alpha of 0.5 reaches 90% convergence in approximately 3 updates (1.5 seconds), which provides a responsive display. The 500ms rolling window is already a smoothed signal, so heavier smoothing (e.g., alpha=0.3) would introduce unacceptable lag of ~2.5 seconds. Alternatively, the EMA layer can be removed entirely if the 500ms window proves smooth enough in practice -- desktop RV does not double-smooth its FPS display.

**Critical: The EMA smoothing is for display only.** The color threshold calculation must always use the raw `effectiveFps` value from the `FPSMeasurement`, not the EMA-smoothed `displayedFps`. If the actual FPS drops suddenly from 24 to 12, the color must immediately turn red even if the displayed number is still animating toward 12. This ensures the color coding functions as an early warning system.

### Dropped frame counter

A "dropped frame" in this context is a frame that was skipped during playback due to:
1. **Starvation timeout** -- the mediabunny cache missed and the starvation timeout (5s) was reached, causing the frame to be skipped (line 653 of `PlaybackEngine.ts`).
2. **Frame accumulator overflow** -- in the non-gated path, `accumulateFrames` may compute `framesToAdvance > 1`, meaning intermediate frames were not displayed.

Implementation:
- Add `droppedFrameCount: number` to `TimingState`.
- In `PlaybackTimingController`, add `trackDroppedFrame(state, count = 1)` that increments the counter.
- In `PlaybackTimingController.resetFpsTracking()`, reset `droppedFrameCount` to 0 (resets at play start).
- In `PlaybackEngine.update()`:
  - When a starvation skip occurs (line ~653), call `tc.trackDroppedFrame(this._ts)`.
  - In the non-gated path, when `framesToAdvance > 1`, call `tc.trackDroppedFrame(this._ts, framesToAdvance - 1)`.

### Target FPS

`session.fps` is the canonical target FPS. It is set from source metadata when media is loaded and may be changed by the user. The `FPSIndicator` reads it directly from the session.

**Effective target at non-1x playback speed**: When `playbackSpeed != 1`, the effective target FPS is `targetFps * playbackSpeed`. The `FPSMeasurement` type includes both `targetFps` (source metadata value) and `effectiveTargetFps` (adjusted for speed). The HUD display must show the effective target when speed is not 1x. Display format:
- At 1x speed: `"24.0 / 24 fps"`
- At 2x speed: `"24.0 / 48 eff. fps (2x)"`
- At 0.5x speed: `"12.0 / 12 eff. fps (0.5x)"`

This prevents the misleading scenario where a user running 2x playback on 24fps content sees `"24.0 / 24 fps"` with a green indicator when they are actually running at half the effective target rate.

### Ratio and color thresholds

```typescript
ratio = actualFps / (targetFps * playbackSpeed);
```

**The ratio is always computed from the raw `effectiveFps`, never from the EMA-smoothed display value.**

| Ratio range | Color | Meaning |
|---|---|---|
| >= 0.97 | Green (`--success` / `#4ade80`) | Real-time playback achieved |
| 0.85 - 0.97 | Yellow (`--warning` / `#facc15`) | Slightly behind target |
| < 0.85 | Red (`--error` / `#ef4444`) | Significantly behind target |

The default warning threshold is 0.97 (tightened from 0.95). Professional users notice playback below 97% of the target rate -- for a 24fps timeline, 0.97 corresponds to ~23.3 fps, while 0.95 would allow 22.8 fps to appear green, which is noticeable on motion-critical shots.

Thresholds are configurable via `FPSIndicatorState.warningThreshold` and `criticalThreshold`.

---

## UI Design

### HUD overlay mode (default, enabled by default)

```
+---------------------------------------+
|  [Viewer canvas]                       |
|                                        |
|                        +-------------+ |
|                        | 24.0 / 24   | |  <-- top-right (default)
|                        | fps         | |
|                        | 0 skipped   | |  <-- optional
|                        +-------------+ |
|                                        |
+---------------------------------------+
```

At non-1x playback speed:
```
+---------------------------------------+
|  [Viewer canvas]                       |
|                                        |
|                        +-------------+ |
|                        | 24.0 / 48   | |
|                        | eff. fps(2x)| |
|                        | 0 skipped   | |
|                        +-------------+ |
|                                        |
+---------------------------------------+
```

The overlay is a `<div>` positioned absolutely over the viewer's `canvasContainer`, matching the pattern used by `TimecodeOverlay`.

**Visual design**:
- Monospace font (matches TimecodeOverlay).
- Semi-transparent dark background (configurable opacity, default 0.6).
- Border-radius 4px.
- Actual FPS number is color-coded (green/yellow/red) based on the **raw** ratio (not EMA-smoothed).
- Target FPS is always white/neutral.
- Dropped frame count shown in a smaller font below, colored red when > 0.
- Only visible during playback (auto-hides 2 seconds after pause).
- The indicator is enabled by default. Professional media review tools show FPS by default, and the auto-hide on pause already prevents visual clutter during static frame review. Defaulting to disabled would mean most users never discover the feature.

### Timeline inline mode (enhancement to existing)

The current `Timeline.draw()` already shows `"24.0/24 fps"` in the bottom-right. This will be enhanced:
- Apply color coding to the actual FPS portion (use `ctx.fillStyle` based on ratio thresholds, using raw `effectiveFps`).
- Optionally append dropped frame count: `"24.0/24 fps (2 skipped)"`.
- When playback speed is not 1x, show effective target: `"24.0/48 eff. fps (2x)"`.

### Combined mode

Both HUD and timeline can be active simultaneously. They read the same data from the session.

---

## Implementation Steps

### Step 1: Extend `TimingState` and `PlaybackTimingController`

1. Add `droppedFrameCount: number` to `TimingState` interface (default 0).
2. Add `trackDroppedFrame(state: TimingState, count?: number): void` to `PlaybackTimingController`.
3. In `resetFpsTracking()`, add `state.droppedFrameCount = 0`.
4. Write unit tests in `PlaybackTimingController.test.ts`.

**Files to modify**:
- `src/core/session/PlaybackTimingController.ts`
- `src/core/session/PlaybackTimingController.test.ts`

### Step 2: Wire dropped frame tracking in `PlaybackEngine`

1. Initialize `droppedFrameCount: 0` in the `_ts` object.
2. In the starvation skip branch (~line 653), call `tc.trackDroppedFrame(this._ts)`.
3. In the non-gated `accumulateFrames` path, when `framesToAdvance > 1`, call `tc.trackDroppedFrame(this._ts, framesToAdvance - 1)`.
4. Add backward-compatible accessor: `get droppedFrameCount()`.
5. Write/update tests in `Session.playback.test.ts`.

**Files to modify**:
- `src/core/session/PlaybackEngine.ts`
- `src/core/session/Session.playback.test.ts`

### Step 3: Add `FPSMeasurement` type and event

1. Define `FPSMeasurement` interface in a new file or alongside `PlaybackEngine`. Include `targetFps`, `effectiveTargetFps`, `actualFps`, `droppedFrames`, `ratio`, and `playbackSpeed` fields.
2. Add `'fpsUpdated': FPSMeasurement` event to `PlaybackEngineEvents`.
3. Emit `fpsUpdated` from `PlaybackTimingController.trackFrameAdvance()` when `effectiveFps` changes (i.e., every 500 ms window), passing the full measurement object. The `ratio` field must be computed as `actualFps / effectiveTargetFps`.
4. Forward through `SessionPlayback` -> `Session` event chains.
5. Add `'fpsUpdated'` to `SessionPlaybackEvents` and `SessionEvents`.

**Files to modify**:
- `src/core/session/PlaybackEngine.ts` (event definition + emission)
- `src/core/session/SessionPlayback.ts` (forward event)
- `src/core/session/Session.ts` (forward event + expose `droppedFrameCount` getter)

### Step 4: Create `FPSIndicator` component

Create `src/ui/components/FPSIndicator.ts`:

```typescript
import { Session } from '../../core/session/Session';
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { DisposableSubscriptionManager } from '../../utils/DisposableSubscriptionManager';
import type { OverlayPosition } from './TimecodeOverlay';

export interface FPSIndicatorState {
  enabled: boolean;
  position: OverlayPosition;
  showDroppedFrames: boolean;
  showTargetFps: boolean;
  backgroundOpacity: number;
  warningThreshold: number;
  criticalThreshold: number;
}

export interface FPSIndicatorEvents extends EventMap {
  stateChanged: FPSIndicatorState;
}

export const DEFAULT_FPS_INDICATOR_STATE: FPSIndicatorState = {
  enabled: true,                          // enabled by default for professional workflows
  position: 'top-right',
  showDroppedFrames: true,
  showTargetFps: true,
  backgroundOpacity: 0.6,
  warningThreshold: 0.97,                // tightened from 0.95 for professional use
  criticalThreshold: 0.85,
};
```

Key implementation details:
- DOM structure: outer container (`position: absolute`, positioned like TimecodeOverlay), inner wrapper with background, actual FPS element (color-coded), target FPS element, dropped frame element.
- Subscribe to `session.on('fpsUpdated', ...)` for measurement updates.
- Subscribe to `session.on('playbackChanged', ...)` to show/hide with a 2-second fade-out delay after pause.
- Subscribe to `session.on('abSourceChanged', ...)` to immediately update the target FPS when the user toggles A/B between sources with different frame rates.
- Apply EMA smoothing (`displayedFps = displayedFps * 0.5 + newFps * 0.5`) **for the displayed number only**.
- Color threshold calculation must use the **raw** `effectiveFps` from `FPSMeasurement.actualFps`, never the smoothed `displayedFps`.
- When `FPSMeasurement.playbackSpeed != 1`, display the effective target (`effectiveTargetFps`) and append the speed multiplier (e.g., `"(2x)"`).
- Use CSS variable colors (`--success`, `--warning`, `--error`) resolved at runtime for theme compatibility, following the `CacheIndicator` pattern with `getComputedStyle(document.documentElement).getPropertyValue(...)`.
- Use `DisposableSubscriptionManager` for all subscription lifecycle management (following `CacheIndicator`, not the bare `unsubscribers` array from `TimecodeOverlay`). This properly handles disposal ordering and DOM listener cleanup, preventing subscription leak bugs.
- `dispose()` cleans up all subscriptions via `DisposableSubscriptionManager.dispose()`.

### Step 5: Create `FPSIndicator.test.ts`

Write comprehensive unit tests covering:
- Default state (enabled, top-right position).
- Enable/disable toggle.
- Color coding at different ratio thresholds (using raw values, not smoothed).
- Color coding uses raw `effectiveFps`, not EMA-smoothed value (explicit test: sudden drop from 24 to 12 should immediately show red, even if smoothed display still shows a higher number).
- Dropped frame counter display.
- Position changes.
- Auto-hide after pause.
- EMA smoothing behavior (display value converges over ~1.5 seconds).
- Effective target display at non-1x speeds.
- `abSourceChanged` event triggers target FPS update.
- `DisposableSubscriptionManager` cleanup on dispose.

**Files to create**:
- `src/ui/components/FPSIndicator.test.ts`

### Step 6: Register in `OverlayManager`

1. Add lazy accessor `getFPSIndicator(): FPSIndicator` following the existing pattern.
2. Append the overlay's DOM element to `canvasContainer` on first access.
3. Dispose in `OverlayManager.dispose()`.

**Files to modify**:
- `src/ui/components/OverlayManager.ts`
- `src/ui/components/OverlayManager.test.ts`

### Step 7: Color-code timeline FPS display

Enhance `Timeline.draw()` (around line 775):
1. Compute ratio from `effectiveFps / (session.fps * session.playbackSpeed)` using raw `effectiveFps`.
2. Set `ctx.fillStyle` to green/yellow/red based on thresholds (0.97 and 0.85 defaults).
3. Render actual FPS with the computed color, target FPS in the dim text color.
4. When `playbackSpeed != 1`, show effective target and speed multiplier.
5. Optionally append dropped frame count when > 0 (e.g., `"(2 skipped)"`).

**Files to modify**:
- `src/ui/components/Timeline.ts`
- `src/ui/components/Timeline.test.ts`

### Step 8: Wire keyboard shortcut and controls

1. Add a keyboard shortcut to toggle the FPS indicator (e.g., `Shift+F`).
2. Add the toggle to the View tab in the control panel (via `buildViewTab.ts`).
3. Register in `KeyboardActionMap`.

**Files to modify**:
- `src/services/KeyboardActionMap.ts`
- `src/services/tabContent/buildViewTab.ts`
- `src/AppControlRegistry.ts` or `src/AppKeyboardHandler.ts`

### Step 9: Persistence

1. Save `FPSIndicatorState` in preferences via `PreferencesManager`.
2. Restore on load.

**Files to modify**:
- `src/core/PreferencesManager.ts`
- `src/handlers/persistenceHandlers.ts`

### Step 10: Integration and E2E tests

Write E2E test confirming:
- FPS indicator appears during playback when enabled (enabled by default).
- Color changes when playback is throttled.
- Dropped frame counter increments.
- Indicator hides after pause.
- Effective target updates correctly at non-1x speeds.
- A/B source toggle updates target FPS immediately.

**Files to create**:
- `e2e/fps-indicator.spec.ts`

---

## Files to Create/Modify

### New files

| File | Purpose |
|---|---|
| `src/ui/components/FPSIndicator.ts` | FPS HUD overlay component |
| `src/ui/components/FPSIndicator.test.ts` | Unit tests for FPSIndicator |
| `e2e/fps-indicator.spec.ts` | E2E tests |

### Modified files

| File | Change |
|---|---|
| `src/core/session/PlaybackTimingController.ts` | Add `droppedFrameCount` to `TimingState`, add `trackDroppedFrame()` method |
| `src/core/session/PlaybackTimingController.test.ts` | Tests for dropped frame tracking |
| `src/core/session/PlaybackEngine.ts` | Add `droppedFrameCount` to `_ts` init, wire dropped frame calls, add `fpsUpdated` event with `FPSMeasurement` (including `effectiveTargetFps`), expose `droppedFrameCount` getter |
| `src/core/session/SessionPlayback.ts` | Forward `fpsUpdated` event, expose `droppedFrameCount` |
| `src/core/session/Session.ts` | Forward `fpsUpdated` event in `SessionEvents`, expose `droppedFrameCount` getter |
| `src/core/session/Session.playback.test.ts` | Tests for dropped frame wiring, `fpsUpdated` event, and effective target calculation |
| `src/ui/components/OverlayManager.ts` | Add lazy `getFPSIndicator()` accessor |
| `src/ui/components/OverlayManager.test.ts` | Test FPSIndicator lifecycle |
| `src/ui/components/Timeline.ts` | Color-coded FPS in `draw()`, effective target at non-1x speeds, optional dropped frame text |
| `src/ui/components/Timeline.test.ts` | Tests for color-coded rendering and effective target display |
| `src/services/KeyboardActionMap.ts` | Add FPS indicator toggle action |
| `src/services/tabContent/buildViewTab.ts` | Add FPS indicator toggle to View tab |
| `src/AppControlRegistry.ts` or `src/AppKeyboardHandler.ts` | Wire keyboard shortcut |
| `src/core/PreferencesManager.ts` | Persist FPS indicator state |
| `src/handlers/persistenceHandlers.ts` | Restore FPS indicator state on load |

---

## Risks

### 1. Performance overhead of frequent DOM updates

**Risk**: Updating DOM elements every 500 ms during playback could cause layout thrashing.

**Mitigation**: The FPSIndicator uses `textContent` updates only (no layout-triggering property changes). The 500 ms update interval matches the existing `trackFrameAdvance` window, so no additional timers are needed. The `pointer-events: none` CSS property ensures the overlay does not intercept input events. The component uses `requestAnimationFrame` batching (same pattern as `CacheIndicator`) to coalesce updates.

### 2. Accuracy of dropped frame counter

**Risk**: The dropped frame counter only captures frames skipped by starvation timeout and accumulator overflow. It does not capture browser-level vsync misses or GPU pipeline stalls.

**Mitigation**: Document this as "application-level skipped frames" rather than "display-level dropped frames." The counter is useful for diagnosing decode/cache bottlenecks, which is the primary use case. Future enhancement could integrate `requestVideoFrameCallback` metadata for more precise tracking where supported.

### 3. Confusing display for variable frame rate sources

**Risk**: Some sources may have variable FPS (e.g., screen recordings). The target FPS is a single number, which may not accurately represent the source.

**Mitigation**: Use `session.fps` as the authoritative target, which is set from source metadata at load time. If the source has variable FPS, the actual-vs-target ratio may fluctuate, but this is informative rather than misleading.

### 4. Race between `fpsUpdated` event and UI state

**Risk**: The `fpsUpdated` event fires from the playback engine, which runs inside `requestAnimationFrame`. If the FPSIndicator's DOM update is also batched via rAF, there could be a one-frame delay.

**Mitigation**: Since the update interval is 500 ms (not per-frame), a one-frame delay (16.7 ms) is negligible. The EMA smoothing further masks any micro-latency in the display.

### 5. Overlay stacking with other HUD elements

**Risk**: The FPSIndicator defaults to `top-right`, which may overlap with other overlays (TimecodeOverlay defaults to `top-left`, but user may reposition).

**Mitigation**: The FPSIndicator supports the same four corner positions as other overlays. Users can reposition it to avoid conflicts. A future enhancement could add automatic stacking/offset logic, but this is out of scope for the initial implementation.

### 6. playbackSpeed interaction

**Risk**: When playback speed is not 1x (e.g., 2x or 0.5x), the effective target FPS changes. If the user sets 2x speed on a 24fps clip, the effective target is 48fps.

**Mitigation**: The ratio calculation accounts for playback speed: `ratio = actualFps / (targetFps * playbackSpeed)`. The `FPSMeasurement` type includes `effectiveTargetFps` computed as `targetFps * playbackSpeed`. The HUD display shows the effective target when speed is not 1x: `"24.0 / 48 eff. fps (2x)"`. This makes it clear to the user what rate they are targeting and whether playback is keeping up.

### 7. FPS inflation from skipped frames (pre-existing)

**Risk**: The `trackFrameAdvance()` measurement counts skipped frames as "advanced" frames, inflating the reported FPS. This is a pre-existing issue in the codebase.

**Mitigation**: Either fix this during implementation by only calling `trackFrameAdvance()` for frames actually rendered to screen, or document it as a known limitation. If fixed, the displayed FPS would accurately reflect rendered frame rate, and the gap between target and actual would directly correspond to the skipped frame count. If not fixed, add a code comment explaining the inflation and consider it for a follow-up.

---

## Review Notes (Future Enhancements)

The following items were identified during expert review as valuable but out of scope for v1:

1. **Compact mode for narrow viewers**: When the viewer width is below a threshold (e.g., 300px), collapse the indicator to a single line showing only the actual FPS number with color coding. This is a codebase-wide concern (TimecodeOverlay does not handle this either).

2. **Cumulative dropped frame counter**: Add a `totalDroppedFrames` field that persists across play/pause cycles within a session, in addition to the per-playback `droppedFrameCount`. Useful for long review sessions with multiple play/pause cycles.

3. **Accessibility icons**: Add a small icon (warning triangle for yellow, X-circle for red) next to the color-coded number for users with red-green color vision deficiency (~8% of males). Since the number itself is always displayed alongside the color, the current design is acceptable, but icons would improve accessibility without adding clutter.

4. **"Skipped" vs. "dropped" labeling**: The counter tracks application-level frame skips (starvation timeouts and accumulator overflow), not GPU/display frame drops. Using "skipped" in the UI (as this plan does) avoids confusion with video codec or display-level drops. If desktop RV users expect "dropped," this labeling can be reconsidered.

5. **VFR source indicator**: When the source metadata indicates variable frame rate, consider showing "VFR" or "~30" as the target label rather than a single number.

6. **`requestVideoFrameCallback` integration**: When browser support stabilizes, this could provide more accurate display-level frame drop detection. The codebase currently does not use `requestVideoFrameCallback` anywhere.

7. **FPS history sparkline**: A small inline graph showing FPS over the last 10-30 seconds, similar to DaVinci Resolve's performance overlay.

8. **Export FPS log**: A button or API to export a timestamped FPS log (CSV or JSON) for performance debugging, leveraging `PerfTrace` which already accumulates frame timing data.
