import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VolumeManager, type VolumeManagerCallbacks } from './VolumeManager';

describe('VolumeManager', () => {
  let manager: VolumeManager;
  let callbacks: VolumeManagerCallbacks;
  let onVolumeChanged: ReturnType<typeof vi.fn>;
  let onMutedChanged: ReturnType<typeof vi.fn>;
  let onPreservesPitchChanged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manager = new VolumeManager();
    onVolumeChanged = vi.fn();
    onMutedChanged = vi.fn();
    onPreservesPitchChanged = vi.fn();
    callbacks = { onVolumeChanged, onMutedChanged, onPreservesPitchChanged };
    manager.setCallbacks(callbacks);
  });

  describe('initialization', () => {
    it('VOL-001: starts with default volume 0.7', () => {
      expect(manager.volume).toBeCloseTo(0.7, 2);
    });

    it('VOL-002: starts unmuted', () => {
      expect(manager.muted).toBe(false);
    });

    it('VOL-003: starts with preservesPitch true', () => {
      expect(manager.preservesPitch).toBe(true);
    });

    it('VOL-004: starts with audioSyncEnabled true', () => {
      expect(manager.audioSyncEnabled).toBe(true);
    });
  });

  describe('volume', () => {
    it('VOL-005: sets volume within range', () => {
      manager.volume = 0.5;
      expect(manager.volume).toBeCloseTo(0.5, 2);
      expect(onVolumeChanged).toHaveBeenCalledWith(0.5);
    });

    it('VOL-006: clamps volume to minimum 0', () => {
      manager.volume = -0.5;
      expect(manager.volume).toBe(0);
    });

    it('VOL-007: clamps volume to maximum 1', () => {
      manager.volume = 1.5;
      expect(manager.volume).toBe(1);
    });

    it('VOL-008: does not emit when setting same volume', () => {
      manager.volume = 0.7; // Same as default
      expect(onVolumeChanged).not.toHaveBeenCalled();
    });

    it('VOL-009: auto-unmutes when setting non-zero volume while muted', () => {
      manager.muted = true;
      onMutedChanged.mockClear();
      manager.volume = 0.5;
      expect(manager.muted).toBe(false);
      expect(onMutedChanged).toHaveBeenCalledWith(false);
    });

    it('VOL-009b: auto-mutes when setting volume to zero', () => {
      manager.volume = 0;
      expect(manager.volume).toBe(0);
      expect(manager.muted).toBe(true);
      expect(onMutedChanged).toHaveBeenCalledWith(true);
    });
  });

  describe('muted', () => {
    it('VOL-010: sets muted state', () => {
      manager.muted = true;
      expect(manager.muted).toBe(true);
      expect(onMutedChanged).toHaveBeenCalledWith(true);
    });

    it('VOL-011: does not emit when setting same muted state', () => {
      manager.muted = false; // Same as default
      expect(onMutedChanged).not.toHaveBeenCalled();
    });
  });

  describe('toggleMute', () => {
    it('VOL-012: mutes when unmuted', () => {
      manager.toggleMute();
      expect(manager.muted).toBe(true);
      expect(onMutedChanged).toHaveBeenCalledWith(true);
    });

    it('VOL-013: unmutes and restores volume when muted', () => {
      manager.volume = 0.5;
      manager.toggleMute(); // mute
      onVolumeChanged.mockClear();
      manager.toggleMute(); // unmute
      expect(manager.muted).toBe(false);
      expect(manager.volume).toBeCloseTo(0.5, 2);
    });

    it('VOL-014: restores previous volume when volume was set to 0', () => {
      manager.volume = 0.5;
      manager.toggleMute(); // mute (saves 0.5)
      manager.volume = 0; // set volume to 0 while muted (auto-unmute won't fire since 0)
      // At this point volume is 0, muted is true, previousVolume is 0.5
      // Actually: setting volume=0 when already muted won't trigger auto-unmute
      // Let's test differently:
      const mgr = new VolumeManager();
      mgr.setCallbacks(callbacks);
      onVolumeChanged.mockClear();
      onMutedChanged.mockClear();
      mgr.volume = 0.8;
      mgr.toggleMute(); // saves 0.8 as previous
      // Now: volume=0.8, muted=true
      // Set volume to 0 directly
      // toggleMute again to unmute
      mgr.volume = 0; // won't auto-unmute since clamped=0
      mgr.toggleMute(); // unmute -> volume is 0, should restore to 0.8
      expect(mgr.muted).toBe(false);
      expect(mgr.volume).toBeCloseTo(0.8, 2);
    });

    it('VOL-015: toggleMute saves current volume before muting', () => {
      manager.volume = 0.3;
      manager.toggleMute(); // save 0.3
      manager.toggleMute(); // restore
      expect(manager.volume).toBeCloseTo(0.3, 2);
    });

    it('VOL-016: defaults to 0.7 if no previous volume', () => {
      // Start with volume 0
      const mgr = new VolumeManager();
      mgr.setCallbacks(callbacks);
      // Internal state: _volume=0.7, _previousVolume=0.7
      // Set volume to 0 to test the edge case
      // But setting volume to 0 doesn't save to previousVolume
      // So previousVolume stays at 0.7 which is the default
      mgr.muted = true;
      mgr.toggleMute(); // unmute, volume is still 0.7
      expect(mgr.volume).toBeCloseTo(0.7, 2);
    });
  });

  describe('preservesPitch', () => {
    it('VOL-017: sets preservesPitch', () => {
      manager.preservesPitch = false;
      expect(manager.preservesPitch).toBe(false);
      expect(onPreservesPitchChanged).toHaveBeenCalledWith(false);
    });

    it('VOL-018: does not emit when setting same value', () => {
      manager.preservesPitch = true; // same as default
      expect(onPreservesPitchChanged).not.toHaveBeenCalled();
    });
  });

  describe('audioSyncEnabled', () => {
    it('VOL-019: can be toggled', () => {
      manager.audioSyncEnabled = false;
      expect(manager.audioSyncEnabled).toBe(false);
      manager.audioSyncEnabled = true;
      expect(manager.audioSyncEnabled).toBe(true);
    });
  });

  describe('video element helpers', () => {
    it('VOL-020: applyVolumeToVideo sets volume and muted on video', () => {
      const video = document.createElement('video') as any;
      manager.volume = 0.5;
      manager.applyVolumeToVideo(video, 1);
      expect(video.volume).toBeCloseTo(0.5, 2);
      expect(video.muted).toBe(false);
    });

    it('VOL-021: applyVolumeToVideo sets volume 0 when muted', () => {
      const video = document.createElement('video') as any;
      manager.muted = true;
      manager.applyVolumeToVideo(video, 1);
      expect(video.volume).toBe(0);
      expect(video.muted).toBe(true);
    });

    it('VOL-022: applyVolumeToVideo mutes during reverse playback', () => {
      const video = document.createElement('video') as any;
      manager.volume = 0.5;
      manager.applyVolumeToVideo(video, -1);
      expect(video.muted).toBe(true);
    });

    it('VOL-023: applyPreservesPitchToVideo sets preservesPitch', () => {
      const video = document.createElement('video') as any;
      manager.preservesPitch = false;
      manager.applyPreservesPitchToVideo(video);
      expect(video.preservesPitch).toBe(false);
    });

    it('VOL-024: initVideoPreservesPitch sets initial value', () => {
      const video = document.createElement('video') as any;
      manager.preservesPitch = false;
      manager.initVideoPreservesPitch(video);
      expect(video.preservesPitch).toBe(false);
    });

    it('VOL-025: getEffectiveVolume returns 0 when muted', () => {
      manager.muted = true;
      expect(manager.getEffectiveVolume()).toBe(0);
    });

    it('VOL-026: getEffectiveVolume returns volume when not muted', () => {
      manager.volume = 0.5;
      expect(manager.getEffectiveVolume()).toBeCloseTo(0.5, 2);
    });
  });

  describe('callbacks not set', () => {
    it('VOL-027: works without callbacks', () => {
      const mgr = new VolumeManager();
      mgr.volume = 0.5;
      mgr.muted = true;
      mgr.toggleMute();
      mgr.preservesPitch = false;
      expect(mgr.volume).toBeCloseTo(0.5, 2);
      expect(mgr.muted).toBe(false);
      expect(mgr.preservesPitch).toBe(false);
    });
  });

  describe('dispose', () => {
    it('VOL-028: dispose nulls callbacks', () => {
      manager.dispose();
      // Mutations should not fire callbacks after dispose
      manager.volume = 0.3;
      expect(onVolumeChanged).not.toHaveBeenCalled();
    });
  });
});
