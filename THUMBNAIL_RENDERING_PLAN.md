# Implementation Plan: Thumbnail Rendering Efficiency (Item 6)

**Priority Score: 6/25** | Risk: LOW | Effort: S

## Summary

ThumbnailManager draws thumbnails twice (OffscreenCanvas → HTMLCanvasElement copy) and creates new canvas elements without pooling.

## Implementation Order

### Task 6.1: Store OffscreenCanvas Directly (Eliminate Double Draw)
**Files:** `src/ui/components/ThumbnailManager.ts`

- In `loadThumbnail()` (lines 284-313): when OffscreenCanvas available, create one, draw source image, store directly in cache
- Remove the intermediate HTMLCanvasElement copy (lines 302-313)
- Remove the initial unused `document.createElement('canvas')` at line 245 for OffscreenCanvas path
- `addToCache()` signature: accept `HTMLCanvasElement | OffscreenCanvas`
- `drawThumbnails()` already works — `ctx.drawImage()` accepts OffscreenCanvas per DOM spec

### Task 6.2: Use `peek()` in `drawThumbnails`
**Files:** `src/ui/components/ThumbnailManager.ts`

- Change `getThumbnail()` (line 344) from `this.cache.get(key)` to `this.cache.peek(key)`
- `peek()` reads without refreshing LRU order — saves Map delete+re-insert on hot draw path
- LRU refresh already happens in `loadThumbnails()` via `cache.get()` during loading pass

### Task 6.3: Canvas Element Pooling
**Files:** `src/ui/components/ThumbnailManager.ts`

- Add `private canvasPool: (HTMLCanvasElement | OffscreenCanvas)[] = []`
- `MAX_POOL_SIZE = 30`
- Register `onEvict` callback on LRU cache constructor → `returnToPool(canvas)`
- Add `acquireCanvas(width, height)`: pop from pool, resize, or create new
- Update `loadThumbnail()` to use `acquireCanvas()`
- `clear()`/`dispose()`: drain pool (`this.canvasPool.length = 0`)

**Note:** Setting `canvas.width = N` resets bitmap per spec — no stale pixel risk.

## Tests
| ID | Test | Assertion |
|----|------|-----------|
| THUMB-001 | OffscreenCanvas stored directly | `document.createElement('canvas')` NOT called |
| THUMB-002 | drawImage called once per thumbnail | No double-draw |
| THUMB-003 | HTMLCanvasElement path still works without OffscreenCanvas | Fallback works |
| THUMB-004 | drawThumbnails works with OffscreenCanvas entries | `ctx.drawImage` called |
| THUMB-005 | getThumbnail uses peek (no LRU refresh) | Spy on `cache.peek` |
| THUMB-POOL-001 | Evicted canvas returned to pool | Pool size = 1 after eviction |
| THUMB-POOL-002 | Pooled canvas reused on next load | Constructor not called |
| THUMB-POOL-003 | Pool bounded at MAX_POOL_SIZE | No overflow |
| THUMB-POOL-004 | `clear()` drains pool | Pool empty |
| THUMB-POOL-005 | Pooled canvas resized before reuse | Correct dimensions |
