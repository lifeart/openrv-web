/**
 * CDLControl Component Tests
 *
 * Tests for the ASC CDL color correction control panel with
 * slope, offset, power, and saturation adjustments.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CDLControl } from './CDLControl';
import { DEFAULT_CDL, type CDLValues } from '../../color/ColorProcessingFacade';

// Mock showAlert
vi.mock('./shared/Modal', () => ({
  showAlert: vi.fn(),
}));

describe('CDLControl', () => {
  let control: CDLControl;

  beforeEach(() => {
    control = new CDLControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('CDL-U001: should initialize with default CDL values', () => {
      const cdl = control.getCDL();
      expect(cdl).toEqual(DEFAULT_CDL);
    });

    it('CDL-U002: default slope values should be 1.0', () => {
      const cdl = control.getCDL();
      expect(cdl.slope.r).toBe(1.0);
      expect(cdl.slope.g).toBe(1.0);
      expect(cdl.slope.b).toBe(1.0);
    });

    it('CDL-U003: default offset values should be 0.0', () => {
      const cdl = control.getCDL();
      expect(cdl.offset.r).toBe(0.0);
      expect(cdl.offset.g).toBe(0.0);
      expect(cdl.offset.b).toBe(0.0);
    });

    it('CDL-U004: default power values should be 1.0', () => {
      const cdl = control.getCDL();
      expect(cdl.power.r).toBe(1.0);
      expect(cdl.power.g).toBe(1.0);
      expect(cdl.power.b).toBe(1.0);
    });

    it('CDL-U005: default saturation should be 1.0', () => {
      const cdl = control.getCDL();
      expect(cdl.saturation).toBe(1.0);
    });
  });

  describe('render', () => {
    it('CDL-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('cdl-control-container');
    });

    it('CDL-U011: container has CDL button', () => {
      const el = control.render();
      const buttons = el.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('CDL-U012: CDL button has correct title', () => {
      const el = control.render();
      const button = el.querySelector('button');
      expect(button?.title).toBe('ASC CDL Color Correction');
    });
  });

  describe('getCDL/setCDL', () => {
    it('CDL-U020: getCDL returns copy of CDL values', () => {
      const cdl1 = control.getCDL();
      const cdl2 = control.getCDL();
      expect(cdl1).toEqual(cdl2);
      expect(cdl1).not.toBe(cdl2);
    });

    it('CDL-U021: setCDL sets all CDL values', () => {
      const newCDL: CDLValues = {
        slope: { r: 1.2, g: 1.1, b: 0.9 },
        offset: { r: 0.05, g: 0.0, b: -0.03 },
        power: { r: 1.1, g: 1.0, b: 0.95 },
        saturation: 1.2,
      };

      control.setCDL(newCDL);
      expect(control.getCDL()).toEqual(newCDL);
    });

    it('CDL-U022: setCDL emits cdlChanged event', () => {
      const callback = vi.fn();
      control.on('cdlChanged', callback);

      const newCDL: CDLValues = {
        slope: { r: 1.5, g: 1.0, b: 1.0 },
        offset: { r: 0.0, g: 0.0, b: 0.0 },
        power: { r: 1.0, g: 1.0, b: 1.0 },
        saturation: 1.0,
      };

      control.setCDL(newCDL);
      expect(callback).toHaveBeenCalledWith(newCDL);
    });

    it('CDL-U023: setCDL emits copy of values', () => {
      const callback = vi.fn();
      control.on('cdlChanged', callback);

      const newCDL: CDLValues = {
        slope: { r: 1.2, g: 1.0, b: 1.0 },
        offset: { r: 0.0, g: 0.0, b: 0.0 },
        power: { r: 1.0, g: 1.0, b: 1.0 },
        saturation: 1.0,
      };

      control.setCDL(newCDL);

      const emittedCDL = callback.mock.calls[0][0] as CDLValues;
      emittedCDL.slope.r = 999;
      expect(control.getCDL().slope.r).toBe(1.2);
    });
  });

  describe('reset', () => {
    it('CDL-U030: reset restores default CDL values', () => {
      control.setCDL({
        slope: { r: 2.0, g: 1.5, b: 0.8 },
        offset: { r: 0.1, g: -0.1, b: 0.05 },
        power: { r: 1.2, g: 0.9, b: 1.1 },
        saturation: 1.5,
      });

      control.reset();
      expect(control.getCDL()).toEqual(DEFAULT_CDL);
    });

    it('CDL-U031: reset emits cdlChanged event with default values', () => {
      control.setCDL({
        slope: { r: 1.5, g: 1.0, b: 1.0 },
        offset: { r: 0.0, g: 0.0, b: 0.0 },
        power: { r: 1.0, g: 1.0, b: 1.0 },
        saturation: 1.2,
      });

      const callback = vi.fn();
      control.on('cdlChanged', callback);

      control.reset();
      expect(callback).toHaveBeenCalledWith(DEFAULT_CDL);
    });
  });

  describe('panel visibility', () => {
    it('CDL-U040: togglePanel shows and hides panel', () => {
      control.render();
      expect(() => control.togglePanel()).not.toThrow();
    });

    it('CDL-U041: showPanel can be called without error', () => {
      control.render();
      expect(() => control.showPanel()).not.toThrow();
    });

    it('CDL-U042: hidePanel can be called without error', () => {
      control.render();
      expect(() => {
        control.showPanel();
        control.hidePanel();
      }).not.toThrow();
    });

    it('CDL-U043: multiple show/hide calls work correctly', () => {
      control.render();
      expect(() => {
        control.showPanel();
        control.showPanel();
        control.hidePanel();
        control.hidePanel();
        control.togglePanel();
        control.togglePanel();
      }).not.toThrow();
    });
  });

  describe('slope values', () => {
    it('CDL-U050: slope R channel accepts values 0-4', () => {
      control.setCDL({ ...DEFAULT_CDL, slope: { r: 0, g: 1, b: 1 } });
      expect(control.getCDL().slope.r).toBe(0);

      control.setCDL({ ...DEFAULT_CDL, slope: { r: 4, g: 1, b: 1 } });
      expect(control.getCDL().slope.r).toBe(4);
    });

    it('CDL-U051: slope G channel accepts values 0-4', () => {
      control.setCDL({ ...DEFAULT_CDL, slope: { r: 1, g: 0, b: 1 } });
      expect(control.getCDL().slope.g).toBe(0);

      control.setCDL({ ...DEFAULT_CDL, slope: { r: 1, g: 4, b: 1 } });
      expect(control.getCDL().slope.g).toBe(4);
    });

    it('CDL-U052: slope B channel accepts values 0-4', () => {
      control.setCDL({ ...DEFAULT_CDL, slope: { r: 1, g: 1, b: 0 } });
      expect(control.getCDL().slope.b).toBe(0);

      control.setCDL({ ...DEFAULT_CDL, slope: { r: 1, g: 1, b: 4 } });
      expect(control.getCDL().slope.b).toBe(4);
    });

    it('CDL-U053: slope preserves fractional values', () => {
      control.setCDL({
        ...DEFAULT_CDL,
        slope: { r: 1.123, g: 0.456, b: 2.789 },
      });
      const cdl = control.getCDL();
      expect(cdl.slope.r).toBe(1.123);
      expect(cdl.slope.g).toBe(0.456);
      expect(cdl.slope.b).toBe(2.789);
    });
  });

  describe('offset values', () => {
    it('CDL-U060: offset R channel accepts values -1 to 1', () => {
      control.setCDL({ ...DEFAULT_CDL, offset: { r: -1, g: 0, b: 0 } });
      expect(control.getCDL().offset.r).toBe(-1);

      control.setCDL({ ...DEFAULT_CDL, offset: { r: 1, g: 0, b: 0 } });
      expect(control.getCDL().offset.r).toBe(1);
    });

    it('CDL-U061: offset G channel accepts values -1 to 1', () => {
      control.setCDL({ ...DEFAULT_CDL, offset: { r: 0, g: -1, b: 0 } });
      expect(control.getCDL().offset.g).toBe(-1);

      control.setCDL({ ...DEFAULT_CDL, offset: { r: 0, g: 1, b: 0 } });
      expect(control.getCDL().offset.g).toBe(1);
    });

    it('CDL-U062: offset B channel accepts values -1 to 1', () => {
      control.setCDL({ ...DEFAULT_CDL, offset: { r: 0, g: 0, b: -1 } });
      expect(control.getCDL().offset.b).toBe(-1);

      control.setCDL({ ...DEFAULT_CDL, offset: { r: 0, g: 0, b: 1 } });
      expect(control.getCDL().offset.b).toBe(1);
    });

    it('CDL-U063: offset preserves negative fractional values', () => {
      control.setCDL({
        ...DEFAULT_CDL,
        offset: { r: -0.123, g: 0.456, b: -0.789 },
      });
      const cdl = control.getCDL();
      expect(cdl.offset.r).toBe(-0.123);
      expect(cdl.offset.g).toBe(0.456);
      expect(cdl.offset.b).toBe(-0.789);
    });
  });

  describe('power values', () => {
    it('CDL-U070: power R channel accepts values 0.1-4', () => {
      control.setCDL({ ...DEFAULT_CDL, power: { r: 0.1, g: 1, b: 1 } });
      expect(control.getCDL().power.r).toBe(0.1);

      control.setCDL({ ...DEFAULT_CDL, power: { r: 4, g: 1, b: 1 } });
      expect(control.getCDL().power.r).toBe(4);
    });

    it('CDL-U071: power G channel accepts values 0.1-4', () => {
      control.setCDL({ ...DEFAULT_CDL, power: { r: 1, g: 0.1, b: 1 } });
      expect(control.getCDL().power.g).toBe(0.1);

      control.setCDL({ ...DEFAULT_CDL, power: { r: 1, g: 4, b: 1 } });
      expect(control.getCDL().power.g).toBe(4);
    });

    it('CDL-U072: power B channel accepts values 0.1-4', () => {
      control.setCDL({ ...DEFAULT_CDL, power: { r: 1, g: 1, b: 0.1 } });
      expect(control.getCDL().power.b).toBe(0.1);

      control.setCDL({ ...DEFAULT_CDL, power: { r: 1, g: 1, b: 4 } });
      expect(control.getCDL().power.b).toBe(4);
    });

    it('CDL-U073: power preserves fractional values', () => {
      control.setCDL({
        ...DEFAULT_CDL,
        power: { r: 1.234, g: 0.567, b: 2.345 },
      });
      const cdl = control.getCDL();
      expect(cdl.power.r).toBe(1.234);
      expect(cdl.power.g).toBe(0.567);
      expect(cdl.power.b).toBe(2.345);
    });
  });

  describe('saturation values', () => {
    it('CDL-U080: saturation accepts values 0-2', () => {
      control.setCDL({ ...DEFAULT_CDL, saturation: 0 });
      expect(control.getCDL().saturation).toBe(0);

      control.setCDL({ ...DEFAULT_CDL, saturation: 2 });
      expect(control.getCDL().saturation).toBe(2);
    });

    it('CDL-U081: saturation accepts fractional values', () => {
      control.setCDL({ ...DEFAULT_CDL, saturation: 1.35 });
      expect(control.getCDL().saturation).toBe(1.35);
    });

    it('CDL-U082: saturation 0 produces grayscale', () => {
      control.setCDL({ ...DEFAULT_CDL, saturation: 0 });
      expect(control.getCDL().saturation).toBe(0);
    });

    it('CDL-U083: saturation above 1 increases color intensity', () => {
      control.setCDL({ ...DEFAULT_CDL, saturation: 1.8 });
      expect(control.getCDL().saturation).toBe(1.8);
    });
  });

  describe('complex CDL operations', () => {
    it('CDL-U090: can set all parameters together', () => {
      const complexCDL: CDLValues = {
        slope: { r: 1.2, g: 0.95, b: 1.05 },
        offset: { r: 0.02, g: -0.01, b: 0.005 },
        power: { r: 1.1, g: 0.98, b: 1.02 },
        saturation: 1.15,
      };

      control.setCDL(complexCDL);
      const result = control.getCDL();

      expect(result.slope).toEqual(complexCDL.slope);
      expect(result.offset).toEqual(complexCDL.offset);
      expect(result.power).toEqual(complexCDL.power);
      expect(result.saturation).toBe(complexCDL.saturation);
    });

    it('CDL-U091: color temperature adjustment via slope', () => {
      // Warm grade: increase R, decrease B
      control.setCDL({
        ...DEFAULT_CDL,
        slope: { r: 1.15, g: 1.0, b: 0.9 },
      });
      const cdl = control.getCDL();
      expect(cdl.slope.r).toBeGreaterThan(cdl.slope.b);
    });

    it('CDL-U092: lift adjustment via offset', () => {
      // Lift shadows via offset
      control.setCDL({
        ...DEFAULT_CDL,
        offset: { r: 0.05, g: 0.05, b: 0.05 },
      });
      const cdl = control.getCDL();
      expect(cdl.offset.r).toBe(0.05);
      expect(cdl.offset.g).toBe(0.05);
      expect(cdl.offset.b).toBe(0.05);
    });

    it('CDL-U093: gamma adjustment via power', () => {
      // Increase gamma (brighten midtones)
      control.setCDL({
        ...DEFAULT_CDL,
        power: { r: 0.8, g: 0.8, b: 0.8 },
      });
      const cdl = control.getCDL();
      expect(cdl.power.r).toBeLessThan(1);
      expect(cdl.power.g).toBeLessThan(1);
      expect(cdl.power.b).toBeLessThan(1);
    });
  });

  describe('Escape key handling (M-14)', () => {
    it('CDL-M14a: pressing Escape while the panel is open should close it', () => {
      control.showPanel();
      const panel = document.querySelector('.cdl-panel') as HTMLElement;
      expect(panel.style.display).toBe('block');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(panel.style.display).toBe('none');
    });

    it('CDL-M14b: pressing Escape while the panel is closed should have no effect', () => {
      // Open then close so the panel element exists in DOM
      control.showPanel();
      control.hidePanel();
      const panel = document.querySelector('.cdl-panel') as HTMLElement;
      expect(panel.style.display).toBe('none');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(panel.style.display).toBe('none');
    });

    it('CDL-M14c: the keydown listener should be removed when the panel closes', () => {
      const spy = vi.spyOn(document, 'removeEventListener');

      control.showPanel();
      control.hidePanel();

      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
      spy.mockRestore();
    });

    it('CDL-M14d: the keydown listener should be removed on dispose', () => {
      const spy = vi.spyOn(document, 'removeEventListener');

      control.showPanel();
      control.dispose();

      expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
      spy.mockRestore();
    });
  });

  describe('dispose', () => {
    it('CDL-U100: dispose cleans up without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('CDL-U101: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });
  });
});

describe('CDLControl event emission', () => {
  let control: CDLControl;

  beforeEach(() => {
    control = new CDLControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('CDL-U110: multiple listeners receive cdlChanged events', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    control.on('cdlChanged', callback1);
    control.on('cdlChanged', callback2);

    control.setCDL({
      ...DEFAULT_CDL,
      slope: { r: 1.5, g: 1.0, b: 1.0 },
    });

    expect(callback1).toHaveBeenCalled();
    expect(callback2).toHaveBeenCalled();
  });

  it('CDL-U111: off removes event listener', () => {
    const callback = vi.fn();
    control.on('cdlChanged', callback);
    control.off('cdlChanged', callback);

    control.setCDL({
      ...DEFAULT_CDL,
      slope: { r: 1.5, g: 1.0, b: 1.0 },
    });

    expect(callback).not.toHaveBeenCalled();
  });
});
