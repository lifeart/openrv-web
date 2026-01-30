/**
 * ThemeManager - Manages application color themes
 *
 * Features:
 * - Dark theme (default)
 * - Light theme
 * - Auto mode (follows system preference)
 * - Persists preference to localStorage
 * - Smooth CSS transitions
 */

import { EventEmitter, EventMap } from './EventEmitter';

export type ThemeMode = 'dark' | 'light' | 'auto';
export type ResolvedTheme = 'dark' | 'light';

export interface ThemeColors {
  // Background colors
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgHover: string;
  bgActive: string;

  // Text colors
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Border colors
  borderPrimary: string;
  borderSecondary: string;

  // Accent colors
  accentPrimary: string;
  accentHover: string;
  accentActive: string;
  accentPrimaryRgb: string; // RGB values for use with rgba()

  // Semantic colors
  success: string;
  warning: string;
  error: string;
  info: string;

  // Overlay colors
  overlayBg: string;
  overlayBorder: string;

  // Viewer specific
  viewerBg: string;
}

const DARK_THEME: ThemeColors = {
  bgPrimary: '#1a1a1a',
  bgSecondary: '#252525',
  bgTertiary: '#2d2d2d',
  bgHover: '#333333',
  bgActive: '#3a3a3a',

  textPrimary: '#e0e0e0',
  textSecondary: '#b0b0b0',
  textMuted: '#666666',

  borderPrimary: '#444444',
  borderSecondary: '#333333',

  accentPrimary: '#4a9eff',
  accentHover: '#5aafff',
  accentActive: '#3a8eef',
  accentPrimaryRgb: '74, 158, 255',

  success: '#4ade80',
  warning: '#facc15',
  error: '#f87171',
  info: '#60a5fa',

  overlayBg: 'rgba(0, 0, 0, 0.75)',
  overlayBorder: 'rgba(255, 255, 255, 0.1)',

  viewerBg: '#1e1e1e',
};

const LIGHT_THEME: ThemeColors = {
  bgPrimary: '#ffffff',
  bgSecondary: '#f5f5f5',
  bgTertiary: '#ebebeb',
  bgHover: '#e0e0e0',
  bgActive: '#d5d5d5',

  textPrimary: '#1a1a1a',
  textSecondary: '#4a4a4a',
  textMuted: '#999999',

  borderPrimary: '#d0d0d0',
  borderSecondary: '#e0e0e0',

  accentPrimary: '#0066cc',
  accentHover: '#0077dd',
  accentActive: '#0055bb',
  accentPrimaryRgb: '0, 102, 204',

  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
  info: '#3b82f6',

  overlayBg: 'rgba(255, 255, 255, 0.9)',
  overlayBorder: 'rgba(0, 0, 0, 0.1)',

  viewerBg: '#e8e8e8',
};

export interface ThemeManagerEvents extends EventMap {
  themeChanged: ResolvedTheme;
  modeChanged: ThemeMode;
}

const STORAGE_KEY = 'openrv-theme-mode';

export class ThemeManager extends EventEmitter<ThemeManagerEvents> {
  private mode: ThemeMode = 'auto';
  private resolvedTheme: ResolvedTheme = 'dark';
  private mediaQuery: MediaQueryList | null = null;
  private boundMediaChangeHandler: (e: MediaQueryListEvent) => void;

  constructor() {
    super();
    this.boundMediaChangeHandler = (e) => this.handleSystemThemeChange(e);

    // Load saved preference
    this.loadPreference();

    // Setup system preference listener
    this.setupSystemPreferenceListener();

    // Apply initial theme
    this.resolveAndApplyTheme();
  }

  /**
   * Get current theme mode setting
   */
  getMode(): ThemeMode {
    return this.mode;
  }

  /**
   * Get resolved (actual) theme being displayed
   */
  getResolvedTheme(): ResolvedTheme {
    return this.resolvedTheme;
  }

  /**
   * Set theme mode
   */
  setMode(mode: ThemeMode): void {
    if (this.mode !== mode) {
      this.mode = mode;
      this.savePreference();
      this.resolveAndApplyTheme();
      this.emit('modeChanged', mode);
    }
  }

  /**
   * Cycle through theme modes: auto -> dark -> light -> auto
   */
  cycleMode(): void {
    const modes: ThemeMode[] = ['auto', 'dark', 'light'];
    const currentIndex = modes.indexOf(this.mode);
    const nextMode = modes[(currentIndex + 1) % modes.length]!;
    this.setMode(nextMode);
  }

  /**
   * Get colors for current theme
   */
  getColors(): ThemeColors {
    return this.resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME;
  }

  /**
   * Get colors for a specific theme
   */
  static getColorsForTheme(theme: ResolvedTheme): ThemeColors {
    return theme === 'dark' ? DARK_THEME : LIGHT_THEME;
  }

  /**
   * Load preference from localStorage
   */
  private loadPreference(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && (saved === 'dark' || saved === 'light' || saved === 'auto')) {
        this.mode = saved as ThemeMode;
      }
    } catch {
      // localStorage not available, use default
    }
  }

  /**
   * Save preference to localStorage
   */
  private savePreference(): void {
    try {
      localStorage.setItem(STORAGE_KEY, this.mode);
    } catch {
      // localStorage not available
    }
  }

  /**
   * Setup listener for system theme preference changes
   */
  private setupSystemPreferenceListener(): void {
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaQuery.addEventListener('change', this.boundMediaChangeHandler);
    }
  }

  /**
   * Handle system theme preference change
   */
  private handleSystemThemeChange(_e: MediaQueryListEvent): void {
    if (this.mode === 'auto') {
      this.resolveAndApplyTheme();
    }
  }

  /**
   * Resolve mode to actual theme and apply it
   */
  private resolveAndApplyTheme(): void {
    let newTheme: ResolvedTheme;

    if (this.mode === 'auto') {
      // Check system preference
      newTheme = this.getSystemPreference();
    } else {
      newTheme = this.mode;
    }

    if (newTheme !== this.resolvedTheme) {
      this.resolvedTheme = newTheme;
      this.applyTheme();
      this.emit('themeChanged', newTheme);
    } else {
      // Still apply theme in case CSS vars need updating
      this.applyTheme();
    }
  }

  /**
   * Get system color scheme preference
   */
  private getSystemPreference(): ResolvedTheme {
    if (this.mediaQuery) {
      return this.mediaQuery.matches ? 'dark' : 'light';
    }
    return 'dark'; // Default to dark if can't detect
  }

  /**
   * Apply theme colors as CSS custom properties
   */
  private applyTheme(): void {
    const colors = this.getColors();
    const root = document.documentElement;

    // Add transition for smooth theme switching
    root.style.setProperty('--theme-transition', 'background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease');

    // Set CSS custom properties
    root.style.setProperty('--bg-primary', colors.bgPrimary);
    root.style.setProperty('--bg-secondary', colors.bgSecondary);
    root.style.setProperty('--bg-tertiary', colors.bgTertiary);
    root.style.setProperty('--bg-hover', colors.bgHover);
    root.style.setProperty('--bg-active', colors.bgActive);

    root.style.setProperty('--text-primary', colors.textPrimary);
    root.style.setProperty('--text-secondary', colors.textSecondary);
    root.style.setProperty('--text-muted', colors.textMuted);

    root.style.setProperty('--border-primary', colors.borderPrimary);
    root.style.setProperty('--border-secondary', colors.borderSecondary);

    root.style.setProperty('--accent-primary', colors.accentPrimary);
    root.style.setProperty('--accent-hover', colors.accentHover);
    root.style.setProperty('--accent-active', colors.accentActive);
    root.style.setProperty('--accent-primary-rgb', colors.accentPrimaryRgb);

    root.style.setProperty('--success', colors.success);
    root.style.setProperty('--warning', colors.warning);
    root.style.setProperty('--error', colors.error);
    root.style.setProperty('--info', colors.info);

    root.style.setProperty('--overlay-bg', colors.overlayBg);
    root.style.setProperty('--overlay-border', colors.overlayBorder);

    root.style.setProperty('--viewer-bg', colors.viewerBg);

    // Set data attribute for CSS selectors
    root.dataset.theme = this.resolvedTheme;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.mediaQuery) {
      this.mediaQuery.removeEventListener('change', this.boundMediaChangeHandler);
    }
    this.removeAllListeners();
  }
}

// Global singleton instance
let globalThemeManager: ThemeManager | null = null;

/**
 * Get or create the global ThemeManager instance
 */
export function getThemeManager(): ThemeManager {
  if (!globalThemeManager) {
    globalThemeManager = new ThemeManager();
  }
  return globalThemeManager;
}
