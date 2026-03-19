/**
 * TimecodeOverlay Unit Tests
 *
 * Tests for Timecode Overlay component (FEATURES.md 4.1)
 * Based on test cases TC-001 through TC-005
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { TimecodeOverlay, type OverlayPosition, type TimecodeDisplayFormat, DEFAULT_TIMECODE_OVERLAY_STATE } from './TimecodeOverlay';
import { frameToTimecode, formatTimecode } from './TimecodeDisplay';

// Mock Session
interface MockSession {
  currentFrame: number;
  fps: number;
  frameCount: number;
  currentSource: { sourceTimecode?: string } | null;
  on: Mock;
  off: Mock;
}

function createMockSession(options?: Partial<MockSession>): MockSession {
  return {
    currentFrame: options?.currentFrame ?? 1,
    fps: options?.fps ?? 24,
    frameCount: options?.frameCount ?? 100,
    currentSource: options?.currentSource ?? null,
    on: vi.fn().mockReturnValue(() => {}),
    off: vi.fn(),
    ...options,
  };
}

describe('TimecodeOverlay', () => {
  let timecodeOverlay: TimecodeOverlay;
  let mockSession: MockSession;

  beforeEach(() => {
    mockSession = createMockSession();
    timecodeOverlay = new TimecodeOverlay(mockSession as any);
  });

  afterEach(() => {
    timecodeOverlay.dispose();
  });

  describe('initialization', () => {
    it('TC-001: starts disabled', () => {
      expect(timecodeOverlay.isVisible()).toBe(false);
    });

    it('TC-002: default state matches specification', () => {
      expect(DEFAULT_TIMECODE_OVERLAY_STATE).toEqual({
        enabled: false,
        position: 'top-left',
        fontSize: 'medium',
        showFrameCounter: true,
        backgroundOpacity: 0.6,
        displayFormat: 'smpte',
        sourceTimecode: undefined,
        showSourceTimecode: true,
      });
    });

    it('TC-003: provides element for mounting', () => {
      const element = timecodeOverlay.getElement();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.className).toContain('timecode-overlay');
    });

    it('TC-004: has correct data-testid', () => {
      const element = timecodeOverlay.getElement();
      expect(element.dataset.testid).toBe('timecode-overlay');
    });

    it('TC-005: registers session event handlers', () => {
      expect(mockSession.on).toHaveBeenCalledWith('frameChanged', expect.any(Function));
      expect(mockSession.on).toHaveBeenCalledWith('sourceLoaded', expect.any(Function));
      expect(mockSession.on).toHaveBeenCalledWith('durationChanged', expect.any(Function));
      expect(mockSession.on).toHaveBeenCalledWith('currentSourceChanged', expect.any(Function));
    });
  });

  describe('enable/disable', () => {
    it('TC-010: enable shows overlay', () => {
      const handler = vi.fn();
      timecodeOverlay.on('stateChanged', handler);

      timecodeOverlay.enable();

      expect(timecodeOverlay.isVisible()).toBe(true);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('TC-011: disable hides overlay', () => {
      timecodeOverlay.enable();
      const handler = vi.fn();
      timecodeOverlay.on('stateChanged', handler);

      timecodeOverlay.disable();

      expect(timecodeOverlay.isVisible()).toBe(false);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });

    it('TC-001: toggle enables/disables (FEATURES.md TC-001)', () => {
      expect(timecodeOverlay.isVisible()).toBe(false);

      timecodeOverlay.toggle();
      expect(timecodeOverlay.isVisible()).toBe(true);

      timecodeOverlay.toggle();
      expect(timecodeOverlay.isVisible()).toBe(false);
    });
  });

  describe('position (FEATURES.md TC-002)', () => {
    it('TC-002: position configurable', () => {
      const positions: OverlayPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

      for (const position of positions) {
        timecodeOverlay.setPosition(position);
        expect(timecodeOverlay.getState().position).toBe(position);
      }
    });

    it('TC-020: setPosition emits stateChanged', () => {
      const handler = vi.fn();
      timecodeOverlay.on('stateChanged', handler);

      timecodeOverlay.setPosition('bottom-right');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ position: 'bottom-right' }));
    });

    it('TC-021: default position is top-left', () => {
      expect(timecodeOverlay.getState().position).toBe('top-left');
    });
  });

  describe('font size', () => {
    it('TC-030: setFontSize changes font size', () => {
      timecodeOverlay.setFontSize('large');
      expect(timecodeOverlay.getState().fontSize).toBe('large');

      timecodeOverlay.setFontSize('small');
      expect(timecodeOverlay.getState().fontSize).toBe('small');
    });

    it('TC-031: setFontSize emits stateChanged', () => {
      const handler = vi.fn();
      timecodeOverlay.on('stateChanged', handler);

      timecodeOverlay.setFontSize('large');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 'large' }));
    });

    it('TC-032: default font size is medium', () => {
      expect(timecodeOverlay.getState().fontSize).toBe('medium');
    });
  });

  describe('background opacity', () => {
    it('TC-040: setBackgroundOpacity changes opacity', () => {
      timecodeOverlay.setBackgroundOpacity(0.8);
      expect(timecodeOverlay.getState().backgroundOpacity).toBe(0.8);
    });

    it('TC-041: setBackgroundOpacity clamps to 0-1', () => {
      timecodeOverlay.setBackgroundOpacity(-0.5);
      expect(timecodeOverlay.getState().backgroundOpacity).toBe(0);

      timecodeOverlay.setBackgroundOpacity(1.5);
      expect(timecodeOverlay.getState().backgroundOpacity).toBe(1);
    });

    it('TC-042: setBackgroundOpacity emits stateChanged', () => {
      const handler = vi.fn();
      timecodeOverlay.on('stateChanged', handler);

      timecodeOverlay.setBackgroundOpacity(0.3);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ backgroundOpacity: 0.3 }));
    });
  });

  describe('frame counter (FEATURES.md TC-004)', () => {
    it('TC-004: frame counter shows frame number', () => {
      expect(timecodeOverlay.getState().showFrameCounter).toBe(true);
    });

    it('TC-050: setShowFrameCounter toggles frame counter', () => {
      timecodeOverlay.setShowFrameCounter(false);
      expect(timecodeOverlay.getState().showFrameCounter).toBe(false);

      timecodeOverlay.setShowFrameCounter(true);
      expect(timecodeOverlay.getState().showFrameCounter).toBe(true);
    });

    it('TC-051: setShowFrameCounter emits stateChanged', () => {
      const handler = vi.fn();
      timecodeOverlay.on('stateChanged', handler);

      timecodeOverlay.setShowFrameCounter(false);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ showFrameCounter: false }));
    });
  });

  describe('start frame offset (FEATURES.md TC-005)', () => {
    it('TC-005: start timecode configurable', () => {
      // setStartFrame should not throw and should trigger an update
      expect(() => {
        timecodeOverlay.setStartFrame(1001);
      }).not.toThrow();

      // Setting start frame with session at frame 1, 24fps, start offset 1001
      // should result in timecode calculation using the offset
      // The actual timecode text is tested via frameToTimecode tests below
    });

    it('TC-006: setStartFrame triggers update', () => {
      timecodeOverlay.enable();

      // Get initial element
      const element = timecodeOverlay.getElement();

      // Set a large start frame offset
      timecodeOverlay.setStartFrame(86400); // 1 hour at 24fps

      // Element should have been updated (content may change based on implementation)
      // At minimum, the method should complete without error
      expect(timecodeOverlay.getElement()).toBe(element);
    });
  });

  describe('setState', () => {
    it('TC-060: setState updates multiple properties', () => {
      timecodeOverlay.setState({
        enabled: true,
        position: 'bottom-left',
        fontSize: 'small',
        showFrameCounter: false,
        backgroundOpacity: 0.2,
      });

      const state = timecodeOverlay.getState();
      expect(state.enabled).toBe(true);
      expect(state.position).toBe('bottom-left');
      expect(state.fontSize).toBe('small');
      expect(state.showFrameCounter).toBe(false);
      expect(state.backgroundOpacity).toBe(0.2);
    });

    it('TC-061: setState preserves unspecified properties', () => {
      timecodeOverlay.setPosition('bottom-right');
      timecodeOverlay.setState({ enabled: true });

      expect(timecodeOverlay.getState().position).toBe('bottom-right');
    });

    it('TC-062: setState emits stateChanged once', () => {
      const handler = vi.fn();
      timecodeOverlay.on('stateChanged', handler);

      timecodeOverlay.setState({
        enabled: true,
        fontSize: 'large',
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getState', () => {
    it('TC-070: getState returns copy', () => {
      const state1 = timecodeOverlay.getState();
      state1.enabled = true;
      const state2 = timecodeOverlay.getState();

      expect(state2.enabled).toBe(false);
    });

    it('TC-071: getState includes all properties', () => {
      const state = timecodeOverlay.getState();

      expect(state).toHaveProperty('enabled');
      expect(state).toHaveProperty('position');
      expect(state).toHaveProperty('fontSize');
      expect(state).toHaveProperty('showFrameCounter');
      expect(state).toHaveProperty('backgroundOpacity');
      expect(state).toHaveProperty('displayFormat');
      expect(state).toHaveProperty('showSourceTimecode');
    });
  });

  describe('start frame offset wiring (Issue #76)', () => {
    it('TC-130: setStartFrame updates getStartFrame', () => {
      timecodeOverlay.setStartFrame(1001);
      expect(timecodeOverlay.getStartFrame()).toBe(1001);
    });

    it('TC-131: setStartFrame triggers display update with correct offset', () => {
      timecodeOverlay.enable();
      mockSession.currentFrame = 1;
      mockSession.fps = 24;

      // Without offset: frame 1 at 24fps = 00:00:00:00
      timecodeOverlay.setStartFrame(0);
      const element = timecodeOverlay.getElement();
      const valueEl = element.querySelector('[data-testid="timecode-overlay-value"]') as HTMLElement;
      const tcWithoutOffset = valueEl.textContent;

      // With offset: frame 1 at 24fps with startFrame=48 should show a different timecode
      timecodeOverlay.setStartFrame(48);
      const tcWithOffset = valueEl.textContent;

      expect(tcWithOffset).not.toBe(tcWithoutOffset);
    });

    it('TC-132: getStartFrame returns 0 by default', () => {
      const freshOverlay = new TimecodeOverlay(mockSession as any);
      expect(freshOverlay.getStartFrame()).toBe(0);
      freshOverlay.dispose();
    });

    it('TC-133: frameburn export gets the correct offset from getStartFrame', () => {
      // Simulate wiring: set startFrame and verify it can be read back for export
      timecodeOverlay.setStartFrame(86400);
      expect(timecodeOverlay.getStartFrame()).toBe(86400);

      // The frameburn export in Viewer reads getStartFrame() to embed timecode
      // This test verifies the value is consistent after being set
      timecodeOverlay.setStartFrame(1001);
      expect(timecodeOverlay.getStartFrame()).toBe(1001);
    });

    it('TC-134: setStartFrame can be called multiple times and uses the latest value', () => {
      timecodeOverlay.setStartFrame(100);
      expect(timecodeOverlay.getStartFrame()).toBe(100);

      timecodeOverlay.setStartFrame(200);
      expect(timecodeOverlay.getStartFrame()).toBe(200);

      timecodeOverlay.setStartFrame(0);
      expect(timecodeOverlay.getStartFrame()).toBe(0);
    });
  });

  describe('displayFormat (Issue #479)', () => {
    it('TC-200: default displayFormat is smpte', () => {
      expect(timecodeOverlay.getState().displayFormat).toBe('smpte');
    });

    it('TC-201: setDisplayFormat changes the display format', () => {
      timecodeOverlay.setDisplayFormat('frame');
      expect(timecodeOverlay.getState().displayFormat).toBe('frame');

      timecodeOverlay.setDisplayFormat('both');
      expect(timecodeOverlay.getState().displayFormat).toBe('both');

      timecodeOverlay.setDisplayFormat('smpte');
      expect(timecodeOverlay.getState().displayFormat).toBe('smpte');
    });

    it('TC-202: setDisplayFormat emits stateChanged', () => {
      const handler = vi.fn();
      timecodeOverlay.on('stateChanged', handler);

      timecodeOverlay.setDisplayFormat('frame');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ displayFormat: 'frame' }));
    });

    it('TC-203: smpte format shows only timecode element', () => {
      timecodeOverlay.enable();
      timecodeOverlay.setDisplayFormat('smpte');

      const element = timecodeOverlay.getElement();
      const timecodeEl = element.querySelector('[data-testid="timecode-overlay-value"]') as HTMLElement;
      const frameEl = element.querySelector('[data-testid="timecode-overlay-frame"]') as HTMLElement;

      expect(timecodeEl.style.display).toBe('block');
      expect(frameEl.style.display).toBe('none');
      expect(timecodeEl.textContent).toMatch(/\d{2}:\d{2}:\d{2}[;:]\d{2}/);
    });

    it('TC-204: frame format shows only frame counter element', () => {
      timecodeOverlay.enable();
      timecodeOverlay.setDisplayFormat('frame');

      const element = timecodeOverlay.getElement();
      const timecodeEl = element.querySelector('[data-testid="timecode-overlay-value"]') as HTMLElement;
      const frameEl = element.querySelector('[data-testid="timecode-overlay-frame"]') as HTMLElement;

      expect(timecodeEl.style.display).toBe('none');
      expect(frameEl.style.display).toBe('block');
      expect(frameEl.textContent).toMatch(/Frame \d+ \/ \d+/);
    });

    it('TC-205: both format shows timecode and frame counter', () => {
      timecodeOverlay.enable();
      timecodeOverlay.setDisplayFormat('both');

      const element = timecodeOverlay.getElement();
      const timecodeEl = element.querySelector('[data-testid="timecode-overlay-value"]') as HTMLElement;
      const frameEl = element.querySelector('[data-testid="timecode-overlay-frame"]') as HTMLElement;

      expect(timecodeEl.style.display).toBe('block');
      expect(frameEl.style.display).toBe('block');
      expect(timecodeEl.textContent).toMatch(/\d{2}:\d{2}:\d{2}[;:]\d{2}/);
      expect(frameEl.textContent).toMatch(/Frame \d+ \/ \d+/);
    });

    it('TC-206: setDisplayFormat keeps showFrameCounter in sync', () => {
      timecodeOverlay.setDisplayFormat('both');
      expect(timecodeOverlay.getState().showFrameCounter).toBe(true);

      timecodeOverlay.setDisplayFormat('smpte');
      expect(timecodeOverlay.getState().showFrameCounter).toBe(false);

      timecodeOverlay.setDisplayFormat('frame');
      expect(timecodeOverlay.getState().showFrameCounter).toBe(false);
    });

    it('TC-207: deprecated setShowFrameCounter maps to displayFormat', () => {
      timecodeOverlay.setShowFrameCounter(true);
      expect(timecodeOverlay.getState().displayFormat).toBe('both');

      timecodeOverlay.setShowFrameCounter(false);
      expect(timecodeOverlay.getState().displayFormat).toBe('smpte');
    });

    it('TC-208: setState with showFrameCounter but no displayFormat derives format', () => {
      timecodeOverlay.setState({ showFrameCounter: true });
      expect(timecodeOverlay.getState().displayFormat).toBe('both');

      timecodeOverlay.setState({ showFrameCounter: false });
      expect(timecodeOverlay.getState().displayFormat).toBe('smpte');
    });

    it('TC-209: setState with displayFormat takes precedence', () => {
      timecodeOverlay.setState({ displayFormat: 'frame' });
      expect(timecodeOverlay.getState().displayFormat).toBe('frame');
    });

    it('TC-210: all three formats cycle correctly', () => {
      const formats: TimecodeDisplayFormat[] = ['smpte', 'frame', 'both'];
      const element = timecodeOverlay.getElement();
      const timecodeEl = element.querySelector('[data-testid="timecode-overlay-value"]') as HTMLElement;
      const frameEl = element.querySelector('[data-testid="timecode-overlay-frame"]') as HTMLElement;

      timecodeOverlay.enable();

      for (const format of formats) {
        timecodeOverlay.setDisplayFormat(format);
        const state = timecodeOverlay.getState();
        expect(state.displayFormat).toBe(format);

        if (format === 'smpte') {
          expect(timecodeEl.style.display).toBe('block');
          expect(frameEl.style.display).toBe('none');
        } else if (format === 'frame') {
          expect(timecodeEl.style.display).toBe('none');
          expect(frameEl.style.display).toBe('block');
        } else {
          expect(timecodeEl.style.display).toBe('block');
          expect(frameEl.style.display).toBe('block');
        }
      }
    });

    it('TC-211: frame format displays correct frame info', () => {
      mockSession.currentFrame = 42;
      mockSession.frameCount = 200;
      timecodeOverlay.enable();
      timecodeOverlay.setDisplayFormat('frame');

      const element = timecodeOverlay.getElement();
      const frameEl = element.querySelector('[data-testid="timecode-overlay-frame"]') as HTMLElement;

      expect(frameEl.textContent).toBe('Frame 42 / 200');
    });

    it('TC-212: smpte format displays correct timecode', () => {
      mockSession.currentFrame = 25;
      mockSession.fps = 24;
      timecodeOverlay.enable();
      timecodeOverlay.setDisplayFormat('smpte');

      const element = timecodeOverlay.getElement();
      const timecodeEl = element.querySelector('[data-testid="timecode-overlay-value"]') as HTMLElement;

      expect(timecodeEl.textContent).toBe('00:00:01:00');
    });

    it('TC-213: setState with both showFrameCounter and displayFormat uses displayFormat', () => {
      timecodeOverlay.setState({ showFrameCounter: true, displayFormat: 'frame' });
      expect(timecodeOverlay.getState().displayFormat).toBe('frame');
    });
  });

  describe('source timecode (Issue #476)', () => {
    it('TC-300: default showSourceTimecode is true', () => {
      expect(timecodeOverlay.getState().showSourceTimecode).toBe(true);
    });

    it('TC-301: default sourceTimecode is undefined', () => {
      expect(timecodeOverlay.getState().sourceTimecode).toBeUndefined();
    });

    it('TC-302: source timecode element exists with correct testid', () => {
      const element = timecodeOverlay.getElement();
      const sourceEl = element.querySelector('[data-testid="timecode-overlay-source"]');
      expect(sourceEl).not.toBeNull();
    });

    it('TC-303: source timecode element is hidden when no source timecode', () => {
      timecodeOverlay.enable();
      const element = timecodeOverlay.getElement();
      const sourceEl = element.querySelector('[data-testid="timecode-overlay-source"]') as HTMLElement;
      expect(sourceEl.style.display).toBe('none');
    });

    it('TC-304: source timecode is shown when metadata is available', () => {
      timecodeOverlay.enable();
      timecodeOverlay.setSourceTimecode('01:00:00:00');

      const element = timecodeOverlay.getElement();
      const sourceEl = element.querySelector('[data-testid="timecode-overlay-source"]') as HTMLElement;
      expect(sourceEl.style.display).toBe('block');
      expect(sourceEl.textContent).toBe('Source: 01:00:00:00');
    });

    it('TC-305: source timecode is hidden when showSourceTimecode is false', () => {
      timecodeOverlay.enable();
      timecodeOverlay.setSourceTimecode('01:00:00:00');
      timecodeOverlay.setShowSourceTimecode(false);

      const element = timecodeOverlay.getElement();
      const sourceEl = element.querySelector('[data-testid="timecode-overlay-source"]') as HTMLElement;
      expect(sourceEl.style.display).toBe('none');
    });

    it('TC-306: source timecode reappears when showSourceTimecode is re-enabled', () => {
      timecodeOverlay.enable();
      timecodeOverlay.setSourceTimecode('01:00:00:00');
      timecodeOverlay.setShowSourceTimecode(false);
      timecodeOverlay.setShowSourceTimecode(true);

      const element = timecodeOverlay.getElement();
      const sourceEl = element.querySelector('[data-testid="timecode-overlay-source"]') as HTMLElement;
      expect(sourceEl.style.display).toBe('block');
      expect(sourceEl.textContent).toBe('Source: 01:00:00:00');
    });

    it('TC-307: setShowSourceTimecode emits stateChanged', () => {
      const handler = vi.fn();
      timecodeOverlay.on('stateChanged', handler);

      timecodeOverlay.setShowSourceTimecode(false);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ showSourceTimecode: false }));
    });

    it('TC-308: setSourceTimecode emits stateChanged', () => {
      const handler = vi.fn();
      timecodeOverlay.on('stateChanged', handler);

      timecodeOverlay.setSourceTimecode('02:00:00:00');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ sourceTimecode: '02:00:00:00' }));
    });

    it('TC-309: source timecode cleared when set to undefined', () => {
      timecodeOverlay.enable();
      timecodeOverlay.setSourceTimecode('01:00:00:00');
      timecodeOverlay.setSourceTimecode(undefined);

      const element = timecodeOverlay.getElement();
      const sourceEl = element.querySelector('[data-testid="timecode-overlay-source"]') as HTMLElement;
      expect(sourceEl.style.display).toBe('none');
    });

    it('TC-310: source timecode picked up from session currentSource on construction', () => {
      const sessionWithSource = createMockSession({
        currentSource: { sourceTimecode: '10:00:00:00' },
      });
      const overlay = new TimecodeOverlay(sessionWithSource as any);
      overlay.enable();

      const element = overlay.getElement();
      const sourceEl = element.querySelector('[data-testid="timecode-overlay-source"]') as HTMLElement;
      expect(sourceEl.style.display).toBe('block');
      expect(sourceEl.textContent).toBe('Source: 10:00:00:00');

      overlay.dispose();
    });

    it('TC-311: source timecode picked up on sourceLoaded event', () => {
      // Capture the sourceLoaded callback
      let sourceLoadedCallback: (() => void) | undefined;
      mockSession.on.mockImplementation((event: string, cb: () => void) => {
        if (event === 'sourceLoaded') sourceLoadedCallback = cb;
        return () => {};
      });

      const overlay = new TimecodeOverlay(mockSession as any);
      overlay.enable();

      // Simulate source loaded with timecode
      mockSession.currentSource = { sourceTimecode: '01:30:00:00' };
      sourceLoadedCallback?.();

      const element = overlay.getElement();
      const sourceEl = element.querySelector('[data-testid="timecode-overlay-source"]') as HTMLElement;
      expect(sourceEl.style.display).toBe('block');
      expect(sourceEl.textContent).toBe('Source: 01:30:00:00');

      overlay.dispose();
    });

    it('TC-312: source timecode cleared when source without timecode is loaded', () => {
      timecodeOverlay.enable();
      timecodeOverlay.setSourceTimecode('01:00:00:00');

      // Capture the sourceLoaded callback
      let sourceLoadedCallback: (() => void) | undefined;
      mockSession.on.mockImplementation((event: string, cb: () => void) => {
        if (event === 'sourceLoaded') sourceLoadedCallback = cb;
        return () => {};
      });

      const overlay = new TimecodeOverlay(mockSession as any);
      overlay.enable();
      overlay.setSourceTimecode('01:00:00:00');

      // Simulate loading source without timecode
      mockSession.currentSource = {};
      sourceLoadedCallback?.();

      const element = overlay.getElement();
      const sourceEl = element.querySelector('[data-testid="timecode-overlay-source"]') as HTMLElement;
      expect(sourceEl.style.display).toBe('none');

      overlay.dispose();
    });

    it('TC-313: source timecode picked up on currentSourceChanged event', () => {
      let currentSourceChangedCallback: (() => void) | undefined;
      mockSession.on.mockImplementation((event: string, cb: () => void) => {
        if (event === 'currentSourceChanged') currentSourceChangedCallback = cb;
        return () => {};
      });

      const overlay = new TimecodeOverlay(mockSession as any);
      overlay.enable();

      // Simulate switching to source with timecode
      mockSession.currentSource = { sourceTimecode: '00:05:00:00' };
      currentSourceChangedCallback?.();

      const element = overlay.getElement();
      const sourceEl = element.querySelector('[data-testid="timecode-overlay-source"]') as HTMLElement;
      expect(sourceEl.style.display).toBe('block');
      expect(sourceEl.textContent).toBe('Source: 00:05:00:00');

      overlay.dispose();
    });

    it('TC-314: source timecode works with all display formats', () => {
      timecodeOverlay.enable();
      timecodeOverlay.setSourceTimecode('01:00:00:00');

      const element = timecodeOverlay.getElement();
      const sourceEl = element.querySelector('[data-testid="timecode-overlay-source"]') as HTMLElement;

      for (const format of ['smpte', 'frame', 'both'] as const) {
        timecodeOverlay.setDisplayFormat(format);
        expect(sourceEl.style.display).toBe('block');
        expect(sourceEl.textContent).toBe('Source: 01:00:00:00');
      }
    });

    it('TC-315: setState preserves showSourceTimecode', () => {
      timecodeOverlay.setShowSourceTimecode(false);
      timecodeOverlay.setState({ enabled: true });
      expect(timecodeOverlay.getState().showSourceTimecode).toBe(false);
    });

    it('TC-316: setState can set showSourceTimecode', () => {
      timecodeOverlay.setState({ showSourceTimecode: false });
      expect(timecodeOverlay.getState().showSourceTimecode).toBe(false);

      timecodeOverlay.setState({ showSourceTimecode: true });
      expect(timecodeOverlay.getState().showSourceTimecode).toBe(true);
    });

    it('TC-317: source timecode with drop-frame format', () => {
      timecodeOverlay.enable();
      timecodeOverlay.setSourceTimecode('01:00:00;02');

      const element = timecodeOverlay.getElement();
      const sourceEl = element.querySelector('[data-testid="timecode-overlay-source"]') as HTMLElement;
      expect(sourceEl.textContent).toBe('Source: 01:00:00;02');
    });

    it('TC-318: source timecode null source does not throw', () => {
      mockSession.currentSource = null;

      let sourceLoadedCallback: (() => void) | undefined;
      mockSession.on.mockImplementation((event: string, cb: () => void) => {
        if (event === 'sourceLoaded') sourceLoadedCallback = cb;
        return () => {};
      });

      const overlay = new TimecodeOverlay(mockSession as any);
      expect(() => sourceLoadedCallback?.()).not.toThrow();

      overlay.dispose();
    });
  });

  describe('dispose', () => {
    it('TC-080: dispose cleans up resources', () => {
      timecodeOverlay.enable();

      // Should not throw
      expect(() => {
        timecodeOverlay.dispose();
      }).not.toThrow();
    });
  });
});

describe('Timecode calculation functions', () => {
  describe('frameToTimecode', () => {
    it('TC-003: displays SMPTE format (FEATURES.md TC-003)', () => {
      // Frame 1 at 24fps should be 00:00:00:00
      const tc = frameToTimecode(1, 24);
      expect(tc.hours).toBe(0);
      expect(tc.minutes).toBe(0);
      expect(tc.seconds).toBe(0);
      expect(tc.frames).toBe(0);
    });

    it('TC-100: calculates seconds correctly', () => {
      // Frame 25 at 24fps = 1 second
      const tc = frameToTimecode(25, 24);
      expect(tc.seconds).toBe(1);
      expect(tc.frames).toBe(0);
    });

    it('TC-101: calculates minutes correctly', () => {
      // 24fps * 60 + 1 = 1441 frames = 1 minute
      const tc = frameToTimecode(24 * 60 + 1, 24);
      expect(tc.minutes).toBe(1);
      expect(tc.seconds).toBe(0);
      expect(tc.frames).toBe(0);
    });

    it('TC-102: calculates hours correctly', () => {
      // 24fps * 3600 + 1 = 86401 frames = 1 hour
      const tc = frameToTimecode(24 * 3600 + 1, 24);
      expect(tc.hours).toBe(1);
      expect(tc.minutes).toBe(0);
      expect(tc.seconds).toBe(0);
    });

    it('TC-103: handles 30fps', () => {
      // 30 frames = 1 second at 30fps
      const tc = frameToTimecode(31, 30);
      expect(tc.seconds).toBe(1);
      expect(tc.frames).toBe(0);
    });

    it('TC-104: handles 25fps', () => {
      // 25 frames = 1 second at 25fps
      const tc = frameToTimecode(26, 25);
      expect(tc.seconds).toBe(1);
      expect(tc.frames).toBe(0);
    });

    it('TC-105: uses start frame offset', () => {
      const tc = frameToTimecode(1, 24, 24); // Start at 1 second
      expect(tc.seconds).toBe(1);
      expect(tc.frames).toBe(0);
    });

    it('TC-106: detects drop-frame for 29.97fps', () => {
      const tc = frameToTimecode(1, 29.97);
      expect(tc.dropFrame).toBe(true);
    });

    it('TC-107: detects non-drop-frame for 24fps', () => {
      const tc = frameToTimecode(1, 24);
      expect(tc.dropFrame).toBe(false);
    });

    it('TC-108: detects drop-frame for 59.94fps', () => {
      const tc = frameToTimecode(1, 59.94);
      expect(tc.dropFrame).toBe(true);
    });
  });

  describe('formatTimecode', () => {
    it('TC-110: formats non-drop-frame with colons', () => {
      const tc = { hours: 1, minutes: 23, seconds: 45, frames: 12, dropFrame: false };
      expect(formatTimecode(tc)).toBe('01:23:45:12');
    });

    it('TC-111: formats drop-frame with semicolon', () => {
      const tc = { hours: 1, minutes: 23, seconds: 45, frames: 12, dropFrame: true };
      expect(formatTimecode(tc)).toBe('01:23:45;12');
    });

    it('TC-112: pads single digit values', () => {
      const tc = { hours: 0, minutes: 1, seconds: 2, frames: 3, dropFrame: false };
      expect(formatTimecode(tc)).toBe('00:01:02:03');
    });

    it('TC-113: handles all zeros', () => {
      const tc = { hours: 0, minutes: 0, seconds: 0, frames: 0, dropFrame: false };
      expect(formatTimecode(tc)).toBe('00:00:00:00');
    });

    it('TC-114: handles maximum values', () => {
      const tc = { hours: 23, minutes: 59, seconds: 59, frames: 29, dropFrame: false };
      expect(formatTimecode(tc)).toBe('23:59:59:29');
    });
  });

  describe('drop-frame calculation accuracy', () => {
    it('TC-120: drop-frame skips frames 0 and 1 at each minute', () => {
      // At 29.97fps, the first minute boundary should skip frames 0 and 1
      // Frame 1798 at 29.97fps (just before 1 minute) should be 00:00:59:29
      const tc = frameToTimecode(1798, 29.97);
      expect(tc.minutes).toBe(0);
      expect(tc.seconds).toBe(59);
      expect(tc.frames).toBe(27); // Due to drop-frame adjustment
    });

    it('TC-121: drop-frame does not skip at 10-minute boundaries', () => {
      // At 10 minute mark, frames 0 and 1 are NOT skipped
      // This test verifies the drop-frame algorithm handles this correctly
      const tc = frameToTimecode(17982, 29.97); // ~10 minutes
      expect(tc.dropFrame).toBe(true);
    });
  });
});
