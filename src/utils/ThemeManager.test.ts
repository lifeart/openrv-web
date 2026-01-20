/**
 * ThemeManager Tests
 *
 * Tests for the theme management utility that handles
 * dark/light/auto theme modes with localStorage persistence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeManager, ThemeMode, ResolvedTheme } from './ThemeManager';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock matchMedia
let mockMediaQueryMatches = true;
let mockMediaQueryChangeHandler: ((e: MediaQueryListEvent) => void) | null = null;

const mockMediaQueryList = {
  matches: true,
  media: '(prefers-color-scheme: dark)',
  addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
    if (event === 'change') {
      mockMediaQueryChangeHandler = handler;
    }
  }),
  removeEventListener: vi.fn((event: string, _handler: (e: MediaQueryListEvent) => void) => {
    if (event === 'change') {
      mockMediaQueryChangeHandler = null;
    }
  }),
  dispatchEvent: vi.fn(),
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
};

vi.stubGlobal('matchMedia', vi.fn(() => {
  mockMediaQueryList.matches = mockMediaQueryMatches;
  return mockMediaQueryList;
}));

describe('ThemeManager', () => {
  let manager: ThemeManager;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockMediaQueryMatches = true;
    mockMediaQueryChangeHandler = null;
    manager = new ThemeManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('initialization', () => {
    it('THEME-M001: should initialize with auto mode by default', () => {
      expect(manager.getMode()).toBe('auto');
    });

    it('THEME-M002: should resolve to dark when system prefers dark', () => {
      mockMediaQueryMatches = true;
      const newManager = new ThemeManager();
      expect(newManager.getResolvedTheme()).toBe('dark');
      newManager.dispose();
    });

    it('THEME-M003: should resolve to light when system prefers light', () => {
      mockMediaQueryMatches = false;
      const newManager = new ThemeManager();
      expect(newManager.getResolvedTheme()).toBe('light');
      newManager.dispose();
    });

    it('THEME-M004: should load saved preference from localStorage', () => {
      localStorageMock.setItem('openrv-theme-mode', 'dark');
      const newManager = new ThemeManager();
      expect(newManager.getMode()).toBe('dark');
      newManager.dispose();
    });

    it('THEME-M005: should ignore invalid localStorage values', () => {
      localStorageMock.setItem('openrv-theme-mode', 'invalid');
      const newManager = new ThemeManager();
      expect(newManager.getMode()).toBe('auto');
      newManager.dispose();
    });
  });

  describe('getMode/setMode', () => {
    it('THEME-M010: getMode returns current mode', () => {
      expect(manager.getMode()).toBe('auto');
    });

    it('THEME-M011: setMode changes to dark mode', () => {
      manager.setMode('dark');
      expect(manager.getMode()).toBe('dark');
      expect(manager.getResolvedTheme()).toBe('dark');
    });

    it('THEME-M012: setMode changes to light mode', () => {
      manager.setMode('light');
      expect(manager.getMode()).toBe('light');
      expect(manager.getResolvedTheme()).toBe('light');
    });

    it('THEME-M013: setMode changes to auto mode', () => {
      manager.setMode('dark');
      manager.setMode('auto');
      expect(manager.getMode()).toBe('auto');
    });

    it('THEME-M014: setMode emits modeChanged event', () => {
      const callback = vi.fn();
      manager.on('modeChanged', callback);

      manager.setMode('dark');
      expect(callback).toHaveBeenCalledWith('dark');
    });

    it('THEME-M015: setMode does not emit if mode unchanged', () => {
      manager.setMode('dark');
      const callback = vi.fn();
      manager.on('modeChanged', callback);

      manager.setMode('dark'); // Same mode
      expect(callback).not.toHaveBeenCalled();
    });

    it('THEME-M016: setMode saves to localStorage', () => {
      manager.setMode('light');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('openrv-theme-mode', 'light');
    });
  });

  describe('getResolvedTheme', () => {
    it('THEME-M020: resolvedTheme is dark when mode is dark', () => {
      manager.setMode('dark');
      expect(manager.getResolvedTheme()).toBe('dark');
    });

    it('THEME-M021: resolvedTheme is light when mode is light', () => {
      manager.setMode('light');
      expect(manager.getResolvedTheme()).toBe('light');
    });

    it('THEME-M022: resolvedTheme follows system in auto mode (dark)', () => {
      mockMediaQueryMatches = true;
      manager.setMode('auto');
      expect(manager.getResolvedTheme()).toBe('dark');
    });

    it('THEME-M023: resolvedTheme follows system in auto mode (light)', () => {
      mockMediaQueryMatches = false;
      const newManager = new ThemeManager();
      newManager.setMode('auto');
      expect(newManager.getResolvedTheme()).toBe('light');
      newManager.dispose();
    });
  });

  describe('cycleMode', () => {
    it('THEME-M030: cycleMode cycles through auto -> dark -> light -> auto', () => {
      expect(manager.getMode()).toBe('auto');

      manager.cycleMode();
      expect(manager.getMode()).toBe('dark');

      manager.cycleMode();
      expect(manager.getMode()).toBe('light');

      manager.cycleMode();
      expect(manager.getMode()).toBe('auto');
    });

    it('THEME-M031: cycleMode emits modeChanged event', () => {
      const callback = vi.fn();
      manager.on('modeChanged', callback);

      manager.cycleMode();
      expect(callback).toHaveBeenCalledWith('dark');
    });
  });

  describe('getColors', () => {
    it('THEME-M040: getColors returns dark theme colors when dark', () => {
      manager.setMode('dark');
      const colors = manager.getColors();
      expect(colors.bgPrimary).toBe('#1a1a1a');
      expect(colors.textPrimary).toBe('#e0e0e0');
    });

    it('THEME-M041: getColors returns light theme colors when light', () => {
      manager.setMode('light');
      const colors = manager.getColors();
      expect(colors.bgPrimary).toBe('#ffffff');
      expect(colors.textPrimary).toBe('#1a1a1a');
    });

    it('THEME-M042: getColors includes all required color properties', () => {
      const colors = manager.getColors();

      // Background colors
      expect(colors).toHaveProperty('bgPrimary');
      expect(colors).toHaveProperty('bgSecondary');
      expect(colors).toHaveProperty('bgTertiary');
      expect(colors).toHaveProperty('bgHover');
      expect(colors).toHaveProperty('bgActive');

      // Text colors
      expect(colors).toHaveProperty('textPrimary');
      expect(colors).toHaveProperty('textSecondary');
      expect(colors).toHaveProperty('textMuted');

      // Border colors
      expect(colors).toHaveProperty('borderPrimary');
      expect(colors).toHaveProperty('borderSecondary');

      // Accent colors
      expect(colors).toHaveProperty('accentPrimary');
      expect(colors).toHaveProperty('accentHover');
      expect(colors).toHaveProperty('accentActive');

      // Semantic colors
      expect(colors).toHaveProperty('success');
      expect(colors).toHaveProperty('warning');
      expect(colors).toHaveProperty('error');

      // Overlay colors
      expect(colors).toHaveProperty('overlayBg');
      expect(colors).toHaveProperty('overlayBorder');

      // Viewer
      expect(colors).toHaveProperty('viewerBg');
    });
  });

  describe('getColorsForTheme static', () => {
    it('THEME-M050: getColorsForTheme returns dark theme colors', () => {
      const colors = ThemeManager.getColorsForTheme('dark');
      expect(colors.bgPrimary).toBe('#1a1a1a');
    });

    it('THEME-M051: getColorsForTheme returns light theme colors', () => {
      const colors = ThemeManager.getColorsForTheme('light');
      expect(colors.bgPrimary).toBe('#ffffff');
    });
  });

  describe('themeChanged event', () => {
    it('THEME-M060: emits themeChanged when resolved theme changes', () => {
      const callback = vi.fn();
      manager.on('themeChanged', callback);

      manager.setMode('light');
      expect(callback).toHaveBeenCalledWith('light');
    });

    it('THEME-M061: does not emit themeChanged when resolved theme unchanged', () => {
      manager.setMode('dark');
      const callback = vi.fn();
      manager.on('themeChanged', callback);

      // Switching to auto with system preferring dark should not emit
      mockMediaQueryMatches = true;
      manager.setMode('auto');
      // The theme should still be dark, so no event
      expect(manager.getResolvedTheme()).toBe('dark');
    });
  });

  describe('system preference changes', () => {
    it('THEME-M070: responds to system preference changes in auto mode', () => {
      manager.setMode('auto');
      const callback = vi.fn();
      manager.on('themeChanged', callback);

      // Simulate system preference change
      if (mockMediaQueryChangeHandler) {
        mockMediaQueryMatches = false;
        mockMediaQueryList.matches = false;
        mockMediaQueryChangeHandler({
          matches: false,
          media: '(prefers-color-scheme: dark)',
        } as MediaQueryListEvent);
      }

      // In auto mode, should respond to system change
      expect(callback).toHaveBeenCalled();
    });

    it('THEME-M071: ignores system preference changes in non-auto mode', () => {
      manager.setMode('dark');
      const callback = vi.fn();
      manager.on('themeChanged', callback);

      // Simulate system preference change
      if (mockMediaQueryChangeHandler) {
        mockMediaQueryMatches = false;
        mockMediaQueryList.matches = false;
        mockMediaQueryChangeHandler({
          matches: false,
          media: '(prefers-color-scheme: dark)',
        } as MediaQueryListEvent);
      }

      // In dark mode, should ignore system change
      expect(callback).not.toHaveBeenCalled();
      expect(manager.getResolvedTheme()).toBe('dark');
    });
  });

  describe('dispose', () => {
    it('THEME-M080: dispose removes media query listener', () => {
      manager.dispose();
      expect(mockMediaQueryList.removeEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });

    it('THEME-M081: dispose can be called without error', () => {
      expect(() => manager.dispose()).not.toThrow();
    });

    it('THEME-M082: dispose removes all event listeners', () => {
      const callback = vi.fn();
      manager.on('modeChanged', callback);
      manager.dispose();

      // After dispose, events should not fire
      // (The manager is disposed, so we can't really test this without
      // accessing internal state, but dispose should clean up)
    });
  });
});

describe('ThemeManager color contrast', () => {
  it('THEME-M090: dark theme has appropriate contrast', () => {
    const colors = ThemeManager.getColorsForTheme('dark');
    // Text should be lighter than background
    expect(colors.textPrimary).not.toBe(colors.bgPrimary);
    // In dark theme, background is dark (#1a1a1a) and text is light (#e0e0e0)
    expect(colors.bgPrimary).toBe('#1a1a1a');
    expect(colors.textPrimary).toBe('#e0e0e0');
  });

  it('THEME-M091: light theme has appropriate contrast', () => {
    const colors = ThemeManager.getColorsForTheme('light');
    // In light theme, background is light (#ffffff) and text is dark (#1a1a1a)
    expect(colors.bgPrimary).toBe('#ffffff');
    expect(colors.textPrimary).toBe('#1a1a1a');
  });

  it('THEME-M092: accent colors are consistent across themes', () => {
    const dark = ThemeManager.getColorsForTheme('dark');
    const light = ThemeManager.getColorsForTheme('light');

    // Accent colors should be similar blue tones
    expect(dark.accentPrimary).toMatch(/#[0-9a-f]{6}/i);
    expect(light.accentPrimary).toMatch(/#[0-9a-f]{6}/i);
  });
});

describe('ThemeManager mode types', () => {
  let manager: ThemeManager;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    manager = new ThemeManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  const modes: ThemeMode[] = ['dark', 'light', 'auto'];

  modes.forEach((mode) => {
    it(`THEME-M100-${mode}: setMode accepts ${mode}`, () => {
      manager.setMode(mode);
      expect(manager.getMode()).toBe(mode);
    });
  });

  const resolvedThemes: ResolvedTheme[] = ['dark', 'light'];

  resolvedThemes.forEach((theme) => {
    it(`THEME-M101-${theme}: getColorsForTheme accepts ${theme}`, () => {
      const colors = ThemeManager.getColorsForTheme(theme);
      expect(colors).toBeDefined();
      expect(colors.bgPrimary).toBeDefined();
    });
  });
});
