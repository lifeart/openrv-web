import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wireColorControls, resolveOCIOBakeSize, ACES_OCIO_BAKE_SIZE, DEFAULT_OCIO_BAKE_SIZE } from './AppColorWiring';
import { EventEmitter } from './utils/EventEmitter';
import { getGlobalHistoryManager } from './utils/HistoryManager';
import { DEFAULT_COLOR_WHEELS_STATE } from './core/types/color';
import type { ColorWheelsState } from './core/types/color';

// ---------------------------------------------------------------------------
// Lightweight test doubles
// ---------------------------------------------------------------------------

// Controls only need EventEmitter capabilities plus the methods that
// wireColorControls actually calls. DOM-heavy real controls cannot be
// instantiated in a test environment, so thin EventEmitter subclasses
// are the appropriate approach here.

class StubColorInversionToggle extends EventEmitter {}
class StubColorControls extends EventEmitter {
  private adjustments = { exposure: 0, contrast: 0, saturation: 1 };
  getAdjustments() {
    return { ...this.adjustments };
  }
  setAdjustments(adj: Record<string, number>) {
    this.adjustments = { ...adj } as any;
  }
}
class StubCDLControl extends EventEmitter {}
class StubCurvesControl extends EventEmitter {}
class StubOCIOControl extends EventEmitter {
  private _processor = {
    bakeTo3DLUT: vi.fn(() => new Float32Array(65 * 65 * 65 * 3)),
  };
  getProcessor() {
    return this._processor;
  }
}
class StubDisplayProfileControl extends EventEmitter {}
class StubGamutMappingControl extends EventEmitter {}
class StubLUTPipelinePanel extends EventEmitter {}
class StubPremultControl extends EventEmitter {}
class StubColorWheels extends EventEmitter {
  private state: ColorWheelsState = JSON.parse(JSON.stringify(DEFAULT_COLOR_WHEELS_STATE));
  getState(): ColorWheelsState {
    return JSON.parse(JSON.stringify(this.state));
  }
  setState(state: Partial<ColorWheelsState>) {
    if (state.lift) this.state.lift = { ...state.lift };
    if (state.gamma) this.state.gamma = { ...state.gamma };
    if (state.gain) this.state.gain = { ...state.gain };
    if (state.master) this.state.master = { ...state.master };
    if (state.linked !== undefined) this.state.linked = state.linked;
  }
}

function createMockViewer() {
  const colorWheels = new StubColorWheels();
  return {
    setColorInversion: vi.fn(),
    setColorAdjustments: vi.fn(),
    setLUT: vi.fn(),
    setLUTIntensity: vi.fn(),
    setCDL: vi.fn(),
    setCurves: vi.fn(),
    setOCIOBakedLUT: vi.fn(),
    setDisplayColorState: vi.fn(),
    setGamutMappingState: vi.fn(),
    setPremultMode: vi.fn(),
    syncLUTPipeline: vi.fn(),
    onColorWheelsChanged: vi.fn(),
    getColorWheels: () => colorWheels,
    _colorWheels: colorWheels,
  };
}

function createMockSessionBridge() {
  return {
    scheduleUpdateScopes: vi.fn(),
  };
}

function createMockPersistenceManager() {
  return {
    syncGTOStore: vi.fn(),
  };
}

function createContext() {
  const colorInversionToggle = new StubColorInversionToggle();
  const colorControls = new StubColorControls();
  const cdlControl = new StubCDLControl();
  const curvesControl = new StubCurvesControl();
  const ocioControl = new StubOCIOControl();
  const displayProfileControl = new StubDisplayProfileControl();
  const gamutMappingControl = new StubGamutMappingControl();
  const lutPipelinePanel = new StubLUTPipelinePanel();
  const premultControl = new StubPremultControl();
  const viewer = createMockViewer();
  const sessionBridge = createMockSessionBridge();
  const persistenceManager = createMockPersistenceManager();

  const gamutDiagram = {
    setColorSpaces: vi.fn(),
  };

  const controls = {
    colorInversionToggle,
    colorControls,
    cdlControl,
    curvesControl,
    ocioControl,
    displayProfileControl,
    gamutMappingControl,
    lutPipelinePanel,
    premultControl,
    gamutDiagram,
  };

  return {
    viewer: viewer as any,
    controls: controls as any,
    sessionBridge: sessionBridge as any,
    persistenceManager: persistenceManager as any,
    session: {} as any,
    paintEngine: {} as any,
    headerBar: {} as any,
    tabBar: {} as any,
    // Typed references for assertions
    _viewer: viewer,
    _sessionBridge: sessionBridge,
    _persistenceManager: persistenceManager,
    _controls: controls,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wireColorControls', () => {
  let ctx: ReturnType<typeof createContext>;

  beforeEach(() => {
    ctx = createContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('CW-001: inversionChanged calls viewer.setColorInversion()', () => {
    wireColorControls(ctx as any);

    ctx._controls.colorInversionToggle.emit('inversionChanged', true);

    expect(ctx._viewer.setColorInversion).toHaveBeenCalledTimes(1);
    expect(ctx._viewer.setColorInversion).toHaveBeenCalledWith(true);
  });

  it('CW-002: adjustmentsChanged calls viewer.setColorAdjustments() and scheduleUpdateScopes()', () => {
    wireColorControls(ctx as any);

    const adjustments = { exposure: 1.5, contrast: 0.8, saturation: 1.2 };
    ctx._controls.colorControls.emit('adjustmentsChanged', adjustments);

    expect(ctx._viewer.setColorAdjustments).toHaveBeenCalledTimes(1);
    expect(ctx._viewer.setColorAdjustments).toHaveBeenCalledWith(adjustments);
    expect(ctx._sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
  });

  it('CW-003: lutLoaded calls viewer.setLUT()', () => {
    wireColorControls(ctx as any);

    const lutData = { size: 33, data: new Float32Array(33 * 33 * 33 * 3) };
    ctx._controls.colorControls.emit('lutLoaded', lutData);

    expect(ctx._viewer.setLUT).toHaveBeenCalledTimes(1);
    expect(ctx._viewer.setLUT).toHaveBeenCalledWith(lutData);
    expect(ctx._sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
  });

  it('CW-004: lutIntensityChanged calls viewer.setLUTIntensity()', () => {
    wireColorControls(ctx as any);

    ctx._controls.colorControls.emit('lutIntensityChanged', 0.75);

    expect(ctx._viewer.setLUTIntensity).toHaveBeenCalledTimes(1);
    expect(ctx._viewer.setLUTIntensity).toHaveBeenCalledWith(0.75);
    expect(ctx._sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
  });

  it('CW-005: cdlChanged calls viewer.setCDL()', () => {
    wireColorControls(ctx as any);

    const cdl = { slope: [1, 1, 1], offset: [0, 0, 0], power: [1, 1, 1], saturation: 1 };
    ctx._controls.cdlControl.emit('cdlChanged', cdl);

    expect(ctx._viewer.setCDL).toHaveBeenCalledTimes(1);
    expect(ctx._viewer.setCDL).toHaveBeenCalledWith(cdl);
    expect(ctx._sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
  });

  it('CW-006: curvesChanged calls viewer.setCurves()', () => {
    wireColorControls(ctx as any);

    const curves = { master: [], red: [], green: [], blue: [] };
    ctx._controls.curvesControl.emit('curvesChanged', curves);

    expect(ctx._viewer.setCurves).toHaveBeenCalledTimes(1);
    expect(ctx._viewer.setCurves).toHaveBeenCalledWith(curves);
    expect(ctx._sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
  });

  it('CW-007: displayProfileControl stateChanged calls viewer.setDisplayColorState()', () => {
    wireColorControls(ctx as any);

    const displayState = { profile: 'sRGB', enabled: true };
    ctx._controls.displayProfileControl.emit('stateChanged', displayState);

    expect(ctx._viewer.setDisplayColorState).toHaveBeenCalledTimes(1);
    expect(ctx._viewer.setDisplayColorState).toHaveBeenCalledWith(displayState);
    expect(ctx._sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
  });

  it('CW-008: ocioControl stateChanged with enabled=true calls viewer.setOCIOBakedLUT() with baked data', () => {
    wireColorControls(ctx as any);

    const ocioState = {
      enabled: true,
      configName: 'aces_1.0.3',
      customConfigPath: null,
      inputColorSpace: 'ACES - ACEScg',
      detectedColorSpace: null,
      display: 'sRGB',
      view: 'ACES 1.0 SDR-video',
      look: '',
    };
    ctx._controls.ocioControl.emit('stateChanged', ocioState);

    const processor = ctx._controls.ocioControl.getProcessor();
    expect(processor.bakeTo3DLUT).toHaveBeenCalledWith(ACES_OCIO_BAKE_SIZE);
    expect(ctx._viewer.setOCIOBakedLUT).toHaveBeenCalledTimes(1);
    expect(ctx._viewer.setOCIOBakedLUT).toHaveBeenCalledWith(expect.any(Float32Array), true);
    expect(ctx._sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
    expect(ctx._persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('CW-009: ocioControl stateChanged with enabled=false calls viewer.setOCIOBakedLUT(null, false)', () => {
    wireColorControls(ctx as any);

    const ocioState = {
      enabled: false,
      configName: 'aces_1.0.3',
      customConfigPath: null,
      inputColorSpace: 'ACES - ACEScg',
      detectedColorSpace: null,
      display: 'sRGB',
      view: 'ACES 1.0 SDR-video',
      look: '',
    };
    ctx._controls.ocioControl.emit('stateChanged', ocioState);

    expect(ctx._viewer.setOCIOBakedLUT).toHaveBeenCalledTimes(1);
    expect(ctx._viewer.setOCIOBakedLUT).toHaveBeenCalledWith(null, false);
    expect(ctx._sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
    expect(ctx._persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('CW-008b: ocioControl stateChanged updates gamutDiagram color spaces', () => {
    wireColorControls(ctx as any);

    const ocioState = {
      enabled: true,
      configName: 'aces_1.0.3',
      customConfigPath: null,
      inputColorSpace: 'ACES - ACEScg',
      detectedColorSpace: null,
      workingColorSpace: 'ACEScg',
      display: 'sRGB',
      view: 'ACES 1.0 SDR-video',
      look: '',
    };
    ctx._controls.ocioControl.emit('stateChanged', ocioState);

    expect(ctx._controls.gamutDiagram.setColorSpaces).toHaveBeenCalledWith('ACES - ACEScg', 'ACEScg', 'sRGB');
  });

  it('CW-008c: ocioControl stateChanged resolves Auto input to detectedColorSpace', () => {
    wireColorControls(ctx as any);

    const ocioState = {
      enabled: true,
      configName: 'aces_1.0.3',
      customConfigPath: null,
      inputColorSpace: 'Auto',
      detectedColorSpace: 'Rec.2020',
      workingColorSpace: 'ACEScg',
      display: 'sRGB',
      view: 'ACES 1.0 SDR-video',
      look: '',
    };
    ctx._controls.ocioControl.emit('stateChanged', ocioState);

    expect(ctx._controls.gamutDiagram.setColorSpaces).toHaveBeenCalledWith('Rec.2020', 'ACEScg', 'sRGB');
  });

  it('CW-008d: ocioControl stateChanged with Auto and no detected falls back to sRGB', () => {
    wireColorControls(ctx as any);

    const ocioState = {
      enabled: true,
      configName: 'aces_1.0.3',
      customConfigPath: null,
      inputColorSpace: 'Auto',
      detectedColorSpace: null,
      workingColorSpace: 'ACEScg',
      display: 'sRGB',
      view: 'ACES 1.0 SDR-video',
      look: '',
    };
    ctx._controls.ocioControl.emit('stateChanged', ocioState);

    expect(ctx._controls.gamutDiagram.setColorSpaces).toHaveBeenCalledWith('sRGB', 'ACEScg', 'sRGB');
  });

  it('CW-008e: ocioControl stateChanged uses 33^3 LUT for non-ACES workflow', () => {
    wireColorControls(ctx as any);

    const ocioState = {
      enabled: true,
      configName: 'srgb',
      customConfigPath: null,
      inputColorSpace: 'sRGB',
      detectedColorSpace: null,
      workingColorSpace: 'Linear sRGB',
      display: 'sRGB',
      view: 'Standard',
      look: 'None',
    };
    ctx._controls.ocioControl.emit('stateChanged', ocioState);

    const processor = ctx._controls.ocioControl.getProcessor();
    expect(processor.bakeTo3DLUT).toHaveBeenCalledWith(DEFAULT_OCIO_BAKE_SIZE);
  });

  it('CW-011: gamutMappingChanged calls viewer.setGamutMappingState + scheduleUpdateScopes + syncGTOStore', () => {
    wireColorControls(ctx as any);

    const gmState = { mode: 'clip' as const, sourceGamut: 'rec2020' as const, targetGamut: 'srgb' as const };
    ctx._controls.gamutMappingControl.emit('gamutMappingChanged', gmState);

    expect(ctx._viewer.setGamutMappingState).toHaveBeenCalledWith(gmState);
    expect(ctx._sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
    expect(ctx._persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('CW-012: lutPipelinePanel pipelineChanged syncs LUT pipeline + scopes + persistence', () => {
    wireColorControls(ctx as any);

    ctx._controls.lutPipelinePanel.emit('pipelineChanged', undefined);

    expect(ctx._viewer.syncLUTPipeline).toHaveBeenCalled();
    expect(ctx._sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
    expect(ctx._persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('CW-010: returns ColorWiringState with null timer initially', () => {
    const state = wireColorControls(ctx as any);

    expect(state.state).toHaveProperty('colorHistoryTimer');
    expect(state.state.colorHistoryTimer).toBeNull();
    expect(state.state).toHaveProperty('colorHistoryPrevious');
  });

  describe('disposal', () => {
    it('CW-DISP-001: callbacks fire before dispose', () => {
      const state = wireColorControls(ctx as any);

      ctx._controls.colorInversionToggle.emit('inversionChanged', true);
      expect(ctx._viewer.setColorInversion).toHaveBeenCalledWith(true);

      // Sanity: state is not disposed yet
      expect(state.subscriptions.isDisposed).toBe(false);
    });

    it('CW-DISP-002: callbacks do not fire after dispose', () => {
      const state = wireColorControls(ctx as any);
      state.subscriptions.dispose();

      ctx._viewer.setColorInversion.mockClear();
      ctx._controls.colorInversionToggle.emit('inversionChanged', false);
      expect(ctx._viewer.setColorInversion).not.toHaveBeenCalled();
    });
  });

  describe('debounce behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('CW-002b: adjustmentsChanged sets a debounce timer that fires after 500ms', () => {
      const state = wireColorControls(ctx as any);

      const adjustments = { exposure: 2, contrast: 0.5, saturation: 1 };
      // Set the adjustments so that getAdjustments() returns the new values
      // when the debounce callback fires and reads current state.
      ctx._controls.colorControls.setAdjustments(adjustments);
      ctx._controls.colorControls.emit('adjustmentsChanged', adjustments);

      expect(state.state.colorHistoryTimer).not.toBeNull();

      vi.advanceTimersByTime(500);

      expect(state.state.colorHistoryTimer).toBeNull();
    });
  });

  describe('color wheels wiring', () => {
    it('CW-CW-001: stateChanged calls viewer.onColorWheelsChanged()', () => {
      wireColorControls(ctx as any);

      const wheelState: ColorWheelsState = {
        ...DEFAULT_COLOR_WHEELS_STATE,
        lift: { r: 0.1, g: 0, b: 0, y: 0 },
      };
      ctx._viewer._colorWheels.emit('stateChanged', wheelState);

      expect(ctx._viewer.onColorWheelsChanged).toHaveBeenCalledTimes(1);
    });

    it('CW-CW-002: stateChanged calls scheduleUpdateScopes and syncGTOStore', () => {
      wireColorControls(ctx as any);

      const wheelState: ColorWheelsState = {
        ...DEFAULT_COLOR_WHEELS_STATE,
        lift: { r: 0.1, g: 0, b: 0, y: 0 },
      };
      ctx._viewer._colorWheels.emit('stateChanged', wheelState);

      expect(ctx._sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
      expect(ctx._persistenceManager.syncGTOStore).toHaveBeenCalled();
    });

    it('CW-CW-003: returns state with null colorWheelsHistoryTimer initially', () => {
      const result = wireColorControls(ctx as any);

      expect(result.state.colorWheelsHistoryTimer).toBeNull();
      expect(result.state.colorWheelsHistoryPrevious).toEqual(DEFAULT_COLOR_WHEELS_STATE);
    });
  });

  describe('color wheels debounce & history', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('CW-CW-004: stateChanged sets a debounce timer that fires after 500ms', () => {
      const result = wireColorControls(ctx as any);

      const wheelState: ColorWheelsState = {
        ...DEFAULT_COLOR_WHEELS_STATE,
        lift: { r: 0.2, g: 0, b: 0, y: 0 },
      };
      // Update the stub state so getState() returns the new value
      ctx._viewer._colorWheels.setState(wheelState);
      ctx._viewer._colorWheels.emit('stateChanged', wheelState);

      expect(result.state.colorWheelsHistoryTimer).not.toBeNull();

      vi.advanceTimersByTime(500);

      expect(result.state.colorWheelsHistoryTimer).toBeNull();
    });

    it('CW-CW-005: debounce timer records a history action after 500ms', () => {
      const historyManager = getGlobalHistoryManager();
      const recordSpy = vi.spyOn(historyManager, 'recordAction');

      wireColorControls(ctx as any);

      const wheelState: ColorWheelsState = {
        ...DEFAULT_COLOR_WHEELS_STATE,
        gain: { r: 0.3, g: 0.1, b: -0.2, y: 0 },
      };
      ctx._viewer._colorWheels.setState(wheelState);
      ctx._viewer._colorWheels.emit('stateChanged', wheelState);

      vi.advanceTimersByTime(500);

      expect(recordSpy).toHaveBeenCalledWith(
        'Adjust color wheels',
        'color',
        expect.any(Function),
        expect.any(Function),
      );

      recordSpy.mockRestore();
    });

    it('CW-CW-006: history undo restores previous color wheels state', () => {
      const historyManager = getGlobalHistoryManager();
      const recordSpy = vi.spyOn(historyManager, 'recordAction');

      wireColorControls(ctx as any);

      const wheelState: ColorWheelsState = {
        ...DEFAULT_COLOR_WHEELS_STATE,
        lift: { r: 0.5, g: 0, b: 0, y: 0 },
      };
      ctx._viewer._colorWheels.setState(wheelState);
      ctx._viewer._colorWheels.emit('stateChanged', wheelState);

      vi.advanceTimersByTime(500);

      // Call the undo function (3rd argument)
      const undoFn = recordSpy.mock.calls[0]![2] as () => void;
      undoFn();

      // After undo, the color wheels should have been set to the previous (default) state
      const restoredState = ctx._viewer._colorWheels.getState();
      expect(restoredState).toEqual(DEFAULT_COLOR_WHEELS_STATE);
      expect(ctx._viewer.onColorWheelsChanged).toHaveBeenCalled();

      recordSpy.mockRestore();
    });

    it('CW-CW-007: history redo restores current color wheels state', () => {
      const historyManager = getGlobalHistoryManager();
      const recordSpy = vi.spyOn(historyManager, 'recordAction');

      wireColorControls(ctx as any);

      const wheelState: ColorWheelsState = {
        ...DEFAULT_COLOR_WHEELS_STATE,
        gamma: { r: 0, g: 0.4, b: 0, y: 0.2 },
      };
      ctx._viewer._colorWheels.setState(wheelState);
      ctx._viewer._colorWheels.emit('stateChanged', wheelState);

      vi.advanceTimersByTime(500);

      // Call undo then redo
      const undoFn = recordSpy.mock.calls[0]![2] as () => void;
      const redoFn = recordSpy.mock.calls[0]![3] as () => void;
      undoFn();
      redoFn();

      const restoredState = ctx._viewer._colorWheels.getState();
      expect(restoredState.gamma).toEqual({ r: 0, g: 0.4, b: 0, y: 0.2 });
      expect(ctx._viewer.onColorWheelsChanged).toHaveBeenCalled();

      recordSpy.mockRestore();
    });

    it('CW-CW-008: no history recorded when state does not actually change', () => {
      const historyManager = getGlobalHistoryManager();
      const recordSpy = vi.spyOn(historyManager, 'recordAction');

      wireColorControls(ctx as any);

      // Emit the same default state (no change)
      ctx._viewer._colorWheels.emit('stateChanged', DEFAULT_COLOR_WHEELS_STATE);

      vi.advanceTimersByTime(500);

      expect(recordSpy).not.toHaveBeenCalled();

      recordSpy.mockRestore();
    });

    it('CW-CW-009: callbacks do not fire after dispose', () => {
      const result = wireColorControls(ctx as any);
      result.subscriptions.dispose();

      ctx._viewer.onColorWheelsChanged.mockClear();
      ctx._viewer._colorWheels.emit('stateChanged', DEFAULT_COLOR_WHEELS_STATE);

      expect(ctx._viewer.onColorWheelsChanged).not.toHaveBeenCalled();
    });

    it('CW-CW-010: colorWheelsHistoryTimer cleared on dispose prevents late history recording', () => {
      const historyManager = getGlobalHistoryManager();
      const recordSpy = vi.spyOn(historyManager, 'recordAction');

      const result = wireColorControls(ctx as any);

      const wheelState: ColorWheelsState = {
        ...DEFAULT_COLOR_WHEELS_STATE,
        lift: { r: 0.3, g: 0, b: 0, y: 0 },
      };
      ctx._viewer._colorWheels.setState(wheelState);
      ctx._viewer._colorWheels.emit('stateChanged', wheelState);

      // Timer is pending
      expect(result.state.colorWheelsHistoryTimer).not.toBeNull();

      // Simulate App.dispose clearing the timer (same pattern as App.ts)
      result.subscriptions.dispose();
      if (result.state.colorWheelsHistoryTimer) {
        clearTimeout(result.state.colorWheelsHistoryTimer);
        result.state.colorWheelsHistoryTimer = null;
      }

      // Advance past the debounce window — timer should not fire
      vi.advanceTimersByTime(500);

      expect(result.state.colorWheelsHistoryTimer).toBeNull();
      expect(recordSpy).not.toHaveBeenCalled();

      recordSpy.mockRestore();
    });
  });
});

describe('resolveOCIOBakeSize', () => {
  it('CW-012: uses 65^3 for ACES config', () => {
    expect(
      resolveOCIOBakeSize({
        enabled: true,
        configName: 'aces_1.2',
        customConfigPath: null,
        inputColorSpace: 'Auto',
        detectedColorSpace: null,
        workingColorSpace: 'ACEScg',
        display: 'sRGB',
        view: 'ACES 1.0 SDR-video',
        look: 'None',
        lookDirection: 'forward',
      }),
    ).toBe(ACES_OCIO_BAKE_SIZE);
  });

  it('CW-013: uses 33^3 for non-ACES workflows', () => {
    expect(
      resolveOCIOBakeSize({
        enabled: true,
        configName: 'srgb',
        customConfigPath: null,
        inputColorSpace: 'sRGB',
        detectedColorSpace: null,
        workingColorSpace: 'Linear sRGB',
        display: 'sRGB',
        view: 'Standard',
        look: 'None',
        lookDirection: 'forward',
      }),
    ).toBe(DEFAULT_OCIO_BAKE_SIZE);
  });
});
