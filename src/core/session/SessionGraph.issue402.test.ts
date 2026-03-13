/**
 * Regression tests for Issue #402: GTO import can keep the previous session
 * title/comment when the new file leaves them blank.
 *
 * Verifies that loadFromGTO() resets metadata before parsing so stale
 * displayName/comment values do not persist across successive loads.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLoadGTOGraph, mockSimpleReaderOpen, mockByProtocol } = vi.hoisted(() => ({
  mockLoadGTOGraph: vi.fn(),
  mockSimpleReaderOpen: vi.fn(),
  mockByProtocol: vi.fn(() => []),
}));

vi.mock('gto-js', () => ({
  SimpleReader: class {
    result = {};

    open(_data: unknown) {
      mockSimpleReaderOpen();
    }
  },
  GTODTO: class {
    constructor(_result: unknown) {}

    byProtocol(_protocol: string) {
      return mockByProtocol();
    }
  },
}));

vi.mock('./GTOGraphLoader', () => ({
  loadGTOGraph: mockLoadGTOGraph,
}));

import { SessionGraph } from './SessionGraph';
import type { SessionGraphHost } from './SessionGraph';
import type { SessionAnnotations } from './SessionAnnotations';

function createMockHost() {
  const annotations = {
    markerManager: { setFromFrameNumbers: vi.fn() },
    annotationStore: {
      setPaintEffects: vi.fn(),
      setMatteSettings: vi.fn(),
      parsePaintAnnotations: vi.fn(),
    },
    noteManager: { fromSerializable: vi.fn() },
    versionManager: { fromSerializable: vi.fn() },
    statusManager: { fromSerializable: vi.fn() },
  } as unknown as SessionAnnotations;

  const host: SessionGraphHost = {
    setFps: vi.fn(),
    setCurrentFrame: vi.fn(),
    setInPoint: vi.fn(),
    setOutPoint: vi.fn(),
    setFrameIncrement: vi.fn(),
    emitInOutChanged: vi.fn(),
    emitFrameIncrementChanged: vi.fn(),
    setPlaybackMode: vi.fn(),
    setAudioScrubEnabled: vi.fn(),
    getAnnotations: () => annotations,
    loadVideoSourcesFromGraph: vi.fn().mockResolvedValue(undefined),
  };

  return { annotations, host };
}

function makeSessionInfo(overrides: Record<string, unknown> = {}) {
  return {
    marks: [],
    markerNotes: [],
    markerColors: [],
    markerEndFrames: [],
    notes: [],
    versionGroups: [],
    statuses: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockByProtocol.mockReturnValue([]);
  mockLoadGTOGraph.mockReturnValue({
    graph: {} as any,
    nodes: new Map(),
    rootNode: null,
    skippedNodes: [],
    degradedModes: [],
    sessionInfo: makeSessionInfo(),
  });
});

describe('Issue #402: loadFromGTO resets metadata before parsing', () => {
  let graph: SessionGraph;
  let host: SessionGraphHost;

  beforeEach(() => {
    graph = new SessionGraph();
    ({ host } = createMockHost());
    graph.setHost(host);
  });

  it('ISS-402-001: loading a GTO with no title/comment clears previous metadata', async () => {
    // First load: GTO with title and comment
    mockLoadGTOGraph.mockReturnValue({
      graph: {} as any,
      nodes: new Map(),
      rootNode: null,
      skippedNodes: [],
      degradedModes: [],
      sessionInfo: makeSessionInfo({
        displayName: 'First Session',
        comment: 'First comment',
      }),
    });

    await graph.loadFromGTO('GTOa (1)\n');
    expect(graph.metadata.displayName).toBe('First Session');
    expect(graph.metadata.comment).toBe('First comment');

    // Second load: GTO with no title/comment
    mockLoadGTOGraph.mockReturnValue({
      graph: {} as any,
      nodes: new Map(),
      rootNode: null,
      skippedNodes: [],
      degradedModes: [],
      sessionInfo: makeSessionInfo(),
    });

    await graph.loadFromGTO('GTOa (1)\n');
    expect(graph.metadata.displayName).toBe('');
    expect(graph.metadata.comment).toBe('');
  });

  it('ISS-402-002: loading a GTO with title/comment sets them correctly', async () => {
    mockLoadGTOGraph.mockReturnValue({
      graph: {} as any,
      nodes: new Map(),
      rootNode: null,
      skippedNodes: [],
      degradedModes: [],
      sessionInfo: makeSessionInfo({
        displayName: 'My Session',
        comment: 'A useful comment',
      }),
    });

    await graph.loadFromGTO('GTOa (1)\n');
    expect(graph.metadata.displayName).toBe('My Session');
    expect(graph.metadata.comment).toBe('A useful comment');
  });

  it('ISS-402-003: loading a second GTO with blank fields does not keep the first GTO metadata', async () => {
    // Load first GTO with metadata
    mockLoadGTOGraph.mockReturnValue({
      graph: {} as any,
      nodes: new Map(),
      rootNode: null,
      skippedNodes: [],
      degradedModes: [],
      sessionInfo: makeSessionInfo({
        displayName: 'Session A',
        comment: 'Comment A',
        version: 3,
        origin: 'rv',
      }),
    });

    await graph.loadFromGTO('GTOa (1)\n');
    expect(graph.metadata.displayName).toBe('Session A');
    expect(graph.metadata.comment).toBe('Comment A');
    expect(graph.metadata.version).toBe(3);
    expect(graph.metadata.origin).toBe('rv');

    // Load second GTO with no metadata at all (sessionInfo has no display/comment/version/origin)
    mockLoadGTOGraph.mockReturnValue({
      graph: {} as any,
      nodes: new Map(),
      rootNode: null,
      skippedNodes: [],
      degradedModes: [],
      sessionInfo: makeSessionInfo(),
    });

    await graph.loadFromGTO('GTOa (1)\n');

    // All metadata should be reset to defaults, not carried over from Session A
    expect(graph.metadata.displayName).toBe('');
    expect(graph.metadata.comment).toBe('');
    expect(graph.metadata.version).toBe(2);
    expect(graph.metadata.origin).toBe('openrv-web');
  });

  it('ISS-402-004: metadata is reset even if graph loading fails internally', async () => {
    // Pre-set some metadata
    graph.updateMetadata({ displayName: 'Old Title', comment: 'Old Comment' });
    expect(graph.metadata.displayName).toBe('Old Title');

    // Make loadGTOGraph throw (error is caught internally as non-fatal)
    mockLoadGTOGraph.mockImplementation(() => {
      throw new Error('Graph loading failed');
    });

    await graph.loadFromGTO('GTOa (1)\n');

    // Metadata should still have been reset before the error occurred
    expect(graph.metadata.displayName).toBe('');
    expect(graph.metadata.comment).toBe('');
  });
});
