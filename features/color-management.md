# Color Management

## Original OpenRV Implementation
OpenRV implements a comprehensive four-point LUT pipeline for color management:

1. **Pre-Cache LUT**: Software-applied for colorspace conversion with bit-depth reformatting
2. **File LUT**: Hardware-applied for file-to-working-space conversion
3. **Look LUT**: Per-source hardware LUT applied before display LUT
4. **Display LUT**: Session-wide hardware LUT for display device calibration

Supported color space conversions include:
- Non-Rec. 709 primaries transformation via CIE XYZ
- YRY BY conversion for OpenEXR planar images
- YUV/YCbCr conversion with hardware decoding
- Log to Linear (Cineon/DPX 10-bit, Viper FilmStream)
- Gamma correction for video/gamma space linearization
- sRGB to Linear conversion
- Rec. 709 transfer function

LUT file formats supported: RSR .csp, RV 3D, RV Channel, Lustre, IRIDAS, Shake formats.

The system also provides "Luminance LUTs" with predefined mappings including HSV, Random, and contour visualization for depth/shadow analysis.

## Status
- [ ] Not implemented
- [x] Partially implemented
- [ ] Fully implemented

## Implementation Summary

### What is Implemented

#### 1. LUT Support (Fully Implemented)
- **1D LUT parsing and application** (`src/color/LUTLoader.ts`)
  - `.cube` format parsing with `LUT_1D_SIZE` support
  - Domain min/max support
  - Linear interpolation for 1D curves
  - Per-channel independent processing
- **3D LUT parsing and application** (`src/color/LUTLoader.ts`)
  - `.cube` format parsing with `LUT_3D_SIZE` support
  - Trilinear interpolation
  - Domain min/max support
- **WebGL GPU-accelerated LUT processing** (`src/color/WebGLLUT.ts`)
  - Hardware trilinear interpolation via 3D textures
  - Intensity/blend control for LUT strength
  - Efficient GPU-based processing
- **UI Controls** (`src/ui/components/ColorControls.ts`)
  - Load `.cube` LUT files
  - LUT intensity slider (0-100%)
  - Clear LUT functionality
  - Active LUT name display

#### 2. ASC CDL Support (Fully Implemented)
- **CDL processing** (`src/color/CDL.ts`)
  - Full SOP (Slope, Offset, Power) per-channel support
  - Saturation adjustment with Rec. 709 luminance weights
  - Correct SOP->Saturation order
  - `.cdl` XML file import/export
- **UI Controls** (`src/ui/components/CDLControl.ts`)
  - Per-channel RGB sliders for Slope, Offset, Power
  - Saturation slider
  - Load/Save CDL file buttons
  - Reset functionality
  - Double-click to reset individual sliders

#### 3. Color Adjustments (Fully Implemented)
- **Primary Adjustments** (`src/ui/components/ColorControls.ts`)
  - Exposure (-5 to +5 stops)
  - Gamma (0.1 to 4.0)
  - Contrast (0 to 200%)
  - Saturation (0 to 200%)
  - Brightness (-100% to +100%)
- **Secondary Adjustments**
  - Temperature (-100 to +100)
  - Tint (-100 to +100)
  - Highlights (-100 to +100)
  - Shadows (-100 to +100)
  - Whites (-100 to +100)
  - Blacks (-100 to +100)
  - Clarity (-100 to +100)
  - Vibrance (-100 to +100) with skin tone protection

#### 4. Color Curves (Fully Implemented)
- **Curve Engine** (`src/color/ColorCurves.ts`)
  - Master, Red, Green, Blue channel curves
  - Catmull-Rom spline interpolation
  - 256-entry LUT generation for fast application
  - LUT caching for performance
- **Presets** - Film Look, S-Curve (Mild/Strong), Lift Shadows, Crush Blacks, etc.
- **UI Controls** (`src/ui/components/CurvesControl.ts`, `CurveEditor.ts`)
  - Interactive curve editor with point dragging
  - Channel selection tabs
  - Preset dropdown
  - Import/Export JSON functionality
  - Reset functionality

#### 5. Log Curve Support (Fully Implemented)
- **Camera Log Formats** (`src/color/LogCurves.ts`)
  - Cineon Film Log (DPX/Cineon files)
  - ARRI LogC3 (EI 800)
  - ARRI LogC4 (ALEXA 35)
  - Sony S-Log3
  - RED Log3G10
- **Features**
  - Log-to-linear and linear-to-log conversion
  - GLSL shader code generation for GPU processing
  - LUT generation for CPU processing

### What is NOT Implemented

1. **OpenColorIO (OCIO) Integration** - Not implemented
   - No OCIO config file loading
   - No color space detection from file metadata
   - No automatic transform chains

2. **Multi-Point LUT Pipeline** - Partially implemented
   - Only single LUT support (no Pre-Cache/File/Look/Display chain)
   - No per-source LUT assignment
   - No session-wide display LUT separate from look LUT

3. **Additional LUT Formats** - Not implemented
   - No RSR .csp support
   - No RV 3D format
   - No RV Channel format
   - No Lustre format
   - No IRIDAS format
   - No Shake formats

4. **Advanced Color Space Features** - Not implemented
   - No CIE XYZ transformation
   - No YRY BY conversion for OpenEXR
   - No custom color primaries support

5. **HDR Features** - Not implemented
   - No HDR to SDR tone mapping
   - No floating-point precision controls
   - No HDR metadata handling

6. **Luminance LUTs** - Not implemented
   - No HSV visualization
   - No Random mapping
   - No contour visualization for depth analysis

## Requirements (Original vs Status)

| Requirement | Status |
|-------------|--------|
| Support for 1D and 3D LUTs | Implemented |
| Multiple LUT formats (cube, csp, 3dl, etc.) | Partial (.cube only) |
| Per-source LUT assignment | Not implemented |
| Session-wide display LUT | Not implemented |
| OpenColorIO (OCIO) integration | Not implemented |
| Color space detection from file metadata | Not implemented |
| Linear/Log/sRGB/Rec.709 conversions | Implemented (Log curves) |
| Custom color primaries support | Not implemented |
| HDR to SDR tone mapping | Not implemented |
| Floating-point precision for HDR content | Not implemented |

## UI/UX Specification

### Color Tab Layout (Implemented)
The Color tab in the context toolbar provides access to color management features:

```
[ Color ] [ CDL ] [ Curves ] [ Reset ]
   |         |        |         |
   |         |        |         +-- Reset all color adjustments
   |         |        +------------ Toggle curves panel
   |         +--------------------- Toggle CDL panel
   +------------------------------- Toggle color adjustments panel
```

### Color Adjustments Panel
- **Header**: "Color Adjustments" title with Reset button
- **Sliders**: Labeled sliders with value readouts
  - Double-click any slider to reset to default
- **LUT Section**: Separator, Load button, active LUT name, intensity slider
- **Positioning**: Fixed position dropdown below toggle button
- **Keyboard**: `C` key toggles panel, `Escape` closes

### CDL Panel
- **Header**: "ASC CDL" title with Load/Save/Reset buttons
- **Sections**: Slope, Offset, Power (each with R/G/B sliders)
- **Saturation**: Separate section below
- **Color coding**: R=red, G=green, B=blue slider labels
- **Positioning**: Fixed position dropdown

### Curves Panel
- **Header**: "Color Curves" title with Reset and Close buttons
- **Preset Selector**: Dropdown with built-in presets
- **Curve Editor**: Interactive canvas with:
  - Channel tabs (Master, R, G, B)
  - Grid overlay
  - Point handles (drag to adjust)
  - Click to add points, delete key to remove
- **Import/Export**: Buttons for JSON file I/O
- **Draggable**: Can be repositioned by dragging header

### Design Patterns (per UI.md)
- All panels use CSS variables for theming
- Flat button design with hover/active states
- Consistent spacing (gap: 6px)
- SVG icons from centralized icon system
- `data-testid` attributes for e2e testing

## Technical Notes

### Architecture
```
src/color/
  CDL.ts              - ASC CDL types and processing
  CDL.test.ts         - CDL unit tests (15 tests)
  ColorCurves.ts      - Curve types, evaluation, presets
  ColorCurves.test.ts - Curves unit tests (48 tests)
  LUTLoader.ts        - 1D/3D LUT parsing and application
  LUTLoader.test.ts   - LUT unit tests (22 tests)
  WebGLLUT.ts         - GPU-accelerated LUT processing
  WebGLLUT.test.ts    - WebGL LUT unit tests (11 tests)
  LogCurves.ts        - Camera log format conversions
  LogCurves.test.ts   - Log curves unit tests (27 tests)

src/ui/components/
  ColorControls.ts    - Main color adjustments panel
  CDLControl.ts       - CDL editing panel
  CurvesControl.ts    - Curves panel wrapper
  CurveEditor.ts      - Interactive curve canvas
```

### Processing Pipeline Order
Effects are applied in the Viewer render pipeline in this order:
1. Draw source image with transform (rotation/flip)
2. Apply crop
3. Stereo mode (layout transformation)
4. Lens distortion
5. **3D LUT** (color/WebGLLUT.ts)
6. **Color adjustments** (exposure, contrast, etc.)
7. **CDL** (color/CDL.ts)
8. **Color curves** (color/ColorCurves.ts)
9. Sharpen/blur filters
10. Channel isolation
11. Paint annotations (on top layer)

### Performance Considerations
- LUT application uses WebGL for GPU acceleration
- Color curves use pre-built 256-entry LUTs for O(1) lookups
- CurveLUTCache prevents rebuilding LUTs every frame
- CDL processing is optimized for default detection (skip if unchanged)

## E2E Test Cases

### Existing Tests (`e2e/color-controls.spec.ts`)
| Test ID | Description | Status |
|---------|-------------|--------|
| COLOR-001 | Color tab should show color adjustment controls | Passing |
| COLOR-002 | Pressing C key should toggle color panel visibility | Passing |
| COLOR-003 | Pressing Escape should close color panel | Passing |
| COLOR-010 | Adjusting exposure should update state and visually change canvas | Passing |
| COLOR-011 | Increasing exposure should brighten the image | Passing |
| COLOR-012 | Double-click on exposure slider should reset to default | Passing |
| COLOR-020 | Adjusting gamma should update state and change canvas | Passing |
| COLOR-030 | Adjusting saturation should update state and change canvas | Passing |
| COLOR-031 | Setting saturation to 0 should produce grayscale image | Passing |
| COLOR-040 | Adjusting contrast should update state and change canvas | Passing |
| COLOR-050 | Adjusting temperature should update state and change canvas | Passing |
| COLOR-051 | Adjusting tint should update state and change canvas | Passing |
| COLOR-060 | Adjusting brightness should update state and change canvas | Passing |
| COLOR-070 | LUT button should be visible | Passing |
| COLOR-071 | LUT intensity slider should adjust LUT blend | Passing |
| COLOR-080 | Multiple color adjustments should combine correctly | Passing |
| COLOR-090 | Reset button should restore all color adjustments to default | Passing |
| COLOR-100 | Color adjustments should persist across frame changes | Passing |

### Additional E2E Tests Needed
| Test ID | Description | Priority |
|---------|-------------|----------|
| CLR-001 | Loading a valid .cube 3D LUT file should apply color transformation | High |
| CLR-002 | Loading a valid .cube 1D LUT file should apply color transformation | High |
| CLR-003 | Invalid LUT file should show error alert | Medium |
| CLR-004 | Clearing LUT should restore original colors | High |
| CLR-005 | LUT intensity at 0% should show original image | Medium |
| CLR-006 | LUT intensity at 50% should show blended result | Medium |
| CDL-001 | CDL panel should open when CDL button is clicked | High |
| CDL-002 | Adjusting CDL slope should change image colors | High |
| CDL-003 | Adjusting CDL offset should shift color values | High |
| CDL-004 | Adjusting CDL power should apply gamma | High |
| CDL-005 | CDL saturation at 0 should produce grayscale | High |
| CDL-006 | Loading .cdl file should apply CDL values | Medium |
| CDL-007 | Saving .cdl file should export current values | Medium |
| CDL-008 | CDL reset should restore all values to default | High |
| CRV-001 | Curves panel should toggle with button click | High |
| CRV-002 | Adding point to master curve should modify image | High |
| CRV-003 | S-Curve preset should increase contrast | Medium |
| CRV-004 | Film Look preset should apply characteristic curve | Medium |
| CRV-005 | Curves reset should restore linear curve | High |
| CRV-006 | Importing curves JSON should apply saved curves | Medium |
| CRV-007 | Exporting curves should download JSON file | Medium |
| CRV-008 | Channel tabs should switch active curve | Medium |

## Unit Test Cases

### Existing Unit Tests

#### CDL Tests (`src/color/CDL.test.ts`) - 15 tests
- CDL-001: DEFAULT_CDL has correct default values
- CDL-001: isDefaultCDL returns true for default values
- CDL-002: applyCDLToValue slope multiplies input value
- CDL-003: applyCDLToValue offset adds to input value
- CDL-004: applyCDLToValue power applies gamma curve
- CDL-005: applySaturation=0 produces grayscale
- CDL-006: per-channel slope affects only that channel
- CDL-007: applyCDL combines all operations correctly
- CDL-008: applyCDLToImageData processes all pixels
- CDL-009: order is Slope->Offset->Power->Saturation
- CDL-010: parseCDLXML parses valid .cdl file
- CDL-011: parseCDLXML returns null for invalid XML
- CDL-012: output is clamped to 0-255 range
- CDL-013: round-trip preserves values
- CDL-014: negative values clamp to 0 before power
- CDL-015: uses Rec.709 luminance weights

#### LUT Tests (`src/color/LUTLoader.test.ts`) - 22 tests
- LUT-001: parses valid .cube file
- LUT-002: extracts TITLE
- LUT-003: parses DOMAIN_MIN/MAX
- LUT-004: ignores comments
- LUT-005: handles Windows line endings
- LUT-006: throws error without LUT size
- LUT-007: throws error with wrong data count
- LUT-008: isLUT3D identifies valid 3D LUT
- LUT-009: applyLUT3D interpolates correctly
- LUT-010: applyLUT3D clamps out-of-domain inputs
- LUT-011: identity LUT produces no change
- LUT-012: parses valid 1D .cube file
- LUT-013: extracts TITLE from 1D LUT
- LUT-014: parses DOMAIN_MIN/MAX for 1D LUT
- LUT-015: throws error with wrong 1D data count
- LUT-016: isLUT1D identifies valid 1D LUT
- LUT-017: identity 1D LUT produces no change
- LUT-018: applyLUT1D clamps out-of-domain inputs
- LUT-019: applyLUT1D handles corner cases
- LUT-020: each channel is processed independently
- LUT-021: applies 1D LUT to ImageData
- LUT-022: applies 3D LUT to ImageData

#### WebGL LUT Tests (`src/color/WebGLLUT.test.ts`) - 11 tests
- WLUT-001: creates WebGL2 context with correct options
- WLUT-002: throws error when WebGL2 is not supported
- WLUT-003: setLUT sets LUT and creates texture
- WLUT-004: clears LUT when set to null
- WLUT-005: returns original imageData when no LUT is loaded
- WLUT-006: processes imageData when LUT is loaded
- WLUT-007: sets correct uniform values
- WLUT-008: cleans up WebGL resources
- WLUT-009: getSharedLUTProcessor returns same instance
- WLUT-010: disposeSharedLUTProcessor disposes and clears singleton
- WLUT-011: preserves vertical orientation

#### Color Curves Tests (`src/color/ColorCurves.test.ts`) - 48 tests
- CC-001 through CC-048 covering:
  - Default curve creation
  - Curve evaluation and interpolation
  - LUT building and application
  - Preset curves (S-curve, Film Look, etc.)
  - Point manipulation (add, remove, update)
  - JSON import/export

#### Log Curves Tests (`src/color/LogCurves.test.ts`) - 27 tests
- LOG-U001 through LOG-U027 covering:
  - All log curve formats (Cineon, ARRI, Sony, RED)
  - Monotonic output verification
  - Round-trip accuracy
  - GLSL generation
  - LUT building

### Unit Tests Needed
| Function | Test Case | Priority |
|----------|-----------|----------|
| ColorControls | Vibrance skin protection calculates correctly | Medium |
| ColorControls | Clarity local contrast applies correctly | Medium |
| ColorControls | Highlights/Shadows recovery works | Medium |
| ColorControls | Whites/Blacks point adjustment works | Medium |

## Future Enhancements

1. **OCIO Integration** (High Priority)
   - Load OCIO config files
   - Automatic color space detection
   - Display transform selection
   - View transform selection

2. **Multi-LUT Pipeline** (Medium Priority)
   - Input LUT (file-to-working space)
   - Look LUT (creative grade)
   - Display LUT (display calibration)
   - Per-source LUT assignment

3. **Additional LUT Formats** (Medium Priority)
   - .3dl (Lustre/Flame)
   - .csp (Rising Sun)
   - .lut (various)
   - .mga (Pandora)

4. **HDR Support** (Medium Priority)
   - HDR10 metadata handling
   - Tone mapping operators
   - Extended range displays
   - ACES support

5. **Color Space Transforms** (Low Priority)
   - CIE XYZ conversions
   - Custom primaries
   - Chromatic adaptation
