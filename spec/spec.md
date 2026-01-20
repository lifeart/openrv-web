# OpenRV GTO (.rv) File Format Specification

> Comprehensive specification for implementing 100% compatibility with OpenRV's Graph Topology Object file format.

## Table of Contents

1. [Overview](#overview)
2. [GTO File Format Basics](#gto-file-format-basics)
3. [File Structure](#file-structure)
4. [Data Types](#data-types)
5. [Core Session Objects](#core-session-objects)
6. [Node Types Reference](#node-types-reference)
   - [Source Nodes](#source-nodes)
   - [Group Nodes](#group-nodes)
   - [Processing Nodes](#processing-nodes)
   - [Filter Nodes](#filter-nodes)
   - [Additional Color Processing Nodes](#additional-color-processing-nodes)
   - [Conversion Nodes](#conversion-nodes)
   - [Utility Nodes](#utility-nodes)
   - [View and Display Nodes](#view-and-display-nodes)
   - [Color Management Nodes](#color-management-nodes)
7. [Node Definition Properties](#node-definition-properties)
8. [Connection System](#connection-system)
9. [Naming Conventions](#naming-conventions)
10. [Implementation Notes](#implementation-notes)
11. [Example Files](#example-files)
12. [Source Code References](#source-code-references)

---

## Overview

OpenRV uses the GTO (Graph Topology Object) file format with `.rv` extension to store session state. GTO is a flexible, open-source format for storing arbitrary data in computer graphics applications.

**Key Characteristics:**
- Human-readable text format (preferred for session files)
- Binary format available for large datasets
- Hierarchical structure: Objects → Components → Properties
- Version: GTO Version 3 (indicated by `GTOa (3)` header)

---

## GTO File Format Basics

### Text Format Header

Every text GTO file must begin with:
```
GTOa (3)
```

This indicates:
- `GTOa` - Text format (ASCII)
- `(3)` - GTO version 3

### Hierarchical Structure

```
Object
├── Component
│   ├── Property (name, type, value)
│   ├── Property
│   └── ...
├── Component
│   └── ...
└── ...
```

### Basic Syntax

```gto
ObjectType : ObjectName (ProtocolVersion)
{
    ComponentName
    {
        PropertyType PropertyName = Value
    }
}
```

---

## Data Types

### Primitive Types

| Type | Description | Size |
|------|-------------|------|
| `int` | 32-bit signed integer | 4 bytes |
| `int64` | 64-bit signed integer | 8 bytes |
| `float` | 32-bit floating point | 4 bytes |
| `double` | 64-bit floating point | 8 bytes |
| `half` | 16-bit floating point | 2 bytes |
| `short` | 16-bit unsigned integer | 2 bytes |
| `byte` | 8-bit unsigned integer | 1 byte |
| `string` | Text (stored as string table indices) | variable |

### Array Types

Properties can store arrays with up to 4 dimensions:
```
float[4]          // 4-element float array (Vec4)
float[4][3]       // 3 Vec4 values
float[4,4]        // 4x4 matrix (Mat44)
int[2]            // 2-element int array (Vec2i)
```

### Common Compound Types

| Type Notation | RV Type | Description |
|---------------|---------|-------------|
| `float[2]` | Vec2f | 2D vector |
| `float[3]` | Vec3f | 3D vector / RGB color |
| `float[4]` | Vec4f | 4D vector / RGBA color |
| `int[2]` | Vec2i | 2D integer vector |
| `int[3]` | Vec3i | 3D integer vector |
| `float[4,4]` | Mat44f | 4x4 transformation matrix |

---

## File Structure

### Minimal Valid .rv File

```gto
GTOa (3)

RVSession : mySession (1)
{
    session
    {
        string viewNode = "defaultSequence"
        float fps = 24.0
        int realtime = 0
    }
}

connection : connections (1)
{
    evaluation
    {
        string lhs = [ ]
        string rhs = [ ]
    }
    top
    {
        string nodes = [ "defaultSequence" ]
    }
}
```

### Complete Session Structure

A typical session file contains:
1. **RVSession** - Session metadata (required, one per file)
2. **RVSourceGroup(s)** - Media source containers
3. **RVFileSource(s)** - Actual file references
4. **Processing Nodes** - Color, transform, etc.
5. **Group Nodes** - Sequence, Stack, Layout, etc.
6. **RVDisplayGroup** - Display output configuration
7. **connection** - Graph topology (required)

---

## Core Session Objects

### RVSession

The root session object. Required in every .rv file.

**Protocol:** `RVSession (1)`

**Component: `session`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `viewNode` | string | - | Name of the node currently displayed |
| `marks` | int[] | [] | Array of marked frame numbers |
| `range` | int[2] | - | Session frame range [start, end] |
| `region` | int[2] | - | In/out region points [in, out] |
| `fps` | float | 24.0 | Playback frames per second |
| `realtime` | int | 0 | 1 = realtime playback mode |
| `inc` | int | 1 | Playback frame increment |
| `currentFrame` | int | 1 | Starting/current frame |
| `frame` | int | 1 | Current frame (alias) |
| `version` | int | - | Session file version |
| `clipboard` | int | - | Clipboard state |

**Component: `root`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | string | "" | Session name |
| `comment` | string | "" | Session comment/notes |

**Component: `internal`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `creationContext` | int | - | Context in which session was created |

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `origin` | string | - | Origin of the session |

**Component: `membership`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `contains` | string[] | - | Contained node names |

**Component: `matte`** (Session-level matte settings)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `show` | int | 0 | Show matte overlay |
| `aspect` | float | 1.33 | Matte aspect ratio |
| `opacity` | float | 0.66 | Matte opacity |
| `heightVisible` | float | -1.0 | Visible height fraction |
| `centerPoint` | float[2] | [0,0] | Matte center point |

**Component: `paintEffects`** (Session-level paint settings)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `hold` | int | 0 | Hold last frame paint |
| `ghost` | int | 0 | Enable paint ghosting |
| `ghostBefore` | int | 5 | Ghost frames before current |
| `ghostAfter` | int | 5 | Ghost frames after current |

**Source:** `src/lib/ip/IPCore/Session.cpp`, `src/lib/ip/IPCore/SessionIPNode.cpp`

---

### connection Object

Stores graph topology. Required in every .rv file.

**Protocol:** `connection (1)`

**Component: `evaluation`**

| Property | Type | Description |
|----------|------|-------------|
| `lhs` | string[] | Source nodes (connection origins) |
| `rhs` | string[] | Target nodes (connection destinations) |
| `connections` | string[2][] | Paired connections array |
| `root` | string | Single root node |
| `roots` | string[] | Multiple root input nodes |

Connections form directed edges: `lhs[i] → rhs[i]`

**Component: `top`**

| Property | Type | Description |
|----------|------|-------------|
| `nodes` | string[] | All top-level viewable node names |

**Internal Component: `__graph`** (Internal graph metadata)

| Property | Type | Description |
|----------|------|-------------|
| `inputs` | string[] | Input node names |
| `outputs` | string[] | Output node names |
| `outputIndex` | int | Current output index |
| `externalOutputs` | string[2][] | External output mappings |
| `externalIndex` | int | External output index |

**Source:** `src/lib/ip/IPCore/Session.cpp`, `src/lib/ip/IPCore/IPNode.cpp`

---

## Node Types Reference

### Source Nodes

#### RVFileSource

Represents media file(s) on disk.

**Protocol:** `RVFileSource (1)`

**Component: `media`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `movie` | string / string[] | - | File path(s). Multiple = stereo layers |
| `name` | string | - | Display name / view names |

**Component: `group`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `fps` | float | 0.0 | Source FPS (0 = derive from media) |
| `volume` | float | 1.0 | Audio volume level |
| `audioOffset` | float | 0.0 | Audio slip in seconds |
| `balance` | float | 0.0 | Stereo balance |
| `crossover` | float | 0.0 | Audio crossover frequency |
| `noMovieAudio` | int | 0 | 1 = ignore embedded audio |
| `rangeOffset` | int | 0 | Frame range offset |
| `rangeStart` | int | - | Explicit start frame override |

**Component: `cut`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `in` | int | MIN_INT | Cut start frame (MIN_INT = start of media) |
| `out` | int | MAX_INT | Cut end frame (MAX_INT = end of media) |

**Component: `request`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `readAllChannels` | int | 0 | 1 = read all EXR channels |

**Component: `proxy`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `range` | int[2] | - | Proxy frame range |
| `inc` | int | 1 | Proxy frame increment |
| `fps` | float | - | Proxy FPS |
| `size` | int[2] | - | Proxy dimensions |

**Source:** `src/lib/ip/IPBaseNodes/FileSourceIPNode.cpp`

---

#### RVImageSource

For images sent from external processes or programmatically created.

**Protocol:** `RVImageSource (1)`

**Component: `media`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | string | - | Display name |
| `movie` | string | - | Source identifier |
| `location` | string | "image" | Source location type |

**Component: `image`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `width` | int | 640 | Image width |
| `height` | int | 480 | Image height |
| `uncropWidth` | int | 640 | Uncropped width |
| `uncropHeight` | int | 480 | Uncropped height |
| `uncropX` | int | 0 | Uncrop X offset |
| `uncropY` | int | 0 | Uncrop Y offset |
| `pixelAspect` | float | 1.0 | Pixel aspect ratio |
| `fps` | float | 0.0 | Frames per second |
| `start` | int | 1 | Start frame |
| `end` | int | 1 | End frame |
| `inc` | int | 1 | Frame increment |
| `encoding` | string | "None" | Encoding type |
| `channels` | string | "RGBA" | Channel layout |
| `bitsPerChannel` | int | 0 | Bits per channel |
| `float` | int | 0 | Is floating point |

**Component: `cut`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `in` | int | MIN_INT | Cut in point |
| `out` | int | MAX_INT | Cut out point |

**Source:** `src/lib/ip/IPBaseNodes/ImageSourceIPNode.cpp`

---

### Group Nodes

#### RVSourceGroup

Container for a complete source pipeline.

**Protocol:** `RVSourceGroup (1)`

**Component: `ui`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | string | - | User-visible name |

**Component: `markers`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `in` | int | - | Marker in point |
| `out` | int | - | Marker out point |
| `color` | float[4] | - | Marker color RGBA |
| `name` | string | - | Marker identifier |

**Internal Pipeline Nodes:**
- CacheLUT → Format → ChannelMap → Cache
- → Linearize Pipeline → RotateCanvas → Overlay → Paint
- → Color Pipeline → Look Pipeline → SourceStereo
- → Transform2D → Crop

**Source:** `src/lib/ip/IPBaseNodes/SourceGroupIPNode.cpp`

---

#### RVSequenceGroup

EDL-based sequential playback.

**Protocol:** `RVSequenceGroup (1)`

**Contains:** RVSequence node + child pipelines

---

#### RVSequence

Edit Decision List implementation.

**Protocol:** `RVSequence (1)`

**Component: `edl`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `frame` | int[] | [] | Global frame numbers for cut boundaries |
| `source` | int[] | [] | Source input indices |
| `in` | int[] | [] | Source in-points |
| `out` | int[] | [] | Source out-points |

**Component: `output`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `size` | int[2] | [720,480] | Output dimensions |
| `fps` | float | 0.0 | Output FPS (0 = derive) |
| `autoSize` | int | 1 | Auto-calculate size |
| `interactiveSize` | int | 1 | Enable interactive resize |

**Component: `mode`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `autoEDL` | int | 1 | Auto-generate EDL |
| `useCutInfo` | int | 1 | Use source cut points |
| `supportReversedOrderBlending` | int | 1 | Allow reverse blending |

**Component: `composite`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `inputBlendModes` | string[] | - | Per-input blend mode |
| `inputOpacities` | float[] | - | Per-input opacity |
| `inputAngularMaskPivotX` | float[] | - | Mask pivot X per input |
| `inputAngularMaskPivotY` | float[] | - | Mask pivot Y per input |
| `inputAngularMaskAngleInRadians` | float[] | - | Mask rotation per input |
| `inputAngularMaskActive` | int[] | - | Mask enable per input |
| `swapAngularMaskInput` | int[] | - | Reverse mask direction |

**Source:** `src/lib/ip/IPBaseNodes/SequenceIPNode.cpp`

---

#### RVStackGroup

Layered compositing with blend modes.

**Protocol:** `RVStackGroup (1)`

**Contains:** RVStack node + child pipelines

---

#### RVStack

Multi-layer compositing.

**Protocol:** `RVStack (1)`

**Component: `output`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `fps` | float | 0.0 | Output FPS |
| `size` | int[2] | [720,480] | Output dimensions |
| `autoSize` | int | 1 | Auto-calculate size |
| `chosenAudioInput` | string | ".all." | Audio source selection |
| `interactiveSize` | int | 0 | Interactive resize mode |
| `outOfRangePolicy` | string | "hold" | Out-of-range frame policy |

**Component: `mode`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `useCutInfo` | int | 1 | Use source cut points |
| `alignStartFrames` | int | 0 | Align input start frames |
| `strictFrameRanges` | int | 0 | Enforce strict ranges |
| `supportReversedOrderBlending` | int | 1 | Allow reverse blending |

**Component: `composite`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `type` | string | "over" | Blend mode |

**Blend Modes:** `over`, `topmost`, `difference`, `replace`

**Out-of-Range Policies:** `hold` (repeat last frame), `black`, `checkerboard`

**Audio Selection Values:** `.all.`, `.topmost.`, `.first.`, or named node

**Source:** `src/lib/ip/IPBaseNodes/StackIPNode.cpp`

---

#### RVLayoutGroup

Visual arrangement of multiple inputs.

**Protocol:** `RVLayoutGroup (1)`

**Component: `ui`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | string | - | Display name |

**Component: `layout`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `mode` | string | "packed" | Layout algorithm |
| `spacing` | float | 1.0 | Spacing multiplier |
| `gridRows` | int | 0 | Grid rows (0 = auto) |
| `gridColumns` | int | 0 | Grid columns (0 = auto) |

**Component: `timing`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `retimeInputs` | int | 0 | Auto-retime to match FPS |

**Layout Modes:** `packed`, `packed2`, `row`, `column`, `grid`

**Source:** `src/lib/ip/IPBaseNodes/LayoutGroupIPNode.cpp`

---

#### RVSwitchGroup / RVSwitch

Single input selection from multiple sources.

**Protocol:** `RVSwitchGroup (1)` / `RVSwitch (1)`

**Component: `output`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `fps` | float | 0.0 | Output FPS |
| `size` | int[2] | [720,480] | Output dimensions |
| `input` | string | "" | Selected input node name |
| `autoSize` | int | 1 | Auto-calculate size |

**Component: `mode`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `useCutInfo` | int | 1 | Use source cut points |
| `autoEDL` | int | 1 | Auto-generate EDL |
| `alignStartFrames` | int | 0 | Align start frames |

**Source:** `src/lib/ip/IPBaseNodes/SwitchIPNode.cpp`

---

#### RVFolderGroup

Multi-purpose collection supporting different view modes.

**Protocol:** `RVFolderGroup (1)`

**Component: `ui`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | string | - | Display name |

**Component: `mode`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `viewType` | string | "switch" | View mode type |

**Source:** `src/lib/ip/IPBaseNodes/FolderGroupIPNode.cpp`

---

#### RVRetimeGroup

Time manipulation container.

**Protocol:** `RVRetimeGroup (1)`

**Contains:** RVRetime node

---

#### RVDisplayGroup

Display output configuration.

**Protocol:** `RVDisplayGroup (1)`

**Required Name:** `displayGroup`

**Contains:** Display pipeline with RVDisplayColor, RVDisplayStereo nodes

---

### Processing Nodes

#### RVColor

Color correction node.

**Protocol:** `RVColor (1)`

**Component: `color`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `invert` | int | 0 | Invert colors |
| `gamma` | float[3] | [1,1,1] | Per-channel gamma |
| `lut` | string | "default" | LUT selection |
| `offset` | float[3] | [0,0,0] | RGB offset |
| `scale` | float[3] | [1,1,1] | RGB scale |
| `exposure` | float[3] | [0,0,0] | Per-channel exposure |
| `contrast` | float[3] | [0,0,0] | Contrast adjustment |
| `saturation` | float | 1.0 | Saturation control |
| `normalize` | int | 0 | Normalize color bounds |
| `hue` | float | 0.0 | Hue rotation |
| `active` | int | 1 | Enable/disable node |
| `unpremult` | int | 0 | Unpremultiply alpha |

**Component: `CDL`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 0 | Enable CDL |
| `colorspace` | string | "rec709" | Colorspace ("rec709", "aceslog", "aces") |
| `slope` | float[3] | [1,1,1] | CDL slope |
| `offset` | float[3] | [0,0,0] | CDL offset |
| `power` | float[3] | [1,1,1] | CDL power |
| `saturation` | float | 1.0 | CDL saturation |
| `noClamp` | int | 0 | Disable clamping |

**Component: `luminanceLUT`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `lut` | float[] | [] | LUT data |
| `max` | float | 1.0 | Maximum range |
| `size` | int | 0 | Input LUT size |
| `name` | string | "" | LUT identifier |
| `active` | int | 0 | Enable luminance LUT |

**Output Component: `luminanceLUT:output`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `size` | int | 256 | Output LUT resolution |
| `type` | string | "Luminance" | Output type |
| `lut` | half[] | - | Generated LUT data |

**Output Component: `matrix:output`**

| Property | Type | Description |
|----------|------|-------------|
| `RGBA` | float[4,4] | Accumulated transformation matrix |

**Source:** `src/lib/ip/IPBaseNodes/ColorIPNode.cpp`

---

#### RVLinearize

Log-to-linear conversion.

**Protocol:** `RVLinearize (1)`

**Component: `lut`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `inMatrix` | float[4,4] | identity | Input transformation matrix |
| `outMatrix` | float[4,4] | identity | Output transformation matrix |
| `lut` | float[] | [] | Main LUT data |
| `prelut` | float[] | [] | Pre-LUT data |
| `scale` | float | 1.0 | Scale factor |
| `offset` | float | 0.0 | Offset value |
| `type` | string | "Luminance" | LUT type |
| `name` | string | "" | LUT name |
| `file` | string | "" | LUT file path |
| `size` | int[3] | [0,0,0] | LUT dimensions |
| `active` | int | 0 | Enable LUT |

**Component: `color`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `lut` | string | - | LUT selection |
| `alphaType` | int | 0 | Alpha handling mode |
| `logtype` | int | 0 | Log curve type |
| `YUV` | int | 0 | YUV conversion |
| `invert` | int | 0 | Invert linearization |
| `sRGB2linear` | int | 0 | sRGB to linear |
| `Rec709ToLinear` | int | 0 | Rec709 to linear |
| `fileGamma` | float | 1.0 | File gamma value |
| `active` | int | 1 | Enable color ops |
| `ignoreChromaticities` | int | 0 | Ignore file chromaticities |

**Component: `cineon`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `whiteCodeValue` | int | 685 | Cineon white point |
| `blackCodeValue` | int | 95 | Cineon black point |
| `breakPointValue` | int | 685 | Soft clip break point |

**Component: `CDL`** (same as RVColor CDL component)

**Source:** `src/lib/ip/IPBaseNodes/` (Linearize pipeline)

---

#### RVLookLUT / RVCacheLUT

Lookup table application nodes.

**Protocol:** `RVLookLUT (1)` / `RVCacheLUT (1)`

**Component: `lut`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `lut` | float[] | [] | Primary LUT data |
| `prelut` | float[] | [] | Pre-LUT data |
| `scale` | float | 1.0 | Scale factor |
| `offset` | float | 0.0 | Offset value |
| `conditioningGamma` | float | 1.0 | Conditioning gamma |
| `type` | string | "Luminance" | LUT type |
| `name` | string | "" | LUT name |
| `file` | string | "" | LUT file path |
| `size` | int[3] | [0,0,0] | LUT dimensions |
| `active` | int | 0 | Enable LUT |
| `preLUTSize` | int | 0 | Pre-LUT size |
| `inMatrix` | float[4,4] | identity | Input matrix |
| `outMatrix` | float[4,4] | identity | Output matrix |

**Output Component: `lut:output`**

| Property | Type | Description |
|----------|------|-------------|
| `size` | int | Output LUT resolution (default 256) |
| `type` | string | Output type |
| `lut` | float[] | Compiled LUT |
| `prelut` | float[] | Compiled pre-LUT |

**Output Component: `matrix:output`**

| Property | Type | Description |
|----------|------|-------------|
| `RGBA` | float[4,4] | Output matrix |

**Source:** `src/lib/ip/IPCore/LUTIPNode.cpp`

---

#### RVDisplayColor

Display output color processing.

**Protocol:** `RVDisplayColor (1)`

**Component: `color`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `channelOrder` | string | "RGBA" | Channel reordering |
| `channelFlood` | int | 0 | Channel flood mode |
| `premult` | int | 0 | Premultiplication |
| `gamma` | float | 1.0 | Display gamma |
| `sRGB` | int | 0 | sRGB output conversion |
| `Rec709` | int | 0 | Rec709 output conversion |
| `brightness` | float | 0.0 | Brightness adjustment |
| `outOfRange` | int | 0 | Out-of-range handling |
| `dither` | int | 0 | Dithering mode |
| `ditherLast` | int | 1 | Dither application order |
| `active` | int | 1 | Enable node |
| `matrix` | float[4,4] | identity | Custom matrix |
| `overrideColorspace` | string | "" | Override colorspace |

**Component: `chromaticities`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 0 | Enable chromaticity adjustment |
| `adoptedNeutral` | int | 1 | Adopt neutral point |
| `white` | float[2] | [0.3127,0.329] | White point xy (D65) |
| `red` | float[2] | [0.64,0.33] | Red primary xy (sRGB) |
| `green` | float[2] | [0.3,0.6] | Green primary xy (sRGB) |
| `blue` | float[2] | [0.15,0.06] | Blue primary xy (sRGB) |
| `neutral` | float[2] | [0.3127,0.329] | Neutral point xy (D65) |

**Supported Colorspaces:** sRGB, Rec709, CineonLog, RedLog, RedLogFilm, ArriLogC, ACES, SMPTE2084, HybridLogGamma, Linear

**Source:** `src/lib/ip/IPCore/DisplayIPNode.cpp`

---

#### RVDisplayStereo

Stereo display mode configuration.

**Protocol:** `RVDisplayStereo (1)`

**Component: `stereo`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `type` | string | "off" | Stereo display mode |
| `swap` | int | 0 | Swap left/right eyes |

**Stereo Modes:**

| Value | Description |
|-------|-------------|
| `off` / `mono` | No stereo |
| `left` | Left eye only |
| `right` | Right eye only |
| `pair` | Side-by-side (0.5x horizontal) |
| `mirror` | Mirrored pair |
| `hsqueezed` | Horizontally squeezed |
| `vsqueezed` | Vertically squeezed |
| `anaglyph` | Color anaglyph |
| `lumanaglyph` | Luminance anaglyph |
| `scanline` | Interlaced scanline |
| `checker` | Checkerboard pattern |

**Source:** `src/lib/ip/IPCore/DisplayStereoIPNode.cpp`

---

#### RVSourceStereo

Per-source stereo configuration.

**Protocol:** `RVSourceStereo (1)`

**Component: `stereo`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `swap` | int | 0 | Swap eyes |
| `relativeOffset` | float | 0.0 | Relative eye offset |
| `rightOffset` | float | 0.0 | Right eye offset |

**Component: `rightTransform`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `flip` | int | 0 | Vertical flip (right eye) |
| `flop` | int | 0 | Horizontal flip (right eye) |
| `rotate` | float | 0.0 | Rotation (right eye, degrees) |
| `translate` | float[2] | [0,0] | Translation (right eye) |

**Source:** `src/lib/ip/IPBaseNodes/SourceStereoIPNode.cpp`, `src/lib/ip/IPCore/StereoTransformIPNode.cpp`

---

#### RVTransform2D

2D transformation node.

**Protocol:** `RVTransform2D (1)`

**Component: `transform`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `translate` | float[2] | [0,0] | Translation |
| `scale` | float[2] | [1,1] | Scale |
| `rotate` | float | 0.0 | Rotation (degrees) |
| `flip` | int | 0 | Vertical flip |
| `flop` | int | 0 | Horizontal flip |
| `active` | int | 1 | Enable transformation |

**Component: `visibleBox`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `left` | float | 0.0 | Left boundary (normalized) |
| `right` | float | 1.0 | Right boundary (normalized) |
| `bottom` | float | 0.0 | Bottom boundary (normalized) |
| `top` | float | 1.0 | Top boundary (normalized) |

**Component: `stencil`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `visibleBox` | float[] | - | Visible box stencil data |

**Component: `output`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `fps` | float | 0.0 | Output FPS |

**Source:** `src/lib/ip/IPCore/CoreDefinitions.cpp`, `src/lib/ip/IPBaseNodes/Transform2DIPNode.cpp`

---

#### RVDispTransform2D

Display transformation node (view-level).

**Protocol:** `RVDispTransform2D (1)`

**Component: `transform`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `translate` | float[2] | [0,0] | View translation |
| `scale` | float[2] | [1,1] | View scale |

**Source:** `src/lib/ip/IPCore/DispTransform2DIPNode.cpp`

---

#### RVCrop

Image cropping node.

**Protocol:** `RVCrop (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable cropping |
| `manip` | int | 0 | Manipulation mode (non-persistent) |

**Component: `crop`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `baseWidth` | int | 1280 | Reference width |
| `baseHeight` | int | 720 | Reference height |
| `left` | int | 0 | Left crop (pixels) |
| `right` | int | 0 | Right crop (pixels) |
| `top` | int | 0 | Top crop (pixels) |
| `bottom` | int | 0 | Bottom crop (pixels) |

**Source:** `src/lib/ip/IPBaseNodes/CropIPNode.cpp`

---

#### RVFormat

Format/geometry transformation.

**Protocol:** `RVFormat (1)`

**Component: `format`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `channels` | string[] | [] | Channel mapping |

**Source:** `src/lib/ip/IPBaseNodes/ChannelMapIPNode.cpp`

---

#### RVChannelMap

Channel remapping node.

**Protocol:** `RVChannelMap (1)`

**Component: `format`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `channels` | string[] | [] | Channel name mapping |

**Source:** `src/lib/ip/IPBaseNodes/ChannelMapIPNode.cpp`

---

#### RVRetime

Time remapping/speed changes.

**Protocol:** `RVRetime (1)`

**Component: `visual`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `scale` | float | 1.0 | Visual time scale |
| `offset` | float | 0.0 | Visual time offset |

**Component: `audio`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `scale` | float | 1.0 | Audio time scale |
| `offset` | float | 0.0 | Audio time offset |

**Component: `output`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `fps` | float | 0.0 | Output FPS |

**Component: `warp`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 0 | Enable warp mode |
| `style` | int | 0 | Warp interpolation style |
| `keyFrames` | int[] | [] | Keyframe positions |
| `keyRates` | float[] | [] | Rate at each keyframe |

**Component: `explicit`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 0 | Enable explicit remap |
| `firstOutputFrame` | int | 1 | First output frame |
| `inputFrames` | int[] | [] | Input frame mapping |

**Source:** `src/lib/ip/IPBaseNodes/RetimeIPNode.cpp`

---

#### RVLensWarp

Lens distortion correction.

**Protocol:** `RVLensWarp (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable warp |

**Component: `warp`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `model` | string | "brown" | Distortion model |
| `pixelAspectRatio` | float | 0.0 | Pixel aspect |
| `k1`, `k2`, `k3` | float | 0.0 | Radial distortion |
| `d` | float | 1.0 | Distortion scale |
| `p1`, `p2` | float | 0.0 | Tangential distortion |
| `center` | float[2] | [0.5,0.5] | Distortion center |
| `offset` | float[2] | [0,0] | Center offset |
| `fx`, `fy` | float | 1.0 | Focal length x/y |
| `cropRatioX`, `cropRatioY` | float | 1.0 | Crop ratios |

**3DE4 Anamorphic Properties (degrees 2, 4, 6):**
- `cx02`, `cy02`, `cx22`, `cy22` (degree 2)
- `cx04`, `cy04`, `cx24`, `cy24`, `cx44`, `cy44` (degree 4)
- `cx06`, `cy06`, `cx26`, `cy26`, `cx46`, `cy46`, `cx66`, `cy66` (degree 6)

**Distortion Models:** `brown`, `opencv`, `pfbarrel`, `nuke`, `tde4_ldp_anamorphic_deg_6`, `adobe`, `rv4.0.10`

**Source:** `src/lib/ip/IPBaseNodes/LensWarpIPNode.cpp`

---

#### RVOverlay

Text and shape overlays.

**Protocol:** `RVOverlay (1)`

**Component: `overlay`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `nextRectId` | int | 0 | Next rectangle ID |
| `nextTextId` | int | 0 | Next text ID |
| `show` | int | 1 | Show overlays |

**Component: `matte`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `show` | int | 0 | Show matte |
| `opacity` | float | 1.0 | Matte opacity |
| `aspect` | float | 1.78 | Matte aspect ratio |
| `heightVisible` | float | 1.0 | Visible height fraction |
| `centerPoint` | float[2] | [0.5,0.5] | Matte center |

**Dynamic Component: `rect:*`** (rectangles)

| Property | Type | Description |
|----------|------|-------------|
| `width` | float | Rectangle width |
| `height` | float | Rectangle height |
| `color` | float[4] | RGBA color |
| `position` | float[2] | Position (normalized) |
| `eye` | int | Eye assignment (stereo) |
| `active` | int | Enable this rectangle |

**Dynamic Component: `text:*`** (text elements)

| Property | Type | Description |
|----------|------|-------------|
| `position` | float[2] | Text position |
| `color` | float[4] | RGBA color |
| `size` | float | Font size |
| `scale` | float | Text scale |
| `rotation` | float | Rotation angle |
| `spacing` | float | Character spacing |
| `font` | string | Font name |
| `text` | string | Text content |
| `origin` | string | Anchor point |
| `debug` | int | Debug mode |
| `eye` | int | Eye assignment |
| `active` | int | Enable this text |
| `pixelScale` | float | Pixel scaling |
| `firstFrame` | int | Start frame |

**Dynamic Component: `window:*`** (window overlays)

| Property | Type | Description |
|----------|------|-------------|
| `eye` | int | Eye assignment |
| `windowActive` | int | Enable window |
| `outlineActive` | int | Enable outline |
| `outlineWidth` | float | Outline thickness |
| `outlineColor` | float[4] | Outline RGBA |
| `outlineBrush` | string | Brush style |
| `windowColor` | float[4] | Window fill RGBA |
| `imageAspect` | float | Image aspect ratio |
| `pixelScale` | float | Pixel scaling |
| `firstFrame` | int | Start frame |
| `windowULx`, `windowULy` | float | Upper-left corner |
| `windowURx`, `windowURy` | float | Upper-right corner |
| `windowLLx`, `windowLLy` | float | Lower-left corner |
| `windowLRx`, `windowLRy` | float | Lower-right corner |
| `antialias` | int | Enable antialiasing |

**Source:** `src/lib/ip/IPBaseNodes/OverlayIPNode.cpp`

---

#### RVPaint

Annotation and drawing node.

**Protocol:** `RVPaint (1)`

**Component: `paint`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `nextId` | int | 0 | Next element ID |
| `nextAnnotationId` | int | 0 | Next annotation ID |
| `show` | int | 1 | Show paint |
| `exclude` | string | "" | Excluded frames |
| `include` | string | "" | Included frames |

**Session Component: `paintEffects`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `hold` | int | 0 | Hold last frame |
| `ghost` | int | 0 | Enable ghosting |
| `ghostBefore` | int | 3 | Ghost frames before |
| `ghostAfter` | int | 3 | Ghost frames after |

**Dynamic Component: `pen:*`** (pen strokes)

| Property | Type | Description |
|----------|------|-------------|
| `width` | float | Stroke width |
| `points` | float[2][] | Stroke points |
| `color` | float[4] | RGBA color |
| `brush` | string | Brush type |
| `join` | int | Line join style |
| `cap` | int | Line cap style |
| `debug` | int | Debug mode |
| `mode` | int | Drawing mode |
| `splat` | int | Splat mode |
| `version` | int | Data version |
| `eye` | int | Eye assignment |
| `startFrame` | int | Start frame |
| `duration` | int | Duration in frames |

**Dynamic Component: `text:*`** (text annotations)

| Property | Type | Description |
|----------|------|-------------|
| `size` | float | Font size |
| `scale` | float | Text scale |
| `rotation` | float | Rotation angle |
| `spacing` | float | Character spacing |
| `position` | float[2] | Position |
| `color` | float[4] | RGBA color |
| `font` | string | Font name |
| `text` | string | Text content |
| `origin` | string | Anchor point |
| `debug` | int | Debug mode |
| `eye` | int | Eye assignment |
| `startFrame` | int | Start frame |
| `duration` | int | Duration |

**Dynamic Component: `frame:*`** (frame organization)

| Property | Type | Description |
|----------|------|-------------|
| `order` | string[] | Component references |

**Source:** `src/lib/ip/IPBaseNodes/PaintIPNode.cpp`

---

#### Filter Nodes

**RVFilterGaussian**

**Protocol:** `RVFilterGaussian (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sigma` | float | ~0.03 | Gaussian sigma (r²/3) |
| `radius` | float | 10.0 | Filter radius |

**Source:** `src/lib/ip/IPBaseNodes/FilterGaussianIPNode.cpp`

---

#### RVUnsharpMask

Sharpening via unsharp mask.

**Protocol:** `RVUnsharpMask (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable effect |
| `amount` | float | 1.0 | Sharpening amount |
| `threshold` | float | 5.0 | Edge threshold |
| `unsharpRadius` | float | 5.0 | Blur radius |

**Source:** `src/lib/ip/IPBaseNodes/UnsharpMaskIPNode.cpp`

---

#### RVNoiseReduction

Noise reduction filter.

**Protocol:** `RVNoiseReduction (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable effect |
| `amount` | float | 0.0 | Reduction amount |
| `radius` | float | 0.0 | Filter radius |
| `threshold` | float | 5.0 | Noise threshold |

**Source:** `src/lib/ip/IPBaseNodes/NoiseReductionIPNode.cpp`

---

#### RVClarity

Local contrast enhancement.

**Protocol:** `RVClarity (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable effect |
| `amount` | float | 0.0 | Clarity amount |
| `radius` | float | 20.0 | Effect radius |

**Source:** `src/lib/ip/IPBaseNodes/ClarityIPNode.cpp`

---

### Additional Color Processing Nodes

#### RVColorExposure

Standalone exposure adjustment.

**Protocol:** `RVColorExposure (1)`

**Component: `color`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable effect |
| `exposure` | float | 0.0 | Exposure stops |

**Source:** `src/lib/ip/IPBaseNodes/ColorExposureIPNode.cpp`

---

#### RVColorCurve

Contrast/curve adjustment.

**Protocol:** `RVColorCurve (1)`

**Component: `color`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable effect |
| `contrast` | float | 0.0 | Contrast amount |

**Source:** `src/lib/ip/IPBaseNodes/ColorCurveIPNode.cpp`

---

#### RVColorTemperature

Color temperature adjustment.

**Protocol:** `RVColorTemperature (1)`

**Component: `color`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable effect |
| `inWhitePrimary` | float[2] | [0.3457,0.3585] | Input white point |
| `inTemperature` | float | 6500.0 | Input temperature (K) |
| `outTemperature` | float | 6500.0 | Output temperature (K) |
| `method` | int | 2 | Adaptation method |

**Source:** `src/lib/ip/IPBaseNodes/ColorTemperatureIPNode.cpp`

---

#### RVColorSaturation

Standalone saturation control.

**Protocol:** `RVColorSaturation (1)`

**Component: `color`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable effect |
| `saturation` | float | 1.0 | Saturation multiplier |

**Source:** `src/lib/ip/IPBaseNodes/ColorSaturationIPNode.cpp`

---

#### RVColorVibrance

Selective saturation enhancement.

**Protocol:** `RVColorVibrance (1)`

**Component: `color`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable effect |
| `vibrance` | float | 0.0 | Vibrance amount |

**Source:** `src/lib/ip/IPBaseNodes/ColorVibranceIPNode.cpp`

---

#### RVColorShadow

Shadow adjustment.

**Protocol:** `RVColorShadow (1)`

**Component: `color`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable effect |
| `shadow` | float | 0.0 | Shadow adjustment |

**Source:** `src/lib/ip/IPBaseNodes/ColorShadowIPNode.cpp`

---

#### RVColorHighlight

Highlight adjustment.

**Protocol:** `RVColorHighlight (1)`

**Component: `color`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable effect |
| `highlight` | float | 0.0 | Highlight adjustment |

**Source:** `src/lib/ip/IPBaseNodes/ColorHighlightIPNode.cpp`

---

#### RVColorGrayScale

Grayscale conversion.

**Protocol:** `RVColorGrayScale (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 0 | Enable grayscale |

**Source:** `src/lib/ip/IPBaseNodes/ColorGrayScaleIPNode.cpp`

---

#### RVColorCDL

Standalone CDL (Color Decision List) node.

**Protocol:** `RVColorCDL (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable CDL |
| `file` | string | "" | CDL file path |
| `colorspace` | string | "rec709" | Working colorspace |
| `slope` | float[3] | [1,1,1] | CDL slope |
| `offset` | float[3] | [0,0,0] | CDL offset |
| `power` | float[3] | [1,1,1] | CDL power |
| `saturation` | float | 1.0 | CDL saturation |
| `noClamp` | int | 1 | Disable value clamping |

**Source:** `src/lib/ip/IPBaseNodes/ColorCDLIPNode.cpp`

---

#### RVColorACESLogCDL

ACES Log colorspace CDL.

**Protocol:** `RVColorACESLogCDL (1)`

**Component: `node`** (same as RVColorCDL with `colorspace` default = "aceslog")

**Source:** `src/lib/ip/IPBaseNodes/BaseDefinitions.cpp`

---

#### RVColorLinearToSRGB

Linear to sRGB conversion.

**Protocol:** `RVColorLinearToSRGB (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable conversion |

**Source:** `src/lib/ip/IPBaseNodes/ColorLinearToSRGBIPNode.cpp`

---

#### RVColorSRGBToLinear

sRGB to Linear conversion.

**Protocol:** `RVColorSRGBToLinear (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable conversion |

**Source:** `src/lib/ip/IPBaseNodes/ColorSRGBToLinearIPNode.cpp`

---

### Conversion Nodes

#### RVLinearize (Extended)

Full linearization node with transfer and primaries.

**Protocol:** `RVLinearize (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable linearization |

**Component: `color`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `transfer` | string | "File" | Transfer function source |
| `primaries` | string | "File" | Color primaries source |
| `alphaType` | string | "File" | Alpha interpretation |

**Transfer/Primaries Values:** "File" (from media), "Linear", "sRGB", "Rec709", "Gamma 1.8", "Gamma 2.2", "Gamma 2.4", "CineonLog", "ViperLog", "RedLog", "RedLogFilm", "ACES", "ArriLogC", etc.

**Source:** `src/lib/ip/IPBaseNodes/LinearizeIPNode.cpp`

---

#### RVYCToRGB

YCbCr to RGB conversion.

**Protocol:** `RVYCToRGB (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable conversion |
| `conversionName` | string | "File" | Conversion matrix name |

**Source:** `src/lib/ip/IPBaseNodes/YCToRGBIPNode.cpp`

---

#### RVPrimaryConvert

Chromaticity-based color space conversion.

**Protocol:** `RVPrimaryConvert (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 0 | Enable conversion |

**Component: `inChromaticities`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `red` | float[2] | - | Input red primary xy |
| `green` | float[2] | - | Input green primary xy |
| `blue` | float[2] | - | Input blue primary xy |
| `white` | float[2] | - | Input white point xy |

**Component: `outChromaticities`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `red` | float[2] | - | Output red primary xy |
| `green` | float[2] | - | Output green primary xy |
| `blue` | float[2] | - | Output blue primary xy |
| `white` | float[2] | - | Output white point xy |

**Component: `illuminantAdaptation`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `inIlluminantWhite` | float[2] | - | Input illuminant white |
| `outIlluminantWhite` | float[2] | - | Output illuminant white |
| `useBradfordTransform` | int | 1 | Use Bradford adaptation |

**Source:** `src/lib/ip/IPBaseNodes/PrimaryConvertIPNode.cpp`

---

#### RVRotateCanvas

Canvas rotation (90° increments).

**Protocol:** `RVRotateCanvas (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable rotation |
| `rotate` | int | 0 | Rotation (0, 90, 180, 270) |

**Source:** `src/lib/ip/IPBaseNodes/RotateCanvasIPNode.cpp`

---

### Utility Nodes

#### RVCache

Frame caching node.

**Protocol:** `RVCache (1)`

**Component: `render`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `downSampling` | int | 1 | Downsampling factor |

**Source:** `src/lib/ip/IPCore/CacheIPNode.cpp`

---

#### RVResize

Image resizing node.

**Protocol:** `RVResize (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable resize |
| `upsamplingQuality` | int | 1 | Upsampling quality level |
| `outWidth` | int | 1280 | Output width |
| `outHeight` | int | 720 | Output height |
| `useContext` | int | 0 | Use context dimensions |

**Source:** `src/lib/ip/IPCore/ResizeIPNode.cpp`

---

#### RVHistogram

Histogram analysis node.

**Protocol:** `RVHistogram (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable histogram |
| `height` | int | 100 | Histogram height |

**Source:** `src/lib/ip/IPCore/HistogramIPNode.cpp`

---

#### RVOutputGroup

Output rendering configuration.

**Protocol:** `RVOutputGroup (1)`

**Component: `output`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable output |
| `width` | int | 0 | Output width (0 = auto) |
| `height` | int | 0 | Output height (0 = auto) |
| `dataType` | string | "uint8" | Output data type |
| `pixelAspect` | float | 1.0 | Pixel aspect ratio |

**Source:** `src/lib/ip/IPCore/OutputGroupIPNode.cpp`

---

#### RVTextureOutputGroup

Texture output for external rendering.

**Protocol:** `RVTextureOutputGroup (1)`

**Component: `output`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 0 | Enable texture output |
| `ndcCoordinates` | int | 1 | Use NDC coordinates |
| `width` | int | 0 | Texture width |
| `height` | int | 0 | Texture height |
| `dataType` | string | "uint8" | Output data type |
| `pixelAspect` | float | 1.0 | Pixel aspect ratio |
| `tag` | string | "" | Output tag |
| `frame` | int | 1 | Output frame |
| `flip` | int | 0 | Flip vertically |
| `flop` | int | 0 | Flip horizontally |

**Source:** `src/lib/ip/IPCore/TextureOutputGroupIPNode.cpp`

---

#### RVFileOutputGroup

File output for rendering to disk.

**Protocol:** `RVFileOutputGroup (1)`

**Component: `output`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `filename` | string | "out.mov" | Output filename |
| `fps` | float | 24.0 | Output FPS |
| `channels` | string | "RGBA" | Output channels |
| `timeRange` | string | "" | Time range to render |

**Source:** `src/lib/ip/IPBaseNodes/FileOutputGroupIPNode.cpp`

---

#### RVPipelineGroup

Managed single-input pipeline container.

**Protocol:** `RVPipelineGroup (1)`

**Component: `pipeline`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `nodes` | string[] | - | Ordered list of pipeline node types |

**Source:** `src/lib/ip/IPCore/PipelineGroupIPNode.cpp`

---

#### RVAdaptor

Connection adaptation node.

**Protocol:** `RVAdaptor (1)`

**Component: `input`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `index` | int | - | Input connection index |

**Source:** `src/lib/ip/IPCore/AdaptorIPNode.cpp`

---

#### RVAudioAdd

Additional audio source node.

**Protocol:** `RVAudioAdd (1)`

**Component: `audio`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `offset` | float | 0.0 | Audio offset (seconds) |

**Source:** `src/lib/ip/IPBaseNodes/AudioAddIPNode.cpp`

---

### View and Display Nodes

#### RVViewGroup

View transformation hub.

**Protocol:** `RVViewGroup (1)`

**Contains:** SoundTrack, DispTransform2D, AudioWaveform, ViewPipeline

---

#### RVSoundTrack

Audio track handling.

**Protocol:** `RVSoundTrack (1)`

**Component: `audio`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `volume` | float | 1.0 | Audio volume |
| `balance` | float | 0.0 | Stereo balance |
| `offset` | float | 0.0 | Audio offset (seconds) |
| `internalOffset` | float | 0.0 | Internal offset |
| `mute` | int | 0 | Mute audio |
| `softClamp` | int | 0 | Enable soft clamp |

**Component: `visual`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `width` | int | 0 | Waveform width |
| `height` | int | 0 | Waveform height |
| `frameStart` | int | 0 | Waveform start frame |
| `frameEnd` | int | 0 | Waveform end frame |

**Source:** `src/lib/ip/IPCore/SoundTrackIPNode.cpp`

---

#### RVDisplayGroup (Extended)

Display output configuration with device settings.

**Protocol:** `RVDisplayGroup (1)`

**Required Name:** `displayGroup`

**Component: `device`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | string | "" | Display device name |
| `moduleName` | string | "" | Display module name |
| `systemProfileURL` | string | "" | ICC profile URL |
| `systemProfileType` | string | "" | Profile type |

**Component: `render`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `hashCount` | int | 0 | Render hash count |

**Source:** `src/lib/ip/IPCore/DisplayGroupIPNode.cpp`

---

### Color Management Nodes

#### RVOCIO (OpenColorIO)

OpenColorIO integration node.

**Protocol:** `RVOCIO (1)`

**Component: `ocio`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `function` | string | - | OCIO function type |
| `active` | int | 1 | Enable OCIO |
| `lut` | float[] | - | Computed LUT data |
| `lut3DSize` | int | - | 3D LUT resolution |
| `inColorSpace` | string | "" | Input colorspace |

**Component: `ocio_color`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `outColorSpace` | string | "" | Output colorspace |

**Component: `ocio_look`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `look` | string | "" | Look name |
| `direction` | int | 0 | Look direction |
| `outColorSpace` | string | "" | Output colorspace |

**Component: `ocio_display`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `display` | string | "" | Display name |
| `view` | string | "" | View transform name |

**Component: `color`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `dither` | int | 0 | Enable dithering |
| `channelOrder` | string | "RGBA" | Channel order |
| `channelFlood` | int | 0 | Channel flood mode |

**Component: `inTransform`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `url` | string | "" | Transform file URL |
| `data` | byte[] | - | Transform binary data |

**Component: `outTransform`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `url` | string | "" | Output transform URL |

**Component: `config`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `description` | string | "" | Config description |
| `workingDir` | string | "" | Working directory |

**Source:** `src/lib/ip/OCIONodes/OCIOIPNode.cpp`

---

#### RVICC (ICC Profile)

ICC color profile transforms.

**Protocol:** `RVICCTransform (1)` / `RVICCLinearizeTransform (1)` / `RVICCDisplayTransform (1)`

**Component: `node`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | int | 1 | Enable ICC |
| `samples2D` | int | 256 | 2D LUT samples |
| `samples3D` | int | 32 | 3D LUT samples |

**Component: `inProfile`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `url` | string | "" | Input profile URL |
| `description` | string | "" | Profile description |
| `version` | float | 0.0 | Profile version |
| `data` | byte[] | - | Profile binary data |

**Component: `outProfile`**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `url` | string | "" | Output profile URL |
| `description` | string | "" | Profile description |
| `version` | float | 0.0 | Profile version |
| `data` | byte[] | - | Profile binary data |

**Source:** `src/lib/ip/ICCNodes/ICCIPNode.cpp`

---

## Node Definition Properties

Node definitions use these properties to configure default behaviors.

### Common Definition Properties

| Property | Type | Description |
|----------|------|-------------|
| `node.name` | string | Node type name |
| `node.version` | int | Node version |
| `node.isGroup` | int | Is group node |
| `node.defaultName` | string | Default instance name |
| `node.evaluationType` | string | Evaluation type |
| `node.author` | string | Author name |
| `node.company` | string | Company name |
| `node.comment` | string | Comment |
| `node.date` | string | Creation date |
| `node.userVisible` | int | Show in UI |
| `documentation.summary` | string | Brief description |
| `documentation.html` | string | HTML documentation |
| `icon.RGBA` | byte[] | Node icon data |
| `render.intermediate` | int | Is intermediate render |
| `function.type` | string | Function type |
| `function.name` | string | Function name |

### Defaults Properties by Node Type

**SourceGroup:**
| Property | Default | Description |
|----------|---------|-------------|
| `defaults.preCacheLUTType` | "CacheLUT" | Pre-cache LUT node type |
| `defaults.formatType` | "" | Format node type |
| `defaults.channelMapType` | "ChannelMap" | Channel map type |
| `defaults.cacheType` | "Cache" | Cache node type |
| `defaults.paintType` | "Paint" | Paint node type |
| `defaults.overlayType` | "Overlay" | Overlay node type |
| `defaults.colorPipelineType` | "ColorPipelineGroup" | Color pipeline |
| `defaults.linearizePipelineType` | "LinearizePipelineGroup" | Linearize pipeline |
| `defaults.lookPipelineType` | "LookPipelineGroup" | Look pipeline |
| `defaults.stereoType` | "SourceStereo" | Stereo node type |
| `defaults.rotateType` | "RotateCanvas" | Rotate node type |
| `defaults.transformType` | "Transform2D" | Transform type |
| `defaults.cropType` | "Crop" | Crop node type |
| `defaults.sourceType` | "FileSource" | Source node type |

**DisplayGroup:**
| Property | Default | Description |
|----------|---------|-------------|
| `defaults.stereoType` | "DisplayStereo" | Display stereo type |
| `defaults.pipelineType` | "DisplayPipelineGroup" | Pipeline type |

**SequenceGroup:**
| Property | Default | Description |
|----------|---------|-------------|
| `defaults.sequenceType` | "Sequence" | Sequence node type |
| `defaults.retimeType` | "Retime" | Retime node type |
| `defaults.paintType` | "Paint" | Paint node type |
| `defaults.audioAddType` | "AudioAdd" | Audio add type |
| `defaults.audioSourceType` | "FileSource" | Audio source type |
| `defaults.autoFPSType` | "max" | Auto FPS mode |
| `defaults.simpleSoundtrack` | 1 | Use simple soundtrack |

**StackGroup:**
| Property | Default | Description |
|----------|---------|-------------|
| `defaults.stackType` | "Stack" | Stack node type |
| `defaults.transformType` | "Transform2D" | Transform type |
| `defaults.retimeType` | "Retime" | Retime node type |
| `defaults.paintType` | "Paint" | Paint node type |

**LayoutGroup:**
| Property | Default | Description |
|----------|---------|-------------|
| `defaults.stackType` | "Stack" | Stack node type |
| `defaults.transformType` | "Transform2D" | Transform type |
| `defaults.retimeType` | "Retime" | Retime node type |
| `defaults.paintType` | "Paint" | Paint node type |

**FolderGroup:**
| Property | Default | Description |
|----------|---------|-------------|
| `folder.switch` | "Switch" | Switch node type |
| `folder.stack` | "StackGroup" | Stack group type |
| `folder.layout` | "LayoutGroup" | Layout group type |

**ViewGroup:**
| Property | Default | Description |
|----------|---------|-------------|
| `defaults.soundtrackType` | "SoundTrack" | Soundtrack type |
| `defaults.dispTransformType` | "DispTransform2D" | Display transform |
| `defaults.waveformType` | "AudioWaveform" | Waveform type |
| `defaults.pipelineType` | "ViewPipelineGroup" | Pipeline type |

**ColorPipelineGroup:**
| Property | Default | Description |
|----------|---------|-------------|
| `defaults.pipeline` | [13 color nodes] | Pipeline node list |

Pipeline nodes: ColorACESLogCDL, ColorGrayScale, ColorLinearToSRGB, ColorTemperature, ColorExposure, ColorCurve, ColorShadow, ColorHighlight, Clarity, UnsharpMask, NoiseReduction, ColorSRGBToLinear, ColorVibrance

**LinearizePipelineGroup:**
| Property | Default | Description |
|----------|---------|-------------|
| `defaults.pipeline` | ["YCToRGB", "FileCDL", "Linearize", "LensWarp"] | Linearize nodes |

**LookPipelineGroup:**
| Property | Default | Description |
|----------|---------|-------------|
| `defaults.pipeline` | "LookLUT" | Look pipeline |

**FileSource:**
| Property | Default | Description |
|----------|---------|-------------|
| `defaults.progressiveSourceLoading` | 1 | Progressive loading |
| `defaults.missingMovieProc` | "black" | Missing movie handler |

**Source:** `src/lib/ip/IPCore/CoreDefinitions.cpp`, `src/lib/ip/IPBaseNodes/BaseDefinitions.cpp`

---

## Connection System

### Graph Topology

The connection object defines the directed acyclic graph (DAG):

```gto
connection : connections (1)
{
    evaluation
    {
        string lhs = [ "sourceA" "sourceB" ]
        string rhs = [ "sequence" "sequence" ]
    }
    top
    {
        string nodes = [ "defaultSequence" ]
    }
}
```

This creates: `sourceA → sequence` and `sourceB → sequence`

### Connection Rules

1. Connections are directional: `lhs[i] → rhs[i]`
2. `lhs` and `rhs` arrays must have equal length
3. `top.nodes` lists all root-level viewable nodes
4. Order in arrays doesn't affect evaluation (DAG is order-independent)

### Property Addressing

Properties are addressed using dot notation:

| Pattern | Example | Description |
|---------|---------|-------------|
| `nodeName.component.property` | `sourceGroup000000_RVColor.color.exposure` | Specific node property |
| `groupName_nodeName.component.property` | `sourceGroup000000_source.media.movie` | Member node property |

**Note:** The `#` and `@` prefixes (e.g., `#RVColor.color.exposure`) are part of RV's **Mu scripting API** for runtime property queries, not the GTO file format. These prefixes should not appear in `.rv` session files.

---

## Naming Conventions

### Required Names

| Object Type | Required Name |
|-------------|---------------|
| RVDisplayGroup | `displayGroup` |
| connection | `connections` |

### Auto-generated Names

| Pattern | Example | Description |
|---------|---------|-------------|
| `sourceGroupXXXXXX` | `sourceGroup000000` | Six-digit zero-padded |
| `groupName_nodeName` | `sourceGroup000000_RVColor` | Member node naming |
| `defaultSequence` | - | Default sequence group |
| `defaultStack` | - | Default stack group |
| `defaultLayout` | - | Default layout group |

### UI Names

The `ui.name` property provides user-visible names distinct from internal node names.

---

## Implementation Notes

### File Writing Guidelines

1. **Use text format** for session files (unless RVImageSource present)
2. **Order doesn't matter** - objects can appear in any order
3. **Omit defaults** - RV creates default objects for omitted types
4. **Minimal information** - only include what differs from defaults

### FPS Handling

- Source FPS of 0 means "derive from media"
- RV plays every frame regardless of playback FPS
- Audio compensates to maintain sync

### LUT File Support

Supported formats:
- `.csp` (CineSpace)
- `.cube` (Resolve)
- `.3dl` (Lustre)
- `.spi1d`, `.spi3d` (Sony)
- `.clf` (Common LUT Format)

### File Handle Limits

- No artificial limit on sources
- OS file descriptor limits apply (typically 1024 on Linux)
- QuickTime, AVI, MP4 require open handles
- RV adjusts system limits on startup

### Binary Format

Binary GTO available via C++/Python API for large datasets. Supports gzip compression (~60% size reduction).

---

## Example Files

### Single Source Session

```gto
GTOa (3)

RVSession : mySession (1)
{
    session
    {
        string viewNode = "defaultSequence"
        float fps = 24.0
        int realtime = 0
    }
}

RVSequenceGroup : defaultSequence (1)
{
    ui
    {
        string name = "My Sequence"
    }
}

RVSourceGroup : sourceGroup000000 (1)
{
    ui
    {
        string name = "shot_001"
    }
}

RVFileSource : sourceGroup000000_source (1)
{
    media
    {
        string movie = "/path/to/movie.mov"
    }
    group
    {
        float fps = 24.0
        float volume = 1.0
        float audioOffset = 0.0
    }
}

connection : connections (1)
{
    evaluation
    {
        string lhs = [ "sourceGroup000000" ]
        string rhs = [ "defaultSequence" ]
    }
    top
    {
        string nodes = [ "defaultSequence" ]
    }
}
```

### Color Correction Example

```gto
RVColor : sourceGroup000000_RVColor (1)
{
    color
    {
        int active = 1
        float[3] gamma = [ 1.1 1.1 1.1 ]
        float[3] exposure = [ 0.5 0.5 0.5 ]
        float saturation = 1.2
        float hue = 0.0
    }
    CDL
    {
        int active = 1
        string colorspace = "rec709"
        float[3] slope = [ 1.0 1.0 1.0 ]
        float[3] offset = [ 0.0 0.0 0.0 ]
        float[3] power = [ 1.0 1.0 1.0 ]
        float saturation = 1.0
    }
}
```

---

## Source Code References

| Component | Source File |
|-----------|-------------|
| Session | `src/lib/ip/IPCore/Session.cpp` |
| GTO Parser | `src/lib/files/Gto/Reader.cpp` |
| GTO Writer | `src/lib/files/Gto/Writer.cpp` |
| Node Definitions | `src/lib/ip/IPCore/NodeDefinition.cpp` |
| Core Definitions | `src/lib/ip/IPCore/CoreDefinitions.cpp` |
| Base Definitions | `src/lib/ip/IPBaseNodes/BaseDefinitions.cpp` |
| FileSource | `src/lib/ip/IPBaseNodes/FileSourceIPNode.cpp` |
| Color | `src/lib/ip/IPBaseNodes/ColorIPNode.cpp` |
| Sequence | `src/lib/ip/IPBaseNodes/SequenceIPNode.cpp` |
| Stack | `src/lib/ip/IPBaseNodes/StackIPNode.cpp` |
| Display | `src/lib/ip/IPCore/DisplayIPNode.cpp` |
| LUT | `src/lib/ip/IPCore/LUTIPNode.cpp` |

---

## Version History

- **GTO Version 3**: Single-level component hierarchies
- **GTO Version 4**: Nested components, 4D property arrays

---

## References

- [OpenRV Documentation](https://aswf-openrv.readthedocs.io/)
- [OpenRV GitHub Repository](https://github.com/AcademySoftwareFoundation/OpenRV)
- [GTO File Format Documentation](https://aswf-openrv.readthedocs.io/en/latest/rv-manuals/rv-gto.html)
