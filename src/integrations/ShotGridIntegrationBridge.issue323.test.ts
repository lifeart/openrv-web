/**
 * Issue #323 regression tests: loadPlaylist should build a review playlist
 * via PlaylistManager, not just populate the side panel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShotGridIntegrationBridge } from './ShotGridIntegrationBridge';
import { PlaylistManager } from '../core/session/PlaylistManager';
import { EventEmitter } from '../utils/EventEmitter';
import type { ShotGridConfigEvents } from './ShotGridConfig';
import type { ShotGridPanelEvents } from '../ui/components/ShotGridPanel';
import type { ShotGridVersion } from './ShotGridBridge';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockVersionManager() {
  const groups = new Map<string, any>();
  let groupIdCounter = 0;

  return {
    _groups: groups,
    createGroup: vi.fn((shotName: string, sourceIndices: number[], options?: { labels?: string[] }) => {
      const id = `group-${++groupIdCounter}`;
      const versions = sourceIndices.map((sourceIndex, i) => ({
        versionNumber: i + 1,
        sourceIndex,
        label: options?.labels?.[i] ?? `v${i + 1}`,
        addedAt: new Date().toISOString(),
      }));
      const group = { id, shotName, versions, activeVersionIndex: versions.length - 1 };
      groups.set(id, group);
      return { ...group, versions: [...group.versions] };
    }),
    addVersionToGroup: vi.fn(),
    getGroups: vi.fn(() => Array.from(groups.values()).map((g: any) => ({ ...g, versions: [...g.versions] }))),
    getGroup: vi.fn(),
    getGroupForSource: vi.fn(),
    removeGroup: vi.fn(),
    removeVersionFromGroup: vi.fn(),
    nextVersion: vi.fn(),
    previousVersion: vi.fn(),
    setActiveVersion: vi.fn(),
    getActiveVersion: vi.fn(),
    autoDetectGroups: vi.fn().mockReturnValue([]),
    toSerializable: vi.fn().mockReturnValue([]),
    fromSerializable: vi.fn(),
    dispose: vi.fn(),
    setCallbacks: vi.fn(),
  };
}

function createMockSession(sourceCountRef: { value: number }) {
  return {
    get sourceCount() {
      return sourceCountRef.value;
    },
    loadImage: vi.fn().mockImplementation(() => {
      sourceCountRef.value++;
      return Promise.resolve();
    }),
    loadVideo: vi.fn().mockImplementation(() => {
      sourceCountRef.value++;
      return Promise.resolve();
    }),
    loadImageSequenceFromPattern: vi.fn().mockImplementation(() => {
      sourceCountRef.value++;
      return Promise.resolve();
    }),
    getSourceByIndex: vi.fn().mockImplementation((idx: number) => ({
      type: 'video',
      name: `source-${idx}`,
      url: '',
      width: 1920,
      height: 1080,
      duration: 100,
      fps: 24,
    })),
    noteManager: {
      getNotesForSource: vi.fn().mockReturnValue([]),
      addNote: vi.fn().mockReturnValue({ id: 'local-note-1' }),
      findNoteByExternalId: vi.fn().mockReturnValue(undefined),
    },
    statusManager: {
      setStatus: vi.fn(),
      getStatus: vi.fn().mockReturnValue('pending'),
    },
    versionManager: createMockVersionManager(),
  };
}

class MockConfigUI extends EventEmitter<ShotGridConfigEvents> {
  setState = vi.fn();
  render = vi.fn().mockReturnValue(document.createElement('div'));
  getState = vi.fn().mockReturnValue('disconnected');
  validate = vi.fn().mockReturnValue(null);
  getConfig = vi.fn();
  restoreConfig = vi.fn();
  dispose = vi.fn();
}

class MockPanel extends EventEmitter<ShotGridPanelEvents> {
  setConnected = vi.fn();
  setVersions = vi.fn();
  setLoading = vi.fn();
  setError = vi.fn();
  mapVersionToSource = vi.fn();
  getSourceForVersion = vi.fn();
  getVersionForSource = vi.fn();
  show = vi.fn();
  hide = vi.fn();
  toggle = vi.fn();
  isOpen = vi.fn().mockReturnValue(false);
  resolveMediaUrl = vi.fn();
  dispose = vi.fn();
}

function makeVersion(overrides?: Partial<ShotGridVersion>): ShotGridVersion {
  return {
    id: 101,
    code: 'shot010_comp_v003',
    entity: { type: 'Shot', id: 10, name: 'shot010' },
    sg_status_list: 'rev',
    sg_path_to_movie: '/movie.mov',
    sg_path_to_frames: '',
    sg_uploaded_movie: { url: 'https://s3.example.com/movie.mp4' },
    image: null,
    frame_range: null,
    description: null,
    sg_first_frame: null,
    sg_last_frame: null,
    created_at: '2024-01-15T10:30:00Z',
    user: { type: 'HumanUser', id: 5, name: 'Artist' },
    ...overrides,
  };
}

const SG_CONFIG = {
  serverUrl: 'https://studio.shotgrid.autodesk.com',
  scriptName: 'test',
  apiKey: 'key',
  projectId: 42,
};

// Mock the ShotGridBridge module
let mockGetVersionsForPlaylist: ReturnType<typeof vi.fn>;
vi.mock('./ShotGridBridge', async () => {
  const actual = await vi.importActual('./ShotGridBridge');
  return {
    ...actual,
    ShotGridBridge: vi.fn(function (this: any) {
      this.authenticate = vi.fn().mockResolvedValue(undefined);
      this.getVersionsForPlaylist = vi.fn().mockResolvedValue([]);
      mockGetVersionsForPlaylist = this.getVersionsForPlaylist;
      this.getVersionsForShot = vi.fn().mockResolvedValue([]);
      this.getNotesForVersion = vi.fn().mockResolvedValue([]);
      this.pushNote = vi.fn().mockResolvedValue({ id: 500, subject: 'Test' });
      this.pushStatus = vi.fn().mockResolvedValue(undefined);
      this.getVersionById = vi.fn().mockResolvedValue(null);
      this.dispose = vi.fn();
    }),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShotGridIntegrationBridge – Issue #323: loadPlaylist builds review playlist', () => {
  let sourceCountRef: { value: number };
  let session: ReturnType<typeof createMockSession>;
  let configUI: MockConfigUI;
  let panel: MockPanel;
  let playlistManager: PlaylistManager;
  let bridge: ShotGridIntegrationBridge;

  beforeEach(() => {
    sourceCountRef = { value: 0 };
    session = createMockSession(sourceCountRef);
    configUI = new MockConfigUI();
    panel = new MockPanel();
    playlistManager = new PlaylistManager();
    bridge = new ShotGridIntegrationBridge({
      session: session as any,
      configUI: configUI as any,
      panel: panel as any,
      playlistManager,
    });
    bridge.setup();
  });

  afterEach(() => {
    bridge.dispose();
    vi.clearAllMocks();
  });

  async function connect() {
    configUI.emit('connect', SG_CONFIG);
    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });
  }

  it('SG-INT-323-001: loadPlaylist populates panel AND builds playlist clips', async () => {
    const v1 = makeVersion({ id: 101, code: 'shot010_comp_v001', entity: { type: 'Shot', id: 10, name: 'shot010' } });
    const v2 = makeVersion({ id: 102, code: 'shot020_comp_v001', entity: { type: 'Shot', id: 20, name: 'shot020' } });

    panel.resolveMediaUrl.mockImplementation((v: ShotGridVersion) => v.sg_uploaded_movie?.url ?? null);

    await connect();
    mockGetVersionsForPlaylist.mockResolvedValue([v1, v2]);

    panel.emit('loadPlaylist', { playlistId: 99 });

    await vi.waitFor(() => {
      expect(panel.setVersions).toHaveBeenCalledWith([v1, v2]);
    });

    // Wait for the playlist to be built
    await vi.waitFor(() => {
      expect(playlistManager.getClipCount()).toBe(2);
    });

    // Panel population preserved
    expect(panel.setVersions).toHaveBeenCalledWith([v1, v2]);

    // Playlist was built with correct order
    const clips = playlistManager.getClips();
    expect(clips[0]!.sourceName).toBe('shot010_comp_v001');
    expect(clips[1]!.sourceName).toBe('shot020_comp_v001');
    expect(clips[0]!.sourceIndex).toBe(0);
    expect(clips[1]!.sourceIndex).toBe(1);

    // Playlist enabled
    expect(playlistManager.isEnabled()).toBe(true);
  });

  it('SG-INT-323-002: loadPlaylist loads video media for each version', async () => {
    const v1 = makeVersion({ id: 101, code: 'shot_v1', sg_uploaded_movie: { url: 'https://s3.example.com/v1.mp4' } });
    const v2 = makeVersion({ id: 102, code: 'shot_v2', sg_uploaded_movie: { url: 'https://s3.example.com/v2.mp4' } });

    panel.resolveMediaUrl.mockImplementation((v: ShotGridVersion) => v.sg_uploaded_movie?.url ?? null);

    await connect();
    mockGetVersionsForPlaylist.mockResolvedValue([v1, v2]);

    panel.emit('loadPlaylist', { playlistId: 99 });

    await vi.waitFor(() => {
      expect(playlistManager.getClipCount()).toBe(2);
    });

    expect(session.loadVideo).toHaveBeenCalledWith('shot_v1', 'https://s3.example.com/v1.mp4');
    expect(session.loadVideo).toHaveBeenCalledWith('shot_v2', 'https://s3.example.com/v2.mp4');
  });

  it('SG-INT-323-003: loadPlaylist uses source duration for clip outPoint', async () => {
    session.getSourceByIndex.mockImplementation((idx: number) => ({
      type: 'video',
      name: `source-${idx}`,
      url: '',
      width: 1920,
      height: 1080,
      duration: idx === 0 ? 150 : 200,
      fps: 24,
    }));

    const v1 = makeVersion({ id: 101, code: 'shot_v1' });
    const v2 = makeVersion({ id: 102, code: 'shot_v2' });

    panel.resolveMediaUrl.mockImplementation((v: ShotGridVersion) => v.sg_uploaded_movie?.url ?? null);

    await connect();
    mockGetVersionsForPlaylist.mockResolvedValue([v1, v2]);

    panel.emit('loadPlaylist', { playlistId: 99 });

    await vi.waitFor(() => {
      expect(playlistManager.getClipCount()).toBe(2);
    });

    const clips = playlistManager.getClips();
    expect(clips[0]!.outPoint).toBe(150);
    expect(clips[1]!.outPoint).toBe(200);
  });

  it('SG-INT-323-004: loadPlaylist maps versions to sources and applies status', async () => {
    const v1 = makeVersion({ id: 101, code: 'shot_v1', sg_status_list: 'apr' });

    panel.resolveMediaUrl.mockReturnValue('https://s3.example.com/v1.mp4');

    await connect();
    mockGetVersionsForPlaylist.mockResolvedValue([v1]);

    panel.emit('loadPlaylist', { playlistId: 99 });

    await vi.waitFor(() => {
      expect(playlistManager.getClipCount()).toBe(1);
    });

    expect(panel.mapVersionToSource).toHaveBeenCalledWith(101, 0);
    expect(session.statusManager.setStatus).toHaveBeenCalledWith(0, 'approved', 'ShotGrid');
  });

  it('SG-INT-323-005: loadPlaylist registers versions in VersionManager', async () => {
    const v1 = makeVersion({ id: 101, code: 'shot010_v1', entity: { type: 'Shot', id: 10, name: 'shot010' } });

    panel.resolveMediaUrl.mockReturnValue('https://s3.example.com/v1.mp4');

    await connect();
    mockGetVersionsForPlaylist.mockResolvedValue([v1]);

    panel.emit('loadPlaylist', { playlistId: 99 });

    await vi.waitFor(() => {
      expect(playlistManager.getClipCount()).toBe(1);
    });

    expect(session.versionManager.createGroup).toHaveBeenCalledWith('shot010', [0], { labels: ['shot010_v1'] });
  });

  it('SG-INT-323-006: loadPlaylist skips versions without media URL', async () => {
    const v1 = makeVersion({ id: 101, code: 'shot_v1' });
    const v2 = makeVersion({
      id: 102,
      code: 'shot_v2_no_media',
      sg_uploaded_movie: null,
      sg_path_to_movie: '',
      sg_path_to_frames: '',
    });
    const v3 = makeVersion({ id: 103, code: 'shot_v3' });

    panel.resolveMediaUrl.mockImplementation((v: ShotGridVersion) => {
      if (v.id === 102) return null;
      return v.sg_uploaded_movie?.url ?? null;
    });

    await connect();
    mockGetVersionsForPlaylist.mockResolvedValue([v1, v2, v3]);

    panel.emit('loadPlaylist', { playlistId: 99 });

    await vi.waitFor(() => {
      expect(playlistManager.getClipCount()).toBe(2);
    });

    // Panel still sees all 3 versions
    expect(panel.setVersions).toHaveBeenCalledWith([v1, v2, v3]);

    // Playlist only has the 2 versions with media
    const clips = playlistManager.getClips();
    expect(clips[0]!.sourceName).toBe('shot_v1');
    expect(clips[1]!.sourceName).toBe('shot_v3');
  });

  it('SG-INT-323-007: loadPlaylist skips versions that fail to load', async () => {
    const v1 = makeVersion({ id: 101, code: 'shot_v1' });
    const v2 = makeVersion({ id: 102, code: 'shot_v2_broken' });

    panel.resolveMediaUrl.mockImplementation((v: ShotGridVersion) => v.sg_uploaded_movie?.url ?? null);

    // Make the second load fail
    let loadCount = 0;
    session.loadVideo.mockImplementation(() => {
      loadCount++;
      if (loadCount === 2) return Promise.reject(new Error('Network error'));
      sourceCountRef.value++;
      return Promise.resolve();
    });

    await connect();
    mockGetVersionsForPlaylist.mockResolvedValue([v1, v2]);

    panel.emit('loadPlaylist', { playlistId: 99 });

    await vi.waitFor(() => {
      expect(playlistManager.getClipCount()).toBe(1);
    });

    // Only the successfully loaded version appears in the playlist
    const clips = playlistManager.getClips();
    expect(clips[0]!.sourceName).toBe('shot_v1');
  });

  it('SG-INT-323-008: loadPlaylist with empty versions does not touch playlist', async () => {
    await connect();
    mockGetVersionsForPlaylist.mockResolvedValue([]);

    panel.emit('loadPlaylist', { playlistId: 99 });

    await vi.waitFor(() => {
      expect(panel.setVersions).toHaveBeenCalledWith([]);
    });

    // No clips added
    expect(playlistManager.getClipCount()).toBe(0);
    expect(playlistManager.isEnabled()).toBe(false);
  });

  it('SG-INT-323-009: loadPlaylist without playlistManager still populates panel', async () => {
    bridge.dispose();

    // Create bridge without playlistManager
    bridge = new ShotGridIntegrationBridge({
      session: session as any,
      configUI: configUI as any,
      panel: panel as any,
      // no playlistManager
    });
    bridge.setup();

    const v1 = makeVersion({ id: 101, code: 'shot_v1' });

    await connect();
    mockGetVersionsForPlaylist.mockResolvedValue([v1]);

    panel.emit('loadPlaylist', { playlistId: 99 });

    await vi.waitFor(() => {
      expect(panel.setVersions).toHaveBeenCalledWith([v1]);
    });

    // No errors thrown, panel populated
    expect(panel.setLoading).toHaveBeenCalledWith(true);
    expect(panel.setLoading).toHaveBeenCalledWith(false);
  });

  it('SG-INT-323-010: loadPlaylist replaces previous playlist on re-load', async () => {
    const v1 = makeVersion({ id: 101, code: 'shot_v1' });
    const v2 = makeVersion({ id: 102, code: 'shot_v2' });

    panel.resolveMediaUrl.mockImplementation((v: ShotGridVersion) => v.sg_uploaded_movie?.url ?? null);

    await connect();

    // First load
    mockGetVersionsForPlaylist.mockResolvedValue([v1]);
    panel.emit('loadPlaylist', { playlistId: 99 });

    await vi.waitFor(() => {
      expect(playlistManager.getClipCount()).toBe(1);
    });

    // Second load replaces the first
    mockGetVersionsForPlaylist.mockResolvedValue([v2]);
    panel.emit('loadPlaylist', { playlistId: 100 });

    await vi.waitFor(() => {
      // replaceClips replaces all clips, so count should be 1 again
      const clips = playlistManager.getClips();
      expect(clips.length).toBe(1);
      expect(clips[0]!.sourceName).toBe('shot_v2');
    });
  });

  it('SG-INT-323-011: loadPlaylist stores SG metadata on playlist clips', async () => {
    const v1 = makeVersion({ id: 101, code: 'shot010_v1', entity: { type: 'Shot', id: 10, name: 'shot010' } });

    panel.resolveMediaUrl.mockReturnValue('https://s3.example.com/v1.mp4');

    await connect();
    mockGetVersionsForPlaylist.mockResolvedValue([v1]);

    panel.emit('loadPlaylist', { playlistId: 99 });

    await vi.waitFor(() => {
      expect(playlistManager.getClipCount()).toBe(1);
    });

    const clip = playlistManager.getClips()[0]!;
    expect(clip.metadata).toEqual({ sgVersionId: 101, sgShotName: 'shot010' });
  });

  it('SG-INT-323-012: loadPlaylist preserves playlist order from ShotGrid', async () => {
    const v1 = makeVersion({ id: 103, code: 'shot030_v1', entity: { type: 'Shot', id: 30, name: 'shot030' } });
    const v2 = makeVersion({ id: 101, code: 'shot010_v1', entity: { type: 'Shot', id: 10, name: 'shot010' } });
    const v3 = makeVersion({ id: 102, code: 'shot020_v1', entity: { type: 'Shot', id: 20, name: 'shot020' } });

    panel.resolveMediaUrl.mockImplementation((v: ShotGridVersion) => v.sg_uploaded_movie?.url ?? null);

    await connect();
    mockGetVersionsForPlaylist.mockResolvedValue([v1, v2, v3]);

    panel.emit('loadPlaylist', { playlistId: 99 });

    await vi.waitFor(() => {
      expect(playlistManager.getClipCount()).toBe(3);
    });

    const clips = playlistManager.getClips();
    expect(clips[0]!.sourceName).toBe('shot030_v1');
    expect(clips[1]!.sourceName).toBe('shot010_v1');
    expect(clips[2]!.sourceName).toBe('shot020_v1');
  });

  it('SG-INT-323-013: generation counter prevents stale playlist builds', async () => {
    const v1 = makeVersion({ id: 101, code: 'shot_v1' });

    panel.resolveMediaUrl.mockReturnValue('https://s3.example.com/v1.mp4');

    // Make loadVideo slow so we can race it
    let resolveLoad: () => void;
    session.loadVideo.mockImplementation(() => {
      return new Promise<void>((resolve) => {
        resolveLoad = () => {
          sourceCountRef.value++;
          resolve();
        };
      });
    });

    await connect();
    mockGetVersionsForPlaylist.mockResolvedValue([v1]);

    panel.emit('loadPlaylist', { playlistId: 99 });

    // While first load is still in progress, trigger another load (bumps generation)
    await vi.waitFor(() => {
      expect(session.loadVideo).toHaveBeenCalled();
    });

    // Start a new load (this bumps the generation counter)
    mockGetVersionsForPlaylist.mockResolvedValue([]);
    panel.emit('loadPlaylist', { playlistId: 100 });

    // Now resolve the first load's video
    resolveLoad!();

    await vi.waitFor(() => {
      // Second load with empty versions should have set panel
      expect(panel.setVersions).toHaveBeenCalledWith([]);
    });

    // The stale first load should NOT have built a playlist
    expect(playlistManager.getClipCount()).toBe(0);
  });
});
