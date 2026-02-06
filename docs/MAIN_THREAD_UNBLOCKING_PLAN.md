# Main Thread Unblocking Plan: CPU Effect Processing

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

#### Phase 1A: Basic SDR-through-WebGL path
- Modify `renderImage()` to attempt the WebGL path for SDR sources when any GPU-compatible effect is active
- Upload SDR frame as `UNSIGNED_BYTE` `RGBA` texture (no EOTF needed, `u_inputTransfer = 0`)
- Use existing shader pipeline for the effects it already supports
- Fall back to 2D canvas only for the effects not yet in the shader

#### Phase 1B: Add missing effects to the shader

- **Highlights/Shadows**: Add uniforms `u_highlights`, `u_shadows`, `u_whites`, `u_blacks` and implement the luminance-masked adjustment in GLSL. The smoothstep LUT can be computed inline.
- **Vibrance**: Add uniform `u_vibrance`, `u_vibranceSkinProtection`. Implement the RGB->HSL->adjustment->HSL->RGB in the shader. GLSL has built-in `max`, `min`, `pow` that make this efficient.
- **Sharpen**: Add a second render pass using a separate framebuffer. The first pass renders the image with color effects, then the sharpening pass applies the 3x3 convolution kernel by sampling the intermediate texture. This is a standard GPU technique.
- **HSL Qualifier**: Add uniforms for hue/saturation/luminance ranges and correction values. Implement the matte calculation and correction in the shader.
- **Clarity**: This is the most challenging because it requires a Gaussian blur of the full image. Options:
  - Two-pass separable blur using a ping-pong framebuffer, then a final composition pass
  - Use a smaller blur radius (3x3) for GPU, which is visually similar and much simpler
  - Compute the blur at reduced resolution and upsample

#### Phase 1C: Dual-canvas compositing
- Keep the WebGL canvas and 2D canvas layered (as already done for HDR mode)
- When all active effects are GPU-compatible, render entirely on the WebGL canvas
- When CPU-only effects are needed (clarity, or features that cannot be ported), render GPU effects first, then read back only for the remaining CPU effects

**Estimated effort**: Medium-high (2-3 weeks)
**Impact**: Eliminates main thread blocking for the most common effects. At 1080p, GPU rendering takes <1ms vs 50-200ms on CPU.

---

### Strategy 2: Async Live Rendering with Worker Fallback (Medium Impact)

**Goal**: When the prerender cache misses, avoid blocking the main thread by rendering asynchronously and displaying a placeholder.

**Current behavior on cache miss**: Falls through to synchronous `applyBatchedPixelEffects()`.

**Proposed behavior on cache miss**:

#### Phase 2A: Show unprocessed frame, queue async processing
- When the prerender cache misses during playback, draw the raw frame without effects (or with only GPU-fast effects via CSS filters: brightness, contrast, saturate)
- Immediately queue the frame for async processing in the worker pool
- When the worker result arrives, update the cache and trigger a re-render
- This trades brief visual accuracy for smooth playback

#### Phase 2B: Predictive preloading improvements
- Currently preloading starts when `preloadAround()` is called, which happens during `renderImage()` -- by then the frame is already needed
- Start preloading earlier: when the Session advances frames, proactively call `preloadAround()` before the Viewer renders
- Increase the preload-ahead window from 30 to a dynamic value based on measured processing time and playback speed
- When effects change, immediately start pre-rendering the current frame + N ahead instead of waiting for the next `renderImage()` call

#### Phase 2C: Double-buffering for effects changes
- When effects parameters change (e.g., user drags a slider), show the old cached frame while the new one is being processed
- Use a two-generation cache: keep the previous effects hash results until the new hash results are ready
- This eliminates the flash of unprocessed frames during parameter adjustment

**Estimated effort**: Medium (1-2 weeks)
**Impact**: Eliminates main thread blocking on cache misses. Some frames may display without the latest effects for 1-2 frames during rapid scrubbing or effects changes.

---

### Strategy 3: OffscreenCanvas for Effect Processing (Medium Impact)

**Goal**: Move the `getImageData` / CPU processing / `putImageData` cycle off the main thread entirely.

**Approach**:

#### Phase 3A: OffscreenCanvas with transferControlToOffscreen
- Create an `OffscreenCanvas` using `canvas.transferControlToOffscreen()`
- Transfer the OffscreenCanvas to a dedicated rendering worker
- The worker receives frame data and effects state, renders everything (including `drawImage`, effect processing, and final output) off the main thread
- The browser composites the OffscreenCanvas result automatically

**Challenges**:
- `transferControlToOffscreen()` is a one-time operation; the main thread can no longer draw to that canvas
- Need to handle all rendering in the worker, including the various rendering modes (wipe, split screen, stereo, etc.)
- Video elements and images cannot be directly used in workers; must transfer pixel data or use `createImageBitmap()`

#### Phase 3B: createImageBitmap pipeline
- Use `createImageBitmap()` (which is available in workers) to efficiently decode video/image frames
- Transfer `ImageBitmap` objects to the rendering worker instead of raw pixel arrays
- The worker draws the ImageBitmap to its OffscreenCanvas, applies effects, and the result is automatically composited

**Estimated effort**: High (3-4 weeks) -- requires significant refactoring of the rendering architecture
**Impact**: Completely removes rendering from the main thread. However, the complexity of the existing rendering pipeline (wipe, split screen, stereo, crop, uncrop, ghost frames, etc.) makes this a larger undertaking.

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

#### 5A: Use LUT-based approximations for expensive per-pixel math
- **Vibrance**: Pre-compute a 3D LUT mapping (R,G,B) to adjusted values for the current vibrance setting. Use 32x32x32 or 64x64x64 resolution with trilinear interpolation. Reduces per-pixel HSL conversion to a single LUT lookup.
- **Hue rotation**: Already uses a matrix, which is fast. No change needed.
- **Color wheels**: Pre-compute zone weights into a 256-entry luminance LUT. Reduce per-pixel branching.

#### 5B: Use SIMD-like techniques with TypedArrays
- Process 4 pixels at a time using `Int32Array` views over the pixel data for bulk operations like inversion and channel isolation
- Use pre-multiplied values where possible to avoid per-pixel division

#### 5C: Batch compatible effects into a single pass
- Currently, each effect iterates over all pixels independently
- Merge compatible effects into a single loop iteration:
  - Highlights/shadows + vibrance + CDL + curves + channel isolation can all be applied in one pass per pixel
  - This reduces cache misses from repeatedly iterating the pixel buffer

#### 5D: Reduce resolution for convolution effects
- Apply clarity and sharpen at half resolution, then upscale
- For 1080p, process at 960x540 (4x fewer pixels), then bilinear interpolate back
- Quality impact is minimal for blur-based effects like clarity

#### 5E: Use WebAssembly for hot loops
- Port the per-pixel processing to a WASM module (e.g., via AssemblyScript or Rust/wasm-pack)
- WASM can leverage SIMD instructions (`v128` in WebAssembly SIMD) to process 4 color channels simultaneously
- Expected 2-4x speedup for arithmetic-heavy effects

**Estimated effort**: Low-Medium (1-2 weeks for LUT + single-pass; 2-3 weeks for WASM)
**Impact**: 2-4x speedup on CPU path. Does not eliminate blocking but reduces it below perceptible thresholds for simpler effect combinations.

---

## Recommended Implementation Order

### Phase 1 (Immediate -- highest ROI)
**Strategy 1A + 1B: GPU rendering for SDR sources**

This is the single highest-impact change. The GPU shader already handles most effects. Extending it to SDR sources means:
- Most common effects (exposure, contrast, saturation, CDL, curves, color wheels, tone mapping, hue rotation, channel isolation) become essentially free
- Only highlights/shadows, vibrance, clarity, HSL qualifier, and sharpen need shader additions
- The GPU can process 1080p in under 1ms vs 50-200ms on CPU

**Deliverables:**
1. Add a `renderSDRWithWebGL()` path in Viewer that uploads SDR frames as textures
2. Add highlights/shadows, vibrance, and sharpen to the fragment shader (or as additional render passes)
3. Add HSL qualifier to the fragment shader
4. Add clarity as a multi-pass blur+composite (or simplify to a single-pass approximation)

### Phase 2 (Short-term -- safety net)
**Strategy 2A + 2B: Async fallback + predictive preloading**

Even with GPU rendering, there will be edge cases (WebGL context loss, unsupported configurations, CSS-painted canvases) that fall back to CPU. Improve the fallback:
1. Show unprocessed frame on cache miss instead of blocking
2. Start preloading earlier in the Session tick, not in `renderImage()`
3. Dynamic preload window based on measured frame processing time

### Phase 3 (Medium-term -- robustness)
**Strategy 5A + 5C: CPU optimization**

For the cases where CPU processing is still needed (worker prerender, export, pixel probe):
1. Merge compatible effects into a single per-pixel pass
2. Use LUT-based vibrance and color wheels
3. Pre-compute static LUTs once on effects change, not per frame

### Phase 4 (Long-term -- architectural improvement)
**Strategy 3: OffscreenCanvas rendering**

For complete main thread isolation, move the entire rendering pipeline to a worker. This is a larger architectural change but provides the ultimate guarantee against main thread blocking.

---

## Architecture Diagram: Target State

```
Main Thread                          Worker Threads
-----------                          --------------

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
  +-- [HDR source] --> renderHDRWithWebGL()  --> GPU shader pipeline (existing)
  |
  +-- [SDR source] --> renderSDRWithWebGL()  --> GPU shader pipeline (NEW)
  |                     |
  |                     +-- Upload frame as GL texture
  |                     +-- Set effect uniforms
  |                     +-- Render quad with fragment shader
  |                     +-- All effects applied in <1ms
  |
  +-- [GPU unavailable] --> Check prerender cache
                             |
                             +-- [Cache HIT] --> Draw cached canvas (fast)
                             |
                             +-- [Cache MISS] --> Draw raw frame (no effects)
                                                   |
                                                   +-- Queue for async     --> WorkerPool
                                                       worker processing       |
                                                                               v
                                                                         effectProcessor.worker.ts
                                                                               |
                                                                               v
                                                                         Process pixels
                                                                               |
                                                                               v
                                                                         Return to cache
                                                                               |
                                                                               v
                                                                         onCacheUpdate -> refresh()
```

---

## Effects to Add to GPU Shader

### Highlights/Shadows (straightforward)

GLSL implementation:
```glsl
uniform float u_highlights;    // -1 to +1
uniform float u_shadows;       // -1 to +1
uniform float u_whites;        // -1 to +1
uniform float u_blacks;        // -1 to +1

// In main():
float lum = dot(color.rgb, LUMA);
float highlightMask = smoothstepCustom(0.5, 1.0, lum);
float shadowMask = 1.0 - smoothstepCustom(0.0, 0.5, lum);
// Apply whites/blacks clipping
// Apply highlight/shadow adjustment
```

### Vibrance (straightforward)

Requires RGB->HSL conversion in the shader, which is well-known GLSL. The skin protection heuristic translates directly.

### Sharpen (requires second pass)

Standard approach: render to a framebuffer texture, then apply a 3x3 convolution in a second draw call sampling the intermediate texture. Needs:
- One additional framebuffer object (FBO)
- One additional texture
- A second (simpler) shader program or conditional in the existing shader
- Ping-pong rendering between textures

### HSL Qualifier (straightforward)

RGB->HSL conversion + smoothstep-based matte calculation + HSL correction, all per-pixel in the shader. No texture lookups needed.

### Clarity (requires multi-pass)

Most complex. Options:
1. **Two-pass separable Gaussian blur** (optimal quality): Render to FBO, horizontal blur pass, vertical blur pass, then composite with the original using midtone mask. Requires 2 extra FBOs and 3 additional draw calls.
2. **Single-pass approximation**: Use a 5x5 kernel in a single shader by sampling 25 texture locations. Less efficient than separable but simpler to implement.
3. **Downsampled blur**: Render at half resolution for the blur, upsample, compute high-pass at full resolution. Trades some quality for performance.

Recommendation: Start with option 2 (single-pass 5x5) for simplicity, upgrade to option 1 if quality is insufficient.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| WebGL context loss during playback | Detect with `webglcontextlost` event; fall back to prerender cache + CPU path |
| WebGL not available (rare) | Feature-detect at startup; use existing CPU+worker path as full fallback |
| Shader compilation failure | Catch errors in `initShaders()`; fall back to CPU path |
| GPU memory pressure with many textures | Reuse a single texture per frame; delete old textures promptly |
| Visual differences between GPU and CPU paths | Use identical math constants; test with pixel-level comparison (existing test infra) |
| Effects not in shader require readback | Use `gl.readPixels()` only for the rare effects that cannot be ported; minimize readback |
| OffscreenCanvas browser support | It is widely supported in modern browsers (Chrome 69+, Firefox 105+, Safari 16.4+); use feature detection |

---

## Metrics for Success

1. **Frame render time under 16ms** for common effect combinations at 1080p during playback
2. **No audio resync events** during playback with effects enabled
3. **Main thread long tasks under 50ms** as measured by the Performance Observer or Chrome DevTools
4. **Prerender cache hit rate above 95%** during constant-speed playback with stable effects
5. **No visible frame drops** when scrubbing with effects enabled (acceptable: up to 2 frames of stale/unprocessed display)

---

## Files Involved

| File | Role | Changes Needed |
|------|------|---------------|
| `src/ui/components/Viewer.ts` | Main rendering loop | Add `renderSDRWithWebGL()`, modify cache miss behavior |
| `src/render/Renderer.ts` | WebGL2 backend + fragment shader | Add highlight/shadow, vibrance, HSL qualifier, clarity, sharpen shader code |
| `src/render/ShaderProgram.ts` | Shader compilation utility | May need multi-program support for multi-pass |
| `src/utils/PrerenderBufferManager.ts` | Prerender cache + worker pool | Improve preload timing, double-buffer on effects change |
| `src/utils/EffectProcessor.ts` | CPU effect pipeline | Optimize single-pass merging, LUT-based vibrance |
| `src/workers/effectProcessor.worker.ts` | Worker-side effect processing | Keep in sync with EffectProcessor optimizations |
| `src/utils/effectProcessing.shared.ts` | Shared constants/helpers | Add any new constants needed by shader |
| `src/ui/components/ViewerPrerender.ts` | Prerender helpers | Move preload trigger earlier in pipeline |
| `src/ui/components/ViewerEffects.ts` | CPU effect functions | Optimize, eventually deprecate in favor of GPU path |
| `src/core/session/Session.ts` | Playback loop + audio sync | Trigger preloading on frame advance, before render |
