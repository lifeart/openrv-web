/**
 * VideoExporter Unit Tests
 *
 * Tests for WebCodecs-based video encoding pipeline.
 * Mocks VideoEncoder and VideoFrame since WebCodecs is not available in jsdom.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VideoExporter,
  ExportCancelledError,
  isVideoEncoderSupported,
  type VideoExportConfig,
  type ExportProgress,
  type EncodedChunk,
  type FrameProvider,
} from './VideoExporter';

// ---------------------------------------------------------------------------
// WebCodecs mocks
// ---------------------------------------------------------------------------

interface MockEncoderCallbacks {
  output: (chunk: MockEncodedVideoChunk) => void;
  error: (e: DOMException) => void;
}

interface MockEncodedVideoChunk {
  type: 'key' | 'delta';
  timestamp: number;
  duration: number | null;
  byteLength: number;
  copyTo: (dest: Uint8Array) => void;
}

// These track mock state — assigned by mock constructors, read in assertions where needed
let encodeCount = 0;
let configuredCodec: string | null = null;
let shouldErrorOnEncode = false;
let shouldErrorOnFlush = false;

class MockVideoEncoder {
  static isConfigSupported = vi.fn().mockResolvedValue({ supported: true });

  state = 'unconfigured';

  private callbacks: MockEncoderCallbacks;

  constructor(init: MockEncoderCallbacks) {
    this.callbacks = init;
  }

  configure(config: { codec: string }): void {
    configuredCodec = config.codec;
    this.state = 'configured';
  }

  encode(frame: MockVideoFrame, options?: { keyFrame?: boolean }): void {
    if (shouldErrorOnEncode) {
      this.callbacks.error(new DOMException('Encode failed'));
      return;
    }

    encodeCount++;
    const isKey = options?.keyFrame ?? false;
    const fakeData = new Uint8Array([0x00, 0x00, 0x00, 0x01, isKey ? 0x65 : 0x41, 0xaa, 0xbb, 0xcc]);

    const chunk: MockEncodedVideoChunk = {
      type: isKey ? 'key' : 'delta',
      timestamp: frame.timestamp,
      duration: frame.duration,
      byteLength: fakeData.length,
      copyTo: (dest: Uint8Array) => dest.set(fakeData),
    };

    this.callbacks.output(chunk);
  }

  async flush(): Promise<void> {
    if (shouldErrorOnFlush) {
      throw new Error('Flush failed');
    }
  }

  close(): void {
    this.state = 'closed';
  }
}

interface MockVideoFrame {
  timestamp: number;
  duration: number;
  close: () => void;
}

let videoFrameCloseCount = 0;

class MockVideoFrameClass {
  timestamp: number;
  duration: number;

  constructor(_source: unknown, init: { timestamp: number; duration: number }) {
    this.timestamp = init.timestamp;
    this.duration = init.duration;
  }

  close(): void {
    videoFrameCloseCount++;
  }
}

// Install mocks
beforeEach(() => {
  vi.stubGlobal('VideoEncoder', MockVideoEncoder);
  vi.stubGlobal('VideoFrame', MockVideoFrameClass);
  encodeCount = 0;
  configuredCodec = null;
  shouldErrorOnEncode = false;
  shouldErrorOnFlush = false;
  videoFrameCloseCount = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helper: default config
// ---------------------------------------------------------------------------

function defaultConfig(overrides?: Partial<VideoExportConfig>): VideoExportConfig {
  return {
    codec: 'avc1.42001f',
    width: 640,
    height: 480,
    fps: 24,
    bitrate: 2_000_000,
    frameRange: { start: 1, end: 10 },
    ...overrides,
  };
}

function canvasProvider(): FrameProvider {
  return async (_frame: number) => {
    return document.createElement('canvas');
  };
}

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

describe('isVideoEncoderSupported', () => {
  it('VIDEO-FEAT-001: returns true when VideoEncoder exists', () => {
    expect(isVideoEncoderSupported()).toBe(true);
  });

  it('VIDEO-FEAT-002: returns false when VideoEncoder is missing', () => {
    vi.stubGlobal('VideoEncoder', undefined);
    expect(isVideoEncoderSupported()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VideoExporter.encode()
// ---------------------------------------------------------------------------

describe('VideoExporter', () => {
  let exporter: VideoExporter;

  beforeEach(() => {
    exporter = new VideoExporter();
  });

  describe('basic encoding', () => {
    it('VIDEO-001: encode produces correct number of chunks', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 5 } });
      const result = await exporter.encode(config, canvasProvider());

      expect(result.chunks.length).toBe(5);
      expect(result.totalFrames).toBe(5);
    });

    it('VIDEO-001b: encode uses correct codec', async () => {
      const config = defaultConfig({ codec: 'avc1.640028' });
      await exporter.encode(config, canvasProvider());

      expect(configuredCodec).toBe('avc1.640028');
    });

    it('VIDEO-001c: result includes correct metadata', async () => {
      const config = defaultConfig({
        codec: 'avc1.42001f',
        width: 1920,
        height: 1080,
        fps: 30,
        frameRange: { start: 1, end: 3 },
      });
      const result = await exporter.encode(config, canvasProvider());

      expect(result.codec).toBe('avc1.42001f');
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.fps).toBe(30);
      expect(result.encodingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('progress events', () => {
    it('VIDEO-002: progress events fire with correct percentage', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 10 } });
      const progressEvents: ExportProgress[] = [];

      exporter.on('progress', (p) => progressEvents.push({ ...p }));

      await exporter.encode(config, canvasProvider());

      // Should have encoding progress + flushing + complete
      expect(progressEvents.length).toBeGreaterThanOrEqual(10);

      // Check first encoding progress
      const firstEncoding = progressEvents.find(p => p.status === 'encoding' && p.percentage > 0);
      expect(firstEncoding).toBeDefined();
      expect(firstEncoding!.percentage).toBe(10); // 1/10 = 10%

      // Check complete
      const complete = progressEvents.find(p => p.status === 'complete');
      expect(complete).toBeDefined();
      expect(complete!.percentage).toBe(100);
    });

    it('VIDEO-002b: progress events have monotonically increasing percentage', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 20 } });
      const percentages: number[] = [];

      exporter.on('progress', (p) => {
        if (p.status === 'encoding') {
          percentages.push(p.percentage);
        }
      });

      await exporter.encode(config, canvasProvider());

      for (let i = 1; i < percentages.length; i++) {
        expect(percentages[i]!).toBeGreaterThanOrEqual(percentages[i - 1]!);
      }
    });

    it('VIDEO-002c: progress includes elapsed time', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 3 } });
      const progresses: ExportProgress[] = [];

      exporter.on('progress', (p) => progresses.push({ ...p }));
      await exporter.encode(config, canvasProvider());

      const lastProgress = progresses[progresses.length - 1]!;
      expect(lastProgress.elapsedMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cancellation', () => {
    it('VIDEO-003: cancel stops encoding mid-stream', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 100 } });
      let framesProvided = 0;

      const provider: FrameProvider = async (_frame: number) => {
        framesProvided++;
        if (framesProvided >= 5) {
          exporter.cancel();
        }
        return document.createElement('canvas');
      };

      await expect(exporter.encode(config, provider)).rejects.toThrow(ExportCancelledError);
      expect(framesProvided).toBeLessThan(100);
    });

    it('VIDEO-003b: cancelled event is emitted', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 50 } });
      let cancelledEmitted = false;

      exporter.on('cancelled', () => {
        cancelledEmitted = true;
      });

      const provider: FrameProvider = async (_frame: number) => {
        exporter.cancel();
        return document.createElement('canvas');
      };

      try {
        await exporter.encode(config, provider);
      } catch {
        // Expected
      }

      expect(cancelledEmitted).toBe(true);
    });

    it('VIDEO-003c: ExportCancelledError has framesEncoded count', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 50 } });
      let frameCount = 0;

      const provider: FrameProvider = async () => {
        frameCount++;
        if (frameCount >= 3) exporter.cancel();
        return document.createElement('canvas');
      };

      try {
        await exporter.encode(config, provider);
      } catch (e) {
        expect(e).toBeInstanceOf(ExportCancelledError);
        expect((e as ExportCancelledError).framesEncoded).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('error handling', () => {
    it('VIDEO-005: handles encoder error gracefully', async () => {
      shouldErrorOnEncode = true;
      const config = defaultConfig({ frameRange: { start: 1, end: 5 } });

      await expect(exporter.encode(config, canvasProvider())).rejects.toThrow('VideoEncoder error');
    });

    it('VIDEO-005b: error event is emitted on failure', async () => {
      shouldErrorOnEncode = true;
      const config = defaultConfig({ frameRange: { start: 1, end: 5 } });
      let errorEmitted = false;

      exporter.on('error', () => {
        errorEmitted = true;
      });

      try {
        await exporter.encode(config, canvasProvider());
      } catch {
        // Expected
      }

      expect(errorEmitted).toBe(true);
    });

    it('handles flush error', async () => {
      shouldErrorOnFlush = true;
      const config = defaultConfig({ frameRange: { start: 1, end: 3 } });

      await expect(exporter.encode(config, canvasProvider())).rejects.toThrow('Flush failed');
    });

    it('rejects concurrent encoding', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 100 } });

      // Start first encoding (don't await)
      const first = exporter.encode(config, async () => {
        await new Promise(r => setTimeout(r, 10));
        return document.createElement('canvas');
      });

      // Second encoding should reject immediately
      await expect(
        exporter.encode(config, canvasProvider())
      ).rejects.toThrow('already encoding');

      // Cancel first to clean up
      exporter.cancel();
      try { await first; } catch { /* ExportCancelledError */ }
    });

    it('rejects invalid frame range', async () => {
      const config = defaultConfig({ frameRange: { start: 10, end: 5 } });
      await expect(exporter.encode(config, canvasProvider())).rejects.toThrow('invalid frame range');
    });

    it('rejects when WebCodecs not available', async () => {
      vi.stubGlobal('VideoEncoder', undefined);

      const config = defaultConfig();
      await expect(exporter.encode(config, canvasProvider())).rejects.toThrow('not available');
    });
  });

  describe('keyframes and timestamps', () => {
    it('VIDEO-006: keyframes placed at GOP boundaries', async () => {
      const config = defaultConfig({
        frameRange: { start: 1, end: 12 },
        gopSize: 4,
        fps: 24,
      });

      const result = await exporter.encode(config, canvasProvider());

      // Frames 0, 4, 8 should be keyframes (0-indexed in encode loop)
      const keyIndices = result.chunks
        .map((c, i) => c.type === 'key' ? i : -1)
        .filter(i => i >= 0);

      expect(keyIndices).toContain(0);  // First frame always key
      expect(keyIndices).toContain(4);  // GOP boundary
      expect(keyIndices).toContain(8);  // GOP boundary
    });

    it('VIDEO-007: output timestamps are monotonically increasing', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 10 }, fps: 30 });
      const result = await exporter.encode(config, canvasProvider());

      for (let i = 1; i < result.chunks.length; i++) {
        expect(result.chunks[i]!.timestamp).toBeGreaterThan(result.chunks[i - 1]!.timestamp);
      }
    });

    it('VIDEO-007b: timestamps use microsecond precision', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 3 }, fps: 24 });
      const result = await exporter.encode(config, canvasProvider());

      const frameDurationUs = Math.round(1_000_000 / 24);
      expect(result.chunks[0]!.timestamp).toBe(0);
      expect(result.chunks[1]!.timestamp).toBe(frameDurationUs);
      expect(result.chunks[2]!.timestamp).toBe(frameDurationUs * 2);
    });

    it('default gopSize equals fps', async () => {
      const config = defaultConfig({
        frameRange: { start: 1, end: 48 },
        fps: 24,
      });

      const result = await exporter.encode(config, canvasProvider());

      const keyIndices = result.chunks
        .map((c, i) => c.type === 'key' ? i : -1)
        .filter(i => i >= 0);

      expect(keyIndices).toContain(0);
      expect(keyIndices).toContain(24);
    });
  });

  describe('frame provider', () => {
    it('skips null frames from provider', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 5 } });
      let callCount = 0;

      const provider: FrameProvider = async (frame: number) => {
        callCount++;
        // Return null for frame 3 (gap)
        if (frame === 3) return null;
        return document.createElement('canvas');
      };

      const result = await exporter.encode(config, provider);

      expect(callCount).toBe(5);
      // 4 frames encoded (frame 3 was skipped)
      expect(result.chunks.length).toBe(4);
    });

    it('VideoFrame.close() called for every encoded frame', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 5 } });
      await exporter.encode(config, canvasProvider());

      expect(videoFrameCloseCount).toBe(5);
    });
  });

  describe('chunkEncoded event', () => {
    it('emits chunkEncoded for each output chunk', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 5 } });
      const chunks: EncodedChunk[] = [];

      exporter.on('chunkEncoded', (c) => chunks.push(c));

      await exporter.encode(config, canvasProvider());

      expect(chunks.length).toBe(5);
      expect(chunks[0]!.data).toBeInstanceOf(Uint8Array);
      expect(chunks[0]!.data.length).toBeGreaterThan(0);
    });
  });

  describe('complete event', () => {
    it('emits complete with full result', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 3 } });
      let completeResult: unknown = null;

      exporter.on('complete', (r) => {
        completeResult = r;
      });

      const result = await exporter.encode(config, canvasProvider());

      expect(completeResult).toBeDefined();
      expect(result.chunks.length).toBe(3);
    });
  });

  describe('isEncoding state', () => {
    it('isEncoding is false initially', () => {
      expect(exporter.isEncoding).toBe(false);
    });

    it('isEncoding is false after encode completes', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 3 } });
      await exporter.encode(config, canvasProvider());
      expect(exporter.isEncoding).toBe(false);
    });

    it('isEncoding is false after error', async () => {
      shouldErrorOnEncode = true;
      const config = defaultConfig({ frameRange: { start: 1, end: 3 } });
      try {
        await exporter.encode(config, canvasProvider());
      } catch { /* expected */ }
      expect(exporter.isEncoding).toBe(false);
    });

    it('isEncoding is false after cancel', async () => {
      const config = defaultConfig({ frameRange: { start: 1, end: 50 } });
      const provider: FrameProvider = async () => {
        exporter.cancel();
        return document.createElement('canvas');
      };
      try {
        await exporter.encode(config, provider);
      } catch { /* expected */ }
      expect(exporter.isEncoding).toBe(false);
    });
  });
});
