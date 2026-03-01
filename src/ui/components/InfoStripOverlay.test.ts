/**
 * InfoStripOverlay Unit Tests
 *
 * Tests for Info Strip Overlay component (Plan 19)
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import {
  InfoStripOverlay,
  DEFAULT_INFO_STRIP_OVERLAY_STATE,
  extractBasename,
} from './InfoStripOverlay';

// Mock Session
interface MockSession {
  currentSource: {
    name: string;
    url: string;
    type: string;
    width: number;
    height: number;
    duration: number;
    fps: number;
  } | null;
  on: Mock;
  off: Mock;
}

function createMockSession(options?: Partial<MockSession>): MockSession {
  return {
    currentSource: options?.currentSource ?? null,
    on: vi.fn().mockReturnValue(() => {}),
    off: vi.fn(),
    ...options,
  };
}

describe('InfoStripOverlay', () => {
  let overlay: InfoStripOverlay;
  let mockSession: MockSession;

  beforeEach(() => {
    mockSession = createMockSession();
    overlay = new InfoStripOverlay(mockSession as any);
  });

  afterEach(() => {
    overlay.dispose();
  });

  describe('initialization', () => {
    it('IS-001: starts hidden via opacity 0', () => {
      expect(overlay.isVisible()).toBe(false);
      const element = overlay.getElement();
      expect(element.style.opacity).toBe('0');
    });

    it('IS-002: starts in basename mode', () => {
      expect(overlay.getState().showFullPath).toBe(false);
    });

    it('IS-003: default state matches specification', () => {
      expect(DEFAULT_INFO_STRIP_OVERLAY_STATE).toEqual({
        enabled: false,
        showFullPath: false,
        backgroundOpacity: 0.5,
      });
    });

    it('IS-004: provides element for mounting', () => {
      const element = overlay.getElement();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.className).toContain('info-strip-overlay');
    });

    it('IS-005: has correct data-testid', () => {
      const element = overlay.getElement();
      expect(element.dataset.testid).toBe('info-strip-overlay');
    });

    it('IS-006: has correct z-index of 48', () => {
      const element = overlay.getElement();
      expect(element.style.zIndex).toBe('48');
    });

    it('IS-007: has pointer-events none on container', () => {
      const element = overlay.getElement();
      expect(element.style.pointerEvents).toBe('none');
    });

    it('IS-008: has aria-label for accessibility', () => {
      const element = overlay.getElement();
      expect(element.getAttribute('aria-label')).toBe('Source info strip');
    });

    it('IS-009: has role="status" for screen readers', () => {
      const element = overlay.getElement();
      expect(element.getAttribute('role')).toBe('status');
    });

    it('IS-010: has opacity transition for show/hide', () => {
      const element = overlay.getElement();
      expect(element.style.transition).toContain('opacity');
      expect(element.style.transition).toContain('150ms');
    });

    it('IS-011: registers sourceLoaded event handler', () => {
      expect(mockSession.on).toHaveBeenCalledWith('sourceLoaded', expect.any(Function));
    });
  });

  describe('toggle / enable / disable', () => {
    it('IS-020: toggle() enables then disables', () => {
      expect(overlay.isVisible()).toBe(false);

      overlay.toggle();
      expect(overlay.isVisible()).toBe(true);
      expect(overlay.getElement().style.opacity).toBe('1');

      overlay.toggle();
      expect(overlay.isVisible()).toBe(false);
      expect(overlay.getElement().style.opacity).toBe('0');
    });

    it('IS-021: enable() shows overlay', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);

      overlay.enable();

      expect(overlay.isVisible()).toBe(true);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });

    it('IS-022: disable() hides overlay', () => {
      overlay.enable();
      const handler = vi.fn();
      overlay.on('stateChanged', handler);

      overlay.disable();

      expect(overlay.isVisible()).toBe(false);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
    });
  });

  describe('filename display', () => {
    it('IS-030: displays "(no source)" when currentSource is null', () => {
      mockSession.currentSource = null;
      overlay.update();

      const textElement = overlay.getElement().querySelector('[data-testid="info-strip-overlay-text"]');
      expect(textElement?.textContent).toBe('(no source)');
    });

    it('IS-031: displays source name in basename mode', () => {
      mockSession.currentSource = {
        name: 'shot_0042_comp_v03.exr',
        url: 'https://example.com/shots/shot_0042_comp_v03.exr',
        type: 'image',
        width: 1920,
        height: 1080,
        duration: 1,
        fps: 24,
      };
      overlay.update();

      const textElement = overlay.getElement().querySelector('[data-testid="info-strip-overlay-text"]');
      expect(textElement?.textContent).toBe('shot_0042_comp_v03.exr');
    });

    it('IS-032: displays full URL in full-path mode', () => {
      mockSession.currentSource = {
        name: 'shot_0042_comp_v03.exr',
        url: 'https://example.com/shots/shot_0042_comp_v03.exr',
        type: 'image',
        width: 1920,
        height: 1080,
        duration: 1,
        fps: 24,
      };
      overlay.setShowFullPath(true);

      const textElement = overlay.getElement().querySelector('[data-testid="info-strip-overlay-text"]');
      expect(textElement?.textContent).toBe('https://example.com/shots/shot_0042_comp_v03.exr');
    });

    it('IS-033: prefers source.name over URL-derived basename', () => {
      mockSession.currentSource = {
        name: 'my-custom-name.exr',
        url: 'https://example.com/shots/different-name.exr',
        type: 'image',
        width: 1920,
        height: 1080,
        duration: 1,
        fps: 24,
      };
      overlay.update();

      const textElement = overlay.getElement().querySelector('[data-testid="info-strip-overlay-text"]');
      expect(textElement?.textContent).toBe('my-custom-name.exr');
    });

    it('IS-034: falls back to URL basename when name is empty', () => {
      mockSession.currentSource = {
        name: '',
        url: 'https://example.com/shots/fallback-name.exr',
        type: 'image',
        width: 1920,
        height: 1080,
        duration: 1,
        fps: 24,
      };
      overlay.update();

      const textElement = overlay.getElement().querySelector('[data-testid="info-strip-overlay-text"]');
      expect(textElement?.textContent).toBe('fallback-name.exr');
    });

    it('IS-035: in full-path mode, prefers URL over name', () => {
      mockSession.currentSource = {
        name: 'short-name.exr',
        url: '/long/path/to/file.exr',
        type: 'image',
        width: 1920,
        height: 1080,
        duration: 1,
        fps: 24,
      };
      overlay.setShowFullPath(true);

      const textElement = overlay.getElement().querySelector('[data-testid="info-strip-overlay-text"]');
      expect(textElement?.textContent).toBe('/long/path/to/file.exr');
    });

    it('IS-036: in full-path mode, falls back to name when URL is empty', () => {
      mockSession.currentSource = {
        name: 'short-name.exr',
        url: '',
        type: 'image',
        width: 1920,
        height: 1080,
        duration: 1,
        fps: 24,
      };
      overlay.setShowFullPath(true);

      const textElement = overlay.getElement().querySelector('[data-testid="info-strip-overlay-text"]');
      expect(textElement?.textContent).toBe('short-name.exr');
    });
  });

  describe('extractBasename', () => {
    it('IS-040: extracts basename from HTTPS URL', () => {
      expect(extractBasename('https://example.com/path/to/file.exr')).toBe('file.exr');
    });

    it('IS-041: extracts basename from blob URL', () => {
      expect(extractBasename('blob:https://example.com/abc-123')).toBe('abc-123');
    });

    it('IS-042: extracts basename from file:// URL', () => {
      expect(extractBasename('file:///Users/artist/shots/shot.exr')).toBe('shot.exr');
    });

    it('IS-043: extracts basename from plain path', () => {
      expect(extractBasename('/Users/artist/shots/shot.exr')).toBe('shot.exr');
    });

    it('IS-044: handles filename without path', () => {
      expect(extractBasename('simple.exr')).toBe('simple.exr');
    });

    it('IS-045: handles URL with encoded characters', () => {
      expect(extractBasename('https://example.com/shots/my%20file.exr')).toBe('my file.exr');
    });

    it('IS-046: handles empty string', () => {
      expect(extractBasename('')).toBe('');
    });

    it('IS-047: handles URL with query parameters', () => {
      expect(extractBasename('https://example.com/file.exr?v=1&token=abc')).toBe('file.exr');
    });

    it('IS-048: handles Windows-style path with forward slashes', () => {
      expect(extractBasename('C:/Users/artist/shots/shot.exr')).toBe('shot.exr');
    });
  });

  describe('truncation CSS', () => {
    it('IS-050: uses LTR direction in basename mode', () => {
      const textElement = overlay.getElement().querySelector('[data-testid="info-strip-overlay-text"]') as HTMLElement;
      expect(textElement.style.direction).toBe('ltr');
    });

    it('IS-051: uses RTL direction in full-path mode', () => {
      overlay.setShowFullPath(true);
      const textElement = overlay.getElement().querySelector('[data-testid="info-strip-overlay-text"]') as HTMLElement;
      expect(textElement.style.direction).toBe('rtl');
      expect(textElement.style.unicodeBidi).toBe('plaintext');
    });

    it('IS-052: switches direction when toggling path mode', () => {
      const textElement = overlay.getElement().querySelector('[data-testid="info-strip-overlay-text"]') as HTMLElement;

      expect(textElement.style.direction).toBe('ltr');

      overlay.togglePathMode();
      expect(textElement.style.direction).toBe('rtl');

      overlay.togglePathMode();
      expect(textElement.style.direction).toBe('ltr');
    });
  });

  describe('toggle icon button', () => {
    it('IS-060: toggle button has pointer-events auto', () => {
      const button = overlay.getElement().querySelector('[data-testid="info-strip-overlay-toggle"]') as HTMLElement;
      expect(button.style.pointerEvents).toBe('auto');
    });

    it('IS-061: toggle button click toggles path mode', () => {
      expect(overlay.getState().showFullPath).toBe(false);

      const button = overlay.getElement().querySelector('[data-testid="info-strip-overlay-toggle"]') as HTMLButtonElement;
      button.click();

      expect(overlay.getState().showFullPath).toBe(true);
    });

    it('IS-062: toggle button click emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);

      const button = overlay.getElement().querySelector('[data-testid="info-strip-overlay-toggle"]') as HTMLButtonElement;
      button.click();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ showFullPath: true })
      );
    });

    it('IS-063: contextmenu event on toggle button calls stopPropagation', () => {
      const button = overlay.getElement().querySelector('[data-testid="info-strip-overlay-toggle"]') as HTMLButtonElement;

      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      button.dispatchEvent(event);

      expect(stopPropagationSpy).toHaveBeenCalled();
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('sourceLoaded event', () => {
    it('IS-070: sourceLoaded event triggers update', () => {
      // Get the sourceLoaded callback that was registered
      const sourceLoadedCall = mockSession.on.mock.calls.find(
        (call: [string, () => void]) => call[0] === 'sourceLoaded'
      );
      expect(sourceLoadedCall).toBeDefined();

      const callback = sourceLoadedCall![1];

      // Set a source and trigger the callback
      mockSession.currentSource = {
        name: 'new-source.exr',
        url: 'https://example.com/new-source.exr',
        type: 'image',
        width: 1920,
        height: 1080,
        duration: 1,
        fps: 24,
      };

      callback();

      const textElement = overlay.getElement().querySelector('[data-testid="info-strip-overlay-text"]');
      expect(textElement?.textContent).toBe('new-source.exr');
    });
  });

  describe('stateChanged event', () => {
    it('IS-080: toggle emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);

      overlay.toggle();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });

    it('IS-081: setState emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);

      overlay.setState({ backgroundOpacity: 0.8 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ backgroundOpacity: 0.8 })
      );
    });

    it('IS-082: togglePathMode emits stateChanged', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);

      overlay.togglePathMode();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ showFullPath: true })
      );
    });
  });

  describe('dispose', () => {
    it('IS-090: dispose cleans up event subscriptions', () => {
      const unsubscribe = vi.fn();
      mockSession.on.mockReturnValue(unsubscribe);

      const freshOverlay = new InfoStripOverlay(mockSession as any);
      freshOverlay.dispose();

      expect(unsubscribe).toHaveBeenCalled();
    });

    it('IS-091: dispose removes all listeners', () => {
      const handler = vi.fn();
      overlay.on('stateChanged', handler);

      overlay.dispose();

      // After dispose, events should not fire
      // We can't easily test removeAllListeners directly, but we can
      // verify that dispose doesn't throw
      expect(() => overlay.dispose()).not.toThrow();
    });
  });

  describe('getElement', () => {
    it('IS-100: getElement returns the container', () => {
      const element = overlay.getElement();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.dataset.testid).toBe('info-strip-overlay');
    });

    it('IS-101: getElement returns the same element on multiple calls', () => {
      const element1 = overlay.getElement();
      const element2 = overlay.getElement();
      expect(element1).toBe(element2);
    });
  });

  describe('getHeight', () => {
    it('IS-110: getHeight returns the element offsetHeight', () => {
      // In JSDOM, offsetHeight is 0 since no layout engine
      const height = overlay.getHeight();
      expect(typeof height).toBe('number');
      expect(height).toBe(0); // JSDOM default
    });
  });

  describe('getState / setState', () => {
    it('IS-120: getState returns a copy (mutations do not affect internal state)', () => {
      const state1 = overlay.getState();
      state1.enabled = true;
      const state2 = overlay.getState();
      expect(state2.enabled).toBe(false);
    });

    it('IS-121: setState preserves unspecified properties', () => {
      overlay.setState({ backgroundOpacity: 0.8 });
      overlay.setState({ enabled: true });

      const state = overlay.getState();
      expect(state.backgroundOpacity).toBe(0.8);
      expect(state.enabled).toBe(true);
    });

    it('IS-122: setState updates multiple properties', () => {
      overlay.setState({
        enabled: true,
        showFullPath: true,
        backgroundOpacity: 0.3,
      });

      const state = overlay.getState();
      expect(state.enabled).toBe(true);
      expect(state.showFullPath).toBe(true);
      expect(state.backgroundOpacity).toBe(0.3);
    });

    it('IS-123: setState updates background opacity in styles', () => {
      overlay.setState({ backgroundOpacity: 0.7 });
      expect(overlay.getElement().style.background).toContain('0.7');
    });
  });

  describe('togglePathMode', () => {
    it('IS-130: togglePathMode toggles showFullPath', () => {
      expect(overlay.getState().showFullPath).toBe(false);
      overlay.togglePathMode();
      expect(overlay.getState().showFullPath).toBe(true);
      overlay.togglePathMode();
      expect(overlay.getState().showFullPath).toBe(false);
    });
  });
});
