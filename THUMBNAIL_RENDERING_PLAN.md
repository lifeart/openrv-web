# Implementation Plan: Thumbnail Rendering Efficiency (Item 6)

**Priority Score: 6/25** | Risk: LOW | Effort: S

## Summary

ThumbnailManager (`src/ui/components/ThumbnailManager.ts`) has three inefficiencies:

1. **Double draw**: In `loadThumbnail()` (lines 283-313), when `OffscreenCanvas` is available, the code draws the source image onto an OffscreenCanvas (line 298), then immediately copies it to a *new* `document.createElement('canvas')` HTMLCanvasElement (lines 302-310). The intermediate HTMLCanvasElement copy is unnecessary because `CanvasRenderingContext2D.drawImage()` accepts `OffscreenCanvas` as a `CanvasImageSource` per the DOM spec, and the cache type already allows it (`LRUCache<string, HTMLCanvasElement | OffscreenCanvas>`, line 35).

2. **Unnecessary LRU churn on render**: `drawThumbnails()` (line 352) calls `getThumbnail()` (line 344), which uses `this.cache.get(key)` -- performing a Map delete+re-insert on every frame, for every visible thumbnail (up to 30). This happens on the hot `draw()` path (called on every `frameChanged` event during playback, via `Timeline.draw()` at line 443 of `Timeline.ts`). The LRU cache already has a `peek()` method (line 30 of `LRUCache.ts`) that reads without reordering.

3. **No canvas reuse**: Every `loadThumbnail()` call creates a new canvas via `document.createElement('canvas')` (line 245) or `new OffscreenCanvas()` (line 288). When the LRU cache evicts a thumbnail, the canvas is simply GC'd. The codebase already has a canvas pool pattern in `GhostFrameManager` (`src/ui/components/GhostFrameManager.ts`, lines 16-121) that can be referenced.

## Dependency Graph

```
Task 6.1 (Store OffscreenCanvas Directly)
   |
   v
Task 6.2 (Use peek() in drawThumbnails)  -- independent, can run in parallel with 6.1
   |
   v
Task 6.3 (Canvas Element Pooling) -- depends on 6.1 (needs to know which canvas type to pool)
```

---

## Implementation Order

### Task 6.1: Store OffscreenCanvas Directly (Eliminate Double Draw)
**Complexity:** small
**Files:** `src/ui/components/ThumbnailManager.ts`
**Dependencies:** none

#### Current Code Analysis

In `loadThumbnail()` (lines 232-324), the current flow is:

1. **Line 245**: A `document.createElement('canvas')` HTMLCanvasElement is created unconditionally, even when `OffscreenCanvas` is available. This canvas and its context (line 248) are unused in the OffscreenCanvas path.
2. **Lines 287-289**: When `OffscreenCanvas` is available, a *new* `OffscreenCanvas` is created and the source image is drawn onto it (line 298).
3. **Lines 302-310**: The OffscreenCanvas content is immediately copied to *another* `document.createElement('canvas')` via `regularCtx.drawImage(targetCanvas, 0, 0)`. This second HTMLCanvasElement is what gets stored in the cache.
4. **Lines 311-312**: In the non-OffscreenCanvas fallback, the initial HTMLCanvasElement from line 245 is stored directly.

The `addToCache()` method (line 336) currently accepts only `HTMLCanvasElement`, but the cache itself already has the union type `HTMLCanvasElement | OffscreenCanvas` (line 35). The `getThumbnail()` return type (line 344) already returns `HTMLCanvasElement | OffscreenCanvas | null`.

The call site in `drawThumbnails()` (lines 352-378) uses `ctx.drawImage(thumbnail, ...)` (line 362). The `CanvasRenderingContext2D.drawImage()` method accepts any `CanvasImageSource`, which includes `OffscreenCanvas` in the TypeScript DOM lib (tsconfig targets ES2022 + DOM, line 6 of `tsconfig.json`).

#### Implementation Steps

1. **Update `addToCache()` signature** (line 336): Change parameter type from `HTMLCanvasElement` to `HTMLCanvasElement | OffscreenCanvas`.

   ```typescript
   // Before (line 336):
   private addToCache(frame: number, canvas: HTMLCanvasElement): void {
   // After:
   private addToCache(frame: number, canvas: HTMLCanvasElement | OffscreenCanvas): void {
   ```

2. **Simplify the OffscreenCanvas path** (lines 301-313): Remove the copy-to-HTMLCanvasElement block. Store the OffscreenCanvas directly.

   ```typescript
   // Before (lines 300-313):
   // Add to cache with LRU eviction
   // For OffscreenCanvas, we need to convert to regular canvas for storage
   if (typeof OffscreenCanvas !== 'undefined' && targetCanvas instanceof OffscreenCanvas) {
     const regularCanvas = document.createElement('canvas');
     regularCanvas.width = thumbWidth;
     regularCanvas.height = thumbHeight;
     const regularCtx = regularCanvas.getContext('2d');
     if (regularCtx) {
       regularCtx.drawImage(targetCanvas, 0, 0);
       this.addToCache(frame, regularCanvas);
     }
   } else {
     this.addToCache(frame, targetCanvas as HTMLCanvasElement);
   }

   // After:
   this.addToCache(frame, targetCanvas);
   ```

3. **Remove the unconditionally-created HTMLCanvasElement** (lines 245-249): In the OffscreenCanvas path, this canvas+context pair is never used. Move the `document.createElement('canvas')` into the `else` branch (the fallback path, lines 290-293).

   ```typescript
   // Before (lines 244-293):
   const canvas = document.createElement('canvas');
   canvas.width = thumbWidth;
   canvas.height = thumbHeight;
   const ctx = canvas.getContext('2d');
   if (!ctx) return;
   // ... source element resolution ...
   let targetCanvas: HTMLCanvasElement | OffscreenCanvas;
   let targetCtx: ...;
   if (typeof OffscreenCanvas !== 'undefined') {
     targetCanvas = new OffscreenCanvas(thumbWidth, thumbHeight);
     targetCtx = targetCanvas.getContext('2d');
   } else {
     targetCanvas = canvas;
     targetCtx = ctx;
   }

   // After:
   // ... source element resolution (unchanged) ...
   let targetCanvas: HTMLCanvasElement | OffscreenCanvas;
   let targetCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
   if (typeof OffscreenCanvas !== 'undefined') {
     targetCanvas = new OffscreenCanvas(thumbWidth, thumbHeight);
     targetCtx = targetCanvas.getContext('2d');
   } else {
     const canvas = document.createElement('canvas');
     canvas.width = thumbWidth;
     canvas.height = thumbHeight;
     targetCanvas = canvas;
     targetCtx = canvas.getContext('2d');
   }
   ```

   Note: The `ctx` variable was also used to early-return if `getContext('2d')` fails (line 249). After refactoring, the equivalent guard is the existing `if (!targetCtx) return;` on line 295.

#### Edge Cases & Risks

- **jsdom test environment**: jsdom does not define `OffscreenCanvas`. Tests will exercise the HTMLCanvasElement fallback path by default. To test the OffscreenCanvas path, mock `globalThis.OffscreenCanvas` in the test. The existing test setup (`test/setup.ts`) already mocks `HTMLCanvasElement.getContext` to return `MockCanvasRenderingContext2D`. An `OffscreenCanvas` mock needs a similar `getContext('2d')` mock.
- **Safari <16.4**: `OffscreenCanvas` is not available. The fallback path must remain functional. No change needed since the `typeof OffscreenCanvas !== 'undefined'` guard is preserved.
- **TypeScript**: `CanvasRenderingContext2D.drawImage()` accepts `CanvasImageSource` which includes `OffscreenCanvas` in the DOM lib. No type issues expected with tsconfig's `"lib": ["ES2022", "DOM", "DOM.Iterable"]`.
- **Potential regression in `isFullyLoaded()`**: This method (line 383) calls `getThumbnail()` which calls `cache.get()`. After Task 6.2 changes it to `peek()`, there is no regression risk. But even before that change, the OffscreenCanvas values stored in the cache will still be truthy, so `isFullyLoaded()` will work correctly.

#### Test Specifications
**File:** `src/ui/components/ThumbnailManager.test.ts`

```typescript
describe('Task 6.1: Store OffscreenCanvas directly', () => {
  it('THUMB-001: OffscreenCanvas path does not create intermediate HTMLCanvasElement', async () => {
    // Setup: Mock OffscreenCanvas globally
    const origOffscreen = globalThis.OffscreenCanvas;
    const mockGetContext = vi.fn(() => ({
      drawImage: vi.fn(),
    }));
    globalThis.OffscreenCanvas = vi.fn((w: number, h: number) => ({
      width: w,
      height: h,
      getContext: mockGetContext,
    })) as any;

    // Track document.createElement calls
    const createElementSpy = vi.spyOn(document, 'createElement');

    // Setup source and slots
    stub.currentSource = {
      name: 'test.exr', type: 'sequence', width: 1920, height: 1080, duration: 10,
    } as MediaSource;
    const mockImg = document.createElement('canvas');
    stub.getSequenceFrameImage.mockResolvedValue(mockImg);

    manager.calculateSlots(60, 35, 500, 24, 10, 1920, 1080);
    await manager.loadThumbnails();

    // Assertion: createElement('canvas') should NOT have been called
    // for the OffscreenCanvas-backed thumbnails (only the source mock uses it)
    const canvasCreations = createElementSpy.mock.calls.filter(
      ([tag]) => tag === 'canvas'
    );
    // The only canvas creation should be our mockImg setup, not inside loadThumbnail
    expect(canvasCreations.length).toBeLessThanOrEqual(1);

    // Cleanup
    createElementSpy.mockRestore();
    globalThis.OffscreenCanvas = origOffscreen;
  });

  it('THUMB-002: drawImage called exactly once per thumbnail (no double-draw)', async () => {
    // Setup: Mock OffscreenCanvas
    const origOffscreen = globalThis.OffscreenCanvas;
    const drawImageSpy = vi.fn();
    const mockGetContext = vi.fn(() => ({
      drawImage: drawImageSpy,
    }));
    globalThis.OffscreenCanvas = vi.fn((w: number, h: number) => ({
      width: w, height: h,
      getContext: mockGetContext,
    })) as any;

    stub.currentSource = {
      name: 'test.exr', type: 'image', width: 1920, height: 1080, duration: 2,
      element: document.createElement('canvas'),
    } as unknown as MediaSource;

    manager.calculateSlots(60, 35, 500, 24, 2, 1920, 1080);
    await manager.loadThumbnails();

    const slots = manager.getSlots();
    // Each thumbnail should have exactly one drawImage call, not two
    expect(drawImageSpy).toHaveBeenCalledTimes(slots.length);

    globalThis.OffscreenCanvas = origOffscreen;
  });

  it('THUMB-003: HTMLCanvasElement fallback still works without OffscreenCanvas', async () => {
    // Setup: Ensure OffscreenCanvas is undefined (jsdom default)
    const origOffscreen = globalThis.OffscreenCanvas;
    delete (globalThis as any).OffscreenCanvas;

    stub.currentSource = {
      name: 'test.exr', type: 'image', width: 1920, height: 1080, duration: 3,
      element: document.createElement('canvas'),
    } as unknown as MediaSource;

    manager.calculateSlots(60, 35, 500, 24, 3, 1920, 1080);
    await manager.loadThumbnails();

    // At least one thumbnail should be cached
    const slot = manager.getSlots()[0];
    if (slot) {
      const thumb = manager.getThumbnail(slot.frame);
      expect(thumb).not.toBeNull();
    }

    globalThis.OffscreenCanvas = origOffscreen;
  });

  it('THUMB-004: drawThumbnails works with OffscreenCanvas cache entries', async () => {
    // Setup: Populate cache with OffscreenCanvas entries (via mock)
    const origOffscreen = globalThis.OffscreenCanvas;
    const drawImageSpy = vi.fn();
    globalThis.OffscreenCanvas = vi.fn((w: number, h: number) => ({
      width: w, height: h,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
    })) as any;

    stub.currentSource = {
      name: 'test.exr', type: 'image', width: 1920, height: 1080, duration: 3,
      element: document.createElement('canvas'),
    } as unknown as MediaSource;

    manager.calculateSlots(60, 35, 500, 24, 3, 1920, 1080);
    await manager.loadThumbnails();

    // Create a mock rendering context for drawThumbnails
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: drawImageSpy,
      strokeRect: vi.fn(),
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetY: 0,
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    manager.drawThumbnails(mockCtx);

    // drawImage should be called for each cached thumbnail
    expect(drawImageSpy.mock.calls.length).toBeGreaterThan(0);

    globalThis.OffscreenCanvas = origOffscreen;
  });
});
```

---

### Task 6.2: Use `peek()` in `drawThumbnails`
**Complexity:** trivial
**Files:** `src/ui/components/ThumbnailManager.ts`
**Dependencies:** none (can run in parallel with Task 6.1)

#### Current Code Analysis

`getThumbnail()` at line 344-347:
```typescript
getThumbnail(frame: number): HTMLCanvasElement | OffscreenCanvas | null {
    const key = this.getCacheKey(frame);
    return this.cache.get(key) ?? null;
}
```

This calls `this.cache.get(key)`, which (per `LRUCache.ts` lines 16-23) performs:
1. `this.map.has(key)` -- Map lookup
2. `this.map.get(key)` -- Map lookup
3. `this.map.delete(key)` -- Map delete (rebalance)
4. `this.map.set(key, value)` -- Map insert (rebalance)

This runs for **every slot** (up to 30) on **every draw()** call. During playback, `draw()` fires on every `frameChanged` event (24-60fps). That is 720-1800 Map delete+re-insert operations per second -- all unnecessary because the LRU ordering is already maintained by `loadThumbnails()` which calls `this.cache.get(cacheKey)` at line 204.

The `isFullyLoaded()` method (lines 383-390) also calls `getThumbnail()`, but this is not on the hot path (it is only checked after load operations, not per-frame).

The `LRUCache.peek()` method (lines 30-32 of `LRUCache.ts`) does only `this.map.get(key)` -- a single O(1) lookup with no reordering.

#### Implementation Steps

1. **Change `getThumbnail()` to use `peek()`** (line 346):

   ```typescript
   // Before (line 346):
   return this.cache.get(key) ?? null;
   // After:
   return this.cache.peek(key) ?? null;
   ```

   That is the entire change. One word replacement.

2. **Verify `loadThumbnails()` still refreshes LRU order**: At line 202-204, the existing code does:
   ```typescript
   if (this.cache.has(cacheKey)) {
     this.cache.get(cacheKey);  // refreshes LRU position
     continue;
   }
   ```
   This ensures that thumbnails that are still in the visible slot set get their LRU position refreshed during each `loadThumbnails()` call. No change needed here.

#### Edge Cases & Risks

- **`isFullyLoaded()` correctness**: This method calls `getThumbnail()` which will now use `peek()`. Since `peek()` still returns the correct value (just without side effects), `isFullyLoaded()` remains correct. It does not depend on LRU ordering.
- **LRU staleness risk**: If `drawThumbnails()` no longer refreshes LRU order, could a visible thumbnail be evicted? No -- the only way new items enter the cache is via `loadThumbnail() -> addToCache() -> cache.set()`. Each call to `loadThumbnails()` (lines 177-227) first refreshes LRU order for all cached slots (line 204) before adding new entries. The cache capacity is 150 (line 35) and max slots is 30 (line 137), so visible thumbnails will always be in the most-recently-accessed portion of the LRU.
- **No behavioral change for callers**: `getThumbnail()` still returns the same values. The only difference is side-effect-free reads.

#### Test Specifications
**File:** `src/ui/components/ThumbnailManager.test.ts`

```typescript
describe('Task 6.2: Use peek() in drawThumbnails', () => {
  it('THUMB-005: getThumbnail uses peek (no LRU reorder)', () => {
    // Setup: Access the private cache to install a spy
    const cache = (manager as any).cache;
    const peekSpy = vi.spyOn(cache, 'peek');
    const getSpy = vi.spyOn(cache, 'get');

    // Set a known sourceId so getCacheKey works
    (manager as any).sourceId = 'test-1920x1080';

    // Populate cache directly for testing
    cache.set('test-1920x1080-1', document.createElement('canvas'));

    // Action
    manager.getThumbnail(1);

    // Assertion: peek was called, get was NOT called
    expect(peekSpy).toHaveBeenCalledWith('test-1920x1080-1');
    expect(getSpy).not.toHaveBeenCalled();

    peekSpy.mockRestore();
    getSpy.mockRestore();
  });

  it('THUMB-005b: drawThumbnails does not refresh LRU order', () => {
    // Setup: Populate cache and slots
    const cache = (manager as any).cache;
    (manager as any).sourceId = 'test-1920x1080';

    // Create slots manually
    manager.calculateSlots(60, 35, 500, 24, 10, 1920, 1080);
    const slots = manager.getSlots();

    // Populate cache for each slot
    for (const slot of slots) {
      const key = `test-1920x1080-${slot.frame}`;
      cache.set(key, document.createElement('canvas'));
    }

    // Spy on cache.get to ensure it is NOT called during draw
    const getSpy = vi.spyOn(cache, 'get');

    const mockCtx = {
      save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(),
      strokeRect: vi.fn(), shadowColor: '', shadowBlur: 0,
      shadowOffsetY: 0, strokeStyle: '', lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    // Action
    manager.drawThumbnails(mockCtx);

    // Assertion: cache.get was never called (only peek)
    expect(getSpy).not.toHaveBeenCalled();

    getSpy.mockRestore();
  });
});
```

---

### Task 6.3: Canvas Element Pooling
**Complexity:** medium
**Files:** `src/ui/components/ThumbnailManager.ts`
**Dependencies:** Task 6.1 (must know that OffscreenCanvas is stored directly, so the pool must handle both canvas types)

#### Current Code Analysis

Currently, every `loadThumbnail()` call creates a new canvas:
- **Line 245**: `document.createElement('canvas')` (HTMLCanvasElement path)
- **Line 288**: `new OffscreenCanvas(thumbWidth, thumbHeight)` (OffscreenCanvas path)

When the LRU cache evicts an entry, the canvas is simply dropped with no `onEvict` callback registered (line 35: `new LRUCache<string, HTMLCanvasElement | OffscreenCanvas>(150)` -- no second argument).

The `GhostFrameManager` (`src/ui/components/GhostFrameManager.ts`) provides a reference implementation for canvas pooling in this codebase. However, its pool pattern is index-based (grow-only, trim-excess), which is appropriate for a fixed-count use case. For ThumbnailManager, a stack-based pool (push on evict, pop on acquire) is more appropriate because thumbnails are created and evicted at varying rates.

Key metrics:
- Cache capacity: 150 entries (line 35)
- Max slots per source: 30 (line 137)
- Thumbnail dimensions: variable per source aspect ratio, but constant within a source
- Source changes clear the entire cache (lines 185-188 in `loadThumbnails()`)

#### Implementation Steps

1. **Add pool state** near the top of the class (after line 43):

   ```typescript
   private canvasPool: (HTMLCanvasElement | OffscreenCanvas)[] = [];
   private static readonly MAX_POOL_SIZE = 30;
   ```

   Why 30: matches the maximum number of visible slots. There is no benefit to pooling more than one screenful of thumbnails.

2. **Register `onEvict` callback on the LRU cache** (line 35): Change the cache constructor to pass an eviction handler.

   ```typescript
   // Before (line 35):
   private cache = new LRUCache<string, HTMLCanvasElement | OffscreenCanvas>(150);

   // After:
   private cache = new LRUCache<string, HTMLCanvasElement | OffscreenCanvas>(150, (_key, canvas) => {
     this.returnToPool(canvas);
   });
   ```

3. **Add `returnToPool()` method**:

   ```typescript
   private returnToPool(canvas: HTMLCanvasElement | OffscreenCanvas): void {
     if (this.canvasPool.length < ThumbnailManager.MAX_POOL_SIZE) {
       this.canvasPool.push(canvas);
     }
     // If pool is full, canvas is simply GC'd (no leak)
   }
   ```

4. **Add `acquireCanvas()` method**:

   ```typescript
   private acquireCanvas(width: number, height: number): {
     canvas: HTMLCanvasElement | OffscreenCanvas;
     ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
   } | null {
     // Try to reuse from pool
     const pooled = this.canvasPool.pop();
     if (pooled) {
       // Resizing resets the bitmap (per spec) -- no stale pixels
       pooled.width = width;
       pooled.height = height;
       const ctx = pooled.getContext('2d');
       if (ctx) return { canvas: pooled, ctx };
       // If getContext fails on pooled canvas (shouldn't happen), fall through
     }

     // Create new
     if (typeof OffscreenCanvas !== 'undefined') {
       const canvas = new OffscreenCanvas(width, height);
       const ctx = canvas.getContext('2d');
       if (!ctx) return null;
       return { canvas, ctx };
     } else {
       const canvas = document.createElement('canvas');
       canvas.width = width;
       canvas.height = height;
       const ctx = canvas.getContext('2d');
       if (!ctx) return null;
       return { canvas, ctx };
     }
   }
   ```

5. **Update `loadThumbnail()` to use `acquireCanvas()`**: Replace the canvas creation block (lines 283-295 after Task 6.1 refactor) with:

   ```typescript
   const acquired = this.acquireCanvas(thumbWidth, thumbHeight);
   if (!acquired) return;
   const { canvas: targetCanvas, ctx: targetCtx } = acquired;
   ```

6. **Update `clear()` (line 95) and `dispose()` (line 464)** to drain the pool:

   ```typescript
   clear(): void {
     this.abortPending();
     this.cache.clear();  // will call onEvict -> returnToPool for each entry
     this.canvasPool.length = 0;  // drain pool after cache clear
     this.slots = [];
     this.sourceId = '';
   }
   ```

   Note: `cache.clear()` triggers `onEvict` for every entry (LRUCache.ts lines 64-71), which would fill the pool. We then immediately drain the pool with `this.canvasPool.length = 0`. This is correct because after `clear()`, the source is changing and thumbnail dimensions may differ. Alternatively, we could drain the pool *before* clearing the cache to avoid the fill-then-drain cycle, but the cost is negligible (150 array pushes + 1 length assignment).

   For `dispose()`:
   ```typescript
   dispose(): void {
     this.clear();
     this.clearRetryTimer();
     this.pendingRetries = [];
     this._loadingPaused = false;
     this.canvasPool.length = 0;  // ensure pool is drained (clear already does this, belt-and-suspenders)
   }
   ```

#### Edge Cases & Risks

- **Mixed canvas types in pool**: If `OffscreenCanvas` support changes between loads (impossible at runtime, but defensive): `acquireCanvas()` pops whatever is on the stack and calls `.getContext('2d')` on it. Both `HTMLCanvasElement` and `OffscreenCanvas` support this. If the popped canvas is the "wrong" type, it still works because both are accepted by `drawImage()` and the cache type.

- **Stale pixels after resize**: Per the HTML spec, setting `canvas.width` or `canvas.height` resets the bitmap to transparent black. `OffscreenCanvas` follows the same spec. No stale pixel risk.

- **`onEvict` during `cache.clear()`**: As noted above, `LRUCache.clear()` iterates all entries and calls `onEvict` for each (LRUCache.ts lines 64-71). This means `returnToPool` is called for every cached thumbnail during `clear()`. This is expected -- we drain the pool immediately after. No risk of unbounded growth.

- **`onEvict` during `cache.set()` for same key**: `LRUCache.set()` (lines 34-49 of LRUCache.ts) calls `onEvict` when the key exists and the new value differs (line 39-41). This means if `loadThumbnail()` is called for a frame that already has a cached thumbnail (e.g., retry), the old canvas will be returned to pool. This is correct behavior.

- **Pool not thread-safe**: JavaScript is single-threaded. No risk.

- **Pool sizing**: MAX_POOL_SIZE=30 matches the maximum number of visible thumbnail slots (line 137). If `calculateSlots` is reconfigured to allow more, this constant should be updated in tandem. Consider using `Math.max(30, this.slots.length)` for dynamic sizing, but the static constant is simpler and sufficient for now.

- **getContext('2d') failure on pooled canvas**: Extremely unlikely (the canvas was successfully used before), but handled by the fallthrough in `acquireCanvas()`.

#### Test Specifications
**File:** `src/ui/components/ThumbnailManager.test.ts`

```typescript
describe('Task 6.3: Canvas element pooling', () => {
  it('THUMB-POOL-001: evicted canvas is returned to pool', () => {
    // Setup: Use a small-capacity cache to force eviction
    const smallCache = new LRUCache<string, HTMLCanvasElement>(2, (_key, canvas) => {
      // This simulates what ThumbnailManager.returnToPool does
    });

    // For the real test, access the private canvasPool:
    const pool = (manager as any).canvasPool as any[];
    const cache = (manager as any).cache;

    // Set sourceId to make getCacheKey work
    (manager as any).sourceId = 'test-1920x1080';

    // Fill cache beyond capacity to trigger eviction
    // LRU cache capacity is 150, so we use setCapacity to reduce it for testing
    cache.setCapacity(2);

    const c1 = document.createElement('canvas');
    const c2 = document.createElement('canvas');
    const c3 = document.createElement('canvas');

    cache.set('test-1920x1080-1', c1);
    cache.set('test-1920x1080-2', c2);

    expect(pool.length).toBe(0);  // no evictions yet

    cache.set('test-1920x1080-3', c3);  // evicts c1

    expect(pool.length).toBe(1);
    expect(pool[0]).toBe(c1);

    // Cleanup: restore capacity
    cache.setCapacity(150);
  });

  it('THUMB-POOL-002: acquireCanvas reuses pooled canvas instead of creating new', () => {
    const pool = (manager as any).canvasPool as any[];

    // Pre-populate pool with a canvas
    const recycledCanvas = document.createElement('canvas');
    recycledCanvas.width = 100;
    recycledCanvas.height = 100;
    pool.push(recycledCanvas);

    const createSpy = vi.spyOn(document, 'createElement');

    // Call acquireCanvas
    const result = (manager as any).acquireCanvas(48, 27);

    // Should reuse the pooled canvas, not create a new one
    expect(result).not.toBeNull();
    expect(result.canvas).toBe(recycledCanvas);
    expect(recycledCanvas.width).toBe(48);  // resized
    expect(recycledCanvas.height).toBe(27);

    // createElement should NOT have been called
    expect(createSpy).not.toHaveBeenCalledWith('canvas');

    createSpy.mockRestore();
  });

  it('THUMB-POOL-003: pool is bounded at MAX_POOL_SIZE', () => {
    const pool = (manager as any).canvasPool as any[];
    const MAX = (ThumbnailManager as any).MAX_POOL_SIZE ?? 30;

    // Fill pool to max
    for (let i = 0; i < MAX + 10; i++) {
      (manager as any).returnToPool(document.createElement('canvas'));
    }

    expect(pool.length).toBe(MAX);
  });

  it('THUMB-POOL-004: clear() drains the pool', () => {
    const pool = (manager as any).canvasPool as any[];

    // Add canvases to pool
    pool.push(document.createElement('canvas'));
    pool.push(document.createElement('canvas'));
    expect(pool.length).toBe(2);

    manager.clear();

    expect((manager as any).canvasPool.length).toBe(0);
  });

  it('THUMB-POOL-005: pooled canvas is resized before reuse', () => {
    const pool = (manager as any).canvasPool as any[];

    const oldCanvas = document.createElement('canvas');
    oldCanvas.width = 200;
    oldCanvas.height = 150;
    pool.push(oldCanvas);

    const result = (manager as any).acquireCanvas(48, 27);

    expect(result.canvas.width).toBe(48);
    expect(result.canvas.height).toBe(27);
  });

  it('THUMB-POOL-006: dispose() drains the pool', () => {
    const pool = (manager as any).canvasPool as any[];
    pool.push(document.createElement('canvas'));

    manager.dispose();

    expect((manager as any).canvasPool.length).toBe(0);
  });

  it('THUMB-POOL-007: acquireCanvas creates new canvas when pool is empty', () => {
    const pool = (manager as any).canvasPool as any[];
    expect(pool.length).toBe(0);

    const result = (manager as any).acquireCanvas(48, 27);

    expect(result).not.toBeNull();
    expect(result.canvas.width).toBe(48);
    expect(result.canvas.height).toBe(27);
  });
});
```

---

## Summary of All Tests

| ID | Task | Test Description | Key Assertion |
|----|------|-----------------|---------------|
| THUMB-001 | 6.1 | OffscreenCanvas path does not create intermediate HTMLCanvasElement | `document.createElement('canvas')` NOT called in OffscreenCanvas path |
| THUMB-002 | 6.1 | drawImage called exactly once per thumbnail | No double-draw copy |
| THUMB-003 | 6.1 | HTMLCanvasElement fallback works without OffscreenCanvas | Thumbnail cached from fallback path |
| THUMB-004 | 6.1 | drawThumbnails works with OffscreenCanvas entries | `ctx.drawImage` called for each cached entry |
| THUMB-005 | 6.2 | getThumbnail uses peek (no LRU reorder) | `cache.peek` called, `cache.get` NOT called |
| THUMB-005b | 6.2 | drawThumbnails does not call cache.get | `cache.get` spy has zero calls after drawThumbnails |
| THUMB-POOL-001 | 6.3 | Evicted canvas returned to pool | Pool size = 1 after eviction |
| THUMB-POOL-002 | 6.3 | Pooled canvas reused on next acquire | Reused canvas identity matches, createElement not called |
| THUMB-POOL-003 | 6.3 | Pool bounded at MAX_POOL_SIZE | Pool does not exceed 30 |
| THUMB-POOL-004 | 6.3 | `clear()` drains pool | Pool empty after clear |
| THUMB-POOL-005 | 6.3 | Pooled canvas resized before reuse | Width/height match requested dimensions |
| THUMB-POOL-006 | 6.3 | `dispose()` drains pool | Pool empty after dispose |
| THUMB-POOL-007 | 6.3 | acquireCanvas creates new when pool empty | Returns valid canvas with correct dimensions |

## Performance Impact Estimate

| Metric | Before | After |
|--------|--------|-------|
| `drawImage` calls per thumbnail load | 2 (OffscreenCanvas path) | 1 |
| `document.createElement('canvas')` per load | 1-2 | 0 (if pool has entries) |
| Map delete+re-insert per `drawThumbnails()` frame | 30 | 0 |
| Canvas GC pressure during LRU eviction | 1 canvas GC'd per evict | 0 (recycled to pool) |

## Interaction with TIMELINE_REPAINT_PLAN.md

Task 1.4 in `TIMELINE_REPAINT_PLAN.md` plans to remove shadow blur from `drawThumbnails()`. That change is orthogonal to all tasks in this plan. The two plans can be implemented in any order. If Task 1.4 is done first, the `drawThumbnails()` method will be simpler (no `ctx.save()`/`ctx.restore()` calls), but this does not affect the peek/pool/OffscreenCanvas changes described here.
