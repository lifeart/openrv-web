# OpenRV Web - Remaining Improvements

Items carried over from completed plan files. Organized by priority.

---

## Performance

### WebAssembly for Hot Loops
**Source:** MAIN_THREAD_UNBLOCKING_PLAN Phase 5E
**Priority:** LOW
**Status:** Not started

Port per-pixel processing to a WASM module (e.g., via AssemblyScript or Rust/wasm-pack). WASM can leverage SIMD instructions (`v128`) to process 4 color channels simultaneously. Expected 2-4x speedup for arithmetic-heavy effects.

### ~~Lazy Loading for Long Sequences~~
**Priority:** MEDIUM
**Status:** Done — `SequenceSourceNode` now uses `FramePreloadManager` for on-demand frame loading with LRU cache eviction, direction-aware preloading, and priority queue. Playback state methods (`setPlaybackDirection`, `setPlaybackActive`, `updatePlaybackBuffer`) available for future PlaybackEngine integration.

~~Load frames on-demand for very long sequences instead of all at once.~~
- ~~Only load frames near current position~~
- ~~Preload frames in playback direction~~
- ~~Unload distant frames to save memory~~
- ~~Background loading with priority queue~~

---

## Features — Not Yet Implemented

### Color Space Conversion (partial — OCIO integration done)
**Priority:** MEDIUM

Full input/output color space conversion UI with gamut diagrams and common presets (e.g., "ARRI LogC to Rec.709"). Core OCIO infrastructure exists.

Unchecked test cases:
- CS-001: sRGB to Rec.709 conversion accurate
- CS-002: Log to linear conversion correct
- CS-003: Wide gamut (P3) clips to Rec.709 properly
- CS-004: Round-trip conversion preserves values
- CS-005: Scopes display in output color space

### ~~Film Emulation / Print Film LUT~~
**Priority:** LOW
**Status:** Done — `FilmEmulation.ts` implements 6 film stock presets (Kodak Portra 400, Ektar 100, Fuji Pro 400H, Velvia 50, Kodak Tri-X 400, Ilford HP5) with per-channel tone curves, saturation adjustment, luminance-dependent grain with seeded PRNG for per-frame animation, and intensity blending. Integrated as `FilmEmulationEffect` adapter in the unified effect pipeline.

- ~~FILM-001: Preset applies characteristic look~~
- ~~FILM-002: Intensity scales effect properly~~
- ~~FILM-003: Grain animates over frames~~
- ~~FILM-004: Multiple presets can be compared~~

### ~~Perspective Correction~~
**Priority:** MEDIUM
**Status:** Done — `PerspectiveCorrection.ts` implements four-corner homography (DLT algorithm) with CPU bilinear/bicubic inverse mapping and GPU fragment shader path. `PerspectiveCorrectionControl.ts` provides numeric inputs + quality dropdown. `PerspectiveGridOverlay.ts` renders interactive grid with draggable corner handles. Bidirectional wiring between control, overlay, and viewer. 20+ unit tests including direction regression tests.

- ~~PERSP-001: Dragging corner warps image~~
- ~~PERSP-002: Grid overlay aligns with edges~~
- ~~PERSP-003: Reset returns to original~~
- ~~PERSP-004: Numeric input precise values~~
- ~~PERSP-005: Quality options affect output~~

### Stabilization Preview
**Priority:** LOW

Basic 2D motion stabilization for shaky footage analysis (preview only, not production).

- STAB-001: Analysis completes on sequence
- STAB-002: Stabilized preview reduces shake
- STAB-003: Smoothing affects result
- STAB-004: Crop removes edges

### ~~Deinterlace Preview~~
**Priority:** LOW
**Status:** Done — `Deinterlace.ts` implements bob (field interpolation), weave (identity/no-op), and blend (adjacent line averaging) methods with TFF/BFF field order selection. Auto-detection via comb metric analysis. Integrated as `DeinterlaceEffect` adapter in the unified effect pipeline.

- ~~DEINT-001: Bob creates smooth motion~~
- ~~DEINT-002: Weave combines fields~~
- ~~DEINT-003: Field order selection works~~
- ~~DEINT-004: Auto-detect identifies interlaced~~

### ~~RAW Image Preview~~
**Priority:** LOW
**Status:** Done — `RAWPreviewDecoder.ts` extracts largest embedded JPEG preview from TIFF-based RAW files (CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2, PEF, SRW) via IFD chain walking + SubIFD traversal. EXIF metadata (make, model, ISO, exposure, f-number, focal length, date, orientation) extracted from IFD0. Integrated into `FileSourceNode` for both URL and File loading paths.

- ~~RAW-001: Preview extracts from CR2~~
- ~~RAW-002: EXIF metadata displayed~~
- ~~RAW-003: Preview indicator visible~~
- ~~RAW-004: Multiple RAW formats supported~~

### Comparison Annotations
**Priority:** LOW

Annotations linked to specific grade versions (A/B), with per-version filtering.

- COMP-001: Annotation attached to specific version
- COMP-002: Switching versions shows/hides annotations
- COMP-003: "All versions" annotation always visible
- COMP-004: Filter by version works

### Customizable Layout
**Priority:** MEDIUM

Dockable, floatable, tabbable panels with saveable workspace presets.

- LAYOUT-001: Panels dock to edges
- LAYOUT-002: Tab groups work
- LAYOUT-003: Layouts save/load
- LAYOUT-004: Presets switch layout
- LAYOUT-005: Window resize adjusts panels

### Full Keyboard Navigation
**Priority:** MEDIUM

Complete keyboard navigation with tab order, focus indicators, ARIA labels, and screen reader support.

- KEY-001: Tab moves through controls
- KEY-002: Enter activates buttons
- KEY-003: Escape closes modals
- KEY-004: Focus visible at all times
- KEY-005: Screen reader accessible

---

## Incomplete Test Coverage in Completed Features

Small gaps in otherwise-completed features:

| Feature | Missing Item | Notes |
|---------|-------------|-------|
| ~~Highlight/Shadow Recovery~~ | ~~HL-006: Works correctly with HDR content~~ | Done — GPU shader HDR-aware masking via `u_hdrHeadroom` + `applyHighlightsShadowsHDR()` CPU function |
| ~~LUT Support~~ | ~~LUT-002: .3dl file loads correctly~~ | Done — `.3dl` parser in `LUTFormats.ts` |
| ~~Parade Scope~~ | ~~PARADE-006: YCbCr mode~~ | Done — YCbCr mode in `Waveform.ts` + `WebGLScopes.ts` |
| ~~Markers~~ | ~~MARK-008–011: UI editing, navigation panel, duration markers, export/import~~ | Done — all implemented in `MarkerListPanel.ts` |
| ~~Auto-Save~~ | ~~AUTOSAVE-005: Auto-save interval configurable via UI~~ | Done — settings popover in `AutoSaveIndicator.ts` with localStorage persistence |
