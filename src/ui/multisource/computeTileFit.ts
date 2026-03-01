/**
 * computeTileFit - Per-tile aspect-ratio fitting calculation.
 *
 * Computes scale and offset to center a source image within a tile viewport
 * while preserving the source's native aspect ratio (letterbox/pillarbox).
 */

/** Result of the tile fit computation. */
export interface TileFitResult {
  /** X offset within tile (normalized 0..1) */
  offsetX: number;
  /** Y offset within tile (normalized 0..1) */
  offsetY: number;
  /** Horizontal scale factor (0..1) */
  scaleX: number;
  /** Vertical scale factor (0..1) */
  scaleY: number;
}

/**
 * Compute the fit parameters for rendering a source within a tile.
 *
 * The source is scaled to fit entirely within the tile while preserving
 * its aspect ratio. Excess space is distributed equally on both sides
 * (letterbox for wider tiles, pillarbox for taller tiles).
 *
 * @param sourceWidth - Source image width in pixels
 * @param sourceHeight - Source image height in pixels
 * @param tileWidth - Tile viewport width in pixels
 * @param tileHeight - Tile viewport height in pixels
 * @returns Fit parameters with offset and scale in normalized [0..1] space
 */
export function computeTileFit(
  sourceWidth: number,
  sourceHeight: number,
  tileWidth: number,
  tileHeight: number,
): TileFitResult {
  // Guard against zero dimensions
  if (sourceWidth <= 0 || sourceHeight <= 0 || tileWidth <= 0 || tileHeight <= 0) {
    return { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const tileAspect = tileWidth / tileHeight;

  let scaleX: number;
  let scaleY: number;

  if (sourceAspect > tileAspect) {
    // Source is wider than tile: fit horizontally, letterbox vertically
    scaleX = 1.0;
    scaleY = tileAspect / sourceAspect;
  } else {
    // Source is taller than tile: fit vertically, pillarbox horizontally
    scaleX = sourceAspect / tileAspect;
    scaleY = 1.0;
  }

  const offsetX = (1.0 - scaleX) / 2;
  const offsetY = (1.0 - scaleY) / 2;

  return { offsetX, offsetY, scaleX, scaleY };
}
