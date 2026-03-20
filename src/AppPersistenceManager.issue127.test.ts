/**
 * Regression tests for issue #127: Session display name used in project save
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppPersistenceManager, type PersistenceManagerContext } from './AppPersistenceManager';
import { SessionSerializer } from './core/session/SessionSerializer';

vi.mock('./ui/components/shared/Modal', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(async () => false),
}));

function createMockContext(overrides: Partial<PersistenceManagerContext> = {}): PersistenceManagerContext {
  return {
    session: {
      currentSource: { name: 'test.exr' },
      allSources: [],
      metadata: {
        displayName: 'My Review Session',
        comment: '',
        version: 2,
        origin: 'openrv-web',
        creationContext: 0,
        clipboard: 0,
        membershipContains: [],
        realtime: 0,
        bgColor: [0.18, 0.18, 0.18, 1.0],
      },
      getPlaybackState: vi.fn().mockReturnValue({
        currentFrame: 1,
        inPoint: 1,
        outPoint: 100,
        fps: 24,
        loopMode: 'loop',
        playbackMode: 'realtime',
        volume: 1,
        muted: false,
        preservesPitch: true,
        audioScrubEnabled: true,
        marks: [],
        currentSourceIndex: 0,
      }),
      setPlaybackState: vi.fn(),
      clearSources: vi.fn(),
      noteManager: { toSerializable: () => [], fromSerializable: vi.fn() },
      versionManager: { toSerializable: () => [], fromSerializable: vi.fn() },
      statusManager: { toSerializable: () => [], fromSerializable: vi.fn() },
      loadFile: vi.fn(),
      loadImage: vi.fn(),
      loadVideo: vi.fn(),
    } as any,
    viewer: {
      getPan: () => ({ x: 0, y: 0 }),
      getZoom: () => 1,
      getColorAdjustments: () => ({}),
      getCDL: () => ({}),
      getFilterSettings: () => ({}),
      getTransform: () => ({}),
      getCropState: () => ({ enabled: false, region: {} }),
      getLensParams: () => ({}),
      getWipeState: () => ({ mode: 'off', position: 0.5 }),
      getStackLayers: () => [],
      getNoiseReductionParams: () => ({}),
      getWatermarkState: () => ({}),
      getLUT: () => null,
      getLUTIntensity: () => 1.0,
      getPARState: () => ({ enabled: false, par: 1.0, preset: 'square' }),
      getBackgroundPatternState: () => ({ pattern: 'black', checkerSize: 'medium' }),
      getToneMappingState: () => ({ enabled: false, operator: 'off' }),
      getGhostFrameState: () => ({ enabled: false }),
      getStereoState: () => ({ mode: 'off' }),
      getStereoEyeTransforms: () => ({
        left: { flipH: false, flipV: false, rotation: 0, scale: 1, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1, translateX: 0, translateY: 0 },
        linked: true,
      }),
      getStereoAlignMode: () => 'off',
      getChannelMode: () => 'rgb',
      getDifferenceMatteState: () => ({ enabled: false }),
      getBlendModeState: () => ({ mode: 'off' }),
      isOCIOEnabled: () => false,
      getDisplayColorState: () => ({ transferFunction: 'srgb', displayGamma: 1.0 }),
      getGamutMappingState: () => ({ mode: 'off' }),
      getColorInversion: () => false,
      getCurves: () => ({
        master: {
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          enabled: true,
        },
        red: {
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          enabled: true,
        },
        green: {
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          enabled: true,
        },
        blue: {
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
          enabled: true,
        },
      }),
      getDeinterlaceParams: () => ({ method: 'bob', fieldOrder: 'tff', enabled: false }),
      getFilmEmulationParams: () => ({ enabled: false, stock: 'kodak-portra-400', intensity: 1.0 }),
      getPerspectiveParams: () => ({
        enabled: false,
        topLeft: { x: 0, y: 0 },
        topRight: { x: 1, y: 0 },
        bottomRight: { x: 1, y: 1 },
        bottomLeft: { x: 0, y: 1 },
        quality: 'bilinear',
      }),
      getStabilizationParams: () => ({ enabled: false }),
      isUncropActive: () => false,
      getLUTPipeline: () => ({
        getActiveSourceId: () => 'default',
        getSourceConfig: () => ({
          fileLUT: { lutData: null, enabled: false, intensity: 1 },
          lookLUT: { lutData: null, enabled: false, intensity: 1 },
          preCacheLUT: { lutData: null, enabled: false, intensity: 1 },
        }),
        getState: () => ({
          displayLUT: { lutData: null, enabled: false, intensity: 1 },
        }),
        getSerializableState: () => ({
          displayLUT: { lutData: null, enabled: false, intensity: 1 },
        }),
      }),
      setColorAdjustments: vi.fn(),
      setCDL: vi.fn(),
      setFilterSettings: vi.fn(),
      setTransform: vi.fn(),
      setCropState: vi.fn(),
      setLensParams: vi.fn(),
      setWipeState: vi.fn(),
      setStackLayers: vi.fn(),
      setNoiseReductionParams: vi.fn(),
      setWatermarkState: vi.fn(),
      getTimecodeOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getSafeAreasOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getClippingOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getInfoStripOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getSpotlightOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getBugOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getEXRWindowOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getFPSIndicator: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      setLUTIntensity: vi.fn(),
      setPARState: vi.fn(),
      setBackgroundPatternState: vi.fn(),
      setZoom: vi.fn(),
      setPan: vi.fn(),
    } as any,
    paintEngine: {
      toJSON: () => ({ nextId: 1, show: true, frames: {}, effects: {} }),
    } as any,
    autoSaveManager: {
      on: vi.fn(() => vi.fn()),
      initialize: vi.fn(async () => false),
      markDirty: vi.fn(),
    } as any,
    autoSaveIndicator: {
      markUnsaved: vi.fn(),
      markSaved: vi.fn(),
    } as any,
    snapshotManager: {
      initialize: vi.fn(async () => {}),
      createAutoCheckpoint: vi.fn(async () => {}),
    } as any,
    snapshotPanel: { hide: vi.fn() } as any,
    scopesControl: { getState: () => ({}) } as any,
    colorControls: { setAdjustments: vi.fn() } as any,
    cdlControl: { setCDL: vi.fn() } as any,
    filterControl: { setSettings: vi.fn() } as any,
    transformControl: { setTransform: vi.fn() } as any,
    cropControl: { setState: vi.fn() } as any,
    lensControl: { setParams: vi.fn() } as any,
    ...overrides,
  };
}

describe('Issue #127: session display name used in project save', () => {
  let saveToFileSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    saveToFileSpy = vi.spyOn(SessionSerializer, 'saveToFile').mockResolvedValue(undefined);
  });

  afterEach(() => {
    saveToFileSpy.mockRestore();
  });

  it('ISS-127-001: saveProject uses session displayName for project name', async () => {
    const ctx = createMockContext();
    const manager = new AppPersistenceManager(ctx);

    await manager.saveProject();

    // toJSON should have been called with the display name
    expect(saveToFileSpy).toHaveBeenCalledTimes(1);
    const [state, filename] = saveToFileSpy.mock.calls[0]!;
    expect((state as any).name).toBe('My Review Session');
    expect(filename).toBe('My Review Session.orvproject');
  });

  it('ISS-127-002: saveProject falls back to "project" when displayName is empty', async () => {
    const ctx = createMockContext();
    (ctx.session as any).metadata.displayName = '';
    const manager = new AppPersistenceManager(ctx);

    await manager.saveProject();

    expect(saveToFileSpy).toHaveBeenCalledTimes(1);
    const [state, filename] = saveToFileSpy.mock.calls[0]!;
    expect((state as any).name).toBe('project');
    expect(filename).toBe('project.orvproject');
  });

  it('ISS-127-003: saveProject falls back to "project" when metadata is undefined', async () => {
    const ctx = createMockContext();
    (ctx.session as any).metadata = undefined;
    const manager = new AppPersistenceManager(ctx);

    await manager.saveProject();

    expect(saveToFileSpy).toHaveBeenCalledTimes(1);
    const [_state, filename] = saveToFileSpy.mock.calls[0]!;
    expect(filename).toBe('project.orvproject');
  });
});
