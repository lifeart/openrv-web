# Pixel Inspector

## Original OpenRV Implementation
OpenRV provides a pixel inspection tool for detailed image analysis:

**Inspection Modes**:
- Single pixel value inspection
- Averaging mode for sampling larger areas
- Source pixel values (original file data)
- Final rendered pixel values (after color pipeline)

**Information Displayed**:
- RGB/RGBA channel values
- Floating point values for HDR content
- 8/16-bit integer values
- Pixel coordinates (X, Y)
- Color space information

**Out-of-Range Display**:
OpenRV can visualize values outside the standard [0.0, 1.0] range for HDR content analysis, highlighting over-bright or negative values.

**Channel Inspection**:
- Individual channel isolation
- Channel remapping for multi-channel EXR files
- Alpha channel visualization

The pixel inspector updates in real-time as the cursor moves across the image.

## Status
- [ ] Not implemented
- [x] Partially implemented
- [ ] Fully implemented

### Implementation Summary

**Implemented Features:**
- Real-time pixel value readout under cursor
- RGB values (0-255 format)
- RGB values (0.0-1.0 floating point format)
- HSL values display
- Hex color value display
- IRE luminance value (using Rec.709 coefficients)
- Pixel coordinates (X, Y)
- Click to lock/unlock position
- Copy values to clipboard (click on any row)
- Color swatch preview
- Floating overlay that follows cursor
- Keyboard shortcut (Shift+I) to toggle
- Icon button in View tab toolbar
- Format selector buttons (RGB, 0-1, HSL, HEX, IRE)

**Missing Features (from original OpenRV):**
- Area averaging mode for sampling larger areas
- Source vs rendered value toggle (pre/post color pipeline)
- Out-of-range value indication for HDR content
- Color space information display
- Alpha channel value display
- Zoom to pixel level functionality
- RGBA display (currently only RGB)

## Requirements
- [x] Real-time pixel value readout under cursor
- [x] RGB/RGBA value display (RGB only, no Alpha)
- [x] Floating point precision for HDR (0-1 format available)
- [x] Pixel coordinate display
- [ ] Area averaging option
- [ ] Source vs rendered value toggle
- [ ] Out-of-range value indication
- [ ] Color space information display
- [x] Copy pixel values to clipboard
- [ ] Zoom to pixel level

## UI/UX Specification

### Location
- Toggle button in View tab toolbar (eyedropper icon)
- Floating overlay panel that follows cursor position

### Visual Design
The Pixel Probe overlay follows the UI.md style guide:
- Semi-transparent dark background (`rgba(30, 30, 30, 0.95)`)
- Uses CSS variables for theming (`--bg-secondary`, `--text-primary`, etc.)
- 6px border radius, 10px padding
- Minimum width: 180px
- Box shadow for elevation
- z-index: 9998 (below modals)

### Overlay Structure
```
+---------------------------+
| Pixel Probe          [🔒] |  <- Header with lock indicator
+---------------------------+
| [swatch] X: 123, Y: 456   |  <- Color preview + coordinates
+---------------------------+
| RGB   rgb(128, 64, 192)   |  <- Click to copy
| RGB01 (0.502, 0.251, 0.753)|
| HSL   hsl(270°, 50%, 50%) |
| HEX   #8040C0             |
| IRE   42 IRE              |
+---------------------------+
| [RGB][0-1][HSL][HEX][IRE] |  <- Format selector buttons
+---------------------------+
| Click row to copy         |  <- Hint text
+---------------------------+
```

### Interaction Patterns
- **Enable/Disable**: Shift+I keyboard shortcut or toolbar button
- **Lock Position**: Click on canvas while probe is enabled
- **Unlock Position**: Click on canvas again
- **Copy Value**: Click on any value row
- **Format Selection**: Click format button to highlight active format

### Keyboard Shortcuts
- `Shift+I`: Toggle pixel probe on/off

## Technical Notes

### Component Architecture
- **File**: `src/ui/components/PixelProbe.ts`
- **Class**: `PixelProbe extends EventEmitter<PixelProbeEvents>`
- **Integration**: Viewer.ts handles mouse events and passes ImageData

### State Interface
```typescript
interface PixelProbeState {
  enabled: boolean;
  locked: boolean;
  x: number;
  y: number;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  ire: number;
  format: 'rgb' | 'rgb01' | 'hsl' | 'hex' | 'ire';
}
```

### Color Calculations
- **HSL**: Standard RGB to HSL conversion
- **IRE**: Luminance using Rec.709 coefficients (Y = 0.2126R + 0.7152G + 0.0722B)
- **Hex**: Uppercase hex format (#RRGGBB)

### Integration Points
- `Viewer.ts` line 627-650: Mouse move handler updates probe
- `Viewer.ts` line 706-717: Click handler toggles lock
- `App.ts` line 830-845: Toolbar button setup
- `App.ts` line 1321: Keyboard shortcut registration

### Event Flow
1. Mouse move on canvas triggers `handleMouseMovePixelProbe()`
2. Viewer calculates canvas coordinates from client coordinates
3. Viewer extracts pixel from rendered ImageData
4. Viewer calls `pixelProbe.updateFromCanvas()`
5. PixelProbe updates state and display
6. PixelProbe emits `stateChanged` event

## E2E Test Cases

**File**: `e2e/pixel-probe.spec.ts`

### Existing Tests (11 tests)
| ID | Test Name | Status |
|----|-----------|--------|
| PP-E001 | pixel probe is disabled by default | Pass |
| PP-E002 | pressing Shift+I toggles pixel probe | Pass |
| PP-E003 | pixel probe container is visible when enabled | Pass |
| PP-E004 | pixel probe shows RGB values | Pass |
| PP-E005 | pixel probe shows coordinates | Pass |
| PP-E010 | pixel probe is not locked by default | Pass |
| PP-E011 | clicking on canvas locks pixel probe position | Pass |
| PP-E012 | locked position persists when moving mouse | Pass |
| PP-E020 | pixel probe shows IRE value | Pass |
| PP-E030 | pixel probe visibility persists when changing frames | Pass |
| PP-E031 | pixel probe visibility persists when changing tabs | Pass |

### Suggested Additional Tests
| ID | Test Name | Priority |
|----|-----------|----------|
| PIX-001 | clicking row copies value to clipboard | High |
| PIX-002 | format buttons switch active format | Medium |
| PIX-003 | toolbar button toggles pixel probe | High |
| PIX-004 | overlay follows cursor position | Medium |
| PIX-005 | overlay stays within viewport bounds | Low |
| PIX-006 | HSL values display correctly | Medium |
| PIX-007 | hex values display correctly | Medium |

## Unit Test Cases

**File**: `src/ui/components/PixelProbe.test.ts`

### Existing Tests (30+ tests)
| ID | Test Name | Status |
|----|-----------|--------|
| PROBE-001 | starts disabled | Pass |
| PROBE-002 | default state matches specification | Pass |
| PROBE-003 | provides element for mounting | Pass |
| PROBE-004 | default format is rgb | Pass |
| PROBE-010 | enable turns on pixel probe | Pass |
| PROBE-011 | disable turns off pixel probe | Pass |
| PROBE-012 | toggle enables/disables | Pass |
| PROBE-013 | enable is idempotent | Pass |
| PROBE-014 | disable resets locked state | Pass |
| PROBE-020 | updates coordinates | Pass |
| PROBE-021 | clamps coordinates to image bounds | Pass |
| PROBE-022 | reads correct pixel from ImageData | Pass |
| PROBE-023 | handles null ImageData gracefully | Pass |
| PROBE-030 | pure green calculates correct HSL | Pass |
| PROBE-031 | pure blue calculates correct HSL | Pass |
| PROBE-032 | grey has 0 saturation | Pass |
| PROBE-033 | white has 100% lightness | Pass |
| PROBE-034 | black has 0% lightness | Pass |
| PROBE-040 | IRE 0 for black | Pass |
| PROBE-041 | IRE 100 for white | Pass |
| PROBE-042 | IRE uses Rec.709 coefficients | Pass |
| PROBE-050 | toggleLock locks position | Pass |
| PROBE-051 | toggleLock unlocks position | Pass |
| PROBE-052 | locked state prevents updates | Pass |
| PROBE-053 | toggleLock emits stateChanged | Pass |
| PROBE-060 | setFormat changes format | Pass |
| PROBE-061 | setFormat emits stateChanged | Pass |
| PROBE-062 | supports all format types | Pass |
| PROBE-070 | setOverlayPosition positions overlay | Pass |
| PROBE-071 | setOverlayPosition does nothing when disabled | Pass |
| PROBE-080 | getState returns copy | Pass |
| PROBE-081 | state includes all required fields | Pass |
| PROBE-090 | dispose cleans up overlay | Pass |

### Test Coverage Summary
- Initialization: Full coverage
- Enable/Disable: Full coverage
- RGB value reading: Full coverage
- HSL calculation: Full coverage
- IRE calculation: Full coverage
- Lock functionality: Full coverage
- Format selection: Full coverage
- State management: Full coverage
- Cleanup: Full coverage

## Future Enhancements

### Priority 1 (High Value)
1. **Alpha channel display**: Add alpha value to RGB display
2. **Area averaging mode**: Sample NxN pixel area instead of single pixel

### Priority 2 (Medium Value)
3. **Source vs rendered toggle**: Show pre-pipeline vs post-pipeline values
4. **Out-of-range indication**: Highlight values outside 0-1 range for HDR
5. **Color space display**: Show current color space (sRGB, Rec.709, etc.)

### Priority 3 (Nice to Have)
6. **Zoom to pixel**: One-click zoom to 100% centered on probe location
7. **Multiple persistent points**: Allow multiple locked sample points
8. **Export sample data**: Export probe history to CSV
