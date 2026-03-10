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
});
