/**
 * JXLDecoder Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isJXLFile, isJXLContainer, decodeJXL } from './JXLDecoder';

describe('JXLDecoder', () => {
  describe('isJXLFile', () => {
    it('should detect JXL codestream magic (0xFF 0x0A)', () => {
      const buffer = new ArrayBuffer(2);
      const view = new Uint8Array(buffer);
      view[0] = 0xff;
      view[1] = 0x0a;
      expect(isJXLFile(buffer)).toBe(true);
    });

    it('should detect JXL ISOBMFF container (ftyp + jxl brand)', () => {
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      // Box size (12 bytes)
      view.setUint32(0, 12, false);
      // Box type 'ftyp'
      view.setUint8(4, 'f'.charCodeAt(0));
      view.setUint8(5, 't'.charCodeAt(0));
      view.setUint8(6, 'y'.charCodeAt(0));
      view.setUint8(7, 'p'.charCodeAt(0));
      // Major brand 'jxl '
      view.setUint8(8, 'j'.charCodeAt(0));
      view.setUint8(9, 'x'.charCodeAt(0));
      view.setUint8(10, 'l'.charCodeAt(0));
      view.setUint8(11, ' '.charCodeAt(0));
      expect(isJXLFile(buffer)).toBe(true);
    });

    it('should return false for non-JXL data', () => {
      const buffer = new ArrayBuffer(16);
      new Uint8Array(buffer).set([0x89, 0x50, 0x4e, 0x47]); // PNG
      expect(isJXLFile(buffer)).toBe(false);
    });

    it('should return false for empty buffer', () => {
      expect(isJXLFile(new ArrayBuffer(0))).toBe(false);
    });

    it('should return false for single byte buffer', () => {
      expect(isJXLFile(new ArrayBuffer(1))).toBe(false);
    });

    it('should return false for AVIF ftyp box', () => {
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      view.setUint32(0, 12, false);
      view.setUint8(4, 'f'.charCodeAt(0));
      view.setUint8(5, 't'.charCodeAt(0));
      view.setUint8(6, 'y'.charCodeAt(0));
      view.setUint8(7, 'p'.charCodeAt(0));
      view.setUint8(8, 'a'.charCodeAt(0));
      view.setUint8(9, 'v'.charCodeAt(0));
      view.setUint8(10, 'i'.charCodeAt(0));
      view.setUint8(11, 'f'.charCodeAt(0));
      expect(isJXLFile(buffer)).toBe(false);
    });
  });

  describe('isJXLContainer', () => {
    it('should return true for ISOBMFF container', () => {
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      view.setUint32(0, 12, false);
      // 'ftyp'
      view.setUint8(4, 0x66); view.setUint8(5, 0x74);
      view.setUint8(6, 0x79); view.setUint8(7, 0x70);
      // 'jxl '
      view.setUint8(8, 0x6a); view.setUint8(9, 0x78);
      view.setUint8(10, 0x6c); view.setUint8(11, 0x20);
      expect(isJXLContainer(buffer)).toBe(true);
    });

    it('should return false for bare codestream', () => {
      const buffer = new ArrayBuffer(2);
      new Uint8Array(buffer).set([0xff, 0x0a]);
      expect(isJXLContainer(buffer)).toBe(false);
    });

    it('should return false for small buffer', () => {
      expect(isJXLContainer(new ArrayBuffer(8))).toBe(false);
    });
  });

  describe('decodeJXL', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should reject invalid JXL data', async () => {
      const buffer = new ArrayBuffer(16);
      await expect(decodeJXL(buffer)).rejects.toThrow('Invalid JXL file');
    });

    it('should decode JXL via @jsquash/jxl and return Float32Array RGBA', async () => {
      // Create a JXL codestream buffer (magic bytes only for detection)
      const buffer = new ArrayBuffer(4);
      const bytes = new Uint8Array(buffer);
      bytes[0] = 0xff;
      bytes[1] = 0x0a;

      // Mock the @jsquash/jxl module
      const mockImageData = {
        width: 2,
        height: 2,
        data: new Uint8ClampedArray([
          255, 0, 0, 255,   // red
          0, 255, 0, 255,   // green
          0, 0, 255, 255,   // blue
          255, 255, 255, 255, // white
        ]),
      };

      vi.doMock('@jsquash/jxl', () => ({
        decode: vi.fn().mockResolvedValue(mockImageData),
      }));

      // Re-import to pick up the mock
      const { decodeJXL: mockedDecodeJXL } = await import('./JXLDecoder');
      const result = await mockedDecodeJXL(buffer);

      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.channels).toBe(4);
      expect(result.colorSpace).toBe('srgb');
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(2 * 2 * 4);

      // Verify normalized values (255 → 1.0, 0 → 0.0)
      expect(result.data[0]).toBeCloseTo(1.0, 3); // R of red pixel
      expect(result.data[1]).toBeCloseTo(0.0, 3); // G of red pixel
      expect(result.data[3]).toBeCloseTo(1.0, 3); // A of red pixel

      expect(result.metadata).toEqual({
        format: 'jxl',
        container: 'codestream',
      });

      vi.doUnmock('@jsquash/jxl');
    });

    it('should identify ISOBMFF container in metadata', async () => {
      // Create a JXL ISOBMFF container buffer
      const buffer = new ArrayBuffer(16);
      const view = new DataView(buffer);
      view.setUint32(0, 12, false);
      // 'ftyp'
      view.setUint8(4, 'f'.charCodeAt(0)); view.setUint8(5, 't'.charCodeAt(0));
      view.setUint8(6, 'y'.charCodeAt(0)); view.setUint8(7, 'p'.charCodeAt(0));
      // 'jxl '
      view.setUint8(8, 'j'.charCodeAt(0)); view.setUint8(9, 'x'.charCodeAt(0));
      view.setUint8(10, 'l'.charCodeAt(0)); view.setUint8(11, ' '.charCodeAt(0));

      const mockImageData = {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([128, 128, 128, 255]),
      };

      vi.doMock('@jsquash/jxl', () => ({
        decode: vi.fn().mockResolvedValue(mockImageData),
      }));

      const { decodeJXL: mockedDecodeJXL } = await import('./JXLDecoder');
      const result = await mockedDecodeJXL(buffer);

      expect(result.metadata).toEqual({
        format: 'jxl',
        container: 'isobmff',
      });

      vi.doUnmock('@jsquash/jxl');
    });

    it('should propagate decode errors from @jsquash/jxl', async () => {
      const buffer = new ArrayBuffer(4);
      const bytes = new Uint8Array(buffer);
      bytes[0] = 0xff;
      bytes[1] = 0x0a;

      vi.doMock('@jsquash/jxl', () => ({
        decode: vi.fn().mockRejectedValue(new Error('WASM decode failed: corrupt bitstream')),
      }));

      const { decodeJXL: mockedDecodeJXL } = await import('./JXLDecoder');
      await expect(mockedDecodeJXL(buffer)).rejects.toThrow('WASM decode failed');

      vi.doUnmock('@jsquash/jxl');
    });

    it('should produce pixel values strictly in [0, 1] range for 8-bit input', async () => {
      const buffer = new ArrayBuffer(4);
      const bytes = new Uint8Array(buffer);
      bytes[0] = 0xff;
      bytes[1] = 0x0a;

      // Full range: 0 and 255
      const mockImageData = {
        width: 2,
        height: 1,
        data: new Uint8ClampedArray([
          0, 0, 0, 0,           // all zeros
          255, 255, 255, 255,   // all max
        ]),
      };

      vi.doMock('@jsquash/jxl', () => ({
        decode: vi.fn().mockResolvedValue(mockImageData),
      }));

      const { decodeJXL: mockedDecodeJXL } = await import('./JXLDecoder');
      const result = await mockedDecodeJXL(buffer);

      // Black pixel
      expect(result.data[0]).toBe(0.0);
      expect(result.data[1]).toBe(0.0);
      expect(result.data[2]).toBe(0.0);
      expect(result.data[3]).toBe(0.0);

      // White pixel
      expect(result.data[4]).toBeCloseTo(1.0, 3);
      expect(result.data[5]).toBeCloseTo(1.0, 3);
      expect(result.data[6]).toBeCloseTo(1.0, 3);
      expect(result.data[7]).toBeCloseTo(1.0, 3);

      // No value should exceed [0,1]
      for (let i = 0; i < result.data.length; i++) {
        expect(result.data[i]).toBeGreaterThanOrEqual(0.0);
        expect(result.data[i]).toBeLessThanOrEqual(1.0);
      }

      vi.doUnmock('@jsquash/jxl');
    });
  });

  describe('edge cases', () => {
    it('should not match a buffer with only first magic byte', () => {
      const buffer = new ArrayBuffer(2);
      const bytes = new Uint8Array(buffer);
      bytes[0] = 0xff;
      bytes[1] = 0x00; // Wrong second byte
      expect(isJXLFile(buffer)).toBe(false);
    });

    it('should not match ftyp box with truncated brand', () => {
      // ftyp header but only 3 bytes of brand (not enough for 'jxl ')
      const buffer = new ArrayBuffer(11);
      const view = new DataView(buffer);
      view.setUint32(0, 11, false);
      view.setUint8(4, 'f'.charCodeAt(0));
      view.setUint8(5, 't'.charCodeAt(0));
      view.setUint8(6, 'y'.charCodeAt(0));
      view.setUint8(7, 'p'.charCodeAt(0));
      view.setUint8(8, 'j'.charCodeAt(0));
      view.setUint8(9, 'x'.charCodeAt(0));
      view.setUint8(10, 'l'.charCodeAt(0));
      // Missing ' ' at offset 11
      expect(isJXLFile(buffer)).toBe(false);
    });

    it('should not match ftyp box with wrong brand', () => {
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      view.setUint32(0, 12, false);
      // 'ftyp'
      view.setUint8(4, 'f'.charCodeAt(0));
      view.setUint8(5, 't'.charCodeAt(0));
      view.setUint8(6, 'y'.charCodeAt(0));
      view.setUint8(7, 'p'.charCodeAt(0));
      // 'heic' (HEIF brand, not JXL)
      view.setUint8(8, 'h'.charCodeAt(0));
      view.setUint8(9, 'e'.charCodeAt(0));
      view.setUint8(10, 'i'.charCodeAt(0));
      view.setUint8(11, 'c'.charCodeAt(0));
      expect(isJXLFile(buffer)).toBe(false);
    });
  });
});
