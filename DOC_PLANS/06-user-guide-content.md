# Phase 6: User-Facing Documentation Content

All user guide, tutorial, and reference pages for OpenRV Web. Each task specifies source content, target file, outline, screenshots, estimated word count, and AI-draft suitability.

## Conventions

> **Screenshot dependency warning:** Phase 3 currently defines 25 screenshots. This plan references ~80 screenshot IDs. Phase 3 must be expanded before content writing begins, or screenshots should be captured incrementally as each section is written.

- **Screenshots** reference IDs from Phase 3 (SS-XXX)
- **AI-draftable**: "Yes" = AI produces solid first draft; "Manual" = human must write
- **Word count**: estimate for finished page

---

## 6.1 Getting Started Section

### Task 6.1.1: Installation and Accessing the App
- **Source:** README.md (Installation section)
- **Target:** `docs/getting-started/installation.md`
- **Outline:** Overview, Live Demo link, Self-Hosting (prerequisites, clone, install, dev server, production build), Deploying to web server
- **Screenshots:** SS-001
- **Words:** 600 | **AI:** Yes

### Task 6.1.2: Browser Requirements
- **Source:** README.md (Browser Support, Tech Stack)
- **Target:** `docs/getting-started/browser-requirements.md`
- **Outline:** Minimum versions, Required APIs (WebGL2, WebCodecs, Web Audio), Optional APIs (WebGPU, BroadcastChannel, IndexedDB), Compatibility matrix
- **Words:** 500 | **AI:** Yes

### Task 6.1.3: Quick Start Guide
- **Source:** README.md (Opening Media), `features/drag-drop-loading.md`
- **Target:** `docs/getting-started/quick-start.md`
- **Outline:** Loading first file (drag-drop, picker, RV sessions), Basic controls (pan/zoom, play/pause, frame stepping), Quick color adjust, Comparing two files
- **Screenshots:** SS-002, SS-003, SS-004
- **Words:** 800 | **AI:** Yes

### Task 6.1.4: UI Overview Tour
- **Source:** README.md (Architecture, UI/UX sections)
- **Target:** `docs/getting-started/ui-overview.md`
- **Outline:** Layout (header bar, context toolbar, viewer canvas, timeline, floating panels), Tab system (keys 1-5), Theme switching, Fullscreen/presentation
- **Screenshots:** SS-005, SS-006, SS-007
- **Words:** 1000 | **AI:** Yes

---

## 6.2 Playback and Navigation Guide

### Task 6.2.1: Timeline Controls
- **Source:** `features/frame-accurate-playback.md`, `features/timeline-navigation.md`
- **Target:** `docs/playback/timeline-controls.md`
- **Outline:** Timeline overview, Seeking/scrubbing, Thumbnails, In/Out points (I/O/[/]), Frame counter/timecode, Cache indicator
- **Screenshots:** SS-010, SS-011
- **Words:** 700 | **AI:** Yes

### Task 6.2.2: J/K/L Navigation and Speed
- **Source:** `features/frame-accurate-playback.md`, `features/playback-speed-control.md`
- **Target:** `docs/playback/jkl-navigation.md`
- **Outline:** J/K/L shuttle controls, Speed presets (0.1x-8x), Speed button interactions, Reverse limitations, Audio at non-1x
- **Screenshots:** SS-012
- **Words:** 600 | **AI:** Yes

### Task 6.2.3: Loop Modes and Frame Stepping
- **Source:** `features/loop-modes.md`, `features/frame-accurate-playback.md`
- **Target:** `docs/playback/loop-modes-stepping.md`
- **Outline:** Loop modes (once/loop/ping-pong), Cycling, Frame stepping, Sub-frame interpolation, Direction toggle
- **Words:** 600 | **AI:** Yes

### Task 6.2.4: Audio Playback
- **Source:** README.md (Playback and Audio), `features/audio-playback.md`
- **Target:** `docs/playback/audio.md`
- **Outline:** Audio sources, Volume control, Audio sync, Waveform, Autoplay handling, Page visibility
- **Words:** 500 | **AI:** Yes

### Task 6.2.5: Image Sequences
- **Target:** `docs/playback/image-sequences.md`
- **Outline:** Loading image sequences, Pattern notation (e.g. `frame.####.exr`), Missing frame detection and handling, Frame range selection, FPS assignment for stills
- **Words:** 600 | **AI:** Yes

### Task 6.2.6: EXR Multi-Layer/AOV Workflow
- **Target:** `docs/playback/exr-layers.md`
- **Outline:** Multi-layer EXR overview, Layer/pass selection UI, Channel remapping, AOV inspection, Compositing use cases
- **Words:** 700 | **AI:** Yes

### Task 6.2.7: Channel Isolation
- **Target:** `docs/playback/channel-isolation.md`
- **Outline:** Channel isolation shortcuts (Shift+R/G/B/A/L/N), Luminance-only view, Normal/all-channels reset, Use cases (alpha checking, matte review)
- **Words:** 400 | **AI:** Yes

### Task 6.2.8: Viewer Navigation
- **Target:** `docs/playback/viewer-navigation.md`
- **Outline:** Pan (click-drag / middle mouse), Zoom (scroll wheel, +/- keys, pinch), Fit modes (fit, fill, 1:1), Rotate (R key, 90-degree increments), Reset view (Home key)
- **Words:** 500 | **AI:** Yes

---

## 6.3 Color Management Guide

### Task 6.3.1: Primary Color Controls
- **Source:** `features/color-management.md`, `features/color-correction.md`
- **Target:** `docs/color/primary-controls.md`
- **Outline:** Opening panel (C key), Exposure (-5/+5 stops), Gamma, Contrast, Saturation, Brightness, Temperature/Tint, Vibrance (skin tone protection), Clarity, Highlights/Shadows/Whites/Blacks, Reset controls, Processing order
- **Screenshots:** SS-020, SS-021
- **Words:** 1800-2200 | **AI:** Yes

### Task 6.3.2: Color Wheels (Lift/Gamma/Gain)
- **Source:** README.md (Three-Way Color Correction)
- **Target:** `docs/color/color-wheels.md`
- **Outline:** Three-way concept, Interactive wheels, Master wheel, Color preview ring, Gang/link, Keyboard shortcut (Shift+Alt+W), Typical workflows
- **Screenshots:** SS-022, SS-023
- **Words:** 700 | **AI:** Yes

### Task 6.3.3: HSL Qualifier
- **Source:** README.md (HSL Qualifier)
- **Target:** `docs/color/hsl-qualifier.md`
- **Outline:** Secondary color correction concept, H/S/L selection, Eyedropper, Matte preview, Invert selection
- **Screenshots:** SS-024, SS-025
- **Words:** 500 | **AI:** Yes

### Task 6.3.4: CDL Workflow
- **Source:** `features/color-management.md` (ASC CDL)
- **Target:** `docs/color/cdl.md`
- **Outline:** ASC CDL concept (SOP+Sat), CDL panel (slope/offset/power/saturation), Loading/saving .cdl, Processing order, Reset, Pipeline interaction
- **Screenshots:** SS-026, SS-027
- **Words:** 700 | **AI:** Yes

### Task 6.3.5: Curves Editor
- **Source:** `features/color-management.md` (Curves), `src/color/ColorCurves.ts`
- **Target:** `docs/color/curves.md`
- **Outline:** Opening (U key), Channel tabs (Master/R/G/B), Editing (add/drag/delete points), Presets (Film Look, S-Curve, etc.), Import/export JSON, Common shapes
- **Screenshots:** SS-028, SS-029
- **Words:** 700 | **AI:** Yes

### Task 6.3.6: LUT Loading and Management
- **Source:** `features/color-management.md`, `features/float-lut-precision.md`, `features/additional-lut-formats.md`, `features/multi-point-lut-pipeline.md`
- **Target:** `docs/color/lut.md`
- **Outline:** 1D vs 3D LUTs, Supported formats (.cube, .csp, .3dl), Loading, Intensity slider, LUT pipeline, Tetrahedral interpolation, Float precision, Film emulation presets
- **Screenshots:** SS-030, SS-031
- **Words:** 900 | **AI:** Yes

### Task 6.3.7: OCIO Integration
- **Source:** `features/opencolorio-integration.md`, README.md (OCIO)
- **Target:** `docs/color/ocio.md`
- **Outline:** OCIO overview, Built-in configs (ACES 1.2, sRGB), Custom config loading, Input color space, Working/Display/View transforms, Look transforms, WASM processing, Keyboard (Shift+O)
- **Screenshots:** SS-032, SS-033
- **Words:** 900 | **AI:** Yes

### Task 6.3.8: Log Curve Presets
- **Source:** `features/color-management.md`, `src/color/LogCurves.ts`
- **Target:** `docs/color/log-curves.md`
- **Outline:** Log encoding concept, Supported cameras (Cineon, ARRI LogC3/C4, Sony S-Log3, RED Log3G10), Applying, Log-to-linear vs inverse, GPU processing
- **Words:** 600 | **AI:** Yes

### Task 6.3.9: Tone Mapping Operators
- **Source:** `features/hdr-display.md`, README.md (Tone Mapping)
- **Target:** `docs/color/tone-mapping.md`
- **Outline:** Why tone map, Operators (Reinhard, Filmic, ACES), Per-operator parameters, Pipeline position, Choosing the right operator
- **Screenshots:** SS-035, SS-036
- **Words:** 700 | **AI:** Yes

### Task 6.3.10: Display Profiles and Color Output
- **Source:** `features/display-color-management.md`, README.md (HDR and Wide Color Gamut)
- **Target:** `docs/color/display-profiles.md`
- **Outline:** Transfer functions (Linear, sRGB, Rec.709, Gamma), Display gamma/brightness, HDR output (P3, HLG, PQ), Display capabilities detection, Gamut mapping
- **Screenshots:** SS-037, SS-038
- **Words:** 800 | **AI:** Yes

### Task 6.3.11: Color Inversion and Hue Rotation
- **Source:** `features/color-inversion.md`, `features/global-hue-rotation.md`
- **Target:** `docs/color/inversion-hue.md`
- **Outline:** Color inversion (use cases: negative film), Hue rotation (degrees), Shortcuts
- **Words:** 350 | **AI:** Yes

---

## 6.4 Comparison and Review Guide

### Task 6.4.1: A/B Compare and Source Switching
- **Source:** `features/ab-compare.md`
- **Target:** `docs/compare/ab-switching.md`
- **Outline:** Loading multiple sources, Toggling A/B (backtick), A/B badge, Source availability
- **Screenshots:** SS-040, SS-041
- **Words:** 500 | **AI:** Yes

### Task 6.4.2: Wipe Mode
- **Source:** `features/ab-compare.md` (Wipe Mode)
- **Target:** `docs/compare/wipe-mode.md`
- **Outline:** Horizontal/vertical wipe, Dragging wipe line, Labels, Shortcut (Shift+W)
- **Screenshots:** SS-042, SS-043
- **Words:** 450 | **AI:** Yes

### Task 6.4.3: Split Screen
- **Source:** `features/ab-compare.md` (Split Screen)
- **Target:** `docs/compare/split-screen.md`
- **Outline:** H/V split, Draggable divider (5-95%), Labels, Synced playback, Shortcut (Shift+Alt+S)
- **Screenshots:** SS-044, SS-045
- **Words:** 450 | **AI:** Yes

### Task 6.4.4: Difference Matte
- **Source:** `features/ab-compare.md` (Difference Matte)
- **Target:** `docs/compare/difference-matte.md`
- **Outline:** Enabling (Shift+D), Grayscale/heatmap modes, Gain control (1x-10x), Use cases
- **Screenshots:** SS-046, SS-047
- **Words:** 400 | **AI:** Yes

### Task 6.4.5: Blend Modes
- **Source:** `features/ab-compare.md` (Blend Modes)
- **Target:** `docs/compare/blend-modes.md`
- **Outline:** Onion skin, Flicker (1-30 Hz), Blend ratio, Mutual exclusivity
- **Screenshots:** SS-048, SS-049
- **Words:** 450 | **AI:** Yes

### Task 6.4.6: Quad View and Reference Image
- **Source:** README.md (Comparison and Composition)
- **Target:** `docs/compare/advanced-compare.md`
- **Outline:** Quad view (A/B/C/D), Reference image manager (capture, view modes), Matte overlay, Multi-layer stack
- **Screenshots:** SS-050, SS-051
- **Words:** 600 | **AI:** Yes

---

## 6.5 Scopes and Analysis Guide

### Task 6.5.1: Histogram
- **Target:** `docs/scopes/histogram.md`
- **Outline:** Opening (h key), Modes (RGB/luminance/channels), Log scale, Clipping indicators, Clipping overlay, Reading guide
- **Screenshots:** SS-060, SS-061
- **Words:** 600 | **AI:** Yes

### Task 6.5.2: Waveform Monitor
- **Target:** `docs/scopes/waveform.md`
- **Outline:** Opening (w key), Modes (Luma/RGB/Parade/YCbCr), BT.709 coefficients, Reading guide
- **Screenshots:** SS-062, SS-063
- **Words:** 500 | **AI:** Yes

### Task 6.5.3: Vectorscope
- **Target:** `docs/scopes/vectorscope.md`
- **Outline:** Opening (y key), Zoom levels, Reading guide, Skin tone line
- **Screenshots:** SS-064
- **Words:** 400 | **AI:** Yes

### Task 6.5.4: Pixel Probe
- **Source:** `features/pixel-inspector.md`
- **Target:** `docs/scopes/pixel-probe.md`
- **Outline:** Enabling (Shift+I), RGB/HSL/IRE readout, Area averaging, Source vs rendered, Alpha, HDR indicators, Nits readout
- **Screenshots:** SS-065, SS-066
- **Words:** 600 | **AI:** Yes

### Task 6.5.5: False Color and Zebra Stripes
- **Source:** `features/luminance-visualization.md`
- **Target:** `docs/scopes/false-color-zebra.md`
- **Outline:** False color (ARRI/RED/custom presets), Zebra stripes (high/low thresholds, animated), Luminance heatmap
- **Screenshots:** SS-067, SS-068
- **Words:** 600 | **AI:** Yes
- **Merge note:** This is the canonical page for false color and zebra stripes. Task 6.8.8 (Overlays) must not duplicate this content; remove false color and zebra from 6.8.8 scope and cross-reference this page instead.

### Task 6.5.6: Gamut Diagram
- **Target:** `docs/scopes/gamut-diagram.md`
- **Outline:** CIE 1931 display, Reading guide, Gamut compliance
- **Screenshots:** SS-069
- **Words:** 350 | **AI:** Yes

---

## 6.6 Annotations Guide

### Task 6.6.1: Pen and Eraser Tools
- **Source:** `features/markers-annotations.md`
- **Target:** `docs/annotations/pen-eraser.md`
- **Outline:** Activating (key 5), Pen tool (P), Brush types (hard/soft), Color/width, Pressure sensitivity, Eraser (E), Undo/Redo
- **Screenshots:** SS-070, SS-071
- **Words:** 500 | **AI:** Yes

### Task 6.6.2: Shape Tools
- **Target:** `docs/annotations/shapes.md`
- **Outline:** Rectangle (R), Ellipse (O), Line (L), Arrow (A), Polygon, Spotlight (Shift+Q), Fill/stroke
- **Screenshots:** SS-072, SS-073
- **Words:** 450 | **AI:** Yes

### Task 6.6.3: Text Annotations
- **Target:** `docs/annotations/text.md`
- **Outline:** Text tool (T), Formatting (bold/italic/underline), Background/callouts, Positioning
- **Screenshots:** SS-074
- **Words:** 350 | **AI:** Yes

### Task 6.6.4: Per-Frame Annotations, Ghost/Hold Modes
- **Source:** `features/markers-annotations.md`
- **Target:** `docs/annotations/per-frame-modes.md`
- **Outline:** Per-frame storage, Navigating annotated frames (,/.), Ghost mode (G, configurable range, opacity), Hold mode (X), Timeline indicators
- **Screenshots:** SS-075, SS-076
- **Words:** 600 | **AI:** Yes

### Task 6.6.5: Exporting Annotations
- **Target:** `docs/annotations/export.md`
- **Outline:** JSON export/import (round-trip, merge), PDF export (thumbnails, timecodes), Export menu
- **Screenshots:** SS-077
- **Words:** 400 | **AI:** Yes

---

## 6.7 Export Guide

### Task 6.7.1: Frame Export
- **Target:** `docs/export/frame-export.md`
- **Outline:** Single frame (Ctrl+S), Formats (PNG/JPEG/WebP), Sequence export, Copy to clipboard (Ctrl+C)
- **Screenshots:** SS-080
- **Words:** 450 | **AI:** Yes

### Task 6.7.2: Video Export
- **Target:** `docs/export/video-export.md`
- **Outline:** WebCodecs encoding, Codecs (H.264/VP9/AV1), Config (bitrate, GOP, HW accel), MP4 output, Progress
- **Screenshots:** SS-081
- **Words:** 500 | **AI:** Yes

### Task 6.7.3: Slate and Frameburn
- **Target:** `docs/export/slate-frameburn.md`
- **Outline:** Slate/leader frames (metadata, logo, custom fields, editor preview), Frameburn (timecode, frame number, shot name, etc.)
- **Screenshots:** SS-082, SS-083
- **Words:** 600 | **AI:** Yes

### Task 6.7.4: EDL and OTIO
- **Source:** `features/edl-playlist.md`
- **Target:** `docs/export/edl-otio.md`
- **Outline:** EDL export (CMX3600), OTIO import, Conform/re-link panel, Dailies reports
- **Screenshots:** SS-084, SS-085
- **Words:** 500 | **AI:** Yes
- **Merge note:** EDL/OTIO content should live in this page only. Task 6.8.10 (Playlist) should cross-reference this page for EDL export and OTIO import details rather than duplicating them.

### Task 6.7.5: Session Save/Load
- **Source:** `features/session-management.md`
- **Target:** `docs/export/sessions.md`
- **Outline:** .orvproject format, Save/load, Migration, Blob URL handling, RV/GTO sessions
- **Screenshots:** SS-086
- **Words:** 500 | **AI:** Yes
- **Merge note:** This task and Task 6.8.4 (Session Management) both source from `features/session-management.md`. Merge into a single page at `docs/advanced/session-management.md`. This task (6.7.5) should become a short page that cross-references `docs/advanced/session-management.md` for full details.

---

## 6.8 Advanced Topics

### Task 6.8.1: Stereo 3D Viewing
- **Source:** `features/stereo-3d-viewing.md`
- **Target:** `docs/advanced/stereo-3d.md`
- **Outline:** 7 display modes (SBS, over/under, mirror, anaglyph, luminance anaglyph, checkerboard, scanline), Eye swap, Convergence, Alignment overlay, Floating window, Per-eye annotations, Multi-view EXR
- **Screenshots:** SS-090, SS-091, SS-092
- **Words:** 1500 | **AI:** Yes

### Task 6.8.2: Network Sync and Collaboration
- **Source:** `features/network-sync.md`
- **Target:** `docs/advanced/network-sync.md`
- **Outline:** Room creation/joining, User presence, Sync settings, Host/participant roles, WebRTC, URL-based signaling, PIN encryption, Media transfer, Reconnection
- **Screenshots:** SS-093, SS-094
- **Words:** 900 | **AI:** Yes

### Task 6.8.3: DCC Integration
- **Target:** `docs/advanced/dcc-integration.md`
- **Outline:** DCC bridge (WebSocket), Supported apps (Nuke/Maya/Houdini), Inbound/outbound commands, ShotGrid integration
- **Screenshots:** SS-095
- **Words:** 700 | **AI:** Yes

### Task 6.8.4: Session Management and Snapshots
- **Source:** `features/session-management.md`
- **Target:** `docs/advanced/session-management.md`
- **Outline:** Snapshots (named, preview, restore), Auto-save (configurable, crash recovery), Storage quota, History panel (Shift+Alt+H), .orvproject format, Save/load, Migration, Blob URL handling, RV/GTO sessions
- **Screenshots:** SS-086, SS-096, SS-097, SS-098
- **Words:** 1000 | **AI:** Yes
- **Merge note:** This is the canonical session management page. Task 6.7.5 content (save/load, .orvproject format, migration) should be folded into this page. Task 6.7.5 becomes a cross-reference stub.

### Task 6.8.5: Scripting API Guide
- **Source:** `features/scripting-api.md`
- **Target:** `docs/advanced/scripting-api.md`
- **Outline:** window.openrv overview, All API modules with examples, Events, Version/readiness, Custom workflow example
- **Screenshots:** SS-099
- **Words:** 1000 | **AI:** Yes

### Task 6.8.6: Filters and Effects
- **Target:** `docs/advanced/filters-effects.md`
- **Outline:** Noise reduction, Sharpen, Deinterlace, Film emulation, Stabilization, Effect registry
- **Screenshots:** SS-100, SS-101
- **Words:** 700 | **AI:** Yes

### Task 6.8.7: Transforms
- **Target:** `docs/advanced/transforms.md`
- **Outline:** Rotation/flip, Crop (aspect presets, guides), Uncrop, PAR, Lens distortion, Perspective correction
- **Screenshots:** SS-102, SS-103
- **Words:** 600 | **AI:** Yes

### Task 6.8.8: Overlays and Guides
- **Target:** `docs/advanced/overlays.md`
- **Outline:** Timecode, Safe areas, Clipping, Missing frame, EXR window, Matte, Bug overlay, Watermark, Perspective grid, Note overlay (see Task 6.5.5 for false color and zebra stripes)
- **Screenshots:** SS-104, SS-105
- **Words:** 1200 | **AI:** Yes

### Task 6.8.9: Review Workflow
- **Target:** `docs/advanced/review-workflow.md`
- **Outline:** Shot status tracking, Version management, Notes system, Dailies reports, Client mode, Presentation mode, External presentation
- **Screenshots:** SS-106, SS-107, SS-108
- **Words:** 900 | **AI:** Yes

### Task 6.8.10: Playlist Management
- **Source:** `features/edl-playlist.md`
- **Target:** `docs/advanced/playlist.md`
- **Outline:** Creating playlist, Add/remove clips, Reordering, Per-clip in/out, Loop modes
- **Screenshots:** SS-109
- **Words:** 500 | **AI:** Yes
- **Merge note:** EDL export and OTIO import content belongs in Task 6.7.4 (`docs/export/edl-otio.md`). This page should cross-reference 6.7.4 for those topics instead of duplicating them.

---

## 6.9 Reference Pages

### Task 6.9.1: Complete Keyboard Shortcuts Table
- **Source:** README.md (Keyboard Shortcuts), `features/keyboard-shortcuts.md`
- **Target:** `docs/reference/keyboard-shortcuts.md`
- **Outline:** Tables by category (Playback, View, Compare, Scopes, Exposure, Stereo, Channel, Color, Transform, Annotations, Panels, Export, Mouse), Customization guide
- **Screenshots:** SS-110, SS-111
- **Words:** 1200 | **AI:** Yes

### Task 6.9.2: Supported File Formats
- **Source:** README.md (Format Support), feature specs
- **Target:** `docs/reference/file-formats.md`
- **Outline:** Image formats table, Video formats table, Sequence formats, Session/timeline formats, LUT formats, CDL format
- **Words:** 800 | **AI:** Yes

### Task 6.9.3: Browser Compatibility Matrix
- **Target:** `docs/reference/browser-compatibility.md`
- **Outline:** Core requirements, Feature vs browser matrix, Mobile support, Known issues
- **Words:** 500 | **AI:** Yes

### Task 6.9.4: FAQ
- **Target:** `docs/reference/faq.md`
- **Outline:** General (5 Q&A), File Loading (4), Color Management (3), Playback (3), Collaboration (2), Export (2)
- **Words:** 1200 | **AI:** Yes (heavy review needed)

### Task 6.9.5: Troubleshooting
- **Target:** `docs/reference/troubleshooting.md`
- **Outline:** Black screen, Video not playing, Colors wrong, Playback stuttering, Session recovery, Network issues, Export failures, Bug reporting
- **Words:** 1000 | **AI:** Yes (heavy review needed)

---

## Summary

### Total: 49 atomic tasks

### Recommended Execution Order

**Phase A (parallel, no cross-deps):**
- 6.1.1-6.1.4 (Getting Started)

**Phase B (after A):**
- 6.2.1-6.2.8 (Playback)
- 6.3.1-6.3.11 (Color Management -- largest, moved up: many later sections depend on color concepts)
- 6.4.1-6.4.6 (Comparison)
- 6.6.1-6.6.5 (Annotations)

**Phase C (after B):**
- 6.5.1-6.5.6 (Scopes)
- 6.7.1-6.7.5 (Export)
- 6.9.1-6.9.3 (Reference tables -- moved here: benefit from linking to completed content)

**Phase D (after C):**
- 6.8.1-6.8.10 (Advanced Topics)
- 6.9.4-6.9.5 (FAQ + Troubleshooting -- last, references all)

### Estimated Total: ~33,000 words

| Category | Tasks | Words |
|----------|-------|-------|
| Getting Started | 4 | 2,900 |
| Playback | 8 | 4,600 |
| Color Management | 11 | 8,650-9,050 |
| Comparison | 6 | 2,850 |
| Scopes | 6 | 3,050 |
| Annotations | 5 | 2,300 |
| Export | 5 | 2,550 |
| Advanced Topics | 10 | 8,000 |
| Reference | 5 | 4,700 |
| **Total** | **49** | **~33,000** |

All 49 tasks are AI-draftable. FAQ and Troubleshooting require heaviest human review.

---

## 6.10 Maintenance

- **Auto-generated content embedding:** Keyboard shortcuts (6.9.1) and file formats (6.9.2) pages should embed auto-generated content from Phase 2 extraction scripts rather than hand-maintained tables. This ensures docs stay in sync with code.
- **Quarterly review cadence:** Browser compatibility (6.9.3) must be reviewed quarterly to reflect new browser releases and API support changes.
- **Feature spec staleness warning:** `features/color-management.md` lists OCIO, HDR tone mapping, and multi-point LUT as "Not implemented," but README treats them as implemented. This spec must be updated to reflect current status before writing color documentation (6.3.x tasks).

---

## Cross-Reference Guidelines

Each task outline should include a "Related pages" section listing pages that link to or from it. Key cross-references that must be maintained:

- **LUT (6.3.6)** <-> **OCIO (6.3.7)** -- LUT pipeline interacts with OCIO transforms
- **Tone Mapping (6.3.9)** <-> **Display Profiles (6.3.10)** -- tone mapping feeds into display output
- **Annotations (6.6.1-6.6.5)** <-> **Timeline Controls (6.2.1)** -- per-frame annotations tie to timeline
- **Wipe Mode (6.4.2)** <-> **A/B Compare (6.4.1)** -- wipe is a compare sub-mode
- **EDL/OTIO (6.7.4)** <-> **Playlist (6.8.10)** -- playlist uses EDL export
- **Session Save/Load (6.7.5)** <-> **Session Management (6.8.4)** -- merged topic
- **False Color/Zebra (6.5.5)** <-> **Overlays (6.8.8)** -- overlays references scopes page
- **Channel Isolation (6.2.7)** <-> **EXR Multi-Layer (6.2.6)** -- channel viewing complements layer selection
