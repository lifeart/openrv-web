# File Formats

> *Portions of this guide are adapted from [OpenRV documentation, Chapter 15](https://github.com/AcademySoftwareFoundation/OpenRV), (c) Contributors to the OpenRV Project, Apache 2.0. Content has been rewritten for the WebGL2/browser context of OpenRV Web.*

---

## Overview

OpenRV Web supports a wide range of image, video, and session file formats, spanning professional VFX interchange formats, HDR photography formats, web-native media, and editorial interchange. All image decoding produces **Float32Array** pixel data in RGBA layout, ensuring consistent precision throughout the rendering pipeline regardless of the source format's native bit depth.

Format detection uses a **magic-number-first** strategy: the `DecoderRegistry` inspects the first bytes of each file to identify the format by its binary signature, then dispatches to the appropriate decoder. This is more reliable than extension-based detection and handles misnamed or extensionless files correctly.

Decoders are **lazy-loaded** via dynamic `import()` on first use. Heavy WASM modules (EXR, JXL, JP2, HEIC) are code-split into separate chunks and never included in the initial bundle, keeping startup fast.

---

## Professional VFX Formats

These formats are the backbone of visual effects pipelines. OpenRV Web provides full decode support via dedicated JavaScript and WebAssembly decoders.

### OpenEXR (.exr, .sxr)

OpenEXR is the industry-standard HDR image format for VFX, developed by Industrial Light & Magic and maintained by the Academy Software Foundation. OpenRV Web provides comprehensive EXR support:

- **Decoder**: Pure TypeScript EXR parser (`EXRDecoder.ts`)
- **Precision**: Full Float32 per channel -- no 8-bit bottleneck
- **Compression**: PIZ (lossless, wavelet-based) and DWA (lossy, DCT-based) via dedicated codec modules (`EXRPIZCodec.ts`, `EXRDWACodec.ts`)
- **Multi-layer AOV selection**: EXR files containing multiple render passes (beauty, diffuse, specular, depth, normals, etc.) can be viewed layer by layer. The decoder exposes layer information and supports channel remapping (`EXRChannelRemapping`)
- **Data/display window**: OpenEXR's data window (actual pixel extent) and display window (intended viewing area) are respected, with correct offset and cropping applied
- **Multi-view EXR**: Stereo and multi-view EXR files are parsed by `MultiViewEXR.ts`, which extracts view names, maps channels to views, and enables per-view decoding. View names follow the OpenEXR convention (e.g., `left`, `right`)

**Magic number**: `0x01312f76` (little-endian 32-bit integer at offset 0)

**Color space**: Linear (scene-referred). The renderer applies display transforms after decode.

**Typical VFX usage**: EXR is the primary interchange format for rendered images in VFX. Compositing packages (Nuke, Fusion), renderers (Arnold, RenderMan, V-Ray), and lighting tools all produce EXR output. OpenRV Web's full Float32 decode ensures no precision loss when reviewing EXR renders -- unlike 8-bit viewers that quantize HDR values, all scene-referred data is preserved through the display pipeline.

### DPX (.dpx)

Digital Picture Exchange (SMPTE 268M) is the standard format for digital film scanning and recording. OpenRV Web supports:

- **Decoder**: Pure JavaScript (`DPXDecoder.ts`)
- **Bit depth**: 10-bit log encoding via `unpackDPX10bit()`, which extracts three 10-bit values from each 32-bit word using method A packing
- **Endianness**: Both big-endian (`SDPX`) and little-endian (`XPDS`) variants
- **Transfer function detection**: The `DPXTransferFunction` enum identifies the file's transfer characteristic from the header (printing density, linear, logarithmic, unspecified, etc.)
- **Log-to-linear conversion**: Optional log-to-linear conversion via `LogLinear.ts` using configurable Cineon-style parameters (reference white, reference black, film gamma)
- **Metadata**: Full DPX header parsing including image orientation, pixel aspect ratio, film and television headers

**Magic numbers**: `0x53445058` ("SDPX", big-endian) or `0x58504453` ("XPDS", little-endian)

**Color space**: Logarithmic (printing density) by default. The rendering pipeline can apply log-to-linear conversion via the EOTF stage or leave the data in log space for downstream processing.

**Typical VFX usage**: DPX is the standard format for film scanning (digitizing physical film negatives) and film recording (writing digital images back to film). It is also widely used for digital intermediate (DI) workflows and broadcast mastering. The 10-bit log encoding preserves the full tonal range of film negative density, and the logarithmic transfer curve allocates more code values to shadow detail where the human visual system is most sensitive.

### Cineon (.cin, .cineon)

Kodak's original digital film scanning format, the predecessor to DPX. OpenRV Web supports:

- **Decoder**: Pure JavaScript (`CineonDecoder.ts`)
- **Encoding**: 10-bit logarithmic density encoding
- **Log-to-linear**: The `cineonLogToLinear()` function in `LogLinear.ts` applies the Cineon log-to-linear transfer curve with configurable film gamma (default 0.6), reference white (685), and reference black (95)
- **Metadata**: Full Cineon header parsing including film stock, frame position, and orientation fields

**Magic number**: `0x802a5fd7` (big-endian 32-bit integer at offset 0)

**Color space**: Logarithmic (Cineon density). Log-to-linear conversion is applied by default during decode.

### Radiance HDR (.hdr, .rgbe)

The Radiance High Dynamic Range format, also known as RGBE (Red-Green-Blue-Exponent), stores HDR images using a shared exponent encoding scheme:

- **Decoder**: Pure JavaScript (`HDRDecoder.ts`)
- **Encoding**: Each pixel is stored as four bytes: R, G, B mantissa values plus a shared exponent byte. The actual floating-point value is reconstructed as `mantissa * 2^(exponent - 128)`
- **Compression**: Adaptive run-length encoding (RLE) for efficient storage
- **Headers**: Standard Radiance headers are parsed for image dimensions, exposure, and orientation

**Magic signature**: File begins with `#?RADIANCE` or `#?RGBE`

**Color space**: Linear (scene-referred). The RGBE encoding preserves relative HDR values.

**Typical usage**: Radiance HDR is commonly used for environment maps (HDRI lighting), light probe captures, and architectural visualization. While it has lower precision than OpenEXR (8-bit mantissa per channel vs. 16-bit half-float), its compact file size and universal tool support make it a practical choice for environment lighting data.

### Float TIFF (.tif, .tiff)

TIFF files with 32-bit floating-point sample format, commonly used for HDR compositing interchange:

- **Decoder**: Pure JavaScript (`TIFFFloatDecoder.ts`)
- **Detection**: The decoder specifically identifies TIFF files where SampleFormat=3 (IEEE floating-point) and BitsPerSample=32. Standard 8/16-bit TIFFs are handled by the browser's native `<img>` decoder instead
- **Endianness**: Both Intel (II, little-endian) and Motorola (MM, big-endian) byte orders
- **Channels**: Supports 1-channel (grayscale), 3-channel (RGB), and 4-channel (RGBA) float TIFF images

**Magic signatures**: `0x4949` ("II") or `0x4D4D` ("MM") at offset 0, followed by magic 42 at offset 2

**Color space**: Varies (typically linear or scene-referred). The file's color space tag, if present, is reported in metadata.

**Typical usage**: Float TIFF is used in compositing pipelines as a universal floating-point interchange format. Many tools that cannot write EXR can write float TIFF, making it a useful bridge format. It is also common in scientific imaging, medical imaging, and geospatial applications where floating-point precision is required.

---

## Web-Native and HDR Photography Formats

These formats leverage browser capabilities and modern HDR photography standards. Several are unique to OpenRV Web and have no equivalent in desktop OpenRV.

### JPEG XL (.jxl)

JPEG XL is a next-generation image format designed for both lossy and lossless compression with native HDR support:

- **Decoder**: WebAssembly-compiled `libjxl` library (`JXLDecoder.ts`)
- **HDR support**: JPEG XL natively encodes images with more than 8 bits per channel and supports PQ and HLG transfer functions
- **Browser path**: When the browser natively supports JPEG XL (currently Firefox), the decoder can use the browser's built-in path for faster decode
- **Detection**: Bare codestream magic (`0xFF 0x0A`) or ISOBMFF container with `jxl ` brand in `ftyp` box

**Color space**: Varies (sRGB, linear, Display P3, Rec.2020, etc.). Decoded to Float32 with metadata indicating the original color space.

**Industry context**: JPEG XL is positioned as the successor to JPEG, offering superior compression ratios at equivalent quality, progressive decoding, and HDR support. It is gaining adoption in photography workflows and web content delivery. Its HDR encoding capability makes it particularly relevant for VFX review, as it can store scene-referred HDR images in a format that is more compact than EXR while maintaining high fidelity.

### JPEG Gainmap HDR (.jpg, .jpeg)

Google's Ultra HDR / Adobe Gainmap HDR format embeds an HDR gain map within a standard JPEG file using the Multi-Picture Format (MPF) extension:

- **Decoder**: Pure JavaScript (`JPEGGainmapDecoder.ts`)
- **Structure**: The file contains a standard SDR JPEG as the primary image, plus a secondary JPEG gain map image referenced via an APP2 MPF marker. XMP metadata describes the headroom and gain parameters
- **HDR reconstruction**: The decoder applies the ISO 21496-1 exponential gain map formula: `HDR_linear = sRGB_to_linear(base) * exp2(gainmap * headroom)`, where `sRGB_to_linear(base)` is the sRGB-to-linear converted base image, `gainmap` is the decoded gain map, and `headroom` is extracted from XMP metadata
- **Orientation**: EXIF orientation is extracted and applied via `extractJPEGOrientation()`
- **Detection**: JPEG SOI marker (`0xFFD8`) followed by an APP2 segment containing `MPF\0` identifier

**Color space**: Linear (after sRGB-to-linear conversion and gain application).

### HEIC Gainmap HDR (.heic, .heif)

Apple's HDR photo format and the ISO 21496-1 gain map standard for HEIC containers:

- **Decoder**: JavaScript ISOBMFF parser with WASM HEIC decode fallback (`HEICGainmapDecoder.ts`, `HEICWasmDecoder.ts`)
- **Structure**: ISOBMFF container with `heic`/`heix` brand in `ftyp` box. The gain map is stored as an auxiliary item with URN `urn:com:apple:photo:2020:aux:hdrgainmap` (Apple) or `urn:com:photo:aux:hdrgainmap` (ISO 21496-1)
- **Detection**: The decoder scans the ISOBMFF box hierarchy: `ftyp` (HEIC brands) -> `meta` -> `iprp` -> `ipco` -> `auxC` box containing the gainmap URN
- **Safari optimization**: On Safari, the browser's native HEIC decoder is used for the base image, avoiding the WASM overhead
- **Color information**: `parseHEICColorInfo()` extracts ICC profile and `nclx` color space descriptors from the ISOBMFF container

**Color space**: Linear (after gain map reconstruction).

### AVIF Gainmap HDR (.avif)

The AVIF equivalent of HEIC gainmap, using the same ISO 21496-1 gain map standard:

- **Decoder**: JavaScript ISOBMFF parser (`AVIFGainmapDecoder.ts`)
- **Structure**: Identical to HEIC gainmap but in an AVIF container (`avif`/`avis` brands). The auxiliary gain map item uses the same URN scheme
- **Detection**: Distinguishes AVIF from HEIC by checking `ftyp` brands. AVIF brands (`avif`, `avis`) are matched; HEIC brands are excluded to prevent misidentification
- **Orientation**: ISOBMFF transforms (`irot`, `imir`) are parsed for correct image orientation

**Color space**: Linear (after gain map reconstruction).

### Plain AVIF (.avif)

Standard AVIF images without gain maps:

- **Decoder**: Browser-native decode via `createImageBitmap()` with WASM fallback (`avif.ts`)
- **Detection**: `ftyp` box with AVIF brands, without gain map auxiliary items
- **Ordering**: Placed after the AVIF gainmap decoder in the registry chain so gainmap AVIFs are matched first

**Color space**: sRGB.

### JPEG 2000 / HTJ2K (.jp2, .j2k, .j2c)

JPEG 2000 and its high-throughput variant HTJ2K, used in digital cinema (DCI) packaging:

- **Decoder**: WebAssembly-compiled openjph library (`JP2Decoder.ts`)
- **Detection**: Raw J2K codestream SOC marker (`0xFF4F`) or JP2 box format signature (`0x0000000C 6A502020 0D0A870A`)
- **Bit depth**: Supports various bit depths (8, 10, 12, 16-bit) with signed and unsigned samples
- **Color space**: `colr` box parsing for ICC profiles and enumerated color spaces

### RAW Preview (.cr2, .nef, .arw, .dng, .orf, etc.)

Camera RAW files are detected by their TIFF-based container structure, and the largest embedded JPEG preview is extracted:

- **Decoder**: Pure JavaScript TIFF/IFD parser (`RAWPreviewDecoder.ts`)
- **Approach**: Rather than decoding raw sensor data (which requires camera-specific demosaicing and color science), the decoder extracts the embedded JPEG preview image that every RAW file contains. This provides instant viewing without heavy processing
- **EXIF metadata**: Camera make, model, ISO, and orientation are extracted
- **Detection**: TIFF container header (II or MM + magic 42) that is NOT a 32-bit float TIFF (float TIFFs are handled by the Float TIFF decoder earlier in the chain)

**Color space**: sRGB (embedded preview).

**Supported camera manufacturers**: Canon (CR2), Nikon (NEF), Sony (ARW), Adobe (DNG), Olympus/OM System (ORF), Pentax (PEF), Samsung (SRW), and other TIFF-based RAW formats. Non-TIFF RAW containers (Canon CR3, Fujifilm RAF, Panasonic RW2) are not currently supported. The `isRAWExtension()` function in `RAWPreviewDecoder.ts` maintains the full list of recognized extensions.

### Browser-Native Formats

The following formats are decoded by the browser's built-in image decoder via `<img>` element or `createImageBitmap()`:

| Format | Extensions | Notes |
|--------|-----------|-------|
| PNG | .png | Lossless, 8/16-bit, alpha channel |
| JPEG | .jpg, .jpeg | Lossy, 8-bit, most common web format |
| WebP | .webp | Lossy and lossless, alpha, animation |
| GIF | .gif | 256-color palette, animation |
| BMP | .bmp | Uncompressed bitmap |
| HEIC/HEIF | .heic, .heif | Safari native; other browsers via WASM |
| SVG | .svg | Vector graphics (rasterized by browser) |
| ICO | .ico | Icon format |

These formats are handled at the `Session.loadImage()` level using the browser's `<img>` element, bypassing the `DecoderRegistry` entirely.

---

## Video Containers and Codecs

OpenRV Web uses the **mediabunny** library and the WebCodecs API for frame-accurate video decode. This provides professional-grade frame extraction without server-side transcoding.

### Supported Containers

| Container | Extensions | Notes |
|-----------|-----------|-------|
| MP4 / ISOBMFF | .mp4, .m4v, .3gp, .3g2 | Most common delivery format |
| QuickTime | .mov | Apple's container; widely used in VFX |
| Matroska | .mkv | Open container, versatile codec support |
| WebM | .webm | Web-optimized Matroska subset |
| OGG | .ogg, .ogv | Open-source container |
| AVI | .avi | Legacy; browser fallback via `<video>` |

### Codec Support via WebCodecs

The mediabunny frame extractor (`MediabunnyFrameExtractor`) uses WebCodecs for hardware-accelerated decode. Supported codecs depend on the browser and platform:

| Codec | Chrome | Firefox | Safari | Notes |
|-------|--------|---------|--------|-------|
| H.264 / AVC | Yes | Yes | Yes | Universal support |
| H.265 / HEVC | Yes (hardware) | No | Yes | Platform-dependent |
| VP8 | Yes | Yes | Limited | Legacy WebM codec |
| VP9 | Yes | Yes | Yes | Common in WebM/MKV |
| AV1 | Yes | Yes | Yes (M1+) | Next-gen open codec |

### HDR Video

OpenRV Web supports HDR video through the `VideoFrame` API:

- **Transfer functions**: HLG (Hybrid Log-Gamma, ARIB STD-B67) and PQ (Perceptual Quantizer, SMPTE ST 2084) are detected from video track metadata and propagated via the `transferFunction` field on `IPImage`
- **Color primaries**: BT.2020 wide-gamut primaries are detected and passed to the renderer as `colorPrimaries: 'bt2020'`
- **VideoFrame texturing**: When `DisplayCapabilities.videoFrameTexImage` is supported, the `VideoFrame` is uploaded directly to a WebGL2 texture without CPU-side pixel copying, preserving HDR precision
- **HDR resize**: The `HDRFrameResizer` uses an `OffscreenCanvas` with float16 backing store to resize HDR frames to display resolution while preserving wide-gamut and high-dynamic-range data

### ProRes, DNxHD, and Other Professional Codecs

Professional production codecs such as Apple ProRes, Avid DNxHD/DNxHR, and ARRI codecs are **not supported** by WebCodecs in any browser. When the mediabunny extractor encounters an unsupported codec, it:

1. Detects the codec family via `CodecUtils.ts`
2. Reports a descriptive `UnsupportedCodecError` with the codec's display name
3. Falls back to `HTMLVideoElement` playback (which also typically cannot decode these codecs)
4. Provides transcoding guidance to the user

**Recommended workflow**: Transcode professional codec sources to H.264 (SDR) or H.265/AV1 (HDR) before loading into OpenRV Web. FFmpeg command examples:

```bash
# ProRes to H.264 for SDR review
ffmpeg -i input.mov -c:v libx264 -crf 18 -pix_fmt yuv420p output.mp4

# ProRes to H.265 with HDR metadata preservation
ffmpeg -i input.mov -c:v libx265 -crf 18 -tag:v hvc1 \
  -x265-params "colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc" output.mp4

# DNxHD to AV1
ffmpeg -i input.mxf -c:v libaom-av1 -crf 30 -b:v 0 output.webm
```

### MXF Container (.mxf)

Material eXchange Format (SMPTE ST 377) is the professional broadcast and post-production container:

- **Demuxer**: JavaScript KLV parser (`MXFDemuxer.ts`)
- **Current capability**: Metadata-only parsing of the MXF header partition. The demuxer extracts operational pattern, essence descriptors (codec, resolution, edit rate, duration, color space), and partition structure
- **Pixel access**: Not currently available. WebCodecs does not support MXF containers directly; the essence must be extracted and re-wrapped before decode
- **Use case**: Inspecting MXF file metadata (codec, resolution, frame rate) without transcoding

**Magic signature**: SMPTE UL prefix `06 0E 2B 34 02 05 01 01` at offset 0

### Contrast with Desktop OpenRV Video Support

Desktop OpenRV uses FFmpeg as its video decode backend, providing broad native codec support including ProRes, DNxHD, and other professional codecs. OpenRV Web uses WebCodecs, which is hardware-accelerated but limited to codecs supported by the browser's media stack. The key trade-off is that WebCodecs provides lower-latency, GPU-accelerated decode for supported codecs, but requires transcoding for professional production codecs.

| Aspect | Desktop OpenRV (FFmpeg) | OpenRV Web (WebCodecs) |
|--------|------------------------|----------------------|
| Codec breadth | Very wide (all FFmpeg codecs) | Browser-dependent subset |
| ProRes / DNxHD | Native decode | Not supported |
| Hardware acceleration | Optional | Default (GPU decode) |
| HDR metadata | Manual extraction | Automatic via VideoFrame API |
| Frame accuracy | Seek + decode from keyframe | Seek + decode from keyframe |
| Memory model | CPU buffers | GPU-backed VideoFrame objects |

### Frame-Accurate Seeking

The mediabunny extractor provides frame-accurate seeking via the WebCodecs API:

- Frame numbers are **1-based** throughout OpenRV Web (frame 1 is the first frame)
- Seeking to an arbitrary frame involves decoding from the nearest preceding keyframe
- The `FramePreloadManager` intelligently caches frames around the current position with direction-aware preloading during playback
- An LRU cache manages memory budget (500 MB for HDR, configurable for SDR)

---

## Image Sequences

Image sequences are the standard delivery format for VFX renders. OpenRV Web supports loading and playing image sequences with frame-accurate navigation.

### Pattern Notation

Sequence file patterns can use three notation styles:

| Style | Example | Description |
|-------|---------|-------------|
| Printf | `frame.%04d.exr` | C-style format specifier with padding |
| Hash | `frame.####.exr` | Each `#` represents one digit of padding |
| At-sign | `frame.@@@.exr` | Each `@` represents one digit of padding |

### Sequence Detection

When multiple image files are loaded together, the `SequenceLoader` utility:

1. Sorts files by name to establish frame order
2. Detects the numeric pattern in filenames
3. Identifies the frame range (start frame, end frame)
4. Creates a `SequenceInfo` structure with the pattern, frame range, and FPS

### Missing Frame Detection

When a sequence has gaps in its frame numbering, the viewer:

- Detects missing frames during sequence scanning
- Displays a visual overlay indicating which frames are absent
- Holds the last available frame during playback when a gap is encountered

### Playback and Caching

The `SequenceSourceNode` manages frame loading with:

- **`FramePreloadManager`**: Intelligent preloading of frames around the current position
- **Direction-aware buffering**: During forward playback, more frames are preloaded ahead of the current position; during reverse playback, more frames are preloaded behind
- **Memory management**: Frames are loaded as `ImageBitmap` objects and evicted from cache when distant from the current position

---

## Session and Editorial Formats

### RV/GTO Session Files (.rv)

Desktop OpenRV saves sessions in the GTO (Graph Topology Object) binary format. OpenRV Web can **load and reconstruct** the complete node graph from these files:

- **Parser**: `GTOGraphLoader.ts` uses the `gto-js` library to parse the binary GTO format
- **Graph reconstruction**: RV node types are mapped to OpenRV Web node types (see [Session Compatibility](session-compatibility.md) for the full mapping table)
- **Property restoration**: GTO properties are mapped to the OpenRV Web `PropertyContainer` system
- **Supported state**: Source references, view configurations (sequence, stack, layout, switch), color corrections, playback position, markers, stereo settings, EDL data

### RV EDL (.rvedl)

The RV Edit Decision List format describes cut sequences with frame-accurate source references:

- **Parser**: `RVEDLParser.ts`
- **Structure**: Each entry specifies a source index, in-point, out-point, and global frame position
- **Usage**: Imported into `SequenceGroupNode` for timeline-based playback of multiple sources

### OpenTimelineIO (.otio)

OpenTimelineIO is the ASWF standard for editorial timeline interchange:

- **Import**: Editorial timelines with clips, gaps, and transitions can be imported
- **Mapping**: OTIO clips map to source nodes; OTIO tracks map to sequence groups
- **Interchange**: Provides a bridge between NLE systems (Avid, Premiere, Resolve) and OpenRV Web

### .orvproject (Native Session Format)

OpenRV Web's native session format is a JSON-based file containing the complete viewer state:

- **Serializer**: `SessionSerializer.ts` handles save/load with migration support
- **Schema version**: Currently version 2, with automatic migration from version 1
- **Content**: Media references, playback state, annotations, view transform, color adjustments, CDL values, filter settings, 2D transforms, crop, lens distortion, wipe state, layer stack, LUT reference, playlist, notes, version groups, statuses, and node graph topology
- **Blob URL handling**: Local file references use blob URLs which are session-specific. The serializer detects these, sets `requiresReload: true`, and prompts the user to re-select files when loading

### CMX3600 EDL Export

Sessions can be exported as CMX3600 EDL files for import into traditional editorial systems. The playlist manager generates frame-accurate edit lists compatible with Avid, Premiere, and DaVinci Resolve.

---

## Format Comparison: OpenRV vs OpenRV Web

The following table compares format support between desktop OpenRV and OpenRV Web:

### Image Formats

| Format | Extension | OpenRV Desktop | OpenRV Web | Decoder Type | HDR |
|--------|----------|---------------|------------|--------------|-----|
| OpenEXR | .exr, .sxr | Yes | Yes | WASM | Yes |
| DPX | .dpx | Yes | Yes | JavaScript | No (log) |
| Cineon | .cin | Yes | Yes | JavaScript | No (log) |
| Radiance HDR | .hdr | Yes | Yes | JavaScript | Yes |
| Float TIFF | .tif | Yes | Yes | JavaScript | Yes |
| JPEG XL | .jxl | No | Yes | WASM | Yes |
| JPEG Gainmap | .jpg | No | Yes | JavaScript | Yes |
| HEIC Gainmap | .heic | No | Yes | JS + WASM | Yes |
| AVIF Gainmap | .avif | No | Yes | JavaScript | Yes |
| AVIF | .avif | No | Yes | Native/WASM | No |
| JPEG 2000 | .jp2, .j2k | No | Yes | WASM | No |
| RAW Preview | .cr2, .nef, etc. | No | Yes | JavaScript | No |
| SGI | .sgi, .rgb | Yes | No | -- | No |
| Softimage PIC | .pic | Yes | No | -- | No |
| Alias PIX | .pix, .als | Yes | No | -- | No |
| ACES Container | .aces | Yes | No | -- | Yes |
| IFF / Maya | .iff | Yes | No | -- | No |
| PNG | .png | Yes | Yes | Native | No |
| JPEG | .jpg | Yes | Yes | Native | No |
| WebP | .webp | No | Yes | Native | No |
| GIF | .gif | Yes | Yes | Native | No |
| BMP | .bmp | Yes | Yes | Native | No |

### Video Formats

| Container | OpenRV Desktop | OpenRV Web | Notes |
|-----------|---------------|------------|-------|
| MP4 | Yes (FFmpeg) | Yes (WebCodecs) | H.264, H.265, AV1 |
| MOV | Yes (FFmpeg) | Yes (WebCodecs) | Codec-dependent |
| MKV/WebM | Limited | Yes (WebCodecs) | VP8, VP9, AV1 |
| MXF | Yes (FFmpeg) | Metadata only | No pixel decode |
| AVI | Yes (FFmpeg) | Browser fallback | Limited codec support |
| ProRes decode | Yes (native) | No | Transcode required |
| DNxHD/DNxHR | Yes (native) | No | Transcode required |

### Session/Editorial Formats

| Format | OpenRV Desktop | OpenRV Web | Notes |
|--------|---------------|------------|-------|
| .rv (GTO) | Yes (native) | Yes (import) | Full graph reconstruction |
| .rvedl | Yes | Yes | Edit decision list |
| OTIO | Plugin | Yes (import) | Timeline interchange |
| .orvproject | No | Yes (native) | OpenRV Web native format |
| CMX3600 EDL | Export only | Export only | Editorial interchange |

---

## Decoder Registry Architecture

The `DecoderRegistry` class manages all format decoders in a priority-ordered chain:

```
EXR -> DPX -> Cineon -> Float TIFF -> RAW Preview -> JPEG Gainmap
    -> HEIC Gainmap -> AVIF Gainmap -> Plain AVIF -> Radiance HDR
    -> JPEG XL -> JPEG 2000 -> MXF
```

Each decoder implements the generic `FormatDecoder<TOptions>` interface:

- **`formatName: string`** -- Human-readable format name (e.g., `"OpenEXR"`, `"DPX"`)
- **`canDecode(buffer: ArrayBuffer): boolean`** -- Tests magic bytes for format identification
- **`decode(buffer: ArrayBuffer, options?: TOptions): Promise<DecodeResult>`** -- Performs the actual decode, returning width, height, Float32Array data, channel count, color space, and metadata

The generic `TOptions` parameter allows each decoder to declare its own strongly typed options (e.g., EXR layer selection, DPX log-to-linear parameters) while the registry operates on the common `FormatDecoder` base.

The registry is extensible: custom decoders can be registered via `decoderRegistry.registerDecoder()` for plugin formats. Decoders are matched in registration order, so format-specific decoders (like Float TIFF) must precede more general ones (like RAW Preview, which also matches TIFF headers).

---

## Related Pages

- [Node Graph Architecture](node-graph-architecture.md) -- How `FileSourceNode`, `SequenceSourceNode`, and `VideoSourceNode` use format decoders
- [Session Compatibility](session-compatibility.md) -- Session file format details and migration guide
- [Stereo 3D Viewing](stereo-3d-viewing.md) -- Multi-view EXR and stereo video support
