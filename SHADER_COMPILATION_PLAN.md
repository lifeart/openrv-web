# Implementation Plan: Shader Compilation Blocking (Item 4)

**Priority Score: 10/25** | Risk: MEDIUM | Effort: L

## Summary

5 modules compile 7 programs (14 shaders) synchronously on the main thread, blocking 100-300ms at startup. The main display shader in `Renderer.ts` already uses `ShaderProgram` with `KHR_parallel_shader_compile` (line 319). This plan extends that proven pattern to all remaining modules.

### Modules and Shader Count

| Module | File | Programs | Uniforms | Current Compile Pattern |
|--------|------|----------|----------|------------------------|
| WebGLSharpen | `src/filters/WebGLSharpen.ts` | 1 | 3 | Manual `createShader`/`createProgram` (lines 102-120) |
| WebGLNoiseReduction | `src/filters/WebGLNoiseReduction.ts` | 1 | 5 | Private `createShader`/`createProgram` (lines 146-181) |
| WebGLLUT | `src/color/WebGLLUT.ts` | 1 | 10 | Manual `createShader`/`createProgram` (lines 374-468) |
| GPULUTChain | `src/color/pipeline/GPULUTChain.ts` | 1 | 30+ | Private `createShader`/`createProgram` (lines 258-273) |
| WebGLScopes | `src/scopes/WebGLScopes.ts` | 3 | 16 | Private `createShader`/`createProgram` (lines 412-457) |

### Reference Pattern (Renderer.ts)

```
// Renderer.ts line 276 -- extension probed once
this.parallelCompileExt = gl.getExtension('KHR_parallel_shader_compile');

// Renderer.ts line 319 -- passed to ShaderProgram constructor
this.displayShader = new ShaderProgram(gl, vertexSource, fragSource, this.parallelCompileExt);

// Renderer.ts line 311 -- caller checks readiness before render
isShaderReady(): boolean {
  return this.displayShader.isReady();
}
```

---

## Implementation Order

---

### Task 4.0: Update Test Mocks
**Complexity:** trivial
**Files:** `test/mocks.ts`
**Dependencies:** none

#### Current Code Analysis
`createMockWebGL2Context()` (line 234) is used by `WebGLSharpen.test.ts`, `WebGLNoiseReduction.test.ts`, and `GPULUTChain.test.ts`. Its `getExtension` mock (line 275) currently returns `{}` for `EXT_color_buffer_float` and `OES_texture_float_linear`, and `null` for all others. Its `getShaderParameter` (line 289) always returns `true`, and `getProgramParameter` (line 300) always returns `true`.

The `COMPLETION_STATUS_KHR` constant (`0x91B1`) is not present, and there is no handling for `KHR_parallel_shader_compile` in `getExtension`.

`createMockRendererGL()` (line 34) is used by Renderer tests. Its `getExtension` (line 56) returns `null` for everything. Both mocks need updating.

#### Implementation Steps
1. In `createMockWebGL2Context()` (line 240), add constant: `COMPLETION_STATUS_KHR: 0x91B1` alongside other WebGL constants.
2. In the `getExtension` mock (line 275), add: `if (name === 'KHR_parallel_shader_compile') return {};`
3. In the `getShaderParameter` mock (line 289), handle `COMPLETION_STATUS_KHR`: when the second argument is `0x91B1`, return `true` (simulating instant compilation completion).
4. In the `getProgramParameter` mock (line 300), same: when the second argument is `0x91B1`, return `true`.
5. In `createMockRendererGL()` (line 44), add `COMPLETION_STATUS_KHR: 0x91B1` to the constants block (around line 104-130).
6. In `createMockRendererGL()`, update `getExtension` (line 56) to return `{}` for `KHR_parallel_shader_compile`.
7. In `createMockRendererGL()`, update `getShaderParameter` (line 66) and `getProgramParameter` (line 60) to handle `COMPLETION_STATUS_KHR`.

#### Edge Cases & Risks
- Tests for modules that are NOT yet migrated should still pass because `ShaderProgram` is not used by them yet. The mock additions are backward-compatible.
- Some tests explicitly set `getShaderParameter = vi.fn(() => false)` to simulate compile failure (e.g., `WebGLSharpen.test.ts` line 75, `WebGLNoiseReduction.test.ts` line 121). These override the global mock and will continue to work.
- The `COMPLETION_STATUS_KHR` parameter matching must use numeric comparison (`pname === 0x91B1`) since mock functions receive the raw numeric constant.

#### Test Specifications
**File:** `test/mocks.test.ts` (new file -- minimal)

```typescript
import { describe, it, expect } from 'vitest';
import { createMockWebGL2Context, createMockRendererGL } from './mocks';

describe('Task 4.0: Mock KHR_parallel_shader_compile support', () => {
  it('MOCK-001: createMockWebGL2Context exposes COMPLETION_STATUS_KHR constant', () => {
    const gl = createMockWebGL2Context();
    expect((gl as any).COMPLETION_STATUS_KHR).toBe(0x91B1);
  });

  it('MOCK-002: createMockWebGL2Context.getExtension returns object for KHR_parallel_shader_compile', () => {
    const gl = createMockWebGL2Context();
    expect(gl.getExtension('KHR_parallel_shader_compile')).not.toBeNull();
  });

  it('MOCK-003: createMockWebGL2Context.getShaderParameter returns true for COMPLETION_STATUS_KHR', () => {
    const gl = createMockWebGL2Context();
    const shader = gl.createShader(gl.VERTEX_SHADER);
    expect(gl.getShaderParameter(shader, 0x91B1)).toBe(true);
  });

  it('MOCK-004: createMockWebGL2Context.getProgramParameter returns true for COMPLETION_STATUS_KHR', () => {
    const gl = createMockWebGL2Context();
    const program = gl.createProgram();
    expect(gl.getProgramParameter(program, 0x91B1)).toBe(true);
  });

  it('MOCK-005: createMockRendererGL exposes COMPLETION_STATUS_KHR constant', () => {
    const gl = createMockRendererGL();
    expect((gl as any).COMPLETION_STATUS_KHR).toBe(0x91B1);
  });

  it('MOCK-006: createMockRendererGL.getExtension returns object for KHR_parallel_shader_compile', () => {
    const gl = createMockRendererGL();
    expect(gl.getExtension('KHR_parallel_shader_compile')).not.toBeNull();
  });
});
```

---

### Task 4.1: Refactor WebGLSharpen (SIMPLEST -- proves the pattern)
**Complexity:** small
**Files:** `src/filters/WebGLSharpen.ts`, `src/filters/WebGLSharpen.test.ts`
**Dependencies:** Task 4.0

#### Current Code Analysis
`WebGLSharpenProcessor` (line 68) creates its own GL context in the constructor (line 83-96). The `init()` method (line 98-166) manually calls `createShader` (line 168-183), `createProgram`, and `linkProgram`, then immediately queries `COMPILE_STATUS` and `LINK_STATUS`. It resolves uniform locations (lines 127-129: `u_image`, `u_amount`, `u_texelSize`) and attribute locations (lines 123-124: `a_position`, `a_texCoord`), then sets up buffer bindings and vertex attrib pointers (lines 131-160).

The `apply()` method (line 198) guards on `this.isInitialized` (line 199). The `isReady()` method (line 188-190) returns `this.isInitialized`.

The class is used as:
- A singleton via `getSharedSharpenProcessor()` (line 274) -- used by the Viewer
- Directly instantiated in `Viewer.ts` (line 709): `new WebGLSharpenProcessor()`

**Key observation:** The constructor creates its own canvas and GL context (line 83-88). It does NOT receive a GL context externally. This means we need to probe `KHR_parallel_shader_compile` on this self-created context.

#### Implementation Steps
1. Add `import { ShaderProgram } from '../render/ShaderProgram';` at the top.
2. Add a private field: `private shaderProgram: ShaderProgram | null = null;`
3. Add a private field: `private parallelCompileExt: object | null = null;`
4. In the constructor (line 83-96), after getting the GL context, probe the extension:
   ```typescript
   this.parallelCompileExt = gl.getExtension('KHR_parallel_shader_compile');
   ```
5. Replace the `init()` method body (lines 98-166). Remove the manual `createShader`/`createProgram`/`linkProgram`/`getShaderParameter`/`getProgramParameter` calls (lines 102-120). Instead:
   ```typescript
   this.shaderProgram = new ShaderProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, this.parallelCompileExt);
   ```
6. Remove the `createShader` private method (lines 168-183) entirely.
7. Remove the stored uniform location fields (`uImage`, `uAmount`, `uTexelSize` at lines 79-81) and the `program` field (line 71).
8. Keep the buffer creation and texture creation code. But move vertex attribute setup to a lazy-init method (`setupAttributes`) that runs once on first `isReady() === true`.
9. Add a `private attributesSetUp = false;` field.
10. Update `isReady()` (line 188) to delegate to `this.shaderProgram?.isReady() ?? false`.
11. Update `apply()` (line 198): change the guard from `!this.isInitialized` to `!this.isReady()`. When not ready, return `imageData` unchanged.
12. In `apply()`, replace `gl.useProgram(this.program)` (line 223) with `this.shaderProgram!.use()`.
13. Replace `gl.uniform1i(this.uImage, 0)` (line 224) with `this.shaderProgram!.setUniformInt('u_image', 0)`.
14. Replace `gl.uniform1f(this.uAmount, amount/100)` (line 225) with `this.shaderProgram!.setUniform('u_amount', amount/100)`.
15. Replace `gl.uniform2f(this.uTexelSize, ...)` (line 226) with `this.shaderProgram!.setUniform('u_texelSize', [1.0/width, 1.0/height])`.
16. Update `dispose()` (line 257): replace `gl.deleteProgram(this.program)` with `this.shaderProgram?.dispose()`.

#### Edge Cases & Risks
- **Buffer creation before shader ready:** Buffer creation (`createBuffer`, `bufferData`) does NOT depend on the shader program and can happen immediately. Only `getAttribLocation` and `vertexAttribPointer` require the linked program. These must be deferred.
- **First-frame latency:** If `apply()` is called before the shader compiles, it returns the original `imageData`. Since sharpen defaults to OFF (`filterSettings.sharpen = 0`), and users must enable it, the shader will almost certainly be ready by then. Risk: negligible.
- **`setUniform` type inference:** `ShaderProgram.setUniform()` uses name heuristics for int detection (line 254: checks for `texture` or `sampler` in name). The uniform `u_image` is a sampler, but using `setUniformInt` explicitly is safer.
- **Two-element array for `setUniform`:** A `[1.0/w, 1.0/h]` array has length 2, which maps to `gl.uniform2fv` (line 265). This is correct.

#### Test Specifications
**File:** `src/filters/WebGLSharpen.test.ts`

Add a new `describe` block alongside the existing tests:

```typescript
describe('Task 4.1: Parallel shader compilation', () => {
  it('WGS-030: constructor probes KHR_parallel_shader_compile extension', () => {
    new WebGLSharpenProcessor();
    expect(mockGl.getExtension).toHaveBeenCalledWith('KHR_parallel_shader_compile');
  });

  it('WGS-031: isReady() returns true when ShaderProgram reports ready', () => {
    const processor = new WebGLSharpenProcessor();
    // Mock returns true for COMPLETION_STATUS_KHR, so should be ready
    expect(processor.isReady()).toBe(true);
  });

  it('WGS-032: isReady() returns false during parallel compilation', () => {
    // Override getProgramParameter to return false for COMPLETION_STATUS_KHR
    const originalFn = mockGl.getProgramParameter;
    mockGl.getProgramParameter = vi.fn((program, pname) => {
      if (pname === 0x91B1) return false; // COMPLETION_STATUS_KHR
      return originalFn(program, pname);
    });
    // Also need getShaderParameter to return false for COMPLETION_STATUS_KHR
    const origShaderFn = mockGl.getShaderParameter;
    mockGl.getShaderParameter = vi.fn((shader, pname) => {
      if (pname === 0x91B1) return false;
      return origShaderFn(shader, pname);
    });

    const processor = new WebGLSharpenProcessor();
    expect(processor.isReady()).toBe(false);
  });

  it('WGS-033: apply() returns original imageData when shader not ready', () => {
    const origProgramFn = mockGl.getProgramParameter;
    mockGl.getProgramParameter = vi.fn((program, pname) => {
      if (pname === 0x91B1) return false;
      return origProgramFn(program, pname);
    });
    const origShaderFn = mockGl.getShaderParameter;
    mockGl.getShaderParameter = vi.fn((shader, pname) => {
      if (pname === 0x91B1) return false;
      return origShaderFn(shader, pname);
    });

    const processor = new WebGLSharpenProcessor();
    const imageData = new ImageData(10, 10);
    const result = processor.apply(imageData, 50);
    expect(result).toBe(imageData);
    expect(mockGl.drawArrays).not.toHaveBeenCalled();
  });

  it('WGS-034: dispose() cleans up ShaderProgram resources', () => {
    const processor = new WebGLSharpenProcessor();
    processor.dispose();
    expect(mockGl.deleteProgram).toHaveBeenCalled();
  });

  it('WGS-035: uses ShaderProgram instead of manual shader creation', () => {
    new WebGLSharpenProcessor();
    // ShaderProgram creates 2 shaders, 1 program, links, then (parallel path)
    // does NOT call getShaderParameter(COMPILE_STATUS) or getProgramParameter(LINK_STATUS)
    // It DOES call getShaderParameter(COMPLETION_STATUS_KHR) during isReady()
    expect(mockGl.createShader).toHaveBeenCalledTimes(2);
    expect(mockGl.createProgram).toHaveBeenCalledTimes(1);
    expect(mockGl.linkProgram).toHaveBeenCalledTimes(1);
  });
});
```

---

### Task 4.2: Refactor WebGLNoiseReduction (SAME PATTERN)
**Complexity:** small
**Files:** `src/filters/WebGLNoiseReduction.ts`, `src/filters/WebGLNoiseReduction.test.ts`
**Dependencies:** Task 4.0

#### Current Code Analysis
`WebGLNoiseReductionProcessor` (line 94) receives a canvas from outside (constructor parameter, line 112). It calls `getContext('webgl2')` on it (line 113). The `createShader` method (lines 146-159) and `createProgram` method (lines 161-181) synchronously compile and link the shader, immediately querying `COMPILE_STATUS` (line 152) and `LINK_STATUS` (line 171).

Uniform locations are stored in a typed `uniforms` object (lines 102-108, resolved at lines 128-134). Attribute locations are resolved per-frame in `process()` (lines 282-283) via `gl.getAttribLocation`.

The class has no `isReady()` method. The `process()` method (line 235) has no shader-readiness guard -- it directly uses the program.

The `createNoiseReductionProcessor()` factory function (line 330) creates a canvas and instantiates the processor, with a CPU fallback on failure.

#### Implementation Steps
1. Add `import { ShaderProgram } from '../render/ShaderProgram';`.
2. Replace `private program: WebGLProgram;` (line 96) with `private shaderProgram: ShaderProgram | null = null;`.
3. Add `private parallelCompileExt: object | null = null;`.
4. In the constructor (line 112-144), after getting GL context, probe the extension:
   ```typescript
   this.parallelCompileExt = gl.getExtension('KHR_parallel_shader_compile');
   ```
5. Replace `this.program = this.createProgram(...)` (line 125) with:
   ```typescript
   this.shaderProgram = new ShaderProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, this.parallelCompileExt);
   ```
6. Remove `createShader()` (lines 146-159) and `createProgram()` (lines 161-181) private methods.
7. Defer uniform location resolution. Replace the eager `this.uniforms = { ... }` block (lines 128-134) with lazy resolution on first `isReady()` return of `true`. Add a `private uniformsResolved = false;` flag and a `resolveUniforms()` method.
8. Add a public `isReady()` method: `return this.shaderProgram?.isReady() ?? false;`.
9. In `process()` (line 235), add an early-out guard: `if (!this.isReady()) return imageData;` before any GL calls.
10. Replace `gl.useProgram(this.program)` (line 266) with `this.shaderProgram!.use()`.
11. For uniform calls, use the ShaderProgram's `setUniformInt`, `setUniform` helpers instead of direct `gl.uniform*` calls. **OR** keep direct `gl.uniform*` with lazily-resolved locations from `this.shaderProgram!.getUniformLocation(name)`.
12. For attribute locations in `process()` (lines 282-283), use `this.shaderProgram!.getAttributeLocation('a_position')`.
13. Update `dispose()` (line 316): replace `gl.deleteProgram(this.program)` with `this.shaderProgram?.dispose()`.

#### Edge Cases & Risks
- **Uniform resolution timing:** The `uniforms` object is used in `process()`. If `process()` is called before the shader is ready, the guard returns early. Once ready, uniforms can be resolved lazily from `ShaderProgram.getUniformLocation()`. The cached `Map` inside `ShaderProgram` handles this efficiently.
- **CPU fallback in factory:** The `createNoiseReductionProcessor()` factory (line 330) catches construction errors and falls back to CPU. Since `ShaderProgram` constructor does not throw for parallel compile (errors only surface on `isReady()`), construction will succeed. A shader compile error would only surface when `isReady()` finalizes compilation, at which point it throws `RenderError`. The `process()` guard protects against this.
- **`process()` returns original on not-ready:** This matches the behavior when `strength === 0`. Callers (Viewer.ts) already have CPU fallback logic.

#### Test Specifications
**File:** `src/filters/WebGLNoiseReduction.test.ts`

Add a new `describe` block:

```typescript
describe('Task 4.2: Parallel shader compilation', () => {
  it('WGNR-060: constructor probes KHR_parallel_shader_compile', () => {
    new WebGLNoiseReductionProcessor(mockCanvas);
    expect(mockGl.getExtension).toHaveBeenCalledWith('KHR_parallel_shader_compile');
  });

  it('WGNR-061: isReady() returns true when compilation complete', () => {
    const processor = new WebGLNoiseReductionProcessor(mockCanvas);
    expect(processor.isReady()).toBe(true);
  });

  it('WGNR-062: isReady() returns false during parallel compilation', () => {
    const origProgramFn = mockGl.getProgramParameter;
    mockGl.getProgramParameter = vi.fn((_prog, pname) => {
      if (pname === 0x91B1) return false;
      return origProgramFn(_prog, pname);
    });
    const origShaderFn = mockGl.getShaderParameter;
    mockGl.getShaderParameter = vi.fn((_shader, pname) => {
      if (pname === 0x91B1) return false;
      return origShaderFn(_shader, pname);
    });

    const processor = new WebGLNoiseReductionProcessor(mockCanvas);
    expect(processor.isReady()).toBe(false);
  });

  it('WGNR-063: process() returns original imageData when not ready', () => {
    const origProgramFn = mockGl.getProgramParameter;
    mockGl.getProgramParameter = vi.fn((_prog, pname) => {
      if (pname === 0x91B1) return false;
      return origProgramFn(_prog, pname);
    });
    const origShaderFn = mockGl.getShaderParameter;
    mockGl.getShaderParameter = vi.fn((_shader, pname) => {
      if (pname === 0x91B1) return false;
      return origShaderFn(_shader, pname);
    });

    const processor = new WebGLNoiseReductionProcessor(mockCanvas);
    const imageData = new ImageData(10, 10);
    const result = processor.process(imageData, { ...DEFAULT_NOISE_REDUCTION_PARAMS, strength: 50 });
    expect(result).toBe(imageData);
    expect(mockGl.drawArrays).not.toHaveBeenCalled();
  });

  it('WGNR-064: dispose() cleans up ShaderProgram', () => {
    const processor = new WebGLNoiseReductionProcessor(mockCanvas);
    processor.dispose();
    expect(mockGl.deleteProgram).toHaveBeenCalled();
  });
});
```

---

### Task 4.3: Refactor WebGLLUT
**Complexity:** small-medium
**Files:** `src/color/WebGLLUT.ts`
**Dependencies:** Task 4.0

#### Current Code Analysis
`WebGLLUTProcessor` (line 230) creates its own canvas and GL context in the constructor (lines 276-290). The `init()` method (lines 374-452) performs:
1. Manual shader creation via `createShader()` (lines 454-469)
2. Program creation, attachment, linking (lines 386-396)
3. Immediate `LINK_STATUS` query (line 393)
4. Uniform location resolution for **10 uniforms** (lines 403-412): `u_image`, `u_lut`, `u_intensity`, `u_domainMin`, `u_domainMax`, `u_lutSize`, `u_inMatrix`, `u_outMatrix`, `u_hasInMatrix`, `u_hasOutMatrix`
5. Attribute location resolution (lines 399-400): `a_position`, `a_texCoord`
6. Buffer + VAO setup (lines 414-451)

The class has no `isReady()` method. `isInitialized` (line 242) is set at line 451 and guards `apply()` (line 544) and `applyFloat()` (line 627).

Uniform locations are stored as private fields (`uImage`, `uAmount`, etc., lines 265-274).

The `apply()` method (line 543) uses these directly (e.g., `gl.uniform1i(this.uImage, 0)` at line 591).

**The `uploadMatrixUniforms()` method** (line 519-538) uses stored uniform locations directly with `gl.uniformMatrix4fv`.

The singleton pattern is at lines 809-823 (`getSharedLUTProcessor`, `disposeSharedLUTProcessor`).

#### Implementation Steps
1. Add `import { ShaderProgram } from '../render/ShaderProgram';`.
2. Replace `private program: WebGLProgram | null = null;` (line 233) with `private shaderProgram: ShaderProgram | null = null;`.
3. Add `private parallelCompileExt: object | null = null;`.
4. In constructor, after getting GL context (line 287), probe the extension.
5. In `init()` (line 374), replace manual shader creation (lines 378-396) with:
   ```typescript
   this.shaderProgram = new ShaderProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, this.parallelCompileExt);
   ```
6. Remove `createShader()` method (lines 454-469).
7. Defer uniform resolution: Replace the 10 stored `uXxx` fields (lines 265-274) with lazy resolution from `this.shaderProgram!.getUniformLocation(name)`. Create a `private resolveUniformsIfNeeded()` method that resolves all 10 and stores them, called at the start of `apply()` / `applyFloat()` after the `isReady()` check passes.
8. Defer attribute setup: Move the `getAttribLocation` + `vertexAttribPointer` calls (lines 399-443) to a lazy method called on first ready.
9. Add `isReady()`: `return (this.shaderProgram?.isReady() ?? false) && this.isInitialized;`.
10. In `apply()` (line 543), replace `!this.isInitialized` guard with `!this.isReady()`.
11. In `applyFloat()` (line 621), add same `!this.isReady()` guard.
12. Replace `gl.useProgram(this.program)` (lines 590, 680) with `this.shaderProgram!.use()`.
13. In `uploadMatrixUniforms()` (line 519): keep the `gl.uniformMatrix4fv` calls but resolve locations from `this.shaderProgram!.getUniformLocation(...)`.
14. Update `dispose()` (line 789): replace `gl.deleteProgram(this.program)` (line 792) with `this.shaderProgram?.dispose()`.

#### Edge Cases & Risks
- **10 uniform locations:** Many uniforms, but `ShaderProgram.getUniformLocation()` caches them internally (line 231 of `ShaderProgram.ts`). Using lazy resolution from ShaderProgram is actually cleaner than the current 10 stored fields.
- **`applyFloat()` fallback path:** When `_activePrecision === 'uint8'` (line 636), `applyFloat()` internally calls `this.apply()`. Both methods need the same `isReady()` guard.
- **Matrix upload with `transpose=true`:** `ShaderProgram.setUniformMatrix4()` (line 310) does NOT support `transpose=true` -- it hardcodes `false`. The `uploadMatrixUniforms()` call uses `transpose=true` (line 530). **This means we CANNOT use `ShaderProgram.setUniformMatrix4()` for this case.** We must keep using direct `gl.uniformMatrix4fv` calls with locations from `shaderProgram.getUniformLocation()`. This is the correct approach.
- **`isInitialized` flag usage:** The flag is also set to `false` in `dispose()` (line 802). The `isReady()` method should check both `shaderProgram?.isReady()` AND buffer/texture initialization status.

#### Test Specifications
**File:** `src/color/WebGLLUT.test.ts` (new file)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebGLLUTProcessor } from './WebGLLUT';
import { createMockWebGL2Context } from '../../test/mocks';

describe('Task 4.3: WebGLLUT parallel shader compilation', () => {
  let mockGl: ReturnType<typeof createMockWebGL2Context>;
  let mockCanvas: HTMLCanvasElement;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    mockGl = createMockWebGL2Context();
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockGl),
    } as unknown as HTMLCanvasElement;

    originalCreateElement = document.createElement;
    document.createElement = vi.fn((tag: string) => {
      if (tag === 'canvas') return mockCanvas;
      return originalCreateElement.call(document, tag);
    });
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
  });

  it('LUT-P001: constructor probes KHR_parallel_shader_compile', () => {
    new WebGLLUTProcessor();
    expect(mockGl.getExtension).toHaveBeenCalledWith('KHR_parallel_shader_compile');
  });

  it('LUT-P002: apply() returns original when shader not ready', () => {
    const origProgramFn = mockGl.getProgramParameter;
    mockGl.getProgramParameter = vi.fn((_prog, pname) => {
      if (pname === 0x91B1) return false;
      return origProgramFn(_prog, pname);
    });
    const origShaderFn = mockGl.getShaderParameter;
    mockGl.getShaderParameter = vi.fn((_s, pname) => {
      if (pname === 0x91B1) return false;
      return origShaderFn(_s, pname);
    });

    const processor = new WebGLLUTProcessor();
    const imageData = new ImageData(10, 10);
    const result = processor.apply(imageData, 1.0);
    expect(result).toBe(imageData);
  });

  it('LUT-P003: applyFloat() returns original data when shader not ready', () => {
    const origProgramFn = mockGl.getProgramParameter;
    mockGl.getProgramParameter = vi.fn((_prog, pname) => {
      if (pname === 0x91B1) return false;
      return origProgramFn(_prog, pname);
    });
    const origShaderFn = mockGl.getShaderParameter;
    mockGl.getShaderParameter = vi.fn((_s, pname) => {
      if (pname === 0x91B1) return false;
      return origShaderFn(_s, pname);
    });

    const processor = new WebGLLUTProcessor();
    const data = new Float32Array(10 * 10 * 4);
    const result = processor.applyFloat(data, 10, 10, 1.0);
    expect(result).toBe(data);
  });

  it('LUT-P004: dispose() cleans up ShaderProgram', () => {
    const processor = new WebGLLUTProcessor();
    processor.dispose();
    expect(mockGl.deleteProgram).toHaveBeenCalled();
  });
});
```

---

### Task 4.4: Refactor GPULUTChain
**Complexity:** small-medium
**Files:** `src/color/pipeline/GPULUTChain.ts`, `src/color/pipeline/GPULUTChain.test.ts`, `src/ui/components/ColorPipelineManager.ts`
**Dependencies:** Task 4.0

#### Current Code Analysis
`GPULUTChain` (line 152) receives a `WebGL2RenderingContext` in its constructor (line 170). The `init()` method (line 175) follows the same manual pattern: `createShader` (lines 258-273) + `createProgram` + `linkProgram` + immediate status check (line 194).

It has **30+ uniforms** resolved eagerly (lines 204-222) into a `Record<string, WebGLUniformLocation | null>` (line 166).

The `render()` method (line 369) guards on `!this.isInitialized || !this.program` (line 370). The `applyToCanvas()` method (line 441) guards on `!this.isInitialized || !this.hasAnyLUT()`.

The constructor is called from `ColorPipelineManager.initGPULUTChain()` (line 102 of `ColorPipelineManager.ts`), which creates a canvas + GL context, then passes the GL to `GPULUTChain`.

#### Implementation Steps
1. Add `import { ShaderProgram } from '../../render/ShaderProgram';`.
2. Add `private parallelCompileExt: object | null = null;` and modify constructor signature to accept it: `constructor(gl: WebGL2RenderingContext, parallelCompileExt?: object | null)`.
3. In constructor, store the extension: `this.parallelCompileExt = parallelCompileExt ?? null;`.
4. In `init()`, replace shader creation (lines 179-197) with:
   ```typescript
   this.shaderProgram = new ShaderProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, this.parallelCompileExt);
   ```
5. Replace `private program: WebGLProgram | null = null;` (line 154) with `private shaderProgram: ShaderProgram | null = null;`.
6. Remove `createShader()` method (lines 258-273).
7. Defer uniform resolution from the `uniforms` record. In `render()`, resolve lazily from `this.shaderProgram!.getUniformLocation(name)`. The `uniforms` record can be populated lazily on first `isReady()`.
8. Add public `isReady()`: `return this.shaderProgram?.isReady() ?? false;`.
9. In `render()` (line 369), change guard to `if (!this.isReady())`.
10. In `applyToCanvas()` (line 441), add `isReady()` check.
11. Replace `gl.useProgram(this.program)` (line 374) with `this.shaderProgram!.use()`.
12. Update `dispose()` (line 486): replace `gl.deleteProgram(this.program)` (line 497) with `this.shaderProgram?.dispose()`.
13. **Caller change:** In `ColorPipelineManager.initGPULUTChain()` (line 102 of `ColorPipelineManager.ts`), probe the extension on the chain GL context and pass it:
    ```typescript
    const parallelCompileExt = chainGl.getExtension('KHR_parallel_shader_compile');
    this._gpuLUTChain = new GPULUTChain(chainGl, parallelCompileExt);
    ```

#### Edge Cases & Risks
- **30+ uniforms:** The `uniforms` record pattern (line 166) is convenient. Keep it, but populate lazily after `isReady()`. Alternatively, use `ShaderProgram.getUniformLocation()` which caches internally.
- **`render()` called during pipeline:** `render()` is called from `applyToCanvas()` and from the Renderer's pipeline. If the shader is not ready, the `render()` guard returns silently. The LUT chain simply has no effect for that frame -- correct behavior.
- **`uniformMatrix4fv` with `transpose=true`:** Same issue as Task 4.3. The `uploadStageMatrixUniforms()` (line 336) uses `transpose=true`. Must use `gl.uniformMatrix4fv` directly with `shaderProgram.getUniformLocation()`.

#### Test Specifications
**File:** `src/color/pipeline/GPULUTChain.test.ts`

Add to existing test file:

```typescript
describe('Task 4.4: Parallel shader compilation', () => {
  it('GCHAIN-P001: accepts parallelCompileExt in constructor', () => {
    const ext = {};
    const gl2 = createMockGL();
    const chain2 = new GPULUTChain(gl2, ext);
    // Should not throw
    chain2.dispose();
  });

  it('GCHAIN-P002: isReady() returns true when compilation complete', () => {
    const chain2 = new GPULUTChain(createMockGL());
    expect(chain2.isReady()).toBe(true);
    chain2.dispose();
  });

  it('GCHAIN-P003: render() is no-op when shader not ready', () => {
    const gl2 = createMockGL();
    const origProgramFn = gl2.getProgramParameter;
    (gl2.getProgramParameter as ReturnType<typeof vi.fn>).mockImplementation(
      (_prog: unknown, pname: number) => {
        if (pname === 0x91B1) return false;
        return (origProgramFn as Function)(_prog, pname);
      }
    );
    const origShaderFn = gl2.getShaderParameter;
    (gl2.getShaderParameter as ReturnType<typeof vi.fn>).mockImplementation(
      (_s: unknown, pname: number) => {
        if (pname === 0x91B1) return false;
        return (origShaderFn as Function)(_s, pname);
      }
    );

    const chain2 = new GPULUTChain(gl2, {});
    chain2.setFileLUT(createTestLUT3D());
    chain2.render(100, 100);

    expect(gl2.drawArrays).not.toHaveBeenCalled();
    chain2.dispose();
  });
});
```

---

### Task 4.5: Refactor WebGLScopes (MOST COMPLEX -- 3 programs)
**Complexity:** medium
**Files:** `src/scopes/WebGLScopes.ts`
**Dependencies:** Task 4.0

#### Current Code Analysis
`WebGLScopesProcessor` (line 264) creates its own canvas and GL context in the constructor (lines 324-348). The `init()` method (line 356-410) creates **3 programs** via `createProgram()` (lines 362-364):
- `this.histogramProgram` = histogram bar VS + FS
- `this.waveformProgram` = waveform VS + FS
- `this.vectorscopeProgram` = vectorscope VS + FS

Each program's uniform locations are resolved eagerly into typed objects (lines 371-394):
- `histogramUniforms` (5 uniforms)
- `waveformUniforms` (6 uniforms)
- `vectorscopeUniforms` (5 uniforms)

The `createProgram()` method (lines 412-440) and `createShader()` (lines 442-457) follow the same synchronous pattern.

The `isReady()` method (line 557-559) returns `this.isInitialized`.

The per-scope render methods guard individually:
- `renderHistogram()` (line 699): guards on `!this.isInitialized || !this.histogramProgram || !this.histogramDataTexture`
- `renderWaveform()` (line 782): guards on `!this.isInitialized || !this.waveformProgram || this.vertexCount === 0`
- `renderVectorscope()` (line 849): guards on `!this.isInitialized || !this.vectorscopeProgram || this.vertexCount === 0`

The singleton is at lines 930-949.

#### Implementation Steps
1. Add `import { ShaderProgram } from '../render/ShaderProgram';`.
2. Replace three `WebGLProgram | null` fields (lines 268-270) with three `ShaderProgram | null` fields:
   ```typescript
   private histogramShader: ShaderProgram | null = null;
   private waveformShader: ShaderProgram | null = null;
   private vectorscopeShader: ShaderProgram | null = null;
   ```
3. Add `private parallelCompileExt: object | null = null;`.
4. In constructor, after GL context creation (line 338), probe the extension.
5. In `init()` (line 356), replace the 3 `createProgram()` calls (lines 362-364) with:
   ```typescript
   this.histogramShader = new ShaderProgram(gl, HISTOGRAM_BAR_VERTEX_SHADER, HISTOGRAM_BAR_FRAGMENT_SHADER, this.parallelCompileExt);
   this.waveformShader = new ShaderProgram(gl, WAVEFORM_VERTEX_SHADER, WAVEFORM_FRAGMENT_SHADER, this.parallelCompileExt);
   this.vectorscopeShader = new ShaderProgram(gl, VECTORSCOPE_VERTEX_SHADER, VECTORSCOPE_FRAGMENT_SHADER, this.parallelCompileExt);
   ```
6. Remove `createShader()` and `createProgram()` private methods (lines 412-457).
7. Defer uniform resolution: Create a `private uniformsResolved = false;` flag and a `resolveUniforms()` method that populates `histogramUniforms`, `waveformUniforms`, `vectorscopeUniforms` from the respective ShaderProgram's `getUniformLocation()`. Call it from each render method after confirming readiness.
8. Update `isReady()` (line 557) to check all 3 shaders:
   ```typescript
   isReady(): boolean {
     return (this.histogramShader?.isReady() ?? false)
         && (this.waveformShader?.isReady() ?? false)
         && (this.vectorscopeShader?.isReady() ?? false);
   }
   ```
9. Update per-method guards:
   - `renderHistogram()`: replace `!this.histogramProgram` with `!this.histogramShader?.isReady()`.
   - `renderWaveform()`: replace `!this.waveformProgram` with `!this.waveformShader?.isReady()`.
   - `renderVectorscope()`: replace `!this.vectorscopeProgram` with `!this.vectorscopeShader?.isReady()`.
10. Replace `gl.useProgram(this.histogramProgram)` (line 741) with `this.histogramShader!.use()`, etc.
11. Update `dispose()` (line 888-927): replace `gl.deleteProgram(this.histogramProgram)` etc. with `this.histogramShader?.dispose()` etc.

#### Edge Cases & Risks
- **3 programs compiling simultaneously:** The `KHR_parallel_shader_compile` extension allows all 6 shaders + 3 link operations to proceed in parallel on the GPU driver thread. This maximizes the benefit.
- **Partial readiness:** Individual scope types could become ready at different times. The per-method guards allow this naturally: if only the histogram shader is ready, histogram rendering works while waveform/vectorscope silently skip.
- **`getSharedScopesProcessor()` callers:** Multiple components call `getSharedScopesProcessor()` and check `.isReady()` before using it: `Histogram.ts` (line 301), `Waveform.ts` (line 251), `Vectorscope.ts` (line 268). They all already have the `if (gpuProcessor && gpuProcessor.isReady())` pattern, so the `isReady()` change is transparent. However, with partial readiness, individual render methods now have their own guards, so the top-level `isReady()` returning `false` means ALL scopes fall back to CPU until ALL shaders are ready. This is actually simpler but slightly wasteful.
- **Alternative:** Keep `isReady()` returning true once ALL 3 are ready (consistency). Individual render methods add their own shader-specific guards as well, as defense-in-depth.
- **No attribute buffers:** The scopes use `gl_VertexID` in vertex shaders (attributeless rendering via `gl.drawArrays(gl.POINTS/TRIANGLES, 0, count)`). There are no attribute bindings except for a VAO (line 359). This simplifies the migration -- no attribute setup to defer.

#### Test Specifications
**File:** `src/scopes/WebGLScopes.test.ts` (new file)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebGLScopesProcessor } from './WebGLScopes';
import { createMockWebGL2Context } from '../../test/mocks';

describe('Task 4.5: WebGLScopes parallel shader compilation', () => {
  let mockGl: ReturnType<typeof createMockWebGL2Context>;
  let mockCanvas: HTMLCanvasElement;
  let mockDownscaleCanvas: HTMLCanvasElement;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    mockGl = createMockWebGL2Context();

    // WebGLScopes creates its own canvas + downscale canvas + src canvas
    let canvasCount = 0;
    const canvasProxies: HTMLCanvasElement[] = [];

    originalCreateElement = document.createElement;
    document.createElement = vi.fn((tag: string) => {
      if (tag === 'canvas') {
        const canvas = {
          width: 0,
          height: 0,
          getContext: vi.fn((contextId: string, _opts?: unknown) => {
            if (contextId === 'webgl2') return mockGl;
            if (contextId === '2d') {
              return {
                putImageData: vi.fn(),
                getImageData: vi.fn(() => new ImageData(1, 1)),
                drawImage: vi.fn(),
              };
            }
            return null;
          }),
        } as unknown as HTMLCanvasElement;
        canvasProxies.push(canvas);
        return canvas;
      }
      return originalCreateElement.call(document, tag);
    });

    // Add VAO and TRIANGLES constants
    (mockGl as any).createVertexArray = vi.fn(() => ({}));
    (mockGl as any).bindVertexArray = vi.fn();
    (mockGl as any).deleteVertexArray = vi.fn();
    (mockGl as any).TRIANGLES = 4;
    (mockGl as any).POINTS = 0;
    (mockGl as any).COLOR_BUFFER_BIT = 0x4000;
    (mockGl as any).BLEND = 0x0BE2;
    (mockGl as any).ONE = 1;
    (mockGl as any).SRC_ALPHA = 0x0302;
    (mockGl as any).ONE_MINUS_SRC_ALPHA = 0x0303;
    (mockGl as any).enable = vi.fn();
    (mockGl as any).blendFunc = vi.fn();
    // Add getExtension for WEBGL_lose_context (used in dispose)
    const origGetExt = mockGl.getExtension;
    mockGl.getExtension = vi.fn((name: string) => {
      if (name === 'WEBGL_lose_context') return { loseContext: vi.fn() };
      return origGetExt(name);
    });
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
  });

  it('SCOPE-P001: constructor probes KHR_parallel_shader_compile', () => {
    new WebGLScopesProcessor();
    expect(mockGl.getExtension).toHaveBeenCalledWith('KHR_parallel_shader_compile');
  });

  it('SCOPE-P002: creates 3 ShaderProgram instances (6 shaders, 3 programs)', () => {
    new WebGLScopesProcessor();
    expect(mockGl.createShader).toHaveBeenCalledTimes(6);
    expect(mockGl.createProgram).toHaveBeenCalledTimes(3);
  });

  it('SCOPE-P003: isReady() returns true when all 3 programs complete', () => {
    const processor = new WebGLScopesProcessor();
    expect(processor.isReady()).toBe(true);
  });

  it('SCOPE-P004: isReady() returns false when any program is still compiling', () => {
    let callCount = 0;
    const origProgramFn = mockGl.getProgramParameter;
    mockGl.getProgramParameter = vi.fn((_prog, pname) => {
      if (pname === 0x91B1) {
        callCount++;
        // Third program not ready
        return callCount <= 2;
      }
      return origProgramFn(_prog, pname);
    });

    const processor = new WebGLScopesProcessor();
    expect(processor.isReady()).toBe(false);
  });

  it('SCOPE-P005: dispose() cleans up all 3 ShaderPrograms', () => {
    const processor = new WebGLScopesProcessor();
    processor.dispose();
    expect(mockGl.deleteProgram).toHaveBeenCalledTimes(3);
  });
});
```

---

### Task 4.6: Defer WebGLScopes Creation
**Complexity:** small
**Files:** `src/scopes/WebGLScopes.ts`, `src/handlers/sourceLoadedHandlers.ts`
**Dependencies:** Task 4.5

#### Current Code Analysis
`getSharedScopesProcessor()` (line 932 of `WebGLScopes.ts`) eagerly creates the `WebGLScopesProcessor` singleton on first call. This singleton is called from:
1. `sourceLoadedHandlers.ts` line 57: `const scopesProcessor = getSharedScopesProcessor();` -- just to call `setHDRMode()`.
2. `Histogram.ts` line 300: `getSharedScopesProcessor()` -- to render histogram.
3. `Waveform.ts` line 250: `getSharedScopesProcessor()` -- to render waveform.
4. `Vectorscope.ts` line 267: `getSharedScopesProcessor()` -- to render vectorscope.

The `sourceLoadedHandlers.ts` call (line 57) triggers the full GPU initialization even though the scopes may not be visible. The actual scope rendering (items 2-4) only happens when their respective panels are open.

#### Implementation Steps
1. In `WebGLScopes.ts`, add a module-level HDR cache:
   ```typescript
   let cachedHDRActive: boolean = false;
   let cachedHDRHeadroom: number | null = null;
   ```
2. Add a new exported function:
   ```typescript
   export function setScopesHDRMode(active: boolean, headroom?: number): void {
     cachedHDRActive = active;
     cachedHDRHeadroom = headroom ?? null;
     // If processor already exists, apply immediately
     if (sharedProcessor) {
       sharedProcessor.setHDRMode(active, headroom);
     }
   }
   ```
3. In `getSharedScopesProcessor()` (line 932), after creating the processor, apply the cached HDR state:
   ```typescript
   if (sharedProcessor) {
     sharedProcessor.setHDRMode(cachedHDRActive, cachedHDRHeadroom ?? undefined);
   }
   ```
4. In `sourceLoadedHandlers.ts` (line 8), import `setScopesHDRMode` instead of (or in addition to) `getSharedScopesProcessor`.
5. Replace the `scopesProcessor?.setHDRMode(...)` calls (lines 81, 89, 93) with `setScopesHDRMode(...)`.
6. Remove the `const scopesProcessor = getSharedScopesProcessor();` line (line 57) since it is no longer needed for HDR mode setting in this handler. Note: `getSharedScopesProcessor` is still imported and used by `Histogram.ts`, `Waveform.ts`, `Vectorscope.ts`.

#### Edge Cases & Risks
- **Existing callers:** `Histogram.ts`, `Waveform.ts`, `Vectorscope.ts` still call `getSharedScopesProcessor()`. They only do so when their panels are visible and `update()` is called. The lazy creation continues to work as before for them.
- **Multiple `setHDRMode` calls before processor creation:** The cache variables hold the LAST state set. When the processor is eventually created, it gets the correct final state. This is fine because HDR mode is always set from a single source of truth (the source-loaded handler).
- **Race condition:** If a scope panel opens at the exact same time as a source load, both paths converge: the panel triggers `getSharedScopesProcessor()` which creates the processor and applies cached HDR state, and the source handler sets the cache. Order does not matter because both write the same HDR state.

#### Test Specifications
**File:** `src/scopes/WebGLScopes.test.ts` (add to existing or new)

```typescript
describe('Task 4.6: Deferred scopes creation', () => {
  it('SCOPE-D001: setScopesHDRMode caches state without creating processor', () => {
    // Ensure the shared processor does not exist (call disposeSharedScopesProcessor first)
    disposeSharedScopesProcessor();

    setScopesHDRMode(true, 6.0);
    // getSharedScopesProcessor() should NOT have been called
    // (We can verify by checking that no WebGL context was created)
    // Just verify it doesn't throw
  });

  it('SCOPE-D002: getSharedScopesProcessor applies cached HDR mode', () => {
    disposeSharedScopesProcessor();
    setScopesHDRMode(true, 5.0);

    const processor = getSharedScopesProcessor();
    expect(processor).not.toBeNull();
    // Check HDR mode was applied
    expect(processor!.getMaxValue()).toBe(5.0);
  });

  it('SCOPE-D003: setScopesHDRMode applies immediately if processor exists', () => {
    const processor = getSharedScopesProcessor();
    expect(processor).not.toBeNull();

    setScopesHDRMode(true, 8.0);
    expect(processor!.getMaxValue()).toBe(8.0);

    setScopesHDRMode(false);
    expect(processor!.getMaxValue()).toBe(1.0);
  });
});
```

**File:** `src/handlers/sourceLoadedHandlers.test.ts` (new or extend if exists)

```typescript
describe('Task 4.6: sourceLoadedHandlers uses setScopesHDRMode', () => {
  it('SLH-D001: handleSourceLoaded calls setScopesHDRMode instead of getSharedScopesProcessor', () => {
    // Verify the import changed: setScopesHDRMode is called
    // and getSharedScopesProcessor is NOT called from sourceLoadedHandlers
  });
});
```

---

### Task 4.7 (Optional): Defer Filter Init in Viewer.ts
**Complexity:** trivial
**Files:** `src/ui/components/Viewer.ts`
**Dependencies:** Tasks 4.1, 4.2

#### Current Code Analysis
The Viewer constructor (line ~695) eagerly creates:
- `WebGLSharpenProcessor` at line 709: `this.sharpenProcessor = new WebGLSharpenProcessor()`
- Noise reduction processor at line 717: `this.noiseReductionProcessor = createNoiseReductionProcessor()`

Both are used in `renderFrame()` where they are guarded by `isReady()`:
- Sharpen at line 2824: `if (this.sharpenProcessor && this.sharpenProcessor.isReady())`
- Noise reduction has no explicit `isReady()` in the current code but wraps in try/catch

Both features default to OFF:
- Sharpen: `filterSettings.sharpen = 0` (from `DEFAULT_FILTER_SETTINGS`)
- Noise reduction: `noiseReductionParams.strength = 0` (from `DEFAULT_NOISE_REDUCTION_PARAMS`)

#### Implementation Steps
**No code changes needed.** With Tasks 4.1 and 4.2 complete, the eager creation is already non-blocking. The ShaderProgram compiles asynchronously, and by the time the user enables either feature (requires UI interaction), compilation will have finished. The `isReady()` guards provide a seamless fallback (CPU path) if the shader is somehow still compiling.

#### Edge Cases & Risks
- **Extremely fast interaction:** If a user enables sharpen within the first few milliseconds of app load, the shader may not be ready. The CPU fallback path handles this gracefully.
- **No test changes needed.** The existing tests already verify the CPU fallback behavior.

---

## Dependency Graph

```
Task 4.0 (mocks) <-- prerequisite for all others
    |
    +-- Task 4.1 (WebGLSharpen)     -- simplest, proves pattern
    +-- Task 4.2 (WebGLNoiseReduction) -- same pattern
    +-- Task 4.3 (WebGLLUT)         -- more uniforms
    +-- Task 4.4 (GPULUTChain)      -- crosses to ColorPipelineManager
    +-- Task 4.5 (WebGLScopes)      -- 3 programs, most complex
         |
         +-- Task 4.6 (Defer Scopes) -- depends on 4.5's isReady()

Task 4.7 (Optional) depends on 4.1 + 4.2
```

Tasks 4.1-4.5 are independent of each other and can be parallelized.

---

## Impact

- **Before**: 7 synchronous compilations across 5 modules. 14 shader compile + 7 program link operations block the main thread for 100-300ms at startup. On lower-end GPUs, this can exceed 500ms.
- **After**: 0ms synchronous blocking. All compilation proceeds on the GPU driver thread via `KHR_parallel_shader_compile`. The main thread submits 14 shader compiles + 7 program links and immediately continues. CPU fallback provides seamless degradation for the first 1-2 frames if needed.
- **Fallback**: When `KHR_parallel_shader_compile` is not available (older browsers/drivers), `ShaderProgram` constructor falls back to synchronous compilation (existing behavior). No regression.

## Comprehensive Test Matrix

| Module | Test ID | Assertion | Priority |
|--------|---------|-----------|----------|
| Mocks | MOCK-001..006 | Constants/extensions present in mocks | Must-have |
| WebGLSharpen | WGS-030..035 | Parallel compilation, isReady false/true, apply guard | Must-have |
| WebGLNoiseReduction | WGNR-060..064 | Same pattern as sharpen | Must-have |
| WebGLLUT | LUT-P001..004 | Parallel compilation, apply/applyFloat guards | Must-have |
| GPULUTChain | GCHAIN-P001..003 | Constructor extension, isReady, render no-op when not ready | Must-have |
| WebGLScopes | SCOPE-P001..005 | 3 programs, aggregate isReady, dispose all 3 | Must-have |
| Scopes Defer | SCOPE-D001..003 | HDR mode caching, lazy processor creation | Should-have |
| Existing Tests | ALL existing | Must continue to pass (regression) | Must-have |

## Implementation Notes

### ShaderProgram API Reference (for implementers)

```typescript
// Constructor: compile + link (async if ext provided, sync otherwise)
new ShaderProgram(gl, vertexSource, fragmentSource, parallelCompileExt?)

// Poll compilation status (non-blocking)
shaderProgram.isReady(): boolean

// Wait for compilation (Promise, for async initialization)
shaderProgram.waitForCompilation(): Promise<void>

// Bind program
shaderProgram.use(): void

// Uniform/attribute location caching
shaderProgram.getUniformLocation(name): WebGLUniformLocation | null
shaderProgram.getAttributeLocation(name): number

// Typed uniform setters (convenience)
shaderProgram.setUniform(name, value): void      // auto-detects type
shaderProgram.setUniformInt(name, value): void    // explicit int
shaderProgram.setUniformMatrix4(name, value): void // 4x4 matrix (transpose=false!)
shaderProgram.setUniformMatrix3(name, value): void // 3x3 matrix (transpose=false!)

// Cleanup
shaderProgram.dispose(): void
```

### Important Caveat: `uniformMatrix4fv` with `transpose=true`

`ShaderProgram.setUniformMatrix4()` hardcodes `transpose=false` (line 313). Both `WebGLLUT` and `GPULUTChain` upload matrices with `transpose=true` (row-major to column-major conversion). For these cases, use:
```typescript
gl.uniformMatrix4fv(this.shaderProgram.getUniformLocation('u_inMatrix'), true, matrixData);
```
Do NOT use `shaderProgram.setUniformMatrix4()` for these matrices.
