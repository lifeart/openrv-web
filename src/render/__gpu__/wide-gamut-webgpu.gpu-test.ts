/**
 * Wide-gamut working space (H7) and the output-encoding contract — real WGSL.
 *
 * Runs single WebGPU stage shaders (common.wgsl + passthrough vertex + stage)
 * with the uniform bytes produced by WebGPUStateUploader, so the WGSL struct
 * layouts and the packer are checked together, and compares against the same
 * reference math as the GLSL tests (wide-gamut.gpu-test.ts, hdr-output.gpu-test.ts).
 *
 * Skipped when the environment has no WebGPU adapter.
 */
import { describe, it, expect } from 'vitest';
import { createTestDevice, createShaderModule } from './helpers/webgpu';
import {
  applyGamutMappingWorking,
  applyHSLQualifierCorrection,
  applyMat3,
  applyVibrance,
  extendedSRGBEncode,
  hdrNormalizedHsl,
  linearToHLG,
  linearToPQ,
  linearToSRGBChannel,
} from '../__tests__/shaderMathReference';
import { COLOR_PRIMARIES_INVERSE_MATRICES, COLOR_PRIMARIES_MATRICES } from '../ShaderConstants';
import { createDefaultInternalState } from '../ShaderStateTypes';
import type { InternalShaderState } from '../ShaderStateTypes';
import type { StageId } from '../ShaderStage';
import { WebGPUStateUploader } from '../webgpu/WebGPUStateUploader';
import type { WGPUDevice } from '../webgpu/WebGPUTypes';
import {
  OUTPUT_ENCODING_DISPLAY,
  OUTPUT_ENCODING_EXTENDED_SRGB,
  OUTPUT_ENCODING_HLG,
  OUTPUT_ENCODING_LINEAR,
  OUTPUT_ENCODING_PQ,
  type OutputEncodingCode,
} from '../../config/RenderConfig';

import commonSrc from '../webgpu/shaders/common.wgsl?raw';
import passthroughVertSrc from '../webgpu/shaders/_passthrough_vert.wgsl?raw';
import displayOutputSrc from '../webgpu/shaders/display_output.wgsl?raw';
import sceneAnalysisSrc from '../webgpu/shaders/scene_analysis.wgsl?raw';
import secondaryGradeSrc from '../webgpu/shaders/secondary_grade.wgsl?raw';
import primaryGradeSrc from '../webgpu/shaders/primary_grade.wgsl?raw';
import colorPipelineSrc from '../webgpu/shaders/color_pipeline.wgsl?raw';

type RGB = [number, number, number];

const M = COLOR_PRIMARIES_MATRICES;
const INV = COLOR_PRIMARIES_INVERSE_MATRICES;

// Half-float storage between stages: ~11 bits of mantissa.
const HALF_TOL = 4e-3;

/** Group-0 bindings after `samp` / `tex`, in binding order. */
type ExtraBinding = 'tex2d' | 'sampler' | 'tex3d';

const STAGES: Record<string, { src: string; extra: ExtraBinding[] }> = {
  displayOutput: { src: displayOutputSrc, extra: ['sampler', 'tex3d'] },
  sceneAnalysis: { src: sceneAnalysisSrc, extra: [] },
  secondaryGrade: { src: secondaryGradeSrc, extra: [] },
  primaryGrade: { src: primaryGradeSrc, extra: ['tex2d', 'tex2d'] },
  colorPipeline: { src: colorPipelineSrc, extra: ['tex2d', 'tex3d', 'tex3d'] },
};

function floatToHalf(val: number): number {
  const f = new Float32Array([val]);
  const x = new Int32Array(f.buffer)[0]!;
  const sign = (x >>> 31) & 0x1;
  let exp = (x >>> 23) & 0xff;
  let frac = x & 0x7fffff;
  if (exp === 0) return sign << 15;
  if (exp === 0xff) return (sign << 15) | (0x1f << 10) | (frac ? 0x200 : 0);
  exp = exp - 127 + 15;
  if (exp >= 0x1f) return (sign << 15) | (0x1f << 10);
  if (exp <= 0) {
    if (exp < -10) return sign << 15;
    frac |= 0x800000;
    return (sign << 15) | (frac >> (14 - exp));
  }
  // Round to nearest
  const half = (sign << 15) | (exp << 10) | (frac >> 13);
  return frac & 0x1000 ? half + 1 : half;
}

function halfToFloat(h: number): number {
  const sign = (h >> 15) & 0x1 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * Math.pow(2, -14) * (frac / 1024);
  if (exp === 0x1f) return frac ? NaN : sign * Infinity;
  return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

/**
 * Render one stage over a 4x4 target and return the bottom-left pixel (well
 * inside the passthrough vertex's half-screen triangle).
 */
async function renderStage(
  device: GPUDevice,
  stage: keyof typeof STAGES,
  input: RGB,
  uniforms: GPUBuffer,
): Promise<RGB> {
  const W = 4,
    H = 4;
  const spec = STAGES[stage]!;
  const module = await createShaderModule(device, commonSrc + '\n' + passthroughVertSrc + '\n' + spec.src, stage);
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
    primitive: { topology: 'triangle-list' },
  });

  const inputTex = device.createTexture({
    size: { width: W, height: H },
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const half = new Uint16Array(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    half.set([floatToHalf(input[0]), floatToHalf(input[1]), floatToHalf(input[2]), floatToHalf(1)], p * 4);
  }
  device.queue.writeTexture(
    { texture: inputTex },
    half,
    { bytesPerRow: W * 8, rowsPerImage: H },
    { width: W, height: H },
  );

  const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
  const dummy2D = device.createTexture({
    size: { width: 1, height: 1 },
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING,
  });
  const dummy3D = device.createTexture({
    size: { width: 1, height: 1, depthOrArrayLayers: 1 },
    dimension: '3d',
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING,
  });
  const entries: GPUBindGroupEntry[] = [
    { binding: 0, resource: sampler },
    { binding: 1, resource: inputTex.createView() },
  ];
  spec.extra.forEach((kind, i) => {
    const resource =
      kind === 'sampler' ? sampler : kind === 'tex3d' ? dummy3D.createView({ dimension: '3d' }) : dummy2D.createView();
    entries.push({ binding: i + 2, resource });
  });
  const bg0 = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
  const bg1 = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(1),
    entries: [{ binding: 0, resource: { buffer: uniforms } }],
  });

  const outputTex = device.createTexture({
    size: { width: W, height: H },
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: outputTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bg0);
  pass.setBindGroup(1, bg1);
  pass.draw(3);
  pass.end();

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
  // Row H-1 (bottom), column 0.
  const px = new Uint16Array(readBuf.getMappedRange().slice((H - 1) * bytesPerRow, (H - 1) * bytesPerRow + 8));
  const out: RGB = [halfToFloat(px[0]!), halfToFloat(px[1]!), halfToFloat(px[2]!)];
  readBuf.unmap();
  for (const t of [inputTex, dummy2D, dummy3D, outputTex]) t.destroy();
  readBuf.destroy();
  return out;
}

/** Pack a stage's uniforms through WebGPUStateUploader (the production packer). */
function packWithUploader(
  device: GPUDevice,
  stage: StageId,
  state: InternalShaderState,
  opts: { encoding?: OutputEncodingCode; headroom?: number } = {},
): GPUBuffer {
  const uploader = new WebGPUStateUploader();
  if (opts.encoding !== undefined) uploader.setOutputEncoding(opts.encoding);
  if (opts.headroom !== undefined) uploader.setHDRHeadroom(opts.headroom);
  return uploader.uploadStageUniforms(device as unknown as WGPUDevice, stage, state) as unknown as GPUBuffer;
}

function expectRGB(actual: RGB, expected: RGB, tol = HALF_TOL): void {
  for (let i = 0; i < 3; i++) {
    const t = tol * Math.max(1, Math.abs(expected[i]!));
    if (Math.abs(actual[i]! - expected[i]!) > t) {
      throw new Error(
        `channel ${i}: expected ${expected.join(', ')}, got ${actual.map((v) => v.toFixed(4)).join(', ')}`,
      );
    }
  }
}

function withTaggedSource(state: InternalShaderState, primaries: 'p3' | 'bt2020'): void {
  state.inputPrimariesEnabled = true;
  state.inputPrimariesMatrix = primaries === 'p3' ? M.P3_TO_SRGB : M.REC2020_TO_SRGB;
  state.inputPrimariesInverse = primaries === 'p3' ? INV.SRGB_TO_P3 : INV.SRGB_TO_REC2020;
}

async function withDevice(body: (device: GPUDevice) => Promise<void>): Promise<void> {
  const gpu = await createTestDevice();
  if (!gpu) return;
  try {
    await body(gpu.device);
  } finally {
    gpu.device.destroy();
  }
}

describe('WebGPU output contract and wide gamut (real WGSL)', () => {
  describe('displayOutput honours u_outputEncoding', () => {
    const linear: RGB = [0.18, 1.0, 4.0];

    it('LINEAR passes linear values through (HDR values kept)', async () => {
      await withDevice(async (device) => {
        const state = createDefaultInternalState();
        const out = await renderStage(
          device,
          'displayOutput',
          linear,
          packWithUploader(device, 'displayOutput', state, { encoding: OUTPUT_ENCODING_LINEAR }),
        );
        expectRGB(out, linear);
      });
    });

    it('EXTENDED_SRGB encodes above 1.0 and ignores the SDR display transfer', async () => {
      await withDevice(async (device) => {
        const state = createDefaultInternalState();
        state.displayTransferCode = 4; // gamma 2.4 must not be applied on top
        const out = await renderStage(
          device,
          'displayOutput',
          linear,
          packWithUploader(device, 'displayOutput', state, { encoding: OUTPUT_ENCODING_EXTENDED_SRGB }),
        );
        expectRGB(out, linear.map(extendedSRGBEncode) as RGB);
        expect(out[2]).toBeGreaterThan(1);
      });
    });

    it('PQ encodes 1.0 = 203 cd/m²', async () => {
      await withDevice(async (device) => {
        const state = createDefaultInternalState();
        const out = await renderStage(
          device,
          'displayOutput',
          linear,
          packWithUploader(device, 'displayOutput', state, { encoding: OUTPUT_ENCODING_PQ }),
        );
        expectRGB(out, linear.map(linearToPQ) as RGB);
        expect(out[1]).toBeCloseTo(0.58069, 2);
      });
    });

    it('HLG encodes the BT.2100 inverse OOTF + OETF', async () => {
      await withDevice(async (device) => {
        const state = createDefaultInternalState();
        const grey: RGB = [1, 1, 1];
        const out = await renderStage(
          device,
          'displayOutput',
          grey,
          packWithUploader(device, 'displayOutput', state, { encoding: OUTPUT_ENCODING_HLG }),
        );
        expectRGB(out, linearToHLG(1, 1, 1));
      });
    });

    it('DISPLAY applies the user display transfer, then creative gamma (step 8b)', async () => {
      await withDevice(async (device) => {
        const state = createDefaultInternalState();
        state.displayTransferCode = 1; // sRGB
        state.colorAdjustments.gamma = 2.0;
        const sdr: RGB = [0.18, 0.5, 0.9];
        const out = await renderStage(
          device,
          'displayOutput',
          sdr,
          packWithUploader(device, 'displayOutput', state, { encoding: OUTPUT_ENCODING_DISPLAY }),
        );
        expectRGB(out, sdr.map((v) => Math.pow(linearToSRGBChannel(v), 1 / 2.0)) as RGB);
      });
    });

    it('output primaries bring a P3 colour back from the BT.709 working space, then clip', async () => {
      await withDevice(async (device) => {
        const state = createDefaultInternalState();
        state.outputPrimariesEnabled = true;
        state.outputPrimariesMatrix = M.SRGB_TO_P3;
        const working = applyMat3(Array.from(M.P3_TO_SRGB), 1, 0, 0);
        expect(working[1]).toBeLessThan(0);
        const out = await renderStage(
          device,
          'displayOutput',
          working,
          packWithUploader(device, 'displayOutput', state, { encoding: OUTPUT_ENCODING_LINEAR }),
        );
        expectRGB(out, [1, 0, 0]);
      });
    });
  });

  describe('source-gamut clamps', () => {
    it('primaryGrade keeps a P3 primary that is negative in BT.709', async () => {
      await withDevice(async (device) => {
        const state = createDefaultInternalState();
        withTaggedSource(state, 'p3');
        const working = applyMat3(Array.from(M.P3_TO_SRGB), 1, 0, 0);
        const out = await renderStage(device, 'primaryGrade', working, packWithUploader(device, 'primaryGrade', state));
        expectRGB(out, working);
        expect(out[1]).toBeLessThan(-0.03);
      });
    });

    it('primaryGrade still clamps negatives at zero for BT.709 sources', async () => {
      await withDevice(async (device) => {
        const state = createDefaultInternalState();
        const out = await renderStage(
          device,
          'primaryGrade',
          [1.2, -0.04, -0.02],
          packWithUploader(device, 'primaryGrade', state),
        );
        expectRGB(out, [1.2, 0, 0]);
      });
    });

    it('sceneAnalysis tone maps a BT.2020 primary in its own primaries (stays pure)', async () => {
      await withDevice(async (device) => {
        const state = createDefaultInternalState();
        withTaggedSource(state, 'bt2020');
        state.toneMappingState = { ...state.toneMappingState, enabled: true, operator: 'reinhard' };
        const working = applyMat3(Array.from(M.REC2020_TO_SRGB), 0, 4, 0);
        const out = await renderStage(
          device,
          'sceneAnalysis',
          working,
          packWithUploader(device, 'sceneAnalysis', state),
        );
        const inSource = applyMat3(Array.from(INV.SRGB_TO_REC2020), ...out);
        expect(Math.abs(inSource[0])).toBeLessThan(0.01);
        expect(Math.abs(inSource[2])).toBeLessThan(0.01);
        expect(inSource[1]).toBeGreaterThan(0.5);
      });
    });
  });

  describe('gamut mapping', () => {
    it('does not convert a tagged P3 source a second time', async () => {
      await withDevice(async (device) => {
        const state = createDefaultInternalState();
        withTaggedSource(state, 'p3');
        Object.assign(state, {
          gamutMappingEnabled: true,
          gamutMappingModeCode: 0,
          gamutSourceCode: 2,
          gamutTargetCode: 0,
        });
        const working = applyMat3(Array.from(M.P3_TO_SRGB), 0.6, 0.5, 0.4);
        const out = await renderStage(
          device,
          'sceneAnalysis',
          working,
          packWithUploader(device, 'sceneAnalysis', state),
        );
        expectRGB(out, working);
      });
    });

    it('maps into a P3 target and returns working-space values', async () => {
      await withDevice(async (device) => {
        const state = createDefaultInternalState();
        withTaggedSource(state, 'bt2020');
        Object.assign(state, {
          gamutMappingEnabled: true,
          gamutMappingModeCode: 0,
          gamutSourceCode: 1,
          gamutTargetCode: 2,
        });
        const working = applyMat3(Array.from(M.REC2020_TO_SRGB), 0, 1, 0);
        const out = await renderStage(
          device,
          'sceneAnalysis',
          working,
          packWithUploader(device, 'sceneAnalysis', state),
        );
        expectRGB(out, applyGamutMappingWorking(working, null, M.SRGB_TO_P3, M.P3_TO_SRGB, 'clip'));
      });
    });

    it('keeps HDR highlights (ceiling follows headroom)', async () => {
      await withDevice(async (device) => {
        const state = createDefaultInternalState();
        Object.assign(state, {
          gamutMappingEnabled: true,
          gamutMappingModeCode: 1,
          gamutSourceCode: 1,
          gamutTargetCode: 0,
        });
        const out = await renderStage(
          device,
          'sceneAnalysis',
          [2, 2, 2],
          packWithUploader(device, 'sceneAnalysis', state, { headroom: 4 }),
        );
        expectRGB(out, [2, 2, 2]);
      });
    });
  });

  describe('HDR values above 1.0', () => {
    it('survive vibrance (secondaryGrade)', async () => {
      await withDevice(async (device) => {
        const state = createDefaultInternalState();
        state.vibranceEnabled = true;
        state.vibranceValue = -0.5;
        const src: RGB = [4, 2, 1];
        const out = await renderStage(device, 'secondaryGrade', src, packWithUploader(device, 'secondaryGrade', state));
        expectRGB(out, applyVibrance(...src, -0.5));
        expect(out[0]).toBeGreaterThan(3);
      });
    });

    it('survive the HSL qualifier (colorPipeline)', async () => {
      await withDevice(async (device) => {
        const src: RGB = [3, 0.6, 0.3];
        const [, hue] = hdrNormalizedHsl(...src);
        // colorPipeline's packer does not follow its WGSL struct yet; pack the
        // HSL qualifier fields at their color_pipeline.wgsl byte offsets.
        const buf = new ArrayBuffer(512);
        const v = new DataView(buf);
        v.setInt32(128, 1, true); // hslQualifierEnabled
        const f = (off: number, val: number) => v.setFloat32(off, val, true);
        f(144, hue); // hslHueCenter
        f(148, 60); // hslHueWidth
        f(156, 50); // hslSatCenter
        f(160, 100); // hslSatWidth
        f(168, 50); // hslLumCenter
        f(172, 100); // hslLumWidth
        f(184, 0.5); // hslCorrSatScale
        f(188, 1); // hslCorrLumScale
        const ubo = device.createBuffer({ size: 512, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        device.queue.writeBuffer(ubo, 0, buf);
        const out = await renderStage(device, 'colorPipeline', src, ubo);
        expectRGB(out, applyHSLQualifierCorrection(...src, 1, 0, 0.5, 1));
        expect(out[0]).toBeGreaterThan(2);
      });
    });
  });
});
