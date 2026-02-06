/**
 * RenderWorkerProxy Tests
 *
 * Tests for the main-thread proxy that communicates with the render worker.
 * Uses mock Worker to simulate worker behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RenderWorkerProxy } from './RenderWorkerProxy';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../ui/components/ColorControls';
import { DEFAULT_TONE_MAPPING_STATE } from '../ui/components/ToneMappingControl';
import type { RenderWorkerMessage, RenderWorkerResult, SyncStateMessage } from './renderWorker.messages';

// Mock OffscreenCanvas for jsdom
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

// Mock ImageBitmap for jsdom
if (typeof globalThis.ImageBitmap === 'undefined') {
  (globalThis as any).ImageBitmap = class MockImageBitmap {
    width = 0;
    height = 0;
    close() {}
  };
}

// Mock createImageBitmap for jsdom
if (typeof globalThis.createImageBitmap === 'undefined') {
  (globalThis as any).createImageBitmap = async (source: any) => {
    const bmp = new (globalThis as any).ImageBitmap();
    bmp.width = source?.width ?? 100;
    bmp.height = source?.height ?? 100;
    return bmp;
  };
}

// =============================================================================
// Mock Worker
// =============================================================================

class MockWorker {
  private listeners = new Map<string, Set<(event: any) => void>>();
  public lastMessage: RenderWorkerMessage | null = null;
  public lastTransfer: Transferable[] | undefined = undefined;
  public messageHistory: RenderWorkerMessage[] = [];
  public terminated = false;

  // Simulate worker sending messages back
  onmessage: ((event: MessageEvent) => void) | null = null;

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

  /**
   * Simulate the worker sending a message to the main thread.
   */
  simulateMessage(data: RenderWorkerResult): void {
    const event = new MessageEvent('message', { data });
    for (const handler of this.listeners.get('message') ?? []) {
      handler(event);
    }
  }

  /**
   * Simulate a worker error.
   */
  simulateError(message: string): void {
    const event = new ErrorEvent('error', { message });
    for (const handler of this.listeners.get('error') ?? []) {
      handler(event);
    }
  }
}

// =============================================================================
// Helper to create a mock ImageBitmap instance
// =============================================================================

function createMockBitmap(width = 100, height = 100): ImageBitmap {
  const bmp = new (globalThis as any).ImageBitmap();
  bmp.width = width;
  bmp.height = height;
  return bmp as ImageBitmap;
}

// =============================================================================
// Helper to create proxy with mock worker
// =============================================================================

function createProxyWithMock(): { proxy: RenderWorkerProxy; worker: MockWorker } {
  let capturedWorker: MockWorker | null = null;

  const proxy = new RenderWorkerProxy({
    workerFactory: () => {
      capturedWorker = new MockWorker();
      return capturedWorker as unknown as Worker;
    },
  });

  // Create a canvas with a mock transferControlToOffscreen
  const canvas = document.createElement('canvas');
  const offscreen = new OffscreenCanvas(100, 100);
  (canvas as any).transferControlToOffscreen = vi.fn(() => offscreen);

  proxy.initialize(canvas);

  return { proxy, worker: capturedWorker! };
}

// =============================================================================
// Tests
// =============================================================================

describe('RenderWorkerProxy', () => {
  let proxy: RenderWorkerProxy;
  let mockWorker: MockWorker;

  beforeEach(() => {
    const result = createProxyWithMock();
    proxy = result.proxy;
    mockWorker = result.worker;
  });

  afterEach(async () => {
    // Catch the init promise rejection that dispose() triggers
    // (init promise is created in createProxyWithMock but never resolved)
    const initPromise = proxy.initAsync().catch(() => {});
    proxy.dispose();
    await initPromise;
  });

  // --- Lifecycle ---

  describe('Lifecycle', () => {
    it('RWP-001: sends init message with OffscreenCanvas on initialize', () => {
      expect(mockWorker.lastMessage?.type).toBe('init');
    });

    it('RWP-002: isAsync property is true', () => {
      expect(proxy.isAsync).toBe(true);
    });

    it('RWP-003: initAsync resolves on successful init', async () => {
      const initPromise = proxy.initAsync();
      mockWorker.simulateMessage({ type: 'initResult', success: true, hdrMode: 'sdr' });
      await expect(initPromise).resolves.toBeUndefined();
    });

    it('RWP-004: initAsync resolves with HDR mode', async () => {
      const initPromise = proxy.initAsync();
      mockWorker.simulateMessage({ type: 'initResult', success: true, hdrMode: 'hlg' });
      await initPromise;
      expect(proxy.getHDROutputMode()).toBe('hlg');
    });

    it('RWP-005: initAsync rejects on failed init', async () => {
      const initPromise = proxy.initAsync();
      mockWorker.simulateMessage({ type: 'initResult', success: false, error: 'WebGL2 not supported' });
      await expect(initPromise).rejects.toThrow('WebGL2 not supported');
    });

    it('RWP-006: dispose sends dispose message and terminates worker', () => {
      mockWorker.simulateMessage({ type: 'ready' });
      proxy.dispose();
      const disposeMsg = mockWorker.messageHistory.find(m => m.type === 'dispose');
      expect(disposeMsg).toBeTruthy();
      expect(mockWorker.terminated).toBe(true);
    });

    it('RWP-007: dispose rejects pending render requests', async () => {
      mockWorker.simulateMessage({ type: 'ready' });
      const renderPromise = proxy.renderSDRFrameAsync(createMockBitmap());
      proxy.dispose();
      await expect(renderPromise).rejects.toThrow('disposed');
    });

    it('RWP-008: dispose rejects pending pixel reads', async () => {
      mockWorker.simulateMessage({ type: 'ready' });
      const pixelPromise = proxy.readPixelFloatAsync(0, 0, 1, 1);
      proxy.dispose();
      await expect(pixelPromise).rejects.toThrow('disposed');
    });

    it('RWP-009: isReady returns false initially', () => {
      expect(proxy.isReady()).toBe(false);
    });

    it('RWP-010: isReady returns true after ready message', () => {
      mockWorker.simulateMessage({ type: 'ready' });
      expect(proxy.isReady()).toBe(true);
    });
  });

  // --- Color adjustments ---

  describe('Color adjustments', () => {
    it('RWP-011: getColorAdjustments returns defaults initially', () => {
      expect(proxy.getColorAdjustments()).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
    });

    it('RWP-012: setColorAdjustments stores state locally', () => {
      const adj = { ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 1.5 };
      proxy.setColorAdjustments(adj);
      expect(proxy.getColorAdjustments().exposure).toBe(1.5);
    });

    it('RWP-013: resetColorAdjustments restores defaults', () => {
      proxy.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 1.5 });
      proxy.resetColorAdjustments();
      expect(proxy.getColorAdjustments()).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
    });
  });

  // --- Tone mapping ---

  describe('Tone mapping', () => {
    it('RWP-014: getToneMappingState returns defaults initially', () => {
      expect(proxy.getToneMappingState()).toEqual(DEFAULT_TONE_MAPPING_STATE);
    });

    it('RWP-015: setToneMappingState stores state locally', () => {
      const state = { ...DEFAULT_TONE_MAPPING_STATE, enabled: true, operator: 'aces' as const };
      proxy.setToneMappingState(state);
      expect(proxy.getToneMappingState().enabled).toBe(true);
    });

    it('RWP-016: resetToneMappingState restores defaults', () => {
      proxy.setToneMappingState({ ...DEFAULT_TONE_MAPPING_STATE, enabled: true });
      proxy.resetToneMappingState();
      expect(proxy.getToneMappingState()).toEqual(DEFAULT_TONE_MAPPING_STATE);
    });
  });

  // --- Color inversion ---

  describe('Color inversion', () => {
    it('RWP-017: getColorInversion returns false initially', () => {
      expect(proxy.getColorInversion()).toBe(false);
    });

    it('RWP-018: setColorInversion stores state', () => {
      proxy.setColorInversion(true);
      expect(proxy.getColorInversion()).toBe(true);
    });
  });

  // --- HDR output ---

  describe('HDR output', () => {
    it('RWP-019: getHDROutputMode returns sdr initially', () => {
      expect(proxy.getHDROutputMode()).toBe('sdr');
    });

    it('RWP-020: setHDROutputMode stores mode', () => {
      proxy.setHDROutputMode('hlg', {} as any);
      expect(proxy.getHDROutputMode()).toBe('hlg');
    });
  });

  // --- Rendering ---

  describe('Rendering', () => {
    it('RWP-021: renderSDRFrame returns canvas element', () => {
      const result = proxy.renderSDRFrame({} as HTMLCanvasElement);
      // Returns the original canvas element (before transfer)
      expect(result).toBeInstanceOf(HTMLCanvasElement);
    });

    it('RWP-022: renderSDRFrameAsync sends renderSDR message', async () => {
      mockWorker.simulateMessage({ type: 'ready' });
      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      // Find the renderSDR message (bitmap passes instanceof check, so message is sent synchronously)
      const renderMsg = mockWorker.messageHistory.find(m => m.type === 'renderSDR');
      expect(renderMsg).toBeTruthy();

      // Simulate completion
      if (renderMsg && 'id' in renderMsg) {
        mockWorker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }

      await promise;
    });

    it('RWP-023: renderSDRFrameAsync rejects on error', async () => {
      mockWorker.simulateMessage({ type: 'ready' });
      const bitmap = createMockBitmap();
      const promise = proxy.renderSDRFrameAsync(bitmap);

      const renderMsg = mockWorker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        mockWorker.simulateMessage({ type: 'renderError', id: (renderMsg as any).id, error: 'Context lost' });
      }

      await expect(promise).rejects.toThrow('Context lost');
    });

    it('RWP-024: readPixelFloat returns null synchronously', () => {
      expect(proxy.readPixelFloat(0, 0, 1, 1)).toBeNull();
    });

    it('RWP-025: readPixelFloatAsync sends readPixel message and returns data', async () => {
      mockWorker.simulateMessage({ type: 'ready' });
      const promise = proxy.readPixelFloatAsync(10, 20, 1, 1);

      const readMsg = mockWorker.messageHistory.find(m => m.type === 'readPixel');
      expect(readMsg).toBeTruthy();

      const pixelData = new Float32Array([1.0, 0.5, 0.0, 1.0]);
      if (readMsg && 'id' in readMsg) {
        mockWorker.simulateMessage({ type: 'pixelData', id: (readMsg as any).id, data: pixelData });
      }

      const result = await promise;
      expect(result).toBe(pixelData);
    });

    it('RWP-026: readPixelFloatAsync returns null when data unavailable', async () => {
      mockWorker.simulateMessage({ type: 'ready' });
      const promise = proxy.readPixelFloatAsync(10, 20, 1, 1);

      const readMsg = mockWorker.messageHistory.find(m => m.type === 'readPixel');
      if (readMsg && 'id' in readMsg) {
        mockWorker.simulateMessage({ type: 'pixelData', id: (readMsg as any).id, data: null });
      }

      const result = await promise;
      expect(result).toBeNull();
    });
  });

  // --- Batch state ---

  describe('Batch state optimization', () => {
    it('RWP-027: state setters batch into dirty state', () => {
      proxy.setClarity(50);
      proxy.setSharpen(25);
      // State is batched, not sent immediately
      const syncMessages = mockWorker.messageHistory.filter(m => m.type === 'syncState');
      expect(syncMessages.length).toBe(0);
    });

    it('RWP-028: dirty state is flushed before render', async () => {
      mockWorker.simulateMessage({ type: 'ready' });
      proxy.setClarity(50);
      proxy.setSharpen(25);

      const promise = proxy.renderSDRFrameAsync(createMockBitmap());

      // Should have sent syncState before renderSDR
      const syncMsg = mockWorker.messageHistory.find(m => m.type === 'syncState');
      expect(syncMsg).toBeTruthy();
      if (syncMsg && 'state' in syncMsg) {
        expect((syncMsg as SyncStateMessage).state.clarity).toBe(50);
        expect((syncMsg as SyncStateMessage).state.sharpen).toBe(25);
      }

      // Complete the render
      const renderMsg = mockWorker.messageHistory.find(m => m.type === 'renderSDR');
      if (renderMsg && 'id' in renderMsg) {
        mockWorker.simulateMessage({ type: 'renderDone', id: (renderMsg as any).id });
      }

      await promise;
    });
  });

  // --- Context loss ---

  describe('Context loss handling', () => {
    it('RWP-029: context loss callback is called on contextLost message', () => {
      const callback = vi.fn();
      proxy.setOnContextLost(callback);
      mockWorker.simulateMessage({ type: 'contextLost' });
      expect(callback).toHaveBeenCalledOnce();
    });

    it('RWP-030: context restore callback is called on contextRestored message', () => {
      const callback = vi.fn();
      proxy.setOnContextRestored(callback);
      mockWorker.simulateMessage({ type: 'contextRestored' });
      expect(callback).toHaveBeenCalledOnce();
    });

    it('RWP-031: isContextLost returns true after contextLost message', () => {
      mockWorker.simulateMessage({ type: 'contextLost' });
      expect(proxy.isContextLost()).toBe(true);
    });

    it('RWP-032: isContextLost returns false after contextRestored', () => {
      mockWorker.simulateMessage({ type: 'contextLost' });
      mockWorker.simulateMessage({ type: 'contextRestored' });
      expect(proxy.isContextLost()).toBe(false);
    });
  });

  // --- Texture management ---

  describe('Texture management', () => {
    it('RWP-033: createTexture returns null', () => {
      expect(proxy.createTexture()).toBeNull();
    });

    it('RWP-034: deleteTexture is a no-op', () => {
      expect(() => proxy.deleteTexture(null)).not.toThrow();
    });
  });

  // --- Context access ---

  describe('Context access', () => {
    it('RWP-035: getContext returns null', () => {
      expect(proxy.getContext()).toBeNull();
    });

    it('RWP-036: getCanvasElement returns the canvas', () => {
      // The canvas that was passed to initialize
      expect(proxy.getCanvasElement()).toBeInstanceOf(HTMLCanvasElement);
    });
  });

  // --- Worker error handling ---

  describe('Worker error handling', () => {
    it('RWP-037: worker error rejects pending render requests', async () => {
      mockWorker.simulateMessage({ type: 'ready' });
      const promise = proxy.renderSDRFrameAsync(createMockBitmap());
      mockWorker.simulateError('Unexpected error');
      await expect(promise).rejects.toThrow('Worker error');
    });
  });

  // --- Fire-and-forget setters ---

  describe('Fire-and-forget setters', () => {
    it('RWP-038: resize posts message', () => {
      proxy.resize(1920, 1080);
      const msg = mockWorker.messageHistory.find(m => m.type === 'resize');
      expect(msg).toBeTruthy();
    });

    it('RWP-039: clear posts message', () => {
      proxy.clear(0, 0, 0, 1);
      const msg = mockWorker.messageHistory.find(m => m.type === 'clear');
      expect(msg).toBeTruthy();
    });
  });

  // =============================================================================
  // Regression tests for ImageBitmap lifecycle fix
  // =============================================================================

  describe('ImageBitmap lifecycle (regression)', () => {
    it('RWP-BMP-001: prepareFrame called twice rapidly only keeps the latest bitmap', async () => {
      // Create two mock canvas elements to simulate rapid frame switches
      const canvas1 = document.createElement('canvas');
      canvas1.width = 100;
      canvas1.height = 100;

      const canvas2 = document.createElement('canvas');
      canvas2.width = 200;
      canvas2.height = 200;

      // Track if the first bitmap gets closed
      const mockBitmap1 = createMockBitmap(100, 100);
      const closeSpy1 = vi.spyOn(mockBitmap1, 'close');

      const mockBitmap2 = createMockBitmap(200, 200);

      // Override createImageBitmap to return our tracked bitmaps
      const originalCreateImageBitmap = globalThis.createImageBitmap;
      let callCount = 0;
      (globalThis as any).createImageBitmap = vi.fn(async (source: any) => {
        callCount++;
        if (callCount === 1) return mockBitmap1;
        if (callCount === 2) return mockBitmap2;
        return createMockBitmap(source?.width ?? 100, source?.height ?? 100);
      });

      try {
        // Call prepareFrame twice rapidly
        proxy.prepareFrame(canvas1);
        proxy.prepareFrame(canvas2);

        // Wait for async bitmap creation to complete
        await new Promise(resolve => setTimeout(resolve, 10));

        // The first bitmap should have been closed to prevent memory leak
        expect(closeSpy1).toHaveBeenCalled();

        // Get the prepared bitmap - should be the second one
        const bitmap = await proxy.getPreparedBitmap();
        expect(bitmap).toBe(mockBitmap2);
        expect(bitmap?.width).toBe(200);
      } finally {
        // Restore original createImageBitmap
        (globalThis as any).createImageBitmap = originalCreateImageBitmap;
      }
    });

    it('RWP-BMP-002: dispose cleans up pending bitmap (no dangling references)', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;

      // Create a mock bitmap with a close spy
      const mockBitmap = createMockBitmap(100, 100);
      const closeSpy = vi.spyOn(mockBitmap, 'close');

      // Override createImageBitmap
      const originalCreateImageBitmap = globalThis.createImageBitmap;
      (globalThis as any).createImageBitmap = vi.fn(async () => mockBitmap);

      try {
        // Prepare a frame but don't wait for it
        proxy.prepareFrame(canvas);

        // Immediately dispose (simulating cleanup before bitmap is consumed)
        proxy.dispose();

        // Wait for async operations to settle
        await new Promise(resolve => setTimeout(resolve, 10));

        // The pending bitmap should have been closed during dispose
        expect(closeSpy).toHaveBeenCalled();

        // Verify internal state is cleared (pendingBitmap should be null)
        // This is tested indirectly by verifying getPreparedBitmap returns null
        const bitmap = await proxy.getPreparedBitmap();
        expect(bitmap).toBeNull();
      } finally {
        // Restore original createImageBitmap
        (globalThis as any).createImageBitmap = originalCreateImageBitmap;
      }
    });
  });
});
