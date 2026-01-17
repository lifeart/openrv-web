/**
 * SessionSerializer Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { SessionSerializer, SessionComponents } from './SessionSerializer';
import type { SessionState } from './SessionState';
import { SESSION_STATE_VERSION } from './SessionState';

describe('SessionSerializer', () => {
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
  });

  describe('fromJSON', () => {
    it('SER-008: restores state correctly', async () => {
      const components = createMockComponents();
      const state = SessionSerializer.createEmpty('TestProject');
      state.media = [
        { name: 'video', path: 'video.mp4', type: 'video', width: 1920, height: 1080, duration: 100, fps: 24 },
        { name: 'img', path: 'image.jpg', type: 'image', width: 100, height: 100, duration: 1, fps: 1 },
        { name: 'blob', path: 'blob:xxx', type: 'image', width: 100, height: 100, duration: 1, fps: 1 },
        { name: 'seq', path: 'seq.jpg', type: 'sequence', width: 100, height: 100, duration: 10, fps: 24 }
      ];

      const result = await SessionSerializer.fromJSON(state, components);

      expect(result.loadedMedia).toBe(2); // video + img (blob and sequence skipped/warned)
      expect(result.warnings.length).toBe(2); // blob + sequence
      expect(components.session.loadVideo).toHaveBeenCalledWith('video', 'video.mp4');
      expect(components.session.loadImage).toHaveBeenCalledWith('img', 'image.jpg');
      expect(components.viewer.setZoom).toHaveBeenCalled();
      expect(components.paintEngine.loadFromAnnotations).toHaveBeenCalled();
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
  });
});

function createMockComponents(): SessionComponents {
  return {
    session: {
      allSources: [
        { url: 'test.mp4', name: 'test', type: 'video', width: 1920, height: 1080, duration: 10, fps: 24 }
      ],
      getPlaybackState: vi.fn().mockReturnValue({ currentFrame: 1, fps: 24, loopMode: 'loop' }),
      setPlaybackState: vi.fn(),
      loadImage: vi.fn().mockResolvedValue(undefined),
      loadVideo: vi.fn().mockResolvedValue(undefined),
    },
    paintEngine: {
      toJSON: vi.fn().mockReturnValue({
        nextId: 1,
        show: true,
        frames: {},
        effects: {}
      }),
      loadFromAnnotations: vi.fn()
    },
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
      setColorAdjustments: vi.fn(),
      setCDL: vi.fn(),
      setFilterSettings: vi.fn(),
      setTransform: vi.fn(),
      setCropState: vi.fn(),
      setLensParams: vi.fn(),
      setWipeState: vi.fn(),
      setStackLayers: vi.fn(),
      setLUTIntensity: vi.fn(),
      setZoom: vi.fn(),
      setPan: vi.fn()
    }
  } as any;
}
