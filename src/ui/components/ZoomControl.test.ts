/**
 * ZoomControl Component Tests
 *
 * Tests for the zoom dropdown control with preset zoom levels
 * and keyboard shortcuts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ZoomControl, ZoomLevel } from './ZoomControl';

describe('ZoomControl', () => {
  let control: ZoomControl;

  beforeEach(() => {
    control = new ZoomControl();
  });

  afterEach(() => {
    control.dispose();
  });

  describe('initialization', () => {
    it('ZOOM-U001: should initialize with fit zoom level', () => {
      expect(control.getZoom()).toBe('fit');
    });
  });

  describe('render', () => {
    it('ZOOM-U010: render returns container element', () => {
      const el = control.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.dataset.testid).toBe('zoom-control');
    });

    it('ZOOM-U011: container has zoom button', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zoom-control-button"]');
      expect(button).not.toBeNull();
    });

    it('ZOOM-U012: button has correct title', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
      expect(button.title).toBe('Zoom level (F to fit, 0-4 for presets)');
    });

    it('ZOOM-U013: button displays Fit label initially', () => {
      const el = control.render();
      const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
      expect(button.textContent).toContain('Fit');
    });
  });

  describe('getZoom/setZoom', () => {
    it('ZOOM-U020: getZoom returns current zoom level', () => {
      expect(control.getZoom()).toBe('fit');
    });

    it('ZOOM-U021: setZoom changes zoom to fit', () => {
      control.setZoom(1);
      control.setZoom('fit');
      expect(control.getZoom()).toBe('fit');
    });

    it('ZOOM-U022: setZoom changes zoom to 25%', () => {
      control.setZoom(0.25);
      expect(control.getZoom()).toBe(0.25);
    });

    it('ZOOM-U023: setZoom changes zoom to 50%', () => {
      control.setZoom(0.5);
      expect(control.getZoom()).toBe(0.5);
    });

    it('ZOOM-U024: setZoom changes zoom to 100%', () => {
      control.setZoom(1);
      expect(control.getZoom()).toBe(1);
    });

    it('ZOOM-U025: setZoom changes zoom to 200%', () => {
      control.setZoom(2);
      expect(control.getZoom()).toBe(2);
    });

    it('ZOOM-U026: setZoom changes zoom to 400%', () => {
      control.setZoom(4);
      expect(control.getZoom()).toBe(4);
    });

    it('ZOOM-U027: setZoom emits zoomChanged event', () => {
      const callback = vi.fn();
      control.on('zoomChanged', callback);

      control.setZoom(1);
      expect(callback).toHaveBeenCalledWith(1);
    });
  });

  describe('button label updates', () => {
    it('ZOOM-U030: button shows Fit for fit zoom', () => {
      const el = control.render();
      control.setZoom('fit');
      const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
      expect(button.textContent).toContain('Fit');
    });

    it('ZOOM-U031: button shows 25% for 0.25 zoom', () => {
      const el = control.render();
      control.setZoom(0.25);
      const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
      expect(button.textContent).toContain('25%');
    });

    it('ZOOM-U032: button shows 50% for 0.5 zoom', () => {
      const el = control.render();
      control.setZoom(0.5);
      const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
      expect(button.textContent).toContain('50%');
    });

    it('ZOOM-U033: button shows 100% for 1 zoom', () => {
      const el = control.render();
      control.setZoom(1);
      const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
      expect(button.textContent).toContain('100%');
    });

    it('ZOOM-U034: button shows 200% for 2 zoom', () => {
      const el = control.render();
      control.setZoom(2);
      const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
      expect(button.textContent).toContain('200%');
    });

    it('ZOOM-U035: button shows 400% for 4 zoom', () => {
      const el = control.render();
      control.setZoom(4);
      const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
      expect(button.textContent).toContain('400%');
    });
  });

  describe('keyboard shortcuts', () => {
    it('ZOOM-U040: handleKeyboard F sets zoom to fit', () => {
      const result = control.handleKeyboard('f');
      expect(result).toBe(true);
      expect(control.getZoom()).toBe('fit');
    });

    it('ZOOM-U041: handleKeyboard F (uppercase) sets zoom to fit', () => {
      const result = control.handleKeyboard('F');
      expect(result).toBe(true);
      expect(control.getZoom()).toBe('fit');
    });

    it('ZOOM-U042: handleKeyboard 0 sets zoom to 50%', () => {
      const result = control.handleKeyboard('0');
      expect(result).toBe(true);
      expect(control.getZoom()).toBe(0.5);
    });

    it('ZOOM-U043: handleKeyboard 1-4 return false (reserved for tabs)', () => {
      expect(control.handleKeyboard('1')).toBe(false);
      expect(control.handleKeyboard('2')).toBe(false);
      expect(control.handleKeyboard('3')).toBe(false);
      expect(control.handleKeyboard('4')).toBe(false);
    });

    it('ZOOM-U044: handleKeyboard returns false for unhandled keys', () => {
      expect(control.handleKeyboard('a')).toBe(false);
      expect(control.handleKeyboard('z')).toBe(false);
      expect(control.handleKeyboard('Space')).toBe(false);
    });

    it('ZOOM-U045: handleKeyboard emits event on valid key', () => {
      const callback = vi.fn();
      control.on('zoomChanged', callback);

      control.handleKeyboard('f');
      expect(callback).toHaveBeenCalledWith('fit');
    });
  });

  describe('dispose', () => {
    it('ZOOM-U050: dispose cleans up without error', () => {
      expect(() => control.dispose()).not.toThrow();
    });

    it('ZOOM-U051: dispose can be called multiple times', () => {
      expect(() => {
        control.dispose();
        control.dispose();
      }).not.toThrow();
    });

    it('ZOOM-U052: dispose removes dropdown from body', () => {
      control.render();
      // Open dropdown to add it to body
      const el = control.render();
      const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
      button.click(); // Open

      control.dispose();

      const dropdown = document.querySelector('[data-testid="zoom-dropdown"]');
      expect(dropdown).toBeNull();
    });
  });
});

describe('ZoomControl zoom levels', () => {
  let control: ZoomControl;

  beforeEach(() => {
    control = new ZoomControl();
  });

  afterEach(() => {
    control.dispose();
  });

  const zoomLevels: { value: ZoomLevel; label: string }[] = [
    { value: 'fit', label: 'Fit' },
    { value: 0.25, label: '25%' },
    { value: 0.5, label: '50%' },
    { value: 1, label: '100%' },
    { value: 2, label: '200%' },
    { value: 4, label: '400%' },
  ];

  zoomLevels.forEach(({ value, label }) => {
    it(`ZOOM-U060-${label}: setZoom(${value}) is supported`, () => {
      control.setZoom(value);
      expect(control.getZoom()).toBe(value);
    });
  });
});

describe('ZoomControl event handling', () => {
  let control: ZoomControl;

  beforeEach(() => {
    control = new ZoomControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('ZOOM-U070: multiple listeners receive zoomChanged events', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    control.on('zoomChanged', callback1);
    control.on('zoomChanged', callback2);

    control.setZoom(2);

    expect(callback1).toHaveBeenCalledWith(2);
    expect(callback2).toHaveBeenCalledWith(2);
  });

  it('ZOOM-U071: off removes event listener', () => {
    const callback = vi.fn();
    control.on('zoomChanged', callback);
    control.off('zoomChanged', callback);

    control.setZoom(2);

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('ZoomControl dropdown visual selection', () => {
  let control: ZoomControl;

  beforeEach(() => {
    control = new ZoomControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('ZOOM-U080: only selected zoom has accent styling in dropdown', () => {
    const el = control.render();
    document.body.appendChild(el);
    control.setZoom(1); // 100%

    // Open dropdown
    const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
    button.click();

    const dropdown = document.querySelector('[data-testid="zoom-dropdown"]') as HTMLElement;
    const options = dropdown.querySelectorAll('button');

    // Count items with accent color (selected styling)
    let accentCount = 0;
    options.forEach((option) => {
      if ((option as HTMLButtonElement).style.color === 'var(--accent-primary)') {
        accentCount++;
      }
    });

    expect(accentCount).toBeLessThanOrEqual(1);
    document.body.removeChild(el);
  });

  it('ZOOM-U081: changing zoom via setZoom updates dropdown styling', () => {
    const el = control.render();
    document.body.appendChild(el);

    // Open dropdown
    const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
    button.click();

    const dropdown = document.querySelector('[data-testid="zoom-dropdown"]') as HTMLElement;
    const options = dropdown.querySelectorAll('button');

    // Set to 100% (index 3: Fit, 25%, 50%, 100%)
    control.setZoom(1);

    // 100% should have accent styling
    expect((options[3] as HTMLButtonElement).style.color).toBe('var(--accent-primary)');

    // Change to 200% (index 4)
    control.setZoom(2);

    // 100% should no longer have accent styling
    expect((options[3] as HTMLButtonElement).style.color).not.toBe('var(--accent-primary)');
    // 200% should have accent styling
    expect((options[4] as HTMLButtonElement).style.color).toBe('var(--accent-primary)');
    document.body.removeChild(el);
  });

  it('ZOOM-U082: clicking dropdown item selects zoom and resets previous styling', () => {
    const handler = vi.fn();
    control.on('zoomChanged', handler);
    const el = control.render();
    document.body.appendChild(el);

    // Open dropdown
    const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
    button.click();

    const dropdown = document.querySelector('[data-testid="zoom-dropdown"]') as HTMLElement;
    const options = dropdown.querySelectorAll('button');

    // Click 100% (index 3)
    (options[3] as HTMLButtonElement).click();
    expect(handler).toHaveBeenCalledWith(1);
    expect(control.getZoom()).toBe(1);

    // Reopen dropdown
    button.click();

    // Click 200% (index 4)
    (options[4] as HTMLButtonElement).click();
    expect(handler).toHaveBeenCalledWith(2);
    expect(control.getZoom()).toBe(2);

    // Verify only 200% has accent styling
    button.click();
    expect((options[3] as HTMLButtonElement).style.color).not.toBe('var(--accent-primary)');
    expect((options[4] as HTMLButtonElement).style.color).toBe('var(--accent-primary)');
    document.body.removeChild(el);
  });

  it('ZOOM-U083: rapid zoom changes maintain correct visual state', () => {
    const el = control.render();
    document.body.appendChild(el);

    // Open dropdown
    const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
    button.click();

    const dropdown = document.querySelector('[data-testid="zoom-dropdown"]') as HTMLElement;
    const options = dropdown.querySelectorAll('button');

    // Rapidly change zoom levels
    control.setZoom('fit');
    control.setZoom(0.25);
    control.setZoom(0.5);
    control.setZoom(1);
    control.setZoom(2);
    control.setZoom(4);
    control.setZoom('fit');

    // Only fit (index 0) should have accent styling
    let accentCount = 0;
    options.forEach((option) => {
      if ((option as HTMLButtonElement).style.color === 'var(--accent-primary)') {
        accentCount++;
      }
    });

    expect(accentCount).toBe(1);
    expect((options[0] as HTMLButtonElement).style.color).toBe('var(--accent-primary)');

    document.body.removeChild(el);
  });

  it('ZOOM-U084: keyboard shortcut followed by dropdown click resets previous styling', () => {
    const el = control.render();
    document.body.appendChild(el);

    // Use keyboard to set fit
    control.handleKeyboard('f');
    expect(control.getZoom()).toBe('fit');

    // Open dropdown
    const button = el.querySelector('[data-testid="zoom-control-button"]') as HTMLButtonElement;
    button.click();

    const dropdown = document.querySelector('[data-testid="zoom-dropdown"]') as HTMLElement;
    const options = dropdown.querySelectorAll('button');

    // Click 100% (index 3)
    (options[3] as HTMLButtonElement).click();
    expect(control.getZoom()).toBe(1);

    // Reopen and verify only 100% has accent styling
    button.click();
    expect((options[0] as HTMLButtonElement).style.color).not.toBe('var(--accent-primary)');
    expect((options[3] as HTMLButtonElement).style.color).toBe('var(--accent-primary)');

    document.body.removeChild(el);
  });
});
