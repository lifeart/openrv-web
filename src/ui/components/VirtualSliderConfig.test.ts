import { describe, it, expect } from 'vitest';
import {
  VIRTUAL_SLIDER_PARAMS,
  VIRTUAL_SLIDER_KEYS,
  VIRTUAL_SLIDER_ACTIVE_KEYS,
  VirtualSliderState,
  ARMED_TIMEOUT_MS,
  ARMED_DEAD_ZONE_PX,
  FINE_ADJUSTMENT_MULTIPLIER,
  MOVEMENT_X_CLAMP,
} from './VirtualSliderConfig';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../../core/types/color';

describe('VirtualSliderConfig', () => {
  describe('VIRTUAL_SLIDER_PARAMS', () => {
    it('defines parameters for all six expected keys', () => {
      expect(VIRTUAL_SLIDER_PARAMS).toHaveProperty('KeyE');
      expect(VIRTUAL_SLIDER_PARAMS).toHaveProperty('KeyY');
      expect(VIRTUAL_SLIDER_PARAMS).toHaveProperty('KeyB');
      expect(VIRTUAL_SLIDER_PARAMS).toHaveProperty('KeyH');
      expect(VIRTUAL_SLIDER_PARAMS).toHaveProperty('KeyS');
      expect(VIRTUAL_SLIDER_PARAMS).toHaveProperty('KeyK');
    });

    it('does not define parameters for unmapped keys', () => {
      expect(VIRTUAL_SLIDER_PARAMS).not.toHaveProperty('KeyA');
      expect(VIRTUAL_SLIDER_PARAMS).not.toHaveProperty('KeyT');
      expect(VIRTUAL_SLIDER_PARAMS).not.toHaveProperty('KeyZ');
    });

    it('maps KeyE to exposure', () => {
      expect(VIRTUAL_SLIDER_PARAMS['KeyE']!.key).toBe('exposure');
      expect(VIRTUAL_SLIDER_PARAMS['KeyE']!.label).toBe('Exposure');
    });

    it('maps KeyY to gamma', () => {
      expect(VIRTUAL_SLIDER_PARAMS['KeyY']!.key).toBe('gamma');
      expect(VIRTUAL_SLIDER_PARAMS['KeyY']!.label).toBe('Gamma');
    });

    it('maps KeyB to brightness', () => {
      expect(VIRTUAL_SLIDER_PARAMS['KeyB']!.key).toBe('brightness');
      expect(VIRTUAL_SLIDER_PARAMS['KeyB']!.label).toBe('Brightness');
    });

    it('maps KeyH to hueRotation', () => {
      expect(VIRTUAL_SLIDER_PARAMS['KeyH']!.key).toBe('hueRotation');
      expect(VIRTUAL_SLIDER_PARAMS['KeyH']!.label).toBe('Hue');
    });

    it('maps KeyS to saturation', () => {
      expect(VIRTUAL_SLIDER_PARAMS['KeyS']!.key).toBe('saturation');
      expect(VIRTUAL_SLIDER_PARAMS['KeyS']!.label).toBe('Saturation');
    });

    it('maps KeyK to contrast', () => {
      expect(VIRTUAL_SLIDER_PARAMS['KeyK']!.key).toBe('contrast');
      expect(VIRTUAL_SLIDER_PARAMS['KeyK']!.label).toBe('Contrast');
    });

    it('all params have min < max', () => {
      for (const param of Object.values(VIRTUAL_SLIDER_PARAMS)) {
        expect(param.min).toBeLessThan(param.max);
      }
    });

    it('all params have positive coarseStep', () => {
      for (const param of Object.values(VIRTUAL_SLIDER_PARAMS)) {
        expect(param.coarseStep).toBeGreaterThan(0);
      }
    });

    it('all params have positive fineStep', () => {
      for (const param of Object.values(VIRTUAL_SLIDER_PARAMS)) {
        expect(param.fineStep).toBeGreaterThan(0);
      }
    });

    it('fineStep is <= coarseStep for each param', () => {
      for (const param of Object.values(VIRTUAL_SLIDER_PARAMS)) {
        expect(param.fineStep).toBeLessThanOrEqual(param.coarseStep);
      }
    });

    it('defaultValue falls within [min, max] for each param', () => {
      for (const param of Object.values(VIRTUAL_SLIDER_PARAMS)) {
        expect(param.defaultValue).toBeGreaterThanOrEqual(param.min);
        expect(param.defaultValue).toBeLessThanOrEqual(param.max);
      }
    });

    it('defaultValue matches DEFAULT_COLOR_ADJUSTMENTS', () => {
      for (const param of Object.values(VIRTUAL_SLIDER_PARAMS)) {
        expect(param.defaultValue).toBe(DEFAULT_COLOR_ADJUSTMENTS[param.key]);
      }
    });
  });

  describe('format functions', () => {
    it('exposure format shows + for positive values', () => {
      const fmt = VIRTUAL_SLIDER_PARAMS['KeyE']!.format;
      expect(fmt(1.5)).toContain('+');
      expect(fmt(0)).toContain('+'); // 0 is >= 0
      expect(fmt(-1)).not.toMatch(/^\+/);
    });

    it('exposure format shows two decimal places', () => {
      const fmt = VIRTUAL_SLIDER_PARAMS['KeyE']!.format;
      expect(fmt(1.5)).toBe('+1.50');
      expect(fmt(-2.123)).toBe('-2.12');
    });

    it('gamma format shows two decimal places', () => {
      const fmt = VIRTUAL_SLIDER_PARAMS['KeyY']!.format;
      expect(fmt(1.0)).toBe('1.00');
      expect(fmt(2.5)).toBe('2.50');
    });

    it('brightness format shows percentage', () => {
      const fmt = VIRTUAL_SLIDER_PARAMS['KeyB']!.format;
      expect(fmt(0.5)).toContain('%');
      expect(fmt(-0.1)).toContain('%');
    });

    it('hue format shows degree symbol', () => {
      const fmt = VIRTUAL_SLIDER_PARAMS['KeyH']!.format;
      expect(fmt(180)).toContain('\u00B0');
    });

    it('saturation format shows percentage', () => {
      const fmt = VIRTUAL_SLIDER_PARAMS['KeyS']!.format;
      expect(fmt(1.0)).toContain('%');
    });

    it('contrast format shows percentage', () => {
      const fmt = VIRTUAL_SLIDER_PARAMS['KeyK']!.format;
      expect(fmt(1.0)).toContain('%');
    });
  });

  describe('VIRTUAL_SLIDER_KEYS', () => {
    it('contains all six activator keys', () => {
      expect(VIRTUAL_SLIDER_KEYS.has('KeyE')).toBe(true);
      expect(VIRTUAL_SLIDER_KEYS.has('KeyY')).toBe(true);
      expect(VIRTUAL_SLIDER_KEYS.has('KeyB')).toBe(true);
      expect(VIRTUAL_SLIDER_KEYS.has('KeyH')).toBe(true);
      expect(VIRTUAL_SLIDER_KEYS.has('KeyS')).toBe(true);
      expect(VIRTUAL_SLIDER_KEYS.has('KeyK')).toBe(true);
    });

    it('has exactly six entries', () => {
      expect(VIRTUAL_SLIDER_KEYS.size).toBe(6);
    });
  });

  describe('VIRTUAL_SLIDER_ACTIVE_KEYS', () => {
    it('includes Escape', () => {
      expect(VIRTUAL_SLIDER_ACTIVE_KEYS.has('Escape')).toBe(true);
    });

    it('includes Enter', () => {
      expect(VIRTUAL_SLIDER_ACTIVE_KEYS.has('Enter')).toBe(true);
    });

    it('includes KeyL for lock toggle', () => {
      expect(VIRTUAL_SLIDER_ACTIVE_KEYS.has('KeyL')).toBe(true);
    });

    it('includes digit keys', () => {
      for (let i = 0; i <= 9; i++) {
        expect(VIRTUAL_SLIDER_ACTIVE_KEYS.has(`Digit${i}`)).toBe(true);
      }
    });

    it('includes Period', () => {
      expect(VIRTUAL_SLIDER_ACTIVE_KEYS.has('Period')).toBe(true);
    });

    it('includes Backspace', () => {
      expect(VIRTUAL_SLIDER_ACTIVE_KEYS.has('Backspace')).toBe(true);
    });

    it('includes + and - keys', () => {
      expect(VIRTUAL_SLIDER_ACTIVE_KEYS.has('Equal')).toBe(true);
      expect(VIRTUAL_SLIDER_ACTIVE_KEYS.has('Minus')).toBe(true);
      expect(VIRTUAL_SLIDER_ACTIVE_KEYS.has('NumpadAdd')).toBe(true);
      expect(VIRTUAL_SLIDER_ACTIVE_KEYS.has('NumpadSubtract')).toBe(true);
    });

    it('includes Shift keys', () => {
      expect(VIRTUAL_SLIDER_ACTIVE_KEYS.has('ShiftLeft')).toBe(true);
      expect(VIRTUAL_SLIDER_ACTIVE_KEYS.has('ShiftRight')).toBe(true);
    });
  });

  describe('VirtualSliderState enum', () => {
    it('defines IDLE state', () => {
      expect(VirtualSliderState.IDLE).toBe('idle');
    });

    it('defines ARMED state', () => {
      expect(VirtualSliderState.ARMED).toBe('armed');
    });

    it('defines ACTIVE state', () => {
      expect(VirtualSliderState.ACTIVE).toBe('active');
    });

    it('defines LOCKED state', () => {
      expect(VirtualSliderState.LOCKED).toBe('locked');
    });
  });

  describe('sensitivity constants', () => {
    it('ARMED_TIMEOUT_MS is 150', () => {
      expect(ARMED_TIMEOUT_MS).toBe(150);
    });

    it('ARMED_DEAD_ZONE_PX is 3', () => {
      expect(ARMED_DEAD_ZONE_PX).toBe(3);
    });

    it('FINE_ADJUSTMENT_MULTIPLIER is 0.1', () => {
      expect(FINE_ADJUSTMENT_MULTIPLIER).toBe(0.1);
    });

    it('MOVEMENT_X_CLAMP is 100', () => {
      expect(MOVEMENT_X_CLAMP).toBe(100);
    });
  });
});
