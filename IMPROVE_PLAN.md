# OpenRV Web - Feature Improvement Plan

This document tracks features that need improvement, completion, or better integration.
Each section is organized by feature area with priority levels: **HIGH** (bugs/broken), **MEDIUM** (incomplete), **LOW** (nice-to-have).

---

## 1. Format Decoders

### HIGH
- [ ] **Remove console.log from JPEGGainmapDecoder** — `src/formats/JPEGGainmapDecoder.ts` lines 69-71, 87, 166, 211 contain 6 `console.log` statements that should be removed or replaced with a debug logger
- [ ] **Register AVIF decoder in DecoderRegistry** — `src/formats/avif.ts` exists but is not registered in `src/formats/index.ts`, so AVIF files won't be decoded via the standard pipeline
- [ ] **Register RAW decoder in DecoderRegistry** — `src/formats/raw.ts` exists but is not registered in `src/formats/index.ts`

### MEDIUM
- [ ] **JP2 (JPEG 2000) WASM not bundled** — `src/formats/JP2Decoder.ts` throws "JPEG 2000 WASM module not loaded" by default; WASM binary is not included in the build
- [ ] **Missing EXR compression codecs** — PXR24, B44, and B44A compression types are not implemented (only PIZ, ZIP, ZIPS, RLE, NONE supported)
- [ ] **HDR orientation support incomplete** — EXR and DPX decoders do not handle orientation/flip metadata
- [ ] **Float TIFF tiled layout** — TIFF decoder doesn't support tiled layout (only strip-based), limiting large file support

### LOW
- [ ] **Add format decoder E2E tests** — No E2E tests verify the full decode→display pipeline for any format
- [ ] **Cineon density-to-linear curve** — Verify against OpenRV reference implementation printing density LUT

---

## 2. Color Management

### HIGH
- [ ] **No dedicated color E2E tests** — Color pipeline (LUT application, CDL, OCIO transforms) has excellent unit tests (1411 tests, all passing) but zero E2E coverage verifying the full UI→render path

### MEDIUM
- [ ] **OCIO WASM binary not included** — OpenColorIO WASM integration exists in code but the WASM binary is not bundled; feature is effectively disabled at runtime
- [ ] **No visual regression tests for color** — No snapshot/golden-image comparison tests to catch subtle rendering differences

### LOW
- [ ] **CDL ACEScct implementation differs from OpenRV reference** — Our CDL uses a simplified model; OpenRV reference uses full ACEScct working space with toe function

---

## 3. Rendering Pipeline

### HIGH
- [ ] **WebGPU backend is entirely stubbed** — `src/render/WebGPUBackend.ts` has all rendering methods (`renderImage`, `renderTiledImages`, `clear`) as no-ops/stubs returning immediately
- [ ] **RenderWorkerProxy missing feature parity** — `setGamutMapping()`, `setPremultMode()`, `setDitherMode()`, `setQuantizeBits()`, `setHDRHeadroom()` are all TODO stubs in the worker proxy

### MEDIUM
- [ ] **Temperature/tint uses simplified model** — Shader uses linear interpolation between fixed color points instead of Planckian locus / CIE D-illuminant model used in professional tools
- [ ] **No integration test for HDR blit pipeline** — The VideoFrame→texImage2D→EOTF→tone-map path has no integration test
- [ ] **Dithering not implemented in shader** — Dither uniform is passed but no dithering logic exists in the fragment shader

### LOW
- [ ] **Render worker does not forward all state** — When offscreen rendering is enabled, some color/display settings are lost because the worker proxy doesn't replicate all main-thread renderer state

---

## 4. Playback & Audio

### HIGH
- [ ] **AudioMixer is dead code** — `src/audio/AudioMixer.ts` is never connected to actual audio data; `addTrack()` / `loadTrackBuffer()` are never called from any wiring code
- [ ] **AudioCoordinator has no tests** — `src/audio/AudioCoordinator.ts` has zero test coverage
- [ ] **No mute keyboard shortcut** — Audio mute/unmute has no keyboard binding despite being a common workflow action

### MEDIUM
- [ ] **PlaybackAPI.step() is O(n) for multi-frame steps** — Stepping by N frames iterates one-at-a-time instead of computing the target frame directly
- [ ] **Sequence export uses 0-based start frame inconsistency** — Some paths use 0-based frame numbering while others use 1-based, causing off-by-one in exports

### LOW
- [ ] **Pre-render buffer size not configurable from UI** — Buffer size is hardcoded; no UI control to adjust based on available memory

---

## 5. Comparison & Layout

### LOW
- [ ] **Add E2E tests for comparison modes** — Split-screen, wipe, overlay, difference, side-by-side, and quad view modes have good unit tests (462 tests, all passing) but no E2E tests verifying mouse/keyboard interaction flows

---

## 6. Paint & Annotations

### HIGH
- [ ] **clearFrame undo is logically inverted** — `src/paint/PaintEngine.ts` lines 565-578 (clearFrame) and 715-748 (undo/redo): when undoing a clearFrame, the cleared strokes are not restored because the undo snapshot captures the post-clear state instead of the pre-clear state
- [ ] **Text letter spacing defined but never rendered** — `PaintStroke.letterSpacing` property exists and is settable from UI, but `PaintRenderer` ignores it during text rendering

### MEDIUM
- [ ] **Pressure mapping only works for Gaussian brush** — Pen pressure affects opacity/size only for Gaussian brush type; other brush types (flat, textured) ignore pressure data
- [ ] **PaintRenderer tests only check "does not throw"** — Test assertions verify no exceptions but don't validate rendered output (pixel correctness)
- [ ] **No E2E tests for paint tools** — Drawing, erasing, text, shapes have no E2E coverage

### LOW
- [ ] **Brush preview not shown on hover** — No visual preview of brush size/shape when hovering over the canvas before drawing

---

## 7. Stereo 3D

### HIGH
- [ ] **Missing single-eye viewing modes** — Cannot view left-eye-only or right-eye-only; only combined stereo modes (anaglyph, side-by-side, etc.) are available
- [ ] **Convergence measurement not wired to mouse events** — Convergence point selection UI exists but click handler doesn't feed coordinates to the convergence calculation

### MEDIUM
- [ ] **Luminance coefficient inconsistency** — Different modules use different RGB→luminance coefficients (BT.709 vs BT.601 vs approximations) for anaglyph conversion
- [ ] **CPU-based stereo rendering** — All stereo compositing (anaglyph, interlaced, checkerboard) runs on CPU; should be GPU shader operations for real-time performance
- [ ] **Nearest-neighbor sampling in eye transform** — Eye image resampling uses nearest-neighbor instead of bilinear, causing aliasing artifacts at non-integer offsets

### LOW
- [ ] **Per-eye annotation support** — Annotations are shared across both eyes; no way to annotate left/right eye independently
- [ ] **Floating window violation detection** — No automated detection of stereo depth violations at frame edges

---

## 8. Filters & Effects

### HIGH
- [ ] **No E2E tests for any filter or effect** — Sharpen, blur, noise reduction, grain, LUT, CDL, stabilization — none have E2E test coverage

### MEDIUM
- [ ] **Noise reduction missing EffectRegistry adapter** — Noise reduction algorithm exists but has no adapter in the effect registry, so it can't be applied through the standard pipeline
- [ ] **chromaStrength parameter unused** — `chromaStrength` is exposed in the noise reduction UI and stored in settings but the processing function ignores it
- [ ] **Stabilization motion estimation not integrated** — Motion estimation module exists but the stabilization adapter doesn't call it; stabilization only uses manual/external transform data

### LOW
- [ ] **Filter parameter presets** — No ability to save/load filter parameter presets for reuse across sessions

---

## 9. Export & Integrations

### HIGH
- [ ] **ReportExporter not wired to UI** — `src/export/ReportExporter.ts` is fully implemented but no UI element triggers it; the feature is inaccessible to users

### MEDIUM
- [ ] **Annotation export events not wired** — `ExportControl.ts` has "Export Annotations (JSON/PDF)" menu items that emit events, but no handler in `AppPlaybackWiring` or elsewhere processes them
- [ ] **MP4Muxer VP9/AV1 support incomplete** — VP9 and AV1 codec paths exist but encoding configuration is incomplete/untested
- [ ] **DCC bridge is one-way** — Can send data to DCC tools (Nuke, Maya) but cannot receive updates back

### LOW
- [ ] **Frame sequence export naming** — No UI to configure frame padding, naming convention, or output directory for image sequence exports

---

## 10. Network & Collaboration

### HIGH
- [x] **validateColorPayload checks only 3 of 7 fields** — FIXED: `validateColorPayload()` now validates all 7 fields: `exposure`, `gamma`, `saturation`, `contrast`, `temperature`, `tint`, `brightness`
- [ ] **No signaling server implementation** — WebRTC peer connection code exists but there is no signaling server to establish connections; collaboration feature cannot actually work
- [ ] **Hardcoded TURN server credentials** — `src/network/types.ts` lines 412-418 contain hardcoded TURN credentials (`username: 'openrelayproject'`); these are public test credentials that will not work in production

### MEDIUM
- [ ] **Remote cursor positions not rendered** — Cursor position data is synchronized over the network but not displayed on remote clients' viewports
- [ ] **No conflict resolution for concurrent edits** — When multiple users edit annotations simultaneously, last-write-wins with no merge or conflict detection
- [ ] **No E2E tests for network sync** — Zero E2E test coverage for any collaboration feature

### LOW
- [ ] **Session persistence across reconnects** — If a peer disconnects and reconnects, session state is not automatically restored

---

## 11. UI Components & Overlays

### HIGH
- [ ] **10+ headless logic components misplaced in ui/components/** — Components like `PlaybackController`, `FrameNavigator`, `AudioMixerControl` contain no UI rendering but live in the UI directory; should be in `src/core/` or `src/logic/`
- [ ] **InfoPanel uses innerHTML with potentially untrusted data** — `src/ui/components/InfoPanel.ts` sets innerHTML from file metadata without sanitization, creating an XSS risk with crafted files

### MEDIUM
- [ ] **Duplicated dropdown UI patterns** — 6+ components implement their own dropdown/select UI instead of sharing a common component
- [ ] **SpotlightOverlay leaks window event listeners** — `SpotlightOverlay` adds window resize/mousemove listeners but doesn't consistently clean them up on destroy
- [ ] **No E2E tests for overlays or scope components** — Waveform, vectorscope, histogram, parade — no E2E coverage

### LOW
- [ ] **Scope component performance** — Waveform/vectorscope/histogram render on every frame via CPU canvas; could use WebGL for real-time performance at high resolutions
- [ ] **Dark/light theme support** — Only dark theme exists; no theme switching capability

---

## 12. Keyboard & App Wiring

### HIGH
- [ ] **ContextualKeyboardManager instantiated but never connected** — `src/App.ts` line ~133: `ContextualKeyboardManager` is created but never wired to the keyboard dispatch system, so contextual shortcuts don't work
- [ ] **6 keyboard shortcuts are dead** — `AppKeyboardHandler.ts` has shortcuts for `paint.line`, `paint.rectangle`, `paint.ellipse`, `channel.red`, `channel.blue`, `channel.none` in `conflictingDefaults` set but they are never registered with the dispatcher

### MEDIUM
- [ ] **API layer missing major feature domains** — The public API (`src/api/`) does not expose: annotations/paint, collaboration/network, filters/effects, stereo 3D, scopes/overlays
- [ ] **Persistence restore missing features** — Session restore does not handle `perspectiveCorrection` or `stabilization` settings
- [ ] **No undo/redo for color adjustments** — Color grading changes (exposure, CDL, temperature) cannot be undone

### LOW
- [ ] **Keyboard shortcut discovery** — No in-app keyboard shortcut reference/cheatsheet overlay
- [ ] **Deep linking** — No URL-based state (e.g., link to a specific frame/annotation)

---

## Summary by Priority

| Priority | Count | Description |
|----------|-------|-------------|
| **HIGH** | 22 | Bugs, broken features, security issues, dead code |
| **MEDIUM** | 25 | Incomplete features, missing integration, gaps |
| **LOW** | 17 | Nice-to-have improvements, polish, performance |
| **Total** | 64 | |

### Top 5 Most Impactful Items
1. **Paint clearFrame undo bug** — Data loss: users lose annotations when undoing a clear
2. ~~**Network validateColorPayload bug**~~ — FIXED: all 7 fields are now validated
3. **AudioMixer dead code** — Entire audio mixing feature is non-functional
4. **ContextualKeyboardManager not connected** — Contextual keyboard shortcuts silently fail
5. **InfoPanel innerHTML XSS** — Security vulnerability with crafted file metadata
