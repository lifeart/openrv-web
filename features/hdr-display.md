# HDR Display and Tone Mapping

## Original OpenRV Implementation
OpenRV provides comprehensive HDR (High Dynamic Range) support:

**HDR Image Support**:
- OpenEXR 16-bit and 32-bit floating point
- TIFF 32-bit float
- Full floating point precision throughout pipeline
- Values outside [0.0, 1.0] range preserved

**Out-of-Range Visualization**:
- Highlight values outside safe display range
- Visualization of over-bright pixels
- Negative value indication
- Configurable display range

**Exposure Control**:
- Relative exposure adjustment in stops
- Formula: c x 2^exposure
- Real-time preview

**Floating Point LUTs**:
- Enable floating point LUT processing (-floatLUT)
- Maintain HDR precision through color pipeline
- Avoid clipping in intermediate stages

**Display Options**:
- Tone mapping for SDR displays
- HDR display output (where supported)
- Configurable bit depth (8/16-bit int, 16/32-bit float)

**Luminance LUTs**:
- HSV visualization
- Random colorization for analysis
- Contour visualization for depth/shadow analysis

## Status
- [ ] Not implemented
- [x] Partially implemented
- [ ] Fully implemented

## Implementation Summary

### Implemented Features

#### 1. Exposure Control (FULLY IMPLEMENTED)
- **Location**: `/Users/lifeart/Repos/openrv-web/src/ui/components/ColorControls.ts`
- **Range**: -5 to +5 stops
- **Formula**: `c * 2^exposure` (implemented in both WebGL shader and CPU fallback)
- **GPU Implementation** (`/Users/lifeart/Repos/openrv-web/src/render/Renderer.ts`):
  ```glsl
  color.rgb *= pow(2.0, u_exposure);
  ```
- **CPU Fallback** (`/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.ts`):
  ```typescript
  const exposureBrightness = Math.pow(2, adjustments.exposure);
  ```

#### 2. Clipping Indicators (FULLY IMPLEMENTED)
- **Location**: `/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts`
- **Features**:
  - Highlight clipping detection (R, G, or B >= 254)
  - Shadow clipping detection (all channels <= 1)
  - Configurable overlay colors (default: red for highlights, blue for shadows)
  - Adjustable opacity (0-1)
  - Toggle for highlights/shadows independently
- **Unit Tests**: `/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.test.ts`

#### 3. Zebra Stripes (FULLY IMPLEMENTED)
- **Location**: `/Users/lifeart/Repos/openrv-web/src/ui/components/ZebraStripes.ts`
- **Features**:
  - High zebras (overexposure warning) - default 95 IRE threshold
  - Low zebras (underexposure warning) - default 5 IRE threshold
  - Animated diagonal stripes for visibility
  - Configurable thresholds (0-100 IRE)
- **Unit Tests**: `/Users/lifeart/Repos/openrv-web/src/ui/components/ZebraStripes.test.ts`

#### 4. False Color Display (FULLY IMPLEMENTED)
- **Location**: `/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts`
- **Presets**: Standard, ARRI, RED
- **Features**:
  - Maps luminance to colors for exposure analysis
  - Pre-computed LUT for real-time performance
  - Identifies: black crush, underexposed, mid-grey, skin tones, highlights, clipped
- **Unit Tests**: `/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.test.ts`

#### 5. Histogram with Clipping Statistics (FULLY IMPLEMENTED)
- **Location**: `/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.ts`
- **Features**:
  - RGB/Luminance/Separate modes
  - Logarithmic scale option (for HDR content analysis)
  - Shadow/highlight clipping percentages
  - Clickable to toggle clipping overlay on viewer
  - GPU-accelerated rendering when available
- **Unit Tests**: `/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.test.ts`

### Partially Implemented Features

#### 1. Color Pipeline (PARTIAL)
- **GPU Shader Pipeline** includes:
  - Exposure (stops)
  - Temperature/Tint
  - Brightness
  - Contrast
  - Saturation
  - Gamma correction
- **Missing**: Full floating-point precision throughout pipeline (currently 8-bit intermediate)

#### 2. 3D LUT Support (PARTIAL)
- **Location**: `/Users/lifeart/Repos/openrv-web/src/color/LUTLoader.ts`
- **.cube format** supported
- **Missing**: Floating-point LUT processing mode (`-floatLUT` equivalent)

### Not Implemented Features

#### 1. HDR Image Format Support
- **Missing**: OpenEXR (.exr) file loading
- **Missing**: 32-bit TIFF loading
- **Missing**: Values outside [0.0, 1.0] preservation

#### 2. Tone Mapping Operators
- **Missing**: Filmic tone mapping
- **Missing**: ACES tone mapping
- **Missing**: Reinhard tone mapping
- **Missing**: Custom tone mapping curves

#### 3. HDR Display Output
- **Missing**: HDR10/PQ output for HDR displays
- **Missing**: Display P3 color space support
- **Missing**: Browser HDR canvas support detection

#### 4. Luminance Visualization Modes
- **Missing**: HSV visualization
- **Missing**: Random colorization for analysis
- **Missing**: Contour visualization

#### 5. Negative Value Indication
- **Missing**: Visualization of negative pixel values

## Requirements
- [x] Exposure adjustment control (-5 to +5 stops)
- [x] Clipping indicators (highlight/shadow)
- [x] Zebra stripes (configurable thresholds)
- [x] False color display modes (Standard/ARRI/RED)
- [x] Histogram with clipping statistics
- [x] Log scale histogram option
- [ ] Floating point image support (EXR, float TIFF)
- [ ] Out-of-range value visualization
- [ ] Tone mapping operators (Filmic, ACES, Reinhard)
- [ ] HDR to SDR conversion pipeline
- [ ] Luminance visualization modes (HSV, contour)
- [ ] HDR10/PQ output (where browser supports)
- [ ] Negative value indication
- [ ] Floating-point LUT processing

## UI/UX Specification

### Exposure Control
- **Location**: Color tab, ColorControls panel
- **Widget**: Horizontal slider with numeric display
- **Range**: -5.0 to +5.0 (0.1 step)
- **Keyboard**: Double-click slider to reset to 0
- **Display Format**: "+X.X" or "-X.X" (show sign)

### Clipping Overlay
- **Activation**: Click on histogram clipping indicators
- **Visual**: Semi-transparent color overlay on clipped regions
- **Colors**: Red for highlights (>= 254), Blue for shadows (<= 1)
- **Opacity**: Default 0.7, configurable

### Zebra Stripes
- **Location**: View tab, Zebra dropdown
- **Controls**:
  - Master toggle (enable/disable)
  - Highlights toggle + threshold slider (50-100%)
  - Shadows toggle + threshold slider (0-50%)
- **Animation**: Diagonal stripes moving at 20fps

### False Color
- **Location**: View tab, False Color dropdown
- **Presets**: Standard, ARRI, RED
- **Legend**: Color-coded exposure zones visible in dropdown

### Histogram
- **Location**: Floating overlay, toggle via Scopes dropdown or 'H' key
- **Modes**: RGB (superimposed), Luminance, Separate (stacked)
- **Scale**: Linear/Logarithmic toggle
- **Footer**: Shadow clipping % (left), Highlight clipping % (right)

## Technical Notes

### Exposure Formula
The exposure adjustment uses the standard photographic stops formula:
```
output = input * 2^exposure
```
Where:
- `exposure = 0`: No change (multiplier = 1)
- `exposure = 1`: 2x brightness (+1 stop)
- `exposure = -1`: 0.5x brightness (-1 stop)
- `exposure = 2`: 4x brightness (+2 stops)

### Clipping Detection Thresholds
- **Highlight**: Any channel R, G, or B >= 254 (99.6% of 255)
- **Shadow**: All channels R, G, and B <= 1 (0.4% of 255)
- **Luminance-based**: Optional check using Rec.709 coefficients

### Zebra IRE Mapping
IRE (Institute of Radio Engineers) scale maps to 8-bit values:
- 0 IRE = 0 (black)
- 100 IRE = 255 (white)
- Conversion: `value = IRE * 2.55`

### False Color Palettes
Standard palette zones (0-255 / 0-100 IRE):
| Range | Color | Meaning |
|-------|-------|---------|
| 0-5 | Purple | Black crush |
| 6-25 | Navy | Very dark |
| 26-51 | Blue | Underexposed |
| 52-76 | Teal | Dark tones |
| 77-102 | Green | Lower midtones |
| 103-115 | Yellow-green | Lower skin tones |
| 116-128 | Grey | Middle grey (18%) |
| 129-140 | Peach | Skin tones |
| 141-166 | Yellow | Bright |
| 167-191 | Orange | Very bright |
| 192-230 | Red | Highlights |
| 231-255 | Pink | Clipped |

### Future HDR Implementation Notes
For full HDR support, consider:
1. **EXR Loading**: Use `exr-js` or `openexr-wasm` library
2. **Float Pipeline**: Convert to Float32Array early, maintain through processing
3. **Tone Mapping**: Implement in fragment shader for performance
4. **HDR Canvas**: Check `navigator.gpu` for WebGPU HDR support

## E2E Test Cases

### Exposure Control Tests
| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| HDR-001 | Default exposure is zero | Load video, check color state | exposure = 0 |
| HDR-002 | Exposure slider changes value | Open color panel, adjust slider to +2 | exposure = 2, image brighter |
| HDR-003 | Exposure affects canvas visually | Set exposure to +3, capture screenshot | Screenshot differs from original |
| HDR-004 | Double-click resets exposure | Set exposure, double-click slider | exposure = 0 |
| HDR-005 | Negative exposure darkens image | Set exposure to -2 | Image visibly darker |

### Clipping Overlay Tests
| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| HDR-010 | Clipping overlay starts disabled | Load image | No clipping overlay visible |
| HDR-011 | Click histogram enables overlay | Toggle histogram, click clipping indicator | Clipping overlay visible on canvas |
| HDR-012 | Highlight clipping shows red | Load bright image, enable overlay | Red overlay on bright areas |
| HDR-013 | Shadow clipping shows blue | Load dark image, enable overlay | Blue overlay on dark areas |
| HDR-014 | Clipping stats update on frame change | Step through frames | Clipping percentages update |

### Zebra Stripes Tests
| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| HDR-020 | Zebra stripes start disabled | Load image | No zebra pattern visible |
| HDR-021 | Enable zebras shows pattern | Open Zebra dropdown, toggle on | Animated stripes on bright areas |
| HDR-022 | High threshold adjustment | Set threshold to 80% | More image area shows stripes |
| HDR-023 | Low zebras show on dark areas | Enable low zebras | Blue stripes on dark areas |
| HDR-024 | Zebras animate | Enable zebras, observe | Stripes move diagonally |

### False Color Tests
| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| HDR-030 | False color starts disabled | Load image | Normal image display |
| HDR-031 | Enable false color | Toggle false color on | Image shows exposure zones |
| HDR-032 | Preset changes colors | Switch from Standard to ARRI | Color palette changes |
| HDR-033 | False color legend visible | Open false color dropdown | Legend shows zone colors |
| HDR-034 | Mid-grey shown in grey | Load grey card image | 18% grey area shows grey color |

### Histogram Tests
| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| HDR-040 | Histogram shows clipping stats | Toggle histogram on | Shadow/highlight % visible |
| HDR-041 | Log scale toggle | Click Lin/Log button | Histogram scale changes |
| HDR-042 | Mode cycling | Click mode button | RGB -> Luma -> Separate -> RGB |
| HDR-043 | Clipping warning highlight | Load clipped image | Clipping indicator turns red |

### Combined Effect Tests
| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| HDR-050 | Exposure affects clipping | Increase exposure to +4 | Highlight clipping increases |
| HDR-051 | Exposure affects zebras | Enable zebras, increase exposure | More zebra stripes appear |
| HDR-052 | Exposure affects false color | Enable false color, increase exposure | Colors shift toward highlight zones |

## Unit Test Cases

### ColorControls Tests (Existing)
- COL-001 to COL-028: See `/Users/lifeart/Repos/openrv-web/src/ui/components/ColorControls.test.ts`

### ClippingOverlay Tests (Existing)
- CLIP-U001 to CLIP-U100: See `/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.test.ts`

### ZebraStripes Tests (Existing)
- See `/Users/lifeart/Repos/openrv-web/src/ui/components/ZebraStripes.test.ts`

### FalseColor Tests (Existing)
- See `/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.test.ts`

### Histogram Tests (Existing)
- See `/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.test.ts`

### Additional Unit Tests Needed

#### Exposure Processing Tests
| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| HDR-U001 | Exposure 0 returns unchanged | Output = Input |
| HDR-U002 | Exposure +1 doubles values | Output = Input * 2 |
| HDR-U003 | Exposure -1 halves values | Output = Input * 0.5 |
| HDR-U004 | Exposure clamps output to 0-255 | No overflow/underflow |
| HDR-U005 | Exposure formula correct | 2^exposure multiplier verified |

#### Tone Mapping Tests (Future)
| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| HDR-U010 | Reinhard operator preserves detail | Highlights not clipped |
| HDR-U011 | ACES operator color accurate | Color hue preserved |
| HDR-U012 | Filmic operator S-curve | Proper shoulder/toe |

## Implementation Files Reference

### Core HDR-Related Files
- `/Users/lifeart/Repos/openrv-web/src/ui/components/ColorControls.ts` - Exposure slider
- `/Users/lifeart/Repos/openrv-web/src/render/Renderer.ts` - WebGL exposure shader
- `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerRenderingUtils.ts` - CPU fallback
- `/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts` - Clipping visualization
- `/Users/lifeart/Repos/openrv-web/src/ui/components/ZebraStripes.ts` - Zebra stripes
- `/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.ts` - False color modes
- `/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.ts` - Histogram with clipping stats

### Test Files
- `/Users/lifeart/Repos/openrv-web/src/ui/components/ColorControls.test.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.test.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/ZebraStripes.test.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/FalseColor.test.ts`
- `/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.test.ts`
- `/Users/lifeart/Repos/openrv-web/e2e/color-controls.spec.ts`
- `/Users/lifeart/Repos/openrv-web/e2e/false-color.spec.ts`
- `/Users/lifeart/Repos/openrv-web/e2e/zebra-stripes.spec.ts`
- `/Users/lifeart/Repos/openrv-web/e2e/histogram-clipping.spec.ts`
