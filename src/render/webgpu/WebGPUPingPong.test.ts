import { describe, it, expect, vi } from 'vitest';
import { WebGPUPingPong } from './WebGPUPingPong';

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
    createTexture: vi.fn().mockImplementation(() => createMockTexture()),
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

describe('WebGPUPingPong', () => {
  describe('initial state', () => {
    it('WGPU-PP-001: starts unallocated', () => {
      const pp = new WebGPUPingPong();
      expect(pp.isAllocated).toBe(false);
      expect(pp.width).toBe(0);
      expect(pp.height).toBe(0);
      expect(pp.format).toBe('rgba8unorm');
    });

    it('WGPU-PP-002: getSource/getTarget return null when not allocated', () => {
      const pp = new WebGPUPingPong();
      expect(pp.getSource()).toBeNull();
      expect(pp.getTarget()).toBeNull();
    });
  });

  describe('resize', () => {
    it('WGPU-PP-010: allocates two textures with correct format', () => {
      const device = createMockDevice();
      const pp = new WebGPUPingPong();
      pp.resize(device, 800, 600, 'rgba8unorm');

      expect(device.createTexture).toHaveBeenCalledTimes(2);
      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          size: { width: 800, height: 600 },
          format: 'rgba8unorm',
        }),
      );
      expect(pp.isAllocated).toBe(true);
      expect(pp.width).toBe(800);
      expect(pp.height).toBe(600);
      expect(pp.format).toBe('rgba8unorm');
    });

    it('WGPU-PP-011: allocates HDR textures with rgba16float', () => {
      const device = createMockDevice();
      const pp = new WebGPUPingPong();
      pp.resize(device, 1920, 1080, 'rgba16float');

      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'rgba16float',
        }),
      );
      expect(pp.format).toBe('rgba16float');
    });

    it('WGPU-PP-012: skips reallocation when dimensions and format match', () => {
      const device = createMockDevice();
      const pp = new WebGPUPingPong();
      pp.resize(device, 800, 600, 'rgba8unorm');

      const callCount = device.createTexture.mock.calls.length;
      pp.resize(device, 800, 600, 'rgba8unorm');

      expect(device.createTexture.mock.calls.length).toBe(callCount);
    });

    it('WGPU-PP-013: destroys old textures on resize', () => {
      const device = createMockDevice();
      const textures = [createMockTexture(), createMockTexture()];
      let callIdx = 0;
      device.createTexture.mockImplementation(() => textures[callIdx++ % 2]);

      const pp = new WebGPUPingPong();
      pp.resize(device, 800, 600);

      // Now resize to different dimensions
      const newTextures = [createMockTexture(), createMockTexture()];
      callIdx = 0;
      device.createTexture.mockImplementation(() => newTextures[callIdx++ % 2]);

      pp.resize(device, 1024, 768);

      // Old textures should be destroyed
      expect(textures[0]!.destroy).toHaveBeenCalled();
      expect(textures[1]!.destroy).toHaveBeenCalled();
    });

    it('WGPU-PP-014: defaults to rgba8unorm format', () => {
      const device = createMockDevice();
      const pp = new WebGPUPingPong();
      pp.resize(device, 100, 100);

      expect(pp.format).toBe('rgba8unorm');
    });
  });

  describe('swap', () => {
    it('WGPU-PP-020: alternates source and target views', () => {
      const device = createMockDevice();
      const views = [{}, {}];
      let viewIdx = 0;
      device.createTexture.mockImplementation(() => ({
        createView: vi.fn().mockReturnValue(views[viewIdx++]),
        destroy: vi.fn(),
      }));

      const pp = new WebGPUPingPong();
      pp.resize(device, 100, 100);

      // After resize: writeIndex=0, so target=views[0], source=views[1]
      const target0 = pp.getTarget();
      const source0 = pp.getSource();
      expect(target0).toBe(views[0]);
      expect(source0).toBe(views[1]);

      pp.swap();

      // After swap: writeIndex=1, so target=views[1], source=views[0]
      expect(pp.getTarget()).toBe(views[1]);
      expect(pp.getSource()).toBe(views[0]);

      pp.swap();

      // After second swap: back to original
      expect(pp.getTarget()).toBe(views[0]);
      expect(pp.getSource()).toBe(views[1]);
    });

    it('WGPU-PP-021: resetChain resets to initial write index', () => {
      const device = createMockDevice();
      const views = [{}, {}];
      let viewIdx = 0;
      device.createTexture.mockImplementation(() => ({
        createView: vi.fn().mockReturnValue(views[viewIdx++]),
        destroy: vi.fn(),
      }));

      const pp = new WebGPUPingPong();
      pp.resize(device, 100, 100);

      pp.swap(); // writeIndex = 1
      pp.resetChain(); // writeIndex = 0

      expect(pp.getTarget()).toBe(views[0]);
      expect(pp.getSource()).toBe(views[1]);
    });
  });

  describe('dispose', () => {
    it('WGPU-PP-030: destroys all textures and resets state', () => {
      const device = createMockDevice();
      const textures = [createMockTexture(), createMockTexture()];
      let idx = 0;
      device.createTexture.mockImplementation(() => textures[idx++]);

      const pp = new WebGPUPingPong();
      pp.resize(device, 800, 600, 'rgba16float');

      pp.dispose();

      expect(textures[0]!.destroy).toHaveBeenCalled();
      expect(textures[1]!.destroy).toHaveBeenCalled();
      expect(pp.isAllocated).toBe(false);
      expect(pp.width).toBe(0);
      expect(pp.height).toBe(0);
      expect(pp.format).toBe('rgba8unorm');
    });

    it('WGPU-PP-031: safe to call when not allocated', () => {
      const pp = new WebGPUPingPong();
      expect(() => pp.dispose()).not.toThrow();
    });

    it('WGPU-PP-032: safe to call dispose multiple times', () => {
      const device = createMockDevice();
      const pp = new WebGPUPingPong();
      pp.resize(device, 100, 100);

      pp.dispose();
      expect(() => pp.dispose()).not.toThrow();
    });
  });

  describe('format selection', () => {
    it('WGPU-PP-040: supports rgba8unorm for SDR', () => {
      const device = createMockDevice();
      const pp = new WebGPUPingPong();
      pp.resize(device, 100, 100, 'rgba8unorm');
      expect(pp.format).toBe('rgba8unorm');
    });

    it('WGPU-PP-041: supports rgba16float for HDR', () => {
      const device = createMockDevice();
      const pp = new WebGPUPingPong();
      pp.resize(device, 100, 100, 'rgba16float');
      expect(pp.format).toBe('rgba16float');
    });

    it('WGPU-PP-042: reallocates when format changes', () => {
      const device = createMockDevice();
      const pp = new WebGPUPingPong();
      pp.resize(device, 100, 100, 'rgba8unorm');

      const callsBefore = device.createTexture.mock.calls.length;
      pp.resize(device, 100, 100, 'rgba16float');

      // Should have created 2 new textures
      expect(device.createTexture.mock.calls.length).toBe(callsBefore + 2);
      expect(pp.format).toBe('rgba16float');
    });
  });
});
