# OpenRV → OpenRV-Web Feature Parity Plan

> **Generated**: 2026-02-18 | **Revision**: 3 (final, post 2 expert review laps)
> **Reference**: OpenRV (ASWF) `main` @ `HEAD`
> **Target**: openrv-web (`more-work` branch)
> **Method**: Exhaustive source-level analysis of both codebases (8 parallel deep-dive agents), 2 expert review laps (VFX Pipeline Expert + UX/QA Expert)

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
9. [Testing Strategy](#9-testing-strategy)
10. [Expert Review Notes](#10-expert-review-notes)

---

## 1. Executive Summary

### Current State

**OpenRV** (C++/Python/Mu/Qt) is a production-grade VFX review tool with 25+ years of evolution. It features 47+ node types, 133 GLSL shaders, 38 plugin packages, and support for 19+ image formats and all major video codecs via FFmpeg.

**openrv-web** (TypeScript/WebGL2) is a comprehensive browser-based viewer that already covers a significant portion of OpenRV's core functionality. It has 96+ UI components, a 1272-line fragment shader with 34 processing stages, 8 tone mapping operators, and modern HDR support (HLG/PQ/VideoFrame).

### Parity Score (Revised After Expert Review)

| Domain | OpenRV Features | openrv-web Has | Parity % | Notes |
|--------|----------------|----------------|----------|-------|
| **Color Pipeline** | 25 node types, 45+ shaders | 34 shader stages, CDL, curves, wheels | **75%** | CDL parsing exists; Bradford CAT exists |
| **Format Support** | 19+ image, FFmpeg video, 32-ch audio | 10+ image (inc. gainmap), WebCodecs video | **55%** | EXR DWAB critical gap |
| **UI/Interaction** | Timeline, HUD, wipes, annotations, presets | Timeline, all scopes, paint, wipes, comparison | **55%** | ⚠️ Revised down: missing notes, versions, status tracking |
| **Node Graph** | 47 node types, DAG eval, caching | 20+ nodes, DAG eval, frame cache | **60%** | |
| **Plugins/Packages** | 38 rv-packages (Mu/Python) | API + wiring modules | **30%** | |
| **Session/Collaboration** | .rv files, RV Sync network | .orvproject, NetworkSync, GTO loader | **50%** | OTIO import partially exists |
| **Review Workflow** | Notes, versions, status (via ShotGrid) | Paint annotations only | **15%** | ⚠️ Critical gap identified by UX/QA review |
| **Stereo 3D** | Full stereo pipeline (6 modes) | Stereo control + eye transforms | **60%** | Missing convergence tools |
| **Export/RVIO** | Full movie encode, leader/slate, frameburn | Frame export (PNG/JPEG/EXR/WebP), session save | **30%** | Frameburn for export critical |

**Overall Weighted Parity: ~45%** (revised from 58% — the earlier estimate overcounted technical features and undercounted review workflow completeness)

> **Key insight from expert review**: The plan previously conflated "viewer" with "review tool." A viewer displays images correctly. A review tool facilitates decision-making (notes, versions, status, reports). openrv-web is an excellent viewer but an incomplete review tool.

### Key Strengths of openrv-web (Beyond OpenRV)

openrv-web already has several features that **exceed** OpenRV:

- **8 tone mapping operators** (OpenRV has none built-in; relies on OCIO/display LUT) — *Note: these are approximations, not ACES-conformant implementations*
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
- **Bradford chromatic adaptation** already in `OCIOTransform.ts`
- **Per-source color space tracking** already in `OCIOProcessor.ts`
- **CDL file parsing + export** (parseCDLXML, parseCC, parseCCC, exportCDLXML already exist in `CDL.ts`)
- **OTIO import** already partially implemented (`OTIOParser.ts` + `PlaylistManager.fromOTIO()`)
- **Keyboard shortcut customization backend** (`CustomKeyBindingsManager.ts` with localStorage persistence, conflict detection, migration support)
- **EXR layer selector UI** (integrated in `ChannelSelect.ts` with dropdown, layer events, and channel remapping)
- **Annotation pressure sensitivity** (captured via PointerEvents in `ViewerInputHandler.ts`, used for width modulation in `PaintRenderer.ts`)
- **Timecode overlay** (`TimecodeOverlay.ts` with configurable SMPTE display)
- **Partial preferences persistence** (keyboard bindings, layout, theme, OCIO state, display transfer all use localStorage)

### Known Bugs Identified During Review

| Bug | Location | Severity | Description |
|-----|----------|----------|-------------|
| **CDL clamp destroys HDR (CPU path only)** | `src/color/CDL.ts` line 65 | High | CPU-side CDL clamps to [0,1] before power operation, destroying super-whites. GPU shader (line 1054) correctly uses `max(vec3(0.0))` = [0,∞). Affects pixel inspector readouts, CPU export, thumbnails. Also: `applySaturation()` clamps to [0,255] (line 98-100) |
| **Tone mapper accuracy** | `src/render/shaders/viewer.frag.glsl` | Medium | ACES tone mappers are approximations (e.g., Narkowicz fit), not conformant ACES RRT+ODT. Should be documented; consider adding ACES ODT selection |

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
| Linearize (RED Log) | ✅ ColorRedLogLinear.glsl | ✅ log3G10Decode() | None | - |
| Linearize (Viper Log) | ✅ ColorViperLogLinear.glsl | ✅ viperLogToLinear() | None | - |
| Linearize (SMPTE 240M) | ✅ ColorSMPTE240MLinear.glsl | ❌ | Missing (legacy) | P3 |
| Linearize (ACES Log) | ✅ ColorACESLogLinear.glsl | ✅ acescctDecode() | None | - |
| Linearize (Sony S-Log3) | ❌ | ✅ slog3Decode() | **Web exceeds** | - |
| Linearize (RED Log3G10) | ❌ | ✅ log3G10Decode() | **Web exceeds** | - |
| Exposure (f-stops) | ✅ ColorExposureIPNode | ✅ Phase 1 | None | - |
| Per-channel scale/offset | ✅ ColorIPNode | ✅ Phase 1a | None | - |
| Temperature / White Balance | ✅ ColorTemperatureIPNode (Bradford) | ✅ Phase 2 + Bradford CAT in OCIOTransform.ts | None (already implemented) | - |
| Brightness | ✅ ColorIPNode.offset | ✅ Phase 3 | None | - |
| Contrast | ✅ ColorCurveIPNode | ✅ Phase 4 | None | - |
| Saturation | ✅ ColorSaturationIPNode | ✅ Phase 5 | None | - |
| Hue Rotation | ✅ ColorIPNode.hue | ✅ Phase 5d | None | - |
| CDL (ASC Standard) | ✅ ColorCDLIPNode + CDL file import/export | ✅ Phase 6b + parseCDLXML/parseCC/parseCCC + exportCDLXML | **CPU clamp bug** (GPU path correct); import+export exist | P1 (bug fix) |
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
| OCIO display/view menus | ✅ ocio_source_setup.py | ❌ | Missing (can add with baked LUT approach first) | P1 |
| ACES ODT selection | ✅ (via OCIO views) | ❌ | Missing | P1 |
| ICC profiles | ✅ ICCIPNode (lcms2) | ❌ | Missing | P3 |
| Tone mapping | ❌ (relies on OCIO/display) | ✅ 8 operators (approximations) | **Web exceeds** | - |
| Gamut mapping | ❌ (relies on OCIO) | ✅ Clip + soft compress | **Web exceeds** | - |
| Auto-exposure | ❌ | ✅ AutoExposureController | **Web exceeds** | - |
| Negative display | ✅ | ❌ | Missing | P2 |
| Baked LUT resolution | 33³ typical | Needs 65³ for ACES | Should default to 65³ for ACES transforms | P1 |

### 2.2 Format Support

| Format | OpenRV | openrv-web | Gap | Priority |
|--------|--------|-----------|-----|----------|
| **EXR** (Half/Float) | ✅ Full (multi-layer, multi-part, all compression) | ✅ Partial (scanline, RLE/ZIP/ZIPS/PIZ) | Missing: tiled, deep, **DWAB** | P1 |
| **EXR DWAB compression** | ✅ | ❌ | **Critical**: Used by ILM, Weta, major studios | **P1** |
| **EXR multi-view** (stereo) | ✅ | ❌ | Missing for stereo review | P2 |
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
| **SGI** | ✅ | ❌ | Missing (legacy) | Drop |
| **TGA** | ✅ | ❌ | Missing (legacy) | Drop |
| **PSD** | ✅ (via OIIO) | ❌ | Missing | Drop |
| **JPEG 2000** | ✅ IOhtj2k | ❌ | Missing | P2 |
| **Video** (H.264) | ✅ FFmpeg | ✅ WebCodecs | None | - |
| **Video** (H.265/HEVC) | ✅ FFmpeg | ✅ WebCodecs (browser-dependent) | Browser support varies | - |
| **Video** (ProRes) | ✅ FFmpeg | ⚠️ Fallback to HTML video | WebCodecs doesn't support | P2 |
| **Video** (DNxHD) | ✅ FFmpeg | ⚠️ Fallback to HTML video | WebCodecs doesn't support | P2 |
| **Video** (VP9/AV1) | ✅ FFmpeg | ✅ WebCodecs | None | - |
| **Audio** (full pipeline) | ✅ TwkAudio (48kHz, 7.1, resampling) | ⚠️ Web Audio API (basic) | Missing: surround, resampling | P3 |
| **Image sequences** | ✅ MovieFB (auto-detect patterns) | ✅ SequenceSourceNode | None | - |
| **MXF container** | ✅ FFmpeg | ❌ | Missing | P2 |

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
| **Quad view comparison** | ✅ (layout grid + per-source) | ❌ | Missing: A/B/C/D simultaneous compare | P1 |
| Pixel inspector | ✅ ImageInfo HUD | ✅ PixelProbe (RGB/HSL/Hex/IRE/area) | **Web exceeds** | - |
| Histogram | ✅ (per-channel) | ✅ Histogram.ts (per-channel + luminance + clipping) | **Web exceeds** | - |
| Vectorscope | ❌ (basic) | ✅ Full CIE Yxy | **Web exceeds** | - |
| Waveform | ❌ (basic) | ✅ Waveform.ts | **Web exceeds** | - |
| Source details panel | ✅ SourceDetails HUD | ✅ InfoPanel + RightPanelContent | None | - |
| Annotation tools | ✅ annotate_mode.mu (pen, eraser, text, dodge, burn, clone, smudge) | ✅ PaintToolbar (pen, eraser, text, rect, ellipse, line, arrow) | Missing: dodge, burn, clone, smudge; Has: shapes | Mixed |
| Annotation pressure | ✅ (size, opacity, saturation) | ✅ Partial (size via PointerEvent pressure) | Missing: opacity/saturation pressure mapping | P2 |
| **Note/Comment system** | ✅ (via ShotGrid/scripting) | ❌ | **Critical gap**: No text notes, comment threads, or status | **P0** |
| **Version management** | ✅ (via ShotGrid/scripting) | ❌ | **Critical gap**: No multi-version concept | **P0** |
| **Shot status tracking** | ✅ (via ShotGrid + UI) | ❌ | **Critical gap**: No approved/needs-work/pending | **P1** |
| Presentation mode | ✅ presentation_mode.mu (separate device) | ✅ PresentationMode (fullscreen + hide UI) | Missing: multi-device, locked-down client mode | P2 |
| Custom mattes | ✅ custom_mattes.py (CSV-based) | ✅ MatteOverlay + SafeAreasControl | Partial | P3 |
| Missing frame indicator | ✅ missing_frame_bling (4 modes) | ✅ MissingFrameOverlay | None | - |
| EXR data/display window | ✅ data_display_indicators | ❌ | Missing (nice-to-have) | P3 |
| Layer selector (EXR) | ✅ layer_select_mode.mu | ✅ ChannelSelect.ts (integrated layer dropdown) | None | - |
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
| **Keyboard shortcut customization** | ✅ (configurable) | ✅ CustomKeyBindingsManager (backend + localStorage) | Missing: UI editor only (`ShortcutEditor.ts`) | P2 |
| **Preferences persistence** | ✅ (config files) | ✅ Partial (keybindings, layout, theme, OCIO, display via localStorage) | Missing: unified prefs API, color defaults, export settings | P2 |
| **Session URL sharing** | ❌ | ❌ | Missing (natural web capability) | P2 |
| **Shortcut cheat sheet / help overlay** | ✅ | ❌ | Missing | P2 |

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
| Audio pipeline | ✅ AudioAddIPNode, SoundTrack, AudioTexture | ⚠️ Web Audio (basic volume/mute) | Missing: audio mixing, waveform texture | P3 |
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
| Network sync | ✅ sync_mode.mu (property-based) | ✅ NetworkSyncManager (room-based) | Partial: missing cursor sharing, annotation sync, conflict resolution | P2 |
| OTIO import | ✅ otio_reader.py | ✅ OTIOParser.ts + PlaylistManager.fromOTIO() | **Exists** (needs multi-track, transitions) | P2 |
| OTIO export | ✅ otio_reader.py | ❌ | Missing | P1 |
| OTIO transition rendering | ✅ | ❌ | Missing (dissolves, wipes between clips) | P2 |
| Mode/package manager | ✅ ModeManagerMode (dynamic loading) | ✅ API + wiring modules | Different architecture | - |
| Scripting API | ✅ Mu + Python | ✅ OpenRVAPI (window.openrv) | Different architecture | - |
| ShotGrid integration | ✅ (via Python packages) | ❌ | Missing (enterprise) | P1 |

### 2.6 Export & Rendering

| Feature | OpenRV | openrv-web | Gap | Priority |
|---------|--------|-----------|-----|----------|
| Frame export (PNG/JPEG) | ✅ | ✅ ExportControl | None | - |
| Frame export (EXR) | ✅ | ✅ | None | - |
| Sequence export | ✅ rvio (full encode) | ✅ (frame-by-frame) | Missing: video encode | P1 |
| Video encode | ✅ rvio + FFmpeg (all codecs) | ❌ | Missing (WebCodecs encode?) | P1 |
| **Frameburn in export** | ✅ frameburn.mu | ❌ | **Critical for client deliverables** | **P1** |
| Watermark overlay | ✅ watermark.mu | ✅ WatermarkOverlay | None | - |
| Slate/leader | ✅ simpleslate.mu | ❌ | Missing (1-2 weeks effort, not 3 days) | P2 |
| Bug overlay | ✅ bug.mu | ❌ | Missing | P3 |
| EDL export | ✅ export_cuts.mu | ❌ | Missing | P2 |
| CDL export | ✅ | ✅ exportCDLXML() in CDL.ts | None (already exists) | - |
| **Annotated frame export** | ❌ | ❌ | Missing (export annotated PNG/PDF) | P2 |
| **Dailies report export** | ✅ (via ShotGrid) | ❌ | Missing (shot, status, notes, TC report) | P1 |

### 2.7 Stereo 3D

| Feature | OpenRV | openrv-web | Gap | Priority |
|---------|--------|-----------|-----|----------|
| Side-by-side / over-under | ✅ | ✅ StereoControl | None | - |
| Anaglyph | ✅ | ✅ | None | - |
| Per-eye transforms | ✅ | ✅ | None | - |
| Convergence measurement | ✅ | ❌ | Missing (pixel disparity readout) | P2 |
| Per-eye annotations | ✅ | ❌ | Missing (annotations per eye) | P2 |
| Floating window violation | ✅ | ❌ | Missing (standard stereo QC check) | P2 |
| Multi-view EXR | ✅ | ❌ | Missing for stereo review | P2 |

---

## 3. Gap Analysis by Domain

### 3.1 Critical Gaps (P0 — Blocking "Review Tool" Identity)

#### Gap 1: Note/Comment System
- **OpenRV**: Has per-shot text notes via ShotGrid integration and scripting hooks
- **openrv-web**: Only has paint annotations (draw on frames) — no text-based notes
- **Impact**: Without notes, the tool is a viewer, not a review tool. A supervisor reviewing 40 shots needs to type text notes and tag status, not draw circles.
- **Solution**: Per-frame/range text comments with threads, status (open/resolved), export (CSV/ShotGrid-compatible), @ mentions for collaboration mode
- **Effort**: 2 weeks

#### Gap 2: Version Management
- **OpenRV**: Version concept via ShotGrid and scripting API
- **openrv-web**: No concept of "versions" — a source is loaded, but cannot associate v1/v2/v3 of same shot
- **Impact**: Comparing versions is THE core use case of a review tool. VFX supervisors compare v3 vs v2 vs v1 of the same shot routinely.
- **Solution**: Version data model (associate media files as versions of a shot), nav between versions, carry annotations forward, version metadata display
- **Effort**: 1.5 weeks

### 3.2 Critical Gaps (P1 — Blocking Professional Adoption)

#### Gap 3: Full OCIO Integration
- **OpenRV**: OCIOIPNode with live GPU shader generation from OCIO config, per-source context, full display/view transforms
- **openrv-web**: OCIOProcessor with baked 3D LUT (static, no live GPU). Per-source tracking already exists.
- **Impact**: Studios with OCIO-mandated color pipelines cannot use openrv-web
- **Solution**: Two-phase approach:
  - Phase A (1 week): Add OCIO display/view dropdown menus using existing baked LUT approach with 65³ resolution for ACES transforms. This covers 80% of use cases.
  - Phase B (6-10 weeks): Port OCIO to WASM (ocio.js), generate GLSL at runtime for full live GPU pipeline. **Note**: Effort revised upward from 3 weeks per VFX Pipeline Expert — WASM build, shader gen, and GPU integration are complex.
- **Effort**: 1 week (Phase A) + 6-10 weeks (Phase B)

#### Gap 4: CDL CPU Clamp Bug Fix
- **OpenRV**: ASC-compliant CDL processing
- **openrv-web**: Full CDL pipeline exists (parseCDLXML, parseCC, parseCCC, exportCDLXML), but CPU-side clamps to [0,1] before power — destroying HDR super-whites. GPU shader path is correct. Also `applySaturation()` clamps to [0,255].
- **Impact**: Pixel inspector readouts, CPU-based export, and thumbnail generation show wrong values for HDR content. On-screen GPU rendering is correct.
- **Solution**: Fix `CDL.ts` line 65: change `clamp(v, 0, 1)` to `Math.max(v, 0)`. Fix `applySaturation()` clamp range for HDR.
- **Effort**: 1-2 days

#### Gap 5: EXR DWAB Compression
- **OpenRV**: Full EXR support including all compression
- **openrv-web**: EXR decoder supports multi-layer with UI (ChannelSelect.ts has integrated layer selector dropdown). DWAB compression not supported (NONE/RLE/ZIP/ZIPS/PIZ only).
- **Impact**: DWAB is used by ILM, Weta, and major studios — critical for studio adoption
- **Solution**: DWAB decompression (WASM or JS port of blosc)
- **Effort**: 1 week

#### Gap 6: Video Encode/Export with Frameburn
- **OpenRV**: rvio tool with full FFmpeg encoding, frameburn overlay, leader/slate
- **openrv-web**: Frame-by-frame PNG/JPEG/EXR export only
- **Impact**: Cannot produce dailies deliverables — clients need H.264 with burned-in timecode
- **Solution**: WebCodecs VideoEncoder for H.264/VP9/AV1, with canvas overlay compositing for frameburn during encode
- **Effort**: 3 weeks (includes frameburn compositing)

#### Gap 7: Shot Status Tracking
- **OpenRV**: Per-shot status via ShotGrid integration
- **openrv-web**: No status concept
- **Impact**: Direct output of every dailies session. Without it, supervisors must track status externally.
- **Solution**: Status model (approved/needs-work/CBB/pending), keyboard shortcuts for quick tagging, status column in playlist, report export
- **Effort**: 1 week

#### Gap 8: OTIO Export
- **OpenRV**: Full OTIO reader/writer
- **openrv-web**: OTIO import exists (OTIOParser.ts + PlaylistManager.fromOTIO()), **export missing**
- **Impact**: Cannot exchange timelines bidirectionally with Resolve, Premiere, Avid
- **Solution**: OTIOWriter.ts generating Timeline.1 JSON
- **Effort**: 1 week

#### Gap 9: ShotGrid Integration
- **OpenRV**: Native ShotGrid integration via Python packages
- **openrv-web**: No ShotGrid support
- **Impact**: ShotGrid is the primary pipeline integration for most VFX studios
- **Solution**: ShotGrid REST API bridge, shot/version loading, status sync, note push
- **Effort**: 2 weeks

#### Gap 10: Keyboard Shortcut Editor UI
- **OpenRV**: Configurable keyboard shortcuts with UI
- **openrv-web**: Backend fully implemented — `CustomKeyBindingsManager.ts` has localStorage persistence, `setCustomBinding()`, `findConflictingAction()` for conflict detection, `resetAll()`, and data migration. **Missing: UI editor component only.** Also has context collisions in defaults (KeyR: timeline.resetInOut vs paint.rectangle; KeyO: timeline.setOutPoint vs paint.ellipse; KeyG: panel.gamutDiagram vs paint.toggleGhost; Shift+KeyR: transform.rotateLeft vs channel.red). No context scoping mechanism.
- **Impact**: Users can't discover or change shortcuts without editing code
- **Solution**: `ShortcutEditor.ts` UI component + context scoping annotations for default bindings
- **Effort**: 2-3 days (UI editor) + 2 days (context scoping)

#### Gap 11: Unified Preferences API
- **OpenRV**: Config files per-user
- **openrv-web**: Partial persistence exists — keybindings (`CustomKeyBindingsManager`), layout (`LayoutStore`), theme (`ThemeManager`), OCIO state (`OCIOStateManager`), and display transfer all use localStorage independently. Missing: unified preferences API, color defaults, export settings.
- **Impact**: Inconsistent persistence — some settings survive refresh, others don't
- **Solution**: Unified `PreferencesManager.ts` wrapping existing localStorage subsystems + adding color/export defaults
- **Effort**: 2 days

#### Gap 12: Annotation Pressure Mapping (Opacity/Saturation)
- **OpenRV**: Wacom pressure mapped to size, opacity, and saturation
- **openrv-web**: Pressure size modulation already works — `ViewerInputHandler.ts` captures `e.pressure`, `PaintRenderer.ts` uses `p.pressure ?? 1` for width. Missing: pressure-to-opacity mapping, pressure-to-saturation mapping, UI controls for pressure sensitivity curves.
- **Impact**: Pressure drawing works for size but feels incomplete without opacity variation
- **Solution**: Add opacity/saturation pressure mapping to `PaintRenderer.ts`, add sensitivity curve UI
- **Effort**: 1 day

### 3.3 Important Gaps (P2 — Affecting Workflow Completeness)

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 13 | Quad view comparison (A/B/C/D) | 1 week | VFX supervisors compare 4 versions in 2x2 grid |
| 14 | OTIO multi-track support | 1 week | Current parser extracts first video track only |
| 15 | OTIO transition rendering | 1 week | Dissolves, wipes between clips |
| 16 | Conform/re-link UI | 1 week | Manual media re-linking when auto-resolve fails |
| 17 | Premult/Unpremult control | 2 days | Dedicated UI control |
| 18 | Retime warp curves | 1 week | Keyframe-based time warping |
| 19 | Negative display | 2 days | Film negative preview |
| 20 | Slate/leader for export | 1-2 weeks | More complex than overlay — needs text layout engine |
| 21 | Stereo convergence tools | 1 week | Pixel disparity readout, min/max display |
| 22 | Multi-view EXR (stereo) | 5 days | EXR views for L/R eye |
| 23 | Session URL sharing | 1 week | Natural web capability for async review |
| 24 | Collaboration enhancements | 2 weeks | Cursor sharing, annotation sync, conflict resolution, participant permissions |
| 25 | Reference image workflow | 1 week | Persistent reference that survives shot changes |
| 26 | Annotated frame/PDF export | 3 days | Export annotated screenshots |
| 27 | Timeline source frame / footage display | 3 days | Additional timeline frame formats |
| 28 | Shortcut cheat sheet overlay | 2 days | On-screen contextual help |
| 29 | Client-safe locked UI mode | 3 days | View-only mode for client presentations |
| 30 | MXF container support | 1 week | Broadcast/post-production |
| 31 | JPEG 2000 (HTJ2K) | 1 week | OpenJPH WASM |
| 32 | ICC profile support | 1.5 weeks | Relevant for print/design, not core VFX |

### 3.4 Nice-to-Have (P3 — Legacy/Niche Features)

| Feature | Effort | Notes |
|---------|--------|-------|
| SMPTE 240M transfer | 1 day | Legacy HDTV |
| Dithering | 2 days | Shader addition |
| Quantize visualization | 1 day | Shader addition |
| EXR data/display window overlay | 2 days | UI overlay |
| Presentation to external device | 2 weeks | WebRTC or Window.open() |
| DCC integration (Nuke/Maya) | 2 weeks | WebSocket bridge |
| 360° lat/long viewer | 1 week | Spherical projection shader |
| Audio mixing pipeline | 2 weeks | Audio mixing is not a review tool's job |
| Advanced annotation (dodge/burn/clone) | 1 week | Niche paint tools |
| Frame range handles | 3 days | Tail handles for editorial |
| ProRes/DNxHD (WASM decode) | 2 weeks | Server-side transcode preferred |

### 3.5 Dropped (Not Worth Implementation)

| Feature | Reason |
|---------|--------|
| SGI format | Archival, no active use |
| TGA format | Archival, studios have migrated |
| PSD format | Not a review format |

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
Users can reorder processing operations.

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
More efficient (no intermediate FBO copies) but FIXED processing order.
```

### 4.2 Key Architectural Differences

| Aspect | OpenRV | openrv-web |
|--------|--------|-----------|
| **Language** | C++ core + Mu/Python scripting | TypeScript + GLSL |
| **GPU** | OpenGL (desktop) | WebGL2 (+ WebGPU planned) |
| **Color pipeline** | Composable shader fragments (133 .glsl files) | Single monolithic shader (1272 lines) |
| **Processing order** | User-reorderable (node-based) | Fixed (uniform-driven) |
| **Node evaluation** | Multi-pass with intermediate FBOs | Single-pass uniform-driven |
| **OCIO** | Native C++ lib with GPU shader gen | Baked LUT approach |
| **Codec support** | FFmpeg (all codecs) | WebCodecs (browser-dependent) |
| **Audio** | Custom TwkAudio pipeline | Web Audio API |
| **I/O** | Direct file system + async I/O | Fetch API + File API + WASM decoders |
| **Caching** | FBCache (memory-mapped, utility-weighted) | LRU Map with direction-aware preloading |
| **Scripting** | Mu language + Python | JavaScript API (window.openrv) |
| **Plugin system** | Dynamic .so/.dll + .rvload manifest | Wiring modules + EventEmitter |

### 4.3 Recommendations for Architecture Evolution

1. **Keep the monolithic shader** - it's more efficient for WebGL2 (avoids FBO ping-pong). Add new phases via `#ifdef` blocks for optional features. **Caveat**: The fixed processing order means colorists cannot reorder operations. This is a known limitation; document it clearly.

2. **OCIO via two phases**:
   - **Phase A**: Add display/view dropdown menus using existing baked LUT approach with **65³ resolution** (not 33³) for ACES transforms. This covers 80% of use cases.
   - **Phase B**: Compile OpenColorIO to WASM, extract 3D LUT + 1D pre/post LUTs, upload as textures. **Warning**: OCIO WASM integration into the monolithic shader is architecturally tricky — injecting generated GLSL risks breaking all 34 existing phases. Consider multi-pass for OCIO specifically.

3. **WebCodecs VideoEncoder** for export - Chrome 94+ supports encoding H.264/VP9. For ProRes, use server-side or FFmpeg.wasm. **Must include overlay compositing** for frameburn/timecode/watermark during encode.

4. **Keep property system lightweight** - OpenRV's property flags (Persistent, Animatable, etc.) add complexity. Only add animation when needed.

5. **Grade stack visualization** - While keeping the monolithic shader, add a UI showing the current processing order and which phases are active. This helps colorists understand what's happening even if they can't reorder.

---

## 5. Prioritized Implementation Plan

### Phase 1: Review Workflow Essentials (4-6 weeks)

> **Goal**: Deliver a usable review tool, not just a viewer. A tool that plays fewer formats but enables actual review decisions will see adoption.
>
> **Note**: Several items from the initial plan already exist (EXR layer selector, CDL export, keyboard customization backend, pressure sensitivity, timecode overlay, partial preferences). Phase 1 has been tightened accordingly.

| # | Feature | Effort | Files Affected | Dependencies |
|---|---------|--------|----------------|--------------|
| 1.1 | **Note/Comment system** | 2 weeks | New: `NoteManager.ts`, `NotePanel.ts`, `NoteOverlay.ts`; Mod: `SessionState.ts` (schema v2 migration) | None |
| 1.2 | **Version management** | 1.5 weeks | New: `VersionManager.ts`, `VersionNavigator.ts`; Mod: `PlaylistManager.ts`, `SessionState.ts` | None |
| 1.3 | **CDL CPU clamp bug fix** | 1-2 days | Mod: `CDL.ts` (line 65: `clamp(v,0,1)` → `Math.max(v,0)`; line 98-100: fix saturation clamp) | None |
| 1.4 | **Shot status tracking** | 1 week | New: `StatusManager.ts`, `StatusColumn.ts`; Mod: `PlaylistManager.ts`, `SessionState.ts` | 1.1 |
| 1.5 | **OCIO display/view menus (baked LUT)** | 1 week | Mod: `OCIOProcessor.ts`, `Renderer.ts`; New: `OCIOMenus.ts` | None |
| 1.6 | **Frameburn export compositing** | 3-5 days | New: `FrameburnCompositor.ts` (display overlay exists via `TimecodeOverlay.ts`) | None |
| 1.7 | **Shot-to-shot navigation** | 2-3 days | Mod: `PlaylistManager.ts`, `KeyBindings.ts` (PageUp/PageDown for shot jump vs frame step) | None |
| 1.8 | **EXR DWAB compression** | 1 week | Mod: `EXRDecoder.ts` or New WASM blosc decoder | None |
| 1.9 | **Dailies report export** | 3-5 days | New: `ReportExporter.ts` (CSV/PDF with shot, status, notes, timecode) | 1.1, 1.4 |
| 1.10 | **Unified preferences API** | 2 days | New: `PreferencesManager.ts` (wrapping existing localStorage subsystems) | None |

### Phase 2: Professional Pipeline Integration (6-8 weeks)

| # | Feature | Effort | Files Affected |
|---|---------|--------|----------------|
| 2.1 | **Video encode (WebCodecs)** with progress/cancel | 2 weeks | New: `VideoEncoder.ts`, `ExportVideoControl.ts`, `ExportProgress.ts` |
| 2.2 | **OTIO export** | 1 week | New: `OTIOWriter.ts` |
| 2.3 | **ShotGrid API integration** | 2 weeks | New: `ShotGridBridge.ts` |
| 2.4 | **Session URL sharing** | 1 week | New: `SessionURLManager.ts` (web differentiator vs desktop OpenRV) |
| 2.5 | **Quad view comparison** | 1 week | Mod: `ComparisonManager.ts`, `LayoutGroupNode.ts` |
| 2.6 | **Shortcut editor UI** | 2-3 days | New: `ShortcutEditor.ts` (backend already exists in `CustomKeyBindingsManager.ts`) |
| 2.7 | **OTIO transitions + multi-track** | 2 weeks | Mod: `OTIOParser.ts`, `SequenceGroupNode.ts` |
| 2.8 | **Conform/re-link UI** | 1 week | New: `ConformPanel.ts` |
| 2.9 | **Slate/leader for export** | 1-2 weeks | New: `SlateOverlay.ts`, `SlateEditor.ts` |
| 2.10 | **Collaboration enhancements** | 2 weeks | Mod: `NetworkSyncManager.ts` (cursor, annotation sync, conflict resolution, participant list) |
| 2.11 | **Pressure opacity/saturation mapping** | 1 day | Mod: `PaintRenderer.ts` (size mapping already works) |
| 2.12 | **Stereo convergence tools** | 1 week | New: `ConvergenceMeasure.ts` |
| 2.13 | **OCIO WASM full integration** | 6-10 weeks | New: `OCIOWasm.ts`, `OCIOShaderGen.ts`; Mod: `OCIOProcessor.ts`, `Renderer.ts` |

### Phase 3: Polish & Full Parity (4-6 weeks)

| # | Feature | Effort |
|---|---------|--------|
| 3.1 | EXR tiled image support | 1 week |
| 3.2 | TIFF LZW/ZIP compression | 1 week |
| 3.3 | JPEG 2000 (HTJ2K via WASM) | 1 week |
| 3.4 | MXF container support | 1 week |
| 3.5 | Multi-view EXR (stereo) | 5 days |
| 3.6 | Premult/Unpremult control | 2 days |
| 3.7 | Retime warp curves | 1 week |
| 3.8 | Negative display | 2 days |
| 3.9 | Dither, quantize visualization | 3 days |
| 3.10 | Shortcut cheat sheet overlay | 2 days |
| 3.11 | Client-safe locked UI mode | 3 days |
| 3.12 | Reference image workflow | 1 week |
| 3.13 | Annotated frame/PDF export | 3 days |
| 3.14 | EDL export | 3 days |

---

## 6. Web Platform Constraints & Mitigations

### 6.1 Hard Constraints

| Constraint | Impact | Mitigation |
|-----------|--------|-----------|
| **No FFmpeg native** | Cannot decode ProRes/DNxHD natively | Server-side transcode preferred; FFmpeg.wasm as fallback (slow) |
| **WebGL2 shader limits** | No compute shaders, limited branching | Multi-pass for complex ops; WebGPU migration |
| **No direct file system** | Cannot watch file changes or browse directories | File System Access API (Chromium) or drag-and-drop |
| **Single-threaded JS** | CPU-bound decoders block UI | Web Workers + OffscreenCanvas |
| **Memory limits** | Browser tabs have ~2-4GB limit | Aggressive LRU eviction; streaming decode |
| **No native color management** | Cannot access OS ICC profiles | Display P3 via CSS/Canvas + user-selected profile |
| **Fixed shader pipeline** | Cannot reorder color operations | Document limitation; show processing order in UI |

### 6.2 Browser-Specific Considerations

| Feature | Chrome | Firefox | Safari | Min Version |
|---------|--------|---------|--------|-------------|
| WebCodecs | ✅ 94+ | ❌ | ✅ 16.4+ | Chrome 94 |
| VideoFrame texImage2D | ✅ | ❌ | ✅ | Chrome 94 |
| WebGPU | ✅ 113+ | ✅ (Nightly) | ✅ 18+ | Chrome 113 |
| HDR Canvas (rec2100) | ✅ (flag) | ❌ | ❌ | Chrome only |
| Display-P3 Canvas | ✅ | ❌ | ✅ | Chrome/Safari |
| HEIC native | ❌ | ❌ | ✅ | Safari only |
| JXL native | ✅ (flag) | ❌ | ❌ | Chrome only |
| File System Access | ✅ | ❌ | ❌ | Chrome only |

> **Browser support policy**: Chrome is the primary target. Safari is secondary (WebCodecs + basic features). Firefox is best-effort with graceful degradation (no WebCodecs, no HDR canvas, no Display-P3). The degraded Firefox experience should be documented and surfaced to users.

> **iPad/tablet testing**: VFX supervisors increasingly use iPads for review. The responsive layout is good, but touch-specific interactions (pinch-zoom, two-finger pan, long-press for context) and iPad Safari quirks need dedicated testing.

---

## 7. Phased Delivery Milestones

### Milestone 1: "Usable Review Tool" (Week 6)
**Target**: Supervisors can actually conduct a review session

- ✅ Note/comment system with threads
- ✅ Version management (compare v1/v2/v3)
- ✅ Shot status tracking (approved/needs-work/pending)
- ✅ CDL CPU clamp bug fixed
- ✅ EXR DWAB compression
- ✅ OCIO display/view menus (baked LUT)
- ✅ Frameburn export compositing
- ✅ Shot-to-shot navigation
- ✅ Dailies report export (CSV)
- ✅ Unified preferences API
- **Success criteria** (specific):
  - Load 20+ shot playlist with EXR/DPX sequences
  - Add text notes to at least 15 shots, mark 8 approved, 4 needs-work
  - Compare v2 vs v3 of a shot via A/B toggle and side-by-side
  - Apply CDL grade from .cdl file (import), export modified CDL
  - Apply OCIO display/view transform (baked LUT mode)
  - Export CSV dailies report with shot name, status, notes, timecode
  - Complete workflow in <20 minutes for 20-shot playlist

### Milestone 2: "Studio Pipeline" (Week 14)
**Target**: Full studio integration with encode and collaboration

- ✅ Video encode (H.264/VP9 with frameburn + progress/cancel)
- ✅ ShotGrid integration (load versions, push notes/status)
- ✅ OTIO export + transitions
- ✅ Quad view comparison
- ✅ Session URL sharing
- ✅ Collaboration enhancements (cursor sharing, annotation sync)
- ✅ Shortcut editor UI
- ✅ OCIO WASM full integration (in progress)
- **Success criteria** (specific):
  - Load EXR/DPX sequences from shared storage URL
  - Apply studio OCIO config (e.g., ACES 1.2)
  - Review 40+ shots in a session
  - Export H.264 with burned-in timecode for client delivery
  - Push notes and status to ShotGrid
  - Share session URL with colleague for async review

### Milestone 3: "Feature Complete" (Week 20)
**Target**: Full feature parity for core professional features

- ✅ All Phase 3 features
- ✅ EXR tiled, MXF, JPEG 2000
- ✅ Stereo convergence tools
- ✅ Client-safe mode, reference workflow
- ✅ OCIO WASM complete
- **Success criteria**: Parity score reaches 75%+ across all non-dropped domains. Only truly desktop-bound features (multi-monitor presentation, native FFmpeg encode) remain as known gaps.

---

## 8. Risk Assessment

### High Risk

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| OCIO WASM performance | Medium | High | Phase A (baked LUT) first; cache aggressively; fallback to CPU bake |
| OCIO WASM shader integration | High | High | Injecting generated GLSL into monolithic shader risks breaking 34 phases. Consider multi-pass for OCIO specifically. |
| WebCodecs codec coverage | High | Medium | Server-side transcode service; FFmpeg.wasm fallback |
| Browser HDR API instability | Medium | Medium | Feature detection + graceful degradation |

### Medium Risk

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Memory pressure (4K+ frames) | High | High | Aggressive eviction; streaming decode; worker offload. **Need concrete targets**: 4K EXR load <2s, 4K playback >24fps, LUT application <16ms |
| GPU memory exhaustion | Medium | High | WebGL2 doesn't expose GPU memory. Context loss manifests silently. Monitor via `webglcontextlost` event; implement recovery. |
| OTIO spec version changes | Low | Medium | Pin version; abstract interface |
| ShotGrid API changes | Medium | Low | Abstract via adapter pattern |
| Large sequence loading | Medium | High | 2000-frame 4K EXR sequence = ~96GB Float32. Need streaming decode, not pre-load. |

### Low Risk

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| WebGPU API changes | Low | Low | Abstraction layer already in place |
| EXR decoder performance | Low | Medium | WASM decoder (wasm-exr) as alternative |

---

## 9. Testing Strategy

### 9.1 Current State

- 184 test files, 7,600+ tests — excellent unit test coverage
- Vitest framework with `npx vitest run`

### 9.2 Testing Gaps to Address

| Gap | Priority | Solution |
|-----|----------|---------|
| **Integration tests** | P1 | End-to-end workflow tests: load EXR → apply OCIO → export H.264. Playwright or similar. |
| **Visual regression testing** | P1 | Screenshot comparison for rendering correctness. When adding OCIO WASM or new shader phases, pixel-accurate rendering is the primary quality gate. Use tools like Playwright screenshot comparison or custom WebGL framebuffer capture. |
| **Performance benchmarks in CI** | P1 | Automated perf regression tests with concrete targets. Track: 4K EXR load time, playback FPS, LUT application latency, memory usage. |
| **Cross-browser testing** | P2 | Automated Chrome + Safari + Firefox testing matrix. Safari WebGL2 has known quirks (float texture support, shader compilation). |
| **iPad/tablet testing** | P2 | Touch-specific interactions, iPad Safari quirks, responsive layout at tablet sizes. |
| **Large file stress testing** | P2 | 2000-frame 4K EXR sequence, 8K single frame, 100+ clip playlist. |

### 9.3 Review Workflow Acceptance Tests

| Scenario | Steps | Pass Criteria |
|----------|-------|---------------|
| Dailies review (20 shots) | Load playlist → add notes to 15 shots → mark statuses → export report | Complete in <20 min, report has all data |
| Version comparison | Load v2 + v3 of shot → A/B toggle → annotate difference → resolve note | Annotations visible in both views |
| Grade round-trip | Import .cdl → tweak exposure → export .cdl → re-import → values match | CDL values identical within float precision |
| Collaborative review | 2 users join session → both see same frame → user A annotates → user B sees annotation | Latency <500ms on same network |
| Session persistence | Create session with notes/status → close browser → reopen → all data preserved | 100% data recovery from auto-save |

### 9.4 Performance Targets

| Metric | Target | Current | Notes |
|--------|--------|---------|-------|
| 4K EXR load (single frame) | < 2 seconds | TBD | Measure decode + upload |
| 4K playback FPS | ≥ 24 fps | TBD | Cached frames |
| LUT application latency | < 16 ms | TBD | Per-frame overhead |
| OCIO baked LUT generation | < 500 ms | TBD | 65³ resolution |
| Memory (100-frame 4K sequence) | < 2 GB | TBD | Float32 RGBA |
| Time to first frame (cold) | < 3 seconds | TBD | File load → display |

---

## 10. Expert Review Notes

### Review Lap 2: VFX Pipeline Expert

Key findings (all incorporated in this revision):
1. **CDL Export already exists** (`exportCDLXML()` in CDL.ts lines 327-343) — removed from gaps
2. **Keyboard shortcut customization backend exists** (`CustomKeyBindingsManager.ts` with full implementation) — only UI editor needed
3. **EXR Layer Selector UI already exists** (integrated in `ChannelSelect.ts` with dropdown, events, remapping) — removed from gaps
4. **Annotation pressure sensitivity already exists** (ViewerInputHandler captures pressure, PaintRenderer uses for width) — reduced to opacity/saturation mapping only
5. **GPU CDL is correct** — bug is CPU-only (GPU uses `max(vec3(0.0))`, CPU uses `clamp(v,0,1)`)
6. **CDL Saturation also has [0,255] clamp** in `applySaturation()` — added to bug report
7. **ACES tone mapping in OCIOTransform.ts** uses same Narkowicz fit as shader — both paths need updating for ACES ODT
8. **OCIOTransform hardcodes transform chains** — combinatorial explosion concern for OCIO Phase B
9. **Phase 1 overcounted by ~2-2.5 weeks** due to existing implementations — timeline tightened to 4-6 weeks
10. **EXR multi-part support already exists** — parseMultiPartHeaders(), decodeMultiPart() confirmed
11. **DCI-P3 input gamma decode missing** — OCIOTransform assumes linear input but DCI-P3 uses 2.6 gamma

### Review Lap 1: VFX Pipeline Expert

Key findings incorporated:
1. **CDL clamp bug** (High severity): CPU-side CDL clamps to [0,1] before power, destroying super-whites for HDR
2. **CDL file import already exists**: parseCDLXML(), parseCC(), parseCCC() are in CDL.ts
3. **Bradford CAT already implemented**: In OCIOTransform.ts
4. **Per-source color space tracking already implemented**: In OCIOProcessor.ts
5. **ACES tone mappers are approximations**: Not conformant ACES RRT+ODT — should be documented
6. **OCIO WASM effort underestimated**: 3 weeks → 6-10 weeks realistic
7. **MXF priority lowered**: P1 → P2 (studios can transcode MXF)
8. **EXR DWAB elevated**: P3 → P1 (used by ILM, Weta, major studios)
9. **Slate/burnin underestimated**: 3 days → 1-2 weeks
10. **Missing features added**: ACES ODT selection, frame range handles, negative display, multi-view EXR for stereo
11. **Baked LUT resolution**: Should default to 65³ for ACES transforms

### Review Lap 2: UX/QA Expert

Key findings (all incorporated in this revision):
1. **Keyboard shortcut customization already exists** (confirmed same VFX finding) — only UI editor needed (2-3 days)
2. **Pressure sensitivity partially exists** (confirmed same VFX finding) — needs opacity/saturation mapping (1 day)
3. **Key binding collisions are broader** than described — KeyR, KeyO, KeyG, Shift+KeyR all have true collisions without context scoping
4. **Preferences persistence partially exists** — keybindings, layout, theme, OCIO, display transfer all use localStorage already
5. **AutoSave does NOT include notes/versions/status** — `SessionState` schema needs v2 migration (added to Phase 1 dependencies)
6. **TimecodeOverlay already exists** — display frameburn is done, only export compositing needed (reduced effort)
7. **Undo/redo scope undefined** for new features — should note/status edits be undoable? (flagged as architectural decision)
8. **Session URL sharing undervalued** — elevated to Phase 2 priority (web differentiator vs desktop)
9. **Data model unspecified** for notes/versions — need to define: per-source vs per-frame, client-side vs server-side
10. **Shot-to-shot navigation missing** from implementation plan — added to Phase 1 (2-3 days, high value)
11. **ComparisonManager richer than claimed** — has wipe, A/B, difference matte with heatmap, blend modes (onionskin, flicker, blend)
12. **Video export needs progress/cancel** — added to Phase 2 video encode item
13. **Review workflow acceptance tests needed** — added Section 9.3
14. **Milestone criteria need specificity** — added quantitative gates

### Review Lap 1: UX/QA Expert

Key findings incorporated:
1. **Note/Comment system missing** (P0): Primary output of any review session — without it, tool is a viewer, not a review tool
2. **Version management missing** (P0): Comparing versions is THE core use case of a review tool
3. **Shot status tracking missing** (P1): Direct output of dailies review
4. **OTIO import already exists**: OTIOParser.ts + PlaylistManager.fromOTIO() — Gap 4 was factually incorrect
5. **UI/Interaction parity overstated**: 80% → 55% when including notes, versions, status
6. **Overall parity revised**: 58% → 45% for professional use
7. **Keyboard shortcut customization missing**: Hardcoded bindings with context collisions
8. **Preferences persistence missing**: Basic UX requirement for any application
9. **Dailies workflow gaps**: No batch navigation (shot-to-shot vs frame-to-frame), no multi-version comparison, no dailies report export
10. **Stereo gaps**: No convergence measurement, per-eye annotations, floating window violation detection
11. **Collaboration gaps**: No cursor sharing, annotation sync, conflict resolution, participant permissions
12. **Testing gaps**: No integration tests, visual regression, performance benchmarks, cross-browser matrix
13. **Recommended Phase 1 reorder**: Focus on review workflow (notes, versions, status) before codec/format completeness
14. **Key insight**: "A tool that plays fewer formats but enables actual review decisions will see adoption. A tool that plays every format but cannot capture a supervisor's 'approved' stamp will not."

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
- CDL: `src/color/CDL.ts` (includes parseCDLXML, parseCC, parseCCC)
- OCIO: `src/color/OCIOTransform.ts` (Bradford CAT), `src/color/OCIOProcessor.ts` (per-source tracking)
- OTIO: `src/utils/media/OTIOParser.ts`, `src/core/session/PlaylistManager.ts` (fromOTIO)
- Network: `src/network/NetworkSyncManager.ts`, `src/network/WebSocketClient.ts`
- Annotations: `src/core/session/AnnotationStore.ts`
- Key bindings: `src/utils/input/KeyBindings.ts` (80+ bindings)

---

*This document was generated through exhaustive source-level analysis of both codebases using 8 parallel exploration agents, examining every source file, shader, node type, and plugin package in both projects. Reviewed by VFX Pipeline Expert and UX/QA Expert (2 review laps).*
