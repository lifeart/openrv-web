import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from './utils/EventEmitter';
import { wireViewControls, deriveCompareLabels } from './AppViewWiring';
import type { AppWiringContext } from './AppWiringContext';

/**
 * Creates a mock AppWiringContext with EventEmitter-based controls
 * and vi.fn() stubs for all methods read by wireViewControls.
 */
function createMockContext() {
  const viewerContainer = document.createElement('div');
  const viewer = {
    smoothFitToWindow: vi.fn(),
    smoothFitToWidth: vi.fn(),
    smoothFitToHeight: vi.fn(),
    smoothSetZoom: vi.fn(),
    smoothSetPixelRatio: vi.fn(),
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
    getContainer: vi.fn(() => viewerContainer),
    getImageData: vi.fn(() => null),
    getStereoState: vi.fn(() => ({ mode: 'off' })),
    getStereoPair: vi.fn(() => null),
    getPixelCoordinatesFromClient: vi.fn(() => null) as ReturnType<typeof vi.fn>,
    setWipeLabels: vi.fn(),
  };

  const session = Object.assign(new EventEmitter(), {
    setCurrentAB: vi.fn(),
    sourceCount: 1,
    currentSourceIndex: 0,
    sourceA: null as { name: string } | null,
    sourceB: null as { name: string } | null,
  });

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
    getWipeMode: vi.fn().mockReturnValue('off'),
    getFlickerFrame: vi.fn().mockReturnValue(1),
    isDifferenceMatteEnabled: vi.fn().mockReturnValue(false),
    getBlendMode: vi.fn().mockReturnValue('off'),
    isQuadViewEnabled: vi.fn().mockReturnValue(false),
    setWipeMode: vi.fn(),
    setDifferenceMatteEnabled: vi.fn(),
    setBlendMode: vi.fn(),
    setQuadViewEnabled: vi.fn(),
  });

  const layoutManager = {
    enabled: false,
    setDeactivateCompareCallback: vi.fn(),
    on: vi.fn().mockReturnValue(() => {}),
    disable: vi.fn(),
  };

  const layoutControl = Object.assign(new EventEmitter(), {
    getManager: vi.fn().mockReturnValue(layoutManager),
    setSourceCount: vi.fn(),
    setCurrentSourceIndex: vi.fn(),
  });

  const toneMappingControl = Object.assign(new EventEmitter(), {
    syncHDROutputMode: vi.fn(),
    getHDROutputMode: vi.fn().mockReturnValue('sdr'),
  });
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
    layoutControl,
    toneMappingControl,
    ghostFrameControl,
    parControl,
    backgroundPatternControl,
    channelSelect,
    stereoControl,
    stereoEyeTransformControl,
    stereoAlignControl,
    presentationMode,
    convergenceMeasure: Object.assign(new EventEmitter(), {
      isEnabled: vi.fn(() => false),
      setCursorPosition: vi.fn(),
      measureAtCursor: vi.fn(),
    }),
    floatingWindowControl: Object.assign(new EventEmitter(), {
      hasResult: vi.fn(() => false),
      clearResult: vi.fn(),
    }),
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
  let subs: ReturnType<typeof wireViewControls>;

  beforeEach(() => {
    const mock = createMockContext();
    ctx = mock.ctx;
    viewer = mock.viewer;
    session = mock.session;
    sessionBridge = mock.sessionBridge;
    persistenceManager = mock.persistenceManager;
    headerBar = mock.headerBar;
    controls = mock.controls;

    subs = wireViewControls(ctx);
  });

  // VW-001
  it('VW-001: zoomChanged "fit" calls viewer.smoothFitToWindow()', () => {
    (controls.zoomControl as EventEmitter).emit('zoomChanged', 'fit');
    expect(viewer.smoothFitToWindow).toHaveBeenCalledOnce();
    expect(viewer.smoothSetPixelRatio).not.toHaveBeenCalled();
  });

  // VW-002 - ZoomControl now emits pixel ratio values (industry standard semantics)
  it('VW-002: zoomChanged with numeric value calls viewer.smoothSetPixelRatio()', () => {
    (controls.zoomControl as EventEmitter).emit('zoomChanged', 2);
    expect(viewer.smoothSetPixelRatio).toHaveBeenCalledWith(2);
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
    viewer.setHDROutputMode.mockReturnValue(true);
    (controls.toneMappingControl as EventEmitter).emit('hdrModeChanged', { mode: 'hlg', previousMode: 'sdr' });
    expect(viewer.setHDROutputMode).toHaveBeenCalledWith('hlg');
  });

  // VW-011b
  it('VW-011b: hdrModeChanged emits console.warn and reverts UI when renderer rejects mode', () => {
    viewer.setHDROutputMode.mockReturnValue(false);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (controls.toneMappingControl as EventEmitter).emit('hdrModeChanged', { mode: 'pq', previousMode: 'sdr' });
    expect(viewer.setHDROutputMode).toHaveBeenCalledWith('pq');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('rejected by the renderer'));
    expect(controls.toneMappingControl.syncHDROutputMode).toHaveBeenCalledWith('sdr');
    warnSpy.mockRestore();
  });

  // VW-011c
  it('VW-011c: hdrModeChanged does NOT warn when renderer accepts mode', () => {
    viewer.setHDROutputMode.mockReturnValue(true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (controls.toneMappingControl as EventEmitter).emit('hdrModeChanged', { mode: 'hlg', previousMode: 'sdr' });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // VW-011d
  it('VW-011d: hdrModeChanged does NOT call syncHDROutputMode when renderer accepts mode', () => {
    viewer.setHDROutputMode.mockReturnValue(true);
    (controls.toneMappingControl as EventEmitter).emit('hdrModeChanged', { mode: 'hlg', previousMode: 'sdr' });
    expect(controls.toneMappingControl.syncHDROutputMode).not.toHaveBeenCalled();
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

  // VW-020: fit-width zoom level
  it('VW-020: zoomChanged "fit-width" calls viewer.smoothFitToWidth()', () => {
    (controls.zoomControl as EventEmitter).emit('zoomChanged', 'fit-width');
    expect(viewer.smoothFitToWidth).toHaveBeenCalledOnce();
    expect(viewer.smoothFitToWindow).not.toHaveBeenCalled();
    expect(viewer.smoothSetZoom).not.toHaveBeenCalled();
  });

  // VW-021: fit-height zoom level
  it('VW-021: zoomChanged "fit-height" calls viewer.smoothFitToHeight()', () => {
    (controls.zoomControl as EventEmitter).emit('zoomChanged', 'fit-height');
    expect(viewer.smoothFitToHeight).toHaveBeenCalledOnce();
    expect(viewer.smoothFitToWindow).not.toHaveBeenCalled();
    expect(viewer.smoothSetZoom).not.toHaveBeenCalled();
  });

  // VW-030: Layout source tracking wiring
  it('VW-030: wireViewControls initializes layout source count and current index from session', () => {
    expect(controls.layoutControl.setSourceCount).toHaveBeenCalledWith(1);
    expect(controls.layoutControl.setCurrentSourceIndex).toHaveBeenCalledWith(0);
  });

  // VW-031: sourceLoaded updates layout source tracking
  it('VW-031: sourceLoaded event updates layout control source count and current index', () => {
    controls.layoutControl.setSourceCount.mockClear();
    controls.layoutControl.setCurrentSourceIndex.mockClear();

    // Simulate session state change
    (session as unknown as { sourceCount: number; currentSourceIndex: number }).sourceCount = 3;
    (session as unknown as { sourceCount: number; currentSourceIndex: number }).currentSourceIndex = 2;

    (session as EventEmitter).emit('sourceLoaded', undefined as never);

    expect(controls.layoutControl.setSourceCount).toHaveBeenCalledWith(3);
    expect(controls.layoutControl.setCurrentSourceIndex).toHaveBeenCalledWith(2);
  });

  describe('convergence measurement coordinate conversion', () => {
    it('VW-CONV-001: uses viewer.getPixelCoordinatesFromClient instead of querySelector canvas', () => {
      // Enable convergence and stereo
      controls.convergenceMeasure.isEnabled.mockReturnValue(true);
      viewer.getStereoState.mockReturnValue({ mode: 'side-by-side' });
      viewer.getPixelCoordinatesFromClient.mockReturnValue({ x: 100, y: 200 });

      const container = viewer.getContainer();
      const event = new MouseEvent('mousemove', { clientX: 150, clientY: 250 });
      container.dispatchEvent(event);

      expect(viewer.getPixelCoordinatesFromClient).toHaveBeenCalledWith(150, 250);
      expect(controls.convergenceMeasure.setCursorPosition).toHaveBeenCalledWith(100, 200);
    });

    it('VW-CONV-002: does not call setCursorPosition when getPixelCoordinatesFromClient returns null (out of bounds)', () => {
      controls.convergenceMeasure.isEnabled.mockReturnValue(true);
      viewer.getStereoState.mockReturnValue({ mode: 'side-by-side' });
      viewer.getPixelCoordinatesFromClient.mockReturnValue(null);

      const container = viewer.getContainer();
      const event = new MouseEvent('mousemove', { clientX: -10, clientY: -10 });
      container.dispatchEvent(event);

      expect(viewer.getPixelCoordinatesFromClient).toHaveBeenCalledWith(-10, -10);
      expect(controls.convergenceMeasure.setCursorPosition).not.toHaveBeenCalled();
    });

    it('VW-CONV-003: handles zoomed viewer state (coordinates mapped through viewer method)', () => {
      controls.convergenceMeasure.isEnabled.mockReturnValue(true);
      viewer.getStereoState.mockReturnValue({ mode: 'anaglyph' });
      // Simulate 2x zoom: client coords 300,400 map to pixel coords 600,800
      viewer.getPixelCoordinatesFromClient.mockReturnValue({ x: 600, y: 800 });

      const container = viewer.getContainer();
      const event = new MouseEvent('mousemove', { clientX: 300, clientY: 400 });
      container.dispatchEvent(event);

      expect(viewer.getPixelCoordinatesFromClient).toHaveBeenCalledWith(300, 400);
      expect(controls.convergenceMeasure.setCursorPosition).toHaveBeenCalledWith(600, 800);
    });

    it('VW-CONV-004: handles panned viewer state (coordinates mapped through viewer method)', () => {
      controls.convergenceMeasure.isEnabled.mockReturnValue(true);
      viewer.getStereoState.mockReturnValue({ mode: 'side-by-side' });
      // Simulate panned state: client coords offset by pan
      viewer.getPixelCoordinatesFromClient.mockReturnValue({ x: 50, y: 75 });

      const container = viewer.getContainer();
      const event = new MouseEvent('mousemove', { clientX: 200, clientY: 300 });
      container.dispatchEvent(event);

      expect(controls.convergenceMeasure.setCursorPosition).toHaveBeenCalledWith(50, 75);
    });
  });

  describe('floating window QC clear on source change', () => {
    it('VW-FW-001: currentSourceChanged clears floating window result', () => {
      controls.floatingWindowControl.hasResult.mockReturnValue(true);

      (session as EventEmitter).emit('currentSourceChanged', 1);

      expect(controls.floatingWindowControl.clearResult).toHaveBeenCalledTimes(1);
    });

    it('VW-FW-002: currentSourceChanged clears result even when no result exists', () => {
      controls.floatingWindowControl.hasResult.mockReturnValue(false);

      (session as EventEmitter).emit('currentSourceChanged', 2);

      // clearResult is always called; it is a no-op internally when there is no result
      expect(controls.floatingWindowControl.clearResult).toHaveBeenCalledTimes(1);
    });

    it('VW-FW-003: multiple source changes clear result each time', () => {
      (session as EventEmitter).emit('currentSourceChanged', 1);
      (session as EventEmitter).emit('currentSourceChanged', 0);
      (session as EventEmitter).emit('currentSourceChanged', 2);

      expect(controls.floatingWindowControl.clearResult).toHaveBeenCalledTimes(3);
    });

    it('VW-FW-004: stereo-off clear path (via updateStereoEyeControlsVisibility) still works independently', () => {
      // The stereo-off clear path is in AppControlRegistry.updateStereoEyeControlsVisibility,
      // which is called when stereoControl emits stateChanged with mode 'off'.
      // Verify the wiring still calls updateStereoEyeControlsVisibility on stereo state change.
      (controls.stereoControl as EventEmitter).emit('stateChanged', { mode: 'off' });

      expect(controls.updateStereoEyeControlsVisibility).toHaveBeenCalled();
    });
  });

  describe('quad view wiring', () => {
    it('VW-QUAD-001: quadViewChanged with enabled=true logs a console.warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (controls.compareControl as EventEmitter).emit('quadViewChanged', {
        enabled: true,
        sources: ['A', 'B', 'C', 'D'],
      });
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]![0]).toContain('Quad View is not yet connected');
      warnSpy.mockRestore();
    });

    it('VW-QUAD-002: quadViewChanged with enabled=false does not log a warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (controls.compareControl as EventEmitter).emit('quadViewChanged', {
        enabled: false,
        sources: ['A', 'B', 'C', 'D'],
      });
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('VW-QUAD-003: quadViewChanged disables layout when layout is active', () => {
      const lm = controls.layoutControl.getManager();
      lm.enabled = true;
      (controls.compareControl as EventEmitter).emit('quadViewChanged', {
        enabled: true,
        sources: ['A', 'B', 'C', 'D'],
      });
      expect(lm.disable).toHaveBeenCalled();
      // Suppress the console.warn from the other subscription
    });

    it('VW-QUAD-004: quadViewChanged does not disable layout when layout is inactive', () => {
      const lm = controls.layoutControl.getManager();
      lm.enabled = false;
      (controls.compareControl as EventEmitter).emit('quadViewChanged', {
        enabled: true,
        sources: ['A', 'B', 'C', 'D'],
      });
      expect(lm.disable).not.toHaveBeenCalled();
    });

    it('VW-QUAD-005: deactivateCompareCallback disables quad view when active', () => {
      const lm = controls.layoutControl.getManager();
      // Capture the callback passed to setDeactivateCompareCallback
      const callback = lm.setDeactivateCompareCallback.mock.calls[0]![0] as () => void;

      // Simulate quad view being active
      controls.compareControl.isQuadViewEnabled.mockReturnValue(true);
      callback();
      expect(controls.compareControl.setQuadViewEnabled).toHaveBeenCalledWith(false);
    });

    it('VW-QUAD-006: deactivateCompareCallback skips quad view when not active', () => {
      const lm = controls.layoutControl.getManager();
      const callback = lm.setDeactivateCompareCallback.mock.calls[0]![0] as () => void;

      controls.compareControl.isQuadViewEnabled.mockReturnValue(false);
      callback();
      expect(controls.compareControl.setQuadViewEnabled).not.toHaveBeenCalled();
    });
  });

  describe('disposal', () => {
    it('VW-DISP-001: callbacks fire before dispose', () => {
      (controls.zoomControl as EventEmitter).emit('zoomChanged', 'fit');
      expect(viewer.smoothFitToWindow).toHaveBeenCalledOnce();
    });

    it('VW-DISP-002: callbacks do not fire after dispose', () => {
      subs.subscriptions.dispose();

      viewer.smoothFitToWindow.mockClear();
      (controls.zoomControl as EventEmitter).emit('zoomChanged', 'fit');
      expect(viewer.smoothFitToWindow).not.toHaveBeenCalled();
    });
  });

  // VW-332-001: wipeModeChanged updates labels from source names
  it('VW-332-001: wipeModeChanged sets wipe labels from session sources when mode activates', () => {
    session.sourceA = { name: 'hero_v2.exr' };
    session.sourceB = { name: 'hero_v1.exr' };
    viewer.setWipeLabels.mockClear();
    (controls.compareControl as EventEmitter).emit('wipeModeChanged', 'horizontal');
    expect(viewer.setWipeLabels).toHaveBeenCalledWith('hero_v2.exr', 'hero_v1.exr');
  });

  // VW-332-002: wipeModeChanged does not set labels when mode is 'off'
  it('VW-332-002: wipeModeChanged does not set wipe labels when mode is off', () => {
    session.sourceA = { name: 'a.exr' };
    session.sourceB = { name: 'b.exr' };
    viewer.setWipeLabels.mockClear();
    (controls.compareControl as EventEmitter).emit('wipeModeChanged', 'off');
    expect(viewer.setWipeLabels).not.toHaveBeenCalled();
  });

  // VW-332-003: labels fall back to A/B when sources are null
  it('VW-332-003: wipeModeChanged falls back to A/B labels when sources are null', () => {
    session.sourceA = null;
    session.sourceB = null;
    viewer.setWipeLabels.mockClear();
    (controls.compareControl as EventEmitter).emit('wipeModeChanged', 'vertical');
    expect(viewer.setWipeLabels).toHaveBeenCalledWith('A', 'B');
  });
});

describe('deriveCompareLabels', () => {
  it('VW-332-004: returns source names when both sources are present', () => {
    const session = { sourceA: { name: 'shot01.exr' }, sourceB: { name: 'shot02.exr' } } as any;
    expect(deriveCompareLabels(session)).toEqual({ labelA: 'shot01.exr', labelB: 'shot02.exr' });
  });

  it('VW-332-005: returns A/B defaults when sources are null', () => {
    const session = { sourceA: null, sourceB: null } as any;
    expect(deriveCompareLabels(session)).toEqual({ labelA: 'A', labelB: 'B' });
  });

  it('VW-332-006: returns A/B defaults when sources are undefined', () => {
    const session = {} as any;
    expect(deriveCompareLabels(session)).toEqual({ labelA: 'A', labelB: 'B' });
  });
});
