/**
 * Regression tests for Issue #425: RV/GTO paint-annotation import uses
 * a default 1.0 aspect ratio for RVImageSource sessions because
 * parseSession() only computed aspectRatio from RVFileSource nodes.
 *
 * Verifies that parsePaintAnnotations() receives the correct aspect ratio
 * derived from RVImageSource dimensions when no RVFileSource is present.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLoadGTOGraph, mockSimpleReaderOpen, mockByProtocol } = vi.hoisted(() => ({
  mockLoadGTOGraph: vi.fn(),
  mockSimpleReaderOpen: vi.fn(),
  mockByProtocol: vi.fn((_proto: string) => {
    const empty = [] as any;
    empty.first = () => undefined;
    empty.length = 0;
    return empty;
  }),
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

    byProtocol(protocol: string) {
      return mockByProtocol(protocol);
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

/** Helper to create a mock GTO node with proxy.size. */
function createSourceNode(width: number, height: number) {
  return {
    name: 'source_000',
    component: (name: string) => {
      if (name === 'proxy') {
        return {
          exists: () => true,
          property: (propName: string) => ({
            value: () => (propName === 'size' ? [[width, height]] : undefined),
            exists: () => propName === 'size',
          }),
        };
      }
      if (name === 'media') {
        return {
          exists: () => true,
          property: (propName: string) => ({
            value: () => (propName === 'movie' ? 'test.exr' : undefined),
            exists: () => propName === 'movie',
          }),
        };
      }
      return {
        exists: () => false,
        property: () => ({ value: () => undefined, exists: () => false }),
      };
    },
  };
}

function makeNodeList(nodes: any[]) {
  const list = [...nodes] as any;
  list.first = () => list[0];
  return list;
}

function emptyList() {
  const list = [] as any;
  list.first = () => undefined;
  list.length = 0;
  return list;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockByProtocol.mockImplementation(() => emptyList());
  mockLoadGTOGraph.mockReturnValue({
    graph: {} as any,
    nodes: new Map(),
    rootNode: null,
    skippedNodes: [],
    degradedModes: [],
    sessionInfo: makeSessionInfo(),
  });
});

describe('Issue #425: RVImageSource aspect ratio for paint annotations', () => {
  let graph: SessionGraph;
  let host: SessionGraphHost;
  let annotations: any;

  beforeEach(() => {
    graph = new SessionGraph();
    ({ host, annotations } = createMockHost());
    graph.setHost(host);
  });

  it('ISS-425-001: parsePaintAnnotations receives correct aspect ratio from RVImageSource', async () => {
    const imageNode = createSourceNode(1920, 1080);

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVImageSource') return makeNodeList([imageNode]);
      return emptyList();
    });

    await graph.loadFromGTO('GTOa (1)\n');

    expect(annotations.annotationStore.parsePaintAnnotations).toHaveBeenCalledTimes(1);
    const [, aspectRatio] = annotations.annotationStore.parsePaintAnnotations.mock.calls[0];
    expect(aspectRatio).toBeCloseTo(1920 / 1080, 5);
  });

  it('ISS-425-002: parsePaintAnnotations receives correct aspect ratio from RVFileSource', async () => {
    const fileNode = createSourceNode(3840, 2160);

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVFileSource') return makeNodeList([fileNode]);
      return emptyList();
    });

    await graph.loadFromGTO('GTOa (1)\n');

    expect(annotations.annotationStore.parsePaintAnnotations).toHaveBeenCalledTimes(1);
    const [, aspectRatio] = annotations.annotationStore.parsePaintAnnotations.mock.calls[0];
    expect(aspectRatio).toBeCloseTo(3840 / 2160, 5);
  });

  it('ISS-425-003: RVFileSource aspect ratio takes precedence over RVImageSource', async () => {
    const fileNode = createSourceNode(3840, 2160);
    const imageNode = createSourceNode(1920, 1080);

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVFileSource') return makeNodeList([fileNode]);
      if (proto === 'RVImageSource') return makeNodeList([imageNode]);
      return emptyList();
    });

    await graph.loadFromGTO('GTOa (1)\n');

    expect(annotations.annotationStore.parsePaintAnnotations).toHaveBeenCalledTimes(1);
    const [, aspectRatio] = annotations.annotationStore.parsePaintAnnotations.mock.calls[0];
    // Should use RVFileSource dimensions (3840/2160), not RVImageSource
    expect(aspectRatio).toBeCloseTo(3840 / 2160, 5);
  });

  it('ISS-425-004: aspect ratio defaults to 1.0 when no source has dimensions', async () => {
    mockByProtocol.mockImplementation(() => emptyList());

    await graph.loadFromGTO('GTOa (1)\n');

    expect(annotations.annotationStore.parsePaintAnnotations).toHaveBeenCalledTimes(1);
    const [, aspectRatio] = annotations.annotationStore.parsePaintAnnotations.mock.calls[0];
    expect(aspectRatio).toBe(1);
  });

  it('ISS-425-005: non-square RVImageSource produces non-1.0 aspect ratio for annotations', async () => {
    // Anamorphic-style still: 2048x858
    const imageNode = createSourceNode(2048, 858);

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVImageSource') return makeNodeList([imageNode]);
      return emptyList();
    });

    await graph.loadFromGTO('GTOa (1)\n');

    expect(annotations.annotationStore.parsePaintAnnotations).toHaveBeenCalledTimes(1);
    const [, aspectRatio] = annotations.annotationStore.parsePaintAnnotations.mock.calls[0];
    expect(aspectRatio).toBeCloseTo(2048 / 858, 5);
    // Ensure it's NOT the default 1.0
    expect(aspectRatio).not.toBe(1);
  });

  it('ISS-425-006: square RVImageSource produces 1.0 aspect ratio', async () => {
    const imageNode = createSourceNode(1024, 1024);

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVImageSource') return makeNodeList([imageNode]);
      return emptyList();
    });

    await graph.loadFromGTO('GTOa (1)\n');

    expect(annotations.annotationStore.parsePaintAnnotations).toHaveBeenCalledTimes(1);
    const [, aspectRatio] = annotations.annotationStore.parsePaintAnnotations.mock.calls[0];
    expect(aspectRatio).toBe(1);
  });
});
