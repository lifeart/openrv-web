/**
 * GTOGraphLoader Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadGTOGraph, getGraphSummary } from './GTOGraphLoader';
import type { GTOParseResult } from './GTOGraphLoader';
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
  };
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

    it('GTO-008: parses CDL properties', () => {
      const mockNode = {
        type: 'RVCDL',
        name: 'cdlNode',
        properties: {
          has: vi.fn((key: string) => ['slope', 'cdlOffset', 'power', 'cdlSaturation'].includes(key)),
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
            name: 'cdlNode',
            protocol: 'RVCDL',
            components: {
              CDL: {
                slope: [1.1, 1.0, 0.9],
                offset: [0.01, 0.0, -0.01],
                power: [1.0, 1.0, 1.0],
                saturation: 1.2,
              },
            },
          },
        ],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.nodes.size).toBe(1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('slope', [1.1, 1.0, 0.9]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlOffset', [0.01, 0.0, -0.01]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('power', [1.0, 1.0, 1.0]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlSaturation', 1.2);
    });

    it('GTO-009: parses transform properties', () => {
      const mockNode = {
        type: 'RVTransform2D',
        name: 'transformNode',
        properties: {
          has: vi.fn((key: string) => ['rotate', 'flip', 'flop', 'scale'].includes(key)),
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
            name: 'transformNode',
            protocol: 'RVTransform2D',
            components: {
              transform: {
                rotate: 90,
                flip: true,
                flop: false,
                scale: [1.5, 1.5],
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('rotate', 90);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('flip', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('flop', false);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('scale', [1.5, 1.5]);
    });

    it('GTO-010: throws error for invalid GTO', () => {
      const badDTO = {
        byProtocol: () => { throw new Error('Invalid GTO structure'); },
        objects: () => [],
      };

      expect(() => loadGTOGraph(badDTO as never)).toThrow('Failed to construct node graph from GTO');
    });

    it('parses stack/wipe properties', () => {
      const mockNode = {
        type: 'RVStackGroup',
        name: 'stackNode',
        properties: {
          has: vi.fn((key: string) => ['composite', 'mode', 'wipeX', 'wipeY', 'wipeAngle'].includes(key)),
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
            name: 'stackNode',
            protocol: 'RVStackGroup',
            components: {
              stack: { composite: 'over', mode: 'wipe' },
              wipe: { x: 0.5, y: 0.5, angle: 45 },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('composite', 'over');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('mode', 'wipe');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('wipeX', 0.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('wipeY', 0.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('wipeAngle', 45);
    });

    it('parses switch properties', () => {
      const mockNode = {
        type: 'RVSwitchGroup',
        name: 'switchNode',
        properties: {
          has: vi.fn((key: string) => key === 'outputIndex'),
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
            name: 'switchNode',
            protocol: 'RVSwitchGroup',
            components: {
              output: { index: 2 },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('outputIndex', 2);
    });

    it('parses lens warp properties', () => {
      const mockNode = {
        type: 'RVLensWarp',
        name: 'lensNode',
        properties: {
          has: vi.fn((key: string) => ['k1', 'k2', 'k3'].includes(key)),
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
            name: 'lensNode',
            protocol: 'RVLensWarp',
            components: {
              warp: { k1: 0.1, k2: 0.05, k3: 0.01 },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('k1', 0.1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('k2', 0.05);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('k3', 0.01);
    });

    it('parses extended RVLensWarp properties (tangential, model, center)', () => {
      const mockNode = {
        type: 'RVLensWarp',
        name: 'lensNode',
        properties: {
          has: vi.fn((key: string) =>
            [
              'k1', 'k2', 'k3', 'p1', 'p2', 'lensModel', 'distortionScale',
              'centerX', 'centerY', 'pixelAspectRatio', 'fx', 'fy',
              'cropRatioX', 'cropRatioY', 'lensWarpActive',
            ].includes(key)
          ),
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
            name: 'lensNode',
            protocol: 'RVLensWarp',
            components: {
              node: { active: 1 },
              warp: {
                k1: 0.1,
                k2: 0.05,
                k3: 0.01,
                p1: 0.001,
                p2: 0.002,
                model: 'brown',
                d: 1.1,
                center: [0.55, 0.45],
                pixelAspectRatio: 1.0,
                fx: 1.5,
                fy: 1.5,
                cropRatioX: 0.9,
                cropRatioY: 0.9,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lensWarpActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('k1', 0.1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('k2', 0.05);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('k3', 0.01);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('p1', 0.001);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('p2', 0.002);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lensModel', 'brown');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('distortionScale', 1.1);
      // Use expect.closeTo for floating point precision (center[0] - 0.5 = 0.55 - 0.5 = 0.05)
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('centerX', expect.closeTo(0.05, 5));
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('centerY', expect.closeTo(-0.05, 5));
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('pixelAspectRatio', 1.0);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('fx', 1.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('fy', 1.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cropRatioX', 0.9);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cropRatioY', 0.9);
    });

    it('parses color properties', () => {
      const mockNode = {
        type: 'RVColor',
        name: 'colorNode',
        properties: {
          has: vi.fn((key: string) => ['exposure', 'gamma', 'saturation', 'offset', 'contrast'].includes(key)),
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
            name: 'colorNode',
            protocol: 'RVColor',
            components: {
              color: {
                exposure: 1.5,
                gamma: 2.2,
                saturation: 1.1,
                offset: 0.1,
                contrast: 1.2,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('exposure', 1.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('gamma', 2.2);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('saturation', 1.1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('offset', 0.1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('contrast', 1.2);
    });

    it('parses extended RVColor properties (invert, normalize, unpremult, hue)', () => {
      const mockNode = {
        type: 'RVColor',
        name: 'colorNode',
        properties: {
          has: vi.fn((key: string) =>
            ['invert', 'normalize', 'unpremult', 'hue', 'colorLut', 'colorScale', 'colorActive'].includes(key)
          ),
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
            name: 'colorNode',
            protocol: 'RVColor',
            components: {
              color: {
                invert: 1,
                normalize: 1,
                unpremult: 1,
                hue: 30.0,
                lut: 'custom_lut',
                scale: [1.2, 1.1, 1.0],
                active: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('invert', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('normalize', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('unpremult', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('hue', 30.0);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorLut', 'custom_lut');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorScale', [1.2, 1.1, 1.0]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorActive', true);
    });

    it('parses CDL component in RVColor', () => {
      const mockNode = {
        type: 'RVColor',
        name: 'colorNode',
        properties: {
          has: vi.fn((key: string) =>
            ['cdlActive', 'cdlColorspace', 'slope', 'cdlOffset', 'power', 'cdlSaturation', 'cdlNoClamp'].includes(key)
          ),
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
            name: 'colorNode',
            protocol: 'RVColor',
            components: {
              CDL: {
                active: 1,
                colorspace: 'aceslog',
                slope: [1.1, 1.0, 0.9],
                offset: [0.01, 0.0, -0.01],
                power: [1.0, 1.0, 1.05],
                saturation: 0.95,
                noClamp: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlColorspace', 'aceslog');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('slope', [1.1, 1.0, 0.9]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlOffset', [0.01, 0.0, -0.01]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('power', [1.0, 1.0, 1.05]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlSaturation', 0.95);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlNoClamp', true);
    });

    it('parses luminanceLUT component in RVColor', () => {
      const mockNode = {
        type: 'RVColor',
        name: 'colorNode',
        properties: {
          has: vi.fn((key: string) =>
            ['luminanceLutActive', 'luminanceLut', 'luminanceLutMax', 'luminanceLutSize', 'luminanceLutName'].includes(key)
          ),
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
            name: 'colorNode',
            protocol: 'RVColor',
            components: {
              luminanceLUT: {
                active: 1,
                lut: [0, 0.25, 0.5, 0.75, 1.0],
                max: 2.0,
                size: 256,
                name: 'TestLumLUT',
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('luminanceLutActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('luminanceLut', [0, 0.25, 0.5, 0.75, 1.0]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('luminanceLutMax', 2.0);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('luminanceLutSize', 256);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('luminanceLutName', 'TestLumLUT');
    });

    it('parses RVRetime visual and audio properties', () => {
      const mockNode = {
        type: 'RVRetime',
        name: 'retimeNode',
        properties: {
          has: vi.fn((key: string) =>
            ['visualScale', 'visualOffset', 'audioScale', 'audioOffset', 'retimeOutputFps'].includes(key)
          ),
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
            name: 'retimeNode',
            protocol: 'RVRetime',
            components: {
              visual: { scale: 2.0, offset: 10 },
              audio: { scale: 1.5, offset: 5 },
              output: { fps: 30 },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('visualScale', 2.0);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('visualOffset', 10);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('audioScale', 1.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('audioOffset', 5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('retimeOutputFps', 30);
    });

    it('parses RVRetime warp component', () => {
      const mockNode = {
        type: 'RVRetime',
        name: 'retimeNode',
        properties: {
          has: vi.fn((key: string) =>
            ['warpActive', 'warpStyle', 'warpKeyFrames', 'warpKeyRates'].includes(key)
          ),
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
            name: 'retimeNode',
            protocol: 'RVRetime',
            components: {
              warp: {
                active: 1,
                style: 1,
                keyFrames: [1, 50, 100],
                keyRates: [1.0, 2.0, 0.5],
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('warpActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('warpStyle', 1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('warpKeyFrames', [1, 50, 100]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('warpKeyRates', [1.0, 2.0, 0.5]);
    });

    it('parses RVRetime explicit component', () => {
      const mockNode = {
        type: 'RVRetime',
        name: 'retimeNode',
        properties: {
          has: vi.fn((key: string) =>
            ['explicitActive', 'explicitFirstOutputFrame', 'explicitInputFrames'].includes(key)
          ),
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
            name: 'retimeNode',
            protocol: 'RVRetime',
            components: {
              explicit: {
                active: 1,
                firstOutputFrame: 10,
                inputFrames: [5, 10, 15, 20, 25],
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('explicitActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('explicitFirstOutputFrame', 10);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('explicitInputFrames', [5, 10, 15, 20, 25]);
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

  describe('RVLinearize parsing', () => {
    it('parses RVLinearize node component active state', () => {
      const mockNode = {
        type: 'RVLinearize',
        name: 'linearize',
        properties: {
          has: vi.fn(() => true),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'rv' }],
        objects: [
          {
            name: 'linearize',
            protocol: 'RVLinearize',
            components: {
              node: { active: 1 },
            },
          },
        ],
      });

      loadGTOGraph(dto);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('linearizeActive', true);
    });

    it('parses RVLinearize color component transfer functions', () => {
      const mockNode = {
        type: 'RVLinearize',
        name: 'linearize',
        properties: {
          has: vi.fn(() => true),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'rv' }],
        objects: [
          {
            name: 'linearize',
            protocol: 'RVLinearize',
            components: {
              node: { active: 1 },
              color: {
                active: 1,
                sRGB2linear: 1,
                Rec709ToLinear: 0,
                logtype: 1,
                fileGamma: 2.2,
                alphaType: 1,
                YUV: 1,
                invert: 0,
                lut: 'MyLUT',
                ignoreChromaticities: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('linearizeColorActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sRGB2linear', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('rec709ToLinear', false);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('logtype', 1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('fileGamma', 2.2);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('alphaType', 1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('yuv', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('linearizeInvert', false);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('linearizeLut', 'MyLUT');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ignoreChromaticities', true);
    });

    it('parses RVLinearize cineon component', () => {
      const mockNode = {
        type: 'RVLinearize',
        name: 'linearize',
        properties: {
          has: vi.fn(() => true),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'rv' }],
        objects: [
          {
            name: 'linearize',
            protocol: 'RVLinearize',
            components: {
              node: { active: 1 },
              cineon: {
                whiteCodeValue: 700,
                blackCodeValue: 100,
                breakPointValue: 680,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cineonWhiteCode', 700);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cineonBlackCode', 100);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cineonBreakPoint', 680);
    });

    it('parses RVLinearize LUT component', () => {
      const mockNode = {
        type: 'RVLinearize',
        name: 'linearize',
        properties: {
          has: vi.fn(() => true),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'rv' }],
        objects: [
          {
            name: 'linearize',
            protocol: 'RVLinearize',
            components: {
              node: { active: 1 },
              lut: {
                active: 1,
                file: '/path/to/lut.cube',
                name: 'TestLUT',
                type: 'RGB',
                scale: 1.5,
                offset: 0.1,
                size: [32, 32, 32],
              },
            },
          },
        ],
      });

      loadGTOGraph(dto);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lutActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lutFile', '/path/to/lut.cube');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lutName', 'TestLUT');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lutType', 'RGB');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lutScale', 1.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lutOffset', 0.1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lutSize', [32, 32, 32]);
    });
  });

  describe('RVTransform2D parsing with scale and translate', () => {
    it('parses scale property', () => {
      const mockNode = {
        type: 'RVTransform2D',
        name: 'transform',
        properties: {
          has: vi.fn(() => true),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'rv' }],
        objects: [
          {
            name: 'transform',
            protocol: 'RVTransform2D',
            components: {
              transform: {
                rotate: 90,
                flip: true,
                flop: false,
                scale: [2.0, 1.5],
              },
            },
          },
        ],
      });

      loadGTOGraph(dto);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('scale', [2.0, 1.5]);
    });

    it('parses translate property', () => {
      const mockNode = {
        type: 'RVTransform2D',
        name: 'transform',
        properties: {
          has: vi.fn(() => true),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'rv' }],
        objects: [
          {
            name: 'transform',
            protocol: 'RVTransform2D',
            components: {
              transform: {
                rotate: 0,
                flip: false,
                flop: false,
                translate: [0.1, -0.2],
              },
            },
          },
        ],
      });

      loadGTOGraph(dto);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('translate', [0.1, -0.2]);
    });
  });

  describe('RVLookLUT parsing', () => {
    it('parses RVLookLUT node component active state', () => {
      const mockNode = {
        type: 'RVLookLUT',
        name: 'lookLut',
        properties: {
          has: vi.fn(() => true),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'rv' }],
        objects: [
          {
            name: 'lookLut',
            protocol: 'RVLookLUT',
            components: {
              node: { active: 1 },
            },
          },
        ],
      });

      loadGTOGraph(dto);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lookLutActive', true);
    });

    it('parses RVLookLUT lut component properties', () => {
      const mockNode = {
        type: 'RVLookLUT',
        name: 'lookLut',
        properties: {
          has: vi.fn(() => true),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'rv' }],
        objects: [
          {
            name: 'lookLut',
            protocol: 'RVLookLUT',
            components: {
              node: { active: 1 },
              lut: {
                active: 1,
                file: '/path/to/lut.cube',
                name: 'TestLUT',
                type: 'RGB',
                scale: 1.5,
                offset: 0.1,
                conditioningGamma: 2.2,
                size: [33, 33, 33],
                preLUTSize: 256,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lookLutComponentActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lookLutFile', '/path/to/lut.cube');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lookLutName', 'TestLUT');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lookLutType', 'RGB');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lookLutScale', 1.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lookLutOffset', 0.1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lookLutConditioningGamma', 2.2);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lookLutSize', [33, 33, 33]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lookLutPreLUTSize', 256);
    });

    it('parses RVCacheLUT the same as RVLookLUT', () => {
      const mockNode = {
        type: 'RVCacheLUT',
        name: 'cacheLut',
        properties: {
          has: vi.fn(() => true),
          setValue: vi.fn(),
        },
        inputs: [],
        outputs: [],
      };

      vi.mocked(NodeFactory.isRegistered).mockReturnValue(true);
      vi.mocked(NodeFactory.create).mockReturnValue(mockNode as never);

      const dto = createMockDTO({
        sessions: [{ name: 'rv' }],
        objects: [
          {
            name: 'cacheLut',
            protocol: 'RVCacheLUT',
            components: {
              node: { active: 1 },
              lut: {
                active: 1,
                file: '/cached/lut.cube',
              },
            },
          },
        ],
      });

      loadGTOGraph(dto);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lookLutActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lookLutComponentActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('lookLutFile', '/cached/lut.cube');
    });
  });
});
