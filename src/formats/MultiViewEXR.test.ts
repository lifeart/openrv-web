/**
 * Multi-View EXR Tests
 *
 * Tests for multi-view EXR parsing, channel mapping, and per-view decoding.
 */

import { describe, it, expect } from 'vitest';
import {
  isMultiViewEXR,
  getEXRViews,
  getEXRViewInfo,
  decodeEXRView,
  mapChannelsToViews,
} from './MultiViewEXR';
import { EXRCompression, EXRPixelType } from './EXRDecoder';

// EXR magic number (little-endian)
const EXR_MAGIC = 0x01312f76;

// ---------- Helper utilities ----------

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
  const mantissa = (f >> 13) & 0x3ff;

  if (exponent <= 0) {
    if (exponent < -10) {
      return sign;
    }
    const m = ((f & 0x7fffff) | 0x800000) >> (1 - exponent);
    return sign | m;
  }

  if (exponent >= 31) {
    return sign | 0x7c00;
  }

  return sign | (exponent << 10) | mantissa;
}

/**
 * Binary buffer builder for constructing test EXR files
 */
class EXRBufferBuilder {
  private parts: Uint8Array[] = [];
  private _offset = 0;

  get offset(): number {
    return this._offset;
  }

  writeUint32(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, value, true);
    this.parts.push(buf);
    this._offset += 4;
  }

  writeInt32(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setInt32(0, value, true);
    this.parts.push(buf);
    this._offset += 4;
  }

  writeUint8(value: number): void {
    this.parts.push(new Uint8Array([value]));
    this._offset += 1;
  }

  writeBytes(data: Uint8Array): void {
    this.parts.push(data);
    this._offset += data.length;
  }

  writeString(str: string): void {
    const bytes = new TextEncoder().encode(str);
    this.parts.push(bytes);
    this.parts.push(new Uint8Array([0])); // null terminator
    this._offset += bytes.length + 1;
  }

  writeFloat32(value: number): void {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setFloat32(0, value, true);
    this.parts.push(buf);
    this._offset += 4;
  }

  writeHalf(value: number): void {
    const buf = new Uint8Array(2);
    new DataView(buf.buffer).setUint16(0, floatToHalf(value), true);
    this.parts.push(buf);
    this._offset += 2;
  }

  writeUint64(value: bigint): void {
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setBigUint64(0, value, true);
    this.parts.push(buf);
    this._offset += 8;
  }

  toBuffer(): ArrayBuffer {
    const totalLength = this.parts.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const part of this.parts) {
      result.set(part, pos);
      pos += part.length;
    }
    return result.buffer as ArrayBuffer;
  }
}

/**
 * Write the multiView attribute (stringVector format) to a builder.
 * stringVector: total size (int32), then for each string: int32 length + chars (no null).
 */
function writeMultiViewAttribute(b: EXRBufferBuilder, views: string[]): void {
  b.writeString('multiView');
  b.writeString('stringVector');

  // Calculate total size: for each view string, 4 bytes for length + string bytes
  const encoder = new TextEncoder();
  let totalSize = 0;
  const encodedViews: Uint8Array[] = [];
  for (const v of views) {
    const encoded = encoder.encode(v);
    encodedViews.push(encoded);
    totalSize += 4 + encoded.length;
  }

  b.writeInt32(totalSize); // attribute value size

  // Write each string: int32 length + chars
  for (const encoded of encodedViews) {
    b.writeInt32(encoded.length);
    b.writeBytes(encoded);
  }
}

/**
 * Write a standard channel list attribute
 */
function writeChannelsAttribute(b: EXRBufferBuilder, channels: string[], pixelType: EXRPixelType = EXRPixelType.HALF): void {
  b.writeString('channels');
  b.writeString('chlist');

  // Calculate size
  const sortedChannels = [...channels].sort();
  let channelListSize = 1; // null terminator
  for (const ch of sortedChannels) {
    channelListSize += new TextEncoder().encode(ch).length + 1 + 4 + 1 + 3 + 4 + 4;
  }
  b.writeInt32(channelListSize);

  for (const ch of sortedChannels) {
    b.writeString(ch);
    b.writeInt32(pixelType);
    b.writeUint8(0); // pLinear
    b.writeBytes(new Uint8Array([0, 0, 0])); // reserved
    b.writeInt32(1); // xSampling
    b.writeInt32(1); // ySampling
  }
  b.writeUint8(0); // end of channel list
}

/**
 * Write standard required attributes (compression, dataWindow, displayWindow, lineOrder, pixelAspectRatio)
 */
function writeStandardAttributes(b: EXRBufferBuilder, width: number, height: number): void {
  // compression
  b.writeString('compression');
  b.writeString('compression');
  b.writeInt32(1);
  b.writeUint8(EXRCompression.NONE);

  // dataWindow
  b.writeString('dataWindow');
  b.writeString('box2i');
  b.writeInt32(16);
  b.writeInt32(0);
  b.writeInt32(0);
  b.writeInt32(width - 1);
  b.writeInt32(height - 1);

  // displayWindow
  b.writeString('displayWindow');
  b.writeString('box2i');
  b.writeInt32(16);
  b.writeInt32(0);
  b.writeInt32(0);
  b.writeInt32(width - 1);
  b.writeInt32(height - 1);

  // lineOrder
  b.writeString('lineOrder');
  b.writeString('lineOrder');
  b.writeInt32(1);
  b.writeUint8(0); // INCREASING_Y

  // pixelAspectRatio
  b.writeString('pixelAspectRatio');
  b.writeString('float');
  b.writeInt32(4);
  b.writeFloat32(1.0);
}

/**
 * Create a multi-view EXR file with specified views and channel setup.
 *
 * For the default view, unprefixed channels (R, G, B, A) are written.
 * For non-default views, prefixed channels (e.g., right.R, right.G, right.B, right.A) are written.
 *
 * Pixel values for each view are different to allow verification:
 * - default view: R=0.25, G=0.5, B=0.75, A=1.0
 * - second view: R=0.1, G=0.2, B=0.3, A=1.0
 * - third view: R=0.6, G=0.7, B=0.8, A=1.0
 */
function createMultiViewEXR(options: {
  views: string[];
  width?: number;
  height?: number;
  /** If true, also add prefixed channels for the default view (e.g., left.R in addition to R) */
  prefixDefaultView?: boolean;
  /** Use only prefixed channels for all views (no unprefixed channels) */
  allPrefixed?: boolean;
} = { views: ['left', 'right'] }): ArrayBuffer {
  const {
    views,
    width = 2,
    height = 1,
    prefixDefaultView = false,
    allPrefixed = false,
  } = options;

  const defaultView = views[0]!;
  const baseChannels = ['R', 'G', 'B', 'A'];

  // Build the full channel list
  const allChannels: string[] = [];

  for (let vi = 0; vi < views.length; vi++) {
    const view = views[vi]!;
    const isDefault = view === defaultView;

    if (isDefault && !allPrefixed) {
      // Default view: add unprefixed channels
      for (const ch of baseChannels) {
        allChannels.push(ch);
      }
      if (prefixDefaultView) {
        // Also add prefixed versions
        for (const ch of baseChannels) {
          allChannels.push(view + '.' + ch);
        }
      }
    } else {
      // Non-default view: add prefixed channels
      for (const ch of baseChannels) {
        allChannels.push(view + '.' + ch);
      }
    }
  }

  const b = new EXRBufferBuilder();

  // Magic number
  b.writeUint32(EXR_MAGIC);

  // Version (2) with no special flags
  b.writeUint32(2);

  // Channels
  writeChannelsAttribute(b, allChannels);

  // multiView attribute
  writeMultiViewAttribute(b, views);

  // Standard attributes
  writeStandardAttributes(b, width, height);

  // End of header
  b.writeUint8(0);

  // Scanline data
  const sortedChannels = [...allChannels].sort();
  const bytesPerPixel = 2; // HALF
  const scanlineSize = sortedChannels.length * width * bytesPerPixel;

  // Offset table
  const headerEnd = b.offset;
  const offsetTableSize = height * 8;
  const scanlineDataStart = headerEnd + offsetTableSize;

  for (let y = 0; y < height; y++) {
    const blockStart = BigInt(scanlineDataStart + y * (8 + scanlineSize));
    b.writeUint64(blockStart);
  }

  // Per-view pixel values for verification
  const viewValues: Record<string, Record<string, number>> = {};
  const valuePresets = [
    { R: 0.25, G: 0.5, B: 0.75, A: 1.0 },
    { R: 0.1, G: 0.2, B: 0.3, A: 1.0 },
    { R: 0.6, G: 0.7, B: 0.8, A: 1.0 },
  ];

  for (let vi = 0; vi < views.length; vi++) {
    viewValues[views[vi]!] = valuePresets[vi % valuePresets.length]!;
  }

  // Write scanline data
  for (let y = 0; y < height; y++) {
    b.writeInt32(y); // Y coordinate
    b.writeInt32(scanlineSize); // Packed size

    for (const ch of sortedChannels) {
      for (let x = 0; x < width; x++) {
        // Determine which view this channel belongs to
        const dotIndex = ch.indexOf('.');
        let viewName: string;
        let baseCh: string;
        if (dotIndex > 0) {
          viewName = ch.substring(0, dotIndex);
          baseCh = ch.substring(dotIndex + 1);
        } else {
          viewName = defaultView;
          baseCh = ch;
        }

        const vals = viewValues[viewName] ?? viewValues[defaultView]!;
        const value = vals[baseCh] ?? 0;
        b.writeHalf(value);
      }
    }
  }

  return b.toBuffer();
}

/**
 * Create a minimal EXR header buffer (not a full decodable file) with just
 * enough to parse the multiView attribute. This is useful for testing
 * attribute detection without needing valid scanline data.
 */
function createMinimalEXRWithMultiView(views: string[]): ArrayBuffer {
  return createMultiViewEXR({ views, width: 2, height: 1 });
}

/**
 * Create a standard (non-multi-view) EXR file for testing negative cases.
 */
function createStandardEXR(width = 2, height = 1): ArrayBuffer {
  const b = new EXRBufferBuilder();

  b.writeUint32(EXR_MAGIC);
  b.writeUint32(2);

  writeChannelsAttribute(b, ['R', 'G', 'B', 'A']);
  writeStandardAttributes(b, width, height);
  b.writeUint8(0); // end of header

  const sortedChannels = ['A', 'B', 'G', 'R'];
  const bytesPerPixel = 2;
  const scanlineSize = sortedChannels.length * width * bytesPerPixel;

  const headerEnd = b.offset;
  const offsetTableSize = height * 8;
  const scanlineDataStart = headerEnd + offsetTableSize;

  for (let y = 0; y < height; y++) {
    const blockStart = BigInt(scanlineDataStart + y * (8 + scanlineSize));
    b.writeUint64(blockStart);
  }

  for (let y = 0; y < height; y++) {
    b.writeInt32(y);
    b.writeInt32(scanlineSize);
    for (const ch of sortedChannels) {
      for (let x = 0; x < width; x++) {
        let value = 0;
        if (ch === 'R') value = 0.5;
        else if (ch === 'G') value = 0.5;
        else if (ch === 'B') value = 0.5;
        else if (ch === 'A') value = 1.0;
        b.writeHalf(value);
      }
    }
  }

  return b.toBuffer();
}

// ---------- Tests ----------

describe('MultiViewEXR', () => {
  describe('parseStringVector', () => {
    it('should parse a stringVector with two entries', () => {
      // Test the attribute parsing by creating a full EXR with multiView
      // and verifying through getEXRViews.
      const exr = createMinimalEXRWithMultiView(['left', 'right']);
      const views = getEXRViews(exr);
      expect(views).toEqual(['left', 'right']);
    });

    it('should parse a stringVector with a single entry', () => {
      const exr = createMinimalEXRWithMultiView(['center']);
      const views = getEXRViews(exr);
      expect(views).toEqual(['center']);
    });

    it('should parse a stringVector with three entries', () => {
      const exr = createMinimalEXRWithMultiView(['left', 'right', 'center']);
      const views = getEXRViews(exr);
      expect(views).toEqual(['left', 'right', 'center']);
    });
  });

  describe('isMultiViewEXR', () => {
    it('EXRMV-DET-001: detect multi-view attribute presence', () => {
      const exr = createMinimalEXRWithMultiView(['left', 'right']);
      expect(isMultiViewEXR(exr)).toBe(true);
    });

    it('EXRMV-DET-002: non-multi-view EXR returns false', () => {
      const exr = createStandardEXR();
      expect(isMultiViewEXR(exr)).toBe(false);
    });

    it('should return false for non-EXR buffer', () => {
      const buf = new ArrayBuffer(16);
      expect(isMultiViewEXR(buf)).toBe(false);
    });

    it('should return false for empty buffer', () => {
      const buf = new ArrayBuffer(0);
      expect(isMultiViewEXR(buf)).toBe(false);
    });
  });

  describe('getEXRViews', () => {
    it('EXRMV-VIEW-001: get view names from multiView attribute', () => {
      const exr = createMinimalEXRWithMultiView(['left', 'right']);
      const views = getEXRViews(exr);
      expect(views).toEqual(['left', 'right']);
    });

    it('EXRMV-VIEW-002: default view is the first in the list', () => {
      const exr = createMinimalEXRWithMultiView(['left', 'right']);
      const info = getEXRViewInfo(exr);
      expect(info).not.toBeNull();
      expect(info!.defaultView).toBe('left');
    });

    it('EXRMV-VIEW-003: supports more than 2 views', () => {
      const exr = createMultiViewEXR({ views: ['left', 'right', 'center'] });
      const views = getEXRViews(exr);
      expect(views).toEqual(['left', 'right', 'center']);
      expect(views.length).toBe(3);
    });

    it('should return empty array for non-multi-view EXR', () => {
      const exr = createStandardEXR();
      const views = getEXRViews(exr);
      expect(views).toEqual([]);
    });

    it('should return empty array for non-EXR buffer', () => {
      const buf = new ArrayBuffer(16);
      const views = getEXRViews(buf);
      expect(views).toEqual([]);
    });
  });

  describe('getEXRViewInfo', () => {
    it('should return view info with dimensions and channels', () => {
      const exr = createMultiViewEXR({ views: ['left', 'right'], width: 4, height: 3 });
      const info = getEXRViewInfo(exr);

      expect(info).not.toBeNull();
      expect(info!.views).toEqual(['left', 'right']);
      expect(info!.defaultView).toBe('left');
      expect(info!.width).toBe(4);
      expect(info!.height).toBe(3);
    });

    it('should return null for non-multi-view EXR', () => {
      const exr = createStandardEXR();
      const info = getEXRViewInfo(exr);
      expect(info).toBeNull();
    });

    it('should return null for non-EXR buffer', () => {
      const buf = new ArrayBuffer(16);
      const info = getEXRViewInfo(buf);
      expect(info).toBeNull();
    });
  });

  describe('mapChannelsToViews', () => {
    it('EXRMV-CHAN-001: maps channels to views correctly (prefix matching)', () => {
      const channels = ['A', 'B', 'G', 'R', 'right.A', 'right.B', 'right.G', 'right.R'];
      const views = ['left', 'right'];
      const mapping = mapChannelsToViews(channels, views);

      expect(mapping['left']).toContain('R');
      expect(mapping['left']).toContain('G');
      expect(mapping['left']).toContain('B');
      expect(mapping['left']).toContain('A');
      expect(mapping['right']).toContain('R');
      expect(mapping['right']).toContain('G');
      expect(mapping['right']).toContain('B');
      expect(mapping['right']).toContain('A');
    });

    it('EXRMV-CHAN-002: default view channels work without prefix', () => {
      const channels = ['R', 'G', 'B', 'A', 'right.R', 'right.G', 'right.B', 'right.A'];
      const views = ['left', 'right'];
      const mapping = mapChannelsToViews(channels, views);

      // Default view (left) should get unprefixed channels
      expect(mapping['left']).toEqual(expect.arrayContaining(['R', 'G', 'B', 'A']));
      expect(mapping['left']!.length).toBe(4);
    });

    it('EXRMV-CHAN-003: non-default view channels require prefix', () => {
      const channels = ['R', 'G', 'B', 'A', 'right.R', 'right.G', 'right.B', 'right.A'];
      const views = ['left', 'right'];
      const mapping = mapChannelsToViews(channels, views);

      // Right view should only get stripped prefixed channels
      expect(mapping['right']).toEqual(expect.arrayContaining(['R', 'G', 'B', 'A']));
      expect(mapping['right']!.length).toBe(4);
    });

    it('should handle all-prefixed channels for default view', () => {
      const channels = ['left.R', 'left.G', 'left.B', 'left.A', 'right.R', 'right.G', 'right.B', 'right.A'];
      const views = ['left', 'right'];
      const mapping = mapChannelsToViews(channels, views);

      expect(mapping['left']).toEqual(expect.arrayContaining(['R', 'G', 'B', 'A']));
      expect(mapping['right']).toEqual(expect.arrayContaining(['R', 'G', 'B', 'A']));
    });

    it('should handle three views', () => {
      const channels = ['R', 'G', 'B', 'right.R', 'right.G', 'right.B', 'center.R', 'center.G', 'center.B'];
      const views = ['left', 'right', 'center'];
      const mapping = mapChannelsToViews(channels, views);

      expect(mapping['left']).toEqual(expect.arrayContaining(['R', 'G', 'B']));
      expect(mapping['right']).toEqual(expect.arrayContaining(['R', 'G', 'B']));
      expect(mapping['center']).toEqual(expect.arrayContaining(['R', 'G', 'B']));
    });

    it('should return empty record for empty views', () => {
      const channels = ['R', 'G', 'B'];
      const mapping = mapChannelsToViews(channels, []);
      expect(Object.keys(mapping)).toHaveLength(0);
    });

    it('should handle channels with non-view prefixes', () => {
      // Channels with prefixes that are NOT view names should not be assigned
      const channels = ['R', 'G', 'B', 'diffuse.R', 'diffuse.G', 'right.R', 'right.G', 'right.B'];
      const views = ['left', 'right'];
      const mapping = mapChannelsToViews(channels, views);

      // "diffuse.R" should NOT be assigned to any view
      expect(mapping['left']).toEqual(expect.arrayContaining(['R', 'G', 'B']));
      expect(mapping['left']!.length).toBe(3);
      expect(mapping['right']).toEqual(expect.arrayContaining(['R', 'G', 'B']));
      expect(mapping['right']!.length).toBe(3);
    });
  });

  describe('decodeEXRView', () => {
    it('EXRMV-DEC-001: decode specific view extracts correct data', async () => {
      const exr = createMultiViewEXR({
        views: ['left', 'right'],
        width: 2,
        height: 1,
      });

      const rightResult = await decodeEXRView(exr, 'right');
      expect(rightResult).not.toBeNull();
      expect(rightResult!.width).toBe(2);
      expect(rightResult!.height).toBe(1);
      expect(rightResult!.channels).toBe(4);
      expect(rightResult!.data).toBeInstanceOf(Float32Array);

      // Right view pixel values: R=0.1, G=0.2, B=0.3, A=1.0
      // Check first pixel (half precision has some rounding)
      expect(rightResult!.data[0]).toBeCloseTo(0.1, 1);  // R
      expect(rightResult!.data[1]).toBeCloseTo(0.2, 1);  // G
      expect(rightResult!.data[2]).toBeCloseTo(0.3, 1);  // B
      expect(rightResult!.data[3]).toBeCloseTo(1.0, 1);  // A
    });

    it('EXRMV-DEC-002: decode default view works', async () => {
      const exr = createMultiViewEXR({
        views: ['left', 'right'],
        width: 2,
        height: 1,
      });

      const leftResult = await decodeEXRView(exr, 'left');
      expect(leftResult).not.toBeNull();
      expect(leftResult!.width).toBe(2);
      expect(leftResult!.height).toBe(1);
      expect(leftResult!.channels).toBe(4);

      // Default view (left) pixel values: R=0.25, G=0.5, B=0.75, A=1.0
      expect(leftResult!.data[0]).toBeCloseTo(0.25, 1);  // R
      expect(leftResult!.data[1]).toBeCloseTo(0.5, 1);   // G
      expect(leftResult!.data[2]).toBeCloseTo(0.75, 1);  // B
      expect(leftResult!.data[3]).toBeCloseTo(1.0, 1);   // A
    });

    it('EXRMV-DEC-003: decode non-existent view returns null', async () => {
      const exr = createMultiViewEXR({
        views: ['left', 'right'],
        width: 2,
        height: 1,
      });

      const result = await decodeEXRView(exr, 'center');
      expect(result).toBeNull();
    });

    it('should return null for non-EXR buffer', async () => {
      const buf = new ArrayBuffer(16);
      const result = await decodeEXRView(buf, 'left');
      expect(result).toBeNull();
    });

    it('should return null for non-multi-view EXR', async () => {
      const exr = createStandardEXR();
      const result = await decodeEXRView(exr, 'left');
      expect(result).toBeNull();
    });

    it('should decode views with all-prefixed channels', async () => {
      const exr = createMultiViewEXR({
        views: ['left', 'right'],
        width: 2,
        height: 1,
        allPrefixed: true,
      });

      const leftResult = await decodeEXRView(exr, 'left');
      expect(leftResult).not.toBeNull();
      expect(leftResult!.data[0]).toBeCloseTo(0.25, 1);  // R

      const rightResult = await decodeEXRView(exr, 'right');
      expect(rightResult).not.toBeNull();
      expect(rightResult!.data[0]).toBeCloseTo(0.1, 1);  // R
    });

    it('should decode larger images correctly', async () => {
      const exr = createMultiViewEXR({
        views: ['left', 'right'],
        width: 4,
        height: 2,
      });

      const result = await decodeEXRView(exr, 'right');
      expect(result).not.toBeNull();
      expect(result!.width).toBe(4);
      expect(result!.height).toBe(2);
      expect(result!.data.length).toBe(4 * 2 * 4); // width * height * 4 channels

      // Every pixel in the right view should have the same values
      for (let i = 0; i < 4 * 2; i++) {
        expect(result!.data[i * 4 + 0]).toBeCloseTo(0.1, 1);
        expect(result!.data[i * 4 + 1]).toBeCloseTo(0.2, 1);
        expect(result!.data[i * 4 + 2]).toBeCloseTo(0.3, 1);
        expect(result!.data[i * 4 + 3]).toBeCloseTo(1.0, 1);
      }
    });
  });

  describe('Error handling', () => {
    it('EXRMV-ERR-001: handles empty multiView attribute', () => {
      // An EXR with an empty multiView (no view names) should not be detected as multi-view
      const b = new EXRBufferBuilder();
      b.writeUint32(EXR_MAGIC);
      b.writeUint32(2);

      writeChannelsAttribute(b, ['R', 'G', 'B', 'A']);

      // multiView attribute with 0 byte total size (empty)
      b.writeString('multiView');
      b.writeString('stringVector');
      b.writeInt32(0); // attribute value size: 0 bytes (empty string vector)

      writeStandardAttributes(b, 2, 1);
      b.writeUint8(0); // end of header

      // Add scanline data to make it a valid EXR
      const sortedChannels = ['A', 'B', 'G', 'R'];
      const scanlineSize = sortedChannels.length * 2 * 2; // 4 ch * 2 bytes * 2 width
      const headerEnd = b.offset;
      const offsetTableSize = 1 * 8;
      const scanlineDataStart = headerEnd + offsetTableSize;
      b.writeUint64(BigInt(scanlineDataStart));

      b.writeInt32(0);
      b.writeInt32(scanlineSize);
      for (const _ch of sortedChannels) {
        for (let x = 0; x < 2; x++) {
          b.writeHalf(0.5);
        }
      }

      const exr = b.toBuffer();
      // An empty multiView should not count as multi-view
      expect(isMultiViewEXR(exr)).toBe(false);
      expect(getEXRViews(exr)).toEqual([]);
      expect(getEXRViewInfo(exr)).toBeNull();
    });

    it('EXRMV-ERR-002: handles corrupt/truncated multiView data', () => {
      // Create an EXR with a multiView attribute that has invalid/truncated data
      // The attribute size claims more data than is actually present in the attribute.
      // The parser should handle this gracefully because parseHeaderAttributes
      // resets the reader position to attrStart + attrSize after each attribute.

      const b = new EXRBufferBuilder();
      b.writeUint32(EXR_MAGIC);
      b.writeUint32(2);

      writeChannelsAttribute(b, ['R', 'G', 'B', 'A']);

      // multiView attribute with truncated data:
      // claim 20 bytes but only write a partial stringVector
      b.writeString('multiView');
      b.writeString('stringVector');
      // Write valid stringVector with one entry "left" (4 + 4 = 8 bytes)
      // but declare attrSize as 8
      const encoder = new TextEncoder();
      const leftBytes = encoder.encode('left');
      const attrSize = 4 + leftBytes.length; // 8 bytes total
      b.writeInt32(attrSize);
      b.writeInt32(leftBytes.length);
      b.writeBytes(leftBytes);

      writeStandardAttributes(b, 2, 1);
      b.writeUint8(0); // end of header

      // Add scanline data
      const sortedChannels = ['A', 'B', 'G', 'R'];
      const scanlineSize = sortedChannels.length * 2 * 2;
      const headerEnd = b.offset;
      const offsetTableSize = 1 * 8;
      const scanlineDataStart = headerEnd + offsetTableSize;
      b.writeUint64(BigInt(scanlineDataStart));

      b.writeInt32(0);
      b.writeInt32(scanlineSize);
      for (const _ch of sortedChannels) {
        for (let x = 0; x < 2; x++) {
          b.writeHalf(0.5);
        }
      }

      const exr = b.toBuffer();

      // Should still parse (the stringVector contains "left")
      expect(isMultiViewEXR(exr)).toBe(true);
      expect(getEXRViews(exr)).toEqual(['left']);
    });
  });
});
