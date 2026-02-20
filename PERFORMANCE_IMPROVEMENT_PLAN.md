# Performance Improvement Plan: OpenRV-Web

## Executive Summary

This document outlines performance, rendering, and UX improvements for the OpenRV-Web application. Based on a deep architectural review of the WebGL rendering pipeline (`Renderer`, `ViewerGLRenderer`), the DOM UI (`Viewer`, `Timeline`), shader compilation, and memory allocation patterns, several bottlenecks have been identified.

Addressing these issues will improve playback frame rates, reduce main-thread jank during scrubbing, lower GPU memory bandwidth for SDR content, and eliminate GC pressure in hot render paths.

> **Note:** The media loading pipeline (`SequenceSourceNode`, `SequenceLoader`, `FramePreloadManager`) is already well-optimized — it uses `createImageBitmap()` for background-thread decoding, zero-copy `ImageBitmap` GPU upload, and deterministic `close()` on LRU cache eviction. No changes needed there.

---

## 1. Timeline Repaint Thrashing

**File(s) Affected:** `src/ui/components/Timeline.ts`, `src/ui/components/ThumbnailManager.ts`, `src/audio/WaveformRenderer.ts`

### Current State

The Timeline is a single `<canvas>` element (80px tall, DPR-scaled). The monolithic `draw()` method (lines 408–677, ~270 lines) clears and redraws **everything** from scratch on every invocation:

| Element | Canvas API Calls | Lines |
|---------|-----------------|-------|
| Background fill | `clearRect` + `fillRect` | 419–421 |
| Track (rounded rect) | `roundRect` + `fill` | 436–439 |
| Thumbnails (up to 30) | `save/drawImage/strokeRect/restore` each with `shadowBlur: 2` | 442–444 → ThumbnailManager:352–378 |
| Waveform | Up to 2000 `fillRect` calls from pre-computed peaks | 447–463 → WaveformRenderer:532–592 |
| In/Out range + played portion | Multiple `fillRect` | 472–507 |
| Annotation markers | `beginPath/moveTo/lineTo/fill` per annotated frame | 511–526 |
| Point + duration marks | 1–6 `fillRect` per mark | 529–567 |
| Note overlay bars | `fillRect` per note | 570–575 |
| Playhead (glow arc + line rect + circle arc) | 4 draw calls incl. transparent hit-area `fillRect` | 577–598 |
| Frame numbers + info text | 6 `measureText` + `fillText` | 626–676 |

### The Bottlenecks

**1. No draw coalescing.** There are **19 distinct triggers** that call `draw()` directly (lines 134–154, 165–167, 70, 85, 177, 185, 208, 268, 290, 385, 680). During playback, `frameChanged` fires every rAF tick (24–60 Hz). Multiple events in the same frame (e.g. `frameChanged` + `annotationsChanged`) each independently call `draw()`, causing duplicate full repaints.

**2. `getComputedStyle()` on every draw.** The `getColors()` helper (line 44) calls `getComputedStyle(document.documentElement)` and reads 8+ CSS custom properties on **every** `draw()` invocation. This forces a synchronous style recalculation 24–60 times/second during playback.

**3. Full canvas redraw for playhead-only changes.** During playback, only the playhead position changes frame-to-frame, but the entire canvas (thumbnails with shadow blur, waveform bars, marks, text) is redrawn.

**4. Waveform re-rendered from peaks every frame.** `WaveformRenderer.renderWaveformRegion()` iterates up to 2000 peak entries calling `fillRect()` each, with no pre-rendered bitmap cache.

**5. Thumbnail shadow blur per draw.** Each of up to 30 thumbnails uses `ctx.shadowBlur = 2` inside `save/restore`, forcing a Gaussian blur on every `drawImage()` call per frame.

**6. Thumbnail loading triggers individual redraws.** Each loaded thumbnail fires `onThumbnailReady` → `draw()`, potentially causing 30 separate full redraws as thumbnails load.

### Proposed Changes

1. **rAF coalescing.** Replace all direct `this.draw()` calls with a `this.scheduleDraw()` that sets a dirty flag and requests a single `requestAnimationFrame`. Multiple events in the same frame produce only one `draw()`.

2. **Cache CSS colors.** Read `getComputedStyle` once, cache the result, and refresh only on `themeChanged` (the handler already exists at line 85).

3. **Layer separation — DOM playhead.** Extract the playhead (glow + line + circle) to a lightweight absolute-positioned DOM element moving via CSS `transform: translateX(...)`. During playback, only update the `transform` — the browser compositor handles the move with zero canvas repaints.

4. **Pre-render static layers.** Cache the waveform and thumbnail strip to offscreen canvases. Re-render them only when the source, zoom level, or thumbnails change — not on every frame advance.

5. **Remove transparent hit-area fillRect** (line 582–583). This `rgba(0,0,0,0)` fillRect produces no visible output. Use pointer coordinate math for hit testing instead.

---

## 2. Viewer Compositing Overhead & Layer Stacking

**File(s) Affected:** `src/ui/components/Viewer.ts`, `src/ui/components/ViewerGLRenderer.ts`, `src/ui/components/WatermarkOverlay.ts`, `src/paint/PaintRenderer.ts`, `src/ui/components/CanvasOverlay.ts`

### Current State

The Viewer's `canvasContainer` (positioned via CSS `transform: translate(...)`) stacks up to **14 canvas/div elements** in DOM order:

| # | Layer | Alpha | CSS | Purpose |
|---|-------|-------|-----|---------|
| 1 | `imageCanvas` | `false` | `display:block; background:#000` | 2D SDR rendering, CPU pixel effects |
| 2 | `glCanvas` | `false` | `position:absolute; display:none/block` | WebGL2 HDR + GPU effects |
| 3 | WebGPU blit canvas (on demand) | opaque | `position:absolute; display:none/block` | HDR display via WebGPU |
| 4 | Canvas2D blit canvas (on demand) | `true` | `position:absolute; display:none/block` | HDR fallback via Canvas2D |
| 5 | `watermarkCanvas` | **`true`** | `position:absolute; pointer-events:none` | Watermark overlay |
| 6 | `paintCanvas` | **`true`** | `position:absolute; pointer-events:none` | Annotations/paint strokes |
| 7 | Perspective grid canvas | `true` | `position:absolute; pointer-events:none` | Perspective correction guides |
| 8 | Crop overlay canvas | `true` | `position:absolute; pointer-events:none` | Crop region visualization |
| 9–14 | CanvasOverlay subclasses | `true` | `position:absolute; z-index:40–55` | Safe areas, matte, spotlight, bug, EXR window, reference |

### The Bottlenecks

**1. CSS `transform` on container promotes entire subtree.** The `canvasContainer.style.transform = translate(...)` (line 1148) promotes all child canvases into a single compositor layer. Every visible canvas must be alpha-blended together on every frame.

**2. Watermark redrawn every frame.** Both the overlay canvas path (`renderWatermarkOverlayCanvas()` at line 2158) and the inline 2D path (line 1908) redraw the watermark on every `render()` call, even when the watermark image hasn't changed.

**3. Paint canvas cleared every frame.** `renderPaint()` (lines 2117–2152) clears the paint canvas on every render, even when there are no annotations. The early return at line 2135 skips stroke rendering but the clear still runs.

**4. Paint canvas is oversized.** The paint canvas extends 128px+ beyond image bounds on all sides (`MIN_PAINT_OVERDRAW_PX = 128`, lines 797–852) for off-canvas annotation support, making it significantly larger than the image — more pixels to composite.

**5. Multiple `alpha:true` overlay canvases.** Watermark, paint, crop, and all CanvasOverlay subclasses default to `alpha:true`, requiring per-pixel alpha blending for each layer even when empty.

### Proposed Changes

1. **Dirty-flag watermark rendering.** Only redraw the watermark canvas when the watermark image, position, opacity, or canvas dimensions change. Skip the clear+draw when nothing changed.

2. **Skip paint canvas clear when empty.** If there are no annotations and no active paint tool, skip the `clearRect` entirely. Track a `paintDirty` flag.

3. **Flatten overlays into WebGL pass (long-term).** Move the watermark into a WebGL texture composited in the fragment shader during the main image pass. This eliminates one full-viewport alpha-blended canvas layer.

4. **Lazy-create overlay canvases.** Many overlays (perspective grid, crop, safe areas, spotlight, bug, EXR window) are rarely active. Create their canvases on demand rather than at construction time.

5. **Consider `display:none` for inactive overlays.** Canvases with `display:none` are excluded from compositing entirely. Ensure inactive overlays are hidden, not just empty.

---

## 3. Scope FBO Format Negotiation

**File(s) Affected:** `src/render/Renderer.ts` (FBO management)

### Current State

The renderer creates FBOs with fixed `RGBA16F` internal format regardless of source content:

| FBO | Internal Format | Size | VRAM Cost (4K) |
|-----|----------------|------|----------------|
| `hdrFBO` (HDR blit readback) | `RGBA16F` | Display resolution | 63.3 MB |
| `scopeFBO` (scope analysis) | `RGBA16F` | 320×180 or 640×360 | 1.8 MB |
| `LuminanceAnalyzer` FBO | `RGBA16F` | 256×256 | 0.5 MB |
| `hdrPBO` pair (double-buffered) | `Float32` readback | Display resolution | 253.1 MB |
| `scopePBO` pair | `Float32` readback | Scope resolution | 7.0 MB |

The PBO readback uses `gl.FLOAT` (32-bit/channel) from `RGBA16F` (16-bit/channel) FBOs, doubling the transfer bandwidth. At 4K with HDR + scopes + auto-exposure, **total GPU allocation reaches ~496 MB**.

### The Bottleneck

For SDR content (8-bit JPEG/PNG sequences, SDR video), all the following resources are unnecessarily half-float:
- `scopeFBO` (`RGBA16F`) — could be `RGBA8` for SDR
- `scopePBOs` (`Float32` readback) — could be `UNSIGNED_BYTE` for SDR
- `scopePBOCachedPixels` (`Float32Array`) — could be `Uint8Array` for SDR

The `hdrFBO` is already correctly gated — it only activates when the WebGPU/Canvas2D blit path is active (HDR content only). The deinterlace, film emulation, and LUT passes all execute within the single-pass fragment shader and do **not** use separate FBOs.

Note: The `renderForScopes()` method currently forces `hdrOutputMode = 'hlg'` (line 1230) to prevent shader clamping, even for SDR content. This would need adjustment for the SDR scope path.

### Proposed Changes

1. **Conditional scope FBO format.** Check `image.dataType` and `image.metadata.transferFunction` before creating/recreating the scope FBO. For SDR content (uint8, no transfer function), use `RGBA8` + `UNSIGNED_BYTE` readback. For HDR, keep `RGBA16F` + `FLOAT`.

2. **Recreate scope FBO on HDR↔SDR transitions.** Track the current format and recreate only when the source type changes (not every frame).

3. **Scope shader output mode.** For SDR scope readback, allow the shader to output in `[0,1]` sRGB range instead of forcing HLG mode.

---

## 4. Shader Compilation Blocking

**File(s) Affected:** `src/scopes/WebGLScopes.ts`, `src/color/WebGLLUT.ts`, `src/color/pipeline/GPULUTChain.ts`, `src/filters/WebGLNoiseReduction.ts`, `src/filters/WebGLSharpen.ts`

### Current State

The main display shader in `Renderer.ts` correctly uses `KHR_parallel_shader_compile` via the `ShaderProgram` class (non-blocking poll-based compilation with 4ms interval). However, **5 additional shader compilation sites** compile synchronously:

| Module | File:Line | Programs | Shaders |
|--------|-----------|----------|---------|
| WebGLScopes (histogram, waveform, vectorscope) | `WebGLScopes.ts:362–364` | 3 | 6 |
| WebGLLUT | `WebGLLUT.ts:374–391` | 1 | 2 |
| GPULUTChain | `GPULUTChain.ts:179–180` | 1 | 2 |
| WebGLNoiseReduction | `WebGLNoiseReduction.ts:163–164` | 1 | 2 |
| WebGLSharpen | `WebGLSharpen.ts:102–103` | 1 | 2 |
| **Total** | | **7** | **14** |

### The Bottleneck

All 7 programs (14 shaders) compile synchronously on the main thread. `WebGLScopes` is initialized eagerly via `getSharedScopesProcessor()`, so its 3 programs block during app startup. Combined, this can stall the main thread for **100–300ms** depending on GPU driver complexity.

None of these sites cache compiled programs — each new WebGL context gets fresh compilations.

### Proposed Changes

1. **Extend `ShaderProgram` usage.** Refactor these 5 modules to use the existing `ShaderProgram` class (or at least call `gl.getExtension('KHR_parallel_shader_compile')` and poll `COMPLETION_STATUS_KHR` before calling `getProgramParameter(LINK_STATUS)`).

2. **Defer scope shader compilation.** Don't compile WebGLScopes programs until the scopes panel is first opened.

3. **Defer filter shader compilation.** Compile WebGLNoiseReduction and WebGLSharpen programs lazily on first use rather than at construction time.

---

## 5. GC Pressure in Hot Render Paths

**File(s) Affected:** `src/render/Renderer.ts`, `src/render/ShaderProgram.ts`, `src/render/ShaderStateManager.ts`, `src/color/HueRotation.ts`, `src/ui/components/Viewer.ts`

### Current State

Several hot paths allocate temporary objects on every frame, creating GC pressure during continuous playback.

### 5.1 Per-Pixel Tuple Allocation in Hue Rotation (2D Path)

**File:** `src/color/HueRotation.ts:113–124`, called from `Viewer.ts:2770`

`applyHueRotation()` returns a `[number, number, number]` tuple per pixel call. For 1920×1080, that's **2,073,600 short-lived array allocations per frame**.

**Proposed Fix:** Refactor to write into a pre-allocated 3-element output buffer, or use `applyHueRotationToImageData()` that processes the entire ImageData in-place without per-pixel allocations.

### 5.2 Per-Frame TextureCallbacks Object

**File:** `src/render/Renderer.ts:537–570`

Every `renderImage()` call creates a new object with 6 closure properties via `createTextureCallbacks()` (line 462). At 60fps, that's 60 throwaway objects/sec.

**Proposed Fix:** Pre-allocate the `TextureCallbacks` object once and reuse it. The closures capture `this` and don't change.

### 5.3 Per-Frame Uniform Array + Float32Array Allocations

**File:** `src/render/ShaderProgram.ts:260`, `src/render/Renderer.ts:414–415`

`setUniform('u_offset', [offsetX, offsetY])` creates a temporary `[number, number]` array AND a `new Float32Array(value)` on every call. At minimum, `u_offset` and `u_scale` are set every frame.

**Proposed Fix:** Use pre-allocated `Float32Array` buffers for frequently-set uniforms. The `resolutionBuffer` pattern at `ShaderStateManager.ts:525` already demonstrates this approach.

### 5.4 RGB-to-RGBA Padding Buffer Not Pooled

**File:** `src/render/Renderer.ts:835`

For 3-channel float images (RGB EXR), a new `Float32Array(pixelCount * 4)` is allocated on every frame where `textureNeedsUpdate` is true. At 4K, that's **133 MB per allocation**. For image sequences, this triggers on every frame change.

**Proposed Fix:** Pool this buffer (like `lut3DRGBABuffer` and `inlineLUTDeinterleavedBuffer` are already pooled at lines 94–97). Reallocate only when dimensions change.

### 5.5 ShaderStateManager Tuple Allocations

**File:** `src/render/ShaderStateManager.ts:1372–1395`

When `DIRTY_COLOR` is set, temporary tuples are created for `safeGammaRGB`, `safeExposureRGB`, `conRGB`, etc. This fires on every mouse move during interactive color grading.

**Proposed Fix:** Pre-allocate reusable `Float32Array(3)` buffers for these intermediate values.

---

## 6. Thumbnail Rendering Efficiency

**File(s) Affected:** `src/ui/components/ThumbnailManager.ts`

### Current State

ThumbnailManager maintains an LRU cache of 150 `HTMLCanvasElement` entries with a concurrency limit of 2.

### 6.1 Double Canvas Draw (OffscreenCanvas Path)

**Lines 287–313:** When `OffscreenCanvas` is available, the code:
1. Creates an `OffscreenCanvas` and draws the image onto it
2. Creates a regular `HTMLCanvasElement`
3. Copies from the OffscreenCanvas to the regular canvas
4. Stores the regular canvas

This defeats the purpose of OffscreenCanvas — the thumbnail is drawn twice.

**Proposed Fix:** Store the `OffscreenCanvas` directly in the cache. `ctx.drawImage()` already accepts `OffscreenCanvas` as a source.

### 6.2 No Canvas Element Pooling

Each `loadThumbnail()` call (lines 245–246) creates a new `HTMLCanvasElement` via `document.createElement('canvas')`. For 30 thumbnails per source, that's 30 DOM node allocations.

**Proposed Fix:** Pool and reuse canvas elements when thumbnails are evicted from the LRU cache.

---

## 7. Audio Waveform Extraction

**File(s) Affected:** `src/audio/WaveformRenderer.ts`

### Current State

`extractAudioFromVideo()` (lines 107–220) performs a full `fetch()` of the video file, then `decodeAudioData()` on the entire ArrayBuffer. The peaks data is computed once and cached.

### The Bottleneck

For a large video file, this re-downloads the entire file just for waveform extraction, even if the browser already has it cached from video playback. The `fetch()` at line 139 uses `mode: 'cors'` but no `cache` property.

### Proposed Changes

1. **Add `cache: 'force-cache'`** to the fetch call to leverage the browser's HTTP cache.
2. **Consider incremental extraction** via the `mediabunny` fallback path (line 287, `extractAudioWithMediabunny`) which works from a Blob already in memory.

---

## 8. TextureCacheManager LRU Eviction

**File(s) Affected:** `src/render/TextureCacheManager.ts`

### Current State

`evictLRU()` (lines 398–412) iterates **all** cache entries to find the one with the lowest `accessCounter`. This is O(n) per eviction, while the main `LRUCache` class (`src/utils/LRUCache.ts`) correctly uses Map insertion-order for O(1) eviction.

### Proposed Fix

Replace the `accessCounter` linear scan with Map insertion-order tracking (move-to-end on access, evict from front), matching the pattern in `LRUCache`.

---

## 9. Verification & Testing Strategy

### Existing Test Infrastructure

- **Unit tests:** Vitest with jsdom, 390 files, 7600+ tests
- **E2E tests:** Playwright, 124 spec files, `window.__OPENRV_TEST__` state bridge
- **WebGL mocking:** Comprehensive mock factories in `test/mocks.ts` (`createMockRendererGL`, `createMockWebGL2Context`)
- **Canvas mocking:** Full 2D context mock in `test/setup.ts`
- **Worker testing:** `__test__` internal exports + `MockWorker` proxy classes
- **Performance tests:** Ad-hoc `performance.now()` checks in 10 files (no framework, no CI gate)
- **Visual regression:** `toHaveScreenshot` configured in Playwright but unused; E2E uses crude Buffer equality

### 9.1 Timeline Performance Tests (Vitest)

- **Action:** Add a unit test for `Timeline.draw()` execution time.
- **Setup:** Mock canvas context, create a Timeline with 30 thumbnails + waveform + 10 marks.
- **Assertion:** Verify `draw()` completes in < 2ms (mocked canvas). After the rAF coalescing change, verify that 5 synchronous `scheduleDraw()` calls result in exactly 1 `draw()` invocation.
- **Assertion 2:** Verify `getComputedStyle()` is called 0 times during `draw()` (CSS colors are cached).

### 9.2 Flame Graph / Performance Profiling (Manual)

- **Action:** Record 10 seconds of playback in Chrome DevTools Performance tab.
- **Assertion:** Verify `Timeline.draw()` execution time is < 1ms per frame during continuous playback (playhead-only update path).
- **Assertion 2:** Verify no synchronous shader compilation (`compileShader` + `linkProgram` in sequence) appears after initial load.

### 9.3 GC Pressure Tests (Vitest)

- **Action:** Write a benchmark test for the hue rotation hot path.
- **Setup:** Create a 1920×1080 ImageData, apply hue rotation.
- **Assertion:** After the refactor, verify zero array allocations inside the pixel loop (test that the function writes to a provided output buffer instead of returning a tuple).

### 9.4 FBO Format Tests (Vitest)

- **Action:** Extend `Renderer.test.ts` to verify conditional scope FBO format.
- **Setup:** Use `createMockRendererGL()` from `test/mocks.ts`.
- **Assertion:** When rendering an SDR `IPImage` (uint8, no transfer function), verify `texImage2D` for the scope FBO is called with `gl.RGBA8` / `gl.UNSIGNED_BYTE`. When rendering an HDR `IPImage` (float32 or with `transferFunction: 'hlg'`), verify `gl.RGBA16F` / `gl.FLOAT`.

### 9.5 Visual Regression Tests (Playwright)

- **Action:** If watermark/paint layers are flattened into WebGL, add a pixel-match E2E test.
- **Setup:** Load a sample image with watermark enabled and a paint annotation.
- **Assertion:** Capture a screenshot and compare against a stored baseline using Playwright's `toHaveScreenshot()` (already configured with `maxDiffPixelRatio: 0.01`).

### 9.6 Shader Compilation Timing (Playwright)

- **Action:** Add an E2E smoke test that measures time from navigation to first rendered frame.
- **Setup:** Use `window.__OPENRV_TEST__` bridge to detect first frame render.
- **Assertion:** With deferred shader compilation, first render should complete within a defined budget. Verify scopes shader compilation does not occur until the scopes panel is opened.
