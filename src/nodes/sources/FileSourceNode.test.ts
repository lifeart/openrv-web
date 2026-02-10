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
});
