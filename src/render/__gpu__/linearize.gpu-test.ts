/**
 * Phase 4 — Single-Stage Pixel Accuracy: Linearize (EOTF) tests.
 *
 * Tests the input transfer functions (sRGB, HLG, PQ) by driving the
 * full viewer.frag.glsl shader with all other stages set to identity,
 * then reading back float pixels from an FBO to verify EOTF math.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestGL, compileShader, linkProgram, createFullscreenQuad } from './helpers/webgl2';
import { readPixelsGLFloat, expectPixel } from './helpers/pixels';
import { createSolidTexture } from './helpers/textures';
import { EPSILON } from './helpers/tolerance';

import viewerVertSrc from '../shaders/viewer.vert.glsl?raw';
import viewerFragSrc from '../shaders/viewer.frag.glsl?raw';

/**
 * Sets all viewer uniforms to identity/passthrough values so that only
 * the targeted stage has an effect. Renders to an RGBA32F FBO for
 * float-precision readback.
 */
function setupIdentityPipeline(gl: WebGL2RenderingContext, program: WebGLProgram) {
  gl.useProgram(program);

  // Vertex transform: identity (fill viewport)
  gl.uniform2f(gl.getUniformLocation(program, 'u_offset'), 0, 0);
  gl.uniform2f(gl.getUniformLocation(program, 'u_scale'), 1, 1);
  // Identity rotation matrix (2x2)
  gl.uniformMatrix2fv(gl.getUniformLocation(program, 'u_texRotationMatrix'), false, [1, 0, 0, 1]);
  gl.uniform1i(gl.getUniformLocation(program, 'u_texFlipH'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_texFlipV'), 0);

  // Color adjustments: identity
  gl.uniform3f(gl.getUniformLocation(program, 'u_exposureRGB'), 0, 0, 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_gammaRGB'), 1, 1, 1);
  gl.uniform1f(gl.getUniformLocation(program, 'u_saturation'), 1);
  gl.uniform3f(gl.getUniformLocation(program, 'u_contrastRGB'), 1, 1, 1);
  gl.uniform3f(gl.getUniformLocation(program, 'u_scaleRGB'), 1, 1, 1);
  gl.uniform3f(gl.getUniformLocation(program, 'u_offsetRGB'), 0, 0, 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_brightness'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_temperature'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tint'), 0);

  // Hue rotation: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_hueRotationEnabled'), 0);
  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_hueRotationMatrix'), false, [1,0,0, 0,1,0, 0,0,1]);

  // Tone mapping: off
  gl.uniform1i(gl.getUniformLocation(program, 'u_toneMappingOperator'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmReinhardWhitePoint'), 4.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmFilmicExposureBias'), 2.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmFilmicWhitePoint'), 11.2);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmDragoBias'), 0.85);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmDragoLmax'), 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmDragoLwa'), 0.5);
  gl.uniform1f(gl.getUniformLocation(program, 'u_tmDragoBrightness'), 2.0);

  // Inversion: off
  gl.uniform1i(gl.getUniformLocation(program, 'u_invert'), 0);

  // Output mode: HDR passthrough (1) so we get raw linear values without clamping
  gl.uniform1i(gl.getUniformLocation(program, 'u_outputMode'), 1);

  // Input transfer: default sRGB (0) — will be overridden per test
  gl.uniform1i(gl.getUniformLocation(program, 'u_inputTransfer'), 0);

  // HDR headroom: 1.0 (SDR)
  gl.uniform1f(gl.getUniformLocation(program, 'u_hdrHeadroom'), 1.0);

  // CDL: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_cdlEnabled'), 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_cdlSlope'), 1, 1, 1);
  gl.uniform3f(gl.getUniformLocation(program, 'u_cdlOffset'), 0, 0, 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_cdlPower'), 1, 1, 1);
  gl.uniform1f(gl.getUniformLocation(program, 'u_cdlSaturation'), 1);
  gl.uniform1i(gl.getUniformLocation(program, 'u_cdlColorspace'), 0);

  // Curves: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_curvesEnabled'), 0);

  // Color wheels: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_colorWheelsEnabled'), 0);

  // False color: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_falseColorEnabled'), 0);

  // Contour: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_contourEnabled'), 0);

  // Zebra: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_zebraEnabled'), 0);

  // Channel mode: RGB (0)
  gl.uniform1i(gl.getUniformLocation(program, 'u_channelMode'), 0);

  // LUTs: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_fileLUT3DEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_lookLUT3DEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_displayLUT3DEnabled'), 0);

  // Display transfer: linear (0) — no OETF
  gl.uniform1i(gl.getUniformLocation(program, 'u_displayTransfer'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_displayGamma'), 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_displayBrightness'), 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_displayCustomGamma'), 2.2);

  // Background: none
  gl.uniform1i(gl.getUniformLocation(program, 'u_backgroundPattern'), 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_bgColor1'), 0, 0, 0);
  gl.uniform3f(gl.getUniformLocation(program, 'u_bgColor2'), 0, 0, 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_bgCheckerSize'), 8);
  gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), 1, 1);

  // Highlights/Shadows: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_hsEnabled'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_highlights'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_shadows'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_whites'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_blacks'), 0);

  // Vibrance: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_vibranceEnabled'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_vibrance'), 0);

  // Clarity: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_clarityEnabled'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_clarity'), 0);
  gl.uniform2f(gl.getUniformLocation(program, 'u_texelSize'), 1, 1);

  // Sharpen: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_sharpenEnabled'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_sharpenAmount'), 0);

  // HSL qualifier: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_hslQualifierEnabled'), 0);

  // Gamut mapping: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_gamutMappingEnabled'), 0);

  // Input/output primaries: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_inputPrimariesEnabled'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_outputPrimariesEnabled'), 0);

  // Linearize: disabled (no log conversion)
  gl.uniform1i(gl.getUniformLocation(program, 'u_linearizeLogType'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'u_linearizeFileGamma'), 1.0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_linearizeSRGB2linear'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_linearizeRec709ToLinear'), 0);

  // Deinterlace: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_deinterlaceEnabled'), 0);

  // Film: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_filmEnabled'), 0);

  // Perspective: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_perspectiveEnabled'), 0);

  // Inline LUT: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_inlineLUTEnabled'), 0);

  // Out-of-range: off
  gl.uniform1i(gl.getUniformLocation(program, 'u_outOfRange'), 0);

  // Channel swizzle: identity
  gl.uniform4i(gl.getUniformLocation(program, 'u_channelSwizzle'), 0, 1, 2, 3);

  // Premult: off
  gl.uniform1i(gl.getUniformLocation(program, 'u_premult'), 0);

  // Spherical: disabled
  gl.uniform1i(gl.getUniformLocation(program, 'u_sphericalEnabled'), 0);

  // Dither/quantize: off
  gl.uniform1i(gl.getUniformLocation(program, 'u_ditherMode'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_quantizeBits'), 0);
}

/**
 * Creates an RGBA32F FBO for float-precision readback.
 */
function createFloatFBO(gl: WebGL2RenderingContext, width: number, height: number) {
  const fbo = gl.createFramebuffer()!;
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`FBO incomplete: ${status}`);
  }
  return {
    fbo,
    dispose: () => {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
    },
  };
}

// Reference math: sRGB EOTF (matches shader srgbEOTF)
function srgbEOTFRef(x: number): number {
  if (x <= 0.04045) return x / 12.92;
  return Math.pow((x + 0.055) / 1.055, 2.4);
}

// Reference math: HLG inverse OETF + OOTF
function hlgOETFInverseRef(e: number): number {
  const a = 0.17883277;
  const b = 0.28466892;
  const c = 0.55991073;
  if (e <= 0.5) return (e * e) / 3.0;
  return (Math.exp((e - c) / a) + b) / 12.0;
}

function hlgToLinearRef(r: number, g: number, b: number): [number, number, number] {
  const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722;
  const sr = hlgOETFInverseRef(r);
  const sg = hlgOETFInverseRef(g);
  const sb = hlgOETFInverseRef(b);
  const ys = sr * LUMA_R + sg * LUMA_G + sb * LUMA_B;
  const ootfGain = Math.pow(Math.max(ys, 1e-6), 0.2);
  return [sr * ootfGain, sg * ootfGain, sb * ootfGain];
}

// Reference math: PQ EOTF
function pqEOTFRef(n: number): number {
  const m1 = 0.1593017578125;
  const m2 = 78.84375;
  const c1 = 0.8359375;
  const c2 = 18.8515625;
  const c3 = 18.6875;
  const nm1 = Math.pow(Math.max(n, 0), 1.0 / m2);
  const num = Math.max(nm1 - c1, 0);
  const den = c2 - c3 * nm1;
  return Math.pow(num / Math.max(den, 1e-6), 1.0 / m1);
}

function pqToLinearRef(r: number, g: number, b: number): [number, number, number] {
  const norm = 10000.0 / 203.0;
  return [pqEOTFRef(r) * norm, pqEOTFRef(g) * norm, pqEOTFRef(b) * norm];
}

describe('Linearize Stage — EOTF Pixel Accuracy (real GPU)', () => {
  let gl: WebGL2RenderingContext;
  let program: WebGLProgram;
  let quad: ReturnType<typeof createFullscreenQuad>;
  let fbo: ReturnType<typeof createFloatFBO>;
  const W = 1, H = 1;

  function setup() {
    ({ gl } = createTestGL(W, H));
    // Enable float texture rendering
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

  /**
   * Renders a solid float texture through the pipeline with the given
   * input transfer uniform, reads back float pixels from FBO.
   */
  function renderWithTransfer(inputR: number, inputG: number, inputB: number, inputTransfer: number): Float32Array {
    setupIdentityPipeline(gl, program);
    gl.uniform1i(gl.getUniformLocation(program, 'u_inputTransfer'), inputTransfer);

    // Create float texture with exact input values
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

  // --- sRGB EOTF (u_inputTransfer = 0) ---
  // When u_inputTransfer == 0, the shader does NOT apply sRGB EOTF
  // (it treats input as already linear). So passthrough is expected.

  describe('sRGB/linear passthrough (u_inputTransfer = 0)', () => {
    it('mid-gray 0.5 passes through unchanged', () => {
      setup();
      const pixels = renderWithTransfer(0.5, 0.5, 0.5, 0);
      expectPixel(pixels, W, 0, 0, { r: 0.5, g: 0.5, b: 0.5, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('black 0.0 passes through unchanged', () => {
      setup();
      const pixels = renderWithTransfer(0.0, 0.0, 0.0, 0);
      expectPixel(pixels, W, 0, 0, { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, EPSILON.HDR_FULL);
    });

    it('white 1.0 passes through unchanged', () => {
      setup();
      const pixels = renderWithTransfer(1.0, 1.0, 1.0, 0);
      expectPixel(pixels, W, 0, 0, { r: 1.0, g: 1.0, b: 1.0, a: 1.0 }, EPSILON.HDR_FULL);
    });
  });

  // --- sRGB EOTF via linearize path (u_linearizeSRGB2linear = 1) ---

  describe('sRGB EOTF via linearize', () => {
    function renderWithSRGBLinearize(r: number, g: number, b: number): Float32Array {
      setupIdentityPipeline(gl, program);
      gl.uniform1i(gl.getUniformLocation(program, 'u_inputTransfer'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'u_linearizeSRGB2linear'), 1);

      const { texture, dispose: disposeTex } = createSolidTexture(gl, r, g, b, 1.0, 'float32');
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

    it('sRGB 0.5 -> linear ~0.2140', () => {
      setup();
      const expected = srgbEOTFRef(0.5);
      const pixels = renderWithSRGBLinearize(0.5, 0.5, 0.5);
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('sRGB 0.0 -> linear 0.0', () => {
      setup();
      const pixels = renderWithSRGBLinearize(0.0, 0.0, 0.0);
      expectPixel(pixels, W, 0, 0, { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, EPSILON.HDR_FULL);
    });

    it('sRGB 1.0 -> linear 1.0', () => {
      setup();
      const pixels = renderWithSRGBLinearize(1.0, 1.0, 1.0);
      expectPixel(pixels, W, 0, 0, { r: 1.0, g: 1.0, b: 1.0, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('sRGB low value (linear segment): 0.03 -> ~0.00232', () => {
      setup();
      const expected = srgbEOTFRef(0.03);
      const pixels = renderWithSRGBLinearize(0.03, 0.03, 0.03);
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- HLG EOTF (u_inputTransfer = 1) ---

  describe('HLG EOTF (u_inputTransfer = 1)', () => {
    it('HLG 0.0 -> linear 0.0', () => {
      setup();
      const pixels = renderWithTransfer(0.0, 0.0, 0.0, 1);
      // HLG(0) = 0^2/3 = 0, OOTF gain = pow(~0, 0.2) ~ 0
      expectPixel(pixels, W, 0, 0, { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('HLG 0.5 (boundary of piecewise) -> known value', () => {
      setup();
      const [er, eg, eb] = hlgToLinearRef(0.5, 0.5, 0.5);
      const pixels = renderWithTransfer(0.5, 0.5, 0.5, 1);
      expectPixel(pixels, W, 0, 0, { r: er, g: eg, b: eb, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('HLG 0.75 -> known value', () => {
      setup();
      const [er, eg, eb] = hlgToLinearRef(0.75, 0.75, 0.75);
      const pixels = renderWithTransfer(0.75, 0.75, 0.75, 1);
      expectPixel(pixels, W, 0, 0, { r: er, g: eg, b: eb, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('HLG 1.0 -> known value', () => {
      setup();
      const [er, eg, eb] = hlgToLinearRef(1.0, 1.0, 1.0);
      const pixels = renderWithTransfer(1.0, 1.0, 1.0, 1);
      expectPixel(pixels, W, 0, 0, { r: er, g: eg, b: eb, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- PQ EOTF (u_inputTransfer = 2) ---

  describe('PQ EOTF (u_inputTransfer = 2)', () => {
    it('PQ 0.0 -> linear 0.0', () => {
      setup();
      const pixels = renderWithTransfer(0.0, 0.0, 0.0, 2);
      expectPixel(pixels, W, 0, 0, { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('PQ 0.5 -> known value', () => {
      setup();
      const [er, eg, eb] = pqToLinearRef(0.5, 0.5, 0.5);
      const pixels = renderWithTransfer(0.5, 0.5, 0.5, 2);
      // PQ values can be large; use relative tolerance
      const tolerance = Math.max(EPSILON.HDR_HALF, Math.abs(er) * 0.001);
      expectPixel(pixels, W, 0, 0, { r: er, g: eg, b: eb, a: 1.0 }, tolerance);
    });

    it('PQ 0.58 (approx SDR white ~203 cd/m²) -> ~1.0', () => {
      setup();
      const [er, eg, eb] = pqToLinearRef(0.58, 0.58, 0.58);
      const pixels = renderWithTransfer(0.58, 0.58, 0.58, 2);
      const tolerance = Math.max(EPSILON.HDR_HALF, Math.abs(er) * 0.001);
      expectPixel(pixels, W, 0, 0, { r: er, g: eg, b: eb, a: 1.0 }, tolerance);
    });

    it('PQ 1.0 -> peak value (~49.26)', () => {
      setup();
      const [er, eg, eb] = pqToLinearRef(1.0, 1.0, 1.0);
      const pixels = renderWithTransfer(1.0, 1.0, 1.0, 2);
      const tolerance = Math.max(EPSILON.HDR_HALF, Math.abs(er) * 0.002);
      expectPixel(pixels, W, 0, 0, { r: er, g: eg, b: eb, a: 1.0 }, tolerance);
    });
  });
});
