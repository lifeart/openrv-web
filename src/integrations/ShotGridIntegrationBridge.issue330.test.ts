/**
 * Regression tests for Issue #330:
 * ShotGrid note sync flattens local note threads and statuses
 * into plain top-level comments.
 *
 * Tests cover:
 * - Push: threaded notes maintain parent-child relationship
 * - Push: note status is included in payload
 * - Pull: ShotGrid replies are restored as threaded notes
 * - Pull: ShotGrid statuses map to local statuses
 * - Round-trip: push then pull preserves threads and statuses
 * - Backward compat: notes without parentId/status still work
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShotGridIntegrationBridge } from './ShotGridIntegrationBridge';
import { mapNoteStatusToShotGrid, mapNoteStatusFromShotGrid } from './ShotGridBridge';
import { EventEmitter } from '../utils/EventEmitter';
import type { ShotGridConfigEvents } from './ShotGridConfig';
import type { ShotGridPanelEvents } from '../ui/components/ShotGridPanel';
import type { ShotGridNote, ShotGridVersion } from './ShotGridBridge';

// ---------------------------------------------------------------------------
// Mocks (same shape as ShotGridIntegrationBridge.test.ts)
// ---------------------------------------------------------------------------

function createMockVersionManager() {
  const groups = new Map<string, any>();
  let groupIdCounter = 0;
  return {
    _groups: groups,
    createGroup: vi.fn((shotName: string, sourceIndices: number[], options?: { labels?: string[] }) => {
      const id = `group-${++groupIdCounter}`;
      const versions = sourceIndices.map((si, i) => ({
        versionNumber: i + 1,
        sourceIndex: si,
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

function createMockSession() {
  return {
    sourceCount: 1,
    loadImage: vi.fn().mockResolvedValue(undefined),
    loadVideo: vi.fn().mockResolvedValue(undefined),
    loadImageSequenceFromPattern: vi.fn().mockResolvedValue(undefined),
    noteManager: {
      getNotesForSource: vi.fn().mockReturnValue([]),
      addNote: vi
        .fn()
        .mockImplementation((_si: number, _fs: number, _fe: number, _text: string, _author: string, opts?: any) => ({
          id: `local-${crypto.randomUUID().slice(0, 8)}`,
          ...opts,
        })),
      findNoteByExternalId: vi.fn().mockReturnValue(undefined),
    },
    statusManager: {
      setStatus: vi.fn(),
      getStatus: vi.fn().mockReturnValue('pending'),
    },
    versionManager: createMockVersionManager(),
    getSourceByIndex: vi.fn().mockReturnValue({ duration: 100 }),
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
// Helpers
// ---------------------------------------------------------------------------

async function connectBridge(configUI: MockConfigUI) {
  configUI.emit('connect', {
    serverUrl: 'https://studio.shotgrid.autodesk.com',
    scriptName: 'test',
    apiKey: 'key',
    projectId: 42,
  });
  await vi.waitFor(() => {
    expect(configUI.setState).toHaveBeenCalledWith('connected');
  });
}

async function getMockBridgeInstance() {
  const { ShotGridBridge: MockBridge } = await import('./ShotGridBridge');
  return (MockBridge as any).mock.results.at(-1)?.value;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Issue #330: ShotGrid note threading and status sync', () => {
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

  // -----------------------------------------------------------------------
  // Note status mapping unit tests
  // -----------------------------------------------------------------------

  describe('note status mapping', () => {
    it('ISS330-MAP-001: mapNoteStatusToShotGrid maps all local NoteStatus values', () => {
      expect(mapNoteStatusToShotGrid('open')).toBe('opn');
      expect(mapNoteStatusToShotGrid('resolved')).toBe('clsd');
      expect(mapNoteStatusToShotGrid('wontfix')).toBe('clsd');
    });

    it('ISS330-MAP-002: mapNoteStatusFromShotGrid maps known SG codes', () => {
      expect(mapNoteStatusFromShotGrid('opn')).toBe('open');
      expect(mapNoteStatusFromShotGrid('clsd')).toBe('resolved');
      expect(mapNoteStatusFromShotGrid('res')).toBe('open'); // 'res' is no longer mapped; falls back to default
      expect(mapNoteStatusFromShotGrid('ip')).toBe('open');
    });

    it('ISS330-MAP-003: mapNoteStatusFromShotGrid defaults unknown codes to open', () => {
      expect(mapNoteStatusFromShotGrid('xyz')).toBe('open');
      expect(mapNoteStatusFromShotGrid('')).toBe('open');
    });

    it('ISS330-MAP-004: mapNoteStatusFromShotGrid handles null', () => {
      expect(mapNoteStatusFromShotGrid(null)).toBe('open');
    });

    it('ISS330-MAP-005: round-trip preserves open and resolved; wontfix loses fidelity', () => {
      // 'open' and 'resolved' round-trip cleanly
      expect(mapNoteStatusFromShotGrid(mapNoteStatusToShotGrid('open'))).toBe('open');
      expect(mapNoteStatusFromShotGrid(mapNoteStatusToShotGrid('resolved'))).toBe('resolved');

      // 'wontfix' maps to 'clsd' which maps back to 'resolved' (expected fidelity loss;
      // ShotGrid has no distinct wontfix status)
      expect(mapNoteStatusToShotGrid('wontfix')).toBe('clsd');
      expect(mapNoteStatusFromShotGrid('clsd')).toBe('resolved');
    });
  });

  // -----------------------------------------------------------------------
  // Push flow
  // -----------------------------------------------------------------------

  describe('push: threaded notes', () => {
    it('ISS330-PUSH-001: pushNotes includes note status in payload', async () => {
      await connectBridge(configUI);

      session.noteManager.getNotesForSource.mockReturnValue([
        { id: 'n1', text: 'Resolved note', frameStart: 1, frameEnd: 10, parentId: null, status: 'resolved' },
      ]);

      const mockBridgeInstance = await getMockBridgeInstance();
      mockBridgeInstance.pushNote.mockResolvedValue({ id: 600, subject: 'Resolved note' });

      panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

      await vi.waitFor(() => {
        expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
      });

      const pushCall = mockBridgeInstance.pushNote.mock.calls[0]!;
      expect(pushCall[1].noteStatus).toBe('clsd'); // 'resolved' -> 'clsd'
    });

    it('ISS330-PUSH-002: pushNotes sends parent notes before children', async () => {
      await connectBridge(configUI);

      // Child appears before parent in the array to test sorting
      session.noteManager.getNotesForSource.mockReturnValue([
        { id: 'child1', text: 'Reply note', frameStart: 1, frameEnd: 1, parentId: 'parent1', status: 'open' },
        { id: 'parent1', text: 'Parent note', frameStart: 1, frameEnd: 1, parentId: null, status: 'open' },
      ]);

      const pushOrder: string[] = [];
      const mockBridgeInstance = await getMockBridgeInstance();
      let sgIdCounter = 600;
      mockBridgeInstance.pushNote.mockImplementation((_vid: number, opts: any) => {
        pushOrder.push(opts.text);
        return Promise.resolve({ id: ++sgIdCounter, subject: opts.text });
      });

      panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

      await vi.waitFor(() => {
        expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(2);
      });

      // Parent must be pushed first
      expect(pushOrder[0]).toBe('Parent note');
      expect(pushOrder[1]).toBe('Reply note');
    });

    it('ISS330-PUSH-003: pushNotes sets replyToNoteId for child notes', async () => {
      await connectBridge(configUI);

      session.noteManager.getNotesForSource.mockReturnValue([
        { id: 'parent1', text: 'Parent', frameStart: 5, frameEnd: 5, parentId: null, status: 'open' },
        { id: 'child1', text: 'Reply', frameStart: 5, frameEnd: 5, parentId: 'parent1', status: 'open' },
      ]);

      const mockBridgeInstance = await getMockBridgeInstance();
      let sgIdCounter = 700;
      mockBridgeInstance.pushNote.mockImplementation(() => {
        return Promise.resolve({ id: ++sgIdCounter, subject: 'Test' });
      });

      panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

      await vi.waitFor(() => {
        expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(2);
      });

      // Parent note: no replyToNoteId
      const parentCall = mockBridgeInstance.pushNote.mock.calls[0]!;
      expect(parentCall[1].replyToNoteId).toBeUndefined();

      // Child note: replyToNoteId should be the SG ID of the parent (701)
      const childCall = mockBridgeInstance.pushNote.mock.calls[1]!;
      expect(childCall[1].replyToNoteId).toBe(701);
    });

    it('ISS330-PUSH-004: pushNotes handles deeply nested threads', async () => {
      await connectBridge(configUI);

      session.noteManager.getNotesForSource.mockReturnValue([
        { id: 'grandchild', text: 'GC', frameStart: 1, frameEnd: 1, parentId: 'child', status: 'open' },
        { id: 'child', text: 'C', frameStart: 1, frameEnd: 1, parentId: 'root', status: 'resolved' },
        { id: 'root', text: 'R', frameStart: 1, frameEnd: 1, parentId: null, status: 'wontfix' },
      ]);

      const pushOrder: string[] = [];
      const mockBridgeInstance = await getMockBridgeInstance();
      let sgIdCounter = 800;
      mockBridgeInstance.pushNote.mockImplementation((_vid: number, opts: any) => {
        pushOrder.push(opts.text);
        return Promise.resolve({ id: ++sgIdCounter, subject: opts.text });
      });

      panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

      await vi.waitFor(() => {
        expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(3);
      });

      // Order: root -> child -> grandchild
      expect(pushOrder).toEqual(['R', 'C', 'GC']);

      // Status mappings
      expect(mockBridgeInstance.pushNote.mock.calls[0]![1].noteStatus).toBe('clsd'); // wontfix -> clsd
      expect(mockBridgeInstance.pushNote.mock.calls[1]![1].noteStatus).toBe('clsd'); // resolved
      expect(mockBridgeInstance.pushNote.mock.calls[2]![1].noteStatus).toBe('opn'); // open

      // Reply chain: root has no parent, child replies to root(801), grandchild replies to child(802)
      expect(mockBridgeInstance.pushNote.mock.calls[0]![1].replyToNoteId).toBeUndefined();
      expect(mockBridgeInstance.pushNote.mock.calls[1]![1].replyToNoteId).toBe(801);
      expect(mockBridgeInstance.pushNote.mock.calls[2]![1].replyToNoteId).toBe(802);
    });

    it('ISS330-PUSH-005: pushNotes handles orphaned children gracefully', async () => {
      await connectBridge(configUI);

      // Child references a parent that is not in this source's notes
      session.noteManager.getNotesForSource.mockReturnValue([
        { id: 'orphan', text: 'Orphan reply', frameStart: 1, frameEnd: 1, parentId: 'missing-parent', status: 'open' },
      ]);

      const mockBridgeInstance = await getMockBridgeInstance();
      mockBridgeInstance.pushNote.mockResolvedValue({ id: 900, subject: 'Test' });

      panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

      await vi.waitFor(() => {
        expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
      });

      // replyToNoteId should be undefined since parent wasn't pushed
      expect(mockBridgeInstance.pushNote.mock.calls[0]![1].replyToNoteId).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Pull flow
  // -----------------------------------------------------------------------

  describe('pull: threaded notes and statuses', () => {
    it('ISS330-PULL-001: pullNotes restores status from sg_status_list', async () => {
      await connectBridge(configUI);

      const sgNotes: ShotGridNote[] = [
        {
          id: 1001,
          subject: 'Resolved note',
          content: 'This was resolved',
          note_links: [{ type: 'Version', id: 101 }],
          created_at: '2024-06-01T12:00:00Z',
          user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
          sg_first_frame: null,
          sg_last_frame: null,
          frame_range: null,
          sg_status_list: 'clsd',
          reply_to_entity: null,
        },
      ];

      const mockBridgeInstance = await getMockBridgeInstance();
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);

      panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

      await vi.waitFor(() => {
        expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
      });

      const callArgs = session.noteManager.addNote.mock.calls[0]!;
      expect(callArgs[5].status).toBe('resolved');
    });

    it('ISS330-PULL-002: pullNotes restores parentId from reply_to_entity', async () => {
      await connectBridge(configUI);

      // Parent note returned by SG, followed by a reply
      const sgNotes: ShotGridNote[] = [
        {
          id: 1010,
          subject: 'Parent',
          content: 'Top-level note',
          note_links: [{ type: 'Version', id: 101 }],
          created_at: '2024-06-01T12:00:00Z',
          user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
          sg_first_frame: 10,
          sg_last_frame: 20,
          frame_range: '10-20',
          sg_status_list: 'opn',
          reply_to_entity: null,
        },
        {
          id: 1011,
          subject: 'Reply',
          content: 'Reply to parent',
          note_links: [{ type: 'Version', id: 101 }],
          created_at: '2024-06-01T12:05:00Z',
          user: { type: 'HumanUser', id: 6, name: 'Supervisor' },
          sg_first_frame: 10,
          sg_last_frame: 20,
          frame_range: '10-20',
          sg_status_list: 'clsd',
          reply_to_entity: { type: 'Note' as const, id: 1010 },
        },
      ];

      // Make addNote return predictable IDs
      let localIdCounter = 0;
      session.noteManager.addNote.mockImplementation(() => {
        return { id: `local-${++localIdCounter}` };
      });

      const mockBridgeInstance = await getMockBridgeInstance();
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);

      panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

      await vi.waitFor(() => {
        expect(session.noteManager.addNote).toHaveBeenCalledTimes(2);
      });

      // First note: top-level, no parentId
      const parentCallArgs = session.noteManager.addNote.mock.calls[0]!;
      expect(parentCallArgs[5].parentId).toBeUndefined();
      expect(parentCallArgs[5].status).toBe('open');

      // Second note: reply to parent, parentId should be local-1
      const childCallArgs = session.noteManager.addNote.mock.calls[1]!;
      expect(childCallArgs[5].parentId).toBe('local-1');
      expect(childCallArgs[5].status).toBe('resolved');
    });

    it('ISS330-PULL-003: pullNotes maps all ShotGrid note statuses correctly', async () => {
      await connectBridge(configUI);

      // Pull multiple notes with different statuses in a single batch
      const sgNotes: ShotGridNote[] = [
        {
          id: 2000,
          subject: 'Status opn',
          content: 'Note with opn',
          note_links: [{ type: 'Version', id: 101 }],
          created_at: '2024-06-01T12:00:00Z',
          user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
          sg_first_frame: null,
          sg_last_frame: null,
          frame_range: null,
          sg_status_list: 'opn',
          reply_to_entity: null,
        },
        {
          id: 2001,
          subject: 'Status clsd',
          content: 'Note with clsd',
          note_links: [{ type: 'Version', id: 101 }],
          created_at: '2024-06-01T12:01:00Z',
          user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
          sg_first_frame: null,
          sg_last_frame: null,
          frame_range: null,
          sg_status_list: 'clsd',
          reply_to_entity: null,
        },
        {
          id: 2002,
          subject: 'Status res',
          content: 'Note with res',
          note_links: [{ type: 'Version', id: 101 }],
          created_at: '2024-06-01T12:02:00Z',
          user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
          sg_first_frame: null,
          sg_last_frame: null,
          frame_range: null,
          sg_status_list: 'res',
          reply_to_entity: null,
        },
        {
          id: 2003,
          subject: 'Status ip',
          content: 'Note with ip',
          note_links: [{ type: 'Version', id: 101 }],
          created_at: '2024-06-01T12:03:00Z',
          user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
          sg_first_frame: null,
          sg_last_frame: null,
          frame_range: null,
          sg_status_list: 'ip',
          reply_to_entity: null,
        },
      ];

      const mockBridgeInstance = await getMockBridgeInstance();
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);

      panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

      await vi.waitFor(() => {
        expect(session.noteManager.addNote).toHaveBeenCalledTimes(4);
      });

      expect(session.noteManager.addNote.mock.calls[0]![5].status).toBe('open');
      expect(session.noteManager.addNote.mock.calls[1]![5].status).toBe('resolved');
      expect(session.noteManager.addNote.mock.calls[2]![5].status).toBe('open'); // 'res' no longer mapped; defaults to open
      expect(session.noteManager.addNote.mock.calls[3]![5].status).toBe('open'); // 'ip' -> 'open'
    });

    it('ISS330-PULL-004: pullNotes defaults to open status when sg_status_list is null', async () => {
      await connectBridge(configUI);

      const sgNotes: ShotGridNote[] = [
        {
          id: 3000,
          subject: 'No status',
          content: 'Note without status field',
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

      const mockBridgeInstance = await getMockBridgeInstance();
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);

      panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

      await vi.waitFor(() => {
        expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
      });

      const callArgs = session.noteManager.addNote.mock.calls[0]!;
      expect(callArgs[5].status).toBe('open');
    });

    it('ISS330-PULL-005: pullNotes handles reply_to_entity referencing a note not in current batch', async () => {
      await connectBridge(configUI);

      // Reply references a parent note that wasn't returned in this batch
      const sgNotes: ShotGridNote[] = [
        {
          id: 4001,
          subject: 'Orphan reply',
          content: 'Reply to unknown parent',
          note_links: [{ type: 'Version', id: 101 }],
          created_at: '2024-06-01T12:00:00Z',
          user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
          sg_first_frame: null,
          sg_last_frame: null,
          frame_range: null,
          sg_status_list: 'opn',
          reply_to_entity: { type: 'Note' as const, id: 9999 },
        },
      ];

      const mockBridgeInstance = await getMockBridgeInstance();
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);

      panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

      await vi.waitFor(() => {
        expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
      });

      // parentId should be undefined since parent SG ID 9999 was not found
      const callArgs = session.noteManager.addNote.mock.calls[0]!;
      expect(callArgs[5].parentId).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Backward compatibility
  // -----------------------------------------------------------------------

  describe('backward compatibility', () => {
    it('ISS330-COMPAT-001: pushNotes works for notes without parentId (top-level)', async () => {
      await connectBridge(configUI);

      session.noteManager.getNotesForSource.mockReturnValue([
        { id: 'n1', text: 'Simple note', frameStart: 1, frameEnd: 5, parentId: null, status: 'open' },
      ]);

      const mockBridgeInstance = await getMockBridgeInstance();
      mockBridgeInstance.pushNote.mockResolvedValue({ id: 500, subject: 'Simple note' });

      panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

      await vi.waitFor(() => {
        expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
      });

      const pushCall = mockBridgeInstance.pushNote.mock.calls[0]!;
      expect(pushCall[1].replyToNoteId).toBeUndefined();
      expect(pushCall[1].noteStatus).toBe('opn');
      expect(pushCall[1].text).toBe('Simple note');
    });

    it('ISS330-COMPAT-002: pullNotes works when SG note has no reply_to_entity or sg_status_list', async () => {
      await connectBridge(configUI);

      const sgNotes: ShotGridNote[] = [
        {
          id: 5000,
          subject: 'Legacy note',
          content: 'Old note without new fields',
          note_links: [{ type: 'Version', id: 101 }],
          created_at: '2024-01-01T12:00:00Z',
          user: { type: 'HumanUser', id: 5, name: 'Reviewer' },
          sg_first_frame: null,
          sg_last_frame: null,
          frame_range: null,
          sg_status_list: null,
          reply_to_entity: null,
        },
      ];

      const mockBridgeInstance = await getMockBridgeInstance();
      mockBridgeInstance.getNotesForVersion.mockResolvedValue(sgNotes);

      panel.emit('pullNotes', { versionId: 101, sourceIndex: 0 });

      await vi.waitFor(() => {
        expect(session.noteManager.addNote).toHaveBeenCalledTimes(1);
      });

      const callArgs = session.noteManager.addNote.mock.calls[0]!;
      expect(callArgs[3]).toBe('Old note without new fields'); // text
      expect(callArgs[4]).toBe('Reviewer'); // author
      expect(callArgs[5].status).toBe('open'); // default
      expect(callArgs[5].parentId).toBeUndefined(); // no parent
      expect(callArgs[5].externalId).toBe('5000');
    });

    it('ISS330-COMPAT-003: pushNotes still includes frameRange and text', async () => {
      await connectBridge(configUI);

      session.noteManager.getNotesForSource.mockReturnValue([
        { id: 'n1', text: 'Frame feedback', frameStart: 10, frameEnd: 20, parentId: null, status: 'open' },
      ]);

      const mockBridgeInstance = await getMockBridgeInstance();
      mockBridgeInstance.pushNote.mockResolvedValue({ id: 500, subject: 'Test' });

      panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

      await vi.waitFor(() => {
        expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
      });

      const pushCall = mockBridgeInstance.pushNote.mock.calls[0]!;
      expect(pushCall[0]).toBe(101); // versionId
      expect(pushCall[1].text).toBe('Frame feedback');
      expect(pushCall[1].frameRange).toBe('10-20');
    });
  });

  // -----------------------------------------------------------------------
  // ShotGridBridge push payload tests
  // -----------------------------------------------------------------------

  describe('ShotGridBridge push payload', () => {
    it('ISS330-BRIDGE-001: pushNote includes sg_status_list in attributes', async () => {
      // Use real ShotGridBridge to test payload construction
      const { ShotGridBridge: RealBridge } =
        await vi.importActual<typeof import('./ShotGridBridge')>('./ShotGridBridge');

      const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
      // Auth response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: () => Promise.resolve({ access_token: 'token', expires_in: 300 }),
        text: () => Promise.resolve(''),
      } as Response);
      // Note creation response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Headers(),
        json: () => Promise.resolve({ data: { id: 999, subject: 'Test' } }),
        text: () => Promise.resolve(''),
      } as Response);

      const realBridge = new RealBridge(
        { serverUrl: 'https://sg.test', scriptName: 's', apiKey: 'k', projectId: 1 },
        mockFetch as unknown as typeof fetch,
      );

      await realBridge.pushNote(101, {
        text: 'Test note',
        noteStatus: 'clsd',
      });

      const body = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(body.data.attributes.sg_status_list).toBe('clsd');
    });

    it('ISS330-BRIDGE-002: pushNote includes reply_to_entity in relationships', async () => {
      const { ShotGridBridge: RealBridge } =
        await vi.importActual<typeof import('./ShotGridBridge')>('./ShotGridBridge');

      const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: () => Promise.resolve({ access_token: 'token', expires_in: 300 }),
        text: () => Promise.resolve(''),
      } as Response);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Headers(),
        json: () => Promise.resolve({ data: { id: 1000, subject: 'Reply' } }),
        text: () => Promise.resolve(''),
      } as Response);

      const realBridge = new RealBridge(
        { serverUrl: 'https://sg.test', scriptName: 's', apiKey: 'k', projectId: 1 },
        mockFetch as unknown as typeof fetch,
      );

      await realBridge.pushNote(101, {
        text: 'Reply note',
        replyToNoteId: 888,
      });

      const body = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(body.data.relationships.reply_to_entity).toEqual({
        data: { type: 'Note', id: 888 },
      });
    });

    it('ISS330-BRIDGE-003: pushNote omits reply_to_entity when not provided', async () => {
      const { ShotGridBridge: RealBridge } =
        await vi.importActual<typeof import('./ShotGridBridge')>('./ShotGridBridge');

      const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: () => Promise.resolve({ access_token: 'token', expires_in: 300 }),
        text: () => Promise.resolve(''),
      } as Response);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Headers(),
        json: () => Promise.resolve({ data: { id: 1001, subject: 'Top' } }),
        text: () => Promise.resolve(''),
      } as Response);

      const realBridge = new RealBridge(
        { serverUrl: 'https://sg.test', scriptName: 's', apiKey: 'k', projectId: 1 },
        mockFetch as unknown as typeof fetch,
      );

      await realBridge.pushNote(101, { text: 'Top-level note' });

      const body = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(body.data.relationships.reply_to_entity).toBeUndefined();
    });

    it('ISS330-BRIDGE-004: pushNote omits sg_status_list when not provided', async () => {
      const { ShotGridBridge: RealBridge } =
        await vi.importActual<typeof import('./ShotGridBridge')>('./ShotGridBridge');

      const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: () => Promise.resolve({ access_token: 'token', expires_in: 300 }),
        text: () => Promise.resolve(''),
      } as Response);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Headers(),
        json: () => Promise.resolve({ data: { id: 1002, subject: 'No status' } }),
        text: () => Promise.resolve(''),
      } as Response);

      const realBridge = new RealBridge(
        { serverUrl: 'https://sg.test', scriptName: 's', apiKey: 'k', projectId: 1 },
        mockFetch as unknown as typeof fetch,
      );

      await realBridge.pushNote(101, { text: 'No status note' });

      const body = JSON.parse(mockFetch.mock.calls[1]![1]?.body as string);
      expect(body.data.attributes.sg_status_list).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // getNotesForVersion field request
  // -----------------------------------------------------------------------

  describe('getNotesForVersion fields', () => {
    it('ISS330-BRIDGE-005: getNotesForVersion requests sg_status_list and reply_to_entity', async () => {
      const { ShotGridBridge: RealBridge } =
        await vi.importActual<typeof import('./ShotGridBridge')>('./ShotGridBridge');

      const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: () => Promise.resolve({ access_token: 'token', expires_in: 300 }),
        text: () => Promise.resolve(''),
      } as Response);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: () => Promise.resolve({ data: [] }),
        text: () => Promise.resolve(''),
      } as Response);

      const realBridge = new RealBridge(
        { serverUrl: 'https://sg.test', scriptName: 's', apiKey: 'k', projectId: 1 },
        mockFetch as unknown as typeof fetch,
      );

      await realBridge.getNotesForVersion(101);

      const url = mockFetch.mock.calls[1]![0] as string;
      expect(url).toContain('sg_status_list');
      expect(url).toContain('reply_to_entity');
    });
  });
});
