# 03 - Pool Ghost Frame Canvases

## Problem Description

When rendering ghost frames (onion skin overlay), the code creates a new temporary `HTMLCanvasElement` and calls `getContext('2d')` for every ghost frame that needs to be drawn from a sequence source on every render cycle. With `framesBefore` and `framesAfter` set to their maximum (5 each), this creates up to 10 new canvas elements per frame. Canvas creation involves DOM allocation and GPU resource allocation, making it a significant performance bottleneck during playback.

**Impact:** Up to 10 `document.createElement('canvas')` + `getContext('2d')` calls per render frame during ghost frame rendering. Each canvas creation involves DOM node allocation, GPU texture allocation, and 2D context initialization.

## Current Code

**File:** `src/ui/components/Viewer.ts`

### Ghost Frame Rendering (lines 2994-3007)

```typescript
// If not in cache, try to get from sequence or video
if (!frameCanvas) {
  if (source.type === 'sequence') {
    // Synchronous check for cached sequence frame
    const seqFrame = this.session.getSequenceFrameSync(frame);
    if (seqFrame) {
      // Draw to temporary canvas
      const tempCanvas = document.createElement('canvas');       // <-- New canvas every time
      tempCanvas.width = displayWidth;
      tempCanvas.height = displayHeight;
      const tempCtx = tempCanvas.getContext('2d');                // <-- New context every time
      if (tempCtx) {
        tempCtx.drawImage(seqFrame, 0, 0, displayWidth, displayHeight);
        frameCanvas = tempCanvas;
      }
    }
  } else if (source.type === 'video') {
    // Try mediabunny cached frame
    const videoFrame = this.session.getVideoFrameCanvas(frame);
    if (videoFrame) {
      frameCanvas = videoFrame;
    }
  }
}
```

### Full context: renderGhostFrames method (lines 2944-3035)

The method iterates over `framesBefore` (up to 5) and `framesAfter` (up to 5) ghost frames, and for each sequence frame that is not in the prerender cache, creates a new temporary canvas.

## Implementation Plan

### Step 1: Add a canvas pool to the Viewer class

Add private properties for the ghost frame canvas pool:

```typescript
// Ghost frame canvas pool - reuse canvases instead of creating new ones each frame
private ghostFrameCanvasPool: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = [];
private ghostFramePoolWidth = 0;
private ghostFramePoolHeight = 0;
```

### Step 2: Implement pool management methods

```typescript
/**
 * Get a canvas from the ghost frame pool, creating one if needed.
 * All pooled canvases share the same dimensions; if the display size changes,
 * the pool is re-sized.
 */
private getGhostFrameCanvas(
  index: number,
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  // If display size changed, resize all existing pool entries
  if (this.ghostFramePoolWidth !== width || this.ghostFramePoolHeight !== height) {
    this.ghostFramePoolWidth = width;
    this.ghostFramePoolHeight = height;
    for (const entry of this.ghostFrameCanvasPool) {
      entry.canvas.width = width;
      entry.canvas.height = height;
    }
  }

  // Create new entry if pool is not big enough
  if (index >= this.ghostFrameCanvasPool.length) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    this.ghostFrameCanvasPool.push({ canvas, ctx });
  }

  return this.ghostFrameCanvasPool[index]!;
}
```

### Step 3: Replace canvas creation in renderGhostFrames

Replace the inner loop body that creates temporary canvases. Track a pool index across the loop:

```typescript
private renderGhostFrames(displayWidth: number, displayHeight: number): void {
  if (!this.ghostFrameState.enabled) return;

  const currentFrame = this.session.currentFrame;
  const source = this.session.currentSource;
  if (!source) return;

  const duration = source.duration ?? 1;
  const ctx = this.imageCtx;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const framesToRender: { frame: number; distance: number; isBefore: boolean }[] = [];

  for (let i = this.ghostFrameState.framesBefore; i >= 1; i--) {
    const frame = currentFrame - i;
    if (frame >= 1) {
      framesToRender.push({ frame, distance: i, isBefore: true });
    }
  }

  for (let i = this.ghostFrameState.framesAfter; i >= 1; i--) {
    const frame = currentFrame + i;
    if (frame <= duration) {
      framesToRender.push({ frame, distance: i, isBefore: false });
    }
  }

  let poolIndex = 0;

  for (const { frame, distance, isBefore } of framesToRender) {
    const opacity = this.ghostFrameState.opacityBase *
      Math.pow(this.ghostFrameState.opacityFalloff, distance - 1);

    let frameCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

    if (this.prerenderBuffer) {
      const cached = this.prerenderBuffer.getFrame(frame);
      if (cached) {
        frameCanvas = cached.canvas;
      }
    }

    if (!frameCanvas) {
      if (source.type === 'sequence') {
        const seqFrame = this.session.getSequenceFrameSync(frame);
        if (seqFrame) {
          // Use pooled canvas instead of creating a new one
          const poolEntry = this.getGhostFrameCanvas(poolIndex, displayWidth, displayHeight);
          if (poolEntry) {
            poolEntry.ctx.clearRect(0, 0, displayWidth, displayHeight);
            poolEntry.ctx.drawImage(seqFrame, 0, 0, displayWidth, displayHeight);
            frameCanvas = poolEntry.canvas;
            poolIndex++;
          }
        }
      } else if (source.type === 'video') {
        const videoFrame = this.session.getVideoFrameCanvas(frame);
        if (videoFrame) {
          frameCanvas = videoFrame;
        }
      }
    }

    if (!frameCanvas) continue;

    // Rest of the ghost frame drawing code remains unchanged...
  }
}
```

### Step 4: Clean up pool on destroy

In the Viewer's `destroy()` or cleanup method, clear the pool:

```typescript
this.ghostFrameCanvasPool = [];
this.ghostFramePoolWidth = 0;
this.ghostFramePoolHeight = 0;
```

## Testing Approach

1. **Visual correctness:** Load a sequence, enable ghost frames with various `framesBefore` and `framesAfter` values (1-5). Verify that ghost frames render with correct opacity, position, and color tint.

2. **Resize handling:** Resize the viewer while ghost frames are enabled. Verify that ghost frames continue to render at the correct resolution after resize.

3. **No new canvas creation during rendering:** After the initial pool warmup, use the browser Memory profiler or add a temporary spy on `document.createElement` to verify no new canvas elements are created during subsequent render cycles.

4. **Pool reuse:** Verify that reducing the number of ghost frames does not cause errors (pool entries simply go unused). Verify that increasing the number of ghost frames correctly creates additional pool entries only once.

5. **Performance comparison:** Compare memory allocations and frame time before and after the change using Chrome DevTools Performance tab. Focus on the ghost frame rendering section.

6. **Video source:** Verify that video sources still work correctly, since they use a different path (`getVideoFrameCanvas`) that does not need the pool.

## Acceptance Criteria

- [ ] Ghost frames render visually identically to the current implementation
- [ ] No new `document.createElement('canvas')` calls during steady-state rendering (after pool warmup)
- [ ] No new `getContext('2d')` calls during steady-state rendering
- [ ] Pool correctly resizes canvases when display dimensions change
- [ ] Pool is cleaned up on Viewer destruction
- [ ] Ghost frame opacity and color tint work correctly
- [ ] Both sequence and video source types continue to work
- [ ] All existing tests pass
