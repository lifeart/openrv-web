# OpenRV Web

[![Deploy to GitHub Pages](https://github.com/lifeart/openrv-web/actions/workflows/deploy.yml/badge.svg)](https://github.com/lifeart/openrv-web/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[Live Demo](https://lifeart.github.io/openrv-web)**

A web-based VFX image and sequence viewer inspired by [OpenRV](https://github.com/AcademySoftwareFoundation/OpenRV). View images, videos, and image sequences with professional color tools, annotations, and RV session file compatibility.

## Features

### Media Support
- Single images (PNG, JPEG, WebP, EXR)
- Video files (MP4, WebM)
- Image sequences (numbered files like `frame_001.png`, `file.0001.exr`)
- RV/GTO session files with full graph reconstruction

### Color Tools
- Exposure, gamma, saturation, contrast, brightness
- Color temperature and tint
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
- 3D LUT support (.cube files) with GPU-accelerated processing
- Color curves (Master/R/G/B channels) with presets and import/export

### Transform & Effects
- Rotation (90°/180°/270°) and flip (H/V)
- Crop tool with aspect ratio presets and rule-of-thirds guides
- Lens distortion correction (barrel/pincushion)
- Blur and sharpen filters

### Comparison & Composition
- Wipe comparison (horizontal/vertical split view)
- **Difference Matte** - show pixel differences between A/B with gain and heatmap modes
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
- Waveform monitor (Luma/RGB/Parade modes)
- Vectorscope with zoom levels
- **Pixel Probe / Color Sampler** - click to sample RGB/HSL/IRE values at any pixel
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
- **Timecode Overlay** - on-screen SMPTE timecode display

### Annotations
- Pen tool with pressure sensitivity
- Text annotations with formatting (bold, italic, underline, background color, callouts)
- **Shape Tools** - Rectangle, ellipse, line, arrow, and polygon with fill/stroke options
- **Spotlight Tool** - Dim everything except highlighted region (circle or rectangle)
- Eraser and brush types
- Ghost mode (show nearby frame annotations)
- Hold mode (persist annotations across frames)
- Per-frame annotation storage

### Playback
- Frame-accurate timeline with scrubbing
- In/out points and **markers with notes** (color-coded, with text annotations)
- Loop modes (once, loop, ping-pong)
- **Playback speed control** (0.1x to 8x) with J/K/L shortcuts
- **Cache indicator** showing cached frames and memory usage
- **Prerender Buffer** - background processing of effects for smooth playback
  - Web Worker-based parallel effect processing
  - Smart cache management with LRU eviction
  - Direction-aware preloading (forward/backward)
- Audio waveform display
- Volume control with mute

### UI/UX
- **Dark/Light Theme** with auto (system) mode and Shift+T shortcut
- **History Panel** - visual undo/redo with jump to any state
- **Floating Info Panel** - filename, resolution, frame, FPS, and cursor color readout
- **Hi-DPI/Retina Display Support** - crisp rendering on high-density displays (2x, 3x DPR)
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

### Export
- Frame export (PNG/JPEG/WebP)
- Sequence export with progress
- Copy to clipboard
- Session save/load (.orvproject format)

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

#### A/B Compare
| Key | Action |
|-----|--------|
| `` ` `` (backtick) | Toggle between A/B sources |
| `~` (tilde) | Toggle between A/B sources |
| `Shift+D` | Toggle difference matte |

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
| `Shift+L` | Luminance |
| `Shift+N` | Normal (RGB) |

#### Color & Effects
| Key | Action |
|-----|--------|
| `C` | Toggle color panel |
| `U` | Toggle curves panel |
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
├── core/
│   ├── graph/          # Node graph system (Graph, Property, Signal)
│   ├── image/          # IPImage data structure
│   └── session/        # Session management, GTO loading, serialization, auto-save
├── nodes/
│   ├── base/           # IPNode, NodeFactory with @RegisterNode decorator
│   ├── sources/        # FileSourceNode, VideoSourceNode, SequenceSourceNode
│   └── groups/         # SequenceGroup, StackGroup, SwitchGroup, etc.
├── render/             # WebGL2 renderer and shaders
├── ui/
│   ├── components/     # Viewer, Timeline, Toolbar, Controls
│   └── shared/         # Button, Modal, Panel utilities
├── paint/              # Annotation engine
├── audio/              # Waveform renderer
├── color/              # CDL, LUT loader, WebGL LUT processor
├── stereo/             # Stereoscopic 3D viewing modes
├── transform/          # Lens distortion
├── composite/          # Blend modes
├── scopes/             # GPU-accelerated scopes (Histogram, Waveform, Vectorscope)
├── utils/              # EventEmitter, FrameExporter, SequenceLoader, HiDPICanvas
│   ├── EffectProcessor.ts      # CPU effect processing (highlights, vibrance, clarity, etc.)
│   ├── PrerenderBufferManager.ts # Prerender cache for smooth playback with effects
│   └── WorkerPool.ts           # Generic worker pool for parallel processing
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

# Run unit tests (4250+ tests)
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

The codebase includes comprehensive test coverage with **4250+ unit tests** across 107 test files and **42 e2e test suites**:

- **Color Tools**: ColorWheels (46 tests), FalseColor (30 tests), HSLQualifier (57 tests), Curves, CDL
- **Analysis**: ZebraStripes (49 tests), PixelProbe (45 tests), ClippingOverlay (48 tests), Waveform (50 tests), Histogram (45 tests), Vectorscope (49 tests)
- **Overlays**: TimecodeOverlay (50 tests), SafeAreasOverlay (46 tests), SpotlightOverlay (62 tests)
- **UI Components**: ThemeControl, HistoryPanel, InfoPanel, Modal, Button, CurveEditor (33 tests), AutoSaveIndicator (35 tests)
- **Core**: Session, Graph, GTO loading/export, SequenceLoader, AutoSaveManager (28 tests), SessionSerializer (35 tests)
- **Utilities**: HiDPICanvas (32 tests), EffectProcessor (51 tests), WorkerPool (28 tests), PrerenderBufferManager (36 tests)

**E2E Tests** (42 test suites):
- **Core**: App initialization, tab navigation, media loading, playback controls, session recovery
- **Scopes**: Histogram, Waveform, Vectorscope, Parade scope
- **Color**: Color controls, Curves, Vibrance, Highlight/Shadow recovery
- **View**: Pixel probe, False color, Zebra stripes, Safe areas, Spotlight, Info panel
- **Comparison**: A/B compare, Wipe modes, Difference matte
- **Compositing**: Stack Control - layer management, blend modes, opacity, visibility, reordering (44 tests)
- **Transform**: Rotation, Flip, Crop
- **Annotations**: Paint tools, Paint coordinates, Text formatting
- **Export**: Frame export, Sequence export
- **Auto-Save**: Indicator display, status changes, styling, animations (14 tests)

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
- **WebGL2** - GPU-accelerated rendering
- **WebCodecs API** - Frame-accurate video decoding via [mediabunny](https://github.com/nickarora/mediabunny)
- **Web Audio API** - Audio playback and waveforms
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
