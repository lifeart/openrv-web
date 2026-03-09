# Implementation Plan: GPU Integration Tests via Vitest Browser Mode + Playwright

> **Status:** All phases COMPLETE (1-6).
> **Estimated remaining effort:** None — all phases implemented.

## Motivation

The current test suite (19,800+ tests) runs entirely in jsdom, which mocks all canvas/WebGL/WebGPU APIs. This means:

- Shader compilation errors are never caught until manual testing
- Pixel-accuracy regressions in the 11-stage pipeline go undetected
- WebGL2 vs WebGPU parity is untested
- Tone mapping, color grading, and LUT application produce no verifiable output

GPU integration tests running in a real browser (Chromium via Playwright) will close these gaps.

---

## Phase 1: Infrastructure Setup ✅ COMPLETE

**Effort:** ~3 days
**Deliverables:** Config files, npm scripts, CI workflow, first passing GPU test

### 1.1 New Dependencies

```bash
pnpm add -D @vitest/browser playwright
```

Vitest Browser Mode (available since Vitest 1.x, stable in 4.x) runs tests inside a real browser via Playwright. The existing `@playwright/test` dependency is for E2E page-level tests and is separate from the Vitest browser provider.

### 1.2 Vitest Browser Config

Create a dedicated config file so GPU tests are fully isolated from the 19,800 jsdom-based unit tests.

**File:** `/Users/lifeart/Repos/openrv-web/vitest.browser.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'gpu',
    include: ['src/**/*.gpu-test.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [
        {
          browser: 'chromium',
          launch: {
            args: [
              // Enable GPU even in headless mode (uses SwiftShader/ANGLE)
              '--enable-gpu',
              '--enable-webgl',
              '--enable-webgpu',
              '--use-angle=swiftshader',
              '--enable-unsafe-swiftshader',
              // Deterministic rendering
              '--disable-gpu-vsync',
              '--disable-frame-rate-limit',
            ],
          },
        },
      ],
    },
    // No jsdom setup file — we are in a real browser
    setupFiles: ['./test/gpu-setup.ts'],
    // Longer timeouts for GPU operations
    testTimeout: 30_000,
    hookTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
});
```

### 1.3 GPU Test Setup File

**File:** `/Users/lifeart/Repos/openrv-web/test/gpu-setup.ts`

```typescript
/**
 * Setup file for GPU integration tests (runs inside real browser).
 * No jsdom mocks needed — we have real DOM, Canvas, WebGL2, and (possibly) WebGPU.
 */

// Expose test marker for Renderer.initialize() preserveDrawingBuffer logic
(window as any).__OPENRV_TEST__ = true;
```

### 1.4 npm Scripts

Add to `package.json`:

```jsonc
{
  "scripts": {
    // ...existing scripts...
    "test:gpu": "vitest run --config vitest.browser.config.ts",
    "test:gpu:watch": "vitest watch --config vitest.browser.config.ts",
    "test:gpu:ui": "vitest --config vitest.browser.config.ts --ui"
  }
}
```

### 1.5 File Naming Convention

- GPU test files: `*.gpu-test.ts`
- Located alongside the code they test: `src/render/__gpu__/*.gpu-test.ts`
- Excluded from the main `vitest.config.ts` by pattern (already excluded since `include` only matches `*.test.ts` / `*.spec.ts`)

### 1.6 Smoke Test (Phase 1 Validation)

**File:** `src/render/__gpu__/smoke.gpu-test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('GPU Smoke Test', () => {
  it('creates a WebGL2 context on a real canvas', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const gl = canvas.getContext('webgl2');
    expect(gl).not.toBeNull();
    expect(gl!.getParameter(gl!.VERSION)).toContain('WebGL 2.0');
  });

  it('compiles a trivial GLSL shader', () => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2')!;
    const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(shader, `#version 300 es
      precision highp float;
      out vec4 fragColor;
      void main() { fragColor = vec4(1.0, 0.0, 0.0, 1.0); }
    `);
    gl.compileShader(shader);
    expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS)).toBe(true);
    gl.deleteShader(shader);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  });
});
```

---

## Phase 2: Test Helpers & Utilities ✅ COMPLETE

**Effort:** ~4 days
**Deliverables:** Reusable helper module at `src/render/__gpu__/helpers/`

### 2.1 Directory Structure

```
src/render/__gpu__/
  helpers/
    webgl2.ts           # WebGL2 context, shader compile, fullscreen quad
    webgpu.ts           # WebGPU adapter, device, pipeline helpers
    pixels.ts           # Readback & comparison utilities
    textures.ts         # Known test patterns (solid color, gradient, ramp)
    tolerance.ts        # Epsilon definitions per test category
  smoke.gpu-test.ts
  shader-compile.gpu-test.ts
  linearize.gpu-test.ts
  primary-grade.gpu-test.ts
  display-output.gpu-test.ts
  compositing.gpu-test.ts
  pipeline-passthrough.gpu-test.ts
  cross-backend.gpu-test.ts
  texture-sampling.gpu-test.ts
```

### 2.2 WebGL2 Helper (`helpers/webgl2.ts`)

```typescript
/**
 * Creates a WebGL2 context with predictable settings for testing.
 * Returns { gl, canvas } — caller must call gl.getExtension('WEBGL_lose_context')?.loseContext()
 * in afterEach to release GPU resources.
 */
export function createTestGL(width = 64, height = 64): {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true, // required for readPixels after draw
  });
  if (!gl) throw new Error('WebGL2 not available');
  return { gl, canvas };
}

/**
 * Compiles a shader and returns the WebGLShader handle.
 * Throws with the info log on failure.
 */
export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed:\n${log}`);
  }
  return shader;
}

/**
 * Links a vertex + fragment shader into a program.
 * Throws with the info log on failure.
 */
export function linkProgram(
  gl: WebGL2RenderingContext,
  vertShader: WebGLShader,
  fragShader: WebGLShader
): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || 'unknown error';
    gl.deleteProgram(program);
    throw new Error(`Program link failed:\n${log}`);
  }
  return program;
}

/**
 * Creates a fullscreen-quad VAO (2 triangles covering [-1,1] clip space).
 * Used to drive the fragment shader with v_texCoord in [0,1].
 */
export function createFullscreenQuad(gl: WebGL2RenderingContext): {
  vao: WebGLVertexArrayObject;
  draw: () => void;
  dispose: () => void;
} {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  // positions + texcoords interleaved
  const data = new Float32Array([
    // x, y, u, v
    -1, -1, 0, 0,
     1, -1, 1, 0,
    -1,  1, 0, 1,
     1,  1, 1, 1,
  ]);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

  // a_position (location 0)
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  // a_texCoord (location 1)
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

  gl.bindVertexArray(null);

  return {
    vao,
    draw: () => {
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose: () => {
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
    },
  };
}
```

### 2.3 WebGPU Helper (`helpers/webgpu.ts`)

```typescript
/**
 * Creates a WebGPU device for testing.
 * Returns null if WebGPU is not available (test should be skipped).
 */
export async function createTestDevice(): Promise<{
  device: GPUDevice;
  adapter: GPUAdapter;
} | null> {
  if (!('gpu' in navigator)) return null;
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  return { device, adapter };
}

/**
 * Creates a shader module from WGSL source.
 * Throws if compilation produces errors.
 */
export async function createShaderModule(
  device: GPUDevice,
  code: string,
  label?: string
): Promise<GPUShaderModule> {
  const module = device.createShaderModule({ code, label });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === 'error');
  if (errors.length > 0) {
    throw new Error(
      `WGSL compilation errors:\n${errors.map((e) => `  line ${e.lineNum}: ${e.message}`).join('\n')}`
    );
  }
  return module;
}
```

### 2.4 Pixel Readback & Comparison (`helpers/pixels.ts`)

```typescript
/**
 * Read pixels from a WebGL2 context (RGBA, unsigned byte).
 * The context must have preserveDrawingBuffer: true.
 */
export function readPixelsGL(
  gl: WebGL2RenderingContext,
  x = 0,
  y = 0,
  width?: number,
  height?: number
): Uint8Array {
  const w = width ?? gl.drawingBufferWidth;
  const h = height ?? gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return buf;
}

/**
 * Read float pixels from a WebGL2 FBO (RGBA32F or RGBA16F).
 */
export function readPixelsGLFloat(
  gl: WebGL2RenderingContext,
  fbo: WebGLFramebuffer,
  width: number,
  height: number
): Float32Array {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const buf = new Float32Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, buf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return buf;
}

/**
 * Read pixels from a WebGPU render texture.
 */
export async function readPixelsGPU(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number
): Promise<Float32Array> {
  const bytesPerRow = Math.ceil((width * 16) / 256) * 256; // 16 = 4 * f32, align to 256
  const bufferSize = bytesPerRow * height;
  const readBuffer = device.createBuffer({
    size: bufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer(
    { texture },
    { buffer: readBuffer, bytesPerRow },
    { width, height }
  );
  device.queue.submit([encoder.finish()]);
  await readBuffer.mapAsync(GPUMapMode.READ);
  const mapped = new Float32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();
  readBuffer.destroy();
  // Remove row padding
  const result = new Float32Array(width * height * 4);
  const pixelsPerRow = bytesPerRow / 4;
  for (let row = 0; row < height; row++) {
    result.set(
      mapped.subarray(row * pixelsPerRow, row * pixelsPerRow + width * 4),
      row * width * 4
    );
  }
  return result;
}

/** RGBA pixel value. */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Assert that a pixel at (x, y) matches expected RGBA within tolerance.
 * Coordinates are bottom-left origin (WebGL convention).
 */
export function expectPixel(
  pixels: Uint8Array | Float32Array,
  width: number,
  x: number,
  y: number,
  expected: RGBA,
  epsilon: number
): void {
  const idx = (y * width + x) * 4;
  const actual: RGBA = {
    r: pixels[idx]!,
    g: pixels[idx + 1]!,
    b: pixels[idx + 2]!,
    a: pixels[idx + 3]!,
  };
  const diffs = {
    r: Math.abs(actual.r - expected.r),
    g: Math.abs(actual.g - expected.g),
    b: Math.abs(actual.b - expected.b),
    a: Math.abs(actual.a - expected.a),
  };
  const maxDiff = Math.max(diffs.r, diffs.g, diffs.b, diffs.a);
  if (maxDiff > epsilon) {
    throw new Error(
      `Pixel (${x},${y}) mismatch: expected RGBA(${expected.r},${expected.g},${expected.b},${expected.a}) ` +
        `got RGBA(${actual.r},${actual.g},${actual.b},${actual.a}), max diff=${maxDiff}, epsilon=${epsilon}`
    );
  }
}
```

### 2.5 Test Texture Factory (`helpers/textures.ts`)

```typescript
/**
 * Create a 1x1 solid-color texture (WebGL2).
 * Returns the texture and a dispose function.
 */
export function createSolidTexture(
  gl: WebGL2RenderingContext,
  r: number, g: number, b: number, a: number,
  format: 'uint8' | 'float32' = 'uint8'
): { texture: WebGLTexture; dispose: () => void } {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  if (format === 'float32') {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT,
      new Float32Array([r, g, b, a]));
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([r * 255, g * 255, b * 255, a * 255]));
  }

  return { texture, dispose: () => gl.deleteTexture(texture) };
}

/**
 * Create a horizontal gradient texture (left=black, right=white) for ramp tests.
 */
export function createGradientTexture(
  gl: WebGL2RenderingContext,
  width: number
): { texture: WebGLTexture; dispose: () => void } {
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const v = Math.round((i / (width - 1)) * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return { texture, dispose: () => gl.deleteTexture(texture) };
}
```

### 2.6 Tolerance Definitions (`helpers/tolerance.ts`)

```typescript
/**
 * Epsilon values for pixel comparison, calibrated for different precision contexts.
 */
export const EPSILON = {
  /** 8-bit SDR: 1/256 = ~0.0039 */
  SDR_BYTE: 1 / 256,

  /** 8-bit SDR with some headroom for rounding across 2+ stages: 2/256 */
  SDR_BYTE_RELAXED: 2 / 256,

  /** Integer pixel values (0-255 range) */
  SDR_INT: 1,

  /** Relaxed integer (0-255 range, multi-stage) */
  SDR_INT_RELAXED: 2,

  /** Float pipeline (RGBA16F): suitable for HDR tests */
  HDR_HALF: 1 / 1024,

  /** Float pipeline (RGBA32F): tightest tolerance */
  HDR_FULL: 1 / 65536,

  /** Cross-backend comparison (WebGL2 vs WebGPU): wider tolerance for driver differences */
  CROSS_BACKEND: 3 / 256,
} as const;
```

---

## Phase 3: Test Categories (P0 — Shader Compilation & Linking) ✅ COMPLETE

**Effort:** ~2 days
**Deliverables:** All shaders proven to compile on a real GPU

### 3.1 GLSL Shader Compilation Tests

**File:** `src/render/__gpu__/shader-compile.gpu-test.ts`

Tests for all 7 GLSL shader files:

| File | Type |
|------|------|
| `viewer.vert.glsl` | Vertex |
| `viewer.frag.glsl` | Fragment (monolithic pipeline) |
| `passthrough.vert.glsl` | Vertex |
| `compositing.frag.glsl` | Fragment |
| `luminance.frag.glsl` | Fragment |
| `transition.vert.glsl` | Vertex |
| `transition.frag.glsl` | Fragment |

Each test:
1. Creates a WebGL2 context
2. Loads the GLSL source via Vite's `?raw` import
3. Calls `compileShader()` helper
4. Asserts `COMPILE_STATUS === true`
5. For vert+frag pairs, also tests `linkProgram()` to verify varying/uniform compatibility

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { createTestGL, compileShader, linkProgram } from './helpers/webgl2';

import vertSrc from '../shaders/viewer.vert.glsl?raw';
import fragSrc from '../shaders/viewer.frag.glsl?raw';
import passthroughVertSrc from '../shaders/passthrough.vert.glsl?raw';
import compositingFragSrc from '../shaders/compositing.frag.glsl?raw';

describe('GLSL Shader Compilation (real GPU)', () => {
  let gl: WebGL2RenderingContext;

  afterEach(() => {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });

  it('viewer.vert.glsl compiles', () => {
    ({ gl } = createTestGL());
    const shader = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    gl.deleteShader(shader);
  });

  it('viewer.frag.glsl compiles', () => {
    ({ gl } = createTestGL());
    const shader = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    gl.deleteShader(shader);
  });

  it('viewer pipeline links successfully', () => {
    ({ gl } = createTestGL());
    const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    const prog = linkProgram(gl, vert, frag);
    gl.deleteProgram(prog);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
  });

  // ... similar tests for other shader pairs
});
```

### 3.2 WGSL Shader Compilation Tests

**File:** `src/render/__gpu__/wgsl-compile.gpu-test.ts`

Tests for all 13 WGSL shader files under `src/render/webgpu/shaders/`:

| Stage WGSL | Common prepended? |
|---|---|
| `common.wgsl` | N/A (utility, no entry point) |
| `passthrough.wgsl` | No |
| `linearize.wgsl` | Yes |
| `input_decode.wgsl` | Yes |
| `primary_grade.wgsl` | Yes |
| `secondary_grade.wgsl` | Yes |
| `spatial_effects.wgsl` | Yes |
| `color_pipeline.wgsl` | Yes |
| `scene_analysis.wgsl` | Yes |
| `spatial_effects_post.wgsl` | Yes |
| `display_output.wgsl` | Yes |
| `diagnostics.wgsl` | Yes |
| `compositing.wgsl` | Yes |

Each test:
1. Requests a WebGPU device (skip test if unavailable)
2. Loads WGSL source, prepends `common.wgsl` where required
3. Creates a shader module via `createShaderModule()` helper
4. Asserts no compilation errors via `getCompilationInfo()`

```typescript
import { describe, it, expect } from 'vitest';
import { createTestDevice, createShaderModule } from './helpers/webgpu';

import commonSrc from '../webgpu/shaders/common.wgsl?raw';
import linearizeSrc from '../webgpu/shaders/linearize.wgsl?raw';
// ... other imports

describe('WGSL Shader Compilation (real GPU)', () => {
  it('linearize.wgsl compiles', async () => {
    const gpu = await createTestDevice();
    if (!gpu) return; // skip if no WebGPU
    try {
      await createShaderModule(gpu.device, commonSrc + '\n' + linearizeSrc, 'linearize');
    } finally {
      gpu.device.destroy();
    }
  });

  // ... similar for each stage
});
```

---

## Phase 4: Test Categories (P1 — Single-Stage Pixel Accuracy) ✅ COMPLETE

**Effort:** ~5 days
**Deliverables:** Pixel-verified tests for each of the 11 pipeline stages

### Approach

For each stage, we create a minimal test shader that isolates just that stage's logic. We do NOT use the full `viewer.frag.glsl` (which has all 11 stages). Instead, we extract the relevant GLSL code block and wrap it in a minimal fragment shader with known inputs.

However, the full monolithic shader can also be tested in single-stage mode by setting all other uniforms to identity values.

### 4.1 Linearize Stage

**File:** `src/render/__gpu__/linearize.gpu-test.ts`

Test cases:
- sRGB EOTF: input `sRGB(0.5)` -> expected linear `~0.2140` (via the `srgbEOTF` formula)
- sRGB EOTF: input `sRGB(0.0)` -> expected linear `0.0`
- sRGB EOTF: input `sRGB(1.0)` -> expected linear `1.0`
- HLG EOTF: known test value
- PQ EOTF: known test value
- Identity: when `u_inputTransfer = 0` and input is already linear, output should match

```typescript
it('sRGB EOTF: mid-gray 0.5 -> ~0.214', () => {
  // Upload a 1x1 texture with sRGB value 0.5 (= 128/255 in uint8)
  // Set u_inputTransfer = 0 (sRGB)
  // Render through the linearize stage
  // Read back float pixels from FBO
  // Expect approximately 0.2140 (the sRGB EOTF of 0.5)
});
```

### 4.2 Primary Grade Stage

**File:** `src/render/__gpu__/primary-grade.gpu-test.ts`

Test cases:
- Exposure +1 stop: input `0.5` -> output `1.0` (multiply by 2^1)
- Exposure -1 stop: input `0.5` -> output `0.25`
- Brightness +0.1: input `0.5` -> output `0.6`
- Contrast 2.0: input `0.25` -> output further from mid-gray
- Saturation 0.0: color -> luminance (grayscale)
- Temperature shift: neutral gray should shift blue/yellow
- Scale/Offset: multiplicative scale and additive offset
- Identity: all adjustments at default -> output matches input

### 4.3 Display Output Stage

**File:** `src/render/__gpu__/display-output.gpu-test.ts`

Test cases:
- Linear -> sRGB inverse EOTF: input `0.2140` -> output `~0.5`
- Gamma curve: known gamma value, verify output
- Inversion: input `0.3` -> output `0.7`
- Identity: no display transform -> passthrough

### 4.4 Compositing Stage

**File:** `src/render/__gpu__/compositing.gpu-test.ts`

Test cases:
- Premultiply: RGBA(0.5, 0.5, 0.5, 0.5) -> RGBA(0.25, 0.25, 0.25, 0.5)
- Unpremultiply -> premultiply roundtrip: output matches input
- SDR clamp: values > 1.0 clamped to 1.0 in SDR mode
- Background blend: alpha < 1.0 with checkerboard pattern

### 4.5 Other Stages

Similar patterns for:
- **Secondary Grade:** highlights/shadows, vibrance, hue rotation
- **Spatial Effects:** clarity (requires multi-pixel input texture)
- **Color Pipeline:** CDL (slope/offset/power), curves, 3D LUT application
- **Scene Analysis:** tone mapping operators (Reinhard, ACES, etc.)
- **Spatial Effects Post:** sharpen
- **Diagnostics:** false color, zebra, channel isolation
- **Input Decode:** unpremultiply, swizzle

---

## Phase 5: Test Categories (P2-P4) ✅ COMPLETE

**Effort:** ~5 days

### 5.1 P2 — Multi-Pass Pipeline Tests

**File:** `src/render/__gpu__/pipeline-passthrough.gpu-test.ts`

Uses the actual `Renderer` class (not isolated shader snippets).

```typescript
import { Renderer } from '../Renderer';
import type { IPImage } from '../../core/image/Image';

describe('Full Pipeline Integration', () => {
  it('passthrough: solid red input -> solid red output', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const renderer = new Renderer();
    renderer.initialize(canvas);

    const pixels = new Uint8Array(4 * 4 * 4);
    // Fill with red (sRGB uint8)
    for (let i = 0; i < 4 * 4; i++) {
      pixels[i * 4] = 255;
      pixels[i * 4 + 1] = 0;
      pixels[i * 4 + 2] = 0;
      pixels[i * 4 + 3] = 255;
    }

    const image: IPImage = {
      width: 4,
      height: 4,
      channels: 4,
      data: pixels,
      dataType: 'uint8',
    };

    renderer.renderImage(image);
    const gl = renderer.getContext()!;
    const output = new Uint8Array(4 * 4 * 4);
    gl.readPixels(0, 0, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, output);

    // Verify output is still red (all pipeline stages should be identity)
    expectPixel(output, 4, 0, 0, { r: 255, g: 0, b: 0, a: 255 }, EPSILON.SDR_INT_RELAXED);

    renderer.dispose();
  });

  it('enabling exposure changes output', () => {
    // Same setup, but call renderer.setColorAdjustments({ exposure: 1.0, ... })
    // Verify output pixels differ from input
  });
});
```

### 5.2 P3 — Cross-Backend Parity Tests

**File:** `src/render/__gpu__/cross-backend.gpu-test.ts`

```typescript
import { Renderer } from '../Renderer';
import { WebGPUBackend } from '../WebGPUBackend';

describe('Cross-Backend Parity (WebGL2 vs WebGPU)', () => {
  it('tone mapping ACES produces same output ± tolerance', async () => {
    // Skip if WebGPU unavailable
    if (!('gpu' in navigator)) return;

    // Create identical input image
    const image = createTestImage(64, 64, 'hdr-ramp');

    // Render via WebGL2
    const webgl2Output = renderViaWebGL2(image, {
      toneMappingOperator: 3, // ACES
    });

    // Render via WebGPU
    const webgpuOutput = await renderViaWebGPU(image, {
      toneMappingOperator: 3,
    });

    // Compare all pixels with cross-backend tolerance
    comparePixelArrays(webgl2Output, webgpuOutput, EPSILON.CROSS_BACKEND);
  });
});
```

### 5.3 P4 — Texture Sampling Tests

**File:** `src/render/__gpu__/texture-sampling.gpu-test.ts`

Test cases:
- Bilinear filtering: 2x1 texture (black, white), sample at u=0.5 -> expect gray (~0.5)
- Nearest filtering: same setup, sample at u=0.5 -> expect either black or white
- 3D LUT: identity LUT produces no change
- 3D LUT: known transform (e.g., invert) produces expected output

---

## Phase 6: CI Configuration ✅ COMPLETE

**Effort:** ~2 days
**Deliverables:** GitHub Actions workflow, automated GPU test gate

### 6.1 GitHub Actions Workflow

**File:** `.github/workflows/gpu-tests.yml`

```yaml
name: GPU Integration Tests

on:
  push:
    branches: [master]
    paths:
      - 'src/render/**'
      - 'vitest.browser.config.ts'
  pull_request:
    branches: [master]
    paths:
      - 'src/render/**'
      - 'vitest.browser.config.ts'

concurrency:
  group: gpu-${{ github.ref }}
  cancel-in-progress: true

jobs:
  gpu-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium

      # SwiftShader is bundled with Chromium — no separate install needed.
      # The --use-angle=swiftshader flag in vitest.browser.config.ts activates it.

      - name: Run GPU integration tests
        run: pnpm test:gpu
        env:
          # Headless Chromium on Linux CI needs these
          DISPLAY: ':99'

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: gpu-test-results
          path: test-results/
          retention-days: 7

  gpu-tests-macos:
    # macOS runner has real GPU access (Metal/MoltenVK)
    # Run weekly or on-demand for higher-fidelity GPU testing
    if: github.event_name == 'push' && github.ref == 'refs/heads/master'
    runs-on: macos-latest
    timeout-minutes: 20
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium

      - name: Run GPU integration tests
        run: pnpm test:gpu
```

### 6.2 Skipping GPU Tests When No GPU

Tests should gracefully handle missing GPU support:

```typescript
// In each test file or a shared beforeAll:
import { createTestGL } from './helpers/webgl2';

function skipIfNoWebGL2() {
  try {
    const { gl } = createTestGL();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    console.warn('WebGL2 not available, skipping GPU tests');
    return true;
  }
  return false;
}
```

For WebGPU tests, `createTestDevice()` already returns `null` when unavailable. Tests should early-return (not throw) in that case.

---

## Tolerance Strategy

### Numerical Pixel Comparison (Primary Approach)

We use direct numerical comparison rather than baseline images because:
1. Baseline images are fragile across GPU driver versions and OS updates
2. Our shader math is deterministic — expected values can be computed analytically
3. Numerical comparison is faster (no image I/O, no golden file management)

### Epsilon Tiers

| Context | Epsilon | Rationale |
|---------|---------|-----------|
| SDR 8-bit single-stage | 1/256 (0.0039) | One LSB of precision |
| SDR 8-bit multi-stage | 2/256 (0.0078) | Accumulated rounding across 2+ stages |
| SDR integer (0-255 comparison) | 1 | One step |
| HDR float16 | 1/1024 | Half-float precision floor |
| HDR float32 | 1/65536 | FP32 precision floor |
| Cross-backend | 3/256 (0.012) | Different GPU paths may diverge slightly |

### Driver-Specific Differences

SwiftShader (software rasterizer in CI) may produce slightly different results from hardware GPUs. Mitigation:
- Use the `SDR_INT_RELAXED` / `SDR_BYTE_RELAXED` epsilon for tests expected to run on SwiftShader
- Tag tests that require hardware GPU with `it.skipIf(isSwiftShader)(...)`
- Detect SwiftShader via `gl.getParameter(gl.RENDERER)` containing `"SwiftShader"`

---

## File Structure Summary

```
openrv-web/
  vitest.browser.config.ts              # NEW — browser mode config for GPU tests
  test/
    setup.ts                            # EXISTING — jsdom test setup
    gpu-setup.ts                        # NEW — browser test setup (minimal)
  src/render/__gpu__/
    helpers/
      webgl2.ts                         # Context creation, shader compile, fullscreen quad
      webgpu.ts                         # Device creation, shader module creation
      pixels.ts                         # readPixels, pixel comparison
      textures.ts                       # Solid color, gradient, ramp test textures
      tolerance.ts                      # Epsilon constants
    smoke.gpu-test.ts                   # P0: basic WebGL2 context + trivial shader
    shader-compile.gpu-test.ts          # P0: all GLSL shaders compile & link
    wgsl-compile.gpu-test.ts            # P0: all WGSL shaders compile
    linearize.gpu-test.ts              # P1: sRGB/HLG/PQ EOTF pixel accuracy
    primary-grade.gpu-test.ts          # P1: exposure, brightness, contrast, saturation
    display-output.gpu-test.ts         # P1: output transfer, gamma, inversion
    compositing.gpu-test.ts            # P1: premultiply, SDR clamp
    secondary-grade.gpu-test.ts        # P1: highlights/shadows, vibrance, hue
    color-pipeline.gpu-test.ts         # P1: CDL, curves, 3D LUT
    scene-analysis.gpu-test.ts         # P1: tone mapping operators
    pipeline-passthrough.gpu-test.ts   # P2: full Renderer class, passthrough
    cross-backend.gpu-test.ts          # P3: WebGL2 vs WebGPU parity
    texture-sampling.gpu-test.ts       # P4: bilinear, nearest, 3D LUT sampling
  .github/workflows/
    gpu-tests.yml                      # NEW — CI workflow
```

---

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Flaky tests from GPU driver differences** | Medium | High | Use relaxed epsilon tiers; SwiftShader detection; macOS weekly run for hardware validation |
| **CI runner GPU availability** | Low | High | SwiftShader is bundled with Chromium — works on headless Linux. No special GPU hardware needed. |
| **Browser startup overhead** | Medium | Low | Vitest Browser Mode reuses the browser instance across tests. Expect ~5s startup + ~0.5s per test. Total suite < 2 min. |
| **WebGPU not available in CI** | Medium | Medium | WebGPU tests use early-return skip pattern. WebGL2 is the primary target. WebGPU parity tests run only when available. |
| **Maintenance burden of pixel baselines** | N/A | N/A | We use numerical comparison, not image baselines. Expected values are computed analytically. |
| **Shader source changes break GPU tests** | Medium | Low | GPU tests import shaders via `?raw`, so they track source changes automatically. Test failures indicate real regressions. |
| **Vitest Browser Mode stability** | Low | Medium | Vitest 4.x has stable browser mode. Fallback: convert to Playwright-only E2E tests if needed. |

---

## Rollout Order

| Phase | What | Estimated Effort | Dependencies |
|-------|------|-----------------|--------------|
| **1** | Infrastructure: config, scripts, CI, smoke test | 3 days | None | ✅ COMPLETE |
| **2** | Test helpers & utilities | 4 days | Phase 1 | ✅ COMPLETE |
| **3** | P0: Shader compilation & linking | 2 days | Phase 2 | ✅ COMPLETE |
| **4** | P1: Single-stage pixel accuracy (all 11 stages) | 5 days | Phase 2 | ✅ COMPLETE |
| **5** | P2-P4: Full pipeline, cross-backend, texture sampling | 5 days | Phase 4 | ✅ COMPLETE |
| **6** | CI workflow, SwiftShader tuning, documentation | 2 days | Phase 5 | ✅ COMPLETE |

All phases complete.
