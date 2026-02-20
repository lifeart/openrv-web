# Implementation Plan: Viewer Compositing Overhead (Item 2)

**Priority Score: 15/25** | Risk: LOW-MEDIUM | Effort: M

## Summary

The Viewer stacks up to 14 canvas/div layers. Watermark redraws every frame. Paint canvas clears every frame. Multiple `alpha:true` overlays composite even when empty.

## Implementation Order

### Task 2.1: Dirty-Flag Watermark Rendering (HIGH IMPACT)
**Files:** `src/ui/components/Viewer.ts`

- Add field: `private watermarkDirty = true`
- In `renderWatermarkOverlayCanvas()`: skip `clearRect` + render if `!watermarkDirty`; set `watermarkDirty = false` after render
- Set `watermarkDirty = true` when: watermark image changes, position changes, opacity changes, canvas resizes
- Listen to WatermarkOverlay `stateChanged` event to set dirty

**Tests:**
- VWR-WM-001: Watermark not redrawn when nothing changed
- VWR-WM-002: Watermark redrawn after state change
- VWR-WM-003: Watermark redrawn after canvas resize

### Task 2.2: Skip Paint Canvas Clear When Empty (MEDIUM IMPACT)
**Files:** `src/ui/components/Viewer.ts`

- In `renderPaint()` (lines 2117-2152): if no annotations AND no active paint tool, skip `clearRect` entirely
- Track `paintDirty` flag, set true when strokes added/removed/modified

**Tests:**
- VWR-PT-001: Paint canvas not cleared when no annotations
- VWR-PT-002: Paint canvas cleared when annotations exist

### Task 2.3: `display:none` for Inactive Watermark Canvas
**Files:** `src/ui/components/Viewer.ts`

- When watermark is disabled: `watermarkCanvas.style.display = 'none'`
- When enabled: `watermarkCanvas.style.display = ''`
- Canvas with `display:none` excluded from compositor entirely

### Task 2.4: `display:none` for Inactive Paint Canvas
**Files:** `src/ui/components/Viewer.ts`

- When no annotations and no active paint tool: `paintCanvas.style.display = 'none'`
- On first stroke/annotation: `paintCanvas.style.display = ''`

### Task 2.5: `display:none` for Inactive CanvasOverlay Subclasses
**Files:** `src/ui/components/CanvasOverlay.ts`, subclass files

- In base `CanvasOverlay.updateVisibility()`: set `canvas.style.display = visible ? '' : 'none'`
- Affects: SafeAreasOverlay, MatteOverlay, SpotlightOverlay, BugOverlay, EXRWindowOverlay, ReferenceOverlay

### Task 2.6: Lazy-Create DOM Overlay Canvases (LOW PRIORITY)
**Files:** `src/ui/components/OverlayManager.ts`

- Convert overlay fields to nullable, create on first access via lazy getters
- DOM overlays have explicit z-index → append order doesn't matter
- `updateDimensions()`: use optional chaining for uncreated overlays

## Impact

In common case (no watermark, no annotations, no overlays): compositing goes from ~8 alpha canvases/frame to ~1.

## Rollback
Each task independent. Remove dirty flags / display toggling to revert.
