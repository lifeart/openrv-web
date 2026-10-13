/**
 * Scope analysis and scene-referred diagnostics (real GLSL).
 *
 * - u_scopeAnalysis: scope readbacks measure the graded scene-referred signal.
 *   Tone mapping, display stages and diagnostic overlays are skipped; grading
 *   (exposure, creative gamma) is kept.
 * - False color and zebra classify the graded scene value expressed on the SDR
 *   video scale, before tone mapping, the display stages and the SDR clamp.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createTestGL, compileShader, linkProgram, createFullscreenQuad } from './helpers/webgl2';
import { readPixelsGLFloat, expectPixel } from './helpers/pixels';
import { createSolidTexture } from './helpers/textures';
import { EPSILON } from './helpers/tolerance';
import { setupIdentityPipeline } from './helpers/pipeline';

import viewerVertSrc from '../shaders/viewer.vert.glsl?raw';
import viewerFragSrc from '../shaders/viewer.frag.glsl?raw';

const W = 1,
  H = 1;

const TONE_MAPPING_REINHARD = 1;
const TONE_MAPPING_ACES = 3;
const OUTPUT_ENCODING_LINEAR = 1;
const OUTPUT_ENCODING_PQ = 3;
const FALSE_COLOR_LUT_UNIT = 13;

function srgbOETF(c: number): number {
  c = Math.max(c, 0);
  if (c <= 0.0031308) return c * 12.92;
  return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
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

/** 256x1 false color LUT whose red channel is the LUT index (i / 255): output red = classified level. */
function createRampLUT(gl: WebGL2RenderingContext): WebGLTexture {
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    data[i * 4] = i;
    data[i * 4 + 3] = 255;
  }
  const tex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0 + FALSE_COLOR_LUT_UNIT);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.activeTexture(gl.TEXTURE0);
  return tex;
}

describe('Scope analysis and scene-referred diagnostics (real GPU)', () => {
  let gl: WebGL2RenderingContext;
  let program: WebGLProgram;
  let quad: ReturnType<typeof createFullscreenQuad>;
  let fbo: ReturnType<typeof createFloatFBO>;
  let rampLUT: WebGLTexture | null = null;

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
    if (rampLUT) gl?.deleteTexture(rampLUT);
    rampLUT = null;
    if (program) gl?.deleteProgram(program);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });

  function uniform1i(name: string, v: number) {
    gl.uniform1i(gl.getUniformLocation(program, name), v);
  }

  function render(
    rgb: [number, number, number],
    setUniforms: (u1i: (name: string, v: number) => void) => void,
  ): Float32Array {
    setupIdentityPipeline(gl, program);
    setUniforms(uniform1i);

    const { texture, dispose } = createSolidTexture(gl, rgb[0], rgb[1], rgb[2], 1.0, 'float32');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    uniform1i('u_texture', 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
    gl.viewport(0, 0, W, H);
    quad.draw();
    const pixels = readPixelsGLFloat(gl, fbo.fbo, W, H);
    dispose();
    return pixels;
  }

  /** Scope readback state as Renderer.beginScopeReadback sets it for HDR content. */
  function scopeReadback(u1i: (name: string, v: number) => void) {
    u1i('u_scopeAnalysis', 1);
    u1i('u_outputEncoding', OUTPUT_ENCODING_LINEAR);
    u1i('u_outputMode', 1);
  }

  function enableRampFalseColor(u1i: (name: string, v: number) => void) {
    rampLUT ??= createRampLUT(gl);
    u1i('u_falseColorLUT', FALSE_COLOR_LUT_UNIT);
    u1i('u_falseColorEnabled', 1);
  }

  describe('u_scopeAnalysis', () => {
    it('SCOPE-GPU-001: tone mapping does not change scope data (4.0 stays 4.0)', () => {
      setup();
      const scope = render([4, 4, 4], (u1i) => {
        scopeReadback(u1i);
        u1i('u_toneMappingOperator', TONE_MAPPING_ACES);
      });
      expectPixel(scope, W, 0, 0, { r: 4, g: 4, b: 4, a: 1 }, EPSILON.HDR_HALF);

      // The display render with the same state is tone mapped.
      const display = render([4, 4, 4], (u1i) => {
        u1i('u_outputEncoding', OUTPUT_ENCODING_LINEAR);
        u1i('u_toneMappingOperator', TONE_MAPPING_ACES);
      });
      expect(display[0]!).toBeLessThan(3.9);
    });

    it('SCOPE-GPU-002: grading stays in the measured signal (exposure +1 stop)', () => {
      setup();
      const scope = render([4, 2, 1], (u1i) => {
        scopeReadback(u1i);
        u1i('u_toneMappingOperator', TONE_MAPPING_ACES);
        gl.uniform3f(gl.getUniformLocation(program, 'u_exposureRGB'), 1, 1, 1);
      });
      expectPixel(scope, W, 0, 0, { r: 8, g: 4, b: 2, a: 1 }, EPSILON.HDR_HALF);
    });

    it('SCOPE-GPU-003: display gamma, brightness, output primaries and channel isolation are skipped', () => {
      setup();
      const scope = render([0.2, 0.4, 0.6], (u1i) => {
        scopeReadback(u1i);
        gl.uniform1f(gl.getUniformLocation(program, 'u_displayGamma'), 2.4);
        gl.uniform1f(gl.getUniformLocation(program, 'u_displayBrightness'), 2.0);
        u1i('u_outputPrimariesEnabled', 1);
        // Swap R and B (column-major)
        gl.uniformMatrix3fv(
          gl.getUniformLocation(program, 'u_outputPrimariesMatrix'),
          false,
          [0, 0, 1, 0, 1, 0, 1, 0, 0],
        );
        u1i('u_channelMode', 1);
      });
      expectPixel(scope, W, 0, 0, { r: 0.2, g: 0.4, b: 0.6, a: 1 }, EPSILON.HDR_HALF);
    });

    it('SCOPE-GPU-004: false color, zebra and out-of-range overlays are skipped', () => {
      setup();
      const scope = render([2, 2, 2], (u1i) => {
        scopeReadback(u1i);
        enableRampFalseColor(u1i);
        u1i('u_zebraEnabled', 1);
        u1i('u_zebraHighEnabled', 1);
        gl.uniform1f(gl.getUniformLocation(program, 'u_zebraHighThreshold'), 0.5);
        u1i('u_outOfRange', 2);
      });
      expectPixel(scope, W, 0, 0, { r: 2, g: 2, b: 2, a: 1 }, EPSILON.HDR_HALF);
    });

    it('SCOPE-GPU-005: creative per-channel gamma stays in the measured signal', () => {
      setup();
      const scope = render([0.25, 0.25, 0.25], (u1i) => {
        scopeReadback(u1i);
        gl.uniform3f(gl.getUniformLocation(program, 'u_gammaRGB'), 2, 2, 2);
      });
      expectPixel(scope, W, 0, 0, { r: 0.5, g: 0.5, b: 0.5, a: 1 }, EPSILON.HDR_HALF);
    });
  });

  describe('false color on the scene-referred signal', () => {
    it('SCOPE-GPU-010: 18% grey classifies at its sRGB signal level despite tone mapping', () => {
      setup();
      const out = render([0.18, 0.18, 0.18], (u1i) => {
        u1i('u_displayTransfer', 1);
        u1i('u_outputMode', 0);
        u1i('u_toneMappingOperator', TONE_MAPPING_ACES);
        enableRampFalseColor(u1i);
      });
      // NEAREST lookup: index floor(level * 256) of 255.
      const expected = Math.floor(srgbOETF(0.18) * 256) / 255;
      expect(out[0]!).toBeCloseTo(expected, 2);
    });

    it('SCOPE-GPU-011: a 4.0 highlight lands in the top (clipped) band on an SDR display with tone mapping', () => {
      setup();
      const out = render([4, 4, 4], (u1i) => {
        u1i('u_displayTransfer', 1);
        u1i('u_outputMode', 0);
        u1i('u_toneMappingOperator', TONE_MAPPING_ACES);
        enableRampFalseColor(u1i);
      });
      expect(out[0]!).toBeCloseTo(1, 3);
    });

    it('SCOPE-GPU-012: classification is the same on a PQ surface as on an SDR display', () => {
      setup();
      const pq = render([0.18, 0.18, 0.18], (u1i) => {
        u1i('u_outputEncoding', OUTPUT_ENCODING_PQ);
        u1i('u_outputMode', 1);
        enableRampFalseColor(u1i);
      });
      const sdr = render([0.18, 0.18, 0.18], (u1i) => {
        u1i('u_displayTransfer', 1);
        u1i('u_outputMode', 0);
        enableRampFalseColor(u1i);
      });
      expect(pq[0]!).toBeCloseTo(sdr[0]!, 4);
    });

    it('SCOPE-GPU-013: display gamma and brightness do not move the classification', () => {
      setup();
      const calibrated = render([0.18, 0.18, 0.18], (u1i) => {
        u1i('u_displayTransfer', 1);
        u1i('u_outputMode', 0);
        gl.uniform1f(gl.getUniformLocation(program, 'u_displayGamma'), 2.0);
        gl.uniform1f(gl.getUniformLocation(program, 'u_displayBrightness'), 0.5);
        enableRampFalseColor(u1i);
      });
      const expected = Math.floor(srgbOETF(0.18) * 256) / 255;
      expect(calibrated[0]!).toBeCloseTo(expected, 2);
    });
  });

  describe('zebra on the scene-referred signal', () => {
    function zebraHigh(u1i: (name: string, v: number) => void) {
      u1i('u_zebraEnabled', 1);
      u1i('u_zebraHighEnabled', 1);
      gl.uniform1f(gl.getUniformLocation(program, 'u_zebraHighThreshold'), 0.95);
      gl.uniform1f(gl.getUniformLocation(program, 'u_zebraTime'), 0);
      gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), 1, 1);
    }

    it('SCOPE-GPU-020: a highlight that tone mapping pulls below 95% still gets zebra stripes', () => {
      setup();
      const sdrState = (u1i: (name: string, v: number) => void) => {
        u1i('u_displayTransfer', 1);
        u1i('u_outputMode', 0);
        u1i('u_toneMappingOperator', TONE_MAPPING_REINHARD);
      };
      const plain = render([2, 2, 2], sdrState);
      // Displayed (tone-mapped, encoded) level is below the 95% threshold.
      expect(plain[1]!).toBeLessThan(0.95);

      const zebra = render([2, 2, 2], (u1i) => {
        sdrState(u1i);
        zebraHigh(u1i);
      });
      // Stripe at the single pixel: mix(color, (1, 0.3, 0.3), 0.5).
      expect(zebra[1]!).toBeCloseTo(plain[1]! * 0.5 + 0.15, 3);
    });

    it('SCOPE-GPU-021: mid grey gets no high zebra', () => {
      setup();
      const out = render([0.18, 0.18, 0.18], (u1i) => {
        u1i('u_displayTransfer', 1);
        u1i('u_outputMode', 0);
        zebraHigh(u1i);
      });
      expect(out[1]!).toBeCloseTo(srgbOETF(0.18), 3);
    });
  });
});
