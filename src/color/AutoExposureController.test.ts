import { describe, it, expect } from 'vitest';
import { AutoExposureController, DEFAULT_AUTO_EXPOSURE_STATE } from './AutoExposureController';
import type { AutoExposureState } from './AutoExposureController';
import { DEFAULT_AUTO_EXPOSURE_STATE as CANONICAL_DEFAULT } from '../core/types/effects';
import type { AutoExposureState as CanonicalAutoExposureState } from '../core/types/effects';

describe('AutoExposureController', () => {
  const defaultConfig: AutoExposureState = { ...DEFAULT_AUTO_EXPOSURE_STATE, enabled: true };

  describe('type re-exports', () => {
    it('re-exports DEFAULT_AUTO_EXPOSURE_STATE from effects.ts', () => {
      // The re-export from AutoExposureController should be the same object as effects.ts
      expect(DEFAULT_AUTO_EXPOSURE_STATE).toBe(CANONICAL_DEFAULT);
    });

    it('re-exported AutoExposureState is compatible with canonical type', () => {
      // Verify the re-exported type is structurally identical
      const local: AutoExposureState = { ...DEFAULT_AUTO_EXPOSURE_STATE, enabled: true };
      const canonical: CanonicalAutoExposureState = local;
      expect(canonical.enabled).toBe(true);
      expect(canonical.targetKey).toBe(0.18);
      expect(canonical.adaptationSpeed).toBe(0.05);
      expect(canonical.minExposure).toBe(-5.0);
      expect(canonical.maxExposure).toBe(5.0);
    });
  });

  describe('first frame', () => {
    it('instantly converges to target exposure on first update', () => {
      const ctrl = new AutoExposureController();
      ctrl.update(0.18, defaultConfig);
      // targetKey / avgLuminance = 0.18 / 0.18 = 1.0, log2(1) = 0
      expect(ctrl.currentExposure).toBeCloseTo(0, 2);
    });

    it('computes correct exposure for dark scene on first frame', () => {
      const ctrl = new AutoExposureController();
      ctrl.update(0.01, defaultConfig);
      // log2(0.18 / 0.01) = log2(18) ≈ 4.17
      expect(ctrl.currentExposure).toBeGreaterThan(3);
      expect(ctrl.currentExposure).toBeLessThan(5);
    });

    it('computes correct exposure for bright scene on first frame', () => {
      const ctrl = new AutoExposureController();
      ctrl.update(2.0, defaultConfig);
      // log2(0.18 / 2.0) ≈ -3.47
      expect(ctrl.currentExposure).toBeLessThan(0);
      expect(ctrl.currentExposure).toBeGreaterThan(-5);
    });
  });

  describe('temporal smoothing', () => {
    it('smoothly converges from dark to bright', () => {
      const ctrl = new AutoExposureController();
      const config = { ...defaultConfig, adaptationSpeed: 0.1 };

      // Start with dark scene
      ctrl.update(0.01, config);
      const darkExposure = ctrl.currentExposure;
      expect(darkExposure).toBeGreaterThan(0);

      // Switch to bright scene - should smoothly adapt
      for (let i = 0; i < 10; i++) {
        ctrl.update(2.0, config);
      }
      const afterBright = ctrl.currentExposure;
      // Should have moved toward negative exposure but not fully converged
      expect(afterBright).toBeLessThan(darkExposure);
    });

    it('converges to stable value with constant input', () => {
      const ctrl = new AutoExposureController();
      const config = { ...defaultConfig, adaptationSpeed: 0.3 };

      for (let i = 0; i < 100; i++) {
        ctrl.update(0.5, config);
      }
      const expected = Math.log2(0.18 / 0.5);
      expect(ctrl.currentExposure).toBeCloseTo(expected, 1);
    });
  });

  describe('clamping', () => {
    it('clamps to maxExposure for pure black', () => {
      const ctrl = new AutoExposureController();
      const config = { ...defaultConfig, maxExposure: 5.0 };
      ctrl.update(0, config); // zero → clampLuminance → 1e-6 → very high exposure
      expect(ctrl.currentExposure).toBeLessThanOrEqual(5.0);
    });

    it('clamps to minExposure for very bright scene', () => {
      const ctrl = new AutoExposureController();
      const config = { ...defaultConfig, minExposure: -5.0 };
      ctrl.update(1e6, config); // very bright → very negative exposure
      expect(ctrl.currentExposure).toBeGreaterThanOrEqual(-5.0);
    });
  });

  describe('toggle off', () => {
    it('does not change exposure when disabled', () => {
      const ctrl = new AutoExposureController();
      ctrl.update(0.01, defaultConfig);
      const before = ctrl.currentExposure;

      ctrl.update(2.0, { ...defaultConfig, enabled: false });
      expect(ctrl.currentExposure).toBe(before);
    });
  });

  describe('reset', () => {
    it('resets to initial state', () => {
      const ctrl = new AutoExposureController();
      ctrl.update(0.5, defaultConfig);
      expect(ctrl.currentExposure).not.toBe(0);

      ctrl.reset();
      expect(ctrl.currentExposure).toBe(0);
    });

    it('uses instant convergence after reset', () => {
      const ctrl = new AutoExposureController();
      ctrl.update(0.01, defaultConfig);

      ctrl.reset();
      ctrl.update(2.0, defaultConfig);
      // Should instantly converge, not smooth from previous
      const expected = Math.log2(0.18 / 2.0);
      expect(ctrl.currentExposure).toBeCloseTo(expected, 1);
    });
  });

  describe('computeBatch', () => {
    it('returns empty map when disabled', () => {
      const ctrl = new AutoExposureController();
      const luminances = new Map([[1, 0.5], [2, 0.3]]);
      const result = ctrl.computeBatch(luminances, { ...defaultConfig, enabled: false });
      expect(result.size).toBe(0);
    });

    it('applies temporal smoothing across frames', () => {
      const ctrl = new AutoExposureController();
      const luminances = new Map([
        [1, 0.01],  // dark
        [2, 0.01],  // dark
        [3, 2.0],   // bright jump
        [4, 2.0],   // bright
        [5, 2.0],   // bright
      ]);
      const config = { ...defaultConfig, adaptationSpeed: 0.2 };
      const result = ctrl.computeBatch(luminances, config);

      expect(result.size).toBe(5);
      // Frame 1: instant convergence
      const f1 = result.get(1)!;
      expect(f1).toBeGreaterThan(0);

      // Frame 3 should start adapting toward bright (negative) but not fully
      const f3 = result.get(3)!;
      const f5 = result.get(5)!;
      expect(f5).toBeLessThan(f3); // still converging toward negative
    });
  });
});
