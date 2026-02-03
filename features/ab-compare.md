# A/B Compare

## Original OpenRV Implementation
OpenRV provides multiple comparison modes for reviewing different versions of content:

**Composite Modes** (via -comp flag):
- **Over**: Layer compositing with alpha blending
- **Add**: Additive blending of sources
- **Difference**: Pixel-by-pixel difference comparison (highlights changes between versions)
- **Replace**: Simple replacement (default mode)
- **Tile**: Grid arrangement of sources

**Wipe Mode**:
The wipes feature enables comparing multiple images by dragging edges of stacked sources to reveal layers beneath. Users can:
- Grab corners to adjust diagonal wipes
- Grab edges for horizontal/vertical wipes
- Grab centers to move entire layers
- Create multi-way wipes with more than two sources

**Layout Modes** (via -layout flag):
- Packed: Automatic arrangement
- Row: Horizontal arrangement
- Column: Vertical arrangement
- Manual: User-positioned arrangement

All comparison modes support real-time interaction and can be combined with color correction for accurate version comparison.

## Status
- [ ] Not implemented
- [ ] Partially implemented
- [x] Fully implemented

## Implementation Summary

The A/B Compare feature is **fully implemented** in openrv-web with the following capabilities:

### Implemented Features

1. **A/B Source Switching**
   - Quick toggle between A and B sources via backtick (`) key
   - Direct selection of A or B source via dropdown buttons
   - Visual indicator showing current source (A/B badge in viewer)
   - Source availability detection (B disabled when only one source loaded)

2. **Wipe Mode** (Original vs Graded comparison on same source)
   - Horizontal wipe (Shift+W to cycle)
   - Vertical wipe
   - Draggable split line with visual feedback
   - Position-aware labels (Original/Graded) that hide at boundaries
   - Labels: "Original" (left/top) and "Graded" (right/bottom)

3. **Split Screen Mode** (A/B source side-by-side)
   - Horizontal split (A left, B right) - Shift+Alt+S to toggle
   - Vertical split (A top, B bottom)
   - Draggable divider with position clamping (5%-95%)
   - Distinct A/B labels with different colors
   - A/B indicator hidden during split screen (labels serve this purpose)

4. **Difference Matte** (Shift+D to toggle)
   - Pixel-by-pixel difference visualization
   - Grayscale mode (default)
   - Heatmap mode (color-coded differences)
   - Gain control (1x-10x) to amplify subtle differences

5. **Blend Modes** (for A/B comparison)
   - **Onion Skin**: Overlay B on A with adjustable opacity (0-100%)
   - **Flicker**: Alternate between A and B at configurable rate (1-30 Hz)
   - **Blend**: Mix A and B with adjustable ratio (0-100%)

### Key Implementation Files

| Component | File Path |
|-----------|-----------|
| CompareControl (main UI) | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts` |
| WipeControl (legacy) | `/Users/lifeart/Repos/openrv-web/src/ui/components/WipeControl.ts` |
| ViewerWipe (wipe rendering) | `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerWipe.ts` |
| ViewerSplitScreen | `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerSplitScreen.ts` |
| Viewer (rendering logic) | `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts` |

## Requirements Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| Side-by-side comparison view | Implemented | Split screen mode (splitscreen-h, splitscreen-v) |
| Wipe/split screen with draggable divider | Implemented | Both wipe and split screen have draggable dividers |
| Difference blending mode | Implemented | Difference matte with gain control |
| Over/under composite modes | Implemented | Onion skin mode for overlay comparison |
| Grid/tiled layout for multiple sources | Not implemented | OpenRV Tile mode not ported |
| Synchronized playback across compared sources | Implemented | Both A/B sources advance together in split screen |
| Quick swap between A and B sources | Implemented | Backtick key toggles, A/B buttons in dropdown |
| Pixel-level difference highlighting | Implemented | Heatmap mode in difference matte |
| Adjustable comparison region | Implemented | Draggable wipe/split position (0-1 range) |

## UI/UX Specification

### Compare Control Dropdown (View Tab)
Located in the View tab context toolbar, the Compare dropdown consolidates all comparison tools:

```
┌─────────────────────────────┐
│ Compare ▾                   │  <- Dropdown trigger button
├─────────────────────────────┤
│ WIPE MODE                   │  <- Section header
│ [○] Wipe Off                │
│ [○] H-Wipe                  │
│ [○] V-Wipe                  │
│ [○] Split H                 │
│ [○] Split V                 │
├─────────────────────────────┤
│ A/B COMPARE                 │  <- Section header
│ [A] [B] [⇄]                 │  <- A/B selection + toggle
├─────────────────────────────┤
│ DIFFERENCE MATTE            │  <- Section header
│ [Show Difference]           │  <- Toggle button
│ Gain: [====●====] 5.0x      │  <- Slider (1-10)
│ [Heatmap Mode]              │  <- Toggle button
├─────────────────────────────┤
│ BLEND MODES                 │  <- Section header
│ [Onion Skin]                │  <- Toggle + slider row
│   Opacity: [===●=] 50%      │
│ [Flicker]                   │  <- Toggle + slider row
│   Rate: [==●====] 4 Hz      │
│ [Blend]                     │  <- Toggle + slider row
│   A/B: [====●===] 50%       │
└─────────────────────────────┘
```

### Button States
- **Default**: `background: transparent; color: var(--text-muted)`
- **Hover**: `background: var(--bg-hover); color: var(--text-primary)`
- **Active**: `background: rgba(var(--accent-primary-rgb), 0.15); color: var(--accent-primary)`
- **Disabled**: `opacity: 0.5; cursor: not-allowed`

### Visual Indicators
- **A/B Indicator**: Shows "A" or "B" badge in viewer corner (hidden during split screen)
- **Split Line**: Accent color gradient with drop shadow, 4px width
- **Split Labels**: "A" (blue) on left/top, "B" (orange) on right/bottom

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| ` (backtick) | Toggle A/B source |
| Shift+W | Cycle wipe mode (off -> H -> V -> off) |
| Shift+Alt+S | Toggle split screen (off -> H -> V -> off) |
| Shift+D | Toggle difference matte |

## Technical Notes

### State Management
The `CompareControl` class manages a unified `CompareState` object:

```typescript
interface CompareState {
  wipeMode: 'off' | 'horizontal' | 'vertical' | 'splitscreen-h' | 'splitscreen-v';
  wipePosition: number;  // 0-1
  currentAB: 'A' | 'B';
  abAvailable: boolean;
  differenceMatte: DifferenceMatteState;
  blendMode: BlendModeState;
}
```

### Mutual Exclusivity
- Enabling **difference matte** disables wipe mode
- Enabling **blend mode** disables both wipe mode and difference matte
- Split screen and wipe share the same `wipeMode` field but render differently

### Render Pipeline Integration
Comparison modes are applied in the Viewer's `renderImage()` method:
1. Source image rendered with transforms
2. **If split screen**: Composite A and B side-by-side
3. **If wipe mode**: Show original vs graded with clip regions
4. **If difference matte**: Compute pixel differences with gain
5. **If blend mode**: Apply onion skin, flicker, or blend

### Flicker Mode Implementation
Uses `setInterval` to alternate `flickerFrame` (0 or 1), triggering re-renders at the configured rate. The interval is properly cleaned up when mode changes or component disposes.

## E2E Test Cases

### Existing Tests

| Test ID | File | Description |
|---------|------|-------------|
| AB-E001 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | View tab shows Compare control button |
| AB-E002 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | A button visible in dropdown |
| AB-E003 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | B button visible in dropdown |
| AB-E004 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | Toggle button visible with swap icon |
| AB-E005 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | A button highlighted with single source |
| AB-E006 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | B button disabled with single source |
| AB-E007 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | Toggle button disabled with single source |
| AB-E008-E010 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | Button tooltips |
| AB-E020-E021 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | Indicator display |
| AB-E030-E031 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | Keyboard shortcuts (single source) |
| AB-E040-E043 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | Button interactions |
| AB-E050-E052 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | Visual layout |
| AB-E060 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | Screenshot comparison |
| WIPE-E001-E012 | `/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts` | Wipe label tests |

### Split Screen Tests

| Test ID | File | Description |
|---------|------|-------------|
| SPLIT-E001 | `/Users/lifeart/Repos/openrv-web/e2e/split-screen.spec.ts` | Keyboard toggle (Shift+Alt+S) |
| SPLIT-E002 | `/Users/lifeart/Repos/openrv-web/e2e/split-screen.spec.ts` | Default position is 0.5 |
| SPLIT-E003-E004 | `/Users/lifeart/Repos/openrv-web/e2e/split-screen.spec.ts` | Visual changes |
| SPLIT-E005-E007 | `/Users/lifeart/Repos/openrv-web/e2e/split-screen.spec.ts` | UI elements visibility |
| SPLIT-E008a-E008e | `/Users/lifeart/Repos/openrv-web/e2e/split-screen.spec.ts` | Dragging interactions |
| SPLIT-E009-E010 | `/Users/lifeart/Repos/openrv-web/e2e/split-screen.spec.ts` | State persistence |
| SPLIT-E011 | `/Users/lifeart/Repos/openrv-web/e2e/split-screen.spec.ts` | Integration with A/B |
| SPLIT-E020-E027 | `/Users/lifeart/Repos/openrv-web/e2e/split-screen.spec.ts` | Frame update tests |
| SPLIT-E028-E031 | `/Users/lifeart/Repos/openrv-web/e2e/split-screen.spec.ts` | Sequential video load tests |
| SPLIT-E032-E036 | `/Users/lifeart/Repos/openrv-web/e2e/split-screen.spec.ts` | A/B indicator visibility |
| SPLIT-E040-E045 | `/Users/lifeart/Repos/openrv-web/e2e/split-screen.spec.ts` | Playback verification |

### Difference Matte Tests

| Test ID | File | Description |
|---------|------|-------------|
| DIFF-E001 | `/Users/lifeart/Repos/openrv-web/e2e/difference-matte.spec.ts` | Keyboard toggle (Shift+D) |
| DIFF-E002-E003 | `/Users/lifeart/Repos/openrv-web/e2e/difference-matte.spec.ts` | Default values |
| DIFF-E004-E005 | `/Users/lifeart/Repos/openrv-web/e2e/difference-matte.spec.ts` | Visual changes |
| DIFF-E006-E007 | `/Users/lifeart/Repos/openrv-web/e2e/difference-matte.spec.ts` | Gain control |
| DIFF-E008-E009 | `/Users/lifeart/Repos/openrv-web/e2e/difference-matte.spec.ts` | Heatmap mode |
| DIFF-E010 | `/Users/lifeart/Repos/openrv-web/e2e/difference-matte.spec.ts` | Single source behavior |
| DIFF-E011-E012 | `/Users/lifeart/Repos/openrv-web/e2e/difference-matte.spec.ts` | State persistence |
| DIFF-E013-E014 | `/Users/lifeart/Repos/openrv-web/e2e/difference-matte.spec.ts` | A/B integration |

## Unit Test Cases

### Existing Tests

| Test ID | File | Description |
|---------|------|-------------|
| CMP-U001-U003 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | Initialization |
| CMP-U010-U014 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | Wipe mode |
| CMP-U020-U024 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | Wipe position |
| CMP-U030-U039 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | A/B source |
| CMP-U040-U041 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | A/B availability |
| CMP-U050-U058 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | Difference matte |
| CMP-U060-U066 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | State interdependencies |
| CMP-U070-U074 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | isActive logic |
| CMP-U080-U083 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | getWipeState compatibility |
| CMP-U090-U091 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | getDifferenceMatteState |
| CMP-U100-U101 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | getState |
| CMP-U110-U117 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | Event emissions |
| CMP-U120-U121 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | Dispose |
| CMP-U130-U136 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | Blend modes |
| CMP-U140-U145 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | Onion opacity |
| CMP-U150-U156 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | Flicker rate |
| CMP-U160-U164 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | Blend ratio |
| CMP-U170-U175 | `/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.test.ts` | Blend mode interdependencies |
| WPE-001-U039 | `/Users/lifeart/Repos/openrv-web/src/ui/components/WipeControl.test.ts` | WipeControl (legacy) |

### Test Coverage Summary

- **CompareControl.test.ts**: 117 test cases covering all public methods and events
- **WipeControl.test.ts**: 39 test cases for legacy wipe control
- **ab-compare.spec.ts**: 32 E2E tests for UI elements and interactions
- **split-screen.spec.ts**: 45 E2E tests for split screen functionality
- **difference-matte.spec.ts**: 14 E2E tests for difference matte functionality

## User Flow Verification

### Flow 1: Compare two versions of same content
1. User loads video file A
2. User applies color grading adjustments
3. User presses Shift+W to enable horizontal wipe
4. User drags wipe line to compare original vs graded
5. Wipe labels show "Original" (left) and "Graded" (right)

**Status**: Working correctly

### Flow 2: Compare two different source files
1. User loads video file A (source A)
2. User loads video file B (source B)
3. A/B buttons become enabled in Compare dropdown
4. User presses backtick to toggle between A and B
5. User presses Shift+Alt+S for split screen comparison
6. Both sources visible side-by-side with A/B labels

**Status**: Working correctly

### Flow 3: Spot pixel differences between renders
1. User loads two similar video files
2. User presses Shift+D to enable difference matte
3. User adjusts gain slider to amplify subtle differences
4. User enables heatmap mode for color-coded visualization
5. Areas with differences highlighted in the view

**Status**: Working correctly

### Flow 4: Flicker comparison for change detection
1. User loads two video files
2. User opens Compare dropdown
3. User clicks "Flicker" blend mode
4. User adjusts rate slider to 4 Hz
5. View alternates between A and B at 4 times per second
6. Changes become obvious through rapid comparison

**Status**: Working correctly

## Not Implemented (from OpenRV)

1. **Tile/Grid Layout**: Multiple sources in grid arrangement
2. **Diagonal Wipe**: Corner-based wipe for diagonal comparison
3. **Multi-way Wipe**: More than two sources in wipe comparison
4. **Add Composite**: Additive blending of sources
5. **Manual Layout**: User-positioned arrangement of sources

These features may be considered for future implementation if needed.
