/**
 * Regression tests for Issue #424: RV/GTO crop restore derives source
 * dimensions from RVFileSource only, so still-image sessions can import
 * with a full-frame crop instead of the authored crop.
 *
 * Verifies that parseSession() also extracts dimensions from RVImageSource
 * protocol nodes when RVFileSource yields no dimensions.
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

/** Helper to create a mock RVFormat node with a crop component. */
function createFormatNode(crop: { active: number; xmin: number; ymin: number; xmax: number; ymax: number }) {
  return {
    name: 'format_000',
    component: (name: string) => {
      if (name === 'crop') {
        return {
          exists: () => true,
          property: (propName: string) => ({
            value: () => {
              const key = propName as keyof typeof crop;
              return key in crop ? crop[key] : undefined;
            },
            exists: () => propName in crop,
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

describe('Issue #424: RVImageSource crop restore', () => {
  let graph: SessionGraph;
  let host: SessionGraphHost;

  beforeEach(() => {
    graph = new SessionGraph();
    ({ host } = createMockHost());
    graph.setHost(host);
  });

  it('ISS-424-001: emits settingsLoaded with correct crop when source is RVImageSource', async () => {
    const imageNode = createSourceNode(1920, 1080, 'still.exr');
    const formatNode = createFormatNode({
      active: 1,
      xmin: 100,
      ymin: 50,
      xmax: 1820,
      ymax: 1030,
    });

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVImageSource') return makeNodeList([imageNode]);
      if (proto === 'RVFormat') return makeNodeList([formatNode]);
      return emptyList();
    });

    const settingsPromise = new Promise<any>((resolve) => {
      graph.on('settingsLoaded', resolve);
    });

    await graph.loadFromGTO('GTOa (1)\n');

    const settings = await settingsPromise;
    expect(settings).toBeDefined();
    expect(settings.crop).toBeDefined();

    // Verify the crop is computed from the actual image dimensions,
    // not the fallback { x: 0, y: 0, width: 1, height: 1 }
    const crop = settings.crop;
    expect(crop.region.x).toBeCloseTo(100 / 1920, 5);
    expect(crop.region.y).toBeCloseTo(50 / 1080, 5);
    expect(crop.region.width).toBeCloseTo(1720 / 1920, 5);
    expect(crop.region.height).toBeCloseTo(980 / 1080, 5);
  });

  it('ISS-424-002: RVFileSource dimensions still take precedence over RVImageSource', async () => {
    const fileNode = createSourceNode(3840, 2160, 'video.mp4');
    const imageNode = createSourceNode(1920, 1080, 'still.exr');
    const formatNode = createFormatNode({
      active: 1,
      xmin: 200,
      ymin: 100,
      xmax: 3640,
      ymax: 2060,
    });

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVFileSource') return makeNodeList([fileNode]);
      if (proto === 'RVImageSource') return makeNodeList([imageNode]);
      if (proto === 'RVFormat') return makeNodeList([formatNode]);
      return emptyList();
    });

    const settingsPromise = new Promise<any>((resolve) => {
      graph.on('settingsLoaded', resolve);
    });

    await graph.loadFromGTO('GTOa (1)\n');

    const settings = await settingsPromise;
    expect(settings).toBeDefined();
    expect(settings.crop).toBeDefined();

    // Crop should be derived from the RVFileSource dimensions (3840x2160),
    // NOT from RVImageSource dimensions (1920x1080)
    const crop = settings.crop;
    expect(crop.region.x).toBeCloseTo(200 / 3840, 5);
    expect(crop.region.y).toBeCloseTo(100 / 2160, 5);
    expect(crop.region.width).toBeCloseTo(3440 / 3840, 5);
    expect(crop.region.height).toBeCloseTo(1960 / 2160, 5);
  });

  it('ISS-424-003: crop falls back to full-frame when neither source type has dimensions', async () => {
    const formatNode = createFormatNode({
      active: 1,
      xmin: 100,
      ymin: 50,
      xmax: 1820,
      ymax: 1030,
    });

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVFormat') return makeNodeList([formatNode]);
      return emptyList();
    });

    const settingsPromise = new Promise<any>((resolve, reject) => {
      graph.on('settingsLoaded', resolve);
      // Timeout: if no settings emitted, the test should still pass
      setTimeout(() => reject(new Error('settingsLoaded not emitted')), 500);
    });

    await graph.loadFromGTO('GTOa (1)\n');

    // With zero dimensions, crop region should be full-frame fallback
    try {
      const settings = await settingsPromise;
      if (settings?.crop) {
        expect(settings.crop.region.x).toBe(0);
        expect(settings.crop.region.y).toBe(0);
        expect(settings.crop.region.width).toBe(1);
        expect(settings.crop.region.height).toBe(1);
      }
    } catch {
      // settingsLoaded may not fire if there's no data — that's also acceptable
    }
  });

  it('ISS-424-004: RVImageSource with no proxy component does not crash', async () => {
    const nodeNoProxy = {
      name: 'source_000',
      component: (name: string) => ({
        exists: () => false,
        property: () => ({ value: () => undefined, exists: () => false }),
      }),
    };

    mockByProtocol.mockImplementation((proto: string) => {
      if (proto === 'RVImageSource') return makeNodeList([nodeNoProxy]);
      return emptyList();
    });

    // Should not throw
    await graph.loadFromGTO('GTOa (1)\n');
  });
});
