# OpenRV Web - Remaining Improvements

Items carried over from completed plan files. Organized by priority.

---

## Performance

### WebAssembly for Hot Loops
**Source:** MAIN_THREAD_UNBLOCKING_PLAN Phase 5E
**Priority:** LOW
**Status:** Not started

Port per-pixel processing to a WASM module (e.g., via AssemblyScript or Rust/wasm-pack). WASM can leverage SIMD instructions (`v128`) to process 4 color channels simultaneously. Expected 2-4x speedup for arithmetic-heavy effects.

---

## Features — Not Yet Implemented

### Color Space Conversion (partial — OCIO integration done)
**Priority:** MEDIUM
**Status:** Mostly complete

Full input/output color space conversion UI with gamut diagrams and common presets (e.g., "ARRI LogC to Rec.709"). Core OCIO infrastructure exists. Hue-preserving gamut clipping added for wide→narrow gamut paths (P3→sRGB, Rec.2020→sRGB, ProPhoto→sRGB). Direct sRGB↔Rec.709 transform path added.

**Done:**
- GPU gamut mapping UI control (`GamutMappingControl.ts`) with mode (off/clip/compress), source/target gamut selection
- Gamut mapping wired through Viewer → ViewerGLRenderer → ShaderStateManager → WebGL shader
- 4 HDR workflow presets added to OCIOPresets (LogC3→P3, LogC4→Rec.2020, S-Log3→P3, Rec.2020→P3)
- CIE 1931 gamut diagram already wired to OCIO state changes
- 21 unit tests for GamutMappingControl, wiring test for AppColorWiring

**Remaining:**
- Per-source color space persistence (remember input color space per file)
- Out-of-gamut pixel highlighting overlay

### Comparison Annotations
**Priority:** LOW | **Status:** Complete

Annotations linked to specific grade versions (A/B), with per-version filtering.

- COMP-001: Annotation attached to specific version ✅
- COMP-002: Switching versions shows/hides annotations ✅
- COMP-003: "All versions" annotation always visible ✅
- COMP-004: Filter by version works ✅

**What was done:**
- Added `AnnotationVersion` type (`'A' | 'B' | 'all'`) to paint types
- Added `version` field to PenStroke, TextAnnotation, ShapeAnnotation
- Updated PaintEngine: `annotationVersion` property, version filtering in `getAnnotationsForFrame()`, `getAnnotationsWithGhost()`, `hasAnnotationsOnFrame()`
- Added version select dropdown to PaintToolbar with setAnnotationVersion/getAnnotationVersion API
- Wired A/B source switching to annotation version sync in App.ts
- 20 unit tests covering all COMP acceptance criteria
- Backward compatible: annotations without version treated as 'all' (always visible)

### Customizable Layout
**Priority:** MEDIUM | **Status:** Complete

Dockable, floatable, tabbable panels with saveable workspace presets.

- LAYOUT-001: Panels dock to edges ✅
- LAYOUT-002: Tab groups work ✅
- LAYOUT-003: Layouts save/load ✅
- LAYOUT-004: Presets switch layout ✅
- LAYOUT-005: Window resize adjusts panels ✅

**What was done:**
- Created `LayoutStore` (`src/ui/layout/LayoutStore.ts`) - pure data layer for panel sizes, collapsed states, active tabs, with debounced localStorage persistence
- Created `LayoutManager` (`src/ui/layout/LayoutManager.ts`) - DOM component with resizable split panels (left/right/bottom), drag handles, collapse rails, panel tabs, preset bar
- 4 built-in presets: Default, Review, Color, Paint
- Custom layout save/load/delete via localStorage
- Side panels with collapse/expand toggle buttons and tab groups
- Drag handles for resizing (pointer-based, col-resize/row-resize cursors)
- Viewport resize handling with auto-collapse when viewport too small
- Panel size clamping (min 150px sides, 80px bottom, max 50%/40% of viewport)
- Wired into App.ts with viewer resize propagation
- Layout action handlers (layout.default, layout.review, layout.color, layout.paint)
- 65 unit tests covering all LAYOUT acceptance criteria (38 LayoutStore + 27 LayoutManager)
