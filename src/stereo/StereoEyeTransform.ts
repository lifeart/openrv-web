/**
 * Per-Eye Geometric Transforms for Stereo Alignment Correction
 *
 * Implements independent geometric transformations for left and right eyes:
 * - Flip horizontal/vertical
 * - Rotation (-180 to +180 degrees)
 * - Scale (0.5 to 2.0)
 * - Translation (-100 to +100 pixels)
 *
 * Transforms are applied in order: flip -> rotation -> scale -> translation
 *
 * Reference: OpenRV StereoIPNode.cpp per-eye transform pipeline
 */

/** Per-eye geometric transform */
export interface EyeTransform {
  flipH: boolean;       // Horizontal flip (flop)
  flipV: boolean;       // Vertical flip
  rotation: number;     // Degrees, -180 to +180
  scale: number;        // Uniform scale factor, 0.5 to 2.0
  translateX: number;   // Horizontal offset in pixels, -100 to +100
  translateY: number;   // Vertical offset in pixels, -100 to +100
}

/** Complete per-eye transform state */
export interface StereoEyeTransformState {
  left: EyeTransform;
  right: EyeTransform;
  linked: boolean;      // When true, L/R controls are mirrored
}

/** Alignment tool mode */
export type StereoAlignMode = 'off' | 'grid' | 'crosshair' | 'difference' | 'edges';

/** Default values */
export const DEFAULT_EYE_TRANSFORM: EyeTransform = {
  flipH: false,
  flipV: false,
  rotation: 0,
  scale: 1.0,
  translateX: 0,
  translateY: 0,
};

export const DEFAULT_STEREO_EYE_TRANSFORM_STATE: StereoEyeTransformState = {
  left: { ...DEFAULT_EYE_TRANSFORM },
  right: { ...DEFAULT_EYE_TRANSFORM },
  linked: false,
};

export const DEFAULT_STEREO_ALIGN_MODE: StereoAlignMode = 'off';

/** Ordered list of alignment modes for cycling */
export const STEREO_ALIGN_MODES: StereoAlignMode[] = ['off', 'grid', 'crosshair', 'difference', 'edges'];

/**
 * Check if an eye transform is at default values
 */
export function isDefaultEyeTransform(t: EyeTransform): boolean {
  return (
    t.flipH === false &&
    t.flipV === false &&
    t.rotation === 0 &&
    t.scale === 1.0 &&
    t.translateX === 0 &&
    t.translateY === 0
  );
}

/**
 * Check if the full stereo eye transform state is at default values
 */
export function isDefaultStereoEyeTransformState(state: StereoEyeTransformState): boolean {
  return isDefaultEyeTransform(state.left) && isDefaultEyeTransform(state.right);
}

/**
 * Clamp a rotation value to [-180, 180]
 */
export function clampRotation(value: number): number {
  return Math.max(-180, Math.min(180, value));
}

/**
 * Clamp a scale value to [0.5, 2.0]
 */
export function clampScale(value: number): number {
  return Math.max(0.5, Math.min(2.0, value));
}

/**
 * Clamp a translation value to [-100, 100]
 */
export function clampTranslation(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

/**
 * Apply horizontal flip to image data
 */
export function applyFlipH(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = (y * width + (width - 1 - x)) * 4;
      result.data[dstIdx] = data[srcIdx]!;
      result.data[dstIdx + 1] = data[srcIdx + 1]!;
      result.data[dstIdx + 2] = data[srcIdx + 2]!;
      result.data[dstIdx + 3] = data[srcIdx + 3]!;
    }
  }

  return result;
}

/**
 * Apply vertical flip to image data
 */
export function applyFlipV(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = ((height - 1 - y) * width + x) * 4;
      result.data[dstIdx] = data[srcIdx]!;
      result.data[dstIdx + 1] = data[srcIdx + 1]!;
      result.data[dstIdx + 2] = data[srcIdx + 2]!;
      result.data[dstIdx + 3] = data[srcIdx + 3]!;
    }
  }

  return result;
}

/**
 * Apply rotation around image center
 * Uses inverse mapping with nearest-neighbor sampling
 */
export function applyRotation(imageData: ImageData, angleDeg: number): ImageData {
  if (angleDeg === 0) return imageData;

  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const srcX = Math.round(cos * dx - sin * dy + cx);
      const srcY = Math.round(sin * dx + cos * dy + cy);
      const dstIdx = (y * width + x) * 4;

      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const srcIdx = (srcY * width + srcX) * 4;
        result.data[dstIdx] = data[srcIdx]!;
        result.data[dstIdx + 1] = data[srcIdx + 1]!;
        result.data[dstIdx + 2] = data[srcIdx + 2]!;
        result.data[dstIdx + 3] = data[srcIdx + 3]!;
      } else {
        result.data[dstIdx + 3] = 255; // Black fill for out-of-bounds
      }
    }
  }
  return result;
}

/**
 * Apply center-origin uniform scaling
 */
export function applyScale(imageData: ImageData, scaleFactor: number): ImageData {
  if (scaleFactor === 1.0) return imageData;

  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = Math.round((x - cx) / scaleFactor + cx);
      const srcY = Math.round((y - cy) / scaleFactor + cy);
      const dstIdx = (y * width + x) * 4;

      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const srcIdx = (srcY * width + srcX) * 4;
        result.data[dstIdx] = data[srcIdx]!;
        result.data[dstIdx + 1] = data[srcIdx + 1]!;
        result.data[dstIdx + 2] = data[srcIdx + 2]!;
        result.data[dstIdx + 3] = data[srcIdx + 3]!;
      } else {
        result.data[dstIdx + 3] = 255; // Black fill
      }
    }
  }
  return result;
}

/**
 * Apply X/Y pixel translation
 */
export function applyTranslation(imageData: ImageData, tx: number, ty: number): ImageData {
  if (tx === 0 && ty === 0) return imageData;

  const { width, height, data } = imageData;
  const result = new ImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = x - Math.round(tx);
      const srcY = y - Math.round(ty);
      const dstIdx = (y * width + x) * 4;

      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const srcIdx = (srcY * width + srcX) * 4;
        result.data[dstIdx] = data[srcIdx]!;
        result.data[dstIdx + 1] = data[srcIdx + 1]!;
        result.data[dstIdx + 2] = data[srcIdx + 2]!;
        result.data[dstIdx + 3] = data[srcIdx + 3]!;
      } else {
        result.data[dstIdx + 3] = 255; // Black fill for out-of-bounds
      }
    }
  }
  return result;
}

/**
 * Apply all transforms for a single eye in the correct order:
 * flip -> rotation -> scale -> translation
 */
export function applyEyeTransform(imageData: ImageData, transform: EyeTransform): ImageData {
  if (isDefaultEyeTransform(transform)) return imageData;

  let result = imageData;

  // 1. Flip horizontal
  if (transform.flipH) {
    result = applyFlipH(result);
  }

  // 2. Flip vertical
  if (transform.flipV) {
    result = applyFlipV(result);
  }

  // 3. Rotation
  if (transform.rotation !== 0) {
    result = applyRotation(result, clampRotation(transform.rotation));
  }

  // 4. Scale
  if (transform.scale !== 1.0) {
    result = applyScale(result, clampScale(transform.scale));
  }

  // 5. Translation
  if (transform.translateX !== 0 || transform.translateY !== 0) {
    result = applyTranslation(
      result,
      clampTranslation(transform.translateX),
      clampTranslation(transform.translateY)
    );
  }

  return result;
}
