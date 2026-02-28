/**
 * DecoderRegistry Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { DecoderRegistry, decoderRegistry, type FormatDecoder } from './DecoderRegistry';

// Magic numbers
const EXR_MAGIC = 0x01312f76;
const DPX_MAGIC_BE = 0x53445058;
const DPX_MAGIC_LE = 0x58504453;
const CINEON_MAGIC = 0x802a5fd7;
const TIFF_LE = 0x4949;
const TIFF_MAGIC = 42;

function createEXRMagic(): ArrayBuffer {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, EXR_MAGIC, true);
  return buffer;
}

function createDPXMagic(bigEndian = true): ArrayBuffer {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, bigEndian ? DPX_MAGIC_BE : DPX_MAGIC_LE, false);
  return buffer;
}

function createCineonMagic(): ArrayBuffer {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, CINEON_MAGIC, false);
  return buffer;
}

/**
 * Create a minimal float TIFF header for format detection.
 * Must include enough data for getTIFFInfo to parse SampleFormat tag.
 */
function createFloatTIFFMagic(): ArrayBuffer {
  // Needs enough space for header + IFD with SampleFormat tag
  const buffer = new ArrayBuffer(512);
  const view = new DataView(buffer);

  // TIFF Header
  view.setUint16(0, TIFF_LE, false); // "II" little-endian
  view.setUint16(2, TIFF_MAGIC, true); // Magic 42
  view.setUint32(4, 8, true); // IFD at offset 8

  // IFD with minimal tags
  const ifdOffset = 8;
  const numTags = 4;
  view.setUint16(ifdOffset, numTags, true);
  let pos = ifdOffset + 2;

  // Tag 256: ImageWidth = 2
  view.setUint16(pos, 256, true);
  view.setUint16(pos + 2, 4, true); // LONG
  view.setUint32(pos + 4, 1, true);
  view.setUint32(pos + 8, 2, true);
  pos += 12;

  // Tag 257: ImageLength = 2
  view.setUint16(pos, 257, true);
  view.setUint16(pos + 2, 4, true); // LONG
  view.setUint32(pos + 4, 1, true);
  view.setUint32(pos + 8, 2, true);
  pos += 12;

  // Tag 258: BitsPerSample = 32
  view.setUint16(pos, 258, true);
  view.setUint16(pos + 2, 3, true); // SHORT
  view.setUint32(pos + 4, 1, true);
  view.setUint16(pos + 8, 32, true);
  pos += 12;

  // Tag 339: SampleFormat = 3 (float)
  view.setUint16(pos, 339, true);
  view.setUint16(pos + 2, 3, true); // SHORT
  view.setUint32(pos + 4, 1, true);
  view.setUint16(pos + 8, 3, true);
  pos += 12;

  // Next IFD = 0
  view.setUint32(pos, 0, true);

  return buffer;
}

function createJXLCodestreamMagic(): ArrayBuffer {
  const buffer = new ArrayBuffer(4);
  const view = new Uint8Array(buffer);
  view[0] = 0xff;
  view[1] = 0x0a;
  return buffer;
}

function createJXLContainerMagic(): ArrayBuffer {
  const buffer = new ArrayBuffer(12);
  const view = new DataView(buffer);
  view.setUint32(0, 12, false); // box size
  // 'ftyp'
  view.setUint8(4, 0x66); view.setUint8(5, 0x74);
  view.setUint8(6, 0x79); view.setUint8(7, 0x70);
  // 'jxl '
  view.setUint8(8, 0x6a); view.setUint8(9, 0x78);
  view.setUint8(10, 0x6c); view.setUint8(11, 0x20);
  return buffer;
}

function createHDRMagic(): ArrayBuffer {
  const header = '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 2\n';
  const headerBytes = Array.from(header).map(c => c.charCodeAt(0));
  // Add 4 pixels of uncompressed RGBE data (2x2 image)
  const pixelBytes = [128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128];
  const buffer = new ArrayBuffer(headerBytes.length + pixelBytes.length);
  const view = new Uint8Array(buffer);
  view.set(headerBytes, 0);
  view.set(pixelBytes, headerBytes.length);
  return buffer;
}

function createNonFloatTIFFMagic(): ArrayBuffer {
  // Same as float TIFF but with SampleFormat=1 (uint)
  const buffer = new ArrayBuffer(512);
  const view = new DataView(buffer);

  view.setUint16(0, TIFF_LE, false);
  view.setUint16(2, TIFF_MAGIC, true);
  view.setUint32(4, 8, true);

  const ifdOffset = 8;
  const numTags = 4;
  view.setUint16(ifdOffset, numTags, true);
  let pos = ifdOffset + 2;

  // Tag 256: ImageWidth = 2
  view.setUint16(pos, 256, true);
  view.setUint16(pos + 2, 4, true);
  view.setUint32(pos + 4, 1, true);
  view.setUint32(pos + 8, 2, true);
  pos += 12;

  // Tag 257: ImageLength = 2
  view.setUint16(pos, 257, true);
  view.setUint16(pos + 2, 4, true);
  view.setUint32(pos + 4, 1, true);
  view.setUint32(pos + 8, 2, true);
  pos += 12;

  // Tag 258: BitsPerSample = 8
  view.setUint16(pos, 258, true);
  view.setUint16(pos + 2, 3, true);
  view.setUint32(pos + 4, 1, true);
  view.setUint16(pos + 8, 8, true);
  pos += 12;

  // Tag 339: SampleFormat = 1 (uint)
  view.setUint16(pos, 339, true);
  view.setUint16(pos + 2, 3, true);
  view.setUint32(pos + 4, 1, true);
  view.setUint16(pos + 8, 1, true);
  pos += 12;

  view.setUint32(pos, 0, true);

  return buffer;
}

describe('DecoderRegistry', () => {
  describe('detectFormat', () => {
    it('should detect EXR format', () => {
      const registry = new DecoderRegistry();
      expect(registry.detectFormat(createEXRMagic())).toBe('exr');
    });

    it('should detect DPX format (big-endian)', () => {
      const registry = new DecoderRegistry();
      expect(registry.detectFormat(createDPXMagic(true))).toBe('DPX');
    });

    it('should detect DPX format (little-endian)', () => {
      const registry = new DecoderRegistry();
      expect(registry.detectFormat(createDPXMagic(false))).toBe('DPX');
    });

    it('should detect Cineon format', () => {
      const registry = new DecoderRegistry();
      expect(registry.detectFormat(createCineonMagic())).toBe('Cineon');
    });

    it('should detect float TIFF format', () => {
      const registry = new DecoderRegistry();
      expect(registry.detectFormat(createFloatTIFFMagic())).toBe('TIFF');
    });

    it('should not detect non-float TIFF as float TIFF', () => {
      const registry = new DecoderRegistry();
      // Non-float TIFF should not be detected by the TIFF (float) decoder,
      // but will be matched by the RAW preview decoder (TIFF-based non-float)
      expect(registry.detectFormat(createNonFloatTIFFMagic())).not.toBe('TIFF');
      expect(registry.detectFormat(createNonFloatTIFFMagic())).toBe('raw-preview');
    });

    it('should detect HDR format', () => {
      const registry = new DecoderRegistry();
      expect(registry.detectFormat(createHDRMagic())).toBe('hdr');
    });

    it('should detect JXL format (codestream)', () => {
      const registry = new DecoderRegistry();
      expect(registry.detectFormat(createJXLCodestreamMagic())).toBe('jxl');
    });

    it('should detect JXL format (ISOBMFF container)', () => {
      const registry = new DecoderRegistry();
      expect(registry.detectFormat(createJXLContainerMagic())).toBe('jxl');
    });

    it('should return null for unknown format', () => {
      const registry = new DecoderRegistry();
      const buffer = new ArrayBuffer(16);
      expect(registry.detectFormat(buffer)).toBeNull();
    });

    it('should return null for empty buffer', () => {
      const registry = new DecoderRegistry();
      const buffer = new ArrayBuffer(0);
      expect(registry.detectFormat(buffer)).toBeNull();
    });
  });

  describe('getDecoder', () => {
    it('should return EXR decoder for EXR data', () => {
      const registry = new DecoderRegistry();
      const decoder = registry.getDecoder(createEXRMagic());
      expect(decoder).not.toBeNull();
      expect(decoder!.formatName).toBe('exr');
    });

    it('should return DPX decoder for DPX data', () => {
      const registry = new DecoderRegistry();
      const decoder = registry.getDecoder(createDPXMagic());
      expect(decoder).not.toBeNull();
      expect(decoder!.formatName).toBe('DPX');
    });

    it('should return Cineon decoder for Cineon data', () => {
      const registry = new DecoderRegistry();
      const decoder = registry.getDecoder(createCineonMagic());
      expect(decoder).not.toBeNull();
      expect(decoder!.formatName).toBe('Cineon');
    });

    it('should return TIFF decoder for float TIFF data', () => {
      const registry = new DecoderRegistry();
      const decoder = registry.getDecoder(createFloatTIFFMagic());
      expect(decoder).not.toBeNull();
      expect(decoder!.formatName).toBe('TIFF');
    });

    it('should return HDR decoder for HDR data', () => {
      const registry = new DecoderRegistry();
      const decoder = registry.getDecoder(createHDRMagic());
      expect(decoder).not.toBeNull();
      expect(decoder!.formatName).toBe('hdr');
    });

    it('should return JXL decoder for JXL codestream data', () => {
      const registry = new DecoderRegistry();
      const decoder = registry.getDecoder(createJXLCodestreamMagic());
      expect(decoder).not.toBeNull();
      expect(decoder!.formatName).toBe('jxl');
    });

    it('should return JXL decoder for JXL container data', () => {
      const registry = new DecoderRegistry();
      const decoder = registry.getDecoder(createJXLContainerMagic());
      expect(decoder).not.toBeNull();
      expect(decoder!.formatName).toBe('jxl');
    });

    it('should return null for unknown data', () => {
      const registry = new DecoderRegistry();
      const buffer = new ArrayBuffer(16);
      expect(registry.getDecoder(buffer)).toBeNull();
    });
  });

  describe('registerDecoder', () => {
    it('should register a custom decoder', () => {
      const registry = new DecoderRegistry();
      const customDecoder: FormatDecoder = {
        formatName: 'custom',
        canDecode: (buffer: ArrayBuffer) => {
          if (buffer.byteLength < 4) return false;
          return new DataView(buffer).getUint32(0, false) === 0xdeadbeef;
        },
        decode: async () => ({
          width: 1,
          height: 1,
          data: new Float32Array(4),
          channels: 4,
          colorSpace: 'linear',
          metadata: {},
        }),
      };

      registry.registerDecoder(customDecoder);

      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, 0xdeadbeef, false);
      expect(registry.detectFormat(buffer)).toBe('custom');
    });

    it('should replace existing decoder with same name', () => {
      const registry = new DecoderRegistry();
      const replacementDecoder: FormatDecoder = {
        formatName: 'exr',
        canDecode: () => false, // Never matches
        decode: async () => ({
          width: 1,
          height: 1,
          data: new Float32Array(4),
          channels: 4,
          colorSpace: 'linear',
          metadata: {},
        }),
      };

      registry.registerDecoder(replacementDecoder);

      // EXR magic should no longer be detected since replacement never matches
      expect(registry.detectFormat(createEXRMagic())).not.toBe('exr');
    });
  });

  describe('detection order', () => {
    it('should check EXR before other formats', () => {
      const registry = new DecoderRegistry();
      // EXR magic is unique and should always be detected first
      const decoder = registry.getDecoder(createEXRMagic());
      expect(decoder!.formatName).toBe('exr');
    });

    it('should have all built-in decoders', () => {
      const registry = new DecoderRegistry();
      // Test each format is detectable
      expect(registry.getDecoder(createEXRMagic())?.formatName).toBe('exr');
      expect(registry.getDecoder(createDPXMagic())?.formatName).toBe('DPX');
      expect(registry.getDecoder(createCineonMagic())?.formatName).toBe('Cineon');
      expect(registry.getDecoder(createFloatTIFFMagic())?.formatName).toBe('TIFF');
      expect(registry.getDecoder(createNonFloatTIFFMagic())?.formatName).toBe('raw-preview');
      expect(registry.getDecoder(createHDRMagic())?.formatName).toBe('hdr');
      expect(registry.getDecoder(createJXLCodestreamMagic())?.formatName).toBe('jxl');
      // JPEG Gainmap, HEIC Gainmap, AVIF Gainmap require valid container buffers
      // which are complex to create, but are tested via their own test suites
    });
  });

  describe('detectAndDecode', () => {
    it('should return null for unknown format', async () => {
      const registry = new DecoderRegistry();
      const buffer = new ArrayBuffer(16);
      const result = await registry.detectAndDecode(buffer);
      expect(result).toBeNull();
    });

    it('should detect and decode HDR format end-to-end', async () => {
      const registry = new DecoderRegistry();
      const buffer = createHDRMagic();
      const result = await registry.detectAndDecode(buffer);
      expect(result).not.toBeNull();
      expect(result!.formatName).toBe('hdr');
      expect(result!.width).toBe(2);
      expect(result!.height).toBe(2);
      expect(result!.channels).toBe(4);
      expect(result!.colorSpace).toBe('linear');
      expect(result!.data).toBeInstanceOf(Float32Array);
    });

    it('should detect, decode, and include formatName in result', async () => {
      const registry = new DecoderRegistry();
      const customDecoder: FormatDecoder = {
        formatName: 'test-format',
        canDecode: (buffer: ArrayBuffer) => {
          if (buffer.byteLength < 4) return false;
          return new DataView(buffer).getUint32(0, false) === 0xcafebabe;
        },
        decode: async (_buffer: ArrayBuffer, options?: Record<string, unknown>) => ({
          width: 10,
          height: 20,
          data: new Float32Array(10 * 20 * 4),
          channels: 4,
          colorSpace: options?.colorSpace as string ?? 'linear',
          metadata: { custom: true },
        }),
      };

      registry.registerDecoder(customDecoder);

      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, 0xcafebabe, false);

      const result = await registry.detectAndDecode(buffer);
      expect(result).not.toBeNull();
      expect(result!.formatName).toBe('test-format');
      expect(result!.width).toBe(10);
      expect(result!.height).toBe(20);
      expect(result!.channels).toBe(4);
      expect(result!.colorSpace).toBe('linear');
      expect(result!.metadata).toEqual({ custom: true });
    });

    it('should pass options through to the matched decoder', async () => {
      const registry = new DecoderRegistry();
      const customDecoder: FormatDecoder = {
        formatName: 'opts-format',
        canDecode: (buffer: ArrayBuffer) => {
          if (buffer.byteLength < 4) return false;
          return new DataView(buffer).getUint32(0, false) === 0xf00dface;
        },
        decode: async (_buffer: ArrayBuffer, options?: Record<string, unknown>) => ({
          width: 1,
          height: 1,
          data: new Float32Array(4),
          channels: 4,
          colorSpace: (options?.applyLogToLinear as boolean) ? 'linear' : 'log',
          metadata: { receivedOptions: options ?? {} },
        }),
      };

      registry.registerDecoder(customDecoder);

      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, 0xf00dface, false);

      const result = await registry.detectAndDecode(buffer, { applyLogToLinear: true });
      expect(result).not.toBeNull();
      expect(result!.colorSpace).toBe('linear');

      const result2 = await registry.detectAndDecode(buffer, { applyLogToLinear: false });
      expect(result2).not.toBeNull();
      expect(result2!.colorSpace).toBe('log');
    });
  });

  describe('singleton', () => {
    it('should export a pre-populated singleton instance', () => {
      expect(decoderRegistry).toBeInstanceOf(DecoderRegistry);
      // Singleton should have all built-in decoders
      expect(decoderRegistry.detectFormat(createEXRMagic())).toBe('exr');
      expect(decoderRegistry.detectFormat(createDPXMagic())).toBe('DPX');
      expect(decoderRegistry.detectFormat(createCineonMagic())).toBe('Cineon');
      expect(decoderRegistry.detectFormat(createFloatTIFFMagic())).toBe('TIFF');
      expect(decoderRegistry.detectFormat(createHDRMagic())).toBe('hdr');
      expect(decoderRegistry.detectFormat(createJXLCodestreamMagic())).toBe('jxl');
    });

    it('should allow registering custom decoders on the singleton', () => {
      const customDecoder: FormatDecoder = {
        formatName: 'singleton-test',
        canDecode: (buffer: ArrayBuffer) => {
          if (buffer.byteLength < 4) return false;
          return new DataView(buffer).getUint32(0, false) === 0xabcd1234;
        },
        decode: async () => ({
          width: 1,
          height: 1,
          data: new Float32Array(4),
          channels: 4,
          colorSpace: 'linear',
          metadata: {},
        }),
      };

      decoderRegistry.registerDecoder(customDecoder);

      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, 0xabcd1234, false);
      expect(decoderRegistry.detectFormat(buffer)).toBe('singleton-test');

      // Clean up singleton state
      decoderRegistry.unregisterDecoder('singleton-test');
    });
  });

  describe('unregisterDecoder', () => {
    it('DREG-UNREG-001: removes decoder by format name', () => {
      const reg = new DecoderRegistry();
      const customDecoder: FormatDecoder = {
        formatName: 'unreg-test',
        canDecode: () => true,
        decode: async () => ({
          width: 1, height: 1, data: new Float32Array(4),
          channels: 4, colorSpace: 'linear', metadata: {},
        }),
      };
      reg.registerDecoder(customDecoder);
      expect(reg.detectFormat(new ArrayBuffer(4))).toBe('unreg-test');
      expect(reg.unregisterDecoder('unreg-test')).toBe(true);
      // After unregister, the first built-in decoder matches instead
      expect(reg.detectFormat(new ArrayBuffer(4))).not.toBe('unreg-test');
    });

    it('DREG-UNREG-002: returns false for unknown format name', () => {
      const reg = new DecoderRegistry();
      expect(reg.unregisterDecoder('nonexistent-format')).toBe(false);
    });
  });
});
