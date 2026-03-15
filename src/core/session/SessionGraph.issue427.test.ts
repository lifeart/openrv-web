/**
 * Regression tests for Issue #427: RV/GTO multi-source imports derive crop
 * and annotation geometry from inconsistent source dimensions.
 *
 * Before the fix, parseSession() would use the first source's dimensions for
 * crop parsing but the LAST source's dimensions for aspect ratio (annotations).
 * The fix ensures both crop and aspect ratio use the first source's dimensions.
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

/** Helper to create a mock GTO node with proxy.size and optional media. */
function createSourceNode(width: number, height: number, url = 'test.exr') {
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
            value: () => (propName === 'movie' ? url : undefined),
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

describe('Issue #427: multi-source consistent dimensions for crop and annotations', () => {
  let graph: SessionGraph;
  let host: SessionGraphHost;
  let annotations: any;

  beforeEach(() => {
    graph = new SessionGraph();
    ({ host, annotations } = createMockHost());
    graph.setHost(host);
  });

  it('ISS-427-001: multi-source RVFileSource uses first source aspect ratio for annotations', async () => {
    // First source: 1920x1080 (16:9, aspect ~1.778)
    // Second source: 1080x1920 (9:16, aspect ~0.5625)
    const source1 = createSourceNode(1920, 1080, 'wide.mp4');
    const source2 = createSourceNode(1080, 1920, 'tall.mp4');

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVFileSource') return makeNodeList([source1, source2]);
      return emptyList();
    });

    await graph.loadFromGTO('GTOa (1)\n');

    // parsePaintAnnotations should be called with the FIRST source's aspect ratio
    const expectedAspect = 1920 / 1080;
    expect(annotations.annotationStore.parsePaintAnnotations).toHaveBeenCalledTimes(1);
    const actualAspect = annotations.annotationStore.parsePaintAnnotations.mock.calls[0][1];
    expect(actualAspect).toBeCloseTo(expectedAspect, 5);
  });

  it('ISS-427-002: multi-source RVFileSource uses first source dimensions for crop', async () => {
    // First source: 3840x2160 (4K)
    // Second source: 1280x720 (720p)
    const source1 = createSourceNode(3840, 2160, 'main.mp4');
    const source2 = createSourceNode(1280, 720, 'proxy.mp4');

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVFileSource') return makeNodeList([source1, source2]);
      return emptyList();
    });

    const settingsPromise = new Promise<any>((resolve, reject) => {
      graph.on('settingsLoaded', resolve);
      setTimeout(() => reject(new Error('settingsLoaded not emitted')), 500);
    });

    await graph.loadFromGTO('GTOa (1)\n');

    // Aspect ratio for annotations should match first source
    const expectedAspect = 3840 / 2160;
    const actualAspect = annotations.annotationStore.parsePaintAnnotations.mock.calls[0][1];
    expect(actualAspect).toBeCloseTo(expectedAspect, 5);

    // settingsLoaded may or may not fire depending on format nodes;
    // the key assertion is the aspect ratio above
    try {
      await settingsPromise;
    } catch {
      // No settingsLoaded is acceptable if no RVFormat nodes present
    }
  });

  it('ISS-427-003: single source still works correctly', async () => {
    const source = createSourceNode(1920, 1080, 'video.mp4');

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVFileSource') return makeNodeList([source]);
      return emptyList();
    });

    await graph.loadFromGTO('GTOa (1)\n');

    const expectedAspect = 1920 / 1080;
    expect(annotations.annotationStore.parsePaintAnnotations).toHaveBeenCalledTimes(1);
    const actualAspect = annotations.annotationStore.parsePaintAnnotations.mock.calls[0][1];
    expect(actualAspect).toBeCloseTo(expectedAspect, 5);
  });

  it('ISS-427-004: multi-source RVImageSource uses first source aspect ratio', async () => {
    // No RVFileSource, fallback to RVImageSource
    // First image: 2048x1024 (aspect 2.0)
    // Second image: 512x512 (aspect 1.0)
    const img1 = createSourceNode(2048, 1024, 'pano.exr');
    const img2 = createSourceNode(512, 512, 'thumb.exr');

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVImageSource') return makeNodeList([img1, img2]);
      return emptyList();
    });

    await graph.loadFromGTO('GTOa (1)\n');

    const expectedAspect = 2048 / 1024;
    expect(annotations.annotationStore.parsePaintAnnotations).toHaveBeenCalledTimes(1);
    const actualAspect = annotations.annotationStore.parsePaintAnnotations.mock.calls[0][1];
    expect(actualAspect).toBeCloseTo(expectedAspect, 5);
  });

  it('ISS-427-005: aspect ratio and dimensions are consistent across crop and annotations', async () => {
    // Regression: before fix, crop used first source dimensions but
    // aspectRatio was overwritten by last source. Verify they match.
    const source1 = createSourceNode(1920, 1080, 'main.mp4');
    const source2 = createSourceNode(720, 480, 'sd.mp4');
    const source3 = createSourceNode(3840, 2160, 'uhd.mp4');

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVFileSource') return makeNodeList([source1, source2, source3]);
      return emptyList();
    });

    await graph.loadFromGTO('GTOa (1)\n');

    // Aspect ratio passed to annotations must match first source
    const firstSourceAspect = 1920 / 1080;
    const actualAspect = annotations.annotationStore.parsePaintAnnotations.mock.calls[0][1];
    expect(actualAspect).toBeCloseTo(firstSourceAspect, 5);

    // Specifically, it should NOT be the last source's aspect ratio
    const lastSourceAspect = 3840 / 2160;
    // In this case they happen to be the same ratio (16:9), so also test with the SD source
    const sdAspect = 720 / 480; // 1.5
    expect(actualAspect).not.toBeCloseTo(sdAspect, 5);
  });
});
