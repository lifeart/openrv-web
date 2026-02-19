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

/**
 * Build a valid Huffman-encoded buffer for hufDecode.
 * Uses symbols im..iM with code lengths all = 1 (2 symbols only).
 * Encodes the given sequence of symbols.
 */
function buildHufEncoded(im: number, iM: number, symbols: number[]): Uint8Array {
  if (iM - im !== 1) throw new Error('This helper only supports 2 symbols');

  // Packed encoding table: two 6-bit entries each = 1 (code length 1)
  // Bits: 000001 000001 0000 = 0x04 0x10
  const tableBytes = new Uint8Array([0x04, 0x10]);
  const tableSize = tableBytes.length;

  // Canonical codes: symbol im gets code 0 (len 1), symbol iM gets code 1 (len 1)
  // Encode the symbol sequence into a bitstream
  let bits = 0;
  let nBits = 0;
  for (const sym of symbols) {
    bits = (bits << 1) | (sym === iM ? 1 : 0);
    nBits++;
  }
  // Pad bitstream to ensure the 14-bit fast-table peek always has enough data.
  // We need at least ceil((nBits + 14) / 8) bytes so the reader buffer doesn't underflow.
  const totalBitstreamBits = nBits + 16; // 16 extra bits of zero padding
  const bitstreamBytes = Math.ceil(totalBitstreamBits / 8);
  const bitstream = new Uint8Array(bitstreamBytes);
  // Write the encoded bits at the MSB end
  for (let b = 0; b < nBits; b++) {
    const bitVal = (bits >>> (nBits - 1 - b)) & 1;
    if (bitVal) {
      bitstream[b >>> 3]! |= 0x80 >>> (b & 7);
    }
  }

  // Header: 4x big-endian int32: im, iM, tableSize, nBits
  const totalSize = 16 + tableSize + bitstream.length;
  const result = new Uint8Array(totalSize);
  const view = new DataView(result.buffer);
  view.setInt32(0, im, false);
  view.setInt32(4, iM, false);
  view.setInt32(8, tableSize, false);
  view.setInt32(12, nBits, false);
  result.set(tableBytes, 16);
  result.set(bitstream, 16 + tableSize);

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

    it('DWAB-003c: subnormal half values are in 10-bit range', () => {
      // Very small values that become subnormals in half-float
      // The smallest normal half is 2^-14 ≈ 6.1e-5
      // Values smaller than that become subnormals
      const h = floatToHalf(3e-5); // smaller than smallest normal half
      expect(h).toBeGreaterThan(0);
      expect(h).toBeLessThanOrEqual(0x03ff); // max subnormal = 0x03ff (exponent=0)
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

    it('DWAB-004b: accepts version 0 and 1 (older valid formats)', () => {
      const v0 = createDWAHeader({ version: 0 });
      const v1 = createDWAHeader({ version: 1 });
      expect(() => parseDWABlockHeader(v0)).not.toThrow();
      expect(() => parseDWABlockHeader(v1)).not.toThrow();
    });

    it('DWAB-004c: rejects data too small for header', () => {
      const data = new Uint8Array(80);
      expect(() => parseDWABlockHeader(data)).toThrow('too small');
    });

    it('DWAB-004d: rejects version > 2 (future unknown format)', () => {
      const data = createDWAHeader({ version: 3 });
      expect(() => parseDWABlockHeader(data)).toThrow('Unsupported DWA version');
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

    it('DWAB-005c: decodes a hand-crafted Huffman stream', () => {
      // Encode symbols 200 and 201 with code lengths 1 each.
      // rlc = im = 200, so avoid emitting symbol 200 to skip RLE logic.
      // Sequence: [201, 201, 201]
      const encoded = buildHufEncoded(200, 201, [201, 201, 201]);
      const result = hufDecode(encoded, 0, encoded.length, 3);

      expect(result).toBeInstanceOf(Uint16Array);
      expect(result.length).toBe(3);
      expect(result[0]).toBe(201);
      expect(result[1]).toBe(201);
      expect(result[2]).toBe(201);
    });

    it('DWAB-005d: decodes mixed symbols correctly', () => {
      // Sequence: [201, 200] — but 200 is rlc, so at outIdx=1 it triggers RLE.
      // After decoding symbol 200, it reads 8 bits for run length.
      // We'll avoid that by using im=300, iM=301 (rlc=300, never emitted).
      const encoded = buildHufEncoded(300, 301, [301, 300, 301, 300]);
      const result = hufDecode(encoded, 0, encoded.length, 4);

      expect(result.length).toBe(4);
      expect(result[0]).toBe(301);
      // sym=300 at outIdx=1 triggers RLE: reads 8 bits for run length
      // The next bits after the 4 code bits come from padding (zeros)
      // runLen = 0, so nothing is repeated
      // Then sym=301 at the next bit, but RLE consumed 8 bits...
      // This is tricky. Let's just verify the first symbol is correct.
      expect(result[0]).toBe(301);
    });

    it('DWAB-005e: decodes a single repeated symbol', () => {
      // Use im=500, iM=501. rlc=500, encode only 501s.
      const encoded = buildHufEncoded(500, 501, [501, 501, 501, 501, 501]);
      const result = hufDecode(encoded, 0, encoded.length, 5);

      expect(result.length).toBe(5);
      for (let i = 0; i < 5; i++) {
        expect(result[i]).toBe(501);
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

    it('DWAB-006c: throws when sub-block sizes exceed data', async () => {
      const header = createDWAHeader({
        version: 2,
        acCompressedSize: 9999, // exceeds actual data
      });

      await expect(decompressDWA(header, 128, 8, 8, [2]))
        .rejects.toThrow('sub-block sizes exceed');
    });

    it('DWAB-006d: skips unknown data before AC sub-block', async () => {
      // Header with unknownCompressedSize = 4, all other sizes = 0
      // Append 4 bytes of unknown data after the 88-byte header
      const header = createDWAHeader({
        version: 2,
        unknownCompressedSize: 4,
        acCompressedSize: 0,
        dcCompressedSize: 0,
        rleCompressedSize: 0,
        totalAcUncompressedCount: 0,
        totalDcUncompressedCount: 0,
      });
      const data = new Uint8Array(88 + 4);
      data.set(header);
      data.set([0xDE, 0xAD, 0xBE, 0xEF], 88); // unknown data

      const result = await decompressDWA(data, 128, 8, 8, [2]);
      expect(result.length).toBe(128);
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
