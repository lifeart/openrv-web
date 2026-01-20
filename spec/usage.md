# gto-js Usage Guide for OpenRV GTO Files

> Comprehensive examples for reading, writing, and manipulating OpenRV `.rv` session files using the [gto-js](https://github.com/lifeart/gto-js) library.

## Table of Contents

1. [Installation](#installation)
2. [Reading GTO Files](#reading-gto-files)
3. [Writing GTO Files](#writing-gto-files)
4. [Core Session Objects](#core-session-objects)
5. [Source Nodes](#source-nodes)
6. [Group Nodes](#group-nodes)
7. [Processing Nodes](#processing-nodes)
8. [Utility Nodes](#utility-nodes)
9. [Conversion Nodes](#conversion-nodes)
10. [Output Nodes](#output-nodes)
11. [Connection System](#connection-system)
12. [Querying with GTODTO](#querying-with-gtodto)
13. [Modifying Existing Files](#modifying-existing-files)
14. [EDL Manipulation](#edl-manipulation)
15. [Error Handling](#error-handling)
16. [TypeScript Types](#typescript-types)
17. [Batch Processing](#batch-processing)
18. [Validation Patterns](#validation-patterns)
19. [Advanced Reader](#advanced-reader)
20. [Complete Examples](#complete-examples)

---

## Installation

```bash
npm install gto-js
```

```typescript
import {
  SimpleReader,
  SimpleWriter,
  GTOBuilder,
  GTODTO,
  DataType
} from 'gto-js';
```

---

## Reading GTO Files

### Basic Reading

```typescript
import { SimpleReader } from 'gto-js';
import { readFileSync } from 'fs';

// Read text format (.rv)
const content = readFileSync('session.rv', 'utf-8');
const reader = new SimpleReader();
reader.open(content);

// Access parsed data
const data = reader.result;
console.log(`GTO Version: ${data.version}`);
console.log(`Objects: ${data.objects.length}`);

// Iterate objects
for (const obj of data.objects) {
  console.log(`${obj.name} : ${obj.protocol} (${obj.protocolVersion})`);
}
```

### Reading Binary Format

```typescript
import { SimpleReader } from 'gto-js';
import { readFileSync } from 'fs';

// Binary format (.gto)
const binary = readFileSync('scene.gto');
const reader = new SimpleReader();
reader.open(binary.buffer);

// Compressed format (.gto.gz) - async required
const compressed = readFileSync('scene.gto.gz');
const asyncReader = new SimpleReader();
await asyncReader.openAsync(compressed.buffer);
```

### Accessing Properties

```typescript
const reader = new SimpleReader();
reader.open(content);
const data = reader.result;

// Navigate: object -> component -> property -> data
const session = data.objects.find(o => o.protocol === 'RVSession');
const fps = session.components.session.properties.fps.data[0];
const viewNode = session.components.session.properties.viewNode.data[0];

console.log(`FPS: ${fps}, View: ${viewNode}`);
```

---

## Writing GTO Files

### Using SimpleWriter

```typescript
import { SimpleWriter } from 'gto-js';
import { writeFileSync } from 'fs';

// Note: version 4 is used internally by gto-js
// The output file header will be "GTOa (3)" for text format
const data = {
  version: 4,
  objects: [{
    name: 'mySession',
    protocol: 'RVSession',
    protocolVersion: 1,
    components: {
      session: {
        interpretation: '',
        properties: {
          viewNode: {
            type: 'string',
            size: 1,
            width: 1,
            interpretation: '',
            data: ['defaultSequence']
          },
          fps: {
            type: 'float',
            size: 1,
            width: 1,
            interpretation: '',
            data: [24.0]
          },
          realtime: {
            type: 'int',
            size: 1,
            width: 1,
            interpretation: '',
            data: [0]
          }
        }
      }
    }
  }]
};

// Write as text
const text = SimpleWriter.write(data);
writeFileSync('output.rv', text);

// Write as binary
const binary = SimpleWriter.write(data, { binary: true });
writeFileSync('output.gto', Buffer.from(binary));
```

### Using GTOBuilder (Fluent API)

```typescript
import { GTOBuilder, SimpleWriter } from 'gto-js';

const data = new GTOBuilder()
  .object('mySession', 'RVSession', 1)
    .component('session')
      .string('viewNode', 'defaultSequence')
      .float('fps', 24.0)
      .int('realtime', 0)
    .end()
  .end()
  .build();

const rv = SimpleWriter.write(data);
```

---

## Core Session Objects

### RVSession

```typescript
import { GTOBuilder, SimpleWriter } from 'gto-js';

const session = new GTOBuilder()
  // RVSession - root session object
  .object('mySession', 'RVSession', 1)
    .component('session')
      .string('viewNode', 'defaultSequence')
      .int2('range', [[1, 100]])           // Frame range [start, end]
      .int2('region', [[10, 90]])          // In/out points
      .float('fps', 24.0)
      .int('realtime', 0)
      .int('inc', 1)                       // Frame increment
      .int('currentFrame', 1)
      .int('frame', 1)
    .end()
    .component('root')
      .string('name', 'My Session')
      .string('comment', 'Session notes here')
    .end()
    .component('matte')
      .int('show', 0)
      .float('aspect', 1.78)
      .float('opacity', 0.66)
      .float('heightVisible', -1.0)
      .float2('centerPoint', [[0, 0]])
    .end()
    .component('paintEffects')
      .int('hold', 0)
      .int('ghost', 0)
      .int('ghostBefore', 5)
      .int('ghostAfter', 5)
    .end()
  .end()
  .build();
```

### connection Object

```typescript
// Connection object - defines graph topology
const connections = new GTOBuilder()
  .object('connections', 'connection', 1)
    .component('evaluation')
      // lhs -> rhs connections (sourceA -> sequence, sourceB -> sequence)
      .string('lhs', ['sourceGroup000000', 'sourceGroup000001'])
      .string('rhs', ['defaultSequence', 'defaultSequence'])
    .end()
    .component('top')
      .string('nodes', ['defaultSequence'])  // Top-level viewable nodes
    .end()
  .end()
  .build();
```

---

## Source Nodes

### RVFileSource

```typescript
const fileSource = new GTOBuilder()
  .object('sourceGroup000000_source', 'RVFileSource', 1)
    .component('media')
      .string('movie', '/path/to/movie.mov')
      .string('name', 'shot_001')
    .end()
    .component('group')
      .float('fps', 24.0)
      .float('volume', 1.0)
      .float('audioOffset', 0.0)
      .float('balance', 0.0)
      .float('crossover', 0.0)
      .int('noMovieAudio', 0)
      .int('rangeOffset', 0)
    .end()
    .component('cut')
      .int('in', -2147483648)   // MIN_INT = start of media
      .int('out', 2147483647)   // MAX_INT = end of media
    .end()
    .component('request')
      .int('readAllChannels', 0)
    .end()
  .end()
  .build();
```

### RVFileSource with Stereo Layers

```typescript
const stereoSource = new GTOBuilder()
  .object('sourceGroup000000_source', 'RVFileSource', 1)
    .component('media')
      // Multiple paths = stereo layers
      .string('movie', ['/path/to/left_eye.exr', '/path/to/right_eye.exr'])
      .string('name', ['left', 'right'])
    .end()
    .component('group')
      .float('fps', 24.0)
      .float('volume', 1.0)
    .end()
  .end()
  .build();
```

### RVImageSource (Programmatic Images)

```typescript
const imageSource = new GTOBuilder()
  .object('sourceGroup000000_source', 'RVImageSource', 1)
    .component('media')
      .string('name', 'Generated Image')
      .string('movie', 'generated://myimage')
      .string('location', 'image')
    .end()
    .component('image')
      .int('width', 1920)
      .int('height', 1080)
      .int('uncropWidth', 1920)
      .int('uncropHeight', 1080)
      .int('uncropX', 0)
      .int('uncropY', 0)
      .float('pixelAspect', 1.0)
      .float('fps', 24.0)
      .int('start', 1)
      .int('end', 100)
      .int('inc', 1)
      .string('encoding', 'None')
      .string('channels', 'RGBA')
      .int('bitsPerChannel', 16)
      .int('float', 1)
    .end()
    .component('cut')
      .int('in', -2147483648)
      .int('out', 2147483647)
    .end()
  .end()
  .build();
```

### RVSourceGroup

```typescript
const sourceGroup = new GTOBuilder()
  .object('sourceGroup000000', 'RVSourceGroup', 1)
    .component('ui')
      .string('name', 'My Shot')
    .end()
    .component('markers')
      .int('in', 10)
      .int('out', 50)
      .float4('color', [[1, 0, 0, 1]])  // Red marker
      .string('name', 'action_start')
    .end()
  .end()
  .build();
```

---

## Group Nodes

### RVSequenceGroup / RVSequence (EDL)

```typescript
const sequence = new GTOBuilder()
  // Sequence Group container
  .object('defaultSequence', 'RVSequenceGroup', 1)
    .component('ui')
      .string('name', 'Main Sequence')
    .end()
  .end()
  // Sequence node with EDL
  .object('defaultSequence_sequence', 'RVSequence', 1)
    .component('edl')
      // EDL: frame boundaries, source indices, in/out points
      .int('frame', [1, 101, 201])        // Cut boundaries
      .int('source', [0, 1, 0])           // Source indices
      .int('in', [1, 1, 50])              // Source in-points
      .int('out', [100, 100, 150])        // Source out-points
    .end()
    .component('output')
      .int2('size', [[1920, 1080]])
      .float('fps', 24.0)
      .int('autoSize', 1)
      .int('interactiveSize', 1)
    .end()
    .component('mode')
      .int('autoEDL', 1)
      .int('useCutInfo', 1)
      .int('supportReversedOrderBlending', 1)
    .end()
  .end()
  .build();
```

### RVStackGroup / RVStack (Compositing)

```typescript
const stack = new GTOBuilder()
  // Stack Group container
  .object('defaultStack', 'RVStackGroup', 1)
    .component('ui')
      .string('name', 'Composite Stack')
    .end()
  .end()
  // Stack node
  .object('defaultStack_stack', 'RVStack', 1)
    .component('output')
      .float('fps', 24.0)
      .int2('size', [[1920, 1080]])
      .int('autoSize', 1)
      .string('chosenAudioInput', '.all.')    // .all., .topmost., .first., or node name
      .int('interactiveSize', 0)
      .string('outOfRangePolicy', 'hold')     // hold, black, checkerboard
    .end()
    .component('mode')
      .int('useCutInfo', 1)
      .int('alignStartFrames', 0)
      .int('strictFrameRanges', 0)
      .int('supportReversedOrderBlending', 1)
    .end()
    .component('composite')
      .string('type', 'over')   // over, topmost, difference, replace
    .end()
  .end()
  .build();
```

### RVLayoutGroup (Multi-View Layout)

```typescript
const layout = new GTOBuilder()
  .object('defaultLayout', 'RVLayoutGroup', 1)
    .component('ui')
      .string('name', 'Compare Layout')
    .end()
    .component('layout')
      .string('mode', 'packed')     // packed, packed2, row, column, grid
      .float('spacing', 1.0)
      .int('gridRows', 2)           // 0 = auto
      .int('gridColumns', 2)        // 0 = auto
    .end()
    .component('timing')
      .int('retimeInputs', 0)
    .end()
  .end()
  .build();
```

### RVSwitchGroup (Input Selection)

```typescript
const switchGroup = new GTOBuilder()
  .object('mySwitch', 'RVSwitchGroup', 1)
    .component('ui')
      .string('name', 'Version Switch')
    .end()
  .end()
  .object('mySwitch_switch', 'RVSwitch', 1)
    .component('output')
      .float('fps', 24.0)
      .int2('size', [[1920, 1080]])
      .string('input', 'sourceGroup000000')  // Currently selected input
      .int('autoSize', 1)
    .end()
    .component('mode')
      .int('useCutInfo', 1)
      .int('autoEDL', 1)
      .int('alignStartFrames', 0)
    .end()
  .end()
  .build();
```

### RVFolderGroup

```typescript
const folder = new GTOBuilder()
  .object('myFolder', 'RVFolderGroup', 1)
    .component('ui')
      .string('name', 'Shot Folder')
    .end()
    .component('mode')
      .string('viewType', 'switch')   // switch, stack, layout
    .end()
  .end()
  .build();
```

---

## Processing Nodes

### RVColor (Color Correction)

```typescript
const color = new GTOBuilder()
  .object('sourceGroup000000_RVColor', 'RVColor', 1)
    .component('color')
      .int('active', 1)
      .int('invert', 0)
      .float3('gamma', [[1.1, 1.1, 1.1]])
      .string('lut', 'default')
      .float3('offset', [[0.0, 0.0, 0.0]])
      .float3('scale', [[1.0, 1.0, 1.0]])
      .float3('exposure', [[0.5, 0.5, 0.5]])
      .float3('contrast', [[0.0, 0.0, 0.0]])
      .float('saturation', 1.2)
      .float('hue', 0.0)
      .int('normalize', 0)
      .int('unpremult', 0)
    .end()
    .component('CDL')
      .int('active', 1)
      .string('colorspace', 'rec709')     // rec709, aceslog, aces
      .float3('slope', [[1.0, 1.0, 1.0]])
      .float3('offset', [[0.0, 0.0, 0.0]])
      .float3('power', [[1.0, 1.0, 1.0]])
      .float('saturation', 1.0)
      .int('noClamp', 0)
    .end()
    .component('luminanceLUT')
      .int('active', 0)
      .float('max', 1.0)
      .int('size', 0)
      .string('name', '')
    .end()
  .end()
  .build();
```

### RVLinearize (Log-to-Linear)

```typescript
const linearize = new GTOBuilder()
  .object('sourceGroup000000_RVLinearize', 'RVLinearize', 1)
    .component('node')
      .int('active', 1)
    .end()
    .component('color')
      .string('lut', '')
      .int('alphaType', 0)
      .int('logtype', 0)
      .int('YUV', 0)
      .int('invert', 0)
      .int('sRGB2linear', 0)
      .int('Rec709ToLinear', 0)
      .float('fileGamma', 1.0)
      .int('active', 1)
      .int('ignoreChromaticities', 0)
    .end()
    .component('cineon')
      .int('whiteCodeValue', 685)
      .int('blackCodeValue', 95)
      .int('breakPointValue', 685)
    .end()
    .component('lut')
      .int('active', 0)
      .string('file', '')
      .string('name', '')
      .string('type', 'Luminance')
      .float('scale', 1.0)
      .float('offset', 0.0)
      .int3('size', [[0, 0, 0]])
    .end()
  .end()
  .build();
```

### RVLookLUT (Look Tables)

```typescript
const lookLUT = new GTOBuilder()
  .object('sourceGroup000000_RVLookLUT', 'RVLookLUT', 1)
    .component('lut')
      .int('active', 1)
      .string('file', '/path/to/look.cube')
      .string('name', 'My Look')
      .string('type', '3D')              // Luminance, 3D, Channel
      .float('scale', 1.0)
      .float('offset', 0.0)
      .float('conditioningGamma', 1.0)
      .int3('size', [[33, 33, 33]])      // 3D LUT dimensions
      .int('preLUTSize', 0)
    .end()
  .end()
  .build();
```

### RVTransform2D

```typescript
const transform = new GTOBuilder()
  .object('sourceGroup000000_RVTransform2D', 'RVTransform2D', 1)
    .component('transform')
      .int('active', 1)
      .float2('translate', [[0.0, 0.0]])
      .float2('scale', [[1.0, 1.0]])
      .float('rotate', 0.0)              // Degrees
      .int('flip', 0)                    // Vertical flip
      .int('flop', 0)                    // Horizontal flip
    .end()
    .component('visibleBox')
      .float('left', 0.0)
      .float('right', 1.0)
      .float('bottom', 0.0)
      .float('top', 1.0)
    .end()
    .component('output')
      .float('fps', 0.0)
    .end()
  .end()
  .build();
```

### RVCrop

```typescript
const crop = new GTOBuilder()
  .object('sourceGroup000000_RVCrop', 'RVCrop', 1)
    .component('node')
      .int('active', 1)
      .int('manip', 0)
    .end()
    .component('crop')
      .int('baseWidth', 1920)
      .int('baseHeight', 1080)
      .int('left', 100)
      .int('right', 100)
      .int('top', 50)
      .int('bottom', 50)
    .end()
  .end()
  .build();
```

### RVRetime (Speed Changes)

```typescript
const retime = new GTOBuilder()
  .object('sourceGroup000000_RVRetime', 'RVRetime', 1)
    .component('visual')
      .float('scale', 0.5)               // 50% speed
      .float('offset', 0.0)
    .end()
    .component('audio')
      .float('scale', 0.5)
      .float('offset', 0.0)
    .end()
    .component('output')
      .float('fps', 24.0)
    .end()
    .component('warp')
      .int('active', 0)
      .int('style', 0)
      .int('keyFrames', [1, 50, 100])
      .float('keyRates', [1.0, 0.5, 1.0])
    .end()
    .component('explicit')
      .int('active', 0)
      .int('firstOutputFrame', 1)
      .int('inputFrames', [1, 2, 3, 4, 5])  // Explicit frame mapping
    .end()
  .end()
  .build();
```

### RVLensWarp (Lens Distortion)

```typescript
const lensWarp = new GTOBuilder()
  .object('sourceGroup000000_RVLensWarp', 'RVLensWarp', 1)
    .component('node')
      .int('active', 1)
    .end()
    .component('warp')
      .string('model', 'brown')          // brown, opencv, pfbarrel, nuke, tde4_ldp_anamorphic_deg_6, adobe
      .float('pixelAspectRatio', 1.0)
      .float('k1', 0.0)
      .float('k2', 0.0)
      .float('k3', 0.0)
      .float('d', 1.0)
      .float('p1', 0.0)
      .float('p2', 0.0)
      .float2('center', [[0.5, 0.5]])
      .float2('offset', [[0.0, 0.0]])
      .float('fx', 1.0)
      .float('fy', 1.0)
      .float('cropRatioX', 1.0)
      .float('cropRatioY', 1.0)
    .end()
  .end()
  .build();
```

### RVDisplayColor

```typescript
const displayColor = new GTOBuilder()
  .object('displayGroup_RVDisplayColor', 'RVDisplayColor', 1)
    .component('color')
      .int('active', 1)
      .string('channelOrder', 'RGBA')
      .int('channelFlood', 0)
      .int('premult', 0)
      .float('gamma', 1.0)
      .int('sRGB', 1)
      .int('Rec709', 0)
      .float('brightness', 0.0)
      .int('outOfRange', 0)
      .int('dither', 0)
      .int('ditherLast', 1)
      .string('overrideColorspace', '')
    .end()
    .component('chromaticities')
      .int('active', 0)
      .int('adoptedNeutral', 1)
      .float2('white', [[0.3127, 0.329]])     // D65
      .float2('red', [[0.64, 0.33]])          // sRGB primaries
      .float2('green', [[0.3, 0.6]])
      .float2('blue', [[0.15, 0.06]])
      .float2('neutral', [[0.3127, 0.329]])
    .end()
  .end()
  .build();
```

### RVDisplayStereo

```typescript
const displayStereo = new GTOBuilder()
  .object('displayGroup_RVDisplayStereo', 'RVDisplayStereo', 1)
    .component('stereo')
      // Modes: off, mono, left, right, pair, mirror, hsqueezed, vsqueezed,
      //        anaglyph, lumanaglyph, scanline, checker
      .string('type', 'anaglyph')
      .int('swap', 0)
    .end()
  .end()
  .build();
```

### RVSourceStereo

```typescript
const sourceStereo = new GTOBuilder()
  .object('sourceGroup000000_RVSourceStereo', 'RVSourceStereo', 1)
    .component('stereo')
      .int('swap', 0)
      .float('relativeOffset', 0.0)
      .float('rightOffset', 0.0)
    .end()
    .component('rightTransform')
      .int('flip', 0)
      .int('flop', 0)
      .float('rotate', 0.0)
      .float2('translate', [[0.0, 0.0]])
    .end()
  .end()
  .build();
```

### RVPaint (Annotations)

```typescript
const paint = new GTOBuilder()
  .object('sourceGroup000000_RVPaint', 'RVPaint', 1)
    .component('paint')
      .int('nextId', 3)
      .int('nextAnnotationId', 1)
      .int('show', 1)
      .string('exclude', '')
      .string('include', '')
    .end()
    // Pen stroke
    .component('pen:0')
      .float('width', 3.0)
      .float4('color', [[1.0, 0.0, 0.0, 1.0]])   // Red
      .string('brush', 'default')
      .int('join', 0)
      .int('cap', 0)
      .int('mode', 0)
      .int('splat', 0)
      .int('eye', 0)
      .int('startFrame', 10)
      .int('duration', 1)
      // Points as float[2] array
      .float2('points', [[0.1, 0.2], [0.15, 0.25], [0.2, 0.3]])
    .end()
    // Text annotation
    .component('text:1')
      .float('size', 24.0)
      .float('scale', 1.0)
      .float('rotation', 0.0)
      .float('spacing', 0.0)
      .float2('position', [[0.5, 0.5]])
      .float4('color', [[1.0, 1.0, 0.0, 1.0]])   // Yellow
      .string('font', 'Helvetica')
      .string('text', 'Review Note')
      .string('origin', 'center')
      .int('eye', 0)
      .int('startFrame', 10)
      .int('duration', 10)
    .end()
    // Frame organization
    .component('frame:10')
      .string('order', ['pen:0', 'text:1'])
    .end()
  .end()
  .build();
```

### RVOverlay

```typescript
const overlay = new GTOBuilder()
  .object('sourceGroup000000_RVOverlay', 'RVOverlay', 1)
    .component('overlay')
      .int('nextRectId', 1)
      .int('nextTextId', 1)
      .int('show', 1)
    .end()
    .component('matte')
      .int('show', 1)
      .float('opacity', 0.8)
      .float('aspect', 2.39)              // Cinemascope
      .float('heightVisible', 1.0)
      .float2('centerPoint', [[0.5, 0.5]])
    .end()
    // Rectangle overlay
    .component('rect:0')
      .float('width', 0.1)
      .float('height', 0.05)
      .float4('color', [[1.0, 0.0, 0.0, 0.5]])
      .float2('position', [[0.1, 0.9]])
      .int('eye', 0)
      .int('active', 1)
    .end()
    // Text overlay
    .component('text:0')
      .float2('position', [[0.05, 0.95]])
      .float4('color', [[1.0, 1.0, 1.0, 1.0]])
      .float('size', 18.0)
      .float('scale', 1.0)
      .string('font', 'Courier')
      .string('text', 'Frame: {frame}')
      .string('origin', 'top-left')
      .int('active', 1)
    .end()
  .end()
  .build();
```

### Filter Nodes

```typescript
// Gaussian Blur
const gaussian = new GTOBuilder()
  .object('sourceGroup000000_RVFilterGaussian', 'RVFilterGaussian', 1)
    .component('node')
      .float('sigma', 0.03)
      .float('radius', 10.0)
    .end()
  .end()
  .build();

// Unsharp Mask (Sharpening)
const unsharp = new GTOBuilder()
  .object('sourceGroup000000_RVUnsharpMask', 'RVUnsharpMask', 1)
    .component('node')
      .int('active', 1)
      .float('amount', 1.5)
      .float('threshold', 5.0)
      .float('unsharpRadius', 5.0)
    .end()
  .end()
  .build();

// Noise Reduction
const noise = new GTOBuilder()
  .object('sourceGroup000000_RVNoiseReduction', 'RVNoiseReduction', 1)
    .component('node')
      .int('active', 1)
      .float('amount', 0.5)
      .float('radius', 3.0)
      .float('threshold', 5.0)
    .end()
  .end()
  .build();

// Clarity (Local Contrast)
const clarity = new GTOBuilder()
  .object('sourceGroup000000_RVClarity', 'RVClarity', 1)
    .component('node')
      .int('active', 1)
      .float('amount', 0.3)
      .float('radius', 20.0)
    .end()
  .end()
  .build();
```

### Additional Color Nodes

```typescript
// Color Exposure
const exposure = new GTOBuilder()
  .object('sourceGroup000000_RVColorExposure', 'RVColorExposure', 1)
    .component('color')
      .int('active', 1)
      .float('exposure', 0.5)            // Stops
    .end()
  .end()
  .build();

// Color Temperature
const temperature = new GTOBuilder()
  .object('sourceGroup000000_RVColorTemperature', 'RVColorTemperature', 1)
    .component('color')
      .int('active', 1)
      .float2('inWhitePrimary', [[0.3457, 0.3585]])
      .float('inTemperature', 6500.0)
      .float('outTemperature', 5500.0)   // Warmer
      .int('method', 2)
    .end()
  .end()
  .build();

// Saturation
const saturation = new GTOBuilder()
  .object('sourceGroup000000_RVColorSaturation', 'RVColorSaturation', 1)
    .component('color')
      .int('active', 1)
      .float('saturation', 1.2)
    .end()
  .end()
  .build();

// Vibrance
const vibrance = new GTOBuilder()
  .object('sourceGroup000000_RVColorVibrance', 'RVColorVibrance', 1)
    .component('color')
      .int('active', 1)
      .float('vibrance', 0.3)
    .end()
  .end()
  .build();

// Shadows/Highlights
const shadows = new GTOBuilder()
  .object('sourceGroup000000_RVColorShadow', 'RVColorShadow', 1)
    .component('color')
      .int('active', 1)
      .float('shadow', 0.2)
    .end()
  .end()
  .build();

const highlights = new GTOBuilder()
  .object('sourceGroup000000_RVColorHighlight', 'RVColorHighlight', 1)
    .component('color')
      .int('active', 1)
      .float('highlight', -0.1)
    .end()
  .end()
  .build();

// Grayscale
const grayscale = new GTOBuilder()
  .object('sourceGroup000000_RVColorGrayScale', 'RVColorGrayScale', 1)
    .component('node')
      .int('active', 1)
    .end()
  .end()
  .build();

// Standalone CDL
const cdl = new GTOBuilder()
  .object('sourceGroup000000_RVColorCDL', 'RVColorCDL', 1)
    .component('node')
      .int('active', 1)
      .string('file', '/path/to/grades.cdl')
      .string('colorspace', 'rec709')
      .float3('slope', [[1.1, 1.0, 0.9]])
      .float3('offset', [[0.01, 0.0, -0.01]])
      .float3('power', [[1.0, 1.0, 1.0]])
      .float('saturation', 1.0)
      .int('noClamp', 1)
    .end()
  .end()
  .build();
```

### Color Management (OCIO)

```typescript
const ocio = new GTOBuilder()
  .object('sourceGroup000000_RVOCIO', 'RVOCIO', 1)
    .component('ocio')
      .string('function', 'color')       // color, look, display
      .int('active', 1)
      .int('lut3DSize', 32)
      .string('inColorSpace', 'ACES - ACEScg')
    .end()
    .component('ocio_color')
      .string('outColorSpace', 'Output - sRGB')
    .end()
    .component('ocio_look')
      .string('look', '')
      .int('direction', 0)
      .string('outColorSpace', '')
    .end()
    .component('ocio_display')
      .string('display', 'sRGB')
      .string('view', 'ACES 1.0 SDR-video')
    .end()
    .component('config')
      .string('description', 'ACES 1.2')
      .string('workingDir', '/path/to/ocio')
    .end()
  .end()
  .build();
```

---

## Utility Nodes

### RVCache (Frame Caching)

```typescript
const cache = new GTOBuilder()
  .object('sourceGroup000000_RVCache', 'RVCache', 1)
    .component('render')
      .int('downSampling', 1)            // 1 = full res, 2 = half, 4 = quarter
    .end()
  .end()
  .build();
```

### RVResize (Image Resizing)

```typescript
const resize = new GTOBuilder()
  .object('sourceGroup000000_RVResize', 'RVResize', 1)
    .component('node')
      .int('active', 1)
      .int('upsamplingQuality', 1)       // Quality level for upscaling
      .int('outWidth', 1920)
      .int('outHeight', 1080)
      .int('useContext', 0)              // 1 = use context dimensions
    .end()
  .end()
  .build();
```

### RVChannelMap (Channel Selection)

```typescript
// Select specific EXR channels
const channelMap = new GTOBuilder()
  .object('sourceGroup000000_RVChannelMap', 'RVChannelMap', 1)
    .component('format')
      // Map channels: select R, G, B, A from available layers
      .string('channels', ['R', 'G', 'B', 'A'])
    .end()
  .end()
  .build();

// Select from multi-layer EXR
const multiLayerMap = new GTOBuilder()
  .object('sourceGroup000000_RVChannelMap', 'RVChannelMap', 1)
    .component('format')
      // Select beauty pass from multi-layer EXR
      .string('channels', ['beauty.R', 'beauty.G', 'beauty.B', 'A'])
    .end()
  .end()
  .build();
```

### RVRotateCanvas (90° Rotation)

```typescript
const rotate = new GTOBuilder()
  .object('sourceGroup000000_RVRotateCanvas', 'RVRotateCanvas', 1)
    .component('node')
      .int('active', 1)
      .int('rotate', 90)                 // 0, 90, 180, or 270 degrees
    .end()
  .end()
  .build();
```

### RVSoundTrack (Audio Control)

```typescript
const soundtrack = new GTOBuilder()
  .object('viewGroup_RVSoundTrack', 'RVSoundTrack', 1)
    .component('audio')
      .float('volume', 1.0)
      .float('balance', 0.0)             // -1.0 (left) to 1.0 (right)
      .float('offset', 0.0)              // Audio offset in seconds
      .float('internalOffset', 0.0)
      .int('mute', 0)
      .int('softClamp', 0)
    .end()
    .component('visual')
      .int('width', 0)                   // Waveform display width
      .int('height', 0)                  // Waveform display height
      .int('frameStart', 0)
      .int('frameEnd', 0)
    .end()
  .end()
  .build();
```

### RVAudioAdd (Additional Audio)

```typescript
const audioAdd = new GTOBuilder()
  .object('sequenceGroup_RVAudioAdd', 'RVAudioAdd', 1)
    .component('audio')
      .float('offset', 0.0)              // Audio offset in seconds
    .end()
  .end()
  .build();
```

### RVHistogram (Analysis)

```typescript
const histogram = new GTOBuilder()
  .object('sourceGroup000000_RVHistogram', 'RVHistogram', 1)
    .component('node')
      .int('active', 1)
      .int('height', 100)                // Histogram display height
    .end()
  .end()
  .build();
```

---

## Conversion Nodes

### RVYCToRGB (YCbCr to RGB)

```typescript
const ycToRgb = new GTOBuilder()
  .object('sourceGroup000000_RVYCToRGB', 'RVYCToRGB', 1)
    .component('node')
      .int('active', 1)
      .string('conversionName', 'File')  // File, Rec601, Rec709, etc.
    .end()
  .end()
  .build();
```

### RVPrimaryConvert (Chromaticity Conversion)

```typescript
const primaryConvert = new GTOBuilder()
  .object('sourceGroup000000_RVPrimaryConvert', 'RVPrimaryConvert', 1)
    .component('node')
      .int('active', 1)
    .end()
    // Input chromaticities (e.g., ACES AP0)
    .component('inChromaticities')
      .float2('red', [[0.7347, 0.2653]])
      .float2('green', [[0.0, 1.0]])
      .float2('blue', [[0.0001, -0.077]])
      .float2('white', [[0.32168, 0.33767]])
    .end()
    // Output chromaticities (e.g., sRGB/Rec709)
    .component('outChromaticities')
      .float2('red', [[0.64, 0.33]])
      .float2('green', [[0.3, 0.6]])
      .float2('blue', [[0.15, 0.06]])
      .float2('white', [[0.3127, 0.329]])
    .end()
    .component('illuminantAdaptation')
      .float2('inIlluminantWhite', [[0.32168, 0.33767]])
      .float2('outIlluminantWhite', [[0.3127, 0.329]])
      .int('useBradfordTransform', 1)
    .end()
  .end()
  .build();
```

### RVICC (ICC Profile Transform)

```typescript
const iccTransform = new GTOBuilder()
  .object('sourceGroup000000_RVICC', 'RVICCTransform', 1)
    .component('node')
      .int('active', 1)
      .int('samples2D', 256)             // 2D LUT resolution
      .int('samples3D', 32)              // 3D LUT resolution
    .end()
    .component('inProfile')
      .string('url', '/path/to/input.icc')
      .string('description', 'Input Profile')
      .float('version', 4.0)
    .end()
    .component('outProfile')
      .string('url', '/path/to/output.icc')
      .string('description', 'Output Profile')
      .float('version', 4.0)
    .end()
  .end()
  .build();
```

---

## Output Nodes

### RVOutputGroup (Render Output)

```typescript
const outputGroup = new GTOBuilder()
  .object('outputGroup', 'RVOutputGroup', 1)
    .component('output')
      .int('active', 1)
      .int('width', 1920)                // 0 = auto
      .int('height', 1080)               // 0 = auto
      .string('dataType', 'uint8')       // uint8, uint16, float
      .float('pixelAspect', 1.0)
    .end()
  .end()
  .build();
```

### RVFileOutputGroup (File Export)

```typescript
const fileOutput = new GTOBuilder()
  .object('fileOutputGroup', 'RVFileOutputGroup', 1)
    .component('output')
      .string('filename', '/renders/output.mov')
      .float('fps', 24.0)
      .string('channels', 'RGBA')
      .string('timeRange', '1-100')      // Frame range to render
    .end()
  .end()
  .build();
```

### RVTextureOutputGroup (Texture Export)

```typescript
const textureOutput = new GTOBuilder()
  .object('textureOutputGroup', 'RVTextureOutputGroup', 1)
    .component('output')
      .int('active', 1)
      .int('ndcCoordinates', 1)
      .int('width', 1024)
      .int('height', 1024)
      .string('dataType', 'uint8')
      .float('pixelAspect', 1.0)
      .string('tag', 'preview')
      .int('frame', 1)
      .int('flip', 0)
      .int('flop', 0)
    .end()
  .end()
  .build();
```

### RVPipelineGroup (Custom Pipeline)

```typescript
const pipelineGroup = new GTOBuilder()
  .object('customPipeline', 'RVPipelineGroup', 1)
    .component('pipeline')
      // Define ordered list of node types in pipeline
      .string('nodes', [
        'RVColor',
        'RVLookLUT',
        'RVTransform2D'
      ])
    .end()
  .end()
  .build();
```

---

## Connection System

### Building Complete Graph

```typescript
import { GTOBuilder, SimpleWriter } from 'gto-js';

// Build a complete session with connections
const session = new GTOBuilder()
  // Session
  .object('mySession', 'RVSession', 1)
    .component('session')
      .string('viewNode', 'defaultSequence')
      .float('fps', 24.0)
      .int('realtime', 0)
    .end()
  .end()

  // Source Group 1
  .object('sourceGroup000000', 'RVSourceGroup', 1)
    .component('ui')
      .string('name', 'Shot A')
    .end()
  .end()
  .object('sourceGroup000000_source', 'RVFileSource', 1)
    .component('media')
      .string('movie', '/shots/shot_a.mov')
    .end()
    .component('group')
      .float('fps', 24.0)
    .end()
  .end()

  // Source Group 2
  .object('sourceGroup000001', 'RVSourceGroup', 1)
    .component('ui')
      .string('name', 'Shot B')
    .end()
  .end()
  .object('sourceGroup000001_source', 'RVFileSource', 1)
    .component('media')
      .string('movie', '/shots/shot_b.mov')
    .end()
    .component('group')
      .float('fps', 24.0)
    .end()
  .end()

  // Sequence Group
  .object('defaultSequence', 'RVSequenceGroup', 1)
    .component('ui')
      .string('name', 'Edit')
    .end()
  .end()

  // Display Group (required name: displayGroup)
  .object('displayGroup', 'RVDisplayGroup', 1)
  .end()

  // Connections (required name: connections)
  .object('connections', 'connection', 1)
    .component('evaluation')
      // Graph: sourceGroup000000 -> defaultSequence
      //        sourceGroup000001 -> defaultSequence
      .string('lhs', ['sourceGroup000000', 'sourceGroup000001'])
      .string('rhs', ['defaultSequence', 'defaultSequence'])
    .end()
    .component('top')
      .string('nodes', ['defaultSequence'])
    .end()
  .end()

  .build();

const rv = SimpleWriter.write(session);
```

### Stack Compositing Graph

```typescript
// Two sources composited in a stack
const stackSession = new GTOBuilder()
  .object('mySession', 'RVSession', 1)
    .component('session')
      .string('viewNode', 'defaultStack')
      .float('fps', 24.0)
    .end()
  .end()

  // Background source
  .object('sourceGroup000000', 'RVSourceGroup', 1)
    .component('ui').string('name', 'Background').end()
  .end()
  .object('sourceGroup000000_source', 'RVFileSource', 1)
    .component('media').string('movie', '/bg.mov').end()
  .end()

  // Foreground source
  .object('sourceGroup000001', 'RVSourceGroup', 1)
    .component('ui').string('name', 'Foreground').end()
  .end()
  .object('sourceGroup000001_source', 'RVFileSource', 1)
    .component('media').string('movie', '/fg.mov').end()
  .end()

  // Stack
  .object('defaultStack', 'RVStackGroup', 1)
    .component('ui').string('name', 'Composite').end()
  .end()
  .object('defaultStack_stack', 'RVStack', 1)
    .component('composite')
      .string('type', 'over')
    .end()
  .end()

  .object('displayGroup', 'RVDisplayGroup', 1).end()

  // Connections: both sources -> stack
  .object('connections', 'connection', 1)
    .component('evaluation')
      .string('lhs', ['sourceGroup000000', 'sourceGroup000001'])
      .string('rhs', ['defaultStack', 'defaultStack'])
    .end()
    .component('top')
      .string('nodes', ['defaultStack'])
    .end()
  .end()

  .build();
```

---

## Querying with GTODTO

### Basic Queries

```typescript
import { SimpleReader, GTODTO } from 'gto-js';

const reader = new SimpleReader();
reader.open(content);
const dto = new GTODTO(reader.result);

// Get session object (ObjectDTO)
const session = dto.session();
console.log(`Session: ${session?.name}`);

// Get structured session info
const sessionInfo = dto.sessionInfo();
console.log(`FPS: ${sessionInfo.fps}`);
console.log(`Range: ${sessionInfo.range[0]}-${sessionInfo.range[1]}`);

// Get timeline info
const timeline = dto.timeline();
console.log(`Current frame: ${timeline.currentFrame}`);
console.log(`Marks: ${timeline.marks}`);
```

### Finding Objects

```typescript
// By protocol
const sources = dto.byProtocol('RVFileSource');
console.log(`Found ${sources.length} file sources`);

sources.forEach(source => {
  const movie = source.component('media').prop('movie');
  console.log(`- ${movie}`);
});

// By name
const specific = dto.byName('sourceGroup000000');
const pattern = dto.byName(/^sourceGroup/);

// Get all protocols
const protocols = dto.protocols();
console.log(protocols);  // ['RVSession', 'RVFileSource', 'RVSequenceGroup', ...]

// Group by protocol
const grouped = dto.groupByProtocol();
for (const [proto, objects] of grouped) {
  console.log(`${proto}: ${objects.length} objects`);
}
```

### Accessing Properties

```typescript
// Direct property access using property() -> PropertyDTO
const fps = dto
  .object('mySession')
  .component('session')
  .property('fps')
  .value();                    // Returns unwrapped value or null

// Safe chaining (never throws, returns null for missing paths)
const missing = dto
  .object('nonexistent')
  .component('missing')
  .property('nope')
  .value();                    // Returns null

// With default value
const fpsOrDefault = dto
  .object('mySession')
  .component('session')
  .property('fps')
  .valueOr(24.0);              // Returns 24.0 if null

// Shorthand: prop() returns the value directly (not PropertyDTO)
const fps2 = dto.object('mySession').component('session').prop('fps');
```

### Working with Collections

```typescript
const sources = dto.byProtocol('RVFileSource');

// Array-like operations
const firstSource = sources.first();
const lastSource = sources.last();
const thirdSource = sources.at(2);

// Iteration
for (const source of sources) {
  console.log(source.name);
}

sources.forEach(source => {
  const movie = source.component('media').prop('movie');
  console.log(movie);
});

// Filtering
const matchingSources = sources.filter(s =>
  s.component('media').prop('movie')?.includes('shot_')
);

// Mapping
const moviePaths = sources.map(s =>
  s.component('media').prop('movie')
);

// Finding
const found = sources.find(s => s.name === 'sourceGroup000000_source');
```

### RV-Specific Helpers

```typescript
// Source groups
const sourceGroups = dto.sourceGroups();

// File sources with info
const sourcesInfo = dto.sourcesInfo();
sourcesInfo.forEach(info => {
  console.log(`Name: ${info.name}`);
  console.log(`Movie: ${info.movie}`);
  console.log(`FPS: ${info.fps}`);
  console.log(`Volume: ${info.volume}`);
  console.log(`Cut: ${info.cutIn}-${info.cutOut}`);
});

// Just media paths
const paths = dto.mediaPaths();
console.log(paths);  // ['/path/1.mov', '/path/2.mov']

// Annotations
const annotations = dto.annotations();
annotations.forEach(ann => {
  console.log(`Frame ${ann.frame}: ${ann.type} by ${ann.user}`);
  if (ann.text) console.log(`  Text: ${ann.text}`);
});

// Connections
const edges = dto.connectionEdges();
edges.forEach(([from, to]) => {
  console.log(`${from} -> ${to}`);
});

// Full preview (all info combined)
const preview = dto.preview();
console.log(JSON.stringify(preview, null, 2));
```

---

## Modifying Existing Files

### Read-Modify-Write Pattern

```typescript
import { SimpleReader, SimpleWriter } from 'gto-js';
import { readFileSync, writeFileSync } from 'fs';

// Read
const content = readFileSync('session.rv', 'utf-8');
const reader = new SimpleReader();
reader.open(content);
const data = reader.result;

// Modify session FPS
const session = data.objects.find(o => o.protocol === 'RVSession');
session.components.session.properties.fps.data = [30.0];

// Modify source path
const source = data.objects.find(o => o.protocol === 'RVFileSource');
source.components.media.properties.movie.data = ['/new/path/movie.mov'];

// Write
const output = SimpleWriter.write(data);
writeFileSync('modified.rv', output);
```

### Adding New Components

```typescript
// Add a new component to an existing object
const session = data.objects.find(o => o.protocol === 'RVSession');

session.components.customData = {
  interpretation: '',
  properties: {
    version: {
      type: 'string',
      size: 1,
      width: 1,
      interpretation: '',
      data: ['1.0.0']
    },
    author: {
      type: 'string',
      size: 1,
      width: 1,
      interpretation: '',
      data: ['John Doe']
    }
  }
};
```

### Adding New Properties

```typescript
// Add property to existing component
const session = data.objects.find(o => o.protocol === 'RVSession');

session.components.session.properties.customFlag = {
  type: 'int',
  size: 1,
  width: 1,
  interpretation: '',
  data: [1]
};
```

### Adding New Objects

```typescript
// Add a new source
data.objects.push({
  name: 'sourceGroup000002',
  protocol: 'RVSourceGroup',
  protocolVersion: 1,
  components: {
    ui: {
      interpretation: '',
      properties: {
        name: {
          type: 'string',
          size: 1,
          width: 1,
          interpretation: '',
          data: ['New Source']
        }
      }
    }
  }
});

data.objects.push({
  name: 'sourceGroup000002_source',
  protocol: 'RVFileSource',
  protocolVersion: 1,
  components: {
    media: {
      interpretation: '',
      properties: {
        movie: {
          type: 'string',
          size: 1,
          width: 1,
          interpretation: '',
          data: ['/new/source.mov']
        }
      }
    },
    group: {
      interpretation: '',
      properties: {
        fps: {
          type: 'float',
          size: 1,
          width: 1,
          interpretation: '',
          data: [24.0]
        }
      }
    }
  }
});

// Update connections
const connections = data.objects.find(o => o.name === 'connections');
connections.components.evaluation.properties.lhs.data.push('sourceGroup000002');
connections.components.evaluation.properties.rhs.data.push('defaultSequence');
```

### Removing Objects

```typescript
// Remove by name
data.objects = data.objects.filter(o => o.name !== 'sourceGroup000001');
data.objects = data.objects.filter(o => o.name !== 'sourceGroup000001_source');

// Update connections to remove references
const connections = data.objects.find(o => o.name === 'connections');
const lhs = connections.components.evaluation.properties.lhs.data;
const rhs = connections.components.evaluation.properties.rhs.data;

// Find and remove connection indices
const indicesToRemove = [];
for (let i = 0; i < lhs.length; i++) {
  if (lhs[i] === 'sourceGroup000001') {
    indicesToRemove.push(i);
  }
}

// Remove in reverse order to preserve indices
for (let i = indicesToRemove.length - 1; i >= 0; i--) {
  const idx = indicesToRemove[i];
  lhs.splice(idx, 1);
  rhs.splice(idx, 1);
}
```

### Updating Color Corrections

```typescript
// Find or create color node
let colorNode = data.objects.find(o => o.name === 'sourceGroup000000_RVColor');

if (!colorNode) {
  colorNode = {
    name: 'sourceGroup000000_RVColor',
    protocol: 'RVColor',
    protocolVersion: 1,
    components: {
      color: {
        interpretation: '',
        properties: {}
      }
    }
  };
  data.objects.push(colorNode);
}

// Update properties (float[3] = size 1, width 3)
colorNode.components.color.properties.exposure = {
  type: 'float',
  size: 1,
  width: 3,
  interpretation: '',
  data: [[0.5, 0.5, 0.5]]
};

colorNode.components.color.properties.saturation = {
  type: 'float',
  size: 1,
  width: 1,
  interpretation: '',
  data: [1.2]
};
```

---

## EDL Manipulation

### Building an EDL Programmatically

```typescript
import { GTOBuilder, SimpleWriter } from 'gto-js';
import { writeFileSync } from 'fs';

interface Cut {
  source: string;
  sourceIn: number;
  sourceOut: number;
}

function buildEDL(cuts: Cut[]): ReturnType<GTOBuilder['build']> {
  const builder = new GTOBuilder();

  // Calculate global frame positions
  let globalFrame = 1;
  const framePositions: number[] = [globalFrame];
  const sourceIndices: number[] = [];
  const inPoints: number[] = [];
  const outPoints: number[] = [];

  cuts.forEach((cut, index) => {
    const duration = cut.sourceOut - cut.sourceIn + 1;
    sourceIndices.push(index);
    inPoints.push(cut.sourceIn);
    outPoints.push(cut.sourceOut);
    globalFrame += duration;
    framePositions.push(globalFrame);
  });

  // Remove last frame position (it's the end, not a cut point)
  framePositions.pop();

  // Build session
  builder
    .object('mySession', 'RVSession', 1)
      .component('session')
        .string('viewNode', 'defaultSequence')
        .float('fps', 24.0)
      .end()
    .end();

  // Build sequence with EDL
  builder
    .object('defaultSequence', 'RVSequenceGroup', 1)
      .component('ui')
        .string('name', 'Edit')
      .end()
    .end()
    .object('defaultSequence_sequence', 'RVSequence', 1)
      .component('edl')
        .int('frame', framePositions)
        .int('source', sourceIndices)
        .int('in', inPoints)
        .int('out', outPoints)
      .end()
      .component('output')
        .float('fps', 24.0)
        .int('autoSize', 1)
      .end()
      .component('mode')
        .int('autoEDL', 0)  // Manual EDL
        .int('useCutInfo', 0)
      .end()
    .end();

  // Build source groups
  const connectionLhs: string[] = [];
  const connectionRhs: string[] = [];

  cuts.forEach((cut, index) => {
    const groupName = `sourceGroup${String(index).padStart(6, '0')}`;

    builder
      .object(groupName, 'RVSourceGroup', 1)
        .component('ui')
          .string('name', `Source ${index + 1}`)
        .end()
      .end()
      .object(`${groupName}_source`, 'RVFileSource', 1)
        .component('media')
          .string('movie', cut.source)
        .end()
        .component('group')
          .float('fps', 24.0)
        .end()
      .end();

    connectionLhs.push(groupName);
    connectionRhs.push('defaultSequence');
  });

  // Build connections
  builder
    .object('displayGroup', 'RVDisplayGroup', 1).end()
    .object('connections', 'connection', 1)
      .component('evaluation')
        .string('lhs', connectionLhs)
        .string('rhs', connectionRhs)
      .end()
      .component('top')
        .string('nodes', ['defaultSequence'])
      .end()
    .end();

  return builder.build();
}

// Usage
const cuts: Cut[] = [
  { source: '/shots/shot_001.mov', sourceIn: 1, sourceOut: 48 },
  { source: '/shots/shot_002.mov', sourceIn: 10, sourceOut: 72 },
  { source: '/shots/shot_003.mov', sourceIn: 1, sourceOut: 36 },
];

const session = buildEDL(cuts);
writeFileSync('edit.rv', SimpleWriter.write(session));
```

### Extracting EDL from Session

```typescript
import { SimpleReader, GTODTO } from 'gto-js';

interface EDLEntry {
  globalIn: number;
  globalOut: number;
  sourceIndex: number;
  sourceIn: number;
  sourceOut: number;
  sourcePath?: string;
}

function extractEDL(content: string): EDLEntry[] {
  const reader = new SimpleReader();
  reader.open(content);
  const dto = new GTODTO(reader.result);

  // Find sequence node
  const sequences = dto.byProtocol('RVSequence');
  if (sequences.length === 0) return [];

  const seq = sequences.first();
  const edlComp = seq.component('edl');

  const frames = edlComp.prop('frame') as number[] || [];
  const sources = edlComp.prop('source') as number[] || [];
  const ins = edlComp.prop('in') as number[] || [];
  const outs = edlComp.prop('out') as number[] || [];

  // Get source paths
  const fileSources = dto.byProtocol('RVFileSource').toArray();

  const entries: EDLEntry[] = [];
  for (let i = 0; i < sources.length; i++) {
    const globalIn = frames[i] || 1;
    const globalOut = (frames[i + 1] || globalIn + (outs[i] - ins[i])) - 1;

    entries.push({
      globalIn,
      globalOut,
      sourceIndex: sources[i],
      sourceIn: ins[i],
      sourceOut: outs[i],
      sourcePath: fileSources[sources[i]]?.component('media').prop('movie') as string
    });
  }

  return entries;
}
```

### Modifying EDL Cuts

```typescript
import { SimpleReader, SimpleWriter } from 'gto-js';
import { readFileSync, writeFileSync } from 'fs';

function trimCut(
  content: string,
  cutIndex: number,
  newIn: number,
  newOut: number
): string {
  const reader = new SimpleReader();
  reader.open(content);
  const data = reader.result;

  // Find sequence node
  const seqNode = data.objects.find(o => o.protocol === 'RVSequence');
  if (!seqNode) throw new Error('No sequence found');

  const edl = seqNode.components.edl.properties;

  // Update in/out points
  const ins = edl.in.data as number[];
  const outs = edl.out.data as number[];

  if (cutIndex >= ins.length) {
    throw new Error(`Cut index ${cutIndex} out of range`);
  }

  const oldDuration = outs[cutIndex] - ins[cutIndex];
  const newDuration = newOut - newIn;
  const durationDiff = newDuration - oldDuration;

  ins[cutIndex] = newIn;
  outs[cutIndex] = newOut;

  // Adjust subsequent frame positions
  const frames = edl.frame.data as number[];
  for (let i = cutIndex + 1; i < frames.length; i++) {
    frames[i] += durationDiff;
  }

  return SimpleWriter.write(data);
}
```

---

## Error Handling

### Safe Parsing with Try/Catch

```typescript
import { SimpleReader, GTODTO } from 'gto-js';

interface ParseResult {
  success: boolean;
  data?: ReturnType<GTODTO['preview']>;
  error?: string;
}

function safeParseSession(content: string): ParseResult {
  try {
    const reader = new SimpleReader();
    reader.open(content);

    if (!reader.result || !reader.result.objects) {
      return { success: false, error: 'Invalid GTO structure' };
    }

    const dto = new GTODTO(reader.result);

    // Validate required objects
    const session = dto.session();
    if (!session?.exists()) {
      return { success: false, error: 'Missing RVSession object' };
    }

    const connections = dto.connections();
    if (!connections?.exists()) {
      return { success: false, error: 'Missing connections object' };
    }

    return {
      success: true,
      data: dto.preview()
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parse error'
    };
  }
}

// Usage
const result = safeParseSession(fileContent);
if (result.success) {
  console.log('Session loaded:', result.data);
} else {
  console.error('Failed to load:', result.error);
}
```

### Handling Missing Properties

```typescript
import { GTODTO } from 'gto-js';

function safeGetProperty<T>(
  dto: GTODTO,
  objectName: string,
  componentName: string,
  propertyName: string,
  defaultValue: T
): T {
  const value = dto
    .object(objectName)
    .component(componentName)
    .property(propertyName)
    .valueOr(defaultValue);

  return value as T;
}

// Usage with defaults
const fps = safeGetProperty(dto, 'mySession', 'session', 'fps', 24.0);
const viewNode = safeGetProperty(dto, 'mySession', 'session', 'viewNode', 'defaultSequence');
const marks = safeGetProperty(dto, 'mySession', 'session', 'marks', [] as number[]);
```

### Async Error Handling for Compressed Files

```typescript
import { SimpleReader } from 'gto-js';
import { readFile } from 'fs/promises';

async function loadCompressedSession(filepath: string) {
  try {
    const buffer = await readFile(filepath);
    const reader = new SimpleReader();

    await reader.openAsync(buffer.buffer);

    if (!reader.result) {
      throw new Error('Failed to decompress file');
    }

    return { success: true, data: reader.result };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('incorrect header')) {
        return { success: false, error: 'Not a valid GTO file' };
      }
      if (error.message.includes('unexpected end')) {
        return { success: false, error: 'File is truncated or corrupted' };
      }
    }
    return { success: false, error: 'Unknown error loading file' };
  }
}
```

---

## TypeScript Types

### Core Interfaces

```typescript
// Property structure
interface PropertyData {
  type: string;           // 'int', 'float', 'string', etc.
  size: number;           // Number of elements
  width: number;          // Components per element (3 for Vec3)
  interpretation: string; // Optional interpretation hint
  data: unknown[];        // Actual values
}

// Component structure
interface ComponentData {
  interpretation: string;
  properties: Record<string, PropertyData>;
}

// Object structure
interface ObjectData {
  name: string;
  protocol: string;       // Node type (e.g., 'RVSession', 'RVFileSource')
  protocolVersion: number;
  components: Record<string, ComponentData>;
}

// Complete GTO data
interface GTOData {
  version: number;
  objects: ObjectData[];
}
```

### RV-Specific Types

```typescript
// Session info
interface SessionInfo {
  viewNode: string;
  range: [number, number];
  region: [number, number];
  fps: number;
  realtime: boolean;
  inc: number;
  currentFrame: number;
  marks: number[];
  version: number;
  matte: {
    show: boolean;
    aspect: number;
    opacity: number;
    heightVisible: number;
    centerPoint: [number, number];
  };
}

// Source info
interface SourceInfo {
  name: string;
  movie: string;
  active: boolean;
  repName: string;
  range: [number, number];
  fps: number;
  volume: number;
  audioOffset: number;
  rangeOffset: number;
  cutIn: number;
  cutOut: number;
  proxy: {
    range: [number, number];
    inc: number;
    fps: number;
    size: [number, number];
  };
  stereoViews: string[];
  readAllChannels: boolean;
}

// Timeline info
interface TimelineInfo {
  range: number[];
  region: number[];
  fps: number;
  currentFrame: number;
  marks: unknown[];
}

// Annotation
interface Annotation {
  type: 'pen' | 'text';
  id: string;
  frame: number;
  user: string;
  node: string;
  color: number[];
  points?: number[][];
  text?: string;
  brush?: string;
  startFrame?: number;
  duration?: number;
}
```

### Type-Safe Builder Helpers

```typescript
import { GTOBuilder, SimpleWriter } from 'gto-js';

// Type-safe source creation
interface SourceOptions {
  name: string;
  movie: string;
  fps?: number;
  volume?: number;
  cutIn?: number;
  cutOut?: number;
}

function addSourceGroup(
  builder: GTOBuilder,
  groupIndex: number,
  options: SourceOptions
): GTOBuilder {
  const groupName = `sourceGroup${String(groupIndex).padStart(6, '0')}`;

  return builder
    .object(groupName, 'RVSourceGroup', 1)
      .component('ui')
        .string('name', options.name)
      .end()
    .end()
    .object(`${groupName}_source`, 'RVFileSource', 1)
      .component('media')
        .string('movie', options.movie)
      .end()
      .component('group')
        .float('fps', options.fps ?? 24.0)
        .float('volume', options.volume ?? 1.0)
      .end()
      .component('cut')
        .int('in', options.cutIn ?? -2147483648)
        .int('out', options.cutOut ?? 2147483647)
      .end()
    .end();
}

// Usage
const builder = new GTOBuilder();
addSourceGroup(builder, 0, {
  name: 'Shot 1',
  movie: '/shots/shot_001.mov',
  fps: 24.0
});
```

---

## Batch Processing

### Process Multiple Session Files

```typescript
import { SimpleReader, GTODTO, SimpleWriter } from 'gto-js';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';

interface BatchResult {
  file: string;
  success: boolean;
  sources?: number;
  fps?: number;
  error?: string;
}

function batchAnalyze(directory: string): BatchResult[] {
  const results: BatchResult[] = [];
  const files = readdirSync(directory).filter(f => extname(f) === '.rv');

  for (const file of files) {
    const filepath = join(directory, file);

    try {
      const content = readFileSync(filepath, 'utf-8');
      const reader = new SimpleReader();
      reader.open(content);
      const dto = new GTODTO(reader.result);

      const sessionInfo = dto.sessionInfo();
      const sources = dto.byProtocol('RVFileSource');

      results.push({
        file,
        success: true,
        sources: sources.length,
        fps: sessionInfo.fps
      });
    } catch (error) {
      results.push({
        file,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}

// Print report
const results = batchAnalyze('/sessions');
console.log('Batch Analysis Report:');
results.forEach(r => {
  if (r.success) {
    console.log(`  ${r.file}: ${r.sources} sources, ${r.fps} fps`);
  } else {
    console.log(`  ${r.file}: ERROR - ${r.error}`);
  }
});
```

### Batch Update FPS

```typescript
import { SimpleReader, SimpleWriter } from 'gto-js';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, extname, basename } from 'path';

function batchUpdateFPS(
  inputDir: string,
  outputDir: string,
  newFps: number
): void {
  const files = readdirSync(inputDir).filter(f => extname(f) === '.rv');

  for (const file of files) {
    const inputPath = join(inputDir, file);
    const outputPath = join(outputDir, file);

    try {
      const content = readFileSync(inputPath, 'utf-8');
      const reader = new SimpleReader();
      reader.open(content);
      const data = reader.result;

      // Update session FPS
      const session = data.objects.find(o => o.protocol === 'RVSession');
      if (session?.components.session?.properties.fps) {
        session.components.session.properties.fps.data = [newFps];
      }

      // Update all source FPS
      data.objects
        .filter(o => o.protocol === 'RVFileSource')
        .forEach(source => {
          if (source.components.group?.properties.fps) {
            source.components.group.properties.fps.data = [newFps];
          }
        });

      writeFileSync(outputPath, SimpleWriter.write(data));
      console.log(`Updated: ${file}`);
    } catch (error) {
      console.error(`Failed: ${file} - ${error}`);
    }
  }
}
```

### Extract All Media Paths

```typescript
import { SimpleReader, GTODTO } from 'gto-js';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, extname } from 'path';

interface MediaReport {
  session: string;
  media: string[];
}

function extractAllMediaPaths(directory: string): MediaReport[] {
  const reports: MediaReport[] = [];
  const files = readdirSync(directory).filter(f => extname(f) === '.rv');

  for (const file of files) {
    try {
      const content = readFileSync(join(directory, file), 'utf-8');
      const reader = new SimpleReader();
      reader.open(content);
      const dto = new GTODTO(reader.result);

      reports.push({
        session: file,
        media: dto.mediaPaths()
      });
    } catch {
      reports.push({ session: file, media: [] });
    }
  }

  return reports;
}

// Export as JSON
const reports = extractAllMediaPaths('/sessions');
writeFileSync('media_report.json', JSON.stringify(reports, null, 2));
```

---

## Validation Patterns

### Validate Session Structure

```typescript
import { SimpleReader, GTODTO } from 'gto-js';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateSession(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const reader = new SimpleReader();
    reader.open(content);
    const dto = new GTODTO(reader.result);

    // Required: RVSession
    const session = dto.session();
    if (!session?.exists()) {
      errors.push('Missing required RVSession object');
    } else {
      // Check required properties
      const viewNode = session.component('session').prop('viewNode');
      if (!viewNode) {
        errors.push('RVSession missing viewNode property');
      }

      const fps = session.component('session').prop('fps');
      if (fps === null || fps === undefined) {
        warnings.push('RVSession missing fps (will use default)');
      } else if (fps <= 0 || fps > 120) {
        warnings.push(`Unusual fps value: ${fps}`);
      }
    }

    // Required: connections
    const connections = dto.connections();
    if (!connections?.exists()) {
      errors.push('Missing required connections object');
    } else {
      const lhs = connections.component('evaluation').prop('lhs') as string[];
      const rhs = connections.component('evaluation').prop('rhs') as string[];

      if (lhs && rhs && lhs.length !== rhs.length) {
        errors.push('Connection lhs/rhs arrays have different lengths');
      }

      // Verify all referenced nodes exist
      const nodeNames = new Set(dto.objects().map(o => o.name));
      lhs?.forEach(name => {
        if (!nodeNames.has(name)) {
          errors.push(`Connection references non-existent node: ${name}`);
        }
      });
    }

    // Check for orphan sources
    const sourceGroups = dto.sourceGroups();
    const connectedNodes = new Set(
      (connections?.component('evaluation').prop('lhs') as string[]) || []
    );

    sourceGroups.forEach(sg => {
      if (!connectedNodes.has(sg.name)) {
        warnings.push(`Orphan source group: ${sg.name}`);
      }
    });

    // Check for missing media files (path validation only)
    const fileSources = dto.byProtocol('RVFileSource');
    fileSources.forEach(fs => {
      const movie = fs.component('media').prop('movie');
      if (!movie) {
        errors.push(`FileSource ${fs.name} has no movie path`);
      }
    });

  } catch (error) {
    errors.push(`Parse error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// Usage
const result = validateSession(content);
if (!result.valid) {
  console.error('Validation failed:');
  result.errors.forEach(e => console.error(`  ERROR: ${e}`));
}
result.warnings.forEach(w => console.warn(`  WARNING: ${w}`));
```

### Validate Media Paths

```typescript
import { GTODTO } from 'gto-js';
import { existsSync } from 'fs';

interface MediaValidation {
  path: string;
  exists: boolean;
  source: string;
}

function validateMediaPaths(dto: GTODTO): MediaValidation[] {
  const results: MediaValidation[] = [];

  dto.byProtocol('RVFileSource').forEach(source => {
    const movieProp = source.component('media').property('movie');
    const movies = movieProp.data as string[];

    movies?.forEach(path => {
      results.push({
        path,
        exists: existsSync(path),
        source: source.name
      });
    });
  });

  return results;
}

// Usage
const validation = validateMediaPaths(dto);
const missing = validation.filter(v => !v.exists);
if (missing.length > 0) {
  console.warn('Missing media files:');
  missing.forEach(m => console.warn(`  ${m.path} (${m.source})`));
}
```

---

## Advanced Reader

### Custom Callback Reader

```typescript
import { Reader, Request } from 'gto-js';

interface PropertyInfo {
  name: string;
  type: number;
  size: number;
  width: number;
  interpretation: string;
}

// Custom reader that only loads specific objects
class SelectiveReader extends Reader {
  private targetProtocols: Set<string>;
  private currentObject: string = '';
  public collectedData: Map<string, unknown[]> = new Map();

  constructor(protocols: string[]) {
    super();
    this.targetProtocols = new Set(protocols);
  }

  object(
    name: string,
    protocol: string,
    protocolVersion: number,
    info: unknown
  ): number {
    this.currentObject = name;

    // Only read objects matching target protocols
    if (this.targetProtocols.has(protocol)) {
      return Request.Read;
    }
    return Request.Skip;
  }

  component(name: string, info: unknown): number {
    // Read all components of matched objects
    return Request.Read;
  }

  property(
    name: string,
    interpretation: string,
    info: PropertyInfo
  ): number {
    return Request.Read;
  }

  dataRead(info: PropertyInfo, data: number[]): void {
    const key = `${this.currentObject}.${info.name}`;
    this.collectedData.set(key, data);
  }
}

// Usage - only load RVFileSource and RVSession
const reader = new SelectiveReader(['RVFileSource', 'RVSession']);
reader.open(fileContent);

// Access collected data
reader.collectedData.forEach((data, key) => {
  console.log(`${key}: ${data.length} values`);
});
```

### Streaming Large Files

```typescript
import { Reader, Request } from 'gto-js';

interface LargeFileStats {
  objectCount: number;
  totalProperties: number;
  totalDataSize: number;
  protocols: Map<string, number>;
}

// Reader that only collects statistics without storing all data
class StatsReader extends Reader {
  public stats: LargeFileStats = {
    objectCount: 0,
    totalProperties: 0,
    totalDataSize: 0,
    protocols: new Map()
  };

  object(
    name: string,
    protocol: string,
    protocolVersion: number
  ): number {
    this.stats.objectCount++;
    this.stats.protocols.set(
      protocol,
      (this.stats.protocols.get(protocol) || 0) + 1
    );
    return Request.Read;
  }

  component(name: string): number {
    return Request.Read;
  }

  property(name: string, interpretation: string, info: any): number {
    this.stats.totalProperties++;
    this.stats.totalDataSize += info.size * info.width;
    return Request.Skip;  // Don't load actual data
  }
}

// Usage for large file analysis
const statsReader = new StatsReader();
statsReader.open(largeFileContent);

console.log('File Statistics:');
console.log(`  Objects: ${statsReader.stats.objectCount}`);
console.log(`  Properties: ${statsReader.stats.totalProperties}`);
console.log(`  Data elements: ${statsReader.stats.totalDataSize}`);
console.log('  Protocols:');
statsReader.stats.protocols.forEach((count, proto) => {
  console.log(`    ${proto}: ${count}`);
});
```

### Header-Only Reading

```typescript
import { Reader, Request, ReaderMode } from 'gto-js';

interface ObjectHeader {
  name: string;
  protocol: string;
  version: number;
}

class HeaderReader extends Reader {
  public headers: ObjectHeader[] = [];

  constructor() {
    super();
  }

  object(
    name: string,
    protocol: string,
    protocolVersion: number
  ): number {
    this.headers.push({
      name,
      protocol,
      version: protocolVersion
    });
    return Request.Skip;  // Don't read components/properties
  }
}

// Quick scan of file structure
const headerReader = new HeaderReader();
headerReader.open(fileContent);

console.log('Objects in file:');
headerReader.headers.forEach(h => {
  console.log(`  ${h.name} : ${h.protocol} (${h.version})`);
});
```

---

## Complete Examples

### Minimal Session File

```typescript
import { GTOBuilder, SimpleWriter } from 'gto-js';
import { writeFileSync } from 'fs';

const minimalSession = new GTOBuilder()
  .object('mySession', 'RVSession', 1)
    .component('session')
      .string('viewNode', 'defaultSequence')
      .float('fps', 24.0)
      .int('realtime', 0)
    .end()
  .end()
  .object('connections', 'connection', 1)
    .component('evaluation')
      .string('lhs', [])
      .string('rhs', [])
    .end()
    .component('top')
      .string('nodes', ['defaultSequence'])
    .end()
  .end()
  .build();

writeFileSync('minimal.rv', SimpleWriter.write(minimalSession));
```

### Single Source Session

```typescript
import { GTOBuilder, SimpleWriter } from 'gto-js';
import { writeFileSync } from 'fs';

const singleSource = new GTOBuilder()
  // Session
  .object('mySession', 'RVSession', 1)
    .component('session')
      .string('viewNode', 'defaultSequence')
      .float('fps', 24.0)
      .int('realtime', 0)
    .end()
  .end()

  // Sequence
  .object('defaultSequence', 'RVSequenceGroup', 1)
    .component('ui')
      .string('name', 'My Sequence')
    .end()
  .end()

  // Source Group
  .object('sourceGroup000000', 'RVSourceGroup', 1)
    .component('ui')
      .string('name', 'shot_001')
    .end()
  .end()

  // File Source
  .object('sourceGroup000000_source', 'RVFileSource', 1)
    .component('media')
      .string('movie', '/path/to/movie.mov')
    .end()
    .component('group')
      .float('fps', 24.0)
      .float('volume', 1.0)
      .float('audioOffset', 0.0)
    .end()
  .end()

  // Display Group
  .object('displayGroup', 'RVDisplayGroup', 1)
  .end()

  // Connections
  .object('connections', 'connection', 1)
    .component('evaluation')
      .string('lhs', ['sourceGroup000000'])
      .string('rhs', ['defaultSequence'])
    .end()
    .component('top')
      .string('nodes', ['defaultSequence'])
    .end()
  .end()

  .build();

writeFileSync('single_source.rv', SimpleWriter.write(singleSource));
```

### Multi-Source Compare Session

```typescript
import { GTOBuilder, SimpleWriter } from 'gto-js';
import { writeFileSync } from 'fs';

const compareSession = new GTOBuilder()
  .object('mySession', 'RVSession', 1)
    .component('session')
      .string('viewNode', 'defaultLayout')
      .float('fps', 24.0)
    .end()
  .end()

  // Source 1
  .object('sourceGroup000000', 'RVSourceGroup', 1)
    .component('ui').string('name', 'Version A').end()
  .end()
  .object('sourceGroup000000_source', 'RVFileSource', 1)
    .component('media').string('movie', '/versions/v1.mov').end()
    .component('group').float('fps', 24.0).end()
  .end()

  // Source 2
  .object('sourceGroup000001', 'RVSourceGroup', 1)
    .component('ui').string('name', 'Version B').end()
  .end()
  .object('sourceGroup000001_source', 'RVFileSource', 1)
    .component('media').string('movie', '/versions/v2.mov').end()
    .component('group').float('fps', 24.0).end()
  .end()

  // Source 3
  .object('sourceGroup000002', 'RVSourceGroup', 1)
    .component('ui').string('name', 'Version C').end()
  .end()
  .object('sourceGroup000002_source', 'RVFileSource', 1)
    .component('media').string('movie', '/versions/v3.mov').end()
    .component('group').float('fps', 24.0).end()
  .end()

  // Source 4
  .object('sourceGroup000003', 'RVSourceGroup', 1)
    .component('ui').string('name', 'Version D').end()
  .end()
  .object('sourceGroup000003_source', 'RVFileSource', 1)
    .component('media').string('movie', '/versions/v4.mov').end()
    .component('group').float('fps', 24.0).end()
  .end()

  // Layout (2x2 grid)
  .object('defaultLayout', 'RVLayoutGroup', 1)
    .component('ui').string('name', 'Compare View').end()
    .component('layout')
      .string('mode', 'grid')
      .int('gridRows', 2)
      .int('gridColumns', 2)
      .float('spacing', 1.0)
    .end()
  .end()

  .object('displayGroup', 'RVDisplayGroup', 1).end()

  .object('connections', 'connection', 1)
    .component('evaluation')
      .string('lhs', [
        'sourceGroup000000', 'sourceGroup000001',
        'sourceGroup000002', 'sourceGroup000003'
      ])
      .string('rhs', [
        'defaultLayout', 'defaultLayout',
        'defaultLayout', 'defaultLayout'
      ])
    .end()
    .component('top')
      .string('nodes', ['defaultLayout'])
    .end()
  .end()

  .build();

writeFileSync('compare.rv', SimpleWriter.write(compareSession));
```

### Session with Color Correction

```typescript
import { GTOBuilder, SimpleWriter } from 'gto-js';
import { writeFileSync } from 'fs';

const gradedSession = new GTOBuilder()
  .object('mySession', 'RVSession', 1)
    .component('session')
      .string('viewNode', 'defaultSequence')
      .float('fps', 24.0)
    .end()
  .end()

  .object('defaultSequence', 'RVSequenceGroup', 1)
    .component('ui').string('name', 'Graded Sequence').end()
  .end()

  .object('sourceGroup000000', 'RVSourceGroup', 1)
    .component('ui').string('name', 'Graded Shot').end()
  .end()

  .object('sourceGroup000000_source', 'RVFileSource', 1)
    .component('media').string('movie', '/shots/shot.exr').end()
    .component('group').float('fps', 24.0).end()
  .end()

  // Color correction
  .object('sourceGroup000000_RVColor', 'RVColor', 1)
    .component('color')
      .int('active', 1)
      .float3('gamma', [[1.1, 1.05, 1.0]])
      .float3('exposure', [[0.3, 0.3, 0.3]])
      .float('saturation', 1.15)
      .float('hue', 0.0)
    .end()
    .component('CDL')
      .int('active', 1)
      .string('colorspace', 'rec709')
      .float3('slope', [[1.1, 1.0, 0.95]])
      .float3('offset', [[0.02, 0.0, -0.01]])
      .float3('power', [[1.0, 1.0, 1.0]])
      .float('saturation', 1.0)
    .end()
  .end()

  // Look LUT
  .object('sourceGroup000000_RVLookLUT', 'RVLookLUT', 1)
    .component('lut')
      .int('active', 1)
      .string('file', '/luts/film_look.cube')
      .string('name', 'Film Look')
      .string('type', '3D')
    .end()
  .end()

  .object('displayGroup', 'RVDisplayGroup', 1).end()

  .object('connections', 'connection', 1)
    .component('evaluation')
      .string('lhs', ['sourceGroup000000'])
      .string('rhs', ['defaultSequence'])
    .end()
    .component('top')
      .string('nodes', ['defaultSequence'])
    .end()
  .end()

  .build();

writeFileSync('graded.rv', SimpleWriter.write(gradedSession));
```

### Session Analysis Script

```typescript
import { SimpleReader, GTODTO } from 'gto-js';
import { readFileSync } from 'fs';

function analyzeSession(filepath: string) {
  const content = readFileSync(filepath, 'utf-8');
  const reader = new SimpleReader();
  reader.open(content);
  const dto = new GTODTO(reader.result);

  console.log('=== Session Analysis ===\n');

  // Session info
  const info = dto.sessionInfo();
  console.log('Session:');
  console.log(`  FPS: ${info.fps}`);
  console.log(`  Range: ${info.range[0]}-${info.range[1]}`);
  console.log(`  Current Frame: ${info.currentFrame}`);
  console.log(`  View Node: ${info.viewNode}`);

  // Sources
  console.log('\nSources:');
  const sources = dto.sourcesInfo();
  sources.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.name}`);
    console.log(`     Path: ${s.movie}`);
    console.log(`     FPS: ${s.fps}, Volume: ${s.volume}`);
    if (s.cutIn !== -2147483648 || s.cutOut !== 2147483647) {
      console.log(`     Cut: ${s.cutIn}-${s.cutOut}`);
    }
  });

  // Node types
  console.log('\nNode Types:');
  const protocols = dto.protocols();
  protocols.forEach(proto => {
    const count = dto.byProtocol(proto).length;
    console.log(`  ${proto}: ${count}`);
  });

  // Connections
  console.log('\nGraph Connections:');
  const edges = dto.connectionEdges();
  edges.forEach(([from, to]) => {
    console.log(`  ${from} -> ${to}`);
  });

  // Annotations
  const annotations = dto.annotations();
  if (annotations.length > 0) {
    console.log('\nAnnotations:');
    annotations.forEach(ann => {
      console.log(`  Frame ${ann.frame}: ${ann.type}`);
      if (ann.text) console.log(`    "${ann.text}"`);
    });
  }
}

analyzeSession('session.rv');
```

---

## Data Types Reference

| GTO Type | Builder Method | Width | Example |
|----------|---------------|-------|---------|
| `int` | `.int(name, value)` | 1 | `.int('count', 42)` |
| `int[2]` | `.int2(name, values)` | 2 | `.int2('range', [[1, 100]])` |
| `int[3]` | `.int3(name, values)` | 3 | `.int3('dimensions', [[1920, 1080, 1]])` |
| `float` | `.float(name, value)` | 1 | `.float('fps', 24.0)` |
| `float[2]` | `.float2(name, values)` | 2 | `.float2('position', [[0.5, 0.5]])` |
| `float[3]` | `.float3(name, values)` | 3 | `.float3('color', [[1, 0, 0]])` |
| `float[4]` | `.float4(name, values)` | 4 | `.float4('rgba', [[1, 0, 0, 1]])` |
| `float[4,4]` | `.matrix4(name, values)` | 16 | `.matrix4('transform', [identity])` |
| `double` | `.double(name, value)` | 1 | `.double('precision', 3.14159265359)` |
| `string` | `.string(name, value)` | 1 | `.string('name', 'test')` |
| `byte` | `.byte(name, value)` | 1 | `.byte('flags', 255)` |
| `short` | `.short(name, value)` | 1 | `.short('id', 1000)` |
| `bool` | `.bool(name, value)` | 1 | `.bool('active', true)` |

---

## References

- [gto-js GitHub Repository](https://github.com/lifeart/gto-js)
- [OpenRV GTO Specification](./spec.md)
- [OpenRV Documentation](https://aswf-openrv.readthedocs.io/)
- [OpenRV GitHub Repository](https://github.com/AcademySoftwareFoundation/OpenRV)
