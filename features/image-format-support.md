# Image Format Support

## Original OpenRV Implementation
OpenRV supports a wide range of image formats commonly used in VFX and animation:

**High Dynamic Range Formats**:
- **OpenEXR (.exr, .sxr)**: 16/32-bit floating point with compression options (B44, B44A, DWAA, DWAB), multi-channel support, multi-view stereo, data/display window handling
- **TIFF**: 32-bit float support, multiple channels, tiled and scanline modes

**Digital Cinema/Film Formats**:
- **DPX**: 8, 10, 12, 16-bit with linear/log transfer functions, chromaticity values
- **Cineon**: 10-bit log format with Cineon/DPX reader options

**Standard Formats**:
- **JPEG**: YUV or RGB, 8-bit per channel
- **PNG**: 8/16-bit with alpha support
- **TARGA (TGA)**: Various bit depths
- **IFF (ILBM)**: Including 32-bit float variant
- **BMP, PSD, and others**

**RAW Camera Formats**:
- Sony, Canon, Nikon, Olympus, Pentax, Fuji, and others via LibRAW plugin

**Sequence Detection**:
- Automatic detection of image sequences from directories
- Support for various padding notations (####, %04d, @@@)
- Negative frame number support
- Frame range specifications (1-100, 1-100x10)

## Status
- [ ] Not implemented
- [x] Partially implemented
- [ ] Fully implemented

## Implementation Summary

### What's Implemented

**Standard Web Formats (via browser HTMLImageElement)**:
- **PNG**: Full support including alpha channel
- **JPEG/JPG**: Full support
- **WebP**: Full support
- **GIF**: Full support (static frames)
- **BMP**: Full support
- **TIFF/TIF**: Partial support (browser-dependent, basic 8-bit only)

**Image Sequence Support**:
- Automatic frame number extraction from filenames (underscore, dash, dot separators)
- Multiple naming patterns supported: `frame_0001.png`, `frame-001.png`, `frame.001.png`, `frame001.png`
- Sequential frame loading with preloading/caching
- Missing frame detection in sequences
- Memory management for distant frames

**Data Types**:
- uint8 (8-bit per channel) - primary support
- uint16 (16-bit per channel) - internal IPImage support
- float32 (32-bit floating point) - internal IPImage support

**Metadata Support**:
- Color space tagging (sRGB default)
- Frame number tracking
- Source path preservation
- Width/height properties

### What's Missing

**High Dynamic Range Formats**:
- **OpenEXR (.exr, .sxr)**: NOT IMPLEMENTED - Listed in IMAGE_EXTENSIONS but no actual decoder
  - No multi-channel support
  - No multi-view stereo support
  - No compression handling (B44, DWAA, etc.)
  - No data/display window handling
- **HDR/RGBE**: NOT IMPLEMENTED
- **TIFF 32-bit float**: NOT IMPLEMENTED (browser only supports 8-bit TIFF)

**Digital Cinema/Film Formats**:
- **DPX**: NOT IMPLEMENTED - No decoder present
  - No 10/12/16-bit support
  - No log-to-linear conversion
  - No chromaticity values
- **Cineon**: NOT IMPLEMENTED - No decoder present

**RAW Camera Formats**:
- NOT IMPLEMENTED - No LibRAW integration

**Advanced Sequence Features**:
- No `####` or `%04d` pattern notation support (only regex-based detection)
- No negative frame number support
- No frame range specifications (1-100, 1-100x10)

**Other Missing Features**:
- Progressive loading for large images
- Multi-layer/multi-channel extraction (PSD layers, EXR channels)
- Color space metadata extraction from files
- Aspect ratio metadata extraction

## Requirements
- [x] JPEG, PNG, standard web formats - **IMPLEMENTED**
- [x] Automatic sequence detection (basic) - **IMPLEMENTED**
- [x] Metadata reading (basic: dimensions, frame number) - **IMPLEMENTED**
- [ ] EXR support (including multi-channel, multi-view) - **NOT IMPLEMENTED**
- [ ] DPX/Cineon support with log handling - **NOT IMPLEMENTED**
- [ ] TIFF support (including float) - **PARTIAL** (8-bit only via browser)
- [ ] Multiple padding notation support (####, %04d) - **NOT IMPLEMENTED**
- [ ] Frame range specifications - **NOT IMPLEMENTED**
- [ ] Metadata reading (color space, aspect ratio from file) - **NOT IMPLEMENTED**
- [ ] Progressive loading for large images - **NOT IMPLEMENTED**

## UI/UX Specification

### Current Implementation
- File loading via drag-and-drop or file picker (HeaderBar Open button)
- Supported formats filtered in SequenceLoader based on extension
- Single file and multiple file loading supported
- A/B comparison when loading multiple files

### For Future EXR/DPX Support
- **Channel Selection UI**: Add dropdown to select which EXR layer/channel to view
- **Log/Linear Toggle**: Add button in View tab for DPX log-to-linear conversion
- **Metadata Panel**: Show detected color space, bit depth, compression info in InfoPanel
- **Progress Indicator**: Show loading progress for large HDR files

## Technical Notes

### Current Architecture

**FileSourceNode** (`src/nodes/sources/FileSourceNode.ts`):
- Loads single images via HTMLImageElement
- Creates IPImage from canvas with 8-bit RGBA data
- Caches loaded IPImage for performance
- Stores URL, width, height, originalUrl properties

**SequenceLoader** (`src/utils/SequenceLoader.ts`):
- Filters files by extension: `['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'exr']`
- Note: EXR is listed but browser cannot decode it natively
- Frame number extraction via regex patterns
- Pattern detection for sequence naming
- Preloading with configurable window size
- Memory release for distant frames

**IPImage** (`src/core/image/Image.ts`):
- Internal image representation
- Supports uint8, uint16, float32 data types
- Metadata storage for colorSpace, frameNumber, sourcePath
- WebGL texture management

### To Implement EXR Support
1. Add WebAssembly-based OpenEXR decoder (e.g., openexr-wasm)
2. Create EXRSourceNode extending BaseSourceNode
3. Parse EXR headers for metadata (channels, compression, data window)
4. Decode to float32 IPImage data
5. Handle multi-channel selection
6. Add tone mapping for display

### To Implement DPX Support
1. Add DPX file parser (pure JavaScript or WASM)
2. Handle 10/12/16-bit packed data formats
3. Implement log-to-linear conversion curves
4. Create DPXSourceNode with log handling options

## E2E Test Cases

### Existing E2E Tests
Tests located in `/Users/lifeart/Repos/openrv-web/e2e/`:

| Test File | Test ID | Description |
|-----------|---------|-------------|
| `media-loading.spec.ts` | MEDIA-001 | Load video file and update session state |
| `media-loading.spec.ts` | MEDIA-002 | Update frameCount and enable navigation |
| `media-loading.spec.ts` | MEDIA-003 | Enable playback controls after video load |
| `media-loading.spec.ts` | MEDIA-004 | Show video dimensions in canvas |
| `media-loading.spec.ts` | MEDIA-005 | Initialize in/out points to full range |
| `media-loading.spec.ts` | MEDIA-010 | Load .rv session file and update state |
| `media-loading.spec.ts` | MEDIA-030 | File input accessible via button |
| `media-loading.spec.ts` | MEDIA-040 | Handle operations without media gracefully |
| `media-loading.spec.ts` | MEDIA-050 | Support loading additional media |
| `multi-file.spec.ts` | MF-001 | Load single video file shows content |
| `multi-file.spec.ts` | MF-002 | Load single image file shows content |
| `multi-file.spec.ts` | MF-003 | Load video then image A/B compare |
| `multi-file.spec.ts` | MF-010 | A/B indicator appears after loading two files |

### Required E2E Tests for Full Implementation

| Test ID | Description | Priority |
|---------|-------------|----------|
| IMG-001 | Load PNG image and verify display | P1 - Covered |
| IMG-002 | Load JPEG image and verify display | P1 - Covered |
| IMG-003 | Load WebP image with alpha | P2 |
| IMG-004 | Load image sequence (multiple PNG files) | P1 |
| IMG-005 | Navigate through image sequence frames | P1 |
| IMG-006 | Verify sequence missing frame detection | P2 |
| IMG-007 | Load EXR file and verify HDR data | P1 - Blocked |
| IMG-008 | Select EXR channel from multi-channel file | P2 - Blocked |
| IMG-009 | Load DPX file with log data | P1 - Blocked |
| IMG-010 | Toggle log-to-linear conversion for DPX | P2 - Blocked |
| IMG-011 | Verify metadata display for loaded image | P2 |
| IMG-012 | Load large image with progress indicator | P3 |

## Unit Test Cases

### Existing Unit Tests
Tests located in `/Users/lifeart/Repos/openrv-web/src/`:

**FileSourceNode.test.ts** (`src/nodes/sources/FileSourceNode.test.ts`):
| Test ID | Description |
|---------|-------------|
| FSN-001 | Loads image from URL |
| FSN-002 | Loads from File object |
| FSN-005 | Revokes blob URL on dispose |
| FSN-006 | Populates metadata after load |

**SequenceLoader.test.ts** (`src/utils/SequenceLoader.test.ts`):
| Test ID | Description |
|---------|-------------|
| SLD-001 | Filters to supported image formats |
| SLD-002 | Supports all standard image extensions |
| SLD-003 | Handles empty input |
| SLD-004 | Case-insensitive extension matching |
| SLD-005 | Extracts frame number from standard naming |
| SLD-006 | Extracts from dash separator |
| SLD-007 | Extracts from dot separator |
| SLD-008 | Extracts from no separator |
| SLD-009 | Returns null for no frame number |
| SLD-010 | Handles large frame numbers |
| SLD-011 | Detects underscore padding pattern |
| SLD-016 | Sorts files by frame number |
| SLD-017 | Assigns sequential indices |
| SLD-020 | Returns cached image if already loaded |
| SLD-022 | Releases frames outside keep window |
| SLD-025 | Disposes all frames |
| MF-001 | Detects missing frames in sequence |
| MF-003 | Returns empty array for complete sequence |

**Image.test.ts** (`src/core/image/Image.test.ts`):
| Test ID | Description |
|---------|-------------|
| - | Creates image with specified dimensions |
| - | Creates image with provided data |
| - | Stores metadata (colorSpace, frameNumber, sourcePath) |
| - | Returns Uint8Array for uint8 data |
| - | Returns Float32Array for float32 data |
| - | Creates IPImage from ImageData |

### Required Unit Tests for Full Implementation

| Test ID | Description | Priority |
|---------|-------------|----------|
| EXR-001 | Parse EXR header and extract metadata | P1 - Blocked |
| EXR-002 | Decode EXR half-float data to float32 | P1 - Blocked |
| EXR-003 | Handle multi-channel EXR (RGBA, deep) | P2 - Blocked |
| EXR-004 | Handle EXR compression (B44, DWAA) | P2 - Blocked |
| DPX-001 | Parse DPX header | P1 - Blocked |
| DPX-002 | Decode 10-bit packed DPX data | P1 - Blocked |
| DPX-003 | Apply log-to-linear conversion | P2 - Blocked |
| SEQ-001 | Parse #### padding notation | P2 |
| SEQ-002 | Parse %04d printf notation | P2 |
| SEQ-003 | Handle negative frame numbers | P3 |
| SEQ-004 | Parse frame range specifications | P3 |
