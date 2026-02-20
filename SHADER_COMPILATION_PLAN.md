# Implementation Plan: Shader Compilation Blocking (Item 4)

**Priority Score: 10/25** | Risk: MEDIUM | Effort: L

## Summary

5 modules compile 7 programs (14 shaders) synchronously on main thread, blocking 100-300ms. The main display shader already uses `ShaderProgram` with `KHR_parallel_shader_compile`. Extend this pattern to all modules.

## Implementation Order

### Task 4.0: Update Test Mocks (PREREQUISITE)
**Files:** `test/mocks.ts`
- Add `COMPLETION_STATUS_KHR: 0x91B1` constant
- Handle `COMPLETION_STATUS_KHR` in `getShaderParameter`/`getProgramParameter` (return `true`)
- Add `KHR_parallel_shader_compile` to `getExtension` mock

### Task 4.1: Refactor WebGLSharpen (SIMPLEST — proves pattern)
**Files:** `src/filters/WebGLSharpen.ts`
- Replace `gl.createShader/createProgram` with `new ShaderProgram(gl, VS, FS, parallelCompileExt)`
- Add `isReady()`: return `this.shaderProgram?.isReady() ?? false`
- `apply()`: guard with `if (!this.isReady()) return imageData`
- `dispose()`: `this.shaderProgram?.dispose()`
- Defer attribute pointer setup to first `isReady() === true`

### Task 4.2: Refactor WebGLNoiseReduction (SAME PATTERN)
**Files:** `src/filters/WebGLNoiseReduction.ts`
- Same pattern as 4.1
- `process()`: guard with `if (!this.shaderProgram?.isReady()) return imageData`

### Task 4.3: Refactor WebGLLUT
**Files:** `src/color/WebGLLUT.ts`
- Same pattern, slightly more complex (10 uniforms)
- `apply()`/`applyFloat()`: guard with `if (!this.shaderProgram?.isReady()) return data`

### Task 4.4: Refactor GPULUTChain
**Files:** `src/color/pipeline/GPULUTChain.ts`
- Accept `parallelCompileExt` in constructor
- `render()`: guard with `if (!this.shaderProgram?.isReady()) return`
- Caller change: `ColorPipelineManager.ts` passes extension

### Task 4.5: Refactor WebGLScopes (MOST COMPLEX — 3 programs)
**Files:** `src/scopes/WebGLScopes.ts`
- Replace 3 `createProgram()` calls with 3 `ShaderProgram` instances
- `isReady()`: all 3 shaders ready
- Per-method guards: `renderHistogram()`, `renderWaveform()`, `renderVectorscope()`
- Resolve uniforms lazily on first ready

### Task 4.6: Defer WebGLScopes Creation
**Files:** `src/scopes/WebGLScopes.ts`, `src/handlers/sourceLoadedHandlers.ts`
- Add `setScopesHDRMode(active, headroom)` that caches state without creating processor
- `sourceLoadedHandlers.ts`: call `setScopesHDRMode()` instead of `getSharedScopesProcessor()`
- Processor created lazily on first scope panel open

### Task 4.7 (Optional): Defer Filter Init in Viewer.ts
- Keep eager creation but rely on non-blocking compilation from Tasks 4.1-4.2
- Both features default to off; by first use, shaders will have compiled

## Impact
- **Before**: 7 synchronous compilations, 100-300ms main thread block at startup
- **After**: 0ms blocking. All compilation via `KHR_parallel_shader_compile`. CPU fallback for first 1-2 frames if needed.

## Tests per Module
| Module | Test | Assertion |
|--------|------|-----------|
| Each | isReady returns false during parallel compile | Mock COMPLETION_STATUS_KHR=false |
| Each | Returns original data when not ready | Input === output |
| Each | isReady transitions after compile | Mock COMPLETION_STATUS_KHR=true |
| Scopes | Deferred creation caches HDR mode | setScopesHDRMode before creation |
