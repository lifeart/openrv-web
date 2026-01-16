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
      const transform: Transform2D = { rotation: 90, flipH: true, flipV: false };
      control.setTransform(transform);

      expect(control.getTransform()).toEqual(transform);
    });

    it('TRN-007: stores copy of transform', () => {
      const transform: Transform2D = { rotation: 90, flipH: true, flipV: false };
      control.setTransform(transform);

      transform.rotation = 180; // Modify original

      expect(control.getTransform().rotation).toBe(90); // Should not be modified
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
});
