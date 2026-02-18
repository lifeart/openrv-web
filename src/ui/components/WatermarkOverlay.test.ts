/**
 * WatermarkOverlay Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WatermarkOverlay,
  WatermarkPosition,
  DEFAULT_WATERMARK_STATE,
} from './WatermarkOverlay';

describe('WatermarkOverlay', () => {
  let overlay: WatermarkOverlay;

  beforeEach(() => {
    overlay = new WatermarkOverlay();
  });

  afterEach(() => {
    overlay.dispose();
  });

  describe('initialization', () => {
    it('WM-U001: should initialize with default state', () => {
      const state = overlay.getState();
      expect(state).toEqual(DEFAULT_WATERMARK_STATE);
    });

    it('WM-U002: should accept initial state in constructor', () => {
      const customOverlay = new WatermarkOverlay({
        position: 'top-left',
        opacity: 0.5,
      });

      expect(customOverlay.getPosition()).toBe('top-left');
      expect(customOverlay.getOpacity()).toBe(0.5);
      customOverlay.dispose();
    });

    it('WM-U003: should not be enabled by default', () => {
      expect(overlay.isEnabled()).toBe(false);
    });

    it('WM-U004: should not have image by default', () => {
      expect(overlay.hasImage()).toBe(false);
    });
  });

  describe('position', () => {
    it('WM-U010: getPosition returns current position', () => {
      expect(overlay.getPosition()).toBe('bottom-right');
    });

    it('WM-U011: setPosition updates position', () => {
      overlay.setPosition('top-left');
      expect(overlay.getPosition()).toBe('top-left');
    });

    it('WM-U012: setPosition emits stateChanged', () => {
      const callback = vi.fn();
      overlay.on('stateChanged', callback);

      overlay.setPosition('center');
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ position: 'center' })
      );
    });

    it('WM-U013: setPosition does not emit if unchanged', () => {
      overlay.setPosition('bottom-right'); // Same as default
      const callback = vi.fn();
      overlay.on('stateChanged', callback);

      overlay.setPosition('bottom-right');
      expect(callback).not.toHaveBeenCalled();
    });

    it('WM-U014: all position presets are valid', () => {
      const positions: WatermarkPosition[] = [
        'top-left',
        'top-center',
        'top-right',
        'center-left',
        'center',
        'center-right',
        'bottom-left',
        'bottom-center',
        'bottom-right',
        'custom',
      ];

      for (const pos of positions) {
        overlay.setPosition(pos);
        expect(overlay.getPosition()).toBe(pos);
      }
    });
  });

  describe('custom position', () => {
    it('WM-U020: setCustomPosition sets x and y', () => {
      overlay.setCustomPosition(0.3, 0.7);
      const state = overlay.getState();
      expect(state.customX).toBe(0.3);
      expect(state.customY).toBe(0.7);
    });

    it('WM-U021: setCustomPosition changes mode to custom', () => {
      overlay.setCustomPosition(0.5, 0.5);
      expect(overlay.getPosition()).toBe('custom');
    });

    it('WM-U022: setCustomPosition clamps values to 0-1', () => {
      overlay.setCustomPosition(-0.5, 1.5);
      const state = overlay.getState();
      expect(state.customX).toBe(0);
      expect(state.customY).toBe(1);
    });

    it('WM-U023: setCustomPosition emits stateChanged', () => {
      const callback = vi.fn();
      overlay.on('stateChanged', callback);

      overlay.setCustomPosition(0.5, 0.5);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('scale', () => {
    it('WM-U030: getScale returns current scale', () => {
      expect(overlay.getScale()).toBe(1.0);
    });

    it('WM-U031: setScale updates scale', () => {
      overlay.setScale(1.5);
      expect(overlay.getScale()).toBe(1.5);
    });

    it('WM-U032: setScale clamps to 0.1-2.0', () => {
      overlay.setScale(0.05);
      expect(overlay.getScale()).toBe(0.1);

      overlay.setScale(3.0);
      expect(overlay.getScale()).toBe(2.0);
    });

    it('WM-U033: setScale accepts boundary values', () => {
      overlay.setScale(0.1);
      expect(overlay.getScale()).toBe(0.1);

      overlay.setScale(2.0);
      expect(overlay.getScale()).toBe(2.0);
    });

    it('WM-U034: setScale emits stateChanged', () => {
      const callback = vi.fn();
      overlay.on('stateChanged', callback);

      overlay.setScale(1.2);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ scale: 1.2 })
      );
    });
  });

  describe('opacity', () => {
    it('WM-U040: getOpacity returns current opacity', () => {
      expect(overlay.getOpacity()).toBe(0.7);
    });

    it('WM-U041: setOpacity updates opacity', () => {
      overlay.setOpacity(0.5);
      expect(overlay.getOpacity()).toBe(0.5);
    });

    it('WM-U042: setOpacity clamps to 0-1', () => {
      overlay.setOpacity(-0.5);
      expect(overlay.getOpacity()).toBe(0);

      overlay.setOpacity(1.5);
      expect(overlay.getOpacity()).toBe(1);
    });

    it('WM-U043: setOpacity accepts boundary values', () => {
      overlay.setOpacity(0);
      expect(overlay.getOpacity()).toBe(0);

      overlay.setOpacity(1);
      expect(overlay.getOpacity()).toBe(1);
    });

    it('WM-U044: setOpacity emits stateChanged', () => {
      const callback = vi.fn();
      overlay.on('stateChanged', callback);

      overlay.setOpacity(0.3);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ opacity: 0.3 })
      );
    });
  });

  describe('margin', () => {
    it('WM-U050: getMargin returns current margin', () => {
      expect(overlay.getMargin()).toBe(20);
    });

    it('WM-U051: setMargin updates margin', () => {
      overlay.setMargin(50);
      expect(overlay.getMargin()).toBe(50);
    });

    it('WM-U052: setMargin clamps to 0-200', () => {
      overlay.setMargin(-10);
      expect(overlay.getMargin()).toBe(0);

      overlay.setMargin(300);
      expect(overlay.getMargin()).toBe(200);
    });

    it('WM-U053: setMargin emits stateChanged', () => {
      const callback = vi.fn();
      overlay.on('stateChanged', callback);

      overlay.setMargin(30);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ margin: 30 })
      );
    });
  });

  describe('enabled', () => {
    it('WM-U060: setEnabled updates enabled state', () => {
      overlay.setEnabled(true);
      expect(overlay.isEnabled()).toBe(true);

      overlay.setEnabled(false);
      expect(overlay.isEnabled()).toBe(false);
    });

    it('WM-U061: setEnabled emits stateChanged', () => {
      const callback = vi.fn();
      overlay.on('stateChanged', callback);

      overlay.setEnabled(true);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });

    it('WM-U062: setEnabled does not emit if unchanged', () => {
      const callback = vi.fn();
      overlay.on('stateChanged', callback);

      overlay.setEnabled(false); // Already false
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('setState', () => {
    it('WM-U070: setState updates multiple properties', () => {
      overlay.setState({
        position: 'top-left',
        scale: 1.5,
        opacity: 0.5,
      });

      const state = overlay.getState();
      expect(state.position).toBe('top-left');
      expect(state.scale).toBe(1.5);
      expect(state.opacity).toBe(0.5);
    });

    it('WM-U071: setState emits stateChanged', () => {
      const callback = vi.fn();
      overlay.on('stateChanged', callback);

      overlay.setState({ opacity: 0.3 });
      expect(callback).toHaveBeenCalled();
    });

    it('WM-U072: setState does not emit if no changes', () => {
      const callback = vi.fn();
      overlay.on('stateChanged', callback);

      overlay.setState({}); // No changes
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('WM-U080: getState returns copy', () => {
      const state1 = overlay.getState();
      const state2 = overlay.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('WM-U081: modifying returned state does not affect overlay', () => {
      const state = overlay.getState();
      state.opacity = 0.1;

      expect(overlay.getOpacity()).not.toBe(0.1);
    });
  });

  describe('getImageDimensions', () => {
    it('WM-U090: returns null when no image', () => {
      expect(overlay.getImageDimensions()).toBeNull();
    });
  });

  describe('getBounds', () => {
    it('WM-U095: returns null when no image', () => {
      expect(overlay.getBounds(1920, 1080)).toBeNull();
    });

    it('WM-U096: returns null when disabled', () => {
      overlay.setEnabled(false);
      expect(overlay.getBounds(1920, 1080)).toBeNull();
    });
  });

  describe('toJSON', () => {
    it('WM-U100: toJSON returns serializable state', () => {
      overlay.setState({
        position: 'center',
        scale: 1.2,
        opacity: 0.8,
      });

      const json = overlay.toJSON();
      expect(json.position).toBe('center');
      expect(json.scale).toBe(1.2);
      expect(json.opacity).toBe(0.8);
      expect(json.originalWidth).toBe(0);
      expect(json.originalHeight).toBe(0);
    });
  });

  describe('removeImage', () => {
    it('WM-U105: removeImage does not emit when already cleared and disabled', () => {
      const stateChanged = vi.fn();
      const imageRemoved = vi.fn();
      overlay.on('stateChanged', stateChanged);
      overlay.on('imageRemoved', imageRemoved);

      overlay.removeImage();

      expect(stateChanged).not.toHaveBeenCalled();
      expect(imageRemoved).not.toHaveBeenCalled();
    });

    it('WM-U106: removeImage emits once when disabling without image, then becomes idempotent', () => {
      overlay.setEnabled(true);
      const stateChanged = vi.fn();
      const imageRemoved = vi.fn();
      overlay.on('stateChanged', stateChanged);
      overlay.on('imageRemoved', imageRemoved);

      overlay.removeImage();
      overlay.removeImage();

      expect(stateChanged).toHaveBeenCalledTimes(1);
      expect(imageRemoved).not.toHaveBeenCalled();
      expect(overlay.isEnabled()).toBe(false);
    });
  });

  describe('dispose', () => {
    it('WM-U110: dispose does not throw', () => {
      expect(() => overlay.dispose()).not.toThrow();
    });

    it('WM-U111: dispose can be called multiple times', () => {
      expect(() => {
        overlay.dispose();
        overlay.dispose();
      }).not.toThrow();
    });
  });
});
