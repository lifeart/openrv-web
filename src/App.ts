import { Session, type UnsupportedCodecInfo } from './core/session/Session';
import { Viewer } from './ui/components/Viewer';
import { Timeline } from './ui/components/Timeline';
import { HeaderBar } from './ui/components/layout/HeaderBar';
import { TabBar, TabId } from './ui/components/layout/TabBar';
import { ContextToolbar } from './ui/components/layout/ContextToolbar';
import { PaintEngine } from './paint/PaintEngine';
import { PaintToolbar } from './ui/components/PaintToolbar';
import { ColorControls } from './ui/components/ColorControls';
import { TransformControl, DEFAULT_TRANSFORM } from './ui/components/TransformControl';
import { FilterControl } from './ui/components/FilterControl';
import { CropControl } from './ui/components/CropControl';
import { CDLControl } from './ui/components/CDLControl';
import { CurvesControl } from './ui/components/CurvesControl';
import { LensControl } from './ui/components/LensControl';
import { StackControl } from './ui/components/StackControl';
import { ChannelSelect } from './ui/components/ChannelSelect';
import { StereoControl } from './ui/components/StereoControl';
import { Histogram } from './ui/components/Histogram';
import { Waveform } from './ui/components/Waveform';
import { Vectorscope } from './ui/components/Vectorscope';
import { ZoomControl } from './ui/components/ZoomControl';
import { ScopesControl } from './ui/components/ScopesControl';
import { CompareControl } from './ui/components/CompareControl';
import { SafeAreasControl } from './ui/components/SafeAreasControl';
import { FalseColorControl } from './ui/components/FalseColorControl';
import { LuminanceVisualizationControl } from './ui/components/LuminanceVisualizationControl';
import { ToneMappingControl } from './ui/components/ToneMappingControl';
import { ZebraControl } from './ui/components/ZebraControl';
import { HSLQualifierControl } from './ui/components/HSLQualifierControl';
import { GhostFrameControl } from './ui/components/GhostFrameControl';
import { PARControl } from './ui/components/PARControl';
import { BackgroundPatternControl } from './ui/components/BackgroundPatternControl';
import { OCIOControl } from './ui/components/OCIOControl';
import { OCIOState } from './color/OCIOConfig';
import { DisplayProfileControl } from './ui/components/DisplayProfileControl';
import { exportSequence } from './utils/SequenceExporter';
import { showAlert, showModal, closeModal, showConfirm } from './ui/components/shared/Modal';
import { SessionSerializer } from './core/session/SessionSerializer';
import { SessionGTOExporter } from './core/session/SessionGTOExporter';
import { SessionGTOStore } from './core/session/SessionGTOStore';
import { KeyboardManager, KeyCombination } from './utils/KeyboardManager';
import { DEFAULT_KEY_BINDINGS, describeKeyCombo } from './utils/KeyBindings';
import { CustomKeyBindingsManager } from './utils/CustomKeyBindingsManager';
import { getGlobalHistoryManager } from './utils/HistoryManager';
import { getThemeManager } from './utils/ThemeManager';
import { HistoryPanel } from './ui/components/HistoryPanel';
import { InfoPanel } from './ui/components/InfoPanel';
import { MarkerListPanel } from './ui/components/MarkerListPanel';
import { CacheIndicator } from './ui/components/CacheIndicator';
import { TextFormattingToolbar } from './ui/components/TextFormattingToolbar';
import { AutoSaveManager } from './core/session/AutoSaveManager';
import { AutoSaveIndicator } from './ui/components/AutoSaveIndicator';
import { SnapshotManager } from './core/session/SnapshotManager';
import { SnapshotPanel } from './ui/components/SnapshotPanel';
import { PlaylistManager } from './core/session/PlaylistManager';
import { PlaylistPanel } from './ui/components/PlaylistPanel';
import { FullscreenManager } from './utils/FullscreenManager';
import { PresentationMode } from './utils/PresentationMode';
import { NetworkSyncManager } from './network/NetworkSyncManager';
import { NetworkControl } from './ui/components/NetworkControl';
import { ColorInversionToggle } from './ui/components/ColorInversionToggle';
import type { OpenRVAPIConfig } from './api/OpenRVAPI';

export class App {
  private container: HTMLElement | null = null;
  private session: Session;
  private viewer: Viewer;
  private timeline: Timeline;
  private headerBar: HeaderBar;
  private tabBar: TabBar;
  private contextToolbar: ContextToolbar;
  private paintEngine: PaintEngine;
  private paintToolbar: PaintToolbar;
  private colorControls: ColorControls;
  private gtoStore: SessionGTOStore | null = null;
  private transformControl: TransformControl;
  private filterControl: FilterControl;
  private cropControl: CropControl;
  private cdlControl: CDLControl;
  private curvesControl: CurvesControl;
  private lensControl: LensControl;
  private stackControl: StackControl;
  private channelSelect: ChannelSelect;
  private stereoControl: StereoControl;
  private histogram: Histogram;
  private waveform: Waveform;
  private vectorscope: Vectorscope;
  private zoomControl: ZoomControl;
  private scopesControl: ScopesControl;
  private compareControl: CompareControl;
  private safeAreasControl: SafeAreasControl;
  private falseColorControl: FalseColorControl;
  private luminanceVisControl: LuminanceVisualizationControl;
  private toneMappingControl: ToneMappingControl;
  private zebraControl: ZebraControl;
  private hslQualifierControl: HSLQualifierControl;
  private ghostFrameControl: GhostFrameControl;
  private parControl: PARControl;
  private backgroundPatternControl: BackgroundPatternControl;
  private ocioControl: OCIOControl;
  private displayProfileControl: DisplayProfileControl;
  private animationId: number | null = null;
  private boundHandleResize: () => void;
  private boundHandleVisibilityChange: () => void;
  private wasPlayingBeforeHide = false;
  private keyboardManager: KeyboardManager;
  private customKeyBindingsManager: CustomKeyBindingsManager;
  private historyPanel: HistoryPanel;
  private infoPanel: InfoPanel;
  private markerListPanel: MarkerListPanel;
  private cacheIndicator: CacheIndicator;
  private textFormattingToolbar: TextFormattingToolbar;
  private autoSaveManager: AutoSaveManager;
  private autoSaveIndicator: AutoSaveIndicator;
  private snapshotManager: SnapshotManager;
  private snapshotPanel: SnapshotPanel;
  private playlistManager: PlaylistManager;
  private playlistPanel: PlaylistPanel;
  private fullscreenManager!: FullscreenManager;
  private presentationMode: PresentationMode;
  private networkSyncManager: NetworkSyncManager;
  private networkControl: NetworkControl;
  private colorInversionToggle: ColorInversionToggle;

  // History recording state
  private colorHistoryTimer: ReturnType<typeof setTimeout> | null = null;
  private colorHistoryPrevious: ReturnType<ColorControls['getAdjustments']> | null = null;
  private transformHistoryPrevious: ReturnType<TransformControl['getTransform']> | null = null;

  // Layer counter - only increments, never decreases (even when layers are removed)
  private nextLayerNumber = 1;

  constructor() {
    // Bind event handlers for proper cleanup
    this.boundHandleResize = () => this.viewer.resize();
    this.boundHandleVisibilityChange = this.handleVisibilityChange.bind(this);

    this.session = new Session();
    this.paintEngine = new PaintEngine();
    this.viewer = new Viewer(this.session, this.paintEngine);
    this.timeline = new Timeline(this.session, this.paintEngine);
    this.cacheIndicator = new CacheIndicator(this.session, this.viewer);

    // Create HeaderBar (contains file ops, playback, volume, export, help)
    this.headerBar = new HeaderBar(this.session);
    this.headerBar.on('showShortcuts', () => this.showShortcuts());
    this.headerBar.on('showCustomKeyBindings', () => this.showCustomKeyBindings());
    this.headerBar.on('saveProject', () => this.saveProject());
    this.headerBar.on('openProject', (file) => this.openProject(file));

    // Create AutoSave Manager and Indicator
    this.autoSaveManager = new AutoSaveManager();
    this.autoSaveIndicator = new AutoSaveIndicator();
    this.autoSaveIndicator.connect(this.autoSaveManager);
    this.autoSaveIndicator.setRetryCallback(() => this.retryAutoSave());
    this.headerBar.setAutoSaveIndicator(this.autoSaveIndicator.render());

    // Create TabBar and ContextToolbar
    this.tabBar = new TabBar();
    this.contextToolbar = new ContextToolbar();
    this.tabBar.on('tabChanged', (tabId: TabId) => {
      this.contextToolbar.setActiveTab(tabId);
      this.onTabChanged(tabId);
    });

    this.paintToolbar = new PaintToolbar(this.paintEngine);
    this.colorControls = new ColorControls();
    this.colorInversionToggle = new ColorInversionToggle();

    // Connect color inversion toggle to viewer
    this.colorInversionToggle.on('inversionChanged', (enabled) => {
      this.viewer.setColorInversion(enabled);
      this.scheduleUpdateScopes();
    });

    // Initialize color history with current (default) state
    this.colorHistoryPrevious = this.colorControls.getAdjustments();

    // Connect color controls to viewer with history recording
    this.colorControls.on('adjustmentsChanged', (adjustments) => {
      this.viewer.setColorAdjustments(adjustments);
      this.scheduleUpdateScopes();
      this.syncGTOStore();

      // Debounced history recording - records after user stops adjusting for 500ms
      if (this.colorHistoryTimer) {
        clearTimeout(this.colorHistoryTimer);
      }

      const previousSnapshot = { ...this.colorHistoryPrevious! };
      this.colorHistoryTimer = setTimeout(() => {
        const currentSnapshot = this.colorControls.getAdjustments();

        // Find what changed for the description
        const changes: string[] = [];
        for (const key of Object.keys(currentSnapshot) as Array<keyof typeof currentSnapshot>) {
          if (previousSnapshot[key] !== currentSnapshot[key]) {
            changes.push(key);
          }
        }

        if (changes.length > 0) {
          const description = changes.length === 1
            ? `Adjust ${changes[0]}`
            : `Adjust ${changes.length} color settings`;

          const historyManager = getGlobalHistoryManager();
          historyManager.recordAction(
            description,
            'color',
            () => {
              // Restore previous state
              this.colorControls.setAdjustments(previousSnapshot);
              this.viewer.setColorAdjustments(previousSnapshot);
              this.scheduleUpdateScopes();
            },
            () => {
              // Redo to current state
              this.colorControls.setAdjustments(currentSnapshot);
              this.viewer.setColorAdjustments(currentSnapshot);
              this.scheduleUpdateScopes();
            }
          );
        }

        this.colorHistoryPrevious = currentSnapshot;
        this.colorHistoryTimer = null;
      }, 500);
    });

    // Connect LUT events
    this.colorControls.on('lutLoaded', (lut) => {
      this.viewer.setLUT(lut);
      this.scheduleUpdateScopes();
    });
    this.colorControls.on('lutIntensityChanged', (intensity) => {
      this.viewer.setLUTIntensity(intensity);
      this.scheduleUpdateScopes();
    });

    // Initialize new grouped View tab controls
    this.zoomControl = new ZoomControl();
    this.zoomControl.on('zoomChanged', (zoom) => {
      if (zoom === 'fit') {
        this.viewer.smoothFitToWindow();
      } else {
        this.viewer.smoothSetZoom(zoom);
      }
    });

    this.scopesControl = new ScopesControl();
    this.scopesControl.on('scopeToggled', ({ scope, visible }) => {
      if (scope === 'histogram') {
        if (visible) {
          this.histogram.show();
          this.updateHistogram();
        } else {
          this.histogram.hide();
        }
      } else if (scope === 'waveform') {
        if (visible) {
          this.waveform.show();
          this.updateWaveform();
        } else {
          this.waveform.hide();
        }
      } else if (scope === 'vectorscope') {
        if (visible) {
          this.vectorscope.show();
          this.updateVectorscope();
        } else {
          this.vectorscope.hide();
        }
      }
      this.syncGTOStore();
    });

    this.compareControl = new CompareControl();
    this.compareControl.on('wipeModeChanged', (mode) => {
      this.viewer.setWipeState({
        mode,
        position: this.compareControl.getWipePosition(),
        showOriginal: mode === 'horizontal' ? 'left' : 'top',
      });
    });
    this.compareControl.on('wipePositionChanged', (position) => {
      const mode = this.compareControl.getWipeMode();
      this.viewer.setWipeState({
        mode,
        position,
        showOriginal: mode === 'horizontal' ? 'left' : 'top',
      });
    });
    this.compareControl.on('abSourceChanged', (source) => {
      this.session.setCurrentAB(source);
    });
    // Note: abToggled is fired after setABSource already emitted abSourceChanged,
    // so the toggle has already happened via session.setCurrentAB(). This event
    // is just for notification/analytics purposes - do not call session.toggleAB()
    // again or it will double-toggle.
    this.compareControl.on('abToggled', () => {
      // Toggle already handled via abSourceChanged -> session.setCurrentAB()
    });
    this.compareControl.on('differenceMatteChanged', (state) => {
      this.viewer.setDifferenceMatteState(state);
    });

    // Safe Areas control
    this.safeAreasControl = new SafeAreasControl(this.viewer.getSafeAreasOverlay());
    this.falseColorControl = new FalseColorControl(this.viewer.getFalseColor());
    this.luminanceVisControl = new LuminanceVisualizationControl(this.viewer.getLuminanceVisualization());
    this.toneMappingControl = new ToneMappingControl();
    this.toneMappingControl.on('stateChanged', (state) => {
      this.viewer.setToneMappingState(state);
      this.scheduleUpdateScopes();
    });
    this.zebraControl = new ZebraControl(this.viewer.getZebraStripes());
    this.hslQualifierControl = new HSLQualifierControl(this.viewer.getHSLQualifier());

    // Ghost Frame control
    this.ghostFrameControl = new GhostFrameControl();
    this.ghostFrameControl.on('stateChanged', (state) => {
      this.viewer.setGhostFrameState(state);
    });

    // Pixel Aspect Ratio control
    this.parControl = new PARControl();
    this.parControl.on('stateChanged', (state) => {
      this.viewer.setPARState(state);
    });

    // Background Pattern control
    this.backgroundPatternControl = new BackgroundPatternControl();
    this.backgroundPatternControl.on('stateChanged', (state) => {
      this.viewer.setBackgroundPatternState(state);
    });

    // OCIO color management control
    this.ocioControl = new OCIOControl();
    this.ocioControl.on('stateChanged', (state) => {
      this.updateOCIOPipeline(state);
      this.scheduleUpdateScopes();
      this.syncGTOStore();
    });

    // Display profile control (display color management - final pipeline stage)
    this.displayProfileControl = new DisplayProfileControl();
    this.displayProfileControl.on('displayStateChanged', (state) => {
      this.viewer.setDisplayColorState(state);
      this.scheduleUpdateScopes();
    });

    // Presentation mode
    this.presentationMode = new PresentationMode();
    this.presentationMode.loadPreference();
    this.presentationMode.on('stateChanged', (state) => {
      this.headerBar.setPresentationState(state.enabled);
    });

    // Network Sync
    this.networkSyncManager = new NetworkSyncManager();
    this.networkControl = new NetworkControl();
    this.setupNetworkSync();

    // Wire up fullscreen and presentation toggle from HeaderBar
    this.headerBar.on('fullscreenToggle', () => {
      this.fullscreenManager?.toggle();
    });
    this.headerBar.on('presentationToggle', () => {
      this.presentationMode.toggle();
    });

    // Connect volume control (from HeaderBar) to session (bidirectional)
    const volumeControl = this.headerBar.getVolumeControl();
    volumeControl.on('volumeChanged', (volume) => {
      this.session.volume = volume;
    });
    volumeControl.on('mutedChanged', (muted) => {
      this.session.muted = muted;
    });
    // Sync back from Session to VolumeControl (for external changes)
    this.session.on('volumeChanged', (volume) => {
      volumeControl.syncVolume(volume);
    });
    this.session.on('mutedChanged', (muted) => {
      volumeControl.syncMuted(muted);
    });

    // Connect export control (from HeaderBar) to viewer
    const exportControl = this.headerBar.getExportControl();
    exportControl.on('exportRequested', ({ format, includeAnnotations, quality }) => {
      this.viewer.exportFrame(format, includeAnnotations, quality);
    });
    exportControl.on('copyRequested', () => {
      this.viewer.copyFrameToClipboard(true);
    });
    exportControl.on('sequenceExportRequested', (request) => {
      this.handleSequenceExport(request);
    });
    exportControl.on('rvSessionExportRequested', ({ format }) => {
      this.saveRvSession(format);
    });

    // Initialize transform control with history recording
    this.transformControl = new TransformControl();
    this.transformControl.on('transformChanged', (transform) => {
      const previousTransform = this.transformHistoryPrevious ?? DEFAULT_TRANSFORM;
      const currentTransform = { ...transform };

      this.viewer.setTransform(transform);
      this.syncGTOStore();

      // Record history for transform changes (discrete actions, no debounce needed)
      const changes: string[] = [];
      if (previousTransform.rotation !== currentTransform.rotation) {
        changes.push(`rotation to ${currentTransform.rotation}°`);
      }
      if (previousTransform.flipH !== currentTransform.flipH) {
        changes.push(currentTransform.flipH ? 'flip horizontal' : 'unflip horizontal');
      }
      if (previousTransform.flipV !== currentTransform.flipV) {
        changes.push(currentTransform.flipV ? 'flip vertical' : 'unflip vertical');
      }

      if (changes.length > 0) {
        const description = changes.length === 1
          ? changes[0]!.charAt(0).toUpperCase() + changes[0]!.slice(1)
          : 'Transform image';

        const historyManager = getGlobalHistoryManager();
        historyManager.recordAction(
          description,
          'transform',
          () => {
            this.transformControl.setTransform(previousTransform);
            this.viewer.setTransform(previousTransform);
          },
          () => {
            this.transformControl.setTransform(currentTransform);
            this.viewer.setTransform(currentTransform);
          }
        );
      }

      this.transformHistoryPrevious = currentTransform;
    });

    // Initialize filter control
    this.filterControl = new FilterControl();
    this.filterControl.on('filtersChanged', (settings) => {
      this.viewer.setFilterSettings(settings);
      this.scheduleUpdateScopes();
      this.syncGTOStore();
    });

    // Initialize crop control
    this.cropControl = new CropControl();
    this.cropControl.on('cropStateChanged', (state) => {
      this.viewer.setCropState(state);
      this.syncGTOStore();
    });
    this.cropControl.on('cropModeToggled', (enabled) => {
      this.viewer.setCropEnabled(enabled);
    });
    this.cropControl.on('panelToggled', (isOpen) => {
      this.viewer.setCropPanelOpen(isOpen);
    });
    this.cropControl.on('uncropStateChanged', (state) => {
      this.viewer.setUncropState(state);
      this.syncGTOStore();
    });

    // Handle crop region changes from Viewer (when user drags crop handles)
    this.viewer.setOnCropRegionChanged((region) => {
      this.cropControl.setCropRegion(region);
      this.syncGTOStore();
    });

    // Initialize CDL control
    this.cdlControl = new CDLControl();
    this.cdlControl.on('cdlChanged', (cdl) => {
      this.viewer.setCDL(cdl);
      this.scheduleUpdateScopes();
    });

    // Initialize curves control
    this.curvesControl = new CurvesControl();
    this.curvesControl.on('curvesChanged', (curves) => {
      this.viewer.setCurves(curves);
      this.scheduleUpdateScopes();
    });

    // Initialize lens distortion control
    this.lensControl = new LensControl();
    this.lensControl.on('lensChanged', (params) => {
      this.viewer.setLensParams(params);
      this.scheduleUpdateScopes();
      this.syncGTOStore();
    });

    // Initialize stack/composite control
    this.stackControl = new StackControl();
    this.stackControl.on('layerAdded', (layer) => {
      // When adding a layer, use the current source index
      layer.sourceIndex = this.session.currentSourceIndex;
      // Use incrementing layer number that never decreases (even when layers are removed)
      layer.name = `Layer ${this.nextLayerNumber++}`;
      this.stackControl.updateLayerSource(layer.id, layer.sourceIndex);
      this.stackControl.updateLayerName(layer.id, layer.name);
      this.viewer.setStackLayers(this.stackControl.getLayers());
      this.scheduleUpdateScopes();
    });
    this.stackControl.on('layerChanged', () => {
      this.viewer.setStackLayers(this.stackControl.getLayers());
      this.scheduleUpdateScopes();
    });
    this.stackControl.on('layerRemoved', () => {
      this.viewer.setStackLayers(this.stackControl.getLayers());
      this.scheduleUpdateScopes();
    });
    this.stackControl.on('layerReordered', () => {
      this.viewer.setStackLayers(this.stackControl.getLayers());
      this.scheduleUpdateScopes();
    });
    this.stackControl.on('layerSourceChanged', ({ layerId, sourceIndex }) => {
      this.stackControl.updateLayerSource(layerId, sourceIndex);
      // Don't update layer name - keep the original "Layer N" name
      this.viewer.setStackLayers(this.stackControl.getLayers());
      this.scheduleUpdateScopes();
    });

    // Initialize channel select control
    this.channelSelect = new ChannelSelect();
    this.channelSelect.on('channelChanged', (channel) => {
      this.viewer.setChannelMode(channel);
      this.scheduleUpdateScopes();
      this.syncGTOStore();
    });
    this.channelSelect.on('layerChanged', async (event) => {
      // Handle EXR layer change
      await this.handleEXRLayerChange(event.layer, event.remapping);
    });

    // Initialize stereo control
    this.stereoControl = new StereoControl();
    this.stereoControl.on('stateChanged', (state) => {
      this.viewer.setStereoState(state);
      this.scheduleUpdateScopes();
      this.syncGTOStore();
    });

    // Initialize histogram
    this.histogram = new Histogram();

    // Initialize waveform
    this.waveform = new Waveform();

    // Initialize vectorscope
    this.vectorscope = new Vectorscope();

    // Initialize keyboard manager
    this.keyboardManager = new KeyboardManager();
    this.setupKeyboardShortcuts();

    // Initialize custom key bindings manager
    this.customKeyBindingsManager = new CustomKeyBindingsManager(() => {
      this.refreshKeyboardShortcuts();
    });

    // Apply any stored custom bindings to the keyboard shortcuts
    this.refreshKeyboardShortcuts();

    // Initialize history panel with global history manager
    this.historyPanel = new HistoryPanel(getGlobalHistoryManager());

    // Initialize info panel
    this.infoPanel = new InfoPanel();

    // Initialize marker list panel
    this.markerListPanel = new MarkerListPanel(this.session);

    // Initialize snapshot manager and panel
    this.snapshotManager = new SnapshotManager();
    this.snapshotPanel = new SnapshotPanel(this.snapshotManager);
    this.snapshotPanel.on('restoreRequested', ({ id }) => this.restoreSnapshot(id));

    // Initialize playlist manager and panel
    this.playlistManager = new PlaylistManager();
    this.playlistPanel = new PlaylistPanel(this.playlistManager);
    this.playlistPanel.on('addCurrentSource', () => this.addCurrentSourceToPlaylist());
    this.playlistPanel.on('clipSelected', ({ sourceIndex, frame }) => {
      this.jumpToPlaylistClip(sourceIndex, frame);
    });

    // Initialize text formatting toolbar
    this.textFormattingToolbar = new TextFormattingToolbar(
      this.paintEngine,
      () => this.session.currentFrame
    );
  }

  async mount(selector: string): Promise<void> {
    this.container = document.querySelector(selector);
    if (!this.container) {
      throw new Error(`Container not found: ${selector}`);
    }

    this.createLayout();
    this.bindEvents();
    this.start();

    // Initialize OCIO pipeline from persisted state (if OCIO was enabled before page reload)
    this.updateOCIOPipeline(this.ocioControl.getState());

    // Initialize display profile from persisted state
    this.viewer.setDisplayColorState(this.displayProfileControl.getState());

    // Initialize auto-save and check for recovery
    await this.initAutoSave();

    // Initialize snapshot manager
    await this.initSnapshots();
  }

  /**
   * Initialize snapshot system
   */
  private async initSnapshots(): Promise<void> {
    try {
      await this.snapshotManager.initialize();
    } catch (err) {
      console.error('Snapshot manager initialization failed:', err);
    }
  }

  /**
   * Initialize auto-save system and handle crash recovery
   */
  private async initAutoSave(): Promise<void> {
    try {
      // Listen for storage warnings
      this.autoSaveManager.on('storageWarning', (info) => {
        showAlert(
          `Storage space is running low (${info.percentUsed}% used). Consider clearing old auto-saves or freeing up browser storage.`,
          { type: 'warning', title: 'Storage Warning' }
        );
      });

      const hasRecovery = await this.autoSaveManager.initialize();

      if (hasRecovery) {
        // Show recovery prompt
        const entries = await this.autoSaveManager.listAutoSaves();
        const mostRecent = entries[0];
        if (mostRecent) {
          const savedTime = new Date(mostRecent.savedAt).toLocaleString();

          const recover = await showConfirm(
            `A previous session "${mostRecent.name}" was found from ${savedTime}. Would you like to recover it?`,
            {
              title: 'Recover Session',
              confirmText: 'Recover',
              cancelText: 'Discard',
            }
          );

          if (recover) {
            await this.recoverAutoSave(mostRecent.id);
          } else {
            // Clear old auto-saves if user discards
            await this.autoSaveManager.clearAll();
          }
        }
      }
    } catch (err) {
      console.error('Auto-save initialization failed:', err);
    }
  }

  /**
   * Recover session from auto-save
   */
  private async recoverAutoSave(id: string): Promise<void> {
    try {
      const state = await this.autoSaveManager.getAutoSave(id);
      if (state) {
        const { loadedMedia, warnings } = await SessionSerializer.fromJSON(state, {
          session: this.session,
          paintEngine: this.paintEngine,
          viewer: this.viewer,
        });

        // Update UI controls with restored state
        this.colorControls.setAdjustments(state.color);
        this.cdlControl.setCDL(state.cdl);
        this.filterControl.setSettings(state.filters);
        this.transformControl.setTransform(state.transform);
        this.cropControl.setState(state.crop);
        this.lensControl.setParams(state.lens);
        // Note: wipe state is restored via viewer.setWipeState in SessionSerializer.fromJSON

        if (warnings.length > 0) {
          showAlert(`Session recovered with ${warnings.length} warning(s):\n${warnings.join('\n')}`, {
            title: 'Recovery Warnings',
            type: 'warning',
          });
        } else if (loadedMedia > 0) {
          showAlert(`Session recovered successfully with ${loadedMedia} media file(s).`, {
            title: 'Recovery Complete',
            type: 'success',
          });
        }

        // Clear the recovered entry
        await this.autoSaveManager.deleteAutoSave(id);
      }
    } catch (err) {
      showAlert(`Failed to recover session: ${err}`, {
        title: 'Recovery Failed',
        type: 'error',
      });
    }
  }

  private createLayout(): void {
    if (!this.container) return;

    // === HEADER BAR (file ops, playback, volume, help) ===
    const headerBarEl = this.headerBar.render();

    // === TAB BAR (View | Color | Effects | Transform | Annotate) ===
    const tabBarEl = this.tabBar.render();

    // === CONTEXT TOOLBAR (changes based on active tab) ===
    const contextToolbarEl = this.contextToolbar.render();

    // Setup tab contents
    this.setupTabContents();

    const viewerEl = this.viewer.getElement();
    const timelineEl = this.timeline.render();
    const cacheIndicatorEl = this.cacheIndicator.getElement();

    this.container.appendChild(headerBarEl);
    this.container.appendChild(tabBarEl);
    this.container.appendChild(contextToolbarEl);
    this.container.appendChild(viewerEl);
    this.container.appendChild(cacheIndicatorEl);
    this.container.appendChild(timelineEl);

    // Initialize FullscreenManager with the app container
    this.fullscreenManager = new FullscreenManager(this.container);
    this.fullscreenManager.on('fullscreenChanged', (isFullscreen) => {
      this.headerBar.setFullscreenState(isFullscreen);
      // Trigger layout recalculation after fullscreen change.
      // Use rAF to wait for the browser to settle the layout, then
      // dispatch a resize event so all components (viewer, timeline)
      // that listen on window 'resize' recalculate their dimensions.
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    });

    // Set elements to hide in presentation mode
    this.presentationMode.setElementsToHide([
      headerBarEl,
      tabBarEl,
      contextToolbarEl,
      cacheIndicatorEl,
      timelineEl,
    ]);

    // Add histogram overlay to viewer container
    this.viewer.getContainer().appendChild(this.histogram.render());

    // Add waveform overlay to viewer container
    this.viewer.getContainer().appendChild(this.waveform.render());

    // Add curves control overlay to viewer container
    this.viewer.getContainer().appendChild(this.curvesControl.render());

    // Add vectorscope overlay to viewer container
    this.viewer.getContainer().appendChild(this.vectorscope.render());

    // Add history panel to viewer container
    this.viewer.getContainer().appendChild(this.historyPanel.getElement());

    // Add info panel to viewer container
    this.viewer.getContainer().appendChild(this.infoPanel.getElement());

    // Add marker list panel to viewer container
    this.viewer.getContainer().appendChild(this.markerListPanel.getElement());

    // Wire up cursor color updates from viewer to info panel
    this.viewer.onCursorColorChange((color, position) => {
      if (this.infoPanel.isEnabled()) {
        this.infoPanel.update({
          colorAtCursor: color,
          cursorPosition: position,
        });
      }
    });

    // Update histogram, waveform, and vectorscope when frame changes or media loads
    this.session.on('frameChanged', () => {
      this.updateHistogram();
      this.updateWaveform();
      this.updateVectorscope();
      this.updateInfoPanel();
    });
    this.session.on('sourceLoaded', () => {
      this.updateInfoPanel();
      // Update crop control with new source dimensions for correct aspect ratio computation
      const source = this.session.currentSource;
      if (source) {
        this.cropControl.setSourceDimensions(source.width, source.height);
      }
      // GTO store and stack updates
      if (!this.session.gtoData) {
        this.gtoStore = null;
      }
      this.updateStackControlSources();
      this.viewer.initPrerenderBuffer();
      // Update EXR layer selector if this is an EXR file with multiple layers
      this.updateEXRLayers();
      // Small delay to allow canvas to render before updating scopes
      setTimeout(() => {
        this.updateHistogram();
        this.updateWaveform();
        this.updateVectorscope();
      }, 100);
    });

    // Handle unsupported codec errors (ProRes, DNxHD, etc.)
    this.session.on('unsupportedCodec', (info) => {
      this.showUnsupportedCodecModal(info);
    });

    // Optimize scopes for playback: use aggressive subsampling during playback,
    // full quality when paused
    this.session.on('playbackChanged', (isPlaying) => {
      this.histogram.setPlaybackMode(isPlaying);
      this.waveform.setPlaybackMode(isPlaying);
      this.vectorscope.setPlaybackMode(isPlaying);

      // Update prerender buffer playback state
      const playDirection = this.session.playDirection;
      this.viewer.updatePrerenderPlaybackState(isPlaying, playDirection);

      // Playback preload state management:
      // - START: Handled in Session.play() which calls videoSourceNode.startPlaybackPreload()
      //   This is done there because Session has immediate access to playback direction and
      //   needs to initiate preloading before the first update() call for seamless playback.
      // - STOP: Handled here via the event because App needs to coordinate with scope updates.
      //   When playback stops, we switch to scrub mode (symmetric preloading) and refresh
      //   scopes at full quality - both actions are App-level concerns.
      const source = this.session.currentSource;
      if (!isPlaying && source?.videoSourceNode) {
        source.videoSourceNode.stopPlaybackPreload();
      }

      // When playback stops, update scopes with full quality
      if (!isPlaying) {
        this.updateHistogram();
        this.updateWaveform();
        this.updateVectorscope();
      }
    });

    // Handle clear frame event from paint toolbar
    const paintToolbarEl = this.paintToolbar.render();
    paintToolbarEl.addEventListener('clearFrame', () => {
      this.paintEngine.clearFrame(this.session.currentFrame);
    });
  }

  private setupTabContents(): void {
    // === VIEW TAB ===
    // Organized into 5 logical groups with minimal dividers for compact layout
    // Groups: Navigation | Comparison | Monitoring | Analysis | Overlays
    const viewContent = document.createElement('div');
    viewContent.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-shrink: 0;';

    // --- GROUP 1: Navigation (Zoom + Channel) ---
    viewContent.appendChild(this.zoomControl.render());
    viewContent.appendChild(this.channelSelect.render());
    viewContent.appendChild(ContextToolbar.createDivider());

    // --- GROUP 2: Comparison (Compare + Stereo + Ghost) ---
    viewContent.appendChild(this.compareControl.render());
    viewContent.appendChild(this.stereoControl.render());
    viewContent.appendChild(this.ghostFrameControl.render());
    viewContent.appendChild(ContextToolbar.createDivider());

    // --- GROUP 3: Monitoring (Scopes + Stack) ---
    viewContent.appendChild(this.scopesControl.render());
    viewContent.appendChild(this.stackControl.render());
    viewContent.appendChild(ContextToolbar.createDivider());

    // --- GROUP 4: Analysis Tools (SafeAreas, FalseColor, ToneMapping, Zebra, HSL, PAR) ---
    viewContent.appendChild(this.safeAreasControl.render());
    viewContent.appendChild(this.falseColorControl.render());
    viewContent.appendChild(this.luminanceVisControl.render());
    viewContent.appendChild(this.toneMappingControl.render());
    viewContent.appendChild(this.zebraControl.render());
    viewContent.appendChild(this.hslQualifierControl.render());
    viewContent.appendChild(this.parControl.render());
    viewContent.appendChild(this.backgroundPatternControl.render());
    viewContent.appendChild(this.displayProfileControl.render());

    // Trigger re-render when false color state changes
    this.viewer.getFalseColor().on('stateChanged', () => {
      this.viewer.refresh();
    });

    // Add luminance visualization badge to canvas overlay
    const lumVisBadge = this.luminanceVisControl.createBadge();
    this.viewer.getCanvasContainer().appendChild(lumVisBadge);

    // Setup eyedropper for color picking from viewer
    this.hslQualifierControl.setEyedropperCallback((active) => {
      const viewerContainer = this.viewer.getContainer();
      if (active) {
        // Set cursor to crosshair when eyedropper is active
        viewerContainer.style.cursor = 'crosshair';
        // Add click handler for color picking
        const clickHandler = (e: MouseEvent) => {
          const rect = viewerContainer.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const imageData = this.viewer.getImageData();
          if (imageData) {
            const canvas = viewerContainer.querySelector('canvas');
            if (canvas) {
              const scaleX = imageData.width / canvas.clientWidth;
              const scaleY = imageData.height / canvas.clientHeight;
              const pixelX = Math.floor(x * scaleX);
              const pixelY = Math.floor(y * scaleY);
              if (pixelX >= 0 && pixelX < imageData.width && pixelY >= 0 && pixelY < imageData.height) {
                const idx = (pixelY * imageData.width + pixelX) * 4;
                const r = imageData.data[idx]!;
                const g = imageData.data[idx + 1]!;
                const b = imageData.data[idx + 2]!;
                this.viewer.getHSLQualifier().pickColor(r, g, b);
              }
            }
          }
          // Deactivate eyedropper after picking
          this.hslQualifierControl.deactivateEyedropper();
          viewerContainer.style.cursor = '';
          viewerContainer.removeEventListener('click', clickHandler);
        };
        viewerContainer.addEventListener('click', clickHandler, { once: true });
      } else {
        viewerContainer.style.cursor = '';
      }
    });

    viewContent.appendChild(ContextToolbar.createDivider());

    // --- GROUP 5: Overlay Toggles (Probe, Spotlight, Info) ---
    // Icon-only buttons for compact display

    // Pixel Probe / Color Sampler toggle
    const pixelProbeButton = ContextToolbar.createIconButton('eyedropper', () => {
      this.viewer.getPixelProbe().toggle();
    }, { title: 'Pixel Probe (Shift+I)' });
    pixelProbeButton.dataset.testid = 'pixel-probe-toggle';
    viewContent.appendChild(pixelProbeButton);

    // Update pixel probe button state
    this.viewer.getPixelProbe().on('stateChanged', (state) => {
      if (state.enabled) {
        pixelProbeButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        pixelProbeButton.style.borderColor = 'var(--accent-primary)';
        pixelProbeButton.style.color = 'var(--accent-primary)';
      } else {
        pixelProbeButton.style.background = 'transparent';
        pixelProbeButton.style.borderColor = 'transparent';
        pixelProbeButton.style.color = 'var(--text-secondary)';
      }
    });

    // Spotlight Tool toggle button
    const spotlightButton = ContextToolbar.createIconButton('sun', () => {
      this.viewer.getSpotlightOverlay().toggle();
    }, { title: 'Spotlight (Shift+Q)' });
    spotlightButton.dataset.testid = 'spotlight-toggle-btn';
    viewContent.appendChild(spotlightButton);

    // Update spotlight button state when visibility changes
    this.viewer.getSpotlightOverlay().on('stateChanged', (state) => {
      if (state.enabled) {
        spotlightButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        spotlightButton.style.borderColor = 'var(--accent-primary)';
        spotlightButton.style.color = 'var(--accent-primary)';
      } else {
        spotlightButton.style.background = 'transparent';
        spotlightButton.style.borderColor = 'transparent';
        spotlightButton.style.color = 'var(--text-secondary)';
      }
    });

    // Info Panel toggle button
    const infoPanelButton = ContextToolbar.createIconButton('info', () => {
      this.infoPanel.toggle();
      if (this.infoPanel.isEnabled()) {
        this.updateInfoPanel();
      }
    }, { title: 'Info Panel (Shift+Alt+I)' });
    infoPanelButton.dataset.testid = 'info-panel-toggle';
    viewContent.appendChild(infoPanelButton);

    // Update button state when visibility changes
    this.infoPanel.on('visibilityChanged', (visible) => {
      if (visible) {
        infoPanelButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        infoPanelButton.style.borderColor = 'var(--accent-primary)';
        infoPanelButton.style.color = 'var(--accent-primary)';
      } else {
        infoPanelButton.style.background = 'transparent';
        infoPanelButton.style.borderColor = 'transparent';
        infoPanelButton.style.color = 'var(--text-secondary)';
      }
    });

    // Sync scope visibility with ScopesControl
    this.histogram.on('visibilityChanged', (visible) => {
      this.scopesControl.setScopeVisible('histogram', visible);
    });
    this.waveform.on('visibilityChanged', (visible) => {
      this.scopesControl.setScopeVisible('waveform', visible);
    });
    this.vectorscope.on('visibilityChanged', (visible) => {
      this.scopesControl.setScopeVisible('vectorscope', visible);
    });

    // Sync histogram clipping overlay toggle with Viewer
    this.histogram.on('clippingOverlayToggled', (enabled) => {
      if (enabled) {
        this.viewer.getClippingOverlay().enable();
      } else {
        this.viewer.getClippingOverlay().disable();
      }
    });

    // Sync A/B availability with CompareControl
    const updateABAvailability = () => {
      this.compareControl.setABAvailable(this.session.abCompareAvailable);
    };
    updateABAvailability();
    this.session.on('sourceLoaded', updateABAvailability);
    this.session.on('abSourceChanged', () => {
      const current = this.session.currentAB;
      this.compareControl.setABSource(current);
      // Update EXR layer selector when switching between A/B sources
      // since each source may have different layers (or none)
      this.updateEXRLayers();
    });

    this.contextToolbar.setTabContent('view', viewContent);

    // === COLOR TAB ===
    const colorContent = document.createElement('div');
    colorContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    colorContent.appendChild(this.ocioControl.render());
    colorContent.appendChild(ContextToolbar.createDivider());
    colorContent.appendChild(this.colorControls.render());
    colorContent.appendChild(ContextToolbar.createDivider());
    colorContent.appendChild(this.cdlControl.render());
    colorContent.appendChild(ContextToolbar.createDivider());
    colorContent.appendChild(this.colorInversionToggle.render());
    colorContent.appendChild(ContextToolbar.createDivider());

    // Curves toggle button
    const curvesButton = ContextToolbar.createButton('Curves', () => {
      this.curvesControl.toggle();
    }, { title: 'Toggle color curves panel (U)', icon: 'curves' });
    curvesButton.dataset.testid = 'curves-toggle-button';
    colorContent.appendChild(curvesButton);

    // Update button state when visibility changes
    this.curvesControl.on('visibilityChanged', (visible) => {
      if (visible) {
        curvesButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        curvesButton.style.borderColor = 'var(--accent-primary)';
      } else {
        curvesButton.style.background = '';
        curvesButton.style.borderColor = '';
      }
    });

    // Color Wheels toggle button
    const colorWheels = this.viewer.getColorWheels();
    const colorWheelsButton = ContextToolbar.createButton('Wheels', () => {
      colorWheels.toggle();
    }, { title: 'Toggle Lift/Gamma/Gain color wheels (Shift+Alt+W)', icon: 'palette' });
    colorWheelsButton.dataset.testid = 'color-wheels-toggle-button';
    colorContent.appendChild(colorWheelsButton);

    // Update button state when visibility changes
    colorWheels.on('visibilityChanged', (visible) => {
      if (visible) {
        colorWheelsButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        colorWheelsButton.style.borderColor = 'var(--accent-primary)';
      } else {
        colorWheelsButton.style.background = '';
        colorWheelsButton.style.borderColor = '';
      }
    });

    this.contextToolbar.setTabContent('color', colorContent);

    // === EFFECTS TAB ===
    const effectsContent = document.createElement('div');
    effectsContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    effectsContent.appendChild(this.filterControl.render());
    effectsContent.appendChild(ContextToolbar.createDivider());
    effectsContent.appendChild(this.lensControl.render());
    this.contextToolbar.setTabContent('effects', effectsContent);

    // === TRANSFORM TAB ===
    const transformContent = document.createElement('div');
    transformContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    transformContent.appendChild(this.transformControl.render());
    transformContent.appendChild(ContextToolbar.createDivider());
    transformContent.appendChild(this.cropControl.render());
    this.contextToolbar.setTabContent('transform', transformContent);

    // === ANNOTATE TAB ===
    const annotateContent = document.createElement('div');
    annotateContent.style.cssText = 'display: flex; align-items: center; gap: 6px;';
    annotateContent.appendChild(this.paintToolbar.render());

    annotateContent.appendChild(ContextToolbar.createDivider());

    // Text formatting toolbar (B/I/U buttons) - visible when text tool is selected
    annotateContent.appendChild(this.textFormattingToolbar.render());

    annotateContent.appendChild(ContextToolbar.createDivider());

    // History panel toggle button
    const historyButton = ContextToolbar.createButton('History', () => {
      this.historyPanel.toggle();
    }, { title: 'Toggle history panel (Shift+Alt+H)', icon: 'undo' });
    historyButton.dataset.testid = 'history-toggle-button';
    annotateContent.appendChild(historyButton);

    // Update button state when visibility changes
    this.historyPanel.on('visibilityChanged', (visible) => {
      if (visible) {
        historyButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        historyButton.style.borderColor = 'var(--accent-primary)';
      } else {
        historyButton.style.background = '';
        historyButton.style.borderColor = '';
      }
    });

    // Markers panel toggle button
    const markersButton = ContextToolbar.createButton('Markers', () => {
      this.markerListPanel.toggle();
    }, { title: 'Toggle markers list panel (Shift+Alt+M)', icon: 'marker' });
    markersButton.dataset.testid = 'markers-toggle-button';
    annotateContent.appendChild(markersButton);

    // Update button state when visibility changes
    this.markerListPanel.on('visibilityChanged', (visible) => {
      if (visible) {
        markersButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
        markersButton.style.borderColor = 'var(--accent-primary)';
      } else {
        markersButton.style.background = '';
        markersButton.style.borderColor = '';
      }
    });

    this.contextToolbar.setTabContent('annotate', annotateContent);
  }

  private onTabChanged(_tabId: TabId): void {
    // Handle tab-specific logic
    // For example, could show/hide certain viewer overlays based on tab
  }

  /**
   * Handle page visibility changes.
   * Pauses playback when tab is hidden to save resources,
   * and resumes playback when tab becomes visible again.
   */
  private handleVisibilityChange(): void {
    if (document.hidden) {
      // Tab is hidden - save playback state and pause
      this.wasPlayingBeforeHide = this.session.isPlaying;
      if (this.wasPlayingBeforeHide) {
        this.session.pause();
      }
      // Use aggressive subsampling for scopes while hidden
      this.histogram.setPlaybackMode(true);
      this.waveform.setPlaybackMode(true);
      this.vectorscope.setPlaybackMode(true);
    } else {
      // Tab is visible again - restore playback if it was playing before
      if (this.wasPlayingBeforeHide) {
        this.session.play();
        this.wasPlayingBeforeHide = false;
      }
      // Restore scope quality if not playing
      if (!this.session.isPlaying) {
        this.histogram.setPlaybackMode(false);
        this.waveform.setPlaybackMode(false);
        this.vectorscope.setPlaybackMode(false);
        // Update scopes with full quality
        this.updateHistogram();
        this.updateWaveform();
        this.updateVectorscope();
      }
    }
  }

  private bindEvents(): void {
    // Handle window resize
    window.addEventListener('resize', this.boundHandleResize);

    // Handle page visibility changes (pause playback when tab is hidden)
    document.addEventListener('visibilitychange', this.boundHandleVisibilityChange);

    // Initialize keyboard shortcuts
    this.keyboardManager.attach();

    // Load annotations from GTO files
    this.session.on('annotationsLoaded', ({ annotations, effects }) => {
      this.paintEngine.loadFromAnnotations(annotations, effects);
      this.syncGTOStore();
    });

    this.session.on('sessionLoaded', () => {
      if (this.session.gtoData) {
        this.gtoStore = new SessionGTOStore(this.session.gtoData);
        this.syncGTOStore();
      }
    });

    this.session.on('frameChanged', () => this.syncGTOStore());
    this.session.on('inOutChanged', () => this.syncGTOStore());
    this.session.on('marksChanged', () => this.syncGTOStore());
    this.session.on('fpsChanged', () => this.syncGTOStore());

    // Apply paint effects from GTO session to PaintEngine
    this.session.on('paintEffectsLoaded', (effects) => {
      if (effects.ghost !== undefined) {
        this.paintEngine.setGhostMode(
          effects.ghost,
          effects.ghostBefore ?? 3,
          effects.ghostAfter ?? 3
        );
      }
      if (effects.hold !== undefined) {
        this.paintEngine.setHoldMode(effects.hold);
      }
    });

    // Apply matte settings from GTO session to MatteOverlay
    this.session.on('matteChanged', (settings) => {
      this.viewer.getMatteOverlay().setSettings(settings);
    });

    // Handle metadata changes (for future UI display)
    this.session.on('metadataChanged', (metadata) => {
      // Could update title bar, info panel, etc.
      console.debug('Session metadata loaded:', metadata.displayName || 'Untitled');
    });

    this.paintEngine.on('annotationsChanged', () => this.syncGTOStore());
    this.paintEngine.on('effectsChanged', () => this.syncGTOStore());

    // Record paint actions in history
    this.paintEngine.on('strokeAdded', (annotation) => {
      const historyManager = getGlobalHistoryManager();
      const annotationType = annotation.type === 'pen' ? 'stroke' :
                             annotation.type === 'shape' ? (annotation as { shapeType?: string }).shapeType || 'shape' :
                             annotation.type;
      historyManager.recordAction(
        `Add ${annotationType}`,
        'paint',
        () => this.paintEngine.undo(),
        () => this.paintEngine.redo()
      );
    });

    this.session.on('settingsLoaded', (settings) => {
      if (settings.colorAdjustments) {
        this.colorControls.setAdjustments(settings.colorAdjustments);
      }
      if (settings.filterSettings) {
        this.filterControl.setSettings(settings.filterSettings);
      }
      if (settings.cdl) {
        this.cdlControl.setCDL(settings.cdl);
      }
      if (settings.transform) {
        this.transformControl.setTransform(settings.transform);
        this.viewer.setTransform(settings.transform);
      }
      if (settings.lens) {
        this.lensControl.setParams(settings.lens);
      }
      if (settings.crop) {
        this.cropControl.setState(settings.crop);
      }
      if (settings.channelMode) {
        this.channelSelect.setChannel(settings.channelMode);
      }
      if (settings.stereo) {
        this.stereoControl.setState(settings.stereo);
      }
      if (settings.scopes) {
        const applyScope = (scope: 'histogram' | 'waveform' | 'vectorscope', visible: boolean): void => {
          if (scope === 'histogram') {
            if (visible) {
              this.histogram.show();
              this.updateHistogram();
            } else {
              this.histogram.hide();
            }
          } else if (scope === 'waveform') {
            if (visible) {
              this.waveform.show();
              this.updateWaveform();
            } else {
              this.waveform.hide();
            }
          } else if (scope === 'vectorscope') {
            if (visible) {
              this.vectorscope.show();
              this.updateVectorscope();
            } else {
              this.vectorscope.hide();
            }
          }
          this.scopesControl.setScopeVisible(scope, visible);
        };

        applyScope('histogram', settings.scopes.histogram);
        applyScope('waveform', settings.scopes.waveform);
        applyScope('vectorscope', settings.scopes.vectorscope);
      }

      this.syncGTOStore();
    });
  }

  private setupKeyboardShortcuts(): void {
    this.registerKeyboardShortcuts();
  }

  private refreshKeyboardShortcuts(): void {
    // Clear existing bindings to prevent duplicates and memory leaks
    this.keyboardManager.clearAll();
    // Re-register all shortcuts with updated combos
    this.registerKeyboardShortcuts();
  }

  private registerKeyboardShortcuts(): void {
    // Create a map of action names to handler functions
    const actionHandlers: Record<string, () => void> = {
      'playback.toggle': () => this.session.togglePlayback(),
      'playback.stepForward': () => this.session.stepForward(),
      'playback.stepBackward': () => this.session.stepBackward(),
      'playback.toggleDirection': () => this.session.togglePlayDirection(),
      'playback.goToStart': () => this.session.goToStart(),
      'playback.goToEnd': () => this.session.goToEnd(),
      'playback.slower': () => this.session.decreaseSpeed(),
      'playback.stop': () => this.session.pause(),
      'playback.faster': () => {
        // L key - increase speed, but on Annotate tab, line tool takes precedence
        if (this.tabBar.activeTab === 'annotate') {
          this.paintToolbar.handleKeyboard('l');
          return;
        }
        this.session.increaseSpeed();
      },
      'timeline.setInPoint': () => this.session.setInPoint(),
      'timeline.setInPointAlt': () => this.session.setInPoint(),
      'timeline.setOutPoint': () => {
        // O key - set out point, but on Annotate tab, ellipse tool takes precedence
        if (this.tabBar.activeTab === 'annotate') {
          this.paintToolbar.handleKeyboard('o');
          return;
        }
        this.session.setOutPoint();
      },
      'timeline.setOutPointAlt': () => this.session.setOutPoint(),
      'timeline.toggleMark': () => this.session.toggleMark(),
      'timeline.resetInOut': () => {
        // R key - reset in/out points, but on Annotate tab, rectangle tool takes precedence
        if (this.tabBar.activeTab === 'annotate') {
          this.paintToolbar.handleKeyboard('r');
          return;
        }
        this.session.resetInOutPoints();
      },
      'timeline.cycleLoopMode': () => {
        const modes: Array<'once' | 'loop' | 'pingpong'> = ['once', 'loop', 'pingpong'];
        const currentIndex = modes.indexOf(this.session.loopMode);
        this.session.loopMode = modes[(currentIndex + 1) % modes.length]!;
      },
      'view.fitToWindow': () => this.viewer.smoothFitToWindow(),
      'view.fitToWindowAlt': () => this.viewer.smoothFitToWindow(),
      'view.zoom50': () => {
        if (this.tabBar.activeTab === 'view') {
          this.viewer.smoothSetZoom(0.5);
        }
      },
      'view.cycleWipeMode': () => this.compareControl.cycleWipeMode(),
      'view.toggleWaveform': () => this.scopesControl.toggleScope('waveform'),
      'view.toggleAB': () => this.session.toggleAB(),
      'view.toggleABAlt': () => this.session.toggleAB(),
      'view.toggleDifferenceMatte': () => this.compareControl.toggleDifferenceMatte(),
      'view.toggleSplitScreen': () => this.compareControl.toggleSplitScreen(),
      'view.toggleGhostFrames': () => this.ghostFrameControl.toggle(),
      'view.togglePAR': () => this.parControl.toggle(),
      'view.cycleBackgroundPattern': () => this.backgroundPatternControl.cyclePattern(),
      'view.toggleCheckerboard': () => this.backgroundPatternControl.toggleCheckerboard(),
      'panel.color': () => this.colorControls.toggle(),
      'panel.effects': () => this.filterControl.toggle(),
      'panel.curves': () => this.curvesControl.toggle(),
      'panel.crop': () => this.cropControl.toggle(),
      'panel.waveform': () => this.scopesControl.toggleScope('waveform'),
      'panel.vectorscope': () => this.scopesControl.toggleScope('vectorscope'),
      'panel.histogram': () => this.scopesControl.toggleScope('histogram'),
      'panel.ocio': () => this.ocioControl.toggle(),
      'display.cycleProfile': () => this.displayProfileControl.cycleProfile(),
      'transform.rotateLeft': () => this.transformControl.rotateLeft(),
      'transform.rotateRight': () => this.transformControl.rotateRight(),
      'transform.flipHorizontal': () => this.transformControl.toggleFlipH(),
      'transform.flipVertical': () => this.transformControl.toggleFlipV(),
      'export.quickExport': () => this.headerBar.getExportControl().quickExport('png'),
      'export.copyFrame': () => this.viewer.copyFrameToClipboard(true),
      'edit.undo': () => this.paintEngine.undo(),
      'edit.redo': () => this.paintEngine.redo(),
      'annotation.previous': () => this.goToPreviousAnnotation(),
      'annotation.next': () => this.goToNextAnnotation(),
      'tab.view': () => this.tabBar.handleKeyboard('1'),
      'tab.color': () => this.tabBar.handleKeyboard('2'),
      'tab.effects': () => this.tabBar.handleKeyboard('3'),
      'tab.transform': () => this.tabBar.handleKeyboard('4'),
      'tab.annotate': () => this.tabBar.handleKeyboard('5'),
      'paint.pan': () => this.paintToolbar.handleKeyboard('v'),
      'paint.pen': () => this.paintToolbar.handleKeyboard('p'),
      'paint.eraser': () => this.paintToolbar.handleKeyboard('e'),
      'paint.text': () => this.paintToolbar.handleKeyboard('t'),
      'paint.rectangle': () => this.paintToolbar.handleKeyboard('r'),
      'paint.ellipse': () => this.paintToolbar.handleKeyboard('o'),
      'paint.line': () => this.paintToolbar.handleKeyboard('l'),
      'paint.arrow': () => this.paintToolbar.handleKeyboard('a'),
      'paint.toggleBrush': () => this.paintToolbar.handleKeyboard('b'),
      'paint.toggleGhost': () => this.paintToolbar.handleKeyboard('g'),
      'paint.toggleHold': () => this.paintToolbar.handleKeyboard('x'),
      'channel.red': () => this.channelSelect.handleKeyboard('R', true),
      'channel.green': () => this.channelSelect.handleKeyboard('G', true),
      'channel.blue': () => this.channelSelect.handleKeyboard('B', true),
      'channel.alpha': () => this.channelSelect.handleKeyboard('A', true),
      'channel.luminance': () => this.channelSelect.handleKeyboard('L', true),
      'channel.none': () => this.channelSelect.handleKeyboard('N', true),
      'stereo.toggle': () => this.stereoControl.handleKeyboard('3', true),
      'view.toggleGuides': () => this.safeAreasControl.getOverlay().toggle(),
      'view.togglePixelProbe': () => this.viewer.getPixelProbe().toggle(),
      'view.toggleFalseColor': () => this.viewer.getFalseColor().toggle(),
      'view.toggleToneMapping': () => this.toneMappingControl.toggle(),
      'view.toggleTimecodeOverlay': () => this.viewer.getTimecodeOverlay().toggle(),
      'view.toggleZebraStripes': () => {
        const zebras = this.viewer.getZebraStripes();
        zebras.toggle();
        this.viewer.refresh();
      },
      'color.toggleColorWheels': () => {
        this.viewer.getColorWheels().toggle();
      },
      'view.toggleSpotlight': () => {
        this.viewer.getSpotlightOverlay().toggle();
      },
      'color.toggleHSLQualifier': () => {
        this.viewer.getHSLQualifier().toggle();
      },
      'color.toggleInversion': () => {
        this.colorInversionToggle.toggle();
      },
      'view.cycleLuminanceVis': () => {
        this.viewer.getLuminanceVisualization().cycleMode();
      },
      'panel.history': () => {
        this.historyPanel.toggle();
      },
      'panel.markers': () => {
        this.markerListPanel.toggle();
      },
      'view.toggleInfoPanel': () => {
        this.infoPanel.toggle();
        if (this.infoPanel.isEnabled()) {
          this.updateInfoPanel();
        }
      },
      'theme.cycle': () => {
        getThemeManager().cycleMode();
      },
      'panel.close': () => {
        // ESC exits presentation mode first, then fullscreen
        if (this.presentationMode.getState().enabled) {
          this.presentationMode.toggle();
          return;
        }
        if (this.colorControls) {
          this.colorControls.hide();
        }
        if (this.cropControl) {
          this.cropControl.hidePanel();
          if (this.cropControl.getCropState().enabled) {
            this.cropControl.toggle();
          }
        }
      },
      'snapshot.create': () => {
        this.createQuickSnapshot();
      },
      'panel.snapshots': () => {
        this.snapshotPanel.toggle();
      },
      'panel.playlist': () => {
        this.playlistPanel.toggle();
      },
      'view.toggleFullscreen': () => {
        this.fullscreenManager?.toggle();
      },
      'view.togglePresentation': () => {
        this.presentationMode.toggle();
      },
      'network.togglePanel': () => {
        this.networkControl.togglePanel();
      },
      'network.disconnect': () => {
        if (this.networkSyncManager.isConnected) {
          this.networkSyncManager.leaveRoom();
        }
      },
    };

    // Paint shortcuts that conflict with other shortcuts are handled by delegating handlers
    // (e.g., playback.faster handles L key, but delegates to paint.line on Annotate tab)
    // Skip registering these to avoid overwriting the delegating handlers
    const conflictingPaintShortcuts = new Set([
      'paint.line',      // L key - handled by playback.faster
      'paint.rectangle', // R key - handled by timeline.resetInOut
      'paint.ellipse',   // O key - handled by timeline.setOutPoint
    ]);

    // Register all keyboard shortcuts using effective combos (custom or default)
    for (const [action, defaultBinding] of Object.entries(DEFAULT_KEY_BINDINGS)) {
      // Skip conflicting paint shortcuts - they're handled by delegating handlers
      if (conflictingPaintShortcuts.has(action)) {
        continue;
      }

      const handler = actionHandlers[action];
      if (handler) {
        // Use effective combo if custom key bindings manager is available, otherwise use default
        const effectiveCombo = this.customKeyBindingsManager
          ? this.customKeyBindingsManager.getEffectiveCombo(action)
          : (() => {
              // Extract KeyCombination from default binding (remove description)
              const { description: _, ...combo } = defaultBinding;
              return combo as KeyCombination;
            })();
        this.keyboardManager.register(effectiveCombo, handler, defaultBinding.description);
      }
    }
  }

  /**
   * Setup network sync: wire NetworkControl UI to NetworkSyncManager,
   * and listen for incoming sync events to apply to Session/Viewer.
   */
  private setupNetworkSync(): void {
    // Add NetworkControl to header bar
    this.headerBar.setNetworkControl(this.networkControl.render());

    // Wire UI events to manager
    this.networkControl.on('createRoom', () => {
      this.networkSyncManager.simulateRoomCreated();
      const info = this.networkSyncManager.roomInfo;
      if (info) {
        this.networkControl.setConnectionState('connected');
        this.networkControl.setRoomInfo(info);
        this.networkControl.setUsers(info.users);
      }
    });

    this.networkControl.on('joinRoom', ({ roomCode, userName }) => {
      this.networkSyncManager.joinRoom(roomCode, userName);
    });

    this.networkControl.on('leaveRoom', () => {
      this.networkSyncManager.leaveRoom();
      this.networkControl.setConnectionState('disconnected');
      this.networkControl.setRoomInfo(null);
      this.networkControl.setUsers([]);
    });

    this.networkControl.on('syncSettingsChanged', (settings) => {
      this.networkSyncManager.setSyncSettings(settings);
    });

    this.networkControl.on('copyLink', async (link) => {
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        // Clipboard API may not be available
      }
    });

    // Wire manager events to UI
    this.networkSyncManager.on('connectionStateChanged', (state) => {
      this.networkControl.setConnectionState(state);
    });

    this.networkSyncManager.on('roomCreated', (info) => {
      this.networkControl.setRoomInfo(info);
      this.networkControl.setUsers(info.users);
    });

    this.networkSyncManager.on('roomJoined', (info) => {
      this.networkControl.setRoomInfo(info);
      this.networkControl.setUsers(info.users);
    });

    this.networkSyncManager.on('usersChanged', (users) => {
      this.networkControl.setUsers(users);
    });

    this.networkSyncManager.on('error', (err) => {
      this.networkControl.showError(err.message);
    });

    this.networkSyncManager.on('rttUpdated', (rtt) => {
      this.networkControl.setRTT(rtt);
    });

    // Wire incoming sync events to Session/Viewer
    this.networkSyncManager.on('syncPlayback', (payload) => {
      const sm = this.networkSyncManager.getSyncStateManager();
      sm.beginApplyRemote();
      try {
        if (payload.isPlaying && !this.session.isPlaying) {
          this.session.play();
        } else if (!payload.isPlaying && this.session.isPlaying) {
          this.session.pause();
        }
        if (sm.shouldApplyFrameSync(this.session.currentFrame, payload.currentFrame)) {
          this.session.goToFrame(payload.currentFrame);
        }
        if (this.session.playbackSpeed !== payload.playbackSpeed) {
          this.session.playbackSpeed = payload.playbackSpeed;
        }
      } finally {
        sm.endApplyRemote();
      }
    });

    this.networkSyncManager.on('syncFrame', (payload) => {
      const sm = this.networkSyncManager.getSyncStateManager();
      if (sm.shouldApplyFrameSync(this.session.currentFrame, payload.currentFrame)) {
        sm.beginApplyRemote();
        try {
          this.session.goToFrame(payload.currentFrame);
        } finally {
          sm.endApplyRemote();
        }
      }
    });

    this.networkSyncManager.on('syncView', (payload) => {
      const sm = this.networkSyncManager.getSyncStateManager();
      sm.beginApplyRemote();
      try {
        this.viewer.setZoom(payload.zoom);
      } finally {
        sm.endApplyRemote();
      }
    });

    // Send outgoing sync when local state changes
    this.session.on('playbackChanged', (isPlaying) => {
      if (this.networkSyncManager.isConnected && !this.networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
        this.networkSyncManager.sendPlaybackSync({
          isPlaying,
          currentFrame: this.session.currentFrame,
          playbackSpeed: this.session.playbackSpeed,
          playDirection: this.session.playDirection,
          loopMode: this.session.loopMode,
          timestamp: Date.now(),
        });
      }
    });

    this.session.on('frameChanged', (frame) => {
      if (this.networkSyncManager.isConnected && !this.networkSyncManager.getSyncStateManager().isApplyingRemoteState) {
        this.networkSyncManager.sendFrameSync(frame);
      }
    });
  }

  private goToNextAnnotation(): void {
    const annotatedFrames = this.paintEngine.getAnnotatedFrames();
    if (annotatedFrames.size === 0) return;

    const currentFrame = this.session.currentFrame;
    const sortedFrames = Array.from(annotatedFrames).sort((a, b) => a - b);

    // Find next frame after current
    for (const frame of sortedFrames) {
      if (frame > currentFrame) {
        this.session.goToFrame(frame);
        return;
      }
    }

    // Wrap to first annotated frame
    if (sortedFrames[0] !== undefined) {
      this.session.goToFrame(sortedFrames[0]);
    }
  }

  private goToPreviousAnnotation(): void {
    const annotatedFrames = this.paintEngine.getAnnotatedFrames();
    if (annotatedFrames.size === 0) return;

    const currentFrame = this.session.currentFrame;
    const sortedFrames = Array.from(annotatedFrames).sort((a, b) => b - a); // Descending

    // Find previous frame before current
    for (const frame of sortedFrames) {
      if (frame < currentFrame) {
        this.session.goToFrame(frame);
        return;
      }
    }

    // Wrap to last annotated frame
    if (sortedFrames[0] !== undefined) {
      this.session.goToFrame(sortedFrames[0]);
    }
  }

  private start(): void {
    this.tick();
  }

  private tick = (): void => {
    this.session.update();

    // Only render on every frame during video playback
    // Static images and drawing are handled by event-driven updates
    const source = this.session.currentSource;
    if (source?.type === 'video' && this.session.isPlaying) {
      this.viewer.refresh();
    }

    this.animationId = requestAnimationFrame(this.tick);
  };

  private async handleSequenceExport(request: {
    format: 'png' | 'jpeg' | 'webp';
    includeAnnotations: boolean;
    quality: number;
    useInOutRange: boolean;
  }): Promise<void> {
    const source = this.session.currentSource;
    if (!source) {
      showAlert('No media loaded to export', { type: 'warning', title: 'Export' });
      return;
    }

    // Determine frame range
    let startFrame: number;
    let endFrame: number;

    if (request.useInOutRange) {
      startFrame = this.session.inPoint;
      endFrame = this.session.outPoint;
    } else {
      startFrame = 0;
      endFrame = this.session.frameCount - 1;
    }

    const totalFrames = endFrame - startFrame + 1;
    if (totalFrames <= 0) {
      showAlert('Invalid frame range', { type: 'warning', title: 'Export' });
      return;
    }

    // Generate filename pattern based on source
    const sourceName = source.name?.replace(/\.[^/.]+$/, '') || 'frame';
    const padLength = String(endFrame).length < 4 ? 4 : String(endFrame).length;

    // Create progress dialog
    const progressDialog = document.createElement('div');
    progressDialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 8px;
      padding: 24px;
      z-index: 10000;
      min-width: 300px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;

    const progressText = document.createElement('div');
    progressText.style.cssText = 'color: var(--text-primary); margin-bottom: 12px; font-size: 14px;';
    progressText.textContent = `Exporting frames 0/${totalFrames}...`;

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      height: 8px;
      background: var(--border-primary);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 16px;
    `;

    const progressFill = document.createElement('div');
    progressFill.style.cssText = `
      height: 100%;
      background: var(--accent-primary);
      width: 0%;
      transition: width 0.1s ease;
    `;
    progressBar.appendChild(progressFill);

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
      background: var(--bg-active);
      border: 1px solid var(--border-primary);
      color: var(--text-primary);
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      width: 100%;
    `;

    const cancellationToken = { cancelled: false };
    cancelButton.addEventListener('click', () => {
      cancellationToken.cancelled = true;
      cancelButton.textContent = 'Cancelling...';
      cancelButton.disabled = true;
    });

    progressDialog.appendChild(progressText);
    progressDialog.appendChild(progressBar);
    progressDialog.appendChild(cancelButton);
    document.body.appendChild(progressDialog);

    // Store current frame to restore later
    const originalFrame = this.session.currentFrame;

    try {
      const result = await exportSequence(
        {
          format: request.format,
          quality: request.quality,
          startFrame,
          endFrame,
          includeAnnotations: request.includeAnnotations,
          filenamePattern: `${sourceName}_####`,
          padLength,
        },
        async (frame: number) => {
          // Navigate to frame and render
          this.session.goToFrame(frame);
          // Small delay to allow frame to load
          await new Promise(resolve => setTimeout(resolve, 50));
          const canvas = await this.viewer.renderFrameToCanvas(frame, request.includeAnnotations);
          if (!canvas) {
            throw new Error(`Failed to render frame ${frame}`);
          }
          return canvas;
        },
        (progress) => {
          progressText.textContent = `Exporting frames ${progress.currentFrame - startFrame + 1}/${totalFrames}...`;
          progressFill.style.width = `${progress.percent}%`;
        },
        cancellationToken
      );

      // Restore original frame
      this.session.goToFrame(originalFrame);

      // Remove progress dialog
      document.body.removeChild(progressDialog);

      // Show result
      if (result.success) {
        showAlert(`Successfully exported ${result.exportedFrames} frames`, { type: 'success', title: 'Export Complete' });
      } else if (result.error?.includes('cancelled')) {
        showAlert('Export cancelled', { type: 'info', title: 'Export' });
      } else {
        showAlert(`Export failed: ${result.error}`, { type: 'error', title: 'Export Error' });
      }
    } catch (err) {
      // Restore original frame
      this.session.goToFrame(originalFrame);

      // Remove progress dialog
      if (document.body.contains(progressDialog)) {
        document.body.removeChild(progressDialog);
      }

      showAlert(`Export error: ${err}`, { type: 'error', title: 'Export Error' });
    }
  }

  /**
   * Update available sources for the stack control.
   * Called when sources are loaded or changed.
   */
  private updateStackControlSources(): void {
    const sources = this.session.allSources.map((source, index) => ({
      index,
      name: source.name,
    }));
    this.stackControl.setAvailableSources(sources);
  }

  /**
   * Schedule scope updates after the viewer has rendered.
   * Uses requestAnimationFrame to ensure updates happen after the render cycle.
   */
  private pendingScopeUpdate = false;
  private scheduleUpdateScopes(): void {
    if (this.pendingScopeUpdate) return;
    this.pendingScopeUpdate = true;

    // Use double requestAnimationFrame to ensure we run after the viewer's render
    // First RAF puts us in the same frame as the render, second RAF ensures render completed
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.pendingScopeUpdate = false;
        this.updateHistogram();
        this.updateWaveform();
        this.updateVectorscope();
      });
    });
  }

  /**
   * Update histogram with current frame data
   */
  private updateHistogram(): void {
    if (!this.histogram.isVisible()) return;

    const imageData = this.viewer.getImageData();
    if (imageData) {
      this.histogram.update(imageData);
    }
  }

  /**
   * Update waveform with current frame data
   */
  private updateWaveform(): void {
    if (!this.waveform.isVisible()) return;

    const imageData = this.viewer.getImageData();
    if (imageData) {
      this.waveform.update(imageData);
    }
  }

  /**
   * Update vectorscope with current frame data
   */
  private updateVectorscope(): void {
    if (!this.vectorscope.isVisible()) return;

    const imageData = this.viewer.getImageData();
    if (imageData) {
      this.vectorscope.update(imageData);
    }
  }

  /**
   * Handle EXR layer change from ChannelSelect
   */
  private async handleEXRLayerChange(
    layerName: string | null,
    remapping: import('./formats/EXRDecoder').EXRChannelRemapping | null
  ): Promise<void> {
    const source = this.session.currentSource;
    if (!source) return;

    // Check if source has a FileSourceNode with EXR support
    const fileSource = source.fileSourceNode;
    if (!fileSource || typeof fileSource.setEXRLayer !== 'function') return;

    try {
      const changed = await fileSource.setEXRLayer(layerName, remapping ?? undefined);
      if (changed) {
        // Refresh the viewer
        this.viewer.refresh();
        this.scheduleUpdateScopes();
      }
    } catch (err) {
      console.error('Failed to change EXR layer:', err);
    }
  }

  /**
   * Update EXR layer information in ChannelSelect when a file is loaded
   */
  private updateEXRLayers(): void {
    const source = this.session.currentSource;
    if (!source) {
      this.channelSelect.clearEXRLayers();
      return;
    }

    // Check if source has a FileSourceNode with EXR support
    const fileSource = source.fileSourceNode;
    if (!fileSource || typeof fileSource.getEXRLayers !== 'function') {
      this.channelSelect.clearEXRLayers();
      return;
    }

    const layers = fileSource.getEXRLayers();
    if (layers && layers.length > 0) {
      this.channelSelect.setEXRLayers(layers);
    } else {
      this.channelSelect.clearEXRLayers();
    }
  }

  /**
   * Update info panel with current session data
   */
  private updateInfoPanel(): void {
    const source = this.session.currentSource;
    const fps = this.session.fps;
    const currentFrame = this.session.currentFrame;
    const totalFrames = source?.duration ?? 0;

    // Calculate timecode
    const timecode = this.formatTimecode(currentFrame, fps);

    // Calculate duration
    const durationSeconds = totalFrames / fps;
    const duration = this.formatDuration(durationSeconds);

    this.infoPanel.update({
      filename: source?.name ?? undefined,
      width: source?.width ?? undefined,
      height: source?.height ?? undefined,
      currentFrame,
      totalFrames,
      timecode,
      duration,
      fps,
    });
  }

  /**
   * Format frame number as timecode (HH:MM:SS:FF)
   */
  private formatTimecode(frame: number, fps: number): string {
    if (fps <= 0) return '00:00:00:00';

    const totalSeconds = frame / fps;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = Math.floor(frame % fps);

    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0'),
      frames.toString().padStart(2, '0'),
    ].join(':');
  }

  /**
   * Format duration as HH:MM:SS
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  private showShortcuts(): void {
    const content = document.createElement('div');
    content.style.cssText = `
      max-height: 70vh;
      overflow-y: auto;
      padding: 8px;
      font-family: monospace;
      font-size: 12px;
      color: var(--text-primary);
      line-height: 1.6;
    `;

    // Group shortcuts by category
    const categories = {
      'TABS': ['tab.view', 'tab.color', 'tab.effects', 'tab.transform', 'tab.annotate'],
      'PLAYBACK': ['playback.toggle', 'playback.stepBackward', 'playback.stepForward', 'playback.goToStart', 'playback.goToEnd', 'playback.toggleDirection', 'playback.slower', 'playback.stop', 'playback.faster'],
      'VIEW': ['view.fitToWindow', 'view.fitToWindowAlt', 'view.zoom50', 'view.toggleAB', 'view.toggleABAlt', 'view.toggleSpotlight', 'color.toggleHSLQualifier'],
      'MOUSE CONTROLS': [], // Special case - not in DEFAULT_KEY_BINDINGS
      'CHANNEL ISOLATION': ['channel.red', 'channel.green', 'channel.blue', 'channel.alpha', 'channel.luminance', 'channel.none'],
      'SCOPES': ['panel.histogram', 'panel.waveform', 'panel.vectorscope'],
      'TIMELINE': ['timeline.setInPoint', 'timeline.setInPointAlt', 'timeline.setOutPoint', 'timeline.setOutPointAlt', 'timeline.resetInOut', 'timeline.toggleMark', 'timeline.cycleLoopMode'],
      'PAINT (Annotate tab)': ['paint.pan', 'paint.pen', 'paint.eraser', 'paint.text', 'paint.rectangle', 'paint.ellipse', 'paint.line', 'paint.arrow', 'paint.toggleBrush', 'paint.toggleGhost', 'paint.toggleHold', 'edit.undo', 'edit.redo'],
      'COLOR': ['panel.color', 'panel.curves', 'panel.ocio', 'display.cycleProfile'],
      'WIPE COMPARISON': ['view.cycleWipeMode', 'view.toggleSplitScreen'],
      'AUDIO (Video only)': [], // Special case - not in DEFAULT_KEY_BINDINGS
      'EXPORT': ['export.quickExport', 'export.copyFrame'],
      'ANNOTATIONS': ['annotation.previous', 'annotation.next'],
      'TRANSFORM': ['transform.rotateLeft', 'transform.rotateRight', 'transform.flipHorizontal', 'transform.flipVertical'],
      'PANELS': ['panel.effects', 'panel.crop', 'panel.close'],
      'STEREO': ['stereo.toggle']
    };

    // Add special audio shortcuts
    const audioShortcuts = [
      { key: 'Hover vol', desc: 'Show volume slider' },
      { key: 'Click icon', desc: 'Toggle mute' }
    ];

    // Generate content for each category
    for (const [categoryName, actionKeys] of Object.entries(categories)) {
      if (actionKeys.length === 0 && categoryName !== 'AUDIO (Video only)') continue;

      const categoryDiv = document.createElement('div');
      categoryDiv.style.cssText = 'margin-bottom: 16px;';

      const categoryHeader = document.createElement('div');
      categoryHeader.style.cssText = 'font-weight: bold; color: var(--accent-primary); margin-bottom: 4px;';
      categoryHeader.textContent = categoryName;
      categoryDiv.appendChild(categoryHeader);

      // Special handling for audio category
      if (categoryName === 'AUDIO (Video only)') {
        for (const shortcut of audioShortcuts) {
          const shortcutDiv = document.createElement('div');
          shortcutDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;';

          const keySpan = document.createElement('span');
          keySpan.textContent = shortcut.key;
          keySpan.style.cssText = 'color: var(--text-muted); min-width: 120px;';

          const descSpan = document.createElement('span');
          descSpan.textContent = shortcut.desc;
          descSpan.style.cssText = 'color: var(--text-primary); flex: 1;';

          shortcutDiv.appendChild(keySpan);
          shortcutDiv.appendChild(descSpan);
          categoryDiv.appendChild(shortcutDiv);
        }
      } else if (categoryName === 'MOUSE CONTROLS') {
        const mouseShortcuts = [
          { key: 'Drag', desc: 'Pan image' },
          { key: 'Scroll', desc: 'Zoom in/out' },
          { key: 'Dbl-click', desc: 'Reset individual slider (color panel)' },
          { key: 'Dbl-click', desc: 'Jump to nearest annotation (timeline)' },
          { key: 'Drag line', desc: 'Adjust wipe position' }
        ];

        for (const shortcut of mouseShortcuts) {
          const shortcutDiv = document.createElement('div');
          shortcutDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;';

          const keySpan = document.createElement('span');
          keySpan.textContent = shortcut.key;
          keySpan.style.cssText = 'color: var(--text-muted); min-width: 120px;';

          const descSpan = document.createElement('span');
          descSpan.textContent = shortcut.desc;
          descSpan.style.cssText = 'color: var(--text-primary); flex: 1;';

          shortcutDiv.appendChild(keySpan);
          shortcutDiv.appendChild(descSpan);
          categoryDiv.appendChild(shortcutDiv);
        }
      } else {
        // Regular shortcuts from DEFAULT_KEY_BINDINGS
        for (const actionKey of actionKeys) {
          const defaultBinding = DEFAULT_KEY_BINDINGS[actionKey as keyof typeof DEFAULT_KEY_BINDINGS];
          if (!defaultBinding) continue;

          const effectiveCombo = this.customKeyBindingsManager.getEffectiveCombo(actionKey);
          const isCustom = this.customKeyBindingsManager.hasCustomBinding(actionKey);

          const shortcutDiv = document.createElement('div');
          shortcutDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;';

          const keySpan = document.createElement('span');
          keySpan.textContent = describeKeyCombo(effectiveCombo);
          keySpan.style.cssText = `min-width: 120px; ${isCustom ? 'color: var(--accent-primary); font-weight: bold;' : 'color: var(--text-muted);'}`;

          const descSpan = document.createElement('span');
          descSpan.textContent = defaultBinding.description;
          descSpan.style.cssText = 'color: var(--text-primary); flex: 1;';

          const actionsDiv = document.createElement('div');
          actionsDiv.style.cssText = 'display: flex; gap: 4px;';

          // Reset button (only show if custom binding exists)
          if (isCustom) {
            const resetButton = document.createElement('button');
            resetButton.textContent = 'Reset';
            resetButton.style.cssText = `
              background: var(--text-muted);
              border: none;
              color: var(--bg-primary);
              padding: 2px 6px;
              border-radius: 3px;
              cursor: pointer;
              font-size: 10px;
            `;
            resetButton.onclick = () => {
              this.customKeyBindingsManager.removeCustomBinding(actionKey);
              this.refreshKeyboardShortcuts();
              this.showShortcuts(); // Refresh the display
            };
            actionsDiv.appendChild(resetButton);
          }

          shortcutDiv.appendChild(keySpan);
          shortcutDiv.appendChild(descSpan);
          shortcutDiv.appendChild(actionsDiv);
          categoryDiv.appendChild(shortcutDiv);
        }
      }

      content.appendChild(categoryDiv);
    }

    // Reset all button at bottom
    const resetAllContainer = document.createElement('div');
    resetAllContainer.style.cssText = `
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--border-primary);
      text-align: center;
    `;

    const resetAllButton = document.createElement('button');
    resetAllButton.textContent = 'Reset All Shortcuts to Defaults';
    resetAllButton.style.cssText = `
      background: var(--error);
      border: none;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `;
    resetAllButton.onclick = () => {
      if (confirm('Reset all keyboard shortcuts to defaults?')) {
        this.customKeyBindingsManager.resetAll();
        this.refreshKeyboardShortcuts();
        this.showShortcuts(); // Refresh the display
      }
    };
    resetAllContainer.appendChild(resetAllButton);
    content.appendChild(resetAllContainer);

    showModal(content, { title: 'Keyboard Shortcuts', width: '700px' });
  }

  /**
   * Show a modal explaining that the video codec is not supported in browsers
   */
  private showUnsupportedCodecModal(info: UnsupportedCodecInfo): void {
    const content = document.createElement('div');
    content.dataset.testid = 'unsupported-codec-modal-content';
    content.setAttribute('role', 'alert');
    content.setAttribute('aria-live', 'assertive');
    content.setAttribute('aria-label', `Unsupported codec error: ${info.error.title}`);
    content.style.cssText = `
      max-height: 70vh;
      overflow-y: auto;
      padding: 8px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-primary);
    `;

    // Warning icon and message
    const warningSection = document.createElement('div');
    warningSection.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 16px;
      padding: 12px;
      background: rgba(var(--warning), 0.1);
      border: 1px solid var(--warning);
      border-radius: 6px;
    `;

    const warningIcon = document.createElement('div');
    warningIcon.textContent = '\u26A0';
    warningIcon.style.cssText = 'font-size: 24px; line-height: 1;';

    const warningText = document.createElement('div');
    warningText.innerHTML = `
      <strong>${info.error.title}</strong><br>
      ${info.error.message}
    `;

    warningSection.appendChild(warningIcon);
    warningSection.appendChild(warningText);
    content.appendChild(warningSection);

    // Escape filename for security (prevent XSS) - used in multiple places below
    const escapedFilename = info.filename.replace(/[&<>"']/g, (char) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[char] || char;
    });

    // File info
    const fileSection = document.createElement('div');
    fileSection.style.cssText = 'margin-bottom: 16px;';
    fileSection.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>File Details:</strong></div>
      <div style="background: var(--bg-hover); padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">
        <div>File: ${escapedFilename}</div>
        <div>Codec: ${info.error.codecInfo.displayName}</div>
        ${info.error.codecInfo.fourcc ? `<div>FourCC: ${info.error.codecInfo.fourcc}</div>` : ''}
      </div>
    `;
    content.appendChild(fileSection);

    // Why section
    const whySection = document.createElement('div');
    whySection.style.cssText = 'margin-bottom: 16px;';
    whySection.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>Why does this happen?</strong></div>
      <ul style="margin: 0; padding-left: 20px; color: var(--text-secondary);">
        <li>ProRes and DNxHD are professional editing codecs</li>
        <li>Web browsers support consumer codecs (H.264, VP9, AV1)</li>
        <li>Professional codecs require native applications or transcoding</li>
      </ul>
    `;
    content.appendChild(whySection);

    // Solution section
    const solutionSection = document.createElement('div');
    solutionSection.style.cssText = 'margin-bottom: 8px;';
    solutionSection.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>How to view this file:</strong></div>
      <div style="background: var(--bg-secondary); padding: 12px; border-radius: 4px; border: 1px solid var(--border-primary);">
        <div style="margin-bottom: 8px; color: var(--text-secondary);">Transcode to a web-compatible format using FFmpeg:</div>
        <code
          role="region"
          aria-label="FFmpeg command to transcode video"
          tabindex="0"
          style="
            display: block;
            background: var(--bg-primary);
            padding: 8px;
            border-radius: 3px;
            font-size: 11px;
            white-space: pre-wrap;
            word-break: break-all;
            color: var(--accent-primary);
          ">ffmpeg -i "${escapedFilename}" -c:v libx264 -crf 18 -preset slow -c:a aac output.mp4</code>
      </div>
    `;
    content.appendChild(solutionSection);

    // Note about HTML fallback
    const noteSection = document.createElement('div');
    noteSection.style.cssText = `
      margin-top: 16px;
      padding: 10px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      font-size: 12px;
      color: var(--text-muted);
    `;
    noteSection.innerHTML = `
      <strong>Note:</strong> The file may partially load if your browser has native support,
      but frame-accurate playback and scrubbing will not be available.
    `;
    content.appendChild(noteSection);

    showModal(content, {
      title: info.error.title,
      width: '550px',
    });
  }

  private showCustomKeyBindings(): void {
    const content = document.createElement('div');
    content.style.cssText = `
      max-height: 70vh;
      overflow-y: auto;
      padding: 8px;
    `;

    const actions = this.customKeyBindingsManager.getAvailableActions();

    // Create table header
    const header = document.createElement('div');
    header.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 120px 80px;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid var(--border-primary);
      font-weight: bold;
      color: var(--text-primary);
      font-size: 12px;
    `;
    header.innerHTML = `
      <div>Action</div>
      <div>Current Key</div>
      <div>Actions</div>
    `;
    content.appendChild(header);

    // Create rows for each action
    for (const action of actions) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 120px 80px;
        gap: 8px;
        padding: 8px 0;
        border-bottom: 1px solid var(--border-secondary);
        align-items: center;
      `;

      // Action description
      const descCell = document.createElement('div');
      descCell.style.cssText = `
        color: var(--text-primary);
        font-size: 13px;
      `;
      descCell.textContent = action.description;
      row.appendChild(descCell);

      // Current key combination
      const keyCell = document.createElement('div');
      keyCell.style.cssText = `
        background: var(--bg-hover);
        border: 1px solid var(--bg-active);
        border-radius: 4px;
        padding: 4px 8px;
        color: var(--text-primary);
        font-family: monospace;
        font-size: 12px;
        text-align: center;
      `;
      keyCell.textContent = this.formatKeyCombo(action.currentCombo);
      row.appendChild(keyCell);

      // Action buttons
      const buttonCell = document.createElement('div');
      buttonCell.style.cssText = `
        display: flex;
        gap: 4px;
      `;

      // Set custom binding button
      const setButton = document.createElement('button');
      setButton.textContent = 'Set';
      setButton.style.cssText = `
        background: var(--accent-primary);
        border: none;
        color: white;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
      `;
      setButton.onclick = () => this.promptForKeyBinding(action.action, keyCell);
      buttonCell.appendChild(setButton);

      // Reset to default button (only if custom binding exists)
      if (this.customKeyBindingsManager.hasCustomBinding(action.action)) {
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset';
        resetButton.style.cssText = `
          background: var(--text-muted);
          border: none;
          color: var(--bg-primary);
          padding: 4px 6px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 11px;
        `;
        resetButton.onclick = () => {
          this.customKeyBindingsManager.removeCustomBinding(action.action);
          keyCell.textContent = this.formatKeyCombo(this.customKeyBindingsManager.getEffectiveCombo(action.action));
          this.refreshKeyboardShortcuts(); // Update keyboard shortcuts immediately
          resetButton.remove(); // Remove reset button after resetting
        };
        buttonCell.appendChild(resetButton);
      }

      row.appendChild(buttonCell);
      content.appendChild(row);
    }

    // Reset all button at bottom
    const resetAllContainer = document.createElement('div');
    resetAllContainer.style.cssText = `
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border-primary);
      text-align: center;
    `;

    const resetAllButton = document.createElement('button');
    resetAllButton.textContent = 'Reset All to Defaults';
    resetAllButton.style.cssText = `
      background: var(--error);
      border: none;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `;
    resetAllButton.onclick = () => {
      if (confirm('Reset all custom key bindings to defaults?')) {
        this.customKeyBindingsManager.resetAll();
        this.refreshKeyboardShortcuts(); // Update keyboard shortcuts immediately
        // Close and reopen modal to refresh the list
        closeModal();
        setTimeout(() => this.showCustomKeyBindings(), 100);
      }
    };
    resetAllContainer.appendChild(resetAllButton);
    content.appendChild(resetAllContainer);

    showModal(content, { title: 'Custom Key Bindings', width: '700px' });
  }

  private formatKeyCombo(combo: KeyCombination): string {
    return describeKeyCombo(combo);
  }

  private promptForKeyBinding(action: string, keyCell: HTMLElement): void {
    const promptContent = document.createElement('div');
    promptContent.style.cssText = `
      text-align: center;
      padding: 20px;
    `;

    const instruction = document.createElement('div');
    instruction.style.cssText = `
      color: var(--text-primary);
      margin-bottom: 16px;
      font-size: 14px;
    `;
    instruction.textContent = 'Press the key combination you want to use for this action:';
    promptContent.appendChild(instruction);

    const keyDisplay = document.createElement('div');
    keyDisplay.style.cssText = `
      background: var(--bg-hover);
      border: 2px solid var(--accent-primary);
      border-radius: 8px;
      padding: 16px;
      color: var(--accent-primary);
      font-family: monospace;
      font-size: 18px;
      font-weight: bold;
      margin: 16px 0;
      min-height: 24px;
    `;
    keyDisplay.textContent = 'Waiting for key press...';
    promptContent.appendChild(keyDisplay);

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
      background: var(--text-muted);
      border: none;
      color: var(--bg-primary);
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 16px;
    `;
    // Show the prompt modal
    const { close } = showModal(promptContent, { title: 'Set Key Binding', width: '400px' });

    // Listen for key presses
    let listening = true;

    // Cleanup function to ensure event listener is always removed
    const cleanup = () => {
      listening = false;
      document.removeEventListener('keydown', handleKeyDown);
    };

    // Set up cancel button to properly clean up
    cancelButton.onclick = () => {
      cleanup();
      close();
    };
    promptContent.appendChild(cancelButton);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!listening) return;

      e.preventDefault();
      e.stopPropagation();

      // Ignore modifier-only presses
      if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }

      // Create key combination
      const combo: KeyCombination = {
        code: e.code,
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey && !e.ctrlKey
      };

      // Display the combination
      keyDisplay.textContent = this.formatKeyCombo(combo);

      // Confirm button
      const confirmButton = document.createElement('button');
      confirmButton.textContent = 'Confirm';
      confirmButton.style.cssText = `
        background: var(--accent-primary);
        border: none;
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        margin-left: 8px;
      `;
      confirmButton.onclick = () => {
        try {
          this.customKeyBindingsManager.setCustomBinding(action, combo);
          keyCell.textContent = this.formatKeyCombo(combo);
          this.refreshKeyboardShortcuts(); // Update keyboard shortcuts immediately
          cleanup();
          close();
        } catch (err) {
          alert(`Error setting key binding: ${err}`);
        }
      };

      // Replace cancel button with confirm + cancel
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        margin-top: 16px;
        display: flex;
        justify-content: center;
        gap: 8px;
      `;
      buttonContainer.appendChild(confirmButton);

      const newCancelButton = document.createElement('button');
      newCancelButton.textContent = 'Cancel';
      newCancelButton.style.cssText = `
        background: var(--text-muted);
        border: none;
        color: var(--bg-primary);
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      `;
      newCancelButton.onclick = () => {
        cleanup();
        close();
      };
      buttonContainer.appendChild(newCancelButton);

      // Replace the old cancel button
      cancelButton.replaceWith(buttonContainer);
    };

    document.addEventListener('keydown', handleKeyDown);
  }

  /**
   * Update the OCIO rendering pipeline when OCIO state changes.
   *
   * Bakes the current OCIO transform chain into a 3D LUT for GPU-accelerated
   * processing and sends it to the Viewer for real-time display.
   */
  private updateOCIOPipeline(state: OCIOState): void {
    const processor = this.ocioControl.getProcessor();

    if (state.enabled) {
      // Bake the OCIO transform chain into a 3D LUT for GPU acceleration
      // Size 33 provides a good balance of accuracy vs. memory/performance
      const bakedLUT = processor.bakeTo3DLUT(33);
      this.viewer.setOCIOBakedLUT(bakedLUT, true);
    } else {
      // Disable OCIO - clear the baked LUT
      this.viewer.setOCIOBakedLUT(null, false);
    }
  }

  private syncGTOStore(): void {
    if (!this.gtoStore) return;
    this.gtoStore.updateFromState({
      session: this.session,
      viewer: this.viewer,
      paintEngine: this.paintEngine,
      scopesState: this.scopesControl.getState(),
    });

    // Mark session as dirty for auto-save
    this.markAutoSaveDirty();
  }

  /**
   * Mark the session as having unsaved changes for auto-save
   * Uses lazy evaluation - state is only serialized when actually saving
   */
  private markAutoSaveDirty(): void {
    // Pass a getter function for lazy evaluation - serialization only happens when saving
    this.autoSaveManager.markDirty(() =>
      SessionSerializer.toJSON(
        {
          session: this.session,
          paintEngine: this.paintEngine,
          viewer: this.viewer,
        },
        this.session.currentSource?.name || 'Untitled'
      )
    );
    this.autoSaveIndicator.markUnsaved();
  }

  /**
   * Retry auto-save after a failure
   */
  private retryAutoSave(): void {
    try {
      const state = SessionSerializer.toJSON(
        {
          session: this.session,
          paintEngine: this.paintEngine,
          viewer: this.viewer,
        },
        this.session.currentSource?.name || 'Untitled'
      );
      this.autoSaveManager.saveNow(state);
    } catch (err) {
      console.error('Failed to retry auto-save:', err);
    }
  }

  /**
   * Create a quick snapshot with auto-generated name
   */
  private async createQuickSnapshot(): Promise<void> {
    try {
      const state = SessionSerializer.toJSON(
        {
          session: this.session,
          paintEngine: this.paintEngine,
          viewer: this.viewer,
        },
        this.session.currentSource?.name || 'Untitled'
      );
      const now = new Date();
      const name = `Snapshot ${now.toLocaleTimeString()}`;
      await this.snapshotManager.createSnapshot(name, state);
      showAlert(`Snapshot "${name}" created`, { type: 'success', title: 'Snapshot Created' });
    } catch (err) {
      console.error('Failed to create snapshot:', err);
      showAlert(`Failed to create snapshot: ${err}`, { type: 'error', title: 'Snapshot Error' });
    }
  }

  /**
   * Create an auto-checkpoint before major operations
   */
  private async createAutoCheckpoint(event: string): Promise<void> {
    try {
      const state = SessionSerializer.toJSON(
        {
          session: this.session,
          paintEngine: this.paintEngine,
          viewer: this.viewer,
        },
        this.session.currentSource?.name || 'Untitled'
      );
      await this.snapshotManager.createAutoCheckpoint(event, state);
    } catch (err) {
      console.error('Failed to create auto-checkpoint:', err);
    }
  }

  /**
   * Restore a snapshot by ID
   */
  private async restoreSnapshot(id: string): Promise<void> {
    try {
      const state = await this.snapshotManager.getSnapshot(id);
      if (!state) {
        showAlert('Snapshot not found', { type: 'error', title: 'Restore Error' });
        return;
      }

      // Create auto-checkpoint before restore
      await this.createAutoCheckpoint('Before Restore');

      // Restore the session state
      await SessionSerializer.fromJSON(
        state,
        {
          session: this.session,
          paintEngine: this.paintEngine,
          viewer: this.viewer,
        }
      );

      // Update UI controls with restored state
      if (state.color) this.colorControls.setAdjustments(state.color);
      if (state.cdl) this.cdlControl.setCDL(state.cdl);
      if (state.filters) this.filterControl.setSettings(state.filters);
      if (state.transform) this.transformControl.setTransform(state.transform);
      if (state.crop) this.cropControl.setState(state.crop);
      if (state.lens) this.lensControl.setParams(state.lens);

      // Close the panel
      this.snapshotPanel.hide();

      const metadata = await this.snapshotManager.getSnapshotMetadata(id);
      showAlert(`Restored "${metadata?.name || 'snapshot'}"`, { type: 'success', title: 'Snapshot Restored' });
    } catch (err) {
      console.error('Failed to restore snapshot:', err);
      showAlert(`Failed to restore snapshot: ${err}`, { type: 'error', title: 'Restore Error' });
    }
  }

  /**
   * Add current source to playlist
   */
  private addCurrentSourceToPlaylist(): void {
    const source = this.session.currentSource;
    if (!source) {
      showAlert('No source loaded', { type: 'warning', title: 'Cannot Add Clip' });
      return;
    }

    const sourceIndex = this.session.currentSourceIndex;
    const inPoint = this.session.inPoint;
    const outPoint = this.session.outPoint;

    this.playlistManager.addClip(
      sourceIndex,
      source.name || `Source ${sourceIndex + 1}`,
      inPoint,
      outPoint
    );

    showAlert(`Added "${source.name}" to playlist`, { type: 'success', title: 'Clip Added' });
  }

  /**
   * Jump to a playlist clip
   */
  private jumpToPlaylistClip(sourceIndex: number, frame: number): void {
    // Switch to the source if different
    if (this.session.currentSourceIndex !== sourceIndex) {
      this.session.setCurrentSource(sourceIndex);
    }

    // If playlist mode is enabled, use global frame
    if (this.playlistManager.isEnabled()) {
      this.playlistManager.setCurrentFrame(frame);
      const mapping = this.playlistManager.getClipAtFrame(frame);
      if (mapping) {
        this.session.currentFrame = mapping.localFrame;
      }
    }
  }

  private async saveProject(): Promise<void> {
    try {
      const state = SessionSerializer.toJSON(
        {
          session: this.session,
          paintEngine: this.paintEngine,
          viewer: this.viewer,
        },
        'project'
      );
      await SessionSerializer.saveToFile(state, 'project.orvproject');
    } catch (err) {
      showAlert(`Failed to save project: ${err}`, { type: 'error', title: 'Save Error' });
    }
  }

  private async saveRvSession(format: 'rv' | 'gto'): Promise<void> {
    try {
      const sourceName = this.session.currentSource?.name;
      const base = sourceName ? sourceName : 'session';
      const filename = `${base}.${format}`;

      if (this.gtoStore) {
        await this.gtoStore.saveToFile(filename, { binary: format === 'gto' });
      } else {
        await SessionGTOExporter.saveToFile(this.session, this.paintEngine, filename, { binary: format === 'gto' });
      }
    } catch (err) {
      showAlert(`Failed to save RV session: ${err}`, { type: 'error', title: 'Save Error' });
    }
  }

  private async openProject(file: File): Promise<void> {
    try {
      // Create auto-checkpoint before loading new project
      await this.createAutoCheckpoint('Before Project Load');

      const state = await SessionSerializer.loadFromFile(file);
      const result = await SessionSerializer.fromJSON(
        state,
        {
          session: this.session,
          paintEngine: this.paintEngine,
          viewer: this.viewer,
        }
      );

      if (result.warnings.length > 0) {
        showAlert(`Project loaded with warnings:\n${result.warnings.join('\n')}`, {
          type: 'warning',
          title: 'Project Loaded',
        });
      } else if (result.loadedMedia > 0) {
        showAlert(`Project loaded successfully (${result.loadedMedia} media files)`, {
          type: 'success',
          title: 'Project Loaded',
        });
      } else {
        showAlert('Project loaded (no media files - state only)', {
          type: 'info',
          title: 'Project Loaded',
        });
      }
    } catch (err) {
      showAlert(`Failed to load project: ${err}`, { type: 'error', title: 'Load Error' });
    }
  }

  /**
   * Get configuration for the public scripting API (window.openrv)
   */
  getAPIConfig(): OpenRVAPIConfig {
    return {
      session: this.session,
      viewer: this.viewer,
      colorControls: this.colorControls,
      cdlControl: this.cdlControl,
    };
  }

  dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }

    // Remove global event listeners
    window.removeEventListener('resize', this.boundHandleResize);
    document.removeEventListener('visibilitychange', this.boundHandleVisibilityChange);

    this.viewer.dispose();
    this.timeline.dispose();
    this.cacheIndicator.dispose();
    this.headerBar.dispose();
    this.tabBar.dispose();
    this.contextToolbar.dispose();
    this.paintToolbar.dispose();
    this.colorControls.dispose();
    this.zoomControl.dispose();
    this.scopesControl.dispose();
    this.compareControl.dispose();
    this.transformControl.dispose();
    this.filterControl.dispose();
    this.cropControl.dispose();
    this.cdlControl.dispose();
    this.colorInversionToggle.dispose();
    this.displayProfileControl.dispose();
    this.curvesControl.dispose();
    this.lensControl.dispose();
    this.stackControl.dispose();
    this.channelSelect.dispose();
    this.parControl.dispose();
    this.backgroundPatternControl.dispose();
    this.stereoControl.dispose();
    this.histogram.dispose();
    this.waveform.dispose();
    this.vectorscope.dispose();
    this.textFormattingToolbar.dispose();
    this.autoSaveIndicator.dispose();
    this.snapshotPanel.dispose();
    this.snapshotManager.dispose();
    this.playlistPanel.dispose();
    this.playlistManager.dispose();
    this.fullscreenManager?.dispose();
    this.presentationMode.dispose();
    this.networkSyncManager.dispose();
    this.networkControl.dispose();
    // Dispose auto-save manager (fire and forget - we can't await in dispose)
    this.autoSaveManager.dispose().catch(err => {
      console.error('Error disposing auto-save manager:', err);
    });
  }
}
