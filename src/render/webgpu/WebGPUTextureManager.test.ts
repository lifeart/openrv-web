import { describe, it, expect, vi } from 'vitest';
import { WebGPUTextureManager } from './WebGPUTextureManager';
import type { LUTSlot } from './WebGPUTextureManager';

// ---------------------------------------------------------------------------
// Mock helpers (same pattern as WebGPURenderPipeline.test.ts)
// ---------------------------------------------------------------------------

function createMockTextureView() {
  return {};
}

function createMockTexture() {
  return {
    createView: vi.fn().mockReturnValue(createMockTextureView()),
    destroy: vi.fn(),
  };
}

function createMockDevice() {
  return {
    createShaderModule: vi.fn().mockReturnValue({}),
    createRenderPipeline: vi.fn().mockReturnValue({ getBindGroupLayout: vi.fn().mockReturnValue({}) }),
    createSampler: vi.fn().mockReturnValue({}),
    createTexture: vi.fn().mockReturnValue(createMockTexture()),
    createBindGroup: vi.fn().mockReturnValue({}),
    createBuffer: vi.fn().mockReturnValue({
      getMappedRange: vi.fn().mockReturnValue(new ArrayBuffer(16)),
      unmap: vi.fn(),
      destroy: vi.fn(),
    }),
    createCommandEncoder: vi.fn(),
    queue: {
      writeTexture: vi.fn(),
      writeBuffer: vi.fn(),
      submit: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
    },
    destroy: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGPUTextureManager', () => {
  // ─── Image texture: SDR ────────────────────────────────────────────

  describe('uploadImageData', () => {
    it('WGPU-TEX-001: creates rgba8unorm texture for SDR uint8 data', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();
      const data = new Uint8Array(4 * 4 * 4); // 4x4 RGBA

      manager.uploadImageData(device, data, 4, 4, 4);

      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          size: { width: 4, height: 4 },
          format: 'rgba8unorm',
        }),
      );
    });

    it('WGPU-TEX-002: creates rgba32float texture for HDR float32 data', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();
      const data = new Float32Array(8 * 8 * 4); // 8x8 RGBA

      manager.uploadImageData(device, data, 8, 8, 4);

      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          size: { width: 8, height: 8 },
          format: 'rgba32float',
        }),
      );
    });

    it('WGPU-TEX-003: writes correct bytesPerRow for SDR', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();
      const data = new Uint8Array(10 * 10 * 4);

      manager.uploadImageData(device, data, 10, 10, 4);

      expect(device.queue.writeTexture).toHaveBeenCalledWith(
        expect.anything(),
        data,
        { bytesPerRow: 40, rowsPerImage: 10 }, // 10 * 4 bytes
        { width: 10, height: 10 },
      );
    });

    it('WGPU-TEX-004: writes correct bytesPerRow for HDR', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();
      const data = new Float32Array(10 * 10 * 4);

      manager.uploadImageData(device, data, 10, 10, 4);

      expect(device.queue.writeTexture).toHaveBeenCalledWith(
        expect.anything(),
        data,
        { bytesPerRow: 160, rowsPerImage: 10 }, // 10 * 16 bytes
        { width: 10, height: 10 },
      );
    });

    it('WGPU-TEX-005: reuses texture when dimensions match', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();
      const data = new Uint8Array(4 * 4 * 4);

      manager.uploadImageData(device, data, 4, 4, 4);
      manager.uploadImageData(device, data, 4, 4, 4);

      // Should only create texture once
      expect(device.createTexture).toHaveBeenCalledTimes(1);
    });

    it('WGPU-TEX-006: recreates texture when dimensions change', () => {
      const device = createMockDevice();
      // Return different mock textures for each call
      const tex1 = createMockTexture();
      const tex2 = createMockTexture();
      device.createTexture.mockReturnValueOnce(tex1).mockReturnValueOnce(tex2);

      const manager = new WebGPUTextureManager();

      manager.uploadImageData(device, new Uint8Array(4 * 4 * 4), 4, 4, 4);
      manager.uploadImageData(device, new Uint8Array(8 * 8 * 4), 8, 8, 4);

      expect(device.createTexture).toHaveBeenCalledTimes(2);
      expect(tex1.destroy).toHaveBeenCalled();
    });
  });

  // ─── Channel expansion ─────────────────────────────────────────────

  describe('channel expansion', () => {
    it('WGPU-TEX-010: expands 1-channel to RGBA (grayscale)', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      // 2x2 single-channel image
      const data = new Uint8Array([100, 150, 200, 250]);
      manager.uploadImageData(device, data, 2, 2, 1);

      const uploadedData = device.queue.writeTexture.mock.calls[0]![1] as Uint8Array;
      // First pixel: R=100, G=100, B=100, A=255
      expect(uploadedData[0]).toBe(100);
      expect(uploadedData[1]).toBe(100);
      expect(uploadedData[2]).toBe(100);
      expect(uploadedData[3]).toBe(255);
    });

    it('WGPU-TEX-011: expands 2-channel to RGBA (grayscale + alpha)', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      // 1x1 two-channel
      const data = new Uint8Array([128, 200]);
      manager.uploadImageData(device, data, 1, 1, 2);

      const uploadedData = device.queue.writeTexture.mock.calls[0]![1] as Uint8Array;
      expect(uploadedData[0]).toBe(128);
      expect(uploadedData[1]).toBe(128);
      expect(uploadedData[2]).toBe(128);
      expect(uploadedData[3]).toBe(200);
    });

    it('WGPU-TEX-012: expands 3-channel to RGBA (RGB + alpha=255)', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      // 1x1 RGB
      const data = new Uint8Array([10, 20, 30]);
      manager.uploadImageData(device, data, 1, 1, 3);

      const uploadedData = device.queue.writeTexture.mock.calls[0]![1] as Uint8Array;
      expect(uploadedData[0]).toBe(10);
      expect(uploadedData[1]).toBe(20);
      expect(uploadedData[2]).toBe(30);
      expect(uploadedData[3]).toBe(255);
    });

    it('WGPU-TEX-013: expands float32 1-channel with alpha=1.0', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      const data = new Float32Array([0.5]);
      manager.uploadImageData(device, data, 1, 1, 1);

      const uploadedData = device.queue.writeTexture.mock.calls[0]![1] as Float32Array;
      expect(uploadedData[0]).toBeCloseTo(0.5);
      expect(uploadedData[1]).toBeCloseTo(0.5);
      expect(uploadedData[2]).toBeCloseTo(0.5);
      expect(uploadedData[3]).toBeCloseTo(1.0);
    });

    it('WGPU-TEX-014: expands float32 3-channel with alpha=1.0', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      const data = new Float32Array([0.1, 0.2, 0.3]);
      manager.uploadImageData(device, data, 1, 1, 3);

      const uploadedData = device.queue.writeTexture.mock.calls[0]![1] as Float32Array;
      expect(uploadedData[0]).toBeCloseTo(0.1);
      expect(uploadedData[1]).toBeCloseTo(0.2);
      expect(uploadedData[2]).toBeCloseTo(0.3);
      expect(uploadedData[3]).toBeCloseTo(1.0);
    });

    it('WGPU-TEX-015: passes 4-channel data directly without expansion', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      const data = new Uint8Array([10, 20, 30, 40]);
      manager.uploadImageData(device, data, 1, 1, 4);

      const uploadedData = device.queue.writeTexture.mock.calls[0]![1] as Uint8Array;
      // Should be the same reference (no expansion needed)
      expect(uploadedData).toBe(data);
    });
  });

  // ─── VideoFrame upload ─────────────────────────────────────────────

  describe('uploadVideoFrame', () => {
    it('WGPU-TEX-020: uses copyExternalImageToTexture with display-p3', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      const mockFrame = { width: 1920, height: 1080 } as unknown as VideoFrame;
      manager.uploadVideoFrame(device, mockFrame, 1920, 1080);

      expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
        { source: mockFrame },
        expect.objectContaining({ colorSpace: 'display-p3' }),
        { width: 1920, height: 1080 },
      );
    });

    it('WGPU-TEX-021: creates rgba8unorm texture for VideoFrame', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      const mockFrame = {} as unknown as VideoFrame;
      manager.uploadVideoFrame(device, mockFrame, 640, 480);

      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'rgba8unorm',
          size: { width: 640, height: 480 },
        }),
      );
    });

    it('WGPU-TEX-022: includes RENDER_ATTACHMENT usage for VideoFrame', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      const mockFrame = {} as unknown as VideoFrame;
      manager.uploadVideoFrame(device, mockFrame, 100, 100);

      const createCall = device.createTexture.mock.calls[0]![0];
      // RENDER_ATTACHMENT = 0x10
      expect(createCall.usage & 0x10).toBe(0x10);
    });
  });

  // ─── ImageBitmap upload ────────────────────────────────────────────

  describe('uploadImageBitmap', () => {
    it('WGPU-TEX-025: uses copyExternalImageToTexture for ImageBitmap', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      const mockBitmap = {} as unknown as ImageBitmap;
      manager.uploadImageBitmap(device, mockBitmap, 256, 256);

      expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
        { source: mockBitmap },
        expect.objectContaining({ texture: expect.anything() }),
        { width: 256, height: 256 },
      );
    });
  });

  // ─── 1D LUT upload ────────────────────────────────────────────────

  describe('upload1DLUT', () => {
    it('WGPU-TEX-030: uploads 1D LUT as height=1 texture', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      const data = new Uint8Array(256 * 4); // 256-wide RGBA
      manager.upload1DLUT(device, 'curves', data, 256, 4);

      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          size: { width: 256, height: 1 },
          format: 'rgba8unorm',
        }),
      );
    });

    it('WGPU-TEX-031: uploads float32 LUT as rgba32float', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      const data = new Float32Array(64 * 4);
      manager.upload1DLUT(device, 'film', data, 64, 4);

      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'rgba32float',
        }),
      );
    });

    it('WGPU-TEX-032: expands 3-channel LUT to RGBA', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      const data = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]); // 2 pixels, 3 channels
      manager.upload1DLUT(device, 'inline', data, 2, 3);

      const uploadedData = device.queue.writeTexture.mock.calls[0]![1] as Float32Array;
      // 2 pixels * 4 channels = 8 floats
      expect(uploadedData.length).toBe(8);
      // First pixel: R=0.1, G=0.2, B=0.3, A=1.0
      expect(uploadedData[0]).toBeCloseTo(0.1);
      expect(uploadedData[1]).toBeCloseTo(0.2);
      expect(uploadedData[2]).toBeCloseTo(0.3);
      expect(uploadedData[3]).toBeCloseTo(1.0);
    });

    it('WGPU-TEX-033: destroys old LUT texture when re-uploading same slot', () => {
      const device = createMockDevice();
      const tex1 = createMockTexture();
      const tex2 = createMockTexture();
      device.createTexture.mockReturnValueOnce(tex1).mockReturnValueOnce(tex2);

      const manager = new WebGPUTextureManager();
      const data = new Uint8Array(16 * 4);

      manager.upload1DLUT(device, 'curves', data, 16, 4);
      manager.upload1DLUT(device, 'curves', data, 16, 4);

      expect(tex1.destroy).toHaveBeenCalled();
    });

    it('WGPU-TEX-034: throws for invalid 1D LUT slot', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();
      const data = new Uint8Array(16 * 4);

      expect(() => manager.upload1DLUT(device, 'file3D' as LUTSlot, data, 16, 4)).toThrow();
    });

    it('WGPU-TEX-035: accepts all valid 1D LUT slots', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();
      const data = new Uint8Array(8 * 4);

      const slots: LUTSlot[] = ['curves', 'falseColor', 'film', 'inline'];
      for (const slot of slots) {
        expect(() => manager.upload1DLUT(device, slot, data, 8, 4)).not.toThrow();
      }
    });
  });

  // ─── 3D LUT upload ────────────────────────────────────────────────

  describe('upload3DLUT', () => {
    it('WGPU-TEX-040: creates 2D atlas texture for 3D LUT', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      // size=4 -> 4*4*4=64 pixels, 3 floats per pixel
      const data = new Float32Array(4 * 4 * 4 * 3);
      manager.upload3DLUT(device, 'file3D', data, 4);

      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          size: { width: 16, height: 4 }, // size*size x size
          format: 'rgba32float',
        }),
      );
    });

    it('WGPU-TEX-041: expands RGB to RGBA with alpha=1.0', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      // size=2 -> 2*2*2=8 pixels, 3 floats per pixel
      const data = new Float32Array(8 * 3);
      data[0] = 0.1;
      data[1] = 0.2;
      data[2] = 0.3;
      manager.upload3DLUT(device, 'look3D', data, 2);

      const uploadedData = device.queue.writeTexture.mock.calls[0]![1] as Float32Array;
      expect(uploadedData[0]).toBeCloseTo(0.1);
      expect(uploadedData[1]).toBeCloseTo(0.2);
      expect(uploadedData[2]).toBeCloseTo(0.3);
      expect(uploadedData[3]).toBeCloseTo(1.0);
    });

    it('WGPU-TEX-042: throws for invalid 3D LUT slot', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();
      const data = new Float32Array(8 * 3);

      expect(() => manager.upload3DLUT(device, 'curves' as LUTSlot, data, 2)).toThrow();
    });

    it('WGPU-TEX-043: accepts all valid 3D LUT slots', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();
      const data = new Float32Array(8 * 3); // size=2

      const slots: LUTSlot[] = ['file3D', 'look3D', 'display3D'];
      for (const slot of slots) {
        expect(() => manager.upload3DLUT(device, slot, data, 2)).not.toThrow();
      }
    });
  });

  // ─── LUT retrieval ─────────────────────────────────────────────────

  describe('getLUTTexture', () => {
    it('WGPU-TEX-050: returns null for unset slot', () => {
      const manager = new WebGPUTextureManager();
      expect(manager.getLUTTexture('curves')).toBeNull();
    });

    it('WGPU-TEX-051: returns texture after upload', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();
      const data = new Uint8Array(8 * 4);

      manager.upload1DLUT(device, 'curves', data, 8, 4);
      expect(manager.getLUTTexture('curves')).not.toBeNull();
    });
  });

  // ─── Dirty tracking ────────────────────────────────────────────────

  describe('dirty tracking', () => {
    it('WGPU-TEX-060: image is dirty after upload', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      expect(manager.isImageDirty()).toBe(false);
      manager.uploadImageData(device, new Uint8Array(16), 2, 2, 4);
      expect(manager.isImageDirty()).toBe(true);
    });

    it('WGPU-TEX-061: clearImageDirty resets flag', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      manager.uploadImageData(device, new Uint8Array(16), 2, 2, 4);
      manager.clearImageDirty();
      expect(manager.isImageDirty()).toBe(false);
    });

    it('WGPU-TEX-062: LUT is dirty after upload', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      expect(manager.isLUTDirty('curves')).toBe(false);
      manager.upload1DLUT(device, 'curves', new Uint8Array(32), 8, 4);
      expect(manager.isLUTDirty('curves')).toBe(true);
    });

    it('WGPU-TEX-063: clearAllDirty resets all flags', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      manager.uploadImageData(device, new Uint8Array(16), 2, 2, 4);
      manager.upload1DLUT(device, 'curves', new Uint8Array(32), 8, 4);
      manager.clearAllDirty();

      expect(manager.isImageDirty()).toBe(false);
      expect(manager.isLUTDirty('curves')).toBe(false);
    });
  });

  // ─── Dispose ───────────────────────────────────────────────────────

  describe('dispose', () => {
    it('WGPU-TEX-070: destroys image texture on dispose', () => {
      const device = createMockDevice();
      const tex = createMockTexture();
      device.createTexture.mockReturnValue(tex);

      const manager = new WebGPUTextureManager();
      manager.uploadImageData(device, new Uint8Array(16), 2, 2, 4);
      manager.dispose();

      expect(tex.destroy).toHaveBeenCalled();
      expect(manager.getImageTexture()).toBeNull();
    });

    it('WGPU-TEX-071: destroys all LUT textures on dispose', () => {
      const device = createMockDevice();
      const textures = [createMockTexture(), createMockTexture()];
      let idx = 0;
      device.createTexture.mockImplementation(() => textures[idx++] ?? createMockTexture());

      const manager = new WebGPUTextureManager();
      manager.upload1DLUT(device, 'curves', new Uint8Array(32), 8, 4);
      manager.upload1DLUT(device, 'film', new Uint8Array(32), 8, 4);
      manager.dispose();

      expect(textures[0]!.destroy).toHaveBeenCalled();
      expect(textures[1]!.destroy).toHaveBeenCalled();
      expect(manager.getLUTTexture('curves')).toBeNull();
      expect(manager.getLUTTexture('film')).toBeNull();
    });

    it('WGPU-TEX-072: does not throw when disposing without uploads', () => {
      const manager = new WebGPUTextureManager();
      expect(() => manager.dispose()).not.toThrow();
    });

    it('WGPU-TEX-073: clears dirty flags on dispose', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      manager.uploadImageData(device, new Uint8Array(16), 2, 2, 4);
      manager.dispose();

      expect(manager.isImageDirty()).toBe(false);
    });
  });

  // ─── Validation and edge cases ──────────────────────────────────────

  describe('validation and edge cases', () => {
    it('WGPU-TEX-080: invalid channel count (0 or 5) throws', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      expect(() => manager.uploadImageData(device, new Uint8Array(4), 1, 1, 0)).toThrow(/Invalid channel count/);
      expect(() => manager.uploadImageData(device, new Uint8Array(5), 1, 1, 5)).toThrow(/Invalid channel count/);
    });

    it('WGPU-TEX-081: zero-dimension image throws', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      expect(() => manager.uploadImageData(device, new Uint8Array(4), 0, 1, 4)).toThrow(/Invalid dimensions/);
      expect(() => manager.uploadImageData(device, new Uint8Array(4), 1, 0, 4)).toThrow(/Invalid dimensions/);
      expect(() => manager.uploadImageData(device, new Uint8Array(4), 0, 0, 4)).toThrow(/Invalid dimensions/);
    });

    it('WGPU-TEX-082: data too short for dimensions throws', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      // 2x2 RGBA = 16 elements, but only 8 provided
      expect(() => manager.uploadImageData(device, new Uint8Array(8), 2, 2, 4)).toThrow(/Data too short/);
    });

    it('WGPU-TEX-083: double dispose does not throw', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      manager.uploadImageData(device, new Uint8Array(16), 2, 2, 4);
      manager.upload1DLUT(device, 'curves', new Uint8Array(32), 8, 4);

      manager.dispose();
      expect(() => manager.dispose()).not.toThrow();
    });

    it('WGPU-TEX-084: format switching SDR to HDR to SDR recreates texture each time', () => {
      const device = createMockDevice();
      const textures: ReturnType<typeof createMockTexture>[] = [];
      device.createTexture.mockImplementation(() => {
        const t = createMockTexture();
        textures.push(t);
        return t;
      });

      const manager = new WebGPUTextureManager();

      // SDR upload (rgba8unorm)
      manager.uploadImageData(device, new Uint8Array(4 * 4 * 4), 4, 4, 4);
      expect(textures).toHaveLength(1);

      // HDR upload (rgba32float) — format change forces texture recreation
      manager.uploadImageData(device, new Float32Array(4 * 4 * 4), 4, 4, 4);
      expect(textures).toHaveLength(2);
      expect(textures[0]!.destroy).toHaveBeenCalled();

      // Back to SDR — format change again forces texture recreation
      manager.uploadImageData(device, new Uint8Array(4 * 4 * 4), 4, 4, 4);
      expect(textures).toHaveLength(3);
      expect(textures[1]!.destroy).toHaveBeenCalled();
    });

    it('WGPU-TEX-085: upload3DLUT with size < 2 throws', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      expect(() => manager.upload3DLUT(device, 'file3D', new Float32Array(3), 1)).toThrow(/at least 2/);
      expect(() => manager.upload3DLUT(device, 'file3D', new Float32Array(0), 0)).toThrow(/at least 2/);
    });

    it('WGPU-TEX-086: upload1DLUT with width=0 throws', () => {
      const device = createMockDevice();
      const manager = new WebGPUTextureManager();

      expect(() => manager.upload1DLUT(device, 'curves', new Uint8Array(0), 0, 4)).toThrow(/Width must be greater than 0/);
    });
  });
});
