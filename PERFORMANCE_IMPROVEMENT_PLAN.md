# Performance Improvement Plan: OpenRV-Web

## Executive Summary
This document outlines critical performance, VFX, and UX improvements for the OpenRV-Web application. Based on a deep architectural review of the WebGL rendering pipeline (`ViewerGLRenderer`, `Renderer`), media loading (`SequenceSourceNode`, `SequenceLoader`), and the DOM UI (`Viewer`, `Timeline`), several major bottlenecks have been identified. 

Addressing these issues will significantly improve playback frame rates, reduce VRAM leaks, and eliminate main-thread jank during scrubbing and high-resolution sequence playback.

---

## 1. Media Loading & WebGL Pipeline Bottlenecks

### 1.1 `SequenceSourceNode` CPU Sync-Lock (Main Thread Jank)
**File(s) Affected:** `src/nodes/sources/SequenceSourceNode.ts`, `src/utils/media/SequenceLoader.ts`, `src/core/image/Image.ts`
**Current State:** 
- `SequenceLoader` decodes images into `HTMLImageElement` objects. 
- `SequenceSourceNode.process()` draws the `HTMLImageElement` to an offscreen 2D canvas and calls `getImageData()` to extract `Uint8Array` pixels.
- The `Uint8Array` is passed to `IPImage` and eventually uploaded to WebGL by `ViewerGLRenderer`.
**The Bottleneck:** 
- `HTMLImageElement` decodes synchronously on the main thread when first drawn. 
- `getImageData()` forces a synchronous CPU readback of the decoded pixels, severely stalling the main thread (10-30ms per frame for 4K images).
- This completely bypasses the asynchronous `RenderWorkerProxy` WebGL upload path.
**Proposed Architecture Change:**
1. **Background Decoding:** Refactor `SequenceLoader` to use `createImageBitmap()` (which decodes entirely on a background worker thread) instead of `new Image()`.
2. **Zero-Copy GPU Upload:** Extend `IPImage` to support an `imageBitmap: ImageBitmap | null` property (similar to how it currently handles `videoFrame`). 
3. **Direct texture upload:** Refactor `SequenceSourceNode` to pass the `ImageBitmap` directly inside the `IPImage` without using a 2D canvas. Update `Renderer.ts` to consume the `ImageBitmap` directly in `gl.texImage2D`.

### 1.2 VRAM Leaks in Frame Eviction
**File(s) Affected:** `src/utils/media/FramePreloadManager.ts`, `src/core/image/Image.ts`
**Current State:** `FramePreloadManager` uses an LRU cache to evict old frames when the cache size limit is reached.
**The Bottleneck (Memory Leak):** `VideoFrame` (and `ImageBitmap`) objects are backed by explicit GPU memory. JavaScript GC does not immediately reclaim GPU memory when the JS object drops out of scope. If `IPImage.close()` is not deterministically called upon cache eviction, the application will rapidly exhaust VRAM during high-speed scrubbing of HDR video or high-res ImageBitmaps.
**Proposed Architecture Change:**
- Hook into the LRU cache eviction lifecycle in `FramePreloadManager.ts`. 
- Explicitly invoke `evictedFrame.close()` immediately when it drops from the cache. Ensure `IPImage.close()` also attempts to close its `ImageBitmap` if one exists (e.g. `this.imageBitmap.close()`).

---

## 2. Interaction & UI Workload (DOM/Canvas)

### 2.1 `Timeline` Repaint Thrashing
**File(s) Affected:** `src/ui/components/Timeline.ts`
**Current State:** The Timeline combines the background track, thumbnails, audio waveform, and the moving playhead into a single `<canvas>` element.
**The Bottleneck:** During playback, the playhead moves every single frame (`requestAnimationFrame`). Because everything is on one canvas, the `Timeline` is forced to `ctx.clearRect` and redraw the complex waveform and thumbnails 60 times a second, consuming vast amounts of CPU and causing layout thrashing.
**Proposed Architecture Change:**
- Decouple the playhead from the background track renderer.
- Implement the playhead as a lightweight absolute-positioned DOM element (e.g., `<div class="playhead">`) moving via CSS `transform: translateX(...)`. This offloads the movement to the browser's GPU compositor, reducing Timeline script execution from ~10ms per frame to <1ms.

### 2.2 `Viewer` Compositing Overhead & Layer Stacking
**File(s) Affected:** `src/ui/components/Viewer.ts`, `src/render/ViewerGLRenderer.ts`
**Current State:** The `Viewer` DOM stacks multiple transparent canvases exactly on top of each other: the `ViewerGLRenderer` canvas, the Watermark canvas, and the Paint/Annotation canvas.
**The Bottleneck:** Stacking multiple large (often full-screen) transparent canvases forces the browser compositor to perform expensive alpha-blending across the entire viewport 60 times a second. This destroys battery life and drastically drops FPS on mobile or integrated GPUs.
**Proposed Architecture Change:**
- Flatten the rendering tree. Move the Watermark and Paint layers into offscreen textures within the `ViewerGLRenderer`.
- Have the WebGL fragment shader rapidly composite these overlays natively during the main image pass, leaving the DOM with only a single, opaque `<canvas>` element.

---

## 3. VFX & Shader Optimization

### 3.1 Prerender Buffer / Half-Float Bandwidth
**File(s) Affected:** `src/render/ViewerGLRenderer.ts` / FBO management
**Current State:** WebGL2 post-processing effects (deinterlace, film grain) utilize multiple passes. If the context relies heavily on `OES_texture_half_float` framebuffers (16-bit per channel), it uses 2x the memory bandwidth of standard 8-bit textures.
**The Bottleneck:** Using 16-bit float targets when the source sequence is only 8-bit SDR needlessly consumes memory bandwidth and reduces performance on memory-constrained devices.
**Proposed Architecture Change:**
- Dynamically negotiate the internal format of FBOs based on the source metadata. If the active `IPImage` is HDR/Float32, use `RGBA16F`. If it's standard 8-bit (e.g. JPEG/PNG sequence), downgrade the intermediate Framebuffer objects to `RGBA8`.

---

## 4. Verification & Testing Strategy

To ensure absolute stability and measure the performance gains, use the following robust verification steps after implementing these changes:

### 4.1 Automated VRAM Leak Tests (Playwright)
- **Action:** Write an e2e test that rapidly scrubs a 100-frame 4K sequence back and forth 10 times.
- **Assertion:** Run a Playwright heap snapshot before and after the scrub, or monitor `chrome.gpu` via DevTools protocols. Verify that total JS heap size and GPU memory footprint return to baseline (cache limit) and do not infinitely climb due to dangling `ImageBitmap` or `VideoFrame` instances.

### 4.2 Flame Graph / Performance Profiling
- **Action:** Open Chrome DevTools -> Performance. Record 10 seconds of playback of an EXR image sequence.
- **Assertion:** Verify that `getImageData()` no longer appears on the main thread. Verify that `createImageBitmap()` appears isolated on the background Worker thread sequence.
- **Assertion 2:** Verify the `Timeline.draw()` function execution time dropped to `< 1ms` or disappears entirely during continuous playback without zoom/pan interactions.

### 4.3 Visual Regression Tests
- **Action:** Since the Watermark and Paint layers are migrating from DOM elements to WebGL textures, write a pixel-match test comparing the new unified WebGL canvas output against a snapshot of the old multi-canvas DOM stack.

