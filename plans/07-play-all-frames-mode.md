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

**Design decision -- mode persistence across source changes:** `PlaybackMode` is a session-level setting, not a per-source setting. It persists when the user loads a new source or switches between sources. This matches desktop OpenRV behavior and is naturally achieved because `PlaybackEngine` is not recreated on source change.

### Core Behavioral Difference

| Behavior | Realtime | Play All Frames |
|----------|----------|-----------------|
| Frame skip on slow decode | Yes (skip after timeout) | No (wait, with absolute timeout safety net) |
| Frame skip on slow render | Yes (accumulator consumes multiple frames) | No (advance at most 1 frame per tick) |
| Audio sync | Enabled | Disabled (audio cannot stay in sync when clock stretches) |
| Effective FPS | Matches target (or close) | May drop significantly below target |
| Starvation handling | Skip frame after `STARVATION_TIMEOUT_MS` | Wait for frame; emit buffering event; absolute 60s timeout as safety net |
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

The starvation timeout block currently skips the frame after `STARVATION_TIMEOUT_MS`. In play-all-frames mode, it should **never** skip (with one exception: the absolute timeout safety net). Instead, it emits a buffering event and keeps waiting:

```ts
// Inside the starvation timeout check:
if (starvation.timedOut) {
  if (this._playbackMode === 'playAllFrames') {
    // Track how long we've been waiting for this specific frame
    this._playAllFramesWaitStart ??= performance.now();
    const waitElapsed = performance.now() - this._playAllFramesWaitStart;

    if (waitElapsed > PLAY_ALL_FRAMES_ABSOLUTE_TIMEOUT_MS) {
      // Safety net: after 60 seconds, the frame is likely undecodable.
      // Skip it, emit a warning, and continue.
      this._playAllFramesWaitStart = null;
      this.emit('frameDecodeTimeout', nextFrame);
      // Fall through to existing skip logic
    } else {
      // Emit buffering event so UI shows a loading indicator
      if (!this._playAllFramesBuffering) {
        this._playAllFramesBuffering = true;
        this.emit('buffering', true);
      }
      // Reset starvation timer to avoid triggering the pause logic,
      // but do NOT consume the frame or advance.
      tc.resetStarvation(this._ts);
      break;
    }
  }
  // ... existing realtime skip/pause logic ...
}
```

When the waited-for frame finally arrives and is consumed:

```ts
// After successfully consuming a cached frame:
if (this._playAllFramesBuffering) {
  this._playAllFramesBuffering = false;
  this._playAllFramesWaitStart = null;
  this.emit('buffering', false);
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

**New constant:**

```ts
// In src/config/TimingConfig.ts
export const PLAY_ALL_FRAMES_ABSOLUTE_TIMEOUT_MS = 60_000; // 60 seconds
```

**Image sequence / reverse path:**

The `accumulateFrames` call already handles capping via the modified controller (see above).

**Audio sync:**

When `_playbackMode === 'playAllFrames'`, disable audio sync:
- Do not call `this._host?.setAudioSyncEnabled(true)` in `play()`.
- Mute or pause the `<video>` element's native audio.
- Skip the drift-correction block that seeks `video.currentTime`.

This is necessary because the video element's built-in audio pipeline runs in wall-clock time and cannot adapt to the variable-rate playback of play-all-frames mode.

### 3. Mode Transition During Active Playback

Switching modes while playback is active is a key workflow -- the artist spots something during realtime playback and switches to ALL mode without pausing. The transitions must be handled explicitly:

**Realtime -> Play All Frames (during playback):**
1. Immediately cap the accumulator to `frameDuration` to prevent a burst of queued-up frames from the grown accumulator.
2. Disable audio sync: call `setAudioSyncEnabled(false)`, mute the video element.
3. Reset `consecutiveStarvationSkips` to 0.
4. Continue playback from the current frame. No pause/resume needed.

**Play All Frames -> Realtime (during playback):**
1. Reset the accumulator and timing state to avoid stale timing (the accumulator may be capped at a low value).
2. Clear any `_playAllFramesWaitStart` and `_playAllFramesBuffering` state.
3. If currently emitting `buffering: true`, emit `buffering: false`.
4. Re-enable audio sync: call `setAudioSyncEnabled(true)`, un-mute the video element.
5. Seek the video element to the current frame time to re-sync audio: `video.currentTime = currentFrame / fps`.
6. Optionally call `safeVideoPlay()` to restart audio playback.

These transitions are implemented in the `playbackMode` setter on `PlaybackEngine`.

### 4. RenderLoopService Changes

No changes needed. The service already re-renders only when `session.currentFrame` changes, which is correct for both modes. In play-all-frames mode, frame changes happen less frequently when decoding is slow, so the render loop naturally throttles.

---

## UI Design

### 1. Mode Indicator on Timeline

Extend the existing playback info text in `Timeline.draw()` (line 774-779) to show the current mode:

**Current:**
```
Playing | 23.8/24 fps | loop
```

**Proposed (realtime -- abbreviated since it is the default):**
```
Playing | 23.8/24 fps | loop | RT
```

**Proposed (play all frames):**
```
Playing | 18.2/24 fps | loop | ALL
```

The `ALL` indicator must use an **amber/orange color** to visually communicate "you are in a non-default mode that affects playback fidelity." This is a safety/QC signal -- the artist needs to know instantly whether frames can be skipped. The `RT` indicator uses the standard text color.

### 2. Native Video Fallback Indicator

When the active source uses the native `<video>` path (non-mediabunny forward playback) and the mode is play-all-frames, both the Timeline and HeaderBar indicators must be **visually dimmed** (e.g., grayed-out `ALL` text with reduced opacity). A tooltip explains: "Play All Frames is not available for this source (native video playback)." A console warning is also logged.

This is necessary because the browser's `<video>` element pipeline is inherently realtime -- there is no mechanism to guarantee every frame is displayed. Play-all-frames mode only has full effect when using mediabunny (WebCodecs) or image sequence playback.

### 3. Mode Indicator on HeaderBar

Add a toggle button in the playback controls group of the HeaderBar, next to the speed control. The button shows:
- `RT` when in realtime mode (clearly visible, standard styling -- not subtle/hidden).
- `ALL` when in play-all-frames mode (highlighted with amber/orange background to match the Timeline indicator).

The button must always be clearly visible so users can discover and use it. The active `ALL` state uses a colored background (not just text), similar to how loop mode and direction buttons are styled.

Clicking the button toggles the mode. Tooltip: "Toggle Play All Frames mode (Ctrl+Shift+A)".

### 4. Keyboard Shortcut

**Action name:** `playback.togglePlaybackMode`
**Default binding:** `Ctrl+Shift+A` (maps to `Cmd+Shift+A` on macOS via the existing `KeyboardManager` convention, consistent with other bindings like `export.quickExport` using `ctrl: true` for cross-platform Ctrl/Cmd handling)
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
3. Add `PLAY_ALL_FRAMES_ABSOLUTE_TIMEOUT_MS = 60_000` to `src/config/TimingConfig.ts`.

### Step 2: Add PlaybackMode to PlaybackEngine

1. Add `_playbackMode` field, getter/setter, `togglePlaybackMode()`, and event emission to `PlaybackEngine`.
2. Add `playbackModeChanged: PlaybackMode` to `PlaybackEngineEvents`.
3. Add `_playAllFramesWaitStart: number | null` and `_playAllFramesBuffering: boolean` fields for starvation tracking.
4. Wire the mode through `update()` for all three playback paths (mediabunny, native video, image/sequence).
5. Modify audio sync logic in `play()` to check mode.
6. Implement mode transition logic in the `playbackMode` setter (see "Mode Transition During Active Playback" section above).

### Step 3: Modify PlaybackTimingController

1. Add `playbackMode` parameter to `accumulateFrames()` (with default value `'realtime'` for backward compatibility).
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
2. Use amber/orange color for the `ALL` indicator.
3. Show dimmed/grayed-out `ALL` when native video path is active and mode is play-all-frames.

### Step 7: Update HeaderBar UI

1. Add a playback mode toggle button to the HeaderBar playback controls section with always-visible styling.
2. Use amber/orange background when ALL mode is active.
3. Listen to `playbackModeChanged` events to update button state.
4. Wire button click to `session.togglePlaybackMode()`.
5. Show dimmed state with explanatory tooltip when native video path is active.

### Step 8: Add PlaybackAPI Method

1. Add `setPlaybackMode(mode: PlaybackMode)` and `getPlaybackMode()` to `PlaybackAPI`.

### Step 9: Persist in Session State

1. Add `playbackMode?: PlaybackMode` to `PlaybackState` in `src/core/session/SessionState.ts`.
2. Update `SessionSerializer.toJSON()` and `fromJSON()` to include the mode.
3. Add to `DEFAULT_PLAYBACK_STATE`.

### Step 10: GTO Export/Import

The GTO `realtime` property has specific semantics from desktop OpenRV: `realtime = 0` means play-all-frames; `realtime > 0` means realtime at the given FPS value. `PlaybackMode` is the authoritative runtime state; on GTO export it maps to the `realtime` property; on GTO import the `realtime` property initializes `PlaybackMode`.

**Bidirectional mapping:**

- **On export:** If `playbackMode === 'playAllFrames'`, write `realtime = 0`. If `playbackMode === 'realtime'`, write `realtime = session.fps` (or the existing `metadata.realtime` value if it was previously set from a GTO import, to preserve the original value).
- **On import:** If `realtime === 0`, set `playbackMode = 'playAllFrames'`. If `realtime > 0`, set `playbackMode = 'realtime'` and use the value as the playback FPS.

Implementation:
1. Update `SessionGTOExporter` to write the `realtime` property based on current `playbackMode`.
2. Update `GTOGraphLoader` to read the `realtime` property and initialize `playbackMode`.

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
   - Buffering events are emitted during play-all-frames starvation wait.
   - Absolute timeout (60s) triggers `frameDecodeTimeout` event and skips the frame.
   - Mode transition during playback: realtime->playAllFrames caps accumulator, disables audio.
   - Mode transition during playback: playAllFrames->realtime resets timing, re-enables audio, re-syncs video element.

3. **Session integration tests** (`src/core/session/Session.playback.test.ts`):
   - Mode persists through `getPlaybackState()` / restore.
   - Event forwarding from engine through session.
   - Mode persists across source changes (loading a new source does not reset the mode).

4. **KeyboardActionMap tests** (`src/services/KeyboardActionMap.test.ts`):
   - `playback.togglePlaybackMode` handler calls `session.togglePlaybackMode()`.

5. **Timeline rendering tests** (`src/ui/components/Timeline.test.ts`):
   - Mode indicator renders `RT` or `ALL` appropriately.
   - `ALL` indicator uses amber/orange color.
   - `ALL` indicator is dimmed for native video sources.

6. **Serialization tests** (`src/core/session/SessionSerializer.test.ts`):
   - Playback mode round-trips through save/load.
   - Missing field defaults to `'realtime'`.

7. **GTO tests** (`src/core/session/SessionGTOExporter.test.ts`, `src/core/session/GTOGraphLoader.test.ts`):
   - Export writes `realtime = 0` for play-all-frames, `realtime = fps` for realtime.
   - Import reads `realtime = 0` as play-all-frames, `realtime > 0` as realtime.

8. **API tests** (`src/api/PlaybackAPI.step.test.ts`):
   - `setPlaybackMode()` and `getPlaybackMode()` work correctly.

9. **Network sync tests** (`src/network/NetworkSyncManager.test.ts`):
   - Sync messages include playback mode.

---

## Files to Create/Modify

### Modified Files

| File | Change |
|------|--------|
| `src/core/types/session.ts` | Add `PlaybackMode` type |
| `src/config/PlaybackConfig.ts` | Add `DEFAULT_PLAYBACK_MODE` constant |
| `src/config/TimingConfig.ts` | Add `PLAY_ALL_FRAMES_ABSOLUTE_TIMEOUT_MS` constant |
| `src/core/session/PlaybackTimingController.ts` | Add `playbackMode` param to `accumulateFrames()`, add `shouldSkipStarvedFrame()` |
| `src/core/session/PlaybackEngine.ts` | Add `_playbackMode` state, modify `update()` for both paths, modify `play()` audio logic, add `togglePlaybackMode()`, add event, add mode transition logic in setter, add buffering events during starvation wait, add absolute timeout safety net |
| `src/core/session/SessionPlayback.ts` | Forward `playbackMode` getter/setter/event |
| `src/core/session/Session.ts` | Forward `playbackMode` getter/setter/event, add to `SessionEvents` |
| `src/services/RenderLoopService.ts` | No changes (already correct) |
| `src/utils/input/KeyBindings.ts` | Add `playback.togglePlaybackMode` binding |
| `src/services/KeyboardActionMap.ts` | Add handler + update `ActionSession` interface |
| `src/ui/components/Timeline.ts` | Show mode indicator in draw() with amber/orange color for ALL; dimmed state for native video |
| `src/ui/components/layout/HeaderBar.ts` | Add mode toggle button with always-visible styling, amber/orange background for ALL, dimmed state for native video |
| `src/api/PlaybackAPI.ts` | Add `setPlaybackMode()` / `getPlaybackMode()` |
| `src/core/session/SessionState.ts` | Add `playbackMode` to `PlaybackState`, update default |
| `src/core/session/SessionSerializer.ts` | Serialize/deserialize mode |
| `src/core/session/SessionGTOExporter.ts` | Export mode to GTO `realtime` property with bidirectional mapping |
| `src/core/session/GTOGraphLoader.ts` | Import mode from GTO `realtime` property |
| `src/network/types.ts` | Include mode in sync playback message |
| `src/network/NetworkSyncManager.ts` | Send/receive mode |
| `src/AppPlaybackWiring.ts` | Wire HeaderBar mode button to session |
| `src/config/index.ts` | Re-export new constants if needed |
| `src/handlers/playbackHandlers.ts` | No changes expected |

### Test Files to Modify

| File | Change |
|------|--------|
| `src/core/session/PlaybackTimingController.test.ts` | Tests for play-all-frames accumulator capping |
| `src/core/session/Session.playback.test.ts` | Integration tests for mode toggle, events, audio disable, mode transitions during playback, mode persistence across source changes |
| `src/core/session/SessionPlayback.test.ts` | Forwarding tests |
| `src/services/KeyboardActionMap.test.ts` | Handler test |
| `src/ui/components/Timeline.test.ts` | Rendering test for mode indicator, amber color, dimmed state |
| `src/core/session/SessionSerializer.test.ts` | Persistence round-trip |
| `src/core/session/SessionGTOExporter.test.ts` | GTO export with bidirectional mapping |
| `src/core/session/GTOGraphLoader.test.ts` | GTO import with bidirectional mapping |
| `src/api/PlaybackAPI.step.test.ts` | API method tests |
| `src/network/NetworkSyncManager.test.ts` | Sync message tests |

### New Files

None. All changes fit into existing files.

---

## Risks

### 1. Memory Pressure in Play-All-Frames Mode

**Risk:** In play-all-frames mode with video, the decoder never skips frames. If decoding is extremely slow (e.g., 4K HDR content on a weak device), the accumulator keeps growing and frame requests pile up. The mediabunny frame cache may grow if frames are decoded ahead but not consumed.

**Mitigation:** The existing `MIN_PLAYBACK_BUFFER` and cache eviction in `VideoSourceNode` / `FramePreloadManager` already limit memory. The key change is that the accumulator is capped to `frameDuration` in play-all-frames mode so no burst of frame requests occurs. Memory pressure is actually *lower* than in realtime mode because the decoder has more time per frame.

### 2. Audio Desync

**Risk:** In play-all-frames mode, wall-clock time and frame time diverge. If audio is left enabled, it will play at normal speed while video lags behind, creating jarring desync.

**Mitigation:** Audio sync is explicitly disabled in play-all-frames mode. The `<video>` element's audio is muted, and `audioSyncEnabled` is set to false. Users who need audio review should use realtime mode. When switching back to realtime mode, audio is re-enabled and the video element is re-synced (see "Mode Transition During Active Playback").

### 3. Native Video Path Limitations

**Risk:** When using the native `<video>` element (non-mediabunny forward playback), the browser controls frame timing. There is no reliable way to force play-all-frames behavior because the browser's media pipeline is inherently realtime.

**Mitigation:** For the native video path, play-all-frames mode will log a warning and fall back to realtime behavior. The UI shows a dimmed `ALL` indicator with an explanatory tooltip (see "Native Video Fallback Indicator" in UI Design).

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

### 8. Undecodable/Corrupt Frames

**Risk:** In play-all-frames mode, the plan disables all skip/pause logic. If a frame is genuinely undecodable (corrupt data), the engine could hang indefinitely.

**Mitigation:** An absolute timeout of 60 seconds (`PLAY_ALL_FRAMES_ABSOLUTE_TIMEOUT_MS`) acts as a safety net. After 60 seconds waiting for a single frame, the engine emits a `frameDecodeTimeout` event (which surfaces as a user-visible warning/toast), skips the frame, and continues to the next one. This is a safety net for truly broken data, not a normal code path.

---

## Review Notes (Future Improvements)

The following items were identified during expert review as valuable but not required for the initial implementation:

1. **Per-source mode override for native video:** Rather than globally dimming the ALL indicator when native video is playing, consider automatically falling back to mediabunny extraction when the user enables play-all-frames mode on a video source. If the source was loaded with native `<video>` because mediabunny was not needed for forward-only playback, the engine could re-initialize with mediabunny on mode switch. This is a significant architectural change and should not block the initial implementation.

2. **Effective FPS graph or history:** In play-all-frames mode, the effective FPS is a key diagnostic metric. A small sparkline or rolling graph next to the FPS readout would help artists quickly see decode performance trends.

3. **Auto-suggest mode based on content:** When loading very high-resolution content (4K+, EXR sequences, HDR video) where realtime playback is unlikely on the current hardware, display a one-time suggestion: "This content may not play at full speed. Consider using Play All Frames mode for QC review."

4. **Network sync mode negotiation:** The current network sync approach (include mode in `sync.playback` messages) is simple. A more robust future approach would be to sync the mode as a separate message type (`sync.playbackMode`) so that frame sync can be loosely coupled, avoiding issues where a fast client in realtime mode sends frame sync messages that a slow client in play-all-frames mode cannot keep up with.

5. **Pingpong loop mode interaction:** In pingpong mode, the `advanceFrame()` method mutates `_playDirection`. If the engine is in play-all-frames mode and hits the end of the range, it reverses direction. The mediabunny path then needs to call `videoSourceNode.setPlaybackDirection()`. The current code does not do this inside the accumulator loop -- it only sets direction in `play()` and `togglePlayDirection()`. This is an existing limitation for pingpong in the mediabunny path (not introduced by this plan), but play-all-frames mode makes pingpong more likely to be used for QC (reviewing a short section back and forth). Worth addressing in a follow-up.
