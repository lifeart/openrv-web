/**
 * InfoPanelSettingsMenu Component Tests
 *
 * Tests for the right-click settings context menu on the Info Panel toggle button.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InfoPanelSettingsMenu } from './InfoPanelSettingsMenu';
import { InfoPanel } from './InfoPanel';

describe('InfoPanelSettingsMenu', () => {
  let infoPanel: InfoPanel;
  let menu: InfoPanelSettingsMenu;

  beforeEach(() => {
    infoPanel = new InfoPanel();
    menu = new InfoPanelSettingsMenu(infoPanel);
  });

  afterEach(() => {
    menu.dispose();
    infoPanel.dispose();
  });

  describe('initialization', () => {
    it('IPSM-U001: creates instance', () => {
      expect(menu).toBeInstanceOf(InfoPanelSettingsMenu);
    });

    it('IPSM-U002: is not visible initially', () => {
      expect(menu.isVisible()).toBe(false);
    });
  });

  describe('show/hide', () => {
    it('IPSM-U003: show makes menu visible', () => {
      menu.show(100, 100);
      expect(menu.isVisible()).toBe(true);
    });

    it('IPSM-U004: show appends menu to document body', () => {
      menu.show(100, 100);
      const el = document.querySelector('.info-panel-settings-menu');
      expect(el).not.toBeNull();
    });

    it('IPSM-U005: hide removes menu from DOM', () => {
      menu.show(100, 100);
      menu.hide();
      const el = document.querySelector('.info-panel-settings-menu');
      expect(el).toBeNull();
    });

    it('IPSM-U006: hide sets isVisible to false', () => {
      menu.show(100, 100);
      menu.hide();
      expect(menu.isVisible()).toBe(false);
    });

    it('IPSM-U007: show hides previous menu before showing new one', () => {
      menu.show(100, 100);
      menu.show(200, 200);
      const els = document.querySelectorAll('.info-panel-settings-menu');
      expect(els.length).toBe(1);
    });

    it('IPSM-U008: dispose calls hide', () => {
      menu.show(100, 100);
      menu.dispose();
      expect(menu.isVisible()).toBe(false);
      expect(document.querySelector('.info-panel-settings-menu')).toBeNull();
    });
  });

  describe('ARIA roles', () => {
    it('IPSM-U009: menu has role="menu"', () => {
      menu.show(100, 100);
      const el = document.querySelector('.info-panel-settings-menu');
      expect(el?.getAttribute('role')).toBe('menu');
    });

    it('IPSM-U010: menu has aria-label', () => {
      menu.show(100, 100);
      const el = document.querySelector('.info-panel-settings-menu');
      expect(el?.getAttribute('aria-label')).toBe('Info Panel settings');
    });

    it('IPSM-U011: position items have role="menuitemradio"', () => {
      menu.show(100, 100);
      const radios = document.querySelectorAll('[role="menuitemradio"]');
      expect(radios.length).toBe(4);
    });

    it('IPSM-U012: field items have role="menuitemcheckbox"', () => {
      menu.show(100, 100);
      const checkboxes = document.querySelectorAll('[role="menuitemcheckbox"]');
      expect(checkboxes.length).toBe(8);
    });

    it('IPSM-U013: current position has aria-checked="true"', () => {
      infoPanel.setPosition('top-left');
      menu.show(100, 100);
      const radios = document.querySelectorAll('[role="menuitemradio"]');
      const checkedRadios = Array.from(radios).filter((r) => r.getAttribute('aria-checked') === 'true');
      expect(checkedRadios.length).toBe(1);
    });
  });

  describe('position selection', () => {
    it('IPSM-U014: clicking a position item calls setPosition', () => {
      const spy = vi.spyOn(infoPanel, 'setPosition');
      menu.show(100, 100);
      const radios = document.querySelectorAll<HTMLDivElement>('[role="menuitemradio"]');
      // Click the second position (top-right)
      radios[1]?.click();
      expect(spy).toHaveBeenCalledWith('top-right');
    });

    it('IPSM-U015: clicking a position item closes the menu', () => {
      menu.show(100, 100);
      const radios = document.querySelectorAll<HTMLDivElement>('[role="menuitemradio"]');
      radios[1]?.click();
      expect(menu.isVisible()).toBe(false);
    });

    it('IPSM-U016: current position shows checkmark', () => {
      infoPanel.setPosition('bottom-right');
      menu.show(100, 100);
      const radios = document.querySelectorAll<HTMLDivElement>('[role="menuitemradio"]');
      // bottom-right is the 4th position
      const checkSpan = radios[3]?.querySelector('.menu-check');
      expect(checkSpan?.textContent).toBe('\u2713');
    });

    it('IPSM-U017: non-current positions have empty checkmark', () => {
      infoPanel.setPosition('top-left');
      menu.show(100, 100);
      const radios = document.querySelectorAll<HTMLDivElement>('[role="menuitemradio"]');
      // top-right (index 1) should be empty
      const checkSpan = radios[1]?.querySelector('.menu-check');
      expect(checkSpan?.textContent).toBe('');
    });
  });

  describe('field toggling', () => {
    it('IPSM-U018: clicking a field item calls toggleField', () => {
      const spy = vi.spyOn(infoPanel, 'toggleField');
      menu.show(100, 100);
      const checkboxes = document.querySelectorAll<HTMLDivElement>('[role="menuitemcheckbox"]');
      // Click the first field (filename)
      checkboxes[0]?.click();
      expect(spy).toHaveBeenCalledWith('filename');
    });

    it('IPSM-U019: clicking a field item does NOT close the menu', () => {
      menu.show(100, 100);
      const checkboxes = document.querySelectorAll<HTMLDivElement>('[role="menuitemcheckbox"]');
      checkboxes[0]?.click();
      expect(menu.isVisible()).toBe(true);
    });

    it('IPSM-U020: enabled fields show checkmark', () => {
      // filename is enabled by default
      menu.show(100, 100);
      const checkboxes = document.querySelectorAll<HTMLDivElement>('[role="menuitemcheckbox"]');
      const filenameCheck = checkboxes[0]?.querySelector('.menu-check');
      expect(filenameCheck?.textContent).toBe('\u2713');
    });

    it('IPSM-U021: disabled fields show no checkmark', () => {
      // duration is disabled by default
      menu.show(100, 100);
      const checkboxes = document.querySelectorAll<HTMLDivElement>('[role="menuitemcheckbox"]');
      const durationCheck = checkboxes[4]?.querySelector('.menu-check');
      expect(durationCheck?.textContent).toBe('');
    });

    it('IPSM-U022: toggling a field updates the checkmark in-place', () => {
      menu.show(100, 100);
      const checkboxes = document.querySelectorAll<HTMLDivElement>('[role="menuitemcheckbox"]');
      // duration (index 4) is off by default, click to enable
      checkboxes[4]?.click();
      const durationCheck = checkboxes[4]?.querySelector('.menu-check');
      expect(durationCheck?.textContent).toBe('\u2713');
    });

    it('IPSM-U023: toggling a field updates aria-checked', () => {
      menu.show(100, 100);
      const checkboxes = document.querySelectorAll<HTMLDivElement>('[role="menuitemcheckbox"]');
      // duration (index 4) starts as false
      expect(checkboxes[4]?.getAttribute('aria-checked')).toBe('false');
      checkboxes[4]?.click();
      expect(checkboxes[4]?.getAttribute('aria-checked')).toBe('true');
    });

    it('IPSM-U024: can toggle multiple fields without menu closing', () => {
      menu.show(100, 100);
      const checkboxes = document.querySelectorAll<HTMLDivElement>('[role="menuitemcheckbox"]');
      checkboxes[0]?.click(); // toggle filename off
      checkboxes[4]?.click(); // toggle duration on
      expect(menu.isVisible()).toBe(true);
      expect(checkboxes[0]?.querySelector('.menu-check')?.textContent).toBe('');
      expect(checkboxes[4]?.querySelector('.menu-check')?.textContent).toBe('\u2713');
    });
  });

  describe('dismiss behavior', () => {
    it('IPSM-U025: Escape key hides the menu', () => {
      menu.show(100, 100);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(menu.isVisible()).toBe(false);
    });

    it('IPSM-U026: window blur does not hide the menu', () => {
      menu.show(100, 100);
      window.dispatchEvent(new Event('blur'));
      expect(menu.isVisible()).toBe(true);
    });

    it('IPSM-U027: hide is idempotent', () => {
      menu.hide();
      menu.hide();
      expect(menu.isVisible()).toBe(false);
    });
  });

  describe('menu structure', () => {
    it('IPSM-U028: menu contains section headers', () => {
      menu.show(100, 100);
      const el = document.querySelector('.info-panel-settings-menu');
      expect(el?.textContent).toContain('Position');
      expect(el?.textContent).toContain('Fields');
    });

    it('IPSM-U029: menu contains all position labels', () => {
      menu.show(100, 100);
      const el = document.querySelector('.info-panel-settings-menu');
      expect(el?.textContent).toContain('Top Left');
      expect(el?.textContent).toContain('Top Right');
      expect(el?.textContent).toContain('Bottom Left');
      expect(el?.textContent).toContain('Bottom Right');
    });

    it('IPSM-U030: menu contains all field labels', () => {
      menu.show(100, 100);
      const el = document.querySelector('.info-panel-settings-menu');
      expect(el?.textContent).toContain('Filename');
      expect(el?.textContent).toContain('Resolution');
      expect(el?.textContent).toContain('Frame Info');
      expect(el?.textContent).toContain('Timecode');
      expect(el?.textContent).toContain('Duration');
      expect(el?.textContent).toContain('FPS');
      expect(el?.textContent).toContain('Color at Cursor');
    });

    it('IPSM-U031: menu has separator between positions and fields', () => {
      menu.show(100, 100);
      const el = document.querySelector('.info-panel-settings-menu');
      // Separator is a div with 1px height
      const separators = el?.querySelectorAll('div');
      const hasSeparator = Array.from(separators ?? []).some(
        (d) => d.style.height === '1px' && d.style.margin === '4px 0px',
      );
      expect(hasSeparator).toBe(true);
    });

    it('IPSM-U032: menu has correct CSS class', () => {
      menu.show(100, 100);
      const el = document.querySelector('.info-panel-settings-menu');
      expect(el?.className).toBe('info-panel-settings-menu');
    });
  });
});
