/**
 * SessionSerializer Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionSerializer, SessionComponents } from './SessionSerializer';
import type { SessionState } from './SessionState';
import { SESSION_STATE_VERSION } from './SessionState';
import { PaintEngine } from '../../paint/PaintEngine';

// Mock the showFileReloadPrompt dialog
vi.mock('../../ui/components/shared/Modal', () => ({
  showFileReloadPrompt: vi.fn(),
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

      await SessionSerializer.fromJSON(oldState, components);
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
      (components.session as any).allSources = [{
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
            endFrame: 10
        }
      }];

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

    it('SER-013: marks blob URLs with requiresReload and clears path', () => {
      const components = createMockComponents();
      (components.session as any).allSources = [{
        url: 'blob:http://localhost:3000/abc-123',
        name: 'local-image.png',
        type: 'image',
        width: 100,
        height: 100,
        duration: 1,
        fps: 1,
      }];

      const state = SessionSerializer.toJSON(components);

      expect(state.media[0]?.path).toBe(''); // Blob URL cleared
      expect(state.media[0]?.requiresReload).toBe(true);
      expect(state.media[0]?.name).toBe('local-image.png');
    });

    it('SER-014: does not set requiresReload for non-blob URLs', () => {
      const components = createMockComponents();
      (components.session as any).allSources = [{
        url: 'https://example.com/video.mp4',
        name: 'remote-video.mp4',
        type: 'video',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
      }];

      const state = SessionSerializer.toJSON(components);

      expect(state.media[0]?.path).toBe('https://example.com/video.mp4');
      expect(state.media[0]?.requiresReload).toBeUndefined(); // Not set at all
    });

    it('SER-015: serializes playlist state when playlist manager is available', () => {
      const components = createMockComponents();
      const playlistState = {
        clips: [{ id: 'clip-1', sourceIndex: 0, sourceName: 'shot', inPoint: 1, outPoint: 24, globalStartFrame: 1, duration: 24 }],
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
        { name: 'seq', path: 'seq.jpg', type: 'sequence', width: 100, height: 100, duration: 10, fps: 24 }
      ];

      const result = await SessionSerializer.fromJSON(state, components);

      // video + img loaded; sequence requires manual selection
      expect(result.loadedMedia).toBe(2);
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
        { name: 'blob.png', path: 'blob:xxx', type: 'image', width: 100, height: 100, duration: 1, fps: 1 }
      ];

      const result = await SessionSerializer.fromJSON(state, components);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected blob URL in saved project')
      );
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
        { name: 'local.mp4', path: '', type: 'video', width: 1920, height: 1080, duration: 100, fps: 24, requiresReload: true }
      ];

      const result = await SessionSerializer.fromJSON(state, components);

      expect(showFileReloadPrompt).toHaveBeenCalledWith('local.mp4', expect.objectContaining({
        title: 'Reload File',
        accept: 'video/*',
      }));
      expect(result.loadedMedia).toBe(1);
      expect(components.session.loadFile).toHaveBeenCalledWith(mockFile);
    });

    it('SER-008d: adds warning when user skips file reload', async () => {
      (showFileReloadPrompt as ReturnType<typeof vi.fn>).mockResolvedValue(null); // User skipped

      const components = createMockComponents();
      const state = SessionSerializer.createEmpty('TestProject');
      state.media = [
        { name: 'skipped.png', path: '', type: 'image', width: 100, height: 100, duration: 1, fps: 1, requiresReload: true }
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
        { name: 'failing.png', path: '', type: 'image', width: 100, height: 100, duration: 1, fps: 1, requiresReload: true }
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
        .mockResolvedValueOnce(mockFile1)  // First file - user provides
        .mockResolvedValueOnce(null)       // Second file - user skips (returns null)
        .mockResolvedValueOnce(mockFile3); // Third file - user provides

      const components = createMockComponents();
      const state = SessionSerializer.createEmpty('TestProject');
      state.media = [
        { name: 'image1.png', path: '', type: 'image', width: 100, height: 100, duration: 1, fps: 1, requiresReload: true },
        { name: 'video1.mp4', path: '', type: 'video', width: 1920, height: 1080, duration: 100, fps: 24, requiresReload: true },
        { name: 'image2.png', path: '', type: 'image', width: 200, height: 200, duration: 1, fps: 1, requiresReload: true },
      ];

      const result = await SessionSerializer.fromJSON(state, components);

      // Verify all three prompts were shown
      expect(showFileReloadPrompt).toHaveBeenCalledTimes(3);
      expect(showFileReloadPrompt).toHaveBeenNthCalledWith(1, 'image1.png', expect.objectContaining({ accept: 'image/*' }));
      expect(showFileReloadPrompt).toHaveBeenNthCalledWith(2, 'video1.mp4', expect.objectContaining({ accept: 'video/*' }));
      expect(showFileReloadPrompt).toHaveBeenNthCalledWith(3, 'image2.png', expect.objectContaining({ accept: 'image/*' }));

      // Verify loadFile was called for files 1 and 3 (not 2 which was skipped)
      expect(components.session.loadFile).toHaveBeenCalledTimes(2);
      expect(components.session.loadFile).toHaveBeenNthCalledWith(1, mockFile1);
      expect(components.session.loadFile).toHaveBeenNthCalledWith(2, mockFile3);

      // Two files loaded, one skipped
      expect(result.loadedMedia).toBe(2);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings).toContain('Skipped reload: video1.mp4');
    });

    it('SER-009: handles load failures', async () => {
        const components = createMockComponents();
        (components.session.loadVideo as any).mockRejectedValue(new Error('Fail'));

        const state = SessionSerializer.createEmpty();
        state.media = [{ name: 'video', path: 'video.mp4', type: 'video', width: 1920, height: 1080, duration: 100, fps: 24 }];

        const result = await SessionSerializer.fromJSON(state, components);
        expect(result.loadedMedia).toBe(0);
        expect(result.warnings[0]).toContain('Failed to load');
    });

    it('SER-011: warns about LUT path', async () => {
        const components = createMockComponents();
        const state = SessionSerializer.createEmpty();
        state.lutPath = 'my.cube';

        const result = await SessionSerializer.fromJSON(state, components);
        expect(result.warnings).toContain('LUT "my.cube" requires manual loading');
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
        clips: [{ id: 'clip-1', sourceIndex: 0, sourceName: 'shot', inPoint: 5, outPoint: 15, globalStartFrame: 1, duration: 11 }],
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

  return {
    session: {
      allSources: [
        { url: 'test.mp4', name: 'test', type: 'video', width: 1920, height: 1080, duration: 10, fps: 24 }
      ],
      getPlaybackState: vi.fn().mockReturnValue({ currentFrame: 1, fps: 24, loopMode: 'loop' }),
      setPlaybackState: vi.fn(),
      loadImage: vi.fn<[string, string], Promise<void>>().mockResolvedValue(undefined),
      loadVideo: vi.fn<[string, string], Promise<void>>().mockResolvedValue(undefined),
      loadFile: vi.fn<[File], Promise<void>>().mockResolvedValue(undefined),
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
      getLUT: vi.fn().mockReturnValue(undefined),
      getLUTIntensity: vi.fn().mockReturnValue(1.0),
      getPARState: vi.fn().mockReturnValue({ enabled: false, par: 1.0, preset: 'square' }),
      getBackgroundPatternState: vi.fn().mockReturnValue({ pattern: 'black', checkerSize: 'medium', customColor: '#1a1a1a' }),
      setColorAdjustments: vi.fn(),
      setCDL: vi.fn(),
      setFilterSettings: vi.fn(),
      setTransform: vi.fn(),
      setCropState: vi.fn(),
      setLensParams: vi.fn(),
      setWipeState: vi.fn(),
      setStackLayers: vi.fn(),
      setLUTIntensity: vi.fn(),
      setPARState: vi.fn(),
      setBackgroundPatternState: vi.fn(),
      setZoom: vi.fn(),
      setPan: vi.fn()
    }
  } as any;
}
