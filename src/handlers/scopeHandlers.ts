/**
 * Scope update handlers for histogram, waveform, and vectorscope.
 */

import type { SessionBridgeContext } from '../AppSessionBridge';

/**
 * Update histogram with current frame data.
 */
export function updateHistogram(context: SessionBridgeContext): void {
  const histogram = context.getHistogram();
  if (!histogram.isVisible()) return;

  const imageData = context.getViewer().getImageData();
  if (imageData) {
    histogram.update(imageData);
  }
}

/**
 * Update waveform with current frame data.
 */
export function updateWaveform(context: SessionBridgeContext): void {
  const waveform = context.getWaveform();
  if (!waveform.isVisible()) return;

  const imageData = context.getViewer().getImageData();
  if (imageData) {
    waveform.update(imageData);
  }
}

/**
 * Update vectorscope with current frame data.
 */
export function updateVectorscope(context: SessionBridgeContext): void {
  const vectorscope = context.getVectorscope();
  if (!vectorscope.isVisible()) return;

  const imageData = context.getViewer().getImageData();
  if (imageData) {
    vectorscope.update(imageData);
  }
}

/**
 * Creates a scope update scheduler that coalesces multiple update requests
 * into a single post-render update using double requestAnimationFrame.
 */
export function createScopeScheduler(
  context: SessionBridgeContext
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
          updateHistogram(context);
          updateWaveform(context);
          updateVectorscope(context);
        });
      });
    },
    isPending(): boolean {
      return pendingScopeUpdate;
    },
  };
}
