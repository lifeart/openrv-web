/**
 * TransformControl Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TransformControl,
  Transform2D,
  DEFAULT_TRANSFORM,
} from './TransformControl';

describe('TransformControl', () => {
  let control: TransformControl;

  beforeEach(() => {
    control = new TransformControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('TRN-001: starts with default transform', () => {
      const transform = control.getTransform();
      expect(transform).toEqual(DEFAULT_TRANSFORM);
    });

    it('TRN-002: default rotation is 0', () => {
      expect(control.getTransform().rotation).toBe(0);
    });

    it('TRN-003: default flipH is false', () => {
      expect(control.getTransform().flipH).toBe(false);
    });

    it('TRN-004: default flipV is false', () => {
      expect(control.getTransform().flipV).toBe(false);
    });
  });

  describe('getTransform', () => {
    it('TRN-005: returns copy of transform', () => {
      const transform1 = control.getTransform();
      const transform2 = control.getTransform();
      expect(transform1).not.toBe(transform2);
      expect(transform1).toEqual(transform2);
    });
  });

  describe('setTransform', () => {
    it('TRN-006: sets transform', () => {
      const transform: Transform2D = {
        rotation: 90,
        flipH: true,
        flipV: false,
        scale: { x: 2, y: 2 },
        translate: { x: 0.1, y: 0.2 },
      };
      control.setTransform(transform);

      expect(control.getTransform()).toEqual(transform);
    });

    it('TRN-007: stores copy of transform', () => {
      const transform: Transform2D = {
        rotation: 90,
        flipH: true,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      };
      control.setTransform(transform);

      transform.rotation = 180; // Modify original
      transform.scale.x = 3; // Modify nested object

      expect(control.getTransform().rotation).toBe(90); // Should not be modified
      expect(control.getTransform().scale.x).toBe(1); // Nested object should not be modified
    });
  });

  describe('rotateRight', () => {
    it('TRN-008: rotates from 0 to 90', () => {
      control.rotateRight();
      expect(control.getTransform().rotation).toBe(90);
    });

    it('TRN-009: rotates from 90 to 180', () => {
      control.setTransform({ ...DEFAULT_TRANSFORM, rotation: 90 });
      control.rotateRight();
      expect(control.getTransform().rotation).toBe(180);
    });

    it('TRN-010: rotates from 180 to 270', () => {
      control.setTransform({ ...DEFAULT_TRANSFORM, rotation: 180 });
      control.rotateRight();
      expect(control.getTransform().rotation).toBe(270);
    });

    it('TRN-011: rotates from 270 to 0', () => {
      control.setTransform({ ...DEFAULT_TRANSFORM, rotation: 270 });
      control.rotateRight();
      expect(control.getTransform().rotation).toBe(0);
    });

    it('TRN-012: rotateRight emits transformChanged event', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);

      control.rotateRight();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ rotation: 90 })
      );
    });
  });

  describe('rotateLeft', () => {
    it('TRN-013: rotates from 0 to 270', () => {
      control.rotateLeft();
      expect(control.getTransform().rotation).toBe(270);
    });

    it('TRN-014: rotates from 90 to 0', () => {
      control.setTransform({ ...DEFAULT_TRANSFORM, rotation: 90 });
      control.rotateLeft();
      expect(control.getTransform().rotation).toBe(0);
    });

    it('TRN-015: rotates from 180 to 90', () => {
      control.setTransform({ ...DEFAULT_TRANSFORM, rotation: 180 });
      control.rotateLeft();
      expect(control.getTransform().rotation).toBe(90);
    });

    it('TRN-016: rotates from 270 to 180', () => {
      control.setTransform({ ...DEFAULT_TRANSFORM, rotation: 270 });
      control.rotateLeft();
      expect(control.getTransform().rotation).toBe(180);
    });

    it('TRN-017: rotateLeft emits transformChanged event', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);

      control.rotateLeft();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ rotation: 270 })
      );
    });
  });

  describe('toggleFlipH', () => {
    it('TRN-018: toggles flipH from false to true', () => {
      control.toggleFlipH();
      expect(control.getTransform().flipH).toBe(true);
    });

    it('TRN-019: toggles flipH from true to false', () => {
      control.setTransform({ ...DEFAULT_TRANSFORM, flipH: true });
      control.toggleFlipH();
      expect(control.getTransform().flipH).toBe(false);
    });

    it('TRN-020: toggleFlipH emits transformChanged event', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);

      control.toggleFlipH();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ flipH: true })
      );
    });
  });

  describe('toggleFlipV', () => {
    it('TRN-021: toggles flipV from false to true', () => {
      control.toggleFlipV();
      expect(control.getTransform().flipV).toBe(true);
    });

    it('TRN-022: toggles flipV from true to false', () => {
      control.setTransform({ ...DEFAULT_TRANSFORM, flipV: true });
      control.toggleFlipV();
      expect(control.getTransform().flipV).toBe(false);
    });

    it('TRN-023: toggleFlipV emits transformChanged event', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);

      control.toggleFlipV();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ flipV: true })
      );
    });
  });

  describe('reset', () => {
    it('TRN-024: reset returns rotation to 0', () => {
      control.rotateRight();
      control.rotateRight();
      control.reset();
      expect(control.getTransform().rotation).toBe(0);
    });

    it('TRN-025: reset returns flipH to false', () => {
      control.toggleFlipH();
      control.reset();
      expect(control.getTransform().flipH).toBe(false);
    });

    it('TRN-026: reset returns flipV to false', () => {
      control.toggleFlipV();
      control.reset();
      expect(control.getTransform().flipV).toBe(false);
    });

    it('TRN-027: reset returns all values to defaults', () => {
      control.rotateRight();
      control.toggleFlipH();
      control.toggleFlipV();
      control.reset();
      expect(control.getTransform()).toEqual(DEFAULT_TRANSFORM);
    });

    it('TRN-028: reset emits transformChanged event', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);

      control.reset();

      expect(handler).toHaveBeenCalledWith(DEFAULT_TRANSFORM);
    });
  });

  describe('handleKeyboard', () => {
    it('TRN-029: R key rotates right', () => {
      const result = control.handleKeyboard('r', false);
      expect(result).toBe(true);
      expect(control.getTransform().rotation).toBe(90);
    });

    it('TRN-030: Shift+R key rotates left', () => {
      const result = control.handleKeyboard('r', true);
      expect(result).toBe(true);
      expect(control.getTransform().rotation).toBe(270);
    });

    it('TRN-031: H key toggles flipH', () => {
      const result = control.handleKeyboard('h', false);
      expect(result).toBe(true);
      expect(control.getTransform().flipH).toBe(true);
    });

    it('TRN-032: V key returns false (not handled)', () => {
      const result = control.handleKeyboard('v', false);
      expect(result).toBe(false);
    });

    it('TRN-033: unknown key returns false', () => {
      const result = control.handleKeyboard('x', false);
      expect(result).toBe(false);
    });

    it('TRN-034: uppercase R key works', () => {
      const result = control.handleKeyboard('R', false);
      expect(result).toBe(true);
    });

    it('TRN-035: uppercase H key works', () => {
      const result = control.handleKeyboard('H', false);
      expect(result).toBe(true);
    });
  });

  describe('render', () => {
    it('TRN-036: render returns HTMLElement', () => {
      const element = control.render();
      expect(element).toBeInstanceOf(HTMLElement);
    });

    it('TRN-037: render returns container element', () => {
      const element = control.render();
      expect(element.className).toBe('transform-control-container');
    });
  });

  describe('DEFAULT_TRANSFORM', () => {
    it('TRN-038: has correct default values', () => {
      expect(DEFAULT_TRANSFORM.rotation).toBe(0);
      expect(DEFAULT_TRANSFORM.flipH).toBe(false);
      expect(DEFAULT_TRANSFORM.flipV).toBe(false);
      expect(DEFAULT_TRANSFORM.scale).toEqual({ x: 1, y: 1 });
      expect(DEFAULT_TRANSFORM.translate).toEqual({ x: 0, y: 0 });
    });
  });

  describe('rotation status indicator', () => {
    function getIndicator(): HTMLElement | null {
      return control.render().querySelector('[data-testid="rotation-indicator"]');
    }

    it('TC-M27a: when rotation is 0, rotation indicator is hidden', () => {
      const indicator = getIndicator();
      expect(indicator).not.toBeNull();
      expect(indicator!.style.display).toBe('none');
      expect(indicator!.textContent).toBe('');
    });

    it('TC-M27b-90: when rotation is 90, indicator shows 90\u00B0', () => {
      control.rotateRight();
      const indicator = getIndicator();
      expect(indicator!.style.display).toBe('');
      expect(indicator!.textContent).toBe('90\u00B0');
    });

    it('TC-M27b-180: when rotation is 180, indicator shows 180\u00B0', () => {
      control.rotateRight();
      control.rotateRight();
      const indicator = getIndicator();
      expect(indicator!.style.display).toBe('');
      expect(indicator!.textContent).toBe('180\u00B0');
    });

    it('TC-M27b-270: when rotation is 270, indicator shows 270\u00B0', () => {
      control.rotateLeft();
      const indicator = getIndicator();
      expect(indicator!.style.display).toBe('');
      expect(indicator!.textContent).toBe('270\u00B0');
    });

    it('TC-M27c: after reset, indicator disappears', () => {
      control.rotateRight(); // 90
      control.rotateRight(); // 180
      const indicator = getIndicator();
      expect(indicator!.style.display).toBe('');
      expect(indicator!.textContent).toBe('180\u00B0');

      control.reset();
      expect(indicator!.style.display).toBe('none');
      expect(indicator!.textContent).toBe('');
    });

    it('TC-M27d: setTransform updates indicator', () => {
      control.setTransform({ ...DEFAULT_TRANSFORM, rotation: 270 });
      const indicator = getIndicator();
      expect(indicator!.style.display).toBe('');
      expect(indicator!.textContent).toBe('270\u00B0');
    });

    it('TC-M27e: setTransform to 0 hides indicator', () => {
      control.rotateRight();
      control.setTransform({ ...DEFAULT_TRANSFORM, rotation: 0 });
      const indicator = getIndicator();
      expect(indicator!.style.display).toBe('none');
      expect(indicator!.textContent).toBe('');
    });

    it('TC-M27f: full rotation cycle returns indicator to hidden', () => {
      control.rotateRight(); // 90
      control.rotateRight(); // 180
      control.rotateRight(); // 270
      control.rotateRight(); // 0
      const indicator = getIndicator();
      expect(indicator!.style.display).toBe('none');
      expect(indicator!.textContent).toBe('');
    });
  });

  describe('dispose', () => {
    it('TRN-039: dispose does not throw', () => {
      expect(() => control.dispose()).not.toThrow();
    });
  });

  describe('combined transforms', () => {
    it('TRN-040: rotation and flip can be combined', () => {
      control.rotateRight();
      control.toggleFlipH();
      control.toggleFlipV();

      const transform = control.getTransform();
      expect(transform.rotation).toBe(90);
      expect(transform.flipH).toBe(true);
      expect(transform.flipV).toBe(true);
    });

    it('TRN-041: multiple rotations accumulate correctly', () => {
      control.rotateRight();
      control.rotateRight();
      control.rotateRight();
      control.rotateRight();

      expect(control.getTransform().rotation).toBe(0); // Full rotation
    });

    it('TRN-042: four left rotations return to 0', () => {
      control.rotateLeft();
      control.rotateLeft();
      control.rotateLeft();
      control.rotateLeft();

      expect(control.getTransform().rotation).toBe(0);
    });
  });

  describe('scale', () => {
    it('TRN-043: default scale is 1,1', () => {
      const transform = control.getTransform();
      expect(transform.scale).toEqual({ x: 1, y: 1 });
    });

    it('TRN-044: setScale sets both x and y when only x provided', () => {
      control.setScale(2);
      const transform = control.getTransform();
      expect(transform.scale).toEqual({ x: 2, y: 2 });
    });

    it('TRN-045: setScale sets x and y independently', () => {
      control.setScale(1.5, 2.5);
      const transform = control.getTransform();
      expect(transform.scale).toEqual({ x: 1.5, y: 2.5 });
    });

    it('TRN-046: setScale clamps to minimum 0.01', () => {
      control.setScale(-1, 0);
      const transform = control.getTransform();
      expect(transform.scale.x).toBe(0.01);
      expect(transform.scale.y).toBe(0.01);
    });

    it('TRN-047: setScale emits transformChanged event', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);

      control.setScale(2, 3);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ scale: { x: 2, y: 3 } })
      );
    });
  });

  describe('translate', () => {
    it('TRN-048: default translate is 0,0', () => {
      const transform = control.getTransform();
      expect(transform.translate).toEqual({ x: 0, y: 0 });
    });

    it('TRN-049: setTranslate sets x and y', () => {
      control.setTranslate(0.5, -0.3);
      const transform = control.getTransform();
      expect(transform.translate).toEqual({ x: 0.5, y: -0.3 });
    });

    it('TRN-050: setTranslate emits transformChanged event', () => {
      const handler = vi.fn();
      control.on('transformChanged', handler);

      control.setTranslate(0.1, 0.2);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ translate: { x: 0.1, y: 0.2 } })
      );
    });
  });

  describe('hasScaleOrTranslate', () => {
    it('TRN-051: returns false for default transform', () => {
      expect(control.hasScaleOrTranslate()).toBe(false);
    });

    it('TRN-052: returns true when scale is not 1,1', () => {
      control.setScale(2);
      expect(control.hasScaleOrTranslate()).toBe(true);
    });

    it('TRN-053: returns true when translate is not 0,0', () => {
      control.setTranslate(0.1, 0);
      expect(control.hasScaleOrTranslate()).toBe(true);
    });

    it('TRN-054: returns true when only scale.y differs', () => {
      control.setScale(1, 2);
      expect(control.hasScaleOrTranslate()).toBe(true);
    });

    it('TRN-055: returns true when only translate.y differs', () => {
      control.setTranslate(0, 0.5);
      expect(control.hasScaleOrTranslate()).toBe(true);
    });
  });

  describe('reset with scale and translate', () => {
    it('TRN-056: reset returns scale to 1,1', () => {
      control.setScale(2, 3);
      control.reset();
      expect(control.getTransform().scale).toEqual({ x: 1, y: 1 });
    });

    it('TRN-057: reset returns translate to 0,0', () => {
      control.setTranslate(0.5, 0.5);
      control.reset();
      expect(control.getTransform().translate).toEqual({ x: 0, y: 0 });
    });
  });
});
