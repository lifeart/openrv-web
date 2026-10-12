/**
 * Luminance/chroma (Y, RY, BY) EXR images built in memory: full-resolution
 * and 2x2-subsampled chroma, Y-only grey, scanline and tiled, with Rec.709
 * and non-Rec.709 chromaticities (OpenEXR RgbaYca conventions).
 */
import { describe, it, expect } from 'vitest';
import { decodeEXR, exrToIPImage, computeLuminanceWeights } from './EXRDecoder';

interface TestChannel {
  name: string;
  sampling?: number;
  value: (x: number, y: number) => number;
}

const FLOAT = 2;

/** Minimal uncompressed FLOAT EXR writer (scanline, or single-level tiled). */
function buildEXR(opts: {
  width: number;
  height: number;
  channels: TestChannel[];
  chromaticities?: number[];
  tileSize?: number;
}): ArrayBuffer {
  const { width, height, tileSize } = opts;
  const channels = [...opts.channels].sort((a, b) => (a.name < b.name ? -1 : 1));
  const bytes: number[] = [];
  const u8 = (v: number) => bytes.push(v & 0xff);
  const i32 = (v: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v, true);
    bytes.push(...b);
  };
  const f32 = (v: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, true);
    bytes.push(...b);
  };
  const str = (s: string) => {
    for (const c of s) u8(c.charCodeAt(0));
    u8(0);
  };
  const attr = (name: string, type: string, size: number, write: () => void) => {
    str(name);
    str(type);
    i32(size);
    write();
  };

  i32(20000630);
  i32(2 | (tileSize ? 0x200 : 0));
  attr(
    'channels',
    'chlist',
    channels.reduce((n, c) => n + c.name.length + 1 + 16, 1),
    () => {
      for (const c of channels) {
        str(c.name);
        i32(FLOAT);
        u8(0);
        u8(0);
        u8(0);
        u8(0);
        i32(c.sampling ?? 1);
        i32(c.sampling ?? 1);
      }
      u8(0);
    },
  );
  attr('compression', 'compression', 1, () => u8(0));
  for (const name of ['dataWindow', 'displayWindow']) {
    attr(name, 'box2i', 16, () => {
      i32(0);
      i32(0);
      i32(width - 1);
      i32(height - 1);
    });
  }
  attr('lineOrder', 'lineOrder', 1, () => u8(0));
  attr('pixelAspectRatio', 'float', 4, () => f32(1));
  if (opts.chromaticities) {
    const c = opts.chromaticities;
    attr('chromaticities', 'chromaticities', 32, () => c.forEach(f32));
  }
  if (tileSize) {
    attr('tiles', 'tiledesc', 9, () => {
      i32(tileSize);
      i32(tileSize);
      u8(0);
    });
  }
  u8(0);

  // Chunks: [coords..., data]
  const chunks: { coords: number[]; data: number[] }[] = [];
  if (tileSize) {
    for (let ty = 0; ty * tileSize < height; ty++) {
      for (let tx = 0; tx * tileSize < width; tx++) {
        const data: number[] = [];
        for (let y = ty * tileSize; y < Math.min(height, (ty + 1) * tileSize); y++) {
          for (const c of channels) {
            for (let x = tx * tileSize; x < Math.min(width, (tx + 1) * tileSize); x++) data.push(c.value(x, y));
          }
        }
        chunks.push({ coords: [tx, ty, 0, 0], data });
      }
    }
  } else {
    for (let y = 0; y < height; y++) {
      const data: number[] = [];
      for (const c of channels) {
        const s = c.sampling ?? 1;
        if (y % s !== 0) continue;
        for (let x = 0; x < width; x += s) data.push(c.value(x, y));
      }
      chunks.push({ coords: [y], data });
    }
  }

  let pos = bytes.length + chunks.length * 8;
  for (const ch of chunks) {
    const lo = pos;
    i32(lo);
    i32(0);
    pos += ch.coords.length * 4 + 4 + ch.data.length * 4;
  }
  for (const ch of chunks) {
    ch.coords.forEach(i32);
    i32(ch.data.length * 4);
    ch.data.forEach(f32);
  }
  return new Uint8Array(bytes).buffer;
}

type RGB = [number, number, number];

/** OpenEXR RgbaYca::RGBAtoYCA for one pixel. */
function toYCA(rgb: RGB, w: RGB): { Y: number; RY: number; BY: number } {
  const Y = rgb[0] * w[0] + rgb[1] * w[1] + rgb[2] * w[2];
  return { Y, RY: (rgb[0] - Y) / Y, BY: (rgb[2] - Y) / Y };
}

function ycaChannels(pixel: (x: number, y: number) => RGB, w: RGB, chromaSampling = 1): TestChannel[] {
  return [
    { name: 'Y', value: (x, y) => toYCA(pixel(x, y), w).Y },
    { name: 'RY', sampling: chromaSampling, value: (x, y) => toYCA(pixel(x, y), w).RY },
    { name: 'BY', sampling: chromaSampling, value: (x, y) => toYCA(pixel(x, y), w).BY },
  ];
}

function expectRGB(data: Float32Array, width: number, x: number, y: number, rgb: RGB, tol = 1e-5): void {
  const i = (y * width + x) * 4;
  expect(data[i]).toBeCloseTo(rgb[0], -Math.log10(tol));
  expect(data[i + 1]).toBeCloseTo(rgb[1], -Math.log10(tol));
  expect(data[i + 2]).toBeCloseTo(rgb[2], -Math.log10(tol));
  expect(data[i + 3]).toBe(1);
}

const COLORS: RGB[] = [
  [0.8, 0.2, 0.1],
  [0.1, 0.6, 0.3],
  [0.2, 0.3, 0.9],
  [2.5, 1.5, 0.25],
];
const colorAt = (x: number, y: number): RGB => COLORS[(x + y * 2) % COLORS.length]!;
const AP1 = [0.713, 0.293, 0.165, 0.83, 0.128, 0.044, 0.32168, 0.33767];

describe('EXR luminance/chroma (Y, RY, BY)', () => {
  it('decodes full-resolution colour pixels back to RGB (Rec.709 weights)', async () => {
    const w = computeLuminanceWeights();
    const result = await decodeEXR(buildEXR({ width: 2, height: 2, channels: ycaChannels(colorAt, w) }));
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) expectRGB(result.data, 2, x, y, colorAt(x, y));
  });

  it('decodes grey pixels (RY = BY = 0) to R = G = B = Y', async () => {
    const result = await decodeEXR(
      buildEXR({
        width: 2,
        height: 1,
        channels: [
          { name: 'Y', value: (x) => 0.25 + x },
          { name: 'RY', value: () => 0 },
          { name: 'BY', value: () => 0 },
        ],
      }),
    );
    expectRGB(result.data, 2, 0, 0, [0.25, 0.25, 0.25]);
    expectRGB(result.data, 2, 1, 0, [1.25, 1.25, 1.25]);
  });

  it('decodes a Y-only image as grey', async () => {
    const result = await decodeEXR(
      buildEXR({ width: 2, height: 1, channels: [{ name: 'Y', value: (x) => 0.5 * (x + 1) }] }),
    );
    expectRGB(result.data, 2, 0, 0, [0.5, 0.5, 0.5]);
    expectRGB(result.data, 2, 1, 0, [1, 1, 1]);
  });

  it("uses the file's chromaticities for the luminance weights (ACES AP1)", async () => {
    const w = computeLuminanceWeights(new Float32Array(AP1));
    const result = await decodeEXR(
      buildEXR({ width: 2, height: 2, channels: ycaChannels(colorAt, w), chromaticities: AP1 }),
    );
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) expectRGB(result.data, 2, x, y, colorAt(x, y));
    // ...and the image is tagged with those primaries for the renderer.
    const image = exrToIPImage(result);
    expect(image.metadata.chromaticities?.map((v) => +v.toFixed(5))).toEqual(AP1);
  });

  it('decodes 2x2-subsampled chroma (constant per 2x2 block)', async () => {
    const w = computeLuminanceWeights();
    const block = (x: number, y: number): RGB => colorAt(x >> 1, y >> 1);
    const result = await decodeEXR(buildEXR({ width: 4, height: 4, channels: ycaChannels(block, w, 2) }));
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) expectRGB(result.data, 4, x, y, block(x, y));
  });

  it('decodes tiled Y/RY/BY images', async () => {
    const w = computeLuminanceWeights();
    const result = await decodeEXR(buildEXR({ width: 3, height: 3, tileSize: 2, channels: ycaChannels(colorAt, w) }));
    expect(result.width).toBe(3);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) expectRGB(result.data, 3, x, y, colorAt(x, y));
  });

  it('decodes tiled Y-only images as grey', async () => {
    const result = await decodeEXR(
      buildEXR({ width: 3, height: 2, tileSize: 2, channels: [{ name: 'Y', value: (x, y) => x + y * 3 }] }),
    );
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 3; x++) {
        const v = x + y * 3;
        expectRGB(result.data, 3, x, y, [v, v, v]);
      }
    }
  });
});
