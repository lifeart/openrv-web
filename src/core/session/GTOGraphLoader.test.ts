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
    inc?: number;
    version?: number;
    root?: { name?: string; comment?: string };
    matte?: { show?: number; aspect?: number; opacity?: number; heightVisible?: number; centerPoint?: number[] };
    paintEffects?: { hold?: number; ghost?: number; ghostBefore?: number; ghostAfter?: number };
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
              if (propName === 'inc') return s.inc;
              if (propName === 'version') return s.version;
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

    it('parses RVDisplayColor color component', () => {
      const mockNode = {
        type: 'RVDisplayColor',
        name: 'displayColorNode',
        properties: {
          has: vi.fn((key: string) =>
            [
              'displayColorActive', 'channelOrder', 'channelFlood', 'premult',
              'displayGamma', 'sRGB', 'Rec709', 'displayBrightness',
              'outOfRange', 'dither', 'ditherLast', 'overrideColorspace',
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
            name: 'displayColorNode',
            protocol: 'RVDisplayColor',
            components: {
              color: {
                active: 1,
                channelOrder: 'BGRA',
                channelFlood: 1,
                premult: 1,
                gamma: 2.4,
                sRGB: 1,
                Rec709: 0,
                brightness: 0.5,
                outOfRange: 1,
                dither: 1,
                ditherLast: 0,
                overrideColorspace: 'sRGB',
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('displayColorActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('channelOrder', 'BGRA');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('channelFlood', 1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('premult', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('displayGamma', 2.4);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sRGB', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('Rec709', false);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('displayBrightness', 0.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('outOfRange', 1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('dither', 1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ditherLast', false);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('overrideColorspace', 'sRGB');
    });

    it('parses RVDisplayColor chromaticities component', () => {
      const mockNode = {
        type: 'RVDisplayColor',
        name: 'displayColorNode',
        properties: {
          has: vi.fn((key: string) =>
            [
              'chromaticitiesActive', 'adoptedNeutral', 'chromaticitiesWhite',
              'chromaticitiesRed', 'chromaticitiesGreen', 'chromaticitiesBlue',
              'chromaticitiesNeutral',
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
            name: 'displayColorNode',
            protocol: 'RVDisplayColor',
            components: {
              chromaticities: {
                active: 1,
                adoptedNeutral: 1,
                white: [0.3127, 0.329],
                red: [0.64, 0.33],
                green: [0.3, 0.6],
                blue: [0.15, 0.06],
                neutral: [0.3127, 0.329],
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('chromaticitiesActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('adoptedNeutral', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('chromaticitiesWhite', [0.3127, 0.329]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('chromaticitiesRed', [0.64, 0.33]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('chromaticitiesGreen', [0.3, 0.6]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('chromaticitiesBlue', [0.15, 0.06]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('chromaticitiesNeutral', [0.3127, 0.329]);
    });

    it('parses RVDisplayStereo properties', () => {
      const mockNode = {
        type: 'RVDisplayStereo',
        name: 'displayStereoNode',
        properties: {
          has: vi.fn((key: string) =>
            ['stereoType', 'stereoSwap', 'stereoRelativeOffset', 'stereoRightOffset'].includes(key)
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
            name: 'displayStereoNode',
            protocol: 'RVDisplayStereo',
            components: {
              stereo: {
                type: 'pair',
                swap: 1,
                relativeOffset: 0.05,
                rightOffset: [10, 0],
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('stereoType', 'pair');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('stereoSwap', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('stereoRelativeOffset', 0.05);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('stereoRightOffset', [10, 0]);
    });

    it('parses RVSourceStereo stereo component', () => {
      const mockNode = {
        type: 'RVSourceStereo',
        name: 'sourceStereoNode',
        properties: {
          has: vi.fn((key: string) =>
            ['sourceStereoSwap', 'sourceStereoRelativeOffset', 'sourceStereoRightOffset'].includes(key)
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
            name: 'sourceStereoNode',
            protocol: 'RVSourceStereo',
            components: {
              stereo: {
                swap: 1,
                relativeOffset: 0.1,
                rightOffset: 5.0,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceStereoSwap', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceStereoRelativeOffset', 0.1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('sourceStereoRightOffset', 5.0);
    });

    it('parses RVSourceStereo rightTransform component', () => {
      const mockNode = {
        type: 'RVSourceStereo',
        name: 'sourceStereoNode',
        properties: {
          has: vi.fn((key: string) =>
            ['rightEyeFlip', 'rightEyeFlop', 'rightEyeRotate', 'rightEyeTranslate'].includes(key)
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
            name: 'sourceStereoNode',
            protocol: 'RVSourceStereo',
            components: {
              rightTransform: {
                flip: 1,
                flop: 0,
                rotate: 90.0,
                translate: [10, 20],
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('rightEyeFlip', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('rightEyeFlop', false);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('rightEyeRotate', 90.0);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('rightEyeTranslate', [10, 20]);
    });

    it('parses RVOverlay overlay and matte components', () => {
      const mockNode = {
        type: 'RVOverlay',
        name: 'overlayNode',
        properties: {
          has: vi.fn((key: string) =>
            ['overlayShow', 'overlayNextRectId', 'overlayNextTextId', 'matteShow', 'matteOpacity', 'matteAspect'].includes(key)
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
            name: 'overlayNode',
            protocol: 'RVOverlay',
            components: {
              overlay: {
                show: 1,
                nextRectId: 3,
                nextTextId: 2,
              },
              matte: {
                show: 1,
                opacity: 0.8,
                aspect: 2.35,
                heightVisible: 0.9,
                centerPoint: [0.5, 0.6],
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('overlayShow', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('overlayNextRectId', 3);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('overlayNextTextId', 2);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('matteShow', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('matteOpacity', 0.8);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('matteAspect', 2.35);
    });

    it('parses RVOverlay rectangle overlays', () => {
      const mockNode = {
        type: 'RVOverlay',
        name: 'overlayNode',
        properties: {
          has: vi.fn((key: string) => key === 'overlayRectangles'),
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
            name: 'overlayNode',
            protocol: 'RVOverlay',
            components: {
              overlay: { show: 1 },
              'rect:0': {
                width: 0.2,
                height: 0.1,
                color: [1, 0, 0, 1],
                position: [0.1, 0.2],
                eye: 0,
                active: 1,
              },
              'rect:1': {
                width: 0.3,
                height: 0.15,
                color: [0, 1, 0, 0.5],
                position: [0.5, 0.5],
                active: 0,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('overlayRectangles', [
        { id: 0, width: 0.2, height: 0.1, color: [1, 0, 0, 1], position: [0.1, 0.2], eye: 0, active: true },
        { id: 1, width: 0.3, height: 0.15, color: [0, 1, 0, 0.5], position: [0.5, 0.5], active: false },
      ]);
    });

    it('parses RVOverlay text overlays', () => {
      const mockNode = {
        type: 'RVOverlay',
        name: 'overlayNode',
        properties: {
          has: vi.fn((key: string) => key === 'overlayTexts'),
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
            name: 'overlayNode',
            protocol: 'RVOverlay',
            components: {
              overlay: { show: 1 },
              'text:0': {
                position: [0.1, 0.9],
                color: [1, 1, 1, 1],
                size: 32,
                text: 'Hello World',
                font: 'Arial',
                active: 1,
                scale: 1.0,
                rotation: 0,
                spacing: 0,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('overlayTexts', [
        expect.objectContaining({
          id: 0,
          size: 32,
          text: 'Hello World',
          font: 'Arial',
          active: true,
        }),
      ]);
    });

    it('parses RVOverlay window overlays', () => {
      const mockNode = {
        type: 'RVOverlay',
        name: 'overlayNode',
        properties: {
          has: vi.fn((key: string) => key === 'overlayWindows'),
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
            name: 'overlayNode',
            protocol: 'RVOverlay',
            components: {
              overlay: { show: 1 },
              'window:0': {
                eye: 0,
                windowActive: 1,
                outlineActive: 1,
                outlineWidth: 2.0,
                outlineColor: [1, 1, 0, 1],
                windowColor: [0, 0, 0, 0.3],
                windowULx: 0.1,
                windowULy: 0.1,
                windowURx: 0.9,
                windowURy: 0.1,
                windowLLx: 0.1,
                windowLLy: 0.9,
                windowLRx: 0.9,
                windowLRy: 0.9,
                antialias: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('overlayWindows', [
        expect.objectContaining({
          id: 0,
          windowActive: true,
          outlineActive: true,
          outlineWidth: 2.0,
          upperLeft: [0.1, 0.1],
          lowerRight: [0.9, 0.9],
          antialias: true,
        }),
      ]);
    });

    it('parses RVChannelMap format component', () => {
      const mockNode = {
        type: 'RVChannelMap',
        name: 'channelMapNode',
        properties: {
          has: vi.fn((key: string) => key === 'channelMapChannels'),
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
            name: 'channelMapNode',
            protocol: 'RVChannelMap',
            components: {
              format: {
                channels: ['R', 'G', 'B', 'A'],
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('channelMapChannels', ['R', 'G', 'B', 'A']);
    });

    it('parses RVFormat format component', () => {
      const mockNode = {
        type: 'RVFormat',
        name: 'formatNode',
        properties: {
          has: vi.fn((key: string) => key === 'formatChannels'),
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
            name: 'formatNode',
            protocol: 'RVFormat',
            components: {
              format: {
                channels: ['luminance', 'alpha'],
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('formatChannels', ['luminance', 'alpha']);
    });

    it('parses RVLayout layout and timing components', () => {
      const mockNode = {
        type: 'RVLayout',
        name: 'layoutNode',
        properties: {
          has: vi.fn((key: string) =>
            ['layoutMode', 'layoutSpacing', 'layoutGridRows', 'layoutGridColumns', 'layoutRetimeInputs'].includes(key)
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
            name: 'layoutNode',
            protocol: 'RVLayout',
            components: {
              layout: {
                mode: 'grid',
                spacing: 2.0,
                gridRows: 3,
                gridColumns: 4,
              },
              timing: {
                retimeInputs: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('layoutMode', 'grid');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('layoutSpacing', 2.0);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('layoutGridRows', 3);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('layoutGridColumns', 4);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('layoutRetimeInputs', true);
    });

    it('parses RVSwitch output and mode components', () => {
      const mockNode = {
        type: 'RVSwitch',
        name: 'switchNode',
        properties: {
          has: vi.fn((key: string) =>
            ['switchFps', 'switchSize', 'switchInput', 'switchAutoSize', 'switchUseCutInfo', 'switchAutoEDL', 'switchAlignStartFrames'].includes(key)
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
            name: 'switchNode',
            protocol: 'RVSwitch',
            components: {
              output: {
                fps: 30.0,
                size: [1920, 1080],
                input: 'sourceGroup000000',
                autoSize: 0,
              },
              mode: {
                useCutInfo: 0,
                autoEDL: 1,
                alignStartFrames: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('switchFps', 30.0);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('switchSize', [1920, 1080]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('switchInput', 'sourceGroup000000');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('switchAutoSize', false);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('switchUseCutInfo', false);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('switchAutoEDL', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('switchAlignStartFrames', true);
    });

    it('parses RVSoundTrack audio and visual components', () => {
      const mockNode = {
        type: 'RVSoundTrack',
        name: 'soundTrackNode',
        properties: {
          has: vi.fn((key: string) =>
            ['audioVolume', 'audioBalance', 'audioOffset', 'audioInternalOffset', 'audioMute', 'audioSoftClamp', 'waveformWidth', 'waveformHeight'].includes(key)
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
            name: 'soundTrackNode',
            protocol: 'RVSoundTrack',
            components: {
              audio: {
                volume: 0.8,
                balance: -0.5,
                offset: 1.5,
                internalOffset: 0.1,
                mute: 1,
                softClamp: 0,
              },
              visual: {
                width: 800,
                height: 200,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('audioVolume', 0.8);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('audioBalance', -0.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('audioOffset', 1.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('audioInternalOffset', 0.1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('audioMute', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('audioSoftClamp', false);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('waveformWidth', 800);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('waveformHeight', 200);
    });

    it('parses RVOCIO components', () => {
      const mockNode = {
        type: 'RVOCIO',
        name: 'ocioNode',
        properties: {
          has: vi.fn((key: string) =>
            ['ocioActive', 'ocioFunction', 'ocioInColorSpace', 'ocioLut3DSize', 'ocioOutColorSpace',
             'ocioLook', 'ocioLookDirection', 'ocioDisplay', 'ocioView', 'ocioDither', 'ocioChannelOrder',
             'ocioInTransformUrl', 'ocioOutTransformUrl', 'ocioConfigDescription', 'ocioWorkingDir'].includes(key)
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
            name: 'ocioNode',
            protocol: 'RVOCIO',
            components: {
              ocio: {
                active: 1,
                function: 'color',
                inColorSpace: 'ACES - ACEScg',
                lut3DSize: 64,
              },
              ocio_color: {
                outColorSpace: 'sRGB',
              },
              ocio_look: {
                look: 'FilmLook',
                direction: 1,
              },
              ocio_display: {
                display: 'sRGB',
                view: 'Standard',
              },
              color: {
                dither: 1,
                channelOrder: 'BGRA',
              },
              inTransform: {
                url: '/path/to/input.csp',
              },
              outTransform: {
                url: '/path/to/output.csp',
              },
              config: {
                description: 'ACES 1.2',
                workingDir: '/studio/ocio',
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioFunction', 'color');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioInColorSpace', 'ACES - ACEScg');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioLut3DSize', 64);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioOutColorSpace', 'sRGB');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioLook', 'FilmLook');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioLookDirection', 1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioDisplay', 'sRGB');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioView', 'Standard');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioDither', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioChannelOrder', 'BGRA');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioInTransformUrl', '/path/to/input.csp');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioOutTransformUrl', '/path/to/output.csp');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioConfigDescription', 'ACES 1.2');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('ocioWorkingDir', '/studio/ocio');
    });

    it('parses RVICCTransform components', () => {
      const mockNode = {
        type: 'RVICCTransform',
        name: 'iccNode',
        properties: {
          has: vi.fn((key: string) =>
            ['iccActive', 'iccSamples2D', 'iccSamples3D', 'iccInProfileUrl', 'iccInProfileDescription',
             'iccOutProfileUrl', 'iccOutProfileDescription'].includes(key)
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
            name: 'iccNode',
            protocol: 'RVICCTransform',
            components: {
              node: {
                active: 1,
                samples2D: 512,
                samples3D: 64,
              },
              inProfile: {
                url: '/profiles/sRGB.icc',
                description: 'sRGB IEC61966-2.1',
              },
              outProfile: {
                url: '/profiles/P3.icc',
                description: 'Display P3',
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('iccActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('iccSamples2D', 512);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('iccSamples3D', 64);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('iccInProfileUrl', '/profiles/sRGB.icc');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('iccInProfileDescription', 'sRGB IEC61966-2.1');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('iccOutProfileUrl', '/profiles/P3.icc');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('iccOutProfileDescription', 'Display P3');
    });

    it('parses RVColorExposure components', () => {
      const mockNode = {
        type: 'RVColorExposure',
        name: 'exposureNode',
        properties: {
          has: vi.fn((key: string) => ['colorExposureActive', 'colorExposure'].includes(key)),
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
            name: 'exposureNode',
            protocol: 'RVColorExposure',
            components: {
              color: {
                active: 1,
                exposure: 1.5,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorExposureActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorExposure', 1.5);
    });

    it('parses RVColorCurve components', () => {
      const mockNode = {
        type: 'RVColorCurve',
        name: 'curveNode',
        properties: {
          has: vi.fn((key: string) => ['colorCurveActive', 'colorContrast'].includes(key)),
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
            name: 'curveNode',
            protocol: 'RVColorCurve',
            components: {
              color: {
                active: 1,
                contrast: 0.5,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorCurveActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorContrast', 0.5);
    });

    it('parses RVColorTemperature components', () => {
      const mockNode = {
        type: 'RVColorTemperature',
        name: 'tempNode',
        properties: {
          has: vi.fn((key: string) =>
            ['colorTemperatureActive', 'colorInWhitePrimary', 'colorInTemperature', 'colorOutTemperature', 'colorTemperatureMethod'].includes(key)),
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
            name: 'tempNode',
            protocol: 'RVColorTemperature',
            components: {
              color: {
                active: 1,
                inWhitePrimary: [0.31, 0.33],
                inTemperature: 5500,
                outTemperature: 7000,
                method: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorTemperatureActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorInWhitePrimary', [0.31, 0.33]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorInTemperature', 5500);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorOutTemperature', 7000);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorTemperatureMethod', 1);
    });

    it('parses RVColorSaturation components', () => {
      const mockNode = {
        type: 'RVColorSaturation',
        name: 'satNode',
        properties: {
          has: vi.fn((key: string) => ['colorSaturationActive', 'colorSaturation'].includes(key)),
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
            name: 'satNode',
            protocol: 'RVColorSaturation',
            components: {
              color: {
                active: 1,
                saturation: 1.5,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorSaturationActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('colorSaturation', 1.5);
    });

    it('parses RVColorCDL components', () => {
      const mockNode = {
        type: 'RVColorCDL',
        name: 'cdlNode',
        properties: {
          has: vi.fn((key: string) =>
            ['cdlActive', 'cdlFile', 'cdlColorspace', 'cdlSlope', 'cdlOffset', 'cdlPower', 'cdlSaturation', 'cdlNoClamp'].includes(key)),
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
            protocol: 'RVColorCDL',
            components: {
              node: {
                active: 1,
                file: '/path/to/grade.cdl',
                colorspace: 'aceslog',
                slope: [1.1, 1.0, 0.9],
                offset: [0.01, 0, -0.01],
                power: [1.0, 1.1, 1.0],
                saturation: 0.95,
                noClamp: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlFile', '/path/to/grade.cdl');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlColorspace', 'aceslog');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlSlope', [1.1, 1.0, 0.9]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlOffset', [0.01, 0, -0.01]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlPower', [1.0, 1.1, 1.0]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlSaturation', 0.95);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('cdlNoClamp', true);
    });

    it('parses RVColorLinearToSRGB components', () => {
      const mockNode = {
        type: 'RVColorLinearToSRGB',
        name: 'linearToSRGBNode',
        properties: {
          has: vi.fn((key: string) => ['linearToSRGBActive'].includes(key)),
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
            name: 'linearToSRGBNode',
            protocol: 'RVColorLinearToSRGB',
            components: {
              node: {
                active: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('linearToSRGBActive', true);
    });

    it('parses RVFilterGaussian components', () => {
      const mockNode = {
        type: 'RVFilterGaussian',
        name: 'gaussianNode',
        properties: {
          has: vi.fn((key: string) => ['gaussianSigma', 'gaussianRadius'].includes(key)),
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
            name: 'gaussianNode',
            protocol: 'RVFilterGaussian',
            components: {
              node: {
                sigma: 0.1,
                radius: 15.0,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('gaussianSigma', 0.1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('gaussianRadius', 15.0);
    });

    it('parses RVUnsharpMask components', () => {
      const mockNode = {
        type: 'RVUnsharpMask',
        name: 'unsharpNode',
        properties: {
          has: vi.fn((key: string) =>
            ['unsharpActive', 'unsharpAmount', 'unsharpThreshold', 'unsharpRadius'].includes(key)),
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
            name: 'unsharpNode',
            protocol: 'RVUnsharpMask',
            components: {
              node: {
                active: 1,
                amount: 2.0,
                threshold: 10.0,
                unsharpRadius: 8.0,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('unsharpActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('unsharpAmount', 2.0);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('unsharpThreshold', 10.0);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('unsharpRadius', 8.0);
    });

    it('parses RVClarity components', () => {
      const mockNode = {
        type: 'RVClarity',
        name: 'clarityNode',
        properties: {
          has: vi.fn((key: string) => ['clarityActive', 'clarityAmount', 'clarityRadius'].includes(key)),
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
            name: 'clarityNode',
            protocol: 'RVClarity',
            components: {
              node: {
                active: 1,
                amount: 0.5,
                radius: 25.0,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('clarityActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('clarityAmount', 0.5);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('clarityRadius', 25.0);
    });

    it('parses RVRotateCanvas components', () => {
      const mockNode = {
        type: 'RVRotateCanvas',
        name: 'rotateNode',
        properties: {
          has: vi.fn((key: string) =>
            ['rotateActive', 'rotateDegrees', 'rotateFlipH', 'rotateFlipV'].includes(key)),
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
            name: 'rotateNode',
            protocol: 'RVRotateCanvas',
            components: {
              node: {
                active: 1,
                degrees: 90,
                flipH: 1,
                flipV: 0,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('rotateActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('rotateDegrees', 90);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('rotateFlipH', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('rotateFlipV', false);
    });

    it('parses RVPrimaryConvert components', () => {
      const mockNode = {
        type: 'RVPrimaryConvert',
        name: 'primaryNode',
        properties: {
          has: vi.fn((key: string) =>
            ['primaryConvertActive', 'primaryConvertInPrimaries', 'primaryConvertOutPrimaries', 'primaryConvertAdaptationMethod'].includes(key)),
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
            name: 'primaryNode',
            protocol: 'RVPrimaryConvert',
            components: {
              node: {
                active: 1,
                inPrimaries: 'Rec709',
                outPrimaries: 'P3',
                adaptationMethod: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('primaryConvertActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('primaryConvertInPrimaries', 'Rec709');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('primaryConvertOutPrimaries', 'P3');
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('primaryConvertAdaptationMethod', 1);
    });

    it('parses RVDispTransform2D components', () => {
      const mockNode = {
        type: 'RVDispTransform2D',
        name: 'transformNode',
        properties: {
          has: vi.fn((key: string) =>
            ['dispTransformActive', 'dispTransformTranslate', 'dispTransformScale', 'dispTransformRotate'].includes(key)),
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
            protocol: 'RVDispTransform2D',
            components: {
              transform: {
                active: 1,
                translate: [100, 50],
                scale: [2.0, 1.5],
                rotate: 45,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto as never);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('dispTransformActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('dispTransformTranslate', [100, 50]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('dispTransformScale', [2.0, 1.5]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('dispTransformRotate', 45);
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
