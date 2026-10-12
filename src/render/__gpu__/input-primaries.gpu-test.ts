/**
 * Input primaries conversion with a matrix derived from chromaticities
 * (ACES AP1, DCI-P3) — real GLSL, checked against the CPU matrix.
 */
import { describe, it, afterEach } from 'vitest';
import { createTestGL, compileShader, linkProgram, createFullscreenQuad } from './helpers/webgl2';
import { readPixelsGLFloat, expectPixel } from './helpers/pixels';
import { createSolidTexture } from './helpers/textures';
import { setupIdentityPipeline } from './helpers/pipeline';
import { INPUT_TRANSFER_SRGB, OUTPUT_ENCODING_LINEAR } from '../../config/RenderConfig';
import {
  CHROMATICITIES,
  chromaticitiesToBT709Matrix,
  getChromaticitiesShaderMatrix,
  type Chromaticities,
} from '../../color/ColorPrimariesMath';

import viewerVertSrc from '../shaders/viewer.vert.glsl?raw';
import viewerFragSrc from '../shaders/viewer.frag.glsl?raw';

const W = 1,
  H = 1;

describe('Input primaries from chromaticities (real GPU)', () => {
  let gl: WebGL2RenderingContext;
  let program: WebGLProgram;
  let quad: ReturnType<typeof createFullscreenQuad>;
  let fbo: WebGLFramebuffer;
  let fboTex: WebGLTexture;

  function setup() {
    ({ gl } = createTestGL(W, H));
    gl.getExtension('EXT_color_buffer_float');
    const vert = compileShader(gl, gl.VERTEX_SHADER, viewerVertSrc);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, viewerFragSrc);
    program = linkProgram(gl, vert, frag);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    quad = createFullscreenQuad(gl);
    fbo = gl.createFramebuffer()!;
    fboTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
  }

  afterEach(() => {
    quad?.dispose();
    gl?.deleteFramebuffer(fbo);
    gl?.deleteTexture(fboTex);
    if (program) gl?.deleteProgram(program);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });

  function render(rgb: [number, number, number], chroma: Chromaticities): Float32Array {
    setupIdentityPipeline(gl, program);
    gl.uniform1i(gl.getUniformLocation(program, 'u_inputTransfer'), INPUT_TRANSFER_SRGB);
    gl.uniform1i(gl.getUniformLocation(program, 'u_outputEncoding'), OUTPUT_ENCODING_LINEAR);
    gl.uniform1i(gl.getUniformLocation(program, 'u_inputPrimariesEnabled'), 1);
    gl.uniformMatrix3fv(
      gl.getUniformLocation(program, 'u_inputPrimariesMatrix'),
      false,
      getChromaticitiesShaderMatrix(chroma)!,
    );
    const { texture, dispose } = createSolidTexture(gl, rgb[0], rgb[1], rgb[2], 1.0, 'float32');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    quad.draw();
    const pixels = readPixelsGLFloat(gl, fbo, W, H);
    dispose();
    return pixels;
  }

  function expected(rgb: [number, number, number], chroma: Chromaticities) {
    const m = chromaticitiesToBT709Matrix(chroma)!;
    const row = (i: number) => m[i * 3]! * rgb[0] + m[i * 3 + 1]! * rgb[1] + m[i * 3 + 2]! * rgb[2];
    return { r: row(0), g: row(1), b: row(2), a: 1 };
  }

  it('ACEScg (AP1) → BT.709 matches the CPU matrix', () => {
    setup();
    const rgb: [number, number, number] = [0.5, 0.4, 0.3];
    expectPixel(render(rgb, CHROMATICITIES.acesAP1), W, 0, 0, expected(rgb, CHROMATICITIES.acesAP1), 1e-4);
  });

  it('DCI-P3 white (1, 1, 1) maps to BT.709 white (Bradford to D65)', () => {
    setup();
    expectPixel(render([1, 1, 1], CHROMATICITIES.dciP3), W, 0, 0, { r: 1, g: 1, b: 1, a: 1 }, 1e-4);
  });
});
