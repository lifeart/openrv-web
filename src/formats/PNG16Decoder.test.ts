/**
 * 16-bit PNG decoder tests against reference files written by FFmpeg and
 * ImageMagick, with FFmpeg's RGBA64LE decode of each file as reference.
 */

import { describe, it, expect } from 'vitest';
import { decodePNG16, getPNGInfo, isPNG16File } from './PNG16Decoder';
import { decoderRegistry } from './DecoderRegistry';
import { PNG16_REFERENCE_FILES, PNG8_FILE } from '../../test/fixtures/png16ReferenceFiles';

function b64(s: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  return bytes.buffer;
}

function referenceFloats(s: string): Float32Array {
  const view = new DataView(b64(s));
  const out = new Float32Array(view.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint16(i * 2, true) / 65535;
  return out;
}

function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return max;
}

describe('PNG16Decoder', () => {
  const entries = Object.entries(PNG16_REFERENCE_FILES);

  it.each(entries)('PNG16-REF %s: decodes to the reference RGBA', async (_name, file) => {
    const result = await decodePNG16(b64(file.png));
    expect(result.width).toBe(11);
    expect(result.height).toBe(9);
    expect(result.channels).toBe(4);
    expect(result.metadata.bitDepth).toBe(16);
    const ref = referenceFloats(file.rgba64le);
    expect(result.data.length).toBe(ref.length);
    expect(maxAbsDiff(result.data, ref)).toBeLessThan(1e-6);
  });

  it('PNG16-ADAM7: interlaced file decodes like the non-interlaced one', async () => {
    const files = PNG16_REFERENCE_FILES;
    const adam7 = files.rgba_adam7;
    const plain = files.rgba;
    if (!adam7 || !plain) throw new Error('missing fixture');
    const a = await decodePNG16(b64(adam7.png));
    const p = await decodePNG16(b64(plain.png));
    expect(a.metadata.interlaced).toBe(true);
    expect(p.metadata.interlaced).toBe(false);
    expect(maxAbsDiff(a.data, p.data)).toBe(0);
  });

  it('PNG16-PRECISION: keeps the low byte of 16-bit samples', async () => {
    const file = PNG16_REFERENCE_FILES.rgb;
    if (!file) throw new Error('missing fixture');
    const result = await decodePNG16(b64(file.png));
    const nonMultipleOf257 = Array.from(result.data).some((v) => Math.round(v * 65535) % 257 !== 0);
    expect(nonMultipleOf257).toBe(true);
  });

  it('PNG16-DETECT: 16-bit files are detected, 8-bit files are not', () => {
    for (const file of Object.values(PNG16_REFERENCE_FILES)) {
      const buf = b64(file.png);
      expect(isPNG16File(buf)).toBe(true);
      expect(decoderRegistry.detectFormat(buf)).toBe('png16');
      // Header-only detection (FileSourceNode reads the first 33 bytes)
      expect(decoderRegistry.detectFormat(buf.slice(0, 33))).toBe('png16');
    }
    const png8 = b64(PNG8_FILE);
    expect(getPNGInfo(png8)?.bitDepth).toBe(8);
    expect(isPNG16File(png8)).toBe(false);
    expect(decoderRegistry.detectFormat(png8)).not.toBe('png16');
  });

  it('PNG16-ERR-001: rejects 8-bit PNGs', async () => {
    await expect(decodePNG16(b64(PNG8_FILE))).rejects.toThrow(/16-bit/);
  });

  it('PNG16-ERR-002: rejects non-PNG data', async () => {
    await expect(decodePNG16(new Uint8Array(64).buffer)).rejects.toThrow(/Invalid PNG/);
  });

  it('PNG16-ERR-003: rejects truncated files', async () => {
    const file = PNG16_REFERENCE_FILES.rgba;
    if (!file) throw new Error('missing fixture');
    const buf = b64(file.png);
    await expect(decodePNG16(buf.slice(0, Math.floor(buf.byteLength / 2)))).rejects.toThrow();
  });

  it('PNG16-ERR-004: rejects corrupt compressed data', async () => {
    const file = PNG16_REFERENCE_FILES.rgba;
    if (!file) throw new Error('missing fixture');
    const bytes = new Uint8Array(b64(file.png));
    const view = new DataView(bytes.buffer);
    let pos = 8;
    while (view.getUint32(pos + 4) !== 0x49444154) pos += 12 + view.getUint32(pos);
    // Zero the IDAT payload: an invalid zlib header
    bytes.fill(0, pos + 8, pos + 8 + view.getUint32(pos));
    await expect(decodePNG16(bytes.buffer)).rejects.toThrow();
  });
});
