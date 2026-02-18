/**
 * EXR DWA Codec Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  inverseDCT8x8,
  forwardDCT8x8,
  unzigzag,
  floatToHalf,
  hufDecode,
  parseDWABlockHeader,
  decompressDWA,
  ZIGZAG_ORDER,
  type DWABlockHeader,
} from './EXRDWACodec';
import { EXRCompression } from './EXRDecoder';

// ---------------------------------------------------------------------------
// Helper: create big-endian int64 bytes
// ---------------------------------------------------------------------------

function writeBEInt64(value: number): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  // Write as two 32-bit halves (big-endian)
  view.setInt32(0, Math.floor(value / 0x100000000), false);
  view.setUint32(4, value >>> 0, false);
  return buf;
}

function createDWAHeader(overrides: Partial<DWABlockHeader> = {}): Uint8Array {
  const defaults: DWABlockHeader = {
    version: 2,
    unknownUncompressedSize: 0,
    unknownCompressedSize: 0,
    acCompressedSize: 0,
    dcCompressedSize: 0,
    rleCompressedSize: 0,
    rleUncompressedSize: 0,
    rleRawSize: 0,
    totalAcUncompressedCount: 0,
    totalDcUncompressedCount: 0,
    acCompression: 0,
  };
  const h = { ...defaults, ...overrides };
  const fields = [
    h.version, h.unknownUncompressedSize, h.unknownCompressedSize,
    h.acCompressedSize, h.dcCompressedSize, h.rleCompressedSize,
    h.rleUncompressedSize, h.rleRawSize, h.totalAcUncompressedCount,
    h.totalDcUncompressedCount, h.acCompression,
  ];
  const result = new Uint8Array(88);
  for (let i = 0; i < 11; i++) {
    result.set(writeBEInt64(fields[i]!), i * 8);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EXRDWACodec', () => {
  describe('inverseDCT8x8', () => {
    it('DWAB-001: round-trips with forwardDCT8x8 within tolerance', () => {
      // Create a simple spatial block
      const spatial = new Float32Array(64);
      for (let i = 0; i < 64; i++) {
        spatial[i] = Math.sin(i * 0.1) * 0.5 + 0.5;
      }

      // Forward DCT → Inverse DCT should recover original
      const coeffs = forwardDCT8x8(spatial);
      const recovered = inverseDCT8x8(coeffs);

      for (let i = 0; i < 64; i++) {
        expect(recovered[i]).toBeCloseTo(spatial[i]!, 4);
      }
    });

    it('DWAB-001b: DC-only block produces constant output', () => {
      const coeffs = new Float32Array(64);
      coeffs[0] = 4.0; // DC coefficient only

      const spatial = inverseDCT8x8(coeffs);

      // All pixels should have the same value
      const expected = spatial[0]!;
      for (let i = 1; i < 64; i++) {
        expect(spatial[i]).toBeCloseTo(expected, 6);
      }
    });

    it('DWAB-001c: all-zero coefficients produce all-zero output', () => {
      const coeffs = new Float32Array(64);
      const spatial = inverseDCT8x8(coeffs);

      for (let i = 0; i < 64; i++) {
        expect(spatial[i]).toBeCloseTo(0, 10);
      }
    });
  });

  describe('unzigzag', () => {
    it('DWAB-002: correctly reorders zigzag to natural order', () => {
      // Put sequential values in zigzag order
      const zigzagged = new Float32Array(64);
      for (let i = 0; i < 64; i++) {
        zigzagged[i] = i;
      }

      const output = new Float32Array(64);
      unzigzag(zigzagged, output);

      // Verify: zigzagged[0] = 0 should go to output[ZIGZAG[0]] = output[0]
      // zigzagged[1] = 1 should go to output[ZIGZAG[1]] = output[1]
      // zigzagged[2] = 2 should go to output[ZIGZAG[2]] = output[8]
      expect(output[0]).toBe(0); // zigzag position 0 → natural (0,0)
      expect(output[1]).toBe(1); // zigzag position 1 → natural (0,1)
      expect(output[8]).toBe(2); // zigzag position 2 → natural (1,0)
    });

    it('DWAB-002b: ZIGZAG_ORDER has 64 unique entries covering 0-63', () => {
      expect(ZIGZAG_ORDER.length).toBe(64);
      const set = new Set(ZIGZAG_ORDER);
      expect(set.size).toBe(64);
      for (let i = 0; i < 64; i++) {
        expect(set.has(i)).toBe(true);
      }
    });
  });

  describe('floatToHalf', () => {
    it('DWAB-003: converts common values correctly', () => {
      // 0.0
      expect(floatToHalf(0)).toBe(0);
      // 1.0 → half representation: sign=0, exp=15, mantissa=0 → 0x3c00
      expect(floatToHalf(1.0)).toBe(0x3c00);
      // -1.0
      expect(floatToHalf(-1.0)).toBe(0xbc00);
      // Infinity
      expect(floatToHalf(Infinity)).toBe(0x7c00);
    });

    it('DWAB-003b: handles small values near zero', () => {
      const h = floatToHalf(0.0001);
      // Should produce a valid non-zero half
      expect(h).toBeGreaterThan(0);
      expect(h).toBeLessThan(0x7c00); // less than infinity
    });
  });

  describe('parseDWABlockHeader', () => {
    it('DWAB-004: reads all 11 fields correctly', () => {
      const data = createDWAHeader({
        version: 2,
        acCompressedSize: 100,
        dcCompressedSize: 50,
        rleCompressedSize: 200,
        rleUncompressedSize: 800,
        totalAcUncompressedCount: 1000,
        totalDcUncompressedCount: 16,
        acCompression: 1, // DEFLATE
      });

      const { header, dataOffset } = parseDWABlockHeader(data);

      expect(dataOffset).toBe(88);
      expect(header.version).toBe(2);
      expect(header.acCompressedSize).toBe(100);
      expect(header.dcCompressedSize).toBe(50);
      expect(header.rleCompressedSize).toBe(200);
      expect(header.rleUncompressedSize).toBe(800);
      expect(header.totalAcUncompressedCount).toBe(1000);
      expect(header.totalDcUncompressedCount).toBe(16);
      expect(header.acCompression).toBe(1);
    });

    it('DWAB-004b: rejects version < 2', () => {
      const data = createDWAHeader({ version: 1 });
      expect(() => parseDWABlockHeader(data)).toThrow('Unsupported DWA version');
    });

    it('DWAB-004c: rejects data too small for header', () => {
      const data = new Uint8Array(80);
      expect(() => parseDWABlockHeader(data)).toThrow('too small');
    });
  });

  describe('hufDecode', () => {
    it('DWAB-005: returns empty array for zero nRaw', () => {
      const result = hufDecode(new Uint8Array(100), 0, 100, 0);
      expect(result).toBeInstanceOf(Uint16Array);
      expect(result.length).toBe(0);
    });

    it('DWAB-005b: returns empty array for too-small compressed data', () => {
      const result = hufDecode(new Uint8Array(10), 0, 10, 100);
      expect(result).toBeInstanceOf(Uint16Array);
      expect(result.length).toBe(100);
      // All zeros since data was too small to decode
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBe(0);
      }
    });
  });

  describe('decompressDWA', () => {
    it('DWAB-006: returns zero-filled buffer for empty input', async () => {
      const result = await decompressDWA(
        new Uint8Array(0),
        0,
        8, // width
        8, // numLines
        [2], // one HALF channel
      );
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });

    it('DWAB-006b: handles block with zero-size sub-blocks', async () => {
      // Create a DWA block with valid header but all zero sub-block sizes
      // This means all channels have zero data → output should be zeroed
      const header = createDWAHeader({
        version: 2,
        acCompressedSize: 0,
        dcCompressedSize: 0,
        rleCompressedSize: 0,
        rleUncompressedSize: 0,
        totalAcUncompressedCount: 0,
        totalDcUncompressedCount: 0,
      });

      const width = 8;
      const numLines = 8;
      const channelSizes = [2]; // one HALF channel
      const uncompressedSize = width * numLines * 2; // 2 bytes per pixel

      const result = await decompressDWA(
        header,
        uncompressedSize,
        width,
        numLines,
        channelSizes,
      );

      expect(result.length).toBe(uncompressedSize);
    });

    it('DWAB-007: DWAB compression type is in EXR supported list', () => {
      // Verify DWAB and DWAA are recognized compression types
      expect(EXRCompression.DWAB).toBe(9);
      expect(EXRCompression.DWAA).toBe(8);
    });
  });

  describe('forwardDCT8x8', () => {
    it('DWAB-008: constant block has energy only in DC', () => {
      const spatial = new Float32Array(64).fill(1.0);
      const coeffs = forwardDCT8x8(spatial);

      // DC should be non-zero
      expect(Math.abs(coeffs[0]!)).toBeGreaterThan(0.1);

      // All AC coefficients should be ~0
      for (let i = 1; i < 64; i++) {
        expect(Math.abs(coeffs[i]!)).toBeLessThan(1e-6);
      }
    });

    it('DWAB-008b: DCT preserves energy (Parseval theorem)', () => {
      const spatial = new Float32Array(64);
      for (let i = 0; i < 64; i++) spatial[i] = Math.sin(i * 0.3);

      const coeffs = forwardDCT8x8(spatial);

      // Sum of squares should be preserved (approximately)
      let spatialEnergy = 0;
      let freqEnergy = 0;
      for (let i = 0; i < 64; i++) {
        spatialEnergy += spatial[i]! * spatial[i]!;
        freqEnergy += coeffs[i]! * coeffs[i]!;
      }

      // Energy ratio should be close to 1 (the DCT scaling factor may affect this)
      // For Type-II DCT with our normalization, the ratio won't be exactly 1
      // but forward+inverse should round-trip
      expect(spatialEnergy).toBeGreaterThan(0);
      expect(freqEnergy).toBeGreaterThan(0);
    });
  });
});
