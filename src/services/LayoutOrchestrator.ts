/**
 * LayoutOrchestrator - Builds the DOM tree, wires overlays, configures a11y,
 * sets up fullscreen manager, image mode transitions, and layout event bindings.
 *
 * Extracted from App.createLayout() to isolate layout construction from the
 * top-level composition root.
 */

import { FullscreenManager } from '../utils/ui/FullscreenManager';
import { FocusManager, type FocusZone } from '../ui/a11y/FocusManager';
import { AriaAnnouncer } from '../ui/a11y/AriaAnnouncer';
import { injectA11yStyles } from '../ui/a11y/injectA11yStyles';
import { setModalFocusManager } from '../ui/components/shared/Modal';
import { ShortcutCheatSheet } from '../ui/components/ShortcutCheatSheet';
import { detect360Content } from '../render/SphericalProjection';
import { formatTimecode, formatDuration } from '../handlers/infoPanelHandlers';
import type { LayoutPresetId } from '../ui/layout/LayoutStore';
import type { ShortcutEditorManager } from '../ui/components/ShortcutEditor';

// ---------------------------------------------------------------------------
// Dependency interfaces (structural typing — no need to import heavy classes)
// ---------------------------------------------------------------------------

export interface LayoutSession {
  readonly isSingleImage: boolean;
  readonly currentFrame: number;
  readonly currentSource: { name?: string; width?: number; height?: number; duration?: number } | null;
  readonly metadata: { displayName?: string } | null;
  readonly fps: number;
  readonly currentAB: string;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

export interface LayoutViewer {
  getElement(): HTMLElement;
  getContainer(): HTMLElement;
  resize(): void;
  onCursorColorChange(callback: ((color: { r: number; g: number; b: number } | null, position: { x: number; y: number } | null) => void) | null): void;
}

export interface LayoutHeaderBar {
  render(): HTMLElement;
  getContainer(): HTMLElement;
  setFullscreenState(isFullscreen: boolean): void;
  setImageMode(isImage: boolean): void;
  setActiveLayoutPreset(presetId: LayoutPresetId | null): void;
}

export interface LayoutTabBar {
  render(): HTMLElement;
  getContainer(): HTMLElement;
  getButtons(): HTMLElement[];
  on(event: string, handler: (...args: unknown[]) => void): (() => void) | void;
}

export interface LayoutContextToolbar {
  render(): HTMLElement;
  getContainer(): HTMLElement;
}

export interface LayoutTimeline {
  render(): HTMLElement;
}

export interface LayoutLayoutManager {
  getElement(): HTMLElement;
  getTopSection(): HTMLElement;
  getViewerSlot(): HTMLElement;
  getBottomSlot(): HTMLElement;
  addPanelTab(panelId: 'left' | 'right', label: string, element: HTMLElement): void;
  on(event: string, handler: (...args: unknown[]) => void): (() => void) | void;
}

export interface LayoutLayoutStore {
  on(event: string, handler: (...args: unknown[]) => void): (() => void) | void;
}

export interface LayoutControlsSubset {
  cacheIndicator: { getElement(): HTMLElement };
  rightPanelContent: {
    getElement(): HTMLElement;
    updateHistogram(data: unknown): void;
    updateInfo(data: unknown): void;
    setPresetMode(presetId: string): void;
  };
  leftPanelContent: {
    getElement(): HTMLElement;
    setPresetMode(presetId: string): void;
  };
  histogram: { render(): HTMLElement };
  waveform: { render(): HTMLElement };
  curvesControl: { render(): HTMLElement };
  vectorscope: { render(): HTMLElement };
  gamutDiagram: { render(): HTMLElement };
  historyPanel: { getElement(): HTMLElement };
  infoPanel: {
    getElement(): HTMLElement;
    isEnabled(): boolean;
    update(data: unknown): void;
  };
  markerListPanel: { getElement(): HTMLElement };
  notePanel: { getElement(): HTMLElement };
  paintToolbar: {
    render(): HTMLElement;
    setAnnotationVersion(version: string): void;
  };
  presentationMode: {
    setElementsToHide(elements: HTMLElement[]): void;
    on(event: string, handler: (...args: unknown[]) => void): (() => void) | void;
  };
  sphericalProjection: {
    enabled: boolean;
    enable(): void;
    disable(): void;
  };
  setupTabContents(
    contextToolbar: LayoutContextToolbar,
    viewer: LayoutViewer,
    sessionBridge: unknown,
    headerBar: LayoutHeaderBar,
  ): void;
}

export interface LayoutSessionBridge {
  setHistogramDataCallback(cb: ((data: unknown) => void) | null): void;
  bindSessionEvents(): void;
}

export interface LayoutClientMode {
  isEnabled(): boolean;
  getRestrictedElements(): string[];
  on(event: string, handler: (...args: unknown[]) => void): (() => void) | void;
}

export interface LayoutPaintEngine {
  clearFrame(frame: number): void;
}

export interface LayoutOrchestratorDeps {
  container: HTMLElement;
  session: LayoutSession;
  viewer: LayoutViewer;
  headerBar: LayoutHeaderBar;
  tabBar: LayoutTabBar;
  contextToolbar: LayoutContextToolbar;
  timeline: LayoutTimeline;
  layoutManager: LayoutLayoutManager;
  layoutStore: LayoutLayoutStore;
  controls: LayoutControlsSubset;
  sessionBridge: LayoutSessionBridge;
  clientMode: LayoutClientMode;
  paintEngine: LayoutPaintEngine;
  customKeyBindingsManager: ShortcutEditorManager;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LayoutOrchestrator {
  private readonly deps: LayoutOrchestratorDeps;

  // Sub-objects created during layout
  private _fullscreenManager: FullscreenManager | null = null;
  private _focusManager: FocusManager | null = null;
  private _ariaAnnouncer: AriaAnnouncer | null = null;
  private _shortcutCheatSheet: ShortcutCheatSheet | null = null;

  // Image mode transition timer
  private _imageTransitionTimer: ReturnType<typeof setTimeout> | null = null;

  // Event handlers tracked for cleanup
  private _sessionHandlers: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];

  // Non-session unsubscribe functions (layoutManager, tabBar, presentationMode, layoutStore, clientMode)
  private _unsubscribers: Array<() => void> = [];

  constructor(deps: LayoutOrchestratorDeps) {
    this.deps = deps;
  }

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  get fullscreenManager(): FullscreenManager | null {
    return this._fullscreenManager;
  }

  get focusManager(): FocusManager | null {
    return this._focusManager;
  }

  get shortcutCheatSheet(): ShortcutCheatSheet | null {
    return this._shortcutCheatSheet;
  }

  get ariaAnnouncer(): AriaAnnouncer | null {
    return this._ariaAnnouncer;
  }

  get imageTransitionTimer(): ReturnType<typeof setTimeout> | null {
    return this._imageTransitionTimer;
  }

  // -------------------------------------------------------------------------
  // Main layout creation
  // -------------------------------------------------------------------------

  createLayout(): void {
    const {
      container,
      session,
      viewer,
      headerBar,
      tabBar,
      contextToolbar,
      timeline,
      layoutManager,
      layoutStore,
      controls,
      sessionBridge,
      clientMode,
      paintEngine,
      customKeyBindingsManager,
    } = this.deps;

    // === A11Y SETUP ===
    injectA11yStyles();

    // === HEADER BAR (file ops, playback, volume, help) ===
    const headerBarEl = headerBar.render();

    // === TAB BAR (View | Color | Effects | Transform | Annotate) ===
    const tabBarEl = tabBar.render();

    // === CONTEXT TOOLBAR (changes based on active tab) ===
    const contextToolbarEl = contextToolbar.render();

    // Setup tab contents via control registry
    controls.setupTabContents(contextToolbar, viewer, sessionBridge, headerBar);

    const viewerEl = viewer.getElement();
    const timelineEl = timeline.render();
    const cacheIndicatorEl = controls.cacheIndicator.getElement();

    // Set viewer ARIA attributes
    viewerEl.id = 'main-content';
    viewerEl.setAttribute('role', 'main');
    viewerEl.setAttribute('aria-label', 'Image viewer');
    viewerEl.setAttribute('tabindex', '0');

    // Create skip link and prepend to container
    this._focusManager = new FocusManager();
    const skipLink = this._focusManager.createSkipLink('main-content');
    container.appendChild(skipLink);

    // === LAYOUT MANAGER ===
    // Place top-bar elements into the layout manager's top section
    const topSection = layoutManager.getTopSection();
    topSection.appendChild(headerBarEl);
    topSection.appendChild(tabBarEl);
    topSection.appendChild(contextToolbarEl);

    // Viewer goes in the center slot
    layoutManager.getViewerSlot().appendChild(viewerEl);

    // Cache indicator + timeline go in the bottom slot
    const bottomSlot = layoutManager.getBottomSlot();
    bottomSlot.appendChild(cacheIndicatorEl);
    bottomSlot.appendChild(timelineEl);

    // Mount layout root into app container
    container.appendChild(layoutManager.getElement());

    // Register panel content
    layoutManager.addPanelTab('right', 'Inspector', controls.rightPanelContent.getElement());
    layoutManager.addPanelTab('left', 'Color Tools', controls.leftPanelContent.getElement());

    // Wire layout resize to viewer resize
    const unsubViewerResized = layoutManager.on('viewerResized', () => {
      viewer.resize();
    });
    if (unsubViewerResized) this._unsubscribers.push(unsubViewerResized);

    // Helper: filter elements to only those that are visible (no hidden ancestor)
    const isVisible = (el: HTMLElement, root: HTMLElement): boolean => {
      let node: HTMLElement | null = el;
      while (node && node !== root) {
        if (node.style.display === 'none' || node.hidden) return false;
        node = node.parentElement;
      }
      return true;
    };
    const getVisibleButtons = (root: HTMLElement): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled])')).filter(el => isVisible(el, root));

    // Register focus zones (order defines F6 cycling order)
    this._focusManager.addZone({
      name: 'headerBar',
      container: headerBar.getContainer(),
      getItems: () => getVisibleButtons(headerBar.getContainer()),
      orientation: 'horizontal',
    } as FocusZone);
    this._focusManager.addZone({
      name: 'tabBar',
      container: tabBar.getContainer(),
      getItems: () => tabBar.getButtons(),
      orientation: 'horizontal',
    } as FocusZone);
    this._focusManager.addZone({
      name: 'contextToolbar',
      container: contextToolbar.getContainer(),
      getItems: () => getVisibleButtons(contextToolbar.getContainer()),
      orientation: 'horizontal',
    } as FocusZone);
    this._focusManager.addZone({
      name: 'viewer',
      container: viewerEl,
      getItems: () => [viewerEl],
      orientation: 'horizontal',
    } as FocusZone);
    this._focusManager.addZone({
      name: 'timeline',
      container: timelineEl,
      getItems: () => Array.from(timelineEl.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')).filter(el => isVisible(el, timelineEl)),
      orientation: 'horizontal',
    } as FocusZone);

    // Wire modal focus trap
    setModalFocusManager(this._focusManager);

    // Shortcut cheat sheet (overlay toggled by ? key)
    this._shortcutCheatSheet = new ShortcutCheatSheet(container, customKeyBindingsManager);

    // Create AriaAnnouncer
    this._ariaAnnouncer = new AriaAnnouncer();

    // Announce tab changes
    const unsubTabChanged = tabBar.on('tabChanged', (tabId: unknown) => {
      const tabLabels: Record<string, string> = {
        view: 'View', color: 'Color', effects: 'Effects',
        transform: 'Transform', annotate: 'Annotate', qc: 'QC',
      };
      this._ariaAnnouncer!.announce(`${tabLabels[tabId as string]} tab`);
    });
    if (unsubTabChanged) this._unsubscribers.push(unsubTabChanged);

    // Announce file loaded
    const onSourceLoadedAnnounce = () => {
      const name = session.metadata?.displayName;
      if (name) {
        this._ariaAnnouncer!.announce(`File loaded: ${name}`);
      }
    };
    session.on('sourceLoaded', onSourceLoadedAnnounce);
    this._sessionHandlers.push({ event: 'sourceLoaded', handler: onSourceLoadedAnnounce });

    // Auto-detect 360 equirectangular content on source load
    const onSourceLoaded360 = (source: unknown) => {
      const sp = controls.sphericalProjection;
      const s = source as { width?: number; height?: number };
      const is360 = detect360Content({}, s.width ?? 0, s.height ?? 0);
      if (is360 && !sp.enabled) {
        sp.enable();
      } else if (!is360 && sp.enabled) {
        sp.disable();
      }
    };
    session.on('sourceLoaded', onSourceLoaded360);
    this._sessionHandlers.push({ event: 'sourceLoaded', handler: onSourceLoaded360 });

    // Announce play/pause state changes
    const onPlaybackAnnounce = (playing: unknown) => {
      this._ariaAnnouncer!.announce(playing ? 'Playback started' : 'Playback paused');
    };
    session.on('playbackChanged', onPlaybackAnnounce);
    this._sessionHandlers.push({ event: 'playbackChanged', handler: onPlaybackAnnounce });

    // Announce playback speed changes
    const onSpeedAnnounce = (speed: unknown) => {
      this._ariaAnnouncer!.announce(`Playback speed: ${speed}x`);
    };
    session.on('playbackSpeedChanged', onSpeedAnnounce);
    this._sessionHandlers.push({ event: 'playbackSpeedChanged', handler: onSpeedAnnounce });

    // Initialize FullscreenManager with the app container
    this._fullscreenManager = new FullscreenManager(container);
    this._fullscreenManager.on('fullscreenChanged', (isFullscreen) => {
      headerBar.setFullscreenState(isFullscreen);
      // Trigger layout recalculation after fullscreen change.
      // Use rAF to wait for the browser to settle the layout, then
      // dispatch a resize event so all components (viewer, timeline)
      // that listen on window 'resize' recalculate their dimensions.
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    });

    // Set elements to hide in presentation mode
    controls.presentationMode.setElementsToHide([
      headerBarEl,
      tabBarEl,
      contextToolbarEl,
      cacheIndicatorEl,
      timelineEl,
    ]);

    // === IMAGE MODE: hide playback controls + timeline for single images ===
    const updateImageMode = () => {
      const isImage = session.isSingleImage;
      headerBar.setImageMode(isImage);

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
          if (session.isSingleImage) {
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

    session.on('sourceLoaded', updateImageMode);
    this._sessionHandlers.push({ event: 'sourceLoaded', handler: updateImageMode });
    session.on('durationChanged', updateImageMode);
    this._sessionHandlers.push({ event: 'durationChanged', handler: updateImageMode });

    // Re-assert image mode after exiting presentation mode.
    // Skip the fade transition to avoid a visible flash of the timeline.
    const unsubPresentationState = controls.presentationMode.on('stateChanged', (state: unknown) => {
      const s = state as { enabled: boolean };
      if (!s.enabled) {
        const isImage = session.isSingleImage;
        headerBar.setImageMode(isImage);
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
    if (unsubPresentationState) this._unsubscribers.push(unsubPresentationState);

    // Add histogram overlay to viewer container
    viewer.getContainer().appendChild(controls.histogram.render());

    // Add waveform overlay to viewer container
    viewer.getContainer().appendChild(controls.waveform.render());

    // Add curves control overlay to viewer container
    viewer.getContainer().appendChild(controls.curvesControl.render());

    // Add vectorscope overlay to viewer container
    viewer.getContainer().appendChild(controls.vectorscope.render());

    // Add gamut diagram overlay to viewer container
    viewer.getContainer().appendChild(controls.gamutDiagram.render());

    // Add history panel to viewer container
    viewer.getContainer().appendChild(controls.historyPanel.getElement());

    // Add info panel to viewer container
    viewer.getContainer().appendChild(controls.infoPanel.getElement());

    // Add marker list panel to viewer container
    viewer.getContainer().appendChild(controls.markerListPanel.getElement());

    // Add note panel to viewer container
    viewer.getContainer().appendChild(controls.notePanel.getElement());

    // Wire up cursor color updates from viewer to info panel
    viewer.onCursorColorChange((color, position) => {
      if (controls.infoPanel.isEnabled()) {
        controls.infoPanel.update({
          colorAtCursor: color,
          cursorPosition: position,
        });
      }
    });

    // Wire histogram data from scope scheduler to mini histogram in right panel
    sessionBridge.setHistogramDataCallback((data) => {
      controls.rightPanelContent.updateHistogram(data);
    });

    // Wire info updates to right panel alongside existing InfoPanel
    const updateRightPanelInfo = () => {
      const source = session.currentSource;
      const fps = session.fps;
      const currentFrame = session.currentFrame;
      const totalFrames = source?.duration ?? 0;
      const durationSeconds = totalFrames / (fps || 1);
      controls.rightPanelContent.updateInfo({
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
    session.on('frameChanged', updateRightPanelInfo);
    this._sessionHandlers.push({ event: 'frameChanged', handler: updateRightPanelInfo });
    session.on('sourceLoaded', updateRightPanelInfo);
    this._sessionHandlers.push({ event: 'sourceLoaded', handler: updateRightPanelInfo });

    // Wire preset mode to panel sections
    const unsubPresetApplied = layoutStore.on('presetApplied', (presetId: unknown) => {
      headerBar.setActiveLayoutPreset(presetId as LayoutPresetId);
      controls.rightPanelContent.setPresetMode(presetId as string);
      controls.leftPanelContent.setPresetMode(presetId as string);
    });
    if (unsubPresetApplied) this._unsubscribers.push(unsubPresetApplied);

    // Bind all session event handlers (scopes, info panel, HDR auto-config, etc.)
    sessionBridge.bindSessionEvents();

    // Apply client mode restrictions (hide restricted UI elements)
    if (clientMode.isEnabled()) {
      this.applyClientModeRestrictions();
    }
    const unsubClientModeState = clientMode.on('stateChanged', (state: unknown) => {
      const s = state as { enabled: boolean };
      if (s.enabled) {
        this.applyClientModeRestrictions();
      }
    });
    if (unsubClientModeState) this._unsubscribers.push(unsubClientModeState);

    // Handle clear frame event from paint toolbar
    const paintToolbarEl = controls.paintToolbar.render();
    paintToolbarEl.addEventListener('clearFrame', () => {
      paintEngine.clearFrame(session.currentFrame);
    });

    // Sync annotation version filter when A/B source changes
    const onAbSourceChanged = () => {
      controls.paintToolbar.setAnnotationVersion(session.currentAB);
    };
    session.on('abSourceChanged', onAbSourceChanged);
    this._sessionHandlers.push({ event: 'abSourceChanged', handler: onAbSourceChanged });
  }

  // -------------------------------------------------------------------------
  // Client mode
  // -------------------------------------------------------------------------

  applyClientModeRestrictions(): void {
    const { container, clientMode } = this.deps;
    const selectors = clientMode.getRestrictedElements();
    for (const selector of selectors) {
      const els = container.querySelectorAll<HTMLElement>(selector);
      els.forEach((el) => {
        el.style.display = 'none';
      });
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  dispose(): void {
    // Clear image transition timer
    if (this._imageTransitionTimer !== null) {
      clearTimeout(this._imageTransitionTimer);
      this._imageTransitionTimer = null;
    }

    // Unsubscribe session event handlers
    const { session } = this.deps;
    for (const { event, handler } of this._sessionHandlers) {
      session.off(event, handler);
    }
    this._sessionHandlers = [];

    // Unsubscribe non-session event handlers (layoutManager, tabBar, presentationMode, layoutStore, clientMode)
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers = [];

    // Dispose sub-objects
    this._fullscreenManager?.dispose();
    this._fullscreenManager = null;

    this._shortcutCheatSheet?.dispose();
    this._shortcutCheatSheet = null;

    this._focusManager?.dispose();
    this._focusManager = null;

    this._ariaAnnouncer?.dispose();
    this._ariaAnnouncer = null;
  }
}
