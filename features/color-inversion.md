# Global Color Inversion

## Original OpenRV Implementation
OpenRV provides per-source color inversion using a negation matrix with constant 1.0 offset:

- **Inversion Formula**: `output = 1.0 - input` for each RGB channel, alpha preserved
- **Negation Matrix**: Diagonal matrix with -1 coefficients and 1.0 constant offset
- **Use Cases**:
  - Viewing film negatives
  - Inverting compositing mattes for debugging
  - Quick polarity check during color grading
  - Comparing negative/positive versions of an image

The inversion is applied in the GPU pipeline as a matrix operation for real-time performance.

## Status
- [x] Not implemented
- [ ] Partially implemented
- [ ] Fully implemented

**Analysis Date**: 2026-02-03

**Current State**:
- The HSL Qualifier has an `invert` parameter, but this inverts the qualification matte, not the image colors
- No global color inversion toggle exists in the UI or rendering pipeline
- The `color-correction.md` feature spec explicitly lists "Color Inversion" as **Not Implemented**

**Related Files**:
- `/src/ui/components/Viewer.ts` - Main viewer with render pipeline
- `/src/ui/components/ColorControls.ts` - Color adjustments panel (Color tab)
- `/src/utils/EffectProcessor.ts` - Effect processing pipeline
- `/src/utils/KeyBindings.ts` - Keyboard shortcut definitions

## Requirements
| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Global color inversion toggle | Not Implemented | Toggle button in Color tab + keyboard shortcut |
| Negation matrix (1.0 - input per channel) | Not Implemented | Applied as post-processing step in render pipeline |
| Alpha channel preservation | Not Implemented | Only RGB channels inverted, alpha untouched |
| Keyboard shortcut (Ctrl+I) | Not Implemented | Quick toggle via KeyBindings registration |
| Integration with existing color corrections | Not Implemented | Applied after CDL/curves, before channel isolation |
| WebGL shader support | Not Implemented | Simple fragment shader for GPU-accelerated inversion |
| UI toggle button in Color tab | Not Implemented | Button with active state highlight |
| State persistence across frames | Not Implemented | Inversion state persists during frame navigation |
| Reset functionality | Not Implemented | Reset via button or when clearing all color corrections |

## UI/UX Specification

### Color Tab Location
The Color Inversion toggle is located in the **Color** tab of the context toolbar, alongside the existing Color and CDL buttons.

**Access via**:
- Click the "Color" tab in the tab bar (or press `2`)
- Click the "Invert" button in the Color tab context toolbar
- Press `Ctrl+I` from any tab to toggle inversion

### Invert Toggle Button (`src/ui/components/ColorInversionToggle.ts`)
**Toggle Button:** "Invert" with contrast icon in Color tab context toolbar
- **Keyboard Shortcut:** `Ctrl+I` to toggle inversion on/off
- **Button Position:** After the CDL button in the Color tab toolbar

**Button States**:
| State | Background | Text Color | Border |
|-------|-----------|------------|--------|
| Default (off) | Transparent | `var(--text-muted)` | None |
| Hover | `var(--bg-hover)` | `var(--text-primary)` | `var(--border-primary)` |
| Active (inversion on) | `rgba(var(--accent-primary-rgb), 0.15)` | `var(--accent-primary)` | `var(--accent-primary)` |

**Button Label**: "Invert" with a contrast/swap icon (using `getIconSvg('contrast')` or similar)

**Tooltip**: "Invert Colors (Ctrl+I)"

**`data-testid` Attributes**:
| Element | `data-testid` |
|---------|---------------|
| Invert toggle button | `color-inversion-toggle` |
| Button label text | `color-inversion-label` |

### Interaction Behavior
- Clicking the button toggles inversion immediately (no panel/dropdown)
- The button highlights with accent color when inversion is active
- Inversion state is independent of other color controls
- Reset in ColorControls does NOT reset inversion (separate concern)
- A dedicated reset is available via clicking the button again or pressing `Ctrl+I`

## Technical Notes

### Implementation Files
| File | Purpose |
|------|---------|
| `src/ui/components/ColorInversionToggle.ts` | Toggle button UI component |
| `src/ui/components/ColorInversionToggle.test.ts` | Unit tests for toggle component |
| `src/color/Inversion.ts` | Inversion math functions (CPU path) |
| `src/color/Inversion.test.ts` | Unit tests for inversion math |
| `src/shaders/inversion.frag.glsl` | WebGL fragment shader for GPU path |
| `e2e/color-inversion.spec.ts` | E2E Playwright tests |

### Inversion Formula
The global color inversion applies a simple negation to each RGB channel:

```
output.r = 1.0 - input.r
output.g = 1.0 - input.g
output.b = 1.0 - input.b
output.a = input.a  // alpha preserved
```

This is equivalent to a negation matrix:
```
| -1  0  0  0 |   | r |   | 1 |
|  0 -1  0  0 | x | g | + | 1 |
|  0  0 -1  0 |   | b |   | 1 |
|  0  0  0  1 |   | a |   | 0 |
```

### CPU Implementation (`src/color/Inversion.ts`)

```typescript
/**
 * Apply color inversion to ImageData in-place.
 * Inverts RGB channels (output = 255 - input), preserves alpha.
 */
export function applyColorInversion(imageData: ImageData): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = 255 - data[i];     // R
    data[i + 1] = 255 - data[i + 1]; // G
    data[i + 2] = 255 - data[i + 2]; // B
    // data[i + 3] unchanged (alpha preserved)
  }
}

/**
 * Check if a pixel is correctly inverted.
 * Useful for test assertions.
 */
export function isInvertedPixel(
  original: [number, number, number, number],
  inverted: [number, number, number, number]
): boolean {
  return (
    inverted[0] === 255 - original[0] &&
    inverted[1] === 255 - original[1] &&
    inverted[2] === 255 - original[2] &&
    inverted[3] === original[3]
  );
}
```

### WebGL Shader Implementation (`src/shaders/inversion.frag.glsl`)

```glsl
precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_image;
uniform bool u_enabled;

void main() {
  vec4 color = texture2D(u_image, v_texCoord);

  if (u_enabled) {
    // Invert RGB channels, preserve alpha
    color.rgb = 1.0 - color.rgb;
  }

  gl_FragColor = color;
}
```

For integration into an existing multi-effect shader pass, the inversion can be a single line:

```glsl
// Inside the main color correction shader, after CDL and curves:
if (u_invertColors) {
  color.rgb = 1.0 - color.rgb;
}
```

### Render Pipeline Integration

Color inversion is applied as a post-processing step in the `Viewer.ts` `renderImage()` method. It is inserted **after** CDL/curves/HSL Qualifier corrections and **before** channel isolation:

1. Draw source image with transform (rotation/flip)
2. Apply crop
3. Stereo mode transformation
4. Lens distortion
5. 3D LUT application
6. Color adjustments (exposure, contrast, saturation, gamma, temperature, tint, brightness)
7. Highlights/Shadows/Whites/Blacks recovery
8. Vibrance (with optional skin protection)
9. Clarity (local contrast via high-pass filter)
10. Color wheels (Lift/Gamma/Gain)
11. CDL correction (Slope, Offset, Power, Saturation)
12. Color curves
13. HSL Qualifier
14. **Color inversion** <-- Applied here
15. Sharpen/blur filters
16. Channel isolation
17. False color / Zebra stripes / Clipping overlay
18. Paint annotations

**Rationale for pipeline position**: Inversion is applied after all color grading operations so the user sees the inverted result of their full grade. It is applied before channel isolation and diagnostic overlays so those tools can inspect the inverted image.

### Interaction with Other Color Corrections

| Correction | Interaction with Inversion |
|------------|---------------------------|
| Exposure | Inversion applied after exposure. A +2 stop exposure followed by inversion produces a dark image (bright pixels become dark after inversion). |
| Contrast | Inversion reverses contrast direction. High contrast + inversion still shows high contrast but with inverted tones. |
| Saturation | Inversion preserves saturation level but shifts hues by 180 degrees. Desaturated (grayscale) images invert cleanly to complementary grays. |
| Gamma | Gamma curve is applied first, then inverted. Gamma 2.0 + inversion differs from inversion + gamma 2.0. |
| CDL (Slope/Offset/Power) | CDL is applied before inversion. The inverted result reflects the CDL-graded image. |
| 3D LUT | LUT is applied before inversion. The LUT-transformed colors are then negated. |
| Color Curves | Curves are applied before inversion. Custom curve shapes are reflected in the inverted output. |
| Channel Isolation | Channel isolation is applied after inversion. Viewing the red channel of an inverted image shows `255 - R` as grayscale. |
| Double Inversion | Applying inversion twice returns to the original image (`1.0 - (1.0 - x) = x`). This is the expected toggle behavior. |

### State Management
- Inversion state stored as `Viewer.colorInversionEnabled: boolean` (default: `false`)
- Exposed via `setColorInversion(enabled: boolean)` and `getColorInversion(): boolean`
- State accessible in test helper via `ViewerState.colorInversionEnabled`
- Persists across frame navigation and tab switches
- Toggle via `toggleColorInversion()` method

### Events Emitted
**ColorInversionToggle:**
- `inversionChanged: boolean` - When inversion is toggled on or off

### Keyboard Shortcut Registration
In `src/utils/KeyBindings.ts`, add:
```typescript
'color.toggleInversion': {
  code: 'KeyI',
  ctrl: true,
  description: 'Toggle color inversion',
},
```

## E2E Test Cases
**File:** `e2e/color-inversion.spec.ts`

### Toggle Visibility Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| INV-001 | color tab should show inversion toggle button | Verifies Invert button is visible in Color tab |
| INV-002 | inversion toggle should have correct data-testid | Verifies `data-testid="color-inversion-toggle"` exists |
| INV-003 | inversion should be off by default | Verifies button is not in active state initially |

### Keyboard Shortcut Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| INV-010 | pressing Ctrl+I should toggle color inversion on | Tests keyboard shortcut enables inversion |
| INV-011 | pressing Ctrl+I again should toggle color inversion off | Tests keyboard shortcut disables inversion |
| INV-012 | Ctrl+I should work from any tab | Tests shortcut works when not on Color tab |
| INV-013 | Ctrl+I should not trigger when typing in text input | Tests input field isolation |

### Visual Effect Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| INV-020 | enabling inversion should visually change the canvas | Captures canvas before/after and verifies pixel difference |
| INV-021 | inversion should invert RGB channels | Verifies pixel values are `255 - original` for R, G, B |
| INV-022 | inversion should preserve alpha channel | Verifies alpha values remain unchanged after inversion |
| INV-023 | double inversion should restore original image | Toggle on then off, verify canvas matches original |

### Button State Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| INV-030 | clicking invert button should activate it | Verifies button gets accent highlight on click |
| INV-031 | clicking active invert button should deactivate it | Verifies button returns to default state |
| INV-032 | invert button should show active state when inversion is on | Verifies visual indication matches state |

### Interaction with Other Corrections Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| INV-040 | inversion should combine with exposure adjustment | Applies exposure then inversion, verifies both are visible |
| INV-041 | inversion should combine with saturation adjustment | Applies desaturation then inversion, verifies grayscale inversion |
| INV-042 | inversion should work with CDL correction active | Applies CDL then inversion, verifies combined result |
| INV-043 | inversion should work with LUT applied | Loads LUT then enables inversion, verifies combined result |
| INV-044 | inversion should work with channel isolation | Enables inversion then isolates red channel, verifies inverted red |

### State Persistence Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| INV-050 | inversion state should persist across frame changes | Enables inversion, changes frame, verifies still inverted |
| INV-051 | inversion state should persist across tab switches | Enables inversion, switches tabs, returns, verifies still active |

### Reset Behavior Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| INV-060 | color controls reset should NOT reset inversion | Verifies inversion is independent of ColorControls reset |
| INV-061 | toggling inversion off should restore pre-inversion image | Verifies disabling inversion returns to original |

## Unit Test Cases

### ColorInversionToggle Unit Tests
**File:** `src/ui/components/ColorInversionToggle.test.ts`

| ID | Test Name | Description |
|----|-----------|-------------|
| INVT-001 | starts with inversion disabled | Initial state is `false` |
| INVT-002 | render returns HTMLElement | Render method returns valid element |
| INVT-003 | render returns container with toggle button | Container has button child |
| INVT-004 | toggle button has correct data-testid | `data-testid="color-inversion-toggle"` |
| INVT-005 | toggle button displays "Invert" label | Button text content |
| INVT-006 | toggle enables inversion when off | `toggle()` sets state to `true` |
| INVT-007 | toggle disables inversion when on | `toggle()` sets state back to `false` |
| INVT-008 | setEnabled(true) enables inversion | Direct setter |
| INVT-009 | setEnabled(false) disables inversion | Direct setter |
| INVT-010 | getEnabled returns current state | Getter reflects state |
| INVT-011 | emits inversionChanged event on toggle | Event fired with new boolean value |
| INVT-012 | emits inversionChanged(true) when enabling | Event value is `true` |
| INVT-013 | emits inversionChanged(false) when disabling | Event value is `false` |
| INVT-014 | does not emit event if state unchanged | `setEnabled(false)` when already false |
| INVT-015 | button has default styling when off | No accent highlight |
| INVT-016 | button has active styling when on | Accent color highlight applied |
| INVT-017 | button styling updates on toggle | Visual state matches logical state |
| INVT-018 | dispose removes event listeners | Cleanup without error |
| INVT-019 | dispose is idempotent | Multiple dispose calls safe |
| INVT-020 | setEnabled is idempotent for same value | No re-emit on same state |

### Inversion Math Unit Tests
**File:** `src/color/Inversion.test.ts`

| ID | Test Name | Description |
|----|-----------|-------------|
| INV-U001 | inverts pure black to pure white | `[0,0,0,255]` -> `[255,255,255,255]` |
| INV-U002 | inverts pure white to pure black | `[255,255,255,255]` -> `[0,0,0,255]` |
| INV-U003 | inverts mid-gray to mid-gray | `[128,128,128,255]` -> `[127,127,127,255]` |
| INV-U004 | inverts pure red correctly | `[255,0,0,255]` -> `[0,255,255,255]` (cyan) |
| INV-U005 | inverts pure green correctly | `[0,255,0,255]` -> `[255,0,255,255]` (magenta) |
| INV-U006 | inverts pure blue correctly | `[0,0,255,255]` -> `[255,255,0,255]` (yellow) |
| INV-U007 | preserves alpha channel (fully opaque) | Alpha 255 remains 255 |
| INV-U008 | preserves alpha channel (semi-transparent) | Alpha 128 remains 128 |
| INV-U009 | preserves alpha channel (fully transparent) | Alpha 0 remains 0 |
| INV-U010 | inverts arbitrary pixel correctly | `[100,150,200,180]` -> `[155,105,55,180]` |
| INV-U011 | handles single pixel ImageData | 1x1 ImageData inverted correctly |
| INV-U012 | handles multi-pixel ImageData | 4x4 ImageData all pixels inverted |
| INV-U013 | double inversion restores original | Apply twice, data matches original |
| INV-U014 | modifies ImageData in-place | Same ImageData reference, data changed |
| INV-U015 | does not allocate new ImageData | No new object created |
| INV-U016 | handles empty ImageData (0x0) | No error on edge case |
| INV-U017 | isInvertedPixel returns true for correctly inverted pixel | Validation helper |
| INV-U018 | isInvertedPixel returns false for non-inverted pixel | Validation helper |
| INV-U019 | isInvertedPixel checks alpha preservation | Alpha mismatch returns false |
| INV-U020 | performance: inverts 1920x1080 image under 16ms | Benchmark for real-time viability |

## GLSL Reference

### Standalone Fragment Shader
```glsl
// inversion.frag.glsl
precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_image;
uniform bool u_invertColors;

void main() {
  vec4 color = texture2D(u_image, v_texCoord);

  if (u_invertColors) {
    color.rgb = 1.0 - color.rgb;
  }

  gl_FragColor = color;
}
```

### Integration into Existing Multi-Effect Shader
If the rendering pipeline uses a combined shader pass for color corrections, the inversion step is a single conditional after existing corrections:

```glsl
// ... after CDL, curves, and other corrections ...

// Global color inversion
if (u_invertColors) {
  color.rgb = 1.0 - color.rgb;
}

// ... before channel isolation and diagnostic overlays ...
```

### Vertex Shader (shared, standard passthrough)
```glsl
// passthrough.vert.glsl
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
```

## File Structure

```
src/
  color/
    Inversion.ts              # applyColorInversion(), isInvertedPixel()
    Inversion.test.ts         # Unit tests for inversion math (INV-U001..U020)
  shaders/
    inversion.frag.glsl       # WebGL fragment shader for GPU inversion
  ui/
    components/
      ColorInversionToggle.ts       # Toggle button UI component
      ColorInversionToggle.test.ts  # Unit tests for toggle (INVT-001..020)
  utils/
    KeyBindings.ts            # Add color.toggleInversion binding (Ctrl+I)
e2e/
  color-inversion.spec.ts    # E2E Playwright tests (INV-001..061)
```

## References

- Feature gap identified in: `/Users/lifeart/Repos/openrv-web/features/color-correction.md` (line 34: "Color inversion | Not Implemented")
- Color pipeline: `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts` (`renderImage()` method)
- Color controls pattern: `/Users/lifeart/Repos/openrv-web/src/ui/components/ColorControls.ts`
- CDL controls pattern: `/Users/lifeart/Repos/openrv-web/src/ui/components/CDLControl.ts`
- Keyboard bindings: `/Users/lifeart/Repos/openrv-web/src/utils/KeyBindings.ts`
- Channel isolation (similar simple per-pixel operation): `/Users/lifeart/Repos/openrv-web/src/ui/components/ChannelSelect.ts`
