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

Pattern strings can also be used programmatically to load sequences:

```javascript
// Load a sequence from a hash-notation pattern (frames 1001-1100 at 24 fps)
await window.openrv.media.addSourceFromPattern('/renders/shot.####.exr', 1001, 1100);

// Load from printf notation
await window.openrv.media.addSourceFromPattern('frame.%04d.png', 1, 48, 30);

// Load from at-sign notation
await window.openrv.media.addSourceFromPattern('render.@@@@.exr', 1, 100);

// Pattern strings are also auto-detected by addSourceFromURL
await window.openrv.media.addSourceFromURL('shot.####.exr');
```

## Missing Frame Detection

After detecting a sequence range, OpenRV Web checks for gaps. If files are missing within the range (e.g., frames 1--10 exist but frame 5 is absent), the missing frames are identified and tracked.

Missing frames can be queried programmatically through the public API:

```javascript
// Get all missing frame numbers in the active sequence
const missing = window.openrv.sequence.detectMissingFrames();
// e.g. [5, 12, 13]

// Check whether a specific frame is missing
if (window.openrv.sequence.isFrameMissing(5)) {
  console.log('Frame 5 is missing');
}
```

When playback reaches a missing frame, the behavior depends on the selected **missing-frame mode** (configurable in the **View** tab toolbar):

- **Off**: No indication; the viewer draws whatever is available.
- **Frame** (default): The current source frame continues to display with a centered warning-icon overlay showing the missing frame number.
- **Hold**: The nearest available preceding frame is shown in place of the missing frame.
- **Black**: The viewer is replaced with a solid black frame.

For full details on each mode and the overlay appearance, see [Overlays and Guides — Missing Frame Indicator](../advanced/overlays.md#missing-frame-indicator).

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

Image sequences can consume significant memory. OpenRV Web uses two distinct caching strategies depending on how media is loaded.

### Direct Session Path (File-Based Image Sequences)

When image sequences are loaded from local files (drag-and-drop or file picker), the session layer manages caching directly via `SessionMedia` and the `SequenceLoader` utilities:

- **Initial preload** -- on sequence load, the first 10 frames are preloaded immediately to prime the cache
- **Per-frame preload window** -- each time a frame is fetched, 5 frames on each side of the current position are preloaded proactively
- **Retention window** -- up to 20 frames are retained around the current position; frames beyond this distance are released automatically via `releaseDistantFrames()`
- **Direct decode** -- frames are decoded directly from `File` objects using `createImageBitmap(frame.file, ...)` for browser-native formats (PNG, JPEG, WebP, etc.) or through the decoder registry for pro formats (EXR, DPX, Cineon, HDR, TIFF). No intermediate blob URLs are created during loading.
- **Distance-based release** -- `releaseDistantFrames()` closes `ImageBitmap` handles and drops decoded `Float32Array` data for frames outside the retention window
- **Dispose** -- all `ImageBitmap` handles and decoded data references are cleaned up when switching sources. The `SequenceFrame.url` field is vestigial; no production code assigns it during file-based loading, but cleanup paths (`releaseDistantFrames`, `disposeSequence`) defensively revoke it if present.

### Node-Graph Path (Video and Mediabunny Sources)

When media is loaded through the node graph (e.g., video files decoded via the `mediabunny` WebCodecs backend, or `SequenceSourceNode`), caching is handled by `FramePreloadManager` with larger, more sophisticated buffers:

- **Max cache size** -- up to 100 frames are kept in an LRU cache (clamped between 5 and 500)
- **Playback preloading** -- during playback, 30 frames are preloaded ahead in the playback direction and 5 frames are kept behind
- **Scrub preloading** -- when scrubbing (paused navigation), 10 frames are preloaded symmetrically in each direction around the current position
- **Concurrency limit** -- at most 3 concurrent preload requests (1 for the current frame + 2 for sequential preloading)
- **Priority-based queue** -- closer frames load first; priority degrades with distance from the current frame
- **Direction-aware** -- preload direction adapts to forward or reverse playback; changing direction aborts stale preload requests
- **LRU eviction** -- when the cache reaches 80% capacity, distant frames are evicted using least-recently-used ordering
- **Request cancellation** -- pending preload requests are cancelled when navigating away or changing playback state, with `AbortSignal` propagation to the decoder

### Which Path Is Used?

| Media type | Caching path | When used |
|---|---|---|
| Local image files (PNG, EXR, DPX, etc.) via drag-and-drop or file picker | Direct session path | `SessionMedia.getSequenceFrame()` with `preloadFrames()` and `releaseDistantFrames()` |
| Video files (MP4, MOV, WebM, etc.) using WebCodecs/mediabunny | Node-graph path (`FramePreloadManager`) | `VideoSourceNode` with mediabunny frame extraction |
| Image sequences through node graph | Node-graph path (`FramePreloadManager`) | `SequenceSourceNode` with default preload config |

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

// Load sequence from pattern string
await window.openrv.media.addSourceFromPattern('/renders/shot.####.exr', 1001, 1100);
```

---

## Related Pages

- [EXR Multi-Layer Workflow](exr-layers.md) -- AOV selection in EXR sequences
- [Timeline Controls](timeline-controls.md) -- navigating through sequence frames
- [Channel Isolation](channel-isolation.md) -- viewing individual channels
- [File Formats Reference](../reference/file-formats.md) -- complete format list
