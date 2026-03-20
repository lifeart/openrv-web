/**
 * Phase 5 — Full Pipeline Integration: Passthrough and multi-stage tests.
 *
 * Uses the full viewer.vert + viewer.frag shader pair driven directly
 * (not via the Renderer class) to verify end-to-end pipeline behavior
 * with multiple stages active simultaneously. This exercises the actual
 * shader code path that the Renderer uses, including stage ordering.
 */
import { describe, it, afterEach } from 'vitest';
import { createTestGL, compileShader, linkProgram, createFullscreenQuad } from './helpers/webgl2';
import { readPixelsGL, readPixelsGLFloat, expectPixel } from './helpers/pixels';
import { createSolidTexture } from './helpers/textures';
import { EPSILON } from './helpers/tolerance';
import { setupIdentityPipeline as setupIdentityPipelineBase } from './helpers/pipeline';

import viewerVertSrc from '../shaders/viewer.vert.glsl?raw';
import viewerFragSrc from '../shaders/viewer.frag.glsl?raw';

const W = 4,
  H = 4;

/**
 * Wraps the shared identity pipeline with overrides specific to this test file:
 * SDR clamp output mode and correct resolution/texelSize for the 4x4 canvas.
 */
function setupIdentityPipeline(gl: WebGL2RenderingContext, program: WebGLProgram) {
  setupIdentityPipelineBase(gl, program);
  gl.uniform1i(gl.getUniformLocation(program, 'u_outputMode'), 0); // SDR clamp
  gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), W, H);
  gl.uniform2f(gl.getUniformLocation(program, 'u_texelSize'), 1.0 / W, 1.0 / H);
}

describe('Full Pipeline Integration (real GPU)', () => {
  let gl: WebGL2RenderingContext;
  let program: WebGLProgram;
  let quad: ReturnType<typeof createFullscreenQuad>;

  function setup() {
    ({ gl } = createTestGL(W, H));
    const vert = compileShader(gl, gl.VERTEX_SHADER, viewerVertSrc);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, viewerFragSrc);
    program = linkProgram(gl, vert, frag);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    quad = createFullscreenQuad(gl);
  }

  afterEach(() => {
    quad?.dispose();
    if (program) gl?.deleteProgram(program);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });

  function renderToCanvas(
    inputR: number,
    inputG: number,
    inputB: number,
    inputA: number,
    setUniforms?: (gl: WebGL2RenderingContext, program: WebGLProgram) => void,
  ): Uint8Array {
    setupIdentityPipeline(gl, program);
    if (setUniforms) setUniforms(gl, program);

    const { texture, dispose: disposeTex } = createSolidTexture(gl, inputR, inputG, inputB, inputA, 'float32');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    quad.draw();

    const pixels = readPixelsGL(gl);
    disposeTex();
    return pixels;
  }

  // --- Passthrough tests ---

  describe('Passthrough (all stages identity)', () => {
    it('solid red input -> solid red output (uint8)', () => {
      setup();
      const pixels = renderToCanvas(1, 0, 0, 1);
      expectPixel(pixels, W, 0, 0, { r: 255, g: 0, b: 0, a: 255 }, EPSILON.SDR_INT_RELAXED);
    });

    it('solid green input -> solid green output', () => {
      setup();
      const pixels = renderToCanvas(0, 1, 0, 1);
      expectPixel(pixels, W, 0, 0, { r: 0, g: 255, b: 0, a: 255 }, EPSILON.SDR_INT_RELAXED);
    });

    it('solid blue input -> solid blue output', () => {
      setup();
      const pixels = renderToCanvas(0, 0, 1, 1);
      expectPixel(pixels, W, 0, 0, { r: 0, g: 0, b: 255, a: 255 }, EPSILON.SDR_INT_RELAXED);
    });

    it('mid-gray 0.5 -> ~128', () => {
      setup();
      const pixels = renderToCanvas(0.5, 0.5, 0.5, 1);
      expectPixel(pixels, W, 0, 0, { r: 128, g: 128, b: 128, a: 255 }, EPSILON.SDR_INT_RELAXED);
    });

    it('black input -> black output', () => {
      setup();
      const pixels = renderToCanvas(0, 0, 0, 1);
      expectPixel(pixels, W, 0, 0, { r: 0, g: 0, b: 0, a: 255 }, EPSILON.SDR_INT);
    });

    it('white input -> white output', () => {
      setup();
      const pixels = renderToCanvas(1, 1, 1, 1);
      expectPixel(pixels, W, 0, 0, { r: 255, g: 255, b: 255, a: 255 }, EPSILON.SDR_INT);
    });

    it('all 4x4 pixels are identical for solid input', () => {
      setup();
      const pixels = renderToCanvas(0.6, 0.3, 0.1, 1);
      const p0r = pixels[0]!,
        p0g = pixels[1]!,
        p0b = pixels[2]!;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          expectPixel(pixels, W, x, y, { r: p0r, g: p0g, b: p0b, a: 255 }, EPSILON.SDR_INT);
        }
      }
    });
  });

  // --- Multi-stage tests ---

  describe('Multi-stage combinations', () => {
    it('exposure +1 then invert: 0.25 -> 0.5 -> 0.5 (1-0.5)', () => {
      setup();
      const pixels = renderToCanvas(0.25, 0.25, 0.25, 1, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_exposureRGB'), 1, 1, 1);
        gl.uniform1i(gl.getUniformLocation(prog, 'u_invert'), 1);
      });
      // 0.25 * 2^1 = 0.5; invert: 1 - 0.5 = 0.5; SDR clamp; -> 128
      expectPixel(pixels, W, 0, 0, { r: 128, g: 128, b: 128, a: 255 }, EPSILON.SDR_INT_RELAXED);
    });

    it('brightness + contrast: push away from mid then offset', () => {
      setup();
      // Input 0.5, brightness +0.1 -> 0.6
      // contrast 2.0: (0.6 - 0.5)*2 + 0.5 = 0.7
      // SDR clamp -> 0.7
      const pixels = renderToCanvas(0.5, 0.5, 0.5, 1, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_brightness'), 0.1);
        gl.uniform3f(gl.getUniformLocation(prog, 'u_contrastRGB'), 2, 2, 2);
      });
      const expected = Math.round(0.7 * 255);
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 255 }, EPSILON.SDR_INT_RELAXED);
    });

    it('exposure + sRGB display transfer: 0.5 -> 1.0 -> sRGB(1.0) = 1.0', () => {
      setup();
      const pixels = renderToCanvas(0.5, 0.5, 0.5, 1, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_exposureRGB'), 1, 1, 1);
        gl.uniform1i(gl.getUniformLocation(prog, 'u_displayTransfer'), 1);
      });
      expectPixel(pixels, W, 0, 0, { r: 255, g: 255, b: 255, a: 255 }, EPSILON.SDR_INT_RELAXED);
    });

    it('saturation 0 + invert: grayscale then invert', () => {
      setup();
      const r = 0.8,
        g = 0.2,
        b = 0.5;
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const inverted = 1 - luma;
      const expected = Math.round(Math.min(Math.max(inverted, 0), 1) * 255);
      const pixels = renderToCanvas(r, g, b, 1, (gl, prog) => {
        gl.uniform1f(gl.getUniformLocation(prog, 'u_saturation'), 0);
        gl.uniform1i(gl.getUniformLocation(prog, 'u_invert'), 1);
      });
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 255 }, EPSILON.SDR_INT_RELAXED);
    });
  });

  // --- Channel isolation ---

  describe('Channel isolation', () => {
    it('red channel only (mode=1): shows red as grayscale', () => {
      setup();
      const pixels = renderToCanvas(0.8, 0.3, 0.5, 1, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_channelMode'), 1);
      });
      const expected = Math.round(0.8 * 255);
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 255 }, EPSILON.SDR_INT_RELAXED);
    });

    it('green channel only (mode=2)', () => {
      setup();
      const pixels = renderToCanvas(0.8, 0.3, 0.5, 1, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_channelMode'), 2);
      });
      const expected = Math.round(0.3 * 255);
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 255 }, EPSILON.SDR_INT_RELAXED);
    });

    it('blue channel only (mode=3)', () => {
      setup();
      const pixels = renderToCanvas(0.8, 0.3, 0.5, 1, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_channelMode'), 3);
      });
      const expected = Math.round(0.5 * 255);
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 255 }, EPSILON.SDR_INT_RELAXED);
    });

    it('luminance mode (mode=5)', () => {
      setup();
      const r = 0.8,
        g = 0.3,
        b = 0.5;
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const expected = Math.round(luma * 255);
      const pixels = renderToCanvas(r, g, b, 1, (gl, prog) => {
        gl.uniform1i(gl.getUniformLocation(prog, 'u_channelMode'), 5);
      });
      expectPixel(pixels, W, 0, 0, { r: expected, g: expected, b: expected, a: 255 }, EPSILON.SDR_INT_RELAXED);
    });
  });

  // --- Premultiply / Unpremultiply ---

  describe('Premultiply alpha', () => {
    it('premultiply (u_premult=1): RGB multiplied by alpha', () => {
      setup();
      gl.getExtension('EXT_color_buffer_float');
      const fboObj = (() => {
        const f = gl.createFramebuffer()!;
        const t = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        return {
          fbo: f,
          dispose: () => {
            gl.deleteFramebuffer(f);
            gl.deleteTexture(t);
          },
        };
      })();

      setupIdentityPipeline(gl, program);
      gl.uniform1i(gl.getUniformLocation(program, 'u_outputMode'), 1); // HDR to avoid clamp
      gl.uniform1i(gl.getUniformLocation(program, 'u_premult'), 1);

      const { texture, dispose: disposeTex } = createSolidTexture(gl, 0.8, 0.6, 0.4, 0.5, 'float32');
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fboObj.fbo);
      gl.viewport(0, 0, W, H);
      quad.draw();

      const pixels = readPixelsGLFloat(gl, fboObj.fbo, W, H);
      // 0.8*0.5=0.4, 0.6*0.5=0.3, 0.4*0.5=0.2
      expectPixel(pixels, W, 0, 0, { r: 0.4, g: 0.3, b: 0.2, a: 0.5 }, EPSILON.HDR_HALF);

      disposeTex();
      fboObj.dispose();
    });
  });

  // --- SDR clamp ---

  describe('SDR output clamp', () => {
    it('over-bright values clamped in SDR mode', () => {
      setup();
      // Exposure +2 on 0.5 -> 0.5*4 = 2.0; SDR clamp -> 1.0 -> 255
      const pixels = renderToCanvas(0.5, 0.5, 0.5, 1, (gl, prog) => {
        gl.uniform3f(gl.getUniformLocation(prog, 'u_exposureRGB'), 2, 2, 2);
      });
      expectPixel(pixels, W, 0, 0, { r: 255, g: 255, b: 255, a: 255 }, EPSILON.SDR_INT);
    });
  });
});
