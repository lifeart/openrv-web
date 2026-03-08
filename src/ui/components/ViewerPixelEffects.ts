/**
 * ViewerPixelEffects - CPU pixel effect pipeline for the Viewer.
 *
 * Extracted from Viewer.ts to separate the CPU pixel-level image processing
 * concern (batched effects, lightweight overlays, tone mapping detection,
 * background compositing) from the monolithic Viewer class.
 *
 * All functions are standalone and access viewer state through the
 * PixelEffectsContext interface, following the same pattern as ViewerGLRenderer.
 */

import {
  isDefaultCDL,
  isDefaultCurves,
  applyColorInversion,
  applyCDLToImageData,
  isDisplayStateActive,
  applyDisplayColorManagementToImageData,
  safeCanvasContext2D,
  applyHueRotationInto as applyHueRotationPixelInto,
  isIdentityHueRotation,
} from '../../color/ColorProcessingFacade';
import { applyChannelIsolation } from './ChannelSelect';
import type { ChannelMode } from './ChannelSelect';
import { isDeinterlaceActive, applyDeinterlace } from '../../filters/Deinterlace';
import type { DeinterlaceParams } from '../../filters/Deinterlace';
import { isFilmEmulationActive, applyFilmEmulation } from '../../filters/FilmEmulation';
import type { FilmEmulationParams } from '../../filters/FilmEmulation';
import { isStabilizationActive, applyStabilization } from '../../filters/StabilizeMotion';
import type { StabilizationParams } from '../../filters/StabilizeMotion';
import { isNoiseReductionActive, applyNoiseReduction } from '../../filters/NoiseReduction';
import type { NoiseReductionParams } from '../../filters/NoiseReduction';
import { applyHighlightsShadows, applyVibrance, applyToneMappingWithParams } from './ViewerEffects';
import { yieldToMain } from '../../utils/effects/EffectProcessor';
import type { EffectProcessor } from '../../utils/effects/EffectProcessor';
import type { ColorPipelineManager } from './ColorPipelineManager';
import type { ColorWheels } from './ColorWheels';
import type { HSLQualifier } from './HSLQualifier';
import type { FilterSettings } from './FilterControl';
import type { OverlayManager } from './OverlayManager';
import type { WebGLSharpenProcessor } from '../../filters/WebGLSharpen';
import type { createNoiseReductionProcessor } from '../../filters/WebGLNoiseReduction';
import type { BackgroundPatternState } from './BackgroundPatternControl';
import type { InteractionQualityManager } from './InteractionQualityManager';
import type { CropManager } from './CropManager';

/**
 * Context interface for ViewerPixelEffects to access Viewer state
 * without tight coupling. The Viewer implements this interface.
 */
export interface PixelEffectsContext {
  getColorPipeline(): ColorPipelineManager;
  getFilterSettings(): FilterSettings;
  getChannelMode(): ChannelMode;
  getColorWheels(): ColorWheels;
  getHSLQualifier(): HSLQualifier;
  getOverlayManager(): OverlayManager;
  getEffectProcessor(): EffectProcessor;
  getSharpenProcessor(): WebGLSharpenProcessor | null;
  getNoiseReductionProcessor(): ReturnType<typeof createNoiseReductionProcessor> | null;
  getDeinterlaceParams(): DeinterlaceParams;
  getFilmEmulationParams(): FilmEmulationParams;
  getStabilizationParams(): StabilizationParams;
  getNoiseReductionParams(): NoiseReductionParams;
  getBackgroundPatternState(): BackgroundPatternState;
  getInteractionQuality(): InteractionQualityManager;
  getImageCtx(): CanvasRenderingContext2D;
  getCanvasColorSpace(): 'display-p3' | undefined;
  getBgCompositeTempCanvas(): HTMLCanvasElement | null;
  setBgCompositeTempCanvas(canvas: HTMLCanvasElement | null): void;
  getBgCompositeTempCtx(): CanvasRenderingContext2D | null;
  setBgCompositeTempCtx(ctx: CanvasRenderingContext2D | null): void;
  getAsyncEffectsGeneration(): number;
  getCropManager(): CropManager;
}

/**
 * Check if tone mapping is enabled in the color pipeline.
 */
export function isToneMappingEnabled(ctx: PixelEffectsContext): boolean {
  const state = ctx.getColorPipeline().toneMappingState;
  return state.enabled && state.operator !== 'off';
}

/**
 * Flags indicating which pixel effects are active.
 * Returned by detectActivePixelEffects() to avoid duplicating detection logic
 * between the sync and async versions of applyBatchedPixelEffects.
 */
export interface ActivePixelEffectFlags {
  hasCDL: boolean;
  hasCurves: boolean;
  hasSharpen: boolean;
  hasNoiseReduction: boolean;
  hasChannel: boolean;
  hasHighlightsShadows: boolean;
  hasVibrance: boolean;
  hasClarity: boolean;
  hasHueRotation: boolean;
  hasColorWheels: boolean;
  hasHSLQualifier: boolean;
  hasFalseColor: boolean;
  hasLuminanceVis: boolean;
  hasZebras: boolean;
  hasClippingOverlay: boolean;
  hasToneMapping: boolean;
  hasInversion: boolean;
  hasDisplayColorMgmt: boolean;
  hasDeinterlace: boolean;
  hasFilmEmulation: boolean;
  hasStabilization: boolean;
  anyActive: boolean;
}

/**
 * Extended result of detectActivePixelEffects that includes both the flags
 * and the fetched context objects, so callers can reuse them without
 * redundant getter calls. Extends ActivePixelEffectFlags to preserve
 * backward compatibility for code that only reads the flag properties.
 */
export interface DetectedPixelEffects extends ActivePixelEffectFlags {
  colorPipeline: ColorPipelineManager;
  filterSettings: FilterSettings;
  colorWheels: ColorWheels;
  hslQualifier: HSLQualifier;
  overlayManager: OverlayManager;
  deinterlaceParams: DeinterlaceParams;
  filmEmulationParams: FilmEmulationParams;
  stabilizationParams: StabilizationParams;
  noiseReductionParams: NoiseReductionParams;
  interactionQuality: InteractionQualityManager;
  channelMode: ChannelMode;
}

/**
 * Detect which pixel effects are currently active.
 * Shared between sync and async applyBatchedPixelEffects to avoid duplication.
 * Returns both the flags and the fetched context objects so callers can reuse them.
 */
export function detectActivePixelEffects(ctx: PixelEffectsContext): DetectedPixelEffects {
  const colorPipeline = ctx.getColorPipeline();
  const filterSettings = ctx.getFilterSettings();
  const channelMode = ctx.getChannelMode();
  const colorWheels = ctx.getColorWheels();
  const hslQualifier = ctx.getHSLQualifier();
  const overlayManager = ctx.getOverlayManager();
  const deinterlaceParams = ctx.getDeinterlaceParams();
  const filmEmulationParams = ctx.getFilmEmulationParams();
  const stabilizationParams = ctx.getStabilizationParams();
  const noiseReductionParams = ctx.getNoiseReductionParams();

  const hasCDL = !isDefaultCDL(colorPipeline.cdlValues);
  const hasCurves = !isDefaultCurves(colorPipeline.curvesData);
  const hasSharpen = filterSettings.sharpen > 0;
  const hasNoiseReduction = isNoiseReductionActive(noiseReductionParams);
  const hasChannel = channelMode !== 'rgb';
  const hasHighlightsShadows =
    colorPipeline.colorAdjustments.highlights !== 0 ||
    colorPipeline.colorAdjustments.shadows !== 0 ||
    colorPipeline.colorAdjustments.whites !== 0 ||
    colorPipeline.colorAdjustments.blacks !== 0;
  const hasVibrance = colorPipeline.colorAdjustments.vibrance !== 0;
  const hasClarity = colorPipeline.colorAdjustments.clarity !== 0;
  const hasHueRotation = !isIdentityHueRotation(colorPipeline.colorAdjustments.hueRotation);
  const hasColorWheels = colorWheels.hasAdjustments();
  const hasHSLQualifier = hslQualifier.isEnabled();
  const hasFalseColor = overlayManager.getFalseColor().isEnabled();
  const hasLuminanceVis =
    overlayManager.getLuminanceVisualization().getMode() !== 'off' &&
    overlayManager.getLuminanceVisualization().getMode() !== 'false-color';
  const hasZebras = overlayManager.getZebraStripes().isEnabled();
  const hasClippingOverlay = overlayManager.getClippingOverlay().isEnabled();
  const hasToneMapping = isToneMappingEnabled(ctx);
  const hasInversion = colorPipeline.colorInversionEnabled;
  const hasDisplayColorMgmt = isDisplayStateActive(colorPipeline.displayColorState);
  const hasDeinterlace = isDeinterlaceActive(deinterlaceParams);
  const hasFilmEmulation = isFilmEmulationActive(filmEmulationParams);
  const hasStabilization = isStabilizationActive(stabilizationParams) && stabilizationParams.cropAmount > 0;

  const anyActive =
    hasCDL ||
    hasCurves ||
    hasSharpen ||
    hasNoiseReduction ||
    hasChannel ||
    hasHighlightsShadows ||
    hasVibrance ||
    hasClarity ||
    hasHueRotation ||
    hasColorWheels ||
    hasHSLQualifier ||
    hasFalseColor ||
    hasLuminanceVis ||
    hasZebras ||
    hasClippingOverlay ||
    hasToneMapping ||
    hasInversion ||
    hasDisplayColorMgmt ||
    hasDeinterlace ||
    hasFilmEmulation ||
    hasStabilization;

  return {
    hasCDL,
    hasCurves,
    hasSharpen,
    hasNoiseReduction,
    hasChannel,
    hasHighlightsShadows,
    hasVibrance,
    hasClarity,
    hasHueRotation,
    hasColorWheels,
    hasHSLQualifier,
    hasFalseColor,
    hasLuminanceVis,
    hasZebras,
    hasClippingOverlay,
    hasToneMapping,
    hasInversion,
    hasDisplayColorMgmt,
    hasDeinterlace,
    hasFilmEmulation,
    hasStabilization,
    anyActive,
    colorPipeline,
    filterSettings,
    colorWheels,
    hslQualifier,
    overlayManager,
    deinterlaceParams,
    filmEmulationParams,
    stabilizationParams,
    noiseReductionParams,
    interactionQuality: ctx.getInteractionQuality(),
    channelMode,
  };
}

/**
 * Composite ImageData onto the canvas while preserving the background pattern.
 * putImageData() ignores compositing and overwrites pixels directly, so we
 * write to a temporary canvas first, then use drawImage() which respects
 * alpha compositing and preserves the background pattern underneath.
 */
export function compositeImageDataOverBackground(
  ctx: PixelEffectsContext,
  imageData: ImageData,
  width: number,
  height: number,
): void {
  const imageCtx = ctx.getImageCtx();

  if (ctx.getBackgroundPatternState().pattern === 'black') {
    // No background pattern - putImageData is fine
    imageCtx.putImageData(imageData, 0, 0);
    return;
  }

  // Ensure temp canvas is the right size
  let tempCanvas = ctx.getBgCompositeTempCanvas();
  let tempCtx = ctx.getBgCompositeTempCtx();
  if (!tempCanvas || !tempCtx) {
    tempCanvas = document.createElement('canvas');
    tempCtx = safeCanvasContext2D(tempCanvas, {}, ctx.getCanvasColorSpace());
    ctx.setBgCompositeTempCanvas(tempCanvas);
    ctx.setBgCompositeTempCtx(tempCtx);
  }
  if (!tempCtx) {
    // Fallback if context creation fails
    imageCtx.putImageData(imageData, 0, 0);
    return;
  }
  if (tempCanvas.width !== width || tempCanvas.height !== height) {
    tempCanvas.width = width;
    tempCanvas.height = height;
  }

  // Write ImageData to temp canvas, then drawImage onto main canvas
  tempCtx.putImageData(imageData, 0, 0);
  imageCtx.drawImage(tempCanvas, 0, 0);
}

/**
 * Apply batched pixel-level effects to the canvas.
 * Uses a single getImageData/putImageData pair for all pixel-level effects:
 * highlights/shadows, vibrance, clarity, hue rotation, color wheels, CDL,
 * curves, HSL qualifier, tone mapping, color inversion, sharpen, channel
 * isolation, display color management, false color, luminance visualization,
 * zebra stripes, and clipping overlay.
 * This reduces GPU-to-CPU transfers from N to 1.
 */
export function applyBatchedPixelEffects(
  ctx: PixelEffectsContext,
  canvasCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const detected = detectActivePixelEffects(ctx);
  if (!detected.anyActive) return;

  const {
    hasCDL,
    hasCurves,
    hasSharpen,
    hasNoiseReduction,
    hasChannel,
    hasHighlightsShadows,
    hasVibrance,
    hasClarity,
    hasHueRotation,
    hasColorWheels,
    hasHSLQualifier,
    hasFalseColor,
    hasLuminanceVis,
    hasZebras,
    hasClippingOverlay,
    hasToneMapping,
    hasInversion,
    hasDisplayColorMgmt,
    hasDeinterlace,
    hasFilmEmulation,
    hasStabilization,
    colorPipeline,
    filterSettings,
    colorWheels,
    hslQualifier,
    overlayManager,
    deinterlaceParams,
    filmEmulationParams,
    stabilizationParams,
    noiseReductionParams,
    interactionQuality,
    channelMode,
  } = detected;
  const effectProcessor = ctx.getEffectProcessor();
  const sharpenProcessor = ctx.getSharpenProcessor();
  const noiseReductionProcessor = ctx.getNoiseReductionProcessor();

  // Single getImageData call
  const imageData = canvasCtx.getImageData(0, 0, width, height);

  // Apply stabilization (spatial transform, before deinterlace)
  if (hasStabilization) {
    applyStabilization(imageData, { dx: 0, dy: 0, cropAmount: stabilizationParams.cropAmount });
  }

  // Apply deinterlace (spatial, before color adjustments)
  if (hasDeinterlace) {
    applyDeinterlace(imageData, deinterlaceParams);
  }

  // Apply highlight/shadow recovery (before other adjustments for best results)
  if (hasHighlightsShadows) {
    applyHighlightsShadows(imageData, {
      highlights: colorPipeline.colorAdjustments.highlights,
      shadows: colorPipeline.colorAdjustments.shadows,
      whites: colorPipeline.colorAdjustments.whites,
      blacks: colorPipeline.colorAdjustments.blacks,
    });
  }

  // Apply vibrance (intelligent saturation - before CDL/curves for natural results)
  if (hasVibrance) {
    applyVibrance(imageData, {
      vibrance: colorPipeline.colorAdjustments.vibrance,
      skinProtection: colorPipeline.colorAdjustments.vibranceSkinProtection,
    });
  }

  // Apply clarity (local contrast enhancement in midtones)
  if (hasClarity) {
    const halfRes = interactionQuality.cpuHalfRes;
    effectProcessor.applyClarity(imageData, width, height, colorPipeline.colorAdjustments, halfRes);
  }

  // Apply hue rotation (luminance-preserving, after basic adjustments, before CDL)
  if (hasHueRotation) {
    const data = imageData.data;
    const len = data.length;
    const hueOut: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < len; i += 4) {
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;
      applyHueRotationPixelInto(r, g, b, colorPipeline.colorAdjustments.hueRotation, hueOut);
      data[i] = Math.round(hueOut[0] * 255);
      data[i + 1] = Math.round(hueOut[1] * 255);
      data[i + 2] = Math.round(hueOut[2] * 255);
    }
  }

  // Apply color wheels (Lift/Gamma/Gain - after basic adjustments, before CDL)
  if (hasColorWheels) {
    colorWheels.apply(imageData);
  }

  // Apply CDL color correction
  if (hasCDL) {
    applyCDLToImageData(imageData, colorPipeline.cdlValues);
  }

  // Apply color curves
  if (hasCurves) {
    colorPipeline.curveLUTCache.apply(imageData, colorPipeline.curvesData);
  }

  // Apply HSL Qualifier (secondary color correction - after primary corrections)
  if (hasHSLQualifier) {
    hslQualifier.apply(imageData);
  }

  // Apply tone mapping (after color adjustments, before channel isolation)
  if (hasToneMapping) {
    applyToneMappingWithParams(imageData, colorPipeline.toneMappingState);
  }

  // Apply color inversion (after all color corrections, before sharpen/channel isolation)
  if (hasInversion) {
    applyColorInversion(imageData);
  }

  // Apply film emulation (after color corrections, before sharpen/channel isolation)
  if (hasFilmEmulation) {
    applyFilmEmulation(imageData, filmEmulationParams);
  }

  // Apply noise reduction (edge-preserving denoise before sharpen).
  if (hasNoiseReduction) {
    if (noiseReductionProcessor) {
      noiseReductionProcessor.processInPlace(imageData, noiseReductionParams);
    } else {
      applyNoiseReduction(imageData, noiseReductionParams);
    }
  }

  // Apply sharpen filter
  if (hasSharpen) {
    if (sharpenProcessor && sharpenProcessor.isReady()) {
      sharpenProcessor.applyInPlace(imageData, filterSettings.sharpen);
    } else {
      const halfRes = interactionQuality.cpuHalfRes;
      effectProcessor.applySharpenCPU(imageData, width, height, filterSettings.sharpen / 100, halfRes);
    }
  }

  // Apply channel isolation (before false color so we can see individual channel exposure)
  if (hasChannel) {
    applyChannelIsolation(imageData, channelMode);
  }

  // Apply display color management (final pipeline stage before diagnostic overlays)
  if (hasDisplayColorMgmt) {
    applyDisplayColorManagementToImageData(imageData, colorPipeline.displayColorState);
  }

  // Apply luminance visualization modes or false color (mutually exclusive)
  if (hasLuminanceVis) {
    overlayManager.getLuminanceVisualization().apply(imageData);
  } else if (hasFalseColor) {
    overlayManager.getFalseColor().apply(imageData);
  }

  // Apply zebra stripes
  if (hasZebras && !hasFalseColor && !hasLuminanceVis) {
    overlayManager.getZebraStripes().apply(imageData);
  }

  // Apply clipping overlay
  if (hasClippingOverlay && !hasFalseColor && !hasLuminanceVis && !hasZebras) {
    overlayManager.getClippingOverlay().apply(imageData);
  }

  // Single putImageData call
  canvasCtx.putImageData(imageData, 0, 0);
}

/**
 * Async version of applyBatchedPixelEffects that yields to the event loop
 * between major effect passes. This keeps each blocking period under ~16ms.
 */
export async function applyBatchedPixelEffectsAsync(
  ctx: PixelEffectsContext,
  canvasCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  generation: number,
  cropClipActive: boolean,
): Promise<void> {
  try {
    const detected = detectActivePixelEffects(ctx);
    if (!detected.anyActive) return;

    const {
      hasCDL,
      hasCurves,
      hasSharpen,
      hasNoiseReduction,
      hasChannel,
      hasHighlightsShadows,
      hasVibrance,
      hasClarity,
      hasHueRotation,
      hasColorWheels,
      hasHSLQualifier,
      hasFalseColor,
      hasLuminanceVis,
      hasZebras,
      hasClippingOverlay,
      hasToneMapping,
      hasInversion,
      hasDisplayColorMgmt,
      hasDeinterlace,
      hasFilmEmulation,
      hasStabilization,
      colorPipeline,
      filterSettings,
      colorWheels,
      hslQualifier,
      overlayManager,
      deinterlaceParams,
      filmEmulationParams,
      stabilizationParams,
      noiseReductionParams,
      interactionQuality,
      channelMode,
    } = detected;
    const effectProcessor = ctx.getEffectProcessor();
    const sharpenProcessor = ctx.getSharpenProcessor();
    const noiseReductionProcessor = ctx.getNoiseReductionProcessor();

    // Single getImageData call
    const imageData = canvasCtx.getImageData(0, 0, width, height);

    // --- Pass 0: Stabilization ---
    if (hasStabilization) {
      applyStabilization(imageData, { dx: 0, dy: 0, cropAmount: stabilizationParams.cropAmount });
      await yieldToMain();
      if (ctx.getAsyncEffectsGeneration() !== generation) return;
    }

    // --- Pass 1: Deinterlace ---
    if (hasDeinterlace) {
      applyDeinterlace(imageData, deinterlaceParams);
      await yieldToMain();
      if (ctx.getAsyncEffectsGeneration() !== generation) return;
    }

    // --- Pass 2: Clarity ---
    if (hasClarity) {
      const halfRes = interactionQuality.cpuHalfRes;
      await effectProcessor.applyClarityChunked(imageData, width, height, colorPipeline.colorAdjustments, halfRes);
      await yieldToMain();
      if (ctx.getAsyncEffectsGeneration() !== generation) return;
    }

    // --- Pass 3: Per-pixel color effects ---
    const hasPerPixelEffects =
      hasHighlightsShadows ||
      hasVibrance ||
      hasHueRotation ||
      hasColorWheels ||
      hasCDL ||
      hasCurves ||
      hasHSLQualifier ||
      hasToneMapping ||
      hasInversion ||
      hasFilmEmulation;

    if (hasPerPixelEffects) {
      if (hasHighlightsShadows) {
        applyHighlightsShadows(imageData, {
          highlights: colorPipeline.colorAdjustments.highlights,
          shadows: colorPipeline.colorAdjustments.shadows,
          whites: colorPipeline.colorAdjustments.whites,
          blacks: colorPipeline.colorAdjustments.blacks,
        });
      }

      if (hasVibrance) {
        applyVibrance(imageData, {
          vibrance: colorPipeline.colorAdjustments.vibrance,
          skinProtection: colorPipeline.colorAdjustments.vibranceSkinProtection,
        });
      }

      if (hasHueRotation) {
        const data = imageData.data;
        const len = data.length;
        const hueOut: [number, number, number] = [0, 0, 0];
        for (let i = 0; i < len; i += 4) {
          const r = data[i]! / 255;
          const g = data[i + 1]! / 255;
          const b = data[i + 2]! / 255;
          applyHueRotationPixelInto(r, g, b, colorPipeline.colorAdjustments.hueRotation, hueOut);
          data[i] = Math.round(hueOut[0] * 255);
          data[i + 1] = Math.round(hueOut[1] * 255);
          data[i + 2] = Math.round(hueOut[2] * 255);
        }
      }

      if (hasColorWheels) {
        colorWheels.apply(imageData);
      }

      if (hasCDL) {
        applyCDLToImageData(imageData, colorPipeline.cdlValues);
      }

      if (hasCurves) {
        colorPipeline.curveLUTCache.apply(imageData, colorPipeline.curvesData);
      }

      if (hasHSLQualifier) {
        hslQualifier.apply(imageData);
      }

      if (hasToneMapping) {
        applyToneMappingWithParams(imageData, colorPipeline.toneMappingState);
      }

      if (hasInversion) {
        applyColorInversion(imageData);
      }

      if (hasFilmEmulation) {
        applyFilmEmulation(imageData, filmEmulationParams);
      }

      await yieldToMain();
      if (ctx.getAsyncEffectsGeneration() !== generation) return;
    }

    // --- Pass 4: Noise reduction ---
    if (hasNoiseReduction) {
      if (noiseReductionProcessor) {
        noiseReductionProcessor.processInPlace(imageData, noiseReductionParams);
      } else {
        applyNoiseReduction(imageData, noiseReductionParams);
      }
      await yieldToMain();
      if (ctx.getAsyncEffectsGeneration() !== generation) return;
    }

    // --- Pass 5: Sharpen ---
    if (hasSharpen) {
      if (sharpenProcessor && sharpenProcessor.isReady()) {
        sharpenProcessor.applyInPlace(imageData, filterSettings.sharpen);
      } else {
        const halfRes = interactionQuality.cpuHalfRes;
        await effectProcessor.applySharpenCPUChunked(imageData, width, height, filterSettings.sharpen / 100, halfRes);
      }
      await yieldToMain();
      if (ctx.getAsyncEffectsGeneration() !== generation) return;
    }

    // --- Pass 6: Channel isolation + display color management ---
    if (hasChannel) {
      applyChannelIsolation(imageData, channelMode);
    }

    if (hasDisplayColorMgmt) {
      applyDisplayColorManagementToImageData(imageData, colorPipeline.displayColorState);
    }

    // --- Pass 7: Diagnostic overlays ---
    if (hasLuminanceVis) {
      overlayManager.getLuminanceVisualization().apply(imageData);
    } else if (hasFalseColor) {
      overlayManager.getFalseColor().apply(imageData);
    }

    if (hasZebras && !hasFalseColor && !hasLuminanceVis) {
      overlayManager.getZebraStripes().apply(imageData);
    }

    if (hasClippingOverlay && !hasFalseColor && !hasLuminanceVis && !hasZebras) {
      overlayManager.getClippingOverlay().apply(imageData);
    }

    // Final generation check before writing pixels
    if (ctx.getAsyncEffectsGeneration() !== generation) return;

    // Single putImageData call
    canvasCtx.putImageData(imageData, 0, 0);

    // Apply crop clipping after putImageData (putImageData ignores clip regions)
    if (cropClipActive) {
      ctx.getCropManager().clearOutsideCropRegion(canvasCtx, width, height);
    }
  } catch (err) {
    console.error('Async batched pixel effects processing failed:', err);
  }
}

/**
 * Apply only lightweight diagnostic overlays and display color management.
 * Used during playback with prerender buffer to maintain visual diagnostics
 * without blocking on expensive CPU effects (handled by workers).
 */
export function applyLightweightEffects(
  ctx: PixelEffectsContext,
  canvasCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const channelMode = ctx.getChannelMode();
  const overlayManager = ctx.getOverlayManager();
  const colorPipeline = ctx.getColorPipeline();

  const hasChannel = channelMode !== 'rgb';
  const hasFalseColor = overlayManager.getFalseColor().isEnabled();
  const hasLuminanceVis =
    overlayManager.getLuminanceVisualization().getMode() !== 'off' &&
    overlayManager.getLuminanceVisualization().getMode() !== 'false-color';
  const hasZebras = overlayManager.getZebraStripes().isEnabled();
  const hasClippingOverlay = overlayManager.getClippingOverlay().isEnabled();
  const hasDisplayColorMgmt = isDisplayStateActive(colorPipeline.displayColorState);

  // Early return if no lightweight effects are active
  if (!hasChannel && !hasFalseColor && !hasLuminanceVis && !hasZebras && !hasClippingOverlay && !hasDisplayColorMgmt) {
    return;
  }

  // Single getImageData call
  const imageData = canvasCtx.getImageData(0, 0, width, height);

  // Channel isolation (fast channel swizzle)
  if (hasChannel) {
    applyChannelIsolation(imageData, channelMode);
  }

  // Display color management
  if (hasDisplayColorMgmt) {
    applyDisplayColorManagementToImageData(imageData, colorPipeline.displayColorState);
  }

  // Luminance visualization or false color (mutually exclusive)
  if (hasLuminanceVis) {
    overlayManager.getLuminanceVisualization().apply(imageData);
  } else if (hasFalseColor) {
    overlayManager.getFalseColor().apply(imageData);
  }

  // Zebra stripes
  if (hasZebras && !hasFalseColor && !hasLuminanceVis) {
    overlayManager.getZebraStripes().apply(imageData);
  }

  // Clipping overlay
  if (hasClippingOverlay && !hasFalseColor && !hasLuminanceVis && !hasZebras) {
    overlayManager.getClippingOverlay().apply(imageData);
  }

  // Single putImageData call
  canvasCtx.putImageData(imageData, 0, 0);
}
