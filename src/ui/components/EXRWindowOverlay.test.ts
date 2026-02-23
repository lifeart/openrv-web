/**
 * EXRWindowOverlay Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EXRWindowOverlay,
  DEFAULT_EXR_WINDOW_OVERLAY_STATE,
} from './EXRWindowOverlay';
import type { EXRBox2i } from '../../formats/EXRDecoder';

// Canvas mocks are provided by test/setup.ts

const SAMPLE_DATA_WINDOW: EXRBox2i = { xMin: 100, yMin: 50, xMax: 899, yMax: 549 };
const SAMPLE_DISPLAY_WINDOW: EXRBox2i = { xMin: 0, yMin: 0, xMax: 999, yMax: 599 };

describe('EXRWindowOverlay', () => {
  let overlay: EXRWindowOverlay;

  beforeEach(() => {
    overlay = new EXRWindowOverlay();
  });

  afterEach(() => {
    overlay.dispose();
  });

  // ---------------------------------------------------------------------------
  // Constructor / Initialization
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('EXR-001: creates canvas with correct class name', () => {
      const el = overlay.getElement();
      expect(el).toBeInstanceOf(HTMLCanvasElement);
      expect(el.className).toBe('exr-window-overlay');
    });

    it('EXR-002: canvas has correct data-testid', () => {
      const el = overlay.getElement();
      expect(el.dataset.testid).toBe('exr-window-overlay');
    });

    it('EXR-003: canvas has pointer-events none', () => {
      const el = overlay.getElement();
      expect(el.style.pointerEvents).toBe('none');
    });

    it('EXR-004: canvas has correct z-index', () => {
      const el = overlay.getElement();
      expect(el.style.zIndex).toBe('42');
    });

    it('EXR-005: starts not visible', () => {
      expect(overlay.isVisible()).toBe(false);
    });

    it('EXR-006: starts without windows', () => {
      expect(overlay.hasWindows()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // DEFAULT_EXR_WINDOW_OVERLAY_STATE
  // ---------------------------------------------------------------------------
  describe('DEFAULT_EXR_WINDOW_OVERLAY_STATE', () => {
    it('EXR-010: default state matches specification', () => {
      expect(DEFAULT_EXR_WINDOW_OVERLAY_STATE).toEqual({
        enabled: false,
        showDataWindow: true,
        showDisplayWindow: true,
        dataWindowColor: '#00ff00',
        displayWindowColor: '#00ccff',
        lineWidth: 2,
        dashPattern: [6, 4],
        showLabels: true,
      });
    });

    it('EXR-011: initial state matches defaults', () => {
      const state = overlay.getState();
      expect(state).toEqual(DEFAULT_EXR_WINDOW_OVERLAY_STATE);
    });
  });

  // ---------------------------------------------------------------------------
  // setWindows / clearWindows / hasWindows
  // ---------------------------------------------------------------------------
  describe('setWindows / clearWindows / hasWindows', () => {
    it('EXR-020: setWindows stores windows', () => {
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      expect(overlay.hasWindows()).toBe(true);
    });

    it('EXR-021: getDataWindow returns a copy', () => {
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      const dw = overlay.getDataWindow();
      expect(dw).toEqual(SAMPLE_DATA_WINDOW);
      expect(dw).not.toBe(SAMPLE_DATA_WINDOW);
    });

    it('EXR-022: getDisplayWindow returns a copy', () => {
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      const disp = overlay.getDisplayWindow();
      expect(disp).toEqual(SAMPLE_DISPLAY_WINDOW);
      expect(disp).not.toBe(SAMPLE_DISPLAY_WINDOW);
    });

    it('EXR-023: getDataWindow returns null when no windows set', () => {
      expect(overlay.getDataWindow()).toBeNull();
    });

    it('EXR-024: getDisplayWindow returns null when no windows set', () => {
      expect(overlay.getDisplayWindow()).toBeNull();
    });

    it('EXR-025: clearWindows clears both windows', () => {
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      overlay.clearWindows();
      expect(overlay.hasWindows()).toBe(false);
      expect(overlay.getDataWindow()).toBeNull();
      expect(overlay.getDisplayWindow()).toBeNull();
    });

    it('EXR-026: setWindows stores copies (mutation-safe)', () => {
      const dw = { ...SAMPLE_DATA_WINDOW };
      const dispW = { ...SAMPLE_DISPLAY_WINDOW };
      overlay.setWindows(dw, dispW);

      // Mutate originals
      dw.xMin = 999;
      dispW.xMax = 0;

      // Stored values should not be affected
      expect(overlay.getDataWindow()!.xMin).toBe(SAMPLE_DATA_WINDOW.xMin);
      expect(overlay.getDisplayWindow()!.xMax).toBe(SAMPLE_DISPLAY_WINDOW.xMax);
    });
  });

  // ---------------------------------------------------------------------------
  // getState / setState
  // ---------------------------------------------------------------------------
  describe('getState / setState', () => {
    it('EXR-030: getState returns a copy', () => {
      const s1 = overlay.getState();
      const s2 = overlay.getState();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
    });

    it('EXR-031: setState merges partial state', () => {
      overlay.setState({ enabled: true, showLabels: false });
      const state = overlay.getState();
      expect(state.enabled).toBe(true);
      expect(state.showLabels).toBe(false);
      // Other fields should remain default
      expect(state.showDataWindow).toBe(true);
      expect(state.dataWindowColor).toBe('#00ff00');
    });

    it('EXR-032: setState emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.setState({ enabled: true });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });

    it('EXR-033: stateChanged event data is a copy', () => {
      let emittedState: unknown = null;
      overlay.on('stateChanged', (state) => {
        emittedState = state;
      });
      overlay.setState({ lineWidth: 3 });
      (emittedState as Record<string, unknown>).lineWidth = 99;
      expect(overlay.getState().lineWidth).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // toggle / enable / disable
  // ---------------------------------------------------------------------------
  describe('toggle / enable / disable', () => {
    it('EXR-040: enable sets enabled to true', () => {
      overlay.enable();
      expect(overlay.isVisible()).toBe(true);
      expect(overlay.getState().enabled).toBe(true);
    });

    it('EXR-041: disable sets enabled to false', () => {
      overlay.enable();
      overlay.disable();
      expect(overlay.isVisible()).toBe(false);
      expect(overlay.getState().enabled).toBe(false);
    });

    it('EXR-042: toggle switches enabled state', () => {
      overlay.toggle();
      expect(overlay.isVisible()).toBe(true);
      overlay.toggle();
      expect(overlay.isVisible()).toBe(false);
    });

    it('EXR-043: enable emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.enable();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });

    it('EXR-044: disable emits stateChanged', () => {
      overlay.enable();
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.disable();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Individual window visibility
  // ---------------------------------------------------------------------------
  describe('individual window visibility', () => {
    it('EXR-050: setShowDataWindow updates state', () => {
      overlay.setShowDataWindow(false);
      expect(overlay.getState().showDataWindow).toBe(false);
    });

    it('EXR-051: setShowDisplayWindow updates state', () => {
      overlay.setShowDisplayWindow(false);
      expect(overlay.getState().showDisplayWindow).toBe(false);
    });

    it('EXR-052: setShowDataWindow emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.setShowDataWindow(false);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ showDataWindow: false })
      );
    });

    it('EXR-053: setShowDisplayWindow emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.setShowDisplayWindow(false);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ showDisplayWindow: false })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Colors
  // ---------------------------------------------------------------------------
  describe('colors', () => {
    it('EXR-060: setDataWindowColor updates color', () => {
      overlay.setDataWindowColor('#ff0000');
      expect(overlay.getState().dataWindowColor).toBe('#ff0000');
    });

    it('EXR-061: setDisplayWindowColor updates color', () => {
      overlay.setDisplayWindowColor('#0000ff');
      expect(overlay.getState().displayWindowColor).toBe('#0000ff');
    });

    it('EXR-062: setDataWindowColor emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.setDataWindowColor('#ff0000');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ dataWindowColor: '#ff0000' })
      );
    });

    it('EXR-063: setDisplayWindowColor emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);
      overlay.setDisplayWindowColor('#0000ff');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ displayWindowColor: '#0000ff' })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  describe('render', () => {
    it('EXR-070: render does not throw when disabled', () => {
      overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-071: render does not throw without windows', () => {
      overlay.enable();
      overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-072: render does not throw with zero display dimensions', () => {
      overlay.enable();
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      overlay.setViewerDimensions(800, 600, 0, 0, 0, 0);
      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-073: render works with valid dimensions and windows', () => {
      overlay.enable();
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      overlay.setViewerDimensions(1000, 600, 0, 0, 1000, 600);
      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-074: render works with offset viewer position', () => {
      overlay.enable();
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      overlay.setViewerDimensions(1000, 600, 50, 30, 900, 540);
      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-075: render works with only data window shown', () => {
      overlay.enable();
      overlay.setShowDisplayWindow(false);
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      overlay.setViewerDimensions(1000, 600, 0, 0, 1000, 600);
      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-076: render works with only display window shown', () => {
      overlay.enable();
      overlay.setShowDataWindow(false);
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      overlay.setViewerDimensions(1000, 600, 0, 0, 1000, 600);
      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-077: render works with labels disabled', () => {
      overlay.enable();
      overlay.setState({ showLabels: false });
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      overlay.setViewerDimensions(1000, 600, 0, 0, 1000, 600);
      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-078: render works when data and display windows are identical', () => {
      overlay.enable();
      const identicalWindow: EXRBox2i = { xMin: 0, yMin: 0, xMax: 999, yMax: 599 };
      overlay.setWindows(identicalWindow, identicalWindow);
      overlay.setViewerDimensions(1000, 600, 0, 0, 1000, 600);
      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-079: render works when data window is larger than display window', () => {
      overlay.enable();
      const largeDW: EXRBox2i = { xMin: -50, yMin: -50, xMax: 1049, yMax: 649 };
      overlay.setWindows(largeDW, SAMPLE_DISPLAY_WINDOW);
      overlay.setViewerDimensions(1000, 600, 0, 0, 1000, 600);
      expect(() => overlay.render()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // setViewerDimensions
  // ---------------------------------------------------------------------------
  describe('setViewerDimensions', () => {
    it('EXR-080: setViewerDimensions does not throw', () => {
      expect(() => {
        overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      }).not.toThrow();
    });

    it('EXR-081: triggers render when visible', () => {
      overlay.enable();
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      expect(() => {
        overlay.setViewerDimensions(1920, 1080, 0, 0, 1920, 1080);
      }).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // isVisible
  // ---------------------------------------------------------------------------
  describe('isVisible', () => {
    it('EXR-090: returns false initially', () => {
      expect(overlay.isVisible()).toBe(false);
    });

    it('EXR-091: returns true after enable', () => {
      overlay.enable();
      expect(overlay.isVisible()).toBe(true);
    });

    it('EXR-092: returns false after disable', () => {
      overlay.enable();
      overlay.disable();
      expect(overlay.isVisible()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getElement
  // ---------------------------------------------------------------------------
  describe('getElement', () => {
    it('EXR-100: returns HTMLCanvasElement', () => {
      expect(overlay.getElement()).toBeInstanceOf(HTMLCanvasElement);
    });

    it('EXR-101: returns same element on subsequent calls', () => {
      const e1 = overlay.getElement();
      const e2 = overlay.getElement();
      expect(e1).toBe(e2);
    });
  });

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------
  describe('dispose', () => {
    it('EXR-110: dispose does not throw', () => {
      expect(() => overlay.dispose()).not.toThrow();
    });

    it('EXR-111: dispose is idempotent', () => {
      overlay.dispose();
      expect(() => overlay.dispose()).not.toThrow();
    });
  });
});
