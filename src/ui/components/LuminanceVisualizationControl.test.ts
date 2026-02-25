/**
 * LuminanceVisualizationControl Unit Tests
 *
 * Tests for the UI control component that manages luminance visualization modes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LuminanceVisualization } from './LuminanceVisualization';
import { LuminanceVisualizationControl } from './LuminanceVisualizationControl';
import { FalseColor } from './FalseColor';

describe('LuminanceVisualizationControl', () => {
  let falseColor: FalseColor;
  let lumVis: LuminanceVisualization;
  let control: LuminanceVisualizationControl;

  beforeEach(() => {
    falseColor = new FalseColor();
    lumVis = new LuminanceVisualization(falseColor);
    control = new LuminanceVisualizationControl(lumVis);
  });

  afterEach(() => {
    control.dispose();
    lumVis.dispose();
    falseColor.dispose();
  });

  describe('render', () => {
    it('renders a container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('luminance-vis-control');
    });

    it('has a toggle button with correct data-testid', () => {
      const el = control.render();
      const btn = el.querySelector('[data-testid="luminance-vis-selector"]');
      expect(btn).not.toBeNull();
    });
  });

  describe('badge', () => {
    it('creates a badge element with correct data-testid', () => {
      const badge = control.createBadge();
      expect(badge).toBeInstanceOf(HTMLElement);
      expect(badge.dataset.testid).toBe('luminance-vis-badge');
    });

    it('badge is hidden when mode is off', () => {
      const badge = control.createBadge();
      expect(badge.style.display).toBe('none');
    });

    it('badge becomes visible when mode is set', () => {
      const badge = control.createBadge();
      lumVis.setMode('hsv');
      expect(badge.style.display).toBe('block');
      expect(badge.textContent).toBe('HSV');
    });

    it('badge shows mode-specific text with parameters', () => {
      const badge = control.createBadge();
      lumVis.setMode('random-color');
      expect(badge.textContent).toBe('Random (16)');

      lumVis.setMode('contour');
      expect(badge.textContent).toBe('Contour (10)');
    });

    it('badge hides when mode returns to off', () => {
      const badge = control.createBadge();
      lumVis.setMode('hsv');
      expect(badge.style.display).toBe('block');

      lumVis.setMode('off');
      expect(badge.style.display).toBe('none');
    });
  });

  describe('dropdown content', () => {
    it('contains mode option buttons', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;
      button.click(); // open dropdown to append to body
      // The dropdown should have buttons for all modes
      const offBtn = document.querySelector('[data-testid="luminance-vis-off"]');
      const hsvBtn = document.querySelector('[data-testid="luminance-vis-hsv"]');
      const randomBtn = document.querySelector('[data-testid="luminance-vis-random"]');
      const contourBtn = document.querySelector('[data-testid="luminance-vis-contour"]');
      const fcBtn = document.querySelector('[data-testid="luminance-vis-false-color"]');

      expect(offBtn).not.toBeNull();
      expect(hsvBtn).not.toBeNull();
      expect(randomBtn).not.toBeNull();
      expect(contourBtn).not.toBeNull();
      expect(fcBtn).not.toBeNull();
    });
  });

  describe('button styling', () => {
    it('LUM-M20a: borderColor resets to transparent on pointerleave when inactive', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('pointerenter'));
      expect(button.style.borderColor).toBe('var(--border-primary)');
      button.dispatchEvent(new MouseEvent('pointerleave'));
      expect(button.style.borderColor).toBe('transparent');
    });

    it('LUM-M20b: borderColor remains accent color on pointerleave when active', () => {
      const el = control.render();
      lumVis.setMode('hsv');
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;
      button.dispatchEvent(new MouseEvent('pointerenter'));
      button.dispatchEvent(new MouseEvent('pointerleave'));
      expect(button.style.borderColor).toBe('var(--accent-primary)');
    });
  });

  describe('outside click listener lifecycle', () => {
    it('LUM-M21a: outside click listener should NOT be registered when dropdown is closed', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      control.dispose();
      lumVis.dispose();
      falseColor.dispose();
      addSpy.mockClear();

      falseColor = new FalseColor();
      lumVis = new LuminanceVisualization(falseColor);
      control = new LuminanceVisualizationControl(lumVis);

      const clickCalls = addSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(0);
      addSpy.mockRestore();
    });

    it('LUM-M21b: outside click listener should be registered when dropdown opens', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;

      addSpy.mockClear();
      button.click(); // open

      const clickCalls = addSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(1);
      addSpy.mockRestore();
    });

    it('LUM-M21c: outside click listener should be removed when dropdown closes', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;

      button.click(); // open
      removeSpy.mockClear();
      button.click(); // close

      const clickCalls = removeSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(1);
      removeSpy.mockRestore();
    });

    it('LUM-M21d: dispose should remove outside click listener regardless of dropdown state', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;

      button.click(); // open dropdown
      removeSpy.mockClear();
      control.dispose();

      const clickCalls = removeSpy.mock.calls.filter(
        ([event]) => event === 'click'
      );
      expect(clickCalls.length).toBe(1);
      removeSpy.mockRestore();
    });
  });

  it('LUM-U050: dispose unsubscribes from state changes', () => {
    const unsubSpy = vi.fn();
    vi.spyOn(lumVis, 'on').mockReturnValue(unsubSpy);

    // Re-create to capture subscription
    control.dispose();
    control = new LuminanceVisualizationControl(lumVis);

    expect(lumVis.on).toHaveBeenCalledWith('stateChanged', expect.any(Function));

    control.dispose();

    expect(unsubSpy).toHaveBeenCalled();
  });

  describe('keyboard focus ring (M-16)', () => {
    it('LUM-M16a: toggle button should have focus/blur event listeners added by applyA11yFocus', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;

      // applyA11yFocus registers a focus listener that sets outline on keyboard focus.
      button.dispatchEvent(new Event('focus'));
      expect(button.style.outline).toBe('2px solid var(--accent-primary)');
    });

    it('LUM-M16b: keyboard focus (Tab) should apply visible focus ring', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;

      // Simulate keyboard focus (no preceding mousedown)
      button.dispatchEvent(new Event('focus'));
      expect(button.style.outline).toBe('2px solid var(--accent-primary)');
      expect(button.style.outlineOffset).toBe('2px');
    });

    it('LUM-M16c: mouse focus (click) should not apply focus ring', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;

      // Simulate mouse click: pointerdown then focus
      button.dispatchEvent(new Event('pointerdown'));
      button.dispatchEvent(new Event('focus'));
      expect(button.style.outline).not.toBe('2px solid var(--accent-primary)');
    });
  });

  describe('dropdown body append (H-07)', () => {
    it('LV-H07e: dropdown should be appended to document.body when opened', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;

      expect(document.body.querySelector('.luminance-vis-dropdown')).toBeNull();

      button.click();

      const dropdown = document.body.querySelector('.luminance-vis-dropdown') as HTMLElement;
      expect(dropdown).not.toBeNull();
      expect(document.body.contains(dropdown)).toBe(true);
      expect(el.contains(dropdown)).toBe(false);
    });

    it('LV-H07f: dropdown should be removed from document.body on close', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;

      button.click(); // open
      button.click(); // close

      const dropdown = document.body.querySelector('.luminance-vis-dropdown') as HTMLElement;
      expect(dropdown.style.display).toBe('none');
    });

    it('LV-H07g: dropdown should be removed from document.body on dispose', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;

      button.click(); // open
      expect(document.body.querySelector('.luminance-vis-dropdown')).not.toBeNull();

      control.dispose();
      expect(document.body.querySelector('.luminance-vis-dropdown')).toBeNull();
    });

    it('LV-H07h: dropdown should reposition on window scroll', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;
      const scrollSpy = vi.spyOn(window, 'addEventListener');

      button.click();

      const scrollCalls = scrollSpy.mock.calls.filter(([event]) => event === 'scroll');
      expect(scrollCalls.length).toBeGreaterThanOrEqual(1);
      scrollSpy.mockRestore();
    });

    it('LV-H07i: dropdown should reposition on window resize', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;
      const resizeSpy = vi.spyOn(window, 'addEventListener');

      button.click();

      const resizeCalls = resizeSpy.mock.calls.filter(([event]) => event === 'resize');
      expect(resizeCalls.length).toBeGreaterThanOrEqual(1);
      resizeSpy.mockRestore();
    });
  });

  describe('ARIA attributes (M-15)', () => {
    it('LV-M15a: toggle button should have aria-haspopup attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('LV-M15b: toggle button aria-expanded should be "false" when dropdown is closed', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('LV-M15c: toggle button aria-expanded should be "true" when dropdown is open', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;
      button.click();
      expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('LV-M15d: dropdown container should have role="dialog" attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('.luminance-vis-dropdown') as HTMLElement;
      expect(dropdown.getAttribute('role')).toBe('dialog');
    });

    it('LV-M15e: dropdown container should have aria-label attribute', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="luminance-vis-selector"]') as HTMLButtonElement;
      button.click();
      const dropdown = document.querySelector('.luminance-vis-dropdown') as HTMLElement;
      expect(dropdown.getAttribute('aria-label')).toBe('Luminance Visualization Settings');
    });
  });
});
