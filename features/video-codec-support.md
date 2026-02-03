# Video Codec Support

## Original OpenRV Implementation
OpenRV supports various video container formats and codecs through FFmpeg integration:

**Container Formats**:
- **QuickTime (.mov)**: Primary container format
- **MPEG-4 (.mp4)**: Nearly identical to QuickTime container
- **Windows AVI (.avi)**: Supported with same codecs
- **MXF**: Professional broadcast format
- **WebM**: Web-optimized format

**Video Codecs**:
- **Photo-JPEG**: Individual frame storage enabling fast random access
- **Motion-JPEG**: Stores even/odd scanlines separately
- **H.264 (avc1)**: Modern codec with keyframe-based compression
- **H.265/HEVC**: Next-generation compression
- **ProRes**: Apple professional codecs
- **DNxHD/DNxHR**: Avid professional codecs
- **RAW codecs**: Both RGB and YUV variants for fast playback

**Codec Characteristics**:
- Random access vs. keyframe-based codecs
- Hardware decoding support (YUV/YCbCr)
- Bit depth support (8-bit, 10-bit, 12-bit)

**Streaming Support**:
- URL-based media paths for MOV, MP4 formats
- Region and Lookahead caching for optimized streaming

## Status
- [ ] Not implemented
- [x] Partially implemented
- [ ] Fully implemented

## What's Implemented

### Core Video Decoding
1. **WebCodecs API Integration** via mediabunny library (`src/utils/MediabunnyFrameExtractor.ts`)
   - Hardware-accelerated decoding when available
   - Frame-accurate seeking for any frame regardless of keyframe positions
   - Frame index building for precise frame-to-timestamp mapping
   - Automatic FPS detection from actual video frames
   - Support for videos with B-frames (decode order vs presentation order handling)

2. **VideoSourceNode** (`src/nodes/sources/VideoSourceNode.ts`)
   - Dual-mode extraction: mediabunny (WebCodecs) with HTMLVideoElement fallback
   - Frame caching with intelligent preload management (`FramePreloadManager`)
   - Direction-aware preloading for smooth playback (forward/reverse)
   - Playback state management (active vs scrubbing modes)
   - FPS configuration and auto-detection

3. **Supported Codecs** (via WebCodecs/browser support):
   - H.264/AVC (primary, well-supported)
   - VP8/VP9 (WebM containers)
   - AV1 (modern browsers)
   - HEVC/H.265 (Safari, some Chrome configurations)
   - Container formats: MP4, WebM, MOV (via browser support)

4. **Audio Playback** (`src/audio/AudioPlaybackManager.ts`)
   - Web Audio API for independent audio control
   - HTMLVideoElement fallback for CORS-restricted content
   - Volume control and mute/unmute
   - Playback rate control
   - Auto-mute during reverse playback
   - Sync with frame-accurate video playback

5. **Frame Caching & Preloading**
   - Configurable cache size (default: 100+ frames)
   - Priority-based preloading around current frame
   - Request coalescing to prevent duplicate fetches
   - AbortController support for cancellation

### ProRes/DNxHD Codec Support (Task 1.4)

**Status**: Implemented with clear error handling

Professional codecs like ProRes and DNxHD are **not supported** by web browsers due to:
- Browser WebCodecs API limitations (only consumer codecs supported)
- No native browser decoding for professional editing formats
- These formats require native FFmpeg/libavcodec libraries

**What's Implemented**:

1. **Codec Detection** (`src/utils/CodecUtils.ts`)
   - Detects ProRes variants: Proxy, LT, Standard, HQ, 4444, 4444 XQ, RAW, RAW HQ
   - Detects DNxHD/DNxHR variants
   - Parses FourCC codes (apch, apcn, ap4h, AVdn, etc.)

2. **Error Handling**
   - `UnsupportedCodecException` with detailed codec info
   - User-friendly error modal with:
     - Clear explanation of why the codec isn't supported
     - FFmpeg transcoding commands
     - File details and codec information

3. **Session Events**
   - `unsupportedCodec` event emitted when ProRes/DNxHD detected
   - App displays informative modal with transcoding guidance

4. **Transcoding Recommendations**:
   ```bash
   # For quality preservation:
   ffmpeg -i input.mov -c:v libx264 -crf 18 -preset slow -c:a aac output.mp4

   # For smaller file size:
   ffmpeg -i input.mov -c:v libx264 -crf 23 -preset medium -c:a aac output.mp4

   # For modern browsers (best quality/size ratio):
   ffmpeg -i input.mov -c:v libsvtav1 -crf 30 -c:a libopus output.webm
   ```

**Browser Codec Support Table**:

| Codec | Chrome | Firefox | Safari | Edge |
|-------|--------|---------|--------|------|
| H.264/AVC | Yes | Yes | Yes | Yes |
| H.265/HEVC | Partial | No | Yes | Partial |
| VP8 | Yes | Yes | Partial | Yes |
| VP9 | Yes | Yes | Partial | Yes |
| AV1 | Yes | Yes | Safari 17+ | Yes |
| ProRes | No | No | No | No |
| DNxHD/DNxHR | No | No | No | No |

### What's Missing

1. **Advanced Features**:
   - Multiple audio track support (currently single track only)
   - 10-bit/12-bit color depth (limited to browser capabilities)
   - RAW codec support

2. **Streaming Features**:
   - Progressive streaming with buffering visualization
   - Network-aware quality adaptation
   - Range request optimization for large files

## UI/UX Specification

### Current Implementation
- Video files load via file picker or drag-and-drop
- Automatic codec detection and fallback behavior
- Frame-accurate navigation with arrow keys
- Playback controls in header bar
- Timeline with frame scrubbing
- Volume control with mute toggle

### Codec Information Display
The application displays codec information in:
- Session state (accessible via test helper)
- `useMediabunny` property indicates WebCodecs mode
- `codec` property shows detected video codec (e.g., "avc1")

## Technical Notes

### WebCodecs API Check
```typescript
static isSupported(): boolean {
  return (
    typeof VideoDecoder !== 'undefined' &&
    typeof VideoEncoder !== 'undefined'
  );
}
```

### Frame Extraction Flow
1. Load video file via `VideoSourceNode.loadFile()`
2. Initialize HTMLVideoElement as fallback
3. Attempt mediabunny initialization with WebCodecs
4. Build frame index by iterating all frames (sorted by presentation timestamp)
5. Extract frames by timestamp lookup in frame index
6. Cache frames via FramePreloadManager

### Fallback Behavior
When WebCodecs is unavailable or codec is unsupported:
- HTMLVideoElement extracts frames via canvas drawing
- Less accurate seeking (depends on browser's video seeking)
- Still functional for playback and navigation

## E2E Test Cases

### Existing Tests (`e2e/video-frame-extraction.spec.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| VFE-MB-001 | Mediabunny initialization when loading video | Implemented |
| VFE-MB-002 | Mediabunny status reflects in session state | Implemented |
| VFE-MB-003 | Video loading enables frame-accurate extraction | Implemented |
| VFE-001 | Each frame step forward shows different content | Implemented |
| VFE-002 | Each frame step backward shows different content | Implemented |
| VFE-003 | Navigating to same frame shows same content | Implemented |
| VFE-004 | Frame number matches displayed content | Implemented |
| VFE-010 | All frames in sequence are unique | Implemented |
| VFE-011 | Frame content does not skip frames | Implemented |
| VFE-020 | Playback advances through different frames | Implemented |
| VFE-021 | Reverse playback shows different frames | Implemented |
| VFE-022 | Stopped frame matches manually navigated frame | Implemented |
| VFE-030 | Rapid navigation shows correct frames | Implemented |
| VFE-031 | Jumping to distant frame shows correct content | Implemented |
| VFE-040 | currentFrame state matches visual content | Implemented |
| VFE-041 | Frame count is accurate | Implemented |

### Audio Playback Tests (`e2e/audio-playback.spec.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| AUDIO-001 | Initial volume is 0.7 | Implemented |
| AUDIO-002 | Initial muted state is false | Implemented |
| AUDIO-003 | Mute button toggles muted state | Implemented |
| AUDIO-004 | Volume preserved after mute/unmute | Implemented |
| AUDIO-005 | Volume slider updates volume state | Implemented |
| AUDIO-010 | Audio plays during forward playback | Implemented |
| AUDIO-011 | Audio muted during reverse playback | Implemented |
| AUDIO-020 | Audio stays in sync during playback | Implemented |
| AUDIO-022 | Looping does not cause audio glitches | Implemented |

### Additional Test Cases (VID-XXX format for future implementation)

| Test ID | Description | Priority |
|---------|-------------|----------|
| VID-001 | Verify H.264 codec detection and playback | High |
| VID-002 | Verify VP9/WebM playback | Medium |
| VID-003 | Verify graceful fallback for unsupported codecs | High |
| VID-004 | Verify codec info displayed in session state | Medium |
| VID-005 | Test large file (>1GB) handling with streaming | Low |
| VID-006 | Test variable frame rate video handling | Medium |
| VID-007 | Verify FPS auto-detection accuracy | High |

## Unit Test Cases

### Existing Tests

#### MediabunnyFrameExtractor (`src/utils/MediabunnyFrameExtractor.test.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| MFE-001 | CanvasSink created with fit option | Implemented |
| MFE-002 | Frame to timestamp conversion at 24fps | Implemented |
| MFE-003 | Timestamp to frame conversion at 24fps | Implemented |
| MFE-004 | Round-trip frame/timestamp conversion | Implemented |
| MFE-005 | isSupported returns boolean | Implemented |
| MFE-006 | Not ready before load | Implemented |
| MFE-007 | getFrame throws before load | Implemented |
| MFE-008 | Load returns metadata | Implemented |
| MFE-009 | Extractor ready after load | Implemented |
| MFE-010 | Custom FPS value applied | Implemented |
| MFE-011 | Cleanup on re-load | Implemented |
| MFE-012 | AbortController support | Implemented |
| MFE-013 | External AbortSignal support | Implemented |

#### VideoSourceNode (`src/nodes/sources/VideoSourceNode.test.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| VSN-001 | Dispose handles no video loaded | Implemented |
| VSN-002 | Serializes node state | Implemented |
| VSN-003 | Does not accept inputs | Implemented |
| VSN-004 | setFps updates property | Implemented |
| VSN-005 | setFps doesn't throw without video | Implemented |
| VSN-006 | Rejects with error on load failure | Implemented |
| VSN-007 | DEFAULT_PRELOAD_CONFIG supports 70+ frames | Implemented |
| VSN-008 | No hardcoded preload config values | Implemented |
| VSN-009 | getUnsupportedCodecError returns null initially | Implemented |
| VSN-010 | Has codec property | Implemented |

#### CodecUtils (`src/utils/CodecUtils.test.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| CODEC-U001 | Detect ProRes codec from various strings | Implemented |
| CODEC-U002 | Detect DNxHD/DNxHR codec | Implemented |
| CODEC-U003 | Detect H.264/AVC codec | Implemented |
| CODEC-U004 | Detect H.265/HEVC codec | Implemented |
| CODEC-U005 | Detect VP8/VP9 codecs | Implemented |
| CODEC-U006 | Detect AV1 codec | Implemented |
| CODEC-U007 | Detect MJPEG codec | Implemented |
| CODEC-U008 | Return unknown for null/undefined | Implemented |
| CODEC-U009 | Return unknown for unrecognized codecs | Implemented |
| CODEC-U010 | Parse ProRes info with correct variant | Implemented |
| CODEC-U020 | Mark H.264/H.265/VP8/VP9/AV1 as supported | Implemented |
| CODEC-U021 | Mark ProRes/DNxHD as unsupported | Implemented |
| CODEC-U030 | Return supported status for H.264 | Implemented |
| CODEC-U031 | Return requires transcoding for ProRes | Implemented |
| CODEC-U050 | Create error with correct title for ProRes | Implemented |
| CODEC-U051 | Create error with correct title for DNxHD | Implemented |
| CODEC-U080 | Identify all ProRes variants | Implemented |
| CODEC-U081 | Detect 12-bit depth for 4444 variants | Implemented |
| CODEC-U082 | Detect 10-bit depth for non-4444 variants | Implemented |

### Unsupported Codec E2E Tests (`e2e/unsupported-codec.spec.ts`)

| Test ID | Description | Status |
|---------|-------------|--------|
| UC-001 | Unsupported codec modal should be dismissible | Implemented |
| UC-002 | Modal should close on Escape key | Implemented |
| UC-010 | Loading H.264 video should not trigger codec error | Implemented |
| UC-011 | App should remain functional after codec error | Implemented |
| CD-001 | Codec info should be accessible via session state | Implemented |

### Additional Unit Test Cases (for future implementation)

| Test ID | Description | Priority |
|---------|-------------|----------|
| VSN-009 | Verify codec property is set after load | Medium |
| VSN-010 | Test playback direction affects preload | Medium |
| VSN-011 | Test cache eviction policy | Low |
| MFE-014 | Test B-frame handling (decode vs presentation order) | High |
| MFE-015 | Test FPS detection for common rates (23.976, 24, 29.97, 30) | Medium |

## Implementation Files

### Core Implementation
- `/Users/lifeart/Repos/openrv-web/src/nodes/sources/VideoSourceNode.ts` - Main video source node
- `/Users/lifeart/Repos/openrv-web/src/utils/MediabunnyFrameExtractor.ts` - WebCodecs frame extraction
- `/Users/lifeart/Repos/openrv-web/src/utils/FramePreloadManager.ts` - Frame caching and preloading
- `/Users/lifeart/Repos/openrv-web/src/audio/AudioPlaybackManager.ts` - Audio playback control
- `/Users/lifeart/Repos/openrv-web/src/utils/CodecUtils.ts` - Codec detection and error generation

### Unit Tests
- `/Users/lifeart/Repos/openrv-web/src/nodes/sources/VideoSourceNode.test.ts`
- `/Users/lifeart/Repos/openrv-web/src/utils/MediabunnyFrameExtractor.test.ts`
- `/Users/lifeart/Repos/openrv-web/src/utils/CodecUtils.test.ts`

### E2E Tests
- `/Users/lifeart/Repos/openrv-web/e2e/video-frame-extraction.spec.ts`
- `/Users/lifeart/Repos/openrv-web/e2e/audio-playback.spec.ts`
- `/Users/lifeart/Repos/openrv-web/e2e/unsupported-codec.spec.ts`
