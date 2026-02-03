# Pan, Zoom, and Rotate

## Original OpenRV Implementation
OpenRV provides comprehensive image navigation controls:

**Pan (Translation)**:
- Alt + mouse drag to pan the image
- Keyboard shortcuts for directional panning
- Reset to center position

**Zoom**:
- Ctrl + mouse drag for zoom
- Number keys (1-8) for preset zoom levels
- 1:1 pixel view
- Fit to window
- Fill window
- Arbitrary zoom levels
- Zoom centered on cursor position

**Rotation**:
- Image rotation via Image menu
- Mouse scrubbing for rotation adjustment
- 90-degree rotation presets
- Arbitrary angle rotation

**Flip/Flop**:
- Horizontal flip (mirror)
- Vertical flip (flop)
- Per-eye transformations for stereo content

**Frame to Fit**:
- 'F' key to frame content to fit window
- Automatic aspect ratio preservation

**Resampling Methods**:
- Area: Best for downscaling
- Linear: Bilinear interpolation
- Cube: Bicubic interpolation
- Nearest: Pixel-perfect (no interpolation)

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Requirements
- [x] Mouse drag panning
- [x] Mouse wheel zoom
- [x] Pinch-to-zoom (touch devices)
- [x] Keyboard zoom controls
- [x] Preset zoom levels (fit, fill, 1:1, 2x, 4x)
- [x] Zoom to cursor position
- [x] Image rotation (90-degree presets)
- [x] Horizontal/vertical flip
- [x] Reset view function
- [x] Smooth zoom animation (ease-out cubic, 200ms)
- [x] Pan limits (implicit via viewport bounds)

**Additional implemented features:**
- Scale and translate transform support (API available, not exposed in UI)
- Crop mode with aspect ratio presets
- State persistence across frame changes

## UI/UX Specification

### Zoom Control
- **Location**: View tab context toolbar
- **Component**: `ZoomControl` dropdown
- **Presets**: Fit, 25%, 50%, 100%, 200%, 400%
- **Button displays**: Current zoom level with dropdown indicator
- **Icon**: zoom-in icon from shared icon system

### Transform Control
- **Location**: Transform tab context toolbar
- **Component**: `TransformControl` button group
- **Buttons**:
  - Rotate Left (counter-clockwise 90 degrees)
  - Rotate Right (clockwise 90 degrees)
  - Flip Horizontal (mirror)
  - Flip Vertical (flop)
  - Reset (restore all transforms to default)
- **Active state**: Flip buttons show accent color when enabled

### Pan/Zoom Interactions
- **Pan**: Mouse drag when pan tool selected (V key) or while zoomed in
- **Zoom**: Mouse wheel on canvas area
- **Pinch zoom**: Two-finger pinch gesture on touch devices
- **Zoom to cursor**: Zoom centers on mouse position

### Keyboard Shortcuts
| Action | Shortcut | Description |
|--------|----------|-------------|
| Fit to window | F | Fit image to viewport |
| Fit to window | Shift+F | Alternative fit shortcut |
| Zoom 50% | 0 | Set zoom to 50% (View tab) |
| Rotate left | Shift+R | Rotate 90 degrees counter-clockwise |
| Rotate right | Alt+R | Rotate 90 degrees clockwise |
| Flip horizontal | Alt+H | Mirror image horizontally |
| Flip vertical | Shift+V | Flip image vertically |
| Pan tool | V | Select pan/none tool |

## Technical Notes

### Implementation Files
- `/src/ui/components/ZoomControl.ts` - Zoom dropdown control
- `/src/ui/components/TransformControl.ts` - Rotation/flip control
- `/src/ui/components/ViewerInteraction.ts` - Zoom/pan calculation utilities
- `/src/ui/components/Viewer.ts` - Main viewer with pan/zoom/transform state
- `/src/ui/components/ViewerRenderingUtils.ts` - Transform rendering utilities

### State Management
```typescript
// Viewer state properties (Viewer.ts)
private panX = 0;
private panY = 0;
private zoom = 1;
private transform: Transform2D = {
  rotation: 0,      // 0 | 90 | 180 | 270 degrees
  flipH: false,
  flipV: false,
  scale: { x: 1, y: 1 },
  translate: { x: 0, y: 0 }
};
```

### Zoom Calculation (ViewerInteraction.ts)
- `calculateWheelZoom()` - Compute zoom from wheel deltaY
- `calculateZoomPan()` - Adjust pan to keep point stationary during zoom
- `calculatePinchDistance()` - Distance between two touch points
- `calculatePinchZoom()` - Zoom level from pinch gesture

### Transform Interface
```typescript
interface Transform2D {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  scale: { x: number; y: number };
  translate: { x: number; y: number };
}
```

### Event System
- `ZoomControl` emits `zoomChanged` event with `ZoomLevel`
- `TransformControl` emits `transformChanged` event with `Transform2D`
- Viewer applies transforms in render pipeline

### Render Pipeline Order
Transforms are applied in `drawWithTransform()`:
1. Canvas translation to center
2. Rotation (in radians)
3. Flip (scale -1 on axis)
4. Draw image at center offset

## E2E Test Cases

### Zoom Tests (VIEW-001 to VIEW-007)
| ID | Test | Status |
|----|------|--------|
| VIEW-001 | Clicking Fit should update zoom state and change canvas | Implemented |
| VIEW-002 | Clicking 50% zoom should update state to 0.5 | Implemented |
| VIEW-003 | Clicking 100% zoom should update state to 1.0 | Implemented |
| VIEW-004 | Clicking 200% zoom should update state to 2.0 | Implemented |
| VIEW-005 | Clicking 400% zoom should update state to 4.0 | Implemented |
| VIEW-006 | Pressing F key should fit to window | Implemented |
| VIEW-007 | Scroll wheel should change zoom level | Implemented |

### Pan Tests (VIEW-010 to VIEW-011)
| ID | Test | Status |
|----|------|--------|
| VIEW-010 | Dragging canvas at high zoom should update pan position | Implemented |
| VIEW-011 | Fit to window should reset pan position | Implemented |

### Transform Tests (TRANSFORM-001 to TRANSFORM-051)
| ID | Test | Status |
|----|------|--------|
| TRANSFORM-001 | Transform tab should show rotation controls | Implemented |
| TRANSFORM-002 | Clicking rotate left should update rotation and change canvas | Implemented |
| TRANSFORM-003 | Clicking rotate right should update rotation and change canvas | Implemented |
| TRANSFORM-004 | Shift+R should rotate left (counter-clockwise) | Implemented |
| TRANSFORM-005 | Alt+R should rotate right (clockwise) | Implemented |
| TRANSFORM-006 | Rotation should cycle through 0, 90, 180, 270 degrees | Implemented |
| TRANSFORM-010 | Transform tab should show flip controls | Implemented |
| TRANSFORM-011 | Clicking flip horizontal should toggle flipH state | Implemented |
| TRANSFORM-012 | Clicking flip vertical should toggle flipV state | Implemented |
| TRANSFORM-013 | Shift+H should toggle flip horizontal | Implemented |
| TRANSFORM-014 | Shift+V should toggle flip vertical | Implemented |
| TRANSFORM-030 | Rotation and flip should combine correctly | Implemented |
| TRANSFORM-031 | Double flip should return to near-original | Implemented |
| TRANSFORM-040 | Reset button should restore all transforms to default | Implemented |
| TRANSFORM-050 | Transforms should persist across frame changes | Implemented |
| TRANSFORM-051 | Flip state should persist across frame changes | Implemented |

### State Persistence Tests
| ID | Test | Status |
|----|------|--------|
| VIEW-040 | Zoom level should persist across frame changes | Implemented |
| VIEW-041 | Pan position should persist across frame changes | Implemented |

**E2E Test Files:**
- `/e2e/view-controls.spec.ts` - Zoom and pan tests
- `/e2e/transform-controls.spec.ts` - Rotation and flip tests

## Unit Test Cases

### ZoomControl Tests (ZOOM-U001 to ZOOM-U084)
| ID | Test | Status |
|----|------|--------|
| ZOOM-U001 | Should initialize with fit zoom level | Implemented |
| ZOOM-U010 | Render returns container element | Implemented |
| ZOOM-U011 | Container has zoom button | Implemented |
| ZOOM-U020-U027 | getZoom/setZoom methods work correctly | Implemented |
| ZOOM-U030-U035 | Button label updates correctly for each level | Implemented |
| ZOOM-U040-U045 | Keyboard shortcuts (F, 0) work correctly | Implemented |
| ZOOM-U050-U052 | Dispose cleans up correctly | Implemented |
| ZOOM-U070-U071 | Event listeners work correctly | Implemented |
| ZOOM-U080-U084 | Dropdown visual selection styling | Implemented |

### TransformControl Tests (TRN-001 to TRN-057)
| ID | Test | Status |
|----|------|--------|
| TRN-001-004 | Initialization with default values | Implemented |
| TRN-005-007 | getTransform/setTransform methods | Implemented |
| TRN-008-012 | rotateRight cycles 0->90->180->270->0 | Implemented |
| TRN-013-017 | rotateLeft cycles 0->270->180->90->0 | Implemented |
| TRN-018-020 | toggleFlipH toggles and emits events | Implemented |
| TRN-021-023 | toggleFlipV toggles and emits events | Implemented |
| TRN-024-028 | reset restores all values to defaults | Implemented |
| TRN-029-035 | handleKeyboard (R, Shift+R, H) shortcuts | Implemented |
| TRN-036-037 | render returns correct element | Implemented |
| TRN-040-042 | Combined transforms work correctly | Implemented |
| TRN-043-047 | Scale methods work correctly | Implemented |
| TRN-048-050 | Translate methods work correctly | Implemented |
| TRN-051-055 | hasScaleOrTranslate detection | Implemented |
| TRN-056-057 | Reset clears scale and translate | Implemented |

### ViewerInteraction Tests
| ID | Test | Status |
|----|------|--------|
| getCanvasPoint | Coordinate conversion with bounds | Implemented |
| calculateWheelZoom | Zoom from wheel delta with limits | Implemented |
| calculateZoomPan | Pan adjustment for zoom-to-cursor | Implemented |
| calculatePinchDistance | Distance for pinch gestures | Implemented |
| calculatePinchZoom | Zoom from pinch with limits | Implemented |
| isViewerContentElement | Element filtering | Implemented |
| getPixelCoordinates | Pixel coordinate mapping | Implemented |
| getPixelColor | Color sampling from ImageData | Implemented |

**Unit Test Files:**
- `/src/ui/components/ZoomControl.test.ts`
- `/src/ui/components/TransformControl.test.ts`
- `/src/ui/components/ViewerInteraction.test.ts`

## Notes

### Differences from Original OpenRV
1. **Rotation**: Only 90-degree presets (no arbitrary angles or mouse scrubbing)
2. **Zoom shortcuts**: Number keys 1-5 reserved for tab navigation
3. **No resampling selection**: Browser canvas handles interpolation
4. **Smooth animation**: Implemented via `smoothZoomTo()` with ease-out cubic easing

### Future Enhancements
- Arbitrary angle rotation with continuous adjustment
- Smooth animated zoom transitions
- Configurable zoom min/max limits
- Touch gesture improvements (rotation via two-finger twist)
- Keyboard pan (arrow keys when zoomed)
