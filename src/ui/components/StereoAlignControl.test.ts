/**
 * StereoAlignControl Component Tests
 *
 * Tests for the stereo alignment overlay dropdown control.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StereoAlignControl } from './StereoAlignControl';

describe('StereoAlignControl', () => {
  let control: StereoAlignControl;

  beforeEach(() => {
    control = new StereoAlignControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('SALC-U001: Initializes with mode off', () => {
      expect(control.getMode()).toBe('off');
    });
  });

  describe('render', () => {
    it('SALC-U002: Render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('SALC-U003: Container has align button', () => {
      const el = control.render();
      const btn = el.querySelector('[data-testid="stereo-align-button"]');
      expect(btn).not.toBeNull();
    });

    it('SALC-U004: Dropdown has all mode options', () => {
      // Need to trigger dropdown to add to body
      const el = control.render();
      const btn = el.querySelector('[data-testid="stereo-align-button"]') as HTMLButtonElement;
      btn.click();

      const dropdown = document.querySelector('[data-testid="stereo-align-dropdown"]');
      expect(dropdown).not.toBeNull();

      const options = dropdown!.querySelectorAll('button');
      const modes = Array.from(options).map((o) => (o as HTMLElement).dataset.stereoAlign);
      expect(modes).toContain('off');
      expect(modes).toContain('grid');
      expect(modes).toContain('crosshair');
      expect(modes).toContain('difference');
      expect(modes).toContain('edges');
    });
  });

  describe('mode', () => {
    it('SALC-U010: setMode changes mode', () => {
      control.setMode('grid');
      expect(control.getMode()).toBe('grid');
    });

    it('SALC-U011: setMode emits alignModeChanged', () => {
      const handler = vi.fn();
      control.on('alignModeChanged', handler);
      control.setMode('crosshair');
      expect(handler).toHaveBeenCalledWith('crosshair');
    });

    it('SALC-U012: setMode does not emit if unchanged', () => {
      const handler = vi.fn();
      control.on('alignModeChanged', handler);
      control.setMode('off'); // Already off
      expect(handler).not.toHaveBeenCalled();
    });

    it('SALC-U013: setMode to non-off makes isActive true', () => {
      control.setMode('grid');
      expect(control.isActive()).toBe(true);
    });

    it('SALC-U014: setMode to off makes isActive false', () => {
      control.setMode('grid');
      control.setMode('off');
      expect(control.isActive()).toBe(false);
    });
  });

  describe('cycleMode', () => {
    it('SALC-U020: Cycles through all modes in order', () => {
      expect(control.getMode()).toBe('off');
      control.cycleMode();
      expect(control.getMode()).toBe('grid');
      control.cycleMode();
      expect(control.getMode()).toBe('crosshair');
      control.cycleMode();
      expect(control.getMode()).toBe('difference');
      control.cycleMode();
      expect(control.getMode()).toBe('edges');
    });

    it('SALC-U021: Wraps from edges back to off', () => {
      control.setMode('edges');
      control.cycleMode();
      expect(control.getMode()).toBe('off');
    });

    it('SALC-U022: Emits alignModeChanged event', () => {
      const handler = vi.fn();
      control.on('alignModeChanged', handler);
      control.cycleMode();
      expect(handler).toHaveBeenCalledWith('grid');
    });
  });

  describe('keyboard', () => {
    it('SALC-U030: Shift+4 cycles mode', () => {
      const handled = control.handleKeyboard('4', true);
      expect(handled).toBe(true);
      expect(control.getMode()).toBe('grid');
    });

    it('SALC-U031: Returns false for non-handled keys', () => {
      expect(control.handleKeyboard('5', true)).toBe(false);
      expect(control.handleKeyboard('4', false)).toBe(false);
    });

    it('SALC-U032: Without shift does not cycle', () => {
      expect(control.handleKeyboard('4', false)).toBe(false);
      expect(control.getMode()).toBe('off');
    });
  });

  describe('reset', () => {
    it('SALC-U040: Reset restores mode to off', () => {
      control.setMode('grid');
      control.reset();
      expect(control.getMode()).toBe('off');
    });

    it('SALC-U041: Reset emits alignModeChanged', () => {
      control.setMode('grid');
      const handler = vi.fn();
      control.on('alignModeChanged', handler);
      control.reset();
      expect(handler).toHaveBeenCalledWith('off');
    });
  });

  describe('dispose', () => {
    it('SALC-U050: Cleans up without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('SALC-U051: Can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });
  });
});
