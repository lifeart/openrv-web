/**
 * SyncStateManager Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SyncStateManager } from './SyncStateManager';
import type { PlaybackSyncPayload, ViewSyncPayload, ColorSyncPayload } from './types';

describe('SyncStateManager', () => {
  let manager: SyncStateManager;

  beforeEach(() => {
    manager = new SyncStateManager(2);
  });

  describe('local state', () => {
    it('SSM-001: stores local playback state', () => {
      manager.updateLocalPlayback({
        isPlaying: true,
        currentFrame: 50,
        playbackSpeed: 2.0,
      });

      const state = manager.localPlayback;
      expect(state.isPlaying).toBe(true);
      expect(state.currentFrame).toBe(50);
      expect(state.playbackSpeed).toBe(2.0);
    });

    it('SSM-001b: stores local view state', () => {
      manager.updateLocalView({ panX: 10, panY: 20, zoom: 2.5, channelMode: 'red' });
      const state = manager.localView;
      expect(state.panX).toBe(10);
      expect(state.zoom).toBe(2.5);
      expect(state.channelMode).toBe('red');
    });

    it('SSM-001c: stores local color state', () => {
      manager.updateLocalColor({ exposure: 1.5, saturation: 0.8 });
      const state = manager.localColor;
      expect(state.exposure).toBe(1.5);
      expect(state.saturation).toBe(0.8);
    });
  });

  describe('remote state', () => {
    it('SSM-002: stores remote playback state', () => {
      const payload: PlaybackSyncPayload = {
        isPlaying: false,
        currentFrame: 100,
        playbackSpeed: 1.0,
        playDirection: -1,
        loopMode: 'once',
        timestamp: Date.now(),
      };
      manager.updateRemotePlayback(payload);

      const state = manager.remotePlayback;
      expect(state.isPlaying).toBe(false);
      expect(state.currentFrame).toBe(100);
      expect(state.playDirection).toBe(-1);
      expect(state.loopMode).toBe('once');
    });

    it('SSM-002b: stores remote view state', () => {
      const payload: ViewSyncPayload = { panX: 5, panY: -5, zoom: 3, channelMode: 'blue' };
      manager.updateRemoteView(payload);

      const state = manager.remoteView;
      expect(state.zoom).toBe(3);
      expect(state.channelMode).toBe('blue');
    });

    it('SSM-002c: stores remote color state', () => {
      const payload: ColorSyncPayload = {
        exposure: 2.0, gamma: 0.9, saturation: 1.1,
        contrast: 1.2, temperature: 10, tint: -5, brightness: 0.1,
      };
      manager.updateRemoteColor(payload);

      const state = manager.remoteColor;
      expect(state.exposure).toBe(2.0);
      expect(state.temperature).toBe(10);
    });
  });

  describe('conflict detection', () => {
    it('SSM-003: detects playback state conflict', () => {
      manager.updateLocalPlayback({ isPlaying: true, currentFrame: 10 });
      manager.updateRemotePlayback({
        isPlaying: false, currentFrame: 10,
        playbackSpeed: 1, playDirection: 1, loopMode: 'loop', timestamp: Date.now(),
      });

      expect(manager.hasPlaybackConflict()).toBe(true);
    });

    it('SSM-003b: detects frame position conflict beyond threshold', () => {
      manager.updateLocalPlayback({ isPlaying: false, currentFrame: 10 });
      manager.updateRemotePlayback({
        isPlaying: false, currentFrame: 15,
        playbackSpeed: 1, playDirection: 1, loopMode: 'loop', timestamp: Date.now(),
      });

      expect(manager.hasPlaybackConflict()).toBe(true);
    });

    it('SSM-003c: no conflict when within threshold', () => {
      manager.updateLocalPlayback({ isPlaying: false, currentFrame: 10 });
      manager.updateRemotePlayback({
        isPlaying: false, currentFrame: 11,
        playbackSpeed: 1, playDirection: 1, loopMode: 'loop', timestamp: Date.now(),
      });

      expect(manager.hasPlaybackConflict()).toBe(false);
    });

    it('SSM-003d: detects view conflict', () => {
      manager.updateLocalView({ panX: 0, panY: 0, zoom: 1, channelMode: 'rgb' });
      manager.updateRemoteView({ panX: 10, panY: 0, zoom: 1, channelMode: 'rgb' });

      expect(manager.hasViewConflict()).toBe(true);
    });
  });

  describe('conflict resolution', () => {
    it('SSM-004: resolves conflict with last-write-wins', () => {
      manager.updateLocalPlayback({ isPlaying: true, currentFrame: 10, timestamp: 1000 });
      manager.updateRemotePlayback({
        isPlaying: false, currentFrame: 20,
        playbackSpeed: 1, playDirection: 1, loopMode: 'loop', timestamp: 2000,
      });

      const resolved = manager.resolvePlaybackConflict('last-write-wins');
      // Remote has higher timestamp
      expect(resolved.currentFrame).toBe(20);
    });

    it('SSM-005: resolves playback conflict with host authority (host)', () => {
      manager.setHost(true);
      manager.updateLocalPlayback({ isPlaying: true, currentFrame: 10 });
      manager.updateRemotePlayback({
        isPlaying: false, currentFrame: 20,
        playbackSpeed: 1, playDirection: 1, loopMode: 'loop', timestamp: Date.now(),
      });

      const resolved = manager.resolvePlaybackConflict('host-authority');
      expect(resolved.isPlaying).toBe(true); // Host wins
      expect(resolved.currentFrame).toBe(10);
    });

    it('SSM-005b: resolves playback conflict with host authority (participant)', () => {
      manager.setHost(false);
      manager.updateLocalPlayback({ isPlaying: true, currentFrame: 10 });
      manager.updateRemotePlayback({
        isPlaying: false, currentFrame: 20,
        playbackSpeed: 1, playDirection: 1, loopMode: 'loop', timestamp: Date.now(),
      });

      const resolved = manager.resolvePlaybackConflict('host-authority');
      expect(resolved.isPlaying).toBe(false); // Remote (host) wins
      expect(resolved.currentFrame).toBe(20);
    });
  });

  describe('latency compensation', () => {
    it('SSM-010: calculates frame prediction for playing state', () => {
      const state = {
        isPlaying: true,
        currentFrame: 100,
        playbackSpeed: 1,
        playDirection: 1,
        loopMode: 'loop',
        timestamp: Date.now() - 100, // 100ms ago
      };

      manager.setRTT(50); // 50ms RTT
      const predicted = manager.predictFrame(state, 24);

      // Should predict forward from frame 100 based on elapsed time + half RTT
      // elapsed = 100ms + 25ms (half RTT) = 125ms
      // frames = 0.125 * 24 * 1 * 1 = 3 frames
      expect(predicted).toBeGreaterThan(100);
    });

    it('SSM-011: no prediction for paused state', () => {
      const state = {
        isPlaying: false,
        currentFrame: 100,
        playbackSpeed: 1,
        playDirection: 1,
        loopMode: 'loop',
        timestamp: Date.now() - 1000,
      };

      const predicted = manager.predictFrame(state, 24);
      expect(predicted).toBe(100);
    });

    it('SSM-012: skips update within threshold', () => {
      expect(manager.shouldApplyFrameSync(10, 11)).toBe(false); // diff 1 <= threshold 2
      expect(manager.shouldApplyFrameSync(10, 13)).toBe(true);  // diff 3 > threshold 2
      expect(manager.shouldApplyFrameSync(10, 10)).toBe(false);
    });
  });

  describe('sync settings', () => {
    it('SSM-020: respects sync settings', () => {
      manager.setSyncSettings({
        playback: true,
        view: false,
        color: true,
        annotations: false,
      });

      expect(manager.shouldSyncPlayback()).toBe(true);
      expect(manager.shouldSyncView()).toBe(false);
      expect(manager.shouldSyncColor()).toBe(true);
      expect(manager.shouldSyncAnnotations()).toBe(false);
    });
  });

  describe('apply remote state flag', () => {
    it('SSM-030: tracks apply remote state flag', () => {
      expect(manager.isApplyingRemoteState).toBe(false);

      manager.beginApplyRemote();
      expect(manager.isApplyingRemoteState).toBe(true);

      manager.endApplyRemote();
      expect(manager.isApplyingRemoteState).toBe(false);
    });
  });

  describe('reset', () => {
    it('SSM-040: resets all state', () => {
      manager.setHost(true);
      manager.setRTT(100);
      manager.updateLocalPlayback({ isPlaying: true, currentFrame: 50 });
      manager.updateRemoteView({ panX: 10, panY: 20, zoom: 2, channelMode: 'red' });

      manager.reset();

      expect(manager.isHost).toBe(false);
      expect(manager.localPlayback.isPlaying).toBe(false);
      expect(manager.localPlayback.currentFrame).toBe(0);
      expect(manager.remoteView.zoom).toBe(1);
    });

    it('SSM-041: reset also resets sync settings to defaults', () => {
      manager.setSyncSettings({
        playback: false,
        view: false,
        color: true,
        annotations: true,
      });

      manager.reset();

      expect(manager.shouldSyncPlayback()).toBe(true);
      expect(manager.shouldSyncView()).toBe(true);
      expect(manager.shouldSyncColor()).toBe(false);
      expect(manager.shouldSyncAnnotations()).toBe(false);
    });

    it('SSM-042: reset clears applyingRemoteState flag', () => {
      manager.beginApplyRemote();
      expect(manager.isApplyingRemoteState).toBe(true);

      manager.reset();
      expect(manager.isApplyingRemoteState).toBe(false);
    });
  });

  describe('latency compensation edge cases', () => {
    it('SSM-013: predictFrame returns current frame when fps is 0', () => {
      const state = {
        isPlaying: true,
        currentFrame: 50,
        playbackSpeed: 1,
        playDirection: 1,
        loopMode: 'loop',
        timestamp: Date.now() - 500,
      };

      const predicted = manager.predictFrame(state, 0);
      expect(predicted).toBe(50);
    });

    it('SSM-014: predictFrame handles negative play direction', () => {
      const state = {
        isPlaying: true,
        currentFrame: 100,
        playbackSpeed: 1,
        playDirection: -1,
        loopMode: 'loop',
        timestamp: Date.now() - 100,
      };

      manager.setRTT(0);
      const predicted = manager.predictFrame(state, 24);

      // Playing backwards: frame should be less than 100
      expect(predicted).toBeLessThan(100);
    });

    it('SSM-015: predictFrame handles high playback speed', () => {
      const state = {
        isPlaying: true,
        currentFrame: 0,
        playbackSpeed: 4,
        playDirection: 1,
        loopMode: 'loop',
        timestamp: Date.now() - 1000, // 1 second ago
      };

      manager.setRTT(0);
      const predicted = manager.predictFrame(state, 24);

      // At 4x speed, 24fps, 1 second: ~96 frames forward
      expect(predicted).toBeGreaterThan(90);
    });
  });

  describe('conflict detection edge cases', () => {
    it('SSM-050: no view conflict when states are identical', () => {
      manager.updateLocalView({ panX: 5, panY: 10, zoom: 2, channelMode: 'rgb' });
      manager.updateRemoteView({ panX: 5, panY: 10, zoom: 2, channelMode: 'rgb' });

      expect(manager.hasViewConflict()).toBe(false);
    });

    it('SSM-051: view conflict on channel mode change only', () => {
      manager.updateLocalView({ panX: 0, panY: 0, zoom: 1, channelMode: 'rgb' });
      manager.updateRemoteView({ panX: 0, panY: 0, zoom: 1, channelMode: 'red' });

      expect(manager.hasViewConflict()).toBe(true);
    });

    it('SSM-052: playback conflict at exact threshold boundary', () => {
      manager.setFrameSyncThreshold(2);
      manager.updateLocalPlayback({ isPlaying: false, currentFrame: 10 });
      manager.updateRemotePlayback({
        isPlaying: false, currentFrame: 12, // diff = 2, exactly at threshold
        playbackSpeed: 1, playDirection: 1, loopMode: 'loop', timestamp: Date.now(),
      });

      // Diff of exactly 2 should NOT be a conflict (uses > not >=)
      expect(manager.hasPlaybackConflict()).toBe(false);
    });

    it('SSM-053: playback conflict at one above threshold', () => {
      manager.setFrameSyncThreshold(2);
      manager.updateLocalPlayback({ isPlaying: false, currentFrame: 10 });
      manager.updateRemotePlayback({
        isPlaying: false, currentFrame: 13, // diff = 3, above threshold
        playbackSpeed: 1, playDirection: 1, loopMode: 'loop', timestamp: Date.now(),
      });

      expect(manager.hasPlaybackConflict()).toBe(true);
    });
  });

  describe('conflict resolution edge cases', () => {
    it('SSM-054: last-write-wins with equal timestamps favors local', () => {
      const ts = Date.now();
      manager.updateLocalPlayback({ isPlaying: true, currentFrame: 10, timestamp: ts });
      manager.updateRemotePlayback({
        isPlaying: false, currentFrame: 20,
        playbackSpeed: 1, playDirection: 1, loopMode: 'loop', timestamp: ts,
      });

      const resolved = manager.resolvePlaybackConflict('last-write-wins');
      // With equal timestamps, local wins (>=)
      expect(resolved.currentFrame).toBe(10);
    });

    it('SSM-055: view conflict resolution with host-authority as host', () => {
      manager.setHost(true);
      manager.updateLocalView({ panX: 5, panY: 5, zoom: 2, channelMode: 'rgb' });
      manager.updateRemoteView({ panX: 0, panY: 0, zoom: 1, channelMode: 'red' });

      const resolved = manager.resolveViewConflict('host-authority');
      expect(resolved.panX).toBe(5);
      expect(resolved.zoom).toBe(2);
    });

    it('SSM-056: view conflict resolution with host-authority as participant', () => {
      manager.setHost(false);
      manager.updateLocalView({ panX: 5, panY: 5, zoom: 2, channelMode: 'rgb' });
      manager.updateRemoteView({ panX: 0, panY: 0, zoom: 1, channelMode: 'red' });

      const resolved = manager.resolveViewConflict('host-authority');
      expect(resolved.panX).toBe(0);
      expect(resolved.zoom).toBe(1);
    });
  });

  describe('frame sync threshold', () => {
    it('SSM-060: shouldApplyFrameSync at exact threshold', () => {
      manager.setFrameSyncThreshold(5);
      expect(manager.shouldApplyFrameSync(10, 15)).toBe(false); // diff = 5, not > 5
      expect(manager.shouldApplyFrameSync(10, 16)).toBe(true);  // diff = 6, > 5
    });

    it('SSM-061: shouldApplyFrameSync with negative differences', () => {
      manager.setFrameSyncThreshold(2);
      expect(manager.shouldApplyFrameSync(15, 10)).toBe(true);  // diff = 5
      expect(manager.shouldApplyFrameSync(12, 10)).toBe(false); // diff = 2
    });
  });

  describe('getters return copies', () => {
    it('SSM-070: modifying returned state does not affect internal state', () => {
      manager.updateLocalPlayback({ isPlaying: true, currentFrame: 42 });

      const playback = manager.localPlayback;
      playback.currentFrame = 999;

      // Internal state should be unaffected
      expect(manager.localPlayback.currentFrame).toBe(42);
    });

    it('SSM-071: modifying returned sync settings does not affect internal state', () => {
      const settings = manager.syncSettings;
      settings.playback = false;

      expect(manager.shouldSyncPlayback()).toBe(true);
    });
  });
});
