import { describe, it, expect, vi } from 'vitest';
import {
  resolveExportFrameInput,
  renderGradedExportFrame,
  cropFloatFrame,
  type GradedExportContext,
} from './ViewerGradedExport';
import { IPImage } from '../../core/image/Image';
import type { Session } from '../../core/session/Session';
import type { ExportedFrame } from './ViewerGLRenderer';

function image(tag: string): IPImage {
  return new IPImage({ width: 4, height: 2, channels: 4, dataType: 'float32', metadata: { sourcePath: tag } });
}

interface MockSourceOptions {
  hdrVideo?: { exportFrame: IPImage | null; cached: IPImage | null };
  hdrFile?: IPImage;
  procedural?: IPImage;
  element?: CanvasImageSource;
}

function createContext(opts: MockSourceOptions, overrides: Partial<GradedExportContext> = {}) {
  const fetchHDRFrameForExport = vi.fn(async () => opts.hdrVideo?.exportFrame ?? null);
  const source = {
    type: opts.hdrVideo ? 'video' : 'image',
    width: 4,
    height: 2,
    element: opts.element,
    videoSourceNode: opts.hdrVideo ? { isHDR: () => true, fetchHDRFrameForExport } : undefined,
    fileSourceNode: opts.hdrFile ? { isHDR: () => true, getIPImage: () => opts.hdrFile } : undefined,
    proceduralSourceNode: opts.procedural ? { getIPImage: () => opts.procedural } : undefined,
  };
  const session = {
    currentSource: source,
    currentFrame: 7,
    getVideoHDRIPImage: vi.fn(() => opts.hdrVideo?.cached ?? null),
  } as unknown as Session;
  const renderFrameForExport = vi.fn(
    async (_input, width: number, height: number, _target, colorSpace): Promise<ExportedFrame | null> => ({
      data: new Float32Array(width * height * 4).fill(0.5),
      width,
      height,
      colorSpace,
    }),
  );
  const ctx: GradedExportContext = {
    session,
    renderFrameForExport,
    applyLUTMetadataCascade: vi.fn((img: IPImage) => img),
    isOCIOActive: () => false,
    hdrBypassesOCIO: () => false,
    hasCPUOnlyEffectsActive: () => false,
    getTransform: () => ({ rotation: 0, flipH: false, flipV: false, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } }),
    ...overrides,
  };
  return { ctx, fetchHDRFrameForExport, renderFrameForExport, session };
}

describe('resolveExportFrameInput', () => {
  it('VGE-001: HDR video decodes a full-resolution frame and releases it', async () => {
    const full = image('full');
    const close = vi.spyOn(full, 'close');
    const { ctx, fetchHDRFrameForExport } = createContext({ hdrVideo: { exportFrame: full, cached: image('cached') } });

    const resolved = await resolveExportFrameInput(ctx, 7);

    expect(fetchHDRFrameForExport).toHaveBeenCalledWith(7);
    expect(resolved!.input).toEqual({ kind: 'image', image: full });
    expect(ctx.applyLUTMetadataCascade).toHaveBeenCalledWith(full);
    resolved!.release();
    expect(close).toHaveBeenCalled();
  });

  it('VGE-002: HDR video falls back to the cached display-size frame (not released)', async () => {
    const cached = image('cached');
    const close = vi.spyOn(cached, 'close');
    const { ctx } = createContext({ hdrVideo: { exportFrame: null, cached } });
    const resolved = await resolveExportFrameInput(ctx, 7);
    expect(resolved!.input).toEqual({ kind: 'image', image: cached });
    resolved!.release();
    expect(close).not.toHaveBeenCalled();
  });

  it('VGE-003: HDR video with no decodable frame has nothing to export via GL', async () => {
    const { ctx } = createContext({ hdrVideo: { exportFrame: null, cached: null } });
    expect(await resolveExportFrameInput(ctx, 7)).toBeNull();
  });

  it('VGE-004: HDR video still renders via GL while OCIO is active (no 2D drawable exists)', async () => {
    const full = image('full');
    const { ctx } = createContext({ hdrVideo: { exportFrame: full, cached: null } }, { isOCIOActive: () => true });
    expect((await resolveExportFrameInput(ctx, 7))!.input.kind).toBe('image');
  });

  it('VGE-005: HDR file and procedural sources render their float IPImage', async () => {
    const file = image('file');
    expect((await resolveExportFrameInput(createContext({ hdrFile: file }).ctx, 1))!.input).toEqual({
      kind: 'image',
      image: file,
    });
    const proc = image('proc');
    expect((await resolveExportFrameInput(createContext({ procedural: proc }).ctx, 1))!.input).toEqual({
      kind: 'image',
      image: proc,
    });
  });

  it('VGE-006: HDR file with OCIO uses the 2D path unless the WebGPU blit bypasses OCIO', async () => {
    const file = image('file');
    expect(
      await resolveExportFrameInput(createContext({ hdrFile: file }, { isOCIOActive: () => true }).ctx, 1),
    ).toBeNull();
    const bypass = createContext({ hdrFile: file }, { isOCIOActive: () => true, hdrBypassesOCIO: () => true });
    expect(await resolveExportFrameInput(bypass.ctx, 1)).not.toBeNull();
  });

  it('VGE-007: SDR element renders via the SDR GL path', async () => {
    const element = document.createElement('canvas');
    const resolved = await resolveExportFrameInput(createContext({ element }).ctx, 1);
    expect(resolved!.input).toEqual({ kind: 'sdr', source: element });
  });

  it('VGE-008: SDR source with OCIO or CPU-only effects uses the 2D path', async () => {
    const element = document.createElement('canvas');
    expect(await resolveExportFrameInput(createContext({ element }, { isOCIOActive: () => true }).ctx, 1)).toBeNull();
    expect(
      await resolveExportFrameInput(createContext({ element }, { hasCPUOnlyEffectsActive: () => true }).ctx, 1),
    ).toBeNull();
  });
});

describe('renderGradedExportFrame', () => {
  it('VGE-020: renders at source resolution with the requested target', async () => {
    const { ctx, renderFrameForExport } = createContext({ hdrFile: image('file') });
    const frame = await renderGradedExportFrame(ctx, 'display', 'display-p3');
    expect(renderFrameForExport).toHaveBeenCalledWith(expect.anything(), 4, 2, 'display', 'display-p3');
    expect(frame!.width).toBe(4);
  });

  it('VGE-021: 90° rotation swaps the render size', async () => {
    const { ctx, renderFrameForExport } = createContext(
      { hdrFile: image('file') },
      {
        getTransform: () => ({
          rotation: 90,
          flipH: false,
          flipV: false,
          scale: { x: 1, y: 1 },
          translate: { x: 0, y: 0 },
        }),
      },
    );
    await renderGradedExportFrame(ctx, 'display');
    expect(renderFrameForExport).toHaveBeenCalledWith(expect.anything(), 2, 4, 'display', 'srgb');
  });

  it('VGE-022: scene-linear export of an SDR source is sRGB-decoded to linear', async () => {
    const element = document.createElement('canvas');
    const { ctx } = createContext({ element });
    const frame = await renderGradedExportFrame(ctx, 'scene-linear');
    expect(frame!.data[0]).toBeCloseTo(0.214, 3); // 0.5 display -> linear
    expect(frame!.data[3]).toBe(0.5); // alpha untouched
  });

  it('VGE-023: HDR frames decoded for the export are released even when rendering fails', async () => {
    const full = image('full');
    const close = vi.spyOn(full, 'close');
    const { ctx } = createContext(
      { hdrVideo: { exportFrame: full, cached: null } },
      {
        renderFrameForExport: vi.fn(async () => {
          throw new Error('context lost');
        }),
      },
    );
    expect(await renderGradedExportFrame(ctx, 'display')).toBeNull();
    expect(close).toHaveBeenCalled();
  });

  it('VGE-024: returns null (2D fallback) when GL cannot render', async () => {
    const { ctx } = createContext({ hdrFile: image('file') }, { renderFrameForExport: vi.fn(async () => null) });
    expect(await renderGradedExportFrame(ctx, 'display')).toBeNull();
  });
});

describe('cropFloatFrame', () => {
  it('VGE-030: crops in display space', () => {
    const data = new Float32Array(4 * 2 * 4);
    for (let i = 0; i < 8; i++) data[i * 4] = i; // pixel index in R
    const frame = { data, width: 4, height: 2, colorSpace: 'srgb' as const };
    const cropped = cropFloatFrame(frame, 4, 2, undefined, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
    expect(cropped.width).toBe(2);
    expect(cropped.height).toBe(1);
    expect(Array.from(cropped.data).filter((_, i) => i % 4 === 0)).toEqual([6, 7]);
  });

  it('VGE-031: full crop returns the frame unchanged', () => {
    const frame = { data: new Float32Array(16), width: 2, height: 2, colorSpace: 'rec2020' as const };
    expect(cropFloatFrame(frame, 2, 2, undefined, { x: 0, y: 0, width: 1, height: 1 })).toBe(frame);
  });
});
