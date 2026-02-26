/**
 * Source Loaded Handlers Tests
 *
 * Tests for handleSourceLoaded, updateStackControlSources, updateEXRLayers,
 * and handleEXRLayerChange functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleSourceLoaded,
  updateStackControlSources,
  updateEXRLayers,
  handleEXRLayerChange,
} from './sourceLoadedHandlers';
import * as WebGLScopes from '../scopes/WebGLScopes';
import type { SessionBridgeContext } from '../AppSessionBridge';

function createMockContext(overrides: {
  currentSource?: Record<string, unknown> | null;
  gtoData?: unknown;
  allSources?: Array<{ name: string }>;
  currentSourceIndex?: number;
} = {}): SessionBridgeContext {
  const cropControl = { setSourceDimensions: vi.fn() };
  const ocioProcessor = {
    setActiveSource: vi.fn(),
    detectColorSpaceFromExtension: vi.fn(() => null),
    setSourceInputColorSpace: vi.fn(),
    getSourceInputColorSpace: vi.fn(() => null),
  };
  const ocioControl = { getProcessor: () => ocioProcessor };
  const toneMappingState: { enabled: boolean; operator: 'off' | 'aces' | 'filmic' | 'reinhard' | 'drago' } = {
    enabled: false,
    operator: 'off',
  };
  const toneMappingControl = {
    setState: vi.fn((state: { enabled?: boolean; operator?: string }) => {
      if (state.enabled !== undefined) toneMappingState.enabled = state.enabled;
      if (state.operator === 'off' || state.operator === 'aces' || state.operator === 'filmic' || state.operator === 'reinhard' || state.operator === 'drago') {
        toneMappingState.operator = state.operator;
      }
    }),
    getState: vi.fn(() => ({ ...toneMappingState })),
  };
  const colorAdjustments = { gamma: 1 };
  const colorControls = {
    setAdjustments: vi.fn((adj: { gamma?: number }) => {
      if (adj.gamma !== undefined) colorAdjustments.gamma = adj.gamma;
    }),
    getAdjustments: vi.fn(() => ({ ...colorAdjustments })),
  };
  const persistenceManager = { setGTOStore: vi.fn(), syncGTOStore: vi.fn() };
  const exrWindowOverlay = { setWindows: vi.fn(), clearWindows: vi.fn() };
  const viewer = { initPrerenderBuffer: vi.fn(), refresh: vi.fn(), getGLRenderer: vi.fn(() => null), isDisplayHDRCapable: vi.fn(() => false), getEXRWindowOverlay: vi.fn(() => exrWindowOverlay) };
  const stackControl = { setAvailableSources: vi.fn() };
  const channelSelect = { clearEXRLayers: vi.fn(), setEXRLayers: vi.fn() };
  const infoPanel = { update: vi.fn() };
  const histogram = { setHDRMode: vi.fn(), setHDRAutoFit: vi.fn() };

  const session = {
    currentSource: overrides.currentSource !== undefined ? overrides.currentSource : null,
    gtoData: overrides.gtoData ?? null,
    allSources: overrides.allSources ?? [],
    currentSourceIndex: overrides.currentSourceIndex ?? 0,
  };

  return {
    getSession: () => session,
    getViewer: () => viewer,
    getCropControl: () => cropControl,
    getOCIOControl: () => ocioControl,
    getToneMappingControl: () => toneMappingControl,
    getColorControls: () => colorControls,
    getPersistenceManager: () => persistenceManager,
    getStackControl: () => stackControl,
    getChannelSelect: () => channelSelect,
    getInfoPanel: () => infoPanel,
    getHistogram: () => histogram,
  } as unknown as SessionBridgeContext;
}

describe('handleSourceLoaded', () => {
  let updateInfoPanel: ReturnType<typeof vi.fn>;
  let updateStackCtrl: ReturnType<typeof vi.fn>;
  let updateEXR: ReturnType<typeof vi.fn>;
  let updateHistogram: ReturnType<typeof vi.fn>;
  let updateWaveform: ReturnType<typeof vi.fn>;
  let updateVectorscope: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    updateInfoPanel = vi.fn();
    updateStackCtrl = vi.fn();
    updateEXR = vi.fn();
    updateHistogram = vi.fn();
    updateWaveform = vi.fn();
    updateVectorscope = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('SLH-U001: calls updateInfoPanel', () => {
    const context = createMockContext();
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(updateInfoPanel).toHaveBeenCalled();
  });

  it('SLH-U002: sets crop control source dimensions when source exists', () => {
    const context = createMockContext({
      currentSource: { name: 'test.exr', width: 1920, height: 1080 },
    });
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getCropControl().setSourceDimensions).toHaveBeenCalledWith(1920, 1080);
  });

  it('SLH-U003: does not set crop dimensions when no source', () => {
    const context = createMockContext({ currentSource: null });
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getCropControl().setSourceDimensions).not.toHaveBeenCalled();
  });

  it('SLH-U004: sets OCIO active source using source name', () => {
    const context = createMockContext({
      currentSource: { name: 'test.exr', width: 100, height: 100 },
    });
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    const processor = context.getOCIOControl().getProcessor();
    expect(processor.setActiveSource).toHaveBeenCalledWith('test.exr');
  });

  it('SLH-U005: detects color space from file extension', () => {
    const context = createMockContext({
      currentSource: { name: 'test.exr', width: 100, height: 100 },
    });
    const processor = context.getOCIOControl().getProcessor();
    (processor.detectColorSpaceFromExtension as ReturnType<typeof vi.fn>).mockReturnValue('scene_linear');

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(processor.detectColorSpaceFromExtension).toHaveBeenCalledWith('.exr');
    expect(processor.setSourceInputColorSpace).toHaveBeenCalledWith('test.exr', 'scene_linear');
  });

  it('SLH-U006: does not set color space when extension detection returns null', () => {
    const context = createMockContext({
      currentSource: { name: 'test.exr', width: 100, height: 100 },
    });
    const processor = context.getOCIOControl().getProcessor();
    (processor.detectColorSpaceFromExtension as ReturnType<typeof vi.fn>).mockReturnValue(null);

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(processor.setSourceInputColorSpace).not.toHaveBeenCalled();
  });

  it('SLH-U022: skips auto-detection when source has persisted color space', () => {
    const context = createMockContext({
      currentSource: { name: 'test.exr', width: 100, height: 100 },
    });
    const processor = context.getOCIOControl().getProcessor();
    // Simulate a persisted color space mapping already loaded into the processor
    (processor.getSourceInputColorSpace as ReturnType<typeof vi.fn>).mockReturnValue('ACEScg');

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    // Should not call detectColorSpaceFromExtension or setSourceInputColorSpace
    expect(processor.detectColorSpaceFromExtension).not.toHaveBeenCalled();
    expect(processor.setSourceInputColorSpace).not.toHaveBeenCalled();
    // But should still set active source
    expect(processor.setActiveSource).toHaveBeenCalledWith('test.exr');
  });

  it('SLH-U023: falls back to extension detection when no persisted color space', () => {
    const context = createMockContext({
      currentSource: { name: 'test.dpx', width: 100, height: 100 },
    });
    const processor = context.getOCIOControl().getProcessor();
    (processor.getSourceInputColorSpace as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (processor.detectColorSpaceFromExtension as ReturnType<typeof vi.fn>).mockReturnValue('ACEScct');

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(processor.detectColorSpaceFromExtension).toHaveBeenCalledWith('.dpx');
    expect(processor.setSourceInputColorSpace).toHaveBeenCalledWith('test.dpx', 'ACEScct');
  });

  it('SLH-U007: auto-configures tone mapping and gamma for HDR content from fileSourceNode', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        width: 100,
        height: 100,
        fileSourceNode: { isHDR: () => true, formatName: 'EXR' },
      },
    });

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getToneMappingControl().setState).toHaveBeenCalledWith({ enabled: true, operator: 'aces' });
    expect(context.getColorControls().setAdjustments).toHaveBeenCalledWith({ gamma: 2.2 });
  });

  it('SLH-U008: auto-configures tone mapping for HDR content from videoSourceNode', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.mov',
        width: 100,
        height: 100,
        videoSourceNode: { isHDR: () => true },
      },
    });

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getToneMappingControl().setState).toHaveBeenCalledWith({ enabled: true, operator: 'aces' });
  });

  it('SLH-U009: does not configure tone mapping for SDR content', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.jpg',
        width: 100,
        height: 100,
        fileSourceNode: { isHDR: () => false },
      },
    });

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getToneMappingControl().setState).not.toHaveBeenCalled();
  });

  it('SLH-U029: auto-applied HDR tone mapping/gamma are reset when switching back to SDR', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        width: 100,
        height: 100,
        fileSourceNode: { isHDR: () => true, formatName: 'EXR' },
      },
    });

    // First load: HDR on SDR display -> auto ACES + gamma 2.2
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);
    expect(context.getToneMappingControl().setState).toHaveBeenCalledWith({ enabled: true, operator: 'aces' });
    expect(context.getColorControls().setAdjustments).toHaveBeenCalledWith({ gamma: 2.2 });

    // Switch to SDR source
    (context.getSession() as any).currentSource = {
      name: 'test.jpg',
      width: 100,
      height: 100,
      fileSourceNode: { isHDR: () => false },
    };
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getToneMappingControl().setState).toHaveBeenLastCalledWith({ enabled: false, operator: 'off' });
    expect(context.getColorControls().setAdjustments).toHaveBeenLastCalledWith({ gamma: 1 });
  });

  it('SLH-U030: manual tone mapping/gamma changes are preserved when switching to SDR', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        width: 100,
        height: 100,
        fileSourceNode: { isHDR: () => true, formatName: 'EXR' },
      },
    });

    // Auto HDR config first
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    // User overrides after auto config
    context.getToneMappingControl().setState({ enabled: true, operator: 'filmic' });
    context.getColorControls().setAdjustments({ gamma: 1.8 });

    const tmCallsBefore = (context.getToneMappingControl().setState as ReturnType<typeof vi.fn>).mock.calls.length;
    const gammaCallsBefore = (context.getColorControls().setAdjustments as ReturnType<typeof vi.fn>).mock.calls.length;

    // Switch to SDR source
    (context.getSession() as any).currentSource = {
      name: 'test.jpg',
      width: 100,
      height: 100,
      fileSourceNode: { isHDR: () => false },
    };
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect((context.getToneMappingControl().setState as ReturnType<typeof vi.fn>).mock.calls.length).toBe(tmCallsBefore);
    expect((context.getColorControls().setAdjustments as ReturnType<typeof vi.fn>).mock.calls.length).toBe(gammaCallsBefore);
  });

  it('SLH-U010: clears GTO store when session has no GTO data', () => {
    const context = createMockContext({ gtoData: null });
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getPersistenceManager().setGTOStore).toHaveBeenCalledWith(null);
  });

  it('SLH-U011: does not clear GTO store when session has GTO data', () => {
    const context = createMockContext({ gtoData: { some: 'data' } });
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getPersistenceManager().setGTOStore).not.toHaveBeenCalled();
  });

  it('SLH-U012: calls updateStackControlSources', () => {
    const context = createMockContext();
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(updateStackCtrl).toHaveBeenCalled();
  });

  it('SLH-U013: initializes prerender buffer', () => {
    const context = createMockContext();
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getViewer().initPrerenderBuffer).toHaveBeenCalled();
  });

  it('SLH-U014: calls updateEXRLayers', () => {
    const context = createMockContext();
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(updateEXR).toHaveBeenCalled();
  });

  it('SLH-U015: updates scopes after double requestAnimationFrame', () => {
    const context = createMockContext();
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(updateHistogram).not.toHaveBeenCalled();
    expect(updateWaveform).not.toHaveBeenCalled();
    expect(updateVectorscope).not.toHaveBeenCalled();

    // Double-RAF: advance through two animation frame callbacks
    vi.advanceTimersByTime(16);
    vi.advanceTimersByTime(16);

    expect(updateHistogram).toHaveBeenCalled();
    expect(updateWaveform).toHaveBeenCalled();
    expect(updateVectorscope).toHaveBeenCalled();
  });

  it('SLH-U016: SDR display + HDR content → tone mapping ON, scopes SDR', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        width: 100,
        height: 100,
        fileSourceNode: { isHDR: () => true, formatName: 'EXR' },
      },
    });
    // Default mock: isDisplayHDRCapable returns false (SDR display)

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    // SDR display: tone mapping enabled to compress HDR for display
    expect(context.getToneMappingControl().setState).toHaveBeenCalledWith({ enabled: true, operator: 'aces' });
    expect(context.getColorControls().setAdjustments).toHaveBeenCalledWith({ gamma: 2.2 });
    // Scopes show SDR range (tone-mapped output)
    expect(context.getHistogram().setHDRMode).toHaveBeenCalledWith(false);
  });

  it('SLH-U017: SDR content → scopes SDR, no tone mapping', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.jpg',
        width: 100,
        height: 100,
        fileSourceNode: { isHDR: () => false },
      },
    });

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getHistogram().setHDRMode).toHaveBeenCalledWith(false);
    // No tone mapping for SDR content
    expect(context.getToneMappingControl().setState).not.toHaveBeenCalled();
  });

  it('SLH-U018: HDR display + HDR file content → ACES tone mapping, scopes HDR', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        width: 100,
        height: 100,
        fileSourceNode: { isHDR: () => true, formatName: 'EXR' },
      },
    });
    // Simulate HDR display
    (context.getViewer() as any).isDisplayHDRCapable = vi.fn(() => true);

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    // HDR file on HDR display: tone mapping enabled to compress linear float range
    expect(context.getToneMappingControl().setState).toHaveBeenCalledWith({ enabled: true, operator: 'aces' });
    // Scopes show HDR range
    expect(context.getHistogram().setHDRMode).toHaveBeenCalledWith(true, expect.any(Number));
    const headroom = (context.getHistogram().setHDRMode as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(headroom).toBeGreaterThanOrEqual(4.0);
  });

  it('SLH-U019: HDR display + HLG video preset → tone mapping OFF by default, scopes HDR', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.mov',
        width: 100,
        height: 100,
        videoSourceNode: { isHDR: () => true, getVideoColorSpace: () => ({ transfer: 'hlg' }) },
      },
    });
    (context.getViewer() as any).isDisplayHDRCapable = vi.fn(() => true);

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getToneMappingControl().setState).toHaveBeenCalledWith({ enabled: false, operator: 'off' });
    expect(context.getHistogram().setHDRMode).toHaveBeenCalledWith(true, expect.any(Number));
  });

  it('SLH-U020a: HDR display uses GL renderer headroom when available', () => {
    const mockGlRenderer = { getHDRHeadroom: vi.fn(() => 8.0) };
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        width: 100,
        height: 100,
        fileSourceNode: { isHDR: () => true, formatName: 'EXR' },
      },
    });
    (context.getViewer() as any).isDisplayHDRCapable = vi.fn(() => true);
    (context.getViewer() as any).getGLRenderer = vi.fn(() => mockGlRenderer);

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    const headroom = (context.getHistogram().setHDRMode as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(headroom).toBe(8.0);
  });

  it('SLH-U021a: HDR display + JPEG gainmap file → tone mapping OFF by default', () => {
    const context = createMockContext({
      currentSource: {
        name: 'photo.jpg',
        width: 4032,
        height: 3024,
        fileSourceNode: { isHDR: () => true, formatName: 'jpeg-gainmap' },
      },
    });
    (context.getViewer() as any).isDisplayHDRCapable = vi.fn(() => true);

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getToneMappingControl().setState).toHaveBeenCalledWith({ enabled: false, operator: 'off' });
    expect(context.getHistogram().setHDRMode).toHaveBeenCalledWith(true, expect.any(Number));
  });

  it('SLH-U021b: HDR display + PQ video preset (no fileSourceNode) → tone mapping OFF by default', () => {
    const context = createMockContext({
      currentSource: {
        name: 'clip.mov',
        width: 3840,
        height: 2160,
        videoSourceNode: { isHDR: () => true, getVideoColorSpace: () => ({ transfer: 'pq' }) },
        // No fileSourceNode — video-only source
      },
    });
    (context.getViewer() as any).isDisplayHDRCapable = vi.fn(() => true);

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getToneMappingControl().setState).toHaveBeenCalledWith({ enabled: false, operator: 'off' });
    expect(context.getHistogram().setHDRMode).toHaveBeenCalledWith(true, expect.any(Number));
  });

  it('SLH-U028: HDR display + PQ file preset → tone mapping OFF by default', () => {
    const context = createMockContext({
      currentSource: {
        name: 'photo.avif',
        width: 4032,
        height: 3024,
        fileSourceNode: {
          isHDR: () => true,
          formatName: 'avif-hdr',
          getIPImage: () => ({ metadata: { transferFunction: 'pq' } }),
        },
      },
    });
    (context.getViewer() as any).isDisplayHDRCapable = vi.fn(() => true);

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getToneMappingControl().setState).toHaveBeenCalledWith({ enabled: false, operator: 'off' });
    expect(context.getHistogram().setHDRMode).toHaveBeenCalledWith(true, expect.any(Number));
  });

  it('SLH-U024: calls setScopesHDRMode(false) for SDR content', () => {
    const spy = vi.spyOn(WebGLScopes, 'setScopesHDRMode');
    const autoFitSpy = vi.spyOn(WebGLScopes, 'setScopesHDRAutoFit');
    const context = createMockContext({
      currentSource: {
        name: 'test.jpg',
        width: 100,
        height: 100,
        fileSourceNode: { isHDR: () => false },
      },
    });

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(spy).toHaveBeenCalledWith(false);
    expect(autoFitSpy).toHaveBeenCalledWith(false);
    spy.mockRestore();
    autoFitSpy.mockRestore();
  });

  it('SLH-U025: calls setScopesHDRMode(true, headroom) for HDR on HDR display', () => {
    const spy = vi.spyOn(WebGLScopes, 'setScopesHDRMode');
    const autoFitSpy = vi.spyOn(WebGLScopes, 'setScopesHDRAutoFit');
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        width: 100,
        height: 100,
        fileSourceNode: { isHDR: () => true, formatName: 'EXR' },
      },
    });
    (context.getViewer() as any).isDisplayHDRCapable = vi.fn(() => true);

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(spy).toHaveBeenCalledWith(true, expect.any(Number));
    expect(autoFitSpy).toHaveBeenCalledWith(true);
    const headroom = spy.mock.calls[0]![1];
    expect(headroom).toBeGreaterThanOrEqual(4.0);
    spy.mockRestore();
    autoFitSpy.mockRestore();
  });

  it('SLH-U026: calls setScopesHDRMode(false) for HDR content on SDR display', () => {
    const spy = vi.spyOn(WebGLScopes, 'setScopesHDRMode');
    const autoFitSpy = vi.spyOn(WebGLScopes, 'setScopesHDRAutoFit');
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        width: 100,
        height: 100,
        fileSourceNode: { isHDR: () => true, formatName: 'EXR' },
      },
    });
    // Default: SDR display (isDisplayHDRCapable returns false)

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(spy).toHaveBeenCalledWith(false);
    expect(autoFitSpy).toHaveBeenCalledWith(false);
    spy.mockRestore();
    autoFitSpy.mockRestore();
  });

  it('SLH-U027: calls setScopesHDRMode instead of creating scopes processor directly', () => {
    // Verify that the handler delegates to setScopesHDRMode and does not import/call
    // getSharedScopesProcessor or create a WebGLScopesProcessor directly
    const spy = vi.spyOn(WebGLScopes, 'setScopesHDRMode');
    const context = createMockContext({
      currentSource: {
        name: 'test.mov',
        width: 100,
        height: 100,
        videoSourceNode: { isHDR: () => true },
      },
    });
    (context.getViewer() as any).isDisplayHDRCapable = vi.fn(() => true);

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    // setScopesHDRMode should be called (deferred creation pattern)
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('SLH-U021c: SDR display + JPEG gainmap → ACES + gamma 2.2 (unchanged)', () => {
    const context = createMockContext({
      currentSource: {
        name: 'photo.jpg',
        width: 4032,
        height: 3024,
        fileSourceNode: { isHDR: () => true, formatName: 'jpeg-gainmap' },
      },
    });
    // Default: SDR display (isDisplayHDRCapable returns false)

    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(context.getToneMappingControl().setState).toHaveBeenCalledWith({ enabled: true, operator: 'aces' });
    expect(context.getColorControls().setAdjustments).toHaveBeenCalledWith({ gamma: 2.2 });
    expect(context.getHistogram().setHDRMode).toHaveBeenCalledWith(false);
  });
});

describe('updateStackControlSources', () => {
  it('SLH-U020: maps all sources to index/name pairs', () => {
    const context = createMockContext({
      allSources: [{ name: 'clip1.mov' }, { name: 'clip2.mov' }, { name: 'clip3.mov' }],
    });

    updateStackControlSources(context);

    expect(context.getStackControl().setAvailableSources).toHaveBeenCalledWith([
      { index: 0, name: 'clip1.mov' },
      { index: 1, name: 'clip2.mov' },
      { index: 2, name: 'clip3.mov' },
    ]);
  });

  it('SLH-U021: handles empty sources array', () => {
    const context = createMockContext({ allSources: [] });

    updateStackControlSources(context);

    expect(context.getStackControl().setAvailableSources).toHaveBeenCalledWith([]);
  });
});

describe('updateEXRLayers', () => {
  it('SLH-U030: clears EXR layers when no source', () => {
    const context = createMockContext({ currentSource: null });

    updateEXRLayers(context);

    expect(context.getChannelSelect().clearEXRLayers).toHaveBeenCalled();
  });

  it('SLH-U031: clears EXR layers when source has no fileSourceNode', () => {
    const context = createMockContext({
      currentSource: { name: 'test.mov' },
    });

    updateEXRLayers(context);

    expect(context.getChannelSelect().clearEXRLayers).toHaveBeenCalled();
  });

  it('SLH-U032: clears EXR layers when fileSourceNode has no getEXRLayers', () => {
    const context = createMockContext({
      currentSource: { name: 'test.jpg', fileSourceNode: {} },
    });

    updateEXRLayers(context);

    expect(context.getChannelSelect().clearEXRLayers).toHaveBeenCalled();
  });

  it('SLH-U033: sets EXR layers when layers are available', () => {
    const layers = [{ name: 'beauty' }, { name: 'diffuse' }];
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        fileSourceNode: { getEXRLayers: () => layers },
      },
    });

    updateEXRLayers(context);

    expect(context.getChannelSelect().setEXRLayers).toHaveBeenCalledWith(layers);
  });

  it('SLH-U034: clears EXR layers when getEXRLayers returns empty array', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        fileSourceNode: { getEXRLayers: () => [] },
      },
    });

    updateEXRLayers(context);

    expect(context.getChannelSelect().clearEXRLayers).toHaveBeenCalled();
  });

  it('SLH-U035: clears EXR layers when getEXRLayers returns null', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        fileSourceNode: { getEXRLayers: () => null },
      },
    });

    updateEXRLayers(context);

    expect(context.getChannelSelect().clearEXRLayers).toHaveBeenCalled();
  });
});

describe('handleEXRLayerChange', () => {
  it('SLH-U040: returns early when no current source', async () => {
    const context = createMockContext({ currentSource: null });
    const scheduleUpdateScopes = vi.fn();

    await handleEXRLayerChange(context, 'beauty', null, scheduleUpdateScopes);

    expect(scheduleUpdateScopes).not.toHaveBeenCalled();
  });

  it('SLH-U041: returns early when no fileSourceNode', async () => {
    const context = createMockContext({ currentSource: { name: 'test.mov' } });
    const scheduleUpdateScopes = vi.fn();

    await handleEXRLayerChange(context, 'beauty', null, scheduleUpdateScopes);

    expect(scheduleUpdateScopes).not.toHaveBeenCalled();
  });

  it('SLH-U042: returns early when fileSourceNode has no setEXRLayer', async () => {
    const context = createMockContext({
      currentSource: { name: 'test.exr', fileSourceNode: {} },
    });
    const scheduleUpdateScopes = vi.fn();

    await handleEXRLayerChange(context, 'beauty', null, scheduleUpdateScopes);

    expect(scheduleUpdateScopes).not.toHaveBeenCalled();
  });

  it('SLH-U043: refreshes viewer and schedules scope update when layer changed', async () => {
    const setEXRLayer = vi.fn().mockResolvedValue(true);
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        fileSourceNode: { setEXRLayer },
      },
    });
    const scheduleUpdateScopes = vi.fn();

    await handleEXRLayerChange(context, 'beauty', null, scheduleUpdateScopes);

    expect(setEXRLayer).toHaveBeenCalledWith('beauty', undefined);
    expect(context.getViewer().refresh).toHaveBeenCalled();
    expect(scheduleUpdateScopes).toHaveBeenCalled();
  });

  it('SLH-U044: does not refresh when setEXRLayer returns false', async () => {
    const setEXRLayer = vi.fn().mockResolvedValue(false);
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        fileSourceNode: { setEXRLayer },
      },
    });
    const scheduleUpdateScopes = vi.fn();

    await handleEXRLayerChange(context, 'beauty', null, scheduleUpdateScopes);

    expect(context.getViewer().refresh).not.toHaveBeenCalled();
    expect(scheduleUpdateScopes).not.toHaveBeenCalled();
  });

  it('SLH-U045: passes remapping to setEXRLayer when provided', async () => {
    const setEXRLayer = vi.fn().mockResolvedValue(true);
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        fileSourceNode: { setEXRLayer },
      },
    });
    const remapping = { R: 'beauty.R', G: 'beauty.G', B: 'beauty.B' };

    await handleEXRLayerChange(context, 'beauty', remapping as any, vi.fn());

    expect(setEXRLayer).toHaveBeenCalledWith('beauty', remapping);
  });

  it('SLH-U046: handles setEXRLayer error gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setEXRLayer = vi.fn().mockRejectedValue(new Error('decode failed'));
    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        fileSourceNode: { setEXRLayer },
      },
    });
    const scheduleUpdateScopes = vi.fn();

    await handleEXRLayerChange(context, 'beauty', null, scheduleUpdateScopes);

    expect(consoleError).toHaveBeenCalledWith('Failed to change EXR layer:', expect.any(Error));
    expect(scheduleUpdateScopes).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
