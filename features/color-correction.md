# Color Correction

## Original OpenRV Implementation
OpenRV provides per-source color correction tools that preserve alpha channels:

- **Relative Exposure**: Adjusts brightness using the formula c x 2^exposure, simulating camera stop adjustments
- **Hue Rotation**: Luminance-preserving rotation in radians with skew transforms
- **Relative Saturation**: Matrix-based adjustment that preserves luminance values
- **Contrast**: Linear scaling with offset using (1+k) multiplier formula
- **Inversion**: Negation matrix with constant 1.0 offset for negative/inverse images
- **ASC-CDL Controls**: Industry-standard Slope/Offset/Power (SOP) with per-channel saturation

Display-level corrections include:
- **Display Gamma**: Monitor response compensation (default 1.0 on Linux/Windows)
- **sRGB Display**: Standard monitor curve with linear blacks
- **Rec. 709 Non-Linear Transfer**: HD reference monitor calibration
- **Display Brightness**: Final multiplicative adjustment preserving hue

All corrections are applied in the GPU pipeline for real-time preview.

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Requirements
| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Per-source color correction | Implemented | ColorControls applies adjustments to current source |
| Exposure adjustment in stops | Implemented | `-5` to `+5` stops via `exposure` slider |
| Hue rotation with luminance preservation | Not Implemented | HSL Qualifier has hue shift but not global hue rotation |
| Saturation control | Implemented | `0` to `2` multiplier via `saturation` slider |
| Contrast adjustment | Implemented | `0` to `2` multiplier via `contrast` slider |
| Color inversion | Not Implemented | HSL Qualifier has `invert` for matte, not global inversion |
| ASC-CDL support (Slope, Offset, Power, Saturation) | Implemented | Full CDLControl with per-channel RGB controls |
| Display gamma control | Implemented | `0.1` to `4.0` via `gamma` slider |
| Real-time preview of all adjustments | Implemented | All effects render in real-time |
| Reset to default functionality | Implemented | Reset button in both ColorControls and CDLControl |
| Copy/paste corrections between sources | Not Implemented | No copy/paste functionality for corrections |

## UI/UX Specification

### Color Tab Location
The Color Correction controls are located in the **Color** tab of the context toolbar. Access via:
- Click the "Color" tab in the tab bar
- Press `2` key to switch to Color tab

### ColorControls Panel (`src/ui/components/ColorControls.ts`)
**Toggle Button:** "Color" with palette icon in Color tab context toolbar
- **Keyboard Shortcut:** `C` to toggle panel visibility
- **Panel Position:** Fixed dropdown below button, max-height 80vh with overflow scroll

**Available Adjustments:**
| Control | Range | Default | Format |
|---------|-------|---------|--------|
| Exposure | -5 to +5 | 0 | `+X.X` stops |
| Brightness | -1 to +1 | 0 | `+XX%` |
| Contrast | 0 to 2 | 1 | `XX%` |
| Clarity | -100 to +100 | 0 | `+XX` |
| Gamma | 0.1 to 4 | 1 | `X.XX` |
| Saturation | 0 to 2 | 1 | `XX%` |
| Vibrance | -100 to +100 | 0 | `+XX` |
| Temperature | -100 to +100 | 0 | `+XX` |
| Tint | -100 to +100 | 0 | `+XX` |
| Highlights | -100 to +100 | 0 | `+XX` |
| Shadows | -100 to +100 | 0 | `+XX` |
| Whites | -100 to +100 | 0 | `+XX` |
| Blacks | -100 to +100 | 0 | `+XX` |

**Special Controls:**
- **Vibrance Skin Protection:** Checkbox to protect skin tones during vibrance adjustment
- **LUT Section:** Load `.cube` LUT files with intensity slider (0-100%)
- **Reset Button:** Resets all adjustments to defaults
- **Double-click Slider:** Resets individual slider to default

### CDL Panel (`src/ui/components/CDLControl.ts`)
**Toggle Button:** "CDL" with film-slate icon in Color tab
- **Button highlights** when non-default CDL values are applied

**ASC CDL Parameters:**
| Parameter | Channels | Range | Default |
|-----------|----------|-------|---------|
| Slope | R, G, B | 0 to 4 | 1.0 |
| Offset | R, G, B | -1 to +1 | 0.0 |
| Power | R, G, B | 0.1 to 4 | 1.0 |
| Saturation | Global | 0 to 2 | 1.0 |

**CDL File Operations:**
- **Load:** Imports `.cdl` or `.xml` files in ASC CDL format
- **Save:** Exports current grade as `grade.cdl` XML file
- **Reset:** Restores all CDL values to defaults

### Button States
- **Default:** Transparent background, muted text color
- **Hover:** `var(--bg-hover)` background, primary border
- **Active (panel open or non-default values):** Accent color highlight (`rgba(var(--accent-primary-rgb), 0.15)`)

## Technical Notes

### Implementation Files
| File | Purpose |
|------|---------|
| `src/ui/components/ColorControls.ts` | Main color adjustments UI panel |
| `src/ui/components/CDLControl.ts` | ASC CDL controls panel |
| `src/color/CDL.ts` | CDL types, math functions, XML parsing/export |
| `src/ui/components/ViewerEffects.ts` | CPU-based effects (highlights/shadows, vibrance, clarity, sharpen) |
| `src/utils/EffectProcessor.ts` | Effect processing pipeline |
| `src/utils/effectProcessing.shared.ts` | Shared effect processing utilities |
| `src/workers/effectProcessor.worker.ts` | Web Worker for off-thread effect processing |

### CDL Formula
The ASC CDL transform follows the industry standard:
```
out = clamp((in * slope + offset) ^ power)
```
Then saturation is applied using Rec. 709 luminance weights:
```javascript
luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
output_channel = luma + (input_channel - luma) * saturation
```

### Color Adjustment Pipeline Order (in Viewer.ts renderImage)
1. Draw source image with transform (rotation/flip)
2. Apply crop
3. Stereo mode transformation
4. Lens distortion
5. **3D LUT application**
6. **Color adjustments** (exposure, contrast, saturation, gamma, temperature, tint, brightness)
7. **CDL correction** (Slope, Offset, Power, Saturation)
8. **Color curves**
9. **Highlights/Shadows/Whites/Blacks recovery**
10. **Vibrance** (with optional skin protection)
11. **Clarity** (local contrast via high-pass filter)
12. Sharpen/blur filters
13. Channel isolation
14. Paint annotations

### Effect Processing Algorithms

**Exposure:** `c * 2^exposure` (camera stop simulation)

**Vibrance:** Intelligent saturation that:
- Boosts less-saturated colors more than already-saturated ones
- Optionally protects skin tones (hue 20-50 degrees)
- Uses HSL color space for natural results

**Clarity:** Local contrast enhancement via:
1. 5x5 Gaussian blur creates low-frequency layer
2. High-pass filter (original - blurred)
3. Midtone mask from luminance (full effect at 128, fades at extremes)
4. Add masked high-frequency detail scaled by clarity

**Highlights/Shadows Recovery:** Luminance-based masking with soft knee compression using smoothstep functions.

### Events Emitted
**ColorControls:**
- `adjustmentsChanged: ColorAdjustments` - When any slider changes
- `visibilityChanged: boolean` - When panel opens/closes
- `lutLoaded: LUT3D | null` - When LUT is loaded/cleared
- `lutIntensityChanged: number` - When LUT intensity changes

**CDLControl:**
- `cdlChanged: CDLValues` - When any CDL value changes

## E2E Test Cases
**File:** `e2e/color-controls.spec.ts`

### Panel Visibility Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| COLOR-001 | color tab should show color adjustment controls | Verifies Color button is visible in Color tab |
| COLOR-002 | pressing C key should toggle color panel visibility | Tests keyboard shortcut toggle |
| COLOR-003 | pressing Escape should close color panel | Tests Escape key closes panel |

### Exposure Control Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| COLOR-010 | adjusting exposure should update state and visually change canvas | Verifies exposure slider updates state and renders |
| COLOR-011 | increasing exposure should brighten the image | Visual verification of exposure effect |
| COLOR-012 | double-click on exposure slider should reset to default | Tests double-click reset behavior |

### Gamma Control Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| COLOR-020 | adjusting gamma should update state and change canvas | Verifies gamma adjustment works |

### Saturation Control Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| COLOR-030 | adjusting saturation should update state and change canvas | Verifies saturation adjustment |
| COLOR-031 | setting saturation to 0 should produce grayscale image | Verifies desaturation effect |

### Contrast Control Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| COLOR-040 | adjusting contrast should update state and change canvas | Verifies contrast adjustment |

### Temperature and Tint Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| COLOR-050 | adjusting temperature should update state and change canvas | Verifies temperature (warm/cool) adjustment |
| COLOR-051 | adjusting tint should update state and change canvas | Verifies green/magenta tint |

### Brightness Control Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| COLOR-060 | adjusting brightness should update state and change canvas | Verifies brightness adjustment |

### LUT Support Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| COLOR-070 | LUT button should be visible | Verifies LUT load button exists |
| COLOR-071 | LUT intensity slider should adjust LUT blend | Verifies LUT intensity control |

### Color Combinations Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| COLOR-080 | multiple color adjustments should combine correctly | Tests stacking multiple adjustments |

### Reset Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| COLOR-090 | reset button should restore all color adjustments to default | Verifies reset functionality |

### State Persistence Tests
| ID | Test Name | Description |
|----|-----------|-------------|
| COLOR-100 | color adjustments should persist across frame changes | Verifies adjustments persist on frame navigation |

## Unit Test Cases

### ColorControls Unit Tests
**File:** `src/ui/components/ColorControls.test.ts`

| ID | Test Name | Description |
|----|-----------|-------------|
| COL-001 | starts with default adjustments | Initial state equals DEFAULT_COLOR_ADJUSTMENTS |
| COL-002 | default exposure is 0 | Verifies exposure default |
| COL-003 | default gamma is 1 | Verifies gamma default |
| COL-004 | default saturation is 1 | Verifies saturation default |
| COL-005 | default contrast is 1 | Verifies contrast default |
| COL-006 | default temperature is 0 | Verifies temperature default |
| COL-007 | default tint is 0 | Verifies tint default |
| COL-008 | default brightness is 0 | Verifies brightness default |
| COL-009 | returns copy of adjustments | getAdjustments returns new object |
| COL-010 | sets partial adjustments | setAdjustments merges partial values |
| COL-011 | sets multiple adjustments | setAdjustments handles multiple values |
| COL-012 | emits adjustmentsChanged event | Event fired on setAdjustments |
| COL-013 | reset returns all values to defaults | Full reset functionality |
| COL-014 | reset emits adjustmentsChanged event | Event fired on reset |
| COL-015 | toggle shows panel when hidden | Panel toggle open |
| COL-016 | toggle hides panel when visible | Panel toggle close |
| COL-017 | show emits visibilityChanged true | Visibility event on show |
| COL-018 | hide emits visibilityChanged false | Visibility event on hide |
| COL-019 | show is idempotent | Multiple show calls don't re-emit |
| COL-020 | hide is idempotent | Multiple hide calls don't re-emit |
| COL-021 | getLUT returns null initially | No LUT by default |
| COL-022 | getLUTIntensity returns 1 initially | Default LUT intensity |
| COL-023 | setLUT emits lutLoaded event | LUT load event |
| COL-024 | clearLUT sets LUT to null | LUT clear functionality |
| COL-025 | clearLUT emits lutLoaded with null | LUT clear event |
| COL-026 | render returns HTMLElement | Render method |
| COL-027 | render returns container element | Container class name |
| COL-028 | has correct default values | DEFAULT_COLOR_ADJUSTMENTS validation |

### CDLControl Unit Tests
**File:** `src/ui/components/CDLControl.test.ts`

| ID | Test Name | Description |
|----|-----------|-------------|
| CDL-U001 | should initialize with default CDL values | Initial state equals DEFAULT_CDL |
| CDL-U002 | default slope values should be 1.0 | Slope RGB defaults |
| CDL-U003 | default offset values should be 0.0 | Offset RGB defaults |
| CDL-U004 | default power values should be 1.0 | Power RGB defaults |
| CDL-U005 | default saturation should be 1.0 | Saturation default |
| CDL-U010 | render returns container element | Render method |
| CDL-U011 | container has CDL button | Button exists |
| CDL-U012 | CDL button has correct title | Button title |
| CDL-U020 | getCDL returns copy of CDL values | Returns new object |
| CDL-U021 | setCDL sets all CDL values | Full CDL set |
| CDL-U022 | setCDL emits cdlChanged event | Event on set |
| CDL-U023 | setCDL emits copy of values | Emitted values are copies |
| CDL-U030 | reset restores default CDL values | Reset functionality |
| CDL-U031 | reset emits cdlChanged event with default values | Reset event |
| CDL-U040-U043 | panel visibility tests | Show/hide/toggle panel |
| CDL-U050-U053 | slope values tests | Slope channel validation |
| CDL-U060-U063 | offset values tests | Offset channel validation |
| CDL-U070-U073 | power values tests | Power channel validation |
| CDL-U080-U083 | saturation values tests | Saturation validation |
| CDL-U090-U093 | complex CDL operations | Combined parameter tests |
| CDL-U100-U101 | dispose tests | Cleanup without error |
| CDL-U110-U111 | event listener tests | Multiple listeners, off() |

### CDL Math Unit Tests
**File:** `src/color/CDL.test.ts`

Tests for CDL formula implementation:
- `applyCDLToValue` - Single channel transform
- `applySaturation` - Rec. 709 luminance-based saturation
- `applyCDL` - Full RGB transform
- `applyCDLToImageData` - Batch processing
- `parseCDLXML` - XML import
- `exportCDLXML` - XML export
- `isDefaultCDL` - Default state check

## Missing Features (Not Implemented)

### Hue Rotation
Global luminance-preserving hue rotation is not implemented. The HSL Qualifier has a `hueShift` correction parameter but this only applies to qualified pixels, not the entire image.

### Color Inversion
Global image inversion (negative) using a negation matrix is not implemented. The HSL Qualifier has an `invert` parameter but this inverts the qualification matte, not the image colors.

### Copy/Paste Corrections
No functionality exists to copy color correction settings from one source and paste them to another source.

### Display Color Management
- sRGB display mode
- Rec. 709 non-linear transfer
- Per-display brightness adjustment

These display-level color management features from OpenRV are not implemented.
