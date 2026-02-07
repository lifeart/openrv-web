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
import { IPImage } from '../core/image/Image';
import type {
  RenderWorkerMessage,
  RenderWorkerResult,
  RenderHDRMessage,
} from '../render/renderWorker.messages';
import {
  DATA_TYPE_FROM_CODE,
  TRANSFER_FUNCTION_FROM_CODE,
  COLOR_PRIMARIES_FROM_CODE,
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
 */
function post(msg: RenderWorkerResult, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    workerSelf.postMessage(msg, transfer);
  } else {
    workerSelf.postMessage(msg);
  }
}

/**
 * Reconstruct an IPImage from transferred HDR data.
 */
function reconstructIPImage(msg: RenderHDRMessage): IPImage {
  const dataType = DATA_TYPE_FROM_CODE[msg.dataType] ?? 'float32';
  const transferFunction = msg.transferFunction !== undefined
    ? TRANSFER_FUNCTION_FROM_CODE[msg.transferFunction]
    : undefined;
  const colorPrimaries = msg.colorPrimaries !== undefined
    ? COLOR_PRIMARIES_FROM_CODE[msg.colorPrimaries]
    : undefined;

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
    const hs = state.highlightsShadows;
    renderer.setHighlightsShadows(hs.highlights, hs.shadows, hs.whites, hs.blacks);
  }
  if (state.vibrance) renderer.setVibrance(state.vibrance.vibrance, state.vibrance.skinProtection);
  if (state.clarity !== undefined) renderer.setClarity(state.clarity);
  if (state.sharpen !== undefined) renderer.setSharpen(state.sharpen);
  if (state.hslQualifier) renderer.setHSLQualifier(state.hslQualifier);
  if (state.channelMode) renderer.setChannelMode(state.channelMode);
  if (state.falseColor) renderer.setFalseColor(state.falseColor.enabled, state.falseColor.lut);
  if (state.zebraStripes) renderer.setZebraStripes(state.zebraStripes);
  if (state.lut) renderer.setLUT(state.lut.lutData, state.lut.lutSize, state.lut.intensity);
  if (state.displayColorState) renderer.setDisplayColorState(state.displayColorState);
  if (state.backgroundPattern) renderer.setBackgroundPattern(state.backgroundPattern);
  if (state.hdrOutputMode) renderer.setHDROutputMode(state.hdrOutputMode.mode, state.hdrOutputMode.capabilities);
}

/**
 * Handle incoming messages from the main thread.
 */
workerSelf.onmessage = function (event: MessageEvent<RenderWorkerMessage>) {
  const msg = event.data;

  switch (msg.type) {
    case 'init': {
      try {
        canvas = msg.canvas;
        renderer = new Renderer();
        // Renderer.initialize accepts HTMLCanvasElement | OffscreenCanvas
        renderer.initialize(
          canvas as unknown as HTMLCanvasElement,
          msg.capabilities,
        );

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

        const hdrMode = renderer.getHDROutputMode();
        post({ type: 'initResult', success: true, hdrMode });
      } catch (error) {
        log.error('Initialization failed:', error);
        post({
          type: 'initResult',
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      break;
    }

    case 'resize': {
      if (renderer) {
        renderer.resize(msg.width, msg.height);
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
      try {
        // Use the ImageBitmap directly as texture source
        renderer.renderSDRFrame(msg.bitmap as unknown as HTMLCanvasElement);
        // Close the bitmap after use to prevent memory leaks
        msg.bitmap.close();
        post({ type: 'renderDone', id: msg.id });
      } catch (error) {
        // Attempt to close bitmap even on error
        try { msg.bitmap.close(); } catch (e) { log.warn('Failed to close bitmap after render error:', e); }
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
      renderer?.setHighlightsShadows(msg.highlights, msg.shadows, msg.whites, msg.blacks);
      break;

    case 'setVibrance':
      renderer?.setVibrance(msg.vibrance, msg.skinProtection);
      break;

    case 'setClarity':
      renderer?.setClarity(msg.clarity);
      break;

    case 'setSharpen':
      renderer?.setSharpen(msg.amount);
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
      renderer?.setFalseColor(msg.enabled, msg.lut);
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
  }
};

// Signal ready (guard against non-worker environments like jsdom in tests)
if (typeof window === 'undefined') {
  post({ type: 'ready' });
}

// Test-only exports for verifying worker internals
export const __test__ = {
  getRenderer: () => renderer,
  getCanvas: () => canvas,
  isContextLost: () => isContextLost,
  reconstructIPImage,
  applySyncState,
};
