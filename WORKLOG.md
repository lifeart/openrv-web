# OpenRV Web - Work Log

## Current Status: Phase 10 Complete - Core Features Done

---

## Completed Phases

### Phase 1: Foundation ✅
- [x] Vite + TypeScript project setup
- [x] EventEmitter utility (`src/utils/EventEmitter.ts`)
- [x] Property system (`src/core/graph/Property.ts`)
- [x] Signal system (`src/core/graph/Signal.ts`)
- [x] WebGL2 Renderer (`src/render/Renderer.ts`)
- [x] ShaderProgram management (`src/render/ShaderProgram.ts`)
- [x] Basic display shader (passthrough + gamma)

### Phase 2: Node Graph System (Partial) ✅
- [x] IPNode base class (`src/nodes/base/IPNode.ts`)
- [x] Graph manager (`src/core/graph/Graph.ts`)
- [x] NodeFactory (`src/nodes/base/NodeFactory.ts`)
- [x] IPImage class (`src/core/image/Image.ts`)
- [ ] Source nodes (FileSourceNode, SequenceNode) - using Session instead

### Phase 3: Basic Viewer ✅
- [x] Viewer component with Canvas2D (`src/ui/components/Viewer.ts`)
- [x] Pan/zoom controls (mouse wheel, drag, pinch)
- [x] Timeline component (`src/ui/components/Timeline.ts`)
- [x] Toolbar (`src/ui/components/Toolbar.ts`)
- [x] Playback engine (play, pause, step, loop modes)
- [x] Keyboard shortcuts
- [x] Drag-and-drop file loading
- [x] Image and video support

### Phase 6: Annotations ✅
- [x] PaintEngine (`src/paint/PaintEngine.ts`)
- [x] PaintRenderer (`src/paint/PaintRenderer.ts`)
- [x] PaintToolbar (`src/ui/components/PaintToolbar.ts`)
- [x] Pen strokes with pressure
- [x] Text annotations
- [x] Eraser tool
- [x] Brush types (circle, gaussian)
- [x] Ghost mode (show nearby frame annotations)
- [x] Undo/redo

### Phase 7: Session Integration (Partial) ✅
- [x] GTO/RV file loading via gto-js
- [x] RVPaint annotation parsing
- [x] Coordinate conversion (OpenRV coords → normalized)
- [x] Image/video media loading
- [ ] Full node graph reconstruction from GTO
- [ ] Session saving

---

## In Progress

### Phase 4: Color Processing ✅
- [x] Color adjustment UI panel (`src/ui/components/ColorControls.ts`)
- [x] Exposure control
- [x] Gamma control
- [x] Saturation control
- [x] Contrast control
- [x] Brightness control
- [x] Color temperature (warm/cool)
- [x] Tint (green/magenta)
- [x] GLSL shaders for color operations (in Renderer.ts)
- [x] CSS filter fallback for Canvas2D viewer
- [x] Keyboard shortcut (C) to toggle panel
- [x] Double-click to reset individual sliders
- [x] Reset all button

---

## Completed Recently

### Phase 5: Wipe Comparison ✅
- [x] WipeControl component (`src/ui/components/WipeControl.ts`)
- [x] Horizontal wipe mode (vertical divider line)
- [x] Vertical wipe mode (horizontal divider line)
- [x] Draggable wipe line with position tracking
- [x] Canvas filter-based split rendering
- [x] Keyboard shortcut (W) to cycle wipe modes
- [x] Integration with color adjustments (original vs adjusted comparison)

### Phase 8: Audio Support ✅
- [x] VolumeControl component (`src/ui/components/VolumeControl.ts`)
- [x] Volume slider with hover reveal
- [x] Mute toggle button with icon states (🔇🔈🔉🔊)
- [x] Session volume/mute state management
- [x] Video element volume sync
- [x] Keyboard shortcuts help updated

### Phase 9: LUT Support ✅
- [x] LUT loader for .cube files (`src/color/LUTLoader.ts`)
- [x] 3D LUT parsing with trilinear interpolation support
- [x] LUT section in ColorControls panel
- [x] LUT load button and file picker
- [x] LUT intensity slider
- [x] LUT indicator badge in viewer
- [x] Clear LUT button

### Phase 10: Frame Export ✅
- [x] FrameExporter utility (`src/utils/FrameExporter.ts`)
- [x] ExportControl component (`src/ui/components/ExportControl.ts`)
- [x] PNG/JPEG/WebP export formats
- [x] Export with color adjustments applied
- [x] Export with/without annotations option
- [x] Copy frame to clipboard
- [x] Keyboard shortcuts (Ctrl+S, Ctrl+C)
- [x] Export dropdown menu in toolbar

---

## Not Started

### Phase 5: Transform & Composition (Remaining)
- [ ] Transform2D (pan, zoom, rotate)
- [ ] Crop node
- [ ] Stack/composite nodes

### Future Enhancements
- [ ] Sequence export (image sequence)
- [ ] Waveform display for audio
- [ ] Lens distortion correction
- [ ] Full LUT application via WebGL shader

---

## Session Log

### 2026-01-16
- Reviewed codebase structure and PLAN.md
- Created WORKLOG.md for progress tracking
- **Completed Phase 4: Color Processing**
  - Created `ColorControls.ts` UI panel with 7 adjustment sliders
  - Implemented exposure, brightness, contrast, gamma, saturation, temperature, tint
  - Added GLSL shader with color adjustment pipeline in `Renderer.ts`
  - Integrated CSS filter-based adjustments in `Viewer.ts` for Canvas2D
  - Added keyboard shortcut (C) to toggle color panel
  - Updated help dialog with color shortcuts
- **Completed Phase 5: Wipe Comparison**
  - Created `WipeControl.ts` component with mode cycling
  - Implemented horizontal and vertical wipe modes
  - Added draggable wipe line overlay
  - Canvas clip-based split rendering (original vs color-adjusted)
  - Added keyboard shortcut (W) for wipe cycling
- **Completed Phase 8: Audio Support**
  - Created `VolumeControl.ts` with slider and mute button
  - Added volume/mute state to Session class
  - Connected volume control to video element
- **Completed Phase 9: LUT Support**
  - Created `LUTLoader.ts` with .cube file parser
  - Added LUT section to ColorControls with load/clear/intensity
  - LUT indicator badge in Viewer
- **Completed Phase 10: Frame Export**
  - Created `FrameExporter.ts` utility with export/copy functions
  - Created `ExportControl.ts` dropdown menu component
  - PNG/JPEG/WebP format support with quality settings
  - Include/exclude annotations option
  - Integrated into App.ts with keyboard shortcuts (Ctrl+S, Ctrl+C)
  - Updated toolbar help dialog with export shortcuts
- Updated CODEMAP.md feature checklist
