# Crop and Uncrop

## Original OpenRV Implementation
OpenRV provides per-frame geometry adjustments for image cropping and placement:

**Crop Functionality**:
- Define a crop region (x0, y0, x1, y1) to show only a portion of the image
- Per-source crop settings
- Interactive crop adjustment

**Uncrop Functionality**:
- Inset image into a larger virtual canvas (width, height, x, y)
- Useful for comparing images of different resolutions
- EXR data window / display window support

**EXR Window Handling**:
- Proper handling of EXR data window vs display window
- Automatic uncrop based on display window metadata
- Support for overscan areas

**Use Cases**:
- Focus on specific regions of interest
- Compare different resolution renders
- Handle varying aspect ratios
- View partial renders in context

## Status
- [ ] Not implemented
- [x] Partially implemented
- [ ] Fully implemented

### Implementation Summary
The **Crop** functionality is fully implemented. The **Uncrop** (canvas extension) and **EXR data/display window** support are not yet implemented.

| Feature | Status | Notes |
|---------|--------|-------|
| Crop region selection | Implemented | Normalized coordinates (0-1) |
| Interactive crop handles | Implemented | Corners and edges with drag support |
| Numeric crop input | Partial | Dimensions label shown, but no direct pixel input fields |
| Aspect ratio presets | Implemented | Free, 16:9, 4:3, 1:1, 9:16, 2.35:1 |
| Reset crop function | Implemented | Resets to full frame |
| Per-source crop settings | Implemented | State persists per session |
| Crop pixel clipping | Implemented | Actual image clipping, not just overlay |
| Session persistence | Implemented | CropState saved in SessionState |
| Export with crop | Implemented | Exported images are cropped |
| Uncrop/canvas extension | Implemented | Uniform and per-side padding modes |
| EXR data/display window | Not implemented | - |
| Copy crop settings between sources | Not implemented | - |

## Requirements
- [x] Region of interest (ROI) selection
- [x] Interactive crop handles
- [ ] Numeric crop input (pixel values) - partial: display only
- [x] Aspect ratio preservation option
- [x] Reset crop function
- [x] Per-source crop settings
- [x] Uncrop/canvas extension
- [ ] EXR data/display window support
- [ ] Copy crop settings between sources

## UI/UX Specification

### Location
- **Tab**: Transform (accessed via Tab 4 or keyboard shortcut `4`)
- **Control**: CropControl button with dropdown panel

### Keyboard Shortcuts
- `Shift+K` - Toggle crop mode on/off
- `K` - Open crop panel (Transform tab)
- `Escape` - Close crop panel

### Panel UI Elements
1. **Enable Toggle** - ON/OFF switch with aria-role="switch"
2. **Aspect Ratio Dropdown** - Select aspect ratio preset
3. **Reset Button** - Restores default full-frame crop
4. **Dimensions Label** - Shows current crop in pixels (e.g., "1080 x 1080 px")
5. **Instructions** - "Drag on the image to set crop region. Hold Shift to constrain aspect ratio."

### Interactive Crop Overlay
- **Corner handles** - 8px squares at all four corners
- **Edge handles** - Center of each edge for single-dimension resize
- **Move handle** - Drag inside crop region to reposition
- **Rule of thirds guides** - Shown during editing (panel open)
- **Darkened outside areas** - Semi-transparent mask outside crop region

### Behavior
- Crop handles are only active when crop panel is open
- When panel is closed, crop is applied (pixels clipped) but handles are disabled
- Crop region is clamped to stay within image bounds (0-1 normalized)
- Minimum crop size is 5% of image dimension (MIN_CROP_FRACTION = 0.05)

## Technical Notes

### Files
- **Component**: `/Users/lifeart/Repos/openrv-web/src/ui/components/CropControl.ts`
- **Unit Tests**: `/Users/lifeart/Repos/openrv-web/src/ui/components/CropControl.test.ts`
- **E2E Tests**: `/Users/lifeart/Repos/openrv-web/e2e/crop.spec.ts`
- **Viewer Integration**: `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts`

### Data Structures

```typescript
// Crop region (normalized coordinates 0-1)
interface CropRegion {
  x: number;      // 0-1 normalized left position
  y: number;      // 0-1 normalized top position
  width: number;  // 0-1 normalized width
  height: number; // 0-1 normalized height
}

// Full crop state
interface CropState {
  enabled: boolean;
  region: CropRegion;
  aspectRatio: string | null;  // null = free, "16:9", "4:3", "1:1", etc.
}

// Default state
const DEFAULT_CROP_REGION: CropRegion = { x: 0, y: 0, width: 1, height: 1 };
const DEFAULT_CROP_STATE: CropState = {
  enabled: false,
  region: DEFAULT_CROP_REGION,
  aspectRatio: null,
};
```

### Aspect Ratio Presets
```typescript
const ASPECT_RATIOS = [
  { label: 'Free', value: null, ratio: null },
  { label: '16:9', value: '16:9', ratio: 16 / 9 },
  { label: '4:3', value: '4:3', ratio: 4 / 3 },
  { label: '1:1', value: '1:1', ratio: 1 },
  { label: '9:16', value: '9:16', ratio: 9 / 16 },
  { label: '2.35:1', value: '2.35:1', ratio: 2.35 },
];
```

### Events Emitted
- `cropStateChanged: CropState` - Any crop state change
- `cropModeToggled: boolean` - When crop is enabled/disabled
- `panelToggled: boolean` - When panel opens/closes

### Viewer Integration
- `Viewer.setCropState(state: CropState)` - Set crop state
- `Viewer.getCropState(): CropState` - Get current state
- `Viewer.setCropRegion(region: CropRegion)` - Update region only
- `Viewer.setCropEnabled(enabled: boolean)` - Toggle crop

### Render Pipeline Position
Crop is applied early in the render pipeline:
1. Draw source image with transform (rotation/flip)
2. **Apply crop** (clips pixels to region)
3. Stereo mode
4. Lens distortion
5. Color adjustments
6. Paint annotations

### Session Persistence
CropState is part of `SessionState` and saved/loaded with projects:
```typescript
interface SessionState {
  // ...
  crop: CropState;
  // ...
}
```

## E2E Test Cases

All tests are located in `/Users/lifeart/Repos/openrv-web/e2e/crop.spec.ts`

### Crop Toggle Tests
| ID | Description | Status |
|----|-------------|--------|
| CROP-001 | Pressing Shift+K should toggle crop mode on | Implemented |
| CROP-002 | Pressing Shift+K twice should toggle crop mode off | Implemented |
| CROP-003 | Crop button should open panel | Implemented |
| CROP-004 | Panel toggle switch should enable/disable crop | Implemented |
| CROP-005 | Escape key should close crop panel | Implemented |
| CROP-006 | Clicking outside panel should NOT close it (allows handle dragging) | Implemented |
| CROP-007 | Crop handles should NOT intercept events when panel is closed | Implemented |
| CROP-008 | Crop handles should work when panel is open | Implemented |
| CROP-009 | Crop state should persist after panel close | Implemented |

### Default Crop Region Tests
| ID | Description | Status |
|----|-------------|--------|
| CROP-010 | Default crop region should cover full image | Implemented |
| CROP-011 | Default aspect ratio should be null (free) | Implemented |
| CROP-012 | Enabling crop should not change default region | Implemented |

### Aspect Ratio Preset Tests
| ID | Description | Status |
|----|-------------|--------|
| CROP-020 | Aspect ratio dropdown should show all presets | Implemented |
| CROP-021 | Selecting 16:9 should update aspect ratio state | Implemented |
| CROP-022 | Selecting 16:9 should adjust crop region to 16:9 pixel ratio | Implemented |
| CROP-023 | Selecting 1:1 should create square crop region in pixels | Implemented |
| CROP-024 | Selecting 4:3 should produce correct pixel ratio | Implemented |
| CROP-025 | Selecting 9:16 (portrait) should produce correct pixel ratio | Implemented |
| CROP-026 | Selecting Free should allow any aspect ratio | Implemented |
| CROP-027 | Aspect ratio changes should be visually reflected | Implemented |

### Crop Reset Tests
| ID | Description | Status |
|----|-------------|--------|
| CROP-030 | Reset button should restore default crop state | Implemented |
| CROP-031 | Reset should update visual overlay | Implemented |

### Crop Visual Overlay Tests
| ID | Description | Status |
|----|-------------|--------|
| CROP-040 | Enabling crop with non-full region should show overlay | Implemented |
| CROP-041 | Disabling crop should hide overlay | Implemented |
| CROP-042 | Crop overlay should show rule of thirds guides when editing | Implemented |

### Crop State Persistence Tests
| ID | Description | Status |
|----|-------------|--------|
| CROP-050 | Crop enabled state should persist across frame changes | Implemented |
| CROP-051 | Aspect ratio should persist across frame changes | Implemented |
| CROP-052 | Crop region should persist across frame changes | Implemented |

### Crop Region Constraint Tests
| ID | Description | Status |
|----|-------------|--------|
| CROP-060 | Crop region values should be normalized (0-1) | Implemented |
| CROP-061 | Crop region should stay within bounds after aspect ratio change | Implemented |
| CROP-062 | Aspect ratio should be centered in available space | Implemented |

### Crop Panel UI Tests
| ID | Description | Status |
|----|-------------|--------|
| CROP-070 | Panel should be positioned correctly | Implemented |
| CROP-071 | Panel should have high z-index to be visible above viewer | Implemented |
| CROP-072 | Toggle switch should update text on state change | Implemented |
| CROP-073 | Aspect ratio select should update on state change | Implemented |

### Integration Tests
| ID | Description | Status |
|----|-------------|--------|
| CROP-080 | Crop should work with zoom | Implemented |
| CROP-081 | Crop should work with rotation | Implemented |
| CROP-082 | Crop should work with flip | Implemented |

### Interactive Crop Dragging Tests
| ID | Description | Status |
|----|-------------|--------|
| CROP-090 | Dragging bottom-right corner should resize crop region | Implemented |
| CROP-091 | Dragging top-left corner should resize and reposition crop region | Implemented |
| CROP-092 | Dragging inside crop region should move it | Implemented |
| CROP-093 | Dragging edge should resize in one dimension only | Implemented |
| CROP-094 | Free crop should allow any aspect ratio when dragging | Implemented |
| CROP-095 | Crop region should stay within image bounds | Implemented |
| CROP-096 | Dragging crop should update visual overlay | Implemented |

### Pixel Clipping Tests
| ID | Description | Status |
|----|-------------|--------|
| CROP-100 | Crop should clip displayed pixels (not just overlay) | Implemented |
| CROP-101 | Crop should affect visible region dimensions | Implemented |
| CROP-102 | Crop should work with rotation | Implemented |
| CROP-103 | Crop should work with horizontal flip | Implemented |
| CROP-104 | Full-frame crop should skip clipping for performance | Implemented |
| CROP-105 | Overlay should show full editing UI when panel is open | Implemented |
| CROP-106 | Overlay should show full editing UI during drag | Implemented |

### Crop Export Tests
| ID | Description | Status |
|----|-------------|--------|
| CROP-110 | Export with crop should produce cropped dimensions | Implemented |
| CROP-111 | Export with rotation + crop should work correctly | Implemented |
| CROP-112 | Export with flip + crop should work correctly | Implemented |
| CROP-113 | Export with rotation 180 + crop should work correctly | Implemented |
| CROP-114 | Export with rotation 270 + crop should work correctly | Implemented |
| CROP-115 | Export with rotation + flip + crop should work correctly | Implemented |

### Aspect Ratio Pixel Correctness Tests
| ID | Description | Status |
|----|-------------|--------|
| CROP-200 | All presets should produce correct pixel aspect ratios | Implemented |
| CROP-201 | 16:9 crop on wide source should use full height | Implemented |
| CROP-202 | 1:1 crop should produce equal pixel dimensions | Implemented |
| CROP-203 | 9:16 (portrait) on landscape source should use full height | Implemented |
| CROP-204 | 2.35:1 crop should be close to source aspect on very wide video | Implemented |
| CROP-205 | Crop region should be maximized when applied from full-frame | Implemented |
| CROP-206 | Switching presets should always produce correct ratio | Implemented |
| CROP-207 | Crop region should be centered for all presets | Implemented |
| CROP-208 | Aspect ratio should remain correct after toggling crop off and on | Implemented |
| CROP-209 | Normalized crop dimensions should account for source aspect | Implemented |

## Unit Test Cases

All tests are located in `/Users/lifeart/Repos/openrv-web/src/ui/components/CropControl.test.ts`

### Initialization Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-001 | Starts with default crop state | Implemented |
| CRP-002 | Starts with full region | Implemented |
| CRP-003 | Default region covers entire image | Implemented |

### getCropState Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-004 | Returns copy of state | Implemented |
| CRP-005 | Returns copy of region | Implemented |

### setCropRegion Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-006 | Sets crop region | Implemented |
| CRP-007 | Emits cropStateChanged event | Implemented |
| CRP-008 | Stores copy of region | Implemented |

### Toggle Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-009 | Toggle enables crop when disabled | Implemented |
| CRP-010 | Toggle disables crop when enabled | Implemented |
| CRP-011 | Toggle emits cropStateChanged event | Implemented |
| CRP-012 | Toggle emits cropModeToggled event | Implemented |
| CRP-059 | Toggle off should auto-close panel if open | Implemented |
| CRP-060 | Toggle off should not emit panelToggled when panel is already closed | Implemented |

### Reset Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-013 | Reset disables crop | Implemented |
| CRP-014 | Reset restores default region | Implemented |
| CRP-015 | Reset clears aspect ratio | Implemented |
| CRP-016 | Reset emits cropStateChanged event | Implemented |

### Aspect Ratio Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-017 | Returns null for free aspect ratio | Implemented |
| CRP-025 | 16:9 on 1920x1080 source yields correct pixel aspect ratio | Implemented |
| CRP-026 | 1:1 on 1920x1080 source yields square pixel crop | Implemented |
| CRP-027 | 4:3 on 1920x1080 source yields correct ratio | Implemented |
| CRP-028 | 9:16 on 1920x1080 source yields portrait ratio | Implemented |
| CRP-029 | Aspect ratio is centered within original region | Implemented |
| CRP-030 | Region stays within [0,1] bounds after aspect ratio on offset region | Implemented |
| CRP-031 | Region stays within [0,1] bounds near bottom-right corner | Implemented |
| CRP-032 | "Free" aspect ratio does not modify region | Implemented |
| CRP-033 | Aspect ratio on portrait source (1080x1920) works correctly | Implemented |
| CRP-034 | Aspect ratio on square source (1000x1000) works correctly | Implemented |
| CRP-035 | Aspect ratio emits cropStateChanged with correct region | Implemented |
| CRP-036 | Dimensions label updates after aspect ratio change | Implemented |

### Panel Visibility Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-018 | showPanel makes panel visible | Implemented |
| CRP-019 | hidePanel hides panel | Implemented |
| CRP-020 | togglePanel toggles visibility | Implemented |

### Render Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-021 | Render returns HTMLElement | Implemented |
| CRP-022 | Render returns container element | Implemented |

### Constants Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-023 | DEFAULT_CROP_STATE has correct default values | Implemented |
| CRP-039 | ASPECT_RATIOS contains expected presets | Implemented |
| CRP-040 | Free has null ratio | Implemented |
| CRP-041 | All presets have correct numeric ratios | Implemented |
| CRP-042 | MIN_CROP_FRACTION is 5% of image dimension | Implemented |
| CRP-043 | MIN_CROP_FRACTION is positive and less than 1 | Implemented |

### setState Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-044 | Sets enabled state and emits events | Implemented |
| CRP-045 | Does not emit cropModeToggled when enabled unchanged | Implemented |
| CRP-046 | Sets region and aspect ratio | Implemented |

### Accessibility Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-047 | Panel has role="dialog" and aria-label | Implemented |
| CRP-048 | Toggle switch has role="switch" and aria-checked | Implemented |
| CRP-049 | Toggle switch aria-checked updates on toggle | Implemented |
| CRP-053 | Select has aria-label | Implemented |

### Keyboard Handler Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-050 | Escape key closes panel when open | Implemented |
| CRP-051 | Escape key does nothing when panel is closed | Implemented |

### Close Button Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-052 | Close button hides the panel | Implemented |

### Edge Case Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-037 | setSourceDimensions updates dimensions label | Implemented |
| CRP-038 | Handles zero dimensions gracefully | Implemented |
| CRP-054 | Extremely tall aspect ratio on wide source still meets minimum width | Implemented |
| CRP-055 | Extremely wide aspect ratio on tall source still meets minimum height | Implemented |
| CRP-056 | Zero source height does not crash | Implemented |
| CRP-057 | Negative source dimensions do not crash | Implemented |

### Dispose Tests
| ID | Description | Status |
|----|-------------|--------|
| CRP-024 | Dispose does not throw | Implemented |
| CRP-058 | Dispose removes keydown listener | Implemented |

## Future Work (Uncrop Feature)

### Proposed Uncrop Implementation

**Data Structures**:
```typescript
interface UncropState {
  enabled: boolean;
  canvas: {
    width: number;   // Virtual canvas width in pixels
    height: number;  // Virtual canvas height in pixels
    x: number;       // Image offset X within canvas
    y: number;       // Image offset Y within canvas
  };
  autoFit: boolean;  // Auto-adjust to match largest source
}
```

**Use Cases**:
1. Compare different resolution renders by placing them on a common canvas
2. View EXR sequences with data window / display window metadata
3. Add letterboxing or pillarboxing for aspect ratio matching

**Required E2E Tests** (not yet implemented):
| ID | Description |
|----|-------------|
| UNCROP-001 | Uncrop should extend canvas beyond source dimensions |
| UNCROP-002 | Image should be positioned at specified offset |
| UNCROP-003 | Uncrop should work with crop (crop applied to uncropped canvas) |
| UNCROP-004 | EXR data window should be auto-detected |
| UNCROP-005 | EXR display window should define uncrop region |
| UNCROP-006 | Multiple sources should align to common display window |
| UNCROP-007 | Export should include full uncrop canvas |
| UNCROP-008 | Uncrop state should persist in session |

**Required Unit Tests** (not yet implemented):
| ID | Description |
|----|-------------|
| UNCRP-001 | Default uncrop state has correct values |
| UNCRP-002 | setUncropState updates canvas dimensions |
| UNCRP-003 | Uncrop emits stateChanged event |
| UNCRP-004 | Reset restores default uncrop |
| UNCRP-005 | EXR metadata parsing extracts data window |
| UNCRP-006 | EXR metadata parsing extracts display window |
