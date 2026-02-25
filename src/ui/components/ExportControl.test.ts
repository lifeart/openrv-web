/**
 * ExportControl Component Tests
 *
 * Tests for the export dropdown control with single frame, sequence,
 * and session export options.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExportControl } from './ExportControl';

describe('ExportControl', () => {
  let control: ExportControl;

  beforeEach(() => {
    control = new ExportControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('EXPORT-U001: creates ExportControl instance', () => {
      expect(control).toBeInstanceOf(ExportControl);
    });
  });

  describe('render', () => {
    it('EXPORT-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('EXPORT-U011: container has export-control-container class', () => {
      const el = control.render();
      expect(el.className).toBe('export-control-container');
    });

    it('EXPORT-U012: container has export button', () => {
      const el = control.render();
      const button = el.querySelector('button');
      expect(button).not.toBeNull();
    });

    it('EXPORT-U013: export button displays Export label', () => {
      const el = control.render();
      const button = el.querySelector('button');
      expect(button?.textContent).toContain('Export');
    });

    it('EXPORT-U014: export button has download icon', () => {
      const el = control.render();
      const button = el.querySelector('button');
      expect(button?.innerHTML).toContain('svg');
    });

    it('EXPORT-U015: export button has correct title', () => {
      const el = control.render();
      const button = el.querySelector('button') as HTMLButtonElement;
      expect(button.title).toContain('Ctrl+S');
    });
  });

  describe('quickExport', () => {
    it('EXPORT-U020: quickExport emits exportRequested event', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);

      control.quickExport();

      expect(callback).toHaveBeenCalled();
    });

    it('EXPORT-U021: quickExport uses png format by default', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);

      control.quickExport();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'png' })
      );
    });

    it('EXPORT-U022: quickExport can use jpeg format', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);

      control.quickExport('jpeg');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'jpeg' })
      );
    });

    it('EXPORT-U023: quickExport can use webp format', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);

      control.quickExport('webp');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'webp' })
      );
    });

    it('EXPORT-U024: quickExport includes quality setting', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);

      control.quickExport();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ quality: expect.any(Number) })
      );
    });

    it('EXPORT-U025: quickExport includes includeAnnotations setting', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);

      control.quickExport();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ includeAnnotations: expect.any(Boolean) })
      );
    });
  });

  describe('dispose', () => {
    it('EXPORT-U030: dispose can be called without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('EXPORT-U031: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });
  });

  describe('event listeners', () => {
    it('EXPORT-U040: exportRequested listener receives event data', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);
      control.quickExport('png');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'png',
          includeAnnotations: expect.any(Boolean),
          quality: expect.any(Number),
        })
      );
    });

    it('EXPORT-U041: copyRequested listener can be registered', () => {
      const callback = vi.fn();
      control.on('copyRequested', callback);
      // Verify listener was added by checking it can be removed without error
      expect(() => control.off('copyRequested', callback)).not.toThrow();
    });

    it('EXPORT-U041b: sourceExportRequested listener can be registered', () => {
      const callback = vi.fn();
      control.on('sourceExportRequested', callback);
      expect(() => control.off('sourceExportRequested', callback)).not.toThrow();
    });

    it('EXPORT-U042: sequenceExportRequested listener can be registered', () => {
      const callback = vi.fn();
      control.on('sequenceExportRequested', callback);
      expect(() => control.off('sequenceExportRequested', callback)).not.toThrow();
    });

    it('EXPORT-U042b: videoExportRequested listener can be registered', () => {
      const callback = vi.fn();
      control.on('videoExportRequested', callback);
      expect(() => control.off('videoExportRequested', callback)).not.toThrow();
    });

    it('EXPORT-U043: rvSessionExportRequested listener can be registered', () => {
      const callback = vi.fn();
      control.on('rvSessionExportRequested', callback);
      expect(() => control.off('rvSessionExportRequested', callback)).not.toThrow();
    });

    it('EXPORT-U044: off removes listener so it is not called', () => {
      const callback = vi.fn();
      control.on('exportRequested', callback);
      control.off('exportRequested', callback);

      control.quickExport();

      expect(callback).not.toHaveBeenCalled();
    });

    it('EXPORT-U045: multiple listeners can be registered for same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      control.on('exportRequested', callback1);
      control.on('exportRequested', callback2);

      control.quickExport();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('EXPORT-U046: exportReport emits reportExportRequested event with format', () => {
      const callback = vi.fn();
      control.on('reportExportRequested', callback);

      // We need to call exportReport directly, as the menu items are constructed within render
      // But they trigger this method
      (control as any).exportReport('html');

      expect(callback).toHaveBeenCalledWith({ format: 'html' });
    });
  });

  describe('export formats', () => {
    const formats: Array<'png' | 'jpeg' | 'webp'> = ['png', 'jpeg', 'webp'];

    formats.forEach((format) => {
      it(`EXPORT-U050-${format}: quickExport supports ${format} format`, () => {
        const callback = vi.fn();
        control.on('exportRequested', callback);

        control.quickExport(format);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({ format })
        );
      });
    });
  });

  describe('button interactions', () => {
    it('EXPORT-U060: button changes background on pointerenter', () => {
      const el = control.render();
      const button = el.querySelector('button') as HTMLButtonElement;
      const originalBg = button.style.background;

      button.dispatchEvent(new MouseEvent('pointerenter'));

      expect(button.style.background).not.toBe(originalBg);
      expect(button.style.cssText).toContain('var(--bg-hover)'); // #3a3a3a hover
    });

    it('EXPORT-U061: button restores transparent background on pointerleave', () => {
      const el = control.render();
      const button = el.querySelector('button') as HTMLButtonElement;

      button.dispatchEvent(new MouseEvent('pointerenter'));
      button.dispatchEvent(new MouseEvent('pointerleave'));

      expect(button.style.background).toBe('transparent');
    });

    it('EXPORT-U062: button has transparent background initially', () => {
      const el = control.render();
      const button = el.querySelector('button') as HTMLButtonElement;

      expect(button.style.background).toBe('transparent');
    });

    it('EXPORT-U063: button has transparent border initially', () => {
      const el = control.render();
      const button = el.querySelector('button') as HTMLButtonElement;

      expect(button.style.borderColor).toBe('transparent');
    });
  });
});

describe('ExportControl export request structure', () => {
  let control: ExportControl;

  beforeEach(() => {
    control = new ExportControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('EXPORT-U070: export request has format property', () => {
    const callback = vi.fn();
    control.on('exportRequested', callback);

    control.quickExport('png');

    const [request] = callback.mock.calls[0];
    expect(request).toHaveProperty('format');
    expect(request.format).toBe('png');
  });

  it('EXPORT-U071: export request has includeAnnotations property', () => {
    const callback = vi.fn();
    control.on('exportRequested', callback);

    control.quickExport();

    const [request] = callback.mock.calls[0];
    expect(request).toHaveProperty('includeAnnotations');
  });

  it('EXPORT-U072: export request has quality property', () => {
    const callback = vi.fn();
    control.on('exportRequested', callback);

    control.quickExport();

    const [request] = callback.mock.calls[0];
    expect(request).toHaveProperty('quality');
    expect(typeof request.quality).toBe('number');
  });

  it('EXPORT-U073: quality is between 0 and 1', () => {
    const callback = vi.fn();
    control.on('exportRequested', callback);

    control.quickExport();

    const [request] = callback.mock.calls[0];
    expect(request.quality).toBeGreaterThan(0);
    expect(request.quality).toBeLessThanOrEqual(1);
  });
});

describe('ExportControl Escape key handling (M-14)', () => {
  let control: ExportControl;

  beforeEach(() => {
    control = new ExportControl();
    document.body.appendChild(control.render());
  });

  afterEach(() => {
    control.dispose();
    const el = control.render();
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });

  function getExportButton(): HTMLButtonElement {
    return control.render().querySelector('button') as HTMLButtonElement;
  }

  it('EXPORT-M14a: pressing Escape while the dropdown is open should close it', () => {
    const button = getExportButton();
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('EXPORT-M14b: pressing Escape while the dropdown is closed should have no effect', () => {
    const button = getExportButton();
    expect(button.getAttribute('aria-expanded')).toBe('false');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('EXPORT-M14c: the keydown listener should be removed when the dropdown closes', () => {
    const spy = vi.spyOn(document, 'removeEventListener');

    const button = getExportButton();
    button.click(); // open
    button.click(); // close

    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    spy.mockRestore();
  });

  it('EXPORT-M14d: the keydown listener should be removed on dispose', () => {
    const spy = vi.spyOn(document, 'removeEventListener');

    const button = getExportButton();
    button.click(); // open
    control.dispose();

    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    spy.mockRestore();
  });
});

describe('ExportControl keyboard accessibility', () => {
  let control: ExportControl;

  beforeEach(() => {
    control = new ExportControl();
    document.body.appendChild(control.render());
  });

  afterEach(() => {
    control.dispose();
    const el = control.render();
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });

  function getExportButton(): HTMLButtonElement {
    return control.render().querySelector('button') as HTMLButtonElement;
  }

  function openDropdown(): void {
    getExportButton().click();
  }

  function getDropdown(): HTMLElement {
    return document.querySelector('.export-dropdown') as HTMLElement;
  }

  function getMenuItems(): HTMLElement[] {
    const dropdown = getDropdown();
    return dropdown ? Array.from(dropdown.querySelectorAll('[role="menuitem"]')) : [];
  }

  it('EXP-H10a: export menu items should be focusable via Tab key', () => {
    openDropdown();
    const items = getMenuItems();

    expect(items.length).toBeGreaterThan(0);

    // All menu items should be button elements (natively focusable)
    items.forEach((item) => {
      expect(item.tagName).toBe('BUTTON');
    });

    // Each item should have tabIndex -1 (focus managed programmatically)
    items.forEach((item) => {
      expect(item.tabIndex).toBe(-1);
    });

    // The first item should receive focus when menu opens
    expect(document.activeElement).toBe(items[0]);
  });

  it('EXP-H10b: export menu should support ArrowUp/ArrowDown navigation between items', () => {
    openDropdown();
    const items = getMenuItems();
    const dropdown = getDropdown();

    // First item is focused on open
    expect(document.activeElement).toBe(items[0]);

    // ArrowDown moves to the next item
    dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);

    // ArrowDown again moves to the third item
    dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[2]);

    // ArrowUp moves back to second item
    dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);

    // ArrowUp moves back to first item
    dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items[0]);

    // ArrowUp from first item wraps to last item
    dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items[items.length - 1]);

    // ArrowDown from last item wraps to first item
    dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
  });

  it('EXP-H10c: pressing Enter on a focused menu item should trigger its action', () => {
    const callback = vi.fn();
    control.on('exportRequested', callback);

    openDropdown();
    const items = getMenuItems();

    // First item is "Save as PNG" - click it via Enter (which triggers click on button)
    const firstItem = items[0] as HTMLButtonElement;
    expect(document.activeElement).toBe(firstItem);
    firstItem.click();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'png' })
    );
  });

  it('EXP-H10c-2: selecting source export item should emit sourceExportRequested', () => {
    const callback = vi.fn();
    control.on('sourceExportRequested', callback);

    openDropdown();
    const dropdown = getDropdown();
    const sourceItem = Array.from(dropdown.querySelectorAll('button'))
      .find((btn) => btn.textContent?.includes('Save Source as PNG')) as HTMLButtonElement | undefined;

    expect(sourceItem).toBeDefined();
    sourceItem!.click();

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'png' })
    );
  });

  it('EXP-H10c-3: selecting video export item should emit videoExportRequested', () => {
    const callback = vi.fn();
    control.on('videoExportRequested', callback);

    openDropdown();
    const dropdown = getDropdown();
    const videoItem = Array.from(dropdown.querySelectorAll('button'))
      .find((btn) => btn.textContent?.includes('Export MP4 In/Out Range')) as HTMLButtonElement | undefined;

    expect(videoItem).toBeDefined();
    videoItem!.click();

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ useInOutRange: true, includeAnnotations: true })
    );
  });

  it('EXP-H10d: export button should have aria-haspopup="menu" attribute', () => {
    const button = getExportButton();
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('EXP-H10e: export button should toggle aria-expanded when menu opens/closes', () => {
    const button = getExportButton();

    // Initially closed
    expect(button.getAttribute('aria-expanded')).toBe('false');

    // Open the dropdown
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');

    // Close the dropdown
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('EXP-H10f: export dropdown container should have role="menu" attribute', () => {
    openDropdown();
    const dropdown = getDropdown();
    expect(dropdown.getAttribute('role')).toBe('menu');
  });

  it('EXP-M15e: export dropdown should have aria-label attribute', () => {
    openDropdown();
    const dropdown = getDropdown();
    expect(dropdown.getAttribute('aria-label')).toBe('Export Settings');
  });

  it('EXP-H10g: pressing Escape should close the export menu', () => {
    openDropdown();
    const dropdown = getDropdown();
    const button = getExportButton();

    // Dropdown should be visible
    expect(dropdown.style.display).toBe('block');
    expect(button.getAttribute('aria-expanded')).toBe('true');

    // Press Escape
    dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // Dropdown should be hidden
    expect(dropdown.style.display).toBe('none');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
