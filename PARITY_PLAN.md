# OpenRV → OpenRV-Web Remaining Gaps

> **Updated**: 2026-02-19 | **Status**: Post-implementation audit against actual code
> **Reference**: OpenRV (ASWF) `main` @ `HEAD`
> **Target**: openrv-web (`more-work` branch)

---

## 1. Summary

The vast majority of planned features have been implemented. Overall estimated parity is **~85-90%** (up from ~48% at plan creation). The remaining gaps are small and mostly niche/legacy.

### What Was Completed Since Plan Creation

All Phase 1, most of Phase 2, and all of Phase 3 items have been implemented:

- Note/Comment system (NoteManager, NotePanel, NoteOverlay)
- Version management (VersionManager)
- Shot status tracking (StatusManager)
- CDL CPU clamp bug fixed (`Math.max(v, 0)` now used)
- OCIO display/view menus (OCIOProcessor: getAvailableDisplays/Views)
- Frameburn export compositing (FrameburnCompositor)
- Shot-to-shot navigation (PageUp/PageDown bindings)
- EXR DWAB compression (EXRDWACodec)
- Dailies report export (ReportExporter: CSV + HTML)
- Unified preferences API (PreferencesManager)
- OTIO export (OTIOWriter)
- Video encode via WebCodecs (VideoExporter: H.264/VP9/AV1)
- ShotGrid integration (ShotGridBridge: OAuth2, versions, notes, status sync)
- Session URL sharing (SessionURLManager)
- Shortcut editor UI (ShortcutEditor + ShortcutCheatSheet)
- Conform/re-link UI (ConformPanel with fuzzy matching)
- Collaboration enhancements (cursor sharing, annotation sync, conflict resolution)
- Pressure opacity/saturation mapping (PaintRenderer pressureMapping)
- Stereo convergence tools (ConvergenceMeasure)
- EXR tiled image support (ONE_LEVEL)
- TIFF LZW/ZIP compression (decompressLZW, decompressDeflate)
- JPEG 2000 (JP2Decoder)
- MXF container (MXFDemuxer)
- Multi-view EXR stereo (MultiViewEXR)
- Premult/Unpremult shader control (u_premult uniform)
- Retime warp curves (RetimeGroupNode warpKeyFrames)
- Negative display (u_invert uniform)
- Dither (u_ditherMode: ordered Bayer 8x8)
- Quantize visualization (u_quantizeBits)
- Shortcut cheat sheet overlay (ShortcutCheatSheet)
- Client-safe locked UI mode (ClientMode)
- Reference image workflow (ReferenceManager)
- Annotated frame/PDF export (AnnotationPDFExporter)
- EDL export (EDLWriter)
- Slate rendering (SlateRenderer)

---

## 2. Remaining Gaps

### 2.1 Partial Implementations (need finishing)

| # | Feature | Current State | Remaining Work | Priority | Effort |
|---|---------|--------------|----------------|----------|--------|
| 1 | **Quad view GPU rendering** | ComparisonManager has QuadViewState with A/B/C/D source assignments, toggle, conflict management. LayoutGroupNode is a pass-through (returns first input only). | LayoutGroupNode needs actual multi-input tiled rendering (composite all inputs into grid layout on GPU). | P2 | 3-5 days |
| 2 | **OTIO multi-track** | OTIOParser extracts first video track only (`videoTracks[0]`). | Support multiple video tracks in parser and SequenceGroupNode. | P2 | 1 week |
| 3 | **OTIO transition rendering** | Parser recognizes transitions in schema (OTIOTransition with type, in/out offset) but doesn't render them. | Implement dissolve/wipe rendering between clips during playback. | P2 | 1 week |
| 4 | **Slate UI editor** | SlateRenderer exists (canvas2D rendering with fields, logo, metadata). No editor UI. | Add SlateEditor component for configuring slate fields/layout. | P3 | 3-5 days |
| 5 | **OCIO WASM shader integration** | OCIOWasmBridge (module lifecycle, config loading, VFS LUT preloading, fallback to JS). OCIOShaderTranslator (GLSL 1.x → GLSL ES 300 es translation, uniform injection, function renaming). | Complete end-to-end pipeline: WASM OCIO processor → shader generation → inject into monolithic shader → upload LUT textures. The translator and bridge exist but are not wired to the renderer. | P1 | 3-5 weeks |

### 2.2 Not Implemented

| # | Feature | Notes | Priority | Effort |
|---|---------|-------|----------|--------|
| 6 | **SMPTE 240M linearize** | Legacy HDTV transfer function. Not in TransferFunctions.ts. | P3 | 1 day |
| 7 | **ICC profile support** | No ICC-related code found. Relevant for print/design, not core VFX. | P3 | 1.5 weeks |
| 8 | **DCI-P3 gamma 2.6 decode** | OCIOTransform assumes linear input for DCI-P3 but DCI-P3 uses 2.6 gamma. | P3 | 1 day |
| 9 | **Per-eye annotations** | Stereo eye transforms exist but no per-eye annotation tracking. | P3 | 3 days |
| 10 | **Floating window violation** | Standard stereo QC check — no implementation found. | P3 | 3 days |
| 11 | **Keyboard binding context scoping** | Default bindings have collisions (KeyR, KeyO, KeyG, Shift+KeyR) between timeline and paint contexts. No context scoping mechanism. | P2 | 2 days |
| 12 | **Timeline source frame / footage modes** | Only 'frames' and 'timecode' display modes. Missing: source frame, seconds, footage. | P3 | 2 days |
| 13 | **EXR data/display window overlay** | EXR decoder reads dataWindow/displayWindow but no UI overlay indicator. | P3 | 2 days |
| 14 | **Bug overlay** | No bug.mu equivalent (small corner logo overlay). | P3 | 1 day |
| 15 | **Presentation to external device** | PresentationMode is fullscreen only. No multi-device/WebRTC presentation. | P3 | 2 weeks |
| 16 | **DCC integration (Nuke/Maya)** | No WebSocket bridge for DCC tools. | P3 | 2 weeks |
| 17 | **360 lat/long viewer** | No spherical projection shader. | P3 | 1 week |
| 18 | **Advanced annotation tools** | Missing dodge, burn, clone, smudge paint tools. | P3 | 1 week |
| 19 | **Audio surround/mixing pipeline** | Web Audio is basic (volume/mute). No surround, resampling, or mixing. | P3 | 2 weeks |
| 20 | **EXR deep pixel** | EXR decoder references deep but no actual deep pixel compositing. | P3 | 1 week |
| 21 | **TIFF tiled layout** | TIFF decoder supports LZW/ZIP strip but not tiled layout. | P3 | 3 days |
| 22 | **Cache LUT (pre-cache optimization)** | No CacheLUTIPNode equivalent. | P3 | 3 days |
| 23 | **Property animation/persistence flags** | Properties are JSON-serializable but lack animation keyframes and persistence flags. | P3 | 1 week |

### 2.3 Browser-Limited (not fixable in app code)

| Feature | Status | Notes |
|---------|--------|-------|
| ProRes via WebCodecs | Falls back to HTML video | WebCodecs doesn't support ProRes; server-side transcode preferred |
| DNxHD via WebCodecs | Falls back to HTML video | Same as ProRes |

### 2.4 Dropped (not worth implementing)

| Feature | Reason |
|---------|--------|
| SGI format | Archival, no active use |
| TGA format | Archival, studios have migrated |
| PSD format | Not a review format |

---

## 3. Known Issues

| Issue | Location | Severity | Description |
|-------|----------|----------|-------------|
| **Tone mapper accuracy** | `viewer.frag.glsl` | Medium | ACES tone mappers are approximations (Narkowicz fit), not conformant ACES RRT+ODT. Should be documented; consider adding ACES ODT selection via OCIO WASM. |
| **OCIOTransform combinatorial explosion** | `OCIOTransform.ts` | Medium | Transform chains built via massive if/else cascade. Adding new color spaces requires hardcoded branches. OCIO WASM completion should address this. |

---

## 4. Architecture Notes (still relevant)

### Processing Pipeline

```
OPENRV-WEB (TypeScript/WebGL2):
Single monolithic fragment shader. 34 processing phases in ~1272 lines.
All phases controlled by uniforms. Fixed processing order.
More efficient than multi-pass (no FBO ping-pong) but colorists cannot reorder operations.
```

### OCIO Integration Path

- **Phase A (DONE)**: OCIO display/view menus with baked LUT approach.
- **Phase B (IN PROGRESS)**: WASM bridge + shader translator exist. Need to wire end-to-end: WASM OCIO processor → generate GLSL → translate to ES 300 → inject into monolithic shader → upload LUT textures. Consider multi-pass for OCIO specifically to avoid breaking existing 34 phases.

---

## 5. Web Platform Constraints

| Constraint | Impact | Mitigation |
|-----------|--------|-----------|
| **No FFmpeg native** | Cannot decode ProRes/DNxHD natively | Server-side transcode preferred; FFmpeg.wasm as fallback |
| **WebGL2 shader limits** | No compute shaders, limited branching | WebGPU migration (in progress) |
| **No direct file system** | Cannot watch file changes | File System Access API (Chromium) or drag-and-drop |
| **Memory limits** | Browser tabs ~2-4GB | Aggressive LRU eviction; streaming decode |
| **Fixed shader pipeline** | Cannot reorder color operations | Document limitation; processing order shown in UI |

---

## 6. Testing Gaps

| Gap | Priority | Solution |
|-----|----------|---------|
| **Integration tests** | P1 | End-to-end workflow tests (Playwright or similar) |
| **Visual regression testing** | P1 | Screenshot comparison for rendering correctness |
| **Performance benchmarks in CI** | P1 | Automated perf regression with targets: 4K EXR <2s, playback >24fps, LUT <16ms |
| **Cross-browser testing** | P2 | Chrome + Safari + Firefox matrix |
| **iPad/tablet testing** | P2 | Touch interactions, Safari quirks |
| **Large file stress testing** | P2 | 2000-frame 4K EXR, 8K single frame, 100+ clip playlist |

### Performance Targets

| Metric | Target | Current | Notes |
|--------|--------|---------|-------|
| 4K EXR load (single frame) | < 2 seconds | TBD | Measure decode + upload |
| 4K playback FPS | >= 24 fps | TBD | Cached frames |
| LUT application latency | < 16 ms | TBD | Per-frame overhead |
| OCIO baked LUT generation | < 500 ms | TBD | 65^3 resolution |
| Memory (100-frame 4K sequence) | < 2 GB | TBD | Float32 RGBA |
| Time to first frame (cold) | < 3 seconds | TBD | File load -> display |
