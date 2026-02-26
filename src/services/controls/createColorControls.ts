/**
 * Factory for the ColorControlGroup.
 */
import { ColorControls } from '../../ui/components/ColorControls';
import { ColorInversionToggle } from '../../ui/components/ColorInversionToggle';
import { PremultControl } from '../../ui/components/PremultControl';
import { CDLControl } from '../../ui/components/CDLControl';
import { CurvesControl } from '../../ui/components/CurvesControl';
import { OCIOControl } from '../../ui/components/OCIOControl';
import { LUTPipelinePanel } from '../../ui/components/LUTPipelinePanel';
import type { ColorControlGroup } from './ControlGroups';
import type { Viewer } from '../../ui/components/Viewer';

export interface ColorControlDeps {
  viewer: Viewer;
}

export function createColorControls(deps: ColorControlDeps): ColorControlGroup {
  const { viewer } = deps;

  return {
    colorControls: new ColorControls(),
    colorInversionToggle: new ColorInversionToggle(),
    premultControl: new PremultControl(),
    cdlControl: new CDLControl(),
    curvesControl: new CurvesControl(),
    ocioControl: new OCIOControl(),
    lutPipelinePanel: new LUTPipelinePanel(viewer.getLUTPipeline()),
  };
}
