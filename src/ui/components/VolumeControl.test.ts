/**
 * VolumeControl Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VolumeControl } from './VolumeControl';

describe('VolumeControl', () => {
  let volumeControl: VolumeControl;

  beforeEach(() => {
    volumeControl = new VolumeControl();
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
});
