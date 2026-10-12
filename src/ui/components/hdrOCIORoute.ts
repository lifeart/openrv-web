/**
 * Route selection for HDR / float sources when OCIO may be active.
 *
 * - 'gl': the WebGL float pipeline. With OCIO on, the transform is applied
 *   inside it (viewer.frag.glsl stage 7b', see src/color/OCIODisplayLUT.ts),
 *   so every presentation path that reads it back (native HDR canvas, WebGPU
 *   blit, Canvas2D blit) shows the colour-managed image.
 * - 'canvas-ocio': the 8-bit 2D canvas with OCIO as a post-process. Only used
 *   when OCIO is on but no float bake was supplied (a caller of
 *   setOCIOBakedLUT that passes no provider). It clamps HDR values, but it
 *   never shows the image without OCIO.
 *
 * There is deliberately no route that shows an HDR source without OCIO while
 * OCIO is on.
 */
export type HDRSourceRoute = 'gl' | 'canvas-ocio';

export function selectHDRSourceRoute(opts: { ocioActive: boolean; ocioFloatStage: boolean }): HDRSourceRoute {
  if (opts.ocioActive && !opts.ocioFloatStage) return 'canvas-ocio';
  return 'gl';
}
