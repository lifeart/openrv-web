/**
 * Phase 4 — Single-Stage Pixel Accuracy: Compositing shader tests.
 *
 * Tests the compositing.frag.glsl shader for blend modes (Over, Replace,
 * Add, Difference), premultiplied alpha, opacity, and stencil clipping.
 * Uses the passthrough.vert.glsl + compositing.frag.glsl pair.
 */
import { describe, it, afterEach } from 'vitest';
import { createTestGL, compileShader, linkProgram, createFullscreenQuad } from './helpers/webgl2';
import { readPixelsGLFloat, expectPixel } from './helpers/pixels';
import { EPSILON } from './helpers/tolerance';

import passthroughVertSrc from '../shaders/passthrough.vert.glsl?raw';
import compositingFragSrc from '../shaders/compositing.frag.glsl?raw';

const W = 1, H = 1;

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

function createFloat4Texture(gl: WebGL2RenderingContext, r: number, g: number, b: number, a: number) {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT,
    new Float32Array([r, g, b, a]));
  return { texture, dispose: () => gl.deleteTexture(texture) };
}

describe('Compositing Shader — Pixel Accuracy (real GPU)', () => {
  let gl: WebGL2RenderingContext;
  let program: WebGLProgram;
  let quad: ReturnType<typeof createFullscreenQuad>;
  let fbo: ReturnType<typeof createFloatFBO>;

  function setup() {
    ({ gl } = createTestGL(W, H));
    gl.getExtension('EXT_color_buffer_float');
    const vert = compileShader(gl, gl.VERTEX_SHADER, passthroughVertSrc);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, compositingFragSrc);
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
   * Renders the compositing shader with base and layer textures,
   * returns float pixels from FBO.
   */
  function renderComposite(
    base: [number, number, number, number],
    layer: [number, number, number, number],
    opts: {
      mode?: number;     // 0=Over, 1=Replace, 2=Add, 3=Difference
      opacity?: number;
      premultiplied?: boolean;
      stencilEnabled?: boolean;
      stencilBox?: [number, number, number, number];
    } = {},
  ): Float32Array {
    gl.useProgram(program);

    const baseTex = createFloat4Texture(gl, ...base);
    const layerTex = createFloat4Texture(gl, ...layer);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, baseTex.texture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_baseTexture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, layerTex.texture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_layerTexture'), 1);

    gl.uniform1i(gl.getUniformLocation(program, 'u_compositeMode'), opts.mode ?? 0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), opts.opacity ?? 1.0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_premultiplied'), (opts.premultiplied ?? false) ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_stencilEnabled'), (opts.stencilEnabled ?? false) ? 1 : 0);
    gl.uniform4f(gl.getUniformLocation(program, 'u_stencilBox'),
      ...(opts.stencilBox ?? [0, 1, 0, 1]) as [number, number, number, number]);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
    gl.viewport(0, 0, W, H);
    quad.draw();

    const pixels = readPixelsGLFloat(gl, fbo.fbo, W, H);
    baseTex.dispose();
    layerTex.dispose();
    return pixels;
  }

  // --- Replace mode ---

  describe('Replace mode (mode=1)', () => {
    it('replaces base with layer', () => {
      setup();
      const pixels = renderComposite(
        [0.2, 0.3, 0.4, 1.0],
        [0.8, 0.7, 0.6, 1.0],
        { mode: 1 },
      );
      expectPixel(pixels, W, 0, 0, { r: 0.8, g: 0.7, b: 0.6, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('respects layer opacity', () => {
      setup();
      const pixels = renderComposite(
        [0.2, 0.3, 0.4, 1.0],
        [0.8, 0.7, 0.6, 1.0],
        { mode: 1, opacity: 0.5 },
      );
      // Replace: output = (layer.rgb, layer.a * opacity)
      expectPixel(pixels, W, 0, 0, { r: 0.8, g: 0.7, b: 0.6, a: 0.5 }, EPSILON.HDR_HALF);
    });
  });

  // --- Over mode (straight alpha) ---

  describe('Over mode — straight alpha (mode=0)', () => {
    it('opaque layer fully covers base', () => {
      setup();
      const pixels = renderComposite(
        [0.2, 0.3, 0.4, 1.0],
        [0.8, 0.7, 0.6, 1.0],
        { mode: 0, premultiplied: false },
      );
      // layerAlpha = 1.0 * 1.0 = 1.0
      // outA = 1.0 + 1.0*(1-1.0) = 1.0
      // outRGB = (0.8*1.0 + 0.2*1.0*0.0) / 1.0 = 0.8
      expectPixel(pixels, W, 0, 0, { r: 0.8, g: 0.7, b: 0.6, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('50% transparent layer blends with base', () => {
      setup();
      const pixels = renderComposite(
        [0.0, 0.0, 0.0, 1.0],   // black base
        [1.0, 1.0, 1.0, 0.5],   // white semi-transparent layer
        { mode: 0, premultiplied: false },
      );
      // layerAlpha = 0.5 * 1.0 = 0.5
      // outA = 0.5 + 1.0*(1-0.5) = 1.0
      // outRGB = (1.0*0.5 + 0.0*1.0*0.5) / 1.0 = 0.5
      expectPixel(pixels, W, 0, 0, { r: 0.5, g: 0.5, b: 0.5, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('opacity modulates layer alpha', () => {
      setup();
      const pixels = renderComposite(
        [0.0, 0.0, 0.0, 1.0],
        [1.0, 1.0, 1.0, 1.0],
        { mode: 0, opacity: 0.5, premultiplied: false },
      );
      // layerAlpha = 1.0 * 0.5 = 0.5
      // outA = 0.5 + 1.0*(0.5) = 1.0
      // outRGB = (1.0*0.5 + 0.0*1.0*0.5) / 1.0 = 0.5
      expectPixel(pixels, W, 0, 0, { r: 0.5, g: 0.5, b: 0.5, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Over mode (premultiplied alpha) ---

  describe('Over mode — premultiplied alpha (mode=0)', () => {
    it('premultiplied composite: 50% white over black', () => {
      setup();
      // Premultiplied: rgb is pre-multiplied by alpha
      // Layer: white at alpha=0.5, premul: (0.5, 0.5, 0.5, 0.5)
      const pixels = renderComposite(
        [0.0, 0.0, 0.0, 1.0],
        [0.5, 0.5, 0.5, 0.5],   // premultiplied: color=1.0 * a=0.5
        { mode: 0, premultiplied: true },
      );
      // Unpremul layer: (1.0, 1.0, 1.0)
      // Unpremul base: (0.0, 0.0, 0.0)
      // Blend (Over): blended = layer = (1.0, 1.0, 1.0)
      // layerAlpha = 0.5 * 1.0 = 0.5
      // outA = 0.5 + 1.0*(1-0.5) = 1.0
      // outRGB = blended * layerAlpha + baseColor * base.a * (1 - layerAlpha)
      //        = 1.0 * 0.5 + 0.0 * 1.0 * 0.5 = 0.5
      expectPixel(pixels, W, 0, 0, { r: 0.5, g: 0.5, b: 0.5, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Add mode ---

  describe('Add mode (mode=2)', () => {
    it('adds base and layer colors', () => {
      setup();
      const pixels = renderComposite(
        [0.3, 0.2, 0.1, 1.0],
        [0.2, 0.3, 0.4, 1.0],
        { mode: 2, premultiplied: false },
      );
      // Blend: base + layer = (0.5, 0.5, 0.5)
      // layerAlpha = 1.0
      // outA = 1.0 + 1.0*(0.0) = 1.0
      // outRGB = (0.5*1.0 + 0.3*1.0*0.0) / 1.0 = 0.5
      expectPixel(pixels, W, 0, 0, { r: 0.5, g: 0.5, b: 0.5, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Difference mode ---

  describe('Difference mode (mode=3)', () => {
    it('computes absolute difference', () => {
      setup();
      const pixels = renderComposite(
        [0.8, 0.3, 0.5, 1.0],
        [0.3, 0.7, 0.5, 1.0],
        { mode: 3, premultiplied: false },
      );
      // Blend: abs(base - layer) = (0.5, 0.4, 0.0)
      // layerAlpha = 1.0
      // outA = 1.0 + 1.0*(0.0) = 1.0
      // outRGB = (diff*1.0 + base*1.0*0.0) / 1.0 = diff
      expectPixel(pixels, W, 0, 0, { r: 0.5, g: 0.4, b: 0.0, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });

  // --- Stencil clipping ---

  describe('Stencil clipping', () => {
    it('outside stencil: returns base unchanged', () => {
      setup();
      // Stencil box covers only a tiny region that does NOT include our pixel
      // Our 1x1 texture is sampled at UV (0.5, 0.5)
      const pixels = renderComposite(
        [0.1, 0.2, 0.3, 1.0],
        [0.9, 0.8, 0.7, 1.0],
        {
          mode: 0,
          stencilEnabled: true,
          // xMin=0.6, xMax=1.0, yMin=0.6, yMax=1.0: excludes center pixel
          stencilBox: [0.6, 1.0, 0.6, 1.0],
        },
      );
      // Outside stencil -> pass through base
      expectPixel(pixels, W, 0, 0, { r: 0.1, g: 0.2, b: 0.3, a: 1.0 }, EPSILON.HDR_HALF);
    });

    it('inside stencil: composites normally', () => {
      setup();
      const pixels = renderComposite(
        [0.1, 0.2, 0.3, 1.0],
        [0.9, 0.8, 0.7, 1.0],
        {
          mode: 1, // Replace
          stencilEnabled: true,
          // xMin=0.0, xMax=1.0, yMin=0.0, yMax=1.0: includes all pixels
          stencilBox: [0.0, 1.0, 0.0, 1.0],
        },
      );
      // Inside stencil + Replace -> layer
      expectPixel(pixels, W, 0, 0, { r: 0.9, g: 0.8, b: 0.7, a: 1.0 }, EPSILON.HDR_HALF);
    });
  });
});
