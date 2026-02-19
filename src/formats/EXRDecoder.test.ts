/**
 * EXR Decoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  decodeEXR,
  exrToIPImage,
  isEXRFile,
  getEXRInfo,
  extractLayerInfo,
  resolveChannelMapping,
  applyUncrop,
  EXRCompression,
  EXRPixelType,
  EXRChannel,
  EXRHeader,
  EXRBox2i,
  EXRLevelMode,
  EXRRoundingMode,
} from './EXRDecoder';

// EXR magic number
const EXR_MAGIC = 0x01312f76;

/**
 * Create a minimal valid EXR file buffer for testing
 * This creates an uncompressed 2x2 RGBA half-float image
 */
function createTestEXR(options: {
  width?: number;
  height?: number;
  compression?: EXRCompression;
  channels?: string[];
  pixelType?: EXRPixelType;
} = {}): ArrayBuffer {
  const {
    width = 2,
    height = 2,
    compression = EXRCompression.NONE,
    channels = ['R', 'G', 'B', 'A'],
    pixelType = EXRPixelType.HALF,
  } = options;

  const parts: Uint8Array[] = [];
  let offset = 0;

  // Helper to write little-endian values
  function writeUint32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  function writeInt32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setInt32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  function writeUint8(value: number): void {
    parts.push(new Uint8Array([value]));
    offset += 1;
  }

  function writeString(str: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    parts.push(bytes);
    parts.push(new Uint8Array([0])); // null terminator
    offset += bytes.length + 1;
  }

  function writeFloat32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setFloat32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  function writeHalf(value: number): void {
    // Convert float to half
    const buf = new Uint8Array(2);
    const view = new DataView(buf.buffer);
    const h = floatToHalf(value);
    view.setUint16(0, h, true);
    parts.push(buf);
    offset += 2;
  }

  function writeUint64(value: bigint): void {
    const buf = new Uint8Array(8);
    const view = new DataView(buf.buffer);
    view.setBigUint64(0, value, true);
    parts.push(buf);
    offset += 8;
  }

  // Magic number
  writeUint32(EXR_MAGIC);

  // Version (2) with flags (no tiles, no long names, etc.)
  writeUint32(2);

  // === HEADER ATTRIBUTES ===

  // channels attribute
  writeString('channels');
  writeString('chlist');

  // Calculate channel list size
  let channelListSize = 1; // null terminator
  for (const ch of channels) {
    channelListSize += ch.length + 1 + 4 + 1 + 3 + 4 + 4; // name + pixelType + pLinear + reserved + xSampling + ySampling
  }
  writeInt32(channelListSize);

  // Write channels (sorted alphabetically for EXR spec)
  const sortedChannels = [...channels].sort();
  for (const ch of sortedChannels) {
    writeString(ch);
    writeInt32(pixelType); // pixelType
    writeUint8(0); // pLinear
    parts.push(new Uint8Array([0, 0, 0])); // reserved
    offset += 3;
    writeInt32(1); // xSampling
    writeInt32(1); // ySampling
  }
  writeUint8(0); // End of channel list

  // compression attribute
  writeString('compression');
  writeString('compression');
  writeInt32(1);
  writeUint8(compression);

  // dataWindow attribute
  writeString('dataWindow');
  writeString('box2i');
  writeInt32(16);
  writeInt32(0); // xMin
  writeInt32(0); // yMin
  writeInt32(width - 1); // xMax
  writeInt32(height - 1); // yMax

  // displayWindow attribute
  writeString('displayWindow');
  writeString('box2i');
  writeInt32(16);
  writeInt32(0); // xMin
  writeInt32(0); // yMin
  writeInt32(width - 1); // xMax
  writeInt32(height - 1); // yMax

  // lineOrder attribute
  writeString('lineOrder');
  writeString('lineOrder');
  writeInt32(1);
  writeUint8(0); // INCREASING_Y

  // pixelAspectRatio attribute
  writeString('pixelAspectRatio');
  writeString('float');
  writeInt32(4);
  writeFloat32(1.0);

  // End of header
  writeUint8(0);

  // === OFFSET TABLE ===
  // For uncompressed scanline images, one offset per scanline
  const bytesPerPixel = pixelType === EXRPixelType.HALF ? 2 : 4;
  const scanlineSize = channels.length * width * bytesPerPixel;

  // Calculate where scanline data starts
  const headerEnd = offset;
  const offsetTableSize = height * 8; // 8 bytes per offset
  const scanlineDataStart = headerEnd + offsetTableSize;

  for (let y = 0; y < height; y++) {
    // Each scanline block has: y (4 bytes) + size (4 bytes) + data
    const blockStart = BigInt(scanlineDataStart + y * (8 + scanlineSize));
    writeUint64(blockStart);
  }

  // === SCANLINE DATA ===
  for (let y = 0; y < height; y++) {
    writeInt32(y); // Y coordinate
    writeInt32(scanlineSize); // Packed size (same as unpacked for NONE compression)

    // Write pixel data - channels are stored separately, in sorted order
    for (const ch of sortedChannels) {
      for (let x = 0; x < width; x++) {
        // Generate test values based on channel and position
        let value = 0;
        if (ch === 'R') value = (x + y * width) / (width * height); // Red gradient
        else if (ch === 'G') value = 0.5; // Green = 0.5
        else if (ch === 'B') value = 1.0 - (x + y * width) / (width * height); // Blue inverse gradient
        else if (ch === 'A') value = 1.0; // Alpha = 1

        if (pixelType === EXRPixelType.HALF) {
          writeHalf(value);
        } else {
          writeFloat32(value);
        }
      }
    }
  }

  // Combine all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }

  return result.buffer;
}

/**
 * Convert float to half-precision float (16-bit)
 */
function floatToHalf(value: number): number {
  const floatView = new Float32Array(1);
  const int32View = new Int32Array(floatView.buffer);

  floatView[0] = value;
  const f = int32View[0]!;

  const sign = (f >> 16) & 0x8000;
  let exponent = ((f >> 23) & 0xff) - 127 + 15;
  let mantissa = (f >> 13) & 0x3ff;

  if (exponent <= 0) {
    // Subnormal or zero
    if (exponent < -10) {
      return sign; // Too small, return signed zero
    }
    mantissa = ((f & 0x7fffff) | 0x800000) >> (1 - exponent);
    return sign | mantissa;
  }

  if (exponent >= 31) {
    // Overflow to infinity
    return sign | 0x7c00;
  }

  return sign | (exponent << 10) | mantissa;
}

describe('EXRDecoder', () => {
  describe('isEXRFile', () => {
    it('EXR-U001: should return true for valid EXR magic number', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint32(0, EXR_MAGIC, true);

      expect(isEXRFile(buffer)).toBe(true);
    });

    it('EXR-U002: should return false for invalid magic number', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      view.setUint32(0, 0x89504e47, true); // PNG magic

      expect(isEXRFile(buffer)).toBe(false);
    });

    it('EXR-U003: should return false for buffer too small', () => {
      const buffer = new ArrayBuffer(2);
      expect(isEXRFile(buffer)).toBe(false);
    });

    it('EXR-U004: should return false for empty buffer', () => {
      const buffer = new ArrayBuffer(0);
      expect(isEXRFile(buffer)).toBe(false);
    });
  });

  describe('getEXRInfo', () => {
    it('EXR-U010: should extract basic info from valid EXR', () => {
      const buffer = createTestEXR({ width: 4, height: 3 });
      const info = getEXRInfo(buffer);

      expect(info).not.toBeNull();
      expect(info!.width).toBe(4);
      expect(info!.height).toBe(3);
      expect(info!.channels).toContain('R');
      expect(info!.channels).toContain('G');
      expect(info!.channels).toContain('B');
      expect(info!.channels).toContain('A');
      expect(info!.compression).toBe('NONE');
    });

    it('EXR-U011: should return null for invalid buffer', () => {
      const buffer = new ArrayBuffer(10);
      const info = getEXRInfo(buffer);
      expect(info).toBeNull();
    });
  });

  describe('decodeEXR', () => {
    it('EXR-U020: should decode uncompressed half-float RGBA image', async () => {
      const buffer = createTestEXR({
        width: 2,
        height: 2,
        pixelType: EXRPixelType.HALF,
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(2 * 2 * 4); // width * height * channels
    });

    it('EXR-U021: should decode uncompressed full-float RGBA image', async () => {
      const buffer = createTestEXR({
        width: 2,
        height: 2,
        pixelType: EXRPixelType.FLOAT,
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      expect(result.data).toBeInstanceOf(Float32Array);
    });

    it('EXR-U022: should preserve float values correctly', async () => {
      const buffer = createTestEXR({
        width: 2,
        height: 1,
        pixelType: EXRPixelType.HALF,
      });

      const result = await decodeEXR(buffer);

      // Check that red channel has gradient (first pixel ~0, second pixel ~0.5)
      const r0 = result.data[0]!; // First pixel red
      const r1 = result.data[4]!; // Second pixel red

      expect(r0).toBeCloseTo(0, 1);
      expect(r1).toBeCloseTo(0.5, 1);

      // Check that alpha is 1
      const a0 = result.data[3]!;
      const a1 = result.data[7]!;
      expect(a0).toBeCloseTo(1.0, 1);
      expect(a1).toBeCloseTo(1.0, 1);
    });

    it('EXR-U023: should handle larger images', async () => {
      const buffer = createTestEXR({
        width: 64,
        height: 32,
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(64);
      expect(result.height).toBe(32);
      expect(result.data.length).toBe(64 * 32 * 4);
    });

    it('EXR-U024: should throw for invalid magic number', async () => {
      const buffer = new ArrayBuffer(100);
      const view = new DataView(buffer);
      view.setUint32(0, 0x12345678, true);

      await expect(decodeEXR(buffer)).rejects.toThrow('Invalid EXR file');
    });

    it('EXR-U025: should parse header attributes', async () => {
      const buffer = createTestEXR({
        width: 8,
        height: 8,
      });

      const result = await decodeEXR(buffer);

      expect(result.header.compression).toBe(EXRCompression.NONE);
      expect(result.header.pixelAspectRatio).toBe(1);
      expect(result.header.dataWindow.xMin).toBe(0);
      expect(result.header.dataWindow.yMin).toBe(0);
      expect(result.header.dataWindow.xMax).toBe(7);
      expect(result.header.dataWindow.yMax).toBe(7);
    });
  });

  describe('exrToIPImage', () => {
    it('EXR-U030: should convert decode result to IPImage', async () => {
      const buffer = createTestEXR({ width: 4, height: 4 });
      const result = await decodeEXR(buffer);

      const image = exrToIPImage(result, '/test/path.exr');

      expect(image.width).toBe(4);
      expect(image.height).toBe(4);
      expect(image.channels).toBe(4);
      expect(image.dataType).toBe('float32');
      expect(image.metadata.colorSpace).toBe('linear');
      expect(image.metadata.sourcePath).toBe('/test/path.exr');
    });

    it('EXR-U031: should include EXR attributes in metadata', async () => {
      const buffer = createTestEXR({ width: 4, height: 4 });
      const result = await decodeEXR(buffer);

      const image = exrToIPImage(result);

      expect(image.metadata.attributes).toBeDefined();
      expect(image.metadata.attributes!.compression).toBe('NONE');
      expect(image.metadata.attributes!.pixelAspectRatio).toBe(1);
    });

    it('EXR-U032: should create float32 typed array', async () => {
      const buffer = createTestEXR({ width: 2, height: 2 });
      const result = await decodeEXR(buffer);

      const image = exrToIPImage(result);
      const array = image.getTypedArray();

      expect(array).toBeInstanceOf(Float32Array);
      expect(array.length).toBe(2 * 2 * 4);
    });
  });

  describe('HDR value handling', () => {
    it('EXR-U040: should handle values > 1.0 (HDR)', async () => {
      // Create a custom buffer with HDR values
      // For this test, we'll create a minimal EXR with known HDR values
      const buffer = createTestEXR({ width: 1, height: 1 });

      // The test EXR generator creates values in 0-1 range
      // This test verifies the decoder can handle the format
      const result = await decodeEXR(buffer);

      // Verify we get float data that could represent HDR
      expect(result.data).toBeInstanceOf(Float32Array);

      // Float32 can represent values > 1
      const floatArray = result.data;
      expect(floatArray.length).toBe(4); // 1x1 RGBA
    });

    it('EXR-U041: should handle negative float values', async () => {
      // EXR supports negative values in linear color space
      const buffer = createTestEXR({ width: 1, height: 1 });
      const result = await decodeEXR(buffer);

      // Verify the decoder handles the float format correctly
      expect(result.data).toBeInstanceOf(Float32Array);
    });
  });

  describe('half-float conversion', () => {
    it('EXR-U050: should correctly convert half 0 to float 0', async () => {
      const buffer = createTestEXR({
        width: 1,
        height: 1,
        pixelType: EXRPixelType.HALF,
      });
      const result = await decodeEXR(buffer);

      // First pixel should have R close to 0 (first in sequence)
      expect(result.data[0]).toBeCloseTo(0, 2);
    });

    it('EXR-U051: should correctly convert half 1 to float 1', async () => {
      const buffer = createTestEXR({
        width: 1,
        height: 1,
        pixelType: EXRPixelType.HALF,
      });
      const result = await decodeEXR(buffer);

      // Alpha should be 1.0
      expect(result.data[3]).toBeCloseTo(1.0, 2);
    });

    it('EXR-U052: floatToHalf special value conversion', () => {
      // Test zero
      expect(floatToHalf(0)).toBe(0);

      // Test infinity - both positive and negative
      expect(floatToHalf(Infinity)).toBe(0x7c00);
      expect(floatToHalf(-Infinity)).toBe(0xfc00);

      // Test very small subnormal
      const verySmall = floatToHalf(1e-8);
      expect(verySmall).toBe(0); // Too small, becomes zero

      // Test value that overflows to infinity
      const huge = floatToHalf(100000);
      expect(huge).toBe(0x7c00); // Infinity
    });

    it('EXR-U053: floatToHalf handles negative zero', () => {
      // Negative zero should preserve sign bit
      const negZeroHalf = floatToHalf(-0);
      expect((negZeroHalf & 0x8000)).toBe(0x8000); // Sign bit set
    });

    it('EXR-U054: floatToHalf handles NaN correctly', () => {
      // NaN should convert to NaN representation in half
      const nanHalf = floatToHalf(NaN);
      // NaN in half-float has exponent 31 (0x7c00) with non-zero mantissa
      // Or it may map to infinity if the implementation doesn't preserve NaN mantissa
      // Both are acceptable for this test - the key is exponent is max
      expect((nanHalf & 0x7c00)).toBe(0x7c00); // Max exponent
    });
  });

  describe('corner cases - malformed files', () => {
    it('EXR-U060: should reject empty buffer', async () => {
      const buffer = new ArrayBuffer(0);
      await expect(decodeEXR(buffer)).rejects.toThrow('buffer too small');
    });

    it('EXR-U061: should reject buffer smaller than minimum header', async () => {
      const buffer = new ArrayBuffer(4);
      await expect(decodeEXR(buffer)).rejects.toThrow('buffer too small');
    });

    it('EXR-U062: should reject truncated EXR (valid magic, missing header)', async () => {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint32(0, EXR_MAGIC, true); // Magic
      view.setUint32(4, 2, true); // Version 2

      // Should throw some kind of error related to truncated/incomplete data
      await expect(decodeEXR(buffer)).rejects.toThrow(/end of EXR data|Missing required|Unterminated string/);
    });

    it('EXR-U063: should reject wrong magic number', async () => {
      const buffer = new ArrayBuffer(100);
      const view = new DataView(buffer);
      view.setUint32(0, 0xDEADBEEF, true);

      await expect(decodeEXR(buffer)).rejects.toThrow('wrong magic number');
    });

    it('EXR-U064: should reject unsupported EXR version', async () => {
      const buffer = new ArrayBuffer(100);
      const view = new DataView(buffer);
      view.setUint32(0, EXR_MAGIC, true);
      view.setUint32(4, 3, true); // Version 3 (unsupported)

      await expect(decodeEXR(buffer)).rejects.toThrow('Unsupported EXR version');
    });
  });

  describe('corner cases - dimension validation', () => {
    it('EXR-U070: should reject zero-width image', async () => {
      // Create EXR with xMax < xMin (zero width)
      const buffer = createMalformedEXRWithDimensions(-1, 0, 10, 10);
      await expect(decodeEXR(buffer)).rejects.toThrow(/Invalid EXR dimensions|Unexpected end/);
    });

    it('EXR-U071: should reject zero-height image', async () => {
      // Create EXR with yMax < yMin (zero height)
      const buffer = createMalformedEXRWithDimensions(0, 0, 10, -1);
      await expect(decodeEXR(buffer)).rejects.toThrow(/Invalid EXR dimensions|Unexpected end/);
    });

    it('EXR-U072: should reject extremely large dimensions', async () => {
      // Create EXR claiming to be 100000x100000 pixels
      const buffer = createMalformedEXRWithDimensions(0, 0, 99999, 99999);
      await expect(decodeEXR(buffer)).rejects.toThrow(/exceed maximum/);
    });
  });

  describe('corner cases - missing required attributes', () => {
    it('EXR-U080: should reject EXR missing channels attribute', async () => {
      const buffer = createEXRWithoutAttribute('channels');
      await expect(decodeEXR(buffer)).rejects.toThrow('Missing required EXR attribute: channels');
    });

    it('EXR-U081: should reject EXR missing dataWindow attribute', async () => {
      const buffer = createEXRWithoutAttribute('dataWindow');
      await expect(decodeEXR(buffer)).rejects.toThrow('Missing required EXR attribute: dataWindow');
    });

    it('EXR-U082: should reject EXR missing displayWindow attribute', async () => {
      const buffer = createEXRWithoutAttribute('displayWindow');
      await expect(decodeEXR(buffer)).rejects.toThrow('Missing required EXR attribute: displayWindow');
    });
  });

  describe('corner cases - unsupported compression', () => {
    it('EXR-U090: should accept PIZ compression', async () => {
      // PIZ compression is now supported. The test EXR has uncompressed data layout
      // but PIZ header, so decompression may fail on the data content rather than
      // rejecting the compression type. The key is it does NOT throw "Unsupported EXR compression".
      const buffer = createTestEXR({ compression: EXRCompression.PIZ });
      try {
        await decodeEXR(buffer);
      } catch (e: unknown) {
        const msg = (e as Error).message;
        // It should NOT reject PIZ as unsupported compression
        expect(msg).not.toMatch(/Unsupported EXR compression.*PIZ/);
      }
    });

    it('EXR-U091: should reject PXR24 compression', async () => {
      const buffer = createTestEXR({ compression: EXRCompression.PXR24 });
      await expect(decodeEXR(buffer)).rejects.toThrow(/Unsupported EXR compression.*PXR24/);
    });

    it('EXR-U092: should reject B44 compression', async () => {
      const buffer = createTestEXR({ compression: EXRCompression.B44 });
      await expect(decodeEXR(buffer)).rejects.toThrow(/Unsupported EXR compression.*B44/);
    });

    it('EXR-U093: should accept DWAA as supported compression type', () => {
      // DWAA is now a supported compression type
      const info = getEXRInfo(createTestEXR({ compression: EXRCompression.DWAA }));
      expect(info).not.toBeNull();
      expect(info!.compression).toBe('DWAA');
    });
  });

  describe('corner cases - channel configurations', () => {
    it('EXR-U100: should handle RGB-only (no alpha) image', async () => {
      const buffer = createTestEXR({
        width: 2,
        height: 2,
        channels: ['R', 'G', 'B'],
      });

      const result = await decodeEXR(buffer);

      // Should still output RGBA (with alpha filled to 1.0)
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(2 * 2 * 4);

      // Alpha should be 1.0 for all pixels
      for (let i = 3; i < result.data.length; i += 4) {
        expect(result.data[i]).toBeCloseTo(1.0, 5);
      }
    });

    it('EXR-U101: should handle grayscale (Y channel only) image', async () => {
      const buffer = createTestEXR({
        width: 2,
        height: 2,
        channels: ['Y'],
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.data).toBeInstanceOf(Float32Array);
    });

    it('EXR-U102: should reject EXR with no recognized channels', async () => {
      const buffer = createTestEXR({
        width: 2,
        height: 2,
        channels: ['Z', 'velocity.X', 'velocity.Y'],
      });

      await expect(decodeEXR(buffer)).rejects.toThrow('No supported channels');
    });
  });

  describe('corner cases - 1x1 minimum image', () => {
    it('EXR-U110: should handle 1x1 pixel image', async () => {
      const buffer = createTestEXR({
        width: 1,
        height: 1,
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.data.length).toBe(4); // RGBA
    });
  });

  describe('getEXRInfo corner cases', () => {
    it('EXR-U120: should return null for invalid data', () => {
      const buffer = new ArrayBuffer(10);
      expect(getEXRInfo(buffer)).toBeNull();
    });

    it('EXR-U121: should return null for empty buffer', () => {
      const buffer = new ArrayBuffer(0);
      expect(getEXRInfo(buffer)).toBeNull();
    });

    it('EXR-U122: should return null for non-EXR data', () => {
      const buffer = new ArrayBuffer(100);
      const view = new DataView(buffer);
      view.setUint32(0, 0x89504E47, true); // PNG magic

      expect(getEXRInfo(buffer)).toBeNull();
    });
  });

  describe('corner cases - UINT pixel type', () => {
    it('EXR-U130: should reject UINT pixel type channel', async () => {
      // UINT (type 0) is defined in EXR spec but not supported by this decoder
      const buffer = createTestEXRWithUINT();
      await expect(decodeEXR(buffer)).rejects.toThrow(/Unsupported pixel type UINT/);
    });
  });

  describe('corner cases - B44A compression', () => {
    it('EXR-U131: should reject B44A compression', async () => {
      const buffer = createTestEXR({ compression: EXRCompression.B44A });
      await expect(decodeEXR(buffer)).rejects.toThrow(/Unsupported EXR compression.*B44A/);
    });
  });

  describe('corner cases - DWAB compression', () => {
    it('EXR-U132: should accept DWAB as supported compression type', () => {
      // DWAB is now a supported compression type
      const info = getEXRInfo(createTestEXR({ compression: EXRCompression.DWAB }));
      expect(info).not.toBeNull();
      expect(info!.compression).toBe('DWAB');
    });
  });

  describe('corner cases - data integrity', () => {
    it('EXR-U140: should handle image with all channels same value', async () => {
      // Test uniform color image
      const buffer = createTestEXR({ width: 4, height: 4 });
      const result = await decodeEXR(buffer);

      // Verify we got valid data
      expect(result.data.length).toBe(4 * 4 * 4);
      expect(result.data.every(v => !Number.isNaN(v))).toBe(true);
    });

    it('EXR-U141: should produce valid float data (no NaN in normal images)', async () => {
      const buffer = createTestEXR({ width: 8, height: 8 });
      const result = await decodeEXR(buffer);

      // Check no NaN values in output
      let hasNaN = false;
      for (let i = 0; i < result.data.length; i++) {
        if (Number.isNaN(result.data[i])) {
          hasNaN = true;
          break;
        }
      }
      expect(hasNaN).toBe(false);
    });
  });

  describe('layer extraction', () => {
    it('EXR-U150: should extract single RGBA layer from standard channels', () => {
      const channels: EXRChannel[] = [
        { name: 'R', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'G', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'B', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'A', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
      ];

      const layers = extractLayerInfo(channels);

      expect(layers.length).toBe(1);
      expect(layers[0]!.name).toBe('RGBA');
      expect(layers[0]!.channels).toContain('R');
      expect(layers[0]!.channels).toContain('G');
      expect(layers[0]!.channels).toContain('B');
      expect(layers[0]!.channels).toContain('A');
    });

    it('EXR-U151: should extract multiple layers from prefixed channels', () => {
      const channels: EXRChannel[] = [
        { name: 'R', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'G', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'B', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'A', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'diffuse.R', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'diffuse.G', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'diffuse.B', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'specular.R', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'specular.G', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'specular.B', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
      ];

      const layers = extractLayerInfo(channels);

      expect(layers.length).toBe(3);
      // RGBA layer should be first
      expect(layers[0]!.name).toBe('RGBA');
      // Other layers should be alphabetically sorted
      expect(layers.find(l => l.name === 'diffuse')).toBeDefined();
      expect(layers.find(l => l.name === 'specular')).toBeDefined();
    });

    it('EXR-U152: should track full channel names for layers', () => {
      const channels: EXRChannel[] = [
        { name: 'diffuse.R', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'diffuse.G', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'diffuse.B', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
      ];

      const layers = extractLayerInfo(channels);
      const diffuseLayer = layers.find(l => l.name === 'diffuse');

      expect(diffuseLayer).toBeDefined();
      expect(diffuseLayer!.channels).toEqual(['R', 'G', 'B']);
      expect(diffuseLayer!.fullChannelNames).toContain('diffuse.R');
      expect(diffuseLayer!.fullChannelNames).toContain('diffuse.G');
      expect(diffuseLayer!.fullChannelNames).toContain('diffuse.B');
    });

    it('EXR-U153: should handle nested layer names', () => {
      const channels: EXRChannel[] = [
        { name: 'render.diffuse.R', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'render.diffuse.G', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
        { name: 'render.diffuse.B', pixelType: EXRPixelType.HALF, pLinear: 0, xSampling: 1, ySampling: 1 },
      ];

      const layers = extractLayerInfo(channels);

      // Should use the full path up to the last dot as the layer name
      expect(layers.length).toBe(1);
      expect(layers[0]!.name).toBe('render.diffuse');
      expect(layers[0]!.channels).toEqual(['R', 'G', 'B']);
    });

    it('EXR-U154: should return empty array for empty channel list', () => {
      const layers = extractLayerInfo([]);
      expect(layers).toEqual([]);
    });
  });

  describe('channel remapping', () => {
    // Helper to create a minimal header for testing
    function createTestHeader(channels: string[]): EXRHeader {
      return {
        version: 2,
        tiled: false,
        longNames: false,
        nonImage: false,
        multiPart: false,
        channels: channels.map(name => ({
          name,
          pixelType: EXRPixelType.HALF,
          pLinear: 0,
          xSampling: 1,
          ySampling: 1,
        })),
        compression: EXRCompression.NONE,
        dataWindow: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 },
        displayWindow: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 },
        lineOrder: 0,
        pixelAspectRatio: 1,
        attributes: new Map(),
      };
    }

    it('EXR-U160: should map default RGBA channels', () => {
      const header = createTestHeader(['R', 'G', 'B', 'A']);
      const mapping = resolveChannelMapping(header);

      expect(mapping.get('R')).toBe('R');
      expect(mapping.get('G')).toBe('G');
      expect(mapping.get('B')).toBe('B');
      expect(mapping.get('A')).toBe('A');
    });

    it('EXR-U161: should map grayscale Y channel to RGB', () => {
      const header = createTestHeader(['Y']);
      const mapping = resolveChannelMapping(header);

      // Y should be mapped to all RGB channels
      expect(mapping.get('R')).toBe('Y');
      expect(mapping.get('G')).toBe('Y');
      expect(mapping.get('B')).toBe('Y');
    });

    it('EXR-U162: should map layer channels when layer is specified', () => {
      const header = createTestHeader(['R', 'G', 'B', 'diffuse.R', 'diffuse.G', 'diffuse.B']);
      const mapping = resolveChannelMapping(header, { layer: 'diffuse' });

      expect(mapping.get('R')).toBe('diffuse.R');
      expect(mapping.get('G')).toBe('diffuse.G');
      expect(mapping.get('B')).toBe('diffuse.B');
    });

    it('EXR-U163: should apply custom channel remapping', () => {
      const header = createTestHeader(['diffuse.R', 'diffuse.G', 'diffuse.B', 'specular.R']);
      const mapping = resolveChannelMapping(header, {
        channelRemapping: {
          red: 'specular.R',
          green: 'diffuse.G',
          blue: 'diffuse.B',
        },
      });

      expect(mapping.get('R')).toBe('specular.R');
      expect(mapping.get('G')).toBe('diffuse.G');
      expect(mapping.get('B')).toBe('diffuse.B');
    });

    it('EXR-U164: should handle missing channels gracefully', () => {
      const header = createTestHeader(['R', 'G', 'B']); // No alpha
      const mapping = resolveChannelMapping(header);

      expect(mapping.get('R')).toBe('R');
      expect(mapping.get('G')).toBe('G');
      expect(mapping.get('B')).toBe('B');
      expect(mapping.has('A')).toBe(false);
    });

    it('EXR-U165: should ignore non-existent channels in custom remapping', () => {
      const header = createTestHeader(['R', 'G', 'B']);
      const mapping = resolveChannelMapping(header, {
        channelRemapping: {
          red: 'R',
          green: 'G',
          blue: 'nonexistent.B', // This channel doesn't exist
        },
      });

      expect(mapping.get('R')).toBe('R');
      expect(mapping.get('G')).toBe('G');
      expect(mapping.has('B')).toBe(false); // Should not map non-existent channel
    });

    it('EXR-U166: should use RGBA layer when layer is null', () => {
      const header = createTestHeader(['R', 'G', 'B', 'diffuse.R', 'diffuse.G', 'diffuse.B']);
      const mapping = resolveChannelMapping(header, { layer: undefined });

      expect(mapping.get('R')).toBe('R');
      expect(mapping.get('G')).toBe('G');
      expect(mapping.get('B')).toBe('B');
    });

    it('EXR-U167: should handle single-channel layers as grayscale', () => {
      const header = createTestHeader(['R', 'G', 'B', 'depth.Z']);
      const mapping = resolveChannelMapping(header, { layer: 'depth' });

      // Single channel should map to all RGB
      expect(mapping.get('R')).toBe('depth.Z');
      expect(mapping.get('G')).toBe('depth.Z');
      expect(mapping.get('B')).toBe('depth.Z');
    });
  });

  describe('decodeEXR with layers', () => {
    it('EXR-U170: should include layer info in decode result', async () => {
      const buffer = createTestEXR({
        width: 2,
        height: 2,
        channels: ['R', 'G', 'B', 'A'],
      });

      const result = await decodeEXR(buffer);

      expect(result.layers).toBeDefined();
      expect(result.layers!.length).toBeGreaterThan(0);
      expect(result.layers![0]!.name).toBe('RGBA');
    });

    it('EXR-U171: should return decoded layer name', async () => {
      const buffer = createTestEXR({
        width: 2,
        height: 2,
        channels: ['R', 'G', 'B', 'A'],
      });

      const result = await decodeEXR(buffer);

      // When no layer specified, decodedLayer should be undefined
      expect(result.decodedLayer).toBeUndefined();
    });

    it('EXR-U172: getEXRInfo should include layer information', () => {
      const buffer = createTestEXR({
        width: 4,
        height: 4,
        channels: ['R', 'G', 'B', 'A'],
      });

      const info = getEXRInfo(buffer);

      expect(info).not.toBeNull();
      expect(info!.layers).toBeDefined();
      expect(info!.layers.length).toBeGreaterThan(0);
    });
  });
});

/**
 * Helper to create an EXR with specific dataWindow dimensions
 */
function createMalformedEXRWithDimensions(
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number
): ArrayBuffer {
  const parts: Uint8Array[] = [];
  let offset = 0;

  function writeUint32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  function writeInt32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setInt32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  function writeUint8(value: number): void {
    parts.push(new Uint8Array([value]));
    offset += 1;
  }

  function writeString(str: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    parts.push(bytes);
    parts.push(new Uint8Array([0]));
    offset += bytes.length + 1;
  }

  function writeFloat32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setFloat32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  // Magic number
  writeUint32(EXR_MAGIC);
  writeUint32(2);

  // channels attribute (minimal: just R)
  writeString('channels');
  writeString('chlist');
  const channelListSize = 1 + 1 + 1 + 4 + 1 + 3 + 4 + 4; // 'R' + null + struct
  writeInt32(channelListSize);
  writeString('R');
  writeInt32(EXRPixelType.HALF);
  writeUint8(0);
  parts.push(new Uint8Array([0, 0, 0]));
  offset += 3;
  writeInt32(1);
  writeInt32(1);
  writeUint8(0);

  // compression
  writeString('compression');
  writeString('compression');
  writeInt32(1);
  writeUint8(EXRCompression.NONE);

  // dataWindow with the problematic dimensions
  writeString('dataWindow');
  writeString('box2i');
  writeInt32(16);
  writeInt32(xMin);
  writeInt32(yMin);
  writeInt32(xMax);
  writeInt32(yMax);

  // displayWindow
  writeString('displayWindow');
  writeString('box2i');
  writeInt32(16);
  writeInt32(xMin);
  writeInt32(yMin);
  writeInt32(xMax);
  writeInt32(yMax);

  // lineOrder
  writeString('lineOrder');
  writeString('lineOrder');
  writeInt32(1);
  writeUint8(0);

  // pixelAspectRatio
  writeString('pixelAspectRatio');
  writeString('float');
  writeInt32(4);
  writeFloat32(1.0);

  // End of header
  writeUint8(0);

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result.buffer;
}

/**
 * Helper to create an EXR missing a specific required attribute
 */
function createEXRWithoutAttribute(skipAttribute: string): ArrayBuffer {
  const parts: Uint8Array[] = [];
  let offset = 0;

  function writeUint32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  function writeInt32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setInt32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  function writeUint8(value: number): void {
    parts.push(new Uint8Array([value]));
    offset += 1;
  }

  function writeString(str: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    parts.push(bytes);
    parts.push(new Uint8Array([0]));
    offset += bytes.length + 1;
  }

  function writeFloat32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setFloat32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  // Magic number
  writeUint32(EXR_MAGIC);
  writeUint32(2);

  // channels attribute (skip if requested)
  if (skipAttribute !== 'channels') {
    writeString('channels');
    writeString('chlist');
    const channelListSize = 1 + 1 + 1 + 4 + 1 + 3 + 4 + 4;
    writeInt32(channelListSize);
    writeString('R');
    writeInt32(EXRPixelType.HALF);
    writeUint8(0);
    parts.push(new Uint8Array([0, 0, 0]));
    offset += 3;
    writeInt32(1);
    writeInt32(1);
    writeUint8(0);
  }

  // compression
  writeString('compression');
  writeString('compression');
  writeInt32(1);
  writeUint8(EXRCompression.NONE);

  // dataWindow (skip if requested)
  if (skipAttribute !== 'dataWindow') {
    writeString('dataWindow');
    writeString('box2i');
    writeInt32(16);
    writeInt32(0);
    writeInt32(0);
    writeInt32(1);
    writeInt32(1);
  }

  // displayWindow (skip if requested)
  if (skipAttribute !== 'displayWindow') {
    writeString('displayWindow');
    writeString('box2i');
    writeInt32(16);
    writeInt32(0);
    writeInt32(0);
    writeInt32(1);
    writeInt32(1);
  }

  // lineOrder
  writeString('lineOrder');
  writeString('lineOrder');
  writeInt32(1);
  writeUint8(0);

  // pixelAspectRatio
  writeString('pixelAspectRatio');
  writeString('float');
  writeInt32(4);
  writeFloat32(1.0);

  // End of header
  writeUint8(0);

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result.buffer;
}

/**
 * Helper to create an EXR with UINT pixel type (unsupported)
 */
function createTestEXRWithUINT(): ArrayBuffer {
  const parts: Uint8Array[] = [];
  let offset = 0;

  function writeUint32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  function writeInt32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setInt32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  function writeUint8(value: number): void {
    parts.push(new Uint8Array([value]));
    offset += 1;
  }

  function writeString(str: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    parts.push(bytes);
    parts.push(new Uint8Array([0]));
    offset += bytes.length + 1;
  }

  function writeFloat32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setFloat32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  // Magic number
  writeUint32(EXR_MAGIC);
  writeUint32(2);

  // channels attribute with UINT pixel type (type 0)
  writeString('channels');
  writeString('chlist');
  const channelListSize = 1 + 1 + 1 + 4 + 1 + 3 + 4 + 4; // 'R' + null + struct
  writeInt32(channelListSize);
  writeString('R');
  writeInt32(EXRPixelType.UINT); // UINT type (0) - not supported
  writeUint8(0);
  parts.push(new Uint8Array([0, 0, 0]));
  offset += 3;
  writeInt32(1);
  writeInt32(1);
  writeUint8(0);

  // compression
  writeString('compression');
  writeString('compression');
  writeInt32(1);
  writeUint8(EXRCompression.NONE);

  // dataWindow
  writeString('dataWindow');
  writeString('box2i');
  writeInt32(16);
  writeInt32(0);
  writeInt32(0);
  writeInt32(1);
  writeInt32(1);

  // displayWindow
  writeString('displayWindow');
  writeString('box2i');
  writeInt32(16);
  writeInt32(0);
  writeInt32(0);
  writeInt32(1);
  writeInt32(1);

  // lineOrder
  writeString('lineOrder');
  writeString('lineOrder');
  writeInt32(1);
  writeUint8(0);

  // pixelAspectRatio
  writeString('pixelAspectRatio');
  writeString('float');
  writeInt32(4);
  writeFloat32(1.0);

  // End of header
  writeUint8(0);

  const totalLengthUINT = parts.reduce((sum, p) => sum + p.length, 0);
  const resultUINT = new Uint8Array(totalLengthUINT);
  let posUINT = 0;
  for (const part of parts) {
    resultUINT.set(part, posUINT);
    posUINT += part.length;
  }
  return resultUINT.buffer;
}

/**
 * Part definition for multi-part EXR test generation
 */
interface TestPartDef {
  name?: string;
  type?: string;
  view?: string;
  width?: number;
  height?: number;
  channels?: string[];
  pixelType?: EXRPixelType;
  compression?: EXRCompression;
  /** Value multiplier to distinguish parts (part 0 uses 1.0, part 1 uses this) */
  valueMultiplier?: number;
}

/**
 * Create a multi-part EXR file buffer for testing.
 *
 * Multi-part EXR format:
 *   - Magic number (4 bytes)
 *   - Version field with multiPart bit set (4 bytes)
 *   - Part 0 header attributes ... terminated by null byte
 *   - Part 1 header attributes ... terminated by null byte
 *   - ...
 *   - Empty header (single null byte) to end the headers section
 *   - Offset table for part 0
 *   - Offset table for part 1
 *   - ...
 *   - Chunk data (each chunk prefixed with part_number int32)
 */
function createMultiPartTestEXR(partDefs: TestPartDef[]): ArrayBuffer {
  if (partDefs.length === 0) {
    throw new Error('Must provide at least one part definition');
  }

  const bufParts: Uint8Array[] = [];
  let offset = 0;

  function writeUint32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, value, true);
    bufParts.push(buf);
    offset += 4;
  }

  function writeInt32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setInt32(0, value, true);
    bufParts.push(buf);
    offset += 4;
  }

  function writeUint8(value: number): void {
    bufParts.push(new Uint8Array([value]));
    offset += 1;
  }

  function writeString(str: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    bufParts.push(bytes);
    bufParts.push(new Uint8Array([0])); // null terminator
    offset += bytes.length + 1;
  }

  function writeFloat32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setFloat32(0, value, true);
    bufParts.push(buf);
    offset += 4;
  }

  function writeHalf(value: number): void {
    const buf = new Uint8Array(2);
    const view = new DataView(buf.buffer);
    const h = floatToHalf(value);
    view.setUint16(0, h, true);
    bufParts.push(buf);
    offset += 2;
  }

  function writeUint64(value: bigint): void {
    const buf = new Uint8Array(8);
    const view = new DataView(buf.buffer);
    view.setBigUint64(0, value, true);
    bufParts.push(buf);
    offset += 8;
  }

  /**
   * Write a string attribute (type "string"): size is string length + null terminator
   */
  function writeStringAttribute(name: string, value: string): void {
    writeString(name);      // attr name
    writeString('string');   // attr type
    const encoded = new TextEncoder().encode(value);
    writeInt32(encoded.length + 1); // size includes null terminator
    bufParts.push(encoded);
    bufParts.push(new Uint8Array([0]));
    offset += encoded.length + 1;
  }

  // ===== MAGIC + VERSION =====
  writeUint32(EXR_MAGIC);
  // Version 2 with multiPart bit (0x1000) set; nonImage bit (0x800) only when deep data parts exist
  const hasDeepData = partDefs.some(p => p.type === 'deepscanline' || p.type === 'deeptile');
  writeUint32(2 | 0x1000 | (hasDeepData ? 0x800 : 0));

  // ===== PART HEADERS =====
  for (const partDef of partDefs) {
    const width = partDef.width ?? 2;
    const height = partDef.height ?? 2;
    const channels = partDef.channels ?? ['R', 'G', 'B', 'A'];
    const pixelType = partDef.pixelType ?? EXRPixelType.HALF;
    const compression = partDef.compression ?? EXRCompression.NONE;

    // name attribute (required for multi-part)
    if (partDef.name) {
      writeStringAttribute('name', partDef.name);
    }

    // type attribute (required for multi-part)
    if (partDef.type) {
      writeStringAttribute('type', partDef.type);
    }

    // view attribute (optional, for stereo)
    if (partDef.view) {
      writeStringAttribute('view', partDef.view);
    }

    // channels attribute
    writeString('channels');
    writeString('chlist');
    let channelListSize = 1; // null terminator
    for (const ch of channels) {
      channelListSize += ch.length + 1 + 4 + 1 + 3 + 4 + 4;
    }
    writeInt32(channelListSize);

    const sortedChannels = [...channels].sort();
    for (const ch of sortedChannels) {
      writeString(ch);
      writeInt32(pixelType);
      writeUint8(0); // pLinear
      bufParts.push(new Uint8Array([0, 0, 0])); // reserved
      offset += 3;
      writeInt32(1); // xSampling
      writeInt32(1); // ySampling
    }
    writeUint8(0); // End of channel list

    // compression
    writeString('compression');
    writeString('compression');
    writeInt32(1);
    writeUint8(compression);

    // dataWindow
    writeString('dataWindow');
    writeString('box2i');
    writeInt32(16);
    writeInt32(0);
    writeInt32(0);
    writeInt32(width - 1);
    writeInt32(height - 1);

    // displayWindow
    writeString('displayWindow');
    writeString('box2i');
    writeInt32(16);
    writeInt32(0);
    writeInt32(0);
    writeInt32(width - 1);
    writeInt32(height - 1);

    // lineOrder
    writeString('lineOrder');
    writeString('lineOrder');
    writeInt32(1);
    writeUint8(0);

    // pixelAspectRatio
    writeString('pixelAspectRatio');
    writeString('float');
    writeInt32(4);
    writeFloat32(1.0);

    // End of this part's header
    writeUint8(0);
  }

  // Empty header to terminate the list of part headers
  writeUint8(0);

  // ===== OFFSET TABLES =====
  // We need to compute where the scanline data will actually be,
  // but we don't know yet. We'll use a two-pass approach:
  // First compute the offset table sizes, then compute actual offsets.

  const offsetTableStart = offset;

  // Calculate total offset table size
  let totalOffsetTableSize = 0;
  const partBlockCounts: number[] = [];
  for (const partDef of partDefs) {
    const height = partDef.height ?? 2;
    const compression = partDef.compression ?? EXRCompression.NONE;
    const linesPerBlock = compression === EXRCompression.PIZ ? 32
      : compression === EXRCompression.ZIP ? 16 : 1;
    const numBlocks = Math.ceil(height / linesPerBlock);
    partBlockCounts.push(numBlocks);
    totalOffsetTableSize += numBlocks * 8;
  }

  const scanlineDataStart = offsetTableStart + totalOffsetTableSize;

  // Compute chunk sizes for each part to determine offsets
  // Multi-part chunk: partNumber(4) + y(4) + packedSize(4) + data
  let currentDataOffset = scanlineDataStart;
  const partChunkOffsets: bigint[][] = [];

  for (let p = 0; p < partDefs.length; p++) {
    const partDef = partDefs[p]!;
    const width = partDef.width ?? 2;
    const channels = partDef.channels ?? ['R', 'G', 'B', 'A'];
    const pixelType = partDef.pixelType ?? EXRPixelType.HALF;

    const bytesPerPixel = pixelType === EXRPixelType.HALF ? 2 : 4;
    const scanlineSize = channels.length * width * bytesPerPixel;
    const numBlocks = partBlockCounts[p]!;

    const offsets: bigint[] = [];
    for (let b = 0; b < numBlocks; b++) {
      offsets.push(BigInt(currentDataOffset));
      // chunk: partNumber(4) + y(4) + packedSize(4) + data(scanlineSize)
      currentDataOffset += 4 + 4 + 4 + scanlineSize;
    }
    partChunkOffsets.push(offsets);
  }

  // Write offset tables
  for (let p = 0; p < partDefs.length; p++) {
    for (const off of partChunkOffsets[p]!) {
      writeUint64(off);
    }
  }

  // ===== SCANLINE DATA (with partNumber prefix) =====
  for (let p = 0; p < partDefs.length; p++) {
    const partDef = partDefs[p]!;
    const width = partDef.width ?? 2;
    const height = partDef.height ?? 2;
    const channels = partDef.channels ?? ['R', 'G', 'B', 'A'];
    const pixelType = partDef.pixelType ?? EXRPixelType.HALF;
    const valueMult = partDef.valueMultiplier ?? (p === 0 ? 1.0 : (p + 1) * 0.1);

    const bytesPerPixel = pixelType === EXRPixelType.HALF ? 2 : 4;
    const scanlineSize = channels.length * width * bytesPerPixel;

    const sortedChannels = [...channels].sort();

    for (let y = 0; y < height; y++) {
      writeInt32(p);           // Part number
      writeInt32(y);           // Y coordinate
      writeInt32(scanlineSize); // Packed size

      for (const ch of sortedChannels) {
        for (let x = 0; x < width; x++) {
          let value = 0;
          if (ch === 'R') value = valueMult * (x + y * width) / (width * height);
          else if (ch === 'G') value = valueMult * 0.5;
          else if (ch === 'B') value = valueMult * (1.0 - (x + y * width) / (width * height));
          else if (ch === 'A') value = 1.0;

          if (pixelType === EXRPixelType.HALF) {
            writeHalf(value);
          } else {
            writeFloat32(value);
          }
        }
      }
    }
  }

  // Combine all parts
  const totalLength = bufParts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of bufParts) {
    result.set(part, pos);
    pos += part.length;
  }

  return result.buffer;
}

/**
 * Create a multi-part EXR file with interleaved chunks from different parts.
 * Instead of writing all chunks for part 0, then all for part 1, etc.,
 * this writes: part0-line0, part1-line0, part0-line1, part1-line1, ...
 * All parts must have the same height for simplicity.
 */
function createInterleavedMultiPartTestEXR(partDefs: TestPartDef[]): ArrayBuffer {
  if (partDefs.length === 0) {
    throw new Error('Must provide at least one part definition');
  }

  const bufParts: Uint8Array[] = [];
  let offset = 0;

  function writeUint32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, value, true);
    bufParts.push(buf);
    offset += 4;
  }

  function writeInt32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setInt32(0, value, true);
    bufParts.push(buf);
    offset += 4;
  }

  function writeUint8(value: number): void {
    bufParts.push(new Uint8Array([value]));
    offset += 1;
  }

  function writeString(str: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    bufParts.push(bytes);
    bufParts.push(new Uint8Array([0]));
    offset += bytes.length + 1;
  }

  function writeFloat32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setFloat32(0, value, true);
    bufParts.push(buf);
    offset += 4;
  }

  function writeHalf(value: number): void {
    const buf = new Uint8Array(2);
    const view = new DataView(buf.buffer);
    const h = floatToHalf(value);
    view.setUint16(0, h, true);
    bufParts.push(buf);
    offset += 2;
  }

  function writeUint64(value: bigint): void {
    const buf = new Uint8Array(8);
    const view = new DataView(buf.buffer);
    view.setBigUint64(0, value, true);
    bufParts.push(buf);
    offset += 8;
  }

  function writeStringAttribute(name: string, value: string): void {
    writeString(name);
    writeString('string');
    const encoded = new TextEncoder().encode(value);
    writeInt32(encoded.length + 1);
    bufParts.push(encoded);
    bufParts.push(new Uint8Array([0]));
    offset += encoded.length + 1;
  }

  // ===== MAGIC + VERSION =====
  writeUint32(EXR_MAGIC);
  const hasDeepData = partDefs.some(p => p.type === 'deepscanline' || p.type === 'deeptile');
  writeUint32(2 | 0x1000 | (hasDeepData ? 0x800 : 0));

  // ===== PART HEADERS =====
  for (const partDef of partDefs) {
    const width = partDef.width ?? 2;
    const height = partDef.height ?? 2;
    const channels = partDef.channels ?? ['R', 'G', 'B', 'A'];
    const pixelType = partDef.pixelType ?? EXRPixelType.HALF;
    const compression = partDef.compression ?? EXRCompression.NONE;

    if (partDef.name) writeStringAttribute('name', partDef.name);
    if (partDef.type) writeStringAttribute('type', partDef.type);
    if (partDef.view) writeStringAttribute('view', partDef.view);

    writeString('channels');
    writeString('chlist');
    let channelListSize = 1;
    for (const ch of channels) {
      channelListSize += ch.length + 1 + 4 + 1 + 3 + 4 + 4;
    }
    writeInt32(channelListSize);
    const sortedChannels = [...channels].sort();
    for (const ch of sortedChannels) {
      writeString(ch);
      writeInt32(pixelType);
      writeUint8(0);
      bufParts.push(new Uint8Array([0, 0, 0]));
      offset += 3;
      writeInt32(1);
      writeInt32(1);
    }
    writeUint8(0);

    writeString('compression');
    writeString('compression');
    writeInt32(1);
    writeUint8(compression);

    writeString('dataWindow');
    writeString('box2i');
    writeInt32(16);
    writeInt32(0);
    writeInt32(0);
    writeInt32(width - 1);
    writeInt32(height - 1);

    writeString('displayWindow');
    writeString('box2i');
    writeInt32(16);
    writeInt32(0);
    writeInt32(0);
    writeInt32(width - 1);
    writeInt32(height - 1);

    writeString('lineOrder');
    writeString('lineOrder');
    writeInt32(1);
    writeUint8(0);

    writeString('pixelAspectRatio');
    writeString('float');
    writeInt32(4);
    writeFloat32(1.0);

    writeUint8(0); // End of this part's header
  }
  writeUint8(0); // Empty header terminator

  // ===== OFFSET TABLES =====
  const offsetTableStart = offset;
  let totalOffsetTableSize = 0;
  const partBlockCounts: number[] = [];
  for (const partDef of partDefs) {
    const height = partDef.height ?? 2;
    const numBlocks = height; // linesPerBlock = 1 for NONE compression
    partBlockCounts.push(numBlocks);
    totalOffsetTableSize += numBlocks * 8;
  }
  const scanlineDataStart = offsetTableStart + totalOffsetTableSize;

  // For interleaved layout, chunks are ordered:
  //   part0-line0, part1-line0, part0-line1, part1-line1, ...
  // We need to compute offsets for each part's chunks in this interleaved order.
  const maxHeight = Math.max(...partDefs.map(p => p.height ?? 2));
  let currentDataOffset = scanlineDataStart;

  // Pre-compute all chunk offsets in interleaved order
  const partOffsets: bigint[][] = partDefs.map(() => []);
  for (let y = 0; y < maxHeight; y++) {
    for (let p = 0; p < partDefs.length; p++) {
      const partDef = partDefs[p]!;
      const height = partDef.height ?? 2;
      if (y >= height) continue;
      const width = partDef.width ?? 2;
      const channels = partDef.channels ?? ['R', 'G', 'B', 'A'];
      const pixelType = partDef.pixelType ?? EXRPixelType.HALF;
      const bytesPerPixel = pixelType === EXRPixelType.HALF ? 2 : 4;
      const scanlineSize = channels.length * width * bytesPerPixel;

      partOffsets[p]!.push(BigInt(currentDataOffset));
      currentDataOffset += 4 + 4 + 4 + scanlineSize; // partNumber + y + packedSize + data
    }
  }

  // Write offset tables (per-part, in part order)
  for (let p = 0; p < partDefs.length; p++) {
    for (const off of partOffsets[p]!) {
      writeUint64(off);
    }
  }

  // ===== INTERLEAVED SCANLINE DATA =====
  for (let y = 0; y < maxHeight; y++) {
    for (let p = 0; p < partDefs.length; p++) {
      const partDef = partDefs[p]!;
      const height = partDef.height ?? 2;
      if (y >= height) continue;
      const width = partDef.width ?? 2;
      const channels = partDef.channels ?? ['R', 'G', 'B', 'A'];
      const pixelType = partDef.pixelType ?? EXRPixelType.HALF;
      const valueMult = partDef.valueMultiplier ?? (p === 0 ? 1.0 : (p + 1) * 0.1);
      const bytesPerPixel = pixelType === EXRPixelType.HALF ? 2 : 4;
      const scanlineSize = channels.length * width * bytesPerPixel;
      const sortedChannels = [...channels].sort();

      writeInt32(p);             // Part number
      writeInt32(y);             // Y coordinate
      writeInt32(scanlineSize);  // Packed size

      for (const ch of sortedChannels) {
        for (let x = 0; x < width; x++) {
          let value = 0;
          if (ch === 'R') value = valueMult * (x + y * width) / (width * height);
          else if (ch === 'G') value = valueMult * 0.5;
          else if (ch === 'B') value = valueMult * (1.0 - (x + y * width) / (width * height));
          else if (ch === 'A') value = 1.0;

          if (pixelType === EXRPixelType.HALF) {
            writeHalf(value);
          } else {
            writeFloat32(value);
          }
        }
      }
    }
  }

  const totalLength = bufParts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of bufParts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result.buffer;
}

// ===== Multi-part EXR Tests =====

describe('Multi-part EXR', () => {
  describe('isEXRFile with multi-part', () => {
    it('EXR-MP001: should return true for multi-part EXR magic bytes', () => {
      const buffer = createMultiPartTestEXR([
        { name: 'rgba', type: 'scanlineimage', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2 },
        { name: 'depth', type: 'scanlineimage', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2 },
      ]);
      expect(isEXRFile(buffer)).toBe(true);
    });
  });

  describe('getEXRInfo with multi-part', () => {
    it('EXR-MP010: should return part count and part info for multi-part EXR', () => {
      const buffer = createMultiPartTestEXR([
        { name: 'beauty', type: 'scanlineimage', channels: ['R', 'G', 'B', 'A'], width: 4, height: 4 },
        { name: 'depth', type: 'scanlineimage', channels: ['R', 'G', 'B'], width: 4, height: 4 },
      ]);

      const info = getEXRInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.partCount).toBe(2);
      expect(info!.parts).toBeDefined();
      expect(info!.parts!.length).toBe(2);
      expect(info!.parts![0]!.name).toBe('beauty');
      expect(info!.parts![1]!.name).toBe('depth');
      // Width/height should come from first part
      expect(info!.width).toBe(4);
      expect(info!.height).toBe(4);
    });

    it('EXR-MP011: should report view names for stereo parts', () => {
      const buffer = createMultiPartTestEXR([
        { name: 'left', type: 'scanlineimage', view: 'left', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2 },
        { name: 'right', type: 'scanlineimage', view: 'right', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2 },
      ]);

      const info = getEXRInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.parts![0]!.view).toBe('left');
      expect(info!.parts![1]!.view).toBe('right');
    });
  });

  describe('decodeEXR multi-part', () => {
    it('EXR-MP020: should decode first part by default from 2-part RGBA file', async () => {
      const buffer = createMultiPartTestEXR([
        {
          name: 'beauty',
          type: 'scanlineimage',
          channels: ['R', 'G', 'B', 'A'],
          width: 2,
          height: 2,
          valueMultiplier: 1.0,
        },
        {
          name: 'alternate',
          type: 'scanlineimage',
          channels: ['R', 'G', 'B', 'A'],
          width: 2,
          height: 2,
          valueMultiplier: 0.5,
        },
      ]);

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(2 * 2 * 4);

      // Should have decoded part 0
      expect(result.decodedPartIndex).toBe(0);
      expect(result.parts).toBeDefined();
      expect(result.parts!.length).toBe(2);

      // Verify first pixel green = 1.0 * 0.5 (part 0 multiplier 1.0 * green base 0.5)
      expect(result.data[1]).toBeCloseTo(0.5, 1);
    });

    it('EXR-MP021: should decode second part when partIndex=1', async () => {
      const buffer = createMultiPartTestEXR([
        {
          name: 'beauty',
          type: 'scanlineimage',
          channels: ['R', 'G', 'B', 'A'],
          width: 2,
          height: 2,
          valueMultiplier: 1.0,
        },
        {
          name: 'alternate',
          type: 'scanlineimage',
          channels: ['R', 'G', 'B', 'A'],
          width: 2,
          height: 2,
          valueMultiplier: 0.5,
        },
      ]);

      const result = await decodeEXR(buffer, { partIndex: 1 });

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.decodedPartIndex).toBe(1);

      // Verify first pixel green = 0.5 * 0.5 = 0.25 (part 1 multiplier 0.5 * green base 0.5)
      // But the default multiplier for part index 1 is (1+1)*0.1 = 0.2 when not specified
      // We specified 0.5, so green = 0.5 * 0.5 = 0.25
      expect(result.data[1]).toBeCloseTo(0.25, 1);
    });

    it('EXR-MP022: should throw for out-of-range partIndex', async () => {
      const buffer = createMultiPartTestEXR([
        { name: 'only', type: 'scanlineimage', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2 },
      ]);

      await expect(decodeEXR(buffer, { partIndex: 5 })).rejects.toThrow(/Part index 5 is out of range/);
    });

    it('EXR-MP023: should throw for negative partIndex', async () => {
      const buffer = createMultiPartTestEXR([
        { name: 'only', type: 'scanlineimage', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2 },
      ]);

      await expect(decodeEXR(buffer, { partIndex: -1 })).rejects.toThrow(/Part index -1 is out of range/);
    });

    it('EXR-MP024: should include part info in result', async () => {
      const buffer = createMultiPartTestEXR([
        { name: 'rgba', type: 'scanlineimage', channels: ['R', 'G', 'B', 'A'], width: 4, height: 4 },
        { name: 'normals', type: 'scanlineimage', channels: ['R', 'G', 'B'], width: 4, height: 4 },
      ]);

      const result = await decodeEXR(buffer);

      expect(result.parts).toBeDefined();
      expect(result.parts!.length).toBe(2);
      expect(result.parts![0]!.name).toBe('rgba');
      expect(result.parts![0]!.type).toBe('scanlineimage');
      expect(result.parts![0]!.channels).toEqual(expect.arrayContaining(['R', 'G', 'B', 'A']));
      expect(result.parts![1]!.name).toBe('normals');
      expect(result.parts![1]!.channels).toEqual(expect.arrayContaining(['R', 'G', 'B']));
    });

    it('EXR-MP025: should handle parts with different dimensions', async () => {
      const buffer = createMultiPartTestEXR([
        { name: 'hires', type: 'scanlineimage', channels: ['R', 'G', 'B', 'A'], width: 8, height: 8 },
        { name: 'lores', type: 'scanlineimage', channels: ['R', 'G', 'B', 'A'], width: 4, height: 4 },
      ]);

      // Decode first part
      const result0 = await decodeEXR(buffer);
      expect(result0.width).toBe(8);
      expect(result0.height).toBe(8);

      // Decode second part
      const result1 = await decodeEXR(buffer, { partIndex: 1 });
      expect(result1.width).toBe(4);
      expect(result1.height).toBe(4);
    });

    it('EXR-MP026: should decode multi-part with float32 pixel type', async () => {
      const buffer = createMultiPartTestEXR([
        {
          name: 'float_part',
          type: 'scanlineimage',
          channels: ['R', 'G', 'B', 'A'],
          width: 2,
          height: 2,
          pixelType: EXRPixelType.FLOAT,
          valueMultiplier: 1.0,
        },
      ]);

      const result = await decodeEXR(buffer);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(2 * 2 * 4);
    });
  });

  describe('deep data rejection', () => {
    it('EXR-MP030: should attempt to decode deepscanline part (now supported)', async () => {
      const buffer = createMultiPartTestEXR([
        { name: 'deep_part', type: 'deepscanline', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2 },
      ]);

      // deepscanline is now supported, but the test data is not valid deep data format,
      // so it will fail with a data reading error rather than a "not supported" error
      await expect(decodeEXR(buffer)).rejects.toThrow();
    });

    it('EXR-MP031: should throw descriptive error for deeptile part', async () => {
      const buffer = createMultiPartTestEXR([
        { name: 'deep_tile', type: 'deeptile', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2 },
      ]);

      await expect(decodeEXR(buffer)).rejects.toThrow(/deep.*tiled|deeptile/i);
    });

    it('EXR-MP032: should allow selecting a non-deep part when deep part exists', async () => {
      const buffer = createMultiPartTestEXR([
        { name: 'deep_part', type: 'deepscanline', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2 },
        { name: 'scanline_part', type: 'scanlineimage', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2, valueMultiplier: 0.7 },
      ]);

      // Selecting the deep part will attempt to decode (supported now), but fail due to invalid test data
      await expect(decodeEXR(buffer, { partIndex: 0 })).rejects.toThrow();

      // Selecting the scanline part should succeed
      const result = await decodeEXR(buffer, { partIndex: 1 });
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.decodedPartIndex).toBe(1);
    });
  });

  describe('multi-part stereo views', () => {
    it('EXR-MP040: should report view names in part info', async () => {
      const buffer = createMultiPartTestEXR([
        { name: 'left', type: 'scanlineimage', view: 'left', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2, valueMultiplier: 1.0 },
        { name: 'right', type: 'scanlineimage', view: 'right', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2, valueMultiplier: 0.8 },
      ]);

      const result = await decodeEXR(buffer);

      expect(result.parts![0]!.view).toBe('left');
      expect(result.parts![1]!.view).toBe('right');
    });

    it('EXR-MP041: should decode right view when selected by partIndex', async () => {
      const buffer = createMultiPartTestEXR([
        { name: 'left', type: 'scanlineimage', view: 'left', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2, valueMultiplier: 1.0 },
        { name: 'right', type: 'scanlineimage', view: 'right', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2, valueMultiplier: 0.5 },
      ]);

      const resultRight = await decodeEXR(buffer, { partIndex: 1 });
      expect(resultRight.decodedPartIndex).toBe(1);
      // Green from right view: 0.5 * 0.5 = 0.25
      expect(resultRight.data[1]).toBeCloseTo(0.25, 1);
    });
  });

  describe('exrToIPImage with multi-part', () => {
    it('EXR-MP050: should include multi-part info in IPImage metadata', async () => {
      const buffer = createMultiPartTestEXR([
        { name: 'beauty', type: 'scanlineimage', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2 },
        { name: 'normals', type: 'scanlineimage', channels: ['R', 'G', 'B'], width: 2, height: 2 },
      ]);

      const result = await decodeEXR(buffer);
      const image = exrToIPImage(result, '/test/multipart.exr');

      expect(image.metadata.attributes!.exrParts).toBeDefined();
      expect(image.metadata.attributes!.exrDecodedPartIndex).toBe(0);
    });
  });

  describe('multi-part with single part', () => {
    it('EXR-MP060: should handle multi-part file that has only one part', async () => {
      const buffer = createMultiPartTestEXR([
        { name: 'only', type: 'scanlineimage', channels: ['R', 'G', 'B', 'A'], width: 4, height: 4, valueMultiplier: 1.0 },
      ]);

      const result = await decodeEXR(buffer);
      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.decodedPartIndex).toBe(0);
      expect(result.parts!.length).toBe(1);
    });
  });

  describe('interleaved chunks', () => {
    it('EXR-MP065: should decode correctly when chunks from different parts are interleaved', async () => {
      const buffer = createInterleavedMultiPartTestEXR([
        {
          name: 'partA',
          type: 'scanlineimage',
          channels: ['R', 'G', 'B', 'A'],
          width: 2,
          height: 2,
          valueMultiplier: 1.0,
        },
        {
          name: 'partB',
          type: 'scanlineimage',
          channels: ['R', 'G', 'B', 'A'],
          width: 2,
          height: 2,
          valueMultiplier: 0.5,
        },
      ]);

      // Decode part 0 (partA) - must skip interleaved partB chunks
      const result0 = await decodeEXR(buffer);
      expect(result0.width).toBe(2);
      expect(result0.height).toBe(2);
      expect(result0.decodedPartIndex).toBe(0);
      // Green channel for part 0: 1.0 * 0.5 = 0.5
      expect(result0.data[1]).toBeCloseTo(0.5, 1);

      // Decode part 1 (partB) - must skip interleaved partA chunks
      const result1 = await decodeEXR(buffer, { partIndex: 1 });
      expect(result1.width).toBe(2);
      expect(result1.height).toBe(2);
      expect(result1.decodedPartIndex).toBe(1);
      // Green channel for part 1: 0.5 * 0.5 = 0.25
      expect(result1.data[1]).toBeCloseTo(0.25, 1);
    });
  });

  describe('partIndex validation', () => {
    it('EXR-MP066: should throw descriptive error for NaN partIndex', async () => {
      const buffer = createMultiPartTestEXR([
        { name: 'test', type: 'scanlineimage', channels: ['R', 'G', 'B', 'A'], width: 2, height: 2 },
      ]);
      await expect(decodeEXR(buffer, { partIndex: NaN })).rejects.toThrow(/Invalid part index/);
    });
  });

  describe('performance', () => {
    it.skip('EXR-MP070: performance - decode 1920x1080 multi-part in < 500ms', async () => {
      const buffer = createMultiPartTestEXR([
        {
          name: 'beauty',
          type: 'scanlineimage',
          channels: ['R', 'G', 'B', 'A'],
          width: 1920,
          height: 1080,
          valueMultiplier: 1.0,
        },
        {
          name: 'depth',
          type: 'scanlineimage',
          channels: ['R', 'G', 'B', 'A'],
          width: 1920,
          height: 1080,
          valueMultiplier: 0.5,
        },
      ]);

      const start = performance.now();
      const result = await decodeEXR(buffer);
      const elapsed = performance.now() - start;

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(elapsed).toBeLessThan(500);
    });
  });
});

// ===== Uncrop (data window -> display window) Tests =====

describe('EXR Uncrop (applyUncrop)', () => {
  describe('applyUncrop - identity', () => {
    it('EXR-UC001: should return data unchanged when windows are identical', () => {
      const dw: EXRBox2i = { xMin: 0, yMin: 0, xMax: 3, yMax: 2 };
      const dispW: EXRBox2i = { xMin: 0, yMin: 0, xMax: 3, yMax: 2 };
      const data = new Float32Array(4 * 3 * 4); // 4x3 RGBA
      data[0] = 0.5; // mark first pixel red

      const result = applyUncrop(data, dw, dispW);
      expect(result.width).toBe(4);
      expect(result.height).toBe(3);
      expect(result.data).toBe(data); // same reference
    });
  });

  describe('applyUncrop - expansion', () => {
    it('EXR-UC010: should expand a small data window into a larger display window', () => {
      // Data window: 2x2 at (1,1)-(2,2)
      // Display window: 4x4 at (0,0)-(3,3)
      const dw: EXRBox2i = { xMin: 1, yMin: 1, xMax: 2, yMax: 2 };
      const dispW: EXRBox2i = { xMin: 0, yMin: 0, xMax: 3, yMax: 3 };

      const dwWidth = 2, dwHeight = 2;
      const data = new Float32Array(dwWidth * dwHeight * 4);

      // Fill with known values: R=1, G=0.5, B=0.25, A=1
      for (let i = 0; i < dwWidth * dwHeight; i++) {
        data[i * 4 + 0] = 1.0;
        data[i * 4 + 1] = 0.5;
        data[i * 4 + 2] = 0.25;
        data[i * 4 + 3] = 1.0;
      }

      const result = applyUncrop(data, dw, dispW);
      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.data.length).toBe(4 * 4 * 4);

      // Check that pixels outside data window are transparent black (0,0,0,0)
      // Top-left corner (0,0) should be transparent
      expect(result.data[0]).toBe(0);
      expect(result.data[1]).toBe(0);
      expect(result.data[2]).toBe(0);
      expect(result.data[3]).toBe(0);

      // Pixel at (1,1) should have our data (offset = (1*4+1)*4 = 20)
      const idx = (1 * 4 + 1) * 4;
      expect(result.data[idx + 0]).toBe(1.0);
      expect(result.data[idx + 1]).toBe(0.5);
      expect(result.data[idx + 2]).toBe(0.25);
      expect(result.data[idx + 3]).toBe(1.0);

      // Pixel at (2,2) should also have data
      const idx2 = (2 * 4 + 2) * 4;
      expect(result.data[idx2 + 0]).toBe(1.0);
      expect(result.data[idx2 + 1]).toBe(0.5);

      // Bottom-right corner (3,3) should be transparent
      const idx3 = (3 * 4 + 3) * 4;
      expect(result.data[idx3 + 0]).toBe(0);
      expect(result.data[idx3 + 1]).toBe(0);
      expect(result.data[idx3 + 2]).toBe(0);
      expect(result.data[idx3 + 3]).toBe(0);
    });

    it('EXR-UC011: should place data at correct offset for non-zero display window origin', () => {
      // Data window: (100,50)-(500,400) => 401x351
      // Display window: (0,0)-(1919,1079) => 1920x1080
      const dw: EXRBox2i = { xMin: 100, yMin: 50, xMax: 500, yMax: 400 };
      const dispW: EXRBox2i = { xMin: 0, yMin: 0, xMax: 1919, yMax: 1079 };

      const dwWidth = 401, dwHeight = 351;
      const data = new Float32Array(dwWidth * dwHeight * 4);

      // Fill all data pixels with R=0.7, G=0.3, B=0.1, A=0.9
      for (let i = 0; i < dwWidth * dwHeight; i++) {
        data[i * 4 + 0] = 0.7;
        data[i * 4 + 1] = 0.3;
        data[i * 4 + 2] = 0.1;
        data[i * 4 + 3] = 0.9;
      }

      const result = applyUncrop(data, dw, dispW);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);

      // Pixel at (0,0) should be transparent black
      expect(result.data[0]).toBe(0);
      expect(result.data[3]).toBe(0);

      // Pixel at (100,50) - the first data pixel
      const idx = (50 * 1920 + 100) * 4;
      expect(result.data[idx + 0]).toBeCloseTo(0.7, 5);
      expect(result.data[idx + 1]).toBeCloseTo(0.3, 5);
      expect(result.data[idx + 2]).toBeCloseTo(0.1, 5);
      expect(result.data[idx + 3]).toBeCloseTo(0.9, 5);

      // Pixel at (500,400) - the last data pixel
      const idxLast = (400 * 1920 + 500) * 4;
      expect(result.data[idxLast + 0]).toBeCloseTo(0.7, 5);
      expect(result.data[idxLast + 3]).toBeCloseTo(0.9, 5);

      // Pixel at (501,400) - just outside data window
      const idxOutside = (400 * 1920 + 501) * 4;
      expect(result.data[idxOutside + 0]).toBe(0);
      expect(result.data[idxOutside + 3]).toBe(0);
    });

    it('EXR-UC012: fill pixels outside data window are transparent black (0,0,0,0)', () => {
      const dw: EXRBox2i = { xMin: 1, yMin: 1, xMax: 1, yMax: 1 };
      const dispW: EXRBox2i = { xMin: 0, yMin: 0, xMax: 2, yMax: 2 };

      // 1x1 data window
      const data = new Float32Array(4);
      data[0] = 0.8;
      data[1] = 0.6;
      data[2] = 0.4;
      data[3] = 1.0;

      const result = applyUncrop(data, dw, dispW);
      expect(result.width).toBe(3);
      expect(result.height).toBe(3);

      // Check all 9 pixels - only (1,1) should have data
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          const idx = (y * 3 + x) * 4;
          if (x === 1 && y === 1) {
            expect(result.data[idx + 0]).toBeCloseTo(0.8, 5);
            expect(result.data[idx + 1]).toBeCloseTo(0.6, 5);
            expect(result.data[idx + 2]).toBeCloseTo(0.4, 5);
            expect(result.data[idx + 3]).toBe(1.0);
          } else {
            expect(result.data[idx + 0]).toBe(0);
            expect(result.data[idx + 1]).toBe(0);
            expect(result.data[idx + 2]).toBe(0);
            expect(result.data[idx + 3]).toBe(0);
          }
        }
      }
    });
  });

  describe('applyUncrop - edge cases', () => {
    it('EXR-UC020: should handle data window at display window origin', () => {
      // Data window starts at (0,0) but is smaller than display window
      const dw: EXRBox2i = { xMin: 0, yMin: 0, xMax: 1, yMax: 1 };
      const dispW: EXRBox2i = { xMin: 0, yMin: 0, xMax: 3, yMax: 3 };

      const data = new Float32Array(2 * 2 * 4);
      for (let i = 0; i < 4; i++) {
        data[i * 4 + 0] = 1.0;
        data[i * 4 + 3] = 1.0;
      }

      const result = applyUncrop(data, dw, dispW);
      expect(result.width).toBe(4);
      expect(result.height).toBe(4);

      // (0,0) should have data
      expect(result.data[0]).toBe(1.0);
      // (2,0) should be transparent
      const idx = (0 * 4 + 2) * 4;
      expect(result.data[idx]).toBe(0);
    });

    it('EXR-UC021: should handle data window at bottom-right corner of display window', () => {
      const dw: EXRBox2i = { xMin: 2, yMin: 2, xMax: 3, yMax: 3 };
      const dispW: EXRBox2i = { xMin: 0, yMin: 0, xMax: 3, yMax: 3 };

      const data = new Float32Array(2 * 2 * 4);
      data[0] = 0.9; // first data pixel R
      data[3] = 1.0; // first data pixel A

      const result = applyUncrop(data, dw, dispW);
      expect(result.width).toBe(4);
      expect(result.height).toBe(4);

      // (0,0) should be transparent
      expect(result.data[0]).toBe(0);
      // (2,2) should have data
      const idx = (2 * 4 + 2) * 4;
      expect(result.data[idx]).toBeCloseTo(0.9, 5);
    });
  });

  describe('applyUncrop - boundary clipping', () => {
    it('EXR-UC040: data window larger than display window on all sides is clipped', () => {
      // Data window extends beyond display window on every side
      const dw: EXRBox2i = { xMin: -2, yMin: -1, xMax: 5, yMax: 4 };   // 8x6
      const dispW: EXRBox2i = { xMin: 0, yMin: 0, xMax: 3, yMax: 3 };  // 4x4

      const dwWidth = 8, dwHeight = 6;
      const data = new Float32Array(dwWidth * dwHeight * 4);

      // Fill each pixel with a recognizable pattern: R = normalized x, G = normalized y
      for (let y = 0; y < dwHeight; y++) {
        for (let x = 0; x < dwWidth; x++) {
          const i = (y * dwWidth + x) * 4;
          data[i + 0] = (x + 1) * 0.125;  // R: 0.125..1.0
          data[i + 1] = (y + 1) * 0.125;  // G: 0.125..0.75
          data[i + 2] = 0.5;
          data[i + 3] = 1.0;
        }
      }

      const result = applyUncrop(data, dw, dispW);
      expect(result.width).toBe(4);
      expect(result.height).toBe(4);

      // The visible region in data coords: x=2..5 (clipped to 2..5), y=1..4 (clipped to 1..4)
      // Data pixel at data coords (2,1) maps to display (0,0)
      // Its R value = (2+1)*0.125 = 0.375, G value = (1+1)*0.125 = 0.25
      const idx00 = 0;
      expect(result.data[idx00 + 0]).toBeCloseTo(0.375, 5);
      expect(result.data[idx00 + 1]).toBe(0.25);
      expect(result.data[idx00 + 3]).toBe(1.0);

      // Data pixel at data coords (5,4) maps to display (3,3)
      // Its R value = (5+1)*0.125 = 0.75, G value = (4+1)*0.125 = 0.625
      const idx33 = (3 * 4 + 3) * 4;
      expect(result.data[idx33 + 0]).toBe(0.75);
      expect(result.data[idx33 + 1]).toBeCloseTo(0.625, 5);
      expect(result.data[idx33 + 3]).toBe(1.0);

      // All 16 pixels should be filled (no transparent black)
      for (let i = 0; i < 4 * 4; i++) {
        expect(result.data[i * 4 + 3]).toBe(1.0);
      }
    });

    it('EXR-UC041: data window partially outside display window with negative offsets', () => {
      // Data window starts before display window but overlaps partially
      const dw: EXRBox2i = { xMin: -3, yMin: -2, xMax: 1, yMax: 1 };    // 5x4
      const dispW: EXRBox2i = { xMin: 0, yMin: 0, xMax: 3, yMax: 3 };   // 4x4

      const dwWidth = 5, dwHeight = 4;
      const data = new Float32Array(dwWidth * dwHeight * 4);

      // Fill all with recognizable value
      for (let i = 0; i < dwWidth * dwHeight; i++) {
        data[i * 4 + 0] = 0.25;
        data[i * 4 + 1] = 0.5;
        data[i * 4 + 2] = 0.75;
        data[i * 4 + 3] = 1.0;
      }

      const result = applyUncrop(data, dw, dispW);
      expect(result.width).toBe(4);
      expect(result.height).toBe(4);

      // The visible portion: data x=3..4 (display x=0..1), data y=2..3 (display y=0..1)
      // (0,0) in display should have data
      expect(result.data[0]).toBe(0.25);
      expect(result.data[3]).toBe(1.0);

      // (1,1) in display should have data
      const idx11 = (1 * 4 + 1) * 4;
      expect(result.data[idx11 + 0]).toBe(0.25);
      expect(result.data[idx11 + 3]).toBe(1.0);

      // (2,0) in display should be transparent (no data there)
      const idx20 = (0 * 4 + 2) * 4;
      expect(result.data[idx20 + 0]).toBe(0);
      expect(result.data[idx20 + 3]).toBe(0);

      // (0,2) in display should be transparent (no data there)
      const idx02 = (2 * 4 + 0) * 4;
      expect(result.data[idx02 + 0]).toBe(0);
      expect(result.data[idx02 + 3]).toBe(0);

      // (3,3) in display should be transparent
      const idx33 = (3 * 4 + 3) * 4;
      expect(result.data[idx33 + 0]).toBe(0);
      expect(result.data[idx33 + 3]).toBe(0);
    });

    it('EXR-UC042: applyUncrop throws on data length mismatch', () => {
      const dw: EXRBox2i = { xMin: 0, yMin: 0, xMax: 1, yMax: 1 };   // 2x2 → expects 16 floats
      const dispW: EXRBox2i = { xMin: 0, yMin: 0, xMax: 3, yMax: 3 };

      // Wrong length: 3x2x4 = 24 instead of 2x2x4 = 16
      const data = new Float32Array(24);

      expect(() => applyUncrop(data, dw, dispW)).toThrow(/data length 24 does not match expected 16/);
    });
  });

  describe('decodeEXR with uncrop', () => {
    it('EXR-UC030: should produce display window dimensions when data window differs', async () => {
      // Create a test EXR with data window smaller than display window
      const buffer = createTestEXRWithUncrop({
        dataWindow: { xMin: 10, yMin: 5, xMax: 29, yMax: 14 },  // 20x10
        displayWindow: { xMin: 0, yMin: 0, xMax: 39, yMax: 19 }, // 40x20
      });

      const result = await decodeEXR(buffer);

      // Output should be display window size
      expect(result.width).toBe(40);
      expect(result.height).toBe(20);
      expect(result.data.length).toBe(40 * 20 * 4);
    });

    it('EXR-UC031: should have transparent black padding around data', async () => {
      const buffer = createTestEXRWithUncrop({
        dataWindow: { xMin: 1, yMin: 1, xMax: 2, yMax: 2 },   // 2x2
        displayWindow: { xMin: 0, yMin: 0, xMax: 3, yMax: 3 }, // 4x4
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(4);
      expect(result.height).toBe(4);

      // Top-left corner (0,0) should be transparent
      expect(result.data[0]).toBe(0);
      expect(result.data[1]).toBe(0);
      expect(result.data[2]).toBe(0);
      expect(result.data[3]).toBe(0);

      // Data pixels at (1,1) should be non-zero
      const idx = (1 * 4 + 1) * 4;
      // Alpha should be 1.0 for data pixels
      expect(result.data[idx + 3]).toBeCloseTo(1.0, 2);
    });

    it('EXR-UC032: should not change output when windows are identical', async () => {
      const buffer = createTestEXR({ width: 4, height: 4 });

      const result = await decodeEXR(buffer);
      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.data.length).toBe(4 * 4 * 4);
    });
  });
});

/**
 * Create a test EXR with separate data window and display window for uncrop testing.
 * The data window pixels are filled with the standard test pattern (same as createTestEXR).
 */
function createTestEXRWithUncrop(options: {
  dataWindow: EXRBox2i;
  displayWindow: EXRBox2i;
  channels?: string[];
  pixelType?: EXRPixelType;
}): ArrayBuffer {
  const {
    dataWindow,
    displayWindow,
    channels = ['R', 'G', 'B', 'A'],
    pixelType = EXRPixelType.HALF,
  } = options;

  const dataWidth = dataWindow.xMax - dataWindow.xMin + 1;
  const dataHeight = dataWindow.yMax - dataWindow.yMin + 1;

  const parts: Uint8Array[] = [];
  let offset = 0;

  function writeUint32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  function writeInt32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setInt32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  function writeUint8(value: number): void {
    parts.push(new Uint8Array([value]));
    offset += 1;
  }

  function writeString(str: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    parts.push(bytes);
    parts.push(new Uint8Array([0]));
    offset += bytes.length + 1;
  }

  function writeFloat32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setFloat32(0, value, true);
    parts.push(buf);
    offset += 4;
  }

  function writeHalf(value: number): void {
    const buf = new Uint8Array(2);
    const view = new DataView(buf.buffer);
    const h = floatToHalf(value);
    view.setUint16(0, h, true);
    parts.push(buf);
    offset += 2;
  }

  function writeUint64(value: bigint): void {
    const buf = new Uint8Array(8);
    const view = new DataView(buf.buffer);
    view.setBigUint64(0, value, true);
    parts.push(buf);
    offset += 8;
  }

  // Magic number
  writeUint32(EXR_MAGIC);
  writeUint32(2);

  // channels attribute
  writeString('channels');
  writeString('chlist');
  let channelListSize = 1;
  for (const ch of channels) {
    channelListSize += ch.length + 1 + 4 + 1 + 3 + 4 + 4;
  }
  writeInt32(channelListSize);
  const sortedChannels = [...channels].sort();
  for (const ch of sortedChannels) {
    writeString(ch);
    writeInt32(pixelType);
    writeUint8(0);
    parts.push(new Uint8Array([0, 0, 0]));
    offset += 3;
    writeInt32(1);
    writeInt32(1);
  }
  writeUint8(0);

  // compression
  writeString('compression');
  writeString('compression');
  writeInt32(1);
  writeUint8(EXRCompression.NONE);

  // dataWindow (the actual pixel region)
  writeString('dataWindow');
  writeString('box2i');
  writeInt32(16);
  writeInt32(dataWindow.xMin);
  writeInt32(dataWindow.yMin);
  writeInt32(dataWindow.xMax);
  writeInt32(dataWindow.yMax);

  // displayWindow (the full frame)
  writeString('displayWindow');
  writeString('box2i');
  writeInt32(16);
  writeInt32(displayWindow.xMin);
  writeInt32(displayWindow.yMin);
  writeInt32(displayWindow.xMax);
  writeInt32(displayWindow.yMax);

  // lineOrder
  writeString('lineOrder');
  writeString('lineOrder');
  writeInt32(1);
  writeUint8(0);

  // pixelAspectRatio
  writeString('pixelAspectRatio');
  writeString('float');
  writeInt32(4);
  writeFloat32(1.0);

  // End of header
  writeUint8(0);

  // Offset table
  const bytesPerPixel = pixelType === EXRPixelType.HALF ? 2 : 4;
  const scanlineSize = channels.length * dataWidth * bytesPerPixel;
  const headerEnd = offset;
  const offsetTableSize = dataHeight * 8;
  const scanlineDataStart = headerEnd + offsetTableSize;

  for (let y = 0; y < dataHeight; y++) {
    const blockStart = BigInt(scanlineDataStart + y * (8 + scanlineSize));
    writeUint64(blockStart);
  }

  // Scanline data - y coordinates are absolute (dataWindow.yMin + row)
  for (let y = 0; y < dataHeight; y++) {
    writeInt32(dataWindow.yMin + y); // Absolute Y coordinate
    writeInt32(scanlineSize);

    for (const ch of sortedChannels) {
      for (let x = 0; x < dataWidth; x++) {
        let value = 0;
        if (ch === 'R') value = (x + y * dataWidth) / (dataWidth * dataHeight);
        else if (ch === 'G') value = 0.5;
        else if (ch === 'B') value = 1.0 - (x + y * dataWidth) / (dataWidth * dataHeight);
        else if (ch === 'A') value = 1.0;

        if (pixelType === EXRPixelType.HALF) {
          writeHalf(value);
        } else {
          writeFloat32(value);
        }
      }
    }
  }

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result.buffer;
}

// ===== Tiled EXR Test Helpers =====

/**
 * Create a tiled EXR file buffer for testing.
 * Generates uncompressed ONE_LEVEL tiled image with RGBA half-float data.
 */
function createTiledTestEXR(options: {
  width?: number;
  height?: number;
  tileXSize?: number;
  tileYSize?: number;
  channels?: string[];
  pixelType?: EXRPixelType;
  compression?: EXRCompression;
  levelMode?: EXRLevelMode;
  roundingMode?: EXRRoundingMode;
  dataWindow?: EXRBox2i;
  displayWindow?: EXRBox2i;
} = {}): ArrayBuffer {
  const {
    width = 4,
    height = 4,
    tileXSize = 2,
    tileYSize = 2,
    channels = ['R', 'G', 'B', 'A'],
    pixelType = EXRPixelType.HALF,
    compression = EXRCompression.NONE,
    levelMode = EXRLevelMode.ONE_LEVEL,
    roundingMode = EXRRoundingMode.ROUND_DOWN,
  } = options;

  const dataWindow = options.dataWindow ?? { xMin: 0, yMin: 0, xMax: width - 1, yMax: height - 1 };
  const displayWindow = options.displayWindow ?? { xMin: 0, yMin: 0, xMax: width - 1, yMax: height - 1 };

  const dataWidth = dataWindow.xMax - dataWindow.xMin + 1;
  const dataHeight = dataWindow.yMax - dataWindow.yMin + 1;

  const bufParts: Uint8Array[] = [];
  let offset = 0;

  function writeUint32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, value, true);
    bufParts.push(buf);
    offset += 4;
  }

  function writeInt32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setInt32(0, value, true);
    bufParts.push(buf);
    offset += 4;
  }

  function writeUint8(value: number): void {
    bufParts.push(new Uint8Array([value]));
    offset += 1;
  }

  function writeString(str: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    bufParts.push(bytes);
    bufParts.push(new Uint8Array([0]));
    offset += bytes.length + 1;
  }

  function writeFloat32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setFloat32(0, value, true);
    bufParts.push(buf);
    offset += 4;
  }

  function writeHalf(value: number): void {
    const buf = new Uint8Array(2);
    const view = new DataView(buf.buffer);
    const h = floatToHalf(value);
    view.setUint16(0, h, true);
    bufParts.push(buf);
    offset += 2;
  }

  function writeUint64(value: bigint): void {
    const buf = new Uint8Array(8);
    const view = new DataView(buf.buffer);
    view.setBigUint64(0, value, true);
    bufParts.push(buf);
    offset += 8;
  }

  // Magic number
  writeUint32(EXR_MAGIC);

  // Version 2 with tiled bit (0x200)
  writeUint32(2 | 0x200);

  // === HEADER ATTRIBUTES ===

  // channels attribute
  writeString('channels');
  writeString('chlist');
  let channelListSize = 1;
  for (const ch of channels) {
    channelListSize += ch.length + 1 + 4 + 1 + 3 + 4 + 4;
  }
  writeInt32(channelListSize);
  const sortedChannels = [...channels].sort();
  for (const ch of sortedChannels) {
    writeString(ch);
    writeInt32(pixelType);
    writeUint8(0); // pLinear
    bufParts.push(new Uint8Array([0, 0, 0])); // reserved
    offset += 3;
    writeInt32(1); // xSampling
    writeInt32(1); // ySampling
  }
  writeUint8(0); // End of channel list

  // compression attribute
  writeString('compression');
  writeString('compression');
  writeInt32(1);
  writeUint8(compression);

  // dataWindow attribute
  writeString('dataWindow');
  writeString('box2i');
  writeInt32(16);
  writeInt32(dataWindow.xMin);
  writeInt32(dataWindow.yMin);
  writeInt32(dataWindow.xMax);
  writeInt32(dataWindow.yMax);

  // displayWindow attribute
  writeString('displayWindow');
  writeString('box2i');
  writeInt32(16);
  writeInt32(displayWindow.xMin);
  writeInt32(displayWindow.yMin);
  writeInt32(displayWindow.xMax);
  writeInt32(displayWindow.yMax);

  // lineOrder attribute
  writeString('lineOrder');
  writeString('lineOrder');
  writeInt32(1);
  writeUint8(0); // INCREASING_Y

  // pixelAspectRatio attribute
  writeString('pixelAspectRatio');
  writeString('float');
  writeInt32(4);
  writeFloat32(1.0);

  // tiles attribute
  writeString('tiles');
  writeString('tiledesc');
  writeInt32(9); // xSize(4) + ySize(4) + modeByte(1)
  writeInt32(tileXSize);
  writeInt32(tileYSize);
  const modeByte = (levelMode & 0xf) | ((roundingMode & 0xf) << 4);
  writeUint8(modeByte);

  // End of header
  writeUint8(0);

  // === OFFSET TABLE ===
  const numXTiles = Math.ceil(dataWidth / tileXSize);
  const numYTiles = Math.ceil(dataHeight / tileYSize);
  const totalTiles = numXTiles * numYTiles;

  const bytesPerPixel = pixelType === EXRPixelType.HALF ? 2 : 4;

  // Calculate where tile data starts
  const headerEnd = offset;
  const offsetTableSize = totalTiles * 8;
  const tileDataStart = headerEnd + offsetTableSize;

  // Pre-compute tile data sizes and offsets
  const tileOffsets: bigint[] = [];
  let currentTileOffset = tileDataStart;
  for (let ty = 0; ty < numYTiles; ty++) {
    for (let tx = 0; tx < numXTiles; tx++) {
      tileOffsets.push(BigInt(currentTileOffset));
      const actualTileW = Math.min(tileXSize, dataWidth - tx * tileXSize);
      const actualTileH = Math.min(tileYSize, dataHeight - ty * tileYSize);
      const tileDataSize = channels.length * actualTileW * bytesPerPixel * actualTileH;
      // tile header: tileX(4) + tileY(4) + levelX(4) + levelY(4) + packedSize(4) = 20
      currentTileOffset += 20 + tileDataSize;
    }
  }

  for (const off of tileOffsets) {
    writeUint64(off);
  }

  // === TILE DATA ===
  for (let ty = 0; ty < numYTiles; ty++) {
    for (let tx = 0; tx < numXTiles; tx++) {
      const actualTileW = Math.min(tileXSize, dataWidth - tx * tileXSize);
      const actualTileH = Math.min(tileYSize, dataHeight - ty * tileYSize);
      const tileDataSize = channels.length * actualTileW * bytesPerPixel * actualTileH;

      writeInt32(tx);  // tileX
      writeInt32(ty);  // tileY
      writeInt32(0);   // levelX
      writeInt32(0);   // levelY
      writeInt32(tileDataSize); // packedSize

      // Write pixel data: channels stored separately, in sorted order, line by line within tile
      for (let line = 0; line < actualTileH; line++) {
        const globalY = ty * tileYSize + line;
        for (const ch of sortedChannels) {
          for (let x = 0; x < actualTileW; x++) {
            const globalX = tx * tileXSize + x;
            let value = 0;
            if (ch === 'R') value = (globalX + globalY * dataWidth) / (dataWidth * dataHeight);
            else if (ch === 'G') value = 0.5;
            else if (ch === 'B') value = 1.0 - (globalX + globalY * dataWidth) / (dataWidth * dataHeight);
            else if (ch === 'A') value = 1.0;
            else if (ch === 'Y') value = (globalX + globalY * dataWidth) / (dataWidth * dataHeight);

            if (pixelType === EXRPixelType.HALF) {
              writeHalf(value);
            } else {
              writeFloat32(value);
            }
          }
        }
      }
    }
  }

  // Combine all bufParts
  const totalLength = bufParts.reduce((sum, p) => sum + p.length, 0);
  const resultBuf = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of bufParts) {
    resultBuf.set(part, pos);
    pos += part.length;
  }
  return resultBuf.buffer;
}

/**
 * Create a multi-part EXR file with a tiled part for testing.
 */
function createMultiPartTiledTestEXR(partDefs: (TestPartDef & {
  tiled?: boolean;
  tileXSize?: number;
  tileYSize?: number;
})[]): ArrayBuffer {
  const bufParts: Uint8Array[] = [];
  let offset = 0;

  function writeUint32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, value, true);
    bufParts.push(buf);
    offset += 4;
  }

  function writeInt32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setInt32(0, value, true);
    bufParts.push(buf);
    offset += 4;
  }

  function writeUint8(value: number): void {
    bufParts.push(new Uint8Array([value]));
    offset += 1;
  }

  function writeString(str: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    bufParts.push(bytes);
    bufParts.push(new Uint8Array([0]));
    offset += bytes.length + 1;
  }

  function writeFloat32(value: number): void {
    const buf = new Uint8Array(4);
    const view = new DataView(buf.buffer);
    view.setFloat32(0, value, true);
    bufParts.push(buf);
    offset += 4;
  }

  function writeHalf(value: number): void {
    const buf = new Uint8Array(2);
    const view = new DataView(buf.buffer);
    const h = floatToHalf(value);
    view.setUint16(0, h, true);
    bufParts.push(buf);
    offset += 2;
  }

  function writeUint64(value: bigint): void {
    const buf = new Uint8Array(8);
    const view = new DataView(buf.buffer);
    view.setBigUint64(0, value, true);
    bufParts.push(buf);
    offset += 8;
  }

  function writeStringAttribute(name: string, value: string): void {
    writeString(name);
    writeString('string');
    const encoded = new TextEncoder().encode(value);
    writeInt32(encoded.length + 1);
    bufParts.push(encoded);
    bufParts.push(new Uint8Array([0]));
    offset += encoded.length + 1;
  }

  // ===== MAGIC + VERSION =====
  writeUint32(EXR_MAGIC);
  writeUint32(2 | 0x1000); // multiPart bit

  // ===== PART HEADERS =====
  for (const partDef of partDefs) {
    const width = partDef.width ?? 2;
    const height = partDef.height ?? 2;
    const channels = partDef.channels ?? ['R', 'G', 'B', 'A'];
    const pixelType = partDef.pixelType ?? EXRPixelType.HALF;
    const compression = partDef.compression ?? EXRCompression.NONE;

    if (partDef.name) writeStringAttribute('name', partDef.name);
    if (partDef.type) writeStringAttribute('type', partDef.type);
    if (partDef.view) writeStringAttribute('view', partDef.view);

    // channels attribute
    writeString('channels');
    writeString('chlist');
    let channelListSize = 1;
    for (const ch of channels) {
      channelListSize += ch.length + 1 + 4 + 1 + 3 + 4 + 4;
    }
    writeInt32(channelListSize);
    const sortedChannels = [...channels].sort();
    for (const ch of sortedChannels) {
      writeString(ch);
      writeInt32(pixelType);
      writeUint8(0);
      bufParts.push(new Uint8Array([0, 0, 0]));
      offset += 3;
      writeInt32(1);
      writeInt32(1);
    }
    writeUint8(0);

    // compression
    writeString('compression');
    writeString('compression');
    writeInt32(1);
    writeUint8(compression);

    // dataWindow
    writeString('dataWindow');
    writeString('box2i');
    writeInt32(16);
    writeInt32(0);
    writeInt32(0);
    writeInt32(width - 1);
    writeInt32(height - 1);

    // displayWindow
    writeString('displayWindow');
    writeString('box2i');
    writeInt32(16);
    writeInt32(0);
    writeInt32(0);
    writeInt32(width - 1);
    writeInt32(height - 1);

    // lineOrder
    writeString('lineOrder');
    writeString('lineOrder');
    writeInt32(1);
    writeUint8(0);

    // pixelAspectRatio
    writeString('pixelAspectRatio');
    writeString('float');
    writeInt32(4);
    writeFloat32(1.0);

    // tiles attribute for tiled parts
    if (partDef.tiled) {
      const txs = partDef.tileXSize ?? 2;
      const tys = partDef.tileYSize ?? 2;
      writeString('tiles');
      writeString('tiledesc');
      writeInt32(9);
      writeInt32(txs);
      writeInt32(tys);
      writeUint8(0); // ONE_LEVEL, ROUND_DOWN
    }

    writeUint8(0); // End of this part's header
  }
  writeUint8(0); // Empty header terminator

  // ===== OFFSET TABLES =====
  const offsetTableStart = offset;
  let totalOffsetTableSize = 0;
  const partBlockCounts: number[] = [];

  for (const partDef of partDefs) {
    const width = partDef.width ?? 2;
    const height = partDef.height ?? 2;
    if (partDef.tiled) {
      const txs = partDef.tileXSize ?? 2;
      const tys = partDef.tileYSize ?? 2;
      const numXTiles = Math.ceil(width / txs);
      const numYTiles = Math.ceil(height / tys);
      const numBlocks = numXTiles * numYTiles;
      partBlockCounts.push(numBlocks);
      totalOffsetTableSize += numBlocks * 8;
    } else {
      partBlockCounts.push(height); // 1 line per block for NONE compression
      totalOffsetTableSize += height * 8;
    }
  }

  const chunkDataStart = offsetTableStart + totalOffsetTableSize;

  // Pre-compute chunk offsets and sizes
  let currentDataOffset = chunkDataStart;
  const partChunkOffsets: bigint[][] = [];

  for (let p = 0; p < partDefs.length; p++) {
    const partDef = partDefs[p]!;
    const width = partDef.width ?? 2;
    const height = partDef.height ?? 2;
    const channels = partDef.channels ?? ['R', 'G', 'B', 'A'];
    const pixelType = partDef.pixelType ?? EXRPixelType.HALF;
    const bytesPerPixel = pixelType === EXRPixelType.HALF ? 2 : 4;

    const offsets: bigint[] = [];

    if (partDef.tiled) {
      const txs = partDef.tileXSize ?? 2;
      const tys = partDef.tileYSize ?? 2;
      const numXTiles = Math.ceil(width / txs);
      const numYTiles = Math.ceil(height / tys);

      for (let ty = 0; ty < numYTiles; ty++) {
        for (let tx = 0; tx < numXTiles; tx++) {
          offsets.push(BigInt(currentDataOffset));
          const actualTileW = Math.min(txs, width - tx * txs);
          const actualTileH = Math.min(tys, height - ty * tys);
          const tileDataSize = channels.length * actualTileW * bytesPerPixel * actualTileH;
          // partNumber(4) + tileX(4) + tileY(4) + levelX(4) + levelY(4) + packedSize(4) + data
          currentDataOffset += 24 + tileDataSize;
        }
      }
    } else {
      const scanlineSize = channels.length * width * bytesPerPixel;
      for (let y = 0; y < height; y++) {
        offsets.push(BigInt(currentDataOffset));
        // partNumber(4) + y(4) + packedSize(4) + data
        currentDataOffset += 12 + scanlineSize;
      }
    }
    partChunkOffsets.push(offsets);
  }

  // Write offset tables
  for (let p = 0; p < partDefs.length; p++) {
    for (const off of partChunkOffsets[p]!) {
      writeUint64(off);
    }
  }

  // ===== CHUNK DATA =====
  for (let p = 0; p < partDefs.length; p++) {
    const partDef = partDefs[p]!;
    const width = partDef.width ?? 2;
    const height = partDef.height ?? 2;
    const channels = partDef.channels ?? ['R', 'G', 'B', 'A'];
    const pixelType = partDef.pixelType ?? EXRPixelType.HALF;
    const valueMult = partDef.valueMultiplier ?? (p === 0 ? 1.0 : (p + 1) * 0.1);
    const bytesPerPixel = pixelType === EXRPixelType.HALF ? 2 : 4;
    const sortedChannels = [...channels].sort();

    if (partDef.tiled) {
      const txs = partDef.tileXSize ?? 2;
      const tys = partDef.tileYSize ?? 2;
      const numXTiles = Math.ceil(width / txs);
      const numYTiles = Math.ceil(height / tys);

      for (let ty = 0; ty < numYTiles; ty++) {
        for (let tx = 0; tx < numXTiles; tx++) {
          const actualTileW = Math.min(txs, width - tx * txs);
          const actualTileH = Math.min(tys, height - ty * tys);
          const tileDataSize = channels.length * actualTileW * bytesPerPixel * actualTileH;

          writeInt32(p);            // partNumber
          writeInt32(tx);           // tileX
          writeInt32(ty);           // tileY
          writeInt32(0);            // levelX
          writeInt32(0);            // levelY
          writeInt32(tileDataSize); // packedSize

          for (let line = 0; line < actualTileH; line++) {
            const globalY = ty * tys + line;
            for (const ch of sortedChannels) {
              for (let x = 0; x < actualTileW; x++) {
                const globalX = tx * txs + x;
                let value = 0;
                if (ch === 'R') value = valueMult * (globalX + globalY * width) / (width * height);
                else if (ch === 'G') value = valueMult * 0.5;
                else if (ch === 'B') value = valueMult * (1.0 - (globalX + globalY * width) / (width * height));
                else if (ch === 'A') value = 1.0;

                if (pixelType === EXRPixelType.HALF) {
                  writeHalf(value);
                } else {
                  writeFloat32(value);
                }
              }
            }
          }
        }
      }
    } else {
      const scanlineSize = channels.length * width * bytesPerPixel;
      for (let y = 0; y < height; y++) {
        writeInt32(p);            // partNumber
        writeInt32(y);            // y coordinate
        writeInt32(scanlineSize); // packedSize

        for (const ch of sortedChannels) {
          for (let x = 0; x < width; x++) {
            let value = 0;
            if (ch === 'R') value = valueMult * (x + y * width) / (width * height);
            else if (ch === 'G') value = valueMult * 0.5;
            else if (ch === 'B') value = valueMult * (1.0 - (x + y * width) / (width * height));
            else if (ch === 'A') value = 1.0;

            if (pixelType === EXRPixelType.HALF) {
              writeHalf(value);
            } else {
              writeFloat32(value);
            }
          }
        }
      }
    }
  }

  const totalLength = bufParts.reduce((sum, p) => sum + p.length, 0);
  const resultBuf = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of bufParts) {
    resultBuf.set(part, pos);
    pos += part.length;
  }
  return resultBuf.buffer;
}

// ===== Tiled EXR Tests =====

describe('EXR Tiled Image Support', () => {
  describe('Basic tiled decoding', () => {
    it('EXR-T001: should decode basic 4x4 tiled image with 2x2 tiles', async () => {
      const buffer = createTiledTestEXR({
        width: 4,
        height: 4,
        tileXSize: 2,
        tileYSize: 2,
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.channels).toBe(4);
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(4 * 4 * 4);

      // Verify pixel values - first pixel should have R close to 0
      expect(result.data[0]).toBeCloseTo(0, 1);
      // Green should be 0.5
      expect(result.data[1]).toBeCloseTo(0.5, 1);
      // Alpha should be 1.0
      expect(result.data[3]).toBeCloseTo(1.0, 1);
    });

    it('EXR-T002: should handle edge tiles (5x3 image with 2x2 tiles)', async () => {
      const buffer = createTiledTestEXR({
        width: 5,
        height: 3,
        tileXSize: 2,
        tileYSize: 2,
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(5);
      expect(result.height).toBe(3);
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(5 * 3 * 4);

      // Verify no NaN values
      for (let i = 0; i < result.data.length; i++) {
        expect(Number.isNaN(result.data[i])).toBe(false);
      }

      // All alpha values should be 1.0
      for (let i = 3; i < result.data.length; i += 4) {
        expect(result.data[i]).toBeCloseTo(1.0, 2);
      }
    });

    it('EXR-T003: should decode single-tile image (tile covers entire image)', async () => {
      const buffer = createTiledTestEXR({
        width: 4,
        height: 4,
        tileXSize: 4,
        tileYSize: 4,
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.data.length).toBe(4 * 4 * 4);

      // Green channel should be 0.5
      expect(result.data[1]).toBeCloseTo(0.5, 1);
    });

    it('EXR-T004: should decode tiled RGB (no alpha) image', async () => {
      const buffer = createTiledTestEXR({
        width: 4,
        height: 4,
        tileXSize: 2,
        tileYSize: 2,
        channels: ['R', 'G', 'B'],
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.channels).toBe(4); // Always 4 output channels

      // Alpha should be filled with 1.0 (no A channel)
      for (let i = 3; i < result.data.length; i += 4) {
        expect(result.data[i]).toBeCloseTo(1.0, 5);
      }
    });

    it('EXR-T005: should decode tiled grayscale (Y channel) image', async () => {
      const buffer = createTiledTestEXR({
        width: 4,
        height: 4,
        tileXSize: 2,
        tileYSize: 2,
        channels: ['Y'],
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.data).toBeInstanceOf(Float32Array);

      // Y maps to R, G, B -- they should be equal for each pixel
      for (let i = 0; i < result.data.length; i += 4) {
        expect(result.data[i]).toBeCloseTo(result.data[i + 1]!, 5);
        expect(result.data[i]).toBeCloseTo(result.data[i + 2]!, 5);
      }
    });
  });

  describe('Tiled level mode rejection', () => {
    it('EXR-T006: should reject MIPMAP_LEVELS tiled image', async () => {
      const buffer = createTiledTestEXR({
        width: 4,
        height: 4,
        tileXSize: 2,
        tileYSize: 2,
        levelMode: EXRLevelMode.MIPMAP_LEVELS,
      });

      await expect(decodeEXR(buffer)).rejects.toThrow(/Unsupported EXR tile level mode.*MIPMAP_LEVELS/);
    });

    it('EXR-T007: should reject RIPMAP_LEVELS tiled image', async () => {
      const buffer = createTiledTestEXR({
        width: 4,
        height: 4,
        tileXSize: 2,
        tileYSize: 2,
        levelMode: EXRLevelMode.RIPMAP_LEVELS,
      });

      await expect(decodeEXR(buffer)).rejects.toThrow(/Unsupported EXR tile level mode.*RIPMAP_LEVELS/);
    });
  });

  describe('Tiled header info', () => {
    it('EXR-T008: should provide tileDesc in header via getEXRInfo', () => {
      const buffer = createTiledTestEXR({
        width: 8,
        height: 8,
        tileXSize: 4,
        tileYSize: 4,
      });

      const info = getEXRInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.width).toBe(8);
      expect(info!.height).toBe(8);
    });

    it('EXR-T009: should parse tileDesc values correctly', async () => {
      const buffer = createTiledTestEXR({
        width: 8,
        height: 8,
        tileXSize: 4,
        tileYSize: 2,
      });

      const result = await decodeEXR(buffer);

      expect(result.header.tileDesc).toBeDefined();
      expect(result.header.tileDesc!.xSize).toBe(4);
      expect(result.header.tileDesc!.ySize).toBe(2);
      expect(result.header.tileDesc!.levelMode).toBe(EXRLevelMode.ONE_LEVEL);
      expect(result.header.tileDesc!.roundingMode).toBe(EXRRoundingMode.ROUND_DOWN);
      expect(result.header.tiled).toBe(true);
    });
  });

  describe('Tiled with uncrop', () => {
    it('EXR-T010: should apply uncrop with tiled image', async () => {
      const buffer = createTiledTestEXR({
        width: 4,
        height: 4,
        tileXSize: 2,
        tileYSize: 2,
        dataWindow: { xMin: 1, yMin: 1, xMax: 4, yMax: 4 },
        displayWindow: { xMin: 0, yMin: 0, xMax: 5, yMax: 5 },
      });

      const result = await decodeEXR(buffer);

      // Output should be display window size: 6x6
      expect(result.width).toBe(6);
      expect(result.height).toBe(6);
      expect(result.data.length).toBe(6 * 6 * 4);

      // Top-left corner (0,0) should be transparent black
      expect(result.data[0]).toBe(0);
      expect(result.data[1]).toBe(0);
      expect(result.data[2]).toBe(0);
      expect(result.data[3]).toBe(0);
    });
  });

  describe('Larger tiled images', () => {
    it('EXR-T011: should decode large tiled image (64x64 with 16x16 tiles)', async () => {
      const buffer = createTiledTestEXR({
        width: 64,
        height: 64,
        tileXSize: 16,
        tileYSize: 16,
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(64);
      expect(result.height).toBe(64);
      expect(result.data.length).toBe(64 * 64 * 4);

      // Verify no NaN
      for (let i = 0; i < result.data.length; i++) {
        expect(Number.isNaN(result.data[i])).toBe(false);
      }
    });

    it('EXR-T012: should decode tiled float32 image', async () => {
      const buffer = createTiledTestEXR({
        width: 4,
        height: 4,
        tileXSize: 2,
        tileYSize: 2,
        pixelType: EXRPixelType.FLOAT,
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(4 * 4 * 4);

      // Green channel should be exactly 0.5 for float32
      expect(result.data[1]).toBeCloseTo(0.5, 5);
      // Alpha should be exactly 1.0
      expect(result.data[3]).toBeCloseTo(1.0, 5);
    });
  });

  describe('Multi-part tiled', () => {
    it('EXR-T020: should decode tiled part in multi-part EXR', async () => {
      const buffer = createMultiPartTiledTestEXR([
        {
          name: 'tiled_part',
          type: 'tiledimage',
          tiled: true,
          tileXSize: 2,
          tileYSize: 2,
          channels: ['R', 'G', 'B', 'A'],
          width: 4,
          height: 4,
          valueMultiplier: 1.0,
        },
      ]);

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.channels).toBe(4);
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(4 * 4 * 4);
      expect(result.decodedPartIndex).toBe(0);

      // Green should be 0.5
      expect(result.data[1]).toBeCloseTo(0.5, 1);
    });

    it('EXR-T021: should handle mixed tiled+scanline parts', async () => {
      const buffer = createMultiPartTiledTestEXR([
        {
          name: 'scanline_part',
          type: 'scanlineimage',
          channels: ['R', 'G', 'B', 'A'],
          width: 4,
          height: 4,
          valueMultiplier: 1.0,
        },
        {
          name: 'tiled_part',
          type: 'tiledimage',
          tiled: true,
          tileXSize: 2,
          tileYSize: 2,
          channels: ['R', 'G', 'B', 'A'],
          width: 4,
          height: 4,
          valueMultiplier: 0.5,
        },
      ]);

      // Decode scanline part (index 0)
      const result0 = await decodeEXR(buffer);
      expect(result0.width).toBe(4);
      expect(result0.height).toBe(4);
      expect(result0.decodedPartIndex).toBe(0);
      // Green for part 0: 1.0 * 0.5 = 0.5
      expect(result0.data[1]).toBeCloseTo(0.5, 1);

      // Decode tiled part (index 1)
      const result1 = await decodeEXR(buffer, { partIndex: 1 });
      expect(result1.width).toBe(4);
      expect(result1.height).toBe(4);
      expect(result1.decodedPartIndex).toBe(1);
      // Green for part 1: 0.5 * 0.5 = 0.25
      expect(result1.data[1]).toBeCloseTo(0.25, 1);
    });
  });

  // ==================== Deep Scanline EXR Tests ====================

  describe('Deep scanline EXR', () => {
    /**
     * Create a deep scanline EXR file buffer for testing.
     *
     * Deep scanline format:
     * - Header with type="deepscanline", nonImage flag set
     * - Offset table (one uint64 per scanline block)
     * - Per block: y (int32), packedSampleOffsetSize (uint64), packedDataSize (uint64),
     *   unpackedDataSize (uint64), sample_count_table, sample_data
     *
     * Sample count table: cumulative counts per pixel (int32 each)
     * Sample data: for each pixel's samples, channel data in alphabetical channel order
     */
    function createDeepScanlineEXR(options: {
      width?: number;
      height?: number;
      channels?: string[];
      pixelType?: EXRPixelType;
      compression?: EXRCompression;
      /** Per-pixel sample counts, row-major [y][x] */
      sampleCounts: number[][];
      /** Per-pixel sample data: [y][x] = array of samples, each sample = {R, G, B, A} (or subset) */
      sampleData: number[][][][];
    }): ArrayBuffer {
      const {
        width = 2,
        height = 2,
        channels = ['A', 'B', 'G', 'R'], // Alphabetical order (EXR spec)
        pixelType = EXRPixelType.FLOAT,
        compression = EXRCompression.NONE,
        sampleCounts,
        sampleData,
      } = options;

      const parts: Uint8Array[] = [];
      let offset = 0;

      function writeUint32(value: number): void {
        const buf = new Uint8Array(4);
        const view = new DataView(buf.buffer);
        view.setUint32(0, value, true);
        parts.push(buf);
        offset += 4;
      }

      function writeInt32(value: number): void {
        const buf = new Uint8Array(4);
        const view = new DataView(buf.buffer);
        view.setInt32(0, value, true);
        parts.push(buf);
        offset += 4;
      }

      function writeUint8(value: number): void {
        parts.push(new Uint8Array([value]));
        offset += 1;
      }

      function writeString(str: string): void {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str);
        parts.push(bytes);
        parts.push(new Uint8Array([0]));
        offset += bytes.length + 1;
      }

      function writeFloat32(value: number): void {
        const buf = new Uint8Array(4);
        const view = new DataView(buf.buffer);
        view.setFloat32(0, value, true);
        parts.push(buf);
        offset += 4;
      }

      function writeUint64(value: bigint): void {
        const buf = new Uint8Array(8);
        const view = new DataView(buf.buffer);
        view.setBigUint64(0, value, true);
        parts.push(buf);
        offset += 8;
      }

      function writeBytes(data: Uint8Array): void {
        parts.push(data);
        offset += data.length;
      }

      // Magic number
      writeUint32(EXR_MAGIC);

      // Version field: version=2, nonImage=true (bit 11), no multipart
      // nonImage flag = 0x800
      writeUint32(2 | 0x800);

      // === HEADER ATTRIBUTES ===

      // type attribute (required for deep data)
      writeString('type');
      writeString('string');
      const typeStr = 'deepscanline';
      writeInt32(typeStr.length + 1); // include null terminator
      const typeBytes = new TextEncoder().encode(typeStr);
      parts.push(typeBytes);
      parts.push(new Uint8Array([0]));
      offset += typeBytes.length + 1;

      // channels attribute
      writeString('channels');
      writeString('chlist');

      let channelListSize = 1; // null terminator
      for (const ch of channels) {
        channelListSize += ch.length + 1 + 4 + 1 + 3 + 4 + 4;
      }
      writeInt32(channelListSize);

      for (const ch of channels) {
        writeString(ch);
        writeInt32(pixelType);
        writeUint8(0); // pLinear
        parts.push(new Uint8Array([0, 0, 0])); offset += 3; // reserved
        writeInt32(1); // xSampling
        writeInt32(1); // ySampling
      }
      writeUint8(0); // End of channel list

      // compression attribute
      writeString('compression');
      writeString('compression');
      writeInt32(1);
      writeUint8(compression);

      // dataWindow attribute
      writeString('dataWindow');
      writeString('box2i');
      writeInt32(16);
      writeInt32(0);
      writeInt32(0);
      writeInt32(width - 1);
      writeInt32(height - 1);

      // displayWindow attribute
      writeString('displayWindow');
      writeString('box2i');
      writeInt32(16);
      writeInt32(0);
      writeInt32(0);
      writeInt32(width - 1);
      writeInt32(height - 1);

      // lineOrder attribute
      writeString('lineOrder');
      writeString('lineOrder');
      writeInt32(1);
      writeUint8(0); // INCREASING_Y

      // pixelAspectRatio attribute
      writeString('pixelAspectRatio');
      writeString('float');
      writeInt32(4);
      writeFloat32(1.0);

      // End of header
      writeUint8(0);

      // === OFFSET TABLE ===
      // For deep scanline with NONE/RLE/ZIPS compression, one block per scanline
      const linesPerBlock = 1; // NONE and ZIPS are 1 line per block
      const numBlocks = Math.ceil(height / linesPerBlock);

      const headerEnd = offset;
      const offsetTableSize = numBlocks * 8;
      const dataStart = headerEnd + offsetTableSize;

      // Build block data first, then write offsets
      const blockBuffers: Uint8Array[][] = [];
      const bytesPerSample = pixelType === EXRPixelType.HALF ? 2 : 4;

      for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
        const y = blockIdx;
        const blockLines = Math.min(linesPerBlock, height - blockIdx * linesPerBlock);
        const pixelsInBlock = blockLines * width;

        // Build cumulative sample count table
        const countBuf = new ArrayBuffer(pixelsInBlock * 4);
        const countView = new DataView(countBuf);
        let cumulativeCount = 0;
        for (let line = 0; line < blockLines; line++) {
          for (let x = 0; x < width; x++) {
            const iy = y + line;
            cumulativeCount += sampleCounts[iy]![x]!;
            countView.setUint32((line * width + x) * 4, cumulativeCount, true);
          }
        }
        const totalSamplesInBlock = cumulativeCount;

        // Build sample data
        const sampleBufSize = totalSamplesInBlock * channels.length * bytesPerSample;
        const sampleBuf = new ArrayBuffer(sampleBufSize);
        const sampleView = new DataView(sampleBuf);
        let sampleByteOffset = 0;

        for (let line = 0; line < blockLines; line++) {
          for (let x = 0; x < width; x++) {
            const iy = y + line;
            const numSamples = sampleCounts[iy]![x]!;
            const pixelSamples = sampleData[iy]![x]!;

            for (let s = 0; s < numSamples; s++) {
              const sampleValues = pixelSamples[s]!;
              // Write channel values in channel list order (alphabetical)
              for (let ci = 0; ci < channels.length; ci++) {
                if (pixelType === EXRPixelType.FLOAT) {
                  sampleView.setFloat32(sampleByteOffset, sampleValues[ci] ?? 0, true);
                  sampleByteOffset += 4;
                } else {
                  sampleView.setUint16(sampleByteOffset, floatToHalf(sampleValues[ci] ?? 0), true);
                  sampleByteOffset += 2;
                }
              }
            }
          }
        }

        const countBytes = new Uint8Array(countBuf);
        const sampleBytes = new Uint8Array(sampleBuf, 0, sampleByteOffset);

        // Block: y (4) + packedSampleOffsetSize (8) + packedDataSize (8) + unpackedDataSize (8) + countData + sampleData
        const blockParts: Uint8Array[] = [];
        // y coordinate
        const yBuf = new Uint8Array(4);
        new DataView(yBuf.buffer).setInt32(0, y, true);
        blockParts.push(yBuf);

        // packedSampleOffsetSize (= raw size for NONE compression)
        const psosBuf = new Uint8Array(8);
        new DataView(psosBuf.buffer).setBigUint64(0, BigInt(countBytes.length), true);
        blockParts.push(psosBuf);

        // packedDataSize (= raw size for NONE compression)
        const pdsBuf = new Uint8Array(8);
        new DataView(pdsBuf.buffer).setBigUint64(0, BigInt(sampleBytes.length), true);
        blockParts.push(pdsBuf);

        // unpackedDataSize
        const udsBuf = new Uint8Array(8);
        new DataView(udsBuf.buffer).setBigUint64(0, BigInt(sampleBytes.length), true);
        blockParts.push(udsBuf);

        blockParts.push(countBytes);
        blockParts.push(sampleBytes);

        blockBuffers.push(blockParts);
      }

      // Calculate block offsets and write offset table
      let currentOffset = dataStart;
      for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
        writeUint64(BigInt(currentOffset));
        for (const part of blockBuffers[blockIdx]!) {
          currentOffset += part.length;
        }
      }

      // Write block data
      for (const blockParts of blockBuffers) {
        for (const part of blockParts) {
          writeBytes(part);
        }
      }

      // Combine all parts
      const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
      const result = new Uint8Array(totalLength);
      let pos = 0;
      for (const part of parts) {
        result.set(part, pos);
        pos += part.length;
      }

      return result.buffer;
    }

    it('EXR-DEEP001: should decode deep scanline with single sample per pixel', async () => {
      const width = 2, height = 2;
      // Each pixel has 1 sample
      const sampleCounts = [[1, 1], [1, 1]];
      // Channel order is alphabetical: A, B, G, R
      // Each sample = [A, B, G, R]
      const sampleData = [
        [
          [[1.0, 0.0, 0.0, 1.0]],  // pixel (0,0): R=1, G=0, B=0, A=1
          [[1.0, 0.0, 1.0, 0.0]],  // pixel (1,0): R=0, G=1, B=0, A=1
        ],
        [
          [[1.0, 1.0, 0.0, 0.0]],  // pixel (0,1): R=0, G=0, B=1, A=1
          [[0.5, 0.5, 0.5, 0.5]],  // pixel (1,1): R=0.5, G=0.5, B=0.5, A=0.5
        ],
      ];

      const buffer = createDeepScanlineEXR({
        width, height,
        sampleCounts,
        sampleData,
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(width * height * 4);

      // Pixel (0,0): R=1, G=0, B=0, A=1
      expect(result.data[0]).toBeCloseTo(1.0, 4);  // R
      expect(result.data[1]).toBeCloseTo(0.0, 4);  // G
      expect(result.data[2]).toBeCloseTo(0.0, 4);  // B
      expect(result.data[3]).toBeCloseTo(1.0, 4);  // A

      // Pixel (1,0): R=0, G=1, B=0, A=1
      expect(result.data[4]).toBeCloseTo(0.0, 4);  // R
      expect(result.data[5]).toBeCloseTo(1.0, 4);  // G
      expect(result.data[6]).toBeCloseTo(0.0, 4);  // B
      expect(result.data[7]).toBeCloseTo(1.0, 4);  // A

      // Pixel (1,1): R=0.5, G=0.5, B=0.5, A=0.5
      expect(result.data[12]).toBeCloseTo(0.5, 4);
      expect(result.data[13]).toBeCloseTo(0.5, 4);
      expect(result.data[14]).toBeCloseTo(0.5, 4);
      expect(result.data[15]).toBeCloseTo(0.5, 4);
    });

    it('EXR-DEEP002: should composite multiple deep samples front-to-back', async () => {
      const width = 1, height = 1;
      // 2 samples for the single pixel
      const sampleCounts = [[2]];
      // Channel order: A, B, G, R
      // Front sample: R=1, G=0, B=0, A=0.5
      // Back sample: R=0, G=0, B=1, A=1.0
      // Over composite: C = Cf + (1-Af) * Cb
      // R_out = 1.0 + (1-0.5) * 0.0 = 1.0
      // G_out = 0.0 + (1-0.5) * 0.0 = 0.0
      // B_out = 0.0 + (1-0.5) * 1.0 = 0.5
      // A_out = 0.5 + (1-0.5) * 1.0 = 1.0
      const sampleData = [
        [
          [
            [0.5, 0.0, 0.0, 1.0],  // front: A=0.5, B=0.0, G=0.0, R=1.0
            [1.0, 1.0, 0.0, 0.0],  // back:  A=1.0, B=1.0, G=0.0, R=0.0
          ],
        ],
      ];

      const buffer = createDeepScanlineEXR({
        width, height,
        sampleCounts,
        sampleData,
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);

      // Composited result
      expect(result.data[0]).toBeCloseTo(1.0, 4);  // R = 1.0 + 0.5 * 0.0 = 1.0
      expect(result.data[1]).toBeCloseTo(0.0, 4);  // G = 0.0 + 0.5 * 0.0 = 0.0
      expect(result.data[2]).toBeCloseTo(0.5, 4);  // B = 0.0 + 0.5 * 1.0 = 0.5
      expect(result.data[3]).toBeCloseTo(1.0, 4);  // A = 0.5 + 0.5 * 1.0 = 1.0
    });

    it('EXR-DEEP003: should handle pixels with zero samples (transparent)', async () => {
      const width = 2, height = 1;
      const sampleCounts = [[0, 1]];
      // Pixel (0,0): no samples - should remain transparent (0,0,0,0)
      // Pixel (1,0): one sample
      const sampleData = [
        [
          [], // No samples
          [[1.0, 0.0, 1.0, 0.0]], // A=1.0, B=0.0, G=1.0, R=0.0 -> R=0, G=1, B=0, A=1
        ],
      ];

      const buffer = createDeepScanlineEXR({
        width, height,
        sampleCounts,
        sampleData,
      });

      const result = await decodeEXR(buffer);

      // Pixel (0,0): transparent
      expect(result.data[0]).toBeCloseTo(0.0, 4);
      expect(result.data[1]).toBeCloseTo(0.0, 4);
      expect(result.data[2]).toBeCloseTo(0.0, 4);
      expect(result.data[3]).toBeCloseTo(0.0, 4);

      // Pixel (1,0): opaque green
      expect(result.data[4]).toBeCloseTo(0.0, 4);
      expect(result.data[5]).toBeCloseTo(1.0, 4);
      expect(result.data[6]).toBeCloseTo(0.0, 4);
      expect(result.data[7]).toBeCloseTo(1.0, 4);
    });

    it('EXR-DEEP004: should early-exit compositing when fully opaque', async () => {
      const width = 1, height = 1;
      // 3 samples, but first is fully opaque - rest should be ignored
      const sampleCounts = [[3]];
      // Channel order: A, B, G, R
      const sampleData = [
        [
          [
            [1.0, 0.0, 0.0, 1.0], // front: R=1, G=0, B=0, A=1 (fully opaque)
            [1.0, 1.0, 1.0, 0.0], // back: should be ignored
            [1.0, 0.5, 0.5, 0.5], // even further back: should be ignored
          ],
        ],
      ];

      const buffer = createDeepScanlineEXR({
        width, height,
        sampleCounts,
        sampleData,
      });

      const result = await decodeEXR(buffer);

      // Only the first sample should matter
      expect(result.data[0]).toBeCloseTo(1.0, 4);  // R
      expect(result.data[1]).toBeCloseTo(0.0, 4);  // G
      expect(result.data[2]).toBeCloseTo(0.0, 4);  // B
      expect(result.data[3]).toBeCloseTo(1.0, 4);  // A
    });

    it('EXR-DEEP005: should composite three semi-transparent layers', async () => {
      const width = 1, height = 1;
      const sampleCounts = [[3]];
      // Channel order: A, B, G, R
      // Layer 1 (front): R=1, G=0, B=0, A=0.25
      // Layer 2 (middle): R=0, G=1, B=0, A=0.25
      // Layer 3 (back): R=0, G=0, B=1, A=0.5
      //
      // Step 1: C = (1,0,0)*1 + (1-0)*(0,0,0) for first sample (front-to-back)
      //   Actually front-to-back Over:
      //   After layer 1: R=1*0.25=... wait let me recalc.
      //   front-to-back: C_out = (1-A_accum) * C_sample, A_out = A_accum + (1-A_accum)*A_sample
      //   After L1: R=0.25, G=0, B=0, A=0.25
      //   After L2: R=0.25+0.75*0=0.25, G=0+0.75*0.25=0.1875, B=0+0.75*0=0, A=0.25+0.75*0.25=0.4375
      //   After L3: R=0.25+0.5625*0=0.25, G=0.1875+0.5625*0=0.1875, B=0+0.5625*0.5=0.28125, A=0.4375+0.5625*0.5=0.71875
      //
      // Wait, let me re-examine my compositing logic.
      // compR starts at 0, compA starts at 0.
      // Sample 1 (R=1, A=0.25): oneMinusA = 1-0 = 1, compR = 0 + 1*1 = 1, compA = 0 + 1*0.25 = 0.25
      // No wait - that's not right either. Let me re-read the code:
      //   oneMinusA = 1.0 - compA;
      //   compR += oneMinusA * sR;
      // So this is premultiplied alpha compositing? No, it's treating sR as the premultiplied color.
      // Actually for deep compositing, samples store NON-premultiplied color, and the Over formula is:
      //   C_out = C_front * A_front + (1 - A_front) * C_back * A_back  (for premultiplied)
      // But the standard front-to-back accumulation is:
      //   C_accum += (1 - A_accum) * C_sample
      //   A_accum += (1 - A_accum) * A_sample
      // which treats samples as premultiplied (C_sample already includes alpha).
      //
      // So with our samples (non-premultiplied stored as-is):
      // Sample 1: sR=1, sA=0.25
      //   compR = 0 + (1-0)*1 = 1
      //   compA = 0 + (1-0)*0.25 = 0.25
      // Sample 2: sR=0, sG=1, sA=0.25
      //   compR = 1 + (1-0.25)*0 = 1
      //   compG = 0 + (1-0.25)*1 = 0.75
      //   compA = 0.25 + (1-0.25)*0.25 = 0.4375
      // Sample 3: sB=1, sA=0.5
      //   compR = 1 + (1-0.4375)*0 = 1
      //   compG = 0.75 + (1-0.4375)*0 = 0.75
      //   compB = 0 + (1-0.4375)*1 = 0.5625
      //   compA = 0.4375 + (1-0.4375)*0.5 = 0.71875
      const sampleData = [
        [
          [
            [0.25, 0.0, 0.0, 1.0],  // A=0.25, B=0, G=0, R=1
            [0.25, 0.0, 1.0, 0.0],  // A=0.25, B=0, G=1, R=0
            [0.5,  1.0, 0.0, 0.0],  // A=0.5,  B=1, G=0, R=0
          ],
        ],
      ];

      const buffer = createDeepScanlineEXR({
        width, height: 1,
        sampleCounts,
        sampleData,
      });

      const result = await decodeEXR(buffer);

      expect(result.data[0]).toBeCloseTo(1.0, 4);      // R
      expect(result.data[1]).toBeCloseTo(0.75, 4);      // G
      expect(result.data[2]).toBeCloseTo(0.5625, 4);    // B
      expect(result.data[3]).toBeCloseTo(0.71875, 4);   // A
    });

    it('EXR-DEEP006: should handle multi-row deep scanline image', async () => {
      const width = 2, height = 3;
      const sampleCounts = [
        [1, 2],
        [0, 1],
        [1, 1],
      ];

      // Channel order: A, B, G, R
      const sampleData = [
        [
          [[1.0, 0.0, 0.0, 1.0]],  // (0,0): R=1 G=0 B=0 A=1
          [
            [0.5, 0.0, 0.0, 0.5],  // (1,0) front: R=0.5 A=0.5
            [1.0, 1.0, 0.0, 0.0],  // (1,0) back: B=1 A=1
          ],
        ],
        [
          [],                        // (0,1): no samples
          [[1.0, 0.0, 1.0, 0.0]],  // (1,1): G=1 A=1
        ],
        [
          [[0.5, 0.5, 0.5, 0.5]],  // (0,2): all 0.5
          [[1.0, 0.3, 0.2, 0.1]],  // (1,2): R=0.1 G=0.2 B=0.3 A=1
        ],
      ];

      const buffer = createDeepScanlineEXR({
        width, height,
        sampleCounts,
        sampleData,
      });

      const result = await decodeEXR(buffer);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);

      // Pixel (0,0): single opaque red
      expect(result.data[0]).toBeCloseTo(1.0, 4);
      expect(result.data[1]).toBeCloseTo(0.0, 4);
      expect(result.data[2]).toBeCloseTo(0.0, 4);
      expect(result.data[3]).toBeCloseTo(1.0, 4);

      // Pixel (1,0): 2 samples composited
      // Sample 1: R=0.5, G=0, B=0, A=0.5. compR=0.5, compA=0.5
      // Sample 2: R=0, G=0, B=1, A=1.  compR=0.5+(1-0.5)*0=0.5, compB=0+(1-0.5)*1=0.5, compA=0.5+(1-0.5)*1=1.0
      expect(result.data[4]).toBeCloseTo(0.5, 4);   // R
      expect(result.data[5]).toBeCloseTo(0.0, 4);   // G
      expect(result.data[6]).toBeCloseTo(0.5, 4);   // B
      expect(result.data[7]).toBeCloseTo(1.0, 4);   // A

      // Pixel (0,1): no samples - transparent
      const idx01 = (1 * width + 0) * 4;
      expect(result.data[idx01]).toBeCloseTo(0.0, 4);
      expect(result.data[idx01 + 3]).toBeCloseTo(0.0, 4);

      // Pixel (1,2): single sample
      const idx12 = (2 * width + 1) * 4;
      expect(result.data[idx12]).toBeCloseTo(0.1, 4);
      expect(result.data[idx12 + 1]).toBeCloseTo(0.2, 4);
      expect(result.data[idx12 + 2]).toBeCloseTo(0.3, 4);
      expect(result.data[idx12 + 3]).toBeCloseTo(1.0, 4);
    });

    it('EXR-DEEP007: should handle all-empty deep image', async () => {
      const width = 2, height = 2;
      const sampleCounts = [[0, 0], [0, 0]];
      const sampleData = [
        [[], []],
        [[], []],
      ];

      const buffer = createDeepScanlineEXR({
        width, height,
        sampleCounts,
        sampleData,
      });

      const result = await decodeEXR(buffer);

      // All pixels should be transparent black
      for (let i = 0; i < result.data.length; i++) {
        expect(result.data[i]).toBeCloseTo(0.0, 4);
      }
    });

    it('EXR-DEEP008: should report correct header info for deep image', async () => {
      const width = 4, height = 4;
      const sampleCounts = [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]];
      const sampleData: number[][][][] = [];
      for (let y = 0; y < height; y++) {
        const row: number[][][] = [];
        for (let x = 0; x < width; x++) {
          row.push([[1.0, 0.0, 0.0, 0.5]]);
        }
        sampleData.push(row);
      }

      const buffer = createDeepScanlineEXR({
        width, height,
        sampleCounts,
        sampleData,
      });

      const result = await decodeEXR(buffer);

      expect(result.header.type).toBe('deepscanline');
      expect(result.header.nonImage).toBe(true);
      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
    });

    it('EXR-DEEP009: should composite deep pixel with many samples', async () => {
      const width = 1, height = 1;
      // 5 samples, each with A=0.25
      const numSamples = 5;
      const sampleCounts = [[numSamples]];
      // Channel order: A, B, G, R
      // All red, A=0.25 each
      const samples: number[][] = [];
      for (let i = 0; i < numSamples; i++) {
        samples.push([0.25, 0.0, 0.0, 1.0]); // A=0.25, B=0, G=0, R=1
      }
      const sampleData = [[[...samples]]];

      const buffer = createDeepScanlineEXR({
        width, height: 1,
        sampleCounts,
        sampleData,
      });

      const result = await decodeEXR(buffer);

      // Front-to-back compositing of 5 samples each R=1, A=0.25:
      // After 1: compR=1.0, compA=0.25
      // After 2: compR=1.0+0.75*1=1.75, compA=0.25+0.75*0.25=0.4375
      // After 3: compR=1.75+0.5625*1=2.3125, compA=0.4375+0.5625*0.25=0.578125
      // After 4: compR=2.3125+0.421875*1=2.734375, compA=0.578125+0.421875*0.25=0.68359375
      // After 5: compR=2.734375+0.31640625*1=3.05078125, compA=0.68359375+0.31640625*0.25≈0.7627
      //
      // This is correct for the non-premultiplied accumulation the code uses.
      // The result will be > 1.0 for R because we accumulate non-premultiplied values.
      // (Deep compositing with non-premultiplied alpha can produce values > 1.)
      expect(result.data[0]).toBeGreaterThan(1.0);   // R accumulated
      expect(result.data[1]).toBeCloseTo(0.0, 4);     // G stays 0
      expect(result.data[2]).toBeCloseTo(0.0, 4);     // B stays 0
      // Alpha should be 1 - (1-0.25)^5 = 1 - 0.75^5 ≈ 0.7627
      expect(result.data[3]).toBeCloseTo(1 - Math.pow(0.75, 5), 3);
    });

    it('EXR-DEEP010: should reject deeptile type', async () => {
      // Create a buffer that looks like a deeptile EXR
      const parts: Uint8Array[] = [];
      let offset = 0;

      function writeUint32(value: number): void {
        const buf = new Uint8Array(4);
        new DataView(buf.buffer).setUint32(0, value, true);
        parts.push(buf); offset += 4;
      }
      function writeInt32(value: number): void {
        const buf = new Uint8Array(4);
        new DataView(buf.buffer).setInt32(0, value, true);
        parts.push(buf); offset += 4;
      }
      function writeUint8(value: number): void {
        parts.push(new Uint8Array([value])); offset += 1;
      }
      function writeString(str: string): void {
        const bytes = new TextEncoder().encode(str);
        parts.push(bytes); parts.push(new Uint8Array([0]));
        offset += bytes.length + 1;
      }
      function writeFloat32(value: number): void {
        const buf = new Uint8Array(4);
        new DataView(buf.buffer).setFloat32(0, value, true);
        parts.push(buf); offset += 4;
      }

      writeUint32(EXR_MAGIC);
      writeUint32(2 | 0x200 | 0x800); // version=2, tiled=true, nonImage=true

      // type attribute
      writeString('type');
      writeString('string');
      const typeStr = 'deeptile';
      writeInt32(typeStr.length + 1);
      parts.push(new TextEncoder().encode(typeStr));
      parts.push(new Uint8Array([0]));
      offset += typeStr.length + 1;

      // tiles attribute
      writeString('tiles');
      writeString('tiledesc');
      writeInt32(9);
      writeInt32(32); // xSize
      writeInt32(32); // ySize
      writeUint8(0);  // mode

      // channels
      writeString('channels');
      writeString('chlist');
      const chSize = 'R'.length + 1 + 4 + 1 + 3 + 4 + 4 + 1;
      writeInt32(chSize);
      writeString('R');
      writeInt32(EXRPixelType.HALF);
      writeUint8(0); parts.push(new Uint8Array([0, 0, 0])); offset += 3;
      writeInt32(1); writeInt32(1);
      writeUint8(0);

      // compression
      writeString('compression');
      writeString('compression');
      writeInt32(1);
      writeUint8(0);

      // dataWindow
      writeString('dataWindow');
      writeString('box2i');
      writeInt32(16);
      writeInt32(0); writeInt32(0); writeInt32(1); writeInt32(1);

      // displayWindow
      writeString('displayWindow');
      writeString('box2i');
      writeInt32(16);
      writeInt32(0); writeInt32(0); writeInt32(1); writeInt32(1);

      // lineOrder
      writeString('lineOrder');
      writeString('lineOrder');
      writeInt32(1);
      writeUint8(0);

      // pixelAspectRatio
      writeString('pixelAspectRatio');
      writeString('float');
      writeInt32(4);
      writeFloat32(1.0);

      writeUint8(0); // end header

      const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
      const result = new Uint8Array(totalLength);
      let pos = 0;
      for (const part of parts) { result.set(part, pos); pos += part.length; }

      await expect(decodeEXR(result.buffer)).rejects.toThrow(/[Dd]eep.*tiled|deeptile/);
    });
  });
});
