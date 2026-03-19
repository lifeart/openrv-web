/**
 * ShotGridIntegrationBridge Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShotGridIntegrationBridge } from './ShotGridIntegrationBridge';
import { EventEmitter } from '../utils/EventEmitter';
import type { ShotGridConfigEvents } from './ShotGridConfig';
import type { ShotGridPanelEvents } from '../ui/components/ShotGridPanel';
import type { ShotGridVersion, ShotGridNote } from './ShotGridBridge';

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
    addVersionToGroup: vi.fn((groupId: string, sourceIndex: number, options?: { label?: string; metadata?: Record<string, string> }) => {
      const group = groups.get(groupId);
      if (!group) return null;
      const maxVersion = group.versions.reduce((max: number, v: any) => Math.max(max, v.versionNumber), 0);
      const entry = {
        versionNumber: maxVersion + 1,
        sourceIndex,
        label: options?.label ?? `v${maxVersion + 1}`,
        addedAt: new Date().toISOString(),
        metadata: options?.metadata,
      };
      group.versions.push(entry);
      return { ...entry };
    }),
    getGroups: vi.fn(() => Array.from(groups.values()).map((g: any) => ({ ...g, versions: [...g.versions] }))),
    getGroup: vi.fn((id: string) => {
      const g = groups.get(id);
      return g ? { ...g, versions: [...g.versions] } : undefined;
    }),
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

function createMockSession() {
  return {
    sourceCount: 1,
    loadImage: vi.fn().mockResolvedValue(undefined),
    loadVideo: vi.fn().mockResolvedValue(undefined),
    loadImageSequenceFromPattern: vi.fn().mockResolvedValue(undefined),
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
    sg_uploaded_movie: null,
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

// Mock the ShotGridBridge module
vi.mock('./ShotGridBridge', async () => {
  const actual = await vi.importActual('./ShotGridBridge');
  return {
    ...actual,
    ShotGridBridge: vi.fn(function (this: any) {
      this.authenticate = vi.fn().mockResolvedValue(undefined);
      this.getVersionsForPlaylist = vi.fn().mockResolvedValue([makeVersion()]);
      this.getVersionsForShot = vi.fn().mockResolvedValue([makeVersion()]);
      this.getNotesForVersion = vi.fn().mockResolvedValue([]);
      this.pushNote = vi.fn().mockResolvedValue({ id: 500, subject: 'Test' });
      this.pushStatus = vi.fn().mockResolvedValue(undefined);
      this.dispose = vi.fn();
    }),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShotGridIntegrationBridge', () => {
  let session: ReturnType<typeof createMockSession>;
  let configUI: MockConfigUI;
  let panel: MockPanel;
  let bridge: ShotGridIntegrationBridge;

  beforeEach(() => {
    session = createMockSession();
    configUI = new MockConfigUI();
    panel = new MockPanel();
    bridge = new ShotGridIntegrationBridge({
      session: session as any,
      configUI: configUI as any,
      panel: panel as any,
    });
    bridge.setup();
  });

  afterEach(() => {
    bridge.dispose();
    vi.clearAllMocks();
  });

  it('SG-INT-001: connect flow creates bridge and sets connected state', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    // Wait for async auth
    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    expect(panel.setConnected).toHaveBeenCalledWith(true);
  });

  it('SG-INT-002: load playlist fetches and sets versions', async () => {
    // First connect
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    // Then load playlist
    panel.emit('loadPlaylist', { playlistId: 99 });

    await vi.waitFor(() => {
      expect(panel.setVersions).toHaveBeenCalled();
    });

    expect(panel.setLoading).toHaveBeenCalledWith(true);
    expect(panel.setLoading).toHaveBeenCalledWith(false);
  });

  it('SG-INT-003: load shot fetches and sets versions', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    panel.emit('loadShot', { shotId: 20 });

    await vi.waitFor(() => {
      expect(panel.setVersions).toHaveBeenCalled();
    });
  });

  it('SG-INT-004: loadVersion calls session.loadVideo for video URLs', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    panel.emit('loadVersion', {
      version: makeVersion(),
      mediaUrl: 'https://s3.example.com/movie.mp4',
    });

    await vi.waitFor(() => {
      expect(session.loadVideo).toHaveBeenCalledWith('shot010_comp_v003', 'https://s3.example.com/movie.mp4');
      expect(panel.mapVersionToSource).toHaveBeenCalledWith(101, 0);
      expect(session.statusManager.setStatus).toHaveBeenCalledWith(0, 'needs-work', 'ShotGrid');
    });
  });

  it('SG-INT-004b: loadVersion recognises extended video formats (#522)', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    for (const ext of ['mkv', 'webm', 'ogv', 'mxf', 'm4v', '3gp']) {
      session.loadVideo.mockClear();
      panel.emit('loadVersion', {
        version: makeVersion(),
        mediaUrl: `https://s3.example.com/clip.${ext}`,
      });

      await vi.waitFor(() => {
        expect(session.loadVideo).toHaveBeenCalledTimes(1);
      });
    }
  });

  it('SG-INT-004c: loadVersion strips query string before extension check (#523)', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    panel.emit('loadVersion', {
      version: makeVersion(),
      mediaUrl: 'https://s3.example.com/movie.mov?token=abc123',
    });

    await vi.waitFor(() => {
      expect(session.loadVideo).toHaveBeenCalledWith('shot010_comp_v003', 'https://s3.example.com/movie.mov?token=abc123');
    });
  });

  it('SG-INT-005: loadVersion calls session.loadImage for non-video URLs', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    panel.emit('loadVersion', {
      version: makeVersion(),
      mediaUrl: 'https://s3.example.com/frame.exr',
    });

    await vi.waitFor(() => {
      expect(session.loadImage).toHaveBeenCalledWith('shot010_comp_v003', 'https://s3.example.com/frame.exr');
    });
  });

  it('SG-INT-006: pushNotes reports partial failure', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    // Mock notes
    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Note 1', frameStart: 1, frameEnd: 10, parentId: null, status: 'open' },
      { id: 'n2', text: 'Note 2', frameStart: 5, frameEnd: 5, parentId: null, status: 'open' },
    ]);

    // Mock first push succeeds, second fails
    const { ShotGridBridge: MockBridge } = await import('./ShotGridBridge');
    const mockBridgeInstance = (MockBridge as any).mock.results.at(-1)?.value;
    if (mockBridgeInstance) {
      let callCount = 0;
      mockBridgeInstance.pushNote.mockImplementation(() => {
        callCount++;
        if (callCount === 2) return Promise.reject(new Error('Push failed'));
        return Promise.resolve({ id: 500 + callCount, subject: 'Test' });
      });
    }

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(panel.setError).toHaveBeenCalledWith(expect.stringContaining('failed'));
    });
  });

  it('SG-INT-007: pullNotes deduplicates by SG note ID', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const sgNotes: ShotGridNote[] = [
      {
        id: 700,
        subject: 'Edge issue',
        content: 'Fix edge blend',
        note_links: [{ type: 'Version', id: 101 }],
        created_at: '2024-03-01T12:00:00Z',
        user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
        sg_first_frame: null,
        sg_last_frame: null,
        frame_range: null,
        sg_status_list: null,
        reply_to_entity: null,
      },
    ];

    const { ShotGridBridge: MockBridge } = await import('./ShotGridBridge');
    const mockBridgeInstance = (MockBridge as any).mock.results.at(-1)?.value;
    if (mockBridgeInstance) {
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);
    }

    // First pull
    panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
    });

    // Second pull of same notes - should be deduped
    panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      // Still only 1 call (not 2) because note 700 is already in the map
      expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
    });
  });

  it('SG-INT-008: disconnect clears state and disposes bridge', () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    configUI.emit('disconnect', undefined);

    expect(panel.setConnected).toHaveBeenCalledWith(false);
    expect(panel.setVersions).toHaveBeenCalledWith([]);
  });

  it('SG-INT-009: dispose is idempotent', () => {
    bridge.dispose();
    expect(() => bridge.dispose()).not.toThrow();
  });

  it('SG-INT-010: ignores loadVersion with null mediaUrl', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    panel.emit('loadVersion', { version: makeVersion(), mediaUrl: null });

    // Give it a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(session.loadVideo).not.toHaveBeenCalled();
    expect(session.loadImage).not.toHaveBeenCalled();
  });

  it('SG-INT-011: loadVersion skips mapping if disconnected during load', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    // Make loadVideo slow so we can disconnect during it
    session.loadVideo.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 50);
        }),
    );

    panel.emit('loadVersion', {
      version: makeVersion(),
      mediaUrl: 'https://s3.example.com/movie.mp4',
    });

    // Disconnect before loadVideo completes (increments generation)
    configUI.emit('disconnect', undefined);

    // Wait for loadVideo to complete
    await new Promise((r) => setTimeout(r, 100));

    // mapVersionToSource should NOT have been called (generation mismatch)
    expect(panel.mapVersionToSource).not.toHaveBeenCalled();
  });

  it('SG-INT-012: pushNotes stops if bridge is disposed mid-iteration', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    // Mock 3 notes
    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Note 1', frameStart: 1, frameEnd: 1, parentId: null, status: 'open' },
      { id: 'n2', text: 'Note 2', frameStart: 2, frameEnd: 2, parentId: null, status: 'open' },
      { id: 'n3', text: 'Note 3', frameStart: 3, frameEnd: 3, parentId: null, status: 'open' },
    ]);

    // Make pushNote disconnect after first note
    const { ShotGridBridge: MockBridge } = await import('./ShotGridBridge');
    const mockBridgeInstance = (MockBridge as any).mock.results.at(-1)?.value;
    if (mockBridgeInstance) {
      let callCount = 0;
      mockBridgeInstance.pushNote.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Disconnect after first push - this nulls the bridge
          configUI.emit('disconnect', undefined);
        }
        return Promise.resolve({ id: 500 + callCount, subject: 'Test' });
      });
    }

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await new Promise((r) => setTimeout(r, 50));

    // Only the first push should have been attempted before bridge was nulled
    if (mockBridgeInstance) {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    }
  });

  it('SG-INT-013: loadVersion routes frame-sequence path through sequence loader', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const version = makeVersion({
      sg_uploaded_movie: null,
      sg_path_to_movie: '/local/path.mov',
      sg_path_to_frames: '/path/to/frames/shot.####.exr',
      sg_first_frame: 1001,
      sg_last_frame: 1100,
    });

    panel.emit('loadVersion', {
      version,
      mediaUrl: '/path/to/frames/shot.####.exr',
    });

    await vi.waitFor(() => {
      expect(session.loadImageSequenceFromPattern).toHaveBeenCalledWith(
        'shot010_comp_v003',
        '/path/to/frames/shot.####.exr',
        1001,
        1100,
      );
    });

    // Should NOT have called loadImage
    expect(session.loadImage).not.toHaveBeenCalled();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Loading frame sequence path'),
    );

    consoleSpy.mockRestore();
  });

  it('SG-INT-015: pullNotes uses sg_first_frame/sg_last_frame when available', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const sgNotes: ShotGridNote[] = [
      {
        id: 800,
        subject: 'Frame note',
        content: 'Check frames 1045-1052',
        note_links: [{ type: 'Version', id: 101 }],
        created_at: '2024-04-10T09:00:00Z',
        user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
        sg_first_frame: 1045,
        sg_last_frame: 1052,
        frame_range: '1045-1052',
        sg_status_list: null,
        reply_to_entity: null,
      },
    ];

    const { ShotGridBridge: MockBridge } = await import('./ShotGridBridge');
    const mockBridgeInstance = (MockBridge as any).mock.results.at(-1)?.value;
    if (mockBridgeInstance) {
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);
    }

    panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
    });

    expect(session.noteManager.addNote).toHaveBeenCalledWith(
      0,
      1045,
      1052,
      'Check frames 1045-1052',
      'Reviewer',
      { createdAt: '2024-04-10T09:00:00Z', externalId: '800', parentId: undefined, status: 'open' },
    );
  });

  it('SG-INT-016: pullNotes falls back to frame_range string when sg_first/last_frame are null', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const sgNotes: ShotGridNote[] = [
      {
        id: 801,
        subject: 'Range note',
        content: 'Check range',
        note_links: [{ type: 'Version', id: 101 }],
        created_at: '2024-04-10T10:00:00Z',
        user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
        sg_first_frame: null,
        sg_last_frame: null,
        frame_range: '100-200',
        sg_status_list: null,
        reply_to_entity: null,
      },
    ];

    const { ShotGridBridge: MockBridge } = await import('./ShotGridBridge');
    const mockBridgeInstance = (MockBridge as any).mock.results.at(-1)?.value;
    if (mockBridgeInstance) {
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);
    }

    panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
    });

    expect(session.noteManager.addNote).toHaveBeenCalledWith(
      0,
      100,
      200,
      'Check range',
      'Reviewer',
      { createdAt: '2024-04-10T10:00:00Z', externalId: '801', parentId: undefined, status: 'open' },
    );
  });

  it('SG-INT-017: pullNotes falls back to 1-1 when no frame fields are available', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const sgNotes: ShotGridNote[] = [
      {
        id: 802,
        subject: 'No frames',
        content: 'General feedback',
        note_links: [{ type: 'Version', id: 101 }],
        created_at: '2024-04-10T11:00:00Z',
        user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
        sg_first_frame: null,
        sg_last_frame: null,
        frame_range: null,
        sg_status_list: null,
        reply_to_entity: null,
      },
    ];

    const { ShotGridBridge: MockBridge } = await import('./ShotGridBridge');
    const mockBridgeInstance = (MockBridge as any).mock.results.at(-1)?.value;
    if (mockBridgeInstance) {
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);
    }

    panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
    });

    expect(session.noteManager.addNote).toHaveBeenCalledWith(
      0,
      1,
      1,
      'General feedback',
      'Reviewer',
      { createdAt: '2024-04-10T11:00:00Z', externalId: '802', parentId: undefined, status: 'open' },
    );
  });

  it('SG-INT-018: pullNotes preserves original created_at from ShotGrid', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const sgNotes: ShotGridNote[] = [
      {
        id: 803,
        subject: 'Old note',
        content: 'Created long ago',
        note_links: [{ type: 'Version', id: 101 }],
        created_at: '2023-06-15T08:30:00Z',
        user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
        sg_first_frame: null,
        sg_last_frame: null,
        frame_range: null,
        sg_status_list: null,
        reply_to_entity: null,
      },
    ];

    const { ShotGridBridge: MockBridge } = await import('./ShotGridBridge');
    const mockBridgeInstance = (MockBridge as any).mock.results.at(-1)?.value;
    if (mockBridgeInstance) {
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);
    }

    panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
    });

    // Verify created_at is passed through in options
    const callArgs = session.noteManager.addNote.mock.calls[0]!;
    expect(callArgs[5]).toEqual({ createdAt: '2023-06-15T08:30:00Z', externalId: '803', parentId: undefined, status: 'open' });
  });

  it('SG-INT-019: pullNotes passes undefined createdAt when created_at is empty', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const sgNotes: ShotGridNote[] = [
      {
        id: 804,
        subject: 'No date',
        content: 'Missing date',
        note_links: [{ type: 'Version', id: 101 }],
        created_at: '',
        user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
        sg_first_frame: null,
        sg_last_frame: null,
        frame_range: null,
        sg_status_list: null,
        reply_to_entity: null,
      },
    ];

    const { ShotGridBridge: MockBridge } = await import('./ShotGridBridge');
    const mockBridgeInstance = (MockBridge as any).mock.results.at(-1)?.value;
    if (mockBridgeInstance) {
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);
    }

    panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
    });

    // Empty string is falsy, so createdAt should be undefined (falls back to now in NoteManager)
    const callArgs = session.noteManager.addNote.mock.calls[0]!;
    expect(callArgs[5]).toEqual({ createdAt: undefined, externalId: '804', parentId: undefined, status: 'open' });
  });

  it('SG-INT-020: pullNotes deduplicates via noteManager after disconnect/reconnect', async () => {
    // Connect
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const sgNotes: ShotGridNote[] = [
      {
        id: 900,
        subject: 'Persistent note',
        content: 'Should not duplicate',
        note_links: [{ type: 'Version', id: 101 }],
        created_at: '2024-05-01T12:00:00Z',
        user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
        sg_first_frame: null,
        sg_last_frame: null,
        frame_range: null,
        sg_status_list: null,
        reply_to_entity: null,
      },
    ];

    const { ShotGridBridge: MockBridge } = await import('./ShotGridBridge');
    const mockBridgeInstance = (MockBridge as any).mock.results.at(-1)?.value;
    if (mockBridgeInstance) {
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);
    }

    // First pull - note gets added
    panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
    });

    // Disconnect (clears the in-memory sgNoteIdMap)
    configUI.emit('disconnect', undefined);

    // Reconnect
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    // Update mock bridge instance for new connection
    const newMockBridgeInstance = (MockBridge as any).mock.results.at(-1)?.value;
    if (newMockBridgeInstance) {
      newMockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);
    }

    // Simulate that the note already exists in the noteManager with externalId
    session.noteManager.findNoteByExternalId.mockReturnValue({
      id: 'local-note-1',
      externalId: '900',
    });

    // Second pull after reconnect - should be deduped via noteManager fallback
    panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(session.noteManager.findNoteByExternalId).toHaveBeenCalledWith('900');
    });

    // addNote should still only have been called once (from the first pull)
    expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
  });

  it('SG-INT-021: pullNotes adds new notes while deduplicating existing ones after reconnect', async () => {
    // Connect
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const sgNotes: ShotGridNote[] = [
      {
        id: 901,
        subject: 'Existing note',
        content: 'Already pulled',
        note_links: [{ type: 'Version', id: 101 }],
        created_at: '2024-05-01T12:00:00Z',
        user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
        sg_first_frame: null,
        sg_last_frame: null,
        frame_range: null,
        sg_status_list: null,
        reply_to_entity: null,
      },
      {
        id: 902,
        subject: 'New note',
        content: 'Brand new feedback',
        note_links: [{ type: 'Version', id: 101 }],
        created_at: '2024-05-02T12:00:00Z',
        user: { type: 'HumanUser', id: 6, name: 'Supervisor' },
        sg_first_frame: 10,
        sg_last_frame: 20,
        frame_range: '10-20',
        sg_status_list: null,
        reply_to_entity: null,
      },
    ];

    const { ShotGridBridge: MockBridge } = await import('./ShotGridBridge');
    const mockBridgeInstance = (MockBridge as any).mock.results.at(-1)?.value;
    if (mockBridgeInstance) {
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);
    }

    // Simulate note 901 already exists in noteManager (persisted from before disconnect)
    session.noteManager.findNoteByExternalId.mockImplementation((extId: string) => {
      if (extId === '901') return { id: 'local-existing', externalId: '901' };
      return undefined;
    });

    // Pull notes - 901 should be deduped, 902 should be added
    panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
    });

    // Only note 902 should have been added
    expect(session.noteManager.addNote).toHaveBeenCalledWith(
      0,
      10,
      20,
      'Brand new feedback',
      'Supervisor',
      { createdAt: '2024-05-02T12:00:00Z', externalId: '902', parentId: undefined, status: 'open' },
    );
  });

  it('SG-INT-022: pullNotes passes externalId as string to addNote', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const sgNotes: ShotGridNote[] = [
      {
        id: 999,
        subject: 'Test',
        content: 'Test note',
        note_links: [{ type: 'Version', id: 101 }],
        created_at: '2024-06-01T12:00:00Z',
        user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
        sg_first_frame: null,
        sg_last_frame: null,
        frame_range: null,
        sg_status_list: null,
        reply_to_entity: null,
      },
    ];

    const { ShotGridBridge: MockBridge } = await import('./ShotGridBridge');
    const mockBridgeInstance = (MockBridge as any).mock.results.at(-1)?.value;
    if (mockBridgeInstance) {
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);
    }

    panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
    });

    // Verify externalId is passed as a string version of the SG numeric ID
    const callArgs = session.noteManager.addNote.mock.calls[0]!;
    expect(callArgs[5]).toMatchObject({ externalId: '999' });
  });

  it('SG-INT-023: loadVersion registers version in VersionManager', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    panel.emit('loadVersion', {
      version: makeVersion({ id: 101, code: 'shot010_comp_v003', entity: { type: 'Shot', id: 10, name: 'shot010' } }),
      mediaUrl: 'https://s3.example.com/movie.mp4',
    });

    await vi.waitFor(() => {
      expect(session.versionManager.createGroup).toHaveBeenCalledTimes(1);
    });

    expect(session.versionManager.createGroup).toHaveBeenCalledWith(
      'shot010',
      [0],
      { labels: ['shot010_comp_v003'] },
    );
  });

  it('SG-INT-024: multiple versions of same shot are grouped together', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    // Load first version
    panel.emit('loadVersion', {
      version: makeVersion({ id: 101, code: 'shot010_comp_v001', entity: { type: 'Shot', id: 10, name: 'shot010' } }),
      mediaUrl: 'https://s3.example.com/v1.mp4',
    });

    await vi.waitFor(() => {
      expect(session.versionManager.createGroup).toHaveBeenCalledTimes(1);
    });

    // Increment sourceCount to simulate a new source being added
    session.sourceCount = 2;

    // Load second version of same shot
    panel.emit('loadVersion', {
      version: makeVersion({ id: 102, code: 'shot010_comp_v002', entity: { type: 'Shot', id: 10, name: 'shot010' } }),
      mediaUrl: 'https://s3.example.com/v2.mp4',
    });

    await vi.waitFor(() => {
      expect(session.versionManager.addVersionToGroup).toHaveBeenCalledTimes(1);
    });

    // Should have added to existing group, not created a new one
    expect(session.versionManager.createGroup).toHaveBeenCalledTimes(1);
    expect(session.versionManager.addVersionToGroup).toHaveBeenCalledWith(
      'group-1',
      1,
      {
        label: 'shot010_comp_v002',
        metadata: { sgVersionId: '102', sgStatus: 'rev' },
      },
    );
  });

  it('SG-INT-025: version labels match ShotGrid version code', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    panel.emit('loadVersion', {
      version: makeVersion({ id: 201, code: 'hero_shot_final_v007', entity: { type: 'Shot', id: 20, name: 'hero_shot' } }),
      mediaUrl: 'https://s3.example.com/hero.mp4',
    });

    await vi.waitFor(() => {
      expect(session.versionManager.createGroup).toHaveBeenCalledTimes(1);
    });

    expect(session.versionManager.createGroup).toHaveBeenCalledWith(
      'hero_shot',
      [0],
      { labels: ['hero_shot_final_v007'] },
    );
  });

  it('SG-INT-026: different shots create separate version groups', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    // Load version from shot A
    panel.emit('loadVersion', {
      version: makeVersion({ id: 301, code: 'shotA_v001', entity: { type: 'Shot', id: 30, name: 'shotA' } }),
      mediaUrl: 'https://s3.example.com/a.mp4',
    });

    await vi.waitFor(() => {
      expect(session.versionManager.createGroup).toHaveBeenCalledTimes(1);
    });

    session.sourceCount = 2;

    // Load version from shot B (different shot)
    panel.emit('loadVersion', {
      version: makeVersion({ id: 302, code: 'shotB_v001', entity: { type: 'Shot', id: 31, name: 'shotB' } }),
      mediaUrl: 'https://s3.example.com/b.mp4',
    });

    await vi.waitFor(() => {
      expect(session.versionManager.createGroup).toHaveBeenCalledTimes(2);
    });

    // Two separate groups, no addVersionToGroup calls
    expect(session.versionManager.addVersionToGroup).not.toHaveBeenCalled();
  });

  it('SG-INT-014: loadVersion does not log frame-sequence info for movie URLs', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    panel.emit('loadVersion', {
      version: makeVersion({ sg_uploaded_movie: { url: 'https://s3.example.com/movie.mp4' } }),
      mediaUrl: 'https://s3.example.com/movie.mp4',
    });

    await vi.waitFor(() => {
      expect(session.loadVideo).toHaveBeenCalled();
    });

    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Loading frame sequence path'),
    );

    consoleSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Regression tests for Issue #519: sequence pattern detection & routing
  // ---------------------------------------------------------------------------

  it('SG-INT-027: frame-sequence with %04d printf pattern loads as sequence', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const version = makeVersion({
      sg_uploaded_movie: null,
      sg_path_to_movie: '',
      sg_path_to_frames: '/renders/shot010/comp_v003.%04d.exr',
      sg_first_frame: 1001,
      sg_last_frame: 1048,
    });

    panel.emit('loadVersion', {
      version,
      mediaUrl: '/renders/shot010/comp_v003.%04d.exr',
    });

    await vi.waitFor(() => {
      expect(session.loadImageSequenceFromPattern).toHaveBeenCalledWith(
        'shot010_comp_v003',
        '/renders/shot010/comp_v003.%04d.exr',
        1001,
        1048,
      );
    });

    expect(session.loadImage).not.toHaveBeenCalled();
    expect(session.loadVideo).not.toHaveBeenCalled();
  });

  it('SG-INT-028: frame-sequence with @@@@ at-sign pattern loads as sequence', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const version = makeVersion({
      sg_uploaded_movie: null,
      sg_path_to_movie: '',
      sg_path_to_frames: '/renders/shot010/comp_v003.@@@@.exr',
      sg_first_frame: 1,
      sg_last_frame: 100,
    });

    panel.emit('loadVersion', {
      version,
      mediaUrl: '/renders/shot010/comp_v003.@@@@.exr',
    });

    await vi.waitFor(() => {
      expect(session.loadImageSequenceFromPattern).toHaveBeenCalledWith(
        'shot010_comp_v003',
        '/renders/shot010/comp_v003.@@@@.exr',
        1,
        100,
      );
    });

    expect(session.loadImage).not.toHaveBeenCalled();
  });

  it('SG-INT-029: frame-sequence falls back to frame_range when sg_first/last_frame are null', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const version = makeVersion({
      sg_uploaded_movie: null,
      sg_path_to_movie: '',
      sg_path_to_frames: '/renders/shot.####.exr',
      sg_first_frame: null,
      sg_last_frame: null,
      frame_range: '1001-1100',
    });

    panel.emit('loadVersion', {
      version,
      mediaUrl: '/renders/shot.####.exr',
    });

    await vi.waitFor(() => {
      expect(session.loadImageSequenceFromPattern).toHaveBeenCalledWith(
        'shot010_comp_v003',
        '/renders/shot.####.exr',
        1,       // startFrame defaults to 1 when sg_first_frame is null
        1100,    // endFrame parsed from frame_range
      );
    });
  });

  it('SG-INT-030: non-sequence path still loads as single image', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const version = makeVersion({
      sg_uploaded_movie: null,
      sg_path_to_movie: '',
      sg_path_to_frames: '/renders/still_image.exr',
    });

    panel.emit('loadVersion', {
      version,
      mediaUrl: '/renders/still_image.exr',
    });

    await vi.waitFor(() => {
      expect(session.loadImage).toHaveBeenCalledWith('shot010_comp_v003', '/renders/still_image.exr');
    });

    expect(session.loadImageSequenceFromPattern).not.toHaveBeenCalled();
  });

  it('SG-INT-031: uploaded movie URL takes priority over frame-sequence path', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    // Version has both uploaded movie and frame sequence path
    const version = makeVersion({
      sg_uploaded_movie: { url: 'https://s3.example.com/movie.mp4' },
      sg_path_to_frames: '/renders/shot.####.exr',
      sg_first_frame: 1001,
      sg_last_frame: 1100,
    });

    panel.emit('loadVersion', {
      version,
      mediaUrl: 'https://s3.example.com/movie.mp4',
    });

    await vi.waitFor(() => {
      expect(session.loadVideo).toHaveBeenCalledWith('shot010_comp_v003', 'https://s3.example.com/movie.mp4');
    });

    // Should NOT route through sequence loader when uploaded movie is available
    expect(session.loadImageSequenceFromPattern).not.toHaveBeenCalled();
  });

  it('SG-INT-032: sequence version registers in VersionManager after load', async () => {
    configUI.emit('connect', {
      serverUrl: 'https://studio.shotgrid.autodesk.com',
      scriptName: 'test',
      apiKey: 'key',
      projectId: 42,
    });

    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });

    const version = makeVersion({
      sg_uploaded_movie: null,
      sg_path_to_movie: '',
      sg_path_to_frames: '/renders/shot.####.exr',
      sg_first_frame: 1001,
      sg_last_frame: 1100,
    });

    panel.emit('loadVersion', {
      version,
      mediaUrl: '/renders/shot.####.exr',
    });

    await vi.waitFor(() => {
      expect(session.loadImageSequenceFromPattern).toHaveBeenCalled();
    });

    // Should still map version to source and register in VersionManager
    await vi.waitFor(() => {
      expect(panel.mapVersionToSource).toHaveBeenCalledWith(101, 0);
    });
    expect(session.versionManager.createGroup).toHaveBeenCalledWith(
      'shot010',
      [0],
      { labels: ['shot010_comp_v003'] },
    );
  });
});
