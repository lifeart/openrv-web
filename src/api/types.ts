/**
 * Abstract interfaces for the OpenRV public API layer.
 *
 * These interfaces decouple the API from concrete UI implementations.
 * Concrete classes (Viewer, ColorControls, CDLControl) satisfy these
 * interfaces through TypeScript structural typing — no explicit
 * `implements` clause is needed.
 */

import type { ColorAdjustments } from '../core/types/color';
import type { ChannelMode } from '../core/types/color';
import type { CDLValues } from '../color/CDL';
import type { ColorCurvesData } from '../color/ColorCurves';

/**
 * Minimal viewer interface required by the API layer.
 *
 * Provides zoom, pan, and channel mode control.
 */
export interface ViewerProvider {
  setZoom(level: number): void;
  getZoom(): number;
  fitToWindow(): void;
  setPan(x: number, y: number): void;
  getPan(): { x: number; y: number };
  setChannelMode(mode: ChannelMode): void;
  getChannelMode(): ChannelMode;
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
