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
    it('VOL-H06a: clicking the mute button toggles the slider expanded state', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const muteButton = element.querySelector('button')!;
      expect(volumeControl.isSliderExpanded()).toBe(false);

      // First click should expand
      muteButton.click();
      expect(volumeControl.isSliderExpanded()).toBe(true);

      // Second click should collapse
      muteButton.click();
      expect(volumeControl.isSliderExpanded()).toBe(false);
    });

    it('VOL-H06b: when expanded via click, slider remains visible on mouseleave', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const muteButton = element.querySelector('button')!;
      const sliderContainer = element.querySelector('div')!;

      // Click to expand
      muteButton.click();
      expect(volumeControl.isSliderExpanded()).toBe(true);
      expect(sliderContainer.style.width).toBe('96px');

      // Simulate mouseleave on the container
      element.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

      // Should still be expanded because it was pinned via click
      expect(volumeControl.isSliderExpanded()).toBe(true);
      expect(sliderContainer.style.width).toBe('96px');
    });

    it('VOL-H06c: the slider is focusable via keyboard when expanded', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const muteButton = element.querySelector('button')!;
      const slider = element.querySelector('input[type="range"]') as HTMLInputElement;

      // Click to expand
      muteButton.click();
      expect(volumeControl.isSliderExpanded()).toBe(true);

      // The slider container should have non-zero width, making the slider reachable
      const sliderContainer = slider.parentElement!;
      expect(sliderContainer.style.width).toBe('96px');

      // The slider should be focusable
      slider.focus();
      expect(document.activeElement).toBe(slider);
    });

    it('VOL-H06d: clicking outside the volume control area collapses the slider', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const muteButton = element.querySelector('button')!;

      // Click to expand
      muteButton.click();
      expect(volumeControl.isSliderExpanded()).toBe(true);

      // Click outside (on document body, not inside the control)
      const outsideElement = document.createElement('div');
      document.body.appendChild(outsideElement);
      outsideElement.click();

      expect(volumeControl.isSliderExpanded()).toBe(false);
      const sliderContainer = element.querySelector('div')!;
      expect(sliderContainer.style.width).toBe('0px');
    });

    it('VOL-H06e: the mute button has aria-label attribute', () => {
      const element = volumeControl.render();
      const muteButton = element.querySelector('button')!;

      expect(muteButton.getAttribute('aria-label')).toBe('Toggle mute');
    });

    it('VOL-H06f: hover-only expand still collapses on mouseleave when not pinned', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const sliderContainer = element.querySelector('div')!;

      // Hover to expand (without clicking)
      element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      expect(sliderContainer.style.width).toBe('96px');

      // Mouse leave should collapse since not pinned
      element.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      expect(sliderContainer.style.width).toBe('0px');
      expect(volumeControl.isSliderExpanded()).toBe(false);
    });

    it('VOL-H06g: focusout collapses slider when focus leaves control area', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const muteButton = element.querySelector('button')!;

      // Click to expand
      muteButton.click();
      expect(volumeControl.isSliderExpanded()).toBe(true);

      // Create an external element to receive focus
      const externalButton = document.createElement('button');
      document.body.appendChild(externalButton);

      // Dispatch focusout with relatedTarget outside the control
      element.dispatchEvent(new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: externalButton,
      }));

      expect(volumeControl.isSliderExpanded()).toBe(false);
    });

    it('VOL-H06h: focusout does NOT collapse when focus moves within control', () => {
      const element = volumeControl.render();
      document.body.appendChild(element);

      const muteButton = element.querySelector('button')!;
      const slider = element.querySelector('input[type="range"]')!;

      // Click to expand
      muteButton.click();
      expect(volumeControl.isSliderExpanded()).toBe(true);

      // Dispatch focusout with relatedTarget inside the control (e.g., moving from button to slider)
      element.dispatchEvent(new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: slider,
      }));

      // Should still be expanded
      expect(volumeControl.isSliderExpanded()).toBe(true);
    });
  });
});
