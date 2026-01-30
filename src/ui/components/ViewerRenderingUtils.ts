/**
 * Viewer Rendering Utilities Module
 * Contains rendering helper functions for transforms, crop overlay, and filter strings.
 */

import { ColorAdjustments } from './ColorControls';
import { Transform2D } from './TransformControl';
import { CropState, CropRegion } from './CropControl';
import { getCSSColor } from '../../utils/getCSSColor';

/**
 * Draw image/video with rotation and flip transforms applied.
 * Uses high-quality image smoothing for best picture quality.
 */
export function drawWithTransform(
  ctx: CanvasRenderingContext2D,
  element: CanvasImageSource,
  displayWidth: number,
  displayHeight: number,
  transform: Transform2D
): void {
  const { rotation, flipH, flipV } = transform;

  // Enable high-quality image smoothing for best picture quality
  ctx.imageSmoothingEnabled = true;
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

  // For 90/270 rotation, we need to swap the draw dimensions
  let drawWidth = displayWidth;
  let drawHeight = displayHeight;
  if (rotation === 90 || rotation === 270) {
    // When rotated 90/270, the source needs to fill the rotated space
    // We need to scale to fit the rotated dimensions
    let sourceAspect: number;
    if (element instanceof HTMLVideoElement) {
      sourceAspect = element.videoHeight > 0 ? element.videoWidth / element.videoHeight : 1;
    } else if (element instanceof HTMLImageElement) {
      sourceAspect = element.naturalHeight > 0 ? element.naturalWidth / element.naturalHeight : 1;
    } else if (element instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && element instanceof OffscreenCanvas)) {
      sourceAspect = element.height > 0 ? element.width / element.height : 1;
    } else {
      sourceAspect = displayHeight > 0 ? displayWidth / displayHeight : 1; // Fallback
    }
    const targetAspect = displayWidth > 0 ? displayHeight / displayWidth : 1; // Swapped for rotation

    if (sourceAspect > targetAspect) {
      drawHeight = displayWidth;
      drawWidth = displayWidth * sourceAspect;
    } else {
      drawWidth = displayHeight;
      drawHeight = sourceAspect > 0 ? displayHeight / sourceAspect : displayHeight;
    }
    // Swap for rotated coordinate system
    [drawWidth, drawHeight] = [drawHeight, drawWidth];
  }

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

  // Brightness: CSS uses 1 = normal, we use -1 to +1 offset
  const brightness = 1 + adjustments.brightness;
  if (brightness !== 1) {
    filters.push(`brightness(${brightness.toFixed(3)})`);
  }

  // Exposure: simulate with brightness (2^exposure)
  if (adjustments.exposure !== 0) {
    const exposureBrightness = Math.pow(2, adjustments.exposure);
    filters.push(`brightness(${exposureBrightness.toFixed(3)})`);
  }

  // Contrast: CSS uses 1 = normal
  if (adjustments.contrast !== 1) {
    filters.push(`contrast(${adjustments.contrast.toFixed(3)})`);
  }

  // Saturation: CSS uses 1 = normal
  if (adjustments.saturation !== 1) {
    filters.push(`saturate(${adjustments.saturation.toFixed(3)})`);
  }

  // Temperature: approximate with hue-rotate and sepia
  if (adjustments.temperature !== 0) {
    const temp = adjustments.temperature;
    if (temp > 0) {
      const sepia = Math.min(temp / 200, 0.3);
      filters.push(`sepia(${sepia.toFixed(3)})`);
    } else {
      const hue = temp * 0.3;
      filters.push(`hue-rotate(${hue.toFixed(1)}deg)`);
    }
  }

  // Tint: approximate with hue-rotate
  if (adjustments.tint !== 0) {
    const hue = adjustments.tint * 0.5;
    filters.push(`hue-rotate(${hue.toFixed(1)}deg)`);
  }

  return filters;
}

/**
 * Build CSS filter string from color adjustments.
 * Uses cache to avoid rebuilding if adjustments haven't changed.
 */
export function getCanvasFilterString(
  adjustments: ColorAdjustments,
  cache: FilterStringCache
): string {
  // Check if cached filter is still valid
  if (cache.filterString !== null && cache.cachedAdjustments !== null) {
    const cached = cache.cachedAdjustments;
    if (
      adjustments.brightness === cached.brightness &&
      adjustments.exposure === cached.exposure &&
      adjustments.contrast === cached.contrast &&
      adjustments.saturation === cached.saturation &&
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
export function buildContainerFilterString(
  adjustments: ColorAdjustments,
  blurAmount: number
): string {
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
  isEditing: boolean = true
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
  zoom: number
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
      const isLight = ((x / size) + (y / size)) % 2 === 0;
      ctx.fillStyle = isLight ? lightColor : darkColor;
      ctx.fillRect(x, y, size, size);
    }
  }

  // Draw text (scale font with zoom)
  const baseFontSize = 24;
  const fontSize = Math.max(10, Math.floor(baseFontSize * zoom));
  ctx.fillStyle = getCSSColor('--text-secondary', '#666');
  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Drop image or video here', w / 2, h / 2 - fontSize);

  const smallFontSize = Math.max(8, Math.floor(14 * zoom));
  ctx.font = `${smallFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillStyle = getCSSColor('--text-muted', '#555');
  ctx.fillText('Supports: PNG, JPEG, WebP, GIF, MP4, WebM', w / 2, h / 2 + smallFontSize);
}

/**
 * Calculate display dimensions for a source at a given zoom level.
 * Applies fit-to-container scaling with zoom factor.
 */
export function calculateDisplayDimensions(
  sourceWidth: number,
  sourceHeight: number,
  containerWidth: number,
  containerHeight: number,
  zoom: number
): { width: number; height: number } {
  // Guard against zero/negative dimensions
  if (sourceWidth <= 0 || sourceHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { width: 1, height: 1 };
  }

  // Calculate fit scale (never exceed 1x to avoid upscaling beyond source)
  const fitScale = Math.min(
    containerWidth / sourceWidth,
    containerHeight / sourceHeight,
    1
  );

  // Apply zoom
  const scale = fitScale * zoom;
  const width = Math.max(1, Math.floor(sourceWidth * scale));
  const height = Math.max(1, Math.floor(sourceHeight * scale));

  return { width, height };
}

/**
 * Check if crop region covers the full image (no clipping needed).
 * Uses epsilon comparison to handle floating-point imprecision from drag operations.
 */
export function isFullCropRegion(region: CropRegion): boolean {
  const EPS = 1e-6;
  return Math.abs(region.x) < EPS && Math.abs(region.y) < EPS
    && Math.abs(region.width - 1) < EPS && Math.abs(region.height - 1) < EPS;
}

/**
 * Draw image/video with rotation and flip transforms, filling the target canvas.
 * Unlike drawWithTransform (for display), this function draws to fill the entire
 * canvas without letterboxing, used for exports where we want pixel-perfect output.
 * For 90/270 rotation, the canvas should already be sized with swapped dimensions.
 * Uses high-quality image smoothing for best picture quality.
 */
export function drawWithTransformFill(
  ctx: CanvasRenderingContext2D,
  element: CanvasImageSource,
  canvasWidth: number,
  canvasHeight: number,
  transform: Transform2D
): void {
  const { rotation, flipH, flipV } = transform;

  // Enable high-quality image smoothing for best picture quality
  ctx.imageSmoothingEnabled = true;
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

  // For 90/270 rotation, swap draw dimensions since the canvas is already swapped
  let drawWidth = canvasWidth;
  let drawHeight = canvasHeight;
  if (rotation === 90 || rotation === 270) {
    // Canvas dimensions are swapped (height x width), so we draw with swapped dimensions
    // to fill the canvas after rotation
    drawWidth = canvasHeight;
    drawHeight = canvasWidth;
  }

  // Draw centered (will fill canvas after transform)
  ctx.drawImage(element, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

  ctx.restore();
}

/**
 * Get effective dimensions after rotation transform.
 * For 90/270 rotation, width and height are swapped.
 */
export function getEffectiveDimensions(
  width: number,
  height: number,
  rotation: 0 | 90 | 180 | 270
): { width: number; height: number } {
  if (rotation === 90 || rotation === 270) {
    return { width: height, height: width };
  }
  return { width, height };
}
