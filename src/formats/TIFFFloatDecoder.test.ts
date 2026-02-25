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

    it('should throw for JPEG compressed TIFF', async () => {
      // JPEG compression (7) is not supported
      const buffer = createTestFloatTIFF({ compression: 7, sampleFormat: 3 });
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Unsupported TIFF compression: 7');
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

    it('should throw for PackBits compression', async () => {
      const buffer = createTestFloatTIFF({ compression: 32773, sampleFormat: 3 }); // PackBits
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Unsupported TIFF compression: 32773');
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
        if (nextCode > (1 << codeSize) && codeSize < 12) {
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
    }
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

    writeTag(256, 4, 1, width);         // ImageWidth
    writeTag(257, 4, 1, height);        // ImageLength
    if (needsBPSArray) {
      writeTag(258, 3, channels, bpsArrayOffset);
    } else {
      writeTag(258, 3, 1, 32);
    }
    writeTag(259, 3, 1, compression);   // Compression
    writeTag(262, 3, 1, 2);             // PhotometricInterpretation=RGB
    if (numStrips > 1) {
      writeTag(273, 4, numStrips, stripOffsetsArrayOffset); // StripOffsets array
    } else {
      writeTag(273, 4, 1, pixelDataOffset); // Single strip offset
    }
    writeTag(277, 3, 1, channels);      // SamplesPerPixel
    writeTag(278, 4, 1, rowsPerStrip);  // RowsPerStrip
    if (numStrips > 1) {
      writeTag(279, 4, numStrips, stripByteCountsArrayOffset); // StripByteCounts array
    } else {
      writeTag(279, 4, 1, compressedData.length); // Single strip byte count
    }
    if (hasPredictor) {
      writeTag(317, 3, 1, predictor);    // Predictor
    }
    writeTag(339, 3, 1, 3);             // SampleFormat=float

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
    rowCount: number
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
    rowCount: number
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
    pixelValues?: number[]
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
      const width = 2, height = 2, channels = 3;
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
          expect(result.data[i * 4 + c]).toBeCloseTo(
            expectedView.getFloat32((i * channels + c) * 4, true), 4
          );
        }
        if (channels === 3) {
          expect(result.data[i * 4 + 3]).toBe(1.0);
        }
      }
    });

    it('TIFF-LZW002: should decode LZW compressed RGBA float TIFF', async () => {
      const width = 2, height = 2, channels = 4;
      const pixelValues = [
        0.1, 0.2, 0.3, 0.8,
        0.4, 0.5, 0.6, 0.9,
        0.7, 0.8, 0.9, 1.0,
        1.0, 0.0, 0.5, 0.5,
      ];
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
      const width = 2, height = 2, channels = 3;
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
          expect(result.data[i * 4 + c]).toBeCloseTo(
            expectedView.getFloat32((i * channels + c) * 4, false), 4
          );
        }
      }
    });

    it('TIFF-LZW004: should decode LZW compressed multi-strip TIFF', async () => {
      const width = 2, height = 4, channels = 3, rowsPerStrip = 2;
      const le = true;

      // Create separate strips
      const strip1Bytes = createFloatPixelBytes(width, rowsPerStrip, channels, le, [
        0.1, 0.2, 0.3, 0.4, 0.5, 0.6,
        0.7, 0.8, 0.9, 1.0, 0.0, 0.5,
      ]);
      const strip2Bytes = createFloatPixelBytes(width, rowsPerStrip, channels, le, [
        0.11, 0.22, 0.33, 0.44, 0.55, 0.66,
        0.77, 0.88, 0.99, 0.12, 0.34, 0.56,
      ]);

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
      const width = 2, height = 2, channels = 3;
      const le = true;

      const rawBytes = createFloatPixelBytes(width, height, channels, le, [
        0.1, 0.2, 0.3, 0.4, 0.5, 0.6,
        0.7, 0.8, 0.9, 1.0, 0.0, 0.5,
      ]);

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
      const width = 2, height = 2, channels = 3;
      const le = true;

      const rawBytes = createFloatPixelBytes(width, height, channels, le, [
        0.1, 0.2, 0.3, 0.4, 0.5, 0.6,
        0.7, 0.8, 0.9, 1.0, 0.0, 0.5,
      ]);

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
      const width = 1, height = 1, channels = 3;
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
      const width = 16, height = 16, channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(
            (x + y * width) / (width * height),
            (y * 0.05 + x * 0.01),
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

  // ==================== Deflate Compression Tests ====================

  describe('Deflate compression', () => {
    it('TIFF-DEF001: should decode Deflate (8) compressed RGB float TIFF', async () => {
      const width = 2, height = 2, channels = 3;
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
          expect(result.data[i * 4 + c]).toBeCloseTo(
            expectedView.getFloat32((i * channels + c) * 4, true), 4
          );
        }
        expect(result.data[i * 4 + 3]).toBe(1.0);
      }
    });

    it('TIFF-DEF002: should decode Adobe Deflate (32946) compressed RGBA float TIFF', async () => {
      const width = 2, height = 2, channels = 4;
      const pixelValues = [
        0.1, 0.2, 0.3, 0.8,
        0.4, 0.5, 0.6, 0.9,
        0.7, 0.8, 0.9, 1.0,
        1.0, 0.0, 0.5, 0.5,
      ];
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
      const width = 2, height = 2, channels = 3;
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
          expect(result.data[i * 4 + c]).toBeCloseTo(
            expectedView.getFloat32((i * channels + c) * 4, false), 4
          );
        }
      }
    });

    it('TIFF-DEF004: should decode Deflate compressed multi-strip TIFF', async () => {
      const width = 2, height = 4, channels = 3, rowsPerStrip = 2;
      const le = true;

      const strip1Bytes = createFloatPixelBytes(width, rowsPerStrip, channels, le, [
        0.1, 0.2, 0.3, 0.4, 0.5, 0.6,
        0.7, 0.8, 0.9, 1.0, 0.0, 0.5,
      ]);
      const strip2Bytes = createFloatPixelBytes(width, rowsPerStrip, channels, le, [
        0.11, 0.22, 0.33, 0.44, 0.55, 0.66,
        0.77, 0.88, 0.99, 0.12, 0.34, 0.56,
      ]);

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
      const width = 2, height = 2, channels = 3;
      const le = true;

      const rawBytes = createFloatPixelBytes(width, height, channels, le, [
        0.1, 0.2, 0.3, 0.4, 0.5, 0.6,
        0.7, 0.8, 0.9, 1.0, 0.0, 0.5,
      ]);

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
      const width = 2, height = 2, channels = 3;
      const le = true;

      const rawBytes = createFloatPixelBytes(width, height, channels, le, [
        0.1, 0.2, 0.3, 0.4, 0.5, 0.6,
        0.7, 0.8, 0.9, 1.0, 0.0, 0.5,
      ]);

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
      const width = 1, height = 1, channels = 3;
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

  // ==================== Compression Error Handling Tests ====================

  describe('Compression error handling', () => {
    it('TIFF-ERR001: should reject JPEG compression (7)', async () => {
      const buffer = createTestFloatTIFF({ compression: 7 });
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Unsupported TIFF compression: 7');
    });

    it('TIFF-ERR002: should reject PackBits compression (32773)', async () => {
      const buffer = createTestFloatTIFF({ compression: 32773 });
      await expect(decodeTIFFFloat(buffer)).rejects.toThrow('Unsupported TIFF compression: 32773');
    });

    it('TIFF-ERR003: should reject unsupported predictor', async () => {
      // Create a compressed TIFF with predictor=4 (unsupported)
      const width = 2, height = 2, channels = 3;
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
        width, height, tileWidth, tileHeight, channels, bigEndian, compression, predictor,
        compressedTiles, le, bytesPerSample
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
          width, height, tileWidth, tileHeight, channels, bigEndian, compression, predictor,
          compressedTiles, le, bytesPerSample
        );
      })();
    }

    // Uncompressed - use raw tile data
    return buildTiledTIFFBuffer(
      width, height, tileWidth, tileHeight, channels, bigEndian, compression, predictor,
      tileDataBuffers, le, bytesPerSample
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
    writeTag(256, 4, 1, width);             // ImageWidth
    writeTag(257, 4, 1, height);            // ImageLength
    if (needsBPSArray) {
      writeTag(258, 3, channels, bpsArrayOffset); // BitsPerSample
    } else {
      writeTag(258, 3, 1, 32);
    }
    writeTag(259, 3, 1, compression);       // Compression
    writeTag(262, 3, 1, 2);                 // Photometric=RGB
    writeTag(277, 3, 1, channels);          // SamplesPerPixel
    if (hasPredictor) {
      writeTag(317, 3, 1, predictor);       // Predictor
    }
    writeTag(322, 4, 1, tileWidth);         // TileWidth
    writeTag(323, 4, 1, tileHeight);        // TileLength
    if (numTiles === 1) {
      writeTag(324, 4, 1, tileDataStart);                     // TileOffsets (inline)
      writeTag(325, 4, 1, tileDataBuffers[0]!.length);        // TileByteCounts (inline)
    } else {
      writeTag(324, 4, numTiles, tileOffsetsArrayOffset);     // TileOffsets
      writeTag(325, 4, numTiles, tileByteCountsArrayOffset);  // TileByteCounts
    }
    writeTag(339, 3, 1, 3);                 // SampleFormat=float

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
      const width = 4, height = 4, tileWidth = 2, tileHeight = 2;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(x * 0.1, y * 0.1, (x + y) * 0.05);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width, height, tileWidth, tileHeight, channels: 3,
        pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(width * height * 4);

      // Verify pixel (0,0)
      expect(result.data[0]).toBeCloseTo(0, 4);    // R = 0 * 0.1
      expect(result.data[1]).toBeCloseTo(0, 4);    // G = 0 * 0.1
      expect(result.data[2]).toBeCloseTo(0, 4);    // B = (0+0) * 0.05
      expect(result.data[3]).toBe(1.0);              // A

      // Verify pixel (3, 2) - idx = (2*4+3)*4 = 44
      const idx = (2 * width + 3) * 4;
      expect(result.data[idx]).toBeCloseTo(0.3, 4);      // R = 3*0.1
      expect(result.data[idx + 1]).toBeCloseTo(0.2, 4);  // G = 2*0.1
      expect(result.data[idx + 2]).toBeCloseTo(0.25, 4); // B = (3+2)*0.05

      // Check metadata
      expect(result.metadata.tiled).toBe(true);
      expect(result.metadata.tileWidth).toBe(tileWidth);
      expect(result.metadata.tileLength).toBe(tileHeight);
    });

    it('TIFF-TILE002: should decode tiled TIFF with partial tiles at right/bottom edges', async () => {
      // 5x5 image with 4x4 tiles = 2x2 tile grid, right/bottom tiles partial
      const width = 5, height = 5, tileWidth = 4, tileHeight = 4;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(x * 0.1 + 0.01, y * 0.1 + 0.02, 0.5);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width, height, tileWidth, tileHeight, channels,
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
      const width = 4, height = 4, tileWidth = 2, tileHeight = 2;
      const channels = 4;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(0.1, 0.2, 0.3, 0.5);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width, height, tileWidth, tileHeight, channels,
        pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.channels).toBe(4);
      // Check alpha is preserved (not overwritten with 1.0)
      expect(result.data[3]).toBeCloseTo(0.5, 4);
      expect(result.data[7]).toBeCloseTo(0.5, 4);
    });

    it('TIFF-TILE004: should decode big-endian tiled TIFF', async () => {
      const width = 4, height = 4, tileWidth = 2, tileHeight = 2;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(0.25, 0.5, 0.75);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width, height, tileWidth, tileHeight, channels: 3,
        bigEndian: true, pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.data[0]).toBeCloseTo(0.25, 4);
      expect(result.data[1]).toBeCloseTo(0.5, 4);
      expect(result.data[2]).toBeCloseTo(0.75, 4);
    });

    it('TIFF-TILE005: should decode 1x1 tile (entire image is one tile)', async () => {
      const width = 1, height = 1, tileWidth = 1, tileHeight = 1;
      const pixelValues = [0.33, 0.66, 0.99];

      const tiffBuffer = createTiledTIFF({
        width, height, tileWidth, tileHeight, channels: 3,
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
      const width = 4, height = 4, tileWidth = 2, tileHeight = 2;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(x * 0.1, y * 0.2, 0.5);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width, height, tileWidth, tileHeight, channels,
        compression: 5, pixelValues,
      });

      const result = await decodeTIFFFloat(tiffBuffer as ArrayBuffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      // Verify pixel (1, 2) - idx = (2*4+1)*4 = 36
      const idx = (2 * width + 1) * 4;
      expect(result.data[idx]).toBeCloseTo(0.1, 4);   // R = 1*0.1
      expect(result.data[idx + 1]).toBeCloseTo(0.4, 4); // G = 2*0.2
      expect(result.data[idx + 2]).toBeCloseTo(0.5, 4); // B = 0.5
    });

    it('TIFF-TILE007: should decode Deflate compressed tiled TIFF', async () => {
      const width = 4, height = 4, tileWidth = 2, tileHeight = 2;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(x * 0.1, y * 0.2, 0.5);
        }
      }

      const tiffBuffer = await createTiledTIFF({
        width, height, tileWidth, tileHeight, channels,
        compression: 8, pixelValues,
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
      const width = 4, height = 4, tileWidth = 2, tileHeight = 2;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(0.1, 0.2, 0.3);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width, height, tileWidth, tileHeight, channels,
        compression: 5, predictor: 2, pixelValues,
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
      const width = 4, height = 4, tileWidth = 2, tileHeight = 2;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(0.4, 0.5, 0.6);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width, height, tileWidth, tileHeight, channels,
        compression: 5, predictor: 3, pixelValues,
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
      const width = 8, height = 6, tileWidth = 4, tileHeight = 3;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(x / width, y / height, 0.5);
        }
      }

      const tiffBuffer = createTiledTIFF({
        width, height, tileWidth, tileHeight, channels,
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
      const width = 2, height = 2, tileWidth = 8, tileHeight = 8;
      const pixelValues = [
        0.1, 0.2, 0.3,
        0.4, 0.5, 0.6,
        0.7, 0.8, 0.9,
        1.0, 0.0, 0.5,
      ];

      const tiffBuffer = createTiledTIFF({
        width, height, tileWidth, tileHeight, channels: 3,
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
      const width = 4, height = 4, tileWidth = 2, tileHeight = 2;
      const channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(0.5, 0.5, 0.5);
        }
      }

      const fullBuffer = await createTiledTIFF({
        width, height, tileWidth, tileHeight, channels,
        compression: 5, // LZW
        pixelValues,
      });

      // Truncate the buffer to remove half of the tile data
      const truncatedBuffer = (fullBuffer as ArrayBuffer).slice(0, Math.floor((fullBuffer as ArrayBuffer).byteLength * 0.7));

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
      const width = 4, height = 4, channels = 3;
      const pixelValues: number[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixelValues.push(x * 0.15, y * 0.25, (x + y) * 0.05);
        }
      }

      // Strip-based TIFF
      const stripBuffer = createTestFloatTIFF({
        width, height, channels,
        pixelValues,
      });
      const stripResult = await decodeTIFFFloat(stripBuffer);

      // Tiled TIFF with 2x2 tiles
      const tiledBuffer = createTiledTIFF({
        width, height, tileWidth: 2, tileHeight: 2, channels,
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
});
