/**
 * AppEffectsWiring Unit Tests
 *
 * Tests for wireEffectsControls which connects filter, crop, and lens
 * controls to the viewer, session bridge, and persistence manager.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wireEffectsControls } from './AppEffectsWiring';
import { EventEmitter } from './utils/EventEmitter';
import type { AppWiringContext } from './AppWiringContext';

// Helper to create a mock AppWiringContext with EventEmitter-based controls
function createMockContext() {
  const filterControl = new EventEmitter();
  const cropControl = Object.assign(new EventEmitter(), {
    setCropRegion: vi.fn(),
  });
  const lensControl = new EventEmitter();
  const deinterlaceControl = new EventEmitter();
  const filmEmulationControl = new EventEmitter();
  const stabilizationControl = new EventEmitter();
  const noiseReductionControl = Object.assign(new EventEmitter(), {
    getParams: vi.fn(() => ({ strength: 0, luminanceStrength: 50, chromaStrength: 75, radius: 2 })),
  });
  const watermarkControl = Object.assign(new EventEmitter(), {
    getState: vi.fn(() => ({
      enabled: false,
      imageUrl: null,
      position: 'bottom-right',
      customX: 0.9,
      customY: 0.9,
      scale: 1,
      opacity: 0.7,
      margin: 20,
    })),
  });
  const perspectiveCorrectionControl = Object.assign(new EventEmitter(), {
    setParams: vi.fn(),
  });
  const perspectiveGridOverlay = new EventEmitter();

  let capturedCropRegionCallback: ((region: unknown) => void) | null = null;

  const viewer = {
    setFilterSettings: vi.fn(),
    setCropState: vi.fn(),
    setCropEnabled: vi.fn(),
    setCropPanelOpen: vi.fn(),
    setUncropState: vi.fn(),
    setLensParams: vi.fn(),
    setDeinterlaceParams: vi.fn(),
    setFilmEmulationParams: vi.fn(),
    setStabilizationParams: vi.fn(),
    setNoiseReductionParams: vi.fn(),
    setWatermarkState: vi.fn(),
    setPerspectiveParams: vi.fn(),
    getPerspectiveGridOverlay: vi.fn(() => perspectiveGridOverlay),
    setOnCropRegionChanged: vi.fn((cb: (region: unknown) => void) => {
      capturedCropRegionCallback = cb;
    }),
  };

  const sessionBridge = {
    scheduleUpdateScopes: vi.fn(),
  };

  const persistenceManager = {
    syncGTOStore: vi.fn(),
  };

  const ctx = {
    viewer,
    controls: {
      filterControl,
      cropControl,
      lensControl,
      deinterlaceControl,
      filmEmulationControl,
      stabilizationControl,
      noiseReductionControl,
      watermarkControl,
      perspectiveCorrectionControl,
    },
    sessionBridge,
    persistenceManager,
  } as unknown as AppWiringContext;

  return {
    ctx,
    viewer,
    filterControl,
    cropControl,
    lensControl,
    deinterlaceControl,
    filmEmulationControl,
    stabilizationControl,
    noiseReductionControl,
    watermarkControl,
    perspectiveCorrectionControl,
    perspectiveGridOverlay,
    sessionBridge,
    persistenceManager,
    getCapturedCropRegionCallback: () => capturedCropRegionCallback,
  };
}

describe('wireEffectsControls', () => {
  let mock: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    mock = createMockContext();
    wireEffectsControls(mock.ctx);
  });

  it('EW-001: filtersChanged calls viewer.setFilterSettings + scheduleUpdateScopes + syncGTOStore', () => {
    const settings = { blur: 5, sharpen: 10 };
    mock.filterControl.emit('filtersChanged', settings);

    expect(mock.viewer.setFilterSettings).toHaveBeenCalledWith(settings);
    expect(mock.sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
    expect(mock.persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('EW-002: cropStateChanged calls viewer.setCropState + syncGTOStore', () => {
    const state = { enabled: true, region: { x: 0.1, y: 0.2, width: 0.5, height: 0.5 } };
    mock.cropControl.emit('cropStateChanged', state);

    expect(mock.viewer.setCropState).toHaveBeenCalledWith(state);
    expect(mock.persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('EW-003: cropModeToggled calls viewer.setCropEnabled', () => {
    mock.cropControl.emit('cropModeToggled', true);

    expect(mock.viewer.setCropEnabled).toHaveBeenCalledWith(true);
  });

  it('EW-004: panelToggled calls viewer.setCropPanelOpen', () => {
    mock.cropControl.emit('panelToggled', true);

    expect(mock.viewer.setCropPanelOpen).toHaveBeenCalledWith(true);
  });

  it('EW-005: uncropStateChanged calls viewer.setUncropState + syncGTOStore', () => {
    const state = { enabled: true, padding: 20 };
    mock.cropControl.emit('uncropStateChanged', state);

    expect(mock.viewer.setUncropState).toHaveBeenCalledWith(state);
    expect(mock.persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('EW-006: viewer.setOnCropRegionChanged callback calls cropControl.setCropRegion', () => {
    const callback = mock.getCapturedCropRegionCallback();
    expect(callback).not.toBeNull();

    const region = { x: 0.1, y: 0.2, width: 0.6, height: 0.7 };
    callback!(region);

    expect(mock.cropControl.setCropRegion).toHaveBeenCalledWith(region);
  });

  it('EW-007: bidirectional crop: viewer crop change updates control + syncGTOStore', () => {
    const callback = mock.getCapturedCropRegionCallback();
    expect(callback).not.toBeNull();

    const region = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    callback!(region);

    expect(mock.cropControl.setCropRegion).toHaveBeenCalledWith(region);
    expect(mock.persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('EW-008: lensChanged calls viewer.setLensParams + scheduleUpdateScopes + syncGTOStore', () => {
    const params = { k1: 0.5, k2: 0.1, centerX: 0, centerY: 0, scale: 1 };
    mock.lensControl.emit('lensChanged', params);

    expect(mock.viewer.setLensParams).toHaveBeenCalledWith(params);
    expect(mock.sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
    expect(mock.persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('EW-009: deinterlaceChanged calls viewer.setDeinterlaceParams + scheduleUpdateScopes + syncGTOStore', () => {
    const params = { method: 'bob', fieldOrder: 'tff', enabled: true };
    mock.deinterlaceControl.emit('deinterlaceChanged', params);

    expect(mock.viewer.setDeinterlaceParams).toHaveBeenCalledWith(params);
    expect(mock.sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
    expect(mock.persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('EW-010: filmEmulationChanged calls viewer.setFilmEmulationParams + scheduleUpdateScopes + syncGTOStore', () => {
    const params = { enabled: true, stock: 'kodak-portra-400', intensity: 80, grainIntensity: 30, grainSeed: 42 };
    mock.filmEmulationControl.emit('filmEmulationChanged', params);

    expect(mock.viewer.setFilmEmulationParams).toHaveBeenCalledWith(params);
    expect(mock.sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
    expect(mock.persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('EW-011: perspectiveChanged calls viewer.setPerspectiveParams + scheduleUpdateScopes + syncGTOStore', () => {
    const params = {
      enabled: true,
      topLeft: { x: 0.1, y: 0.1 },
      topRight: { x: 0.9, y: 0.0 },
      bottomRight: { x: 1.0, y: 1.0 },
      bottomLeft: { x: 0.0, y: 0.9 },
      quality: 'bilinear',
    };
    mock.perspectiveCorrectionControl.emit('perspectiveChanged', params);

    expect(mock.viewer.setPerspectiveParams).toHaveBeenCalledWith(params);
    expect(mock.sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
    expect(mock.persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('EW-012: overlay cornersChanged calls control.setParams + viewer.setPerspectiveParams', () => {
    const params = {
      enabled: true,
      topLeft: { x: 0.15, y: 0.1 },
      topRight: { x: 0.85, y: 0.05 },
      bottomRight: { x: 0.9, y: 0.95 },
      bottomLeft: { x: 0.05, y: 0.9 },
      quality: 'bilinear',
    };
    mock.perspectiveGridOverlay.emit('cornersChanged', params);

    expect(mock.perspectiveCorrectionControl.setParams).toHaveBeenCalledWith(params);
    expect(mock.viewer.setPerspectiveParams).toHaveBeenCalledWith(params);
    expect(mock.sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
    expect(mock.persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('EW-013: stabilizationChanged calls viewer.setStabilizationParams + scheduleUpdateScopes + syncGTOStore', () => {
    const params = { enabled: true, smoothingStrength: 75, cropAmount: 16 };
    mock.stabilizationControl.emit('stabilizationChanged', params);

    expect(mock.viewer.setStabilizationParams).toHaveBeenCalledWith(params);
    expect(mock.sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
    expect(mock.persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('EW-014: noise reduction paramsChanged calls viewer.setNoiseReductionParams', () => {
    const params = { strength: 35, luminanceStrength: 40, chromaStrength: 50, radius: 3 };
    mock.noiseReductionControl.emit('paramsChanged', params);

    expect(mock.viewer.setNoiseReductionParams).toHaveBeenCalledWith(params);
    expect(mock.sessionBridge.scheduleUpdateScopes).toHaveBeenCalled();
    expect(mock.persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('EW-015: watermark stateChanged calls viewer.setWatermarkState + syncGTOStore', () => {
    const state = {
      enabled: true,
      imageUrl: 'blob:test',
      position: 'top-left',
      customX: 0.1,
      customY: 0.1,
      scale: 0.5,
      opacity: 0.6,
      margin: 8,
    };
    mock.watermarkControl.emit('stateChanged', state);

    expect(mock.viewer.setWatermarkState).toHaveBeenCalledWith(state);
    expect(mock.persistenceManager.syncGTOStore).toHaveBeenCalled();
  });

  it('EW-016: initializes viewer noise/watermark state from control defaults', () => {
    expect(mock.viewer.setNoiseReductionParams).toHaveBeenCalledWith(mock.noiseReductionControl.getParams());
    expect(mock.viewer.setWatermarkState).toHaveBeenCalledWith(mock.watermarkControl.getState());
  });
});
