import { describe, it, expect, vi } from 'vitest';
import {
  createFrameLoader,
  buildEffectsState,
  getPrerenderStats,
  EFFECTS_DEBOUNCE_MS,
} from './ViewerPrerender';
import { Session, MediaSource } from '../../core/session/Session';
import { PrerenderBufferManager } from '../../utils/PrerenderBufferManager';
import { ColorAdjustments } from './ColorControls';
import { FilterSettings } from './FilterControl';
import { CDLValues } from '../../color/CDL';
import { ColorCurvesData } from '../../color/ColorCurves';
import { ChannelMode } from './ChannelSelect';
import { ColorWheels } from './ColorWheels';
import { HSLQualifier } from './HSLQualifier';
import { ToneMappingState, DEFAULT_TONE_MAPPING_STATE } from './ToneMappingControl';

// Mock image element
function createMockImage(): HTMLImageElement {
  return {
    naturalWidth: 1920,
    naturalHeight: 1080,
  } as HTMLImageElement;
}

// Create mock video element
function createMockVideo(): HTMLVideoElement {
  return {
    videoWidth: 1920,
    videoHeight: 1080,
  } as HTMLVideoElement;
}

// Create mock media source
function createMockMediaSource(
  type: 'image' | 'video' | 'sequence'
): MediaSource {
  return {
    name: 'test-source',
    type,
    url: 'test://test-source',
    element: type === 'video' ? createMockVideo() : createMockImage(),
    width: 1920,
    height: 1080,
    duration: type === 'video' ? 100 : 1,
    fps: 24,
    sequenceInfo: type === 'sequence' ? {
      name: 'test-sequence',
      pattern: 'frame_####.png',
      frames: [],
      startFrame: 1,
      endFrame: 100,
      width: 1920,
      height: 1080,
      fps: 24,
      missingFrames: [],
    } : undefined,
  };
}

// Create mock Session
function createMockSession(source: MediaSource | null = null): Session {
  let currentFrame = 1;
  return {
    get currentSource() { return source; },
    get currentFrame() { return currentFrame; },
    set currentFrame(f: number) { currentFrame = f; },
    getSequenceFrameSync: vi.fn().mockReturnValue(createMockImage()),
    isUsingMediabunny: vi.fn().mockReturnValue(false),
    getVideoFrameCanvas: vi.fn().mockReturnValue(null),
  } as unknown as Session;
}

// Create default color adjustments
function createDefaultColorAdjustments(): ColorAdjustments {
  return {
    brightness: 0,
    exposure: 0,
    gamma: 1,
    contrast: 1,
    saturation: 1,
    vibrance: 0,
    vibranceSkinProtection: true,
    clarity: 0,
    temperature: 0,
    tint: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
  };
}

// Create default CDL values
function createDefaultCDLValues(): CDLValues {
  return {
    slope: { r: 1, g: 1, b: 1 },
    offset: { r: 0, g: 0, b: 0 },
    power: { r: 1, g: 1, b: 1 },
    saturation: 1,
  };
}

// Create default curves data
function createDefaultCurvesData(): ColorCurvesData {
  const defaultCurve = {
    enabled: false,
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  };
  return {
    master: { ...defaultCurve, points: [...defaultCurve.points] },
    red: { ...defaultCurve, points: [...defaultCurve.points] },
    green: { ...defaultCurve, points: [...defaultCurve.points] },
    blue: { ...defaultCurve, points: [...defaultCurve.points] },
  };
}

// Create default filter settings
function createDefaultFilterSettings(): FilterSettings {
  return {
    blur: 0,
    sharpen: 0,
  };
}

// Create mock ColorWheels
function createMockColorWheels(): ColorWheels {
  return {
    getState: vi.fn().mockReturnValue({
      lift: { r: 0, g: 0, b: 0 },
      gamma: { r: 0, g: 0, b: 0 },
      gain: { r: 0, g: 0, b: 0 },
    }),
  } as unknown as ColorWheels;
}

// Create mock HSLQualifier
function createMockHSLQualifier(): HSLQualifier {
  return {
    getState: vi.fn().mockReturnValue({
      enabled: false,
      hue: { center: 0, width: 60 },
      saturation: { low: 0, high: 1 },
      luminance: { low: 0, high: 1 },
    }),
  } as unknown as HSLQualifier;
}

// Create default tone mapping state
function createDefaultToneMappingState(): ToneMappingState {
  return { ...DEFAULT_TONE_MAPPING_STATE };
}

// Create mock PrerenderBufferManager
function createMockPrerenderBuffer(stats: {
  cacheSize?: number;
  pendingRequests?: number;
  activeRequests?: number;
  cacheHits?: number;
  cacheMisses?: number;
  hitRate?: number;
} = {}): PrerenderBufferManager {
  return {
    getStats: vi.fn().mockReturnValue({
      cacheSize: stats.cacheSize ?? 10,
      pendingRequests: stats.pendingRequests ?? 0,
      activeRequests: stats.activeRequests ?? 2,
      cacheHits: stats.cacheHits ?? 100,
      cacheMisses: stats.cacheMisses ?? 10,
      hitRate: stats.hitRate ?? 0.91,
    }),
  } as unknown as PrerenderBufferManager;
}

describe('ViewerPrerender', () => {
  describe('createFrameLoader', () => {
    it('should return null when no current source', () => {
      const session = createMockSession(null);
      const loader = createFrameLoader(session);

      const result = loader(5);

      expect(result).toBeNull();
    });

    it('should load frame for sequence source', () => {
      const source = createMockMediaSource('sequence');
      const session = createMockSession(source);
      const loader = createFrameLoader(session);

      const result = loader(10);

      expect(session.getSequenceFrameSync).toHaveBeenCalled();
      expect(result).not.toBeNull();
    });

    it('should not modify session.currentFrame when loading for sequence', () => {
      const source = createMockMediaSource('sequence');
      const session = createMockSession(source);
      session.currentFrame = 5;

      // Track if currentFrame setter was called
      let setterCalled = false;
      const originalFrame = session.currentFrame;
      Object.defineProperty(session, 'currentFrame', {
        get: () => originalFrame,
        set: () => { setterCalled = true; },
        configurable: true,
      });

      const loader = createFrameLoader(session);

      loader(20);

      // Verify that currentFrame setter was NEVER called
      // (The old implementation would save/restore frame, calling setter twice)
      expect(setterCalled).toBe(false);
    });

    it('should pass frame parameter directly to getSequenceFrameSync', () => {
      const source = createMockMediaSource('sequence');
      const session = createMockSession(source);
      const loader = createFrameLoader(session);

      loader(42);

      // Verify getSequenceFrameSync was called with the frame parameter
      expect(session.getSequenceFrameSync).toHaveBeenCalledWith(42);
    });

    it('should not cause side effects during playback (regression test)', () => {
      // This test verifies the fix for the issue where prerender frame loading
      // during playback would modify session.currentFrame, triggering
      // syncVideoToFrame and frameChanged events that could corrupt playback state
      const source = createMockMediaSource('sequence');
      const session = createMockSession(source);
      session.currentFrame = 10;

      // Mock event emitter to track if frameChanged would be emitted
      const eventEmitter = { emit: vi.fn() };
      (session as any).emit = eventEmitter.emit;

      const loader = createFrameLoader(session);

      // Load multiple different frames (simulating prerender buffer activity)
      loader(5);
      loader(15);
      loader(25);

      // Verify no frameChanged events were emitted
      expect(eventEmitter.emit).not.toHaveBeenCalled();

      // Verify currentFrame is still the original value
      expect(session.currentFrame).toBe(10);
    });

    it('should return null for image source', () => {
      const source = createMockMediaSource('image');
      const session = createMockSession(source);
      const loader = createFrameLoader(session);

      const result = loader(1);

      expect(result).toBeNull();
    });

    it('should return null for video without mediabunny', () => {
      const source = createMockMediaSource('video');
      const session = createMockSession(source);
      const loader = createFrameLoader(session);

      const result = loader(5);

      expect(result).toBeNull();
    });

    it('should get canvas for video with mediabunny', () => {
      const source = createMockMediaSource('video');
      const session = createMockSession(source);
      (session.isUsingMediabunny as any).mockReturnValue(true);
      const mockCanvas = document.createElement('canvas');
      (session.getVideoFrameCanvas as any).mockReturnValue(mockCanvas);
      const loader = createFrameLoader(session);

      const result = loader(15);

      expect(session.getVideoFrameCanvas).toHaveBeenCalledWith(15);
      expect(result).toBe(mockCanvas);
    });

    it('should handle errors gracefully', () => {
      const source = createMockMediaSource('sequence');
      const session = createMockSession(source);
      (session.getSequenceFrameSync as any).mockImplementation(() => {
        throw new Error('Test error');
      });
      const loader = createFrameLoader(session);

      // Should not throw
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = loader(5);

      expect(result).toBeNull();
      expect(consoleWarn).toHaveBeenCalled();
      consoleWarn.mockRestore();
    });

    it('should return null when getSequenceFrameSync is not a function', () => {
      const source = createMockMediaSource('sequence');
      const session = createMockSession(source);
      (session as any).getSequenceFrameSync = undefined;
      const loader = createFrameLoader(session);

      const result = loader(5);

      expect(result).toBeNull();
    });
  });

  describe('buildEffectsState', () => {
    it('should build complete effects state', () => {
      const colorAdjustments = createDefaultColorAdjustments();
      const cdlValues = createDefaultCDLValues();
      const curvesData = createDefaultCurvesData();
      const filterSettings = createDefaultFilterSettings();
      const channelMode: ChannelMode = 'rgb';
      const colorWheels = createMockColorWheels();
      const hslQualifier = createMockHSLQualifier();
      const toneMappingState = createDefaultToneMappingState();

      const result = buildEffectsState(
        colorAdjustments,
        cdlValues,
        curvesData,
        filterSettings,
        channelMode,
        colorWheels,
        hslQualifier,
        toneMappingState
      );

      expect(result.colorAdjustments).toEqual(colorAdjustments);
      expect(result.cdlValues).toEqual(cdlValues);
      expect(result.filterSettings).toEqual(filterSettings);
      expect(result.channelMode).toBe('rgb');
      expect(colorWheels.getState).toHaveBeenCalled();
      expect(hslQualifier.getState).toHaveBeenCalled();
      expect(result.toneMappingState).toEqual(toneMappingState);
    });

    it('should create deep copy of color adjustments', () => {
      const colorAdjustments = createDefaultColorAdjustments();
      colorAdjustments.brightness = 0.5;

      const result = buildEffectsState(
        colorAdjustments,
        createDefaultCDLValues(),
        createDefaultCurvesData(),
        createDefaultFilterSettings(),
        'rgb',
        createMockColorWheels(),
        createMockHSLQualifier(),
        createDefaultToneMappingState()
      );

      // Modify original - should not affect result
      colorAdjustments.brightness = 1.0;
      expect(result.colorAdjustments.brightness).toBe(0.5);
    });

    it('should create deep copy of CDL values', () => {
      const cdlValues = createDefaultCDLValues();
      cdlValues.slope.r = 1.5;

      const result = buildEffectsState(
        createDefaultColorAdjustments(),
        cdlValues,
        createDefaultCurvesData(),
        createDefaultFilterSettings(),
        'rgb',
        createMockColorWheels(),
        createMockHSLQualifier(),
        createDefaultToneMappingState()
      );

      // Modify original - should not affect result
      cdlValues.slope.r = 2.0;
      expect(result.cdlValues.slope.r).toBe(1.5);
    });

    it('should create deep copy of curves data', () => {
      const curvesData = createDefaultCurvesData();
      curvesData.master.points.push({ x: 0.5, y: 0.6 });

      const result = buildEffectsState(
        createDefaultColorAdjustments(),
        createDefaultCDLValues(),
        curvesData,
        createDefaultFilterSettings(),
        'rgb',
        createMockColorWheels(),
        createMockHSLQualifier(),
        createDefaultToneMappingState()
      );

      // Modify original - should not affect result
      curvesData.master.points.push({ x: 0.7, y: 0.8 });
      expect(result.curvesData.master.points.length).toBe(3);
    });

    it('should preserve channel mode value', () => {
      const modes: ChannelMode[] = ['rgb', 'red', 'green', 'blue', 'alpha', 'luminance'];

      for (const mode of modes) {
        const result = buildEffectsState(
          createDefaultColorAdjustments(),
          createDefaultCDLValues(),
          createDefaultCurvesData(),
          createDefaultFilterSettings(),
          mode,
          createMockColorWheels(),
          createMockHSLQualifier(),
          createDefaultToneMappingState()
        );

        expect(result.channelMode).toBe(mode);
      }
    });

    it('should create deep copy of tone mapping state', () => {
      const toneMappingState: ToneMappingState = { enabled: true, operator: 'reinhard' };

      const result = buildEffectsState(
        createDefaultColorAdjustments(),
        createDefaultCDLValues(),
        createDefaultCurvesData(),
        createDefaultFilterSettings(),
        'rgb',
        createMockColorWheels(),
        createMockHSLQualifier(),
        toneMappingState
      );

      // Modify original - should not affect result
      toneMappingState.operator = 'aces';
      expect(result.toneMappingState.operator).toBe('reinhard');
    });
  });

  describe('getPrerenderStats', () => {
    it('should return null when no prerender buffer', () => {
      const result = getPrerenderStats(null, 100, 1920, 1080);

      expect(result).toBeNull();
    });

    it('should return stats from prerender buffer', () => {
      const prerenderBuffer = createMockPrerenderBuffer({
        cacheSize: 25,
        pendingRequests: 5,
        activeRequests: 3,
        cacheHits: 200,
        cacheMisses: 20,
        hitRate: 0.91,
      });

      const result = getPrerenderStats(prerenderBuffer, 100, 1920, 1080);

      expect(result).not.toBeNull();
      expect(result!.cacheSize).toBe(25);
      expect(result!.totalFrames).toBe(100);
      expect(result!.pendingRequests).toBe(5);
      expect(result!.activeRequests).toBe(3);
      expect(result!.cacheHits).toBe(200);
      expect(result!.cacheMisses).toBe(20);
      expect(result!.hitRate).toBe(0.91);
    });

    it('should calculate memory size correctly', () => {
      const prerenderBuffer = createMockPrerenderBuffer({ cacheSize: 10 });

      // 1920 * 1080 * 4 bytes * 10 frames / (1024 * 1024) = ~79.1 MB
      const result = getPrerenderStats(prerenderBuffer, 100, 1920, 1080);

      expect(result).not.toBeNull();
      expect(result!.memorySizeMB).toBeCloseTo(79.1, 0);
    });

    it('should return zero memory for zero cache size', () => {
      const prerenderBuffer = createMockPrerenderBuffer({ cacheSize: 0 });

      const result = getPrerenderStats(prerenderBuffer, 100, 1920, 1080);

      expect(result).not.toBeNull();
      expect(result!.memorySizeMB).toBe(0);
    });

    it('should return zero memory for zero dimensions', () => {
      const prerenderBuffer = createMockPrerenderBuffer({ cacheSize: 10 });

      const result = getPrerenderStats(prerenderBuffer, 100, 0, 0);

      expect(result).not.toBeNull();
      expect(result!.memorySizeMB).toBe(0);
    });

    it('should handle small source dimensions', () => {
      const prerenderBuffer = createMockPrerenderBuffer({ cacheSize: 100 });

      // 100 * 100 * 4 bytes * 100 frames / (1024 * 1024) = ~3.8 MB
      const result = getPrerenderStats(prerenderBuffer, 100, 100, 100);

      expect(result).not.toBeNull();
      expect(result!.memorySizeMB).toBeCloseTo(3.8, 0);
    });
  });

  describe('EFFECTS_DEBOUNCE_MS', () => {
    it('should be a reasonable debounce value', () => {
      expect(EFFECTS_DEBOUNCE_MS).toBe(50);
      expect(EFFECTS_DEBOUNCE_MS).toBeGreaterThan(0);
      expect(EFFECTS_DEBOUNCE_MS).toBeLessThan(500);
    });
  });
});
