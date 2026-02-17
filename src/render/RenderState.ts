/**
 * RenderState - Aggregated render state passed from Viewer to Renderer
 *
 * Replaces 15+ individual setter calls with a single applyRenderState() call,
 * making the Viewer→Renderer data contract explicit and testable.
 */

import type { ColorAdjustments, ColorWheelsState, ChannelMode, HSLQualifierState, LinearizeState } from '../core/types/color';
import type { ToneMappingState, ZebraState, HighlightsShadowsState, FalseColorState, GamutMappingState } from '../core/types/effects';
import type { BackgroundPatternState } from '../core/types/background';
import type { CDLValues } from '../color/CDL';
import type { CurveLUTs } from '../color/ColorCurves';

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
  cdlColorspace?: number;  // 0=rec709/direct (default), 1=ACEScct
  curvesLUT: CurveLUTs | null;
  colorWheels: ColorWheelsState;
  falseColor: FalseColorState;
  zebraStripes: ZebraState;
  channelMode: ChannelMode;
  lut: { data: Float32Array | null; size: number; intensity: number };
  displayColor: DisplayColorConfig;
  highlightsShadows: HighlightsShadowsState;
  vibrance: { amount: number; skinProtection: boolean };
  clarity: number;
  sharpen: number;
  hslQualifier: HSLQualifierState;
  gamutMapping?: GamutMappingState;
  deinterlace?: { enabled: boolean; method: number; fieldOrder: number };
  filmEmulation?: { enabled: boolean; intensity: number; saturation: number; grainIntensity: number; grainSeed: number; lutData: Uint8Array | null };
  perspective?: { enabled: boolean; invH: Float32Array; quality: number };
  linearize?: LinearizeState;
  outOfRange?: number;  // 0=off, 1=clamp-to-black, 2=highlight
}
