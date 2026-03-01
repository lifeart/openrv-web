# Plan 16: Audio Scrubbing

## Overview

Desktop OpenRV provides audio feedback during frame-by-frame stepping and timeline scrubbing, giving editors an auditory reference that helps them locate dialogue cues, sound effects, and music beats without entering full playback. The web version already has volume control, mute/unmute, pitch preservation, Web Audio API playback, and a basic `scrubToFrame()` method on `AudioPlaybackManager`, but lacks a complete, user-controllable audio scrubbing system with an enable/disable toggle, variable speed handling, and proper integration across all scrubbing surfaces (timeline drag, viewer interaction, keyboard frame stepping).

This plan describes how to extend the existing audio infrastructure into a full audio scrubbing feature that covers snippet playback on frame steps, continuous audio during timeline drag, variable speed handling, reverse scrub direction support, an enable/disable toggle persisted across sessions, and proper buffer management.

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

6. **No reverse scrub direction** -- When scrubbing backward (right to left), snippets play forward from the target frame, which is disorienting. Desktop OpenRV and professional NLEs play audio leading up to the target frame position during backward scrubbing.

7. **No UI toggle** -- No button or menu item to enable/disable audio scrubbing independently of the volume control.

8. **No session persistence** -- The scrubbing preference is not saved/restored with the project state.

9. **No playlist boundary handling** -- Scrubbing across clip boundaries in playlist mode silently fails when the next clip's audio buffer is not loaded.

10. **First-interaction silence** -- When the AudioContext is suspended, the first scrub request is silently discarded rather than queued for replay after context resumption.

## Proposed Architecture

### Design Principles

- **Minimal new files**: Extend existing classes (`AudioPlaybackManager`, `AudioCoordinator`, `VolumeManager`, `SessionState`) rather than creating a separate scrub engine.
- **Single responsibility**: `AudioPlaybackManager` owns all scrub audio mechanics. `AudioCoordinator` owns the routing decision. `VolumeManager` owns the toggle state.
- **Backward compatible**: The existing `scrubToFrame()` API remains but gains internal improvements.
- **Direction-aware**: Backward scrubbing plays audio leading up to the target frame, matching professional editorial tool behavior.
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
  -> [NEW] Detect scrub direction (forward vs reverse)
  -> [IMPROVED] Velocity-adaptive snippet with smoothed velocity, Hann window envelope, crossfade
  -> Web Audio API: AudioBufferSourceNode.start(0, offset, duration)
```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| `AudioPlaybackManager` | Scrub snippet mechanics: direction detection, velocity tracking with smoothing, adaptive duration with non-linear easing, Hann window envelopes, crossfade overlap, buffer source lifecycle, AudioContext resume on first interaction |
| `AudioCoordinator` | Gating: checks `audioScrubEnabled` before forwarding to manager; communicates scrub state to host |
| `VolumeManager` | Owns the `audioScrubEnabled` boolean; exposes getter/setter with callback notification |
| `AudioAPI` | Public API: `enableAudioScrub()`, `disableAudioScrub()`, `isAudioScrubEnabled()` |
| `SessionState` | Persistence: `audioScrubEnabled` field in `PlaybackState` |
| `Timeline` | Signals scrub start/end to `AudioCoordinator` for continuous mode |
| `HeaderBar` / UI | Toggle button or menu item for audio scrubbing; disabled state when audio buffer unavailable |

## Web Audio Design

### Velocity-Adaptive Snippet Duration with Smoothing and Non-Linear Easing

Track the time between consecutive `scrubToFrame()` calls to estimate scrub velocity, using exponential smoothing to avoid noisy velocity estimates that cause audible snippet length variations:

```typescript
// In AudioPlaybackManager
private lastScrubTime = 0;
private lastScrubFrame = 0;
private _smoothedScrubFps = 0;

private computeSnippetDuration(frame: number, fps: number): number {
  const now = performance.now();
  const dt = now - this.lastScrubTime; // ms since last scrub call

  this.lastScrubTime = now;
  this.lastScrubFrame = frame;

  if (dt <= 0 || dt > 500) {
    // First scrub or long pause between scrubs -> reset smoothing, standard duration
    this._smoothedScrubFps = 0;
    return SCRUB_SNIPPET_DURATION_DEFAULT; // 80ms
  }

  // Exponential smoothing of scrub velocity (alpha=0.3)
  const instantFps = 1000 / dt;
  this._smoothedScrubFps = this._smoothedScrubFps * 0.7 + instantFps * 0.3;

  // Non-linear (quadratic ease-in) mapping: moderate scrub speeds (5-15 fps)
  // stay at longer durations, only dropping sharply above ~20 fps.
  // This matches how editors spend most time at moderate scrub speeds.
  const t = clamp((this._smoothedScrubFps - 5) / 25, 0, 1);
  const eased = t * t; // quadratic ease-in
  return lerp(SCRUB_SNIPPET_DURATION_MAX, SCRUB_SNIPPET_DURATION_MIN, eased);
}
```

**Constants:**
```typescript
static readonly SCRUB_SNIPPET_DURATION_MIN = 0.045;  // 45ms - fast scrub (raised from 30ms for speech intelligibility)
static readonly SCRUB_SNIPPET_DURATION_DEFAULT = 0.08; // 80ms - single step
static readonly SCRUB_SNIPPET_DURATION_MAX = 0.12;  // 120ms - slow scrub
static readonly SCRUB_DEBOUNCE_MS = 16; // Reduced from 30ms to ~1 frame at 60Hz
static readonly SCRUB_FADE_DURATION = 0.005; // 5ms fade in/out
static readonly SCRUB_CROSSFADE_DURATION = 0.004; // 4ms crossfade overlap for continuous mode
```

The minimum snippet duration is set to 45ms rather than 30ms. At 30ms, audio is approximately one cycle of a 33 Hz tone -- below the threshold of speech intelligibility. Professional editorial tools (including desktop OpenRV at ~40-50ms) do not go below 40ms. The 45ms minimum provides recognizable audio content even during fast scrubbing, at the cost of slightly more overlap, which is an acceptable trade-off.

### Reverse Scrub Direction

When the user scrubs backward (the new frame is less than the previous frame), the snippet offset is adjusted so the user hears the audio *leading up to* the target frame rather than the audio *after* it. This is essential for dialogue sync review, where hearing the syllable preceding a visual cue is just as important as the syllable following it.

```typescript
private computeSnippetOffset(frame: number, fps: number, snippetDuration: number): number {
  const timestamp = (frame - 1) / fps;
  const isReverse = frame < this.lastScrubFrame;

  if (isReverse) {
    // Backward scrub: play the audio region leading up to the target frame
    // offset = targetTime - snippetDuration, clamped to 0
    const offset = Math.max(0, timestamp - snippetDuration);
    return offset;
  } else {
    // Forward scrub: play audio starting from the target frame (existing behavior)
    return clamp(timestamp, 0, this.audioBuffer!.duration);
  }
}
```

Web Audio API's `AudioBufferSourceNode` does not support negative playback rates, so the audio still plays forward -- but from an earlier position, so the user hears the audio context leading up to where they scrubbed to. This is the most practical approach for the web platform and provides a meaningful improvement over the current behavior.

### Hann Window Envelope (Click/Pop Prevention)

Use a Hann window envelope instead of linear ramps for smoother snippet transitions. A Hann window (`0.5 * (1 - cos(2 * pi * t / N))`) produces fewer artifacts than linear ramps by avoiding the discontinuity in the first derivative at the start and end of the envelope. This is implemented using Web Audio's `setValueCurveAtTime()`:

```typescript
// Pre-compute a Hann window curve (once, shared across all snippets)
private static readonly HANN_WINDOW_SIZE = 64;
private static readonly hannFadeIn: Float32Array = (() => {
  const curve = new Float32Array(AudioPlaybackManager.HANN_WINDOW_SIZE);
  for (let i = 0; i < curve.length; i++) {
    curve[i] = 0.5 * (1 - Math.cos(Math.PI * i / (curve.length - 1)));
  }
  return curve;
})();
private static readonly hannFadeOut: Float32Array = (() => {
  const curve = new Float32Array(AudioPlaybackManager.HANN_WINDOW_SIZE);
  for (let i = 0; i < curve.length; i++) {
    curve[i] = 0.5 * (1 + Math.cos(Math.PI * i / (curve.length - 1)));
  }
  return curve;
})();

private playScrubSnippet(frame: number, fps: number): void {
  if (!this.audioBuffer || !this.audioContext || !this.gainNode) return;

  const snippetDuration = this.computeSnippetDuration(frame, fps);
  const offset = this.computeSnippetOffset(frame, fps, snippetDuration);
  const effectiveDuration = Math.min(snippetDuration, this.audioBuffer.duration - offset);
  if (effectiveDuration <= 0) return;

  const snippetNode = this.audioContext.createBufferSource();
  snippetNode.buffer = this.audioBuffer;

  // Create per-snippet gain node for Hann window envelope
  const envelopeGain = this.audioContext.createGain();
  const now = this.audioContext.currentTime;
  const fadeDuration = AudioPlaybackManager.SCRUB_FADE_DURATION;

  // Hann window fade-in
  envelopeGain.gain.setValueAtTime(0, now);
  envelopeGain.gain.setValueCurveAtTime(
    AudioPlaybackManager.hannFadeIn, now, fadeDuration
  );

  // Hann window fade-out
  const fadeOutStart = now + effectiveDuration - fadeDuration;
  if (fadeOutStart > now + fadeDuration) {
    envelopeGain.gain.setValueCurveAtTime(
      AudioPlaybackManager.hannFadeOut, fadeOutStart, fadeDuration
    );
  }

  snippetNode.connect(envelopeGain);
  envelopeGain.connect(this.gainNode);

  snippetNode.start(0, offset, effectiveDuration);

  // Store as current scrub snippet (for crossfade or cleanup)
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

If `setValueCurveAtTime()` proves unreliable in Safari, fall back to linear ramps with `setValueAtTime` anchor points:

```typescript
// Fallback for Safari
envelopeGain.gain.setValueAtTime(0, now);
envelopeGain.gain.linearRampToValueAtTime(1, now + fadeDuration);
// ...
envelopeGain.gain.setValueAtTime(1, fadeOutStart);
envelopeGain.gain.linearRampToValueAtTime(0, now + effectiveDuration);
```

### Continuous Scrub Mode with Crossfade (Timeline Drag)

When the user is actively dragging the timeline, the AudioCoordinator enters "continuous scrub" mode. In this mode:

1. The debounce timer is bypassed (or reduced to a single frame).
2. Instead of abruptly stopping the old snippet and starting a new one (which produces audible gaps), the outgoing snippet is crossfaded out over 3-5ms while the new snippet fades in. This is the difference between "choppy scrubbing" and "smooth scrubbing."
3. The snippet start position is direction-aware (see Reverse Scrub Direction above).

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

`AudioPlaybackManager` uses the mode to adjust debounce behavior and enable crossfade:

```typescript
scrubToFrame(frame: number, fps: number): void {
  // ... existing guards ...

  // Handle suspended AudioContext on first interaction
  if (this.audioContext.state === 'suspended') {
    this.audioContext.resume().then(() => {
      this.playScrubSnippetWithCrossfade(frame, fps);
    });
    return;
  }

  if (this.scrubMode === 'continuous') {
    // No debounce in continuous mode -- crossfade immediately
    this.playScrubSnippetWithCrossfade(frame, fps);
  } else {
    // Discrete mode -- debounce with 16ms timer
    this.stopScrubSnippet();
    if (this.scrubDebounceTimer !== null) {
      clearTimeout(this.scrubDebounceTimer);
    }
    this.scrubDebounceTimer = setTimeout(() => {
      this.scrubDebounceTimer = null;
      this.playScrubSnippet(frame, fps);
    }, AudioPlaybackManager.SCRUB_DEBOUNCE_MS);
  }
}

private playScrubSnippetWithCrossfade(frame: number, fps: number): void {
  // If there is an outgoing snippet, fade it out over SCRUB_CROSSFADE_DURATION
  // instead of stopping it abruptly
  if (this.scrubSourceNode && this.scrubEnvelopeNode && this.audioContext) {
    const now = this.audioContext.currentTime;
    const fadeOut = AudioPlaybackManager.SCRUB_CROSSFADE_DURATION;
    this.scrubEnvelopeNode.gain.cancelScheduledValues(now);
    this.scrubEnvelopeNode.gain.setValueAtTime(
      this.scrubEnvelopeNode.gain.value, now
    );
    this.scrubEnvelopeNode.gain.linearRampToValueAtTime(0, now + fadeOut);
    // Schedule stop after fade completes
    this.scrubSourceNode.stop(now + fadeOut);

    // Move outgoing references to allow GC after stop
    const outgoing = this.scrubSourceNode;
    const outgoingEnvelope = this.scrubEnvelopeNode;
    outgoing.onended = () => {
      outgoingEnvelope.disconnect();
    };
  }

  // Start new snippet (fades in via Hann window)
  this.playScrubSnippet(frame, fps);
}
```

### First-Interaction AudioContext Resume

When the AudioContext is in a `suspended` state (common before any user interaction on the page), the current implementation silently discards the scrub request. Instead, `scrubToFrame()` now calls `audioContext.resume()` and chains the snippet playback:

```typescript
if (this.audioContext.state === 'suspended') {
  this.audioContext.resume().then(() => {
    this.playScrubSnippet(frame, fps);
  });
  return;
}
```

This ensures the very first frame step after page load produces audible scrub audio, provided the frame step itself satisfies the browser's autoplay policy (keyboard interaction does).

### Buffer Management

No new buffer allocation is needed. The existing `audioBuffer` (decoded once on load) is reused for all scrub snippets via `AudioBufferSourceNode.start(0, offset, duration)`, which reads directly from the shared buffer without copying. The per-snippet `GainNode` for Hann window envelopes is lightweight (no sample data) and is disconnected/GC'd when the snippet ends.

Memory overhead per active scrub snippet:
- 1 `AudioBufferSourceNode` (references shared buffer, no copy)
- 1 `GainNode` (envelope)
- Both are disconnected and eligible for GC on `onended`

During continuous scrub with crossfade, at most 2 snippet pairs exist briefly (outgoing + incoming). The outgoing pair is cleaned up after the crossfade duration (3-5ms).

### Playlist Clip Boundary Handling

When `PlaylistManager` is enabled and the user scrubs across a clip boundary, `AudioPlaybackManager` may not have the new clip's audio buffer loaded. The scrub snippet will silently fail because `this.audioBuffer` refers to the previous clip's decoded audio.

**Mitigation strategy:**
1. `AudioCoordinator` checks whether the frame falls within the current audio buffer's range before calling `scrubToFrame()`.
2. When a clip boundary crossing is detected, `AudioCoordinator` emits a `scrubAudioUnavailable` signal so the UI can briefly indicate silence.
3. As a future enhancement, adjacent clips' audio can be pre-decoded when playlist mode is active, so scrub audio is available immediately after crossing a boundary.

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
- Add `audioScrubEnabledChanged: boolean` event to `SessionPlaybackEvents` (the TypeScript interface at line 52-69).

**Test file:** Update `src/audio/AudioCoordinator.test.ts` with tests for the gating behavior.

### Step 3: Improve Scrub Snippet Quality in AudioPlaybackManager

Enhance the existing scrub implementation with velocity-adaptive duration (smoothed, non-linear easing), Hann window envelopes, reverse direction support, crossfade in continuous mode, and first-interaction AudioContext resume.

**Changes to `src/audio/AudioPlaybackManager.ts`:**
- Add velocity tracking fields: `lastScrubTime`, `lastScrubFrame`, `_smoothedScrubFps`.
- Add `scrubEnvelopeNode: GainNode | null` field.
- Add `scrubMode: 'discrete' | 'continuous'` field with `setScrubMode()` method.
- Replace the constant `SCRUB_SNIPPET_DURATION` with `SCRUB_SNIPPET_DURATION_MIN` (45ms), `SCRUB_SNIPPET_DURATION_DEFAULT` (80ms), `SCRUB_SNIPPET_DURATION_MAX` (120ms).
- Reduce `SCRUB_DEBOUNCE_MS` from 30 to 16.
- Add `SCRUB_FADE_DURATION = 0.005` and `SCRUB_CROSSFADE_DURATION = 0.004`.
- Add static pre-computed Hann window curves (`hannFadeIn`, `hannFadeOut`).
- Add `computeSnippetDuration(frame, fps)` private method with exponential smoothing and quadratic easing.
- Add `computeSnippetOffset(frame, fps, snippetDuration)` private method with reverse direction support.
- Rewrite `playScrubSnippet()` to use Hann window envelope and adaptive duration.
- Add `playScrubSnippetWithCrossfade()` for continuous mode.
- Update `scrubToFrame()` to support continuous mode (crossfade, no debounce) and AudioContext resume on first interaction.
- Update `stopScrubSnippet()` to disconnect envelope node.
- Update `dispose()` to clean up new nodes and reset smoothed velocity.

**Test file:** Update `src/audio/AudioPlaybackManager.test.ts`:
- SCRUB-006: velocity-adaptive duration -- slow scrub produces longer snippets.
- SCRUB-007: velocity-adaptive duration -- fast scrub produces shorter snippets.
- SCRUB-008: Hann window envelope GainNode is created and connected.
- SCRUB-009: continuous mode bypasses debounce and uses crossfade.
- SCRUB-010: scrub mode can be toggled between discrete and continuous.
- SCRUB-011: envelope GainNode is disconnected on snippet end.
- SCRUB-012: dispose cleans up envelope node.
- SCRUB-013: reverse scrub direction adjusts snippet offset to play audio before target frame.
- SCRUB-014: forward scrub direction plays audio from target frame (existing behavior preserved).
- SCRUB-015: velocity smoothing produces stable snippet durations despite jittery input.
- SCRUB-016: non-linear easing keeps snippet duration longer at moderate scrub speeds.
- SCRUB-017: first-interaction scrub calls audioContext.resume() and plays snippet after resolution.
- SCRUB-018: crossfade fades out old snippet while fading in new snippet in continuous mode.
- SCRUB-019: minimum snippet duration is 45ms (not below speech intelligibility threshold).

### Step 4: Expose Through Session and Public API

Make the toggle accessible from Session and the public API.

**Changes to `src/core/session/Session.ts`:**
- Add `audioScrubEnabled` getter/setter delegating to `SessionPlayback`.
- Forward `audioScrubEnabledChanged` event.

**Changes to `src/api/AudioAPI.ts`:**
- Add `enableAudioScrub()`, `disableAudioScrub()`, `isAudioScrubEnabled()`, `setAudioScrubEnabled(enabled: boolean)` methods.

**Changes to `src/api/EventsAPI.ts`:**
- Add the new `audioScrubEnabledChanged` event to the `SessionPlaybackEvents` interface documentation and expose it through EventsAPI subscriptions.

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

### Step 6: Add UI Toggle with Availability Indicator

Add a toggle for audio scrubbing in the volume control area, with a disabled/grayed state when audio buffer is unavailable.

**Option A (Preferred): Add to VolumeControl popup**
- When the volume slider is expanded, show a small "Scrub Audio" checkbox/toggle below it.
- This groups audio-related controls together.
- When `audioBuffer` is null (video element fallback path), the toggle is grayed out with a tooltip: "Audio scrub requires decoded audio data."

**Option B: Add to HeaderBar menu**
- Add an "Audio Scrub" toggle item in the playback or audio section of the header menu.

**Changes to `src/ui/components/VolumeControl.ts`:**
- Add a checkbox element for "Scrub Audio" toggle.
- Emit `audioScrubChanged: boolean` event when toggled.
- Add `syncAudioScrub(enabled: boolean)` for external sync (same pattern as `syncMuted`).
- Add `setScrubAudioAvailable(available: boolean)` to control disabled/tooltip state.

**Changes to `src/AppPlaybackWiring.ts`:**
- Wire `volumeControl.on('audioScrubChanged')` to `session.audioScrubEnabled`.
- Wire `session.on('audioScrubEnabledChanged')` to `volumeControl.syncAudioScrub()`.
- Wire audio buffer availability state to `volumeControl.setScrubAudioAvailable()`.

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

### Step 8: Playlist Boundary Awareness

Handle scrubbing across clip boundaries gracefully.

**Changes to `src/audio/AudioCoordinator.ts`:**
- Before calling `scrubToFrame()`, check whether the target frame is within the current audio buffer's time range.
- When a clip boundary crossing is detected, skip the scrub snippet rather than playing stale audio from the previous clip.
- Emit a `scrubAudioUnavailable` event so the UI can indicate silence at the boundary.

**Changes to `src/audio/AudioCoordinator.test.ts`:**
- AC-053: Scrubbing past audio buffer duration skips snippet and emits unavailable signal.
- AC-054: Clip boundary crossing detected and handled gracefully.

### Step 9: Integration Testing

**Changes to `src/__e2e__/AudioMixer.e2e.test.ts`:**
- Add integration tests for the complete scrub flow: timeline drag -> frame change -> audio snippet.
- Test toggle on/off behavior end-to-end.
- Test reverse scrub direction produces correct offset.
- Test crossfade during continuous scrub mode.

**New tests in `src/audio/AudioCoordinator.test.ts`:**
- AC-050: `onFrameChanged` with `audioScrubEnabled=false` does not call `scrubToFrame`.
- AC-051: `onScrubStart`/`onScrubEnd` toggles continuous mode on the manager.
- AC-052: `onAudioScrubEnabledChanged` stops any active scrub snippet.

## Files to Create/Modify

### Files to Modify

| File | Change Summary |
|---|---|
| `src/audio/AudioPlaybackManager.ts` | Velocity-adaptive duration with smoothing and non-linear easing, Hann window envelope, reverse direction support, crossfade in continuous mode, AudioContext resume, new constants (45ms min) |
| `src/audio/AudioPlaybackManager.test.ts` | SCRUB-006 through SCRUB-019: scrub quality, direction, smoothing, easing, crossfade, resume tests |
| `src/audio/AudioCoordinator.ts` | Gate on `audioScrubEnabled`, `onScrubStart/End`, `onAudioScrubEnabledChanged`, playlist boundary check |
| `src/audio/AudioCoordinator.test.ts` | AC-050 through AC-054: gating, mode, and boundary tests |
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
| `src/api/EventsAPI.ts` | Document and expose `audioScrubEnabledChanged` event |
| `src/api/OpenRVAPI.test.ts` | Tests for new API methods |
| `src/ui/components/Timeline.ts` | Signal scrub start/end on pointer down/up |
| `src/ui/components/Timeline.test.ts` | Tests for scrub mode signaling |
| `src/ui/components/VolumeControl.ts` | Scrub Audio toggle checkbox, sync method, disabled state with tooltip |
| `src/ui/components/VolumeControl.test.ts` | Tests for toggle UI and disabled state |
| `src/AppPlaybackWiring.ts` | Wire volume control scrub toggle to session, audio availability state |
| `src/AppPlaybackWiring.test.ts` | Tests for wiring |
| `src/__e2e__/AudioMixer.e2e.test.ts` | Integration tests for end-to-end scrub flow |

### Files to Create

None. All changes extend existing files.

## Risks

### 1. Audio Click/Pop Artifacts
**Risk:** Even with Hann window envelopes, very short snippets (45ms) may still produce audible artifacts on some browsers/devices, especially when snippets overlap during fast scrubbing.
**Mitigation:** The Hann window is smoother than linear ramps and eliminates first-derivative discontinuities. The 45ms minimum (raised from 30ms) provides enough room for the 5ms fade-in and fade-out. Test on Chrome, Safari, and Firefox. If pops persist, increase `SCRUB_FADE_DURATION` to 8-10ms.

### 2. AudioContext Resource Exhaustion
**Risk:** Rapid scrubbing creates many short-lived `AudioBufferSourceNode` + `GainNode` pairs. If the browser's Web Audio garbage collection is slow, this could cause memory pressure or audio glitches.
**Mitigation:** Each snippet is explicitly stopped and disconnected on replacement. The `onended` callback ensures cleanup even for naturally-ending snippets. The debounce timer (16ms minimum) limits creation rate to ~60 nodes/second maximum. During crossfade, at most 2 pairs exist briefly (3-5ms overlap). Browser Web Audio implementations are designed to handle this pattern efficiently.

### 3. Autoplay Policy Blocking
**Risk:** If the user has not interacted with the page, the `AudioContext` may be in `suspended` state, and scrub snippets will silently fail.
**Mitigation:** The improved `scrubToFrame()` now calls `audioContext.resume()` and chains the snippet playback via a promise, rather than silently discarding the request. Frame stepping requires keyboard interaction, which satisfies the autoplay policy. The `AudioOrchestrator.setupLazyInit()` also initializes context on first click/keydown as a belt-and-suspenders approach.

### 4. Performance During Fast Timeline Drag
**Risk:** Continuous scrub mode (no debounce) combined with pointer events firing at 60+ Hz could cause excessive Web Audio API calls.
**Mitigation:** Even in continuous mode, the crossfade approach means at most 2 scrub source nodes exist at any time. The `computeSnippetDuration()` function with smoothed velocity naturally shortens snippets during fast scrubbing, reducing audio processing load. The `InteractionQualityManager` reduces GL viewport quality during pointer interaction (resize, pan, zoom, timeline drag), so the rendering pipeline is not additionally stressed.

### 5. Backward Compatibility of SessionState
**Risk:** Adding `audioScrubEnabled` to `PlaybackState` could break loading of older project files that do not have this field.
**Mitigation:** The field is marked optional (`audioScrubEnabled?: boolean`) and defaults to `true` when absent. The `SESSION_STATE_VERSION` does not need incrementing because the field is additive and optional.

### 6. HTMLVideoElement Fallback Path
**Risk:** When `AudioPlaybackManager` is using the video element fallback (no decoded `AudioBuffer`), scrub audio is silently unavailable because `scrubToFrame()` requires `this.audioBuffer` to be non-null.
**Mitigation:** This is acceptable. The video fallback path is only used when audio extraction fails (CORS, unsupported codec). In this case, scrub audio is a best-effort feature. The toggle UI shows a disabled/grayed state when audio extraction has not succeeded, with a tooltip: "Audio scrub requires decoded audio data."

### 7. Multi-Track Audio (AudioMixer)
**Risk:** The `AudioMixer` class manages multiple tracks but `AudioPlaybackManager` is a single-buffer system. Scrub audio only plays from the primary audio buffer, not from mixer tracks.
**Mitigation:** This matches desktop OpenRV behavior where scrub audio uses the primary audio track. Multi-track scrub mixing would be a separate future enhancement. The `AudioMixer` is primarily used for the `AudioOrchestrator` service pipeline, which is separate from the `AudioCoordinator`-managed playback pipeline.

### 8. Cross-Browser Web Audio Differences
**Risk:** Safari's Web Audio implementation handles `linearRampToValueAtTime` and `setValueCurveAtTime` differently from Chrome/Firefox, potentially causing envelope timing issues.
**Mitigation:** Use `setValueAtTime` anchor points before every ramp. The Hann window via `setValueCurveAtTime()` should be tested on Safari specifically. If Safari exhibits issues with `setValueCurveAtTime`, fall back to `linearRampToValueAtTime` with anchor points (the code includes this fallback path). Test on Safari specifically.

### 9. Mobile Browser Audio Restrictions
**Risk:** iOS Safari and Android Chrome have additional audio restrictions beyond the initial autoplay policy. On iOS, only a single `AudioContext` can be active, and creating new `AudioBufferSourceNode` instances during rapid scrubbing on a low-power device may cause audio dropouts.
**Mitigation:** Audio scrubbing quality may be degraded on mobile devices. Consider disabling continuous scrub mode on mobile (use discrete mode only with a longer debounce of 32ms instead of 16ms). This can be detected via `DisplayCapabilities` or user-agent heuristics.

### 10. Tab Backgrounding
**Risk:** When the browser tab is backgrounded, `AudioContext.currentTime` continues advancing but `setTimeout` and `requestAnimationFrame` are throttled. If the user backgrounds the tab while scrubbing (unlikely but possible via gesture), the debounce timer may fire late and produce a stale snippet.
**Mitigation:** Clear pending scrub state when the page visibility changes (`document.visibilitychange`). This is a minor edge case but the cleanup is trivial to implement.

### 11. Playlist Clip Boundaries
**Risk:** Scrubbing across playlist clip boundaries may play stale audio from the previous clip or silently fail when the new clip's audio buffer is not loaded.
**Mitigation:** `AudioCoordinator` checks frame range before calling `scrubToFrame()`. When a boundary crossing is detected, the scrub snippet is skipped and a `scrubAudioUnavailable` signal is emitted. Pre-decoding adjacent clips' audio is a future enhancement.

## Review Notes (Future Enhancements)

The following items were identified during review as "nice to have" improvements that are not required for the initial implementation but should be considered for future iterations:

1. **Keyboard repeat rate detection**: When the user holds an arrow key, detect the repeat rate and use it to inform snippet duration (similar to continuous scrub mode but for keyboard input). This prevents the "machine gun" effect of rapid discrete snippets.

2. **Scrub audio waveform visualization**: Show a small visual indication (e.g., a brief highlight on the timeline waveform) of the audio region being played during scrub. This helps editors confirm what they are hearing.

3. **Mobile-specific scrub behavior**: Disable continuous scrub mode on mobile devices (iOS Safari, Android Chrome) where Web Audio performance is less predictable. Fall back to discrete mode with a longer debounce (32ms instead of 16ms). (Partially addressed in Risk 9.)

4. **Page visibility cleanup**: Clear pending scrub timers and stop active scrub snippets when `document.visibilityState` changes to `'hidden'`. (Partially addressed in Risk 10.)

5. **Pre-rendered reverse snippets via `OfflineAudioContext`**: If the reverse scrub direction approach proves insufficient for professional workflows, pre-rendering reversed audio segments for recently scrubbed regions would provide true reverse playback without the latency of real-time buffer reversal. This is a high-effort enhancement.
