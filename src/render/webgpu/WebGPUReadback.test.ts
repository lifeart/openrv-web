import { describe, it, expect, vi } from 'vitest';
import { WebGPUReadback, alignTo } from './WebGPUReadback';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockBuffer(data?: Float32Array) {
  const bufferData = data ?? new Float32Array(4);
  return {
    getMappedRange: vi.fn().mockReturnValue(bufferData.buffer),
    unmap: vi.fn(),
    destroy: vi.fn(),
    mapAsync: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockTexture() {
  return {
    createView: vi.fn().mockReturnValue({}),
    destroy: vi.fn(),
  };
}

function createMockDevice(buffer?: ReturnType<typeof createMockBuffer>) {
  const mockBuffer = buffer ?? createMockBuffer();
  const mockCommandEncoder = {
    beginRenderPass: vi.fn(),
    copyTextureToBuffer: vi.fn(),
    finish: vi.fn().mockReturnValue({}),
  };

  return {
    createShaderModule: vi.fn().mockReturnValue({}),
    createRenderPipeline: vi.fn().mockReturnValue({ getBindGroupLayout: vi.fn().mockReturnValue({}) }),
    createSampler: vi.fn().mockReturnValue({}),
    createTexture: vi.fn().mockImplementation(() => createMockTexture()),
    createBindGroup: vi.fn().mockReturnValue({}),
    createBuffer: vi.fn().mockReturnValue(mockBuffer),
    createCommandEncoder: vi.fn().mockReturnValue(mockCommandEncoder),
    queue: {
      writeTexture: vi.fn(),
      writeBuffer: vi.fn(),
      submit: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
    },
    destroy: vi.fn(),
    _mockBuffer: mockBuffer,
    _mockCommandEncoder: mockCommandEncoder,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGPUReadback', () => {
  describe('alignTo', () => {
    it('WGPU-RB-001: aligns value up to boundary', () => {
      expect(alignTo(16, 256)).toBe(256);
      expect(alignTo(256, 256)).toBe(256);
      expect(alignTo(257, 256)).toBe(512);
      expect(alignTo(1, 256)).toBe(256);
      expect(alignTo(512, 256)).toBe(512);
    });

    it('WGPU-RB-002: handles zero', () => {
      expect(alignTo(0, 256)).toBe(0);
    });
  });

  describe('readPixelFloat', () => {
    it('WGPU-RB-010: reads a single pixel and returns [r,g,b,a]', async () => {
      // 1 pixel = 16 bytes, but aligned to 256 bytes for bytesPerRow
      const pixelData = new Float32Array(256 / 4); // 256 bytes / 4 = 64 floats
      pixelData[0] = 0.25;
      pixelData[1] = 0.5;
      pixelData[2] = 0.75;
      pixelData[3] = 1.0;

      const buffer = createMockBuffer(pixelData);
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      const result = await readback.readPixelFloat(device, 10, 20, texture);

      expect(result).toEqual([0.25, 0.5, 0.75, 1.0]);
    });

    it('WGPU-RB-011: issues copyTextureToBuffer with correct origin', async () => {
      const pixelData = new Float32Array(256 / 4);
      const buffer = createMockBuffer(pixelData);
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      await readback.readPixelFloat(device, 42, 99, texture);

      const encoder = device._mockCommandEncoder;
      expect(encoder.copyTextureToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({ texture, origin: { x: 42, y: 99 } }),
        expect.objectContaining({ buffer: device._mockBuffer }),
        expect.objectContaining({ width: 1, height: 1 }),
      );
    });

    it('WGPU-RB-012: calls mapAsync with READ mode', async () => {
      const pixelData = new Float32Array(256 / 4);
      const buffer = createMockBuffer(pixelData);
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      await readback.readPixelFloat(device, 0, 0, texture);

      expect(buffer.mapAsync).toHaveBeenCalledWith(0x01); // GPUMapMode.READ
    });

    it('WGPU-RB-013: unmaps buffer after reading', async () => {
      const pixelData = new Float32Array(256 / 4);
      const buffer = createMockBuffer(pixelData);
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      await readback.readPixelFloat(device, 0, 0, texture);

      expect(buffer.unmap).toHaveBeenCalled();
    });
  });

  describe('readRegion', () => {
    it('WGPU-RB-020: reads a rectangular region correctly', async () => {
      // 2x2 region, bytesPerRow = alignTo(2*16=32, 256) = 256 bytes
      // Total = 256 * 2 = 512 bytes = 128 floats
      const rawData = new Float32Array(128);
      // Row 0: pixel (0,0) and (1,0)
      rawData[0] = 1.0;
      rawData[1] = 0.0;
      rawData[2] = 0.0;
      rawData[3] = 1.0;
      rawData[4] = 0.0;
      rawData[5] = 1.0;
      rawData[6] = 0.0;
      rawData[7] = 1.0;
      // Row 1 starts at float offset 64 (256 bytes / 4)
      rawData[64] = 0.0;
      rawData[65] = 0.0;
      rawData[66] = 1.0;
      rawData[67] = 1.0;
      rawData[68] = 1.0;
      rawData[69] = 1.0;
      rawData[70] = 1.0;
      rawData[71] = 1.0;

      const buffer = createMockBuffer(rawData);
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      const result = await readback.readRegion(device, 0, 0, 2, 2, texture);

      // Result should be compacted (no padding): 2*2*4 = 16 floats
      expect(result.length).toBe(16);
      // Row 0, pixel 0: red
      expect(result[0]).toBe(1.0);
      expect(result[1]).toBe(0.0);
      expect(result[2]).toBe(0.0);
      expect(result[3]).toBe(1.0);
      // Row 0, pixel 1: green
      expect(result[4]).toBe(0.0);
      expect(result[5]).toBe(1.0);
      expect(result[6]).toBe(0.0);
      expect(result[7]).toBe(1.0);
      // Row 1, pixel 0: blue
      expect(result[8]).toBe(0.0);
      expect(result[9]).toBe(0.0);
      expect(result[10]).toBe(1.0);
      expect(result[11]).toBe(1.0);
      // Row 1, pixel 1: white
      expect(result[12]).toBe(1.0);
      expect(result[13]).toBe(1.0);
      expect(result[14]).toBe(1.0);
      expect(result[15]).toBe(1.0);
    });

    it('WGPU-RB-021: uses aligned bytesPerRow in copy command', async () => {
      const rawData = new Float32Array(256 / 4);
      const buffer = createMockBuffer(rawData);
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      await readback.readRegion(device, 0, 0, 1, 1, texture);

      // 1 pixel * 16 bytes = 16, aligned to 256
      expect(device._mockCommandEncoder.copyTextureToBuffer).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bytesPerRow: 256 }),
        expect.anything(),
      );
    });

    it('WGPU-RB-022: submits command buffer to queue', async () => {
      const rawData = new Float32Array(256 / 4);
      const buffer = createMockBuffer(rawData);
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      await readback.readRegion(device, 0, 0, 1, 1, texture);

      expect(device.queue.submit).toHaveBeenCalledTimes(1);
    });
  });

  describe('double buffering', () => {
    it('WGPU-RB-030: alternates between two buffers', async () => {
      const buffers = [createMockBuffer(new Float32Array(256 / 4)), createMockBuffer(new Float32Array(256 / 4))];
      let bufIdx = 0;

      const device = createMockDevice(buffers[0]!);
      device.createBuffer.mockImplementation(() => buffers[bufIdx++ % 2]);

      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      // First read uses buffer 0
      await readback.readRegion(device, 0, 0, 1, 1, texture);
      expect(buffers[0]!.mapAsync).toHaveBeenCalledTimes(1);

      // Second read uses buffer 1
      await readback.readRegion(device, 0, 0, 1, 1, texture);
      expect(buffers[1]!.mapAsync).toHaveBeenCalledTimes(1);
    });

    it('WGPU-RB-031: reuses buffers when size is sufficient', async () => {
      const rawData = new Float32Array(256 / 4);
      const buffer = createMockBuffer(rawData);
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      // Read same size twice (one buffer per read, alternating)
      await readback.readRegion(device, 0, 0, 1, 1, texture);
      await readback.readRegion(device, 0, 0, 1, 1, texture);

      // 2 buffers created (one for each slot in double buffer)
      expect(device.createBuffer).toHaveBeenCalledTimes(2);

      // Third read should reuse buffer 0
      await readback.readRegion(device, 0, 0, 1, 1, texture);
      // Still only 2 buffers
      expect(device.createBuffer).toHaveBeenCalledTimes(2);
    });
  });

  describe('buffer management', () => {
    it('WGPU-RB-040: creates buffer with MAP_READ | COPY_DST usage', async () => {
      const rawData = new Float32Array(256 / 4);
      const buffer = createMockBuffer(rawData);
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      await readback.readRegion(device, 0, 0, 1, 1, texture);

      expect(device.createBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          usage: 0x01 | 0x08, // MAP_READ | COPY_DST
        }),
      );
    });

    it('WGPU-RB-041: reallocates buffer when region grows', async () => {
      const smallData = new Float32Array(256 / 4);
      const largeData = new Float32Array(512 / 4);
      const buffers = [createMockBuffer(smallData), createMockBuffer(largeData), createMockBuffer(largeData)];
      let bIdx = 0;

      const device = createMockDevice(buffers[0]!);
      device.createBuffer.mockImplementation(() => buffers[bIdx++]!);

      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      // First read: small buffer (1x1)
      await readback.readRegion(device, 0, 0, 1, 1, texture);

      // Second read: larger buffer needed (16x2) - alternates to slot 1
      // 16 pixels * 16 bytes = 256 per row (already aligned), 2 rows = 512 bytes
      await readback.readRegion(device, 0, 0, 16, 2, texture);

      // Should have created 2 buffers: one small for slot 0, one large for slot 1
      expect(device.createBuffer).toHaveBeenCalledTimes(2);
    });
  });

  describe('dispose', () => {
    it('WGPU-RB-050: destroys all allocated buffers', async () => {
      const buffer1 = createMockBuffer(new Float32Array(256 / 4));
      const buffer2 = createMockBuffer(new Float32Array(256 / 4));
      let bIdx = 0;

      const device = createMockDevice(buffer1);
      device.createBuffer.mockImplementation(() => [buffer1, buffer2][bIdx++]!);

      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      await readback.readRegion(device, 0, 0, 1, 1, texture);
      await readback.readRegion(device, 0, 0, 1, 1, texture);

      readback.dispose();

      expect(buffer1.destroy).toHaveBeenCalled();
      expect(buffer2.destroy).toHaveBeenCalled();
    });

    it('WGPU-RB-051: safe to call dispose when nothing allocated', () => {
      const readback = new WebGPUReadback();
      expect(() => readback.dispose()).not.toThrow();
    });

    it('WGPU-RB-052: safe to call dispose multiple times', async () => {
      const buffer = createMockBuffer(new Float32Array(256 / 4));
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      await readback.readRegion(device, 0, 0, 1, 1, texture);

      readback.dispose();
      expect(() => readback.dispose()).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('WGPU-RB-053: mapAsync rejection propagates error and resets mapping flag', async () => {
      const buffer = createMockBuffer(new Float32Array(256 / 4));
      buffer.mapAsync.mockRejectedValue(new Error('GPU device lost'));
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      await expect(readback.readRegion(device, 0, 0, 1, 1, texture)).rejects.toThrow('GPU device lost');

      // Mapping flag should be reset so subsequent reads don't throw "still mapped"
      buffer.mapAsync.mockResolvedValue(undefined);
      const result = await readback.readRegion(device, 0, 0, 1, 1, texture);
      expect(result).toBeInstanceOf(Float32Array);
    });

    it('WGPU-RB-054: zero-size region throws', async () => {
      const buffer = createMockBuffer(new Float32Array(256 / 4));
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      await expect(readback.readRegion(device, 0, 0, 0, 0, texture)).rejects.toThrow();
    });

    it('WGPU-RB-055: negative coordinates throw', async () => {
      const buffer = createMockBuffer(new Float32Array(256 / 4));
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      await expect(readback.readPixelFloat(device, -1, -1, texture)).rejects.toThrow();
    });

    it('WGPU-RB-056: concurrent read on same buffer index throws', async () => {
      // Create a buffer whose mapAsync never resolves
      const buffer1 = createMockBuffer(new Float32Array(256 / 4));
      buffer1.mapAsync.mockReturnValue(new Promise(() => {})); // never resolves
      const buffer2 = createMockBuffer(new Float32Array(256 / 4));
      let bIdx = 0;

      const device = createMockDevice(buffer1);
      device.createBuffer.mockImplementation(() => [buffer1, buffer2][bIdx++]!);

      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      // First read uses buffer 0 (index 0), never resolves
      void readback.readRegion(device, 0, 0, 1, 1, texture);

      // Second read uses buffer 1 (index 1), also never resolves
      buffer2.mapAsync.mockReturnValue(new Promise(() => {}));
      void readback.readRegion(device, 0, 0, 1, 1, texture);

      // Third read would try buffer 0 again, which is still mapping
      await expect(readback.readRegion(device, 0, 0, 1, 1, texture)).rejects.toThrow(
        /still mapped/,
      );
    });

    it('WGPU-RB-057: double dispose does not throw', async () => {
      const buffer = createMockBuffer(new Float32Array(256 / 4));
      const device = createMockDevice(buffer);
      const texture = createMockTexture();
      const readback = new WebGPUReadback();

      await readback.readRegion(device, 0, 0, 1, 1, texture);

      readback.dispose();
      readback.dispose();
      // No error means success — destroy on null buffers is a no-op
    });
  });
});
