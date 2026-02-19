/**
 * Source loading handlers: HDR auto-config, OCIO detection,
 * stack control source updates, and EXR layer management.
 */

import type { SessionBridgeContext } from '../AppSessionBridge';
import type { EXRChannelRemapping } from '../formats/EXRDecoder';
import { getSharedScopesProcessor } from '../scopes/WebGLScopes';

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
  updateVectorscope: () => void,
  updateGamutDiagram?: () => void
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

    // Check if this source already has a persisted color space assignment
    // (loaded from localStorage on startup). If so, use it instead of
    // auto-detecting from file extension.
    const persistedColorSpace = processor.getSourceInputColorSpace(sourceId);
    processor.setActiveSource(sourceId);

    if (!persistedColorSpace) {
      // No persisted color space — detect from file extension
      const lastDot = source.name ? source.name.lastIndexOf('.') : -1;
      const ext = lastDot >= 0 ? source.name!.substring(lastDot).toLowerCase() : '';
      const detectedFromExt = processor.detectColorSpaceFromExtension(ext);
      if (detectedFromExt) {
        processor.setSourceInputColorSpace(sourceId, detectedFromExt);
      }
    }
  }
  // Auto-configure display pipeline for HDR content.
  const isHDR = source?.fileSourceNode?.isHDR?.() || source?.videoSourceNode?.isHDR?.();
  const viewer = context.getViewer();
  const isHDRDisplay = viewer.isDisplayHDRCapable();
  const histogram = context.getHistogram();
  const scopesProcessor = getSharedScopesProcessor();

  if (isHDR) {
    const formatName = source?.fileSourceNode?.formatName ?? 'unknown';

    const isFileHDR = !!source?.fileSourceNode?.isHDR?.();
    if (isHDRDisplay) {
      const glRenderer = viewer.getGLRenderer?.();
      const headroom = glRenderer?.getHDRHeadroom?.() ?? 4.0;

      if (isFileHDR) {
        // HDR file (gainmap, EXR) on HDR display: linear float data has no
        // inherent dynamic-range compression. Content peaks (e.g. 20x SDR white)
        // often far exceed display headroom (3-6x). Without tone mapping,
        // mid-tones are crushed and highlights clip hard.
        console.log(`[HDR] HDR file (${formatName}) on HDR display — enabling ACES tone mapping`);
        context.getToneMappingControl().setState({ enabled: true, operator: 'aces' });
      } else {
        // HDR video (HLG/PQ) on HDR display: the transfer function already
        // encodes the dynamic range for the display. No tone mapping needed.
        console.log(`[HDR] HDR video on HDR display — no tone mapping`);
      }

      histogram.setHDRMode(true, Math.max(headroom, 4.0));
      scopesProcessor?.setHDRMode(true, Math.max(headroom, 4.0));
    } else {
      // SDR display: apply ACES tone mapping + gamma 2.2 to compress HDR to displayable range.
      // Scopes analyze the tone-mapped output which is SDR range (0-1.0).
      console.log(`[HDR] Detected HDR content (format: ${formatName}), SDR display — applying ACES + gamma 2.2`);
      context.getToneMappingControl().setState({ enabled: true, operator: 'aces' });
      context.getColorControls().setAdjustments({ gamma: 2.2 });
      histogram.setHDRMode(false);
      scopesProcessor?.setHDRMode(false);
    }
  } else {
    histogram.setHDRMode(false);
    scopesProcessor?.setHDRMode(false);
  }

  // GTO store and stack updates
  if (!session.gtoData) {
    context.getPersistenceManager().setGTOStore(null);
  }
  updateStackControlSources();
  context.getViewer().initPrerenderBuffer();
  // Update EXR layer selector if this is an EXR file with multiple layers
  updateEXRLayers();

  // Wire EXR window overlay: extract dataWindow/displayWindow from IPImage attributes
  const exrOverlay = context.getViewer().getEXRWindowOverlay();
  const fileSource = source?.fileSourceNode;
  const ipImage = fileSource && typeof (fileSource as any).getIPImage === 'function'
    ? (fileSource as any).getIPImage()
    : null;
  const attrs = ipImage?.metadata?.attributes;
  if (attrs && attrs.dataWindow && attrs.displayWindow) {
    exrOverlay.setWindows(attrs.dataWindow, attrs.displayWindow);
  } else {
    exrOverlay.clearWindows();
  }

  // Use double-RAF to update scopes after the viewer has rendered the new source.
  // This is more robust than setTimeout(100) as it's frame-aligned.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      updateHistogram();
      updateWaveform();
      updateVectorscope();
      updateGamutDiagram?.();
    });
  });
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
