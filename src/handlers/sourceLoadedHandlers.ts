/**
 * Source loading handlers: HDR auto-config, OCIO detection,
 * stack control source updates, and EXR layer management.
 */

import type { SessionBridgeContext } from '../AppSessionBridge';
import type { EXRChannelRemapping } from '../formats/EXRDecoder';

/**
 * Handle sourceLoaded event: update info panel, crop, OCIO, HDR auto-config,
 * GTO store, stack control, prerender buffer, EXR layers, and scopes.
 */
export function handleSourceLoaded(
  context: SessionBridgeContext,
  updateInfoPanel: () => void,
  updateStackControlSources: () => void,
  updateEXRLayers: () => void,
  updateHistogram: () => void,
  updateWaveform: () => void,
  updateVectorscope: () => void
): void {
  const session = context.getSession();

  updateInfoPanel();
  // Update crop control with new source dimensions for correct aspect ratio computation
  const source = session.currentSource;
  if (source) {
    context.getCropControl().setSourceDimensions(source.width, source.height);

    // Per-source OCIO color space detection
    const processor = context.getOCIOControl().getProcessor();
    const sourceId = source.name || `source_${session.currentSourceIndex}`;
    processor.setActiveSource(sourceId);

    // Detect color space from file extension
    const lastDot = source.name ? source.name.lastIndexOf('.') : -1;
    const ext = lastDot >= 0 ? source.name!.substring(lastDot).toLowerCase() : '';
    const detectedFromExt = processor.detectColorSpaceFromExtension(ext);
    if (detectedFromExt) {
      processor.setSourceInputColorSpace(sourceId, detectedFromExt);
    }
  }
  // Auto-configure display pipeline for HDR content.
  // Always set ACES + gamma 2.2 as the SDR tone-mapped baseline.
  // If the WebGL renderer achieves true HDR output (rec2100-hlg/pq),
  // renderHDRWithWebGL() will override these with linear passthrough.
  const isHDR = source?.fileSourceNode?.isHDR?.() || source?.videoSourceNode?.isHDR?.();
  if (isHDR) {
    const formatName = source?.fileSourceNode?.formatName ?? 'unknown';
    console.log(`[HDR] Detected HDR content (format: ${formatName}), applying ACES + gamma 2.2`);
    context.getToneMappingControl().setState({ enabled: true, operator: 'aces' });
    context.getColorControls().setAdjustments({ gamma: 2.2 });
  }

  // GTO store and stack updates
  if (!session.gtoData) {
    context.getPersistenceManager().setGTOStore(null);
  }
  updateStackControlSources();
  context.getViewer().initPrerenderBuffer();
  // Update EXR layer selector if this is an EXR file with multiple layers
  updateEXRLayers();
  // Small delay to allow canvas to render before updating scopes
  setTimeout(() => {
    updateHistogram();
    updateWaveform();
    updateVectorscope();
  }, 100);
}

/**
 * Update available sources for the stack control.
 * Called when sources are loaded or changed.
 */
export function updateStackControlSources(context: SessionBridgeContext): void {
  const session = context.getSession();
  const sources = session.allSources.map((source, index) => ({
    index,
    name: source.name,
  }));
  context.getStackControl().setAvailableSources(sources);
}

/**
 * Update EXR layer information in ChannelSelect when a file is loaded.
 */
export function updateEXRLayers(context: SessionBridgeContext): void {
  const source = context.getSession().currentSource;
  if (!source) {
    context.getChannelSelect().clearEXRLayers();
    return;
  }

  // Check if source has a FileSourceNode with EXR support
  const fileSource = source.fileSourceNode;
  if (!fileSource || typeof fileSource.getEXRLayers !== 'function') {
    context.getChannelSelect().clearEXRLayers();
    return;
  }

  const layers = fileSource.getEXRLayers();
  if (layers && layers.length > 0) {
    context.getChannelSelect().setEXRLayers(layers);
  } else {
    context.getChannelSelect().clearEXRLayers();
  }
}

/**
 * Handle EXR layer change from ChannelSelect.
 */
export async function handleEXRLayerChange(
  context: SessionBridgeContext,
  layerName: string | null,
  remapping: EXRChannelRemapping | null,
  scheduleUpdateScopes: () => void
): Promise<void> {
  const source = context.getSession().currentSource;
  if (!source) return;

  // Check if source has a FileSourceNode with EXR support
  const fileSource = source.fileSourceNode;
  if (!fileSource || typeof fileSource.setEXRLayer !== 'function') return;

  try {
    const changed = await fileSource.setEXRLayer(layerName, remapping ?? undefined);
    if (changed) {
      // Refresh the viewer
      context.getViewer().refresh();
      scheduleUpdateScopes();
    }
  } catch (err) {
    console.error('Failed to change EXR layer:', err);
  }
}
