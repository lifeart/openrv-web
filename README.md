# OpenRV Web

[![Deploy to GitHub Pages](https://github.com/lifeart/openrv-web/actions/workflows/deploy.yml/badge.svg)](https://github.com/lifeart/openrv-web/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[Live Demo](https://lifeart.github.io/openrv-web)**

A web-based VFX image and sequence viewer inspired by [OpenRV](https://github.com/AcademySoftwareFoundation/OpenRV). View images, videos, and image sequences with professional color tools, annotations, and RV session file compatibility.

## Features

### Media Support
- Single images (PNG, JPEG, WebP, EXR)
- **EXR Format Support** - full HDR image loading via WebAssembly decoder
  - Float32 texture support for HDR precision
  - Multi-layer EXR with AOV (Arbitrary Output Variable) selection
  - Channel remapping (custom channel-to-RGBA mapping)
  - Layer selection UI for multi-layer files (diffuse, specular, normals, depth, etc.)
- Video files (MP4, WebM)
  - **ProRes/DNxHD Codec Detection** - identifies unsupported professional codecs and provides FFmpeg transcoding guidance
- Image sequences (numbered files like `frame_001.png`, `file.0001.exr`)
  - **Missing frame detection** - automatically detect and indicate gaps in sequences
  - Visual overlay for missing frames during playback
  - **Pattern notation support** - `%04d` (printf), `####` (hash), and `@` notation parsing
  - **Single-file sequence inference** - drop one frame, automatically detect full sequence from directory
  - **Directory scanning** - discover all sequences in a folder, select best match
- RV/GTO session files with full graph reconstruction
- **Enhanced marker support** - notes and colors preserved through GTO round-trip

### Color Tools
- Exposure, gamma, saturation, contrast, brightness
- Color temperature and tint
- **Hue Rotation** - global hue shift control
- **Vibrance** with skin tone protection (hue 20-50° protected)
- **Clarity/Local Contrast** - enhance midtone detail without affecting highlights/shadows
- **Highlight/Shadow recovery** - recover detail in blown highlights and crushed shadows
- Whites/Blacks controls for clipping adjustment
- **Lift/Gamma/Gain Color Wheels** - three-way color correction for shadows, midtones, and highlights
  - 120px wheels with color preview ring
  - Master wheel for overall adjustments
  - Undo/redo support
  - Link option for gang adjustments
- **HSL Qualifier** - secondary color correction with hue/saturation/luminance selection
  - Isolate specific colors by HSL range
  - Apply corrections only to selected regions
  - Matte preview and invert selection
  - Eyedropper for color picking
- ASC CDL (slope, offset, power, saturation) with .cdl file support
- **LUT support** (.cube files) with GPU-accelerated processing
  - 3D LUTs for complex color transforms
  - 1D LUTs for simple curve-based corrections
- Color curves (Master/R/G/B channels) with presets and import/export
- **Log Curve Presets** - camera-specific log-to-linear conversion
  - Cineon Film Log (10-bit)
  - ARRI LogC3 (EI 800) and LogC4
  - Sony S-Log3
  - RED Log3G10
  - GLSL shader generation for GPU processing
- **OCIO Color Management** - OpenColorIO-style color pipeline
  - Built-in config presets (ACES 1.2, sRGB)
  - Input color space selection with auto-detection from metadata
  - Working color space (ACEScg, Rec.709, Linear sRGB)
  - Display and view transforms (sRGB, Rec.709, DCI-P3)
  - Look transforms with forward/inverse direction
  - Integration with existing LUT and log curve infrastructure
  - Toggle via Shift+O keyboard shortcut
- **Tone Mapping for HDR** - operators for mapping HDR content to SDR displays
  - Reinhard operator (preserves highlight detail)
  - Filmic operator (S-curve with shoulder and toe)
  - ACES filmic tone mapping
  - Toggle via Shift+Alt+J keyboard shortcut

### Transform & Effects
- Rotation (90°/180°/270°) and flip (H/V)
- Crop tool with aspect ratio presets and rule-of-thirds guides
- **Uncrop / Canvas Extension** - add padding around image for composition reference
  - Uniform padding mode (equal on all sides)
  - Per-side padding controls (top, right, bottom, left)
  - Customizable fill color
- **Pixel Aspect Ratio (PAR) Support** - correct anamorphic squeeze for proper display
  - Auto-detection from image/video metadata
  - Presets for common PARs (DV NTSC, DV PAL, HD Anamorphic, 2:1 Anamorphic, etc.)
  - Manual PAR value entry
  - Toggle via Shift+P keyboard shortcut
- Lens distortion correction (barrel/pincushion)
- Blur and sharpen filters
- **Noise Reduction** - edge-preserving bilateral filter
  - GPU-accelerated with WebGL2
  - Automatic CPU fallback
  - Adjustable strength and radius (1-5)

### Comparison & Composition
- Wipe comparison (horizontal/vertical split view)
- **Split Screen Compare** - side-by-side A/B source comparison
  - Horizontal and vertical split modes
  - Draggable divider for adjustable split position
  - A/B labels for source identification
- **Difference Matte** - show pixel differences between A/B with gain and heatmap modes
- **Blend Modes** for A/B comparison
  - Onion skin - overlay B over A with adjustable opacity
  - Flicker - rapidly alternate between A/B at configurable rate (1-30 Hz)
  - Blend - mix A and B with adjustable ratio
- Multi-layer stack with blend modes
- A/B source switching with auto-assignment when loading multiple files
- Quick toggle between sources with backtick key

### Stereo 3D Viewing
- Side-by-side and over/under stereo modes
- Mirror mode (side-by-side with flipped right eye)
- Anaglyph mode (red/cyan 3D glasses)
- Luminance anaglyph for reduced color fringing
- Checkerboard mode (for DLP projectors with shutter glasses)
- Scanline interleaved mode (for line-blanking displays)
- Eye swap control (swap left/right eyes)
- Convergence offset adjustment

### Scopes & Analysis
- Histogram (RGB/Luminance/Separate channels, log scale option)
  - **Clipping Indicators** - show percentage of clipped highlights/shadows
  - **Clipping Overlay** - visual overlay showing clipped areas (red for highlights, blue for shadows)
- Waveform monitor (Luma/RGB/Parade/YCbCr modes)
  - **YCbCr Parade** - visualize Y (luma), Cb (blue difference), Cr (red difference) using BT.709 coefficients
- Vectorscope with zoom levels
- **Pixel Probe / Color Sampler** - click to sample RGB/HSL/IRE values at any pixel
  - **Area averaging** - configurable sample size (1x1, 3x3, 5x5, 9x9)
  - **Source vs Rendered toggle** - view pre- or post-color-pipeline values
  - **Alpha channel display** - shows alpha in both 0-255 and 0.0-1.0 formats
- **False Color Display** - exposure visualization with ARRI, RED, and custom presets
- **Zebra Stripes** - animated diagonal stripes for exposure warnings
  - High zebras (>95% IRE) - right-leaning red stripes
  - Low zebras (<5% IRE) - left-leaning blue stripes
  - Adjustable thresholds
- **Safe Areas / Guides Overlay** - broadcast safe zones and composition guides
  - Title Safe and Action Safe zones
  - Rule of Thirds grid
  - Center crosshair
  - Aspect ratio overlays (16:9, 2.39:1, etc.)
- **Timecode Overlay** - on-screen SMPTE timecode display (HH:MM:SS:FF format)

### Annotations
- Pen tool with pressure sensitivity
- Text annotations with formatting (bold, italic, underline, background color, callouts)
- **Shape Tools** - Rectangle, ellipse, line, arrow, and polygon with fill/stroke options
- **Spotlight Tool** - Dim everything except highlighted region (circle or rectangle)
- Eraser and brush types
- Ghost mode (show nearby frame annotations)
- Hold mode (persist annotations across frames)
- Per-frame annotation storage
- **Ghost Frames / Onion Skin** - semi-transparent previous/next frames for animation review
  - Configurable frames before and after (0-5 each)
  - Adjustable base opacity and falloff
  - Optional color tinting (red for before, green for after)

### Playback
- Frame-accurate timeline with scrubbing
- **Timeline Thumbnails** - frame preview thumbnails along the timeline track
  - LRU cache for efficient memory usage (max 150 thumbnails)
  - Progressive loading without blocking UI
  - Automatic recalculation on resize
- In/out points and **markers with notes** (color-coded, with text annotations)
  - **Duration Markers** - markers spanning frame ranges for segment annotation
- Loop modes (once, loop, ping-pong)
- **Playback speed control** (0.1x to 8x) with J/K/L shortcuts
  - **Audio pitch correction** - preserves pitch at non-1x playback speeds
- **Sub-frame Interpolation** - alpha blending between frames for smooth slow motion
- **Smooth Zoom Animation** - requestAnimationFrame-based zoom with ease-out cubic easing
- **Cache indicator** showing cached frames and memory usage
- **Prerender Buffer** - background processing of effects for smooth playback
- **Multi-Clip Playlist** - manage and play multiple clips in sequence
  - Add clips from any loaded source with in/out points
  - Drag-and-drop reordering
  - Loop modes: none, single clip, or all clips
  - EDL (Edit Decision List) export
  - Total duration display
  - Web Worker-based parallel effect processing
  - Smart cache management with LRU eviction
  - Direction-aware preloading (forward/backward)
- **Audio Playback System** - robust audio handling with multiple fallbacks
  - Web Audio API for independent audio control and waveform generation
  - HTMLVideoElement fallback for cross-origin or codec issues
  - Mediabunny-based audio extraction for CORS-blocked content
  - Graceful autoplay policy handling with user-friendly error messages
  - Audio sync during frame-accurate playback with drift correction
  - Automatic muting during reverse playback (audio cannot be reversed)
- Audio waveform display with multi-channel support
- Volume control with mute (volume preserved across mute/unmute cycles)
- **Page Visibility Handling** - smart resource management
  - Automatically pauses playback when tab is hidden
  - Resumes playback when tab becomes visible
  - Reduces scope processing while hidden

### UI/UX
- **Dark/Light Theme** with auto (system) mode and Shift+T shortcut
- **Fullscreen Mode** - native browser fullscreen via F11 or toolbar button
- **Presentation Mode** - clean display with all UI hidden and cursor auto-hide on inactivity (Ctrl+Shift+P)
- **Background Pattern Selector** - configurable viewer background for alpha transparency visualization
  - Checkerboard (classic alpha pattern)
  - Grey 18%, Grey 50%, White, Black
  - Crosshatch pattern
  - Custom color picker
  - Toggle via Shift+B (cycle) or Shift+Alt+B (quick checkerboard toggle)
- **History Panel** - visual undo/redo with jump to any state
- **Floating Info Panel** - filename, resolution, frame, FPS, and cursor color readout
- **Hi-DPI/Retina Display Support** - crisp rendering on high-density displays (2x, 3x DPR)
- **Session Snapshots** - named version history with preview and restore
  - Manual snapshots with custom names and descriptions
  - Auto-checkpoints before major operations (project load, restore)
  - IndexedDB persistence across browser sessions
  - Preview showing frame count, annotations, and color grade status
  - Export/import snapshots as JSON
  - LRU eviction (max 50 manual snapshots, 10 auto-checkpoints)
- **Auto-Save** - automatic session persistence to IndexedDB with crash recovery
  - Configurable save interval (1-30 minutes, default 5)
  - Debounced saves to prevent excessive writes during rapid changes
  - Crash recovery detection with prompt to restore previous session
  - Visual indicator showing save status (saving, saved, unsaved, error)
  - Click-to-retry on save failures
  - Storage quota monitoring with low-space warnings
  - Theme-consistent styling with CSS variables
- **Session Recovery** - intelligent handling of temporary file references
  - Detects blob URLs that become invalid after browser restart
  - Prompts user to re-select files with original filename validation
  - Skip option to load session without unavailable media

### Overlays & Watermarks
- **Watermark Overlay** - add logos and watermarks to exports
  - 9 preset positions (3x3 grid) plus custom positioning
  - Adjustable scale (10-200%), opacity, and margin
  - Supports PNG, JPEG, WebP, and SVG images

### Export
- Frame export (PNG/JPEG/WebP)
- Sequence export with progress
- Copy to clipboard
- Session save/load (.orvproject format)
- **Annotation JSON Export** - standalone annotation metadata export
  - Frame range filtering
  - Statistics (pen strokes, text, shapes)
  - Import/validation for round-trip
- **Annotation PDF Export** - printable annotation reports
  - Frame thumbnails with timecodes
  - Annotation summary tables
  - Uses browser native print (no external libraries)

### Timeline Editor
- **Visual EDL/Cut Editing** for sequence nodes
  - Colored cut blocks representing source clips
  - Drag handles for trimming in/out points
  - Drag cuts to reorder
  - Zoom control for timeline detail
  - Context menu for delete operations
  - Real-time event emission for cut changes

### Scripting API
- **Public JavaScript API** (`window.openrv`) for programmatic control from browser console or external scripts
  - **Playback control**: `play()`, `pause()`, `toggle()`, `stop()`, `seek(frame)`, `step(direction)`, `setSpeed()`, `getSpeed()`, `isPlaying()`, `getCurrentFrame()`
  - **Media info**: `getCurrentSource()`, `getDuration()`, `getFPS()`, `getResolution()`
  - **Audio control**: `setVolume()`, `getVolume()`, `mute()`, `unmute()`, `isMuted()`
  - **Loop control**: `setMode()`, `getMode()`, `setInPoint()`, `setOutPoint()`, `clearInOut()`
  - **View control**: `setZoom()`, `getZoom()`, `fitToWindow()`, `setPan()`, `setChannel()`
  - **Color control**: `setAdjustments()`, `getAdjustments()`, `reset()`, `setCDL()`, `loadLUT()`
  - **Markers**: `add()`, `remove()`, `getAll()`, `clear()`, `goToNext()`, `goToPrevious()`
  - **Events**: `on()`, `off()`, `once()` for frameChange, play, pause, sourceLoaded, error, etc.
  - Version and readiness: `openrv.version`, `openrv.isReady()`
  - Input validation and error handling on all methods

### Network Sync (Infrastructure)
- **WebSocket-based sync client** for real-time collaboration between viewers
  - Room creation and joining with unique room codes
  - User presence indicators (connected users list)
  - Configurable sync elements: playback, view (pan/zoom), color adjustments, annotations
  - Host/participant role distinction
  - Reconnection handling with exponential backoff
  - Keyboard shortcut: Shift+N to toggle network panel

## Installation

```bash
# Clone the repository
git clone https://github.com/lifeart/openrv-web.git
cd openrv-web

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

## Usage

### Opening Media
- Drag and drop files onto the viewer
- Click the folder icon to open file picker
- Load RV session files (.rv) directly
- Load multiple files for A/B comparison (second file auto-assigns as source B)

### Keyboard Shortcuts

#### Playback
| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `Left/Right` | Step frame backward/forward |
| `Up` | Toggle play direction |
| `Home/End` | Go to start/end |
| `I` or `[` | Set in point |
| `O` or `]` | Set out point |
| `R` | Reset in/out points |
| `M` | Toggle mark at current frame |
| `L` | Cycle loop mode (once/loop/ping-pong) |
| `J` | Decrease playback speed |
| `K` | Pause playback |
| `L` | Increase playback speed |

#### View & Navigation
| Key | Action |
|-----|--------|
| `F` | Fit to window |
| `=` / `-` | Zoom in/out |
| `Shift+=` / `Shift+-` | Fine zoom in/out |
| `1-5` | Switch tabs (View, Color, Effects, Transform, Annotate) |
| `0` | Set zoom to 50% |
| `F11` | Toggle fullscreen mode |
| `Ctrl+Shift+P` | Toggle presentation mode (clean display, cursor auto-hide) |
| `Shift+B` | Cycle background pattern (checker, grey, white, etc.) |
| `Shift+Alt+B` | Toggle checkerboard background |
| `Shift+P` | Toggle pixel aspect ratio correction |

#### A/B Compare
| Key | Action |
|-----|--------|
| `` ` `` (backtick) | Toggle between A/B sources |
| `~` (tilde) | Toggle between A/B sources |
| `Shift+D` | Toggle difference matte |
| `Shift+Alt+S` | Toggle split screen A/B comparison |

#### Scopes & Wipe
| Key | Action |
|-----|--------|
| `Shift+W` | Cycle wipe modes (off/horizontal/vertical) |
| `w` | Toggle waveform monitor |
| `h` | Toggle histogram |
| `y` | Toggle vectorscope |

#### Exposure & Analysis
| Key | Action |
|-----|--------|
| `Shift+I` | Toggle pixel probe |
| `Shift+Alt+F` | Toggle false color display |
| `Shift+Alt+Z` | Toggle zebra stripes |
| `;` | Toggle safe areas overlay |
| `Shift+Alt+T` | Toggle timecode overlay |
| `Shift+Alt+W` | Toggle color wheels panel |

#### Stereo 3D
| Key | Action |
|-----|--------|
| `Shift+3` | Cycle stereo modes (off/side-by-side/over-under/mirror/anaglyph/etc.) |

#### Channel View
| Key | Action |
|-----|--------|
| `Shift+R` | Red channel |
| `Shift+G` | Green channel |
| `Shift+B` | Blue channel |
| `Shift+A` | Alpha channel |
| `Shift+L` | Luminance/Grayscale |
| `Shift+Y` | Grayscale (alias for Shift+L) |
| `Shift+N` | Normal (RGB) |

#### Color & Effects
| Key | Action |
|-----|--------|
| `C` | Toggle color panel |
| `U` | Toggle curves panel |
| `Shift+O` | Toggle OCIO color management panel |
| `Shift+Alt+J` | Toggle tone mapping |
| `Shift+Alt+E` | Toggle effects/filter panel |
| `Shift+K` | Toggle crop mode |
| `Shift+H` | Toggle HSL Qualifier |

#### Transform
| Key | Action |
|-----|--------|
| `Shift+R` | Rotate left 90° |
| `Alt+R` | Rotate right 90° |
| `Alt+H` | Flip horizontal |
| `Shift+V` | Flip vertical |

#### Annotations
| Key | Action |
|-----|--------|
| `V` | Pan tool |
| `P` | Pen tool |
| `E` | Eraser tool |
| `T` | Text tool |
| `R` | Rectangle tool |
| `O` | Ellipse tool |
| `L` | Line tool |
| `A` | Arrow tool |
| `B` | Toggle brush type (soft/hard) |
| `G` | Toggle ghost mode |
| `Shift+G` | Toggle ghost frames (onion skin) |
| `X` | Toggle hold mode (persist annotations across frames) |
| `Shift+Q` | Toggle spotlight |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `,` / `.` | Jump to prev/next annotation |

#### UI Panels
| Key | Action |
|-----|--------|
| `Shift+T` | Cycle theme (auto/dark/light) |
| `Shift+Alt+H` | Toggle history panel |
| `Shift+Alt+I` | Toggle info panel |
| `Shift+Alt+M` | Toggle markers panel |
| `Shift+N` | Toggle network sync panel |
| `Ctrl+Shift+S` | Create quick snapshot |
| `Ctrl+Shift+Alt+S` | Toggle snapshots panel |
| `Shift+Alt+P` | Toggle playlist panel |

#### Export
| Key | Action |
|-----|--------|
| `Ctrl+S` | Export frame |
| `Ctrl+C` | Copy frame to clipboard |

### Mouse Controls
- **Scroll**: Zoom in/out
- **Drag**: Pan image
- **Click timeline**: Seek to frame
- **Drag timeline**: Scrub

## Architecture

```
src/
├── api/                # Public scripting API (window.openrv)
│   ├── OpenRVAPI.ts    # Main API class and initialization
│   ├── PlaybackAPI.ts  # Playback control methods
│   ├── MediaAPI.ts     # Media/source information
│   ├── AudioAPI.ts     # Volume and audio control
│   ├── LoopAPI.ts      # Loop mode and in/out points
│   ├── ViewAPI.ts      # Zoom, pan, channel control
│   ├── ColorAPI.ts     # Color adjustment methods
│   ├── MarkersAPI.ts   # Marker management
│   ├── EventsAPI.ts    # Event subscription system
│   └── index.ts        # API export and registration
├── core/
│   ├── graph/          # Node graph system (Graph, Property, Signal)
│   ├── image/          # IPImage data structure (with PAR metadata)
│   └── session/        # Session management, GTO loading, serialization, auto-save
│       ├── SnapshotManager.ts  # IndexedDB-based session snapshots
│       └── PlaylistManager.ts  # Multi-clip playlist with EDL export
├── formats/
│   └── EXRDecoder.ts   # WebAssembly EXR decoder with multi-layer support
├── nodes/
│   ├── base/           # IPNode, NodeFactory with @RegisterNode decorator
│   ├── sources/        # FileSourceNode, VideoSourceNode, SequenceSourceNode
│   └── groups/         # SequenceGroup, StackGroup, SwitchGroup, etc.
├── render/             # WebGL2 renderer and shaders (incl. tone mapping)
│   └── TextureCacheManager.ts  # LRU texture cache for GPU performance
├── ui/
│   ├── components/     # Viewer, Timeline, Toolbar, Controls, TimelineEditor
│   │   ├── ViewerSplitScreen.ts        # Split screen A/B comparison
│   │   ├── ThumbnailManager.ts         # Timeline thumbnail generation and caching
│   │   ├── GhostFrameControl.ts        # Ghost frames / onion skin control
│   │   ├── SnapshotPanel.ts            # Session snapshot management UI
│   │   ├── PlaylistPanel.ts            # Multi-clip playlist UI
│   │   ├── ChannelSelect.ts            # Channel isolation with EXR layer selection
│   │   ├── BackgroundPatternControl.ts # Viewer background patterns (checker, grey, etc.)
│   │   ├── PARControl.ts              # Pixel aspect ratio controls
│   │   ├── CropControl.ts             # Crop and uncrop/canvas extension
│   │   └── OCIOControl.ts             # OCIO color management UI
│   └── shared/         # Button, Modal, Panel utilities
├── paint/              # Annotation engine
├── audio/              # Audio playback and waveform rendering
│   ├── AudioPlaybackManager.ts # Web Audio API playback with fallbacks
│   └── WaveformRenderer.ts     # Waveform extraction and rendering
├── color/              # CDL, LUT loader (1D & 3D), WebGL LUT processor
│   ├── LogCurves.ts    # Camera log curve presets (Cineon, LogC, S-Log3, etc.)
│   └── ocio/           # OCIO color management (config, transforms, processor)
├── filters/            # Image processing filters
│   ├── NoiseReduction.ts       # Bilateral filter (CPU implementation)
│   └── WebGLNoiseReduction.ts  # GPU-accelerated bilateral filter
├── network/            # Network sync infrastructure (WebSocket client, rooms)
├── stereo/             # Stereoscopic 3D viewing modes
├── transform/          # Lens distortion
├── composite/          # Blend modes
├── scopes/             # GPU-accelerated scopes (Histogram, Waveform, Vectorscope)
├── utils/              # EventEmitter, FrameExporter, SequenceLoader, HiDPICanvas
│   ├── CodecUtils.ts             # Codec detection (ProRes, DNxHD, etc.)
│   ├── PixelAspectRatio.ts       # PAR detection and correction
│   ├── FullscreenManager.ts      # Fullscreen API wrapper
│   ├── PresentationMode.ts       # Presentation mode (UI hide, cursor auto-hide)
│   ├── FrameInterpolator.ts      # Sub-frame interpolation for slow motion
│   ├── EffectProcessor.ts        # CPU effect processing (highlights, vibrance, clarity, etc.)
│   ├── PrerenderBufferManager.ts # Prerender cache for smooth playback with effects
│   ├── WorkerPool.ts             # Generic worker pool for parallel processing
│   ├── AnnotationJSONExporter.ts # Export annotations as JSON
│   └── AnnotationPDFExporter.ts  # Export annotations as PDF via browser print
└── workers/            # Web Workers for background processing
    └── effectProcessor.worker.ts # Background effect processing
```

### Keyboard Management

The application uses a centralized `KeyboardManager` for all keyboard shortcuts, providing:

- **Flexible Registration**: Register shortcuts with key combinations, handlers, and descriptions
- **Cross-Platform Support**: Automatically treats Meta (Cmd) as Ctrl for compatibility
- **Input Field Awareness**: Skips shortcuts when typing in text inputs (except global keys like Escape)
- **Configurable Bindings**: All shortcuts defined in `KeyBindings.ts` for easy customization

**Modal Exceptions**: Modal dialogs (`showAlert`, `showConfirm`, `showPrompt`) have their own local keyboard handling for Escape/Enter keys. This is intentional as modals are focused, temporary UI elements that require immediate keyboard response and proper cleanup.

```typescript
// Register a shortcut
keyboardManager.register('Ctrl+S', () => exportFrame(), 'Export frame');

// Register with object notation (uses KeyboardEvent.code)
keyboardManager.register({
  code: 'KeyS',
  ctrl: true
}, () => exportFrame(), 'Export frame');

// Check if a shortcut is registered
if (keyboardManager.isRegistered('Ctrl+S')) { ... }

// Get all bindings for UI display
const bindings = keyboardManager.getBindings();
```

### Node Graph

The application uses a directed acyclic graph (DAG) for media processing:

```
[Source Nodes] → [Group Nodes] → [Effect Nodes] → [Output]
     ↓                ↓               ↓
FileSource      SequenceGroup     RVColor (future)
VideoSource     StackGroup        RVTransform2D (future)
SequenceSource  SwitchGroup
                LayoutGroup
```

Nodes are registered via decorators:
```typescript
@RegisterNode('RVFileSource')
export class FileSourceNode extends BaseSourceNode { ... }
```

### GTO/RV Session Loading

RV session files are parsed using `gto-js` and reconstructed into the node graph, restoring key session settings such as playback ranges, channel selection, scopes, and paint effects. Exporting `.rv`/`.gto` sessions currently preserves playback and annotation data (not the full media graph), and re-exports loaded sessions with UI changes applied.

```typescript
// Session loads GTO and builds graph
await session.loadFromGTO(fileData);

// Access the reconstructed graph
const graph = session.graph;
const rootNode = session.graphParseResult?.rootNode;
```

## Development

```bash
# Type check
pnpm typecheck

# Run unit tests (5500+ tests)
pnpm test

# Run e2e tests (requires dev server running)
pnpm dev  # in one terminal
npx playwright test  # in another terminal

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Test Coverage

The codebase includes comprehensive test coverage with **5500+ unit tests** across 140+ test files and **70+ e2e test suites**:

- **Color Tools**: ColorWheels (46 tests), FalseColor (30 tests), HSLQualifier (57 tests), Curves, CDL, LogCurves (27 tests)
- **OCIO**: OCIOConfig, OCIOTransform, OCIOProcessor (color space transforms, config parsing)
- **Tone Mapping**: Reinhard, Filmic, ACES operator tests
- **Analysis**: ZebraStripes (49 tests), PixelProbe (45+ tests), ClippingOverlay (48 tests), Waveform (50 tests), Histogram (45 tests), Vectorscope (49 tests)
- **Overlays**: TimecodeOverlay (50 tests), SafeAreasOverlay (46 tests), SpotlightOverlay (62 tests)
- **UI Components**: ThemeControl, HistoryPanel, InfoPanel, Modal, Button, CurveEditor (33 tests), AutoSaveIndicator (35 tests), TimelineEditor (25 tests), ThumbnailManager (12 tests), BackgroundPatternControl (32 tests), PARControl (13 tests)
- **Core**: Session, Graph, GTO loading/export, SequenceLoader (88 tests), AutoSaveManager (28 tests), SessionSerializer (35 tests), SnapshotManager (16 tests), PlaylistManager (34 tests)
- **Formats**: EXRDecoder (multi-layer, channel remapping), ChannelSelect (EXR layer UI)
- **Render**: TextureCacheManager (22 tests)
- **Export**: AnnotationJSONExporter (19 tests), AnnotationPDFExporter (21 tests)
- **Audio**: AudioPlaybackManager (36 tests), WaveformRenderer (35 tests)
- **Filters**: NoiseReduction (18 tests), WebGLNoiseReduction
- **Overlays**: MissingFrameOverlay (16 tests), WatermarkOverlay, WatermarkControl
- **Utilities**: HiDPICanvas (32 tests), EffectProcessor (51 tests), WorkerPool (28 tests), PrerenderBufferManager (36 tests), PixelAspectRatio (28 tests), FullscreenManager (13 tests), PresentationMode (20 tests), FrameInterpolator, CodecUtils, ViewerInteraction
- **API**: OpenRVAPI (80+ tests covering all sub-modules: Playback, Media, Audio, Loop, View, Color, Markers, Events)

**E2E Tests** (70+ test suites):
- **Core**: App initialization, tab navigation, media loading, playback controls, session recovery, page visibility handling
- **Audio**: Volume control, mute/unmute, audio sync, error recovery, keyboard shortcuts (21 tests)
- **View**: Grayscale toggle (Shift+L/Y), channel isolation, EXR layers, background patterns (14 tests), fullscreen/presentation
- **GTO**: Round-trip verification (markers, frame ranges, matte, paint effects, metadata, custom nodes)
- **Scopes**: Histogram, Waveform, Vectorscope, Parade scope
- **Color**: Color controls, Curves, Vibrance, Highlight/Shadow recovery, Log curves, OCIO
- **View**: Pixel probe, False color, Zebra stripes, Safe areas, Spotlight, Info panel, Pixel aspect ratio (11 tests)
- **Comparison**: A/B compare, Wipe modes, Difference matte
- **Compositing**: Stack Control - layer management, blend modes, opacity, visibility, reordering (44 tests)
- **Transform**: Rotation, Flip, Crop, Uncrop (9 tests)
- **Annotations**: Paint tools, Paint coordinates, Text formatting, JSON/PDF export
- **Export**: Frame export, Sequence export, Annotation export
- **Timeline**: EDL editing, cut manipulation
- **Auto-Save**: Indicator display, status changes, styling, animations (14 tests)
- **Sequences**: Image sequence loading, pattern detection (11 tests)
- **Codecs**: Unsupported codec detection and transcoding guidance
- **Scripting API**: window.openrv API testing

### Hi-DPI Canvas Support

All canvas-based components support hi-DPI/Retina displays using the `HiDPICanvas` utility:

```typescript
import { setupHiDPICanvas, clientToCanvasCoordinates } from '../../utils/HiDPICanvas';

// Setup canvas for hi-DPI rendering
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d')!;

const result = setupHiDPICanvas({
  canvas,
  ctx,
  width: 256,   // Logical width (CSS pixels)
  height: 100,  // Logical height (CSS pixels)
});

// Result contains: { dpr, physicalWidth, physicalHeight, logicalWidth, logicalHeight }
// At 2x DPR: canvas.width = 512, canvas.style.width = '256px'

// Draw using logical coordinates - context is automatically scaled
ctx.fillRect(0, 0, 256, 100);  // Fills the entire canvas

// For mouse events, convert client coords to logical canvas coords
canvas.addEventListener('click', (e) => {
  const { x, y } = clientToCanvasCoordinates(canvas, e.clientX, e.clientY, 256, 100);
  // x, y are in logical coordinates (0-256, 0-100 range)
});
```

**Key functions:**
- `setupHiDPICanvas()` - Configure canvas for hi-DPI with physical/CSS dimensions and scaled context
- `resizeHiDPICanvas()` - Resize an existing hi-DPI canvas (alias for setup)
- `createHiDPICanvas()` - Create a new canvas with hi-DPI support
- `clientToCanvasCoordinates()` - Convert mouse event coords to logical canvas coords
- `logicalToPhysical()` / `physicalToLogical()` - Coordinate conversion helpers

**Important notes for pixel buffer operations:**
When using `getImageData`/`putImageData`, work in physical pixel coordinates (these bypass the context transform):

```typescript
// For direct pixel manipulation, use physical dimensions
const physicalWidth = canvas.width;   // Not logical width
const physicalHeight = canvas.height;
const imageData = ctx.getImageData(0, 0, physicalWidth, physicalHeight);
```

### Adding a New Node Type

1. Create node class extending `IPNode` or `BaseGroupNode`
2. Add `@RegisterNode('NodeType')` decorator
3. Implement `process()` method
4. Import in `src/nodes/<category>/index.ts`

Example:
```typescript
import { RegisterNode } from '../base/NodeFactory';
import { BaseGroupNode } from './BaseGroupNode';

@RegisterNode('RVMyGroup')
export class MyGroupNode extends BaseGroupNode {
  constructor(name?: string) {
    super('RVMyGroup', name ?? 'My Group');
    this.properties.add({ name: 'myProp', defaultValue: 0 });
  }

  getActiveInputIndex(context: EvalContext): number {
    return 0;
  }
}
```

## Tech Stack

- **TypeScript** - Type-safe development
- **Vite** - Fast bundler with HMR
- **Vitest** - Unit testing framework
- **Playwright** - End-to-end testing
- **WebGL2** - GPU-accelerated rendering (tone mapping, LUT processing, color transforms)
- **WebAssembly** - High-performance EXR decoding
- **WebCodecs API** - Frame-accurate video decoding via [mediabunny](https://github.com/nickarora/mediabunny)
- **Web Audio API** - Audio playback, waveform generation, volume control, and pitch correction
- **Fullscreen API** - Native fullscreen and presentation modes
- **Mediabunny** - Also used for audio extraction fallback when native fetch is blocked by CORS
- **gto-js** - RV/GTO file parsing
- **gl-matrix** - Matrix/vector math

## Browser Support

Requires WebGL2 support:
- Chrome 56+
- Firefox 51+
- Safari 15+
- Edge 79+

**Hi-DPI/Retina displays** are fully supported with automatic detection of `devicePixelRatio`. All canvas-based UI components (scopes, color wheels, curve editor, overlays) render at native resolution for crisp display on 2x, 3x, and fractional DPR screens.

## License

MIT

## Related Projects

- [OpenRV](https://github.com/AcademySoftwareFoundation/OpenRV) - Original C++ application
- [gto-js](https://github.com/lifeart/gto-js) - GTO file format parser for JavaScript
