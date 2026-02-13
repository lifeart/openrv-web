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

Full input/output color space conversion UI with gamut diagrams and common presets (e.g., "ARRI LogC to Rec.709"). Core OCIO infrastructure exists. Hue-preserving gamut clipping added for wide→narrow gamut paths (P3→sRGB, Rec.2020→sRGB, ProPhoto→sRGB). Direct sRGB↔Rec.709 transform path added.

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
