/**
 * PerspectiveCorrectionManager Unit Tests
 *
 * Tests for the perspective correction state manager that owns perspective
 * parameters and applies corrections to canvas contexts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerspectiveCorrectionManager } from './PerspectiveCorrectionManager';
import {
  DEFAULT_PERSPECTIVE_PARAMS,
  PerspectiveCorrectionParams,
} from '../../transform/PerspectiveCorrection';

describe('PerspectiveCorrectionManager', () => {
  let manager: PerspectiveCorrectionManager;

  beforeEach(() => {
    manager = new PerspectiveCorrectionManager();
  });

  // ===========================================================================
  // State management
  // ===========================================================================

  describe('state management', () => {
    it('PCM-U001: should initialize with default perspective params', () => {
      expect(manager.getParams()).toEqual(DEFAULT_PERSPECTIVE_PARAMS);
    });

    it('PCM-U002: setParams should store the given parameters', () => {
      const custom: PerspectiveCorrectionParams = {
        enabled: true,
        topLeft: { x: 0.1, y: 0.05 },
        topRight: { x: 0.9, y: 0.1 },
        bottomRight: { x: 0.95, y: 0.9 },
        bottomLeft: { x: 0.05, y: 0.85 },
        quality: 'bicubic',
      };

      manager.setParams(custom);
      expect(manager.getParams()).toEqual(custom);
    });

    it('PCM-U003: setParams should preserve all parameter fields exactly', () => {
      const custom: PerspectiveCorrectionParams = {
        enabled: true,
        topLeft: { x: 0.123, y: 0.456 },
        topRight: { x: 0.789, y: 0.012 },
        bottomRight: { x: 0.345, y: 0.678 },
        bottomLeft: { x: 0.901, y: 0.234 },
        quality: 'bicubic',
      };

      manager.setParams(custom);
      const retrieved = manager.getParams();

      expect(retrieved.enabled).toBe(true);
      expect(retrieved.topLeft.x).toBe(0.123);
      expect(retrieved.topLeft.y).toBe(0.456);
      expect(retrieved.topRight.x).toBe(0.789);
      expect(retrieved.topRight.y).toBe(0.012);
      expect(retrieved.bottomRight.x).toBe(0.345);
      expect(retrieved.bottomRight.y).toBe(0.678);
      expect(retrieved.bottomLeft.x).toBe(0.901);
      expect(retrieved.bottomLeft.y).toBe(0.234);
      expect(retrieved.quality).toBe('bicubic');
    });

    it('PCM-U004: resetParams should restore defaults after custom params were set', () => {
      manager.setParams({
        enabled: true,
        topLeft: { x: 0.2, y: 0.2 },
        topRight: { x: 0.8, y: 0.1 },
        bottomRight: { x: 0.9, y: 0.9 },
        bottomLeft: { x: 0.1, y: 0.8 },
        quality: 'bicubic',
      });

      manager.resetParams();
      expect(manager.getParams()).toEqual(DEFAULT_PERSPECTIVE_PARAMS);
    });

    it('PCM-U005: resetParams on a fresh manager should keep defaults', () => {
      manager.resetParams();
      expect(manager.getParams()).toEqual(DEFAULT_PERSPECTIVE_PARAMS);
    });

    it('PCM-U006: setParams can be called multiple times and last value wins', () => {
      manager.setParams({ ...DEFAULT_PERSPECTIVE_PARAMS, topLeft: { x: 0.1, y: 0.1 } });
      manager.setParams({ ...DEFAULT_PERSPECTIVE_PARAMS, topLeft: { x: 0.2, y: 0.2 } });
      manager.setParams({ ...DEFAULT_PERSPECTIVE_PARAMS, topLeft: { x: 0.3, y: 0.3 } });

      expect(manager.getParams().topLeft).toEqual({ x: 0.3, y: 0.3 });
    });
  });

  // ===========================================================================
  // Deep-copy semantics
  // ===========================================================================

  describe('deep-copy semantics', () => {
    it('PCM-U010: getParams returns a new object each call', () => {
      const a = manager.getParams();
      const b = manager.getParams();

      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });

    it('PCM-U011: mutating the object returned by getParams does not affect internal state', () => {
      const params = manager.getParams();
      params.enabled = true;
      params.quality = 'bicubic';

      expect(manager.getParams().enabled).toBe(DEFAULT_PERSPECTIVE_PARAMS.enabled);
      expect(manager.getParams().quality).toBe(DEFAULT_PERSPECTIVE_PARAMS.quality);
    });

    it('PCM-U012: mutating nested Point2D from getParams does not affect internal state', () => {
      const params = manager.getParams();
      params.topLeft.x = 0.99;
      params.topLeft.y = 0.88;
      params.bottomRight.x = 0.11;

      expect(manager.getParams().topLeft.x).toBe(DEFAULT_PERSPECTIVE_PARAMS.topLeft.x);
      expect(manager.getParams().topLeft.y).toBe(DEFAULT_PERSPECTIVE_PARAMS.topLeft.y);
      expect(manager.getParams().bottomRight.x).toBe(DEFAULT_PERSPECTIVE_PARAMS.bottomRight.x);
    });

    it('PCM-U013: mutating the object passed to setParams after the call does not affect internal state', () => {
      const custom: PerspectiveCorrectionParams = {
        enabled: true,
        topLeft: { x: 0.1, y: 0.1 },
        topRight: { x: 0.9, y: 0.1 },
        bottomRight: { x: 0.9, y: 0.9 },
        bottomLeft: { x: 0.1, y: 0.9 },
        quality: 'bilinear',
      };

      manager.setParams(custom);

      // Mutate the original object after setting
      custom.topLeft.x = 0.99;
      custom.enabled = false;

      expect(manager.getParams().topLeft.x).toBe(0.1);
      expect(manager.getParams().enabled).toBe(true);
    });

    it('PCM-U014: resetParams creates a fresh copy independent of DEFAULT_PERSPECTIVE_PARAMS', () => {
      manager.resetParams();
      const params = manager.getParams();

      expect(params).toEqual(DEFAULT_PERSPECTIVE_PARAMS);

      // Mutating the returned value should not affect future calls
      params.topLeft.x = 0.99;
      expect(manager.getParams().topLeft.x).toBe(0);
    });

    it('PCM-U015: all four corner Point2D objects are independently copied', () => {
      const custom: PerspectiveCorrectionParams = {
        enabled: true,
        topLeft: { x: 0.1, y: 0.2 },
        topRight: { x: 0.8, y: 0.15 },
        bottomRight: { x: 0.85, y: 0.9 },
        bottomLeft: { x: 0.05, y: 0.85 },
        quality: 'bilinear',
      };

      manager.setParams(custom);
      const result = manager.getParams();

      // Each corner should be a different reference
      expect(result.topLeft).not.toBe(custom.topLeft);
      expect(result.topRight).not.toBe(custom.topRight);
      expect(result.bottomRight).not.toBe(custom.bottomRight);
      expect(result.bottomLeft).not.toBe(custom.bottomLeft);
    });
  });

  // ===========================================================================
  // params getter
  // ===========================================================================

  describe('params getter', () => {
    it('PCM-U020: params getter returns current state', () => {
      expect(manager.params).toEqual(DEFAULT_PERSPECTIVE_PARAMS);
    });

    it('PCM-U021: params getter reflects changes after setParams', () => {
      const custom: PerspectiveCorrectionParams = {
        ...DEFAULT_PERSPECTIVE_PARAMS,
        enabled: true,
        topLeft: { x: 0.15, y: 0.1 },
        topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
        bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
        bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
      };

      manager.setParams(custom);
      expect(manager.params.enabled).toBe(true);
      expect(manager.params.topLeft.x).toBe(0.15);
    });

    it('PCM-U022: params getter reflects changes after resetParams', () => {
      manager.setParams({
        ...DEFAULT_PERSPECTIVE_PARAMS,
        enabled: true,
        topLeft: { x: 0.5, y: 0.5 },
        topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
        bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
        bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
      });
      manager.resetParams();

      expect(manager.params).toEqual(DEFAULT_PERSPECTIVE_PARAMS);
    });

    it('PCM-U023: params getter returns the internal reference (not a copy)', () => {
      const ref1 = manager.params;
      const ref2 = manager.params;

      expect(ref1).toBe(ref2);
    });
  });

  // ===========================================================================
  // isDefault
  // ===========================================================================

  describe('isDefault', () => {
    it('PCM-U030: isDefault returns true for a freshly constructed manager', () => {
      expect(manager.isDefault()).toBe(true);
    });

    it('PCM-U031: isDefault returns false after enabling', () => {
      manager.setParams({
        ...DEFAULT_PERSPECTIVE_PARAMS,
        enabled: true,
        topLeft: { x: 0.1, y: 0.0 },
        topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
        bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
        bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
      });
      expect(manager.isDefault()).toBe(false);
    });

    it('PCM-U032: isDefault returns false after moving topLeft', () => {
      manager.setParams({
        ...DEFAULT_PERSPECTIVE_PARAMS,
        enabled: true,
        topLeft: { x: 0.1, y: 0.1 },
        topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
        bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
        bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
      });
      expect(manager.isDefault()).toBe(false);
    });

    it('PCM-U033: isDefault returns false after moving topRight', () => {
      manager.setParams({
        ...DEFAULT_PERSPECTIVE_PARAMS,
        enabled: true,
        topLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.topLeft },
        topRight: { x: 0.9, y: 0.05 },
        bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
        bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
      });
      expect(manager.isDefault()).toBe(false);
    });

    it('PCM-U034: isDefault returns false after moving bottomRight', () => {
      manager.setParams({
        ...DEFAULT_PERSPECTIVE_PARAMS,
        enabled: true,
        topLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.topLeft },
        topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
        bottomRight: { x: 0.95, y: 0.95 },
        bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
      });
      expect(manager.isDefault()).toBe(false);
    });

    it('PCM-U035: isDefault returns false after moving bottomLeft', () => {
      manager.setParams({
        ...DEFAULT_PERSPECTIVE_PARAMS,
        enabled: true,
        topLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.topLeft },
        topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
        bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
        bottomLeft: { x: 0.05, y: 0.95 },
      });
      expect(manager.isDefault()).toBe(false);
    });

    it('PCM-U036: isDefault returns true after reset', () => {
      manager.setParams({
        enabled: true,
        topLeft: { x: 0.2, y: 0.2 },
        topRight: { x: 0.8, y: 0.1 },
        bottomRight: { x: 0.9, y: 0.9 },
        bottomLeft: { x: 0.1, y: 0.8 },
        quality: 'bicubic',
      });

      expect(manager.isDefault()).toBe(false);

      manager.resetParams();
      expect(manager.isDefault()).toBe(true);
    });

    it('PCM-U037: isDefault returns true when enabled is false even with default corners', () => {
      // Default params have enabled=false and default corners → isDefault
      manager.setParams({
        ...DEFAULT_PERSPECTIVE_PARAMS,
        topLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.topLeft },
        topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
        bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
        bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
      });
      expect(manager.isDefault()).toBe(true);
    });
  });

  // ===========================================================================
  // applyToCtx
  // ===========================================================================

  describe('applyToCtx', () => {
    it('PCM-U050: applyToCtx does nothing when params are default', () => {
      const ctx = {
        getImageData: vi.fn(),
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      manager.applyToCtx(ctx, 100, 100);

      expect(ctx.getImageData).not.toHaveBeenCalled();
      expect(ctx.putImageData).not.toHaveBeenCalled();
    });

    it('PCM-U051: applyToCtx calls getImageData and putImageData when params are non-default', () => {
      manager.setParams({
        enabled: true,
        topLeft: { x: 0.1, y: 0.1 },
        topRight: { x: 0.9, y: 0.0 },
        bottomRight: { x: 1.0, y: 1.0 },
        bottomLeft: { x: 0.0, y: 0.9 },
        quality: 'bilinear',
      });

      const mockImageData = new ImageData(4, 4);
      const ctx = {
        getImageData: vi.fn(() => mockImageData),
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      manager.applyToCtx(ctx, 4, 4);

      expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 4, 4);
      expect(ctx.putImageData).toHaveBeenCalledTimes(1);
    });

    it('PCM-U052: applyToCtx passes correct width and height to getImageData', () => {
      manager.setParams({
        enabled: true,
        topLeft: { x: 0.05, y: 0.05 },
        topRight: { x: 0.95, y: 0.0 },
        bottomRight: { x: 1.0, y: 1.0 },
        bottomLeft: { x: 0.0, y: 0.95 },
        quality: 'bilinear',
      });

      const mockImageData = new ImageData(200, 150);
      const ctx = {
        getImageData: vi.fn(() => mockImageData),
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      manager.applyToCtx(ctx, 200, 150);

      expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 200, 150);
    });

    it('PCM-U053: applyToCtx puts corrected data at origin (0, 0)', () => {
      manager.setParams({
        enabled: true,
        topLeft: { x: 0.1, y: 0.1 },
        topRight: { x: 0.9, y: 0.0 },
        bottomRight: { x: 1.0, y: 1.0 },
        bottomLeft: { x: 0.0, y: 0.9 },
        quality: 'bilinear',
      });

      const mockImageData = new ImageData(10, 10);
      const ctx = {
        getImageData: vi.fn(() => mockImageData),
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      manager.applyToCtx(ctx, 10, 10);

      expect(ctx.putImageData).toHaveBeenCalledWith(expect.any(ImageData), 0, 0);
    });

    it('PCM-U054: applyToCtx returns a different ImageData than the source', () => {
      manager.setParams({
        enabled: true,
        topLeft: { x: 0.1, y: 0.1 },
        topRight: { x: 0.9, y: 0.0 },
        bottomRight: { x: 1.0, y: 1.0 },
        bottomLeft: { x: 0.0, y: 0.9 },
        quality: 'bilinear',
      });

      const sourceImageData = new ImageData(4, 4);
      for (let i = 0; i < sourceImageData.data.length; i++) {
        sourceImageData.data[i] = 128;
      }

      let putData: ImageData | undefined;
      const ctx = {
        getImageData: vi.fn(() => sourceImageData),
        putImageData: vi.fn((data: ImageData) => {
          putData = data;
        }),
      } as unknown as CanvasRenderingContext2D;

      manager.applyToCtx(ctx, 4, 4);

      expect(putData).toBeInstanceOf(ImageData);
      expect(putData).not.toBe(sourceImageData);
    });

    it('PCM-U055: applyToCtx skips processing after resetParams', () => {
      manager.setParams({
        enabled: true,
        topLeft: { x: 0.1, y: 0.1 },
        topRight: { x: 0.9, y: 0.0 },
        bottomRight: { x: 1.0, y: 1.0 },
        bottomLeft: { x: 0.0, y: 0.9 },
        quality: 'bilinear',
      });
      manager.resetParams();

      const ctx = {
        getImageData: vi.fn(),
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      manager.applyToCtx(ctx, 100, 100);

      expect(ctx.getImageData).not.toHaveBeenCalled();
      expect(ctx.putImageData).not.toHaveBeenCalled();
    });

    it('PCM-U056: applyToCtx works with bicubic quality', () => {
      manager.setParams({
        enabled: true,
        topLeft: { x: 0.05, y: 0.05 },
        topRight: { x: 0.95, y: 0.0 },
        bottomRight: { x: 1.0, y: 0.95 },
        bottomLeft: { x: 0.0, y: 0.9 },
        quality: 'bicubic',
      });

      const mockImageData = new ImageData(8, 8);
      const ctx = {
        getImageData: vi.fn(() => mockImageData),
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      manager.applyToCtx(ctx, 8, 8);

      expect(ctx.getImageData).toHaveBeenCalledOnce();
      expect(ctx.putImageData).toHaveBeenCalledOnce();
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe('edge cases', () => {
    it('PCM-U060: setParams followed by getParams round-trips correctly', () => {
      const params: PerspectiveCorrectionParams = {
        enabled: true,
        topLeft: { x: 0.15, y: 0.1 },
        topRight: { x: 0.85, y: 0.05 },
        bottomRight: { x: 0.9, y: 0.95 },
        bottomLeft: { x: 0.05, y: 0.9 },
        quality: 'bicubic',
      };

      manager.setParams(params);
      expect(manager.getParams()).toEqual(params);
    });

    it('PCM-U061: multiple resets do not cause errors', () => {
      manager.resetParams();
      manager.resetParams();
      manager.resetParams();

      expect(manager.getParams()).toEqual(DEFAULT_PERSPECTIVE_PARAMS);
      expect(manager.isDefault()).toBe(true);
    });

    it('PCM-U062: setParams with exact default values results in isDefault true', () => {
      manager.setParams({
        ...DEFAULT_PERSPECTIVE_PARAMS,
        topLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.topLeft },
        topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
        bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
        bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
      });
      expect(manager.isDefault()).toBe(true);
    });

    it('PCM-U063: params getter and getParams return equivalent data', () => {
      manager.setParams({
        enabled: true,
        topLeft: { x: 0.1, y: 0.2 },
        topRight: { x: 0.9, y: 0.0 },
        bottomRight: { x: 1.0, y: 1.0 },
        bottomLeft: { x: 0.0, y: 0.8 },
        quality: 'bicubic',
      });

      const fromGetter = manager.params;
      const fromMethod = manager.getParams();

      expect(fromGetter).toEqual(fromMethod);
    });

    it('PCM-U064: both quality types are accepted by setParams', () => {
      const qualities: PerspectiveCorrectionParams['quality'][] = ['bilinear', 'bicubic'];

      for (const quality of qualities) {
        manager.setParams({
          ...DEFAULT_PERSPECTIVE_PARAMS,
          topLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.topLeft },
          topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
          bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
          bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
          quality,
        });
        expect(manager.getParams().quality).toBe(quality);
      }
    });
  });
});
