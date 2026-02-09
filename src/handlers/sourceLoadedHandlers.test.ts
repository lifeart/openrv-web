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
  };
  const ocioControl = { getProcessor: () => ocioProcessor };
  const toneMappingControl = { setState: vi.fn() };
  const colorControls = { setAdjustments: vi.fn() };
  const persistenceManager = { setGTOStore: vi.fn(), syncGTOStore: vi.fn() };
  const viewer = { initPrerenderBuffer: vi.fn(), refresh: vi.fn() };
  const stackControl = { setAvailableSources: vi.fn() };
  const channelSelect = { clearEXRLayers: vi.fn(), setEXRLayers: vi.fn() };
  const infoPanel = { update: vi.fn() };

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

  it('SLH-U015: updates scopes after a timeout', () => {
    const context = createMockContext();
    handleSourceLoaded(context, updateInfoPanel, updateStackCtrl, updateEXR, updateHistogram, updateWaveform, updateVectorscope);

    expect(updateHistogram).not.toHaveBeenCalled();
    expect(updateWaveform).not.toHaveBeenCalled();
    expect(updateVectorscope).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(updateHistogram).toHaveBeenCalled();
    expect(updateWaveform).toHaveBeenCalled();
    expect(updateVectorscope).toHaveBeenCalled();
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
