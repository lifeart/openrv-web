import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildActionHandlers, type KeyboardActionDeps } from './KeyboardActionMap';

// ---------------------------------------------------------------------------
// Mock getThemeManager (module-level singleton)
// ---------------------------------------------------------------------------

const mockThemeManager = { cycleMode: vi.fn() };
vi.mock('../utils/ui/ThemeManager', () => ({
  getThemeManager: () => mockThemeManager,
}));

const mockHistoryManager = {
  canUndo: vi.fn().mockReturnValue(false),
  canRedo: vi.fn().mockReturnValue(false),
  undo: vi.fn(),
  redo: vi.fn(),
  recordAction: vi.fn(),
};
vi.mock('../utils/HistoryManager', () => ({
  getGlobalHistoryManager: () => mockHistoryManager,
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
    togglePlaybackMode: vi.fn(),
    noteManager: {
      getNextNoteFrame: vi.fn().mockReturnValue(20),
      getPreviousNoteFrame: vi.fn().mockReturnValue(5),
    },
  };
}

function createMockViewer() {
  return {
    smoothFitToWindow: vi.fn(),
    smoothFitToWidth: vi.fn(),
    smoothFitToHeight: vi.fn(),
    smoothSetZoom: vi.fn(),
    smoothSetPixelRatio: vi.fn(),
    refresh: vi.fn(),
    copyFrameToClipboard: vi.fn(),
    getPixelProbe: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getFalseColor: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getTimecodeOverlay: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getInfoStripOverlay: vi.fn().mockReturnValue({ toggle: vi.fn(), togglePathMode: vi.fn() }),
    getFPSIndicator: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getZebraStripes: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getColorWheels: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getSpotlightOverlay: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getHSLQualifier: vi.fn().mockReturnValue({ toggle: vi.fn() }),
    getLuminanceVisualization: vi.fn().mockReturnValue({ cycleMode: vi.fn() }),
    getImageData: vi.fn().mockReturnValue({ width: 100, height: 100, data: new Uint8ClampedArray(100 * 100 * 4) }),
    toggleFilterMode: vi.fn(),
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
      setRotation: vi.fn(),
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
    timelineMagnifier: { toggle: vi.fn() },
    gotoFrameOverlay: { show: vi.fn() },
  };
}

function createMockDeps(): KeyboardActionDeps & {
  session: ReturnType<typeof createMockSession>;
  viewer: ReturnType<typeof createMockViewer>;
  controls: ReturnType<typeof createMockControls>;
} {
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
    headerBar: { getExportControl: vi.fn().mockReturnValue({ quickExport: vi.fn() }), navigateVersion: vi.fn() },
    frameNavigation: {
      goToNextAnnotation: vi.fn(),
      goToPreviousAnnotation: vi.fn(),
      goToPlaylistStart: vi.fn(),
      goToPlaylistEnd: vi.fn(),
      goToNextMarkOrBoundary: vi.fn(),
      goToPreviousMarkOrBoundary: vi.fn(),
      goToNextShot: vi.fn(),
      goToPreviousShot: vi.fn(),
      shiftRangeToNext: vi.fn().mockReturnValue(null),
      shiftRangeToPrevious: vi.fn().mockReturnValue(null),
    },
    ariaAnnouncer: { announce: vi.fn() },
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
    mockHistoryManager.canUndo.mockReturnValue(false);
    mockHistoryManager.canRedo.mockReturnValue(false);
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

  it('channel.luminance always calls channelSelect.handleKeyboard with L', () => {
    handlers['channel.luminance']!();
    expect(deps.controls.channelSelect.handleKeyboard).toHaveBeenCalledWith('L', true);
  });

  it('channel.luminance selects luminance even on color tab (no LUT toggle)', () => {
    deps.tabBar.activeTab = 'color';
    handlers = buildActionHandlers(deps);
    handlers['channel.luminance']!();
    expect(deps.controls.channelSelect.handleKeyboard).toHaveBeenCalledWith('L', true);
    expect(deps.controls.lutPipelinePanel.toggle).not.toHaveBeenCalled();
  });

  it('lut.togglePanel toggles the LUT pipeline panel', () => {
    handlers['lut.togglePanel']!();
    expect(deps.controls.lutPipelinePanel.toggle).toHaveBeenCalledOnce();
  });

  // -- View modes --------------------------------------------------------

  it('view.fitToWindow calls viewer.smoothFitToWindow', () => {
    handlers['view.fitToWindow']!();
    expect(deps.viewer.smoothFitToWindow).toHaveBeenCalledOnce();
  });

  it('view.fitToWidth calls viewer.smoothFitToWidth', () => {
    handlers['view.fitToWidth']!();
    expect(deps.viewer.smoothFitToWidth).toHaveBeenCalledOnce();
  });

  it('view.fitToHeight calls viewer.smoothFitToHeight', () => {
    handlers['view.fitToHeight']!();
    expect(deps.viewer.smoothFitToHeight).toHaveBeenCalledOnce();
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

  it('edit.undo calls paintEngine.undo when history is empty', () => {
    mockHistoryManager.canUndo.mockReturnValue(false);
    handlers['edit.undo']!();
    expect(deps.paintEngine.undo).toHaveBeenCalledOnce();
  });

  it('edit.undo calls historyManager.undo when history has undoable items', () => {
    mockHistoryManager.canUndo.mockReturnValue(true);
    handlers['edit.undo']!();
    expect(mockHistoryManager.undo).toHaveBeenCalledOnce();
    expect(deps.paintEngine.undo).not.toHaveBeenCalled();
  });

  it('edit.redo calls paintEngine.redo when history is empty', () => {
    mockHistoryManager.canRedo.mockReturnValue(false);
    handlers['edit.redo']!();
    expect(deps.paintEngine.redo).toHaveBeenCalledOnce();
  });

  it('edit.redo calls historyManager.redo when history has redoable items', () => {
    mockHistoryManager.canRedo.mockReturnValue(true);
    handlers['edit.redo']!();
    expect(mockHistoryManager.redo).toHaveBeenCalledOnce();
    expect(deps.paintEngine.redo).not.toHaveBeenCalled();
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

  it('paint.pan delegates to paintToolbar with v', () => {
    handlers['paint.pan']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('v');
  });

  it('paint.text delegates to paintToolbar with t', () => {
    handlers['paint.text']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('t');
  });

  it('paint.rectangle delegates to paintToolbar with r', () => {
    handlers['paint.rectangle']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('r');
  });

  it('paint.ellipse delegates to paintToolbar with o', () => {
    handlers['paint.ellipse']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('o');
  });

  it('paint.line delegates to paintToolbar with l', () => {
    handlers['paint.line']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('l');
  });

  it('paint.arrow delegates to paintToolbar with a', () => {
    handlers['paint.arrow']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('a');
  });

  it('paint.toggleBrush delegates to paintToolbar with b', () => {
    handlers['paint.toggleBrush']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('b');
  });

  it('paint.toggleGhost delegates to paintToolbar with g', () => {
    handlers['paint.toggleGhost']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('g');
  });

  it('paint.toggleHold delegates to paintToolbar with x', () => {
    handlers['paint.toggleHold']!();
    expect(deps.controls.paintToolbar.handleKeyboard).toHaveBeenCalledWith('x');
  });

  // =================================================================
  // Playback mode
  // =================================================================

  it('KAM-PAF-001: playback.togglePlaybackMode calls session.togglePlaybackMode()', () => {
    handlers['playback.togglePlaybackMode']!();
    expect(deps.session.togglePlaybackMode).toHaveBeenCalledTimes(1);
  });

  // =================================================================
  // Transform: reset rotation (Ctrl+0)
  // =================================================================

  it('KAM-TRR-001: transform.resetRotation handler is registered', () => {
    expect(handlers['transform.resetRotation']).toBeDefined();
    expect(typeof handlers['transform.resetRotation']).toBe('function');
  });

  it('KAM-TRR-002: transform.resetRotation calls transformControl.setRotation(0)', () => {
    handlers['transform.resetRotation']!();
    expect(deps.controls.transformControl.setRotation).toHaveBeenCalledWith(0);
  });

  it('KAM-TRR-003: transform.resetRotation calls setRotation exactly once', () => {
    handlers['transform.resetRotation']!();
    expect(deps.controls.transformControl.setRotation).toHaveBeenCalledTimes(1);
  });

  // -- Scale presets (magnification) -------------------------------------

  it('includes all magnification scale preset handlers', () => {
    const keys = Object.keys(handlers);
    expect(keys).toContain('view.zoom1to1');
    expect(keys).toContain('view.zoom2to1');
    expect(keys).toContain('view.zoom3to1');
    expect(keys).toContain('view.zoom4to1');
    expect(keys).toContain('view.zoom5to1');
    expect(keys).toContain('view.zoom6to1');
    expect(keys).toContain('view.zoom7to1');
    expect(keys).toContain('view.zoom8to1');
  });

  it('view.zoom1to1 calls viewer.smoothSetPixelRatio(1)', () => {
    handlers['view.zoom1to1']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(1);
  });

  it('view.zoom2to1 calls viewer.smoothSetPixelRatio(2)', () => {
    handlers['view.zoom2to1']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(2);
  });

  it('view.zoom3to1 calls viewer.smoothSetPixelRatio(3)', () => {
    handlers['view.zoom3to1']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(3);
  });

  it('view.zoom4to1 calls viewer.smoothSetPixelRatio(4)', () => {
    handlers['view.zoom4to1']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(4);
  });

  it('view.zoom5to1 calls viewer.smoothSetPixelRatio(5)', () => {
    handlers['view.zoom5to1']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(5);
  });

  it('view.zoom6to1 calls viewer.smoothSetPixelRatio(6)', () => {
    handlers['view.zoom6to1']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(6);
  });

  it('view.zoom7to1 calls viewer.smoothSetPixelRatio(7)', () => {
    handlers['view.zoom7to1']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(7);
  });

  it('view.zoom8to1 calls viewer.smoothSetPixelRatio(8)', () => {
    handlers['view.zoom8to1']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(8);
  });

  // -- Scale presets (reduction) -----------------------------------------

  it('includes all reduction scale preset handlers', () => {
    const keys = Object.keys(handlers);
    expect(keys).toContain('view.zoom1to2');
    expect(keys).toContain('view.zoom1to3');
    expect(keys).toContain('view.zoom1to4');
    expect(keys).toContain('view.zoom1to5');
    expect(keys).toContain('view.zoom1to6');
    expect(keys).toContain('view.zoom1to7');
    expect(keys).toContain('view.zoom1to8');
  });

  it('view.zoom1to2 calls viewer.smoothSetPixelRatio(0.5)', () => {
    handlers['view.zoom1to2']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(0.5);
  });

  it('view.zoom1to3 calls viewer.smoothSetPixelRatio(1/3)', () => {
    handlers['view.zoom1to3']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(1 / 3);
  });

  it('view.zoom1to4 calls viewer.smoothSetPixelRatio(0.25)', () => {
    handlers['view.zoom1to4']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(0.25);
  });

  it('view.zoom1to5 calls viewer.smoothSetPixelRatio(0.2)', () => {
    handlers['view.zoom1to5']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(0.2);
  });

  it('view.zoom1to6 calls viewer.smoothSetPixelRatio(1/6)', () => {
    handlers['view.zoom1to6']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(1 / 6);
  });

  it('view.zoom1to7 calls viewer.smoothSetPixelRatio(1/7)', () => {
    handlers['view.zoom1to7']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(1 / 7);
  });

  it('view.zoom1to8 calls viewer.smoothSetPixelRatio(0.125)', () => {
    handlers['view.zoom1to8']!();
    expect(deps.viewer.smoothSetPixelRatio).toHaveBeenCalledWith(0.125);
  });

  // -- Playback direction ------------------------------------------------

  it('playback.toggleDirection calls session.togglePlayDirection', () => {
    handlers['playback.toggleDirection']!();
    expect(deps.session.togglePlayDirection).toHaveBeenCalledOnce();
  });

  // -- Timeline (alt setters, mark/shot navigation) ----------------------

  it('timeline.setInPoint calls session.setInPoint', () => {
    handlers['timeline.setInPoint']!();
    expect(deps.session.setInPoint).toHaveBeenCalledOnce();
  });

  it('timeline.setInPointAlt calls session.setInPoint', () => {
    handlers['timeline.setInPointAlt']!();
    expect(deps.session.setInPoint).toHaveBeenCalledOnce();
  });

  it('timeline.setOutPointAlt calls session.setOutPoint', () => {
    handlers['timeline.setOutPointAlt']!();
    expect(deps.session.setOutPoint).toHaveBeenCalledOnce();
  });

  it('timeline.toggleMark calls session.toggleMark', () => {
    handlers['timeline.toggleMark']!();
    expect(deps.session.toggleMark).toHaveBeenCalledOnce();
  });

  it('timeline.nextMarkOrBoundary calls frameNavigation', () => {
    handlers['timeline.nextMarkOrBoundary']!();
    expect(deps.frameNavigation.goToNextMarkOrBoundary).toHaveBeenCalledOnce();
  });

  it('timeline.previousMarkOrBoundary calls frameNavigation', () => {
    handlers['timeline.previousMarkOrBoundary']!();
    expect(deps.frameNavigation.goToPreviousMarkOrBoundary).toHaveBeenCalledOnce();
  });

  it('timeline.nextShot calls frameNavigation.goToNextShot', () => {
    handlers['timeline.nextShot']!();
    expect(deps.frameNavigation.goToNextShot).toHaveBeenCalledOnce();
  });

  it('timeline.previousShot calls frameNavigation.goToPreviousShot', () => {
    handlers['timeline.previousShot']!();
    expect(deps.frameNavigation.goToPreviousShot).toHaveBeenCalledOnce();
  });

  it('timeline.toggleMagnifier calls controls.timelineMagnifier.toggle', () => {
    handlers['timeline.toggleMagnifier']!();
    expect(deps.controls.timelineMagnifier.toggle).toHaveBeenCalledOnce();
  });

  // -- Timeline shift range ----------------------------------------------

  it('timeline.shiftRangeNext calls shiftRangeToNext', () => {
    handlers['timeline.shiftRangeNext']!();
    expect(deps.frameNavigation.shiftRangeToNext).toHaveBeenCalledOnce();
  });

  it('timeline.shiftRangeNext announces when result is non-null', () => {
    (deps.frameNavigation.shiftRangeToNext as ReturnType<typeof vi.fn>).mockReturnValue({ inPoint: 10, outPoint: 20 });
    handlers['timeline.shiftRangeNext']!();
    expect(deps.ariaAnnouncer!.announce).toHaveBeenCalledWith('Range shifted to frames 10 - 20');
  });

  it('timeline.shiftRangePrevious calls shiftRangeToPrevious', () => {
    handlers['timeline.shiftRangePrevious']!();
    expect(deps.frameNavigation.shiftRangeToPrevious).toHaveBeenCalledOnce();
  });

  it('timeline.shiftRangePrevious announces when result is non-null', () => {
    (deps.frameNavigation.shiftRangeToPrevious as ReturnType<typeof vi.fn>).mockReturnValue({
      inPoint: 5,
      outPoint: 15,
    });
    handlers['timeline.shiftRangePrevious']!();
    expect(deps.ariaAnnouncer!.announce).toHaveBeenCalledWith('Range shifted to frames 5 - 15');
  });

  it('timeline.shiftRangeNextAlt calls shiftRangeToNext', () => {
    handlers['timeline.shiftRangeNextAlt']!();
    expect(deps.frameNavigation.shiftRangeToNext).toHaveBeenCalledOnce();
  });

  it('timeline.shiftRangePreviousAlt calls shiftRangeToPrevious', () => {
    handlers['timeline.shiftRangePreviousAlt']!();
    expect(deps.frameNavigation.shiftRangeToPrevious).toHaveBeenCalledOnce();
  });

  // -- View (uncovered one-liners) ----------------------------------------

  it('view.fitToWindowAlt calls viewer.smoothFitToWindow', () => {
    handlers['view.fitToWindowAlt']!();
    expect(deps.viewer.smoothFitToWindow).toHaveBeenCalledOnce();
  });

  it('view.cycleWipeMode calls compareControl.cycleWipeMode', () => {
    handlers['view.cycleWipeMode']!();
    expect(deps.controls.compareControl.cycleWipeMode).toHaveBeenCalledOnce();
  });

  it('view.toggleWaveform calls scopesControl.toggleScope waveform', () => {
    handlers['view.toggleWaveform']!();
    expect(deps.controls.scopesControl.toggleScope).toHaveBeenCalledWith('waveform');
  });

  it('view.toggleAB calls session.toggleAB', () => {
    handlers['view.toggleAB']!();
    expect(deps.session.toggleAB).toHaveBeenCalledOnce();
  });

  it('view.toggleABAlt calls session.toggleAB', () => {
    handlers['view.toggleABAlt']!();
    expect(deps.session.toggleAB).toHaveBeenCalledOnce();
  });

  it('view.toggleDifferenceMatte calls compareControl', () => {
    handlers['view.toggleDifferenceMatte']!();
    expect(deps.controls.compareControl.toggleDifferenceMatte).toHaveBeenCalledOnce();
  });

  it('view.toggleSplitScreen calls compareControl', () => {
    handlers['view.toggleSplitScreen']!();
    expect(deps.controls.compareControl.toggleSplitScreen).toHaveBeenCalledOnce();
  });

  it('view.toggleGhostFrames calls ghostFrameControl.toggle', () => {
    handlers['view.toggleGhostFrames']!();
    expect(deps.controls.ghostFrameControl.toggle).toHaveBeenCalledOnce();
  });

  it('view.togglePAR calls parControl.toggle', () => {
    handlers['view.togglePAR']!();
    expect(deps.controls.parControl.toggle).toHaveBeenCalledOnce();
  });

  it('view.cycleBackgroundPattern calls backgroundPatternControl.cyclePattern', () => {
    handlers['view.cycleBackgroundPattern']!();
    expect(deps.controls.backgroundPatternControl.cyclePattern).toHaveBeenCalledOnce();
  });

  it('view.toggleCheckerboard calls backgroundPatternControl.toggleCheckerboard', () => {
    handlers['view.toggleCheckerboard']!();
    expect(deps.controls.backgroundPatternControl.toggleCheckerboard).toHaveBeenCalledOnce();
  });

  it('view.toggleGuides calls safeAreasControl.getOverlay().toggle', () => {
    handlers['view.toggleGuides']!();
    expect(deps.controls.safeAreasControl.getOverlay).toHaveBeenCalled();
  });

  it('view.togglePixelProbe calls viewer.getPixelProbe().toggle', () => {
    handlers['view.togglePixelProbe']!();
    expect(deps.viewer.getPixelProbe).toHaveBeenCalled();
  });

  it('view.toggleFalseColor calls viewer.getFalseColor().toggle', () => {
    handlers['view.toggleFalseColor']!();
    expect(deps.viewer.getFalseColor).toHaveBeenCalled();
  });

  it('view.toggleToneMapping calls toneMappingControl.toggle', () => {
    handlers['view.toggleToneMapping']!();
    expect(deps.controls.toneMappingControl.toggle).toHaveBeenCalledOnce();
  });

  it('view.toggleTimecodeOverlay calls viewer.getTimecodeOverlay().toggle', () => {
    handlers['view.toggleTimecodeOverlay']!();
    expect(deps.viewer.getTimecodeOverlay).toHaveBeenCalled();
  });

  it('view.toggleInfoStrip calls viewer.getInfoStripOverlay().toggle', () => {
    handlers['view.toggleInfoStrip']!();
    expect(deps.viewer.getInfoStripOverlay).toHaveBeenCalled();
  });

  it('view.toggleInfoStripPath calls viewer.getInfoStripOverlay().togglePathMode', () => {
    handlers['view.toggleInfoStripPath']!();
    expect(deps.viewer.getInfoStripOverlay).toHaveBeenCalled();
  });

  it('view.toggleFPSIndicator calls viewer.getFPSIndicator().toggle', () => {
    handlers['view.toggleFPSIndicator']!();
    expect(deps.viewer.getFPSIndicator).toHaveBeenCalled();
  });

  it('view.toggleSpotlight calls viewer.getSpotlightOverlay().toggle', () => {
    handlers['view.toggleSpotlight']!();
    expect(deps.viewer.getSpotlightOverlay).toHaveBeenCalled();
  });

  it('view.cycleLuminanceVis calls viewer.getLuminanceVisualization().cycleMode', () => {
    handlers['view.cycleLuminanceVis']!();
    expect(deps.viewer.getLuminanceVisualization).toHaveBeenCalled();
  });

  it('view.toggleReference calls referenceManager.toggle', () => {
    handlers['view.toggleReference']!();
    expect(deps.controls.referenceManager.toggle).toHaveBeenCalledOnce();
  });

  it('view.togglePresentation calls presentationMode.toggle', () => {
    handlers['view.togglePresentation']!();
    expect(deps.controls.presentationMode.toggle).toHaveBeenCalledOnce();
  });

  it('view.toggleFilterMode calls viewer.toggleFilterMode', () => {
    handlers['view.toggleFilterMode']!();
    expect(deps.viewer.toggleFilterMode).toHaveBeenCalledOnce();
  });

  // -- Panels (uncovered one-liners) -------------------------------------

  it('panel.color calls colorControls.toggle', () => {
    handlers['panel.color']!();
    expect(deps.controls.colorControls.toggle).toHaveBeenCalledOnce();
  });

  it('panel.effects calls filterControl.toggle', () => {
    handlers['panel.effects']!();
    expect(deps.controls.filterControl.toggle).toHaveBeenCalledOnce();
  });

  it('panel.curves calls curvesControl.toggle', () => {
    handlers['panel.curves']!();
    expect(deps.controls.curvesControl.toggle).toHaveBeenCalledOnce();
  });

  it('panel.crop calls cropControl.toggle', () => {
    handlers['panel.crop']!();
    expect(deps.controls.cropControl.toggle).toHaveBeenCalledOnce();
  });

  it('panel.waveform calls scopesControl.toggleScope waveform', () => {
    handlers['panel.waveform']!();
    expect(deps.controls.scopesControl.toggleScope).toHaveBeenCalledWith('waveform');
  });

  it('panel.vectorscope calls scopesControl.toggleScope vectorscope', () => {
    handlers['panel.vectorscope']!();
    expect(deps.controls.scopesControl.toggleScope).toHaveBeenCalledWith('vectorscope');
  });

  it('panel.gamutDiagram calls scopesControl.toggleScope gamutDiagram', () => {
    handlers['panel.gamutDiagram']!();
    expect(deps.controls.scopesControl.toggleScope).toHaveBeenCalledWith('gamutDiagram');
  });

  it('panel.histogram calls scopesControl.toggleScope histogram', () => {
    handlers['panel.histogram']!();
    expect(deps.controls.scopesControl.toggleScope).toHaveBeenCalledWith('histogram');
  });

  it('panel.ocio calls ocioControl.toggle', () => {
    handlers['panel.ocio']!();
    expect(deps.controls.ocioControl.toggle).toHaveBeenCalledOnce();
  });

  it('panel.history calls historyPanel.toggle', () => {
    handlers['panel.history']!();
    expect(deps.controls.historyPanel.toggle).toHaveBeenCalledOnce();
  });

  it('panel.markers calls markerListPanel.toggle', () => {
    handlers['panel.markers']!();
    expect(deps.controls.markerListPanel.toggle).toHaveBeenCalledOnce();
  });

  it('panel.snapshots calls snapshotPanel.toggle', () => {
    handlers['panel.snapshots']!();
    expect(deps.controls.snapshotPanel.toggle).toHaveBeenCalledOnce();
  });

  it('panel.playlist calls playlistPanel.toggle', () => {
    handlers['panel.playlist']!();
    expect(deps.controls.playlistPanel.toggle).toHaveBeenCalledOnce();
  });

  it('panel.notes calls notePanel.toggle', () => {
    handlers['panel.notes']!();
    expect(deps.controls.notePanel.toggle).toHaveBeenCalledOnce();
  });

  // -- panel.close additional branches -----------------------------------

  it('panel.close closes deinterlaceControl when isOpen is true', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.deinterlaceControl!.isOpen = true;
    handlers['panel.close']!();
    expect(deps.controls.deinterlaceControl!.hide).toHaveBeenCalledOnce();
  });

  it('panel.close closes filmEmulationControl when isOpen is true', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.filmEmulationControl!.isOpen = true;
    handlers['panel.close']!();
    expect(deps.controls.filmEmulationControl!.hide).toHaveBeenCalledOnce();
  });

  it('panel.close closes compareControl dropdown when visible', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.compareControl.isDropdownVisible.mockReturnValue(true);
    handlers['panel.close']!();
    expect(deps.controls.compareControl.close).toHaveBeenCalledOnce();
  });

  it('panel.close closes stereoEyeTransformControl when panel is visible', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.stereoEyeTransformControl.isPanelVisible.mockReturnValue(true);
    handlers['panel.close']!();
    expect(deps.controls.stereoEyeTransformControl.hidePanel).toHaveBeenCalledOnce();
  });

  it('panel.close closes displayProfileControl dropdown when visible', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.displayProfileControl.isDropdownVisible.mockReturnValue(true);
    handlers['panel.close']!();
    expect(deps.controls.displayProfileControl.closeDropdown).toHaveBeenCalledOnce();
  });

  it('panel.close closes notePanel when visible', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.notePanel.isVisible.mockReturnValue(true);
    handlers['panel.close']!();
    expect(deps.controls.notePanel.hide).toHaveBeenCalledOnce();
  });

  it('panel.close closes shotGridPanel when open', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.shotGridPanel.isOpen.mockReturnValue(true);
    handlers['panel.close']!();
    expect(deps.controls.shotGridPanel.hide).toHaveBeenCalledOnce();
  });

  it('panel.close closes noise reduction panel when visible', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.isNoiseReductionPanelVisible.mockReturnValue(true);
    handlers['panel.close']!();
    expect(deps.controls.hideNoiseReductionPanel).toHaveBeenCalledOnce();
  });

  it('panel.close closes watermark panel when visible', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.isWatermarkPanelVisible.mockReturnValue(true);
    handlers['panel.close']!();
    expect(deps.controls.hideWatermarkPanel).toHaveBeenCalledOnce();
  });

  it('panel.close closes timeline editor panel when visible', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.isTimelineEditorPanelVisible.mockReturnValue(true);
    handlers['panel.close']!();
    expect(deps.controls.hideTimelineEditorPanel).toHaveBeenCalledOnce();
  });

  it('panel.close closes slate editor panel when visible', () => {
    (deps.shortcutCheatSheet!.isVisible as ReturnType<typeof vi.fn>).mockReturnValue(false);
    deps.controls.presentationMode.getState.mockReturnValue({ enabled: false });
    deps.controls.isSlateEditorPanelVisible.mockReturnValue(true);
    handlers['panel.close']!();
    expect(deps.controls.hideSlateEditorPanel).toHaveBeenCalledOnce();
  });

  // -- Display -----------------------------------------------------------

  it('display.cycleProfile calls displayProfileControl.cycleProfile', () => {
    handlers['display.cycleProfile']!();
    expect(deps.controls.displayProfileControl.cycleProfile).toHaveBeenCalledOnce();
  });

  // -- Transform (uncovered) ---------------------------------------------

  it('transform.rotateLeft calls transformControl.rotateLeft', () => {
    handlers['transform.rotateLeft']!();
    expect(deps.controls.transformControl.rotateLeft).toHaveBeenCalledOnce();
  });

  it('transform.rotateRight calls transformControl.rotateRight', () => {
    handlers['transform.rotateRight']!();
    expect(deps.controls.transformControl.rotateRight).toHaveBeenCalledOnce();
  });

  it('transform.flipHorizontal calls transformControl.toggleFlipH', () => {
    handlers['transform.flipHorizontal']!();
    expect(deps.controls.transformControl.toggleFlipH).toHaveBeenCalledOnce();
  });

  it('transform.flipVertical calls transformControl.toggleFlipV', () => {
    handlers['transform.flipVertical']!();
    expect(deps.controls.transformControl.toggleFlipV).toHaveBeenCalledOnce();
  });

  // -- Edit/undo/redo with history manager --------------------------------

  it('edit.redo-alt calls paintEngine.redo when history has nothing', () => {
    handlers['edit.redo-alt']!();
    expect(deps.paintEngine.redo).toHaveBeenCalledOnce();
  });

  // -- Stereo -------------------------------------------------------------

  it('stereo.toggle calls stereoControl.handleKeyboard', () => {
    handlers['stereo.toggle']!();
    expect(deps.controls.stereoControl.handleKeyboard).toHaveBeenCalledWith('3', true);
  });

  it('stereo.eyeTransform calls stereoEyeTransformControl.handleKeyboard', () => {
    handlers['stereo.eyeTransform']!();
    expect(deps.controls.stereoEyeTransformControl.handleKeyboard).toHaveBeenCalledWith('E', true);
  });

  it('stereo.cycleAlign calls stereoAlignControl.handleKeyboard', () => {
    handlers['stereo.cycleAlign']!();
    expect(deps.controls.stereoAlignControl.handleKeyboard).toHaveBeenCalledWith('4', true);
  });

  // -- Color -------------------------------------------------------------

  it('color.toggleColorWheels calls viewer.getColorWheels().toggle', () => {
    handlers['color.toggleColorWheels']!();
    expect(deps.viewer.getColorWheels).toHaveBeenCalled();
  });

  it('color.toggleHSLQualifier calls viewer.getHSLQualifier().toggle', () => {
    handlers['color.toggleHSLQualifier']!();
    expect(deps.viewer.getHSLQualifier).toHaveBeenCalled();
  });

  it('color.toggleInversion calls colorInversionToggle.toggle', () => {
    handlers['color.toggleInversion']!();
    expect(deps.controls.colorInversionToggle.toggle).toHaveBeenCalledOnce();
  });

  // -- Notes add ----------------------------------------------------------

  it('notes.addNote calls notePanel.addNoteAtCurrentFrame', () => {
    handlers['notes.addNote']!();
    expect(deps.controls.notePanel.addNoteAtCurrentFrame).toHaveBeenCalledOnce();
  });

  // -- Navigation ---------------------------------------------------------

  it('navigation.gotoFrame calls gotoFrameOverlay.show', () => {
    handlers['navigation.gotoFrame']!();
    expect(deps.controls.gotoFrameOverlay.show).toHaveBeenCalledOnce();
  });

  // -- Annotations --------------------------------------------------------

  it('annotation.previous calls frameNavigation.goToPreviousAnnotation', () => {
    handlers['annotation.previous']!();
    expect(deps.frameNavigation.goToPreviousAnnotation).toHaveBeenCalledOnce();
  });

  it('annotation.next calls frameNavigation.goToNextAnnotation', () => {
    handlers['annotation.next']!();
    expect(deps.frameNavigation.goToNextAnnotation).toHaveBeenCalledOnce();
  });

  // -- Tabs (uncovered) ---------------------------------------------------

  it('tab.color sets active tab to color', () => {
    handlers['tab.color']!();
    expect(deps.tabBar.setActiveTab).toHaveBeenCalledWith('color');
  });

  it('tab.effects sets active tab to effects', () => {
    handlers['tab.effects']!();
    expect(deps.tabBar.setActiveTab).toHaveBeenCalledWith('effects');
  });

  it('tab.transform sets active tab to transform', () => {
    handlers['tab.transform']!();
    expect(deps.tabBar.setActiveTab).toHaveBeenCalledWith('transform');
  });

  it('tab.qc sets active tab to qc', () => {
    handlers['tab.qc']!();
    expect(deps.tabBar.setActiveTab).toHaveBeenCalledWith('qc');
  });

  // -- Channel (uncovered) -----------------------------------------------

  it('channel.grayscale calls channelSelect.handleKeyboard with Y', () => {
    handlers['channel.grayscale']!();
    expect(deps.controls.channelSelect.handleKeyboard).toHaveBeenCalledWith('Y', true);
  });

  it('channel.none calls channelSelect.handleKeyboard with N', () => {
    handlers['channel.none']!();
    expect(deps.controls.channelSelect.handleKeyboard).toHaveBeenCalledWith('N', true);
  });

  // -- Version navigation -------------------------------------------------

  it('version.next calls headerBar.navigateVersion with next', () => {
    handlers['version.next']!();
    expect(deps.headerBar.navigateVersion).toHaveBeenCalledWith('next');
  });

  it('version.previous calls headerBar.navigateVersion with previous', () => {
    handlers['version.previous']!();
    expect(deps.headerBar.navigateVersion).toHaveBeenCalledWith('previous');
  });

  // -- Cache ---------------------------------------------------------------

  it('cache.cycleCacheMode calls frameCacheController.cycleMode', () => {
    deps.frameCacheController = { cycleMode: vi.fn() };
    handlers = buildActionHandlers(deps);
    handlers['cache.cycleCacheMode']!();
    expect(deps.frameCacheController.cycleMode).toHaveBeenCalledOnce();
  });

  it('cache.cycleCacheMode is safe when frameCacheController is null', () => {
    deps.frameCacheController = null;
    handlers = buildActionHandlers(deps);
    expect(() => handlers['cache.cycleCacheMode']!()).not.toThrow();
  });

  // -- Network (togglePanel) ----------------------------------------------

  it('network.togglePanel calls networkControl.togglePanel', () => {
    handlers['network.togglePanel']!();
    expect(deps.controls.networkControl.togglePanel).toHaveBeenCalledOnce();
  });

  // -- Layout (uncovered) -------------------------------------------------

  it('layout.color applies the color preset', () => {
    handlers['layout.color']!();
    expect(deps.layoutStore.applyPreset).toHaveBeenCalledWith('color');
  });

  it('layout.paint applies the paint preset', () => {
    handlers['layout.paint']!();
    expect(deps.layoutStore.applyPreset).toHaveBeenCalledWith('paint');
  });
});
