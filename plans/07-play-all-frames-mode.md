# Plan 07: Play All Frames vs. Realtime Mode

## Overview

Desktop OpenRV provides two distinct playback modes:

- **Realtime mode** (current default): The playback loop is driven by wall-clock time. If a frame takes too long to decode or render, it is skipped so the playback speed matches the target FPS. This is important for audio sync and reviewing at editorial speed.
- **Play All Frames mode**: Every single frame is displayed in order, regardless of how long each one takes to decode. The playback clock stretches to accommodate slow frames, meaning effective FPS may drop below the target, but no frame is ever skipped. This is essential for pixel-accurate QC review.

The web version currently only implements realtime mode. This plan adds Play All Frames as a toggle-able alternative, a visual indicator of the active mode, a live effective-FPS readout (already partially present), and a keyboard shortcut for switching.

---

## Current State

### Playback Architecture Summary

The playback pipeline is layered as follows:

```
RenderLoopService          (rAF loop, calls session.update() each tick)
  -> Session.update()      (delegates to SessionPlayback)
    -> SessionPlayback.update()  (delegates to PlaybackEngine)
      -> PlaybackEngine.update()  (timing + frame advancement)
        -> PlaybackTimingController  (pure timing math)
```

**Key files:**

| File | Role |
|------|------|
| `src/services/RenderLoopService.ts` | Owns the `requestAnimationFrame` loop; calls `session.update()` per tick, renders viewer only when frame changes |
| `src/core/session/PlaybackEngine.ts` | Central playback logic: play/pause, frame advancement, timing accumulator, starvation handling |
| `src/core/session/PlaybackTimingController.ts` | Pure timing math: accumulator, FPS tracking, starvation detection, sub-frame interpolation |
| `src/core/session/SessionPlayback.ts` | Facade that owns PlaybackEngine + VolumeManager + ABCompareManager + AudioCoordinator |
| `src/core/session/Session.ts` | Top-level session; delegates all playback to SessionPlayback |
| `src/config/PlaybackConfig.ts` | Speed presets, starvation thresholds |
| `src/config/TimingConfig.ts` | Starvation timeout constant |

### Current Frame Advancement Logic

`PlaybackEngine.update()` handles three distinct paths:

1. **Mediabunny (frame-gated) path** -- for video with WebCodecs extraction:
   - `PlaybackTimingController.accumulateDelta()` accumulates wall-clock delta.
   - A `while (hasAccumulatedFrame)` loop consumes frames. If the next frame is cached, it advances. If not, it waits (with starvation timeout). After starvation timeout, the frame is **skipped** -- this is the realtime behavior.
   - Starvation skips are counted; after `MAX_CONSECUTIVE_STARVATION_SKIPS` (2), playback pauses.

2. **Native video (forward) path** -- HTML5 `<video>` element drives timing:
   - Frame position is derived from `video.currentTime`. The browser's media pipeline inherently operates in realtime mode and may skip frames.

3. **Image sequence / reverse video path** -- timer-driven:
   - `PlaybackTimingController.accumulateFrames()` computes how many whole frames fit in the elapsed delta.
   - Multiple frames may advance in a single tick (frame skipping for realtime).

### Effective FPS Display

The Timeline component (`src/ui/components/Timeline.ts`, line 775-779) already shows `effectiveFps/targetFps` during playback:
```ts
const fpsDisplay = this.session.isPlaying && effectiveFps > 0
  ? `${effectiveFps.toFixed(1)}/${this.session.fps} fps`
  : `${this.session.fps} fps`;
```

`PlaybackTimingController.trackFrameAdvance()` updates `effectiveFps` every 500ms by counting actually displayed frames.

### What Is Missing

- No concept of a "playback mode" enum (`realtime` vs `playAllFrames`).
- The accumulator always skips frames when behind schedule.
- No UI indicator for mode.
- No keyboard shortcut for toggling.
- No persistence of the mode in session state or GTO export.
- The starvation-skip logic in the mediabunny path always skips on timeout rather than waiting indefinitely.
- Audio sync behavior is not adjusted for play-all-frames mode.

---

## Proposed Architecture

### New Type: `PlaybackMode`

```ts
// In src/core/types/session.ts (alongside LoopMode)
export type PlaybackMode = 'realtime' | 'playAllFrames';
```

### State Ownership

The `PlaybackMode` will be owned by `PlaybackEngine`, following the same pattern as `loopMode`, `playbackSpeed`, and `interpolationEnabled`. It will be:

- Stored as `_playbackMode: PlaybackMode` in `PlaybackEngine`.
- Exposed via getter/setter with event emission (`playbackModeChanged`).
- Forwarded through `SessionPlayback` -> `Session` event chain.
- Persisted in `PlaybackState` (session serializer) and GTO export.

### Core Behavioral Difference

| Behavior | Realtime | Play All Frames |
|----------|----------|-----------------|
| Frame skip on slow decode | Yes (skip after timeout) | No (wait indefinitely) |
| Frame skip on slow render | Yes (accumulator consumes multiple frames) | No (advance at most 1 frame per tick) |
| Audio sync | Enabled | Disabled (audio cannot stay in sync when clock stretches) |
| Effective FPS | Matches target (or close) | May drop significantly below target |
| Starvation handling | Skip frame after `STARVATION_TIMEOUT_MS` | Never skip; wait for frame |
| HDR buffering | Same | Same (initial buffer still useful) |

---

## Playback Loop Changes

### 1. PlaybackTimingController Changes

**`accumulateFrames()` -- image/sequence path:**

Currently returns `framesToAdvance` which can be > 1 (skipping). In play-all-frames mode, cap this to 1:

```ts
accumulateFrames(
  state: TimingState,
  fps: number,
  playbackSpeed: number,
  playDirection: number,
  playbackMode: PlaybackMode = 'realtime',
  now: number = performance.now(),
): { framesToAdvance: number; frameDuration: number } {
  // ... existing accumulation logic ...

  if (playbackMode === 'playAllFrames') {
    // Never skip frames: advance at most 1 per tick
    framesToAdvance = Math.min(framesToAdvance, 1);
    // Don't let accumulator grow unbounded (prevents burst on resume)
    if (framesToAdvance > 0) {
      state.frameAccumulator = Math.min(state.frameAccumulator, frameDuration);
    }
  }

  return { framesToAdvance, frameDuration };
}
```

**New method: `shouldSkipStarvedFrame()`:**

Extract the starvation-skip decision so PlaybackEngine can override it:

```ts
shouldSkipStarvedFrame(playbackMode: PlaybackMode): boolean {
  return playbackMode === 'realtime';
}
```

### 2. PlaybackEngine.update() Changes

**Mediabunny (frame-gated) path:**

The starvation timeout block currently skips the frame after `STARVATION_TIMEOUT_MS`. In play-all-frames mode, it should **never** skip. Instead, it keeps waiting:

```ts
// Inside the starvation timeout check:
if (starvation.timedOut) {
  if (this._playbackMode === 'playAllFrames') {
    // In play-all-frames mode, never skip. Just keep waiting.
    // Reset starvation timer to avoid triggering the pause logic,
    // but do NOT consume the frame or advance.
    tc.resetStarvation(this._ts);
    break;
  }
  // ... existing realtime skip/pause logic ...
}
```

Additionally, in the accumulator loop, in play-all-frames mode the loop should only process one frame per update tick to prevent multi-frame jumps when the accumulator has grown large during a stall:

```ts
// After consuming a cached frame in the mediabunny loop:
if (this._playbackMode === 'playAllFrames') {
  // Only advance one frame per tick in play-all-frames mode
  break;
}
```

**Image sequence / reverse path:**

The `accumulateFrames` call already handles capping via the modified controller (see above).

**Audio sync:**

When `_playbackMode === 'playAllFrames'`, disable audio sync:
- Do not call `this._host?.setAudioSyncEnabled(true)` in `play()`.
- Mute or pause the `<video>` element's native audio.
- Skip the drift-correction block that seeks `video.currentTime`.

This is necessary because the video element's built-in audio pipeline runs in wall-clock time and cannot adapt to the variable-rate playback of play-all-frames mode.

### 3. RenderLoopService Changes

No changes needed. The service already re-renders only when `session.currentFrame` changes, which is correct for both modes. In play-all-frames mode, frame changes happen less frequently when decoding is slow, so the render loop naturally throttles.

---

## UI Design

### 1. Mode Indicator on Timeline

Extend the existing playback info text in `Timeline.draw()` (line 774-779) to show the current mode:

**Current:**
```
▶ Playing | 23.8/24 fps | loop
```

**Proposed (realtime -- abbreviated since it is the default):**
```
▶ Playing | 23.8/24 fps | loop | RT
```

**Proposed (play all frames):**
```
▶ Playing | 18.2/24 fps | loop | ALL
```

The mode abbreviation (`RT` / `ALL`) should be visually distinct -- use a different color or bold text for `ALL` to signal that frame skipping is disabled.

### 2. Mode Indicator on HeaderBar

Add a small toggle button in the playback controls group of the HeaderBar, next to the speed control. The button shows:
- `RT` when in realtime mode (default, subtle styling).
- `ALL` when in play-all-frames mode (highlighted/accented styling).

Clicking the button toggles the mode. Tooltip: "Toggle Play All Frames mode (Ctrl+Shift+A)".

### 3. Keyboard Shortcut

**Action name:** `playback.togglePlaybackMode`
**Default binding:** `Ctrl+Shift+A`
**Description:** "Toggle between Realtime and Play All Frames"

Rationale for `Ctrl+Shift+A`: The `A` key without modifiers is used for the arrow paint tool. `Ctrl+A` is not currently bound but is conventionally "select all". `Ctrl+Shift+A` is free and memorable ("A" for "All frames").

---

## Implementation Steps

### Step 1: Add PlaybackMode Type and Config

1. Add `PlaybackMode` type to `src/core/types/session.ts`.
2. Add default playback mode constant to `src/config/PlaybackConfig.ts`:
   ```ts
   export const DEFAULT_PLAYBACK_MODE: PlaybackMode = 'realtime';
   ```

### Step 2: Add PlaybackMode to PlaybackEngine

1. Add `_playbackMode` field, getter/setter, `togglePlaybackMode()`, and event emission to `PlaybackEngine`.
2. Add `playbackModeChanged: PlaybackMode` to `PlaybackEngineEvents`.
3. Wire the mode through `update()` for all three playback paths (mediabunny, native video, image/sequence).
4. Modify audio sync logic in `play()` to check mode.

### Step 3: Modify PlaybackTimingController

1. Add `playbackMode` parameter to `accumulateFrames()`.
2. Add `shouldSkipStarvedFrame()` method.
3. Ensure all callers pass the mode.

### Step 4: Forward Through SessionPlayback and Session

1. Add `playbackMode` getter/setter to `SessionPlayback` (delegates to engine).
2. Add `playbackModeChanged` event forwarding.
3. Add `playbackMode` getter/setter and `togglePlaybackMode()` to `Session`.
4. Add `playbackModeChanged` to `SessionEvents`.

### Step 5: Add Keyboard Shortcut

1. Add `'playback.togglePlaybackMode'` entry to `DEFAULT_KEY_BINDINGS` in `src/utils/input/KeyBindings.ts`.
2. Add handler in `buildActionHandlers()` in `src/services/KeyboardActionMap.ts`.
3. Add `togglePlaybackMode()` to the `ActionSession` interface.

### Step 6: Update Timeline UI

1. Modify `Timeline.draw()` to include mode indicator in the bottom-right info text.
2. Use distinct styling for the `ALL` indicator.

### Step 7: Update HeaderBar UI

1. Add a playback mode toggle button to the HeaderBar playback controls section.
2. Listen to `playbackModeChanged` events to update button state.
3. Wire button click to `session.togglePlaybackMode()`.

### Step 8: Add PlaybackAPI Method

1. Add `setPlaybackMode(mode: PlaybackMode)` and `getPlaybackMode()` to `PlaybackAPI`.

### Step 9: Persist in Session State

1. Add `playbackMode?: PlaybackMode` to `PlaybackState` in `src/core/session/SessionState.ts`.
2. Update `SessionSerializer.toJSON()` and `fromJSON()` to include the mode.
3. Add to `DEFAULT_PLAYBACK_STATE`.

### Step 10: GTO Export/Import

1. Include `playbackMode` in `SessionGTOExporter` output (map to a numeric property on the session component, consistent with desktop RV's `realtime` property semantics).
2. Parse from GTO in `GTOGraphLoader` -- if the GTO has `realtime = 0` (or a new dedicated property), set play-all-frames mode.

### Step 11: Network Sync

1. Include `playbackMode` in `sync.playback` messages so collaborative viewers stay in the same mode.
2. Update `NetworkSyncManager` to send/receive the mode change.

### Step 12: Tests

1. **PlaybackTimingController tests** (`src/core/session/PlaybackTimingController.test.ts`):
   - `accumulateFrames` with `playAllFrames` caps to 1.
   - `shouldSkipStarvedFrame` returns correct values.

2. **PlaybackEngine tests** (`src/core/session/PlaybackEngine.test.ts` -- new or in `Session.playback.test.ts`):
   - Play-all-frames mode never skips frames in mediabunny path.
   - Play-all-frames mode advances at most 1 frame per tick in image path.
   - Audio sync is disabled in play-all-frames mode.
   - `togglePlaybackMode()` emits event and toggles state.

3. **Session integration tests** (`src/core/session/Session.playback.test.ts`):
   - Mode persists through `getPlaybackState()` / restore.
   - Event forwarding from engine through session.

4. **KeyboardActionMap tests** (`src/services/KeyboardActionMap.test.ts`):
   - `playback.togglePlaybackMode` handler calls `session.togglePlaybackMode()`.

5. **Timeline rendering tests** (`src/ui/components/Timeline.test.ts`):
   - Mode indicator renders `RT` or `ALL` appropriately.

6. **Serialization tests** (`src/core/session/SessionSerializer.test.ts`):
   - Playback mode round-trips through save/load.
   - Missing field defaults to `'realtime'`.

---

## Files to Create/Modify

### Modified Files

| File | Change |
|------|--------|
| `src/core/types/session.ts` | Add `PlaybackMode` type |
| `src/config/PlaybackConfig.ts` | Add `DEFAULT_PLAYBACK_MODE` constant |
| `src/core/session/PlaybackTimingController.ts` | Add `playbackMode` param to `accumulateFrames()`, add `shouldSkipStarvedFrame()` |
| `src/core/session/PlaybackEngine.ts` | Add `_playbackMode` state, modify `update()` for both paths, modify `play()` audio logic, add `togglePlaybackMode()`, add event |
| `src/core/session/SessionPlayback.ts` | Forward `playbackMode` getter/setter/event |
| `src/core/session/Session.ts` | Forward `playbackMode` getter/setter/event, add to `SessionEvents` |
| `src/services/RenderLoopService.ts` | No changes (already correct) |
| `src/utils/input/KeyBindings.ts` | Add `playback.togglePlaybackMode` binding |
| `src/services/KeyboardActionMap.ts` | Add handler + update `ActionSession` interface |
| `src/ui/components/Timeline.ts` | Show mode indicator in draw() |
| `src/ui/components/layout/HeaderBar.ts` | Add mode toggle button |
| `src/api/PlaybackAPI.ts` | Add `setPlaybackMode()` / `getPlaybackMode()` |
| `src/core/session/SessionState.ts` | Add `playbackMode` to `PlaybackState`, update default |
| `src/core/session/SessionSerializer.ts` | Serialize/deserialize mode |
| `src/core/session/SessionGTOExporter.ts` | Export mode to GTO |
| `src/core/session/GTOGraphLoader.ts` | Import mode from GTO |
| `src/network/types.ts` | Include mode in sync playback message |
| `src/network/NetworkSyncManager.ts` | Send/receive mode |
| `src/AppPlaybackWiring.ts` | Wire HeaderBar mode button to session |
| `src/config/index.ts` | Re-export new constant if needed |
| `src/handlers/playbackHandlers.ts` | No changes expected |

### Test Files to Modify

| File | Change |
|------|--------|
| `src/core/session/PlaybackTimingController.test.ts` | Tests for play-all-frames accumulator capping |
| `src/core/session/Session.playback.test.ts` | Integration tests for mode toggle, events, audio disable |
| `src/core/session/SessionPlayback.test.ts` | Forwarding tests |
| `src/services/KeyboardActionMap.test.ts` | Handler test |
| `src/ui/components/Timeline.test.ts` | Rendering test for mode indicator |
| `src/core/session/SessionSerializer.test.ts` | Persistence round-trip |
| `src/core/session/SessionGTOExporter.test.ts` | GTO export |
| `src/core/session/GTOGraphLoader.test.ts` | GTO import |
| `src/api/PlaybackAPI.step.test.ts` | API method tests |
| `src/network/NetworkSyncManager.test.ts` | Sync message tests |

### New Files

None. All changes fit into existing files.

---

## Risks

### 1. Memory Pressure in Play-All-Frames Mode

**Risk:** In play-all-frames mode with video, the decoder never skips frames. If decoding is extremely slow (e.g., 4K HDR content on a weak device), the accumulator keeps growing and frame requests pile up. The mediabunny frame cache may grow if frames are decoded ahead but not consumed.

**Mitigation:** The existing `MIN_PLAYBACK_BUFFER` and cache eviction in `VideoSourceNode` / `FramePreloadManager` already limit memory. The key change is that the accumulator is capped to `frameDuration` in play-all-frames mode so no burst of frame requests occurs.

### 2. Audio Desync

**Risk:** In play-all-frames mode, wall-clock time and frame time diverge. If audio is left enabled, it will play at normal speed while video lags behind, creating jarring desync.

**Mitigation:** Audio sync is explicitly disabled in play-all-frames mode. The `<video>` element's audio is muted, and `audioSyncEnabled` is set to false. Users who need audio review should use realtime mode.

### 3. Native Video Path Limitations

**Risk:** When using the native `<video>` element (non-mediabunny forward playback), the browser controls frame timing. There is no reliable way to force play-all-frames behavior because the browser's media pipeline is inherently realtime.

**Mitigation:** For the native video path, play-all-frames mode will log a warning and fall back to realtime behavior. The mode only has full effect when using mediabunny (WebCodecs) or image sequence playback. The UI could show a subtle indicator (e.g., a dimmed `ALL` label) to signal that the mode is not fully active for native video.

### 4. Network Sync Conflicts

**Risk:** In a collaborative session, if one user is in play-all-frames mode and another in realtime, frame sync messages will conflict because the users advance at different rates.

**Mitigation:** When `sync.playback` messages include the mode, the receiving client should respect the sender's mode. If modes differ, frame sync should be loosely coupled (sync on play/pause/seek, not on every frame advance). This is consistent with how desktop RV handles multi-client sync with different playback capabilities.

### 5. Interaction with Playback Speed

**Risk:** In play-all-frames mode at 2x speed, the accumulator still advances at 2x rate but frames are capped to 1 per tick. Effectively, the playback speed setting becomes meaningless since every frame is shown and speed is limited by decode time.

**Mitigation:** This is expected and matches desktop RV behavior. The speed multiplier still affects the *target* frame duration, meaning the effective FPS display will show the intent vs. reality (e.g., "target: 48 fps, actual: 15 fps"). The UI already handles this via the `effectiveFps/targetFps` readout. No additional mitigation is needed, but the tooltip on the mode button should mention that speed is best-effort in play-all-frames mode.

### 6. Sub-Frame Interpolation Interaction

**Risk:** Sub-frame interpolation (for slow-motion) relies on the accumulator ratio between frames. In play-all-frames mode with accumulator capping, the ratio calculation may behave differently.

**Mitigation:** Sub-frame interpolation is only active when `playbackSpeed < 1` and `interpolationEnabled` is true. In play-all-frames mode, the accumulator is capped to `frameDuration`, so the ratio stays in `[0, 1]` as expected. No special handling is needed.

### 7. HDR Buffering Interaction

**Risk:** HDR initial buffering already delays frame advancement until `MIN_PLAYBACK_BUFFER` frames are decoded. In play-all-frames mode, this is still desirable to give the decoder a head start.

**Mitigation:** No change needed. HDR buffering is orthogonal to the playback mode -- it determines when playback *starts*, not how frames are consumed once started.
