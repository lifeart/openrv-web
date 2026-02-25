/**
 * Panel Component Tests
 *
 * Tests for the shared panel utility including dropdown panels,
 * panel headers, and slider rows.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPanel, createPanelHeader, createSliderRow, Panel } from './Panel';

describe('createPanel', () => {
  let panel: Panel;

  afterEach(() => {
    panel?.dispose();
  });

  describe('basic creation', () => {
    it('PANEL-U001: creates panel element', () => {
      panel = createPanel();
      expect(panel.element).toBeInstanceOf(HTMLElement);
    });

    it('PANEL-U002: panel has dropdown-panel class', () => {
      panel = createPanel();
      expect(panel.element.className).toBe('dropdown-panel');
    });

    it('PANEL-U003: panel is hidden by default', () => {
      panel = createPanel();
      expect(panel.isVisible()).toBe(false);
    });

    it('PANEL-U004: panel has fixed positioning', () => {
      panel = createPanel();
      expect(panel.element.style.position).toBe('fixed');
    });
  });

  describe('options', () => {
    it('PANEL-U010: width option sets panel width', () => {
      panel = createPanel({ width: '300px' });
      expect(panel.element.style.width).toBe('300px');
    });

    it('PANEL-U011: default width is 280px', () => {
      panel = createPanel();
      expect(panel.element.style.width).toBe('280px');
    });

    it('PANEL-U012: maxHeight option sets max-height', () => {
      panel = createPanel({ maxHeight: '500px' });
      expect(panel.element.style.maxHeight).toBe('500px');
    });

    it('PANEL-U013: default maxHeight is 400px', () => {
      panel = createPanel();
      expect(panel.element.style.maxHeight).toBe('400px');
    });
  });

  describe('show/hide', () => {
    let anchor: HTMLElement;

    beforeEach(() => {
      anchor = document.createElement('button');
      anchor.style.cssText = 'position: fixed; top: 50px; left: 100px; width: 100px; height: 30px;';
      document.body.appendChild(anchor);
    });

    afterEach(() => {
      document.body.removeChild(anchor);
    });

    it('PANEL-U020: show makes panel visible', () => {
      panel = createPanel();
      panel.show(anchor);
      expect(panel.isVisible()).toBe(true);
    });

    it('PANEL-U021: show adds panel to body', () => {
      panel = createPanel();
      panel.show(anchor);
      expect(document.body.contains(panel.element)).toBe(true);
    });

    it('PANEL-U022: show sets display to block', () => {
      panel = createPanel();
      panel.show(anchor);
      expect(panel.element.style.display).toBe('block');
    });

    it('PANEL-U023: hide makes panel not visible', () => {
      panel = createPanel();
      panel.show(anchor);
      panel.hide();
      expect(panel.isVisible()).toBe(false);
    });

    it('PANEL-U024: hide sets display to none', () => {
      panel = createPanel();
      panel.show(anchor);
      panel.hide();
      expect(panel.element.style.display).toBe('none');
    });
  });

  describe('toggle', () => {
    let anchor: HTMLElement;

    beforeEach(() => {
      anchor = document.createElement('button');
      document.body.appendChild(anchor);
    });

    afterEach(() => {
      document.body.removeChild(anchor);
    });

    it('PANEL-U030: toggle shows hidden panel', () => {
      panel = createPanel();
      panel.toggle(anchor);
      expect(panel.isVisible()).toBe(true);
    });

    it('PANEL-U031: toggle hides visible panel', () => {
      panel = createPanel();
      panel.show(anchor);
      panel.toggle(anchor);
      expect(panel.isVisible()).toBe(false);
    });

    it('PANEL-U032: toggle twice returns to original state', () => {
      panel = createPanel();
      panel.toggle(anchor);
      panel.toggle(anchor);
      expect(panel.isVisible()).toBe(false);
    });
  });

  describe('dispose', () => {
    let disposeAnchor: HTMLElement | null = null;

    afterEach(() => {
      if (disposeAnchor && document.body.contains(disposeAnchor)) {
        document.body.removeChild(disposeAnchor);
      }
      disposeAnchor = null;
    });

    it('PANEL-U040: dispose removes panel from body', () => {
      disposeAnchor = document.createElement('button');
      document.body.appendChild(disposeAnchor);

      panel = createPanel();
      panel.show(disposeAnchor);
      expect(document.body.contains(panel.element)).toBe(true);

      panel.dispose();

      expect(document.body.contains(panel.element)).toBe(false);
    });

    it('PANEL-U041: dispose hides panel and sets isVisible to false', () => {
      disposeAnchor = document.createElement('button');
      document.body.appendChild(disposeAnchor);

      panel = createPanel();
      panel.show(disposeAnchor);
      expect(panel.isVisible()).toBe(true);

      panel.dispose();

      expect(panel.isVisible()).toBe(false);
    });

    it('PANEL-U042: dispose can be called multiple times without error', () => {
      panel = createPanel();
      expect(() => {
        panel.dispose();
        panel.dispose();
        panel.dispose();
      }).not.toThrow();
    });

    it('PANEL-U043: dispose removes event listeners (no error on subsequent calls)', () => {
      disposeAnchor = document.createElement('button');
      document.body.appendChild(disposeAnchor);

      panel = createPanel();
      panel.show(disposeAnchor);
      panel.dispose();

      // Trigger events that would fail if listeners weren't cleaned up
      expect(() => {
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      }).not.toThrow();
    });
  });

  describe('align option', () => {
    let anchor: HTMLElement;

    beforeEach(() => {
      anchor = document.createElement('button');
      anchor.style.cssText = 'position: fixed; top: 50px; left: 100px; width: 100px; height: 30px;';
      document.body.appendChild(anchor);
    });

    afterEach(() => {
      if (document.body.contains(anchor)) {
        document.body.removeChild(anchor);
      }
    });

    it('PANEL-U050: left align positions panel near anchor left edge', () => {
      panel = createPanel({ align: 'left' });
      panel.show(anchor);
      const leftValue = parseInt(panel.element.style.left, 10);
      expect(leftValue).toBeGreaterThanOrEqual(0);
    });

    it('PANEL-U051: right align positions panel from anchor right edge', () => {
      panel = createPanel({ align: 'right' });
      panel.show(anchor);
      const leftValue = parseInt(panel.element.style.left, 10);
      expect(leftValue).toBeGreaterThanOrEqual(0);
    });

    it('PANEL-U052: panel has top position set after show', () => {
      panel = createPanel();
      panel.show(anchor);
      // In JSDOM, getBoundingClientRect returns zeros, so just verify top is set
      expect(panel.element.style.top).toBeDefined();
      expect(panel.element.style.top).not.toBe('');
    });
  });

  describe('escape key handling', () => {
    let anchor: HTMLElement;

    beforeEach(() => {
      anchor = document.createElement('button');
      document.body.appendChild(anchor);
    });

    afterEach(() => {
      if (document.body.contains(anchor)) {
        document.body.removeChild(anchor);
      }
    });

    it('PANEL-U053: pressing Escape closes an open panel', () => {
      panel = createPanel();
      panel.show(anchor);
      expect(panel.isVisible()).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(panel.isVisible()).toBe(false);
      expect(panel.element.style.display).toBe('none');
    });

    it('PANEL-U054: keydown listener is removed when panel is hidden', () => {
      panel = createPanel();
      panel.show(anchor);

      // Close via Escape
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(panel.isVisible()).toBe(false);

      // Show and hide manually to confirm no stale listener interference
      panel.show(anchor);
      expect(panel.isVisible()).toBe(true);

      // Hide manually
      panel.hide();
      expect(panel.isVisible()).toBe(false);

      // Subsequent Escape should not cause errors or change state
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(panel.isVisible()).toBe(false);
    });

    it('PANEL-U055: Escape calls stopPropagation to prevent double-close', () => {
      panel = createPanel();
      panel.show(anchor);

      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      document.dispatchEvent(event);

      expect(stopPropagationSpy).toHaveBeenCalled();
      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(panel.isVisible()).toBe(false);
    });
  });
});

describe('createPanelHeader', () => {
  it('PANEL-U060: creates header element', () => {
    const header = createPanelHeader('Title');
    expect(header).toBeInstanceOf(HTMLElement);
  });

  it('PANEL-U061: header displays title', () => {
    const header = createPanelHeader('My Title');
    expect(header.textContent).toContain('My Title');
  });

  it('PANEL-U062: header has flex display', () => {
    const header = createPanelHeader('Title');
    expect(header.style.display).toBe('flex');
  });

  it('PANEL-U063: header with onClose has close button', () => {
    const onClose = vi.fn();
    const header = createPanelHeader('Title', onClose);
    const closeBtn = header.querySelector('button');
    expect(closeBtn).not.toBeNull();
  });

  it('PANEL-U064: close button calls onClose callback', () => {
    const onClose = vi.fn();
    const header = createPanelHeader('Title', onClose);
    const closeBtn = header.querySelector('button') as HTMLButtonElement;
    closeBtn.click();
    expect(onClose).toHaveBeenCalled();
  });

  it('PANEL-U065: header without onClose has no close button', () => {
    const header = createPanelHeader('Title');
    const closeBtn = header.querySelector('button');
    expect(closeBtn).toBeNull();
  });

  it('PANEL-U066: close button has X icon', () => {
    const header = createPanelHeader('Title', () => {});
    const closeBtn = header.querySelector('button');
    expect(closeBtn?.querySelector('svg')).not.toBeNull();
  });

  it('PANEL-U067: close button has Close title', () => {
    const header = createPanelHeader('Title', () => {});
    const closeBtn = header.querySelector('button');
    expect(closeBtn?.title).toBe('Close');
  });
});

describe('createSliderRow', () => {
  describe('basic creation', () => {
    it('PANEL-U070: creates container element', () => {
      const { container } = createSliderRow('Label');
      expect(container).toBeInstanceOf(HTMLElement);
    });

    it('PANEL-U071: container has slider element', () => {
      const { slider } = createSliderRow('Label');
      expect(slider).toBeInstanceOf(HTMLInputElement);
      expect(slider.type).toBe('range');
    });

    it('PANEL-U072: container has valueLabel element', () => {
      const { valueLabel } = createSliderRow('Label');
      expect(valueLabel).toBeInstanceOf(HTMLSpanElement);
    });

    it('PANEL-U073: container displays label', () => {
      const { container } = createSliderRow('Brightness');
      expect(container.textContent).toContain('Brightness');
    });
  });

  describe('slider options', () => {
    it('PANEL-U080: min option sets slider minimum', () => {
      const { slider } = createSliderRow('Label', { min: 10 });
      expect(slider.min).toBe('10');
    });

    it('PANEL-U081: max option sets slider maximum', () => {
      const { slider } = createSliderRow('Label', { max: 200 });
      expect(slider.max).toBe('200');
    });

    it('PANEL-U082: step option sets slider step', () => {
      const { slider } = createSliderRow('Label', { step: 0.5 });
      expect(slider.step).toBe('0.5');
    });

    it('PANEL-U083: value option sets slider value', () => {
      const { slider } = createSliderRow('Label', { value: 75 });
      expect(slider.value).toBe('75');
    });

    it('PANEL-U084: default min is 0', () => {
      const { slider } = createSliderRow('Label');
      expect(slider.min).toBe('0');
    });

    it('PANEL-U085: default max is 100', () => {
      const { slider } = createSliderRow('Label');
      expect(slider.max).toBe('100');
    });

    it('PANEL-U086: default step is 1', () => {
      const { slider } = createSliderRow('Label');
      expect(slider.step).toBe('1');
    });

    it('PANEL-U087: default value is 50', () => {
      const { slider } = createSliderRow('Label');
      expect(slider.value).toBe('50');
    });
  });

  describe('unit display', () => {
    it('PANEL-U090: unit option appears in valueLabel', () => {
      const { valueLabel } = createSliderRow('Label', { value: 50, unit: '%' });
      expect(valueLabel.textContent).toBe('50%');
    });

    it('PANEL-U091: valueLabel updates with unit on change', () => {
      const { slider, valueLabel } = createSliderRow('Label', {
        value: 50,
        unit: 'px',
        onChange: () => {},
      });
      slider.value = '75';
      slider.dispatchEvent(new Event('input'));
      expect(valueLabel.textContent).toBe('75px');
    });
  });

  describe('onChange callback', () => {
    it('PANEL-U100: onChange is called on input', () => {
      const onChange = vi.fn();
      const { slider } = createSliderRow('Label', { onChange });
      slider.value = '60';
      slider.dispatchEvent(new Event('input'));
      expect(onChange).toHaveBeenCalledWith(60);
    });

    it('PANEL-U101: onChange receives numeric value', () => {
      const onChange = vi.fn();
      const { slider } = createSliderRow('Label', { onChange });
      slider.value = '33.5';
      slider.dispatchEvent(new Event('input'));
      expect(onChange).toHaveBeenCalledWith(33.5);
    });
  });

  describe('onReset callback', () => {
    it('PANEL-U110: onReset is called on dblclick', () => {
      const onReset = vi.fn();
      const { slider } = createSliderRow('Label', { onReset });
      slider.dispatchEvent(new MouseEvent('dblclick'));
      expect(onReset).toHaveBeenCalled();
    });

    it('PANEL-U111: onReset not called without option', () => {
      const { slider } = createSliderRow('Label');
      expect(() => {
        slider.dispatchEvent(new MouseEvent('dblclick'));
      }).not.toThrow();
    });
  });
});
