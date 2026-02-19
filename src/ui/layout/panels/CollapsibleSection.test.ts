/**
 * CollapsibleSection Tests
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { CollapsibleSection } from './CollapsibleSection';

describe('CollapsibleSection', () => {
  let section: CollapsibleSection;

  afterEach(() => {
    section?.dispose();
  });

  describe('initialization', () => {
    it('CS-001: creates element with title', () => {
      section = new CollapsibleSection('Test Section');
      const el = section.getElement();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.textContent).toContain('Test Section');
    });

    it('CS-002: defaults to expanded', () => {
      section = new CollapsibleSection('Test');
      expect(section.isExpanded()).toBe(true);
    });

    it('CS-003: respects expanded option', () => {
      section = new CollapsibleSection('Test', { expanded: false });
      expect(section.isExpanded()).toBe(false);
    });

    it('CS-004: sets testId when provided', () => {
      section = new CollapsibleSection('Test', { testId: 'my-section' });
      expect(section.getElement().dataset.testid).toBe('my-section');
    });

    it('CS-005: provides content container', () => {
      section = new CollapsibleSection('Test');
      const content = section.getContent();
      expect(content).toBeInstanceOf(HTMLElement);
      expect(content.className).toContain('collapsible-section-content');
    });

    it('CS-005b: no testId attribute when not provided', () => {
      section = new CollapsibleSection('Test');
      expect(section.getElement().dataset.testid).toBeUndefined();
    });
  });

  describe('toggle', () => {
    it('CS-006: toggles expanded state', () => {
      section = new CollapsibleSection('Test');
      expect(section.isExpanded()).toBe(true);
      section.toggle();
      expect(section.isExpanded()).toBe(false);
      section.toggle();
      expect(section.isExpanded()).toBe(true);
    });

    it('CS-007: header click toggles section', () => {
      section = new CollapsibleSection('Test');
      const header = section.getHeader();
      expect(section.isExpanded()).toBe(true);
      header.click();
      expect(section.isExpanded()).toBe(false);
    });
  });

  describe('setExpanded', () => {
    it('CS-008: sets to collapsed', () => {
      section = new CollapsibleSection('Test');
      section.setExpanded(false);
      expect(section.isExpanded()).toBe(false);
    });

    it('CS-009: no-op when already in desired state', () => {
      section = new CollapsibleSection('Test', { expanded: true });
      section.setExpanded(true);
      expect(section.isExpanded()).toBe(true);
    });
  });

  describe('chevron', () => {
    it('CS-010: chevron rotated when expanded', () => {
      section = new CollapsibleSection('Test', { expanded: true });
      const chevron = section.getElement().querySelector('.collapsible-chevron') as HTMLElement;
      expect(chevron.style.transform).toBe('rotate(90deg)');
    });

    it('CS-011: chevron not rotated when collapsed', () => {
      section = new CollapsibleSection('Test', { expanded: false });
      const chevron = section.getElement().querySelector('.collapsible-chevron') as HTMLElement;
      expect(chevron.style.transform).toBe('rotate(0deg)');
    });

    it('CS-011b: chevron rotates on toggle', () => {
      section = new CollapsibleSection('Test', { expanded: true });
      const chevron = section.getElement().querySelector('.collapsible-chevron') as HTMLElement;
      expect(chevron.style.transform).toBe('rotate(90deg)');
      section.toggle();
      expect(chevron.style.transform).toBe('rotate(0deg)');
      section.toggle();
      expect(chevron.style.transform).toBe('rotate(90deg)');
    });
  });

  describe('content wrapper visibility', () => {
    it('CS-013: content wrapper visible when expanded', () => {
      section = new CollapsibleSection('Test', { expanded: true });
      const wrapper = section.getElement().querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      expect(wrapper.style.display).not.toBe('none');
    });

    it('CS-014: content wrapper hidden when collapsed', () => {
      section = new CollapsibleSection('Test', { expanded: false });
      const wrapper = section.getElement().querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      expect(wrapper.style.display).toBe('none');
    });

    it('CS-015: content wrapper toggles with section', () => {
      section = new CollapsibleSection('Test', { expanded: true });
      const wrapper = section.getElement().querySelector('.collapsible-section-content-wrapper') as HTMLElement;
      section.toggle();
      expect(wrapper.style.display).toBe('none');
      section.toggle();
      expect(wrapper.style.display).not.toBe('none');
    });
  });

  describe('onToggle callback', () => {
    it('CS-016: fires onToggle on toggle()', () => {
      const onToggle = vi.fn();
      section = new CollapsibleSection('Test', { expanded: true, onToggle });
      section.toggle();
      expect(onToggle).toHaveBeenCalledWith(false);
      section.toggle();
      expect(onToggle).toHaveBeenCalledWith(true);
      expect(onToggle).toHaveBeenCalledTimes(2);
    });

    it('CS-017: fires onToggle on setExpanded()', () => {
      const onToggle = vi.fn();
      section = new CollapsibleSection('Test', { expanded: true, onToggle });
      section.setExpanded(false);
      expect(onToggle).toHaveBeenCalledWith(false);
    });

    it('CS-018: does not fire onToggle when setExpanded is no-op', () => {
      const onToggle = vi.fn();
      section = new CollapsibleSection('Test', { expanded: true, onToggle });
      section.setExpanded(true);
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('CS-019: fires onToggle on header click', () => {
      const onToggle = vi.fn();
      section = new CollapsibleSection('Test', { expanded: true, onToggle });
      section.getHeader().click();
      expect(onToggle).toHaveBeenCalledWith(false);
    });

    it('CS-020: works without onToggle callback', () => {
      section = new CollapsibleSection('Test');
      expect(() => section.toggle()).not.toThrow();
      expect(() => section.setExpanded(false)).not.toThrow();
    });
  });

  describe('getHeader', () => {
    it('CS-021: returns header element', () => {
      section = new CollapsibleSection('Test');
      const header = section.getHeader();
      expect(header).toBeInstanceOf(HTMLElement);
      expect(header.className).toContain('collapsible-section-header');
    });

    it('CS-022: header allows appending extra elements', () => {
      section = new CollapsibleSection('Test');
      const extra = document.createElement('button');
      extra.textContent = 'Extra';
      section.getHeader().appendChild(extra);
      expect(section.getHeader().textContent).toContain('Extra');
    });
  });

  describe('dispose', () => {
    it('CS-012: removes element from DOM', () => {
      section = new CollapsibleSection('Test');
      const parent = document.createElement('div');
      parent.appendChild(section.getElement());
      expect(parent.children.length).toBe(1);
      section.dispose();
      expect(parent.children.length).toBe(0);
    });
  });
});
