# Channel Isolation and Remapping

## Original OpenRV Implementation
OpenRV provides comprehensive channel management for multi-channel images:

**Channel Isolation**:
- View individual RGBA channels
- Luminance-only view
- Alpha channel visualization
- Display-stage channel manipulation in hardware

**Channel Remapping**:
- Specify exact RGBA mappings from multi-channel files
- Map arbitrary channels to display channels
- Support for EXR multi-channel workflows (beauty, diffuse, specular, etc.)

**Channel Reordering**:
- Rearrange channel order for display
- Swap channels (e.g., RGB to BGR)
- Custom channel combinations

**Multi-Channel EXR Support**:
- Select specific layers/channels from complex EXR files
- View AOVs (Arbitrary Output Variables)
- Layer selection UI

**Use Cases**:
- Debugging render passes
- Viewing alpha/matte channels
- Examining specific AOVs
- Checking channel data integrity

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented (as of 2026-02-03)

### What's Implemented

**Channel Isolation (Fully Implemented)**:
- RGB channel viewing (default mode)
- Red channel isolation (grayscale display of R values)
- Green channel isolation (grayscale display of G values)
- Blue channel isolation (grayscale display of B values)
- Alpha channel visualization (grayscale display with full opacity)
- Luminance/Grayscale view using Rec.709 coefficients (0.2126R + 0.7152G + 0.0722B)
- Dropdown UI control (`ChannelSelect` component) with color indicators
- Keyboard shortcuts: Shift+R (red), Shift+G (green), Shift+B (blue), Shift+A (alpha), Shift+L/Y (luminance), Shift+N (RGB normal)
- Visual indication of active channel mode (button highlighting, dropdown selection)
- State persistence across frame changes and tab switches
- Integration with EffectProcessor for worker-based processing
- Scope updates (Histogram, Waveform, Vectorscope) reflect channel isolation changes

**Multi-Channel EXR Support (Fully Implemented)**:
- AOV (Arbitrary Output Variables) layer extraction from EXR files
- Layer selection UI dropdown (appears only for multi-layer EXR files)
- Support for common layer naming conventions (e.g., `diffuse.R`, `specular.G`)
- Automatic mapping of layer channels to display RGBA
- Single-channel layers displayed as grayscale
- Channel remapping API for custom RGBA mappings

**Technical Implementation**:
- `ChannelSelect` component: `/Users/lifeart/Repos/openrv-web/src/ui/components/ChannelSelect.ts`
- `applyChannelIsolation()` function for ImageData processing
- `getChannelValue()` utility for per-pixel channel extraction
- Integration in `Viewer.ts` render pipeline (applied after color effects, before paint layer)
- Worker support via `EffectProcessor.ts` and `effectProcessor.worker.ts`
- `extractLayerInfo()` in EXRDecoder for layer parsing
- `resolveChannelMapping()` for custom channel-to-RGBA mapping
- `FileSourceNode.getEXRLayers()` and `setEXRLayer()` for layer management

### What's NOT Implemented

**Channel Reordering/Swapping**:
- No channel swap functionality (RGB to BGR, etc.) - not commonly needed
- No custom channel combinations UI - API available via `setChannelRemapping()`

## Requirements
- [x] RGB channel isolation (view R, G, or B only)
- [x] Alpha channel viewing
- [x] Luminance view
- [x] Channel remapping for multi-channel EXR
- [x] AOV/layer selection for EXR files
- [ ] Channel swap functionality (low priority)
- [x] Quick toggle shortcuts
- [x] Visual indication of active channel mode

## UI/UX Specification

### Current Implementation (View Tab)

**Location**: View tab context toolbar, in the Navigation group alongside Zoom control

**Control Type**: Dropdown button with icon

**Button Display**:
- Default (RGB): Shows "Ch" with eye icon and dropdown indicator
- Active channel: Shows short label (R, G, B, A, L) with channel color indicator
- Active state uses accent color highlighting

**Dropdown Menu**:
- Width: 120px minimum
- Items: RGB, Red, Green, Blue, Alpha, Grayscale
- Each item shows:
  - Color indicator dot (matching channel color)
  - Full label
  - Keyboard shortcut hint (N, R, G, B, A, L/Y)

**Channel Colors**:
- RGB: `var(--text-primary)` (neutral)
- Red: `#ff6b6b`
- Green: `#6bff6b`
- Blue: `#6b9fff`
- Alpha: `var(--text-muted)` (gray)
- Luminance: `var(--text-primary)` (neutral)

**Keyboard Shortcuts** (Shift + key):
- `Shift+N`: RGB (Normal)
- `Shift+R`: Red (Note: May conflict with rotation in some contexts)
- `Shift+G`: Green
- `Shift+B`: Blue
- `Shift+A`: Alpha
- `Shift+L`: Luminance/Grayscale
- `Shift+Y`: Luminance/Grayscale (alias for "graY")

**Accessibility**:
- A11Y focus handling applied to button
- Tooltip shows all available shortcuts
- ARIA roles on dropdown menu items

## Technical Notes

### Render Pipeline Order
Channel isolation is applied near the end of the render pipeline in `Viewer.ts`:
1. Draw source image with transform (rotation/flip)
2. Apply crop
3. Stereo mode
4. Lens distortion
5. 3D LUT
6. Color adjustments (exposure, contrast, etc.)
7. CDL
8. Color curves
9. Sharpen/blur filters
10. **Channel isolation** <-- Applied here
11. Paint annotations (on top layer)

### Algorithm

**Red/Green/Blue Isolation**:
```javascript
// For each pixel, extract single channel and display as grayscale
for (let i = 0; i < data.length; i += 4) {
  const channelValue = data[i + channelOffset]; // 0=R, 1=G, 2=B
  data[i] = channelValue;     // R
  data[i + 1] = channelValue; // G
  data[i + 2] = channelValue; // B
  // Alpha unchanged
}
```

**Alpha Channel**:
```javascript
// Show alpha as grayscale, make fully opaque to see values
for (let i = 0; i < data.length; i += 4) {
  const alpha = data[i + 3];
  data[i] = alpha;     // R
  data[i + 1] = alpha; // G
  data[i + 2] = alpha; // B
  data[i + 3] = 255;   // Make opaque
}
```

**Luminance (Rec.709)**:
```javascript
// Standard luminance calculation
for (let i = 0; i < data.length; i += 4) {
  const luma = Math.round(
    0.2126 * data[i] +     // R coefficient
    0.7152 * data[i + 1] + // G coefficient
    0.0722 * data[i + 2]   // B coefficient
  );
  data[i] = luma;
  data[i + 1] = luma;
  data[i + 2] = luma;
}
```

### State Management
- Channel mode stored in `Viewer.channelMode` property
- Exposed via `setChannelMode(mode)` and `getChannelMode()` methods
- State accessible in test helper via `ViewerState.channelMode`
- Persists across frame navigation and tab switches
- Reset via `resetChannels()` method returns to RGB

### Worker Processing
Channel isolation is supported in the `EffectProcessor` worker:
- State includes `channelMode` in `EffectProcessorState`
- `applyChannelIsolation()` called with worker state
- Maintains consistency between main thread and worker rendering

## E2E Test Cases

### Existing Tests

**File**: `/Users/lifeart/Repos/openrv-web/e2e/channel-select.spec.ts`

| Test ID | Description | Status |
|---------|-------------|--------|
| CS-001 | Default channel mode is RGB | Implemented |
| CS-002 | Clicking R button selects red channel | Implemented |
| CS-003 | Clicking G button selects green channel | Implemented |
| CS-004 | Clicking B button selects blue channel | Implemented |
| CS-005 | Clicking A button selects alpha channel | Implemented |
| CS-006 | Clicking Luma button selects luminance channel | Implemented |
| CS-007 | Clicking RGB button returns to all channels | Implemented |
| CS-010 | Shift+G selects green channel | Implemented |
| CS-011 | Shift+B selects blue channel | Implemented |
| CS-012 | Shift+A selects alpha channel | Implemented |
| CS-013 | Shift+L selects luminance channel | Implemented |
| CS-014 | Shift+N returns to RGB channel | Implemented |
| CS-015 | Shift+R reserved for rotation (not red) | Implemented |
| CS-020 | Red channel produces different image than RGB | Implemented |
| CS-021 | Green channel produces different image than RGB | Implemented |
| CS-022 | Blue channel produces different image than RGB | Implemented |
| CS-023 | Luminance produces different image than RGB | Implemented |
| CS-024 | Switching back to RGB restores original image | Implemented |
| CS-025 | Each channel produces unique grayscale image | Implemented |
| CS-030 | Channel mode persists when changing frames | Implemented |
| CS-031 | Channel mode persists when changing tabs | Implemented |

**File**: `/Users/lifeart/Repos/openrv-web/e2e/scope-cross-impact.spec.ts`

| Test ID | Description | Status |
|---------|-------------|--------|
| CROSS-020 | Histogram updates when channel is isolated | Implemented |
| CROSS-021 | Waveform updates when channel is isolated | Implemented |

**File**: `/Users/lifeart/Repos/openrv-web/e2e/prerender-buffer.spec.ts`

| Test ID | Description | Status |
|---------|-------------|--------|
| PRB-040 | Channel isolation works with prerender buffer | Implemented |

**File**: `/Users/lifeart/Repos/openrv-web/e2e/user-flows.spec.ts`

| Test ID | Description | Status |
|---------|-------------|--------|
| UF-020 | Review VFX composite with channel isolation | Implemented |

### Tests Needed for Future Features (Not Implemented)

| Test ID | Description | Priority |
|---------|-------------|----------|
| CH-040 | Channel remapping UI allows custom RGBA mapping | High |
| CH-041 | EXR AOV selector lists available layers | High |
| CH-042 | Selecting AOV displays correct render pass | High |
| CH-043 | Channel swap (RGB to BGR) functions correctly | Medium |
| CH-044 | Custom channel combinations persist across frames | Medium |
| CH-045 | Multi-channel EXR metadata parsed correctly | High |

## Unit Test Cases

### Existing Tests

**File**: `/Users/lifeart/Repos/openrv-web/src/ui/components/ChannelSelect.test.ts`

| Test ID | Description | Status |
|---------|-------------|--------|
| CH-001 | Starts with RGB channel selected | Implemented |
| CH-002 | Renders container element | Implemented |
| CH-003 | Creates dropdown options for all channels | Implemented |
| CH-004 | Changes channel and emits event | Implemented |
| CH-005 | Does not emit event if channel unchanged | Implemented |
| CH-006 | Sets all valid channels | Implemented |
| CH-007 | Cycles through all channels in order | Implemented |
| CH-008 | Wraps back to RGB after luminance | Implemented |
| CH-009 | Resets to RGB channel | Implemented |
| CH-010 | Emits event when resetting from non-RGB | Implemented |
| CH-011 | Shift+R selects red channel | Implemented |
| CH-012 | Shift+G selects green channel | Implemented |
| CH-013 | Shift+B selects blue channel | Implemented |
| CH-014 | Shift+A selects alpha channel | Implemented |
| CH-015 | Shift+L selects luminance channel | Implemented |
| CH-015b | Shift+Y selects luminance (alias) | Implemented |
| CH-016 | Shift+N selects RGB (normal) channel | Implemented |
| CH-017 | Handles lowercase keys | Implemented |
| CH-018 | Ignores keys without shift | Implemented |
| CH-019 | Ignores unknown keys | Implemented |
| CH-020 | Has labels for all channels | Implemented |
| CH-021 | Has shortcuts for channel selection | Implemented |
| CH-022 | Has Rec.709 luminance coefficients | Implemented |
| CH-023 | Coefficients sum to approximately 1 | Implemented |
| CH-024 | RGB mode leaves data unchanged | Implemented |
| CH-025 | Red channel shows R value as grayscale | Implemented |
| CH-026 | Green channel shows G value as grayscale | Implemented |
| CH-027 | Blue channel shows B value as grayscale | Implemented |
| CH-028 | Alpha channel shows A value as grayscale with full opacity | Implemented |
| CH-029 | Luminance calculates Rec.709 correctly | Implemented |
| CH-030 | Handles pure red pixel correctly for luminance | Implemented |
| CH-031 | Handles pure green pixel correctly for luminance | Implemented |
| CH-032 | Handles pure blue pixel correctly for luminance | Implemented |
| CH-033 | Processes multiple pixels correctly | Implemented |
| CH-034 | Returns red value for red channel | Implemented |
| CH-035 | Returns green value for green channel | Implemented |
| CH-036 | Returns blue value for blue channel | Implemented |
| CH-037 | Returns alpha value for alpha channel | Implemented |
| CH-038 | Returns luminance value for luminance channel | Implemented |
| CH-039 | Returns luminance for RGB channel (brightness) | Implemented |
| CH-050 | Only selected channel has accent styling in dropdown | Implemented |
| CH-051 | Changing channel via setChannel updates dropdown styling | Implemented |
| CH-052 | Clicking dropdown item selects channel and resets previous styling | Implemented |
| CH-053 | Rapid channel changes maintain correct visual state | Implemented |

### Tests Needed for Future Features (Not Implemented)

| Test ID | Description | Priority |
|---------|-------------|----------|
| CH-060 | Channel remapping applies custom mapping correctly | High |
| CH-061 | Channel swap BGR produces correct output | Medium |
| CH-062 | EXR layer metadata parsing extracts channel names | High |
| CH-063 | Custom channel combination serialization | Medium |
| CH-064 | Invalid channel mapping handled gracefully | Medium |

## References

- Component: `/Users/lifeart/Repos/openrv-web/src/ui/components/ChannelSelect.ts`
- Unit Tests: `/Users/lifeart/Repos/openrv-web/src/ui/components/ChannelSelect.test.ts`
- E2E Tests: `/Users/lifeart/Repos/openrv-web/e2e/channel-select.spec.ts`
- Viewer Integration: `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts`
- EffectProcessor: `/Users/lifeart/Repos/openrv-web/src/utils/EffectProcessor.ts`
- UI Guidelines: `/Users/lifeart/Repos/openrv-web/UI.md`
