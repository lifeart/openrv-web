/**
 * RenderWorkerProxy End-to-End Integration Tests
 *
 * Tests the full integration path of RenderWorkerProxy, including:
 * - Feature detection and fallback when OffscreenCanvas/transferControlToOffscreen
 *   is unavailable
 * - Proxy lifecycle (create, dispose, double-dispose)
 * - State round-trip for all getter/setter pairs
 * - Render call behavior when no worker is available
 * - Worker factory integration
 * - Context loss/restore event propagation
 * - Batch state optimization (dirty state accumulation and flush)
 *
 * These tests run under jsdom (no real WebGL2, no real OffscreenCanvas)
 * and use a MockWorker that simulates worker responses.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RenderWorkerProxy } from './RenderWorkerProxy';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../ui/components/ColorControls';
import type { ColorAdjustments } from '../ui/components/ColorControls';
import { DEFAULT_TONE_MAPPING_STATE } from '../ui/components/ToneMappingControl';
import type { ToneMappingState } from '../ui/components/ToneMappingControl';
import type {
  RenderWorkerMessage,
  RenderWorkerResult,
  SyncStateMessage,
} from './renderWorker.messages';

// =============================================================================
// Environment polyfills for jsdom
// =============================================================================

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  (globalThis as any).OffscreenCanvas = class MockOffscreenCanvas {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
    getContext() { return null; }
    addEventListener() {}
    removeEventListener() {}
  };
}

if (typeof globalThis.ImageBitmap === 'undefined') {
  (globalThis as any).ImageBitmap = class MockImageBitmap {
    width = 0;
    height = 0;
    close() {}
  };
}

if (typeof globalThis.createImageBitmap === 'undefined') {
  (globalThis as any).createImageBitmap = async (source: any) => {
    const bmp = new (globalThis as any).ImageBitmap();
    bmp.width = source?.width ?? 100;
    bmp.height = source?.height ?? 100;
    return bmp as ImageBitmap;
  };
}

// =============================================================================
// MockWorker - simulates a Web Worker for integration testing
// =============================================================================

class MockWorker {
  private listeners = new Map<string, Set<(event: any) => void>>();
  public lastMessage: RenderWorkerMessage | null = null;
  public lastTransfer: Transferable[] | undefined = undefined;
  public messageHistory: RenderWorkerMessage[] = [];
  public terminated = false;

  addEventListener(type: string, handler: (event: any) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: (event: any) => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  postMessage(message: RenderWorkerMessage, transfer?: Transferable[]): void {
    this.lastMessage = message;
    this.lastTransfer = transfer;
    this.messageHistory.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Simulate worker sending a message back to the main thread. */
  simulateMessage(data: RenderWorkerResult): void {
    const event = new MessageEvent('message', { data });
    for (const handler of this.listeners.get('message') ?? []) {
      handler(event);
    }
  }

  /** Simulate an unrecoverable worker error. */
  simulateError(message: string): void {
    const event = new ErrorEvent('error', { message });
    for (const handler of this.listeners.get('error') ?? []) {
      handler(event);
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function createMockBitmap(width = 100, height = 100): ImageBitmap {
  const bmp = new (globalThis as any).ImageBitmap();
  bmp.width = width;
  bmp.height = height;
  return bmp as ImageBitmap;
}

/**
 * Create a RenderWorkerProxy wired to a MockWorker via workerFactory.
 * Calls initialize() with a canvas that has transferControlToOffscreen mocked.
 */
function createProxyWithMock(): { proxy: RenderWorkerProxy; worker: MockWorker; canvas: HTMLCanvasElement } {
  let capturedWorker: MockWorker | null = null;

  const proxy = new RenderWorkerProxy({
    workerFactory: () => {
      capturedWorker = new MockWorker();
      return capturedWorker as unknown as Worker;
    },
  });

  const canvas = document.createElement('canvas');
  const offscreen = new OffscreenCanvas(100, 100);
  (canvas as any).transferControlToOffscreen = vi.fn(() => offscreen);

  proxy.initialize(canvas);

  return { proxy, worker: capturedWorker!, canvas };
}

/**
 * Create a proxy, simulate a successful init so isReady() is true.
 */
function createReadyProxy(): { proxy: RenderWorkerProxy; worker: MockWorker; canvas: HTMLCanvasElement } {
  const result = createProxyWithMock();
  result.worker.simulateMessage({ type: 'ready' });
  result.worker.simulateMessage({ type: 'initResult', success: true, hdrMode: 'sdr' });
  return result;
}

// =============================================================================
// E2E Tests
// =============================================================================

describe('RenderWorkerProxy E2E', () => {
  // =========================================================================
  // 1. Feature detection and fallback path
  // =========================================================================

  describe('Feature detection and fallback', () => {
    it('RWP-E2E-001: initialize throws when transferControlToOffscreen is not available', () => {
      const proxy = new RenderWorkerProxy({
        workerFactory: () => new MockWorker() as unknown as Worker,
      });

      const canvas = document.createElement('canvas');
      // No transferControlToOffscreen on canvas

      expect(() => proxy.initialize(canvas)).toThrow();
      proxy.dispose();
    });

    it('RWP-E2E-002: initialize succeeds when transferControlToOffscreen is available', () => {
      const proxy = new RenderWorkerProxy({
        workerFactory: () => new MockWorker() as unknown as Worker,
      });

      const canvas = document.createElement('canvas');
      (canvas as any).transferControlToOffscreen = vi.fn(() => new OffscreenCanvas(100, 100));

      expect(() => proxy.initialize(canvas)).not.toThrow();

      // Clean up - catch init rejection
      const initPromise = proxy.initAsync().catch(() => {});
      proxy.dispose();
      return initPromise;
    });

    it('RWP-E2E-003: initAsync rejects when worker init fails (simulating no WebGL2)', async () => {
      const { proxy, worker } = createProxyWithMock();

      const initPromise = proxy.initAsync();
      worker.simulateMessage({ type: 'initResult', success: false, error: 'WebGL2 not available' });

      await expect(initPromise).rejects.toThrow('WebGL2 not available');
      proxy.dispose();
    });

    it('RWP-E2E-004: initialize throws if proxy has been disposed', () => {
      const proxy = new RenderWorkerProxy({
        workerFactory: () => new MockWorker() as unknown as Worker,
      });
      proxy.dispose();

      const canvas = document.createElement('canvas');
      (canvas as any).transferControlToOffscreen = vi.fn(() => new OffscreenCanvas(100, 100));

      expect(() => proxy.initialize(canvas)).toThrow('disposed');
    });
  });

  // =========================================================================
  // 2. Proxy lifecycle without worker (simulating unavailability)
  // =========================================================================

  describe('Proxy lifecycle', () => {
    it('RWP-E2E-005: create proxy and dispose cleanly', async () => {
      const { proxy, worker } = createProxyWithMock();
      worker.simulateMessage({ type: 'ready' });

      expect(proxy.isReady()).toBe(true);

      const initPromise = proxy.initAsync().catch(() => {});
      proxy.dispose();
      await initPromise;

      expect(worker.terminated).toBe(true);
    });

    it('RWP-E2E-006: double-dispose is safe (idempotent)', async () => {
      const { proxy, worker } = createProxyWithMock();
      worker.simulateMessage({ type: 'ready' });

      const initPromise = proxy.initAsync().catch(() => {});
      proxy.dispose();
      await initPromise;
      expect(() => proxy.dispose()).not.toThrow();

      // Worker should still be terminated only once
      expect(worker.terminated).toBe(true);
    });

    it('RWP-E2E-007: isReady returns false after dispose', async () => {
      const { proxy, worker } = createProxyWithMock();
      worker.simulateMessage({ type: 'ready' });
      expect(proxy.isReady()).toBe(true);

      const initPromise = proxy.initAsync().catch(() => {});
      proxy.dispose();
      await initPromise;
      expect(proxy.isReady()).toBe(false);
    });

    it('RWP-E2E-008: dispose rejects pending init promise', async () => {
      const { proxy } = createProxyWithMock();

      const initPromise = proxy.initAsync();
      proxy.dispose();

      await expect(initPromise).rejects.toThrow('disposed');
    });

    it('RWP-E2E-009: dispose sends dispose message to worker before terminating', async () => {
      const { proxy, worker } = createProxyWithMock();
      worker.simulateMessage({ type: 'ready' });

      const initPromise = proxy.initAsync().catch(() => {});
      proxy.dispose();
      await initPromise;

      const disposeMsg = worker.messageHistory.find(m => m.type === 'dispose');
      expect(disposeMsg).toBeTruthy();
      // dispose message sent before terminate
      expect(worker.terminated).toBe(true);
    });

    it('RWP-E2E-010: initAsync throws if initialize was never called', async () => {
      const proxy = new RenderWorkerProxy();
      await expect(proxy.initAsync()).rejects.toThrow('initialize() must be called first');
    });
  });

  // =========================================================================
  // 3. State round-trip through proxy
  // =========================================================================

  describe('State round-trip: color adjustments', () => {
    let proxy: RenderWorkerProxy;

    beforeEach(() => {
      const result = createReadyProxy();
      proxy = result.proxy;
    });

    afterEach(() => {
      proxy.dispose();
    });

    it('RWP-E2E-011: set color adjustments and get returns same values', () => {
      const custom: ColorAdjustments = {
        ...DEFAULT_COLOR_ADJUSTMENTS,
        exposure: 2.5,
        gamma: 1.8,
        saturation: 0.5,
        contrast: 1.5,
        brightness: 0.3,
        temperature: 50,
        tint: -25,
        hueRotation: 180,
      };

      proxy.setColorAdjustments(custom);
      const result = proxy.getColorAdjustments();

      expect(result.exposure).toBe(2.5);
      expect(result.gamma).toBe(1.8);
      expect(result.saturation).toBe(0.5);
      expect(result.contrast).toBe(1.5);
      expect(result.brightness).toBe(0.3);
      expect(result.temperature).toBe(50);
      expect(result.tint).toBe(-25);
      expect(result.hueRotation).toBe(180);
    });

    it('RWP-E2E-012: get returns a copy, not a reference', () => {
      proxy.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 1.0 });

      const result1 = proxy.getColorAdjustments();
      result1.exposure = 99;

      const result2 = proxy.getColorAdjustments();
      expect(result2.exposure).toBe(1.0);
    });

    it('RWP-E2E-013: reset color adjustments returns to defaults', () => {
      proxy.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        exposure: 3.0,
        gamma: 2.0,
        saturation: 0.1,
      });

      proxy.resetColorAdjustments();
      expect(proxy.getColorAdjustments()).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
    });
  });

  describe('State round-trip: tone mapping', () => {
    let proxy: RenderWorkerProxy;

    beforeEach(() => {
      const result = createReadyProxy();
      proxy = result.proxy;
    });

    afterEach(() => {
      proxy.dispose();
    });

    it('RWP-E2E-014: set tone mapping and get returns same state', () => {
      const custom: ToneMappingState = {
        enabled: true,
        operator: 'aces',
        reinhardWhitePoint: 6.0,
        filmicExposureBias: 3.0,
        filmicWhitePoint: 15.0,
      };

      proxy.setToneMappingState(custom);
      const result = proxy.getToneMappingState();

      expect(result.enabled).toBe(true);
      expect(result.operator).toBe('aces');
      expect(result.reinhardWhitePoint).toBe(6.0);
      expect(result.filmicExposureBias).toBe(3.0);
      expect(result.filmicWhitePoint).toBe(15.0);
    });

    it('RWP-E2E-015: reset tone mapping returns to defaults', () => {
      proxy.setToneMappingState({
        enabled: true,
        operator: 'filmic',
        filmicExposureBias: 5.0,
        filmicWhitePoint: 18.0,
      });

      proxy.resetToneMappingState();
      expect(proxy.getToneMappingState()).toEqual(DEFAULT_TONE_MAPPING_STATE);
    });

    it('RWP-E2E-016: tone mapping get returns a copy, not a reference', () => {
      proxy.setToneMappingState({ ...DEFAULT_TONE_MAPPING_STATE, enabled: true });
      const result1 = proxy.getToneMappingState();
      result1.enabled = false;

      const result2 = proxy.getToneMappingState();
      expect(result2.enabled).toBe(true);
    });
  });

  describe('State round-trip: HDR mode', () => {
    let proxy: RenderWorkerProxy;

    beforeEach(() => {
      const result = createReadyProxy();
      proxy = result.proxy;
    });

    afterEach(() => {
      proxy.dispose();
    });

    it('RWP-E2E-017: set HDR mode to hlg and get returns hlg', () => {
      proxy.setHDROutputMode('hlg', {} as any);
      expect(proxy.getHDROutputMode()).toBe('hlg');
    });

    it('RWP-E2E-018: set HDR mode to pq and get returns pq', () => {
      proxy.setHDROutputMode('pq', {} as any);
      expect(proxy.getHDROutputMode()).toBe('pq');
    });

    it('RWP-E2E-019: set HDR mode back to sdr and get returns sdr', () => {
      proxy.setHDROutputMode('hlg', {} as any);
      proxy.setHDROutputMode('sdr', {} as any);
      expect(proxy.getHDROutputMode()).toBe('sdr');
    });

    it('RWP-E2E-020: setHDROutputMode returns true', () => {
      const result = proxy.setHDROutputMode('hlg', {} as any);
      expect(result).toBe(true);
    });
  });

  describe('State round-trip: color inversion', () => {
    let proxy: RenderWorkerProxy;

    beforeEach(() => {
      const result = createReadyProxy();
      proxy = result.proxy;
    });

    afterEach(() => {
      proxy.dispose();
    });

    it('RWP-E2E-021: color inversion defaults to false', () => {
      expect(proxy.getColorInversion()).toBe(false);
    });

    it('RWP-E2E-022: set color inversion to true and get returns true', () => {
      proxy.setColorInversion(true);
      expect(proxy.getColorInversion()).toBe(true);
    });

    it('RWP-E2E-023: toggle color inversion off and on', () => {
      proxy.setColorInversion(true);
      expect(proxy.getColorInversion()).toBe(true);

      proxy.setColorInversion(false);
      expect(proxy.getColorInversion()).toBe(false);
    });
  });

  describe('State round-trip: multiple state changes', () => {
    let proxy: RenderWorkerProxy;

    beforeEach(() => {
      const result = createReadyProxy();
      proxy = result.proxy;
    });

    afterEach(() => {
      proxy.dispose();
    });

    it('RWP-E2E-024: multiple state changes are tracked independently', () => {
      proxy.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 2.0 });
      proxy.setToneMappingState({ ...DEFAULT_TONE_MAPPING_STATE, enabled: true, operator: 'aces' });
      proxy.setHDROutputMode('hlg', {} as any);
      proxy.setColorInversion(true);

      expect(proxy.getColorAdjustments().exposure).toBe(2.0);
      expect(proxy.getToneMappingState().enabled).toBe(true);
      expect(proxy.getToneMappingState().operator).toBe('aces');
      expect(proxy.getHDROutputMode()).toBe('hlg');
      expect(proxy.getColorInversion()).toBe(true);
    });
  });

  // =========================================================================
  // 4. Render call behavior when no worker
  // =========================================================================

  describe('Render call behavior', () => {
    it('RWP-E2E-025: renderSDRFrame returns canvas without crashing', () => {
      const { proxy, canvas } = createReadyProxy();

      const result = proxy.renderSDRFrame({} as HTMLCanvasElement);
      // Returns the original canvas element (OffscreenCanvas auto-composites)
      expect(result).toBe(canvas);

      proxy.dispose();
    });

    it('RWP-E2E-026: renderImage does not throw', () => {
      const { proxy } = createReadyProxy();

      const mockImage = {
        width: 100,
        height: 100,
        channels: 4,
        dataType: 'float32',
        data: new Float32Array(100 * 100 * 4).buffer,
        metadata: {},
      };

      expect(() => proxy.renderImage(mockImage as any)).not.toThrow();
      proxy.dispose();
    });

    it('RWP-E2E-027: readPixelFloat always returns null synchronously', () => {
      const { proxy } = createReadyProxy();
      expect(proxy.readPixelFloat(0, 0, 1, 1)).toBeNull();
      expect(proxy.readPixelFloat(100, 200, 10, 10)).toBeNull();
      proxy.dispose();
    });

    it('RWP-E2E-028: readPixelFloatAsync returns null when disposed', async () => {
      const { proxy } = createReadyProxy();
      proxy.dispose();

      const result = await proxy.readPixelFloatAsync(0, 0, 1, 1);
      expect(result).toBeNull();
    });

    it('RWP-E2E-029: readPixelFloatAsync returns data via worker round-trip', async () => {
      const { proxy, worker } = createReadyProxy();

      const promise = proxy.readPixelFloatAsync(10, 20, 1, 1);

      const readMsg = worker.messageHistory.find(m => m.type === 'readPixel');
      expect(readMsg).toBeTruthy();

      const pixelData = new Float32Array([0.5, 0.3, 0.1, 1.0]);
      if (readMsg && 'id' in readMsg) {
        worker.simulateMessage({ type: 'pixelData', id: (readMsg as any).id, data: pixelData });
      }

      const result = await promise;
      expect(result).toBe(pixelData);

      proxy.dispose();
    });

    it('RWP-E2E-030: renderSDRFrameAsync completes via worker round-trip', async () => {
      const { proxy, worker } = createReadyProxy();

      const bitmap = createMockBitmap(200, 150);
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      expect(renderMsg).toBeTruthy();

      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }

      await expect(promise).resolves.toBeUndefined();
      proxy.dispose();
    });

    it('RWP-E2E-031: renderSDRFrameAsync rejects when worker reports error', async () => {
      const { proxy, worker } = createReadyProxy();

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderError', id: (renderMsg as any).id, error: 'GPU process crashed' });
      }

      await expect(promise).rejects.toThrow('GPU process crashed');
      proxy.dispose();
    });

    it('RWP-E2E-032: renderHDRAsync rejects when disposed', async () => {
      const { proxy } = createReadyProxy();
      proxy.dispose();

      const mockImage = {
        width: 1,
        height: 1,
        channels: 4,
        dataType: 'float32',
        data: new Float32Array(4).buffer,
        metadata: {},
      };

      await expect(proxy.renderHDRAsync(mockImage as any)).rejects.toThrow('not available');
    });

    it('RWP-E2E-033: renderSDRFrameAsync rejects when context is lost', async () => {
      const { proxy, worker } = createReadyProxy();

      // Simulate context loss
      worker.simulateMessage({ type: 'contextLost' });

      await expect(proxy.renderSDRFrameAsync(createMockBitmap())).rejects.toThrow('not available');
      proxy.dispose();
    });
  });

  // =========================================================================
  // 5. Worker factory integration
  // =========================================================================

  describe('Worker factory integration', () => {
    it('RWP-E2E-034: custom workerFactory is called during initialize', () => {
      const factoryFn = vi.fn(() => new MockWorker() as unknown as Worker);

      const proxy = new RenderWorkerProxy({ workerFactory: factoryFn });
      const canvas = document.createElement('canvas');
      (canvas as any).transferControlToOffscreen = vi.fn(() => new OffscreenCanvas(100, 100));

      proxy.initialize(canvas);

      expect(factoryFn).toHaveBeenCalledOnce();

      // Clean up
      const initPromise = proxy.initAsync().catch(() => {});
      proxy.dispose();
      return initPromise;
    });

    it('RWP-E2E-035: worker receives init message with OffscreenCanvas', () => {
      let capturedWorker: MockWorker | null = null;

      const proxy = new RenderWorkerProxy({
        workerFactory: () => {
          capturedWorker = new MockWorker();
          return capturedWorker as unknown as Worker;
        },
      });

      const canvas = document.createElement('canvas');
      const offscreen = new OffscreenCanvas(640, 480);
      (canvas as any).transferControlToOffscreen = vi.fn(() => offscreen);

      proxy.initialize(canvas);

      // First message should be 'init' with the OffscreenCanvas
      expect(capturedWorker!.messageHistory.length).toBeGreaterThanOrEqual(1);
      const initMsg = capturedWorker!.messageHistory[0]!;
      expect(initMsg.type).toBe('init');
      expect((initMsg as any).canvas).toBe(offscreen);

      // Clean up
      const initPromise = proxy.initAsync().catch(() => {});
      proxy.dispose();
      return initPromise;
    });

    it('RWP-E2E-036: init message includes capabilities when provided', () => {
      let capturedWorker: MockWorker | null = null;

      const proxy = new RenderWorkerProxy({
        workerFactory: () => {
          capturedWorker = new MockWorker();
          return capturedWorker as unknown as Worker;
        },
      });

      const canvas = document.createElement('canvas');
      (canvas as any).transferControlToOffscreen = vi.fn(() => new OffscreenCanvas(100, 100));

      const capabilities = {
        videoFrameTexImage: true,
        hdr: false,
        p3: false,
        maxTextureSize: 4096,
      } as any;

      proxy.initialize(canvas, capabilities);

      const initMsg = capturedWorker!.messageHistory[0];
      expect((initMsg as any).capabilities).toBe(capabilities);

      // Clean up
      const initPromise = proxy.initAsync().catch(() => {});
      proxy.dispose();
      return initPromise;
    });

    it('RWP-E2E-037: OffscreenCanvas is transferred (in transferables list)', () => {
      let capturedWorker: MockWorker | null = null;

      const proxy = new RenderWorkerProxy({
        workerFactory: () => {
          capturedWorker = new MockWorker();
          return capturedWorker as unknown as Worker;
        },
      });

      const canvas = document.createElement('canvas');
      const offscreen = new OffscreenCanvas(100, 100);
      (canvas as any).transferControlToOffscreen = vi.fn(() => offscreen);

      proxy.initialize(canvas);

      // The lastTransfer should include the OffscreenCanvas
      expect(capturedWorker!.lastTransfer).toBeDefined();
      expect(capturedWorker!.lastTransfer).toContain(offscreen);

      // Clean up
      const initPromise = proxy.initAsync().catch(() => {});
      proxy.dispose();
      return initPromise;
    });
  });

  // =========================================================================
  // 6. Context loss/restore event propagation
  // =========================================================================

  describe('Context loss/restore event propagation', () => {
    let proxy: RenderWorkerProxy;
    let worker: MockWorker;

    beforeEach(() => {
      const result = createReadyProxy();
      proxy = result.proxy;
      worker = result.worker;
    });

    afterEach(() => {
      proxy.dispose();
    });

    it('RWP-E2E-038: setOnContextLost callback fires on contextLost event', () => {
      const callback = vi.fn();
      proxy.setOnContextLost(callback);

      worker.simulateMessage({ type: 'contextLost' });

      expect(callback).toHaveBeenCalledOnce();
    });

    it('RWP-E2E-039: setOnContextRestored callback fires on contextRestored event', () => {
      const callback = vi.fn();
      proxy.setOnContextRestored(callback);

      worker.simulateMessage({ type: 'contextLost' });
      worker.simulateMessage({ type: 'contextRestored' });

      expect(callback).toHaveBeenCalledOnce();
    });

    it('RWP-E2E-040: isContextLost reflects state after contextLost', () => {
      expect(proxy.isContextLost()).toBe(false);

      worker.simulateMessage({ type: 'contextLost' });
      expect(proxy.isContextLost()).toBe(true);
    });

    it('RWP-E2E-041: isContextLost returns false after contextRestored', () => {
      worker.simulateMessage({ type: 'contextLost' });
      expect(proxy.isContextLost()).toBe(true);

      worker.simulateMessage({ type: 'contextRestored' });
      expect(proxy.isContextLost()).toBe(false);
    });

    it('RWP-E2E-042: context loss/restore cycle fires both callbacks', () => {
      const lostCb = vi.fn();
      const restoredCb = vi.fn();
      proxy.setOnContextLost(lostCb);
      proxy.setOnContextRestored(restoredCb);

      worker.simulateMessage({ type: 'contextLost' });
      expect(lostCb).toHaveBeenCalledOnce();
      expect(restoredCb).not.toHaveBeenCalled();

      worker.simulateMessage({ type: 'contextRestored' });
      expect(restoredCb).toHaveBeenCalledOnce();
    });

    it('RWP-E2E-043: setting callback to null prevents further calls', () => {
      const callback = vi.fn();
      proxy.setOnContextLost(callback);

      worker.simulateMessage({ type: 'contextLost' });
      expect(callback).toHaveBeenCalledOnce();

      // Clear callback and trigger again
      proxy.setOnContextLost(null);
      worker.simulateMessage({ type: 'contextRestored' });
      worker.simulateMessage({ type: 'contextLost' });
      expect(callback).toHaveBeenCalledOnce(); // Still just once
    });

    it('RWP-E2E-044: multiple context loss events fire callback each time', () => {
      const callback = vi.fn();
      proxy.setOnContextLost(callback);

      worker.simulateMessage({ type: 'contextLost' });
      worker.simulateMessage({ type: 'contextRestored' });
      worker.simulateMessage({ type: 'contextLost' });

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 7. Batch state optimization
  // =========================================================================

  describe('Batch state optimization', () => {
    let proxy: RenderWorkerProxy;
    let worker: MockWorker;

    beforeEach(() => {
      const result = createReadyProxy();
      proxy = result.proxy;
      worker = result.worker;
    });

    afterEach(() => {
      proxy.dispose();
    });

    it('RWP-E2E-045: setter calls accumulate dirty state without sending syncState', () => {
      proxy.setClarity(50);
      proxy.setSharpen(25);
      proxy.setVibrance(75, true);
      proxy.setColorInversion(true);

      // No syncState message should have been sent yet
      const syncMessages = worker.messageHistory.filter(m => m.type === 'syncState');
      expect(syncMessages.length).toBe(0);
    });

    it('RWP-E2E-046: dirty state is flushed on renderSDRFrameAsync', async () => {
      proxy.setClarity(50);
      proxy.setSharpen(25);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      // syncState should have been sent before the render message
      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage | undefined;
      expect(syncMsg).toBeTruthy();
      expect(syncMsg!.state.clarity).toBe(50);
      expect(syncMsg!.state.sharpen).toBe(25);

      // The render message should come after the syncState
      const syncIdx = worker.messageHistory.findIndex(m => m.type === 'syncState');
      const renderIdx = worker.messageHistory.findIndex(m => m.type === 'renderSDR');
      expect(renderIdx).toBeGreaterThan(syncIdx);

      // Complete the render
      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-047: dirty state is cleared after flush', async () => {
      proxy.setClarity(50);

      const bitmap = createMockBitmap();
      const promise1 = proxy.renderSDRFrameAsync(bitmap);

      // First render flushes the state
      const syncMsgsBefore = worker.messageHistory.filter(m => m.type === 'syncState');
      expect(syncMsgsBefore.length).toBe(1);

      const renderMsg1 = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg1 && 'id' in renderMsg1) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg1 as any).id });
      }
      await promise1;

      // Second render without new state changes should NOT send syncState
      const promise2 = proxy.renderSDRFrameAsync(createMockBitmap());
      const syncMsgsAfter = worker.messageHistory.filter(m => m.type === 'syncState');
      expect(syncMsgsAfter.length).toBe(1); // Still just 1

      const renderMsg2 = worker.messageHistory.filter(m => m.type === 'renderSDR')[1];
      if (renderMsg2 && 'id' in renderMsg2) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg2 as any).id });
      }
      await promise2;
    });

    it('RWP-E2E-048: multiple setters batch into one syncState with all dirty fields', async () => {
      proxy.setClarity(50);
      proxy.setSharpen(30);
      proxy.setChannelMode('red');
      proxy.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 1.5 });
      proxy.setToneMappingState({ ...DEFAULT_TONE_MAPPING_STATE, enabled: true });
      proxy.setColorInversion(true);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsgs = worker.messageHistory.filter(m => m.type === 'syncState');
      expect(syncMsgs.length).toBe(1);

      const syncState = (syncMsgs[0] as SyncStateMessage).state;
      expect(syncState.clarity).toBe(50);
      expect(syncState.sharpen).toBe(30);
      expect(syncState.channelMode).toBe('red');
      expect(syncState.colorAdjustments?.exposure).toBe(1.5);
      expect(syncState.toneMappingState?.enabled).toBe(true);
      expect(syncState.colorInversion).toBe(true);

      // Complete render
      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-049: overwriting same dirty field keeps the latest value', async () => {
      proxy.setClarity(10);
      proxy.setClarity(20);
      proxy.setClarity(50);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.clarity).toBe(50);

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-050: dirty state is flushed on renderHDRAsync', async () => {
      proxy.setClarity(75);

      const mockImage = {
        width: 1,
        height: 1,
        channels: 4,
        dataType: 'float32',
        data: new Float32Array(4).buffer,
        metadata: {},
      };

      const promise = proxy.renderHDRAsync(mockImage as any);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg).toBeTruthy();
      expect(syncMsg.state.clarity).toBe(75);

      // Complete render
      const renderMsg = worker.messageHistory.find(m => m.type === 'renderHDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-051: background pattern setter marks dirty state', async () => {
      proxy.setBackgroundPattern({ pattern: 'checker', checkerSize: 'large', customColor: '#ff0000' });

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.backgroundPattern).toEqual({
        pattern: 'checker',
        checkerSize: 'large',
        customColor: '#ff0000',
      });

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-052: CDL setter marks dirty state', async () => {
      const cdl = {
        slope: { r: 1.1, g: 1.0, b: 0.9 },
        offset: { r: 0.01, g: 0.0, b: -0.01 },
        power: { r: 1.0, g: 1.0, b: 1.0 },
        saturation: 1.0,
      };
      proxy.setCDL(cdl);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.cdl).toEqual(cdl);

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-053: zebra stripes setter marks dirty state', async () => {
      const zebraState = {
        enabled: true,
        highEnabled: true,
        lowEnabled: false,
        highThreshold: 90,
        lowThreshold: 10,
      };
      proxy.setZebraStripes(zebraState);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.zebraStripes).toEqual(zebraState);

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-054: false color setter marks dirty state', async () => {
      const lut = new Uint8Array(256 * 3);
      proxy.setFalseColor(true, lut);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.falseColor).toEqual({ enabled: true, lut });

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-055: LUT setter marks dirty state', async () => {
      const lutData = new Float32Array(17 * 17 * 17 * 3);
      proxy.setLUT(lutData, 17, 0.8);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.lut).toBeTruthy();
      expect(syncMsg.state.lut!.lutSize).toBe(17);
      expect(syncMsg.state.lut!.intensity).toBe(0.8);
      // lutData is copied for transfer, so check that a Float32Array is present
      expect(syncMsg.state.lut!.lutData).toBeInstanceOf(Float32Array);

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-056: display color state setter marks dirty state', async () => {
      const displayState = { transferFunction: 1, displayGamma: 2.2, displayBrightness: 1.0, customGamma: 2.4 };
      proxy.setDisplayColorState(displayState);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.displayColorState).toEqual(displayState);

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-057: highlights/shadows setter marks dirty state', async () => {
      proxy.setHighlightsShadows(50, -30, 20, -10);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.highlightsShadows).toEqual({
        highlights: 50,
        shadows: -30,
        whites: 20,
        blacks: -10,
      });

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-058: vibrance setter marks dirty state', async () => {
      proxy.setVibrance(80, true);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.vibrance).toEqual({ vibrance: 80, skinProtection: true });

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-059: HSL qualifier setter marks dirty state', async () => {
      const hsl = {
        enabled: true,
        hue: { center: 120, width: 30, softness: 20 },
        saturation: { center: 50, width: 30, softness: 20 },
        luminance: { center: 50, width: 30, softness: 20 },
        correction: { hueShift: 10, saturationScale: 1.2, luminanceScale: 0.9 },
        invert: false,
        mattePreview: true,
      };
      proxy.setHSLQualifier(hsl as any);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.hslQualifier).toEqual(hsl);

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-060: color wheels setter marks dirty state', async () => {
      const wheels = {
        lift: { r: 0.1, g: 0, b: -0.1, y: 0 },
        gamma: { r: 0, g: 0, b: 0, y: 0 },
        gain: { r: 0, g: 0, b: 0, y: 0 },
        master: { r: 0, g: 0, b: 0, y: 0 },
        linked: false,
      };
      proxy.setColorWheels(wheels as any);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.colorWheels).toEqual(wheels);

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });

    it('RWP-E2E-061: curves LUT setter marks dirty state', async () => {
      const luts = {
        r: new Uint8Array(256),
        g: new Uint8Array(256),
        b: new Uint8Array(256),
        rgb: new Uint8Array(256),
      };
      proxy.setCurvesLUT(luts as any);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.curvesLUT).toBe(luts);

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;
    });
  });

  // =========================================================================
  // 8. Additional integration scenarios
  // =========================================================================

  describe('Additional integration scenarios', () => {
    it('RWP-E2E-062: isAsync property is true', () => {
      const { proxy } = createReadyProxy();
      expect(proxy.isAsync).toBe(true);
      proxy.dispose();
    });

    it('RWP-E2E-063: getContext returns null (context is in worker)', () => {
      const { proxy } = createReadyProxy();
      expect(proxy.getContext()).toBeNull();
      proxy.dispose();
    });

    it('RWP-E2E-064: getCanvasElement returns the initialized canvas', () => {
      const { proxy, canvas } = createReadyProxy();
      expect(proxy.getCanvasElement()).toBe(canvas);
      proxy.dispose();
    });

    it('RWP-E2E-065: createTexture returns null (textures in worker)', () => {
      const { proxy } = createReadyProxy();
      expect(proxy.createTexture()).toBeNull();
      proxy.dispose();
    });

    it('RWP-E2E-066: deleteTexture is a no-op and does not throw', () => {
      const { proxy } = createReadyProxy();
      expect(() => proxy.deleteTexture(null)).not.toThrow();
      proxy.dispose();
    });

    it('RWP-E2E-067: resize sends message to worker', () => {
      const { proxy, worker } = createReadyProxy();
      proxy.resize(1920, 1080);

      const msg = worker.messageHistory.find(m => m.type === 'resize');
      expect(msg).toBeTruthy();
      expect((msg as any).width).toBe(1920);
      expect((msg as any).height).toBe(1080);

      proxy.dispose();
    });

    it('RWP-E2E-068: clear sends message to worker', () => {
      const { proxy, worker } = createReadyProxy();
      proxy.clear(0.5, 0.3, 0.1, 1.0);

      const msg = worker.messageHistory.find(m => m.type === 'clear');
      expect(msg).toBeTruthy();
      expect((msg as any).r).toBe(0.5);
      expect((msg as any).g).toBe(0.3);
      expect((msg as any).b).toBe(0.1);
      expect((msg as any).a).toBe(1.0);

      proxy.dispose();
    });

    it('RWP-E2E-069: dispose rejects all pending render requests', async () => {
      const { proxy } = createReadyProxy();

      const bitmap1 = createMockBitmap();
      const bitmap2 = createMockBitmap();
      const promise1 = proxy.renderSDRFrameAsync(bitmap1);
      const promise2 = proxy.renderSDRFrameAsync(bitmap2);

      proxy.dispose();

      await expect(promise1).rejects.toThrow('disposed');
      await expect(promise2).rejects.toThrow('disposed');
    });

    it('RWP-E2E-070: dispose rejects all pending pixel reads', async () => {
      const { proxy } = createReadyProxy();

      const promise1 = proxy.readPixelFloatAsync(0, 0, 1, 1);
      const promise2 = proxy.readPixelFloatAsync(10, 10, 1, 1);

      proxy.dispose();

      await expect(promise1).rejects.toThrow('disposed');
      await expect(promise2).rejects.toThrow('disposed');
    });

    it('RWP-E2E-071: worker error rejects all pending render and pixel requests', async () => {
      const { proxy, worker } = createReadyProxy();

      const renderPromise = proxy.renderSDRFrameAsync(createMockBitmap());
      const pixelPromise = proxy.readPixelFloatAsync(0, 0, 1, 1);

      worker.simulateError('Worker crashed');

      await expect(renderPromise).rejects.toThrow('Worker error');
      await expect(pixelPromise).rejects.toThrow('Worker error');

      proxy.dispose();
    });

    it('RWP-E2E-072: initAsync picks up hdrMode from worker init result', async () => {
      const { proxy, worker } = createProxyWithMock();

      const initPromise = proxy.initAsync();
      worker.simulateMessage({ type: 'initResult', success: true, hdrMode: 'pq' });
      await initPromise;

      expect(proxy.getHDROutputMode()).toBe('pq');
      proxy.dispose();
    });

    it('RWP-E2E-073: getCanvasElement returns null after dispose', () => {
      const { proxy } = createReadyProxy();
      proxy.dispose();
      expect(proxy.getCanvasElement()).toBeNull();
    });

    it('RWP-E2E-074: LUT with null data marks dirty state correctly', async () => {
      const { proxy, worker } = createReadyProxy();

      proxy.setLUT(null, 0, 0);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.lut).toEqual({ lutData: null, lutSize: 0, intensity: 0 });

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;

      proxy.dispose();
    });

    it('RWP-E2E-075: curves LUT null disables curves via dirty state', async () => {
      const { proxy, worker } = createReadyProxy();

      proxy.setCurvesLUT(null);

      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const syncMsg = worker.messageHistory.find(m => m.type === 'syncState') as SyncStateMessage;
      expect(syncMsg.state.curvesLUT).toBeNull();

      const renderMsg = worker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        worker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }
      await promise;

      proxy.dispose();
    });
  });
});
