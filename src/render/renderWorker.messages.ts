/**
 * Render Worker Message Protocol
 *
 * Defines all message types exchanged between the main thread and the
 * dedicated render worker. The worker receives an OffscreenCanvas via
 * the `init` message, creates a WebGL2 Renderer on it, and handles
 * rendering commands sent from the main thread.
 *
 * Design decisions:
 * - State-setter messages are fire-and-forget (no response needed)
 * - Render messages use request `id` for correlation with completion
 * - ImageBitmap transferred as transferable (zero-copy)
 * - HDR image data transferred as ArrayBuffer (zero-copy)
 * - Pixel probe returns Float32Array via message
 */

import type { ColorAdjustments } from '../ui/components/ColorControls';
import type { ToneMappingState } from '../ui/components/ToneMappingControl';
import type { CDLValues } from '../color/CDL';
import type { ColorWheelsState } from '../ui/components/ColorWheels';
import type { ZebraState } from '../ui/components/ZebraStripes';
import type { BackgroundPatternState } from '../ui/components/BackgroundPatternControl';
import type { CurveLUTs } from '../color/ColorCurves';
import type { ChannelMode } from '../ui/components/ChannelSelect';
import type { HSLQualifierState } from '../ui/components/HSLQualifier';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';

// =============================================================================
// Main Thread → Worker Messages
// =============================================================================

/** Initialize the worker with a transferred OffscreenCanvas. */
export interface InitMessage {
  type: 'init';
  canvas: OffscreenCanvas;
  capabilities?: DisplayCapabilities;
}

/** Resize the rendering viewport. */
export interface ResizeMessage {
  type: 'resize';
  width: number;
  height: number;
}

/** Clear the canvas to the given color. */
export interface ClearMessage {
  type: 'clear';
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Render an SDR frame. The ImageBitmap is transferred separately as a
 * transferable object for zero-copy.
 */
export interface RenderSDRMessage {
  type: 'renderSDR';
  id: number;
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

/**
 * Render an HDR frame. The image data ArrayBuffer is transferred as a
 * transferable for zero-copy.
 */
export interface RenderHDRMessage {
  type: 'renderHDR';
  id: number;
  imageData: ArrayBuffer;
  width: number;
  height: number;
  dataType: number; // 0=uint8, 1=uint16, 2=float32
  channels: number;
  transferFunction?: number; // 0=srgb, 1=hlg, 2=pq
  colorPrimaries?: number; // 0=bt709, 1=bt2020
}

/** Set color adjustments (fire-and-forget). */
export interface SetColorAdjustmentsMessage {
  type: 'setColorAdjustments';
  adjustments: ColorAdjustments;
}

/** Set tone mapping state (fire-and-forget). */
export interface SetToneMappingStateMessage {
  type: 'setToneMappingState';
  state: ToneMappingState;
}

/** Set CDL values (fire-and-forget). */
export interface SetCDLMessage {
  type: 'setCDL';
  cdl: CDLValues;
}

/** Set curves LUT data (fire-and-forget). */
export interface SetCurvesLUTMessage {
  type: 'setCurvesLUT';
  luts: CurveLUTs | null;
}

/** Set color wheels state (fire-and-forget). */
export interface SetColorWheelsMessage {
  type: 'setColorWheels';
  state: ColorWheelsState;
}

/** Set highlights/shadows/whites/blacks (fire-and-forget). */
export interface SetHighlightsShadowsMessage {
  type: 'setHighlightsShadows';
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
}

/** Set vibrance (fire-and-forget). */
export interface SetVibranceMessage {
  type: 'setVibrance';
  vibrance: number;
  skinProtection: boolean;
}

/** Set clarity (fire-and-forget). */
export interface SetClarityMessage {
  type: 'setClarity';
  clarity: number;
}

/** Set sharpen amount (fire-and-forget). */
export interface SetSharpenMessage {
  type: 'setSharpen';
  amount: number;
}

/** Set HSL qualifier state (fire-and-forget). */
export interface SetHSLQualifierMessage {
  type: 'setHSLQualifier';
  state: HSLQualifierState;
}

/** Set color inversion (fire-and-forget). */
export interface SetColorInversionMessage {
  type: 'setColorInversion';
  enabled: boolean;
}

/** Set channel mode (fire-and-forget). */
export interface SetChannelModeMessage {
  type: 'setChannelMode';
  mode: ChannelMode;
}

/** Set false color state (fire-and-forget). */
export interface SetFalseColorMessage {
  type: 'setFalseColor';
  enabled: boolean;
  lut: Uint8Array | null;
}

/** Set zebra stripes state (fire-and-forget). */
export interface SetZebraStripesMessage {
  type: 'setZebraStripes';
  state: ZebraState;
}

/** Set 3D LUT data (fire-and-forget). LUT data transferred as transferable. */
export interface SetLUTMessage {
  type: 'setLUT';
  lutData: Float32Array | null;
  lutSize: number;
  intensity: number;
}

/** Set display color management state (fire-and-forget). */
export interface SetDisplayColorStateMessage {
  type: 'setDisplayColorState';
  state: {
    transferFunction: number;
    displayGamma: number;
    displayBrightness: number;
    customGamma: number;
  };
}

/** Set background pattern state (fire-and-forget). */
export interface SetBackgroundPatternMessage {
  type: 'setBackgroundPattern';
  state: BackgroundPatternState;
}

/** Set HDR output mode (fire-and-forget). */
export interface SetHDROutputModeMessage {
  type: 'setHDROutputMode';
  mode: 'sdr' | 'hlg' | 'pq';
  capabilities: DisplayCapabilities;
}

/** Read pixel data at a specific location. Requires response. */
export interface ReadPixelMessage {
  type: 'readPixel';
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Batch state sync: all dirty state in a single message. */
export interface SyncStateMessage {
  type: 'syncState';
  state: Partial<RendererSyncState>;
}

/** Dispose the worker and release all resources. */
export interface DisposeMessage {
  type: 'dispose';
}

/**
 * Batched renderer state for sync messages.
 * Only dirty fields are included.
 */
export interface RendererSyncState {
  colorAdjustments: ColorAdjustments;
  toneMappingState: ToneMappingState;
  colorInversion: boolean;
  cdl: CDLValues;
  curvesLUT: CurveLUTs | null;
  colorWheels: ColorWheelsState;
  highlightsShadows: { highlights: number; shadows: number; whites: number; blacks: number };
  vibrance: { vibrance: number; skinProtection: boolean };
  clarity: number;
  sharpen: number;
  hslQualifier: HSLQualifierState;
  channelMode: ChannelMode;
  falseColor: { enabled: boolean; lut: Uint8Array | null };
  zebraStripes: ZebraState;
  lut: { lutData: Float32Array | null; lutSize: number; intensity: number };
  displayColorState: { transferFunction: number; displayGamma: number; displayBrightness: number; customGamma: number };
  backgroundPattern: BackgroundPatternState;
  hdrOutputMode: { mode: 'sdr' | 'hlg' | 'pq'; capabilities: DisplayCapabilities };
}

/** Union of all main thread → worker messages. */
export type RenderWorkerMessage =
  | InitMessage
  | ResizeMessage
  | ClearMessage
  | RenderSDRMessage
  | RenderHDRMessage
  | SetColorAdjustmentsMessage
  | SetToneMappingStateMessage
  | SetCDLMessage
  | SetCurvesLUTMessage
  | SetColorWheelsMessage
  | SetHighlightsShadowsMessage
  | SetVibranceMessage
  | SetClarityMessage
  | SetSharpenMessage
  | SetHSLQualifierMessage
  | SetColorInversionMessage
  | SetChannelModeMessage
  | SetFalseColorMessage
  | SetZebraStripesMessage
  | SetLUTMessage
  | SetDisplayColorStateMessage
  | SetBackgroundPatternMessage
  | SetHDROutputModeMessage
  | ReadPixelMessage
  | SyncStateMessage
  | DisposeMessage;

// =============================================================================
// Worker → Main Thread Messages
// =============================================================================

/** Worker is ready to receive messages. */
export interface ReadyResult {
  type: 'ready';
}

/** Initialization result. */
export interface InitResult {
  type: 'initResult';
  success: boolean;
  error?: string;
  hdrMode?: string;
}

/** Render completed successfully. */
export interface RenderDoneResult {
  type: 'renderDone';
  id: number;
}

/** Render failed with an error. */
export interface RenderErrorResult {
  type: 'renderError';
  id: number;
  error: string;
}

/** Pixel data response. */
export interface PixelDataResult {
  type: 'pixelData';
  id: number;
  data: Float32Array | null;
}

/** WebGL context was lost. */
export interface ContextLostResult {
  type: 'contextLost';
}

/** WebGL context was restored. */
export interface ContextRestoredResult {
  type: 'contextRestored';
}

/** Union of all worker → main thread messages. */
export type RenderWorkerResult =
  | ReadyResult
  | InitResult
  | RenderDoneResult
  | RenderErrorResult
  | PixelDataResult
  | ContextLostResult
  | ContextRestoredResult;

// =============================================================================
// Data type conversion helpers
// =============================================================================

/** Map DataType string to numeric code for transfer. */
export const DATA_TYPE_CODES = {
  uint8: 0,
  uint16: 1,
  float32: 2,
} as const;

/** Map numeric code back to DataType string. */
export const DATA_TYPE_FROM_CODE = ['uint8', 'uint16', 'float32'] as const;

/** Map TransferFunction string to numeric code for transfer. */
export const TRANSFER_FUNCTION_CODES = {
  srgb: 0,
  hlg: 1,
  pq: 2,
} as const;

/** Map numeric code back to TransferFunction string. */
export const TRANSFER_FUNCTION_FROM_CODE = ['srgb', 'hlg', 'pq'] as const;

/** Map ColorPrimaries string to numeric code for transfer. */
export const COLOR_PRIMARIES_CODES = {
  bt709: 0,
  bt2020: 1,
} as const;

/** Map numeric code back to ColorPrimaries string. */
export const COLOR_PRIMARIES_FROM_CODE = ['bt709', 'bt2020'] as const;
