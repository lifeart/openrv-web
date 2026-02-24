/**
 * WaveformRenderer Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WaveformRenderer,
  renderWaveform,
  renderWaveformRegion,
  extractAudioFromVideo,
  extractAudioFromBlob,
  extractAudioWithFallback,
} from './WaveformRenderer';
import type { WaveformData } from './WaveformRenderer';

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

        expect(() => renderer.render(ctx, 0, 0, 100, 40, 0, 10)).not.toThrow();
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
        // Mock blob.arrayBuffer if it doesn't exist in environment
        if (!blob.arrayBuffer) {
           (blob as any).arrayBuffer = async () => new ArrayBuffer(0);
        }

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

  describe('Audio extraction', () => {
    const mockAudioBuffer = {
      getChannelData: vi.fn().mockReturnValue(new Float32Array(1000)),
      numberOfChannels: 1,
      length: 1000,
      duration: 1,
      sampleRate: 44100,
    };

    const mockAudioContext = {
      decodeAudioData: vi.fn().mockResolvedValue(mockAudioBuffer),
      close: vi.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
      vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => mockAudioContext));
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
      }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('EXT-001: extractAudioFromVideo handles success', async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';
      
      const result = await extractAudioFromVideo(video);
      expect(result).not.toBeNull();
      expect(result?.duration).toBe(1);
      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it('EXT-002: extractAudioFromVideo handles fetch error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }));
      
      const video = document.createElement('video');
      video.src = 'test.mp4';
      
      const result = await extractAudioFromVideo(video);
      expect(result).toBeNull();
    });

    it('EXT-003: extractAudioFromBlob handles success', async () => {
      const blob = new Blob(['test']);
      if (!blob.arrayBuffer) {
        blob.arrayBuffer = async () => new ArrayBuffer(0);
      }
      
      const result = await extractAudioFromBlob(blob);
      expect(result).not.toBeNull();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it('EXT-004: extractAudioFromBlob handles decode error', async () => {
      mockAudioContext.decodeAudioData.mockRejectedValueOnce(new Error('Decode failed'));

      const blob = new Blob(['test']);
      if (!blob.arrayBuffer) {
        blob.arrayBuffer = async () => new ArrayBuffer(0);
      }

      const result = await extractAudioFromBlob(blob);
      expect(result).toBeNull();
    });

    it('EXT-005: extractAudioFromVideo handles CORS error', async () => {
      const corsError = new TypeError('Failed to fetch');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(corsError));

      const video = document.createElement('video');
      video.src = 'https://external-domain.com/test.mp4';

      const onError = vi.fn();
      const result = await extractAudioFromVideo(video, { onError });

      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0].type).toBe('cors');
    });

    it('EXT-006: extractAudioFromVideo handles no source', async () => {
      const video = document.createElement('video');
      // No src set

      const onError = vi.fn();
      const result = await extractAudioFromVideo(video, { onError });

      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0].type).toBe('no-source');
    });

    it('EXT-007: extractAudioFromVideo handles timeout', async () => {
      // Create a fetch that never resolves within timeout
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, options: { signal?: AbortSignal }) => {
        return new Promise((_, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }
        });
      }));

      const video = document.createElement('video');
      video.src = 'test.mp4';

      const onError = vi.fn();
      const result = await extractAudioFromVideo(video, { timeout: 10, onError });

      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0].type).toBe('timeout');
    });

    it('EXT-008: extractAudioFromVideo handles network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }));

      const video = document.createElement('video');
      video.src = 'test.mp4';

      const onError = vi.fn();
      const result = await extractAudioFromVideo(video, { onError });

      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0].type).toBe('network');
    });

    it('EXT-009: extractAudioFromVideo handles decode error with callback', async () => {
      mockAudioContext.decodeAudioData.mockRejectedValueOnce(new Error('Unsupported codec'));

      const video = document.createElement('video');
      video.src = 'test.mp4';

      const onError = vi.fn();
      const result = await extractAudioFromVideo(video, { onError });

      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0].type).toBe('decode');
    });

    it('EXT-010: extractAudioFromVideo handles multi-channel audio', async () => {
      // Mock stereo audio buffer
      const stereoBuffer = {
        numberOfChannels: 2,
        length: 1000,
        getChannelData: vi.fn().mockImplementation((ch: number) => {
          const data = new Float32Array(1000);
          for (let i = 0; i < 1000; i++) {
            data[i] = ch === 0 ? 0.5 : -0.5; // Left and right channels
          }
          return data;
        }),
        duration: 1,
        sampleRate: 44100,
      };
      mockAudioContext.decodeAudioData.mockResolvedValueOnce(stereoBuffer);

      const video = document.createElement('video');
      video.src = 'test.mp4';

      const result = await extractAudioFromVideo(video);

      expect(result).not.toBeNull();
      expect(stereoBuffer.getChannelData).toHaveBeenCalledWith(0);
      expect(stereoBuffer.getChannelData).toHaveBeenCalledWith(1);
    });

    describe('fetch cache behavior', () => {
      it('EXT-011: HTTP URL fetch uses cache: force-cache', async () => {
        const video = document.createElement('video');
        video.src = 'https://cdn.example.com/test.mp4';

        await extractAudioFromVideo(video);

        expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/test.mp4', expect.objectContaining({
          cache: 'force-cache',
          mode: 'cors',
        }));
      });

      it('EXT-012: Blob URL fetch does NOT use force-cache', async () => {
        const video = document.createElement('video');
        video.src = 'blob:http://localhost:3000/abc-123';

        await extractAudioFromVideo(video);

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith('blob:http://localhost:3000/abc-123', expect.objectContaining({
          mode: 'same-origin',
        }));
        expect(fetch).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
          cache: expect.anything(),
        }));
      });

      it('EXT-013: Data URL fetch does NOT use force-cache', async () => {
        const video = document.createElement('video');
        video.src = 'data:video/mp4;base64,AAAA';

        await extractAudioFromVideo(video);

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith('data:video/mp4;base64,AAAA', expect.objectContaining({
          mode: 'same-origin',
        }));
        expect(fetch).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
          cache: expect.anything(),
        }));
      });
    });
  });

  describe('extractAudioWithFallback', () => {
    const mockAudioBuffer = {
      getChannelData: vi.fn().mockReturnValue(new Float32Array(1000)),
      numberOfChannels: 1,
      length: 1000,
      duration: 10,
      sampleRate: 44100,
    };

    const mockAudioContext = {
      decodeAudioData: vi.fn().mockResolvedValue(mockAudioBuffer),
      close: vi.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
      vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => mockAudioContext));
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
      }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('EXT-020: returns native result when successful', async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';

      const result = await extractAudioWithFallback(video);

      expect(result).not.toBeNull();
      expect(result!.duration).toBe(10);
    });

    it('EXT-021: returns null when native fails and no file provided', async () => {
      // Make native method fail
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const video = document.createElement('video');
      video.src = 'https://external-domain.com/test.mp4';

      const result = await extractAudioWithFallback(video);

      expect(result).toBeNull();
    });

    it('EXT-022: calls onError when native method fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const video = document.createElement('video');
      video.src = 'https://external-domain.com/test.mp4';

      const onError = vi.fn();
      await extractAudioWithFallback(video, undefined, { onError });

      expect(onError).toHaveBeenCalled();
    });

    it('EXT-023: onProgress is passed through to native method', async () => {
      const video = document.createElement('video');
      video.src = 'test.mp4';

      const onProgress = vi.fn();
      // Native method doesn't call onProgress, but verify it doesn't throw
      const result = await extractAudioWithFallback(video, undefined, { onProgress });

      expect(result).not.toBeNull();
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
      const strokeSpy = vi.spyOn(ctx, 'stroke');
      renderWaveform(ctx, mockData, { centerLine: false });

      expect(strokeSpy).not.toHaveBeenCalled();
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

      expect(() => renderWaveform(ctx, emptyData)).not.toThrow();
    });

    it('RND-007: handles zero duration', () => {
      const zeroData: WaveformData = {
        peaks: new Float32Array([0.5, 0.6, 0.7]),
        duration: 0,
        sampleRate: 44100,
      };

      expect(() => renderWaveform(ctx, zeroData)).not.toThrow();
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
      expect(() => renderWaveform(ctx, mockData, {}, 5, 2)).not.toThrow();
    });

    it('RND-011: uses data.duration if endTime is not provided', () => {
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');
      renderWaveform(ctx, mockData, {}, 0); // No endTime
      expect(fillRectSpy).toHaveBeenCalled();
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

      expect(() => renderWaveformRegion(ctx, emptyData, 0, 0, 100, 40, 0, 10)).not.toThrow();
    });

    it('RGN-003: handles zero width', () => {
      expect(() => renderWaveformRegion(ctx, mockData, 0, 0, 0, 40, 0, 10)).not.toThrow();
    });

    it('RGN-004: handles zero height', () => {
      expect(() => renderWaveformRegion(ctx, mockData, 0, 0, 100, 0, 0, 10)).not.toThrow();
    });

    it('RGN-005: handles negative time range', () => {
      expect(() => renderWaveformRegion(ctx, mockData, 0, 0, 100, 40, 10, 5)).not.toThrow();
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
