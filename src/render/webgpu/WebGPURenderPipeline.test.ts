import { describe, it, expect, vi } from 'vitest';
import { WebGPURenderPipelineManager } from './WebGPURenderPipeline';

function createMockBindGroupLayout() {
  return {};
}

function createMockPipeline() {
  return {
    getBindGroupLayout: vi.fn().mockReturnValue(createMockBindGroupLayout()),
  };
}

function createMockBuffer() {
  return {
    getMappedRange: vi.fn().mockReturnValue(new ArrayBuffer(16)),
    unmap: vi.fn(),
    destroy: vi.fn(),
  };
}

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
  const pipeline = createMockPipeline();
  const buffer = createMockBuffer();
  return {
    createShaderModule: vi.fn().mockReturnValue({}),
    createRenderPipeline: vi.fn().mockReturnValue(pipeline),
    createSampler: vi.fn().mockReturnValue({}),
    createTexture: vi.fn().mockReturnValue(createMockTexture()),
    createBindGroup: vi.fn().mockReturnValue({}),
    createBuffer: vi.fn().mockReturnValue(buffer),
    createCommandEncoder: vi.fn(),
    queue: {
      writeTexture: vi.fn(),
      writeBuffer: vi.fn(),
      submit: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
    },
    destroy: vi.fn(),
    _pipeline: pipeline,
    _buffer: buffer,
  };
}

describe('WebGPURenderPipelineManager', () => {
  describe('initialize', () => {
    it('WGPU-PIPE-001: creates shader module and pipeline', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.initialize(device);

      expect(device.createShaderModule).toHaveBeenCalledWith(expect.objectContaining({ code: expect.any(String) }));
      expect(device.createRenderPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          layout: 'auto',
          vertex: expect.objectContaining({ entryPoint: 'vs' }),
          fragment: expect.objectContaining({
            entryPoint: 'fs',
            targets: [{ format: 'rgba16float' }],
          }),
        }),
      );
    });

    it('WGPU-PIPE-002: creates uniform buffer (16 bytes)', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.initialize(device);

      expect(device.createBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          size: 16,
        }),
      );
    });

    it('WGPU-PIPE-003: creates sampler with specified filter mode', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.initialize(device, 'nearest');

      expect(device.createSampler).toHaveBeenCalledWith({
        magFilter: 'nearest',
        minFilter: 'nearest',
      });
    });

    it('WGPU-PIPE-004: defaults to linear filter', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.initialize(device);

      expect(device.createSampler).toHaveBeenCalledWith({
        magFilter: 'linear',
        minFilter: 'linear',
      });
    });

    it('WGPU-PIPE-005: creates uniform bind group (group 1)', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.initialize(device);

      // getBindGroupLayout(1) called for uniform group
      expect(device._pipeline.getBindGroupLayout).toHaveBeenCalledWith(1);
      expect(manager.renderPipeline).not.toBeNull();
      expect(manager.uniforms).not.toBeNull();
    });
  });

  describe('updateUniforms', () => {
    it('WGPU-PIPE-010: writes offset and scale to uniform buffer', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.initialize(device);

      manager.updateUniforms(device, 0.5, -0.3, 2.0, 1.5);

      expect(device.queue.writeBuffer).toHaveBeenCalledWith(device._buffer, 0, expect.any(Float32Array));

      const data = device.queue.writeBuffer.mock.calls[0]![2] as Float32Array;
      expect(data[0]).toBeCloseTo(0.5);
      expect(data[1]).toBeCloseTo(-0.3);
      expect(data[2]).toBeCloseTo(2.0);
      expect(data[3]).toBeCloseTo(1.5);
    });

    it('WGPU-PIPE-011: no-op when not initialized', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.updateUniforms(device, 0, 0, 1, 1);
      expect(device.queue.writeBuffer).not.toHaveBeenCalled();
    });
  });

  describe('uploadImageTexture', () => {
    it('WGPU-PIPE-020: uploads SDR data as rgba8unorm', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.initialize(device);

      const data = new Uint8Array(100 * 100 * 4);
      const texture = manager.uploadImageTexture(device, data, 100, 100, false);

      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          size: { width: 100, height: 100 },
          format: 'rgba8unorm',
        }),
      );
      expect(device.queue.writeTexture).toHaveBeenCalledWith(
        expect.objectContaining({ texture }),
        data,
        { bytesPerRow: 400, rowsPerImage: 100 },
        { width: 100, height: 100 },
      );
    });

    it('WGPU-PIPE-021: uploads HDR data as rgba32float', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.initialize(device);

      const data = new Float32Array(50 * 50 * 4);
      manager.uploadImageTexture(device, data, 50, 50, true);

      expect(device.createTexture).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'rgba32float',
        }),
      );
      expect(device.queue.writeTexture).toHaveBeenCalledWith(
        expect.anything(),
        data,
        { bytesPerRow: 800, rowsPerImage: 50 }, // 50 * 4 * 4
        { width: 50, height: 50 },
      );
    });
  });

  describe('uploadExternalTexture', () => {
    it('WGPU-PIPE-025: copies external image to texture', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.initialize(device);

      const source = {} as ImageBitmap;
      manager.uploadExternalTexture(device, source, 200, 150);

      expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
        { source },
        expect.objectContaining({ texture: expect.anything() }),
        { width: 200, height: 150 },
      );
    });
  });

  describe('getTextureBindGroup', () => {
    it('WGPU-PIPE-030: creates bind group for texture view', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.initialize(device);

      const textureView = createMockTextureView();
      const bindGroup = manager.getTextureBindGroup(device, textureView);

      expect(bindGroup).not.toBeNull();
      expect(device._pipeline.getBindGroupLayout).toHaveBeenCalledWith(0);
    });

    it('WGPU-PIPE-031: caches bind group for same texture view', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.initialize(device);

      const textureView = createMockTextureView();
      const bg1 = manager.getTextureBindGroup(device, textureView);
      const initialCallCount = device.createBindGroup.mock.calls.length;
      const bg2 = manager.getTextureBindGroup(device, textureView);

      expect(bg1).toBe(bg2);
      expect(device.createBindGroup.mock.calls.length).toBe(initialCallCount);
    });

    it('WGPU-PIPE-032: creates new bind group for different texture view', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.initialize(device);

      const view1 = createMockTextureView();
      const view2 = createMockTextureView();
      manager.getTextureBindGroup(device, view1);
      const countAfterFirst = device.createBindGroup.mock.calls.length;
      manager.getTextureBindGroup(device, view2);

      expect(device.createBindGroup.mock.calls.length).toBe(countAfterFirst + 1);
    });
  });

  describe('dispose', () => {
    it('WGPU-PIPE-040: destroys uniform buffer', () => {
      const device = createMockDevice();
      const manager = new WebGPURenderPipelineManager();
      manager.initialize(device);

      manager.dispose();
      expect(device._buffer.destroy).toHaveBeenCalled();
      expect(manager.renderPipeline).toBeNull();
      expect(manager.uniforms).toBeNull();
    });

    it('WGPU-PIPE-041: does not throw when not initialized', () => {
      const manager = new WebGPURenderPipelineManager();
      expect(() => manager.dispose()).not.toThrow();
    });
  });
});
