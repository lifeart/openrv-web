/**
 * KeyboardActionMap - Pure function that builds the action-name → handler map.
 *
 * Extracted from App.getActionHandlers() so the mapping logic is testable in
 * isolation and App.ts stays a thin composition root.
 */

import { getThemeManager } from '../utils/ui/ThemeManager';
import { getGlobalHistoryManager } from '../utils/HistoryManager';
import { getCorePreferencesManager } from '../core/PreferencesManager';
import { showAlert } from '../ui/components/shared/Modal';

// ---------------------------------------------------------------------------
// Dependency interfaces (structural typing)
// ---------------------------------------------------------------------------

/** Subset of Session used by keyboard actions. */
export interface ActionSession {
  currentFrame: number;
  currentSourceIndex: number;
  loopMode: 'once' | 'loop' | 'pingpong';
  togglePlayback(): void;
  stepForward(): void;
  stepBackward(): void;
  togglePlayDirection(): void;
  goToStart(): void;
  goToEnd(): void;
  decreaseSpeed(): void;
  increaseSpeed(): void;
  pause(): void;
  setInPoint(): void;
  setOutPoint(): void;
  toggleMark(): void;
  resetInOutPoints(): void;
  goToFrame(frame: number): void;
  toggleAB(): void;
  toggleMute(): void;
  togglePlaybackMode(): void;
  noteManager: {
    getNextNoteFrame(sourceIndex: number, currentFrame: number): number;
    getPreviousNoteFrame(sourceIndex: number, currentFrame: number): number;
  };
}

/** Subset of Viewer used by keyboard actions. */
export interface ActionViewer {
  smoothFitToWindow(): void;
  smoothFitToWidth(): void;
  smoothFitToHeight(): void;
  smoothSetZoom(level: number): void;
  smoothSetPixelRatio(ratio: number): void;
  refresh(): void;
  copyFrameToClipboard(includeAnnotations: boolean): Promise<boolean>;
  getPixelProbe(): { toggle(): void };
  getFalseColor(): { toggle(): void };
  getTimecodeOverlay(): { toggle(): void };
  getInfoStripOverlay(): { toggle(): void; togglePathMode(): void };
  getFPSIndicator(): { toggle(): void };
  getZebraStripes(): { toggle(): void };
  getColorWheels(): { toggle(): void };
  getSpotlightOverlay(): { toggle(): void };
  getHSLQualifier(): { toggle(): void };
  getLuminanceVisualization(): { cycleMode(): void };
  getImageData(): { width: number; height: number; data: Uint8ClampedArray } | null;
  toggleFilterMode(): void;
}

/** Subset of PaintEngine used by keyboard actions. */
export interface ActionPaintEngine {
  undo(): void;
  redo(): void;
}

/** Subset of TabBar used by keyboard actions. */
export interface ActionTabBar {
  activeTab: string;
  setActiveTab(tab: string): void;
}

/** Subset of controls (AppControlRegistry) used by keyboard actions. */
export interface ActionControls {
  playlistManager: { isEnabled(): boolean };
  paintToolbar: { handleKeyboard(key: string): void };
  channelSelect: { handleKeyboard(key: string, toggle: boolean): void };
  compareControl: {
    cycleWipeMode(): void;
    toggleDifferenceMatte(): void;
    toggleSplitScreen(): void;
    isDropdownVisible(): boolean;
    close(): void;
  };
  scopesControl: { toggleScope(scope: string): void };
  ghostFrameControl: { toggle(): void };
  parControl: { toggle(): void };
  backgroundPatternControl: {
    cyclePattern(): void;
    toggleCheckerboard(): void;
  };
  colorControls: { toggle(): void; hide(): void };
  filterControl: { toggle(): void; isOpen: boolean; hide(): void };
  curvesControl: { toggle(): void; hide(): void };
  cropControl: { toggle(): void; hidePanel(): void };
  ocioControl: { toggle(): void; hide(): void };
  displayProfileControl: {
    cycleProfile(): void;
    isDropdownVisible(): boolean;
    closeDropdown(): void;
  };
  transformControl: {
    rotateLeft(): void;
    rotateRight(): void;
    toggleFlipH(): void;
    toggleFlipV(): void;
    setRotation(degrees: number): void;
  };
  toneMappingControl: { toggle(): void };
  colorInversionToggle: { toggle(): void };
  historyPanel: { toggle(): void };
  markerListPanel: { toggle(): void };
  infoPanel: { toggle(): void; isEnabled(): boolean };
  snapshotPanel: { toggle(): void };
  playlistPanel: { toggle(): void };
  notePanel: {
    toggle(): void;
    addNoteAtCurrentFrame(): void;
    isVisible(): boolean;
    hide(): void;
  };
  presentationMode: {
    toggle(): void;
    getState(): { enabled: boolean };
  };
  networkControl: {
    togglePanel(): void;
    closePanel(): void;
  };
  networkSyncManager: {
    isConnected: boolean;
    leaveRoom(): void;
  };
  stereoControl: { handleKeyboard(key: string, toggle: boolean): void };
  stereoEyeTransformControl: {
    handleKeyboard(key: string, toggle: boolean): void;
    isPanelVisible(): boolean;
    hidePanel(): void;
  };
  stereoAlignControl: { handleKeyboard(key: string, toggle: boolean): void };
  safeAreasControl: { getOverlay(): { toggle(): void } };
  lutPipelinePanel: {
    toggle(): void;
    getIsVisible(): boolean;
    hide(): void;
  };
  deinterlaceControl?: { isOpen: boolean; hide(): void };
  filmEmulationControl?: { isOpen: boolean; hide(): void };
  shotGridPanel: { isOpen(): boolean; hide(): void };
  referenceManager: {
    captureReference(image: { width: number; height: number; data: Uint8ClampedArray; channels: number }): void;
    enable(): void;
    toggle(): void;
  };
  isNoiseReductionPanelVisible(): boolean;
  hideNoiseReductionPanel(): void;
  isWatermarkPanelVisible(): boolean;
  hideWatermarkPanel(): void;
  isTimelineEditorPanelVisible(): boolean;
  hideTimelineEditorPanel(): void;
  isSlateEditorPanelVisible(): boolean;
  hideSlateEditorPanel(): void;
  timelineMagnifier: { toggle(): void };
  gotoFrameOverlay: { show(): void };
}

export interface ActionActiveContextManager {
  isContextActive(context: string): boolean;
}

export interface ActionFullscreenManager {
  toggle(): void;
}

export interface ActionFocusManager {
  focusNextZone(): void;
  focusPreviousZone(): void;
}

export interface ActionShortcutCheatSheet {
  toggle(): void;
  isVisible(): boolean;
  hide(): void;
}

export interface ActionPersistenceManager {
  createQuickSnapshot(): void;
}

export interface ActionSessionBridge {
  updateInfoPanel(): void;
}

export interface ActionLayoutStore {
  applyPreset(preset: string): void;
}

export interface ActionExternalPresentation {
  openWindow(): void;
}

export interface ActionHeaderBar {
  getExportControl(): { quickExport(format?: string): void };
}

export interface ActionFrameNavigation {
  goToNextAnnotation(): void;
  goToPreviousAnnotation(): void;
  goToPlaylistStart(): void;
  goToPlaylistEnd(): void;
  goToNextMarkOrBoundary(): void;
  goToPreviousMarkOrBoundary(): void;
  goToNextShot(): void;
  goToPreviousShot(): void;
  shiftRangeToNext(): { inPoint: number; outPoint: number } | null;
  shiftRangeToPrevious(): { inPoint: number; outPoint: number } | null;
}

export interface ActionAriaAnnouncer {
  announce(message: string, priority?: 'polite' | 'assertive'): void;
}

// ---------------------------------------------------------------------------
// Aggregated dependencies
// ---------------------------------------------------------------------------

/** Subset of ClientMode used by keyboard action gating. */
export interface ActionClientMode {
  isActionAllowed(action: string): boolean;
}

export interface KeyboardActionDeps {
  session: ActionSession;
  viewer: ActionViewer;
  paintEngine: ActionPaintEngine;
  tabBar: ActionTabBar;
  controls: ActionControls;
  activeContextManager: ActionActiveContextManager;
  fullscreenManager: ActionFullscreenManager | null;
  focusManager: ActionFocusManager | null;
  shortcutCheatSheet: ActionShortcutCheatSheet | null;
  persistenceManager: ActionPersistenceManager;
  sessionBridge: ActionSessionBridge;
  layoutStore: ActionLayoutStore;
  externalPresentation: ActionExternalPresentation;
  headerBar: ActionHeaderBar;
  frameNavigation: ActionFrameNavigation;
  ariaAnnouncer?: ActionAriaAnnouncer | null;
  /** When provided, actions are gated by client mode allowlist (#195). */
  clientMode?: ActionClientMode | null;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build the action-name → handler record consumed by AppKeyboardHandler.
 *
 * This is a **pure function** (aside from the `getThemeManager()` singleton
 * call for theme cycling).  Every handler closes over the supplied `deps`.
 *
 * When `deps.clientMode` is provided, every handler is wrapped so that
 * blocked actions are silently ignored (no error, just a no-op).  This
 * enforces the client mode action allowlist at the keyboard layer (#195).
 */
export function buildActionHandlers(deps: KeyboardActionDeps): Record<string, () => void> {
  const {
    session,
    viewer,
    paintEngine,
    tabBar,
    controls,
    activeContextManager,
    fullscreenManager,
    focusManager,
    shortcutCheatSheet,
    persistenceManager,
    sessionBridge,
    layoutStore,
    externalPresentation,
    headerBar,
    frameNavigation,
    ariaAnnouncer,
  } = deps;

  const { clientMode } = deps;

  const rawHandlers: Record<string, () => void> = {
    // -- Playback --------------------------------------------------------
    'playback.toggle': () => session.togglePlayback(),
    'playback.stepForward': () => session.stepForward(),
    'playback.stepBackward': () => session.stepBackward(),
    'playback.toggleDirection': () => session.togglePlayDirection(),
    'playback.goToStart': () => {
      if (controls.playlistManager.isEnabled()) {
        frameNavigation.goToPlaylistStart();
        return;
      }
      session.goToStart();
    },
    'playback.goToEnd': () => {
      if (controls.playlistManager.isEnabled()) {
        frameNavigation.goToPlaylistEnd();
        return;
      }
      session.goToEnd();
    },
    'playback.slower': () => session.decreaseSpeed(),
    'playback.stop': () => session.pause(),
    'playback.faster': () => {
      // L key - increase speed, but in paint context, line tool takes precedence
      if (activeContextManager.isContextActive('paint')) {
        controls.paintToolbar.handleKeyboard('l');
        return;
      }
      session.increaseSpeed();
    },

    // -- Timeline --------------------------------------------------------
    'timeline.setInPoint': () => session.setInPoint(),
    'timeline.setInPointAlt': () => session.setInPoint(),
    'timeline.setOutPoint': () => {
      // O key - set out point, but in paint context, ellipse tool takes precedence
      if (activeContextManager.isContextActive('paint')) {
        controls.paintToolbar.handleKeyboard('o');
        return;
      }
      session.setOutPoint();
    },
    'timeline.setOutPointAlt': () => session.setOutPoint(),
    'timeline.toggleMark': () => session.toggleMark(),
    'timeline.nextMarkOrBoundary': () => frameNavigation.goToNextMarkOrBoundary(),
    'timeline.previousMarkOrBoundary': () => frameNavigation.goToPreviousMarkOrBoundary(),
    'timeline.nextShot': () => frameNavigation.goToNextShot(),
    'timeline.previousShot': () => frameNavigation.goToPreviousShot(),
    'timeline.resetInOut': () => {
      // R key - reset in/out points, but in paint context, rectangle tool takes precedence
      if (activeContextManager.isContextActive('paint')) {
        controls.paintToolbar.handleKeyboard('r');
        return;
      }
      session.resetInOutPoints();
    },
    'timeline.cycleLoopMode': () => {
      const modes: Array<'once' | 'loop' | 'pingpong'> = ['once', 'loop', 'pingpong'];
      const currentIndex = modes.indexOf(session.loopMode);
      session.loopMode = modes[(currentIndex + 1) % modes.length]!;
    },
    'timeline.toggleMagnifier': () => controls.timelineMagnifier.toggle(),
    'timeline.shiftRangeNext': () => {
      const result = frameNavigation.shiftRangeToNext();
      if (result) {
        ariaAnnouncer?.announce(`Range shifted to frames ${result.inPoint} - ${result.outPoint}`);
      }
    },
    'timeline.shiftRangePrevious': () => {
      const result = frameNavigation.shiftRangeToPrevious();
      if (result) {
        ariaAnnouncer?.announce(`Range shifted to frames ${result.inPoint} - ${result.outPoint}`);
      }
    },
    'timeline.shiftRangeNextAlt': () => {
      const result = frameNavigation.shiftRangeToNext();
      if (result) {
        ariaAnnouncer?.announce(`Range shifted to frames ${result.inPoint} - ${result.outPoint}`);
      }
    },
    'timeline.shiftRangePreviousAlt': () => {
      const result = frameNavigation.shiftRangeToPrevious();
      if (result) {
        ariaAnnouncer?.announce(`Range shifted to frames ${result.inPoint} - ${result.outPoint}`);
      }
    },

    // -- View ------------------------------------------------------------
    'view.fitToWindow': () => viewer.smoothFitToWindow(),
    'view.fitToWindowAlt': () => viewer.smoothFitToWindow(),
    'view.fitToWidth': () => viewer.smoothFitToWidth(),
    'view.fitToHeight': () => viewer.smoothFitToHeight(),
    'view.zoom50': () => {
      if (tabBar.activeTab === 'view') {
        viewer.smoothSetZoom(0.5);
      }
    },
    'view.cycleWipeMode': () => controls.compareControl.cycleWipeMode(),
    'view.toggleWaveform': () => controls.scopesControl.toggleScope('waveform'),
    'view.toggleAB': () => session.toggleAB(),
    'view.toggleABAlt': () => session.toggleAB(),
    'view.toggleDifferenceMatte': () => controls.compareControl.toggleDifferenceMatte(),
    'view.toggleSplitScreen': () => controls.compareControl.toggleSplitScreen(),
    'view.toggleGhostFrames': () => controls.ghostFrameControl.toggle(),
    'view.togglePAR': () => controls.parControl.toggle(),
    'view.cycleBackgroundPattern': () => controls.backgroundPatternControl.cyclePattern(),
    'view.toggleCheckerboard': () => controls.backgroundPatternControl.toggleCheckerboard(),
    'view.toggleGuides': () => controls.safeAreasControl.getOverlay().toggle(),
    'view.togglePixelProbe': () => viewer.getPixelProbe().toggle(),
    'view.toggleFalseColor': () => viewer.getFalseColor().toggle(),
    'view.toggleToneMapping': () => controls.toneMappingControl.toggle(),
    'view.toggleTimecodeOverlay': () => viewer.getTimecodeOverlay().toggle(),
    'view.toggleInfoStrip': () => viewer.getInfoStripOverlay().toggle(),
    'view.toggleInfoStripPath': () => viewer.getInfoStripOverlay().togglePathMode(),
    'view.toggleFPSIndicator': () => viewer.getFPSIndicator().toggle(),
    'view.toggleZebraStripes': () => {
      const zebras = viewer.getZebraStripes();
      zebras.toggle();
      viewer.refresh();
    },
    'view.toggleSpotlight': () => {
      viewer.getSpotlightOverlay().toggle();
    },
    'view.cycleLuminanceVis': () => {
      viewer.getLuminanceVisualization().cycleMode();
    },
    'view.toggleInfoPanel': () => {
      controls.infoPanel.toggle();
      if (controls.infoPanel.isEnabled()) {
        sessionBridge.updateInfoPanel();
      }
    },
    'view.captureReference': () => {
      const imageData = viewer.getImageData();
      if (imageData) {
        controls.referenceManager.captureReference({
          width: imageData.width,
          height: imageData.height,
          data: imageData.data,
          channels: 4,
        });
        controls.referenceManager.enable();
      }
    },
    'view.toggleReference': () => {
      controls.referenceManager.toggle();
    },
    'view.toggleFullscreen': () => {
      fullscreenManager?.toggle();
    },
    'view.togglePresentation': () => {
      controls.presentationMode.toggle();
    },
    'view.openPresentationWindow': () => externalPresentation.openWindow(),

    // -- Panels ----------------------------------------------------------
    'panel.color': () => controls.colorControls.toggle(),
    'panel.effects': () => controls.filterControl.toggle(),
    'panel.curves': () => controls.curvesControl.toggle(),
    'panel.crop': () => controls.cropControl.toggle(),
    'panel.waveform': () => controls.scopesControl.toggleScope('waveform'),
    'panel.vectorscope': () => controls.scopesControl.toggleScope('vectorscope'),
    'panel.gamutDiagram': () => controls.scopesControl.toggleScope('gamutDiagram'),
    'panel.histogram': () => controls.scopesControl.toggleScope('histogram'),
    'panel.ocio': () => controls.ocioControl.toggle(),
    'panel.history': () => {
      controls.historyPanel.toggle();
    },
    'panel.markers': () => {
      controls.markerListPanel.toggle();
    },
    'panel.snapshots': () => {
      controls.snapshotPanel.toggle();
    },
    'panel.playlist': () => {
      controls.playlistPanel.toggle();
    },
    'panel.notes': () => {
      controls.notePanel.toggle();
    },
    'panel.close': () => {
      // ESC hides cheat sheet first
      if (shortcutCheatSheet?.isVisible()) {
        shortcutCheatSheet.hide();
        return;
      }
      // ESC exits presentation mode first, then fullscreen
      if (controls.presentationMode.getState().enabled) {
        controls.presentationMode.toggle();
        return;
      }
      // Close all transient floating panels/dropdowns
      // Each hide() is a no-op when already closed, so this is safe.
      // Individual controls with their own Escape handlers will have
      // already closed themselves before this cascade runs.
      if (controls.colorControls) {
        controls.colorControls.hide();
      }
      if (controls.cropControl) {
        controls.cropControl.hidePanel();
      }
      if (controls.filterControl?.isOpen) {
        controls.filterControl.hide();
      }
      if (controls.deinterlaceControl?.isOpen) {
        controls.deinterlaceControl.hide();
      }
      if (controls.filmEmulationControl?.isOpen) {
        controls.filmEmulationControl.hide();
      }
      if (controls.curvesControl) {
        controls.curvesControl.hide();
      }
      if (controls.ocioControl) {
        controls.ocioControl.hide();
      }
      if (controls.lutPipelinePanel?.getIsVisible()) {
        controls.lutPipelinePanel.hide();
      }
      if (controls.compareControl?.isDropdownVisible()) {
        controls.compareControl.close();
      }
      if (controls.networkControl) {
        controls.networkControl.closePanel();
      }
      // Close stereo eye transform panel
      if (controls.stereoEyeTransformControl.isPanelVisible()) {
        controls.stereoEyeTransformControl.hidePanel();
      }
      if (controls.displayProfileControl.isDropdownVisible()) {
        controls.displayProfileControl.closeDropdown();
      }
      if (controls.notePanel.isVisible()) {
        controls.notePanel.hide();
      }
      if (controls.shotGridPanel.isOpen()) {
        controls.shotGridPanel.hide();
      }
      if (controls.isNoiseReductionPanelVisible()) {
        controls.hideNoiseReductionPanel();
      }
      if (controls.isWatermarkPanelVisible()) {
        controls.hideWatermarkPanel();
      }
      if (controls.isTimelineEditorPanelVisible()) {
        controls.hideTimelineEditorPanel();
      }
      if (controls.isSlateEditorPanelVisible()) {
        controls.hideSlateEditorPanel();
      }
    },

    // -- Display ---------------------------------------------------------
    'display.cycleProfile': () => controls.displayProfileControl.cycleProfile(),

    // -- Transform -------------------------------------------------------
    'transform.rotateLeft': () => controls.transformControl.rotateLeft(),
    'transform.rotateRight': () => controls.transformControl.rotateRight(),
    'transform.flipHorizontal': () => controls.transformControl.toggleFlipH(),
    'transform.flipVertical': () => controls.transformControl.toggleFlipV(),
    'transform.resetRotation': () => controls.transformControl.setRotation(0),

    // -- Export ----------------------------------------------------------
    'export.quickExport': () => headerBar.getExportControl().quickExport('png'),
    'export.copyFrame': async () => {
      const includeAnnotations = getCorePreferencesManager().getExportDefaults().includeAnnotations;
      const ok = await viewer.copyFrameToClipboard(includeAnnotations);
      if (!ok) {
        showAlert('Failed to copy frame to clipboard. Your browser may have denied clipboard access.', {
          type: 'warning',
          title: 'Clipboard Unavailable',
        });
      }
    },

    // -- Edit / Paint ----------------------------------------------------
    'edit.undo': () => {
      const historyManager = getGlobalHistoryManager();
      if (historyManager.canUndo()) {
        historyManager.undo();
      } else {
        paintEngine.undo();
      }
    },
    'edit.redo': () => {
      const historyManager = getGlobalHistoryManager();
      if (historyManager.canRedo()) {
        historyManager.redo();
      } else {
        paintEngine.redo();
      }
    },
    'edit.redo-alt': () => {
      const historyManager = getGlobalHistoryManager();
      if (historyManager.canRedo()) {
        historyManager.redo();
      } else {
        paintEngine.redo();
      }
    },
    'paint.pan': () => controls.paintToolbar.handleKeyboard('v'),
    'paint.pen': () => controls.paintToolbar.handleKeyboard('p'),
    'paint.eraser': () => controls.paintToolbar.handleKeyboard('e'),
    'paint.text': () => controls.paintToolbar.handleKeyboard('t'),
    'paint.rectangle': () => controls.paintToolbar.handleKeyboard('r'),
    'paint.ellipse': () => controls.paintToolbar.handleKeyboard('o'),
    'paint.line': () => controls.paintToolbar.handleKeyboard('l'),
    'paint.arrow': () => controls.paintToolbar.handleKeyboard('a'),
    'paint.toggleBrush': () => controls.paintToolbar.handleKeyboard('b'),
    'paint.toggleGhost': () => controls.paintToolbar.handleKeyboard('g'),
    'paint.toggleHold': () => controls.paintToolbar.handleKeyboard('x'),

    // -- Navigation -------------------------------------------------------
    'navigation.gotoFrame': () => controls.gotoFrameOverlay.show(),

    // -- Annotations -----------------------------------------------------
    'annotation.previous': () => frameNavigation.goToPreviousAnnotation(),
    'annotation.next': () => frameNavigation.goToNextAnnotation(),

    // -- Tabs ------------------------------------------------------------
    'tab.view': () => tabBar.setActiveTab('view'),
    'tab.color': () => tabBar.setActiveTab('color'),
    'tab.effects': () => tabBar.setActiveTab('effects'),
    'tab.transform': () => tabBar.setActiveTab('transform'),
    'tab.annotate': () => tabBar.setActiveTab('annotate'),
    'tab.qc': () => tabBar.setActiveTab('qc'),

    // -- Channels --------------------------------------------------------
    'channel.red': () => controls.channelSelect.handleKeyboard('R', true),
    'channel.green': () => controls.channelSelect.handleKeyboard('G', true),
    'channel.blue': () => controls.channelSelect.handleKeyboard('B', true),
    'channel.alpha': () => controls.channelSelect.handleKeyboard('A', true),
    'channel.luminance': () => controls.channelSelect.handleKeyboard('L', true),
    'lut.togglePanel': () => controls.lutPipelinePanel.toggle(),
    'channel.grayscale': () => controls.channelSelect.handleKeyboard('Y', true),
    'channel.none': () => controls.channelSelect.handleKeyboard('N', true),

    // -- Stereo ----------------------------------------------------------
    'stereo.toggle': () => controls.stereoControl.handleKeyboard('3', true),
    'stereo.eyeTransform': () => controls.stereoEyeTransformControl.handleKeyboard('E', true),
    'stereo.cycleAlign': () => controls.stereoAlignControl.handleKeyboard('4', true),

    // -- Color -----------------------------------------------------------
    'color.toggleColorWheels': () => {
      viewer.getColorWheels().toggle();
    },
    'color.toggleHSLQualifier': () => {
      viewer.getHSLQualifier().toggle();
    },
    'color.toggleInversion': () => {
      controls.colorInversionToggle.toggle();
    },

    // -- Snapshots / Persistence -----------------------------------------
    'snapshot.create': () => {
      persistenceManager.createQuickSnapshot();
    },

    // -- Texture filter mode -----------------------------------------------
    'view.toggleFilterMode': () => {
      viewer.toggleFilterMode();
    },

    // -- Notes -----------------------------------------------------------
    'notes.addNote': () => {
      controls.notePanel.addNoteAtCurrentFrame();
    },
    'notes.next': () => {
      const frame = session.noteManager.getNextNoteFrame(session.currentSourceIndex, session.currentFrame);
      if (frame !== session.currentFrame) {
        session.goToFrame(frame);
      }
    },
    'notes.previous': () => {
      const frame = session.noteManager.getPreviousNoteFrame(session.currentSourceIndex, session.currentFrame);
      if (frame !== session.currentFrame) {
        session.goToFrame(frame);
      }
    },

    // -- Network ---------------------------------------------------------
    'network.togglePanel': () => {
      controls.networkControl.togglePanel();
    },
    'network.disconnect': () => {
      if (controls.networkSyncManager.isConnected) {
        controls.networkSyncManager.leaveRoom();
      }
    },

    // -- Focus -----------------------------------------------------------
    'focus.nextZone': () => {
      focusManager?.focusNextZone();
    },
    'focus.previousZone': () => {
      focusManager?.focusPreviousZone();
    },

    // -- Layout ----------------------------------------------------------
    'layout.default': () => layoutStore.applyPreset('default'),
    'layout.review': () => layoutStore.applyPreset('review'),
    'layout.color': () => layoutStore.applyPreset('color'),
    'layout.paint': () => layoutStore.applyPreset('paint'),

    // -- Theme -----------------------------------------------------------
    'theme.cycle': () => {
      getThemeManager().cycleMode();
    },

    // -- Help ------------------------------------------------------------
    'help.toggleCheatSheet': () => shortcutCheatSheet?.toggle(),

    // -- Audio -----------------------------------------------------------
    'audio.toggleMute': () => session.toggleMute(),

    // -- Playback mode ---------------------------------------------------
    'playback.togglePlaybackMode': () => session.togglePlaybackMode(),

    // -- Scale presets (magnification) -----------------------------------
    'view.zoom1to1': () => viewer.smoothSetPixelRatio(1),
    'view.zoom2to1': () => viewer.smoothSetPixelRatio(2),
    'view.zoom3to1': () => viewer.smoothSetPixelRatio(3),
    'view.zoom4to1': () => viewer.smoothSetPixelRatio(4),
    'view.zoom5to1': () => viewer.smoothSetPixelRatio(5),
    'view.zoom6to1': () => viewer.smoothSetPixelRatio(6),
    'view.zoom7to1': () => viewer.smoothSetPixelRatio(7),
    'view.zoom8to1': () => viewer.smoothSetPixelRatio(8),

    // -- Scale presets (reduction) ----------------------------------------
    'view.zoom1to2': () => viewer.smoothSetPixelRatio(0.5),
    'view.zoom1to3': () => viewer.smoothSetPixelRatio(1 / 3),
    'view.zoom1to4': () => viewer.smoothSetPixelRatio(0.25),
    'view.zoom1to5': () => viewer.smoothSetPixelRatio(0.2),
    'view.zoom1to6': () => viewer.smoothSetPixelRatio(1 / 6),
    'view.zoom1to7': () => viewer.smoothSetPixelRatio(1 / 7),
    'view.zoom1to8': () => viewer.smoothSetPixelRatio(0.125),
  };

  // When client mode is provided, wrap every handler so that disallowed
  // actions are silently ignored (no error, just blocked).
  if (!clientMode) return rawHandlers;

  const gated: Record<string, () => void> = {};
  for (const [action, handler] of Object.entries(rawHandlers)) {
    gated[action] = () => {
      if (!clientMode.isActionAllowed(action)) return;
      handler();
    };
  }
  return gated;
}
