# Image Sequences

![Image sequence loaded with frame counter](/assets/screenshots/47-image-sequence.png)

OpenRV Web loads and plays back numbered image file sequences as if they were video clips. Sequences are detected automatically from file naming patterns and support missing frame detection, FPS assignment, and memory-efficient frame caching.

## Loading Image Sequences

### Multi-File Selection

Select multiple numbered image files through the file picker or drag and drop. OpenRV Web detects the numbering pattern and treats the files as a sequence. For example, selecting `frame_001.png` through `frame_100.png` creates a 100-frame sequence.

### Single-File Inference

When a single numbered image file is loaded, OpenRV Web can infer the full sequence by examining other files in the same selection batch that share the naming pattern. The `inferSequenceFromSingleFile()` function matches files with the same base name and extension to discover the complete sequence.

### Directory Scanning

When multiple files are dropped or selected, the `discoverSequences()` function groups them by naming pattern and identifies the best sequence. The `getBestSequence()` function selects the longest matching sequence from discovered candidates.

## Pattern Notation

OpenRV Web recognizes several naming conventions for numbered files:

| Pattern | Example | Description |
|---------|---------|-------------|
| Underscore separator | `frame_001.png` | Number preceded by underscore |
| Dash separator | `frame-001.png` | Number preceded by dash |
| Dot separator | `frame.001.png` | Number preceded by dot |
| No separator | `frame001.png` | Number directly after name |
| Printf notation | `frame.%04d.exr` | C-style printf format |
| Hash notation | `frame.####.exr` | Each `#` represents one digit |
| At-sign notation | `frame.@@@@.exr` | Each `@` represents one digit |

Pattern detection is automatic and requires no configuration. The detected pattern is displayed using hash notation (e.g., `frame_####.png`) in the Info Panel overlay (toggle with the info panel shortcut).

## Missing Frame Detection

After detecting a sequence range, OpenRV Web checks for gaps. If files are missing within the range (e.g., frames 1--10 exist but frame 5 is absent), the missing frames are identified and tracked.

Missing frames can be queried programmatically:

- `detectMissingFrames()` -- returns a list of missing frame numbers
- `isFrameMissing(frame)` -- checks whether a specific frame is missing

When playback reaches a missing frame, the application holds the last available frame rather than displaying a blank screen.

## Frame Range

The sequence range is determined automatically from the lowest to highest frame number in the loaded files. The timeline displays the total frame count and allows standard playback controls (play, pause, step, seek).

In/out points (`I` / `O` or `[` / `]`) constrain playback to a subset of the sequence range.

## FPS Assignment

Image sequences do not have an inherent frame rate. OpenRV Web assigns a default FPS (typically 24) when loading a sequence. The session playback FPS can be configured:

```javascript
// Get the source FPS (read-only, reflects the loaded media or default)
const sourceFps = window.openrv.media.getFPS();

// Get the current playback FPS (may differ from source FPS if overridden)
const playbackFps = window.openrv.media.getPlaybackFPS();

// Override the playback FPS for the current session
window.openrv.media.setPlaybackFPS(48);
```

The timeline status bar displays the configured FPS during playback.

## Memory Management

Image sequences can consume significant memory. OpenRV Web uses several strategies to manage resource usage:

- **Preload window** -- 5 frames ahead and behind the current frame are loaded proactively
- **Keep window** -- up to 20 frames are kept in memory at a time
- **Blob URL lifecycle** -- blob URLs are created when a frame loads and revoked when released
- **Distance-based release** -- frames far from the current position are released automatically via `releaseDistantFrames()`
- **Dispose** -- all blob URLs and image references are cleaned up when switching sources

## Supported Image Formats

Sequences can consist of files in any supported image format:

- PNG, JPEG, WebP, GIF, BMP
- EXR (with HDR precision and multi-layer support)
- TIFF (float 32-bit)
- DPX, Cineon
- Radiance HDR
- JPEG XL, JPEG 2000
- AVIF, HEIC

When loading EXR sequences, each frame benefits from the full HDR pipeline including WebAssembly decoding, Float32 precision, and layer/AOV selection.

## Scripting API

```javascript
// Get information about the current media
const duration = window.openrv.media.getDuration();
const resolution = window.openrv.media.getResolution();
const source = window.openrv.media.getCurrentSource();

// FPS control
const fps = window.openrv.media.getPlaybackFPS();
window.openrv.media.setPlaybackFPS(30);
```

---

## Related Pages

- [EXR Multi-Layer Workflow](exr-layers.md) -- AOV selection in EXR sequences
- [Timeline Controls](timeline-controls.md) -- navigating through sequence frames
- [Channel Isolation](channel-isolation.md) -- viewing individual channels
- [File Formats Reference](../reference/file-formats.md) -- complete format list
