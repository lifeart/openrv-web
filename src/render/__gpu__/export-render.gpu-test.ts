/**
 * Still export through the real Renderer (real GLSL): the exported pixels
 * must equal what the viewer draws for the same frame and state.
 *
 * The "viewer" output is Renderer.renderImage()/renderSDRFrame() into an SDR
 * drawing buffer, read back as 8-bit; the export is
 * Renderer.renderFrameForExport() with the SDR display target, quantized to
 * 8-bit the same way the PNG/JPEG/WebP path does.
 */
import { describe, it, afterEach, expect } from 'vitest';
import { Renderer } from '../Renderer';
import { IPImage } from '../../core/image/Image';
import { DEFAULT_CAPABILITIES } from '../../color/DisplayCapabilities';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../../core/types/color';
import { DEFAULT_TONE_MAPPING_STATE } from '../../core/types/effects';
import { OUTPUT_ENCODING_DISPLAY, OUTPUT_ENCODING_LINEAR } from '../../config/RenderConfig';
import { floatFrameToRGBA8 } from '../../utils/export/GradedFrameExport';

const SRGB_DISPLAY_TRANSFER = 1;

let renderer: Renderer | null = null;

async function createRenderer(width: number, height: number): Promise<Renderer> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const r = new Renderer();
  r.initialize(canvas, DEFAULT_CAPABILITIES);
  await r.initAsync();
  // The test harness flag may give the drawing buffer an HDR color space;
  // the comparison is against the SDR viewer.
  r.setHDROutputMode('sdr', DEFAULT_CAPABILITIES);
  r.resize(width, height);
  renderer = r;
  return r;
}

function floatImage(width: number, height: number, rgb: (x: number, y: number) => [number, number, number]): IPImage {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgb(x, y);
      data.set([r, g, b, 1], (y * width + x) * 4);
    }
  }
  return new IPImage({ width, height, channels: 4, dataType: 'float32', data: data.buffer, metadata: {} });
}

/** The viewer's drawing buffer as RGBA8, rows top-to-bottom. */
function readViewerCanvas(r: Renderer, width: number, height: number): Uint8Array {
  const gl = r.getContext()!;
  const px = new Uint8Array(width * height * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const out = new Uint8Array(px.length);
  const row = width * 4;
  for (let y = 0; y < height; y++) out.set(px.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  return out;
}

function expectRGBClose(actual: Uint8ClampedArray, expected: Uint8Array, tolerance: number): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    if ((i & 3) === 3) continue; // the viewer's drawing buffer has no alpha
    expect(Math.abs(actual[i]! - expected[i]!), `channel ${i}`).toBeLessThanOrEqual(tolerance);
  }
}

describe('export render matches the viewer (real GPU)', () => {
  afterEach(() => {
    renderer?.dispose();
    renderer = null;
  });

  it('float image: grading, display transfer and SDR clamp match the viewer', async () => {
    const W = 4,
      H = 2;
    const r = await createRenderer(W, H);
    const image = floatImage(W, H, (x, y) => [0.05 + 0.2 * x, 0.3 * y + 0.1, x === 3 ? 2.5 : 0.18]);
    r.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 0.5, saturation: 1.2 });
    r.setDisplayColorState({
      transferFunction: SRGB_DISPLAY_TRANSFER,
      displayGamma: 1,
      displayBrightness: 1,
      customGamma: 2.2,
    });
    r.setColorPrimaries(undefined, 'srgb');

    r.clear(0, 0, 0, 1);
    r.renderImage(image, 0, 0, 1, 1);
    const viewer = readViewerCanvas(r, W, H);

    const exported = r.renderFrameForExport(image, W, H, {
      encoding: OUTPUT_ENCODING_DISPLAY,
      outputMode: 'sdr',
      outputColorSpace: 'srgb',
    });
    expect(exported).not.toBeNull();
    // SDR target: display-encoded and clamped to [0,1]
    for (let i = 0; i < exported!.length; i++) {
      expect(exported![i]).toBeGreaterThanOrEqual(0);
      expect(exported![i]).toBeLessThanOrEqual(1);
    }
    expectRGBClose(floatFrameToRGBA8({ data: exported!, width: W, height: H }), viewer, 1);
  });

  it('float image with tone mapping matches the SDR viewer (headroom 1)', async () => {
    const W = 2,
      H = 2;
    const r = await createRenderer(W, H);
    r.setHDRHeadroom(4);
    const image = floatImage(W, H, (x, y) => [4 * x + 0.5, 2 * y + 0.25, 0.8]);
    r.setToneMappingState({ ...DEFAULT_TONE_MAPPING_STATE, enabled: true, operator: 'aces' });
    r.setDisplayColorState({
      transferFunction: SRGB_DISPLAY_TRANSFER,
      displayGamma: 1,
      displayBrightness: 1,
      customGamma: 2.2,
    });

    r.clear(0, 0, 0, 1);
    r.renderImage(image, 0, 0, 1, 1);
    const viewer = readViewerCanvas(r, W, H);

    const exported = r.renderFrameForExport(image, W, H, {
      encoding: OUTPUT_ENCODING_DISPLAY,
      outputMode: 'sdr',
      outputColorSpace: 'srgb',
    });
    expectRGBClose(floatFrameToRGBA8({ data: exported!, width: W, height: H }), viewer, 1);

    // Sensitivity check: the HDR target (headroom 4, no clamp) differs from the SDR viewer.
    const hdr = r.renderFrameForExport(image, W, H, {
      encoding: OUTPUT_ENCODING_DISPLAY,
      outputMode: 'hdr',
      outputColorSpace: 'srgb',
    });
    const hdr8 = floatFrameToRGBA8({ data: hdr!, width: W, height: H });
    let maxDiff = 0;
    for (let i = 0; i < hdr8.length; i++) {
      if ((i & 3) !== 3) maxDiff = Math.max(maxDiff, Math.abs(hdr8[i]! - viewer[i]!));
    }
    expect(maxDiff).toBeGreaterThan(5);
  });

  it('rotation: a 90° export of a 4x2 image is 2x4 and matches the rotated viewer', async () => {
    const r = await createRenderer(2, 4);
    const image = floatImage(4, 2, (x, y) => [x / 3, y, 0.5]);
    r.setDisplayColorState({ transferFunction: 0, displayGamma: 1, displayBrightness: 1, customGamma: 2.2 });
    r.setUserTransform(90, false, false);

    r.clear(0, 0, 0, 1);
    r.renderImage(image, 0, 0, 1, 1);
    const viewer = readViewerCanvas(r, 2, 4);

    const exported = r.renderFrameForExport(image, 2, 4, {
      encoding: OUTPUT_ENCODING_DISPLAY,
      outputMode: 'sdr',
      outputColorSpace: 'srgb',
    });
    expectRGBClose(floatFrameToRGBA8({ data: exported!, width: 2, height: 4 }), viewer, 1);
  });

  it('SDR element: matches renderSDRFrame with grading applied', async () => {
    const W = 4,
      H = 2;
    const r = await createRenderer(W, H);
    const src = document.createElement('canvas');
    src.width = W;
    src.height = H;
    const ctx = src.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) img.data.set([30 * i + 10, 200 - 20 * i, 128, 255], i * 4);
    ctx.putImageData(img, 0, 0);
    r.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, contrast: 1.3, brightness: 0.05 });
    r.setColorPrimaries(undefined, 'srgb');

    r.clear(0, 0, 0, 1);
    r.renderSDRFrame(src);
    const viewer = readViewerCanvas(r, W, H);

    const exported = r.renderFrameForExport(src, W, H, {
      encoding: OUTPUT_ENCODING_DISPLAY,
      outputMode: 'sdr',
      outputColorSpace: 'srgb',
    });
    expect(exported).not.toBeNull();
    expectRGBClose(floatFrameToRGBA8({ data: exported!, width: W, height: H }), viewer, 1);
  });

  it('VideoFrame-backed image (HDR video path) exports its pixels', async () => {
    const W = 4,
      H = 2;
    const r = await createRenderer(W, H);
    const src = document.createElement('canvas');
    src.width = W;
    src.height = H;
    const ctx = src.getContext('2d')!;
    ctx.fillStyle = 'rgb(255, 128, 0)';
    ctx.fillRect(0, 0, W, H);
    const frame = new VideoFrame(src, { timestamp: 0 });
    const image = new IPImage({
      width: W,
      height: H,
      channels: 4,
      dataType: 'float32',
      data: new ArrayBuffer(4),
      videoFrame: frame,
      metadata: {},
    });
    r.setDisplayColorState({ transferFunction: 0, displayGamma: 1, displayBrightness: 1, customGamma: 2.2 });
    try {
      r.clear(0, 0, 0, 1);
      r.renderImage(image, 0, 0, 1, 1);
      const viewer = readViewerCanvas(r, W, H);
      const exported = r.renderFrameForExport(image, W, H, {
        encoding: OUTPUT_ENCODING_DISPLAY,
        outputMode: 'sdr',
        outputColorSpace: 'srgb',
      });
      expect(exported).not.toBeNull();
      const rgba8 = floatFrameToRGBA8({ data: exported!, width: W, height: H });
      expect(rgba8[0]).toBeGreaterThan(200); // not an empty export
      expectRGBClose(rgba8, viewer, 1);
    } finally {
      image.close();
    }
  });

  it('scene-linear target keeps values above 1.0 (EXR path)', async () => {
    const r = await createRenderer(1, 1);
    const image = floatImage(1, 1, () => [3, 0.5, 0.18]);
    r.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 1 });
    // The display transfer must not apply to a linear target.
    r.setDisplayColorState({
      transferFunction: SRGB_DISPLAY_TRANSFER,
      displayGamma: 1,
      displayBrightness: 1,
      customGamma: 2.2,
    });

    const exported = r.renderFrameForExport(image, 1, 1, {
      encoding: OUTPUT_ENCODING_LINEAR,
      outputMode: 'hdr',
      outputColorSpace: 'srgb',
    });
    expect(exported).not.toBeNull();
    // Half-float render target: ~3 significant digits.
    expect(exported![0]).toBeCloseTo(6, 1);
    expect(exported![1]).toBeCloseTo(1, 2);
    expect(exported![2]).toBeCloseTo(0.36, 2);
    expect(exported![3]).toBeCloseTo(1, 3);
  });

  it('does not disturb the drawing buffer or the HDR output mode', async () => {
    const r = await createRenderer(2, 2);
    const image = floatImage(2, 2, () => [0.25, 0.5, 0.75]);
    r.setDisplayColorState({ transferFunction: 0, displayGamma: 1, displayBrightness: 1, customGamma: 2.2 });
    r.clear(0, 0, 0, 1);
    r.renderImage(image, 0, 0, 1, 1);
    const before = readViewerCanvas(r, 2, 2);

    const other = floatImage(2, 2, () => [1, 0, 0]);
    r.renderFrameForExport(other, 2, 2, {
      encoding: OUTPUT_ENCODING_LINEAR,
      outputMode: 'hdr',
      outputColorSpace: 'srgb',
    });

    expect(readViewerCanvas(r, 2, 2)).toEqual(before);
    expect(r.getHDROutputMode()).toBe('sdr');
  });
});
