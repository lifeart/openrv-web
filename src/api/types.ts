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
import type { MatteSettings } from '../core/session/SessionTypes';
import type { LUT } from '../color/LUTLoader';
import type { ToneMappingState } from '../core/types/effects';
import type { DisplayColorState } from '../color/DisplayTransfer';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';
import type { OCIOState } from '../color/OCIOConfig';
import type { PixelProbeState, SampleSize, SourceMode } from '../ui/components/PixelProbe';
import type { ColorPrimaries, TransferFunction } from '../core/image/Image';

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
  getViewportSize(): { width: number; height: number };

  /** Get the current matte overlay settings. */
  getMatteSettings(): MatteSettings;
  /** Update matte overlay settings (partial merge). */
  setMatteSettings(settings: Partial<MatteSettings>): void;

  /** Subscribe to view changes (pan/zoom). Returns an unsubscribe function. */
  addViewChangeListener?(callback: (panX: number, panY: number, zoom: number) => void): () => void;
  /** Get the native source image dimensions. */
  getSourceDimensions?(): { width: number; height: number; pixelAspect?: number };
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

/**
 * Minimal LUT interface required by the API layer.
 *
 * Provides get/set/clear for the active LUT and intensity control.
 */
export interface LUTProvider {
  setLUT(lut: LUT | null): void;
  getLUT(): LUT | null;
  setLUTIntensity(intensity: number): void;
  getLUTIntensity(): number;
}

/**
 * Identifier for the four LUT pipeline stages.
 *
 * The stages run in order Pre-Cache -> File -> Look -> Display, with the
 * first three being per-source and `display` being session-wide.
 */
export type LUTPipelineStage = 'precache' | 'file' | 'look' | 'display';

/**
 * Per-stage output color-space declaration interface.
 *
 * Sibling of {@link LUTProvider}: kept as a separate interface so that
 * implementations supporting only the simple single-LUT API are not forced
 * to implement the multi-stage surface.
 *
 * `null` is the sentinel for "color-space-preserving" (the stage's input
 * primaries / transfer flow through unchanged). Concrete values declare
 * what color-space the stage's output is encoded in so downstream stages
 * (and the renderer) can interpret pixels correctly.
 */
export interface LUTPipelineProvider {
  setLUTStageOutputColorPrimaries(stage: LUTPipelineStage, primaries: ColorPrimaries | null): void;
  getLUTStageOutputColorPrimaries(stage: LUTPipelineStage): ColorPrimaries | null;

  setLUTStageOutputTransferFunction(stage: LUTPipelineStage, transfer: TransferFunction | null): void;
  getLUTStageOutputTransferFunction(stage: LUTPipelineStage): TransferFunction | null;

  /**
   * True iff OCIO is currently active and overriding manual declarations
   * on the display stage. Optional — not all providers will know about
   * OCIO. Used by the API surface to log a one-time warning when a manual
   * declaration would be effectively overridden.
   */
  isOCIOActiveForDisplay?(): boolean;
}

/**
 * Minimal tone mapping interface required by the API layer.
 *
 * Provides get/set for tone mapping state.
 */
export interface ToneMappingProvider {
  getToneMappingState(): ToneMappingState;
  setToneMappingState(state: ToneMappingState): void;
  resetToneMappingState(): void;
}

/**
 * Minimal display profile interface required by the API layer.
 *
 * Provides get/set for display color management state and capability querying.
 */
export interface DisplayProvider {
  getDisplayColorState(): DisplayColorState;
  setDisplayColorState(state: DisplayColorState): void;
  resetDisplayColorState(): void;
}

/**
 * Provides read-only access to probed display capabilities.
 */
export interface DisplayCapabilitiesProvider {
  getDisplayCapabilities(): DisplayCapabilities;
}

/**
 * Minimal OCIO interface required by the API layer.
 *
 * Provides get/set for OCIO pipeline state.
 */
export interface OCIOProvider {
  getOCIOState(): OCIOState;
  setOCIOState(state: Partial<OCIOState>): void;
}

/**
 * Minimal pixel probe interface required by the API layer.
 *
 * Provides enable/disable, lock/unlock, state query, and configuration
 * for the pixel-probe overlay.
 */
export interface PixelProbeProvider {
  enable(): void;
  disable(): void;
  isEnabled(): boolean;
  toggleLock(): void;
  isLocked(): boolean;
  getState(): PixelProbeState;
  setFormat(format: PixelProbeState['format']): void;
  setSampleSize(size: SampleSize): void;
  getSampleSize(): SampleSize;
  setSourceMode(mode: SourceMode): void;
  getSourceMode(): SourceMode;
}
