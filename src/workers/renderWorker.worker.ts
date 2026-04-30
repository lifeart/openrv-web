/**
 * Render Worker - Dedicated Web Worker for WebGL2 rendering
 *
 * This worker receives an OffscreenCanvas via the `init` message,
 * creates a Renderer (WebGL2 backend) on it, and handles all rendering
 * commands sent from the main thread via postMessage.
 *
 * Message Protocol:
 * - Input: RenderWorkerMessage (from renderWorker.messages.ts)
 * - Output: RenderWorkerResult (from renderWorker.messages.ts)
 *
 * The worker is created by RenderWorkerProxy on the main thread.
 */

import { Renderer } from '../render/Renderer';
import { createRenderer } from '../render/createRenderer';
import { DEFAULT_CAPABILITIES } from '../color/DisplayCapabilities';
import { IPImage } from '../core/image/Image';
import type { RenderWorkerMessage, RenderWorkerResult, RenderHDRMessage } from '../render/renderWorker.messages';
import {
  DATA_TYPE_FROM_CODE,
  TRANSFER_FUNCTION_FROM_CODE,
  COLOR_PRIMARIES_FROM_CODE,
  RENDER_WORKER_PROTOCOL_VERSION,
} from '../render/renderWorker.messages';
import { Logger } from '../utils/Logger';

const log = new Logger('RenderWorker');

// Type assertion for Worker context
const workerSelf = self as unknown as {
  postMessage(message: RenderWorkerResult, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<RenderWorkerMessage>) => void) | null;
};

let renderer: Renderer | null = null;
let canvas: OffscreenCanvas | null = null;
let isContextLost = false;

/**
 * Post a message to the main thread.
 * Automatically stamps each message with the current protocol version.
 */
function post(msg: RenderWorkerResult, transfer?: Transferable[]): void {
  msg.protocolVersion = RENDER_WORKER_PROTOCOL_VERSION;
  if (transfer && transfer.length > 0) {
    workerSelf.postMessage(msg, transfer);
  } else {
    workerSelf.postMessage(msg);
  }
}

// ==========================================================================
// Transferable validation helpers
// ==========================================================================

/**
 * Check whether an ArrayBuffer has been detached (neutered).
 * A detached buffer has byteLength === 0 and its `.detached` property
 * (where available) is `true`.  We check both for cross-browser safety.
 */
function isArrayBufferDetached(buffer: ArrayBuffer): boolean {
  // The `detached` property is available in modern browsers (Chrome 114+, FF, Safari 16.4+)
  if ('detached' in buffer && (buffer as any).detached === true) {
    return true;
  }
  // Fallback: a transferred ArrayBuffer has byteLength 0.
  // Note: a *legitimately* empty buffer also has byteLength 0, but in
  // the render-worker context an empty image buffer is always invalid,
  // so treating it as detached is the safest default.
  return buffer.byteLength === 0;
}

/**
 * Validate the imageData ArrayBuffer in a renderHDR message.
 * Returns an error string if invalid, or null if valid.
 */
function validateHDRImageData(msg: RenderHDRMessage): string | null {
  // Type check: must be an ArrayBuffer
  if (!(msg.imageData instanceof ArrayBuffer)) {
    return `renderHDR: imageData is not an ArrayBuffer (got ${typeof msg.imageData})`;
  }
  // Detachment check
  if (isArrayBufferDetached(msg.imageData)) {
    return 'renderHDR: imageData ArrayBuffer is detached (neutered) — it may have already been transferred';
  }
  // Dimension sanity
  if (!Number.isFinite(msg.width) || msg.width <= 0 || !Number.isFinite(msg.height) || msg.height <= 0) {
    return `renderHDR: invalid dimensions ${msg.width}x${msg.height}`;
  }
  // Channel count sanity
  if (msg.channels !== 3 && msg.channels !== 4) {
    return `renderHDR: unsupported channel count ${msg.channels} (expected 3 or 4)`;
  }
  return null;
}

/**
 * Safely close an ImageBitmap, handling cases where it may already be
 * closed or transferred.  Logs at debug level rather than throwing,
 * because double-close / post-transfer close is expected in some flows.
 */
function safeCloseBitmap(bitmap: ImageBitmap): void {
  try {
    // A closed or transferred ImageBitmap has width and height of 0.
    // Attempting close() on it may throw in some browsers.
    if (bitmap.width === 0 && bitmap.height === 0) {
      log.debug('Skipping close on already-closed/transferred ImageBitmap');
      return;
    }
    bitmap.close();
  } catch (e) {
    log.debug('ImageBitmap.close() failed (bitmap may have been closed or transferred):', e);
  }
}

/**
 * Validate the bitmap in a renderSDR message.
 * Returns an error string if invalid, or null if valid.
 */
function validateSDRBitmap(msg: { bitmap: ImageBitmap; width: number; height: number }): string | null {
  // Type check: must be an ImageBitmap
  if (typeof ImageBitmap !== 'undefined' && !(msg.bitmap instanceof ImageBitmap)) {
    return `renderSDR: bitmap is not an ImageBitmap (got ${typeof msg.bitmap})`;
  }
  // A closed ImageBitmap has width and height of 0
  if (msg.bitmap.width === 0 && msg.bitmap.height === 0) {
    return 'renderSDR: bitmap appears to be closed (width and height are 0)';
  }
  // Dimension sanity
  if (!Number.isFinite(msg.width) || msg.width <= 0 || !Number.isFinite(msg.height) || msg.height <= 0) {
    return `renderSDR: invalid dimensions ${msg.width}x${msg.height}`;
  }
  return null;
}

/**
 * Reconstruct an IPImage from transferred HDR data.
 */
function reconstructIPImage(msg: RenderHDRMessage): IPImage {
  const dataType = DATA_TYPE_FROM_CODE[msg.dataType] ?? 'float32';
  const transferFunction =
    msg.transferFunction !== undefined ? TRANSFER_FUNCTION_FROM_CODE[msg.transferFunction] : undefined;
  const colorPrimaries = msg.colorPrimaries !== undefined ? COLOR_PRIMARIES_FROM_CODE[msg.colorPrimaries] : undefined;

  return new IPImage({
    width: msg.width,
    height: msg.height,
    channels: msg.channels,
    dataType,
    data: msg.imageData,
    metadata: {
      transferFunction,
      colorPrimaries,
    },
  });
}

/**
 * Apply a batch sync state message to the renderer.
 */
function applySyncState(msg: RenderWorkerMessage): void {
  if (msg.type !== 'syncState' || !renderer) return;
  const state = msg.state;

  if (state.colorAdjustments) renderer.setColorAdjustments(state.colorAdjustments);
  if (state.toneMappingState) renderer.setToneMappingState(state.toneMappingState);
  if (state.colorInversion !== undefined) renderer.setColorInversion(state.colorInversion);
  if (state.cdl) renderer.setCDL(state.cdl);
  if (state.curvesLUT !== undefined) renderer.setCurvesLUT(state.curvesLUT);
  if (state.colorWheels) renderer.setColorWheels(state.colorWheels);
  if (state.highlightsShadows) {
    renderer.setHighlightsShadows(state.highlightsShadows);
  }
  if (state.vibrance) renderer.setVibrance(state.vibrance);
  if (state.clarity !== undefined) renderer.setClarity({ clarity: state.clarity });
  if (state.sharpen !== undefined) renderer.setSharpen({ amount: state.sharpen });
  if (state.hslQualifier) renderer.setHSLQualifier(state.hslQualifier);
  if (state.channelMode) renderer.setChannelMode(state.channelMode);
  if (state.falseColor) renderer.setFalseColor(state.falseColor);
  if (state.zebraStripes) renderer.setZebraStripes(state.zebraStripes);
  if (state.lookLUT) {
    renderer.setLookLUT(
      state.lookLUT.lutData,
      state.lookLUT.lutSize,
      state.lookLUT.intensity,
      state.lookLUT.domainMin,
      state.lookLUT.domainMax,
    );
  } else if (state.lut) {
    renderer.setLUT(state.lut.lutData, state.lut.lutSize, state.lut.intensity);
  }
  if (state.fileLUT) {
    renderer.setFileLUT(
      state.fileLUT.lutData,
      state.fileLUT.lutSize,
      state.fileLUT.intensity,
      state.fileLUT.domainMin,
      state.fileLUT.domainMax,
    );
  }
  if (state.displayLUT) {
    renderer.setDisplayLUT(
      state.displayLUT.lutData,
      state.displayLUT.lutSize,
      state.displayLUT.intensity,
      state.displayLUT.domainMin,
      state.displayLUT.domainMax,
    );
  }
  if (state.displayColorState) renderer.setDisplayColorState(state.displayColorState);
  if (state.backgroundPattern) renderer.setBackgroundPattern(state.backgroundPattern);
  if (state.hdrOutputMode) renderer.setHDROutputMode(state.hdrOutputMode.mode, state.hdrOutputMode.capabilities);
  if (state.gamutMapping) renderer.setGamutMapping(state.gamutMapping);
  if (state.premultMode !== undefined) renderer.setPremultMode(state.premultMode);
  if (state.ditherMode !== undefined) renderer.setDitherMode(state.ditherMode);
  if (state.quantizeBits !== undefined) renderer.setQuantizeBits(state.quantizeBits);
  if (state.hdrHeadroom !== undefined) renderer.setHDRHeadroom(state.hdrHeadroom);
}

/**
 * Handle incoming messages from the main thread.
 */
function handleMessage(msg: RenderWorkerMessage): void {
  // Protocol version check: reject incompatible messages with an error response.
  // Missing version (undefined) is acceptable from older senders that predate versioning.
  if (msg.protocolVersion !== undefined && msg.protocolVersion !== RENDER_WORKER_PROTOCOL_VERSION) {
    const errorMessage = `Protocol version mismatch: received v${msg.protocolVersion}, expected v${RENDER_WORKER_PROTOCOL_VERSION}. Message type: ${msg.type}`;
    log.error(errorMessage);
    post({
      type: 'protocolMismatch',
      expectedVersion: RENDER_WORKER_PROTOCOL_VERSION,
      actualVersion: msg.protocolVersion,
      error: errorMessage,
    });
    return;
  }

  switch (msg.type) {
    case 'init': {
      // MED-55 P-pre-2: route Renderer construction through createRenderer()
      // factory + async initAsync() so backend selection (WebGL2 vs WebGPU)
      // happens at one capability gate. Today the factory always falls back
      // to WebGL2 in this worker because no WebGPU stages are registered;
      // the async gate is preserved for symmetry with ViewerGLRenderer and
      // for KHR_parallel_shader_compile completion.
      void (async () => {
        try {
          canvas = msg.canvas;
          // createRenderer returns RendererBackend; we cast to Renderer here
          // because the worker calls Renderer-only methods (setViewport,
          // setLUT variants, setColorAdjustments specifics, etc.). The cast
          // is safe today because createRenderer falls back to Renderer
          // (WebGL2) in this worker context. Phase 4a will widen
          // RendererBackend to remove this cast.
          const _renderer = createRenderer(msg.capabilities ?? DEFAULT_CAPABILITIES) as Renderer;
          // Renderer.initialize accepts HTMLCanvasElement | OffscreenCanvas
          _renderer.initialize(canvas as unknown as HTMLCanvasElement, msg.capabilities);
          await _renderer.initAsync();

          // Listen for context loss/restore on the OffscreenCanvas
          canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            isContextLost = true;
            post({ type: 'contextLost' });
          });
          canvas.addEventListener('webglcontextrestored', () => {
            isContextLost = false;
            post({ type: 'contextRestored' });
          });

          renderer = _renderer;
          const hdrMode = _renderer.getHDROutputMode();
          post({ type: 'initResult', success: true, hdrMode });
        } catch (error) {
          log.error('Initialization failed:', error);
          post({
            type: 'initResult',
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
      break;
    }

    case 'resize': {
      if (renderer) {
        renderer.resize(msg.width, msg.height);
      }
      break;
    }

    case 'setViewport': {
      if (renderer) {
        renderer.setViewport(msg.width, msg.height);
      }
      break;
    }

    case 'clear': {
      if (renderer) {
        renderer.clear(msg.r, msg.g, msg.b, msg.a);
      }
      break;
    }

    case 'renderSDR': {
      if (!renderer || isContextLost) {
        post({ type: 'renderError', id: msg.id, error: 'Renderer not available' });
        return;
      }
      // Validate the transferred bitmap before use
      const sdrError = validateSDRBitmap(msg);
      if (sdrError) {
        log.error(sdrError);
        post({ type: 'renderError', id: msg.id, error: sdrError });
        return;
      }
      try {
        // Use the ImageBitmap directly as texture source
        renderer.renderSDRFrame(msg.bitmap as unknown as HTMLCanvasElement);
        // Close the bitmap after use to prevent memory leaks
        safeCloseBitmap(msg.bitmap);
        post({ type: 'renderDone', id: msg.id });
      } catch (error) {
        // Attempt to close bitmap even on error
        safeCloseBitmap(msg.bitmap);
        post({
          type: 'renderError',
          id: msg.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      break;
    }

    case 'renderHDR': {
      if (!renderer || isContextLost) {
        post({ type: 'renderError', id: msg.id, error: 'Renderer not available' });
        return;
      }
      // Validate the transferred ArrayBuffer before use
      const hdrError = validateHDRImageData(msg);
      if (hdrError) {
        log.error(hdrError);
        post({ type: 'renderError', id: msg.id, error: hdrError });
        return;
      }
      try {
        const image = reconstructIPImage(msg);
        renderer.renderImage(image, 0, 0, 1, 1);
        post({ type: 'renderDone', id: msg.id });
      } catch (error) {
        log.error('HDR render failed:', error);
        post({
          type: 'renderError',
          id: msg.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      break;
    }

    case 'readPixel': {
      if (!renderer || isContextLost) {
        post({ type: 'pixelData', id: msg.id, data: null });
        return;
      }
      const data = renderer.readPixelFloat(msg.x, msg.y, msg.width, msg.height);
      if (data) {
        post({ type: 'pixelData', id: msg.id, data }, [data.buffer]);
      } else {
        post({ type: 'pixelData', id: msg.id, data: null });
      }
      break;
    }

    // --- Fire-and-forget state setters ---

    case 'setColorAdjustments':
      renderer?.setColorAdjustments(msg.adjustments);
      break;

    case 'setToneMappingState':
      renderer?.setToneMappingState(msg.state);
      break;

    case 'setCDL':
      renderer?.setCDL(msg.cdl);
      break;

    case 'setCurvesLUT':
      renderer?.setCurvesLUT(msg.luts);
      break;

    case 'setColorWheels':
      renderer?.setColorWheels(msg.state);
      break;

    case 'setHighlightsShadows':
      renderer?.setHighlightsShadows(msg.state);
      break;

    case 'setVibrance':
      renderer?.setVibrance(msg.state);
      break;

    case 'setClarity':
      renderer?.setClarity(msg.state);
      break;

    case 'setSharpen':
      renderer?.setSharpen(msg.state);
      break;

    case 'setHSLQualifier':
      renderer?.setHSLQualifier(msg.state);
      break;

    case 'setColorInversion':
      renderer?.setColorInversion(msg.enabled);
      break;

    case 'setChannelMode':
      renderer?.setChannelMode(msg.mode);
      break;

    case 'setFalseColor':
      renderer?.setFalseColor(msg.state);
      break;

    case 'setZebraStripes':
      renderer?.setZebraStripes(msg.state);
      break;

    case 'setLUT':
      renderer?.setLUT(msg.lutData, msg.lutSize, msg.intensity);
      break;

    case 'setDisplayColorState':
      renderer?.setDisplayColorState(msg.state);
      break;

    case 'setBackgroundPattern':
      renderer?.setBackgroundPattern(msg.state);
      break;

    case 'setHDROutputMode':
      renderer?.setHDROutputMode(msg.mode, msg.capabilities);
      break;

    case 'syncState':
      applySyncState(msg);
      break;

    case 'dispose': {
      if (renderer) {
        renderer.dispose();
        renderer = null;
      }
      canvas = null;
      isContextLost = false;
      break;
    }

    default:
      log.warn(`Unknown message type: ${(msg as any).type}`);
      break;
  }
}

workerSelf.onmessage = function (event: MessageEvent<RenderWorkerMessage>) {
  handleMessage(event.data);
};

// Signal ready (guard against non-worker environments like jsdom in tests)
if (typeof window === 'undefined') {
  post({ type: 'ready' });
}

// Test-only exports for verifying worker internals
export const __test__ = {
  getRenderer: () => renderer,
  setRenderer: (value: Renderer | null) => {
    renderer = value;
  },
  getCanvas: () => canvas,
  isContextLost: () => isContextLost,
  reconstructIPImage,
  applySyncState,
  handleMessage,
  post,
  isArrayBufferDetached,
  validateHDRImageData,
  validateSDRBitmap,
  safeCloseBitmap,
};
