# OpenRV Web - Implementation Plan

## Project Overview

**Goal:** Create a web-based VFX image/sequence viewer inspired by OpenRV, leveraging the existing `gto-js` library for session file parsing.

**Tech Stack:**
- TypeScript (strict mode)
- Vite (bundler)
- WebGL2 (rendering)
- Web Audio API (audio)
- gto-js (GTO/RV file parsing)
- pnpm (package manager)

**No Backend Required** - Pure client-side application.

---

## Phase 1: Foundation

### 1.1 Project Setup

**Tasks:**
1. Initialize Vite project with TypeScript template
2. Configure TypeScript (strict mode, ES2022 target)
3. Set up project structure (see CODEMAP.md)
4. Install dependencies:
   - `gto-js` - Session file parsing
   - `gl-matrix` - Matrix/vector math
5. Configure development environment (ESLint, Prettier optional)

**Deliverables:**
- Working dev server with hot reload
- TypeScript compilation
- Basic HTML shell

### 1.2 Core Infrastructure

**Tasks:**
1. **Event System** (`src/utils/EventEmitter.ts`)
   - Type-safe event emitter
   - Used for change propagation

2. **Math Utilities** (`src/utils/math/`)
   - Vector2, Vector3, Vector4 classes
   - Matrix3, Matrix4 classes
   - Color utilities (RGB, HSV, Lab conversion)

3. **Property System** (`src/core/graph/Property.ts`)
   - Typed property container
   - Observable properties with change events
   - Serialization support

```typescript
interface Property<T> {
  name: string;
  value: T;
  defaultValue: T;
  onChange: Signal<T>;
}
```

4. **Signal System** (`src/core/graph/Signal.ts`)
   - Reactive change propagation
   - Connect/disconnect pattern

**Deliverables:**
- Core utility classes
- Property/signal system matching OpenRV's architecture

### 1.3 WebGL Renderer Foundation

**Tasks:**
1. **WebGL Context Management** (`src/render/Renderer.ts`)
   - Canvas creation and sizing
   - WebGL2 context with error handling
   - Extension detection (float textures, etc.)

2. **Shader Program Management** (`src/render/ShaderProgram.ts`)
   - Compile vertex/fragment shaders
   - Uniform management
   - Attribute binding

3. **Texture Management** (`src/render/TextureManager.ts`)
   - Texture creation from ImageData
   - Float texture support
   - Texture caching

4. **Framebuffer Management** (`src/render/FrameBuffer.ts`)
   - FBO creation
   - Render-to-texture
   - Ping-pong buffers for multi-pass

5. **Basic Shaders:**
   - `passthrough.vert` - Simple vertex shader
   - `display.frag` - Basic texture display
   - `srgb.frag` - sRGB conversion

**Deliverables:**
- WebGL2 rendering pipeline
- Shader compilation system
- Framebuffer chain for processing

---

## Phase 2: Node Graph System

### 2.1 Base Node Architecture

**Tasks:**
1. **IPNode Base Class** (`src/nodes/base/IPNode.ts`)
   ```typescript
   abstract class IPNode {
     id: string;
     name: string;
     inputs: IPNode[];
     outputs: IPNode[];
     properties: PropertyContainer;

     abstract evaluate(context: EvalContext): IPImage;
     connect(input: IPNode): void;
     disconnect(input: IPNode): void;
   }
   ```

2. **Graph Manager** (`src/core/graph/Graph.ts`)
   - Node registration
   - Connection validation (DAG check)
   - Topological sort for evaluation
   - Change propagation

3. **Evaluation Context** (`src/core/graph/EvalContext.ts`)
   - Current frame number
   - Render resolution
   - Quality settings

4. **Node Factory** (`src/nodes/base/NodeFactory.ts`)
   - Registry pattern for node types
   - Create nodes from GTO protocol names

**Deliverables:**
- Node base class with input/output management
- Graph evaluation system
- Factory for node instantiation

### 2.2 Image Data Structure

**Tasks:**
1. **IPImage Class** (`src/core/image/Image.ts`)
   ```typescript
   class IPImage {
     width: number;
     height: number;
     channels: number;
     dataType: 'uint8' | 'uint16' | 'float32';
     data: ArrayBuffer;
     texture?: WebGLTexture;
     metadata: ImageMetadata;
   }
   ```

2. **Image Metadata** (`src/core/image/Metadata.ts`)
   - Color space info
   - Frame number
   - Source file path
   - Custom attributes

**Deliverables:**
- Image data container
- Metadata system

### 2.3 Source Nodes

**Tasks:**
1. **ImageSourceNode** (`src/nodes/source/ImageSourceNode.ts`)
   - Load image from URL or File
   - Create WebGL texture
   - Handle image decode

2. **FileSourceNode** (`src/nodes/source/FileSourceNode.ts`)
   - Map to RVFileSource
   - Media info extraction
   - Frame range handling

3. **SequenceNode** (`src/nodes/source/SequenceNode.ts`)
   - Image sequence with frame pattern
   - Pre-loading strategy
   - Cache management

4. **Image Loaders** (`src/formats/`)
   - PNG/JPEG/WebP via browser APIs
   - EXR via exr.js library (add as dependency)

**Deliverables:**
- Working source nodes
- Image loading from various sources
- Sequence playback capability

---

## Phase 3: Basic Viewer

### 3.1 Viewer Component

**Tasks:**
1. **Main Viewer** (`src/ui/components/Viewer.ts`)
   - Canvas element management
   - Viewport sizing (fit, fill, 1:1)
   - Background color

2. **Display Node** (`src/nodes/output/DisplayNode.ts`)
   - Final output node
   - Color space conversion for display
   - Render to canvas

3. **Render Loop**
   - RequestAnimationFrame loop
   - Dirty flag optimization
   - Frame timing

**Deliverables:**
- Image display in canvas
- Proper aspect ratio handling

### 3.2 Pan/Zoom Controls

**Tasks:**
1. **Pan/Zoom Controller** (`src/ui/controls/PanZoom.ts`)
   - Mouse drag for pan
   - Wheel for zoom
   - Pinch zoom (touch)
   - Zoom to cursor

2. **Transform State**
   - Current pan offset
   - Current zoom level
   - Reset to fit

3. **Keyboard Shortcuts**
   - `F` - Fit to window
   - `1-8` - Preset zoom levels
   - Arrow keys - Pan

**Deliverables:**
- Interactive pan/zoom
- Keyboard shortcuts

### 3.3 Timeline Component

**Tasks:**
1. **Timeline UI** (`src/ui/components/Timeline.ts`)
   - Canvas-based timeline bar
   - Frame numbers display
   - Current frame indicator
   - In/out points

2. **Timeline Interaction**
   - Click to seek
   - Drag to scrub
   - Shift+click for in/out

3. **Playback Controls** (`src/ui/components/Toolbar.ts`)
   - Play/pause button
   - Step forward/backward
   - FPS display
   - Loop mode toggle

4. **Playback Engine** (`src/core/session/Playback.ts`)
   - Frame timing (realtime vs play-all)
   - Loop modes (once, loop, ping-pong)
   - Play direction

**Deliverables:**
- Functional timeline
- Playback controls
- Frame-accurate seeking

---

## Phase 4: Color Processing

### 4.1 Basic Color Nodes

**Tasks:**
1. **ColorNode Base** (`src/nodes/color/ColorNode.ts`)
   - Base class for color operations
   - Property bindings to uniforms

2. **ExposureNode** (`src/nodes/color/ExposureNode.ts`)
   - Exposure adjustment
   - GLSL: `color *= pow(2.0, exposure)`

3. **GammaNode** (`src/nodes/color/GammaNode.ts`)
   - Gamma correction
   - GLSL: `color = pow(color, vec3(1.0/gamma))`

4. **SaturationNode** (`src/nodes/color/SaturationNode.ts`)
   - Saturation control
   - Luminance-based mixing

5. **ContrastNode** (`src/nodes/color/ContrastNode.ts`)
   - Contrast adjustment
   - Pivot point control

**Shaders to implement:**
```glsl
// exposure.frag
uniform float exposure;
color.rgb *= pow(2.0, exposure);

// gamma.frag
uniform float gamma;
color.rgb = pow(color.rgb, vec3(1.0/gamma));

// saturation.frag
uniform float saturation;
float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
color.rgb = mix(vec3(luma), color.rgb, saturation);
```

**Deliverables:**
- Basic color correction nodes
- GLSL shaders for each

### 4.2 Color Space Conversion

**Tasks:**
1. **sRGB/Linear Conversion**
   - LinearToSRGB node
   - SRGBToLinear node
   - Standard transfer functions

2. **Display Transform**
   - View transform chain
   - Display device simulation

**Deliverables:**
- Color space aware pipeline
- Proper display output

### 4.3 CDL Support

**Tasks:**
1. **CDLNode** (`src/nodes/color/CDLNode.ts`)
   - ASC CDL implementation
   - Slope, Offset, Power
   - Saturation

```glsl
// cdl.frag
uniform vec3 slope;
uniform vec3 offset;
uniform vec3 power;
uniform float saturation;

color.rgb = pow(color.rgb * slope + offset, power);
float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
color.rgb = mix(vec3(luma), color.rgb, saturation);
```

**Deliverables:**
- ASC CDL node
- Industry-standard color correction

---

## Phase 5: Transform & Composition

### 5.1 Transform Nodes

**Tasks:**
1. **Transform2DNode** (`src/nodes/transform/Transform2DNode.ts`)
   - Translate, rotate, scale
   - Pivot point
   - Matrix composition

2. **CropNode** (`src/nodes/transform/CropNode.ts`)
   - Soft/hard edges
   - Aspect ratio constraints

3. **Transform Shaders:**
```glsl
// transform2d.frag
uniform mat3 transform;
vec2 uv = (transform * vec3(texCoord, 1.0)).xy;
```

**Deliverables:**
- 2D transformation pipeline
- Interactive transform controls

### 5.2 Composition Nodes

**Tasks:**
1. **StackNode** (`src/nodes/composite/StackNode.ts`)
   - Layer multiple sources
   - Blend modes

2. **OverNode** (`src/nodes/composite/OverNode.ts`)
   - Standard over operation
   - Premultiplied alpha

3. **Composite Shaders:**
```glsl
// over.frag
vec4 over(vec4 fg, vec4 bg) {
  return fg + bg * (1.0 - fg.a);
}
```

**Deliverables:**
- Layer compositing
- Blend operations

### 5.3 Wipe Comparison

**Tasks:**
1. **WipeControl** (`src/ui/components/Wipe.ts`)
   - Draggable wipe line
   - Horizontal/vertical modes
   - Quad wipe

2. **WipeRenderer**
   - Render split view
   - Smooth edge

**Deliverables:**
- Wipe-based comparison
- A/B view toggle

---

## Phase 6: Annotations

### 6.1 Paint System

**Tasks:**
1. **PaintEngine** (`src/paint/PaintEngine.ts`)
   - Stroke recording
   - Canvas-based drawing
   - Undo/redo stack

2. **Brush Types** (`src/paint/Brush.ts`)
   - Pencil (hard edge)
   - Brush (soft edge)
   - Eraser
   - Text tool

3. **Stroke Data** (`src/paint/Stroke.ts`)
   - Point array with pressure
   - Color and size
   - Serialization for GTO

4. **Paint Renderer** (`src/paint/PaintRenderer.ts`)
   - Render strokes to texture
   - Composite over image

**Deliverables:**
- Drawing capability
- Stroke serialization

### 6.2 Annotation Features

**Tasks:**
1. **Ghost Mode**
   - Show nearby frame annotations
   - Opacity falloff

2. **Hold Mode**
   - Keep current annotation visible

3. **Frame-based Storage**
   - Per-frame annotation data
   - Compatible with RVPaint format

**Deliverables:**
- Ghost/hold annotation display
- Frame-accurate annotations

---

## Phase 7: Session Integration

### 7.1 Session Loading

**Tasks:**
1. **Session Parser** (`src/core/session/Serializer.ts`)
   - Use gto-js to parse RV files
   - Map GTO objects to nodes
   - Reconstruct graph connections

2. **Protocol Mapping:**
   - RVFileSource → FileSourceNode
   - RVColor → ColorNode chain
   - RVTransform2D → Transform2DNode
   - RVPaint → PaintEngine
   - RVSequence → SequenceNode

3. **Session State** (`src/core/session/Session.ts`)
   - Current frame
   - View settings
   - Selected source

**Deliverables:**
- Load existing RV session files
- Reconstruct node graph

### 7.2 Session Saving

**Tasks:**
1. **Session Export**
   - Convert nodes back to GTO
   - Preserve all settings

2. **File Download**
   - Generate .rv text file
   - Optional binary GTO

**Deliverables:**
- Save sessions
- Round-trip compatibility

---

## Phase 8: Audio Support

### 8.1 Audio Engine

**Tasks:**
1. **AudioEngine** (`src/audio/AudioEngine.ts`)
   - Web Audio API integration
   - Sample rate handling
   - Buffer management

2. **AudioTrack** (`src/audio/AudioTrack.ts`)
   - Load audio files
   - Time offset
   - Volume control

3. **Sync to Video**
   - Lock audio to frame rate
   - Scrub audio

**Deliverables:**
- Audio playback
- Video/audio sync

### 8.2 Waveform Display

**Tasks:**
1. **Waveform Renderer** (`src/audio/Waveform.ts`)
   - Extract audio data
   - Canvas rendering
   - Timeline integration

**Deliverables:**
- Waveform visualization

---

## Phase 9: Advanced Features

### 9.1 LUT Support

**Tasks:**
1. **LUT Loader**
   - Parse .cube files
   - 1D and 3D LUT support

2. **LUT3DNode**
   - 3D texture lookup
   - Tetrahedral interpolation

**Deliverables:**
- .cube LUT loading
- LUT application

### 9.2 Lens Correction

**Tasks:**
1. **LensWarpNode**
   - Radial distortion
   - Tangential distortion
   - Anamorphic squeeze

**Deliverables:**
- Lens distortion correction

### 9.3 Performance Optimization

**Tasks:**
1. **Frame Caching**
   - LRU cache for decoded frames
   - Memory limit management

2. **Web Workers**
   - Offload decoding
   - Background processing

3. **Progressive Loading**
   - Thumbnail first
   - Full resolution on demand

**Deliverables:**
- Smooth playback
- Optimized memory usage

---

## Phase 10: Polish & Export

### 10.1 UI Refinement

**Tasks:**
1. **Keyboard Shortcuts**
   - Full shortcut map (match OpenRV)
   - Customizable bindings

2. **Responsive Layout**
   - Resizable panels
   - Full-screen mode

3. **Pixel Inspector**
   - Show color values
   - Coordinate display

### 10.2 Export Features

**Tasks:**
1. **Frame Export**
   - PNG/JPEG export
   - With/without grading

2. **Sequence Export**
   - Multiple frame export
   - Progress indication

---

## Implementation Priority Order

1. **MVP (Minimum Viable Product)**
   - Phase 1 (Foundation)
   - Phase 2 (Node Graph)
   - Phase 3 (Basic Viewer)
   - → Can display images, navigate timeline

2. **Usable Product**
   - Phase 4 (Color Processing)
   - Phase 5 (Transform & Composition)
   - → Color correction, comparisons

3. **Feature Complete**
   - Phase 6 (Annotations)
   - Phase 7 (Session Integration)
   - → Load/save RV sessions

4. **Full Product**
   - Phase 8 (Audio)
   - Phase 9 (Advanced)
   - Phase 10 (Polish)

---

## Testing Strategy

### Unit Tests
- Math utilities
- Property system
- Node graph logic

### Integration Tests
- Shader compilation
- Image loading
- Session parsing

### Visual Tests
- Reference image comparison
- Shader output validation

---

## File Structure Summary

```
src/
├── main.ts              # Entry point
├── App.ts               # Application class
├── core/
│   ├── graph/           # Node graph infrastructure
│   ├── image/           # Image data structures
│   └── session/         # Session management
├── nodes/
│   ├── base/            # Base node classes
│   ├── source/          # Source nodes
│   ├── color/           # Color processing
│   ├── transform/       # Transforms
│   ├── filter/          # Filters
│   ├── composite/       # Composition
│   └── output/          # Output nodes
├── render/
│   ├── Renderer.ts      # WebGL renderer
│   ├── ShaderProgram.ts # Shader management
│   └── shaders/         # GLSL shaders
├── ui/
│   ├── components/      # UI components
│   ├── controls/        # Input handling
│   └── overlays/        # Overlays
├── paint/               # Annotation system
├── audio/               # Audio engine
├── formats/             # File loaders
└── utils/               # Utilities
```

---

## Dependencies

```json
{
  "dependencies": {
    "gto-js": "^x.x.x",
    "gl-matrix": "^3.4.3"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

**Optional (add as needed):**
- `exr.js` - EXR file support
- `pako` - Gzip decompression
- `zustand` - State management
