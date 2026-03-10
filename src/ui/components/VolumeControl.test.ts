/**
 * VolumeControl Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VolumeControl } from './VolumeControl';

describe('VolumeControl', () => {
  let volumeControl: VolumeControl;

  beforeEach(() => {
    volumeControl = new VolumeControl();
  });

  afterEach(() => {
    volumeControl.dispose();
    document.body.innerHTML = '';
  });

  describe('initialization', () => {
    it('VOL-001: initializes with default values', () => {
      expect(volumeControl.getVolume()).toBeCloseTo(0.7, 2);
      expect(volumeControl.isMuted()).toBe(false);
    });

    it('VOL-002: getState() returns current state', () => {
      const state = volumeControl.getState();
      expect(state.volume).toBeCloseTo(0.7, 2);
      expect(state.muted).toBe(false);
    });
  });

  describe('setVolume', () => {
    it('VOL-003: setVolume updates volume and emits events', () => {
      const volumeListener = vi.fn();
      const stateListener = vi.fn();
      volumeControl.on('volumeChanged', volumeListener);
      volumeControl.on('stateChanged', stateListener);

      volumeControl.setVolume(0.5);

      expect(volumeControl.getVolume()).toBe(0.5);
      expect(volumeListener).toHaveBeenCalledWith(0.5);
      expect(stateListener).toHaveBeenCalled();
    });

    it('VOL-004: setVolume clamps values to 0-1 range', () => {
      volumeControl.setVolume(1.5);
      expect(volumeControl.getVolume()).toBe(1);

      volumeControl.setVolume(-0.5);
      expect(volumeControl.getVolume()).toBe(0);
    });

    it('VOL-005: setVolume to 0 sets muted state', () => {
      volumeControl.setVolume(0);
      expect(volumeControl.isMuted()).toBe(true);
    });
  });

  describe('toggleMute', () => {
    it('VOL-006: toggleMute toggles muted state', () => {
      expect(volumeControl.isMuted()).toBe(false);

      volumeControl.toggleMute();
      expect(volumeControl.isMuted()).toBe(true);

      volumeControl.toggleMute();
      expect(volumeControl.isMuted()).toBe(false);
    });

    it('VOL-007: toggleMute emits mutedChanged event', () => {
      const listener = vi.fn();
      volumeControl.on('mutedChanged', listener);

      volumeControl.toggleMute();
      expect(listener).toHaveBeenCalledWith(true);

      volumeControl.toggleMute();
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('VOL-008: unmuting restores previous volume', () => {
      volumeControl.setVolume(0.5);
      volumeControl.toggleMute(); // mute
      expect(volumeControl.getVolume()).toBe(0);

      volumeControl.toggleMute(); // unmute
      expect(volumeControl.getVolume()).toBe(0.5);
    });
  });

  describe('syncVolume', () => {
    it('VOL-009: syncVolume updates internal volume without emitting events', () => {
      const volumeListener = vi.fn();
      const stateListener = vi.fn();
      volumeControl.on('volumeChanged', volumeListener);
      volumeControl.on('stateChanged', stateListener);

      volumeControl.syncVolume(0.3);

      expect(volumeControl.getState().volume).toBe(0.3);
      expect(volumeListener).not.toHaveBeenCalled();
      expect(stateListener).not.toHaveBeenCalled();
    });

    it('VOL-010: syncVolume clamps values to 0-1 range', () => {
      volumeControl.syncVolume(1.5);
      expect(volumeControl.getState().volume).toBe(1);

      volumeControl.syncVolume(-0.5);
      expect(volumeControl.getState().volume).toBe(0);
    });

    it('VOL-011: syncVolume with non-zero volume clears muted state', () => {
      volumeControl.toggleMute(); // Set muted
      expect(volumeControl.isMuted()).toBe(true);

      volumeControl.syncVolume(0.5);
      expect(volumeControl.isMuted()).toBe(false);
    });
  });

  describe('syncMuted', () => {
    it('VOL-012: syncMuted updates muted state without emitting events', () => {
      const mutedListener = vi.fn();
      const stateListener = vi.fn();
      volumeControl.on('mutedChanged', mutedListener);
      volumeControl.on('stateChanged', stateListener);

      volumeControl.syncMuted(true);

      expect(volumeControl.isMuted()).toBe(true);
      expect(mutedListener).not.toHaveBeenCalled();
      expect(stateListener).not.toHaveBeenCalled();
    });

    it('VOL-013: syncMuted can set muted to false', () => {
      volumeControl.syncMuted(true);
      expect(volumeControl.isMuted()).toBe(true);

      volumeControl.syncMuted(false);
      expect(volumeControl.isMuted()).toBe(false);
    });
  });

  describe('render', () => {
    it('VOL-014: render returns container element', () => {
      const element = volumeControl.render();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.className).toBe('volume-control-container');
    });
  });

  describe('slider visibility (H-06 mobile/touch/keyboard)', () => {
    it('VOL-H06a: clicking the mute button only toggles mute, does not expand slider', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const muteButton = element.querySelector('button')!;
      expect(volumeControl.isSliderExpanded()).toBe(false);

      // Click should only mute, not expand slider
      muteButton.click();
      expect(volumeControl.isSliderExpanded()).toBe(false);
    });

    it('VOL-H06b: hover expands slider, pointerleave collapses it', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const sliderContainer = element.querySelector('div')!;

      // Hover to expand
      element.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));
      expect(sliderContainer.style.width).toBe('160px');
      expect(volumeControl.isSliderExpanded()).toBe(true);

      // Pointer leave collapses
      element.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
      expect(sliderContainer.style.width).toMatch(/^0(px)?$/);
      expect(volumeControl.isSliderExpanded()).toBe(false);
    });

    it('VOL-H06c: the slider is focusable via keyboard when expanded by focus', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const muteButton = element.querySelector('button')!;
      const slider = element.querySelector('input[type="range"]') as HTMLInputElement;

      // Focus mute button to expand
      muteButton.focus();
      expect(volumeControl.isSliderExpanded()).toBe(true);

      // The slider container should have non-zero width, making the slider reachable
      const sliderContainer = slider.parentElement!;
      expect(sliderContainer.style.width).toBe('160px');

      // The slider should be focusable
      slider.focus();
      expect(document.activeElement).toBe(slider);
    });

    it('VOL-H06e: the mute button has aria-label attribute', () => {
      const element = volumeControl.render();
      const muteButton = element.querySelector('button')!;

      expect(muteButton.getAttribute('aria-label')).toBe('Toggle mute');
    });

    it('VOL-H06f: hover expand collapses on pointerleave', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const sliderContainer = element.querySelector('div')!;

      // Hover to expand
      element.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));
      expect(sliderContainer.style.width).toBe('160px');

      // Pointer leave should collapse
      element.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
      expect(sliderContainer.style.width).toMatch(/^0(px)?$/);
      expect(volumeControl.isSliderExpanded()).toBe(false);
    });

    it('VOL-H06g: focusout collapses slider when focus leaves control area', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const muteButton = element.querySelector('button')!;

      // Focus to expand
      muteButton.focus();
      expect(volumeControl.isSliderExpanded()).toBe(true);

      // Create an external element to receive focus
      const externalButton = document.createElement('button');
      document.body.appendChild(externalButton);

      // Dispatch focusout with relatedTarget outside the control
      element.dispatchEvent(
        new FocusEvent('focusout', {
          bubbles: true,
          relatedTarget: externalButton,
        }),
      );

      expect(volumeControl.isSliderExpanded()).toBe(false);
    });

    it('VOL-H06h: focusout does NOT collapse when focus moves within control', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const muteButton = element.querySelector('button')!;
      const slider = element.querySelector('input[type="range"]')!;

      // Focus to expand
      muteButton.focus();
      expect(volumeControl.isSliderExpanded()).toBe(true);

      // Dispatch focusout with relatedTarget inside the control (e.g., moving from button to slider)
      element.dispatchEvent(
        new FocusEvent('focusout', {
          bubbles: true,
          relatedTarget: slider,
        }),
      );

      // Should still be expanded
      expect(volumeControl.isSliderExpanded()).toBe(true);
    });
  });

  describe('popout width accommodates slider and scrub toggle (issue #43)', () => {
    it('VOL-043a: expanded popout width fits both the slider and scrub toggle', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      // Hover to expand
      element.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));

      const sliderContainer = element.querySelector('div')!;
      const expandedWidth = parseInt(sliderContainer.style.width, 10);

      // The slider is 80px + 16px margin = 96px, plus scrub checkbox (~16px) + label (~30px) + spacing
      // The expanded width must be at least 140px to fit everything
      expect(expandedWidth).toBeGreaterThanOrEqual(140);
    });

    it('VOL-043b: scrub toggle is present and clickable when popout is expanded', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      // Hover to expand
      element.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));

      const scrubCheckbox = element.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement;
      expect(scrubCheckbox).toBeInstanceOf(HTMLInputElement);
      expect(scrubCheckbox.disabled).toBe(false);

      // Toggle the checkbox
      const listener = vi.fn();
      volumeControl.on('audioScrubChanged', listener);
      scrubCheckbox.click();
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('VOL-043c: scrub label is visible inside the expanded popout', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const muteButton = element.querySelector('button')!;
      muteButton.click();

      const label = element.querySelector('label')!;
      expect(label).toBeInstanceOf(HTMLLabelElement);
      expect(label.textContent).toContain('Scrub');
      // Label should have white-space: nowrap to prevent text wrapping/clipping
      expect(label.style.whiteSpace).toBe('nowrap');
    });

    it('VOL-043d: hover expansion also uses the wider width', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const sliderContainer = element.querySelector('div')!;

      element.dispatchEvent(
        new MouseEvent('pointerenter', { bubbles: true }),
      );
      expect(sliderContainer.style.width).toBe('160px');
    });
  });

  describe('test IDs', () => {
    it('VOL-100: mute button has data-testid="mute-button"', () => {
      const el = volumeControl.render();
      const button = el.querySelector('[data-testid="mute-button"]');
      expect(button).toBeInstanceOf(HTMLButtonElement);
    });

    it('VOL-101: volume slider has data-testid="volume-slider"', () => {
      const el = volumeControl.render();
      const slider = el.querySelector('[data-testid="volume-slider"]');
      expect(slider).toBeInstanceOf(HTMLInputElement);
      expect((slider as HTMLInputElement).type).toBe('range');
    });

    it('VOL-102: container has data-testid="volume-control"', () => {
      const el = volumeControl.render();
      expect(el.dataset.testid).toBe('volume-control');
    });

    it('VOL-103: mute button tooltip references Shift+M shortcut', () => {
      const el = volumeControl.render();
      const muteBtn = el.querySelector('[data-testid="mute-button"]') as HTMLButtonElement;
      expect(muteBtn.title).toBe('Toggle mute (Shift+M in video mode)');
    });
  });
});
