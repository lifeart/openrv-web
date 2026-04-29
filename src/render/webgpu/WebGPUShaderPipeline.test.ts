import { describe, it, expect, vi } from 'vitest';
import { WebGPUShaderPipeline } from './WebGPUShaderPipeline';
import type { WebGPUStageDescriptor } from './WebGPUShaderPipeline';
import { createDefaultInternalState } from '../ShaderStateTypes';
import type { InternalShaderState } from '../ShaderStateTypes';
import type { StageId } from '../ShaderStage';

// ---------------------------------------------------------------------------
// Mock helpers (same pattern as WebGPURenderPipeline.test.ts)
// ---------------------------------------------------------------------------

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

function createMockRenderPassEncoder() {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    end: vi.fn(),
  };
}

function createMockCommandEncoder() {
  const passEncoder = createMockRenderPassEncoder();
  return {
    beginRenderPass: vi.fn().mockReturnValue(passEncoder),
    finish: vi.fn().mockReturnValue({}),
    _passEncoder: passEncoder,
  };
}

function createMockDevice() {
  const pipeline = createMockPipeline();
  const buffer = createMockBuffer();
  const encoder = createMockCommandEncoder();
  return {
    createShaderModule: vi.fn().mockReturnValue({}),
    createRenderPipeline: vi.fn().mockReturnValue(pipeline),
    createSampler: vi.fn().mockReturnValue({}),
    createTexture: vi.fn().mockImplementation(() => createMockTexture()),
    createBindGroup: vi.fn().mockReturnValue({}),
    createBuffer: vi.fn().mockReturnValue(buffer),
    createCommandEncoder: vi.fn().mockReturnValue(encoder),
    queue: {
      writeTexture: vi.fn(),
      writeBuffer: vi.fn(),
      submit: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
    },
    destroy: vi.fn(),
    _pipeline: pipeline,
    _buffer: buffer,
    _encoder: encoder,
  };
}

// ---------------------------------------------------------------------------
// Stage factory helpers
// ---------------------------------------------------------------------------

function createStage(
  id: StageId,
  isIdentityFn: (state: Readonly<InternalShaderState>) => boolean = () => true,
  opts?: Partial<WebGPUStageDescriptor>,
): WebGPUStageDescriptor {
  return {
    id,
    name: id,
    wgslSource: `@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f { return vec4f(1.0); }`,
    isIdentity: isIdentityFn,
    needsBilinearInput: false,
    ...opts,
  };
}

function createAlwaysActiveStage(id: StageId, opts?: Partial<WebGPUStageDescriptor>): WebGPUStageDescriptor {
  return createStage(id, () => false, opts);
}

function createAlwaysIdentityStage(id: StageId): WebGPUStageDescriptor {
  return createStage(id, () => true);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebGPUShaderPipeline', () => {
  describe('stage registration', () => {
    it('WGPU-SP-001: registers a stage', () => {
      const pipeline = new WebGPUShaderPipeline();
      const stage = createStage('primaryGrade');
      pipeline.registerStage(stage);

      expect(pipeline.getStages()).toHaveLength(1);
      expect(pipeline.getStages()[0]!.id).toBe('primaryGrade');
    });

    it('WGPU-SP-002: replaces stage with same id', () => {
      const pipeline = new WebGPUShaderPipeline();
      pipeline.registerStage(createStage('primaryGrade'));
      pipeline.registerStage(createStage('primaryGrade', () => false));

      expect(pipeline.getStages()).toHaveLength(1);
    });

    it('WGPU-SP-003: sorts stages by stageOrder', () => {
      const pipeline = new WebGPUShaderPipeline();
      pipeline.registerStage(createStage('displayOutput'));
      pipeline.registerStage(createStage('inputDecode'));
      pipeline.registerStage(createStage('primaryGrade'));

      const ids = pipeline.getStages().map((s) => s.id);
      expect(ids).toEqual(['inputDecode', 'primaryGrade', 'displayOutput']);
    });
  });

  describe('stage order', () => {
    it('WGPU-SP-010: has 11 stages in default order', () => {
      const pipeline = new WebGPUShaderPipeline();
      const order = pipeline.getStageOrder();
      expect(order).toHaveLength(11);
      expect(order[0]).toBe('inputDecode');
      expect(order[10]).toBe('compositing');
    });

    it('WGPU-SP-011: setStageOrder validates no duplicates', () => {
      const pipeline = new WebGPUShaderPipeline();
      const result = pipeline.setStageOrder(['inputDecode', 'inputDecode'] as StageId[]);
      expect(result).toBe(false);
    });

    it('WGPU-SP-012: setStageOrder validates all registered stages present', () => {
      const pipeline = new WebGPUShaderPipeline();
      pipeline.registerStage(createStage('primaryGrade'));
      pipeline.registerStage(createStage('displayOutput'));

      // Missing 'displayOutput'
      const result = pipeline.setStageOrder(['primaryGrade'] as StageId[]);
      expect(result).toBe(false);
    });

    it('WGPU-SP-013: setStageOrder succeeds with valid order', () => {
      const pipeline = new WebGPUShaderPipeline();
      pipeline.registerStage(createStage('primaryGrade'));
      pipeline.registerStage(createStage('displayOutput'));

      const result = pipeline.setStageOrder(['displayOutput', 'primaryGrade']);
      expect(result).toBe(true);

      // Stages should be re-sorted
      const ids = pipeline.getStages().map((s) => s.id);
      expect(ids).toEqual(['displayOutput', 'primaryGrade']);
    });
  });

  describe('countActiveStages', () => {
    it('WGPU-SP-020: returns 0 when all stages are identity', () => {
      const pipeline = new WebGPUShaderPipeline();
      pipeline.registerStage(createAlwaysIdentityStage('primaryGrade'));
      pipeline.registerStage(createAlwaysIdentityStage('displayOutput'));

      const state = createDefaultInternalState();
      expect(pipeline.countActiveStages(state)).toBe(0);
    });

    it('WGPU-SP-021: returns correct count for active stages', () => {
      const pipeline = new WebGPUShaderPipeline();
      pipeline.registerStage(createAlwaysActiveStage('primaryGrade'));
      pipeline.registerStage(createAlwaysIdentityStage('secondaryGrade'));
      pipeline.registerStage(createAlwaysActiveStage('displayOutput'));

      const state = createDefaultInternalState();
      expect(pipeline.countActiveStages(state)).toBe(2);
    });

    it('WGPU-SP-022: returns 0 when no stages registered', () => {
      const pipeline = new WebGPUShaderPipeline();
      const state = createDefaultInternalState();
      expect(pipeline.countActiveStages(state)).toBe(0);
    });
  });

  describe('getActiveStages', () => {
    it('WGPU-SP-025: returns only non-identity stages', () => {
      const pipeline = new WebGPUShaderPipeline();
      pipeline.registerStage(createAlwaysActiveStage('primaryGrade'));
      pipeline.registerStage(createAlwaysIdentityStage('secondaryGrade'));
      pipeline.registerStage(createAlwaysActiveStage('displayOutput'));

      const state = createDefaultInternalState();
      const active = pipeline.getActiveStages(state);
      expect(active).toHaveLength(2);
      expect(active[0]!.id).toBe('primaryGrade');
      expect(active[1]!.id).toBe('displayOutput');
    });
  });

  describe('execute path selection', () => {
    it('WGPU-SP-030: 0 active stages uses passthrough blit', () => {
      const device = createMockDevice();
      const pipeline = new WebGPUShaderPipeline();
      pipeline.initializeSharedResources(device);
      pipeline.registerStage(createAlwaysIdentityStage('primaryGrade'));

      const state = createDefaultInternalState();
      const inputView = createMockTextureView();
      const outputView = createMockTextureView();

      pipeline.execute(device, inputView, outputView, state, 800, 600);

      // Should have created passthrough pipeline and submitted
      expect(device.createShaderModule).toHaveBeenCalled();
      expect(device.createRenderPipeline).toHaveBeenCalled();
      expect(device.queue.submit).toHaveBeenCalled();
    });

    it('WGPU-SP-031: 1 active stage uses single-pass rendering', () => {
      const device = createMockDevice();
      const pipeline = new WebGPUShaderPipeline();
      pipeline.initializeSharedResources(device);
      pipeline.registerStage(createAlwaysActiveStage('primaryGrade'));
      pipeline.registerStage(createAlwaysIdentityStage('displayOutput'));

      const state = createDefaultInternalState();
      const inputView = createMockTextureView();
      const outputView = createMockTextureView();

      pipeline.execute(device, inputView, outputView, state, 800, 600);

      // Should submit exactly once (single pass)
      expect(device.queue.submit).toHaveBeenCalledTimes(1);
    });

    it('WGPU-SP-032: N active stages uses multi-pass with ping-pong', () => {
      const device = createMockDevice();
      const pipeline = new WebGPUShaderPipeline();
      pipeline.initializeSharedResources(device);
      pipeline.registerStage(createAlwaysActiveStage('primaryGrade'));
      pipeline.registerStage(createAlwaysActiveStage('secondaryGrade'));
      pipeline.registerStage(createAlwaysActiveStage('displayOutput'));

      const state = createDefaultInternalState();
      const inputView = createMockTextureView();
      const outputView = createMockTextureView();

      pipeline.execute(device, inputView, outputView, state, 800, 600);

      // 3 active stages = 3 render passes submitted
      expect(device.queue.submit).toHaveBeenCalledTimes(3);
      // Ping-pong textures should be created (2 textures)
      expect(device.createTexture).toHaveBeenCalled();
    });

    it('WGPU-SP-033: multi-pass allocates ping-pong with HDR format when isHDR=true', () => {
      const device = createMockDevice();
      const pipeline = new WebGPUShaderPipeline();
      pipeline.initializeSharedResources(device);
      pipeline.registerStage(createAlwaysActiveStage('primaryGrade'));
      pipeline.registerStage(createAlwaysActiveStage('displayOutput'));

      const state = createDefaultInternalState();
      const inputView = createMockTextureView();
      const outputView = createMockTextureView();

      pipeline.execute(device, inputView, outputView, state, 800, 600, true);

      // Ping-pong textures should use rgba16float
      expect(device.createTexture).toHaveBeenCalledWith(expect.objectContaining({ format: 'rgba16float' }));
    });

    it('WGPU-SP-034: multi-pass allocates ping-pong with SDR format when isHDR=false', () => {
      const device = createMockDevice();
      const pipeline = new WebGPUShaderPipeline();
      pipeline.initializeSharedResources(device);
      pipeline.registerStage(createAlwaysActiveStage('primaryGrade'));
      pipeline.registerStage(createAlwaysActiveStage('displayOutput'));

      const state = createDefaultInternalState();
      const inputView = createMockTextureView();
      const outputView = createMockTextureView();

      pipeline.execute(device, inputView, outputView, state, 800, 600, false);

      expect(device.createTexture).toHaveBeenCalledWith(expect.objectContaining({ format: 'rgba8unorm' }));
    });
  });

  describe('first stage uses viewer transform', () => {
    it('WGPU-SP-040: first stage receives viewer uniforms (offset/scale)', () => {
      const device = createMockDevice();
      const pipeline = new WebGPUShaderPipeline();
      pipeline.initializeSharedResources(device);
      pipeline.registerStage(createAlwaysActiveStage('primaryGrade'));

      const state = createDefaultInternalState();
      const inputView = createMockTextureView();
      const outputView = createMockTextureView();

      pipeline.execute(device, inputView, outputView, state, 800, 600, false, 0.5, -0.3, 2.0, 1.5);

      // Viewer uniform buffer should have been written
      expect(device.queue.writeBuffer).toHaveBeenCalled();
      // Find the call that writes the viewer uniform data
      const writeBufferCalls = device.queue.writeBuffer.mock.calls;
      const viewerCall = writeBufferCalls.find((call) => {
        const data = call[2] as Float32Array;
        return data.length === 4 && Math.abs(data[0]! - 0.5) < 0.001;
      });
      expect(viewerCall).toBeDefined();
    });
  });

  describe('pipeline state', () => {
    it('WGPU-SP-050: isReady returns false before initialization', () => {
      const pipeline = new WebGPUShaderPipeline();
      expect(pipeline.isReady()).toBe(false);
    });

    it('WGPU-SP-051: isReady returns true after initializeSharedResources', () => {
      const device = createMockDevice();
      const pipeline = new WebGPUShaderPipeline();
      pipeline.initializeSharedResources(device);
      expect(pipeline.isReady()).toBe(true);
    });

    it('WGPU-SP-052: isReady returns false after dispose', () => {
      const device = createMockDevice();
      const pipeline = new WebGPUShaderPipeline();
      pipeline.initializeSharedResources(device);
      pipeline.dispose();
      expect(pipeline.isReady()).toBe(false);
    });
  });

  describe('dispose', () => {
    it('WGPU-SP-060: destroys uniform buffers on dispose', () => {
      const device = createMockDevice();
      const pipeline = new WebGPUShaderPipeline();
      pipeline.initializeSharedResources(device);

      // Execute to create some cached pipelines and buffers
      pipeline.registerStage(createAlwaysActiveStage('primaryGrade'));
      const state = createDefaultInternalState();
      pipeline.execute(device, createMockTextureView(), createMockTextureView(), state, 100, 100);

      pipeline.dispose();

      // Global UBO buffer should be destroyed
      expect(device._buffer.destroy).toHaveBeenCalled();
    });

    it('WGPU-SP-061: does not throw when not initialized', () => {
      const pipeline = new WebGPUShaderPipeline();
      expect(() => pipeline.dispose()).not.toThrow();
    });
  });

  describe('static stage sets', () => {
    it('WGPU-SP-070: PER_LAYER_STAGES contains 6 stages', () => {
      expect(WebGPUShaderPipeline.PER_LAYER_STAGES.size).toBe(6);
      expect(WebGPUShaderPipeline.PER_LAYER_STAGES.has('inputDecode')).toBe(true);
      expect(WebGPUShaderPipeline.PER_LAYER_STAGES.has('colorPipeline')).toBe(true);
    });

    it('WGPU-SP-071: DISPLAY_STAGES contains 5 stages', () => {
      expect(WebGPUShaderPipeline.DISPLAY_STAGES.size).toBe(5);
      expect(WebGPUShaderPipeline.DISPLAY_STAGES.has('sceneAnalysis')).toBe(true);
      expect(WebGPUShaderPipeline.DISPLAY_STAGES.has('compositing')).toBe(true);
    });

    it('WGPU-SP-072: PER_LAYER and DISPLAY stages are disjoint', () => {
      for (const id of WebGPUShaderPipeline.PER_LAYER_STAGES) {
        expect(WebGPUShaderPipeline.DISPLAY_STAGES.has(id)).toBe(false);
      }
    });

    it('WGPU-SP-073: PER_LAYER + DISPLAY = all 11 stages', () => {
      const total = WebGPUShaderPipeline.PER_LAYER_STAGES.size + WebGPUShaderPipeline.DISPLAY_STAGES.size;
      expect(total).toBe(11);
    });
  });

  describe('global uniforms', () => {
    it('WGPU-SP-080: setGlobalHDRHeadroom/setGlobalOutputMode store values', () => {
      const pipeline = new WebGPUShaderPipeline();
      // These should not throw
      pipeline.setGlobalHDRHeadroom(2.5);
      pipeline.setGlobalOutputMode(3);
    });

    it('WGPU-SP-081: setGlobalHDRHeadroom sanitizes NaN/Infinity to 1.0 (MED-52 round 2)', () => {
      // Read internal state via a typed cast — defense-in-depth for the WebGPU
      // path that previously had zero clamping, mirroring Renderer.setHDRHeadroom.
      type Internals = { _hdrHeadroom: number };
      const pipeline = new WebGPUShaderPipeline();
      const internals = pipeline as unknown as Internals;

      pipeline.setGlobalHDRHeadroom(NaN);
      expect(internals._hdrHeadroom).toBe(1.0);

      pipeline.setGlobalHDRHeadroom(Infinity);
      expect(internals._hdrHeadroom).toBe(1.0);

      pipeline.setGlobalHDRHeadroom(-Infinity);
      expect(internals._hdrHeadroom).toBe(1.0);
    });

    it('WGPU-SP-082: setGlobalHDRHeadroom clamps to [1, 100]', () => {
      type Internals = { _hdrHeadroom: number };
      const pipeline = new WebGPUShaderPipeline();
      const internals = pipeline as unknown as Internals;

      pipeline.setGlobalHDRHeadroom(0.5);
      expect(internals._hdrHeadroom).toBe(1.0);

      pipeline.setGlobalHDRHeadroom(-2);
      expect(internals._hdrHeadroom).toBe(1.0);

      pipeline.setGlobalHDRHeadroom(1000);
      expect(internals._hdrHeadroom).toBe(100.0);

      pipeline.setGlobalHDRHeadroom(3.5);
      expect(internals._hdrHeadroom).toBe(3.5);
    });
  });
});
