import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppNetworkBridge } from './AppNetworkBridge';
import { EventEmitter } from './utils/EventEmitter';
import { PaintEngine } from './paint/PaintEngine';
import { NoteManager } from './core/session/NoteManager';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockSession extends EventEmitter {
  currentFrame = 1;
  playbackSpeed = 1;
  playDirection = 1;
  loopMode = 'loop';
  isPlaying = false;
  play = vi.fn();
  pause = vi.fn();
  goToFrame = vi.fn();
  noteManager = new NoteManager();
}

// Helper to track unsubscribers
const networkUnsubscribers: Set<() => void> = new Set();
const managerUnsubscribers: Set<() => void> = new Set();

/**
 * EventEmitter-based mock for NetworkSyncManager that supports
 * both `on` tracking and simulating incoming events.
 */
class MockNetworkSyncManager extends EventEmitter {
  isConnected = true;
  sendPlaybackSync = vi.fn();
  sendFrameSync = vi.fn();
  sendAnnotationSync = vi.fn();
  sendNoteSync = vi.fn();
  simulateRoomCreated = vi.fn();
  joinRoom = vi.fn();
  leaveRoom = vi.fn();
  setSyncSettings = vi.fn();
  roomInfo = null;
  isHost = false;

  private _sm = {
    isApplyingRemoteState: false,
    beginApplyRemote: vi.fn(),
    endApplyRemote: vi.fn(),
    shouldApplyFrameSync: vi.fn(() => true),
  };

  getSyncStateManager = vi.fn(() => this._sm);

  // Override `on` to track unsubscribers while still wiring real events
  // @ts-expect-error -- override signature for testing
  override on(event: string, handler: (...args: any[]) => void): () => void {
    const unsub = super.on(event as any, handler as any);
    const wrappedUnsub = vi.fn(() => unsub());
    managerUnsubscribers.add(wrappedUnsub);
    return wrappedUnsub;
  }
}

function createMockNetworkControl() {
  return {
    on: vi.fn(() => {
      const unsub = vi.fn();
      networkUnsubscribers.add(unsub);
      return unsub;
    }),
    render: vi.fn(() => document.createElement('div')),
    setConnectionState: vi.fn(),
    setRoomInfo: vi.fn(),
    setUsers: vi.fn(),
    showError: vi.fn(),
    setRTT: vi.fn(),
  };
}

function createMockViewer() {
  return {
    setZoom: vi.fn(),
    getColorAdjustments: vi.fn(() => ({
      exposure: 0, gamma: 1, saturation: 1, vibrance: 0,
      vibranceSkinProtection: false, contrast: 1, clarity: 0,
      hueRotation: 0, temperature: 0, tint: 0, brightness: 0,
      highlights: 0, shadows: 0, whites: 0, blacks: 0,
    })),
    setColorAdjustments: vi.fn(),
  };
}

function createMockHeaderBar() {
  return {
    setNetworkControl: vi.fn(),
  };
}

function createContext() {
  const session = new MockSession();
  const networkSyncManager = new MockNetworkSyncManager();
  const networkControl = createMockNetworkControl();
  const viewer = createMockViewer();
  const headerBar = createMockHeaderBar();
  const paintEngine = new PaintEngine();

  return {
    session: session as any,
    viewer: viewer as any,
    paintEngine,
    networkSyncManager: networkSyncManager as any,
    networkControl: networkControl as any,
    headerBar: headerBar as any,
    // Keep typed references for assertions
    _session: session,
    _networkSyncManager: networkSyncManager,
    _networkControl: networkControl,
    _viewer: viewer,
    _headerBar: headerBar,
    _paintEngine: paintEngine,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppNetworkBridge', () => {
  let ctx: ReturnType<typeof createContext>;
  let bridge: AppNetworkBridge;

  beforeEach(() => {
    networkUnsubscribers.clear();
    managerUnsubscribers.clear();
    ctx = createContext();
    bridge = new AppNetworkBridge({
      session: ctx.session,
      viewer: ctx.viewer,
      paintEngine: ctx.paintEngine,
      networkSyncManager: ctx.networkSyncManager,
      networkControl: ctx.networkControl,
      headerBar: ctx.headerBar,
    });
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('ANB-001: creates bridge without throwing', () => {
      expect(bridge).toBeInstanceOf(AppNetworkBridge);
    });
  });

  // -----------------------------------------------------------------------
  // setup
  // -----------------------------------------------------------------------
  describe('setup', () => {
    it('ANB-010: setup() wires events without throwing', () => {
      expect(() => bridge.setup()).not.toThrow();
    });

    it('ANB-011: after setup, session playbackChanged triggers sendPlaybackSync', () => {
      bridge.setup();

      ctx._session.emit('playbackChanged', true);

      expect(ctx._networkSyncManager.sendPlaybackSync).toHaveBeenCalledTimes(1);
      expect(ctx._networkSyncManager.sendPlaybackSync).toHaveBeenCalledWith(
        expect.objectContaining({
          isPlaying: true,
          currentFrame: ctx._session.currentFrame,
          playbackSpeed: ctx._session.playbackSpeed,
          playDirection: ctx._session.playDirection,
          loopMode: ctx._session.loopMode,
        }),
      );
    });

    it('ANB-012: after setup, session frameChanged triggers sendFrameSync', () => {
      bridge.setup();

      ctx._session.emit('frameChanged', 42);

      expect(ctx._networkSyncManager.sendFrameSync).toHaveBeenCalledTimes(1);
      expect(ctx._networkSyncManager.sendFrameSync).toHaveBeenCalledWith(42);
    });
  });

  // -----------------------------------------------------------------------
  // dispose
  // -----------------------------------------------------------------------
  describe('dispose', () => {
    it('ANB-020: dispose() calls unsubscribers (session event listeners are removed)', () => {
      bridge.setup();
      bridge.dispose();

      // After dispose, emitting events should not call sync methods
      ctx._session.emit('playbackChanged', true);
      ctx._session.emit('frameChanged', 10);

      expect(ctx._networkSyncManager.sendPlaybackSync).not.toHaveBeenCalled();
      expect(ctx._networkSyncManager.sendFrameSync).not.toHaveBeenCalled();
    });

    it('ANB-021: after dispose, session playbackChanged does NOT trigger sendPlaybackSync', () => {
      bridge.setup();

      // Verify it works before dispose
      ctx._session.emit('playbackChanged', false);
      expect(ctx._networkSyncManager.sendPlaybackSync).toHaveBeenCalledTimes(1);

      bridge.dispose();
      ctx._networkSyncManager.sendPlaybackSync.mockClear();

      // Should not trigger after dispose
      ctx._session.emit('playbackChanged', true);
      expect(ctx._networkSyncManager.sendPlaybackSync).not.toHaveBeenCalled();
    });

    it('ANB-022: after dispose, session frameChanged does NOT trigger sendFrameSync', () => {
      bridge.setup();

      // Verify it works before dispose
      ctx._session.emit('frameChanged', 5);
      expect(ctx._networkSyncManager.sendFrameSync).toHaveBeenCalledTimes(1);

      bridge.dispose();
      ctx._networkSyncManager.sendFrameSync.mockClear();

      // Should not trigger after dispose
      ctx._session.emit('frameChanged', 99);
      expect(ctx._networkSyncManager.sendFrameSync).not.toHaveBeenCalled();
    });

    it('ANB-023: dispose() is idempotent', () => {
      bridge.setup();

      expect(() => {
        bridge.dispose();
        bridge.dispose();
        bridge.dispose();
      }).not.toThrow();
    });

    it('ANB-024: dispose() empties unsubscribers array', () => {
      bridge.setup();
      bridge.dispose();

      // Access the private field via type assertion for verification
      expect((bridge as any).unsubscribers).toEqual([]);
    });

    it('ANB-025: dispose() without prior setup() does not throw', () => {
      expect(() => bridge.dispose()).not.toThrow();
      expect((bridge as any).unsubscribers).toEqual([]);
    });

    it('ANB-030: dispose() calls unsubscribe for NetworkControl listeners', () => {
      bridge.setup();
      
      // We expect at least one listener (e.g. createRoom)
      expect(networkUnsubscribers.size).toBeGreaterThan(0);
      
      bridge.dispose();

      for (const unsub of networkUnsubscribers) {
        expect(unsub).toHaveBeenCalled();
      }
    });

    it('ANB-031: dispose() calls unsubscribe for NetworkSyncManager listeners', () => {
      bridge.setup();

      // We expect at least one listener (e.g. connectionStateChanged)
      expect(managerUnsubscribers.size).toBeGreaterThan(0);

      bridge.dispose();

      for (const unsub of managerUnsubscribers) {
        expect(unsub).toHaveBeenCalled();
      }
    });
  });

  // -----------------------------------------------------------------------
  // Annotation sync
  // -----------------------------------------------------------------------
  describe('annotation sync', () => {
    it('ANB-040: incoming syncAnnotation add applies to PaintEngine', () => {
      bridge.setup();

      const annotation = {
        type: 'pen' as const,
        id: 'remote-1',
        frame: 5,
        user: 'alice',
        color: [1, 0, 0, 1] as [number, number, number, number],
        width: 3,
        brush: 0,
        points: [{ x: 0.1, y: 0.2 }],
        join: 3,
        cap: 2,
        splat: false,
        mode: 0,
        startFrame: 5,
        duration: 0,
      };

      ctx._networkSyncManager.emit('syncAnnotation', {
        frame: 5,
        strokes: [annotation],
        action: 'add',
        annotationId: 'remote-1',
        timestamp: Date.now(),
      });

      const annotations = ctx._paintEngine.getAnnotationsForFrame(5);
      expect(annotations).toHaveLength(1);
      expect(annotations[0]!.id).toBe('remote-1');
    });

    it('ANB-041: incoming syncAnnotation remove deletes annotation from PaintEngine', () => {
      bridge.setup();

      // First add an annotation
      const annotation = {
        type: 'pen' as const,
        id: 'remote-2',
        frame: 3,
        user: 'alice',
        color: [1, 0, 0, 1] as [number, number, number, number],
        width: 3,
        brush: 0,
        points: [{ x: 0.1, y: 0.2 }],
        join: 3,
        cap: 2,
        splat: false,
        mode: 0,
        startFrame: 3,
        duration: 0,
      };
      ctx._paintEngine.addRemoteAnnotation(annotation);
      expect(ctx._paintEngine.getAnnotationsForFrame(3)).toHaveLength(1);

      // Now remove via sync
      ctx._networkSyncManager.emit('syncAnnotation', {
        frame: 3,
        strokes: [],
        action: 'remove',
        annotationId: 'remote-2',
        timestamp: Date.now(),
      });

      expect(ctx._paintEngine.getAnnotationsForFrame(3)).toHaveLength(0);
    });

    it('ANB-042: incoming syncAnnotation clear removes all annotations on frame', () => {
      bridge.setup();

      // Add multiple annotations
      ctx._paintEngine.addRemoteAnnotation({
        type: 'pen', id: 'a1', frame: 7, user: 'alice',
        color: [1, 0, 0, 1], width: 3, brush: 0, points: [{ x: 0, y: 0 }],
        join: 3, cap: 2, splat: false, mode: 0, startFrame: 7, duration: 0,
      } as any);
      ctx._paintEngine.addRemoteAnnotation({
        type: 'pen', id: 'a2', frame: 7, user: 'bob',
        color: [0, 1, 0, 1], width: 3, brush: 0, points: [{ x: 0.5, y: 0.5 }],
        join: 3, cap: 2, splat: false, mode: 0, startFrame: 7, duration: 0,
      } as any);
      expect(ctx._paintEngine.getAnnotationsForFrame(7)).toHaveLength(2);

      ctx._networkSyncManager.emit('syncAnnotation', {
        frame: 7,
        strokes: [],
        action: 'clear',
        timestamp: Date.now(),
      });

      expect(ctx._paintEngine.getAnnotationsForFrame(7)).toHaveLength(0);
    });

    it('ANB-043: local strokeAdded triggers sendAnnotationSync', () => {
      bridge.setup();

      ctx._paintEngine.tool = 'pen';
      ctx._paintEngine.beginStroke(10, { x: 0.1, y: 0.2 });
      ctx._paintEngine.continueStroke({ x: 0.3, y: 0.4 });
      ctx._paintEngine.endStroke();

      expect(ctx._networkSyncManager.sendAnnotationSync).toHaveBeenCalledTimes(1);
      expect(ctx._networkSyncManager.sendAnnotationSync).toHaveBeenCalledWith(
        expect.objectContaining({
          frame: 10,
          action: 'add',
          strokes: expect.arrayContaining([
            expect.objectContaining({ frame: 10, type: 'pen' }),
          ]),
        }),
      );
    });

    it('ANB-044: remote annotations do not affect local undo stack', () => {
      bridge.setup();

      ctx._networkSyncManager.emit('syncAnnotation', {
        frame: 1,
        strokes: [{
          type: 'pen', id: 'remote-3', frame: 1, user: 'alice',
          color: [1, 0, 0, 1], width: 3, brush: 0, points: [{ x: 0, y: 0 }],
          join: 3, cap: 2, splat: false, mode: 0, startFrame: 1, duration: 0,
        }],
        action: 'add',
        timestamp: Date.now(),
      });

      // Undo should not remove the remote annotation (nothing in undo stack)
      const undone = ctx._paintEngine.undo();
      expect(undone).toBe(false);
      expect(ctx._paintEngine.getAnnotationsForFrame(1)).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Color sync
  // -----------------------------------------------------------------------
  describe('color sync', () => {
    it('ANB-050: incoming syncColor applies to viewer', () => {
      bridge.setup();

      ctx._networkSyncManager.emit('syncColor', {
        exposure: 1.5,
        gamma: 2.2,
        saturation: 0.8,
        contrast: 1.1,
        temperature: 500,
        tint: -10,
        brightness: 0.1,
      });

      expect(ctx._viewer.setColorAdjustments).toHaveBeenCalledTimes(1);
      expect(ctx._viewer.setColorAdjustments).toHaveBeenCalledWith(
        expect.objectContaining({
          exposure: 1.5,
          gamma: 2.2,
          saturation: 0.8,
          contrast: 1.1,
          temperature: 500,
          tint: -10,
          brightness: 0.1,
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Note sync
  // -----------------------------------------------------------------------
  describe('note sync', () => {
    it('ANB-060: incoming syncNote add creates note in NoteManager', () => {
      bridge.setup();

      const note = {
        id: 'note-remote-1',
        sourceIndex: 0,
        frameStart: 1,
        frameEnd: 5,
        text: 'Fix this frame',
        author: 'alice',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        status: 'open' as const,
        parentId: null,
        color: '#ff0000',
      };

      ctx._networkSyncManager.emit('syncNote', {
        action: 'add',
        note,
        timestamp: Date.now(),
      });

      const notes = ctx._session.noteManager.getNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0]!.text).toBe('Fix this frame');
    });

    it('ANB-061: incoming syncNote remove deletes note from NoteManager', () => {
      bridge.setup();

      // Add a note first
      const created = ctx._session.noteManager.addNote(0, 1, 5, 'Test note', 'bob');

      ctx._networkSyncManager.emit('syncNote', {
        action: 'remove',
        noteId: created.id,
        timestamp: Date.now(),
      });

      expect(ctx._session.noteManager.getNotes()).toHaveLength(0);
    });

    it('ANB-062: incoming syncNote update modifies note', () => {
      bridge.setup();

      const created = ctx._session.noteManager.addNote(0, 1, 5, 'Original', 'bob');

      ctx._networkSyncManager.emit('syncNote', {
        action: 'update',
        noteId: created.id,
        note: { text: 'Updated text', status: 'resolved' },
        timestamp: Date.now(),
      });

      const note = ctx._session.noteManager.getNote(created.id);
      expect(note?.text).toBe('Updated text');
      expect(note?.status).toBe('resolved');
    });

    it('ANB-063: incoming syncNote clear removes all notes', () => {
      bridge.setup();

      ctx._session.noteManager.addNote(0, 1, 5, 'Note 1', 'alice');
      ctx._session.noteManager.addNote(0, 6, 10, 'Note 2', 'bob');
      expect(ctx._session.noteManager.getNotes()).toHaveLength(2);

      ctx._networkSyncManager.emit('syncNote', {
        action: 'clear',
        timestamp: Date.now(),
      });

      expect(ctx._session.noteManager.getNotes()).toHaveLength(0);
    });

    it('ANB-064: local notesChanged triggers sendNoteSync with snapshot', () => {
      bridge.setup();

      // Add a note directly (outside of bridge) to simulate local state
      ctx._session.noteManager.addNote(0, 1, 5, 'Local note', 'me');

      // Trigger session notesChanged event (simulates NoteManager callback)
      ctx._session.emit('notesChanged', undefined);

      expect(ctx._networkSyncManager.sendNoteSync).toHaveBeenCalledTimes(1);
      expect(ctx._networkSyncManager.sendNoteSync).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'snapshot',
          notes: expect.arrayContaining([
            expect.objectContaining({ text: 'Local note' }),
          ]),
        }),
      );
    });

    it('ANB-065: incoming syncNote snapshot replaces all notes', () => {
      bridge.setup();

      // Add existing notes
      ctx._session.noteManager.addNote(0, 1, 5, 'Old note', 'alice');
      expect(ctx._session.noteManager.getNotes()).toHaveLength(1);

      // Receive snapshot with different notes
      ctx._networkSyncManager.emit('syncNote', {
        action: 'snapshot',
        notes: [
          {
            id: 'snap-1', sourceIndex: 0, frameStart: 10, frameEnd: 20,
            text: 'Snapshot note 1', author: 'bob',
            createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
            status: 'open', parentId: null, color: '#00ff00',
          },
          {
            id: 'snap-2', sourceIndex: 0, frameStart: 30, frameEnd: 40,
            text: 'Snapshot note 2', author: 'charlie',
            createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
            status: 'resolved', parentId: null, color: '#0000ff',
          },
        ],
        timestamp: Date.now(),
      });

      const notes = ctx._session.noteManager.getNotes();
      expect(notes).toHaveLength(2);
      expect(notes.map(n => n.text).sort()).toEqual(['Snapshot note 1', 'Snapshot note 2']);
    });
  });
});
