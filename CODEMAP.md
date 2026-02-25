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
│   │   ├── AudioCoordinator.ts  # Audio coordination
│   │   ├── AudioMixer.ts        # Multi-source audio mixing
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
│   │   ├── AutoExposureController.ts # Auto exposure analysis
│   │   ├── CIE1931Data.ts       # CIE 1931 color space data
│   │   ├── ColorProcessingFacade.ts # Color processing orchestration
│   │   ├── ICCProfile.ts        # ICC profile handling
│   │   ├── LUTPresets.ts        # LUT preset library
│   │   ├── OCIOPresets.ts       # OCIO preset library
│   │   ├── PixelMath.ts         # Pixel-level math operations
│   │   ├── SceneAnalysis.ts     # Scene analysis (exposure, etc.)
│   │   ├── TemporalSmoother.ts  # Temporal filtering
│   │   ├── pipeline/            # LUT pipeline system
│   │   │   ├── GPULUTChain.ts   # GPU LUT chain processing
│   │   │   ├── LUTPipeline.ts   # LUT pipeline orchestration
│   │   │   ├── LUTPipelineState.ts # Pipeline state management
│   │   │   ├── LUTStage.ts      # Individual LUT stage
│   │   │   └── PreCacheLUTStage.ts # Pre-cached LUT stage
│   │   └── wasm/                # WebAssembly OCIO processing
│   │       ├── OCIOShaderTranslator.ts
│   │       ├── OCIOVirtualFS.ts
│   │       ├── OCIOWasmBridge.ts
│   │       ├── OCIOWasmModule.ts
│   │       └── OCIOWasmPipeline.ts
│   │
│   ├── cache/                   # Media caching system
│   │   ├── MediaCacheKey.ts     # Cache key generation
│   │   └── MediaCacheManager.ts # Cache management with policies
│   │
│   ├── composite/               # Compositing operations
│   │   └── BlendModes.ts        # Blend mode implementations
│   │
│   ├── config/                  # Application configuration
│   │   ├── Config.ts            # Main configuration
│   │   ├── ImageLimits.ts       # Image size/memory limits
│   │   ├── PlaybackConfig.ts    # Playback settings
│   │   ├── RenderConfig.ts      # Render settings
│   │   ├── TimingConfig.ts      # Timing settings
│   │   └── UIConfig.ts          # UI settings
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
│   │       ├── ABCompareManager.ts # A/B comparison state
│   │       ├── AnnotationStore.ts # Annotation storage
│   │       ├── AutoSaveManager.ts # Auto-save to IndexedDB
│   │       ├── MarkerManager.ts  # Timeline marker management
│   │       ├── MediaManager.ts   # Media management
│   │       ├── NoteManager.ts    # Notes/annotations
│   │       ├── PlaybackEngine.ts # Playback engine (core)
│   │       ├── PlaybackTimingController.ts # Playback timing
│   │       ├── PlaylistManager.ts # Multi-clip playlist management
│   │       ├── PropertyResolver.ts # Property resolution
│   │       ├── SessionURLManager.ts # URL state management
│   │       ├── SnapshotManager.ts # Session version snapshots
│   │       ├── StatusManager.ts  # Status management
│   │       ├── TransitionManager.ts # Transition management
│   │       ├── VersionManager.ts # Version tracking
│   │       ├── VolumeManager.ts  # Volume/mix management
│   │       ├── serializers/      # Session serializers
│   │       │   ├── ColorSerializer.ts
│   │       │   ├── FilterSerializer.ts
│   │       │   ├── PaintSerializer.ts
│   │       │   └── TransformSerializer.ts
│   │       └── index.ts         # Module exports
│   │
│   ├── filters/                 # Image filter effects
│   │   ├── NoiseReduction.ts    # Noise reduction filter
│   │   ├── WebGLNoiseReduction.ts # GPU noise reduction
│   │   └── WebGLSharpen.ts      # GPU unsharp mask sharpening
│   │
│   ├── effects/                 # Effect processing system
│   │   ├── EffectRegistry.ts    # Effect registry
│   │   ├── ImageEffect.ts       # Image effect interface
│   │   └── adapters/            # Effect adapter implementations
│   │
│   ├── export/                  # Media export functionality
│   │   ├── EDLWriter.ts         # Edit decision list export
│   │   ├── MP4Muxer.ts          # MP4 video muxing
│   │   ├── ReportExporter.ts    # Report generation
│   │   ├── SlateRenderer.ts     # Slate rendering
│   │   └── VideoExporter.ts     # Video export
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
│   ├── handlers/                # Event and state handlers
│   │   ├── compareHandlers.ts   # A/B compare handlers
│   │   ├── infoPanelHandlers.ts # Info panel handlers
│   │   ├── persistenceHandlers.ts # Persistence handlers
│   │   ├── scopeHandlers.ts     # Scope handlers
│   │   ├── sourceLoadedHandlers.ts # Source loaded handlers
│   │   ├── unsupportedCodecModal.ts # Unsupported codec UI
│   │   └── referenceDisplayWiring.ts # Reference display wiring
│   │
│   ├── integrations/            # DCC and pipeline integrations
│   │   ├── DCCBridge.ts         # DCC application bridge
│   │   ├── ShotGridBridge.ts    # ShotGrid integration
│   │   ├── ShotGridConfig.ts    # ShotGrid configuration
│   │   └── ShotGridIntegrationBridge.ts # ShotGrid integration bridge
│   │
│   ├── network/                 # Network synchronization
│   │   ├── MessageProtocol.ts   # Sync message protocol
│   │   ├── NetworkSyncManager.ts # Network sync orchestration
│   │   ├── SyncStateManager.ts  # Synchronized state management
│   │   ├── WebSocketClient.ts   # WebSocket client connection
│   │   └── types.ts             # Network type definitions
│   │
│   ├── nodes/                   # Processing nodes
│   │   ├── CacheLUTNode.ts      # GPU-cached LUT node
│   │   ├── base/                # Base node types
│   │   │   ├── IPNode.ts        # Abstract base (inputs/outputs/properties)
│   │   │   ├── NodeFactory.ts   # Node registry + @RegisterNode decorator
│   │   │   └── NodeProcessor.ts # Node processing base
│   │   ├── processors/          # Node processor implementations
│   │   │   ├── LayoutProcessor.ts   # Layout processing
│   │   │   ├── StackProcessor.ts    # Stack compositing
│   │   │   └── SwitchProcessor.ts   # Input switching
│   │   ├── sources/             # Source nodes
│   │   │   ├── BaseSourceNode.ts    # Abstract source base
│   │   │   ├── FileSourceNode.ts    # Single image (RVFileSource)
│   │   │   ├── ProceduralSourceNode.ts # Procedural image generation
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
│   │   ├── Canvas2DHDRBlit.ts   # Canvas HDR blitting
│   │   ├── Canvas2DTransitionRenderer.ts # Transition rendering
│   │   ├── LuminanceAnalyzer.ts # Luminance analysis
│   │   ├── Renderer.ts          # Main WebGL2 renderer (shader pipeline)
│   │   ├── RendererBackend.ts   # Renderer backend abstraction
│   │   ├── RenderState.ts       # Render state container
│   │   ├── RenderWorkerProxy.ts # Off-thread rendering
│   │   ├── ShaderProgram.ts     # WebGL shader compilation
│   │   ├── ShaderStateManager.ts # Centralized shader state
│   │   ├── SphericalProjection.ts # Spherical/360 projection
│   │   ├── StateAccessor.ts     # State accessor interface
│   │   ├── TextureCacheManager.ts # Texture cache management
│   │   ├── TransitionRenderer.ts # Transition effects
│   │   ├── WebGPUBackend.ts     # WebGPU rendering backend
│   │   ├── WebGPUHDRBlit.ts     # WebGPU HDR blitting
│   │   ├── createRenderer.ts    # Renderer factory
│   │   └── shaders/             # GLSL shader files
│   │       ├── viewer.vert.glsl # Main vertex shader
│   │       ├── viewer.frag.glsl # Main fragment shader (all effects)
│   │       ├── luminance.frag.glsl # Luminance calculation
│   │       ├── transition.vert.glsl # Transition vertex shader
│   │       └── transition.frag.glsl # Transition fragment shader
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
│   │       ├── BugOverlay.ts        # Debug bug overlay
│   │       ├── CacheManagementPanel.ts # Cache management UI
│   │       ├── ConformPanel.ts      # Conforming workflow UI
│   │       ├── ConvergenceMeasure.ts # Stereo convergence measurement
│   │       ├── DeinterlaceControl.ts # Deinterlacing controls
│   │       ├── ExternalPresentation.ts # External monitor presentation
│   │       ├── FilmEmulationControl.ts # Film emulation presets
│   │       ├── GamutDiagram.ts      # CIE gamut diagram
│   │       ├── NoteOverlay.ts       # Notes on image overlay
│   │       ├── NotePanel.ts         # Notes management panel
│   │       ├── PerspectiveCorrectionControl.ts # Perspective controls
│   │       ├── PixelProbe.ts        # Pixel sampling tool
│   │       ├── PremultControl.ts    # Premultiplication controls
│   │       ├── QuadView.ts          # 4-view layout
│   │       ├── ShortcutEditor.ts    # Keyboard shortcut editor
│   │       ├── ShotGridPanel.ts     # ShotGrid integration panel
│   │       ├── SlateEditor.ts       # Slate editor UI
│   │       ├── StabilizationControl.ts # Image stabilization
│   │       ├── VideoExporter.ts     # Video export UI
│   │       ├── ViewerGLRenderer.ts  # WebGL rendering for viewer
│   │       ├── ViewerInputHandler.ts # Input event handling
│   │       ├── ViewerIntegration.ts # Viewer integration layer
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
│   ├── AppColorWiring.ts        # Color system integration
│   ├── AppControlRegistry.ts    # Control registration system
│   ├── AppDCCWiring.ts          # DCC integration wiring
│   ├── AppEffectsWiring.ts      # Effects pipeline integration
│   ├── AppKeyboardHandler.ts    # Keyboard event handling
│   ├── AppNetworkBridge.ts      # Network synchronization
│   ├── AppPersistenceManager.ts # Session persistence
│   ├── AppPlaybackWiring.ts     # Playback system integration
│   ├── AppSessionBridge.ts      # Session management integration
│   ├── AppStackWiring.ts        # Stack compositing integration
│   ├── AppTransformWiring.ts    # Transform integration
│   ├── AppViewWiring.ts         # View system integration
│   ├── AppWiringContext.ts      # Wiring context setup
│   ├── KeyboardWiring.ts        # Keyboard shortcut wiring
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
| Effect Registry | `src/effects/EffectRegistry.ts` | Effect registration system |
| Media Cache | `src/cache/MediaCacheManager.ts` | Media caching with policies |
| DCC Bridge | `src/integrations/DCCBridge.ts` | DCC application integration |
| ShotGrid | `src/integrations/ShotGridBridge.ts` | ShotGrid pipeline integration |
| EDL Export | `src/export/EDLWriter.ts` | Edit decision list export |
| Video Export | `src/export/VideoExporter.ts` | MP4 video export |
| Slate Render | `src/export/SlateRenderer.ts` | Slate metadata rendering |
| OCIO WASM | `src/color/wasm/OCIOWasmBridge.ts` | WebAssembly OCIO processing |
| ICC Profile | `src/color/ICCProfile.ts` | ICC color profile handling |
| App Configuration | `src/config/Config.ts` | Centralized configuration |

### Shader Implementation (Complete)

All shaders are fully implemented in consolidated GPU shader programs:

**Main Viewer Fragment Shader** (`src/render/shaders/viewer.frag.glsl`):
- Color Space: sRGB, Rec709 conversion (EOTF/OETF), HLG, PQ transfer functions
- Color Correction: Exposure, gamma, saturation, contrast, temperature, tint, hue rotation
- ASC CDL: Slope/offset/power/saturation
- Curve Adjustments: Curves via LUT pre-computation
- Compositing: Over, premult/unpremult alpha handling
- 3D LUT: `applyLUT3D()` with trilinear interpolation
- Tone Mapping: Reinhard, Filmic, ACES, AGX, PBRNeutral, GT, ACESHill operators
- Dithering: Floyd-Steinberg for posterization prevention
- Channel isolation, color inversion, false color, zebra stripes

**Additional Shaders**:
- `viewer.vert.glsl` - Main vertex shader (quad geometry)
- `luminance.frag.glsl` - Luminance calculation
- `transition.vert.glsl`, `transition.frag.glsl` - Transition effects

**GPU Filters**:
- `src/filters/WebGLSharpen.ts` - Unsharp mask sharpening
- `src/filters/WebGLNoiseReduction.ts` - Spatial denoising

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

### Phase 8 (WASM Color & Advanced Cache)
- [x] OCIO WASM integration (OCIOWasmBridge, OCIOWasmPipeline)
- [x] ICC profile support
- [x] Advanced cache management (MediaCacheManager with policies)
- [x] Effect registry and adapter system

### Phase 9 (Professional Export & DCC Integration)
- [x] MP4 video muxing (H.264 codec support)
- [x] Edit Decision List (EDL) export
- [x] ShotGrid / DCC bridge integration
- [x] Slate rendering with metadata
- [x] Report generation and archival

### Phase 10 (Advanced Viewing & Stabilization)
- [x] Perspective correction & stabilization
- [x] Film emulation presets
- [x] Convergence measurement for stereo
- [x] Deinterlacing filters
- [x] Reference display management
- [x] Premultiplication controls
- [x] Shortcut editor & customization
- [x] Notes/annotations system (NoteManager, NotePanel)
- [x] Conforming workflow support
- [x] External window presentation mode
- [x] Spherical/360 projection
