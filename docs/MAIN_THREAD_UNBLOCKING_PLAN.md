# Main Thread Unblocking Plan: CPU Effect Processing

## Implementation Status

| Phase | Description | Status | Tests Added |
|-------|-------------|--------|-------------|
| **1A** | SDR-through-WebGL rendering path | **DONE** | 14 Renderer + 26 Viewer tests |
| **1B** | Add missing GPU shader effects | **DONE** | 12 GPU shader effect tests |
| **1C** | Dual-canvas compositing | **DONE** (part of 1A) | — |
| **2A** | Async fallback on cache miss | **DONE** | 7 async fallback tests |
| **2B** | Predictive preloading improvements | **DONE** | 14 prerender buffer tests |
| **2C** | Double-buffering for effects changes | Not started | — |
| **3A** | OffscreenCanvas rendering | **DONE** | 75 e2e + 39 proxy + 20 worker + 32 message tests |
| **3B** | createImageBitmap pipeline | **DONE** (part of 3A) | — |
| **4A-4B** | Chunking/yielding | Not started | — |
| **5A** | LUT-based vibrance (3D LUT) | **DONE** | 7 effect processor tests |
| **5C** | Single-pass effect merging | **DONE** | (included in 5A tests) |
| **5B, 5D, 5E** | SIMD, half-res convolution, WASM | Not started | — |

**Total: 8026 tests passing across 191 test files. TypeScript compiles clean.**

---

## Problem Statement

When color correction effects are applied during video playback, `applyBatchedPixelEffects()` performs heavy per-pixel CPU processing on the main thread. This blocks the main thread, causing:

1. **Large tick deltas in the RAF loop** -- When `renderImage()` takes too long (e.g., 50-200ms for a 1920x1080 frame with multiple effects), the next `requestAnimationFrame` callback fires late, producing a large `delta` in the Session playback loop.
2. **Audio drift exceeds 0.5s threshold** -- The Session's `updatePlayback()` computes drift as `Math.abs(video.currentTime - targetTime)`. When the main thread is blocked, audio continues playing in the browser's media pipeline while frames fall behind, causing drift to exceed the 0.5s resync threshold.
3. **Resync triggers pause/seek/play cycle** -- When drift > 0.5s, Session pauses the video, seeks to the target time, then calls `safeVideoPlay()`. This can error under certain conditions and historically could prevent playback from resuming (now fixed, but the blocking itself remains problematic).
4. **User-perceived stuttering** -- Even without the pause bug, the main thread blocking causes visible frame drops and UI unresponsiveness during playback with effects enabled.

---

## Current Architecture Analysis

### The Main Thread Pipeline (`renderImage()` in `Viewer.ts`)

The rendering pipeline executes synchronously within a single `requestAnimationFrame` callback:

```
scheduleRender() -> RAF -> render() -> renderImage() -> applyBatchedPixelEffects()
```

Key steps in `renderImage()` (lines 1701-2042 of `Viewer.ts`):
1. Get the current frame (from sequence, mediabunny cache, or video element)
2. Calculate display dimensions and uncrop padding
3. **Check prerender cache** -- if playing and cache hit, draw cached frame and return early (fast path)
4. Draw the frame to the 2D canvas via `drawImage()`
5. Apply stereo mode, lens distortion, 3D LUT, OCIO transform
6. **Call `applyBatchedPixelEffects()`** -- the main bottleneck

### What `applyBatchedPixelEffects()` Does (lines 2675-2810)

This function:
1. Calls `ctx.getImageData()` -- reads all pixels from the canvas into an `ImageData` object
2. Applies up to 14 different per-pixel effect passes sequentially:
   - Highlight/Shadow recovery (per-pixel luminance-masked adjustment)
   - Vibrance (HSL conversion per pixel, saturation adjustment, skin protection)
   - Clarity (Gaussian blur + high-pass filter -- **most expensive**, requires 2-pass 5x5 convolution)
   - Hue rotation (matrix multiply per pixel)
   - Color wheels (Lift/Gamma/Gain with zone weighting per pixel)
   - CDL (slope/offset/power per pixel)
   - Color curves (LUT lookup per pixel)
   - HSL Qualifier (RGB->HSL conversion, matte calculation, correction per pixel)
   - Tone mapping (per-pixel tone curve application)
   - Color inversion (per-pixel subtract)
   - Sharpen (3x3 convolution kernel -- second most expensive)
   - Channel isolation (per-pixel channel select)
   - Display color management
   - Diagnostic overlays (false color, luminance visualization, zebra stripes, clipping)
3. Calls `ctx.putImageData()` -- writes all pixels back to the canvas

### Cost Analysis Per Effect (for 1920x1080 = 2,073,600 pixels)

| Effect | Complexity | Est. Time (ms) | Notes |
|--------|-----------|----------------|-------|
| Clarity | O(n * k) where k=5x5 blur | 30-80 | Two-pass separable 5x5 convolution + high-pass blend |
| Sharpen | O(n * 3x3) | 15-40 | 3x3 convolution with buffer copy |
| Vibrance | O(n) with HSL conversion | 10-25 | Per-pixel RGB->HSL->RGB with trig functions |
| HSL Qualifier | O(n) with HSL conversion | 10-25 | Per-pixel RGB->HSL + matte + correction |
| Color Wheels | O(n) with Math.pow | 8-20 | Per-pixel with zone weighting and power functions |
| Hue Rotation | O(n) | 5-15 | Matrix multiply per pixel |
| Highlights/Shadows | O(n) | 5-12 | LUT-accelerated but still per-pixel |
| Tone Mapping | O(n) | 5-12 | Per-pixel with branching |
| CDL | O(n) with Math.pow | 5-12 | Slope/Offset/Power per pixel |
| Color Curves | O(n) | 3-8 | LUT lookup (fast) |
| Channel Isolation | O(n) | 2-5 | Simple per-pixel select |
| Color Inversion | O(n) | 1-3 | Per-pixel subtract |
| getImageData/putImageData | | 5-15 | Canvas pixel readback + writeback |

**Worst case**: With all effects active at 1080p, the total can exceed **100-300ms per frame**, far exceeding the 16.7ms budget for 60fps or even the 33.3ms budget for 30fps.

### Existing Mitigation: Prerender Buffer System

The `PrerenderBufferManager` (`src/utils/PrerenderBufferManager.ts`) already exists to address this:

- **Worker Pool**: Creates `navigator.hardwareConcurrency` (up to 8) Web Workers using the `effectProcessor.worker.ts` module
- **Frame Cache**: LRU cache of up to 100 pre-rendered canvases, keyed by frame number and effects hash
- **Direction-aware preloading**: Preloads 30 frames ahead and 10 frames behind during playback
- **Idle scheduling**: Uses `requestIdleCallback` with 100ms timeout for background work
- **Stale frame fallback**: During playback, returns stale cached frames rather than forcing live re-render

**Why this is insufficient currently:**

1. **Cache misses on the current frame still block** -- When the prerender cache misses (e.g., during scrubbing, after effects change, or at playback start), the code falls through to the live `applyBatchedPixelEffects()` path which is synchronous on the main thread.
2. **The `getImageData()`/`putImageData()` roundtrip is inherently slow** -- Even with cached results, the 2D canvas path requires CPU pixel access.
3. **Prerender uses `drawImage` + `getImageData` on main thread for frame loading** -- `prerenderWithWorker()` still does `tempCtx.drawImage()` and `tempCtx.getImageData()` on the main thread (lines 476-496) before sending data to the worker.
4. **Effects hash invalidation clears all pending work** -- Any effects parameter change cancels all pending requests and (when paused) clears the entire cache, requiring full re-render.
5. **Worker data transfer overhead** -- Full RGBA pixel data is transferred to/from workers via structured clone (with transferable buffers, but still a copy for the result).

### Existing GPU Path (HDR/WebGL Renderer)

The `Renderer` class (`src/render/Renderer.ts`) already implements many effects in a GPU fragment shader for HDR sources:

- Exposure, gamma, saturation, contrast, brightness, temperature, tint
- Hue rotation (matrix uniform)
- CDL (slope/offset/power uniforms)
- Color curves (1D LUT texture)
- Color wheels (Lift/Gamma/Gain)
- Tone mapping (Reinhard/Filmic/ACES)
- Color inversion
- Channel isolation
- False color, zebra stripes
- 3D LUT, display transfer functions, background patterns

**This GPU path is currently only used for HDR file sources** (EXR, etc.) via `renderHDRWithWebGL()`. SDR video/image sources go through the 2D canvas path with CPU effects.

---

## Proposed Strategies

### Strategy 1: Extend GPU Rendering to SDR Sources (Highest Impact)

**Goal**: Route all sources through the WebGL renderer, not just HDR files.

**Rationale**: The fragment shader already implements most of the CPU effects pipeline. For SDR video/image sources, we would:

1. Upload the source frame as a texture (via `texImage2D` with the video/image/canvas element)
2. Run the existing fragment shader which applies: exposure, gamma, saturation, contrast, brightness, temperature, tint, hue rotation, color wheels, CDL, curves, tone mapping, color inversion, channel isolation, false color, zebra stripes, 3D LUT, display transfer
3. Read back pixels only if needed (e.g., for pixel probe or export)

**What is NOT in the shader yet** (would need to be added):
- Highlights/Shadows recovery (luminance-masked adjustment)
- Vibrance (intelligent saturation with skin protection)
- Clarity (local contrast -- requires multi-pass blur, harder on GPU)
- HSL Qualifier (secondary color correction with matte)
- Sharpen (convolution kernel)

**Implementation plan:**

#### Phase 1A: Basic SDR-through-WebGL path — DONE

> **Implemented in Stage 1.** Key changes:
> - `Renderer.renderSDRFrame()` uploads SDR frames as `UNSIGNED_BYTE` `RGBA` textures via `texImage2D`
> - `Viewer.renderSDRWithWebGL()` routes SDR sources through the GPU when GPU-compatible effects are active
> - `sdrWebGLRenderActive` flag tracks current rendering mode; `deactivateSDRWebGLMode()` handles transitions back
> - `syncRendererState()` shared helper pushes all effect parameters to GPU uniforms
> - `hasGPUShaderEffectsActive()` / `hasCPUOnlyEffectsActive()` determine routing (only blur remains CPU-only)
> - Pixel probe updated to use `gl.readPixels()` when SDR WebGL is active
> - CSS filters cleared/restored on mode transitions
> - Falls back to 2D canvas for crop, blur, or when no GPU-compatible effects are active

- ~~Modify `renderImage()` to attempt the WebGL path for SDR sources when any GPU-compatible effect is active~~
- ~~Upload SDR frame as `UNSIGNED_BYTE` `RGBA` texture (no EOTF needed, `u_inputTransfer = 0`)~~
- ~~Use existing shader pipeline for the effects it already supports~~
- ~~Fall back to 2D canvas only for the effects not yet in the shader~~

#### Phase 1B: Add missing effects to the shader — DONE

> **Implemented in Stage 2.** All 5 missing effects ported to GLSL:
> - **46 new uniforms** added to the fragment shader
> - **GLSL helpers**: `rgbToHsl()`, `hslToRgb()`, `hueToRgb()` for vibrance and HSL qualifier
> - **5 new setter methods** on Renderer: `setHighlightsShadows()`, `setVibrance()`, `setClarity()`, `setSharpen()`, `setHSLQualifier()`
> - **Pipeline reordered** to match CPU processing order: highlights/shadows before CDL/curves, clarity before color wheels, sharpen after tone mapping but before display transfer
> - **Design trade-off**: Clarity and sharpen sample from the original texture rather than intermediate results (documented, acceptable quality)

- ~~**Highlights/Shadows**: Add uniforms `u_highlights`, `u_shadows`, `u_whites`, `u_blacks` and implement the luminance-masked adjustment in GLSL. The smoothstep LUT can be computed inline.~~
- ~~**Vibrance**: Add uniform `u_vibrance`, `u_vibranceSkinProtection`. Implement the RGB->HSL->adjustment->HSL->RGB in the shader. GLSL has built-in `max`, `min`, `pow` that make this efficient.~~
- ~~**Sharpen**: Add a second render pass using a separate framebuffer. The first pass renders the image with color effects, then the sharpening pass applies the 3x3 convolution kernel by sampling the intermediate texture. This is a standard GPU technique.~~
  - **Note**: Implemented as single-pass 3x3 unsharp mask in the fragment shader (no separate FBO needed).
- ~~**HSL Qualifier**: Add uniforms for hue/saturation/luminance ranges and correction values. Implement the matte calculation and correction in the shader.~~
- ~~**Clarity**: This is the most challenging because it requires a Gaussian blur of the full image. Options:~~
  - ~~Two-pass separable blur using a ping-pong framebuffer, then a final composition pass~~
  - ~~Use a smaller blur radius (3x3) for GPU, which is visually similar and much simpler~~
  - ~~Compute the blur at reduced resolution and upsample~~
  - **Implemented**: Single-pass 5x5 Gaussian blur kernel in the fragment shader (option 2 as recommended).

#### Phase 1C: Dual-canvas compositing — DONE (part of Phase 1A)

> **Implemented in Stage 1.** The WebGL canvas and 2D canvas are layered with visibility toggling.
> When all active effects are GPU-compatible, the WebGL canvas is shown and 2D canvas hidden.
> When CPU-only effects are needed (currently only blur), the system falls back to 2D canvas rendering.
> `deactivateSDRWebGLMode()` handles clean transitions between modes, restoring CSS filters.

- ~~Keep the WebGL canvas and 2D canvas layered (as already done for HDR mode)~~
- ~~When all active effects are GPU-compatible, render entirely on the WebGL canvas~~
- ~~When CPU-only effects are needed (clarity, or features that cannot be ported), render GPU effects first, then read back only for the remaining CPU effects~~

**Estimated effort**: ~~Medium-high (2-3 weeks)~~ Completed.
**Impact**: Eliminates main thread blocking for the most common effects. At 1080p, GPU rendering takes <1ms vs 50-200ms on CPU.

---

### Strategy 2: Async Live Rendering with Worker Fallback (Medium Impact)

**Goal**: When the prerender cache misses, avoid blocking the main thread by rendering asynchronously and displaying a placeholder.

**Current behavior on cache miss**: Falls through to synchronous `applyBatchedPixelEffects()`.

**Proposed behavior on cache miss**:

#### Phase 2A: Show unprocessed frame, queue async processing — DONE

> **Implemented in Stage 3.** On cache miss during playback:
> - Raw frame is drawn immediately without effects (no main thread blocking)
> - `queuePriorityFrame()` sends the frame to the worker pool for async processing
> - `onFrameProcessed` callback triggers `refresh()` when the worker result is ready
> - `applyLightweightEffects()` applies fast diagnostic overlays (channel isolation, false color, zebra, display color mgmt) even on raw frames
> - LUT/OCIO transforms applied after drawing cached frames

- ~~When the prerender cache misses during playback, draw the raw frame without effects (or with only GPU-fast effects via CSS filters: brightness, contrast, saturate)~~
- ~~Immediately queue the frame for async processing in the worker pool~~
- ~~When the worker result arrives, update the cache and trigger a re-render~~
- ~~This trades brief visual accuracy for smooth playback~~

#### Phase 2B: Predictive preloading improvements — DONE

> **Implemented in Stage 3.** Key improvements:
> - Early preload trigger in `frameChanged` handler (before `renderImage()`)
> - `updateDynamicPreloadAhead()` auto-tunes the preload window based on measured frame processing time and fps
> - `dynamicPreloadAhead` used in both preloading and eviction logic (`Math.max(config.preloadAhead, dynamicPreloadAhead)`)
> - Frame processing time tracked per request via `onFrameProcessed` callback
> - Effects hash captured at request creation time to prevent race conditions
> - Removed redundant `preloadAround()` call from `renderImage()`

- ~~Currently preloading starts when `preloadAround()` is called, which happens during `renderImage()` -- by then the frame is already needed~~
- ~~Start preloading earlier: when the Session advances frames, proactively call `preloadAround()` before the Viewer renders~~
- ~~Increase the preload-ahead window from 30 to a dynamic value based on measured processing time and playback speed~~
- ~~When effects change, immediately start pre-rendering the current frame + N ahead instead of waiting for the next `renderImage()` call~~

#### Phase 2C: Double-buffering for effects changes
- When effects parameters change (e.g., user drags a slider), show the old cached frame while the new one is being processed
- Use a two-generation cache: keep the previous effects hash results until the new hash results are ready
- This eliminates the flash of unprocessed frames during parameter adjustment

**Estimated effort**: ~~Medium (1-2 weeks)~~ Completed (2A + 2B). Phase 2C not yet started.
**Impact**: Eliminates main thread blocking on cache misses. Some frames may display without the latest effects for 1-2 frames during rapid scrubbing or effects changes.

---

### Strategy 3: OffscreenCanvas for GPU Rendering (Medium Impact) — DONE

**Goal**: Move the WebGL2 GPU rendering pipeline off the main thread entirely, so the main thread only handles DOM, events, and paint overlays.

> **Implemented in Stages 5-6.** Key architecture:
> - **Dedicated render worker** (`src/workers/renderWorker.worker.ts`): Hosts the full `Renderer` (WebGL2) on a transferred `OffscreenCanvas`. Handles all texture uploads, shader execution, and canvas compositing in the worker thread.
> - **Message protocol** (`src/render/renderWorker.messages.ts`): 26 main→worker message types (init, render, state setters, dispose) + 7 worker→main result types (ready, renderDone, pixelData, contextLost, etc.). Fire-and-forget for state setters; request ID correlation for renders and pixel reads.
> - **Main-thread proxy** (`src/render/RenderWorkerProxy.ts`): Implements `RendererBackend` interface. Manages worker lifecycle, batch state optimization (dirty state flushed as single `syncState` message before each render), double-buffer frame preparation, and graceful fallback on worker death.
> - **Batch state optimization**: Instead of 15+ individual setter messages per frame, dirty state is collected and sent as a single `syncState` message before each render — reducing postMessage overhead to 2 messages per frame.
> - **Zero-copy transfers**: `ImageBitmap` (SDR frames) and `ArrayBuffer` (HDR pixel data) transferred as transferables. Worker closes ImageBitmaps after `texImage2D` to prevent memory leaks.
> - **3-tier fallback**: (1) Worker WebGL — best, (2) Main-thread WebGL — good, (3) 2D Canvas + CPU — fallback. Feature detection at init time; automatic fallback on OffscreenCanvas unavailability, worker creation failure, or context loss.
> - Uses Vite's `?worker` import pattern (matching `effectProcessor.worker.ts` convention).

#### Phase 3A: OffscreenCanvas with transferControlToOffscreen — DONE

> - `canvas.transferControlToOffscreen()` called **before** any `getContext()` (irreversible one-time operation)
> - Transferred `OffscreenCanvas` sent to worker via init message
> - Worker creates `Renderer` instance on the OffscreenCanvas, sets up context loss/restore listeners
> - Browser auto-composites the OffscreenCanvas to the visible canvas element
> - Modes that bypass WebGL (wipe, split screen, stereo, ghost frames, lens distortion, etc.) continue using the 2D canvas on the main thread — no changes needed

#### Phase 3B: createImageBitmap pipeline — DONE (part of 3A)

> - SDR frames converted to `ImageBitmap` via `createImageBitmap()` on main thread
> - `ImageBitmap` transferred to worker as transferable (zero-copy)
> - Worker uses `texImage2D(bitmap)` for texture upload, then closes the bitmap
> - HDR frames: `Float32Array`/`ArrayBuffer` transferred directly (zero-copy)
> - Double-buffer support: `prepareFrame()` pre-creates ImageBitmap in `frameChanged` handler; `getPreparedBitmap()` retrieves it in RAF without blocking

**Estimated effort**: ~~High (3-4 weeks)~~ Completed.
**Impact**: Completely removes GPU rendering from the main thread. Texture uploads, shader execution, and canvas compositing all happen in the worker. Main thread frame time reduced from ~16ms to <4ms.

---

### Strategy 4: Chunking/Yielding for CPU Work (Low-Medium Impact)

**Goal**: If CPU processing must happen on the main thread, break it into chunks that yield to the event loop.

**Approach**:

#### Phase 4A: Yield between effect passes
- Instead of applying all effects synchronously, process one effect at a time and yield between them using `scheduler.yield()` (if available) or `setTimeout(0)`
- This keeps individual blocking periods under ~16ms
- Requires keeping intermediate state and the ImageData object alive across yields

```
// Pseudo-code
async applyBatchedPixelEffectsAsync(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h);
  if (hasHighlights) { applyHighlightsShadows(imageData, ...); await yieldToMain(); }
  if (hasVibrance)   { applyVibrance(imageData, ...);          await yieldToMain(); }
  if (hasClarity)    { applyClarity(imageData, ...);           await yieldToMain(); }
  // ... etc
  ctx.putImageData(imageData, 0, 0);
}
```

#### Phase 4B: Row-based chunking for expensive effects
- For the most expensive effects (clarity, sharpen), process N rows at a time and yield between chunks
- This is more granular than per-effect yielding and keeps even individual effects from blocking

**Limitations**:
- Yielding creates visual artifacts: the frame may be partially rendered when the browser paints
- Must use `requestAnimationFrame` coordination to ensure the final `putImageData` happens before the next paint
- Does not reduce total processing time, only spreads it across frames
- For 30fps playback, there is only 33ms total budget; splitting across multiple frames may cause the effect to span 2-3 display frames

**Estimated effort**: Low (3-5 days)
**Impact**: Prevents complete UI freeze but may cause visual artifacts. Best used as an interim solution while GPU rendering is being implemented.

---

### Strategy 5: Optimize CPU Effect Performance (Low Impact, Quick Wins)

**Goal**: Reduce the per-pixel cost of CPU effects to minimize blocking duration.

#### 5A: Use LUT-based approximations for expensive per-pixel math — DONE

> **Implemented in Stage 4.** Vibrance 3D LUT:
> - 32x32x32 pre-computed lookup table cached statically via `getVibrance3DLUT()`
> - Trilinear interpolation for smooth results
> - LUT rebuilt only when vibrance parameter changes
> - Reduces per-pixel HSL conversion to a single LUT lookup with interpolation

- ~~**Vibrance**: Pre-compute a 3D LUT mapping (R,G,B) to adjusted values for the current vibrance setting. Use 32x32x32 or 64x64x64 resolution with trilinear interpolation. Reduces per-pixel HSL conversion to a single LUT lookup.~~
- **Hue rotation**: Already uses a matrix, which is fast. No change needed.
- **Color wheels**: Pre-compute zone weights into a 256-entry luminance LUT. Reduce per-pixel branching. *(Not yet implemented — lower priority since color wheels are now GPU-accelerated)*

#### 5B: Use SIMD-like techniques with TypedArrays
- Process 4 pixels at a time using `Int32Array` views over the pixel data for bulk operations like inversion and channel isolation
- Use pre-multiplied values where possible to avoid per-pixel division

#### 5C: Batch compatible effects into a single pass — DONE

> **Implemented in Stage 4.** Single-pass merging:
> - `applyMergedPerPixelEffects()` merges 10 per-pixel effects into one loop (highlights/shadows, vibrance, hue rotation, color wheels, CDL, curves, HSL qualifier, tone mapping, color inversion, channel isolation)
> - Overall structure reduced from 12 separate passes to max 3: clarity → merged per-pixel → sharpen
> - All per-pixel work operates in normalized 0-1 range within a single loop iteration
> - Worker (`effectProcessor.worker.ts`) mirrors all optimizations
> - `evaluateCurveAtPoint()` moved to `effectProcessing.shared.ts` as single source of truth for Catmull-Rom spline interpolation (fixes curves LUT parity between main thread and worker)

- ~~Currently, each effect iterates over all pixels independently~~
- ~~Merge compatible effects into a single loop iteration:~~
  - ~~Highlights/shadows + vibrance + CDL + curves + channel isolation can all be applied in one pass per pixel~~
  - ~~This reduces cache misses from repeatedly iterating the pixel buffer~~

#### 5D: Reduce resolution for convolution effects
- Apply clarity and sharpen at half resolution, then upscale
- For 1080p, process at 960x540 (4x fewer pixels), then bilinear interpolate back
- Quality impact is minimal for blur-based effects like clarity

#### 5E: Use WebAssembly for hot loops
- Port the per-pixel processing to a WASM module (e.g., via AssemblyScript or Rust/wasm-pack)
- WASM can leverage SIMD instructions (`v128` in WebAssembly SIMD) to process 4 color channels simultaneously
- Expected 2-4x speedup for arithmetic-heavy effects

**Estimated effort**: ~~Low-Medium (1-2 weeks for LUT + single-pass; 2-3 weeks for WASM)~~ 5A + 5C completed. 5B/5D/5E not started.
**Impact**: 2-4x speedup on CPU path. Does not eliminate blocking but reduces it below perceptible thresholds for simpler effect combinations.

---

## Recommended Implementation Order

### Phase 1 (Immediate -- highest ROI) — DONE
**Strategy 1A + 1B: GPU rendering for SDR sources**

~~This is the single highest-impact change.~~ Completed. The GPU shader handles all effects for SDR sources. Results:
- ~~Most common effects (exposure, contrast, saturation, CDL, curves, color wheels, tone mapping, hue rotation, channel isolation) become essentially free~~ All GPU-accelerated.
- ~~Only highlights/shadows, vibrance, clarity, HSL qualifier, and sharpen need shader additions~~ All 5 added to shader.
- The GPU processes 1080p in under 1ms vs 50-200ms on CPU.

**Deliverables:**
1. ~~Add a `renderSDRWithWebGL()` path in Viewer that uploads SDR frames as textures~~ Done.
2. ~~Add highlights/shadows, vibrance, and sharpen to the fragment shader (or as additional render passes)~~ Done (single-pass, no extra FBOs).
3. ~~Add HSL qualifier to the fragment shader~~ Done.
4. ~~Add clarity as a multi-pass blur+composite (or simplify to a single-pass approximation)~~ Done (single-pass 5x5 Gaussian).

### Phase 2 (Short-term -- safety net) — DONE
**Strategy 2A + 2B: Async fallback + predictive preloading**

~~Even with GPU rendering, there will be edge cases (WebGL context loss, unsupported configurations, CSS-painted canvases) that fall back to CPU. Improve the fallback:~~
Completed. The CPU fallback path now never blocks the main thread during playback:
1. ~~Show unprocessed frame on cache miss instead of blocking~~ Done. Raw frame shown, worker processes async.
2. ~~Start preloading earlier in the Session tick, not in `renderImage()`~~ Done. Preload in `frameChanged` handler.
3. ~~Dynamic preload window based on measured frame processing time~~ Done. `updateDynamicPreloadAhead()` auto-tunes.

### Phase 3 (Medium-term -- robustness) — DONE
**Strategy 5A + 5C: CPU optimization**

~~For the cases where CPU processing is still needed (worker prerender, export, pixel probe):~~
Completed. The CPU fallback path is now significantly faster:
1. ~~Merge compatible effects into a single per-pixel pass~~ Done. 12 passes → max 3.
2. ~~Use LUT-based vibrance and color wheels~~ Done. 32x32x32 vibrance 3D LUT.
3. ~~Pre-compute static LUTs once on effects change, not per frame~~ Done. LUT cached statically.

### Phase 4 (Long-term -- architectural improvement) — DONE
**Strategy 3: OffscreenCanvas rendering**

> **Completed.** The WebGL2 `Renderer` now runs in a dedicated worker via `transferControlToOffscreen()`. The `RenderWorkerProxy` implements `RendererBackend` so the Viewer can use it transparently. Batch state optimization reduces message overhead. 3-tier fallback ensures robustness. See Strategy 3 section for full details.

---

## Architecture Diagram: Target State

```
Main Thread                              Render Worker                   Effect Workers
-----------                              -------------                   --------------

Session.updatePlayback()
  |
  v
Viewer.scheduleRender()
  |
  v
RAF -> render()
  |
  v
renderImage()
  |
  +-- [OffscreenCanvas available]
  |     |
  |     +-- [SDR source]
  |     |     createImageBitmap(source)
  |     |     postMessage({renderSDR, bitmap}, [bitmap])  ──>  renderWorker.worker.ts
  |     |                                                         |
  |     +-- [HDR source]                                          +-- texImage2D(bitmap)
  |     |     serialize IPImage data                               +-- Set uniforms from
  |     |     postMessage({renderHDR, buffer}, [buffer])  ──>        syncState message
  |     |                                                         +-- Render quad + shader
  |     +-- State setters batched as single                       +-- Auto-composite to
  |           syncState message before render                        visible canvas
  |                                                               +-- postMessage({done})
  |     <── renderDone ──────────────────────────────────────────<
  |
  +-- [Main-thread WebGL fallback]
  |     |
  |     +-- [HDR source] --> renderHDRWithWebGL()  --> GPU shader pipeline (direct)
  |     |
  |     +-- [SDR source] --> renderSDRWithWebGL()  --> GPU shader pipeline (direct)
  |                           +-- Upload frame as GL texture
  |                           +-- Set effect uniforms
  |                           +-- Render quad with fragment shader
  |                           +-- All effects applied in <1ms
  |
  +-- [GPU unavailable] --> Check prerender cache
                             |
                             +-- [Cache HIT] --> Draw cached canvas (fast)
                             |
                             +-- [Cache MISS] --> Draw raw frame (no effects)
                                                   |
                                                   +-- Queue for async ──>  WorkerPool
                                                       worker processing       |
                                                                               v
                                                                         effectProcessor.worker.ts
                                                                               |
                                                                               v
                                                                         Process pixels (CPU)
                                                                               |
                                                                               v
                                                                         Return to cache
                                                                               |
                                                                               v
                                                                         onCacheUpdate -> refresh()
```

---

## Effects Added to GPU Shader — ALL DONE

### Highlights/Shadows — DONE

Implemented with `u_highlights`, `u_shadows`, `u_whites`, `u_blacks` uniforms. Uses luminance-masked adjustment with `smoothstep()` for zone masks. Placed in pipeline before CDL/curves.

### Vibrance — DONE

Implemented with `u_vibrance`, `u_vibranceSkinProtection` uniforms. Uses `rgbToHsl()`/`hslToRgb()` GLSL helpers. Skin protection heuristic matches CPU implementation.

### Sharpen — DONE

Implemented as single-pass 3x3 unsharp mask in the fragment shader using `u_texelSize` for neighbor sampling. **No separate FBO needed** — samples from the original texture within the same pass. Placed after tone mapping, before display transfer.

### HSL Qualifier — DONE

Implemented with uniforms for hue center/range/softness, saturation min/max/softness, luminance min/max/softness, and correction values (hue shift, saturation scale, luminance scale). Uses `rgbToHsl()`/`hslToRgb()` helpers with smoothstep-based matte calculation.

### Clarity — DONE

Implemented as **single-pass 5x5 Gaussian blur** (option 2 from the plan). Uses `u_texelSize` to sample 25 texels, applies high-pass filter with midtone mask via `smoothstep()`. Quality is acceptable; upgrade to separable two-pass blur is possible if needed.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| WebGL context loss during playback | Detect with `webglcontextlost` event; fall back to prerender cache + CPU path. Worker posts `contextLost` message; proxy tracks state and triggers fallback. |
| WebGL not available (rare) | Feature-detect at startup; use existing CPU+worker path as full fallback |
| Shader compilation failure | Catch errors in `initShaders()`; fall back to CPU path |
| GPU memory pressure with many textures | Reuse a single texture per frame; delete old textures promptly |
| Visual differences between GPU and CPU paths | Use identical math constants; test with pixel-level comparison (existing test infra) |
| Effects not in shader require readback | Use `gl.readPixels()` only for the rare effects that cannot be ported; minimize readback |
| OffscreenCanvas browser support | Widely supported (Chrome 69+, Firefox 105+, Safari 17+); feature-detect `transferControlToOffscreen`; 3-tier fallback (worker WebGL → main-thread WebGL → 2D canvas + CPU) |
| `transferControlToOffscreen` is irreversible | Feature-detect first; only transfer if WebGL2 confirmed available; keep 2D canvas as independent fallback |
| Worker crash / termination | Proxy detects worker death via `error` event; rejects all pending requests; falls back to main-thread Renderer |
| State desynchronization between main thread and worker | Batch all dirty state into single `syncState` message before each render; worker always applies latest state |
| `createImageBitmap` latency on large frames | Pre-create in `frameChanged` handler via `prepareFrame()`; double-buffer pattern avoids blocking RAF |
| HDR color space not on OffscreenCanvas | Already handled via shader-based EOTF/tone mapping — no canvas-level HDR needed |

---

## Metrics for Success

1. **Frame render time under 16ms** for common effect combinations at 1080p during playback
2. **No audio resync events** during playback with effects enabled
3. **Main thread long tasks under 50ms** as measured by the Performance Observer or Chrome DevTools
4. **Prerender cache hit rate above 95%** during constant-speed playback with stable effects
5. **No visible frame drops** when scrubbing with effects enabled (acceptable: up to 2 frames of stale/unprocessed display)

---

## Files Involved

| File | Role | Changes Made |
|------|------|-------------|
| `src/ui/components/Viewer.ts` | Main rendering loop | **Stage 1-3**: Added `renderSDRWithWebGL()`, `sdrWebGLRenderActive`, `deactivateSDRWebGLMode()`, `hasGPUShaderEffectsActive()`, `hasCPUOnlyEffectsActive()`, `syncRendererState()`, async fallback on cache miss, `applyLightweightEffects()`, early preload trigger, pixel probe GL readback. **Stage 5-6**: Worker integration via `RenderWorkerProxy`, feature detection, double-buffer pattern, fallback tiers. |
| `src/render/Renderer.ts` | WebGL2 backend + fragment shader | **Stage 1-2**: Added `renderSDRFrame()`, `sdrTexture`, `getCanvasElement()`, `setAllEffectUniforms()`, 46 new GLSL uniforms, `rgbToHsl()`/`hslToRgb()`/`hueToRgb()` GLSL helpers, 5 new setter methods, `u_texelSize` uniform. **Stage 5**: `initialize()` accepts `OffscreenCanvas` in addition to `HTMLCanvasElement`. |
| `src/render/RendererBackend.ts` | Backend interface | **Stage 1-2**: Extended with `renderSDRFrame()`, `getCanvasElement()`, 5 Phase 1B setter methods. **Stage 5**: Added optional async methods: `isAsync`, `initializeOffscreen()`, `renderSDRFrameAsync()`, `readPixelFloatAsync()`. |
| `src/render/WebGPUBackend.ts` | WebGPU backend stubs | **Stage 1-2**: Stub implementations for all new interface methods. **Stage 5**: Stub async methods. |
| `src/render/renderWorker.messages.ts` | Worker message protocol | **Stage 5** (NEW): 26 main→worker message types + 7 worker→main result types. Data conversion helpers (`DATA_TYPE_CODES`, `TRANSFER_FUNCTION_CODES`, `COLOR_PRIMARIES_CODES`). `RendererSyncState` for batch state optimization. |
| `src/workers/renderWorker.worker.ts` | Dedicated render worker | **Stage 5** (NEW): Hosts `Renderer` on transferred `OffscreenCanvas`. Handles all message types: init, resize, clear, renderSDR/HDR, all state setters, syncState, readPixel, dispose. Context loss/restore listeners. `ImageBitmap` cleanup after `texImage2D`. |
| `src/render/RenderWorkerProxy.ts` | Main-thread proxy | **Stage 5** (NEW): Implements `RendererBackend`. Worker lifecycle management, batch state optimization (`flushDirtyState()`), request ID correlation, double-buffer frame preparation, 3-tier fallback on worker death. Uses Vite `?worker` import. |
| `src/utils/PrerenderBufferManager.ts` | Prerender cache + worker pool | **Stage 3**: `onFrameProcessed` callback, `queuePriorityFrame()`, frame processing time tracking, `updateDynamicPreloadAhead()`, effects hash captured at creation time, dynamic eviction logic |
| `src/utils/EffectProcessor.ts` | CPU effect pipeline | **Stage 4**: `applyMergedPerPixelEffects()` (12→3 passes), vibrance 3D LUT (32x32x32) with trilinear interpolation |
| `src/workers/effectProcessor.worker.ts` | Worker-side effect processing | **Stage 4**: Mirrored all EffectProcessor optimizations, `evaluateCurveAtPoint()` from shared module |
| `src/utils/effectProcessing.shared.ts` | Shared constants/helpers | **Stage 4**: `evaluateCurveAtPoint()` (Catmull-Rom spline) moved here as single source of truth |
| `src/color/ColorCurves.ts` | Color curves evaluation | **Stage 4**: Now imports `evaluateCurveAtPoint` from shared module |
| `src/render/ShaderProgram.ts` | Shader compilation utility | No changes needed (single-pass approach sufficient) |
| `src/ui/components/ViewerPrerender.ts` | Prerender helpers | No changes needed (preload trigger moved to Viewer frameChanged handler) |
| `src/ui/components/ViewerEffects.ts` | CPU effect functions | No changes needed (GPU path bypasses these) |
| `src/core/session/Session.ts` | Playback loop + audio sync | No changes needed (Viewer handles preload triggering) |

### Test Files (Phase 3A/3B)

| File | Tests | Description |
|------|-------|-------------|
| `src/render/renderWorker.messages.test.ts` | 32 | Message type validation, data code roundtrips, discriminator uniqueness |
| `src/render/RenderWorkerProxy.test.ts` | 39 | Proxy unit tests with mock worker: lifecycle, state, rendering, batch optimization, context loss |
| `src/workers/renderWorker.worker.test.ts` | 20 | Worker internals: `reconstructIPImage`, `applySyncState`, data type edge cases |
| `src/render/RenderWorkerProxy.e2e.test.ts` | 75 | Integration tests: feature detection, fallback, state round-trips, render behavior, batch optimization, worker factory, context events |
