/**
 * SafeCanvasContext Unit Tests
 *
 * Tests for the safeCanvasContext2D helper that wraps canvas
 * context creation with fallback logic for unsupported color spaces.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeCanvasContext2D } from './SafeCanvasContext';

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
