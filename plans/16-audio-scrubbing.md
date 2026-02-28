# Plan 16: Audio Scrubbing

## Overview

Desktop OpenRV provides audio feedback during frame-by-frame stepping and timeline scrubbing, giving editors an auditory reference that helps them locate dialogue cues, sound effects, and music beats without entering full playback. The web version already has volume control, mute/unmute, pitch preservation, Web Audio API playback, and a basic `scrubToFrame()` method on `AudioPlaybackManager`, but lacks a complete, user-controllable audio scrubbing system with an enable/disable toggle, variable speed handling, and proper integration across all scrubbing surfaces (timeline drag, viewer interaction, keyboard frame stepping).

This plan describes how to extend the existing audio infrastructure into a full audio scrubbing feature that covers snippet playback on frame steps, continuous audio during timeline drag, variable speed handling, an enable/disable toggle persisted across sessions, and proper buffer management.

## Current State

### What Already Exists

1. **`AudioPlaybackManager`** (`src/audio/AudioPlaybackManager.ts`)
   - Already has a `scrubToFrame(frame, fps)` method (lines 438-463).
   - Implements debounced snippet playback: 50ms snippets with 30ms debounce.
   - Maintains a dedicated `scrubSourceNode` separate from the main playback `sourceNode`.
   - Stops previous scrub snippets before scheduling new ones.
   - Handles edge cases: no audio loaded, suspended AudioContext, boundary clamping.
   - Has comprehensive tests in `AudioPlaybackManager.test.ts` (SCRUB-001 through SCRUB-005).

2. **`AudioCoordinator`** (`src/audio/AudioCoordinator.ts`)
   - Routes between Web Audio API and HTMLVideoElement audio paths.
   - `onFrameChanged()` method (line 106) already calls `this._manager.scrubToFrame(frame, fps)` when `isPlaying` is false.
   - This means every `frameChanged` event emitted while paused already triggers a scrub snippet.

3. **`SessionPlayback`** (`src/core/session/SessionPlayback.ts`)
   - Forwards `frameChanged` events from `PlaybackEngine` to `AudioCoordinator.onFrameChanged()` (line 437).
   - This is the integration point where frame changes reach the audio system.

4. **`PlaybackEngine`** (`src/core/session/PlaybackEngine.ts`)
   - `stepForward()` / `stepBackward()` methods pause playback and call `advanceFrame()`.
   - `currentFrame` setter emits `frameChanged` event.
   - `goToFrame()` sets `currentFrame`, which emits `frameChanged`.

5. **`Timeline`** (`src/ui/components/Timeline.ts`)
   - `seekToPosition()` calls `session.goToFrame(frame)` during drag (lines 410-422).
   - Pointer events: `onPointerDown` starts drag, `onPointerMove` continues, `onPointerUp` ends.
   - No scrub-specific audio integration; relies on `goToFrame` -> `frameChanged` -> `AudioCoordinator` chain.

6. **`VolumeManager`** (`src/core/session/VolumeManager.ts`)
   - Manages volume, mute, preservesPitch, audioSyncEnabled.
   - No audio scrubbing toggle exists here.

7. **`SessionState`** (`src/core/session/SessionState.ts`)
   - `PlaybackState` interface has `volume`, `muted` but no `audioScrubEnabled` field.

### What Is Missing

1. **No enable/disable toggle** -- Audio scrubbing is always active when audio is loaded and `frameChanged` fires while paused. Users have no way to disable scrub audio without muting entirely.

2. **No variable speed handling** -- The current 50ms snippet at constant pitch does not adapt to scrubbing speed. Fast timeline drags produce a rapid fire of 50ms snippets with 30ms gaps, which sounds choppy. Slow frame stepping uses the same snippet duration regardless of dwell time.

3. **No fade envelope** -- Scrub snippets start and stop abruptly, causing audible clicks/pops at the snippet boundaries.

4. **No speed-adaptive snippet duration** -- Desktop OpenRV varies snippet length based on scrub velocity: slow scrub plays longer snippets, fast scrub plays shorter ones.

5. **No continuous scrub mode** -- During timeline drag, the audio should feel continuous rather than discrete snippet bursts.

6. **No UI toggle** -- No button or menu item to enable/disable audio scrubbing independently of the volume control.

7. **No session persistence** -- The scrubbing preference is not saved/restored with the project state.

## Proposed Architecture

### Design Principles

- **Minimal new files**: Extend existing classes (`AudioPlaybackManager`, `AudioCoordinator`, `VolumeManager`, `SessionState`) rather than creating a separate scrub engine.
- **Single responsibility**: `AudioPlaybackManager` owns all scrub audio mechanics. `AudioCoordinator` owns the routing decision. `VolumeManager` owns the toggle state.
- **Backward compatible**: The existing `scrubToFrame()` API remains but gains internal improvements.
- **Testable**: All new logic is unit-testable with the existing mock patterns.

### Data Flow

```
User drags timeline / presses arrow key
  -> Timeline.seekToPosition() / KeyboardActionMap.stepForward()
  -> Session.goToFrame() / Session.stepForward()
  -> PlaybackEngine.currentFrame setter / PlaybackEngine.advanceFrame()
  -> PlaybackEngine emits 'frameChanged'
  -> SessionPlayback.forwardPlaybackEngineEvents() handler
  -> AudioCoordinator.onFrameChanged(frame, fps, isPlaying=false)
  -> [NEW] Check audioScrubEnabled via VolumeManager
  -> AudioPlaybackManager.scrubToFrame(frame, fps)
  -> [IMPROVED] Velocity-adaptive snippet with fade envelope
  -> Web Audio API: AudioBufferSourceNode.start(0, offset, duration)
```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| `AudioPlaybackManager` | Scrub snippet mechanics: velocity tracking, adaptive duration, fade envelopes, buffer source lifecycle |
| `AudioCoordinator` | Gating: checks `audioScrubEnabled` before forwarding to manager; communicates scrub state to host |
| `VolumeManager` | Owns the `audioScrubEnabled` boolean; exposes getter/setter with callback notification |
| `AudioAPI` | Public API: `enableAudioScrub()`, `disableAudioScrub()`, `isAudioScrubEnabled()` |
| `SessionState` | Persistence: `audioScrubEnabled` field in `PlaybackState` |
| `Timeline` | Signals scrub start/end to `AudioCoordinator` for continuous mode |
| `HeaderBar` / UI | Toggle button or menu item for audio scrubbing |

## Web Audio Design

### Velocity-Adaptive Snippet Duration

Track the time between consecutive `scrubToFrame()` calls to estimate scrub velocity:

```typescript
// In AudioPlaybackManager
private lastScrubTime = 0;
private lastScrubFrame = 0;

private computeSnippetDuration(frame: number, fps: number): number {
  const now = performance.now();
  const dt = now - this.lastScrubTime; // ms since last scrub call

  this.lastScrubTime = now;
  this.lastScrubFrame = frame;

  if (dt <= 0 || dt > 500) {
    // First scrub or long pause between scrubs -> standard duration
    return SCRUB_SNIPPET_DURATION_DEFAULT; // 80ms
  }

  // Estimate frames/second of scrubbing
  const scrubFps = 1000 / dt;

  // At low scrub speed (< 5 fps), use longer snippets (up to 120ms)
  // At high scrub speed (> 30 fps), use shorter snippets (down to 30ms)
  const t = clamp((scrubFps - 5) / 25, 0, 1); // normalized 0..1
  return lerp(SCRUB_SNIPPET_DURATION_MAX, SCRUB_SNIPPET_DURATION_MIN, t);
}
```

**Constants:**
```typescript
static readonly SCRUB_SNIPPET_DURATION_MIN = 0.03;  // 30ms - fast scrub
static readonly SCRUB_SNIPPET_DURATION_DEFAULT = 0.08; // 80ms - single step
static readonly SCRUB_SNIPPET_DURATION_MAX = 0.12;  // 120ms - slow scrub
static readonly SCRUB_DEBOUNCE_MS = 16; // Reduced from 30ms to ~1 frame at 60Hz
static readonly SCRUB_FADE_DURATION = 0.005; // 5ms fade in/out
```

### Fade Envelope (Click/Pop Prevention)

Use a `GainNode` between the scrub source and the main gain node to apply a short fade-in and fade-out envelope:

```typescript
private playScrubSnippet(frame: number, fps: number): void {
  if (!this.audioBuffer || !this.audioContext || !this.gainNode) return;

  const timestamp = (frame - 1) / fps;
  const clampedTime = clamp(timestamp, 0, this.audioBuffer.duration);
  const snippetDuration = this.computeSnippetDuration(frame, fps);
  const effectiveDuration = Math.min(snippetDuration, this.audioBuffer.duration - clampedTime);
  if (effectiveDuration <= 0) return;

  const snippetNode = this.audioContext.createBufferSource();
  snippetNode.buffer = this.audioBuffer;

  // Create per-snippet gain node for fade envelope
  const envelopeGain = this.audioContext.createGain();
  const now = this.audioContext.currentTime;
  const fadeDuration = AudioPlaybackManager.SCRUB_FADE_DURATION;

  // Fade in
  envelopeGain.gain.setValueAtTime(0, now);
  envelopeGain.gain.linearRampToValueAtTime(1, now + fadeDuration);

  // Fade out
  const fadeOutStart = now + effectiveDuration - fadeDuration;
  if (fadeOutStart > now + fadeDuration) {
    envelopeGain.gain.setValueAtTime(1, fadeOutStart);
    envelopeGain.gain.linearRampToValueAtTime(0, now + effectiveDuration);
  }

  snippetNode.connect(envelopeGain);
  envelopeGain.connect(this.gainNode);

  snippetNode.start(0, clampedTime, effectiveDuration);
  this.scrubSourceNode = snippetNode;
  this.scrubEnvelopeNode = envelopeGain;

  snippetNode.onended = () => {
    if (this.scrubSourceNode === snippetNode) {
      this.scrubSourceNode = null;
      envelopeGain.disconnect();
      this.scrubEnvelopeNode = null;
    }
  };
}
```

### Continuous Scrub Mode (Timeline Drag)

When the user is actively dragging the timeline, the AudioCoordinator enters "continuous scrub" mode. In this mode:

1. The debounce timer is bypassed (or reduced to a single frame).
2. Snippets overlap slightly by starting the new snippet before the old one fully fades out.
3. The snippet start position is computed from the drag velocity to avoid repeating the same audio region.

The Timeline signals drag start/end to the AudioCoordinator:

```typescript
// AudioCoordinator
onScrubStart(): void {
  this._isScrubbing = true;
  this._manager.setScrubMode('continuous');
}

onScrubEnd(): void {
  this._isScrubbing = false;
  this._manager.setScrubMode('discrete');
}
```

`AudioPlaybackManager` uses the mode to adjust debounce behavior:

```typescript
scrubToFrame(frame: number, fps: number): void {
  // ... existing guards ...

  this.stopScrubSnippet();

  if (this.scrubMode === 'continuous') {
    // No debounce in continuous mode -- play immediately
    this.playScrubSnippet(frame, fps);
  } else {
    // Discrete mode -- debounce as before (but with reduced 16ms timer)
    if (this.scrubDebounceTimer !== null) {
      clearTimeout(this.scrubDebounceTimer);
    }
    this.scrubDebounceTimer = setTimeout(() => {
      this.scrubDebounceTimer = null;
      this.playScrubSnippet(frame, fps);
    }, AudioPlaybackManager.SCRUB_DEBOUNCE_MS);
  }
}
```

### Buffer Management

No new buffer allocation is needed. The existing `audioBuffer` (decoded once on load) is reused for all scrub snippets via `AudioBufferSourceNode.start(0, offset, duration)`, which reads directly from the shared buffer without copying. The per-snippet `GainNode` for fade envelopes is lightweight (no sample data) and is disconnected/GC'd when the snippet ends.

Memory overhead per active scrub snippet:
- 1 `AudioBufferSourceNode` (references shared buffer, no copy)
- 1 `GainNode` (envelope)
- Both are disconnected and eligible for GC on `onended`

## Implementation Steps

### Step 1: Add Audio Scrub Toggle to VolumeManager

Add the `audioScrubEnabled` property with callback notification, following the existing pattern for `preservesPitch`.

**Changes to `src/core/session/VolumeManager.ts`:**
- Add `_audioScrubEnabled: boolean = true` private field (enabled by default).
- Add `audioScrubEnabled` getter/setter with callback: `onAudioScrubEnabledChanged(enabled: boolean)`.
- Extend `VolumeManagerCallbacks` interface with `onAudioScrubEnabledChanged`.

**Test file:** Update `src/core/session/VolumeManager.test.ts` with tests for the new property.

### Step 2: Wire Toggle Through AudioCoordinator

Gate scrub audio on the new toggle.

**Changes to `src/audio/AudioCoordinator.ts`:**
- Add `onAudioScrubEnabledChanged(enabled: boolean)` method that stores the state.
- Modify `onFrameChanged()` to check `_audioScrubEnabled` before calling `scrubToFrame()`.
- Add `onScrubStart()` / `onScrubEnd()` methods for continuous scrub mode.

**Changes to `src/core/session/SessionPlayback.ts`:**
- Wire `VolumeManager.onAudioScrubEnabledChanged` callback to `AudioCoordinator.onAudioScrubEnabledChanged()`.
- Expose `audioScrubEnabled` getter/setter delegating to `VolumeManager`.
- Add `audioScrubEnabledChanged: boolean` event to `SessionPlaybackEvents`.

**Test file:** Update `src/audio/AudioCoordinator.test.ts` with tests for the gating behavior.

### Step 3: Improve Scrub Snippet Quality in AudioPlaybackManager

Enhance the existing scrub implementation with velocity-adaptive duration, fade envelopes, and continuous/discrete modes.

**Changes to `src/audio/AudioPlaybackManager.ts`:**
- Add velocity tracking fields: `lastScrubTime`, `lastScrubFrame`.
- Add `scrubEnvelopeNode: GainNode | null` field.
- Add `scrubMode: 'discrete' | 'continuous'` field with `setScrubMode()` method.
- Replace the constant `SCRUB_SNIPPET_DURATION` with `SCRUB_SNIPPET_DURATION_MIN`, `SCRUB_SNIPPET_DURATION_DEFAULT`, `SCRUB_SNIPPET_DURATION_MAX`.
- Reduce `SCRUB_DEBOUNCE_MS` from 30 to 16.
- Add `SCRUB_FADE_DURATION = 0.005`.
- Add `computeSnippetDuration(frame, fps)` private method.
- Rewrite `playScrubSnippet()` to use fade envelope and adaptive duration.
- Update `stopScrubSnippet()` to disconnect envelope node.
- Update `scrubToFrame()` to support continuous mode (no debounce).
- Update `dispose()` to clean up new nodes.

**Test file:** Update `src/audio/AudioPlaybackManager.test.ts`:
- SCRUB-006: velocity-adaptive duration -- slow scrub produces longer snippets.
- SCRUB-007: velocity-adaptive duration -- fast scrub produces shorter snippets.
- SCRUB-008: fade envelope GainNode is created and connected.
- SCRUB-009: continuous mode bypasses debounce.
- SCRUB-010: scrub mode can be toggled between discrete and continuous.
- SCRUB-011: envelope GainNode is disconnected on snippet end.
- SCRUB-012: dispose cleans up envelope node.

### Step 4: Expose Through Session and Public API

Make the toggle accessible from Session and the public API.

**Changes to `src/core/session/Session.ts`:**
- Add `audioScrubEnabled` getter/setter delegating to `SessionPlayback`.
- Forward `audioScrubEnabledChanged` event.

**Changes to `src/api/AudioAPI.ts`:**
- Add `enableAudioScrub()`, `disableAudioScrub()`, `isAudioScrubEnabled()`, `setAudioScrubEnabled(enabled: boolean)` methods.

**Changes to `src/api/EventsAPI.ts`:**
- Document the new `audioScrubEnabledChanged` event.

**Test file:** Update `src/api/OpenRVAPI.test.ts` with tests for the new API methods.

### Step 5: Wire Timeline Drag to Continuous Scrub Mode

Signal scrub start/end from the Timeline to enable continuous scrub during drag.

**Changes to `src/ui/components/Timeline.ts`:**
- In `onPointerDown`: call `session.onScrubStart()` (new method) or emit a scrub event.
- In `onPointerUp`: call `session.onScrubEnd()`.

**Changes to `src/core/session/Session.ts`:**
- Add `onScrubStart()` / `onScrubEnd()` methods that delegate to `SessionPlayback`.

**Changes to `src/core/session/SessionPlayback.ts`:**
- Add `onScrubStart()` / `onScrubEnd()` methods that delegate to `AudioCoordinator`.

**Test file:** Update `src/ui/components/Timeline.test.ts` with tests for scrub mode signaling.

### Step 6: Add UI Toggle

Add a toggle for audio scrubbing in the header bar or volume control area.

**Option A (Preferred): Add to VolumeControl popup**
- When the volume slider is expanded, show a small "Scrub Audio" checkbox/toggle below it.
- This groups audio-related controls together.

**Option B: Add to HeaderBar menu**
- Add an "Audio Scrub" toggle item in the playback or audio section of the header menu.

**Changes to `src/ui/components/VolumeControl.ts`:**
- Add a checkbox element for "Scrub Audio" toggle.
- Emit `audioScrubChanged: boolean` event when toggled.
- Add `syncAudioScrub(enabled: boolean)` for external sync (same pattern as `syncMuted`).

**Changes to `src/AppPlaybackWiring.ts`:**
- Wire `volumeControl.on('audioScrubChanged')` to `session.audioScrubEnabled`.
- Wire `session.on('audioScrubEnabledChanged')` to `volumeControl.syncAudioScrub()`.

**Test files:**
- Update `src/ui/components/VolumeControl.test.ts`.
- Update `src/AppPlaybackWiring.test.ts`.

### Step 7: Persist Toggle in Session State

Save and restore the audio scrubbing preference.

**Changes to `src/core/session/SessionState.ts`:**
- Add `audioScrubEnabled?: boolean` to `PlaybackState` interface (optional for backward compat).
- Add `audioScrubEnabled: true` to `DEFAULT_PLAYBACK_STATE`.

**Changes to `src/core/session/SessionSerializer.test.ts`:**
- Add serialization/deserialization tests for the new field.

**Changes to `src/core/session/SessionGTOExporter.ts`:**
- Include `audioScrubEnabled` in the GTO playback state export.

**Changes to `src/core/session/GTOGraphLoader.ts`:**
- Restore `audioScrubEnabled` when loading GTO state.

### Step 8: Integration Testing

**Changes to `src/__e2e__/AudioMixer.e2e.test.ts`:**
- Add integration tests for the complete scrub flow: timeline drag -> frame change -> audio snippet.
- Test toggle on/off behavior end-to-end.

**New tests in `src/audio/AudioCoordinator.test.ts`:**
- AC-050: `onFrameChanged` with `audioScrubEnabled=false` does not call `scrubToFrame`.
- AC-051: `onScrubStart`/`onScrubEnd` toggles continuous mode on the manager.
- AC-052: `onAudioScrubEnabledChanged` stops any active scrub snippet.

## Files to Create/Modify

### Files to Modify

| File | Change Summary |
|---|---|
| `src/audio/AudioPlaybackManager.ts` | Velocity-adaptive duration, fade envelope, continuous/discrete mode, new constants |
| `src/audio/AudioPlaybackManager.test.ts` | SCRUB-006 through SCRUB-012: new scrub quality tests |
| `src/audio/AudioCoordinator.ts` | Gate on `audioScrubEnabled`, `onScrubStart/End`, `onAudioScrubEnabledChanged` |
| `src/audio/AudioCoordinator.test.ts` | AC-050 through AC-052: gating and mode tests |
| `src/core/session/VolumeManager.ts` | `audioScrubEnabled` property, callback interface extension |
| `src/core/session/VolumeManager.test.ts` | Tests for new property and callback |
| `src/core/session/SessionPlayback.ts` | Wire new callback, expose `audioScrubEnabled`, forward event, `onScrubStart/End` |
| `src/core/session/SessionPlayback.test.ts` | Tests for new delegation and event forwarding |
| `src/core/session/Session.ts` | `audioScrubEnabled` getter/setter, `onScrubStart/End`, event forwarding |
| `src/core/session/Session.playback.test.ts` | Tests for Session-level audio scrub toggle |
| `src/core/session/SessionState.ts` | `audioScrubEnabled` in `PlaybackState` |
| `src/core/session/SessionSerializer.test.ts` | Serialization round-trip test |
| `src/core/session/SessionGTOExporter.ts` | Export `audioScrubEnabled` |
| `src/core/session/GTOGraphLoader.ts` | Restore `audioScrubEnabled` |
| `src/api/AudioAPI.ts` | `enableAudioScrub()`, `disableAudioScrub()`, `isAudioScrubEnabled()`, `setAudioScrubEnabled()` |
| `src/api/OpenRVAPI.test.ts` | Tests for new API methods |
| `src/ui/components/Timeline.ts` | Signal scrub start/end on pointer down/up |
| `src/ui/components/Timeline.test.ts` | Tests for scrub mode signaling |
| `src/ui/components/VolumeControl.ts` | Scrub Audio toggle checkbox, sync method |
| `src/ui/components/VolumeControl.test.ts` | Tests for toggle UI |
| `src/AppPlaybackWiring.ts` | Wire volume control scrub toggle to session |
| `src/AppPlaybackWiring.test.ts` | Tests for wiring |
| `src/__e2e__/AudioMixer.e2e.test.ts` | Integration tests for end-to-end scrub flow |

### Files to Create

None. All changes extend existing files.

## Risks

### 1. Audio Click/Pop Artifacts
**Risk:** Even with fade envelopes, very short snippets (30ms) may still produce audible artifacts on some browsers/devices, especially when snippets overlap during fast scrubbing.
**Mitigation:** The 5ms fade duration is chosen to be inaudible but effective. Test on Chrome, Safari, and Firefox. If pops persist, increase `SCRUB_FADE_DURATION` to 8-10ms or add a compressor node to the scrub chain.

### 2. AudioContext Resource Exhaustion
**Risk:** Rapid scrubbing creates many short-lived `AudioBufferSourceNode` + `GainNode` pairs. If the browser's Web Audio garbage collection is slow, this could cause memory pressure or audio glitches.
**Mitigation:** Each snippet is explicitly stopped and disconnected on replacement. The `onended` callback ensures cleanup even for naturally-ending snippets. The debounce timer (16ms minimum) limits creation rate to ~60 nodes/second maximum. Browser Web Audio implementations are designed to handle this pattern efficiently.

### 3. Autoplay Policy Blocking
**Risk:** If the user has not interacted with the page, the `AudioContext` may be in `suspended` state, and scrub snippets will silently fail.
**Mitigation:** The existing `scrubToFrame()` already guards against suspended context (line 445-447). The `AudioOrchestrator.setupLazyInit()` initializes context on first click/keydown. Frame stepping requires keyboard interaction, which satisfies the autoplay policy.

### 4. Performance During Fast Timeline Drag
**Risk:** Continuous scrub mode (no debounce) combined with pointer events firing at 60+ Hz could cause excessive Web Audio API calls.
**Mitigation:** Even in continuous mode, `stopScrubSnippet()` is called before creating a new one, so at most one scrub source node exists at a time. The `computeSnippetDuration()` function naturally shortens snippets during fast scrubbing, reducing audio processing load. The `InteractionQualityManager` already reduces GL viewport quality during scrub, so the rendering pipeline is not additionally stressed.

### 5. Backward Compatibility of SessionState
**Risk:** Adding `audioScrubEnabled` to `PlaybackState` could break loading of older project files that do not have this field.
**Mitigation:** The field is marked optional (`audioScrubEnabled?: boolean`) and defaults to `true` when absent. The `SESSION_STATE_VERSION` does not need incrementing because the field is additive and optional.

### 6. HTMLVideoElement Fallback Path
**Risk:** When `AudioPlaybackManager` is using the video element fallback (no decoded `AudioBuffer`), scrub audio is silently unavailable because `scrubToFrame()` requires `this.audioBuffer` to be non-null.
**Mitigation:** This is acceptable. The video fallback path is only used when audio extraction fails (CORS, unsupported codec). In this case, scrub audio is a best-effort feature. The toggle UI should show a disabled/grayed state when audio extraction has not succeeded. A tooltip can explain: "Audio scrub requires decoded audio data."

### 7. Multi-Track Audio (AudioMixer)
**Risk:** The `AudioMixer` class manages multiple tracks but `AudioPlaybackManager` is a single-buffer system. Scrub audio only plays from the primary audio buffer, not from mixer tracks.
**Mitigation:** This matches desktop OpenRV behavior where scrub audio uses the primary audio track. Multi-track scrub mixing would be a separate future enhancement. The `AudioMixer` is primarily used for the `AudioOrchestrator` service pipeline, which is separate from the `AudioCoordinator`-managed playback pipeline.

### 8. Cross-Browser Web Audio Differences
**Risk:** Safari's Web Audio implementation handles `linearRampToValueAtTime` differently from Chrome/Firefox, potentially causing envelope timing issues.
**Mitigation:** Use `setValueAtTime` anchor points before every ramp (already included in the design). Test on Safari specifically. If Safari exhibits issues, fall back to `exponentialRampToValueAtTime` with a small epsilon floor value to avoid the zero-value limitation of exponential ramps.
