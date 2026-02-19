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

function createMockSession() {
  return {
    sourceCount: 1,
    loadImage: vi.fn().mockResolvedValue(undefined),
    loadVideo: vi.fn().mockResolvedValue(undefined),
    noteManager: {
      getNotesForSource: vi.fn().mockReturnValue([]),
      addNote: vi.fn().mockReturnValue({ id: 'local-note-1' }),
    },
    statusManager: {
      setStatus: vi.fn(),
      getStatus: vi.fn().mockReturnValue('pending'),
    },
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
    ShotGridBridge: vi.fn().mockImplementation(() => ({
      authenticate: vi.fn().mockResolvedValue(undefined),
      getVersionsForPlaylist: vi.fn().mockResolvedValue([makeVersion()]),
      getVersionsForShot: vi.fn().mockResolvedValue([makeVersion()]),
      getNotesForVersion: vi.fn().mockResolvedValue([]),
      pushNote: vi.fn().mockResolvedValue({ id: 500, subject: 'Test' }),
      pushStatus: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    })),
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
      { id: 'n1', text: 'Note 1', frameStart: 1, frameEnd: 10 },
      { id: 'n2', text: 'Note 2', frameStart: 5, frameEnd: 5 },
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
      expect(panel.setError).toHaveBeenCalledWith(
        expect.stringContaining('failed')
      );
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
    await new Promise(r => setTimeout(r, 10));

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
    session.loadVideo.mockImplementation(() => new Promise(resolve => {
      setTimeout(resolve, 50);
    }));

    panel.emit('loadVersion', {
      version: makeVersion(),
      mediaUrl: 'https://s3.example.com/movie.mp4',
    });

    // Disconnect before loadVideo completes (increments generation)
    configUI.emit('disconnect', undefined);

    // Wait for loadVideo to complete
    await new Promise(r => setTimeout(r, 100));

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
      { id: 'n1', text: 'Note 1', frameStart: 1, frameEnd: 1 },
      { id: 'n2', text: 'Note 2', frameStart: 2, frameEnd: 2 },
      { id: 'n3', text: 'Note 3', frameStart: 3, frameEnd: 3 },
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

    await new Promise(r => setTimeout(r, 50));

    // Only the first push should have been attempted before bridge was nulled
    if (mockBridgeInstance) {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    }
  });
});
