/**
 * LensDistortionManager Unit Tests
 *
 * Tests for the lens distortion state manager that owns distortion
 * parameters and applies corrections to canvas contexts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LensDistortionManager } from './LensDistortionManager';
import {
  DEFAULT_LENS_PARAMS,
  LensDistortionParams,
} from '../../transform/LensDistortion';

describe('LensDistortionManager', () => {
  let manager: LensDistortionManager;

  beforeEach(() => {
    manager = new LensDistortionManager();
  });

  // ===========================================================================
  // State management
  // ===========================================================================

  describe('state management', () => {
    it('LDM-U001: should initialize with default lens params', () => {
      expect(manager.getLensParams()).toEqual(DEFAULT_LENS_PARAMS);
    });

    it('LDM-U002: setLensParams should store the given parameters', () => {
      const custom: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: 0.25,
        k2: -0.1,
        centerX: 0.05,
        centerY: -0.03,
        scale: 1.2,
      };

      manager.setLensParams(custom);
      expect(manager.getLensParams()).toEqual(custom);
    });

    it('LDM-U003: setLensParams should preserve all parameter fields exactly', () => {
      const custom: LensDistortionParams = {
        k1: 0.123,
        k2: -0.456,
        k3: 0.01,
        p1: 0.002,
        p2: -0.003,
        centerX: 0.05,
        centerY: -0.05,
        scale: 1.25,
        model: 'opencv',
        pixelAspectRatio: 1.1,
        fx: 0.9,
        fy: 0.85,
        cropRatioX: 0.95,
        cropRatioY: 0.98,
      };

      manager.setLensParams(custom);
      const retrieved = manager.getLensParams();

      expect(retrieved.k1).toBe(0.123);
      expect(retrieved.k2).toBe(-0.456);
      expect(retrieved.k3).toBe(0.01);
      expect(retrieved.p1).toBe(0.002);
      expect(retrieved.p2).toBe(-0.003);
      expect(retrieved.centerX).toBe(0.05);
      expect(retrieved.centerY).toBe(-0.05);
      expect(retrieved.scale).toBe(1.25);
      expect(retrieved.model).toBe('opencv');
      expect(retrieved.pixelAspectRatio).toBe(1.1);
      expect(retrieved.fx).toBe(0.9);
      expect(retrieved.fy).toBe(0.85);
      expect(retrieved.cropRatioX).toBe(0.95);
      expect(retrieved.cropRatioY).toBe(0.98);
    });

    it('LDM-U004: resetLensParams should restore defaults after custom params were set', () => {
      manager.setLensParams({
        ...DEFAULT_LENS_PARAMS,
        k1: 0.3,
        k2: -0.15,
        scale: 1.5,
      });

      manager.resetLensParams();
      expect(manager.getLensParams()).toEqual(DEFAULT_LENS_PARAMS);
    });

    it('LDM-U005: resetLensParams on a fresh manager should keep defaults', () => {
      manager.resetLensParams();
      expect(manager.getLensParams()).toEqual(DEFAULT_LENS_PARAMS);
    });

    it('LDM-U006: setLensParams can be called multiple times and last value wins', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.1 });
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.2 });
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.3 });

      expect(manager.getLensParams().k1).toBe(0.3);
    });
  });

  // ===========================================================================
  // Deep-copy semantics
  // ===========================================================================

  describe('deep-copy semantics', () => {
    it('LDM-U010: getLensParams returns a new object each call', () => {
      const a = manager.getLensParams();
      const b = manager.getLensParams();

      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });

    it('LDM-U011: mutating the object returned by getLensParams does not affect internal state', () => {
      const params = manager.getLensParams();
      params.k1 = 999;
      params.scale = 42;

      expect(manager.getLensParams().k1).toBe(DEFAULT_LENS_PARAMS.k1);
      expect(manager.getLensParams().scale).toBe(DEFAULT_LENS_PARAMS.scale);
    });

    it('LDM-U012: mutating the object passed to setLensParams after the call does not affect internal state', () => {
      const custom: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: 0.5,
      };

      manager.setLensParams(custom);

      // Mutate the original object after setting
      custom.k1 = 999;

      expect(manager.getLensParams().k1).toBe(0.5);
    });

    it('LDM-U013: resetLensParams creates a fresh copy independent of DEFAULT_LENS_PARAMS', () => {
      manager.resetLensParams();
      const params = manager.getLensParams();

      // The returned params should be equal but not the same reference
      expect(params).toEqual(DEFAULT_LENS_PARAMS);

      // Mutating the returned value should not affect future calls
      params.k1 = 999;
      expect(manager.getLensParams().k1).toBe(0);
    });
  });

  // ===========================================================================
  // Getter: lensParams
  // ===========================================================================

  describe('lensParams getter', () => {
    it('LDM-U020: lensParams getter returns current state', () => {
      expect(manager.lensParams).toEqual(DEFAULT_LENS_PARAMS);
    });

    it('LDM-U021: lensParams getter reflects changes after setLensParams', () => {
      const custom: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: 0.42,
        centerX: 0.1,
      };

      manager.setLensParams(custom);
      expect(manager.lensParams).toEqual(custom);
    });

    it('LDM-U022: lensParams getter reflects changes after resetLensParams', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.5 });
      manager.resetLensParams();

      expect(manager.lensParams).toEqual(DEFAULT_LENS_PARAMS);
    });

    it('LDM-U023: lensParams getter returns the internal reference (not a copy)', () => {
      // The getter returns the direct reference (unlike getLensParams which copies)
      const ref1 = manager.lensParams;
      const ref2 = manager.lensParams;

      // Both point to the same internal object
      expect(ref1).toBe(ref2);
    });
  });

  // ===========================================================================
  // isDefault
  // ===========================================================================

  describe('isDefault', () => {
    it('LDM-U030: isDefault returns true for a freshly constructed manager', () => {
      expect(manager.isDefault()).toBe(true);
    });

    it('LDM-U031: isDefault returns false after setting non-default k1', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.1 });
      expect(manager.isDefault()).toBe(false);
    });

    it('LDM-U032: isDefault returns false after setting non-default k2', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, k2: -0.05 });
      expect(manager.isDefault()).toBe(false);
    });

    it('LDM-U033: isDefault returns false after setting non-default k3', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, k3: 0.01 });
      expect(manager.isDefault()).toBe(false);
    });

    it('LDM-U034: isDefault returns false after setting non-default p1', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, p1: 0.005 });
      expect(manager.isDefault()).toBe(false);
    });

    it('LDM-U035: isDefault returns false after setting non-default p2', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, p2: -0.003 });
      expect(manager.isDefault()).toBe(false);
    });

    it('LDM-U036: isDefault returns false after setting non-default centerX', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, centerX: 0.02 });
      expect(manager.isDefault()).toBe(false);
    });

    it('LDM-U037: isDefault returns false after setting non-default centerY', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, centerY: -0.04 });
      expect(manager.isDefault()).toBe(false);
    });

    it('LDM-U038: isDefault returns false after setting non-default scale', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, scale: 1.5 });
      expect(manager.isDefault()).toBe(false);
    });

    it('LDM-U039: isDefault returns true after reset', () => {
      manager.setLensParams({
        ...DEFAULT_LENS_PARAMS,
        k1: 0.3,
        k2: -0.1,
        scale: 1.2,
      });

      expect(manager.isDefault()).toBe(false);

      manager.resetLensParams();
      expect(manager.isDefault()).toBe(true);
    });

    it('LDM-U040: isDefault returns true when non-checked fields differ but checked fields are default', () => {
      // isDefaultLensParams only checks k1, k2, k3, p1, p2, centerX, centerY, scale
      // Fields like model, pixelAspectRatio, fx, fy, cropRatioX, cropRatioY are not checked
      manager.setLensParams({
        ...DEFAULT_LENS_PARAMS,
        model: 'opencv',
        pixelAspectRatio: 2,
        fx: 0.5,
        fy: 0.5,
        cropRatioX: 0.8,
        cropRatioY: 0.8,
      });

      expect(manager.isDefault()).toBe(true);
    });
  });

  // ===========================================================================
  // applyToCtx
  // ===========================================================================

  describe('applyToCtx', () => {
    it('LDM-U050: applyToCtx does nothing when params are default', () => {
      const ctx = {
        getImageData: vi.fn(),
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      manager.applyToCtx(ctx, 100, 100);

      expect(ctx.getImageData).not.toHaveBeenCalled();
      expect(ctx.putImageData).not.toHaveBeenCalled();
    });

    it('LDM-U051: applyToCtx calls getImageData and putImageData when params are non-default', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.2 });

      const mockImageData = new ImageData(4, 4);
      const ctx = {
        getImageData: vi.fn(() => mockImageData),
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      manager.applyToCtx(ctx, 4, 4);

      expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 4, 4);
      expect(ctx.putImageData).toHaveBeenCalledTimes(1);
    });

    it('LDM-U052: applyToCtx passes correct width and height to getImageData', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: -0.1 });

      const mockImageData = new ImageData(200, 150);
      const ctx = {
        getImageData: vi.fn(() => mockImageData),
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      manager.applyToCtx(ctx, 200, 150);

      expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 200, 150);
    });

    it('LDM-U053: applyToCtx puts corrected data at origin (0, 0)', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.15 });

      const mockImageData = new ImageData(10, 10);
      const ctx = {
        getImageData: vi.fn(() => mockImageData),
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      manager.applyToCtx(ctx, 10, 10);

      expect(ctx.putImageData).toHaveBeenCalledWith(expect.any(ImageData), 0, 0);
    });

    it('LDM-U054: applyToCtx returns a different ImageData than the source (distortion applied)', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.3 });

      const sourceImageData = new ImageData(4, 4);
      // Fill with non-zero pixel data
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
      // The corrected ImageData should not be the same reference as the source
      expect(putData).not.toBe(sourceImageData);
    });

    it('LDM-U055: applyToCtx skips processing after resetLensParams', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.2 });
      manager.resetLensParams();

      const ctx = {
        getImageData: vi.fn(),
        putImageData: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      manager.applyToCtx(ctx, 100, 100);

      expect(ctx.getImageData).not.toHaveBeenCalled();
      expect(ctx.putImageData).not.toHaveBeenCalled();
    });

    it('LDM-U056: applyToCtx works with various non-default parameter combinations', () => {
      manager.setLensParams({
        ...DEFAULT_LENS_PARAMS,
        k1: -0.2,
        k2: 0.05,
        p1: 0.001,
        centerX: 0.03,
        scale: 1.1,
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
  // Edge cases and integration
  // ===========================================================================

  describe('edge cases', () => {
    it('LDM-U060: setLensParams followed by getLensParams round-trips correctly', () => {
      const params: LensDistortionParams = {
        k1: -0.999,
        k2: 0.999,
        k3: -0.5,
        p1: 0.1,
        p2: -0.1,
        centerX: -0.5,
        centerY: 0.5,
        scale: 2.0,
        model: '3de4_anamorphic',
        pixelAspectRatio: 2.0,
        fx: 0.5,
        fy: 0.5,
        cropRatioX: 0.5,
        cropRatioY: 0.5,
      };

      manager.setLensParams(params);
      expect(manager.getLensParams()).toEqual(params);
    });

    it('LDM-U061: multiple resets do not cause errors', () => {
      manager.resetLensParams();
      manager.resetLensParams();
      manager.resetLensParams();

      expect(manager.getLensParams()).toEqual(DEFAULT_LENS_PARAMS);
      expect(manager.isDefault()).toBe(true);
    });

    it('LDM-U062: setLensParams with exact default values results in isDefault true', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS });
      expect(manager.isDefault()).toBe(true);
    });

    it('LDM-U063: lensParams getter and getLensParams return equivalent data', () => {
      manager.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.33 });

      const fromGetter = manager.lensParams;
      const fromMethod = manager.getLensParams();

      expect(fromGetter).toEqual(fromMethod);
    });

    it('LDM-U064: all model types are accepted by setLensParams', () => {
      const models: LensDistortionParams['model'][] = [
        'brown',
        'opencv',
        'pfbarrel',
        '3de4_radial_standard',
        '3de4_anamorphic',
      ];

      for (const model of models) {
        manager.setLensParams({ ...DEFAULT_LENS_PARAMS, model });
        expect(manager.getLensParams().model).toBe(model);
      }
    });
  });
});
