/**
 * TabBar Component Tests
 *
 * Tests for the tab navigation component.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TabBar, TABS } from './TabBar';

describe('TabBar', () => {
  let tabBar: TabBar;

  beforeEach(() => {
    tabBar = new TabBar();
  });

  afterEach(() => {
    tabBar.dispose();
  });

  describe('initialization', () => {
    it('TAB-U001: creates TabBar instance', () => {
      expect(tabBar).toBeInstanceOf(TabBar);
    });

    it('TAB-U002: default active tab is view', () => {
      expect(tabBar.activeTab).toBe('view');
    });
  });

  describe('render', () => {
    it('TAB-U010: render returns container element', () => {
      const el = tabBar.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('TAB-U011: container has tab-bar class', () => {
      const el = tabBar.render();
      expect(el.className).toBe('tab-bar');
    });

    it('TAB-U012: container has correct height', () => {
      const el = tabBar.render();
      expect(el.style.height).toBe('36px');
    });

    it('TAB-U013: container has flex display', () => {
      const el = tabBar.render();
      expect(el.style.display).toBe('flex');
    });
  });

  describe('tab buttons', () => {
    it('TAB-U020: has view tab button', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="view"]');
      expect(btn).not.toBeNull();
    });

    it('TAB-U021: has color tab button', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="color"]');
      expect(btn).not.toBeNull();
    });

    it('TAB-U022: has effects tab button', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="effects"]');
      expect(btn).not.toBeNull();
    });

    it('TAB-U023: has transform tab button', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="transform"]');
      expect(btn).not.toBeNull();
    });

    it('TAB-U024: has annotate tab button', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="annotate"]');
      expect(btn).not.toBeNull();
    });

    it('TAB-U025: all tabs have buttons', () => {
      const el = tabBar.render();
      for (const tab of TABS) {
        const btn = el.querySelector(`[data-tab-id="${tab.id}"]`);
        expect(btn).not.toBeNull();
      }
    });
  });

  describe('tab button content', () => {
    it('TAB-U030: view tab has label', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="view"]');
      expect(btn?.textContent).toContain('View');
    });

    it('TAB-U031: color tab has label', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="color"]');
      expect(btn?.textContent).toContain('Color');
    });

    it('TAB-U032: tab buttons have shortcut in title', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="view"]') as HTMLButtonElement;
      expect(btn.title).toContain('1');
    });

    it('TAB-U033: each tab has its shortcut in title', () => {
      const el = tabBar.render();
      for (const tab of TABS) {
        const btn = el.querySelector(`[data-tab-id="${tab.id}"]`) as HTMLButtonElement;
        expect(btn.title).toContain(tab.shortcut);
      }
    });
  });

  describe('setActiveTab', () => {
    it('TAB-U040: setActiveTab changes active tab', () => {
      tabBar.setActiveTab('color');
      expect(tabBar.activeTab).toBe('color');
    });

    it('TAB-U041: setActiveTab to same tab does nothing', () => {
      const callback = vi.fn();
      tabBar.on('tabChanged', callback);

      tabBar.setActiveTab('view'); // Already view

      expect(callback).not.toHaveBeenCalled();
    });

    it('TAB-U042: setActiveTab emits tabChanged event', () => {
      const callback = vi.fn();
      tabBar.on('tabChanged', callback);

      tabBar.setActiveTab('effects');

      expect(callback).toHaveBeenCalledWith('effects');
    });

    it('TAB-U043: clicking tab button changes active tab', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="annotate"]') as HTMLButtonElement;

      btn.click();

      expect(tabBar.activeTab).toBe('annotate');
    });
  });

  describe('active tab styling', () => {
    it('TAB-U050: active tab has primary text color', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="view"]') as HTMLButtonElement;

      expect(btn.style.cssText).toContain('var(--text-primary)');
    });

    it('TAB-U051: inactive tab has muted color', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="color"]') as HTMLButtonElement;

      expect(btn.style.cssText).toContain('var(--text-muted)');
    });

    it('TAB-U052: changing active tab updates styling', () => {
      const el = tabBar.render();
      const colorBtn = el.querySelector('[data-tab-id="color"]') as HTMLButtonElement;
      const viewBtn = el.querySelector('[data-tab-id="view"]') as HTMLButtonElement;

      tabBar.setActiveTab('color');

      expect(colorBtn.style.cssText).toContain('var(--text-primary)');
      expect(viewBtn.style.cssText).toContain('var(--text-muted)');
    });
  });

  describe('tab hover effects', () => {
    it('TAB-U060: inactive tab changes on mouseenter', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="color"]') as HTMLButtonElement;

      btn.dispatchEvent(new MouseEvent('mouseenter'));

      expect(btn.style.cssText).toContain('var(--text-secondary)');
    });

    it('TAB-U061: inactive tab restores on mouseleave', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="color"]') as HTMLButtonElement;

      btn.dispatchEvent(new MouseEvent('mouseenter'));
      btn.dispatchEvent(new MouseEvent('mouseleave'));

      expect(btn.style.cssText).toContain('var(--text-muted)');
    });

    it('TAB-U062: active tab does not change on hover', () => {
      const el = tabBar.render();
      const btn = el.querySelector('[data-tab-id="view"]') as HTMLButtonElement;

      btn.dispatchEvent(new MouseEvent('mouseenter'));

      // Active tab keeps primary color
      expect(btn.style.cssText).toContain('var(--text-primary)');
    });
  });

  describe('keyboard shortcuts', () => {
    it('TAB-U070: 1 key selects view tab', () => {
      tabBar.setActiveTab('color');
      const handled = tabBar.handleKeyboard('1');
      expect(handled).toBe(true);
      expect(tabBar.activeTab).toBe('view');
    });

    it('TAB-U071: 2 key selects color tab', () => {
      const handled = tabBar.handleKeyboard('2');
      expect(handled).toBe(true);
      expect(tabBar.activeTab).toBe('color');
    });

    it('TAB-U072: 3 key selects effects tab', () => {
      const handled = tabBar.handleKeyboard('3');
      expect(handled).toBe(true);
      expect(tabBar.activeTab).toBe('effects');
    });

    it('TAB-U073: 4 key selects transform tab', () => {
      const handled = tabBar.handleKeyboard('4');
      expect(handled).toBe(true);
      expect(tabBar.activeTab).toBe('transform');
    });

    it('TAB-U074: 5 key selects annotate tab', () => {
      const handled = tabBar.handleKeyboard('5');
      expect(handled).toBe(true);
      expect(tabBar.activeTab).toBe('annotate');
    });

    it('TAB-U075: unhandled key returns false', () => {
      const handled = tabBar.handleKeyboard('x');
      expect(handled).toBe(false);
    });
  });

  describe('indicator', () => {
    it('TAB-U080: has indicator element', () => {
      const el = tabBar.render();
      // Indicator is a div with position absolute and accent-primary background
      const indicator = el.querySelector('div[style*="var(--accent-primary)"]');
      expect(indicator).not.toBeNull();
    });
  });

  describe('dispose', () => {
    it('TAB-U090: dispose can be called without error', () => {
      expect(() => tabBar.dispose()).not.toThrow();
    });

    it('TAB-U091: dispose can be called multiple times', () => {
      expect(() => {
        tabBar.dispose();
        tabBar.dispose();
      }).not.toThrow();
    });
  });

  describe('TABS constant', () => {
    it('TAB-U100: TABS has 6 tabs', () => {
      expect(TABS.length).toBe(6);
    });

    it('TAB-U101: all tabs have id, label, icon, shortcut', () => {
      for (const tab of TABS) {
        expect(tab).toHaveProperty('id');
        expect(tab).toHaveProperty('label');
        expect(tab).toHaveProperty('icon');
        expect(tab).toHaveProperty('shortcut');
      }
    });

    it('TAB-U102: tab shortcuts are 1 through 6', () => {
      const shortcuts = TABS.map(t => t.shortcut);
      expect(shortcuts).toEqual(['1', '2', '3', '4', '5', '6']);
    });
  });
});
