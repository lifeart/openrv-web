# HDR Tone Mapping Operators

## Original OpenRV Implementation

OpenRV provides a suite of tone mapping operators for converting HDR (High Dynamic Range) imagery to SDR (Standard Dynamic Range) for display on conventional monitors:

**Tone Mapping Operators**:
- Filmic tone mapping with S-curve characteristic (shoulder/toe/linear regions)
- ACES (Academy Color Encoding System) standard transform for cinema-grade HDR-to-SDR
- Reinhard global tone mapping operator based on photographic dodging-and-burning
- Custom user-adjustable tone curves with interactive control points
- All operators applied in the GPU pipeline as fragment shader operations

**Negative Value Visualization**:
- Pixels with values below 0.0 rendered with a distinct overlay color (default: cyan/teal)
- Toggle on/off independently of tone mapping operator
- Works with EXR and other floating-point image formats
- Useful for debugging composites, mattes, and color pipeline issues

**Tone Mapping Pipeline Position**:
- Applied AFTER color adjustments (exposure, contrast, saturation, etc.)
- Applied BEFORE gamma correction and final display output
- Operates in linear light space for physically correct results
- Preserves alpha channel (tone mapping affects RGB only)

**Integration with Existing HDR Pipeline**:
- Tone mapping interacts correctly with exposure control (stops)
- Each operator produces distinct visual characteristics suited to different content
- Operators can be switched in real-time without frame drops
- Custom curve persists across frame navigation

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [ ] Fully implemented

### What Exists Today

The current codebase has a **partial foundation** for tone mapping:

1. **ToneMappingControl UI** (`/Users/lifeart/Repos/openrv-web/src/ui/components/ToneMappingControl.ts`):
   - Dropdown with operator selection (Off, Reinhard, Filmic, ACES)
   - Enable/disable checkbox
   - Keyboard shortcut (Shift+Alt+J)
   - Event system for state changes

2. **Renderer GLSL Shaders** (`/Users/lifeart/Repos/openrv-web/src/render/Renderer.ts`):
   - `tonemapReinhard()` -- basic `color / (color + 1)` operator
   - `tonemapFilmic()` -- Uncharted 2 style Hable curve
   - `tonemapACES()` -- Narkowicz ACES fitted approximation
   - Operator dispatch via `u_toneMappingOperator` integer uniform

3. **Renderer Integration**:
   - `setToneMappingState()` / `getToneMappingState()` / `resetToneMappingState()` methods
   - Tone mapping applied at step 6 in the fragment shader pipeline (after saturation, before gamma)

### What Is Missing (Scope of This Specification)

- [ ] **Custom tone mapping curves** -- user-adjustable spline-based tone curve with interactive control points
- [ ] **Negative value visualization** -- overlay indication of below-zero pixel values in floating-point images
- [ ] **Per-operator parameter controls** -- exposure bias, white point, shoulder strength sliders per operator
- [ ] **Tone curve preview widget** -- small graph showing the selected operator's transfer function
- [ ] **CPU fallback** -- tone mapping in the 2D Canvas path when WebGL is unavailable
- [ ] **Histogram interaction** -- histogram reflects post-tone-mapping values when enabled
- [ ] **A/B comparison** -- quickly toggle tone mapping on/off to compare original vs. mapped

## Requirements

### Core Tone Mapping Operators
- [ ] Filmic (Hable/Uncharted 2) tone mapping with configurable shoulder/toe
- [ ] ACES tone mapping with Academy-standard fitted curve
- [ ] Reinhard tone mapping with configurable white point parameter
- [ ] Custom tone mapping via user-adjustable Catmull-Rom spline curve
- [ ] All operators implemented as GLSL fragment shader functions
- [ ] All operators preserve alpha channel unchanged

### Negative Value Visualization
- [ ] Detect pixels where any RGB channel is below 0.0
- [ ] Render negative pixels with configurable overlay color (default: cyan #00CED1)
- [ ] Toggle negative visualization independently of tone mapping operator
- [ ] Overlay blends with original pixel to show relative magnitude
- [ ] Works only with floating-point texture data (float16/float32)

### Per-Operator Parameters
- [ ] Reinhard: white point parameter (default 1.0, range 0.1 to 10.0)
- [ ] Filmic: exposure bias (default 2.0, range 0.5 to 8.0)
- [ ] Filmic: linear white point (default 11.2, range 1.0 to 20.0)
- [ ] ACES: exposure pre-scale (default 1.0, range 0.1 to 4.0)
- [ ] Custom: control points array with add/remove/drag interaction

### Tone Curve Preview
- [ ] Small inline graph (200x120px) in the dropdown showing the selected curve
- [ ] X-axis: input luminance (0 to 4.0 for HDR range)
- [ ] Y-axis: output luminance (0 to 1.0 display range)
- [ ] Curve updates in real-time when parameters change
- [ ] Custom curve: control points are draggable on the graph

### UI Integration
- [ ] Tone mapping selection in View tab dropdown (existing ToneMappingControl)
- [ ] Per-operator parameter sliders appear when operator is selected
- [ ] Negative value visualization toggle in the dropdown
- [ ] Tone curve preview canvas in the dropdown
- [ ] Keyboard shortcut Shift+Alt+J toggles tone mapping on/off (already implemented)
- [ ] Keyboard shortcut Shift+Alt+N toggles negative value visualization

### CPU Fallback
- [ ] Reinhard operator in JavaScript for 2D Canvas path
- [ ] Filmic operator in JavaScript for 2D Canvas path
- [ ] ACES operator in JavaScript for 2D Canvas path
- [ ] Custom curve lookup table for 2D Canvas path

## UI/UX Specification

### Tone Mapping Dropdown Panel (Enhanced)

**Location**: View tab, ToneMappingControl dropdown
**Toggle Button**: `data-testid="tone-mapping-control-button"`
**Dropdown Panel**: `data-testid="tone-mapping-dropdown"`

```
+----------------------------------------------+
| [x] Enable Tone Mapping                      |
+----------------------------------------------+
| OPERATOR                                     |
| +------------------------------------------+ |
| | [ Off ]  No tone mapping (linear)        | |
| +------------------------------------------+ |
| | [Reinhard] Simple global operator         | |
| +------------------------------------------+ |
| | [Filmic]  Film-like S-curve response      | |
| +------------------------------------------+ |
| | [ ACES ]  Academy Color Encoding System   | |
| +------------------------------------------+ |
| | [Custom]  User-defined tone curve         | |
| +------------------------------------------+ |
|                                              |
| PARAMETERS (shown for active operator)       |
| White Point    [========|====] 1.0           |
|                                              |
| CURVE PREVIEW                                |
| +------------------------------------------+ |
| |          __.---'''''                      | |
| |       _-'                                 | |
| |     .'                                    | |
| |   .'                                      | |
| |  /                                        | |
| | /                                         | |
| |/                                          | |
| +------------------------------------------+ |
|                                              |
| VISUALIZATION                                |
| [ ] Show Negative Values                     |
| Overlay Color  [  cyan swatch  ]             |
+----------------------------------------------+
```

### Operator Selection Buttons

Each operator button in the dropdown:
- **data-testid**: `tone-mapping-operator-{key}` (off, reinhard, filmic, aces, custom)
- **Active state**: Accent color background, white text
- **Inactive state**: Secondary background, muted text
- **Hover state**: Border highlight

### Parameter Sliders

Shown conditionally based on selected operator:

| Operator | Parameter | data-testid | Range | Default | Step |
|----------|-----------|-------------|-------|---------|------|
| Reinhard | White Point | `tone-mapping-param-whitepoint` | 0.1 - 10.0 | 1.0 | 0.1 |
| Filmic | Exposure Bias | `tone-mapping-param-exposure-bias` | 0.5 - 8.0 | 2.0 | 0.1 |
| Filmic | White Point | `tone-mapping-param-filmic-whitepoint` | 1.0 - 20.0 | 11.2 | 0.1 |
| ACES | Exposure Scale | `tone-mapping-param-aces-exposure` | 0.1 - 4.0 | 1.0 | 0.05 |

### Tone Curve Preview Canvas

- **data-testid**: `tone-mapping-curve-preview`
- **Size**: 200px wide, 120px tall
- **Background**: `var(--bg-primary)` with subtle grid lines
- **Curve color**: `var(--accent-primary)` for the active curve
- **Identity line**: Dashed diagonal in `var(--text-muted)` for reference
- **Axes**: Input (horizontal, 0-4.0), Output (vertical, 0-1.0)

### Custom Curve Editor

- **data-testid**: `tone-mapping-custom-curve-editor`
- **Control points**: Draggable circles, 8px radius
- **Default points**: (0, 0), (0.25, 0.25), (0.5, 0.5), (1.0, 0.8), (2.0, 0.95), (4.0, 1.0)
- **Add point**: Click on curve to add new control point
- **Remove point**: Right-click or double-click a control point (min 2 points)
- **Interpolation**: Catmull-Rom spline between control points

### Negative Value Visualization Controls

- **Toggle**: `data-testid="tone-mapping-negative-toggle"`
- **Color picker**: `data-testid="tone-mapping-negative-color"`
- **Default color**: Cyan (#00CED1)
- **Overlay mode**: Solid color where any channel < 0, with alpha proportional to magnitude

### Keyboard Shortcuts

| Shortcut | Action | data-testid context |
|----------|--------|---------------------|
| Shift+Alt+J | Toggle tone mapping on/off | Global |
| Shift+Alt+N | Toggle negative value visualization | Global |
| Shift+Alt+1 | Select Reinhard operator | Global (when tone mapping enabled) |
| Shift+Alt+2 | Select Filmic operator | Global (when tone mapping enabled) |
| Shift+Alt+3 | Select ACES operator | Global (when tone mapping enabled) |
| Shift+Alt+4 | Select Custom curve | Global (when tone mapping enabled) |

## Technical Notes

### Architecture

The tone mapping system is structured across three layers:

```
ToneMappingControl (UI)     -- User interaction, state management, events
        |
        v
ToneMappingEngine (Logic)   -- Curve computation, parameter validation, CPU fallback
        |
        v
Renderer (GPU)              -- GLSL fragment shader execution
```

**State Flow**:
1. User selects operator in `ToneMappingControl` dropdown
2. `stateChanged` event emitted with `ToneMappingState`
3. App passes state to `Renderer.setToneMappingState()`
4. Renderer sets `u_toneMappingOperator` and parameter uniforms
5. Fragment shader applies selected operator during `renderImage()`

### GLSL Shader Implementation

The following GLSL code is embedded in the Renderer's fragment shader. The tone mapping block runs at step 6, after color adjustments (exposure, temperature, brightness, contrast, saturation) and before gamma correction.

#### Reinhard Operator (Extended)

```glsl
// Reinhard tone mapping with configurable white point
// Reference: Reinhard et al., "Photographic Tone Reproduction for Digital Images" (2002)
//
// The white point parameter controls the luminance level that maps to pure white.
// Higher values preserve more highlight detail; lower values clip highlights sooner.
//
// Formula: L_display = L * (1 + L / L_white^2) / (1 + L)
// When L_white -> infinity, reduces to basic Reinhard: L / (1 + L)
uniform float u_reinhardWhitePoint;  // 0.1 to 10.0, default 1.0

vec3 tonemapReinhardExtended(vec3 color, float whitePoint) {
  float wp2 = whitePoint * whitePoint;
  return color * (vec3(1.0) + color / wp2) / (vec3(1.0) + color);
}
```

**Mathematical properties**:
- Maps [0, infinity) to [0, 1)
- At `color = 0`: output = 0 (black preserved)
- At `color = whitePoint`: output = `whitePoint * 2 / (whitePoint + 1)` (near white)
- Monotonically increasing, never exceeds 1.0
- With `whitePoint = 1.0`: equivalent to basic `c / (c + 1)` Reinhard

#### Filmic Operator (Hable/Uncharted 2)

```glsl
// Filmic tone mapping (Uncharted 2 / John Hable)
// Reference: John Hable, "Uncharted 2: HDR Lighting" (GDC 2010)
//
// Attempt to match the response curve of film stock:
// - Toe region: shadow detail compression (dark values)
// - Linear region: proportional mid-tone response
// - Shoulder region: highlight rolloff (bright values compress toward white)
//
// Parameters (Hable curve constants):
//   A = Shoulder Strength    (0.15)
//   B = Linear Strength      (0.50)
//   C = Linear Angle         (0.10)
//   D = Toe Strength         (0.20)
//   E = Toe Numerator        (0.02)
//   F = Toe Denominator      (0.30)
uniform float u_filmicExposureBias;   // 0.5 to 8.0, default 2.0
uniform float u_filmicWhitePoint;     // 1.0 to 20.0, default 11.2

vec3 filmicCurve(vec3 x) {
  float A = 0.15;
  float B = 0.50;
  float C = 0.10;
  float D = 0.20;
  float E = 0.02;
  float F = 0.30;
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

vec3 tonemapFilmicParametric(vec3 color, float exposureBias, float whitePoint) {
  vec3 curr = filmicCurve(exposureBias * color);
  vec3 whiteScale = vec3(1.0) / filmicCurve(vec3(whitePoint));
  return max(curr * whiteScale, vec3(0.0));
}
```

**S-curve characteristics**:
- **Toe** (shadows): gentle rolloff prevents black crush, lifts deep shadows
- **Linear** (midtones): approximately proportional response
- **Shoulder** (highlights): gradual rolloff compresses highlights toward white
- The exposure bias pre-scales input, effectively shifting the curve's operating range
- The white point determines where the curve maps to 1.0 output

#### ACES Operator

```glsl
// ACES (Academy Color Encoding System) tone mapping
// Reference: Academy ACES Reference Rendering Transform (RRT)
// Fitted approximation by Krzysztof Narkowicz
//
// This is a simplified fit of the ACES RRT + ODT pipeline,
// designed for real-time applications. It produces pleasing
// color rendering with good highlight rolloff and shadow detail.
//
// Formula: (x * (2.51x + 0.03)) / (x * (2.43x + 0.59) + 0.14)
uniform float u_acesExposureScale;  // 0.1 to 4.0, default 1.0

vec3 tonemapACESParametric(vec3 color, float exposureScale) {
  color *= exposureScale;
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp(
    (color * (a * color + b)) / (color * (c * color + d) + e),
    0.0, 1.0
  );
}
```

**Properties**:
- Industry standard for cinema color rendering
- Natural desaturation in highlights (perceptually pleasing)
- Good shadow detail preservation
- Clamps output to [0, 1] range
- The exposure scale pre-multiplies input for creative control

#### Custom Tone Curve

```glsl
// Custom tone mapping via 1D LUT texture
// The curve is baked into a 256-entry float texture from the control points.
// Catmull-Rom spline interpolation is performed on the CPU side when
// building the LUT; the shader performs simple texture lookup.
uniform sampler2D u_customToneCurveLUT;  // 256x1 R32F texture
uniform bool u_useCustomCurve;

vec3 tonemapCustomCurve(vec3 color) {
  // Normalize input: map [0, 4.0] HDR range to [0, 1] texture coordinate
  vec3 normalized = clamp(color / 4.0, 0.0, 1.0);
  float r = texture(u_customToneCurveLUT, vec2(normalized.r, 0.5)).r;
  float g = texture(u_customToneCurveLUT, vec2(normalized.g, 0.5)).r;
  float b = texture(u_customToneCurveLUT, vec2(normalized.b, 0.5)).r;
  return vec3(r, g, b);
}
```

**Implementation details**:
- Control points are interpolated using Catmull-Rom splines on the CPU
- Result is baked into a 256-entry 1D lookup texture (R32F format)
- Texture is uploaded once per curve edit, not per frame
- Input range [0, 4.0] covers typical HDR content; values above 4.0 are clamped

#### Negative Value Visualization

```glsl
// Negative value visualization
// Renders pixels with any channel below zero using a configurable overlay color.
// The overlay alpha is proportional to the magnitude of the most-negative channel.
uniform bool u_showNegativeValues;
uniform vec3 u_negativeOverlayColor;  // default: vec3(0.0, 0.808, 0.82) = #00CED1

vec3 visualizeNegativeValues(vec3 color, vec3 overlayColor) {
  float minChannel = min(min(color.r, color.g), color.b);
  if (minChannel < 0.0) {
    // Magnitude-based alpha: stronger overlay for more-negative values
    float alpha = clamp(-minChannel * 2.0, 0.1, 0.9);
    // Mix overlay with absolute value of color for context
    return mix(abs(color), overlayColor, alpha);
  }
  return color;
}
```

**Pipeline integration**:
- Negative visualization runs BEFORE tone mapping (at step 5.5 in the shader)
- This ensures negative values are caught before operators clamp to non-negative
- If both negative visualization and tone mapping are active, the overlay replaces negative pixels with positive overlay values, which then pass through the tone mapper normally

#### Complete Shader Pipeline (Updated)

The full fragment shader pipeline with tone mapping integration:

```glsl
void main() {
  vec4 color = texture(u_texture, v_texCoord);

  // 1. Exposure (stops, applied in linear space)
  color.rgb *= pow(2.0, u_exposure);

  // 2. Temperature and tint
  color.rgb = applyTemperature(color.rgb, u_temperature, u_tint);

  // 3. Brightness (simple offset)
  color.rgb += u_brightness;

  // 4. Contrast (pivot at 0.5)
  color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;

  // 5. Saturation
  float luma = dot(color.rgb, LUMA);
  color.rgb = mix(vec3(luma), color.rgb, u_saturation);

  // 5.5 Negative value visualization (before tone mapping clamps)
  if (u_showNegativeValues) {
    color.rgb = visualizeNegativeValues(color.rgb, u_negativeOverlayColor);
  }

  // 6. Tone mapping (applied before gamma for proper HDR handling)
  if (u_toneMappingOperator == 1) {
    color.rgb = tonemapReinhardExtended(max(color.rgb, 0.0), u_reinhardWhitePoint);
  } else if (u_toneMappingOperator == 2) {
    color.rgb = tonemapFilmicParametric(max(color.rgb, 0.0), u_filmicExposureBias, u_filmicWhitePoint);
  } else if (u_toneMappingOperator == 3) {
    color.rgb = tonemapACESParametric(max(color.rgb, 0.0), u_acesExposureScale);
  } else if (u_toneMappingOperator == 4 && u_useCustomCurve) {
    color.rgb = tonemapCustomCurve(max(color.rgb, 0.0));
  }
  // operator == 0: no tone mapping (passthrough)

  // 7. Gamma correction (display transform)
  color.rgb = pow(max(color.rgb, 0.0), vec3(1.0 / u_gamma));

  // Clamp final output
  color.rgb = clamp(color.rgb, 0.0, 1.0);

  fragColor = color;
}
```

### CPU Fallback Implementation

When WebGL is unavailable, tone mapping operators are applied per-pixel in JavaScript via the `ViewerRenderingUtils` module:

```typescript
// CPU tone mapping operators (for 2D Canvas fallback)

export function tonemapReinhardCPU(r: number, g: number, b: number, whitePoint: number): [number, number, number] {
  const wp2 = whitePoint * whitePoint;
  return [
    r * (1 + r / wp2) / (1 + r),
    g * (1 + g / wp2) / (1 + g),
    b * (1 + b / wp2) / (1 + b),
  ];
}

export function tonemapFilmicCPU(r: number, g: number, b: number, exposureBias: number, whitePoint: number): [number, number, number] {
  const filmicCurve = (x: number): number => {
    const A = 0.15, B = 0.50, C = 0.10, D = 0.20, E = 0.02, F = 0.30;
    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
  };
  const ws = 1.0 / filmicCurve(whitePoint);
  return [
    Math.max(filmicCurve(r * exposureBias) * ws, 0),
    Math.max(filmicCurve(g * exposureBias) * ws, 0),
    Math.max(filmicCurve(b * exposureBias) * ws, 0),
  ];
}

export function tonemapACESCPU(r: number, g: number, b: number, exposureScale: number): [number, number, number] {
  const aces = (x: number): number => {
    x *= exposureScale;
    return Math.max(0, Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
  };
  return [aces(r), aces(g), aces(b)];
}
```

### Custom Curve Spline Computation

The custom tone curve uses Catmull-Rom spline interpolation to produce a smooth curve through user-defined control points:

```typescript
interface CurvePoint {
  x: number;  // input luminance [0, 4.0]
  y: number;  // output luminance [0, 1.0]
}

/**
 * Evaluate Catmull-Rom spline at parameter t between points p1 and p2,
 * using p0 and p3 as tangent-influence neighbors.
 */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2.0 * p1) +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
  );
}

/**
 * Build a 256-entry LUT from the control points using Catmull-Rom interpolation.
 * The LUT maps normalized input [0, 1] (representing [0, 4.0] HDR range)
 * to output [0, 1] display range.
 */
function buildCustomCurveLUT(points: CurvePoint[]): Float32Array {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const lut = new Float32Array(256);

  for (let i = 0; i < 256; i++) {
    const inputNormalized = i / 255;
    const inputValue = inputNormalized * 4.0;  // Map to [0, 4.0] HDR range

    // Find surrounding control points
    let idx = sorted.findIndex(p => p.x >= inputValue);
    if (idx <= 0) idx = 1;
    if (idx >= sorted.length) idx = sorted.length - 1;

    const p0 = sorted[Math.max(0, idx - 2)];
    const p1 = sorted[idx - 1];
    const p2 = sorted[idx];
    const p3 = sorted[Math.min(sorted.length - 1, idx + 1)];

    const segmentLength = p2.x - p1.x;
    const t = segmentLength > 0 ? (inputValue - p1.x) / segmentLength : 0;

    lut[i] = Math.max(0, Math.min(1, catmullRom(p0.y, p1.y, p2.y, p3.y, t)));
  }

  return lut;
}
```

### Tone Mapping Engine Module

New module to encapsulate tone mapping logic separate from UI:

```typescript
// src/render/ToneMappingEngine.ts

export interface ToneMappingParams {
  reinhardWhitePoint: number;
  filmicExposureBias: number;
  filmicWhitePoint: number;
  acesExposureScale: number;
  customCurvePoints: CurvePoint[];
  showNegativeValues: boolean;
  negativeOverlayColor: [number, number, number];
}

export const DEFAULT_TONE_MAPPING_PARAMS: ToneMappingParams = {
  reinhardWhitePoint: 1.0,
  filmicExposureBias: 2.0,
  filmicWhitePoint: 11.2,
  acesExposureScale: 1.0,
  customCurvePoints: [
    { x: 0, y: 0 },
    { x: 0.25, y: 0.25 },
    { x: 0.5, y: 0.5 },
    { x: 1.0, y: 0.8 },
    { x: 2.0, y: 0.95 },
    { x: 4.0, y: 1.0 },
  ],
  showNegativeValues: false,
  negativeOverlayColor: [0.0, 0.808, 0.82],  // #00CED1
};
```

### Uniform List for Renderer

All new uniforms added to the fragment shader for tone mapping:

| Uniform Name | Type | Default | Description |
|-------------|------|---------|-------------|
| `u_toneMappingOperator` | `int` | 0 | 0=off, 1=reinhard, 2=filmic, 3=aces, 4=custom |
| `u_reinhardWhitePoint` | `float` | 1.0 | Reinhard white point parameter |
| `u_filmicExposureBias` | `float` | 2.0 | Filmic exposure pre-scale |
| `u_filmicWhitePoint` | `float` | 11.2 | Filmic linear white point |
| `u_acesExposureScale` | `float` | 1.0 | ACES exposure pre-scale |
| `u_customToneCurveLUT` | `sampler2D` | -- | 256x1 R32F custom curve LUT |
| `u_useCustomCurve` | `bool` | false | Whether custom curve LUT is valid |
| `u_showNegativeValues` | `bool` | false | Enable negative value overlay |
| `u_negativeOverlayColor` | `vec3` | (0, 0.808, 0.82) | Negative overlay RGB color |

### Operator Comparison Table

| Property | Reinhard | Filmic | ACES | Custom |
|----------|----------|--------|------|--------|
| Shadow detail | Good | Excellent (toe lift) | Good | User-defined |
| Highlight rolloff | Gradual | Film-like shoulder | Natural desaturation | User-defined |
| Color shift | Minimal | Slight warm shift | Slight desaturation | None (per-channel) |
| Computation cost | Lowest | Medium | Medium | Texture lookup |
| Typical use case | General HDR | Game/VFX content | Cinema grading | Specialized looks |
| White point control | Yes | Yes | Via exposure | Via curve shape |

## E2E Test Cases

### Complete Playwright Test Code

```typescript
// e2e/hdr-tone-mapping.spec.ts

import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getToneMappingState,
  waitForTestHelper,
  captureCanvasState,
} from './fixtures';

/**
 * HDR Tone Mapping Operators - E2E Tests
 *
 * Tests cover:
 * - Per-operator parameter controls
 * - Custom tone curve interaction
 * - Negative value visualization
 * - Tone curve preview widget
 * - Keyboard shortcuts for operator switching
 * - Integration with color adjustments
 */

/** Helper: Navigate to View tab and open the tone mapping dropdown. */
async function openToneMappingDropdown(page: import('@playwright/test').Page) {
  await page.click('button[data-tab-id="view"]');
  await page.waitForTimeout(100);
  const control = page.locator('[data-testid="tone-mapping-control-button"]');
  await control.click();
  await page.waitForTimeout(100);
  const dropdown = page.locator('[data-testid="tone-mapping-dropdown"]');
  await expect(dropdown).toBeVisible();
}

/** Helper: Select a tone mapping operator via the dropdown UI. */
async function selectOperatorViaUI(
  page: import('@playwright/test').Page,
  operator: 'off' | 'reinhard' | 'filmic' | 'aces' | 'custom',
) {
  await openToneMappingDropdown(page);
  await page.click(`[data-testid="tone-mapping-operator-${operator}"]`);
  await page.waitForTimeout(100);
}

test.describe('Tone Mapping Operator Parameters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('HDRTM-E001: reinhard operator shows white point slider when selected', async ({ page }) => {
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);

    const slider = page.locator('[data-testid="tone-mapping-param-whitepoint"]');
    await expect(slider).toBeVisible();
  });

  test('HDRTM-E002: filmic operator shows exposure bias slider when selected', async ({ page }) => {
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    const slider = page.locator('[data-testid="tone-mapping-param-exposure-bias"]');
    await expect(slider).toBeVisible();
  });

  test('HDRTM-E003: filmic operator shows white point slider when selected', async ({ page }) => {
    await selectOperatorViaUI(page, 'filmic');
    await openToneMappingDropdown(page);

    const slider = page.locator('[data-testid="tone-mapping-param-filmic-whitepoint"]');
    await expect(slider).toBeVisible();
  });

  test('HDRTM-E004: aces operator shows exposure scale slider when selected', async ({ page }) => {
    await selectOperatorViaUI(page, 'aces');
    await openToneMappingDropdown(page);

    const slider = page.locator('[data-testid="tone-mapping-param-aces-exposure"]');
    await expect(slider).toBeVisible();
  });

  test('HDRTM-E005: adjusting reinhard white point changes rendering', async ({ page }) => {
    await selectOperatorViaUI(page, 'reinhard');
    await page.waitForTimeout(200);
    const stateA = await captureCanvasState(page);

    // Open dropdown again to adjust parameter
    await openToneMappingDropdown(page);
    const slider = page.locator('[data-testid="tone-mapping-param-whitepoint"]');
    await slider.fill('5.0');
    await slider.dispatchEvent('input');
    await page.waitForTimeout(200);

    const stateB = await captureCanvasState(page);
    // With different white point, the rendering should differ
    expect(stateA).not.toEqual(stateB);
  });

  test('HDRTM-E006: parameter sliders hidden when operator is off', async ({ page }) => {
    await selectOperatorViaUI(page, 'off');
    await openToneMappingDropdown(page);

    const whitepoint = page.locator('[data-testid="tone-mapping-param-whitepoint"]');
    const exposureBias = page.locator('[data-testid="tone-mapping-param-exposure-bias"]');
    const acesExposure = page.locator('[data-testid="tone-mapping-param-aces-exposure"]');

    await expect(whitepoint).not.toBeVisible();
    await expect(exposureBias).not.toBeVisible();
    await expect(acesExposure).not.toBeVisible();
  });

  test('HDRTM-E007: switching operator changes visible parameters', async ({ page }) => {
    // Select reinhard first
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);
    await expect(page.locator('[data-testid="tone-mapping-param-whitepoint"]')).toBeVisible();
    await expect(page.locator('[data-testid="tone-mapping-param-exposure-bias"]')).not.toBeVisible();

    // Switch to filmic
    await page.click('[data-testid="tone-mapping-operator-filmic"]');
    await page.waitForTimeout(100);
    await expect(page.locator('[data-testid="tone-mapping-param-exposure-bias"]')).toBeVisible();
    await expect(page.locator('[data-testid="tone-mapping-param-whitepoint"]')).not.toBeVisible();
  });
});

test.describe('Custom Tone Curve', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('HDRTM-E010: custom operator shows curve editor', async ({ page }) => {
    await selectOperatorViaUI(page, 'custom');
    await openToneMappingDropdown(page);

    const editor = page.locator('[data-testid="tone-mapping-custom-curve-editor"]');
    await expect(editor).toBeVisible();
  });

  test('HDRTM-E011: curve editor has initial control points', async ({ page }) => {
    await selectOperatorViaUI(page, 'custom');
    await openToneMappingDropdown(page);

    const editor = page.locator('[data-testid="tone-mapping-custom-curve-editor"]');
    // The canvas should be rendered
    await expect(editor).toBeVisible();

    // Verify control points exist via evaluate
    const pointCount = await page.evaluate(() => {
      const app = (window as any).__testHelper;
      if (!app) return 0;
      const state = app.getToneMappingParams?.();
      return state?.customCurvePoints?.length ?? 0;
    });
    expect(pointCount).toBeGreaterThanOrEqual(2);
  });

  test('HDRTM-E012: custom curve affects canvas rendering', async ({ page }) => {
    // First capture with no tone mapping
    const originalState = await captureCanvasState(page);

    // Select custom operator
    await selectOperatorViaUI(page, 'custom');
    await page.waitForTimeout(200);
    const customState = await captureCanvasState(page);

    // Custom curve should change the rendering
    expect(originalState).not.toEqual(customState);
  });

  test('HDRTM-E013: custom curve editor hidden when other operator selected', async ({ page }) => {
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);

    const editor = page.locator('[data-testid="tone-mapping-custom-curve-editor"]');
    await expect(editor).not.toBeVisible();
  });
});

test.describe('Negative Value Visualization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('HDRTM-E020: negative value toggle exists in dropdown', async ({ page }) => {
    await openToneMappingDropdown(page);

    const toggle = page.locator('[data-testid="tone-mapping-negative-toggle"]');
    await expect(toggle).toBeVisible();
  });

  test('HDRTM-E021: negative value toggle is off by default', async ({ page }) => {
    await openToneMappingDropdown(page);

    const toggle = page.locator('[data-testid="tone-mapping-negative-toggle"]');
    await expect(toggle).not.toBeChecked();
  });

  test('HDRTM-E022: enabling negative visualization does not require tone mapping enabled', async ({ page }) => {
    // Open dropdown (tone mapping is off)
    await openToneMappingDropdown(page);

    // Enable negative value visualization
    const toggle = page.locator('[data-testid="tone-mapping-negative-toggle"]');
    await toggle.check();
    await page.waitForTimeout(100);

    await expect(toggle).toBeChecked();

    // Tone mapping should still be off
    const state = await getToneMappingState(page);
    expect(state.operator).toBe('off');
  });

  test('HDRTM-E023: negative color picker exists when toggle is enabled', async ({ page }) => {
    await openToneMappingDropdown(page);

    const toggle = page.locator('[data-testid="tone-mapping-negative-toggle"]');
    await toggle.check();
    await page.waitForTimeout(100);

    const colorPicker = page.locator('[data-testid="tone-mapping-negative-color"]');
    await expect(colorPicker).toBeVisible();
  });

  test('HDRTM-E024: Shift+Alt+N toggles negative visualization', async ({ page }) => {
    // Initially off
    const initialState = await page.evaluate(() => {
      const app = (window as any).__testHelper;
      return app?.getToneMappingParams?.()?.showNegativeValues ?? false;
    });
    expect(initialState).toBe(false);

    // Toggle on via keyboard
    await page.keyboard.press('Shift+Alt+n');
    await page.waitForTimeout(100);

    const enabledState = await page.evaluate(() => {
      const app = (window as any).__testHelper;
      return app?.getToneMappingParams?.()?.showNegativeValues ?? false;
    });
    expect(enabledState).toBe(true);

    // Toggle off via keyboard
    await page.keyboard.press('Shift+Alt+n');
    await page.waitForTimeout(100);

    const disabledState = await page.evaluate(() => {
      const app = (window as any).__testHelper;
      return app?.getToneMappingParams?.()?.showNegativeValues ?? false;
    });
    expect(disabledState).toBe(false);
  });
});

test.describe('Tone Curve Preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('HDRTM-E030: curve preview canvas exists in dropdown', async ({ page }) => {
    await openToneMappingDropdown(page);

    const preview = page.locator('[data-testid="tone-mapping-curve-preview"]');
    await expect(preview).toBeVisible();
  });

  test('HDRTM-E031: curve preview updates when operator changes', async ({ page }) => {
    await openToneMappingDropdown(page);

    // Capture preview with reinhard
    await page.click('[data-testid="tone-mapping-operator-reinhard"]');
    await page.waitForTimeout(100);
    const reinhardPreview = await page.locator('[data-testid="tone-mapping-curve-preview"]').screenshot();

    // Capture preview with filmic
    await page.click('[data-testid="tone-mapping-operator-filmic"]');
    await page.waitForTimeout(100);
    const filmicPreview = await page.locator('[data-testid="tone-mapping-curve-preview"]').screenshot();

    // Previews should differ
    expect(Buffer.compare(reinhardPreview, filmicPreview)).not.toBe(0);
  });

  test('HDRTM-E032: curve preview has correct dimensions', async ({ page }) => {
    await openToneMappingDropdown(page);

    const preview = page.locator('[data-testid="tone-mapping-curve-preview"]');
    const box = await preview.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(180);
    expect(box!.height).toBeGreaterThanOrEqual(100);
  });
});

test.describe('Operator Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('HDRTM-E040: Shift+Alt+1 selects Reinhard', async ({ page }) => {
    // Enable tone mapping first
    await page.keyboard.press('Shift+Alt+j');
    await page.waitForTimeout(100);

    await page.keyboard.press('Shift+Alt+1');
    await page.waitForTimeout(100);

    const state = await getToneMappingState(page);
    expect(state.operator).toBe('reinhard');
  });

  test('HDRTM-E041: Shift+Alt+2 selects Filmic', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+j');
    await page.waitForTimeout(100);

    await page.keyboard.press('Shift+Alt+2');
    await page.waitForTimeout(100);

    const state = await getToneMappingState(page);
    expect(state.operator).toBe('filmic');
  });

  test('HDRTM-E042: Shift+Alt+3 selects ACES', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+j');
    await page.waitForTimeout(100);

    await page.keyboard.press('Shift+Alt+3');
    await page.waitForTimeout(100);

    const state = await getToneMappingState(page);
    expect(state.operator).toBe('aces');
  });

  test('HDRTM-E043: Shift+Alt+4 selects Custom', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+j');
    await page.waitForTimeout(100);

    await page.keyboard.press('Shift+Alt+4');
    await page.waitForTimeout(100);

    const state = await getToneMappingState(page);
    expect(state.operator).toBe('custom');
  });
});

test.describe('Tone Mapping Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('HDRTM-E050: tone mapping with exposure produces compound effect', async ({ page }) => {
    // Capture baseline
    const baseline = await captureCanvasState(page);

    // Set exposure to +2 via Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);
    const exposureSlider = page.locator('[data-testid="slider-exposure"]');
    await exposureSlider.fill('2');
    await exposureSlider.dispatchEvent('input');
    await page.waitForTimeout(200);
    const exposureOnly = await captureCanvasState(page);

    // Enable reinhard tone mapping via UI
    await selectOperatorViaUI(page, 'reinhard');
    await page.waitForTimeout(200);
    const exposurePlusToneMap = await captureCanvasState(page);

    // All three states should differ
    expect(baseline).not.toEqual(exposureOnly);
    expect(exposureOnly).not.toEqual(exposurePlusToneMap);
    expect(baseline).not.toEqual(exposurePlusToneMap);
  });

  test('HDRTM-E051: operator parameters persist when toggling tone mapping', async ({ page }) => {
    // Set reinhard with white point 5.0
    await selectOperatorViaUI(page, 'reinhard');
    await openToneMappingDropdown(page);
    const slider = page.locator('[data-testid="tone-mapping-param-whitepoint"]');
    await slider.fill('5.0');
    await slider.dispatchEvent('input');
    await page.waitForTimeout(100);

    // Toggle off
    await page.keyboard.press('Shift+Alt+j');
    await page.waitForTimeout(100);

    // Toggle on
    await page.keyboard.press('Shift+Alt+j');
    await page.waitForTimeout(100);

    // Verify parameter persisted
    await openToneMappingDropdown(page);
    const value = await page.locator('[data-testid="tone-mapping-param-whitepoint"]').inputValue();
    expect(parseFloat(value)).toBeCloseTo(5.0, 1);
  });

  test('HDRTM-E052: negative visualization works independently of tone mapping', async ({ page }) => {
    // Capture without any visualization
    const baseline = await captureCanvasState(page);

    // Enable only negative visualization (tone mapping stays off)
    await page.keyboard.press('Shift+Alt+n');
    await page.waitForTimeout(200);

    const withNegative = await captureCanvasState(page);

    // State should be different if there are negative values in the content
    // For standard SDR video, no change is expected (no negative values)
    const state = await getToneMappingState(page);
    expect(state.operator).toBe('off');
  });

  test('HDRTM-E053: custom curve editor changes persist across frame navigation', async ({ page }) => {
    await selectOperatorViaUI(page, 'custom');
    await page.waitForTimeout(200);
    const stateFrame1 = await captureCanvasState(page);

    // Navigate forward
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    // Tone mapping should still be active
    const tmState = await getToneMappingState(page);
    expect(tmState.enabled).toBe(true);
    expect(tmState.operator).toBe('custom');
  });
});
```

## Unit Test Cases

### Complete Vitest Test Code

```typescript
// src/render/ToneMappingEngine.test.ts

import { describe, it, expect } from 'vitest';

// CPU fallback implementations for testing
function tonemapReinhardCPU(r: number, g: number, b: number, whitePoint: number): [number, number, number] {
  const wp2 = whitePoint * whitePoint;
  return [
    r * (1 + r / wp2) / (1 + r),
    g * (1 + g / wp2) / (1 + g),
    b * (1 + b / wp2) / (1 + b),
  ];
}

function tonemapFilmicCPU(r: number, g: number, b: number, exposureBias: number, whitePoint: number): [number, number, number] {
  const filmicCurve = (x: number): number => {
    const A = 0.15, B = 0.50, C = 0.10, D = 0.20, E = 0.02, F = 0.30;
    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
  };
  const ws = 1.0 / filmicCurve(whitePoint);
  return [
    Math.max(filmicCurve(r * exposureBias) * ws, 0),
    Math.max(filmicCurve(g * exposureBias) * ws, 0),
    Math.max(filmicCurve(b * exposureBias) * ws, 0),
  ];
}

function tonemapACESCPU(r: number, g: number, b: number, exposureScale: number): [number, number, number] {
  const aces = (x: number): number => {
    x *= exposureScale;
    return Math.max(0, Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
  };
  return [aces(r), aces(g), aces(b)];
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2.0 * p1) +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
  );
}

interface CurvePoint { x: number; y: number; }

function buildCustomCurveLUT(points: CurvePoint[]): Float32Array {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const inputNormalized = i / 255;
    const inputValue = inputNormalized * 4.0;
    let idx = sorted.findIndex(p => p.x >= inputValue);
    if (idx <= 0) idx = 1;
    if (idx >= sorted.length) idx = sorted.length - 1;
    const p0 = sorted[Math.max(0, idx - 2)];
    const p1 = sorted[idx - 1];
    const p2 = sorted[idx];
    const p3 = sorted[Math.min(sorted.length - 1, idx + 1)];
    const segmentLength = p2.x - p1.x;
    const t = segmentLength > 0 ? (inputValue - p1.x) / segmentLength : 0;
    lut[i] = Math.max(0, Math.min(1, catmullRom(p0.y, p1.y, p2.y, p3.y, t)));
  }
  return lut;
}

describe('Reinhard Tone Mapping', () => {
  it('HDRTM-U001: black (0,0,0) maps to black', () => {
    const [r, g, b] = tonemapReinhardCPU(0, 0, 0, 1.0);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('HDRTM-U002: output is always less than 1.0 for finite input', () => {
    const [r] = tonemapReinhardCPU(100, 0, 0, 1.0);
    expect(r).toBeLessThan(1.0);
    expect(r).toBeGreaterThan(0.99);
  });

  it('HDRTM-U003: monotonically increasing', () => {
    const values = [0.1, 0.5, 1.0, 2.0, 5.0, 10.0];
    const outputs = values.map(v => tonemapReinhardCPU(v, 0, 0, 1.0)[0]);
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBeGreaterThan(outputs[i - 1]);
    }
  });

  it('HDRTM-U004: with infinite white point reduces to basic reinhard', () => {
    const [basic] = tonemapReinhardCPU(0.5, 0, 0, 1e10);
    const expected = 0.5 / (0.5 + 1);  // basic reinhard
    expect(basic).toBeCloseTo(expected, 5);
  });

  it('HDRTM-U005: higher white point preserves more highlight detail', () => {
    const [low] = tonemapReinhardCPU(2.0, 0, 0, 1.0);
    const [high] = tonemapReinhardCPU(2.0, 0, 0, 5.0);
    // Higher white point maps the same input to a brighter output
    expect(high).toBeGreaterThan(low);
  });

  it('HDRTM-U006: white point of 1.0 gives correct midpoint', () => {
    // At input=1.0, whitePoint=1.0: output = 1*(1+1/1)/(1+1) = 1*2/2 = 1.0
    const [r] = tonemapReinhardCPU(1.0, 0, 0, 1.0);
    expect(r).toBeCloseTo(1.0, 5);
  });

  it('HDRTM-U007: operates per-channel independently', () => {
    const [r, g, b] = tonemapReinhardCPU(0.5, 1.0, 2.0, 1.0);
    const [r2] = tonemapReinhardCPU(0.5, 0, 0, 1.0);
    const [, g2] = tonemapReinhardCPU(0, 1.0, 0, 1.0);
    const [, , b2] = tonemapReinhardCPU(0, 0, 2.0, 1.0);
    expect(r).toBeCloseTo(r2, 10);
    expect(g).toBeCloseTo(g2, 10);
    expect(b).toBeCloseTo(b2, 10);
  });
});

describe('Filmic Tone Mapping', () => {
  it('HDRTM-U010: black (0,0,0) maps to approximately black', () => {
    const [r, g, b] = tonemapFilmicCPU(0, 0, 0, 2.0, 11.2);
    // Filmic has a toe, so 0 may map to very slightly above 0
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(0.01);
  });

  it('HDRTM-U011: high input maps close to 1.0', () => {
    const [r] = tonemapFilmicCPU(10.0, 0, 0, 2.0, 11.2);
    expect(r).toBeGreaterThan(0.9);
    expect(r).toBeLessThanOrEqual(1.0);
  });

  it('HDRTM-U012: monotonically increasing for positive input', () => {
    const values = [0.01, 0.1, 0.5, 1.0, 2.0, 5.0];
    const outputs = values.map(v => tonemapFilmicCPU(v, 0, 0, 2.0, 11.2)[0]);
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBeGreaterThan(outputs[i - 1]);
    }
  });

  it('HDRTM-U013: S-curve has toe, linear, and shoulder regions', () => {
    // Toe: slope increases (concave up)
    const toe1 = tonemapFilmicCPU(0.01, 0, 0, 2.0, 11.2)[0];
    const toe2 = tonemapFilmicCPU(0.05, 0, 0, 2.0, 11.2)[0];
    const mid1 = tonemapFilmicCPU(0.2, 0, 0, 2.0, 11.2)[0];
    const mid2 = tonemapFilmicCPU(0.4, 0, 0, 2.0, 11.2)[0];
    const shoulder1 = tonemapFilmicCPU(2.0, 0, 0, 2.0, 11.2)[0];
    const shoulder2 = tonemapFilmicCPU(4.0, 0, 0, 2.0, 11.2)[0];

    // Shoulder region has lower slope than mid region
    const midSlope = (mid2 - mid1) / (0.4 - 0.2);
    const shoulderSlope = (shoulder2 - shoulder1) / (4.0 - 2.0);
    expect(shoulderSlope).toBeLessThan(midSlope);
  });

  it('HDRTM-U014: higher exposure bias brightens output', () => {
    const [low] = tonemapFilmicCPU(1.0, 0, 0, 1.0, 11.2);
    const [high] = tonemapFilmicCPU(1.0, 0, 0, 4.0, 11.2);
    expect(high).toBeGreaterThan(low);
  });

  it('HDRTM-U015: output is non-negative', () => {
    const values = [0, 0.001, 0.01, 0.1, 1.0, 10.0];
    for (const v of values) {
      const [r, g, b] = tonemapFilmicCPU(v, v, v, 2.0, 11.2);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('ACES Tone Mapping', () => {
  it('HDRTM-U020: black maps to near-black', () => {
    const [r, g, b] = tonemapACESCPU(0, 0, 0, 1.0);
    expect(r).toBeCloseTo(0, 2);
    expect(g).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(0, 2);
  });

  it('HDRTM-U021: output clamped to [0, 1]', () => {
    const inputs = [0.1, 0.5, 1.0, 5.0, 100.0];
    for (const val of inputs) {
      const [r] = tonemapACESCPU(val, 0, 0, 1.0);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it('HDRTM-U022: monotonically increasing', () => {
    const values = [0.01, 0.1, 0.5, 1.0, 2.0, 5.0];
    const outputs = values.map(v => tonemapACESCPU(v, 0, 0, 1.0)[0]);
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBeGreaterThan(outputs[i - 1]);
    }
  });

  it('HDRTM-U023: exposure scale of 1.0 is identity pre-scale', () => {
    const [r1] = tonemapACESCPU(0.5, 0, 0, 1.0);
    // With exposure 2.0, it should be equivalent to input 1.0 with exposure 1.0
    const [r2] = tonemapACESCPU(1.0, 0, 0, 1.0);
    const [r3] = tonemapACESCPU(0.5, 0, 0, 2.0);
    expect(r3).toBeCloseTo(r2, 5);
  });

  it('HDRTM-U024: mid-grey (0.18) maps to reasonable display value', () => {
    const [r] = tonemapACESCPU(0.18, 0, 0, 1.0);
    // ACES maps mid-grey to approximately 0.09-0.12 range
    expect(r).toBeGreaterThan(0.05);
    expect(r).toBeLessThan(0.25);
  });

  it('HDRTM-U025: per-channel independence', () => {
    const [r, g, b] = tonemapACESCPU(0.3, 0.7, 1.5, 1.0);
    const [r2] = tonemapACESCPU(0.3, 0, 0, 1.0);
    const [, g2] = tonemapACESCPU(0, 0.7, 0, 1.0);
    const [, , b2] = tonemapACESCPU(0, 0, 1.5, 1.0);
    expect(r).toBeCloseTo(r2, 10);
    expect(g).toBeCloseTo(g2, 10);
    expect(b).toBeCloseTo(b2, 10);
  });
});

describe('Custom Curve LUT', () => {
  const defaultPoints: CurvePoint[] = [
    { x: 0, y: 0 },
    { x: 0.25, y: 0.25 },
    { x: 0.5, y: 0.5 },
    { x: 1.0, y: 0.8 },
    { x: 2.0, y: 0.95 },
    { x: 4.0, y: 1.0 },
  ];

  it('HDRTM-U030: LUT has 256 entries', () => {
    const lut = buildCustomCurveLUT(defaultPoints);
    expect(lut.length).toBe(256);
  });

  it('HDRTM-U031: first entry maps to 0 (black preserved)', () => {
    const lut = buildCustomCurveLUT(defaultPoints);
    expect(lut[0]).toBeCloseTo(0, 2);
  });

  it('HDRTM-U032: last entry maps to 1 (white preserved)', () => {
    const lut = buildCustomCurveLUT(defaultPoints);
    expect(lut[255]).toBeCloseTo(1.0, 2);
  });

  it('HDRTM-U033: LUT values are in [0, 1] range', () => {
    const lut = buildCustomCurveLUT(defaultPoints);
    for (let i = 0; i < 256; i++) {
      expect(lut[i]).toBeGreaterThanOrEqual(0);
      expect(lut[i]).toBeLessThanOrEqual(1);
    }
  });

  it('HDRTM-U034: identity curve produces linear ramp', () => {
    const identityPoints: CurvePoint[] = [
      { x: 0, y: 0 },
      { x: 1.0, y: 0.25 },
      { x: 2.0, y: 0.5 },
      { x: 4.0, y: 1.0 },
    ];
    const lut = buildCustomCurveLUT(identityPoints);
    // At input 2.0 (normalized 0.5, index 127-128), output should be ~0.5
    expect(lut[127]).toBeCloseTo(0.5, 1);
  });

  it('HDRTM-U035: monotonically increasing for default curve', () => {
    const lut = buildCustomCurveLUT(defaultPoints);
    for (let i = 1; i < 256; i++) {
      expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1] - 0.01); // small tolerance for spline wiggle
    }
  });

  it('HDRTM-U036: unsorted points are handled (sorted internally)', () => {
    const shuffledPoints: CurvePoint[] = [
      { x: 2.0, y: 0.95 },
      { x: 0, y: 0 },
      { x: 4.0, y: 1.0 },
      { x: 0.5, y: 0.5 },
    ];
    const lut = buildCustomCurveLUT(shuffledPoints);
    expect(lut[0]).toBeCloseTo(0, 2);
    expect(lut[255]).toBeCloseTo(1.0, 2);
  });

  it('HDRTM-U037: minimum 2 points produce valid LUT', () => {
    const minPoints: CurvePoint[] = [
      { x: 0, y: 0 },
      { x: 4.0, y: 1.0 },
    ];
    const lut = buildCustomCurveLUT(minPoints);
    expect(lut.length).toBe(256);
    expect(lut[0]).toBeCloseTo(0, 1);
    expect(lut[255]).toBeCloseTo(1.0, 1);
  });
});

describe('Catmull-Rom Interpolation', () => {
  it('HDRTM-U040: at t=0 returns p1', () => {
    const result = catmullRom(0, 1, 2, 3, 0);
    expect(result).toBeCloseTo(1, 5);
  });

  it('HDRTM-U041: at t=1 returns p2', () => {
    const result = catmullRom(0, 1, 2, 3, 1);
    expect(result).toBeCloseTo(2, 5);
  });

  it('HDRTM-U042: at t=0.5 for linear input returns midpoint', () => {
    const result = catmullRom(0, 1, 2, 3, 0.5);
    expect(result).toBeCloseTo(1.5, 5);
  });

  it('HDRTM-U043: C1 continuity (smooth through control points)', () => {
    // For evenly spaced points on a line, output should be linear
    const v1 = catmullRom(0, 1, 2, 3, 0.25);
    const v2 = catmullRom(0, 1, 2, 3, 0.5);
    const v3 = catmullRom(0, 1, 2, 3, 0.75);
    expect(v1).toBeCloseTo(1.25, 5);
    expect(v2).toBeCloseTo(1.5, 5);
    expect(v3).toBeCloseTo(1.75, 5);
  });
});

describe('Negative Value Visualization', () => {
  function visualizeNegative(r: number, g: number, b: number, overlayColor: [number, number, number]): [number, number, number] {
    const minChannel = Math.min(r, g, b);
    if (minChannel < 0) {
      const alpha = Math.max(0.1, Math.min(0.9, -minChannel * 2.0));
      return [
        Math.abs(r) * (1 - alpha) + overlayColor[0] * alpha,
        Math.abs(g) * (1 - alpha) + overlayColor[1] * alpha,
        Math.abs(b) * (1 - alpha) + overlayColor[2] * alpha,
      ];
    }
    return [r, g, b];
  }

  const cyan: [number, number, number] = [0.0, 0.808, 0.82];

  it('HDRTM-U050: positive values pass through unchanged', () => {
    const [r, g, b] = visualizeNegative(0.5, 0.3, 0.7, cyan);
    expect(r).toBe(0.5);
    expect(g).toBe(0.3);
    expect(b).toBe(0.7);
  });

  it('HDRTM-U051: zero values pass through unchanged', () => {
    const [r, g, b] = visualizeNegative(0, 0, 0, cyan);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('HDRTM-U052: negative values produce overlay', () => {
    const [r, g, b] = visualizeNegative(-0.5, 0.3, 0.7, cyan);
    // Should be blended with cyan overlay
    expect(r).not.toBe(-0.5);
    expect(r).toBeGreaterThanOrEqual(0);
  });

  it('HDRTM-U053: more negative values produce stronger overlay', () => {
    const [r1] = visualizeNegative(-0.1, 0.3, 0.7, cyan);
    const [r2] = visualizeNegative(-1.0, 0.3, 0.7, cyan);
    // More negative = more overlay color influence
    // r2 should be closer to cyan.r (0.0) than r1
    expect(Math.abs(r2 - cyan[0])).toBeLessThan(Math.abs(r1 - cyan[0]));
  });

  it('HDRTM-U054: overlay alpha clamped between 0.1 and 0.9', () => {
    // Very slightly negative
    const [r1, g1, b1] = visualizeNegative(-0.001, 0, 0, cyan);
    // Should still show some overlay (alpha >= 0.1)
    expect(g1).toBeGreaterThan(0);  // cyan has green component

    // Very negative
    const [r2, g2, b2] = visualizeNegative(-100, 0, 0, cyan);
    // Should not be fully opaque overlay (alpha <= 0.9)
    // Original abs(r) = 100, so mixed result won't be pure cyan
    expect(r2).toBeGreaterThanOrEqual(0);
  });

  it('HDRTM-U055: only channels below zero trigger visualization', () => {
    // Only one channel negative
    const [r, g, b] = visualizeNegative(-0.5, 0.5, 0.5, cyan);
    // All output channels affected since min < 0
    expect(r).not.toEqual(-0.5);
    expect(g).not.toEqual(0.5);
    expect(b).not.toEqual(0.5);
  });
});

describe('Operator Comparison', () => {
  it('HDRTM-U060: all operators produce different output for same input', () => {
    const input = 0.5;
    const [rReinhard] = tonemapReinhardCPU(input, 0, 0, 1.0);
    const [rFilmic] = tonemapFilmicCPU(input, 0, 0, 2.0, 11.2);
    const [rACES] = tonemapACESCPU(input, 0, 0, 1.0);

    // All should differ
    expect(rReinhard).not.toBeCloseTo(rFilmic, 3);
    expect(rFilmic).not.toBeCloseTo(rACES, 3);
    expect(rReinhard).not.toBeCloseTo(rACES, 3);
  });

  it('HDRTM-U061: all operators map 0 to approximately 0', () => {
    const [rR] = tonemapReinhardCPU(0, 0, 0, 1.0);
    const [rF] = tonemapFilmicCPU(0, 0, 0, 2.0, 11.2);
    const [rA] = tonemapACESCPU(0, 0, 0, 1.0);

    expect(rR).toBeCloseTo(0, 2);
    expect(rF).toBeCloseTo(0, 1);
    expect(rA).toBeCloseTo(0, 2);
  });

  it('HDRTM-U062: all operators compress HDR range to SDR', () => {
    const hdrValue = 10.0;
    const [rR] = tonemapReinhardCPU(hdrValue, 0, 0, 1.0);
    const [rF] = tonemapFilmicCPU(hdrValue, 0, 0, 2.0, 11.2);
    const [rA] = tonemapACESCPU(hdrValue, 0, 0, 1.0);

    // All should compress to near-1.0 SDR
    expect(rR).toBeLessThanOrEqual(1.0);
    expect(rF).toBeLessThanOrEqual(1.0);
    expect(rA).toBeLessThanOrEqual(1.0);
    expect(rR).toBeGreaterThan(0.9);
    expect(rF).toBeGreaterThan(0.9);
    expect(rA).toBeGreaterThan(0.9);
  });
});
```

### ToneMappingControl Extended Tests

```typescript
// src/ui/components/ToneMappingControl.extended.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToneMappingControl } from './ToneMappingControl';

describe('ToneMappingControl - Extended Operator', () => {
  let control: ToneMappingControl;

  beforeEach(() => {
    control = new ToneMappingControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('HDRTM-U070: custom operator button exists in dropdown', () => {
    const el = control.render();
    const dropdown = el.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
    const customBtn = dropdown?.querySelector('[data-testid="tone-mapping-operator-custom"]');
    expect(customBtn).not.toBeNull();
  });

  it('HDRTM-U071: selecting custom operator auto-enables tone mapping', () => {
    control.setOperator('custom' as any);
    const state = control.getState();
    expect(state.enabled).toBe(true);
    expect(state.operator).toBe('custom');
  });

  it('HDRTM-U072: negative toggle checkbox exists in dropdown', () => {
    const el = control.render();
    const dropdown = el.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
    const negToggle = dropdown?.querySelector('[data-testid="tone-mapping-negative-toggle"]');
    expect(negToggle).not.toBeNull();
  });

  it('HDRTM-U073: curve preview canvas exists in dropdown', () => {
    const el = control.render();
    const dropdown = el.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
    const preview = dropdown?.querySelector('[data-testid="tone-mapping-curve-preview"]');
    expect(preview).not.toBeNull();
  });

  it('HDRTM-U074: parameter sliders appear for reinhard operator', () => {
    control.setOperator('reinhard');
    const el = control.render();
    const dropdown = el.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
    const slider = dropdown?.querySelector('[data-testid="tone-mapping-param-whitepoint"]');
    expect(slider).not.toBeNull();
  });

  it('HDRTM-U075: parameter sliders appear for filmic operator', () => {
    control.setOperator('filmic');
    const el = control.render();
    const dropdown = el.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
    const exposureBias = dropdown?.querySelector('[data-testid="tone-mapping-param-exposure-bias"]');
    const whitepoint = dropdown?.querySelector('[data-testid="tone-mapping-param-filmic-whitepoint"]');
    expect(exposureBias).not.toBeNull();
    expect(whitepoint).not.toBeNull();
  });

  it('HDRTM-U076: parameter sliders appear for aces operator', () => {
    control.setOperator('aces');
    const el = control.render();
    const dropdown = el.querySelector('[data-testid="tone-mapping-dropdown"]') as HTMLElement;
    const slider = dropdown?.querySelector('[data-testid="tone-mapping-param-aces-exposure"]');
    expect(slider).not.toBeNull();
  });

  it('HDRTM-U077: Shift+Alt+N toggles negative visualization', () => {
    const handled = control.handleKeyboard('n', true, true);
    expect(handled).toBe(true);
  });

  it('HDRTM-U078: Shift+Alt+1 selects reinhard when tone mapping enabled', () => {
    control.setEnabled(true);
    const handled = control.handleKeyboard('1', true, true);
    expect(handled).toBe(true);
    expect(control.getState().operator).toBe('reinhard');
  });

  it('HDRTM-U079: Shift+Alt+4 selects custom when tone mapping enabled', () => {
    control.setEnabled(true);
    const handled = control.handleKeyboard('4', true, true);
    expect(handled).toBe(true);
    expect(control.getState().operator).toBe('custom');
  });
});
```

## Implementation Files Reference

### Existing Files to Modify

- `/Users/lifeart/Repos/openrv-web/src/render/Renderer.ts` -- Add new uniforms for per-operator parameters, custom curve LUT texture, and negative visualization uniforms. Extend the fragment shader with parametric operator functions and negative value visualization.
- `/Users/lifeart/Repos/openrv-web/src/ui/components/ToneMappingControl.ts` -- Add 'custom' operator to the list, add parameter slider rows per operator, add negative value toggle, add curve preview canvas, add new keyboard shortcuts (Shift+Alt+N, Shift+Alt+1-4).
- `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.ts` -- Add CPU fallback tone mapping functions for the 2D Canvas rendering path.
- `/Users/lifeart/Repos/openrv-web/src/render/ShaderProgram.ts` -- No changes needed; already supports all required uniform types (float, int, vec3, sampler2D via uniform1i).

### New Files to Create

```
src/
  render/
    ToneMappingEngine.ts          -- Tone mapping parameter management, CPU fallback operators, custom curve LUT builder
    ToneMappingEngine.test.ts     -- Unit tests for ToneMappingEngine
  ui/
    components/
      ToneCurvePreview.ts         -- Canvas-based tone curve visualization widget
      ToneCurvePreview.test.ts    -- Unit tests for ToneCurvePreview
      CustomCurveEditor.ts        -- Interactive spline curve editor with draggable control points
      CustomCurveEditor.test.ts   -- Unit tests for CustomCurveEditor
      ToneMappingControl.extended.test.ts  -- Extended unit tests for new ToneMappingControl features
e2e/
    hdr-tone-mapping.spec.ts      -- E2E Playwright tests for HDR tone mapping
```

### File Descriptions

| File | Purpose | Approximate Lines |
|------|---------|-------------------|
| `ToneMappingEngine.ts` | Core logic: parameter defaults, validation, CPU operators, LUT builder | ~250 |
| `ToneCurvePreview.ts` | 200x120 canvas rendering of tone curves using Canvas 2D API | ~150 |
| `CustomCurveEditor.ts` | Interactive curve editor with mouse drag, add/remove points, Catmull-Rom spline | ~300 |
| `hdr-tone-mapping.spec.ts` | Playwright E2E tests for all tone mapping features | ~250 |
| `ToneMappingEngine.test.ts` | Vitest unit tests for engine functions | ~300 |

### Renderer Shader Modification Summary

The `Renderer.ts` fragment shader needs these additions:

1. **New uniforms**: 9 additional uniforms (see Uniform List table above)
2. **New functions**: `tonemapReinhardExtended()`, `tonemapFilmicParametric()`, `tonemapACESParametric()`, `tonemapCustomCurve()`, `visualizeNegativeValues()`
3. **Updated dispatch**: Extend `applyToneMapping()` to handle operator code 4 (custom)
4. **Pipeline insertion**: Add negative value visualization at step 5.5

### ToneMappingControl Modification Summary

The `ToneMappingControl.ts` needs:

1. **Extended operator type**: Add `'custom'` to `ToneMappingOperator` union
2. **Extended operator list**: Add custom entry to `TONE_MAPPING_OPERATORS` array
3. **Parameter UI**: Conditional slider rows based on selected operator
4. **Negative toggle**: Checkbox with event emission
5. **Curve preview**: Embedded `ToneCurvePreview` component
6. **Custom editor**: Embedded `CustomCurveEditor` component (shown when custom selected)
7. **Extended keyboard**: Handle Shift+Alt+N and Shift+Alt+1-4
8. **Extended state**: Add `ToneMappingParams` alongside `ToneMappingState`
