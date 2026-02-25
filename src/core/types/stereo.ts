export type StereoMode =
  | 'off'
  | 'side-by-side'
  | 'over-under'
  | 'mirror'
  | 'anaglyph'
  | 'anaglyph-luminance'
  | 'checkerboard'
  | 'scanline'
  | 'left-only'
  | 'right-only';

export type StereoInputFormat = 'side-by-side' | 'over-under' | 'separate';

export interface StereoState {
  mode: StereoMode;
  eyeSwap: boolean;
  offset: number; // Relative eye offset as percentage of width (-50 to 50)
}

export const DEFAULT_STEREO_STATE: StereoState = {
  mode: 'off',
  eyeSwap: false,
  offset: 0,
};
