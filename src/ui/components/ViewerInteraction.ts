/**
 * Viewer Interaction Module
 * Handles pointer/touch events, coordinate conversion, and zoom calculations.
 */

import { StrokePoint } from '../../paint/types';

export interface PointerState {
  pointerId: number;
  x: number;
  y: number;
}

/**
 * Convert client coordinates to normalized canvas coordinates.
 * Returns StrokePoint with x, y normalized to 0-1, and pressure.
 */
export function getCanvasPoint(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  displayWidth: number,
  displayHeight: number,
  pressure: number = 0.5
): StrokePoint | null {
  if (displayWidth === 0 || displayHeight === 0) return null;
  if (canvasRect.width === 0 || canvasRect.height === 0) return null;

  // Get position relative to canvas
  const canvasX = clientX - canvasRect.left;
  const canvasY = clientY - canvasRect.top;

  // Convert to normalized coordinates (0,0 = bottom-left for OpenRV compatibility)
  // Account for CSS scaling
  const scaleX = displayWidth / canvasRect.width;
  const scaleY = displayHeight / canvasRect.height;

  // Calculate normalized position and clamp to valid range
  const x = Math.max(0, Math.min(1, (canvasX * scaleX) / displayWidth));
  const y = Math.max(0, Math.min(1, 1 - (canvasY * scaleY) / displayHeight));

  return { x, y, pressure };
}

/**
 * Calculate zoom based on scroll wheel event.
 * Returns new zoom level or null if no change needed.
 */
export function calculateWheelZoom(
  deltaY: number,
  currentZoom: number,
  minZoom: number = 0.1,
  maxZoom: number = 10
): number | null {
  const zoomFactor = deltaY > 0 ? 0.9 : 1.1;
  const newZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom * zoomFactor));

  if (newZoom === currentZoom) return null;
  return newZoom;
}

/**
 * Calculate new pan offsets to keep a point stationary during zoom.
 * Used for zoom-to-cursor behavior.
 */
export function calculateZoomPan(
  mouseX: number,
  mouseY: number,
  containerWidth: number,
  containerHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  currentPanX: number,
  currentPanY: number,
  oldZoom: number,
  newZoom: number
): { panX: number; panY: number } {
  // Guard against zero dimensions
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { panX: currentPanX, panY: currentPanY };
  }

  // Calculate fit scale
  const fitScale = Math.min(
    containerWidth / sourceWidth,
    containerHeight / sourceHeight,
    1
  );

  const oldDisplayWidth = sourceWidth * fitScale * oldZoom;
  const oldDisplayHeight = sourceHeight * fitScale * oldZoom;
  const newDisplayWidth = sourceWidth * fitScale * newZoom;
  const newDisplayHeight = sourceHeight * fitScale * newZoom;

  // Guard against zero display dimensions
  if (oldDisplayWidth <= 0 || oldDisplayHeight <= 0) {
    return { panX: currentPanX, panY: currentPanY };
  }

  // Canvas position before zoom
  const oldCanvasLeft = (containerWidth - oldDisplayWidth) / 2 + currentPanX;
  const oldCanvasTop = (containerHeight - oldDisplayHeight) / 2 + currentPanY;

  // Mouse position relative to old canvas (in pixels)
  const mouseOnCanvasX = mouseX - oldCanvasLeft;
  const mouseOnCanvasY = mouseY - oldCanvasTop;

  // Normalized position on canvas (0-1)
  const normalizedX = mouseOnCanvasX / oldDisplayWidth;
  const normalizedY = mouseOnCanvasY / oldDisplayHeight;

  // After zoom, same normalized position should be under mouse
  const newPanX = mouseX - (containerWidth - newDisplayWidth) / 2 - normalizedX * newDisplayWidth;
  const newPanY = mouseY - (containerHeight - newDisplayHeight) / 2 - normalizedY * newDisplayHeight;

  return { panX: newPanX, panY: newPanY };
}

/**
 * Calculate pinch distance between two pointers.
 */
export function calculatePinchDistance(pointers: PointerState[]): number {
  if (pointers.length !== 2) return 0;

  const dx = pointers[1]!.x - pointers[0]!.x;
  const dy = pointers[1]!.y - pointers[0]!.y;
  return Math.hypot(dx, dy);
}

/**
 * Calculate new zoom level from pinch gesture.
 */
export function calculatePinchZoom(
  initialDistance: number,
  currentDistance: number,
  initialZoom: number,
  minZoom: number = 0.1,
  maxZoom: number = 10
): number | null {
  if (initialDistance <= 0 || currentDistance <= 0) return null;

  const scale = currentDistance / initialDistance;
  const newZoom = Math.max(minZoom, Math.min(maxZoom, initialZoom * scale));

  return newZoom;
}

/**
 * Check if an element is part of the viewer's canvas content.
 * Used to filter out events from overlay UI elements.
 */
export function isViewerContentElement(
  element: HTMLElement,
  container: HTMLElement,
  canvasContainer: HTMLElement,
  imageCanvas: HTMLCanvasElement,
  paintCanvas: HTMLCanvasElement,
  cropOverlay: HTMLCanvasElement | null,
  wipeLine: HTMLElement | null,
  splitLine: HTMLElement | null = null
): boolean {
  return (
    element === container ||
    element === imageCanvas ||
    element === paintCanvas ||
    element === cropOverlay ||
    element === wipeLine ||
    element === splitLine ||
    element === canvasContainer ||
    canvasContainer.contains(element)
  );
}

/**
 * Get pixel coordinates from client position for color sampling.
 * Returns null if outside canvas bounds.
 */
export function getPixelCoordinates(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  displayWidth: number,
  displayHeight: number
): { x: number; y: number } | null {
  const x = clientX - canvasRect.left;
  const y = clientY - canvasRect.top;

  // Check if within canvas bounds (use >= for upper bound since valid coords are 0 to size-1)
  if (x < 0 || y < 0 || x >= canvasRect.width || y >= canvasRect.height) {
    return null;
  }

  // Scale to canvas pixel coordinates
  const scaleX = displayWidth / canvasRect.width;
  const scaleY = displayHeight / canvasRect.height;
  const canvasX = Math.floor(x * scaleX);
  const canvasY = Math.floor(y * scaleY);

  return { x: canvasX, y: canvasY };
}

/**
 * Get pixel color from ImageData at given coordinates.
 * Returns null if coordinates are out of bounds.
 */
export function getPixelColor(
  imageData: ImageData,
  x: number,
  y: number
): { r: number; g: number; b: number } | null {
  const pixelIndex = (y * imageData.width + x) * 4;

  if (pixelIndex < 0 || pixelIndex + 2 >= imageData.data.length) {
    return null;
  }

  return {
    r: imageData.data[pixelIndex]!,
    g: imageData.data[pixelIndex + 1]!,
    b: imageData.data[pixelIndex + 2]!,
  };
}
