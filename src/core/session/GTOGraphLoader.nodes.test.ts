/**
 * GTOGraphLoader Node Type Tests
 *
 * Tests for specific node type parsing: RVLinearize, RVTransform2D,
 * RVLookLUT, RVCacheLUT, and RVPaint.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadGTOGraph } from './GTOGraphLoader';
import type { GTODTO } from 'gto-js';
import { NodeFactory } from '../../nodes/base/NodeFactory';

/**
 * Creates a mock node and spies on NodeFactory to return it.
 * The mock node's `properties.has` returns true for all keys by default
 * (override via `hasFilter`), and `properties.setValue` is a vi.fn() spy.
 */
function setupMockNode(
  type: string,
  name: string,
  hasFilter?: (key: string) => boolean,
) {
  const mockNode = {
    type,
    name,
    properties: {
      has: vi.fn(hasFilter ?? (() => true)),
      setValue: vi.fn(),
    },
    inputs: [],
    outputs: [],
  };

  vi.spyOn(NodeFactory, 'isRegistered').mockReturnValue(true);
  vi.spyOn(NodeFactory, 'create').mockReturnValue(mockNode as never);

  return mockNode;
}

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

describe('GTOGraphLoader - Node Types', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('RVLinearize parsing', () => {
    it('parses RVLinearize node component active state', () => {
      const mockNode = setupMockNode('RVLinearize', 'linearize');

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
      const mockNode = setupMockNode('RVLinearize', 'linearize');

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
      const mockNode = setupMockNode('RVLinearize', 'linearize');

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
      const mockNode = setupMockNode('RVLinearize', 'linearize');

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

    it('parses RVLinearize CDL component', () => {
      const mockNode = setupMockNode('RVLinearize', 'linearize');

      const dto = createMockDTO({
        sessions: [{ name: 'rv' }],
        objects: [
          {
            name: 'linearize',
            protocol: 'RVLinearize',
            components: {
              CDL: {
                active: 1,
                slope: [1.1, 1.0, 0.9],
                offset: [0.01, 0.0, -0.01],
                power: [1.0, 1.1, 1.0],
                saturation: 0.9,
                noClamp: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('linearizeCdlActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('linearizeCdlSlope', [1.1, 1.0, 0.9]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('linearizeCdlOffset', [0.01, 0.0, -0.01]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('linearizeCdlPower', [1.0, 1.1, 1.0]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('linearizeCdlSaturation', 0.9);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('linearizeCdlNoClamp', true);
    });
  });

  describe('RVTransform2D parsing with scale and translate', () => {
    it('parses scale property', () => {
      const mockNode = setupMockNode('RVTransform2D', 'transform');

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
      const mockNode = setupMockNode('RVTransform2D', 'transform');

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

    it('parses visibleBox component', () => {
      const mockNode = setupMockNode('RVTransform2D', 'transform');

      const dto = createMockDTO({
        sessions: [{ name: 'rv' }],
        objects: [
          {
            name: 'transform',
            protocol: 'RVTransform2D',
            components: {
              transform: { rotate: 0 },
              visibleBox: {
                active: 1,
                minX: 0.1,
                minY: 0.2,
                maxX: 0.9,
                maxY: 0.8,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('visibleBoxActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('visibleBoxMinX', 0.1);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('visibleBoxMinY', 0.2);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('visibleBoxMaxX', 0.9);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('visibleBoxMaxY', 0.8);
    });

    it('parses stencil component', () => {
      const mockNode = setupMockNode('RVTransform2D', 'transform');

      const dto = createMockDTO({
        sessions: [{ name: 'rv' }],
        objects: [
          {
            name: 'transform',
            protocol: 'RVTransform2D',
            components: {
              transform: { rotate: 0 },
              stencil: {
                active: 1,
                inverted: 1,
                aspect: 1.778,
                softEdge: 0.05,
                ratio: 0.75,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('stencilActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('stencilInverted', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('stencilAspect', 1.778);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('stencilSoftEdge', 0.05);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('stencilRatio', 0.75);
    });
  });

  describe('RVLookLUT parsing', () => {
    it('parses RVLookLUT node component active state', () => {
      const mockNode = setupMockNode('RVLookLUT', 'lookLut');

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
      const mockNode = setupMockNode('RVLookLUT', 'lookLut');

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
      const mockNode = setupMockNode('RVCacheLUT', 'cacheLut');

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

  describe('RVPaint parsing', () => {
    it('parses RVPaint frame filter properties', () => {
      const mockNode = setupMockNode('RVPaint', 'paintNode', (key: string) =>
        ['paintExclude', 'paintInclude', 'paintNextId', 'paintShow', 'paintActive'].includes(key),
      );

      const dto = createMockDTO({
        sessions: [{ name: 'Test' }],
        objects: [
          {
            name: 'paintNode',
            protocol: 'RVPaint',
            components: {
              node: { active: 1 },
              paint: {
                exclude: [10, 20, 30],
                include: [1, 5, 15],
                nextId: 42,
                show: 1,
              },
            },
          },
        ],
      });

      loadGTOGraph(dto);

      expect(mockNode.properties.setValue).toHaveBeenCalledWith('paintActive', true);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('paintExclude', [10, 20, 30]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('paintInclude', [1, 5, 15]);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('paintNextId', 42);
      expect(mockNode.properties.setValue).toHaveBeenCalledWith('paintShow', true);
    });
  });
});
