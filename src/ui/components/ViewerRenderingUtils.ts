/**
 * Viewer Rendering Utilities Module
 * Contains rendering helper functions for transforms, crop overlay, and filter strings.
 */

import { type ColorAdjustments } from './ColorControls';
import { type Transform2D } from './TransformControl';
import { type CropState, type CropRegion } from './CropControl';
import { getCSSColor } from '../../utils/ui/getCSSColor';
import { MAX_CANVAS_DIMENSION } from './ScalePresets';

/**
 * Draw image/video with rotation and flip transforms applied.
 * Image smoothing defaults to enabled (bilinear) but can be disabled for nearest-neighbor QC.
 */
export function drawWithTransform(
  ctx: CanvasRenderingContext2D,
  element: CanvasImageSource,
  displayWidth: number,
  displayHeight: number,
  transform: Transform2D,
  smoothingEnabled = true,
): void {
  const { rotation, flipH, flipV } = transform;

  // Image smoothing: bilinear when true, nearest-neighbor when false
  ctx.imageSmoothingEnabled = smoothingEnabled;
  ctx.imageSmoothingQuality = 'high';

  // If no transforms, just draw normally
  if (rotation === 0 && !flipH && !flipV) {
    ctx.drawImage(element, 0, 0, displayWidth, displayHeight);
    return;
  }

  ctx.save();

  // Move to center for transformations
  ctx.translate(displayWidth / 2, displayHeight / 2);

  // Apply rotation
  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }

  // Apply flips
  const scaleX = flipH ? -1 : 1;
  const scaleY = flipV ? -1 : 1;
  if (flipH || flipV) {
    ctx.scale(scaleX, scaleY);
  }

  // Compute draw dimensions using AABB: scale the source so the rotated
  // bounding box fits within the display area.
  const sourceW =
    (element as HTMLImageElement).naturalWidth || (element as HTMLVideoElement).videoWidth || displayWidth;
  const sourceH =
    (element as HTMLImageElement).naturalHeight || (element as HTMLVideoElement).videoHeight || displayHeight;
  const { width: bbW, height: bbH } = getEffectiveDimensions(sourceW, sourceH, rotation);
  const fitScaleX = displayWidth / bbW;
  const fitScaleY = displayHeight / bbH;
  const fitScale = Math.min(fitScaleX, fitScaleY);
  const drawWidth = sourceW * fitScale;
  const drawHeight = sourceH * fitScale;

  // Draw centered
  ctx.drawImage(element, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

  ctx.restore();
}

/**
 * Cache for filter string calculation to avoid rebuilding every frame.
 */
export interface FilterStringCache {
  filterString: string | null;
  cachedAdjustments: ColorAdjustments | null;
}

/**
 * Build CSS filter array from color adjustments (internal helper).
 */
function buildColorFilterArray(adjustments: ColorAdjustments): string[] {
  const filters: string[] = [];

  // Helper: only use a value if it is a finite number, otherwise fall back to default
  const safe = (value: number, fallback: number): number => (Number.isFinite(value) ? value : fallback);

  const brightness = 1 + safe(adjustments.brightness, 0);
  if (brightness !== 1) {
    filters.push(`brightness(${brightness.toFixed(3)})`);
  }

  // Exposure: simulate with brightness (2^exposure)
  const exposure = safe(adjustments.exposure, 0);
  if (exposure !== 0) {
    const exposureBrightness = Math.pow(2, exposure);
    filters.push(`brightness(${exposureBrightness.toFixed(3)})`);
  }

  // Contrast: CSS uses 1 = normal
  const contrast = safe(adjustments.contrast, 1);
  if (contrast !== 1) {
    filters.push(`contrast(${contrast.toFixed(3)})`);
  }

  // Saturation: CSS uses 1 = normal
  const saturation = safe(adjustments.saturation, 1);
  if (saturation !== 1) {
    filters.push(`saturate(${saturation.toFixed(3)})`);
  }

  // Hue rotation: global hue shift in degrees, normalize to [0, 360)
  const hueRotation = safe(adjustments.hueRotation, 0);
  const normalizedHue = ((hueRotation % 360) + 360) % 360;
  if (normalizedHue !== 0) {
    filters.push(`hue-rotate(${normalizedHue.toFixed(1)}deg)`);
  }

  // Temperature: approximate with hue-rotate and sepia
  const temperature = safe(adjustments.temperature, 0);
  if (temperature !== 0) {
    if (temperature > 0) {
      const sepia = Math.min(temperature / 200, 0.3);
      filters.push(`sepia(${sepia.toFixed(3)})`);
    } else {
      const hue = temperature * 0.3;
      filters.push(`hue-rotate(${hue.toFixed(1)}deg)`);
    }
  }

  // Tint: approximate with hue-rotate
  const tint = safe(adjustments.tint, 0);
  if (tint !== 0) {
    const hue = tint * 0.5;
    filters.push(`hue-rotate(${hue.toFixed(1)}deg)`);
  }

  return filters;
}

/**
 * Build CSS filter string from color adjustments.
 * Uses cache to avoid rebuilding if adjustments haven't changed.
 */
export function getCanvasFilterString(adjustments: ColorAdjustments, cache: FilterStringCache): string {
  // Check if cached filter is still valid
  if (cache.filterString !== null && cache.cachedAdjustments !== null) {
    const cached = cache.cachedAdjustments;
    if (
      adjustments.brightness === cached.brightness &&
      adjustments.exposure === cached.exposure &&
      adjustments.contrast === cached.contrast &&
      adjustments.saturation === cached.saturation &&
      adjustments.hueRotation === cached.hueRotation &&
      adjustments.temperature === cached.temperature &&
      adjustments.tint === cached.tint
    ) {
      return cache.filterString;
    }
  }

  const filters = buildColorFilterArray(adjustments);

  // Cache the result
  cache.filterString = filters.length > 0 ? filters.join(' ') : 'none';
  cache.cachedAdjustments = { ...adjustments };

  return cache.filterString;
}

/**
 * Build CSS filter string for the canvas container (includes blur).
 */
export function buildContainerFilterString(adjustments: ColorAdjustments, blurAmount: number): string {
  const filters = buildColorFilterArray(adjustments);

  // Blur filter effect
  if (blurAmount > 0) {
    filters.push(`blur(${blurAmount.toFixed(1)}px)`);
  }

  return filters.length > 0 ? filters.join(' ') : 'none';
}

/**
 * Render crop overlay on a canvas context.
 * Shows darkened areas outside the crop region with handles and guides when editing,
 * or a subtle border when crop is active but not being edited.
 * @param isEditing - Whether the user is actively editing the crop (panel open, dragging, etc.)
 */
export function renderCropOverlay(
  ctx: CanvasRenderingContext2D,
  cropState: CropState,
  displayWidth: number,
  displayHeight: number,
  isEditing: boolean = true,
): void {
  const w = displayWidth;
  const h = displayHeight;

  // Determine early if we need to render anything
  const shouldRender = cropState.enabled && !isFullCropRegion(cropState.region) && isEditing;

  // Always clear the overlay canvas
  ctx.clearRect(0, 0, w, h);

  if (!shouldRender) return;

  const region = cropState.region;
  const cropX = region.x * w;
  const cropY = region.y * h;
  const cropW = region.width * w;
  const cropH = region.height * h;

  // Full editing overlay: darkened areas, handles, and guides

  // Draw darkened areas outside crop region
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';

  // Top
  ctx.fillRect(0, 0, w, cropY);
  // Bottom
  ctx.fillRect(0, cropY + cropH, w, h - cropY - cropH);
  // Left
  ctx.fillRect(0, cropY, cropX, cropH);
  // Right
  ctx.fillRect(cropX + cropW, cropY, w - cropX - cropW, cropH);

  // Draw crop border
  ctx.strokeStyle = getCSSColor('--accent-primary', '#4a9eff');
  ctx.lineWidth = 2;
  ctx.strokeRect(cropX, cropY, cropW, cropH);

  // Draw corner handles
  const handleSize = 8;
  ctx.fillStyle = getCSSColor('--accent-primary', '#4a9eff');

  // Top-left
  ctx.fillRect(cropX - handleSize / 2, cropY - handleSize / 2, handleSize, handleSize);
  // Top-right
  ctx.fillRect(cropX + cropW - handleSize / 2, cropY - handleSize / 2, handleSize, handleSize);
  // Bottom-left
  ctx.fillRect(cropX - handleSize / 2, cropY + cropH - handleSize / 2, handleSize, handleSize);
  // Bottom-right
  ctx.fillRect(cropX + cropW - handleSize / 2, cropY + cropH - handleSize / 2, handleSize, handleSize);

  // Draw rule of thirds guides
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;

  // Vertical lines
  ctx.beginPath();
  ctx.moveTo(cropX + cropW / 3, cropY);
  ctx.lineTo(cropX + cropW / 3, cropY + cropH);
  ctx.moveTo(cropX + (cropW * 2) / 3, cropY);
  ctx.lineTo(cropX + (cropW * 2) / 3, cropY + cropH);
  // Horizontal lines
  ctx.moveTo(cropX, cropY + cropH / 3);
  ctx.lineTo(cropX + cropW, cropY + cropH / 3);
  ctx.moveTo(cropX, cropY + (cropH * 2) / 3);
  ctx.lineTo(cropX + cropW, cropY + (cropH * 2) / 3);
  ctx.stroke();
}

/**
 * Draw placeholder content when no source is loaded.
 *
 * This is a pure drawing function - it does NOT modify canvas dimensions.
 * The caller is responsible for setting up the canvas (including hi-DPI
 * configuration if desired) before calling this function.
 *
 * @param ctx - The 2D rendering context (already configured with proper transform)
 * @param logicalWidth - The logical width to draw within
 * @param logicalHeight - The logical height to draw within
 * @param zoom - The current zoom level for scaling UI elements
 */
export function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  logicalWidth: number,
  logicalHeight: number,
  zoom: number,
): void {
  const w = logicalWidth;
  const h = logicalHeight;

  // Clear first (using logical dimensions)
  ctx.clearRect(0, 0, w, h);

  // Draw checkerboard (scale size with zoom)
  const baseSize = 20;
  const size = Math.max(4, Math.floor(baseSize * zoom));
  const lightColor = getCSSColor('--bg-hover', '#2a2a2a');
  const darkColor = getCSSColor('--bg-secondary', '#222');
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      const isLight = (x / size + y / size) % 2 === 0;
      ctx.fillStyle = isLight ? lightColor : darkColor;
      ctx.fillRect(x, y, size, size);
    }
  }

  // The "drop files here" copy and supported-format hints are rendered as an
  // accessible DOM overlay (ViewerEmptyState) rather than painted here, so
  // they can be read by screen readers and offer a clickable "Open file"
  // action. Keep this canvas to the neutral checkerboard only.
}

/**
 * Calculate display dimensions for a source at a given zoom level.
 * Applies fit-to-container scaling with zoom factor.
 *
 * @param fitMode - The fit mode to use for scaling:
 *   - 'all' (default): fit both dimensions, no upscale
 *   - 'width': fill container width (may upscale)
 *   - 'height': fill container height (may upscale)
 */
export function calculateDisplayDimensions(
  sourceWidth: number,
  sourceHeight: number,
  containerWidth: number,
  containerHeight: number,
  zoom: number,
  fitMode: 'all' | 'width' | 'height' = 'all',
): { width: number; height: number } {
  // Guard against zero/negative dimensions
  if (sourceWidth <= 0 || sourceHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { width: 1, height: 1 };
  }

  // Calculate fit scale based on the active fit mode
  let fitScale: number;
  switch (fitMode) {
    case 'width':
      fitScale = containerWidth / sourceWidth;
      break;
    case 'height':
      fitScale = containerHeight / sourceHeight;
      break;
    case 'all':
    default:
      // Scale down to fit the container while preserving aspect ratio.
      // Only scale down images larger than the viewport; smaller images stay at native size.
      fitScale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight, 1);
      break;
  }

  // Apply zoom
  const scale = fitScale * zoom;
  let width = Math.max(1, Math.floor(sourceWidth * scale));
  let height = Math.max(1, Math.floor(sourceHeight * scale));

  // Cap dimensions to prevent GPU buffer overflow at high magnification.
  // The remaining magnification beyond the cap is achieved via CSS scaling.
  const maxDim = MAX_CANVAS_DIMENSION;
  if (width > maxDim || height > maxDim) {
    const scaleFactor = Math.min(maxDim / width, maxDim / height);
    width = Math.max(1, Math.floor(width * scaleFactor));
    height = Math.max(1, Math.floor(height * scaleFactor));
  }

  return { width, height };
}

/**
 * Check if crop region covers the full image (no clipping needed).
 * Uses epsilon comparison to handle floating-point imprecision from drag operations.
 */
export function isFullCropRegion(region: CropRegion): boolean {
  const EPS = 1e-6;
  return (
    Math.abs(region.x) < EPS &&
    Math.abs(region.y) < EPS &&
    Math.abs(region.width - 1) < EPS &&
    Math.abs(region.height - 1) < EPS
  );
}

/**
 * Draw image/video with rotation and flip transforms, filling the target canvas.
 * Unlike drawWithTransform (for display), this function draws to fill the entire
 * canvas without letterboxing, used for exports where we want pixel-perfect output.
 * For 90/270 rotation, the canvas should already be sized with swapped dimensions.
 * Image smoothing defaults to enabled (bilinear) but can be disabled for nearest-neighbor QC.
 */
export function drawWithTransformFill(
  ctx: CanvasRenderingContext2D,
  element: CanvasImageSource,
  canvasWidth: number,
  canvasHeight: number,
  transform: Transform2D,
  smoothingEnabled = true,
): void {
  const { rotation, flipH, flipV } = transform;

  // Image smoothing: bilinear when true, nearest-neighbor when false
  ctx.imageSmoothingEnabled = smoothingEnabled;
  ctx.imageSmoothingQuality = 'high';

  // If no transforms, just draw normally
  if (rotation === 0 && !flipH && !flipV) {
    ctx.drawImage(element, 0, 0, canvasWidth, canvasHeight);
    return;
  }

  ctx.save();

  // Move to center for transformations
  ctx.translate(canvasWidth / 2, canvasHeight / 2);

  // Apply rotation
  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }

  // Apply flips
  const scaleX = flipH ? -1 : 1;
  const scaleY = flipV ? -1 : 1;
  if (flipH || flipV) {
    ctx.scale(scaleX, scaleY);
  }

  // Compute draw dimensions from AABB: the canvas is sized to the bounding box,
  // so we need to figure out the source dimensions to draw at.
  const sourceW = (element as HTMLImageElement).naturalWidth || (element as HTMLVideoElement).videoWidth || canvasWidth;
  const sourceH =
    (element as HTMLImageElement).naturalHeight || (element as HTMLVideoElement).videoHeight || canvasHeight;
  const { width: bbW, height: bbH } = getEffectiveDimensions(sourceW, sourceH, rotation);
  const fitScaleX = canvasWidth / bbW;
  const fitScaleY = canvasHeight / bbH;
  const fitScale = Math.min(fitScaleX, fitScaleY);
  const drawWidth = sourceW * fitScale;
  const drawHeight = sourceH * fitScale;

  // Draw centered (will fill canvas after transform)
  ctx.drawImage(element, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

  ctx.restore();
}

/**
 * Get effective dimensions after rotation transform.
 * Computes the axis-aligned bounding box (AABB) of the rotated rectangle.
 * For cardinal angles (0, 90, 180, 270), this produces exact results
 * identical to the previous swap-based implementation.
 */
export function getEffectiveDimensions(
  width: number,
  height: number,
  rotation: number,
): { width: number; height: number } {
  const rad = (rotation * Math.PI) / 180;
  let absCos = Math.abs(Math.cos(rad));
  let absSin = Math.abs(Math.sin(rad));

  // Epsilon snap for cardinal angles: Math.cos(PI/2) is ~6.12e-17, not 0.
  // Without this, ceil() can produce off-by-one dimensions at 90/180/270.
  const EPSILON = 1e-10;
  if (absCos < EPSILON) absCos = 0;
  if (absSin < EPSILON) absSin = 0;
  if (Math.abs(absCos - 1) < EPSILON) absCos = 1;
  if (Math.abs(absSin - 1) < EPSILON) absSin = 1;

  return {
    width: Math.ceil(width * absCos + height * absSin),
    height: Math.ceil(width * absSin + height * absCos),
  };
}
