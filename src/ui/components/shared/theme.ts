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
  textBright: 'var(--text-on-accent, #fff)',

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
  shadowPanel: '0 8px 24px rgba(0, 0, 0, 0.5)',
  shadowModal: '0 8px 32px rgba(0, 0, 0, 0.5)',
} as const;

// Panel width tokens
//
// Tiers cover the full range of floating panels, dropdown menus, and
// modal dialogs in the app. Sizes are listed from smallest to largest;
// pick the smallest tier that fits the panel's content comfortably.
export const PANEL_WIDTHS = {
  extraCompact: '140px',
  tiny: '150px',
  compact: '160px',
  dropdownMenu: '180px',
  menu: '200px',
  narrow: '220px',
  medium: '240px',
  mediumWide: '260px',
  standard: '280px',
  panel: '300px',
  panelWide: '320px',
  wide: '340px',
  dialog: '400px',
  dialogWide: '420px',
} as const;

// Box-shadow tokens
export const SHADOWS = {
  dropdown: '0 4px 12px rgba(0,0,0,0.4)',
  panel: '0 8px 24px rgba(0,0,0,0.5)',
  modal: '0 8px 32px rgba(0,0,0,0.5)',
} as const;

// Disabled state opacity
export const OPACITY = {
  disabled: 0.5,
} as const;

// Z-index layers
export const Z_INDEX = {
  // Local stacking inside a containing block (e.g., relative siblings)
  localStack: 1,
  // Local layering for layout chrome (resize handles, drag affordances)
  localStackHigh: 10,
  // Floating viewer overlay below the base viewer chrome (color picker, etc.)
  viewerOverlayLow: 35,
  // EXR window overlay canvas (sits below bug overlay, above base content)
  viewerExrWindow: 42,
  // Info strip overlay background row
  viewerStripBg: 48,
  // Display profile indicator (pinned just below base viewer overlay)
  viewerStripFg: 49,
  // Base viewer overlay layer (FPS, fit-mode badges, wipe primary)
  viewerOverlay: 50,
  // Wipe line / wipe labels
  viewerWipeLine: 51,
  // Split-screen divider line
  viewerSplitLine: 52,
  // Split-screen labels
  viewerSplitLabel: 53,
  // Bug overlay canvas (above EXR/strip, below HUD)
  viewerBugOverlay: 55,
  // HUD-level transient indicators (filter mode, virtual slider, presence, A/B)
  viewerHud: 60,
  // Higher-priority overlays (transient mode indicators, scale ratio, missing frame)
  viewerOverlayHigh: 100,
  // Top-most viewer overlay (remote cursors)
  viewerOverlayTop: 110,
  // Floating panels above viewer (info panel)
  panel: 500,
  // Side / draggable panels (history, playlist, snapshots, etc.)
  sidePanel: 1000,
  // Pixel probe magnifier (just below dropdown/modal stack)
  pixelProbe: 9998,
  // Dropdown menus and floating control panels
  dropdown: 9999,
  // Modal dialogs
  modal: 10000,
  // Tooltips above modals
  tooltip: 10001,
  // Accessibility skip link (always on top)
  a11ySkipLink: 100000,
} as const;

// Timing
export const TRANSITIONS = {
  fast: '0.12s ease',
  normal: '0.2s ease',
} as const;
