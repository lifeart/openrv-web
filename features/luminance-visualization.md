# Luminance Visualization Modes

## Overview

This feature adds advanced luminance visualization modes to complement the existing False Color display (Standard/ARRI/RED presets). These modes provide alternative ways to analyze image luminance, each suited to different production workflows.

**Existing implementation** (see `/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts`):
- False Color with Standard, ARRI, and RED presets (fully implemented)
- Zebra Stripes with configurable IRE thresholds (fully implemented)
- Clipping Indicators for highlight/shadow detection (fully implemented)

**New modes specified here** (referenced as missing in `/Users/lifeart/Repos/openrv-web/features/hdr-display.md` section "Luminance Visualization Modes"):
- HSV Visualization
- Random Colorization
- Contour Visualization (with configurable spacing)
- Quick Toggle between all visualization modes

## Original OpenRV Reference

From the OpenRV documentation, the **Luminance LUTs** section describes:
- **HSV visualization**: Maps pixel luminance through the HSV color wheel for perceptual analysis
- **Random colorization**: Assigns random distinct colors to luminance bands for identifying value boundaries
- **Contour visualization**: Renders iso-luminance contour lines for depth/shadow analysis

These were part of OpenRV's floating-point LUT pipeline and are not yet implemented in the web version.

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [ ] Fully implemented

## Feature Specification

### 1. HSV Visualization

Maps each pixel's luminance to a hue on the HSV color wheel while preserving full saturation and value. This provides a smooth, perceptually continuous mapping where small luminance differences produce visible hue shifts, making it easier to detect subtle gradations than with banded false color.

**Luminance-to-Hue Mapping**:
- Luminance 0 (black) maps to hue 0 degrees (red)
- Luminance 0.5 (mid-grey) maps to hue 180 degrees (cyan)
- Luminance 1.0 (white) maps to hue 300 degrees (magenta)
- Mapping wraps through the rainbow: red -> yellow -> green -> cyan -> blue -> magenta
- Saturation fixed at 1.0 for maximum visibility
- Value (brightness) fixed at 1.0 so all hues are equally visible

**Use Cases**:
- Detecting subtle luminance gradients in shadow regions
- Verifying smooth lighting falloff
- Identifying banding artifacts in compressed content
- Checking uniformity in greenscreen/bluescreen backgrounds

### 2. Random Colorization

Assigns a distinct, randomly-generated (but deterministic) color to each of N luminance bands. Unlike false color which uses a meaningful gradient, random colorization uses maximally-contrasting colors so that adjacent luminance bands are always visually distinct, making boundaries between zones immediately obvious.

**Band Configuration**:
- Default: 16 bands (each covering ~16 luminance values out of 256)
- Configurable: 4 to 64 bands
- Colors generated from a seeded PRNG for deterministic output (same seed always produces same palette)
- Default seed: 42
- Adjacent bands are guaranteed to have a minimum color distance (delta-E > 30)

**Use Cases**:
- Identifying distinct luminance zones in a scene
- Checking for posterization or quantization artifacts
- Verifying even lighting distribution on surfaces
- Quick visual segmentation of an image by brightness

### 3. Contour Visualization

Renders iso-luminance contour lines overlaid on the original image, similar to topographic elevation maps. Pixels at luminance boundaries are drawn as lines; all other pixels show the original image (optionally desaturated for clarity).

**Contour Rendering**:
- Detects luminance boundaries using the Sobel operator on the luminance channel
- Contour lines are drawn at evenly-spaced luminance levels
- Default: 10 contour levels (at luminance 0.1, 0.2, 0.3, ..., 0.9)
- Configurable: 2 to 50 contour levels
- Line color: white with black outline (1px) for visibility on any background
- Line thickness: 1 pixel (screen space)
- Optional: desaturate underlying image to 50% to improve contour readability

**Contour Detection Method**:
- Compute luminance: `L = 0.2126 * R + 0.7152 * G + 0.0722 * B` (Rec. 709)
- Quantize luminance to N levels: `Q = floor(L * N) / N`
- Detect edges where adjacent pixels have different quantized levels
- Draw contour line pixels using the Sobel gradient magnitude as line intensity

**Use Cases**:
- Analyzing depth and shadow structure
- Checking lighting contours for cinematography
- Verifying smooth vs. harsh light transitions
- Identifying noise in flat-lit areas (contour lines will be noisy)

### 4. Configurable Contour Spacing

The contour visualization mode supports user-adjustable contour level count:
- **Slider control**: 2 to 50 levels
- **Preset shortcuts**: 5, 10, 20, 50 levels
- **Real-time update**: Contour lines re-render as the slider is adjusted
- **Label display**: Shows current level count (e.g., "10 levels")
- Fewer levels = wider bands, coarser analysis
- More levels = finer bands, reveals subtle gradients

### 5. Toggle Between Modes

A unified visualization mode selector allows quick switching between all luminance analysis modes (including the existing false color and the new modes).

**Mode List** (in selector order):
1. **Off** - Normal image display (no visualization)
2. **False Color** - Existing false color with Standard/ARRI/RED presets
3. **HSV** - HSV color wheel mapping
4. **Random Color** - Random colorization bands
5. **Contour** - Iso-luminance contour overlay

**Switching Behavior**:
- Only one visualization mode can be active at a time
- Switching from one mode to another disables the previous mode
- Turning off visualization restores the original image
- Each mode remembers its own settings (e.g., contour levels, random band count)
- The mode selector replaces the current false color toggle, integrating all modes

## UI/UX Specification

### Visualization Mode Selector

- **Location**: View tab, replaces current "False Color" dropdown
- **Widget**: Dropdown menu with mode list and sub-options
- **Keyboard Shortcut**: `Shift+Alt+V` cycles through modes (Off -> False Color -> HSV -> Random Color -> Contour -> Off)
- **data-testid**: `luminance-vis-selector`

```
+-------------------------------------------+
| Visualization: [Off          v]           |
+-------------------------------------------+
| Options:                                  |
|   Off                                     |
|   False Color  [Standard v]              |
|   HSV                                     |
|   Random Color [16 bands  v]             |
|   Contour      [10 levels ---|---]       |
+-------------------------------------------+
```

### Mode-Specific Controls

#### False Color Sub-Controls
- **Preset dropdown**: Standard / ARRI / RED
- **data-testid**: `false-color-preset-select`
- (No change from existing implementation)

#### HSV Sub-Controls
- No additional controls (the mapping is fixed)
- **Legend**: Rainbow gradient bar showing luminance-to-hue mapping
- **data-testid**: `hsv-legend`

#### Random Color Sub-Controls
- **Band count slider**: 4 to 64 (default 16)
- **data-testid**: `random-color-band-slider`
- **Band count label**: Shows current count
- **data-testid**: `random-color-band-label`
- **Reseed button**: Generates a new random palette
- **data-testid**: `random-color-reseed-btn`

#### Contour Sub-Controls
- **Level count slider**: 2 to 50 (default 10)
- **data-testid**: `contour-level-slider`
- **Level count label**: Shows current count
- **data-testid**: `contour-level-label`
- **Preset buttons**: 5 / 10 / 20 / 50
- **data-testid**: `contour-preset-5`, `contour-preset-10`, `contour-preset-20`, `contour-preset-50`
- **Desaturate toggle**: Reduces underlying image saturation for clarity
- **data-testid**: `contour-desaturate-toggle`
- **Line color picker**: White (default), black, red, green, yellow, custom
- **data-testid**: `contour-line-color`

### Mode Indicator

When any visualization mode is active, a small indicator badge appears on the canvas:
- **Position**: Top-left corner, below any existing overlays
- **Text**: Mode name (e.g., "HSV", "Contour (10)", "Random (16)")
- **Style**: Semi-transparent dark background, white text, 12px font
- **data-testid**: `luminance-vis-badge`

### All data-testid Attributes

| Element | data-testid |
|---------|-------------|
| Mode selector dropdown | `luminance-vis-selector` |
| Mode option: Off | `luminance-vis-off` |
| Mode option: False Color | `luminance-vis-false-color` |
| Mode option: HSV | `luminance-vis-hsv` |
| Mode option: Random Color | `luminance-vis-random` |
| Mode option: Contour | `luminance-vis-contour` |
| HSV legend bar | `hsv-legend` |
| Random color band slider | `random-color-band-slider` |
| Random color band label | `random-color-band-label` |
| Random color reseed button | `random-color-reseed-btn` |
| Contour level slider | `contour-level-slider` |
| Contour level label | `contour-level-label` |
| Contour preset: 5 | `contour-preset-5` |
| Contour preset: 10 | `contour-preset-10` |
| Contour preset: 20 | `contour-preset-20` |
| Contour preset: 50 | `contour-preset-50` |
| Contour desaturate toggle | `contour-desaturate-toggle` |
| Contour line color picker | `contour-line-color` |
| Active mode badge | `luminance-vis-badge` |

## Technical Implementation

### State Interface

```typescript
// /Users/lifeart/Repos/openrv-web/src/ui/components/LuminanceVisualization.ts

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export type LuminanceVisMode = 'off' | 'false-color' | 'hsv' | 'random-color' | 'contour';

export interface LuminanceVisState {
  mode: LuminanceVisMode;
  // False color settings (delegates to existing FalseColor component)
  falseColorPreset: 'standard' | 'arri' | 'red' | 'custom';
  // Random colorization settings
  randomBandCount: number;    // 4-64, default 16
  randomSeed: number;         // default 42
  // Contour settings
  contourLevels: number;      // 2-50, default 10
  contourDesaturate: boolean; // default true
  contourLineColor: [number, number, number]; // RGB, default [255, 255, 255]
}

export interface LuminanceVisEvents extends EventMap {
  stateChanged: LuminanceVisState;
  modeChanged: LuminanceVisMode;
}

export const DEFAULT_LUMINANCE_VIS_STATE: LuminanceVisState = {
  mode: 'off',
  falseColorPreset: 'standard',
  randomBandCount: 16,
  randomSeed: 42,
  contourLevels: 10,
  contourDesaturate: true,
  contourLineColor: [255, 255, 255],
};
```

### Class API

```typescript
export class LuminanceVisualization extends EventEmitter<LuminanceVisEvents> {
  private state: LuminanceVisState;
  private falseColor: FalseColor;
  private hsvLUT: Uint8Array;        // 256 * 3 pre-computed HSV->RGB LUT
  private randomLUT: Uint8Array;     // 256 * 3 pre-computed random color LUT

  constructor(falseColor: FalseColor);

  // Mode control
  setMode(mode: LuminanceVisMode): void;
  getMode(): LuminanceVisMode;
  cycleMode(): void;  // Off -> FalseColor -> HSV -> Random -> Contour -> Off

  // Random color settings
  setRandomBandCount(count: number): void;
  reseedRandom(): void;

  // Contour settings
  setContourLevels(levels: number): void;
  setContourDesaturate(enabled: boolean): void;
  setContourLineColor(color: [number, number, number]): void;

  // Apply visualization to ImageData (CPU path)
  apply(imageData: ImageData): void;

  // State
  getState(): LuminanceVisState;
  dispose(): void;
}
```

### GLSL Shader Code

All three new modes are implemented as fragment shader functions that can be selected via a uniform integer. These integrate into the existing shader pipeline in `/Users/lifeart/Repos/openrv-web/src/render/Renderer.ts`, applied after color adjustments but before final output.

#### Shared: Luminance Calculation

```glsl
// Already exists in Renderer.ts
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float getLuminance(vec3 color) {
  return dot(color, LUMA);
}
```

#### HSV Visualization Shader

```glsl
// Uniform: u_lumVisMode (int) - 0=off, 1=false-color, 2=hsv, 3=random, 4=contour

// HSV to RGB conversion (standard algorithm)
vec3 hsv2rgb(vec3 hsv) {
  float h = hsv.x * 6.0;  // hue sector [0, 6)
  float s = hsv.y;
  float v = hsv.z;

  float c = v * s;                    // chroma
  float x = c * (1.0 - abs(mod(h, 2.0) - 1.0));
  float m = v - c;

  vec3 rgb;
  if (h < 1.0)      rgb = vec3(c, x, 0.0);
  else if (h < 2.0) rgb = vec3(x, c, 0.0);
  else if (h < 3.0) rgb = vec3(0.0, c, x);
  else if (h < 4.0) rgb = vec3(0.0, x, c);
  else if (h < 5.0) rgb = vec3(x, 0.0, c);
  else               rgb = vec3(c, 0.0, x);

  return rgb + m;
}

// Map luminance to HSV color wheel
vec3 applyHSVVisualization(vec3 color) {
  float lum = clamp(getLuminance(color), 0.0, 1.0);
  // Map luminance 0..1 to hue 0..0.833 (red -> magenta, excluding full wrap)
  float hue = lum * (300.0 / 360.0);
  return hsv2rgb(vec3(hue, 1.0, 1.0));
}
```

#### Random Colorization Shader

```glsl
// Uniforms:
//   uniform int u_randomBandCount;   // 4-64
//   uniform sampler2D u_randomLUT;   // 1D texture with random colors (64 entries)

// Simple hash function for deterministic pseudo-random color generation
// Used when LUT texture is not available (fallback)
vec3 hashColor(float band) {
  // Three independent hashes to generate R, G, B
  float r = fract(sin(band * 127.1 + 311.7) * 43758.5453);
  float g = fract(sin(band * 269.5 + 183.3) * 43758.5453);
  float b = fract(sin(band * 419.2 + 371.9) * 43758.5453);
  // Boost saturation by pushing away from grey
  vec3 c = vec3(r, g, b);
  c = normalize(c - 0.5) * 0.5 + 0.5;  // push toward saturated colors
  return clamp(c, 0.0, 1.0);
}

vec3 applyRandomColorization(vec3 color, int bandCount) {
  float lum = clamp(getLuminance(color), 0.0, 1.0);
  float band = floor(lum * float(bandCount));
  band = min(band, float(bandCount - 1));  // clamp to valid range
  return hashColor(band);
}

// Preferred path: LUT-based random colorization (pre-computed on CPU for quality)
vec3 applyRandomColorizationLUT(vec3 color, int bandCount, sampler2D lutTex) {
  float lum = clamp(getLuminance(color), 0.0, 1.0);
  float band = floor(lum * float(bandCount));
  band = min(band, float(bandCount - 1));
  float u = (band + 0.5) / 64.0;  // 64-entry texture
  return texture(lutTex, vec2(u, 0.5)).rgb;
}
```

#### Contour Visualization Shader

```glsl
// Uniforms:
//   uniform int u_contourLevels;         // 2-50
//   uniform bool u_contourDesaturate;    // desaturate background
//   uniform vec3 u_contourLineColor;     // line color (default white)
//   uniform vec2 u_texelSize;            // 1.0 / textureSize

float quantizeLuminance(float lum, int levels) {
  return floor(lum * float(levels)) / float(levels);
}

vec3 applyContourVisualization(
  vec3 color,
  vec2 texCoord,
  sampler2D tex,
  int levels,
  bool desaturate,
  vec3 lineColor,
  vec2 texelSize
) {
  // Compute luminance at current pixel and 4 neighbors
  float lumC = getLuminance(color);
  float lumL = getLuminance(texture(tex, texCoord + vec2(-texelSize.x, 0.0)).rgb);
  float lumR = getLuminance(texture(tex, texCoord + vec2( texelSize.x, 0.0)).rgb);
  float lumU = getLuminance(texture(tex, texCoord + vec2(0.0,  texelSize.y)).rgb);
  float lumD = getLuminance(texture(tex, texCoord + vec2(0.0, -texelSize.y)).rgb);

  // Quantize all to contour levels
  float qC = quantizeLuminance(lumC, levels);
  float qL = quantizeLuminance(lumL, levels);
  float qR = quantizeLuminance(lumR, levels);
  float qU = quantizeLuminance(lumU, levels);
  float qD = quantizeLuminance(lumD, levels);

  // Detect contour: current pixel's quantized level differs from any neighbor
  bool isContour = (qC != qL) || (qC != qR) || (qC != qU) || (qC != qD);

  // Compute Sobel gradient magnitude for line intensity
  float gx = (lumR - lumL);
  float gy = (lumU - lumD);
  float gradient = length(vec2(gx, gy));
  float lineIntensity = clamp(gradient * float(levels) * 2.0, 0.0, 1.0);

  // Background: optionally desaturate
  vec3 bg = color;
  if (desaturate) {
    float lum = getLuminance(color);
    bg = mix(vec3(lum), color, 0.5);  // 50% desaturation
  }

  // Composite: contour line over background
  if (isContour) {
    // Black outline for visibility
    float outlineAlpha = lineIntensity * 0.6;
    vec3 outlined = mix(bg, vec3(0.0), outlineAlpha);
    // Main line color
    return mix(outlined, lineColor, lineIntensity * 0.9);
  }

  return bg;
}
```

#### Main Shader Integration

```glsl
// Add to the main() function in Renderer.ts fragment shader, after color adjustments:

// Luminance visualization modes
// uniform int u_lumVisMode;         // 0=off, 1=false-color, 2=hsv, 3=random, 4=contour
// uniform int u_randomBandCount;    // for random mode
// uniform int u_contourLevels;      // for contour mode
// uniform bool u_contourDesaturate; // for contour mode
// uniform vec3 u_contourLineColor;  // for contour mode
// uniform vec2 u_texelSize;         // for contour mode

if (u_lumVisMode == 2) {
  // HSV visualization
  color.rgb = applyHSVVisualization(color.rgb);
} else if (u_lumVisMode == 3) {
  // Random colorization
  color.rgb = applyRandomColorization(color.rgb, u_randomBandCount);
} else if (u_lumVisMode == 4) {
  // Contour visualization
  color.rgb = applyContourVisualization(
    color.rgb, v_texCoord, u_texture,
    u_contourLevels, u_contourDesaturate,
    u_contourLineColor, u_texelSize
  );
}
// Note: u_lumVisMode == 1 (false-color) is handled by the existing FalseColor LUT path
```

### CPU Fallback Implementation

For the CPU rendering path in `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.ts`, each mode needs a TypeScript implementation that operates on `ImageData`:

#### HSV Visualization (CPU)

```typescript
function applyHSVVisualization(imageData: ImageData): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Map luminance to hue (0..300 degrees)
    const hue = Math.min(lum, 1.0) * 300;
    const [outR, outG, outB] = hsvToRgb(hue / 360, 1.0, 1.0);
    data[i] = Math.round(outR * 255);
    data[i + 1] = Math.round(outG * 255);
    data[i + 2] = Math.round(outB * 255);
  }
}
```

#### Random Colorization (CPU)

```typescript
function buildRandomPalette(bandCount: number, seed: number): Uint8Array {
  const lut = new Uint8Array(bandCount * 3);
  // Seeded PRNG (mulberry32)
  let s = seed | 0;
  function rand(): number {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  for (let i = 0; i < bandCount; i++) {
    lut[i * 3] = Math.round(rand() * 255);
    lut[i * 3 + 1] = Math.round(rand() * 255);
    lut[i * 3 + 2] = Math.round(rand() * 255);
  }
  return lut;
}

function applyRandomColorization(imageData: ImageData, bandCount: number, palette: Uint8Array): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const band = Math.min(Math.floor(lum * bandCount), bandCount - 1);
    data[i] = palette[band * 3]!;
    data[i + 1] = palette[band * 3 + 1]!;
    data[i + 2] = palette[band * 3 + 2]!;
  }
}
```

#### Contour Visualization (CPU)

```typescript
function applyContourVisualization(
  imageData: ImageData,
  levels: number,
  desaturate: boolean,
  lineColor: [number, number, number]
): void {
  const { data, width, height } = imageData;

  // Pre-compute luminance for all pixels
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    lum[i] = (0.2126 * data[idx]! + 0.7152 * data[idx + 1]! + 0.0722 * data[idx + 2]!) / 255;
  }

  // Quantize and detect contours
  const quantize = (v: number) => Math.floor(v * levels) / levels;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const idx = i * 4;
      const qC = quantize(lum[i]!);

      let isContour = false;
      if (x > 0 && quantize(lum[i - 1]!) !== qC) isContour = true;
      if (x < width - 1 && quantize(lum[i + 1]!) !== qC) isContour = true;
      if (y > 0 && quantize(lum[i - width]!) !== qC) isContour = true;
      if (y < height - 1 && quantize(lum[i + width]!) !== qC) isContour = true;

      if (desaturate && !isContour) {
        const l = lum[i]! * 255;
        data[idx] = Math.round((data[idx]! + l) / 2);
        data[idx + 1] = Math.round((data[idx + 1]! + l) / 2);
        data[idx + 2] = Math.round((data[idx + 2]! + l) / 2);
      }

      if (isContour) {
        data[idx] = lineColor[0];
        data[idx + 1] = lineColor[1];
        data[idx + 2] = lineColor[2];
      }
    }
  }
}
```

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `src/ui/components/LuminanceVisualization.ts` | Main component: state management, mode switching, CPU apply methods |
| `src/ui/components/LuminanceVisualization.test.ts` | Unit tests (vitest) |
| `src/render/shaders/luminance-vis.glsl` | GLSL shader functions (HSV, random, contour) |
| `e2e/luminance-visualization.spec.ts` | E2E tests (Playwright) |

### Modified Files

| File | Changes |
|------|---------|
| `src/ui/components/FalseColor.ts` | No changes (delegated to by LuminanceVisualization) |
| `src/render/Renderer.ts` | Add luminance vis uniforms and shader integration |
| `src/ui/components/ViewerRenderingUtils.ts` | Add CPU fallback calls for new modes |
| `e2e/fixtures.ts` | Add `LuminanceVisState` interface and `getLuminanceVisState` helper |

## E2E Test Cases (Playwright)

### Mode Switching Tests

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| LV-E001 | All visualization modes start off | Load video, check state | mode = 'off' |
| LV-E002 | Shift+Alt+V cycles through modes | Press Shift+Alt+V repeatedly | Off -> False Color -> HSV -> Random -> Contour -> Off |
| LV-E003 | Selecting HSV changes canvas | Select HSV mode | Canvas visuals change to rainbow hue mapping |
| LV-E004 | Selecting Random changes canvas | Select Random mode | Canvas shows distinct color bands |
| LV-E005 | Selecting Contour changes canvas | Select Contour mode | Canvas shows contour lines overlaid on image |
| LV-E006 | Switching modes disables previous | Enable HSV, then switch to Contour | HSV effect removed, contour effect visible |
| LV-E007 | Off mode restores original image | Enable any mode, then select Off | Canvas returns to original appearance |

### HSV Mode Tests

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| LV-E010 | HSV mode produces rainbow output | Enable HSV, capture screenshot | Image shows hue-mapped luminance |
| LV-E011 | HSV legend is visible | Enable HSV mode | Rainbow legend bar visible |
| LV-E012 | HSV persists across frame changes | Enable HSV, navigate frames | HSV effect still active after frame change |

### Random Colorization Tests

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| LV-E020 | Random mode shows colored bands | Enable Random mode | Image shows distinct color regions |
| LV-E021 | Band count slider changes bands | Adjust band slider to 8 | Fewer, wider color bands visible |
| LV-E022 | Reseed produces different colors | Click reseed button | Color palette changes |
| LV-E023 | Band count persists in state | Set bands to 32, read state | state.randomBandCount = 32 |

### Contour Mode Tests

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| LV-E030 | Contour mode shows lines | Enable Contour mode | Lines visible on luminance boundaries |
| LV-E031 | Level slider changes contour density | Set levels to 5 | Fewer contour lines visible |
| LV-E032 | Level slider changes contour density (high) | Set levels to 30 | Many contour lines visible |
| LV-E033 | Desaturate toggle works | Toggle desaturate off | Background image returns to full color |
| LV-E034 | Preset buttons set levels | Click "20" preset button | Levels set to 20, contour density changes |
| LV-E035 | Contour level count persists | Set levels to 25, read state | state.contourLevels = 25 |

### UI Controls Tests

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| LV-E040 | Mode selector exists in View tab | Go to View tab | Selector with data-testid="luminance-vis-selector" visible |
| LV-E041 | Mode badge shows current mode | Enable HSV mode | Badge shows "HSV" text |
| LV-E042 | Mode badge hidden when off | Set mode to Off | No badge visible |
| LV-E043 | Sub-controls appear for active mode | Select Contour mode | Level slider and presets become visible |
| LV-E044 | Sub-controls hide for inactive mode | Switch from Contour to HSV | Level slider disappears, HSV legend appears |

### State Persistence Tests

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| LV-E050 | Mode persists across tab switches | Enable HSV, switch to Color tab, switch back | HSV still active |
| LV-E051 | Settings persist when switching modes | Set random bands to 32, switch to HSV, switch back to Random | Band count still 32 |
| LV-E052 | Mode persists across frame changes | Enable Contour, navigate frames | Contour still active |

### Integration Tests

| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| LV-E060 | Exposure affects visualization | Enable HSV, change exposure to +2 | HSV colors shift (brighter luminance = different hues) |
| LV-E061 | Visualization works with zebras disabled | Enable HSV, verify zebras off | HSV renders without zebra interference |
| LV-E062 | Switching to false color uses existing presets | Select False Color mode, check preset | Standard preset active with existing palette |

### E2E Test Implementation

```typescript
// /Users/lifeart/Repos/openrv-web/e2e/luminance-visualization.spec.ts

import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  captureCanvasState,
  verifyCanvasChanged,
} from './fixtures';

// Helper to get luminance visualization state
async function getLuminanceVisState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    return (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.getState();
  });
}

test.describe('Luminance Visualization - Mode Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('LV-E001: all visualization modes start off', async ({ page }) => {
    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('off');
  });

  test('LV-E002: Shift+Alt+V cycles through modes', async ({ page }) => {
    const expectedModes = ['false-color', 'hsv', 'random-color', 'contour', 'off'];

    for (const expectedMode of expectedModes) {
      await page.keyboard.press('Shift+Alt+v');
      await page.waitForTimeout(100);
      const state = await getLuminanceVisState(page);
      expect(state.mode).toBe(expectedMode);
    }
  });

  test('LV-E003: selecting HSV changes canvas', async ({ page }) => {
    const before = await captureCanvasState(page);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('hsv');
    });
    await page.waitForTimeout(200);

    const after = await captureCanvasState(page);
    expect(verifyCanvasChanged(before, after)).toBe(true);
  });

  test('LV-E004: selecting Random changes canvas', async ({ page }) => {
    const before = await captureCanvasState(page);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('random-color');
    });
    await page.waitForTimeout(200);

    const after = await captureCanvasState(page);
    expect(verifyCanvasChanged(before, after)).toBe(true);
  });

  test('LV-E005: selecting Contour changes canvas', async ({ page }) => {
    const before = await captureCanvasState(page);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('contour');
    });
    await page.waitForTimeout(200);

    const after = await captureCanvasState(page);
    expect(verifyCanvasChanged(before, after)).toBe(true);
  });

  test('LV-E006: switching modes disables previous', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('hsv');
    });
    await page.waitForTimeout(100);
    const hsvState = await captureCanvasState(page);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('contour');
    });
    await page.waitForTimeout(200);
    const contourState = await captureCanvasState(page);

    expect(verifyCanvasChanged(hsvState, contourState)).toBe(true);

    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('contour');
  });

  test('LV-E007: Off mode restores original image', async ({ page }) => {
    const original = await captureCanvasState(page);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('hsv');
    });
    await page.waitForTimeout(200);

    const withHSV = await captureCanvasState(page);
    expect(verifyCanvasChanged(original, withHSV)).toBe(true);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('off');
    });
    await page.waitForTimeout(200);

    const restored = await captureCanvasState(page);
    expect(verifyCanvasChanged(withHSV, restored)).toBe(true);
  });
});

test.describe('Luminance Visualization - Random Colorization Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('random-color');
    });
    await page.waitForTimeout(100);
  });

  test('LV-E021: band count slider changes bands', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setRandomBandCount(8);
    });
    await page.waitForTimeout(100);

    const state = await getLuminanceVisState(page);
    expect(state.randomBandCount).toBe(8);
  });

  test('LV-E022: reseed produces different colors', async ({ page }) => {
    const before = await captureCanvasState(page);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.reseedRandom();
    });
    await page.waitForTimeout(200);

    const after = await captureCanvasState(page);
    expect(verifyCanvasChanged(before, after)).toBe(true);
  });

  test('LV-E023: band count persists in state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setRandomBandCount(32);
    });
    await page.waitForTimeout(100);

    const state = await getLuminanceVisState(page);
    expect(state.randomBandCount).toBe(32);
  });
});

test.describe('Luminance Visualization - Contour Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('contour');
    });
    await page.waitForTimeout(100);
  });

  test('LV-E031: level slider changes contour density', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setContourLevels(5);
    });
    await page.waitForTimeout(100);

    const state = await getLuminanceVisState(page);
    expect(state.contourLevels).toBe(5);
  });

  test('LV-E033: desaturate toggle works', async ({ page }) => {
    const state = await getLuminanceVisState(page);
    expect(state.contourDesaturate).toBe(true);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setContourDesaturate(false);
    });
    await page.waitForTimeout(100);

    const updated = await getLuminanceVisState(page);
    expect(updated.contourDesaturate).toBe(false);
  });

  test('LV-E035: contour level count persists', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setContourLevels(25);
    });
    await page.waitForTimeout(100);

    const state = await getLuminanceVisState(page);
    expect(state.contourLevels).toBe(25);
  });
});

test.describe('Luminance Visualization - UI Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('LV-E040: mode selector exists in View tab', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const selector = page.locator('[data-testid="luminance-vis-selector"]');
    await expect(selector).toBeVisible();
  });

  test('LV-E041: mode badge shows current mode', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('hsv');
    });
    await page.waitForTimeout(200);

    const badge = page.locator('[data-testid="luminance-vis-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('HSV');
  });

  test('LV-E042: mode badge hidden when off', async ({ page }) => {
    const badge = page.locator('[data-testid="luminance-vis-badge"]');
    await expect(badge).not.toBeVisible();
  });
});

test.describe('Luminance Visualization - State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('LV-E050: mode persists across tab switches', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('hsv');
    });
    await page.waitForTimeout(100);

    // Switch tabs
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('hsv');
  });

  test('LV-E051: settings persist when switching modes', async ({ page }) => {
    // Set random bands to 32
    await page.evaluate(() => {
      const lv = (window as any).__OPENRV_TEST__?.app?.luminanceVisualization;
      lv?.setMode('random-color');
      lv?.setRandomBandCount(32);
    });
    await page.waitForTimeout(100);

    // Switch to HSV and back
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('hsv');
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('random-color');
    });
    await page.waitForTimeout(100);

    const state = await getLuminanceVisState(page);
    expect(state.randomBandCount).toBe(32);
  });

  test('LV-E052: mode persists across frame changes', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('contour');
    });
    await page.waitForTimeout(100);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('contour');
  });
});

test.describe('Luminance Visualization - Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('LV-E060: exposure affects visualization', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('hsv');
    });
    await page.waitForTimeout(200);
    const beforeExposure = await captureCanvasState(page);

    // Change exposure
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.colorControls?.setExposure(2.0);
    });
    await page.waitForTimeout(200);

    const afterExposure = await captureCanvasState(page);
    expect(verifyCanvasChanged(beforeExposure, afterExposure)).toBe(true);
  });

  test('LV-E062: switching to false color uses existing presets', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.luminanceVisualization?.setMode('false-color');
    });
    await page.waitForTimeout(100);

    const state = await getLuminanceVisState(page);
    expect(state.mode).toBe('false-color');
    expect(state.falseColorPreset).toBe('standard');
  });
});
```

## Unit Test Cases (vitest)

### Initialization Tests

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| LV-U001 | Default state is off | mode = 'off' |
| LV-U002 | Default random band count is 16 | randomBandCount = 16 |
| LV-U003 | Default contour levels is 10 | contourLevels = 10 |
| LV-U004 | Default contour desaturate is true | contourDesaturate = true |
| LV-U005 | Default contour line color is white | contourLineColor = [255, 255, 255] |
| LV-U006 | Default state matches constant | getState() deep equals DEFAULT_LUMINANCE_VIS_STATE |

### Mode Control Tests

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| LV-U010 | setMode('hsv') changes mode | getMode() = 'hsv' |
| LV-U011 | setMode emits stateChanged | stateChanged event fired with new state |
| LV-U012 | setMode emits modeChanged | modeChanged event fired with new mode |
| LV-U013 | setMode is idempotent | Setting same mode does not emit events |
| LV-U014 | cycleMode goes Off -> FalseColor | After one cycle from off, mode = 'false-color' |
| LV-U015 | cycleMode wraps Contour -> Off | After cycle from contour, mode = 'off' |
| LV-U016 | cycleMode full cycle | 5 cycles returns to 'off' |

### HSV Visualization Tests

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| LV-U020 | HSV: black pixel maps to red hue | RGB output near (255, 0, 0) for lum=0 |
| LV-U021 | HSV: mid-grey maps to cyan hue | RGB output near (0, 255, 255) for lum=0.5 |
| LV-U022 | HSV: white pixel maps to magenta hue | RGB output near (255, 0, 255) for lum=1.0 |
| LV-U023 | HSV: apply does nothing when mode is off | Image unchanged |
| LV-U024 | HSV: alpha channel preserved | Alpha bytes unchanged after apply |
| LV-U025 | HSV: different luminances produce different hues | Gradient input produces multiple distinct colors |

### Random Colorization Tests

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| LV-U030 | Random: same seed produces same palette | Two instances with seed=42 produce identical LUT |
| LV-U031 | Random: different seeds produce different palettes | seed=42 vs seed=99 produce different LUTs |
| LV-U032 | Random: 16 bands quantizes correctly | Luminance 0-15 maps to band 0, 16-31 to band 1, etc. |
| LV-U033 | Random: band count clamps to 4-64 | setRandomBandCount(2) clamps to 4, 100 clamps to 64 |
| LV-U034 | Random: reseed changes output | apply before/after reseed produces different pixels |
| LV-U035 | Random: apply does nothing when mode is off | Image unchanged |
| LV-U036 | Random: pixels in same band get same color | Two pixels with lum in same band have identical output |
| LV-U037 | Random: adjacent bands have different colors | Band N and Band N+1 produce different colors |

### Contour Visualization Tests

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| LV-U040 | Contour: uniform image has no contour lines | Solid color input unchanged (no edges) |
| LV-U041 | Contour: sharp edge produces contour line | Adjacent pixels with different quantized lum get line color |
| LV-U042 | Contour: 10 levels produces lines at 10% intervals | Contour at lum boundaries 0.1, 0.2, ..., 0.9 |
| LV-U043 | Contour: level count clamps to 2-50 | setContourLevels(1) clamps to 2, 100 clamps to 50 |
| LV-U044 | Contour: desaturate reduces saturation | With desaturate=true, non-contour pixels are less saturated |
| LV-U045 | Contour: desaturate=false preserves original color | Non-contour pixels retain original RGB |
| LV-U046 | Contour: custom line color applies | Set lineColor to red, contour pixels are red |
| LV-U047 | Contour: more levels = more contour lines | levels=20 produces more contour pixels than levels=5 |
| LV-U048 | Contour: apply does nothing when mode is off | Image unchanged |
| LV-U049 | Contour: alpha channel preserved | Alpha bytes unchanged after apply |

### State Management Tests

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| LV-U060 | getState returns a copy | Mutating returned state does not affect internal state |
| LV-U061 | setRandomBandCount emits stateChanged | Event contains updated randomBandCount |
| LV-U062 | setContourLevels emits stateChanged | Event contains updated contourLevels |
| LV-U063 | setContourDesaturate emits stateChanged | Event contains updated contourDesaturate |
| LV-U064 | setContourLineColor emits stateChanged | Event contains updated contourLineColor |
| LV-U065 | Settings preserved across mode switches | Set randomBands=32, switch to HSV, switch back, bands still 32 |

### Integration with FalseColor Tests

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| LV-U070 | false-color mode delegates to FalseColor component | FalseColor.apply called when mode is 'false-color' |
| LV-U071 | Switching to false-color enables FalseColor | FalseColor.isEnabled() returns true |
| LV-U072 | Switching away from false-color disables FalseColor | FalseColor.isEnabled() returns false |
| LV-U073 | falseColorPreset updates FalseColor preset | Setting preset to 'arri' calls FalseColor.setPreset('arri') |

### Performance Tests

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| LV-U080 | HSV processes 1920x1080 in < 100ms | apply() completes within time budget |
| LV-U081 | Random processes 1920x1080 in < 100ms | apply() completes within time budget |
| LV-U082 | Contour processes 1920x1080 in < 200ms | apply() completes within time budget (needs neighbor lookups) |
| LV-U083 | HSV LUT is pre-computed (256 entries) | LUT built once at init, not per-pixel |
| LV-U084 | Random LUT is pre-computed | LUT rebuilt only when band count or seed changes |

### Unit Test Implementation

```typescript
// /Users/lifeart/Repos/openrv-web/src/ui/components/LuminanceVisualization.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LuminanceVisualization,
  DEFAULT_LUMINANCE_VIS_STATE,
} from './LuminanceVisualization';
import { FalseColor } from './FalseColor';

// Helper to create test ImageData
function createTestImageData(
  width: number,
  height: number,
  fill?: { r: number; g: number; b: number; a: number }
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill.r;
      data[i + 1] = fill.g;
      data[i + 2] = fill.b;
      data[i + 3] = fill.a;
    }
  }
  return new ImageData(data, width, height);
}

// Helper to create luminance gradient (horizontal)
function createLuminanceGradient(width: number, height: number = 1): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lum = Math.round((x / (width - 1)) * 255);
      const idx = (y * width + x) * 4;
      data[idx] = lum;
      data[idx + 1] = lum;
      data[idx + 2] = lum;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

// Helper to create a sharp-edge test image (left half dark, right half bright)
function createEdgeImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const lum = x < width / 2 ? 50 : 200;
      data[idx] = lum;
      data[idx + 1] = lum;
      data[idx + 2] = lum;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

describe('LuminanceVisualization', () => {
  let lumVis: LuminanceVisualization;
  let falseColor: FalseColor;

  beforeEach(() => {
    falseColor = new FalseColor();
    lumVis = new LuminanceVisualization(falseColor);
  });

  afterEach(() => {
    lumVis.dispose();
    falseColor.dispose();
  });

  describe('initialization', () => {
    it('LV-U001: default state is off', () => {
      expect(lumVis.getMode()).toBe('off');
    });

    it('LV-U002: default random band count is 16', () => {
      expect(lumVis.getState().randomBandCount).toBe(16);
    });

    it('LV-U003: default contour levels is 10', () => {
      expect(lumVis.getState().contourLevels).toBe(10);
    });

    it('LV-U004: default contour desaturate is true', () => {
      expect(lumVis.getState().contourDesaturate).toBe(true);
    });

    it('LV-U005: default contour line color is white', () => {
      expect(lumVis.getState().contourLineColor).toEqual([255, 255, 255]);
    });

    it('LV-U006: default state matches constant', () => {
      expect(lumVis.getState()).toEqual(DEFAULT_LUMINANCE_VIS_STATE);
    });
  });

  describe('mode control', () => {
    it('LV-U010: setMode changes mode', () => {
      lumVis.setMode('hsv');
      expect(lumVis.getMode()).toBe('hsv');
    });

    it('LV-U011: setMode emits stateChanged', () => {
      const handler = vi.fn();
      lumVis.on('stateChanged', handler);

      lumVis.setMode('hsv');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'hsv' })
      );
    });

    it('LV-U012: setMode emits modeChanged', () => {
      const handler = vi.fn();
      lumVis.on('modeChanged', handler);

      lumVis.setMode('contour');

      expect(handler).toHaveBeenCalledWith('contour');
    });

    it('LV-U013: setMode is idempotent', () => {
      lumVis.setMode('hsv');
      const handler = vi.fn();
      lumVis.on('stateChanged', handler);

      lumVis.setMode('hsv');

      expect(handler).not.toHaveBeenCalled();
    });

    it('LV-U014: cycleMode goes Off -> FalseColor', () => {
      lumVis.cycleMode();
      expect(lumVis.getMode()).toBe('false-color');
    });

    it('LV-U015: cycleMode wraps Contour -> Off', () => {
      lumVis.setMode('contour');
      lumVis.cycleMode();
      expect(lumVis.getMode()).toBe('off');
    });

    it('LV-U016: cycleMode full cycle', () => {
      const modes = ['false-color', 'hsv', 'random-color', 'contour', 'off'];
      for (const expected of modes) {
        lumVis.cycleMode();
        expect(lumVis.getMode()).toBe(expected);
      }
    });
  });

  describe('HSV visualization', () => {
    beforeEach(() => {
      lumVis.setMode('hsv');
    });

    it('LV-U020: black pixel maps to red hue region', () => {
      const img = createTestImageData(1, 1, { r: 0, g: 0, b: 0, a: 255 });
      lumVis.apply(img);
      // Hue 0 = red: expect high R, low G, low B
      expect(img.data[0]).toBeGreaterThan(200);
      expect(img.data[1]).toBeLessThan(50);
      expect(img.data[2]).toBeLessThan(50);
    });

    it('LV-U021: mid-grey maps to cyan hue region', () => {
      const img = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 255 });
      lumVis.apply(img);
      // Hue ~180 = cyan: expect low R, high G, high B
      expect(img.data[0]).toBeLessThan(50);
      expect(img.data[1]).toBeGreaterThan(200);
      expect(img.data[2]).toBeGreaterThan(200);
    });

    it('LV-U022: white pixel maps to magenta hue region', () => {
      const img = createTestImageData(1, 1, { r: 255, g: 255, b: 255, a: 255 });
      lumVis.apply(img);
      // Hue ~300 = magenta: expect high R, low G, high B
      expect(img.data[0]).toBeGreaterThan(200);
      expect(img.data[1]).toBeLessThan(50);
      expect(img.data[2]).toBeGreaterThan(200);
    });

    it('LV-U023: apply does nothing when mode is off', () => {
      lumVis.setMode('off');
      const img = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 255 });
      lumVis.apply(img);
      expect(img.data[0]).toBe(128);
      expect(img.data[1]).toBe(128);
      expect(img.data[2]).toBe(128);
    });

    it('LV-U024: alpha channel preserved', () => {
      const img = createTestImageData(1, 1, { r: 100, g: 100, b: 100, a: 200 });
      lumVis.apply(img);
      expect(img.data[3]).toBe(200);
    });

    it('LV-U025: different luminances produce different hues', () => {
      const img = createLuminanceGradient(256);
      lumVis.apply(img);

      const colors = new Set<string>();
      for (let i = 0; i < 256; i++) {
        const idx = i * 4;
        colors.add(`${img.data[idx]},${img.data[idx + 1]},${img.data[idx + 2]}`);
      }
      expect(colors.size).toBeGreaterThan(50);
    });
  });

  describe('random colorization', () => {
    beforeEach(() => {
      lumVis.setMode('random-color');
    });

    it('LV-U030: same seed produces same palette', () => {
      const fc2 = new FalseColor();
      const lv2 = new LuminanceVisualization(fc2);
      lv2.setMode('random-color');

      const img1 = createLuminanceGradient(256);
      const img2 = createLuminanceGradient(256);

      lumVis.apply(img1);
      lv2.apply(img2);

      for (let i = 0; i < img1.data.length; i++) {
        expect(img1.data[i]).toBe(img2.data[i]);
      }

      lv2.dispose();
      fc2.dispose();
    });

    it('LV-U031: different seeds produce different palettes', () => {
      const img1 = createLuminanceGradient(256);
      lumVis.apply(img1);

      lumVis.reseedRandom();
      const img2 = createLuminanceGradient(256);
      lumVis.apply(img2);

      let differences = 0;
      for (let i = 0; i < img1.data.length; i += 4) {
        if (img1.data[i] !== img2.data[i] ||
            img1.data[i + 1] !== img2.data[i + 1] ||
            img1.data[i + 2] !== img2.data[i + 2]) {
          differences++;
        }
      }
      expect(differences).toBeGreaterThan(0);
    });

    it('LV-U033: band count clamps to 4-64', () => {
      lumVis.setRandomBandCount(2);
      expect(lumVis.getState().randomBandCount).toBe(4);

      lumVis.setRandomBandCount(100);
      expect(lumVis.getState().randomBandCount).toBe(64);
    });

    it('LV-U035: apply does nothing when mode is off', () => {
      lumVis.setMode('off');
      const img = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 255 });
      lumVis.apply(img);
      expect(img.data[0]).toBe(128);
      expect(img.data[1]).toBe(128);
      expect(img.data[2]).toBe(128);
    });

    it('LV-U036: pixels in same band get same color', () => {
      lumVis.setRandomBandCount(16);
      // Luminance 10 and 14 both in band 0 (0-15)
      const img1 = createTestImageData(1, 1, { r: 10, g: 10, b: 10, a: 255 });
      const img2 = createTestImageData(1, 1, { r: 14, g: 14, b: 14, a: 255 });
      lumVis.apply(img1);
      lumVis.apply(img2);

      expect(img1.data[0]).toBe(img2.data[0]);
      expect(img1.data[1]).toBe(img2.data[1]);
      expect(img1.data[2]).toBe(img2.data[2]);
    });

    it('LV-U037: adjacent bands have different colors', () => {
      lumVis.setRandomBandCount(16);
      // Band 0: lum 0-15, Band 1: lum 16-31
      const img1 = createTestImageData(1, 1, { r: 8, g: 8, b: 8, a: 255 });
      const img2 = createTestImageData(1, 1, { r: 24, g: 24, b: 24, a: 255 });
      lumVis.apply(img1);
      lumVis.apply(img2);

      const color1 = `${img1.data[0]},${img1.data[1]},${img1.data[2]}`;
      const color2 = `${img2.data[0]},${img2.data[1]},${img2.data[2]}`;
      expect(color1).not.toBe(color2);
    });
  });

  describe('contour visualization', () => {
    beforeEach(() => {
      lumVis.setMode('contour');
    });

    it('LV-U040: uniform image has no contour lines', () => {
      const img = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
      lumVis.apply(img);

      // Interior pixels should remain unchanged (or desaturated, but not contour color)
      // Center pixel (5,5)
      const idx = (5 * 10 + 5) * 4;
      // With desaturate on, grey stays grey
      expect(img.data[idx]).toBe(128);
      expect(img.data[idx + 1]).toBe(128);
      expect(img.data[idx + 2]).toBe(128);
    });

    it('LV-U041: sharp edge produces contour line', () => {
      const img = createEdgeImage(10, 10);
      lumVis.apply(img);

      // The pixel at the edge boundary (x=4 or x=5, center row y=5)
      // should be the contour line color (white by default)
      const edgeIdx = (5 * 10 + 5) * 4; // x=5, right side of edge
      const interiorIdx = (5 * 10 + 8) * 4; // x=8, well inside right side

      // Edge pixel should be line color (white)
      const edgeColor = `${img.data[edgeIdx]},${img.data[edgeIdx + 1]},${img.data[edgeIdx + 2]}`;
      const interiorColor = `${img.data[interiorIdx]},${img.data[interiorIdx + 1]},${img.data[interiorIdx + 2]}`;

      expect(edgeColor).not.toBe(interiorColor);
    });

    it('LV-U043: level count clamps to 2-50', () => {
      lumVis.setContourLevels(1);
      expect(lumVis.getState().contourLevels).toBe(2);

      lumVis.setContourLevels(100);
      expect(lumVis.getState().contourLevels).toBe(50);
    });

    it('LV-U046: custom line color applies', () => {
      lumVis.setContourLineColor([255, 0, 0]);
      expect(lumVis.getState().contourLineColor).toEqual([255, 0, 0]);
    });

    it('LV-U047: more levels = more contour lines', () => {
      const img5 = createLuminanceGradient(256, 3);
      lumVis.setContourLevels(5);
      lumVis.apply(img5);

      let contourPixels5 = 0;
      for (let i = 0; i < img5.data.length; i += 4) {
        if (img5.data[i] === 255 && img5.data[i + 1] === 255 && img5.data[i + 2] === 255) {
          contourPixels5++;
        }
      }

      const img20 = createLuminanceGradient(256, 3);
      lumVis.setContourLevels(20);
      lumVis.apply(img20);

      let contourPixels20 = 0;
      for (let i = 0; i < img20.data.length; i += 4) {
        if (img20.data[i] === 255 && img20.data[i + 1] === 255 && img20.data[i + 2] === 255) {
          contourPixels20++;
        }
      }

      expect(contourPixels20).toBeGreaterThan(contourPixels5);
    });

    it('LV-U048: apply does nothing when mode is off', () => {
      lumVis.setMode('off');
      const img = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
      lumVis.apply(img);
      expect(img.data[0]).toBe(128);
    });

    it('LV-U049: alpha channel preserved', () => {
      const img = createEdgeImage(10, 10);
      // Set alpha to non-255
      for (let i = 3; i < img.data.length; i += 4) {
        img.data[i] = 200;
      }
      lumVis.apply(img);

      for (let i = 3; i < img.data.length; i += 4) {
        expect(img.data[i]).toBe(200);
      }
    });
  });

  describe('state management', () => {
    it('LV-U060: getState returns a copy', () => {
      const state = lumVis.getState();
      state.mode = 'hsv';
      expect(lumVis.getMode()).toBe('off');
    });

    it('LV-U061: setRandomBandCount emits stateChanged', () => {
      const handler = vi.fn();
      lumVis.on('stateChanged', handler);

      lumVis.setRandomBandCount(32);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ randomBandCount: 32 })
      );
    });

    it('LV-U062: setContourLevels emits stateChanged', () => {
      const handler = vi.fn();
      lumVis.on('stateChanged', handler);

      lumVis.setContourLevels(20);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ contourLevels: 20 })
      );
    });

    it('LV-U063: setContourDesaturate emits stateChanged', () => {
      const handler = vi.fn();
      lumVis.on('stateChanged', handler);

      lumVis.setContourDesaturate(false);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ contourDesaturate: false })
      );
    });

    it('LV-U064: setContourLineColor emits stateChanged', () => {
      const handler = vi.fn();
      lumVis.on('stateChanged', handler);

      lumVis.setContourLineColor([255, 0, 0]);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ contourLineColor: [255, 0, 0] })
      );
    });

    it('LV-U065: settings preserved across mode switches', () => {
      lumVis.setMode('random-color');
      lumVis.setRandomBandCount(32);

      lumVis.setMode('hsv');
      lumVis.setMode('random-color');

      expect(lumVis.getState().randomBandCount).toBe(32);
    });
  });

  describe('FalseColor integration', () => {
    it('LV-U070: false-color mode delegates to FalseColor component', () => {
      lumVis.setMode('false-color');

      const img = createTestImageData(1, 1, { r: 0, g: 0, b: 0, a: 255 });
      lumVis.apply(img);

      // Should match FalseColor standard palette for black (purple: 128, 0, 128)
      expect(img.data[0]).toBe(128);
      expect(img.data[1]).toBe(0);
      expect(img.data[2]).toBe(128);
    });

    it('LV-U071: switching to false-color enables FalseColor', () => {
      lumVis.setMode('false-color');
      expect(falseColor.isEnabled()).toBe(true);
    });

    it('LV-U072: switching away from false-color disables FalseColor', () => {
      lumVis.setMode('false-color');
      expect(falseColor.isEnabled()).toBe(true);

      lumVis.setMode('hsv');
      expect(falseColor.isEnabled()).toBe(false);
    });
  });
});
```

## Requirements

- [ ] HSV visualization mode maps luminance to color wheel
- [ ] Random colorization assigns distinct colors to luminance bands
- [ ] Random colorization band count is configurable (4-64)
- [ ] Random colorization uses deterministic seeded PRNG
- [ ] Contour visualization renders iso-luminance contour lines
- [ ] Contour level count is configurable (2-50)
- [ ] Contour supports desaturation of underlying image
- [ ] Contour line color is configurable
- [ ] Mode selector allows quick switching between all visualization modes
- [ ] Only one visualization mode active at a time
- [ ] Keyboard shortcut Shift+Alt+V cycles through modes
- [ ] Mode badge indicator visible when visualization is active
- [ ] Settings persist across mode switches and frame changes
- [ ] GPU shader implementation for all three modes
- [ ] CPU fallback implementation for all three modes
- [ ] Integration with existing FalseColor component for false-color mode
- [ ] Pre-computed LUTs for HSV and Random modes (performance)
- [ ] All data-testid attributes assigned per specification

## Implementation Files Reference

### New Files
- `/Users/lifeart/Repos/openrv-web/src/ui/components/LuminanceVisualization.ts` - Main component
- `/Users/lifeart/Repos/openrv-web/src/ui/components/LuminanceVisualization.test.ts` - Unit tests
- `/Users/lifeart/Repos/openrv-web/src/render/shaders/luminance-vis.glsl` - GLSL shader functions
- `/Users/lifeart/Repos/openrv-web/e2e/luminance-visualization.spec.ts` - E2E tests

### Existing Files (to modify)
- `/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts` - Existing false color (no changes, delegated to)
- `/Users/lifeart/Repos/openrv-web/src/render/Renderer.ts` - Add luminance vis uniforms and shader integration
- `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.ts` - Add CPU fallback path
- `/Users/lifeart/Repos/openrv-web/e2e/fixtures.ts` - Add LuminanceVisState interface and helper

### Existing Test Files (reference)
- `/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.test.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/ZebraStripes.test.ts`
- `/Users/lifeart/Repos/openrv-web/e2e/false-color.spec.ts`
- `/Users/lifeart/Repos/openrv-web/e2e/zebra-stripes.spec.ts`
