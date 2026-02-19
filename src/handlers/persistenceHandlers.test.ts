/**
 * Persistence Handlers Tests
 *
 * Tests for bindPersistenceHandlers: GTO persistence, annotations loading,
 * paint effects, matte settings, metadata, and settings restoration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindPersistenceHandlers } from './persistenceHandlers';
import type { SessionBridgeContext } from '../AppSessionBridge';
import type { Session, SessionEvents } from '../core/session/Session';

type EventHandlers = Partial<Record<keyof SessionEvents, (data: any) => void>>;

function createMockSession(): Session {
  return {
    gtoData: null,
    currentSource: { width: 1920, height: 1080 },
  } as unknown as Session;
}

function createMockOn(): {
  on: <K extends keyof SessionEvents>(
    session: Session,
    event: K,
    handler: (data: SessionEvents[K]) => void
  ) => void;
  handlers: EventHandlers;
} {
  const handlers: EventHandlers = {};
  const on = <K extends keyof SessionEvents>(
    _session: Session,
    event: K,
    handler: (data: SessionEvents[K]) => void
  ): void => {
    handlers[event] = handler as (data: any) => void;
  };
  return { on, handlers };
}

function createMockContext(): SessionBridgeContext {
  const paintEngine = {
    loadFromAnnotations: vi.fn(),
    setGhostMode: vi.fn(),
    setHoldMode: vi.fn(),
  };
  const persistenceManager = {
    syncGTOStore: vi.fn(),
    setGTOStore: vi.fn(),
  };
  const matteOverlay = { setSettings: vi.fn() };
  const viewer = {
    getMatteOverlay: () => matteOverlay,
    setTransform: vi.fn(),
    setNoiseReductionParams: vi.fn(),
  };
  const colorControls = { setAdjustments: vi.fn() };
  const filterControl = { setSettings: vi.fn() };
  const noiseReductionControl = { setParams: vi.fn() };
  const cdlControl = { setCDL: vi.fn() };
  const transformControl = { setTransform: vi.fn() };
  const lensControl = { setParams: vi.fn() };
  const cropControl = { setState: vi.fn(), setUncropState: vi.fn() };
  const channelSelect = { setChannel: vi.fn() };
  const stereoControl = { setState: vi.fn() };
  const stereoEyeTransformControl = { setState: vi.fn() };
  const stereoAlignControl = { setMode: vi.fn() };
  const scopesControl = { setScopeVisible: vi.fn() };
  const histogram = { show: vi.fn(), hide: vi.fn() };
  const waveform = { show: vi.fn(), hide: vi.fn() };
  const vectorscope = { show: vi.fn(), hide: vi.fn() };
  const gamutDiagram = { show: vi.fn(), hide: vi.fn() };

  return {
    getSession: () => createMockSession(),
    getPaintEngine: () => paintEngine,
    getPersistenceManager: () => persistenceManager,
    getViewer: () => viewer,
    getColorControls: () => colorControls,
    getFilterControl: () => filterControl,
    getNoiseReductionControl: () => noiseReductionControl,
    getCDLControl: () => cdlControl,
    getTransformControl: () => transformControl,
    getLensControl: () => lensControl,
    getCropControl: () => cropControl,
    getChannelSelect: () => channelSelect,
    getStereoControl: () => stereoControl,
    getStereoEyeTransformControl: () => stereoEyeTransformControl,
    getStereoAlignControl: () => stereoAlignControl,
    getScopesControl: () => scopesControl,
    getHistogram: () => histogram,
    getWaveform: () => waveform,
    getVectorscope: () => vectorscope,
    getGamutDiagram: () => gamutDiagram,
  } as unknown as SessionBridgeContext;
}

describe('bindPersistenceHandlers', () => {
  let context: SessionBridgeContext;
  let session: Session;
  let handlers: EventHandlers;
  let updateHistogram: ReturnType<typeof vi.fn>;
  let updateWaveform: ReturnType<typeof vi.fn>;
  let updateVectorscope: ReturnType<typeof vi.fn>;
  let updateGamutDiagram: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    context = createMockContext();
    session = createMockSession();
    const mockOn = createMockOn();
    handlers = mockOn.handlers;
    updateHistogram = vi.fn();
    updateWaveform = vi.fn();
    updateVectorscope = vi.fn();
    updateGamutDiagram = vi.fn();

    bindPersistenceHandlers(context, session, mockOn.on, updateHistogram, updateWaveform, updateVectorscope, updateGamutDiagram);
  });

  it('PERH-U001: registers annotationsLoaded handler', () => {
    expect(handlers.annotationsLoaded).toBeDefined();
  });

  it('PERH-U002: annotationsLoaded loads annotations into paint engine and syncs GTO', () => {
    const annotations = [{ id: 1 }];
    const effects = { ghost: true };
    handlers.annotationsLoaded!({ annotations, effects });

    expect(context.getPaintEngine().loadFromAnnotations).toHaveBeenCalledWith(annotations, effects);
    expect(context.getPersistenceManager().syncGTOStore).toHaveBeenCalled();
  });

  it('PERH-U003: registers sessionLoaded handler', () => {
    expect(handlers.sessionLoaded).toBeDefined();
  });

  it('PERH-U004: sessionLoaded sets GTO store when gtoData exists', () => {
    const gtoData = { version: 1 };
    (session as any).gtoData = gtoData;

    handlers.sessionLoaded!(undefined as any);

    expect(context.getPersistenceManager().setGTOStore).toHaveBeenCalled();
    expect(context.getPersistenceManager().syncGTOStore).toHaveBeenCalled();
  });

  it('PERH-U005: sessionLoaded does not set GTO store when no gtoData', () => {
    (session as any).gtoData = null;

    handlers.sessionLoaded!(undefined as any);

    expect(context.getPersistenceManager().setGTOStore).not.toHaveBeenCalled();
  });

  it('PERH-U006: frameChanged syncs GTO store', () => {
    expect(handlers.frameChanged).toBeDefined();
    handlers.frameChanged!(0 as any);

    expect(context.getPersistenceManager().syncGTOStore).toHaveBeenCalled();
  });

  it('PERH-U007: inOutChanged syncs GTO store', () => {
    expect(handlers.inOutChanged).toBeDefined();
    handlers.inOutChanged!({ inPoint: 0, outPoint: 100 } as any);

    expect(context.getPersistenceManager().syncGTOStore).toHaveBeenCalled();
  });

  it('PERH-U008: marksChanged syncs GTO store', () => {
    expect(handlers.marksChanged).toBeDefined();
    handlers.marksChanged!(new Map() as any);

    expect(context.getPersistenceManager().syncGTOStore).toHaveBeenCalled();
  });

  it('PERH-U009: fpsChanged syncs GTO store', () => {
    expect(handlers.fpsChanged).toBeDefined();
    handlers.fpsChanged!(24 as any);

    expect(context.getPersistenceManager().syncGTOStore).toHaveBeenCalled();
  });

  it('PERH-U010: paintEffectsLoaded sets ghost mode when ghost is defined', () => {
    expect(handlers.paintEffectsLoaded).toBeDefined();
    handlers.paintEffectsLoaded!({ ghost: true, ghostBefore: 5, ghostAfter: 7 });

    expect(context.getPaintEngine().setGhostMode).toHaveBeenCalledWith(true, 5, 7);
  });

  it('PERH-U011: paintEffectsLoaded uses default ghost before/after when not provided', () => {
    handlers.paintEffectsLoaded!({ ghost: true });

    expect(context.getPaintEngine().setGhostMode).toHaveBeenCalledWith(true, 3, 3);
  });

  it('PERH-U012: paintEffectsLoaded sets hold mode when hold is defined', () => {
    handlers.paintEffectsLoaded!({ hold: true });

    expect(context.getPaintEngine().setHoldMode).toHaveBeenCalledWith(true);
  });

  it('PERH-U013: paintEffectsLoaded does not set ghost mode when ghost is undefined', () => {
    handlers.paintEffectsLoaded!({ hold: false });

    expect(context.getPaintEngine().setGhostMode).not.toHaveBeenCalled();
  });

  it('PERH-U014: matteChanged sets matte overlay settings', () => {
    expect(handlers.matteChanged).toBeDefined();
    const settings = { show: true, aspect: 2.35, opacity: 0.8, heightVisible: -1, centerPoint: [0, 0] };
    handlers.matteChanged!(settings as any);

    expect(context.getViewer().getMatteOverlay().setSettings).toHaveBeenCalledWith(settings);
  });

  it('PERH-U015: metadataChanged is registered and does not throw', () => {
    expect(handlers.metadataChanged).toBeDefined();
    expect(() => {
      handlers.metadataChanged!({ displayName: 'Test Session' } as any);
    }).not.toThrow();
  });

  it('PERH-U016: settingsLoaded restores color adjustments', () => {
    expect(handlers.settingsLoaded).toBeDefined();
    handlers.settingsLoaded!({ colorAdjustments: { gamma: 1.5 } } as any);

    expect(context.getColorControls().setAdjustments).toHaveBeenCalledWith({ gamma: 1.5 });
  });

  it('PERH-U017: settingsLoaded restores filter settings', () => {
    const filterSettings = { enabled: true };
    handlers.settingsLoaded!({ filterSettings } as any);

    expect(context.getFilterControl().setSettings).toHaveBeenCalledWith(filterSettings);
  });

  it('PERH-U018: settingsLoaded restores CDL', () => {
    const cdl = { slope: [1, 1, 1], offset: [0, 0, 0], power: [1, 1, 1], saturation: 1 };
    handlers.settingsLoaded!({ cdl } as any);

    expect(context.getCDLControl().setCDL).toHaveBeenCalledWith(cdl);
  });

  it('PERH-U018b: settingsLoaded restores noise reduction on viewer and control', () => {
    const noiseReduction = { strength: 40, luminanceStrength: 55, chromaStrength: 70, radius: 3 };
    handlers.settingsLoaded!({ noiseReduction } as any);

    expect(context.getViewer().setNoiseReductionParams).toHaveBeenCalledWith(noiseReduction);
    expect(context.getNoiseReductionControl!().setParams).toHaveBeenCalledWith(noiseReduction);
  });

  it('PERH-U019: settingsLoaded restores transform on both control and viewer', () => {
    const transform = { x: 10, y: 20 };
    handlers.settingsLoaded!({ transform } as any);

    expect(context.getTransformControl().setTransform).toHaveBeenCalledWith(transform);
    expect(context.getViewer().setTransform).toHaveBeenCalledWith(transform);
  });

  it('PERH-U020: settingsLoaded restores lens params', () => {
    const lens = { k1: 0.1 };
    handlers.settingsLoaded!({ lens } as any);

    expect(context.getLensControl().setParams).toHaveBeenCalledWith(lens);
  });

  it('PERH-U021: settingsLoaded restores crop state', () => {
    const crop = { enabled: true };
    handlers.settingsLoaded!({ crop } as any);

    expect(context.getCropControl().setState).toHaveBeenCalledWith(crop);
  });

  it('PERH-U035: settingsLoaded restores uncrop state by converting to padding format', () => {
    handlers.settingsLoaded!({
      uncrop: { active: true, x: 100, y: 50, width: 2120, height: 1180 },
    } as any);

    expect(context.getCropControl().setUncropState).toHaveBeenCalledWith({
      enabled: true,
      paddingMode: 'per-side',
      padding: 0,
      paddingTop: 50,
      paddingRight: 100,   // 2120 - 1920 - 100
      paddingBottom: 50,   // 1180 - 1080 - 50
      paddingLeft: 100,
    });
  });

  it('PERH-U036: settingsLoaded does not apply uncrop when active is false', () => {
    handlers.settingsLoaded!({
      uncrop: { active: false, x: 100, y: 50, width: 2120, height: 1180 },
    } as any);

    expect(context.getCropControl().setUncropState).not.toHaveBeenCalled();
  });

  it('PERH-U022: settingsLoaded restores channel mode', () => {
    handlers.settingsLoaded!({ channelMode: 'red' } as any);

    expect(context.getChannelSelect().setChannel).toHaveBeenCalledWith('red');
  });

  it('PERH-U023: settingsLoaded restores stereo state', () => {
    const stereo = { enabled: true };
    handlers.settingsLoaded!({ stereo } as any);

    expect(context.getStereoControl().setState).toHaveBeenCalledWith(stereo);
  });

  it('PERH-U024: settingsLoaded restores stereo eye transform', () => {
    const stereoEyeTransform = { scale: 1 };
    handlers.settingsLoaded!({ stereoEyeTransform } as any);

    expect(context.getStereoEyeTransformControl().setState).toHaveBeenCalledWith(stereoEyeTransform);
  });

  it('PERH-U025: settingsLoaded restores stereo align mode', () => {
    handlers.settingsLoaded!({ stereoAlignMode: 'horizontal' } as any);

    expect(context.getStereoAlignControl().setMode).toHaveBeenCalledWith('horizontal');
  });

  it('PERH-U026: settingsLoaded restores scopes visibility - shows histogram', () => {
    handlers.settingsLoaded!({
      scopes: { histogram: true, waveform: false, vectorscope: false },
    } as any);

    expect(context.getHistogram().show).toHaveBeenCalled();
    expect(updateHistogram).toHaveBeenCalled();
    expect(context.getScopesControl().setScopeVisible).toHaveBeenCalledWith('histogram', true);
  });

  it('PERH-U027: settingsLoaded hides histogram when not visible', () => {
    handlers.settingsLoaded!({
      scopes: { histogram: false, waveform: false, vectorscope: false },
    } as any);

    expect(context.getHistogram().hide).toHaveBeenCalled();
    expect(context.getScopesControl().setScopeVisible).toHaveBeenCalledWith('histogram', false);
  });

  it('PERH-U028: settingsLoaded shows waveform and updates it', () => {
    handlers.settingsLoaded!({
      scopes: { histogram: false, waveform: true, vectorscope: false },
    } as any);

    expect(context.getWaveform().show).toHaveBeenCalled();
    expect(updateWaveform).toHaveBeenCalled();
    expect(context.getScopesControl().setScopeVisible).toHaveBeenCalledWith('waveform', true);
  });

  it('PERH-U029: settingsLoaded shows vectorscope and updates it', () => {
    handlers.settingsLoaded!({
      scopes: { histogram: false, waveform: false, vectorscope: true },
    } as any);

    expect(context.getVectorscope().show).toHaveBeenCalled();
    expect(updateVectorscope).toHaveBeenCalled();
    expect(context.getScopesControl().setScopeVisible).toHaveBeenCalledWith('vectorscope', true);
  });

  it('PERH-U032: settingsLoaded shows gamutDiagram and updates it', () => {
    handlers.settingsLoaded!({
      scopes: { histogram: false, waveform: false, vectorscope: false, gamutDiagram: true },
    } as any);

    expect(context.getGamutDiagram().show).toHaveBeenCalled();
    expect(updateGamutDiagram).toHaveBeenCalled();
    expect(context.getScopesControl().setScopeVisible).toHaveBeenCalledWith('gamutDiagram', true);
  });

  it('PERH-U033: settingsLoaded hides gamutDiagram when not visible', () => {
    handlers.settingsLoaded!({
      scopes: { histogram: false, waveform: false, vectorscope: false, gamutDiagram: false },
    } as any);

    expect(context.getGamutDiagram().hide).toHaveBeenCalled();
    expect(context.getScopesControl().setScopeVisible).toHaveBeenCalledWith('gamutDiagram', false);
  });

  it('PERH-U034: settingsLoaded handles old settings without gamutDiagram property', () => {
    // Simulates loading a session saved before gamutDiagram was added
    handlers.settingsLoaded!({
      scopes: { histogram: true, waveform: false, vectorscope: false },
    } as any);

    // histogram should show
    expect(context.getHistogram().show).toHaveBeenCalled();
    expect(context.getScopesControl().setScopeVisible).toHaveBeenCalledWith('histogram', true);
    // gamutDiagram.show should NOT be called (undefined is falsy → hides instead)
    expect(context.getGamutDiagram().show).not.toHaveBeenCalled();
    expect(context.getGamutDiagram().hide).toHaveBeenCalled();
    expect(context.getScopesControl().setScopeVisible).toHaveBeenCalledWith('gamutDiagram', undefined);
  });

  it('PERH-U030: settingsLoaded syncs GTO store after applying settings', () => {
    handlers.settingsLoaded!({ colorAdjustments: { gamma: 1.0 } } as any);

    expect(context.getPersistenceManager().syncGTOStore).toHaveBeenCalled();
  });

  it('PERH-U031: settingsLoaded with empty settings still syncs GTO store', () => {
    handlers.settingsLoaded!({} as any);

    expect(context.getPersistenceManager().syncGTOStore).toHaveBeenCalled();
  });
});
