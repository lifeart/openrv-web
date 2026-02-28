/**
 * Factory for the TransformControlGroup.
 */
import { TransformControl } from '../../ui/components/TransformControl';
import { CropControl } from '../../ui/components/CropControl';
import type { TransformControlGroup } from './ControlGroups';

export function createTransformControls(): TransformControlGroup {
  return {
    transformControl: new TransformControl(),
    cropControl: new CropControl(),
  };
}
