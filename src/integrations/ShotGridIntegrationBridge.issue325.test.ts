/**
 * Issue #325 regression tests: pushNotes should include annotation data
 * and thumbnails, not just plain note text.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShotGridIntegrationBridge } from './ShotGridIntegrationBridge';
import type { AnnotationProvider, ThumbnailRenderer } from './ShotGridIntegrationBridge';
import { EventEmitter } from '../utils/EventEmitter';
import type { ShotGridConfigEvents } from './ShotGridConfig';
import type { ShotGridPanelEvents } from '../ui/components/ShotGridPanel';
import type { ShotGridVersion } from './ShotGridBridge';
import type { PenStroke, TextAnnotation, ShapeAnnotation } from '../paint/types';
import { BrushType, LineJoin, LineCap, StrokeMode, TextOrigin, ShapeType } from '../paint/types';

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

function makePenStroke(overrides?: Partial<PenStroke>): PenStroke {
  return {
    type: 'pen',
    id: '1',
    frame: 5,
    user: 'Reviewer',
    color: [1, 0, 0, 1],
    width: 3,
    brush: BrushType.Circle,
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.3, y: 0.4 },
      { x: 0.5, y: 0.6 },
    ],
    join: LineJoin.Round,
    cap: LineCap.Round,
    splat: false,
    mode: StrokeMode.Draw,
    startFrame: 5,
    duration: 0,
    ...overrides,
  };
}

function makeTextAnnotation(overrides?: Partial<TextAnnotation>): TextAnnotation {
  return {
    type: 'text',
    id: '2',
    frame: 5,
    user: 'Reviewer',
    position: { x: 0.5, y: 0.5 },
    color: [1, 1, 0, 1],
    text: 'Fix this edge',
    size: 14,
    scale: 1,
    rotation: 0,
    spacing: 1,
    font: 'sans-serif',
    origin: TextOrigin.BottomLeft,
    startFrame: 5,
    duration: 0,
    ...overrides,
  };
}

function makeShapeAnnotation(overrides?: Partial<ShapeAnnotation>): ShapeAnnotation {
  return {
    type: 'shape',
    id: '3',
    frame: 5,
    user: 'Supervisor',
    shapeType: ShapeType.Rectangle,
    startPoint: { x: 0.1, y: 0.1 },
    endPoint: { x: 0.4, y: 0.4 },
    strokeColor: [0, 1, 0, 1],
    strokeWidth: 2,
    rotation: 0,
    startFrame: 5,
    duration: 0,
    ...overrides,
  };
}

const SG_CONFIG = {
  serverUrl: 'https://studio.shotgrid.autodesk.com',
  scriptName: 'test',
  apiKey: 'key',
  projectId: 42,
};

// Track the most recent mock bridge instance
let mockBridgeInstance: any;

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
      this.uploadAttachment = vi.fn().mockResolvedValue(undefined);
      this.dispose = vi.fn();
      mockBridgeInstance = this;
    }),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShotGridIntegrationBridge – Issue #325: pushNotes includes annotations and thumbnails', () => {
  let session: ReturnType<typeof createMockSession>;
  let configUI: MockConfigUI;
  let panel: MockPanel;
  let bridge: ShotGridIntegrationBridge;
  let annotationProvider: AnnotationProvider;
  let thumbnailRenderer: ThumbnailRenderer;

  async function connect() {
    configUI.emit('connect', SG_CONFIG);
    await vi.waitFor(() => {
      expect(configUI.setState).toHaveBeenCalledWith('connected');
    });
  }

  beforeEach(() => {
    session = createMockSession();
    configUI = new MockConfigUI();
    panel = new MockPanel();

    annotationProvider = {
      getAnnotationsForFrame: vi.fn().mockReturnValue([]),
    };

    thumbnailRenderer = {
      renderAnnotationThumbnail: vi.fn().mockResolvedValue(new Blob(['fake-png'], { type: 'image/png' })),
    };
  });

  afterEach(() => {
    bridge.dispose();
    vi.clearAllMocks();
  });

  function createBridge(opts?: { skipAnnotationProvider?: boolean; skipThumbnailRenderer?: boolean }) {
    bridge = new ShotGridIntegrationBridge({
      session: session as any,
      configUI: configUI as any,
      panel: panel as any,
      annotationProvider: opts?.skipAnnotationProvider ? undefined : annotationProvider,
      thumbnailRenderer: opts?.skipThumbnailRenderer ? undefined : thumbnailRenderer,
    });
    bridge.setup();
  }

  // ---- Core annotation wiring tests ----

  it('SG-INT-325-001: pushNotes includes annotation summaries when annotations exist on note frames', async () => {
    const penStroke = makePenStroke({ frame: 5 });
    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockImplementation((frame: number) => {
      if (frame === 5) return [penStroke];
      return [];
    });

    createBridge();
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Check this frame', frameStart: 5, frameEnd: 5 },
    ]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    const pushNoteArgs = mockBridgeInstance.pushNote.mock.calls[0]!;
    expect(pushNoteArgs[0]).toBe(101); // versionId
    const noteOpts = pushNoteArgs[1];
    expect(noteOpts.text).toBe('Check this frame');
    expect(noteOpts.frameRange).toBe('5');
    expect(noteOpts.annotations).toHaveLength(1);
    expect(noteOpts.annotations[0]).toMatchObject({
      frame: 5,
      type: 'pen',
      user: 'Reviewer',
      description: '3-point stroke',
    });
  });

  it('SG-INT-325-002: pushNotes includes text annotation description', async () => {
    const textAnn = makeTextAnnotation({ text: 'Fix this edge' });
    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockReturnValue([textAnn]);

    createBridge();
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Review note', frameStart: 5, frameEnd: 5 },
    ]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    const noteOpts = mockBridgeInstance.pushNote.mock.calls[0]![1];
    expect(noteOpts.annotations[0]).toMatchObject({
      type: 'text',
      description: 'Fix this edge',
    });
  });

  it('SG-INT-325-003: pushNotes includes shape annotation description', async () => {
    const shapeAnn = makeShapeAnnotation({ shapeType: ShapeType.Ellipse });
    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockReturnValue([shapeAnn]);

    createBridge();
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Circle here', frameStart: 5, frameEnd: 5 },
    ]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    const noteOpts = mockBridgeInstance.pushNote.mock.calls[0]![1];
    expect(noteOpts.annotations[0]).toMatchObject({
      type: 'shape',
      description: 'ellipse shape',
    });
  });

  it('SG-INT-325-004: pushNotes uploads thumbnail blob when annotations and renderer are provided', async () => {
    const penStroke = makePenStroke();
    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockReturnValue([penStroke]);

    createBridge();
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'See annotation', frameStart: 5, frameEnd: 5 },
    ]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    const noteOpts = mockBridgeInstance.pushNote.mock.calls[0]![1];
    expect(noteOpts.thumbnailBlob).toBeInstanceOf(Blob);
    expect(thumbnailRenderer.renderAnnotationThumbnail).toHaveBeenCalledWith([penStroke], 960, 540);
  });

  // ---- Backward compatibility ----

  it('SG-INT-325-005: pushNotes without annotationProvider sends only text and frameRange (backward compat)', async () => {
    createBridge({ skipAnnotationProvider: true });
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Plain note', frameStart: 10, frameEnd: 20 },
    ]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    const noteOpts = mockBridgeInstance.pushNote.mock.calls[0]![1];
    expect(noteOpts.text).toBe('Plain note');
    expect(noteOpts.frameRange).toBe('10-20');
    expect(noteOpts.annotations).toBeUndefined();
    expect(noteOpts.thumbnailBlob).toBeUndefined();
  });

  it('SG-INT-325-006: pushNotes without thumbnailRenderer sends annotations but no thumbnail', async () => {
    const penStroke = makePenStroke();
    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockReturnValue([penStroke]);

    createBridge({ skipThumbnailRenderer: true });
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Annotated', frameStart: 5, frameEnd: 5 },
    ]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    const noteOpts = mockBridgeInstance.pushNote.mock.calls[0]![1];
    expect(noteOpts.annotations).toHaveLength(1);
    expect(noteOpts.thumbnailBlob).toBeUndefined();
  });

  // ---- Edge cases ----

  it('SG-INT-325-007: pushNotes with empty annotations array omits annotations field', async () => {
    // annotationProvider returns empty array
    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockReturnValue([]);

    createBridge();
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'No drawings', frameStart: 1, frameEnd: 1 },
    ]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    const noteOpts = mockBridgeInstance.pushNote.mock.calls[0]![1];
    expect(noteOpts.annotations).toBeUndefined();
    expect(noteOpts.thumbnailBlob).toBeUndefined();
  });

  it('SG-INT-325-008: pushNotes collects annotations across multi-frame range', async () => {
    const stroke1 = makePenStroke({ id: '1', frame: 10 });
    const stroke2 = makePenStroke({
      id: '2',
      frame: 12,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.9, y: 0.8 },
      ],
    });

    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockImplementation((frame: number) => {
      if (frame === 10) return [stroke1];
      if (frame === 12) return [stroke2];
      return [];
    });

    createBridge();
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Check range', frameStart: 10, frameEnd: 15 },
    ]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    const noteOpts = mockBridgeInstance.pushNote.mock.calls[0]![1];
    expect(noteOpts.annotations).toHaveLength(2);
    expect(noteOpts.annotations[0].frame).toBe(10);
    expect(noteOpts.annotations[0].description).toBe('3-point stroke');
    expect(noteOpts.annotations[1].frame).toBe(12);
    expect(noteOpts.annotations[1].description).toBe('2-point stroke');
  });

  it('SG-INT-325-009: pushNotes deduplicates annotations that span multiple frames', async () => {
    // Same annotation visible on frames 5 and 6 (duration > 0)
    const stroke = makePenStroke({ id: 'same-stroke', frame: 5 });

    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockImplementation((frame: number) => {
      if (frame >= 5 && frame <= 6) return [stroke];
      return [];
    });

    createBridge();
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([{ id: 'n1', text: 'Range', frameStart: 5, frameEnd: 6 }]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    const noteOpts = mockBridgeInstance.pushNote.mock.calls[0]![1];
    // Should have exactly 1 annotation, not 2
    expect(noteOpts.annotations).toHaveLength(1);
  });

  it('SG-INT-325-010: pushNotes renders thumbnail from first frame annotations only', async () => {
    const stroke1 = makePenStroke({ id: '1', frame: 10 });
    const stroke2 = makePenStroke({ id: '2', frame: 12 });

    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockImplementation((frame: number) => {
      if (frame === 10) return [stroke1];
      if (frame === 12) return [stroke2];
      return [];
    });

    createBridge();
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Range note', frameStart: 10, frameEnd: 15 },
    ]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    // Thumbnail should be rendered from first frame's annotations
    expect(thumbnailRenderer.renderAnnotationThumbnail).toHaveBeenCalledWith([stroke1], 960, 540);
  });

  it('SG-INT-325-011: pushNotes handles thumbnail renderer returning null gracefully', async () => {
    const penStroke = makePenStroke();
    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockReturnValue([penStroke]);
    (thumbnailRenderer.renderAnnotationThumbnail as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    createBridge();
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Render fail', frameStart: 5, frameEnd: 5 },
    ]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    const noteOpts = mockBridgeInstance.pushNote.mock.calls[0]![1];
    // Annotations are still sent
    expect(noteOpts.annotations).toHaveLength(1);
    // No thumbnail (null converted to undefined)
    expect(noteOpts.thumbnailBlob).toBeUndefined();
  });

  it('SG-INT-325-012: pushNotes truncates long text annotation descriptions', async () => {
    const longText = 'A'.repeat(60);
    const textAnn = makeTextAnnotation({ text: longText });
    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockReturnValue([textAnn]);

    createBridge();
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Long text', frameStart: 5, frameEnd: 5 },
    ]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    const noteOpts = mockBridgeInstance.pushNote.mock.calls[0]![1];
    const desc = noteOpts.annotations[0].description;
    expect(desc.length).toBeLessThanOrEqual(43); // 40 chars + '...'
    expect(desc).toContain('...');
  });

  it('SG-INT-325-013: pushNotes with multiple annotation types on same frame', async () => {
    const pen = makePenStroke({ id: '1', frame: 5 });
    const text = makeTextAnnotation({ id: '2', frame: 5 });
    const shape = makeShapeAnnotation({ id: '3', frame: 5 });

    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockReturnValue([pen, text, shape]);

    createBridge();
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Multiple annotations', frameStart: 5, frameEnd: 5 },
    ]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    const noteOpts = mockBridgeInstance.pushNote.mock.calls[0]![1];
    expect(noteOpts.annotations).toHaveLength(3);
    expect(noteOpts.annotations.map((a: any) => a.type)).toEqual(['pen', 'text', 'shape']);
  });

  it('SG-INT-325-014: pushNotes single-frame note uses frame number as frameRange', async () => {
    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockReturnValue([]);

    createBridge();
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Single frame', frameStart: 42, frameEnd: 42 },
    ]);

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(mockBridgeInstance.pushNote).toHaveBeenCalledTimes(1);
    });

    const noteOpts = mockBridgeInstance.pushNote.mock.calls[0]![1];
    expect(noteOpts.frameRange).toBe('42');
  });

  it('SG-INT-325-015: pushNotes still reports partial failures correctly', async () => {
    const penStroke = makePenStroke();
    (annotationProvider.getAnnotationsForFrame as ReturnType<typeof vi.fn>).mockReturnValue([penStroke]);

    createBridge();
    await connect();

    session.noteManager.getNotesForSource.mockReturnValue([
      { id: 'n1', text: 'Note 1', frameStart: 5, frameEnd: 5 },
      { id: 'n2', text: 'Note 2', frameStart: 10, frameEnd: 10 },
    ]);

    // First push succeeds, second fails
    let callCount = 0;
    mockBridgeInstance.pushNote.mockImplementation(() => {
      callCount++;
      if (callCount === 2) return Promise.reject(new Error('Push failed'));
      return Promise.resolve({ id: 500 + callCount, subject: 'Test' });
    });

    panel.emit('pushNotes', { versionId: 101, sourceIndex: 0 });

    await vi.waitFor(() => {
      expect(panel.setError).toHaveBeenCalledWith(expect.stringContaining('failed'));
    });
  });
});
