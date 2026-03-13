/**
 * AVIF Decoder Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { isAvifFile } from './avif';
import { DecoderRegistry, decoderRegistry } from './DecoderRegistry';

/**
 * Create a minimal AVIF ftyp box with the given major brand.
 * ISOBMFF ftyp structure: size(4) + 'ftyp'(4) + brand(4) + version(4)
 */
function createAVIFMagic(brand = 'avif'): ArrayBuffer {
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  // Box size
  view.setUint32(0, 16, false);
  // Box type: 'ftyp'
  view.setUint8(4, 0x66); // 'f'
  view.setUint8(5, 0x74); // 't'
  view.setUint8(6, 0x79); // 'y'
  view.setUint8(7, 0x70); // 'p'
  // Major brand
  for (let i = 0; i < 4; i++) {
    view.setUint8(8 + i, brand.charCodeAt(i));
  }
  // Minor version
  view.setUint32(12, 0, false);
  return buffer;
}

// Utility helpers for building ISOBMFF test buffers
function uint32BE(value: number): number[] {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function strBytes(str: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < str.length; i++) result.push(str.charCodeAt(i));
  return result;
}

/**
 * Build a minimal AVIF buffer with an ISOBMFF meta box containing an auxC
 * gainmap property (urn:com:photo:aux:hdrgainmap) in ipco.
 * Structure: ftyp + meta(iprp/ipco/auxC)
 */
function createGainmapAVIFBuffer(brand = 'avif'): ArrayBuffer {
  const parts: number[] = [];

  // --- ftyp box (16 bytes) ---
  parts.push(...uint32BE(16));
  parts.push(...strBytes('ftyp'));
  parts.push(...strBytes(brand));
  parts.push(...uint32BE(0));

  // --- Build ipco content with auxC gainmap box ---
  const urn = 'urn:com:photo:aux:hdrgainmap';
  const auxCSize = 4 + 4 + 4 + urn.length + 1; // size + type + ver+flags + urn + null
  const ipcoContent: number[] = [];
  ipcoContent.push(...uint32BE(auxCSize));
  ipcoContent.push(...strBytes('auxC'));
  ipcoContent.push(0, 0, 0, 0); // version=0, flags=0
  for (let i = 0; i < urn.length; i++) ipcoContent.push(urn.charCodeAt(i));
  ipcoContent.push(0); // null terminator

  const ipcoSize = 8 + ipcoContent.length;

  // --- iprp box containing ipco ---
  const iprpSize = 8 + ipcoSize;
  const iprp: number[] = [];
  iprp.push(...uint32BE(iprpSize));
  iprp.push(...strBytes('iprp'));
  iprp.push(...uint32BE(ipcoSize));
  iprp.push(...strBytes('ipco'));
  iprp.push(...ipcoContent);

  // --- meta box (FullBox) containing iprp ---
  const metaContentSize = iprp.length;
  const metaSize = 12 + metaContentSize; // 12 = size(4) + type(4) + ver+flags(4)
  parts.push(...uint32BE(metaSize));
  parts.push(...strBytes('meta'));
  parts.push(0, 0, 0, 0); // version + flags
  parts.push(...iprp);

  // Convert to ArrayBuffer
  const buf = new ArrayBuffer(parts.length);
  const uint8 = new Uint8Array(buf);
  for (let i = 0; i < parts.length; i++) {
    uint8[i] = parts[i]!;
  }
  return buf;
}

describe('isAvifFile', () => {
  it('should detect AVIF file with avif brand', () => {
    expect(isAvifFile(createAVIFMagic('avif'))).toBe(true);
  });

  it('should detect AVIF file with avis brand', () => {
    expect(isAvifFile(createAVIFMagic('avis'))).toBe(true);
  });

  it('should detect AVIF file with mif1 brand', () => {
    expect(isAvifFile(createAVIFMagic('mif1'))).toBe(true);
  });

  it('should reject non-AVIF brand', () => {
    expect(isAvifFile(createAVIFMagic('heic'))).toBe(false);
  });

  it('should reject empty buffer', () => {
    expect(isAvifFile(new ArrayBuffer(0))).toBe(false);
  });

  it('should reject buffer too small', () => {
    expect(isAvifFile(new ArrayBuffer(8))).toBe(false);
  });

  it('should reject buffer without ftyp box', () => {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    view.setUint32(0, 16, false);
    // Not 'ftyp' - use 'mdat' instead
    view.setUint8(4, 0x6d); // 'm'
    view.setUint8(5, 0x64); // 'd'
    view.setUint8(6, 0x61); // 'a'
    view.setUint8(7, 0x74); // 't'
    expect(isAvifFile(buffer)).toBe(false);
  });

  it('should reject gainmap AVIF with avif brand', () => {
    const buffer = createGainmapAVIFBuffer('avif');
    expect(isAvifFile(buffer)).toBe(false);
  });

  it('should reject gainmap AVIF with avis brand', () => {
    const buffer = createGainmapAVIFBuffer('avis');
    expect(isAvifFile(buffer)).toBe(false);
  });

  it('should reject gainmap AVIF with mif1 brand', () => {
    const buffer = createGainmapAVIFBuffer('mif1');
    expect(isAvifFile(buffer)).toBe(false);
  });
});

describe('AVIF decoder registration in DecoderRegistry', () => {
  it('should detect plain AVIF format via DecoderRegistry', () => {
    const registry = new DecoderRegistry();
    const buffer = createAVIFMagic('avif');
    // Plain AVIF without gainmap should be detected as 'avif'
    // (avif-gainmap requires auxC gainmap box which is not present)
    expect(registry.detectFormat(buffer)).toBe('avif');
  });

  it('should return avif decoder for plain AVIF data', () => {
    const registry = new DecoderRegistry();
    const buffer = createAVIFMagic('avif');
    const decoder = registry.getDecoder(buffer);
    expect(decoder).not.toBeNull();
    expect(decoder!.formatName).toBe('avif');
  });

  it('should detect AVIF with avis brand via registry', () => {
    const registry = new DecoderRegistry();
    const buffer = createAVIFMagic('avis');
    expect(registry.detectFormat(buffer)).toBe('avif');
  });

  it('should detect AVIF with mif1 brand via registry', () => {
    const registry = new DecoderRegistry();
    const buffer = createAVIFMagic('mif1');
    expect(registry.detectFormat(buffer)).toBe('avif');
  });

  it('should be available on the singleton decoderRegistry', () => {
    const buffer = createAVIFMagic('avif');
    expect(decoderRegistry.detectFormat(buffer)).toBe('avif');
  });
});
