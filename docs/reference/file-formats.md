# Supported File Formats

This page lists all file formats supported by OpenRV Web.

## Image Formats

| Format | Extensions | Decoder | HDR | Notes |
|--------|-----------|---------|-----|-------|
| PNG | `.png` | Browser native | No | Lossless, supports transparency |
| JPEG | `.jpg`, `.jpeg` | Browser native | No | Lossy compression |
| WebP | `.webp` | Browser native | No | Modern format |
| GIF | `.gif` | Browser native | No | Animated GIF support |
| BMP | `.bmp` | Browser native | No | Uncompressed bitmap |
| AVIF | `.avif` | Browser native | No | AV1-based still image |
| HEIC/HEIF | `.heic`, `.heif` | libheif WASM | No | Apple image format |
| EXR | `.exr`, `.sxr` | WASM decoder | Yes | Float32 HDR, multi-layer, AOV, multi-view stereo |
| DPX | `.dpx` | Custom decoder | Yes | Log-to-linear conversion |
| Cineon | `.cin` | Custom decoder | Yes | Configurable film gamma |
| Radiance HDR | `.hdr`, `.pic` | Custom decoder | Yes | RGBE encoding |
| Float TIFF | `.tiff`, `.tif` | Custom decoder | Yes | 32-bit floating-point |
| JPEG XL | `.jxl` | WASM (libjxl) + browser native HDR | Yes | Modern HDR format |
| JPEG 2000 | `.jp2`, `.j2k`, `.j2c` | openjph WASM | No | Wavelet compression |
| HTJ2K | `.jph`, `.jhc` | openjph WASM | No | High-throughput JPEG 2000 |
| JPEG Gainmap | `.jpg` | MPF parser | Yes | SDR base + gainmap for HDR |
| HEIC Gainmap | `.heic` | ISOBMFF parser | Yes | Apple and ISO 21496-1 gainmap |
| AVIF Gainmap | `.avif` | ISO 21496-1 parser | Yes | Auxiliary gain map items |
| RAW Preview | Various | Preview extractor | No | Embedded JPEG preview from camera RAW |

### EXR Details

EXR decoding supports:

- **Compression**: PIZ (wavelet), DWA (DCT), ZIP, ZIPS, RLE, uncompressed
- **Multi-layer**: Named layers with AOV selection and channel remapping
- **Multi-view**: Separate left/right eye views for stereo workflows
- **Data/Display windows**: Separate data and display window regions
- **Float32 precision**: Full HDR dynamic range

### Gainmap HDR

JPEG, HEIC, and AVIF gainmap formats reconstruct HDR images from an SDR base image and a gain map. The reconstruction applies:

- XMP headroom extraction (for JPEG)
- sRGB-to-linear conversion
- Gain formula application
- ISO 21496-1 standard support (for HEIC and AVIF)

## Video Formats

| Format | Extensions | Decoder | Notes |
|--------|-----------|---------|-------|
| MP4 | `.mp4`, `.m4v` | WebCodecs (mediabunny) | H.264, H.265, AV1 |
| 3GP | `.3gp`, `.3g2` | WebCodecs (mediabunny) | Mobile video |
| MOV | `.mov` | WebCodecs (mediabunny) | QuickTime container |
| MKV | `.mkv` | WebCodecs (mediabunny) | Matroska container |
| WebM | `.webm` | WebCodecs (mediabunny) | VP8, VP9, AV1 |
| OGG | `.ogg`, `.ogv`, `.ogx` | WebCodecs (mediabunny) | Theora, VP8 |
| AVI | `.avi` | Browser fallback | Legacy container |
| MXF | `.mxf` | MXF Demuxer | Container parsing; identifies codec, resolution, FPS |

### HDR Video

HDR video files with HLG or PQ transfer functions are supported through VideoFrame texturing. The renderer applies the appropriate EOTF (Electro-Optical Transfer Function) in the fragment shader.

### ProRes and DNxHD

ProRes and DNxHD codecs are detected during MXF and MOV parsing. Since browsers lack native ProRes/DNxHD decoding, OpenRV Web provides FFmpeg transcoding guidance when these codecs are encountered.

## Sequence Formats

| Pattern | Example | Description |
|---------|---------|-------------|
| Printf | `frame.%04d.exr` | C-style format notation |
| Hash | `frame.####.exr` | Each `#` = one digit |
| At-sign | `frame.@@@@.exr` | Each `@` = one digit |
| Numeric | `frame_001.png` | Auto-detected numbering |

## Procedural Test Patterns

OpenRV Web can generate procedural test patterns without loading any file. These patterns are useful for display calibration, pipeline testing, and scope verification.

| Pattern | Description |
|---------|-------------|
| SMPTE Bars | Standard SMPTE color bars |
| EBU Bars | EBU color bar pattern |
| Color Chart | Color reference chart |
| Checkerboard | Configurable cell-size checkerboard |
| Gradient | Horizontal or vertical gradient ramp |
| Grey Ramp | Stepped grey ramp with configurable step count |
| Solid | Solid color fill (configurable RGBA) |
| Resolution Chart | Resolution test chart |

Patterns are accessible via the API using `openrv.media.loadProceduralSource('smpte_bars')` or the OpenRV-compatible `.movieproc` URL format (e.g., `checkerboard,cellSize=32.movieproc`). Desktop OpenRV aliases (`smpte.movieproc`, `checker.movieproc`, `ramp.movieproc`) are also supported.

---

## Session and Timeline Formats

| Format | Extensions | Direction | Notes |
|--------|-----------|-----------|-------|
| OpenRV Web Project | `.orvproject` | Read/Write | Full session state as JSON |
| RV Session | `.rv` | Read | OpenRV GTO session files |
| GTO | `.gto` | Read | Graph Topology Object files |
| RV EDL | `.rvedl` | Read | OpenRV edit decision list |
| OTIO | `.otio` | Read | OpenTimelineIO editorial timelines |
| CMX 3600 EDL | `.edl` | Write | Standard edit decision list |

## LUT Formats

| Format | Extension | Type | Notes |
|--------|-----------|------|-------|
| Cube | `.cube` | 1D and 3D | Industry standard |
| CSP | `.csp` | 1D and 3D | Cinespace format |
| 3DL | `.3dl` | 1D and 3D | Autodesk/Lustre format |
| ITX | `.itx` | 3D | IRIDAS SpeedGrade format |
| Look | `.look` | 3D | XML-based IRIDAS format |
| Houdini LUT | `.lut` | 1D and 3D | Houdini channel and 3D types |
| Nuke Vectorfield | `.nk` | 3D | Nuke exported vectorfield |
| Pandora MGA | `.mga` | 3D | Pandora color corrector format |
| RV 3D LUT | (native) | 3D | OpenRV native 3D format |
| RV Channel LUT | (native) | 1D | OpenRV native 1D format |

LUTs are loaded as float32 data and applied via hardware trilinear interpolation (for 3D LUTs) in the GPU fragment shader. A higher-accuracy tetrahedral interpolation path is available for CPU-side processing (`TetrahedralInterp.ts`).

## CDL Formats

| Format | Extension | Direction | Notes |
|--------|-----------|-----------|-------|
| ASC CDL | `.cdl` | Read/Write | Single color decision in XML format |
| CC | `.cc` | Read | Single ColorCorrection element |
| CCC | `.ccc` | Read | ColorCorrectionCollection with multiple entries |

## OCIO Configuration

| Format | Extension | Direction | Notes |
|--------|-----------|-----------|-------|
| OpenColorIO Config | `.ocio` | Read | Color management pipeline configuration |

---

## Related Pages

- [Image Sequences](../playback/image-sequences.md) -- loading and playing sequences
- [EXR Multi-Layer](../playback/exr-layers.md) -- AOV workflow
- [Browser Requirements](../getting-started/browser-requirements.md) -- required APIs for format support
