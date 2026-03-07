# Phase 4: Adapting OpenRV Documentation for OpenRV Web User Guides

## Overview

This phase adapts content from the original [OpenRV documentation](https://github.com/AcademySoftwareFoundation/OpenRV) (Apache 2.0 licensed) into user guides tailored for OpenRV Web's browser-based, WebGL2-driven architecture. Each section identifies source material, what to extract, what must be rewritten, and what is unique to our implementation.

> **URL Stability Note:** All documentation source URLs referenced in this plan point to `main` branch. Before implementation begins, pin each URL to a specific commit SHA (e.g., replace `/main/docs/...` with `/<commit-sha>/docs/...`) to ensure referenced content does not change during the writing process.

---

## 4.1 Attribution & Legal Setup

### 4.1.1 Create Apache 2.0 Attribution Notice

- **Task**: Draft a standard Apache 2.0 attribution block referencing OpenRV as the upstream source.
- **Details**: The notice must include:
  - Original copyright holder: Academy Software Foundation / Contributors
  - License: Apache License, Version 2.0
  - Link to original repository: `https://github.com/AcademySoftwareFoundation/OpenRV`
  - Statement that documentation has been adapted and modified for OpenRV Web
- **Output file**: `docs/ATTRIBUTION.md`
- **Estimated word count**: 200

### 4.1.2 Add Attribution Header Template for Adapted Guides

- **Task**: Create a reusable Markdown header block to include at the top of every guide that derives content from OpenRV docs.
- **Details**: Template should contain:
  - "Portions of this guide are adapted from OpenRV documentation, (c) Contributors to the OpenRV Project, Apache 2.0"
  - Link to the specific source chapter URL
  - Note that content has been rewritten for WebGL2/browser context
- **Output file**: `docs/_templates/attribution-header.md`
- **Estimated word count**: 50

### 4.1.3 Check for OpenRV NOTICE File

- **Task**: Check the OpenRV repository for a NOTICE file per Apache 2.0 Section 4(d).
- **Details**: Apache 2.0 Section 4(d) requires that if the original Work includes a "NOTICE" text file, any derivative distribution must include a readable copy of the attribution notices contained within it. Check `https://github.com/AcademySoftwareFoundation/OpenRV` for a NOTICE file and reproduce its contents in our attribution if present.
- **Output**: Include required NOTICE content within `docs/ATTRIBUTION.md`
- **Estimated word count**: 100

### 4.1.4 Document License Compatibility

- **Task**: Write a brief note confirming Apache 2.0 compatibility with our MIT license.
- **Details**:
  - Apache 2.0 allows derivative works under a different license
  - We must preserve the Apache 2.0 notice for adapted documentation content
  - Our original code remains MIT-licensed
  - Adapted documentation content carries Apache 2.0 attribution
- **Output**: Include as a section within `docs/ATTRIBUTION.md`
- **Estimated word count**: 150

---

## 4.2 Rendering Pipeline Guide

### Source Material
- **URL**: `https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-user-manual/rv-user-manual-chapter-seven.md`
- **Key concepts to extract**: Pipeline stage ordering, linearization concept, EOTF/OETF terminology, color correction stage descriptions, display simulation model, channel isolation/reorder

### 4.2.1 Extract and Rewrite Pipeline Overview

- **Task**: Adapt the high-level pipeline concept (file-to-display transform chain) from Ch.7.
- **What to keep**: The conceptual model of sequential stages transforming pixels from file space to display space; the principle that corrections happen in linear light.
- **What to rewrite**: OpenRV uses a CPU+GPU hybrid pipeline with software pre-cache and hardware post-cache stages. OpenRV Web runs the entire color pipeline in a single WebGL2 fragment shader pass. Document our actual pipeline order from `Renderer.ts` / `viewer.frag.glsl`. **Note:** The actual shader has ~35 stages. The list below is a simplified summary -- the full documentation must enumerate all stages from the shader source. Key stages in order:
  1. Deinterlace
  2. Perspective correction / spherical projection
  3. Channel swizzle
  4. Unpremultiply alpha
  5. Input EOTF / linearize (sRGB, HLG, PQ, SMPTE 240M)
  6. Input primaries transform
  7. OCIO input transform (when active)
  8. Per-channel scale/offset
  9. 3D LUT -- file LUT (`u_fileLUT3D`, input device transform)
  10. Inline 1D LUT
  11. Exposure (`c * 2^exposure`)
  12. Color temperature / tint
  13. Brightness
  14. Contrast
  15. Saturation
  16. Hue rotation
  17. Color wheels (lift/gamma/gain) **-- NOTE: color wheels come BEFORE CDL**
  18. CDL (SOP + Saturation)
  19. Color curves (1D LUT texture)
  20. Highlights / shadows recovery
  21. Vibrance (with skin tone protection)
  22. Clarity
  23. HSL qualifier
  24. 3D LUT -- look LUT (`u_lookLUT3D`, creative grade)
  25. Film emulation
  26. Tone mapping (Reinhard, Filmic, ACES)
  27. Gamut mapping
  28. OCIO display transform (when active)
  29. 3D LUT -- display LUT (`u_displayLUT3D`, display calibration)
  30. Output primaries transform
  31. Display gamma / transfer function
  32. Color inversion
  33. Output mode (SDR / HDR)
  34. False color / zebra overlays
  35. Channel isolation
- **Output file**: `docs/guides/rendering-pipeline.md`
- **Estimated word count**: 2500
- **Diagrams needed**:
  - Mermaid flowchart of the full pipeline (vertical, showing all stages)
  - Comparison table: OpenRV pipeline vs OpenRV Web pipeline

### 4.2.2 Write Linearization / EOTF Section

- **Task**: Adapt Ch.7 linearization section (log-to-linear, sRGB-to-linear, Rec.709-to-linear, file gamma) for our context.
- **What to keep**: Mathematical formulas for sRGB piecewise function, Rec.709 piecewise function, Cineon log-to-linear concept, the "why" of linearization.
- **What to rewrite**:
  - Our EOTF is selected via `u_inputTransfer` uniform (0=sRGB, 1=HLG, 2=PQ, 3=SMPTE240M)
  - We support camera log curves (ARRI LogC3/C4, Sony S-Log3, RED Log3G10, Cineon) via `LogCurves.ts` with GLSL shader generation
  - HDR transfer functions (HLG, PQ) are first-class citizens, not available in original OpenRV
  - No YRyBy or YUV hardware conversion (browser handles this in video decode)
- **Output file**: Section within `docs/guides/rendering-pipeline.md`
- **Estimated word count**: 800
- **Diagrams needed**:
  - Transfer function curves plot (sRGB, HLG, PQ, LogC3 side by side)

### 4.2.3 Write Color Correction Stage Documentation

- **Task**: Adapt Ch.7 color correction descriptions (exposure, saturation, contrast, hue rotation) and add our extended set.
- **What to keep**: Mathematical definitions of exposure (`c * 2^e`), saturation (weighted luminance interpolation), hue rotation (luminance-preserving matrix).
- **What to rewrite**:
  - Original OpenRV uses Rw=0.3086, Gw=0.6094, Bw=0.0820 for hue rotation; we use Rec.709 weights throughout
  - We add temperature/tint, highlights/shadows, vibrance (with skin tone hue protection at 20-50 degrees), clarity, color wheels (lift/gamma/gain), HSL qualifier -- none of these exist in original OpenRV
  - All corrections run in the fragment shader in a single pass
- **Output file**: Section within `docs/guides/rendering-pipeline.md`
- **Estimated word count**: 1200

### 4.2.4 Write Display Output Section

- **Task**: Adapt Ch.7 display simulation section (display gamma, sRGB correction, Rec.709 correction, brightness).
- **What to keep**: sRGB OETF formula, Rec.709 OETF formula, concept of display gamma correction.
- **What to rewrite**:
  - We support multiple display transfer functions selectable by user: Linear, sRGB, Rec.709, Gamma 2.2, Gamma 2.4, Custom Gamma
  - HDR output modes: SDR, HLG, PQ, Extended (via `drawingBufferColorSpace`)
  - Wide gamut: Display P3 automatic detection and output
  - No ColorSync integration (browser handles ICC profiles)
  - Display capabilities detection (`DisplayCapabilities.ts`)
- **Output file**: Section within `docs/guides/rendering-pipeline.md`
- **Estimated word count**: 600
- **Diagrams needed**:
  - Table of supported display transfer functions with formulas

### 4.2.5 Write Channel Viewing Section

- **Task**: Adapt Ch.7 channel isolation / channel reorder / out-of-range display descriptions.
- **What to keep**: Concept of isolating R/G/B/A/luminance channels; out-of-range pixel visualization concept.
- **What to rewrite**:
  - Our channel modes: RGB, R, G, B, A, Luminance (via `ChannelMode` type)
  - False color overlay system with ARRI, RED, and custom presets
  - Zebra stripes for exposure warnings (>95% IRE high, <5% IRE low)
  - No channel reorder feature (browser handles pixel format)
- **Output file**: Section within `docs/guides/rendering-pipeline.md`
- **Estimated word count**: 400

---

## 4.3 LUT System Guide

### Source Material
- **URL**: `https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-user-manual/rv-user-manual-chapter-eight.md`
- **Key concepts to extract**: 1D vs 3D LUT distinction, LUT pipeline (pre-cache/file/look/display), file formats, input matrix, pre-LUT conditioning, hardware interpolation

### 4.3.1 Write LUT Concepts Introduction

- **Task**: Adapt Ch.8 LUT type descriptions (channel/1D LUTs vs 3D LUTs) for web audience.
- **What to keep**: Explanation of why 1D LUTs cannot model channel crosstalk; 3D LUT trilinear interpolation concept; memory trade-offs (64^3 = 3MB); when to use 1D vs 3D.
- **What to rewrite**:
  - Frame in terms of WebGL2 3D texture objects (`TEXTURE_3D`)
  - GPU path uses hardware trilinear interpolation via `texture()` on `TEXTURE_3D` objects; tetrahedral interpolation exists only in the CPU fallback path (`TetrahedralInterp.ts`) for higher-quality offline processing
  - Single-pass float LUT pipeline in fragment shader (no 8-bit bottleneck)
  - LUT intensity/blend control (0-100%) -- not available in original OpenRV
- **Output file**: `docs/guides/lut-system.md`
- **Estimated word count**: 800
- **Diagrams needed**:
  - Visual comparison of 1D vs 3D LUT data structure (simple cube diagram)

### 4.3.2 Write LUT Pipeline Documentation

- **Task**: Adapt Ch.8 four-stage LUT pipeline and explain our simplified model.
- **What to keep**: Conceptual description of why multiple LUT insertion points exist (file-to-working, creative look, display calibration).
- **What to rewrite**:
  - Original OpenRV: Pre-Cache (CPU) -> File (GPU) -> Look (GPU) -> Display (GPU)
  - OpenRV Web has THREE LUT slots in the fragment shader, closely matching OpenRV's multi-point model:
    - `u_fileLUT3D` -- input device transform (file LUT)
    - `u_lookLUT3D` -- creative grade (look LUT)
    - `u_displayLUT3D` -- display calibration (display LUT)
  - `features/color-management.md` documents that multi-point LUT pipeline is "partially implemented" -- describe what exists and what is planned
  - `CacheLUTNode.ts` exists for the pre-cache stage in the node graph
  - When OCIO is active, LUT transforms are generated from OCIO config and injected as 3D LUT textures
- **Output file**: Section within `docs/guides/lut-system.md`
- **Estimated word count**: 600
- **Diagrams needed**:
  - Side-by-side comparison: OpenRV 4-stage LUT pipeline vs OpenRV Web LUT pipeline (Mermaid)

### 4.3.3 Write LUT Format Support Table

- **Task**: Adapt Ch.8 format table and document our supported formats.
- **What to keep**: Format descriptions and their characteristics (input/output ranges, 1D/3D support).
- **What to rewrite**:
  - Original supports: .csp, .rv3dlut, .rvchlut, .3dl, .cube, Shake
  - OpenRV Web supports: `.cube` (primary, both 1D and 3D), `.csp`, `.3dl`
  - `.cube` parsing details from `LUTLoader.ts`: TITLE, DOMAIN_MIN/MAX, LUT_1D_SIZE, LUT_3D_SIZE
  - Not supported: .rv3dlut, .rvchlut, Shake formats (RV-proprietary)
  - Film emulation presets (10 built-in looks) are a web-only feature
- **Output file**: Section within `docs/guides/lut-system.md`
- **Estimated word count**: 400

### 4.3.4 Write LUT Workflow Examples

- **Task**: Create practical workflow examples for loading and using LUTs.
- **What to rewrite entirely** (no direct source in Ch.8):
  - Loading a .cube file via UI (drag-and-drop or file picker)
  - Adjusting LUT intensity slider for partial application
  - Using film emulation presets
  - Combining LUT with CDL and color corrections
  - Performance notes: GPU-accelerated, no frame rate impact
- **Output file**: Section within `docs/guides/lut-system.md`
- **Estimated word count**: 500
- **Screenshots needed**:
  - LUT section of ColorControls panel
  - Before/after with a film emulation preset applied

---

## 4.4 CDL Guide

### Source Material
- **URL**: `https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-user-manual/rv-user-manual-chapter-nine.md`
- **Key concepts to extract**: ASC CDL model (SOP + Saturation), file formats (.cdl, .cc, .ccc), pipeline integration points

### 4.4.1 Write ASC CDL Model Explanation

- **Task**: Adapt Ch.9 CDL model description with our implementation details.
- **What to keep**: The ASC CDL standard formula: `out = pow(max(in * slope + offset, 0), power)` followed by saturation. The SOP ordering requirement.
- **What to rewrite**:
  - Reference our implementation in `src/color/CDL.ts` which implements the exact formula
  - Saturation uses Rec.709 luminance weights (Rw=0.2126, Gw=0.7152, Bw=0.0722) via `luminanceRec709()`
  - GPU implementation runs in fragment shader; CPU fallback in `applyCDLToImageData()`
  - Per-channel RGB controls for each SOP parameter
  - ACEScct mode: when `u_cdlColorspace == 1`, the shader wraps CDL operations in linear-to-ACEScct / ACEScct-to-linear conversions, enabling CDL to operate in ACEScct space for better perceptual uniformity
  - HDR headroom preserved (no upper clamp in CPU path, only lower bound at 0)
- **Output file**: `docs/guides/cdl-color-correction.md`
- **Estimated word count**: 800
- **Diagrams needed**:
  - SOP signal flow diagram (input -> slope -> offset -> clamp -> power -> saturation -> output)

### 4.4.2 Write CDL File Format Support

- **Task**: Document supported CDL file formats and parsing.
- **What to keep from Ch.9**: Description of .cdl, .cc, .ccc file types.
- **What to rewrite**:
  - Our parser supports all three formats via dedicated functions:
    - `parseCDLXML()` for `.cdl` files (simplified parser)
    - `parseCC()` for `.cc` files (single `<ColorCorrection>` root)
    - `parseCCC()` for `.ccc` files (full `<ColorCorrectionCollection>` with multiple entries and IDs)
  - Unlike original OpenRV which only reads the first correction from .ccc files, our `parseCCC()` returns all entries with their IDs
  - Export via `exportCDLXML()` generates standard CDL v1.2 XML
  - XML namespace handling (strips prefix for comparison)
  - Validation: parse error detection, numeric value validation with descriptive errors
- **Output file**: Section within `docs/guides/cdl-color-correction.md`
- **Estimated word count**: 500

### 4.4.3 Write CDL Pipeline Integration

- **Task**: Explain where CDL fits in our rendering pipeline.
- **What to keep from Ch.9**: Concept of two CDL integration points (before linearization, after linearization).
- **What to rewrite**:
  - OpenRV has CDL at two points: RVLinearize (pre-linearization) and RVColor (post-linearization)
  - OpenRV Web applies CDL after exposure/contrast/saturation adjustments in the fragment shader pipeline (post-linearization only)
  - `CDLNode.ts` in the node graph system for per-source CDL assignment
  - CDL values persist in session state (`SessionState.cdl`)
- **Output file**: Section within `docs/guides/cdl-color-correction.md`
- **Estimated word count**: 400

### 4.4.4 Write CDL Workflow Guide

- **Task**: Create practical workflow examples.
- **What to write (original content)**:
  - Loading .cdl/.cc/.ccc files via the CDL panel UI
  - Adjusting SOP sliders interactively (per-channel R/G/B)
  - Adjusting saturation
  - Saving CDL values to file for interchange with other applications
  - Double-click to reset individual sliders
  - Keyboard shortcut for toggling CDL panel
  - Round-trip workflow: export from OpenRV Web -> import in DaVinci Resolve / Nuke
- **Output file**: Section within `docs/guides/cdl-color-correction.md`
- **Estimated word count**: 600
- **Screenshots needed**:
  - CDL panel with labeled controls
  - Example before/after CDL application

---

## 4.5 OCIO Guide

### Source Material
- **URL**: `https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-user-manual/rv-user-manual-chapter-eleven.md`
- **Key concepts to extract**: OCIO integration model, config loading, color space concepts, four node types, GPU path usage, display/view/look transforms, `ocio_source_setup` auto-detection

> **Implementation Status: Partially Implemented.** Per the feature spec (`features/color-management.md`), OCIO support is partially implemented. Documentation in this section should clearly distinguish between what is currently functional and what is planned. Workflow examples (4.5.5) should be deferred until OCIO is fully implemented to avoid documenting aspirational behavior.

### 4.5.1 Write OCIO Concepts Introduction

- **Task**: Adapt Ch.11 OCIO overview for web context. **Note: Mark sections clearly as "Partially Implemented" where applicable.**
- **What to keep**: OCIO's role in cross-application color consistency; concept of input/working/display/view color spaces; look transforms for creative grading.
- **What to rewrite**:
  - Original OpenRV uses OCIO v2 with legacy v1 API; OpenRV Web uses WASM-compiled OCIO
  - No environment variable support (`$OCIO`) -- configs loaded via file picker or drag-and-drop
  - Our OCIO pipeline implemented in `src/color/wasm/OCIOWasmPipeline.ts`
  - WASM module translates OCIO transforms to GPU shader code and 3D LUT textures
  - Built-in configs: ACES 1.2, sRGB Studio (no external config required for basic workflows)
- **Output file**: `docs/guides/ocio-color-management.md`
- **Estimated word count**: 800

### 4.5.2 Write OCIO Configuration Loading

- **Task**: Document how to load and use OCIO configs in the browser.
- **What to keep from Ch.11**: Concept of config file structure, display/view/look definitions.
- **What to rewrite**:
  - No `$OCIO` environment variable -- browser-based loading only
  - Drag-and-drop `.ocio` config file onto the viewer
  - File picker in OCIO panel
  - Config validation on load (check for required color spaces, displays, views)
  - `OCIOConfig.ts`: `OCIOState` interface with full pipeline state
  - Built-in configs accessible without file loading (`getBuiltinConfig()`, `getAvailableConfigs()`)
  - Config persistence in session state
  - Limitation: external file references in OCIO configs (LUT files referenced by relative path) require all files to be loaded together or embedded
- **Output file**: Section within `docs/guides/ocio-color-management.md`
- **Estimated word count**: 600

### 4.5.3 Write OCIO Transform Pipeline

- **Task**: Document the OCIO transform chain in our WebGL2 pipeline.
- **What to keep from Ch.11**: Conceptual model of input -> working -> display transform chain; four node types (OCIONode, OCIOFile, OCIODisplay, OCIOLook).
- **What to rewrite**:
  - Our OCIO pipeline generates a 3D LUT texture from the OCIO transform chain
  - `OCIOPipelineResult` type provides shader uniforms and LUT data to the renderer
  - OCIO transforms injected at two points in the fragment shader: input (after EOTF) and display (before output transfer)
  - Input color space auto-detection from file metadata (EXR headers, image metadata)
  - Working, display, view, and look transform selection via UI dropdowns
  - Forward and inverse direction support for bidirectional camera space conversions
  - `getInputColorSpaces()`, `getDisplays()`, `getViews()`, `getLooks()` API
- **Output file**: Section within `docs/guides/ocio-color-management.md`
- **Estimated word count**: 800
- **Diagrams needed**:
  - OCIO transform chain flowchart (input space -> working space -> look -> display/view)
  - Comparison table: OpenRV OCIO nodes vs OpenRV Web OCIO pipeline

### 4.5.4 Write Browser Limitations vs Desktop OCIO

- **Task**: Document what differs and what is limited in browser-based OCIO.
- **What to write (original content -- no direct Ch.11 equivalent)**:
  - No filesystem access for referenced LUT files (must bundle or embed)
  - No `$OCIO` environment variable
  - WASM module size and load time considerations
  - GPU shader translation may differ from CPU path (precision, operator support)
  - No `ocio_source_setup` package system -- auto-detection is built into the viewer
  - Mixed-asset handling: unlike OpenRV which applies OCIO display to all imagery once activated, OpenRV Web can selectively apply OCIO per-source
  - Performance: WASM OCIO config parsing is slower than native C++; 3D LUT generation is the main cost
  - Supported OCIO features vs unsupported (e.g., custom OCIO operators, FileTransform with external files)
- **Output file**: Section within `docs/guides/ocio-color-management.md`
- **Estimated word count**: 600

### 4.5.5 Write OCIO Workflow Examples

> **DEFERRED:** This section should be deferred until OCIO is fully implemented. Writing workflow examples against a partially implemented feature will produce aspirational documentation that misleads users. Revisit when OCIO reaches full implementation status in the feature spec.

- **Task**: Create practical OCIO workflow examples. **Status: DEFERRED pending full OCIO implementation.**
- **What to write (original content, when OCIO is ready)**:
  - Basic ACES workflow: load EXR -> auto-detect ACEScg -> view through ACES Output Transform
  - Loading a studio OCIO config
  - Switching display/view transforms for different review contexts (SDR monitor, HDR, projector)
  - Using look transforms for shot-specific creative grades
  - Combining OCIO with manual color corrections (CDL, curves)
- **Output file**: Section within `docs/guides/ocio-color-management.md`
- **Estimated word count**: 500
- **Screenshots needed**:
  - OCIO panel showing config, input space, display, view, look dropdowns

---

## 4.6 Stereo 3D Guide

### Source Material
- **URL**: `https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-user-manual/rv-user-manual-chapter-twelve.md` (Chapter 12: Stereo Viewing)
- **Key concepts to extract**: Stereo display mode descriptions, use cases for each mode, stereo source types, eye swap, convergence

### 4.6.1 Write Stereo Mode Descriptions

- **Task**: Adapt stereo mode descriptions from Ch.12 for our supported modes.
- **What to keep**: Descriptions of anaglyph (red/cyan), side-by-side, over/under concepts; use cases for each mode.
- **What to rewrite**:
  - Our supported modes (from `StereoMode` type in `src/core/types/stereo.ts`):
    - `off`, `side-by-side`, `over-under`, `mirror`, `anaglyph`, `anaglyph-luminance`, `checkerboard`, `scanline`, `left-only`, `right-only`
  - Input formats: `side-by-side`, `over-under`, `separate` (from `StereoInputFormat`)
  - Convergence offset: -20 to +20 range (percentage of width)
  - Eye swap toggle
  - Keyboard shortcut: Shift+3 cycles through modes
- **Output file**: `docs/guides/stereo-3d-viewing.md`
- **Estimated word count**: 1000
- **Diagrams needed**:
  - Visual examples of each stereo mode (simple schematic showing L/R eye arrangement)

### 4.6.2 Write Stereo Modes Not Supported

- **Task**: Document what modes from original OpenRV are not available in the browser.
- **What to document**:
  - **Not supported**: Hardware stereo (quad-buffered GL), HDMI 1.4a direct output
  - **Not applicable**: Browser has no direct display output control
  - **Future**: WebXR for VR headset stereo
  - **Not yet implemented**: Multi-view EXR stereo, stereo QuickTime movies
- **Output file**: Section within `docs/guides/stereo-3d-viewing.md`
- **Estimated word count**: 300

### 4.6.3 Write Stereo Advanced Features

- **Task**: Document our stereo-specific features beyond original OpenRV.
- **What to write (original content)**:
  - Stereo alignment overlay for setup verification
  - Convergence measurement tool
  - Floating window detection for stereo violations
  - Per-eye annotations (separate annotation layers for left/right)
  - Stereo eye transform (per-eye geometric transforms)
  - GTO session persistence of stereo settings
- **Output file**: Section within `docs/guides/stereo-3d-viewing.md`
- **Estimated word count**: 500
- **Screenshots needed**:
  - Stereo mode dropdown in View tab
  - Example of anaglyph mode applied to stereo content

---

## 4.7 File Formats Guide

### Source Material
- **URL**: `https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-user-manual/rv-user-manual-chapter-fifteen.md` (Chapter 15: File Formats)
- **Key concepts to extract**: Format descriptions, supported features per format, precision handling

### 4.7.1 Write Professional VFX Format Descriptions

- **Task**: Adapt Ch.15 descriptions for formats we share with original OpenRV.
- **What to keep**: Descriptions of EXR, DPX, Cineon purpose and history in VFX pipelines.
- **What to rewrite**:
  - **EXR** (`EXRDecoder.ts`): WebAssembly decoder, Float32 precision, PIZ + DWA compression, multi-layer AOV selection, channel remapping, data/display window overlay. Multi-view EXR for stereo (`MultiViewEXR.ts`)
  - **DPX** (`DPXDecoder.ts`): 10-bit log with `unpackDPX10bit()`, transfer function detection (`DPXTransferFunction` enum), log-to-linear via `LogLinear.ts`
  - **Cineon** (`CineonDecoder.ts`): Kodak Cineon format, configurable film gamma, `cineonLogToLinear()`
  - **Radiance HDR** (`HDRDecoder.ts`): RGBE encoding, adaptive RLE decompression
  - **Float TIFF** (`TIFFFloatDecoder.ts`): 32-bit floating-point TIFF
- **Output file**: `docs/guides/file-formats.md`
- **Estimated word count**: 1500

### 4.7.2 Write Web-Native Format Descriptions

- **Task**: Document formats unique to OpenRV Web (not in original OpenRV).
- **What to write (original content)**:
  - **JPEG XL** (`JXLDecoder.ts`): HDR-capable, WASM decoder, browser-native HDR path
  - **JPEG Gainmap HDR** (`JPEGGainmapDecoder.ts`): MPF parsing, XMP headroom extraction, sRGB-to-linear + gain reconstruction
  - **HEIC Gainmap HDR** (`HEICGainmapDecoder.ts`): Apple gainmap, ISO 21496-1, ISOBMFF parsing, WASM fallback for non-Safari
  - **AVIF Gainmap HDR** (`AVIFGainmapDecoder.ts`): Auxiliary gain map items per ISO 21496-1
  - **JPEG 2000 / HTJ2K** (`JP2Decoder.ts`): openjph WASM module
  - **AVIF** (`avif/`): Browser-native or WASM decode
  - **RAW Preview** (`RAWPreviewDecoder.ts`): Embedded preview extraction from camera RAW files
  - Browser-native formats: PNG, JPEG, WebP, GIF, BMP, HEIC/HEIF (via `<img>` element)
- **Output file**: Section within `docs/guides/file-formats.md`
- **Estimated word count**: 1200

### 4.7.3 Write Video Container and Codec Support

- **Task**: Document video format support unique to web context.
- **What to write (original content)**:
  - **Mediabunny WebCodecs**: MP4/M4V/3GP/3G2, MOV/QuickTime, MKV/WebM, OGG containers
  - **MXF Demuxer** (`MXFDemuxer.ts`): Material eXchange Format parsing
  - **HDR video**: VideoFrame texturing with HLG/PQ transfer functions
  - ProRes/DNxHD codec detection with FFmpeg transcoding guidance
  - AVI browser fallback
  - Frame-accurate seeking via WebCodecs API
  - Contrast with original OpenRV: native codec support vs browser WebCodecs API constraints
- **Output file**: Section within `docs/guides/file-formats.md`
- **Estimated word count**: 800

### 4.7.4 Write Sequence and Session Format Support

- **Task**: Document image sequence and session file support.
- **What to write**:
  - Image sequence patterns: `%04d` (printf), `####` (hash), `@` notation
  - Single-file sequence inference and directory scanning
  - Missing frame detection with visual overlay
  - **RV/GTO session files**: Full graph reconstruction from desktop RV sessions
  - **RV EDL** (`RVEDLParser.ts`): Edit decision list format parsing
  - **OTIO** (OpenTimelineIO): Import editorial timelines with clips, gaps, transitions
  - `.orvproject` native session format
- **Output file**: Section within `docs/guides/file-formats.md`
- **Estimated word count**: 600

### 4.7.5 Write Format Comparison Table

- **Task**: Create a comprehensive comparison table: OpenRV formats vs OpenRV Web formats.
- **What to include**:
  - Format name, extension, bit depth, HDR support, decoder type (native/WASM/JS), status
  - Formats in original OpenRV we do NOT support (e.g., ACES container, SGI, Softimage PIC, Alias PIX)
  - Formats we support that original does NOT (JPEG XL, Gainmap HDR variants, AVIF, WebP, MXF demux)
- **Output file**: Section within `docs/guides/file-formats.md`
- **Estimated word count**: 300 (mostly table)
- **Diagrams needed**:
  - Format support matrix table (Markdown)

---

> **Scope Recommendation:** Section 4.8 (Node Graph Architecture) is primarily original content, not adaptation of OpenRV documentation. Consider moving it to a separate plan focused on original developer documentation to keep this plan focused on content adaptation work.

## 4.8 Node Graph Architecture Guide

### Source Material
- **URL**: `https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-reference-manual/rv-reference-manual-chapter-two.md` (Reference Ch.2: DAG and Property System)
- **Key concepts to extract**: DAG concept, node types, property system, evaluation model, group nodes

### 4.8.1 Write DAG Concept Introduction

- **Task**: Adapt Ref Ch.2 DAG overview for our TypeScript node system.
- **What to keep**: Concept of directed acyclic graph for image processing; why a graph model (vs linear pipeline) enables flexible compositing and comparison.
- **What to rewrite**:
  - Our base class: `IPNode` (`src/nodes/base/IPNode.ts`) with `id`, `type`, `properties`, inputs/outputs, signals, cached evaluation
  - `PropertyContainer` from `src/core/graph/Property.ts` for typed property storage
  - `Signal` system for reactive change propagation
  - `EvalContext` for frame-based evaluation
  - `NodeProcessor` strategy pattern for external processing delegation
  - `NodeFactory` (`src/nodes/base/NodeFactory.ts`) for dynamic node creation
- **Output file**: `docs/guides/node-graph-architecture.md`
- **Estimated word count**: 1000
- **Diagrams needed**:
  - Simple DAG showing source -> effects -> group -> output (Mermaid)

### 4.8.2 Write Source Node Documentation

- **Task**: Document source node types.
- **What to write**:
  - `BaseSourceNode` (`src/nodes/sources/BaseSourceNode.ts`): Abstract base for all sources
  - `FileSourceNode` (`src/nodes/sources/FileSourceNode.ts`): Format detection by extension + magic bytes, supports EXR/DPX/Cineon/Float TIFF/JPEG Gainmap
  - `SequenceSourceNode` (`src/nodes/sources/SequenceSourceNode.ts`): Image sequence playback
  - `VideoSourceNode` (`src/nodes/sources/VideoSourceNode.ts`): Video file playback via Mediabunny
  - `ProceduralSourceNode` (`src/nodes/sources/ProceduralSourceNode.ts`): Procedural test patterns
- **Output file**: Section within `docs/guides/node-graph-architecture.md`
- **Estimated word count**: 800

### 4.8.3 Write Group Node Documentation

- **Task**: Document group node types that organize source composition.
- **What to write**:
  - `BaseGroupNode` (`src/nodes/groups/BaseGroupNode.ts`): Abstract base for grouping
  - `SequenceGroupNode`: Linear playback of multiple sources (default view)
  - `StackGroupNode`: Layered viewing with compositing
  - `LayoutGroupNode`: Grid/spatial arrangement with tiled rendering
  - `SwitchGroupNode`: Quick switching between sources
  - `FolderGroupNode`: Organizational grouping
  - `RetimeGroupNode`: Speed-adjusted playback
  - Corresponding processors: `StackProcessor`, `SwitchProcessor`, `LayoutProcessor`
- **Output file**: Section within `docs/guides/node-graph-architecture.md`
- **Estimated word count**: 800
- **Diagrams needed**:
  - Node type hierarchy (Mermaid class diagram)

### 4.8.4 Write Effect Node Documentation

- **Task**: Document the effect node system.
- **What to write**:
  - `EffectNode` base class and `EffectChain` for ordered effect application
  - Effect registry with category-based lookup
  - Individual effect nodes: `CDLNode`, `ClarityNode`, `ColorInversionNode`, `ColorWheelsNode`, `DeinterlaceNode`, `FilmEmulationNode`, `HighlightsShadowsNode`, `HueRotationNode`, `NoiseReductionNode`, `SharpenNode`, `StabilizationNode`, `ToneMappingNode`, `VibranceNode`
  - GPU processors: `GPUNoiseReductionProcessor`, `GPUSharpenProcessor`
  - `CacheLUTNode` for pre-cache LUT application
  - Contrast with OpenRV's Mu/Python scripting model for effects
- **Output file**: Section within `docs/guides/node-graph-architecture.md`
- **Estimated word count**: 1000

---

## 4.9 Session Compatibility Guide

### Source Material
- **URL**: `https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenRV/main/docs/rv-manuals/rv-reference-manual/rv-reference-manual-chapter-six.md` (Reference Ch.6: RV/GTO Session Format)
- **Key concepts to extract**: GTO file format structure, session components, property serialization, view types

### 4.9.1 Write RV Session Format Overview

- **Task**: Adapt Ref Ch.6 session format description.
- **What to keep**: GTO format concept (binary graph serialization), session component types (sources, views, connections), property types.
- **What to rewrite**:
  - OpenRV Web can load desktop RV `.rv` session files with full graph reconstruction
  - Our GTO parser reconstructs the node graph from binary format
  - Session components mapped to our node types:
    - RVSourceGroup -> FileSourceNode / SequenceSourceNode / VideoSourceNode
    - RVSequenceGroup -> SequenceGroupNode
    - RVStackGroup -> StackGroupNode
    - RVLayoutGroup -> LayoutGroupNode
    - RVSwitchGroup -> SwitchGroupNode
    - RVRetimeGroup -> RetimeGroupNode
  - Property system mapped from GTO properties to our `PropertyContainer`
- **Output file**: `docs/guides/session-compatibility.md`
- **Estimated word count**: 1000

### 4.9.2 Write Supported Session Features Table

- **Task**: Document which desktop RV session features we support.
- **What to write**:
  - Supported: source references, view configurations, color correction state, playback settings, markers/annotations, stereo settings
  - Partially supported: folder organization (via PlaylistManager)
  - Not supported: Mu/Python scripts embedded in sessions, custom node types defined by plugins, hardware-specific display settings
  - Session state fields from `SessionState.ts`: media, playback, paint, view, color, CDL, filters, transform, crop, lens, wipe, stack, LUT
- **Output file**: Section within `docs/guides/session-compatibility.md`
- **Estimated word count**: 500
- **Diagrams needed**:
  - Feature support matrix table

### 4.9.3 Write Migration Guide: Desktop RV to OpenRV Web

> **Scope Recommendation:** This section and 4.9.4 are entirely original content (not adapted from OpenRV docs). Consider moving them to a separate plan to keep this plan focused on content adaptation.

- **Task**: Create a practical migration guide.
- **What to write (original content)**:
  - Steps to open a desktop RV `.rv` session in OpenRV Web
  - What will transfer: source list, view arrangement, basic color corrections, playback position
  - What will not transfer: custom Mu scripts, OCIO configs (must be re-loaded), plugin-dependent features
  - File path handling: desktop absolute paths vs browser file loading
  - Workarounds for unsupported features
  - OpenRV Web native format: `.orvproject` JSON format
  - Auto-save and snapshot system (IndexedDB-based)
  - EDL export (CMX3600) for timeline interchange
- **Output file**: Section within `docs/guides/session-compatibility.md`
- **Estimated word count**: 800

### 4.9.4 Write Native Session Management Guide

- **Task**: Document OpenRV Web's own session management features.
- **What to write (original content)**:
  - Save/load `.orvproject` files via `SessionSerializer`
  - Auto-save with configurable intervals (1-30 min) via `AutoSaveManager`
  - Snapshot versioning with IndexedDB storage via `SnapshotManager`
  - Crash recovery detection
  - Session state includes: media references, playback state, paint/annotations, view transform, color/CDL/LUT settings, filter/effect state, crop/lens/wipe settings
  - Blob URL handling for local files (sets `requiresReload: true`)
  - Multi-clip playlist management with EDL import/export
- **Output file**: Section within `docs/guides/session-compatibility.md`
- **Estimated word count**: 600
- **Screenshots needed**:
  - Snapshot panel UI
  - Auto-save indicator states

---

## Summary: Deliverables Matrix

| Section | Output File | Est. Words | Diagrams | Screenshots |
|---------|------------|-----------|----------|-------------|
| 4.1 Attribution & Legal | `docs/ATTRIBUTION.md`, `docs/_templates/attribution-header.md` | 400 | 0 | 0 |
| 4.2 Rendering Pipeline | `docs/guides/rendering-pipeline.md` | 5500 | 3 | 0 |
| 4.3 LUT System | `docs/guides/lut-system.md` | 2300 | 2 | 2 |
| 4.4 CDL Guide | `docs/guides/cdl-color-correction.md` | 2300 | 1 | 2 |
| 4.5 OCIO Guide | `docs/guides/ocio-color-management.md` | 3300 | 2 | 1 |
| 4.6 Stereo 3D | `docs/guides/stereo-3d-viewing.md` | 1800 | 1 | 2 |
| 4.7 File Formats | `docs/guides/file-formats.md` | 4400 | 1 | 0 |
| 4.8 Node Graph | `docs/guides/node-graph-architecture.md` | 3600 | 2 | 0 |
| 4.9 Session Compat | `docs/guides/session-compatibility.md` | 2900 | 1 | 2 |
| **Total** | **10 files** | **~26,500** | **13** | **9** |

## Task Dependencies

```
4.1 (Attribution) ──> All other sections (must complete first)
4.2 (Pipeline) ──> 4.3 (LUT), 4.4 (CDL), 4.5 (OCIO) (pipeline context needed first)
4.3 (LUT) ──> 4.5 (OCIO) (LUT concepts referenced in OCIO guide)
4.7 (File Formats) ──> 4.8 (Node Graph) (source nodes reference format decoders)
4.8 (Node Graph) ──> 4.9 (Sessions) (session format maps to node graph)
```

## Priority Order

1. **4.1** Attribution (blocker for all other work)
2. **4.2** Rendering Pipeline (foundational -- all color guides reference this)
3. **4.4** CDL Guide (self-contained, high user value)
4. **4.3** LUT System Guide (high user value, references pipeline)
5. **4.5** OCIO Guide (complex, depends on pipeline + LUT understanding)
6. **4.7** File Formats Guide (independent, high reference value)
7. **4.6** Stereo 3D Guide (independent, niche audience)
8. **4.8** Node Graph Guide (developer-facing)
9. **4.9** Session Compatibility Guide (depends on node graph)
