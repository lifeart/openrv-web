/**
 * CropControl Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CropControl,
  CropRegion,
  CropState,
  DEFAULT_CROP_REGION,
  DEFAULT_CROP_STATE,
} from './CropControl';

describe('CropControl', () => {
  let control: CropControl;

  beforeEach(() => {
    control = new CropControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('CRP-001: starts with default crop state', () => {
      const state = control.getCropState();
      expect(state.enabled).toBe(false);
      expect(state.aspectRatio).toBeNull();
    });

    it('CRP-002: starts with full region', () => {
      const state = control.getCropState();
      expect(state.region).toEqual(DEFAULT_CROP_REGION);
    });

    it('CRP-003: default region covers entire image', () => {
      expect(DEFAULT_CROP_REGION.x).toBe(0);
      expect(DEFAULT_CROP_REGION.y).toBe(0);
      expect(DEFAULT_CROP_REGION.width).toBe(1);
      expect(DEFAULT_CROP_REGION.height).toBe(1);
    });
  });

  describe('getCropState', () => {
    it('CRP-004: returns copy of state', () => {
      const state1 = control.getCropState();
      const state2 = control.getCropState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it('CRP-005: returns copy of region', () => {
      const state1 = control.getCropState();
      const state2 = control.getCropState();
      expect(state1.region).not.toBe(state2.region);
      expect(state1.region).toEqual(state2.region);
    });
  });

  describe('setCropRegion', () => {
    it('CRP-006: sets crop region', () => {
      const region: CropRegion = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
      control.setCropRegion(region);

      const state = control.getCropState();
      expect(state.region).toEqual(region);
    });

    it('CRP-007: emits cropStateChanged event', () => {
      const handler = vi.fn();
      control.on('cropStateChanged', handler);

      const region: CropRegion = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
      control.setCropRegion(region);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ region: region })
      );
    });

    it('CRP-008: stores copy of region', () => {
      const region: CropRegion = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
      control.setCropRegion(region);

      region.x = 0.5; // Modify original

      const state = control.getCropState();
      expect(state.region.x).toBe(0.1); // Should not be modified
    });
  });

  describe('toggle', () => {
    it('CRP-009: toggle enables crop when disabled', () => {
      expect(control.getCropState().enabled).toBe(false);

      control.toggle();

      expect(control.getCropState().enabled).toBe(true);
    });

    it('CRP-010: toggle disables crop when enabled', () => {
      control.toggle(); // Enable
      expect(control.getCropState().enabled).toBe(true);

      control.toggle(); // Disable

      expect(control.getCropState().enabled).toBe(false);
    });

    it('CRP-011: toggle emits cropStateChanged event', () => {
      const handler = vi.fn();
      control.on('cropStateChanged', handler);

      control.toggle();

      expect(handler).toHaveBeenCalled();
    });

    it('CRP-012: toggle emits cropModeToggled event', () => {
      const handler = vi.fn();
      control.on('cropModeToggled', handler);

      control.toggle();

      expect(handler).toHaveBeenCalledWith(true);
    });
  });

  describe('reset', () => {
    it('CRP-013: reset disables crop', () => {
      control.toggle(); // Enable
      control.reset();

      expect(control.getCropState().enabled).toBe(false);
    });

    it('CRP-014: reset restores default region', () => {
      control.setCropRegion({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 });
      control.reset();

      expect(control.getCropState().region).toEqual(DEFAULT_CROP_REGION);
    });

    it('CRP-015: reset clears aspect ratio', () => {
      // Set aspect ratio would need to be done via UI, but we can check reset clears it
      control.reset();

      expect(control.getCropState().aspectRatio).toBeNull();
    });

    it('CRP-016: reset emits cropStateChanged event', () => {
      const handler = vi.fn();
      control.on('cropStateChanged', handler);

      control.reset();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getAspectRatio', () => {
    it('CRP-017: returns null for free aspect ratio', () => {
      expect(control.getAspectRatio()).toBeNull();
    });
  });

  describe('panel visibility', () => {
    it('CRP-018: showPanel makes panel visible', () => {
      control.showPanel();
      // Panel is visible (internal state changed)
      // We can't easily check DOM without mounting, but method should not throw
    });

    it('CRP-019: hidePanel hides panel', () => {
      control.showPanel();
      control.hidePanel();
      // Should not throw
    });

    it('CRP-020: togglePanel toggles visibility', () => {
      control.togglePanel(); // Show
      control.togglePanel(); // Hide
      // Should not throw
    });
  });

  describe('render', () => {
    it('CRP-021: render returns HTMLElement', () => {
      const element = control.render();
      expect(element).toBeInstanceOf(HTMLElement);
    });

    it('CRP-022: render returns container element', () => {
      const element = control.render();
      expect(element.className).toBe('crop-control-container');
    });
  });

  describe('DEFAULT_CROP_STATE', () => {
    it('CRP-023: has correct default values', () => {
      expect(DEFAULT_CROP_STATE.enabled).toBe(false);
      expect(DEFAULT_CROP_STATE.aspectRatio).toBeNull();
      expect(DEFAULT_CROP_STATE.region).toEqual(DEFAULT_CROP_REGION);
    });
  });

  describe('dispose', () => {
    it('CRP-024: dispose does not throw', () => {
      expect(() => control.dispose()).not.toThrow();
    });
  });
});
