/**
 * Phase 4 — Single-Stage Pixel Accuracy: Display Output tests.
 *
 * Tests display transfer functions (sRGB OETF, Rec.709, gamma 2.2/2.4),
 * creative gamma, display gamma override, display brightness, and color
 * inversion by driving the full viewer.frag.glsl with all other stages
 * at identity.
 */
import { describe, it, afterEach } from 'vitest';
import { createTestGL, compileShader, linkProgram, createFullscreenQuad } from './helpers/webgl2';
import { readPixelsGLFloat, expectPixel } from './helpers/pixels';
import { createSolidTexture } from './helpers/textures';
import { EPSILON } from './helpers/tolerance';

import viewerVertSrc from '../shaders/viewer.vert.glsl?raw';
import viewerFragSrc from '../shaders/viewer.frag.glsl?raw';

const W = 1, H = 1;

function setupIdentityPipeline(gl: WebGL2RenderingContext, program: WebGLProgram) {
  gl.useProgram(program);
  gl.uniform2f(gl.getUniformLocation(program, 'u_offset'), 0, 0);
  gl.uniform2f(gl.getUniformLocation(program, 'u_scale'), 1, 1);
  gl.uniformMatrix2fv(gl.getUniformLocation(program, 'u_texRotationMatrix'), false, [1, 0, 0, 1]);
  gl.uniform1i(gl.getUniformLocation(program, 'u_texFlipH'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_texFlipV'), 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_exposureRGB'), 0, 0, 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_gammaRGB'), 1, 1, 1);
  gl.uniform1f(gl.getUniformLocation(program, 'u_saturation'), 1);
  gl.uniform3f(gl.getUniformLocation(program, 'u_contrastRGB'), 1, 1, 1);
  gl.uniform3f(gl.getUniformLocation(program, 'u_scaleRGB'), 1, 1, 1);
  gl.uniform3f(gl.getUniformLocation(program, 'u_offsetRGB'), 0, 0, 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_brightness'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_temperature'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tint'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_hueRotationEnabled'), 0);
  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_hueRotationMatrix'), false, [1,0,0,0,1,0,0,0,1]);
  gl.uniform1i(gl.getUniformLocation(program, 'u_toneMappingOperator'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmReinhardWhitePoint'), 4.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmFilmicExposureBias'), 2.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmFilmicWhitePoint'), 11.2);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmDragoBias'), 0.85);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmDragoLmax'), 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmDragoLwa'), 0.5);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmDragoBrightness'), 2.0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_invert'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_outputMode'), 1); // HDR passthrough for float readback
  gl.uniform1i(gl.getUniformLocation(program, 'u_inputTransfer'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_hdrHeadroom'), 1.0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_cdlEnabled'), 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_cdlSlope'), 1, 1, 1);
  gl.uniform3f(gl.getUniformLocation(program, 'u_cdlOffset'), 0, 0, 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_cdlPower'), 1, 1, 1);
  gl.uniform1f(gl.getUniformLocation(program, 'u_cdlSaturation'), 1);
  gl.uniform1i(gl.getUniformLocation(program, 'u_cdlColorspace'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_curvesEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_colorWheelsEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_falseColorEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_contourEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_zebraEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_channelMode'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_fileLUT3DEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_lookLUT3DEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_displayLUT3DEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_displayTransfer'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_displayGamma'), 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_displayBrightness'), 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_displayCustomGamma'), 2.2);
  gl.uniform1i(gl.getUniformLocation(program, 'u_backgroundPattern'), 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_bgColor1'), 0, 0, 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_bgColor2'), 0, 0, 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_bgCheckerSize'), 8);
  gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), 1, 1);
  gl.uniform1i(gl.getUniformLocation(program, 'u_hsEnabled'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_highlights'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_shadows'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_whites'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_blacks'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_vibranceEnabled'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_vibrance'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_clarityEnabled'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_clarity'), 0);
  gl.uniform2f(gl.getUniformLocation(program, 'u_texelSize'), 1, 1);
  gl.uniform1i(gl.getUniformLocation(program, 'u_sharpenEnabled'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_sharpenAmount'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_hslQualifierEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_gamutMappingEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_inputPrimariesEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_outputPrimariesEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_linearizeLogType'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_linearizeFileGamma'), 1.0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_linearizeSRGB2linear'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_linearizeRec709ToLinear'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_deinterlaceEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_filmEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_perspectiveEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_inlineLUTEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_outOfRange'), 0);
  gl.uniform4i(gl.getUniformLocation(program, 'u_channelSwizzle'), 0, 1, 2, 3);
  gl.uniform1i(gl.getUniformLocation(program, 'u_premult'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_sphericalEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_ditherMode'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_quantizeBits'), 0);
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
  return { fbo, dispose: () => { gl.deleteFramebuffer(fbo); gl.deleteTexture(tex); } };
}

// Reference: sRGB inverse EOTF (linear -> sRGB)
function displayTransferSRGB(c: number): number {
  c = Math.max(c, 0);
  if (c <= 0.0031308) return c * 12.92;
  return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
}

// Reference: Rec.709 inverse EOTF
function displayTransferRec709(c: number): number {
  c = Math.max(c, 0);
  if (c < 0.018) return 4.5 * c;
  return 1.099 * Math.pow(c, 0.45) - 0.099;
}

describe('Display Output — Pixel Accuracy (real GPU)', () => {
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

  function renderWith(
    inputR: number, inputG: number, inputB: number,
    setUniforms: (gl: WebGL2RenderingContext, program: WebGLProgram) => void,
  ): Float32Array {
    setupIdentityPipeline(gl, program);
    setUniforms(gl, program);

    const { texture, dispose: disposeTex } = createSolidTexture(gl, inputR, inputG, inputB, 1.0, 'float32');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
    gl.viewport(0, 0, W, H);
    quad.draw();

    const pixels = readPixelsGLFloat(gl, fbo.fbo, W, H);
    disposeTex();
    return pixels;
  }

  // --- Display Transfer: sRGB (u_displayTransfer = 1) ---

  describe('sRGB display transfer', () => {
    it('linear 0.2140 -> sRGB ~0.5', () => {
      setup();
      const input = 0.2140;
      const expected = displayTransferSRGB(input);
      const pixels = renderWith(input, input, input, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_displayTransfer'), 1);
      });
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('linear 0.0 -> sRGB 0.0', () => {
      setup();
      const pixels = renderWith(0, 0, 0, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_displayTransfer'), 1);
      });
      expectPixel(pixels, W, 0, 0, { r: 0, g: 0, b: 0, a: 1.0 }, EPSILON.HDR_FULL);
    });

    it('linear 1.0 -> sRGB 1.0', () => {
      setup();
      const pixels = renderWith(1, 1, 1, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_displayTransfer'), 1);
      });
      expectPixel(pixels, W, 0, 0, { r: 1, g: 1, b: 1, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('linear 0.003 (below sRGB knee) -> ~0.0387', () => {
      setup();
      const input = 0.003;
      const expected = displayTransferSRGB(input);
      const pixels = renderWith(input, input, input, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_displayTransfer'), 1);
      });
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Display Transfer: Rec.709 (u_displayTransfer = 2) ---

  describe('Rec.709 display transfer', () => {
    it('linear 0.5 -> Rec.709 encoded', () => {
      setup();
      const expected = displayTransferRec709(0.5);
      const pixels = renderWith(0.5, 0.5, 0.5, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_displayTransfer'), 2);
      });
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('linear 0.01 (below Rec.709 knee) -> 0.045', () => {
      setup();
      const expected = displayTransferRec709(0.01);
      const pixels = renderWith(0.01, 0.01, 0.01, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_displayTransfer'), 2);
      });
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Display Transfer: Gamma 2.2 (u_displayTransfer = 3) ---

  describe('Gamma 2.2 display transfer', () => {
    it('linear 0.5 -> pow(0.5, 1/2.2)', () => {
      setup();
      const expected = Math.pow(0.5, 1 / 2.2);
      const pixels = renderWith(0.5, 0.5, 0.5, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_displayTransfer'), 3);
      });
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Display Transfer: Gamma 2.4 (u_displayTransfer = 4) ---

  describe('Gamma 2.4 display transfer', () => {
    it('linear 0.5 -> pow(0.5, 1/2.4)', () => {
      setup();
      const expected = Math.pow(0.5, 1 / 2.4);
      const pixels = renderWith(0.5, 0.5, 0.5, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_displayTransfer'), 4);
      });
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Creative Gamma (u_gammaRGB) ---

  describe('Creative gamma (per-channel)', () => {
    it('gamma 2.0 on 0.25: pow(0.25, 1/2) = 0.5', () => {
      setup();
      const pixels = renderWith(0.25, 0.25, 0.25, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_gammaRGB'), 2, 2, 2);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.5, g: 0.5, b: 0.5, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('gamma 0.5 on 0.25: pow(0.25, 1/0.5) = pow(0.25, 2) = 0.0625', () => {
      setup();
      const expected = Math.pow(0.25, 1 / 0.5);
      const pixels = renderWith(0.25, 0.25, 0.25, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_gammaRGB'), 0.5, 0.5, 0.5);
      });
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('per-channel gamma: R=2, G=1, B=0.5 on 0.25', () => {
      setup();
      const er = Math.pow(0.25, 1 / 2);
      const eg = Math.pow(0.25, 1 / 1); // identity
      const eb = Math.pow(0.25, 1 / 0.5);
      const pixels = renderWith(0.25, 0.25, 0.25, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_gammaRGB'), 2, 1, 0.5);
      });
      expectPixel(pixels, W, 0, 0, { r: er, g: eg, b: eb, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Display Gamma Override ---

  describe('Display gamma override', () => {
    it('displayGamma 2.2: pow(0.5, 1/2.2)', () => {
      setup();
      const expected = Math.pow(0.5, 1 / 2.2);
      const pixels = renderWith(0.5, 0.5, 0.5, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_displayGamma'), 2.2);
      });
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('displayGamma 1.0 (identity): output matches input', () => {
      setup();
      const pixels = renderWith(0.5, 0.5, 0.5, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_displayGamma'), 1.0);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.5, g: 0.5, b: 0.5, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Display Brightness ---

  describe('Display brightness', () => {
    it('brightness 2.0: 0.3 -> 0.6', () => {
      setup();
      const pixels = renderWith(0.3, 0.3, 0.3, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_displayBrightness'), 2.0);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.6, g: 0.6, b: 0.6, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('brightness 0.5: 0.8 -> 0.4', () => {
      setup();
      const pixels = renderWith(0.8, 0.8, 0.8, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_displayBrightness'), 0.5);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.4, g: 0.4, b: 0.4, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Color Inversion ---

  describe('Color inversion', () => {
    it('invert: 0.3 -> 0.7', () => {
      setup();
      const pixels = renderWith(0.3, 0.3, 0.3, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_invert'), 1);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.7, g: 0.7, b: 0.7, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('invert: 0.0 -> 1.0', () => {
      setup();
      const pixels = renderWith(0.0, 0.0, 0.0, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_invert'), 1);
      });
      expectPixel(pixels, W, 0, 0, { r: 1.0, g: 1.0, b: 1.0, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('invert: 1.0 -> 0.0', () => {
      setup();
      const pixels = renderWith(1.0, 1.0, 1.0, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_invert'), 1);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('invert on color: (0.2, 0.5, 0.8) -> (0.8, 0.5, 0.2)', () => {
      setup();
      const pixels = renderWith(0.2, 0.5, 0.8, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_invert'), 1);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.8, g: 0.5, b: 0.2, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- SDR Output Clamp ---

  describe('SDR output clamp (u_outputMode = 0)', () => {
    it('value > 1.0 clamped to 1.0', () => {
      setup();
      const pixels = renderWith(1.5, 2.0, 0.5, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_outputMode'), 0);
      });
      expectPixel(pixels, W, 0, 0, { r: 1.0, g: 1.0, b: 0.5, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('negative values clamped to 0.0', () => {
      setup();
      // Use brightness to push values negative
      const pixels = renderWith(0.1, 0.1, 0.1, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_brightness'), -0.5);
        gl.uniform1i(gl.getUniformLocation(prog, 'u_outputMode'), 0);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });
});
