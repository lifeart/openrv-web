import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClippingOverlaySettingsMenu } from './ClippingOverlaySettingsMenu';

function createOverlayMock() {
  let state = {
    enabled: false,
    showHighlights: true,
    showShadows: true,
    highlightColor: { r: 255, g: 0, b: 0 },
    shadowColor: { r: 0, g: 100, b: 255 },
    opacity: 0.7,
  };

  return {
    getState: vi.fn(() => ({ ...state })),
    setShowHighlights: vi.fn((showHighlights) => {
      state = { ...state, showHighlights };
    }),
    setShowShadows: vi.fn((showShadows) => {
      state = { ...state, showShadows };
    }),
    setOpacity: vi.fn((opacity) => {
      state = { ...state, opacity };
    }),
  };
}

describe('ClippingOverlaySettingsMenu', () => {
  let overlay: ReturnType<typeof createOverlayMock>;
  let menu: ClippingOverlaySettingsMenu;

  beforeEach(() => {
    overlay = createOverlayMock();
    menu = new ClippingOverlaySettingsMenu(overlay as any);
  });

  afterEach(() => {
    menu.dispose();
    document.body.innerHTML = '';
  });

  it('COSM-001: shows a settings menu with expected aria label', () => {
    menu.show(100, 120);
    const el = document.querySelector('.clipping-overlay-settings-menu');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-label')).toBe('Clipping Overlay settings');
    expect(menu.isVisible()).toBe(true);
  });

  it('COSM-002: highlight and shadow toggles update the overlay', () => {
    menu.show(100, 120);
    document.querySelector<HTMLElement>('[data-setting="show-highlights"]')?.click();
    document.querySelector<HTMLElement>('[data-setting="show-shadows"]')?.click();

    expect(overlay.setShowHighlights).toHaveBeenCalledWith(false);
    expect(overlay.setShowShadows).toHaveBeenCalledWith(false);
  });

  it('COSM-003: opacity slider updates the overlay', () => {
    menu.show(100, 120);
    const slider = document.querySelector<HTMLInputElement>('[data-testid="clipping-opacity-slider"]')!;
    slider.value = '40';
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(overlay.setOpacity).toHaveBeenCalledWith(0.4);
    expect(document.querySelector('[data-testid="clipping-opacity-value"]')?.textContent).toBe('40%');
  });

  it('COSM-004: hides on outside click and Escape', () => {
    menu.show(100, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.isVisible()).toBe(false);

    menu.show(100, 120);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isVisible()).toBe(false);
  });
});
