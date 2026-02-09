/**
 * GTOGraphLoader Unit Tests
 *
 * Core loading, session parsing, node creation, connections, validation,
 * and getGraphSummary tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadGTOGraph, getGraphSummary } from './GTOGraphLoader';
import type { GTOParseResult } from './GTOGraphLoader';
import type { GTODTO } from 'gto-js';
import { NodeFactory } from '../../nodes/base/NodeFactory';

// Mock the NodeFactory
vi.mock('../../nodes/base/NodeFactory', () => ({
  NodeFactory: {
    isRegistered: vi.fn(),
    create: vi.fn(),
  },
}));

// Create a mock GTODTO object
function createMockDTO(config: {
  sessions?: Array<{
    name: string;
    viewNode?: string;
    frame?: number;
    currentFrame?: number;
    fps?: number;
    realtime?: number;
    range?: number[] | number[][];
    region?: number[] | number[][];
    marks?: number[];
    markerNotes?: string[];
    markerColors?: string[];
    inc?: number;
    version?: number;
    clipboard?: number;
    root?: { name?: string; comment?: string };
    matte?: { show?: number; aspect?: number; opacity?: number; heightVisible?: number; centerPoint?: number[] };
    paintEffects?: { hold?: number; ghost?: number; ghostBefore?: number; ghostAfter?: number };
    internal?: { creationContext?: number };
    node?: { origin?: string };
    membership?: { contains?: string[] };
  }>;
  objects?: Array<{
    name: string;
    protocol: string;
    components?: Record<string, Record<string, unknown>>;
  }>;
}) {
  const sessions = config.sessions || [];
  const objects = config.objects || [];

  // Create mock component and property accessors
  const createMockComponent = (compData: Record<string, unknown> | undefined) => ({
    exists: () => compData !== undefined,
    property: (name: string) => ({
      value: () => compData?.[name],
    }),
  });

  const createMockObject = (obj: typeof objects[0]) => ({
    name: obj.name,
    protocol: obj.protocol,
    component: (name: string) => createMockComponent(obj.components?.[name]),
  });

  const mockObjects = objects.map(createMockObject);
  const mockSessions = sessions.map((s) => ({
    name: s.name,
    component: (name: string) => {
      if (name === 'session') {
        return {
          exists: () => true,
          property: (propName: string) => ({
            value: () => {
              if (propName === 'viewNode') return s.viewNode;
              if (propName === 'frame') return s.frame;
              if (propName === 'currentFrame') return s.currentFrame;
              if (propName === 'fps') return s.fps;
              if (propName === 'realtime') return s.realtime;
              if (propName === 'range') return s.range;
              if (propName === 'region') return s.region;
              if (propName === 'marks') return s.marks;
              if (propName === 'markerNotes') return s.markerNotes;
              if (propName === 'markerColors') return s.markerColors;
              if (propName === 'inc') return s.inc;
              if (propName === 'version') return s.version;
              if (propName === 'clipboard') return s.clipboard;
              return undefined;
            },
          }),
        };
      }
      if (name === 'root' && s.root) {
        return {
          exists: () => true,
          property: (propName: string) => ({
            value: () => {
              if (propName === 'name') return s.root?.name;
              if (propName === 'comment') return s.root?.comment;
              return undefined;
            },
          }),
        };
      }
      if (name === 'matte' && s.matte) {
        return {
          exists: () => true,
          property: (propName: string) => ({
            value: () => {
              if (propName === 'show') return s.matte?.show;
              if (propName === 'aspect') return s.matte?.aspect;
              if (propName === 'opacity') return s.matte?.opacity;
              if (propName === 'heightVisible') return s.matte?.heightVisible;
              if (propName === 'centerPoint') return s.matte?.centerPoint;
              return undefined;
            },
          }),
        };
      }
      if (name === 'paintEffects' && s.paintEffects) {
        return {
          exists: () => true,
          property: (propName: string) => ({
            value: () => {
              if (propName === 'hold') return s.paintEffects?.hold;
              if (propName === 'ghost') return s.paintEffects?.ghost;
              if (propName === 'ghostBefore') return s.paintEffects?.ghostBefore;
              if (propName === 'ghostAfter') return s.paintEffects?.ghostAfter;
              return undefined;
            },
          }),
        };
      }
      if (name === 'internal' && s.internal) {
        return {
          exists: () => true,
          property: (propName: string) => ({
            value: () => {
              if (propName === 'creationContext') return s.internal?.creationContext;
              return undefined;
            },
          }),
        };
      }
      if (name === 'node' && s.node) {
        return {
          exists: () => true,
          property: (propName: string) => ({
            value: () => {
              if (propName === 'origin') return s.node?.origin;
              return undefined;
            },
          }),
        };
      }
      if (name === 'membership' && s.membership) {
        return {
          exists: () => true,
          property: (propName: string) => ({
            value: () => {
              if (propName === 'contains') return s.membership?.contains;
              return undefined;
            },
          }),
        };
      }
      return { exists: () => false, property: () => ({ value: () => undefined }) };
    },
  }));

  return {
    byProtocol: (protocol: string) => ({
      length: protocol === 'RVSession' ? mockSessions.length : 0,
      first: () => mockSessions[0],
    }),
    objects: () => mockObjects,
  } as unknown as GTODTO;
}

describe('GTOGraphLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadGTOGraph', () => {
    it('GTO-001: parses valid GTO and returns graph', () => {
      const mockNode = {
        type: 'RVSequenceGroup',
        name: 'defaultSequence',
        properties: {
          has: vi.fn().mockReturnValue(false),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'TestSession', frame: 1, fps: 24 }],
        objects: [
          {
            name: 'defaultSequence',
            protocol: 'RVSequenceGroup',
            components: {
              group: { ui_name: 'My Sequence' },
              mode: { inputs: [] },
            },
          },
        ],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.graph).toBeDefined();
      expect(result.nodes.size).toBe(1);
      expect(result.sessionInfo.name).toBe('TestSession');
    });

    it('GTO-002: extracts session info correctly', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [
          {
            name: 'MySession',
            viewNode: 'defaultSequence',
            currentFrame: 42,
            fps: 30,
            realtime: 24,
            region: [[10, 20]],
            marks: [12, 18],
          },
        ],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.name).toBe('MySession');
      expect(result.sessionInfo.viewNode).toBe('defaultSequence');
      expect(result.sessionInfo.frame).toBe(42);
      expect(result.sessionInfo.inPoint).toBe(10);
      expect(result.sessionInfo.outPoint).toBe(20);
      expect(result.sessionInfo.marks).toEqual([12, 18]);
      // Should prefer realtime over fps
      expect(result.sessionInfo.fps).toBe(24);
    });

    it('GTO-MRK-U001: extracts marker notes and colors correctly', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [
          {
            name: 'MarkerSession',
            marks: [10, 20, 30],
            markerNotes: ['First note', 'Second note', 'Third note'],
            markerColors: ['#ff0000', '#00ff00', '#0000ff'],
          },
        ],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.marks).toEqual([10, 20, 30]);
      expect(result.sessionInfo.markerNotes).toEqual(['First note', 'Second note', 'Third note']);
      expect(result.sessionInfo.markerColors).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    });

    it('GTO-MRK-U002: handles missing marker notes and colors gracefully', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [
          {
            name: 'LegacySession',
            marks: [5, 15],
            // No markerNotes or markerColors - legacy format
          },
        ],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.marks).toEqual([5, 15]);
      expect(result.sessionInfo.markerNotes).toBeUndefined();
      expect(result.sessionInfo.markerColors).toBeUndefined();
    });

    it('GTO-003: creates RVFileSource nodes', () => {
      const mockNode = {
        type: 'RVFileSource',
        name: 'sourceNode',
        properties: {
          has: vi.fn((key: string) => ['url', 'width', 'height'].includes(key)),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'Test' }],
        objects: [
          {
            name: 'sourceNode',
            protocol: 'RVFileSource',
            components: {
              media: { movie: '/path/to/file.mov' },
              proxy: { size: [1920, 1080] },
            },
          },
        ],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.nodes.size).toBe(1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('url', '/path/to/file.mov');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('width', 1920);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('height', 1080);
    });

    it('GTO-004: creates RVSequenceGroup with connections', () => {
      const sourceNode = {
        id: 'source1-id',
        type: 'RVFileSource',
        name: 'source1',
        properties: { has: vi.fn().mockReturnValue(false), setValue: vi.fn() },
        inputs: [] as unknown[],
        outputs: [],
        connectInput: vi.fn(),
        disconnectInput: vi.fn(),
      };

      const sequenceNode = {
        id: 'sequence-id',
        type: 'RVSequenceGroup',
        name: 'sequence',
        properties: { has: vi.fn().mockReturnValue(false), setValue: vi.fn() },
        inputs: [] as unknown[],
        outputs: [],
        connectInput: vi.fn(),
        disconnectInput: vi.fn(),
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockImplementation((type: string) => {
        if (type === 'RVFileSource') return sourceNode as never;
        if (type === 'RVSequenceGroup') return sequenceNode as never;
        return null;
      });

      const dto = createMockDTO({
        sessions: [{ name: 'Test', viewNode: 'sequence' }],
        objects: [
          {
            name: 'source1',
            protocol: 'RVFileSource',
            components: {},
          },
          {
            name: 'sequence',
            protocol: 'RVSequenceGroup',
            components: {
              mode: { inputs: ['source1'] },
            },
          },
        ],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.nodes.size).toBe(2);
      expect(result.rootNode).toBe(sequenceNode);
    });

    it('GTO-005: establishes node connections', () => {
      const node1 = {
        id: 'input1-id',
        type: 'RVFileSource',
        name: 'input1',
        properties: { has: vi.fn().mockReturnValue(false), setValue: vi.fn() },
        inputs: [] as unknown[],
        outputs: [],
        connectInput: vi.fn(),
        disconnectInput: vi.fn(),
      };

      const node2 = {
        id: 'stack-id',
        type: 'RVStackGroup',
        name: 'stack',
        properties: { has: vi.fn().mockReturnValue(false), setValue: vi.fn() },
        inputs: [] as unknown[],
        outputs: [],
        connectInput: vi.fn(),
        disconnectInput: vi.fn(),
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockImplementation((type: string) => {
        if (type === 'RVFileSource') return node1 as never;
        if (type === 'RVStackGroup') return node2 as never;
        return null;
      });

      const dto = createMockDTO({
        sessions: [{ name: 'Test' }],
        objects: [
          { name: 'input1', protocol: 'RVFileSource', components: {} },
          {
            name: 'stack',
            protocol: 'RVStackGroup',
            components: {
              mode: { inputs: ['input1'] },
            },
          },
        ],
      });

      const result = loadGTOGraph(dto as never);

      // Both nodes should be in the graph
      expect(result.nodes.get('input1')).toBe(node1);
      expect(result.nodes.get('stack')).toBe(node2);
    });

    it('GTO-006: skips unknown protocols silently', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [{ name: 'Test' }],
        objects: [
          { name: 'unknownNode', protocol: 'UnknownProtocol', components: {} },
        ],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.nodes.size).toBe(0);
    });

    it('GTO-007: identifies root/view node', () => {
      const mockNode = {
        type: 'RVSequenceGroup',
        name: 'viewNode',
        properties: { has: vi.fn().mockReturnValue(false), setValue: vi.fn() },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'Test', viewNode: 'viewNode' }],
        objects: [
          { name: 'viewNode', protocol: 'RVSequenceGroup', components: {} },
        ],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.rootNode).toBe(mockNode);
    });

    it('GTO-010: throws error for invalid GTO', () => {
      const badDTO = {
        byProtocol: () => { throw new Error('Invalid GTO structure'); },
        objects: () => [],
      };

      expect(() => loadGTOGraph(badDTO as never)).toThrow('Failed to construct node graph from GTO');
    });

    it('uses default session name when none provided', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.name).toBe('Untitled Session');
    });

    it('prefers realtime fps over fps', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [{ name: 'Test', fps: 30, realtime: 24 }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.fps).toBe(24);
    });

    it('falls back to fps when realtime not available', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [{ name: 'Test', fps: 30 }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.fps).toBe(30);
    });

    it('uses matching local file for RVFileSource url if available', () => {
      const mockNode = {
        type: 'RVFileSource',
        name: 'sourceNode',
        properties: {
          has: vi.fn((key: string) => ['url', 'originalUrl'].includes(key)),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      // Mock URL.createObjectURL
      const originalCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');

      const dto = createMockDTO({
        sessions: [{ name: 'Test' }],
        objects: [
          {
            name: 'sourceNode',
            protocol: 'RVFileSource',
            components: {
              media: { movie: '/path/to/myvideo.mp4' },
            },
          },
        ],
      });

      const availableFiles = new Map<string, File>();
      // @ts-ignore
      const mockFile = { name: 'myvideo.mp4' } as File;
      availableFiles.set('myvideo.mp4', mockFile);

      loadGTOGraph(dto as never, availableFiles);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('url', 'blob:mock-url');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('originalUrl', '/path/to/myvideo.mp4');

      // Cleanup
      URL.createObjectURL = originalCreateObjectURL;
    });

    it('parses range as flat array [start, end]', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [
          {
            name: 'Test',
            range: [1, 100],
          },
        ],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.inPoint).toBe(1);
      expect(result.sessionInfo.outPoint).toBe(100);
    });

    it('parses range as nested array [[start, end]]', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [
          {
            name: 'Test',
            range: [[5, 50]],
          },
        ],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.inPoint).toBe(5);
      expect(result.sessionInfo.outPoint).toBe(50);
    });

    it('uses frame property when currentFrame is not available', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [
          {
            name: 'Test',
            frame: 25,
          },
        ],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.frame).toBe(25);
    });

    it('prefers frame over currentFrame property', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [
          {
            name: 'Test',
            frame: 10,
            currentFrame: 25,
          },
        ],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      // According to the code logic, frame is checked first
      expect(result.sessionInfo.frame).toBe(10);
    });

    it('parses session inc and version properties', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [{ name: 'Test', inc: 2, version: 3 }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.inc).toBe(2);
      expect(result.sessionInfo.version).toBe(3);
    });

    it('parses session root component (displayName and comment)', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [{
          name: 'Test',
          root: {
            name: 'My Session Name',
            comment: 'This is a test session',
          },
        }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.displayName).toBe('My Session Name');
      expect(result.sessionInfo.comment).toBe('This is a test session');
    });

    it('parses session matte settings', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [{
          name: 'Test',
          matte: {
            show: 1,
            aspect: 2.35,
            opacity: 0.8,
            heightVisible: 0.9,
            centerPoint: [0.1, 0.2],
          },
        }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.matte).toBeDefined();
      expect(result.sessionInfo.matte?.show).toBe(true);
      expect(result.sessionInfo.matte?.aspect).toBe(2.35);
      expect(result.sessionInfo.matte?.opacity).toBe(0.8);
      expect(result.sessionInfo.matte?.heightVisible).toBe(0.9);
      expect(result.sessionInfo.matte?.centerPoint).toEqual([0.1, 0.2]);
    });

    it('parses session paintEffects settings', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [{
          name: 'Test',
          paintEffects: {
            hold: 1,
            ghost: 1,
            ghostBefore: 3,
            ghostAfter: 7,
          },
        }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.paintEffects).toBeDefined();
      expect(result.sessionInfo.paintEffects?.hold).toBe(true);
      expect(result.sessionInfo.paintEffects?.ghost).toBe(true);
      expect(result.sessionInfo.paintEffects?.ghostBefore).toBe(3);
      expect(result.sessionInfo.paintEffects?.ghostAfter).toBe(7);
    });

    it('parses session clipboard property', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [{
          name: 'Test',
          clipboard: 42,
        }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.clipboard).toBe(42);
    });

    it('parses session internal creationContext', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [{
          name: 'Test',
          internal: {
            creationContext: 1,
          },
        }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.creationContext).toBe(1);
    });

    it('parses session node origin', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [{
          name: 'Test',
          node: {
            origin: 'OpenRV 2.0',
          },
        }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.origin).toBe('OpenRV 2.0');
    });

    it('parses session membership contains', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [{
          name: 'Test',
          membership: {
            contains: ['sourceGroup000000', 'sourceGroup000001', 'defaultSequence'],
          },
        }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.membershipContains).toBeDefined();
      expect(result.sessionInfo.membershipContains).toEqual(['sourceGroup000000', 'sourceGroup000001', 'defaultSequence']);
    });

    it('creates RVImageSource nodes correctly', () => {
      const mockNode = {
        type: 'RVFileSource',
        name: 'imageSource',
        properties: {
          has: vi.fn((key: string) => ['url'].includes(key)),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'Test' }],
        objects: [
          {
            name: 'imageSource',
            protocol: 'RVImageSource',
            components: {
              media: { movie: '/path/to/image.exr' },
            },
          },
        ],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.nodes.size).toBe(1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('url', '/path/to/image.exr');
    });

    it('handles nested size array format [[width, height]]', () => {
      const mockNode = {
        type: 'RVFileSource',
        name: 'sourceNode',
        properties: {
          has: vi.fn((key: string) => ['url', 'width', 'height'].includes(key)),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'Test' }],
        objects: [
          {
            name: 'sourceNode',
            protocol: 'RVFileSource',
            components: {
              media: { movie: '/path/to/file.mov' },
              proxy: { size: [[1920, 1080]] },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('width', 1920);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('height', 1080);
    });

    it('parses RVFileSource group, cut, and request components', () => {
      const mockNode = {
        type: 'RVFileSource',
        name: 'sourceNode',
        properties: {
          has: vi.fn((key: string) =>
            ['url', 'sourceFps', 'sourceVolume', 'sourceAudioOffset', 'sourceBalance',
             'sourceCrossover', 'sourceNoMovieAudio', 'sourceRangeOffset', 'sourceRangeStart',
             'sourceCutIn', 'sourceCutOut', 'sourceReadAllChannels'].includes(key)),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'Test' }],
        objects: [
          {
            name: 'sourceNode',
            protocol: 'RVFileSource',
            components: {
              media: { movie: '/path/to/file.mov' },
              group: {
                fps: 29.97,
                volume: 0.8,
                audioOffset: 0.5,
                balance: -0.3,
                crossover: 1000,
                noMovieAudio: 1,
                rangeOffset: 10,
                rangeStart: 5,
              },
              cut: {
                in: 100,
                out: 500,
              },
              request: {
                readAllChannels: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('url', '/path/to/file.mov');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceFps', 29.97);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceVolume', 0.8);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceAudioOffset', 0.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceBalance', -0.3);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceCrossover', 1000);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceNoMovieAudio', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceRangeOffset', 10);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceRangeStart', 5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceCutIn', 100);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceCutOut', 500);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceReadAllChannels', true);
    });

    it('parses RVFileSource proxy component properties', () => {
      const mockNode = {
        type: 'RVFileSource',
        name: 'sourceNode',
        properties: {
          has: vi.fn((key: string) =>
            ['width', 'height', 'proxyPath', 'proxyScale', 'proxyDepth',
             'proxyChannels', 'proxyFloatingPoint', 'proxyScanline', 'proxyPlanar'].includes(key)),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'Test' }],
        objects: [
          {
            name: 'sourceNode',
            protocol: 'RVFileSource',
            components: {
              media: { movie: '/path/to/file.mov' },
              proxy: {
                size: [1920, 1080],
                path: '/path/to/proxy.mov',
                scale: 0.5,
                depth: 8,
                channels: 3,
                floatingPoint: 0,
                scanline: 1,
                planar: 0,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('width', 1920);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('height', 1080);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('proxyPath', '/path/to/proxy.mov');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('proxyScale', 0.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('proxyDepth', 8);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('proxyChannels', 3);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('proxyFloatingPoint', false);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('proxyScanline', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('proxyPlanar', false);
    });

    it('parses RVImageSource image component properties', () => {
      const mockNode = {
        type: 'RVFileSource',
        name: 'imageSource',
        properties: {
          has: vi.fn((key: string) =>
            ['url', 'imageWidth', 'imageHeight', 'imageUncropWidth', 'imageUncropHeight',
             'imageUncropX', 'imageUncropY', 'imagePixelAspect', 'imageFps', 'imageStart',
             'imageEnd', 'imageInc', 'imageEncoding', 'imageChannels', 'imageBitsPerChannel',
             'imageIsFloat'].includes(key)),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'Test' }],
        objects: [
          {
            name: 'imageSource',
            protocol: 'RVImageSource',
            components: {
              media: { movie: '/path/to/image.exr' },
              image: {
                width: 1920,
                height: 1080,
                uncropWidth: 2048,
                uncropHeight: 1152,
                uncropX: 64,
                uncropY: 36,
                pixelAspect: 1.0,
                fps: 24,
                start: 1,
                end: 100,
                inc: 1,
                encoding: 'None',
                channels: 'RGBA',
                bitsPerChannel: 16,
                float: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('url', '/path/to/image.exr');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageWidth', 1920);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageHeight', 1080);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageUncropWidth', 2048);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageUncropHeight', 1152);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageUncropX', 64);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageUncropY', 36);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imagePixelAspect', 1.0);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageFps', 24);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageStart', 1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageEnd', 100);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageInc', 1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageEncoding', 'None');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageChannels', 'RGBA');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageBitsPerChannel', 16);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('imageIsFloat', true);
    });

    it('parses RVMovieSource properties', () => {
      const mockNode = {
        type: 'RVVideoSource',
        name: 'movieSource',
        properties: { has: vi.fn().mockReturnValue(true), setValue: vi.fn() },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'Test', viewNode: 'movieSource' }],
        objects: [
          {
            name: 'movieSource',
            protocol: 'RVMovieSource',
            components: {
              media: { movie: '/path/to/movie.mov' },
              group: {
                fps: 29.97,
                volume: 0.8,
                audioOffset: 0.5,
                balance: 0.0,
                noMovieAudio: 0,
                rangeOffset: 10,
                rangeStart: 1,
              },
              cut: {
                in: 100,
                out: 500,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('url', '/path/to/movie.mov');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceFps', 29.97);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceVolume', 0.8);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceAudioOffset', 0.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceBalance', 0.0);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceNoMovieAudio', false);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceRangeOffset', 10);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceRangeStart', 1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceCutIn', 100);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceCutOut', 500);
    });

    it('finds leaf node as root when viewNode not specified', () => {
      let nodeIdCounter = 0;

      const sourceNode = {
        id: `source-${nodeIdCounter++}`,
        type: 'RVFileSource',
        name: 'source',
        properties: { has: vi.fn().mockReturnValue(false), setValue: vi.fn() },
        inputs: [],
        outputs: [{ name: 'sequence' }], // Has outputs, not a leaf
      };

      const leafNode = {
        id: `sequence-${nodeIdCounter++}`,
        type: 'RVSequenceGroup',
        name: 'sequence',
        properties: { has: vi.fn().mockReturnValue(false), setValue: vi.fn() },
        inputs: [],
        outputs: [], // No outputs, is a leaf
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockImplementation((type: string) => {
        if (type === 'RVFileSource') return { ...sourceNode, id: `source-${Date.now()}` } as never;
        if (type === 'RVSequenceGroup') return { ...leafNode, id: `sequence-${Date.now()}` } as never;
        return null;
      });

      const dto = createMockDTO({
        sessions: [{ name: 'Test' }], // No viewNode specified
        objects: [
          { name: 'source', protocol: 'RVFileSource', components: {} },
          { name: 'sequence', protocol: 'RVSequenceGroup', components: {} },
        ],
      });

      const result = loadGTOGraph(dto as never);

      // Should find a leaf node (no outputs) as root
      expect(result.rootNode).not.toBeNull();
      expect(result.nodes.size).toBe(2);
    });

    it('skips RVSession protocol in objects iteration', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(false);

      const dto = createMockDTO({
        sessions: [{ name: 'Test' }],
        objects: [
          { name: 'session', protocol: 'RVSession', components: {} },
        ],
      });

      const result = loadGTOGraph(dto as never);

      // RVSession should be skipped, no nodes created
      expect(result.nodes.size).toBe(0);
    });

    it('handles connection failures gracefully', () => {
      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockImplementation((type: string) => {
        const id = `${type}-${Date.now()}-${Math.random()}`;
        if (type === 'RVFileSource') {
          return {
            id,
            type: 'RVFileSource',
            name: 'input1',
            properties: { has: vi.fn().mockReturnValue(false), setValue: vi.fn() },
            inputs: [],
            outputs: [],
          } as never;
        }
        if (type === 'RVStackGroup') {
          return {
            id,
            type: 'RVStackGroup',
            name: 'stack',
            properties: { has: vi.fn().mockReturnValue(false), setValue: vi.fn() },
            inputs: [],
            outputs: [],
          } as never;
        }
        return null;
      });

      // Create DTO where stack references a non-existent node
      const dto = createMockDTO({
        sessions: [{ name: 'Test' }],
        objects: [
          { name: 'input1', protocol: 'RVFileSource', components: {} },
          {
            name: 'stack',
            protocol: 'RVStackGroup',
            components: {
              mode: { inputs: ['nonExistentNode'] }, // This node doesn't exist
            },
          },
        ],
      });

      // Should not throw, just skip the connection
      const result = loadGTOGraph(dto as never);

      expect(result.nodes.size).toBe(2);
    });
  });

  describe('getGraphSummary', () => {
    it('returns formatted summary string', () => {
      const mockResult: GTOParseResult = {
        graph: {} as never,
        nodes: new Map([
          ['node1', { name: 'Node 1', type: 'RVFileSource', inputs: [] } as never],
          ['node2', { name: 'Node 2', type: 'RVSequenceGroup', inputs: [{ name: 'Node 1' }] } as never],
        ]),
        rootNode: { name: 'Node 2' } as never,
        sessionInfo: { name: 'TestSession' },
      };

      const summary = getGraphSummary(mockResult);

      expect(summary).toContain('Session: TestSession');
      expect(summary).toContain('Nodes: 2');
      expect(summary).toContain('Root: Node 2');
      expect(summary).toContain('node1 (RVFileSource)');
      expect(summary).toContain('node2 (RVSequenceGroup)');
    });

    it('handles no root node', () => {
      const mockResult: GTOParseResult = {
        graph: {} as never,
        nodes: new Map(),
        rootNode: null,
        sessionInfo: { name: 'EmptySession' },
      };

      const summary = getGraphSummary(mockResult);

      expect(summary).toContain('Root: none');
    });
  });
});
