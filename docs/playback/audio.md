# Audio Playback

OpenRV Web provides audio playback with sync correction, volume control, waveform visualization, and automatic handling of browser autoplay restrictions.

## Audio Sources

Audio is extracted from video files automatically when media is loaded. The AudioPlaybackManager uses the Web Audio API as the primary playback engine, with an HTMLVideoElement fallback for cases where CORS restrictions or decoding errors prevent Web Audio access.

The extraction flow:

1. Attempt native Web Audio API fetch and decode
2. On CORS or network error, fall back to the video element audio track
3. On decode error, log a warning and use the video element

Audio works with all supported video containers (MP4, MOV, MKV, WebM, OGG, AVI).

## Volume Control

The volume control appears in the right side of the header bar:

- **Mute button** (28px) -- click to toggle mute
- **Volume slider** (80px) -- appears on hover, drag to adjust (0--100%)

Volume icons update based on the current level:

| Icon | Condition |
|------|-----------|
| Volume high | Volume above 50% |
| Volume low | Volume 1--50% |
| Volume mute | Muted or volume at 0% |

The default volume is 70% (0.7). Setting volume to 0 auto-mutes. Setting volume above 0 while muted auto-unmutes. The previous volume level is preserved across mute/unmute cycles.

## Audio Sync

During forward playback at 1x speed, the AudioPlaybackManager maintains synchronization between audio and video through drift correction. If the audio-video drift exceeds 100 milliseconds, the audio position is resynced by seeking to the correct time.

Audio sync behavior by playback state:

| State | Audio Behavior |
|-------|---------------|
| Forward 1x | Audio plays with drift correction |
| Non-1x speed | Audio paused |
| Reverse playback | Audio muted |
| Paused | Audio paused |

When switching from reverse to forward playback, or from non-1x speed to 1x, audio resumes at the correct position with the previous volume level restored.

## Waveform Display

When a video file with audio is loaded, the WaveformRenderer extracts audio data and generates a waveform visualization for the timeline. The waveform appears as a semi-transparent blue overlay on the timeline track.

The waveform rendering supports:

- Multi-channel audio (averaged to mono for display)
- Region-based rendering for timeline integration
- Peak calculation for visual accuracy

## Autoplay Handling

Browsers restrict audio playback until a user interacts with the page. The AudioPlaybackManager handles this gracefully:

1. On first play attempt, it tries to resume the AudioContext
2. If the AudioContext is suspended due to autoplay policy, it waits for a user gesture
3. Audio starts automatically once the browser policy is satisfied

Playback continues without audio if audio loading fails entirely. Video frames still display correctly.

## Page Visibility

When the browser tab becomes hidden (user switches to another tab), playback auto-pauses to conserve resources. Audio stops along with video. When the tab becomes visible again, the user can resume playback manually.

## Scripting API

Audio controls are available through the public API:

```javascript
window.openrv.audio.setVolume(0.8);    // Set volume to 80%
window.openrv.audio.getVolume();        // Get current volume
window.openrv.audio.mute();             // Mute audio
window.openrv.audio.unmute();           // Unmute audio
window.openrv.audio.isMuted();          // Check mute state
```

---

## Related Pages

- [J/K/L Navigation](jkl-navigation.md) -- audio behavior at different speeds
- [Loop Modes](loop-modes-stepping.md) -- audio during loop transitions
- [Timeline Controls](timeline-controls.md) -- waveform display on timeline
