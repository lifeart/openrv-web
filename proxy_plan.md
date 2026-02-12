# Adaptive Proxy Rendering — Implementation Plan

## Overview

The current rendering pipeline has no awareness of display resolution or device pixel ratio. Every frame is extracted, cached, and processed at full source resolution, then the GPU scales it down to fit the viewport. This wastes memory, VRAM, and CPU cycles.

This plan introduces 4 phases of adaptive proxy rendering, each building on the previous.

---

## Current State — Four Key Gaps

1. **No DPI awareness in media mode** — `resetCanvasFromHiDPI()` sets canvas to 1:1 logical pixels. On a 2x retina display, a 1000x600 display = 1000x600 canvas stretched over 2000x1200 physical pixels — looks soft.

2. **Full source always uploaded to GPU** — An 8K (7680x4320) EXR uploads all ~33M pixels via `texImage2D` even when only 1000x600 pixels are visible. That's ~132MB of VRAM for a display that needs ~2.4MB.

3. **No interaction-quality tiering** — Same full pipeline whether idle or scrubbing/panning.

4. **Frame cache is resolution-unaware** — 100 cached frames of 4K video = ~3.3 GB of ImageBitmaps, even when displaying at 1000x600.

---

## Phase 1: DPI-Aware Canvas (Foundation)

The biggest visual quality win. Currently `setCanvasSize()` at `Viewer.ts:572` sets `canvas.width = displayWidth` with no DPR consideration — retina displays render soft.

### Revised Strategy: GL-Only DPR Scaling

> **Review finding**: Making the 2D canvas physical-sized causes a 4x `getImageData`/`putImageData` performance regression for CPU effects (clarity, sharpen, CDL, curves). The expert reviewer recommends applying DPR scaling ONLY to the GL canvas path, keeping the 2D canvas at logical resolution. The browser compositor upscales logical→physical, which is already decent quality with `imageSmoothingQuality = 'high'`.

**Two-tier approach:**
- **GL canvas (HDR + SDR WebGL path)**: physical resolution = logical x DPR. Sharp retina rendering, no CPU effects involved.
- **2D canvas (SDR fallback path)**: stays at logical resolution. No CPU effects regression. Browser compositor handles upscaling.

### Core Change — Split Logical vs Physical Dimensions

| Property | Current | After |
|---|---|---|
| `glCanvas.width/height` | logical | physical (logical x DPR) |
| `glCanvas.style.width/height` | unset | `"${logical}px"` |
| `imageCanvas.width/height` | logical | logical (unchanged) |
| `displayWidth/Height` (positioning) | logical | logical (unchanged) |
| New: `physicalWidth/Height` | N/A | logical x DPR (for GL path) |
| GL viewport | logical | physical |

### Files to Change

| File | What | Lines |
|---|---|---|
| `Viewer.ts` | Add `physicalWidth`/`physicalHeight` fields. `setCanvasSize()` computes physical dims. 2D canvas stays logical. GL path gets physical. | 569-587, 853-1373 |
| `ViewerGLRenderer.ts` | `resizeIfActive()` and `renderHDR/SDRWithWebGL()` pass physical dims to `Renderer.resize()`. Set `glCanvas.style.width/height` to logical. Fix dimension comparison at line 301/561. **Note**: when OffscreenCanvas worker path is active (`transferControlToOffscreen`), CSS style must be set on a wrapper div, not the canvas itself. | 293-321, 544-597 |
| `Renderer.ts` | `resize()` already takes arbitrary dims — no internal change. Just receives physical dims from caller. | 279-294 |
| `ViewerInputHandler.ts` | `getCanvasPoint()` — verify CSS rect / displayWidth ratio still works. | 209+ |
| `PixelSamplingManager.ts` | **Critical**: `getImageData()` at line 251 reads `canvas.width` directly. For GL path, `readPixelFloat` coordinates must be scaled by DPR. For 2D canvas path (logical), no change needed. | 87-136, 250-256 |
| `OverlayManager.ts` | `updateDimensions()` receives logical dims for CSS-positioned overlays. | 121+ |
| `ViewerExport.ts` | Audit: export must use source dims, not DPR-scaled display dims. | |
| `Viewer.ts` (renderPaint) | `renderPaint()` and `renderLiveStroke()` use `displayWidth`/`displayHeight` for `clearRect`. Since 2D canvas stays logical, these are fine. But verify. | 1612-1631 |

### Implementation Steps

**Step 1.1**: Add `physicalWidth`/`physicalHeight` fields to the Viewer class alongside existing `displayWidth`/`displayHeight` (which remain logical).

**Step 1.2**: In `setCanvasSize()`, compute `physicalWidth = Math.round(logicalWidth * dpr)`. The 2D canvas (`imageCanvas`, `paintCanvas`, crop overlay) stays at logical resolution. Only `glRendererManager.resizeIfActive()` receives physical dims.

**Step 1.3**: In `ViewerGLRenderer`, set `glCanvas.style.width` and `glCanvas.style.height` to logical dimensions. When the OffscreenCanvas worker path is active, set CSS on the canvas's parent wrapper instead.

**Step 1.4**: Add `matchMedia('(resolution)')` listener to detect DPR changes (user moving window between displays). On DPR change, recompute physical dims and schedule re-render.

**Step 1.5**: Cap physical dimensions at `gl.getParameter(gl.MAX_TEXTURE_SIZE)` (typically 16384) to prevent silent GL failures on very high DPR or very large displays.

**Step 1.6**: Update `PixelSamplingManager` coordinate conversion:
- GL path (`readPixelFloat`): scale coordinates by DPR before readback.
- 2D path (`getImageData`): no change needed (canvas stays logical).

**Step 1.7**: Update export paths to use source dimensions (not DPR-scaled display dimensions).

### Key Notes

- **2D canvas CPU effects are unaffected** — no 4x regression since 2D canvas stays logical.
- **GL path gets full retina quality** — shader output at physical resolution, compositor handles display.
- **`renderPaint()` and overlays unchanged** — they operate on 2D canvases at logical resolution.
- **Blast radius audit**: `drawPlaceholder`, `renderGhostFrames`, `applyLUTToCanvas`, `compositeStackLayers`, `renderSplitScreen`, `renderDifferenceMatte`, and `applyBatchedPixelEffects` all use `displayWidth`/`displayHeight`. Since 2D canvas stays logical, these are all fine.

---

## Phase 2: Interaction Quality Tiering

> **IMPORTANT**: Phase 1 and Phase 2 should ship together. If Phase 1 shipped alone and the 2D canvas were ever upgraded to physical resolution in the future, CPU effects would regress without Phase 2's mitigation.

Reduce effective DPR during interaction for responsiveness, restore on idle.

### Revised Strategy: GL Viewport Subrect (Not Canvas Resize)

> **Review finding**: Resizing the canvas during interaction triggers expensive `drawingBufferStorage` reallocation, canvas buffer clearing, and overlay re-creation. Instead, keep the GL canvas at full physical size and render to a smaller `gl.viewport()` subrect during interaction. On quality restore, just expand the viewport back to full size.

**Benefits:**
- No `drawingBufferStorage` reallocation (saves 2-4ms per resize)
- No canvas buffer clearing (avoids flash)
- No overlay canvas re-creation
- Slight VRAM overhead from unused buffer area (acceptable)

### Quality Factor

- `1.0` = full DPR (idle, viewing still frame)
- `0.5` = half DPR (zooming, scrubbing)
- `effectiveViewport = physicalDims * qualityFactor`

### Interaction Hooks (Where Start/End Events Originate)

| Event | File | Lines | Notes |
|---|---|---|---|
| Wheel zoom | `ViewerInputHandler.ts` | 446-478 | Calls `scheduleRender()` |
| Pinch zoom | `ViewerInputHandler.ts` | 430-440 | Calls `scheduleRender()` |
| Smooth zoom anim | `TransformManager.ts` | 181-258 | rAF loop, calls `requestRender()` each tick |
| Timeline scrub | `Timeline.ts` | 292-329 | `isDragging` flag, fires `goToFrame()` |
| **Pan** | `ViewerInputHandler.ts` | 277-394 | Only moves CSS transform, **no re-render** — skip |

### Implementation Steps

**Step 2.1**: Add `InteractionQualityManager` with:
- `activeInteractions: number` (reference count, not boolean — handles overlapping zoom + scrub)
- `qualityFactor: number` (default 1.0)
- `interactionDebounceTimer: ReturnType<typeof setTimeout>`
- `beginInteraction()` — increments counter, sets qualityFactor = 0.5
- `endInteraction()` — decrements counter, if counter === 0, starts debounce timer
- `getEffectiveViewport(physicalW, physicalH)` — returns `{w: physicalW * qualityFactor, h: physicalH * qualityFactor}`

**Step 2.2**: Hook interaction start/end events:
- In `ViewerInputHandler`: wheel zoom start/end, pinch zoom start/end.
- In `TransformManager`: smooth zoom animation start/end.
- In `Timeline`: scrub start/end (via Session or callback).
- Each source calls `beginInteraction()`/`endInteraction()` independently.

**Step 2.3**: In the GL render path, use `gl.viewport(0, 0, effectiveW, effectiveH)` instead of full physical dims during interaction. The CSS size stays the same (logical), so the browser upscales the smaller viewport output.

**Step 2.4**: Add debounced quality restore:
- 200ms after last `endInteraction()` brings counter to 0, set qualityFactor = 1.0, scheduleRender with full viewport.
- Abort pending upgrade if `beginInteraction()` called during debounce window.

### Config Constants (in `RenderConfig.ts`)

```typescript
INTERACTION_QUALITY_FACTOR = 0.5
INTERACTION_DEBOUNCE_MS = 200
```

### Key Notes

- **Pan does NOT trigger re-render** — panning only calls `updateCanvasPosition()` (CSS transform), not `scheduleRender()`. Quality tiering only matters for zoom and scrub.
- **Reference counting prevents premature restore** — overlapping wheel zoom + timeline scrub both increment counter; quality restores only when ALL interactions end.
- **No canvas resize during interaction** — only `gl.viewport` changes. Fast and flicker-free.

---

## Phase 3: GL Mipmaps (Independent, Can Parallelize with Phase 2)

Currently `updateTexture()` at `Renderer.ts:458` sets `TEXTURE_MIN_FILTER = LINEAR`. No mipmaps anywhere in the codebase.

### Changes in `Renderer.ts`

1. **IPImage (HDR) path — RGBA only** — after `texImage2D` at line 524-534:
   - `gl.generateMipmap(gl.TEXTURE_2D)`
   - `gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)`
   - **Guard 1**: Only for `RGBA32F` / `RGBA16F` formats. **Skip for `RGB32F`** — it is NOT color-renderable in WebGL2, and `generateMipmap` will produce `GL_INVALID_OPERATION`.
   - **Guard 2**: Only if `OES_texture_float_linear` AND `EXT_color_buffer_float` are available.
   - **Guard 3**: Skip for VideoFrame sources — `generateMipmap` on RGBA16F costs 2-4ms per frame on mobile GPUs, blows the 16ms frame budget.

2. **SDR still images** in `renderSDRFrame()`:
   - Generate mipmaps for `HTMLImageElement` sources only
   - Skip for `HTMLVideoElement` (texture changes every frame)
   - Skip for `HTMLCanvasElement` from frame cache
   - Track whether current SDR texture has mipmaps via a flag

### When Mipmaps Help

8K source displayed at 1000px — GPU samples mip level 3 (~960px) instead of skipping 7 out of 8 texels. Better quality AND faster.

### Cost

~33% extra VRAM for mip chain. Acceptable for still images, wasteful for video.

### Gotchas

- **`RGB32F` not supported** — 3-channel float images (common in EXR) use `RGB32F` (`Renderer.ts:553-568`). `generateMipmap` will fail. Must check channel count before generating mipmaps, or convert 3-channel to 4-channel RGBA before upload.
- **Non-power-of-two textures**: WebGL2 supports mipmaps on NPOT textures (unlike WebGL1). No issue.
- **VideoFrame mipmap cost**: 2-4ms for 4K RGBA16F on mobile GPUs. Always skip for video/VideoFrame sources.

---

## Phase 4: Cache-Level Resize (During Frame Extraction)

### The Problem

The entire extraction pipeline is resolution-unaware:

```
Timeline Scrub
  -> VideoSourceNode.getFrameAsync(frame)
    -> FramePreloadManager.getFrame(frame)        cache key: frame number only
      -> MediabunnyFrameExtractor.getFrame(frame)
        -> CanvasSink(videoTrack.displayWidth/Height)   always source resolution
          -> createImageBitmap(canvas)                   always source resolution
            -> ImageBitmap cached in LRU(100)            immutable resolution
```

A 4K video with 100 cached frames = ~3.3 GB of ImageBitmaps. If the display only shows 1000x600, that's 97% wasted memory.

### Resolution Decision Points (Current)

| Component | Resolution | Where Set | Line(s) | Mutable? |
|---|---|---|---|---|
| MediabunnyFrameExtractor | Source native | `videoTrack.displayWidth/Height` | 210-212, 352-354 | No |
| CanvasSink | Source native | FrameExtractor config | 210-212 | No |
| ImageBitmap (snapshot) | Source native | `createImageBitmap(source)` | 78-79 | No |
| FramePreloadManager cache | Source native | Frame loader | 262-273 | No |
| PrerenderBufferManager | Source native | rawFrame dimensions | 707-714 | No |
| Effects processing | Source native | Canvas created at source dims | 725, 738 | No |
| FrameInterpolator | Source native | Both input frames | 54-56 | No |
| **Renderer canvas** | **Display** | `renderer.resize(w, h)` | 279-283 | **Yes** |
| **WebGL viewport** | Display | `gl.viewport(0,0,w,h)` | 284 | **Yes** |

### Injection Point: `createImageBitmap()` resize

`createImageBitmap()` accepts `resizeWidth`/`resizeHeight` — a GPU-accelerated downscale at snapshot time.

**Where:** `MediabunnyFrameExtractor.ts:78` (the `snapshotCanvas` helper)

```typescript
// Current:
createImageBitmap(canvas)

// Proposed:
createImageBitmap(canvas, {
  resizeWidth: targetWidth,
  resizeHeight: targetHeight,
  resizeQuality: 'high'  // lanczos-like in Chrome; ignored in Safari
})
```

**Pros:** Low CPU cost (GPU-accelerated in Chrome), single-line change, standard Web API.
**Cons:** Still decodes at full res internally. Firefox uses CPU-based resize. Safari ignores `resizeQuality`.

**Cache impact:** 100 frames at 1000x600 = ~240 MB instead of 3.3 GB.

### Revised Cache Strategy: Lazy Single-Entry Upgrade

> **Review finding**: Multi-resolution cache (Option C) doubles memory during transitions and needs complex byte-based eviction. A simpler approach: single cache entry per frame, upgraded lazily.

```
During interaction (qualityFactor = 0.5):
  1. Extract frame at proxy resolution → store in cache (key: frame number)
  2. Frame.resolution = {w: 1000, h: 600}

On interaction end:
  3. Iterate visible cached frames
  4. Re-extract at full display resolution
  5. REPLACE cache entry (not duplicate)
  6. Frame.resolution = {w: 2000, h: 1200}
```

**Benefits:**
- Cache stays O(n) entries, not O(2n)
- No byte-based eviction needed
- No cache key string concatenation overhead
- Stale proxy frames display immediately; upgrade happens in background

### Cache Entry Change

```typescript
// Current FrameResult:
{ canvas: ImageBitmap, width: number, height: number }

// Proposed:
{ canvas: ImageBitmap, width: number, height: number, resolution: { w: number, h: number } }
```

The `resolution` field lets the cache determine if a frame needs upgrading on quality restore.

### Threading Display Resolution Back Through the Chain

| Component | Change | File:Line |
|---|---|---|
| `Viewer.renderImage()` | Pass `{physicalWidth, physicalHeight}` to frame retrieval | `Viewer.ts:~1050` |
| `VideoSourceNode.getFrameAsync()` | Accept optional `targetSize?: {w,h}` | `VideoSourceNode.ts:428` |
| `FramePreloadManager.getFrame()` | Accept `targetSize`, check if cached resolution is sufficient | `FramePreloadManager.ts:176` |
| `FramePreloadManager.loader()` | Forward `targetSize` to extractor | `FramePreloadManager.ts:259` |
| `MediabunnyFrameExtractor.getFrame()` | Accept `targetSize`, use in `createImageBitmap()` | `MediabunnyFrameExtractor.ts:421` |

### Extractor Snapshot Cache Fix

> **Review finding**: The extractor's internal 3-entry snapshot cache (`MediabunnyFrameExtractor.ts:109-112`) is keyed by timestamp, not resolution. After adding target resolution to `createImageBitmap`, a cached snapshot at one resolution would be returned for a different resolution request.

**Fix**: Either invalidate the snapshot cache when target resolution changes, or include resolution in the snapshot cache key.

### Edge Cases

1. **Zoom-in beyond 1:1** — When zoomed in, `physicalWidth > sourceWidth`. Cap at source resolution (never upscale during extraction).
2. **Resolution change during playback** — Cached frames at old resolution. Serve stale + re-extract in background. GPU scales the mismatch.
3. **Export** — Must extract at source resolution. Export path should bypass the proxy.
4. **Pixel probe** — GL path reads from source texture (`readPixelFloat`), not cached frame. Unaffected.
5. **Frame interpolation** — `blendFrames()` requires both frames at same resolution. Must ensure both frames in a blend pair use the same target size.
6. **Abort in-flight upgrades on interaction resume** — If debounce fires a quality upgrade but user resumes interaction, cancel pending high-res extractions to avoid wasted work.

### Browser Compatibility Notes

- **Chrome 52+**: `createImageBitmap` resize is GPU-accelerated. `resizeQuality: 'high'` supported.
- **Firefox 63+**: `createImageBitmap` resize supported but CPU-based in older versions.
- **Safari 15.4+**: `createImageBitmap` resize supported. `resizeQuality` ignored (always bilinear).
- **Fallback**: If resize options not supported, skip resize and cache at source resolution (current behavior).

---

## Dependency Graph

```
Phase 1 (DPI canvas)  ──┐
                         ├──> Phase 2 (interaction quality) — SHIP TOGETHER
Phase 3 (mipmaps)     ──> independent
Phase 4 (cache resize) ──> depends on Phase 1 for physicalWidth/Height
```

## Risk Assessment

- **Phase 1** — medium risk (reduced from high): GL-only DPR scaling limits blast radius. 2D canvas path untouched.
- **Phase 2** — medium risk: viewport subrect approach is simpler than canvas resize. Reference counting adds complexity.
- **Phase 3** — lowest risk: contained in `Renderer.ts`. Must guard against `RGB32F` and VideoFrame sources.
- **Phase 4** — medium risk: changes cache semantics. Lazy upgrade is simpler than multi-resolution cache.

## Anticipated Issues

1. **OffscreenCanvas worker path** — Can't set `canvas.style` after `transferControlToOffscreen()`. Must set CSS on a wrapper div instead. (`ViewerGLRenderer.ts:126-127`)
2. **DPR changes mid-session** — User drags window between retina and external display. Need `matchMedia('(resolution)')` listener to recompute physical dims.
3. **Pixel sampling at DPR != 1** — GL `readPixelFloat` operates in physical pixels. Probe coordinates must be scaled by DPR. (`PixelSamplingManager.ts:114-117`)
4. **`RGB32F` mipmap failure** — 3-channel float textures are not color-renderable. `generateMipmap` will fail. Must check format before attempting. (`Renderer.ts:553-568`)
5. **Export path correctness** — `ViewerExport.ts` creates canvases at specific sizes. Must not accidentally export at DPR-scaled resolution.
6. **Zero-dimension guard** — `effectiveDPR * logicalDim` could round to 0 for very small viewports. Apply `Math.max(1, Math.round(...))`.
7. **Prerender buffer dimension mismatch** — With Phase 1 alone, prerender buffer still creates canvases at source resolution. `drawImage` will silently scale — acceptable but should be documented.
8. **Wipe/split-screen dimension confusion** — Wipe line position uses `displayWidth`/`displayHeight`. Since those stay logical and 2D canvas stays logical, no issue. But if GL path is used for wipe, coordinates need physical scaling.
9. **CSS `filter` blur change** — `blur(5px)` in CSS is 5 CSS pixels = 10 physical pixels at 2x DPR. Visual effect is slightly stronger. Accepted.

---

## Testing Requirements

### Existing Test Coverage (Gaps Identified)

| Test File | What's Covered | What's Missing |
|---|---|---|
| `HiDPICanvas.test.ts` (643 lines) | DPR utilities at 1, 1.5, 2, 3. **Strongest existing base.** | N/A — good coverage |
| `Viewer.render.test.ts` (1205 lines) | SDR WebGL flags, prerender buffer | No `setCanvasSize` tests, no physical/logical split |
| `ViewerGLRenderer.test.ts` (261 lines) | Constructor, getters, delegation | No `resizeIfActive`, no dimension comparison, no CSS style |
| `ViewerRenderingUtils.test.ts` (954 lines) | `calculateDisplayDimensions` thoroughly | No DPR-awareness in dimension calc |
| `ViewerInteraction.test.ts` (587 lines) | `getCanvasPoint`, coordinate conversion | No DPR > 1 scenarios |
| `ViewerExport.test.ts` (698 lines) | Export at source resolution | No explicit DPR isolation test |
| `PixelSamplingManager.test.ts` | Constructor, cursor color | No coordinate scaling at DPR > 1, no `canvas.width` physical test |
| `TransformManager.test.ts` | Pan, zoom | No quality tiering, no debounce |
| `MediabunnyFrameExtractor.test.ts` | CanvasSink options, frame/timestamp | No `createImageBitmap` resize params |
| `FramePreloadManager.test.ts` | getFrame, hasFrame, cache | No resolution-aware cache keys |
| `Renderer.test.ts` | HDR output mode | No `resize()`, no `generateMipmap`, no `updateTexture` |

### New Tests Required Per Phase

**Phase 1:**
- `setCanvasSize` at DPR 1, 1.5, 2, 3: verify GL canvas physical, 2D canvas logical
- Dimension contract: `glCanvas.width === Math.round(displayWidth * dpr)`
- GL canvas CSS style: `glCanvas.style.width === "${displayWidth}px"`
- `readPixelFloat` coordinate scaling at DPR 2
- Export at DPR 2: verify output === source dimensions
- `matchMedia` DPR change listener
- Physical dimension cap at MAX_TEXTURE_SIZE

**Phase 2:**
- `InteractionQualityManager`: qualityFactor default 1.0
- Reference counting: begin/end from multiple sources
- Debounce: quality NOT restored before 200ms (use `vi.useFakeTimers`)
- Abort debounce on new interaction
- GL viewport subrect at reduced quality

**Phase 3:**
- `generateMipmap` called for RGBA32F still images
- `generateMipmap` NOT called for RGB32F
- `generateMipmap` NOT called for VideoFrame sources
- `generateMipmap` NOT called for HTMLVideoElement
- Fallback to LINEAR when extensions unavailable

**Phase 4:**
- `createImageBitmap` called with `resizeWidth`/`resizeHeight`
- Target size capped at source resolution
- Lazy upgrade: cache entry replaced on quality restore
- Extractor snapshot cache invalidation on resolution change
- Frame interpolation: both frames same target size
- Capability check: fallback when resize options unsupported

### Mocking Strategy

```typescript
// Shared DPR helper (extract from HiDPICanvas.test.ts)
const setDevicePixelRatio = (value: number) => {
  Object.defineProperty(window, 'devicePixelRatio', {
    value, writable: true, configurable: true,
  });
};

// createImageBitmap mock
vi.stubGlobal('createImageBitmap', vi.fn());

// GL mock: add generateMipmap to existing createMockGL
// matchMedia mock for DPR change listener
```

---

## Critical Files Summary

| File | Purpose |
|---|---|
| `src/ui/components/Viewer.ts` | Core rendering loop, canvas sizing, dimension state |
| `src/ui/components/ViewerGLRenderer.ts` | GL canvas sizing, HDR/SDR render paths, OffscreenCanvas worker |
| `src/render/Renderer.ts` | Texture upload, mipmaps, viewport, readPixelFloat |
| `src/ui/components/ViewerInputHandler.ts` | Interaction events, quality toggling |
| `src/ui/components/PixelSamplingManager.ts` | Pixel probe coordinate scaling — highest regression risk |
| `src/ui/components/ViewerRenderingUtils.ts` | `calculateDisplayDimensions()` |
| `src/ui/components/TransformManager.ts` | Smooth zoom animation |
| `src/ui/components/Timeline.ts` | Scrub events |
| `src/utils/media/MediabunnyFrameExtractor.ts` | Frame extraction, `createImageBitmap()`, snapshot cache |
| `src/utils/media/FramePreloadManager.ts` | Frame cache, preload strategy |
| `src/nodes/sources/VideoSourceNode.ts` | Preload manager init, frame retrieval |
| `src/utils/effects/PrerenderBufferManager.ts` | Effects cache |
| `src/config/RenderConfig.ts` | Constants |
| `src/utils/ui/HiDPICanvas.ts` | DPI utilities |
