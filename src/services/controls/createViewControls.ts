/**
 * Factory for the ViewControlGroup.
 */
import { ZoomControl } from '../../ui/components/ZoomControl';
import { ChannelSelect } from '../../ui/components/ChannelSelect';
import { CompareControl } from '../../ui/components/CompareControl';
import { ReferenceManager } from '../../ui/components/ReferenceManager';
import { StereoControl } from '../../ui/components/StereoControl';
import { StereoEyeTransformControl } from '../../ui/components/StereoEyeTransformControl';
import { StereoAlignControl } from '../../ui/components/StereoAlignControl';
import { GhostFrameControl } from '../../ui/components/GhostFrameControl';
import { ConvergenceMeasure } from '../../ui/components/ConvergenceMeasure';
import { FloatingWindowControl } from '../../ui/components/FloatingWindowControl';
import { SphericalProjection } from '../../render/SphericalProjection';
import { StackControl } from '../../ui/components/StackControl';
import { PARControl } from '../../ui/components/PARControl';
import { BackgroundPatternControl } from '../../ui/components/BackgroundPatternControl';
import { DisplayProfileControl } from '../../ui/components/DisplayProfileControl';
import type { ViewControlGroup } from './ControlGroups';

export function createViewControls(): ViewControlGroup {
  return {
    zoomControl: new ZoomControl(),
    channelSelect: new ChannelSelect(),
    compareControl: new CompareControl(),
    referenceManager: new ReferenceManager(),
    stereoControl: new StereoControl(),
    stereoEyeTransformControl: new StereoEyeTransformControl(),
    stereoAlignControl: new StereoAlignControl(),
    ghostFrameControl: new GhostFrameControl(),
    convergenceMeasure: new ConvergenceMeasure(),
    floatingWindowControl: new FloatingWindowControl(),
    sphericalProjection: new SphericalProjection(),
    stackControl: new StackControl(),
    parControl: new PARControl(),
    backgroundPatternControl: new BackgroundPatternControl(),
    displayProfileControl: new DisplayProfileControl(),
  };
}
