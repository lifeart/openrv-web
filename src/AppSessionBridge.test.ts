import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppSessionBridge, type SessionBridgeContext } from './AppSessionBridge';
import { EventEmitter } from './utils/EventEmitter';

// ---------------------------------------------------------------------------
// Mocks for handler modules - we mock the handler modules since they have
// complex DOM/session dependencies. The bridge itself is a thin coordinator
// that delegates to these handlers.
// ---------------------------------------------------------------------------

vi.mock('./handlers/scopeHandlers', () => {
  const updateHistogram = vi.fn();
  const updateWaveform = vi.fn();
  const updateVectorscope = vi.fn();
  const updateGamutDiagram = vi.fn();
  const computeHistogramData = vi.fn(() => null);
  const createScopeScheduler = vi.fn((_ctx: any, options?: any) => {
    let pending = false;
    return {
      schedule: vi.fn(() => {
        pending = true;
        // Synchronously invoke for testing
        pending = false;
        if (options?.onHistogramData) {
          options.onHistogramData({ r: [], g: [], b: [], luma: [] });
        }
      }),
      isPending: () => pending,
    };
  });
  return {
    updateHistogram,
    updateWaveform,
    updateVectorscope,
    updateGamutDiagram,
    computeHistogramData,
    createScopeScheduler,
  };
});

vi.mock('./handlers/infoPanelHandlers', () => ({
  updateInfoPanel: vi.fn(),
  formatTimecode: vi.fn((frame: number, fps: number) => {
    if (fps <= 0) return '00:00:00:00';
    const totalSeconds = frame / fps;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = Math.floor(frame % fps);
    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0'),
      frames.toString().padStart(2, '0'),
    ].join(':');
  }),
  formatDuration: vi.fn((seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }),
}));

vi.mock('./handlers/sourceLoadedHandlers', () => ({
  handleSourceLoaded: vi.fn(
    (
      _ctx: any,
      updateInfoPanel: () => void,
      updateStackControlSources: () => void,
      updateEXRLayers: () => void,
      _updateHistogram: () => void,
      _updateWaveform: () => void,
      _updateVectorscope: () => void,
      _updateGamutDiagram: () => void,
    ) => {
      // Call the passed-in callbacks synchronously in tests
      updateInfoPanel();
      updateStackControlSources();
      updateEXRLayers();
    }
  ),
  updateStackControlSources: vi.fn(),
  updateEXRLayers: vi.fn(),
  handleEXRLayerChange: vi.fn(async () => {}),
}));

vi.mock('./handlers/playbackHandlers', () => ({
  handlePlaybackChanged: vi.fn(),
}));

vi.mock('./handlers/persistenceHandlers', () => ({
  bindPersistenceHandlers: vi.fn(),
}));

vi.mock('./handlers/compareHandlers', () => ({
  bindCompareHandlers: vi.fn(),
}));

vi.mock('./handlers/unsupportedCodecModal', () => ({
  showUnsupportedCodecModal: vi.fn(),
}));

// Import the mocked handlers so we can assert on them
import {
  updateHistogram as _updateHistogram,
  updateWaveform as _updateWaveform,
  updateVectorscope as _updateVectorscope,
  updateGamutDiagram as _updateGamutDiagram,
  computeHistogramData as _computeHistogramData,
  createScopeScheduler,
} from './handlers/scopeHandlers';
import {
  updateInfoPanel as _updateInfoPanel,
  formatTimecode as _formatTimecode,
  formatDuration as _formatDuration,
} from './handlers/infoPanelHandlers';
import {
  handleSourceLoaded,
  updateStackControlSources as _updateStackControlSources,
  updateEXRLayers as _updateEXRLayers,
  handleEXRLayerChange as _handleEXRLayerChange,
} from './handlers/sourceLoadedHandlers';
import { handlePlaybackChanged } from './handlers/playbackHandlers';
import { bindPersistenceHandlers } from './handlers/persistenceHandlers';
import { bindCompareHandlers } from './handlers/compareHandlers';
import { showUnsupportedCodecModal } from './handlers/unsupportedCodecModal';

// ---------------------------------------------------------------------------
// Mock Session with EventEmitter
// ---------------------------------------------------------------------------

class MockSession extends EventEmitter {
  currentFrame = 1;
  currentSource = null;
  fps = 24;
  currentSourceIndex = 0;
  allSources: any[] = [];
  abCompareAvailable = false;
  currentAB = 'A';
  gtoData = null;
  playDirection = 1;
}

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

function createContext() {
  const session = new MockSession();
  const viewer = { getScopeImageData: vi.fn(() => null), initPrerenderBuffer: vi.fn() };
  const histogram = {
    isVisible: vi.fn(() => false),
    getData: vi.fn(() => null),
    update: vi.fn(),
    updateHDR: vi.fn(),
    isHDRActive: vi.fn(() => false),
    setPlaybackMode: vi.fn(),
    calculate: vi.fn(),
    calculateHDR: vi.fn(),
    setHDRMode: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
  };
  const waveform = { isVisible: vi.fn(() => false), update: vi.fn(), setPlaybackMode: vi.fn(), show: vi.fn(), hide: vi.fn() };
  const vectorscope = { isVisible: vi.fn(() => false), update: vi.fn(), setPlaybackMode: vi.fn(), show: vi.fn(), hide: vi.fn() };
  const gamutDiagram = { isVisible: vi.fn(() => false), update: vi.fn(), show: vi.fn(), hide: vi.fn() };
  const scopesControl = { setScopeVisible: vi.fn(), getState: vi.fn() };
  const infoPanel = { update: vi.fn() };
  const channelSelect = { setEXRLayers: vi.fn(), clearEXRLayers: vi.fn(), setChannel: vi.fn() };
  const stackControl = { setAvailableSources: vi.fn() };
  const cropControl = { setSourceDimensions: vi.fn(), setState: vi.fn(), setUncropState: vi.fn() };
  const ocioControl = { getProcessor: vi.fn(() => ({ setActiveSource: vi.fn(), detectColorSpaceFromExtension: vi.fn() })) };
  const toneMappingControl = { setState: vi.fn() };
  const colorControls = { setAdjustments: vi.fn() };
  const compareControl = { setABAvailable: vi.fn(), setABSource: vi.fn() };
  const filterControl = { setSettings: vi.fn() };
  const noiseReductionControl = { setParams: vi.fn() };
  const cdlControl = { setCDL: vi.fn() };
  const transformControl = { setTransform: vi.fn() };
  const lensControl = { setParams: vi.fn() };
  const stereoControl = { setState: vi.fn() };
  const stereoEyeTransformControl = { setState: vi.fn() };
  const stereoAlignControl = { setMode: vi.fn() };
  const paintEngine = { loadFromAnnotations: vi.fn() };
  const persistenceManager = { syncGTOStore: vi.fn(), setGTOStore: vi.fn() };

  const context: SessionBridgeContext = {
    getSession: () => session as any,
    getViewer: () => viewer as any,
    getPaintEngine: () => paintEngine as any,
    getPersistenceManager: () => persistenceManager as any,
    getScopesControl: () => scopesControl as any,
    getHistogram: () => histogram as any,
    getWaveform: () => waveform as any,
    getVectorscope: () => vectorscope as any,
    getGamutDiagram: () => gamutDiagram as any,
    getInfoPanel: () => infoPanel as any,
    getCropControl: () => cropControl as any,
    getOCIOControl: () => ocioControl as any,
    getToneMappingControl: () => toneMappingControl as any,
    getColorControls: () => colorControls as any,
    getCompareControl: () => compareControl as any,
    getChannelSelect: () => channelSelect as any,
    getStackControl: () => stackControl as any,
    getFilterControl: () => filterControl as any,
    getNoiseReductionControl: () => noiseReductionControl as any,
    getCDLControl: () => cdlControl as any,
    getTransformControl: () => transformControl as any,
    getLensControl: () => lensControl as any,
    getStereoControl: () => stereoControl as any,
    getStereoEyeTransformControl: () => stereoEyeTransformControl as any,
    getStereoAlignControl: () => stereoAlignControl as any,
  };

  return {
    context,
    _session: session,
    _viewer: viewer,
    _histogram: histogram,
    _waveform: waveform,
    _vectorscope: vectorscope,
    _gamutDiagram: gamutDiagram,
    _scopesControl: scopesControl,
    _infoPanel: infoPanel,
    _channelSelect: channelSelect,
    _stackControl: stackControl,
    _paintEngine: paintEngine,
    _persistenceManager: persistenceManager,
    _compareControl: compareControl,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppSessionBridge', () => {
  let ctx: ReturnType<typeof createContext>;
  let bridge: AppSessionBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createContext();
    bridge = new AppSessionBridge(ctx.context);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // bindSessionEvents
  // -----------------------------------------------------------------------
  describe('bindSessionEvents', () => {
    it('ASB-001: frameChanged triggers updateHistogram, updateWaveform, updateVectorscope, updateGamutDiagram, updateInfoPanel', () => {
      bridge.bindSessionEvents();

      ctx._session.emit('frameChanged', 42);

      expect(_updateHistogram).toHaveBeenCalledTimes(1);
      expect(_updateHistogram).toHaveBeenCalledWith(ctx.context);
      expect(_updateWaveform).toHaveBeenCalledTimes(1);
      expect(_updateVectorscope).toHaveBeenCalledTimes(1);
      expect(_updateGamutDiagram).toHaveBeenCalledTimes(1);
      expect(_updateInfoPanel).toHaveBeenCalledTimes(1);
    });

    it('ASB-002: sourceLoaded triggers handleSourceLoaded with correct callback chain', () => {
      bridge.bindSessionEvents();

      ctx._session.emit('sourceLoaded', {} as any);

      expect(handleSourceLoaded).toHaveBeenCalledTimes(1);
      // The mock calls updateInfoPanel, updateStackControlSources, updateEXRLayers synchronously
      expect(_updateInfoPanel).toHaveBeenCalled();
      expect(_updateStackControlSources).toHaveBeenCalled();
      expect(_updateEXRLayers).toHaveBeenCalled();
    });

    it('ASB-003: unsupportedCodec triggers showUnsupportedCodecModal', () => {
      bridge.bindSessionEvents();

      const codecInfo = { filename: 'test.mov', error: { title: 'Unsupported Codec', message: 'ProRes', codecInfo: { displayName: 'ProRes' } } };
      ctx._session.emit('unsupportedCodec', codecInfo);

      expect(showUnsupportedCodecModal).toHaveBeenCalledTimes(1);
      expect(showUnsupportedCodecModal).toHaveBeenCalledWith(codecInfo);
    });

    it('ASB-004: playbackChanged triggers handlePlaybackChanged', () => {
      bridge.bindSessionEvents();

      ctx._session.emit('playbackChanged', true);

      expect(handlePlaybackChanged).toHaveBeenCalledTimes(1);
      expect(handlePlaybackChanged).toHaveBeenCalledWith(
        ctx.context,
        true,
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('ASB-005: bindSessionEvents registers compare handlers', () => {
      bridge.bindSessionEvents();

      expect(bindCompareHandlers).toHaveBeenCalledTimes(1);
      expect(bindCompareHandlers).toHaveBeenCalledWith(
        ctx.context,
        expect.anything(), // session
        expect.any(Function), // on helper
        expect.any(Function)  // updateEXRLayers
      );
    });

    it('ASB-006: bindSessionEvents registers persistence handlers', () => {
      bridge.bindSessionEvents();

      expect(bindPersistenceHandlers).toHaveBeenCalledTimes(1);
      expect(bindPersistenceHandlers).toHaveBeenCalledWith(
        ctx.context,
        expect.anything(), // session
        expect.any(Function), // on helper
        expect.any(Function), // updateHistogram
        expect.any(Function), // updateWaveform
        expect.any(Function), // updateVectorscope
        expect.any(Function)  // updateGamutDiagram
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scope scheduling and scope methods
  // -----------------------------------------------------------------------
  describe('scope scheduling', () => {
    it('ASB-010: scheduleUpdateScopes delegates to scopeScheduler.schedule()', () => {
      bridge.scheduleUpdateScopes();

      // createScopeScheduler was called in constructor, schedule should have been called
      const scheduler = vi.mocked(createScopeScheduler).mock.results[0]!.value;
      expect(scheduler.schedule).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Histogram data callback
  // -----------------------------------------------------------------------
  describe('histogram data callback', () => {
    it('ASB-020: setHistogramDataCallback receives data after updateHistogram when histogram is visible', () => {
      const cb = vi.fn();
      bridge.setHistogramDataCallback(cb);

      const mockData = { r: [1], g: [2], b: [3], luma: [4] } as any;
      ctx._histogram.isVisible.mockReturnValue(true);
      ctx._histogram.getData.mockReturnValue(mockData);

      bridge.updateHistogram();

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(mockData);
    });

    it('ASB-021: setHistogramDataCallback receives computed data when histogram is not visible', () => {
      const cb = vi.fn();
      bridge.setHistogramDataCallback(cb);

      const computedData = { r: [10], g: [20], b: [30], luma: [40] };
      ctx._histogram.isVisible.mockReturnValue(false);
      vi.mocked(_computeHistogramData).mockReturnValue(computedData as any);

      bridge.updateHistogram();

      expect(_computeHistogramData).toHaveBeenCalledWith(ctx.context);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(computedData);
    });

    it('ASB-022: setHistogramDataCallback(null) stops forwarding', () => {
      const cb = vi.fn();
      bridge.setHistogramDataCallback(cb);

      // Set it to null
      bridge.setHistogramDataCallback(null);

      ctx._histogram.isVisible.mockReturnValue(true);
      ctx._histogram.getData.mockReturnValue({ r: [], g: [], b: [], luma: [] } as any);

      bridge.updateHistogram();

      expect(cb).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Delegate methods
  // -----------------------------------------------------------------------
  describe('delegate methods', () => {
    it('ASB-030: updateInfoPanel delegates to handler', () => {
      bridge.updateInfoPanel();
      expect(_updateInfoPanel).toHaveBeenCalledWith(ctx.context);
    });

    it('ASB-031: formatTimecode delegates to handler', () => {
      const result = bridge.formatTimecode(48, 24);
      expect(_formatTimecode).toHaveBeenCalledWith(48, 24);
      expect(result).toBe('00:00:02:00');
    });

    it('ASB-032: formatDuration delegates to handler', () => {
      const result = bridge.formatDuration(3661);
      expect(_formatDuration).toHaveBeenCalledWith(3661);
      expect(result).toBe('1:01:01');
    });

    it('ASB-033: updateStackControlSources delegates to handler', () => {
      bridge.updateStackControlSources();
      expect(_updateStackControlSources).toHaveBeenCalledWith(ctx.context);
    });

    it('ASB-034: updateEXRLayers delegates to handler', () => {
      bridge.updateEXRLayers();
      expect(_updateEXRLayers).toHaveBeenCalledWith(ctx.context);
    });

    it('ASB-035: handleEXRLayerChange delegates to handler with correct args', async () => {
      const remapping = { r: 'R', g: 'G', b: 'B' };
      await bridge.handleEXRLayerChange('diffuse', remapping as any);

      expect(_handleEXRLayerChange).toHaveBeenCalledTimes(1);
      expect(_handleEXRLayerChange).toHaveBeenCalledWith(
        ctx.context,
        'diffuse',
        remapping,
        expect.any(Function)
      );
    });
  });

  // -----------------------------------------------------------------------
  // dispose and unbindSessionEvents
  // -----------------------------------------------------------------------
  describe('dispose', () => {
    it('ASB-040: dispose() unbinds all session events so frameChanged no longer fires', () => {
      bridge.bindSessionEvents();

      // Verify events work before dispose
      ctx._session.emit('frameChanged', 1);
      expect(_updateHistogram).toHaveBeenCalledTimes(1);
      vi.mocked(_updateHistogram).mockClear();

      bridge.dispose();

      // After dispose, events should not trigger handlers
      ctx._session.emit('frameChanged', 2);
      expect(_updateHistogram).not.toHaveBeenCalled();
    });

    it('ASB-041: dispose() unbinds playbackChanged events', () => {
      bridge.bindSessionEvents();

      // Verify works before dispose
      ctx._session.emit('playbackChanged', true);
      expect(handlePlaybackChanged).toHaveBeenCalledTimes(1);
      vi.mocked(handlePlaybackChanged).mockClear();

      bridge.dispose();

      ctx._session.emit('playbackChanged', false);
      expect(handlePlaybackChanged).not.toHaveBeenCalled();
    });

    it('ASB-042: dispose() unbinds unsupportedCodec events', () => {
      bridge.bindSessionEvents();

      bridge.dispose();

      const codecInfo = { filename: 'test.mov', error: { title: 'Unsupported', message: 'test', codecInfo: { displayName: 'test' } } };
      ctx._session.emit('unsupportedCodec', codecInfo);
      expect(showUnsupportedCodecModal).not.toHaveBeenCalled();
    });

    it('ASB-043: dispose() is idempotent -- calling it twice does not throw', () => {
      bridge.bindSessionEvents();

      expect(() => {
        bridge.dispose();
        bridge.dispose();
      }).not.toThrow();
    });

    it('ASB-044: dispose() empties the unsubscribers array', () => {
      bridge.bindSessionEvents();
      bridge.dispose();

      expect((bridge as any).unsubscribers).toEqual([]);
    });

    it('ASB-045: dispose() without prior bindSessionEvents() does not throw', () => {
      expect(() => bridge.dispose()).not.toThrow();
      expect((bridge as any).unsubscribers).toEqual([]);
    });

    it('ASB-046: unbindSessionEvents() clears all tracked unsubscribers', () => {
      bridge.bindSessionEvents();

      // There should be tracked unsubscribers for frameChanged, sourceLoaded, unsupportedCodec, playbackChanged
      expect((bridge as any).unsubscribers.length).toBeGreaterThan(0);

      bridge.unbindSessionEvents();

      expect((bridge as any).unsubscribers).toEqual([]);
    });

    it('ASB-047: sourceLoaded events are unsubscribed after dispose', () => {
      bridge.bindSessionEvents();

      bridge.dispose();

      vi.mocked(handleSourceLoaded).mockClear();
      ctx._session.emit('sourceLoaded', {} as any);
      expect(handleSourceLoaded).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('ASB-050: creates scope scheduler on construction', () => {
      expect(createScopeScheduler).toHaveBeenCalledTimes(1);
      expect(createScopeScheduler).toHaveBeenCalledWith(ctx.context, expect.objectContaining({
        onHistogramData: expect.any(Function),
      }));
    });
  });
});
