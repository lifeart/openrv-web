/**
 * TIFF Float Decoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isTIFFFile,
  isFloatTIFF,
  getTIFFInfo,
  decodeTIFFFloat,
} from './TIFFFloatDecoder';

const TIFF_LE = 0x4949; // "II"
const TIFF_BE = 0x4d4d; // "MM"
const TIFF_MAGIC = 42;

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
function createTestFloatTIFF(options: {
  width?: number;
  height?: number;
  channels?: number; // 3=RGB, 4=RGBA
  bigEndian?: boolean;
  sampleFormat?: number; // 1=uint, 2=int, 3=float
  bitsPerSample?: number;
  compression?: number;
  pixelValues?: number[]; // Custom float values for pixel data
} = {}): ArrayBuffer {
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
    view.setUint16(pos, id, le);      // Tag ID
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
  if (pixelValues) {
    for (let i = 0; i < pixelValues.length && i < width * height * channels; i++) {
      view.setFloat32(pixelDataOffset + i * 4, pixelValues[i]!, le);
    }
  } else {
    // Fill with test pattern
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIdx = (y * width + x) * channels;
        for (let c = 0; c < channels; c++) {
          const value = (x + y * width + c) / (width * height * channels);
          view.setFloat32(pixelDataOffset + (pixelIdx + c) * 4, value, le);
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

    it('should return false for uint TIFF', () => {
      const buffer = createTestFloatTIFF({ sampleFormat: 1, bitsPerSample: 32 });
      expect(isFloatTIFF(buffer)).toBe(false);
    });

    it('should return false for non-TIFF data', () => {
      const buffer = new ArrayBuffer(8);
      expect(isFloatTIFF(buffer)).toBe(false);
    });
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
        0.1, 0.2, 0.3, // pixel 0
        0.4, 0.5, 0.6, // pixel 1
        0.7, 0.8, 0.9, // pixel 2
        1.0, 0.0, 0.5, // pixel 3
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

    it('should throw for compressed TIFF', async () => {
      // Must still be float to get past the float check first
      const buffer = createTestFloatTIFF({ compression: 5, sampleFormat: 3 }); // LZW + float
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Unsupported TIFF compression');
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
      view.setUint16(2, 99, true);       // Wrong magic

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

    it('should throw for unsupported bits per sample', async () => {
      // Create a valid 32-bit float TIFF, then patch the BitsPerSample tag to 16
      const buffer = createTestFloatTIFF({ bitsPerSample: 32, sampleFormat: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 258) { // BitsPerSample
          // If count=1 and inline, patch inline value
          const count = view.getUint32(tagPos + 4, le);
          if (count === 1) {
            view.setUint16(tagPos + 8, 16, le);
          } else {
            // Patch the external array
            const extOffset = view.getUint32(tagPos + 8, le);
            view.setUint16(extOffset, 16, le);
          }
          break;
        }
      }
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Unsupported bits per sample: 16');
    });

    it('should throw for unsupported samples per pixel (1 channel)', async () => {
      // Create a TIFF with 1 sample per pixel by building manually
      const buffer = createTestFloatTIFF({ channels: 3, sampleFormat: 3 });
      // Manually patch the SamplesPerPixel tag to 1
      // Need to find and modify the tag in the IFD
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 277) { // SamplesPerPixel
          view.setUint16(tagPos + 8, 1, le); // Set to 1
          break;
        }
      }

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Unsupported samples per pixel: 1');
    });

    it('should throw for unsupported samples per pixel (5 channels)', async () => {
      const buffer = createTestFloatTIFF({ channels: 3, sampleFormat: 3 });
      const view = new DataView(buffer);
      const le = true;
      const ifdOffset = 8;
      const numTags = view.getUint16(ifdOffset, le);
      for (let i = 0; i < numTags; i++) {
        const tagPos = ifdOffset + 2 + i * 12;
        const tagId = view.getUint16(tagPos, le);
        if (tagId === 277) { // SamplesPerPixel
          view.setUint16(tagPos + 8, 5, le); // Set to 5
          break;
        }
      }

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Unsupported samples per pixel: 5');
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
        if (tagId === 256) { // ImageWidth
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
        if (tagId === 257) { // ImageLength
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
        if (tagId === 256) { // ImageWidth
          view.setUint32(tagPos + 8, 100000, le);
        }
        if (tagId === 257) { // ImageLength
          view.setUint32(tagPos + 8, 100000, le);
        }
      }

      await expect(decodeTIFFFloat(buffer)).rejects.toThrow(/exceed maximum/);
    });

    it('should throw for deflate compression', async () => {
      const buffer = createTestFloatTIFF({ compression: 8, sampleFormat: 3 }); // Deflate
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Unsupported TIFF compression: 8');
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

      writeTag(256, 4, 1, width);          // ImageWidth
      writeTag(257, 4, 1, height);          // ImageLength
      writeTag(258, 3, channels, bpsArrayOffset); // BitsPerSample
      writeTag(259, 3, 1, 1);              // Compression=none
      writeTag(262, 3, 1, 2);              // Photometric=RGB
      writeTag(273, 4, numStrips, stripOffsetsArrayOffset); // StripOffsets
      writeTag(277, 3, 1, channels);       // SamplesPerPixel
      writeTag(278, 4, 1, rowsPerStrip);   // RowsPerStrip
      writeTag(279, 4, numStrips, stripByteCountsArrayOffset); // StripByteCounts
      writeTag(339, 3, 1, 3);             // SampleFormat=float

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
      expect(result.data[idx]).toBeCloseTo(4 * 0.1, 4);     // R = (2*2+0+0) * 0.1
      expect(result.data[idx + 1]).toBeCloseTo(5 * 0.1, 4); // G = (2*2+0+1) * 0.1
      expect(result.data[idx + 2]).toBeCloseTo(6 * 0.1, 4); // B = (2*2+0+2) * 0.1
      expect(result.data[idx + 3]).toBe(1.0);                 // A = 1.0 (RGB input)
    });
  });
});
