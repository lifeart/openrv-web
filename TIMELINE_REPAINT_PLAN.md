# Implementation Plan: Timeline Repaint Thrashing (Item 1)

**Priority Score: 20/25 (Highest)** | Risk: LOW | Effort: M

## Summary

The Timeline canvas has 20 direct `draw()` call sites. During playback, `frameChanged` fires every frame, and `getComputedStyle()` is called on every draw. Thumbnails use expensive `shadowBlur` on each of 30 slots.

## Implementation Order

### Task 1.1: rAF Draw Coalescing (HIGH IMPACT)
**Files:** `src/ui/components/Timeline.ts`

- Add fields: `private drawScheduled = false`, `private rafId = 0`
- Add method `scheduleDraw()`: sets dirty flag, calls `requestAnimationFrame` once
- Replace all 17 event-driven `this.draw()` calls with `this.scheduleDraw()`
  - Lines: 70, 81, 85, 134, 141, 145, 150, 152, 153, 154, 165, 166, 167, 177, 185, 208, 268, 290
- Keep `draw()` in `render()`'s existing rAF callback (line 385)
- `dispose()`: cancel pending rAF via `cancelAnimationFrame(this.rafId)`
- rAF callback: check `this.disposed` before calling `draw()`

**Tests:**
- TML-COAL-001: 5x `scheduleDraw()` → exactly 1 `draw()`
- TML-COAL-002: `dispose()` cancels pending draw
- TML-COAL-003: `scheduleDraw()` after dispose is no-op
- TML-COAL-004: Multiple session events in same tick → 1 draw

### Task 1.2: Cache CSS Colors via ThemeManager (MEDIUM IMPACT)
**Files:** `src/ui/components/Timeline.ts`

- Add field: `private cachedColors: ReturnType<typeof this.getColors> | null = null`
- Rewrite `getColors()`: if cached, return cache; else compute from `getThemeManager().getColors()`, cache, return
- `themeChanged` handler: `this.cachedColors = null; this.scheduleDraw()`
- **Key insight:** ThemeManager already provides `getColors()` returning pre-computed values — no `getComputedStyle` needed

**Tests:**
- TML-COLOR-001: `getColors()` returns correct ThemeManager values
- TML-COLOR-002: Cached on second call (same reference)
- TML-COLOR-003: `themeChanged` invalidates cache
- TML-COLOR-004: `getComputedStyle` never called during `draw()`

### Task 1.3: Remove Transparent Hit-Area fillRect (TRIVIAL)
**Files:** `src/ui/components/Timeline.ts`

- Delete lines 582-583 (`rgba(0,0,0,0)` fillRect for playhead hit area)
- Hit testing uses coordinate math in `onPointerDown`, not canvas hit regions

### Task 1.4: Remove Thumbnail Shadow Blur (MEDIUM IMPACT)
**Files:** `src/ui/components/ThumbnailManager.ts`

- In `drawThumbnails()`, remove `ctx.save()`, `ctx.shadowColor`, `ctx.shadowBlur`, `ctx.shadowOffsetY`, `ctx.restore()`
- Keep border stroke (`ctx.strokeRect`)
- Each eliminated shadow = Gaussian blur GPU operation per thumbnail (up to 30/frame)

**Tests:**
- TM-PERF-001: `drawThumbnails` does not call `ctx.save` or set `shadowBlur`
- TM-PERF-002: Still draws images and border strokes

### Task 1.5: Update Existing Tests for Deferred Drawing
**Files:** `src/ui/components/Timeline.test.ts`

- Tests checking `drawCount` synchronously after event emission need rAF flush
- Mock `requestAnimationFrame` to execute synchronously in test setup

### Phase 2 (Deferred): Waveform Bitmap Cache
- Cache waveform render to OffscreenCanvas, invalidate on data/zoom/dimension change
- Eliminates up to 2000 `fillRect()` calls per frame

### Phase 3 (Deferred): DOM Playhead Layer
- Extract playhead to absolute-positioned DOM element with CSS `transform: translateX()`
- During playback, only update CSS transform (compositor handles, zero canvas repaints)

## Rollback
Each task is independently revertable. No API changes.
