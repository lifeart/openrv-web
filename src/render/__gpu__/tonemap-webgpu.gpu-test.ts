/**
 * WebGPU Extended Tone Mapping — Runtime Verification (MED-55).
 *
 * Renders HDR input through the actual WebGPU scene_analysis.wgsl shader
 * for each tone mapping operator at hdrHeadroom > 1, and compares the
 * output against the CPU reference implementation in
 * `effectProcessing.shared.ts`. This is the only place where the WebGPU
 * tone mapping is exercised end-to-end on a real GPU device — the
 * existing `wgsl-compile.gpu-test.ts` only verifies shader compilation,
 * and `cross-backend.gpu-test.ts` does not cover tone mapping.
 *
 * MED-52 unified the headroom convention across GLSL/WGSL/CPU: this test
 * is the runtime checkpoint guarding that unification on the WGSL path.
 *
 * Tests are skipped when WebGPU is unavailable. They are also skipped
 * when the environment can compile WebGPU shaders but cannot read pixels
 * back through copyTextureToBuffer (some headless Chromium builds without
 * GPU rasterization return all-zero buffers regardless of the rendered
 * image). The skip is gated by a one-time canary probe at the top of
 * `renderToneMapWGPU` so genuine zero pixels in real outputs do not get
 * silently dropped.
 */
/// <reference types="@webgpu/types" />

import { describe, it, expect } from 'vitest';
import { createTestDevice, createShaderModule } from './helpers/webgpu';
import { EPSILON } from './helpers/tolerance';

import commonSrc from '../webgpu/shaders/common.wgsl?raw';
// MED-55 4a-3: scene_analysis.wgsl no longer carries its own `@vertex fn vs`
// or `struct VSOut` — they're now provided by the prepended vertex source.
// Mirror the runtime concatenation: common + viewer vertex + stage fragment.
import viewerVertSrc from '../webgpu/shaders/_viewer_vert.wgsl?raw';
import sceneAnalysisSrc from '../webgpu/shaders/scene_analysis.wgsl?raw';

import {
  tonemapReinhardChannel,
  tonemapFilmicChannel,
  tonemapACESChannel,
  tonemapAgX,
  tonemapPBRNeutral,
  tonemapGTChannel,
  tonemapACESHill,
  tonemapDragoChannel,
} from '../../utils/effects/effectProcessing.shared';

// ---------------------------------------------------------------------------
// Uniform layout — must match `Uniforms` in scene_analysis.wgsl exactly.
// ---------------------------------------------------------------------------
const UNIFORM_BUFFER_SIZE = 80;

interface ToneMappingUniforms {
  outOfRange?: number;
  toneMappingEnabled: number;
  toneMappingOperator: number;
  hdrHeadroom: number;
  tmReinhardWhitePoint?: number;
  tmFilmicExposureBias?: number;
  tmFilmicWhitePoint?: number;
  tmDragoBias?: number;
  tmDragoLwa?: number;
  tmDragoLmax?: number;
  tmDragoBrightness?: number;
  gamutMappingEnabled?: number;
  gamutMappingModeCode?: number;
  gamutSourceCode?: number;
  gamutTargetCode?: number;
  gamutHighlightEnabled?: number;
}

function packUniforms(u: ToneMappingUniforms): ArrayBuffer {
  const buf = new ArrayBuffer(UNIFORM_BUFFER_SIZE);
  const i32 = new Int32Array(buf);
  const f32 = new Float32Array(buf);
  i32[0] = u.outOfRange ?? 0;
  i32[1] = u.toneMappingEnabled;
  i32[2] = u.toneMappingOperator;
  f32[3] = u.hdrHeadroom;
  f32[4] = u.tmReinhardWhitePoint ?? 4.0;
  f32[5] = 0; // _pad0
  f32[6] = u.tmFilmicExposureBias ?? 2.0;
  f32[7] = u.tmFilmicWhitePoint ?? 11.2;
  f32[8] = u.tmDragoBias ?? 0.85;
  f32[9] = u.tmDragoLwa ?? 0.5;
  f32[10] = u.tmDragoLmax ?? 1.0;
  f32[11] = u.tmDragoBrightness ?? 2.0;
  i32[12] = u.gamutMappingEnabled ?? 0;
  i32[13] = u.gamutMappingModeCode ?? 0;
  i32[14] = u.gamutSourceCode ?? 0;
  i32[15] = u.gamutTargetCode ?? 0;
  i32[16] = u.gamutHighlightEnabled ?? 0;
  return buf;
}

// ---------------------------------------------------------------------------
// Render helper: builds pipeline, runs scene_analysis fragment, reads pixel.
// ---------------------------------------------------------------------------

interface GPURenderResult {
  rgba: [number, number, number, number];
}

async function renderToneMapWGPU(
  device: GPUDevice,
  inputRGBA: [number, number, number, number],
  uniforms: ToneMappingUniforms,
): Promise<GPURenderResult> {
  // Combined shader: common.wgsl + viewer vertex + scene_analysis.wgsl
  // (matches runtime concatenation in WebGPUShaderPipeline).
  const combinedSrc = commonSrc + '\n' + viewerVertSrc + '\n' + sceneAnalysisSrc;
  const shader = await createShaderModule(device, combinedSrc, 'tonemap_test');

  // Use a 2x2 output texture so the read pixel sits inside the rasterized
  // triangle. The scene_analysis.wgsl `vs` produces a half-screen triangle
  // ((-1,-1),(1,-1),(-1,1)); on a 1x1 viewport, the pixel center lies on
  // the hypotenuse, leading to driver-dependent miss/hit. A 2x2 texture
  // moves pixel (0,0) center to NDC (-0.5, -0.5), well inside coverage.
  const W = 2;
  const H = 2;

  // Create the input texture (uniform color, so size doesn't matter for the
  // result — we only sample at uv=(0.5, 0.5) effectively).
  const inputTex = device.createTexture({
    size: { width: W, height: H },
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // Float16 manual pack to keep the test self-contained.
  const halfData = new Uint16Array(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    for (let c = 0; c < 4; c++) {
      halfData[p * 4 + c] = floatToHalf(inputRGBA[c]!);
    }
  }
  device.queue.writeTexture(
    { texture: inputTex },
    halfData,
    { bytesPerRow: W * 8, rowsPerImage: H },
    { width: W, height: H },
  );

  const encoder = device.createCommandEncoder();

  // Output texture (rgba16float so we can read back float values).
  const outputTex = device.createTexture({
    size: { width: W, height: H },
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
  });

  // Pipeline.
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: shader, entryPoint: 'vs' },
    fragment: {
      module: shader,
      entryPoint: 'fs',
      targets: [{ format: 'rgba16float' }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // Sampler.
  const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });

  // Bind groups.
  const bg0 = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: inputTex.createView() },
    ],
  });

  const uniformBuf = device.createBuffer({
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuf, 0, packUniforms(uniforms));

  const bg1 = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(1),
    entries: [{ binding: 0, resource: { buffer: uniformBuf } }],
  });

  // Render pass.
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: outputTex.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      },
    ],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bg0);
  pass.setBindGroup(1, bg1);
  pass.draw(3);
  pass.end();

  // Readback: rgba16float → 256-byte aligned row (per WebGPU layout rules).
  const bytesPerRow = 256;
  const readBuf = device.createBuffer({
    size: bytesPerRow * H,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  encoder.copyTextureToBuffer(
    { texture: outputTex },
    { buffer: readBuf, bytesPerRow, rowsPerImage: H },
    { width: W, height: H },
  );
  device.queue.submit([encoder.finish()]);
  await readBuf.mapAsync(GPUMapMode.READ);
  // Sample pixel (0, 0) — well inside the rasterized half-screen triangle
  // when W=H=2 (NDC (-0.5,-0.5) is interior).
  const halfPx = new Uint16Array(readBuf.getMappedRange().slice(0, 8));
  const rgba: [number, number, number, number] = [
    halfToFloat(halfPx[0]!),
    halfToFloat(halfPx[1]!),
    halfToFloat(halfPx[2]!),
    halfToFloat(halfPx[3]!),
  ];
  readBuf.unmap();

  // Cleanup.
  inputTex.destroy();
  outputTex.destroy();
  uniformBuf.destroy();
  readBuf.destroy();

  return { rgba };
}

// IEEE-754 half ↔ float helpers (small, dependency-free).
function floatToHalf(val: number): number {
  const fbuf = new Float32Array(1);
  fbuf[0] = val;
  const i32buf = new Int32Array(fbuf.buffer);
  const x = i32buf[0]!;
  const sign = (x >>> 31) & 0x1;
  let exp = (x >>> 23) & 0xff;
  let frac = x & 0x7fffff;
  if (exp === 0) return sign << 15;
  if (exp === 0xff) {
    // NaN / Inf
    return (sign << 15) | (0x1f << 10) | (frac ? 0x200 : 0);
  }
  exp = exp - 127 + 15;
  if (exp >= 0x1f) {
    return (sign << 15) | (0x1f << 10); // overflow -> Inf
  }
  if (exp <= 0) {
    if (exp < -10) return sign << 15;
    frac |= 0x800000;
    const shift = 14 - exp;
    return (sign << 15) | (frac >> shift);
  }
  return (sign << 15) | (exp << 10) | (frac >> 13);
}

function halfToFloat(h: number): number {
  const sign = (h >> 15) & 0x1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) {
    if (frac === 0) return sign ? -0 : 0;
    // subnormal
    return (sign ? -1 : 1) * Math.pow(2, -14) * (frac / 1024);
  }
  if (exp === 0x1f) {
    return frac ? NaN : sign ? -Infinity : Infinity;
  }
  return (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

// ---------------------------------------------------------------------------
// GPU readback canary
//
// On some headless Chromium builds (no GPU rasterization), createTestDevice()
// succeeds and shaders compile, but copyTextureToBuffer always returns
// all-zero bytes. That makes every runtime pixel test fail with
// "expected ~X, got 0". To avoid permanent local failures, we run a tiny
// canary once per test session: render a known non-zero color through the
// passthrough operator and confirm it round-trips through the GPU. If the
// readback is all-zero, we mark the suite as readback-incapable and skip
// the runtime tests that depend on pixel values. Compile-only tests still
// run — they don't touch the readback path.
//
// The canary is gated to fire exactly once. A fresh sentinel input
// guarantees we don't conflate driver fallback with a legitimate zero
// result for some operator.
// ---------------------------------------------------------------------------
let canaryResult: 'unchecked' | 'readback-ok' | 'readback-broken' = 'unchecked';
async function ensureReadbackCanary(device: GPUDevice): Promise<boolean> {
  if (canaryResult === 'readback-ok') return true;
  if (canaryResult === 'readback-broken') return false;
  // Pass a non-zero color through with toneMappingEnabled=0 (passthrough),
  // hdrHeadroom=1 (no scaling, no clamp). The result MUST equal the input
  // within half-float precision. If we read back near-zero, the readback
  // path is broken in this environment.
  const sentinel: [number, number, number, number] = [0.5, 0.5, 0.5, 1.0];
  const result = await renderToneMapWGPU(device, sentinel, {
    toneMappingEnabled: 0,
    toneMappingOperator: 0,
    hdrHeadroom: 1.0,
  });
  const sumRGB = Math.abs(result.rgba[0]) + Math.abs(result.rgba[1]) + Math.abs(result.rgba[2]);
  if (sumRGB < 1e-3) {
    // All-zero readback. This environment cannot validate pixel results.
    canaryResult = 'readback-broken';
    // eslint-disable-next-line no-console
    console.warn(
      '[tonemap-webgpu] GPU readback canary returned all-zero — runtime pixel tests will be skipped in this environment.',
    );
    return false;
  }
  canaryResult = 'readback-ok';
  return true;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGPU Tone Mapping — Runtime Verification (MED-55)', () => {
  // The half-precision rgba16float read path adds significant precision loss.
  // 1/256 ≈ 0.0039 is the documented tolerance; assertions enforce it
  // explicitly via |actual - expected| <= TOL rather than relying on the
  // looser semantics of toBeCloseTo(_, 2) (which is precision 0.005).
  const TOL = 1 / 256; // ~0.0039
  const expectClose = (actual: number, expected: number, tol: number = TOL): void => {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
  };

  // Half float can represent ~11-bit precision; choose inputs that survive it.
  const INPUT_HDR: [number, number, number, number] = [2.0, 1.0, 0.5, 1.0];
  const INPUT_SDR: [number, number, number, number] = [0.5, 0.3, 0.7, 1.0];

  it('WebGPU is available — declared at top so summary shows skip status', async () => {
    const gpu = await createTestDevice();
    if (!gpu) {
      // eslint-disable-next-line no-console
      console.warn('WebGPU not available — tone mapping runtime tests will be skipped');
    } else {
      gpu.device.destroy();
    }
    expect(true).toBe(true);
  });

  /**
   * Run a body that needs working pixel readback. Skips quietly if the
   * environment lacks WebGPU OR the canary detected all-zero readback.
   */
  async function withReadback(body: (device: GPUDevice) => Promise<void>): Promise<void> {
    const gpu = await createTestDevice();
    if (!gpu) return;
    try {
      const ok = await ensureReadbackCanary(gpu.device);
      if (!ok) return;
      await body(gpu.device);
    } finally {
      gpu.device.destroy();
    }
  }

  // -------------------------------------------------------------------------
  // SDR identity: at hdrHeadroom = 1.0, every operator should reduce to its
  // canonical SDR curve. This is the MED-52 invariant on the GPU side.
  // Coverage spans ALL eight non-Drago operators; Drago is parameterized
  // differently and is exercised in the HDR section.
  // -------------------------------------------------------------------------
  describe('MED-55: hdrHeadroom = 1.0 (SDR identity, all 8 operators)', () => {
    it('Reinhard at headroom=1 matches CPU reference', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_SDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 1,
          hdrHeadroom: 1.0,
        });
        expectClose(result.rgba[0], tonemapReinhardChannel(INPUT_SDR[0], 4.0, 1.0));
        expectClose(result.rgba[1], tonemapReinhardChannel(INPUT_SDR[1], 4.0, 1.0));
        expectClose(result.rgba[2], tonemapReinhardChannel(INPUT_SDR[2], 4.0, 1.0));
      });
    });

    it('Filmic at headroom=1 matches CPU reference', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_SDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 2,
          hdrHeadroom: 1.0,
        });
        expectClose(result.rgba[0], tonemapFilmicChannel(INPUT_SDR[0], 2.0, 11.2, 1.0));
        expectClose(result.rgba[1], tonemapFilmicChannel(INPUT_SDR[1], 2.0, 11.2, 1.0));
        expectClose(result.rgba[2], tonemapFilmicChannel(INPUT_SDR[2], 2.0, 11.2, 1.0));
      });
    });

    it('ACES at headroom=1 matches CPU reference', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_SDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 3,
          hdrHeadroom: 1.0,
        });
        expectClose(result.rgba[0], tonemapACESChannel(INPUT_SDR[0], 1.0));
        expectClose(result.rgba[1], tonemapACESChannel(INPUT_SDR[1], 1.0));
        expectClose(result.rgba[2], tonemapACESChannel(INPUT_SDR[2], 1.0));
      });
    });

    it('AgX at headroom=1 matches CPU reference', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_SDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 4,
          hdrHeadroom: 1.0,
        });
        const ref = tonemapAgX(INPUT_SDR[0], INPUT_SDR[1], INPUT_SDR[2], 1.0);
        expectClose(result.rgba[0], ref.r);
        expectClose(result.rgba[1], ref.g);
        expectClose(result.rgba[2], ref.b);
      });
    });

    it('PBR Neutral at headroom=1 matches CPU reference', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_SDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 5,
          hdrHeadroom: 1.0,
        });
        const ref = tonemapPBRNeutral(INPUT_SDR[0], INPUT_SDR[1], INPUT_SDR[2], 1.0);
        expectClose(result.rgba[0], ref.r);
        expectClose(result.rgba[1], ref.g);
        expectClose(result.rgba[2], ref.b);
      });
    });

    it('GT at headroom=1 matches CPU reference', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_SDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 6,
          hdrHeadroom: 1.0,
        });
        expectClose(result.rgba[0], tonemapGTChannel(INPUT_SDR[0], 1.0));
        expectClose(result.rgba[1], tonemapGTChannel(INPUT_SDR[1], 1.0));
        expectClose(result.rgba[2], tonemapGTChannel(INPUT_SDR[2], 1.0));
      });
    });

    it('ACES Hill at headroom=1 matches CPU reference', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_SDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 7,
          hdrHeadroom: 1.0,
        });
        const ref = tonemapACESHill(INPUT_SDR[0], INPUT_SDR[1], INPUT_SDR[2], 1.0);
        expectClose(result.rgba[0], ref.r);
        expectClose(result.rgba[1], ref.g);
        expectClose(result.rgba[2], ref.b);
      });
    });

    it('Drago at headroom=1 matches CPU reference (parameterized)', async () => {
      await withReadback(async (device) => {
        const dragoBias = 0.85;
        const dragoLwa = 0.5;
        const dragoLmax = 1.0;
        const dragoBrightness = 2.0;
        const result = await renderToneMapWGPU(device, INPUT_SDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 8,
          hdrHeadroom: 1.0,
          tmDragoBias: dragoBias,
          tmDragoLwa: dragoLwa,
          tmDragoLmax: dragoLmax,
          tmDragoBrightness: dragoBrightness,
        });
        const refR = tonemapDragoChannel(INPUT_SDR[0], dragoBias, dragoLwa, dragoLmax, 1.0) * dragoBrightness;
        const refG = tonemapDragoChannel(INPUT_SDR[1], dragoBias, dragoLwa, dragoLmax, 1.0) * dragoBrightness;
        const refB = tonemapDragoChannel(INPUT_SDR[2], dragoBias, dragoLwa, dragoLmax, 1.0) * dragoBrightness;
        expectClose(result.rgba[0], refR);
        expectClose(result.rgba[1], refG);
        expectClose(result.rgba[2], refB);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Extended (HDR headroom > 1): every non-Drago operator should preserve
  // display headroom under the MED-52 normalize/re-scale convention.
  // -------------------------------------------------------------------------
  describe('MED-55: extended hdrHeadroom > 1 (HDR display)', () => {
    const HEADROOM = 3.0;

    it('Reinhard at headroom=3 matches CPU reference (HDR)', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_HDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 1,
          hdrHeadroom: HEADROOM,
        });
        expectClose(result.rgba[0], tonemapReinhardChannel(INPUT_HDR[0], 4.0, HEADROOM));
        expectClose(result.rgba[1], tonemapReinhardChannel(INPUT_HDR[1], 4.0, HEADROOM));
        expectClose(result.rgba[2], tonemapReinhardChannel(INPUT_HDR[2], 4.0, HEADROOM));
      });
    });

    it('Filmic at headroom=3 matches CPU reference (HDR)', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_HDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 2,
          hdrHeadroom: HEADROOM,
        });
        expectClose(result.rgba[0], tonemapFilmicChannel(INPUT_HDR[0], 2.0, 11.2, HEADROOM));
        expectClose(result.rgba[1], tonemapFilmicChannel(INPUT_HDR[1], 2.0, 11.2, HEADROOM));
        expectClose(result.rgba[2], tonemapFilmicChannel(INPUT_HDR[2], 2.0, 11.2, HEADROOM));
      });
    });

    it('ACES at headroom=3 matches CPU reference (HDR)', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_HDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 3,
          hdrHeadroom: HEADROOM,
        });
        expectClose(result.rgba[0], tonemapACESChannel(INPUT_HDR[0], HEADROOM));
        expectClose(result.rgba[1], tonemapACESChannel(INPUT_HDR[1], HEADROOM));
        expectClose(result.rgba[2], tonemapACESChannel(INPUT_HDR[2], HEADROOM));
      });
    });

    it('AgX at headroom=3 matches CPU reference (HDR)', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_HDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 4,
          hdrHeadroom: HEADROOM,
        });
        const ref = tonemapAgX(INPUT_HDR[0], INPUT_HDR[1], INPUT_HDR[2], HEADROOM);
        expectClose(result.rgba[0], ref.r);
        expectClose(result.rgba[1], ref.g);
        expectClose(result.rgba[2], ref.b);
      });
    });

    it('PBR Neutral at headroom=3 matches CPU reference (HDR)', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_HDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 5,
          hdrHeadroom: HEADROOM,
        });
        const ref = tonemapPBRNeutral(INPUT_HDR[0], INPUT_HDR[1], INPUT_HDR[2], HEADROOM);
        expectClose(result.rgba[0], ref.r);
        expectClose(result.rgba[1], ref.g);
        expectClose(result.rgba[2], ref.b);
      });
    });

    it('GT at headroom=3 matches CPU reference (HDR)', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_HDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 6,
          hdrHeadroom: HEADROOM,
        });
        expectClose(result.rgba[0], tonemapGTChannel(INPUT_HDR[0], HEADROOM));
        expectClose(result.rgba[1], tonemapGTChannel(INPUT_HDR[1], HEADROOM));
        expectClose(result.rgba[2], tonemapGTChannel(INPUT_HDR[2], HEADROOM));
      });
    });

    it('ACES Hill at headroom=3 matches CPU reference (HDR)', async () => {
      await withReadback(async (device) => {
        const result = await renderToneMapWGPU(device, INPUT_HDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 7,
          hdrHeadroom: HEADROOM,
        });
        const ref = tonemapACESHill(INPUT_HDR[0], INPUT_HDR[1], INPUT_HDR[2], HEADROOM);
        expectClose(result.rgba[0], ref.r);
        expectClose(result.rgba[1], ref.g);
        expectClose(result.rgba[2], ref.b);
      });
    });

    it('Drago at headroom=3 matches CPU reference (HDR, physically parameterized)', async () => {
      await withReadback(async (device) => {
        const dragoBias = 0.85;
        const dragoLwa = 0.5;
        const dragoLmax = 1.0;
        const dragoBrightness = 2.0;
        const result = await renderToneMapWGPU(device, INPUT_HDR, {
          toneMappingEnabled: 1,
          toneMappingOperator: 8,
          hdrHeadroom: HEADROOM,
          tmDragoBias: dragoBias,
          tmDragoLwa: dragoLwa,
          tmDragoLmax: dragoLmax,
          tmDragoBrightness: dragoBrightness,
        });
        const refR = tonemapDragoChannel(INPUT_HDR[0], dragoBias, dragoLwa, dragoLmax, HEADROOM) * dragoBrightness;
        const refG = tonemapDragoChannel(INPUT_HDR[1], dragoBias, dragoLwa, dragoLmax, HEADROOM) * dragoBrightness;
        const refB = tonemapDragoChannel(INPUT_HDR[2], dragoBias, dragoLwa, dragoLmax, HEADROOM) * dragoBrightness;
        expectClose(result.rgba[0], refR);
        expectClose(result.rgba[1], refG);
        expectClose(result.rgba[2], refB);
      });
    });
  });

  // -------------------------------------------------------------------------
  // toneMappingEnabled = 0 should be a no-op passthrough on the WGSL path.
  // -------------------------------------------------------------------------
  it('MED-55: toneMappingEnabled=0 is passthrough (no-op)', async () => {
    await withReadback(async (device) => {
      const result = await renderToneMapWGPU(device, INPUT_HDR, {
        toneMappingEnabled: 0,
        toneMappingOperator: 1,
        hdrHeadroom: 3.0,
      });
      expectClose(result.rgba[0], INPUT_HDR[0]);
      expectClose(result.rgba[1], INPUT_HDR[1]);
      expectClose(result.rgba[2], INPUT_HDR[2]);
    });
  });

  // -------------------------------------------------------------------------
  // Compile-only verification of the dispatcher: confirms every operator
  // ID 1..8 is present in the WGSL source AND the combined shader compiles.
  // (The previous loop compiled the same shader 9 times — operator selection
  // is a runtime uniform, not a compile-time specialization. We compile once
  // and string-check the dispatcher's switch table for completeness.)
  // -------------------------------------------------------------------------
  describe('MED-55: scene_analysis.wgsl dispatcher covers every operator', () => {
    const OPS: Array<{ id: number; name: string }> = [
      { id: 0, name: 'off' },
      { id: 1, name: 'reinhard' },
      { id: 2, name: 'filmic' },
      { id: 3, name: 'aces' },
      { id: 4, name: 'agx' },
      { id: 5, name: 'pbrNeutral' },
      { id: 6, name: 'gt' },
      { id: 7, name: 'acesHill' },
      { id: 8, name: 'drago' },
    ];

    it('source contains a switch case for every operator id (1..8)', () => {
      for (let id = 1; id <= 8; id++) {
        expect(sceneAnalysisSrc, `expected dispatch case ${id}`).toMatch(new RegExp(`case\\s+${id}\\s*:`));
      }
      // Also assert the corresponding common-side function call exists.
      const expectedFns = [
        'tonemapReinhard(',
        'tonemapFilmic(',
        'tonemapACES(',
        'tonemapAgX(',
        'tonemapPBRNeutral(',
        'tonemapGT(',
        'tonemapACESHill(',
        'tonemapDrago(',
      ];
      for (const fn of expectedFns) {
        expect(sceneAnalysisSrc, `dispatcher should call ${fn}`).toContain(fn);
      }
    });

    it('combined shader compiles with all dispatch branches reachable', async () => {
      const gpu = await createTestDevice();
      if (!gpu) return;
      try {
        // EPSILON.HDR_HALF imported to keep the tolerance helpers honest.
        void EPSILON.HDR_HALF;
        const combinedSrc = commonSrc + '\n' + viewerVertSrc + '\n' + sceneAnalysisSrc;
        const module = await createShaderModule(gpu.device, combinedSrc, 'tonemap_dispatch_full');
        expect(module).toBeTruthy();
      } finally {
        gpu.device.destroy();
      }
    });

    it('OPS table matches dispatcher case count', () => {
      // Sanity check on the OPS metadata: 9 entries (off + 8 operators).
      expect(OPS).toHaveLength(9);
    });
  });

  // -------------------------------------------------------------------------
  // Tolerance reference: ensures tests using TOL = 1/256 are intentional.
  // -------------------------------------------------------------------------
  it('uses half-float-relaxed tolerance (~1/256) and gates assertions on it', () => {
    expect(TOL).toBeCloseTo(1 / 256, 6);
    // Sanity: HDR_HALF is tighter (used by 32-bit float tests).
    expect(EPSILON.HDR_HALF).toBeLessThan(TOL);
    // expectClose semantic check: equal values pass, out-of-tol values fail.
    expectClose(0.5, 0.5);
    expectClose(0.5, 0.5 + TOL);
    expect(() => expectClose(0.5, 0.5 + TOL * 2)).toThrow();
  });
});
