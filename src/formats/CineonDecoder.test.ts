/**
 * Cineon Decoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isCineonFile,
  getCineonInfo,
  decodeCineon,
  cineonLogToLinear,
} from './CineonDecoder';

const CINEON_MAGIC = 0x802a5fd7;

/**
 * Create a minimal valid Cineon file buffer for testing.
 * Cineon is always big-endian, 10-bit packed, RGB.
 */
function createTestCineon(options: {
  width?: number;
  height?: number;
  dataOffset?: number;
} = {}): ArrayBuffer {
  const {
    width = 2,
    height = 2,
    dataOffset = 1024, // standard Cineon data offset
  } = options;

  const channels = 3; // Always RGB
  const totalComponents = width * height * channels;
  const totalWords = Math.ceil(totalComponents / 3);
  const pixelDataSize = totalWords * 4;
  const totalSize = dataOffset + pixelDataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Magic number (offset 0) - big endian
  view.setUint32(0, CINEON_MAGIC, false);

  // Image data offset (offset 4) - big endian
  view.setUint32(4, dataOffset, false);

  // Total file size (offset 20) - big endian
  view.setUint32(20, totalSize, false);

  // Width (offset 200) - big endian
  view.setUint32(200, width, false);

  // Height (offset 204) - big endian
  view.setUint32(204, height, false);

  // Bit depth (offset 213) - always 10
  view.setUint8(213, 10);

  // Fill pixel data with test values (10-bit packed, big-endian)
  const pixelView = new DataView(buffer, dataOffset);
  for (let w = 0; w < totalWords; w++) {
    // Create 3 components with test values
    const c0 = Math.min(1023, (w * 3 + 100) % 1024);
    const c1 = Math.min(1023, (w * 3 + 200) % 1024);
    const c2 = Math.min(1023, (w * 3 + 300) % 1024);
    const word = (c0 << 22) | (c1 << 12) | (c2 << 2);
    pixelView.setUint32(w * 4, word, false); // big-endian
  }

  return buffer;
}

describe('CineonDecoder', () => {
  describe('isCineonFile', () => {
    it('should detect Cineon by magic number', () => {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, CINEON_MAGIC, false);
      expect(isCineonFile(buffer)).toBe(true);
    });

    it('should return false for non-Cineon data', () => {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, 0x12345678, false);
      expect(isCineonFile(buffer)).toBe(false);
    });

    it('should return false for buffer too small', () => {
      const buffer = new ArrayBuffer(2);
      expect(isCineonFile(buffer)).toBe(false);
    });

    it('should return false for empty buffer', () => {
      const buffer = new ArrayBuffer(0);
      expect(isCineonFile(buffer)).toBe(false);
    });

    it('should not confuse DPX magic with Cineon magic', () => {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, 0x53445058, false); // DPX magic
      expect(isCineonFile(buffer)).toBe(false);
    });
  });

  describe('getCineonInfo', () => {
    it('should parse Cineon header correctly', () => {
      const buffer = createTestCineon({ width: 1920, height: 1080 });
      const info = getCineonInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.width).toBe(1920);
      expect(info!.height).toBe(1080);
      expect(info!.bitDepth).toBe(10);
      expect(info!.channels).toBe(3);
    });

    it('should report correct data offset', () => {
      const buffer = createTestCineon({ dataOffset: 2048 });
      const info = getCineonInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.dataOffset).toBe(2048);
    });

    it('should return null for non-Cineon data', () => {
      const buffer = new ArrayBuffer(1024);
      expect(getCineonInfo(buffer)).toBeNull();
    });

    it('should return null for buffer too small', () => {
      const buffer = new ArrayBuffer(100);
      expect(getCineonInfo(buffer)).toBeNull();
    });
  });

  describe('decodeCineon', () => {
    it('should decode a Cineon file to RGBA', async () => {
      const buffer = createTestCineon({ width: 2, height: 2 });
      const result = await decodeCineon(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4); // Always RGBA output
      expect(result.data.length).toBe(2 * 2 * 4);
    });

    it('should apply log-to-linear by default', async () => {
      const buffer = createTestCineon();
      const result = await decodeCineon(buffer);
      expect(result.colorSpace).toBe('linear');
    });

    it('should preserve log data when applyLogToLinear is false', async () => {
      const buffer = createTestCineon();
      const result = await decodeCineon(buffer, { applyLogToLinear: false });
      expect(result.colorSpace).toBe('log');
    });

    it('should set alpha to 1.0 for all pixels', async () => {
      const buffer = createTestCineon({ width: 4, height: 4 });
      const result = await decodeCineon(buffer);

      for (let i = 3; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(1.0);
      }
    });

    it('should produce finite float values', async () => {
      const buffer = createTestCineon({ width: 4, height: 4 });
      const result = await decodeCineon(buffer);

      for (let i = 0; i < result.data.length; i++) {
        expect(isFinite(result.data[i]!)).toBe(true);
      }
    });

    it('should include metadata in the result', async () => {
      const buffer = createTestCineon();
      const result = await decodeCineon(buffer);

      expect(result.metadata.format).toBe('cineon');
      expect(result.metadata.bitDepth).toBe(10);
      expect(result.metadata.originalChannels).toBe(3);
    });

    it('should throw for invalid Cineon data', async () => {
      const buffer = new ArrayBuffer(100);
      await expect(decodeCineon(buffer)).rejects.toThrow('Invalid Cineon file');
    });

    it('should differ between log and linear decoded values', async () => {
      const buffer = createTestCineon();
      const logResult = await decodeCineon(buffer, { applyLogToLinear: false });
      const linearResult = await decodeCineon(buffer, { applyLogToLinear: true });

      // The values should be different after conversion
      // (at least some of them, since log-to-linear changes the values)
      let foundDifference = false;
      for (let i = 0; i < logResult.data.length; i += 4) {
        // Compare R channel
        if (Math.abs(logResult.data[i]! - linearResult.data[i]!) > 0.001) {
          foundDifference = true;
          break;
        }
      }
      expect(foundDifference).toBe(true);
    });
  });

  describe('decodeCineon - error handling', () => {
    it('should throw for unsupported bit depth (non-10-bit)', async () => {
      // Create a Cineon and override bit depth to 8
      const buffer = createTestCineon({ width: 2, height: 2 });
      const view = new DataView(buffer);
      view.setUint8(213, 8); // Set bit depth to 8

      await expect(decodeCineon(buffer)).rejects.toThrow('Unsupported Cineon bit depth: 8');
    });

    it('should throw for bit depth 16', async () => {
      const buffer = createTestCineon({ width: 2, height: 2 });
      const view = new DataView(buffer);
      view.setUint8(213, 16);

      await expect(decodeCineon(buffer)).rejects.toThrow('Unsupported Cineon bit depth: 16');
    });

    it('should throw when data offset exceeds file size', async () => {
      const buffer = createTestCineon({ width: 2, height: 2 });
      const view = new DataView(buffer);
      // Set data offset to beyond file size
      view.setUint32(4, buffer.byteLength + 1000, false);

      await expect(decodeCineon(buffer)).rejects.toThrow(/data offset.*exceeds file size/);
    });

    it('should throw for zero-width image', async () => {
      const buffer = createTestCineon({ width: 2, height: 2 });
      const view = new DataView(buffer);
      // Set width to 0
      view.setUint32(200, 0, false);

      await expect(decodeCineon(buffer)).rejects.toThrow(/Invalid Cineon dimensions/);
    });

    it('should throw for zero-height image', async () => {
      const buffer = createTestCineon({ width: 2, height: 2 });
      const view = new DataView(buffer);
      // Set height to 0
      view.setUint32(204, 0, false);

      await expect(decodeCineon(buffer)).rejects.toThrow(/Invalid Cineon dimensions/);
    });

    it('should throw for extremely large dimensions', async () => {
      const buffer = createTestCineon({ width: 2, height: 2 });
      const view = new DataView(buffer);
      // Set dimensions to exceed max dimension limit (65536)
      view.setUint32(200, 100000, false);
      view.setUint32(204, 100000, false);

      await expect(decodeCineon(buffer)).rejects.toThrow(/exceed maximum/);
    });
  });

  describe('decodeCineon - pixel value verification', () => {
    it('should handle 1x1 pixel image', async () => {
      const buffer = createTestCineon({ width: 1, height: 1 });
      const result = await decodeCineon(buffer, { applyLogToLinear: false });

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.data.length).toBe(4); // RGBA
      expect(result.data[3]).toBe(1.0); // Alpha
    });

    it('should correctly decode known 10-bit packed values', async () => {
      // Create a 1x1 Cineon with known packed pixel values
      const dataOffset = 1024;
      const channels = 3;
      const totalWords = Math.ceil(1 * 1 * channels / 3);
      const pixelDataSize = totalWords * 4;
      const totalSize = dataOffset + pixelDataSize;
      const buffer = new ArrayBuffer(totalSize);
      const view = new DataView(buffer);

      // Set up Cineon header
      view.setUint32(0, CINEON_MAGIC, false);
      view.setUint32(4, dataOffset, false);
      view.setUint32(200, 1, false); // width
      view.setUint32(204, 1, false); // height
      view.setUint8(213, 10);        // bit depth

      // Pack known 10-bit values: R=512, G=256, B=768
      const word = (512 << 22) | (256 << 12) | (768 << 2);
      view.setUint32(dataOffset, word, false);

      const result = await decodeCineon(buffer, { applyLogToLinear: false });

      expect(result.data[0]).toBeCloseTo(512 / 1023, 4); // R
      expect(result.data[1]).toBeCloseTo(256 / 1023, 4); // G
      expect(result.data[2]).toBeCloseTo(768 / 1023, 4); // B
      expect(result.data[3]).toBe(1.0);                   // A
    });

    it('should produce Float32Array output', async () => {
      const buffer = createTestCineon();
      const result = await decodeCineon(buffer);
      expect(result.data).toBeInstanceOf(Float32Array);
    });

    it('should always output 4 channels regardless of input', async () => {
      const buffer = createTestCineon({ width: 3, height: 3 });
      const result = await decodeCineon(buffer);

      // Cineon is always 3 channels in, but output should be 4 (RGBA)
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(3 * 3 * 4);
    });

    it('should handle larger images correctly', async () => {
      const buffer = createTestCineon({ width: 64, height: 32 });
      const result = await decodeCineon(buffer);

      expect(result.width).toBe(64);
      expect(result.height).toBe(32);
      expect(result.data.length).toBe(64 * 32 * 4);
    });
  });

  describe('getCineonInfo - edge cases', () => {
    it('should return null when magic number is wrong', () => {
      const buffer = new ArrayBuffer(1024);
      const view = new DataView(buffer);
      view.setUint32(0, 0x12345678, false); // Wrong magic
      expect(getCineonInfo(buffer)).toBeNull();
    });

    it('should always report channels as 3', () => {
      const buffer = createTestCineon();
      const info = getCineonInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.channels).toBe(3);
    });
  });

  describe('cineonLogToLinear (re-exported)', () => {
    it('should be accessible from CineonDecoder module', () => {
      expect(typeof cineonLogToLinear).toBe('function');
    });

    it('should convert log code values to linear', () => {
      const result = cineonLogToLinear(500);
      expect(result).toBeGreaterThan(0);
      expect(isFinite(result)).toBe(true);
    });

    it('should return 0 for values at or below refBlack', () => {
      expect(cineonLogToLinear(95)).toBe(0);
      expect(cineonLogToLinear(0)).toBe(0);
    });
  });
});
