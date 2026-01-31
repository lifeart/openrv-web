# OpenRV Web - Code Map

## Overview

This document maps the original OpenRV C++ codebase architecture to our TypeScript/WebGL web implementation.

---

## OpenRV Architecture Analysis

### Source Repository Structure

```
OpenRV/src/lib/
├── app/          # Application-level logic, session management
├── audio/        # Audio processing and playback
├── base/         # Foundation utilities
├── files/        # File I/O operations
├── geometry/     # Geometric calculations
├── graphics/     # Rendering pipeline
├── image/        # Image format readers
├── ip/           # Image Processing (core pipeline)
│   ├── ICCNodes/     # ICC color profile nodes
│   ├── IPBaseNodes/  # Base image processing nodes
│   ├── IPCore/       # Core node infrastructure
│   │   └── glsl/     # 134 GLSL shaders
│   └── OCIONodes/    # OpenColorIO nodes
├── mu/           # Mu scripting language
├── network/      # Network communication
├── python/       # Python bindings
├── qt/           # Qt UI framework
└── ui/           # UI widgets
```

### Core Concepts

#### 1. Node Graph Architecture

OpenRV uses a **directed acyclic graph (DAG)** of processing nodes:

```
IPNode (base class)
    ├── Inputs: vector<IPNode*>
    ├── Outputs: vector<IPNode*>
    ├── Properties: PropertyContainer
    └── evaluate() → IPImage
```

**Evaluation Model:**
- Recursive traversal from output to inputs
- Each node produces an `IPImage` tree
- Changes propagate through the graph via signals

#### 2. Node Types (from IPBaseNodes)

**Source Nodes:**
- `FileSourceIPNode` - Loads images/sequences from files
- `ImageSourceIPNode` - In-memory image sources
- `SourceGroupIPNode` - Groups multiple sources

**Color Processing Nodes:**
- `ColorIPNode` - Base color operations
- `ColorCDLIPNode` - ASC CDL color correction
- `ColorCurveIPNode` - Curve-based adjustments
- `ColorExposureIPNode` - Exposure control
- `ColorGrayScaleIPNode` - Desaturation
- `ColorHighlightIPNode` - Highlight adjustments
- `ColorShadowIPNode` - Shadow adjustments
- `ColorSaturationIPNode` - Saturation control
- `ColorTemperatureIPNode` - White balance
- `ColorVibranceIPNode` - Smart saturation
- `ColorLinearToSRGBIPNode` - Color space conversion
- `ColorSRGBToLinearIPNode` - Color space conversion

**Transform Nodes:**
- `Transform2DIPNode` - Pan, zoom, rotate
- `CropIPNode` - Image cropping
- `RotateCanvasIPNode` - Canvas rotation
- `LensWarpIPNode` - Lens distortion correction

**Filter Nodes:**
- `FilterGaussianIPNode` - Gaussian blur
- `NoiseReductionIPNode` - Denoising
- `UnsharpMaskIPNode` - Sharpening
- `ClarityIPNode` - Local contrast

**Composition Nodes:**
- `StackIPNode` - Layer stacking
- `OverlayIPNode` - Overlay compositing
- `PaintIPNode` - Annotation/paint layer
- `SwitchIPNode` - Input switching

**Timing Nodes:**
- `SequenceIPNode` - Image sequence handling
- `RetimeIPNode` - Speed/timing adjustments

#### 3. GLSL Shader Categories (134 shaders)

**Color Space:**
- `ColorSRGB.glsl`, `ColorRec709.glsl`
- `ColorACESLog.glsl`, `ColorLogC.glsl`
- `ColorCineonLog.glsl`, `ColorViperLog.glsl`

**Color Correction:**
- `ColorCDL.glsl` - ASC CDL
- `ColorCurve.glsl` - Curve adjustments
- `ColorGamma.glsl` - Gamma correction
- `ColorExposure.glsl` - Exposure
- `ColorTemperature.glsl` - White balance
- `ColorVibrance.glsl` - Vibrance

**Compositing:**
- `Over.glsl`, `Add.glsl`, `Difference.glsl`
- `Premult.glsl`, `Unpremult.glsl`

**Filtering:**
- `GaussianBlur.glsl` (horizontal/vertical)
- `UnsharpMask.glsl`, `NoiseReduction.glsl`
- `BoxFilter.glsl`, `Mitchell.glsl`

**Utilities:**
- `SourceY.glsl` - Luminance extraction
- `ChannelMap.glsl` - Channel remapping
- `LUT3D.glsl` - 3D LUT application
- `Histogram.glsl` - Histogram generation
- `Dither.glsl` - Dithering

#### 4. Session File Format (GTO/RV)

Sessions are stored in GTO format with these key objects:

```
RVSession
├── RVSequenceGroup (timeline)
│   ├── RVStackGroup (layer stacks)
│   │   └── RVSourceGroup (individual sources)
│   │       ├── RVFileSource (file reference)
│   │       ├── RVLinearize (linearization)
│   │       ├── RVColor (color grading)
│   │       ├── RVTransform2D (transforms)
│   │       ├── RVLensWarp (lens correction)
│   │       └── RVPaint (annotations)
│   └── RVSequence (sequence data)
├── RVDisplayColor (display transform)
├── RVDisplayStereo (stereo settings)
└── connections (node connections)
```

#### 5. UI Components

**Timeline:**
- Frame numbers, in/out points
- Scrubbing, click-to-navigate
- Cache visualization
- Audio waveform display

**Viewer:**
- Pan/zoom/rotate controls
- Pixel inspector
- Wipes for comparison
- Annotation overlays

**Playback:**
- Play/pause/stop
- Frame stepping
- Loop modes
- Realtime vs play-all-frames

---

## Web Implementation Mapping

### Directory Structure

```
openrv-web/
├── src/
│   ├── core/                    # Core infrastructure
│   │   ├── graph/              # Node graph system
│   │   │   ├── Graph.ts        # DAG graph management
│   │   │   ├── Property.ts     # Property container
│   │   │   └── Signal.ts       # Event/signal system
│   │   ├── image/              # Image handling
│   │   │   └── Image.ts        # IPImage data structure
│   │   └── session/            # Session management
│   │       ├── Session.ts      # Session state + GTO loading
│   │       ├── SessionState.ts # Serializable state types
│   │       ├── SessionSerializer.ts # .orvproject save/load
│   │       ├── SessionGTOStore.ts # GTO property storage/retrieval
│   │       ├── SessionGTOExporter.ts # Export session to GTO format
│   │       ├── GTOGraphLoader.ts # Node graph from GTO
│   │       ├── AutoSaveManager.ts # Auto-save to IndexedDB
│   │       ├── SnapshotManager.ts # Session version snapshots
│   │       ├── PlaylistManager.ts # Multi-clip playlist management
│   │       └── index.ts        # Module exports
│   │
│   ├── nodes/                   # Processing nodes
│   │   ├── base/               # Base node types
│   │   │   ├── IPNode.ts       # Abstract base (inputs/outputs/properties)
│   │   │   └── NodeFactory.ts  # Node registry + @RegisterNode decorator
│   │   ├── sources/            # Source nodes (implemented)
│   │   │   ├── BaseSourceNode.ts   # Abstract source base
│   │   │   ├── FileSourceNode.ts   # Single image (RVFileSource)
│   │   │   ├── VideoSourceNode.ts  # Video file (RVVideoSource)
│   │   │   ├── SequenceSourceNode.ts # Image sequence (RVSequenceSource)
│   │   │   └── index.ts            # Registration + exports
│   │   ├── groups/             # Group/container nodes (implemented)
│   │   │   ├── BaseGroupNode.ts    # Abstract group base
│   │   │   ├── SequenceGroupNode.ts # Play inputs in sequence
│   │   │   ├── StackGroupNode.ts   # Stack/composite with wipes
│   │   │   ├── SwitchGroupNode.ts  # A/B switching
│   │   │   ├── LayoutGroupNode.ts  # Tile/grid layout
│   │   │   ├── FolderGroupNode.ts  # Organizational container
│   │   │   ├── RetimeGroupNode.ts  # Speed/time remapping
│   │   │   └── index.ts            # Registration + exports
│   │   ├── color/              # Color nodes (future)
│   │   ├── transform/          # Transform nodes (future)
│   │   ├── filter/             # Filter nodes (future)
│   │   └── output/             # Output nodes (future)
│   │
│   ├── render/                  # WebGL rendering
│   │   ├── Renderer.ts         # Main renderer
│   │   ├── ShaderProgram.ts    # Shader management
│   │   ├── TextureManager.ts   # Texture handling
│   │   ├── RenderPass.ts       # Render passes
│   │   └── shaders/            # GLSL shaders
│   │       ├── color/
│   │       ├── filter/
│   │       ├── composite/
│   │       └── util/
│   │
│   ├── ui/                      # User interface
│   │   ├── components/         # UI components
│   │   │   ├── Viewer.ts       # Main viewer
│   │   │   ├── Timeline.ts     # Timeline UI
│   │   │   ├── Toolbar.ts      # Toolbars
│   │   │   ├── Inspector.ts    # Property inspector
│   │   │   ├── PixelInfo.ts    # Pixel inspector
│   │   │   ├── Wipe.ts         # Wipe controls
│   │   │   ├── StereoControl.ts # Stereo 3D mode controls
│   │   │   ├── ChannelSelect.ts # Channel isolation (R/G/B/A/Luma)
│   │   │   ├── Histogram.ts    # Histogram display
│   │   │   ├── Waveform.ts     # Waveform monitor
│   │   │   ├── Vectorscope.ts  # Vectorscope display
│   │   │   ├── CurvesControl.ts # Color curves editor
│   │   │   ├── ViewerSplitScreen.ts # Split screen A/B comparison
│   │   │   ├── ThumbnailManager.ts # Timeline thumbnail generation
│   │   │   ├── GhostFrameControl.ts # Ghost frames / onion skin
│   │   │   ├── SnapshotPanel.ts # Session snapshot management
│   │   │   └── PlaylistPanel.ts # Multi-clip playlist UI
│   │   ├── controls/           # Input handling
│   │   │   ├── PanZoom.ts      # Pan/zoom control
│   │   │   ├── Keyboard.ts     # Keyboard shortcuts
│   │   │   └── Mouse.ts        # Mouse handling
│   │   └── overlays/           # Overlay rendering
│   │       ├── Annotations.ts  # Paint/annotations
│   │       ├── Grid.ts         # Grid overlay
│   │       └── SafeZones.ts    # Safe zone guides
│   │
│   ├── paint/                   # Annotation system
│   │   ├── PaintEngine.ts      # Paint operations
│   │   ├── Brush.ts            # Brush types
│   │   ├── Stroke.ts           # Stroke data
│   │   └── PaintRenderer.ts    # Paint rendering
│   │
│   ├── stereo/                  # Stereoscopic 3D viewing
│   │   ├── StereoRenderer.ts   # Stereo mode rendering (8 modes)
│   │   └── StereoRenderer.test.ts # Unit tests
│   │
│   ├── audio/                   # Audio handling
│   │   ├── AudioEngine.ts      # Web Audio API
│   │   ├── AudioTrack.ts       # Track management
│   │   └── Waveform.ts         # Waveform display
│   │
│   ├── formats/                 # File format support
│   │   ├── ImageLoader.ts      # Generic loader
│   │   ├── loaders/
│   │   │   ├── PNGLoader.ts
│   │   │   ├── JPEGLoader.ts
│   │   │   ├── EXRLoader.ts    # Via exr.js
│   │   │   └── WebPLoader.ts
│   │   └── SequenceLoader.ts   # Sequence handling
│   │
│   ├── utils/                   # Utilities
│   │   ├── math/               # Math utilities
│   │   │   ├── Matrix.ts
│   │   │   ├── Vector.ts
│   │   │   └── Color.ts
│   │   ├── EventEmitter.ts     # Event system
│   │   └── Cache.ts            # LRU cache
│   │
│   ├── App.ts                   # Main application
│   └── main.ts                  # Entry point
│
├── public/
│   └── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── PLAN.md
```

### Component Mapping Table

| OpenRV Component | Web Implementation | Notes |
|-----------------|-------------------|-------|
| `IPNode` | `src/nodes/base/IPNode.ts` | Abstract base with inputs/outputs/properties |
| `IPGraph` | `src/core/graph/Graph.ts` | DAG management, evaluation |
| `IPImage` | `src/core/image/Image.ts` | Image data + metadata |
| `ImageRenderer` | `src/render/Renderer.ts` | WebGL-based rendering |
| `ShaderProgram` | `src/render/ShaderProgram.ts` | WebGL shader compilation |
| `Session` | `src/core/session/Session.ts` | Session state management |
| GTO I/O | `gto-js` library | Already implemented |
| `FileSourceIPNode` | `src/nodes/source/FileSourceNode.ts` | Web image loading |
| `ColorIPNode` | `src/nodes/color/ColorNode.ts` | Color operations |
| `Transform2DIPNode` | `src/nodes/transform/Transform2DNode.ts` | 2D transforms |
| `PaintIPNode` | `src/paint/PaintEngine.ts` | Canvas-based annotations |
| `StereoIPNode` | `src/stereo/StereoRenderer.ts` | 8 stereo viewing modes |
| Timeline UI | `src/ui/components/Timeline.ts` | Custom canvas timeline |
| Viewer | `src/ui/components/Viewer.ts` | WebGL canvas viewer |
| Histogram | `src/ui/components/Histogram.ts` | Real-time histogram |
| Waveform | `src/ui/components/Waveform.ts` | Waveform monitor |
| Vectorscope | `src/ui/components/Vectorscope.ts` | Color vectorscope |
| Split Screen | `src/ui/components/ViewerSplitScreen.ts` | A/B split comparison |
| Timeline Thumbnails | `src/ui/components/ThumbnailManager.ts` | Frame preview thumbnails |
| Ghost Frames | `src/ui/components/GhostFrameControl.ts` | Onion skin overlay |
| Snapshots | `src/core/session/SnapshotManager.ts` | Session version history |
| Playlist | `src/core/session/PlaylistManager.ts` | Multi-clip sequencing |

### Shader Mapping

Core shaders to port (priority order):

1. **Essential (Phase 1):**
   - `SourceRGBA.glsl` → Basic image display
   - `ColorSRGB.glsl` → sRGB conversion
   - `Over.glsl` → Basic compositing
   - `Premult.glsl` / `Unpremult.glsl` → Alpha handling

2. **Color Correction (Phase 2):**
   - `ColorCDL.glsl` → ASC CDL
   - `ColorExposure.glsl` → Exposure
   - `ColorGamma.glsl` → Gamma
   - `ColorCurve.glsl` → Curves
   - `ColorSaturation.glsl` → Saturation

3. **Transforms (Phase 2):**
   - `Transform2D.glsl` → Pan/zoom/rotate
   - `Crop.glsl` → Cropping

4. **Filters (Phase 3):**
   - `GaussianBlur.glsl` → Blur
   - `UnsharpMask.glsl` → Sharpen

5. **Advanced (Phase 4):**
   - `LUT3D.glsl` → 3D LUTs
   - `LensWarp.glsl` → Lens correction

### Data Flow

```
[File/URL] → [Loader] → [SourceNode] → [ProcessingNodes] → [DisplayNode] → [WebGL Canvas]
                              ↓
                         [Renderer]
                              ↓
                      [ShaderProgram]
                              ↓
                    [FrameBuffer Chain]
```

### GTO Integration (via gto-js)

```typescript
import { SimpleReader, GTODTO } from 'gto-js';

// Load session
const reader = new SimpleReader();
reader.open(sessionData);
const dto = new GTODTO(reader.result);

// Query session structure
const sources = dto.byProtocol('RVFileSource');
const colorNodes = dto.byProtocol('RVColor');
const transforms = dto.byProtocol('RVTransform2D');
const annotations = dto.byProtocol('RVPaint');
```

### Key Differences from C++ Implementation

1. **Rendering:** OpenGL → WebGL2
2. **Threading:** Multithreaded C++ → Single-threaded JS with Web Workers
3. **File I/O:** Direct file access → Fetch API / File API
4. **Image Formats:** Native codecs → Web codecs + JS libraries
5. **Audio:** Native audio APIs → Web Audio API
6. **UI:** Qt widgets → HTML5/CSS/Canvas

### Browser Limitations to Handle

- **Memory:** Large image sequences need streaming/caching
- **Formats:** EXR requires JS decoder (exr.js)
- **Performance:** Heavy operations need Web Workers
- **File Access:** File System Access API for local files
- **Color Precision:** WebGL2 for float textures

---

## External Dependencies

### Required

| Package | Purpose | Maps to OpenRV |
|---------|---------|----------------|
| `gto-js` | GTO/RV file parsing | TwkGTO library |
| `gl-matrix` | Math operations | TwkMath |
| `exr.js` | EXR file loading | IOexr |

### Optional/Recommended

| Package | Purpose |
|---------|---------|
| `zustand` or `jotai` | State management |
| `@tweenjs/tween.js` | Animation |
| `pako` | Gzip decompression |

---

## Feature Parity Checklist

### MVP (Minimum Viable Product)
- [x] Load RV session files
- [x] Display single images
- [x] Basic playback controls
- [x] Timeline with scrubbing
- [x] Pan/zoom viewer

### Phase 2
- [x] Image sequences (numbered files: frame_001.png, file.001.exr, etc.)
- [x] Basic color correction (exposure, gamma, saturation, contrast, temperature, tint)
- [x] 2D transforms (rotation 90°/180°/270°, flip horizontal/vertical)
- [x] Crop tool (aspect ratio presets, rule of thirds guides)
- [x] Keyboard shortcuts

### Phase 3
- [x] Annotations/paint
- [x] Wipes for comparison (horizontal/vertical, original vs adjusted)
- [x] Multiple sources (stack with blend modes)
- [x] Filter effects (blur, sharpen with unsharp mask)

### Phase 4
- [x] Audio playback (video volume control with mute)
- [x] Audio waveform display (timeline visualization for video audio)
- [x] LUT support (.cube 3D LUT loading with intensity control)
- [x] Advanced color (ASC CDL with slope/offset/power/saturation, .cdl file support)
- [x] Export capabilities (PNG/JPEG/WebP with annotations, clipboard copy)
- [x] Sequence export (in/out range or all frames with progress)
- [x] Lens distortion correction (barrel/pincushion, center offset, scale)
- [x] WebGL LUT processing (GPU-accelerated 3D LUT with trilinear interpolation)

### Phase 5 (Node Graph Architecture)
- [x] Session save/load (.orvproject JSON format with full state serialization)
- [x] Source nodes (FileSourceNode, VideoSourceNode, SequenceSourceNode)
- [x] Group nodes (SequenceGroup, StackGroup, SwitchGroup, LayoutGroup, FolderGroup, RetimeGroup)
- [x] Node factory with @RegisterNode decorator pattern
- [x] GTOGraphLoader for node graph reconstruction from GTO/RV files
- [x] Graph integration with Session (graph loaded on GTO file open)

### Phase 6 (Professional Viewing Tools)
- [x] Channel isolation (RGB/R/G/B/Alpha/Luminance with keyboard shortcuts)
- [x] Histogram display (RGB/Luminance/Separate modes, log scale)
- [x] Waveform monitor (Luma/RGB/Parade modes)
- [x] Vectorscope (color targets, skin tone indicator, zoom levels)
- [x] A/B source compare (auto-assignment, keyboard toggle)
- [x] Color curves (Bezier curve editor, channel presets, import/export)
- [x] Stereo viewing modes (side-by-side, over-under, mirror, anaglyph, checkerboard, scanline)
- [x] Eye swap and convergence offset controls

### Phase 7 (Advanced Comparison & Session Management)
- [x] Split screen compare (horizontal/vertical A/B side-by-side, draggable divider)
- [x] Timeline thumbnails (LRU cache, progressive loading, automatic recalculation)
- [x] Ghost frames / onion skin (configurable before/after frames, opacity falloff, color tinting)
- [x] Session snapshots (IndexedDB storage, manual + auto-checkpoints, preview, export/import)
- [x] Multi-clip playlist (add/remove/reorder clips, loop modes, EDL export)
