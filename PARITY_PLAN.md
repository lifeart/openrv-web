# OpenRV → OpenRV-Web Parity Status

> **Updated**: 2026-02-19 | **Status**: All planned features implemented
> **Reference**: OpenRV (ASWF) `main` @ `HEAD`
> **Target**: openrv-web (`more-work` branch)

---

## 1. Summary

Estimated feature parity: **~97%**. All 23 remaining gaps identified in the original audit have been implemented and validated through 2 rounds of VFX Pipeline Expert + UX/QA Expert review. Test suite: **15018 tests passing** across 359 test files.

---

## 2. Implemented (previously gaps)

All items below were implemented and validated:

| # | Feature | Implementation |
|---|---------|---------------|
| 1 | Quad view GPU rendering | `LayoutGroupNode` tiled mode, `Renderer.renderTiledImages()` viewport/scissor rendering |
| 2 | OTIO multi-track | `parseOTIOMultiTrack()` in OTIOParser, `exportOTIOMultiTrack()` in OTIOWriter |
| 3 | OTIO transition rendering | Transition parsing with in/out offsets, dissolve/wipe types |
| 4 | Slate UI editor | `SlateEditor` component with color/URL validation |
| 5 | OCIO WASM pipeline | `OCIOWasmPipeline` orchestrator, wired to Renderer via `setOCIOShader()`, 3D LUT upload |
| 6 | SMPTE 240M | `smpte240mEncode/Decode` in TransferFunctions, `smpte240mEOTF` in shader, `u_inputTransfer=7` |
| 7 | ICC profile support | `ICCProfile.ts` — v2/v4 parsing, TRC (curv/para), matrix extraction |
| 8 | DCI-P3 gamma 2.6 | `gamma_decode/gamma_encode('gamma26')` in OCIOTransform for both directions |
| 9 | Per-eye annotations | `AnnotationEye` type, eye filtering in PaintEngine, serialization |
| 10 | Floating window violation | `FloatingWindowDetector` — block matching SAD, configurable threshold |
| 11 | Keyboard context scoping | `ActiveContextManager` + `ContextualKeyboardManager`, collision annotations |
| 12 | Timeline display modes | `seconds` + `footage` modes in Timecode, cycling + localStorage persistence |
| 13 | EXR data/display window overlay | `EXRWindowOverlay` — dashed rectangles with labels |
| 14 | Bug overlay | `BugOverlay` — corner logo, 4 positions, size/opacity/margin with validation |
| 15 | External presentation | `ExternalPresentation` — BroadcastChannel sync, session isolation |
| 16 | DCC integration | `DCCBridge` — WebSocket JSON protocol, auto-reconnect, Nuke/Maya/Houdini |
| 17 | 360 lat/long viewer | `SphericalProjection` — equirectangular, yaw/pitch/FOV, mouse/wheel control |
| 18 | Advanced paint tools | `AdvancedPaintTools` — dodge, burn, clone (Alt-click source), smudge |
| 19 | Audio surround/mixing | `AudioMixer` — multi-track, 5.1/7.1 downmix (ITU-R BS.775), waveform |
| 20 | EXR deep pixel | Deep scanline decoder with front-to-back Over compositing, early opacity exit |
| 21 | TIFF tiled layout | Tile tag parsing, `decodeTiledTIFF()` with partial edge tile handling |
| 22 | Cache LUT | `CacheLUTNode` — 3D LUT baking, trilinear interpolation, param hash invalidation |
| 23 | Property animation | Keyframes with linear/step/smooth (Hermite) interpolation, persistence flags |

---

## 3. Browser-Limited (not fixable in app code)

| Feature | Status | Notes |
|---------|--------|-------|
| ProRes via WebCodecs | Falls back to HTML video | WebCodecs doesn't support ProRes; server-side transcode preferred |
| DNxHD via WebCodecs | Falls back to HTML video | Same as ProRes |

---

## 4. Dropped (not worth implementing)

| Feature | Reason |
|---------|--------|
| SGI format | Archival, no active use |
| TGA format | Archival, studios have migrated |
| PSD format | Not a review format |

---

## 5. Known Limitations

| Issue | Location | Severity | Notes |
|-------|----------|----------|-------|
| Tone mapper accuracy | `viewer.frag.glsl` | Low | ACES approximations (Narkowicz fit), not conformant RRT+ODT. OCIO WASM pipeline can provide accurate transforms. |
| Smudge tool edge behavior | `AdvancedPaintTools.ts` | Low | Out-of-bounds samples return transparent black. Standard behavior. |
| Dodge/burn HDR clipping | `AdvancedPaintTools.ts` | Low | Output clamped to [0,1]. Correct for SDR workflows. |
| FloatingWindowDetector sync | `FloatingWindowDetector.ts` | Low | Runs on main thread. Could block briefly on 4K. Worker offload possible in future. |
| SlateEditor color formats | `SlateEditor.ts` | Low | Accepts hex + named CSS colors only. `rgb()`/`hsl()` not supported. Documented. |

---

## 6. Architecture Notes

### Processing Pipeline

```
Single monolithic fragment shader. 34 processing phases in ~1272 lines.
All phases controlled by uniforms. Fixed processing order.
More efficient than multi-pass (no FBO ping-pong) but colorists cannot reorder operations.
```

### OCIO Integration

- **Phase A (DONE)**: OCIO display/view menus with baked LUT approach.
- **Phase B (DONE)**: OCIOWasmPipeline orchestrates WASM OCIO → shader translation (OCIOShaderTranslator) → 3D LUT upload to Renderer. Automatic fallback to baked LUT mode.

---

## 7. Web Platform Constraints

| Constraint | Impact | Mitigation |
|-----------|--------|-----------|
| No FFmpeg native | Cannot decode ProRes/DNxHD natively | Server-side transcode; FFmpeg.wasm fallback |
| WebGL2 shader limits | No compute shaders | WebGPU migration (in progress) |
| No direct file system | Cannot watch file changes | File System Access API (Chromium) or drag-and-drop |
| Memory limits | Browser tabs ~2-4GB | Aggressive LRU eviction; streaming decode |
| Fixed shader pipeline | Cannot reorder color operations | Documented; processing order shown in UI |

---

## 8. Testing Gaps

| Gap | Priority | Solution |
|-----|----------|---------|
| Integration tests | P1 | End-to-end workflow tests (Playwright or similar) |
| Visual regression testing | P1 | Screenshot comparison for rendering correctness |
| Performance benchmarks in CI | P1 | Automated perf regression with targets below |
| Cross-browser testing | P2 | Chrome + Safari + Firefox matrix |
| iPad/tablet testing | P2 | Touch interactions, Safari quirks |
| Large file stress testing | P2 | 2000-frame 4K EXR, 8K single frame, 100+ clip playlist |

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| 4K EXR load (single frame) | < 2 seconds | Decode + GPU upload |
| 4K playback FPS | >= 24 fps | Cached frames |
| LUT application latency | < 16 ms | Per-frame overhead |
| OCIO baked LUT generation | < 500 ms | 65^3 resolution |
| Memory (100-frame 4K sequence) | < 2 GB | Float32 RGBA |
| Time to first frame (cold) | < 3 seconds | File load → display |
