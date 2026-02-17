import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from './utils/EventEmitter';
import { wireViewControls } from './AppViewWiring';
import type { AppWiringContext } from './AppWiringContext';

/**
 * Creates a mock AppWiringContext with EventEmitter-based controls
 * and vi.fn() stubs for all methods read by wireViewControls.
 */
function createMockContext() {
  const viewer = {
    smoothFitToWindow: vi.fn(),
    smoothSetZoom: vi.fn(),
    setWipeState: vi.fn(),
    setDifferenceMatteState: vi.fn(),
    setBlendModeState: vi.fn(),
    setToneMappingState: vi.fn(),
    setHDROutputMode: vi.fn(),
    setGhostFrameState: vi.fn(),
    setPARState: vi.fn(),
    setBackgroundPatternState: vi.fn(),
    setChannelMode: vi.fn(),
    setStereoState: vi.fn(),
    setStereoEyeTransforms: vi.fn(),
    setStereoAlignMode: vi.fn(),
    resetStereoEyeTransforms: vi.fn(),
    resetStereoAlignMode: vi.fn(),
  };

  const session = {
    setCurrentAB: vi.fn(),
  };

  const sessionBridge = {
    updateHistogram: vi.fn(),
    updateWaveform: vi.fn(),
    updateVectorscope: vi.fn(),
    updateGamutDiagram: vi.fn(),
    scheduleUpdateScopes: vi.fn(),
    handleEXRLayerChange: vi.fn(),
  };

  const persistenceManager = {
    syncGTOStore: vi.fn(),
  };

  const headerBar = {
    setPresentationState: vi.fn(),
  };

  // Build control emitters. Each control is an EventEmitter with
  // additional vi.fn() stubs for any getter methods the wiring calls.
  const zoomControl = new EventEmitter();
  const scopesControl = new EventEmitter();

  const histogram = { show: vi.fn(), hide: vi.fn() };
  const waveform = { show: vi.fn(), hide: vi.fn() };
  const vectorscope = { show: vi.fn(), hide: vi.fn() };
  const gamutDiagram = { show: vi.fn(), hide: vi.fn() };

  const compareControl = Object.assign(new EventEmitter(), {
    getWipePosition: vi.fn().mockReturnValue(0.5),
    getWipeMode: vi.fn().mockReturnValue('horizontal'),
    getFlickerFrame: vi.fn().mockReturnValue(1),
  });

  const toneMappingControl = new EventEmitter();
  const ghostFrameControl = new EventEmitter();
  const parControl = new EventEmitter();
  const backgroundPatternControl = new EventEmitter();
  const channelSelect = new EventEmitter();

  const stereoControl = new EventEmitter();
  const stereoEyeTransformControl = Object.assign(new EventEmitter(), {
    hidePanel: vi.fn(),
    reset: vi.fn(),
  });
  const stereoAlignControl = Object.assign(new EventEmitter(), {
    reset: vi.fn(),
  });

  const presentationMode = new EventEmitter();

  const controls = {
    zoomControl,
    scopesControl,
    histogram,
    waveform,
    vectorscope,
    gamutDiagram,
    compareControl,
    toneMappingControl,
    ghostFrameControl,
    parControl,
    backgroundPatternControl,
    channelSelect,
    stereoControl,
    stereoEyeTransformControl,
    stereoAlignControl,
    presentationMode,
    updateStereoEyeControlsVisibility: vi.fn(),
  };

  const ctx = {
    session,
    viewer,
    controls,
    sessionBridge,
    persistenceManager,
    headerBar,
    // Unused by wireViewControls but present on the interface
    paintEngine: {},
    tabBar: {},
  } as unknown as AppWiringContext;

  return { ctx, viewer, session, sessionBridge, persistenceManager, headerBar, controls };
}

describe('wireViewControls', () => {
  let ctx: AppWiringContext;
  let viewer: ReturnType<typeof createMockContext>['viewer'];
  let session: ReturnType<typeof createMockContext>['session'];
  let sessionBridge: ReturnType<typeof createMockContext>['sessionBridge'];
  let persistenceManager: ReturnType<typeof createMockContext>['persistenceManager'];
  let headerBar: ReturnType<typeof createMockContext>['headerBar'];
  let controls: ReturnType<typeof createMockContext>['controls'];

  beforeEach(() => {
    const mock = createMockContext();
    ctx = mock.ctx;
    viewer = mock.viewer;
    session = mock.session;
    sessionBridge = mock.sessionBridge;
    persistenceManager = mock.persistenceManager;
    headerBar = mock.headerBar;
    controls = mock.controls;

    wireViewControls(ctx);
  });

  // VW-001
  it('VW-001: zoomChanged "fit" calls viewer.smoothFitToWindow()', () => {
    (controls.zoomControl as EventEmitter).emit('zoomChanged', 'fit');
    expect(viewer.smoothFitToWindow).toHaveBeenCalledOnce();
    expect(viewer.smoothSetZoom).not.toHaveBeenCalled();
  });

  // VW-002
  it('VW-002: zoomChanged with numeric value calls viewer.smoothSetZoom()', () => {
    (controls.zoomControl as EventEmitter).emit('zoomChanged', 2);
    expect(viewer.smoothSetZoom).toHaveBeenCalledWith(2);
    expect(viewer.smoothFitToWindow).not.toHaveBeenCalled();
  });

  // VW-003
  it('VW-003: scopeToggled histogram show calls histogram.show() and sessionBridge.updateHistogram()', () => {
    (controls.scopesControl as EventEmitter).emit('scopeToggled', { scope: 'histogram', visible: true });
    expect(controls.histogram.show).toHaveBeenCalledOnce();
    expect(sessionBridge.updateHistogram).toHaveBeenCalledOnce();
  });

  // VW-004
  it('VW-004: scopeToggled histogram hide calls histogram.hide()', () => {
    (controls.scopesControl as EventEmitter).emit('scopeToggled', { scope: 'histogram', visible: false });
    expect(controls.histogram.hide).toHaveBeenCalledOnce();
    expect(controls.histogram.show).not.toHaveBeenCalled();
    expect(sessionBridge.updateHistogram).not.toHaveBeenCalled();
  });

  // VW-005
  it('VW-005: scopeToggled always calls persistenceManager.syncGTOStore()', () => {
    (controls.scopesControl as EventEmitter).emit('scopeToggled', { scope: 'waveform', visible: true });
    expect(persistenceManager.syncGTOStore).toHaveBeenCalledOnce();

    persistenceManager.syncGTOStore.mockClear();
    (controls.scopesControl as EventEmitter).emit('scopeToggled', { scope: 'vectorscope', visible: false });
    expect(persistenceManager.syncGTOStore).toHaveBeenCalledOnce();
  });

  // VW-006
  it('VW-006: wipeModeChanged calls viewer.setWipeState() with mode and current position', () => {
    controls.compareControl.getWipePosition.mockReturnValue(0.7);
    (controls.compareControl as EventEmitter).emit('wipeModeChanged', 'horizontal');
    expect(viewer.setWipeState).toHaveBeenCalledWith({
      mode: 'horizontal',
      position: 0.7,
      showOriginal: 'left',
    });
  });

  // VW-007
  it('VW-007: wipePositionChanged calls viewer.setWipeState() with current mode', () => {
    controls.compareControl.getWipeMode.mockReturnValue('vertical');
    (controls.compareControl as EventEmitter).emit('wipePositionChanged', 0.3);
    expect(viewer.setWipeState).toHaveBeenCalledWith({
      mode: 'vertical',
      position: 0.3,
      showOriginal: 'top',
    });
  });

  // VW-008
  it('VW-008: abSourceChanged calls session.setCurrentAB()', () => {
    (controls.compareControl as EventEmitter).emit('abSourceChanged', 'B');
    expect(session.setCurrentAB).toHaveBeenCalledWith('B');
  });

  // VW-009
  it('VW-009: differenceMatteChanged calls viewer.setDifferenceMatteState()', () => {
    const state = { enabled: true, threshold: 0.01 };
    (controls.compareControl as EventEmitter).emit('differenceMatteChanged', state);
    expect(viewer.setDifferenceMatteState).toHaveBeenCalledWith(state);
  });

  // VW-009b
  it('VW-009b: blendModeChanged calls viewer.setBlendModeState() with flicker frame', () => {
    const state = { mode: 'flicker', onionOpacity: 0.5, flickerRate: 8, blendRatio: 0.5 };
    controls.compareControl.getFlickerFrame.mockReturnValue(1);
    (controls.compareControl as EventEmitter).emit('blendModeChanged', state);
    expect(viewer.setBlendModeState).toHaveBeenCalledWith({
      ...state,
      flickerFrame: 1,
    });
  });

  // VW-010
  it('VW-010: toneMappingControl stateChanged calls viewer.setToneMappingState() and scheduleUpdateScopes()', () => {
    const state = { enabled: true, method: 'reinhard' };
    (controls.toneMappingControl as EventEmitter).emit('stateChanged', state);
    expect(viewer.setToneMappingState).toHaveBeenCalledWith(state);
    expect(sessionBridge.scheduleUpdateScopes).toHaveBeenCalledOnce();
  });

  // VW-011
  it('VW-011: hdrModeChanged calls viewer.setHDROutputMode()', () => {
    (controls.toneMappingControl as EventEmitter).emit('hdrModeChanged', 'hlg');
    expect(viewer.setHDROutputMode).toHaveBeenCalledWith('hlg');
  });

  // VW-012
  it('VW-012: channelChanged calls viewer.setChannelMode(), scheduleUpdateScopes(), and syncGTOStore()', () => {
    (controls.channelSelect as EventEmitter).emit('channelChanged', 'red');
    expect(viewer.setChannelMode).toHaveBeenCalledWith('red');
    expect(sessionBridge.scheduleUpdateScopes).toHaveBeenCalledOnce();
    expect(persistenceManager.syncGTOStore).toHaveBeenCalledOnce();
  });

  // VW-013
  it('VW-013: ghostFrameControl stateChanged calls viewer.setGhostFrameState()', () => {
    const state = { enabled: true, opacity: 0.5, offset: -1 };
    (controls.ghostFrameControl as EventEmitter).emit('stateChanged', state);
    expect(viewer.setGhostFrameState).toHaveBeenCalledWith(state);
  });

  // VW-014
  it('VW-014: presentationMode stateChanged calls headerBar.setPresentationState()', () => {
    (controls.presentationMode as EventEmitter).emit('stateChanged', { enabled: true });
    expect(headerBar.setPresentationState).toHaveBeenCalledWith(true);
  });

  // VW-016
  it('VW-016: scopeToggled gamutDiagram show calls gamutDiagram.show() and sessionBridge.updateGamutDiagram()', () => {
    (controls.scopesControl as EventEmitter).emit('scopeToggled', { scope: 'gamutDiagram', visible: true });
    expect(controls.gamutDiagram.show).toHaveBeenCalledOnce();
    expect(sessionBridge.updateGamutDiagram).toHaveBeenCalledOnce();
  });

  // VW-017
  it('VW-017: scopeToggled gamutDiagram hide calls gamutDiagram.hide()', () => {
    (controls.scopesControl as EventEmitter).emit('scopeToggled', { scope: 'gamutDiagram', visible: false });
    expect(controls.gamutDiagram.hide).toHaveBeenCalledOnce();
    expect(controls.gamutDiagram.show).not.toHaveBeenCalled();
    expect(sessionBridge.updateGamutDiagram).not.toHaveBeenCalled();
  });

  // VW-015
  it('VW-015: stereoControl stateChanged mode=off resets eye transforms and align controls', () => {
    const state = { mode: 'off' };
    (controls.stereoControl as EventEmitter).emit('stateChanged', state);

    expect(viewer.setStereoState).toHaveBeenCalledWith(state);
    expect(sessionBridge.scheduleUpdateScopes).toHaveBeenCalledOnce();
    expect(persistenceManager.syncGTOStore).toHaveBeenCalledOnce();

    // mode=off triggers reset behavior
    expect(controls.stereoEyeTransformControl.hidePanel).toHaveBeenCalledOnce();
    expect(controls.stereoEyeTransformControl.reset).toHaveBeenCalledOnce();
    expect(controls.stereoAlignControl.reset).toHaveBeenCalledOnce();
    expect(viewer.resetStereoEyeTransforms).toHaveBeenCalledOnce();
    expect(viewer.resetStereoAlignMode).toHaveBeenCalledOnce();
    expect(controls.updateStereoEyeControlsVisibility).toHaveBeenCalledOnce();
  });
});
