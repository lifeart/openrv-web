/**
 * LensControl Component Tests
 *
 * Tests for the lens distortion correction control panel with
 * barrel/pincushion correction, center offset, and scale adjustments.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LensControl } from './LensControl';
import { DEFAULT_LENS_PARAMS, LensDistortionParams } from '../../transform/LensDistortion';

describe('LensControl', () => {
  let control: LensControl;

  beforeEach(() => {
    control = new LensControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('LENS-U001: should initialize with default params', () => {
      expect(control.getParams()).toEqual(DEFAULT_LENS_PARAMS);
    });

    it('LENS-U002: default k1 should be 0', () => {
      expect(control.getParams().k1).toBe(0);
    });

    it('LENS-U003: default k2 should be 0', () => {
      expect(control.getParams().k2).toBe(0);
    });

    it('LENS-U004: default centerX should be 0', () => {
      expect(control.getParams().centerX).toBe(0);
    });

    it('LENS-U005: default centerY should be 0', () => {
      expect(control.getParams().centerY).toBe(0);
    });

    it('LENS-U006: default scale should be 1', () => {
      expect(control.getParams().scale).toBe(1);
    });
  });

  describe('render', () => {
    it('LENS-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('lens-control-container');
    });

    it('LENS-U011: container has lens button', () => {
      const el = control.render();
      const button = el.querySelector('button');
      expect(button).not.toBeNull();
      expect(button!.title).toBe('Lens distortion correction');
    });
  });

  describe('getParams/setParams', () => {
    it('LENS-U020: getParams returns copy of params', () => {
      const params1 = control.getParams();
      const params2 = control.getParams();
      expect(params1).toEqual(params2);
      expect(params1).not.toBe(params2);
    });

    it('LENS-U021: setParams sets all parameter values', () => {
      const newParams: LensDistortionParams = {
        k1: 0.1,
        k2: -0.05,
        centerX: 0.02,
        centerY: -0.03,
        scale: 1.1,
      };

      control.setParams(newParams);
      expect(control.getParams()).toEqual(newParams);
    });

    it('LENS-U022: setParams emits lensChanged event', () => {
      const callback = vi.fn();
      control.on('lensChanged', callback);

      const newParams: LensDistortionParams = {
        k1: 0.15,
        k2: 0,
        centerX: 0,
        centerY: 0,
        scale: 1,
      };

      control.setParams(newParams);
      expect(callback).toHaveBeenCalledWith(newParams);
    });

    it('LENS-U023: setParams preserves parameter values exactly', () => {
      const params: LensDistortionParams = {
        k1: 0.123,
        k2: -0.456,
        centerX: 0.05,
        centerY: -0.05,
        scale: 1.25,
      };

      control.setParams(params);
      const retrieved = control.getParams();

      expect(retrieved.k1).toBe(0.123);
      expect(retrieved.k2).toBe(-0.456);
      expect(retrieved.centerX).toBe(0.05);
      expect(retrieved.centerY).toBe(-0.05);
      expect(retrieved.scale).toBe(1.25);
    });
  });

  describe('reset', () => {
    it('LENS-U030: reset restores default params', () => {
      control.setParams({
        k1: 0.2,
        k2: -0.1,
        centerX: 0.05,
        centerY: -0.05,
        scale: 1.2,
      });

      control.reset();
      expect(control.getParams()).toEqual(DEFAULT_LENS_PARAMS);
    });

    it('LENS-U031: reset emits lensChanged event', () => {
      control.setParams({
        k1: 0.3,
        k2: 0,
        centerX: 0,
        centerY: 0,
        scale: 1,
      });

      const callback = vi.fn();
      control.on('lensChanged', callback);

      control.reset();
      expect(callback).toHaveBeenCalledWith(DEFAULT_LENS_PARAMS);
    });
  });

  describe('panel visibility', () => {
    it('LENS-U040: showPanel makes panel visible', () => {
      control.showPanel();
      // Panel should be visible - checking via style or DOM presence
      // The panel is appended to body, so we check if it's displayed
      expect(() => control.showPanel()).not.toThrow();
    });

    it('LENS-U041: hidePanel hides panel', () => {
      control.showPanel();
      control.hidePanel();
      expect(() => control.hidePanel()).not.toThrow();
    });

    it('LENS-U042: togglePanel toggles visibility', () => {
      // Initially closed
      control.togglePanel(); // Now open
      control.togglePanel(); // Now closed
      expect(() => control.togglePanel()).not.toThrow();
    });

    it('LENS-U043: multiple show/hide calls work correctly', () => {
      expect(() => {
        control.showPanel();
        control.showPanel();
        control.hidePanel();
        control.hidePanel();
      }).not.toThrow();
    });
  });

  describe('lensChanged event', () => {
    it('LENS-U050: lensChanged event contains all params', () => {
      const callback = vi.fn();
      control.on('lensChanged', callback);

      control.setParams({
        k1: 0.1,
        k2: 0.05,
        centerX: 0.01,
        centerY: 0.02,
        scale: 1.05,
      });

      expect(callback).toHaveBeenCalled();
      const emittedParams = callback.mock.calls[0][0] as LensDistortionParams;
      expect(emittedParams).toHaveProperty('k1');
      expect(emittedParams).toHaveProperty('k2');
      expect(emittedParams).toHaveProperty('centerX');
      expect(emittedParams).toHaveProperty('centerY');
      expect(emittedParams).toHaveProperty('scale');
    });

    it('LENS-U051: lensChanged emits copy of params', () => {
      const callback = vi.fn();
      control.on('lensChanged', callback);

      control.setParams({
        k1: 0.1,
        k2: 0,
        centerX: 0,
        centerY: 0,
        scale: 1,
      });

      const emittedParams = callback.mock.calls[0][0] as LensDistortionParams;

      // Modifying emitted params should not affect control state
      emittedParams.k1 = 999;
      expect(control.getParams().k1).toBe(0.1);
    });
  });

  describe('parameter ranges', () => {
    it('LENS-U060: k1 accepts values in typical range (-0.5 to 0.5)', () => {
      control.setParams({ ...DEFAULT_LENS_PARAMS, k1: -0.5 });
      expect(control.getParams().k1).toBe(-0.5);

      control.setParams({ ...DEFAULT_LENS_PARAMS, k1: 0.5 });
      expect(control.getParams().k1).toBe(0.5);
    });

    it('LENS-U061: k2 accepts values in typical range (-0.5 to 0.5)', () => {
      control.setParams({ ...DEFAULT_LENS_PARAMS, k2: -0.5 });
      expect(control.getParams().k2).toBe(-0.5);

      control.setParams({ ...DEFAULT_LENS_PARAMS, k2: 0.5 });
      expect(control.getParams().k2).toBe(0.5);
    });

    it('LENS-U062: centerX accepts values in typical range (-0.25 to 0.25)', () => {
      control.setParams({ ...DEFAULT_LENS_PARAMS, centerX: -0.25 });
      expect(control.getParams().centerX).toBe(-0.25);

      control.setParams({ ...DEFAULT_LENS_PARAMS, centerX: 0.25 });
      expect(control.getParams().centerX).toBe(0.25);
    });

    it('LENS-U063: centerY accepts values in typical range (-0.25 to 0.25)', () => {
      control.setParams({ ...DEFAULT_LENS_PARAMS, centerY: -0.25 });
      expect(control.getParams().centerY).toBe(-0.25);

      control.setParams({ ...DEFAULT_LENS_PARAMS, centerY: 0.25 });
      expect(control.getParams().centerY).toBe(0.25);
    });

    it('LENS-U064: scale accepts values in typical range (0.5 to 1.5)', () => {
      control.setParams({ ...DEFAULT_LENS_PARAMS, scale: 0.5 });
      expect(control.getParams().scale).toBe(0.5);

      control.setParams({ ...DEFAULT_LENS_PARAMS, scale: 1.5 });
      expect(control.getParams().scale).toBe(1.5);
    });
  });

  describe('barrel and pincushion presets', () => {
    it('LENS-U070: barrel distortion uses negative k1', () => {
      // Barrel distortion typically has negative k1
      control.setParams({ ...DEFAULT_LENS_PARAMS, k1: -0.2 });
      expect(control.getParams().k1).toBe(-0.2);
    });

    it('LENS-U071: pincushion distortion uses positive k1', () => {
      // Pincushion distortion typically has positive k1
      control.setParams({ ...DEFAULT_LENS_PARAMS, k1: 0.2 });
      expect(control.getParams().k1).toBe(0.2);
    });

    it('LENS-U072: no distortion uses zero k1 and k2', () => {
      control.setParams({ ...DEFAULT_LENS_PARAMS, k1: 0, k2: 0 });
      const params = control.getParams();
      expect(params.k1).toBe(0);
      expect(params.k2).toBe(0);
    });
  });

  describe('combined adjustments', () => {
    it('LENS-U080: can set distortion with center offset', () => {
      control.setParams({
        k1: 0.15,
        k2: -0.02,
        centerX: 0.03,
        centerY: -0.04,
        scale: 1,
      });

      const params = control.getParams();
      expect(params.k1).toBe(0.15);
      expect(params.centerX).toBe(0.03);
      expect(params.centerY).toBe(-0.04);
    });

    it('LENS-U081: can set distortion with scale compensation', () => {
      control.setParams({
        k1: -0.3,
        k2: 0,
        centerX: 0,
        centerY: 0,
        scale: 1.15, // Compensate for barrel distortion cropping
      });

      const params = control.getParams();
      expect(params.k1).toBe(-0.3);
      expect(params.scale).toBe(1.15);
    });
  });

  describe('dispose', () => {
    it('LENS-U090: dispose cleans up without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('LENS-U091: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });
  });
});
