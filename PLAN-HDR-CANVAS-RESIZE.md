# Strategy B: HDR OffscreenCanvas Resize — Detailed Implementation Plan

## Problem Statement

HDR video frames are currently stored at **full native resolution** (e.g., 3840×2160).
Only **one** HDR frame is cached at a time (`cachedHDRIPImage` in `VideoSourceNode`).
This means:

- Every frame change triggers a full decoder seek + extraction (~50-100ms)
- No preloading ahead for HDR content (SDR has `FramePreloadManager`, HDR does not)
- The single cached VideoFrame holds ~66MB of GPU memory (4K RGBA16F)
- Smooth HDR playback is impossible without a multi-frame cache

**Goal**: Resize HDR VideoFrames to display resolution via an HDR OffscreenCanvas,
then cache multiple resized frames. This reduces per-frame memory from ~66MB to
~16MB (4K→1080p), enabling a 4-8× larger cache within the same memory budget.

---

## API Landscape

| API | Status | What it gives us |
|-----|--------|-----------------|
| `colorType: 'float16'` on Canvas2D | Chrome 137+ stable | 16-bit float backing store (values >1.0) |
| `colorSpace: 'display-p3'` on Canvas2D | Stable (all browsers) | Wide gamut primaries |
| `colorSpace: 'rec2100-hlg'` on Canvas2D | **Experimental** (Chrome flag only) | HLG transfer + BT.2020 primaries |
| `colorSpace: 'rec2100-pq'` on Canvas2D | **Experimental** (Chrome flag only) | PQ transfer + BT.2020 primaries |
| `drawImage(videoFrame, ...)` on Canvas2D | Stable | GPU-accelerated resize |
| `new VideoFrame(canvas, { timestamp })` | Stable | Create VideoFrame from canvas content |

### Two Tiers

**Tier 1 (ideal)**: `rec2100-hlg` + `float16` canvas — preserves exact HDR signal space.
The shader's EOTF decode works unchanged because pixel data stays in HLG/PQ encoding.
Requires experimental Chrome flag. **No gamut or transfer function loss.**

**Tier 2 (fallback)**: `display-p3` + `float16` canvas — stable API, stores extended-range
values (>1.0 preserved in float16). However, drawImage converts HLG/PQ → display-p3
linear, which means:
- Minor gamut compression (BT.2020 → P3, ~90% coverage)
- Transfer function changes (HLG EOTF applied by browser, not our shader)
- IPImage metadata must be updated to reflect the new color space
- Shader's `u_inputTransfer` must be set to `srgb` (data is already linearized)

**Tier 3 (current behavior)**: No resize. Full-resolution VideoFrame. Single-frame cache.

---

## Architecture Overview

```
                    Current HDR Flow
                    ================
VideoSampleSink.getSample(ts)
    → VideoSample.toVideoFrame()           // Full 4K VideoFrame
    → IPImage { videoFrame, metadata }      // Stored as cachedHDRIPImage (1 frame only)
    → Renderer.texImage2D(videoFrame)       // 66MB GPU upload
    → image.close()                         // VideoFrame released

                    Proposed HDR Flow
                    =================
VideoSampleSink.getSample(ts)
    → VideoSample.toVideoFrame()           // Full 4K VideoFrame (temporary)
    → HDRFrameResizer.resize(vf, target)   // Resize via HDR OffscreenCanvas
        → drawImage(vf, 0, 0, tw, th)     // GPU-accelerated resize
        → new VideoFrame(canvas, {ts})     // Resized VideoFrame (~1080p)
        → original.close()                 // Release full-res immediately
    → IPImage { videoFrame, metadata }     // Resized frame
    → HDR FramePreloadManager cache        // Multi-frame LRU cache
    → Renderer.texImage2D(videoFrame)      // ~16MB GPU upload
    → image.close()                        // VideoFrame released
```

---

## Implementation Plan

### Phase 0: Feature Detection

**File**: `src/color/DisplayCapabilities.ts`

Add a new capability flag for HDR canvas resize support:

```typescript
// Add to DisplayCapabilities interface:
/** True if OffscreenCanvas supports HDR color space + float16 for VideoFrame resize */
canvasHDRResize: boolean;
/** Which HDR canvas tier is available: 'rec2100' | 'display-p3-float16' | 'none' */
canvasHDRResizeTier: 'rec2100' | 'display-p3-float16' | 'none';
```

**Detection logic** (in `detectDisplayCapabilities()`):

```
1. Try: new OffscreenCanvas(1,1).getContext('2d', { colorSpace: 'rec2100-hlg', colorType: 'float16' })
   → If non-null: canvasHDRResizeTier = 'rec2100'
2. Else try: new OffscreenCanvas(1,1).getContext('2d', { colorSpace: 'display-p3', colorType: 'float16' })
   → If non-null: canvasHDRResizeTier = 'display-p3-float16'
3. Else: canvasHDRResizeTier = 'none'
4. canvasHDRResize = canvasHDRResizeTier !== 'none'
```

Also add a **runtime validation** that drawImage(VideoFrame) actually works on the
created context (some browsers report context creation success but fail on
VideoFrame draw). This can be done lazily on first use.

**Files changed**: `DisplayCapabilities.ts`, `DisplayCapabilities.test.ts`

---

### Phase 1: HDRFrameResizer Utility

**New file**: `src/utils/media/HDRFrameResizer.ts`

A stateless utility class that:
1. Holds a reusable OffscreenCanvas (resized lazily when target dims change)
2. Takes a VideoFrame + targetSize → returns a resized VideoFrame
3. Reports which tier is active
4. Handles cleanup of the temporary full-res VideoFrame

```typescript
interface HDRResizeResult {
  /** Resized VideoFrame (or original if resize not possible) */
  videoFrame: VideoFrame;
  /** True if resize was performed (false = returned original) */
  resized: boolean;
  /** If tier2, metadata overrides needed for the shader */
  metadataOverrides?: {
    transferFunction: 'srgb';
    colorPrimaries: 'bt709' | 'bt2020';
  };
}

class HDRFrameResizer {
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private tier: 'rec2100' | 'display-p3-float16' | 'none';
  private canvasW = 0;
  private canvasH = 0;

  constructor(tier: 'rec2100' | 'display-p3-float16' | 'none') { ... }

  /**
   * Resize a VideoFrame to target dimensions.
   * - If tier='rec2100': canvas uses source's HDR color space, no metadata changes
   * - If tier='display-p3-float16': canvas converts to P3 linear, metadata overrides returned
   * - If tier='none' or targetSize >= source: returns original VideoFrame unchanged
   *
   * IMPORTANT: On success, the ORIGINAL VideoFrame is closed by this method.
   * The caller receives ownership of the returned (resized) VideoFrame.
   */
  resize(
    videoFrame: VideoFrame,
    targetSize: { w: number; h: number },
    sourceColorSpace?: { transfer?: string; primaries?: string },
  ): HDRResizeResult { ... }

  dispose(): void { ... }
}
```

**Key implementation details**:

1. **Canvas color space selection** (Tier 1 - rec2100):
   ```typescript
   // Match source transfer function
   const colorSpace = transfer === 'arib-std-b67' ? 'rec2100-hlg' : 'rec2100-pq';
   ctx = canvas.getContext('2d', { colorSpace, colorType: 'float16' });
   ```

2. **Canvas color space selection** (Tier 2 - display-p3-float16):
   ```typescript
   ctx = canvas.getContext('2d', { colorSpace: 'display-p3', colorType: 'float16' });
   // Browser applies EOTF + primaries conversion during drawImage
   ```

3. **Resize operation**:
   ```typescript
   // Ensure canvas dimensions match target
   if (this.canvasW !== targetSize.w || this.canvasH !== targetSize.h) {
     this.canvas.width = targetSize.w;
     this.canvas.height = targetSize.h;
     this.canvasW = targetSize.w;
     this.canvasH = targetSize.h;
     // Context is invalidated by dimension change, must re-acquire
     this.ctx = this.canvas.getContext('2d', { ... });
   }
   // Draw with resize (GPU-accelerated)
   this.ctx.drawImage(videoFrame, 0, 0, targetSize.w, targetSize.h);
   // Create resized VideoFrame from canvas
   const resized = new VideoFrame(this.canvas, { timestamp: videoFrame.timestamp });
   // Release original
   videoFrame.close();
   return { videoFrame: resized, resized: true, metadataOverrides };
   ```

4. **Skip conditions** (return original unchanged):
   - `tier === 'none'`
   - `targetSize.w >= videoFrame.displayWidth && targetSize.h >= videoFrame.displayHeight`
   - Canvas context creation failed at runtime

5. **Error handling**: If drawImage or VideoFrame construction throws, return
   original VideoFrame unchanged (don't close it). Log warning.

**Files created**: `HDRFrameResizer.ts`, `HDRFrameResizer.test.ts`

---

### Phase 2: Integrate Resizer into VideoSourceNode

**File**: `src/nodes/sources/VideoSourceNode.ts`

**Changes to `hdrSampleToIPImage()`**:

Currently (line 752):
```typescript
private hdrSampleToIPImage(sample: { toVideoFrame(): VideoFrame }, frame: number): IPImage {
  const videoFrame = sample.toVideoFrame();
  // ... creates IPImage with full-res VideoFrame
}
```

After:
```typescript
private hdrSampleToIPImage(
  sample: { toVideoFrame(): VideoFrame },
  frame: number,
  targetSize?: { w: number; h: number },
): IPImage {
  let videoFrame = sample.toVideoFrame();
  let transferFunction = this.mapTransferFunction(this.videoColorSpace?.transfer ?? undefined);
  let colorPrimaries = this.mapColorPrimaries(this.videoColorSpace?.primaries ?? undefined);

  // Resize if target is smaller than source and HDR resize is available
  if (targetSize && this.hdrResizer) {
    const result = this.hdrResizer.resize(videoFrame, targetSize, this.videoColorSpace ?? undefined);
    videoFrame = result.videoFrame;
    if (result.metadataOverrides) {
      transferFunction = result.metadataOverrides.transferFunction;
      colorPrimaries = result.metadataOverrides.colorPrimaries;
    }
  }

  const trackWidth = targetSize?.w ?? this.metadata.width;
  const trackHeight = targetSize?.h ?? this.metadata.height;
  // ... rest unchanged, uses videoFrame and updated metadata
}
```

**New property on VideoSourceNode**:
```typescript
private hdrResizer: HDRFrameResizer | null = null;
```

Initialized during `load()` based on DisplayCapabilities:
```typescript
if (capabilities.canvasHDRResize) {
  this.hdrResizer = new HDRFrameResizer(capabilities.canvasHDRResizeTier);
}
```

**Changes to `fetchHDRFrame()`** (line 862):

Pass target size through:
```typescript
async fetchHDRFrame(frame: number): Promise<IPImage | null> {
  // ... existing checks ...
  const sample = await this.frameExtractor.getFrameHDR(frame);
  if (!sample) return null;

  // Use current target size for resize (set by Viewer based on display dimensions)
  const targetSize = this.preloadManager?.getTargetSize() ?? undefined;
  const ipImage = this.hdrSampleToIPImage(sample, frame, targetSize);
  sample.close();
  // ... rest unchanged
}
```

**Files changed**: `VideoSourceNode.ts`

---

### Phase 3: HDR Frame Cache (Multi-Frame)

**File**: `src/nodes/sources/VideoSourceNode.ts`

Replace the single-frame HDR cache with a proper LRU cache:

```typescript
// Replace:
private cachedHDRIPImage: IPImage | null = null;
private cachedHDRIPImageFrame: number = -1;

// With:
private hdrFrameCache = new LRUCache<number, IPImage>(8, {
  onEvict: (_key, image) => image.close(),  // Close VideoFrame on eviction
});
```

**Cache sizing**: At 1080p RGBA16F, each frame is ~16MB. 8 frames = ~128MB.
At full 4K, each frame is ~66MB. 8 frames = ~528MB. Resize makes this viable.

**Update `getCachedHDRIPImage()`**:
```typescript
getCachedHDRIPImage(frame: number): IPImage | null {
  return this.hdrFrameCache.get(frame) ?? null;
}
```

**Update `fetchHDRFrame()`**:
```typescript
async fetchHDRFrame(frame: number): Promise<IPImage | null> {
  // Check cache first
  const cached = this.hdrFrameCache.get(frame);
  if (cached) return cached;

  // ... extract and resize ...

  this.hdrFrameCache.set(frame, ipImage);
  return ipImage;
}
```

**Important**: The `image.close()` call in `Renderer.updateTexture()` (line 535)
closes the VideoFrame after GPU upload. This means cached IPImages will have
`videoFrame = null` after first render. We need one of:

a) **Clone the VideoFrame before caching** — `new VideoFrame(vf)` creates a
   copy. Cache holds the clone; renderer closes its copy.
b) **Don't close after texImage2D** — keep the VideoFrame alive for cache reuse.
   Requires careful VRAM management; add explicit eviction.
c) **Cache the raw Float16 pixel data** instead of VideoFrame — use
   `ctx.getImageData()` with `pixelFormat: 'rgba-float16'`. Upload via
   `texImage2D(RGBA16F, HALF_FLOAT, float16Array)`. Avoids VideoFrame lifetime issues.

**Recommended**: Option (c) — cache pixel data, not VideoFrame. This cleanly
separates GPU resource lifetime from cache lifetime:

```typescript
interface CachedHDRFrame {
  /** Raw pixel data in RGBA half-float format */
  data: ArrayBuffer;  // Float16Array backing buffer
  width: number;
  height: number;
  transferFunction: TransferFunction;
  colorPrimaries: ColorPrimaries;
}
```

This requires changing `IPImage` construction for cached frames to use the
TypedArray upload path instead of VideoFrame path. The Renderer already
supports `texImage2D(RGBA16F, HALF_FLOAT, typedArray)` for non-VideoFrame HDR.

**Cache memory with pixel data** (1080p RGBA float16):
- 1920 × 1080 × 4 channels × 2 bytes = ~16MB per frame
- 8 frames = ~128MB — manageable

**Files changed**: `VideoSourceNode.ts`, `Image.ts` (add float16 data support if needed)

---

### Phase 4: HDR Preloading

**File**: `src/nodes/sources/VideoSourceNode.ts`

Once the multi-frame cache exists, add preloading for HDR frames similar to
the existing SDR preload in `FramePreloadManager`:

```typescript
async preloadHDRFrames(centerFrame: number, ahead: number = 3, behind: number = 1): Promise<void> {
  const frames: number[] = [];
  for (let i = -behind; i <= ahead; i++) {
    const f = centerFrame + i;
    if (f >= 1 && f <= this.metadata.frameCount && !this.hdrFrameCache.has(f)) {
      frames.push(f);
    }
  }
  // Extract frames sequentially (decoder is serialized anyway)
  for (const frame of frames) {
    await this.fetchHDRFrame(frame);
  }
}
```

**Integration in Viewer.ts** `process()` method:

After rendering the current HDR frame, kick off preloading:
```typescript
if (hdrIPImage && this.renderHDRWithWebGL(hdrIPImage, displayWidth, displayHeight)) {
  // Preload nearby HDR frames in background
  source.videoSourceNode.preloadHDRFrames(currentFrame);
  return;
}
```

**Files changed**: `VideoSourceNode.ts`, `Viewer.ts`

---

### Phase 5: Type Definitions & Cleanup

**File**: `src/types/webgl-hdr.d.ts`

Update the type definitions:

1. Add `colorType` property to `CanvasRenderingContext2DSettings`:
   ```typescript
   interface CanvasRenderingContext2DSettings {
     colorType?: 'unorm8' | 'float16';  // Chrome 137+
     pixelFormat?: 'uint8' | 'float16'; // Deprecated alias (pre-Chrome 133)
   }
   ```

2. Add `OffscreenCanvasRenderingContext2DSettings` with same properties if needed.

3. Add ImageData `pixelFormat` option type (for Phase 3 option c).

**Files changed**: `webgl-hdr.d.ts`

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| `rec2100-hlg` canvas never ships stable | Tier 1 unusable in production | Tier 2 (`display-p3` + `float16`) is stable from Chrome 137; Tier 3 is current behavior |
| `drawImage(videoFrame)` on HDR canvas produces incorrect colors | Wrong output | Runtime validation on first use; fall back to Tier 3 |
| `new VideoFrame(hdrCanvas)` loses HDR data | Resized frame is SDR | Use pixel data cache (Phase 3 option c) instead of VideoFrame roundtrip |
| Float16Array not available in target browsers | Can't cache pixel data | Check `typeof Float16Array !== 'undefined'`; fall back to Float32Array (2× memory) |
| `getImageData({ pixelFormat: 'rgba-float16' })` not supported | Can't extract float16 pixels | Fall back to `getImageData()` → Uint8ClampedArray → convert to Float32 (lossy for HDR) |
| Memory pressure from 8-frame HDR cache | OOM on low-end devices | Make cache size configurable; reduce to 2-4 frames on memory pressure |
| OffscreenCanvas context re-acquisition on resize | Performance cost | Reuse canvas at max expected size; use sub-rect drawing |

---

## Validation Experiments (Pre-Implementation)

Before full implementation, run these browser experiments to validate assumptions:

### Experiment 1: HDR Canvas Resize Roundtrip
```javascript
// Does drawImage(videoFrame) on rec2100-hlg canvas preserve HDR values?
const canvas = new OffscreenCanvas(960, 540);
const ctx = canvas.getContext('2d', { colorSpace: 'rec2100-hlg', colorType: 'float16' });
ctx.drawImage(hdrVideoFrame, 0, 0, 960, 540);
const id = ctx.getImageData(0, 0, 960, 540, { pixelFormat: 'rgba-float16' });
// Check: are there values > 1.0 in id.data?
console.log('Max pixel value:', Math.max(...id.data));
```

### Experiment 2: VideoFrame from HDR Canvas
```javascript
// Does new VideoFrame(hdrCanvas) produce a usable VideoFrame for texImage2D?
const resized = new VideoFrame(canvas, { timestamp: 0 });
console.log('Format:', resized.format, 'ColorSpace:', resized.colorSpace);
// Then test: gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, resized);
```

### Experiment 3: Tier 2 Extended-Range P3
```javascript
// Does display-p3 + float16 preserve values > 1.0 from HDR VideoFrame?
const canvas = new OffscreenCanvas(960, 540);
const ctx = canvas.getContext('2d', { colorSpace: 'display-p3', colorType: 'float16' });
ctx.drawImage(hdrVideoFrame, 0, 0, 960, 540);
const id = ctx.getImageData(0, 0, 960, 540, { pixelFormat: 'rgba-float16' });
console.log('Max P3 pixel value:', Math.max(...id.data));
// If >1.0 values exist, Tier 2 preserves HDR headroom in extended-range P3
```

### Experiment 4: texImage2D with Float16Array
```javascript
// Can we upload Float16Array directly to WebGL RGBA16F texture?
const f16 = new Float16Array(width * height * 4);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, f16);
// Check gl.getError() === gl.NO_ERROR
```

---

## Implementation Order

1. **Phase 0**: Feature detection (~1h)
2. **Experiments 1-4**: Validate assumptions in browser (~2h)
3. **Phase 1**: HDRFrameResizer utility + tests (~3h)
4. **Phase 5**: Type definitions (~30min)
5. **Phase 2**: Integration into VideoSourceNode (~2h)
6. **Phase 3**: Multi-frame cache with pixel data (~3h)
7. **Phase 4**: HDR preloading (~2h)
8. **End-to-end testing** with real HDR video content (~2h)

---

## Success Metrics

- HDR frame cache holds 4-8 frames at display resolution
- Per-frame cache memory: ~16MB (1080p) vs ~66MB (4K) = **4× reduction**
- Smooth HDR scrubbing within cached range (no decoder seeks)
- No visible quality loss compared to full-resolution path
- Graceful fallback to current behavior when HDR canvas unavailable
- All existing HDR tests continue to pass
