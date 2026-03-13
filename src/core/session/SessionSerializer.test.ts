/**
 * SessionSerializer Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionSerializer, type SessionComponents } from './SessionSerializer';
import type { SessionState } from './SessionState';
import { SESSION_STATE_VERSION } from './SessionState';
import { PaintEngine } from '../../paint/PaintEngine';
import { DEFAULT_TONE_MAPPING_STATE } from '../../core/types/effects';
import { DEFAULT_GAMUT_MAPPING_STATE } from '../../core/types/effects';
import { DEFAULT_STEREO_STATE } from '../../core/types/stereo';
import { DEFAULT_GHOST_FRAME_STATE } from '../../ui/components/GhostFrameControl';
import { DEFAULT_DISPLAY_COLOR_STATE } from '../../color/DisplayTransfer';
import { DEFAULT_DIFFERENCE_MATTE_STATE } from '../../ui/components/DifferenceMatteControl';
import { DEFAULT_BLEND_MODE_STATE } from '../../ui/components/ComparisonManager';
import { createDefaultCurvesData } from '../../color/ColorCurves';
import { DEFAULT_STEREO_EYE_TRANSFORM_STATE, DEFAULT_STEREO_ALIGN_MODE } from '../../stereo/StereoRenderer';
import { LUTPipeline } from '../../color/pipeline/LUTPipeline';
import { SUPPORTED_MEDIA_ACCEPT } from '../../utils/media/SupportedMediaFormats';

// Mock the showFileReloadPrompt dialog
vi.mock('../../ui/components/shared/Modal', () => ({
  showFileReloadPrompt: vi.fn(),
  showSequenceReloadPrompt: vi.fn(),
}));

import { showFileReloadPrompt } from '../../ui/components/shared/Modal';

describe('SessionSerializer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  describe('createEmpty', () => {
    it('creates empty session state with defaults', () => {
      const state = SessionSerializer.createEmpty('Test Project');

      expect(state.name).toBe('Test Project');
      expect(state.version).toBe(SESSION_STATE_VERSION);
      expect(state.media).toEqual([]);
      expect(state.playback).toBeDefined();
      expect(state.paint).toBeDefined();
      expect(state.view).toBeDefined();
      expect(state.color).toBeDefined();
      expect(state.cdl).toBeDefined();
      expect(state.filters).toBeDefined();
      expect(state.transform).toBeDefined();
      expect(state.crop).toBeDefined();
      expect(state.lens).toBeDefined();
      expect(state.wipe).toBeDefined();
      expect(state.stack).toEqual([]);
      expect(state.lutIntensity).toBe(1.0);
    });

    it('uses "Untitled" as default name', () => {
      const state = SessionSerializer.createEmpty();
      expect(state.name).toBe('Untitled');
    });

    it('sets timestamps', () => {
      const before = new Date().toISOString();
      const state = SessionSerializer.createEmpty();
      const after = new Date().toISOString();

      expect(state.createdAt >= before).toBe(true);
      expect(state.createdAt <= after).toBe(true);
      expect(state.modifiedAt >= before).toBe(true);
      expect(state.modifiedAt <= after).toBe(true);
    });
  });

  describe('loadFromFile', () => {
    it('SER-001: parses valid project file', async () => {
      const validState = SessionSerializer.createEmpty('ValidProject');
      const json = JSON.stringify(validState);
      const file = new File([json], 'test.orvproject', { type: 'application/json' });

      const loaded = await SessionSerializer.loadFromFile(file);

      expect(loaded.name).toBe('ValidProject');
      expect(loaded.version).toBe(SESSION_STATE_VERSION);
    });

    it('SER-004: throws error for invalid JSON', async () => {
      const file = new File(['not valid json'], 'test.orvproject');

      await expect(SessionSerializer.loadFromFile(file)).rejects.toThrow();
    });

    it('throws error for missing version', async () => {
      const invalidState = { media: [], playback: {} };
      const json = JSON.stringify(invalidState);
      const file = new File([json], 'test.orvproject');

      await expect(SessionSerializer.loadFromFile(file)).rejects.toThrow('missing version');
    });

    it('throws error for missing media array', async () => {
      const invalidState = { version: 1, playback: {} };
      const json = JSON.stringify(invalidState);
      const file = new File([json], 'test.orvproject');

      await expect(SessionSerializer.loadFromFile(file)).rejects.toThrow('missing media array');
    });

    it('throws error for missing playback state', async () => {
      const invalidState = { version: 1, media: [] };
      const json = JSON.stringify(invalidState);
      const file = new File([json], 'test.orvproject');

      await expect(SessionSerializer.loadFromFile(file)).rejects.toThrow('missing playback state');
    });
  });

  describe('saveToFile', () => {
    it('creates downloadable file', async () => {
      const state = SessionSerializer.createEmpty('TestSave');

      // Mock DOM methods
      const mockClick = vi.fn();
      const mockAppendChild = vi.fn();
      const mockRemoveChild = vi.fn();

      vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        download: '',
        click: mockClick,
      } as unknown as HTMLAnchorElement);

      vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);
      vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild);

      await SessionSerializer.saveToFile(state, 'test');

      expect(mockClick).toHaveBeenCalled();
      expect(mockAppendChild).toHaveBeenCalled();
      expect(mockRemoveChild).toHaveBeenCalled();
    });

    it('adds .orvproject extension if missing', async () => {
      const state = SessionSerializer.createEmpty();

      let capturedDownload = '';
      vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        set download(val: string) {
          capturedDownload = val;
        },
        get download() {
          return capturedDownload;
        },
        click: vi.fn(),
      } as unknown as HTMLAnchorElement);

      vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn());
      vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn());

      await SessionSerializer.saveToFile(state, 'myproject');

      expect(capturedDownload).toBe('myproject.orvproject');
    });

    it('does not duplicate .orvproject extension', async () => {
      const state = SessionSerializer.createEmpty();

      let capturedDownload = '';
      vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        set download(val: string) {
          capturedDownload = val;
        },
        get download() {
          return capturedDownload;
        },
        click: vi.fn(),
      } as unknown as HTMLAnchorElement);

      vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn());
      vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn());

      await SessionSerializer.saveToFile(state, 'myproject.orvproject');

      expect(capturedDownload).toBe('myproject.orvproject');
    });
  });

  describe('round-trip', () => {
    it('SER-003: preserves data through save/load cycle', async () => {
      const original = SessionSerializer.createEmpty('RoundTripTest');

      // Modify some values
      original.playback.fps = 30;
      original.playback.loopMode = 'pingpong';
      original.color.exposure = 0.5;
      original.view.zoom = 2.0;

      // Simulate save/load
      const json = JSON.stringify(original);
      const file = new File([json], 'test.orvproject');
      const loaded = await SessionSerializer.loadFromFile(file);

      expect(loaded.name).toBe('RoundTripTest');
      expect(loaded.playback.fps).toBe(30);
      expect(loaded.playback.loopMode).toBe('pingpong');
      expect(loaded.color.exposure).toBe(0.5);
      expect(loaded.view.zoom).toBe(2.0);
    });
  });

  describe('migration', () => {
    it('SER-005: handles missing fields with defaults', async () => {
      // Create minimal valid state (older version format)
      const minimalState: Partial<SessionState> = {
        version: 1,
        name: 'Minimal',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        media: [],
        playback: {
          currentFrame: 1,
          inPoint: 1,
          outPoint: 1,
          fps: 24,
          loopMode: 'loop',
          volume: 1,
          muted: false,
          marks: [],
          currentSourceIndex: 0,
        } as any,
      };

      // migrate is private, but testing via fromJSON (which calls migrate)
      const components = createMockComponents();
      const state = minimalState as SessionState;
      const result = await SessionSerializer.fromJSON(state, components);

      expect(result.loadedMedia).toBe(0);
      expect(components.viewer.setZoom).toHaveBeenCalled();
    });

    it('SER-010: handles older version migration', async () => {
      const components = createMockComponents();
      const oldState = SessionSerializer.createEmpty();
      (oldState as any).version = 0; // Older than current

      await expect(SessionSerializer.fromJSON(oldState, components)).resolves.not.toThrow();
    });
  });

  describe('toJSON', () => {
    it('SER-006: serializes all components correctly', () => {
      const components = createMockComponents();
      const state = SessionSerializer.toJSON(components, 'TestProject');

      expect(state.name).toBe('TestProject');
      expect(state.view.zoom).toBe(1.5);
      expect(state.media.length).toBe(1);
      expect(state.media[0]?.path).toBe('test.mp4');
    });

    it('SER-007: serializes sequence info', () => {
      const components = createMockComponents();
      (components.session as any).allSources = [
        {
          url: 'frame.%04d.jpg',
          name: 'seq',
          type: 'sequence',
          width: 100,
          height: 100,
          duration: 10,
          fps: 24,
          sequenceInfo: {
            pattern: 'frame.%04d.jpg',
            startFrame: 1,
            endFrame: 10,
          },
        },
      ];

      const state = SessionSerializer.toJSON(components);
      expect(state.media[0]?.sequencePattern).toBe('frame.%04d.jpg');
      expect(state.media[0]?.frameRange?.start).toBe(1);
    });

    it('SER-012: serializes LUT path', () => {
      const components = createMockComponents();
      (components.viewer.getLUT as any).mockReturnValue({ title: 'test.cube' });

      const state = SessionSerializer.toJSON(components);
      expect(state.lutPath).toBe('test.cube');
    });

    it('SER-012b: serializes noise reduction and watermark state', () => {
      const components = createMockComponents();
      const noise = { strength: 33, luminanceStrength: 60, chromaStrength: 80, radius: 3 };
      const watermark = {
        enabled: true,
        imageUrl: 'https://example.com/wm.png',
        position: 'top-right' as const,
        customX: 0.9,
        customY: 0.1,
        scale: 0.5,
        opacity: 0.4,
        margin: 12,
      };
      (components.viewer.getNoiseReductionParams as ReturnType<typeof vi.fn>).mockReturnValue(noise);
      (components.viewer.getWatermarkState as ReturnType<typeof vi.fn>).mockReturnValue(watermark);

      const state = SessionSerializer.toJSON(components);
      expect(state.noiseReduction).toEqual(noise);
      expect(state.watermark).toEqual(watermark);
    });

    it('SER-013: marks blob URLs with requiresReload and clears path', () => {
      const components = createMockComponents();
      (components.session as any).allSources = [
        {
          url: 'blob:http://localhost:3000/abc-123',
          name: 'local-image.png',
          type: 'image',
          width: 100,
          height: 100,
          duration: 1,
          fps: 1,
        },
      ];

      const state = SessionSerializer.toJSON(components);

      expect(state.media[0]?.path).toBe(''); // Blob URL cleared
      expect(state.media[0]?.requiresReload).toBe(true);
      expect(state.media[0]?.name).toBe('local-image.png');
    });

    it('SER-014: does not set requiresReload for non-blob URLs', () => {
      const components = createMockComponents();
      (components.session as any).allSources = [
        {
          url: 'https://example.com/video.mp4',
          name: 'remote-video.mp4',
          type: 'video',
          width: 1920,
          height: 1080,
          duration: 100,
          fps: 24,
        },
      ];

      const state = SessionSerializer.toJSON(components);

      expect(state.media[0]?.path).toBe('https://example.com/video.mp4');
      expect(state.media[0]?.requiresReload).toBeUndefined(); // Not set at all
    });

    it('SER-015: serializes playlist state when playlist manager is available', () => {
      const components = createMockComponents();
      const playlistState = {
        clips: [
          {
            id: 'clip-1',
            sourceIndex: 0,
            sourceName: 'shot',
            inPoint: 1,
            outPoint: 24,
            globalStartFrame: 1,
            duration: 24,
          },
        ],
        enabled: true,
        currentFrame: 12,
        loopMode: 'all',
      } as const;

      components.playlistManager = {
        getState: vi.fn().mockReturnValue(playlistState),
      } as any;

      const state = SessionSerializer.toJSON(components);
      expect(state.playlist).toEqual(playlistState);
    });
  });

  describe('fromJSON', () => {
    it('SER-008: restores state correctly (video, image, sequence)', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty('TestProject');
      state.media = [
        { name: 'video', path: 'video.mp4', type: 'video', width: 1920, height: 1080, duration: 100, fps: 24 },
        { name: 'img', path: 'image.jpg', type: 'image', width: 100, height: 100, duration: 1, fps: 1 },
        { name: 'seq', path: 'seq.jpg', type: 'sequence', width: 100, height: 100, duration: 10, fps: 24 },
      ];

      const result = await SessionSerializer.fromJSON(state, components);

      // video + img loaded; sequence requires manual selection
      expect(result.loadedMedia).toBe(2);
      // Warnings: 1 for sequence (no gap warning since all defaults — fix #137)
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toContain('seq');
      expect(components.session.loadVideo).toHaveBeenCalledWith('video', 'video.mp4');
      expect(components.session.loadImage).toHaveBeenCalledWith('img', 'image.jpg');
      expect(components.viewer.setZoom).toHaveBeenCalled();
      expect(components.paintEngine.loadFromAnnotations).toHaveBeenCalled();
    });

    it('SER-008b: warns on unexpected blob URL in saved project (defensive)', async () => {
      // This tests the defensive check for blob URLs that weren't properly
      // converted to requiresReload during save (indicates a serialization bug)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const components = createMockComponents();
      const state = SessionSerializer.createEmpty('TestProject');
      state.media = [
        { name: 'blob.png', path: 'blob:xxx', type: 'image', width: 100, height: 100, duration: 1, fps: 1 },
      ];

      const result = await SessionSerializer.fromJSON(state, components);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unexpected blob URL in saved project'));
      expect(result.loadedMedia).toBe(0);
      expect(result.warnings).toContain('Cannot load blob URL: blob.png');
      expect(showFileReloadPrompt).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('SER-008c: prompts user to reload requiresReload files', async () => {
      const mockFile = new File(['test'], 'local.mp4', { type: 'video/mp4' });
      (showFileReloadPrompt as ReturnType<typeof vi.fn>).mockResolvedValue(mockFile);

      const components = createMockComponents();
      const state = SessionSerializer.createEmpty('TestProject');
      state.media = [
        {
          name: 'local.mp4',
          path: '',
          type: 'video',
          width: 1920,
          height: 1080,
          duration: 100,
          fps: 24,
          requiresReload: true,
        },
      ];

      const result = await SessionSerializer.fromJSON(state, components);

      expect(showFileReloadPrompt).toHaveBeenCalledWith(
        'local.mp4',
        expect.objectContaining({
          title: 'Reload File',
          accept: SUPPORTED_MEDIA_ACCEPT,
        }),
      );
      expect(result.loadedMedia).toBe(1);
      expect(components.session.loadFile).toHaveBeenCalledWith(mockFile);
    });

    it('SER-008d: adds warning when user skips file reload', async () => {
      (showFileReloadPrompt as ReturnType<typeof vi.fn>).mockResolvedValue(null); // User skipped

      const components = createMockComponents();
      const state = SessionSerializer.createEmpty('TestProject');
      state.media = [
        {
          name: 'skipped.png',
          path: '',
          type: 'image',
          width: 100,
          height: 100,
          duration: 1,
          fps: 1,
          requiresReload: true,
        },
      ];

      const result = await SessionSerializer.fromJSON(state, components);

      expect(showFileReloadPrompt).toHaveBeenCalled();
      expect(result.loadedMedia).toBe(0);
      expect(result.warnings).toContain('Skipped reload: skipped.png');
    });

    it('SER-008e: handles loadFile failure during reload gracefully', async () => {
      const mockFile = new File(['test'], 'failing.png', { type: 'image/png' });
      (showFileReloadPrompt as ReturnType<typeof vi.fn>).mockResolvedValue(mockFile);

      const components = createMockComponents();
      (components.session.loadFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Load failed'));

      const state = SessionSerializer.createEmpty('TestProject');
      state.media = [
        {
          name: 'failing.png',
          path: '',
          type: 'image',
          width: 100,
          height: 100,
          duration: 1,
          fps: 1,
          requiresReload: true,
        },
      ];

      const result = await SessionSerializer.fromJSON(state, components);

      expect(showFileReloadPrompt).toHaveBeenCalled();
      expect(components.session.loadFile).toHaveBeenCalledWith(mockFile);
      expect(result.loadedMedia).toBe(0);
      expect(result.warnings).toContain('Failed to reload: failing.png');
    });

    it('SER-008f: handles multiple requiresReload files sequentially', async () => {
      const mockFile1 = new File(['test1'], 'image1.png', { type: 'image/png' });
      const mockFile3 = new File(['test3'], 'image2.png', { type: 'image/png' });

      // Return different files for each call, skip the second one (no file needed for skip)
      (showFileReloadPrompt as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockFile1) // First file - user provides
        .mockResolvedValueOnce(null) // Second file - user skips (returns null)
        .mockResolvedValueOnce(mockFile3); // Third file - user provides

      const components = createMockComponents();
      const state = SessionSerializer.createEmpty('TestProject');
      state.media = [
        {
          name: 'image1.png',
          path: '',
          type: 'image',
          width: 100,
          height: 100,
          duration: 1,
          fps: 1,
          requiresReload: true,
        },
        {
          name: 'video1.mp4',
          path: '',
          type: 'video',
          width: 1920,
          height: 1080,
          duration: 100,
          fps: 24,
          requiresReload: true,
        },
        {
          name: 'image2.png',
          path: '',
          type: 'image',
          width: 200,
          height: 200,
          duration: 1,
          fps: 1,
          requiresReload: true,
        },
      ];

      const result = await SessionSerializer.fromJSON(state, components);

      // Verify all three prompts were shown
      expect(showFileReloadPrompt).toHaveBeenCalledTimes(3);
      expect(showFileReloadPrompt).toHaveBeenNthCalledWith(
        1,
        'image1.png',
        expect.objectContaining({ accept: SUPPORTED_MEDIA_ACCEPT }),
      );
      expect(showFileReloadPrompt).toHaveBeenNthCalledWith(
        2,
        'video1.mp4',
        expect.objectContaining({ accept: SUPPORTED_MEDIA_ACCEPT }),
      );
      expect(showFileReloadPrompt).toHaveBeenNthCalledWith(
        3,
        'image2.png',
        expect.objectContaining({ accept: SUPPORTED_MEDIA_ACCEPT }),
      );

      // Verify loadFile was called for files 1 and 3 (not 2 which was skipped)
      expect(components.session.loadFile).toHaveBeenCalledTimes(2);
      expect(components.session.loadFile).toHaveBeenNthCalledWith(1, mockFile1);
      expect(components.session.loadFile).toHaveBeenNthCalledWith(2, mockFile3);

      // Two files loaded, one skipped (no gap warning since all defaults — fix #137)
      expect(result.loadedMedia).toBe(2);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings).toContain('Skipped reload: video1.mp4');
    });

    it('SER-009: handles load failures', async () => {
      const components = createMockComponents();
      (components.session.loadVideo as any).mockRejectedValue(new Error('Fail'));

      const state = SessionSerializer.createEmpty();
      state.media = [
        { name: 'video', path: 'video.mp4', type: 'video', width: 1920, height: 1080, duration: 100, fps: 24 },
      ];

      const result = await SessionSerializer.fromJSON(state, components);
      expect(result.loadedMedia).toBe(0);
      expect(result.warnings[0]).toContain('Failed to load');
    });

    it('SER-011: warns about LUT path with actionable message', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();
      state.lutPath = 'my.cube';

      const result = await SessionSerializer.fromJSON(state, components);
      // 1 LUT warning only (no gap warning since all defaults — fix #137)
      expect(result.warnings).toHaveLength(1);
      const warning = result.warnings[0]!;
      expect(warning).toContain('my.cube');
      expect(warning).toContain('reloaded manually');
      expect(warning).toContain('intensity setting has been preserved');
    });

    it('SER-011-LUT-001: LUT title is preserved in serialization', () => {
      const components = createMockComponents();
      (components.viewer.getLUT as ReturnType<typeof vi.fn>).mockReturnValue({ title: 'FilmGrade.cube' });

      const state = SessionSerializer.toJSON(components, 'LutTest');
      expect(state.lutPath).toBe('FilmGrade.cube');
    });

    it('SER-011-LUT-002: no LUT warning emitted when no LUT was active', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();
      // lutPath is undefined by default

      const result = await SessionSerializer.fromJSON(state, components);
      const lutWarnings = result.warnings.filter((w) => w.toLowerCase().includes('lut'));
      expect(lutWarnings).toHaveLength(0);
    });

    it('SER-011-LUT-003: LUT warning includes intensity when not default', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();
      state.lutPath = 'LogC.cube';
      state.lutIntensity = 0.75;

      const result = await SessionSerializer.fromJSON(state, components);
      // 1 LUT warning only (no gap warning since all defaults — fix #137)
      expect(result.warnings).toHaveLength(1);
      const warning = result.warnings[0]!;
      expect(warning).toContain('LogC.cube');
      expect(warning).toContain('intensity was 0.75');
    });

    it('SER-011-LUT-004: LUT warning omits intensity note when intensity is 1.0', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();
      state.lutPath = 'Default.cube';
      state.lutIntensity = 1.0;

      const result = await SessionSerializer.fromJSON(state, components);
      const warning = result.warnings[0]!;
      expect(warning).not.toContain('intensity was');
    });

    it('SER-011-LUT-005: lutIntensity is still applied on restore even without LUT binary', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();
      state.lutPath = 'test.cube';
      state.lutIntensity = 0.5;

      await SessionSerializer.fromJSON(state, components);
      expect(components.viewer.setLUTIntensity).toHaveBeenCalledWith(0.5);
    });

    it('SER-011a: restores noise reduction and watermark state', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();
      state.noiseReduction = { strength: 45, luminanceStrength: 55, chromaStrength: 82, radius: 4 };
      state.watermark = {
        enabled: true,
        imageUrl: 'https://example.com/watermark.png',
        position: 'bottom-right',
        customX: 0.9,
        customY: 0.9,
        scale: 1,
        opacity: 0.8,
        margin: 16,
      };

      await SessionSerializer.fromJSON(state, components);
      expect(components.viewer.setNoiseReductionParams).toHaveBeenCalledWith(state.noiseReduction);
      expect(components.viewer.setWatermarkState).toHaveBeenCalledWith(state.watermark);
    });

    it('SER-011b: restores playlist state when playlist manager is available', async () => {
      const components = createMockComponents();
      const setState = vi.fn();

      components.playlistManager = {
        setState,
        clear: vi.fn(),
        setEnabled: vi.fn(),
        setLoopMode: vi.fn(),
        setCurrentFrame: vi.fn(),
      } as any;

      const state = SessionSerializer.createEmpty();
      state.playlist = {
        clips: [
          {
            id: 'clip-1',
            sourceIndex: 0,
            sourceName: 'shot',
            inPoint: 5,
            outPoint: 15,
            globalStartFrame: 1,
            duration: 11,
          },
        ],
        enabled: true,
        currentFrame: 7,
        loopMode: 'single',
      };

      await SessionSerializer.fromJSON(state, components);
      expect(setState).toHaveBeenCalledWith(state.playlist);
    });

    it('SER-011c: clears playlist manager when project has no playlist state', async () => {
      const components = createMockComponents();
      const clear = vi.fn();
      const setEnabled = vi.fn();
      const setLoopMode = vi.fn();
      const setCurrentFrame = vi.fn();

      components.playlistManager = {
        setState: vi.fn(),
        clear,
        setEnabled,
        setLoopMode,
        setCurrentFrame,
      } as any;

      const state = SessionSerializer.createEmpty();
      delete state.playlist;

      await SessionSerializer.fromJSON(state, components);
      expect(clear).toHaveBeenCalledTimes(1);
      expect(setEnabled).toHaveBeenCalledWith(false);
      expect(setLoopMode).toHaveBeenCalledWith('none');
      expect(setCurrentFrame).toHaveBeenCalledWith(1);
    });
  });

  // =================================================================
  // Serialization Gaps — transparency for unsaved viewer state
  // =================================================================

  describe('getSerializationGaps', () => {
    it('SER-GAP-001: returns all known gap categories', () => {
      const components = createMockComponents();
      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);

      expect(gaps.length).toBeGreaterThanOrEqual(13);

      const names = gaps.map((g) => g.name);
      expect(names).toContain('OCIO configuration');
      expect(names).toContain('Display profile');
      expect(names).toContain('Gamut mapping');
      expect(names).toContain('Color inversion');
      expect(names).toContain('Curves');
      expect(names).toContain('Tone mapping');
      expect(names).toContain('Ghost frames');
      expect(names).toContain('Stereo mode');
      expect(names).toContain('Stereo eye transforms');
      expect(names).toContain('Stereo align mode');
      expect(names).toContain('Channel isolation');
      expect(names).toContain('Difference matte');
      expect(names).toContain('Blend mode');
    });

    it('SER-GAP-002: all gaps report inactive when viewer is at defaults', () => {
      const components = createMockComponents();
      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);

      for (const gap of gaps) {
        expect(gap.isActive).toBe(false);
      }
    });

    it('SER-GAP-003: detects active OCIO', () => {
      const components = createMockComponents();
      (components.viewer.isOCIOEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const ocio = gaps.find((g) => g.name === 'OCIO configuration')!;
      expect(ocio.isActive).toBe(true);
      expect(ocio.category).toBe('color');
    });

    it('SER-GAP-004: detects active tone mapping', () => {
      const components = createMockComponents();
      (components.viewer.getToneMappingState as ReturnType<typeof vi.fn>).mockReturnValue({
        ...DEFAULT_TONE_MAPPING_STATE,
        enabled: true,
        operator: 'aces',
      });

      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const tm = gaps.find((g) => g.name === 'Tone mapping')!;
      expect(tm.isActive).toBe(true);
      expect(tm.category).toBe('view');
    });

    it('SER-GAP-005: detects active stereo mode', () => {
      const components = createMockComponents();
      (components.viewer.getStereoState as ReturnType<typeof vi.fn>).mockReturnValue({
        mode: 'anaglyph',
        eyeSwap: false,
        offset: 0,
      });

      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const stereo = gaps.find((g) => g.name === 'Stereo mode')!;
      expect(stereo.isActive).toBe(true);
    });

    it('SER-GAP-006: detects active ghost frames', () => {
      const components = createMockComponents();
      (components.viewer.getGhostFrameState as ReturnType<typeof vi.fn>).mockReturnValue({
        ...DEFAULT_GHOST_FRAME_STATE,
        enabled: true,
      });

      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const ghost = gaps.find((g) => g.name === 'Ghost frames')!;
      expect(ghost.isActive).toBe(true);
    });

    it('SER-GAP-007: detects active channel isolation', () => {
      const components = createMockComponents();
      (components.viewer.getChannelMode as ReturnType<typeof vi.fn>).mockReturnValue('red');

      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const channel = gaps.find((g) => g.name === 'Channel isolation')!;
      expect(channel.isActive).toBe(true);
    });

    it('SER-GAP-008: detects active difference matte', () => {
      const components = createMockComponents();
      (components.viewer.getDifferenceMatteState as ReturnType<typeof vi.fn>).mockReturnValue({
        ...DEFAULT_DIFFERENCE_MATTE_STATE,
        enabled: true,
      });

      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const dm = gaps.find((g) => g.name === 'Difference matte')!;
      expect(dm.isActive).toBe(true);
      expect(dm.category).toBe('compare');
    });

    it('SER-GAP-009: detects active blend mode', () => {
      const components = createMockComponents();
      (components.viewer.getBlendModeState as ReturnType<typeof vi.fn>).mockReturnValue({
        ...DEFAULT_BLEND_MODE_STATE,
        mode: 'multiply',
        flickerFrame: 0,
      });

      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const bm = gaps.find((g) => g.name === 'Blend mode')!;
      expect(bm.isActive).toBe(true);
    });

    it('SER-GAP-010: detects active display profile', () => {
      const components = createMockComponents();
      (components.viewer.getDisplayColorState as ReturnType<typeof vi.fn>).mockReturnValue({
        ...DEFAULT_DISPLAY_COLOR_STATE,
        displayGamma: 2.2,
      });

      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const dp = gaps.find((g) => g.name === 'Display profile')!;
      expect(dp.isActive).toBe(true);
    });

    it('SER-GAP-011: detects active gamut mapping', () => {
      const components = createMockComponents();
      (components.viewer.getGamutMappingState as ReturnType<typeof vi.fn>).mockReturnValue({
        ...DEFAULT_GAMUT_MAPPING_STATE,
        mode: 'clip',
      });

      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const gm = gaps.find((g) => g.name === 'Gamut mapping')!;
      expect(gm.isActive).toBe(true);
    });

    it('SER-GAP-013: detects active color inversion', () => {
      const components = createMockComponents();
      (components.viewer.getColorInversion as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const ci = gaps.find((g) => g.name === 'Color inversion')!;
      expect(ci.isActive).toBe(true);
      expect(ci.category).toBe('color');
    });

    it('SER-GAP-014: detects active curves', () => {
      const components = createMockComponents();
      const nonDefaultCurves = createDefaultCurvesData();
      nonDefaultCurves.master.points = [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.7 },
        { x: 1, y: 1 },
      ];
      (components.viewer.getCurves as ReturnType<typeof vi.fn>).mockReturnValue(nonDefaultCurves);

      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const curves = gaps.find((g) => g.name === 'Curves')!;
      expect(curves.isActive).toBe(true);
      expect(curves.category).toBe('color');
    });

    it('SER-GAP-015: detects active stereo eye transforms', () => {
      const components = createMockComponents();
      (components.viewer.getStereoEyeTransforms as ReturnType<typeof vi.fn>).mockReturnValue({
        left: { flipH: true, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        linked: false,
      });

      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const set = gaps.find((g) => g.name === 'Stereo eye transforms')!;
      expect(set.isActive).toBe(true);
      expect(set.category).toBe('view');
    });

    it('SER-GAP-016: detects active stereo align mode', () => {
      const components = createMockComponents();
      (components.viewer.getStereoAlignMode as ReturnType<typeof vi.fn>).mockReturnValue('grid');

      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const sam = gaps.find((g) => g.name === 'Stereo align mode')!;
      expect(sam.isActive).toBe(true);
      expect(sam.category).toBe('view');
    });

    it('SER-GAP-012: every gap has non-empty impact description', () => {
      const components = createMockComponents();
      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);

      for (const gap of gaps) {
        expect(gap.impact.length).toBeGreaterThan(0);
      }
    });
  });

  describe('toJSON gap warnings', () => {
    it('SER-GAP-020: emits console.warn when active gaps exist during save', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const components = createMockComponents();
      (components.viewer.isOCIOEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (components.viewer.getToneMappingState as ReturnType<typeof vi.fn>).mockReturnValue({
        ...DEFAULT_TONE_MAPPING_STATE,
        enabled: true,
        operator: 'aces',
      });

      SessionSerializer.toJSON(components, 'TestGapWarn');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('OCIO configuration'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tone mapping'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('NOT saved'));

      consoleSpy.mockRestore();
    });

    it('SER-GAP-021: no console.warn when all states are at defaults', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const components = createMockComponents();
      SessionSerializer.toJSON(components, 'TestNoGapWarn');

      // Should not have been called with the serialization gap message
      const gapWarnings = consoleSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('[SessionSerializer]'),
      );
      expect(gapWarnings).toHaveLength(0);

      consoleSpy.mockRestore();
    });
  });

  describe('fromJSON gap warnings', () => {
    it('SER-GAP-030: fromJSON includes gap warning only when active gaps exist (fix #137)', async () => {
      const components = createMockComponents();
      // Make some gaps active
      (components.viewer.isOCIOEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (components.viewer.getToneMappingState as ReturnType<typeof vi.fn>).mockReturnValue({ enabled: true, operator: 'reinhard' });
      const state = SessionSerializer.createEmpty();

      const result = await SessionSerializer.fromJSON(state, components);

      const gapWarning = result.warnings.find((w) => w.includes('not saved in project files'));
      expect(gapWarning).toBeDefined();
      expect(gapWarning).toContain('OCIO configuration');
      expect(gapWarning).toContain('Tone mapping');
    });

    it('SER-GAP-031: fromJSON omits gap warning when all states are at defaults', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();

      const result = await SessionSerializer.fromJSON(state, components);

      const gapWarning = result.warnings.find((w) => w.includes('not saved in project files'));
      expect(gapWarning).toBeUndefined();
    });
  });

  // =================================================================
  // Playback Mode Serialization
  // =================================================================

  describe('playbackMode persistence', () => {
    it('SER-PAF-001: playbackMode round-trips through toJSON/fromJSON', async () => {
      const components = createMockComponents();
      const session = components.session as any;
      session.getPlaybackState = vi.fn().mockReturnValue({
        currentFrame: 1,
        inPoint: 1,
        outPoint: 100,
        fps: 24,
        loopMode: 'loop',
        playbackMode: 'playAllFrames',
        volume: 0.7,
        muted: false,
        preservesPitch: true,
        marks: [],
        currentSourceIndex: 0,
      });

      const state = SessionSerializer.toJSON(components, 'Test');
      expect(state.playback.playbackMode).toBe('playAllFrames');
    });

    it('SER-PAF-002: missing playbackMode defaults to realtime', () => {
      const state = SessionSerializer.createEmpty();
      expect(state.playback.playbackMode).toBe('realtime');
    });

    it('SER-PAF-003: migration preserves playbackMode when present', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();
      state.playback.playbackMode = 'playAllFrames';
      // Must include a source so that loadedMedia > 0 and setPlaybackState is called
      state.media = [
        { type: 'video' as const, path: 'test.mp4', name: 'test', width: 1920, height: 1080, duration: 100, fps: 24 },
      ];

      await SessionSerializer.fromJSON(state, components);

      const setPlaybackState = components.session.setPlaybackState as ReturnType<typeof vi.fn>;
      expect(setPlaybackState).toHaveBeenCalled();
      const arg = setPlaybackState.mock.calls[0]![0];
      expect(arg.playbackMode).toBe('playAllFrames');
    });
  });

  // -----------------------------------------------------------------------
  // Issue #134: representations not restored on load
  // -----------------------------------------------------------------------
  describe('issue #134: representation restoration', () => {
    it('SER-REP-001: fromJSON does not log info about missing representation restoration', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await SessionSerializer.fromJSON(state, components);

      expect(infoSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('representations are saved but not restored'),
      );
      infoSpy.mockRestore();
    });

    it('SER-REP-002: fromJSON restores representations to loaded sources', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();
      state.media = [
        {
          type: 'image' as const,
          path: 'test.exr',
          name: 'test',
          width: 4096,
          height: 2160,
          duration: 1,
          fps: 24,
          representations: [
            {
              id: 'rep-full',
              label: 'EXR Full',
              kind: 'frames' as const,
              priority: 0,
              resolution: { width: 4096, height: 2160 },
              par: 1.0,
              audioTrackPresent: false,
              startFrame: 0,
              loaderConfig: { path: 'test.exr' },
            },
            {
              id: 'rep-proxy',
              label: 'Proxy',
              kind: 'proxy' as const,
              priority: 2,
              resolution: { width: 1920, height: 1080 },
              par: 1.0,
              audioTrackPresent: false,
              startFrame: 0,
              loaderConfig: { url: 'http://example.com/proxy.mp4' },
            },
          ],
          activeRepresentationId: 'rep-proxy',
        },
      ];

      await SessionSerializer.fromJSON(state, components);

      const addRep = components.session.addRepresentationToSource as ReturnType<typeof vi.fn>;
      expect(addRep).toHaveBeenCalledTimes(2);
      expect(addRep).toHaveBeenCalledWith(0, expect.objectContaining({ id: 'rep-full', kind: 'frames' }));
      expect(addRep).toHaveBeenCalledWith(0, expect.objectContaining({ id: 'rep-proxy', kind: 'proxy' }));

      const switchRep = components.session.switchRepresentation as ReturnType<typeof vi.fn>;
      expect(switchRep).toHaveBeenCalledWith(0, 'rep-proxy');
    });

    it('SER-REP-003: fromJSON skips representations for failed media loads', async () => {
      const components = createMockComponents();
      (components.session.loadImage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('load failed'));
      const state = SessionSerializer.createEmpty();
      state.media = [
        {
          type: 'image' as const,
          path: 'missing.exr',
          name: 'missing',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          representations: [
            {
              id: 'rep-1',
              label: 'Full',
              kind: 'frames' as const,
              priority: 0,
              resolution: { width: 1920, height: 1080 },
              par: 1.0,
              audioTrackPresent: false,
              startFrame: 0,
              loaderConfig: { path: 'missing.exr' },
            },
          ],
          activeRepresentationId: 'rep-1',
        },
      ];

      const result = await SessionSerializer.fromJSON(state, components);

      const addRep = components.session.addRepresentationToSource as ReturnType<typeof vi.fn>;
      expect(addRep).not.toHaveBeenCalled();

      const switchRep = components.session.switchRepresentation as ReturnType<typeof vi.fn>;
      expect(switchRep).not.toHaveBeenCalled();

      expect(result.warnings).toContain('Failed to load: missing');
    });

    it('SER-REP-004: fromJSON produces warning when representation switch fails', async () => {
      const components = createMockComponents();
      (components.session.switchRepresentation as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const state = SessionSerializer.createEmpty();
      state.media = [
        {
          type: 'video' as const,
          path: 'test.mp4',
          name: 'test',
          width: 1920,
          height: 1080,
          duration: 100,
          fps: 24,
          representations: [
            {
              id: 'rep-1',
              label: 'Full',
              kind: 'movie' as const,
              priority: 0,
              resolution: { width: 1920, height: 1080 },
              par: 1.0,
              audioTrackPresent: true,
              startFrame: 0,
              loaderConfig: { path: 'test.mp4' },
            },
          ],
          activeRepresentationId: 'rep-1',
        },
      ];

      const result = await SessionSerializer.fromJSON(state, components);

      expect(result.warnings).toContain(
        'Failed to restore active representation "rep-1" for "test"',
      );
    });

    it('SER-REP-005: fromJSON handles media with no representations (no-op)', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();
      state.media = [
        {
          type: 'image' as const,
          path: 'simple.png',
          name: 'simple',
          width: 800,
          height: 600,
          duration: 1,
          fps: 24,
        },
      ];

      await SessionSerializer.fromJSON(state, components);

      const addRep = components.session.addRepresentationToSource as ReturnType<typeof vi.fn>;
      expect(addRep).not.toHaveBeenCalled();

      const switchRep = components.session.switchRepresentation as ReturnType<typeof vi.fn>;
      expect(switchRep).not.toHaveBeenCalled();
    });

    it('SER-REP-006: fromJSON handles media with representations but no activeRepresentationId', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();
      state.media = [
        {
          type: 'image' as const,
          path: 'test.exr',
          name: 'test',
          width: 4096,
          height: 2160,
          duration: 1,
          fps: 24,
          representations: [
            {
              id: 'rep-full',
              label: 'EXR Full',
              kind: 'frames' as const,
              priority: 0,
              resolution: { width: 4096, height: 2160 },
              par: 1.0,
              audioTrackPresent: false,
              startFrame: 0,
              loaderConfig: { path: 'test.exr' },
            },
          ],
          // No activeRepresentationId
        },
      ];

      await SessionSerializer.fromJSON(state, components);

      const addRep = components.session.addRepresentationToSource as ReturnType<typeof vi.fn>;
      expect(addRep).toHaveBeenCalledTimes(1);
      expect(addRep).toHaveBeenCalledWith(0, expect.objectContaining({ id: 'rep-full' }));

      const switchRep = components.session.switchRepresentation as ReturnType<typeof vi.fn>;
      expect(switchRep).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Issue #136: omitted viewer states leak from previous session
  // -----------------------------------------------------------------------
  describe('issue #136: reset omitted viewer states on load', () => {
    it('SER-RST-001: fromJSON calls reset methods for omitted viewer states', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();

      await SessionSerializer.fromJSON(state, components);

      const viewer = components.viewer as any;
      expect(viewer.resetToneMappingState).toHaveBeenCalled();
      expect(viewer.resetGhostFrameState).toHaveBeenCalled();
      expect(viewer.resetStereoState).toHaveBeenCalled();
      expect(viewer.resetStereoEyeTransforms).toHaveBeenCalled();
      expect(viewer.resetStereoAlignMode).toHaveBeenCalled();
      expect(viewer.resetChannelMode).toHaveBeenCalled();
      expect(viewer.resetDifferenceMatteState).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Issue #137: gap warnings even when not active
  // -----------------------------------------------------------------------
  describe('issue #137: filter gap warnings by isActive', () => {
    it('SER-GAP-001: clean load with all defaults produces no gap warnings', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty();

      const result = await SessionSerializer.fromJSON(state, components);

      // No gap-related warnings since all states are at defaults
      const gapWarning = result.warnings.find((w) =>
        w.includes('viewer states are not saved in project files'),
      );
      expect(gapWarning).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Issue #146: LUT Pipeline project persistence
  // -----------------------------------------------------------------------
  describe('issue #146: LUT Pipeline project persistence', () => {
    it('SER-LUT-001: toJSON includes serializable LUT Pipeline state', () => {
      const components = createMockComponents();
      const pipeline = (components.viewer as any).getLUTPipeline();
      const lut = {
        title: 'Test LUT',
        size: 2,
        domainMin: [0, 0, 0] as [number, number, number],
        domainMax: [1, 1, 1] as [number, number, number],
        data: new Float32Array(24),
      };
      pipeline.setPreCacheLUT('default', lut, 'decode.cube');
      pipeline.setPreCacheLUTEnabled('default', false);
      pipeline.setPreCacheLUTIntensity('default', 0.25);
      pipeline.setFileLUT('default', lut, 'file.cube');
      pipeline.setFileLUTIntensity('default', 0.5);
      pipeline.setDisplayLUT(lut, 'display.cube');
      pipeline.setDisplayLUTIntensity(0.75);

      const state = SessionSerializer.toJSON(components, 'LUT Project');

      expect(state.lutPipeline).toBeDefined();
      expect(state.lutPipeline?.sources.default?.preCacheLUT.lutName).toBe('decode.cube');
      expect(state.lutPipeline?.sources.default?.preCacheLUT.enabled).toBe(false);
      expect(state.lutPipeline?.sources.default?.fileLUT.intensity).toBeCloseTo(0.5);
      expect(state.lutPipeline?.displayLUT.lutName).toBe('display.cube');
    });

    it('SER-LUT-002: fromJSON restores LUT Pipeline metadata and warns to reload named LUTs', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty('Restore LUT Pipeline');
      state.lutPipeline = {
        sources: {
          default: {
            sourceId: 'default',
            preCacheLUT: {
              enabled: false,
              lutName: 'decode.cube',
              intensity: 0.3,
              source: 'manual',
              bitDepth: '16bit',
              inMatrix: null,
              outMatrix: null,
            },
            fileLUT: {
              enabled: true,
              lutName: 'file.cube',
              intensity: 0.6,
              source: 'manual',
              inMatrix: null,
              outMatrix: null,
            },
            lookLUT: {
              enabled: true,
              lutName: 'look.cube',
              intensity: 0.8,
              source: 'manual',
              inMatrix: null,
              outMatrix: null,
            },
          },
        },
        displayLUT: {
          enabled: true,
          lutName: 'display.cube',
          intensity: 0.9,
          source: 'manual',
          inMatrix: null,
          outMatrix: null,
        },
        activeSourceId: 'default',
      };

      const result = await SessionSerializer.fromJSON(state, components);
      const pipeline = (components.viewer as any).getLUTPipeline() as LUTPipeline;
      const restored = pipeline.getState();

      expect(restored.activeSourceId).toBe('default');
      expect(restored.sources.get('default')?.preCacheLUT.lutName).toBe('decode.cube');
      expect(restored.sources.get('default')?.preCacheLUT.enabled).toBe(false);
      expect(restored.sources.get('default')?.fileLUT.intensity).toBeCloseTo(0.6);
      expect(restored.sources.get('default')?.lookLUT.lutName).toBe('look.cube');
      expect(restored.displayLUT.lutName).toBe('display.cube');
      expect((components.viewer as any).syncLUTPipeline).toHaveBeenCalled();
      expect(result.warnings.some((w) => w.includes('LUT Pipeline assignments need to be reloaded manually'))).toBe(
        true,
      );
    });

    it('SER-LUT-003: getSerializationGaps no longer reports LUT Pipeline as an unserialized gap', () => {
      const components = createMockComponents();
      const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
      const lutGap = gaps.find((g) => g.name === 'LUT Pipeline');
      expect(lutGap).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  describe('issue #164: EDL entries persistence', () => {
    it('SER-EDL-001: toJSON includes edlEntries when present', () => {
      const components = createMockComponents();
      const edlEntries = [
        { sourcePath: '/path/to/clip1.mov', inFrame: 1, outFrame: 100 },
        { sourcePath: '/path/to/clip2.mov', inFrame: 50, outFrame: 200 },
      ];
      (components.session as any).edlEntries = edlEntries;

      const state = SessionSerializer.toJSON(components, 'EDLTest');

      expect(state.edlEntries).toBeDefined();
      expect(state.edlEntries).toHaveLength(2);
      expect(state.edlEntries?.[0]?.sourcePath).toBe('/path/to/clip1.mov');
      expect(state.edlEntries?.[1]?.inFrame).toBe(50);
    });

    it('SER-EDL-002: toJSON omits edlEntries when empty', () => {
      const components = createMockComponents();
      (components.session as any).edlEntries = [];

      const state = SessionSerializer.toJSON(components, 'NoEDL');

      expect(state.edlEntries).toBeUndefined();
    });

    it('SER-EDL-003: fromJSON restores edlEntries into the session', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty('EDLRestore');
      state.edlEntries = [
        { sourcePath: '/path/to/clip.mov', inFrame: 10, outFrame: 50 },
      ];

      await SessionSerializer.fromJSON(state, components);

      expect((components.session as any).setEdlEntries).toHaveBeenCalledWith([
        { sourcePath: '/path/to/clip.mov', inFrame: 10, outFrame: 50 },
      ]);
    });

    it('SER-EDL-004: fromJSON calls setEdlEntries with empty array when edlEntries is absent (fix #315)', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty('NoEDL');
      // edlEntries is undefined by default

      await SessionSerializer.fromJSON(state, components);

      expect((components.session as any).setEdlEntries).toHaveBeenCalledWith([]);
    });

    it('SER-EDL-005: fromJSON calls setEdlEntries with empty array when edlEntries is empty (fix #315)', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty('EmptyEDL');
      state.edlEntries = [];

      await SessionSerializer.fromJSON(state, components);

      expect((components.session as any).setEdlEntries).toHaveBeenCalledWith([]);
    });

    it('SER-EDL-006: setEdlEntries triggers edlLoaded event (via SessionGraph)', async () => {
      // This tests the SessionGraph.setEdlEntries method directly
      // to verify the edlLoaded event fires for TimelineEditorService
      const { SessionGraph } = await import('./SessionGraph');
      const graph = new SessionGraph();
      const handler = vi.fn();
      graph.on('edlLoaded', handler);

      const entries = [{ sourcePath: '/clip.mov', inFrame: 1, outFrame: 100 }];
      graph.setEdlEntries(entries);

      expect(handler).toHaveBeenCalledWith(entries);
      expect(graph.edlEntries).toEqual(entries);
    });

    it('SER-EDL-007: setEdlEntries does not fire edlLoaded for empty entries', async () => {
      const { SessionGraph } = await import('./SessionGraph');
      const graph = new SessionGraph();
      const handler = vi.fn();
      graph.on('edlLoaded', handler);

      graph.setEdlEntries([]);

      expect(handler).not.toHaveBeenCalled();
      expect(graph.edlEntries).toEqual([]);
    });

    it('SER-EDL-008: edlEntries round-trips through toJSON/fromJSON', async () => {
      const components = createMockComponents();
      const edlEntries = [
        { sourcePath: '/path/to/clip1.mov', inFrame: 1, outFrame: 100 },
        { sourcePath: '/path/to/clip2.exr', inFrame: 10, outFrame: 250 },
      ];
      (components.session as any).edlEntries = edlEntries;

      const state = SessionSerializer.toJSON(components, 'RoundTrip');

      // Now restore
      const restoreComponents = createMockComponents();
      await SessionSerializer.fromJSON(state, restoreComponents);

      expect((restoreComponents.session as any).setEdlEntries).toHaveBeenCalledWith(edlEntries);
    });

    it('SER-EDL-009: restoring project with no EDL clears old EDL entries (fix #315)', async () => {
      const components = createMockComponents();
      // Simulate pre-existing EDL entries from a previous session
      (components.session as any).edlEntries = [
        { sourcePath: '/old/clip.mov', inFrame: 1, outFrame: 500 },
      ];

      // Restore a project that has no EDL entries
      const state = SessionSerializer.createEmpty('NoEDLProject');
      // edlEntries is undefined — simulates a project saved without EDL data

      await SessionSerializer.fromJSON(state, components);

      // setEdlEntries must be called with [] to clear stale entries
      expect((components.session as any).setEdlEntries).toHaveBeenCalledWith([]);
    });
  });
});

/**
 * Creates mock SessionComponents for testing.
 *
 * Uses real PaintEngine (no-arg constructor, pure data operations).
 * Session and Viewer remain mocked due to complex dependencies
 * (network/filesystem access, WebGL/DOM canvas).
 *
 * Available session mocks: allSources, getPlaybackState, setPlaybackState,
 * loadImage, loadVideo, loadFile
 */
function createMockComponents(): SessionComponents {
  const paintEngine = new PaintEngine();
  // Spy on loadFromAnnotations so tests can assert it was called
  vi.spyOn(paintEngine, 'loadFromAnnotations');
  const lutPipeline = new LUTPipeline();
  lutPipeline.registerSource('default');
  lutPipeline.setActiveSource('default');

  return {
    session: {
      allSources: [{ url: 'test.mp4', name: 'test', type: 'video', width: 1920, height: 1080, duration: 10, fps: 24 }],
      getPlaybackState: vi.fn().mockReturnValue({ currentFrame: 1, fps: 24, loopMode: 'loop' }),
      setPlaybackState: vi.fn(),
      clearSources: vi.fn(),
      loadImage: vi.fn<(name: string, url: string) => Promise<void>>().mockResolvedValue(undefined),
      loadVideo: vi.fn<(name: string, url: string) => Promise<void>>().mockResolvedValue(undefined),
      loadFile: vi.fn<(file: File) => Promise<void>>().mockResolvedValue(undefined),
      noteManager: {
        toSerializable: vi.fn().mockReturnValue([]),
        fromSerializable: vi.fn(),
        dispose: vi.fn(),
      },
      versionManager: {
        toSerializable: vi.fn().mockReturnValue([]),
        fromSerializable: vi.fn(),
        dispose: vi.fn(),
      },
      statusManager: {
        toSerializable: vi.fn().mockReturnValue([]),
        fromSerializable: vi.fn(),
        dispose: vi.fn(),
      },
      edlEntries: [] as any[],
      setEdlEntries: vi.fn(),
      addRepresentationToSource: vi.fn().mockReturnValue({ id: 'mock-rep' }),
      switchRepresentation: vi.fn<(sourceIndex: number, repId: string) => Promise<boolean>>().mockResolvedValue(true),
    },
    paintEngine,
    viewer: {
      getPan: vi.fn().mockReturnValue({ x: 0, y: 0 }),
      getZoom: vi.fn().mockReturnValue(1.5),
      getColorAdjustments: vi.fn().mockReturnValue({}),
      getCDL: vi.fn().mockReturnValue({}),
      getFilterSettings: vi.fn().mockReturnValue({}),
      getTransform: vi.fn().mockReturnValue({}),
      getCropState: vi.fn().mockReturnValue({}),
      getLensParams: vi.fn().mockReturnValue({}),
      getWipeState: vi.fn().mockReturnValue({}),
      getStackLayers: vi.fn().mockReturnValue([]),
      getNoiseReductionParams: vi
        .fn()
        .mockReturnValue({ strength: 0, luminanceStrength: 50, chromaStrength: 75, radius: 2 }),
      getWatermarkState: vi.fn().mockReturnValue({
        enabled: false,
        imageUrl: null,
        position: 'bottom-right',
        customX: 0.9,
        customY: 0.9,
        scale: 1,
        opacity: 0.7,
        margin: 20,
      }),
      getLUT: vi.fn().mockReturnValue(undefined),
      getLUTIntensity: vi.fn().mockReturnValue(1.0),
      getPARState: vi.fn().mockReturnValue({ enabled: false, par: 1.0, preset: 'square' }),
      getBackgroundPatternState: vi
        .fn()
        .mockReturnValue({ pattern: 'black', checkerSize: 'medium', customColor: '#1a1a1a' }),
      // Getters for serialization gap detection
      isOCIOEnabled: vi.fn().mockReturnValue(false),
      getDisplayColorState: vi.fn().mockReturnValue({ ...DEFAULT_DISPLAY_COLOR_STATE }),
      getGamutMappingState: vi.fn().mockReturnValue({ ...DEFAULT_GAMUT_MAPPING_STATE }),
      getToneMappingState: vi.fn().mockReturnValue({ ...DEFAULT_TONE_MAPPING_STATE }),
      getGhostFrameState: vi.fn().mockReturnValue({ ...DEFAULT_GHOST_FRAME_STATE }),
      getStereoState: vi.fn().mockReturnValue({ ...DEFAULT_STEREO_STATE }),
      getChannelMode: vi.fn().mockReturnValue('rgb'),
      getDifferenceMatteState: vi.fn().mockReturnValue({ ...DEFAULT_DIFFERENCE_MATTE_STATE }),
      getBlendModeState: vi.fn().mockReturnValue({ ...DEFAULT_BLEND_MODE_STATE, flickerFrame: 0 }),
      getColorInversion: vi.fn().mockReturnValue(false),
      getCurves: vi.fn().mockReturnValue(createDefaultCurvesData()),
      getStereoEyeTransforms: vi.fn().mockReturnValue({ ...DEFAULT_STEREO_EYE_TRANSFORM_STATE }),
      getStereoAlignMode: vi.fn().mockReturnValue(DEFAULT_STEREO_ALIGN_MODE),
      getDeinterlaceParams: vi.fn().mockReturnValue({ method: 'bob', fieldOrder: 'tff', enabled: false }),
      getFilmEmulationParams: vi.fn().mockReturnValue({ enabled: false, stock: 'kodak-portra-400', intensity: 1.0 }),
      getPerspectiveParams: vi.fn().mockReturnValue({ enabled: false, topLeft: { x: 0, y: 0 }, topRight: { x: 1, y: 0 }, bottomRight: { x: 1, y: 1 }, bottomLeft: { x: 0, y: 1 }, quality: 'bilinear' }),
      getStabilizationParams: vi.fn().mockReturnValue({ enabled: false, smoothingStrength: 50 }),
      isUncropActive: vi.fn().mockReturnValue(false),
      setColorAdjustments: vi.fn(),
      setCDL: vi.fn(),
      setFilterSettings: vi.fn(),
      setTransform: vi.fn(),
      setCropState: vi.fn(),
      setLensParams: vi.fn(),
      setWipeState: vi.fn(),
      setStackLayers: vi.fn(),
      setNoiseReductionParams: vi.fn(),
      setWatermarkState: vi.fn(),
      setLUTIntensity: vi.fn(),
      setPARState: vi.fn(),
      setBackgroundPatternState: vi.fn(),
      setZoom: vi.fn(),
      setPan: vi.fn(),
      syncLUTPipeline: vi.fn(),
      // Reset methods for omitted viewer states (fix #136)
      resetToneMappingState: vi.fn(),
      resetGhostFrameState: vi.fn(),
      resetStereoState: vi.fn(),
      resetStereoEyeTransforms: vi.fn(),
      resetStereoAlignMode: vi.fn(),
      resetChannelMode: vi.fn(),
      resetDifferenceMatteState: vi.fn(),
      // LUT pipeline (fix #146)
      getLUTPipeline: vi.fn().mockReturnValue(lutPipeline),
    },
  } as any;
}
