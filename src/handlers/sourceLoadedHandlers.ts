/**
 * Source loading handlers: HDR auto-config, OCIO detection,
 * stack control source updates, and EXR layer management.
 */

import type { SessionBridgeContext } from '../AppSessionBridge';
import type { EXRChannelRemapping } from '../formats/EXRDecoder';
import { setScopesHDRAutoFit, setScopesHDRMode } from '../scopes/WebGLScopes';
import { queryHDRHeadroom } from '../color/DisplayCapabilities';

type HDRTransferPreset = 'hlg' | 'pq' | null;
type AutoToneMappingPreset = { enabled: boolean; operator: 'off' | 'aces' };

interface HDRAutoConfigState {
  toneMappingAutoApplied: boolean;
  toneMappingAutoPreset: AutoToneMappingPreset | null;
  gammaAutoApplied: boolean;
  gammaAutoValue: number | null;
}

const DEFAULT_HDR_AUTOCONFIG_STATE: HDRAutoConfigState = {
  toneMappingAutoApplied: false,
  toneMappingAutoPreset: null,
  gammaAutoApplied: false,
  gammaAutoValue: null,
};

const hdrAutoConfigStateByContext = new WeakMap<SessionBridgeContext, HDRAutoConfigState>();

function normalizeHDRTransferPreset(value: string | undefined | null): HDRTransferPreset {
  if (!value) return null;
  const tf = value.toLowerCase();
  if (tf === 'hlg' || tf === 'arib-std-b67') return 'hlg';
  if (tf === 'pq' || tf === 'smpte2084' || tf === 'smpte-st-2084') return 'pq';
  return null;
}

function detectHDRTransferPreset(source: ReturnType<SessionBridgeContext['getSession']>['currentSource']): HDRTransferPreset {
  if (!source) return null;

  // File HDR path: transfer function is persisted in the decoded IPImage metadata.
  const fileSource = source.fileSourceNode as { getIPImage?: () => { metadata?: { transferFunction?: string } } | null } | undefined;
  const fileTF = normalizeHDRTransferPreset(fileSource?.getIPImage?.()?.metadata?.transferFunction);
  if (fileTF) return fileTF;

  // Video HDR path: read transfer from track/frame color-space metadata.
  const videoSource = source.videoSourceNode as {
    getVideoColorSpace?: () => { transfer?: string } | null;
    getCachedHDRIPImage?: (frame: number) => { metadata?: { transferFunction?: string } } | null;
  } | undefined;

  const videoTF = normalizeHDRTransferPreset(videoSource?.getVideoColorSpace?.()?.transfer);
  if (videoTF) return videoTF;

  const cachedTF = normalizeHDRTransferPreset(videoSource?.getCachedHDRIPImage?.(1)?.metadata?.transferFunction);
  if (cachedTF) return cachedTF;

  return null;
}

function getHDRAutoConfigState(context: SessionBridgeContext): HDRAutoConfigState {
  const existing = hdrAutoConfigStateByContext.get(context);
  if (existing) return existing;
  const next = { ...DEFAULT_HDR_AUTOCONFIG_STATE };
  hdrAutoConfigStateByContext.set(context, next);
  return next;
}

function applyAutoToneMappingPreset(
  context: SessionBridgeContext,
  autoState: HDRAutoConfigState,
  preset: AutoToneMappingPreset,
): void {
  context.getToneMappingControl().setState(preset);
  autoState.toneMappingAutoApplied = true;
  autoState.toneMappingAutoPreset = preset;
}

function applyAutoGamma(
  context: SessionBridgeContext,
  autoState: HDRAutoConfigState,
  gamma: number,
): void {
  context.getColorControls().setAdjustments({ gamma });
  autoState.gammaAutoApplied = true;
  autoState.gammaAutoValue = gamma;
}

function maybeResetAutoHDROverridesForSDR(
  context: SessionBridgeContext,
  autoState: HDRAutoConfigState,
): void {
  if (autoState.toneMappingAutoApplied && autoState.toneMappingAutoPreset) {
    const toneMappingControl = context.getToneMappingControl();
    const toneMapping = toneMappingControl.getState();
    const autoPreset = autoState.toneMappingAutoPreset;
    // Reset only when the auto-applied value is still in place.
    if (toneMapping.enabled === autoPreset.enabled && toneMapping.operator === autoPreset.operator) {
      toneMappingControl.setState({ enabled: false, operator: 'off' });
    }
    autoState.toneMappingAutoApplied = false;
    autoState.toneMappingAutoPreset = null;
  }

  if (autoState.gammaAutoApplied && autoState.gammaAutoValue !== null) {
    const colorControls = context.getColorControls();
    const currentGamma = colorControls.getAdjustments().gamma;
    // Reset only when the auto-applied value is still in place.
    if (currentGamma === autoState.gammaAutoValue && currentGamma !== 1) {
      colorControls.setAdjustments({ gamma: 1 });
    }
    autoState.gammaAutoApplied = false;
    autoState.gammaAutoValue = null;
  }
}

function isGainMapHDRFormat(formatName: string | undefined): boolean {
  return typeof formatName === 'string' && formatName.toLowerCase().includes('gainmap');
}

function syncScopesHeadroomAsync(
  context: SessionBridgeContext,
  sourceAtLoad: ReturnType<SessionBridgeContext['getSession']>['currentSource'],
  histogram: ReturnType<SessionBridgeContext['getHistogram']>,
): void {
  void queryHDRHeadroom()
    .then((headroom) => {
      if (typeof headroom !== 'number' || !Number.isFinite(headroom) || headroom <= 0) return;

      const session = context.getSession();
      // Ignore stale async responses after source changes.
      if (session.currentSource !== sourceAtLoad) return;

      const safeHeadroom = Math.max(headroom, 4.0);
      histogram.setHDRMode(true, safeHeadroom);
      histogram.setHDRAutoFit(true);
      setScopesHDRMode(true, safeHeadroom);
      setScopesHDRAutoFit(true);
      console.log(`[HDR] Applied async system headroom to scopes: ${safeHeadroom.toFixed(2)}x`);
    })
    .catch(() => {
      // No-op: unavailable API or permission denied.
    });
}

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
  const hdrAutoState = getHDRAutoConfigState(context);

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

  if (isHDR) {
    const formatName = source?.fileSourceNode?.formatName ?? 'unknown';
    const hdrTransferPreset = detectHDRTransferPreset(source);

    const isFileHDR = !!source?.fileSourceNode?.isHDR?.();
    const isGainMapHDR = isFileHDR && isGainMapHDRFormat(formatName);
    if (isHDRDisplay) {
      const glRenderer = viewer.getGLRenderer?.();
      const headroom = glRenderer?.getHDRHeadroom?.() ?? 4.0;

      if (hdrTransferPreset === 'hlg' || hdrTransferPreset === 'pq') {
        // HLG/PQ sources are already display-referred HDR presets.
        // Keep default tone mapping OFF, but user can enable it manually.
        console.log(`[HDR] ${hdrTransferPreset.toUpperCase()} preset on HDR display — defaulting tone mapping OFF`);
        applyAutoToneMappingPreset(context, hdrAutoState, { enabled: false, operator: 'off' });
      } else if (isGainMapHDR) {
        // Adaptive HDR gainmap stills are already authored for headroom-aware
        // display rendering. Keep tone mapping OFF by default to avoid applying
        // a second global curve (e.g. ACES), which diverges from macOS Preview.
        console.log(`[HDR] Gainmap HDR (${formatName}) on HDR display — defaulting tone mapping OFF`);
        applyAutoToneMappingPreset(context, hdrAutoState, { enabled: false, operator: 'off' });
      } else if (isFileHDR) {
        // Scene-linear HDR files (for example EXR) on HDR display have no
        // inherent dynamic-range compression. Content peaks (e.g. 20x SDR white)
        // often far exceed display headroom (3-6x). Without tone mapping,
        // mid-tones are crushed and highlights clip hard.
        console.log(`[HDR] HDR file (${formatName}) on HDR display — enabling ACES tone mapping`);
        applyAutoToneMappingPreset(context, hdrAutoState, { enabled: true, operator: 'aces' });
      } else {
        // HDR video with unknown transfer metadata: keep tone mapping off by default.
        console.log('[HDR] HDR video on HDR display (unknown transfer) — defaulting tone mapping OFF');
        applyAutoToneMappingPreset(context, hdrAutoState, { enabled: false, operator: 'off' });
      }

      histogram.setHDRMode(true, Math.max(headroom, 4.0));
      histogram.setHDRAutoFit(true);
      setScopesHDRMode(true, Math.max(headroom, 4.0));
      setScopesHDRAutoFit(true);
      syncScopesHeadroomAsync(context, source, histogram);
    } else {
      // SDR display: apply ACES tone mapping + gamma 2.2 to compress HDR to displayable range.
      // Scopes analyze the tone-mapped output which is SDR range (0-1.0).
      console.log(`[HDR] Detected HDR content (format: ${formatName}), SDR display — applying ACES + gamma 2.2`);
      applyAutoToneMappingPreset(context, hdrAutoState, { enabled: true, operator: 'aces' });
      applyAutoGamma(context, hdrAutoState, 2.2);
      histogram.setHDRMode(false);
      histogram.setHDRAutoFit(false);
      setScopesHDRMode(false);
      setScopesHDRAutoFit(false);
    }
  } else {
    // Leaving HDR content: clear only auto-applied HDR overrides to avoid
    // leaking them into SDR renders without clobbering manual user edits.
    maybeResetAutoHDROverridesForSDR(context, hdrAutoState);
    histogram.setHDRMode(false);
    histogram.setHDRAutoFit(false);
    setScopesHDRMode(false);
    setScopesHDRAutoFit(false);
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
