import { describe, expect, it } from 'vitest';
import { GTODTO, type GTOData } from 'gto-js';
import { Session } from './Session';
import { SessionGTOStore } from './SessionGTOStore';
import { PaintEngine } from '../../paint/PaintEngine';
import { Viewer } from '../../ui/components/Viewer';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../../core/types/color';
import { BrushType, LineCap, LineJoin, StrokeMode, type PenStroke } from '../../paint/types';

const BASE_GTO: GTOData = {
  version: 4,
  objects: [
    {
      name: 'rv',
      protocol: 'RVSession',
      protocolVersion: 4,
      components: {
        session: {
          interpretation: '',
          properties: {
            viewNode: { type: 'string', size: 1, width: 1, interpretation: '', data: ['defaultSequence'] },
          },
        },
      },
    },
    {
      name: 'annotations',
      protocol: 'RVPaint',
      protocolVersion: 3,
      components: {},
    },
    {
      name: 'customNode',
      protocol: 'CustomProtocol',
      protocolVersion: 1,
      components: {
        custom: {
          interpretation: '',
          properties: {
            value: { type: 'int', size: 1, width: 1, interpretation: '', data: [42] },
          },
        },
      },
    },
  ],
};

/** Helper: build a GTO with pre-existing RVColor data (simulating a loaded .rv file) */
function gtoWithColor(overrides: Record<string, { type: string; size: number; width: number; data: unknown[] }>): GTOData {
  return {
    version: 4,
    objects: [
      ...BASE_GTO.objects,
      {
        name: 'rvColor',
        protocol: 'RVColor',
        protocolVersion: 1,
        components: {
          color: {
            interpretation: '',
            properties: {
              active: { type: 'int', size: 1, width: 1, interpretation: '', data: [1] },
              exposure: { type: 'float', size: 1, width: 1, interpretation: '', data: [0] },
              gamma: { type: 'float', size: 1, width: 1, interpretation: '', data: [1] },
              contrast: { type: 'float', size: 1, width: 1, interpretation: '', data: [1] },
              saturation: { type: 'float', size: 1, width: 1, interpretation: '', data: [1] },
              offset: { type: 'float', size: 1, width: 1, interpretation: '', data: [0] },
              hue: { type: 'float', size: 1, width: 1, interpretation: '', data: [0] },
              invert: { type: 'int', size: 1, width: 1, interpretation: '', data: [0] },
              unpremult: { type: 'int', size: 1, width: 1, interpretation: '', data: [0] },
              ...overrides,
            },
          },
        },
      },
    ],
  };
}

/** Helper: build a GTO with pre-existing RVLinearize data */
function gtoWithLinearize(colorProps: Record<string, { type: string; size: number; width: number; data: unknown[] }> = {}): GTOData {
  return {
    version: 4,
    objects: [
      ...BASE_GTO.objects,
      {
        name: 'rvLinearize',
        protocol: 'RVLinearize',
        protocolVersion: 1,
        components: {
          node: {
            interpretation: '',
            properties: {
              active: { type: 'int', size: 1, width: 1, interpretation: '', data: [1] },
            },
          },
          color: {
            interpretation: '',
            properties: {
              active: { type: 'int', size: 1, width: 1, interpretation: '', data: [1] },
              logtype: { type: 'int', size: 1, width: 1, interpretation: '', data: [0] },
              sRGB2linear: { type: 'int', size: 1, width: 1, interpretation: '', data: [0] },
              Rec709ToLinear: { type: 'int', size: 1, width: 1, interpretation: '', data: [0] },
              fileGamma: { type: 'float', size: 1, width: 1, interpretation: '', data: [1.0] },
              alphaType: { type: 'int', size: 1, width: 1, interpretation: '', data: [0] },
              ...colorProps,
            },
          },
        },
      },
    ],
  };
}

/** Helper: build a GTO with pre-existing RVColor + CDL data (simulating a loaded .rv file with CDL noClamp) */
function gtoWithCDL(cdlOverrides: Record<string, { type: string; size: number; width: number; interpretation: string; data: unknown[] }> = {}): GTOData {
  return {
    version: 4,
    objects: [
      ...BASE_GTO.objects,
      {
        name: 'rvColor',
        protocol: 'RVColor',
        protocolVersion: 1,
        components: {
          color: {
            interpretation: '',
            properties: {
              exposure: { type: 'float', size: 1, width: 1, interpretation: '', data: [0] },
              gamma: { type: 'float', size: 1, width: 1, interpretation: '', data: [1] },
              contrast: { type: 'float', size: 1, width: 1, interpretation: '', data: [1] },
              saturation: { type: 'float', size: 1, width: 1, interpretation: '', data: [1] },
              offset: { type: 'float', size: 1, width: 1, interpretation: '', data: [0] },
              hue: { type: 'float', size: 1, width: 1, interpretation: '', data: [0] },
              invert: { type: 'int', size: 1, width: 1, interpretation: '', data: [0] },
            },
          },
          CDL: {
            interpretation: '',
            properties: {
              active: { type: 'int', size: 1, width: 1, interpretation: '', data: [1] },
              slope: { type: 'float', size: 1, width: 3, interpretation: '', data: [[1, 1, 1]] },
              offset: { type: 'float', size: 1, width: 3, interpretation: '', data: [[0, 0, 0]] },
              power: { type: 'float', size: 1, width: 3, interpretation: '', data: [[1, 1, 1]] },
              saturation: { type: 'float', size: 1, width: 1, interpretation: '', data: [1] },
              ...cdlOverrides,
            },
          },
        },
      },
    ],
  };
}

function createViewer() {
  const session = new Session();
  const paintEngine = new PaintEngine();
  const viewer = new Viewer({ session, paintEngine });
  return { session, paintEngine, viewer };
}

describe('SessionGTOStore', () => {
  it('preserves base objects while updating session state', () => {
    const session = new Session();
    const paintEngine = new PaintEngine();
    const viewer = new Viewer({ session, paintEngine });

    session.setInPoint(1);
    session.setOutPoint(8);
    session.currentFrame = 3;

    const stroke: PenStroke = {
      type: 'pen',
      id: '1',
      frame: 3,
      user: 'tester',
      color: [1, 0, 0, 1],
      width: 8,
      brush: BrushType.Circle,
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ],
      join: LineJoin.Round,
      cap: LineCap.Round,
      splat: false,
      mode: StrokeMode.Draw,
      startFrame: 3,
      duration: 0,
    };

    paintEngine.addAnnotation(stroke);
    paintEngine.setGhostMode(true, 1, 2);

    const store = new SessionGTOStore(BASE_GTO);
    store.updateFromState({ session, viewer, paintEngine });

    const dto = new GTODTO(store.toGTOData());
    const custom = dto.byProtocol('CustomProtocol').first();
    expect(custom.prop('custom', 'value')).toBe(42);

    const paint = dto.byProtocol('RVPaint').first();
    expect(paint.prop('paint', 'ghost')).toBe(1);
    expect(paint.prop('paint', 'ghostBefore')).toBe(1);
    expect(paint.prop('paint', 'ghostAfter')).toBe(2);

    viewer.dispose();
  });

  it('writes RVNoiseReduction settings from viewer state', () => {
    const { session, paintEngine, viewer } = createViewer();
    viewer.setNoiseReductionParams({
      strength: 70,
      luminanceStrength: 40,
      chromaStrength: 60,
      radius: 4,
    });

    const store = new SessionGTOStore(BASE_GTO);
    store.updateFromState({ session, viewer, paintEngine });

    const dto = new GTODTO(store.toGTOData());
    const noise = dto.byProtocol('RVNoiseReduction').first();
    expect(noise.exists()).toBe(true);
    expect(noise.prop('node', 'active')).toBe(1);
    expect(noise.prop('node', 'amount')).toBeCloseTo(0.7, 6);
    expect(noise.prop('node', 'radius')).toBe(4);
    expect(noise.prop('node', 'threshold')).toBeCloseTo(6, 6);

    viewer.dispose();
  });

  describe('GTO Round-Trip — Color Properties', () => {
    it('GTO-RT-001: hue value survives round-trip', () => {
      const { session, paintEngine, viewer } = createViewer();

      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, hueRotation: 0.75 });

      const store = new SessionGTOStore(BASE_GTO);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvColor = dto.byProtocol('RVColor').first();
      expect(rvColor.exists()).toBe(true);
      expect(rvColor.prop('color', 'hue')).toBe(0.75);

      viewer.dispose();
    });

    it('GTO-RT-001b: hue=0 (default) is written explicitly', () => {
      const { session, paintEngine, viewer } = createViewer();

      const store = new SessionGTOStore(BASE_GTO);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvColor = dto.byProtocol('RVColor').first();
      expect(rvColor.prop('color', 'hue')).toBe(0);

      viewer.dispose();
    });

    it('GTO-RT-002: invert flag survives round-trip', () => {
      const { session, paintEngine, viewer } = createViewer();

      viewer.setColorInversion(true);

      const store = new SessionGTOStore(BASE_GTO);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvColor = dto.byProtocol('RVColor').first();
      expect(rvColor.exists()).toBe(true);
      expect(rvColor.prop('color', 'invert')).toBe(1);

      viewer.dispose();
    });

    it('GTO-RT-002b: invert=false written as 0', () => {
      const { session, paintEngine, viewer } = createViewer();

      const store = new SessionGTOStore(BASE_GTO);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvColor = dto.byProtocol('RVColor').first();
      expect(rvColor.prop('color', 'invert')).toBe(0);

      viewer.dispose();
    });

    it('GTO-RT-002c: pre-existing invert=1 is overwritten when runtime is false', () => {
      const { session, paintEngine, viewer } = createViewer();

      const gto = gtoWithColor({
        invert: { type: 'int', size: 1, width: 1, data: [1] },
      });

      const store = new SessionGTOStore(gto);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvColor = dto.byProtocol('RVColor').first();
      expect(rvColor.prop('color', 'invert')).toBe(0);

      viewer.dispose();
    });

    it('pre-existing hue from .rv is updated with runtime value', () => {
      const { session, paintEngine, viewer } = createViewer();

      const gto = gtoWithColor({
        hue: { type: 'float', size: 1, width: 1, data: [0.3] },
      });

      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, hueRotation: 0.6 });

      const store = new SessionGTOStore(gto);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvColor = dto.byProtocol('RVColor').first();
      expect(rvColor.prop('color', 'hue')).toBe(0.6);

      viewer.dispose();
    });
  });

  describe('GTO Round-Trip — Linearize Properties', () => {
    it('GTO-RT-003: linearize.logtype survives round-trip via updateLinearize', () => {
      const gto = gtoWithLinearize({
        logtype: { type: 'int', size: 1, width: 1, data: [2] },
      });

      const store = new SessionGTOStore(gto);
      store.updateLinearize({ logtype: 2 });

      const dto = new GTODTO(store.toGTOData());
      const rvLin = dto.byProtocol('RVLinearize').first();
      expect(rvLin.exists()).toBe(true);
      expect(rvLin.prop('color', 'logtype')).toBe(2);
    });

    it('GTO-RT-004: linearize.sRGB2linear survives round-trip', () => {
      const store = new SessionGTOStore(gtoWithLinearize());
      store.updateLinearize({ sRGB2linear: true });

      const dto = new GTODTO(store.toGTOData());
      const rvLin = dto.byProtocol('RVLinearize').first();
      expect(rvLin.prop('color', 'sRGB2linear')).toBe(1);
    });

    it('GTO-RT-005: linearize.fileGamma survives round-trip', () => {
      const store = new SessionGTOStore(gtoWithLinearize());
      store.updateLinearize({ fileGamma: 2.2 });

      const dto = new GTODTO(store.toGTOData());
      const rvLin = dto.byProtocol('RVLinearize').first();
      expect(rvLin.prop('color', 'fileGamma')).toBe(2.2);
    });

    it('GTO-RT-005b: linearize.rec709ToLinear survives round-trip', () => {
      const store = new SessionGTOStore(gtoWithLinearize());
      store.updateLinearize({ rec709ToLinear: true });

      const dto = new GTODTO(store.toGTOData());
      const rvLin = dto.byProtocol('RVLinearize').first();
      expect(rvLin.prop('color', 'Rec709ToLinear')).toBe(1);
    });

    it('GTO-RT-005c: linearize.alphaType survives round-trip', () => {
      const store = new SessionGTOStore(gtoWithLinearize());
      store.updateLinearize({ alphaType: 2 });

      const dto = new GTODTO(store.toGTOData());
      const rvLin = dto.byProtocol('RVLinearize').first();
      expect(rvLin.prop('color', 'alphaType')).toBe(2);
    });

    it('linearize properties from loaded .rv are preserved when not explicitly updated', () => {
      const gto = gtoWithLinearize({
        logtype: { type: 'int', size: 1, width: 1, data: [3] },
        sRGB2linear: { type: 'int', size: 1, width: 1, data: [1] },
        fileGamma: { type: 'float', size: 1, width: 1, data: [2.6] },
      });

      const { session, paintEngine, viewer } = createViewer();
      const store = new SessionGTOStore(gto);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvLin = dto.byProtocol('RVLinearize').first();
      expect(rvLin.exists()).toBe(true);
      expect(rvLin.prop('color', 'logtype')).toBe(3);
      expect(rvLin.prop('color', 'sRGB2linear')).toBe(1);
      expect(rvLin.prop('color', 'fileGamma')).toBe(2.6);

      viewer.dispose();
    });

    it('updateLinearize with cineon settings writes cineon component', () => {
      const store = new SessionGTOStore(gtoWithLinearize());
      store.updateLinearize({
        logtype: 1,
        cineon: {
          whiteCodeValue: 700,
          blackCodeValue: 100,
          breakPointValue: 690,
        },
      });

      const dto = new GTODTO(store.toGTOData());
      const rvLin = dto.byProtocol('RVLinearize').first();
      expect(rvLin.prop('cineon', 'whiteCodeValue')).toBe(700);
      expect(rvLin.prop('cineon', 'blackCodeValue')).toBe(100);
      expect(rvLin.prop('cineon', 'breakPointValue')).toBe(690);
    });
  });

  describe('GTO Round-Trip — CDL Properties', () => {
    it('GTO-RT-009: CDL noClamp=1 from loaded .rv is preserved after updateFromState', () => {
      const gto = gtoWithCDL({
        noClamp: { type: 'int', size: 1, width: 1, interpretation: '', data: [1] },
      });

      const { session, paintEngine, viewer } = createViewer();
      const store = new SessionGTOStore(gto);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvColor = dto.byProtocol('RVColor').first();
      expect(rvColor.prop('CDL', 'noClamp')).toBe(1);

      viewer.dispose();
    });

    it('GTO-RT-009b: CDL noClamp=0 from loaded .rv is preserved after updateFromState', () => {
      const gto = gtoWithCDL({
        noClamp: { type: 'int', size: 1, width: 1, interpretation: '', data: [0] },
      });

      const { session, paintEngine, viewer } = createViewer();
      const store = new SessionGTOStore(gto);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvColor = dto.byProtocol('RVColor').first();
      expect(rvColor.prop('CDL', 'noClamp')).toBe(0);

      viewer.dispose();
    });

    it('GTO-RT-006: CDL values survive round-trip', () => {
      const { session, paintEngine, viewer } = createViewer();

      viewer.setCDL({
        slope: { r: 1.2, g: 1.0, b: 0.8 },
        offset: { r: 0.01, g: 0.0, b: -0.01 },
        power: { r: 1.0, g: 1.1, b: 1.0 },
        saturation: 0.9,
      });

      const store = new SessionGTOStore(BASE_GTO);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvColor = dto.byProtocol('RVColor').first();
      expect(rvColor.prop('CDL', 'slope')).toEqual([1.2, 1.0, 0.8]);
      expect(rvColor.prop('CDL', 'offset')).toEqual([0.01, 0.0, -0.01]);
      expect(rvColor.prop('CDL', 'power')).toEqual([1.0, 1.1, 1.0]);
      expect(rvColor.prop('CDL', 'saturation')).toBe(0.9);

      viewer.dispose();
    });
  });

  describe('GTO Round-Trip — Preservation', () => {
    it('GTO-RT-007: unknown/custom nodes survive round-trip', () => {
      const { session, paintEngine, viewer } = createViewer();

      const store = new SessionGTOStore(BASE_GTO);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const custom = dto.byProtocol('CustomProtocol').first();
      expect(custom.exists()).toBe(true);
      expect(custom.name).toBe('customNode');
      expect(custom.prop('custom', 'value')).toBe(42);

      viewer.dispose();
    });

    it('unpremult=1 from loaded .rv is preserved after updateFromState', () => {
      const gto = gtoWithColor({
        unpremult: { type: 'int', size: 1, width: 1, data: [1] },
      });

      const { session, paintEngine, viewer } = createViewer();
      const store = new SessionGTOStore(gto);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvColor = dto.byProtocol('RVColor').first();
      expect(rvColor.prop('color', 'unpremult')).toBe(1);

      viewer.dispose();
    });

    it('unpremult=0 from loaded .rv is preserved after updateFromState', () => {
      const gto = gtoWithColor({
        unpremult: { type: 'int', size: 1, width: 1, data: [0] },
      });

      const { session, paintEngine, viewer } = createViewer();
      const store = new SessionGTOStore(gto);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvColor = dto.byProtocol('RVColor').first();
      expect(rvColor.prop('color', 'unpremult')).toBe(0);

      viewer.dispose();
    });

    it('GTO-RT-008: text serialization includes hue and invert properties', () => {
      const { session, paintEngine, viewer } = createViewer();

      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, hueRotation: 0.5 });
      viewer.setColorInversion(true);

      const store = new SessionGTOStore(BASE_GTO);
      store.updateFromState({ session, viewer, paintEngine });

      const text = store.toText();
      expect(text).toBeDefined();
      expect(typeof text).toBe('string');
      expect(text).toContain('hue');
      expect(text).toContain('invert');

      viewer.dispose();
    });

    it('combined hue + invert + CDL round-trip — no interference on RVColor', () => {
      const { session, paintEngine, viewer } = createViewer();

      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, hueRotation: 0.75 });
      viewer.setColorInversion(true);
      viewer.setCDL({
        slope: { r: 1.5, g: 1.0, b: 0.9 },
        offset: { r: 0.02, g: 0.0, b: 0.0 },
        power: { r: 1.0, g: 1.0, b: 1.2 },
        saturation: 0.85,
      });

      const store = new SessionGTOStore(BASE_GTO);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvColor = dto.byProtocol('RVColor').first();

      // Verify color properties
      expect(rvColor.prop('color', 'hue')).toBe(0.75);
      expect(rvColor.prop('color', 'invert')).toBe(1);
      expect(rvColor.prop('color', 'exposure')).toBe(0);
      expect(rvColor.prop('color', 'saturation')).toBe(1);

      // Verify CDL properties on same RVColor object
      expect(rvColor.prop('CDL', 'slope')).toEqual([1.5, 1.0, 0.9]);
      expect(rvColor.prop('CDL', 'offset')).toEqual([0.02, 0.0, 0.0]);
      expect(rvColor.prop('CDL', 'power')).toEqual([1.0, 1.0, 1.2]);
      expect(rvColor.prop('CDL', 'saturation')).toBe(0.85);

      viewer.dispose();
    });

    it('negative hue value survives round-trip', () => {
      const { session, paintEngine, viewer } = createViewer();

      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, hueRotation: -0.25 });

      const store = new SessionGTOStore(BASE_GTO);
      store.updateFromState({ session, viewer, paintEngine });

      const dto = new GTODTO(store.toGTOData());
      const rvColor = dto.byProtocol('RVColor').first();
      expect(rvColor.prop('color', 'hue')).toBe(-0.25);

      viewer.dispose();
    });
  });
});
