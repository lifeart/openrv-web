/**
 * JP2Decoder real-decode tests.
 *
 * These exercise the bundled OpenJPEG / OpenJPH WASM codecs end to end (no
 * mocks) against tiny lossless fixtures in test-assets/jpeg2000/. See the
 * README there for how the fixtures were generated and their pixel formulas.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { decodeJP2, setJP2WasmDecoder, type JP2DecodeResult } from './JP2Decoder';
import { decoderRegistry } from './DecoderRegistry';
import { DecoderError } from '../core/errors';
import { Logger } from '../utils/Logger';

// Typed boundary for Node built-ins (the app tsconfig has no Node types).
interface NodeFs {
  readFileSync(path: string): Uint8Array;
}
interface NodeProcess {
  cwd(): string;
}
const NODE_FS_MODULE = 'fs';
const NODE_PROCESS_MODULE = 'process';
const { readFileSync } = (await import(/* @vite-ignore */ NODE_FS_MODULE)) as NodeFs;
const { cwd } = (await import(/* @vite-ignore */ NODE_PROCESS_MODULE)) as NodeProcess;

// vitest runs from the repository root
const FIXTURES = `${cwd()}/test-assets/jpeg2000`;

function fixture(name: string): ArrayBuffer {
  const buf = readFileSync(`${FIXTURES}/${name}`);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function pixel(result: JP2DecodeResult, x: number, y: number): number[] {
  const i = (y * result.width + x) * 4;
  return Array.from(result.data.subarray(i, i + 4));
}

function expectPixel(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 5));
}

/** Expected pixel of the rgb8 fixtures: (16x, 32y, 255-16x). */
function rgb8(x: number, y: number, alpha = 255): number[] {
  return [(16 * x) / 255, (32 * y) / 255, (255 - 16 * x) / 255, alpha / 255];
}

describe('JP2Decoder -- real WASM decode', () => {
  beforeEach(() => {
    setJP2WasmDecoder(null);
  });

  it('JP2-REAL-001: decodes an 8-bit RGB JP2 box file (OpenJPEG)', async () => {
    const result = await decodeJP2(fixture('rgb8.jp2'));
    expect(result.width).toBe(16);
    expect(result.height).toBe(8);
    expect(result.channels).toBe(4);
    expect(result.data).toHaveLength(16 * 8 * 4);
    expect(result.bitsPerComponent).toBe(8);
    expect(result.isSigned).toBe(false);
    expectPixel(pixel(result, 0, 0), rgb8(0, 0));
    expectPixel(pixel(result, 3, 2), rgb8(3, 2));
    expectPixel(pixel(result, 15, 7), rgb8(15, 7));
  });

  it('JP2-REAL-002: decodes a raw J2K codestream', async () => {
    const result = await decodeJP2(fixture('rgb8.j2k'));
    expect(result.width).toBe(16);
    expect(result.height).toBe(8);
    expectPixel(pixel(result, 5, 6), rgb8(5, 6));
  });

  it('JP2-REAL-003: expands greyscale to RGB with opaque alpha', async () => {
    const result = await decodeJP2(fixture('gray8.jp2'));
    const g = (16 * 7) / 255;
    expectPixel(pixel(result, 7, 4), [g, g, g, 1]);
  });

  it('JP2-REAL-004: preserves a decoded alpha component (HTJ2K RGBA)', async () => {
    const result = await decodeJP2(fixture('rgba8.jhc'));
    expectPixel(pixel(result, 2, 1), rgb8(2, 1, 128));
  });

  it('JP2-REAL-004b: rejects classic JPEG 2000 RGBA with a clear error', async () => {
    await expect(decodeJP2(fixture('rgba8.jp2'))).rejects.toThrow('4 components are not supported');
  });

  it('JP2-REAL-005: normalizes 16-bit unsigned samples', async () => {
    const result = await decodeJP2(fixture('gray16.j2k'));
    expect(result.bitsPerComponent).toBe(16);
    const v = (15 * 4096 + 3 * 16) / 65535;
    expectPixel(pixel(result, 15, 3), [v, v, v, 1]);
  });

  it('JP2-REAL-006: decodes an HTJ2K codestream (.jhc) via OpenJPH without fallback', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const result = await decodeJP2(fixture('rgb8_codestream.jhc'));
    expect(result.width).toBe(16);
    expect(result.height).toBe(8);
    expectPixel(pixel(result, 9, 5), rgb8(9, 5));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('JP2-REAL-007: decodes an HTJ2K JPH box file (.jph)', async () => {
    const result = await decodeJP2(fixture('rgb8.jph'));
    expect(result.colorSpace).toBe('sRGB');
    expectPixel(pixel(result, 11, 3), rgb8(11, 3));
  });

  it('JP2-REAL-008: decodes 12-bit HTJ2K samples', async () => {
    const result = await decodeJP2(fixture('gray12.j2c'));
    expect(result.bitsPerComponent).toBe(12);
    const v = (4 * 256 + 6) / 4095;
    expectPixel(pixel(result, 4, 6), [v, v, v, 1]);
  });

  it('JP2-REAL-009: normalizes signed 16-bit HTJ2K samples', async () => {
    const result = await decodeJP2(fixture('signed16.j2c'));
    expect(result.isSigned).toBe(true);
    const idx = 3 * 16 + 10;
    const v = (-32768 + idx * 512 + 32768) / 65535;
    expectPixel(pixel(result, 10, 3), [v, v, v, 1]);
  });

  it('JP2-REAL-010: honours maxResolutionLevel (reduce) and clamps to available levels', async () => {
    const half = await decodeJP2(fixture('rgb8.j2k'), { maxResolutionLevel: 1 });
    expect(half.width).toBe(8);
    expect(half.height).toBe(4);
    expect(half.data).toHaveLength(8 * 4 * 4);

    const htj2k = await decodeJP2(fixture('rgb8_codestream.jhc'), { maxResolutionLevel: 1 });
    expect(htj2k.width).toBe(8);
    expect(htj2k.height).toBe(4);

    // rgb8.j2k has 2 decomposition levels; larger requests clamp to 2 (4x2)
    const clamped = await decodeJP2(fixture('rgb8.j2k'), { maxResolutionLevel: 10 });
    expect(clamped.width).toBe(4);
    expect(clamped.height).toBe(2);
  });

  it('JP2-REAL-011: crops to the requested region', async () => {
    const result = await decodeJP2(fixture('rgb8.jp2'), { region: { x: 4, y: 2, w: 3, h: 2 } });
    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
    expectPixel(pixel(result, 0, 0), rgb8(4, 2));
    expectPixel(pixel(result, 2, 1), rgb8(6, 3));
  });

  it('JP2-REAL-012: rejects a codestream whose tile data is truncated', async () => {
    const full = new Uint8Array(fixture('rgb8.j2k'));
    const truncated = full.slice(0, 80).buffer;
    await expect(decodeJP2(truncated)).rejects.toBeInstanceOf(DecoderError);
  });

  it('JP2-REAL-013: decodes through the DecoderRegistry', async () => {
    const result = await decoderRegistry.detectAndDecode(fixture('rgb8.jph'));
    expect(result).not.toBeNull();
    expect(result!.formatName).toBe('jp2');
    expect(result!.width).toBe(16);
    expect(result!.channels).toBe(4);
    expect(result!.metadata?.bitsPerComponent).toBe(8);
  });
});
