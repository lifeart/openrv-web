/**
 * MissingFrameOverlay Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MissingFrameOverlay } from './MissingFrameOverlay';

describe('MissingFrameOverlay', () => {
  let overlay: MissingFrameOverlay;
  let container: HTMLDivElement;

  beforeEach(() => {
    overlay = new MissingFrameOverlay();
    container = document.createElement('div');
    container.appendChild(overlay.render());
    document.body.appendChild(container);
  });

  afterEach(() => {
    overlay.dispose();
    if (container.parentElement) {
      container.parentElement.removeChild(container);
    }
  });

  describe('initial state', () => {
    it('MFO-001: should be hidden by default', () => {
      expect(overlay.isVisible()).toBe(false);
    });

    it('MFO-002: should have no frame number by default', () => {
      expect(overlay.getFrameNumber()).toBeNull();
    });

    it('MFO-003: container should have display none initially', () => {
      const el = overlay.render();
      expect(el.style.display).toBe('none');
    });
  });

  describe('show', () => {
    it('MFO-010: should show overlay when show is called', () => {
      overlay.show(42);
      expect(overlay.isVisible()).toBe(true);
    });

    it('MFO-011: should set frame number when shown', () => {
      overlay.show(42);
      expect(overlay.getFrameNumber()).toBe(42);
    });

    it('MFO-012: should update display style to flex', () => {
      overlay.show(42);
      const el = overlay.render();
      expect(el.style.display).toBe('flex');
    });

    it('MFO-013: should update frame number text', () => {
      overlay.show(123);
      const frameNumberEl = overlay.render().querySelector('.frame-number');
      expect(frameNumberEl?.textContent).toBe('Frame 123');
    });

    it('MFO-014: should update frame number when shown multiple times', () => {
      overlay.show(1);
      expect(overlay.getFrameNumber()).toBe(1);
      overlay.show(100);
      expect(overlay.getFrameNumber()).toBe(100);
    });
  });

  describe('hide', () => {
    it('MFO-020: should hide overlay when hide is called', () => {
      overlay.show(42);
      overlay.hide();
      expect(overlay.isVisible()).toBe(false);
    });

    it('MFO-021: should clear frame number when hidden', () => {
      overlay.show(42);
      overlay.hide();
      expect(overlay.getFrameNumber()).toBeNull();
    });

    it('MFO-022: should update display style to none', () => {
      overlay.show(42);
      overlay.hide();
      const el = overlay.render();
      expect(el.style.display).toBe('none');
    });
  });

  describe('render', () => {
    it('MFO-030: should return the container element', () => {
      const el = overlay.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.classList.contains('missing-frame-overlay')).toBe(true);
    });

    it('MFO-031: should have correct data-testid', () => {
      const el = overlay.render();
      expect(el.dataset.testid).toBe('missing-frame-overlay');
    });

    it('MFO-032: should contain warning message', () => {
      const el = overlay.render();
      const message = el.querySelector('.message');
      expect(message?.textContent).toBe('MISSING FRAME');
    });
  });

  describe('dispose', () => {
    it('MFO-040: should remove element from DOM', () => {
      expect(container.children.length).toBe(1);
      overlay.dispose();
      expect(container.children.length).toBe(0);
    });

    it('MFO-041: should handle dispose when not in DOM', () => {
      overlay.dispose();
      // Should not throw when called again
      expect(() => overlay.dispose()).not.toThrow();
    });
  });
});
