# Main Thread Unblocking Plan: CPU Effect Processing

## Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| **1A** | SDR-through-WebGL rendering path | **DONE** |
| **1B** | GPU shader effects (highlights/shadows, vibrance, clarity, sharpen, HSL qualifier) | **DONE** |
| **1C** | Dual-canvas compositing | **DONE** |
| **2A** | Async fallback on cache miss | **DONE** |
| **2B** | Predictive preloading | **DONE** |
| **2C** | Double-buffering for effects changes | **DONE** |
| **3A** | OffscreenCanvas rendering worker | **DONE** |
| **3B** | createImageBitmap pipeline | **DONE** |
| **4A** | Yield between CPU effect passes | **DONE** |
| **4B** | Row-based chunking for convolution effects | **DONE** |
| **5A** | LUT-based vibrance (3D LUT) | **DONE** |
| **5B** | SIMD-like techniques with TypedArrays | **DONE** |
| **5C** | Single-pass effect merging (12 passes → 3) | **DONE** |
| **5D** | Half-resolution convolution effects | **DONE** |
| **5E** | WebAssembly for hot loops | Not started |

---

## Architecture (Current State)

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

## Recent Improvements (Code Cleanup Sprint)

The following performance and architecture improvements were applied as part of the IMP-xxx improvement plan:

### Rendering Pipeline
- **Parallel shader compilation** (IMP-008): `KHR_parallel_shader_compile` support prevents 500ms-2s main-thread block during shader compilation. Async `waitForCompilation()` + `isShaderReady()` polling.
- **GLSL shader extraction** (IMP-031): 652-line fragment shader + 12-line vertex shader moved to separate `.glsl` files with Vite `?raw` imports. Renderer.ts reduced by 668 lines.
- **Renderer/StateManager decoupling** (IMP-006): `StateAccessor` interface with snapshot types decouples Renderer from concrete ShaderStateManager.
- **ShaderState optimization** (IMP-038): Cached snapshot objects, in-place mutations for texel/resolution/CDL/color wheels, pre-allocated buffers eliminate per-frame allocations.
- **LUT buffer pre-allocation** (IMP-017): Alpha channels pre-filled once; subsequent updates only copy RGB. Saves ~25% writes per update.
- **Config constants consolidated** (IMP-020): LUT sizes, input transfer codes, output modes centralized in `RenderConfig.ts`.

### Frame Extraction & Playback
- **Lazy frame index** (IMP-003): `getFrame()`/`getFrameHDR()` no longer scan entire video upfront. Uses mathematical CFR timestamp calculation for instant first-frame display.
- **Snapshot caching** (IMP-026): LRU cache (max 3) in MediabunnyFrameExtractor avoids redundant `createImageBitmap` GPU round-trips.
- **IPImage.clone() shallow default** (IMP-002): Clone shares ArrayBuffer (metadata-only copy). Saves ~141 MB for 4K HDR images.

### Effect Pipeline
- **Unified EffectRegistry** (IMP-012): `ImageEffect` interface + `EffectRegistry` with 5 adapter effects. Enables CPU/GPU/worker routing via unified registry.
- **Gainmap lookup tables** (IMP-019): Pre-computed LUT replaces ~36M `Math.pow` calls for 12MP images.
- **getPixel buffer reuse** (IMP-018): Optional `out` parameter eliminates array allocation per pixel sample.

---

## Remaining Work

### Phase 5E: WebAssembly for hot loops

Port per-pixel processing to a WASM module (e.g., via AssemblyScript or Rust/wasm-pack). WASM can leverage SIMD instructions (`v128`) to process 4 color channels simultaneously. Expected 2-4x speedup for arithmetic-heavy effects.

**Estimated effort**: Medium (2-3 weeks)

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| WebGL context loss during playback | Worker posts `contextLost` message; proxy tracks state and triggers fallback to 2D canvas + CPU |
| WebGL not available | Feature-detect at startup; use CPU+worker path as full fallback |
| Shader compilation failure | Catch errors in `initShaders()`; fall back to CPU path. `KHR_parallel_shader_compile` prevents blocking. |
| GPU memory pressure | Reuse a single texture per frame; delete old textures promptly; LRU eviction with `onEvict` callbacks |
| OffscreenCanvas browser support | Chrome 69+, Firefox 105+, Safari 17+; 3-tier fallback (worker WebGL → main-thread WebGL → 2D canvas + CPU) |
| Worker crash / termination | Proxy detects worker death via `error` event; rejects pending requests; falls back to main-thread Renderer |
| State desynchronization | Batch dirty state into single `syncState` message before each render |

---

## Metrics for Success

1. **Frame render time under 16ms** for common effect combinations at 1080p during playback
2. **No audio resync events** during playback with effects enabled
3. **Main thread long tasks under 50ms** (Performance Observer / DevTools)
4. **Prerender cache hit rate above 95%** during constant-speed playback with stable effects
5. **No visible frame drops** when scrubbing with effects enabled (acceptable: up to 2 frames of stale display)
