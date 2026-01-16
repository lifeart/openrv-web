# OpenRV Web - Work Log

## Current Status: UI Redesign Complete

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

### Phase 11: Image Sequences ✅
- [x] SequenceLoader utility (`src/utils/SequenceLoader.ts`)
- [x] Frame number extraction from filenames (supports: frame_001.png, file.001.png, etc.)
- [x] Automatic frame sorting by number
- [x] Lazy frame loading with caching
- [x] Memory management (releases distant frames)
- [x] Session.loadSequence() method
- [x] Viewer sequence frame rendering
- [x] Multi-file selection in Open dialog
- [x] Drag-and-drop multiple images as sequence
- [x] Preloading adjacent frames for smooth playback

### Phase 12: Timeline Annotation Markers ✅
- [x] Yellow triangle markers below timeline for frames with annotations
- [x] PaintEngine.getAnnotatedFrames() returns Set of annotated frame numbers
- [x] PaintEngine.hasAnnotationsOnFrame() check for individual frames
- [x] Timeline.setPaintEngine() for late binding
- [x] Double-click timeline to jump to nearest annotated frame
- [x] Keyboard shortcuts: < / , (previous), > / . (next) annotation
- [x] Markers update when annotations are added/removed

### Phase 13: 2D Transforms ✅
- [x] TransformControl component (`src/ui/components/TransformControl.ts`)
- [x] Rotate left/right 90° buttons
- [x] Flip horizontal/vertical toggle buttons
- [x] Reset transforms button
- [x] Canvas context transforms in Viewer.drawWithTransform()
- [x] Keyboard shortcuts: Shift+R (rotate left), Alt+R (rotate right), Shift+H (flip H), Shift+V (flip V)
- [x] Transform state (rotation: 0/90/180/270, flipH, flipV)

### Phase 14: Sequence Export ✅
- [x] SequenceExporter utility (`src/utils/SequenceExporter.ts`)
- [x] Frame-by-frame export with progress tracking
- [x] Export In/Out range or all frames
- [x] Filename pattern with zero-padded frame numbers (e.g., frame_0001.png)
- [x] Progress dialog with cancel button
- [x] ExportControl dropdown with sequence export options
- [x] Viewer.renderFrameToCanvas() for rendering specific frames
- [x] App.handleSequenceExport() integrates everything

### Phase 15: Filter Effects ✅
- [x] FilterControl component (`src/ui/components/FilterControl.ts`)
- [x] Blur filter (0-20px range) using CSS blur() filter
- [x] Sharpen filter (0-100 amount) using canvas convolution kernel
- [x] Unsharp mask algorithm with 3x3 kernel
- [x] Double-click to reset individual sliders
- [x] Reset all button
- [x] Keyboard shortcut (G) to toggle filter panel
- [x] Filter state indicator (highlighted button when active)

### Phase 16: Crop Tool ✅
- [x] CropControl component (`src/ui/components/CropControl.ts`)
- [x] Enable/disable crop mode toggle
- [x] Preset aspect ratios (Free, 16:9, 4:3, 1:1, 9:16, 2.35:1)
- [x] Crop overlay canvas with darkened areas outside crop region
- [x] Blue border and corner handles for crop region
- [x] Rule of thirds guides within crop area
- [x] Keyboard shortcut (K) to toggle crop mode
- [x] Crop state indicator (highlighted button when active)

### Phase 17: Audio Waveform Display ✅
- [x] WaveformRenderer utility (`src/audio/WaveformRenderer.ts`)
- [x] Audio extraction from video using Web Audio API
- [x] Peak data calculation for efficient visualization
- [x] Waveform rendering in timeline track area
- [x] Light blue waveform overlay on track background
- [x] Automatic loading when video is loaded
- [x] Graceful fallback when audio extraction fails

### Phase 18: ASC CDL Color Correction ✅
- [x] CDL utility (`src/color/CDL.ts`) with types and transformation functions
- [x] CDLControl component (`src/ui/components/CDLControl.ts`)
- [x] Per-channel RGB sliders for Slope, Offset, Power
- [x] Global Saturation slider
- [x] Load/Save CDL files (.cdl XML format)
- [x] Reset button to clear all adjustments
- [x] Canvas-based CDL application with Rec. 709 luminance
- [x] Button highlights when CDL is active

### Phase 19: Lens Distortion Correction ✅
- [x] LensDistortion utility (`src/transform/LensDistortion.ts`)
- [x] Brown-Conrady distortion model implementation
- [x] Radial distortion coefficients (k1, k2)
- [x] Center offset adjustment (centerX, centerY)
- [x] Scale control for distortion compensation
- [x] Bilinear interpolation for smooth results
- [x] LensControl component (`src/ui/components/LensControl.ts`)
- [x] Sliders for all distortion parameters
- [x] Presets (Barrel, None, Pincushion)
- [x] Reset button and double-click slider reset
- [x] Button highlights when lens correction is active
- [x] Integration with Viewer rendering pipeline

### Phase 20: Stack/Composite Layers ✅
- [x] BlendModes utility (`src/composite/BlendModes.ts`)
- [x] Blend modes: Normal, Add, Multiply, Screen, Overlay, Difference, Exclusion
- [x] Alpha compositing with Porter-Duff "over" operation
- [x] Per-layer opacity control
- [x] Image resize for mismatched layer dimensions
- [x] StackControl component (`src/ui/components/StackControl.ts`)
- [x] Layer list with visibility toggles
- [x] Reorder layers (move up/down)
- [x] Per-layer blend mode and opacity controls
- [x] Add/remove layers from current source
- [x] Session multi-source support (getSourceByIndex, sourceCount)
- [x] Viewer stack compositing integration
- [x] Post-processing effects applied after compositing

### Phase 21: WebGL LUT Processing ✅
- [x] WebGLLUTProcessor class (`src/color/WebGLLUT.ts`)
- [x] GLSL vertex and fragment shaders for 3D LUT
- [x] WebGL2 3D texture for LUT data storage
- [x] Hardware trilinear interpolation for smooth color grading
- [x] LUT intensity/mix control (blend original with LUT-transformed)
- [x] Automatic Y-axis flip for WebGL coordinate system
- [x] Graceful fallback when WebGL2 not available
- [x] Integration with Viewer rendering pipeline
- [x] Proper resource cleanup on dispose

---

## All Features Complete

The OpenRV Web viewer now has feature parity with the core OpenRV functionality for web-based playback and review.

### UI Redesign Complete

The UI has been redesigned with a modern tab-based architecture matching professional CGI tools like DaVinci Resolve and Nuke:
- **HeaderBar**: Compact top bar with file operations, playback controls, volume, and help
- **TabBar**: 5 organized tabs (View, Color, Effects, Transform, Annotate)
- **ContextToolbar**: Context-sensitive controls that change based on active tab
- **Keyboard shortcuts**: 1-5 for quick tab navigation

---

## Session Log

### 2026-01-16 (continued)
- **UI Fixes and Unification**
  - Fixed z-index issues for all dropdown panels (StackControl, ColorControls, CDLControl, FilterControl, LensControl, ExportControl)
  - Panels now render at body level with `position: fixed` and `z-index: 9999` to avoid stacking context issues
  - Created unified shared components in `src/ui/components/shared/`:
    - `Button.ts` - Unified button component with variants (default, primary, danger, ghost, icon) and sizes (sm, md, lg)
    - `Modal.ts` - Native modal dialogs replacing browser alerts (`showAlert`, `showConfirm`, `showPrompt`, `showModal`)
    - `Panel.ts` - Reusable dropdown panel utility
  - Replaced all 14 `alert()` calls with proper modal dialogs across App.ts, Viewer.ts, HeaderBar.ts, CDLControl.ts, ColorControls.ts

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
- **Completed Phase 11: Image Sequences**
  - Created `SequenceLoader.ts` with frame number parsing and sorting
  - Added `loadSequence()` method to Session.ts
  - Updated Viewer.ts for sequence frame rendering with caching
  - Multi-file selection detects image sequences automatically
  - Drag-and-drop multiple images loads as sequence
  - Memory management: preloads adjacent frames, releases distant ones
- **Completed Phase 12: Timeline Annotation Markers**
  - Added yellow triangle markers below timeline for annotated frames
  - Double-click timeline to jump to nearest annotation
  - Keyboard shortcuts: < / , and > / . for prev/next annotation
  - Timeline redraws when annotations change
- **Completed Phase 13: 2D Transforms**
  - Created `TransformControl.ts` with rotate/flip buttons
  - Added `drawWithTransform()` to Viewer for canvas transforms
  - Rotation (0°/90°/180°/270°) and flip (H/V) support
  - Keyboard shortcuts: Shift+R, Alt+R, Shift+H, Shift+V
- Updated CODEMAP.md feature checklist
- **Completed Phase 14: Sequence Export**
  - Created `SequenceExporter.ts` with frame-by-frame download
  - Added sequence export options to ExportControl dropdown
  - Export In/Out range or all frames to PNG/JPEG/WebP
  - Progress dialog with cancel button and percentage
  - Added `renderFrameToCanvas()` to Viewer for specific frame rendering
  - App.handleSequenceExport() coordinates the export process
- **Completed Phase 15: Filter Effects**
  - Created `FilterControl.ts` with blur and sharpen sliders
  - Blur uses CSS blur() filter (0-20px)
  - Sharpen uses canvas convolution with 3x3 unsharp mask kernel
  - Added Viewer.applySharpen() for pixel-level sharpening
  - Keyboard shortcut: G to toggle filter panel
  - Filter state highlighted in button when active
- **Completed Phase 16: Crop Tool**
  - Created `CropControl.ts` with enable toggle and aspect ratio presets
  - Added crop overlay canvas to Viewer with darkened regions
  - Blue border, corner handles, and rule of thirds guides
  - Keyboard shortcut: K to toggle crop mode
- **Completed Phase 17: Audio Waveform Display**
  - Created `WaveformRenderer.ts` with Web Audio API audio extraction
  - Peak data calculation for efficient rendering
  - Integrated waveform display into Timeline component
  - Automatic loading when video source is loaded
- **Completed Phase 18: ASC CDL Color Correction**
  - Created `CDL.ts` with ASC CDL types, formulas, and XML parsing
  - Created `CDLControl.ts` with RGB channel sliders for Slope/Offset/Power
  - Added Saturation slider and Load/Save CDL file support
  - Applied CDL via canvas ImageData manipulation in Viewer
- **Completed Phase 19: Lens Distortion Correction**
  - Created `LensDistortion.ts` with Brown-Conrady distortion model
  - Radial distortion (k1, k2), center offset, scale parameters
  - Bilinear interpolation for smooth image quality
  - Created `LensControl.ts` with sliders and preset buttons
  - Integrated into Viewer with automatic rendering pipeline
- **Completed Phase 20: Stack/Composite Layers**
  - Created `BlendModes.ts` with 7 blend modes (Normal, Add, Multiply, Screen, Overlay, Difference, Exclusion)
  - Alpha compositing using Porter-Duff "over" operation
  - Created `StackControl.ts` with layer management UI
  - Layer visibility, opacity, blend mode, and reordering controls
  - Integrated stack compositing into Viewer rendering pipeline
- **Completed Phase 21: WebGL LUT Processing**
  - Created `WebGLLUT.ts` with WebGL2-based 3D LUT processor
  - GLSL shaders for GPU-accelerated trilinear interpolation
  - 3D texture storage for LUT data
  - Intensity control for blending original with graded image
  - Integrated into Viewer with automatic fallback
- **UI Redesign: Tab-Based Architecture**
  - Created `UI.md` with comprehensive redesign plan
  - Created `HeaderBar.ts` component (file ops, playback, volume, help)
  - Created `TabBar.ts` component (View | Color | Effects | Transform | Annotate)
  - Created `ContextToolbar.ts` component (context-sensitive toolbar per tab)
  - Reorganized controls into logical tab groups:
    - View tab: Zoom controls, Wipe comparison, Stack layers
    - Color tab: Color adjustments, CDL controls
    - Effects tab: Filter controls, Lens distortion
    - Transform tab: Rotation/flip, Crop tool
    - Annotate tab: Paint tools, brush settings
  - Added keyboard shortcuts (1-5) for tab navigation
  - Removed old single-row toolbar in favor of modern tab-based UI
  - SVG icons for playback controls in HeaderBar
