/**
 * Abstract interfaces for the OpenRV public API layer.
 *
 * These interfaces decouple the API from concrete UI implementations.
 * Concrete classes (Viewer, ColorControls, CDLControl) satisfy these
 * interfaces through TypeScript structural typing — no explicit
 * `implements` clause is needed.
 */

import type { ColorAdjustments, ChannelMode } from '../core/types/color';
import type { CDLValues } from '../color/CDL';
import type { ColorCurvesData } from '../color/ColorCurves';
import type { TextureFilterMode } from '../core/types/filter';
import type { BackgroundPatternState } from '../core/types/background';

/**
 * Minimal viewer interface required by the API layer.
 *
 * Provides zoom, pan, channel mode, texture filter, and background pattern control.
 */
export interface ViewerProvider {
  setZoom(level: number): void;
  getZoom(): number;
  fitToWindow(): void;
  fitToWidth(): void;
  fitToHeight(): void;
  getFitMode(): string | null;
  setPan(x: number, y: number): void;
  getPan(): { x: number; y: number };
  setChannelMode(mode: ChannelMode): void;
  getChannelMode(): ChannelMode;
  setFilterMode(mode: TextureFilterMode): void;
  getFilterMode(): TextureFilterMode;
  setBackgroundPatternState(state: BackgroundPatternState): void;
  getBackgroundPatternState(): BackgroundPatternState;
}

/**
 * Minimal color-adjustment interface required by the API layer.
 *
 * Provides get/set/reset for the color-adjustment pipeline.
 */
export interface ColorAdjustmentProvider {
  getAdjustments(): ColorAdjustments;
  setAdjustments(adjustments: Partial<ColorAdjustments>): void;
  reset(): void;
}

/**
 * Minimal CDL (Color Decision List) interface required by the API layer.
 *
 * Provides get/set for ASC CDL values.
 */
export interface CDLProvider {
  getCDL(): CDLValues;
  setCDL(cdl: CDLValues): void;
}

/**
 * Minimal curves interface required by the API layer.
 *
 * Provides get/set for RGB + per-channel color curves.
 */
export interface CurvesProvider {
  getCurves(): ColorCurvesData;
  setCurves(curves: ColorCurvesData): void;
}
