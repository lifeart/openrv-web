# Display Color Management

## Overview
Display Color Management is the **final stage** in the rendering pipeline, applied after all per-source color corrections (exposure, CDL, curves, LUT, tone mapping) and before the image is presented on the user's display. It transforms linear or scene-referred pixel values into the correct signal for the physical monitor, accounting for the display's electro-optical transfer function (EOTF), gamma response, brightness calibration, and color gamut.

This feature addresses the "Display Color Management" gap identified in `features/color-correction.md` (section: Missing Features) and `features/color-management.md` (section: Not Implemented - HDR Display Output).

## Original OpenRV Implementation
OpenRV provides display-level color management as part of its GPU rendering pipeline:

- **sRGB Display**: Standard monitor curve with linear transition below 0.0031308 and a power curve (approx. gamma 2.4) above, matching the IEC 61966-2-1 standard
- **Rec. 709 Non-Linear Transfer**: The BT.709 OETF used for HD reference monitors, with a linear segment near black and a 0.45 power curve above
- **Display Gamma**: Adjustable monitor response compensation (default 1.0 on Linux/Windows, 1.0 on macOS), applied as a simple power function on top of the selected transfer function
- **Display Brightness**: Final multiplicative brightness adjustment that preserves hue and saturation, applied as the very last operation before output

These operations are implemented in hardware (GPU shaders) for real-time preview and are session-wide (not per-source).

## Status
- [x] Not implemented
- [ ] Partially implemented
- [ ] Fully implemented

## Requirements
| Requirement | Status | Implementation |
|-------------|--------|----------------|
| sRGB display transfer function | Not Implemented | Needs `DisplayColorManager` + GLSL shader |
| Rec. 709 non-linear transfer | Not Implemented | Needs GLSL OETF implementation |
| Display gamma compensation | Partially Implemented | Basic gamma slider exists in `ColorControls`; needs dedicated display-level control |
| Per-display brightness adjustment | Not Implemented | Needs final-stage multiplicative brightness |
| Display profile selection UI | Not Implemented | Needs `DisplayProfileSelect` component |
| Browser color space detection | Not Implemented | Needs `screen.colorSpace` / `matchMedia` detection |
| Canvas color space configuration | Not Implemented | Needs `getContext('2d', { colorSpace })` integration |
| Linear (bypass) mode | Not Implemented | Pass-through with no transfer function |
| Display P3 gamut support | Not Implemented | Needs canvas `display-p3` color space |
| Persist display profile across sessions | Not Implemented | Needs localStorage persistence |

## Rendering Pipeline Position

Display color management is applied as **step 14** in the render pipeline, after all content-level corrections:

```
 1. Draw source image with transform (rotation/flip)
 2. Apply crop
 3. Stereo mode transformation
 4. Lens distortion
 5. 3D LUT application
 6. Color adjustments (exposure, contrast, saturation, gamma, temperature, tint, brightness)
 7. CDL correction (Slope, Offset, Power, Saturation)
 8. Color curves
 9. Highlights/Shadows/Whites/Blacks recovery
10. Vibrance (with optional skin protection)
11. Clarity (local contrast via high-pass filter)
12. Sharpen/blur filters
13. Channel isolation
14. >>> DISPLAY COLOR MANAGEMENT <<< (this feature)
    a. Display transfer function (sRGB / Rec.709 / gamma-only / linear)
    b. Display gamma compensation
    c. Display brightness adjustment
15. Paint annotations (on top layer)
```

## UI/UX Specification

### Display Profile Selector Location
The Display Profile controls are located in the **View** tab of the context toolbar, in a dedicated "Display" group positioned after the channel isolation controls.

### DisplayProfileSelect Component (`src/ui/components/DisplayProfileSelect.ts`)

**Toggle Button:** "Display" with monitor icon in View tab context toolbar
- **data-testid:** `display-profile-button`
- **Keyboard Shortcut:** `Shift+D` to cycle through display profiles
- **Button Label:** Shows current profile short name (e.g., "sRGB", "709", "2.2")
- **Button highlights** when a non-linear profile is active (i.e., not "Linear")

**Dropdown Panel:**
- **data-testid:** `display-profile-dropdown`
- **Position:** Fixed dropdown below button, width 280px
- **Max Height:** 80vh with overflow scroll

**Dropdown Contents:**

#### Display Profile Section
- **data-testid:** `display-profile-section`
- **Label:** "Display Profile"

| Profile | Label | data-testid | Description |
|---------|-------|-------------|-------------|
| Linear | Linear (Bypass) | `display-profile-linear` | No transfer function, raw linear values |
| sRGB | sRGB (IEC 61966-2-1) | `display-profile-srgb` | Standard sRGB with linear blacks |
| Rec. 709 | Rec. 709 OETF | `display-profile-rec709` | HD reference monitor curve |
| Gamma 2.2 | Gamma 2.2 | `display-profile-gamma22` | Simple 2.2 power function |
| Gamma 2.4 | Gamma 2.4 | `display-profile-gamma24` | Simple 2.4 power function |
| Custom | Custom Gamma | `display-profile-custom` | User-specified gamma value |

**Active Profile Indicator:**
- Radio button style selection (only one profile active at a time)
- Active profile row has accent background `rgba(var(--accent-primary-rgb), 0.15)`
- Checkmark icon on active profile

#### Display Gamma Section
- **data-testid:** `display-gamma-section`
- **Label:** "Display Gamma Override"
- **Visibility:** Always visible; the slider modifies the gamma exponent on top of the selected transfer function

| Control | Range | Default | Step | Format | data-testid |
|---------|-------|---------|------|--------|-------------|
| Display Gamma | 0.1 to 4.0 | 1.0 | 0.01 | `X.XX` | `display-gamma-slider` |

- When gamma is 1.0, the selected transfer function is applied unmodified
- When gamma != 1.0, the transfer function output is raised to `1.0/gamma` as an additional correction
- **Double-click** slider to reset to 1.0
- **data-testid (value readout):** `display-gamma-value`

#### Display Brightness Section
- **data-testid:** `display-brightness-section`
- **Label:** "Display Brightness"

| Control | Range | Default | Step | Format | data-testid |
|---------|-------|---------|------|--------|-------------|
| Display Brightness | 0.0 to 2.0 | 1.0 | 0.01 | `X.XX` | `display-brightness-slider` |

- Multiplicative factor applied after transfer function and gamma
- Value of 1.0 means no change; 0.5 means half brightness; 2.0 means double
- Preserves hue and saturation (uniform RGB multiply)
- **Double-click** slider to reset to 1.0
- **data-testid (value readout):** `display-brightness-value`

#### Browser Color Space Info
- **data-testid:** `display-colorspace-info`
- **Label:** "Detected Display"
- Shows detected browser color space (e.g., "sRGB", "Display P3")
- Shows detected gamut capability (e.g., "sRGB gamut", "P3 gamut", "Rec.2020 gamut")
- Informational only, read-only
- **data-testid (gamut label):** `display-detected-gamut`
- **data-testid (colorspace label):** `display-detected-colorspace`

#### Reset Button
- **data-testid:** `display-profile-reset`
- **Label:** "Reset"
- Resets profile to sRGB, gamma to 1.0, brightness to 1.0

### Button States
- **Default:** Transparent background, muted text color
- **Hover:** `var(--bg-hover)` background, primary border
- **Active (non-linear profile or non-default gamma/brightness):** Accent color highlight (`rgba(var(--accent-primary-rgb), 0.15)`)
- **Disabled (no image loaded):** Reduced opacity (0.5), pointer-events none

### Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Shift+D` | Cycle display profile (Linear -> sRGB -> Rec.709 -> Gamma 2.2 -> Gamma 2.4 -> Linear) | Global, not in text input |
| `Escape` | Close display profile dropdown | When dropdown is open |

### Accessibility
- ARIA `role="radiogroup"` on profile list
- ARIA `role="radio"` with `aria-checked` on each profile option
- ARIA `role="slider"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow` on gamma and brightness sliders
- Focus management: Tab navigates between controls, Enter/Space selects profile
- Tooltip on button: "Display profile (Shift+D)"

## Technical Notes

### Implementation Files

| File | Purpose |
|------|---------|
| `src/color/DisplayTransfer.ts` | Transfer function math, GLSL generation, types |
| `src/color/DisplayTransfer.test.ts` | Unit tests for transfer functions |
| `src/color/BrowserColorSpace.ts` | Browser color space detection utilities |
| `src/color/BrowserColorSpace.test.ts` | Unit tests for browser detection |
| `src/ui/components/DisplayProfileSelect.ts` | Display profile selection UI component |
| `src/ui/components/DisplayProfileSelect.test.ts` | Unit tests for UI component |
| `src/render/Renderer.ts` | Shader integration (modify existing) |
| `src/ui/components/Viewer.ts` | Pipeline integration (modify existing) |

### Display Transfer Functions

#### sRGB Transfer Function (IEC 61966-2-1)
The sRGB EOTF inverse (encoding function) has a linear segment near black for numerical stability:

```
if (C_linear <= 0.0031308)
    C_srgb = 12.92 * C_linear
else
    C_srgb = 1.055 * C_linear^(1.0/2.4) - 0.055
```

Where `C_linear` is the linear-light input value and `C_srgb` is the sRGB-encoded output.

#### Rec. 709 OETF (BT.709)
The Rec. 709 Opto-Electronic Transfer Function for HD reference monitors:

```
if (C_linear < 0.018)
    C_709 = 4.500 * C_linear
else
    C_709 = 1.099 * C_linear^0.45 - 0.099
```

Where `C_linear` is the linear-light input and `C_709` is the Rec. 709 encoded output.

#### Simple Gamma
A pure power function with no linear segment:

```
C_out = C_linear ^ (1.0 / gamma)
```

Where `gamma` is the display gamma value (e.g., 2.2 or 2.4).

#### Display Gamma Override
Applied after the selected transfer function as an additional compensation:

```
C_final = C_transfer ^ (1.0 / displayGamma)
```

When `displayGamma = 1.0`, this is a no-op.

#### Display Brightness
Final multiplicative adjustment preserving hue:

```
C_output = C_final * displayBrightness
```

Applied uniformly to R, G, B. Clamped to [0.0, 1.0] after application.

### GLSL Shader Code

#### Transfer Function Uniforms (added to fragment shader)
```glsl
// Display color management uniforms
uniform int u_displayTransferFunction;   // 0=linear, 1=sRGB, 2=rec709, 3=gamma2.2, 4=gamma2.4, 5=custom
uniform float u_displayGamma;            // 0.1 to 4.0, default 1.0
uniform float u_displayBrightness;       // 0.0 to 2.0, default 1.0
uniform float u_displayCustomGamma;      // custom gamma value when transfer=5
```

#### sRGB Transfer Function (GLSL)
```glsl
// sRGB EOTF inverse (linear to sRGB encoding)
// IEC 61966-2-1 standard with linear segment for black stability
vec3 linearToSRGB(vec3 linear) {
    vec3 low = linear * 12.92;
    vec3 high = 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055;
    // Use step() for branchless per-component selection
    vec3 cutoff = vec3(0.0031308);
    return mix(low, high, step(cutoff, linear));
}
```

#### Rec. 709 OETF (GLSL)
```glsl
// Rec. 709 Opto-Electronic Transfer Function
// BT.709 standard for HD reference monitors
vec3 linearToRec709(vec3 linear) {
    vec3 low = linear * 4.500;
    vec3 high = 1.099 * pow(linear, vec3(0.45)) - 0.099;
    vec3 cutoff = vec3(0.018);
    return mix(low, high, step(cutoff, linear));
}
```

#### Display Color Management Function (GLSL)
```glsl
// Apply display color management (final pipeline stage)
// Called after all content-level color corrections
vec3 applyDisplayColorManagement(vec3 color, int transferFunction, float displayGamma, float displayBrightness, float customGamma) {
    // Ensure non-negative input
    color = max(color, 0.0);

    // 1. Apply transfer function
    if (transferFunction == 1) {
        // sRGB
        color = linearToSRGB(color);
    } else if (transferFunction == 2) {
        // Rec. 709
        color = linearToRec709(color);
    } else if (transferFunction == 3) {
        // Gamma 2.2
        color = pow(color, vec3(1.0 / 2.2));
    } else if (transferFunction == 4) {
        // Gamma 2.4
        color = pow(color, vec3(1.0 / 2.4));
    } else if (transferFunction == 5) {
        // Custom gamma
        color = pow(color, vec3(1.0 / customGamma));
    }
    // transferFunction == 0: linear bypass, no transform

    // 2. Display gamma override (additional compensation)
    if (displayGamma != 1.0) {
        color = pow(max(color, 0.0), vec3(1.0 / displayGamma));
    }

    // 3. Display brightness (final multiplicative adjustment preserving hue)
    color *= displayBrightness;

    // 4. Clamp to output range
    color = clamp(color, 0.0, 1.0);

    return color;
}
```

#### Integration in main() (Renderer.ts fragment shader)
```glsl
void main() {
    vec4 color = texture(u_texture, v_texCoord);

    // 1. Exposure (in stops, applied in linear space)
    color.rgb *= pow(2.0, u_exposure);

    // 2. Temperature and tint
    color.rgb = applyTemperature(color.rgb, u_temperature, u_tint);

    // 3. Brightness (content-level offset)
    color.rgb += u_brightness;

    // 4. Contrast (pivot at 0.5)
    color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;

    // 5. Saturation
    float luma = dot(color.rgb, LUMA);
    color.rgb = mix(vec3(luma), color.rgb, u_saturation);

    // 6. Tone mapping (applied before display transform for proper HDR handling)
    color.rgb = applyToneMapping(max(color.rgb, 0.0), u_toneMappingOperator);

    // 7. Content-level gamma (existing per-source control)
    color.rgb = pow(max(color.rgb, 0.0), vec3(1.0 / u_gamma));

    // 8. Display color management (FINAL STAGE)
    color.rgb = applyDisplayColorManagement(
        color.rgb,
        u_displayTransferFunction,
        u_displayGamma,
        u_displayBrightness,
        u_displayCustomGamma
    );

    fragColor = color;
}
```

### TypeScript Types

#### DisplayTransferFunction Enum
```typescript
// src/color/DisplayTransfer.ts

export type DisplayTransferFunction =
  | 'linear'
  | 'srgb'
  | 'rec709'
  | 'gamma2.2'
  | 'gamma2.4'
  | 'custom';

export const DISPLAY_TRANSFER_CODES: Record<DisplayTransferFunction, number> = {
  'linear': 0,
  'srgb': 1,
  'rec709': 2,
  'gamma2.2': 3,
  'gamma2.4': 4,
  'custom': 5,
};

export interface DisplayColorState {
  transferFunction: DisplayTransferFunction;
  displayGamma: number;       // 0.1 to 4.0, default 1.0
  displayBrightness: number;  // 0.0 to 2.0, default 1.0
  customGamma: number;        // 0.1 to 10.0, default 2.2
}

export const DEFAULT_DISPLAY_COLOR_STATE: DisplayColorState = {
  transferFunction: 'srgb',
  displayGamma: 1.0,
  displayBrightness: 1.0,
  customGamma: 2.2,
};
```

#### CPU Fallback Functions
```typescript
// src/color/DisplayTransfer.ts

/** sRGB EOTF inverse: linear -> sRGB encoded (per-channel) */
export function linearToSRGB(c: number): number {
  if (c <= 0.0031308) {
    return c * 12.92;
  }
  return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
}

/** Rec. 709 OETF: linear -> Rec. 709 encoded (per-channel) */
export function linearToRec709(c: number): number {
  if (c < 0.018) {
    return 4.5 * c;
  }
  return 1.099 * Math.pow(c, 0.45) - 0.099;
}

/** Apply display transfer function to a single channel value */
export function applyDisplayTransfer(
  value: number,
  transferFunction: DisplayTransferFunction,
  customGamma: number
): number {
  const c = Math.max(value, 0);
  switch (transferFunction) {
    case 'srgb':    return linearToSRGB(c);
    case 'rec709':  return linearToRec709(c);
    case 'gamma2.2': return Math.pow(c, 1.0 / 2.2);
    case 'gamma2.4': return Math.pow(c, 1.0 / 2.4);
    case 'custom':  return Math.pow(c, 1.0 / customGamma);
    case 'linear':
    default:        return c;
  }
}

/** Apply full display color management to an RGB triplet [0-1] */
export function applyDisplayColorManagement(
  r: number, g: number, b: number,
  state: DisplayColorState
): [number, number, number] {
  // 1. Transfer function
  r = applyDisplayTransfer(r, state.transferFunction, state.customGamma);
  g = applyDisplayTransfer(g, state.transferFunction, state.customGamma);
  b = applyDisplayTransfer(b, state.transferFunction, state.customGamma);

  // 2. Display gamma override
  if (state.displayGamma !== 1.0) {
    const invGamma = 1.0 / state.displayGamma;
    r = Math.pow(Math.max(r, 0), invGamma);
    g = Math.pow(Math.max(g, 0), invGamma);
    b = Math.pow(Math.max(b, 0), invGamma);
  }

  // 3. Display brightness (multiplicative, preserves hue)
  r = Math.min(Math.max(r * state.displayBrightness, 0), 1);
  g = Math.min(Math.max(g * state.displayBrightness, 0), 1);
  b = Math.min(Math.max(b * state.displayBrightness, 0), 1);

  return [r, g, b];
}

/** Apply display color management to ImageData (CPU fallback) */
export function applyDisplayColorManagementToImageData(
  imageData: ImageData,
  state: DisplayColorState
): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    [r, g, b] = applyDisplayColorManagement(r, g, b, state);

    data[i]     = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
    // Alpha unchanged
  }
}
```

### Browser Color Space Detection

#### Detection Utilities (`src/color/BrowserColorSpace.ts`)
```typescript
export interface BrowserColorSpaceInfo {
  colorSpace: string;       // 'srgb' | 'display-p3' | 'unknown'
  gamut: 'srgb' | 'p3' | 'rec2020' | 'unknown';
  hdr: boolean;
  bitDepth: number;         // estimated: 8, 10, 12
}

/** Detect the browser's display color space capabilities */
export function detectBrowserColorSpace(): BrowserColorSpaceInfo {
  const info: BrowserColorSpaceInfo = {
    colorSpace: 'unknown',
    gamut: 'unknown',
    hdr: false,
    bitDepth: 8,
  };

  // 1. Check screen.colorSpace (Chrome 100+, Edge 100+)
  if (typeof screen !== 'undefined' && 'colorSpace' in screen) {
    info.colorSpace = (screen as { colorSpace: string }).colorSpace || 'srgb';
  }

  // 2. Check color gamut via matchMedia
  if (typeof matchMedia !== 'undefined') {
    if (matchMedia('(color-gamut: rec2020)').matches) {
      info.gamut = 'rec2020';
    } else if (matchMedia('(color-gamut: p3)').matches) {
      info.gamut = 'p3';
    } else if (matchMedia('(color-gamut: srgb)').matches) {
      info.gamut = 'srgb';
    }

    // 3. Check HDR support
    if (matchMedia('(dynamic-range: high)').matches) {
      info.hdr = true;
    }

    // 4. Estimate bit depth from color() support
    if (matchMedia('(color-gamut: rec2020)').matches) {
      info.bitDepth = 12;
    } else if (matchMedia('(color-gamut: p3)').matches) {
      info.bitDepth = 10;
    }
  }

  return info;
}

/** Check if canvas supports display-p3 color space */
export function canvasSupportsDisplayP3(): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 1;
    testCanvas.height = 1;
    const ctx = testCanvas.getContext('2d', { colorSpace: 'display-p3' });
    return ctx !== null;
  } catch {
    return false;
  }
}
```

### Canvas Color Space Configuration

When the browser supports wide-gamut displays, the canvas rendering context should be configured accordingly:

```typescript
// In Viewer.ts or Renderer.ts initialization
function createCanvasContext(
  canvas: HTMLCanvasElement,
  preferWideGamut: boolean
): CanvasRenderingContext2D | null {
  const colorSpaceInfo = detectBrowserColorSpace();

  if (preferWideGamut && colorSpaceInfo.gamut === 'p3' && canvasSupportsDisplayP3()) {
    return canvas.getContext('2d', { colorSpace: 'display-p3' });
  }

  return canvas.getContext('2d', { colorSpace: 'srgb' });
}
```

For WebGL contexts, the equivalent uses `drawingBufferColorSpace`:
```typescript
// In Renderer.ts
const gl = canvas.getContext('webgl2', {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false,
});

if (gl && colorSpaceInfo.gamut === 'p3') {
  (gl as any).drawingBufferColorSpace = 'display-p3';
}
```

### State Persistence
Display profile settings are persisted to `localStorage` under the key `openrv-display-profile`:

```typescript
const STORAGE_KEY = 'openrv-display-profile';

export function saveDisplayProfile(state: DisplayColorState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded)
  }
}

export function loadDisplayProfile(): DisplayColorState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as DisplayColorState;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}
```

### Events Emitted

**DisplayProfileSelect:**
- `displayStateChanged: DisplayColorState` - When any display setting changes (transfer function, gamma, or brightness)
- `visibilityChanged: boolean` - When dropdown panel opens/closes

### Integration with Existing Pipeline

The display color management integrates into the existing `Renderer.ts` shader pipeline:

1. **New uniforms** are added to the fragment shader: `u_displayTransferFunction`, `u_displayGamma`, `u_displayBrightness`, `u_displayCustomGamma`
2. **New GLSL functions** `linearToSRGB()`, `linearToRec709()`, `applyDisplayColorManagement()` are added to the fragment shader
3. **Renderer.setDisplayState(state)** method sets the uniform values
4. **Viewer.ts** calls `renderer.setDisplayState()` when the `displayStateChanged` event fires from `DisplayProfileSelect`
5. **CPU fallback** in `ViewerRenderingUtils.ts` calls `applyDisplayColorManagementToImageData()` when WebGL is unavailable

### Performance Considerations
- Transfer functions use `step()` / `mix()` for branchless per-component selection in GLSL (avoids divergent branching on GPUs)
- Display gamma override check (`!= 1.0`) skips the `pow()` call when not needed
- Display brightness check (`!= 1.0`) can be similarly optimized
- CPU fallback could be accelerated with a pre-computed 256-entry LUT per transfer function for O(1) lookups
- Browser color space detection is performed once at initialization and cached

## E2E Test Cases

**File:** `e2e/display-color-management.spec.ts`

### Panel Visibility and Navigation Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DCM-001 | display profile button should be visible in View tab | Verifies `[data-testid="display-profile-button"]` exists in View tab toolbar |
| DCM-002 | clicking display profile button should open dropdown | Click button, verify `[data-testid="display-profile-dropdown"]` is visible |
| DCM-003 | pressing Escape should close display profile dropdown | Open dropdown, press Escape, verify dropdown hidden |
| DCM-004 | pressing Shift+D should cycle display profiles | Press Shift+D repeatedly, verify profile changes Linear -> sRGB -> Rec.709 -> ... |
| DCM-005 | clicking outside dropdown should close it | Open dropdown, click elsewhere, verify dropdown hidden |

### Display Profile Selection Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DCM-010 | default display profile should be sRGB | Load image, verify `[data-testid="display-profile-srgb"]` is checked |
| DCM-011 | selecting Linear profile should change canvas output | Select Linear, capture canvas, verify pixel values differ from sRGB |
| DCM-012 | selecting sRGB profile should apply sRGB transfer function | Select sRGB, verify mid-gray (0.5 linear) maps to approx 0.735 sRGB |
| DCM-013 | selecting Rec.709 profile should apply Rec.709 OETF | Select Rec.709, capture canvas, verify differs from sRGB output |
| DCM-014 | selecting Gamma 2.2 profile should apply power function | Select Gamma 2.2, verify output approximates sRGB for typical content |
| DCM-015 | selecting Gamma 2.4 profile should apply power function | Select Gamma 2.4, verify darker output than Gamma 2.2 |
| DCM-016 | active profile should have visual highlight | Select each profile, verify accent background on active item |
| DCM-017 | only one profile should be active at a time | Select a profile, verify all others are unchecked |

### Display Gamma Control Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DCM-020 | display gamma slider should default to 1.0 | Verify `[data-testid="display-gamma-slider"]` value is 1.0 |
| DCM-021 | adjusting display gamma should change canvas output | Set gamma to 1.5, capture canvas, verify pixel values changed |
| DCM-022 | display gamma 1.0 should not modify transfer function output | Set gamma to 1.0, verify output matches transfer-function-only result |
| DCM-023 | double-click display gamma slider should reset to 1.0 | Set gamma to 2.0, double-click slider, verify value resets to 1.0 |
| DCM-024 | display gamma value readout should update in real-time | Drag gamma slider, verify `[data-testid="display-gamma-value"]` updates |

### Display Brightness Control Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DCM-030 | display brightness slider should default to 1.0 | Verify `[data-testid="display-brightness-slider"]` value is 1.0 |
| DCM-031 | reducing display brightness should darken canvas | Set brightness to 0.5, capture canvas, verify darker than default |
| DCM-032 | increasing display brightness should brighten canvas | Set brightness to 1.5, capture canvas, verify brighter than default |
| DCM-033 | display brightness 0 should produce black image | Set brightness to 0.0, verify all canvas pixels are black |
| DCM-034 | display brightness should preserve hue | Set brightness to 0.5, verify R:G:B ratio remains constant |
| DCM-035 | double-click display brightness slider should reset to 1.0 | Set brightness to 0.5, double-click, verify reset |

### Browser Color Space Detection Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DCM-040 | browser color space info should be displayed | Verify `[data-testid="display-detected-colorspace"]` shows a value |
| DCM-041 | browser gamut detection should show result | Verify `[data-testid="display-detected-gamut"]` shows sRGB or P3 |

### Combined Effect Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DCM-050 | display profile should combine with content exposure | Set exposure +2 then sRGB profile, verify both applied |
| DCM-051 | display profile should combine with CDL correction | Apply CDL slope, then Rec.709 profile, verify both applied |
| DCM-052 | display profile should combine with LUT | Load LUT, select sRGB profile, verify LUT + display transform applied |
| DCM-053 | display gamma and brightness should stack correctly | Set gamma 1.5 and brightness 0.8, verify combined effect |

### Reset Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DCM-060 | reset button should restore all display settings to default | Change profile/gamma/brightness, click reset, verify all defaults |
| DCM-061 | reset should restore canvas to default sRGB appearance | After reset, verify canvas matches fresh load |

### Persistence Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DCM-070 | display profile should persist across page reloads | Set Rec.709, reload page, verify Rec.709 still selected |
| DCM-071 | display gamma should persist across page reloads | Set gamma 1.8, reload page, verify gamma is 1.8 |
| DCM-072 | display brightness should persist across page reloads | Set brightness 0.7, reload page, verify brightness is 0.7 |

### Playwright Test Skeleton
```typescript
// e2e/display-color-management.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Display Color Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Load a test image with known pixel values
    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles('e2e/fixtures/gray-ramp.png');
    await page.waitForSelector('[data-testid="viewer-canvas"]');
    // Switch to View tab
    await page.click('[data-testid="tab-view"]');
  });

  test('DCM-001: display profile button should be visible in View tab', async ({ page }) => {
    const button = page.locator('[data-testid="display-profile-button"]');
    await expect(button).toBeVisible();
  });

  test('DCM-002: clicking display profile button should open dropdown', async ({ page }) => {
    await page.click('[data-testid="display-profile-button"]');
    const dropdown = page.locator('[data-testid="display-profile-dropdown"]');
    await expect(dropdown).toBeVisible();
  });

  test('DCM-010: default display profile should be sRGB', async ({ page }) => {
    await page.click('[data-testid="display-profile-button"]');
    const srgbOption = page.locator('[data-testid="display-profile-srgb"]');
    await expect(srgbOption).toHaveAttribute('aria-checked', 'true');
  });

  test('DCM-011: selecting Linear profile should change canvas output', async ({ page }) => {
    // Capture canvas with default sRGB
    const canvas = page.locator('[data-testid="viewer-canvas"]');
    const srgbScreenshot = await canvas.screenshot();

    // Switch to Linear
    await page.click('[data-testid="display-profile-button"]');
    await page.click('[data-testid="display-profile-linear"]');
    await page.waitForTimeout(100); // Wait for re-render

    const linearScreenshot = await canvas.screenshot();
    expect(srgbScreenshot).not.toEqual(linearScreenshot);
  });

  test('DCM-020: display gamma slider should default to 1.0', async ({ page }) => {
    await page.click('[data-testid="display-profile-button"]');
    const gammaValue = page.locator('[data-testid="display-gamma-value"]');
    await expect(gammaValue).toHaveText('1.00');
  });

  test('DCM-030: display brightness slider should default to 1.0', async ({ page }) => {
    await page.click('[data-testid="display-profile-button"]');
    const brightnessValue = page.locator('[data-testid="display-brightness-value"]');
    await expect(brightnessValue).toHaveText('1.00');
  });

  test('DCM-033: display brightness 0 should produce black image', async ({ page }) => {
    await page.click('[data-testid="display-profile-button"]');
    const slider = page.locator('[data-testid="display-brightness-slider"]');
    await slider.fill('0');
    await page.waitForTimeout(100);

    // Sample center pixel
    const canvas = page.locator('[data-testid="viewer-canvas"]');
    const pixel = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="viewer-canvas"]') as HTMLCanvasElement;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      const data = ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data;
      return { r: data[0], g: data[1], b: data[2] };
    });
    expect(pixel?.r).toBe(0);
    expect(pixel?.g).toBe(0);
    expect(pixel?.b).toBe(0);
  });

  test('DCM-004: pressing Shift+D should cycle display profiles', async ({ page }) => {
    // Default is sRGB, Shift+D should go to Rec.709
    await page.keyboard.press('Shift+D');
    await page.click('[data-testid="display-profile-button"]');
    const rec709 = page.locator('[data-testid="display-profile-rec709"]');
    await expect(rec709).toHaveAttribute('aria-checked', 'true');
  });

  test('DCM-060: reset button should restore all display settings to default', async ({ page }) => {
    // Change settings
    await page.click('[data-testid="display-profile-button"]');
    await page.click('[data-testid="display-profile-rec709"]');
    const gammaSlider = page.locator('[data-testid="display-gamma-slider"]');
    await gammaSlider.fill('2.0');
    const brightnessSlider = page.locator('[data-testid="display-brightness-slider"]');
    await brightnessSlider.fill('0.5');

    // Reset
    await page.click('[data-testid="display-profile-reset"]');

    // Verify defaults
    const srgb = page.locator('[data-testid="display-profile-srgb"]');
    await expect(srgb).toHaveAttribute('aria-checked', 'true');
    const gammaValue = page.locator('[data-testid="display-gamma-value"]');
    await expect(gammaValue).toHaveText('1.00');
    const brightnessValue = page.locator('[data-testid="display-brightness-value"]');
    await expect(brightnessValue).toHaveText('1.00');
  });
});
```

## Unit Test Cases

### DisplayTransfer Unit Tests
**File:** `src/color/DisplayTransfer.test.ts`

#### sRGB Transfer Function Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DT-001 | linearToSRGB(0) should return 0 | Black maps to black |
| DT-002 | linearToSRGB(1) should return 1 | White maps to white |
| DT-003 | linearToSRGB(0.5) should return approximately 0.735 | Mid-gray sRGB encoding |
| DT-004 | linearToSRGB uses linear segment below 0.0031308 | Verify linear region: `12.92 * 0.001 = 0.01292` |
| DT-005 | linearToSRGB uses power curve above 0.0031308 | Verify power region at 0.5 |
| DT-006 | linearToSRGB is monotonically increasing | Values [0, 0.1, 0.2, ..., 1.0] are strictly increasing |
| DT-007 | linearToSRGB transition is continuous at 0.0031308 | Both formulas produce same value at cutoff |
| DT-008 | linearToSRGB clamps negative input to 0 | `linearToSRGB(-0.1)` returns 0 |

#### Rec. 709 OETF Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DT-010 | linearToRec709(0) should return 0 | Black maps to black |
| DT-011 | linearToRec709(1) should return 1 | White maps to white |
| DT-012 | linearToRec709(0.5) should return approximately 0.705 | Mid-gray Rec.709 encoding |
| DT-013 | linearToRec709 uses linear segment below 0.018 | Verify linear region: `4.5 * 0.01 = 0.045` |
| DT-014 | linearToRec709 uses power curve above 0.018 | Verify power region at 0.5 |
| DT-015 | linearToRec709 is monotonically increasing | Strictly increasing over [0, 1] |
| DT-016 | linearToRec709 transition is continuous at 0.018 | Both formulas match at cutoff |
| DT-017 | linearToRec709 differs from sRGB | `linearToRec709(0.5) != linearToSRGB(0.5)` |

#### Display Transfer Application Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DT-020 | applyDisplayTransfer with 'linear' returns unchanged value | Identity transform |
| DT-021 | applyDisplayTransfer with 'srgb' calls linearToSRGB | Verify sRGB path |
| DT-022 | applyDisplayTransfer with 'rec709' calls linearToRec709 | Verify Rec.709 path |
| DT-023 | applyDisplayTransfer with 'gamma2.2' applies pow(1/2.2) | Verify gamma 2.2 |
| DT-024 | applyDisplayTransfer with 'gamma2.4' applies pow(1/2.4) | Verify gamma 2.4 |
| DT-025 | applyDisplayTransfer with 'custom' uses customGamma parameter | Verify custom gamma |
| DT-026 | applyDisplayTransfer clamps negative input to 0 | No negative output |

#### Display Color Management Pipeline Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DT-030 | applyDisplayColorManagement with all defaults returns sRGB output | Default state applies sRGB |
| DT-031 | display gamma 1.0 does not modify output | No-op gamma override |
| DT-032 | display gamma 2.0 further brightens output | Additional gamma compensation |
| DT-033 | display brightness 1.0 does not modify output | No-op brightness |
| DT-034 | display brightness 0.5 halves all channels | Verify multiplicative reduction |
| DT-035 | display brightness 0.0 produces black | Zero brightness = black |
| DT-036 | display brightness preserves R:G:B ratio | Hue preservation check |
| DT-037 | output is clamped to [0, 1] range | No overflow or underflow |
| DT-038 | full pipeline order is transfer -> gamma -> brightness | Verify operation order |

#### ImageData Processing Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DT-040 | applyDisplayColorManagementToImageData processes all pixels | Verify all pixels transformed |
| DT-041 | applyDisplayColorManagementToImageData preserves alpha | Alpha channel unchanged |
| DT-042 | applyDisplayColorManagementToImageData with linear state is identity | No change when linear + defaults |
| DT-043 | applyDisplayColorManagementToImageData handles single pixel | Edge case: 1x1 image |
| DT-044 | applyDisplayColorManagementToImageData handles empty ImageData | Edge case: 0x0 image |

#### Default State Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| DT-050 | DEFAULT_DISPLAY_COLOR_STATE has srgb transfer function | Default profile is sRGB |
| DT-051 | DEFAULT_DISPLAY_COLOR_STATE has gamma 1.0 | Default gamma override is 1.0 |
| DT-052 | DEFAULT_DISPLAY_COLOR_STATE has brightness 1.0 | Default brightness is 1.0 |
| DT-053 | DEFAULT_DISPLAY_COLOR_STATE has customGamma 2.2 | Default custom gamma is 2.2 |
| DT-054 | DISPLAY_TRANSFER_CODES has correct integer mappings | Verify code lookup table |

### Vitest Test Skeleton
```typescript
// src/color/DisplayTransfer.test.ts
import { describe, it, expect } from 'vitest';
import {
  linearToSRGB,
  linearToRec709,
  applyDisplayTransfer,
  applyDisplayColorManagement,
  applyDisplayColorManagementToImageData,
  DEFAULT_DISPLAY_COLOR_STATE,
  DISPLAY_TRANSFER_CODES,
} from './DisplayTransfer';

describe('DisplayTransfer', () => {
  describe('linearToSRGB', () => {
    it('DT-001: linearToSRGB(0) should return 0', () => {
      expect(linearToSRGB(0)).toBe(0);
    });

    it('DT-002: linearToSRGB(1) should return 1', () => {
      expect(linearToSRGB(1)).toBeCloseTo(1.0, 4);
    });

    it('DT-003: linearToSRGB(0.5) should return approximately 0.735', () => {
      expect(linearToSRGB(0.5)).toBeCloseTo(0.735, 2);
    });

    it('DT-004: linearToSRGB uses linear segment below 0.0031308', () => {
      const input = 0.001;
      expect(linearToSRGB(input)).toBeCloseTo(12.92 * input, 6);
    });

    it('DT-006: linearToSRGB is monotonically increasing', () => {
      let prev = -1;
      for (let i = 0; i <= 10; i++) {
        const val = linearToSRGB(i / 10);
        expect(val).toBeGreaterThan(prev);
        prev = val;
      }
    });

    it('DT-007: linearToSRGB transition is continuous at 0.0031308', () => {
      const cutoff = 0.0031308;
      const fromLinear = 12.92 * cutoff;
      const fromPower = 1.055 * Math.pow(cutoff, 1.0 / 2.4) - 0.055;
      expect(fromLinear).toBeCloseTo(fromPower, 4);
    });
  });

  describe('linearToRec709', () => {
    it('DT-010: linearToRec709(0) should return 0', () => {
      expect(linearToRec709(0)).toBe(0);
    });

    it('DT-011: linearToRec709(1) should return 1', () => {
      expect(linearToRec709(1)).toBeCloseTo(1.0, 4);
    });

    it('DT-012: linearToRec709(0.5) should return approximately 0.705', () => {
      expect(linearToRec709(0.5)).toBeCloseTo(0.705, 2);
    });

    it('DT-017: linearToRec709 differs from sRGB', () => {
      expect(linearToRec709(0.5)).not.toBeCloseTo(linearToSRGB(0.5), 2);
    });
  });

  describe('applyDisplayTransfer', () => {
    it('DT-020: linear returns unchanged value', () => {
      expect(applyDisplayTransfer(0.5, 'linear', 2.2)).toBe(0.5);
    });

    it('DT-023: gamma2.2 applies pow(1/2.2)', () => {
      const input = 0.5;
      const expected = Math.pow(input, 1.0 / 2.2);
      expect(applyDisplayTransfer(input, 'gamma2.2', 2.2)).toBeCloseTo(expected, 6);
    });

    it('DT-026: clamps negative input to 0', () => {
      expect(applyDisplayTransfer(-0.5, 'srgb', 2.2)).toBe(0);
    });
  });

  describe('applyDisplayColorManagement', () => {
    it('DT-030: defaults returns sRGB output', () => {
      const [r, g, b] = applyDisplayColorManagement(0.5, 0.5, 0.5, DEFAULT_DISPLAY_COLOR_STATE);
      expect(r).toBeCloseTo(linearToSRGB(0.5), 4);
      expect(g).toBeCloseTo(linearToSRGB(0.5), 4);
      expect(b).toBeCloseTo(linearToSRGB(0.5), 4);
    });

    it('DT-035: brightness 0.0 produces black', () => {
      const state = { ...DEFAULT_DISPLAY_COLOR_STATE, displayBrightness: 0 };
      const [r, g, b] = applyDisplayColorManagement(0.5, 0.5, 0.5, state);
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });

    it('DT-036: brightness preserves R:G:B ratio', () => {
      const state = { ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'linear' as const, displayBrightness: 0.5 };
      const [r, g, b] = applyDisplayColorManagement(0.8, 0.4, 0.2, state);
      // Ratios should be 4:2:1
      expect(r / b).toBeCloseTo(4, 4);
      expect(g / b).toBeCloseTo(2, 4);
    });

    it('DT-037: output is clamped to [0, 1]', () => {
      const state = { ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'linear' as const, displayBrightness: 2.0 };
      const [r, g, b] = applyDisplayColorManagement(0.8, 0.9, 1.0, state);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(1);
    });
  });

  describe('applyDisplayColorManagementToImageData', () => {
    it('DT-041: preserves alpha channel', () => {
      const imageData = new ImageData(new Uint8ClampedArray([128, 64, 32, 200]), 1, 1);
      applyDisplayColorManagementToImageData(imageData, DEFAULT_DISPLAY_COLOR_STATE);
      expect(imageData.data[3]).toBe(200);
    });
  });

  describe('constants', () => {
    it('DT-050: default transfer function is srgb', () => {
      expect(DEFAULT_DISPLAY_COLOR_STATE.transferFunction).toBe('srgb');
    });

    it('DT-054: DISPLAY_TRANSFER_CODES has correct mappings', () => {
      expect(DISPLAY_TRANSFER_CODES['linear']).toBe(0);
      expect(DISPLAY_TRANSFER_CODES['srgb']).toBe(1);
      expect(DISPLAY_TRANSFER_CODES['rec709']).toBe(2);
      expect(DISPLAY_TRANSFER_CODES['gamma2.2']).toBe(3);
      expect(DISPLAY_TRANSFER_CODES['gamma2.4']).toBe(4);
      expect(DISPLAY_TRANSFER_CODES['custom']).toBe(5);
    });
  });
});
```

### BrowserColorSpace Unit Tests
**File:** `src/color/BrowserColorSpace.test.ts`

| ID | Test Name | Description |
|----|-----------|-------------|
| BCS-001 | detectBrowserColorSpace returns valid object | All fields present with valid types |
| BCS-002 | colorSpace is string | typeof check |
| BCS-003 | gamut is one of known values | 'srgb', 'p3', 'rec2020', or 'unknown' |
| BCS-004 | hdr is boolean | typeof check |
| BCS-005 | bitDepth is number >= 8 | Minimum 8-bit |
| BCS-010 | canvasSupportsDisplayP3 returns boolean | typeof check |
| BCS-011 | canvasSupportsDisplayP3 does not throw | No exceptions on any browser |

### DisplayProfileSelect Unit Tests
**File:** `src/ui/components/DisplayProfileSelect.test.ts`

| ID | Test Name | Description |
|----|-----------|-------------|
| DPS-001 | starts with default display state (sRGB, gamma 1.0, brightness 1.0) | Initial state check |
| DPS-002 | render returns HTMLElement | Render method returns element |
| DPS-003 | render contains display profile button | Button with correct data-testid |
| DPS-004 | button shows "sRGB" label by default | Default button text |
| DPS-010 | getState returns copy of display state | Returns new object reference |
| DPS-011 | setState updates transfer function | Set to rec709, verify state |
| DPS-012 | setState updates display gamma | Set gamma to 2.0, verify |
| DPS-013 | setState updates display brightness | Set brightness to 0.5, verify |
| DPS-014 | setState emits displayStateChanged event | Event fired on change |
| DPS-015 | setState emits copy of state | Emitted state is a different object |
| DPS-020 | setTransferFunction changes only transfer function | Other fields unchanged |
| DPS-021 | setDisplayGamma clamps to [0.1, 4.0] | Out-of-range values clamped |
| DPS-022 | setDisplayBrightness clamps to [0.0, 2.0] | Out-of-range values clamped |
| DPS-030 | reset restores all values to defaults | Full reset check |
| DPS-031 | reset emits displayStateChanged with defaults | Event contains default state |
| DPS-040 | toggle shows panel when hidden | Panel toggle open |
| DPS-041 | toggle hides panel when visible | Panel toggle close |
| DPS-042 | show emits visibilityChanged true | Visibility event on show |
| DPS-043 | hide emits visibilityChanged false | Visibility event on hide |
| DPS-044 | show is idempotent | Multiple show calls do not re-emit |
| DPS-045 | hide is idempotent | Multiple hide calls do not re-emit |
| DPS-050 | Shift+D cycles through profiles in order | Linear -> sRGB -> Rec.709 -> Gamma2.2 -> Gamma2.4 -> Linear |
| DPS-051 | Shift+D wraps from last profile to first | Gamma2.4 -> Linear |
| DPS-052 | Shift+D does not fire when input is focused | Text input focus suppresses shortcut |
| DPS-060 | persists state to localStorage on change | Verify localStorage.setItem called |
| DPS-061 | restores state from localStorage on init | Verify saved state is loaded |
| DPS-062 | handles missing localStorage gracefully | No error when localStorage unavailable |
| DPS-070 | button highlights when non-default profile active | Accent class applied for Linear |
| DPS-071 | button highlights when gamma is non-default | Accent class applied when gamma != 1.0 |
| DPS-072 | button highlights when brightness is non-default | Accent class applied when brightness != 1.0 |
| DPS-073 | button is default style when all values are default | No accent class for sRGB + gamma 1.0 + brightness 1.0 |
| DPS-080 | dispose removes event listeners | No errors after dispose |
| DPS-081 | dispose removes DOM elements | Panel removed from DOM |

### Vitest Test Skeleton (DisplayProfileSelect)
```typescript
// src/ui/components/DisplayProfileSelect.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DisplayProfileSelect } from './DisplayProfileSelect';
import { DEFAULT_DISPLAY_COLOR_STATE } from '../../color/DisplayTransfer';

describe('DisplayProfileSelect', () => {
  let component: DisplayProfileSelect;

  beforeEach(() => {
    component = new DisplayProfileSelect();
  });

  afterEach(() => {
    component.dispose();
  });

  describe('initialization', () => {
    it('DPS-001: starts with default display state', () => {
      const state = component.getState();
      expect(state.transferFunction).toBe('srgb');
      expect(state.displayGamma).toBe(1.0);
      expect(state.displayBrightness).toBe(1.0);
    });

    it('DPS-002: render returns HTMLElement', () => {
      const el = component.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('DPS-003: render contains display profile button', () => {
      const el = component.render();
      const button = el.querySelector('[data-testid="display-profile-button"]');
      expect(button).not.toBeNull();
    });
  });

  describe('state management', () => {
    it('DPS-010: getState returns copy', () => {
      const a = component.getState();
      const b = component.getState();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it('DPS-014: setState emits displayStateChanged event', () => {
      const handler = vi.fn();
      component.on('displayStateChanged', handler);
      component.setState({ transferFunction: 'rec709' });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].transferFunction).toBe('rec709');
    });

    it('DPS-021: setDisplayGamma clamps to [0.1, 4.0]', () => {
      component.setDisplayGamma(0.01);
      expect(component.getState().displayGamma).toBe(0.1);
      component.setDisplayGamma(10);
      expect(component.getState().displayGamma).toBe(4.0);
    });

    it('DPS-022: setDisplayBrightness clamps to [0.0, 2.0]', () => {
      component.setDisplayBrightness(-1);
      expect(component.getState().displayBrightness).toBe(0.0);
      component.setDisplayBrightness(5);
      expect(component.getState().displayBrightness).toBe(2.0);
    });
  });

  describe('reset', () => {
    it('DPS-030: reset restores defaults', () => {
      component.setState({ transferFunction: 'rec709', displayGamma: 2.0, displayBrightness: 0.5 });
      component.reset();
      expect(component.getState()).toEqual(DEFAULT_DISPLAY_COLOR_STATE);
    });
  });

  describe('keyboard shortcuts', () => {
    it('DPS-050: Shift+D cycles through profiles', () => {
      // Default is sRGB
      const event1 = new KeyboardEvent('keydown', { key: 'D', shiftKey: true });
      component.handleKeyDown(event1);
      expect(component.getState().transferFunction).toBe('rec709');

      const event2 = new KeyboardEvent('keydown', { key: 'D', shiftKey: true });
      component.handleKeyDown(event2);
      expect(component.getState().transferFunction).toBe('gamma2.2');
    });
  });
});
```

## GLSL Shader Reference

### Complete Transfer Function Library
The following GLSL code should be added to the fragment shader in `src/render/Renderer.ts`:

```glsl
// ========================================================================
// Display Color Management - Transfer Functions
// Applied as the FINAL stage in the rendering pipeline
// ========================================================================

// sRGB EOTF inverse (IEC 61966-2-1)
// Linear segment below 0.0031308 for numerical stability near black
// Power segment (approx gamma 2.4) above for perceptual uniformity
vec3 linearToSRGB(vec3 linear) {
    vec3 low  = linear * 12.92;
    vec3 high = 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055;
    return mix(low, high, step(vec3(0.0031308), linear));
}

// Rec. 709 OETF (BT.709)
// Linear segment below 0.018 for camera noise floor
// 0.45 power segment above for broadcast compatibility
vec3 linearToRec709(vec3 linear) {
    vec3 low  = linear * 4.500;
    vec3 high = 1.099 * pow(linear, vec3(0.45)) - 0.099;
    return mix(low, high, step(vec3(0.018), linear));
}

// Apply the complete display color management chain
vec3 applyDisplayColorManagement(
    vec3 color,
    int transferFunction,
    float displayGamma,
    float displayBrightness,
    float customGamma
) {
    // Clamp to non-negative (transfer functions require non-negative input)
    color = max(color, 0.0);

    // Step 1: Apply selected transfer function
    if (transferFunction == 1) {
        color = linearToSRGB(color);
    } else if (transferFunction == 2) {
        color = linearToRec709(color);
    } else if (transferFunction == 3) {
        color = pow(color, vec3(1.0 / 2.2));
    } else if (transferFunction == 4) {
        color = pow(color, vec3(1.0 / 2.4));
    } else if (transferFunction == 5) {
        color = pow(color, vec3(1.0 / customGamma));
    }
    // transferFunction == 0: linear pass-through

    // Step 2: Display gamma override
    // When displayGamma != 1.0, apply additional gamma compensation
    // This adjusts for monitors that deviate from the nominal EOTF
    if (displayGamma != 1.0) {
        color = pow(max(color, 0.0), vec3(1.0 / displayGamma));
    }

    // Step 3: Display brightness (multiplicative, hue-preserving)
    color *= displayBrightness;

    // Step 4: Final clamp to displayable range
    return clamp(color, 0.0, 1.0);
}
```

### Numerical Reference Values

These reference values can be used for verification in both unit and E2E tests:

| Linear Input | sRGB Output | Rec. 709 Output | Gamma 2.2 | Gamma 2.4 |
|-------------|-------------|-----------------|-----------|-----------|
| 0.0         | 0.0         | 0.0             | 0.0       | 0.0       |
| 0.001       | 0.01292     | 0.00450         | 0.06030   | 0.07192   |
| 0.01        | 0.12920     | 0.04500         | 0.16596   | 0.18836   |
| 0.18        | 0.46135     | 0.40900         | 0.45595   | 0.44284   |
| 0.50        | 0.73536     | 0.70474         | 0.72974   | 0.71795   |
| 0.90        | 0.95455     | 0.94868         | 0.95314   | 0.95060   |
| 1.0         | 1.0         | 1.0             | 1.0       | 1.0       |

## File Structure

```
src/
  color/
    DisplayTransfer.ts              - Transfer function math, types, CPU fallback, GLSL generation
    DisplayTransfer.test.ts         - Unit tests (44 tests)
    BrowserColorSpace.ts            - Browser color space / gamut detection utilities
    BrowserColorSpace.test.ts       - Unit tests (7 tests)
  ui/
    components/
      DisplayProfileSelect.ts       - Display profile selection UI component
      DisplayProfileSelect.test.ts  - Unit tests (30 tests)
  render/
    Renderer.ts                      - MODIFY: Add display transfer uniforms and GLSL functions
e2e/
  display-color-management.spec.ts  - E2E tests (25 tests)
  fixtures/
    gray-ramp.png                   - Test fixture: linear gradient from black to white
```

## References

- IEC 61966-2-1 (sRGB): https://www.color.org/chardata/rgb/srgb.xhtml
- ITU-R BT.709-6 (Rec. 709): https://www.itu.int/rec/R-REC-BT.709-6-201506-I/en
- CSS Color Level 4 `color-gamut` media query: https://drafts.csswg.org/mediaqueries-5/#color-gamut
- HTML Canvas color space: https://html.spec.whatwg.org/multipage/canvas.html#colour-spaces-and-colour-correction
- `screen.colorSpace` API: https://developer.mozilla.org/en-US/docs/Web/API/Screen/colorSpace
- WebGL `drawingBufferColorSpace`: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/drawingBufferColorSpace
- Existing color correction spec: `/Users/lifeart/Repos/openrv-web/features/color-correction.md`
- Existing color management spec: `/Users/lifeart/Repos/openrv-web/features/color-management.md`
- HDR display spec: `/Users/lifeart/Repos/openrv-web/features/hdr-display.md`
