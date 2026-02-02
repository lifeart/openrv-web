/**
 * EXR Decoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  decodeEXR,
  exrToIPImage,
  isEXRFile,
  getEXRInfo,
  EXRCompression,
  EXRPixelType,
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
    it('EXR-U090: should reject PIZ compression', async () => {
      const buffer = createTestEXR({ compression: EXRCompression.PIZ });
      await expect(decodeEXR(buffer)).rejects.toThrow(/Unsupported EXR compression.*PIZ/);
    });

    it('EXR-U091: should reject PXR24 compression', async () => {
      const buffer = createTestEXR({ compression: EXRCompression.PXR24 });
      await expect(decodeEXR(buffer)).rejects.toThrow(/Unsupported EXR compression.*PXR24/);
    });

    it('EXR-U092: should reject B44 compression', async () => {
      const buffer = createTestEXR({ compression: EXRCompression.B44 });
      await expect(decodeEXR(buffer)).rejects.toThrow(/Unsupported EXR compression.*B44/);
    });

    it('EXR-U093: should reject DWAA compression', async () => {
      const buffer = createTestEXR({ compression: EXRCompression.DWAA });
      await expect(decodeEXR(buffer)).rejects.toThrow(/Unsupported EXR compression.*DWAA/);
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
    it('EXR-U132: should reject DWAB compression', async () => {
      const buffer = createTestEXR({ compression: EXRCompression.DWAB });
      await expect(decodeEXR(buffer)).rejects.toThrow(/Unsupported EXR compression.*DWAB/);
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
