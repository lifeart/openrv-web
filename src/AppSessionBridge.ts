/**
 * AppSessionBridge - Extracted session event handlers and scope update logic from App
 *
 * Handles all Session event subscriptions (sourceLoaded, frameChanged, playbackChanged, etc.),
 * scope updates (histogram, waveform, vectorscope), info panel updates, EXR layer management,
 * stack control updates, HDR auto-config, and unsupported codec modals.
 *
 * This module acts as a thin coordinator, delegating to focused handler modules
 * under src/handlers/.
 */

import { Session } from './core/session/Session';
import type { SessionEvents } from './core/session/Session';
import type { Viewer } from './ui/components/Viewer';
import type { Histogram } from './ui/components/Histogram';
import type { Waveform } from './ui/components/Waveform';
import type { Vectorscope } from './ui/components/Vectorscope';
import type { GamutDiagram } from './ui/components/GamutDiagram';
import type { ScopesControl } from './ui/components/ScopesControl';
import type { InfoPanel } from './ui/components/InfoPanel';
import type { ChannelSelect } from './ui/components/ChannelSelect';
import type { StackControl } from './ui/components/StackControl';
import type { CropControl } from './ui/components/CropControl';
import type { OCIOControl } from './ui/components/OCIOControl';
import type { ToneMappingControl } from './ui/components/ToneMappingControl';
import type { ColorControls } from './ui/components/ColorControls';
import type { CompareControl } from './ui/components/CompareControl';
import type { FilterControl } from './ui/components/FilterControl';
import type { CDLControl } from './ui/components/CDLControl';
import type { TransformControl } from './ui/components/TransformControl';
import type { LensControl } from './ui/components/LensControl';
import type { StereoControl } from './ui/components/StereoControl';
import type { StereoEyeTransformControl } from './ui/components/StereoEyeTransformControl';
import type { StereoAlignControl } from './ui/components/StereoAlignControl';
import type { PaintEngine } from './paint/PaintEngine';
import type { AppPersistenceManager } from './AppPersistenceManager';
import type { EXRChannelRemapping } from './formats/EXRDecoder';

// Handler modules
import {
  updateHistogram as _updateHistogram,
  updateWaveform as _updateWaveform,
  updateVectorscope as _updateVectorscope,
  updateGamutDiagram as _updateGamutDiagram,
  createScopeScheduler,
} from './handlers/scopeHandlers';
import {
  updateInfoPanel as _updateInfoPanel,
  formatTimecode as _formatTimecode,
  formatDuration as _formatDuration,
} from './handlers/infoPanelHandlers';
import {
  handleSourceLoaded,
  updateStackControlSources as _updateStackControlSources,
  updateEXRLayers as _updateEXRLayers,
  handleEXRLayerChange as _handleEXRLayerChange,
} from './handlers/sourceLoadedHandlers';
import { handlePlaybackChanged } from './handlers/playbackHandlers';
import { bindPersistenceHandlers } from './handlers/persistenceHandlers';
import { bindCompareHandlers } from './handlers/compareHandlers';
import { showUnsupportedCodecModal } from './handlers/unsupportedCodecModal';

/**
 * Context interface for what AppSessionBridge needs from App.
 * Provides access to all controls and managers that session event handlers update.
 */
export interface SessionBridgeContext {
  getSession(): Session;
  getViewer(): Viewer;
  getPaintEngine(): PaintEngine;
  getPersistenceManager(): AppPersistenceManager;

  // Scope components
  getScopesControl(): ScopesControl;
  getHistogram(): Histogram;
  getWaveform(): Waveform;
  getVectorscope(): Vectorscope;
  getGamutDiagram(): GamutDiagram;

  // Info panel
  getInfoPanel(): InfoPanel;

  // Controls updated by session events
  getCropControl(): CropControl;
  getOCIOControl(): OCIOControl;
  getToneMappingControl(): ToneMappingControl;
  getColorControls(): ColorControls;
  getCompareControl(): CompareControl;
  getChannelSelect(): ChannelSelect;
  getStackControl(): StackControl;
  getFilterControl(): FilterControl;
  getCDLControl(): CDLControl;
  getTransformControl(): TransformControl;
  getLensControl(): LensControl;
  getStereoControl(): StereoControl;
  getStereoEyeTransformControl(): StereoEyeTransformControl;
  getStereoAlignControl(): StereoAlignControl;
}

export class AppSessionBridge {
  private context: SessionBridgeContext;
  private scopeScheduler: ReturnType<typeof createScopeScheduler>;
  private unsubscribers: Array<() => void> = [];
  private _onHistogramData: ((data: import('./ui/components/Histogram').HistogramData) => void) | null = null;

  constructor(context: SessionBridgeContext) {
    this.context = context;
    this.scopeScheduler = createScopeScheduler(context, {
      onHistogramData: (data) => this._onHistogramData?.(data),
    });
  }

  /** Set callback to receive histogram data after scope updates (for mini histogram in panels). */
  setHistogramDataCallback(cb: ((data: import('./ui/components/Histogram').HistogramData) => void) | null): void {
    this._onHistogramData = cb;
  }

  /**
   * Bind all session event handlers.
   * Called after all controls are created and layout is set up.
   */
  bindSessionEvents(): void {
    const session = this.context.getSession();

    // --- From createLayout(): scope/info updates on frame change ---

    this.on(session, 'frameChanged', () => {
      this.updateHistogram();
      this.updateWaveform();
      this.updateVectorscope();
      this.updateGamutDiagram();
      this.updateInfoPanel();
    });

    // --- Source loaded: update info panel, crop, OCIO, HDR auto-config, GTO, stack, prerender, EXR layers, scopes ---

    this.on(session, 'sourceLoaded', () => {
      handleSourceLoaded(
        this.context,
        () => this.updateInfoPanel(),
        () => this.updateStackControlSources(),
        () => this.updateEXRLayers(),
        () => this.updateHistogram(),
        () => this.updateWaveform(),
        () => this.updateVectorscope(),
        () => this.updateGamutDiagram()
      );
    });

    // --- Handle unsupported codec errors (ProRes, DNxHD, etc.) ---

    this.on(session, 'unsupportedCodec', (info) => {
      showUnsupportedCodecModal(info);
    });

    // --- Optimize scopes for playback ---

    this.on(session, 'playbackChanged', (isPlaying) => {
      handlePlaybackChanged(
        this.context,
        isPlaying,
        () => this.updateHistogram(),
        () => this.updateWaveform(),
        () => this.updateVectorscope(),
        () => this.updateGamutDiagram()
      );
    });

    // --- A/B availability and source switching ---

    bindCompareHandlers(
      this.context,
      session,
      (s, e, h) => this.on(s, e, h),
      () => this.updateEXRLayers()
    );

    // --- From bindEvents(): GTO/annotation handlers ---

    bindPersistenceHandlers(
      this.context,
      session,
      (s, e, h) => this.on(s, e, h),
      () => this.updateHistogram(),
      () => this.updateWaveform(),
      () => this.updateVectorscope(),
      () => this.updateGamutDiagram()
    );
  }

  /**
   * Schedule scope updates after the viewer has rendered.
   * Uses requestAnimationFrame to ensure updates happen after the render cycle.
   */
  scheduleUpdateScopes(): void {
    this.scopeScheduler.schedule();
  }

  /**
   * Update histogram with current frame data
   */
  updateHistogram(): void {
    _updateHistogram(this.context);
  }

  /**
   * Update waveform with current frame data
   */
  updateWaveform(): void {
    _updateWaveform(this.context);
  }

  /**
   * Update vectorscope with current frame data
   */
  updateVectorscope(): void {
    _updateVectorscope(this.context);
  }

  /**
   * Update gamut diagram with current frame data
   */
  updateGamutDiagram(): void {
    _updateGamutDiagram(this.context);
  }

  /**
   * Update info panel with current session data
   */
  updateInfoPanel(): void {
    _updateInfoPanel(this.context);
  }

  /**
   * Format frame number as timecode (HH:MM:SS:FF)
   */
  formatTimecode(frame: number, fps: number): string {
    return _formatTimecode(frame, fps);
  }

  /**
   * Format duration as HH:MM:SS
   */
  formatDuration(seconds: number): string {
    return _formatDuration(seconds);
  }

  /**
   * Update available sources for the stack control.
   * Called when sources are loaded or changed.
   */
  updateStackControlSources(): void {
    _updateStackControlSources(this.context);
  }

  /**
   * Update EXR layer information in ChannelSelect when a file is loaded
   */
  updateEXRLayers(): void {
    _updateEXRLayers(this.context);
  }

  /**
   * Handle EXR layer change from ChannelSelect
   */
  async handleEXRLayerChange(
    layerName: string | null,
    remapping: EXRChannelRemapping | null
  ): Promise<void> {
    return _handleEXRLayerChange(
      this.context,
      layerName,
      remapping,
      () => this.scheduleUpdateScopes()
    );
  }

  /**
   * Helper to register a session event handler and track it for cleanup.
   * Uses the unsubscribe function returned by EventEmitter.on().
   */
  private on<K extends keyof SessionEvents>(
    session: Session,
    event: K,
    handler: (data: SessionEvents[K]) => void
  ): void {
    const unsubscribe = session.on(event, handler);
    this.unsubscribers.push(unsubscribe);
  }

  /**
   * Unbind all session event handlers.
   */
  unbindSessionEvents(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }

  /**
   * Dispose: unbind all session events and clean up.
   */
  dispose(): void {
    this.unbindSessionEvents();
  }
}
