# Frame Accurate Playback

## Original OpenRV Implementation
OpenRV provides frame-accurate playback for image sequences and video files. It supports two playback modes:
- **Realtime playback**: Maintains target frame rate by skipping frames if necessary when the system cannot keep up
- **Play-all-frames mode**: Ensures every frame is displayed in sequence, adjusting audio speed to match actual playback rate

The system allows precise frame navigation using keyboard controls and supports variable playback speeds including reverse playback. Frame rates can be set globally or per-source, with automatic retiming for sources with conflicting FPS values.

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Implementation Summary

OpenRV Web implements frame-accurate playback using the **mediabunny** library (WebCodecs-based frame extraction) for precise frame retrieval, combined with a sophisticated frame-timing system in the Session class.

### Key Components

1. **MediabunnyFrameExtractor** (`src/utils/MediabunnyFrameExtractor.ts`)
   - WebCodecs-based frame extraction for precise frame access
   - Frame-to-timestamp and timestamp-to-frame conversion
   - Frame caching with LRU eviction
   - Auto-detection of video FPS from container metadata

2. **FramePreloadManager** (`src/utils/FramePreloadManager.ts`)
   - Intelligent frame preloading in playback direction
   - Priority queue for frame loading (current > soon > far)
   - Request coalescing to prevent duplicate loads
   - AbortController integration for cancellation on seek/pause

3. **Session** (`src/core/session/Session.ts`)
   - Frame-gated playback: only advances when next frame is cached
   - Frame accumulator for precise timing at target FPS
   - Variable playback speed (0.1x to 8x)
   - Reverse playback with speed limiting (capped at 4x)
   - Loop modes: once, loop, pingpong
   - Audio sync during forward playback

4. **VideoSourceNode** (`src/nodes/sources/VideoSourceNode.ts`)
   - Frame-by-frame video access via mediabunny
   - Fallback to HTMLVideoElement for unsupported codecs
   - Playback buffer management

## Requirements

| Requirement | Status | Implementation Notes |
|-------------|--------|---------------------|
| Support for variable frame rates (1-120+ fps) | Implemented | FPS clamped 1-120 in Session.ts, per-source fps via MediaSource |
| Frame skipping mode for realtime playback | Implemented | Starvation timeout (5s) skips frame if extraction hangs |
| Play-all-frames mode with audio sync | Implemented | Frame-gated playback waits for cached frames; audio syncs during forward |
| Reverse playback support | Implemented | Full reverse playback via mediabunny; speed limited to 4x in reverse |
| Per-source frame rate override | Implemented | FPS stored per MediaSource, session FPS configurable |
| Frame-accurate seeking to any frame | Implemented | Mediabunny frame extraction by frame number |
| Sub-frame interpolation (optional) | Implemented | FrameInterpolator utility with alpha blending; toggle in Session/Viewer (default: off) |

## UI/UX Specification

### Playback Controls (HeaderBar)
Following UI.md patterns:

- **Play/Pause Button**: Icon toggles between play/pause states
  - Keyboard: `Space`
  - Title updates: "Play (Space)" / "Pause (Space)"

- **Step Forward/Backward**: Frame-by-frame navigation
  - Keyboard: `ArrowRight` / `ArrowLeft`
  - Respects `frameIncrement` setting (default: 1)

- **Go to Start/End**: Navigation buttons
  - Keyboard: `Home` / `End`
  - Respects in/out point range

- **Direction Toggle**: Forward/reverse indicator button
  - Keyboard: `ArrowUp` toggles direction
  - Visual: Arrow icon changes direction

- **Speed Control** (`[data-testid="playback-speed-button"]`):
  - Click: Cycle to next preset
  - Shift+Click: Cycle to previous preset
  - Right-Click: Show preset menu
  - Keyboard: `L` increase, `J` decrease, `K` reset to 1x
  - Presets: 0.1x, 0.25x, 0.5x, 1x, 2x, 4x, 8x

- **Loop Mode Toggle**:
  - Keyboard: `L` cycles: loop -> pingpong -> once
  - Visual indicator for current mode

### Timeline
- In/Out point markers
- Current frame indicator
- Frame markers visualization
- Cache status indicator (when using mediabunny)

### Visual Feedback
- Buffering indicator during frame load starvation
- Effective FPS display (actual rendered frames/second)
- Play direction indicator in UI

## Technical Notes

### Frame-Gated Playback Algorithm
```typescript
// In Session.update()
while (frameAccumulator >= frameDuration) {
  const nextFrame = computeNextFrame(playDirection);

  if (videoSourceNode.hasFrameCached(nextFrame)) {
    // Frame ready - advance
    frameAccumulator -= frameDuration;
    advanceFrame(playDirection);
  } else {
    // Frame not ready - wait or skip after timeout
    if (starvationDuration > STARVATION_TIMEOUT_MS) {
      // Skip frame after 5 seconds
      advanceFrame(playDirection);
    } else {
      // Request frame and wait
      videoSourceNode.getFrameAsync(nextFrame);
      break;
    }
  }
}
```

### Reverse Playback Speed Limiting
```typescript
// In Session.update()
const effectiveSpeed = playDirection < 0
  ? Math.min(playbackSpeed, MAX_REVERSE_SPEED)  // 4x max
  : playbackSpeed;  // Full speed for forward
```

### Audio Sync Strategy
- Audio playback only during forward playback
- Video element synced to current frame for audio
- Large drift (>0.5s) triggers seek to resync
- Audio muted during reverse playback

### Frame Timing Precision
- Uses `performance.now()` for sub-millisecond precision
- Frame accumulator pattern handles variable frame durations
- Timing reset on speed/direction change to prevent jumps

## E2E Test Cases

### Existing Tests in `e2e/playback-controls.spec.ts`

| Test ID | Description | Status |
|---------|-------------|--------|
| PLAY-001 | Toggle play/pause with button click | Implemented |
| PLAY-002 | Toggle play/pause with Space key | Implemented |
| PLAY-003 | Frame advances during playback, canvas changes | Implemented |
| PLAY-004 | Play button icon toggles correctly | Implemented |
| PLAY-010 | Step forward with ArrowRight | Implemented |
| PLAY-011 | Step backward with ArrowLeft | Implemented |
| PLAY-012 | Step forward button increments frame | Implemented |
| PLAY-013 | Step backward button decrements frame | Implemented |
| PLAY-020 | Home key goes to first frame | Implemented |
| PLAY-021 | End key goes to last frame | Implemented |
| PLAY-022 | ArrowUp toggles play direction | Implemented |
| PLAY-023 | Reverse direction button changes state | Implemented |
| PLAY-024 | Direction button click toggles state | Implemented |
| PLAY-025 | Reverse playback decrements frames | Implemented |
| PLAY-026 | Direction button icon updates | Implemented |
| PLAY-027 | Direction toggle during playback | Implemented |
| PLAY-030 | Loop mode cycling with L key | Implemented |
| PLAY-031 | Loop mode repeats from start | Implemented |
| PLAY-032 | Once mode stops at end | Implemented |
| PLAY-033 | Pingpong reverses at boundaries | Implemented |
| PLAY-034 | Pingpong updates direction button | Implemented |
| PLAY-040 | Set in point with I key | Implemented |
| PLAY-041 | Set out point with O key | Implemented |
| PLAY-042 | Bracket keys set in/out points | Implemented |
| PLAY-043 | Playback constrained to in/out range | Implemented |
| PLAY-044 | Reset in/out points with R key | Implemented |
| PLAY-050 | Toggle mark with M key | Implemented |
| PLAY-051 | Marks persisted and navigable | Implemented |
| PLAY-060 | Mute toggle updates state | Implemented |
| PLAY-061 | Volume slider updates state | Implemented |
| PLAY-070 | Play button returns to play state on finish | Implemented |

### Existing Tests in `e2e/playback-edge-cases.spec.ts`

| Test ID | Description | Status |
|---------|-------------|--------|
| EDGE-001 | Playback at 0.1x speed | Implemented |
| EDGE-002 | Playback at 8x speed | Implemented |
| EDGE-003 | Speed change during playback | Implemented |
| EDGE-004 | Rapid speed cycling | Implemented |
| EDGE-010 | Reverse stops at in-point (once mode) | Implemented |
| EDGE-011 | Reverse loops correctly | Implemented |
| EDGE-012 | Pingpong reverses at in-point | Implemented |
| EDGE-020 | Seek during high-speed playback | Implemented |
| EDGE-021 | Direction toggle during high-speed | Implemented |
| EDGE-022 | Multiple concurrent operations | Implemented |
| EDGE-030 | Speed button cycles presets | Implemented |
| EDGE-031 | Shift+click decreases speed | Implemented |
| EDGE-032 | Right-click shows speed menu | Implemented |
| EDGE-033 | Clicking preset sets speed | Implemented |
| EDGE-040 | Playback continues after starvation | Implemented |
| EDGE-041 | Buffering indicator works | Implemented |
| EDGE-050 | Stepping beyond out-point clamped | Implemented |
| EDGE-051 | Stepping before in-point clamped | Implemented |
| EDGE-052 | In/out points cannot cross | Implemented |
| EDGE-060 | Frame display matches frame number | Implemented |
| EDGE-061 | Reverse shows frames in order | Implemented |
| EDGE-070 | Reverse at 8x limited to 4x | Implemented |
| EDGE-071 | Forward at 8x not limited | Implemented |
| EDGE-080 | Speed presets validation | Implemented |
| EDGE-081 | All presets selectable via menu | Implemented |
| EDGE-082 | Speed button shows current value | Implemented |
| EDGE-090 | Speed change no frame skip | Implemented |
| EDGE-091 | Direction change resets timing | Implemented |
| EDGE-100 | Speed menu closes on outside click | Implemented |
| EDGE-101 | Opening menu closes existing | Implemented |
| EDGE-102 | Menu shows current speed highlighted | Implemented |
| EDGE-110 | Pause during buffering clears state | Implemented |
| EDGE-111 | Rapid play/pause no corruption | Implemented |
| EDGE-112 | Seeking while paused no auto-play | Implemented |
| EDGE-120 | Audio muted during reverse | Implemented |
| EDGE-121 | Audio resumes on forward after reverse | Implemented |

## Unit Test Cases

### Existing Tests in `src/core/session/Session.test.ts`

| Test ID | Description | Status |
|---------|-------------|--------|
| SES-001 | Initializes with default values | Implemented |
| SES-002 | Rounds fractional frame values | Implemented |
| SES-003 | Emits frameChanged event | Implemented |
| SES-006 | FPS clamps between 1-120 | Implemented |
| SES-007 | Loop mode cycles correctly | Implemented |
| SES-008 | Volume clamps 0-1 | Implemented |
| SES-009 | Mute toggle works | Implemented |
| SES-010 | play() sets isPlaying true | Implemented |
| SES-011 | pause() sets isPlaying false | Implemented |
| SES-012 | togglePlayback() works | Implemented |
| SES-013 | goToFrame() updates currentFrame | Implemented |
| SES-016 | goToStart() goes to inPoint | Implemented |
| SES-017 | goToEnd() goes to outPoint | Implemented |
| SES-025 | Forward playback advances frame | Implemented |
| SES-026 | Reverse playback decrements frame | Implemented |
| SES-027 | Reverse decrements multiple frames | Implemented |
| SES-028 | Direction toggle changes advancement | Implemented |
| SES-029 | Reverse stops at inPoint (once mode) | Implemented |
| SES-030 | Reverse wraps to outPoint (loop mode) | Implemented |
| SES-031 | Pingpong emits direction change at outPoint | Implemented |
| SES-032 | Pingpong emits direction change at inPoint | Implemented |

### Existing Tests in `src/utils/MediabunnyFrameExtractor.test.ts`

| Test ID | Description | Status |
|---------|-------------|--------|
| MFEXT-001 | Frame to timestamp at 24fps | Implemented |
| MFEXT-002 | Timestamp to frame at 24fps | Implemented |
| MFEXT-003 | FPS detection from metadata | Implemented |
| MFEXT-004 | Custom FPS override | Implemented |
| MFEXT-005 | Frame count calculation | Implemented |

## Feature Differences from Original OpenRV

| Feature | Original OpenRV | OpenRV Web |
|---------|-----------------|------------|
| Playback Engine | Native C++ with Qt | WebCodecs via mediabunny |
| Play-all-frames mode | Explicit toggle | Default behavior (frame-gated) |
| Realtime mode | Drops frames to maintain rate | Starvation timeout (5s) then skip |
| Audio sync | Per-sample sync | Video element time sync |
| Max reverse speed | Unlimited | Limited to 4x |
| Sub-frame interpolation | Supported | Not implemented |
| Multi-threading | Native threads | Web Workers (limited) |

## Future Enhancements

1. **Sub-frame interpolation**: Optical flow between frames for slow-motion
2. **Adaptive preloading**: Adjust preload window based on playback speed
3. **Per-source FPS UI**: Allow per-clip FPS override in UI
4. **Audio pitch correction**: Maintain pitch during speed changes
5. **Frame blending**: Optional motion blur for slow-motion
6. **Better audio sync**: Web Audio API for sample-accurate sync

## Related Files

- `/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts` - Main playback logic
- `/Users/lifeart/Repos/openrv-web/src/utils/MediabunnyFrameExtractor.ts` - Frame extraction
- `/Users/lifeart/Repos/openrv-web/src/utils/FramePreloadManager.ts` - Preload management
- `/Users/lifeart/Repos/openrv-web/src/nodes/sources/VideoSourceNode.ts` - Video source node
- `/Users/lifeart/Repos/openrv-web/e2e/playback-controls.spec.ts` - E2E tests
- `/Users/lifeart/Repos/openrv-web/e2e/playback-edge-cases.spec.ts` - Edge case tests
- `/Users/lifeart/Repos/openrv-web/src/core/session/Session.test.ts` - Unit tests
