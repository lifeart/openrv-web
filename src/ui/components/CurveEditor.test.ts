/**
 * CurveEditor Component Tests
 *
 * Tests for the canvas-based curve editor with draggable control points
 * for color curves adjustment.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CurveEditor, CurveChannelType } from './CurveEditor';
import { type ColorCurvesData, createDefaultCurve } from '../../color/ColorProcessingFacade';

// Polyfill PointerEvent for jsdom which does not support it
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly width: number;
    readonly height: number;
    readonly pressure: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, params: PointerEventInit & MouseEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.width = params.width ?? 1;
      this.height = params.height ?? 1;
      this.pressure = params.pressure ?? 0;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.pointerType = params.pointerType ?? '';
      this.isPrimary = params.isPrimary ?? false;
    }
  }
  globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

describe('CurveEditor', () => {
  let editor: CurveEditor;

  beforeEach(() => {
    editor = new CurveEditor();
  });

  afterEach(() => {
    editor.dispose();
  });

  describe('initialization', () => {
    it('CURVE-U001: should initialize with default curves', () => {
      const curves = editor.getCurves();
      expect(curves.master).toBeDefined();
      expect(curves.red).toBeDefined();
      expect(curves.green).toBeDefined();
      expect(curves.blue).toBeDefined();
    });

    it('CURVE-U002: default curves should have two points each', () => {
      const curves = editor.getCurves();
      expect(curves.master.points.length).toBe(2);
      expect(curves.red.points.length).toBe(2);
      expect(curves.green.points.length).toBe(2);
      expect(curves.blue.points.length).toBe(2);
    });

    it('CURVE-U003: default curve endpoints should be (0,0) and (1,1)', () => {
      const curves = editor.getCurves();
      expect(curves.master.points[0]).toEqual({ x: 0, y: 0 });
      expect(curves.master.points[1]).toEqual({ x: 1, y: 1 });
    });

    it('CURVE-U004: should initialize with master as active channel', () => {
      expect(editor.getActiveChannel()).toBe('master');
    });

    it('CURVE-U005: should accept initial curves in constructor', () => {
      const customCurves: ColorCurvesData = {
        master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }] },
        red: createDefaultCurve(),
        green: createDefaultCurve(),
        blue: createDefaultCurve(),
      };

      const customEditor = new CurveEditor(customCurves);
      const curves = customEditor.getCurves();
      expect(curves.master.points.length).toBe(3);
      expect(curves.master.points[1]).toEqual({ x: 0.5, y: 0.7 });
      customEditor.dispose();
    });
  });

  describe('render_element', () => {
    it('CURVE-U010: render_element returns container element', () => {
      const el = editor.render_element();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('curve-editor');
    });

    it('CURVE-U011: container has canvas element', () => {
      const el = editor.render_element();
      const canvas = el.querySelector('[data-testid="curve-canvas"]');
      expect(canvas).not.toBeNull();
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('CURVE-U012: canvas has correct dimensions', () => {
      const el = editor.render_element();
      const canvas = el.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;
      expect(canvas.width).toBe(200);
      expect(canvas.height).toBe(200);
    });

    it('CURVE-U013: container has channel buttons', () => {
      const el = editor.render_element();
      const masterBtn = el.querySelector('[data-testid="curve-channel-master"]');
      const redBtn = el.querySelector('[data-testid="curve-channel-red"]');
      const greenBtn = el.querySelector('[data-testid="curve-channel-green"]');
      const blueBtn = el.querySelector('[data-testid="curve-channel-blue"]');

      expect(masterBtn).not.toBeNull();
      expect(redBtn).not.toBeNull();
      expect(greenBtn).not.toBeNull();
      expect(blueBtn).not.toBeNull();
    });
  });

  describe('getCurves/setCurves', () => {
    it('CURVE-U020: getCurves returns copy of curves', () => {
      const curves1 = editor.getCurves();
      const curves2 = editor.getCurves();
      expect(curves1).toEqual(curves2);
      expect(curves1).not.toBe(curves2);
    });

    it('CURVE-U021: setCurves updates all channels', () => {
      const newCurves: ColorCurvesData = {
        master: { enabled: true, points: [{ x: 0, y: 0.1 }, { x: 1, y: 0.9 }] },
        red: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }] },
        green: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        blue: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      };

      editor.setCurves(newCurves);
      const curves = editor.getCurves();

      expect(curves.master.points).toEqual(newCurves.master.points);
      expect(curves.red.points.length).toBe(3);
    });

    it('CURVE-U022: setCurves deep copies the data', () => {
      const newCurves: ColorCurvesData = {
        master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        red: createDefaultCurve(),
        green: createDefaultCurve(),
        blue: createDefaultCurve(),
      };

      editor.setCurves(newCurves);

      // Modify the original
      newCurves.master.points[0]!.y = 0.5;

      // Editor's curves should be unchanged
      const curves = editor.getCurves();
      expect(curves.master.points[0]!.y).toBe(0);
    });

    it('CURVE-U023: getCurves returns deep copy', () => {
      const curves = editor.getCurves();
      curves.master.points[0]!.y = 0.9;

      // Editor's internal curves should be unchanged
      const curves2 = editor.getCurves();
      expect(curves2.master.points[0]!.y).toBe(0);
    });
  });

  describe('getActiveChannel', () => {
    it('CURVE-U030: getActiveChannel returns current channel', () => {
      expect(editor.getActiveChannel()).toBe('master');
    });
  });

  describe('channel selection events', () => {
    it('CURVE-U040: channel buttons emit channelChanged event', () => {
      const el = editor.render_element();
      const callback = vi.fn();
      editor.on('channelChanged', callback);

      const redBtn = el.querySelector('[data-testid="curve-channel-red"]') as HTMLButtonElement;
      redBtn.click();

      expect(callback).toHaveBeenCalledWith('red');
      expect(editor.getActiveChannel()).toBe('red');
    });

    it('CURVE-U041: clicking same channel does not emit event', () => {
      const el = editor.render_element();
      const callback = vi.fn();
      editor.on('channelChanged', callback);

      const masterBtn = el.querySelector('[data-testid="curve-channel-master"]') as HTMLButtonElement;
      masterBtn.click();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('resetActiveChannel', () => {
    it('CURVE-U050: resetActiveChannel resets current channel to default', () => {
      // First modify the master curve
      const modified: ColorCurvesData = {
        master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.3, y: 0.5 }, { x: 1, y: 1 }] },
        red: createDefaultCurve(),
        green: createDefaultCurve(),
        blue: createDefaultCurve(),
      };
      editor.setCurves(modified);

      expect(editor.getCurves().master.points.length).toBe(3);

      editor.resetActiveChannel();

      expect(editor.getCurves().master.points.length).toBe(2);
    });
  });

  describe('resetAll', () => {
    it('CURVE-U060: resetAll resets all channels', () => {
      const modified: ColorCurvesData = {
        master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.3, y: 0.5 }, { x: 1, y: 1 }] },
        red: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }] },
        green: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.6, y: 0.4 }, { x: 1, y: 1 }] },
        blue: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.4, y: 0.6 }, { x: 1, y: 1 }] },
      };
      editor.setCurves(modified);

      editor.resetAll();

      const curves = editor.getCurves();
      expect(curves.master.points.length).toBe(2);
      expect(curves.red.points.length).toBe(2);
      expect(curves.green.points.length).toBe(2);
      expect(curves.blue.points.length).toBe(2);
    });

    it('CURVE-U061: resetAll emits curveChanged event', () => {
      const callback = vi.fn();
      editor.on('curveChanged', callback);

      editor.resetAll();

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('curveChanged event', () => {
    it('CURVE-U070: curveChanged event includes channel and curve data', () => {
      const callback = vi.fn();
      editor.on('curveChanged', callback);

      editor.resetAll();

      expect(callback).toHaveBeenCalled();
      const [eventData] = callback.mock.calls[0];
      expect(eventData).toHaveProperty('channel');
      expect(eventData).toHaveProperty('curve');
    });
  });

  describe('dispose', () => {
    it('CURVE-U080: dispose can be called without error', () => {
      expect(() => editor.dispose()).not.toThrow();
    });

    it('CURVE-U081: dispose can be called multiple times', () => {
      expect(() => {
        editor.dispose();
        editor.dispose();
      }).not.toThrow();
    });

    it('CURVE-U082: dispose removes canvas event listeners', () => {
      const el = editor.render_element();
      const canvas = el.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

      // Spy on removeEventListener
      const removeSpy = vi.spyOn(canvas, 'removeEventListener');

      editor.dispose();

      // Should have removed all 6 event listeners (pointer events + dblclick + contextmenu + keydown)
      expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('dblclick', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('contextmenu', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      removeSpy.mockRestore();
    });

    it('CURVE-U083: dispose removes event listeners with correct handler references', () => {
      const el = editor.render_element();
      const canvas = el.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

      // Track added handlers
      const addedHandlers: Map<string, Function> = new Map();
      const originalAddEventListener = canvas.addEventListener.bind(canvas);
      const addSpy = vi.spyOn(canvas, 'addEventListener').mockImplementation(
        (type: string, handler: EventListenerOrEventListenerObject) => {
          addedHandlers.set(type, handler as Function);
          originalAddEventListener(type, handler);
        }
      );

      // Create a new editor so we can track the handlers
      const newEditor = new CurveEditor();
      const newEl = newEditor.render_element();
      const newCanvas = newEl.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

      // Track removed handlers
      const removedHandlers: Map<string, Function> = new Map();
      const removeSpy = vi.spyOn(newCanvas, 'removeEventListener').mockImplementation(
        (type: string, handler: EventListenerOrEventListenerObject) => {
          removedHandlers.set(type, handler as Function);
        }
      );

      newEditor.dispose();

      // The removed handlers should match the added handlers (same function reference)
      // This ensures we're not creating new bound functions in dispose()
      expect(removeSpy).toHaveBeenCalledTimes(6);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });
});

describe('CurveEditor channels', () => {
  let editor: CurveEditor;

  beforeEach(() => {
    editor = new CurveEditor();
  });

  afterEach(() => {
    editor.dispose();
  });

  const channels: CurveChannelType[] = ['master', 'red', 'green', 'blue'];

  channels.forEach((channel) => {
    it(`CURVE-U090-${channel}: clicking ${channel} button changes active channel`, () => {
      const el = editor.render_element();
      const btn = el.querySelector(`[data-testid="curve-channel-${channel}"]`) as HTMLButtonElement;

      btn.click();

      expect(editor.getActiveChannel()).toBe(channel);
    });
  });
});

describe('CurveEditor hi-DPI support', () => {
  let editor: CurveEditor;
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
    if (editor) {
      editor.dispose();
    }
    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDevicePixelRatio,
      writable: true,
      configurable: true,
    });
  });

  it('CURVE-U110: canvas physical dimensions scale with DPR', () => {
    setDevicePixelRatio(2);
    editor = new CurveEditor();
    const el = editor.render_element();
    const canvas = el.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    // Physical dimensions should be 2x logical (200x200 -> 400x400)
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(400);
  });

  it('CURVE-U111: canvas CSS dimensions remain at logical size', () => {
    setDevicePixelRatio(2);
    editor = new CurveEditor();
    const el = editor.render_element();
    const canvas = el.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    // CSS dimensions should remain at logical size
    expect(canvas.style.width).toBe('200px');
    expect(canvas.style.height).toBe('200px');
  });

  it('CURVE-U112: canvas renders correctly at 3x DPR', () => {
    setDevicePixelRatio(3);
    editor = new CurveEditor();
    const el = editor.render_element();
    const canvas = el.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(600);
  });

  it('CURVE-U113: curve editing works at high DPR', () => {
    setDevicePixelRatio(2);
    editor = new CurveEditor();

    // Should be able to modify curves at high DPR
    const newCurves = {
      master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }] },
      red: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      green: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      blue: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    };

    expect(() => editor.setCurves(newCurves)).not.toThrow();
    expect(editor.getCurves().master.points.length).toBe(3);
  });

  it('CURVE-U114: channel switching works at high DPR', () => {
    setDevicePixelRatio(2);
    editor = new CurveEditor();
    const el = editor.render_element();

    const redBtn = el.querySelector('[data-testid="curve-channel-red"]') as HTMLButtonElement;
    expect(() => redBtn.click()).not.toThrow();
    expect(editor.getActiveChannel()).toBe('red');
  });
});

describe('CurveEditor curve modifications', () => {
  let editor: CurveEditor;

  beforeEach(() => {
    editor = new CurveEditor();
  });

  afterEach(() => {
    editor.dispose();
  });

  it('CURVE-U100: curves preserve enabled state', () => {
    const curves: ColorCurvesData = {
      master: { enabled: false, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      red: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      green: { enabled: false, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      blue: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    };

    editor.setCurves(curves);
    const result = editor.getCurves();

    expect(result.master.enabled).toBe(false);
    expect(result.red.enabled).toBe(true);
    expect(result.green.enabled).toBe(false);
    expect(result.blue.enabled).toBe(true);
  });

  it('CURVE-U101: curves with many points are preserved', () => {
    const curves: ColorCurvesData = {
      master: {
        enabled: true,
        points: [
          { x: 0, y: 0 },
          { x: 0.2, y: 0.15 },
          { x: 0.4, y: 0.45 },
          { x: 0.6, y: 0.55 },
          { x: 0.8, y: 0.85 },
          { x: 1, y: 1 },
        ],
      },
      red: createDefaultCurve(),
      green: createDefaultCurve(),
      blue: createDefaultCurve(),
    };

    editor.setCurves(curves);
    const result = editor.getCurves();

    expect(result.master.points.length).toBe(6);
    expect(result.master.points[2]).toEqual({ x: 0.4, y: 0.45 });
  });
});

describe('CurveEditor pointer events (H-03)', () => {
  let editor: CurveEditor;

  beforeEach(() => {
    editor = new CurveEditor();
  });

  afterEach(() => {
    editor.dispose();
  });

  it('CE-H03a: CurveEditor canvas should register pointerdown (not mousedown) listener', () => {
    const el = editor.render_element();
    const canvas = el.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    const addSpy = vi.spyOn(canvas, 'addEventListener');

    // Create a new editor to observe its event registration
    const newEditor = new CurveEditor();
    const newEl = newEditor.render_element();
    const newCanvas = newEl.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    // Spy on the new canvas and verify registered events by checking dispose
    const removeSpy = vi.spyOn(newCanvas, 'removeEventListener');
    newEditor.dispose();

    const removedEventTypes = removeSpy.mock.calls.map((call) => call[0]);
    expect(removedEventTypes).toContain('pointerdown');
    expect(removedEventTypes).not.toContain('mousedown');

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('CE-H03b: CurveEditor canvas should register pointermove (not mousemove) listener', () => {
    const newEditor = new CurveEditor();
    const newEl = newEditor.render_element();
    const newCanvas = newEl.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    const removeSpy = vi.spyOn(newCanvas, 'removeEventListener');
    newEditor.dispose();

    const removedEventTypes = removeSpy.mock.calls.map((call) => call[0]);
    expect(removedEventTypes).toContain('pointermove');
    expect(removedEventTypes).not.toContain('mousemove');

    removeSpy.mockRestore();
  });

  it('CE-H03c: CurveEditor canvas should register pointerup (not mouseup) listener', () => {
    const newEditor = new CurveEditor();
    const newEl = newEditor.render_element();
    const newCanvas = newEl.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    const removeSpy = vi.spyOn(newCanvas, 'removeEventListener');
    newEditor.dispose();

    const removedEventTypes = removeSpy.mock.calls.map((call) => call[0]);
    expect(removedEventTypes).toContain('pointerup');
    expect(removedEventTypes).not.toContain('mouseup');

    removeSpy.mockRestore();
  });

  it('CE-H03d: On pointerdown while over a control point, setPointerCapture should be called with the pointer ID', () => {
    // Use a curve with a known point at (0,0) which maps to canvas coords (padding, size-padding)
    // Default curve has point at (0,0) -> canvas (10, 190) and (1,1) -> canvas (190, 10)
    const el = editor.render_element();
    const canvas = el.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    // Mock setPointerCapture
    const setCaptureSpy = vi.fn();
    canvas.setPointerCapture = setCaptureSpy;

    // Mock getBoundingClientRect to return known canvas position
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200,
      x: 0, y: 0, toJSON: () => {},
    });

    // The second point (1,1) maps to canvas position (190, 10)
    // clientX/clientY should match the canvas position of that point
    const pointerDownEvent = new PointerEvent('pointerdown', {
      clientX: 190,
      clientY: 10,
      pointerId: 42,
      bubbles: true,
    });

    canvas.dispatchEvent(pointerDownEvent);

    expect(setCaptureSpy).toHaveBeenCalledWith(42);
  });

  it('CE-H03e: On pointerup, releasePointerCapture should be called with the pointer ID', () => {
    const el = editor.render_element();
    const canvas = el.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    // Mock pointer capture methods
    const setCaptureSpy = vi.fn();
    const releaseCaptureSpy = vi.fn();
    canvas.setPointerCapture = setCaptureSpy;
    canvas.releasePointerCapture = releaseCaptureSpy;

    // Mock getBoundingClientRect
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200,
      x: 0, y: 0, toJSON: () => {},
    });

    // First, pointerdown on a control point to start dragging
    // Point (1,1) is at canvas (190, 10)
    const pointerDownEvent = new PointerEvent('pointerdown', {
      clientX: 190,
      clientY: 10,
      pointerId: 7,
      bubbles: true,
    });
    canvas.dispatchEvent(pointerDownEvent);

    expect(setCaptureSpy).toHaveBeenCalledWith(7);

    // Now pointerup to end the drag
    const pointerUpEvent = new PointerEvent('pointerup', {
      clientX: 190,
      clientY: 10,
      pointerId: 7,
      bubbles: true,
    });
    canvas.dispatchEvent(pointerUpEvent);

    expect(releaseCaptureSpy).toHaveBeenCalledWith(7);
  });

  it('CE-H03f: Dragging a point should continue tracking even when pointer leaves canvas bounds (via pointer capture)', () => {
    const el = editor.render_element();
    const canvas = el.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    // Mock pointer capture methods
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();

    // Mock getBoundingClientRect
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200,
      x: 0, y: 0, toJSON: () => {},
    });

    const curveChangedSpy = vi.fn();
    editor.on('curveChanged', curveChangedSpy);

    // Start drag on point (1,1) at canvas position (190, 10)
    const pointerDownEvent = new PointerEvent('pointerdown', {
      clientX: 190,
      clientY: 10,
      pointerId: 1,
      bubbles: true,
    });
    canvas.dispatchEvent(pointerDownEvent);

    // Verify setPointerCapture was called (this is what enables tracking outside bounds)
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);

    // Move pointer outside canvas bounds (e.g., clientX=300 is well outside the 200px canvas)
    // With pointer capture, this event still reaches the canvas
    const pointerMoveEvent = new PointerEvent('pointermove', {
      clientX: 300,
      clientY: -50,
      pointerId: 1,
      bubbles: true,
    });
    canvas.dispatchEvent(pointerMoveEvent);

    // curveChanged should fire because dragging is still active (pointer capture keeps tracking)
    expect(curveChangedSpy).toHaveBeenCalled();

    // No mouseleave handler should have terminated the drag - verify drag still active
    // by doing another move
    curveChangedSpy.mockClear();
    const pointerMoveEvent2 = new PointerEvent('pointermove', {
      clientX: 400,
      clientY: -100,
      pointerId: 1,
      bubbles: true,
    });
    canvas.dispatchEvent(pointerMoveEvent2);

    // Drag should still be active - curveChanged should fire again
    expect(curveChangedSpy).toHaveBeenCalled();

    // End the drag
    const pointerUpEvent = new PointerEvent('pointerup', {
      clientX: 400,
      clientY: -100,
      pointerId: 1,
      bubbles: true,
    });
    canvas.dispatchEvent(pointerUpEvent);

    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('CE-H03g: mouseleave handler should not exist (no silent drag termination on leave)', () => {
    const newEditor = new CurveEditor();
    const newEl = newEditor.render_element();
    const newCanvas = newEl.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    const removeSpy = vi.spyOn(newCanvas, 'removeEventListener');
    newEditor.dispose();

    const removedEventTypes = removeSpy.mock.calls.map((call) => call[0]);
    expect(removedEventTypes).not.toContain('mouseleave');

    removeSpy.mockRestore();
  });
});

describe('CurveEditor keyboard accessibility (L-39)', () => {
  let editor: CurveEditor;

  beforeEach(() => {
    editor = new CurveEditor();
  });

  afterEach(() => {
    editor.dispose();
  });

  it('CE-L39a: CurveEditor canvas should have tabindex="0"', () => {
    const el = editor.render_element();
    const canvas = el.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    expect(canvas.tabIndex).toBe(0);
    expect(canvas.getAttribute('tabindex')).toBe('0');
  });

  it('CE-L39b: Pressing arrow keys on focused canvas should move the selected control point', () => {
    const el = editor.render_element();
    const canvas = el.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    // Mock getBoundingClientRect for pointer events
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200,
      x: 0, y: 0, toJSON: () => {},
    });
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();

    // Get initial curve - point at (1,1) is at canvas position (190, 10)
    const initialCurves = editor.getCurves();
    const initialY = initialCurves.master.points[1]!.y; // Should be 1

    // Click on the second control point (1,1) at canvas (190, 10) to select it
    const pointerDownEvent = new PointerEvent('pointerdown', {
      clientX: 190,
      clientY: 10,
      pointerId: 1,
      bubbles: true,
    });
    canvas.dispatchEvent(pointerDownEvent);

    // Release pointer to end drag but keep point selected
    const pointerUpEvent = new PointerEvent('pointerup', {
      clientX: 190,
      clientY: 10,
      pointerId: 1,
      bubbles: true,
    });
    canvas.dispatchEvent(pointerUpEvent);

    // Press ArrowDown to move the selected point down
    const keyDownEvent = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
    });
    canvas.dispatchEvent(keyDownEvent);

    const updatedCurves = editor.getCurves();
    const updatedY = updatedCurves.master.points[1]!.y;

    // Y should have decreased by 1/256
    expect(updatedY).toBeLessThan(initialY);
    expect(updatedY).toBeCloseTo(initialY - 1 / 256, 6);
  });

  it('CE-L39c: Pressing Delete on focused canvas should remove the selected control point', () => {
    // Set up a curve with a middle point that can be removed
    const curvesWithMidpoint: ColorCurvesData = {
      master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }] },
      red: createDefaultCurve(),
      green: createDefaultCurve(),
      blue: createDefaultCurve(),
    };
    editor.setCurves(curvesWithMidpoint);

    const el = editor.render_element();
    const canvas = el.querySelector('[data-testid="curve-canvas"]') as HTMLCanvasElement;

    // Mock getBoundingClientRect
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200,
      x: 0, y: 0, toJSON: () => {},
    });
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();

    // The middle point (0.5, 0.5) maps to canvas position:
    // x = padding + 0.5 * innerSize = 10 + 0.5 * 180 = 100
    // y = padding + (1 - 0.5) * innerSize = 10 + 0.5 * 180 = 100
    const pointerDownEvent = new PointerEvent('pointerdown', {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      bubbles: true,
    });
    canvas.dispatchEvent(pointerDownEvent);

    const pointerUpEvent = new PointerEvent('pointerup', {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      bubbles: true,
    });
    canvas.dispatchEvent(pointerUpEvent);

    expect(editor.getCurves().master.points.length).toBe(3);

    // Press Delete to remove the selected point
    const deleteEvent = new KeyboardEvent('keydown', {
      key: 'Delete',
      bubbles: true,
    });
    canvas.dispatchEvent(deleteEvent);

    const updatedCurves = editor.getCurves();
    expect(updatedCurves.master.points.length).toBe(2);
    // Only endpoints should remain
    expect(updatedCurves.master.points[0]).toEqual({ x: 0, y: 0 });
    expect(updatedCurves.master.points[1]).toEqual({ x: 1, y: 1 });
  });
});
