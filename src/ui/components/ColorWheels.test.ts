/**
 * ColorWheels Unit Tests
 *
 * Tests for Lift/Gamma/Gain Color Wheels component (FEATURES.md 1.1)
 * Based on test cases WHEEL-001 through WHEEL-008
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ColorWheels,
  ColorWheelsState,
  DEFAULT_WHEEL_VALUES,
  DEFAULT_COLOR_WHEELS_STATE,
} from './ColorWheels';

// Canvas mocks are provided by test/setup.ts

// Helper to create a mock parent element
function createMockParent(): HTMLElement {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return parent;
}

// Helper to create test ImageData
function createTestImageData(width: number, height: number, fill?: { r: number; g: number; b: number; a: number }): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill.r;
      data[i + 1] = fill.g;
      data[i + 2] = fill.b;
      data[i + 3] = fill.a;
    }
  }
  return new ImageData(data, width, height);
}

describe('ColorWheels hi-DPI support', () => {
  let colorWheels: ColorWheels;
  let parent: HTMLElement;
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
    parent = createMockParent();
  });

  afterEach(() => {
    if (colorWheels) {
      colorWheels.dispose();
    }
    parent.remove();
    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDevicePixelRatio,
      writable: true,
      configurable: true,
    });
  });

  it('WHEEL-100: wheel canvas physical dimensions scale with DPR', () => {
    setDevicePixelRatio(2);
    colorWheels = new ColorWheels(parent);

    // Find the first wheel canvas (wheel size is 140x140 logical = 280x280 physical at 2x)
    const canvases = parent.querySelectorAll('canvas');
    expect(canvases.length).toBeGreaterThan(0);

    const canvas = canvases[0] as HTMLCanvasElement;
    // WHEEL_CANVAS_SIZE = 140 (120 + 20), so at 2x DPR = 280
    expect(canvas.width).toBe(280);
    expect(canvas.height).toBe(280);
  });

  it('WHEEL-101: wheel canvas CSS dimensions remain at logical size', () => {
    setDevicePixelRatio(2);
    colorWheels = new ColorWheels(parent);

    const canvases = parent.querySelectorAll('canvas');
    const canvas = canvases[0] as HTMLCanvasElement;

    expect(canvas.style.width).toBe('140px');
    expect(canvas.style.height).toBe('140px');
  });

  it('WHEEL-102: wheel rendering works at 3x DPR', () => {
    setDevicePixelRatio(3);
    colorWheels = new ColorWheels(parent);

    const canvases = parent.querySelectorAll('canvas');
    const canvas = canvases[0] as HTMLCanvasElement;

    // 140 * 3 = 420
    expect(canvas.width).toBe(420);
    expect(canvas.height).toBe(420);
  });

  it('WHEEL-103: state changes work at high DPR', () => {
    setDevicePixelRatio(2);
    colorWheels = new ColorWheels(parent);

    expect(() => {
      colorWheels.setState({
        lift: { r: 0.5, g: -0.3, b: 0.2, y: 0.1 },
      });
    }).not.toThrow();

    expect(colorWheels.getState().lift.r).toBe(0.5);
  });

  it('WHEEL-104: apply works at high DPR', () => {
    setDevicePixelRatio(2);
    colorWheels = new ColorWheels(parent);

    colorWheels.setState({
      lift: { r: 0.3, g: 0, b: 0, y: 0 },
    });

    const imageData = createTestImageData(10, 10, { r: 30, g: 30, b: 30, a: 255 });

    expect(() => colorWheels.apply(imageData)).not.toThrow();
    expect(imageData.data[0]).toBeGreaterThan(30);
  });
});

describe('ColorWheels', () => {
  let colorWheels: ColorWheels;
  let parent: HTMLElement;

  beforeEach(() => {
    parent = createMockParent();
    colorWheels = new ColorWheels(parent);
  });

  afterEach(() => {
    colorWheels.dispose();
    parent.remove();
  });

  describe('initialization', () => {
    it('WHEEL-001: starts hidden', () => {
      expect(colorWheels.isVisible()).toBe(false);
    });

    it('WHEEL-002: has default state values', () => {
      const state = colorWheels.getState();
      expect(state.lift.r).toBe(0);
      expect(state.lift.g).toBe(0);
      expect(state.lift.b).toBe(0);
      expect(state.lift.y).toBe(0);
      expect(state.gamma.r).toBe(0);
      expect(state.gain.r).toBe(0);
      expect(state.master.r).toBe(0);
      expect(state.linked).toBe(false);
    });

    it('WHEEL-003: creates four wheels (Lift, Gamma, Gain, Master)', () => {
      const container = parent.querySelector('[data-testid="color-wheels-container"]');
      expect(container).not.toBeNull();

      const wheelContainers = parent.querySelectorAll('[class^="wheel-"]');
      expect(wheelContainers.length).toBe(4);
    });

    it('WHEEL-004: default wheel values match specification', () => {
      expect(DEFAULT_WHEEL_VALUES).toEqual({
        r: 0,
        g: 0,
        b: 0,
        y: 0,
      });
    });

    it('WHEEL-005: default state matches specification', () => {
      expect(DEFAULT_COLOR_WHEELS_STATE.lift).toEqual(DEFAULT_WHEEL_VALUES);
      expect(DEFAULT_COLOR_WHEELS_STATE.gamma).toEqual(DEFAULT_WHEEL_VALUES);
      expect(DEFAULT_COLOR_WHEELS_STATE.gain).toEqual(DEFAULT_WHEEL_VALUES);
      expect(DEFAULT_COLOR_WHEELS_STATE.master).toEqual(DEFAULT_WHEEL_VALUES);
      expect(DEFAULT_COLOR_WHEELS_STATE.linked).toBe(false);
    });
  });

  describe('visibility', () => {
    it('WHEEL-010: show makes wheels visible', () => {
      const handler = vi.fn();
      colorWheels.on('visibilityChanged', handler);

      colorWheels.show();

      expect(colorWheels.isVisible()).toBe(true);
      expect(handler).toHaveBeenCalledWith(true);
    });

    it('WHEEL-011: hide makes wheels hidden', () => {
      colorWheels.show();
      const handler = vi.fn();
      colorWheels.on('visibilityChanged', handler);

      colorWheels.hide();

      expect(colorWheels.isVisible()).toBe(false);
      expect(handler).toHaveBeenCalledWith(false);
    });

    it('WHEEL-012: toggle shows when hidden', () => {
      colorWheels.toggle();
      expect(colorWheels.isVisible()).toBe(true);
    });

    it('WHEEL-013: toggle hides when visible', () => {
      colorWheels.show();
      colorWheels.toggle();
      expect(colorWheels.isVisible()).toBe(false);
    });
  });

  describe('state management', () => {
    it('WHEEL-020: setState updates wheel values', () => {
      const handler = vi.fn();
      colorWheels.on('stateChanged', handler);

      colorWheels.setState({
        lift: { r: 0.5, g: -0.3, b: 0.2, y: 0.1 },
      });

      const state = colorWheels.getState();
      expect(state.lift.r).toBe(0.5);
      expect(state.lift.g).toBe(-0.3);
      expect(state.lift.b).toBe(0.2);
      expect(state.lift.y).toBe(0.1);
      expect(handler).toHaveBeenCalled();
    });

    it('WHEEL-021: setState preserves unspecified values', () => {
      colorWheels.setState({
        lift: { r: 0.5, g: 0, b: 0, y: 0 },
      });

      colorWheels.setState({
        gamma: { r: 0.2, g: 0, b: 0, y: 0 },
      });

      const state = colorWheels.getState();
      expect(state.lift.r).toBe(0.5);
      expect(state.gamma.r).toBe(0.2);
    });

    it('WHEEL-022: setState updates linked state', () => {
      colorWheels.setState({ linked: true });
      expect(colorWheels.getState().linked).toBe(true);
    });

    it('WHEEL-023: getState returns a copy', () => {
      const state1 = colorWheels.getState();
      state1.lift.r = 999;
      const state2 = colorWheels.getState();
      expect(state2.lift.r).toBe(0);
    });
  });

  describe('reset functionality', () => {
    it('WHEEL-003: reset returns all wheels to neutral (FEATURES.md WHEEL-003)', () => {
      colorWheels.setState({
        lift: { r: 0.5, g: 0.5, b: 0.5, y: 0.5 },
        gamma: { r: 0.3, g: 0.3, b: 0.3, y: 0.3 },
        gain: { r: -0.2, g: -0.2, b: -0.2, y: -0.2 },
      });

      colorWheels.reset();

      const state = colorWheels.getState();
      expect(state.lift).toEqual(DEFAULT_WHEEL_VALUES);
      expect(state.gamma).toEqual(DEFAULT_WHEEL_VALUES);
      expect(state.gain).toEqual(DEFAULT_WHEEL_VALUES);
      expect(state.master).toEqual(DEFAULT_WHEEL_VALUES);
    });

    it('WHEEL-030: resetWheel resets single wheel to neutral', () => {
      colorWheels.setState({
        lift: { r: 0.5, g: 0.5, b: 0.5, y: 0.5 },
        gamma: { r: 0.3, g: 0.3, b: 0.3, y: 0.3 },
      });

      colorWheels.resetWheel('lift');

      const state = colorWheels.getState();
      expect(state.lift).toEqual(DEFAULT_WHEEL_VALUES);
      expect(state.gamma.r).toBe(0.3); // Unchanged
    });

    it('WHEEL-031: reset emits stateChanged event', () => {
      const handler = vi.fn();
      colorWheels.setState({
        lift: { r: 0.5, g: 0, b: 0, y: 0 },
      });

      colorWheels.on('stateChanged', handler);
      colorWheels.reset();

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('hasAdjustments check', () => {
    it('WHEEL-040: hasAdjustments returns false when all neutral', () => {
      expect(colorWheels.hasAdjustments()).toBe(false);
    });

    it('WHEEL-041: hasAdjustments returns true when lift modified', () => {
      colorWheels.setState({
        lift: { r: 0.1, g: 0, b: 0, y: 0 },
      });
      expect(colorWheels.hasAdjustments()).toBe(true);
    });

    it('WHEEL-042: hasAdjustments returns true when gamma modified', () => {
      colorWheels.setState({
        gamma: { r: 0, g: 0.1, b: 0, y: 0 },
      });
      expect(colorWheels.hasAdjustments()).toBe(true);
    });

    it('WHEEL-043: hasAdjustments returns true when gain modified', () => {
      colorWheels.setState({
        gain: { r: 0, g: 0, b: 0.1, y: 0 },
      });
      expect(colorWheels.hasAdjustments()).toBe(true);
    });

    it('WHEEL-044: hasAdjustments returns true when master modified', () => {
      colorWheels.setState({
        master: { r: 0, g: 0, b: 0, y: 0.1 },
      });
      expect(colorWheels.hasAdjustments()).toBe(true);
    });
  });

  describe('undo/redo functionality (FEATURES.md WHEEL-007)', () => {
    it('WHEEL-007: undo returns to previous state', () => {
      colorWheels.setState({
        lift: { r: 0.5, g: 0, b: 0, y: 0 },
      });

      // Trigger internal undo save by simulating reset (which calls saveStateForUndo)
      colorWheels.reset();

      const undone = colorWheels.undo();
      expect(undone).toBe(true);

      const state = colorWheels.getState();
      expect(state.lift.r).toBe(0.5);
    });

    it('WHEEL-050: canUndo returns false initially', () => {
      expect(colorWheels.canUndo()).toBe(false);
    });

    it('WHEEL-051: canRedo returns false initially', () => {
      expect(colorWheels.canRedo()).toBe(false);
    });

    it('WHEEL-052: redo restores undone change', () => {
      colorWheels.setState({
        lift: { r: 0.5, g: 0, b: 0, y: 0 },
      });
      colorWheels.reset(); // This saves state before reset

      colorWheels.undo();
      expect(colorWheels.getState().lift.r).toBe(0.5);

      colorWheels.redo();
      expect(colorWheels.getState().lift.r).toBe(0);
    });

    it('WHEEL-053: clearHistory removes undo/redo stacks', () => {
      colorWheels.setState({
        lift: { r: 0.5, g: 0, b: 0, y: 0 },
      });
      colorWheels.reset();

      expect(colorWheels.canUndo()).toBe(true);

      colorWheels.clearHistory();

      expect(colorWheels.canUndo()).toBe(false);
      expect(colorWheels.canRedo()).toBe(false);
    });

    it('WHEEL-054: undoRedoChanged event emits on history change', () => {
      const handler = vi.fn();
      colorWheels.on('undoRedoChanged', handler);

      colorWheels.reset(); // Saves state to undo stack

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ canUndo: true, canRedo: false })
      );
    });
  });

  describe('apply color grading to ImageData', () => {
    it('WHEEL-005: changes reflect in real-time on ImageData (FEATURES.md WHEEL-005)', () => {
      // Set up a lift adjustment
      colorWheels.setState({
        lift: { r: 0.3, g: 0, b: 0, y: 0 }, // Add red to shadows
      });

      // Create a dark image (shadows)
      const imageData = createTestImageData(2, 2, { r: 30, g: 30, b: 30, a: 255 });

      // Apply the color wheels
      colorWheels.apply(imageData);

      // Dark pixels should have more red due to lift adjustment
      // The exact value depends on the implementation, but red should increase
      expect(imageData.data[0]).toBeGreaterThan(30);
    });

    it('WHEEL-060: apply does nothing when no adjustments', () => {
      const imageData = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });
      const originalR = imageData.data[0];

      colorWheels.apply(imageData);

      expect(imageData.data[0]).toBe(originalR);
    });

    it('WHEEL-061: lift affects shadows (low luminance)', () => {
      colorWheels.setState({
        lift: { r: 0.3, g: 0, b: -0.3, y: 0 }, // Add red, reduce blue in shadows
      });

      // Dark pixel (shadow)
      const imageData = createTestImageData(1, 1, { r: 30, g: 30, b: 30, a: 255 });
      colorWheels.apply(imageData);

      expect(imageData.data[0]).toBeGreaterThan(30); // Red increased
      expect(imageData.data[2]).toBeLessThan(30);    // Blue decreased
    });

    it('WHEEL-062: gain affects highlights (high luminance)', () => {
      colorWheels.setState({
        gain: { r: 0.3, g: 0, b: 0, y: 0 }, // Boost red in highlights
      });

      // Bright pixel (highlight)
      const imageData = createTestImageData(1, 1, { r: 220, g: 220, b: 220, a: 255 });
      colorWheels.apply(imageData);

      expect(imageData.data[0]).toBeGreaterThan(220); // Red increased
    });

    it('WHEEL-063: gamma affects midtones', () => {
      colorWheels.setState({
        gamma: { r: 0.3, g: 0, b: 0, y: 0 }, // Adjust red gamma in midtones
      });

      // Mid-tone pixel
      const imageData = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 255 });
      colorWheels.apply(imageData);

      // Gamma adjustment should change the value
      expect(imageData.data[0]).not.toBe(128);
    });

    it('WHEEL-064: master affects all tones', () => {
      colorWheels.setState({
        master: { r: 0, g: 0, b: 0, y: 0.2 }, // Increase overall luminance
      });

      const imageData = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 255 });
      colorWheels.apply(imageData);

      // All channels should be brighter
      expect(imageData.data[0]).toBeGreaterThan(128);
      expect(imageData.data[1]).toBeGreaterThan(128);
      expect(imageData.data[2]).toBeGreaterThan(128);
    });

    it('WHEEL-065: values are clamped to 0-255', () => {
      colorWheels.setState({
        master: { r: 1, g: 1, b: 1, y: 1 }, // Maximum boost
      });

      const imageData = createTestImageData(1, 1, { r: 250, g: 250, b: 250, a: 255 });
      colorWheels.apply(imageData);

      // Should not exceed 255
      expect(imageData.data[0]).toBeLessThanOrEqual(255);
      expect(imageData.data[1]).toBeLessThanOrEqual(255);
      expect(imageData.data[2]).toBeLessThanOrEqual(255);
    });

    it('WHEEL-066: alpha channel is preserved', () => {
      colorWheels.setState({
        master: { r: 0.5, g: 0.5, b: 0.5, y: 0 },
      });

      const imageData = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 200 });
      colorWheels.apply(imageData);

      expect(imageData.data[3]).toBe(200); // Alpha unchanged
    });
  });

  describe('zone weight calculations', () => {
    it('WHEEL-070: lift weight is high for dark pixels', () => {
      colorWheels.setState({
        lift: { r: 0.5, g: 0, b: 0, y: 0 },
      });

      // Very dark pixel (luma ~0.1)
      const darkPixel = createTestImageData(1, 1, { r: 25, g: 25, b: 25, a: 255 });
      colorWheels.apply(darkPixel);
      const darkChange = darkPixel.data[0]! - 25;

      // Mid-tone pixel
      const midPixel = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 255 });
      colorWheels.apply(midPixel);
      const midChange = midPixel.data[0]! - 128;

      // Lift should affect dark pixels more than mid-tones
      expect(darkChange).toBeGreaterThan(midChange);
    });

    it('WHEEL-071: gain weight is high for bright pixels', () => {
      colorWheels.setState({
        gain: { r: 0.5, g: 0, b: 0, y: 0 },
      });

      // Very bright pixel
      const brightPixel = createTestImageData(1, 1, { r: 230, g: 230, b: 230, a: 255 });
      colorWheels.apply(brightPixel);
      const brightChange = brightPixel.data[0]! - 230;

      // Mid-tone pixel
      const midPixel = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 255 });
      colorWheels.apply(midPixel);
      const midChange = midPixel.data[0]! - 128;

      // Gain should affect bright pixels more
      expect(brightChange).toBeGreaterThan(midChange);
    });
  });

  describe('wheel state save/load (FEATURES.md WHEEL-008)', () => {
    it('WHEEL-008: wheel state can be saved and loaded', () => {
      const originalState: Partial<ColorWheelsState> = {
        lift: { r: 0.2, g: -0.1, b: 0.05, y: 0.3 },
        gamma: { r: 0.1, g: 0.15, b: -0.2, y: -0.1 },
        gain: { r: -0.05, g: 0.25, b: 0.1, y: 0.2 },
        master: { r: 0.1, g: 0.1, b: 0.1, y: 0.05 },
        linked: true,
      };

      colorWheels.setState(originalState);

      // Get the state (simulating save)
      const savedState = colorWheels.getState();

      // Create a new instance and restore state (simulating load)
      colorWheels.reset();
      colorWheels.setState(savedState);

      const loadedState = colorWheels.getState();
      expect(loadedState.lift).toEqual(originalState.lift);
      expect(loadedState.gamma).toEqual(originalState.gamma);
      expect(loadedState.gain).toEqual(originalState.gain);
      expect(loadedState.master).toEqual(originalState.master);
      expect(loadedState.linked).toBe(true);
    });
  });

  describe('events', () => {
    it('WHEEL-080: stateChanged emits on wheel change', () => {
      const handler = vi.fn();
      colorWheels.on('stateChanged', handler);

      colorWheels.setState({
        lift: { r: 0.5, g: 0, b: 0, y: 0 },
      });

      expect(handler).toHaveBeenCalled();
      const emittedState = handler.mock.calls[0]![0] as ColorWheelsState;
      expect(emittedState.lift.r).toBe(0.5);
    });

    it('WHEEL-081: wheelChanged emits with wheel key and values', () => {
      // This event would be emitted by UI interaction, test the event emission mechanism
      const handler = vi.fn();
      colorWheels.on('wheelChanged', handler);

      // The wheelChanged event is emitted during UI interactions, not setState
      // So we just verify the event system works
      colorWheels.emit('wheelChanged', { wheel: 'lift', values: { r: 0.5, g: 0, b: 0, y: 0 } });

      expect(handler).toHaveBeenCalledWith({ wheel: 'lift', values: { r: 0.5, g: 0, b: 0, y: 0 } });
    });
  });

  describe('dispose', () => {
    it('WHEEL-090: dispose cleans up resources', () => {
      colorWheels.show();
      colorWheels.dispose();

      // Container should be removed
      const container = parent.querySelector('[data-testid="color-wheels-container"]');
      expect(container).toBeNull();
    });
  });
});
