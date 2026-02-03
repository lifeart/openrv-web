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
  });
});
