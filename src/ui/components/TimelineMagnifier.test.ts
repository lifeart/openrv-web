/**
 * TimelineMagnifier Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimelineMagnifier, type MagnifierSession } from './TimelineMagnifier';
import { WaveformRenderer } from '../../audio/WaveformRenderer';
import { getThemeManager } from '../../utils/ui/ThemeManager';

// ---------------------------------------------------------------------------
// Polyfill PointerEvent for jsdom
// ---------------------------------------------------------------------------
if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, params: PointerEventInit & MouseEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? '';
    }
  };
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockSession(overrides: Partial<MagnifierSession> = {}): MagnifierSession {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

  return {
    currentFrame: 50,
    inPoint: 1,
    outPoint: 100,
    fps: 24,
    isPlaying: false,
    currentSource: { duration: 100 },
    marks: new Map(),
    goToFrame: vi.fn(),
    setInPoint: vi.fn(),
    setOutPoint: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event]!.push(handler);
      return () => {
        const idx = listeners[event]!.indexOf(handler);
        if (idx !== -1) listeners[event]!.splice(idx, 1);
      };
    }),
    // Expose for tests to emit events
    emit(event: string, ...args: unknown[]) {
      const handlers = listeners[event] || [];
      for (const h of handlers) h(...args);
    },
    ...overrides,
  } as MagnifierSession & { emit: (event: string, ...args: unknown[]) => void };
}

// rAF mock infrastructure
let rafCallbacks: FrameRequestCallback[];
let nextRafId: number;

function flushRaf() {
  const cbs = rafCallbacks.splice(0);
  cbs.forEach((cb) => cb(performance.now()));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TimelineMagnifier', () => {
  let session: MagnifierSession & { emit: (event: string, ...args: unknown[]) => void };
  let waveformRenderer: WaveformRenderer;
  let magnifier: TimelineMagnifier;

  beforeEach(() => {
    // Set up rAF mock
    rafCallbacks = [];
    nextRafId = 1;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = nextRafId++;
      rafCallbacks.push(cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    session = createMockSession() as any;
    waveformRenderer = new WaveformRenderer();
    magnifier = new TimelineMagnifier(session, waveformRenderer);
  });

  afterEach(() => {
    magnifier.dispose();
    vi.unstubAllGlobals();
  });

  // ── Rendering tests ──

  describe('rendering', () => {
    it('MAG-001: render returns an HTMLElement', () => {
      const el = magnifier.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('MAG-002: container has correct class and data-testid', () => {
      const el = magnifier.render();
      expect(el.className).toBe('timeline-magnifier-container');
      expect(el.dataset.testid).toBe('timeline-magnifier');
    });

    it('MAG-003: contains toolbar and canvas', () => {
      const el = magnifier.render();
      const toolbar = el.querySelector('[data-testid="magnifier-toolbar"]');
      const canvas = el.querySelector('[data-testid="magnifier-canvas"]');
      expect(toolbar).toBeInstanceOf(HTMLElement);
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('MAG-004: canvas draws without errors when visible', () => {
      const el = magnifier.render();
      document.body.appendChild(el);
      magnifier.show();
      flushRaf();
      // Should not throw
      magnifier.scheduleDraw();
      flushRaf();
      document.body.removeChild(el);
    });

    it('MAG-005: draw does not execute when not visible', () => {
      magnifier.render();
      const drawSpy = vi.spyOn(magnifier as any, 'draw');
      magnifier.scheduleDraw();
      flushRaf();
      expect(drawSpy).not.toHaveBeenCalled();
    });
  });

  // ── Visibility tests ──

  describe('visibility', () => {
    it('MAG-010: initially hidden', () => {
      expect(magnifier.isVisible).toBe(false);
      const el = magnifier.render();
      expect(el.style.display).toBe('none');
    });

    it('MAG-011: show() makes it visible', () => {
      const el = magnifier.render();
      magnifier.show();
      expect(magnifier.isVisible).toBe(true);
      expect(el.style.display).toBe('flex');
    });

    it('MAG-012: hide() makes it hidden', () => {
      const el = magnifier.render();
      magnifier.show();
      magnifier.hide();
      expect(magnifier.isVisible).toBe(false);
      expect(el.style.display).toBe('none');
    });

    it('MAG-013: toggle() switches visibility', () => {
      magnifier.render();
      expect(magnifier.isVisible).toBe(false);
      magnifier.toggle();
      expect(magnifier.isVisible).toBe(true);
      magnifier.toggle();
      expect(magnifier.isVisible).toBe(false);
    });

    it('MAG-014: show() is idempotent', () => {
      magnifier.render();
      magnifier.show();
      magnifier.show();
      expect(magnifier.isVisible).toBe(true);
    });

    it('MAG-015: hide() is idempotent', () => {
      magnifier.render();
      magnifier.hide();
      magnifier.hide();
      expect(magnifier.isVisible).toBe(false);
    });

    it('MAG-016: visibility callback is called on show/hide', () => {
      magnifier.render();
      const callback = vi.fn();
      magnifier.setVisibilityCallback(callback);

      magnifier.show();
      expect(callback).toHaveBeenCalledWith(true);

      magnifier.hide();
      expect(callback).toHaveBeenCalledWith(false);
    });
  });

  // ── Zoom tests ──

  describe('zoom', () => {
    it('MAG-020: wheel event adjusts visibleFrames', () => {
      const el = magnifier.render();
      document.body.appendChild(el);
      magnifier.show();
      flushRaf();

      const canvas = el.querySelector('[data-testid="magnifier-canvas"]') as HTMLCanvasElement;
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        width: 800,
        height: 100,
        top: 0,
        left: 0,
        bottom: 100,
        right: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect);

      // Force width so framing works
      (magnifier as any).width = 800;
      (magnifier as any).height = 100;

      const initialFrames = magnifier.visibleFrames;

      // Zoom in (negative deltaY)
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        clientX: 400,
        bubbles: true,
      });
      canvas.dispatchEvent(wheelEvent);

      expect(magnifier.visibleFrames).toBeLessThan(initialFrames);

      document.body.removeChild(el);
    });

    it('MAG-021: visibleFrames clamped to minimum 10', () => {
      magnifier.render();
      magnifier.show();
      flushRaf();

      (magnifier as any)._visibleFrames = 10;
      (magnifier as any).clampState();
      expect(magnifier.visibleFrames).toBe(10);
    });

    it('MAG-022: visibleFrames clamped to max duration', () => {
      magnifier.render();
      magnifier.show();
      flushRaf();

      (magnifier as any)._visibleFrames = 999;
      (magnifier as any).clampState();
      expect(magnifier.visibleFrames).toBeLessThanOrEqual(100);
    });

    it('MAG-023: zoom slider updates visibleFrames', () => {
      const el = magnifier.render();
      magnifier.show();
      flushRaf();

      const slider = el.querySelector('[data-testid="magnifier-zoom-slider"]') as HTMLInputElement;
      expect(slider).toBeTruthy();

      slider.value = '10';
      slider.dispatchEvent(new Event('input'));

      // After setting slider to low value, visibleFrames should be small
      expect(magnifier.visibleFrames).toBeLessThanOrEqual(20);
    });

    it('MAG-024: preventDefault is called on wheel events', () => {
      const el = magnifier.render();
      document.body.appendChild(el);
      magnifier.show();
      flushRaf();

      const canvas = el.querySelector('[data-testid="magnifier-canvas"]') as HTMLCanvasElement;
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        width: 800,
        height: 100,
        top: 0,
        left: 0,
        bottom: 100,
        right: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect);
      (magnifier as any).width = 800;
      (magnifier as any).height = 100;

      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        clientX: 400,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(wheelEvent, 'preventDefault');
      canvas.dispatchEvent(wheelEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();

      document.body.removeChild(el);
    });
  });

  // ── Pan tests ──

  describe('pan', () => {
    function setupForInteraction(mag: TimelineMagnifier) {
      const el = mag.render();
      document.body.appendChild(el);
      mag.show();
      flushRaf();

      const canvas = el.querySelector('[data-testid="magnifier-canvas"]') as HTMLCanvasElement;
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        width: 800,
        height: 100,
        top: 0,
        left: 0,
        bottom: 100,
        right: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect);
      (mag as any).width = 800;
      (mag as any).height = 100;

      // jsdom does not implement pointer capture
      canvas.setPointerCapture = vi.fn();
      canvas.releasePointerCapture = vi.fn();

      return { el, canvas };
    }

    it('MAG-030: drag beyond threshold pans centerFrame', () => {
      const { el, canvas } = setupForInteraction(magnifier);
      const initialCenter = magnifier.centerFrame;

      // Pointer down
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 400,
          clientY: 50,
          pointerId: 1,
          bubbles: true,
        }),
      );

      // Move beyond threshold (>5px)
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 420,
          clientY: 50,
          pointerId: 1,
          bubbles: true,
        }),
      );

      // Center should have shifted
      expect(magnifier.centerFrame).not.toBe(initialCenter);

      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX: 420,
          clientY: 50,
          pointerId: 1,
          bubbles: true,
        }),
      );

      document.body.removeChild(el);
    });

    it('MAG-031: drag disables followPlayhead', () => {
      const { el, canvas } = setupForInteraction(magnifier);
      expect(magnifier.followPlayhead).toBe(true);

      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 400,
          clientY: 50,
          pointerId: 1,
          bubbles: true,
        }),
      );

      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 420,
          clientY: 50,
          pointerId: 1,
          bubbles: true,
        }),
      );

      expect(magnifier.followPlayhead).toBe(false);

      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX: 420,
          clientY: 50,
          pointerId: 1,
          bubbles: true,
        }),
      );

      document.body.removeChild(el);
    });

    it('MAG-032: movement under 5px does not trigger pan (treats as click)', () => {
      const { el, canvas } = setupForInteraction(magnifier);

      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 400,
          clientY: 50,
          pointerId: 1,
          bubbles: true,
        }),
      );

      // Move only 3px (under threshold)
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: 403,
          clientY: 50,
          pointerId: 1,
          bubbles: true,
        }),
      );

      // followPlayhead should still be true (no pan started)
      expect(magnifier.followPlayhead).toBe(true);

      // Pointer up should trigger seek
      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX: 403,
          clientY: 50,
          pointerId: 1,
          bubbles: true,
        }),
      );

      expect(session.goToFrame).toHaveBeenCalled();

      document.body.removeChild(el);
    });
  });

  // ── Seek tests ──

  describe('seek', () => {
    it('MAG-040: click (pointerdown+pointerup without drag) seeks to frame', () => {
      const el = magnifier.render();
      document.body.appendChild(el);
      magnifier.show();
      flushRaf();

      const canvas = el.querySelector('[data-testid="magnifier-canvas"]') as HTMLCanvasElement;
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        width: 800,
        height: 100,
        top: 0,
        left: 0,
        bottom: 100,
        right: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect);
      (magnifier as any).width = 800;
      (magnifier as any).height = 100;
      canvas.setPointerCapture = vi.fn();
      canvas.releasePointerCapture = vi.fn();

      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 400,
          clientY: 50,
          pointerId: 1,
          bubbles: true,
        }),
      );
      canvas.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX: 400,
          clientY: 50,
          pointerId: 1,
          bubbles: true,
        }),
      );

      expect(session.goToFrame).toHaveBeenCalled();

      document.body.removeChild(el);
    });
  });

  // ── Nudge tests ──

  describe('nudge', () => {
    it('MAG-050: in-point nudge left decrements inPoint', () => {
      (session as any).inPoint = 10;
      (session as any).outPoint = 50;

      const el = magnifier.render();
      const inNudgeLeft = el.querySelector('[data-testid="magnifier-in-nudge-left"]') as HTMLButtonElement;
      inNudgeLeft.click();

      expect(session.setInPoint).toHaveBeenCalledWith(9);
    });

    it('MAG-051: in-point nudge right increments inPoint', () => {
      (session as any).inPoint = 10;
      (session as any).outPoint = 50;

      const el = magnifier.render();
      const inNudgeRight = el.querySelector('[data-testid="magnifier-in-nudge-right"]') as HTMLButtonElement;
      inNudgeRight.click();

      expect(session.setInPoint).toHaveBeenCalledWith(11);
    });

    it('MAG-052: in-point nudge left clamps to 1', () => {
      (session as any).inPoint = 1;
      (session as any).outPoint = 50;

      const el = magnifier.render();
      const inNudgeLeft = el.querySelector('[data-testid="magnifier-in-nudge-left"]') as HTMLButtonElement;
      inNudgeLeft.click();

      // Should not call setInPoint when already at boundary
      expect(session.setInPoint).not.toHaveBeenCalled();
    });

    it('MAG-053: in-point nudge right clamps to outPoint-1', () => {
      (session as any).inPoint = 49;
      (session as any).outPoint = 50;

      const el = magnifier.render();
      const inNudgeRight = el.querySelector('[data-testid="magnifier-in-nudge-right"]') as HTMLButtonElement;
      inNudgeRight.click();

      // inPoint 49 + 1 = 50 = outPoint, but we clamp to outPoint-1 = 49
      // so no change should happen
      expect(session.setInPoint).not.toHaveBeenCalled();
    });

    it('MAG-054: out-point nudge left decrements outPoint', () => {
      (session as any).inPoint = 10;
      (session as any).outPoint = 50;

      const el = magnifier.render();
      const outNudgeLeft = el.querySelector('[data-testid="magnifier-out-nudge-left"]') as HTMLButtonElement;
      outNudgeLeft.click();

      expect(session.setOutPoint).toHaveBeenCalledWith(49);
    });

    it('MAG-055: out-point nudge right increments outPoint', () => {
      (session as any).inPoint = 10;
      (session as any).outPoint = 50;

      const el = magnifier.render();
      const outNudgeRight = el.querySelector('[data-testid="magnifier-out-nudge-right"]') as HTMLButtonElement;
      outNudgeRight.click();

      expect(session.setOutPoint).toHaveBeenCalledWith(51);
    });

    it('MAG-056: out-point nudge right clamps to duration', () => {
      (session as any).inPoint = 10;
      (session as any).outPoint = 100;

      const el = magnifier.render();
      const outNudgeRight = el.querySelector('[data-testid="magnifier-out-nudge-right"]') as HTMLButtonElement;
      outNudgeRight.click();

      // outPoint 100 + 1 = 101 > duration 100, clamped to 100
      expect(session.setOutPoint).not.toHaveBeenCalled();
    });

    it('MAG-057: out-point nudge left clamps to inPoint+1', () => {
      (session as any).inPoint = 49;
      (session as any).outPoint = 50;

      const el = magnifier.render();
      const outNudgeLeft = el.querySelector('[data-testid="magnifier-out-nudge-left"]') as HTMLButtonElement;
      outNudgeLeft.click();

      // outPoint 50 - 1 = 49, but clamped to inPoint + 1 = 50, no change
      expect(session.setOutPoint).not.toHaveBeenCalled();
    });
  });

  // ── Follow playhead tests ──

  describe('follow playhead', () => {
    it('MAG-060: centerFrame tracks currentFrame when followPlayhead is true', () => {
      magnifier.render();
      magnifier.show();
      flushRaf();

      expect(magnifier.followPlayhead).toBe(true);

      // Simulate frame change
      (session as any).currentFrame = 75;
      session.emit('frameChanged', 75);

      expect(magnifier.centerFrame).toBe(75);
    });

    it('MAG-061: centerFrame does not track when followPlayhead is false', () => {
      magnifier.render();
      magnifier.show();
      flushRaf();

      // Manually disable follow
      (magnifier as any)._followPlayhead = false;

      const centerBefore = magnifier.centerFrame;
      (session as any).currentFrame = 75;
      session.emit('frameChanged', 75);

      expect(magnifier.centerFrame).toBe(centerBefore);
    });

    it('MAG-062: double-click re-enables followPlayhead', () => {
      const el = magnifier.render();
      document.body.appendChild(el);
      magnifier.show();
      flushRaf();

      const canvas = el.querySelector('[data-testid="magnifier-canvas"]') as HTMLCanvasElement;

      // Disable follow
      (magnifier as any)._followPlayhead = false;

      canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      expect(magnifier.followPlayhead).toBe(true);

      document.body.removeChild(el);
    });

    it('MAG-063: follow toggle button toggles followPlayhead', () => {
      const el = magnifier.render();
      const followBtn = el.querySelector('[data-testid="magnifier-follow-btn"]') as HTMLButtonElement;

      magnifier.show();
      flushRaf();

      expect(magnifier.followPlayhead).toBe(true);
      followBtn.click();
      expect(magnifier.followPlayhead).toBe(false);
      followBtn.click();
      expect(magnifier.followPlayhead).toBe(true);
    });
  });

  // ── Keyboard toggle test ──

  describe('keyboard toggle', () => {
    it('MAG-070: toggle() alternates visibility', () => {
      magnifier.render();
      expect(magnifier.isVisible).toBe(false);
      magnifier.toggle();
      expect(magnifier.isVisible).toBe(true);
      magnifier.toggle();
      expect(magnifier.isVisible).toBe(false);
    });
  });

  // ── Dispose tests ──

  describe('dispose', () => {
    it('MAG-080: dispose does not throw', () => {
      magnifier.render();
      expect(() => magnifier.dispose()).not.toThrow();
    });

    it('MAG-081: dispose cancels pending rAF', () => {
      const cancelSpy = vi.fn();
      vi.stubGlobal('cancelAnimationFrame', cancelSpy);

      magnifier.render();
      magnifier.show();
      flushRaf();

      magnifier.scheduleDraw();
      const rafId = (magnifier as any).scheduledRafId;

      magnifier.dispose();

      if (rafId !== 0) {
        expect(cancelSpy).toHaveBeenCalledWith(rafId);
      }
    });

    it('MAG-082: scheduleDraw is no-op after dispose', () => {
      magnifier.render();
      magnifier.show();
      flushRaf();
      magnifier.dispose();

      const drawSpy = vi.spyOn(magnifier as any, 'draw');
      magnifier.scheduleDraw();
      flushRaf();
      expect(drawSpy).not.toHaveBeenCalled();
    });

    it('MAG-083: session events do not trigger draw after dispose', () => {
      magnifier.render();
      magnifier.show();
      flushRaf();
      magnifier.dispose();

      const drawSpy = vi.spyOn(magnifier as any, 'draw');
      session.emit('frameChanged', 10);
      flushRaf();
      expect(drawSpy).not.toHaveBeenCalled();
    });
  });

  // ── Session event redraws ──

  describe('session events', () => {
    it('MAG-090: frameChanged triggers scheduleDraw', () => {
      magnifier.render();
      magnifier.show();
      flushRaf();

      const scheduleDrawSpy = vi.spyOn(magnifier as any, 'scheduleDraw');
      session.emit('frameChanged', 10);
      expect(scheduleDrawSpy).toHaveBeenCalled();
    });

    it('MAG-091: inOutChanged triggers scheduleDraw', () => {
      magnifier.render();
      magnifier.show();
      flushRaf();

      const scheduleDrawSpy = vi.spyOn(magnifier as any, 'scheduleDraw');
      session.emit('inOutChanged', {});
      expect(scheduleDrawSpy).toHaveBeenCalled();
    });

    it('MAG-092: marksChanged triggers scheduleDraw', () => {
      magnifier.render();
      magnifier.show();
      flushRaf();

      const scheduleDrawSpy = vi.spyOn(magnifier as any, 'scheduleDraw');
      session.emit('marksChanged', new Map());
      expect(scheduleDrawSpy).toHaveBeenCalled();
    });

    it('MAG-093: durationChanged resets and redraws', () => {
      magnifier.render();
      magnifier.show();
      flushRaf();

      const scheduleDrawSpy = vi.spyOn(magnifier as any, 'scheduleDraw');
      session.emit('durationChanged', 200);
      expect(scheduleDrawSpy).toHaveBeenCalled();
    });

    it('MAG-094: sourceLoaded resets state', () => {
      magnifier.render();
      magnifier.show();
      flushRaf();

      session.emit('sourceLoaded');
      expect(magnifier.followPlayhead).toBe(true);
    });
  });

  // ── Theme changes ──

  describe('theme changes', () => {
    it('MAG-100: themeChanged invalidates color cache and redraws', () => {
      magnifier.render();
      magnifier.show();
      flushRaf();

      const scheduleDrawSpy = vi.spyOn(magnifier as any, 'scheduleDraw');
      getThemeManager().emit('themeChanged', 'light');
      expect(scheduleDrawSpy).toHaveBeenCalled();
      expect((magnifier as any).cachedColors).toBeNull();
    });
  });

  // ── Close button ──

  describe('close button', () => {
    it('MAG-110: close button hides magnifier', () => {
      const el = magnifier.render();
      magnifier.show();
      expect(magnifier.isVisible).toBe(true);

      const closeBtn = el.querySelector('[data-testid="magnifier-close-btn"]') as HTMLButtonElement;
      closeBtn.click();
      expect(magnifier.isVisible).toBe(false);
    });
  });

  // ── Range label ──

  describe('range label', () => {
    it('MAG-120: range label shows frame range', () => {
      const el = magnifier.render();
      magnifier.show();
      flushRaf();

      // Force label update (draw() skips when canvas size is 0 in jsdom)
      (magnifier as any).updateRangeLabel();

      const label = el.querySelector('[data-testid="magnifier-range-label"]') as HTMLSpanElement;
      expect(label.textContent).toMatch(/Frames \d+-\d+ \/ \d+/);
    });
  });

  // ── rAF batching ──

  describe('rAF batching', () => {
    it('MAG-130: multiple scheduleDraw calls result in single draw', () => {
      magnifier.render();
      magnifier.show();
      flushRaf();

      const drawSpy = vi.spyOn(magnifier as any, 'draw');
      drawSpy.mockClear();

      magnifier.scheduleDraw();
      magnifier.scheduleDraw();
      magnifier.scheduleDraw();

      expect(drawSpy).not.toHaveBeenCalled();
      flushRaf();
      expect(drawSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ── Toolbar elements ──

  describe('toolbar', () => {
    it('MAG-140: toolbar contains zoom slider', () => {
      const el = magnifier.render();
      const slider = el.querySelector('[data-testid="magnifier-zoom-slider"]');
      expect(slider).toBeInstanceOf(HTMLInputElement);
      expect((slider as HTMLInputElement).type).toBe('range');
    });

    it('MAG-141: toolbar contains nudge buttons', () => {
      const el = magnifier.render();
      expect(el.querySelector('[data-testid="magnifier-in-nudge-left"]')).toBeInstanceOf(HTMLButtonElement);
      expect(el.querySelector('[data-testid="magnifier-in-nudge-right"]')).toBeInstanceOf(HTMLButtonElement);
      expect(el.querySelector('[data-testid="magnifier-out-nudge-left"]')).toBeInstanceOf(HTMLButtonElement);
      expect(el.querySelector('[data-testid="magnifier-out-nudge-right"]')).toBeInstanceOf(HTMLButtonElement);
    });

    it('MAG-142: toolbar contains follow button', () => {
      const el = magnifier.render();
      expect(el.querySelector('[data-testid="magnifier-follow-btn"]')).toBeInstanceOf(HTMLButtonElement);
    });

    it('MAG-143: toolbar contains close button', () => {
      const el = magnifier.render();
      expect(el.querySelector('[data-testid="magnifier-close-btn"]')).toBeInstanceOf(HTMLButtonElement);
    });
  });

  // ── Height delta ──

  describe('height delta', () => {
    it('MAG-150: heightDelta returns a positive value', () => {
      expect(magnifier.heightDelta).toBeGreaterThan(0);
    });
  });

  // ── Color caching ──

  describe('color caching', () => {
    it('MAG-160: getColors returns cached reference on second call', () => {
      const colors1 = (magnifier as any).getColors();
      const colors2 = (magnifier as any).getColors();
      expect(colors1).toBe(colors2);
    });

    it('MAG-161: themeChanged invalidates color cache', () => {
      const colors1 = (magnifier as any).getColors();
      getThemeManager().emit('themeChanged', 'dark');
      const colors2 = (magnifier as any).getColors();
      expect(colors2).not.toBe(colors1);
    });
  });

  // ── setPaintEngine ──

  describe('setPaintEngine', () => {
    it('MAG-170: accepts paint engine for late binding', () => {
      const pe = {
        on: vi.fn().mockReturnValue(() => {}),
        getAnnotatedFrames: vi.fn().mockReturnValue(new Set()),
      } as any;
      expect(() => magnifier.setPaintEngine(pe)).not.toThrow();
    });
  });

  // ── Zoom log-scale ──

  describe('zoom log-scale', () => {
    it('MAG-180: slider value 0 maps to MIN_VISIBLE_FRAMES', () => {
      const result = (magnifier as any).sliderToVisibleFrames(0);
      expect(result).toBe(10);
    });

    it('MAG-181: slider value 100 maps to duration', () => {
      const result = (magnifier as any).sliderToVisibleFrames(100);
      expect(result).toBe(100);
    });

    it('MAG-182: round-trip slider -> frames -> slider is stable', () => {
      for (const val of [0, 10, 25, 50, 75, 100]) {
        const frames = (magnifier as any).sliderToVisibleFrames(val);
        const backToSlider = (magnifier as any).visibleFramesToSlider(frames);
        expect(Math.abs(backToSlider - val)).toBeLessThanOrEqual(1);
      }
    });
  });

  // ── getElement ──

  describe('getElement', () => {
    it('MAG-190: getElement returns same element as render', () => {
      const renderEl = magnifier.render();
      const getEl = magnifier.getElement();
      expect(renderEl).toBe(getEl);
    });
  });
});
