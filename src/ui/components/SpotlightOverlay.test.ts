/**
 * SpotlightOverlay Component Tests
 *
 * Tests for the spotlight/vignette effect that highlights a region
 * while dimming the rest of the image.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SpotlightOverlay, DEFAULT_SPOTLIGHT_STATE, SpotlightShape } from './SpotlightOverlay';

describe('SpotlightOverlay hi-DPI support', () => {
  let spotlight: SpotlightOverlay;
  let originalDevicePixelRatio: number;

  const setDevicePixelRatio = (value: number) => {
    Object.defineProperty(window, 'devicePixelRatio', {
      value,
      writable: true,
      configurable: true,
    });
  };

  beforeEach(() => {
    originalDevicePixelRatio = window.devicePixelRatio;
  });

  afterEach(() => {
    if (spotlight) {
      spotlight.dispose();
    }
    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDevicePixelRatio,
      writable: true,
      configurable: true,
    });
  });

  it('SPOT-U130: canvas physical dimensions scale with DPR after setViewerDimensions', () => {
    setDevicePixelRatio(2);
    spotlight = new SpotlightOverlay();
    const canvas = spotlight.getElement();

    spotlight.setViewerDimensions(800, 600, 0, 0, 800, 600);

    // Physical dimensions should be 2x logical (800x600 -> 1600x1200)
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
  });

  it('SPOT-U131: canvas renders correctly at 3x DPR', () => {
    setDevicePixelRatio(3);
    spotlight = new SpotlightOverlay();
    const canvas = spotlight.getElement();

    spotlight.setViewerDimensions(800, 600, 0, 0, 800, 600);

    expect(canvas.width).toBe(2400);
    expect(canvas.height).toBe(1800);
  });

  it('SPOT-U132: render works correctly at high DPR', () => {
    setDevicePixelRatio(2);
    spotlight = new SpotlightOverlay();

    spotlight.setState({
      enabled: true,
      shape: 'circle',
      x: 0.5,
      y: 0.5,
      width: 0.3,
      height: 0.3,
      dimAmount: 0.7,
      feather: 0.1,
    });
    spotlight.setViewerDimensions(800, 600, 0, 0, 800, 600);

    expect(() => spotlight.render()).not.toThrow();
  });

  it('SPOT-U133: all shapes render at high DPR', () => {
    setDevicePixelRatio(2);
    spotlight = new SpotlightOverlay();

    spotlight.enable();
    spotlight.setViewerDimensions(800, 600, 0, 0, 800, 600);

    // Both shapes should render without error at high DPR
    expect(() => {
      spotlight.setShape('circle');
      spotlight.render();
      spotlight.setShape('rectangle');
      spotlight.render();
    }).not.toThrow();
  });

  it('SPOT-U134: position and size changes work at high DPR', () => {
    setDevicePixelRatio(2);
    spotlight = new SpotlightOverlay();

    spotlight.enable();
    spotlight.setViewerDimensions(800, 600, 0, 0, 800, 600);

    expect(() => {
      spotlight.setPosition(0.25, 0.75);
      spotlight.setSize(0.4, 0.3);
      spotlight.setFeather(0.15);
      spotlight.setDimAmount(0.8);
    }).not.toThrow();

    expect(spotlight.getState().x).toBe(0.25);
    expect(spotlight.getState().width).toBe(0.4);
  });
});

describe('SpotlightOverlay', () => {
  let spotlight: SpotlightOverlay;

  beforeEach(() => {
    spotlight = new SpotlightOverlay();
  });

  afterEach(() => {
    spotlight.dispose();
  });

  describe('initialization', () => {
    it('SPOT-U001: should initialize with default state', () => {
      expect(spotlight.getState()).toEqual(DEFAULT_SPOTLIGHT_STATE);
    });

    it('SPOT-U002: default state should be disabled', () => {
      expect(spotlight.isVisible()).toBe(false);
    });

    it('SPOT-U003: default shape should be circle', () => {
      expect(spotlight.getState().shape).toBe('circle');
    });

    it('SPOT-U004: default position should be center (0.5, 0.5)', () => {
      const state = spotlight.getState();
      expect(state.x).toBe(0.5);
      expect(state.y).toBe(0.5);
    });

    it('SPOT-U005: default size should be 0.2', () => {
      const state = spotlight.getState();
      expect(state.width).toBe(0.2);
      expect(state.height).toBe(0.2);
    });

    it('SPOT-U006: default dimAmount should be 0.7', () => {
      expect(spotlight.getState().dimAmount).toBe(0.7);
    });

    it('SPOT-U007: default feather should be 0.05', () => {
      expect(spotlight.getState().feather).toBe(0.05);
    });
  });

  describe('getElement', () => {
    it('SPOT-U010: getElement returns canvas element', () => {
      const el = spotlight.getElement();
      expect(el).toBeInstanceOf(HTMLCanvasElement);
      expect(el.dataset.testid).toBe('spotlight-overlay');
    });

    it('SPOT-U011: canvas has correct initial styles', () => {
      const el = spotlight.getElement();
      expect(el.style.position).toBe('absolute');
      expect(el.style.pointerEvents).toBe('none');
    });
  });

  describe('enable/disable/toggle', () => {
    it('SPOT-U020: enable() enables spotlight', () => {
      spotlight.enable();
      expect(spotlight.isVisible()).toBe(true);
    });

    it('SPOT-U021: disable() disables spotlight', () => {
      spotlight.enable();
      spotlight.disable();
      expect(spotlight.isVisible()).toBe(false);
    });

    it('SPOT-U022: toggle() switches enabled state', () => {
      expect(spotlight.isVisible()).toBe(false);
      spotlight.toggle();
      expect(spotlight.isVisible()).toBe(true);
      spotlight.toggle();
      expect(spotlight.isVisible()).toBe(false);
    });

    it('SPOT-U023: enable sets pointer-events to auto', () => {
      spotlight.enable();
      expect(spotlight.getElement().style.pointerEvents).toBe('auto');
    });

    it('SPOT-U024: disable sets pointer-events to none', () => {
      spotlight.enable();
      spotlight.disable();
      expect(spotlight.getElement().style.pointerEvents).toBe('none');
    });

    it('SPOT-U025: enable emits stateChanged event', () => {
      const callback = vi.fn();
      spotlight.on('stateChanged', callback);

      spotlight.enable();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('SPOT-U026: disable emits stateChanged event', () => {
      spotlight.enable();
      const callback = vi.fn();
      spotlight.on('stateChanged', callback);

      spotlight.disable();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });
  });

  describe('shape', () => {
    it('SPOT-U030: setShape changes shape to rectangle', () => {
      spotlight.setShape('rectangle');
      expect(spotlight.getState().shape).toBe('rectangle');
    });

    it('SPOT-U031: setShape changes shape to circle', () => {
      spotlight.setShape('rectangle');
      spotlight.setShape('circle');
      expect(spotlight.getState().shape).toBe('circle');
    });

    it('SPOT-U032: setShape emits stateChanged event', () => {
      const callback = vi.fn();
      spotlight.on('stateChanged', callback);

      spotlight.setShape('rectangle');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ shape: 'rectangle' }));
    });
  });

  describe('position', () => {
    it('SPOT-U040: setPosition changes x and y', () => {
      spotlight.setPosition(0.3, 0.7);
      const state = spotlight.getState();
      expect(state.x).toBe(0.3);
      expect(state.y).toBe(0.7);
    });

    it('SPOT-U041: setPosition clamps x to 0-1 range', () => {
      spotlight.setPosition(-0.5, 0.5);
      expect(spotlight.getState().x).toBe(0);

      spotlight.setPosition(1.5, 0.5);
      expect(spotlight.getState().x).toBe(1);
    });

    it('SPOT-U042: setPosition clamps y to 0-1 range', () => {
      spotlight.setPosition(0.5, -0.5);
      expect(spotlight.getState().y).toBe(0);

      spotlight.setPosition(0.5, 1.5);
      expect(spotlight.getState().y).toBe(1);
    });

    it('SPOT-U043: setPosition accepts boundary values', () => {
      spotlight.setPosition(0, 0);
      expect(spotlight.getState().x).toBe(0);
      expect(spotlight.getState().y).toBe(0);

      spotlight.setPosition(1, 1);
      expect(spotlight.getState().x).toBe(1);
      expect(spotlight.getState().y).toBe(1);
    });

    it('SPOT-U044: setPosition emits stateChanged event', () => {
      const callback = vi.fn();
      spotlight.on('stateChanged', callback);

      spotlight.setPosition(0.25, 0.75);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ x: 0.25, y: 0.75 }));
    });
  });

  describe('size', () => {
    it('SPOT-U050: setSize changes width and height', () => {
      spotlight.setSize(0.4, 0.3);
      const state = spotlight.getState();
      expect(state.width).toBe(0.4);
      expect(state.height).toBe(0.3);
    });

    it('SPOT-U051: setSize with single argument sets both', () => {
      spotlight.setSize(0.35);
      const state = spotlight.getState();
      expect(state.width).toBe(0.35);
      expect(state.height).toBe(0.35);
    });

    it('SPOT-U052: setSize clamps minimum to 0.01', () => {
      spotlight.setSize(0, 0);
      const state = spotlight.getState();
      expect(state.width).toBe(0.01);
      expect(state.height).toBe(0.01);

      spotlight.setSize(-1, -1);
      expect(spotlight.getState().width).toBe(0.01);
    });

    it('SPOT-U053: setSize clamps maximum to 1', () => {
      spotlight.setSize(2, 2);
      const state = spotlight.getState();
      expect(state.width).toBe(1);
      expect(state.height).toBe(1);
    });

    it('SPOT-U054: setSize emits stateChanged event', () => {
      const callback = vi.fn();
      spotlight.on('stateChanged', callback);

      spotlight.setSize(0.5, 0.4);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('dimAmount', () => {
    it('SPOT-U060: setDimAmount changes dim amount', () => {
      spotlight.setDimAmount(0.5);
      expect(spotlight.getState().dimAmount).toBe(0.5);
    });

    it('SPOT-U061: setDimAmount clamps to 0-1 range', () => {
      spotlight.setDimAmount(-0.5);
      expect(spotlight.getState().dimAmount).toBe(0);

      spotlight.setDimAmount(1.5);
      expect(spotlight.getState().dimAmount).toBe(1);
    });

    it('SPOT-U062: setDimAmount accepts boundary values', () => {
      spotlight.setDimAmount(0);
      expect(spotlight.getState().dimAmount).toBe(0);

      spotlight.setDimAmount(1);
      expect(spotlight.getState().dimAmount).toBe(1);
    });

    it('SPOT-U063: setDimAmount emits stateChanged event', () => {
      const callback = vi.fn();
      spotlight.on('stateChanged', callback);

      spotlight.setDimAmount(0.8);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ dimAmount: 0.8 }));
    });
  });

  describe('feather', () => {
    it('SPOT-U070: setFeather changes feather amount', () => {
      spotlight.setFeather(0.1);
      expect(spotlight.getState().feather).toBe(0.1);
    });

    it('SPOT-U071: setFeather clamps to 0-0.5 range', () => {
      spotlight.setFeather(-0.5);
      expect(spotlight.getState().feather).toBe(0);

      spotlight.setFeather(1);
      expect(spotlight.getState().feather).toBe(0.5);
    });

    it('SPOT-U072: setFeather accepts boundary values', () => {
      spotlight.setFeather(0);
      expect(spotlight.getState().feather).toBe(0);

      spotlight.setFeather(0.5);
      expect(spotlight.getState().feather).toBe(0.5);
    });

    it('SPOT-U073: setFeather emits stateChanged event', () => {
      const callback = vi.fn();
      spotlight.on('stateChanged', callback);

      spotlight.setFeather(0.2);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ feather: 0.2 }));
    });
  });

  describe('state management', () => {
    it('SPOT-U080: getState returns copy of state', () => {
      const state1 = spotlight.getState();
      const state2 = spotlight.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('SPOT-U081: setState merges partial state', () => {
      spotlight.setState({ enabled: true, shape: 'rectangle' });
      const state = spotlight.getState();
      expect(state.enabled).toBe(true);
      expect(state.shape).toBe('rectangle');
      expect(state.x).toBe(0.5); // Unchanged
    });

    it('SPOT-U082: setState emits stateChanged event', () => {
      const callback = vi.fn();
      spotlight.on('stateChanged', callback);

      spotlight.setState({ enabled: true });
      expect(callback).toHaveBeenCalled();
    });

    it('SPOT-U083: setState with all fields works correctly', () => {
      spotlight.setState({
        enabled: true,
        shape: 'rectangle',
        x: 0.25,
        y: 0.75,
        width: 0.3,
        height: 0.4,
        dimAmount: 0.6,
        feather: 0.15,
      });

      const state = spotlight.getState();
      expect(state.enabled).toBe(true);
      expect(state.shape).toBe('rectangle');
      expect(state.x).toBe(0.25);
      expect(state.y).toBe(0.75);
      expect(state.width).toBe(0.3);
      expect(state.height).toBe(0.4);
      expect(state.dimAmount).toBe(0.6);
      expect(state.feather).toBe(0.15);
    });
  });

  describe('setViewerDimensions', () => {
    it('SPOT-U090: setViewerDimensions sets canvas size', () => {
      spotlight.setViewerDimensions(800, 600, 0, 0, 800, 600);
      const canvas = spotlight.getElement();
      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(600);
    });

    it('SPOT-U091: setViewerDimensions with offset works', () => {
      spotlight.setViewerDimensions(1000, 800, 100, 50, 800, 600);
      const canvas = spotlight.getElement();
      expect(canvas.width).toBe(1000);
      expect(canvas.height).toBe(800);
    });

    it('SPOT-U092: setViewerDimensions triggers render when enabled', () => {
      spotlight.enable();
      // Should not throw when rendering with valid dimensions
      expect(() => {
        spotlight.setViewerDimensions(800, 600, 0, 0, 800, 600);
      }).not.toThrow();
    });
  });

  describe('render', () => {
    beforeEach(() => {
      // Set up valid dimensions for rendering
      spotlight.setViewerDimensions(800, 600, 0, 0, 800, 600);
    });

    it('SPOT-U100: render clears canvas when disabled', () => {
      spotlight.disable();
      // Should clear without throwing
      expect(() => spotlight.render()).not.toThrow();
    });

    it('SPOT-U101: render draws when enabled with valid dimensions', () => {
      spotlight.enable();
      expect(() => spotlight.render()).not.toThrow();
    });

    it('SPOT-U102: render handles circle shape', () => {
      spotlight.setState({ enabled: true, shape: 'circle' });
      expect(() => spotlight.render()).not.toThrow();
    });

    it('SPOT-U103: render handles rectangle shape', () => {
      spotlight.setState({ enabled: true, shape: 'rectangle' });
      expect(() => spotlight.render()).not.toThrow();
    });

    it('SPOT-U104: render handles zero feather', () => {
      spotlight.setState({ enabled: true, feather: 0 });
      expect(() => spotlight.render()).not.toThrow();
    });

    it('SPOT-U105: render handles maximum feather', () => {
      spotlight.setState({ enabled: true, feather: 0.5 });
      expect(() => spotlight.render()).not.toThrow();
    });
  });

  describe('isVisible', () => {
    it('SPOT-U110: isVisible returns false when disabled', () => {
      spotlight.disable();
      expect(spotlight.isVisible()).toBe(false);
    });

    it('SPOT-U111: isVisible returns true when enabled', () => {
      spotlight.enable();
      expect(spotlight.isVisible()).toBe(true);
    });

    it('SPOT-U112: isVisible reflects enabled state after toggle', () => {
      spotlight.toggle();
      expect(spotlight.isVisible()).toBe(true);
      spotlight.toggle();
      expect(spotlight.isVisible()).toBe(false);
    });
  });

  describe('dispose', () => {
    it('SPOT-U120: dispose cleans up without error', () => {
      expect(() => spotlight.dispose()).not.toThrow();
    });

    it('SPOT-U121: dispose can be called multiple times', () => {
      expect(() => {
        spotlight.dispose();
        spotlight.dispose();
      }).not.toThrow();
    });
  });
});

describe('SpotlightOverlay shapes', () => {
  let spotlight: SpotlightOverlay;

  beforeEach(() => {
    spotlight = new SpotlightOverlay();
    spotlight.setViewerDimensions(800, 600, 0, 0, 800, 600);
  });

  afterEach(() => {
    spotlight.dispose();
  });

  const shapes: SpotlightShape[] = ['circle', 'rectangle'];

  shapes.forEach((shape) => {
    it(`SPOT-U130-${shape}: shape ${shape} renders without error`, () => {
      spotlight.enable();
      spotlight.setShape(shape);
      expect(() => spotlight.render()).not.toThrow();
    });
  });
});

describe('Compositing: display:none for inactive overlay', () => {
  it('SPOT-DISP-001: canvas starts with display:none', () => {
    const overlay = new SpotlightOverlay();
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });

  it('SPOT-DISP-002: canvas shown when enabled', () => {
    const overlay = new SpotlightOverlay();
    overlay.enable();
    expect(overlay.getElement().style.display).toBe('');
    overlay.dispose();
  });

  it('SPOT-DISP-003: pointer-events and display both managed on toggle', () => {
    const overlay = new SpotlightOverlay();
    overlay.toggle(); // enables
    expect(overlay.getElement().style.display).toBe('');
    expect(overlay.getElement().style.pointerEvents).toBe('auto');
    overlay.toggle(); // disables
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });
});
