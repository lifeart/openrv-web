# Implementation Plan: WebGPU Backend Readiness

> **Status:** Phase 1 (Basic Rendering) is **COMPLETE** (commit `cd55d94`).
> Phases 2-4 remain as future work.

## Current State

| Module | Lines | Status |
|--------|-------|--------|
| `WebGPUBackend.ts` | 409 | Initialization works; ~30 rendering methods are stubs |
| `WebGPUHDRBlit.ts` | 372 | Fully functional. Self-contained blit from WebGL2 FBO readback to WebGPU HDR canvas. Contains working WGSL. |
| `createRenderer.ts` | 37 | Selects WebGPU when `caps.webgpuAvailable && caps.webgpuHDR`, falls back to WebGL2 |

The WebGL2 backend (`Renderer.ts`, 2,480 lines) uses a monolithic fragment shader (`viewer.frag.glsl`, 1,538 lines) with ~90 uniforms, plus a multi-pass `ShaderPipeline.ts` (638 lines) with 11 stages and FBO ping-pong.

## Architecture Decisions

1. **Multi-pass from day one.** WebGPU's render pass model maps naturally to the 11-stage architecture. No monolithic shader.
2. **WGSL, not transpiled GLSL.** Manual port gives control over WebGPU-specific optimizations.
3. **Share `ShaderStateManager` / `InternalShaderState`.** Same state type, different upload mechanism (uniform buffers vs `gl.uniform*`).

---

## Phase 1: Basic Rendering (~2-3 weeks)

**Goal:** Visible image on screen through WebGPU -- passthrough only, no color processing.

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/render/webgpu/WebGPUDevice.ts` | New -- typed device/adapter wrapper |
| `src/render/webgpu/WebGPURenderPipeline.ts` | New -- pipeline + bind group layout management |
| `src/render/webgpu/shaders/passthrough.wgsl` | New -- simple texture blit shader |
| `src/render/WebGPUBackend.ts` | Modify -- implement `clear()`, `renderImage()`, `resize()` |

### Passthrough WGSL Shader

```wgsl
struct Uniforms { offset: vec2f, scale: vec2f }

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(1) @binding(0) var<uniform> u: Uniforms;

@vertex fn vs(@location(0) pos: vec2f, @location(1) uv: vec2f) -> VSOut {
  var out: VSOut;
  out.pos = vec4f(pos * u.scale + u.offset, 0.0, 1.0);
  out.uv = uv;
  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return textureSample(tex, samp, in.uv);
}
```

### Texture Upload Strategy

| Data Type | WebGPU API | Format |
|-----------|-----------|--------|
| `Uint8ClampedArray` (SDR) | `queue.writeTexture()` | `rgba8unorm` |
| `Float32Array` (HDR) | `queue.writeTexture()` | `rgba32float` |
| `VideoFrame` | `queue.copyExternalImageToTexture()` | Direct, zero-copy |
| `ImageBitmap` | `queue.copyExternalImageToTexture()` | Direct |

### Testing

- Unit tests with mocked WebGPU (extend existing `WebGPUBackend.test.ts` pattern)
- E2E pixel parity: render both backends, compare output

---

## Phase 2: Full Shader Pipeline Port (~4-6 weeks)

**Goal:** Port all 11 shader stages from GLSL to WGSL.

### Stage-by-Stage Plan

| Stage | WGSL File | Key Features | Complexity |
|---|---|---|---|
| `inputDecode` | `input_decode.wgsl` | Deinterlace, perspective, spherical, swizzle, unpremultiply | High |
| `linearize` | `linearize.wgsl` | Log-to-linear, EOTF (sRGB/HLG/PQ/SMPTE240M), input primaries | Medium |
| `primaryGrade` | `primary_grade.wgsl` | Exposure, scale/offset, inline LUT, temp/tint, brightness, contrast, saturation | Medium |
| `secondaryGrade` | `secondary_grade.wgsl` | Highlights/shadows, vibrance, hue rotation | Medium |
| `spatialEffects` | `spatial_effects.wgsl` | Clarity (local contrast, neighbor sampling) | Low |
| `colorPipeline` | `color_pipeline.wgsl` | Color wheels, CDL, curves LUT, 3D LUT, HSL qualifier, film emulation | High |
| `sceneAnalysis` | `scene_analysis.wgsl` | Out-of-range viz, tone mapping (8 operators), gamut mapping | High |
| `spatialEffectsPost` | `spatial_effects_post.wgsl` | Sharpen (Laplacian) | Low |
| `displayOutput` | `display_output.wgsl` | Output primaries, display LUT, gamma, brightness, inversion | Medium |
| `diagnostics` | `diagnostics.wgsl` | Channel isolation, false color, contour, zebra, dither | Medium |
| `compositing` | `compositing.wgsl` | SDR clamp, premultiply, background blend | Low |

### Files to Create

| File | Purpose |
|------|---------|
| `src/render/webgpu/shaders/*.wgsl` (11 files) | Per-stage fragment shaders |
| `src/render/webgpu/shaders/common.wgsl` | Shared functions (tone mapping, color space) |
| `src/render/webgpu/WebGPUShaderPipeline.ts` | Multi-pass orchestrator |
| `src/render/webgpu/WebGPUPingPong.ts` | Two-texture alternation |
| `src/render/webgpu/WebGPUStateUploader.ts` | InternalShaderState -> uniform buffers |

### Key GLSL -> WGSL Translations

| GLSL | WGSL |
|------|------|
| `uniform sampler2D tex` | `@group(0) @binding(N) var tex: texture_2d<f32>` + sampler |
| `uniform sampler3D lut` | `var lut: texture_3d<f32>` |
| `texture(tex, uv)` | `textureSample(tex, samp, uv)` |
| `texelFetch(tex, coord, 0)` | `textureLoad(tex, coord, 0)` |
| `uniform mat3` | `mat3x3<f32>` (16-byte aligned columns) |
| `gl_FragCoord` | `@builtin(position)` |

**Shared functions:** Runtime string concatenation of `common.wgsl` + stage WGSL before `createShaderModule()`.

---

## Phase 3: HDR Support (~2-3 weeks)

**Goal:** Full HDR pipeline -- VideoFrame upload, EOTF decoding, HDR output.

### Implementation

- Canvas configuration: `format: 'rgba16float'`, `colorSpace: 'display-p3'`, `toneMapping: { mode: 'extended' }`
- VideoFrame upload: `queue.copyExternalImageToTexture()` with `colorSpace: 'display-p3'`
- EOTF in `linearize.wgsl`: HLG, PQ, SMPTE 240M, sRGB-to-linear

WebGPU HDR is simpler than WebGL2 -- no `drawingBufferColorSpace`/`drawingBufferStorage()` workarounds.

### Files to Modify

- `WebGPUBackend.ts` -- `setHDROutputMode()`, `setHDRHeadroom()`, VideoFrame texture path
- `src/render/webgpu/WebGPUTextureManager.ts` (new) -- texture lifecycle, format selection

---

## Phase 4: Advanced Features (~3-4 weeks)

**Goal:** Feature completeness -- 3D LUTs, scope readback, diagnostics.

### 3D LUT Support

- `src/render/webgpu/WebGPU3DLUT.ts` (new) -- Upload 3D LUT to `rgba32float` `texture_3d`
- Hardware trilinear interpolation via `textureSample()`
- Three insertion points: File LUT, Look LUT, Display LUT

### Scope Readback

- `readPixelFloat()` via `GPUBuffer` with `MAP_READ` + `mapAsync()` (inherently async)
- `src/render/webgpu/WebGPUReadback.ts` (new) -- double-buffered readback

### Compute Shader Opportunities (Future)

| Feature | Current (CPU) | WebGPU Compute | Expected Gain |
|---------|--------------|----------------|---------------|
| Histogram | CPU reduction | Compute dispatch | 10-100x |
| Waveform/vectorscope | CPU scatter | Compute scatter-write | 10-50x |
| LUT baking | CPU pre-compute | Compute dispatch | 5-20x |

---

## Performance Comparison

| Metric | WebGL2 | WebGPU | Expected Gain |
|--------|--------|--------|---------------|
| Uniform uploads | ~90 `gl.uniform*()` calls | Single `writeBuffer()` | 2-5x fewer API calls |
| Multi-pass | FBO bind/unbind | Command buffer batching | ~30% less CPU |
| Texture upload | `texImage2D()` (sync stall) | `queue.writeTexture()` (async) | No main-thread stalls |
| Shader compile | Optional `KHR_parallel_shader_compile` | Always async | Consistent non-blocking |
| Analysis | CPU fallback | Compute shaders | 10-100x for scopes |

---

## Browser Compatibility

| Browser | WebGPU | HDR Canvas | Notes |
|---------|--------|-----------|-------|
| Chrome 113+ | Shipped | `toneMapping: 'extended'` since 121 | Primary target |
| Edge 113+ | Shipped | Same as Chrome | Full parity |
| Firefox 132+ | Shipped | Added 2025 | Naga-based compiler |
| Safari 18+ | Tech Preview | Limited | Behind feature flag |
| iOS Safari | Not available | N/A | No WebGPU yet |

Fallback already in place via `createRenderer.ts`.

---

## Timeline

| Phase | Scope | Estimate |
|-------|-------|----------|
| 1 | Basic rendering | 2-3 weeks |
| 2 | Full shader pipeline | 4-6 weeks |
| 3 | HDR support | 2-3 weeks |
| 4 | Advanced features | 3-4 weeks |
| **Total** | | **11-16 weeks** |

---

## Risks

| Risk | Mitigation |
|------|-----------|
| WGSL spec instability | Pin to stable subset, test across browsers |
| 3D texture sampling differences | Tolerance-based pixel comparison (epsilon 1/256 SDR, 1/1024 HDR) |
| Device lost | Implement `device.lost` handler, fallback to WebGL2 |
| Uniform buffer alignment | `@align(16)` annotations, validate in tests |
| Safari compatibility | Existing WebGL2 fallback handles this |

---

## Critical Files

- `src/render/WebGPUBackend.ts` -- Evolve stubs to working implementation
- `src/render/shaders/viewer.frag.glsl` -- 1,538-line GLSL to port to 11 WGSL files
- `src/render/ShaderPipeline.ts` -- Pattern to replicate for WebGPU
- `src/render/WebGPUHDRBlit.ts` -- Working WGSL reference implementation
- `src/render/ShaderStateManager.ts` -- InternalShaderState shared with WebGPU uniform packing
