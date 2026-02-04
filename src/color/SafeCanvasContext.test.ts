/**
 * SafeCanvasContext Unit Tests
 *
 * Tests for the safeCanvasContext2D helper that wraps canvas
 * context creation with fallback logic for unsupported color spaces.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeCanvasContext2D, createViewerCanvas } from './SafeCanvasContext';
import { DEFAULT_CAPABILITIES, type DisplayCapabilities } from './DisplayCapabilities';

describe('SafeCanvasContext', () => {
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.restoreAllMocks();
  });

  it('SCC-001: returns a context when no colorSpace is specified', () => {
    const canvas = document.createElement('canvas');
    const ctx = safeCanvasContext2D(canvas, { alpha: false });
    expect(ctx).not.toBeNull();
    expect(ctx).toBeDefined();
  });

  it('SCC-002: passes baseOptions to getContext when no colorSpace', () => {
    const canvas = document.createElement('canvas');
    const spy = vi.spyOn(canvas, 'getContext');

    safeCanvasContext2D(canvas, { alpha: false, willReadFrequently: true });

    expect(spy).toHaveBeenCalledWith('2d', { alpha: false, willReadFrequently: true });
  });

  it('SCC-003: attempts colorSpace option when provided', () => {
    const canvas = document.createElement('canvas');
    const spy = vi.spyOn(canvas, 'getContext');

    safeCanvasContext2D(canvas, { alpha: false }, 'display-p3');

    // Should have tried with colorSpace first
    expect(spy).toHaveBeenCalledWith('2d', expect.objectContaining({
      alpha: false,
      colorSpace: 'display-p3',
    }));
  });

  it('SCC-004: falls back to standard context when colorSpace getContext returns null', () => {
    const canvas = document.createElement('canvas');
    let callCount = 0;

    HTMLCanvasElement.prototype.getContext = vi.fn(function (
      this: HTMLCanvasElement,
      contextId: string,
      options?: CanvasRenderingContext2DSettings,
    ) {
      if (contextId === '2d') {
        callCount++;
        // First call (with colorSpace) returns null, second returns context
        if (callCount === 1 && options && 'colorSpace' in options) {
          return null;
        }
        return { canvas: this, fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;
      }
      return null;
    }) as typeof HTMLCanvasElement.prototype.getContext;

    const ctx = safeCanvasContext2D(canvas, { alpha: false }, 'display-p3');
    expect(ctx).not.toBeNull();
    expect(callCount).toBe(2); // tried with colorSpace, then without
  });

  it('SCC-005: falls back to standard context when colorSpace getContext throws', () => {
    const canvas = document.createElement('canvas');
    let callCount = 0;

    HTMLCanvasElement.prototype.getContext = vi.fn(function (
      this: HTMLCanvasElement,
      contextId: string,
      options?: CanvasRenderingContext2DSettings,
    ) {
      if (contextId === '2d') {
        callCount++;
        // First call (with colorSpace) throws
        if (callCount === 1 && options && 'colorSpace' in options) {
          throw new Error('Unsupported color space');
        }
        return { canvas: this, fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;
      }
      return null;
    }) as typeof HTMLCanvasElement.prototype.getContext;

    const ctx = safeCanvasContext2D(canvas, { alpha: false }, 'display-p3');
    expect(ctx).not.toBeNull();
    expect(callCount).toBe(2); // tried with colorSpace (threw), then without
  });

  it('SCC-006: returns the first context when colorSpace is supported', () => {
    const canvas = document.createElement('canvas');
    const mockCtx = { canvas, fillRect: vi.fn(), isP3: true } as unknown as CanvasRenderingContext2D;

    HTMLCanvasElement.prototype.getContext = vi.fn(function (
      this: HTMLCanvasElement,
      contextId: string,
    ) {
      if (contextId === '2d') {
        return mockCtx;
      }
      return null;
    }) as typeof HTMLCanvasElement.prototype.getContext;

    const ctx = safeCanvasContext2D(canvas, {}, 'display-p3');
    expect(ctx).toBe(mockCtx);
  });

  it('SCC-007: works with rec2100-hlg colorSpace', () => {
    const canvas = document.createElement('canvas');
    const spy = vi.spyOn(canvas, 'getContext');

    safeCanvasContext2D(canvas, {}, 'rec2100-hlg');

    expect(spy).toHaveBeenCalledWith('2d', expect.objectContaining({
      colorSpace: 'rec2100-hlg',
    }));
  });

  it('SCC-009: throws when fallback context creation returns null', () => {
    const canvas = document.createElement('canvas');

    HTMLCanvasElement.prototype.getContext = vi.fn(function () {
      return null;
    }) as typeof HTMLCanvasElement.prototype.getContext;

    expect(() => safeCanvasContext2D(canvas, { alpha: false })).toThrow(
      'Failed to create 2D canvas context',
    );
  });

  it('SCC-008: merges colorSpace with existing baseOptions', () => {
    const canvas = document.createElement('canvas');
    const spy = vi.spyOn(canvas, 'getContext');

    safeCanvasContext2D(
      canvas,
      { alpha: false, willReadFrequently: true },
      'display-p3',
    );

    expect(spy).toHaveBeenCalledWith('2d', {
      alpha: false,
      willReadFrequently: true,
      colorSpace: 'display-p3',
    });
  });
});

describe('createViewerCanvas', () => {
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.restoreAllMocks();
  });

  function makeCaps(overrides: Partial<DisplayCapabilities> = {}): DisplayCapabilities {
    return { ...DEFAULT_CAPABILITIES, ...overrides };
  }

  it('SCC-010: createViewerCanvas returns HDR context when HLG mode and canvasHLG supported', () => {
    const mockCtx = { fillRect: vi.fn(), isHDR: true } as unknown as CanvasRenderingContext2D;

    HTMLCanvasElement.prototype.getContext = vi.fn(function (
      this: HTMLCanvasElement,
      contextId: string,
      options?: Record<string, unknown>,
    ) {
      if (contextId === '2d' && options && options.colorSpace === 'rec2100-hlg') {
        return mockCtx;
      }
      if (contextId === '2d') {
        return { fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;
      }
      return null;
    }) as typeof HTMLCanvasElement.prototype.getContext;

    const caps = makeCaps({ canvasHLG: true });
    const result = createViewerCanvas(caps, 'hlg');

    expect(result.ctx).toBe(mockCtx);
    expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  it('SCC-011: createViewerCanvas falls back to P3 when HDR fails', () => {
    let callCount = 0;
    const p3Ctx = { fillRect: vi.fn(), isP3: true } as unknown as CanvasRenderingContext2D;

    HTMLCanvasElement.prototype.getContext = vi.fn(function (
      this: HTMLCanvasElement,
      contextId: string,
      options?: Record<string, unknown>,
    ) {
      if (contextId === '2d') {
        callCount++;
        // First call: HLG attempt returns null
        if (callCount === 1 && options && options.colorSpace === 'rec2100-hlg') {
          return null;
        }
        // Second call: P3 attempt succeeds
        if (options && options.colorSpace === 'display-p3') {
          return p3Ctx;
        }
        return { fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;
      }
      return null;
    }) as typeof HTMLCanvasElement.prototype.getContext;

    const caps = makeCaps({ canvasHLG: true, canvasP3: true });
    const result = createViewerCanvas(caps, 'hlg');

    expect(result.ctx).toBe(p3Ctx);
  });

  it('SCC-012: createViewerCanvas falls back to sRGB when both HDR and P3 fail', () => {
    let callCount = 0;
    const srgbCtx = { fillRect: vi.fn(), isSRGB: true } as unknown as CanvasRenderingContext2D;

    HTMLCanvasElement.prototype.getContext = vi.fn(function (
      this: HTMLCanvasElement,
      contextId: string,
      options?: Record<string, unknown>,
    ) {
      if (contextId === '2d') {
        callCount++;
        // HLG attempt fails
        if (options && options.colorSpace === 'rec2100-hlg') {
          return null;
        }
        // P3 attempt fails
        if (options && options.colorSpace === 'display-p3') {
          return null;
        }
        // sRGB fallback succeeds
        return srgbCtx;
      }
      return null;
    }) as typeof HTMLCanvasElement.prototype.getContext;

    const caps = makeCaps({ canvasHLG: true, canvasP3: true });
    const result = createViewerCanvas(caps, 'hlg');

    expect(result.ctx).toBe(srgbCtx);
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it('SCC-013: createViewerCanvas skips HDR when mode is sdr', () => {
    const srgbCtx = { fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;

    HTMLCanvasElement.prototype.getContext = vi.fn(function (
      this: HTMLCanvasElement,
      contextId: string,
      options?: Record<string, unknown>,
    ) {
      if (contextId === '2d') {
        // Should not request rec2100-hlg for sdr mode
        if (options && options.colorSpace === 'rec2100-hlg') {
          throw new Error('Should not attempt HLG in SDR mode');
        }
        return srgbCtx;
      }
      return null;
    }) as typeof HTMLCanvasElement.prototype.getContext;

    const caps = makeCaps({ canvasHLG: true, canvasP3: false });
    const result = createViewerCanvas(caps, 'sdr');

    expect(result.ctx).toBe(srgbCtx);
  });

  it('SCC-014: createViewerCanvas throws when all contexts fail', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(function () {
      return null;
    }) as typeof HTMLCanvasElement.prototype.getContext;

    const caps = makeCaps();
    expect(() => createViewerCanvas(caps, 'sdr')).toThrow('Failed to create 2D canvas context');
  });
});
