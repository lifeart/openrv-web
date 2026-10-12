/**
 * ViewerGLRenderer.renderFrameForExport: which renderer draws the export and
 * which pipeline target (encoding, output mode, primaries, state) it uses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ViewerGLRenderer, neutralizeDisplayStages, type GLRendererContext } from './ViewerGLRenderer';
import type { Renderer } from '../../render/Renderer';
import type { RenderState } from '../../render/RenderState';
import { OUTPUT_ENCODING_DISPLAY, OUTPUT_ENCODING_LINEAR } from '../../config/RenderConfig';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../../core/types/color';
import { DEFAULT_TONE_MAPPING_STATE } from '../../core/types/effects';
import { DEFAULT_CDL } from '../../color/CDL';
import { DEFAULT_COLOR_WHEELS_STATE } from './ColorWheels';
import { DEFAULT_ZEBRA_STATE } from './ZebraStripes';
import { DEFAULT_HSL_QUALIFIER_STATE } from './HSLQualifier';
import { IPImage } from '../../core/image/Image';

const createRendererMock = vi.hoisted(() => vi.fn());
vi.mock('../../render/createRenderer', () => ({ createRenderer: createRendererMock }));

interface Internals {
  _glRenderer: Renderer | null;
  _isAsyncRenderer: boolean;
  _exportRenderer: Renderer | null;
}

function viewerState(): RenderState {
  return {
    colorAdjustments: { ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 1.5 },
    colorInversion: false,
    toneMappingState: { ...DEFAULT_TONE_MAPPING_STATE, enabled: true, operator: 'aces' },
    backgroundPattern: { pattern: 'checker', checkerSize: 'medium', customColor: '#1a1a1a' },
    cdl: JSON.parse(JSON.stringify(DEFAULT_CDL)),
    curvesLUT: null,
    colorWheels: JSON.parse(JSON.stringify(DEFAULT_COLOR_WHEELS_STATE)),
    falseColor: { enabled: true, lut: null },
    zebraStripes: { ...DEFAULT_ZEBRA_STATE, enabled: true },
    channelMode: 'red',
    lut: { data: null, size: 0, intensity: 0 },
    displayColor: { transferFunction: 1, displayGamma: 2.4, displayBrightness: 1.5, customGamma: 2.2 },
    highlightsShadows: { highlights: 0, shadows: 0, whites: 0, blacks: 0 },
    vibrance: { amount: 0, skinProtection: true },
    clarity: 0,
    sharpen: 0,
    hslQualifier: JSON.parse(JSON.stringify(DEFAULT_HSL_QUALIFIER_STATE)),
    gamutMapping: { mode: 'off', sourceGamut: 'srgb', targetGamut: 'srgb' },
  };
}

function mockRenderer(result: Float32Array | null = new Float32Array(2 * 1 * 4)) {
  const applied: RenderState[] = [];
  const renderer = {
    renderFrameForExport: vi.fn((_source: unknown, _width: number, _height: number, _target: unknown) => result),
    applyRenderState: vi.fn((s: RenderState) => applied.push(JSON.parse(JSON.stringify(s)))),
    setUserTransform: vi.fn(),
    setTextureFilterMode: vi.fn(),
    getTextureFilterMode: vi.fn(() => 'nearest'),
    setSphericalProjection: vi.fn(),
    setHDRHeadroom: vi.fn(),
    releaseImageTexture: vi.fn(),
    isContextLost: vi.fn(() => false),
    getContext: vi.fn(() => null),
    ensureImageTexture: vi.fn(() => null),
    initialize: vi.fn(),
    initAsync: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
  return { renderer, applied };
}

function createContext(): GLRendererContext {
  return {
    getTransformManager: vi.fn(() => ({ transform: { rotation: 90, flipH: true, flipV: false } })),
    scheduleRender: vi.fn(),
  } as unknown as GLRendererContext;
}

function hdrImage(primaries: 'bt2020' | 'bt709' = 'bt2020'): IPImage {
  return new IPImage({
    width: 2,
    height: 1,
    channels: 4,
    dataType: 'float32',
    metadata: { colorPrimaries: primaries, transferFunction: 'pq' },
  });
}

describe('ViewerGLRenderer.renderFrameForExport', () => {
  let ctx: GLRendererContext;
  let glr: ViewerGLRenderer;

  beforeEach(() => {
    vi.useFakeTimers();
    createRendererMock.mockReset();
    ctx = createContext();
    glr = new ViewerGLRenderer(ctx);
    vi.spyOn(glr, 'buildRenderState').mockImplementation(viewerState);
  });

  afterEach(() => {
    glr.dispose();
    vi.useRealTimers();
  });

  it('VGLR-EXP-001: SDR display target uses the viewer renderer with OUTPUT_ENCODING_DISPLAY and the SDR clamp', async () => {
    const { renderer, applied } = mockRenderer();
    (glr as unknown as Internals)._glRenderer = renderer as unknown as Renderer;
    const image = hdrImage();

    const frame = await glr.renderFrameForExport({ kind: 'image', image }, 2, 1, 'display');

    expect(frame).not.toBeNull();
    expect(frame!.colorSpace).toBe('srgb');
    expect(renderer.renderFrameForExport).toHaveBeenCalledWith(image, 2, 1, {
      encoding: OUTPUT_ENCODING_DISPLAY,
      outputMode: 'sdr',
      outputColorSpace: 'srgb',
    });
    // The viewer's grading and display stages are kept; only the backdrop is dropped.
    expect(applied[0]!.colorAdjustments.exposure).toBe(1.5);
    expect(applied[0]!.toneMappingState.enabled).toBe(true);
    expect(applied[0]!.displayColor.transferFunction).toBe(1);
    expect(applied[0]!.backgroundPattern.pattern).toBe('black');
    expect(renderer.setUserTransform).toHaveBeenCalledWith(90, true, false);
    // The viewer redraws with its own state afterwards.
    expect(ctx.scheduleRender).toHaveBeenCalled();
    expect(createRendererMock).not.toHaveBeenCalled();
  });

  it('VGLR-EXP-002: P3 export passes display-p3 as the output color space', async () => {
    const { renderer } = mockRenderer();
    (glr as unknown as Internals)._glRenderer = renderer as unknown as Renderer;
    const frame = await glr.renderFrameForExport({ kind: 'image', image: hdrImage() }, 2, 1, 'display', 'display-p3');
    expect(frame!.colorSpace).toBe('display-p3');
    expect(renderer.renderFrameForExport.mock.calls[0]![3]).toMatchObject({ outputColorSpace: 'display-p3' });
  });

  it('VGLR-EXP-003: scene-linear target is linear, unclamped, display stages off, primaries from the source', async () => {
    const { renderer, applied } = mockRenderer();
    (glr as unknown as Internals)._glRenderer = renderer as unknown as Renderer;

    const frame = await glr.renderFrameForExport({ kind: 'image', image: hdrImage('bt2020') }, 2, 1, 'scene-linear');

    expect(frame!.colorSpace).toBe('rec2020');
    expect(renderer.renderFrameForExport.mock.calls[0]![3]).toEqual({
      encoding: OUTPUT_ENCODING_LINEAR,
      outputMode: 'hdr',
      outputColorSpace: 'rec2020',
    });
    const s = applied[0]!;
    expect(s.colorAdjustments.exposure).toBe(1.5); // grading kept
    expect(s.toneMappingState.enabled).toBe(false);
    expect(s.displayColor).toMatchObject({ transferFunction: 0, displayGamma: 1, displayBrightness: 1 });
    expect(s.falseColor.enabled).toBe(false);
    expect(s.zebraStripes.enabled).toBe(false);
    expect(s.channelMode).toBe('rgb');
  });

  it('VGLR-EXP-004: SDR element input is passed through to the renderer', async () => {
    const { renderer } = mockRenderer();
    (glr as unknown as Internals)._glRenderer = renderer as unknown as Renderer;
    const element = document.createElement('canvas');
    await glr.renderFrameForExport({ kind: 'sdr', source: element }, 2, 1, 'display');
    expect(renderer.renderFrameForExport.mock.calls[0]![0]).toBe(element);
  });

  it('VGLR-EXP-005: worker renderer: renders on a main-thread export renderer with the same state', async () => {
    const internals = glr as unknown as Internals;
    const { renderer: viewerProxy } = mockRenderer();
    internals._glRenderer = viewerProxy as unknown as Renderer;
    internals._isAsyncRenderer = true;
    glr.setHDRHeadroom(3);
    glr.setSphericalProjection({ enabled: true, fov: 90, aspect: 1, yaw: 10, pitch: 0 });
    const { renderer: exportRenderer, applied } = mockRenderer();
    createRendererMock.mockReturnValue(exportRenderer);

    const image = hdrImage();
    const stale = {} as WebGLTexture;
    image.texture = stale;
    image.textureNeedsUpdate = false;
    const frame = await glr.renderFrameForExport({ kind: 'image', image }, 2, 1, 'display');

    expect(frame).not.toBeNull();
    expect(viewerProxy.renderFrameForExport).not.toHaveBeenCalled();
    expect(exportRenderer.initialize).toHaveBeenCalled();
    expect(exportRenderer.renderFrameForExport).toHaveBeenCalled();
    expect(applied[0]!.colorAdjustments.exposure).toBe(1.5);
    expect(exportRenderer.setHDRHeadroom).toHaveBeenCalledWith(3);
    expect(exportRenderer.setTextureFilterMode).toHaveBeenCalledWith('nearest');
    expect(exportRenderer.setSphericalProjection).toHaveBeenCalledWith(expect.objectContaining({ yaw: 10 }));
    // The image's texture handle from another context is restored untouched.
    expect(exportRenderer.releaseImageTexture).toHaveBeenCalledWith(image);
    expect(image.texture).toBe(stale);
    expect(image.textureNeedsUpdate).toBe(false);

    // Reused for the next frame, disposed once idle.
    await glr.renderFrameForExport({ kind: 'image', image }, 2, 1, 'display');
    expect(createRendererMock).toHaveBeenCalledTimes(1);
    expect(internals._exportRenderer).toBe(exportRenderer);
    vi.advanceTimersByTime(10_000);
    expect(exportRenderer.dispose).toHaveBeenCalled();
    expect(internals._exportRenderer).toBeNull();
  });

  it('VGLR-EXP-006: returns null when no GL renderer can be created', async () => {
    createRendererMock.mockImplementation(() => {
      throw new Error('WebGL2 not supported');
    });
    const frame = await glr.renderFrameForExport({ kind: 'image', image: hdrImage() }, 2, 1, 'display');
    expect(frame).toBeNull();
  });

  it('VGLR-EXP-007: returns null when the renderer cannot read back float pixels', async () => {
    const { renderer } = mockRenderer(null);
    (glr as unknown as Internals)._glRenderer = renderer as unknown as Renderer;
    expect(await glr.renderFrameForExport({ kind: 'image', image: hdrImage() }, 2, 1, 'display')).toBeNull();
  });
});

describe('neutralizeDisplayStages', () => {
  it('VGLR-EXP-010: keeps grading and drops display stages and diagnostics', () => {
    const state = viewerState();
    state.luminanceVis = { mode: 'contour', contourLevels: 4, contourDesaturate: false, contourLineColor: [1, 1, 1] };
    neutralizeDisplayStages(state);
    expect(state.colorAdjustments.exposure).toBe(1.5);
    expect(state.toneMappingState.enabled).toBe(false);
    expect(state.displayColor.transferFunction).toBe(0);
    expect(state.luminanceVis!.mode).toBe('off');
  });
});
