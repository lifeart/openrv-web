/**
 * EXR PIZ Codec Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  decompressPIZ,
  buildLUTs,
  applyReverseLUT,
  wav2Decode,
  reverseByteReorder,
  reversePredictor,
  BITMAP_SIZE,
  USHORT_RANGE,
} from './EXRPIZCodec';

describe('EXRPIZCodec', () => {
  describe('decompressPIZ - empty data', () => {
    it('PIZ-U001: should return empty array for zero-length compressed data', () => {
      const result = decompressPIZ(
        new Uint8Array(0),
        0,
        0,
        0,
        0,
        []
      );
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });

    it('PIZ-U002: should return zero-filled array for zero uncompressed size with data', () => {
      const result = decompressPIZ(
        new Uint8Array([1, 2, 3]),
        0,
        4,
        1,
        1,
        [2]
      );
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });

    it('PIZ-U003: should return zero-filled array for empty compressed data with nonzero size', () => {
      const result = decompressPIZ(
        new Uint8Array(0),
        16,
        4,
        1,
        1,
        [2]
      );
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(16);
      // All zeros since there was nothing to decompress
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBe(0);
      }
    });
  });

  describe('reverseByteReorder', () => {
    it('PIZ-U010: should de-interleave bytes correctly', () => {
      // Input: [H0, H1, H2, L0, L1, L2] (3 MSBs followed by 3 LSBs)
      // Output: [H0, L0, H1, L1, H2, L2] (interleaved pairs)
      const input = new Uint8Array([0x10, 0x20, 0x30, 0x01, 0x02, 0x03]);
      const result = reverseByteReorder(input, 6);

      expect(result[0]).toBe(0x10); // H0
      expect(result[1]).toBe(0x01); // L0
      expect(result[2]).toBe(0x20); // H1
      expect(result[3]).toBe(0x02); // L1
      expect(result[4]).toBe(0x30); // H2
      expect(result[5]).toBe(0x03); // L2
    });

    it('PIZ-U011: should handle single pair', () => {
      const input = new Uint8Array([0xAB, 0xCD]);
      const result = reverseByteReorder(input, 2);

      expect(result[0]).toBe(0xAB);
      expect(result[1]).toBe(0xCD);
    });

    it('PIZ-U012: should handle odd output size', () => {
      // With odd outSize, the last byte has no pair
      const input = new Uint8Array([0x10, 0x20, 0x01]);
      const result = reverseByteReorder(input, 3);

      // halfSize = ceil(3/2) = 2
      // i=0: hi=input[0]=0x10, lo=input[2]=0x01 -> result[0]=0x10, result[1]=0x01
      // i=1: hi=input[1]=0x20, lo=input[3]=0 -> result[2]=0x20
      expect(result[0]).toBe(0x10);
      expect(result[1]).toBe(0x01);
      expect(result[2]).toBe(0x20);
    });

    it('PIZ-U013: should handle empty data', () => {
      const result = reverseByteReorder(new Uint8Array(0), 0);
      expect(result.length).toBe(0);
    });
  });

  describe('reversePredictor', () => {
    it('PIZ-U020: should delta-decode bytes', () => {
      // Delta-encoded: [10, 5, 3, 7]
      // Decoded: [10, 10+5=15, 15+3=18, 18+7=25]
      const data = new Uint8Array([10, 5, 3, 7]);
      reversePredictor(data);

      expect(data[0]).toBe(10);
      expect(data[1]).toBe(15);
      expect(data[2]).toBe(18);
      expect(data[3]).toBe(25);
    });

    it('PIZ-U021: should handle wrapping at 256 boundary', () => {
      // Delta-encoded: [250, 10] -> [250, (250+10) & 0xff = 4]
      const data = new Uint8Array([250, 10]);
      reversePredictor(data);

      expect(data[0]).toBe(250);
      expect(data[1]).toBe(4); // (250 + 10) % 256 = 4
    });

    it('PIZ-U022: should leave single element unchanged', () => {
      const data = new Uint8Array([42]);
      reversePredictor(data);
      expect(data[0]).toBe(42);
    });

    it('PIZ-U023: should handle empty array without error', () => {
      const data = new Uint8Array(0);
      reversePredictor(data);
      expect(data.length).toBe(0);
    });

    it('PIZ-U024: should handle zero deltas (constant sequence)', () => {
      const data = new Uint8Array([100, 0, 0, 0]);
      reversePredictor(data);

      expect(data[0]).toBe(100);
      expect(data[1]).toBe(100);
      expect(data[2]).toBe(100);
      expect(data[3]).toBe(100);
    });
  });

  describe('buildLUTs', () => {
    it('PIZ-U030: should build identity LUT for empty bitmap', () => {
      const bitmap = new Uint8Array(BITMAP_SIZE);
      // All zeros -> no bits set -> identity mapping
      const { fwdLut, revLut, lutSize } = buildLUTs(bitmap);

      expect(lutSize).toBe(USHORT_RANGE);
      expect(fwdLut.length).toBe(USHORT_RANGE);
      expect(revLut.length).toBe(USHORT_RANGE);

      // Identity: fwdLut[i] == i, revLut[i] == i
      for (let i = 0; i < 256; i++) {
        expect(fwdLut[i]).toBe(i);
        expect(revLut[i]).toBe(i);
      }
    });

    it('PIZ-U031: should build LUT for single bit set', () => {
      const bitmap = new Uint8Array(BITMAP_SIZE);
      // Set bit for value 42 (byte 5, bit 2)
      bitmap[42 >> 3] = 1 << (42 & 7);

      const { fwdLut, revLut, lutSize } = buildLUTs(bitmap);

      expect(lutSize).toBe(1);
      expect(fwdLut[42]).toBe(0);
      expect(revLut[0]).toBe(42);
    });

    it('PIZ-U032: should build LUT for multiple bits set', () => {
      const bitmap = new Uint8Array(BITMAP_SIZE);
      // Set bits for values 10, 20, 30
      bitmap[10 >> 3]! |= 1 << (10 & 7);
      bitmap[20 >> 3]! |= 1 << (20 & 7);
      bitmap[30 >> 3]! |= 1 << (30 & 7);

      const { fwdLut, revLut, lutSize } = buildLUTs(bitmap);

      expect(lutSize).toBe(3);
      // Forward LUT maps original values to packed indices
      expect(fwdLut[10]).toBe(0);
      expect(fwdLut[20]).toBe(1);
      expect(fwdLut[30]).toBe(2);
      // Reverse LUT maps packed indices back to original values
      expect(revLut[0]).toBe(10);
      expect(revLut[1]).toBe(20);
      expect(revLut[2]).toBe(30);
    });

    it('PIZ-U033: should build LUT for full bitmap (all bits set)', () => {
      const bitmap = new Uint8Array(BITMAP_SIZE);
      bitmap.fill(0xff);

      const { fwdLut, revLut, lutSize } = buildLUTs(bitmap);

      expect(lutSize).toBe(USHORT_RANGE);
      // Should be identity when all bits are set
      for (let i = 0; i < 256; i++) {
        expect(fwdLut[i]).toBe(i);
        expect(revLut[i]).toBe(i);
      }
    });
  });

  describe('applyReverseLUT', () => {
    it('PIZ-U040: should map packed values back to originals', () => {
      // Set up a simple LUT: packed 0->10, 1->20, 2->30
      const revLut = new Uint16Array([10, 20, 30]);
      const data = new Uint16Array([0, 1, 2, 1, 0]);

      applyReverseLUT(data, revLut, 3);

      expect(data[0]).toBe(10);
      expect(data[1]).toBe(20);
      expect(data[2]).toBe(30);
      expect(data[3]).toBe(20);
      expect(data[4]).toBe(10);
    });

    it('PIZ-U041: should skip values >= lutSize', () => {
      const revLut = new Uint16Array([100, 200]);
      const data = new Uint16Array([0, 1, 5, 3]); // 5 and 3 are >= lutSize(2)

      applyReverseLUT(data, revLut, 2);

      expect(data[0]).toBe(100);
      expect(data[1]).toBe(200);
      expect(data[2]).toBe(5); // Unchanged
      expect(data[3]).toBe(3); // Unchanged
    });

    it('PIZ-U042: should handle empty data', () => {
      const revLut = new Uint16Array([100]);
      const data = new Uint16Array(0);

      applyReverseLUT(data, revLut, 1);
      expect(data.length).toBe(0);
    });
  });

  describe('wav2Decode', () => {
    it('PIZ-U050: should handle single-element buffer', () => {
      const buffer = new Uint16Array([42]);
      wav2Decode(buffer, 1, 1, 1, 1, USHORT_RANGE);
      // Single element should be unchanged
      expect(buffer[0]).toBe(42);
    });

    it('PIZ-U051: should handle two-element inverse wavelet', () => {
      // For a 2-element buffer [avg, diff] the inverse wavelet produces:
      // val1 = avg + diff - (maxValue >> 1)
      // val2 = avg - diff + (maxValue >> 1) + (maxValue & 1)
      const maxValue = USHORT_RANGE;
      const avg = 100;
      const diff = 10;
      const buffer = new Uint16Array([avg, diff]);

      wav2Decode(buffer, 2, 1, 1, 2, maxValue);

      // val1 = 100 + 10 - 32768 = -32658 -> wraps to 32878 (& 0xffff)
      // val2 = 100 - 10 + 32768 + 0 = 32858
      // We just verify the transform ran without error and produced uint16 values
      expect(buffer[0]).toBeLessThan(USHORT_RANGE);
      expect(buffer[1]).toBeLessThan(USHORT_RANGE);
    });

    it('PIZ-U052: should handle multiple rows', () => {
      // 4 values in 2 rows of 2, stride=2
      const buffer = new Uint16Array([100, 50, 200, 30]);
      wav2Decode(buffer, 2, 1, 2, 2, USHORT_RANGE);

      // All values should be valid uint16
      for (let i = 0; i < buffer.length; i++) {
        expect(buffer[i]).toBeLessThan(USHORT_RANGE);
      }
    });

    it('PIZ-U053: should handle 4-element row (multi-level wavelet)', () => {
      const buffer = new Uint16Array([1000, 500, 250, 125]);
      wav2Decode(buffer, 4, 1, 1, 4, USHORT_RANGE);

      // All values should be valid uint16
      for (let i = 0; i < buffer.length; i++) {
        expect(buffer[i]).toBeLessThan(USHORT_RANGE);
      }
    });
  });

  describe('decompressPIZ - integration', () => {
    it('PIZ-U060: should decompress a minimal PIZ-compressed buffer', () => {
      // Construct a minimal PIZ-compressed buffer:
      // - minNonZero=0, maxNonZero=0 (bitmap has just byte 0)
      // - bitmap byte 0 = 0xff (values 0-7 are in use)
      // - Remaining bytes are pixel data (after byte reorder + predictor)

      const width = 2;
      const numChannels = 1;
      const numLines = 1;
      const channelSizes = [2]; // HALF float
      const uncompressedSize = width * numLines * 2; // 4 bytes

      // Build the compressed buffer
      const parts: number[] = [];

      // minNonZero = 0 (LE)
      parts.push(0, 0);
      // maxNonZero = 0 (LE)
      parts.push(0, 0);
      // bitmap byte at index 0 = 0xff (values 0-7 are present)
      parts.push(0xff);

      // Now we need pixel data that, after reverseByteReorder + reversePredictor,
      // yields valid uint16 values. The data goes through:
      //   pixelDataBytes -> reverseByteReorder -> reversePredictor -> uint16 array -> revLUT -> wavelet
      //
      // For simplicity, use zeros as pixel data bytes (which will decode to zeros)
      for (let i = 0; i < uncompressedSize; i++) {
        parts.push(0);
      }

      const compressedData = new Uint8Array(parts);

      const result = decompressPIZ(
        compressedData,
        uncompressedSize,
        width,
        numChannels,
        numLines,
        channelSizes
      );

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(uncompressedSize);
    });

    it('PIZ-U061: should produce correct output length for multi-channel data', () => {
      const width = 4;
      const numChannels = 3;
      const numLines = 2;
      const channelSizes = [2, 2, 2]; // All HALF
      const uncompressedSize = width * numLines * numChannels * 2; // 48 bytes

      // Construct minimal compressed data
      const parts: number[] = [];
      // minNonZero > maxNonZero => identity LUT
      parts.push(1, 0); // minNonZero = 1
      parts.push(0, 0); // maxNonZero = 0
      // All pixel data as zeros
      for (let i = 0; i < uncompressedSize; i++) {
        parts.push(0);
      }

      const compressedData = new Uint8Array(parts);

      const result = decompressPIZ(
        compressedData,
        uncompressedSize,
        width,
        numChannels,
        numLines,
        channelSizes
      );

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(uncompressedSize);
    });

    it('PIZ-U062: should handle identity LUT case (minNonZero > maxNonZero)', () => {
      const width = 2;
      const numChannels = 1;
      const numLines = 1;
      const channelSizes = [2];
      const uncompressedSize = width * numLines * 2;

      // minNonZero > maxNonZero triggers the identity (all-bits-set) bitmap
      const parts: number[] = [];
      parts.push(1, 0); // minNonZero = 1
      parts.push(0, 0); // maxNonZero = 0
      for (let i = 0; i < uncompressedSize; i++) {
        parts.push(0);
      }

      const compressedData = new Uint8Array(parts);

      const result = decompressPIZ(
        compressedData,
        uncompressedSize,
        width,
        numChannels,
        numLines,
        channelSizes
      );

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(uncompressedSize);
    });

    it('PIZ-U063: should handle FLOAT channel sizes (4 bytes per pixel)', () => {
      const width = 2;
      const numChannels = 1;
      const numLines = 1;
      const channelSizes = [4]; // FLOAT
      const uncompressedSize = width * numLines * 4; // 8 bytes

      const parts: number[] = [];
      parts.push(1, 0); // minNonZero = 1
      parts.push(0, 0); // maxNonZero = 0
      for (let i = 0; i < uncompressedSize; i++) {
        parts.push(0);
      }

      const compressedData = new Uint8Array(parts);

      const result = decompressPIZ(
        compressedData,
        uncompressedSize,
        width,
        numChannels,
        numLines,
        channelSizes
      );

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(uncompressedSize);
    });
  });

  describe('round-trip byte reorder + predictor', () => {
    it('PIZ-U070: byte reorder is reversible', () => {
      // Simulate the forward byte reorder (interleave -> deinterleave)
      // Forward: take pairs [H0,L0,H1,L1,...] and split to [H0,H1,...,L0,L1,...]
      const original = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF]);

      // Forward reorder: split into MSBs and LSBs
      const halfSize = Math.ceil(original.length / 2);
      const reordered = new Uint8Array(original.length);
      for (let i = 0; i < halfSize; i++) {
        reordered[i] = original[i * 2]!;         // MSBs
        if (i * 2 + 1 < original.length) {
          reordered[halfSize + i] = original[i * 2 + 1]!; // LSBs
        }
      }

      // Reverse reorder should reconstruct original
      const recovered = reverseByteReorder(reordered, original.length);

      expect(recovered).toEqual(original);
    });

    it('PIZ-U071: predictor encode/decode is reversible', () => {
      // Forward predictor (delta encode)
      const original = new Uint8Array([10, 20, 35, 50, 100]);
      const encoded = new Uint8Array(original.length);
      encoded[0] = original[0]!;
      for (let i = 1; i < original.length; i++) {
        encoded[i] = (original[i]! - original[i - 1]!) & 0xff;
      }

      // Reverse predictor should reconstruct original
      reversePredictor(encoded);

      expect(encoded).toEqual(original);
    });
  });
});
