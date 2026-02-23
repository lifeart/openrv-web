export type WipeMode = 'off' | 'horizontal' | 'vertical' | 'quad' | 'splitscreen-h' | 'splitscreen-v';
export type WipeSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * Stencil box defining a visible region in normalized 0-1 coordinates.
 * Matches OpenRV's stencil.visibleBox: [xMin, xMax, yMin, yMax].
 * Default [0, 1, 0, 1] means the entire image is visible.
 */
export type StencilBox = [xMin: number, xMax: number, yMin: number, yMax: number];

/** Default stencil box: full image visible */
export const DEFAULT_STENCIL_BOX: StencilBox = [0, 1, 0, 1];

/**
 * Check whether a stencil box is active (not the full-image default).
 */
export function isStencilBoxActive(box: StencilBox): boolean {
  return box[0] > 0 || box[1] < 1 || box[2] > 0 || box[3] < 1;
}

/**
 * Compute stencil boxes for a horizontal wipe at the given position.
 * Returns [leftBox, rightBox] where position 0-1 splits the image.
 */
export function computeHorizontalWipeBoxes(position: number): [StencilBox, StencilBox] {
  const p = Math.max(0, Math.min(1, position));
  return [
    [0, p, 0, 1],  // left input: visible from 0 to position
    [p, 1, 0, 1],  // right input: visible from position to 1
  ];
}

/**
 * Compute stencil boxes for a vertical wipe at the given position.
 * Returns [topBox, bottomBox] where position 0-1 splits the image.
 */
export function computeVerticalWipeBoxes(position: number): [StencilBox, StencilBox] {
  const p = Math.max(0, Math.min(1, position));
  return [
    [0, 1, 0, p],  // top input: visible from 0 to position
    [0, 1, p, 1],  // bottom input: visible from position to 1
  ];
}

export interface WipeState {
  mode: WipeMode;
  position: number;  // 0-1, position of wipe line
  showOriginal: WipeSide;  // Which side shows original (no color adjustments)
}

export const DEFAULT_WIPE_STATE: WipeState = {
  mode: 'off',
  position: 0.5,
  showOriginal: 'left',
};
