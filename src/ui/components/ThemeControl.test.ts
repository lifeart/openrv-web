/**
 * ThemeControl Component Tests
 *
 * Tests for the theme selection dropdown with Dark/Light/Auto options.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeControl } from './ThemeControl';
import type { ThemeMode, ResolvedTheme } from '../../utils/ui/ThemeManager';

// Mock ThemeManager
const mockThemeManager = {
  getMode: vi.fn((): ThemeMode => 'auto'),
  getResolvedTheme: vi.fn((): ResolvedTheme => 'dark'),
  setMode: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('../../utils/ui/ThemeManager', () => ({
  getThemeManager: () => mockThemeManager,
  ThemeMode: {},
}));

describe('ThemeControl', () => {
  let control: ThemeControl;

  beforeEach(() => {
    vi.clearAllMocks();
    mockThemeManager.getMode.mockReturnValue('auto');
    mockThemeManager.getResolvedTheme.mockReturnValue('dark');
    control = new ThemeControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('THEME-U001: should create container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('theme-control');
    });

    it('THEME-U002: should have button with testid', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="theme-control-button"]');
      expect(button).not.toBeNull();
    });

    it('THEME-U003: should have dropdown with testid', () => {
      const el = control.render();
      document.body.appendChild(el);
      // Click button to open dropdown (appends to document.body)
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="theme-dropdown"]');
      expect(dropdown).not.toBeNull();
    });

    it('THEME-U004: dropdown should be hidden initially', () => {
      control.render();
      // Dropdown is not yet in the DOM before first open; verify it's not visible
      const dropdown = document.querySelector('[data-testid="theme-dropdown"]');
      // Before opening, dropdown is either not in DOM or display:none
      if (dropdown) {
        expect((dropdown as HTMLElement).style.display).toBe('none');
      } else {
        // Not in DOM at all is valid - it hasn't been opened yet
        expect(dropdown).toBeNull();
      }
    });

    it('THEME-U005: should subscribe to theme manager events', () => {
      expect(mockThemeManager.on).toHaveBeenCalledWith('modeChanged', expect.any(Function));
      expect(mockThemeManager.on).toHaveBeenCalledWith('themeChanged', expect.any(Function));
    });
  });

  describe('render', () => {
    it('THEME-U010: render returns container element', () => {
      const el = control.render();
      expect(el.className).toBe('theme-control');
    });

    it('THEME-U011: button has title attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;
      expect(button.title).toBe('Theme settings');
    });
  });

  describe('dropdown options', () => {
    it('THEME-U020: dropdown has auto option', () => {
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;
      button.click();
      const autoOption = document.querySelector('[data-testid="theme-option-auto"]');
      expect(autoOption).not.toBeNull();
    });

    it('THEME-U021: dropdown has dark option', () => {
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;
      button.click();
      const darkOption = document.querySelector('[data-testid="theme-option-dark"]');
      expect(darkOption).not.toBeNull();
    });

    it('THEME-U022: dropdown has light option', () => {
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;
      button.click();
      const lightOption = document.querySelector('[data-testid="theme-option-light"]');
      expect(lightOption).not.toBeNull();
    });

    it('THEME-U023: all options have correct data-theme-mode', () => {
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;
      button.click();

      const autoOption = document.querySelector('[data-testid="theme-option-auto"]') as HTMLElement;
      const darkOption = document.querySelector('[data-testid="theme-option-dark"]') as HTMLElement;
      const lightOption = document.querySelector('[data-testid="theme-option-light"]') as HTMLElement;

      expect(autoOption.dataset.themeMode).toBe('auto');
      expect(darkOption.dataset.themeMode).toBe('dark');
      expect(lightOption.dataset.themeMode).toBe('light');
    });
  });

  describe('mode selection', () => {
    it('THEME-U030: clicking dark option calls setMode with dark', () => {
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;
      button.click();
      const darkOption = document.querySelector('[data-testid="theme-option-dark"]') as HTMLButtonElement;

      darkOption.click();

      expect(mockThemeManager.setMode).toHaveBeenCalledWith('dark');
    });

    it('THEME-U031: clicking light option calls setMode with light', () => {
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;
      button.click();
      const lightOption = document.querySelector('[data-testid="theme-option-light"]') as HTMLButtonElement;

      lightOption.click();

      expect(mockThemeManager.setMode).toHaveBeenCalledWith('light');
    });

    it('THEME-U032: clicking auto option calls setMode with auto', () => {
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;
      button.click();
      const autoOption = document.querySelector('[data-testid="theme-option-auto"]') as HTMLButtonElement;

      autoOption.click();

      expect(mockThemeManager.setMode).toHaveBeenCalledWith('auto');
    });
  });

  describe('button states', () => {
    it('THEME-U040: button shows current mode label', () => {
      mockThemeManager.getMode.mockReturnValue('dark');
      const newControl = new ThemeControl();
      const el = newControl.render();
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;

      expect(button.textContent).toContain('Dark');
      newControl.dispose();
    });

    it('THEME-U041: button shows Auto for auto mode', () => {
      mockThemeManager.getMode.mockReturnValue('auto');
      const newControl = new ThemeControl();
      const el = newControl.render();
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;

      expect(button.textContent).toContain('Auto');
      newControl.dispose();
    });

    it('THEME-U042: button shows Light for light mode', () => {
      mockThemeManager.getMode.mockReturnValue('light');
      const newControl = new ThemeControl();
      const el = newControl.render();
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;

      expect(button.textContent).toContain('Light');
      newControl.dispose();
    });
  });

  describe('dropdown info', () => {
    it('THEME-U050: dropdown shows current resolved theme info', () => {
      mockThemeManager.getResolvedTheme.mockReturnValue('dark');
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;
      button.click();
      const info = document.querySelector('.theme-info') as HTMLElement;

      expect(info.textContent).toContain('Dark');
    });

    it('THEME-U051: dropdown shows Light when resolved theme is light', () => {
      mockThemeManager.getResolvedTheme.mockReturnValue('light');
      const newControl = new ThemeControl();
      const el = newControl.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;
      button.click();
      const info = document.querySelector('.theme-info') as HTMLElement;

      expect(info.textContent).toContain('Light');
      newControl.dispose();
    });
  });

  describe('dropdown divider', () => {
    it('THEME-U060: dropdown has divider between options and info', () => {
      const el = control.render();
      document.body.appendChild(el);
      const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('[data-testid="theme-dropdown"]') as HTMLElement;

      // Should have divider element (a div with specific styling)
      const dividers = dropdown.querySelectorAll('div');
      // At least one divider should exist (between options and info)
      expect(dividers.length).toBeGreaterThan(0);
    });
  });

  describe('dispose', () => {
    it('THEME-U070: dispose removes container from DOM', () => {
      const parent = document.createElement('div');
      const el = control.render();
      parent.appendChild(el);

      expect(parent.contains(el)).toBe(true);

      control.dispose();

      expect(parent.contains(el)).toBe(false);
    });

    it('THEME-U071: dispose can be called without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('THEME-U072: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });

    it('THEME-U073: dispose unsubscribes from modeChanged event', () => {
      control.dispose();

      expect(mockThemeManager.off).toHaveBeenCalledWith('modeChanged', expect.any(Function));
    });

    it('THEME-U074: dispose unsubscribes from themeChanged event', () => {
      control.dispose();

      expect(mockThemeManager.off).toHaveBeenCalledWith('themeChanged', expect.any(Function));
    });

    it('THEME-U075: dispose calls off with the same handler that was passed to on', () => {
      // Get the handlers that were passed to 'on'
      const onModeChangedCall = mockThemeManager.on.mock.calls.find(
        (call: [string, Function]) => call[0] === 'modeChanged'
      );
      const onThemeChangedCall = mockThemeManager.on.mock.calls.find(
        (call: [string, Function]) => call[0] === 'themeChanged'
      );

      expect(onModeChangedCall).toBeDefined();
      expect(onThemeChangedCall).toBeDefined();

      const modeChangedHandler = onModeChangedCall![1];
      const themeChangedHandler = onThemeChangedCall![1];

      control.dispose();

      // Verify off was called with the same handlers
      expect(mockThemeManager.off).toHaveBeenCalledWith('modeChanged', modeChangedHandler);
      expect(mockThemeManager.off).toHaveBeenCalledWith('themeChanged', themeChangedHandler);
    });
  });
});

describe('ThemeControl mode icons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('THEME-U080: auto mode shows settings icon', () => {
    mockThemeManager.getMode.mockReturnValue('auto');
    const control = new ThemeControl();
    const el = control.render();
    const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;

    // Check that button contains SVG (icon)
    expect(button.querySelector('svg')).not.toBeNull();
    control.dispose();
  });

  it('THEME-U081: dark mode shows moon icon', () => {
    mockThemeManager.getMode.mockReturnValue('dark');
    const control = new ThemeControl();
    const el = control.render();
    const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;

    expect(button.querySelector('svg')).not.toBeNull();
    control.dispose();
  });

  it('THEME-U082: light mode shows sun icon', () => {
    mockThemeManager.getMode.mockReturnValue('light');
    const control = new ThemeControl();
    const el = control.render();
    const button = el.querySelector('[data-testid="theme-control-button"]') as HTMLButtonElement;

    expect(button.querySelector('svg')).not.toBeNull();
    control.dispose();
  });
});
