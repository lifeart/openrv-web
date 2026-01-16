# OpenRV Web

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
- ASC CDL (slope, offset, power, saturation) with .cdl file support
- 3D LUT support (.cube files) with GPU-accelerated processing

### Transform & Effects
- Rotation (90°/180°/270°) and flip (H/V)
- Crop tool with aspect ratio presets and rule-of-thirds guides
- Lens distortion correction (barrel/pincushion)
- Blur and sharpen filters

### Comparison & Composition
- Wipe comparison (horizontal/vertical split view)
- Multi-layer stack with blend modes
- A/B source switching

### Annotations
- Pen tool with pressure sensitivity
- Text annotations
- Eraser and brush types
- Ghost mode (show nearby frame annotations)
- Per-frame annotation storage

### Playback
- Frame-accurate timeline with scrubbing
- In/out points and markers
- Loop modes (once, loop, ping-pong)
- Audio waveform display
- Volume control with mute

### Export
- Frame export (PNG/JPEG/WebP)
- Sequence export with progress
- Copy to clipboard
- Session save/load (.orvproject format)

## Installation

```bash
# Clone the repository
git clone https://github.com/user/openrv-web.git
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

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `Left/Right` | Step frame |
| `Home/End` | Go to start/end |
| `I/O` | Set in/out points |
| `L` | Toggle loop mode |
| `F` | Fit to window |
| `1-5` | Switch tabs (View, Color, Effects, Transform, Annotate) |
| `C` | Toggle color panel |
| `G` | Toggle filter panel |
| `K` | Toggle crop mode |
| `W` | Cycle wipe modes |
| `P` | Toggle paint mode |
| `Z` | Undo |
| `Shift+Z` | Redo |
| `Ctrl+S` | Export frame |
| `Ctrl+C` | Copy frame to clipboard |
| `< / >` | Jump to prev/next annotation |

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
│   └── session/        # Session management, GTO loading, serialization
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
├── transform/          # Lens distortion
├── composite/          # Blend modes
└── utils/              # EventEmitter, FrameExporter, SequenceLoader
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

RV session files are parsed using `gto-js` and reconstructed into the node graph:

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

# Build for production
pnpm build

# Preview production build
pnpm preview
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
- **WebGL2** - GPU-accelerated rendering
- **Web Audio API** - Audio playback and waveforms
- **gto-js** - RV/GTO file parsing
- **gl-matrix** - Matrix/vector math

## Browser Support

Requires WebGL2 support:
- Chrome 56+
- Firefox 51+
- Safari 15+
- Edge 79+

## License

MIT

## Related Projects

- [OpenRV](https://github.com/AcademySoftwareFoundation/OpenRV) - Original C++ application
- [gto-js](https://github.com/user/gto-js) - GTO file format parser for JavaScript
