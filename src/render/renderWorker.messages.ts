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
 * - All messages carry a protocolVersion for forward/backward compatibility
 */

import type { ColorAdjustments, ColorWheelsState, ChannelMode, HSLQualifierState } from '../core/types/color';
import type { ToneMappingState, ZebraState, HighlightsShadowsState, VibranceState, ClarityState, SharpenState, FalseColorState } from '../core/types/effects';
import type { BackgroundPatternState } from '../core/types/background';
import type { CDLValues } from '../color/CDL';
import type { CurveLUTs } from '../color/ColorCurves';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';

// =============================================================================
// Protocol Version
// =============================================================================

/**
 * Current protocol version for render worker messages.
 * Increment this when making breaking changes to the message format.
 */
export const RENDER_WORKER_PROTOCOL_VERSION = 1;

/**
 * Base interface for all render worker messages.
 * The protocolVersion field is optional for backward compatibility with
 * messages that were created before versioning was introduced.
 */
export interface BaseWorkerMessage {
  protocolVersion?: number;
}

// =============================================================================
// Main Thread → Worker Messages
// =============================================================================

/** Initialize the worker with a transferred OffscreenCanvas. */
export interface InitMessage extends BaseWorkerMessage {
  type: 'init';
  canvas: OffscreenCanvas;
  capabilities?: DisplayCapabilities;
}

/** Resize the rendering viewport. */
export interface ResizeMessage extends BaseWorkerMessage {
  type: 'resize';
  width: number;
  height: number;
}

/** Set GL viewport subrect without resizing the canvas buffer. */
export interface SetViewportMessage extends BaseWorkerMessage {
  type: 'setViewport';
  width: number;
  height: number;
}

/** Clear the canvas to the given color. */
export interface ClearMessage extends BaseWorkerMessage {
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
export interface RenderSDRMessage extends BaseWorkerMessage {
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
export interface RenderHDRMessage extends BaseWorkerMessage {
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
export interface SetColorAdjustmentsMessage extends BaseWorkerMessage {
  type: 'setColorAdjustments';
  adjustments: ColorAdjustments;
}

/** Set tone mapping state (fire-and-forget). */
export interface SetToneMappingStateMessage extends BaseWorkerMessage {
  type: 'setToneMappingState';
  state: ToneMappingState;
}

/** Set CDL values (fire-and-forget). */
export interface SetCDLMessage extends BaseWorkerMessage {
  type: 'setCDL';
  cdl: CDLValues;
}

/** Set curves LUT data (fire-and-forget). */
export interface SetCurvesLUTMessage extends BaseWorkerMessage {
  type: 'setCurvesLUT';
  luts: CurveLUTs | null;
}

/** Set color wheels state (fire-and-forget). */
export interface SetColorWheelsMessage extends BaseWorkerMessage {
  type: 'setColorWheels';
  state: ColorWheelsState;
}

/** Set highlights/shadows/whites/blacks (fire-and-forget). */
export interface SetHighlightsShadowsMessage extends BaseWorkerMessage {
  type: 'setHighlightsShadows';
  state: HighlightsShadowsState;
}

/** Set vibrance (fire-and-forget). */
export interface SetVibranceMessage extends BaseWorkerMessage {
  type: 'setVibrance';
  state: VibranceState;
}

/** Set clarity (fire-and-forget). */
export interface SetClarityMessage extends BaseWorkerMessage {
  type: 'setClarity';
  state: ClarityState;
}

/** Set sharpen amount (fire-and-forget). */
export interface SetSharpenMessage extends BaseWorkerMessage {
  type: 'setSharpen';
  state: SharpenState;
}

/** Set HSL qualifier state (fire-and-forget). */
export interface SetHSLQualifierMessage extends BaseWorkerMessage {
  type: 'setHSLQualifier';
  state: HSLQualifierState;
}

/** Set color inversion (fire-and-forget). */
export interface SetColorInversionMessage extends BaseWorkerMessage {
  type: 'setColorInversion';
  enabled: boolean;
}

/** Set channel mode (fire-and-forget). */
export interface SetChannelModeMessage extends BaseWorkerMessage {
  type: 'setChannelMode';
  mode: ChannelMode;
}

/** Set false color state (fire-and-forget). */
export interface SetFalseColorMessage extends BaseWorkerMessage {
  type: 'setFalseColor';
  state: FalseColorState;
}

/** Set zebra stripes state (fire-and-forget). */
export interface SetZebraStripesMessage extends BaseWorkerMessage {
  type: 'setZebraStripes';
  state: ZebraState;
}

/** Set 3D LUT data (fire-and-forget). LUT data transferred as transferable. */
export interface SetLUTMessage extends BaseWorkerMessage {
  type: 'setLUT';
  lutData: Float32Array | null;
  lutSize: number;
  intensity: number;
}

/** Set display color management state (fire-and-forget). */
export interface SetDisplayColorStateMessage extends BaseWorkerMessage {
  type: 'setDisplayColorState';
  state: {
    transferFunction: number;
    displayGamma: number;
    displayBrightness: number;
    customGamma: number;
  };
}

/** Set background pattern state (fire-and-forget). */
export interface SetBackgroundPatternMessage extends BaseWorkerMessage {
  type: 'setBackgroundPattern';
  state: BackgroundPatternState;
}

/** Set HDR output mode (fire-and-forget). */
export interface SetHDROutputModeMessage extends BaseWorkerMessage {
  type: 'setHDROutputMode';
  mode: 'sdr' | 'hlg' | 'pq' | 'extended';
  capabilities: DisplayCapabilities;
}

/** Read pixel data at a specific location. Requires response. */
export interface ReadPixelMessage extends BaseWorkerMessage {
  type: 'readPixel';
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Batch state sync: all dirty state in a single message. */
export interface SyncStateMessage extends BaseWorkerMessage {
  type: 'syncState';
  state: Partial<RendererSyncState>;
}

/** Dispose the worker and release all resources. */
export interface DisposeMessage extends BaseWorkerMessage {
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
  highlightsShadows: HighlightsShadowsState;
  vibrance: VibranceState;
  clarity: number;
  sharpen: number;
  hslQualifier: HSLQualifierState;
  channelMode: ChannelMode;
  falseColor: FalseColorState;
  zebraStripes: ZebraState;
  lut: { lutData: Float32Array | null; lutSize: number; intensity: number };
  displayColorState: { transferFunction: number; displayGamma: number; displayBrightness: number; customGamma: number };
  backgroundPattern: BackgroundPatternState;
  hdrOutputMode: { mode: 'sdr' | 'hlg' | 'pq' | 'extended'; capabilities: DisplayCapabilities };
}

/** Union of all main thread → worker messages. */
export type RenderWorkerMessage =
  | InitMessage
  | ResizeMessage
  | SetViewportMessage
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
export interface ReadyResult extends BaseWorkerMessage {
  type: 'ready';
}

/** Initialization result. */
export interface InitResult extends BaseWorkerMessage {
  type: 'initResult';
  success: boolean;
  error?: string;
  hdrMode?: string;
}

/** Render completed successfully. */
export interface RenderDoneResult extends BaseWorkerMessage {
  type: 'renderDone';
  id: number;
}

/** Render failed with an error. */
export interface RenderErrorResult extends BaseWorkerMessage {
  type: 'renderError';
  id: number;
  error: string;
}

/** Pixel data response. */
export interface PixelDataResult extends BaseWorkerMessage {
  type: 'pixelData';
  id: number;
  data: Float32Array | null;
}

/** WebGL context was lost. */
export interface ContextLostResult extends BaseWorkerMessage {
  type: 'contextLost';
}

/** WebGL context was restored. */
export interface ContextRestoredResult extends BaseWorkerMessage {
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
