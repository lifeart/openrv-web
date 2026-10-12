/**
 * SDR frames on rec2100 drawing buffers — real Renderer, real GLSL.
 *
 * An 8-bit SDR source (sRGB, BT.709) rendered while the drawing buffer is
 * rec2100-hlg / rec2100-pq must reach the buffer as an HLG / PQ signal with
 * SDR reference white 1.0 = 203 cd/m²: sRGB white encodes to HLG 0.75 and
 * PQ ≈ 0.5807, not to 1.0 (which would be the HLG/PQ peak).
 *
 * SwiftShader has no rec2100 drawing buffers, so the test lets the GL context
 * accept the colour-space assignment (and keeps an RGBA8 buffer) to put the
 * Renderer into HLG/PQ mode; everything after that is the production path.
 */
import { describe, it, afterEach, expect } from 'vitest';
import { Renderer } from '../Renderer';
import { DEFAULT_CAPABILITIES, type DisplayCapabilities } from '../../color/DisplayCapabilities';
import { linearToHLG, linearToPQ, srgbEOTF } from '../__tests__/shaderMathReference';

const CAPS: DisplayCapabilities = {
  ...DEFAULT_CAPABILITIES,
  webglHLG: true,
  webglPQ: true,
  displayHDR: true,
};

// One 8-bit code value plus GPU transcendental slack.
const TOL = 1.5 / 255;

// BT.709 -> BT.2020 (ShaderConstants SRGB_TO_REC2020, row-major)
const M709_TO_2020 = [
  [0.6274, 0.3293, 0.0433],
  [0.0691, 0.9195, 0.0114],
  [0.0164, 0.088, 0.8956],
];

function makeSource(css: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  return c;
}

describe('renderSDRFrame on rec2100 drawing buffers (real GPU)', () => {
  let renderer: Renderer | null = null;

  afterEach(() => {
    renderer?.dispose();
    renderer = null;
  });

  async function setup(mode: 'hlg' | 'pq'): Promise<WebGL2RenderingContext> {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    renderer = new Renderer();
    renderer.initialize(canvas, CAPS);
    await renderer.initAsync();
    const gl = canvas.getContext('webgl2')!;

    // Let the context accept rec2100 colour spaces; keep the RGBA8 buffer so
    // the result can be read back as bytes.
    let colorSpace: string = gl.drawingBufferColorSpace;
    Object.defineProperty(gl, 'drawingBufferColorSpace', {
      configurable: true,
      get: () => colorSpace,
      set: (v: string) => {
        colorSpace = v;
      },
    });
    Object.defineProperty(gl, 'drawingBufferStorage', { configurable: true, value: undefined });

    expect(renderer.setHDROutputMode(mode, CAPS)).toBe(true);
    expect(renderer.getOutputColorSpace()).toBe('rec2020');
    return gl;
  }

  function renderAndRead(gl: WebGL2RenderingContext, css: string): [number, number, number] {
    renderer!.resize(1, 1);
    renderer!.clear(0, 0, 0, 1);
    expect(renderer!.renderSDRFrame(makeSource(css))).not.toBeNull();
    const px = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return [px[0]! / 255, px[1]! / 255, px[2]! / 255];
  }

  it('sRGB white encodes to HLG reference white 0.75', async () => {
    const gl = await setup('hlg');
    const [r, g, b] = renderAndRead(gl, '#ffffff');
    const [e] = linearToHLG(1, 1, 1);
    expect(e).toBeCloseTo(0.75, 2);
    expect(r).toBeCloseTo(e, 1);
    expect(Math.abs(r - e)).toBeLessThan(TOL);
    expect(Math.abs(g - e)).toBeLessThan(TOL);
    expect(Math.abs(b - e)).toBeLessThan(TOL);
  });

  it('sRGB white encodes to PQ 203 cd/m² (≈ 0.5807)', async () => {
    const gl = await setup('pq');
    const [r, g, b] = renderAndRead(gl, '#ffffff');
    const e = linearToPQ(1);
    expect(e).toBeCloseTo(0.5807, 3);
    expect(Math.abs(r - e)).toBeLessThan(TOL);
    expect(Math.abs(g - e)).toBeLessThan(TOL);
    expect(Math.abs(b - e)).toBeLessThan(TOL);
  });

  it('sRGB red is converted to BT.2020 primaries before PQ encoding', async () => {
    const gl = await setup('pq');
    const [r, g, b] = renderAndRead(gl, '#ff0000');
    // Linear BT.709 red (1,0,0) in BT.2020 is the first column of the matrix.
    const lin = [M709_TO_2020[0]![0]!, M709_TO_2020[1]![0]!, M709_TO_2020[2]![0]!];
    expect(Math.abs(r - linearToPQ(lin[0]!))).toBeLessThan(TOL);
    expect(Math.abs(g - linearToPQ(lin[1]!))).toBeLessThan(TOL);
    expect(Math.abs(b - linearToPQ(lin[2]!))).toBeLessThan(TOL);
    // Not the sRGB values written straight into the buffer.
    expect(g).toBeGreaterThan(0.1);
  });

  it('sRGB mid-grey is decoded with the sRGB curve before HLG encoding', async () => {
    const gl = await setup('hlg');
    const [r] = renderAndRead(gl, 'rgb(128,128,128)');
    const lin = srgbEOTF(128 / 255);
    const [e] = linearToHLG(lin, lin, lin);
    expect(Math.abs(r - e)).toBeLessThan(TOL);
  });
});
