/**
 * Factory for the AnnotateControlGroup.
 */
import { PaintToolbar } from '../../ui/components/PaintToolbar';
import { TextFormattingToolbar } from '../../ui/components/TextFormattingToolbar';
import type { AnnotateControlGroup } from './ControlGroups';
import type { PaintEngine } from '../../paint/PaintEngine';
import type { Session } from '../../core/session/Session';

export interface AnnotateControlDeps {
  paintEngine: PaintEngine;
  session: Session;
}

export function createAnnotateControls(deps: AnnotateControlDeps): AnnotateControlGroup {
  const { paintEngine, session } = deps;

  return {
    paintToolbar: new PaintToolbar(paintEngine),
    textFormattingToolbar: new TextFormattingToolbar(
      paintEngine,
      () => session.currentFrame,
    ),
  };
}
