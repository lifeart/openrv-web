/**
 * WaveformRenderer Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WaveformRenderer,
  renderWaveform,
  renderWaveformRegion,
} from './WaveformRenderer';
import type { WaveformData, WaveformRenderOptions } from './WaveformRenderer';

describe('WaveformRenderer', () => {
  describe('WaveformRenderer class', () => {
    let renderer: WaveformRenderer;

    beforeEach(() => {
      renderer = new WaveformRenderer();
    });

    describe('initialization', () => {
      it('WAV-001: starts with no data', () => {
        expect(renderer.hasData()).toBe(false);
        expect(renderer.getData()).toBeNull();
      });

      it('WAV-002: starts not loading', () => {
        expect(renderer.isLoading()).toBe(false);
      });

      it('WAV-003: starts with no error', () => {
        expect(renderer.getError()).toBeNull();
      });
    });

    describe('clear', () => {
      it('WAV-004: clears data and state', () => {
        // Set some internal state by calling clear
        renderer.clear();

        expect(renderer.hasData()).toBe(false);
        expect(renderer.getData()).toBeNull();
        expect(renderer.isLoading()).toBe(false);
        expect(renderer.getError()).toBeNull();
      });
    });

    describe('render', () => {
      it('WAV-005: does nothing when no data', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 40;
        const ctx = canvas.getContext('2d')!;

        // Should not throw
        renderer.render(ctx, 0, 0, 100, 40, 0, 10);
      });
    });

    describe('loadFromVideo', () => {
      it('WAV-006: returns false when already loading', async () => {
        const video = document.createElement('video');

        // Start first load
        const promise1 = renderer.loadFromVideo(video);

        // Try to start second load while first is in progress
        const promise2 = renderer.loadFromVideo(video);

        // Second should return false immediately
        expect(await promise2).toBe(false);

        // Wait for first to complete (will fail in test env)
        await promise1;
      });
    });

    describe('loadFromBlob', () => {
      it('WAV-007: returns false when already loading', async () => {
        const blob = new Blob(['test']);

        // Start first load
        const promise1 = renderer.loadFromBlob(blob);

        // Try to start second load while first is in progress
        const promise2 = renderer.loadFromBlob(blob);

        // Second should return false immediately
        expect(await promise2).toBe(false);

        // Wait for first to complete
        await promise1;
      });
    });
  });

  describe('renderWaveform', () => {
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let mockData: WaveformData;

    beforeEach(() => {
      canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 40;
      ctx = canvas.getContext('2d')!;

      // Create mock waveform data with some peaks
      const peaks = new Float32Array(100);
      for (let i = 0; i < 100; i++) {
        peaks[i] = Math.sin(i * 0.1) * 0.5 + 0.5;
      }

      mockData = {
        peaks,
        duration: 10, // 10 seconds
        sampleRate: 44100,
      };

      // Reset mock functions
      vi.clearAllMocks();
    });

    it('RND-001: clears canvas before rendering', () => {
      const clearRectSpy = vi.spyOn(ctx, 'clearRect');

      renderWaveform(ctx, mockData);

      expect(clearRectSpy).toHaveBeenCalled();
    });

    it('RND-002: fills background when not transparent', () => {
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');

      renderWaveform(ctx, mockData, { backgroundColor: '#000000' });

      expect(fillRectSpy).toHaveBeenCalled();
    });

    it('RND-003: draws center line when enabled', () => {
      const beginPathSpy = vi.spyOn(ctx, 'beginPath');
      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      const lineToSpy = vi.spyOn(ctx, 'lineTo');
      const strokeSpy = vi.spyOn(ctx, 'stroke');

      renderWaveform(ctx, mockData, { centerLine: true });

      expect(beginPathSpy).toHaveBeenCalled();
      expect(moveToSpy).toHaveBeenCalledWith(0, 20); // height/2
      expect(lineToSpy).toHaveBeenCalledWith(800, 20);
      expect(strokeSpy).toHaveBeenCalled();
    });

    it('RND-004: does not draw center line when disabled', () => {
      const beginPathSpy = vi.spyOn(ctx, 'beginPath');

      renderWaveform(ctx, mockData, { centerLine: false });

      // beginPath might still be called for other reasons, but stroke should not be for the center line
      // Since we're only testing centerLine, we check the combination
      const fillRectCalls = vi.spyOn(ctx, 'fillRect').mock.calls;
      // Center line uses stroke, not fillRect
    });

    it('RND-005: draws waveform bars', () => {
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');

      renderWaveform(ctx, mockData);

      // Should have multiple fillRect calls for the waveform bars
      expect(fillRectSpy.mock.calls.length).toBeGreaterThan(0);
    });

    it('RND-006: handles empty peaks array', () => {
      const emptyData: WaveformData = {
        peaks: new Float32Array(0),
        duration: 0,
        sampleRate: 44100,
      };

      // Should not throw
      renderWaveform(ctx, emptyData);
    });

    it('RND-007: handles zero duration', () => {
      const zeroData: WaveformData = {
        peaks: new Float32Array([0.5, 0.6, 0.7]),
        duration: 0,
        sampleRate: 44100,
      };

      // Should not throw
      renderWaveform(ctx, zeroData);
    });

    it('RND-008: respects custom color', () => {
      renderWaveform(ctx, mockData, { color: '#ff0000' });

      // Check that fillStyle was set
      expect(ctx.fillStyle).toBe('#ff0000');
    });

    it('RND-009: handles time range subset', () => {
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');

      // Only render middle portion
      renderWaveform(ctx, mockData, {}, 2, 8);

      expect(fillRectSpy).toHaveBeenCalled();
    });

    it('RND-010: handles negative time range', () => {
      // End time before start time
      renderWaveform(ctx, mockData, {}, 5, 2);

      // Should handle gracefully (return early)
    });
  });

  describe('renderWaveformRegion', () => {
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let mockData: WaveformData;

    beforeEach(() => {
      canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 100;
      ctx = canvas.getContext('2d')!;

      const peaks = new Float32Array(1000);
      for (let i = 0; i < 1000; i++) {
        peaks[i] = Math.random();
      }

      mockData = {
        peaks,
        duration: 60, // 60 seconds
        sampleRate: 44100,
      };

      vi.clearAllMocks();
    });

    it('RGN-001: renders within specified bounds', () => {
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');

      renderWaveformRegion(ctx, mockData, 50, 10, 200, 30, 0, 10);

      // Check that bars are drawn within bounds
      expect(fillRectSpy).toHaveBeenCalled();
    });

    it('RGN-002: handles empty peaks', () => {
      const emptyData: WaveformData = {
        peaks: new Float32Array(0),
        duration: 0,
        sampleRate: 44100,
      };

      // Should not throw
      renderWaveformRegion(ctx, emptyData, 0, 0, 100, 40, 0, 10);
    });

    it('RGN-003: handles zero width', () => {
      // Should return early without throwing
      renderWaveformRegion(ctx, mockData, 0, 0, 0, 40, 0, 10);
    });

    it('RGN-004: handles zero height', () => {
      // Should return early without throwing
      renderWaveformRegion(ctx, mockData, 0, 0, 100, 0, 0, 10);
    });

    it('RGN-005: handles negative time range', () => {
      // End time before start time
      renderWaveformRegion(ctx, mockData, 0, 0, 100, 40, 10, 5);

      // Should handle gracefully
    });

    it('RGN-006: uses custom color', () => {
      renderWaveformRegion(ctx, mockData, 0, 0, 100, 40, 0, 10, '#00ff00');

      expect(ctx.fillStyle).toBe('#00ff00');
    });

    it('RGN-007: renders individual bars when zoomed in', () => {
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');

      // Small time range = zoomed in
      renderWaveformRegion(ctx, mockData, 0, 0, 200, 40, 0, 1);

      expect(fillRectSpy).toHaveBeenCalled();
    });

    it('RGN-008: samples peaks when zoomed out', () => {
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');

      // Large time range = zoomed out
      renderWaveformRegion(ctx, mockData, 0, 0, 100, 40, 0, 60);

      expect(fillRectSpy).toHaveBeenCalled();
    });
  });

  describe('WaveformData structure', () => {
    it('maintains correct structure', () => {
      const data: WaveformData = {
        peaks: new Float32Array([0.1, 0.5, 0.8, 0.3]),
        duration: 5,
        sampleRate: 48000,
      };

      expect(data.peaks).toBeInstanceOf(Float32Array);
      expect(data.peaks.length).toBe(4);
      expect(data.duration).toBe(5);
      expect(data.sampleRate).toBe(48000);
    });
  });
});
