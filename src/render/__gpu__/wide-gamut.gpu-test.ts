/**
 * Wide-gamut working space (review item H7) — real GLSL pixel accuracy.
 *
 * Drives the full viewer.frag.glsl and checks that:
 *   - saturated P3 / BT.2020 colours survive the linear BT.709 working space
 *     to a wide-gamut output (no BT.709 clamp before the output primaries),
 *   - gamut mapping does not convert a tagged source a second time,
 *   - HDR values above 1.0 survive vibrance, the HSL qualifier and gamut mapping,
 *   - SDR BT.709 → sRGB output is unchanged (goldens captured from the shader
 *     before the H7 change).
 */
import { describe, it, afterEach, expect } from 'vitest';
import { createTestGL, compileShader, linkProgram, createFullscreenQuad } from './helpers/webgl2';
import { readPixelsGLFloat, expectPixel } from './helpers/pixels';
import { createSolidTexture } from './helpers/textures';
import { setupIdentityPipeline } from './helpers/pipeline';
import {
  applyGamutMappingWorking,
  applyHSLQualifierCorrection,
  applyMat3,
  applyVibrance,
  clampToSourceGamut,
  hdrNormalizedHsl,
  linearToPQ,
} from '../__tests__/shaderMathReference';
import { COLOR_PRIMARIES_INVERSE_MATRICES, COLOR_PRIMARIES_MATRICES } from '../ShaderConstants';
import { INPUT_TRANSFER_SRGB, OUTPUT_ENCODING_LINEAR, OUTPUT_ENCODING_PQ } from '../../config/RenderConfig';

import viewerVertSrc from '../shaders/viewer.vert.glsl?raw';
import viewerFragSrc from '../shaders/viewer.frag.glsl?raw';

// Matrices are 4-decimal approximations, so P3 → 709 → P3 is the identity to ~2e-4.
const MATRIX_TOL = 2e-3;

const M = COLOR_PRIMARIES_MATRICES;
const INV = COLOR_PRIMARIES_INVERSE_MATRICES;

type Uniforms = Record<string, number | number[]>;

interface RenderOptions {
  inputPrimaries?: 'p3' | 'bt2020';
  outputPrimaries?: 'p3' | 'rec2020';
  outputEncoding?: number;
  uniforms?: Uniforms;
}

function createFloatFBO(gl: WebGL2RenderingContext, width: number, height: number) {
  const fbo = gl.createFramebuffer()!;
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return {
    fbo,
    dispose: () => {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
    },
  };
}

function createRowTexture(gl: WebGL2RenderingContext, pixels: number[][]) {
  const data = new Float32Array(pixels.length * 4);
  pixels.forEach((p, i) => data.set([p[0]!, p[1]!, p[2]!, 1], i * 4));
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, pixels.length, 1, 0, gl.RGBA, gl.FLOAT, data);
  return { texture, dispose: () => gl.deleteTexture(texture) };
}

function setUniforms(gl: WebGL2RenderingContext, program: WebGLProgram, uniforms: Uniforms): void {
  for (const [name, value] of Object.entries(uniforms)) {
    const loc = gl.getUniformLocation(program, name);
    if (Array.isArray(value)) {
      if (value.length === 9) gl.uniformMatrix3fv(loc, false, value);
      else if (value.length === 2) gl.uniform2f(loc, value[0]!, value[1]!);
      else if (value.length === 3) gl.uniform3f(loc, value[0]!, value[1]!, value[2]!);
      else throw new Error(`unsupported uniform length for ${name}`);
    } else if (Number.isInteger(value) && !FLOAT_UNIFORMS.has(name)) {
      gl.uniform1i(loc, value);
    } else {
      gl.uniform1f(loc, value);
    }
  }
}

// Float uniforms that tests may set to integral values.
const FLOAT_UNIFORMS = new Set([
  'u_brightness',
  'u_saturation',
  'u_vibrance',
  'u_hdrHeadroom',
  'u_hslHueCenter',
  'u_hslHueWidth',
  'u_hslHueSoftness',
  'u_hslSatCenter',
  'u_hslSatWidth',
  'u_hslSatSoftness',
  'u_hslLumCenter',
  'u_hslLumWidth',
  'u_hslLumSoftness',
  'u_hslCorrHueShift',
  'u_hslCorrSatScale',
  'u_hslCorrLumScale',
  'u_highlights',
  'u_shadows',
  'u_whites',
  'u_blacks',
  'u_tmReinhardWhitePoint',
  'u_temperature',
  'u_tint',
  'u_clarity',
  'u_sharpenAmount',
]);

/** SDR grading scenarios for the regression goldens (BT.709 source, sRGB output). */
const SDR_PIXELS = [
  [0.0, 0.0, 0.0],
  [0.18, 0.18, 0.18],
  [0.9, 0.2, 0.1],
  [0.2, 0.7, 0.3],
  [0.1, 0.25, 0.85],
  [0.75, 0.55, 0.4],
  [1.0, 1.0, 1.0],
  [0.05, 0.6, 0.95],
];

const SDR_SCENARIOS: Array<{ name: string; uniforms: Uniforms }> = [
  {
    name: 'brightness / contrast / saturation',
    uniforms: { u_brightness: -0.05, u_contrastRGB: [1.2, 1.1, 0.9], u_saturation: 1.3 },
  },
  { name: 'vibrance', uniforms: { u_vibranceEnabled: 1, u_vibrance: 0.4, u_vibranceSkinProtection: 1 } },
  { name: 'negative vibrance', uniforms: { u_vibranceEnabled: 1, u_vibrance: -0.6 } },
  {
    name: 'HSL qualifier',
    uniforms: {
      u_hslQualifierEnabled: 1,
      u_hslHueCenter: 20,
      u_hslHueWidth: 60,
      u_hslHueSoftness: 30,
      u_hslSatCenter: 60,
      u_hslSatWidth: 80,
      u_hslSatSoftness: 20,
      u_hslLumCenter: 50,
      u_hslLumWidth: 80,
      u_hslLumSoftness: 20,
      u_hslCorrHueShift: 25,
      u_hslCorrSatScale: 1.4,
      u_hslCorrLumScale: 0.8,
    },
  },
  {
    name: 'highlights / shadows / whites / blacks + Reinhard',
    uniforms: {
      u_hsEnabled: 1,
      u_highlights: 0.3,
      u_shadows: 0.2,
      u_whites: 0.1,
      u_blacks: 0.1,
      u_toneMappingOperator: 1,
    },
  },
  {
    name: 'gamut mapping (untagged P3 → sRGB, compress)',
    uniforms: { u_gamutMappingEnabled: 1, u_gamutMappingMode: 1, u_sourceGamut: 2, u_targetGamut: 0 },
  },
  { name: 'temperature / tint', uniforms: { u_temperature: -60, u_tint: 40 } },
  {
    name: 'clarity + sharpen',
    uniforms: {
      u_texelSize: [1 / 8, 1],
      u_clarityEnabled: 1,
      u_clarity: 0.8,
      u_sharpenEnabled: 1,
      u_sharpenAmount: 0.5,
    },
  },
];

// Captured from viewer.frag.glsl at d8ca95b (before the H7 change) with
// u_outputMode = SDR, u_outputEncoding = DISPLAY, u_displayTransfer = sRGB.
// Rows follow SDR_SCENARIOS, pixels follow SDR_PIXELS (RGB per pixel).
const SDR_GOLDENS: number[][][] = [
  [
    [0, 0, 0.3152593],
    [0.2365505, 0.3384783, 0.4730709],
    [1, 0.2808015, 0.2153494],
    [0, 0.860103, 0.4887312],
    [0, 0.4496952, 0.9778719],
    [0.90614, 0.7271416, 0.5944584],
    [1, 0.9973928, 0.9438925],
    [0, 0.7918882, 0.994117],
  ],
  [
    [0, 0, 0],
    [0.5390679, 0.3623615, 0.3623616],
    [0.9999999, 0.3885728, 0],
    [0.2933721, 0.9211916, 0.5085074],
    [0, 0.4731209, 0.9776917],
    [0.9304411, 0.7584975, 0.5847179],
    [0.9999999, 0.9999999, 0.9999999],
    [0, 0.8042822, 0.9999999],
  ],
  [
    [0, 0, 0],
    [0.4613562, 0.4613562, 0.4613562],
    [0.865042, 0.6138896, 0.5657284],
    [0.6614205, 0.7386407, 0.6777839],
    [0.5587457, 0.6290399, 0.8420115],
    [0.7827492, 0.7827492, 0.7827492],
    [0.9999999, 0.9999999, 0.9999999],
    [0.5010347, 0.7756245, 0.89878],
  ],
  [
    [0, 0, 0],
    [0.4613562, 0.4613562, 0.4613562],
    [0.9063319, 0.6896093, 0],
    [0.4845293, 0.8543057, 0.5838315],
    [0.3491902, 0.5370988, 0.9309248],
    [0.8677925, 0.8227441, 0.4786662],
    [0.9999999, 0.9999999, 0.9999999],
    [0.2478005, 0.7977377, 0.9776917],
  ],
  [
    [0.3350448, 0.3350448, 0.3350448],
    [0.4806958, 0.4806958, 0.4806958],
    [0.7446153, 0.4582073, 0.3455942],
    [0.4281676, 0.6874682, 0.511412],
    [0.3773414, 0.5148877, 0.7388873],
    [0.7003683, 0.6364421, 0.569423],
    [0.7244976, 0.7244976, 0.7244976],
    [0.1855539, 0.6583375, 0.7498467],
  ],
  [
    [0, 0, 0],
    [0.4613562, 0.4613562, 0.4613562],
    [0.9874471, 0.4499323, 0.3062662],
    [0.3275526, 0.8655529, 0.5568931],
    [0.2852459, 0.5433291, 0.9554103],
    [0.9038288, 0.7621094, 0.650972],
    [0.9787412, 0.9787412, 0.9787412],
    [0, 0.8112867, 0.9778199],
  ],
  [
    [0, 0.2209163, 0.2209163],
    [0.3491902, 0.5063866, 0.5063866],
    [0.9162737, 0.5271129, 0.4100208],
    [0.3810918, 0.8756057, 0.6180314],
    [0.1517037, 0.574871, 0.9499977],
    [0.8378603, 0.7917869, 0.6943611],
    [0.9639764, 1, 1],
    [0, 0.8209798, 0.9955912],
  ],
  [
    [0, 0, 0],
    [0, 0.5527924, 0.6119977],
    [1, 0, 0],
    [0, 1, 0.3084872],
    [0, 0, 1],
    [1, 0.6998309, 0],
    [1, 1, 1],
    [0, 0.6227631, 0.9718924],
  ],
];

describe('Wide-gamut working space (real GPU)', () => {
  let gl: WebGL2RenderingContext;
  let program: WebGLProgram;
  let quad: ReturnType<typeof createFullscreenQuad>;
  let fbo: ReturnType<typeof createFloatFBO> | null = null;

  function setup(width = 1) {
    ({ gl } = createTestGL(width, 1));
    gl.getExtension('EXT_color_buffer_float');
    const vert = compileShader(gl, gl.VERTEX_SHADER, viewerVertSrc);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, viewerFragSrc);
    program = linkProgram(gl, vert, frag);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    quad = createFullscreenQuad(gl);
    fbo = createFloatFBO(gl, width, 1);
  }

  afterEach(() => {
    quad?.dispose();
    fbo?.dispose();
    fbo = null;
    if (program) gl?.deleteProgram(program);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });

  function applyOptions(opts: RenderOptions): void {
    setupIdentityPipeline(gl, program);
    gl.uniform1i(gl.getUniformLocation(program, 'u_inputTransfer'), INPUT_TRANSFER_SRGB);
    gl.uniform1i(gl.getUniformLocation(program, 'u_outputEncoding'), opts.outputEncoding ?? OUTPUT_ENCODING_LINEAR);
    if (opts.inputPrimaries) {
      const fwd = opts.inputPrimaries === 'p3' ? M.P3_TO_SRGB : M.REC2020_TO_SRGB;
      const inv = opts.inputPrimaries === 'p3' ? INV.SRGB_TO_P3 : INV.SRGB_TO_REC2020;
      gl.uniform1i(gl.getUniformLocation(program, 'u_inputPrimariesEnabled'), 1);
      gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_inputPrimariesMatrix'), false, fwd);
      gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_inputPrimariesInverse'), false, inv);
    }
    if (opts.outputPrimaries) {
      const out = opts.outputPrimaries === 'p3' ? M.SRGB_TO_P3 : M.SRGB_TO_REC2020;
      gl.uniform1i(gl.getUniformLocation(program, 'u_outputPrimariesEnabled'), 1);
      gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_outputPrimariesMatrix'), false, out);
    }
    setUniforms(gl, program, opts.uniforms ?? {});
  }

  function draw(texture: WebGLTexture, width: number): Float32Array {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo!.fbo);
    gl.viewport(0, 0, width, 1);
    quad.draw();
    return readPixelsGLFloat(gl, fbo!.fbo, width, 1);
  }

  function render(rgb: [number, number, number], opts: RenderOptions = {}): Float32Array {
    applyOptions(opts);
    const { texture, dispose } = createSolidTexture(gl, rgb[0], rgb[1], rgb[2], 1.0, 'float32');
    const px = draw(texture, 1);
    dispose();
    return px;
  }

  const rgbOf = (c: [number, number, number]) => ({ r: c[0], g: c[1], b: c[2], a: 1 });

  describe('wide-gamut sources reach a wide-gamut output', () => {
    it('saturated P3 red survives to a display-p3 output', () => {
      // In the BT.709 working space P3 red has negative green and blue.
      const in709 = applyMat3(Array.from(M.P3_TO_SRGB), 1, 0, 0);
      expect(in709[1]).toBeLessThan(-0.03);
      expect(in709[2]).toBeLessThan(-0.01);

      setup();
      const px = render([1, 0, 0], { inputPrimaries: 'p3', outputPrimaries: 'p3' });
      expectPixel(px, 1, 0, 0, { r: 1, g: 0, b: 0, a: 1 }, MATRIX_TOL);
    });

    it('saturated BT.2020 green survives to a rec2020 PQ output', () => {
      const in709 = applyMat3(Array.from(M.REC2020_TO_SRGB), 0, 1, 0);
      expect(in709[0]).toBeLessThan(-0.5);

      setup();
      const px = render([0, 1, 0], {
        inputPrimaries: 'bt2020',
        outputPrimaries: 'rec2020',
        outputEncoding: OUTPUT_ENCODING_PQ,
      });
      // A clamp in BT.709 would leave red at PQ(~0.37) ≈ 0.45 here.
      expectPixel(px, 1, 0, 0, { r: linearToPQ(0), g: linearToPQ(1), b: linearToPQ(0), a: 1 }, 2e-3);
    });

    it('BT.2020 green stays a pure primary through Reinhard tone mapping', () => {
      setup();
      const px = render([0, 4, 0], {
        inputPrimaries: 'bt2020',
        outputPrimaries: 'rec2020',
        uniforms: { u_toneMappingOperator: 1 },
      });
      expect(Math.abs(px[0]!)).toBeLessThan(MATRIX_TOL);
      expect(Math.abs(px[2]!)).toBeLessThan(MATRIX_TOL);
      expect(px[1]!).toBeGreaterThan(0.5);
    });

    it('a negative brightness offset is clamped in the source gamut, not in BT.709', () => {
      setup();
      const src: [number, number, number] = [0.9, 0.05, 0.02];
      const px = render(src, { inputPrimaries: 'p3', outputPrimaries: 'p3', uniforms: { u_brightness: -0.05 } });
      const w = applyMat3(Array.from(M.P3_TO_SRGB), ...src).map((v) => v - 0.05) as [number, number, number];
      const clamped = clampToSourceGamut(...w, M.P3_TO_SRGB, INV.SRGB_TO_P3);
      const expected = applyMat3(Array.from(M.SRGB_TO_P3), ...clamped);
      expectPixel(px, 1, 0, 0, rgbOf(expected), MATRIX_TOL);
    });

    it('P3 colours outside BT.709 are clipped only after the output primaries (sRGB output)', () => {
      setup();
      // P3 red on an sRGB surface: red > 1 in 709 stays (HDR passthrough), negatives clip at the end.
      const px = render([1, 0, 0], { inputPrimaries: 'p3' });
      expect(px[0]!).toBeCloseTo(1.2249, 3);
      expect(px[1]!).toBe(0);
      expect(px[2]!).toBe(0);
    });
  });

  describe('gamut mapping', () => {
    it('does not convert a tagged P3 source a second time', () => {
      setup();
      const src: [number, number, number] = [0.6, 0.5, 0.4];
      const px = render(src, {
        inputPrimaries: 'p3',
        uniforms: { u_gamutMappingEnabled: 1, u_gamutMappingMode: 0, u_sourceGamut: 2, u_targetGamut: 0 },
      });
      const once = applyMat3(Array.from(M.P3_TO_SRGB), ...src);
      expectPixel(px, 1, 0, 0, rgbOf(once), 1e-4);
    });

    it('still converts an untagged pixel declared as P3', () => {
      setup();
      const src: [number, number, number] = [1, 0, 0];
      const px = render(src, {
        uniforms: { u_gamutMappingEnabled: 1, u_gamutMappingMode: 0, u_sourceGamut: 2, u_targetGamut: 0 },
      });
      const expected = applyGamutMappingWorking(src, M.P3_TO_SRGB, null, null, 'clip');
      expectPixel(px, 1, 0, 0, rgbOf(expected), 1e-4);
      expect(px[0]!).toBe(1);
    });

    it('maps into a P3 target and returns working-space values for the output primaries', () => {
      setup();
      const src: [number, number, number] = [0, 1, 0];
      const px = render(src, {
        inputPrimaries: 'bt2020',
        outputPrimaries: 'p3',
        uniforms: { u_gamutMappingEnabled: 1, u_gamutMappingMode: 0, u_sourceGamut: 1, u_targetGamut: 2 },
      });
      // BT.2020 green clipped to the P3 gamut, written to a P3 surface.
      const w = applyMat3(Array.from(M.REC2020_TO_SRGB), ...src);
      const mapped = applyGamutMappingWorking(w, null, M.SRGB_TO_P3, M.P3_TO_SRGB, 'clip');
      const expected = applyMat3(Array.from(M.SRGB_TO_P3), ...mapped);
      expectPixel(px, 1, 0, 0, rgbOf(expected), MATRIX_TOL);
      expect(px[0]!).toBeLessThan(MATRIX_TOL);
      expect(px[1]!).toBeCloseTo(1, 2);
    });

    it('keeps HDR highlights on an HDR output (compress scales with headroom)', () => {
      setup();
      const px = render([2, 2, 2], {
        uniforms: {
          u_hdrHeadroom: 4,
          u_gamutMappingEnabled: 1,
          u_gamutMappingMode: 1,
          u_sourceGamut: 1,
          u_targetGamut: 0,
        },
      });
      expectPixel(px, 1, 0, 0, { r: 2, g: 2, b: 2, a: 1 }, MATRIX_TOL);
    });
  });

  describe('HDR values above 1.0', () => {
    it('survive vibrance', () => {
      setup();
      const src: [number, number, number] = [4, 2, 1];
      const px = render(src, { uniforms: { u_vibranceEnabled: 1, u_vibrance: -0.5 } });
      const expected = applyVibrance(...src, -0.5);
      expectPixel(px, 1, 0, 0, rgbOf(expected), 1e-3);
      expect(px[0]!).toBeGreaterThan(3);
      // Desaturated toward grey: the spread shrinks but the level is kept.
      expect(px[0]! - px[2]!).toBeLessThan(3);
    });

    it('survive the HSL qualifier correction', () => {
      setup();
      const src: [number, number, number] = [3, 0.6, 0.3];
      const [, hue] = hdrNormalizedHsl(...src);
      const px = render(src, {
        uniforms: {
          u_hslQualifierEnabled: 1,
          u_hslHueCenter: hue,
          u_hslHueWidth: 60,
          u_hslHueSoftness: 0,
          u_hslSatCenter: 50,
          u_hslSatWidth: 100,
          u_hslSatSoftness: 0,
          u_hslLumCenter: 50,
          u_hslLumWidth: 100,
          u_hslLumSoftness: 0,
          u_hslCorrHueShift: 0,
          u_hslCorrSatScale: 0.5,
          u_hslCorrLumScale: 1,
        },
      });
      const expected = applyHSLQualifierCorrection(...src, 1, 0, 0.5, 1);
      expectPixel(px, 1, 0, 0, rgbOf(expected), 1e-3);
      expect(px[0]!).toBeGreaterThan(2);
    });

    it('HSL qualifier matches HDR pixels by their normalised hue/saturation', () => {
      setup();
      // Bright orange: a [0,1] clamp would read it as (1, 1, 0.3), i.e. yellow (hue 60).
      const src: [number, number, number] = [4, 2, 0.3];
      const [, hue] = hdrNormalizedHsl(...src);
      expect(hue).toBeLessThan(35);
      const px = render(src, {
        uniforms: {
          u_hslQualifierEnabled: 1,
          u_hslHueCenter: hue,
          u_hslHueWidth: 10,
          u_hslHueSoftness: 0,
          u_hslSatCenter: 50,
          u_hslSatWidth: 100,
          u_hslSatSoftness: 0,
          u_hslLumCenter: 50,
          u_hslLumWidth: 100,
          u_hslLumSoftness: 0,
          u_hslMattePreview: 1,
        },
      });
      expect(px[0]!).toBeCloseTo(1, 3);
    });
  });

  describe('SDR BT.709 → sRGB regression', () => {
    for (let i = 0; i < SDR_SCENARIOS.length; i++) {
      const scenario = SDR_SCENARIOS[i]!;
      it(`${scenario.name} is unchanged`, () => {
        setup(SDR_PIXELS.length);
        applyOptions({ outputEncoding: 0, uniforms: { ...scenario.uniforms, u_outputMode: 0, u_displayTransfer: 1 } });
        const { texture, dispose } = createRowTexture(gl, SDR_PIXELS);
        const px = draw(texture, SDR_PIXELS.length);
        dispose();
        const golden = SDR_GOLDENS[i]!;
        expect(golden).toBeDefined();
        for (let p = 0; p < SDR_PIXELS.length; p++) {
          const g = golden[p]!;
          expectPixel(px, SDR_PIXELS.length, p, 0, { r: g[0]!, g: g[1]!, b: g[2]!, a: 1 }, 1e-5);
        }
      });
    }
  });
});
