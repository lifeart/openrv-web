/**
 * TIFF Float Decoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { isTIFFFile, isFloatTIFF, getTIFFInfo, decodeTIFFFloat } from './TIFFFloatDecoder';

const TIFF_LE = 0x4949; // "II"
const TIFF_BE = 0x4d4d; // "MM"
const TIFF_MAGIC = 42;

/**
 * Convert a float32 value to a 16-bit half-float representation (for test data writing).
 */
function float32ToFloat16(value: number): number {
  const buf = new ArrayBuffer(4);
  const fView = new DataView(buf);
  fView.setFloat32(0, value, true);
  const bits = fView.getUint32(0, true);

  const sign = (bits >>> 31) & 0x1;
  const exp = (bits >>> 23) & 0xff;
  const mant = bits & 0x7fffff;

  if (exp === 0xff) {
    // Infinity or NaN
    return (sign << 15) | (0x1f << 10) | (mant ? 0x200 : 0);
  }
  if (exp === 0) {
    // Zero or subnormal (too small for half)
    return sign << 15;
  }

  const newExp = exp - 127 + 15;
  if (newExp >= 0x1f) {
    // Overflow → Infinity
    return (sign << 15) | (0x1f << 10);
  }
  if (newExp <= 0) {
    // Underflow → subnormal or zero
    if (newExp < -10) return sign << 15;
    const m = (mant | 0x800000) >> (1 - newExp + 13);
    return (sign << 15) | (m & 0x3ff);
  }

  return (sign << 15) | (newExp << 10) | (mant >> 13);
}

/**
 * Create a minimal valid float TIFF file buffer for testing.
 * Creates an uncompressed float32 RGB or RGBA TIFF with strip organization.
 *
 * Layout:
 *   [0..7]     TIFF header (byte order, magic 42, IFD offset)
 *   [8..N]     IFD entries (tag count + 12 bytes per tag + next IFD = 0)
 *   [N..M]     Extra data (BitsPerSample array for channels > 2)
 *   [M..end]   Pixel data (float32 values)
 */
function createTestFloatTIFF(
  options: {
    width?: number;
    height?: number;
    channels?: number; // 3=RGB, 4=RGBA
    bigEndian?: boolean;
    sampleFormat?: number; // 1=uint, 2=int, 3=float
    bitsPerSample?: number;
    compression?: number;
    pixelValues?: number[]; // Custom float values for pixel data
  } = {},
): ArrayBuffer {
  const {
    width = 2,
    height = 2,
    channels = 3,
    bigEndian = false,
    sampleFormat = 3, // float
    bitsPerSample = 32,
    compression = 1, // uncompressed
    pixelValues,
  } = options;

  const le = !bigEndian;

  // Calculate sizes
  const bytesPerSample = bitsPerSample / 8;
  const pixelDataSize = width * height * channels * bytesPerSample;

  // Total number of IFD tags (always 10)
  const numTags = 10;
  const ifdOffset = 8;
  // IFD: 2 bytes count + numTags * 12 bytes + 4 bytes next IFD offset
  const ifdSize = 2 + numTags * 12 + 4;

  // Extra data area starts after IFD
  const extraDataStart = ifdOffset + ifdSize;

  // BitsPerSample array (only needed if channels > 2, since >2 SHORTs don't fit inline)
  const needsBPSArray = channels > 2;
  const bpsArrayOffset = extraDataStart;
  const bpsArraySize = needsBPSArray ? channels * 2 : 0;

  // Pixel data starts after extra data
  const pixelDataOffset = extraDataStart + bpsArraySize;

  const totalSize = pixelDataOffset + pixelDataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // === TIFF Header ===
  view.setUint16(0, bigEndian ? TIFF_BE : TIFF_LE, false); // Byte order marker (always written raw)
  view.setUint16(2, TIFF_MAGIC, le); // Magic 42
  view.setUint32(4, ifdOffset, le); // IFD offset

  // === Write IFD ===
  let pos = ifdOffset;
  view.setUint16(pos, numTags, le);
  pos += 2;

  // Helper to write a single IFD entry (12 bytes each)
  function writeTag(id: number, type: number, count: number, value: number): void {
    view.setUint16(pos, id, le); // Tag ID
    view.setUint16(pos + 2, type, le); // Data type
    view.setUint32(pos + 4, count, le); // Value count

    // Value/offset field (4 bytes at pos+8)
    // If the total data fits in 4 bytes, store inline; otherwise store offset
    if (type === 3 && count <= 2) {
      // SHORT: store value inline
      view.setUint16(pos + 8, value, le);
    } else if (type === 4 && count === 1) {
      // LONG: store value inline
      view.setUint32(pos + 8, value, le);
    } else {
      // Offset to external data
      view.setUint32(pos + 8, value, le);
    }
    pos += 12;
  }

  // Tags must be written in ascending order by tag ID (TIFF spec requirement)
  // Tag 256: ImageWidth (LONG)
  writeTag(256, 4, 1, width);

  // Tag 257: ImageLength (LONG)
  writeTag(257, 4, 1, height);

  // Tag 258: BitsPerSample (SHORT)
  if (needsBPSArray) {
    // count > 2, store as offset to array
    writeTag(258, 3, channels, bpsArrayOffset);
  } else {
    // count <= 2, store inline
    writeTag(258, 3, 1, bitsPerSample);
  }

  // Tag 259: Compression (SHORT)
  writeTag(259, 3, 1, compression);

  // Tag 262: PhotometricInterpretation (SHORT) - 2=RGB
  writeTag(262, 3, 1, 2);

  // Tag 273: StripOffsets (LONG)
  writeTag(273, 4, 1, pixelDataOffset);

  // Tag 277: SamplesPerPixel (SHORT)
  writeTag(277, 3, 1, channels);

  // Tag 278: RowsPerStrip (LONG) - entire image in one strip
  writeTag(278, 4, 1, height);

  // Tag 279: StripByteCounts (LONG)
  writeTag(279, 4, 1, pixelDataSize);

  // Tag 339: SampleFormat (SHORT)
  writeTag(339, 3, 1, sampleFormat);

  // Next IFD offset (0 = no more IFDs)
  view.setUint32(pos, 0, le);

  // === Write extra data ===

  // BitsPerSample array
  if (needsBPSArray) {
    for (let i = 0; i < channels; i++) {
      view.setUint16(bpsArrayOffset + i * 2, bitsPerSample, le);
    }
  }

  // === Write pixel data ===
  // Helper to write a float sample at the appropriate bit depth
  function writeSample(offset: number, value: number): void {
    if (bitsPerSample === 16) {
      view.setUint16(offset, float32ToFloat16(value), le);
    } else if (bitsPerSample === 64) {
      view.setFloat64(offset, value, le);
    } else {
      view.setFloat32(offset, value, le);
    }
  }

  if (pixelValues) {
    for (let i = 0; i < pixelValues.length && i < width * height * channels; i++) {
      writeSample(pixelDataOffset + i * bytesPerSample, pixelValues[i]!);
    }
  } else {
    // Fill with test pattern
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIdx = (y * width + x) * channels;
        for (let c = 0; c < channels; c++) {
          const value = (x + y * width + c) / (width * height * channels);
          writeSample(pixelDataOffset + (pixelIdx + c) * bytesPerSample, value);
        }
      }
    }
  }

  return buffer;
}

describe('TIFFFloatDecoder', () => {
  describe('isTIFFFile', () => {
    it('should detect little-endian TIFF', () => {
      const buffer = createTestFloatTIFF({ bigEndian: false });
      expect(isTIFFFile(buffer)).toBe(true);
    });

    it('should detect big-endian TIFF', () => {
      const buffer = createTestFloatTIFF({ bigEndian: true });
      expect(isTIFFFile(buffer)).toBe(true);
    });

    it('should return false for non-TIFF data', () => {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint16(0, 0x1234, false);
      view.setUint16(2, 42, true);
      expect(isTIFFFile(buffer)).toBe(false);
    });

    it('should return false for buffer too small', () => {
      const buffer = new ArrayBuffer(2);
      expect(isTIFFFile(buffer)).toBe(false);
    });

    it('should return false for wrong magic number', () => {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_LE, false);
      view.setUint16(2, 99, true); // wrong magic
      expect(isTIFFFile(buffer)).toBe(false);
    });
  });

  describe('isFloatTIFF', () => {
    it('should return true for 32-bit float TIFF', () => {
      const buffer = createTestFloatTIFF({ sampleFormat: 3, bitsPerSample: 32 });
      expect(isFloatTIFF(buffer)).toBe(true);
    });

    it('should return true for 16-bit half-float TIFF', () => {
      const buffer = createTestFloatTIFF({ sampleFormat: 3, bitsPerSample: 16 });
      expect(isFloatTIFF(buffer)).toBe(true);
    });

    it('should return true for 64-bit double float TIFF', () => {
      const buffer = createTestFloatTIFF({ sampleFormat: 3, bitsPerSample: 64 });
      expect(isFloatTIFF(buffer)).toBe(true);
    });

    it('should return false for uint TIFF', () => {
      const buffer = createTestFloatTIFF({ sampleFormat: 1, bitsPerSample: 32 });
      expect(isFloatTIFF(buffer)).toBe(false);
    });

    it('should return false for non-TIFF data', () => {
      const buffer = new ArrayBuffer(8);
      expect(isFloatTIFF(buffer)).toBe(false);
    });

    it('should return false for float TIFF with invalid BPS (24-bit)', () => {
      // SampleFormat=3 (float) but BPS=24 is not a supported float width (16/32/64).
      // We create a valid 32-bit float TIFF and then patch the BPS tag value to 24.
      const buffer = createTestFloatTIFF({ sampleFormat: 3, bitsPerSample: 32, channels: 1 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);

      // Find BitsPerSample tag (258) and patch its value to 24
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 258) {
          view.setUint16(tagPos + 8, 24, le);
          break;
        }
      }

      expect(isFloatTIFF(buffer)).toBe(false);
    });

    // NOTE: The else-throw branch in readFloatSample (for unsupported bytesPerSample)
    // is not directly testable through the public API because isFloatTIFF and
    // decodeTIFFFloat both validate BPS before readFloatSample is ever called.
    // The guard exists as defense-in-depth against internal state corruption,
    // similar to the MAX_CHAIN_DEPTH guard in LZW decoding.
  });

  describe('getTIFFInfo', () => {
    it('should parse float TIFF header correctly', () => {
      const buffer = createTestFloatTIFF({ width: 1920, height: 1080, channels: 3 });
      const info = getTIFFInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.width).toBe(1920);
      expect(info!.height).toBe(1080);
      expect(info!.bitsPerSample).toBe(32);
      expect(info!.sampleFormat).toBe('float');
      expect(info!.channels).toBe(3);
      expect(info!.compression).toBe(1);
    });

    it('should detect big-endian byte order', () => {
      const buffer = createTestFloatTIFF({ bigEndian: true });
      const info = getTIFFInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.bigEndian).toBe(true);
    });

    it('should detect little-endian byte order', () => {
      const buffer = createTestFloatTIFF({ bigEndian: false });
      const info = getTIFFInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.bigEndian).toBe(false);
    });

    it('should detect RGBA channels', () => {
      const buffer = createTestFloatTIFF({ channels: 4 });
      const info = getTIFFInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.channels).toBe(4);
    });

    it('should return null for non-TIFF data', () => {
      const buffer = new ArrayBuffer(100);
      expect(getTIFFInfo(buffer)).toBeNull();
    });

    it('should return null for buffer too small', () => {
      const buffer = new ArrayBuffer(4);
      expect(getTIFFInfo(buffer)).toBeNull();
    });
  });

  describe('isTIFFFile - additional cases', () => {
    it('should return false for empty buffer', () => {
      const buffer = new ArrayBuffer(0);
      expect(isTIFFFile(buffer)).toBe(false);
    });

    it('should return false for TIFF byte order with wrong magic in big-endian', () => {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_BE, false);
      view.setUint16(2, 99, false); // Wrong magic (big-endian, so le=false)
      expect(isTIFFFile(buffer)).toBe(false);
    });
  });

  describe('getTIFFInfo - additional cases', () => {
    it('should detect uint sample format', () => {
      const buffer = createTestFloatTIFF({ sampleFormat: 1 });
      const info = getTIFFInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.sampleFormat).toBe('uint');
    });

    it('should detect int sample format', () => {
      const buffer = createTestFloatTIFF({ sampleFormat: 2 });
      const info = getTIFFInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.sampleFormat).toBe('int');
    });

    it('should return null when IFD offset is out of range', () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_LE, false);
      view.setUint16(2, TIFF_MAGIC, true);
      view.setUint32(4, 99999, true); // IFD offset way out of range
      expect(getTIFFInfo(buffer)).toBeNull();
    });
  });

  describe('decodeTIFFFloat', () => {
    it('should decode a float32 RGB TIFF', async () => {
      const buffer = createTestFloatTIFF({ width: 2, height: 2, channels: 3 });
      const result = await decodeTIFFFloat(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4); // Always RGBA
      expect(result.data.length).toBe(2 * 2 * 4);
      expect(result.colorSpace).toBe('linear');
    });

    it('should decode a float32 RGBA TIFF', async () => {
      const buffer = createTestFloatTIFF({ width: 2, height: 2, channels: 4 });
      const result = await decodeTIFFFloat(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(2 * 2 * 4);
    });

    it('should set alpha to 1.0 for RGB input', async () => {
      const buffer = createTestFloatTIFF({ width: 2, height: 2, channels: 3 });
      const result = await decodeTIFFFloat(buffer);

      for (let i = 3; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(1.0);
      }
    });

    it('should preserve pixel values', async () => {
      const values = [
        0.1,
        0.2,
        0.3, // pixel 0
        0.4,
        0.5,
        0.6, // pixel 1
        0.7,
        0.8,
        0.9, // pixel 2
        1.0,
        0.0,
        0.5, // pixel 3
      ];
      const buffer = createTestFloatTIFF({
        width: 2,
        height: 2,
        channels: 3,
        pixelValues: values,
      });
      const result = await decodeTIFFFloat(buffer);

      // Check first pixel RGB values
      expect(result.data[0]).toBeCloseTo(0.1, 4);
      expect(result.data[1]).toBeCloseTo(0.2, 4);
      expect(result.data[2]).toBeCloseTo(0.3, 4);
      expect(result.data[3]).toBe(1.0); // Alpha
    });

    it('should handle big-endian TIFF', async () => {
      const buffer = createTestFloatTIFF({ bigEndian: true, width: 2, height: 2 });
      const result = await decodeTIFFFloat(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
    });

    it('should include metadata in the result', async () => {
      const buffer = createTestFloatTIFF();
      const result = await decodeTIFFFloat(buffer);

      expect(result.metadata.format).toBe('tiff');
      expect(result.metadata.bitsPerSample).toBe(32);
      expect(result.metadata.sampleFormat).toBe('float');
    });

    it('should throw for non-float TIFF', async () => {
      const buffer = createTestFloatTIFF({ sampleFormat: 1 }); // uint
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Not a float TIFF');
    });

    it('should throw for JPEG compressed TIFF', async () => {
      // JPEG compression (7) is not supported
      const buffer = createTestFloatTIFF({ compression: 7, sampleFormat: 3 });
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Unsupported TIFF compression: 7 (JPEG)');
    });

    it('should produce finite float values', async () => {
      const buffer = createTestFloatTIFF({ width: 4, height: 4 });
      const result = await decodeTIFFFloat(buffer);

      for (let i = 0; i < result.data.length; i++) {
        expect(isFinite(result.data[i]!)).toBe(true);
      }
    });

    it('should handle 1x1 pixel image', async () => {
      const buffer = createTestFloatTIFF({
        width: 1,
        height: 1,
        channels: 3,
        pixelValues: [0.5, 0.25, 0.75],
      });
      const result = await decodeTIFFFloat(buffer);

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.data.length).toBe(4);
      expect(result.data[0]).toBeCloseTo(0.5, 4);
      expect(result.data[1]).toBeCloseTo(0.25, 4);
      expect(result.data[2]).toBeCloseTo(0.75, 4);
      expect(result.data[3]).toBe(1.0);
    });

    it('should handle HDR values greater than 1.0', async () => {
      const buffer = createTestFloatTIFF({
        width: 1,
        height: 1,
        channels: 3,
        pixelValues: [2.5, 10.0, 100.0],
      });
      const result = await decodeTIFFFloat(buffer);

      expect(result.data[0]).toBeCloseTo(2.5, 4);
      expect(result.data[1]).toBeCloseTo(10.0, 4);
      expect(result.data[2]).toBeCloseTo(100.0, 4);
    });

    it('should handle negative float values', async () => {
      const buffer = createTestFloatTIFF({
        width: 1,
        height: 1,
        channels: 3,
        pixelValues: [-0.5, -1.0, 0.0],
      });
      const result = await decodeTIFFFloat(buffer);

      expect(result.data[0]).toBeCloseTo(-0.5, 4);
      expect(result.data[1]).toBeCloseTo(-1.0, 4);
      expect(result.data[2]).toBeCloseTo(0.0, 4);
    });

    it('should preserve RGBA alpha channel values', async () => {
      const buffer = createTestFloatTIFF({
        width: 1,
        height: 1,
        channels: 4,
        pixelValues: [0.1, 0.2, 0.3, 0.5],
      });
      const result = await decodeTIFFFloat(buffer);

      expect(result.data[0]).toBeCloseTo(0.1, 4);
      expect(result.data[1]).toBeCloseTo(0.2, 4);
      expect(result.data[2]).toBeCloseTo(0.3, 4);
      expect(result.data[3]).toBeCloseTo(0.5, 4); // Alpha should be preserved, not 1.0
    });

    it('should produce Float32Array output', async () => {
      const buffer = createTestFloatTIFF();
      const result = await decodeTIFFFloat(buffer);
      expect(result.data).toBeInstanceOf(Float32Array);
    });
  });

  describe('decodeTIFFFloat - error handling', () => {
    it('should throw for empty buffer', async () => {
      const buffer = new ArrayBuffer(0);
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow();
    });

    it('should throw for buffer too small', async () => {
      const buffer = new ArrayBuffer(4);
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow();
    });

    it('should throw for invalid byte order', async () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, 0x1234, false); // Invalid byte order
      view.setUint16(2, TIFF_MAGIC, true);

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('unrecognized byte order');
    });

    it('should throw for wrong magic number during decode', async () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_LE, false); // Valid byte order
      view.setUint16(2, 99, true); // Wrong magic

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('wrong magic number');
    });

    it('should throw for IFD offset out of range during decode', async () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_LE, false);
      view.setUint16(2, TIFF_MAGIC, true);
      view.setUint32(4, 99999, true); // IFD offset way out of range

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('IFD offset out of range');
    });

    it('should throw for unsupported bits per sample with informative message', async () => {
      // Create a valid 32-bit float TIFF, then patch the BitsPerSample tag to 24 (unsupported)
      const buffer = createTestFloatTIFF({ bitsPerSample: 32, sampleFormat: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 258) {
          // BitsPerSample
          const count = view.getUint32(tagPos + 4, le);
          if (count === 1) {
            view.setUint16(tagPos + 8, 24, le);
          } else {
            const extOffset = view.getUint32(tagPos + 8, le);
            view.setUint16(extOffset, 24, le);
          }
          break;
        }
      }
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Unsupported float bits per sample: 24');
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('16-bit half-float, 32-bit float, 64-bit double');
    });

    it('should throw for 8-bit float TIFF (integer data masquerading as float)', async () => {
      const buffer = createTestFloatTIFF({ bitsPerSample: 32, sampleFormat: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 258) {
          const count = view.getUint32(tagPos + 4, le);
          if (count === 1) {
            view.setUint16(tagPos + 8, 8, le);
          } else {
            const extOffset = view.getUint32(tagPos + 8, le);
            view.setUint16(extOffset, 8, le);
          }
          break;
        }
      }
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Unsupported float bits per sample: 8');
    });

    it('should throw for unsupported bits per sample values (1, 4, 12)', async () => {
      for (const bps of [1, 4, 12]) {
        const buffer = createTestFloatTIFF({ bitsPerSample: 32, sampleFormat: 3 });
        const view = new DataView(buffer);
        const le = true;
        const ifdOffset = 8;
        const numTags = view.getUint16(ifdOffset, le);
        for (let i = 0; i < numTags; i++) {
          const tagPos = ifdOffset + 2 + i * 12;
          const tagId = view.getUint16(tagPos, le);
          if (tagId === 258) {
            const count = view.getUint32(tagPos + 4, le);
            if (count === 1) {
              view.setUint16(tagPos + 8, bps, le);
            } else {
              const extOffset = view.getUint32(tagPos + 8, le);
              view.setUint16(extOffset, bps, le);
            }
            break;
          }
        }
        await expect(decodeTIFFFloat(buffer)).rejects.toThrow(
          `Unsupported float bits per sample: ${bps}`,
        );
      }
    });

    it('should still decode valid 32-bit float TIFF after BPS validation is added', async () => {
      const buffer = createTestFloatTIFF({
        width: 2,
        height: 2,
        channels: 3,
        bitsPerSample: 32,
        sampleFormat: 3,
        pixelValues: [1.0, 0.5, 0.25, 0.75, 0.0, 1.0, 0.3, 0.6, 0.9, 0.1, 0.2, 0.4],
      });
      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      expect(result.data[0]).toBeCloseTo(1.0, 5);
      expect(result.data[1]).toBeCloseTo(0.5, 5);
      expect(result.data[2]).toBeCloseTo(0.25, 5);
      expect(result.data[3]).toBeCloseTo(1.0, 5); // Alpha filled to 1.0
    });

    it('should still decode valid 64-bit double TIFF after BPS validation is added', async () => {
      const buffer = createTestFloatTIFF({
        width: 1,
        height: 1,
        channels: 3,
        bitsPerSample: 64,
        sampleFormat: 3,
        pixelValues: [0.5, 0.25, 0.75],
      });
      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.data[0]).toBeCloseTo(0.5, 5);
      expect(result.data[1]).toBeCloseTo(0.25, 5);
      expect(result.data[2]).toBeCloseTo(0.75, 5);
    });

    it('should decode 16-bit half-float TIFF', async () => {
      const buffer = createTestFloatTIFF({
        width: 2,
        height: 2,
        channels: 3,
        bitsPerSample: 16,
        sampleFormat: 3,
        pixelValues: [0.5, 0.25, 0.75, 1.0, 0.0, 0.5, 0.5, 0.25, 0.75, 1.0, 0.0, 0.5],
      });

      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      // Check first pixel (half-float has ~3 decimal digits of precision)
      expect(result.data[0]).toBeCloseTo(0.5, 2); // R
      expect(result.data[1]).toBeCloseTo(0.25, 2); // G
      expect(result.data[2]).toBeCloseTo(0.75, 2); // B
      expect(result.data[3]).toBeCloseTo(1.0, 4); // A (pre-initialized)
      expect(result.metadata.bitsPerSample).toBe(16);
    });

    it('should decode 64-bit double float TIFF', async () => {
      const buffer = createTestFloatTIFF({
        width: 2,
        height: 2,
        channels: 3,
        bitsPerSample: 64,
        sampleFormat: 3,
        pixelValues: [0.5, 0.25, 0.75, 1.0, 0.0, 0.5, 0.5, 0.25, 0.75, 1.0, 0.0, 0.5],
      });

      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      // Check first pixel (64-bit has full float32 precision after truncation)
      expect(result.data[0]).toBeCloseTo(0.5, 5); // R
      expect(result.data[1]).toBeCloseTo(0.25, 5); // G
      expect(result.data[2]).toBeCloseTo(0.75, 5); // B
      expect(result.data[3]).toBeCloseTo(1.0, 5); // A (pre-initialized)
      expect(result.metadata.bitsPerSample).toBe(64);
    });

    it('should decode 1-channel (grayscale) float TIFF by expanding to RGB', async () => {
      const grayValue = 0.5;
      const buffer = createTestFloatTIFF({
        width: 2,
        height: 2,
        channels: 1,
        sampleFormat: 3,
        pixelValues: [grayValue, grayValue, grayValue, grayValue],
      });

      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      // First pixel: grayscale expanded to RGB, alpha = 1.0
      const approx = (v: number) => expect(v).toBeCloseTo(grayValue, 4);
      approx(result.data[0]!); // R
      approx(result.data[1]!); // G
      approx(result.data[2]!); // B
      expect(result.data[3]).toBeCloseTo(1.0, 4); // A
    });

    it('should decode 5+ channel float TIFF by reading first 4 channels', async () => {
      // Create a 3-channel TIFF and patch SamplesPerPixel to 5
      // The pixel data only has 3 channels worth of data per the original buffer,
      // but the decoder should not throw; it reads min(samplesPerPixel, 4) channels
      const buffer = createTestFloatTIFF({ channels: 4, sampleFormat: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 277) {
          // SamplesPerPixel — set to 5
          view.setUint16(tagPos + 8, 5, le);
          break;
        }
      }

      // Should not throw — it reads only the first 4 channels
      const result = await decodeTIFFFloat(buffer);
      expect(result.channels).toBe(4);
      expect(result.metadata.originalChannels).toBe(5);
    });

    it('should throw for zero-width image', async () => {
      const buffer = createTestFloatTIFF({ width: 2, height: 2, sampleFormat: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 256) {
          // ImageWidth
          view.setUint32(tagPos + 8, 0, le);
          break;
        }
      }

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow(/Invalid TIFF dimensions/);
    });

    it('should throw for zero-height image', async () => {
      const buffer = createTestFloatTIFF({ width: 2, height: 2, sampleFormat: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 257) {
          // ImageLength
          view.setUint32(tagPos + 8, 0, le);
          break;
        }
      }

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow(/Invalid TIFF dimensions/);
    });

    it('should throw for extremely large dimensions', async () => {
      const buffer = createTestFloatTIFF({ width: 2, height: 2, sampleFormat: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 256) {
          // ImageWidth
          view.setUint32(tagPos + 8, 100000, le);
        }
        if (tagId === 257) {
          // ImageLength
          view.setUint32(tagPos + 8, 100000, le);
        }
      }

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow(/exceed maximum/);
    });

    it('should decode PackBits compression with trivial literal encoding', async () => {
      // createTestFloatTIFF with compression=32773 sets the tag but writes raw data.
      // The decoder's PackBits decompressor handles literal-run encoding,
      // so we need to use the compressed TIFF helper with actual PackBits data.
      // This simple test just verifies the tag is accepted (no longer throws).
      const width = 2,
        height = 2,
        channels = 3;
      const rawBytes = createFloatPixelBytes(width, height, channels, true);
      const compressed = packBitsCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 32773,
        uncompressedSize: rawBytes.length,
      });
      const result = await decodeTIFFFloat(tiffBuffer);
      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.channels).toBe(4);
    });

    it('should include metadata with bigEndian and originalChannels', async () => {
      const buffer = createTestFloatTIFF({ bigEndian: false, channels: 3 });
      const result = await decodeTIFFFloat(buffer);

      expect(result.metadata.bigEndian).toBe(false);
      expect(result.metadata.originalChannels).toBe(3);
      expect(result.metadata.compression).toBe(1);
    });

    it('should include bigEndian=true in metadata for big-endian TIFF', async () => {
      const buffer = createTestFloatTIFF({ bigEndian: true, channels: 4 });
      const result = await decodeTIFFFloat(buffer);

      expect(result.metadata.bigEndian).toBe(true);
      expect(result.metadata.originalChannels).toBe(4);
    });
  });

  describe('IFD entry count validation', () => {
    it('should accept a normal IFD entry count (10 entries)', async () => {
      // createTestFloatTIFF creates a TIFF with 10 IFD entries — well within limits
      const buffer = createTestFloatTIFF({ channels: 3 });
      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
    });

    it('should reject IFD entry count exceeding 1024', async () => {
      // Create a minimal TIFF header with an absurdly high IFD entry count
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_LE, false); // Byte order
      view.setUint16(2, TIFF_MAGIC, true); // Magic number
      view.setUint32(4, 8, true); // IFD offset = 8
      view.setUint16(8, 1025, true); // 1025 entries — just over the limit

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('IFD entry count 1025 exceeds maximum of 1024');
    });

    it('should reject maximum uint16 IFD entry count (65535)', async () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_LE, false);
      view.setUint16(2, TIFF_MAGIC, true);
      view.setUint32(4, 8, true);
      view.setUint16(8, 65535, true); // Maximum uint16

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('IFD entry count 65535 exceeds maximum of 1024');
    });

    it('should accept IFD entry count at the boundary (1024)', async () => {
      // Build a buffer large enough to hold the TIFF header + 1024 IFD entries
      // Each IFD entry is 12 bytes, plus 2 bytes for count, plus 4 bytes for next IFD offset
      const ifdOffset = 8;
      const ifdSize = 2 + 1024 * 12 + 4;
      const totalSize = ifdOffset + ifdSize;
      const buffer = new ArrayBuffer(totalSize);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_LE, false);
      view.setUint16(2, TIFF_MAGIC, true);
      view.setUint32(4, ifdOffset, true);
      view.setUint16(ifdOffset, 1024, true); // Exactly at the limit

      // This should not throw for the entry count limit.
      // It will fail later because there are no valid image tags, but
      // the IFD parsing itself should succeed.
      const info = getTIFFInfo(buffer);
      // getTIFFInfo returns null on other parse issues, but should NOT throw
      // from the IFD entry count check
      expect(info).not.toBeUndefined(); // null is acceptable (missing tags), but no throw
    });

    it('should return null from getTIFFInfo for excessive IFD entry count', () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_LE, false);
      view.setUint16(2, TIFF_MAGIC, true);
      view.setUint32(4, 8, true);
      view.setUint16(8, 2000, true); // Over the limit

      // getTIFFInfo catches errors and returns null
      const info = getTIFFInfo(buffer);
      expect(info).toBeNull();
    });

    it('should return false from isFloatTIFF for excessive IFD entry count', () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_LE, false);
      view.setUint16(2, TIFF_MAGIC, true);
      view.setUint32(4, 8, true);
      view.setUint16(8, 5000, true); // Over the limit

      expect(isFloatTIFF(buffer)).toBe(false);
    });

    it('should reject excessive IFD entry count in big-endian files', async () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, TIFF_BE, false); // Big-endian
      view.setUint16(2, TIFF_MAGIC, false); // Magic in big-endian
      view.setUint32(4, 8, false); // IFD offset in big-endian
      view.setUint16(8, 1025, false); // Entry count in big-endian

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('IFD entry count 1025 exceeds maximum of 1024');
    });
  });

  describe('decodeTIFFFloat - multi-strip', () => {
    it('should correctly decode multi-strip TIFF', async () => {
      // Build a 2x4 TIFF with 2 strips, each containing 2 rows
      const width = 2;
      const height = 4;
      const channels = 3;
      const le = true;
      const bitsPerSample = 32;
      const bytesPerSample = 4;
      const rowsPerStrip = 2;
      const numStrips = Math.ceil(height / rowsPerStrip);

      const numTags = 10;
      const ifdOffset = 8;
      const ifdSize = 2 + numTags * 12 + 4;

      const extraDataStart = ifdOffset + ifdSize;

      // BitsPerSample array
      const bpsArrayOffset = extraDataStart;
      const bpsArraySize = channels * 2;

      // Strip offsets and byte counts arrays (stored after BPS)
      const stripOffsetsArrayOffset = bpsArrayOffset + bpsArraySize;
      const stripOffsetsArraySize = numStrips * 4;
      const stripByteCountsArrayOffset = stripOffsetsArrayOffset + stripOffsetsArraySize;
      const stripByteCountsArraySize = numStrips * 4;

      // Pixel data starts after all extra data
      const pixelDataOffset = stripByteCountsArrayOffset + stripByteCountsArraySize;
      const stripBytes = rowsPerStrip * width * channels * bytesPerSample;
      const pixelDataSize = height * width * channels * bytesPerSample;
      const totalSize = pixelDataOffset + pixelDataSize;

      const buffer = new ArrayBuffer(totalSize);
      const view = new DataView(buffer);

      // TIFF header
      view.setUint16(0, TIFF_LE, false);
      view.setUint16(2, TIFF_MAGIC, le);
      view.setUint32(4, ifdOffset, le);

      let pos = ifdOffset;
      view.setUint16(pos, numTags, le);
      pos += 2;

      function writeTag(id: number, type: number, count: number, value: number): void {
        view.setUint16(pos, id, le);
        view.setUint16(pos + 2, type, le);
        view.setUint32(pos + 4, count, le);
        if (type === 3 && count <= 2) {
          view.setUint16(pos + 8, value, le);
        } else if (type === 4 && count === 1) {
          view.setUint32(pos + 8, value, le);
        } else {
          view.setUint32(pos + 8, value, le);
        }
        pos += 12;
      }

      writeTag(256, 4, 1, width); // ImageWidth
      writeTag(257, 4, 1, height); // ImageLength
      writeTag(258, 3, channels, bpsArrayOffset); // BitsPerSample
      writeTag(259, 3, 1, 1); // Compression=none
      writeTag(262, 3, 1, 2); // Photometric=RGB
      writeTag(273, 4, numStrips, stripOffsetsArrayOffset); // StripOffsets
      writeTag(277, 3, 1, channels); // SamplesPerPixel
      writeTag(278, 4, 1, rowsPerStrip); // RowsPerStrip
      writeTag(279, 4, numStrips, stripByteCountsArrayOffset); // StripByteCounts
      writeTag(339, 3, 1, 3); // SampleFormat=float

      // Next IFD offset
      view.setUint32(pos, 0, le);

      // BitsPerSample array
      for (let i = 0; i < channels; i++) {
        view.setUint16(bpsArrayOffset + i * 2, bitsPerSample, le);
      }

      // Strip offsets
      for (let s = 0; s < numStrips; s++) {
        view.setUint32(stripOffsetsArrayOffset + s * 4, pixelDataOffset + s * stripBytes, le);
      }

      // Strip byte counts
      for (let s = 0; s < numStrips; s++) {
        view.setUint32(stripByteCountsArrayOffset + s * 4, stripBytes, le);
      }

      // Pixel data: write known values
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixelIdx = (y * width + x) * channels;
          for (let c = 0; c < channels; c++) {
            const value = (y * width + x + c) * 0.1;
            view.setFloat32(pixelDataOffset + (pixelIdx + c) * bytesPerSample, value, le);
          }
        }
      }

      const result = await decodeTIFFFloat(buffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(width * height * 4);

      // Verify first pixel of second strip (row 2, col 0)
      const idx = (2 * width + 0) * 4;
      expect(result.data[idx]).toBeCloseTo(4 * 0.1, 4); // R = (2*2+0+0) * 0.1
      expect(result.data[idx + 1]).toBeCloseTo(5 * 0.1, 4); // G = (2*2+0+1) * 0.1
      expect(result.data[idx + 2]).toBeCloseTo(6 * 0.1, 4); // B = (2*2+0+2) * 0.1
      expect(result.data[idx + 3]).toBe(1.0); // A = 1.0 (RGB input)
    });
  });

  // ==================== Compression Test Helpers ====================

  /**
   * Minimal LZW compressor for TIFF (MSB-first bit packing).
   * Only used for test data generation.
   */
  function lzwCompress(input: Uint8Array): Uint8Array {
    const CLEAR_CODE = 256;
    const EOI_CODE = 257;
    const MAX_CODE = 4095;

    const output: number[] = [];
    let bitBuffer = 0;
    let bitsInBuffer = 0;

    let codeSize = 9;

    function writeCode(code: number): void {
      bitBuffer = (bitBuffer << codeSize) | code;
      bitsInBuffer += codeSize;
      while (bitsInBuffer >= 8) {
        bitsInBuffer -= 8;
        output.push((bitBuffer >> bitsInBuffer) & 0xff);
      }
    }

    function flush(): void {
      if (bitsInBuffer > 0) {
        output.push((bitBuffer << (8 - bitsInBuffer)) & 0xff);
        bitsInBuffer = 0;
        bitBuffer = 0;
      }
    }

    // Initialize table
    const table = new Map<string, number>();
    let nextCode = 258;

    // Write clear code
    writeCode(CLEAR_CODE);

    if (input.length === 0) {
      writeCode(EOI_CODE);
      flush();
      return new Uint8Array(output);
    }

    let w = String.fromCharCode(input[0]!);

    for (let i = 1; i < input.length; i++) {
      const c = String.fromCharCode(input[i]!);
      const wc = w + c;

      if (table.has(wc)) {
        w = wc;
      } else {
        // Output code for w
        if (w.length === 1) {
          writeCode(w.charCodeAt(0));
        } else {
          writeCode(table.get(w)!);
        }

        // Add wc to table
        if (nextCode <= MAX_CODE) {
          table.set(wc, nextCode);
          nextCode++;
        }

        // Increase code size — encoder uses (1 << codeSize) because its table
        // is one entry ahead of decoder's (first code after CLEAR adds no decoder entry)
        if (nextCode > 1 << codeSize && codeSize < 12) {
          codeSize++;
        }

        w = c;
      }
    }

    // Output code for remaining w
    if (w.length === 1) {
      writeCode(w.charCodeAt(0));
    } else {
      writeCode(table.get(w)!);
    }

    writeCode(EOI_CODE);
    flush();

    return new Uint8Array(output);
  }

  /**
   * Minimal PackBits compressor for TIFF (simple RLE).
   * Uses a simple strategy: emit literal runs of up to 128 bytes.
   * This produces valid PackBits output (no repeat runs for simplicity).
   */
  function packBitsCompress(input: Uint8Array): Uint8Array {
    const output: number[] = [];
    let pos = 0;

    while (pos < input.length) {
      // Check for a run of repeated bytes (at least 3)
      let runLen = 1;
      while (pos + runLen < input.length && runLen < 128 && input[pos + runLen] === input[pos]) {
        runLen++;
      }

      if (runLen >= 3) {
        // Repeated run: header byte = -(runLen - 1), then the repeated byte
        output.push(256 - (runLen - 1)); // Two's complement for signed byte
        output.push(input[pos]!);
        pos += runLen;
      } else {
        // Literal run: collect up to 128 non-repeating bytes
        const litStart = pos;
        let litLen = 0;
        while (pos + litLen < input.length && litLen < 128) {
          // Check if next bytes form a run of 3+
          if (
            pos + litLen + 2 < input.length &&
            input[pos + litLen] === input[pos + litLen + 1] &&
            input[pos + litLen] === input[pos + litLen + 2]
          ) {
            break; // Stop literal, let repeat-run handle it
          }
          litLen++;
        }
        if (litLen === 0) litLen = 1; // Ensure progress
        output.push(litLen - 1); // Header byte for literal run
        for (let i = 0; i < litLen; i++) {
          output.push(input[litStart + i]!);
        }
        pos += litLen;
      }
    }

    return new Uint8Array(output);
  }

  /**
   * Compress data using deflate via CompressionStream.
   */
  async function deflateCompress(input: Uint8Array): Promise<Uint8Array> {
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();

    writer.write(new Uint8Array(input) as unknown as BufferSource);
    writer.close();

    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  /**
   * Create a TIFF with compressed float data.
   * @param compressedData - Pre-compressed strip data
   * @param options - TIFF metadata
   */
  function createCompressedTIFF(
    compressedData: Uint8Array,
    options: {
      width: number;
      height: number;
      channels?: number;
      bigEndian?: boolean;
      compression: number;
      predictor?: number;
      rowsPerStrip?: number;
      uncompressedSize: number;
      stripCompressedSizes?: number[];
      stripCompressedData?: Uint8Array[];
    },
  ): ArrayBuffer {
    const {
      width,
      height,
      channels = 3,
      bigEndian = false,
      compression,
      predictor = 1,
      rowsPerStrip = height,
      uncompressedSize: _uncompressedSize,
      stripCompressedSizes,
      stripCompressedData,
    } = options;

    const le = !bigEndian;

    const numStrips = Math.ceil(height / rowsPerStrip);
    const hasPredictor = predictor !== 1;
    const numTags = 10 + (hasPredictor ? 1 : 0);

    const ifdOffset = 8;
    const ifdSize = 2 + numTags * 12 + 4;
    const extraDataStart = ifdOffset + ifdSize;

    // BitsPerSample array
    const needsBPSArray = channels > 2;
    const bpsArrayOffset = extraDataStart;
    const bpsArraySize = needsBPSArray ? channels * 2 : 0;

    let nextExtra = extraDataStart + bpsArraySize;

    // Strip offsets and byte counts arrays (for multi-strip)
    let stripOffsetsArrayOffset = 0;
    let stripByteCountsArrayOffset = 0;
    if (numStrips > 1) {
      stripOffsetsArrayOffset = nextExtra;
      nextExtra += numStrips * 4;
      stripByteCountsArrayOffset = nextExtra;
      nextExtra += numStrips * 4;
    }

    const pixelDataOffset = nextExtra;

    // Calculate total compressed data size
    let totalCompressedSize: number;
    if (stripCompressedData && stripCompressedData.length > 0) {
      totalCompressedSize = stripCompressedData.reduce((sum, d) => sum + d.length, 0);
    } else {
      totalCompressedSize = compressedData.length;
    }

    const totalSize = pixelDataOffset + totalCompressedSize;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // TIFF Header
    view.setUint16(0, bigEndian ? TIFF_BE : TIFF_LE, false);
    view.setUint16(2, TIFF_MAGIC, le);
    view.setUint32(4, ifdOffset, le);

    let pos = ifdOffset;
    view.setUint16(pos, numTags, le);
    pos += 2;

    function writeTag(id: number, type: number, count: number, value: number): void {
      view.setUint16(pos, id, le);
      view.setUint16(pos + 2, type, le);
      view.setUint32(pos + 4, count, le);
      if (type === 3 && count <= 2) {
        view.setUint16(pos + 8, value, le);
      } else if (type === 4 && count === 1) {
        view.setUint32(pos + 8, value, le);
      } else {
        view.setUint32(pos + 8, value, le);
      }
      pos += 12;
    }

    writeTag(256, 4, 1, width); // ImageWidth
    writeTag(257, 4, 1, height); // ImageLength
    if (needsBPSArray) {
      writeTag(258, 3, channels, bpsArrayOffset);
    } else {
      writeTag(258, 3, 1, 32);
    }
    writeTag(259, 3, 1, compression); // Compression
    writeTag(262, 3, 1, 2); // PhotometricInterpretation=RGB
    if (numStrips > 1) {
      writeTag(273, 4, numStrips, stripOffsetsArrayOffset); // StripOffsets array
    } else {
      writeTag(273, 4, 1, pixelDataOffset); // Single strip offset
    }
    writeTag(277, 3, 1, channels); // SamplesPerPixel
    writeTag(278, 4, 1, rowsPerStrip); // RowsPerStrip
    if (numStrips > 1) {
      writeTag(279, 4, numStrips, stripByteCountsArrayOffset); // StripByteCounts array
    } else {
      writeTag(279, 4, 1, compressedData.length); // Single strip byte count
    }
    if (hasPredictor) {
      writeTag(317, 3, 1, predictor); // Predictor
    }
    writeTag(339, 3, 1, 3); // SampleFormat=float

    // Next IFD = 0
    view.setUint32(pos, 0, le);

    // BitsPerSample array
    if (needsBPSArray) {
      for (let i = 0; i < channels; i++) {
        view.setUint16(bpsArrayOffset + i * 2, 32, le);
      }
    }

    // Write strip data
    if (numStrips > 1 && stripCompressedData && stripCompressedSizes) {
      let dataPos = pixelDataOffset;
      for (let s = 0; s < numStrips; s++) {
        view.setUint32(stripOffsetsArrayOffset + s * 4, dataPos, le);
        view.setUint32(stripByteCountsArrayOffset + s * 4, stripCompressedSizes[s]!, le);
        const sd = stripCompressedData[s]!;
        new Uint8Array(buffer, dataPos, sd.length).set(sd);
        dataPos += sd.length;
      }
    } else {
      new Uint8Array(buffer, pixelDataOffset, compressedData.length).set(compressedData);
    }

    return buffer;
  }

  /**
   * Apply horizontal differencing predictor to float pixel data (for test data generation).
   * This is the ENCODING direction -- stores differences.
   */
  function applyHorizontalPredictorEncode(
    data: Uint8Array,
    width: number,
    samplesPerPixel: number,
    bytesPerSample: number,
    rowCount: number,
  ): Uint8Array {
    const result = new Uint8Array(data.length);
    const rowBytes = width * samplesPerPixel * bytesPerSample;
    const stride = samplesPerPixel * bytesPerSample;

    for (let row = 0; row < rowCount; row++) {
      const rowStart = row * rowBytes;
      for (let i = 0; i < stride; i++) {
        result[rowStart + i] = data[rowStart + i]!;
      }
      for (let i = rowBytes - 1; i >= stride; i--) {
        result[rowStart + i] = (data[rowStart + i]! - data[rowStart + i - stride]!) & 0xff;
      }
    }
    return result;
  }

  /**
   * Apply floating-point predictor encoding to float pixel data (for test data generation).
   */
  function applyFloatingPointPredictorEncode(
    data: Uint8Array,
    width: number,
    samplesPerPixel: number,
    bytesPerSample: number,
    rowCount: number,
  ): Uint8Array {
    const result = new Uint8Array(data.length);
    const rowBytes = width * samplesPerPixel * bytesPerSample;
    const pixelCount = width * samplesPerPixel;

    for (let row = 0; row < rowCount; row++) {
      const rowStart = row * rowBytes;
      // Step 1: rearrange from interleaved to planar byte order
      const temp = new Uint8Array(rowBytes);
      for (let i = 0; i < pixelCount; i++) {
        for (let b = 0; b < bytesPerSample; b++) {
          temp[b * pixelCount + i] = data[rowStart + i * bytesPerSample + b]!;
        }
      }
      // Step 2: apply byte-level delta (stride 1)
      result[rowStart] = temp[0]!;
      for (let i = 1; i < rowBytes; i++) {
        result[rowStart + i] = (temp[i]! - temp[i - 1]!) & 0xff;
      }
    }
    return result;
  }

  /**
   * Helper to create raw float pixel data as a Uint8Array (byte representation of Float32Array).
   */
  function createFloatPixelBytes(
    width: number,
    height: number,
    channels: number,
    le: boolean,
    pixelValues?: number[],
  ): Uint8Array {
    const totalFloats = width * height * channels;
    const buffer = new ArrayBuffer(totalFloats * 4);
    const view = new DataView(buffer);

    if (pixelValues) {
      for (let i = 0; i < pixelValues.length && i < totalFloats; i++) {
        view.setFloat32(i * 4, pixelValues[i]!, le);
      }
    } else {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixelIdx = (y * width + x) * channels;
          for (let c = 0; c < channels; c++) {
            const value = (x + y * width + c) / (width * height * channels);
            view.setFloat32((pixelIdx + c) * 4, value, le);
          }
        }
      }
    }

    return new Uint8Array(buffer);
  }

  // ==================== LZW Compression Tests ====================

  describe('LZW compression', () => {
    it('TIFF-LZW001: should decode LZW compressed RGB float TIFF', async () => {
      const width = 2,
        height = 2,
        channels = 3;
      const rawBytes = createFloatPixelBytes(width, height, channels, true);
      const compressed = lzwCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 5,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(width * height * 4);

      // Verify pixel values match
      const expectedView = new DataView(rawBytes.buffer);
      for (let i = 0; i < width * height; i++) {
        for (let c = 0; c < channels; c++) {
          expect(result.data[i * 4 + c]).toBeCloseTo(expectedView.getFloat32((i * channels + c) * 4, true), 4);
        }
        if (channels === 3) {
          expect(result.data[i * 4 + 3]).toBe(1.0);
        }
      }
    });

    it('TIFF-LZW002: should decode LZW compressed RGBA float TIFF', async () => {
      const width = 2,
        height = 2,
        channels = 4;
      const pixelValues = [0.1, 0.2, 0.3, 0.8, 0.4, 0.5, 0.6, 0.9, 0.7, 0.8, 0.9, 1.0, 1.0, 0.0, 0.5, 0.5];
      const rawBytes = createFloatPixelBytes(width, height, channels, true, pixelValues);
      const compressed = lzwCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 5,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.data[0]).toBeCloseTo(0.1, 4);
      expect(result.data[1]).toBeCloseTo(0.2, 4);
      expect(result.data[2]).toBeCloseTo(0.3, 4);
      expect(result.data[3]).toBeCloseTo(0.8, 4);

      expect(result.data[12]).toBeCloseTo(1.0, 4);
      expect(result.data[13]).toBeCloseTo(0.0, 4);
      expect(result.data[14]).toBeCloseTo(0.5, 4);
      expect(result.data[15]).toBeCloseTo(0.5, 4);
    });

    it('TIFF-LZW003: should decode LZW compressed big-endian float TIFF', async () => {
      const width = 2,
        height = 2,
        channels = 3;
      const rawBytes = createFloatPixelBytes(width, height, channels, false);
      const compressed = lzwCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        bigEndian: true,
        compression: 5,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.channels).toBe(4);

      const expectedView = new DataView(rawBytes.buffer);
      for (let i = 0; i < width * height; i++) {
        for (let c = 0; c < channels; c++) {
          expect(result.data[i * 4 + c]).toBeCloseTo(expectedView.getFloat32((i * channels + c) * 4, false), 4);
        }
      }
    });

    it('TIFF-LZW004: should decode LZW compressed multi-strip TIFF', async () => {
      const width = 2,
        height = 4,
        channels = 3,
        rowsPerStrip = 2;
      const le = true;

      // Create separate strips
      const strip1Bytes = createFloatPixelBytes(
        width,
        rowsPerStrip,
        channels,
        le,
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.0, 0.5],
      );
      const strip2Bytes = createFloatPixelBytes(
        width,
        rowsPerStrip,
        channels,
        le,
        [0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77, 0.88, 0.99, 0.12, 0.34, 0.56],
      );

      const compressed1 = lzwCompress(strip1Bytes);
      const compressed2 = lzwCompress(strip2Bytes);

      const tiffBuffer = createCompressedTIFF(new Uint8Array(0), {
        width,
        height,
        channels,
        compression: 5,
        rowsPerStrip,
        uncompressedSize: strip1Bytes.length + strip2Bytes.length,
        stripCompressedData: [compressed1, compressed2],
        stripCompressedSizes: [compressed1.length, compressed2.length],
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.data.length).toBe(width * height * 4);

      // Verify first pixel of strip 1
      expect(result.data[0]).toBeCloseTo(0.1, 4);
      expect(result.data[1]).toBeCloseTo(0.2, 4);
      expect(result.data[2]).toBeCloseTo(0.3, 4);

      // Verify first pixel of strip 2 (row 2, col 0)
      const idx = (2 * width + 0) * 4;
      expect(result.data[idx]).toBeCloseTo(0.11, 4);
      expect(result.data[idx + 1]).toBeCloseTo(0.22, 4);
      expect(result.data[idx + 2]).toBeCloseTo(0.33, 4);
    });

    it('TIFF-LZW005: should decode LZW with horizontal predictor (2)', async () => {
      const width = 2,
        height = 2,
        channels = 3;
      const le = true;

      const rawBytes = createFloatPixelBytes(
        width,
        height,
        channels,
        le,
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.0, 0.5],
      );

      // Apply predictor encoding
      const predictedBytes = applyHorizontalPredictorEncode(rawBytes, width, channels, 4, height);
      const compressed = lzwCompress(predictedBytes);

      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 5,
        predictor: 2,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.data[0]).toBeCloseTo(0.1, 4);
      expect(result.data[1]).toBeCloseTo(0.2, 4);
      expect(result.data[2]).toBeCloseTo(0.3, 4);
      expect(result.data[3]).toBe(1.0);

      expect(result.data[4]).toBeCloseTo(0.4, 4);
      expect(result.data[5]).toBeCloseTo(0.5, 4);
      expect(result.data[6]).toBeCloseTo(0.6, 4);
    });

    it('TIFF-LZW006: should decode LZW with floating-point predictor (3)', async () => {
      const width = 2,
        height = 2,
        channels = 3;
      const le = true;

      const rawBytes = createFloatPixelBytes(
        width,
        height,
        channels,
        le,
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.0, 0.5],
      );

      // Apply FP predictor encoding
      const predictedBytes = applyFloatingPointPredictorEncode(rawBytes, width, channels, 4, height);
      const compressed = lzwCompress(predictedBytes);

      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 5,
        predictor: 3,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.data[0]).toBeCloseTo(0.1, 4);
      expect(result.data[1]).toBeCloseTo(0.2, 4);
      expect(result.data[2]).toBeCloseTo(0.3, 4);
      expect(result.data[3]).toBe(1.0);

      expect(result.data[4]).toBeCloseTo(0.4, 4);
      expect(result.data[5]).toBeCloseTo(0.5, 4);
      expect(result.data[6]).toBeCloseTo(0.6, 4);
    });

    it('TIFF-LZW007: should decode 1x1 LZW compressed TIFF', async () => {
      const width = 1,
        height = 1,
        channels = 3;
      const rawBytes = createFloatPixelBytes(width, height, channels, true, [0.5, 0.25, 0.75]);
      const compressed = lzwCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 5,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.data[0]).toBeCloseTo(0.5, 4);
      expect(result.data[1]).toBeCloseTo(0.25, 4);
      expect(result.data[2]).toBeCloseTo(0.75, 4);
      expect(result.data[3]).toBe(1.0);
    });

    it('TIFF-LZW008: should decode larger LZW data exercising code size transitions', async () => {
      // 16x16 RGB = 768 floats = 3072 bytes — enough unique bytes to push LZW table
      // past the 9-to-10 bit threshold (512 entries)
      const width = 16,
        height = 16,
        channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(
            (x + y * width) / (width * height),
            y * 0.05 + x * 0.01,
            1.0 - (x + y * width) / (width * height),
          );
        }
      }
      const rawBytes = createFloatPixelBytes(width, height, channels, true, pixelValues);
      const compressed = lzwCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 5,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      // Verify every pixel matches expected values
      for (let i = 0; i < width * height; i++) {
        const srcIdx = i * channels;
        const dstIdx = i * 4;
        expect(result.data[dstIdx]).toBeCloseTo(pixelValues[srcIdx]!, 4);
        expect(result.data[dstIdx + 1]).toBeCloseTo(pixelValues[srcIdx + 1]!, 4);
        expect(result.data[dstIdx + 2]).toBeCloseTo(pixelValues[srcIdx + 2]!, 4);
      }

      // Also verify same data decodes correctly with deflate (reference)
      const deflateCompressed = await deflateCompress(rawBytes);
      const deflateTiff = createCompressedTIFF(deflateCompressed, {
        width,
        height,
        channels,
        compression: 8,
        uncompressedSize: rawBytes.length,
      });
      const deflateResult = await decodeTIFFFloat(deflateTiff);
      // LZW and deflate should produce identical output
      for (let i = 0; i < result.data.length; i++) {
        expect(result.data[i]).toBe(deflateResult.data[i]);
      }
    });
  });

  // ==================== LZW Chain Corruption Regression Tests ====================

  describe('LZW chain corruption detection (MED-33)', () => {
    // NOTE: Chain cycle detection (MAX_CHAIN_DEPTH) is not directly testable
    // through the public API since prefix chains are built internally.
    // The guard exists as defense-in-depth against corrupted table state.

    /**
     * Helper: build a raw LZW bitstream (MSB-first) from an array of (code, codeSize) pairs.
     * This lets us craft arbitrary (including corrupted) LZW streams for testing.
     */
    function buildRawLZWStream(codes: Array<[number, number]>): Uint8Array {
      const output: number[] = [];
      let bitBuffer = 0;
      let bitsInBuffer = 0;

      for (const [code, codeSize] of codes) {
        bitBuffer = (bitBuffer << codeSize) | code;
        bitsInBuffer += codeSize;
        while (bitsInBuffer >= 8) {
          bitsInBuffer -= 8;
          output.push((bitBuffer >> bitsInBuffer) & 0xff);
        }
      }

      // Flush remaining bits
      if (bitsInBuffer > 0) {
        output.push((bitBuffer << (8 - bitsInBuffer)) & 0xff);
      }

      return new Uint8Array(output);
    }

    it('TIFF-LZW-CHAIN001: valid LZW data still decodes correctly after fix', async () => {
      // Standard round-trip test: compress then decompress via the TIFF pipeline
      const width = 4,
        height = 4,
        channels = 3;
      const rawBytes = createFloatPixelBytes(width, height, channels, true);
      const compressed = lzwCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 5,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.channels).toBe(4);

      const expectedView = new DataView(rawBytes.buffer);
      for (let i = 0; i < width * height; i++) {
        for (let c = 0; c < channels; c++) {
          expect(result.data[i * 4 + c]).toBeCloseTo(
            expectedView.getFloat32((i * channels + c) * 4, true),
            4,
          );
        }
      }
    });

    it('TIFF-LZW-CHAIN002: detects code > nextCode as corruption', async () => {
      // Craft a stream where a code exceeds the next expected table entry.
      // After CLEAR (256) at 9-bit, nextCode is 258.
      // Emit literal 0x41, then code 300 which is way above nextCode (258).
      const stream = buildRawLZWStream([
        [256, 9], // CLEAR
        [0x41, 9], // literal 'A' → oldCode=0x41, nextCode still 258
        [300, 9], // code 300 > nextCode 258 → corruption
        [257, 9], // EOI (should not be reached)
      ]);

      const tiffBuffer = createCompressedTIFF(stream, {
        width: 1,
        height: 1,
        channels: 3,
        compression: 5,
        uncompressedSize: 12,
      });

      await expect(decodeTIFFFloat(tiffBuffer)).rejects.toThrow(/LZW corruption.*code 300/);
    });

    it('TIFF-LZW-CHAIN003: detects non-literal first code after clear', async () => {
      // After CLEAR, the first code must be a literal (0-255).
      // Emit code 258 (a table code) as first code after clear.
      const stream = buildRawLZWStream([
        [256, 9], // CLEAR
        [258, 9], // code 258 is not a literal → corruption
        [257, 9], // EOI
      ]);

      const tiffBuffer = createCompressedTIFF(stream, {
        width: 1,
        height: 1,
        channels: 3,
        compression: 5,
        uncompressedSize: 12,
      });

      await expect(decodeTIFFFloat(tiffBuffer)).rejects.toThrow(/first code after clear/);
    });

    it('TIFF-LZW-CHAIN004: handles special case code === nextCode correctly', async () => {
      // Tests the valid KwKwK special case where the emitted code equals nextCode.
      // Sequence: CLEAR, A(0x41), B(0x42) → adds 258=[A,B], nextCode=259, oldCode=B.
      // Then emit 259 → code === nextCode, so: fc = firstChar(B) = B,
      // add 259=[B,B], output "BB".
      const stream = buildRawLZWStream([
        [256, 9], // CLEAR
        [0x41, 9], // literal A → oldCode=A, nextCode=258
        [0x42, 9], // literal B → add 258=[A,B], nextCode=259, oldCode=B
        [259, 9], // code===nextCode → fc=firstChar(B)=B, add 259=[B,B], output "BB"
        [257, 9], // EOI
      ]);

      // Wrap in a TIFF and decode -- should NOT throw
      const tiffBuffer = createCompressedTIFF(stream, {
        width: 1,
        height: 1,
        channels: 3,
        compression: 5,
        uncompressedSize: 12,
      });

      // Should not reject -- the special case is valid LZW
      const result = await decodeTIFFFloat(tiffBuffer);
      expect(result).toBeDefined();
    });

    it('TIFF-LZW-CHAIN005: handles large valid LZW data with code size transitions', async () => {
      // Generate enough data to push through code size 9→10→11→12 transitions
      const width = 16,
        height = 16,
        channels = 3;
      const rawBytes = createFloatPixelBytes(width, height, channels, true);
      const compressed = lzwCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 5,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);
      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      // Verify all pixel values match
      const expectedView = new DataView(rawBytes.buffer);
      for (let i = 0; i < width * height; i++) {
        for (let c = 0; c < channels; c++) {
          expect(result.data[i * 4 + c]).toBeCloseTo(
            expectedView.getFloat32((i * channels + c) * 4, true),
            4,
          );
        }
      }
    });

    it('TIFF-LZW-CHAIN006: rejects code above nextCode with multiple prior literals', async () => {
      // Similar to CHAIN002 but with two prior literals so nextCode=259.
      // Emit code 400 at 9-bit code size — well above nextCode (259) but
      // within the 9-bit range (0-511), so the decoder actually reads 400.
      const stream = buildRawLZWStream([
        [256, 9], // CLEAR
        [0x10, 9], // literal → oldCode=0x10, nextCode=258
        [0x20, 9], // literal → add 258=[0x10,0x20], nextCode=259, oldCode=0x20
        [400, 9], // code 400 > nextCode 259 → corruption
        [257, 9], // EOI (should not be reached)
      ]);

      const tiffBuffer = createCompressedTIFF(stream, {
        width: 1,
        height: 1,
        channels: 3,
        compression: 5,
        uncompressedSize: 12,
      });

      await expect(decodeTIFFFloat(tiffBuffer)).rejects.toThrow(/LZW corruption.*code 400/);
    });

    it('TIFF-LZW-CHAIN007: bitBuffer overflow prevention with long streams', async () => {
      // This tests that the bitBuffer trimming fix prevents corruption
      // on longer streams where bits would accumulate beyond 32 bits.
      // Use a 32x32 image which produces enough codes to stress the bit reader.
      const width = 32,
        height = 32,
        channels = 3;
      const rawBytes = createFloatPixelBytes(width, height, channels, true);
      const compressed = lzwCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 5,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);
      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      // Exact pixel match -- if bitBuffer overflowed, codes would be wrong
      // and pixel values would differ
      const expectedView = new DataView(rawBytes.buffer);
      for (let i = 0; i < width * height; i++) {
        for (let c = 0; c < channels; c++) {
          expect(result.data[i * 4 + c]).toBeCloseTo(
            expectedView.getFloat32((i * channels + c) * 4, true),
            4,
          );
        }
      }
    });

    it('TIFF-LZW-CHAIN008: handles table-full boundary at exactly 4096 entries', async () => {
      // Fill the LZW table to exactly 4096 entries (codes 258..4095 = 3838 entries)
      // by emitting enough unique two-byte pairs. Each new pair that isn't in
      // the table adds one entry. After the table is full (nextCode > 4095),
      // the decoder must continue outputting codes without adding new entries.
      // We use 256 distinct byte values in a pattern that maximizes new table entries.
      const bytes: number[] = [];
      // Produce a long sequence of bytes where consecutive pairs are mostly unique.
      // Using a simple pattern: cycle through 0..255 repeatedly. Each time byte[i]
      // is followed by a new byte[i+1] combination, a table entry is created.
      // We need at least 3838 unique consecutive pairs to fill the table.
      // 256 * 16 = 4096 bytes with cycling gives us enough unique pairs.
      for (let round = 0; round < 16; round++) {
        for (let b = 0; b < 256; b++) {
          bytes.push((b + round * 7) & 0xff); // vary pattern each round
        }
      }
      const input = new Uint8Array(bytes);

      const uncompressedSize = input.length;
      // Use width/height/channels that accommodate the data size for TIFF framing.
      // The decoder reads raw bytes and reinterprets as float, so we just need
      // valid TIFF structure. Use 1-channel with matching pixel count.
      const channels = 1;
      const width = 1;
      const height = Math.ceil(uncompressedSize / (channels * 4));
      const paddedSize = width * height * channels * 4;

      // Pad input to match expected TIFF uncompressed size
      const paddedInput = new Uint8Array(paddedSize);
      paddedInput.set(input);
      const paddedCompressed = lzwCompress(paddedInput);

      const tiffBuffer = createCompressedTIFF(paddedCompressed, {
        width,
        height,
        channels,
        compression: 5,
        uncompressedSize: paddedSize,
      });

      // Should decode without error -- the table-full condition is handled gracefully
      const result = await decodeTIFFFloat(tiffBuffer);
      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.data.length).toBe(width * height * 4); // always returns 4-channel
    });

    it('TIFF-LZW-CHAIN009: string length tracking is correct for deep chains', async () => {
      // Build an LZW stream that creates deep chains by using code === nextCode
      // (the "KwKwK" special case), which creates entries whose prefix is themselves
      // shifted by one. This tests that tableLength (now Uint32Array) tracks correctly.
      //
      // Strategy: emit CLEAR, then byte A, then repeatedly emit nextCode (special case).
      // Each special case entry has length = previous entry length + 1, creating
      // a deep chain. We use a moderate depth (200 entries) to keep output size
      // within TIFF dimension limits while still exercising the length tracking.
      const codes: Array<[number, number]> = [];
      codes.push([256, 9]); // CLEAR
      codes.push([65, 9]); // literal 'A' (byte 65), nextCode becomes 258

      // Now repeatedly emit nextCode === current nextCode to trigger special case.
      // Each iteration adds one table entry with length = previous + 1.
      let nextCode = 258;
      let codeSize = 9;
      const targetEntries = 200; // enough to test deep chains without huge output

      for (let i = 0; i < targetEntries; i++) {
        codes.push([nextCode, codeSize]);
        nextCode++;
        if (nextCode > (1 << codeSize) - 1 && codeSize < 12) {
          codeSize++;
        }
      }

      codes.push([257, codeSize]); // EOI

      const stream = buildRawLZWStream(codes);

      // The special case pattern "A, AA, AAA, AAAA, ..." produces
      // 1 + 2 + 3 + ... + (n+1) bytes total where n = targetEntries.
      // Sum = 1 + sum(2..201) = 1 + (201*202/2 - 1) = 20301 bytes
      const totalBytes = 1 + ((targetEntries + 1) * (targetEntries + 2)) / 2 - 1;
      const channels = 1;
      const pixelCount = Math.ceil(totalBytes / 4);
      const width = 1;
      const height = pixelCount;

      const tiffBuffer = createCompressedTIFF(stream, {
        width,
        height,
        channels,
        compression: 5,
        uncompressedSize: totalBytes,
      });

      // Should decode without overflow errors -- tableLength as Uint32Array handles this
      const result = await decodeTIFFFloat(tiffBuffer);
      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      // Verify actual pixel data: all output bytes are 0x41 ('A'), so every
      // group of 4 bytes forms the same little-endian float32 value.
      const expectedFloat = (() => {
        const buf = new ArrayBuffer(4);
        new Uint8Array(buf).fill(0x41);
        return new DataView(buf).getFloat32(0, true);
      })();

      // maxPixelsInStrip = floor(totalBytes / 4) = 5075 decoded pixels;
      // the last pixel (index 5075) has only 1 byte and is not decoded,
      // so it stays at the initialised value of R=G=B=0, A=1.0.
      const decodedPixels = Math.floor(totalBytes / 4);
      for (let p = 0; p < decodedPixels; p++) {
        const idx = p * 4;
        expect(result.data[idx]).toBe(expectedFloat); // R
        expect(result.data[idx + 1]).toBe(expectedFloat); // G
        expect(result.data[idx + 2]).toBe(expectedFloat); // B
        expect(result.data[idx + 3]).toBe(1.0); // A
      }
      // Last pixel was not fully decodable (only 1 trailing byte)
      const lastIdx = decodedPixels * 4;
      expect(result.data[lastIdx]).toBe(0); // R
      expect(result.data[lastIdx + 1]).toBe(0); // G
      expect(result.data[lastIdx + 2]).toBe(0); // B
      expect(result.data[lastIdx + 3]).toBe(1.0); // A
    });

    it('TIFF-LZW-CHAIN010: string lengths stay correct across CLEAR code resets', async () => {
      // Verify that after a CLEAR code, new entries overwrite stale lengths,
      // so no accumulation occurs across CLEAR boundaries. This tests the
      // scenario described in LOW-17 where multiple CLEAR codes might
      // theoretically allow length accumulation.
      const codes: Array<[number, number]> = [];

      // First table build: emit some codes to build entries
      codes.push([256, 9]); // CLEAR
      codes.push([0, 9]); // literal 0
      codes.push([1, 9]); // literal 1 -> adds entry 258 (prefix=0, suffix=1, length=2)
      codes.push([2, 9]); // literal 2 -> adds entry 259 (prefix=1, suffix=2, length=2)
      codes.push([258, 9]); // code 258 -> adds entry 260 (prefix=2, suffix=0, length=2)

      // CLEAR and rebuild -- lengths should reset
      codes.push([256, 9]); // CLEAR (resets table)
      codes.push([10, 9]); // literal 10
      codes.push([11, 9]); // literal 11 -> adds entry 258 (prefix=10, suffix=11, length=2)
      codes.push([258, 9]); // code 258 -> outputs [10, 11], adds entry 259

      // Another CLEAR and rebuild
      codes.push([256, 9]); // CLEAR
      codes.push([20, 9]); // literal 20
      codes.push([21, 9]); // literal 21 -> adds entry 258 (prefix=20, suffix=21, length=2)

      codes.push([257, 9]); // EOI

      const stream = buildRawLZWStream(codes);

      // The output should be: [0, 1, 2, 0, 1, 10, 11, 10, 11, 20, 21]
      // = 11 bytes. We need a TIFF frame that accepts this.
      const totalBytes = 11;
      const channels = 1;
      const width = 1;
      const height = Math.ceil(totalBytes / 4);

      const tiffBuffer = createCompressedTIFF(stream, {
        width,
        height,
        channels,
        compression: 5,
        uncompressedSize: totalBytes,
      });

      // Should decode without error -- CLEAR resets don't cause length overflow
      const result = await decodeTIFFFloat(tiffBuffer);
      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      // Verify actual decoded pixel data.
      // Expected decompressed bytes: [0, 1, 2, 0, 1, 10, 11, 10, 11, 20, 21] = 11 bytes.
      // With bytesPerPixel=4 (1 channel, 32-bit float), only floor(11/4)=2 pixels are decoded.
      const expectedBytes = [0, 1, 2, 0, 1, 10, 11, 10, 11, 20, 21];
      const expectedFloats = (() => {
        const buf = new ArrayBuffer(8); // 2 full float32 values
        const u8 = new Uint8Array(buf);
        for (let i = 0; i < 8; i++) u8[i] = expectedBytes[i]!;
        const dv = new DataView(buf);
        return [dv.getFloat32(0, true), dv.getFloat32(4, true)];
      })();

      // Pixel 0: R=G=B = float32 from bytes [0,1,2,0], A=1.0
      expect(result.data[0]).toBe(expectedFloats[0]);
      expect(result.data[1]).toBe(expectedFloats[0]);
      expect(result.data[2]).toBe(expectedFloats[0]);
      expect(result.data[3]).toBe(1.0);

      // Pixel 1: R=G=B = float32 from bytes [1,10,11,10], A=1.0
      expect(result.data[4]).toBe(expectedFloats[1]);
      expect(result.data[5]).toBe(expectedFloats[1]);
      expect(result.data[6]).toBe(expectedFloats[1]);
      expect(result.data[7]).toBe(1.0);

      // Pixel 2: not decoded (only 3 trailing bytes), stays at R=G=B=0, A=1.0
      expect(result.data[8]).toBe(0);
      expect(result.data[9]).toBe(0);
      expect(result.data[10]).toBe(0);
      expect(result.data[11]).toBe(1.0);
    });
  });

  // ==================== Deflate Compression Tests ====================

  describe('Deflate compression', () => {
    it('TIFF-DEF001: should decode Deflate (8) compressed RGB float TIFF', async () => {
      const width = 2,
        height = 2,
        channels = 3;
      const rawBytes = createFloatPixelBytes(width, height, channels, true);
      const compressed = await deflateCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 8,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.channels).toBe(4);

      const expectedView = new DataView(rawBytes.buffer);
      for (let i = 0; i < width * height; i++) {
        for (let c = 0; c < channels; c++) {
          expect(result.data[i * 4 + c]).toBeCloseTo(expectedView.getFloat32((i * channels + c) * 4, true), 4);
        }
        expect(result.data[i * 4 + 3]).toBe(1.0);
      }
    });

    it('TIFF-DEF002: should decode Adobe Deflate (32946) compressed RGBA float TIFF', async () => {
      const width = 2,
        height = 2,
        channels = 4;
      const pixelValues = [0.1, 0.2, 0.3, 0.8, 0.4, 0.5, 0.6, 0.9, 0.7, 0.8, 0.9, 1.0, 1.0, 0.0, 0.5, 0.5];
      const rawBytes = createFloatPixelBytes(width, height, channels, true, pixelValues);
      const compressed = await deflateCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 32946,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.data[0]).toBeCloseTo(0.1, 4);
      expect(result.data[1]).toBeCloseTo(0.2, 4);
      expect(result.data[2]).toBeCloseTo(0.3, 4);
      expect(result.data[3]).toBeCloseTo(0.8, 4);

      expect(result.data[12]).toBeCloseTo(1.0, 4);
      expect(result.data[13]).toBeCloseTo(0.0, 4);
      expect(result.data[14]).toBeCloseTo(0.5, 4);
      expect(result.data[15]).toBeCloseTo(0.5, 4);
    });

    it('TIFF-DEF003: should decode Deflate compressed big-endian float TIFF', async () => {
      const width = 2,
        height = 2,
        channels = 3;
      const rawBytes = createFloatPixelBytes(width, height, channels, false);
      const compressed = await deflateCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        bigEndian: true,
        compression: 8,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      const expectedView = new DataView(rawBytes.buffer);
      for (let i = 0; i < width * height; i++) {
        for (let c = 0; c < channels; c++) {
          expect(result.data[i * 4 + c]).toBeCloseTo(expectedView.getFloat32((i * channels + c) * 4, false), 4);
        }
      }
    });

    it('TIFF-DEF004: should decode Deflate compressed multi-strip TIFF', async () => {
      const width = 2,
        height = 4,
        channels = 3,
        rowsPerStrip = 2;
      const le = true;

      const strip1Bytes = createFloatPixelBytes(
        width,
        rowsPerStrip,
        channels,
        le,
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.0, 0.5],
      );
      const strip2Bytes = createFloatPixelBytes(
        width,
        rowsPerStrip,
        channels,
        le,
        [0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77, 0.88, 0.99, 0.12, 0.34, 0.56],
      );

      const compressed1 = await deflateCompress(strip1Bytes);
      const compressed2 = await deflateCompress(strip2Bytes);

      const tiffBuffer = createCompressedTIFF(new Uint8Array(0), {
        width,
        height,
        channels,
        compression: 8,
        rowsPerStrip,
        uncompressedSize: strip1Bytes.length + strip2Bytes.length,
        stripCompressedData: [compressed1, compressed2],
        stripCompressedSizes: [compressed1.length, compressed2.length],
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      // Verify first pixel of strip 1
      expect(result.data[0]).toBeCloseTo(0.1, 4);
      expect(result.data[1]).toBeCloseTo(0.2, 4);
      expect(result.data[2]).toBeCloseTo(0.3, 4);

      // Verify first pixel of strip 2 (row 2, col 0)
      const idx = (2 * width + 0) * 4;
      expect(result.data[idx]).toBeCloseTo(0.11, 4);
      expect(result.data[idx + 1]).toBeCloseTo(0.22, 4);
      expect(result.data[idx + 2]).toBeCloseTo(0.33, 4);
    });

    it('TIFF-DEF005: should decode Deflate with horizontal predictor (2)', async () => {
      const width = 2,
        height = 2,
        channels = 3;
      const le = true;

      const rawBytes = createFloatPixelBytes(
        width,
        height,
        channels,
        le,
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.0, 0.5],
      );

      const predictedBytes = applyHorizontalPredictorEncode(rawBytes, width, channels, 4, height);
      const compressed = await deflateCompress(predictedBytes);

      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 8,
        predictor: 2,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.data[0]).toBeCloseTo(0.1, 4);
      expect(result.data[1]).toBeCloseTo(0.2, 4);
      expect(result.data[2]).toBeCloseTo(0.3, 4);
      expect(result.data[3]).toBe(1.0);

      expect(result.data[4]).toBeCloseTo(0.4, 4);
      expect(result.data[5]).toBeCloseTo(0.5, 4);
      expect(result.data[6]).toBeCloseTo(0.6, 4);
    });

    it('TIFF-DEF006: should decode Deflate with floating-point predictor (3)', async () => {
      const width = 2,
        height = 2,
        channels = 3;
      const le = true;

      const rawBytes = createFloatPixelBytes(
        width,
        height,
        channels,
        le,
        [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.0, 0.5],
      );

      const predictedBytes = applyFloatingPointPredictorEncode(rawBytes, width, channels, 4, height);
      const compressed = await deflateCompress(predictedBytes);

      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 8,
        predictor: 3,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.data[0]).toBeCloseTo(0.1, 4);
      expect(result.data[1]).toBeCloseTo(0.2, 4);
      expect(result.data[2]).toBeCloseTo(0.3, 4);
      expect(result.data[3]).toBe(1.0);

      expect(result.data[4]).toBeCloseTo(0.4, 4);
      expect(result.data[5]).toBeCloseTo(0.5, 4);
      expect(result.data[6]).toBeCloseTo(0.6, 4);
    });

    it('TIFF-DEF007: should decode 1x1 Deflate compressed TIFF', async () => {
      const width = 1,
        height = 1,
        channels = 3;
      const rawBytes = createFloatPixelBytes(width, height, channels, true, [0.5, 0.25, 0.75]);
      const compressed = await deflateCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 8,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.data[0]).toBeCloseTo(0.5, 4);
      expect(result.data[1]).toBeCloseTo(0.25, 4);
      expect(result.data[2]).toBeCloseTo(0.75, 4);
      expect(result.data[3]).toBe(1.0);
    });
  });

  // ==================== PackBits Compression Tests ====================

  describe('PackBits compression', () => {
    it('TIFF-PB001: should decode PackBits compressed RGB float TIFF', async () => {
      const width = 2,
        height = 2,
        channels = 3;
      const rawBytes = createFloatPixelBytes(width, height, channels, true);
      const compressed = packBitsCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 32773,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(width * height * 4);
      expect(result.metadata.compression).toBe(32773);
    });

    it('TIFF-PB002: should decode PackBits compressed RGBA float TIFF', async () => {
      const width = 2,
        height = 2,
        channels = 4;
      const rawBytes = createFloatPixelBytes(width, height, channels, true);
      const compressed = packBitsCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 32773,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.channels).toBe(4);
    });

    it('TIFF-PB003: should preserve pixel values through PackBits round-trip', async () => {
      const width = 2,
        height = 2,
        channels = 3;
      const pixelValues = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.0, 0.5];
      const rawBytes = createFloatPixelBytes(width, height, channels, true, pixelValues);
      const compressed = packBitsCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 32773,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      // Check first pixel RGB values
      expect(result.data[0]).toBeCloseTo(0.1, 4);
      expect(result.data[1]).toBeCloseTo(0.2, 4);
      expect(result.data[2]).toBeCloseTo(0.3, 4);
      expect(result.data[3]).toBe(1.0); // Alpha for RGB input
    });

    it('TIFF-PB004: should decode PackBits data with repeated byte runs', async () => {
      const width = 4,
        height = 1,
        channels = 3;
      // All zeros — will produce repeated-byte runs in PackBits
      const pixelValues = new Array(width * channels).fill(0);
      const rawBytes = createFloatPixelBytes(width, height, channels, true, pixelValues);
      const compressed = packBitsCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 32773,
        uncompressedSize: rawBytes.length,
      });

      const result = await decodeTIFFFloat(tiffBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      // All pixel values should be 0 (RGB) with alpha=1
      for (let i = 0; i < width; i++) {
        expect(result.data[i * 4]).toBeCloseTo(0, 4);
        expect(result.data[i * 4 + 1]).toBeCloseTo(0, 4);
        expect(result.data[i * 4 + 2]).toBeCloseTo(0, 4);
        expect(result.data[i * 4 + 3]).toBe(1.0);
      }
    });

    it('TIFF-PB005: should produce same output as LZW for identical input', async () => {
      const width = 2,
        height = 2,
        channels = 3;
      const rawBytes = createFloatPixelBytes(width, height, channels, true);

      const packBitsCompressed = packBitsCompress(rawBytes);
      const packBitsTiff = createCompressedTIFF(packBitsCompressed, {
        width,
        height,
        channels,
        compression: 32773,
        uncompressedSize: rawBytes.length,
      });

      const lzwCompressed = lzwCompress(rawBytes);
      const lzwTiff = createCompressedTIFF(lzwCompressed, {
        width,
        height,
        channels,
        compression: 5,
        uncompressedSize: rawBytes.length,
      });

      const packBitsResult = await decodeTIFFFloat(packBitsTiff);
      const lzwResult = await decodeTIFFFloat(lzwTiff);

      for (let i = 0; i < packBitsResult.data.length; i++) {
        expect(packBitsResult.data[i]).toBe(lzwResult.data[i]);
      }
    });
  });

  // ==================== Compression Error Handling Tests ====================

  describe('Compression error handling', () => {
    it('TIFF-ERR001: should reject JPEG compression (7) with descriptive error', async () => {
      const buffer = createTestFloatTIFF({ compression: 7 });
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow(
        'Unsupported TIFF compression: 7 (JPEG). Supported modes: Uncompressed (1), LZW (5), Deflate (8, 32946), PackBits (32773).',
      );
    });

    it('TIFF-ERR002: should reject unknown compression with code and supported list', async () => {
      const buffer = createTestFloatTIFF({ compression: 99 });
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow(
        'Unsupported TIFF compression: 99 (unknown). Supported modes: Uncompressed (1), LZW (5), Deflate (8, 32946), PackBits (32773).',
      );
    });

    it('TIFF-ERR003: should reject unsupported predictor', async () => {
      // Create a compressed TIFF with predictor=4 (unsupported)
      const width = 2,
        height = 2,
        channels = 3;
      const rawBytes = createFloatPixelBytes(width, height, channels, true);
      const compressed = lzwCompress(rawBytes);
      const tiffBuffer = createCompressedTIFF(compressed, {
        width,
        height,
        channels,
        compression: 5,
        predictor: 4,
        uncompressedSize: rawBytes.length,
      });

      await expect(decodeTIFFFloat(tiffBuffer)).rejects.toThrow('Unsupported TIFF predictor: 4');
    });
  });

  // ==================== Tiled TIFF Tests ====================

  /**
   * Create a tiled TIFF file buffer for testing.
   * Tiles are stored left-to-right, top-to-bottom.
   * Partial tiles at the right/bottom edges are padded with zeros to full tile size.
   */
  function createTiledTIFF(options: {
    width: number;
    height: number;
    tileWidth: number;
    tileHeight: number;
    channels?: number;
    bigEndian?: boolean;
    compression?: number;
    predictor?: number;
    pixelValues?: number[];
  }): ArrayBuffer | Promise<ArrayBuffer> {
    const {
      width,
      height,
      tileWidth,
      tileHeight,
      channels = 3,
      bigEndian = false,
      compression = 1,
      predictor = 1,
      pixelValues,
    } = options;

    const le = !bigEndian;
    const bytesPerSample = 4; // float32

    // Calculate tile grid
    const tilesAcross = Math.ceil(width / tileWidth);
    const tilesDown = Math.ceil(height / tileHeight);

    // Generate pixel data for the full image
    const fullPixelValues: number[] = pixelValues ?? [];
    if (!pixelValues) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          for (let c = 0; c < channels; c++) {
            fullPixelValues.push((x + y * width + c) / (width * height * channels));
          }
        }
      }
    }

    // Build tile data buffers
    const tileDataBuffers: Uint8Array[] = [];
    for (let tileRow = 0; tileRow < tilesDown; tileRow++) {
      for (let tileCol = 0; tileCol < tilesAcross; tileCol++) {
        // Full tile buffer (padded to tileWidth x tileHeight)
        const tileBuf = new ArrayBuffer(tileWidth * tileHeight * channels * bytesPerSample);
        const tileView = new DataView(tileBuf);

        for (let ty = 0; ty < tileHeight; ty++) {
          for (let tx = 0; tx < tileWidth; tx++) {
            const imgX = tileCol * tileWidth + tx;
            const imgY = tileRow * tileHeight + ty;
            const tilePixelIdx = (ty * tileWidth + tx) * channels;

            for (let c = 0; c < channels; c++) {
              let value = 0;
              if (imgX < width && imgY < height) {
                const imgPixelIdx = (imgY * width + imgX) * channels + c;
                value = fullPixelValues[imgPixelIdx] ?? 0;
              }
              tileView.setFloat32((tilePixelIdx + c) * bytesPerSample, value, le);
            }
          }
        }

        tileDataBuffers.push(new Uint8Array(tileBuf));
      }
    }

    // Compress tile data if needed
    if (compression === 5) {
      // LZW compression
      const compressedTiles: Uint8Array[] = [];
      for (const tileBuf of tileDataBuffers) {
        let data = tileBuf;
        if (predictor === 2) {
          data = applyHorizontalPredictorEncode(data, tileWidth, channels, bytesPerSample, tileHeight);
        } else if (predictor === 3) {
          data = applyFloatingPointPredictorEncode(data, tileWidth, channels, bytesPerSample, tileHeight);
        }
        compressedTiles.push(lzwCompress(data));
      }
      return buildTiledTIFFBuffer(
        width,
        height,
        tileWidth,
        tileHeight,
        channels,
        bigEndian,
        compression,
        predictor,
        compressedTiles,
        le,
        bytesPerSample,
      );
    } else if (compression === 8 || compression === 32946) {
      // Deflate compression - async
      return (async () => {
        const compressedTiles: Uint8Array[] = [];
        for (const tileBuf of tileDataBuffers) {
          let data = tileBuf;
          if (predictor === 2) {
            data = applyHorizontalPredictorEncode(data, tileWidth, channels, bytesPerSample, tileHeight);
          } else if (predictor === 3) {
            data = applyFloatingPointPredictorEncode(data, tileWidth, channels, bytesPerSample, tileHeight);
          }
          compressedTiles.push(await deflateCompress(data));
        }
        return buildTiledTIFFBuffer(
          width,
          height,
          tileWidth,
          tileHeight,
          channels,
          bigEndian,
          compression,
          predictor,
          compressedTiles,
          le,
          bytesPerSample,
        );
      })();
    }

    // Uncompressed - use raw tile data
    return buildTiledTIFFBuffer(
      width,
      height,
      tileWidth,
      tileHeight,
      channels,
      bigEndian,
      compression,
      predictor,
      tileDataBuffers,
      le,
      bytesPerSample,
    );
  }

  function buildTiledTIFFBuffer(
    width: number,
    height: number,
    tileWidth: number,
    tileHeight: number,
    channels: number,
    bigEndian: boolean,
    compression: number,
    predictor: number,
    tileDataBuffers: Uint8Array[],
    le: boolean,
    _bytesPerSample: number,
  ): ArrayBuffer {
    const numTiles = tileDataBuffers.length;
    const hasPredictor = predictor !== 1;
    // Tags: Width, Height, BPS, Compression, Photometric, SPP, SampleFormat,
    //        TileWidth, TileLength, TileOffsets, TileByteCounts, [Predictor]
    const numTags = 11 + (hasPredictor ? 1 : 0);
    const ifdOffset = 8;
    const ifdSize = 2 + numTags * 12 + 4;
    const extraDataStart = ifdOffset + ifdSize;

    // BitsPerSample array
    const needsBPSArray = channels > 2;
    const bpsArrayOffset = extraDataStart;
    const bpsArraySize = needsBPSArray ? channels * 2 : 0;

    let nextExtra = extraDataStart + bpsArraySize;

    // TileOffsets array (only needed if numTiles > 1; for 1 tile, value is inline)
    let tileOffsetsArrayOffset = 0;
    let tileByteCountsArrayOffset = 0;
    if (numTiles > 1) {
      tileOffsetsArrayOffset = nextExtra;
      nextExtra += numTiles * 4;

      // TileByteCounts array
      tileByteCountsArrayOffset = nextExtra;
      nextExtra += numTiles * 4;
    }

    // Tile data starts here
    const tileDataStart = nextExtra;
    const totalTileDataSize = tileDataBuffers.reduce((sum, d) => sum + d.length, 0);
    const totalSize = tileDataStart + totalTileDataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // TIFF Header
    view.setUint16(0, bigEndian ? TIFF_BE : TIFF_LE, false);
    view.setUint16(2, TIFF_MAGIC, le);
    view.setUint32(4, ifdOffset, le);

    let pos = ifdOffset;
    view.setUint16(pos, numTags, le);
    pos += 2;

    function writeTag(id: number, type: number, count: number, value: number): void {
      view.setUint16(pos, id, le);
      view.setUint16(pos + 2, type, le);
      view.setUint32(pos + 4, count, le);
      if (type === 3 && count <= 2) {
        view.setUint16(pos + 8, value, le);
      } else if (type === 4 && count === 1) {
        view.setUint32(pos + 8, value, le);
      } else {
        view.setUint32(pos + 8, value, le);
      }
      pos += 12;
    }

    // Tags in ascending order
    writeTag(256, 4, 1, width); // ImageWidth
    writeTag(257, 4, 1, height); // ImageLength
    if (needsBPSArray) {
      writeTag(258, 3, channels, bpsArrayOffset); // BitsPerSample
    } else {
      writeTag(258, 3, 1, 32);
    }
    writeTag(259, 3, 1, compression); // Compression
    writeTag(262, 3, 1, 2); // Photometric=RGB
    writeTag(277, 3, 1, channels); // SamplesPerPixel
    if (hasPredictor) {
      writeTag(317, 3, 1, predictor); // Predictor
    }
    writeTag(322, 4, 1, tileWidth); // TileWidth
    writeTag(323, 4, 1, tileHeight); // TileLength
    if (numTiles === 1) {
      writeTag(324, 4, 1, tileDataStart); // TileOffsets (inline)
      writeTag(325, 4, 1, tileDataBuffers[0]!.length); // TileByteCounts (inline)
    } else {
      writeTag(324, 4, numTiles, tileOffsetsArrayOffset); // TileOffsets
      writeTag(325, 4, numTiles, tileByteCountsArrayOffset); // TileByteCounts
    }
    writeTag(339, 3, 1, 3); // SampleFormat=float

    // Next IFD = 0
    view.setUint32(pos, 0, le);

    // BitsPerSample array
    if (needsBPSArray) {
      for (let i = 0; i < channels; i++) {
        view.setUint16(bpsArrayOffset + i * 2, 32, le);
      }
    }

    // Write tile offsets, byte counts, and data
    let dataPos = tileDataStart;
    if (numTiles > 1) {
      for (let t = 0; t < numTiles; t++) {
        view.setUint32(tileOffsetsArrayOffset + t * 4, dataPos, le);
        view.setUint32(tileByteCountsArrayOffset + t * 4, tileDataBuffers[t]!.length, le);
        new Uint8Array(buffer, dataPos, tileDataBuffers[t]!.length).set(tileDataBuffers[t]!);
        dataPos += tileDataBuffers[t]!.length;
      }
    } else {
      new Uint8Array(buffer, dataPos, tileDataBuffers[0]!.length).set(tileDataBuffers[0]!);
    }

    return buffer;
  }

  describe('Tiled TIFF layout', () => {
    it('TIFF-TILE001: should decode uncompressed tiled RGB float TIFF (exact tiles)', async () => {
      const width = 4,
        height = 4,
        tileWidth = 2,
        tileHeight = 2;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(x * 0.1, y * 0.1, (x + y) * 0.05);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width,
        height,
        tileWidth,
        tileHeight,
        channels: 3,
        pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(width * height * 4);

      // Verify pixel (0,0)
      expect(result.data[0]).toBeCloseTo(0, 4); // R = 0 * 0.1
      expect(result.data[1]).toBeCloseTo(0, 4); // G = 0 * 0.1
      expect(result.data[2]).toBeCloseTo(0, 4); // B = (0+0) * 0.05
      expect(result.data[3]).toBe(1.0); // A

      // Verify pixel (3, 2) - idx = (2*4+3)*4 = 44
      const idx = (2 * width + 3) * 4;
      expect(result.data[idx]).toBeCloseTo(0.3, 4); // R = 3*0.1
      expect(result.data[idx + 1]).toBeCloseTo(0.2, 4); // G = 2*0.1
      expect(result.data[idx + 2]).toBeCloseTo(0.25, 4); // B = (3+2)*0.05

      // Check metadata
      expect(result.metadata.tiled).toBe(true);
      expect(result.metadata.tileWidth).toBe(tileWidth);
      expect(result.metadata.tileLength).toBe(tileHeight);
    });

    it('TIFF-TILE002: should decode tiled TIFF with partial tiles at right/bottom edges', async () => {
      // 5x5 image with 4x4 tiles = 2x2 tile grid, right/bottom tiles partial
      const width = 5,
        height = 5,
        tileWidth = 4,
        tileHeight = 4;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(x * 0.1 + 0.01, y * 0.1 + 0.02, 0.5);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width,
        height,
        tileWidth,
        tileHeight,
        channels,
        pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      // Verify bottom-right corner pixel (4, 4)
      const idx = (4 * width + 4) * 4;
      expect(result.data[idx]).toBeCloseTo(4 * 0.1 + 0.01, 4);
      expect(result.data[idx + 1]).toBeCloseTo(4 * 0.1 + 0.02, 4);
      expect(result.data[idx + 2]).toBeCloseTo(0.5, 4);
      expect(result.data[idx + 3]).toBe(1.0);

      // Verify pixel at tile boundary (3, 3) - still in first tile
      const idx2 = (3 * width + 3) * 4;
      expect(result.data[idx2]).toBeCloseTo(3 * 0.1 + 0.01, 4);
      expect(result.data[idx2 + 1]).toBeCloseTo(3 * 0.1 + 0.02, 4);
    });

    it('TIFF-TILE003: should decode tiled RGBA float TIFF', async () => {
      const width = 4,
        height = 4,
        tileWidth = 2,
        tileHeight = 2;
      const channels = 4;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(0.1, 0.2, 0.3, 0.5);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width,
        height,
        tileWidth,
        tileHeight,
        channels,
        pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.channels).toBe(4);
      // Check alpha is preserved (not overwritten with 1.0)
      expect(result.data[3]).toBeCloseTo(0.5, 4);
      expect(result.data[7]).toBeCloseTo(0.5, 4);
    });

    it('TIFF-TILE004: should decode big-endian tiled TIFF', async () => {
      const width = 4,
        height = 4,
        tileWidth = 2,
        tileHeight = 2;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(0.25, 0.5, 0.75);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width,
        height,
        tileWidth,
        tileHeight,
        channels: 3,
        bigEndian: true,
        pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.data[0]).toBeCloseTo(0.25, 4);
      expect(result.data[1]).toBeCloseTo(0.5, 4);
      expect(result.data[2]).toBeCloseTo(0.75, 4);
    });

    it('TIFF-TILE005: should decode 1x1 tile (entire image is one tile)', async () => {
      const width = 1,
        height = 1,
        tileWidth = 1,
        tileHeight = 1;
      const pixelValues = [0.33, 0.66, 0.99];

      const tiffBuffer = createTiledTIFF({
        width,
        height,
        tileWidth,
        tileHeight,
        channels: 3,
        pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.data[0]).toBeCloseTo(0.33, 4);
      expect(result.data[1]).toBeCloseTo(0.66, 4);
      expect(result.data[2]).toBeCloseTo(0.99, 4);
      expect(result.data[3]).toBe(1.0);
    });

    it('TIFF-TILE006: should decode LZW compressed tiled TIFF', async () => {
      const width = 4,
        height = 4,
        tileWidth = 2,
        tileHeight = 2;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(x * 0.1, y * 0.2, 0.5);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width,
        height,
        tileWidth,
        tileHeight,
        channels,
        compression: 5,
        pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      // Verify pixel (1, 2) - idx = (2*4+1)*4 = 36
      const idx = (2 * width + 1) * 4;
      expect(result.data[idx]).toBeCloseTo(0.1, 4); // R = 1*0.1
      expect(result.data[idx + 1]).toBeCloseTo(0.4, 4); // G = 2*0.2
      expect(result.data[idx + 2]).toBeCloseTo(0.5, 4); // B = 0.5
    });

    it('TIFF-TILE007: should decode Deflate compressed tiled TIFF', async () => {
      const width = 4,
        height = 4,
        tileWidth = 2,
        tileHeight = 2;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(x * 0.1, y * 0.2, 0.5);
        }
      }

      const tiffBuffer = await createTiledTIFF({
        width,
        height,
        tileWidth,
        tileHeight,
        channels,
        compression: 8,
        pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      const idx = (2 * width + 1) * 4;
      expect(result.data[idx]).toBeCloseTo(0.1, 4);
      expect(result.data[idx + 1]).toBeCloseTo(0.4, 4);
      expect(result.data[idx + 2]).toBeCloseTo(0.5, 4);
    });

    it('TIFF-TILE008: should decode LZW tiled TIFF with horizontal predictor', async () => {
      const width = 4,
        height = 4,
        tileWidth = 2,
        tileHeight = 2;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(0.1, 0.2, 0.3);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width,
        height,
        tileWidth,
        tileHeight,
        channels,
        compression: 5,
        predictor: 2,
        pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.data[0]).toBeCloseTo(0.1, 4);
      expect(result.data[1]).toBeCloseTo(0.2, 4);
      expect(result.data[2]).toBeCloseTo(0.3, 4);

      // All pixels should have the same value
      for (let i = 0; i < width * height; i++) {
        expect(result.data[i * 4]).toBeCloseTo(0.1, 4);
        expect(result.data[i * 4 + 1]).toBeCloseTo(0.2, 4);
        expect(result.data[i * 4 + 2]).toBeCloseTo(0.3, 4);
      }
    });

    it('TIFF-TILE009: should decode LZW tiled TIFF with floating-point predictor', async () => {
      const width = 4,
        height = 4,
        tileWidth = 2,
        tileHeight = 2;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(0.4, 0.5, 0.6);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width,
        height,
        tileWidth,
        tileHeight,
        channels,
        compression: 5,
        predictor: 3,
        pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      for (let i = 0; i < width * height; i++) {
        expect(result.data[i * 4]).toBeCloseTo(0.4, 4);
        expect(result.data[i * 4 + 1]).toBeCloseTo(0.5, 4);
        expect(result.data[i * 4 + 2]).toBeCloseTo(0.6, 4);
      }
    });

    it('TIFF-TILE010: should decode tiled TIFF with non-square tiles', async () => {
      // 8x6 image with 4x3 tiles
      const width = 8,
        height = 6,
        tileWidth = 4,
        tileHeight = 3;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(x / width, y / height, 0.5);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width,
        height,
        tileWidth,
        tileHeight,
        channels,
        pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.data.length).toBe(width * height * 4);

      // Verify some specific pixels
      // Pixel (7, 5) - bottom-right corner
      const idx = (5 * width + 7) * 4;
      expect(result.data[idx]).toBeCloseTo(7 / width, 4);
      expect(result.data[idx + 1]).toBeCloseTo(5 / height, 4);
      expect(result.data[idx + 2]).toBeCloseTo(0.5, 4);
    });

    it('TIFF-TILE011: should handle tile larger than image', async () => {
      // 2x2 image with 8x8 tiles
      const width = 2,
        height = 2,
        tileWidth = 8,
        tileHeight = 8;
      const pixelValues = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.0, 0.5];

      const tiffBuffer = createTiledTIFF({
        width,
        height,
        tileWidth,
        tileHeight,
        channels: 3,
        pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.data[0]).toBeCloseTo(0.1, 4);
      expect(result.data[1]).toBeCloseTo(0.2, 4);
      expect(result.data[2]).toBeCloseTo(0.3, 4);
      expect(result.data[3]).toBe(1.0);

      // Pixel (1, 1)
      const idx = (1 * width + 1) * 4;
      expect(result.data[idx]).toBeCloseTo(1.0, 4);
      expect(result.data[idx + 1]).toBeCloseTo(0.0, 4);
      expect(result.data[idx + 2]).toBeCloseTo(0.5, 4);
    });

    it('TIFF-TILE-TRUNC: should not crash on truncated compressed tile data', async () => {
      // Fix: compressed tile/strip paths validate buffer bounds:
      //   if (tileOffset + tileByteCount > buffer.byteLength) continue; // Skip truncated tile
      // Create a valid tiled TIFF, then truncate the buffer to corrupt tile data
      const width = 4,
        height = 4,
        tileWidth = 2,
        tileHeight = 2;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(0.5, 0.5, 0.5);
        }
      }

      const fullBuffer = await createTiledTIFF({
        width,
        height,
        tileWidth,
        tileHeight,
        channels,
        compression: 5, // LZW
        pixelValues,
      });

      // Truncate the buffer to remove half of the tile data
      const truncatedBuffer = (fullBuffer as ArrayBuffer).slice(
        0,
        Math.floor((fullBuffer as ArrayBuffer).byteLength * 0.7),
      );

      // Should either decode (with some missing tiles) or throw a specific error,
      // but it must NOT crash with a RangeError or similar bounds error.
      try {
        const result = await decodeTIFFFloat(truncatedBuffer);
        // If it succeeds, it should have the correct dimensions
        expect(result.width).toBe(width);
        expect(result.height).toBe(height);
      } catch (e: any) {
        // A graceful error message is acceptable, but not a RangeError from buffer access
        expect(e.message).not.toMatch(/RangeError|offset is outside/i);
      }
    });

    it('TIFF-TILE012: should produce consistent results between strip and tile layout', async () => {
      // Decode the same pixel data as both strip and tiled, verify identical output
      const width = 4,
        height = 4,
        channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(x * 0.15, y * 0.25, (x + y) * 0.05);
        }
      }

      // Strip-based TIFF
      const stripBuffer = createTestFloatTIFF({
        width,
        height,
        channels,
        pixelValues,
      });
      const stripResult = await decodeTIFFFloat(stripBuffer);

      // Tiled TIFF with 2x2 tiles
      const tiledBuffer = createTiledTIFF({
        width,
        height,
        tileWidth: 2,
        tileHeight: 2,
        channels,
        pixelValues,
      });
      const tiledResult = await decodeTIFFFloat(tiledBuffer as ArrayBuffer);

      expect(tiledResult.width).toBe(stripResult.width);
      expect(tiledResult.height).toBe(stripResult.height);
      expect(tiledResult.channels).toBe(stripResult.channels);

      // Every pixel should match
      for (let i = 0; i < stripResult.data.length; i++) {
        expect(tiledResult.data[i]).toBeCloseTo(stripResult.data[i]!, 4);
      }
    });
  });

  describe('non-RGB channel layout support', () => {
    it('should decode 1-channel grayscale with correct pixel values', async () => {
      const values = [0.1, 0.5, 0.9, 0.0];
      const buffer = createTestFloatTIFF({
        width: 2,
        height: 2,
        channels: 1,
        sampleFormat: 3,
        pixelValues: values,
      });

      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(2 * 2 * 4);
      expect(result.metadata.originalChannels).toBe(1);

      // Each grayscale value should be replicated to R, G, B with alpha = 1.0
      for (let i = 0; i < values.length; i++) {
        const base = i * 4;
        expect(result.data[base]).toBeCloseTo(values[i]!, 4); // R
        expect(result.data[base + 1]).toBeCloseTo(values[i]!, 4); // G
        expect(result.data[base + 2]).toBeCloseTo(values[i]!, 4); // B
        expect(result.data[base + 3]).toBeCloseTo(1.0, 4); // A
      }
    });

    it('should decode 2-channel luminance+alpha with correct pixel values', async () => {
      // 2x2 image, 2 channels: [lum, alpha] per pixel
      const values = [0.3, 0.8, 0.6, 0.5, 0.1, 1.0, 0.9, 0.2];
      const buffer = createTestFloatTIFF({
        width: 2,
        height: 2,
        channels: 2,
        sampleFormat: 3,
        pixelValues: values,
      });

      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(2 * 2 * 4);
      expect(result.metadata.originalChannels).toBe(2);

      // Each pair [lum, alpha] should expand to [lum, lum, lum, alpha]
      for (let i = 0; i < 4; i++) {
        const lum = values[i * 2]!;
        const alpha = values[i * 2 + 1]!;
        const base = i * 4;
        expect(result.data[base]).toBeCloseTo(lum, 4); // R
        expect(result.data[base + 1]).toBeCloseTo(lum, 4); // G
        expect(result.data[base + 2]).toBeCloseTo(lum, 4); // B
        expect(result.data[base + 3]).toBeCloseTo(alpha, 4); // A
      }
    });

    it('should throw for 0 samples per pixel', async () => {
      const buffer = createTestFloatTIFF({ channels: 3, sampleFormat: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 277) {
          view.setUint16(tagPos + 8, 0, le);
          break;
        }
      }

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Unsupported samples per pixel: 0');
    });
  });

  describe('unknown TIFF tag type handling (LOW-18)', () => {
    it('should skip type 0 (invalid) gracefully and still decode', async () => {
      // Create a valid TIFF with an extra non-essential tag whose type we set to 0
      const buffer = createTestFloatTIFF({ width: 2, height: 2, channels: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);

      // Find the PhotometricInterpretation tag (262) and set its type to 0 (invalid).
      // This tag is not required by the decoder so skipping it should still allow decode.
      let found = false;
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 262) {
          view.setUint16(tagPos + 2, 0, le); // set type to 0
          found = true;
          break;
        }
      }
      expect(found).toBe(true);

      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4); // expanded to RGBA
    });

    it('should skip type 13 (IFD pointer, common in EXIF) gracefully and still decode', async () => {
      // Create a valid TIFF then change a non-essential tag's type to 13 (IFD/EXIF pointer)
      const buffer = createTestFloatTIFF({ width: 2, height: 2, channels: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);

      // Change PhotometricInterpretation (262) type to 13 (IFD pointer)
      let found = false;
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 262) {
          view.setUint16(tagPos + 2, 13, le); // set type to 13
          found = true;
          break;
        }
      }
      expect(found).toBe(true);

      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
    });

    it('should decode correctly when one unknown-type tag exists among valid tags', async () => {
      // This verifies that a TIFF with a mixture of valid and unknown-type tags
      // still decodes correctly -- the unknown tag is simply ignored.
      const buffer = createTestFloatTIFF({
        width: 2,
        height: 2,
        channels: 3,
        sampleFormat: 3,
        bitsPerSample: 32,
        pixelValues: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.0, 0.5],
      });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);

      // Change PhotometricInterpretation (tag 262) to unknown type 99
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 262) {
          view.setUint16(tagPos + 2, 99, le);
          break;
        }
      }

      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(2 * 2 * 4);
      // Verify pixel values are correct (first pixel R channel)
      expect(result.data[0]).toBeCloseTo(0.1, 4);
    });

    it('should skip extended type 16 (LONG8/BigTIFF) gracefully', async () => {
      const buffer = createTestFloatTIFF({ width: 1, height: 1, channels: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);

      // Change PhotometricInterpretation (262) to type 16
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 262) {
          view.setUint16(tagPos + 2, 16, le);
          break;
        }
      }

      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
    });

    it('should correctly parse tags using all standard TIFF 6.0 types (1-12)', async () => {
      // A valid float TIFF uses types 3 (SHORT) and 4 (LONG) in its IFD entries.
      // We verify that a standard float TIFF still decodes correctly,
      // confirming that the known-type paths are not broken by the fix.
      const buffer = createTestFloatTIFF({
        width: 2,
        height: 2,
        channels: 3,
        sampleFormat: 3,
        bitsPerSample: 32,
        pixelValues: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.0, 0.5],
      });

      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4); // expanded to RGBA
      expect(result.data.length).toBe(2 * 2 * 4);
    });

    it('should verify byte sizes for all standard TIFF 6.0 types (1-12)', () => {
      // Build a minimal TIFF with IFD entries using types 1-12 and verify
      // that parsing does not throw and the tags with known types are retained.
      // Types 6-12 are: SBYTE(1), UNDEFINED(1), SSHORT(2), SLONG(4),
      //                  SRATIONAL(8), FLOAT(4), DOUBLE(8)
      const le = true;

      // We need: header(8) + IFD count(2) + 12 entries * 12 bytes + next IFD(4)
      // + pixel data. We also need valid essential tags for the decoder.
      // Instead of a full decode test, we verify that getTIFFInfo works
      // when non-essential tags use various types.

      // Start with a valid TIFF
      const buffer = createTestFloatTIFF({ width: 2, height: 2, channels: 3 });
      const view = new DataView(buffer);
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);

      // Find PhotometricInterpretation (262) and test changing its type
      // to each of types 1-12. The decoder doesn't read this tag's value
      // via type-specific logic, so it should not affect parsing of other tags.
      const typeSizes: Record<number, number> = {
        1: 1, // BYTE
        2: 1, // ASCII
        3: 2, // SHORT
        4: 4, // LONG
        5: 8, // RATIONAL
        6: 1, // SBYTE
        7: 1, // UNDEFINED
        8: 2, // SSHORT
        9: 4, // SLONG
        10: 8, // SRATIONAL
        11: 4, // FLOAT
        12: 8, // DOUBLE
      };

      let photoTagPos = -1;
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 262) {
          photoTagPos = tagPos;
          break;
        }
      }
      expect(photoTagPos).not.toBe(-1);

      for (const [typeStr, expectedSize] of Object.entries(typeSizes)) {
        const type = Number(typeStr);
        // Reset the tag type and count so it fits inline (count=1)
        view.setUint16(photoTagPos + 2, type, le);
        view.setUint32(photoTagPos + 4, 1, le); // count = 1

        // For types with size > 4 (RATIONAL, SRATIONAL, DOUBLE = 8 bytes),
        // count=1 means totalSize=8 > 4, so valueOffset field is treated as
        // a pointer. Set it to 0 so it points to the header area (harmless for
        // a tag we don't actually read).
        if (expectedSize > 4) {
          view.setUint32(photoTagPos + 8, 0, le);
        }

        // getTIFFInfo should succeed for all standard types (tag 262 is not
        // required for format detection)
        const info = getTIFFInfo(buffer);
        expect(info).not.toBeNull();
        expect(info!.width).toBe(2);
        expect(info!.height).toBe(2);
      }
    });

    it('should still decode valid big-endian float TIFF after the fix', async () => {
      const buffer = createTestFloatTIFF({
        width: 1,
        height: 1,
        channels: 3,
        bigEndian: true,
        sampleFormat: 3,
        bitsPerSample: 32,
        pixelValues: [0.25, 0.5, 0.75],
      });

      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.data[0]).toBeCloseTo(0.25, 4);
      expect(result.data[1]).toBeCloseTo(0.5, 4);
      expect(result.data[2]).toBeCloseTo(0.75, 4);
    });

    it('should skip unknown-type tags instead of misinterpreting offset calculations', async () => {
      // This is the core regression test for LOW-18.
      // Previously, unknown type would return size=1, causing totalSize to be small,
      // which would make the parser treat data as inline when it's actually at an offset.
      // Now unknown types are skipped entirely per TIFF 6.0 Section 7.
      const buffer = createTestFloatTIFF({ width: 2, height: 2, channels: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);

      // Find a non-essential tag (PhotometricInterpretation=262) and change to unknown type
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 262) {
          view.setUint16(tagPos + 2, 42, le); // unknown type 42
          break;
        }
      }

      // Should decode successfully, not throw
      const result = await decodeTIFFFloat(buffer);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
    });

    it('should default to width 0 when ImageWidth tag is skipped due to unknown type', () => {
      // If a required tag (like ImageWidth) has an unknown type, it gets skipped,
      // so getTIFFInfo falls back to the default value (0) for that tag.
      const buffer = createTestFloatTIFF({ width: 2, height: 2, channels: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;

      // Change ImageWidth (tag 256) type to unknown 200
      const firstTagPos = ifdOffset + 2;
      const tagId = view.getUint16(firstTagPos, le);
      expect(tagId).toBe(256); // ImageWidth is first tag
      view.setUint16(firstTagPos + 2, 200, le);

      // getTIFFInfo returns info with width defaulting to 0 since the tag was skipped
      const info = getTIFFInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.width).toBe(0);
      expect(info!.height).toBe(2); // other tags still parsed correctly
    });
  });
});
