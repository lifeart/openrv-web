/**
 * Issue #503 regression tests: Verify dual-path decode behavior
 *
 * The file-formats guide previously claimed all image decoding yields Float32Array
 * RGBA data, but standard browser-native image loads stay as HTMLImageElement.
 * These tests validate the actual behavior and the corrected documentation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileSourceNode } from './FileSourceNode';
import { IPImage } from '../../core/image/Image';
import { EXRCompression, EXRPixelType } from '../../formats/EXRDecoder';
// @ts-ignore -- Node modules available in test environment
import { readFileSync } from 'fs';
// @ts-ignore -- Node modules available in test environment
import { resolve } from 'path';

// --- Helpers ---

/**
 * Create a minimal valid EXR buffer (same helper as FileSourceNode.test.ts)
 */
function createTestEXR(width = 2, height = 2): ArrayBuffer {
  const channels = ['R', 'G', 'B', 'A'];
  const pixelType = EXRPixelType.HALF;
  const compression = EXRCompression.NONE;

  const parts: Uint8Array[] = [];
  let offset = 0;

  function writeUint32(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, value, true);
    parts.push(buf);
    offset += 4;
  }
  function writeInt32(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setInt32(0, value, true);
    parts.push(buf);
    offset += 4;
  }
  function writeUint8(value: number): void {
    parts.push(new Uint8Array([value]));
    offset += 1;
  }
  function writeString(str: string): void {
    const bytes = new TextEncoder().encode(str);
    parts.push(bytes);
    parts.push(new Uint8Array([0]));
    offset += bytes.length + 1;
  }
  function writeFloat32(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setFloat32(0, value, true);
    parts.push(buf);
    offset += 4;
  }
  function writeUint64(value: bigint): void {
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigUint64(0, value, true);
    parts.push(buf);
    offset += 8;
  }
  function floatToHalf(value: number): number {
    const fv = new Float32Array(1);
    const iv = new Int32Array(fv.buffer);
    fv[0] = value;
    const f = iv[0]!;
    const sign = (f >> 16) & 0x8000;
    const exp = ((f >> 23) & 0xff) - 127 + 15;
    let man = (f >> 13) & 0x3ff;
    if (exp <= 0) {
      if (exp < -10) return sign;
      man = ((f & 0x7fffff) | 0x800000) >> (1 - exp);
      return sign | man;
    }
    if (exp >= 31) return sign | 0x7c00;
    return sign | (exp << 10) | man;
  }
  function writeHalf(value: number): void {
    const buf = new Uint8Array(2);
    new DataView(buf.buffer).setUint16(0, floatToHalf(value), true);
    parts.push(buf);
    offset += 2;
  }

  // Magic
  writeUint32(0x01312f76);
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

  writeUint8(0); // end of header

  const bytesPerPixel = pixelType === EXRPixelType.HALF ? 2 : 4;
  const scanlineSize = channels.length * width * bytesPerPixel;
  const headerEnd = offset;
  const offsetTableSize = height * 8;
  const scanlineDataStart = headerEnd + offsetTableSize;

  for (let y = 0; y < height; y++) {
    writeUint64(BigInt(scanlineDataStart + y * (8 + scanlineSize)));
  }

  for (let y = 0; y < height; y++) {
    writeInt32(y);
    writeInt32(scanlineSize);
    for (const ch of sortedChannels) {
      for (let x = 0; x < width; x++) {
        let value = 0;
        if (ch === 'R') value = (x + y * width) / (width * height);
        else if (ch === 'G') value = 0.5;
        else if (ch === 'B') value = 1.0 - (x + y * width) / (width * height);
        else if (ch === 'A') value = 1.0;
        writeHalf(value);
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

// --- Tests ---

describe('Issue #503: Dual-path decode behavior', () => {
  let node: FileSourceNode;

  beforeEach(() => {
    node = new FileSourceNode('TestFileSource');
  });

  afterEach(() => {
    node.dispose();
  });

  describe('browser-native formats store HTMLImageElement (not IPImage)', () => {
    it('PNG load stores HTMLImageElement and sets cachedIPImage to null', async () => {
      const loadPromise = node.load('test-image.png', 'photo.png');
      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 200 });
      await loadPromise;

      // getElement returns HTMLImageElement for browser-native formats
      const element = node.getElement(1);
      expect(element).toBeInstanceOf(HTMLImageElement);

      // getIPImage returns null -- no Float32Array conversion
      const ipImage = node.getIPImage();
      expect(ipImage).toBeNull();

      // isHDR is false for browser-native formats
      expect(node.isHDR()).toBe(false);
      expect(node.properties.getValue('isHDR')).toBe(false);
    });

    it('WebP load stores HTMLImageElement and sets cachedIPImage to null', async () => {
      const loadPromise = node.load('test-image.webp', 'photo.webp');
      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 200 });
      await loadPromise;

      expect(node.getElement(1)).toBeInstanceOf(HTMLImageElement);
      expect(node.getIPImage()).toBeNull();
      expect(node.isHDR()).toBe(false);
    });

    it('GIF load stores HTMLImageElement and sets cachedIPImage to null', async () => {
      const loadPromise = node.load('test-image.gif', 'photo.gif');
      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 200 });
      await loadPromise;

      expect(node.getElement(1)).toBeInstanceOf(HTMLImageElement);
      expect(node.getIPImage()).toBeNull();
      expect(node.isHDR()).toBe(false);
    });

    it('BMP load stores HTMLImageElement and sets cachedIPImage to null', async () => {
      const loadPromise = node.load('test-image.bmp', 'photo.bmp');
      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 200 });
      await loadPromise;

      expect(node.getElement(1)).toBeInstanceOf(HTMLImageElement);
      expect(node.getIPImage()).toBeNull();
      expect(node.isHDR()).toBe(false);
    });

    it('SVG load stores HTMLImageElement and sets cachedIPImage to null', async () => {
      const loadPromise = node.load('test-image.svg', 'icon.svg');
      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 200 });
      await loadPromise;

      expect(node.getElement(1)).toBeInstanceOf(HTMLImageElement);
      expect(node.getIPImage()).toBeNull();
      expect(node.isHDR()).toBe(false);
    });

    it('JPEG load (non-gainmap) stores HTMLImageElement after fetch + gainmap check fallback', async () => {
      // JPEG exercises a different code path than PNG/WebP:
      // fetch the file -> check for gainmap MPF marker -> not found ->
      // create blob URL from fetched data -> load via <img> element
      const loadPromise = node.load('test-image.jpg', 'photo.jpg');
      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 200 });
      await loadPromise;

      // Should still end up as HTMLImageElement after the gainmap check fallback
      const element = node.getElement(1);
      expect(element).toBeInstanceOf(HTMLImageElement);

      // No Float32Array conversion -- cachedIPImage is null
      const ipImage = node.getIPImage();
      expect(ipImage).toBeNull();

      // isHDR is false for standard JPEG
      expect(node.isHDR()).toBe(false);
      expect(node.properties.getValue('isHDR')).toBe(false);
    });
  });

  describe('decoder-backed formats store IPImage with Float32Array', () => {
    it('EXR load stores IPImage with Float32Array data and no HTMLImageElement', async () => {
      const exrBuffer = createTestEXR(2, 2);

      // Use the public loadFromEXR method (avoids fetch in jsdom)
      await node.loadFromEXR(exrBuffer, 'test.exr', 'blob:test.exr');

      // IPImage should be set with float32 data
      const ipImage = node.getIPImage();
      expect(ipImage).toBeInstanceOf(IPImage);
      expect(ipImage!.dataType).toBe('float32');
      expect(ipImage!.data).toBeInstanceOf(ArrayBuffer);
      expect(ipImage!.getTypedArray()).toBeInstanceOf(Float32Array);
      expect(ipImage!.width).toBe(2);
      expect(ipImage!.height).toBe(2);

      // HTMLImageElement should be null for EXR
      const element = node.getElement(1);
      expect(element).toBeNull();

      // isHDR is true for decoder-backed HDR formats
      expect(node.isHDR()).toBe(true);
      expect(node.properties.getValue('isHDR')).toBe(true);
    });

    it('EXR data is RGBA Float32Array with 4 channels', async () => {
      const w = 4;
      const h = 3;
      const exrBuffer = createTestEXR(w, h);

      await node.loadFromEXR(exrBuffer, 'test.exr', 'blob:test.exr');

      const ipImage = node.getIPImage();
      expect(ipImage).not.toBeNull();
      expect(ipImage!.dataType).toBe('float32');
      const typedArray = ipImage!.getTypedArray();
      expect(typedArray).toBeInstanceOf(Float32Array);
      expect(typedArray.length).toBe(w * h * 4); // RGBA
      expect(ipImage!.channels).toBe(4);
    });
  });

  describe('the dual-path behavior is mutually exclusive', () => {
    it('loading a browser-native format after an EXR clears IPImage', async () => {
      // First load EXR via the public buffer API
      const exrBuffer = createTestEXR(2, 2);
      await node.loadFromEXR(exrBuffer, 'test.exr', 'blob:test.exr');
      expect(node.getIPImage()).toBeInstanceOf(IPImage);
      expect(node.isHDR()).toBe(true);

      // Then load PNG -- should clear IPImage and set HTMLImageElement
      const loadPromise = node.load('test.png', 'photo.png');
      await vi.waitFor(() => expect(node.getElement(1)).not.toBeNull(), { timeout: 200 });
      await loadPromise;

      expect(node.getElement(1)).toBeInstanceOf(HTMLImageElement);
      expect(node.getIPImage()).toBeNull();
      expect(node.isHDR()).toBe(false);
    });
  });

  describe('documentation accuracy', () => {
    // @ts-ignore -- __dirname available in test environment
    const docsPath = resolve(__dirname, '../../../docs/guides/file-formats.md');

    it('file-formats.md describes the dual-path architecture', () => {
      const content = readFileSync(docsPath, 'utf-8');

      // The overview should mention dual-path architecture
      expect(content).toContain('dual-path');

      // Should mention Float32Array for decoder-backed formats
      expect(content).toContain('Float32Array');
      expect(content).toContain('IPImage');

      // Should mention HTMLImageElement for browser-native formats
      expect(content).toContain('HTMLImageElement');

      // Should NOT contain the old incorrect claim that ALL decoding produces Float32Array
      expect(content).not.toContain(
        'All image decoding produces **Float32Array** pixel data in RGBA layout',
      );
    });

    it('file-formats.md lists decoder-backed formats correctly', () => {
      const content = readFileSync(docsPath, 'utf-8');

      // The decoder-backed formats line should mention key HDR formats
      expect(content).toContain('EXR');
      expect(content).toContain('DPX');
      expect(content).toContain('Cineon');
      expect(content).toContain('Float TIFF');
      expect(content).toContain('Radiance HDR');
      expect(content).toContain('JPEG Gainmap HDR');
    });

    it('file-formats.md lists browser-native formats correctly', () => {
      const content = readFileSync(docsPath, 'utf-8');

      // The browser-native section should list standard formats
      expect(content).toContain('PNG');
      expect(content).toContain('JPEG');
      expect(content).toContain('WebP');
      expect(content).toContain('GIF');
      expect(content).toContain('BMP');
    });
  });
});
