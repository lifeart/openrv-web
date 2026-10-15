/**
 * Reference tests for integer TIFF, TGA and SGI decoding against files
 * written by Pillow and ImageMagick (test-assets/still-formats/, regenerated
 * by generate.py there). Each fixture is 20x18 and holds a pattern this test
 * recomputes, so every decoded pixel is checked exactly.
 */

import { describe, it, expect } from 'vitest';
import { decodeTIFFInteger, decodeTIFFFloat } from './TIFFFloatDecoder';
import { decodeTGA } from './TGADecoder';
import { decodeSGI } from './SGIDecoder';
import { decoderRegistry } from './DecoderRegistry';
import { isDecoderBackedExtension } from '../utils/media/SupportedMediaFormats';
import {
  loadStillFixture as load,
  STILL_FIXTURE_WIDTH as W,
  STILL_FIXTURE_HEIGHT as H,
} from './__tests__/stillFormatFixtures';

type Pattern = (x: number, y: number) => [number, number, number, number];

const p8: Pattern = (x, y) => [
  ((13 * x + 7 * y) % 256) / 255,
  ((5 * x + 11 * y + 64) % 256) / 255,
  ((x * x + 3 * y) % 256) / 255,
  ((9 * x * y + 30) % 256) / 255,
];
const p16: Pattern = (x, y) => [
  ((3001 * x + 977 * y) % 65536) / 65535,
  ((1999 * x + 4093 * y + 512) % 65536) / 65535,
  ((x * x * 61 + y * 389) % 65536) / 65535,
  ((7919 * x + 31 * y + 1000) % 65536) / 65535,
];
const opaque =
  (p: Pattern): Pattern =>
  (x, y) => {
    const [r, g, b] = p(x, y);
    return [r, g, b, 1];
  };
const gray =
  (p: Pattern): Pattern =>
  (x, y) => {
    const v = p(x, y)[0];
    return [v, v, v, 1];
  };
const inverted =
  (p: Pattern): Pattern =>
  (x, y) => {
    const [r, g, b, a] = p(x, y);
    return [1 - r, 1 - g, 1 - b, a];
  };
const palette: Pattern = (x, y) => {
  const i = (x + 20 * y) % 256;
  return [i / 255, (255 - i) / 255, ((7 * i) % 256) / 255, 1];
};
const bilevel: Pattern = (x, y) => {
  const v = (x + y) % 2;
  return [v, v, v, 1];
};

/** Assert every pixel matches the pattern; reports the first mismatch. */
function expectPattern(result: { width: number; height: number; data: Float32Array }, pattern: Pattern): void {
  expect(result.width).toBe(W);
  expect(result.height).toBe(H);
  expect(result.data.length).toBe(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const got = Array.from(result.data.subarray(i, i + 4)).map((v) => Math.round(v * 65535));
      const want = pattern(x, y).map((v) => Math.round(v * 65535));
      if (got.join() !== want.join()) {
        expect({ x, y, got }).toEqual({ x, y, got: want });
      }
    }
  }
}

describe('integer TIFF (Pillow / ImageMagick fixtures)', () => {
  const cases: [string, Pattern][] = [
    ['rgb8-none.tif', opaque(p8)],
    ['rgb8-lzw.tif', opaque(p8)],
    ['rgb8-lzw-pred.tif', opaque(p8)],
    ['rgba8-packbits.tif', p8],
    ['gray8-deflate.tif', gray(p8)],
    // ImageMagick keeps the values and tags them WhiteIsZero; Pillow reads it inverted too.
    ['gray8-miniswhite.tif', inverted(gray(p8))],
    ['palette8.tif', palette],
    ['bilevel1.tif', bilevel],
    ['gray16-none.tif', gray(p16)],
    ['rgb16-zip-pred.tif', opaque(p16)],
    ['rgba16-be-lzw.tif', p16],
    ['rgb16-tiled.tif', opaque(p16)],
  ];

  it.each(cases)('%s decodes exactly', async (name, pattern) => {
    const buffer = load(name);
    expect(decoderRegistry.detectFormat(buffer)).toBe('tiff-int');
    const result = await decodeTIFFInteger(buffer);
    expect(result.colorSpace).toBe('srgb');
    expectPattern(result, pattern);
  });

  it('routes through the registry with display-referred colour space', async () => {
    const result = await decoderRegistry.detectAndDecode(load('rgb16-tiled.tif'));
    expect(result?.formatName).toBe('tiff-int');
    expect(result?.colorSpace).toBe('srgb');
    expect(result?.metadata.tiled).toBe(true);
  });

  it('rejects integer files on the float path', async () => {
    await expect(decodeTIFFFloat(load('rgb8-none.tif'))).rejects.toThrow(/Not a float TIFF/);
  });
});

describe('TGA (Pillow / ImageMagick fixtures)', () => {
  const cases: [string, Pattern][] = [
    ['rgb24.tga', opaque(p8)],
    ['rgba32-rle.tga', p8],
    ['rgba32-topleft.tga', p8],
    ['gray8-rle.tga', gray(p8)],
    ['palette8.tga', palette],
  ];

  it.each(cases)('%s decodes exactly', async (name, pattern) => {
    const buffer = load(name);
    expect(decoderRegistry.detectFormat(buffer)).toBe('tga');
    expectPattern(await decodeTGA(buffer), pattern);
  });
});

describe('SGI (Pillow / ImageMagick fixtures)', () => {
  const cases: [string, Pattern][] = [
    ['rgb8.sgi', opaque(p8)],
    ['rgba8.rgba', p8],
    ['gray8.bw', gray(p8)],
    ['rgb8-rle.sgi', opaque(p8)],
    ['rgb16-rle.sgi', opaque(p16)],
    ['rgba16.sgi', p16],
  ];

  it.each(cases)('%s decodes exactly', async (name, pattern) => {
    const buffer = load(name);
    expect(decoderRegistry.detectFormat(buffer)).toBe('sgi');
    expectPattern(await decodeSGI(buffer), pattern);
  });
});

describe('still-format routing', () => {
  it.each(['tga', 'sgi', 'rgb', 'rgba', 'bw', 'tif', 'tiff'])('.%s goes through the decoder pipeline', (ext) => {
    expect(isDecoderBackedExtension(ext)).toBe(true);
  });
});

/** Minimal little-endian 2x2 8-bit gray TIFF with extra SHORT/LONG tags. */
function tinyGrayTIFF(extraTags: [id: number, type: 3 | 4, value: number][] = []): ArrayBuffer {
  type Tag = [id: number, type: 3 | 4, value: number];
  const base: Tag[] = [
    [256, 3, 2], // ImageWidth
    [257, 3, 2], // ImageLength
    [258, 3, 8], // BitsPerSample
    [259, 3, 1], // Compression: none
    [262, 3, 1], // Photometric: BlackIsZero
    [273, 4, 0], // StripOffsets (patched below)
    [277, 3, 1], // SamplesPerPixel
    [278, 3, 2], // RowsPerStrip
    [279, 4, 4], // StripByteCounts
  ];
  const tags = [...base, ...extraTags].sort(([a], [b]) => a - b);
  const ifdSize = 2 + tags.length * 12 + 4;
  const dataOffset = 8 + ifdSize;
  const buf = new ArrayBuffer(dataOffset + 4);
  const v = new DataView(buf);
  v.setUint16(0, 0x4949);
  v.setUint16(2, 42, true);
  v.setUint32(4, 8, true);
  v.setUint16(8, tags.length, true);
  tags.forEach(([id, type, value], i) => {
    const pos = 10 + i * 12;
    v.setUint16(pos, id, true);
    v.setUint16(pos + 2, type, true);
    v.setUint32(pos + 4, 1, true);
    const val = id === 273 ? dataOffset : value;
    if (type === 3) v.setUint16(pos + 8, val, true);
    else v.setUint32(pos + 8, val, true);
  });
  new Uint8Array(buf, dataOffset).set([0, 85, 170, 255]);
  return buf;
}

describe('integer TIFF detection vs camera RAW', () => {
  it('claims a plain integer TIFF', async () => {
    const buffer = tinyGrayTIFF();
    expect(decoderRegistry.detectFormat(buffer)).toBe('tiff-int');
    const result = await decodeTIFFInteger(buffer);
    const red = Array.from(result.data.filter((_, i) => i % 4 === 0));
    expect(red).toEqual([0, 85 / 255, 170 / 255, 1].map((v) => Math.fround(v)));
  });

  it('leaves a reduced-resolution first image (NEF/ARW thumbnail IFD) to the RAW preview decoder', () => {
    expect(decoderRegistry.detectFormat(tinyGrayTIFF([[254, 4, 1]]))).toBe('raw-preview');
  });

  it('leaves DNG files to the RAW preview decoder', () => {
    expect(decoderRegistry.detectFormat(tinyGrayTIFF([[50706, 4, 0x01040000]]))).toBe('raw-preview');
  });

  it('does not claim signed-integer TIFFs', () => {
    expect(decoderRegistry.detectFormat(tinyGrayTIFF([[339, 3, 2]]))).not.toBe('tiff-int');
  });
});
