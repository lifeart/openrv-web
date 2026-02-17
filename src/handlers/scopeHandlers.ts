/**
 * Scope update handlers for histogram, waveform, and vectorscope.
 *
 * Uses getScopeImageData() which provides float data when WebGL rendering is
 * active (preserving HDR values > 1.0), or standard ImageData from the 2D canvas.
 */

import type { SessionBridgeContext } from '../AppSessionBridge';
import type { ScopeImageData } from '../ui/components/PixelSamplingManager';

/**
 * Get scope image data from the viewer (shared by all scope handlers).
 * Returns null if no data is available.
 */
function getScopeData(context: SessionBridgeContext): ScopeImageData | null {
  return context.getViewer().getScopeImageData();
}

/**
 * Update histogram with current frame data.
 * Routes to HDR path (float data) when available, otherwise uses SDR ImageData.
 */
export function updateHistogram(context: SessionBridgeContext, scopeData?: ScopeImageData | null): void {
  const histogram = context.getHistogram();
  if (!histogram.isVisible()) return;

  const data = scopeData !== undefined ? scopeData : getScopeData(context);
  if (!data) return;

  if (data.floatData && histogram.isHDRActive()) {
    histogram.updateHDR(data.floatData, data.width, data.height);
  } else {
    histogram.update(data.imageData);
  }
}

/**
 * Update waveform with current frame data.
 * Routes to float path when WebGL rendering provides HDR data.
 */
export function updateWaveform(context: SessionBridgeContext, scopeData?: ScopeImageData | null): void {
  const waveform = context.getWaveform();
  if (!waveform.isVisible()) return;

  const data = scopeData !== undefined ? scopeData : getScopeData(context);
  if (!data) return;

  if (data.floatData) {
    waveform.updateFloat(data.floatData, data.width, data.height);
  } else {
    waveform.update(data.imageData);
  }
}

/**
 * Update vectorscope with current frame data.
 * Routes to float path when WebGL rendering provides HDR data.
 */
export function updateVectorscope(context: SessionBridgeContext, scopeData?: ScopeImageData | null): void {
  const vectorscope = context.getVectorscope();
  if (!vectorscope.isVisible()) return;

  const data = scopeData !== undefined ? scopeData : getScopeData(context);
  if (!data) return;

  if (data.floatData) {
    vectorscope.updateFloat(data.floatData, data.width, data.height);
  } else {
    vectorscope.update(data.imageData);
  }
}

/**
 * Update gamut diagram with current frame data.
 * Routes to float path when WebGL rendering provides HDR data.
 */
export function updateGamutDiagram(context: SessionBridgeContext, scopeData?: ScopeImageData | null): void {
  const gamutDiagram = context.getGamutDiagram();
  if (!gamutDiagram.isVisible()) return;

  const data = scopeData !== undefined ? scopeData : getScopeData(context);
  if (!data) return;

  if (data.floatData) {
    gamutDiagram.updateFloat(data.floatData, data.width, data.height);
  } else {
    gamutDiagram.update(data.imageData);
  }
}

/**
 * Creates a scope update scheduler that coalesces multiple update requests
 * into a single post-render update using double requestAnimationFrame.
 *
 * Gets scope data once per update cycle and passes it to all three scope
 * handlers, avoiding triple render+readback calls.
 */
export function createScopeScheduler(
  context: SessionBridgeContext,
  options?: { onHistogramData?: (data: import('../ui/components/Histogram').HistogramData) => void }
): { schedule: () => void; isPending: () => boolean } {
  let pendingScopeUpdate = false;

  return {
    schedule(): void {
      if (pendingScopeUpdate) return;
      pendingScopeUpdate = true;

      // Use double requestAnimationFrame to ensure we run after the viewer's render
      // First RAF puts us in the same frame as the render, second RAF ensures render completed
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          pendingScopeUpdate = false;
          // Get scope data once and share across all three scope handlers
          const scopeData = getScopeData(context);
          updateHistogram(context, scopeData);
          updateWaveform(context, scopeData);
          updateVectorscope(context, scopeData);
          updateGamutDiagram(context, scopeData);

          // Feed mini histogram in panel if callback provided
          if (options?.onHistogramData) {
            const histogram = context.getHistogram();
            const histData = histogram.getData();
            if (histData) {
              options.onHistogramData(histData);
            }
          }
        });
      });
    },
    isPending(): boolean {
      return pendingScopeUpdate;
    },
  };
}
