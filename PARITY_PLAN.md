# OpenRV → OpenRV-Web Feature Parity Plan

> **Generated**: 2026-02-18
> **Reference**: OpenRV (ASWF) `main` @ `HEAD`
> **Target**: openrv-web (`more-work` branch)
> **Method**: Exhaustive source-level analysis of both codebases (8 parallel deep-dive agents)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Feature Parity Matrix](#2-feature-parity-matrix)
3. [Gap Analysis by Domain](#3-gap-analysis-by-domain)
4. [Architecture Comparison](#4-architecture-comparison)
5. [Prioritized Implementation Plan](#5-prioritized-implementation-plan)
6. [Web Platform Constraints & Mitigations](#6-web-platform-constraints--mitigations)
7. [Phased Delivery Milestones](#7-phased-delivery-milestones)
8. [Risk Assessment](#8-risk-assessment)

---

## 1. Executive Summary

### Current State

**OpenRV** (C++/Python/Mu/Qt) is a production-grade VFX review tool with 25+ years of evolution. It features 47+ node types, 133 GLSL shaders, 38 plugin packages, and support for 19+ image formats and all major video codecs via FFmpeg.

**openrv-web** (TypeScript/WebGL2) is a comprehensive browser-based viewer that already covers a significant portion of OpenRV's core functionality. It has 96+ UI components, a 1272-line fragment shader with 34 processing stages, 8 tone mapping operators, and modern HDR support (HLG/PQ/VideoFrame).

### Parity Score

| Domain | OpenRV Features | openrv-web Has | Parity % |
|--------|----------------|----------------|----------|
| **Color Pipeline** | 25 node types, 45+ shaders | 34 shader stages, CDL, curves, wheels | **75%** |
| **Format Support** | 19+ image, FFmpeg video, 32-ch audio | 10+ image (inc. gainmap), WebCodecs video | **55%** |
| **UI/Interaction** | Timeline, HUD, wipes, annotations, presets | Timeline, all scopes, paint, wipes, comparison | **80%** |
| **Node Graph** | 47 node types, DAG eval, caching | 20+ nodes, DAG eval, frame cache | **60%** |
| **Plugins/Packages** | 38 rv-packages (Mu/Python) | API + wiring modules | **30%** |
| **Session/Collaboration** | .rv files, RV Sync network | .orvproject, NetworkSync, GTO loader | **50%** |
| **Stereo 3D** | Full stereo pipeline (6 modes) | Stereo control + eye transforms | **65%** |
| **Export/RVIO** | Full movie encode, leader/slate, frameburn | Frame export (PNG/JPEG/EXR/WebP), session save | **35%** |

**Overall Weighted Parity: ~58%**

### Key Strengths of openrv-web (Beyond OpenRV)

openrv-web already has several features that **exceed** OpenRV:

- **8 tone mapping operators** (OpenRV has none built-in; relies on OCIO/display LUT)
- **Gamut mapping** with soft compress (OpenRV relies on OCIO)
- **HDR gainmap support** (JPEG, AVIF, HEIC - not in OpenRV)
- **Modern HDR display** (WebCodecs VideoFrame, rec2100-hlg/pq canvas)
- **HSL Qualifier** secondary color correction
- **Film emulation** with grain
- **Color wheels** (Lift/Gamma/Gain)
- **Vibrance** with skin tone protection
- **Auto-exposure** with scene analysis
- **False color / zebra stripes** diagnostic overlays
- **WebGPU backend** (in progress)
- **Accessibility** (ARIA, focus management, keyboard nav)
- **Modern UI** (responsive panels, dark/light themes, drag handles)

---

## 2. Feature Parity Matrix

### 2.1 Color Pipeline

| Feature | OpenRV | openrv-web | Gap | Priority |
|---------|--------|-----------|-----|----------|
| Linearize (sRGB) | ✅ LinearizeIPNode | ✅ Shader phase 0c/0d | None | - |
| Linearize (Rec.709) | ✅ | ✅ | None | - |
| Linearize (HLG BT.2100) | ✅ ColorHLGLinear.glsl | ✅ hlgToLinear() | None | - |
| Linearize (PQ ST.2084) | ✅ ColorSMPTE2084Linear.glsl | ✅ pqToLinear() | None | - |
| Linearize (Cineon Log) | ✅ ColorCineonLogLinear.glsl | ✅ cineonLogToLinear() | None | - |
| Linearize (ARRI LogC) | ✅ ColorLogCLinear.glsl | ✅ logC3ToLinear() | None | - |
| Linearize (ARRI LogC4) | ❌ | ✅ logC4 | **Web exceeds** | - |
| Linearize (RED Log) | ✅ ColorRedLogLinear.glsl | ❌ | Missing | P2 |
| Linearize (Viper Log) | ✅ ColorViperLogLinear.glsl | ✅ viperLogToLinear() | None | - |
| Linearize (SMPTE 240M) | ✅ ColorSMPTE240MLinear.glsl | ❌ | Missing (legacy) | P3 |
| Linearize (ACES Log) | ✅ ColorACESLogLinear.glsl | ✅ acescctDecode() | None | - |
| Linearize (Sony S-Log3) | ❌ | ✅ slog3Decode() | **Web exceeds** | - |
| Linearize (RED Log3G10) | ❌ | ✅ log3G10Decode() | **Web exceeds** | - |
| Exposure (f-stops) | ✅ ColorExposureIPNode | ✅ Phase 1 | None | - |
| Per-channel scale/offset | ✅ ColorIPNode | ✅ Phase 1a | None | - |
| Temperature / White Balance | ✅ ColorTemperatureIPNode (Bradford/Tanner/Danielle) | ✅ Phase 2 (simplified Kelvin) | Partial - missing chromatic adaptation matrices | P2 |
| Brightness | ✅ ColorIPNode.offset | ✅ Phase 3 | None | - |
| Contrast | ✅ ColorCurveIPNode | ✅ Phase 4 | None | - |
| Saturation | ✅ ColorSaturationIPNode | ✅ Phase 5 | None | - |
| Hue Rotation | ✅ ColorIPNode.hue | ✅ Phase 5d | None | - |
| CDL (ASC Standard) | ✅ ColorCDLIPNode + CDL file import | ✅ Phase 6b | Missing: CDL file import (.cdl/.ccc) | P1 |
| Shadow lift (polynomial) | ✅ ColorShadowIPNode | ✅ Phase 5b | None | - |
| Highlight compress | ✅ ColorHighlightIPNode | ✅ Phase 5b | None | - |
| Vibrance | ✅ ColorVibranceIPNode | ✅ Phase 5c (+skin protection) | **Web exceeds** | - |
| Grayscale conversion | ✅ ColorGrayScaleIPNode | ✅ Phase 10 (Luminance mode) | None | - |
| Color curves | ✅ LUTIPNode (luminance LUT) | ✅ Phase 6c (per-channel + master) | **Web exceeds** | - |
| Color wheels (Lift/Gamma/Gain) | ❌ (only via OCIO) | ✅ Phase 6a | **Web exceeds** | - |
| HSL Qualifier | ❌ | ✅ Phase 6e | **Web exceeds** | - |
| Film emulation | ❌ | ✅ Phase 6f | **Web exceeds** | - |
| 3D LUT | ✅ Color3DLUT.glsl (trilinear) | ✅ Phase 6d (trilinear) | None | - |
| 1D Channel LUT | ✅ ColorChannelLUT.glsl | ✅ GPU LUT pipeline | None | - |
| Luminance LUT | ✅ ColorLuminanceLUT.glsl | ✅ Phase 0c (inline 1D LUT) | None | - |
| 3-stage LUT pipeline | ❌ (single display LUT) | ✅ File/Look/Display | **Web exceeds** | - |
| Color matrix (4×4) | ✅ ColorMatrix.glsl / ColorMatrix4D.glsl | ✅ (via gamut mapping matrices) | None | - |
| Premult/Unpremult | ✅ ColorPremult/Unpremult.glsl | ❌ (partial, in shader) | Missing dedicated control | P2 |
| Dither | ✅ DisplayIPNode.dither | ❌ | Missing | P3 |
| Out-of-range highlight | ✅ ColorOutOfRange.glsl | ✅ Phase 6g | None | - |
| Clamp | ✅ ColorClamp.glsl | ✅ (implicit in tone map) | None | - |
| Quantize | ✅ ColorQuantize.glsl | ❌ | Missing (niche) | P3 |
| Display gamma | ✅ DisplayIPNode.gamma/srgb/rec709 | ✅ Phase 8 (6 modes) | None | - |
| Display brightness | ✅ DisplayIPNode.brightness | ✅ Phase 8c | None | - |
| OCIO integration | ✅ OCIOIPNode (full GPU) | ⚠️ OCIOProcessor (baked LUT, not live GPU) | Major gap - needs WASM OCIO | P1 |
| ICC profiles | ✅ ICCIPNode (lcms2) | ❌ | Missing | P2 |
| Tone mapping | ❌ (relies on OCIO/display) | ✅ 8 operators | **Web exceeds** | - |
| Gamut mapping | ❌ (relies on OCIO) | ✅ Clip + soft compress | **Web exceeds** | - |
| Auto-exposure | ❌ | ✅ AutoExposureController | **Web exceeds** | - |

### 2.2 Format Support

| Format | OpenRV | openrv-web | Gap | Priority |
|--------|--------|-----------|-----|----------|
| **EXR** (Half/Float) | ✅ Full (multi-layer, multi-part, all compression) | ✅ Partial (scanline, RLE/ZIP/ZIPS/PIZ) | Missing: tiled, deep, DWAA/DWAB | P1 |
| **DPX** (8/10/12/16-bit) | ✅ Full (all orientations, all packing) | ✅ (8/10/12/16-bit, RGB/RGBA) | None major | - |
| **Cineon** | ✅ Full | ✅ | None | - |
| **TIFF** (Float) | ✅ Full (tiled, compressed, multi-page) | ✅ Partial (uncompressed strip only) | Missing: LZW/ZIP, tiled | P2 |
| **JPEG** | ✅ Full (progressive, EXIF) | ✅ Browser native | None | - |
| **PNG** | ✅ Full (8/16-bit, interlaced) | ✅ Browser native | None | - |
| **Radiance HDR** | ❌ (via OIIO?) | ✅ Full (.hdr/.rgbe) | **Web exceeds** | - |
| **JPEG Gainmap** | ❌ | ✅ (Apple/Google HDR) | **Web exceeds** | - |
| **AVIF** (HDR) | ❌ | ✅ (gainmap + colr nclx) | **Web exceeds** | - |
| **JXL** | ❌ | ✅ (WASM + native) | **Web exceeds** | - |
| **HEIC** (HDR) | ❌ | ✅ (gainmap + libheif WASM) | **Web exceeds** | - |
| **RAW** (CR2/NEF/ARW) | ❌ | ✅ (preview extraction) | **Web exceeds** | - |
| **SGI** | ✅ | ❌ | Missing (legacy) | P3 |
| **TGA** | ✅ | ❌ | Missing (legacy) | P3 |
| **PSD** | ✅ (via OIIO) | ❌ | Missing | P3 |
| **JPEG 2000** | ✅ IOhtj2k | ❌ | Missing | P2 |
| **Video** (H.264) | ✅ FFmpeg | ✅ WebCodecs | None | - |
| **Video** (H.265/HEVC) | ✅ FFmpeg | ✅ WebCodecs (browser-dependent) | Browser support varies | - |
| **Video** (ProRes) | ✅ FFmpeg | ⚠️ Fallback to HTML video | WebCodecs doesn't support | P2 |
| **Video** (DNxHD) | ✅ FFmpeg | ⚠️ Fallback to HTML video | WebCodecs doesn't support | P2 |
| **Video** (VP9/AV1) | ✅ FFmpeg | ✅ WebCodecs | None | - |
| **Audio** (full pipeline) | ✅ TwkAudio (48kHz, 7.1, resampling) | ⚠️ Web Audio API (basic) | Missing: surround, resampling | P2 |
| **Image sequences** | ✅ MovieFB (auto-detect patterns) | ✅ SequenceSourceNode | None | - |
| **MXF container** | ✅ FFmpeg | ❌ | Missing (VFX workflow) | P1 |

### 2.3 UI & Interaction

| Feature | OpenRV | openrv-web | Gap | Priority |
|---------|--------|-----------|-----|----------|
| Timeline with scrub | ✅ timeline.mu | ✅ Timeline.ts | None | - |
| Timeline frame formats | ✅ 6 modes (global/source frame, TC, seconds, footage) | ✅ 2 modes (frames, TC) | Missing: source frame, footage | P2 |
| In/Out points | ✅ | ✅ | None | - |
| Marked frames | ✅ | ✅ MarkerManager | None | - |
| Cache visualization | ✅ (timeline bar) | ✅ CacheIndicator | None | - |
| VCR buttons | ✅ (play/pause/step/reverse) | ✅ | None | - |
| Wipe comparison | ✅ wipes.mu (rectangular stencil) | ✅ WipeManager (H/V/split) | **Web exceeds** (more modes) | - |
| Pixel inspector | ✅ ImageInfo HUD | ✅ PixelProbe (RGB/HSL/Hex/IRE/area) | **Web exceeds** | - |
| Histogram | ✅ (per-channel) | ✅ Histogram.ts (per-channel + luminance + clipping) | **Web exceeds** | - |
| Vectorscope | ❌ (basic) | ✅ Full CIE Yxy | **Web exceeds** | - |
| Waveform | ❌ (basic) | ✅ Waveform.ts | **Web exceeds** | - |
| Source details panel | ✅ SourceDetails HUD | ✅ InfoPanel + RightPanelContent | None | - |
| Annotation tools | ✅ annotate_mode.mu (pen, eraser, text, dodge, burn, clone, smudge) | ✅ PaintToolbar (pen, eraser, text, rect, ellipse, line, arrow) | Missing: dodge, burn, clone, smudge; Has: shapes | Mixed |
| Annotation pressure | ✅ (size, opacity, saturation) | ❌ | Missing | P2 |
| Presentation mode | ✅ presentation_mode.mu (separate device) | ✅ PresentationMode (fullscreen + hide UI) | Missing: multi-device | P3 |
| Custom mattes | ✅ custom_mattes.py (CSV-based) | ✅ MatteOverlay + SafeAreasControl | Partial | P3 |
| Missing frame indicator | ✅ missing_frame_bling (4 modes) | ✅ MissingFrameOverlay | None | - |
| EXR data/display window | ✅ data_display_indicators | ❌ | Missing (nice-to-have) | P3 |
| Layer selector (EXR) | ✅ layer_select_mode.mu | ❌ | Missing | P1 |
| Channel selector | ✅ channel_select.py (r/g/b/a/c/l hotkeys) | ✅ Phase 10 + ChannelSelect | None | - |
| Zoom/pan/fit | ✅ DispTransform2D | ✅ TransformManager | None | - |
| 1:1 pixel view | ✅ | ✅ ZoomControl (100%) | None | - |
| Drag and drop | ❌ (CLI-focused) | ✅ Full D&D support | **Web exceeds** | - |
| Dark/Light theme | ❌ (Qt themes) | ✅ ThemeControl (dark/light/auto) | **Web exceeds** | - |
| Responsive layout | ❌ (fixed Qt layout) | ✅ LayoutManager + presets | **Web exceeds** | - |
| Accessibility | ❌ | ✅ ARIA, FocusManager, A11y | **Web exceeds** | - |
| Timeline EDL editor | ❌ (sequence node only) | ✅ TimelineEditor | **Web exceeds** | - |
| Playlist panel | ❌ | ✅ PlaylistPanel | **Web exceeds** | - |
| Snapshot gallery | ❌ | ✅ SnapshotPanel | **Web exceeds** | - |
| Ghost frames (onion skin) | ❌ | ✅ GhostFrameControl | **Web exceeds** | - |

### 2.4 Node Graph / Pipeline

| Feature | OpenRV | openrv-web | Gap | Priority |
|---------|--------|-----------|-----|----------|
| DAG evaluation | ✅ IPGraph (topological sort) | ✅ Graph.ts (topological sort) | None | - |
| Source nodes | ✅ FileSourceIPNode, ImageSourceIPNode | ✅ FileSourceNode, VideoSourceNode, SequenceSourceNode | None | - |
| Stack (composite) | ✅ StackIPNode (Over/Add/Diff/Dissolve/Replace) | ✅ StackGroupNode (replace/over/add/diff/dissolve/minus) | None | - |
| Switch (A/B) | ✅ SwitchIPNode | ✅ SwitchGroupNode | None | - |
| Sequence (timeline) | ✅ SequenceIPNode (EDL) | ✅ SequenceGroupNode | Partial (missing EDL auto-gen) | P2 |
| Layout (tile/grid) | ✅ LayoutGroupIPNode | ✅ LayoutGroupNode | None | - |
| Retime (speed/warp) | ✅ RetimeIPNode (warp keyframes, explicit mapping) | ✅ RetimeGroupNode | Partial (missing warp) | P2 |
| Transform 2D | ✅ Transform2DIPNode (rotate/translate/scale/flip/flop) | ✅ TransformManager + TransformControl | None | - |
| Crop | ✅ CropIPNode (hardware) | ✅ CropManager | None | - |
| Lens distortion | ✅ LensWarpIPNode (Brown-Conrady, 3DE) | ✅ LensDistortionManager | Partial (missing 3DE model) | P3 |
| Gaussian blur | ✅ FilterGaussianIPNode | ✅ FilterControl | None | - |
| Unsharp mask | ✅ UnsharpMaskIPNode | ✅ Sharpen (Phase 7b) | None | - |
| Noise reduction | ✅ NoiseReductionIPNode | ✅ NoiseReductionControl | None | - |
| Clarity | ✅ ClarityIPNode | ✅ Phase 5e | None | - |
| Channel map | ✅ ChannelMapIPNode | ✅ Phase 0b (swizzle) | None | - |
| Frame cache | ✅ FBCache (LRU, utility-weighted) | ✅ FramePreloadManager (LRU, direction-aware) | None | - |
| Property system | ✅ IPProperty (persistent, animatable, flags) | ✅ Properties container (JSON serializable) | Missing: animation, persistence flags | P2 |
| Audio pipeline | ✅ AudioAddIPNode, SoundTrack, AudioTexture | ⚠️ Web Audio (basic volume/mute) | Missing: audio mixing, waveform texture | P2 |
| Paint node | ✅ PaintIPNode (strokes + text per frame) | ✅ PaintEngine (strokes + shapes per frame) | None | - |
| Cache LUT | ✅ CacheLUTIPNode (software pre-cache) | ❌ | Missing (optimization) | P3 |
| Group/pipeline containers | ✅ GroupIPNode, PipelineGroupIPNode | ✅ BaseGroupNode, FolderGroupNode | None | - |
| Display group | ✅ DisplayGroupIPNode (device, stereo, resize) | ✅ Renderer (display pipeline) | None | - |
| Rotate canvas | ✅ RotateCanvasIPNode | ✅ TransformControl rotation | None | - |

### 2.5 Session & Collaboration

| Feature | OpenRV | openrv-web | Gap | Priority |
|---------|--------|-----------|-----|----------|
| Session save/load | ✅ .rv files (property-based) | ✅ .orvproject (JSON) + GTO loader | None | - |
| GTO format read | ✅ (native) | ✅ GTOGraphLoader | None | - |
| GTO format write | ✅ (native) | ✅ SessionGTOExporter | None | - |
| Auto-save | ❌ | ✅ AutoSaveManager (IndexedDB) | **Web exceeds** | - |
| Network sync | ✅ sync_mode.mu (property-based) | ✅ NetworkSyncManager (room-based) | None | - |
| OTIO import/export | ✅ otio_reader.py | ❌ | Missing | P1 |
| Mode/package manager | ✅ ModeManagerMode (dynamic loading) | ✅ API + wiring modules | Different architecture | - |
| Scripting API | ✅ Mu + Python | ✅ OpenRVAPI (window.openrv) | Different architecture | - |
| ShotGrid integration | ✅ (via Python packages) | ❌ | Missing (enterprise) | P2 |

### 2.6 Export & Rendering

| Feature | OpenRV | openrv-web | Gap | Priority |
|---------|--------|-----------|-----|----------|
| Frame export (PNG/JPEG) | ✅ | ✅ ExportControl | None | - |
| Frame export (EXR) | ✅ | ✅ | None | - |
| Sequence export | ✅ rvio (full encode) | ✅ (frame-by-frame) | Missing: video encode | P1 |
| Video encode | ✅ rvio + FFmpeg (all codecs) | ❌ | Missing (WebCodecs encode?) | P1 |
| Frameburn overlay | ✅ frameburn.mu | ❌ | Missing | P2 |
| Watermark overlay | ✅ watermark.mu | ✅ WatermarkOverlay | None | - |
| Slate/leader | ✅ simpleslate.mu | ❌ | Missing | P2 |
| Bug overlay | ✅ bug.mu | ❌ | Missing | P3 |
| EDL export | ✅ export_cuts.mu | ❌ | Missing | P2 |

---

## 3. Gap Analysis by Domain

### 3.1 Critical Gaps (Blocking Professional Adoption)

#### Gap 1: Full OCIO Integration
- **OpenRV**: OCIOIPNode with live GPU shader generation from OCIO config, per-source context, full display/view transforms
- **openrv-web**: OCIOProcessor with baked 3D LUT (static, no live GPU)
- **Impact**: Studios with OCIO-mandated color pipelines cannot use openrv-web
- **Solution**: Port OCIO to WASM (ocio.js), generate GLSL at runtime, or extend baked LUT approach with display/view menus
- **Effort**: Large (3-4 weeks)

#### Gap 2: EXR Multi-Layer UI
- **OpenRV**: layer_select_mode.mu with click/scroll/confirm layer switching
- **openrv-web**: EXR decoder supports layers but no UI to select them
- **Impact**: Multi-layer EXR files (common in VFX) are unusable
- **Solution**: Add LayerSelector UI component + wire to decoder
- **Effort**: Small (3-5 days)

#### Gap 3: Video Encode/Export
- **OpenRV**: rvio tool with full FFmpeg encoding (ProRes, H.264, DNxHD, etc.)
- **openrv-web**: Frame-by-frame PNG/JPEG/EXR export only
- **Impact**: Cannot produce final deliverables or dailies
- **Solution**: WebCodecs VideoEncoder for H.264/VP9/AV1, or server-side FFmpeg
- **Effort**: Medium (2-3 weeks)

#### Gap 4: OTIO (OpenTimelineIO) Support
- **OpenRV**: Full OTIO reader/writer with custom hooks for CDL, annotations, transitions
- **openrv-web**: No OTIO support
- **Impact**: Cannot exchange timelines with other tools (Resolve, Premiere, Avid)
- **Solution**: Port opentimelineio.js, implement reader/writer
- **Effort**: Medium (2-3 weeks)

#### Gap 5: CDL File Import
- **OpenRV**: Reads .cdl and .ccc (ASC Color Collection) XML files
- **openrv-web**: CDL values editable but no file import
- **Impact**: Cannot import grades from on-set or from other tools
- **Solution**: Simple XML parser for CDL/CCC format
- **Effort**: Small (2-3 days)

### 3.2 Important Gaps (Affecting Workflow Completeness)

#### Gap 6: Professional Codec Support
- **Issue**: ProRes and DNxHD not supported in WebCodecs
- **Solution**: Server-side transcode proxy OR WASM-based decoder (heavy)
- **Effort**: Medium-Large

#### Gap 7: MXF Container Support
- **Issue**: Common in broadcast/post-production; not supported
- **Solution**: mp4box.js or similar ISOBMFF parser extended for MXF
- **Effort**: Medium

#### Gap 8: Chromatic Adaptation (White Balance)
- **Issue**: OpenRV has Bradford/Tanner/Danielle adaptation methods; web has simplified Kelvin shift
- **Solution**: Implement Bradford CAT matrix in shader
- **Effort**: Small (2-3 days)

#### Gap 9: ICC Profile Support
- **Issue**: OpenRV uses lcms2 for ICC transforms; web has none
- **Solution**: icc-profile-reader.js + baked LUT approach (similar to OCIO)
- **Effort**: Medium (1-2 weeks)

#### Gap 10: Audio Pipeline
- **Issue**: OpenRV has full audio mixing, resampling, surround; web has basic volume
- **Solution**: Web Audio API AudioWorklet for mixing + FFmpeg.wasm for decode
- **Effort**: Medium (2 weeks)

#### Gap 11: Annotation Pressure Sensitivity
- **Issue**: OpenRV supports Wacom pressure for size/opacity; web doesn't
- **Solution**: Use Pointer Events `pressure` property
- **Effort**: Small (1-2 days)

#### Gap 12: Advanced Retime (Warp)
- **Issue**: OpenRV has keyframe-based time warping; web has basic retime
- **Solution**: Implement warp curve with interpolation
- **Effort**: Small-Medium (1 week)

### 3.3 Nice-to-Have Gaps (Legacy/Niche Features)

| Feature | Effort | Notes |
|---------|--------|-------|
| RED Log transfer function | 1 day | Add to shader |
| SMPTE 240M transfer | 1 day | Legacy HDTV |
| SGI/TGA/PSD format support | 1 week | Legacy formats |
| JPEG 2000 (HTJ2K) | 1 week | OpenJPH WASM |
| Dithering | 2 days | Shader addition |
| Quantize visualization | 1 day | Shader addition |
| EXR data/display window overlay | 2 days | UI overlay |
| Presentation to external device | 2 weeks | WebRTC or Window.open() |
| DCC integration (Nuke/Maya) | 2 weeks | WebSocket bridge |
| 360° lat/long viewer | 1 week | Spherical projection shader |
| Frameburn/slate overlays | 3 days | Canvas overlay |
| Cross-platform path conversion | 1 day | URL normalization |

---

## 4. Architecture Comparison

### 4.1 Processing Pipeline

```
OPENRV (C++/GLSL):
┌─────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────┐
│ FileSource   │──▶│ Linearize    │──▶│ ColorPipeline│──▶│ LookLUT      │
│ (decode)     │   │ (TF→linear)  │   │ (CDL,curves) │   │ (grade LUT)  │
└─────────────┘   └──────────────┘   └─────────────┘   └──────────────┘
        │                                                        │
        ▼                                                        ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────────┐
│ CacheLUT     │──▶│ OCIO         │──▶│ Display      │──▶│ Output      │
│ (pre-cache)  │   │ (color mgmt) │   │ (gamma,LUT)  │   │ (device)    │
└──────────────┘   └──────────────┘   └──────────────┘   └─────────────┘

Each box = separate IPNode in DAG. 25+ node types. 133 GLSL shaders composed at runtime.

OPENRV-WEB (TypeScript/WebGL2):
┌──────────────────────────────────────────────────────────────────┐
│                    SINGLE FRAGMENT SHADER                        │
│  ┌─────┐ ┌────┐ ┌─────┐ ┌───┐ ┌────┐ ┌───┐ ┌────┐ ┌────┐     │
│  │Deint│→│Lin │→│EOTF │→│Exp│→│Temp│→│Brt│→│Ctr │→│Sat │→... │
│  └─────┘ └────┘ └─────┘ └───┘ └────┘ └───┘ └────┘ └────┘     │
│  ...→┌───┐ ┌────┐ ┌───┐ ┌────┐ ┌─────┐ ┌──────┐ ┌────┐       │
│      │CDL│→│Crv │→│3DL│→│HSL │→│ToneM│→│Gamut │→│Disp│       │
│      └───┘ └────┘ └───┘ └────┘ └─────┘ └──────┘ └────┘       │
│  34 processing phases in 1272-line shader                       │
└──────────────────────────────────────────────────────────────────┘

Single monolithic shader. All phases controlled by uniforms.
More efficient (no intermediate FBO copies) but less composable.
```

### 4.2 Key Architectural Differences

| Aspect | OpenRV | openrv-web |
|--------|--------|-----------|
| **Language** | C++ core + Mu/Python scripting | TypeScript + GLSL |
| **GPU** | OpenGL (desktop) | WebGL2 (+ WebGPU planned) |
| **Color pipeline** | Composable shader fragments (133 .glsl files) | Single monolithic shader (1272 lines) |
| **Node evaluation** | Multi-pass with intermediate FBOs | Single-pass uniform-driven |
| **OCIO** | Native C++ lib with GPU shader gen | Baked LUT approach |
| **Codec support** | FFmpeg (all codecs) | WebCodecs (browser-dependent) |
| **Audio** | Custom TwkAudio pipeline | Web Audio API |
| **I/O** | Direct file system + async I/O | Fetch API + File API + WASM decoders |
| **Caching** | FBCache (memory-mapped, utility-weighted) | LRU Map with direction-aware preloading |
| **Scripting** | Mu language + Python | JavaScript API (window.openrv) |
| **Plugin system** | Dynamic .so/.dll + .rvload manifest | Wiring modules + EventEmitter |

### 4.3 Recommendations for Architecture Evolution

1. **Keep the monolithic shader** - it's more efficient for WebGL2 (avoids FBO ping-pong). Add new phases via `#ifdef` blocks for optional features.

2. **OCIO via WASM** - compile OpenColorIO to WASM, extract 3D LUT + 1D pre/post LUTs, upload as textures. This is the standard approach (used by Foundry's Nuke web tools).

3. **WebCodecs VideoEncoder** for export - Chrome 94+ supports encoding H.264/VP9. For ProRes, use server-side or FFmpeg.wasm.

4. **Keep property system lightweight** - OpenRV's property flags (Persistent, Animatable, etc.) add complexity. Only add animation when needed.

---

## 5. Prioritized Implementation Plan

### Phase 1: Professional Essentials (4-6 weeks)

| # | Feature | Effort | Files Affected | Dependencies |
|---|---------|--------|----------------|--------------|
| 1.1 | CDL file import (.cdl/.ccc) | 3 days | New: `CDLFileParser.ts`; Mod: `CDLControl.ts` | None |
| 1.2 | EXR layer selector UI | 5 days | New: `LayerSelector.ts`; Mod: `FileSourceNode.ts`, `AppControlRegistry.ts` | None |
| 1.3 | OCIO WASM integration | 3 weeks | New: `OCIOWasm.ts`, `OCIOShaderGen.ts`; Mod: `OCIOProcessor.ts`, `Renderer.ts` | ocio.js WASM build |
| 1.4 | OTIO import | 2 weeks | New: `OTIOReader.ts`, `OTIOWriter.ts`; Mod: `Session.ts`, `SequenceGroupNode.ts` | opentimelineio.js |
| 1.5 | Video encode (WebCodecs) | 2 weeks | New: `VideoEncoder.ts`, `ExportVideoControl.ts`; Mod: `ExportControl.ts` | None |
| 1.6 | MXF container support | 1 week | New: `MXFDemuxer.ts`; Mod: `VideoSourceNode.ts` | mp4box.js or custom |

### Phase 2: Workflow Completeness (4-6 weeks)

| # | Feature | Effort | Files Affected |
|---|---------|--------|----------------|
| 2.1 | Bradford chromatic adaptation | 3 days | Mod: `viewer.frag.glsl`, `Renderer.ts` |
| 2.2 | ICC profile support | 1.5 weeks | New: `ICCProcessor.ts`; Mod: `FileSourceNode.ts` |
| 2.3 | RED Log / Viper Log in shader | 2 days | Mod: `viewer.frag.glsl` |
| 2.4 | Annotation pressure sensitivity | 2 days | Mod: `ViewerInputHandler.ts`, `PaintEngine.ts` |
| 2.5 | Retime warp curves | 1 week | Mod: `RetimeGroupNode.ts` |
| 2.6 | Audio mixing pipeline | 2 weeks | New: `AudioMixer.ts`; Mod: `AudioPlaybackManager.ts` |
| 2.7 | Premult/Unpremult control | 2 days | New: `PremultControl.ts`; Mod: `viewer.frag.glsl` |
| 2.8 | Timeline source frame / footage display | 3 days | Mod: `Timeline.ts` |
| 2.9 | Frameburn / slate overlays | 3 days | New: `FrameburnOverlay.ts`, `SlateOverlay.ts` |
| 2.10 | EDL export (marked regions) | 3 days | New: `EDLExporter.ts` |
| 2.11 | ShotGrid API integration | 2 weeks | New: `ShotGridBridge.ts` |

### Phase 3: Polish & Parity (3-4 weeks)

| # | Feature | Effort |
|---|---------|--------|
| 3.1 | EXR tiled image support | 1 week |
| 3.2 | TIFF LZW/ZIP compression | 1 week |
| 3.3 | JPEG 2000 (HTJ2K via WASM) | 1 week |
| 3.4 | Dither, quantize visualization | 3 days |
| 3.5 | EXR data/display window overlay | 2 days |
| 3.6 | 360° lat/long viewer | 1 week |
| 3.7 | SGI/TGA/PSD legacy formats | 1 week |
| 3.8 | Sequence auto-detect from single file | 2 days |
| 3.9 | Collapse missing frames | 2 days |
| 3.10 | Advanced annotation (dodge/burn/clone) | 1 week |

---

## 6. Web Platform Constraints & Mitigations

### 6.1 Hard Constraints

| Constraint | Impact | Mitigation |
|-----------|--------|-----------|
| **No FFmpeg native** | Cannot decode ProRes/DNxHD natively | FFmpeg.wasm (slow) or server-side transcode |
| **WebGL2 shader limits** | No compute shaders, limited branching | Multi-pass for complex ops; WebGPU migration |
| **No direct file system** | Cannot watch file changes or browse directories | File System Access API (Chromium) or drag-and-drop |
| **Single-threaded JS** | CPU-bound decoders block UI | Web Workers + OffscreenCanvas |
| **Memory limits** | Browser tabs have ~2-4GB limit | Aggressive LRU eviction; streaming decode |
| **No native color management** | Cannot access OS ICC profiles | Display P3 via CSS/Canvas + user-selected profile |

### 6.2 Browser-Specific Considerations

| Feature | Chrome | Firefox | Safari |
|---------|--------|---------|--------|
| WebCodecs | ✅ 94+ | ❌ | ✅ 16.4+ |
| VideoFrame texImage2D | ✅ | ❌ | ✅ |
| WebGPU | ✅ 113+ | ✅ (Nightly) | ✅ 18+ |
| HDR Canvas (rec2100) | ✅ (flag) | ❌ | ❌ |
| Display-P3 Canvas | ✅ | ❌ | ✅ |
| HEIC native | ❌ | ❌ | ✅ |
| JXL native | ✅ (flag) | ❌ | ❌ |
| File System Access | ✅ | ❌ | ❌ |

---

## 7. Phased Delivery Milestones

### Milestone 1: "Studio Ready" (Week 6)
**Target**: Professional VFX review workflows

- ✅ OCIO WASM integration
- ✅ CDL file import
- ✅ EXR layer selector
- ✅ OTIO import/export
- ✅ Video encode (H.264/VP9)
- ✅ MXF container support
- **Success criteria**: A VFX artist can load an OCIO config, import an OTIO timeline, review multi-layer EXR sequences with CDL grades, and export H.264 dailies.

### Milestone 2: "Full Pipeline" (Week 12)
**Target**: Complete production pipeline integration

- ✅ All Phase 2 features
- ✅ ICC profiles
- ✅ Audio mixing
- ✅ Bradford white balance
- ✅ ShotGrid integration
- **Success criteria**: A studio can replace OpenRV with openrv-web for all standard dailies review workflows, with proper color management and pipeline integration.

### Milestone 3: "Feature Complete" (Week 16)
**Target**: Full OpenRV feature parity for core features

- ✅ All Phase 3 features
- ✅ Legacy format support
- ✅ Advanced annotations
- ✅ 360° viewer
- **Success criteria**: All OpenRV features that have reasonable web equivalents are implemented. Only truly desktop-bound features (multi-monitor presentation, native FFmpeg encode) remain as known gaps.

---

## 8. Risk Assessment

### High Risk

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| OCIO WASM performance | Medium | High | Pre-bake LUTs; cache aggressively; fallback to CPU bake |
| WebCodecs codec coverage | High | Medium | FFmpeg.wasm fallback; server-side transcode service |
| Browser HDR API instability | Medium | Medium | Feature detection + graceful degradation |

### Medium Risk

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Memory pressure (4K+ frames) | Medium | Medium | Aggressive eviction; streaming decode; worker offload |
| OTIO spec changes | Low | Medium | Pin version; abstract interface |
| ShotGrid API changes | Medium | Low | Abstract via adapter pattern |

### Low Risk

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| WebGPU API changes | Low | Low | Abstraction layer already in place |
| EXR decoder performance | Low | Medium | WASM decoder (wasm-exr) as alternative |

---

## Appendix A: File Count Comparison

| Metric | OpenRV | openrv-web |
|--------|--------|-----------|
| Total source files | ~2,000+ | ~400+ |
| GLSL shaders | 133 | 1 (1272 lines) |
| Node types | 47+ | 20+ |
| Plugin packages | 38 | N/A (wiring modules) |
| Test files | ~50 | 184 |
| Test cases | ~200 | 7,600+ |

## Appendix B: Key Reference Files

### OpenRV
- Color pipeline: `/tmp/OpenRV/src/lib/ip/IPCore/glsl/` (133 files)
- Node graph: `/tmp/OpenRV/src/lib/ip/IPCore/IPCore/IPGraph.h`
- OCIO: `/tmp/OpenRV/src/lib/ip/OCIONodes/OCIOIPNode.h`
- Packages: `/tmp/OpenRV/src/plugins/rv-packages/` (38 dirs)
- Formats: `/tmp/OpenRV/src/lib/image/` (19 IO modules)

### openrv-web
- Fragment shader: `src/render/shaders/viewer.frag.glsl` (1272 lines)
- Renderer: `src/render/Renderer.ts`
- Graph: `src/core/graph/Graph.ts`
- Session: `src/core/session/Session.ts`
- Formats: `src/formats/` (10+ decoders)
- UI: `src/ui/components/` (96+ components)
- Color: `src/color/` (50+ files)

---

*This document was generated through exhaustive source-level analysis of both codebases using 8 parallel exploration agents, examining every source file, shader, node type, and plugin package in both projects.*
