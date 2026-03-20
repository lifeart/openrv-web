/**
 * Regression tests for issues #119, #120, #121, #122 in AppPersistenceManager.
 *
 * #119: saveProject should surface serialization gap warnings to the user
 * #120: syncControlsFromState should sync PAR and background-pattern controls
 * #121: openProject should clear session before importing
 * #122: Saved current-source selection should be restored on load
 */

import { describe, it, expect, vi } from 'vitest';
import { AppPersistenceManager, type PersistenceManagerContext } from './AppPersistenceManager';
import { SessionSerializer } from './core/session/SessionSerializer';
import * as Modal from './ui/components/shared/Modal';

// Mock showAlert and showConfirm
vi.mock('./ui/components/shared/Modal', async () => {
  const actual = await vi.importActual<typeof import('./ui/components/shared/Modal')>('./ui/components/shared/Modal');
  return {
    ...actual,
    showAlert: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(false),
    showFileReloadPrompt: vi.fn().mockResolvedValue(null),
  };
});

function createMockContext(overrides?: Partial<PersistenceManagerContext>): PersistenceManagerContext {
  return {
    session: {
      currentSource: { name: 'test.exr' },
      allSources: [],
      getPlaybackState: vi.fn().mockReturnValue({
        currentFrame: 1,
        inPoint: 1,
        outPoint: 100,
        fps: 24,
        loopMode: 'loop',
        playbackMode: 'forward',
        volume: 0.7,
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
      loadEDL: vi.fn(),
      loadFromGTO: vi.fn(),
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
      getWipeState: () => ({ mode: 'off', position: 0.5, showOriginal: 'left' }),
      getStackLayers: () => [],
      getNoiseReductionParams: () => ({}),
      getWatermarkState: () => ({}),
      getLUT: () => null,
      getLUTIntensity: () => 1.0,
      getPARState: () => ({ enabled: true, par: 1.4667, preset: 'custom' }),
      getBackgroundPatternState: () => ({ pattern: 'checker', checkerSize: 16 }),
      getToneMappingState: () => ({ enabled: true, operator: 'reinhard' }),
      getGhostFrameState: () => ({ enabled: false }),
      getStereoState: () => ({ mode: 'off' }),
      getStereoEyeTransforms: () => ({
        left: { flipH: false, flipV: false, rotation: 0, scale: 1, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1, translateX: 0, translateY: 0 },
      }),
      getStereoAlignMode: () => 'off',
      getChannelMode: () => 'rgb',
      getDifferenceMatteState: () => ({ enabled: false }),
      getBlendModeState: () => ({ mode: 'off' }),
      isOCIOEnabled: () => false,
      getDisplayColorState: () => ({ transferFunction: 'sRGB', displayGamma: 2.2 }),
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
          sources: {},
          displayLUT: { enabled: false, lutName: null, intensity: 1, source: 'manual' },
          activeSourceId: null,
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
      toJSON: () => ({ nextId: 0, show: true, frames: {}, effects: {} }),
      loadFromAnnotations: vi.fn(),
    } as any,
    autoSaveManager: {
      initialize: vi.fn().mockResolvedValue(false),
      markDirty: vi.fn(),
      on: vi.fn(),
    } as any,
    autoSaveIndicator: {
      markUnsaved: vi.fn(),
    } as any,
    snapshotManager: {
      initialize: vi.fn().mockResolvedValue(undefined),
      createSnapshot: vi.fn().mockResolvedValue(undefined),
      createAutoCheckpoint: vi.fn().mockResolvedValue(undefined),
    } as any,
    snapshotPanel: {
      hide: vi.fn(),
    } as any,
    scopesControl: {
      getState: () => ({}),
    } as any,
    colorControls: {
      setAdjustments: vi.fn(),
    } as any,
    cdlControl: {
      setCDL: vi.fn(),
    } as any,
    filterControl: {
      setSettings: vi.fn(),
    } as any,
    transformControl: {
      setTransform: vi.fn(),
    } as any,
    cropControl: {
      setState: vi.fn(),
    } as any,
    lensControl: {
      setParams: vi.fn(),
    } as any,
    ...overrides,
  };
}

describe('AppPersistenceManager - issue #119: saveProject surfaces warnings', () => {
  it('calls showAlert with warning when active serialization gaps exist', async () => {
    const ctx = createMockContext();
    const manager = new AppPersistenceManager(ctx);

    // Mock saveToFile to prevent actual file download
    const saveToFileSpy = vi.spyOn(SessionSerializer, 'saveToFile').mockResolvedValue(undefined);

    await manager.saveProject();

    // The mock viewer has tone mapping active, so there should be gaps
    const showAlertFn = Modal.showAlert as ReturnType<typeof vi.fn>;
    const warningCalls = showAlertFn.mock.calls.filter(
      (call: any[]) => call[1]?.type === 'warning' && call[1]?.title === 'Save Warning',
    );
    expect(warningCalls.length).toBe(1);
    expect(warningCalls[0]![0]).toContain('Tone mapping');

    saveToFileSpy.mockRestore();
  });

  it('does not show warning when no active gaps', async () => {
    const ctx = createMockContext();
    // Override viewer to have no active gaps
    (ctx.viewer as any).getToneMappingState = () => ({ enabled: false, operator: 'off' });
    (ctx.viewer as any).isOCIOEnabled = () => false;
    (ctx.viewer as any).getDisplayColorState = () => ({ transferFunction: 'srgb', displayGamma: 1.0 });

    const manager = new AppPersistenceManager(ctx);
    const saveToFileSpy = vi.spyOn(SessionSerializer, 'saveToFile').mockResolvedValue(undefined);
    const showAlertFn = Modal.showAlert as ReturnType<typeof vi.fn>;
    showAlertFn.mockClear();

    await manager.saveProject();

    const warningCalls = showAlertFn.mock.calls.filter(
      (call: any[]) => call[1]?.type === 'warning' && call[1]?.title === 'Save Warning',
    );
    expect(warningCalls.length).toBe(0);

    saveToFileSpy.mockRestore();
  });
});

describe('AppPersistenceManager - issue #120: syncControlsFromState syncs PAR and background', () => {
  it('syncs PAR control from restored state', async () => {
    const parControl = { setState: vi.fn() };
    const bgControl = { setState: vi.fn() };
    const ctx = createMockContext({
      parControl: parControl as any,
      backgroundPatternControl: bgControl as any,
    });
    const manager = new AppPersistenceManager(ctx);

    // Simulate a snapshot restore which calls syncControlsFromState internally
    const mockState = {
      version: 1,
      name: 'test',
      createdAt: '',
      modifiedAt: '',
      media: [],
      playback: {
        currentFrame: 1,
        inPoint: 1,
        outPoint: 100,
        fps: 24,
        loopMode: 'loop' as const,
        playbackMode: 'forward' as const,
        volume: 0.7,
        muted: false,
        marks: [],
        currentSourceIndex: 0,
      },
      paint: { nextId: 0, show: true, frames: {}, effects: {} },
      view: { zoom: 1, panX: 0, panY: 0 },
      color: {},
      cdl: {},
      filters: {},
      transform: {},
      crop: { enabled: false, region: {} },
      lens: {},
      wipe: { mode: 'off' as const, position: 0.5, showOriginal: 'left' as const },
      stack: [],
      noiseReduction: {},
      watermark: {},
      lutIntensity: 1.0,
      par: { enabled: true, par: 1.4667, preset: 'custom' },
      backgroundPattern: { pattern: 'checker', checkerSize: 16 },
    };

    // We need to test the private syncControlsFromState indirectly.
    // openProject calls it, but that's complex. Instead, use restoreSnapshot flow.
    // Let's use a simpler approach: access the private method via prototype.
    const syncFn = (manager as any).syncControlsFromState.bind(manager);
    syncFn(mockState);

    expect(parControl.setState).toHaveBeenCalledWith({ enabled: true, par: 1.4667, preset: 'custom' });
    expect(bgControl.setState).toHaveBeenCalledWith({ pattern: 'checker', checkerSize: 16 });
  });

  it('handles missing PAR and background controls gracefully', () => {
    const ctx = createMockContext();
    // No parControl or backgroundPatternControl in context
    const manager = new AppPersistenceManager(ctx);

    const syncFn = (manager as any).syncControlsFromState.bind(manager);
    // Should not throw
    expect(() =>
      syncFn({ par: { enabled: true, par: 1.5, preset: 'custom' }, backgroundPattern: { pattern: 'checker' } }),
    ).not.toThrow();
  });
});

describe('SessionSerializer.fromJSON - issue #121: clears session before import', () => {
  it('calls session.clearSources before loading media', async () => {
    const session = {
      clearSources: vi.fn(),
      loadImage: vi.fn().mockResolvedValue(undefined),
      loadVideo: vi.fn().mockResolvedValue(undefined),
      setPlaybackState: vi.fn(),
      noteManager: { fromSerializable: vi.fn() },
      versionManager: { fromSerializable: vi.fn() },
      statusManager: { fromSerializable: vi.fn() },
      setEdlEntries: vi.fn(),
      setCurrentSource: vi.fn(),
    } as any;

    const viewer = {
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
      setLUTIntensity: vi.fn(),
      setPARState: vi.fn(),
      setBackgroundPatternState: vi.fn(),
      setZoom: vi.fn(),
      setPan: vi.fn(),
      getSerializationGaps: () => [],
      getToneMappingState: () => ({ enabled: false, operator: 'off' }),
      getGhostFrameState: () => ({ enabled: false }),
      getStereoState: () => ({ mode: 'off' }),
      getStereoEyeTransforms: () => ({
        left: { flipH: false, flipV: false, rotation: 0, scale: 1, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1, translateX: 0, translateY: 0 },
      }),
      getStereoAlignMode: () => 'off',
      getChannelMode: () => 'rgb',
      getDifferenceMatteState: () => ({ enabled: false }),
      getBlendModeState: () => ({ mode: 'off' }),
      isOCIOEnabled: () => false,
      getDisplayColorState: () => ({ transferFunction: 'sRGB', displayGamma: 2.2 }),
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
          sources: {},
          displayLUT: { enabled: false, lutName: null, intensity: 1, source: 'manual' },
          activeSourceId: null,
        }),
      }),
      resetToneMappingState: vi.fn(),
      resetGhostFrameState: vi.fn(),
      resetStereoState: vi.fn(),
      resetStereoEyeTransforms: vi.fn(),
      resetStereoAlignMode: vi.fn(),
      resetChannelMode: vi.fn(),
      resetDifferenceMatteState: vi.fn(),
      getTimecodeOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getSafeAreasOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getClippingOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getInfoStripOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getSpotlightOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getBugOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getEXRWindowOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getFPSIndicator: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
    } as any;

    const paintEngine = { loadFromAnnotations: vi.fn() } as any;

    const state = SessionSerializer.createEmpty('test');
    state.media = [
      {
        path: 'http://example.com/test.jpg',
        name: 'test.jpg',
        type: 'image',
        width: 100,
        height: 100,
        duration: 0,
        fps: 0,
      },
    ];

    await SessionSerializer.fromJSON(state, { session, paintEngine, viewer });

    // clearSources must have been called
    expect(session.clearSources).toHaveBeenCalled();

    // And media should have been loaded after clearing
    const clearOrder = session.clearSources.mock.invocationCallOrder[0];
    const loadOrder = session.loadImage.mock.invocationCallOrder[0];
    expect(clearOrder).toBeLessThan(loadOrder);
  });
});

describe('Session.setPlaybackState - issue #122: restores currentSourceIndex', () => {
  it('setPlaybackState includes currentSourceIndex in its type signature', () => {
    // This test verifies that the playback state type includes currentSourceIndex
    // The actual restoration happens in Session.setPlaybackState which calls setCurrentSource
    // We verify this via the SessionSerializer flow
    const session = {
      clearSources: vi.fn(),
      loadImage: vi.fn().mockResolvedValue(undefined),
      setPlaybackState: vi.fn(),
      noteManager: { fromSerializable: vi.fn() },
      versionManager: { fromSerializable: vi.fn() },
      statusManager: { fromSerializable: vi.fn() },
      setEdlEntries: vi.fn(),
      setCurrentSource: vi.fn(),
    } as any;

    const viewer = {
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
      setLUTIntensity: vi.fn(),
      setPARState: vi.fn(),
      setBackgroundPatternState: vi.fn(),
      setZoom: vi.fn(),
      setPan: vi.fn(),
      getToneMappingState: () => ({ enabled: false, operator: 'off' }),
      getGhostFrameState: () => ({ enabled: false }),
      getStereoState: () => ({ mode: 'off' }),
      getStereoEyeTransforms: () => ({
        left: { flipH: false, flipV: false, rotation: 0, scale: 1, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1, translateX: 0, translateY: 0 },
      }),
      getStereoAlignMode: () => 'off',
      getChannelMode: () => 'rgb',
      getDifferenceMatteState: () => ({ enabled: false }),
      getBlendModeState: () => ({ mode: 'off' }),
      isOCIOEnabled: () => false,
      getDisplayColorState: () => ({ transferFunction: 'sRGB', displayGamma: 2.2 }),
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
          sources: {},
          displayLUT: { enabled: false, lutName: null, intensity: 1, source: 'manual' },
          activeSourceId: null,
        }),
      }),
      resetToneMappingState: vi.fn(),
      resetGhostFrameState: vi.fn(),
      resetStereoState: vi.fn(),
      resetStereoEyeTransforms: vi.fn(),
      resetStereoAlignMode: vi.fn(),
      resetChannelMode: vi.fn(),
      resetDifferenceMatteState: vi.fn(),
      getTimecodeOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getSafeAreasOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getClippingOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getInfoStripOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getSpotlightOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getBugOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getEXRWindowOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
      getFPSIndicator: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({}), setState: vi.fn() }),
    } as any;

    const paintEngine = { loadFromAnnotations: vi.fn() } as any;

    const state = SessionSerializer.createEmpty('test');
    // Simulate 2 media sources with currentSourceIndex = 1
    state.media = [
      { path: 'http://example.com/a.jpg', name: 'a.jpg', type: 'image', width: 100, height: 100, duration: 0, fps: 0 },
      { path: 'http://example.com/b.jpg', name: 'b.jpg', type: 'image', width: 100, height: 100, duration: 0, fps: 0 },
    ];
    state.playback.currentSourceIndex = 1;

    return SessionSerializer.fromJSON(state, { session, paintEngine, viewer }).then(() => {
      // setPlaybackState should be called with the currentSourceIndex
      expect(session.setPlaybackState).toHaveBeenCalled();
      const playbackArg = session.setPlaybackState.mock.calls[0][0];
      expect(playbackArg.currentSourceIndex).toBe(1);
    });
  });
});
