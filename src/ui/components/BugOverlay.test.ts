/**
 * BugOverlay Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BugOverlay,
  DEFAULT_BUG_OVERLAY_STATE,
  BugPosition,
} from './BugOverlay';

// Canvas mocks are provided by test/setup.ts

describe('BugOverlay', () => {
  let overlay: BugOverlay;

  beforeEach(() => {
    overlay = new BugOverlay();
  });

  afterEach(() => {
    overlay.dispose();
  });

  // ---------------------------------------------------------------------------
  // Constructor / Initialization
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('BUG-001: creates canvas element with correct class name', () => {
      const el = overlay.getElement();
      expect(el).toBeInstanceOf(HTMLCanvasElement);
      expect(el.className).toBe('bug-overlay');
    });

    it('BUG-002: canvas has correct data-testid', () => {
      const el = overlay.getElement();
      expect(el.dataset.testid).toBe('bug-overlay');
    });

    it('BUG-003: canvas has pointer-events none', () => {
      const el = overlay.getElement();
      expect(el.style.pointerEvents).toBe('none');
    });

    it('BUG-004: canvas has correct z-index', () => {
      const el = overlay.getElement();
      expect(el.style.zIndex).toBe('55');
    });

    it('BUG-005: starts not visible', () => {
      expect(overlay.isVisible()).toBe(false);
    });

    it('BUG-006: starts without image', () => {
      expect(overlay.hasImage()).toBe(false);
    });

    it('BUG-007: initializes with default state', () => {
      const state = overlay.getState();
      expect(state).toEqual(DEFAULT_BUG_OVERLAY_STATE);
    });

    it('BUG-008: accepts initial state in constructor', () => {
      const custom = new BugOverlay({
        position: 'top-left',
        size: 0.12,
        opacity: 0.5,
      });
      expect(custom.getPosition()).toBe('top-left');
      expect(custom.getSize()).toBe(0.12);
      expect(custom.getOpacity()).toBe(0.5);
      custom.dispose();
    });
  });

  // ---------------------------------------------------------------------------
  // DEFAULT_BUG_OVERLAY_STATE
  // ---------------------------------------------------------------------------
  describe('DEFAULT_BUG_OVERLAY_STATE', () => {
    it('BUG-010: default state matches specification', () => {
      expect(DEFAULT_BUG_OVERLAY_STATE).toEqual({
        enabled: false,
        imageUrl: null,
        position: 'bottom-right',
        size: 0.08,
        opacity: 0.8,
        margin: 12,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Position
  // ---------------------------------------------------------------------------
  describe('position', () => {
    it('BUG-020: getPosition returns default', () => {
      expect(overlay.getPosition()).toBe('bottom-right');
    });

    it('BUG-021: setPosition updates position', () => {
      overlay.setPosition('top-left');
      expect(overlay.getPosition()).toBe('top-left');
    });

    it('BUG-022: setPosition emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.setPosition('top-right');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ position: 'top-right' })
      );
    });

    it('BUG-023: setPosition does not emit if unchanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.setPosition('bottom-right'); // same as default
      expect(handler).not.toHaveBeenCalled();
    });

    it('BUG-024: all positions are valid', () => {
      const positions: BugPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
      for (const pos of positions) {
        overlay.setPosition(pos);
        expect(overlay.getPosition()).toBe(pos);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Size
  // ---------------------------------------------------------------------------
  describe('size', () => {
    it('BUG-030: getSize returns default', () => {
      expect(overlay.getSize()).toBe(0.08);
    });

    it('BUG-031: setSize updates size', () => {
      overlay.setSize(0.15);
      expect(overlay.getSize()).toBe(0.15);
    });

    it('BUG-032: setSize clamps to 0.02 - 0.3', () => {
      overlay.setSize(0.001);
      expect(overlay.getSize()).toBe(0.02);

      overlay.setSize(0.5);
      expect(overlay.getSize()).toBe(0.3);
    });

    it('BUG-033: setSize emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.setSize(0.1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ size: 0.1 })
      );
    });

    it('BUG-034: setSize does not emit if unchanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.setSize(0.08); // same as default
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Opacity
  // ---------------------------------------------------------------------------
  describe('opacity', () => {
    it('BUG-040: getOpacity returns default', () => {
      expect(overlay.getOpacity()).toBe(0.8);
    });

    it('BUG-041: setOpacity updates opacity', () => {
      overlay.setOpacity(0.5);
      expect(overlay.getOpacity()).toBe(0.5);
    });

    it('BUG-042: setOpacity clamps to 0 - 1', () => {
      overlay.setOpacity(-0.5);
      expect(overlay.getOpacity()).toBe(0);

      overlay.setOpacity(1.5);
      expect(overlay.getOpacity()).toBe(1);
    });

    it('BUG-043: setOpacity emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.setOpacity(0.3);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ opacity: 0.3 })
      );
    });

    it('BUG-044: setOpacity does not emit if unchanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.setOpacity(0.8); // same as default
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Margin
  // ---------------------------------------------------------------------------
  describe('margin', () => {
    it('BUG-050: getMargin returns default', () => {
      expect(overlay.getMargin()).toBe(12);
    });

    it('BUG-051: setMargin updates margin', () => {
      overlay.setMargin(30);
      expect(overlay.getMargin()).toBe(30);
    });

    it('BUG-052: setMargin clamps to 0 - 100', () => {
      overlay.setMargin(-5);
      expect(overlay.getMargin()).toBe(0);

      overlay.setMargin(200);
      expect(overlay.getMargin()).toBe(100);
    });

    it('BUG-053: setMargin emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.setMargin(20);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ margin: 20 })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Enable / Disable / Toggle
  // ---------------------------------------------------------------------------
  describe('enable / disable / toggle', () => {
    it('BUG-060: enable sets enabled to true', () => {
      overlay.enable();
      expect(overlay.isEnabled()).toBe(true);
    });

    it('BUG-061: disable sets enabled to false', () => {
      overlay.enable();
      overlay.disable();
      expect(overlay.isEnabled()).toBe(false);
    });

    it('BUG-062: toggle switches enabled state', () => {
      overlay.toggle();
      expect(overlay.isEnabled()).toBe(true);
      overlay.toggle();
      expect(overlay.isEnabled()).toBe(false);
    });

    it('BUG-063: enable emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.enable();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // setImage
  // ---------------------------------------------------------------------------
  describe('setImage', () => {
    it('BUG-070: setImage sets image and enables', () => {
      const img = new Image();
      (img as any)._width = 100;
      (img as any)._height = 50;
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 50 });

      overlay.setImage(img);
      expect(overlay.hasImage()).toBe(true);
      expect(overlay.isEnabled()).toBe(true);
    });

    it('BUG-071: setImage emits imageLoaded', () => {
      const handler = vi.fn();
      overlay.on('imageLoaded', handler);

      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 200 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });

      overlay.setImage(img);
      expect(handler).toHaveBeenCalledWith({ width: 200, height: 100 });
    });

    it('BUG-072: setImage emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);

      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });

      overlay.setImage(img);
      expect(handler).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // removeImage
  // ---------------------------------------------------------------------------
  describe('removeImage', () => {
    it('BUG-080: removeImage clears image and disables', () => {
      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });
      overlay.setImage(img);

      overlay.removeImage();
      expect(overlay.hasImage()).toBe(false);
      expect(overlay.isEnabled()).toBe(false);
    });

    it('BUG-081: removeImage emits stateChanged', () => {
      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });
      overlay.setImage(img);

      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.removeImage();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false, imageUrl: null })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // isVisible
  // ---------------------------------------------------------------------------
  describe('isVisible', () => {
    it('BUG-090: returns false when no image', () => {
      overlay.enable();
      expect(overlay.isVisible()).toBe(false);
    });

    it('BUG-091: returns false when disabled', () => {
      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });
      overlay.setImage(img);
      overlay.disable();
      expect(overlay.isVisible()).toBe(false);
    });

    it('BUG-092: returns true when enabled with image', () => {
      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });
      overlay.setImage(img);
      expect(overlay.isVisible()).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  describe('render', () => {
    it('BUG-100: render does not throw when disabled', () => {
      overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      expect(() => overlay.render()).not.toThrow();
    });

    it('BUG-101: render does not throw when no image', () => {
      overlay.enable();
      overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      expect(() => overlay.render()).not.toThrow();
    });

    it('BUG-102: render does not throw when display dimensions are zero', () => {
      overlay.enable();
      overlay.setViewerDimensions(800, 600, 0, 0, 0, 0);
      expect(() => overlay.render()).not.toThrow();
    });

    it('BUG-103: render works with image and valid dimensions', () => {
      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 50 });
      overlay.setImage(img);
      overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      expect(() => overlay.render()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // setState
  // ---------------------------------------------------------------------------
  describe('setState', () => {
    it('BUG-110: setState updates multiple properties', () => {
      overlay.setState({
        position: 'top-left',
        size: 0.15,
        opacity: 0.5,
        margin: 20,
      });
      const state = overlay.getState();
      expect(state.position).toBe('top-left');
      expect(state.size).toBe(0.15);
      expect(state.opacity).toBe(0.5);
      expect(state.margin).toBe(20);
    });
  });

  // ---------------------------------------------------------------------------
  // getElement
  // ---------------------------------------------------------------------------
  describe('getElement', () => {
    it('BUG-120: returns HTMLCanvasElement', () => {
      expect(overlay.getElement()).toBeInstanceOf(HTMLCanvasElement);
    });

    it('BUG-121: returns same element on subsequent calls', () => {
      const e1 = overlay.getElement();
      const e2 = overlay.getElement();
      expect(e1).toBe(e2);
    });
  });

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------
  describe('dispose', () => {
    it('BUG-130: dispose does not throw', () => {
      expect(() => overlay.dispose()).not.toThrow();
    });

    it('BUG-131: dispose is idempotent', () => {
      overlay.dispose();
      expect(() => overlay.dispose()).not.toThrow();
    });

    it('BUG-132: dispose clears image', () => {
      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });
      overlay.setImage(img);
      overlay.dispose();
      expect(overlay.hasImage()).toBe(false);
    });
  });
});

describe('Compositing: display:none for inactive overlay', () => {
  it('BUG-DISP-001: canvas starts with display:none', () => {
    const overlay = new BugOverlay();
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });

  it('BUG-DISP-002: canvas remains hidden when enabled but no image', () => {
    const overlay = new BugOverlay();
    overlay.enable();
    // isVisible() = enabled && bugImage !== null => false (no image)
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });

  it('BUG-DISP-003: canvas shown when enabled AND image loaded via setImage', () => {
    const overlay = new BugOverlay();
    const img = new Image();
    Object.defineProperty(img, 'naturalWidth', { value: 100 });
    Object.defineProperty(img, 'naturalHeight', { value: 50 });
    overlay.setImage(img);
    // setImage() sets enabled=true and calls updateCanvasDisplay()
    expect(overlay.getElement().style.display).toBe('');
    overlay.dispose();
  });

  it('BUG-DISP-004: canvas hidden after removeImage()', () => {
    const overlay = new BugOverlay();
    const img = new Image();
    Object.defineProperty(img, 'naturalWidth', { value: 100 });
    Object.defineProperty(img, 'naturalHeight', { value: 50 });
    overlay.setImage(img);
    overlay.removeImage();
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });

  it('BUG-DISP-005: canvas hidden when disabled with image loaded', () => {
    const overlay = new BugOverlay();
    const img = new Image();
    Object.defineProperty(img, 'naturalWidth', { value: 100 });
    Object.defineProperty(img, 'naturalHeight', { value: 50 });
    overlay.setImage(img);
    overlay.disable();
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });
});
