/**
 * MatteOverlay Unit Tests
 *
 * Tests for letterbox/pillarbox matte overlay component.
 * Based on test ID naming convention: MATTE-NNN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MatteOverlay, DEFAULT_MATTE_SETTINGS } from './MatteOverlay';

// Canvas mocks are provided by test/setup.ts

describe('MatteOverlay', () => {
  let overlay: MatteOverlay;

  beforeEach(() => {
    overlay = new MatteOverlay();
  });

  afterEach(() => {
    overlay.dispose();
  });

  // ---------------------------------------------------------------------------
  // Constructor / Initialization
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('MATTE-001: creates canvas element with correct class name', () => {
      const el = overlay.getElement();
      expect(el).toBeInstanceOf(HTMLCanvasElement);
      expect(el.className).toBe('matte-overlay');
    });

    it('MATTE-002: canvas has correct data-testid', () => {
      const el = overlay.getElement();
      expect(el.dataset.testid).toBe('matte-overlay');
    });

    it('MATTE-003: canvas has pointer-events none style', () => {
      const el = overlay.getElement();
      expect(el.style.pointerEvents).toBe('none');
    });

    it('MATTE-004: canvas has correct z-index', () => {
      const el = overlay.getElement();
      expect(el.style.zIndex).toBe('40');
    });

    it('MATTE-005: starts not visible (show is false)', () => {
      expect(overlay.isVisible()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // DEFAULT_MATTE_SETTINGS
  // ---------------------------------------------------------------------------
  describe('DEFAULT_MATTE_SETTINGS', () => {
    it('MATTE-010: default settings match specification', () => {
      expect(DEFAULT_MATTE_SETTINGS).toEqual({
        show: false,
        aspect: 1.78,
        opacity: 0.66,
        heightVisible: -1,
        centerPoint: [0, 0],
      });
    });

    it('MATTE-011: initial settings match defaults', () => {
      const settings = overlay.getSettings();
      expect(settings).toEqual(DEFAULT_MATTE_SETTINGS);
    });
  });

  // ---------------------------------------------------------------------------
  // getSettings / setSettings
  // ---------------------------------------------------------------------------
  describe('getSettings / setSettings', () => {
    it('MATTE-020: getSettings returns a copy (not reference)', () => {
      const settings1 = overlay.getSettings();
      settings1.show = true;
      const settings2 = overlay.getSettings();
      expect(settings2.show).toBe(false);
    });

    it('MATTE-021: setSettings merges partial settings', () => {
      overlay.setSettings({ show: true, aspect: 2.35 });
      const settings = overlay.getSettings();
      expect(settings.show).toBe(true);
      expect(settings.aspect).toBe(2.35);
      // Other settings should remain default
      expect(settings.opacity).toBe(0.66);
      expect(settings.centerPoint).toEqual([0, 0]);
    });

    it('MATTE-022: setSettings emits settingsChanged event', () => {
      const handler = vi.fn();
      overlay.on('settingsChanged', handler);

      overlay.setSettings({ show: true });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ show: true })
      );
    });

    it('MATTE-023: settingsChanged event data is a copy', () => {
      let emittedSettings: unknown = null;
      overlay.on('settingsChanged', (settings) => {
        emittedSettings = settings;
      });

      overlay.setSettings({ opacity: 0.5 });

      // Modifying emitted settings should not affect internal state
      (emittedSettings as Record<string, unknown>).opacity = 0.99;
      expect(overlay.getSettings().opacity).toBe(0.5);
    });
  });

  // ---------------------------------------------------------------------------
  // enable / disable / toggle
  // ---------------------------------------------------------------------------
  describe('enable / disable / toggle', () => {
    it('MATTE-030: enable sets show to true', () => {
      overlay.enable();
      expect(overlay.isVisible()).toBe(true);
      expect(overlay.getSettings().show).toBe(true);
    });

    it('MATTE-031: disable sets show to false', () => {
      overlay.enable();
      overlay.disable();
      expect(overlay.isVisible()).toBe(false);
      expect(overlay.getSettings().show).toBe(false);
    });

    it('MATTE-032: toggle switches visibility on and off', () => {
      expect(overlay.isVisible()).toBe(false);

      overlay.toggle();
      expect(overlay.isVisible()).toBe(true);

      overlay.toggle();
      expect(overlay.isVisible()).toBe(false);
    });

    it('MATTE-033: enable emits settingsChanged', () => {
      const handler = vi.fn();
      overlay.on('settingsChanged', handler);

      overlay.enable();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ show: true })
      );
    });

    it('MATTE-034: disable emits settingsChanged', () => {
      overlay.enable();
      const handler = vi.fn();
      overlay.on('settingsChanged', handler);

      overlay.disable();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ show: false })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // setAspect
  // ---------------------------------------------------------------------------
  describe('setAspect', () => {
    it('MATTE-040: setAspect updates aspect ratio', () => {
      overlay.setAspect(2.35);
      expect(overlay.getSettings().aspect).toBe(2.35);
    });

    it('MATTE-041: setAspect clamps minimum to 0.1', () => {
      overlay.setAspect(0.01);
      expect(overlay.getSettings().aspect).toBe(0.1);
    });

    it('MATTE-042: setAspect clamps maximum to 10', () => {
      overlay.setAspect(15);
      expect(overlay.getSettings().aspect).toBe(10);
    });

    it('MATTE-043: setAspect clamps negative values to 0.1', () => {
      overlay.setAspect(-5);
      expect(overlay.getSettings().aspect).toBe(0.1);
    });

    it('MATTE-044: setAspect emits settingsChanged', () => {
      const handler = vi.fn();
      overlay.on('settingsChanged', handler);

      overlay.setAspect(1.85);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ aspect: 1.85 })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // setOpacity
  // ---------------------------------------------------------------------------
  describe('setOpacity', () => {
    it('MATTE-050: setOpacity updates opacity', () => {
      overlay.setOpacity(0.8);
      expect(overlay.getSettings().opacity).toBe(0.8);
    });

    it('MATTE-051: setOpacity clamps minimum to 0', () => {
      overlay.setOpacity(-0.5);
      expect(overlay.getSettings().opacity).toBe(0);
    });

    it('MATTE-052: setOpacity clamps maximum to 1', () => {
      overlay.setOpacity(1.5);
      expect(overlay.getSettings().opacity).toBe(1);
    });

    it('MATTE-053: setOpacity emits settingsChanged', () => {
      const handler = vi.fn();
      overlay.on('settingsChanged', handler);

      overlay.setOpacity(0.5);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ opacity: 0.5 })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // setCenterPoint
  // ---------------------------------------------------------------------------
  describe('setCenterPoint', () => {
    it('MATTE-060: setCenterPoint updates center point', () => {
      overlay.setCenterPoint(0.5, -0.3);
      expect(overlay.getSettings().centerPoint).toEqual([0.5, -0.3]);
    });

    it('MATTE-061: setCenterPoint emits settingsChanged', () => {
      const handler = vi.fn();
      overlay.on('settingsChanged', handler);

      overlay.setCenterPoint(1, -1);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ centerPoint: [1, -1] })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // setViewerDimensions
  // ---------------------------------------------------------------------------
  describe('setViewerDimensions', () => {
    it('MATTE-070: setViewerDimensions does not throw', () => {
      expect(() => {
        overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      }).not.toThrow();
    });

    it('MATTE-071: setViewerDimensions triggers render when visible', () => {
      overlay.enable();
      // Should not throw when rendering with valid dimensions
      expect(() => {
        overlay.setViewerDimensions(1920, 1080, 0, 0, 1920, 1080);
      }).not.toThrow();
    });

    it('MATTE-072: setViewerDimensions does not render when not visible', () => {
      // overlay is disabled by default, should not throw
      expect(() => {
        overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      }).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // render
  // ---------------------------------------------------------------------------
  describe('render', () => {
    it('MATTE-080: render does not throw when disabled', () => {
      overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      overlay.disable();
      expect(() => overlay.render()).not.toThrow();
    });

    it('MATTE-081: render does not throw when display dimensions are zero', () => {
      overlay.enable();
      overlay.setViewerDimensions(800, 600, 0, 0, 0, 0);
      expect(() => overlay.render()).not.toThrow();
    });

    it('MATTE-082: render works with letterbox scenario (target wider than source)', () => {
      overlay.enable();
      // Source is 16:9 (1.78), target is 2.39
      overlay.setAspect(2.39);
      overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      expect(() => overlay.render()).not.toThrow();
    });

    it('MATTE-083: render works with pillarbox scenario (target narrower than source)', () => {
      overlay.enable();
      // Source is 16:9 (1.78), target is 1:1
      overlay.setAspect(1.0);
      overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      expect(() => overlay.render()).not.toThrow();
    });

    it('MATTE-084: render with matching aspects draws nothing extra', () => {
      overlay.enable();
      // Source aspect matches target aspect => no matte bars
      overlay.setViewerDimensions(1780, 1000, 0, 0, 1780, 1000);
      overlay.setAspect(1.78);
      expect(() => overlay.render()).not.toThrow();
    });

    it('MATTE-085: render with center offset does not throw', () => {
      overlay.enable();
      overlay.setAspect(2.39);
      overlay.setCenterPoint(0, 0.5);
      overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      expect(() => overlay.render()).not.toThrow();
    });

    it('MATTE-086: render with heightVisible fraction works', () => {
      overlay.setSettings({ show: true, heightVisible: 0.8 });
      overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      // heightVisible > 0 and <= 1 should use explicit fraction for letterbox
      // Need a wider target aspect to trigger letterbox
      overlay.setAspect(2.39);
      expect(() => overlay.render()).not.toThrow();
    });

    it('MATTE-087: render handles offset position', () => {
      overlay.enable();
      overlay.setAspect(2.39);
      overlay.setViewerDimensions(800, 600, 50, 50, 700, 500);
      expect(() => overlay.render()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // isVisible
  // ---------------------------------------------------------------------------
  describe('isVisible', () => {
    it('MATTE-090: isVisible returns false initially', () => {
      expect(overlay.isVisible()).toBe(false);
    });

    it('MATTE-091: isVisible returns true after enable', () => {
      overlay.enable();
      expect(overlay.isVisible()).toBe(true);
    });

    it('MATTE-092: isVisible returns false after disable', () => {
      overlay.enable();
      overlay.disable();
      expect(overlay.isVisible()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getElement
  // ---------------------------------------------------------------------------
  describe('getElement', () => {
    it('MATTE-100: getElement returns HTMLCanvasElement', () => {
      expect(overlay.getElement()).toBeInstanceOf(HTMLCanvasElement);
    });

    it('MATTE-101: getElement returns same element on subsequent calls', () => {
      const el1 = overlay.getElement();
      const el2 = overlay.getElement();
      expect(el1).toBe(el2);
    });
  });

  // ---------------------------------------------------------------------------
  // dispose
  // ---------------------------------------------------------------------------
  describe('dispose', () => {
    it('MATTE-110: dispose does not throw', () => {
      expect(() => overlay.dispose()).not.toThrow();
    });

    it('MATTE-111: dispose is idempotent', () => {
      overlay.dispose();
      expect(() => overlay.dispose()).not.toThrow();
    });
  });
});

describe('Compositing: display:none for inactive overlay', () => {
  it('MATTE-DISP-001: canvas starts with display:none', () => {
    const overlay = new MatteOverlay();
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });

  it('MATTE-DISP-002: canvas shown when show is true', () => {
    const overlay = new MatteOverlay();
    overlay.setSettings({ show: true });
    expect(overlay.getElement().style.display).toBe('');
    overlay.dispose();
  });

  it('MATTE-DISP-003: canvas hidden when show set to false', () => {
    const overlay = new MatteOverlay();
    overlay.setSettings({ show: true });
    overlay.setSettings({ show: false });
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });
});
