/**
 * CanvasOverlay Base Class Unit Tests
 *
 * Tests the abstract base class behavior directly via a concrete test subclass.
 * Based on test ID naming convention: COVL-NNN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CanvasOverlay } from './CanvasOverlay';

// Canvas mocks are provided by test/setup.ts

/** Minimal concrete subclass for testing the abstract base class */
class TestOverlay extends CanvasOverlay {
  public renderCallCount = 0;
  private visible = false;

  constructor(className = 'test-overlay', testId = 'test-overlay', zIndex = 10) {
    super(className, testId, zIndex);
  }

  render(): void {
    this.renderCallCount++;
  }

  isVisible(): boolean {
    return this.visible;
  }

  setVisible(v: boolean): void {
    this.visible = v;
  }

  // Expose protected members for testing
  getCanvasWidth(): number { return this.canvasWidth; }
  getCanvasHeight(): number { return this.canvasHeight; }
  getDisplayWidth(): number { return this.displayWidth; }
  getDisplayHeight(): number { return this.displayHeight; }
  getOffsetX(): number { return this.offsetX; }
  getOffsetY(): number { return this.offsetY; }
  getCtx(): CanvasRenderingContext2D { return this.ctx; }
}

/** Subclass that throws on render to test error handling */
class ThrowingOverlay extends CanvasOverlay {
  render(): void {
    throw new Error('render failed');
  }
  isVisible(): boolean {
    return true;
  }
}

describe('CanvasOverlay', () => {
  let overlay: TestOverlay;

  beforeEach(() => {
    overlay = new TestOverlay();
  });

  afterEach(() => {
    overlay.dispose();
  });

  // ---------------------------------------------------------------------------
  // Constructor / Initialization
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('COVL-001: creates canvas element with specified className', () => {
      const el = overlay.getElement();
      expect(el).toBeInstanceOf(HTMLCanvasElement);
      expect(el.className).toBe('test-overlay');
    });

    it('COVL-002: sets data-testid attribute', () => {
      const el = overlay.getElement();
      expect(el.dataset.testid).toBe('test-overlay');
    });

    it('COVL-003: canvas has absolute positioning', () => {
      const el = overlay.getElement();
      expect(el.style.position).toBe('absolute');
    });

    it('COVL-004: canvas has top: 0 and left: 0', () => {
      const el = overlay.getElement();
      // jsdom normalizes "0" to "0px" in CSSStyleDeclaration
      expect(el.style.top).toMatch(/^0(px)?$/);
      expect(el.style.left).toMatch(/^0(px)?$/);
    });

    it('COVL-005: canvas has pointer-events: none', () => {
      const el = overlay.getElement();
      expect(el.style.pointerEvents).toBe('none');
    });

    it('COVL-006: canvas has specified z-index', () => {
      const el = overlay.getElement();
      expect(el.style.zIndex).toBe('10');
    });

    it('COVL-007: different z-index values are applied correctly', () => {
      const highZ = new TestOverlay('hi', 'hi', 999);
      expect(highZ.getElement().style.zIndex).toBe('999');
      highZ.dispose();
    });

    it('COVL-008: initial dimension values are all zero', () => {
      expect(overlay.getCanvasWidth()).toBe(0);
      expect(overlay.getCanvasHeight()).toBe(0);
      expect(overlay.getDisplayWidth()).toBe(0);
      expect(overlay.getDisplayHeight()).toBe(0);
      expect(overlay.getOffsetX()).toBe(0);
      expect(overlay.getOffsetY()).toBe(0);
    });

    it('COVL-009: obtains a valid 2D rendering context', () => {
      expect(overlay.getCtx()).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // setViewerDimensions
  // ---------------------------------------------------------------------------
  describe('setViewerDimensions', () => {
    it('COVL-010: stores canvas dimensions correctly', () => {
      overlay.setViewerDimensions(800, 600, 10, 20, 780, 560);
      expect(overlay.getCanvasWidth()).toBe(800);
      expect(overlay.getCanvasHeight()).toBe(600);
    });

    it('COVL-011: stores display dimensions correctly', () => {
      overlay.setViewerDimensions(800, 600, 10, 20, 780, 560);
      expect(overlay.getDisplayWidth()).toBe(780);
      expect(overlay.getDisplayHeight()).toBe(560);
    });

    it('COVL-012: stores offset values correctly', () => {
      overlay.setViewerDimensions(800, 600, 10, 20, 780, 560);
      expect(overlay.getOffsetX()).toBe(10);
      expect(overlay.getOffsetY()).toBe(20);
    });

    it('COVL-013: triggers render when overlay is visible', () => {
      overlay.setVisible(true);
      overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      expect(overlay.renderCallCount).toBe(1);
    });

    it('COVL-014: does not trigger render when overlay is not visible', () => {
      overlay.setVisible(false);
      overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      expect(overlay.renderCallCount).toBe(0);
    });

    it('COVL-015: multiple setViewerDimensions calls update values', () => {
      overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
      overlay.setViewerDimensions(1920, 1080, 50, 50, 1820, 980);
      expect(overlay.getCanvasWidth()).toBe(1920);
      expect(overlay.getCanvasHeight()).toBe(1080);
      expect(overlay.getOffsetX()).toBe(50);
      expect(overlay.getOffsetY()).toBe(50);
    });

    it('COVL-016: handles zero dimensions without error', () => {
      expect(() => {
        overlay.setViewerDimensions(0, 0, 0, 0, 0, 0);
      }).not.toThrow();
    });

    it('COVL-017: render error is caught and logged', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const throwing = new ThrowingOverlay('err', 'err', 1);

      expect(() => {
        throwing.setViewerDimensions(800, 600, 0, 0, 800, 600);
      }).not.toThrow();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]![0]).toContain('render failed');
      errorSpy.mockRestore();
      throwing.dispose();
    });
  });

  // ---------------------------------------------------------------------------
  // getElement
  // ---------------------------------------------------------------------------
  describe('getElement', () => {
    it('COVL-020: returns HTMLCanvasElement', () => {
      expect(overlay.getElement()).toBeInstanceOf(HTMLCanvasElement);
    });

    it('COVL-021: returns same element on repeated calls', () => {
      const el1 = overlay.getElement();
      const el2 = overlay.getElement();
      expect(el1).toBe(el2);
    });
  });

  // ---------------------------------------------------------------------------
  // dispose
  // ---------------------------------------------------------------------------
  describe('dispose', () => {
    it('COVL-030: dispose does not throw', () => {
      expect(() => overlay.dispose()).not.toThrow();
    });

    it('COVL-031: dispose is idempotent', () => {
      overlay.dispose();
      expect(() => overlay.dispose()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // EventEmitter integration
  // ---------------------------------------------------------------------------
  describe('EventEmitter integration', () => {
    it('COVL-040: can subscribe to events and receive them', () => {
      const handler = vi.fn();
      overlay.on('testEvent', handler);
      overlay.emit('testEvent', { value: 42 });
      expect(handler).toHaveBeenCalledWith({ value: 42 });
    });

    it('COVL-041: can unsubscribe from events', () => {
      const handler = vi.fn();
      const unsub = overlay.on('testEvent', handler);
      unsub();
      overlay.emit('testEvent', { value: 42 });
      expect(handler).not.toHaveBeenCalled();
    });

    it('COVL-042: removeAllListeners clears all subscriptions', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      overlay.on('event1', handler1);
      overlay.on('event2', handler2);
      overlay.removeAllListeners();
      overlay.emit('event1', null);
      overlay.emit('event2', null);
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });
});
