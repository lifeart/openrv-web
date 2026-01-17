import { describe, expect, it } from 'vitest';
import { Session } from './Session';
import { SessionGTOExporter } from './SessionGTOExporter';
import { PaintEngine } from '../../paint/PaintEngine';
import { BrushType, LineCap, LineJoin, StrokeMode, RV_PEN_WIDTH_SCALE, RV_TEXT_SIZE_SCALE, type PenStroke } from '../../paint/types';

describe('SessionGTOExporter', () => {
  it('exports annotations and effects to RV GTO', async () => {
    const session = new Session();
    const paintEngine = new PaintEngine();

    session.fps = 24;
    session.setInPoint(1);
    session.setOutPoint(10);
    session.currentFrame = 4;
    session.toggleMark(4);

    paintEngine.setGhostMode(true, 2, 4);
    paintEngine.setHoldMode(true);

    const stroke: PenStroke = {
      type: 'pen',
      id: '1',
      frame: 4,
      user: 'tester',
      color: [1, 0.2, 0.1, 1],
      width: RV_PEN_WIDTH_SCALE * 0.04,
      brush: BrushType.Circle,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.35 },
      ],
      join: LineJoin.Round,
      cap: LineCap.Round,
      splat: false,
      mode: StrokeMode.Draw,
      startFrame: 4,
      duration: 0,
    };

    paintEngine.addAnnotation(stroke);
    paintEngine.addText(5, { x: 0.6, y: 0.7 }, 'Note', RV_TEXT_SIZE_SCALE * 0.02);

    const gtoText = SessionGTOExporter.toText(session, paintEngine);

    const loadedSession = new Session();
    let loadedAnnotations: PenStroke[] = [];
    let loadedEffects: { ghost?: boolean; hold?: boolean; ghostBefore?: number; ghostAfter?: number } | undefined;

    loadedSession.on('annotationsLoaded', ({ annotations, effects }) => {
      loadedAnnotations = annotations as PenStroke[];
      loadedEffects = effects;
    });

    await loadedSession.loadFromGTO(gtoText);

    expect(loadedEffects).toMatchObject({
      ghost: true,
      hold: true,
      ghostBefore: 2,
      ghostAfter: 4,
    });
    expect(loadedAnnotations.length).toBeGreaterThanOrEqual(2);
  });
});
