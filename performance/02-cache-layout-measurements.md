# 02 - Cache Layout Measurements (getBoundingClientRect)

## Problem Description

`getBoundingClientRect()` is called on every render frame and during mouse interactions. This method triggers a forced synchronous layout reflow in the browser, which is expensive. The container and canvas dimensions only change when the window or container is resized, but the current code queries them on every frame in `renderImage()`, `updateWipeLine()`, and `updateSplitScreenLine()`.

**Impact:** At least 3 forced layout reads per render frame (container in `renderImage`, container + canvas in `updateWipeLine`, container + canvas in `updateSplitScreenLine`), plus additional reads in mouse handlers. Each forced layout can cost 1-5ms depending on DOM complexity.

## Current Code

**File:** `src/ui/components/Viewer.ts`

### In renderImage() (line 1506)

```typescript
private renderImage(): void {
  const source = this.session.currentSource;

  // Get container size
  const containerRect = this.container.getBoundingClientRect();  // <-- Called every frame
  const containerWidth = containerRect.width || 640;
  const containerHeight = containerRect.height || 360;
  // ...
```

### In updateWipeLine() (lines 3244-3245)

```typescript
private updateWipeLine(): void {
  if (!this.wipeElements) return;

  const containerRect = this.container.getBoundingClientRect();   // <-- Called every frame
  const canvasRect = this.canvasContainer.getBoundingClientRect(); // <-- Called every frame
  // ...
```

### In updateSplitScreenLine() (lines 3277-3278)

```typescript
private updateSplitScreenLine(): void {
  if (!this.splitScreenElements) return;
  // ...
  const containerRect = this.container.getBoundingClientRect();   // <-- Called every frame
  const canvasRect = this.canvasContainer.getBoundingClientRect(); // <-- Called every frame
  // ...
```

### In mouse handlers (lines 743, 789)

```typescript
// onMouseMoveForProbe
const canvasRect = this.imageCanvas.getBoundingClientRect();

// onMouseMoveForCursorColor
const canvasRect = this.imageCanvas.getBoundingClientRect();
```

### ResizeObserver (lines 558-561)

```typescript
this.resizeObserver = new ResizeObserver(() => {
  this.scheduleRender();
});
this.resizeObserver.observe(this.container);
```

## Implementation Plan

### Step 1: Add cached rect properties to Viewer class

```typescript
// Cached layout measurements - invalidated by ResizeObserver
private cachedContainerRect: DOMRect | null = null;
private cachedCanvasContainerRect: DOMRect | null = null;
private cachedImageCanvasRect: DOMRect | null = null;
```

### Step 2: Add invalidation method

```typescript
private invalidateLayoutCache(): void {
  this.cachedContainerRect = null;
  this.cachedCanvasContainerRect = null;
  this.cachedImageCanvasRect = null;
}
```

### Step 3: Add getter methods that lazily populate the cache

```typescript
private getContainerRect(): DOMRect {
  if (!this.cachedContainerRect) {
    this.cachedContainerRect = this.container.getBoundingClientRect();
  }
  return this.cachedContainerRect;
}

private getCanvasContainerRect(): DOMRect {
  if (!this.cachedCanvasContainerRect) {
    this.cachedCanvasContainerRect = this.canvasContainer.getBoundingClientRect();
  }
  return this.cachedCanvasContainerRect;
}

private getImageCanvasRect(): DOMRect {
  if (!this.cachedImageCanvasRect) {
    this.cachedImageCanvasRect = this.imageCanvas.getBoundingClientRect();
  }
  return this.cachedImageCanvasRect;
}
```

### Step 4: Update ResizeObserver to invalidate cache

```typescript
this.resizeObserver = new ResizeObserver(() => {
  this.invalidateLayoutCache();
  this.scheduleRender();
});
this.resizeObserver.observe(this.container);
```

### Step 5: Also invalidate on zoom/pan changes

Since zoom and pan affect `canvasContainer` transforms and thus its bounding rect, invalidate the canvas container and image canvas rects whenever zoom or pan state changes. Add `this.invalidateLayoutCache()` to the beginning of the `render()` method so that any state change that triggers a re-render gets fresh measurements on first access.

A simpler approach: invalidate at the start of each render cycle, so the cache lasts for the duration of one frame (still avoids redundant calls within a single frame):

```typescript
render(): void {
  // Invalidate layout cache once per frame - measurements are cached within the frame
  this.invalidateLayoutCache();
  this.renderImage();
  // ...
}
```

This way, within a single render call, `renderImage()`, `updateWipeLine()`, and `updateSplitScreenLine()` all share the same cached rect. The layout is read at most once per frame per element, instead of once per call site.

### Step 6: Replace all direct getBoundingClientRect() calls in the render path

- `renderImage()` line 1506: `this.container.getBoundingClientRect()` -> `this.getContainerRect()`
- `updateWipeLine()` lines 3244-3245: replace both calls
- `updateSplitScreenLine()` lines 3277-3278: replace both calls

### Step 7: Replace getBoundingClientRect() in mouse handlers

For mouse handlers, the cache is still valid since it is only invalidated at render start or on resize. The cached rect from the last render is correct until the next resize event.

- `onMouseMoveForProbe` line 743: `this.imageCanvas.getBoundingClientRect()` -> `this.getImageCanvasRect()`
- `onMouseMoveForCursorColor` line 789: same replacement

## Testing Approach

1. **Rendering correctness:** Load an image, resize the browser window, and verify the image scales and positions correctly. Check that the canvas fills the container appropriately at various sizes.

2. **Wipe line positioning:** Enable horizontal and vertical wipe modes, resize the window, and verify the wipe line repositions correctly after resize.

3. **Split screen positioning:** Enable split screen mode, resize the window, and verify the split line repositions correctly.

4. **Mouse interaction:** Verify pixel probe and cursor color work correctly after resize, confirming the cached rect is properly invalidated.

5. **Performance verification:** Use a browser profiler to confirm that `getBoundingClientRect` is called at most once per element per frame (not once per call site). In a frame with wipe + split screen active, this should drop from 5 calls to 2-3 calls.

6. **Zoom/pan:** Zoom in/out and pan the image. Verify that wipe line, split screen line, and mouse coordinates all remain correct.

## Acceptance Criteria

- [ ] `getBoundingClientRect()` is called at most once per element per render frame
- [ ] Layout cache is invalidated on ResizeObserver callback
- [ ] Layout cache is invalidated at the start of each render cycle
- [ ] Image rendering scales correctly after window resize
- [ ] Wipe line positions correctly after resize
- [ ] Split screen line positions correctly after resize
- [ ] Pixel probe and cursor color work correctly after resize
- [ ] Zoom and pan interactions remain correct
- [ ] All existing tests pass
