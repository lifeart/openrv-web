/**
 * Rotation utility functions for arbitrary angle rotation support.
 *
 * All angles are in degrees. Internal representation uses [0, 360) normalization.
 */

/**
 * Normalize an angle in degrees to the range [0, 360).
 * Handles negative values, values >= 360, and NaN (returns 0).
 */
export function normalizeAngle(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return ((degrees % 360) + 360) % 360;
}

/**
 * Default snap targets: every 45 degrees.
 */
export const DEFAULT_SNAP_TARGETS = [0, 45, 90, 135, 180, 225, 270, 315] as const;

/**
 * Default snap threshold in degrees.
 */
export const DEFAULT_SNAP_THRESHOLD = 5;

/**
 * Snap an angle to the nearest common angle if within a threshold.
 * Returns the snapped angle if within threshold, otherwise the original (normalized) angle.
 *
 * @param degrees - The angle in degrees
 * @param threshold - Maximum distance in degrees to snap (default: 5)
 * @param snapTargets - Array of target angles to snap to (default: every 45 degrees)
 */
export function snapAngle(
  degrees: number,
  threshold: number = DEFAULT_SNAP_THRESHOLD,
  snapTargets: readonly number[] = DEFAULT_SNAP_TARGETS,
): number {
  const normalized = normalizeAngle(degrees);

  for (const target of snapTargets) {
    // Calculate angular distance accounting for wrap-around (e.g., 359 -> 0)
    const distance = Math.abs(normalizeAngle(normalized - target));
    const wrappedDistance = Math.min(distance, 360 - distance);
    if (wrappedDistance <= threshold) {
      return normalizeAngle(target);
    }
  }

  return normalized;
}

/**
 * Check if an angle is a cardinal angle (0, 90, 180, 270) within epsilon tolerance.
 */
export function isCardinalAngle(degrees: number, epsilon: number = 0.01): boolean {
  const normalized = normalizeAngle(degrees);
  const cardinals = [0, 90, 180, 270];
  for (const cardinal of cardinals) {
    const distance = Math.abs(normalized - cardinal);
    const wrappedDistance = Math.min(distance, 360 - distance);
    if (wrappedDistance < epsilon) {
      return true;
    }
  }
  return false;
}

/**
 * Build a 2x2 rotation matrix for use in the vertex shader.
 * The matrix rotates texture coordinates clockwise (CW) by the given angle.
 *
 * Returns a 4-element array in column-major order (WebGL convention):
 *   [cos, sin, -sin, cos]
 *
 * @param degrees - Rotation angle in degrees (clockwise)
 */
export function getRotationMatrix2x2(degrees: number): Float32Array {
  const rad = -(degrees * Math.PI) / 180; // negative for CW in texture space
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Column-major: [col0.x, col0.y, col1.x, col1.y]
  return new Float32Array([cos, sin, -sin, cos]);
}
