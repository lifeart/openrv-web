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
│   ├── api/                     # Public API layer
│   │   ├── OpenRVAPI.ts         # Main API facade
│   │   ├── AudioAPI.ts          # Audio control API
│   │   ├── ColorAPI.ts          # Color adjustment API
│   │   ├── EventsAPI.ts         # Event subscription API
│   │   ├── LoopAPI.ts           # Loop mode API
│   │   ├── MarkersAPI.ts        # Timeline markers API
│   │   ├── MediaAPI.ts          # Media loading API
│   │   ├── PlaybackAPI.ts       # Playback control API
│   │   ├── ViewAPI.ts           # Viewer control API
│   │   └── index.ts             # Module exports
│   │
│   ├── audio/                   # Audio handling
│   │   ├── AudioPlaybackManager.ts # Web Audio API playback
│   │   └── WaveformRenderer.ts  # Audio waveform rendering
│   │
│   ├── color/                   # Color science & processing
│   │   ├── BrowserColorSpace.ts # Browser color space detection
│   │   ├── CDL.ts               # ASC CDL color correction
│   │   ├── ColorCurves.ts       # Curve-based color adjustments
│   │   ├── DisplayCapabilities.ts # Display HDR feature detection
│   │   ├── DisplayTransfer.ts   # Display transfer functions
│   │   ├── HDRPixelData.ts      # HDR pixel data handling
│   │   ├── HueRotation.ts       # Hue rotation matrix
│   │   ├── Inversion.ts         # Color inversion
│   │   ├── LogCurves.ts         # Log curve transforms
│   │   ├── LUTFormatDetect.ts   # LUT file format detection
│   │   ├── LUTFormats.ts        # LUT format parsers
│   │   ├── LUTLoader.ts         # LUT file loading
│   │   ├── LUTPrecision.ts      # LUT precision utilities
│   │   ├── LUTUtils.ts          # LUT utility functions
│   │   ├── OCIOConfig.ts        # OCIO config representation
│   │   ├── OCIOConfigParser.ts  # OCIO config file parser
│   │   ├── OCIOProcessor.ts     # OCIO color processing
│   │   ├── OCIOTransform.ts     # OCIO transform operations
│   │   ├── SafeCanvasContext.ts # Safe canvas context creation
│   │   ├── TetrahedralInterp.ts # Tetrahedral LUT interpolation
│   │   ├── TransferFunctions.ts # EOTF/OETF transfer functions
│   │   ├── WebGLLUT.ts          # GPU-accelerated LUT processing
│   │   └── pipeline/            # LUT pipeline system
│   │       ├── GPULUTChain.ts   # GPU LUT chain processing
│   │       ├── LUTPipeline.ts   # LUT pipeline orchestration
│   │       ├── LUTPipelineState.ts # Pipeline state management
│   │       ├── LUTStage.ts      # Individual LUT stage
│   │       └── PreCacheLUTStage.ts # Pre-cached LUT stage
│   │
│   ├── composite/               # Compositing operations
│   │   └── BlendModes.ts        # Blend mode implementations
│   │
│   ├── core/                    # Core infrastructure
│   │   ├── graph/               # Node graph system
│   │   │   ├── Graph.ts         # DAG graph management
│   │   │   ├── Property.ts      # Property container
│   │   │   └── Signal.ts        # Event/signal system
│   │   ├── image/               # Image handling
│   │   │   └── Image.ts         # IPImage data structure (HDR VideoFrame support)
│   │   └── session/             # Session management
│   │       ├── Session.ts       # Session state + GTO loading
│   │       ├── SessionState.ts  # Serializable state types
│   │       ├── SessionSerializer.ts # .orvproject save/load
│   │       ├── SessionGTOStore.ts # GTO property storage/retrieval
│   │       ├── SessionGTOExporter.ts # Export session to GTO format
│   │       ├── GTOGraphLoader.ts # Node graph from GTO
│   │       ├── AutoSaveManager.ts # Auto-save to IndexedDB
│   │       ├── SnapshotManager.ts # Session version snapshots
│   │       ├── PlaylistManager.ts # Multi-clip playlist management
│   │       └── index.ts         # Module exports
│   │
│   ├── filters/                 # Image filter effects
│   │   ├── NoiseReduction.ts    # Noise reduction filter
│   │   ├── WebGLNoiseReduction.ts # GPU noise reduction
│   │   └── WebGLSharpen.ts      # GPU unsharp mask sharpening
│   │
│   ├── formats/                 # File format decoders
│   │   ├── CineonDecoder.ts     # Cineon format decoder
│   │   ├── DPXDecoder.ts        # DPX format decoder
│   │   ├── DecoderRegistry.ts   # Format decoder registry
│   │   ├── EXRDecoder.ts        # OpenEXR decoder (via exr.js)
│   │   ├── JPEGGainmapDecoder.ts # JPEG gainmap HDR decoder
│   │   ├── LogLinear.ts         # Log-to-linear conversion
│   │   ├── TIFFFloatDecoder.ts  # Float TIFF decoder
│   │   └── index.ts             # Decoder registration + exports
│   │
│   ├── network/                 # Network synchronization
│   │   ├── MessageProtocol.ts   # Sync message protocol
│   │   ├── NetworkSyncManager.ts # Network sync orchestration
│   │   ├── SyncStateManager.ts  # Synchronized state management
│   │   ├── WebSocketClient.ts   # WebSocket client connection
│   │   └── types.ts             # Network type definitions
│   │
│   ├── nodes/                   # Processing nodes
│   │   ├── base/                # Base node types
│   │   │   ├── IPNode.ts        # Abstract base (inputs/outputs/properties)
│   │   │   └── NodeFactory.ts   # Node registry + @RegisterNode decorator
│   │   ├── sources/             # Source nodes
│   │   │   ├── BaseSourceNode.ts    # Abstract source base
│   │   │   ├── FileSourceNode.ts    # Single image (RVFileSource)
│   │   │   ├── VideoSourceNode.ts   # Video file (RVVideoSource)
│   │   │   ├── SequenceSourceNode.ts # Image sequence (RVSequenceSource)
│   │   │   └── index.ts             # Registration + exports
│   │   └── groups/              # Group/container nodes
│   │       ├── BaseGroupNode.ts     # Abstract group base
│   │       ├── SequenceGroupNode.ts # Play inputs in sequence
│   │       ├── StackGroupNode.ts    # Stack/composite with wipes
│   │       ├── SwitchGroupNode.ts   # A/B switching
│   │       ├── LayoutGroupNode.ts   # Tile/grid layout
│   │       ├── FolderGroupNode.ts   # Organizational container
│   │       ├── RetimeGroupNode.ts   # Speed/time remapping
│   │       └── index.ts             # Registration + exports
│   │
│   ├── paint/                   # Annotation system
│   │   ├── PaintEngine.ts       # Paint operations + stroke management
│   │   ├── PaintRenderer.ts     # Paint rendering to canvas
│   │   └── types.ts             # Paint type definitions
│   │
│   ├── render/                  # WebGL/WebGPU rendering
│   │   ├── Renderer.ts          # Main WebGL2 renderer (shader pipeline)
│   │   ├── RendererBackend.ts   # Renderer backend abstraction
│   │   ├── ShaderProgram.ts     # WebGL shader compilation
│   │   ├── TextureCacheManager.ts # Texture cache management
│   │   ├── WebGPUBackend.ts     # WebGPU rendering backend
│   │   └── createRenderer.ts    # Renderer factory
│   │
│   ├── scopes/                  # Video scopes (GPU-accelerated)
│   │   └── WebGLScopes.ts       # WebGL histogram/waveform/vectorscope
│   │
│   ├── stereo/                  # Stereoscopic 3D viewing
│   │   ├── StereoRenderer.ts    # Stereo mode rendering (8 modes)
│   │   ├── StereoAlignOverlay.ts # Stereo alignment overlay
│   │   └── StereoEyeTransform.ts # Per-eye transform controls
│   │
│   ├── transform/               # Geometric transforms
│   │   └── LensDistortion.ts    # Lens distortion correction
│   │
│   ├── ui/                      # User interface
│   │   └── components/          # UI components
│   │       ├── Viewer.ts            # Main WebGL canvas viewer
│   │       ├── ViewerEffects.ts     # Viewer effects pipeline
│   │       ├── ViewerExport.ts      # Viewer frame export
│   │       ├── ViewerInteraction.ts # Viewer input handling (pan/zoom/mouse)
│   │       ├── ViewerPrerender.ts   # Viewer frame pre-rendering
│   │       ├── ViewerRenderingUtils.ts # Viewer rendering helpers
│   │       ├── ViewerSplitScreen.ts # Split screen A/B comparison
│   │       ├── ViewerWipe.ts        # Wipe comparison overlay
│   │       ├── Timeline.ts          # Timeline UI with scrubbing
│   │       ├── TimelineEditor.ts    # Timeline editing controls
│   │       ├── ThumbnailManager.ts  # Timeline thumbnail generation
│   │       ├── TimecodeDisplay.ts   # Timecode readout
│   │       ├── TimecodeOverlay.ts   # Timecode burn-in overlay
│   │       ├── Histogram.ts         # Histogram display
│   │       ├── Waveform.ts          # Waveform monitor
│   │       ├── Vectorscope.ts       # Color vectorscope
│   │       ├── ScopesControl.ts     # Scopes panel control
│   │       ├── ChannelSelect.ts     # Channel isolation (R/G/B/A/Luma)
│   │       ├── ColorControls.ts     # Color adjustment panel
│   │       ├── ColorInversionToggle.ts # Color inversion toggle
│   │       ├── ColorWheels.ts       # Lift/gamma/gain color wheels
│   │       ├── CurvesControl.ts     # Color curves editor
│   │       ├── CurveEditor.ts       # Bezier curve editor widget
│   │       ├── CDLControl.ts        # ASC CDL controls
│   │       ├── CompareControl.ts    # A/B source comparison
│   │       ├── WipeControl.ts       # Wipe mode controls
│   │       ├── CropControl.ts       # Crop tool controls
│   │       ├── TransformControl.ts  # Transform controls
│   │       ├── FilterControl.ts     # Filter effects panel
│   │       ├── NoiseReductionControl.ts # Noise reduction UI
│   │       ├── LensControl.ts       # Lens distortion controls
│   │       ├── ExportControl.ts     # Export settings panel
│   │       ├── StereoControl.ts     # Stereo 3D mode controls
│   │       ├── StereoAlignControl.ts # Stereo alignment controls
│   │       ├── StereoEyeTransformControl.ts # Per-eye transform UI
│   │       ├── StackControl.ts      # Stack/composite controls
│   │       ├── VolumeControl.ts     # Audio volume control
│   │       ├── ZoomControl.ts       # Zoom level control
│   │       ├── PaintToolbar.ts      # Paint annotation toolbar
│   │       ├── TextFormattingToolbar.ts # Text annotation formatting
│   │       ├── GhostFrameControl.ts # Ghost frames / onion skin
│   │       ├── SnapshotPanel.ts     # Session snapshot management
│   │       ├── PlaylistPanel.ts     # Multi-clip playlist UI
│   │       ├── HistoryPanel.ts      # Undo/redo history panel
│   │       ├── InfoPanel.ts         # Image info panel
│   │       ├── MarkerListPanel.ts   # Timeline marker list
│   │       ├── NetworkControl.ts    # Network sync controls
│   │       ├── OCIOControl.ts       # OCIO config controls
│   │       ├── DisplayProfileControl.ts # Display profile selection
│   │       ├── ToneMappingControl.ts # Tone mapping controls
│   │       ├── LUTPipelinePanel.ts  # LUT pipeline panel
│   │       ├── LUTStageControl.ts   # LUT stage controls
│   │       ├── PARControl.ts        # Pixel aspect ratio control
│   │       ├── ThemeControl.ts      # UI theme controls
│   │       ├── BackgroundPatternControl.ts # Background pattern control
│   │       ├── AutoSaveIndicator.ts # Auto-save status indicator
│   │       ├── CacheIndicator.ts    # Cache status indicator
│   │       ├── FalseColor.ts        # False color visualization
│   │       ├── FalseColorControl.ts # False color controls
│   │       ├── HSLQualifier.ts      # HSL qualifier keying
│   │       ├── HSLQualifierControl.ts # HSL qualifier controls
│   │       ├── LuminanceVisualization.ts # Luminance visualization
│   │       ├── LuminanceVisualizationControl.ts # Luminance viz controls
│   │       ├── ClippingOverlay.ts   # Highlight/shadow clipping overlay
│   │       ├── SafeAreasOverlay.ts  # Safe area guides overlay
│   │       ├── SafeAreasControl.ts  # Safe area controls
│   │       ├── SpotlightOverlay.ts  # Spotlight/focus overlay
│   │       ├── MatteOverlay.ts      # Matte overlay
│   │       ├── DifferenceMatteControl.ts # Difference matte controls
│   │       ├── MissingFrameOverlay.ts # Missing frame indicator
│   │       ├── WatermarkOverlay.ts  # Watermark overlay
│   │       ├── WatermarkControl.ts  # Watermark controls
│   │       ├── ZebraStripes.ts      # Zebra stripe exposure overlay
│   │       ├── ZebraControl.ts      # Zebra stripe controls
│   │       ├── layout/              # Layout components
│   │       │   ├── ContextToolbar.ts # Context-sensitive toolbar
│   │       │   ├── HeaderBar.ts     # Application header bar
│   │       │   └── TabBar.ts        # Tab bar navigation
│   │       └── shared/              # Shared UI primitives
│   │           ├── Button.ts        # Button component
│   │           ├── DraggableContainer.ts # Draggable container
│   │           ├── DropdownMenu.ts  # Dropdown menu
│   │           ├── Icons.ts         # Icon definitions
│   │           ├── Modal.ts         # Modal dialog
│   │           ├── Panel.ts         # Collapsible panel
│   │           └── theme.ts         # Theme constants
│   │
│   ├── utils/                   # Utilities
│   │   ├── AnnotationJSONExporter.ts # Annotation JSON export
│   │   ├── AnnotationPDFExporter.ts # Annotation PDF export
│   │   ├── CodecUtils.ts        # Codec utility functions
│   │   ├── CustomKeyBindingsManager.ts # Custom key binding management
│   │   ├── EffectProcessor.ts   # CPU effect processing
│   │   ├── effectProcessing.shared.ts # Shared effect processing logic
│   │   ├── EventEmitter.ts      # Event emitter system
│   │   ├── FrameExporter.ts     # Frame export utilities
│   │   ├── FrameInterpolator.ts # Frame interpolation
│   │   ├── FramePreloadManager.ts # Frame preload/cache management
│   │   ├── FullscreenManager.ts # Fullscreen API manager
│   │   ├── getCSSColor.ts       # CSS color utility
│   │   ├── HiDPICanvas.ts       # HiDPI canvas scaling
│   │   ├── HistoryManager.ts    # Undo/redo history manager
│   │   ├── KeyBindings.ts       # Default key binding definitions
│   │   ├── KeyboardManager.ts   # Keyboard input manager
│   │   ├── MediabunnyFrameExtractor.ts # WebCodecs frame extraction (HDR)
│   │   ├── PixelAspectRatio.ts  # Pixel aspect ratio utilities
│   │   ├── PrerenderBufferManager.ts # Pre-render buffer management
│   │   ├── PresentationMode.ts  # Presentation mode manager
│   │   ├── SequenceExporter.ts  # Image sequence export
│   │   ├── SequenceLoader.ts    # Image sequence loading
│   │   ├── ThemeManager.ts      # UI theme manager
│   │   ├── Timecode.ts          # Timecode conversion utilities
│   │   └── WorkerPool.ts        # Web Worker pool manager
│   │
│   ├── workers/                 # Web Workers
│   │   └── effectProcessor.worker.ts # Effect processing worker
│   │
│   ├── App.ts                   # Main application
│   ├── main.ts                  # Entry point
│   ├── test-helper.ts           # Test utilities
│   └── vite-env.d.ts            # Vite type declarations
│
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Component Mapping Table

| OpenRV Component | Web Implementation | Notes |
|-----------------|-------------------|-------|
| `IPNode` | `src/nodes/base/IPNode.ts` | Abstract base with inputs/outputs/properties |
| `IPGraph` | `src/core/graph/Graph.ts` | DAG management, evaluation |
| `IPImage` | `src/core/image/Image.ts` | Image data + metadata, HDR VideoFrame support |
| `ImageRenderer` | `src/render/Renderer.ts` | WebGL2 renderer with fragment shader pipeline |
| `RendererBackend` | `src/render/RendererBackend.ts` | Renderer backend abstraction |
| `WebGPURenderer` | `src/render/WebGPUBackend.ts` | WebGPU rendering backend |
| `ShaderProgram` | `src/render/ShaderProgram.ts` | WebGL shader compilation |
| `TextureCache` | `src/render/TextureCacheManager.ts` | Texture cache management |
| `Session` | `src/core/session/Session.ts` | Session state management |
| GTO I/O | `gto-js` library | Already implemented |
| `GTOGraphLoader` | `src/core/session/GTOGraphLoader.ts` | Node graph from GTO files |
| `SessionGTOStore` | `src/core/session/SessionGTOStore.ts` | GTO property storage/retrieval |
| `SessionGTOExporter` | `src/core/session/SessionGTOExporter.ts` | Export session to GTO format |
| `SessionSerializer` | `src/core/session/SessionSerializer.ts` | .orvproject save/load |
| `AutoSaveManager` | `src/core/session/AutoSaveManager.ts` | Auto-save to IndexedDB |
| `FileSourceIPNode` | `src/nodes/sources/FileSourceNode.ts` | Web image loading (format detection) |
| `VideoSourceIPNode` | `src/nodes/sources/VideoSourceNode.ts` | Video file source |
| `SequenceSourceIPNode` | `src/nodes/sources/SequenceSourceNode.ts` | Image sequence source |
| `SequenceGroupIPNode` | `src/nodes/groups/SequenceGroupNode.ts` | Play inputs in sequence |
| `StackGroupIPNode` | `src/nodes/groups/StackGroupNode.ts` | Stack/composite with wipes |
| `SwitchGroupIPNode` | `src/nodes/groups/SwitchGroupNode.ts` | A/B switching |
| `LayoutGroupIPNode` | `src/nodes/groups/LayoutGroupNode.ts` | Tile/grid layout |
| `RetimeGroupIPNode` | `src/nodes/groups/RetimeGroupNode.ts` | Speed/time remapping |
| `ColorCDLIPNode` | `src/color/CDL.ts` | ASC CDL color correction |
| `ColorCurveIPNode` | `src/color/ColorCurves.ts` | Curve-based adjustments |
| `ColorLinearToSRGBIPNode` | `src/color/TransferFunctions.ts` | EOTF/OETF transfer functions |
| `OCIONodes` | `src/color/OCIOProcessor.ts` + `OCIOConfig.ts` | OCIO color processing |
| `LUT3D` | `src/color/WebGLLUT.ts` + `LUTLoader.ts` | GPU LUT processing |
| `LUT Pipeline` | `src/color/pipeline/LUTPipeline.ts` | Multi-stage LUT pipeline |
| `Transform2DIPNode` | `src/transform/LensDistortion.ts` | Lens distortion correction |
| `FilterGaussianIPNode` | `src/filters/WebGLSharpen.ts` | GPU sharpening filter |
| `NoiseReductionIPNode` | `src/filters/NoiseReduction.ts` | Noise reduction filter |
| `OverlayIPNode` | `src/composite/BlendModes.ts` | Blend mode implementations |
| `PaintIPNode` | `src/paint/PaintEngine.ts` | Canvas-based annotations |
| `PaintRenderer` | `src/paint/PaintRenderer.ts` | Paint rendering to canvas |
| `StereoIPNode` | `src/stereo/StereoRenderer.ts` | 8 stereo viewing modes |
| `StereoAlign` | `src/stereo/StereoAlignOverlay.ts` | Stereo alignment overlay |
| `StereoEyeTransform` | `src/stereo/StereoEyeTransform.ts` | Per-eye transform controls |
| `WebGLScopes` | `src/scopes/WebGLScopes.ts` | GPU-accelerated video scopes |
| Audio Playback | `src/audio/AudioPlaybackManager.ts` | Web Audio API playback |
| Audio Waveform | `src/audio/WaveformRenderer.ts` | Audio waveform rendering |
| IOexr | `src/formats/EXRDecoder.ts` | OpenEXR decoder |
| IOdpx | `src/formats/DPXDecoder.ts` | DPX format decoder |
| IOcineon | `src/formats/CineonDecoder.ts` | Cineon format decoder |
| IOtiff | `src/formats/TIFFFloatDecoder.ts` | Float TIFF decoder |
| JPEG Gainmap | `src/formats/JPEGGainmapDecoder.ts` | JPEG gainmap HDR decoder |
| `DecoderRegistry` | `src/formats/DecoderRegistry.ts` | Format decoder registry |
| Timeline UI | `src/ui/components/Timeline.ts` | Custom canvas timeline |
| Timeline Editor | `src/ui/components/TimelineEditor.ts` | Timeline editing controls |
| Viewer | `src/ui/components/Viewer.ts` | WebGL canvas viewer |
| Viewer Interaction | `src/ui/components/ViewerInteraction.ts` | Pan/zoom/mouse handling |
| Viewer Effects | `src/ui/components/ViewerEffects.ts` | Viewer effects pipeline |
| Viewer Export | `src/ui/components/ViewerExport.ts` | Frame export from viewer |
| Viewer Pre-render | `src/ui/components/ViewerPrerender.ts` | Frame pre-rendering |
| Histogram | `src/ui/components/Histogram.ts` | Real-time histogram |
| Waveform | `src/ui/components/Waveform.ts` | Waveform monitor |
| Vectorscope | `src/ui/components/Vectorscope.ts` | Color vectorscope |
| Split Screen | `src/ui/components/ViewerSplitScreen.ts` | A/B split comparison |
| Timeline Thumbnails | `src/ui/components/ThumbnailManager.ts` | Frame preview thumbnails |
| Ghost Frames | `src/ui/components/GhostFrameControl.ts` | Onion skin overlay |
| Snapshots | `src/core/session/SnapshotManager.ts` | Session version history |
| Playlist | `src/core/session/PlaylistManager.ts` | Multi-clip sequencing |
| Network Sync | `src/network/NetworkSyncManager.ts` | Multi-client sync |
| WebSocket | `src/network/WebSocketClient.ts` | WebSocket connection |
| API Facade | `src/api/OpenRVAPI.ts` | Public API entry point |
| Keyboard Shortcuts | `src/utils/KeyboardManager.ts` + `KeyBindings.ts` | Keyboard input handling |
| Frame Extraction | `src/utils/MediabunnyFrameExtractor.ts` | WebCodecs HDR frame extraction |
| Worker Pool | `src/utils/WorkerPool.ts` | Web Worker parallelism |
| Effect Worker | `src/workers/effectProcessor.worker.ts` | Off-thread effect processing |

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
