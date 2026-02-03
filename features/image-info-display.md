# Image Information Display

## Original OpenRV Implementation
OpenRV provides an image information widget displaying comprehensive metadata:

**Geometry Information**:
- Image resolution (width x height)
- Pixel aspect ratio
- Data window vs display window (for EXR)
- Bit depth and data type

**File Information**:
- File path and name
- File format
- Compression type
- File size

**Sequence Information**:
- Current frame number
- Total frame count
- Frame rate
- Timecode (if available)

**Color Information**:
- Color space
- Transfer function
- Primaries
- Gamma values

**Technical Details**:
- Channel count and names
- Data type (8-bit, 16-bit, float)
- Compression ratio
- Custom metadata from file headers

The information widget is a heads-up display overlaid on the image, toggled via F-keys.

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Implementation Details

### Component Location
- **Main Component**: `/Users/lifeart/Repos/openrv-web/src/ui/components/InfoPanel.ts`
- **App Integration**: `/Users/lifeart/Repos/openrv-web/src/App.ts` (lines 486, 670-693, 870-888, 1344-1347, 1692-1710)
- **Test Helper**: `/Users/lifeart/Repos/openrv-web/src/test-helper.ts` (getInfoPanelState function)

### Implemented Features

| Feature | Status | Notes |
|---------|--------|-------|
| Resolution display | Implemented | Shows width x height (e.g., "1920 x 1080") |
| Frame number / total frames | Implemented | Shows "Frame: X / Y" (1-based display) |
| Frame rate display | Implemented | Shows "X fps" |
| File name indicator | Implemented | Truncates long filenames with ellipsis |
| Timecode display | Implemented | Shows "TC: HH:MM:SS:FF" format |
| Duration display | Implemented | Optional field, disabled by default |
| Color at cursor | Implemented | Shows RGB values with color swatch when hovering |
| Toggleable info overlay | Implemented | Via keyboard shortcut or button |
| Configurable position | Implemented | Top-left, top-right, bottom-left, bottom-right |
| Configurable fields | Implemented | Per-field enable/disable |
| Bit depth information | Not Implemented | Available in IPImage.dataType but not exposed |
| Color space information | Not Implemented | Available in IPImage.metadata.colorSpace but not exposed |
| File format indicator | Not Implemented | Could be extracted from filename extension |
| Compact/expanded views | Not Implemented | Single view mode only |

### Architecture

```typescript
// InfoPanel State Interface
interface InfoPanelState {
  enabled: boolean;
  position: InfoPanelPosition;  // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  fields: InfoPanelFields;
}

// InfoPanel Fields Interface
interface InfoPanelFields {
  filename: boolean;      // Default: true
  resolution: boolean;    // Default: true
  frameInfo: boolean;     // Default: true
  timecode: boolean;      // Default: true
  duration: boolean;      // Default: false
  fps: boolean;           // Default: true
  colorAtCursor: boolean; // Default: true
}

// InfoPanel Data Interface
interface InfoPanelData {
  filename?: string;
  width?: number;
  height?: number;
  currentFrame?: number;
  totalFrames?: number;
  timecode?: string;
  duration?: string;
  fps?: number;
  colorAtCursor?: { r: number; g: number; b: number } | null;
  cursorPosition?: { x: number; y: number } | null;
}
```

### Events Emitted
- `stateChanged`: Emitted when enabled/position/fields change
- `visibilityChanged`: Emitted when panel is shown/hidden

### Keyboard Shortcut
- **Shift+Alt+I** (`view.toggleInfoPanel`): Toggle info panel visibility

### UI Control
Located in View tab as an icon-only button with `data-testid="info-panel-toggle"`.

## Requirements
- [x] Resolution display
- [x] Frame number / total frames
- [x] Frame rate display
- [ ] File format indicator
- [ ] Color space information
- [ ] Bit depth information
- [x] File path display
- [x] Timecode display (optional)
- [x] Toggleable info overlay
- [ ] Compact and expanded views

## UI/UX Specification

### Visual Design
- **Background**: Semi-transparent black (`rgba(0, 0, 0, 0.75)`)
- **Border**: Subtle white border (`rgba(255, 255, 255, 0.1)`)
- **Border radius**: 6px
- **Padding**: 8px 12px
- **Font**: Monospace, 11px
- **Text color**: Uses CSS variable `var(--text-primary)`
- **Z-index**: 500
- **Pointer events**: None (non-interactive overlay)

### Position Options
| Position | CSS Properties |
|----------|---------------|
| top-left | `top: 10px; left: 10px;` |
| top-right | `top: 10px; right: 10px;` |
| bottom-left | `bottom: 10px; left: 10px;` |
| bottom-right | `bottom: 10px; right: 10px;` |

### Content Formatting
- Filename: Highlighted with `var(--accent-primary)` color, truncated to 25 chars
- Resolution: Plain text, format "WIDTH x HEIGHT"
- Frame: "Frame: CURRENT / TOTAL" (1-based indexing for display)
- Timecode: "TC: HH:MM:SS:FF"
- FPS: "X fps"
- Color: RGB swatch (12x12px) + "RGB: R, G, B"

## Technical Notes

### Integration Points
1. **App.ts**: Creates InfoPanel instance and wires up events
2. **Viewer**: InfoPanel element is appended to viewer container
3. **Session**: Frame/fps data comes from session state
4. **ViewerInteraction**: Mouse move events update cursor color

### Data Flow
```
Session (frame change) --> App.updateInfoPanel() --> InfoPanel.update()
                                                          |
Mouse move over viewer ----> App (session.mouseMove) ----+
```

### Styling Compliance
- Uses CSS variables for theming (`var(--text-primary)`, `var(--accent-primary)`, `var(--text-muted)`)
- Follows flat design pattern from UI.md
- Non-interactive (pointer-events: none) to not interfere with viewer interaction

## E2E Test Cases

### Test File Locations
- `/Users/lifeart/Repos/openrv-web/e2e/info-panel.spec.ts` - Dedicated info panel tests
- `/Users/lifeart/Repos/openrv-web/e2e/new-features.spec.ts` - Additional info panel tests (INFO-001 to INFO-013)

### Test Coverage

| Test ID | Description | Status |
|---------|-------------|--------|
| IP-E001 | Info panel is disabled by default | Passing |
| IP-E002 | Pressing Shift+Alt+I toggles info panel | Passing |
| IP-E003 | Info panel is visible when enabled | Passing |
| IP-E010 | Info panel shows filename | Passing |
| IP-E011 | Info panel shows resolution | Passing |
| IP-E012 | Info panel shows current frame | Passing |
| IP-E013 | Info panel shows total frames | Passing |
| IP-E014 | Info panel shows fps | Passing |
| IP-E015 | Info panel frame updates when navigating | Passing |
| IP-E020 | Default position is top-left | Passing |
| IP-E021 | Position can be changed to top-right | Passing |
| IP-E022 | Position can be changed to bottom-left | Passing |
| IP-E023 | Position can be changed to bottom-right | Passing |
| IP-E030 | Info panel control exists in View tab | Passing |
| IP-E040 | Info panel state persists when changing frames | Passing |
| IP-E041 | Info panel position persists when changing frames | Passing |
| IP-E042 | Info panel state persists when changing tabs | Passing |
| IP-E050 | Info panel frame matches session frame | Passing |
| IP-E051 | Info panel total frames matches session frame count | Passing |
| IP-E052 | Info panel fps matches session fps | Passing |
| INFO-001 | Info panel should be disabled by default | Passing |
| INFO-002 | Info toggle button should show/hide panel | Passing |
| INFO-003 | Keyboard shortcut should toggle info panel | Passing |
| INFO-004 | Info panel should show filename when enabled | Passing |
| INFO-005 | Info panel should show resolution when enabled | Passing |
| INFO-006 | Info panel should show frame info when enabled | Passing |
| INFO-007 | Info panel should show FPS when enabled | Passing |
| INFO-008 | Info panel should update on frame change | Passing |
| INFO-009 | Info panel DOM element should be visible when enabled | Passing |
| INFO-010 | Info panel should have default position top-left | Passing |
| INFO-011 | Info panel should show cursor color when hovering | Passing |
| INFO-012 | Cursor color updates when mouse moves over viewer | Passing |
| INFO-013 | Cursor color clears when mouse leaves viewer | Passing |

## Unit Test Cases

### Test File Location
`/Users/lifeart/Repos/openrv-web/src/ui/components/InfoPanel.test.ts`

### Test Coverage

| Test ID | Description | Status |
|---------|-------------|--------|
| INFO-U001 | Creates InfoPanel instance | Passing |
| INFO-U002 | Panel is disabled by default | Passing |
| INFO-U003 | Default position is top-left | Passing |
| INFO-U010 | getElement returns container element | Passing |
| INFO-U011 | Container has data-testid | Passing |
| INFO-U012 | Container has info-panel class | Passing |
| INFO-U013 | Container is hidden by default | Passing |
| INFO-U020 | Enable shows panel | Passing |
| INFO-U021 | Disable hides panel | Passing |
| INFO-U022 | Toggle shows hidden panel | Passing |
| INFO-U023 | Toggle hides visible panel | Passing |
| INFO-U024 | Enable emits visibilityChanged event | Passing |
| INFO-U025 | Disable emits visibilityChanged event | Passing |
| INFO-U030 | setPosition changes position | Passing |
| INFO-U031 | top-left position sets top and left | Passing |
| INFO-U032 | top-right position sets top and right | Passing |
| INFO-U033 | bottom-left position sets bottom and left | Passing |
| INFO-U034 | bottom-right position sets bottom and right | Passing |
| INFO-U035 | setPosition emits stateChanged | Passing |
| INFO-U040 | Default fields include filename | Passing |
| INFO-U041 | Default fields include resolution | Passing |
| INFO-U042 | Default fields include frameInfo | Passing |
| INFO-U043 | Default fields exclude duration | Passing |
| INFO-U044 | setFields updates field settings | Passing |
| INFO-U045 | toggleField toggles specific field | Passing |
| INFO-U046 | setFields emits stateChanged | Passing |
| INFO-U047 | getFields returns copy of fields | Passing |
| INFO-U050 | Update stores data | Passing |
| INFO-U051 | Update with resolution shows dimensions | Passing |
| INFO-U052 | Update with frame info shows frame | Passing |
| INFO-U053 | Update with fps shows fps | Passing |
| INFO-U054 | Update with color shows RGB values | Passing |
| INFO-U055 | Update does not render when disabled | Passing |
| INFO-U060 | getState returns current state | Passing |
| INFO-U061 | getState returns copy of fields | Passing |
| INFO-U070 | setState restores position | Passing |
| INFO-U071 | setState restores enabled state | Passing |
| INFO-U072 | setState restores fields | Passing |
| INFO-U073 | setState with partial state works | Passing |
| INFO-U080 | Dispose can be called without error | Passing |
| INFO-U081 | Dispose can be called multiple times | Passing |
| INFO-U082 | Dispose removes element | Passing |
| INFO-U090 | Panel has absolute positioning | Passing |
| INFO-U091 | Panel has high z-index | Passing |
| INFO-U092 | Panel has no pointer events | Passing |
| INFO-U093 | Panel uses monospace font | Passing |
| INFO-U100 | Disabled field is not rendered | Passing |
| INFO-U101 | Enabled field is rendered | Passing |
| INFO-U110-* | All positions are valid | Passing |

## Future Enhancements

### Recommended Additions
1. **Bit depth display**: Add `bitDepth` field using `IPImage.dataType` (uint8=8-bit, uint16=16-bit, float32=32-bit float)
2. **Color space display**: Add `colorSpace` field using `IPImage.metadata.colorSpace`
3. **File format indicator**: Extract from filename extension or source metadata
4. **Compact/expanded modes**: Toggle between minimal (frame/time) and full info display
5. **Custom metadata**: Display EXR/DPX custom attributes from file headers
6. **Pixel aspect ratio**: Add when non-square pixels are detected
