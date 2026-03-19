/**
 * Phase 4 — Single-Stage Pixel Accuracy: Primary Grade tests.
 *
 * Tests exposure, brightness, contrast, saturation, scale/offset, and
 * temperature/tint by driving the full viewer.frag.glsl with all other
 * stages set to identity. Uses RGBA32F FBO for float-precision readback.
 */
import { describe, it, afterEach } from 'vitest';
import { createTestGL, compileShader, linkProgram, createFullscreenQuad } from './helpers/webgl2';
import { readPixelsGLFloat, expectPixel } from './helpers/pixels';
import { createSolidTexture } from './helpers/textures';
import { EPSILON } from './helpers/tolerance';
import { setupIdentityPipeline } from './helpers/pipeline';

import viewerVertSrc from '../shaders/viewer.vert.glsl?raw';
import viewerFragSrc from '../shaders/viewer.frag.glsl?raw';

const W = 1,
  H = 1;

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

describe('Primary Grade — Pixel Accuracy (real GPU)', () => {
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

  /** Renders with a specific uniform override applied on top of identity pipeline. */
  function renderWith(
    inputR: number,
    inputG: number,
    inputB: number,
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

  // --- Identity passthrough ---

  it('identity: all defaults -> output matches input', () => {
    setup();
    const pixels = renderWith(0.5, 0.3, 0.7, () => {});
    expectPixel(pixels, W, 0, 0, { r: 0.5, g: 0.3, b: 0.7, a: 1.0 }, EPSILON.HDR_HALF);
  });

  // --- Exposure ---

  describe('Exposure', () => {
    it('+1 stop: 0.5 -> 1.0', () => {
      setup();
      // exposure = +1 stop -> multiply by 2^1 = 2
      const pixels = renderWith(0.5, 0.5, 0.5, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_exposureRGB'), 1, 1, 1);
      });
      expectPixel(pixels, W, 0, 0, { r: 1.0, g: 1.0, b: 1.0, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('-1 stop: 0.5 -> 0.25', () => {
      setup();
      const pixels = renderWith(0.5, 0.5, 0.5, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_exposureRGB'), -1, -1, -1);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.25, g: 0.25, b: 0.25, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('+2 stops: 0.25 -> 1.0', () => {
      setup();
      const pixels = renderWith(0.25, 0.25, 0.25, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_exposureRGB'), 2, 2, 2);
      });
      expectPixel(pixels, W, 0, 0, { r: 1.0, g: 1.0, b: 1.0, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('per-channel: R+1, G+0, B-1 on 0.5 gray', () => {
      setup();
      const pixels = renderWith(0.5, 0.5, 0.5, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_exposureRGB'), 1, 0, -1);
      });
      expectPixel(pixels, W, 0, 0, { r: 1.0, g: 0.5, b: 0.25, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Brightness ---

  describe('Brightness', () => {
    it('+0.1: 0.5 -> 0.6', () => {
      setup();
      const pixels = renderWith(0.5, 0.5, 0.5, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_brightness'), 0.1);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.6, g: 0.6, b: 0.6, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('-0.2: 0.5 -> 0.3', () => {
      setup();
      const pixels = renderWith(0.5, 0.5, 0.5, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_brightness'), -0.2);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.3, g: 0.3, b: 0.3, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Contrast ---

  describe('Contrast', () => {
    it('contrast 2.0 on 0.25: (0.25-0.5)*2+0.5 = 0.0', () => {
      setup();
      const pixels = renderWith(0.25, 0.25, 0.25, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_contrastRGB'), 2, 2, 2);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('contrast 2.0 on 0.75: (0.75-0.5)*2+0.5 = 1.0', () => {
      setup();
      const pixels = renderWith(0.75, 0.75, 0.75, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_contrastRGB'), 2, 2, 2);
      });
      expectPixel(pixels, W, 0, 0, { r: 1.0, g: 1.0, b: 1.0, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('contrast 0.5 on 0.8: (0.8-0.5)*0.5+0.5 = 0.65', () => {
      setup();
      const pixels = renderWith(0.8, 0.8, 0.8, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_contrastRGB'), 0.5, 0.5, 0.5);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.65, g: 0.65, b: 0.65, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('contrast 1.0 (identity): output matches input', () => {
      setup();
      const pixels = renderWith(0.3, 0.6, 0.9, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_contrastRGB'), 1, 1, 1);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.3, g: 0.6, b: 0.9, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Saturation ---

  describe('Saturation', () => {
    it('saturation 0.0: color -> grayscale (luma)', () => {
      setup();
      const r = 0.8,
        g = 0.2,
        b = 0.5;
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const pixels = renderWith(r, g, b, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_saturation'), 0);
      });
      expectPixel(pixels, W, 0, 0, { r: luma, g: luma, b: luma, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('saturation 1.0 (identity): output matches input', () => {
      setup();
      const pixels = renderWith(0.8, 0.2, 0.5, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_saturation'), 1);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.8, g: 0.2, b: 0.5, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('saturation 2.0: double saturation on colored input', () => {
      setup();
      const r = 0.6,
        g = 0.4,
        b = 0.2;
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      // mix(luma, color, 2.0) = luma + 2*(color - luma)
      const er = luma + 2 * (r - luma);
      const eg = luma + 2 * (g - luma);
      const eb = luma + 2 * (b - luma);
      const pixels = renderWith(r, g, b, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_saturation'), 2);
      });
      expectPixel(pixels, W, 0, 0, { r: er, g: eg, b: eb, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Scale/Offset ---

  describe('Scale and Offset', () => {
    it('scale 2.0: 0.3 -> 0.6', () => {
      setup();
      const pixels = renderWith(0.3, 0.3, 0.3, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_scaleRGB'), 2, 2, 2);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.6, g: 0.6, b: 0.6, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('offset +0.1: 0.3 -> 0.4', () => {
      setup();
      const pixels = renderWith(0.3, 0.3, 0.3, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_offsetRGB'), 0.1, 0.1, 0.1);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.4, g: 0.4, b: 0.4, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('scale + offset combined: 0.3*2 + 0.1 = 0.7', () => {
      setup();
      const pixels = renderWith(0.3, 0.3, 0.3, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_scaleRGB'), 2, 2, 2);
        gl.uniform3f(gl.getUniformLocation(prog, 'u_offsetRGB'), 0.1, 0.1, 0.1);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.7, g: 0.7, b: 0.7, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Temperature/Tint ---

  describe('Temperature and Tint', () => {
    it('temperature +50: shifts red up, blue down', () => {
      setup();
      // temp/100 * 0.1 = 0.05 shift
      const t = (50 / 100.0) * 0.1; // 0.05
      const pixels = renderWith(0.5, 0.5, 0.5, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_temperature'), 50);
      });
      expectPixel(pixels, W, 0, 0, { r: 0.5 + t, g: 0.5, b: 0.5 - t, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('tint +50: shifts green up, red/blue down slightly', () => {
      setup();
      const g_shift = (50 / 100.0) * 0.1; // +0.05
      const rb_shift = (50 / 100.0) * 0.05; // -0.025
      const pixels = renderWith(0.5, 0.5, 0.5, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_tint'), 50);
      });
      expectPixel(
        pixels,
        W,
        0,
        0,
        {
          r: 0.5 - rb_shift,
          g: 0.5 + g_shift,
          b: 0.5 - rb_shift,
          a: 1.0,
        },
        EPSILON.HDR_HALF,
      );
    });
  });
});
