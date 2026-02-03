# Stereo Per-Eye Transformations

## Original OpenRV Implementation
OpenRV supports per-eye geometric transformations for stereo alignment correction:

**Per-Eye Flip/Flop**:
- Independent horizontal flip (flop) for each eye
- Independent vertical flip for each eye
- Used to correct camera rig orientation mismatches

**Per-Eye Rotation**:
- Individual rotation angle per eye (in degrees)
- Corrects rotational misalignment between stereo cameras
- Applied around the center of each eye's image

**Per-Eye Scale**:
- Independent scale factor per eye
- Used for convergence correction when cameras have different focal lengths
- Uniform scaling from center of each eye

**Per-Eye Translation**:
- Horizontal (X) and vertical (Y) offset per eye
- Fine-grained alignment beyond the global stereo offset
- Measured in pixels for precision

**Stereo Alignment Tools**:
- Grid overlay for checking vertical alignment
- Center crosshair for rotation and offset verification
- Difference mode showing misalignment between eyes
- Edge detection overlay for checking geometric alignment

These transforms are applied before the stereo composite step, operating on individual eye buffers.

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Dependencies
This feature depends on the existing Stereo 3D Viewing implementation:
- `/features/stereo-3d-viewing.md` (Fully implemented)
- Stereo mode must be active (not "Off") for per-eye controls to appear
- Eye extraction pipeline in `StereoRenderer.ts` provides the left/right buffers

## Requirements
- [ ] Per-eye horizontal flip (flop) for left and right eyes independently
- [ ] Per-eye vertical flip for left and right eyes independently
- [ ] Per-eye rotation (-180 to +180 degrees) for left and right eyes independently
- [ ] Per-eye uniform scale (0.5 to 2.0) for left and right eyes independently
- [ ] Per-eye X translation (-100 to +100 pixels) for left and right eyes independently
- [ ] Per-eye Y translation (-100 to +100 pixels) for left and right eyes independently
- [ ] Grid overlay alignment tool
- [ ] Crosshair overlay alignment tool
- [ ] Difference mode alignment tool
- [ ] Reset per-eye transforms to defaults
- [ ] Link/unlink left and right eye controls
- [ ] State persistence across frames and tabs
- [ ] GTO session save/restore of per-eye transform state
- [ ] Integration with existing stereo render pipeline

## UI/UX Specification

### Location
The StereoEyeTransformControl component is located in the **View tab** context toolbar, immediately to the right of the existing StereoControl. It is only visible when a stereo mode is active (not "Off").

### Control Layout
```
[Stereo v] [Swap] [Offset: ----o---- 0.0] | [Eye Transforms] [Align v]
```

When the "Eye Transforms" panel is open:
```
+-----------------------------------------------+
| Per-Eye Transforms                       [X]  |
|-----------------------------------------------|
| [Link L/R]                      [Reset All]   |
|-----------------------------------------------|
|  LEFT EYE                  |  RIGHT EYE       |
|  [FlipH] [FlipV]          |  [FlipH] [FlipV]  |
|  Rotate: [---o---] 0.0    |  Rotate: [---o---] 0.0   |
|  Scale:  [---o---] 1.0    |  Scale:  [---o---] 1.0   |
|  X:      [---o---] 0      |  X:      [---o---] 0     |
|  Y:      [---o---] 0      |  Y:      [---o---] 0     |
+-----------------------------------------------+
```

### Eye Transforms Toggle Button
- **Label**: "Eye Transforms"
- **Icon**: Transform icon (layers/grid from Icons.ts)
- **Test ID**: `data-testid="stereo-eye-transform-button"`
- **Visibility**: Only shown when stereo mode is active (not "Off")
- **Active state**: Blue highlight (`rgba(var(--accent-primary-rgb), 0.15)`) when any per-eye transform is non-default
- **Keyboard Shortcut**: `Shift+E` to toggle panel visibility

### Eye Transforms Panel
- **Test ID**: `data-testid="stereo-eye-transform-panel"`
- **Position**: Fixed, below the toggle button
- **Z-index**: 9999 (above canvas and other controls)
- **Min-width**: 420px
- **Max-height**: 80vh with overflow scroll
- **Background**: `var(--bg-secondary)`
- **Border**: 1px solid `var(--border-primary)`
- **Border-radius**: 4px
- **Box-shadow**: `0 4px 12px rgba(0, 0, 0, 0.4)`

#### Panel Header
- **Title**: "Per-Eye Transforms"
- **Close Button**: `[X]` icon button
  - **Test ID**: `data-testid="stereo-eye-transform-close"`

#### Link/Unlink Toggle
- **Test ID**: `data-testid="stereo-eye-link-toggle"`
- **Label**: "Link L/R" with chain-link icon
- **Default**: Unlinked
- **Behavior when linked**: Changing any left eye control mirrors the same change to the right eye and vice versa
- **Active state**: Accent highlight when linked

#### Reset All Button
- **Test ID**: `data-testid="stereo-eye-transform-reset"`
- **Label**: "Reset All"
- **Behavior**: Resets all per-eye transforms for both eyes to defaults

#### Left Eye Section
- **Section Header**: "LEFT EYE" with left-eye indicator (colored dot, `#4a9eff`)
- **Container Test ID**: `data-testid="stereo-left-eye-section"`

| Control | Test ID | Type | Range | Default | Step | Format |
|---------|---------|------|-------|---------|------|--------|
| Flip Horizontal | `data-testid="stereo-left-flip-h"` | Toggle button | on/off | off | - | "FlipH" label |
| Flip Vertical | `data-testid="stereo-left-flip-v"` | Toggle button | on/off | off | - | "FlipV" label |
| Rotation | `data-testid="stereo-left-rotation"` | Slider + input | -180 to +180 | 0 | 0.1 | `+X.X` degrees |
| Scale | `data-testid="stereo-left-scale"` | Slider + input | 0.5 to 2.0 | 1.0 | 0.01 | `X.XX` |
| Translate X | `data-testid="stereo-left-translate-x"` | Slider + input | -100 to +100 | 0 | 1 | `+Xpx` |
| Translate Y | `data-testid="stereo-left-translate-y"` | Slider + input | -100 to +100 | 0 | 1 | `+Xpx` |

#### Right Eye Section
- **Section Header**: "RIGHT EYE" with right-eye indicator (colored dot, `#ff6b4a`)
- **Container Test ID**: `data-testid="stereo-right-eye-section"`

| Control | Test ID | Type | Range | Default | Step | Format |
|---------|---------|------|-------|---------|------|--------|
| Flip Horizontal | `data-testid="stereo-right-flip-h"` | Toggle button | on/off | off | - | "FlipH" label |
| Flip Vertical | `data-testid="stereo-right-flip-v"` | Toggle button | on/off | off | - | "FlipV" label |
| Rotation | `data-testid="stereo-right-rotation"` | Slider + input | -180 to +180 | 0 | 0.1 | `+X.X` degrees |
| Scale | `data-testid="stereo-right-scale"` | Slider + input | 0.5 to 2.0 | 1.0 | 0.01 | `X.XX` |
| Translate X | `data-testid="stereo-right-translate-x"` | Slider + input | -100 to +100 | 0 | 1 | `+Xpx` |
| Translate Y | `data-testid="stereo-right-translate-y"` | Slider + input | -100 to +100 | 0 | 1 | `+Xpx` |

#### Double-Click Reset
- Double-clicking any slider resets that individual control to its default value
- Double-clicking a flip button has no effect (use single click to toggle)

### Alignment Tools Dropdown
- **Button Label**: "Align"
- **Button Test ID**: `data-testid="stereo-align-button"`
- **Dropdown Test ID**: `data-testid="stereo-align-dropdown"`
- **Visibility**: Only shown when stereo mode is active
- **Position**: Fixed, below button
- **Z-index**: 9999

**Options** (in order):
1. **Off** - No alignment overlay
   - `data-stereo-align="off"`
2. **Grid** - Displays grid lines over the stereo output
   - `data-stereo-align="grid"`
   - Grid spacing: 64px
   - Grid color: `rgba(255, 255, 255, 0.3)` with 1px lines
3. **Crosshair** - Center crosshair on each eye region
   - `data-stereo-align="crosshair"`
   - Color: `rgba(255, 255, 0, 0.6)` (yellow)
   - Line width: 1px
4. **Difference** - Absolute difference between left and right eye
   - `data-stereo-align="difference"`
   - Shows brightness proportional to pixel-level L/R difference
   - Perfect alignment shows black; misalignment shows white
5. **Edge Overlay** - Canny-like edge detection overlaid on both eyes
   - `data-stereo-align="edges"`
   - Left eye edges in cyan, right eye edges in red
   - Overlapping edges appear white

Each option uses `data-stereo-align` attribute for test selection.

### Keyboard Shortcuts
- **Shift+E**: Toggle eye transform panel visibility
- **Shift+4**: Cycle through alignment tool modes (Off -> Grid -> Crosshair -> Difference -> Edges -> Off)

### Styling (per UI.md)
- Uses CSS variables for all colors
- Flat button design with transparent background by default
- Hover: `var(--bg-hover)` background, `var(--border-primary)` border
- Active: `rgba(var(--accent-primary-rgb), 0.15)` background, `var(--accent-primary)` border and text
- Transition: `all 0.12s ease`
- Panel uses two-column layout with 1px `var(--border-primary)` vertical divider between left and right eye sections
- Sliders use `accent-color: var(--accent-primary)`
- Section headers use `font-weight: 600`, `font-size: 11px`, `text-transform: uppercase`, `letter-spacing: 0.5px`

## Technical Notes

### Architecture

```
StereoEyeTransformControl (UI Component)
    |
    +--> Manages state: StereoEyeTransformState
    |     { left: EyeTransform, right: EyeTransform, linked: boolean }
    +--> Emits events: transformChanged, alignModeChanged
    +--> Renders panel and alignment dropdown
           |
           v
App.ts (Wiring)
    |
    +--> Listens to stereoEyeTransformControl.on('transformChanged')
    +--> Listens to stereoEyeTransformControl.on('alignModeChanged')
    +--> Calls viewer.setStereoEyeTransforms(state)
    +--> Calls viewer.setStereoAlignMode(mode)
           |
           v
Viewer.ts (Canvas Rendering)
    |
    +--> Stores stereoEyeTransformState
    +--> Stores stereoAlignMode
    +--> Passes eye transforms to StereoRenderer
    +--> Draws alignment overlay after stereo composite
           |
           v
StereoRenderer.ts (Image Processing)
    |
    +--> applyStereoMode() updated to accept per-eye transforms
    +--> applyEyeTransform(eyeData, transform) - NEW
    |     +--> applyFlip(data, flipH, flipV)
    |     +--> applyRotation(data, angleDeg)
    |     +--> applyScale(data, scaleFactor)
    |     +--> applyTranslation(data, tx, ty)
    +--> renderAlignmentOverlay(output, mode, left, right) - NEW
    |     +--> renderGrid(output)
    |     +--> renderCrosshair(output)
    |     +--> renderDifference(left, right)
    |     +--> renderEdgeOverlay(left, right)
    +--> Existing render functions unchanged
```

### Render Pipeline Position
Per-eye transforms are applied within the stereo step (step 3), between eye extraction and stereo composite. Alignment overlays are applied immediately after the stereo composite.

```
1. Draw source image with transform
2. Apply crop
3. Stereo mode:
   a. Extract left/right eyes (existing)
   b. Apply eye swap (existing)
   c. Apply horizontal offset (existing)
   d. **Apply per-eye transforms** <-- NEW (per-eye flip, rotate, scale, translate)
   e. Stereo composite (existing: side-by-side, anaglyph, etc.)
   f. **Apply alignment overlay** <-- NEW (grid, crosshair, difference, edges)
4. Lens distortion
5. 3D LUT
6. Color adjustments
7. CDL
8. Color curves
9. Sharpen/blur
10. Channel isolation
11. Paint annotations
```

### Types

```typescript
// Per-eye geometric transform
interface EyeTransform {
  flipH: boolean;       // Horizontal flip (flop)
  flipV: boolean;       // Vertical flip
  rotation: number;     // Degrees, -180 to +180
  scale: number;        // Uniform scale factor, 0.5 to 2.0
  translateX: number;   // Horizontal offset in pixels, -100 to +100
  translateY: number;   // Vertical offset in pixels, -100 to +100
}

// Complete per-eye transform state
interface StereoEyeTransformState {
  left: EyeTransform;
  right: EyeTransform;
  linked: boolean;      // When true, L/R controls are mirrored
}

// Alignment tool mode
type StereoAlignMode = 'off' | 'grid' | 'crosshair' | 'difference' | 'edges';

// Default values
const DEFAULT_EYE_TRANSFORM: EyeTransform = {
  flipH: false,
  flipV: false,
  rotation: 0,
  scale: 1.0,
  translateX: 0,
  translateY: 0,
};

const DEFAULT_STEREO_EYE_TRANSFORM_STATE: StereoEyeTransformState = {
  left: { ...DEFAULT_EYE_TRANSFORM },
  right: { ...DEFAULT_EYE_TRANSFORM },
  linked: false,
};

const DEFAULT_STEREO_ALIGN_MODE: StereoAlignMode = 'off';
```

### Events

```typescript
interface StereoEyeTransformEvents extends EventMap {
  transformChanged: StereoEyeTransformState;
  alignModeChanged: StereoAlignMode;
  visibilityChanged: boolean;
}
```

### Transform Application Order
Within `applyEyeTransform()`, transforms are applied in this order for each eye independently:
1. Flip horizontal (if enabled)
2. Flip vertical (if enabled)
3. Rotation (around center of eye image)
4. Scale (uniform, from center of eye image)
5. Translation (X and Y pixel offset)

This order ensures flips are applied first (simple pixel rearrangement), rotation and scale operate on the correctly oriented image, and translation is applied last for final positioning.

### Rotation Algorithm
Rotation uses an affine transform around the image center:
```typescript
function applyRotation(imageData: ImageData, angleDeg: number): ImageData {
  if (angleDeg === 0) return imageData;
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const srcX = Math.round(cos * dx - sin * dy + cx);
      const srcY = Math.round(sin * dx + cos * dy + cy);
      const dstIdx = (y * width + x) * 4;

      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const srcIdx = (srcY * width + srcX) * 4;
        result.data[dstIdx] = data[srcIdx]!;
        result.data[dstIdx + 1] = data[srcIdx + 1]!;
        result.data[dstIdx + 2] = data[srcIdx + 2]!;
        result.data[dstIdx + 3] = data[srcIdx + 3]!;
      } else {
        result.data[dstIdx + 3] = 255; // Black fill for out-of-bounds
      }
    }
  }
  return result;
}
```

### Scale Algorithm
Scale uses center-origin uniform scaling:
```typescript
function applyScale(imageData: ImageData, scaleFactor: number): ImageData {
  if (scaleFactor === 1.0) return imageData;
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = Math.round((x - cx) / scaleFactor + cx);
      const srcY = Math.round((y - cy) / scaleFactor + cy);
      const dstIdx = (y * width + x) * 4;

      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const srcIdx = (srcY * width + srcX) * 4;
        result.data[dstIdx] = data[srcIdx]!;
        result.data[dstIdx + 1] = data[srcIdx + 1]!;
        result.data[dstIdx + 2] = data[srcIdx + 2]!;
        result.data[dstIdx + 3] = data[srcIdx + 3]!;
      } else {
        result.data[dstIdx + 3] = 255; // Black fill
      }
    }
  }
  return result;
}
```

### Difference Mode Algorithm
```typescript
function renderDifference(left: ImageData, right: ImageData): ImageData {
  const width = left.width;
  const height = left.height;
  const result = new ImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const diffR = Math.abs(left.data[idx]! - right.data[idx]!);
      const diffG = Math.abs(left.data[idx + 1]! - right.data[idx + 1]!);
      const diffB = Math.abs(left.data[idx + 2]! - right.data[idx + 2]!);
      result.data[idx] = diffR;
      result.data[idx + 1] = diffG;
      result.data[idx + 2] = diffB;
      result.data[idx + 3] = 255;
    }
  }
  return result;
}
```

### Key Files

| File | Purpose |
|------|---------|
| `/src/stereo/StereoRenderer.ts` | Core stereo processing - add `applyEyeTransform()` and alignment overlay functions |
| `/src/stereo/StereoEyeTransform.ts` | NEW - Per-eye transform types, defaults, and utility functions |
| `/src/stereo/StereoEyeTransform.test.ts` | NEW - Unit tests for per-eye transform math |
| `/src/stereo/StereoAlignOverlay.ts` | NEW - Alignment overlay rendering (grid, crosshair, difference, edges) |
| `/src/stereo/StereoAlignOverlay.test.ts` | NEW - Unit tests for alignment overlays |
| `/src/ui/components/StereoEyeTransformControl.ts` | NEW - UI panel component for per-eye transforms |
| `/src/ui/components/StereoEyeTransformControl.test.ts` | NEW - Unit tests for UI control |
| `/src/ui/components/StereoAlignControl.ts` | NEW - Alignment tool dropdown component |
| `/src/ui/components/StereoAlignControl.test.ts` | NEW - Unit tests for alignment dropdown |
| `/src/ui/components/StereoControl.ts` | Existing - No changes required |
| `/src/ui/components/Viewer.ts` | Existing - Wire per-eye transforms into render pipeline |
| `/src/App.ts` | Existing - Wire new controls to viewer |
| `/src/test-helper.ts` | Existing - Expose per-eye transform state for E2E tests |
| `/e2e/stereo-eye-transforms.spec.ts` | NEW - E2E tests for per-eye transforms |
| `/e2e/stereo-alignment.spec.ts` | NEW - E2E tests for alignment tools |

### Modifications to Existing Files

#### `StereoRenderer.ts`
- Update `applyStereoMode()` signature to accept optional `StereoEyeTransformState` parameter
- Add `applyEyeTransform()` function called after eye extraction and before composite
- Export new types from `StereoEyeTransform.ts`

#### `Viewer.ts`
- Add `stereoEyeTransformState: StereoEyeTransformState` property
- Add `stereoAlignMode: StereoAlignMode` property
- Add `setStereoEyeTransforms(state)` method
- Add `setStereoAlignMode(mode)` method
- Pass per-eye transforms to `applyStereoMode()` in `renderImage()`
- Draw alignment overlay after stereo composite

#### `App.ts`
- Instantiate `StereoEyeTransformControl` and `StereoAlignControl`
- Wire events to viewer methods
- Add to View tab context toolbar layout
- Register keyboard shortcuts (Shift+E, Shift+4)

#### `test-helper.ts`
- Expose `stereoEyeTransformState` in `ViewerState`
- Expose `stereoAlignMode` in `ViewerState`

### GTO Session Integration
Per-eye transforms are serialized in the GTO session under the stereo node:
```
stereo {
  eyeTransform {
    left.flipH: boolean
    left.flipV: boolean
    left.rotation: float
    left.scale: float
    left.translateX: float
    left.translateY: float
    right.flipH: boolean
    right.flipV: boolean
    right.rotation: float
    right.scale: float
    right.translateX: float
    right.translateY: float
    linked: boolean
  }
  alignMode: string
}
```

## E2E Test Cases

### File: `/e2e/stereo-eye-transforms.spec.ts`

#### Panel Visibility Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SET-001 | Eye transform button is hidden when stereo mode is off | Not implemented |
| SET-002 | Eye transform button appears when stereo mode is activated | Not implemented |
| SET-003 | Clicking eye transform button opens the panel | Not implemented |
| SET-004 | Clicking eye transform button again closes the panel | Not implemented |
| SET-005 | Pressing Shift+E toggles panel visibility | Not implemented |
| SET-006 | Pressing Escape closes the panel | Not implemented |
| SET-007 | Panel closes when stereo mode is set to off | Not implemented |

#### Left Eye Flip Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SET-010 | Left eye FlipH button toggles horizontal flip | Not implemented |
| SET-011 | Left eye FlipV button toggles vertical flip | Not implemented |
| SET-012 | Left eye FlipH active state shows accent highlight | Not implemented |
| SET-013 | Left eye FlipH changes canvas output | Not implemented |
| SET-014 | Left eye FlipV changes canvas output | Not implemented |

#### Right Eye Flip Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SET-020 | Right eye FlipH button toggles horizontal flip | Not implemented |
| SET-021 | Right eye FlipV button toggles vertical flip | Not implemented |
| SET-022 | Right eye FlipH active state shows accent highlight | Not implemented |
| SET-023 | Right eye FlipH changes canvas output | Not implemented |
| SET-024 | Right eye FlipV changes canvas output | Not implemented |

#### Left Eye Rotation Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SET-030 | Left eye rotation slider defaults to 0 | Not implemented |
| SET-031 | Adjusting left rotation slider updates value display | Not implemented |
| SET-032 | Left eye rotation changes canvas output | Not implemented |
| SET-033 | Double-click on left rotation slider resets to 0 | Not implemented |

#### Right Eye Rotation Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SET-040 | Right eye rotation slider defaults to 0 | Not implemented |
| SET-041 | Adjusting right rotation slider updates value display | Not implemented |
| SET-042 | Right eye rotation changes canvas output | Not implemented |
| SET-043 | Double-click on right rotation slider resets to 0 | Not implemented |

#### Left Eye Scale Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SET-050 | Left eye scale slider defaults to 1.0 | Not implemented |
| SET-051 | Adjusting left scale slider updates value display | Not implemented |
| SET-052 | Left eye scale changes canvas output | Not implemented |
| SET-053 | Double-click on left scale slider resets to 1.0 | Not implemented |

#### Right Eye Scale Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SET-060 | Right eye scale slider defaults to 1.0 | Not implemented |
| SET-061 | Adjusting right scale slider updates value display | Not implemented |
| SET-062 | Right eye scale changes canvas output | Not implemented |
| SET-063 | Double-click on right scale slider resets to 1.0 | Not implemented |

#### Left Eye Translation Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SET-070 | Left eye X translation slider defaults to 0 | Not implemented |
| SET-071 | Left eye Y translation slider defaults to 0 | Not implemented |
| SET-072 | Adjusting left X translation changes canvas output | Not implemented |
| SET-073 | Adjusting left Y translation changes canvas output | Not implemented |
| SET-074 | Double-click on left X translation slider resets to 0 | Not implemented |
| SET-075 | Double-click on left Y translation slider resets to 0 | Not implemented |

#### Right Eye Translation Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SET-080 | Right eye X translation slider defaults to 0 | Not implemented |
| SET-081 | Right eye Y translation slider defaults to 0 | Not implemented |
| SET-082 | Adjusting right X translation changes canvas output | Not implemented |
| SET-083 | Adjusting right Y translation changes canvas output | Not implemented |
| SET-084 | Double-click on right X translation slider resets to 0 | Not implemented |
| SET-085 | Double-click on right Y translation slider resets to 0 | Not implemented |

#### Link/Unlink Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SET-090 | Link toggle defaults to unlinked | Not implemented |
| SET-091 | Clicking link toggle enables linked mode | Not implemented |
| SET-092 | In linked mode, changing left rotation updates right rotation | Not implemented |
| SET-093 | In linked mode, changing right scale updates left scale | Not implemented |
| SET-094 | In linked mode, toggling left FlipH toggles right FlipH | Not implemented |
| SET-095 | Unlinking preserves current values on both eyes | Not implemented |

#### Reset Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SET-100 | Reset All button restores all transforms to defaults | Not implemented |
| SET-101 | Reset All button restores canvas to pre-transform state | Not implemented |
| SET-102 | Reset All resets both eyes even when unlinked | Not implemented |

#### Combined Transform Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SET-110 | Multiple transforms on left eye combine correctly | Not implemented |
| SET-111 | Multiple transforms on right eye combine correctly | Not implemented |
| SET-112 | Different transforms on each eye produce unique output | Not implemented |
| SET-113 | Per-eye transforms work with all stereo display modes | Not implemented |

#### State Persistence Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SET-120 | Per-eye transforms persist when changing frames | Not implemented |
| SET-121 | Per-eye transforms persist when changing tabs | Not implemented |
| SET-122 | Per-eye transforms reset when stereo mode is turned off | Not implemented |

**Total: 55 E2E tests planned**

### File: `/e2e/stereo-alignment.spec.ts`

#### Alignment Tool Visibility Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SAL-001 | Alignment button is hidden when stereo mode is off | Not implemented |
| SAL-002 | Alignment button appears when stereo mode is activated | Not implemented |
| SAL-003 | Clicking alignment button opens mode dropdown | Not implemented |
| SAL-004 | Default alignment mode is off | Not implemented |

#### Grid Overlay Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SAL-010 | Selecting grid mode shows grid overlay on canvas | Not implemented |
| SAL-011 | Grid overlay changes canvas output | Not implemented |
| SAL-012 | Grid overlay persists across frame changes | Not implemented |

#### Crosshair Overlay Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SAL-020 | Selecting crosshair mode shows crosshair overlay | Not implemented |
| SAL-021 | Crosshair overlay changes canvas output | Not implemented |

#### Difference Mode Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SAL-030 | Selecting difference mode shows difference image | Not implemented |
| SAL-031 | Difference mode with identical eyes shows black | Not implemented |
| SAL-032 | Difference mode with misaligned eyes shows non-black output | Not implemented |

#### Edge Overlay Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SAL-040 | Selecting edge mode shows edge overlay | Not implemented |
| SAL-041 | Edge overlay changes canvas output | Not implemented |

#### Alignment Mode Cycling Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SAL-050 | Shift+4 cycles through alignment modes | Not implemented |
| SAL-051 | Cycling wraps from edges back to off | Not implemented |

#### Alignment with Transforms Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SAL-060 | Grid overlay reflects per-eye transform changes | Not implemented |
| SAL-061 | Difference mode updates when per-eye transforms change | Not implemented |

#### Cleanup Tests
| Test ID | Description | Status |
|---------|-------------|--------|
| SAL-070 | Alignment overlay removed when stereo mode is turned off | Not implemented |
| SAL-071 | Selecting off removes alignment overlay from canvas | Not implemented |

**Total: 21 E2E tests planned**

## Unit Test Cases

### StereoEyeTransform Unit Tests
**File**: `/src/stereo/StereoEyeTransform.test.ts`

#### Default State Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SET-U001 | defaults | DEFAULT_EYE_TRANSFORM has flipH false |
| SET-U002 | defaults | DEFAULT_EYE_TRANSFORM has flipV false |
| SET-U003 | defaults | DEFAULT_EYE_TRANSFORM has rotation 0 |
| SET-U004 | defaults | DEFAULT_EYE_TRANSFORM has scale 1.0 |
| SET-U005 | defaults | DEFAULT_EYE_TRANSFORM has translateX 0 |
| SET-U006 | defaults | DEFAULT_EYE_TRANSFORM has translateY 0 |
| SET-U007 | defaults | DEFAULT_STEREO_EYE_TRANSFORM_STATE has default left and right |
| SET-U008 | defaults | DEFAULT_STEREO_EYE_TRANSFORM_STATE has linked false |

#### Utility Function Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SET-U010 | utilities | isDefaultEyeTransform returns true for default |
| SET-U011 | utilities | isDefaultEyeTransform returns false when flipH is true |
| SET-U012 | utilities | isDefaultEyeTransform returns false when rotation is non-zero |
| SET-U013 | utilities | isDefaultEyeTransform returns false when scale is not 1.0 |
| SET-U014 | utilities | isDefaultEyeTransform returns false when translateX is non-zero |
| SET-U015 | utilities | isDefaultEyeTransform returns false when translateY is non-zero |
| SET-U016 | utilities | isDefaultStereoEyeTransformState returns true for default |
| SET-U017 | utilities | isDefaultStereoEyeTransformState returns false when left is modified |
| SET-U018 | utilities | isDefaultStereoEyeTransformState returns false when right is modified |

#### Flip Transform Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SET-U020 | flipH | Horizontal flip reverses pixel columns |
| SET-U021 | flipH | Double horizontal flip restores original |
| SET-U022 | flipV | Vertical flip reverses pixel rows |
| SET-U023 | flipV | Double vertical flip restores original |
| SET-U024 | flip | Combined flipH and flipV equals 180-degree rotation |

#### Rotation Transform Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SET-U030 | rotation | 0-degree rotation returns identical data |
| SET-U031 | rotation | 90-degree rotation rotates pixels correctly |
| SET-U032 | rotation | -90-degree rotation rotates opposite direction |
| SET-U033 | rotation | 180-degree rotation flips both axes |
| SET-U034 | rotation | 360-degree rotation returns identical data |
| SET-U035 | rotation | Small angle rotation preserves center pixel |
| SET-U036 | rotation | Out-of-bounds pixels filled with black |

#### Scale Transform Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SET-U040 | scale | Scale 1.0 returns identical data |
| SET-U041 | scale | Scale 2.0 zooms in (magnifies center) |
| SET-U042 | scale | Scale 0.5 zooms out (shows borders) |
| SET-U043 | scale | Center pixel unchanged at any scale |
| SET-U044 | scale | Scale clamped to range 0.5-2.0 |

#### Translation Transform Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SET-U050 | translate | Zero translation returns identical data |
| SET-U051 | translate | Positive X shifts image right |
| SET-U052 | translate | Negative X shifts image left |
| SET-U053 | translate | Positive Y shifts image down |
| SET-U054 | translate | Negative Y shifts image up |
| SET-U055 | translate | Out-of-bounds areas filled with black |
| SET-U056 | translate | Translation clamped to -100 to +100 |

#### Combined Transform Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SET-U060 | combined | Transforms applied in correct order (flip, rotate, scale, translate) |
| SET-U061 | combined | FlipH then rotation differs from rotation then flipH |
| SET-U062 | combined | applyEyeTransform handles all default values (no-op) |
| SET-U063 | combined | applyEyeTransform applies all transforms together |

#### Edge Case Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SET-U070 | edge cases | Handles 1x1 image |
| SET-U071 | edge cases | Handles 2x2 image |
| SET-U072 | edge cases | Handles odd dimensions |
| SET-U073 | edge cases | Handles large translation (fully off-screen) |

### StereoAlignOverlay Unit Tests
**File**: `/src/stereo/StereoAlignOverlay.test.ts`

| Test ID | Category | Description |
|---------|----------|-------------|
| SAL-U001 | grid | Grid overlay adds lines at 64px intervals |
| SAL-U002 | grid | Grid lines have correct color (white 30% opacity) |
| SAL-U003 | grid | Grid overlay does not modify source pixel data |
| SAL-U004 | crosshair | Crosshair draws at image center |
| SAL-U005 | crosshair | Crosshair uses yellow color |
| SAL-U006 | crosshair | Crosshair extends full width and height |
| SAL-U010 | difference | Identical images produce all-black output |
| SAL-U011 | difference | Different images produce non-zero output |
| SAL-U012 | difference | Difference is per-channel absolute value |
| SAL-U013 | difference | Result alpha is always 255 |
| SAL-U020 | edges | Edge detection produces binary output |
| SAL-U021 | edges | Left eye edges shown in cyan |
| SAL-U022 | edges | Right eye edges shown in red |
| SAL-U023 | edges | Overlapping edges shown in white |
| SAL-U030 | off | Off mode returns unmodified image |
| SAL-U031 | general | All modes return ImageData with same dimensions |

### StereoEyeTransformControl Unit Tests
**File**: `/src/ui/components/StereoEyeTransformControl.test.ts`

#### Initialization Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SETC-U001 | initialization | Initializes with default state |
| SETC-U002 | initialization | Default left eye has all transforms at default |
| SETC-U003 | initialization | Default right eye has all transforms at default |
| SETC-U004 | initialization | Default linked is false |
| SETC-U005 | initialization | isActive returns false when all defaults |

#### Render Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SETC-U010 | render | Render returns container element |
| SETC-U011 | render | Container has eye transform toggle button |
| SETC-U012 | render | Panel has left eye section |
| SETC-U013 | render | Panel has right eye section |
| SETC-U014 | render | Panel has link toggle |
| SETC-U015 | render | Panel has reset all button |
| SETC-U016 | render | Left section has FlipH button |
| SETC-U017 | render | Left section has FlipV button |
| SETC-U018 | render | Left section has rotation slider |
| SETC-U019 | render | Left section has scale slider |
| SETC-U020 | render | Left section has translateX slider |
| SETC-U021 | render | Left section has translateY slider |
| SETC-U022 | render | Right section has all controls matching left |
| SETC-U023 | render | Rotation slider has correct range (-180 to 180) |
| SETC-U024 | render | Scale slider has correct range (0.5 to 2.0) |
| SETC-U025 | render | TranslateX slider has correct range (-100 to 100) |
| SETC-U026 | render | TranslateY slider has correct range (-100 to 100) |

#### Left Eye Control Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SETC-U030 | left eye | setLeftFlipH changes state |
| SETC-U031 | left eye | setLeftFlipH emits transformChanged |
| SETC-U032 | left eye | setLeftFlipV changes state |
| SETC-U033 | left eye | setLeftRotation changes state |
| SETC-U034 | left eye | setLeftRotation clamps to range |
| SETC-U035 | left eye | setLeftScale changes state |
| SETC-U036 | left eye | setLeftScale clamps to range |
| SETC-U037 | left eye | setLeftTranslateX changes state |
| SETC-U038 | left eye | setLeftTranslateX clamps to range |
| SETC-U039 | left eye | setLeftTranslateY changes state |
| SETC-U040 | left eye | setLeftTranslateY clamps to range |

#### Right Eye Control Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SETC-U050 | right eye | setRightFlipH changes state |
| SETC-U051 | right eye | setRightFlipH emits transformChanged |
| SETC-U052 | right eye | setRightFlipV changes state |
| SETC-U053 | right eye | setRightRotation changes state |
| SETC-U054 | right eye | setRightRotation clamps to range |
| SETC-U055 | right eye | setRightScale changes state |
| SETC-U056 | right eye | setRightScale clamps to range |
| SETC-U057 | right eye | setRightTranslateX changes state |
| SETC-U058 | right eye | setRightTranslateX clamps to range |
| SETC-U059 | right eye | setRightTranslateY changes state |
| SETC-U060 | right eye | setRightTranslateY clamps to range |

#### Link Mode Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SETC-U070 | link | setLinked changes linked state |
| SETC-U071 | link | When linked, setLeftRotation also sets right rotation |
| SETC-U072 | link | When linked, setRightScale also sets left scale |
| SETC-U073 | link | When linked, toggleLeftFlipH also toggles right FlipH |
| SETC-U074 | link | When linked, setLeftTranslateX also sets right translateX |
| SETC-U075 | link | Unlinking does not change current values |
| SETC-U076 | link | When linked, only one transformChanged event emitted per change |

#### State Management Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SETC-U080 | state | getState returns copy of state |
| SETC-U081 | state | setState sets all values |
| SETC-U082 | state | setState emits transformChanged |
| SETC-U083 | state | setState does not emit if unchanged |
| SETC-U084 | state | reset restores all defaults |
| SETC-U085 | state | reset emits transformChanged |

#### Panel Visibility Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SETC-U090 | visibility | Panel hidden by default |
| SETC-U091 | visibility | togglePanel opens panel |
| SETC-U092 | visibility | togglePanel closes open panel |
| SETC-U093 | visibility | show emits visibilityChanged true |
| SETC-U094 | visibility | hide emits visibilityChanged false |

#### Keyboard Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SETC-U100 | keyboard | Shift+E toggles panel visibility |
| SETC-U101 | keyboard | Returns false for non-handled keys |
| SETC-U102 | keyboard | Without shift does not toggle |

#### No-Op and Edge Case Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SETC-U110 | edge cases | Does not emit if flipH set to same value |
| SETC-U111 | edge cases | Does not emit if rotation set to same value |
| SETC-U112 | edge cases | isActive returns true when any left transform is non-default |
| SETC-U113 | edge cases | isActive returns true when any right transform is non-default |

#### Dispose Tests
| Test ID | Category | Description |
|---------|----------|-------------|
| SETC-U120 | dispose | Cleans up without error |
| SETC-U121 | dispose | Can be called multiple times |

### StereoAlignControl Unit Tests
**File**: `/src/ui/components/StereoAlignControl.test.ts`

| Test ID | Category | Description |
|---------|----------|-------------|
| SALC-U001 | initialization | Initializes with mode off |
| SALC-U002 | render | Render returns container element |
| SALC-U003 | render | Container has align button |
| SALC-U004 | render | Dropdown has all mode options |
| SALC-U010 | mode | setMode changes mode |
| SALC-U011 | mode | setMode emits alignModeChanged |
| SALC-U012 | mode | setMode does not emit if unchanged |
| SALC-U013 | mode | setMode to non-off makes isActive true |
| SALC-U014 | mode | setMode to off makes isActive false |
| SALC-U020 | cycleMode | Cycles through all modes in order |
| SALC-U021 | cycleMode | Wraps from edges back to off |
| SALC-U022 | cycleMode | Emits alignModeChanged event |
| SALC-U030 | keyboard | Shift+4 cycles mode |
| SALC-U031 | keyboard | Returns false for non-handled keys |
| SALC-U032 | keyboard | Without shift does not cycle |
| SALC-U040 | reset | Reset restores mode to off |
| SALC-U041 | reset | Reset emits alignModeChanged |
| SALC-U050 | dispose | Cleans up without error |
| SALC-U051 | dispose | Can be called multiple times |

**Summary of unit tests:**
- StereoEyeTransform: 48 tests
- StereoAlignOverlay: 16 tests
- StereoEyeTransformControl: 62 tests
- StereoAlignControl: 19 tests
- **Total: 145 unit tests planned**

## User Flow Verification

### Primary User Flow: Correct Stereo Eye Alignment

1. User loads stereo media file (side-by-side or over-under)
2. User navigates to View tab (click or press `1`)
3. User enables a stereo mode from the Stereo dropdown (e.g., "Anaglyph")
4. Canvas shows stereo composite; Eye Transforms and Align buttons appear
5. User clicks "Align" and selects "Difference" to visualize misalignment
6. Canvas shows difference image; bright areas indicate misalignment
7. User clicks "Eye Transforms" button to open the panel
8. Panel opens showing Left Eye and Right Eye sections with sliders
9. User adjusts Right Eye rotation slider to correct rotational misalignment
10. Difference image updates in real-time, bright areas reduce
11. User adjusts Right Eye Y translation to fix vertical offset
12. Difference image becomes mostly black (aligned)
13. User switches alignment mode to "Off" to see the corrected stereo composite
14. Stereo viewing is now properly aligned

**Status: Not implemented**

### Secondary User Flow: Mirror Camera Rig Correction

1. User loads stereo content from a mirror rig (one camera is inverted)
2. User activates "Side-by-Side" stereo mode
3. Content appears misaligned due to camera inversion
4. User opens Eye Transforms panel
5. User clicks "FlipV" on the Right Eye section
6. Right eye is vertically flipped, correcting the mirror rig inversion
7. User verifies alignment using Grid overlay
8. Stereo content is now correctly oriented

**Status: Not implemented**

### Tertiary User Flow: Linked Scale Adjustment for Convergence

1. User is viewing stereo content in Anaglyph mode
2. User opens Eye Transforms panel
3. User clicks "Link L/R" to enable linked mode
4. User adjusts Scale slider on the Left Eye section
5. Both eyes scale simultaneously to the same value
6. User adjusts to find optimal convergence scale
7. User unlocks L/R to fine-tune right eye independently
8. Per-eye scale correction is complete

**Status: Not implemented**

### Quaternary User Flow: Session Persistence

1. User corrects stereo alignment with per-eye transforms
2. User saves session (GTO export)
3. User reloads application
4. User loads saved session
5. All per-eye transform settings are restored
6. Alignment overlay mode is restored
7. Stereo viewing matches the saved state

**Status: Not implemented**

## References

- Existing Stereo Feature: `/Users/lifeart/Repos/openrv-web/features/stereo-3d-viewing.md`
- StereoRenderer: `/Users/lifeart/Repos/openrv-web/src/stereo/StereoRenderer.ts`
- StereoControl UI: `/Users/lifeart/Repos/openrv-web/src/ui/components/StereoControl.ts`
- StereoControl Tests: `/Users/lifeart/Repos/openrv-web/src/ui/components/StereoControl.test.ts`
- StereoRenderer Tests: `/Users/lifeart/Repos/openrv-web/src/stereo/StereoRenderer.test.ts`
- Viewer: `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts`
- App Wiring: `/Users/lifeart/Repos/openrv-web/src/App.ts`
- Test Helper: `/Users/lifeart/Repos/openrv-web/src/test-helper.ts`
- E2E Stereo Tests: `/Users/lifeart/Repos/openrv-web/e2e/stereo-viewing.spec.ts`
- UI Guidelines: `/Users/lifeart/Repos/openrv-web/UI.md`
