/**
 * Viewer graded export: renders the current frame through the GL shader
 * pipeline (the same grading, LUTs, tone mapping and color management the
 * viewer shows) for still export, instead of approximating it with CSS
 * filters on a 2D canvas.
 *
 * The Viewer wires the context; this module decides which frame the GL path
 * renders (an IPImage for HDR/float sources, the decoded element for SDR
 * sources) and when the 2D export path has to be used instead.
 */

import type { IPImage } from '../../core/image/Image';
import type { Session } from '../../core/session/Session';
import type { SDRFrameSource } from '../../render/Renderer';
import type { ExportedFrame, ExportFrameInput, ExportFrameTarget } from './ViewerGLRenderer';
import type { Transform2D } from './TransformControl';
import type { CropRegion } from './CropControl';
import { computeExportParams, getSourceElementForFrame } from './ViewerExport';
import { decodeSRGBToLinearInPlace, type FloatFrame } from '../../utils/export/GradedFrameExport';
import { Logger } from '../../utils/Logger';

const log = new Logger('ViewerGradedExport');

/** What the graded export needs from the Viewer. */
export interface GradedExportContext {
  session: Session;
  renderFrameForExport(
    input: ExportFrameInput,
    width: number,
    height: number,
    target: ExportFrameTarget,
    outputColorSpace: 'srgb' | 'display-p3',
  ): Promise<ExportedFrame | null>;
  /** The Viewer's LUT-pipeline metadata cascade for HDR IPImages (MED-51). */
  applyLUTMetadataCascade(image: IPImage): IPImage;
  /** OCIO baked-LUT display is active (the viewer then draws via the 2D canvas). */
  isOCIOActive(): boolean;
  /** HDR sources still render through GL while OCIO is active (WebGPU blit). */
  hdrBypassesOCIO(): boolean;
  /** Effects only the 2D path implements (blur, noise reduction). */
  hasCPUOnlyEffectsActive(): boolean;
  getTransform(): Transform2D;
}

/** A frame for the GL export path; `release` frees a frame decoded only for the export. */
export interface ResolvedExportFrame {
  input: ExportFrameInput;
  release(): void;
}

function isSDRFrameSource(element: CanvasImageSource | null): element is SDRFrameSource {
  if (!element) return false;
  return (
    (typeof HTMLImageElement !== 'undefined' && element instanceof HTMLImageElement) ||
    (typeof HTMLVideoElement !== 'undefined' && element instanceof HTMLVideoElement) ||
    (typeof HTMLCanvasElement !== 'undefined' && element instanceof HTMLCanvasElement) ||
    (typeof ImageBitmap !== 'undefined' && element instanceof ImageBitmap) ||
    (typeof OffscreenCanvas !== 'undefined' && element instanceof OffscreenCanvas)
  );
}

const noop = (): void => {};

/**
 * Pick the frame the GL export renders for `frame` of the current source,
 * mirroring Viewer.renderImage():
 *
 * - HDR video: the frame is decoded again at full source resolution (the
 *   viewer's cached frame is resized to the display); the cached frame is
 *   the fallback. These VideoFrame-backed frames have no 2D drawable, so the
 *   GL path is the only way to export them.
 * - HDR files and procedural sources: their float IPImage.
 * - SDR sources: the decoded element, unless OCIO or a CPU-only effect is
 *   active, which only the 2D path applies.
 *
 * Returns null when the 2D export path must be used.
 */
export async function resolveExportFrameInput(
  ctx: GradedExportContext,
  frame: number,
): Promise<ResolvedExportFrame | null> {
  const source = ctx.session.currentSource;
  if (!source) return null;

  const videoNode = source.videoSourceNode;
  if (videoNode?.isHDR()) {
    const owned = await videoNode.fetchHDRFrameForExport(frame);
    const image = owned ?? ctx.session.getVideoHDRIPImage(frame);
    if (!image) return null;
    return {
      input: { kind: 'image', image: ctx.applyLUTMetadataCascade(image) },
      release: owned ? () => owned.close() : noop,
    };
  }

  const hdrImage = source.fileSourceNode?.isHDR()
    ? source.fileSourceNode.getIPImage()
    : (source.proceduralSourceNode?.getIPImage() ?? null);
  if (hdrImage) {
    if (ctx.isOCIOActive() && !ctx.hdrBypassesOCIO()) return null;
    return { input: { kind: 'image', image: ctx.applyLUTMetadataCascade(hdrImage) }, release: noop };
  }

  if (ctx.isOCIOActive() || ctx.hasCPUOnlyEffectsActive()) return null;
  const element = getSourceElementForFrame(ctx.session);
  if (!isSDRFrameSource(element)) return null;
  return { input: { kind: 'sdr', source: element }, release: noop };
}

/**
 * Render the current frame through the GL pipeline at source resolution
 * (rotation/flip applied, crop not applied).
 *
 * `target: 'display'` returns SDR display-encoded values in `colorSpace`;
 * `target: 'scene-linear'` returns linear light (SDR sources are decoded
 * with the sRGB EOTF). Returns null when the 2D export path must be used.
 */
export async function renderGradedExportFrame(
  ctx: GradedExportContext,
  target: ExportFrameTarget,
  colorSpace: 'srgb' | 'display-p3' = 'srgb',
): Promise<FloatFrame | null> {
  const source = ctx.session.currentSource;
  if (!source) return null;

  const resolved = await resolveExportFrameInput(ctx, ctx.session.currentFrame);
  if (!resolved) return null;
  try {
    const { effectiveWidth, effectiveHeight } = computeExportParams(
      source.width,
      source.height,
      ctx.getTransform(),
      undefined,
    );
    const frame = await ctx.renderFrameForExport(resolved.input, effectiveWidth, effectiveHeight, target, colorSpace);
    if (frame && resolved.input.kind === 'sdr' && target === 'scene-linear') {
      // The SDR path keeps display-encoded values; EXR stores linear light.
      decodeSRGBToLinearInPlace(frame.data);
    }
    return frame;
  } catch (e) {
    log.warn('GL export render failed; using the 2D export path:', e);
    return null;
  } finally {
    resolved.release();
  }
}

/**
 * Crop a frame rendered at the effective (rotated) source size to the
 * export crop region, matching createExportCanvas()'s display-space crop.
 */
export function cropFloatFrame(
  frame: FloatFrame,
  sourceWidth: number,
  sourceHeight: number,
  transform: Transform2D | undefined,
  cropRegion: CropRegion | undefined,
): FloatFrame {
  const { outputWidth, outputHeight, crop } = computeExportParams(sourceWidth, sourceHeight, transform, cropRegion);
  if (!crop) return frame;
  const x0 = Math.max(0, Math.min(crop.x, frame.width - 1));
  const y0 = Math.max(0, Math.min(crop.y, frame.height - 1));
  const w = Math.max(1, Math.min(outputWidth, frame.width - x0));
  const h = Math.max(1, Math.min(outputHeight, frame.height - y0));
  const data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const start = ((y0 + y) * frame.width + x0) * 4;
    data.set(frame.data.subarray(start, start + w * 4), y * w * 4);
  }
  return { data, width: w, height: h, colorSpace: frame.colorSpace };
}
