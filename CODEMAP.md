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
│   │   │   ├── Node.ts         # Base node class
│   │   │   ├── Graph.ts        # Graph management
│   │   │   ├── Property.ts     # Property system
│   │   │   └── Signal.ts       # Change propagation
│   │   ├── image/              # Image handling
│   │   │   ├── Image.ts        # Image data structure
│   │   │   ├── FrameBuffer.ts  # WebGL framebuffer
│   │   │   └── Loader.ts       # Image loading
│   │   └── session/            # Session management
│   │       ├── Session.ts      # Session state
│   │       ├── Serializer.ts   # GTO integration
│   │       └── Timeline.ts     # Timeline logic
│   │
│   ├── nodes/                   # Processing nodes
│   │   ├── base/               # Base node types
│   │   │   ├── IPNode.ts       # Abstract base
│   │   │   └── NodeFactory.ts  # Node creation
│   │   ├── source/             # Source nodes
│   │   │   ├── FileSourceNode.ts
│   │   │   ├── ImageSourceNode.ts
│   │   │   └── SequenceNode.ts
│   │   ├── color/              # Color nodes
│   │   │   ├── ColorNode.ts
│   │   │   ├── CDLNode.ts
│   │   │   ├── CurveNode.ts
│   │   │   ├── ExposureNode.ts
│   │   │   └── ...
│   │   ├── transform/          # Transform nodes
│   │   │   ├── Transform2DNode.ts
│   │   │   ├── CropNode.ts
│   │   │   └── LensWarpNode.ts
│   │   ├── filter/             # Filter nodes
│   │   │   ├── GaussianBlurNode.ts
│   │   │   ├── UnsharpMaskNode.ts
│   │   │   └── NoiseReductionNode.ts
│   │   ├── composite/          # Composite nodes
│   │   │   ├── StackNode.ts
│   │   │   ├── OverlayNode.ts
│   │   │   └── SwitchNode.ts
│   │   └── output/             # Output nodes
│   │       ├── DisplayNode.ts
│   │       └── ExportNode.ts
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
│   │   │   └── Wipe.ts         # Wipe controls
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
| Timeline UI | `src/ui/components/Timeline.ts` | Custom canvas timeline |
| Viewer | `src/ui/components/Viewer.ts` | WebGL canvas viewer |

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
- [ ] Load RV session files
- [ ] Display single images
- [ ] Basic playback controls
- [ ] Timeline with scrubbing
- [ ] Pan/zoom viewer

### Phase 2
- [ ] Image sequences
- [ ] Basic color correction (exposure, gamma, saturation)
- [ ] 2D transforms
- [ ] Keyboard shortcuts

### Phase 3
- [ ] Annotations/paint
- [ ] Wipes for comparison
- [ ] Multiple sources (stack)
- [ ] Filter effects

### Phase 4
- [ ] Audio playback
- [ ] LUT support
- [ ] Advanced color (CDL, curves)
- [ ] Export capabilities
