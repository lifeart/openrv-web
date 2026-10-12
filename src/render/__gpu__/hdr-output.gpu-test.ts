/**
 * HDR input normalization and output encoding — real GLSL pixel accuracy.
 *
 * Drives the full viewer.frag.glsl with all other stages at identity and
 * checks the HDR contract against the reference math and published values:
 *   - HLG and PQ inputs both decode with 1.0 = 203 cd/m² (BT.2408)
 *   - u_outputEncoding PQ/HLG are exact inverses of the input decodes
 *   - extended sRGB keeps values above SDR white
 */
import { describe, it, afterEach, expect } from 'vitest';
import { createTestGL, compileShader, linkProgram, createFullscreenQuad } from './helpers/webgl2';
import { readPixelsGLFloat, expectPixel } from './helpers/pixels';
import { createSolidTexture } from './helpers/textures';
import { setupIdentityPipeline } from './helpers/pipeline';
import { hlgToLinear, linearToHLG, linearToPQ, extendedSRGBEncode } from '../__tests__/shaderMathReference';
import {
  INPUT_TRANSFER_HLG,
  INPUT_TRANSFER_PQ,
  INPUT_TRANSFER_SRGB,
  INPUT_TRANSFER_SRGB_TO_LINEAR,
  OUTPUT_ENCODING_DISPLAY,
  OUTPUT_ENCODING_EXTENDED_SRGB,
  OUTPUT_ENCODING_HLG,
  OUTPUT_ENCODING_LINEAR,
  OUTPUT_ENCODING_PQ,
} from '../../config/RenderConfig';

import viewerVertSrc from '../shaders/viewer.vert.glsl?raw';
import viewerFragSrc from '../shaders/viewer.frag.glsl?raw';

const W = 1,
  H = 1;

// Shader transcendental functions on GPUs are not bit-exact; PQ in particular
// raises to the 78.84 power. 1e-3 in signal space is well under a 10-bit code value.
const SIGNAL_TOL = 1e-3;

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

describe('HDR output contract (real GPU)', () => {
  let gl: WebGL2RenderingContext;
  let program: WebGLProgram;
  let quad: ReturnType<typeof createFullscreenQuad>;
  let fbo: ReturnType<typeof createFloatFBO>;

  function setup() {
    ({ gl } = createTestGL(W, H));
    gl.getExtension('EXT_color_buffer_float');
    const vert = compileShader(gl, gl.VERTEX_SHADER, viewerVertSrc);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, viewerFragSrc);
    program = linkProgram(gl, vert, frag);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    quad = createFullscreenQuad(gl);
    fbo = createFloatFBO(gl, W, H);
  }

  afterEach(() => {
    quad?.dispose();
    fbo?.dispose();
    if (program) gl?.deleteProgram(program);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });

  function render(
    rgb: [number, number, number],
    opts: { inputTransfer: number; outputEncoding: number; displayTransfer?: number },
  ): Float32Array {
    setupIdentityPipeline(gl, program);
    gl.uniform1i(gl.getUniformLocation(program, 'u_inputTransfer'), opts.inputTransfer);
    gl.uniform1i(gl.getUniformLocation(program, 'u_outputEncoding'), opts.outputEncoding);
    gl.uniform1i(gl.getUniformLocation(program, 'u_displayTransfer'), opts.displayTransfer ?? 0);
    const { texture, dispose } = createSolidTexture(gl, rgb[0], rgb[1], rgb[2], 1.0, 'float32');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
    gl.viewport(0, 0, W, H);
    quad.draw();
    const pixels = readPixelsGLFloat(gl, fbo.fbo, W, H);
    dispose();
    return pixels;
  }

  describe('input normalization (1.0 = 203 cd/m²)', () => {
    it('HLG reference white 0.75 decodes to ~1.0', () => {
      setup();
      const px = render([0.75, 0.75, 0.75], {
        inputTransfer: INPUT_TRANSFER_HLG,
        outputEncoding: OUTPUT_ENCODING_LINEAR,
      });
      const [er] = hlgToLinear(0.75, 0.75, 0.75);
      expectPixel(px, W, 0, 0, { r: er, g: er, b: er, a: 1 }, 2e-3);
      expect(px[0]).toBeCloseTo(1.0, 2);
    });

    it('PQ 203 cd/m² (0.58069) decodes to ~1.0, matching HLG reference white', () => {
      setup();
      const px = render([0.58069, 0.58069, 0.58069], {
        inputTransfer: INPUT_TRANSFER_PQ,
        outputEncoding: OUTPUT_ENCODING_LINEAR,
      });
      expect(px[0]).toBeCloseTo(1.0, 2);
    });
  });

  it('sRGB-curve input (resized HDR VideoFrame) decodes extended values above 1.0', () => {
    setup();
    // extendedSRGBEncode(4) ≈ 1.7869: an extended-range value from a float16 display-p3 canvas
    const enc = extendedSRGBEncode(4);
    const px = render([enc, extendedSRGBEncode(0.18), 0], {
      inputTransfer: INPUT_TRANSFER_SRGB_TO_LINEAR,
      outputEncoding: OUTPUT_ENCODING_LINEAR,
    });
    expectPixel(px, W, 0, 0, { r: 4, g: 0.18, b: 0, a: 1 }, 2e-3);
  });

  describe('output encoding', () => {
    it('PQ encode: linear 1.0 -> 0.58069 and 1000/203 -> 0.75183', () => {
      setup();
      let px = render([1, 1, 1], { inputTransfer: INPUT_TRANSFER_SRGB, outputEncoding: OUTPUT_ENCODING_PQ });
      expectPixel(px, W, 0, 0, { r: linearToPQ(1), g: linearToPQ(1), b: linearToPQ(1), a: 1 }, SIGNAL_TOL);
      expect(px[0]).toBeCloseTo(0.58069, 2);
      const v = 1000 / 203;
      px = render([v, v, v], { inputTransfer: INPUT_TRANSFER_SRGB, outputEncoding: OUTPUT_ENCODING_PQ });
      expect(px[0]).toBeCloseTo(0.75183, 2);
    });

    it('HLG encode: linear 1.0 -> ~0.75 and nominal peak -> 1.0', () => {
      setup();
      let px = render([1, 1, 1], { inputTransfer: INPUT_TRANSFER_SRGB, outputEncoding: OUTPUT_ENCODING_HLG });
      const [e] = linearToHLG(1, 1, 1);
      expectPixel(px, W, 0, 0, { r: e, g: e, b: e, a: 1 }, SIGNAL_TOL);
      const peak = 1000 / 203;
      px = render([peak, peak, peak], { inputTransfer: INPUT_TRANSFER_SRGB, outputEncoding: OUTPUT_ENCODING_HLG });
      expect(px[0]).toBeCloseTo(1.0, 2);
    });

    it('HLG in -> HLG out is identity (grey and colored)', () => {
      setup();
      for (const rgb of [
        [0.25, 0.25, 0.25],
        [0.75, 0.75, 0.75],
        [0.75, 0.5, 0.25],
        [0.2, 0.8, 0.4],
      ] as [number, number, number][]) {
        const px = render(rgb, { inputTransfer: INPUT_TRANSFER_HLG, outputEncoding: OUTPUT_ENCODING_HLG });
        expectPixel(px, W, 0, 0, { r: rgb[0], g: rgb[1], b: rgb[2], a: 1 }, SIGNAL_TOL);
      }
    });

    it('PQ in -> PQ out is identity', () => {
      setup();
      for (const s of [0.25, 0.5, 0.58069, 0.75]) {
        const px = render([s, s, s], { inputTransfer: INPUT_TRANSFER_PQ, outputEncoding: OUTPUT_ENCODING_PQ });
        expectPixel(px, W, 0, 0, { r: s, g: s, b: s, a: 1 }, SIGNAL_TOL);
      }
    });

    it('extended sRGB keeps values above SDR white', () => {
      setup();
      const px = render([4, 0.18, 0], {
        inputTransfer: INPUT_TRANSFER_SRGB,
        outputEncoding: OUTPUT_ENCODING_EXTENDED_SRGB,
      });
      expectPixel(px, W, 0, 0, { r: extendedSRGBEncode(4), g: extendedSRGBEncode(0.18), b: 0, a: 1 }, SIGNAL_TOL);
      expect(px[0]).toBeGreaterThan(1.0);
    });

    it('display encoding still applies the user display transfer (SDR unchanged)', () => {
      setup();
      const px = render([0.18, 0.18, 0.18], {
        inputTransfer: INPUT_TRANSFER_SRGB,
        outputEncoding: OUTPUT_ENCODING_DISPLAY,
        displayTransfer: 1,
      });
      const e = extendedSRGBEncode(0.18);
      expectPixel(px, W, 0, 0, { r: e, g: e, b: e, a: 1 }, SIGNAL_TOL);
    });

    it('HDR encodings ignore the user display transfer (no double encode)', () => {
      setup();
      const px = render([1, 1, 1], {
        inputTransfer: INPUT_TRANSFER_SRGB,
        outputEncoding: OUTPUT_ENCODING_PQ,
        displayTransfer: 1,
      });
      expect(px[0]).toBeCloseTo(0.58069, 2);
    });
  });
});
