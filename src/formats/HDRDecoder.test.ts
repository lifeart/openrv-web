/**
 * HDRDecoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { isHDRFile, getHDRInfo, decodeHDR } from './HDRDecoder';

/**
 * Encode a string to bytes
 */
function strToBytes(str: string): number[] {
  return Array.from(str).map(c => c.charCodeAt(0));
}

/**
 * Convert float RGB to RGBE bytes for test data generation.
 * Inverse of the RGBE→float conversion in the decoder.
 */
function floatToRGBE(r: number, g: number, b: number): [number, number, number, number] {
  const maxVal = Math.max(r, g, b);
  if (maxVal < 1e-32) {
    return [0, 0, 0, 0];
  }

  // Find exponent such that maxVal = mantissa * 2^exp where 0.5 <= mantissa < 1
  let exp = Math.ceil(Math.log2(maxVal));
  // scale = 256 / 2^exp = 256 * 2^(-exp)
  let scale = 256 * Math.pow(2, -exp);

  // Ensure components fit in [0, 255]
  if (maxVal * scale >= 256) {
    scale *= 0.5;
    exp++;
  }

  const re = Math.max(0, Math.min(255, Math.floor(r * scale)));
  const ge = Math.max(0, Math.min(255, Math.floor(g * scale)));
  const be = Math.max(0, Math.min(255, Math.floor(b * scale)));
  const ee = exp + 128;

  return [re, ge, be, ee];
}

/**
 * Create a minimal valid HDR buffer with uncompressed pixel data.
 */
function createTestHDR(options?: {
  width?: number;
  height?: number;
  magic?: string;
  format?: string;
  exposure?: number;
  gamma?: number;
  primaries?: string;
  pixels?: [number, number, number][]; // RGB float values per pixel
  rawPixelBytes?: number[]; // Override raw RGBE bytes
  resLine?: string; // Override resolution line
  omitEmptyLine?: boolean; // Skip the empty line separator
}): ArrayBuffer {
  const width = options?.width ?? 2;
  const height = options?.height ?? 2;
  const magic = options?.magic ?? '#?RADIANCE';

  const lines: string[] = [];
  lines.push(magic);

  if (options?.format !== undefined) {
    lines.push(`FORMAT=${options.format}`);
  } else {
    lines.push('FORMAT=32-bit_rle_rgbe');
  }

  if (options?.exposure !== undefined) {
    lines.push(`EXPOSURE=${options.exposure}`);
  }

  if (options?.gamma !== undefined) {
    lines.push(`GAMMA=${options.gamma}`);
  }

  if (options?.primaries !== undefined) {
    lines.push(`PRIMARIES=${options.primaries}`);
  }

  // Build header bytes
  const headerBytes: number[] = [];
  for (const line of lines) {
    headerBytes.push(...strToBytes(line), 0x0a);
  }

  // Empty line separator
  if (!options?.omitEmptyLine) {
    headerBytes.push(0x0a);
  }

  // Resolution line
  const resLine = options?.resLine ?? `-Y ${height} +X ${width}`;
  headerBytes.push(...strToBytes(resLine), 0x0a);

  // Pixel data
  let pixelBytes: number[];
  if (options?.rawPixelBytes) {
    pixelBytes = options.rawPixelBytes;
  } else {
    const pixels = options?.pixels ??
      Array.from({ length: width * height }, () => [1.0, 0.5, 0.25] as [number, number, number]);
    pixelBytes = [];
    for (const [r, g, b] of pixels) {
      const [re, ge, be, ee] = floatToRGBE(r, g, b);
      pixelBytes.push(re, ge, be, ee);
    }
  }

  const totalBytes = headerBytes.length + pixelBytes.length;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new Uint8Array(buffer);
  view.set(headerBytes, 0);
  view.set(pixelBytes, headerBytes.length);

  return buffer;
}

/**
 * Create a HDR buffer with new-style RLE compressed scanlines.
 * Each scanline is encoded with adaptive RLE per component.
 */
function createTestHDRWithRLE(options: {
  width: number;
  height: number;
  pixels: [number, number, number][]; // row-major RGB float values
}): ArrayBuffer {
  const { width, height, pixels } = options;

  const headerBytes: number[] = [];
  headerBytes.push(...strToBytes('#?RADIANCE\n'));
  headerBytes.push(...strToBytes('FORMAT=32-bit_rle_rgbe\n'));
  headerBytes.push(0x0a); // empty line
  headerBytes.push(...strToBytes(`-Y ${height} +X ${width}\n`));

  // Encode each scanline with new-style RLE
  const pixelBytes: number[] = [];
  for (let y = 0; y < height; y++) {
    // RLE marker
    pixelBytes.push(2, 2, (width >> 8) & 0xff, width & 0xff);

    // Convert row to RGBE
    const rowRGBE: number[][] = [];
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixels[y * width + x]!;
      rowRGBE.push(floatToRGBE(r, g, b));
    }

    // Encode each component with simple literal runs (no compression, just literal count)
    for (let comp = 0; comp < 4; comp++) {
      // Write as literals in chunks of up to 128
      let idx = 0;
      while (idx < width) {
        const chunk = Math.min(128, width - idx);
        pixelBytes.push(chunk); // literal count
        for (let i = 0; i < chunk; i++) {
          pixelBytes.push(rowRGBE[idx + i]![comp]!);
        }
        idx += chunk;
      }
    }
  }

  const totalBytes = headerBytes.length + pixelBytes.length;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new Uint8Array(buffer);
  view.set(headerBytes, 0);
  view.set(pixelBytes, headerBytes.length);

  return buffer;
}

describe('HDRDecoder', () => {
  describe('isHDRFile', () => {
    it('HDR-U001: should detect #?RADIANCE magic', () => {
      const buffer = createTestHDR();
      expect(isHDRFile(buffer)).toBe(true);
    });

    it('HDR-U002: should detect #?RGBE magic', () => {
      const buffer = createTestHDR({ magic: '#?RGBE' });
      expect(isHDRFile(buffer)).toBe(true);
    });

    it('HDR-U003: should reject empty buffer', () => {
      expect(isHDRFile(new ArrayBuffer(0))).toBe(false);
    });

    it('HDR-U004: should reject buffer too small for magic', () => {
      const buffer = new ArrayBuffer(3);
      const view = new Uint8Array(buffer);
      view.set(strToBytes('#?R'));
      expect(isHDRFile(buffer)).toBe(false);
    });

    it('HDR-U005: should reject wrong magic', () => {
      const buffer = new ArrayBuffer(16);
      const view = new Uint8Array(buffer);
      view.set(strToBytes('NOT_HDR_FORMAT'));
      expect(isHDRFile(buffer)).toBe(false);
    });

    it('HDR-U006: should reject PNG magic', () => {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint32(0, 0x89504e47); // PNG magic
      expect(isHDRFile(buffer)).toBe(false);
    });
  });

  describe('getHDRInfo', () => {
    it('HDR-U010: should parse basic header with dimensions', () => {
      const buffer = createTestHDR({ width: 64, height: 32 });
      const info = getHDRInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.width).toBe(64);
      expect(info!.height).toBe(32);
    });

    it('HDR-U011: should parse exposure value', () => {
      const buffer = createTestHDR({ exposure: 2.5 });
      const info = getHDRInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.exposure).toBe(2.5);
    });

    it('HDR-U012: should parse gamma value', () => {
      const buffer = createTestHDR({ gamma: 2.2 });
      const info = getHDRInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.gamma).toBe(2.2);
    });

    it('HDR-U013: should parse format string', () => {
      const buffer = createTestHDR({ format: '32-bit_rle_xyze' });
      const info = getHDRInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.format).toBe('32-bit_rle_xyze');
    });

    it('HDR-U014: should parse primaries string', () => {
      const buffer = createTestHDR({ primaries: '0.640 0.330 0.300 0.600 0.150 0.060 0.313 0.329' });
      const info = getHDRInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.primaries).toBe('0.640 0.330 0.300 0.600 0.150 0.060 0.313 0.329');
    });

    it('HDR-U015: should default exposure to 1.0 when not specified', () => {
      const buffer = createTestHDR();
      const info = getHDRInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.exposure).toBe(1.0);
    });

    it('HDR-U016: should default gamma to 1.0 when not specified', () => {
      const buffer = createTestHDR();
      const info = getHDRInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.gamma).toBe(1.0);
    });

    it('HDR-U017: should return null for non-HDR buffer', () => {
      const buffer = new ArrayBuffer(16);
      expect(getHDRInfo(buffer)).toBeNull();
    });

    it('HDR-U018: should return null for empty buffer', () => {
      expect(getHDRInfo(new ArrayBuffer(0))).toBeNull();
    });

    it('HDR-U019: should handle +X/+Y resolution format', () => {
      const buffer = createTestHDR({ resLine: '+X 100 +Y 50' });
      const info = getHDRInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.width).toBe(100);
      expect(info!.height).toBe(50);
    });

    it('HDR-U020: should return null for missing header separator', () => {
      const buffer = createTestHDR({ omitEmptyLine: true });
      // With omitted empty line, the parser will fail to find the separator
      // and may either return null or misparse; getHDRInfo catches errors
      const info = getHDRInfo(buffer);
      // The resolution line won't be found correctly
      expect(info).toBeNull();
    });
  });

  describe('decodeHDR', () => {
    it('HDR-U030: should decode uncompressed RGBE data', async () => {
      const pixels: [number, number, number][] = [
        [1.0, 0.5, 0.25],
        [0.0, 0.0, 0.0],
        [2.0, 1.0, 0.5],
        [0.1, 0.2, 0.3],
      ];
      const buffer = createTestHDR({ width: 2, height: 2, pixels });
      const result = await decodeHDR(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      expect(result.colorSpace).toBe('linear');
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(2 * 2 * 4); // RGBA
    });

    it('HDR-U031: should produce correct RGBE→float values', async () => {
      // Use a known value: pure white at exponent 129 → value = (255+0.5)/256 * 2^(129-128) = ~2.0
      const buffer = createTestHDR({
        width: 1,
        height: 1,
        rawPixelBytes: [255, 255, 255, 129],
      });
      const result = await decodeHDR(buffer);

      const r = result.data[0]!;
      const g = result.data[1]!;
      const b = result.data[2]!;
      const a = result.data[3]!;

      // (255 + 0.5) / 256 * 2^(129 - 128) = 255.5/256 * 2 ≈ 1.99609375
      expect(r).toBeCloseTo(1.99609375, 4);
      expect(g).toBeCloseTo(1.99609375, 4);
      expect(b).toBeCloseTo(1.99609375, 4);
      expect(a).toBe(1.0); // Alpha always 1.0
    });

    it('HDR-U032: should produce zero for RGBE exponent 0', async () => {
      const buffer = createTestHDR({
        width: 1,
        height: 1,
        rawPixelBytes: [128, 64, 200, 0], // E=0 → black
      });
      const result = await decodeHDR(buffer);

      expect(result.data[0]).toBe(0);
      expect(result.data[1]).toBe(0);
      expect(result.data[2]).toBe(0);
      expect(result.data[3]).toBe(1.0);
    });

    it('HDR-U033: should always output 4-channel RGBA', async () => {
      const buffer = createTestHDR({ width: 3, height: 1 });
      const result = await decodeHDR(buffer);

      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(3 * 1 * 4);

      // Check that every 4th value (alpha) is 1.0
      for (let i = 3; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(1.0);
      }
    });

    it('HDR-U034: should decode #?RGBE alternate magic', async () => {
      const buffer = createTestHDR({ magic: '#?RGBE', width: 2, height: 1 });
      const result = await decodeHDR(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(1);
      expect(result.channels).toBe(4);
    });

    it('HDR-U035: should include metadata in result', async () => {
      const buffer = createTestHDR({ exposure: 3.0, gamma: 2.2 });
      const result = await decodeHDR(buffer);

      expect(result.metadata.format).toBe('hdr');
      expect(result.metadata.exposure).toBe(3.0);
      expect(result.metadata.gamma).toBe(2.2);
      expect(result.metadata.hdrFormat).toBe('32-bit_rle_rgbe');
    });

    it('HDR-U036: should throw on invalid magic', async () => {
      const buffer = new ArrayBuffer(16);
      const view = new Uint8Array(buffer);
      view.set(strToBytes('NOT_HDR_FORMAT'));

      await expect(decodeHDR(buffer)).rejects.toThrow('Invalid HDR file');
    });

    it('HDR-U037: should throw on truncated pixel data', async () => {
      // Create a buffer with header but not enough pixel data
      const headerStr = '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 10 +X 10\n';
      const headerBytes = strToBytes(headerStr);
      // Only provide 2 bytes of pixel data instead of 10*10*4 = 400
      const buffer = new ArrayBuffer(headerBytes.length + 2);
      new Uint8Array(buffer).set(headerBytes, 0);

      await expect(decodeHDR(buffer)).rejects.toThrow();
    });

    it('HDR-U038: should handle new-style RLE compressed data', async () => {
      const width = 16; // Must be >= 8 for new-style RLE
      const height = 2;
      const pixels: [number, number, number][] = [];
      for (let i = 0; i < width * height; i++) {
        pixels.push([1.0, 0.5, 0.25]);
      }

      const buffer = createTestHDRWithRLE({ width, height, pixels });
      const result = await decodeHDR(buffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(width * height * 4);

      // Verify the decoded values are close to the input
      for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        expect(result.data[idx]!).toBeCloseTo(1.0, 1);
        expect(result.data[idx + 1]!).toBeCloseTo(0.5, 1);
        expect(result.data[idx + 2]!).toBeCloseTo(0.25, 1);
        expect(result.data[idx + 3]!).toBe(1.0);
      }
    });

    it('HDR-U039: should handle RLE with run-length encoded components', async () => {
      const width = 16;
      const height = 1;

      // All pixels same value → RLE should compress well
      const headerBytes: number[] = [];
      headerBytes.push(...strToBytes('#?RADIANCE\n'));
      headerBytes.push(...strToBytes('FORMAT=32-bit_rle_rgbe\n'));
      headerBytes.push(0x0a);
      headerBytes.push(...strToBytes(`-Y ${height} +X ${width}\n`));

      const [re, ge, be, ee] = floatToRGBE(1.0, 0.5, 0.25);

      const pixelBytes: number[] = [];
      // RLE marker
      pixelBytes.push(2, 2, 0, width);

      // Each component: run of N identical values
      // Run encoding: (128 + count) followed by the value
      for (const compValue of [re, ge, be, ee]) {
        pixelBytes.push(128 + width, compValue); // run of `width` identical values
      }

      const totalBytes = headerBytes.length + pixelBytes.length;
      const buffer = new ArrayBuffer(totalBytes);
      const view = new Uint8Array(buffer);
      view.set(headerBytes, 0);
      view.set(pixelBytes, headerBytes.length);

      const result = await decodeHDR(buffer);
      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      // All pixels should have the same value
      for (let i = 0; i < width; i++) {
        const idx = i * 4;
        expect(result.data[idx]!).toBeCloseTo(1.0, 1);
        expect(result.data[idx + 1]!).toBeCloseTo(0.5, 1);
        expect(result.data[idx + 2]!).toBeCloseTo(0.25, 1);
      }
    });

    it('HDR-U040: should reject dimensions exceeding maximum', async () => {
      // Create a header with absurdly large dimensions
      const headerStr = '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 100000 +X 100000\n';
      const headerBytes = strToBytes(headerStr);
      const buffer = new ArrayBuffer(headerBytes.length + 4);
      new Uint8Array(buffer).set(headerBytes, 0);

      await expect(decodeHDR(buffer)).rejects.toThrow();
    });

    it('HDR-U041: should handle 1x1 image', async () => {
      const buffer = createTestHDR({
        width: 1,
        height: 1,
        pixels: [[0.5, 0.5, 0.5]],
      });
      const result = await decodeHDR(buffer);

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.data.length).toBe(4);
      expect(result.data[0]!).toBeCloseTo(0.5, 1);
      expect(result.data[3]).toBe(1.0);
    });

    it('HDR-U042: should handle very bright HDR values', async () => {
      // Test encoding a very bright pixel (e.g., 1000.0)
      const buffer = createTestHDR({
        width: 1,
        height: 1,
        pixels: [[1000.0, 500.0, 100.0]],
      });
      const result = await decodeHDR(buffer);

      // Values should be approximately correct (RGBE has limited precision)
      expect(result.data[0]!).toBeCloseTo(1000.0, -1); // within ~10
      expect(result.data[1]!).toBeCloseTo(500.0, -1);
      expect(result.data[2]!).toBeCloseTo(100.0, -1);
    });

    it('HDR-U043: should handle very dim HDR values', async () => {
      const buffer = createTestHDR({
        width: 1,
        height: 1,
        pixels: [[0.001, 0.002, 0.003]],
      });
      const result = await decodeHDR(buffer);

      expect(result.data[0]!).toBeCloseTo(0.001, 2);
      expect(result.data[1]!).toBeCloseTo(0.002, 2);
      expect(result.data[2]!).toBeCloseTo(0.003, 2);
    });

    it('HDR-U044: should include primaries in metadata when present', async () => {
      const prims = '0.640 0.330 0.300 0.600 0.150 0.060 0.313 0.329';
      const buffer = createTestHDR({ primaries: prims });
      const result = await decodeHDR(buffer);

      expect(result.metadata.primaries).toBe(prims);
    });

    it('HDR-U045: should not include primaries in metadata when absent', async () => {
      const buffer = createTestHDR();
      const result = await decodeHDR(buffer);

      expect(result.metadata).not.toHaveProperty('primaries');
    });

    it('HDR-U046: should not false-positive RLE when first pixel is R=2,G=2', async () => {
      // Width=10 is in the RLE range [8, 32767], and first pixel has R=2, G=2.
      // But the encoded width from bytes [2][3] won't match 10, so it must
      // fall back to uncompressed decoding instead of erroring.
      const width = 10;
      const height = 1;
      const pixelBytes: number[] = [];
      // First pixel: R=2, G=2, B=100, E=128 — triggers the [2,2,...] prefix
      pixelBytes.push(2, 2, 100, 128);
      // Remaining 9 pixels
      for (let i = 1; i < width; i++) {
        pixelBytes.push(128, 128, 128, 128);
      }

      const buffer = createTestHDR({
        width,
        height,
        rawPixelBytes: pixelBytes,
      });
      const result = await decodeHDR(buffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      // First pixel should have the specific values from R=2,G=2,B=100,E=128
      // (2 + 0.5) / 256 * 2^(128-128) = 2.5/256 ≈ 0.00977
      expect(result.data[0]!).toBeCloseTo(2.5 / 256, 4);
      expect(result.data[1]!).toBeCloseTo(2.5 / 256, 4);
    });
  });
});
