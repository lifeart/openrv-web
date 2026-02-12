export type BackgroundPatternType =
  | 'black'
  | 'grey18'
  | 'grey50'
  | 'white'
  | 'checker'
  | 'crosshatch'
  | 'custom';

export interface BackgroundPatternState {
  pattern: BackgroundPatternType;
  checkerSize: 'small' | 'medium' | 'large';
  customColor: string;
}

export const DEFAULT_BACKGROUND_PATTERN_STATE: BackgroundPatternState = {
  pattern: 'black',
  checkerSize: 'medium',
  customColor: '#1a1a1a',
};

export const PATTERN_COLORS: Record<string, string> = {
  black: '#000000',
  grey18: '#2e2e2e',
  grey50: '#808080',
  white: '#ffffff',
  checkerLight: '#808080',
  checkerDark: '#404040',
  crosshatchBg: '#404040',
  crosshatchLine: '#808080',
};
