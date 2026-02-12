import { describe, expect, it } from 'vitest';
import type { GTOData } from 'gto-js';
import { Session } from './Session';
import { SessionGTOStore } from './SessionGTOStore';
import { PaintEngine } from '../../paint/PaintEngine';
import { Viewer } from '../../ui/components/Viewer';
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

    const data = store.toGTOData();
    const custom = data.objects.find((obj) => obj.protocol === 'CustomProtocol');
    expect(custom?.components.custom?.properties.value?.data[0]).toBe(42);

    const paint = data.objects.find((obj) => obj.protocol === 'RVPaint');
    expect(paint?.components.paint?.properties.ghost?.data[0]).toBe(1);
    expect(paint?.components.paint?.properties.ghostBefore?.data[0]).toBe(1);
    expect(paint?.components.paint?.properties.ghostAfter?.data[0]).toBe(2);

    viewer.dispose();
  });
});
