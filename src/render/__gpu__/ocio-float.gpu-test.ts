/**
 * OCIO in the float pipeline (stage 7b') — real GLSL pixel accuracy.
 *
 * Drives viewer.frag.glsl with the OCIO float LUT from OCIOProcessor /
 * bakeOCIOLinearDisplayLUT and every other stage at identity:
 *   - the shader's shaper + 3D lookup matches the CPU reference
 *     (applyOCIOLUT3D) and the OCIO transform itself
 *   - HDR input above 1.0 reaches the transform unclamped
 *   - a PQ view on a PQ surface passes the view's signal through
 *     (the surface encode is the only encode)
 */
import { describe, it, afterEach, expect } from 'vitest';
import { createTestGL, compileShader, linkProgram, createFullscreenQuad } from './helpers/webgl2';
import { readPixelsGLFloat } from './helpers/pixels';
import { createSolidTexture } from './helpers/textures';
import { setupIdentityPipeline } from './helpers/pipeline';
import { applyOCIOLUT3D, linearToPQ } from '../__tests__/shaderMathReference';
import { INPUT_TRANSFER_SRGB, OUTPUT_ENCODING_DISPLAY, OUTPUT_ENCODING_PQ } from '../../config/RenderConfig';
import { COLOR_PRIMARIES_MATRICES } from '../ShaderConstants';
import { OCIOProcessor } from '../../color/OCIOProcessor';
import { bakeOCIOLinearDisplayLUT, shaperScale, type OCIOLinearDisplayLUT } from '../../color/OCIODisplayLUT';
import { pqEncode } from '../../color/TransferFunctions';
import { srgbEncode, type RGB } from '../../color/OCIOTransform';

import viewerVertSrc from '../shaders/viewer.vert.glsl?raw';
import viewerFragSrc from '../shaders/viewer.frag.glsl?raw';

const W = 1,
  H = 1;
const OCIO_UNIT = 8;

function toRGBA(bake: OCIOLinearDisplayLUT): Float32Array {
  const n = bake.lut.size ** 3;
  const rgba = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = bake.lut.data[i * 3]!;
    rgba[i * 4 + 1] = bake.lut.data[i * 3 + 1]!;
    rgba[i * 4 + 2] = bake.lut.data[i * 3 + 2]!;
    rgba[i * 4 + 3] = 1;
  }
  return rgba;
}

describe('OCIO float stage (real GPU)', () => {
  let gl: WebGL2RenderingContext;
  let program: WebGLProgram;
  let quad: ReturnType<typeof createFullscreenQuad>;
  let fbo: WebGLFramebuffer;
  let fboTex: WebGLTexture;
  let lutTex: WebGLTexture | null = null;

  function setup() {
    ({ gl } = createTestGL(W, H));
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  afterEach(() => {
    quad?.dispose();
    if (lutTex) gl?.deleteTexture(lutTex);
    lutTex = null;
    gl?.deleteFramebuffer(fbo);
    gl?.deleteTexture(fboTex);
    if (program) gl?.deleteProgram(program);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });

  /** Upload the bake exactly like Renderer.ensureOCIOLUT3DTexture (RGBA32F, linear). */
  function uploadOCIOLUT(bake: OCIOLinearDisplayLUT) {
    const size = bake.lut.size;
    lutTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + OCIO_UNIT);
    gl.bindTexture(gl.TEXTURE_3D, lutTex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA32F, size, size, size, 0, gl.RGBA, gl.FLOAT, toRGBA(bake));
    gl.activeTexture(gl.TEXTURE0);
  }

  function render(
    rgb: RGB,
    bake: OCIOLinearDisplayLUT,
    opts: { outputEncoding: number; displayTransfer?: number; outputPrimaries?: Float32Array },
  ): Float32Array {
    setupIdentityPipeline(gl, program);
    uploadOCIOLUT(bake);
    gl.uniform1i(gl.getUniformLocation(program, 'u_ocioLUT3D'), OCIO_UNIT);
    gl.uniform1i(gl.getUniformLocation(program, 'u_ocioLUT3DEnabled'), 1);
    gl.uniform1f(gl.getUniformLocation(program, 'u_ocioLUT3DSize'), bake.lut.size);
    gl.uniform2f(gl.getUniformLocation(program, 'u_ocioShaper'), bake.shaper.epsilon, shaperScale(bake.shaper));
    gl.uniform1i(gl.getUniformLocation(program, 'u_inputTransfer'), INPUT_TRANSFER_SRGB);
    gl.uniform1i(gl.getUniformLocation(program, 'u_outputEncoding'), opts.outputEncoding);
    gl.uniform1i(gl.getUniformLocation(program, 'u_displayTransfer'), opts.displayTransfer ?? 0);
    if (opts.outputPrimaries) {
      gl.uniform1i(gl.getUniformLocation(program, 'u_outputPrimariesEnabled'), 1);
      gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_outputPrimariesMatrix'), false, opts.outputPrimaries);
    }
    const { texture, dispose } = createSolidTexture(gl, rgb[0], rgb[1], rgb[2], 1.0, 'float32');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    quad.draw();
    const px = readPixelsGLFloat(gl, fbo, W, H);
    dispose();
    return px;
  }

  it('matches the CPU reference and the OCIO transform for SDR and HDR input', () => {
    setup();
    const processor = new OCIOProcessor();
    processor.setState({ enabled: true, inputColorSpace: 'Linear sRGB', display: 'sRGB' });
    const bake = processor.bakeLinearDisplayLUT(33);
    const rgba = toRGBA(bake);
    const shaper: [number, number] = [bake.shaper.epsilon, shaperScale(bake.shaper)];

    let previous = -1;
    for (const v of [0.02, 0.18, 1, 4, 16]) {
      const rgb: RGB = [v, v * 0.5, v * 0.25];
      // Linear display output (u_displayTransfer 0) against the CPU port
      const lin = render(rgb, bake, { outputEncoding: OUTPUT_ENCODING_DISPLAY });
      const ref = applyOCIOLUT3D(rgb[0], rgb[1], rgb[2], rgba, bake.lut.size, shaper);
      for (let c = 0; c < 3; c++) expect(lin[c]).toBeCloseTo(ref[c]!, 3);
      // With the sRGB display transfer the result is the OCIO view signal
      const signal = render(rgb, bake, { outputEncoding: OUTPUT_ENCODING_DISPLAY, displayTransfer: 1 });
      const expected = processor.transformColor(rgb[0], rgb[1], rgb[2]);
      expect(Math.abs(signal[0]! - expected[0])).toBeLessThan(0.01);
      expect(srgbEncode(ref[0])).toBeCloseTo(signal[0]!, 3);
      // HDR input is not clamped before OCIO: brighter input, brighter output
      expect(lin[0]!).toBeGreaterThan(previous);
      previous = lin[0]!;
    }
  });

  it('a PQ view on a PQ surface passes the view signal through', () => {
    setup();
    // Synthetic PQ view (the built-in configs ship none): scene 1.0 = 203 cd/m².
    const k = 203 / 10000;
    const view = {
      splitLinearCore: () => ({
        inputDecode: null,
        outputEncode: 'pq' as const,
        core: { apply: (r: number, g: number, b: number): RGB => [r * k, g * k, b * k] },
      }),
    };
    const bake = bakeOCIOLinearDisplayLUT(view, 'Rec.2100-PQ', 33);
    for (const v of [0.18, 1, 4.9]) {
      const rgb: RGB = [v, v, v];
      const px = render(rgb, bake, {
        outputEncoding: OUTPUT_ENCODING_PQ,
        outputPrimaries: COLOR_PRIMARIES_MATRICES.SRGB_TO_REC2020,
      });
      const viewSignal = pqEncode(v * k);
      expect(px[0]).toBeCloseTo(viewSignal, 2);
      expect(px[1]).toBeCloseTo(linearToPQ(v), 2);
    }
  });
});
