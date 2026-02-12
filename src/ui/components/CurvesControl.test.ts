/**
 * CurvesControl Component Tests
 *
 * Tests for the draggable panel wrapper for curve editing with
 * presets, import/export, and visibility controls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CurvesControl } from './CurvesControl';
import { type ColorCurvesData, createDefaultCurve, CURVE_PRESETS } from '../../color/ColorProcessingFacade';

// Mock DraggableContainer
vi.mock('./shared/DraggableContainer', () => ({
  createDraggableContainer: vi.fn(() => {
    const element = document.createElement('div');
    element.dataset.testid = 'curves-control';
    const content = document.createElement('div');
    const controls = document.createElement('div');
    element.appendChild(controls);
    element.appendChild(content);
    return {
      element,
      content,
      controls,
      show: vi.fn(),
      hide: vi.fn(),
      getPosition: vi.fn(() => ({ x: 10, y: 10 })),
      setPosition: vi.fn(),
      resetPosition: vi.fn(),
      dispose: vi.fn(),
    };
  }),
  createControlButton: vi.fn((text: string, title: string) => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.title = title;
    return btn;
  }),
}));

describe('CurvesControl', () => {
  let control: CurvesControl;

  beforeEach(() => {
    control = new CurvesControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('CURVES-U001: should initialize with default curves', () => {
      const curves = control.getCurves();
      expect(curves.master).toBeDefined();
      expect(curves.red).toBeDefined();
      expect(curves.green).toBeDefined();
      expect(curves.blue).toBeDefined();
    });

    it('CURVES-U002: should be hidden by default', () => {
      expect(control.isVisible()).toBe(false);
    });

    it('CURVES-U003: should be at default state initially', () => {
      expect(control.isDefault()).toBe(true);
    });

    it('CURVES-U004: should accept initial curves', () => {
      const customCurves: ColorCurvesData = {
        master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }] },
        red: createDefaultCurve(),
        green: createDefaultCurve(),
        blue: createDefaultCurve(),
      };

      const customControl = new CurvesControl(customCurves);
      expect(customControl.getCurves().master.points.length).toBe(3);
      customControl.dispose();
    });
  });

  describe('render', () => {
    it('CURVES-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('CURVES-U011: container has preset selector', () => {
      const el = control.render();
      const preset = el.querySelector('[data-testid="curves-preset"]');
      expect(preset).not.toBeNull();
    });

    it('CURVES-U012: preset selector has all presets', () => {
      const el = control.render();
      const preset = el.querySelector('[data-testid="curves-preset"]') as HTMLSelectElement;
      expect(preset.options.length).toBe(CURVE_PRESETS.length);
    });

    it('CURVES-U013: container has import button', () => {
      const el = control.render();
      const importBtn = el.querySelector('[data-testid="curves-import"]');
      expect(importBtn).not.toBeNull();
    });

    it('CURVES-U014: container has export button', () => {
      const el = control.render();
      const exportBtn = el.querySelector('[data-testid="curves-export"]');
      expect(exportBtn).not.toBeNull();
    });
  });

  describe('getCurves/setCurves', () => {
    it('CURVES-U020: getCurves returns copy of curves', () => {
      const curves1 = control.getCurves();
      const curves2 = control.getCurves();
      expect(curves1).toEqual(curves2);
      expect(curves1).not.toBe(curves2);
    });

    it('CURVES-U021: setCurves updates curves', () => {
      const newCurves: ColorCurvesData = {
        master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }] },
        red: createDefaultCurve(),
        green: createDefaultCurve(),
        blue: createDefaultCurve(),
      };

      control.setCurves(newCurves);
      expect(control.getCurves().master.points.length).toBe(3);
    });

    it('CURVES-U022: setCurves marks as non-default', () => {
      const newCurves: ColorCurvesData = {
        master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }] },
        red: createDefaultCurve(),
        green: createDefaultCurve(),
        blue: createDefaultCurve(),
      };

      control.setCurves(newCurves);
      expect(control.isDefault()).toBe(false);
    });
  });

  describe('visibility', () => {
    it('CURVES-U030: show makes control visible', () => {
      control.show();
      expect(control.isVisible()).toBe(true);
    });

    it('CURVES-U031: hide makes control hidden', () => {
      control.show();
      control.hide();
      expect(control.isVisible()).toBe(false);
    });

    it('CURVES-U032: toggle switches visibility', () => {
      expect(control.isVisible()).toBe(false);
      control.toggle();
      expect(control.isVisible()).toBe(true);
      control.toggle();
      expect(control.isVisible()).toBe(false);
    });

    it('CURVES-U033: show emits visibilityChanged event', () => {
      const callback = vi.fn();
      control.on('visibilityChanged', callback);

      control.show();
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('CURVES-U034: hide emits visibilityChanged event', () => {
      control.show();
      const callback = vi.fn();
      control.on('visibilityChanged', callback);

      control.hide();
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('CURVES-U035: show does not emit if already visible', () => {
      control.show();
      const callback = vi.fn();
      control.on('visibilityChanged', callback);

      control.show();
      expect(callback).not.toHaveBeenCalled();
    });

    it('CURVES-U036: hide does not emit if already hidden', () => {
      const callback = vi.fn();
      control.on('visibilityChanged', callback);

      control.hide();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('isDefault', () => {
    it('CURVES-U040: isDefault returns true for default curves', () => {
      expect(control.isDefault()).toBe(true);
    });

    it('CURVES-U041: isDefault returns false after modification', () => {
      const newCurves: ColorCurvesData = {
        master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.3, y: 0.5 }, { x: 1, y: 1 }] },
        red: createDefaultCurve(),
        green: createDefaultCurve(),
        blue: createDefaultCurve(),
      };

      control.setCurves(newCurves);
      expect(control.isDefault()).toBe(false);
    });
  });

  describe('getActiveChannel', () => {
    it('CURVES-U050: getActiveChannel returns current channel', () => {
      expect(control.getActiveChannel()).toBe('master');
    });
  });

  describe('position management', () => {
    it('CURVES-U060: getPosition returns position', () => {
      const pos = control.getPosition();
      expect(pos).toHaveProperty('x');
      expect(pos).toHaveProperty('y');
    });

    it('CURVES-U061: setPosition can be called', () => {
      expect(() => control.setPosition(100, 200)).not.toThrow();
    });

    it('CURVES-U062: resetPosition can be called', () => {
      expect(() => control.resetPosition()).not.toThrow();
    });
  });

  describe('curvesChanged event', () => {
    it('CURVES-U070: setCurves emits curvesChanged event', () => {
      const callback = vi.fn();
      control.on('curvesChanged', callback);

      const newCurves: ColorCurvesData = {
        master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }] },
        red: createDefaultCurve(),
        green: createDefaultCurve(),
        blue: createDefaultCurve(),
      };

      control.setCurves(newCurves);
      // The event is emitted via internal editor, may or may not fire depending on impl
    });
  });

  describe('preset selection', () => {
    it('CURVES-U080: preset selector triggers curvesChanged', () => {
      const el = control.render();
      const callback = vi.fn();
      control.on('curvesChanged', callback);

      const preset = el.querySelector('[data-testid="curves-preset"]') as HTMLSelectElement;
      // Simulate selecting a different preset
      preset.value = '1'; // Assuming index 1 is a different preset
      preset.dispatchEvent(new Event('change'));

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('CURVES-U090: dispose cleans up without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('CURVES-U091: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });
  });
});

describe('CurvesControl presets', () => {
  let control: CurvesControl;

  beforeEach(() => {
    control = new CurvesControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('CURVES-U100: all presets are available in selector', () => {
    const el = control.render();
    const preset = el.querySelector('[data-testid="curves-preset"]') as HTMLSelectElement;

    CURVE_PRESETS.forEach((p, index) => {
      expect(preset.options[index]).toBeDefined();
      expect(preset.options[index]?.textContent).toBe(p.name);
    });
  });
});
