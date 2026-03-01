import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GotoFrameOverlay, type GotoFrameSession } from './GotoFrameOverlay';

function createMockSession(overrides: Partial<GotoFrameSession> = {}): GotoFrameSession {
  return {
    fps: 24,
    frameCount: 240,
    currentFrame: 50,
    isPlaying: false,
    inPoint: 1,
    outPoint: 240,
    goToFrame: vi.fn(),
    pause: vi.fn(),
    ...overrides,
  };
}

function createKeydownEvent(key: string, options: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
}

describe('GotoFrameOverlay', () => {
  let session: GotoFrameSession;
  let overlay: GotoFrameOverlay;

  beforeEach(() => {
    session = createMockSession();
    overlay = new GotoFrameOverlay(session);
    // Mount element so DOM methods work
    document.body.appendChild(overlay.getElement());
  });

  afterEach(() => {
    overlay.dispose();
    const el = overlay.getElement();
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });

  // =========================================================================
  // Show / Hide basics
  // =========================================================================
  describe('show/hide', () => {
    it('starts hidden', () => {
      expect(overlay.isVisible()).toBe(false);
      expect(overlay.getElement().style.display).toBe('none');
    });

    it('show() makes overlay visible', () => {
      overlay.show();
      expect(overlay.isVisible()).toBe(true);
      expect(overlay.getElement().style.display).toBe('flex');
    });

    it('hide() hides overlay', () => {
      overlay.show();
      overlay.hide();
      expect(overlay.isVisible()).toBe(false);
      expect(overlay.getElement().style.display).toBe('none');
    });

    it('show() is idempotent', () => {
      overlay.show();
      overlay.show(); // second call should not error
      expect(overlay.isVisible()).toBe(true);
    });

    it('hide() is idempotent', () => {
      overlay.hide();
      overlay.hide(); // should not error
      expect(overlay.isVisible()).toBe(false);
    });

    it('toggle() shows when hidden', () => {
      overlay.toggle();
      expect(overlay.isVisible()).toBe(true);
    });

    it('toggle() hides when visible', () => {
      overlay.show();
      overlay.toggle();
      expect(overlay.isVisible()).toBe(false);
    });
  });

  // =========================================================================
  // Pause playback on show
  // =========================================================================
  describe('pause playback', () => {
    it('pauses playback when playing on show', () => {
      session.isPlaying = true;
      overlay.show();
      expect(session.pause).toHaveBeenCalledTimes(1);
    });

    it('does not pause when already paused', () => {
      session.isPlaying = false;
      overlay.show();
      expect(session.pause).not.toHaveBeenCalled();
    });

    it('does NOT auto-resume playback after hide', () => {
      session.isPlaying = true;
      overlay.show();
      overlay.hide();
      // pause was called on show, nothing else
      expect(session.pause).toHaveBeenCalledTimes(1);
      // No play() method should have been called
    });
  });

  // =========================================================================
  // Input placeholder and hint
  // =========================================================================
  describe('input placeholder and hint', () => {
    it('sets placeholder to current frame on show', () => {
      session.currentFrame = 42;
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      expect(input.placeholder).toBe('42');
    });

    it('clears input value on show', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = 'test';
      overlay.hide();
      overlay.show();
      expect(input.value).toBe('');
    });

    it('shows range hint on show', () => {
      overlay.show();
      const hint = overlay.getElement().querySelector('[data-testid="goto-frame-hint"]');
      expect(hint?.textContent).toContain('Range: 1 - 240');
      expect(hint?.textContent).toContain('Press Enter to go');
    });

    it('shows in/out points when they differ from full range', () => {
      session.inPoint = 10;
      session.outPoint = 200;
      overlay.show();
      const hint = overlay.getElement().querySelector('[data-testid="goto-frame-hint"]');
      expect(hint?.textContent).toContain('In: 10');
      expect(hint?.textContent).toContain('Out: 200');
    });

    it('does not show in/out when they match full range', () => {
      overlay.show();
      const hint = overlay.getElement().querySelector('[data-testid="goto-frame-hint"]');
      expect(hint?.textContent).not.toContain('In:');
      expect(hint?.textContent).not.toContain('Out:');
    });
  });

  // =========================================================================
  // Enter key navigation
  // =========================================================================
  describe('Enter key navigation', () => {
    it('navigates to typed frame number on Enter', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '100';
      input.dispatchEvent(createKeydownEvent('Enter'));
      expect(session.goToFrame).toHaveBeenCalledWith(100);
      expect(overlay.isVisible()).toBe(false);
    });

    it('hides overlay after successful navigation', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '50';
      input.dispatchEvent(createKeydownEvent('Enter'));
      expect(overlay.isVisible()).toBe(false);
    });

    it('does not navigate on invalid input', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = 'abc';
      input.dispatchEvent(createKeydownEvent('Enter'));
      expect(session.goToFrame).not.toHaveBeenCalled();
      expect(overlay.isVisible()).toBe(true); // stays open
    });

    it('shows error on invalid input after Enter', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = 'abc';
      input.dispatchEvent(createKeydownEvent('Enter'));
      const error = overlay.getElement().querySelector('[data-testid="goto-frame-error"]') as HTMLElement;
      expect(error?.style.display).not.toBe('none');
      expect(error?.textContent).toBeTruthy();
    });

    it('does not navigate on out-of-range frame', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '999';
      input.dispatchEvent(createKeydownEvent('Enter'));
      expect(session.goToFrame).not.toHaveBeenCalled();
      expect(overlay.isVisible()).toBe(true);
    });

    it('hides on Enter with empty input', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '';
      input.dispatchEvent(createKeydownEvent('Enter'));
      expect(session.goToFrame).not.toHaveBeenCalled();
      expect(overlay.isVisible()).toBe(false);
    });

    it('navigates to timecode input on Enter', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '00:00:01:00';
      input.dispatchEvent(createKeydownEvent('Enter'));
      expect(session.goToFrame).toHaveBeenCalledWith(25); // 1 second at 24fps
      expect(overlay.isVisible()).toBe(false);
    });

    it('navigates to seconds input on Enter', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '1s';
      input.dispatchEvent(createKeydownEvent('Enter'));
      expect(session.goToFrame).toHaveBeenCalledWith(25); // floor(1 * 24) + 1
    });

    it('navigates with relative offset on Enter', () => {
      session.currentFrame = 50;
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '+10';
      input.dispatchEvent(createKeydownEvent('Enter'));
      expect(session.goToFrame).toHaveBeenCalledWith(60);
    });

    it('navigates with negative relative offset on Enter', () => {
      session.currentFrame = 50;
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '-10';
      input.dispatchEvent(createKeydownEvent('Enter'));
      expect(session.goToFrame).toHaveBeenCalledWith(40);
    });

    it('does not auto-resume playback after navigation', () => {
      session.isPlaying = true;
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '100';
      input.dispatchEvent(createKeydownEvent('Enter'));
      // pause called on show, nothing else to resume
      expect(session.pause).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Escape key dismissal
  // =========================================================================
  describe('Escape key dismissal', () => {
    it('Escape hides the overlay', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.dispatchEvent(createKeydownEvent('Escape'));
      expect(overlay.isVisible()).toBe(false);
    });

    it('Escape does not navigate', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '100';
      input.dispatchEvent(createKeydownEvent('Escape'));
      expect(session.goToFrame).not.toHaveBeenCalled();
    });

    it('Escape stopPropagation is called', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      const event = createKeydownEvent('Escape');
      const stopSpy = vi.spyOn(event, 'stopPropagation');
      input.dispatchEvent(event);
      expect(stopSpy).toHaveBeenCalled();
    });

    it('Escape preventDefault is called', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      const event = createKeydownEvent('Escape');
      const preventSpy = vi.spyOn(event, 'preventDefault');
      input.dispatchEvent(event);
      expect(preventSpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Click-outside dismissal
  // =========================================================================
  describe('click-outside dismissal', () => {
    it('mousedown outside overlay hides it', () => {
      overlay.show();
      // Simulate mousedown on document body
      const event = new MouseEvent('mousedown', { bubbles: true });
      document.body.dispatchEvent(event);
      expect(overlay.isVisible()).toBe(false);
    });

    it('mousedown inside overlay does not hide it', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      const event = new MouseEvent('mousedown', { bubbles: true });
      input.dispatchEvent(event);
      expect(overlay.isVisible()).toBe(true);
    });

    it('mousedown on container itself does not hide it', () => {
      overlay.show();
      const event = new MouseEvent('mousedown', { bubbles: true });
      overlay.getElement().dispatchEvent(event);
      expect(overlay.isVisible()).toBe(true);
    });

    it('click-outside listener is removed on hide', () => {
      overlay.show();
      overlay.hide();
      // Further mousedown should not cause errors
      const event = new MouseEvent('mousedown', { bubbles: true });
      document.body.dispatchEvent(event);
      // No error means success
    });
  });

  // =========================================================================
  // Input feedback (format detection)
  // =========================================================================
  describe('input feedback', () => {
    it('shows frame format hint when typing a number', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '100';
      input.dispatchEvent(new Event('input'));
      const hint = overlay.getElement().querySelector('[data-testid="goto-frame-hint"]');
      expect(hint?.textContent).toContain('Frame number');
      expect(hint?.textContent).toContain('100');
    });

    it('shows timecode format hint when typing timecode', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '00:00:01:00';
      input.dispatchEvent(new Event('input'));
      const hint = overlay.getElement().querySelector('[data-testid="goto-frame-hint"]');
      expect(hint?.textContent).toContain('SMPTE Timecode');
    });

    it('shows seconds format hint when typing seconds', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '1.5s';
      input.dispatchEvent(new Event('input'));
      const hint = overlay.getElement().querySelector('[data-testid="goto-frame-hint"]');
      expect(hint?.textContent).toContain('Seconds');
    });

    it('shows relative format hint when typing offset', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '+10';
      input.dispatchEvent(new Event('input'));
      const hint = overlay.getElement().querySelector('[data-testid="goto-frame-hint"]');
      expect(hint?.textContent).toContain('Relative');
    });

    it('shows error for out-of-range frame while typing', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '999';
      input.dispatchEvent(new Event('input'));
      const error = overlay.getElement().querySelector('[data-testid="goto-frame-error"]') as HTMLElement;
      expect(error?.style.display).not.toBe('none');
      expect(error?.textContent).toContain('outside range');
    });

    it('shows suggestion for decimal without s suffix', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '1.5';
      input.dispatchEvent(new Event('input'));
      const error = overlay.getElement().querySelector('[data-testid="goto-frame-error"]');
      expect(error?.textContent).toContain('Did you mean 1.5s');
    });

    it('shows hint for incomplete timecode', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '12:34:56';
      input.dispatchEvent(new Event('input'));
      const error = overlay.getElement().querySelector('[data-testid="goto-frame-error"]');
      expect(error?.textContent).toContain('HH:MM:SS:FF');
    });

    it('resets to range hint when input is cleared', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '100';
      input.dispatchEvent(new Event('input'));
      input.value = '';
      input.dispatchEvent(new Event('input'));
      const hint = overlay.getElement().querySelector('[data-testid="goto-frame-hint"]');
      expect(hint?.textContent).toContain('Range: 1 - 240');
    });
  });

  // =========================================================================
  // Focus management
  // =========================================================================
  describe('focus management', () => {
    it('focuses input on show', () => {
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      expect(document.activeElement).toBe(input);
    });

    it('saves previous active element on show', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);
      button.focus();
      expect(document.activeElement).toBe(button);

      overlay.show();
      expect(document.activeElement).not.toBe(button);

      overlay.hide();
      // Focus should be restored
      expect(document.activeElement).toBe(button);

      document.body.removeChild(button);
    });
  });

  // =========================================================================
  // DOM structure and accessibility
  // =========================================================================
  describe('DOM structure and accessibility', () => {
    it('has role="dialog"', () => {
      expect(overlay.getElement().getAttribute('role')).toBe('dialog');
    });

    it('has aria-label', () => {
      expect(overlay.getElement().getAttribute('aria-label')).toBe('Go to frame');
    });

    it('has data-testid on container', () => {
      expect(overlay.getElement().dataset.testid).toBe('goto-frame-overlay');
    });

    it('has input with data-testid', () => {
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]');
      expect(input).toBeTruthy();
    });

    it('has hint with data-testid', () => {
      const hint = overlay.getElement().querySelector('[data-testid="goto-frame-hint"]');
      expect(hint).toBeTruthy();
    });

    it('has error with data-testid', () => {
      const error = overlay.getElement().querySelector('[data-testid="goto-frame-error"]');
      expect(error).toBeTruthy();
    });

    it('input has aria-describedby pointing to hint and error', () => {
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toContain('goto-frame-hint-id');
      expect(describedBy).toContain('goto-frame-error-id');
    });

    it('hint has aria-live="polite"', () => {
      const hint = overlay.getElement().querySelector('[data-testid="goto-frame-hint"]');
      expect(hint?.getAttribute('aria-live')).toBe('polite');
    });

    it('error has aria-live="assertive"', () => {
      const error = overlay.getElement().querySelector('[data-testid="goto-frame-error"]');
      expect(error?.getAttribute('aria-live')).toBe('assertive');
    });

    it('has title element', () => {
      const title = overlay.getElement().querySelector('[data-testid="goto-frame-title"]');
      expect(title?.textContent).toBe('Go to frame');
    });
  });

  // =========================================================================
  // startFrame offset
  // =========================================================================
  describe('startFrame offset', () => {
    it('defaults to 0', () => {
      expect(overlay.getStartFrame()).toBe(0);
    });

    it('setStartFrame updates the offset', () => {
      overlay.setStartFrame(86400);
      expect(overlay.getStartFrame()).toBe(86400);
    });

    it('uses startFrame when parsing timecode', () => {
      overlay.setStartFrame(86400); // 1 hour at 24fps
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = '01:00:01:00';
      input.dispatchEvent(createKeydownEvent('Enter'));
      // At 24fps, "01:00:01:00" with startFrame 86400 → frame 25
      expect(session.goToFrame).toHaveBeenCalledWith(25);
    });
  });

  // =========================================================================
  // Error flash behavior
  // =========================================================================
  describe('error flash', () => {
    it('flashes error border on invalid submit', () => {
      vi.useFakeTimers();
      overlay.show();
      const input = overlay.getElement().querySelector('[data-testid="goto-frame-input"]') as HTMLInputElement;
      input.value = 'abc';
      input.dispatchEvent(createKeydownEvent('Enter'));
      expect(input.style.borderColor).toContain('error');
      vi.advanceTimersByTime(700);
      // Border should reset after timeout
      expect(input.style.borderColor).not.toContain('error');
      vi.useRealTimers();
    });
  });

  // =========================================================================
  // Dispose
  // =========================================================================
  describe('dispose', () => {
    it('hides overlay on dispose', () => {
      overlay.show();
      overlay.dispose();
      expect(overlay.isVisible()).toBe(false);
    });

    it('dispose is safe to call multiple times', () => {
      overlay.dispose();
      overlay.dispose(); // should not throw
    });
  });
});
