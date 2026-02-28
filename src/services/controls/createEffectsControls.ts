/**
 * Factory for the EffectsControlGroup.
 */
import { FilterControl } from '../../ui/components/FilterControl';
import { SlateEditor } from '../../ui/components/SlateEditor';
import { LensControl } from '../../ui/components/LensControl';
import { DeinterlaceControl } from '../../ui/components/DeinterlaceControl';
import { FilmEmulationControl } from '../../ui/components/FilmEmulationControl';
import { PerspectiveCorrectionControl } from '../../ui/components/PerspectiveCorrectionControl';
import { StabilizationControl } from '../../ui/components/StabilizationControl';
import { NoiseReductionControl } from '../../ui/components/NoiseReductionControl';
import { WatermarkControl } from '../../ui/components/WatermarkControl';
import { TimelineEditor } from '../../ui/components/TimelineEditor';
import type { EffectsControlGroup } from './ControlGroups';
import type { Viewer } from '../../ui/components/Viewer';
import type { Session } from '../../core/session/Session';

export interface EffectsControlDeps {
  viewer: Viewer;
  session: Session;
  /**
   * Host element for the timeline editor. Created externally so the
   * panel wrapper can own it.
   */
  timelineEditorHost: HTMLElement;
}

export function createEffectsControls(deps: EffectsControlDeps): EffectsControlGroup {
  const { viewer, session, timelineEditorHost } = deps;

  const timelineEditor = new TimelineEditor(timelineEditorHost, session);
  timelineEditor.setTotalFrames(session.frameCount);

  return {
    filterControl: new FilterControl(),
    slateEditor: new SlateEditor(),
    lensControl: new LensControl(),
    deinterlaceControl: new DeinterlaceControl(),
    filmEmulationControl: new FilmEmulationControl(),
    perspectiveCorrectionControl: new PerspectiveCorrectionControl(),
    stabilizationControl: new StabilizationControl(),
    noiseReductionControl: new NoiseReductionControl(),
    watermarkControl: new WatermarkControl(viewer.getWatermarkOverlay()),
    timelineEditor,
  };
}
