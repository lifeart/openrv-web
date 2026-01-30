/**
 * ContextToolbar Component Tests
 *
 * Tests for the context-sensitive toolbar that changes based on active tab.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextToolbar } from './ContextToolbar';
import { TabId } from './TabBar';

describe('ContextToolbar', () => {
  let toolbar: ContextToolbar;

  beforeEach(() => {
    toolbar = new ContextToolbar();
  });

  afterEach(() => {
    toolbar.dispose();
  });

  describe('initialization', () => {
    it('CTX-U001: creates ContextToolbar instance', () => {
      expect(toolbar).toBeInstanceOf(ContextToolbar);
    });

    it('CTX-U002: default active tab is view', () => {
      expect(toolbar.activeTab).toBe('view');
    });
  });

  describe('render', () => {
    it('CTX-U010: render returns container element', () => {
      const el = toolbar.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('CTX-U011: container has context-toolbar class', () => {
      const el = toolbar.render();
      expect(el.className).toBe('context-toolbar');
    });

    it('CTX-U012: container has correct height', () => {
      const el = toolbar.render();
      expect(el.style.height).toBe('44px');
    });

    it('CTX-U013: container has flex display', () => {
      const el = toolbar.render();
      expect(el.style.display).toBe('flex');
    });
  });

  describe('setActiveTab', () => {
    it('CTX-U020: setActiveTab changes active tab', () => {
      toolbar.setActiveTab('color');
      expect(toolbar.activeTab).toBe('color');
    });

    it('CTX-U021: setActiveTab to same tab does nothing', () => {
      toolbar.setActiveTab('view');
      toolbar.setActiveTab('view'); // Same tab
      expect(toolbar.activeTab).toBe('view');
    });

    it('CTX-U022: setActiveTab works for all tabs', () => {
      const tabs: TabId[] = ['view', 'color', 'effects', 'transform', 'annotate'];
      for (const tab of tabs) {
        toolbar.setActiveTab(tab);
        expect(toolbar.activeTab).toBe(tab);
      }
    });
  });

  describe('tab content', () => {
    it('CTX-U030: getTabContainer returns container for tab', () => {
      const container = toolbar.getTabContainer('view');
      expect(container).toBeInstanceOf(HTMLElement);
    });

    it('CTX-U031: getTabContainer returns different containers for different tabs', () => {
      const viewContainer = toolbar.getTabContainer('view');
      const colorContainer = toolbar.getTabContainer('color');
      expect(viewContainer).not.toBe(colorContainer);
    });

    it('CTX-U032: setTabContent adds content to tab', () => {
      const content = document.createElement('div');
      content.textContent = 'Test content';

      toolbar.setTabContent('view', content);
      toolbar.setActiveTab('view');

      const container = toolbar.getTabContainer('view');
      expect(container?.textContent).toContain('Test content');
    });

    it('CTX-U033: appendToTab appends content to tab', () => {
      const content1 = document.createElement('span');
      content1.textContent = 'First';
      const content2 = document.createElement('span');
      content2.textContent = 'Second';

      toolbar.appendToTab('color', content1);
      toolbar.appendToTab('color', content2);

      const container = toolbar.getTabContainer('color');
      expect(container?.textContent).toContain('First');
      expect(container?.textContent).toContain('Second');
    });

    it('CTX-U034: setTabContent replaces existing content', () => {
      const content1 = document.createElement('div');
      content1.textContent = 'Old content';
      const content2 = document.createElement('div');
      content2.textContent = 'New content';

      toolbar.setTabContent('view', content1);
      toolbar.setTabContent('view', content2);

      const container = toolbar.getTabContainer('view');
      expect(container?.textContent).not.toContain('Old content');
      expect(container?.textContent).toContain('New content');
    });
  });

  describe('tab visibility', () => {
    it('CTX-U040: active tab container is visible', () => {
      toolbar.setActiveTab('view');
      const container = toolbar.getTabContainer('view');
      expect(container?.style.display).toBe('flex');
    });

    it('CTX-U041: inactive tab container is hidden', () => {
      toolbar.setActiveTab('view');
      const container = toolbar.getTabContainer('color');
      expect(container?.style.display).toBe('none');
    });

    it('CTX-U042: switching tabs changes visibility', () => {
      toolbar.setActiveTab('view');
      toolbar.setActiveTab('color');

      const viewContainer = toolbar.getTabContainer('view');
      const colorContainer = toolbar.getTabContainer('color');

      expect(viewContainer?.style.display).toBe('none');
      expect(colorContainer?.style.display).toBe('flex');
    });
  });

  describe('static createDivider', () => {
    it('CTX-U050: createDivider returns element', () => {
      const divider = ContextToolbar.createDivider();
      expect(divider).toBeInstanceOf(HTMLElement);
    });

    it('CTX-U051: divider has 1px width', () => {
      const divider = ContextToolbar.createDivider();
      expect(divider.style.width).toBe('1px');
    });

    it('CTX-U052: divider has 24px height', () => {
      const divider = ContextToolbar.createDivider();
      expect(divider.style.height).toBe('24px');
    });
  });

  describe('static createButton', () => {
    it('CTX-U060: createButton returns button element', () => {
      const btn = ContextToolbar.createButton('Test', () => {});
      expect(btn).toBeInstanceOf(HTMLButtonElement);
    });

    it('CTX-U061: button has correct text', () => {
      const btn = ContextToolbar.createButton('Click me', () => {});
      expect(btn.textContent).toContain('Click me');
    });

    it('CTX-U062: button calls onClick when clicked', () => {
      const onClick = vi.fn();
      const btn = ContextToolbar.createButton('Test', onClick);

      btn.click();

      expect(onClick).toHaveBeenCalled();
    });

    it('CTX-U063: button with title has title attribute', () => {
      const btn = ContextToolbar.createButton('Test', () => {}, { title: 'Tooltip' });
      expect(btn.title).toBe('Tooltip');
    });

    it('CTX-U064: active button has accent styling', () => {
      const btn = ContextToolbar.createButton('Test', () => {}, { active: true });
      expect(btn.style.cssText).toContain('var(--accent-primary)');
    });

    it('CTX-U065: inactive button has transparent background', () => {
      const btn = ContextToolbar.createButton('Test', () => {}, { active: false });
      expect(btn.style.background).toBe('transparent');
    });

    it('CTX-U066: button with minWidth has min-width set', () => {
      const btn = ContextToolbar.createButton('Test', () => {}, { minWidth: '100px' });
      expect(btn.style.minWidth).toBe('100px');
    });

    it('CTX-U067: inactive button changes on hover', () => {
      const btn = ContextToolbar.createButton('Test', () => {}, { active: false });

      btn.dispatchEvent(new MouseEvent('mouseenter'));

      expect(btn.style.cssText).toContain('var(--bg-hover)');
    });

    it('CTX-U068: inactive button restores on mouseleave', () => {
      const btn = ContextToolbar.createButton('Test', () => {}, { active: false });

      btn.dispatchEvent(new MouseEvent('mouseenter'));
      btn.dispatchEvent(new MouseEvent('mouseleave'));

      expect(btn.style.background).toBe('transparent');
    });
  });

  describe('static createSlider', () => {
    it('CTX-U070: createSlider returns element', () => {
      const slider = ContextToolbar.createSlider('Test');
      expect(slider).toBeInstanceOf(HTMLElement);
    });

    it('CTX-U071: slider container has label', () => {
      const container = ContextToolbar.createSlider('Brightness');
      expect(container.textContent).toContain('Brightness');
    });

    it('CTX-U072: slider has input element', () => {
      const container = ContextToolbar.createSlider('Test');
      const input = container.querySelector('input[type="range"]');
      expect(input).not.toBeNull();
    });

    it('CTX-U073: slider respects min option', () => {
      const container = ContextToolbar.createSlider('Test', { min: 10 });
      const input = container.querySelector('input[type="range"]') as HTMLInputElement;
      expect(input.min).toBe('10');
    });

    it('CTX-U074: slider respects max option', () => {
      const container = ContextToolbar.createSlider('Test', { max: 200 });
      const input = container.querySelector('input[type="range"]') as HTMLInputElement;
      expect(input.max).toBe('200');
    });

    it('CTX-U075: slider respects step option', () => {
      const container = ContextToolbar.createSlider('Test', { step: 0.5 });
      const input = container.querySelector('input[type="range"]') as HTMLInputElement;
      expect(input.step).toBe('0.5');
    });

    it('CTX-U076: slider respects value option', () => {
      const container = ContextToolbar.createSlider('Test', { value: 75 });
      const input = container.querySelector('input[type="range"]') as HTMLInputElement;
      expect(input.value).toBe('75');
    });

    it('CTX-U077: slider calls onChange on input', () => {
      const onChange = vi.fn();
      const container = ContextToolbar.createSlider('Test', { onChange });
      const input = container.querySelector('input[type="range"]') as HTMLInputElement;

      input.value = '60';
      input.dispatchEvent(new Event('input'));

      expect(onChange).toHaveBeenCalledWith(60);
    });

    it('CTX-U078: slider calls onDoubleClick on dblclick', () => {
      const onDoubleClick = vi.fn();
      const container = ContextToolbar.createSlider('Test', { onDoubleClick });
      const input = container.querySelector('input[type="range"]') as HTMLInputElement;

      input.dispatchEvent(new MouseEvent('dblclick'));

      expect(onDoubleClick).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('CTX-U080: dispose can be called without error', () => {
      expect(() => toolbar.dispose()).not.toThrow();
    });

    it('CTX-U081: dispose can be called multiple times', () => {
      expect(() => {
        toolbar.dispose();
        toolbar.dispose();
      }).not.toThrow();
    });
  });

  describe('all tabs', () => {
    const tabs: TabId[] = ['view', 'color', 'effects', 'transform', 'annotate'];

    tabs.forEach(tab => {
      it(`CTX-U090-${tab}: ${tab} tab has container`, () => {
        const container = toolbar.getTabContainer(tab);
        expect(container).toBeInstanceOf(HTMLElement);
      });

      it(`CTX-U091-${tab}: can set ${tab} as active`, () => {
        toolbar.setActiveTab(tab);
        expect(toolbar.activeTab).toBe(tab);
      });
    });
  });
});
