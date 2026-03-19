import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatteOverlaySettingsMenu } from './MatteOverlaySettingsMenu';

function createOverlayMock() {
  let settings = {
    show: false,
    aspect: 1.78,
    opacity: 0.66,
    heightVisible: -1,
    centerPoint: [0, 0] as [number, number],
  };

  return {
    getSettings: vi.fn(() => ({ ...settings, centerPoint: [...settings.centerPoint] as [number, number] })),
    setAspect: vi.fn((aspect) => {
      settings = { ...settings, aspect: Math.max(0.1, Math.min(10, aspect)) };
    }),
    setOpacity: vi.fn((opacity) => {
      settings = { ...settings, opacity: Math.max(0, Math.min(1, opacity)) };
    }),
    setCenterPoint: vi.fn((x, y) => {
      settings = { ...settings, centerPoint: [x, y] };
    }),
  };
}

describe('MatteOverlaySettingsMenu', () => {
  let overlay: ReturnType<typeof createOverlayMock>;
  let menu: MatteOverlaySettingsMenu;

  beforeEach(() => {
    overlay = createOverlayMock();
    menu = new MatteOverlaySettingsMenu(overlay as any);
  });

  afterEach(() => {
    menu.dispose();
    document.body.innerHTML = '';
  });

  it('MOSM-001: shows a settings menu with expected aria label', () => {
    menu.show(100, 120);
    const el = document.querySelector('.matte-overlay-settings-menu');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-label')).toBe('Matte Overlay settings');
    expect(menu.isVisible()).toBe(true);
  });

  it('MOSM-002: aspect input updates the overlay', () => {
    menu.show(100, 120);
    const input = document.querySelector<HTMLInputElement>('[data-testid="matte-aspect-input"]')!;
    input.value = '2.39';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(overlay.setAspect).toHaveBeenCalledWith(2.39);
    expect(input.value).toBe('2.39');
  });

  it('MOSM-003: opacity slider updates the overlay', () => {
    menu.show(100, 120);
    const slider = document.querySelector<HTMLInputElement>('[data-testid="matte-opacity-slider"]')!;
    slider.value = '80';
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(overlay.setOpacity).toHaveBeenCalledWith(0.8);
    expect(document.querySelector('[data-testid="matte-opacity-value"]')?.textContent).toBe('80%');
  });

  it('MOSM-004: center point sliders update the overlay', () => {
    menu.show(100, 120);
    const centerX = document.querySelector<HTMLInputElement>('[data-testid="matte-center-x-slider"]')!;
    centerX.value = '25';
    centerX.dispatchEvent(new Event('input', { bubbles: true }));

    const centerY = document.querySelector<HTMLInputElement>('[data-testid="matte-center-y-slider"]')!;
    centerY.value = '-40';
    centerY.dispatchEvent(new Event('input', { bubbles: true }));

    expect(overlay.setCenterPoint).toHaveBeenNthCalledWith(1, 0.25, 0);
    expect(overlay.setCenterPoint).toHaveBeenNthCalledWith(2, 0.25, -0.4);
  });

  it('MOSM-005: hides on outside click and Escape', () => {
    menu.show(100, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.isVisible()).toBe(false);

    menu.show(100, 120);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isVisible()).toBe(false);
  });

  describe('aspect ratio presets', () => {
    it('MOSM-006: renders preset buttons for common aspect ratios', () => {
      menu.show(100, 120);
      const presetsRow = document.querySelector('[data-testid="matte-aspect-presets"]');
      expect(presetsRow).not.toBeNull();

      const buttons = presetsRow!.querySelectorAll('button');
      expect(buttons.length).toBe(5);

      const labels = Array.from(buttons).map((b) => b.textContent);
      expect(labels).toEqual(['2.39:1', '1.85:1', '16:9', '4:3', '1:1']);
    });

    it('MOSM-007: clicking a preset sets the overlay aspect and updates the input', () => {
      menu.show(100, 120);
      const presetBtn = document.querySelector<HTMLButtonElement>('[data-testid="matte-aspect-preset-2-39-1"]')!;
      presetBtn.click();

      expect(overlay.setAspect).toHaveBeenCalledWith(2.39);
      const input = document.querySelector<HTMLInputElement>('[data-testid="matte-aspect-input"]')!;
      expect(input.value).toBe('2.39');
    });

    it('MOSM-008: clicking 16:9 preset sets aspect to 16/9', () => {
      menu.show(100, 120);
      const presetBtn = document.querySelector<HTMLButtonElement>('[data-testid="matte-aspect-preset-16-9"]')!;
      presetBtn.click();

      expect(overlay.setAspect).toHaveBeenCalledWith(16 / 9);
    });

    it('MOSM-009: clicking 4:3 preset sets aspect to 4/3', () => {
      menu.show(100, 120);
      const presetBtn = document.querySelector<HTMLButtonElement>('[data-testid="matte-aspect-preset-4-3"]')!;
      presetBtn.click();

      expect(overlay.setAspect).toHaveBeenCalledWith(4 / 3);
    });

    it('MOSM-010: clicking 1:1 preset sets aspect to 1', () => {
      menu.show(100, 120);
      const presetBtn = document.querySelector<HTMLButtonElement>('[data-testid="matte-aspect-preset-1-1"]')!;
      presetBtn.click();

      expect(overlay.setAspect).toHaveBeenCalledWith(1);
    });

    it('MOSM-011: the matching preset is highlighted when the menu opens', () => {
      // Default aspect is 1.78 which matches 16:9 (1.7777...)
      menu.show(100, 120);
      const presetBtn = document.querySelector<HTMLButtonElement>('[data-testid="matte-aspect-preset-16-9"]')!;
      // 16/9 = 1.7777... and default is 1.78, within 0.005 tolerance
      expect(presetBtn.style.color).toBe('var(--accent-primary)');
    });

    it('MOSM-012: clicking a preset updates the highlight to the selected ratio', () => {
      menu.show(100, 120);
      const btn239 = document.querySelector<HTMLButtonElement>('[data-testid="matte-aspect-preset-2-39-1"]')!;
      btn239.click();

      expect(btn239.style.color).toBe('var(--accent-primary)');

      // The 16:9 button should no longer be highlighted
      const btn169 = document.querySelector<HTMLButtonElement>('[data-testid="matte-aspect-preset-16-9"]')!;
      expect(btn169.style.color).toBe('var(--text-primary)');
    });
  });
});
