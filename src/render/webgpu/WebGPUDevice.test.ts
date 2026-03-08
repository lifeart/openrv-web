import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WebGPUDeviceWrapper } from './WebGPUDevice';

function createMockGPUContext() {
  return {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(),
  };
}

function createMockDevice() {
  return {
    createShaderModule: vi.fn(),
    createRenderPipeline: vi.fn(),
    createSampler: vi.fn(),
    createTexture: vi.fn(),
    createBindGroup: vi.fn(),
    createBuffer: vi.fn(),
    createCommandEncoder: vi.fn(),
    queue: { writeTexture: vi.fn(), writeBuffer: vi.fn(), submit: vi.fn(), copyExternalImageToTexture: vi.fn() },
    destroy: vi.fn(),
  };
}

function createMockAdapter(device = createMockDevice(), features = new Set<string>()) {
  return {
    features,
    requestDevice: vi.fn().mockResolvedValue(device),
  };
}

function setupNavigatorGPU(adapter = createMockAdapter()) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { gpu: { requestAdapter: vi.fn().mockResolvedValue(adapter) } },
    writable: true,
    configurable: true,
  });
}

function createWebGPUCanvas(gpuCtx = createMockGPUContext()) {
  const canvas = document.createElement('canvas');
  const origGetContext = canvas.getContext.bind(canvas);
  canvas.getContext = vi.fn((id: string, ...args: unknown[]) => {
    if (id === 'webgpu') return gpuCtx as unknown as RenderingContext;
    return origGetContext(id, ...args);
  }) as typeof canvas.getContext;
  return canvas;
}

describe('WebGPUDeviceWrapper', () => {
  let savedNavigator: unknown;

  beforeEach(() => {
    savedNavigator = globalThis.navigator;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: savedNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe('initializeSync', () => {
    it('WGPU-DEV-001: throws when navigator.gpu is not available', () => {
      Object.defineProperty(globalThis, 'navigator', { value: {}, writable: true, configurable: true });
      const wrapper = new WebGPUDeviceWrapper();
      expect(() => wrapper.initializeSync(document.createElement('canvas'))).toThrow('WebGPU is not available');
    });

    it('WGPU-DEV-002: throws when webgpu context not available', () => {
      setupNavigatorGPU();
      const wrapper = new WebGPUDeviceWrapper();
      expect(() => wrapper.initializeSync(document.createElement('canvas'))).toThrow(
        'WebGPU canvas context not available',
      );
    });

    it('WGPU-DEV-003: succeeds with valid webgpu canvas', () => {
      setupNavigatorGPU();
      const wrapper = new WebGPUDeviceWrapper();
      expect(() => wrapper.initializeSync(createWebGPUCanvas())).not.toThrow();
      expect(wrapper.context).not.toBeNull();
    });
  });

  describe('initializeAsync', () => {
    it('WGPU-DEV-004: throws if initializeSync was not called', async () => {
      const wrapper = new WebGPUDeviceWrapper();
      await expect(wrapper.initializeAsync()).rejects.toThrow('initializeSync() must be called first');
    });

    it('WGPU-DEV-005: throws if adapter is null', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { gpu: { requestAdapter: vi.fn().mockResolvedValue(null) } },
        writable: true,
        configurable: true,
      });
      const wrapper = new WebGPUDeviceWrapper();
      wrapper.initializeSync(createWebGPUCanvas());
      await expect(wrapper.initializeAsync()).rejects.toThrow('WebGPU adapter not available');
    });

    it('WGPU-DEV-006: sets device and configures canvas on success', async () => {
      const gpuCtx = createMockGPUContext();
      const device = createMockDevice();
      setupNavigatorGPU(createMockAdapter(device));
      const wrapper = new WebGPUDeviceWrapper();
      wrapper.initializeSync(createWebGPUCanvas(gpuCtx));
      await wrapper.initializeAsync();

      expect(wrapper.device).toBe(device);
      expect(wrapper.extendedToneMapping).toBe(true);
      expect(gpuCtx.configure).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'rgba16float', toneMapping: { mode: 'extended' } }),
      );
    });

    it('WGPU-DEV-007: detects float32-filterable feature', async () => {
      const device = createMockDevice();
      const features = new Set(['float32-filterable']);
      setupNavigatorGPU(createMockAdapter(device, features));
      const wrapper = new WebGPUDeviceWrapper();
      wrapper.initializeSync(createWebGPUCanvas());
      await wrapper.initializeAsync();

      expect(wrapper.hasFloat32Filterable).toBe(true);
    });

    it('WGPU-DEV-008: falls back to standard tone mapping', async () => {
      const gpuCtx = createMockGPUContext();
      gpuCtx.configure.mockImplementation((config: { toneMapping?: { mode: string } }) => {
        if (config.toneMapping?.mode === 'extended') {
          throw new Error('not supported');
        }
      });
      setupNavigatorGPU();
      const wrapper = new WebGPUDeviceWrapper();
      wrapper.initializeSync(createWebGPUCanvas(gpuCtx));
      await wrapper.initializeAsync();

      expect(wrapper.extendedToneMapping).toBe(false);
      expect(gpuCtx.configure).toHaveBeenCalledTimes(2);
    });
  });

  describe('dispose', () => {
    it('WGPU-DEV-009: cleans up device and context', async () => {
      const gpuCtx = createMockGPUContext();
      const device = createMockDevice();
      setupNavigatorGPU(createMockAdapter(device));
      const wrapper = new WebGPUDeviceWrapper();
      wrapper.initializeSync(createWebGPUCanvas(gpuCtx));
      await wrapper.initializeAsync();

      wrapper.dispose();
      expect(device.destroy).toHaveBeenCalled();
      expect(gpuCtx.unconfigure).toHaveBeenCalled();
      expect(wrapper.device).toBeNull();
      expect(wrapper.context).toBeNull();
    });

    it('WGPU-DEV-010: does not throw when called without initialization', () => {
      const wrapper = new WebGPUDeviceWrapper();
      expect(() => wrapper.dispose()).not.toThrow();
    });

    it('WGPU-DEV-011: handles unconfigure throwing', async () => {
      const gpuCtx = createMockGPUContext();
      gpuCtx.unconfigure.mockImplementation(() => {
        throw new Error('lost');
      });
      setupNavigatorGPU();
      const wrapper = new WebGPUDeviceWrapper();
      wrapper.initializeSync(createWebGPUCanvas(gpuCtx));
      await wrapper.initializeAsync();

      expect(() => wrapper.dispose()).not.toThrow();
    });
  });
});
