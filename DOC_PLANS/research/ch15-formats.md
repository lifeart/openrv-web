# OpenRV Chapter 15: File Formats -- Research Notes

## Source
- URL: https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-user-manual/rv-user-manual-chapter-fifteen.md
- License: Apache 2.0

## Key Concepts to Reuse

### Movie/Video Container Formats

**QuickTime (.mov)**
- Codecs: Photo-JPEG, Motion-JPEG, H.264 (avc1), RAW (RGB/YUV), uncompressed audio
- Photo-JPEG: fast random frame access, excellent color
- H.264: keyframe-based compression
- RV does not apply gamma corrections from gama atoms

**MPEG-4 (.mp4)**
- Nearly identical container to QuickTime
- Typically H.264 or predecessors
- Cross-platform

**Windows AVI (.avi)** - Same codec support as QuickTime

**Windows Media (.wmv)** - No official support

### Image File Formats

**OpenEXR (.exr/.sxr/.openexr)**
- Bit depth: 16-bit half and 32-bit full floating point
- Compression: Uncompressed, B44, B44A (lossy), DWAA (32 scanline DCT), DWAB (256 scanline DCT)
- Multiple views (stereo "left"/"right")
- Layered structure (flattened in RV)
- Y/RY/BY with subsampled chroma
- Channel inheritance (`-exrInherit`)
- GPU resampling for chroma
- Chromaticities/primaries with transform to Rec. 709
- Data/display window handling
- Multi-part files (EXR 2.0+) with independent headers
- Channel naming: **view.layer.channel** structure

**TIFF**
- 32-bit floating point, multiple channels (beyond 4)
- Tiled and scanline
- Planar and interleaved reading
- All TIFF tags including EXIF as image attributes
- Only first image directory processed

**DPX and Cineon**
- DPX: 8-bit, 10-bit, 12-bit, 16-bit
- Cineon: 10-bit
- Transfer functions: Linear, log, Rec. 709
- Default decoding: 8-bit integer per channel (configurable to 16-bit)
- Cineon Log to Linear decoding; sRGB display recommended
- Writers limited to 10-bit output

**IFF (ILBM)** - Maya/Shake format, including 32-bit float variant

**JPEG**
- Native Y'UV or RGB reading
- EXIF tags as image attributes
- 8 bits per channel limit
- Selectable I/O methods

**RAW DSLR Camera Formats (io_raw plugin)**
- .arw (Sony), .cr2/.cr3/.crw (Canon), .dng (Digital Negative), .nef (Nikon), .orf (Olympus), .pef/.ptx (Pentax), .raf (Fujifilm), .rdc/.rmf (Ricoh/Canon)
- Via LibRAW

### Movieproc (Procedural)
- Procedural movie format encoded in filename (file need not exist)
- Types: solid, smptebars, colorchart, noise, blank, black, white, grey, hramp, hwramp, error
- Parameters: start/end frame, fps, dimensions, bit depth, audio options

### Audio Formats
- Microsoft Wave, Apple AIFF (best cross-platform)
- Uncompressed formats preferred
- Multichannel files supported but playback limited to stereo

### EDL Format (Simple ASCII)
- Lines: comment (#), blank, or edit event: `"SOURCE" START END`
- Image sequences use `#` notation (e.g., `bar.1-100#.exr`)
- START = first included frame, END = last included frame (inclusive)

### Image Sequence Conventions
- Frame numbering via `#` placeholder in filename
- Range notation: `filename.START-END#.ext`

## What Does NOT Apply to OpenRV Web
- QuickTime/AVI/WMV container handling (web uses browser-native video decoding)
- Movieproc procedural format
- RAW DSLR formats (no LibRAW in browser)
- IFF format
- DPX/Cineon (specialized VFX formats -- though web version does support DPX/Cineon per codebase)
- Multi-part EXR with independent headers
- Audio file format handling (web uses Web Audio API)
- EDL file format
- EXR channel inheritance flag
- io_raw plugin system

## Adaptation Notes
- The web version supports: EXR, DPX, Cineon, Float TIFF, JPEG (including Gainmap) per the codebase
- Format detection uses extension + magic bytes (FileSourceNode)
- Video formats handled by browser's WebCodecs API (mediabunny library)
- The web version adds JPEG Gainmap support not in original RV
- EXR support in web likely via JavaScript/WASM decoder rather than native library
- DPX/Cineon decoders exist in the web codebase with pattern: `isFormatFile(buffer)`, `decodeFormat(buffer)` returning `{width, height, data: Float32Array, channels}`
- Channel naming conventions from EXR (view.layer.channel) may be simplified in web
- The bit depth / precision concepts are relevant: web decoders output Float32Array
