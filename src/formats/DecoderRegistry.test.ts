/**
 * DecoderRegistry Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { DecoderRegistry, type FormatDecoder } from './DecoderRegistry';

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
      expect(registry.detectFormat(createDPXMagic(true))).toBe('dpx');
    });

    it('should detect DPX format (little-endian)', () => {
      const registry = new DecoderRegistry();
      expect(registry.detectFormat(createDPXMagic(false))).toBe('dpx');
    });

    it('should detect Cineon format', () => {
      const registry = new DecoderRegistry();
      expect(registry.detectFormat(createCineonMagic())).toBe('cineon');
    });

    it('should detect float TIFF format', () => {
      const registry = new DecoderRegistry();
      expect(registry.detectFormat(createFloatTIFFMagic())).toBe('tiff');
    });

    it('should not detect non-float TIFF as float TIFF', () => {
      const registry = new DecoderRegistry();
      // Non-float TIFF should not be detected by our TIFF decoder
      // (which only handles float TIFFs)
      expect(registry.detectFormat(createNonFloatTIFFMagic())).toBeNull();
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
      expect(decoder!.formatName).toBe('dpx');
    });

    it('should return Cineon decoder for Cineon data', () => {
      const registry = new DecoderRegistry();
      const decoder = registry.getDecoder(createCineonMagic());
      expect(decoder).not.toBeNull();
      expect(decoder!.formatName).toBe('cineon');
    });

    it('should return TIFF decoder for float TIFF data', () => {
      const registry = new DecoderRegistry();
      const decoder = registry.getDecoder(createFloatTIFFMagic());
      expect(decoder).not.toBeNull();
      expect(decoder!.formatName).toBe('tiff');
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

    it('should have all four built-in decoders', () => {
      const registry = new DecoderRegistry();
      // Test each format is detectable
      expect(registry.getDecoder(createEXRMagic())?.formatName).toBe('exr');
      expect(registry.getDecoder(createDPXMagic())?.formatName).toBe('dpx');
      expect(registry.getDecoder(createCineonMagic())?.formatName).toBe('cineon');
      expect(registry.getDecoder(createFloatTIFFMagic())?.formatName).toBe('tiff');
    });
  });
});
