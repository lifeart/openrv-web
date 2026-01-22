/**
 * Shared Theme Constants
 *
 * Centralized color and styling constants for consistent UI appearance.
 */

// Background colors
export const COLORS = {
  // Backgrounds
  bgPanel: '#2a2a2a',
  bgHover: '#3a3a3a',
  bgPressed: '#444',

  // Borders
  borderDefault: '#4a4a4a',
  borderHover: '#555',

  // Text
  textDefault: '#ccc',
  textMuted: '#999',
  textDisabled: '#666',
  textBright: '#fff',

  // Accent/Primary
  accent: '#4a9eff',
  accentHover: '#5aafff',
  accentPressed: '#3a8eef',
  accentBg: 'rgba(74, 158, 255, 0.15)',
  accentBgStrong: 'rgba(74, 158, 255, 0.2)',

  // Danger
  danger: '#dc3545',
  dangerHover: '#e04555',
  dangerPressed: '#c82535',

  // Shadows
  shadowDropdown: '0 4px 12px rgba(0, 0, 0, 0.4)',
} as const;

// Z-index layers
export const Z_INDEX = {
  dropdown: 9999,
  modal: 10000,
  tooltip: 10001,
} as const;

// Timing
export const TRANSITIONS = {
  fast: '0.12s ease',
  normal: '0.2s ease',
} as const;
