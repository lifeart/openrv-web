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

## Remaining Work

### Phase 5E: WebAssembly for hot loops

Port per-pixel processing to a WASM module (e.g., via AssemblyScript or Rust/wasm-pack). WASM can leverage SIMD instructions (`v128`) to process 4 color channels simultaneously. Expected 2-4x speedup for arithmetic-heavy effects.

**Estimated effort**: Medium (2-3 weeks)

---

## Metrics for Success

1. **Frame render time under 16ms** for common effect combinations at 1080p during playback
2. **No audio resync events** during playback with effects enabled
3. **Main thread long tasks under 50ms** (Performance Observer / DevTools)
4. **Prerender cache hit rate above 95%** during constant-speed playback with stable effects
5. **No visible frame drops** when scrubbing with effects enabled (acceptable: up to 2 frames of stale display)
