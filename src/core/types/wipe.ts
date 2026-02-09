export type WipeMode = 'off' | 'horizontal' | 'vertical' | 'quad' | 'splitscreen-h' | 'splitscreen-v';
export type WipeSide = 'left' | 'right' | 'top' | 'bottom';

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
