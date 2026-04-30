/**
 * App - Thin composition root / orchestrator.
 *
 * Creates the session, viewer, and controls (via AppControlRegistry),
 * then delegates event wiring to focused wiring modules:
 * - AppColorWiring: color controls <-> session/viewer
 * - AppViewWiring: view/zoom/pan/stereo controls <-> viewer
 * - AppEffectsWiring: filter/crop/lens controls <-> viewer
 * - AppTransformWiring: transform control <-> viewer (with history)
 * - AppPlaybackWiring: volume/export/headerbar/playlist controls
 * - AppStackWiring: stack/composite controls <-> viewer
 * - AppDCCWiring: DCCBridge events <-> session/viewer/controls
 *
 * Handles top-level lifecycle (init, mount, dispose) and the render loop.
 */

import { wireColorControls, updateOCIOPipeline } from './AppColorWiring';
import { AppControlRegistry } from './AppControlRegistry';
import { wireDCCBridge } from './AppDCCWiring';
import { wireEffectsControls } from './AppEffectsWiring';
import { AppKeyboardHandler } from './AppKeyboardHandler';
import { AppNetworkBridge } from './AppNetworkBridge';
import { AppPersistenceManager } from './AppPersistenceManager';
import { wirePlaybackControls } from './AppPlaybackWiring';
import { AppSessionBridge } from './AppSessionBridge';
import { detectDisplayCapabilities, type DisplayCapabilities } from './color/DisplayCapabilities';
import { Session } from './core/session/Session';
import { Viewer } from './ui/components/Viewer';
import { Timeline } from './ui/components/Timeline';
import { TimelineMagnifier } from './ui/components/TimelineMagnifier';
import { HeaderBar } from './ui/components/layout/HeaderBar';
import type { TabId } from './ui/components/layout/TabBar';
import { TabBar } from './ui/components/layout/TabBar';
import { ContextToolbar } from './ui/components/layout/ContextToolbar';
import { PaintEngine } from './paint/PaintEngine';
import { KeyboardManager } from './utils/input/KeyboardManager';
import { CustomKeyBindingsManager } from './utils/input/CustomKeyBindingsManager';
import { getGlobalHistoryManager } from './utils/HistoryManager';
import { Logger } from './utils/Logger';
import { getThemeManager } from './utils/ui/ThemeManager';
import { getCorePreferencesManager } from './core/PreferencesManager';
import type { OpenRVAPIConfig } from './api/OpenRVAPI';
import { RenderLoopService } from './services/RenderLoopService';
import { FrameNavigationService } from './services/FrameNavigationService';
import { SessionURLService } from './services/SessionURLService';
import { TimelineEditorService } from './services/TimelineEditorService';
import { buildActionHandlers } from './services/KeyboardActionMap';
import { LayoutOrchestrator } from './services/LayoutOrchestrator';
import type { ColorWiringState } from './AppColorWiring';
import type { AppWiringContext, StatefulWiringResult } from './AppWiringContext';

// Wiring modules
import { wireViewControls } from './AppViewWiring';
import { wireTransformControls } from './AppTransformWiring';
import { wireStackControls } from './AppStackWiring';
import { NoteOverlay } from './ui/components/NoteOverlay';
import { GotoFrameOverlay } from './ui/components/GotoFrameOverlay';
import { RemoteCursorsOverlay } from './ui/components/RemoteCursorsOverlay';
import { FrameCacheController } from './cache/FrameCacheController';
import { detectDefaultBudget } from './config/CacheConfig';
import { ShotGridIntegrationBridge } from './integrations/ShotGridIntegrationBridge';
import { ClientMode } from './ui/components/ClientMode';
import { ExternalPresentation } from './ui/components/ExternalPresentation';
import { ActiveContextManager, type BindingContext } from './utils/input/ActiveContextManager';
import { ContextualKeyboardManager } from './utils/input/ContextualKeyboardManager';
import { AudioOrchestrator } from './services/AudioOrchestrator';
import { DCCBridge } from './integrations/DCCBridge';
import { resolveDCCEndpoint } from './integrations/DCCSettings';
import { MediaCacheManager } from './cache/MediaCacheManager';
import { showAlert } from './ui/components/shared/Modal';
import { DisposableSubscriptionManager } from './utils/DisposableSubscriptionManager';
import { VirtualSliderController } from './ui/components/VirtualSliderController';
import { getCurrentSourceStartFrame } from './utils/media/SourceUIState';

const log = new Logger('App');

// Layout
import { LayoutStore } from './ui/layout/LayoutStore';
import { LayoutManager } from './ui/layout/LayoutManager';
import { SequenceGroupNode } from './nodes/groups/SequenceGroupNode';

/**
 * Maps tab IDs to their binding contexts for keyboard shortcut resolution.
 * Exported for testability — regression tests verify this mapping to prevent
 * scope shortcut bugs (e.g., G opening goto-frame instead of gamut diagram on QC tab).
 */
export const TAB_CONTEXT_MAP: Record<string, BindingContext> = {
  annotate: 'paint',
  transform: 'transform',
  view: 'viewer',
  qc: 'panel',
  color: 'color',
};

export class App {
  private container: HTMLElement | null = null;
  private session: Session;
  private viewer: Viewer;
  private timeline: Timeline;
  private timelineMagnifier: TimelineMagnifier;
  private headerBar: HeaderBar;
  private tabBar: TabBar;
  private contextToolbar: ContextToolbar;
  private paintEngine: PaintEngine;
  private controls: AppControlRegistry;
  private noteOverlay: NoteOverlay;
  private gotoFrameOverlay: GotoFrameOverlay;
  private renderLoop!: RenderLoopService;
  private frameNavigation!: FrameNavigationService;
  private timelineEditorService!: TimelineEditorService;
  private boundHandleResize: () => void;
  private boundHandleVisibilityChange: () => void;
  private wasPlayingBeforeHide = false;
  private keyboardManager: KeyboardManager;
  private customKeyBindingsManager: CustomKeyBindingsManager;
  private keyboardHandler!: AppKeyboardHandler;
  private networkBridge: AppNetworkBridge;
  private sessionURLService: SessionURLService;
  private persistenceManager: AppPersistenceManager;
  private sessionBridge!: AppSessionBridge;
  private shotGridBridge: ShotGridIntegrationBridge;
  private clientMode: ClientMode;
  private externalPresentation: ExternalPresentation;
  private activeContextManager: ActiveContextManager;
  private cacheManager: MediaCacheManager;
  private audioOrchestrator: AudioOrchestrator;
  private remoteCursorsOverlay: RemoteCursorsOverlay;
  private frameCacheController: FrameCacheController;
  private dccBridge: DCCBridge | null = null;
  private virtualSliderController: VirtualSliderController | null = null;
  private contextualKeyboardManager: ContextualKeyboardManager;
  private layoutOrchestrator!: LayoutOrchestrator;

  // Customizable layout
  private layoutStore: LayoutStore;
  private layoutManager: LayoutManager;

  // Display capabilities for wide color gamut / HDR support
  private displayCapabilities: DisplayCapabilities;

  // Wiring state (managed by wiring modules, cleaned up on dispose)
  private colorWiringState!: StatefulWiringResult<ColorWiringState>;
  private wiringSubscriptions = new DisposableSubscriptionManager();

  constructor() {
    // Detect display capabilities at startup (P3, HDR, WebGPU)
    this.displayCapabilities = detectDisplayCapabilities();

    // Bind event handlers for proper cleanup
    this.boundHandleResize = () => {
      this.viewer.resize();
      const container = this.viewer.getContainer();
      this.remoteCursorsOverlay.setViewerDimensions(container.clientWidth, container.clientHeight);
    };
    this.boundHandleVisibilityChange = this.handleVisibilityChange.bind(this);

    // Initialize client mode (restricted UI for review presentations)
    this.clientMode = new ClientMode();
    this.clientMode.checkURLParam();

    // Active context manager (key binding context scoping)
    this.activeContextManager = new ActiveContextManager();
    this.contextualKeyboardManager = new ContextualKeyboardManager(this.activeContextManager);

    // Create core components
    this.session = new Session();
    this.session.fps = getCorePreferencesManager().getGeneralPrefs().defaultFps;
    this.session.setHDRResizeTier(this.displayCapabilities.canvasHDRResizeTier);
    this.paintEngine = new PaintEngine();
    this.viewer = new Viewer({
      session: this.session,
      paintEngine: this.paintEngine,
      capabilities: this.displayCapabilities,
    });
    this.renderLoop = new RenderLoopService({ session: this.session, viewer: this.viewer });
    this.timeline = new Timeline(this.session, this.paintEngine);

    // Create timeline magnifier (zoomed-in timeline sub-view)
    this.timelineMagnifier = new TimelineMagnifier(this.session, this.timeline.getWaveformRenderer(), this.paintEngine);

    // Wire magnifier toggle button on main timeline
    this.timeline.setMagnifierToggle(() => this.timelineMagnifier.toggle());

    // Create OPFS media cache manager
    this.cacheManager = new MediaCacheManager();

    // Create frame cache controller (adaptive caching with memory budget)
    this.frameCacheController = new FrameCacheController({
      memoryBudgetBytes: detectDefaultBudget(),
    });

    // Wire session playback events to the frame cache controller
    this.wiringSubscriptions.add(
      this.session.on('frameChanged', () => {
        this.frameCacheController.onPlaybackStateChange({
          currentFrame: this.session.currentFrame,
          inPoint: this.session.inPoint,
          outPoint: this.session.outPoint,
        });
      }),
    );
    this.wiringSubscriptions.add(
      this.session.on('playbackChanged', (playing: boolean) => {
        if (playing) {
          this.frameCacheController.onPlaybackStart(
            this.session.playDirection as 1 | -1,
            this.session.playbackSpeed,
            this.session.currentFrame,
          );
        } else {
          this.frameCacheController.onPlaybackStop();
        }
      }),
    );
    this.wiringSubscriptions.add(
      this.session.on('sourceLoaded', () => {
        this.frameCacheController.onPlaybackStateChange({
          currentFrame: this.session.currentFrame,
          inPoint: this.session.inPoint,
          outPoint: this.session.outPoint,
        });
      }),
    );

    // Create all UI controls via the registry
    this.controls = new AppControlRegistry({
      session: this.session,
      viewer: this.viewer,
      paintEngine: this.paintEngine,
      displayCapabilities: this.displayCapabilities,
    });

    // Wire NoteOverlay into timeline for note visualization
    this.noteOverlay = new NoteOverlay(this.session);

    // Create goto-frame overlay (inline text entry for frame navigation)
    this.gotoFrameOverlay = new GotoFrameOverlay(this.session);

    // Create remote cursors overlay for collaboration cursor rendering
    this.remoteCursorsOverlay = new RemoteCursorsOverlay();
    this.timeline.setNoteOverlay(this.noteOverlay);
    this.timeline.setPlaylistManagers(this.controls.playlistManager, this.controls.transitionManager);

    // Create HeaderBar (contains file ops, playback, volume, export, help)
    this.headerBar = new HeaderBar(this.session);
    this.syncCurrentSourceTimecodeOffsets();
    this.wiringSubscriptions.add(this.session.on('sourceLoaded', () => this.syncCurrentSourceTimecodeOffsets()));
    this.wiringSubscriptions.add(this.session.on('durationChanged', () => this.syncCurrentSourceTimecodeOffsets()));
    this.wiringSubscriptions.add(
      this.session.on('representationChanged', () => this.syncCurrentSourceTimecodeOffsets()),
    );

    // Create TabBar and ContextToolbar
    this.tabBar = new TabBar();
    this.contextToolbar = new ContextToolbar();

    // Create layout system (persists panel sizes/presets to localStorage)
    this.layoutStore = new LayoutStore();
    this.layoutManager = new LayoutManager(this.layoutStore);
    this.headerBar.setLayoutPresets(
      this.layoutStore.getPresets().map(({ id, label }) => ({ id, label })),
      (presetId) => this.layoutStore.applyPreset(presetId),
    );
    this.wiringSubscriptions.add(
      this.tabBar.on('tabChanged', (tabId: TabId) => {
        this.contextToolbar.setActiveTab(tabId);
        // Update active context for key binding scoping
        this.activeContextManager.setContext(TAB_CONTEXT_MAP[tabId] ?? 'global');
      }),
    );

    // Initialize keyboard manager
    this.keyboardManager = new KeyboardManager();

    // Initialize custom key bindings manager
    // Guard: the callback fires during construction (applyCustomBindings),
    // before keyboardHandler is assigned - skip the refresh in that case;
    // the explicit refresh below covers the initial load.
    this.customKeyBindingsManager = new CustomKeyBindingsManager(() => {
      this.keyboardHandler?.refresh();
    });

    // Initialize keyboard handler (manages shortcuts, dialogs)
    this.keyboardHandler = new AppKeyboardHandler(this.keyboardManager, this.customKeyBindingsManager, {
      getActionHandlers: () => this.getActionHandlers(),
      getContainer: () => this.container!,
    });
    this.keyboardHandler.setup();

    // Apply any stored custom bindings to the keyboard shortcuts
    this.keyboardHandler.refresh();

    // Hook up contextual keyboard manager to the global keyboard manager
    this.keyboardManager.setContextualManager(this.contextualKeyboardManager);

    // Register conflicting key bindings with the contextual keyboard manager
    // so that context-aware resolution can pick the right action based on
    // which tab/context is active (e.g., paint vs timeline).
    this.contextualKeyboardManager.register(
      'timeline.resetInOut',
      { code: 'KeyR' },
      () => this.session.resetInOutPoints(),
      'global',
      'Reset in/out points',
    );
    this.contextualKeyboardManager.register(
      'paint.rectangle',
      { code: 'KeyR' },
      () => this.controls.paintToolbar.handleKeyboard('r'),
      'paint',
      'Select rectangle tool',
    );
    this.contextualKeyboardManager.register(
      'timeline.setOutPoint',
      { code: 'KeyO' },
      () => this.session.setOutPoint(),
      'global',
      'Set out point',
    );
    this.contextualKeyboardManager.register(
      'paint.ellipse',
      { code: 'KeyO' },
      () => this.controls.paintToolbar.handleKeyboard('o'),
      'paint',
      'Select ellipse tool',
    );
    this.contextualKeyboardManager.register(
      'playback.faster',
      { code: 'KeyL' },
      () => this.session.increaseSpeed(),
      'global',
      'Increase playback speed',
    );
    this.contextualKeyboardManager.register(
      'paint.line',
      { code: 'KeyL' },
      () => this.controls.paintToolbar.handleKeyboard('l'),
      'paint',
      'Select line tool',
    );

    // KeyG: navigation.gotoFrame (global) vs paint.toggleGhost (paint) vs panel.gamutDiagram (panel)
    this.contextualKeyboardManager.register(
      'navigation.gotoFrame',
      { code: 'KeyG' },
      () => this.gotoFrameOverlay.show(),
      'global',
      'Go to frame (open frame entry)',
    );
    this.contextualKeyboardManager.register(
      'paint.toggleGhost',
      { code: 'KeyG' },
      () => this.controls.paintToolbar.handleKeyboard('g'),
      'paint',
      'Toggle ghost mode',
    );
    this.contextualKeyboardManager.register(
      'panel.gamutDiagram',
      { code: 'KeyG' },
      () => this.controls.scopesControl.toggleScope('gamutDiagram'),
      'panel',
      'Toggle CIE gamut diagram',
    );

    // KeyH: view.fitToHeight (global) vs panel.histogram (panel)
    this.contextualKeyboardManager.register(
      'view.fitToHeight',
      { code: 'KeyH' },
      () => this.viewer.smoothFitToHeight(),
      'global',
      'Fit image height to window',
    );
    this.contextualKeyboardManager.register(
      'panel.histogram',
      { code: 'KeyH' },
      () => this.controls.scopesControl.toggleScope('histogram'),
      'panel',
      'Toggle histogram',
    );

    // KeyW: view.fitToWidth (global) vs panel.waveform (panel)
    this.contextualKeyboardManager.register(
      'view.fitToWidth',
      { code: 'KeyW' },
      () => this.viewer.smoothFitToWidth(),
      'global',
      'Fit image width to window',
    );
    this.contextualKeyboardManager.register(
      'panel.waveform',
      { code: 'KeyW' },
      () => this.controls.scopesControl.toggleScope('waveform'),
      'panel',
      'Toggle waveform scope',
    );

    // Shift+R: channel.red (global) vs transform.rotateLeft (transform context)
    // Channel shortcuts are global so they work from any tab (like Shift+G and Shift+A).
    // transform.rotateLeft only activates when the Transform tab is selected.
    this.contextualKeyboardManager.register(
      'channel.red',
      { code: 'KeyR', shift: true },
      () => this.controls.channelSelect.handleKeyboard('R', true),
      'global',
      'Select red channel',
    );
    this.contextualKeyboardManager.register(
      'transform.rotateLeft',
      { code: 'KeyR', shift: true },
      () => this.controls.transformControl.rotateLeft(),
      'transform',
      'Rotate left 90 degrees',
    );

    // Shift+B: channel.blue (global) vs view.cycleBackgroundPattern (viewer context)
    // Channel shortcuts are global; background pattern cycling is viewer-context only.
    this.contextualKeyboardManager.register(
      'channel.blue',
      { code: 'KeyB', shift: true },
      () => this.controls.channelSelect.handleKeyboard('B', true),
      'global',
      'Select blue channel',
    );
    this.contextualKeyboardManager.register(
      'view.cycleBackgroundPattern',
      { code: 'KeyB', shift: true },
      () => this.controls.backgroundPatternControl.cyclePattern(),
      'viewer',
      'Cycle background pattern',
    );

    // Shift+N: channel.none (global) vs network.togglePanel (panel context)
    // Channel shortcuts are global; network panel toggle is panel-context only.
    this.contextualKeyboardManager.register(
      'channel.none',
      { code: 'KeyN', shift: true },
      () => this.controls.channelSelect.handleKeyboard('N', true),
      'global',
      'Select no channel',
    );
    this.contextualKeyboardManager.register(
      'network.togglePanel',
      { code: 'KeyN', shift: true },
      () => this.controls.networkControl.togglePanel(),
      'panel',
      'Toggle network sync panel',
    );

    // Shift+L: channel.luminance (global) vs lut.togglePanel (color context)
    // Channel shortcuts are global; LUT pipeline panel toggle is color-tab-context only.
    this.contextualKeyboardManager.register(
      'channel.luminance',
      { code: 'KeyL', shift: true },
      () => this.controls.channelSelect.handleKeyboard('L', true),
      'global',
      'Select luminance channel',
    );
    this.contextualKeyboardManager.register(
      'lut.togglePanel',
      { code: 'KeyL', shift: true },
      () => this.controls.lutPipelinePanel.toggle(),
      'color',
      'Toggle LUT pipeline panel',
    );

    // Wire unified preferences facade with live subsystem references
    getCorePreferencesManager().setSubsystems({
      theme: getThemeManager(),
      layout: this.layoutStore,
      keyBindings: this.customKeyBindingsManager,
      ocio: this.controls.ocioControl.getStateManager(),
    });

    // Initialize persistence manager
    this.persistenceManager = new AppPersistenceManager({
      session: this.session,
      viewer: this.viewer,
      paintEngine: this.paintEngine,
      autoSaveManager: this.controls.autoSaveManager,
      autoSaveIndicator: this.controls.autoSaveIndicator,
      snapshotManager: this.controls.snapshotManager,
      snapshotPanel: this.controls.snapshotPanel,
      scopesControl: this.controls.scopesControl,
      colorControls: this.controls.colorControls,
      cdlControl: this.controls.cdlControl,
      filterControl: this.controls.filterControl,
      transformControl: this.controls.transformControl,
      cropControl: this.controls.cropControl,
      lensControl: this.controls.lensControl,
      noiseReductionControl: this.controls.noiseReductionControl,
      watermarkControl: this.controls.watermarkControl,
      playlistManager: this.controls.playlistManager,
      cacheManager: this.cacheManager,
    });

    // Initialize session bridge (session event handlers, scope updates, info panel)
    this.sessionBridge = new AppSessionBridge({
      getSession: () => this.session,
      getViewer: () => this.viewer,
      getPaintEngine: () => this.paintEngine,
      getPersistenceManager: () => this.persistenceManager,
      getScopesControl: () => this.controls.scopesControl,
      getHistogram: () => this.controls.histogram,
      getWaveform: () => this.controls.waveform,
      getVectorscope: () => this.controls.vectorscope,
      getGamutDiagram: () => this.controls.gamutDiagram,
      getInfoPanel: () => this.controls.infoPanel,
      getCropControl: () => this.controls.cropControl,
      getOCIOControl: () => this.controls.ocioControl,
      getToneMappingControl: () => this.controls.toneMappingControl,
      getColorControls: () => this.controls.colorControls,
      getCompareControl: () => this.controls.compareControl,
      getChannelSelect: () => this.controls.channelSelect,
      getStackControl: () => this.controls.stackControl,
      getFilterControl: () => this.controls.filterControl,
      getNoiseReductionControl: () => this.controls.noiseReductionControl,
      getCDLControl: () => this.controls.cdlControl,
      getTransformControl: () => this.controls.transformControl,
      getLensControl: () => this.controls.lensControl,
      getStereoControl: () => this.controls.stereoControl,
      getStereoEyeTransformControl: () => this.controls.stereoEyeTransformControl,
      getStereoAlignControl: () => this.controls.stereoAlignControl,
    });

    // Session URL state management (capture/apply/bootstrap)
    this.sessionURLService = new SessionURLService({
      session: this.session,
      viewer: this.viewer,
      compareControl: this.controls.compareControl,
      ocioControl: this.controls.ocioControl,
      networkSyncManager: this.controls.networkSyncManager,
      networkControl: this.controls.networkControl,
      getLocationSearch: () => window.location.search,
      getLocationHash: () => window.location.hash,
      getLocationHref: () => window.location.href,
    });

    // Network Sync
    this.networkBridge = new AppNetworkBridge({
      session: this.session,
      viewer: this.viewer,
      paintEngine: this.paintEngine,
      colorControls: this.controls.colorControls,
      networkSyncManager: this.controls.networkSyncManager,
      networkControl: this.controls.networkControl,
      headerBar: this.headerBar,
      remoteCursorsOverlay: this.remoteCursorsOverlay,
      getSessionURLState: () => this.sessionURLService.captureSessionURLState(),
      applySessionURLState: (state) => this.sessionURLService.applySessionURLState(state),
    });
    this.networkBridge.setup();

    // ShotGrid integration bridge
    this.shotGridBridge = new ShotGridIntegrationBridge({
      session: this.session,
      configUI: this.controls.shotGridConfig,
      panel: this.controls.shotGridPanel,
      playlistManager: this.controls.playlistManager,
    });
    this.shotGridBridge.setup();

    // External presentation (multi-window BroadcastChannel sync)
    this.externalPresentation = new ExternalPresentation();
    this.externalPresentation.initialize();

    // Wire HeaderBar external presentation button
    this.wiringSubscriptions.add(
      this.headerBar.on('externalPresentation', () => this.externalPresentation.openWindow()),
    );

    // Wire session events to external presentation
    this.wiringSubscriptions.add(
      this.session.on('frameChanged', () => {
        if (this.externalPresentation.hasOpenWindows) {
          this.externalPresentation.syncFrame(this.session.currentFrame, this.session.frameCount);
        }
      }),
    );
    this.wiringSubscriptions.add(
      this.session.on('playbackChanged', (playing: boolean) => {
        if (this.externalPresentation.hasOpenWindows) {
          this.externalPresentation.syncPlayback(playing, this.session.playbackSpeed, this.session.currentFrame);
        }
      }),
    );

    // Wire color adjustment changes to external presentation windows
    this.wiringSubscriptions.add(
      this.controls.colorControls.on('adjustmentsChanged', (adjustments) => {
        if (this.externalPresentation.hasOpenWindows) {
          this.externalPresentation.syncColor({
            exposure: adjustments.exposure,
            gamma: adjustments.gamma,
            temperature: adjustments.temperature,
            tint: adjustments.tint,
          });
        }
      }),
    );

    // Audio orchestrator (manages AudioMixer lifecycle and session wiring)
    this.audioOrchestrator = new AudioOrchestrator({ session: this.session });
    this.audioOrchestrator.bindEvents();

    // Frame navigation service (playlist/annotation navigation)
    this.frameNavigation = new FrameNavigationService({
      session: this.session,
      playlistManager: this.controls.playlistManager,
      playlistPanel: this.controls.playlistPanel,
      paintEngine: this.paintEngine,
    });

    // Timeline editor service (EDL/SequenceGroup editing)
    this.timelineEditorService = new TimelineEditorService({
      session: this.session,
      timelineEditor: this.controls.timelineEditor,
      playlistManager: this.controls.playlistManager,
      timeline: this.timeline,
      persistenceManager: this.persistenceManager,
      jumpToPlaylistGlobalFrame: (frame) => this.frameNavigation.jumpToPlaylistGlobalFrame(frame),
      isSequenceGroupNode: (node: unknown): node is SequenceGroupNode => node instanceof SequenceGroupNode,
    });

    // DCC Bridge (optional WebSocket integration with DCC tools)
    // Priority: ?dcc= query param > persisted DCC endpoint preference
    const dccUrl = resolveDCCEndpoint();
    if (dccUrl) {
      this.dccBridge = new DCCBridge({ url: dccUrl });

      const dccState = wireDCCBridge({
        dccBridge: this.dccBridge,
        session: this.session,
        viewer: this.viewer,
        colorControls: this.controls.colorControls,
      });
      this.wiringSubscriptions.add(() => dccState?.subscriptions?.dispose());

      this.dccBridge.connect();
    }

    // Build the wiring context shared by all wiring modules
    const wiringCtx: AppWiringContext = {
      session: this.session,
      viewer: this.viewer,
      paintEngine: this.paintEngine,
      headerBar: this.headerBar,
      tabBar: this.tabBar,
      controls: this.controls,
      sessionBridge: this.sessionBridge,
      persistenceManager: this.persistenceManager,
    };

    // Wire all control groups via focused wiring modules.
    // Each module returns a WiringResult (or StatefulWiringResult) with subscriptions.
    const wiringResults = [
      (this.colorWiringState = wireColorControls(wiringCtx)),
      wireViewControls(wiringCtx),
      wireEffectsControls(wiringCtx),
      wireTransformControls(wiringCtx),
      wirePlaybackControls(wiringCtx, {
        getKeyboardHandler: () => this.keyboardHandler,
        getFullscreenManager: () => this.fullscreenManager ?? undefined,
        getAudioMixer: () => this.audioOrchestrator.getAudioMixer(),
      }),
      wireStackControls(wiringCtx),
    ];
    for (const result of wiringResults) {
      if (result?.subscriptions) {
        this.wiringSubscriptions.add(() => result.subscriptions.dispose());
      }
    }

    // Virtual slider controller (key-hold-to-adjust color parameters)
    this.virtualSliderController = new VirtualSliderController({
      colorControls: this.controls.colorControls,
      container: this.viewer.getContainer(),
      keyboardManager: this.keyboardManager,
      viewerQuery: { isInteracting: () => this.viewer.isInteracting() },
    });
    this.wiringSubscriptions.add(() => this.virtualSliderController?.dispose());

    // Timeline editor wiring (EDL/SequenceGroup integration)
    this.timelineEditorService.bindEvents();
  }

  async mount(selector: string): Promise<void> {
    this.container = document.querySelector(selector);
    if (!this.container) {
      throw new Error(`Container not found: ${selector}`);
    }

    // Create layout (LayoutOrchestrator builds the DOM tree)
    this.layoutOrchestrator = new LayoutOrchestrator({
      container: this.container,
      session: this.session,
      viewer: this.viewer,
      headerBar: this.headerBar,
      tabBar: this.tabBar,
      contextToolbar: this.contextToolbar,
      timeline: this.timeline,
      layoutManager: this.layoutManager,
      layoutStore: this.layoutStore,
      controls: Object.assign(this.controls, { timelineMagnifier: this.timelineMagnifier }),
      sessionBridge: this.sessionBridge,
      clientMode: this.clientMode,
      paintEngine: this.paintEngine,
      customKeyBindingsManager: this.customKeyBindingsManager,
    });
    this.layoutOrchestrator.createLayout();

    // Mount goto-frame overlay into the viewer slot (position: relative parent)
    this.layoutManager.getViewerSlot().appendChild(this.gotoFrameOverlay.getElement());

    // Mount remote cursors overlay into the viewer container
    this.viewer.getContainer().appendChild(this.remoteCursorsOverlay.getElement());

    // Re-register keyboard shortcuts now that focusManager and other
    // layout-dependent objects (fullscreenManager, shortcutCheatSheet) are
    // available.  The initial registration happened during the constructor
    // when these were still null.
    this.keyboardHandler.refresh();

    this.bindEvents();
    this.renderLoop.start();

    // Lazy-initialize AudioContext on first user interaction (browser policy)
    this.audioOrchestrator.setupLazyInit();

    // Initialize OCIO pipeline from persisted state (if OCIO was enabled before page reload)
    updateOCIOPipeline(
      {
        session: this.session,
        viewer: this.viewer,
        paintEngine: this.paintEngine,
        headerBar: this.headerBar,
        tabBar: this.tabBar,
        controls: this.controls,
        sessionBridge: this.sessionBridge,
        persistenceManager: this.persistenceManager,
      },
      this.controls.ocioControl.getState(),
    );

    // Initialize display profile from persisted state
    this.viewer.setDisplayColorState(this.controls.displayProfileControl.getState());

    // Subscribe to cache error events so failures are visible to the user
    this.wiringSubscriptions.add(
      this.cacheManager.on('error', (event) => {
        console.warn('[OpenRV] Media cache error:', event.message);

        // Surface error in the CacheIndicator UI
        this.controls.cacheIndicator.showError(event.message);

        const isInitFailure = event.message.startsWith('Initialization failed');
        if (isInitFailure) {
          showAlert('Media caching is unavailable. Playback may be slower without frame caching.', {
            title: 'Cache Unavailable',
            type: 'warning',
          });
        }
      }),
    );

    // Initialize OPFS media cache (fire-and-forget; no-op if unavailable)
    this.cacheManager.initialize().catch((err) => {
      log.debug('OPFS cache unavailable:', err);
    });

    // Initialize persistence (auto-save and snapshots)
    await this.persistenceManager.init();

    // Optional URL bootstrap:
    // - auto-join room from ?room=...&pin=...
    // - apply initial shared session hash from #s=...
    await this.sessionURLService.handleURLBootstrap();
  }

  /** Convenience accessors for layout-owned sub-objects */
  private get fullscreenManager() {
    return this.layoutOrchestrator?.fullscreenManager ?? null;
  }
  private get focusManager() {
    return this.layoutOrchestrator?.focusManager ?? null;
  }
  private get shortcutCheatSheet() {
    return this.layoutOrchestrator?.shortcutCheatSheet ?? null;
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
      this.controls.histogram.setPlaybackMode(true);
      this.controls.waveform.setPlaybackMode(true);
      this.controls.vectorscope.setPlaybackMode(true);
    } else {
      // Tab is visible again - restore playback if it was playing before
      if (this.wasPlayingBeforeHide) {
        this.session.play();
        this.wasPlayingBeforeHide = false;
      }
      // Restore scope quality if not playing
      if (!this.session.isPlaying) {
        this.controls.histogram.setPlaybackMode(false);
        this.controls.waveform.setPlaybackMode(false);
        this.controls.vectorscope.setPlaybackMode(false);
        // Update scopes with full quality
        this.sessionBridge.updateHistogram();
        this.sessionBridge.updateWaveform();
        this.sessionBridge.updateVectorscope();
      }
    }
  }

  private bindEvents(): void {
    // Handle window resize
    this.wiringSubscriptions.addDOMListener(window, 'resize', this.boundHandleResize);

    // Handle page visibility changes (pause playback when tab is hidden)
    this.wiringSubscriptions.addDOMListener(document, 'visibilitychange', this.boundHandleVisibilityChange);

    // Initialize keyboard shortcuts
    this.keyboardManager.attach();

    this.wiringSubscriptions.add(
      this.paintEngine.on('annotationsChanged', () => this.persistenceManager.syncGTOStore()),
    );
    this.wiringSubscriptions.add(this.paintEngine.on('effectsChanged', () => this.persistenceManager.syncGTOStore()));

    // Record paint actions in history
    this.wiringSubscriptions.add(
      this.paintEngine.on('strokeAdded', (annotation) => {
        const historyManager = getGlobalHistoryManager();
        const annotationType =
          annotation.type === 'pen'
            ? 'stroke'
            : annotation.type === 'shape'
              ? (annotation as { shapeType?: string }).shapeType || 'shape'
              : annotation.type;
        historyManager.recordAction(
          `Add ${annotationType}`,
          'paint',
          () => this.paintEngine.undo(),
          () => this.paintEngine.redo(),
        );
      }),
    );
  }

  /**
   * Returns the map of action names to handler functions.
   * Called by AppKeyboardHandler to register keyboard shortcuts.
   * Delegates to the extracted buildActionHandlers() pure function.
   */
  private getActionHandlers(): Record<string, () => void> {
    return buildActionHandlers({
      session: this.session,
      viewer: this.viewer,
      paintEngine: this.paintEngine,
      tabBar: this.tabBar,
      controls: Object.assign(this.controls, {
        timelineMagnifier: this.timelineMagnifier,
        gotoFrameOverlay: this.gotoFrameOverlay,
      }),
      activeContextManager: this.activeContextManager,
      fullscreenManager: this.fullscreenManager,
      focusManager: this.focusManager,
      shortcutCheatSheet: this.shortcutCheatSheet,
      persistenceManager: this.persistenceManager,
      sessionBridge: this.sessionBridge,
      layoutStore: this.layoutStore,
      externalPresentation: this.externalPresentation,
      headerBar: this.headerBar,
      frameNavigation: this.frameNavigation,
      frameCacheController: this.frameCacheController,
    });
  }

  private syncCurrentSourceTimecodeOffsets(): void {
    const startFrame = getCurrentSourceStartFrame(this.session.currentSource);
    this.gotoFrameOverlay.setStartFrame(startFrame);
    this.headerBar.getTimecodeDisplay().setStartFrame(startFrame);
  }

  /**
   * Get configuration for the public scripting API (window.openrv)
   */
  getAPIConfig(): OpenRVAPIConfig {
    return {
      session: this.session,
      viewer: this.viewer,
      colorControls: this.controls.colorControls,
      cdlControl: this.controls.cdlControl,
      curvesControl: this.controls.curvesControl,
      // Wire the Viewer as both the simple LUTProvider and the multi-stage
      // LUTPipelineProvider. The Viewer satisfies both interfaces structurally.
      // (Without lutProvider here, the documented public LUT methods at
      // docs/color/lut.md were unreachable — fix-along-the-way for MED-51.)
      lutProvider: this.viewer,
      lutPipelineProvider: this.viewer,
      persistenceManager: this.persistenceManager,
      pixelProbeProvider: this.viewer.getPixelProbe(),
    };
  }

  /**
   * Get the PaintEngine instance for plugin system bootstrap.
   */
  getPaintEngine(): PaintEngine {
    return this.paintEngine;
  }

  dispose(): void {
    // Dispose all wiring subscriptions first (before component disposal)
    this.wiringSubscriptions.dispose();

    if (this.colorWiringState?.state?.colorHistoryTimer) {
      clearTimeout(this.colorWiringState.state.colorHistoryTimer);
      this.colorWiringState.state.colorHistoryTimer = null;
    }
    if (this.colorWiringState?.state?.colorWheelsHistoryTimer) {
      clearTimeout(this.colorWiringState.state.colorWheelsHistoryTimer);
      this.colorWiringState.state.colorWheelsHistoryTimer = null;
    }

    // Dispose layout orchestrator (cleans up fullscreen, focus, a11y, cheat sheet, timers)
    this.layoutOrchestrator?.dispose();

    this.renderLoop.dispose();

    this.viewer.dispose();
    this.noteOverlay.dispose();
    this.timelineMagnifier.dispose();
    this.gotoFrameOverlay.dispose();
    this.remoteCursorsOverlay.dispose();
    this.timeline.dispose();
    this.headerBar.dispose();
    this.tabBar.dispose();
    this.contextToolbar.dispose();
    this.networkBridge.dispose();
    this.sessionURLService.dispose();
    this.shotGridBridge.dispose();
    this.clientMode.dispose();
    this.externalPresentation.dispose();
    this.audioOrchestrator.dispose();
    this.frameNavigation.dispose();
    this.timelineEditorService.dispose();
    this.dccBridge?.dispose();
    this.cacheManager.dispose();
    this.persistenceManager.dispose();
    this.sessionBridge.dispose();
    this.keyboardHandler.dispose();
    this.keyboardManager.detach();

    // Dispose layout
    this.layoutManager.dispose();

    // Dispose all controls via the registry
    this.controls.dispose();
  }
}
