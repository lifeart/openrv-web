# Global Hue Rotation

## Original OpenRV Implementation
OpenRV provides luminance-preserving hue rotation as part of its per-source color correction pipeline. The rotation operates in radians using skew transforms applied as a 3x3 color matrix in the GPU shader pipeline. This ensures that perceived brightness remains constant as hues are shifted around the color wheel, unlike naive HSL hue shifting which can produce unnatural brightness fluctuations.

Key characteristics of the OpenRV implementation:
- **Luminance preservation**: Uses Rec. 709 luminance weights (0.2126, 0.7152, 0.0722) to maintain perceived brightness
- **Matrix-based rotation**: Constructs a composite 3x3 matrix from rotation and skew transforms rather than converting to HSL
- **GPU pipeline**: Applied as a `mat3` uniform in the fragment shader for real-time performance
- **Radians input**: Internal rotation value stored in radians; UI presents degrees
- **Alpha preservation**: Hue rotation affects RGB channels only; alpha passes through unchanged

## Status
- [ ] Not implemented (WebGL mat3 shader path)
- [x] Partially implemented (CSS `hue-rotate()` filter path)
- [ ] Fully implemented

### What's Implemented

**CSS Filter-Based Hue Rotation (Current)**:
- `hueRotation` field in `ColorAdjustments` interface (0-360 degrees)
- UI slider in the ColorControls panel with `data-testid="slider-hueRotation"`
- CSS `hue-rotate()` filter applied via `getCanvasFilterString()` in `ViewerRenderingUtils.ts`
- Normalization of rotation values to [0, 360) range
- Filter string caching for performance
- Default value of 0 degrees
- Double-click slider to reset to default
- Reset button clears hue rotation along with all other adjustments
- E2E tests covering default state, slider interaction, visual changes, range, persistence, and reset
- Unit tests covering default value, set/get, NaN/Infinity sanitization, normalization, and caching

### What's NOT Implemented

**WebGL Luminance-Preserving Hue Rotation**:
- The current CSS `hue-rotate()` filter does NOT preserve luminance. It performs a simple rotation in RGB space which causes perceived brightness shifts (e.g., rotating pure red to pure green changes perceived brightness significantly).
- No `mat3` shader uniform for the hue rotation matrix
- No GLSL fragment shader code for matrix-based hue rotation
- No keyboard shortcut for hue rotation (e.g., `Shift+U` to focus the slider)
- No integration in the WebGL render pipeline (when WebGL path is implemented)

## Requirements
| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Hue rotation slider in ColorControls panel | Implemented | `slider-hueRotation`, 0-360 degrees, step 1 |
| CSS filter fallback for hue rotation | Implemented | `hue-rotate(Xdeg)` in `buildColorFilterArray()` |
| Luminance-preserving rotation matrix | Not Implemented | Requires `mat3` shader with Rec. 709 weights |
| WebGL `mat3` shader uniform | Not Implemented | Requires fragment shader integration |
| GLSL hue rotation code | Not Implemented | Requires `u_hueRotationMatrix` uniform |
| Keyboard shortcut to focus slider | Not Implemented | `Shift+U` proposed (Shift+H taken by HSL Qualifier) |
| Real-time GPU preview | Partially Implemented | CSS filter is real-time but not luminance-preserving |
| Alpha channel preservation | Implemented | CSS filter and matrix both preserve alpha |
| Value normalization (wrap at 360) | Implemented | `((hue % 360) + 360) % 360` |
| NaN/Infinity input sanitization | Implemented | Falls back to default value (0) |
| Reset to default | Implemented | Reset button and double-click slider |
| Persistence across frame changes | Implemented | Slider value persists during navigation |
| Pipeline ordering (after exposure, before CDL) | Implemented | Step 6 in color adjustment pipeline |

## UI/UX Specification

### Hue Rotation Slider

**Location**: ColorControls panel (`src/ui/components/ColorControls.ts`), between Clarity and Gamma sliders

**Control Layout**:
```
[Label: 80px] [Slider: flex-1] [Value: 50px]
 Hue Rotation   ====O=========    180°
```

**Slider Configuration**:
| Property | Value |
|----------|-------|
| `data-testid` | `slider-hueRotation` |
| Type | `range` |
| Min | `0` |
| Max | `360` |
| Step | `1` |
| Default | `0` |
| Format | `X°` (e.g., `0°`, `180°`, `360°`) |

**Interaction**:
- Drag slider to adjust hue rotation continuously
- Double-click slider to reset to 0 degrees
- Value label updates in real-time during drag
- `adjustmentsChanged` event emitted on every `input` event

**Keyboard Shortcut**:
- `Shift+U` toggles focus to the hue rotation slider (U for "hUe"; `Shift+H` is taken by HSL Qualifier, `Shift+Alt+H` is taken by History panel)
- When focused, Left/Right arrow keys adjust by step value (1 degree)

**Button States** (inherited from ColorControls panel):
- Default: Transparent background, muted text color
- Hover: `var(--bg-hover)` background, primary border
- Active (panel open): Accent color highlight (`rgba(var(--accent-primary-rgb), 0.15)`)

### Data Attributes
| Element | `data-testid` |
|---------|---------------|
| Hue rotation slider | `slider-hueRotation` |
| Hue rotation value label | (uses `valueLabels` Map keyed by `'hueRotation'`) |
| Color panel toggle button | (inherited, Color button in tab bar) |
| Reset button | (inherited, "Reset" button in panel header) |

## Technical Notes

### Implementation Files
| File | Purpose |
|------|---------|
| `src/ui/components/ColorControls.ts` | Slider UI, `hueRotation` in `ColorAdjustments` interface |
| `src/ui/components/ViewerRenderingUtils.ts` | CSS filter string builder (`hue-rotate()`) |
| `src/api/ColorAPI.ts` | Public API: `setAdjustments({ hueRotation })`, `getAdjustments().hueRotation` |
| `src/ui/components/ColorControls.test.ts` | Unit tests for hue rotation defaults, set/get, reset |
| `src/ui/components/ViewerRenderingUtils.test.ts` | Unit tests for filter string generation and normalization |
| `e2e/hue-rotation.spec.ts` | E2E tests for slider interaction and visual verification |

### Files to Create/Modify for WebGL Implementation
| File | Purpose |
|------|---------|
| `src/shaders/colorCorrection.frag` (new) | GLSL fragment shader with `u_hueRotationMatrix` uniform |
| `src/shaders/colorCorrection.vert` (new) | GLSL vertex shader (passthrough) |
| `src/color/HueRotation.ts` (new) | `buildHueRotationMatrix(degrees)` function |
| `src/color/HueRotation.test.ts` (new) | Unit tests for matrix construction |
| `src/ui/components/Viewer.ts` | WebGL pipeline integration |
| `src/ui/components/ViewerRenderingUtils.ts` | Remove CSS fallback when WebGL path active |

### Color Adjustment Pipeline Order (in Viewer.ts renderImage)
1. Draw source image with transform (rotation/flip)
2. Apply crop
3. Stereo mode transformation
4. Lens distortion
5. **3D LUT application**
6. **Color adjustments** (exposure, contrast, saturation, gamma, temperature, tint, brightness, **hue rotation**)
7. **CDL correction** (Slope, Offset, Power, Saturation)
8. **Color curves**
9. **Highlights/Shadows/Whites/Blacks recovery**
10. **Vibrance** (with optional skin protection)
11. **Clarity** (local contrast via high-pass filter)
12. Sharpen/blur filters
13. Channel isolation
14. Paint annotations

Hue rotation is applied at step 6 as part of color adjustments, after exposure/contrast/saturation but logically grouped with them. In the WebGL path, it would be applied as a matrix multiplication in the fragment shader at the same pipeline stage.

### Hue Rotation Matrix Math

The luminance-preserving hue rotation matrix is constructed by compositing a rotation in a color space where one axis is aligned with the luminance direction (1,1,1)/sqrt(3). The derivation follows OpenRV's approach:

#### Step 1: Rotate color space to align luminance axis with Z

The (1,1,1) vector (equal-energy white) is rotated to align with the Z axis. This requires two rotations:

**Rotation about the X axis by -45 degrees** (projects (1,1,1) into the XZ plane):
```
        | 1       0        0     |
Rx =    | 0    cos(-45)  -sin(-45)|
        | 0    sin(-45)   cos(-45)|

        | 1       0        0     |
Rx =    | 0    0.7071    0.7071  |
        | 0   -0.7071    0.7071  |
```

**Rotation about the Y axis** to align the projected vector with Z:
After Rx, (1,1,1) becomes (1, 0, sqrt(2)). The angle to rotate to Z is `atan2(1, sqrt(2))`:
```
theta_y = atan2(1, sqrt(2)) = 0.6155 rad (approx 35.26 degrees)

        | cos(t)   0   sin(t) |
Ry =    |   0      1     0    |
        | -sin(t)  0   cos(t) |
```

#### Step 2: Apply hue rotation about the Z axis (now the luminance axis)

```
        | cos(h)  -sin(h)   0 |
Rz =    | sin(h)   cos(h)   0 |
        |   0        0      1 |
```

where `h` is the hue rotation angle in radians.

#### Step 3: Apply luminance correction skew

After rotating back to the original color space, a skew transform is applied to correct for the fact that R, G, and B contribute differently to luminance (per Rec. 709 weights):

```
Luminance weights: Wr = 0.2126, Wg = 0.7152, Wb = 0.0722
```

The skew ensures that the luminance `L = Wr*R + Wg*G + Wb*B` is preserved after the hue rotation.

#### Step 4: Composite matrix

The final 3x3 hue rotation matrix is:
```
M = Ry^(-1) * Rx^(-1) * Rz * Rx * Ry * Skew_luminance
```

#### Closed-Form Matrix

For a hue rotation angle `h` (in radians), the luminance-preserving 3x3 matrix can be expressed directly:

```
Given:
  cosH = cos(h)
  sinH = sin(h)

  Wr = 0.2126   (Rec. 709 red weight)
  Wg = 0.7152   (Rec. 709 green weight)
  Wb = 0.0722   (Rec. 709 blue weight)

Matrix M:

  M[0][0] = Wr + (1 - Wr) * cosH + Wr * sinH * (-0.7874 / k)
  M[0][1] = Wg - Wg * cosH + Wg * sinH * (-0.7874 / k)
  M[0][2] = Wb - Wb * cosH + (1 - Wb) * sinH * (0.2126 / k)

  ...

Simplified closed-form (commonly used):

  M[0][0] = 0.2126 + 0.7874 * cosH + 0.2126 * sinH
  M[0][1] = 0.7152 - 0.7152 * cosH + 0.7152 * sinH
  M[0][2] = 0.0722 - 0.0722 * cosH - 0.9278 * sinH

  M[1][0] = 0.2126 - 0.2126 * cosH - 0.7874 * sinH
  M[1][1] = 0.7152 + 0.2848 * cosH + 0.1408 * sinH
  M[1][2] = 0.0722 - 0.0722 * cosH + 0.5722 * sinH

  M[2][0] = 0.2126 - 0.2126 * cosH + 0.7874 * sinH
  M[2][1] = 0.7152 - 0.7152 * cosH - 0.7152 * sinH
  M[2][2] = 0.0722 + 0.9278 * cosH + 0.0722 * sinH
```

**Verification**: At `h = 0`, `cosH = 1`, `sinH = 0`, the matrix reduces to the 3x3 identity.

**Luminance preservation proof**: For any angle `h`, the row sums satisfy:
```
Row 0: M[0][0] + M[0][1] + M[0][2] = 1.0
Row 1: M[1][0] + M[1][1] + M[1][2] = 1.0
Row 2: M[2][0] + M[2][1] + M[2][2] = 1.0
```
This means a neutral gray pixel `(g, g, g)` maps to `(g, g, g)` -- grays are invariant.

Additionally, for any input `(R, G, B)`:
```
L_out = Wr * R_out + Wg * G_out + Wb * B_out
      = Wr * (M[0] . RGB) + Wg * (M[1] . RGB) + Wb * (M[2] . RGB)
      = (Wr * M[0][0] + Wg * M[1][0] + Wb * M[2][0]) * R
      + (Wr * M[0][1] + Wg * M[1][1] + Wb * M[2][1]) * G
      + (Wr * M[0][2] + Wg * M[1][2] + Wb * M[2][2]) * B
      = Wr * R + Wg * G + Wb * B
      = L_in
```

### TypeScript Implementation

**File**: `src/color/HueRotation.ts`

```typescript
/**
 * Luminance-preserving hue rotation matrix construction.
 *
 * Builds a 3x3 matrix that rotates hue while preserving perceived
 * luminance using Rec. 709 coefficients, matching OpenRV's approach.
 */

/** Rec. 709 luminance weights */
const Wr = 0.2126;
const Wg = 0.7152;
const Wb = 0.0722;

/**
 * Build a 3x3 luminance-preserving hue rotation matrix.
 *
 * @param degrees - Hue rotation in degrees (0-360 or -180 to +180)
 * @returns A 9-element Float32Array in column-major order (for WebGL mat3)
 *
 * The matrix preserves Rec. 709 luminance:
 *   L = 0.2126*R + 0.7152*G + 0.0722*B
 * remains constant after the rotation.
 */
export function buildHueRotationMatrix(degrees: number): Float32Array {
  const radians = (degrees * Math.PI) / 180;
  const cosH = Math.cos(radians);
  const sinH = Math.sin(radians);

  // Row-major matrix elements
  const m00 = Wr + (1 - Wr) * cosH + Wr * sinH;
  const m01 = Wg - Wg * cosH + Wg * sinH;
  const m02 = Wb - Wb * cosH - (1 - Wb) * sinH;

  const m10 = Wr - Wr * cosH - (1 - Wr) * sinH;
  const m11 = Wg + (1 - Wg) * cosH + Wg * sinH * (Wr / Wg);
  const m12 = Wb - Wb * cosH + Wb * sinH * ((1 - Wb) / Wb);

  const m20 = Wr - Wr * cosH + (1 - Wr) * sinH;
  const m21 = Wg - Wg * cosH - Wg * sinH;
  const m22 = Wb + (1 - Wb) * cosH + Wb * sinH;

  // WebGL mat3 uses column-major order
  return new Float32Array([
    m00, m10, m20,  // Column 0
    m01, m11, m21,  // Column 1
    m02, m12, m22,  // Column 2
  ]);
}

/**
 * Apply hue rotation to an RGB pixel (CPU fallback).
 *
 * @param r - Red channel [0, 1]
 * @param g - Green channel [0, 1]
 * @param b - Blue channel [0, 1]
 * @param degrees - Hue rotation in degrees
 * @returns [r, g, b] rotated pixel values
 */
export function applyHueRotation(
  r: number, g: number, b: number, degrees: number
): [number, number, number] {
  const mat = buildHueRotationMatrix(degrees);
  // mat is column-major, so mat[0]=m00, mat[1]=m10, mat[2]=m20, etc.
  const outR = mat[0] * r + mat[3] * g + mat[6] * b;
  const outG = mat[1] * r + mat[4] * g + mat[7] * b;
  const outB = mat[2] * r + mat[5] * g + mat[8] * b;
  return [
    Math.max(0, Math.min(1, outR)),
    Math.max(0, Math.min(1, outG)),
    Math.max(0, Math.min(1, outB)),
  ];
}

/**
 * Check if hue rotation is at identity (no effect).
 */
export function isIdentityHueRotation(degrees: number): boolean {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized === 0;
}
```

### GLSL Shader Implementation

**Fragment Shader**: `src/shaders/colorCorrection.frag`

```glsl
precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_texture;

// Hue rotation: luminance-preserving 3x3 matrix
uniform mat3 u_hueRotationMatrix;
uniform bool u_hueRotationEnabled;

// Exposure: applied as brightness multiplier
uniform float u_exposure;

// Saturation: 0 = grayscale, 1 = normal, 2 = boosted
uniform float u_saturation;

// Contrast: 1 = normal
uniform float u_contrast;

// Gamma: 1 = linear
uniform float u_gamma;

// Brightness offset: -1 to +1
uniform float u_brightness;

// Rec. 709 luminance weights
const vec3 LUMA_709 = vec3(0.2126, 0.7152, 0.0722);

void main() {
    vec4 color = texture2D(u_texture, v_texCoord);

    // 1. Exposure: c * 2^exposure
    color.rgb *= pow(2.0, u_exposure);

    // 2. Brightness offset
    color.rgb += u_brightness;

    // 3. Contrast: (c - 0.5) * contrast + 0.5
    color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;

    // 4. Saturation
    float luma = dot(color.rgb, LUMA_709);
    color.rgb = mix(vec3(luma), color.rgb, u_saturation);

    // 5. Hue rotation (luminance-preserving matrix)
    if (u_hueRotationEnabled) {
        color.rgb = u_hueRotationMatrix * color.rgb;
    }

    // 6. Gamma
    color.rgb = pow(max(color.rgb, 0.0), vec3(1.0 / u_gamma));

    // Clamp to valid range
    color.rgb = clamp(color.rgb, 0.0, 1.0);

    // Alpha passes through unchanged
    gl_FragColor = color;
}
```

**Vertex Shader**: `src/shaders/colorCorrection.vert`

```glsl
precision mediump float;

attribute vec2 a_position;
attribute vec2 a_texCoord;

varying vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
```

### WebGL Uniform Setup (TypeScript)

```typescript
// In Viewer.ts or a new WebGLPipeline.ts:

import { buildHueRotationMatrix, isIdentityHueRotation } from '../color/HueRotation';

function updateHueRotationUniforms(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  hueRotationDegrees: number
): void {
  const enabledLoc = gl.getUniformLocation(program, 'u_hueRotationEnabled');
  const matrixLoc = gl.getUniformLocation(program, 'u_hueRotationMatrix');

  if (isIdentityHueRotation(hueRotationDegrees)) {
    gl.uniform1i(enabledLoc, 0);
  } else {
    gl.uniform1i(enabledLoc, 1);
    const matrix = buildHueRotationMatrix(hueRotationDegrees);
    gl.uniformMatrix3fv(matrixLoc, false, matrix);
  }
}
```

### Current CSS Filter Implementation

The current implementation uses the CSS `hue-rotate()` filter, which does NOT preserve luminance. It is a simple rotation in a modified RGB space:

**File**: `src/ui/components/ViewerRenderingUtils.ts`, `buildColorFilterArray()`

```typescript
// Hue rotation: global hue shift in degrees, normalize to [0, 360)
const hueRotation = safe(adjustments.hueRotation, 0);
const normalizedHue = ((hueRotation % 360) + 360) % 360;
if (normalizedHue !== 0) {
  filters.push(`hue-rotate(${normalizedHue.toFixed(1)}deg)`);
}
```

The CSS `hue-rotate()` filter string is cached and invalidated when the `hueRotation` value changes:

```typescript
// Cache check includes hueRotation
adjustments.hueRotation === cached.hueRotation
```

### Events Emitted
| Event | Payload | When |
|-------|---------|------|
| `adjustmentsChanged` | `ColorAdjustments` | Hue rotation slider dragged, or set via `setAdjustments()` |
| `adjustmentsChanged` | `ColorAdjustments` | Reset button clicked (hueRotation returns to 0) |
| `adjustmentsChanged` | `ColorAdjustments` | Double-click slider (hueRotation returns to 0) |

### API Access

**File**: `src/api/ColorAPI.ts`

```typescript
// Set hue rotation
colorAPI.setAdjustments({ hueRotation: 180 });

// Get current hue rotation
const hue = colorAPI.getAdjustments().hueRotation; // 0-360

// Reset all (including hue rotation)
colorAPI.reset();
```

The `hueRotation` field is included in the `PublicColorAdjustments` interface and validated as a finite number. NaN and Infinity values are rejected and fall back to the default (0).

## E2E Test Cases

**File**: `e2e/hue-rotation.spec.ts`

### Slider Default and Visibility Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| HR-001 | default hue rotation is 0 degrees | Opens Color panel, verifies `slider-hueRotation` value is 0 |
| HR-002 | hue rotation slider exists in color controls | Opens Color panel, verifies slider is visible |

### Slider Interaction Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| HR-003 | changing hue rotation slider updates internal state | Loads image, sets slider to 180, verifies slider value reads 180 |
| HR-004 | hue rotation visually changes the canvas | Captures before/after screenshots, verifies pixel difference |
| HR-005 | hue rotation slider has correct min/max range | Verifies `min="0"` and `max="360"` attributes |

### Normalization Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| HR-006 | hue rotation wraps at 360 degrees | Sets slider to 360, verifies normalized value is 0 |

### Persistence Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| HR-007 | hue rotation persists when navigating frames | Loads video, sets hue to 90, navigates frame, verifies 90 persists |

### Reset Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| HR-008 | reset color controls resets hue rotation to 0 | Sets hue to 120, clicks Reset, verifies slider returns to 0 |

### Future E2E Tests (Not Yet Implemented)
| ID | Test Name | Description | Priority |
|----|-----------|-------------|----------|
| HR-009 | Shift+U focuses hue rotation slider | Presses Shift+U, verifies slider receives focus | Medium |
| HR-010 | hue rotation preserves luminance (WebGL path) | Compares average brightness before/after 180-degree rotation | High |
| HR-011 | hue rotation of 120 shifts red to green | Loads red test image, rotates 120, verifies green channel dominant | High |
| HR-012 | hue rotation of 240 shifts red to blue | Loads red test image, rotates 240, verifies blue channel dominant | High |
| HR-013 | hue rotation combined with saturation | Applies both hue rotation and saturation, verifies no artifacts | Medium |
| HR-014 | hue rotation combined with CDL | Applies hue rotation + CDL slope, verifies correct stacking | Medium |
| HR-015 | double-click slider resets to 0 | Double-clicks slider, verifies value returns to 0 | Low |

## Unit Test Cases

### ColorControls Unit Tests (Existing)
**File**: `src/ui/components/ColorControls.test.ts`

| ID | Test Name | Description |
|----|-----------|-------------|
| COL-029 | default hueRotation is 0 | Verifies `getAdjustments().hueRotation === 0` |
| COL-030 | sets hueRotation adjustment | `setAdjustments({ hueRotation: 180 })`, verifies 180, other values unchanged |
| COL-031 | sets hueRotation to max value 360 | `setAdjustments({ hueRotation: 360 })`, verifies 360 |
| COL-032 | reset restores hueRotation to default | Sets 270, resets, verifies 0 |
| COL-033 | setAdjustments with NaN hueRotation falls back to default | NaN input sanitized to 0 |
| COL-036 | setAdjustments with mixed valid and NaN values keeps valid ones | `{ hueRotation: NaN, exposure: 2.5 }` keeps exposure |
| COL-028 | has correct default values | Verifies `DEFAULT_COLOR_ADJUSTMENTS.hueRotation === 0` |

### ViewerRenderingUtils Unit Tests (Existing)
**File**: `src/ui/components/ViewerRenderingUtils.test.ts`

| ID | Test Name | Description |
|----|-----------|-------------|
| VRU-HR-01 | should build hue rotation filter | `hueRotation: 180` produces `hue-rotate(180.0deg)` |
| VRU-HR-02 | should not include hue rotation filter when value is 0 | `hueRotation: 0` produces `none` |
| VRU-HR-03 | should normalize hue rotation of 360 to 0 (no filter) | `hueRotation: 360` produces `none` |
| VRU-HR-04 | should normalize negative hue rotation to equivalent positive value | `hueRotation: -90` produces `hue-rotate(270.0deg)` |
| VRU-HR-05 | should normalize hue rotation > 360 by wrapping | `hueRotation: 450` produces `hue-rotate(90.0deg)` |
| VRU-HR-06 | should handle NaN hue rotation gracefully (no filter) | NaN falls back to 0, produces `none` |

### HueRotation Math Unit Tests (To Implement)
**File**: `src/color/HueRotation.test.ts`

| ID | Test Name | Description |
|----|-----------|-------------|
| HRM-001 | buildHueRotationMatrix returns Float32Array of length 9 | Type and length check |
| HRM-002 | identity at 0 degrees | Matrix equals identity `[1,0,0, 0,1,0, 0,0,1]` |
| HRM-003 | identity at 360 degrees | Matrix equals identity (within epsilon) |
| HRM-004 | preserves luminance at 90 degrees | `Wr*R'+Wg*G'+Wb*B' === Wr*R+Wg*G+Wb*B` for test pixel |
| HRM-005 | preserves luminance at 180 degrees | Same luminance check at 180 |
| HRM-006 | preserves luminance at 270 degrees | Same luminance check at 270 |
| HRM-007 | preserves luminance for arbitrary angle (137 degrees) | Luminance check for non-round angle |
| HRM-008 | preserves neutral gray | `(0.5, 0.5, 0.5)` maps to `(0.5, 0.5, 0.5)` for any angle |
| HRM-009 | preserves white | `(1, 1, 1)` maps to `(1, 1, 1)` for any angle |
| HRM-010 | preserves black | `(0, 0, 0)` maps to `(0, 0, 0)` for any angle |
| HRM-011 | 120 degrees shifts red toward green | Input `(1,0,0)` produces G > R |
| HRM-012 | 240 degrees shifts red toward blue | Input `(1,0,0)` produces B > R |
| HRM-013 | negative angle equivalent to positive complement | `-90` matches `270` |
| HRM-014 | double rotation composes | `M(a) * M(b) === M(a+b)` within epsilon |
| HRM-015 | matrix row sums equal 1 | Each row sums to 1.0 (grays invariant) |
| HRM-016 | column-major order for WebGL | Verifies `mat[0]=m00, mat[1]=m10, mat[2]=m20` layout |
| HRM-017 | applyHueRotation clamps output to [0,1] | Extreme rotation does not exceed valid range |
| HRM-018 | isIdentityHueRotation returns true for 0 | Identity check |
| HRM-019 | isIdentityHueRotation returns true for 360 | Identity check wrapping |
| HRM-020 | isIdentityHueRotation returns false for 180 | Non-identity check |

```typescript
// Example test implementations:

import { describe, it, expect } from 'vitest';
import {
  buildHueRotationMatrix,
  applyHueRotation,
  isIdentityHueRotation,
} from './HueRotation';

const Wr = 0.2126;
const Wg = 0.7152;
const Wb = 0.0722;
const EPSILON = 1e-6;

function luminance(r: number, g: number, b: number): number {
  return Wr * r + Wg * g + Wb * b;
}

describe('HueRotation', () => {
  describe('buildHueRotationMatrix', () => {
    it('HRM-001: returns Float32Array of length 9', () => {
      const mat = buildHueRotationMatrix(0);
      expect(mat).toBeInstanceOf(Float32Array);
      expect(mat.length).toBe(9);
    });

    it('HRM-002: identity at 0 degrees', () => {
      const mat = buildHueRotationMatrix(0);
      const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      for (let i = 0; i < 9; i++) {
        expect(mat[i]).toBeCloseTo(identity[i], 5);
      }
    });

    it('HRM-003: identity at 360 degrees', () => {
      const mat = buildHueRotationMatrix(360);
      const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      for (let i = 0; i < 9; i++) {
        expect(mat[i]).toBeCloseTo(identity[i], 4);
      }
    });

    it('HRM-004: preserves luminance at 90 degrees', () => {
      const [r, g, b] = [0.8, 0.3, 0.5];
      const [rr, rg, rb] = applyHueRotation(r, g, b, 90);
      expect(luminance(rr, rg, rb)).toBeCloseTo(luminance(r, g, b), 4);
    });

    it('HRM-008: preserves neutral gray', () => {
      for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const [r, g, b] = applyHueRotation(0.5, 0.5, 0.5, angle);
        expect(r).toBeCloseTo(0.5, 4);
        expect(g).toBeCloseTo(0.5, 4);
        expect(b).toBeCloseTo(0.5, 4);
      }
    });

    it('HRM-015: matrix row sums equal 1', () => {
      for (const angle of [0, 30, 90, 180, 270]) {
        const mat = buildHueRotationMatrix(angle);
        // Column-major: row 0 = mat[0], mat[3], mat[6]
        expect(mat[0] + mat[3] + mat[6]).toBeCloseTo(1.0, 5);
        expect(mat[1] + mat[4] + mat[7]).toBeCloseTo(1.0, 5);
        expect(mat[2] + mat[5] + mat[8]).toBeCloseTo(1.0, 5);
      }
    });
  });

  describe('isIdentityHueRotation', () => {
    it('HRM-018: returns true for 0', () => {
      expect(isIdentityHueRotation(0)).toBe(true);
    });

    it('HRM-019: returns true for 360', () => {
      expect(isIdentityHueRotation(360)).toBe(true);
    });

    it('HRM-020: returns false for 180', () => {
      expect(isIdentityHueRotation(180)).toBe(false);
    });
  });
});
```

## Missing Features (Not Implemented)

### WebGL Luminance-Preserving Pipeline
The current CSS `hue-rotate()` filter does not match OpenRV's luminance-preserving behavior. When a WebGL rendering pipeline is implemented, the CSS filter path should be replaced with the `mat3` shader approach described above.

### Keyboard Shortcut
No keyboard shortcut is currently registered for hue rotation. The proposed `Shift+U` shortcut should be registered in `KeyboardManager` and connected to focus/toggle behavior for the hue rotation slider.

### Radians API
OpenRV uses radians internally. An optional `setHueRotationRadians(rad)` API method could be added for scripting compatibility, converting via `degrees = rad * 180 / Math.PI`.

### Hue Rotation Presets
Quick-access presets for common rotations (90, 120, 180, 240, 270 degrees) could be added as buttons alongside the slider for efficient color grading workflows.

## References

- Component: `/Users/lifeart/Repos/openrv-web/src/ui/components/ColorControls.ts`
- Filter Builder: `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.ts`
- Public API: `/Users/lifeart/Repos/openrv-web/src/api/ColorAPI.ts`
- Unit Tests (ColorControls): `/Users/lifeart/Repos/openrv-web/src/ui/components/ColorControls.test.ts`
- Unit Tests (Filter String): `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.test.ts`
- E2E Tests: `/Users/lifeart/Repos/openrv-web/e2e/hue-rotation.spec.ts`
- Color Correction Feature: `/Users/lifeart/Repos/openrv-web/features/color-correction.md`
