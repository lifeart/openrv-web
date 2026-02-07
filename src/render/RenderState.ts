/**
 * RenderState - Aggregated render state passed from Viewer to Renderer
 *
 * Replaces 15+ individual setter calls with a single applyRenderState() call,
 * making the Viewer→Renderer data contract explicit and testable.
 */

import type { ColorAdjustments } from '../ui/components/ColorControls';
import type { ToneMappingState } from '../ui/components/ToneMappingControl';
import type { CDLValues } from '../color/CDL';
import type { CurveLUTs } from '../color/ColorCurves';
import type { ColorWheelsState } from '../ui/components/ColorWheels';
import type { ZebraState } from '../ui/components/ZebraStripes';
import type { BackgroundPatternState } from '../ui/components/BackgroundPatternControl';
import type { ChannelMode } from '../ui/components/ChannelSelect';
import type { HSLQualifierState } from '../ui/components/HSLQualifier';

export interface DisplayColorConfig {
  transferFunction: number;
  displayGamma: number;
  displayBrightness: number;
  customGamma: number;
}

export interface RenderState {
  colorAdjustments: ColorAdjustments;
  colorInversion: boolean;
  toneMappingState: ToneMappingState;
  backgroundPattern: BackgroundPatternState;
  cdl: CDLValues;
  curvesLUT: CurveLUTs | null;
  colorWheels: ColorWheelsState;
  falseColor: { enabled: boolean; lut: Uint8Array | null };
  zebraStripes: ZebraState;
  channelMode: ChannelMode;
  lut: { data: Float32Array | null; size: number; intensity: number };
  displayColor: DisplayColorConfig;
  highlightsShadows: { highlights: number; shadows: number; whites: number; blacks: number };
  vibrance: { amount: number; skinProtection: boolean };
  clarity: number;
  sharpen: number;
  hslQualifier: HSLQualifierState;
}
