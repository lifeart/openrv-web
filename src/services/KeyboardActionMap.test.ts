import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildActionHandlers,
  type KeyboardActionDeps,
} from './KeyboardActionMap';

// ---------------------------------------------------------------------------
// Mock getThemeManager (module-level singleton)
// ---------------------------------------------------------------------------

const mockThemeManager = { cycleMode: vi.fn() };
vi.mock('../utils/ui/ThemeManager', () => ({
  getThemeManager: () => mockThemeManager,
}));

// ---------------------------------------------------------------------------
// Helpers to build lightweight test doubles
// ---------------------------------------------------------------------------

function createMockSession() {
  return {
    currentFrame: 10,
    currentSourceIndex: 0,
    loopMode: 'once' as 'once' | 'loop' | 'pingpong',
    togglePlayback: vi.fn(),
    stepForward: vi.fn(),
    stepBackward: vi.fn(),
    togglePlayDirection: vi.fn(),
    goToStart: vi.fn(),
    goToEnd: vi.fn(),
    decreaseSpeed: vi.fn(),
    increaseSpeed: vi.fn(),
    pause: vi.fn(),
    setInPoint: vi.fn(),
    setOutPoint: vi.fn(),
    toggleMark: vi.fn(),
    resetInOutPoints: vi.fn(),
    goToFrame: vi.fn(),
    toggleAB: vi.fn(),
    toggleMute: vi.fn(),
    noteManager: {
      getNextNoteFrame: vi.fn().mockReturnValue(20),
      getPreviousNoteFrame: vi.fn().mockReturnValue(5),
    },
  };
}

function createMockViewer() {
  return {
    smoothFitToWindow: vi.fn(),
    smoothSetZoom: vi.fn(),
    refresh: vi.fn(),
    copyFrameToClipboard: vi.fn(),
    getPixelProbe: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getFalseColor: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getTimecodeOverlay: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getZebraStripes: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getColorWheels: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getSpotlightOverlay: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getHSLQualifier: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getLuminanceVisualization: vi.fn().mockReturnValue({ cycleMode: vi.fn() }),
    getImageData: vi.fn().mockReturnValue({ width: 100, height: 100, data: new Uint8ClampedArray(100 * 100 * 4) }),
  };
}

function createMockControls() {
  return {
    playlistManager: { isEnabled: vi.fn().mockReturnValue(false) },
    paintToolbar: { handleKeyboard: vi.fn() },
    channelSelect: { handleKeyboard: vi.fn() },
    compareControl: {
      cycleWipeMode: vi.fn(),
      toggleDifferenceMatte: vi.fn(),
      toggleSplitScreen: vi.fn(),
      isDropdownVisible: vi.fn().mockReturnValue(false),
      close: vi.fn(),
    },
    scopesControl: { toggleScope: vi.fn() },
    ghostFrameControl: { toggle: vi.fn() },
    parControl: { toggle: vi.fn() },
    backgroundPatternControl: {
      cyclePattern: vi.fn(),
      toggleCheckerboard: vi.fn(),
    },
    colorControls: { toggle: vi.fn(), hide: vi.fn() },
    filterControl: { toggle: vi.fn(), isOpen: false, hide: vi.fn() },
    curvesControl: { toggle: vi.fn(), hide: vi.fn() },
    cropControl: { toggle: vi.fn(), hidePanel: vi.fn() },
    ocioControl: { toggle: vi.fn(), hide: vi.fn() },
    displayProfileControl: {
      cycleProfile: vi.fn(),
      isDropdownVisible: vi.fn().mockReturnValue(false),
      closeDropdown: vi.fn(),
    },
    transformControl: {
      rotateLeft: vi.fn(),
      rotateRight: vi.fn(),
      toggleFlipH: vi.fn(),
      toggleFlipV: vi.fn(),
    },
    toneMappingControl: { toggle: vi.fn() },
    colorInversionToggle: { toggle: vi.fn() },
    historyPanel: { toggle: vi.fn() },
    markerListPanel: { toggle: vi.fn() },
    infoPanel: { toggle: vi.fn(), isEnabled: vi.fn().mockReturnValue(false) },
    snapshotPanel: { toggle: vi.fn() },
    playlistPanel: { toggle: vi.fn() },
    notePanel: {
      toggle: vi.fn(),
      addNoteAtCurrentFrame: vi.fn(),
      isVisible: vi.fn().mockReturnValue(false),
      hide: vi.fn(),
    },
    presentationMode: {
      toggle: vi.fn(),
      getState: vi.fn().mockReturnValue({ enabled: false }),
    },
    networkControl: {
      togglePanel: vi.fn(),
      closePanel: vi.fn(),
    },
    networkSyncManager: {
      isConnected: false,
      leaveRoom: vi.fn(),
    },
    stereoControl: { handleKeyboard: vi.fn() },
    stereoEyeTransformControl: {
      handleKeyboard: vi.fn(),
      isPanelVisible: vi.fn().mockReturnValue(false),
      hidePanel: vi.fn(),
    },
    stereoAlignControl: { handleKeyboard: vi.fn() },
    safeAreasControl: { getOverlay: vi.fn().mockReturnValue({ toggle: vi.fn() }) },
    lutPipelinePanel: {
      toggle: vi.fn(),
      getIsVisible: vi.fn().mockReturnValue(false),
      hide: vi.fn(),
    },
    deinterlaceControl: { isOpen: false, hide: vi.fn() },
    filmEmulationControl: { isOpen: false, hide: vi.fn() },
    shotGridPanel: { isOpen: vi.fn().mockReturnValue(false), hide: vi.fn() },
    referenceManager: {
      captureReference: vi.fn(),
      enable: vi.fn(),
      toggle: vi.fn(),
    },
    isNoiseReductionPanelVisible: vi.fn().mockReturnValue(false),
    hideNoiseReductionPanel: vi.fn(),
    isWatermarkPanelVisible: vi.fn().mockReturnValue(false),
    hideWatermarkPanel: vi.fn(),
    isTimelineEditorPanelVisible: vi.fn().mockReturnValue(false),
    hideTimelineEditorPanel: vi.fn(),
    isSlateEditorPanelVisible: vi.fn().mockReturnValue(false),
    hideSlateEditorPanel: vi.fn(),
  };
}

function createMockDeps(): KeyboardActionDeps & { session: ReturnType<typeof createMockSession>; viewer: ReturnType<typeof createMockViewer>; controls: ReturnType<typeof createMockControls> } {
  return {
    session: createMockSession(),
    viewer: createMockViewer(),
    paintEngine: { undo: vi.fn(), redo: vi.fn() },
    tabBar: { activeTab: 'view', setActiveTab: vi.fn() },
    controls: createMockControls(),
    activeContextManager: { isContextActive: vi.fn().mockReturnValue(false) },
    fullscreenManager: { toggle: vi.fn() },
    focusManager: { focusNextZone: vi.fn(), focusPreviousZone: vi.fn() },
    shortcutCheatSheet: { toggle: vi.fn(), isVisible: vi.fn().mockReturnValue(false), hide: vi.fn() },
    persistenceManager: { createQuickSnapshot: vi.fn() },
    sessionBridge: { updateInfoPanel: vi.fn() },
    layoutStore: { applyPreset: vi.fn() },
    externalPresentation: { openWindow: vi.fn() },
    headerBar: { getExportControl: vi.fn().mockReturnValue({ quickExport: vi.fn() }) },
    frameNavigation: {
      goToNextAnnotation: vi.fn(),
      goToPreviousAnnotation: vi.fn(),
      goToPlaylistStart: vi.fn(),
      goToPlaylistEnd: vi.fn(),
      goToNextMarkOrBoundary: vi.fn(),
      goToPreviousMarkOrBoundary: vi.fn(),
      goToNextShot: vi.fn(),
      goToPreviousShot: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildActionHandlers', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let handlers: Record<string, () => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    handlers = buildActionHandlers(deps);
  });

  // -- Structural --------------------------------------------------------

  it('returns a record with all expected action keys', () => {
    const keys = Object.keys(handlers);
    expect(keys.length).toBeGreaterThanOrEqual(100);

    // Spot-check a variety of categories
    expect(keys).toContain('playback.toggle');
    expect(keys).toContain('timeline.setInPoint');
    expect(keys).toContain('view.fitToWindow');
    expect(keys).toContain('panel.color');
    expect(keys).toContain('channel.red');
    expect(keys).toContain('paint.pen');
    expect(keys).toContain('tab.view');
    expect(keys).toContain('help.toggleCheatSheet');
    expect(keys).toContain('audio.toggleMute');
    expect(keys).toContain('layout.default');
  });

  it('every value in the record is a function', () => {
    for (const [, handler] of Object.entries(handlers)) {
      expect(typeof handler).toBe('function');
    }
  });

  // -- Playback ----------------------------------------------------------

  it('playback.toggle calls session.togglePlayback', () => {
    handlers['playback.toggle']!();
    expect(deps.session.togglePlayback).toHaveBeenCalledOnce();
  });

  it('playback.stepForward calls session.stepForward', () => {
    handlers['playback.stepForward']!();
    expect(deps.session.stepForward).toHaveBeenCalledOnce();
  });

  it('playback.stepBackward calls session.stepBackward', () => {
    handlers['playback.stepBackward']!();
    expect(deps.session.stepBackward).toHaveBeenCalledOnce();
  });

  it('playback.stop calls session.pause', () => {
    handlers['playback.stop']!();
    expect(deps.session.pause).toHaveBeenCalledOnce();
  });

  it('playback.slower calls session.decreaseSpeed', () => {
    handlers['playback.slower']!();
    expect(deps.session.decreaseSpeed).toHaveBeenCalledOnce();
  });

  // -- Navigation: goToStart / goToEnd -----------------------------------

  it('playback.goToStart calls session.goToStart when playlist is disabled', () => {
    deps.controls.playlistManager.isEnabled.mockReturnValue(false);
    handlers['playback.goToStart']!();
    expect(deps.session.goToStart).toHaveBeenCalledOnce();
    expect(deps.frameNavigation.goToPlaylistStart).not.toHaveBeenCalled();
  });

  it('playback.goToStart delegates to frameNavigation when playlist is enabled', () => {
    deps.controls.playlistManager.isEnabled.mockReturnValue(true);
    handlers['playback.goToStart']!();
    expect(deps.frameNavigation.goToPlaylistStart).toHaveBeenCalledOnce();
    expect(deps.session.goToStart).not.toHaveBeenCalled();
  });

  it('playback.goToEnd calls session.goToEnd when playlist is disabled', () => {
    deps.controls.playlistManager.isEnabled.mockReturnValue(false);
    handlers['playback.goToEnd']!();
    expect(deps.session.goToEnd).toHaveBeenCalledOnce();
  });

  it('playback.goToEnd delegates to frameNavigation when playlist is enabled', () => {
    deps.controls.playlistManager.isEnabled.mockReturnValue(true);
    handlers['playback.goToEnd']!();
    expect(deps.frameNavigation.goToPlaylistEnd).toHaveBeenCalledOnce();
    expect(deps.session.goToEnd).not.toHaveBeenCalled();
  });

  // -- Context-sensitive: L key (playback.faster) -------------------------

  it('playback.faster calls session.increaseSpeed in global context', () => {
    (deps.activeContextManager.isContextActive as ReturnType<typeof vi.fn>).mockReturnValue(false);
    handlers['playback.faster']!();
    expect(deps.session.increaseSpeed).toHaveBeenCalledOnce();
    expect(deps.controls.paintToolbar.handleKeyboard).not.toHaveBeenCalled();
  });

  it('playback.faster delegates to paintToolbar when paint context is active (L key)', () => {
    (deps.activeContextManager.isContextActive as ReturnType<typeof vi.fn>).mockReturnValue(true);
    handlers['playback.faster']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('l');
    expect(deps.session.increaseSpeed).not.toHaveBeenCalled();
  });

  // -- Context-sensitive: O key (timeline.setOutPoint) --------------------

  it('timeline.setOutPoint calls session.setOutPoint in global context', () => {
    (deps.activeContextManager.isContextActive as ReturnType<typeof vi.fn>).mockReturnValue(false);
    handlers['timeline.setOutPoint']!();
    expect(deps.session.setOutPoint).toHaveBeenCalledOnce();
  });

  it('timeline.setOutPoint delegates to paintToolbar when paint context is active (O key)', () => {
    (deps.activeContextManager.isContextActive as ReturnType<typeof vi.fn>).mockReturnValue(true);
    handlers['timeline.setOutPoint']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('o');
    expect(deps.session.setOutPoint).not.toHaveBeenCalled();
  });

  // -- Context-sensitive: R key (timeline.resetInOut) ---------------------

  it('timeline.resetInOut calls session.resetInOutPoints in global context', () => {
    (deps.activeContextManager.isContextActive as ReturnType<typeof vi.fn>).mockReturnValue(false);
    handlers['timeline.resetInOut']!();
    expect(deps.session.resetInOutPoints).toHaveBeenCalledOnce();
  });

  it('timeline.resetInOut delegates to paintToolbar when paint context is active (R key)', () => {
    (deps.activeContextManager.isContextActive as ReturnType<typeof vi.fn>).mockReturnValue(true);
    handlers['timeline.resetInOut']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('r');
    expect(deps.session.resetInOutPoints).not.toHaveBeenCalled();
  });

  // -- Channel switching -------------------------------------------------

  it('channel.red calls channelSelect.handleKeyboard with R', () => {
    handlers['channel.red']!();
    expect(deps.controls.channelSelect.handleKeyboard).toHaveBeenCalledWith('R', true);
  });

  it('channel.green calls channelSelect.handleKeyboard with G', () => {
    handlers['channel.green']!();
    expect(deps.controls.channelSelect.handleKeyboard).toHaveBeenCalledWith('G', true);
  });

  it('channel.blue calls channelSelect.handleKeyboard with B', () => {
    handlers['channel.blue']!();
    expect(deps.controls.channelSelect.handleKeyboard).toHaveBeenCalledWith('B', true);
  });

  it('channel.alpha calls channelSelect.handleKeyboard with A', () => {
    handlers['channel.alpha']!();
    expect(deps.controls.channelSelect.handleKeyboard).toHaveBeenCalledWith('A', true);
  });

  it('channel.luminance toggles LUT pipeline panel when on color tab', () => {
    deps.tabBar.activeTab = 'color';
    // Rebuild handlers so the closure captures the updated tab
    handlers = buildActionHandlers(deps);
    handlers['channel.luminance']!();
    expect(deps.controls.lutPipelinePanel.toggle).toHaveBeenCalledOnce();
    expect(deps.controls.channelSelect.handleKeyboard).not.toHaveBeenCalled();
  });

  it('channel.luminance calls channelSelect.handleKeyboard when not on color tab', () => {
    deps.tabBar.activeTab = 'view';
    handlers['channel.luminance']!();
    expect(deps.controls.channelSelect.handleKeyboard).toHaveBeenCalledWith('L', true);
    expect(deps.controls.lutPipelinePanel.toggle).not.toHaveBeenCalled();
  });

  // -- View modes --------------------------------------------------------

  it('view.fitToWindow calls viewer.smoothFitToWindow', () => {
    handlers['view.fitToWindow']!();
    expect(deps.viewer.smoothFitToWindow).toHaveBeenCalledOnce();
  });

  it('view.zoom50 calls viewer.smoothSetZoom(0.5) when on view tab', () => {
    deps.tabBar.activeTab = 'view';
    handlers['view.zoom50']!();
    expect(deps.viewer.smoothSetZoom).toHaveBeenCalledWith(0.5);
  });

  it('view.zoom50 does nothing when not on view tab', () => {
    deps.tabBar.activeTab = 'color';
    handlers = buildActionHandlers(deps);
    handlers['view.zoom50']!();
    expect(deps.viewer.smoothSetZoom).not.toHaveBeenCalled();
  });

  it('view.toggleZebraStripes toggles stripes and refreshes viewer', () => {
    const mockToggle = vi.fn();
    deps.viewer.getZebraStripes.mockReturnValue({ toggle: mockToggle });
    handlers['view.toggleZebraStripes']!();
    expect(mockToggle).toHaveBeenCalledOnce();
    expect(deps.viewer.refresh).toHaveBeenCalledOnce();
  });

  // -- Fullscreen --------------------------------------------------------

  it('view.toggleFullscreen calls fullscreenManager.toggle', () => {
    handlers['view.toggleFullscreen']!();
    expect(deps.fullscreenManager!.toggle).toHaveBeenCalledOnce();
  });

  it('view.toggleFullscreen is safe when fullscreenManager is null', () => {
    deps.fullscreenManager = null;
    handlers = buildActionHandlers(deps);
    // Should not throw
    expect(() => handlers['view.toggleFullscreen']!()).not.toThrow();
  });

  // -- Help / cheat sheet ------------------------------------------------

  it('help.toggleCheatSheet calls shortcutCheatSheet.toggle', () => {
    handlers['help.toggleCheatSheet']!();
    expect(deps.shortcutCheatSheet!.toggle).toHaveBeenCalledOnce();
  });

  // -- Panel close (ESC cascade) -----------------------------------------

  it('panel.close hides cheat sheet first if visible', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(true);
    handlers['panel.close']!();
    expect(deps.shortcutCheatSheet!.hide).toHaveBeenCalledOnce();
    // Should not continue to close other panels
    expect(deps.controls.colorControls.hide).not.toHaveBeenCalled();
  });

  it('panel.close toggles presentation mode if cheat sheet is hidden but presentation is active', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: true });
    handlers['panel.close']!();
    expect(deps.controls.presentationMode.toggle).toHaveBeenCalledOnce();
    // Should not continue to close other panels
    expect(deps.controls.colorControls.hide).not.toHaveBeenCalled();
  });

  it('panel.close closes all transient panels when no sheet or presentation', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    handlers['panel.close']!();
    expect(deps.controls.colorControls.hide).toHaveBeenCalledOnce();
    expect(deps.controls.cropControl.hidePanel).toHaveBeenCalledOnce();
  });

  it('panel.close closes filterControl when isOpen is true', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.filterControl.isOpen = true;
    handlers['panel.close']!();
    expect(deps.controls.filterControl.hide).toHaveBeenCalledOnce();
  });

  it('panel.close does not call filterControl.hide when isOpen is false', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.filterControl.isOpen = false;
    handlers['panel.close']!();
    expect(deps.controls.filterControl.hide).not.toHaveBeenCalled();
  });

  it('panel.close closes cropControl.hidePanel in the cascade', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    handlers['panel.close']!();
    expect(deps.controls.cropControl.hidePanel).toHaveBeenCalledOnce();
  });

  it('panel.close closes lutPipelinePanel when visible', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.lutPipelinePanel.getIsVisible.mockReturnValue(true);
    handlers['panel.close']!();
    expect(deps.controls.lutPipelinePanel.hide).toHaveBeenCalledOnce();
  });

  it('panel.close does not call lutPipelinePanel.hide when not visible', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.lutPipelinePanel.getIsVisible.mockReturnValue(false);
    handlers['panel.close']!();
    expect(deps.controls.lutPipelinePanel.hide).not.toHaveBeenCalled();
  });

  // -- Loop mode cycling -------------------------------------------------

  it('timeline.cycleLoopMode cycles from once to loop', () => {
    deps.session.loopMode = 'once';
    handlers['timeline.cycleLoopMode']!();
    expect(deps.session.loopMode).toBe('loop');
  });

  it('timeline.cycleLoopMode cycles from loop to pingpong', () => {
    deps.session.loopMode = 'loop';
    handlers['timeline.cycleLoopMode']!();
    expect(deps.session.loopMode).toBe('pingpong');
  });

  it('timeline.cycleLoopMode cycles from pingpong back to once', () => {
    deps.session.loopMode = 'pingpong';
    handlers['timeline.cycleLoopMode']!();
    expect(deps.session.loopMode).toBe('once');
  });

  // -- Notes navigation --------------------------------------------------

  it('notes.next navigates to next note frame', () => {
    deps.session.noteManager.getNextNoteFrame.mockReturnValue(20);
    deps.session.currentFrame = 10;
    handlers['notes.next']!();
    expect(deps.session.goToFrame).toHaveBeenCalledWith(20);
  });

  it('notes.next does not navigate when already at that frame', () => {
    deps.session.noteManager.getNextNoteFrame.mockReturnValue(10);
    deps.session.currentFrame = 10;
    handlers['notes.next']!();
    expect(deps.session.goToFrame).not.toHaveBeenCalled();
  });

  it('notes.previous navigates to previous note frame', () => {
    deps.session.noteManager.getPreviousNoteFrame.mockReturnValue(5);
    deps.session.currentFrame = 10;
    handlers['notes.previous']!();
    expect(deps.session.goToFrame).toHaveBeenCalledWith(5);
  });

  // -- Layout presets ----------------------------------------------------

  it('layout.default applies the default preset', () => {
    handlers['layout.default']!();
    expect(deps.layoutStore.applyPreset).toHaveBeenCalledWith('default');
  });

  it('layout.review applies the review preset', () => {
    handlers['layout.review']!();
    expect(deps.layoutStore.applyPreset).toHaveBeenCalledWith('review');
  });

  // -- Theme cycling -----------------------------------------------------

  it('theme.cycle calls getThemeManager().cycleMode()', () => {
    handlers['theme.cycle']!();
    expect(mockThemeManager.cycleMode).toHaveBeenCalledOnce();
  });

  // -- Export ------------------------------------------------------------

  it('export.quickExport calls headerBar.getExportControl().quickExport with png', () => {
    const mockQuickExport = vi.fn();
    (deps.headerBar.getExportControl as ReturnType<typeof vi.fn>).mockReturnValue({ quickExport: mockQuickExport });
    handlers['export.quickExport']!();
    expect(mockQuickExport).toHaveBeenCalledWith('png');
  });

  it('export.copyFrame calls viewer.copyFrameToClipboard with true', () => {
    handlers['export.copyFrame']!();
    expect(deps.viewer.copyFrameToClipboard).toHaveBeenCalledWith(true);
  });

  // -- Undo/Redo ---------------------------------------------------------

  it('edit.undo calls paintEngine.undo', () => {
    handlers['edit.undo']!();
    expect(deps.paintEngine.undo).toHaveBeenCalledOnce();
  });

  it('edit.redo calls paintEngine.redo', () => {
    handlers['edit.redo']!();
    expect(deps.paintEngine.redo).toHaveBeenCalledOnce();
  });

  // -- Network -----------------------------------------------------------

  it('network.disconnect calls leaveRoom when connected', () => {
    deps.controls.networkSyncManager.isConnected = true;
    handlers['network.disconnect']!();
    expect(deps.controls.networkSyncManager.leaveRoom).toHaveBeenCalledOnce();
  });

  it('network.disconnect does nothing when not connected', () => {
    deps.controls.networkSyncManager.isConnected = false;
    handlers['network.disconnect']!();
    expect(deps.controls.networkSyncManager.leaveRoom).not.toHaveBeenCalled();
  });

  // -- Focus zones -------------------------------------------------------

  it('focus.nextZone calls focusManager.focusNextZone', () => {
    handlers['focus.nextZone']!();
    expect(deps.focusManager!.focusNextZone).toHaveBeenCalledOnce();
  });

  it('focus.previousZone calls focusManager.focusPreviousZone', () => {
    handlers['focus.previousZone']!();
    expect(deps.focusManager!.focusPreviousZone).toHaveBeenCalledOnce();
  });

  // -- View info panel ---------------------------------------------------

  it('view.toggleInfoPanel calls sessionBridge.updateInfoPanel when panel becomes enabled', () => {
    deps.controls.infoPanel.isEnabled.mockReturnValue(true);
    handlers['view.toggleInfoPanel']!();
    expect(deps.controls.infoPanel.toggle).toHaveBeenCalledOnce();
    expect(deps.sessionBridge.updateInfoPanel).toHaveBeenCalledOnce();
  });

  it('view.toggleInfoPanel does not call updateInfoPanel when panel is disabled', () => {
    deps.controls.infoPanel.isEnabled.mockReturnValue(false);
    handlers['view.toggleInfoPanel']!();
    expect(deps.controls.infoPanel.toggle).toHaveBeenCalledOnce();
    expect(deps.sessionBridge.updateInfoPanel).not.toHaveBeenCalled();
  });

  // -- Capture reference -------------------------------------------------

  it('view.captureReference captures and enables reference when image data exists', () => {
    handlers['view.captureReference']!();
    expect(deps.viewer.getImageData).toHaveBeenCalledOnce();
    expect(deps.controls.referenceManager.captureReference).toHaveBeenCalledOnce();
    expect(deps.controls.referenceManager.enable).toHaveBeenCalledOnce();
  });

  it('view.captureReference does nothing when no image data', () => {
    deps.viewer.getImageData.mockReturnValue(null);
    handlers = buildActionHandlers(deps);
    handlers['view.captureReference']!();
    expect(deps.controls.referenceManager.captureReference).not.toHaveBeenCalled();
  });

  // -- Audio -------------------------------------------------------------

  it('audio.toggleMute calls session.toggleMute', () => {
    handlers['audio.toggleMute']!();
    expect(deps.session.toggleMute).toHaveBeenCalledOnce();
  });

  // -- Tabs --------------------------------------------------------------

  it('tab.view sets active tab to view', () => {
    handlers['tab.view']!();
    expect(deps.tabBar.setActiveTab).toHaveBeenCalledWith('view');
  });

  it('tab.annotate sets active tab to annotate', () => {
    handlers['tab.annotate']!();
    expect(deps.tabBar.setActiveTab).toHaveBeenCalledWith('annotate');
  });

  // -- External presentation ---------------------------------------------

  it('view.openPresentationWindow calls externalPresentation.openWindow', () => {
    handlers['view.openPresentationWindow']!();
    expect(deps.externalPresentation.openWindow).toHaveBeenCalledOnce();
  });

  // -- Snapshot ----------------------------------------------------------

  it('snapshot.create calls persistenceManager.createQuickSnapshot', () => {
    handlers['snapshot.create']!();
    expect(deps.persistenceManager.createQuickSnapshot).toHaveBeenCalledOnce();
  });

  // -- Paint tools (direct, no context guard) ----------------------------

  it('paint.pen delegates to paintToolbar with p', () => {
    handlers['paint.pen']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('p');
  });

  it('paint.eraser delegates to paintToolbar with e', () => {
    handlers['paint.eraser']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('e');
  });
});
