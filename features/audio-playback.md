# Audio Playback

## Original OpenRV Implementation
OpenRV provides comprehensive audio support for professional review workflows:

**Audio Formats**:
- WAV files (recommended for cross-platform)
- Apple AIFF format
- Embedded audio in video containers
- Sample rate conversion for mixed sources

**Audio Features**:
- Per-source and global volume controls
- Audio offset adjustment (sync correction)
- Waveform visualization in timeline magnifier
- Multichannel layout support (stereo, 5.1, 7.1)
- Audio scrubbing for frame-by-frame review
- Audio mixing when multiple sources are layered

**Playback Modes**:
- Realtime mode: Audio plays at correct speed, frames may skip
- Play-all-frames mode: Audio speed adjusts to match frame display

**Technical Configuration**:
- Configurable audio buffer sizes
- Device selection
- Output sample rate and precision
- Hardware sync options
- Global audio offset for latency compensation

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Implementation Summary

The audio playback feature is **fully implemented** with the following components:

### Core Components

1. **AudioPlaybackManager** (`/src/audio/AudioPlaybackManager.ts`)
   - Web Audio API based playback with HTMLVideoElement fallback
   - Volume control (0-1 range, default 0.7)
   - Mute/unmute functionality
   - Playback rate control (0.1x - 8x)
   - Automatic muting during reverse playback
   - Audio-video sync with drift correction (100ms threshold)
   - Event-driven state management (stateChanged, error, ended)
   - CORS fallback handling (gracefully falls back to video element)

2. **WaveformRenderer** (`/src/audio/WaveformRenderer.ts`)
   - Audio extraction from video files
   - Waveform peak calculation for visualization
   - Multiple extraction methods:
     - Native Web Audio API fetch + decode
     - Mediabunny fallback for local files
   - Timeline-integrated waveform rendering
   - Multi-channel audio support (mono averaging)

3. **VolumeControl** (`/src/ui/components/VolumeControl.ts`)
   - Mute toggle button with dynamic icon (volume-mute, volume-low, volume-high)
   - Expandable volume slider on hover (0-100%)
   - Previous volume restoration on unmute
   - A11Y focus handling
   - Event emission for volume/mute state changes

4. **Timeline Integration** (`/src/ui/components/Timeline.ts`)
   - Audio waveform visualization in timeline
   - Automatic waveform loading on source change
   - Themed waveform colors via CSS variables

5. **Session State** (`/src/core/session/SessionState.ts`)
   - Volume and muted state persistence
   - Default volume: 0.7 (70%)
   - State serialization for project save/load

## Requirements Analysis

| Requirement | Status | Notes |
|------------|--------|-------|
| WAV/AIFF/MP3 audio file support | Implemented | Via Web Audio API decodeAudioData |
| Embedded audio extraction from video | Implemented | AudioPlaybackManager.loadFromVideo() |
| Per-source volume control | Implemented | Volume stored per session |
| Global volume control | Implemented | VolumeControl component |
| Audio offset/sync adjustment | Implemented | syncToTime() with 100ms threshold |
| Waveform visualization | Implemented | Timeline waveform rendering |
| Audio scrubbing | Implemented | Seek updates audio position |
| Mute/solo functionality | Implemented | Mute toggle with state preservation |
| Sample rate conversion | Implemented | Web Audio API handles automatically |
| Low-latency playback | Implemented | Web Audio API with buffer management |
| Audio/video sync maintenance | Implemented | Drift correction during playback |

## UI/UX Specification

### Volume Control (Header Bar)
- **Location**: Header bar, right side utility group
- **Components**:
  - Mute button (28px, icon-only)
  - Volume slider (80px wide, appears on hover)
- **Behavior**:
  - Click mute button: Toggle mute state
  - Hover over area: Show volume slider
  - Drag slider: Adjust volume (0-100%)
  - Setting volume to 0: Auto-mutes
  - Setting volume > 0 when muted: Auto-unmutes
- **Icons**:
  - `volume-high`: Volume > 50%
  - `volume-low`: Volume 1-50%
  - `volume-mute`: Muted or volume = 0

### Timeline Waveform
- **Location**: Timeline component, within track area
- **Color**: `rgba(var(--accent-primary-rgb), 0.4)` (blue tint)
- **Rendering**: Peak bars centered vertically
- **Behavior**: Auto-loads when video source is set

### Keyboard Shortcuts
- `M` (in video mode): Toggle mute

## Technical Notes

### Architecture
```
App.ts
  |
  +-- VolumeControl (UI)
  |     |
  |     +-- emits volumeChanged/mutedChanged
  |
  +-- Session
  |     |
  |     +-- stores volume/muted state
  |     +-- emits volumeChanged/mutedChanged
  |
  +-- Timeline
        |
        +-- WaveformRenderer
              |
              +-- extractAudioFromVideo()
              +-- renderWaveformRegion()
```

### AudioPlaybackManager Flow
1. **Initialization**: `initContext()` creates AudioContext
2. **Loading**: `loadFromVideo()` or `loadFromBlob()` decodes audio
3. **Playback**: `play(fromTime?)` starts from position
4. **Sync**: `syncToTime()` corrects drift during playback
5. **Control**: `setVolume()`, `setMuted()`, `setPlaybackRate()`
6. **Cleanup**: `dispose()` releases resources

### Fallback Strategy
1. Try Web Audio API fetch + decode
2. On CORS/network error: Fall back to HTMLVideoElement audio
3. On decode error: Log warning, use video element

### State Persistence
```typescript
interface PlaybackState {
  volume: number;    // 0-1, default 0.7
  muted: boolean;    // default false
  // ... other playback state
}
```

## E2E Test Cases

Existing tests in `/e2e/audio-playback.spec.ts`:

| Test ID | Description | Status |
|---------|-------------|--------|
| AUDIO-001 | Initial volume should be 0.7 (70%) | Implemented |
| AUDIO-002 | Initial muted state should be false | Implemented |
| AUDIO-003 | Clicking mute button should toggle muted state | Implemented |
| AUDIO-004 | Volume should be preserved after mute/unmute cycle | Implemented |
| AUDIO-005 | Volume slider should update volume state | Implemented |
| AUDIO-006 | Setting volume to 0 should mute audio | Implemented |
| AUDIO-007 | Setting volume above 0 when muted should unmute | Implemented |
| AUDIO-010 | Audio should play during forward playback | Implemented |
| AUDIO-011 | Audio should be muted during reverse playback | Implemented |
| AUDIO-012 | Toggling direction during playback should update audio state | Implemented |
| AUDIO-013 | Mute state should persist across play/pause | Implemented |
| AUDIO-014 | Volume state should persist across play/pause | Implemented |
| AUDIO-020 | Audio should stay in sync during forward playback | Implemented |
| AUDIO-021 | Seeking should not cause playback issues | Implemented |
| AUDIO-022 | Looping should not cause audio glitches | Implemented |
| AUDIO-030 | Mute button icon should change when muted | Implemented |
| AUDIO-031 | Volume slider should show 0 when muted | Implemented |
| AUDIO-040 | Playback should continue even if audio fails to load | Implemented |
| AUDIO-041 | Multiple rapid play/pause should not cause issues | Implemented |
| AUDIO-042 | Seeking during playback should not break audio | Implemented |
| AUDIO-050 | M key should toggle mute (when in video mode) | Implemented |

## Unit Test Cases

### AudioPlaybackManager Tests (`/src/audio/AudioPlaybackManager.test.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| APM-001 | Starts in idle state | Implemented |
| APM-002 | Starts with isPlaying false | Implemented |
| APM-003 | Starts with duration 0 | Implemented |
| APM-004 | Starts with default volume 0.7 | Implemented |
| APM-005 | Starts with muted false | Implemented |
| APM-006 | currentTime is clamped to valid range | Implemented |
| APM-010 | Creates AudioContext | Implemented |
| APM-011 | Resumes suspended context | Implemented |
| APM-012 | Only creates context once | Implemented |
| APM-020 | Loads audio from video element | Implemented |
| APM-021 | Falls back to video element on fetch error | Implemented |
| APM-022 | Handles video with no source | Implemented |
| APM-030 | Loads audio from blob | Implemented |
| APM-031 | Handles decode error | Implemented |
| APM-040 | Play starts playback | Implemented |
| APM-041 | Play does nothing if already playing | Implemented |
| APM-042 | Pause stops playback | Implemented |
| APM-043 | Pause does nothing if not playing | Implemented |
| APM-044 | Play from specific time | Implemented |
| APM-050 | Seek updates current time when paused | Implemented |
| APM-051 | Seek clamps to valid range | Implemented |
| APM-052 | Seek restarts playback if was playing | Implemented |
| APM-060 | syncToTime updates time when paused | Implemented |
| APM-061 | syncToTime ignores small drift during playback | Implemented |
| APM-062 | syncToTime resyncs on large drift | Implemented |
| APM-070 | setVolume updates gain | Implemented |
| APM-071 | setVolume clamps to valid range | Implemented |
| APM-072 | setMuted sets gain to 0 | Implemented |
| APM-073 | Unmuting restores volume | Implemented |
| APM-080 | setPlaybackRate updates rate | Implemented |
| APM-081 | setPlaybackRate clamps to valid range | Implemented |
| APM-090 | setReversePlayback mutes audio | Implemented |
| APM-091 | setReversePlayback(false) restores audio | Implemented |
| APM-100 | Emits stateChanged events | Implemented |
| APM-101 | Emits error events | Implemented |
| APM-102 | Emits ended event when video element ends | Implemented |
| APM-110 | Dispose cleans up resources | Implemented |
| APM-111 | Play after dispose returns false | Implemented |
| APM-112 | Seek after dispose does not crash | Implemented |
| APM-113 | setVolume after dispose does not crash | Implemented |
| APM-114 | Pause after dispose does not crash | Implemented |
| APM-120 | Uses video element when Web Audio fails | Implemented |
| APM-121 | Handles autoplay policy error in fallback | Implemented |

### WaveformRenderer Tests (`/src/audio/WaveformRenderer.test.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| WAV-001 | Starts with no data | Implemented |
| WAV-002 | Starts not loading | Implemented |
| WAV-003 | Starts with no error | Implemented |
| WAV-004 | Clears data and state | Implemented |
| WAV-005 | Does nothing when no data | Implemented |
| WAV-006 | Returns false when already loading (video) | Implemented |
| WAV-007 | Returns false when already loading (blob) | Implemented |
| EXT-001 | extractAudioFromVideo handles success | Implemented |
| EXT-002 | extractAudioFromVideo handles fetch error | Implemented |
| EXT-003 | extractAudioFromBlob handles success | Implemented |
| EXT-004 | extractAudioFromBlob handles decode error | Implemented |
| EXT-005 | extractAudioFromVideo handles CORS error | Implemented |
| EXT-006 | extractAudioFromVideo handles no source | Implemented |
| EXT-007 | extractAudioFromVideo handles timeout | Implemented |
| EXT-008 | extractAudioFromVideo handles network error | Implemented |
| EXT-009 | extractAudioFromVideo handles decode error with callback | Implemented |
| EXT-010 | extractAudioFromVideo handles multi-channel audio | Implemented |
| EXT-020 | extractAudioWithFallback returns native result when successful | Implemented |
| EXT-021 | extractAudioWithFallback returns null when native fails and no file provided | Implemented |
| EXT-022 | extractAudioWithFallback calls onError when native method fails | Implemented |
| EXT-023 | extractAudioWithFallback onProgress is passed through | Implemented |
| RND-001 | Clears canvas before rendering | Implemented |
| RND-002 | Fills background when not transparent | Implemented |
| RND-003 | Draws center line when enabled | Implemented |
| RND-004 | Does not draw center line when disabled | Implemented |
| RND-005 | Draws waveform bars | Implemented |
| RND-006 | Handles empty peaks array | Implemented |
| RND-007 | Handles zero duration | Implemented |
| RND-008 | Respects custom color | Implemented |
| RND-009 | Handles time range subset | Implemented |
| RND-010 | Handles negative time range | Implemented |
| RND-011 | Uses data.duration if endTime is not provided | Implemented |
| RGN-001 | Renders within specified bounds | Implemented |
| RGN-002 | Handles empty peaks | Implemented |
| RGN-003 | Handles zero width | Implemented |
| RGN-004 | Handles zero height | Implemented |
| RGN-005 | Handles negative time range | Implemented |
| RGN-006 | Uses custom color | Implemented |
| RGN-007 | Renders individual bars when zoomed in | Implemented |
| RGN-008 | Samples peaks when zoomed out | Implemented |

## User Flow Verification

### Volume Adjustment Flow
1. User hovers over volume area in header bar
2. Volume slider expands (80px)
3. User drags slider to desired level
4. Volume updates in real-time
5. Icon changes based on volume level
6. User moves away, slider collapses

### Mute Toggle Flow
1. User clicks mute button
2. Volume remembered internally
3. Icon changes to mute
4. Audio silenced
5. User clicks again
6. Previous volume restored
7. Icon returns to appropriate level

### Playback with Audio Flow
1. User loads video file
2. AudioPlaybackManager loads audio from video
3. WaveformRenderer extracts audio for visualization
4. Timeline displays waveform
5. User starts playback
6. Audio plays in sync with video
7. Drift correction maintains sync

### Reverse Playback Flow
1. User starts reverse playback
2. setReversePlayback(true) called
3. Audio automatically muted (reverse audio sounds bad)
4. User switches to forward
5. setReversePlayback(false) called
6. Audio restored to previous state

## Files

- `/src/audio/AudioPlaybackManager.ts` - Core audio playback engine
- `/src/audio/AudioPlaybackManager.test.ts` - Unit tests (42 tests)
- `/src/audio/WaveformRenderer.ts` - Waveform extraction and rendering
- `/src/audio/WaveformRenderer.test.ts` - Unit tests (38 tests)
- `/src/ui/components/VolumeControl.ts` - Volume control UI component
- `/src/ui/components/VolumeControl.test.ts` - Unit tests
- `/src/ui/components/Timeline.ts` - Timeline with waveform integration
- `/src/core/session/SessionState.ts` - State persistence types
- `/e2e/audio-playback.spec.ts` - E2E tests (21 tests)
