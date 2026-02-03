/**
 * DPX Decoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isDPXFile,
  getDPXInfo,
  decodeDPX,
  unpackDPX10bit,
  dpxLogToLinear,
} from './DPXDecoder';

const DPX_MAGIC_BE = 0x53445058; // "SDPX"
const DPX_MAGIC_LE = 0x58504453; // "XPDS"

/**
 * Create a minimal valid DPX file buffer for testing.
 * Generates a DPX with the specified parameters and filled pixel data.
 */
function createTestDPX(options: {
  width?: number;
  height?: number;
  bitDepth?: number;
  bigEndian?: boolean;
  transfer?: number; // 0=linear, 3=log
  channels?: number; // 3=RGB, 4=RGBA
  dataOffset?: number;
} = {}): ArrayBuffer {
  const {
    width = 2,
    height = 2,
    bitDepth = 10,
    bigEndian = true,
    transfer = 0,
    channels = 3,
    dataOffset = 2048, // standard DPX data offset
  } = options;

  // Calculate pixel data size
  let pixelDataSize: number;
  const componentsPerRow = width * channels;
  const totalComponents = width * height * channels;
  if (bitDepth === 10) {
    // Row-aligned: each row starts at a word boundary
    const wordsPerRow = Math.ceil(componentsPerRow / 3);
    pixelDataSize = wordsPerRow * height * 4;
  } else if (bitDepth === 8) {
    pixelDataSize = totalComponents;
  } else if (bitDepth === 12 || bitDepth === 16) {
    pixelDataSize = totalComponents * 2;
  } else {
    pixelDataSize = totalComponents * 2;
  }

  const totalSize = dataOffset + pixelDataSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const le = !bigEndian;

  // Magic number (offset 0)
  view.setUint32(0, bigEndian ? DPX_MAGIC_BE : DPX_MAGIC_LE, false);

  // Image data offset (offset 4)
  view.setUint32(4, dataOffset, le);

  // File size (offset 16)
  view.setUint32(16, totalSize, le);

  // Number of image elements (offset 768)
  view.setUint16(768, 1, le);

  // Width (offset 772)
  view.setUint32(772, width, le);

  // Height (offset 776)
  view.setUint32(776, height, le);

  // Descriptor (offset 800): 50=RGB, 51=RGBA
  view.setUint8(800, channels === 4 ? 51 : 50);

  // Transfer function (offset 801)
  view.setUint8(801, transfer);

  // Bit depth (offset 803)
  view.setUint8(803, bitDepth);

  // Packing (offset 804): 1 = Method A
  view.setUint16(804, 1, le);

  // Fill pixel data with test values
  if (bitDepth === 10) {
    // Pack 10-bit data: 3 components per 32-bit word, row-aligned
    const pixelView = new DataView(buffer, dataOffset);
    const wordsPerRow = Math.ceil(componentsPerRow / 3);
    let componentIdx = 0;
    for (let row = 0; row < height; row++) {
      for (let w = 0; w < wordsPerRow; w++) {
        const c0 = componentIdx < componentsPerRow * (row + 1) ? Math.min(1023, componentIdx % 1024) : 0;
        componentIdx++;
        const c1 = componentIdx < componentsPerRow * (row + 1) ? Math.min(1023, componentIdx % 1024) : 0;
        componentIdx++;
        const c2 = componentIdx < componentsPerRow * (row + 1) ? Math.min(1023, componentIdx % 1024) : 0;
        componentIdx++;
        const word = (c0 << 22) | (c1 << 12) | (c2 << 2);
        pixelView.setUint32((row * wordsPerRow + w) * 4, word, le);
      }
      // Reset component tracking for proper row boundaries
      componentIdx = componentsPerRow * (row + 1);
    }
  } else if (bitDepth === 8) {
    const pixelBytes = new Uint8Array(buffer, dataOffset);
    for (let i = 0; i < totalComponents; i++) {
      pixelBytes[i] = (i * 37) % 256; // Test pattern
    }
  } else if (bitDepth === 16) {
    const pixelView = new DataView(buffer, dataOffset);
    for (let i = 0; i < totalComponents; i++) {
      pixelView.setUint16(i * 2, (i * 1000) % 65536, le);
    }
  } else if (bitDepth === 12) {
    const pixelView = new DataView(buffer, dataOffset);
    for (let i = 0; i < totalComponents; i++) {
      // 12-bit data in upper 12 bits of 16-bit container
      const val12 = (i * 100) % 4096;
      pixelView.setUint16(i * 2, val12 << 4, le);
    }
  }

  return buffer;
}

describe('DPXDecoder', () => {
  describe('isDPXFile', () => {
    it('should detect big-endian DPX by magic number', () => {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, DPX_MAGIC_BE, false);
      expect(isDPXFile(buffer)).toBe(true);
    });

    it('should detect little-endian DPX by magic number', () => {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, DPX_MAGIC_LE, false);
      expect(isDPXFile(buffer)).toBe(true);
    });

    it('should return false for non-DPX data', () => {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, 0x12345678, false);
      expect(isDPXFile(buffer)).toBe(false);
    });

    it('should return false for buffer too small', () => {
      const buffer = new ArrayBuffer(2);
      expect(isDPXFile(buffer)).toBe(false);
    });

    it('should return false for empty buffer', () => {
      const buffer = new ArrayBuffer(0);
      expect(isDPXFile(buffer)).toBe(false);
    });
  });

  describe('getDPXInfo', () => {
    it('should parse big-endian DPX header', () => {
      const buffer = createTestDPX({ bigEndian: true, width: 1920, height: 1080 });
      const info = getDPXInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.width).toBe(1920);
      expect(info!.height).toBe(1080);
      expect(info!.bigEndian).toBe(true);
      expect(info!.bitDepth).toBe(10);
    });

    it('should parse little-endian DPX header', () => {
      const buffer = createTestDPX({ bigEndian: false, width: 640, height: 480 });
      const info = getDPXInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.width).toBe(640);
      expect(info!.height).toBe(480);
      expect(info!.bigEndian).toBe(false);
    });

    it('should detect logarithmic transfer', () => {
      const buffer = createTestDPX({ transfer: 3 });
      const info = getDPXInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.transfer).toBe('logarithmic');
    });

    it('should detect linear transfer', () => {
      const buffer = createTestDPX({ transfer: 0 });
      const info = getDPXInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.transfer).toBe('linear');
    });

    it('should detect RGB channels', () => {
      const buffer = createTestDPX({ channels: 3 });
      const info = getDPXInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.channels).toBe(3);
    });

    it('should detect RGBA channels', () => {
      const buffer = createTestDPX({ channels: 4 });
      const info = getDPXInfo(buffer);
      expect(info).not.toBeNull();
      expect(info!.channels).toBe(4);
    });

    it('should report correct bit depth', () => {
      for (const bitDepth of [8, 10, 12, 16]) {
        const buffer = createTestDPX({ bitDepth });
        const info = getDPXInfo(buffer);
        expect(info).not.toBeNull();
        expect(info!.bitDepth).toBe(bitDepth);
      }
    });

    it('should return null for non-DPX data', () => {
      const buffer = new ArrayBuffer(2048);
      expect(getDPXInfo(buffer)).toBeNull();
    });

    it('should return null for buffer too small', () => {
      const buffer = new ArrayBuffer(100);
      expect(getDPXInfo(buffer)).toBeNull();
    });
  });

  describe('unpackDPX10bit', () => {
    it('should unpack 3 components from a single 32-bit word', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      // Pack: c0=1023, c1=512, c2=0
      const word = (1023 << 22) | (512 << 12) | (0 << 2);
      view.setUint32(0, word, false); // big-endian

      const result = unpackDPX10bit(view, 1, 1, 3, true);
      expect(result.length).toBe(3);
      expect(result[0]).toBeCloseTo(1023 / 1023, 5); // ~1.0
      expect(result[1]).toBeCloseTo(512 / 1023, 5); // ~0.5
      expect(result[2]).toBeCloseTo(0 / 1023, 5); // 0.0
    });

    it('should handle little-endian data', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      const word = (512 << 22) | (256 << 12) | (128 << 2);
      view.setUint32(0, word, true); // little-endian

      const result = unpackDPX10bit(view, 1, 1, 3, false);
      expect(result.length).toBe(3);
      expect(result[0]).toBeCloseTo(512 / 1023, 5);
      expect(result[1]).toBeCloseTo(256 / 1023, 5);
      expect(result[2]).toBeCloseTo(128 / 1023, 5);
    });

    it('should handle multiple pixels', () => {
      // 2 pixels x 3 channels = 6 components = 2 words
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);

      // Word 0: 3 components
      const word0 = (100 << 22) | (200 << 12) | (300 << 2);
      view.setUint32(0, word0, false);

      // Word 1: 3 components
      const word1 = (400 << 22) | (500 << 12) | (600 << 2);
      view.setUint32(4, word1, false);

      const result = unpackDPX10bit(view, 2, 1, 3, true);
      expect(result.length).toBe(6);
      expect(result[0]).toBeCloseTo(100 / 1023, 5);
      expect(result[3]).toBeCloseTo(400 / 1023, 5);
    });

    it('should produce values in [0, 1] range', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);
      const word = (1023 << 22) | (0 << 12) | (512 << 2);
      view.setUint32(0, word, false);

      const result = unpackDPX10bit(view, 1, 1, 3, true);
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBeGreaterThanOrEqual(0);
        expect(result[i]).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('decodeDPX', () => {
    it('should decode a 10-bit RGB DPX', async () => {
      const buffer = createTestDPX({ width: 2, height: 2, bitDepth: 10, channels: 3 });
      const result = await decodeDPX(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4); // Always RGBA
      expect(result.data.length).toBe(2 * 2 * 4);
      expect(result.colorSpace).toBe('linear');
    });

    it('should decode an 8-bit RGB DPX', async () => {
      const buffer = createTestDPX({ width: 4, height: 4, bitDepth: 8, channels: 3 });
      const result = await decodeDPX(buffer);

      expect(result.width).toBe(4);
      expect(result.height).toBe(4);
      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(4 * 4 * 4);
    });

    it('should decode a 16-bit DPX', async () => {
      const buffer = createTestDPX({ width: 2, height: 2, bitDepth: 16, channels: 3 });
      const result = await decodeDPX(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
    });

    it('should decode a 12-bit DPX', async () => {
      const buffer = createTestDPX({ width: 2, height: 2, bitDepth: 12, channels: 3 });
      const result = await decodeDPX(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
    });

    it('should set alpha to 1.0 for RGB input', async () => {
      const buffer = createTestDPX({ width: 2, height: 2, bitDepth: 8, channels: 3 });
      const result = await decodeDPX(buffer);

      // Check alpha channel for all pixels
      for (let i = 3; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(1.0);
      }
    });

    it('should decode RGBA DPX without adding alpha', async () => {
      const buffer = createTestDPX({ width: 2, height: 2, bitDepth: 8, channels: 4 });
      const result = await decodeDPX(buffer);

      expect(result.channels).toBe(4);
      expect(result.data.length).toBe(2 * 2 * 4);
    });

    it('should detect logarithmic color space', async () => {
      const buffer = createTestDPX({ transfer: 3 });
      const result = await decodeDPX(buffer);
      expect(result.colorSpace).toBe('log');
    });

    it('should apply log-to-linear conversion when requested', async () => {
      const buffer = createTestDPX({ transfer: 3, bitDepth: 10 });
      const resultLog = await decodeDPX(buffer);
      const resultLinear = await decodeDPX(buffer, { applyLogToLinear: true });

      expect(resultLog.colorSpace).toBe('log');
      expect(resultLinear.colorSpace).toBe('linear');
      // Linear values should differ from log values
      // (they go through the log-to-linear conversion)
    });

    it('should include metadata in the result', async () => {
      const buffer = createTestDPX({ bitDepth: 10, bigEndian: true });
      const result = await decodeDPX(buffer);

      expect(result.metadata.format).toBe('dpx');
      expect(result.metadata.bitDepth).toBe(10);
      expect(result.metadata.bigEndian).toBe(true);
    });

    it('should throw for invalid DPX data', async () => {
      const buffer = new ArrayBuffer(100);
      await expect(decodeDPX(buffer)).rejects.toThrow('Invalid DPX file');
    });

    it('should produce finite float values', async () => {
      const buffer = createTestDPX({ width: 4, height: 4, bitDepth: 10 });
      const result = await decodeDPX(buffer);

      for (let i = 0; i < result.data.length; i++) {
        expect(isFinite(result.data[i]!)).toBe(true);
      }
    });

    it('should handle little-endian DPX', async () => {
      const buffer = createTestDPX({ bigEndian: false, width: 2, height: 2 });
      const result = await decodeDPX(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
    });
  });

  describe('dpxLogToLinear (re-exported)', () => {
    it('should be accessible from DPXDecoder module', () => {
      expect(typeof dpxLogToLinear).toBe('function');
    });

    it('should convert log code values to linear', () => {
      const result = dpxLogToLinear(500);
      expect(result).toBeGreaterThan(0);
      expect(isFinite(result)).toBe(true);
    });

    it('should return 0 for values at or below refBlack', () => {
      expect(dpxLogToLinear(95)).toBe(0);
      expect(dpxLogToLinear(0)).toBe(0);
    });
  });
});
