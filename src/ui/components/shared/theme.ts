/**
 * Shared Theme Constants
 *
 * Centralized color and styling constants for consistent UI appearance.
 */

// Background colors - Use CSS variables with fallbacks for theming support
export const COLORS = {
  // Backgrounds
  bgPanel: 'var(--bg-secondary)',
  bgHover: 'var(--bg-hover)',
  bgPressed: 'var(--border-primary)',

  // Borders
  borderDefault: 'var(--border-primary)',
  borderHover: 'var(--border-secondary)',

  // Text
  textDefault: 'var(--text-primary)',
  textMuted: 'var(--text-muted)',
  textDisabled: 'var(--text-muted)',
  textBright: 'var(--text-on-accent)',

  // Accent/Primary
  accent: 'var(--accent-primary)',
  accentHover: 'var(--accent-hover)',
  accentPressed: 'var(--accent-active)',
  accentBg: 'rgba(var(--accent-primary-rgb), 0.15)',
  accentBgStrong: 'rgba(var(--accent-primary-rgb), 0.2)',

  // Danger
  danger: 'var(--error)',
  dangerHover: 'var(--error)',
  dangerPressed: 'var(--error)',

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
