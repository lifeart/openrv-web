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

import { Session } from './core/session/Session';
import { Viewer } from './ui/components/Viewer';
import { Timeline } from './ui/components/Timeline';
import { HeaderBar } from './ui/components/layout/HeaderBar';
import { TabBar, TabId } from './ui/components/layout/TabBar';
import { ContextToolbar } from './ui/components/layout/ContextToolbar';
import { PaintEngine } from './paint/PaintEngine';
import { detectDisplayCapabilities, type DisplayCapabilities } from './color/DisplayCapabilities';
import { KeyboardManager } from './utils/input/KeyboardManager';
import { CustomKeyBindingsManager } from './utils/input/CustomKeyBindingsManager';
import { getGlobalHistoryManager } from './utils/HistoryManager';
import { getThemeManager } from './utils/ui/ThemeManager';
import { getCorePreferencesManager } from './core/PreferencesManager';
import type { OpenRVAPIConfig } from './api/OpenRVAPI';
import { AppKeyboardHandler } from './AppKeyboardHandler';
import { AppNetworkBridge } from './AppNetworkBridge';
import { AppPersistenceManager } from './AppPersistenceManager';
import { AppSessionBridge } from './AppSessionBridge';
import { AppControlRegistry } from './AppControlRegistry';
import { RenderLoopService } from './services/RenderLoopService';
import { FrameNavigationService } from './services/FrameNavigationService';
import { SessionURLService } from './services/SessionURLService';
import { TimelineEditorService } from './services/TimelineEditorService';
import { buildActionHandlers } from './services/KeyboardActionMap';
import { LayoutOrchestrator } from './services/LayoutOrchestrator';
import type { AppWiringContext } from './AppWiringContext';

// Wiring modules
import { wireColorControls, updateOCIOPipeline, type ColorWiringState } from './AppColorWiring';
import { wireViewControls } from './AppViewWiring';
import { wireEffectsControls } from './AppEffectsWiring';
import { wireTransformControls } from './AppTransformWiring';
import { wirePlaybackControls } from './AppPlaybackWiring';
import { wireStackControls } from './AppStackWiring';
import { wireDCCBridge } from './AppDCCWiring';
import { NoteOverlay } from './ui/components/NoteOverlay';
import { ShotGridIntegrationBridge } from './integrations/ShotGridIntegrationBridge';
import { ClientMode } from './ui/components/ClientMode';
import { ExternalPresentation } from './ui/components/ExternalPresentation';
import { ActiveContextManager, type BindingContext } from './utils/input/ActiveContextManager';
import { ContextualKeyboardManager } from './utils/input/ContextualKeyboardManager';
import { AudioOrchestrator } from './services/AudioOrchestrator';
import { DCCBridge } from './integrations/DCCBridge';
import { MediaCacheManager } from './cache/MediaCacheManager';
import { Logger } from './utils/Logger';

const log = new Logger('App');

// Layout
import { LayoutStore } from './ui/layout/LayoutStore';
import { LayoutManager } from './ui/layout/LayoutManager';
import { SequenceGroupNode } from './nodes/groups/SequenceGroupNode';

export class App {
  private container: HTMLElement | null = null;
  private session: Session;
  private viewer: Viewer;
  private timeline: Timeline;
  private headerBar: HeaderBar;
  private tabBar: TabBar;
  private contextToolbar: ContextToolbar;
  private paintEngine: PaintEngine;
  private controls: AppControlRegistry;
  private noteOverlay: NoteOverlay;
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
  private dccBridge: DCCBridge | null = null;
  private contextualKeyboardManager: ContextualKeyboardManager;
  private layoutOrchestrator!: LayoutOrchestrator;

  // Customizable layout
  private layoutStore: LayoutStore;
  private layoutManager: LayoutManager;

  // Display capabilities for wide color gamut / HDR support
  private displayCapabilities: DisplayCapabilities;

  // Wiring state (managed by wiring modules, cleaned up on dispose)
  private colorWiringState!: ColorWiringState;

  constructor() {
    // Detect display capabilities at startup (P3, HDR, WebGPU)
    this.displayCapabilities = detectDisplayCapabilities();

    // Bind event handlers for proper cleanup
    this.boundHandleResize = () => this.viewer.resize();
    this.boundHandleVisibilityChange = this.handleVisibilityChange.bind(this);

    // Initialize client mode (restricted UI for review presentations)
    this.clientMode = new ClientMode();
    this.clientMode.checkURLParam();

    // Active context manager (key binding context scoping)
    this.activeContextManager = new ActiveContextManager();
    this.contextualKeyboardManager = new ContextualKeyboardManager(this.activeContextManager);

    // Create core components
    this.session = new Session();
    this.session.setHDRResizeTier(this.displayCapabilities.canvasHDRResizeTier);
    this.paintEngine = new PaintEngine();
    this.viewer = new Viewer({ session: this.session, paintEngine: this.paintEngine, capabilities: this.displayCapabilities });
    this.renderLoop = new RenderLoopService({ session: this.session, viewer: this.viewer });
    this.timeline = new Timeline(this.session, this.paintEngine);

    // Create OPFS media cache manager
    this.cacheManager = new MediaCacheManager();

    // Create all UI controls via the registry
    this.controls = new AppControlRegistry({
      session: this.session,
      viewer: this.viewer,
      paintEngine: this.paintEngine,
      displayCapabilities: this.displayCapabilities,
    });

    // Wire NoteOverlay into timeline for note visualization
    this.noteOverlay = new NoteOverlay(this.session);
    this.timeline.setNoteOverlay(this.noteOverlay);
    this.timeline.setPlaylistManagers(this.controls.playlistManager, this.controls.transitionManager);

    // Create HeaderBar (contains file ops, playback, volume, export, help)
    this.headerBar = new HeaderBar(this.session);

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
    this.tabBar.on('tabChanged', (tabId: TabId) => {
      this.contextToolbar.setActiveTab(tabId);
      // Update active context for key binding scoping
      const contextMap: Record<string, BindingContext> = { annotate: 'paint', transform: 'transform', view: 'viewer', qc: 'viewer' };
      this.activeContextManager.setContext(contextMap[tabId] ?? 'global');
    });

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
    this.keyboardHandler = new AppKeyboardHandler(
      this.keyboardManager,
      this.customKeyBindingsManager,
      {
        getActionHandlers: () => this.getActionHandlers(),
        getContainer: () => this.container!,
      }
    );
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

    // Shift+R: transform.rotateLeft (global) vs channel.red (channel)
    this.contextualKeyboardManager.register(
      'transform.rotateLeft',
      { code: 'KeyR', shift: true },
      () => this.controls.transformControl.rotateLeft(),
      'global',
      'Rotate left 90 degrees',
    );
    this.contextualKeyboardManager.register(
      'channel.red',
      { code: 'KeyR', shift: true },
      () => this.controls.channelSelect.handleKeyboard('R', true),
      'channel',
      'Select red channel',
    );

    // Shift+B: view.cycleBackgroundPattern (global) vs channel.blue (channel)
    this.contextualKeyboardManager.register(
      'view.cycleBackgroundPattern',
      { code: 'KeyB', shift: true },
      () => this.controls.backgroundPatternControl.cyclePattern(),
      'global',
      'Cycle background pattern',
    );
    this.contextualKeyboardManager.register(
      'channel.blue',
      { code: 'KeyB', shift: true },
      () => this.controls.channelSelect.handleKeyboard('B', true),
      'channel',
      'Select blue channel',
    );

    // Shift+N: network.togglePanel (global) vs channel.none (channel)
    this.contextualKeyboardManager.register(
      'network.togglePanel',
      { code: 'KeyN', shift: true },
      () => this.controls.networkControl.togglePanel(),
      'global',
      'Toggle network sync panel',
    );
    this.contextualKeyboardManager.register(
      'channel.none',
      { code: 'KeyN', shift: true },
      () => this.controls.channelSelect.handleKeyboard('N', true),
      'channel',
      'Select no channel',
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
      getSessionURLState: () => this.sessionURLService.captureSessionURLState(),
      applySessionURLState: (state) => this.sessionURLService.applySessionURLState(state),
    });
    this.networkBridge.setup();

    // ShotGrid integration bridge
    this.shotGridBridge = new ShotGridIntegrationBridge({
      session: this.session,
      configUI: this.controls.shotGridConfig,
      panel: this.controls.shotGridPanel,
    });
    this.shotGridBridge.setup();

    // External presentation (multi-window BroadcastChannel sync)
    this.externalPresentation = new ExternalPresentation();
    this.externalPresentation.initialize();

    // Wire HeaderBar external presentation button
    this.headerBar.on('externalPresentation', () => this.externalPresentation.openWindow());

    // Wire session events to external presentation
    this.session.on('frameChanged', () => {
      if (this.externalPresentation.hasOpenWindows) {
        this.externalPresentation.syncFrame(this.session.currentFrame, this.session.frameCount);
      }
    });
    this.session.on('playbackChanged', (playing: boolean) => {
      if (this.externalPresentation.hasOpenWindows) {
        this.externalPresentation.syncPlayback(playing, this.session.playbackSpeed, this.session.currentFrame);
      }
    });

    // Wire color adjustment changes to external presentation windows
    this.controls.colorControls.on('adjustmentsChanged', (adjustments) => {
      if (this.externalPresentation.hasOpenWindows) {
        this.externalPresentation.syncColor({
          exposure: adjustments.exposure,
          gamma: adjustments.gamma,
          temperature: adjustments.temperature,
          tint: adjustments.tint,
        });
      }
    });

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
    const dccUrl = new URLSearchParams(window.location.search).get('dcc');
    if (dccUrl) {
      this.dccBridge = new DCCBridge({ url: dccUrl });

      wireDCCBridge({
        dccBridge: this.dccBridge,
        session: this.session,
        viewer: this.viewer,
        colorControls: this.controls.colorControls,
      });

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

    // Wire all control groups via focused wiring modules
    this.colorWiringState = wireColorControls(wiringCtx);
    wireViewControls(wiringCtx);
    wireEffectsControls(wiringCtx);
    wireTransformControls(wiringCtx);
    wirePlaybackControls(wiringCtx, {
      getKeyboardHandler: () => this.keyboardHandler,
      getFullscreenManager: () => this.fullscreenManager ?? undefined,
      getAudioMixer: () => this.audioOrchestrator.getAudioMixer(),
    });
    wireStackControls(wiringCtx);

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
      controls: this.controls,
      sessionBridge: this.sessionBridge,
      clientMode: this.clientMode,
      paintEngine: this.paintEngine,
      customKeyBindingsManager: this.customKeyBindingsManager,
    });
    this.layoutOrchestrator.createLayout();

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
      this.controls.ocioControl.getState()
    );

    // Initialize display profile from persisted state
    this.viewer.setDisplayColorState(this.controls.displayProfileControl.getState());

    // Initialize OPFS media cache (fire-and-forget; no-op if unavailable)
    this.cacheManager.initialize().catch((err) => { log.debug('OPFS cache unavailable:', err); });

    // Initialize persistence (auto-save and snapshots)
    await this.persistenceManager.init();

    // Optional URL bootstrap:
    // - auto-join room from ?room=...&pin=...
    // - apply initial shared session hash from #s=...
    await this.sessionURLService.handleURLBootstrap();
  }

  /** Convenience accessors for layout-owned sub-objects */
  private get fullscreenManager() { return this.layoutOrchestrator?.fullscreenManager ?? null; }
  private get focusManager() { return this.layoutOrchestrator?.focusManager ?? null; }
  private get shortcutCheatSheet() { return this.layoutOrchestrator?.shortcutCheatSheet ?? null; }

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
    window.addEventListener('resize', this.boundHandleResize);

    // Handle page visibility changes (pause playback when tab is hidden)
    document.addEventListener('visibilitychange', this.boundHandleVisibilityChange);

    // Initialize keyboard shortcuts
    this.keyboardManager.attach();

    this.paintEngine.on('annotationsChanged', () => this.persistenceManager.syncGTOStore());
    this.paintEngine.on('effectsChanged', () => this.persistenceManager.syncGTOStore());

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
      controls: this.controls,
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
    });
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
    };
  }

  dispose(): void {
    if (this.colorWiringState.colorHistoryTimer) {
      clearTimeout(this.colorWiringState.colorHistoryTimer);
      this.colorWiringState.colorHistoryTimer = null;
    }

    // Dispose layout orchestrator (cleans up fullscreen, focus, a11y, cheat sheet, timers)
    this.layoutOrchestrator?.dispose();

    this.renderLoop.dispose();

    // Remove global event listeners
    window.removeEventListener('resize', this.boundHandleResize);
    document.removeEventListener('visibilitychange', this.boundHandleVisibilityChange);

    this.viewer.dispose();
    this.noteOverlay.dispose();
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
