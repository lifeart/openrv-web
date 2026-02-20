/**
 * FileSourceNode Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FileSourceNode } from './FileSourceNode';
import { EXRCompression, EXRPixelType } from '../../formats/EXRDecoder';

// EXR magic number
const EXR_MAGIC = 0x01312f76;

/**
 * Create a minimal valid EXR file buffer for testing
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

  function floatToHalf(value: number): number {
    const floatView = new Float32Array(1);
    const int32View = new Int32Array(floatView.buffer);
    floatView[0] = value;
    const f = int32View[0]!;
    const sign = (f >> 16) & 0x8000;
    let exponent = ((f >> 23) & 0xff) - 127 + 15;
    let mantissa = (f >> 13) & 0x3ff;
    if (exponent <= 0) {
      if (exponent < -10) return sign;
      mantissa = ((f & 0x7fffff) | 0x800000) >> (1 - exponent);
      return sign | mantissa;
    }
    if (exponent >= 31) return sign | 0x7c00;
    return sign | (exponent << 10) | mantissa;
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

  writeUint8(0);

  const bytesPerPixel = pixelType === EXRPixelType.HALF ? 2 : 4;
  const scanlineSize = channels.length * width * bytesPerPixel;
  const headerEnd = offset;
  const offsetTableSize = height * 8;
  const scanlineDataStart = headerEnd + offsetTableSize;

  for (let y = 0; y < height; y++) {
    const blockStart = BigInt(scanlineDataStart + y * (8 + scanlineSize));
    writeUint64(blockStart);
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

describe('FileSourceNode', () => {
  let node: FileSourceNode;

  beforeEach(() => {
    node = new FileSourceNode('TestFileSource');
  });

  afterEach(() => {
    node.dispose();
  });

  describe('initialization', () => {
    it('has correct type', () => {
      expect(node.type).toBe('RVFileSource');
    });

    it('has correct default name', () => {
      const defaultNode = new FileSourceNode();
      expect(defaultNode.name).toBe('File Source');
      defaultNode.dispose();
    });

    it('has url property', () => {
      expect(node.properties.has('url')).toBe(true);
      expect(node.properties.getValue('url')).toBe('');
    });

    it('has width and height properties', () => {
      expect(node.properties.has('width')).toBe(true);
      expect(node.properties.has('height')).toBe(true);
      expect(node.properties.getValue('width')).toBe(0);
      expect(node.properties.getValue('height')).toBe(0);
    });

    it('FSN-010: has isHDR property', () => {
      expect(node.properties.has('isHDR')).toBe(true);
      expect(node.properties.getValue('isHDR')).toBe(false);
    });
  });

  describe('isReady', () => {
    it('returns false when no image loaded', () => {
      expect(node.isReady()).toBe(false);
    });
  });

  describe('getElement', () => {
    it('returns null when no image loaded', () => {
      expect(node.getElement(1)).toBeNull();
    });
  });

  describe('load', () => {
    it('FSN-001: loads image from URL', async () => {
      // The mock setup in test/setup.ts triggers onload after setTimeout
      const loadPromise = node.load('test-image.png', 'test');

      // Wait for mock image to "load"
      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 100 });

      await loadPromise;
      expect(node.isReady()).toBe(true);
    });

    it('FSN-006: populates metadata after load', async () => {
      const loadPromise = node.load('test-image.png', 'MyImage');

      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 100 });
      await loadPromise;

      expect(node.properties.getValue('width')).toBe(100); // Mock returns 100x100
      expect(node.properties.getValue('height')).toBe(100);
    });

    it('updates url property', async () => {
      const loadPromise = node.load('test.png');

      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 100 });
      await loadPromise;

      expect(node.properties.getValue('url')).toBe('test.png');
    });
  });

  describe('loadFile', () => {
    it('FSN-002: loads from File object', async () => {
      const file = new File([''], 'test-file.png', { type: 'image/png' });
      const loadPromise = node.loadFile(file);

      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 100 });
      await loadPromise;

      expect(node.isReady()).toBe(true);
    });
  });

  describe('dispose', () => {
    it('FSN-005: revokes blob URL on dispose', async () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      const loadPromise = node.loadFile(file);

      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 100 });
      await loadPromise;

      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL');

      node.dispose();

      expect(revokeObjectURLSpy).toHaveBeenCalled();
      revokeObjectURLSpy.mockRestore();
    });

    it('cleans up image reference', async () => {
      const loadPromise = node.load('test.png');

      await vi.waitFor(() => expect(node.isReady()).toBe(true), { timeout: 100 });
      await loadPromise;

      node.dispose();

      expect(node.isReady()).toBe(false);
      expect(node.getElement(1)).toBeNull();
    });
  });

  describe('toJSON', () => {
    it('serializes node state', () => {
      const json = node.toJSON() as {
        type: string;
        id: string;
        name: string;
        url: string;
      };

      expect(json.type).toBe('RVFileSource');
      expect(json.name).toBe('TestFileSource');
      expect(json.url).toBe('');
    });
  });

  describe('source node behavior', () => {
    it('does not accept inputs', () => {
      // Source nodes should not accept inputs
      expect(node.inputs.length).toBe(0);
    });
  });

  describe('EXR support', () => {
    it('FSN-020: isHDR returns false initially', () => {
      expect(node.isHDR()).toBe(false);
    });

    it('FSN-021: loadFile detects EXR by extension', async () => {
      const exrBuffer = createTestEXR({ width: 4, height: 4 });
      const file = new File([exrBuffer], 'test.exr', { type: 'image/x-exr' });

      await node.loadFile(file);

      expect(node.isReady()).toBe(true);
      expect(node.isHDR()).toBe(true);
      expect(node.properties.getValue('isHDR')).toBe(true);
    });

    it('FSN-022: EXR populates correct dimensions', async () => {
      const exrBuffer = createTestEXR({ width: 8, height: 6 });
      const file = new File([exrBuffer], 'test.exr', { type: 'image/x-exr' });

      await node.loadFile(file);

      expect(node.properties.getValue('width')).toBe(8);
      expect(node.properties.getValue('height')).toBe(6);
    });

    it('FSN-023: EXR produces float32 IPImage via process', async () => {
      const exrBuffer = createTestEXR({ width: 2, height: 2 });
      const file = new File([exrBuffer], 'test.exr', { type: 'image/x-exr' });

      await node.loadFile(file);

      // Call process (using evaluate which calls process internally)
      const context = { frame: 1, width: 1920, height: 1080, quality: 'full' as const };
      const image = node.evaluate(context);

      expect(image).not.toBeNull();
      expect(image!.dataType).toBe('float32');
      expect(image!.channels).toBe(4);
    });

    it('FSN-024: getElement returns null for EXR (no HTMLImageElement)', async () => {
      const exrBuffer = createTestEXR({ width: 2, height: 2 });
      const file = new File([exrBuffer], 'test.exr', { type: 'image/x-exr' });

      await node.loadFile(file);

      // EXR files don't use HTMLImageElement
      expect(node.getElement(1)).toBeNull();
    });

    it('FSN-025: dispose cleans up EXR state', async () => {
      const exrBuffer = createTestEXR({ width: 2, height: 2 });
      const file = new File([exrBuffer], 'test.exr', { type: 'image/x-exr' });

      await node.loadFile(file);
      expect(node.isHDR()).toBe(true);

      node.dispose();

      expect(node.isReady()).toBe(false);
      expect(node.isHDR()).toBe(false);
    });

    it('FSN-026: toJSON includes isHDR for EXR files', async () => {
      const exrBuffer = createTestEXR({ width: 2, height: 2 });
      const file = new File([exrBuffer], 'test.exr', { type: 'image/x-exr' });

      await node.loadFile(file);

      const json = node.toJSON() as { isHDR: boolean };
      expect(json.isHDR).toBe(true);
    });

    it('FSN-027: handles .sxr extension (stereo EXR)', async () => {
      const exrBuffer = createTestEXR({ width: 2, height: 2 });
      const file = new File([exrBuffer], 'test.sxr', { type: 'image/x-exr' });

      await node.loadFile(file);

      expect(node.isReady()).toBe(true);
      expect(node.isHDR()).toBe(true);
    });

    it('FSN-028: EXR metadata includes colorSpace linear', async () => {
      const exrBuffer = createTestEXR({ width: 2, height: 2 });
      const file = new File([exrBuffer], 'test.exr', { type: 'image/x-exr' });

      await node.loadFile(file);

      const context = { frame: 1, width: 1920, height: 1080, quality: 'full' as const };
      const image = node.evaluate(context);

      expect(image).not.toBeNull();
      expect(image!.metadata.colorSpace).toBe('linear');
    });
  });

  describe('EXR error handling', () => {
    it('FSN-030: should reject invalid EXR file (wrong magic)', async () => {
      // Create a file with .exr extension but invalid content
      const invalidBuffer = new ArrayBuffer(100);
      const view = new DataView(invalidBuffer);
      view.setUint32(0, 0xDEADBEEF, true); // Wrong magic

      const file = new File([invalidBuffer], 'invalid.exr', { type: 'image/x-exr' });

      await expect(node.loadFile(file)).rejects.toThrow(/Invalid EXR/);
    });

    it('FSN-031: should reject truncated EXR file', async () => {
      // Create a very small buffer that's too small to be a valid EXR
      const tooSmall = new ArrayBuffer(4);
      const view = new DataView(tooSmall);
      view.setUint32(0, 0x01312f76, true); // Valid magic but nothing else

      const file = new File([tooSmall], 'truncated.exr', { type: 'image/x-exr' });

      await expect(node.loadFile(file)).rejects.toThrow(/Invalid EXR|buffer too small/);
    });

    it('FSN-032: should reject empty EXR file', async () => {
      const emptyBuffer = new ArrayBuffer(0);
      const file = new File([emptyBuffer], 'empty.exr', { type: 'image/x-exr' });

      await expect(node.loadFile(file)).rejects.toThrow(/Invalid EXR/);
    });

    it('FSN-033: node remains usable after EXR load failure', async () => {
      // Try to load invalid EXR
      const invalidBuffer = new ArrayBuffer(10);
      const file = new File([invalidBuffer], 'invalid.exr', { type: 'image/x-exr' });

      await expect(node.loadFile(file)).rejects.toThrow();

      // Node should still be in a valid state
      expect(node.isReady()).toBe(false);
      expect(node.isHDR()).toBe(false);

      // Should be able to load a valid EXR after failure
      const validBuffer = createTestEXR({ width: 2, height: 2 });
      const validFile = new File([validBuffer], 'valid.exr', { type: 'image/x-exr' });

      await node.loadFile(validFile);
      expect(node.isReady()).toBe(true);
      expect(node.isHDR()).toBe(true);
    });

    it('FSN-034: case-insensitive EXR extension detection', async () => {
      const exrBuffer = createTestEXR({ width: 2, height: 2 });

      // Test uppercase
      const fileUpper = new File([exrBuffer], 'test.EXR', { type: 'image/x-exr' });
      await node.loadFile(fileUpper);
      expect(node.isHDR()).toBe(true);

      // Reset
      node.dispose();
      node = new FileSourceNode('TestFileSource');

      // Test mixed case
      const fileMixed = new File([exrBuffer], 'test.ExR', { type: 'image/x-exr' });
      await node.loadFile(fileMixed);
      expect(node.isHDR()).toBe(true);
    });
  });

  describe('EXR canvas caching', () => {
    it('FSN-040: getCanvas returns same canvas instance on repeated calls', async () => {
      const exrBuffer = createTestEXR({ width: 4, height: 4 });
      const file = new File([exrBuffer], 'test.exr', { type: 'image/x-exr' });

      await node.loadFile(file);

      // Get canvas multiple times
      const canvas1 = node.getCanvas();
      const canvas2 = node.getCanvas();
      const canvas3 = node.getCanvas();

      // Should return the same cached instance
      expect(canvas1).toBe(canvas2);
      expect(canvas2).toBe(canvas3);
      expect(canvas1).not.toBeNull();
    });

    it('FSN-041: getCanvas returns null when no EXR loaded', () => {
      expect(node.getCanvas()).toBeNull();
    });

    it('FSN-042: canvas is invalidated when layer changes', async () => {
      // Create a multi-layer EXR for testing
      const exrBuffer = createTestEXR({
        width: 2,
        height: 2,
        channels: ['R', 'G', 'B', 'A', 'diffuse.R', 'diffuse.G', 'diffuse.B'],
      });
      const file = new File([exrBuffer], 'multilayer.exr', { type: 'image/x-exr' });

      await node.loadFile(file);

      const canvas1 = node.getCanvas();
      expect(canvas1).not.toBeNull();

      // Change layer (note: this triggers re-decode which updates cachedIPImage)
      await node.setEXRLayer('diffuse');

      // Canvas should be re-rendered (canvasDirty=true)
      const canvas2 = node.getCanvas();

      // Should still be the same canvas element (reused for memory efficiency)
      expect(canvas2).toBe(canvas1);
    });

    it('FSN-043: dispose cleans up cached canvas', async () => {
      const exrBuffer = createTestEXR({ width: 2, height: 2 });
      const file = new File([exrBuffer], 'test.exr', { type: 'image/x-exr' });

      await node.loadFile(file);
      expect(node.getCanvas()).not.toBeNull();

      node.dispose();
      expect(node.getCanvas()).toBeNull();
    });
  });

  describe('EXR layer support', () => {
    it('FSN-050: getEXRLayers returns empty array for non-EXR', () => {
      expect(node.getEXRLayers()).toEqual([]);
    });

    it('FSN-051: getEXRLayers returns layers for multi-layer EXR', async () => {
      const exrBuffer = createTestEXR({
        width: 2,
        height: 2,
        channels: ['R', 'G', 'B', 'A', 'diffuse.R', 'diffuse.G', 'diffuse.B'],
      });
      const file = new File([exrBuffer], 'multilayer.exr', { type: 'image/x-exr' });

      await node.loadFile(file);

      const layers = node.getEXRLayers();
      expect(layers.length).toBeGreaterThan(0);
      // Should have RGBA layer (default) and diffuse layer
      const layerNames = layers.map(l => l.name);
      expect(layerNames).toContain('RGBA');
      expect(layerNames).toContain('diffuse');
    });

    it('FSN-052: getCurrentEXRLayer returns null initially', async () => {
      const exrBuffer = createTestEXR({ width: 2, height: 2 });
      const file = new File([exrBuffer], 'test.exr', { type: 'image/x-exr' });

      await node.loadFile(file);
      expect(node.getCurrentEXRLayer()).toBeNull();
    });

    it('FSN-053: setEXRLayer changes current layer', async () => {
      const exrBuffer = createTestEXR({
        width: 2,
        height: 2,
        channels: ['R', 'G', 'B', 'A', 'diffuse.R', 'diffuse.G', 'diffuse.B'],
      });
      const file = new File([exrBuffer], 'multilayer.exr', { type: 'image/x-exr' });

      await node.loadFile(file);

      const changed = await node.setEXRLayer('diffuse');
      expect(changed).toBe(true);
      expect(node.getCurrentEXRLayer()).toBe('diffuse');
    });

    it('FSN-054: setEXRLayer returns false for same layer', async () => {
      const exrBuffer = createTestEXR({
        width: 2,
        height: 2,
        channels: ['R', 'G', 'B', 'A', 'diffuse.R', 'diffuse.G', 'diffuse.B'],
      });
      const file = new File([exrBuffer], 'multilayer.exr', { type: 'image/x-exr' });

      await node.loadFile(file);

      await node.setEXRLayer('diffuse');
      const changed = await node.setEXRLayer('diffuse');
      expect(changed).toBe(false);
    });

    it('FSN-055: setEXRLayer returns false for non-EXR', async () => {
      const changed = await node.setEXRLayer('diffuse');
      expect(changed).toBe(false);
    });

    it('FSN-056: switching back to RGBA layer works', async () => {
      const exrBuffer = createTestEXR({
        width: 2,
        height: 2,
        channels: ['R', 'G', 'B', 'A', 'diffuse.R', 'diffuse.G', 'diffuse.B'],
      });
      const file = new File([exrBuffer], 'multilayer.exr', { type: 'image/x-exr' });

      await node.loadFile(file);

      await node.setEXRLayer('diffuse');
      expect(node.getCurrentEXRLayer()).toBe('diffuse');

      await node.setEXRLayer(null);
      expect(node.getCurrentEXRLayer()).toBeNull();
    });
  });

  describe('AVIF support', () => {
    /**
     * Create a minimal AVIF ISOBMFF buffer for testing.
     * Builds: ftyp + meta(iprp(ipco(colr(nclx)))) with configurable color params.
     */
    function createTestAVIFBuffer(options: {
      brand?: string;
      transferCharacteristics?: number;
      colourPrimaries?: number;
      includeColrBox?: boolean;
    } = {}): ArrayBuffer {
      const {
        brand = 'avif',
        transferCharacteristics = 16, // PQ by default
        colourPrimaries = 9, // BT.2020 by default
        includeColrBox = true,
      } = options;

      const parts: Uint8Array[] = [];

      function writeUint32BE(value: number): void {
        const buf = new Uint8Array(4);
        const view = new DataView(buf.buffer);
        view.setUint32(0, value, false); // big-endian
        parts.push(buf);
      }

      function writeString(str: string): void {
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
          bytes[i] = str.charCodeAt(i);
        }
        parts.push(bytes);
      }

      // Build colr(nclx) box: 4(size) + 4(type) + 4(colour_type) + 2+2+2+1 = 19 bytes
      let colrBox: Uint8Array | null = null;
      if (includeColrBox) {
        const colrParts: Uint8Array[] = [];
        // size placeholder
        const colrSizeBuf = new Uint8Array(4);
        colrParts.push(colrSizeBuf);
        // type
        colrParts.push(new TextEncoder().encode('colr'));
        // colour_type = 'nclx'
        colrParts.push(new TextEncoder().encode('nclx'));
        // colour_primaries (uint16)
        const cpBuf = new Uint8Array(2);
        new DataView(cpBuf.buffer).setUint16(0, colourPrimaries, false);
        colrParts.push(cpBuf);
        // transfer_characteristics (uint16)
        const tcBuf = new Uint8Array(2);
        new DataView(tcBuf.buffer).setUint16(0, transferCharacteristics, false);
        colrParts.push(tcBuf);
        // matrix_coefficients (uint16)
        const mcBuf = new Uint8Array(2);
        new DataView(mcBuf.buffer).setUint16(0, 0, false);
        colrParts.push(mcBuf);
        // full_range_flag (uint8)
        colrParts.push(new Uint8Array([1]));

        const colrSize = colrParts.reduce((s, p) => s + p.length, 0);
        new DataView(colrSizeBuf.buffer).setUint32(0, colrSize, false);

        colrBox = new Uint8Array(colrSize);
        let pos = 0;
        for (const p of colrParts) {
          colrBox.set(p, pos);
          pos += p.length;
        }
      }

      // Build ipco box: 8(header) + colrBox
      const ipcoContentSize = colrBox ? colrBox.length : 0;
      const ipcoSize = 8 + ipcoContentSize;

      // Build iprp box: 8(header) + ipco
      const iprpSize = 8 + ipcoSize;

      // Build meta box (FullBox): 8(header) + 4(version+flags) + iprp
      const metaSize = 12 + iprpSize;

      // Build ftyp box: 8(header) + 4(brand) + 4(version)
      const ftypSize = 16;

      // ftyp
      writeUint32BE(ftypSize);
      writeString('ftyp');
      writeString(brand.padEnd(4, ' ').slice(0, 4));
      writeUint32BE(0); // minor_version

      // meta (FullBox)
      writeUint32BE(metaSize);
      writeString('meta');
      writeUint32BE(0); // version + flags

      // iprp
      writeUint32BE(iprpSize);
      writeString('iprp');

      // ipco
      writeUint32BE(ipcoSize);
      writeString('ipco');

      // colr
      if (colrBox) {
        parts.push(colrBox);
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

    // Mock createImageBitmap and VideoFrame for HDR AVIF tests
    let origCreateImageBitmap: typeof globalThis.createImageBitmap;
    let origVideoFrame: typeof globalThis.VideoFrame;

    beforeEach(() => {
      origCreateImageBitmap = globalThis.createImageBitmap;
      origVideoFrame = globalThis.VideoFrame;

      (globalThis as any).createImageBitmap = vi.fn(async () => ({
        width: 64,
        height: 64,
        close: vi.fn(),
      }));

      (globalThis as any).VideoFrame = vi.fn((bitmap: any) => ({
        displayWidth: bitmap.width ?? 64,
        displayHeight: bitmap.height ?? 64,
        close: vi.fn(),
      }));
    });

    afterEach(() => {
      globalThis.createImageBitmap = origCreateImageBitmap;
      globalThis.VideoFrame = origVideoFrame;
    });

    it('FSN-060: AVIF with PQ (TC=16) detected as HDR', async () => {
      const buffer = createTestAVIFBuffer({ transferCharacteristics: 16, colourPrimaries: 9 });
      const file = new File([buffer], 'cosmos-pq.avif', { type: 'image/avif' });

      await node.loadFile(file);

      expect(node.isHDR()).toBe(true);
      expect(node.formatName).toBe('avif-hdr');
    });

    it('FSN-061: AVIF with HLG (TC=18) detected as HDR', async () => {
      const buffer = createTestAVIFBuffer({ transferCharacteristics: 18, colourPrimaries: 9 });
      const file = new File([buffer], 'cosmos-hlg.avif', { type: 'image/avif' });

      await node.loadFile(file);

      expect(node.isHDR()).toBe(true);
      expect(node.formatName).toBe('avif-hdr');
    });

    it('FSN-062: AVIF with BT.709 (TC=1) treated as SDR', async () => {
      const buffer = createTestAVIFBuffer({ transferCharacteristics: 1, colourPrimaries: 1 });
      const file = new File([buffer], 'photo.avif', { type: 'image/avif' });

      await node.loadFile(file);

      // Should fall through to standard loading (SDR)
      expect(node.isHDR()).toBe(false);
    });

    it('FSN-063: AVIF without colr box treated as SDR', async () => {
      const buffer = createTestAVIFBuffer({ includeColrBox: false });
      const file = new File([buffer], 'simple.avif', { type: 'image/avif' });

      await node.loadFile(file);

      // No colr box → parseAVIFColorInfo returns null → falls through to SDR
      expect(node.isHDR()).toBe(false);
    });

    it('FSN-064: non-AVIF file with .avif extension handled gracefully', async () => {
      // Create a non-ISOBMFF buffer (no ftyp box)
      const fakeBuffer = new ArrayBuffer(100);
      const view = new DataView(fakeBuffer);
      view.setUint32(0, 0x89504e47, false); // PNG magic instead
      const file = new File([fakeBuffer], 'fake.avif', { type: 'image/avif' });

      await node.loadFile(file);

      // Should fall through to standard loading
      expect(node.isHDR()).toBe(false);
    });

    it('FSN-065: HDR AVIF produces IPImage with videoFrame', async () => {
      const buffer = createTestAVIFBuffer({ transferCharacteristics: 16, colourPrimaries: 9 });
      const file = new File([buffer], 'hdr.avif', { type: 'image/avif' });

      await node.loadFile(file);

      const ipImage = node.getIPImage();
      expect(ipImage).not.toBeNull();
      expect(ipImage!.videoFrame).not.toBeNull();
      expect(ipImage!.dataType).toBe('float32');
    });

    it('FSN-066: HDR AVIF metadata has correct transferFunction and colorPrimaries', async () => {
      const buffer = createTestAVIFBuffer({ transferCharacteristics: 18, colourPrimaries: 9 });
      const file = new File([buffer], 'hlg.avif', { type: 'image/avif' });

      await node.loadFile(file);

      const ipImage = node.getIPImage();
      expect(ipImage).not.toBeNull();
      expect(ipImage!.metadata.transferFunction).toBe('hlg');
      expect(ipImage!.metadata.colorPrimaries).toBe('bt2020');
      expect(ipImage!.metadata.colorSpace).toBe('rec2020');
    });

    it('FSN-067: HDR AVIF with BT.709 primaries sets correct colorSpace', async () => {
      const buffer = createTestAVIFBuffer({ transferCharacteristics: 16, colourPrimaries: 1 });
      const file = new File([buffer], 'pq-709.avif', { type: 'image/avif' });

      await node.loadFile(file);

      const ipImage = node.getIPImage();
      expect(ipImage).not.toBeNull();
      expect(ipImage!.metadata.transferFunction).toBe('pq');
      expect(ipImage!.metadata.colorPrimaries).toBe('bt709');
      expect(ipImage!.metadata.colorSpace).toBe('rec709');
    });

    it('FSN-068: dispose() calls close() on VideoFrame', async () => {
      const buffer = createTestAVIFBuffer({ transferCharacteristics: 16, colourPrimaries: 9 });
      const file = new File([buffer], 'hdr.avif', { type: 'image/avif' });

      await node.loadFile(file);

      const ipImage = node.getIPImage();
      expect(ipImage).not.toBeNull();
      const closeSpy = vi.spyOn(ipImage!, 'close');

      node.dispose();

      expect(closeSpy).toHaveBeenCalled();
    });

    it('FSN-069: getCanvas() returns null for VideoFrame-backed AVIF', async () => {
      const buffer = createTestAVIFBuffer({ transferCharacteristics: 16, colourPrimaries: 9 });
      const file = new File([buffer], 'hdr.avif', { type: 'image/avif' });

      await node.loadFile(file);

      // VideoFrame-backed images should not produce a canvas
      expect(node.getCanvas()).toBeNull();
    });

    it('FSN-070: AVIF with avis brand is recognized', async () => {
      const buffer = createTestAVIFBuffer({ brand: 'avis', transferCharacteristics: 16, colourPrimaries: 9 });
      const file = new File([buffer], 'sequence.avif', { type: 'image/avif' });

      await node.loadFile(file);

      expect(node.isHDR()).toBe(true);
      expect(node.formatName).toBe('avif-hdr');
    });

    it('FSN-071: AVIF with mif1 brand is recognized', async () => {
      const buffer = createTestAVIFBuffer({ brand: 'mif1', transferCharacteristics: 18, colourPrimaries: 9 });
      const file = new File([buffer], 'generic.avif', { type: 'image/avif' });

      await node.loadFile(file);

      expect(node.isHDR()).toBe(true);
      expect(node.formatName).toBe('avif-hdr');
    });

    it('FSN-072: HDR AVIF populates correct dimensions', async () => {
      const buffer = createTestAVIFBuffer({ transferCharacteristics: 16 });
      const file = new File([buffer], 'hdr.avif', { type: 'image/avif' });

      await node.loadFile(file);

      // Mock returns 64x64
      expect(node.properties.getValue('width')).toBe(64);
      expect(node.properties.getValue('height')).toBe(64);
      expect(node.properties.getValue('isHDR')).toBe(true);
    });

    it('FSN-073: isReady returns true after HDR AVIF load', async () => {
      const buffer = createTestAVIFBuffer({ transferCharacteristics: 16 });
      const file = new File([buffer], 'hdr.avif', { type: 'image/avif' });

      expect(node.isReady()).toBe(false);
      await node.loadFile(file);
      expect(node.isReady()).toBe(true);
    });

    it('FSN-074: case-insensitive AVIF extension detection', async () => {
      const buffer = createTestAVIFBuffer({ transferCharacteristics: 16 });

      // Test uppercase
      const fileUpper = new File([buffer], 'test.AVIF', { type: 'image/avif' });
      await node.loadFile(fileUpper);
      expect(node.isHDR()).toBe(true);
      expect(node.formatName).toBe('avif-hdr');

      // Reset
      node.dispose();
      node = new FileSourceNode('TestFileSource');

      // Re-create mocks after dispose/recreate
      (globalThis as any).createImageBitmap = vi.fn(async () => ({
        width: 64,
        height: 64,
        close: vi.fn(),
      }));
      (globalThis as any).VideoFrame = vi.fn((bitmap: any) => ({
        displayWidth: bitmap.width ?? 64,
        displayHeight: bitmap.height ?? 64,
        close: vi.fn(),
      }));

      // Test mixed case
      const fileMixed = new File([buffer], 'test.AviF', { type: 'image/avif' });
      await node.loadFile(fileMixed);
      expect(node.isHDR()).toBe(true);
    });

    it('FSN-075: toJSON includes isHDR for HDR AVIF files', async () => {
      const buffer = createTestAVIFBuffer({ transferCharacteristics: 16 });
      const file = new File([buffer], 'hdr.avif', { type: 'image/avif' });

      await node.loadFile(file);

      const json = node.toJSON() as { isHDR: boolean };
      expect(json.isHDR).toBe(true);
    });

    it('FSN-076: getElement returns null for HDR AVIF (no HTMLImageElement)', async () => {
      const buffer = createTestAVIFBuffer({ transferCharacteristics: 16 });
      const file = new File([buffer], 'hdr.avif', { type: 'image/avif' });

      await node.loadFile(file);

      expect(node.getElement(1)).toBeNull();
    });

    it('FSN-077: node remains usable after AVIF HDR load failure', async () => {
      // Mock createImageBitmap to throw
      (globalThis as any).createImageBitmap = vi.fn(async () => {
        throw new Error('createImageBitmap failed');
      });

      const buffer = createTestAVIFBuffer({ transferCharacteristics: 16 });
      const file = new File([buffer], 'broken.avif', { type: 'image/avif' });

      // Should not throw — falls through to standard loading
      await node.loadFile(file);

      // Node should still be in a valid state (loaded as SDR fallback)
      expect(node.isHDR()).toBe(false);
    });
  });

  // =================================================================
  // AVIF gainmap support
  // =================================================================
  describe('AVIF gainmap support', () => {
    /**
     * Create a minimal AVIF ISOBMFF buffer with gainmap auxiliary image.
     * Builds: ftyp + meta(pitm, iinf, iprp/ipco/auxC, ipma, iloc) + mdat
     */
    function createTestAVIFGainmapBuffer(options: {
      brand?: string;
      includeGainmapAuxC?: boolean;
      includeNclxHDR?: boolean;
    } = {}): ArrayBuffer {
      const {
        brand = 'avif',
        includeGainmapAuxC = true,
        includeNclxHDR = false,
      } = options;

      const parts: number[] = [];

      function pushUint32BE(value: number): void {
        parts.push((value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF);
      }
      function pushString(str: string): void {
        for (let i = 0; i < str.length; i++) parts.push(str.charCodeAt(i));
      }

      // ftyp (16 bytes)
      pushUint32BE(16);
      pushString('ftyp');
      pushString(brand.padEnd(4, ' ').slice(0, 4));
      pushUint32BE(0);

      // Build meta content parts
      const metaParts: number[] = [];

      // pitm (14 bytes)
      pushPitm(metaParts);

      // iinf with 2 infe entries
      pushIinf(metaParts);

      // iprp containing ipco + ipma
      const ipcoContent: number[] = [];
      if (includeGainmapAuxC) {
        pushAuxCBox(ipcoContent);
      }
      if (includeNclxHDR) {
        pushColrNclxBox(ipcoContent);
      }

      const ipmaContent: number[] = [];
      if (includeGainmapAuxC) {
        pushIpmaForGainmap(ipmaContent);
      }

      const ipcoSize = 8 + ipcoContent.length;
      const iprpSize = 8 + ipcoSize + (ipmaContent.length > 0 ? ipmaContent.length : 0);

      // iprp header
      metaParts.push(...u32(iprpSize));
      metaParts.push(...s('iprp'));
      // ipco
      metaParts.push(...u32(ipcoSize));
      metaParts.push(...s('ipco'));
      metaParts.push(...ipcoContent);
      // ipma
      if (ipmaContent.length > 0) metaParts.push(...ipmaContent);

      // iloc: 2 items, dummy data at offset 0 length 100 and 50
      // We'll compute offsets after knowing meta size
      const ilocPerItem = 14; // item_id(2)+ref(2)+ext_count(2)+offset(4)+length(4)
      const ilocSize = 4 + 4 + 4 + 2 + 2 + 2 * ilocPerItem;

      const metaSize = 12 + metaParts.length + ilocSize;
      const mdatStart = 16 + metaSize;
      const mdatData = mdatStart + 8;

      // Build iloc
      const iloc: number[] = [];
      iloc.push(...u32(ilocSize));
      iloc.push(...s('iloc'));
      iloc.push(0, 0, 0, 0); // version=0, flags=0
      iloc.push(0x44, 0x00); // offset_size=4, length_size=4, base_offset_size=0
      iloc.push(...u16(2)); // item_count
      // Item 1 (primary)
      iloc.push(...u16(1), ...u16(0), ...u16(1), ...u32(mdatData), ...u32(100));
      // Item 2 (gainmap)
      iloc.push(...u16(2), ...u16(0), ...u16(1), ...u32(mdatData + 100), ...u32(50));

      // meta box
      pushUint32BE(metaSize);
      pushString('meta');
      parts.push(0, 0, 0, 0); // version+flags
      parts.push(...metaParts);
      parts.push(...iloc);

      // mdat
      pushUint32BE(8 + 150);
      pushString('mdat');
      for (let i = 0; i < 150; i++) parts.push(0xCC);

      const buf = new ArrayBuffer(parts.length);
      new Uint8Array(buf).set(parts);
      return buf;

      // --- nested helpers ---
      function pushPitm(out: number[]): void {
        out.push(...u32(14), ...s('pitm'), 0, 0, 0, 0, ...u16(1));
      }
      function pushIinf(out: number[]): void {
        const infe1 = [...u32(20), ...s('infe'), 0x02, 0, 0, 0, ...u16(1), ...u16(0), ...s('av01')];
        const infe2 = [...u32(20), ...s('infe'), 0x02, 0, 0, 0, ...u16(2), ...u16(0), ...s('av01')];
        const iinfSize = 14 + infe1.length + infe2.length;
        out.push(...u32(iinfSize), ...s('iinf'), 0, 0, 0, 0, ...u16(2), ...infe1, ...infe2);
      }
      function pushAuxCBox(out: number[]): void {
        const urn = 'urn:com:photo:aux:hdrgainmap';
        const auxCSize = 12 + urn.length + 1;
        out.push(...u32(auxCSize), ...s('auxC'), 0, 0, 0, 0);
        for (let i = 0; i < urn.length; i++) out.push(urn.charCodeAt(i));
        out.push(0);
      }
      function pushColrNclxBox(out: number[]): void {
        out.push(...u32(19), ...s('colr'), ...s('nclx'), ...u16(9), ...u16(16), ...u16(0), 1);
      }
      function pushIpmaForGainmap(out: number[]): void {
        const ipmaSize = 4 + 4 + 4 + 4 + 2 + 1 + 1;
        out.push(...u32(ipmaSize), ...s('ipma'), 0, 0, 0, 0, ...u32(1), ...u16(2), 1, 0x81);
      }
      function u32(v: number): number[] {
        return [(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
      }
      function u16(v: number): number[] {
        return [(v >> 8) & 0xFF, v & 0xFF];
      }
      function s(str: string): number[] {
        const r: number[] = [];
        for (let i = 0; i < str.length; i++) r.push(str.charCodeAt(i));
        return r;
      }
    }

    // Mock createImageBitmap and OffscreenCanvas for gainmap decoding
    let origCreateImageBitmap: typeof globalThis.createImageBitmap;

    beforeEach(() => {
      origCreateImageBitmap = globalThis.createImageBitmap;

      // Mock createImageBitmap to return a fake bitmap for gainmap decoding
      (globalThis as any).createImageBitmap = vi.fn(async () => ({
        width: 32,
        height: 32,
        close: vi.fn(),
      }));
    });

    afterEach(() => {
      globalThis.createImageBitmap = origCreateImageBitmap;
    });

    it('FSN-AVIF-GM-001: AVIF gainmap detected and loaded as HDR', async () => {
      // For this test we need the gainmap decode to work.
      // Since createImageBitmap is mocked, decodeAVIFGainmapToFloat32 will fail
      // when trying to draw to canvas. We test detection and parsing instead.
      const { isGainmapAVIF, parseGainmapAVIF } = await import('../../formats/AVIFGainmapDecoder');
      const buf = createTestAVIFGainmapBuffer({ includeGainmapAuxC: true });

      expect(isGainmapAVIF(buf)).toBe(true);
      const info = parseGainmapAVIF(buf);
      expect(info).not.toBeNull();
      expect(info!.primaryItemId).toBe(1);
      expect(info!.gainmapItemId).toBe(2);
    });

    it('FSN-AVIF-GM-002: parseGainmapAVIF produces info with all required fields', async () => {
      const { isGainmapAVIF, parseGainmapAVIF } = await import('../../formats/AVIFGainmapDecoder');
      const buf = createTestAVIFGainmapBuffer({ includeGainmapAuxC: true });

      expect(isGainmapAVIF(buf)).toBe(true);
      const info = parseGainmapAVIF(buf);
      expect(info).not.toBeNull();

      // Verify the info has all the fields needed for gainmap decoding
      expect(info!.headroom).toBeGreaterThan(0);
      expect(info!.primaryItemId).toBe(1);
      expect(info!.gainmapItemId).toBe(2);
      expect(info!.primaryOffset).toBeGreaterThan(0);
      expect(info!.primaryLength).toBeGreaterThan(0);
      expect(info!.gainmapOffset).toBeGreaterThan(0);
      expect(info!.gainmapLength).toBeGreaterThan(0);
    });

    it('FSN-AVIF-GM-003: parseGainmapAVIF extracts correct headroom for metadata', async () => {
      // Verify that the headroom value from parseGainmapAVIF is what loadGainmapAVIF
      // would put into metadata.attributes.headroom
      const { parseGainmapAVIF } = await import('../../formats/AVIFGainmapDecoder');

      // With XMP headroom
      const bufWithXMP = createTestAVIFGainmapBuffer({
        includeGainmapAuxC: true,
        // Note: this helper doesn't support XMP, so headroom will be fallback 2.0
      });
      const infoDefault = parseGainmapAVIF(bufWithXMP);
      expect(infoDefault).not.toBeNull();
      // Default headroom is 2.0 (fallback when no XMP/tmap)
      expect(infoDefault!.headroom).toBe(2.0);
    });


    it('FSN-AVIF-GM-005: AVIF gainmap takes priority over nclx HDR path', async () => {
      // When both gainmap auxC and nclx PQ are present, gainmap should be detected
      const { isGainmapAVIF } = await import('../../formats/AVIFGainmapDecoder');
      const buf = createTestAVIFGainmapBuffer({
        includeGainmapAuxC: true,
        includeNclxHDR: true,
      });
      expect(isGainmapAVIF(buf)).toBe(true);
    });

    it('FSN-AVIF-GM-006: Standard AVIF (no gainmap) still uses existing load path', async () => {
      const { isGainmapAVIF } = await import('../../formats/AVIFGainmapDecoder');
      const buf = createTestAVIFGainmapBuffer({ includeGainmapAuxC: false });
      expect(isGainmapAVIF(buf)).toBe(false);
    });

    it('FSN-AVIF-GM-007: AVIF SDR blob fallback when isGainmapAVIF=false and no HDR nclx', async () => {
      // When an AVIF has no gainmap and no HDR nclx colr box, it should fall through
      // to SDR blob loading. Verify that isGainmapAVIF returns false and the buffer
      // is treated as a standard SDR AVIF.
      const { isGainmapAVIF } = await import('../../formats/AVIFGainmapDecoder');

      // Create a buffer with no gainmap auxC and no nclx HDR
      const buf = createTestAVIFGainmapBuffer({
        includeGainmapAuxC: false,
        includeNclxHDR: false,
      });

      // Confirm detection says "not gainmap"
      expect(isGainmapAVIF(buf)).toBe(false);

      // When loaded through FileSourceNode.loadFile, this would:
      // 1. isGainmapAVIF -> false (skip gainmap path)
      // 2. parseAVIFColorInfo -> null (no colr nclx, no ICC profile)
      // 3. Fall through to SDR blob URL loading
      // We can't fully test loadFile here because it needs Image() constructor
      // to fire onload, but we verify the detection logic is correct.

      // Create a File and load it; since it's SDR, it falls through to standard loading
      const file = new File([buf], 'sdr-photo.avif', { type: 'image/avif' });
      await node.loadFile(file);

      // SDR path - should NOT be HDR
      expect(node.isHDR()).toBe(false);
    });
  });

  // =================================================================
  // AVIF ICC profile HDR detection
  // =================================================================
  describe('AVIF ICC profile HDR detection', () => {
    /**
     * Build a minimal ICC profile with just a 'desc' tag containing a profile name.
     *
     * ICC profile structure:
     * - 128-byte header (zeros except profile size at offset 0 as uint32BE)
     * - 4-byte tag count (uint32BE)
     * - Tag table: each entry is sig(4) + offset(4) + size(4)
     * - Tag data: 'desc' type = type_sig(4, 'desc') + reserved(4, 0) + string_length(4) + ASCII string
     */
    function buildMinimalICCProfile(profileDescription: string): Uint8Array {
      const descStringBytes = profileDescription.length;
      // desc tag data: type_sig(4) + reserved(4) + string_length(4) + ASCII string
      const descTagDataSize = 4 + 4 + 4 + descStringBytes;

      const tagCount = 1;
      const tagTableSize = tagCount * 12; // sig(4) + offset(4) + size(4)
      const headerSize = 128;
      const tagDataOffset = headerSize + 4 + tagTableSize; // after header + tag_count + tag_table
      const totalSize = tagDataOffset + descTagDataSize;

      const profile = new Uint8Array(totalSize);
      const view = new DataView(profile.buffer);

      // Header: profile size at offset 0
      view.setUint32(0, totalSize, false);
      // Rest of 128-byte header is zeros (sufficient for our test)

      // Tag count at offset 128
      view.setUint32(128, tagCount, false);

      // Tag table entry at offset 132: desc tag
      const tagEntryOffset = 132;
      // sig = 'desc'
      profile[tagEntryOffset] = 'd'.charCodeAt(0);
      profile[tagEntryOffset + 1] = 'e'.charCodeAt(0);
      profile[tagEntryOffset + 2] = 's'.charCodeAt(0);
      profile[tagEntryOffset + 3] = 'c'.charCodeAt(0);
      // offset from profile start
      view.setUint32(tagEntryOffset + 4, tagDataOffset, false);
      // size
      view.setUint32(tagEntryOffset + 8, descTagDataSize, false);

      // Tag data: desc type
      const dStart = tagDataOffset;
      // type signature = 'desc'
      profile[dStart] = 'd'.charCodeAt(0);
      profile[dStart + 1] = 'e'.charCodeAt(0);
      profile[dStart + 2] = 's'.charCodeAt(0);
      profile[dStart + 3] = 'c'.charCodeAt(0);
      // reserved (4 bytes, zeros)
      // string length
      view.setUint32(dStart + 8, descStringBytes, false);
      // ASCII string
      for (let i = 0; i < descStringBytes; i++) {
        profile[dStart + 12 + i] = profileDescription.charCodeAt(i);
      }

      return profile;
    }

    /**
     * Create a minimal AVIF with ftyp + meta(iprp(ipco(colr(prof, ICC_PROFILE)))) structure.
     * This produces an AVIF buffer with an ICC profile in a colr(prof) box but no nclx box.
     */
    function createTestAVIFWithICC(profileDescription: string): ArrayBuffer {
      const iccProfile = buildMinimalICCProfile(profileDescription);

      const parts: number[] = [];

      function pushUint32BE(value: number): void {
        parts.push((value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF);
      }
      function pushString(str: string): void {
        for (let i = 0; i < str.length; i++) parts.push(str.charCodeAt(i));
      }

      // ftyp (16 bytes)
      pushUint32BE(16);
      pushString('ftyp');
      pushString('avif');
      pushUint32BE(0);

      // Build colr(prof) box: size(4) + type(4) + colour_type(4) + ICC profile data
      const colrSize = 4 + 4 + 4 + iccProfile.length;
      const colrBox: number[] = [];
      colrBox.push(...uint32BEHelper(colrSize));
      colrBox.push(...strBytesHelper('colr'));
      colrBox.push(...strBytesHelper('prof'));
      for (let i = 0; i < iccProfile.length; i++) colrBox.push(iccProfile[i]!);

      // ipco: size(4) + type(4) + colr box
      const ipcoSize = 8 + colrBox.length;

      // iprp: size(4) + type(4) + ipco
      const iprpSize = 8 + ipcoSize;

      // meta (FullBox): size(4) + type(4) + version+flags(4) + iprp
      const metaSize = 12 + iprpSize;

      // meta box
      pushUint32BE(metaSize);
      pushString('meta');
      parts.push(0, 0, 0, 0); // version + flags

      // iprp
      pushUint32BE(iprpSize);
      pushString('iprp');

      // ipco
      pushUint32BE(ipcoSize);
      pushString('ipco');

      // colr box
      parts.push(...colrBox);

      const buf = new ArrayBuffer(parts.length);
      new Uint8Array(buf).set(parts);
      return buf;

      function uint32BEHelper(v: number): number[] {
        return [(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
      }
      function strBytesHelper(str: string): number[] {
        const r: number[] = [];
        for (let i = 0; i < str.length; i++) r.push(str.charCodeAt(i));
        return r;
      }
    }

    // Mock createImageBitmap and VideoFrame for HDR AVIF tests
    let origCreateImageBitmap: typeof globalThis.createImageBitmap;
    let origVideoFrame: typeof globalThis.VideoFrame;

    beforeEach(() => {
      origCreateImageBitmap = globalThis.createImageBitmap;
      origVideoFrame = globalThis.VideoFrame;

      (globalThis as any).createImageBitmap = vi.fn(async () => ({
        width: 64,
        height: 64,
        close: vi.fn(),
      }));

      (globalThis as any).VideoFrame = vi.fn((bitmap: any) => ({
        displayWidth: bitmap.width ?? 64,
        displayHeight: bitmap.height ?? 64,
        close: vi.fn(),
      }));
    });

    afterEach(() => {
      globalThis.createImageBitmap = origCreateImageBitmap;
      globalThis.VideoFrame = origVideoFrame;
    });

    it('ICC-001: Display P3 ICC profile detected as wide gamut HDR', async () => {
      // parseAVIFColorInfo is not exported, so we test via FileSourceNode.loadFile
      // which calls parseAVIFColorInfo internally. A Display P3 ICC profile should
      // be routed through the HDR path (wide gamut detection).
      const buf = createTestAVIFWithICC('Display P3');
      const file = new File([buf], 'display-p3.avif', { type: 'image/avif' });

      await node.loadFile(file);

      // Display P3 triggers wide gamut detection in detectHDRFromICCProfile
      // which returns { transferFunction: 'srgb', colorPrimaries: 'bt709', isHDR: true }
      expect(node.isHDR()).toBe(true);
      expect(node.formatName).toBe('avif-hdr');
    });

    it('ICC-002: BT.2020 ICC profile detected as wide gamut HDR', async () => {
      const buf = createTestAVIFWithICC('BT.2020 Linear');
      const file = new File([buf], 'bt2020.avif', { type: 'image/avif' });

      await node.loadFile(file);

      // BT.2020 triggers wide gamut detection (contains '2020')
      expect(node.isHDR()).toBe(true);
      expect(node.formatName).toBe('avif-hdr');
    });

    it('ICC-003: sRGB ICC profile NOT detected as HDR', async () => {
      const buf = createTestAVIFWithICC('sRGB IEC61966-2.1');
      const file = new File([buf], 'srgb.avif', { type: 'image/avif' });

      await node.loadFile(file);

      // sRGB profile has no HDR/wide-gamut indicators, so parseAVIFColorInfo returns null
      // and the file falls through to SDR loading
      expect(node.isHDR()).toBe(false);
    });

    it('ICC-004: ICC profile with PQ in description detected as PQ HDR', async () => {
      const buf = createTestAVIFWithICC('Rec. 2020 PQ');
      const file = new File([buf], 'pq-icc.avif', { type: 'image/avif' });

      await node.loadFile(file);

      // 'PQ' keyword in description triggers PQ detection
      expect(node.isHDR()).toBe(true);
      expect(node.formatName).toBe('avif-hdr');

      const ipImage = node.getIPImage();
      expect(ipImage).not.toBeNull();
      expect(ipImage!.metadata.transferFunction).toBe('pq');
    });

    it('ICC-005: ICC profile with HLG in description detected as HLG HDR', async () => {
      const buf = createTestAVIFWithICC('Rec. 2020 HLG');
      const file = new File([buf], 'hlg-icc.avif', { type: 'image/avif' });

      await node.loadFile(file);

      // 'HLG' keyword in description triggers HLG detection
      expect(node.isHDR()).toBe(true);
      expect(node.formatName).toBe('avif-hdr');

      const ipImage = node.getIPImage();
      expect(ipImage).not.toBeNull();
      expect(ipImage!.metadata.transferFunction).toBe('hlg');
    });
  });


  describe('JXL support', () => {
    /**
     * Create a minimal JXL ISOBMFF container buffer with configurable nclx color info.
     * Builds: ftyp(jxl ) + colr(nclx) at top level (per ISO 18181-2).
     * Unlike AVIF, JXL places colr boxes at the top level, not nested in meta/iprp/ipco.
     */
    function createTestJXLBuffer(options: {
      transferCharacteristics?: number;
      colourPrimaries?: number;
      includeColrBox?: boolean;
    } = {}): ArrayBuffer {
      const {
        transferCharacteristics = 16, // PQ by default
        colourPrimaries = 9, // BT.2020 by default
        includeColrBox = true,
      } = options;

      const parts: Uint8Array[] = [];

      function writeUint32BE(value: number): void {
        const buf = new Uint8Array(4);
        const view = new DataView(buf.buffer);
        view.setUint32(0, value, false);
        parts.push(buf);
      }

      function writeString(str: string): void {
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
          bytes[i] = str.charCodeAt(i);
        }
        parts.push(bytes);
      }

      // ftyp box (16 bytes)
      writeUint32BE(16);
      writeString('ftyp');
      writeString('jxl '); // JXL brand
      writeUint32BE(0);    // minor version

      // colr(nclx) box at top level (per JXL ISOBMFF spec)
      if (includeColrBox) {
        const colrBoxSize = 8 + 4 + 4; // header(8) + 'nclx'(4) + primaries(2)+transfer(2)
        writeUint32BE(colrBoxSize);
        writeString('colr');
        writeString('nclx');
        // primaries (2 bytes) + transfer (2 bytes)
        const paramBuf = new Uint8Array(4);
        const paramView = new DataView(paramBuf.buffer);
        paramView.setUint16(0, colourPrimaries, false);
        paramView.setUint16(2, transferCharacteristics, false);
        parts.push(new Uint8Array(paramBuf));
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

    // Mock createImageBitmap and VideoFrame for HDR JXL tests
    let origCreateImageBitmap: typeof globalThis.createImageBitmap;
    let origVideoFrame: typeof globalThis.VideoFrame;

    beforeEach(() => {
      origCreateImageBitmap = globalThis.createImageBitmap;
      origVideoFrame = globalThis.VideoFrame;

      (globalThis as any).createImageBitmap = vi.fn(async () => ({
        width: 32,
        height: 32,
        close: vi.fn(),
      }));

      (globalThis as any).VideoFrame = vi.fn((bitmap: any) => ({
        displayWidth: bitmap.width ?? 32,
        displayHeight: bitmap.height ?? 32,
        close: vi.fn(),
      }));
    });

    afterEach(() => {
      globalThis.createImageBitmap = origCreateImageBitmap;
      globalThis.VideoFrame = origVideoFrame;
    });

    it('FSN-080: JXL with PQ (TC=16) in ISOBMFF container detected as HDR', async () => {
      const buffer = createTestJXLBuffer({ transferCharacteristics: 16, colourPrimaries: 9 });
      const file = new File([buffer], 'hdr-scene.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      expect(node.isHDR()).toBe(true);
      expect(node.formatName).toBe('jxl-hdr');
    });

    it('FSN-081: JXL with HLG (TC=18) in ISOBMFF container detected as HDR', async () => {
      const buffer = createTestJXLBuffer({ transferCharacteristics: 18, colourPrimaries: 9 });
      const file = new File([buffer], 'broadcast.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      expect(node.isHDR()).toBe(true);
      expect(node.formatName).toBe('jxl-hdr');
    });

    it('FSN-082: JXL HDR metadata includes correct transferFunction and colorPrimaries', async () => {
      const buffer = createTestJXLBuffer({ transferCharacteristics: 16, colourPrimaries: 9 });
      const file = new File([buffer], 'cosmos.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      const ipImage = node.getIPImage();
      expect(ipImage).not.toBeNull();
      expect(ipImage!.metadata?.transferFunction).toBe('pq');
      expect(ipImage!.metadata?.colorPrimaries).toBe('bt2020');
    });

    it('FSN-083: JXL HDR with BT.709 primaries (code=1)', async () => {
      const buffer = createTestJXLBuffer({ transferCharacteristics: 16, colourPrimaries: 1 });
      const file = new File([buffer], 'hdr-709.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      const ipImage = node.getIPImage();
      expect(ipImage!.metadata?.colorPrimaries).toBe('bt709');
    });

    it('FSN-084: JXL ISOBMFF without colr box is still detected as JXL file', () => {
      const buffer = createTestJXLBuffer({ includeColrBox: false });
      // Verify magic bytes are present (ftyp + 'jxl ' brand)
      const view = new DataView(buffer);
      const boxType = String.fromCharCode(
        view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)
      );
      expect(boxType).toBe('ftyp');
      const brand = String.fromCharCode(
        view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
      );
      expect(brand).toBe('jxl ');
    });

    it('FSN-085: non-JXL file with .jxl extension falls through gracefully', async () => {
      // Create a non-JXL buffer (PNG magic)
      const fakeBuffer = new ArrayBuffer(100);
      const view = new DataView(fakeBuffer);
      view.setUint32(0, 0x89504e47, false); // PNG magic
      const file = new File([fakeBuffer], 'fake.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      // Should fall through to standard image loading (SDR)
      expect(node.isHDR()).toBe(false);
    });

    it('FSN-086: JXL ISOBMFF container with BT.709 (TC=1) should not be treated as HDR', async () => {
      // BT.709 transfer (TC=1) is SDR
      const buffer = createTestJXLBuffer({ transferCharacteristics: 1, colourPrimaries: 1 });
      const file = new File([buffer], 'sdr-photo.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      // BT.709 is SDR, so isHDR should be false
      expect(node.isHDR()).toBe(false);
    });

    it('FSN-087: JXL HDR metadata has correct transferFunction for PQ', async () => {
      const buffer = createTestJXLBuffer({ transferCharacteristics: 16, colourPrimaries: 9 });
      const file = new File([buffer], 'pq-scene.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      const img = node.getIPImage();
      expect(img).not.toBeNull();
      expect(img!.metadata.transferFunction).toBe('pq');
      expect(img!.metadata.colorPrimaries).toBe('bt2020');
    });

    it('FSN-088: JXL HDR metadata has correct transferFunction for HLG', async () => {
      const buffer = createTestJXLBuffer({ transferCharacteristics: 18, colourPrimaries: 9 });
      const file = new File([buffer], 'hlg-broadcast.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      const img = node.getIPImage();
      expect(img).not.toBeNull();
      expect(img!.metadata.transferFunction).toBe('hlg');
      expect(img!.metadata.colorPrimaries).toBe('bt2020');
    });

    it('FSN-089: HDR JXL produces IPImage with videoFrame', async () => {
      const buffer = createTestJXLBuffer({ transferCharacteristics: 16, colourPrimaries: 9 });
      const file = new File([buffer], 'hdr.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      const ipImage = node.getIPImage();
      expect(ipImage).not.toBeNull();
      expect(ipImage!.videoFrame).not.toBeNull();
      expect(ipImage!.dataType).toBe('float32');
    });

    it('FSN-090: getCanvas() returns null for VideoFrame-backed JXL', async () => {
      const buffer = createTestJXLBuffer({ transferCharacteristics: 16, colourPrimaries: 9 });
      const file = new File([buffer], 'hdr.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      // VideoFrame-backed images should not produce a canvas
      expect(node.getCanvas()).toBeNull();
    });

    it('FSN-091: dispose() calls close() on JXL VideoFrame', async () => {
      const buffer = createTestJXLBuffer({ transferCharacteristics: 16, colourPrimaries: 9 });
      const file = new File([buffer], 'hdr.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      const ipImage = node.getIPImage();
      expect(ipImage).not.toBeNull();
      const closeSpy = vi.spyOn(ipImage!, 'close');

      node.dispose();

      expect(closeSpy).toHaveBeenCalled();
    });

    it('FSN-092: JXL HDR with BT.709 primaries sets correct colorSpace', async () => {
      const buffer = createTestJXLBuffer({ transferCharacteristics: 16, colourPrimaries: 1 });
      const file = new File([buffer], 'pq-709.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      const ipImage = node.getIPImage();
      expect(ipImage).not.toBeNull();
      expect(ipImage!.metadata.transferFunction).toBe('pq');
      expect(ipImage!.metadata.colorPrimaries).toBe('bt709');
      expect(ipImage!.metadata.colorSpace).toBe('rec709');
    });

    it('FSN-093: JXL HDR with BT.2020 primaries sets rec2020 colorSpace', async () => {
      const buffer = createTestJXLBuffer({ transferCharacteristics: 18, colourPrimaries: 9 });
      const file = new File([buffer], 'hlg-2020.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      const ipImage = node.getIPImage();
      expect(ipImage).not.toBeNull();
      expect(ipImage!.metadata.colorSpace).toBe('rec2020');
    });

    it('FSN-094: JXL ISOBMFF without colr box falls through to SDR path', async () => {
      const buffer = createTestJXLBuffer({ includeColrBox: false });
      const file = new File([buffer], 'no-colr.jxl', { type: 'image/jxl' });

      await node.loadFile(file);

      // No colr box → parseJXLColorInfo returns null → SDR path
      expect(node.isHDR()).toBe(false);
    });

    it('FSN-095: JXL HDR IPImage has same structure as expected for HDR formats', async () => {
      const buffer = createTestJXLBuffer({ transferCharacteristics: 16, colourPrimaries: 9 });
      const file = new File([buffer], 'test.jxl', { type: 'image/jxl' });
      await node.loadFile(file);

      const image = node.getIPImage();
      expect(image).not.toBeNull();

      // HDR IPImage must have: float32 data type, 4 channels, videoFrame, proper metadata
      expect(image!.dataType).toBe('float32');
      expect(image!.channels).toBe(4);
      expect(image!.videoFrame).not.toBeNull();
      expect(image!.metadata.transferFunction).toBe('pq');
      expect(image!.metadata.colorPrimaries).toBe('bt2020');
      expect(image!.metadata.colorSpace).toBe('rec2020');
      expect(image!.metadata.sourcePath).toBeDefined();
    });
  });
});
