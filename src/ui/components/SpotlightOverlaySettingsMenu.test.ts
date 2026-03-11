import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpotlightOverlaySettingsMenu } from './SpotlightOverlaySettingsMenu';

function createSpotlightOverlayMock() {
  let state = {
    enabled: true,
    shape: 'circle' as const,
    x: 0.5,
    y: 0.5,
    width: 0.2,
    height: 0.2,
    dimAmount: 0.7,
    feather: 0.05,
  };

  return {
    getState: vi.fn(() => ({ ...state })),
    setShape: vi.fn((shape) => {
      state = { ...state, shape };
    }),
    setPosition: vi.fn((x, y) => {
      state = { ...state, x, y };
    }),
    setSize: vi.fn((width, height) => {
      state = { ...state, width, height };
    }),
    setDimAmount: vi.fn((dimAmount) => {
      state = { ...state, dimAmount };
    }),
    setFeather: vi.fn((feather) => {
      state = { ...state, feather };
    }),
  };
}

describe('SpotlightOverlaySettingsMenu', () => {
  let overlay: ReturnType<typeof createSpotlightOverlayMock>;
  let menu: SpotlightOverlaySettingsMenu;

  beforeEach(() => {
    overlay = createSpotlightOverlayMock();
    menu = new SpotlightOverlaySettingsMenu(overlay as any);
  });

  afterEach(() => {
    menu.dispose();
    document.body.innerHTML = '';
  });

  it('SOSM-001: shows a settings menu with expected aria label', () => {
    menu.show(100, 120);

    const el = document.querySelector('.spotlight-overlay-settings-menu');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-label')).toBe('Spotlight settings');
    expect(menu.isVisible()).toBe(true);
  });

  it('SOSM-002: shape and sliders update the overlay', () => {
    menu.show(100, 120);

    document.querySelector<HTMLElement>('[data-shape="rectangle"]')?.click();

    const centerXSlider = document.querySelector<HTMLInputElement>('[data-testid="spotlight-center-x-slider"]')!;
    centerXSlider.value = '65';
    centerXSlider.dispatchEvent(new Event('input', { bubbles: true }));

    const heightSlider = document.querySelector<HTMLInputElement>('[data-testid="spotlight-height-slider"]')!;
    heightSlider.value = '35';
    heightSlider.dispatchEvent(new Event('input', { bubbles: true }));

    const dimSlider = document.querySelector<HTMLInputElement>('[data-testid="spotlight-dim-slider"]')!;
    dimSlider.value = '82';
    dimSlider.dispatchEvent(new Event('input', { bubbles: true }));

    const featherSlider = document.querySelector<HTMLInputElement>('[data-testid="spotlight-feather-slider"]')!;
    featherSlider.value = '12';
    featherSlider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(overlay.setShape).toHaveBeenCalledWith('rectangle');
    expect(overlay.setPosition).toHaveBeenCalledWith(0.65, 0.5);
    expect(overlay.setSize).toHaveBeenCalledWith(0.2, 0.35);
    expect(overlay.setDimAmount).toHaveBeenCalledWith(0.82);
    expect(overlay.setFeather).toHaveBeenCalledWith(0.12);
  });

  it('SOSM-003: hides on outside click and Escape', () => {
    menu.show(100, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.isVisible()).toBe(false);

    menu.show(100, 120);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isVisible()).toBe(false);
  });
});
