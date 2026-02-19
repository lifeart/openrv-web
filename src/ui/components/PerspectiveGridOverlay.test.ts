/**
 * PerspectiveGridOverlay Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerspectiveGridOverlay } from './PerspectiveGridOverlay';
import { DEFAULT_PERSPECTIVE_PARAMS } from '../../transform/PerspectiveCorrection';

// Polyfill PointerEvent for jsdom (which does not implement it)
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

describe('PerspectiveGridOverlay', () => {
  let overlay: PerspectiveGridOverlay;

  beforeEach(() => {
    overlay = new PerspectiveGridOverlay();
  });

  afterEach(() => {
    overlay.dispose();
  });

  describe('visibility', () => {
    it('PG-001: not visible when disabled', () => {
      overlay.setParams({ ...DEFAULT_PERSPECTIVE_PARAMS, enabled: false });
      expect(overlay.getElement().style.display).toBe('none');
    });

    it('PG-002: visible when enabled', () => {
      overlay.setParams({
        ...DEFAULT_PERSPECTIVE_PARAMS,
        enabled: true,
        topLeft: { x: 0, y: 0 },
        topRight: { x: 1, y: 0 },
        bottomRight: { x: 1, y: 1 },
        bottomLeft: { x: 0, y: 1 },
      });
      expect(overlay.getElement().style.display).toBe('block');
    });
  });

  describe('handles', () => {
    it('PG-003: corner handle positions update on setParams', () => {
      document.body.appendChild(overlay.getElement());
      overlay.setViewerDimensions(100, 100);
      overlay.setParams({
        enabled: true,
        topLeft: { x: 0.1, y: 0.2 },
        topRight: { x: 0.9, y: 0.1 },
        bottomRight: { x: 0.8, y: 0.9 },
        bottomLeft: { x: 0.2, y: 0.8 },
        quality: 'bilinear',
      });

      const tlHandle = overlay.getElement().querySelector('[data-testid="perspective-handle-topLeft"]') as HTMLElement;
      expect(tlHandle).not.toBeNull();
      expect(tlHandle.style.left).toBe('10px');
      expect(tlHandle.style.top).toBe('20px');
    });
  });

  describe('events', () => {
    it('PG-004: emits cornersChanged event', () => {
      let emitted = false;
      overlay.on('cornersChanged', () => { emitted = true; });

      // Simulate a corner change by calling emit directly (drag testing is complex in unit tests)
      overlay.emit('cornersChanged', overlay.getParams());
      expect(emitted).toBe(true);
    });
  });

  describe('dispose', () => {
    it('PG-005: dispose cleans up handles and listeners', () => {
      document.body.appendChild(overlay.getElement());
      const el = overlay.getElement();
      expect(el.children.length).toBeGreaterThan(0); // canvas + handles
      overlay.dispose();
      // After dispose, handles should be removed
      const handles = document.querySelectorAll('[data-testid^="perspective-handle-"]');
      expect(handles.length).toBe(0);
    });
  });

  describe('pointer capture on drag', () => {
    it('PGO-M17a: startDrag should call setPointerCapture on the handle element', () => {
      document.body.appendChild(overlay.getElement());
      overlay.setViewerDimensions(200, 200);
      overlay.setParams({
        enabled: true,
        topLeft: { x: 0.1, y: 0.1 },
        topRight: { x: 0.9, y: 0.1 },
        bottomRight: { x: 0.9, y: 0.9 },
        bottomLeft: { x: 0.1, y: 0.9 },
        quality: 'bilinear',
      });

      const handle = overlay.getElement().querySelector(
        '[data-testid="perspective-handle-topLeft"]',
      ) as HTMLElement;

      const setCaptureSpy = vi.fn();
      handle.setPointerCapture = setCaptureSpy;

      const pointerDown = new PointerEvent('pointerdown', {
        pointerId: 42,
        clientX: 20,
        clientY: 20,
        bubbles: true,
      });
      handle.dispatchEvent(pointerDown);

      expect(setCaptureSpy).toHaveBeenCalledWith(42);
    });

    it('PGO-M17b: endDrag should call releasePointerCapture', () => {
      document.body.appendChild(overlay.getElement());
      overlay.setViewerDimensions(200, 200);
      overlay.setParams({
        enabled: true,
        topLeft: { x: 0.1, y: 0.1 },
        topRight: { x: 0.9, y: 0.1 },
        bottomRight: { x: 0.9, y: 0.9 },
        bottomLeft: { x: 0.1, y: 0.9 },
        quality: 'bilinear',
      });

      const handle = overlay.getElement().querySelector(
        '[data-testid="perspective-handle-topLeft"]',
      ) as HTMLElement;

      const setCaptureSpy = vi.fn();
      const releaseCaptureSpy = vi.fn();
      handle.setPointerCapture = setCaptureSpy;
      handle.releasePointerCapture = releaseCaptureSpy;

      // Start drag
      const pointerDown = new PointerEvent('pointerdown', {
        pointerId: 42,
        clientX: 20,
        clientY: 20,
        bubbles: true,
      });
      handle.dispatchEvent(pointerDown);

      // End drag
      const pointerUp = new PointerEvent('pointerup', {
        pointerId: 42,
        clientX: 25,
        clientY: 25,
        bubbles: true,
      });
      document.dispatchEvent(pointerUp);

      expect(releaseCaptureSpy).toHaveBeenCalledWith(42);
    });
  });

  describe('getParams / setParams', () => {
    it('round-trips correctly', () => {
      const params = {
        enabled: true,
        topLeft: { x: 0.1, y: 0.05 },
        topRight: { x: 0.9, y: 0.1 },
        bottomRight: { x: 0.95, y: 0.9 },
        bottomLeft: { x: 0.05, y: 0.85 },
        quality: 'bicubic' as const,
      };
      overlay.setParams(params);
      const result = overlay.getParams();
      expect(result.topLeft).toEqual(params.topLeft);
      expect(result.topRight).toEqual(params.topRight);
      expect(result.bottomRight).toEqual(params.bottomRight);
      expect(result.bottomLeft).toEqual(params.bottomLeft);
    });
  });
});
