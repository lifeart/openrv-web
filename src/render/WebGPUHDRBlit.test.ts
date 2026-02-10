/**
 * WebGPUHDRBlit Unit Tests
 *
 * Tests for the WebGPU-based HDR display output module that accepts
 * Float32Array pixel data and displays it on a WebGPU HDR canvas.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebGPUHDRBlit } from './WebGPUHDRBlit';

// ---------------------------------------------------------------------------
// Mock WebGPU API objects
// ---------------------------------------------------------------------------

interface MockGPUTexture {
  createView: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function createMockGPUTexture(): MockGPUTexture {
  return {
    createView: vi.fn(() => ({}) as unknown),
    destroy: vi.fn(),
  };
}

function createMockGPUDevice(opts: { float32Filterable?: boolean } = {}) {
  const shaderModule = {};
  const bindGroupLayout = {};
  const pipeline = {
    getBindGroupLayout: vi.fn(() => bindGroupLayout),
  };

  const device = {
    createShaderModule: vi.fn(() => shaderModule),
    createRenderPipeline: vi.fn(() => pipeline),
    createSampler: vi.fn(() => ({})),
    createTexture: vi.fn(() => createMockGPUTexture()),
    createBindGroup: vi.fn(() => ({})),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn(() => ({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        draw: vi.fn(),
        end: vi.fn(),
      })),
      finish: vi.fn(() => ({})),
    })),
    queue: {
      writeTexture: vi.fn(),
      submit: vi.fn(),
    },
    destroy: vi.fn(),
  };

  const adapter = {
    features: new Set<string>(opts.float32Filterable ? ['float32-filterable'] : []),
    requestDevice: vi.fn().mockResolvedValue(device),
  };

  return { device, adapter, pipeline };
}

function createMockGPUCanvasContext() {
  return {
    configure: vi.fn(),
    getCurrentTexture: vi.fn(() => createMockGPUTexture()),
    unconfigure: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('WebGPUHDRBlit', () => {
  let originalNavigator: PropertyDescriptor | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore navigator.gpu
    if (originalNavigator) {
      Object.defineProperty(navigator, 'gpu', originalNavigator);
    } else {
      // Remove the 'gpu' property if it was added by tests
      try {
        delete (navigator as unknown as Record<string, unknown>)['gpu'];
      } catch {
        // Cannot delete non-configurable property in some environments
      }
    }
  });

  beforeEach(() => {
    originalNavigator = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  });

  // ====================================================================
  // Constructor
  // ====================================================================
  describe('constructor', () => {
    it('WGPU-BLIT-001: creates a hidden canvas element', () => {
      const blit = new WebGPUHDRBlit();
      const canvas = blit.getCanvas();

      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(canvas.style.display).toBe('none');
    });

    it('WGPU-BLIT-002: initialized is false before initialize()', () => {
      const blit = new WebGPUHDRBlit();
      expect(blit.initialized).toBe(false);
    });

    it('WGPU-BLIT-003: canvas has absolute positioning', () => {
      const blit = new WebGPUHDRBlit();
      const canvas = blit.getCanvas();

      expect(canvas.style.position).toBe('absolute');
      expect(canvas.style.top).toBe('0px');
      expect(canvas.style.left).toBe('0px');
    });
  });

  // ====================================================================
  // initialize
  // ====================================================================
  describe('initialize', () => {
    it('WGPU-BLIT-004: throws when navigator.gpu is unavailable', async () => {
      // navigator.gpu is not defined in jsdom by default
      const blit = new WebGPUHDRBlit();
      await expect(blit.initialize()).rejects.toThrow('WebGPU not available');
      expect(blit.initialized).toBe(false);
    });

    it('WGPU-BLIT-005: throws when adapter is null', async () => {
      const mockGpu = {
        requestAdapter: vi.fn().mockResolvedValue(null),
      };
      Object.defineProperty(navigator, 'gpu', {
        value: mockGpu,
        configurable: true,
        writable: true,
      });

      const blit = new WebGPUHDRBlit();
      await expect(blit.initialize()).rejects.toThrow('WebGPU adapter not available');
      expect(blit.initialized).toBe(false);
    });

    it('WGPU-BLIT-006: throws when webgpu canvas context is unavailable', async () => {
      const { adapter, device } = createMockGPUDevice();
      const mockGpu = {
        requestAdapter: vi.fn().mockResolvedValue(adapter),
      };
      Object.defineProperty(navigator, 'gpu', {
        value: mockGpu,
        configurable: true,
        writable: true,
      });

      const blit = new WebGPUHDRBlit();
      // Mock getContext to return null for 'webgpu'
      vi.spyOn(blit.getCanvas(), 'getContext').mockReturnValue(null);

      await expect(blit.initialize()).rejects.toThrow('WebGPU canvas context not available');
      // Device should be cleaned up
      expect(device.destroy).toHaveBeenCalled();
      expect(blit.initialized).toBe(false);
    });

    it('WGPU-BLIT-007: requests float32-filterable feature when adapter supports it', async () => {
      const { adapter } = createMockGPUDevice({ float32Filterable: true });
      const gpuCtx = createMockGPUCanvasContext();
      const mockGpu = {
        requestAdapter: vi.fn().mockResolvedValue(adapter),
      };
      Object.defineProperty(navigator, 'gpu', {
        value: mockGpu,
        configurable: true,
        writable: true,
      });

      const blit = new WebGPUHDRBlit();
      vi.spyOn(blit.getCanvas(), 'getContext').mockReturnValue(gpuCtx as unknown as RenderingContext);

      await blit.initialize();

      expect(adapter.requestDevice).toHaveBeenCalledWith({
        requiredFeatures: ['float32-filterable'],
      });
    });

    it('WGPU-BLIT-008: requests device without features when float32-filterable unavailable', async () => {
      const { adapter } = createMockGPUDevice({ float32Filterable: false });
      const gpuCtx = createMockGPUCanvasContext();
      const mockGpu = {
        requestAdapter: vi.fn().mockResolvedValue(adapter),
      };
      Object.defineProperty(navigator, 'gpu', {
        value: mockGpu,
        configurable: true,
        writable: true,
      });

      const blit = new WebGPUHDRBlit();
      vi.spyOn(blit.getCanvas(), 'getContext').mockReturnValue(gpuCtx as unknown as RenderingContext);

      await blit.initialize();

      expect(adapter.requestDevice).toHaveBeenCalledWith(undefined);
    });

    it('WGPU-BLIT-009: uses linear sampler when float32-filterable available', async () => {
      const { adapter, device } = createMockGPUDevice({ float32Filterable: true });
      const gpuCtx = createMockGPUCanvasContext();
      const mockGpu = {
        requestAdapter: vi.fn().mockResolvedValue(adapter),
      };
      Object.defineProperty(navigator, 'gpu', {
        value: mockGpu,
        configurable: true,
        writable: true,
      });

      const blit = new WebGPUHDRBlit();
      vi.spyOn(blit.getCanvas(), 'getContext').mockReturnValue(gpuCtx as unknown as RenderingContext);

      await blit.initialize();

      expect(device.createSampler).toHaveBeenCalledWith({
        magFilter: 'linear',
        minFilter: 'linear',
      });
    });

    it('WGPU-BLIT-010: uses nearest sampler when float32-filterable unavailable', async () => {
      const { adapter, device } = createMockGPUDevice({ float32Filterable: false });
      const gpuCtx = createMockGPUCanvasContext();
      const mockGpu = {
        requestAdapter: vi.fn().mockResolvedValue(adapter),
      };
      Object.defineProperty(navigator, 'gpu', {
        value: mockGpu,
        configurable: true,
        writable: true,
      });

      const blit = new WebGPUHDRBlit();
      vi.spyOn(blit.getCanvas(), 'getContext').mockReturnValue(gpuCtx as unknown as RenderingContext);

      await blit.initialize();

      expect(device.createSampler).toHaveBeenCalledWith({
        magFilter: 'nearest',
        minFilter: 'nearest',
      });
    });

    it('WGPU-BLIT-011: configures context with rgba16float and extended tone mapping', async () => {
      const { adapter } = createMockGPUDevice();
      const gpuCtx = createMockGPUCanvasContext();
      const mockGpu = {
        requestAdapter: vi.fn().mockResolvedValue(adapter),
      };
      Object.defineProperty(navigator, 'gpu', {
        value: mockGpu,
        configurable: true,
        writable: true,
      });

      const blit = new WebGPUHDRBlit();
      vi.spyOn(blit.getCanvas(), 'getContext').mockReturnValue(gpuCtx as unknown as RenderingContext);

      await blit.initialize();

      expect(gpuCtx.configure).toHaveBeenCalledWith(expect.objectContaining({
        format: 'rgba16float',
        toneMapping: { mode: 'extended' },
        alphaMode: 'opaque',
      }));
    });

    it('WGPU-BLIT-012: sets initialized to true on success', async () => {
      const { adapter } = createMockGPUDevice();
      const gpuCtx = createMockGPUCanvasContext();
      const mockGpu = {
        requestAdapter: vi.fn().mockResolvedValue(adapter),
      };
      Object.defineProperty(navigator, 'gpu', {
        value: mockGpu,
        configurable: true,
        writable: true,
      });

      const blit = new WebGPUHDRBlit();
      vi.spyOn(blit.getCanvas(), 'getContext').mockReturnValue(gpuCtx as unknown as RenderingContext);

      await blit.initialize();

      expect(blit.initialized).toBe(true);
    });

    it('WGPU-BLIT-013: is idempotent — second call is a no-op', async () => {
      const { adapter } = createMockGPUDevice();
      const gpuCtx = createMockGPUCanvasContext();
      const mockGpu = {
        requestAdapter: vi.fn().mockResolvedValue(adapter),
      };
      Object.defineProperty(navigator, 'gpu', {
        value: mockGpu,
        configurable: true,
        writable: true,
      });

      const blit = new WebGPUHDRBlit();
      vi.spyOn(blit.getCanvas(), 'getContext').mockReturnValue(gpuCtx as unknown as RenderingContext);

      await blit.initialize();
      await blit.initialize(); // second call

      // requestAdapter should only be called once
      expect(mockGpu.requestAdapter).toHaveBeenCalledTimes(1);
    });

    it('WGPU-BLIT-014: creates render pipeline with correct shader targets', async () => {
      const { adapter, device } = createMockGPUDevice();
      const gpuCtx = createMockGPUCanvasContext();
      const mockGpu = {
        requestAdapter: vi.fn().mockResolvedValue(adapter),
      };
      Object.defineProperty(navigator, 'gpu', {
        value: mockGpu,
        configurable: true,
        writable: true,
      });

      const blit = new WebGPUHDRBlit();
      vi.spyOn(blit.getCanvas(), 'getContext').mockReturnValue(gpuCtx as unknown as RenderingContext);

      await blit.initialize();

      expect(device.createRenderPipeline).toHaveBeenCalledWith(expect.objectContaining({
        layout: 'auto',
        fragment: expect.objectContaining({
          targets: [{ format: 'rgba16float' }],
        }),
        primitive: { topology: 'triangle-list' },
      }));
    });
  });

  // ====================================================================
  // uploadAndDisplay
  // ====================================================================
  describe('uploadAndDisplay', () => {
    let blit: WebGPUHDRBlit;
    let device: ReturnType<typeof createMockGPUDevice>['device'];
    let gpuCtx: ReturnType<typeof createMockGPUCanvasContext>;

    async function initBlit(opts?: { float32Filterable?: boolean }) {
      const mock = createMockGPUDevice(opts);
      device = mock.device;
      gpuCtx = createMockGPUCanvasContext();
      const mockGpu = {
        requestAdapter: vi.fn().mockResolvedValue(mock.adapter),
      };
      Object.defineProperty(navigator, 'gpu', {
        value: mockGpu,
        configurable: true,
        writable: true,
      });

      blit = new WebGPUHDRBlit();
      vi.spyOn(blit.getCanvas(), 'getContext').mockReturnValue(gpuCtx as unknown as RenderingContext);
      await blit.initialize();
    }

    it('WGPU-BLIT-020: is a no-op when not initialized', () => {
      const uninitBlit = new WebGPUHDRBlit();
      const pixels = new Float32Array(4 * 4 * 4); // 4x4 RGBA

      // Should not throw
      expect(() => uninitBlit.uploadAndDisplay(pixels, 4, 4)).not.toThrow();
    });

    it('WGPU-BLIT-021: resizes canvas when dimensions change', async () => {
      await initBlit();

      const pixels = new Float32Array(10 * 8 * 4);
      blit.uploadAndDisplay(pixels, 10, 8);

      expect(blit.getCanvas().width).toBe(10);
      expect(blit.getCanvas().height).toBe(8);
    });

    it('WGPU-BLIT-022: creates GPU texture with rgba32float format', async () => {
      await initBlit();

      const pixels = new Float32Array(16 * 16 * 4);
      blit.uploadAndDisplay(pixels, 16, 16);

      expect(device.createTexture).toHaveBeenCalledWith(expect.objectContaining({
        size: { width: 16, height: 16 },
        format: 'rgba32float',
      }));
    });

    it('WGPU-BLIT-023: calls writeTexture with correct bytesPerRow', async () => {
      await initBlit();

      const width = 20;
      const height = 10;
      const pixels = new Float32Array(width * height * 4);
      blit.uploadAndDisplay(pixels, width, height);

      expect(device.queue.writeTexture).toHaveBeenCalledWith(
        expect.anything(), // dest
        pixels,            // data
        { bytesPerRow: width * 4 * 4, rowsPerImage: height }, // 4 channels * 4 bytes/float
        { width, height },
      );
    });

    it('WGPU-BLIT-024: executes full render pass and submits', async () => {
      await initBlit();

      const pixels = new Float32Array(4 * 4 * 4);
      blit.uploadAndDisplay(pixels, 4, 4);

      expect(device.queue.submit).toHaveBeenCalledTimes(1);
      expect(gpuCtx.getCurrentTexture).toHaveBeenCalledTimes(1);
    });

    it('WGPU-BLIT-025: reuses texture when dimensions unchanged', async () => {
      await initBlit();

      const pixels = new Float32Array(8 * 8 * 4);
      blit.uploadAndDisplay(pixels, 8, 8);
      blit.uploadAndDisplay(pixels, 8, 8);

      // createTexture called only once for the first upload
      expect(device.createTexture).toHaveBeenCalledTimes(1);
    });

    it('WGPU-BLIT-026: recreates texture when dimensions change', async () => {
      await initBlit();

      const pixels1 = new Float32Array(8 * 8 * 4);
      blit.uploadAndDisplay(pixels1, 8, 8);

      const pixels2 = new Float32Array(16 * 16 * 4);
      blit.uploadAndDisplay(pixels2, 16, 16);

      // createTexture called twice: once for 8x8, once for 16x16
      expect(device.createTexture).toHaveBeenCalledTimes(2);
    });

    it('WGPU-BLIT-027: destroys old texture when recreating', async () => {
      await initBlit();

      // Track the first texture created
      const firstTexture = createMockGPUTexture();
      const secondTexture = createMockGPUTexture();
      let callCount = 0;
      device.createTexture = vi.fn(() => {
        callCount++;
        return callCount === 1 ? firstTexture : secondTexture;
      });

      const pixels1 = new Float32Array(8 * 8 * 4);
      blit.uploadAndDisplay(pixels1, 8, 8);

      const pixels2 = new Float32Array(16 * 16 * 4);
      blit.uploadAndDisplay(pixels2, 16, 16);

      expect(firstTexture.destroy).toHaveBeenCalled();
    });

    it('WGPU-BLIT-028: creates bind group with sampler and texture view', async () => {
      await initBlit();

      const pixels = new Float32Array(4 * 4 * 4);
      blit.uploadAndDisplay(pixels, 4, 4);

      expect(device.createBindGroup).toHaveBeenCalledWith(expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({ binding: 0 }), // sampler
          expect.objectContaining({ binding: 1 }), // texture view
        ]),
      }));
    });

    it('WGPU-BLIT-029: draws 3 vertices (fullscreen triangle)', async () => {
      await initBlit();

      const pixels = new Float32Array(4 * 4 * 4);
      blit.uploadAndDisplay(pixels, 4, 4);

      // Get the render pass mock from the command encoder
      const encoder = device.createCommandEncoder.mock.results[0]!.value;
      const pass = encoder.beginRenderPass.mock.results[0]!.value;
      expect(pass.draw).toHaveBeenCalledWith(3);
    });
  });

  // ====================================================================
  // dispose
  // ====================================================================
  describe('dispose', () => {
    async function createInitializedBlit() {
      const mock = createMockGPUDevice();
      const gpuCtx = createMockGPUCanvasContext();
      const mockGpu = {
        requestAdapter: vi.fn().mockResolvedValue(mock.adapter),
      };
      Object.defineProperty(navigator, 'gpu', {
        value: mockGpu,
        configurable: true,
        writable: true,
      });

      const blit = new WebGPUHDRBlit();
      vi.spyOn(blit.getCanvas(), 'getContext').mockReturnValue(gpuCtx as unknown as RenderingContext);
      await blit.initialize();

      return { blit, device: mock.device, gpuCtx };
    }

    it('WGPU-BLIT-030: resets initialized to false', async () => {
      const { blit } = await createInitializedBlit();

      expect(blit.initialized).toBe(true);
      blit.dispose();
      expect(blit.initialized).toBe(false);
    });

    it('WGPU-BLIT-031: destroys the GPU device', async () => {
      const { blit, device } = await createInitializedBlit();

      blit.dispose();
      expect(device.destroy).toHaveBeenCalled();
    });

    it('WGPU-BLIT-032: calls unconfigure on the GPU context', async () => {
      const { blit, gpuCtx } = await createInitializedBlit();

      blit.dispose();
      expect(gpuCtx.unconfigure).toHaveBeenCalled();
    });

    it('WGPU-BLIT-033: handles unconfigure() throwing gracefully', async () => {
      const { blit, gpuCtx } = await createInitializedBlit();

      gpuCtx.unconfigure.mockImplementation(() => {
        throw new Error('context lost');
      });

      expect(() => blit.dispose()).not.toThrow();
    });

    it('WGPU-BLIT-034: removes canvas from DOM', async () => {
      const { blit } = await createInitializedBlit();

      const container = document.createElement('div');
      container.appendChild(blit.getCanvas());
      expect(blit.getCanvas().parentNode).toBe(container);

      blit.dispose();
      expect(blit.getCanvas().parentNode).toBeNull();
    });

    it('WGPU-BLIT-035: destroys source texture if it was created', async () => {
      const { blit, device } = await createInitializedBlit();

      // Create a texture by uploading pixels
      const texture = createMockGPUTexture();
      device.createTexture = vi.fn(() => texture);
      const pixels = new Float32Array(4 * 4 * 4);
      blit.uploadAndDisplay(pixels, 4, 4);

      blit.dispose();
      expect(texture.destroy).toHaveBeenCalled();
    });

    it('WGPU-BLIT-036: is safe to call multiple times', async () => {
      const { blit } = await createInitializedBlit();

      expect(() => {
        blit.dispose();
        blit.dispose();
      }).not.toThrow();
    });

    it('WGPU-BLIT-037: uploadAndDisplay is a no-op after dispose', async () => {
      const { blit } = await createInitializedBlit();

      blit.dispose();

      const pixels = new Float32Array(4 * 4 * 4);
      expect(() => blit.uploadAndDisplay(pixels, 4, 4)).not.toThrow();
      // queue.submit should not be called after dispose
      // (device.queue might be null, but the method should return early)
    });
  });
});
