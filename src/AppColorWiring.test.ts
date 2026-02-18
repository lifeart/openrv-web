import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  wireColorControls,
  resolveOCIOBakeSize,
  ACES_OCIO_BAKE_SIZE,
  DEFAULT_OCIO_BAKE_SIZE,
} from './AppColorWiring';
import { EventEmitter } from './utils/EventEmitter';

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
  getAdjustments() { return { ...this.adjustments }; }
  setAdjustments(adj: Record<string, number>) { this.adjustments = { ...adj } as any; }
}
class StubCDLControl extends EventEmitter {}
class StubCurvesControl extends EventEmitter {}
class StubOCIOControl extends EventEmitter {
  private _processor = {
    bakeTo3DLUT: vi.fn(() => new Float32Array(65 * 65 * 65 * 3)),
  };
  getProcessor() { return this._processor; }
}
class StubDisplayProfileControl extends EventEmitter {}
class StubGamutMappingControl extends EventEmitter {}
class StubLUTPipelinePanel extends EventEmitter {}

function createMockViewer() {
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
    syncLUTPipeline: vi.fn(),
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
    expect(ctx._viewer.setOCIOBakedLUT).toHaveBeenCalledWith(
      expect.any(Float32Array),
      true,
    );
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

    expect(ctx._controls.gamutDiagram.setColorSpaces).toHaveBeenCalledWith(
      'ACES - ACEScg',
      'ACEScg',
      'sRGB',
    );
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

    expect(ctx._controls.gamutDiagram.setColorSpaces).toHaveBeenCalledWith(
      'Rec.2020',
      'ACEScg',
      'sRGB',
    );
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

    expect(ctx._controls.gamutDiagram.setColorSpaces).toHaveBeenCalledWith(
      'sRGB',
      'ACEScg',
      'sRGB',
    );
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

    expect(state).toHaveProperty('colorHistoryTimer');
    expect(state.colorHistoryTimer).toBeNull();
    expect(state).toHaveProperty('colorHistoryPrevious');
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

      expect(state.colorHistoryTimer).not.toBeNull();

      vi.advanceTimersByTime(500);

      expect(state.colorHistoryTimer).toBeNull();
    });
  });
});

describe('resolveOCIOBakeSize', () => {
  it('CW-012: uses 65^3 for ACES config', () => {
    expect(resolveOCIOBakeSize({
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
    })).toBe(ACES_OCIO_BAKE_SIZE);
  });

  it('CW-013: uses 33^3 for non-ACES workflows', () => {
    expect(resolveOCIOBakeSize({
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
    })).toBe(DEFAULT_OCIO_BAKE_SIZE);
  });
});
