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
import { FullscreenManager } from './utils/ui/FullscreenManager';
import type { OpenRVAPIConfig } from './api/OpenRVAPI';
import { AppKeyboardHandler } from './AppKeyboardHandler';
import { AppNetworkBridge } from './AppNetworkBridge';
import { AppPersistenceManager } from './AppPersistenceManager';
import { AppSessionBridge } from './AppSessionBridge';
import { AppControlRegistry } from './AppControlRegistry';
import { PerfTrace } from './utils/PerfTrace';
import type { AppWiringContext } from './AppWiringContext';

// A11Y utilities
import { FocusManager } from './ui/a11y/FocusManager';
import { AriaAnnouncer } from './ui/a11y/AriaAnnouncer';
import { injectA11yStyles } from './ui/a11y/injectA11yStyles';
import { setModalFocusManager } from './ui/components/shared/Modal';

// Wiring modules
import { wireColorControls, updateOCIOPipeline, type ColorWiringState } from './AppColorWiring';
import { wireViewControls } from './AppViewWiring';
import { wireEffectsControls } from './AppEffectsWiring';
import { wireTransformControls } from './AppTransformWiring';
import { wirePlaybackControls } from './AppPlaybackWiring';
import { wireStackControls } from './AppStackWiring';

// Layout
import { LayoutStore } from './ui/layout/LayoutStore';
import { LayoutManager } from './ui/layout/LayoutManager';
import { formatTimecode, formatDuration } from './handlers/infoPanelHandlers';

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
  private animationId: number | null = null;
  private boundHandleResize: () => void;
  private boundHandleVisibilityChange: () => void;
  private wasPlayingBeforeHide = false;
  private keyboardManager: KeyboardManager;
  private customKeyBindingsManager: CustomKeyBindingsManager;
  private keyboardHandler!: AppKeyboardHandler;
  private fullscreenManager!: FullscreenManager;
  private networkBridge: AppNetworkBridge;
  private persistenceManager: AppPersistenceManager;
  private sessionBridge!: AppSessionBridge;
  private focusManager!: FocusManager;
  private ariaAnnouncer!: AriaAnnouncer;

  // Customizable layout
  private layoutStore: LayoutStore;
  private layoutManager: LayoutManager;

  // Image mode: timer for timeline fade transition
  private _imageTransitionTimer: ReturnType<typeof setTimeout> | null = null;

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

    // Create core components
    this.session = new Session();
    this.session.setHDRResizeTier(this.displayCapabilities.canvasHDRResizeTier);
    this.paintEngine = new PaintEngine();
    this.viewer = new Viewer({ session: this.session, paintEngine: this.paintEngine, capabilities: this.displayCapabilities });
    this.timeline = new Timeline(this.session, this.paintEngine);

    // Create all UI controls via the registry
    this.controls = new AppControlRegistry({
      session: this.session,
      viewer: this.viewer,
      paintEngine: this.paintEngine,
      displayCapabilities: this.displayCapabilities,
    });

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
      this.onTabChanged(tabId);
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
      playlistManager: this.controls.playlistManager,
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
      getCDLControl: () => this.controls.cdlControl,
      getTransformControl: () => this.controls.transformControl,
      getLensControl: () => this.controls.lensControl,
      getStereoControl: () => this.controls.stereoControl,
      getStereoEyeTransformControl: () => this.controls.stereoEyeTransformControl,
      getStereoAlignControl: () => this.controls.stereoAlignControl,
    });

    // Network Sync
    this.networkBridge = new AppNetworkBridge({
      session: this.session,
      viewer: this.viewer,
      networkSyncManager: this.controls.networkSyncManager,
      networkControl: this.controls.networkControl,
      headerBar: this.headerBar,
    });
    this.networkBridge.setup();

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
      getFullscreenManager: () => this.fullscreenManager,
    });
    wireStackControls(wiringCtx);
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

    // Initialize persistence (auto-save and snapshots)
    await this.persistenceManager.init();
  }

  private createLayout(): void {
    if (!this.container) return;

    // === A11Y SETUP ===
    injectA11yStyles();

    // === HEADER BAR (file ops, playback, volume, help) ===
    const headerBarEl = this.headerBar.render();

    // === TAB BAR (View | Color | Effects | Transform | Annotate) ===
    const tabBarEl = this.tabBar.render();

    // === CONTEXT TOOLBAR (changes based on active tab) ===
    const contextToolbarEl = this.contextToolbar.render();

    // Setup tab contents via control registry
    this.controls.setupTabContents(this.contextToolbar, this.viewer, this.sessionBridge, this.headerBar);

    const viewerEl = this.viewer.getElement();
    const timelineEl = this.timeline.render();
    const cacheIndicatorEl = this.controls.cacheIndicator.getElement();

    // Set viewer ARIA attributes
    viewerEl.id = 'main-content';
    viewerEl.setAttribute('role', 'main');
    viewerEl.setAttribute('aria-label', 'Image viewer');
    viewerEl.setAttribute('tabindex', '0');

    // Create skip link and prepend to container
    this.focusManager = new FocusManager();
    const skipLink = this.focusManager.createSkipLink('main-content');
    this.container.appendChild(skipLink);

    // === LAYOUT MANAGER ===
    // Place top-bar elements into the layout manager's top section
    const topSection = this.layoutManager.getTopSection();
    topSection.appendChild(headerBarEl);
    topSection.appendChild(tabBarEl);
    topSection.appendChild(contextToolbarEl);

    // Viewer goes in the center slot
    this.layoutManager.getViewerSlot().appendChild(viewerEl);

    // Cache indicator + timeline go in the bottom slot
    const bottomSlot = this.layoutManager.getBottomSlot();
    bottomSlot.appendChild(cacheIndicatorEl);
    bottomSlot.appendChild(timelineEl);

    // Mount layout root into app container
    this.container.appendChild(this.layoutManager.getElement());

    // Register panel content
    this.layoutManager.addPanelTab('right', 'Inspector', this.controls.rightPanelContent.getElement());
    this.layoutManager.addPanelTab('left', 'Color Tools', this.controls.leftPanelContent.getElement());

    // Wire layout resize to viewer resize
    this.layoutManager.on('viewerResized', () => {
      this.viewer.resize();
    });

    // Register focus zones (order defines F6 cycling order)
    this.focusManager.addZone({
      name: 'headerBar',
      container: this.headerBar.getContainer(),
      getItems: () => Array.from(this.headerBar.getContainer().querySelectorAll<HTMLElement>('button:not([disabled])')),
      orientation: 'horizontal',
    });
    this.focusManager.addZone({
      name: 'tabBar',
      container: this.tabBar.getContainer(),
      getItems: () => this.tabBar.getButtons(),
      orientation: 'horizontal',
    });
    this.focusManager.addZone({
      name: 'contextToolbar',
      container: this.contextToolbar.getContainer(),
      getItems: () => Array.from(this.contextToolbar.getContainer().querySelectorAll<HTMLElement>('button:not([disabled])')),
      orientation: 'horizontal',
    });
    this.focusManager.addZone({
      name: 'viewer',
      container: viewerEl,
      getItems: () => [viewerEl],
      orientation: 'horizontal',
    });
    this.focusManager.addZone({
      name: 'timeline',
      container: timelineEl,
      getItems: () => Array.from(timelineEl.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')),
      orientation: 'horizontal',
    });

    // Wire modal focus trap
    setModalFocusManager(this.focusManager);

    // Create AriaAnnouncer
    this.ariaAnnouncer = new AriaAnnouncer();

    // Announce tab changes
    this.tabBar.on('tabChanged', (tabId: TabId) => {
      const tabLabels: Record<TabId, string> = {
        view: 'View', color: 'Color', effects: 'Effects',
        transform: 'Transform', annotate: 'Annotate', qc: 'QC',
      };
      this.ariaAnnouncer.announce(`${tabLabels[tabId]} tab`);
    });

    // Announce file loaded
    this.session.on('sourceLoaded', () => {
      const name = this.session.metadata?.displayName;
      if (name) {
        this.ariaAnnouncer.announce(`File loaded: ${name}`);
      }
    });

    // Announce play/pause state changes
    this.session.on('playbackChanged', (playing: boolean) => {
      this.ariaAnnouncer.announce(playing ? 'Playback started' : 'Playback paused');
    });

    // Announce playback speed changes
    this.session.on('playbackSpeedChanged', (speed: number) => {
      this.ariaAnnouncer.announce(`Playback speed: ${speed}x`);
    });

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
    this.controls.presentationMode.setElementsToHide([
      headerBarEl,
      tabBarEl,
      contextToolbarEl,
      cacheIndicatorEl,
      timelineEl,
    ]);

    // === IMAGE MODE: hide playback controls + timeline for single images ===
    const updateImageMode = () => {
      const isImage = this.session.isSingleImage;
      this.headerBar.setImageMode(isImage);

      // Clear pending timer to prevent race conditions on rapid toggles
      if (this._imageTransitionTimer !== null) {
        clearTimeout(this._imageTransitionTimer);
        this._imageTransitionTimer = null;
      }

      if (isImage) {
        timelineEl.style.transition = 'opacity 0.3s ease';
        timelineEl.style.opacity = '0';
        timelineEl.style.pointerEvents = 'none';
        timelineEl.setAttribute('aria-hidden', 'true');
        this._imageTransitionTimer = setTimeout(() => {
          if (this.session.isSingleImage) {
            timelineEl.style.display = 'none';
            window.dispatchEvent(new Event('resize'));
          }
        }, 300);
      } else {
        timelineEl.style.display = '';
        timelineEl.style.pointerEvents = '';
        timelineEl.removeAttribute('aria-hidden');
        void timelineEl.offsetHeight;
        timelineEl.style.transition = 'opacity 0.3s ease';
        timelineEl.style.opacity = '1';
        this._imageTransitionTimer = setTimeout(() => {
          timelineEl.style.transition = '';
          window.dispatchEvent(new Event('resize'));
        }, 300);
      }
    };

    this.session.on('sourceLoaded', updateImageMode);
    this.session.on('durationChanged', updateImageMode);

    // Re-assert image mode after exiting presentation mode.
    // Skip the fade transition to avoid a visible flash of the timeline.
    this.controls.presentationMode.on('stateChanged', (state) => {
      if (!state.enabled) {
        const isImage = this.session.isSingleImage;
        this.headerBar.setImageMode(isImage);
        if (isImage) {
          // Directly hide without fade to avoid flash
          timelineEl.style.display = 'none';
          timelineEl.style.opacity = '0';
          timelineEl.style.pointerEvents = 'none';
          timelineEl.setAttribute('aria-hidden', 'true');
          timelineEl.style.transition = '';
          window.dispatchEvent(new Event('resize'));
        }
      }
    });

    // Add histogram overlay to viewer container
    this.viewer.getContainer().appendChild(this.controls.histogram.render());

    // Add waveform overlay to viewer container
    this.viewer.getContainer().appendChild(this.controls.waveform.render());

    // Add curves control overlay to viewer container
    this.viewer.getContainer().appendChild(this.controls.curvesControl.render());

    // Add vectorscope overlay to viewer container
    this.viewer.getContainer().appendChild(this.controls.vectorscope.render());

    // Add gamut diagram overlay to viewer container
    this.viewer.getContainer().appendChild(this.controls.gamutDiagram.render());

    // Add history panel to viewer container
    this.viewer.getContainer().appendChild(this.controls.historyPanel.getElement());

    // Add info panel to viewer container
    this.viewer.getContainer().appendChild(this.controls.infoPanel.getElement());

    // Add marker list panel to viewer container
    this.viewer.getContainer().appendChild(this.controls.markerListPanel.getElement());

    // Wire up cursor color updates from viewer to info panel
    this.viewer.onCursorColorChange((color, position) => {
      if (this.controls.infoPanel.isEnabled()) {
        this.controls.infoPanel.update({
          colorAtCursor: color,
          cursorPosition: position,
        });
      }
    });

    // Wire histogram data from scope scheduler to mini histogram in right panel
    this.sessionBridge.setHistogramDataCallback((data) => {
      this.controls.rightPanelContent.updateHistogram(data);
    });

    // Wire info updates to right panel alongside existing InfoPanel
    const updateRightPanelInfo = () => {
      const source = this.session.currentSource;
      const fps = this.session.fps;
      const currentFrame = this.session.currentFrame;
      const totalFrames = source?.duration ?? 0;
      const durationSeconds = totalFrames / (fps || 1);
      this.controls.rightPanelContent.updateInfo({
        filename: source?.name,
        width: source?.width,
        height: source?.height,
        currentFrame,
        totalFrames,
        timecode: formatTimecode(currentFrame, fps),
        duration: formatDuration(durationSeconds),
        fps,
      });
    };
    this.session.on('frameChanged', updateRightPanelInfo);
    this.session.on('sourceLoaded', updateRightPanelInfo);

    // Wire preset mode to panel sections
    this.layoutStore.on('presetApplied', (presetId) => {
      this.headerBar.setActiveLayoutPreset(presetId);
      this.controls.rightPanelContent.setPresetMode(presetId);
      this.controls.leftPanelContent.setPresetMode(presetId);
    });

    // Bind all session event handlers (scopes, info panel, HDR auto-config, etc.)
    this.sessionBridge.bindSessionEvents();

    // Handle clear frame event from paint toolbar
    const paintToolbarEl = this.controls.paintToolbar.render();
    paintToolbarEl.addEventListener('clearFrame', () => {
      this.paintEngine.clearFrame(this.session.currentFrame);
    });

    // Sync annotation version filter when A/B source changes
    this.session.on('abSourceChanged', () => {
      this.controls.paintToolbar.setAnnotationVersion(this.session.currentAB);
    });
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
   * The closures reference App properties directly.
   */
  private getActionHandlers(): Record<string, () => void> {
    return {
      'playback.toggle': () => this.session.togglePlayback(),
      'playback.stepForward': () => this.session.stepForward(),
      'playback.stepBackward': () => this.session.stepBackward(),
      'playback.toggleDirection': () => this.session.togglePlayDirection(),
      'playback.goToStart': () => {
        if (this.controls.playlistManager.isEnabled()) {
          this.goToPlaylistStart();
          return;
        }
        this.session.goToStart();
      },
      'playback.goToEnd': () => {
        if (this.controls.playlistManager.isEnabled()) {
          this.goToPlaylistEnd();
          return;
        }
        this.session.goToEnd();
      },
      'playback.slower': () => this.session.decreaseSpeed(),
      'playback.stop': () => this.session.pause(),
      'playback.faster': () => {
        // L key - increase speed, but on Annotate tab, line tool takes precedence
        if (this.tabBar.activeTab === 'annotate') {
          this.controls.paintToolbar.handleKeyboard('l');
          return;
        }
        this.session.increaseSpeed();
      },
      'timeline.setInPoint': () => this.session.setInPoint(),
      'timeline.setInPointAlt': () => this.session.setInPoint(),
      'timeline.setOutPoint': () => {
        // O key - set out point, but on Annotate tab, ellipse tool takes precedence
        if (this.tabBar.activeTab === 'annotate') {
          this.controls.paintToolbar.handleKeyboard('o');
          return;
        }
        this.session.setOutPoint();
      },
      'timeline.setOutPointAlt': () => this.session.setOutPoint(),
      'timeline.toggleMark': () => this.session.toggleMark(),
      'timeline.nextMarkOrBoundary': () => this.goToNextMarkOrBoundary(),
      'timeline.previousMarkOrBoundary': () => this.goToPreviousMarkOrBoundary(),
      'timeline.nextShot': () => this.goToNextShot(),
      'timeline.previousShot': () => this.goToPreviousShot(),
      'timeline.resetInOut': () => {
        // R key - reset in/out points, but on Annotate tab, rectangle tool takes precedence
        if (this.tabBar.activeTab === 'annotate') {
          this.controls.paintToolbar.handleKeyboard('r');
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
      'view.cycleWipeMode': () => this.controls.compareControl.cycleWipeMode(),
      'view.toggleWaveform': () => this.controls.scopesControl.toggleScope('waveform'),
      'view.toggleAB': () => this.session.toggleAB(),
      'view.toggleABAlt': () => this.session.toggleAB(),
      'view.toggleDifferenceMatte': () => this.controls.compareControl.toggleDifferenceMatte(),
      'view.toggleSplitScreen': () => this.controls.compareControl.toggleSplitScreen(),
      'view.toggleGhostFrames': () => this.controls.ghostFrameControl.toggle(),
      'view.togglePAR': () => this.controls.parControl.toggle(),
      'view.cycleBackgroundPattern': () => this.controls.backgroundPatternControl.cyclePattern(),
      'view.toggleCheckerboard': () => this.controls.backgroundPatternControl.toggleCheckerboard(),
      'panel.color': () => this.controls.colorControls.toggle(),
      'panel.effects': () => this.controls.filterControl.toggle(),
      'panel.curves': () => this.controls.curvesControl.toggle(),
      'panel.crop': () => this.controls.cropControl.toggle(),
      'panel.waveform': () => this.controls.scopesControl.toggleScope('waveform'),
      'panel.vectorscope': () => this.controls.scopesControl.toggleScope('vectorscope'),
      'panel.gamutDiagram': () => this.controls.scopesControl.toggleScope('gamutDiagram'),
      'panel.histogram': () => this.controls.scopesControl.toggleScope('histogram'),
      'panel.ocio': () => this.controls.ocioControl.toggle(),
      'display.cycleProfile': () => this.controls.displayProfileControl.cycleProfile(),
      'transform.rotateLeft': () => this.controls.transformControl.rotateLeft(),
      'transform.rotateRight': () => this.controls.transformControl.rotateRight(),
      'transform.flipHorizontal': () => this.controls.transformControl.toggleFlipH(),
      'transform.flipVertical': () => this.controls.transformControl.toggleFlipV(),
      'export.quickExport': () => this.headerBar.getExportControl().quickExport('png'),
      'export.copyFrame': () => this.viewer.copyFrameToClipboard(true),
      'edit.undo': () => this.paintEngine.undo(),
      'edit.redo': () => this.paintEngine.redo(),
      'annotation.previous': () => this.goToPreviousAnnotation(),
      'annotation.next': () => this.goToNextAnnotation(),
      'tab.view': () => this.tabBar.setActiveTab('view'),
      'tab.color': () => this.tabBar.setActiveTab('color'),
      'tab.effects': () => this.tabBar.setActiveTab('effects'),
      'tab.transform': () => this.tabBar.setActiveTab('transform'),
      'tab.annotate': () => this.tabBar.setActiveTab('annotate'),
      'tab.qc': () => this.tabBar.setActiveTab('qc'),
      'paint.pan': () => this.controls.paintToolbar.handleKeyboard('v'),
      'paint.pen': () => this.controls.paintToolbar.handleKeyboard('p'),
      'paint.eraser': () => this.controls.paintToolbar.handleKeyboard('e'),
      'paint.text': () => this.controls.paintToolbar.handleKeyboard('t'),
      'paint.rectangle': () => this.controls.paintToolbar.handleKeyboard('r'),
      'paint.ellipse': () => this.controls.paintToolbar.handleKeyboard('o'),
      'paint.line': () => this.controls.paintToolbar.handleKeyboard('l'),
      'paint.arrow': () => this.controls.paintToolbar.handleKeyboard('a'),
      'paint.toggleBrush': () => this.controls.paintToolbar.handleKeyboard('b'),
      'paint.toggleGhost': () => this.controls.paintToolbar.handleKeyboard('g'),
      'paint.toggleHold': () => this.controls.paintToolbar.handleKeyboard('x'),
      'channel.red': () => this.controls.channelSelect.handleKeyboard('R', true),
      'channel.green': () => this.controls.channelSelect.handleKeyboard('G', true),
      'channel.blue': () => this.controls.channelSelect.handleKeyboard('B', true),
      'channel.alpha': () => this.controls.channelSelect.handleKeyboard('A', true),
      'channel.luminance': () => this.controls.channelSelect.handleKeyboard('L', true),
      'channel.grayscale': () => this.controls.channelSelect.handleKeyboard('Y', true),
      'channel.none': () => this.controls.channelSelect.handleKeyboard('N', true),
      'stereo.toggle': () => this.controls.stereoControl.handleKeyboard('3', true),
      'stereo.eyeTransform': () => this.controls.stereoEyeTransformControl.handleKeyboard('E', true),
      'stereo.cycleAlign': () => this.controls.stereoAlignControl.handleKeyboard('4', true),
      'view.toggleGuides': () => this.controls.safeAreasControl.getOverlay().toggle(),
      'view.togglePixelProbe': () => this.viewer.getPixelProbe().toggle(),
      'view.toggleFalseColor': () => this.viewer.getFalseColor().toggle(),
      'view.toggleToneMapping': () => this.controls.toneMappingControl.toggle(),
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
        this.controls.colorInversionToggle.toggle();
      },
      'view.cycleLuminanceVis': () => {
        this.viewer.getLuminanceVisualization().cycleMode();
      },
      'panel.history': () => {
        this.controls.historyPanel.toggle();
      },
      'panel.markers': () => {
        this.controls.markerListPanel.toggle();
      },
      'view.toggleInfoPanel': () => {
        this.controls.infoPanel.toggle();
        if (this.controls.infoPanel.isEnabled()) {
          this.sessionBridge.updateInfoPanel();
        }
      },
      'theme.cycle': () => {
        getThemeManager().cycleMode();
      },
      'panel.close': () => {
        // ESC exits presentation mode first, then fullscreen
        if (this.controls.presentationMode.getState().enabled) {
          this.controls.presentationMode.toggle();
          return;
        }
        // Close all transient floating panels/dropdowns
        if (this.controls.colorControls) {
          this.controls.colorControls.hide();
        }
        if (this.controls.cropControl) {
          this.controls.cropControl.hidePanel();
        }
        if (this.controls.filterControl?.isOpen) {
          this.controls.filterControl.hide();
        }
        if (this.controls.deinterlaceControl?.isOpen) {
          this.controls.deinterlaceControl.hide();
        }
        if (this.controls.filmEmulationControl?.isOpen) {
          this.controls.filmEmulationControl.hide();
        }
        if (this.controls.curvesControl) {
          this.controls.curvesControl.hide();
        }
        if (this.controls.ocioControl) {
          this.controls.ocioControl.hide();
        }
        if (this.controls.compareControl?.isDropdownVisible()) {
          this.controls.compareControl.close();
        }
        if (this.controls.networkControl) {
          this.controls.networkControl.closePanel();
        }
        // Close stereo eye transform panel
        if (this.controls.stereoEyeTransformControl.isPanelVisible()) {
          this.controls.stereoEyeTransformControl.hidePanel();
        }
        if (this.controls.displayProfileControl.isDropdownVisible()) {
          this.controls.displayProfileControl.closeDropdown();
        }
      },
      'snapshot.create': () => {
        this.persistenceManager.createQuickSnapshot();
      },
      'panel.snapshots': () => {
        this.controls.snapshotPanel.toggle();
      },
      'panel.playlist': () => {
        this.controls.playlistPanel.toggle();
      },
      'view.toggleFullscreen': () => {
        this.fullscreenManager?.toggle();
      },
      'view.togglePresentation': () => {
        this.controls.presentationMode.toggle();
      },
      'network.togglePanel': () => {
        this.controls.networkControl.togglePanel();
      },
      'network.disconnect': () => {
        if (this.controls.networkSyncManager.isConnected) {
          this.controls.networkSyncManager.leaveRoom();
        }
      },
      'focus.nextZone': () => {
        this.focusManager.focusNextZone();
      },
      'focus.previousZone': () => {
        this.focusManager.focusPreviousZone();
      },
      'layout.default': () => this.layoutStore.applyPreset('default'),
      'layout.review': () => this.layoutStore.applyPreset('review'),
      'layout.color': () => this.layoutStore.applyPreset('color'),
      'layout.paint': () => this.layoutStore.applyPreset('paint'),
    };
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

  private goToPlaylistStart(): void {
    const firstClip = this.controls.playlistManager.getClipByIndex(0);
    if (!firstClip) return;
    this.jumpToPlaylistGlobalFrame(firstClip.globalStartFrame);
  }

  private goToPlaylistEnd(): void {
    const count = this.controls.playlistManager.getClipCount();
    const lastClip = this.controls.playlistManager.getClipByIndex(count - 1);
    if (!lastClip) return;
    this.jumpToPlaylistGlobalFrame(lastClip.globalStartFrame + lastClip.duration - 1);
  }

  private goToNextMarkOrBoundary(): void {
    if (this.session.goToNextMarker() !== null) return;
    if (!this.controls.playlistManager.isEnabled()) return;

    const mapping = this.controls.playlistManager.getClipAtFrame(this.controls.playlistManager.getCurrentFrame());
    if (!mapping) return;

    const nextClip = this.controls.playlistManager.getClipByIndex(mapping.clipIndex + 1);
    if (!nextClip) return;
    this.jumpToPlaylistGlobalFrame(nextClip.globalStartFrame);
  }

  private goToPreviousMarkOrBoundary(): void {
    if (this.session.goToPreviousMarker() !== null) return;
    if (!this.controls.playlistManager.isEnabled()) return;

    const globalFrame = this.controls.playlistManager.getCurrentFrame();
    const mapping = this.controls.playlistManager.getClipAtFrame(globalFrame);
    if (!mapping) return;

    const currentClipStart = mapping.clip.globalStartFrame;
    const targetIndex = globalFrame > currentClipStart
      ? mapping.clipIndex
      : mapping.clipIndex - 1;
    if (targetIndex < 0) return;

    const clip = this.controls.playlistManager.getClipByIndex(targetIndex);
    if (!clip) return;
    this.jumpToPlaylistGlobalFrame(clip.globalStartFrame);
  }

  private goToNextShot(): void {
    if (!this.controls.playlistManager.isEnabled()) return;

    const mapping = this.controls.playlistManager.getClipAtFrame(this.controls.playlistManager.getCurrentFrame());
    if (!mapping) return;

    const nextClip = this.controls.playlistManager.getClipByIndex(mapping.clipIndex + 1);
    if (!nextClip) return;
    this.jumpToPlaylistGlobalFrame(nextClip.globalStartFrame);
  }

  private goToPreviousShot(): void {
    if (!this.controls.playlistManager.isEnabled()) return;

    const globalFrame = this.controls.playlistManager.getCurrentFrame();
    const mapping = this.controls.playlistManager.getClipAtFrame(globalFrame);
    if (!mapping) return;

    const currentClipStart = mapping.clip.globalStartFrame;
    const targetIndex = globalFrame > currentClipStart
      ? mapping.clipIndex
      : mapping.clipIndex - 1;
    if (targetIndex < 0) return;

    const clip = this.controls.playlistManager.getClipByIndex(targetIndex);
    if (!clip) return;
    this.jumpToPlaylistGlobalFrame(clip.globalStartFrame);
  }

  private jumpToPlaylistGlobalFrame(globalFrame: number): void {
    const mapping = this.controls.playlistManager.getClipAtFrame(globalFrame);
    if (!mapping) return;

    if (this.session.currentSourceIndex !== mapping.sourceIndex) {
      this.session.setCurrentSource(mapping.sourceIndex);
    }
    this.session.setInPoint(mapping.clip.inPoint);
    this.session.setOutPoint(mapping.clip.outPoint);
    this.controls.playlistManager.setCurrentFrame(globalFrame);
    this.session.goToFrame(mapping.localFrame);
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
    // Auto-enable perf tracing during playback for fps diagnosis
    if (this.session.isPlaying && !PerfTrace.enabled) {
      PerfTrace.enabled = true;
    } else if (!this.session.isPlaying && PerfTrace.enabled) {
      PerfTrace.enabled = false;
    }

    PerfTrace.begin('tick');

    const frameBefore = this.session.currentFrame;
    PerfTrace.begin('session.update');
    this.session.update();
    PerfTrace.end('session.update');

    // Only render on frame changes during video playback.
    // Static images and drawing are handled by event-driven updates.
    const source = this.session.currentSource;
    if (source?.type === 'video' && this.session.isPlaying) {
      if (this.session.currentFrame !== frameBefore) {
        // Use renderDirect() to avoid double-rAF delay:
        // tick() already runs inside rAF, so scheduling another rAF via refresh()
        // would delay rendering by one frame (~16.7ms), halving effective throughput.
        // Only render when the frame actually advanced to avoid wasting GPU work
        // on ticks where the accumulator hasn't crossed the frame boundary yet.
        PerfTrace.begin('viewer.renderDirect');
        this.viewer.renderDirect();
        PerfTrace.end('viewer.renderDirect');
        PerfTrace.frame();
      } else {
        PerfTrace.count('tick.noFrameAdvance');
      }
    }

    PerfTrace.end('tick');
    this.animationId = requestAnimationFrame(this.tick);
  };

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

    if (this._imageTransitionTimer !== null) {
      clearTimeout(this._imageTransitionTimer);
      this._imageTransitionTimer = null;
    }

    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }

    // Remove global event listeners
    window.removeEventListener('resize', this.boundHandleResize);
    document.removeEventListener('visibilitychange', this.boundHandleVisibilityChange);

    this.viewer.dispose();
    this.timeline.dispose();
    this.headerBar.dispose();
    this.tabBar.dispose();
    this.contextToolbar.dispose();
    this.fullscreenManager?.dispose();
    this.networkBridge.dispose();
    this.persistenceManager.dispose();
    this.sessionBridge.dispose();
    this.keyboardHandler.dispose();
    this.keyboardManager.detach();
    this.focusManager?.dispose();
    this.ariaAnnouncer?.dispose();

    // Dispose layout
    this.layoutManager.dispose();

    // Dispose all controls via the registry
    this.controls.dispose();
  }
}
