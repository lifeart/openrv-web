import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { EXRWindowOverlaySettingsMenu } from './EXRWindowOverlaySettingsMenu';

function createOverlayMock() {
  let state = {
    enabled: false,
    showDataWindow: true,
    showDisplayWindow: true,
    dataWindowColor: '#00ff00',
    displayWindowColor: '#00ccff',
    lineWidth: 2,
    dashPattern: [6, 4] as [number, number],
    showLabels: true,
  };

  return {
    getState: vi.fn(() => ({ ...state, dashPattern: [...state.dashPattern] as [number, number] })),
    setShowDataWindow: vi.fn((showDataWindow) => {
      state = { ...state, showDataWindow };
    }),
    setShowDisplayWindow: vi.fn((showDisplayWindow) => {
      state = { ...state, showDisplayWindow };
    }),
    setShowLabels: vi.fn((showLabels) => {
      state = { ...state, showLabels };
    }),
    setDataWindowColor: vi.fn((dataWindowColor) => {
      state = { ...state, dataWindowColor };
    }),
    setDisplayWindowColor: vi.fn((displayWindowColor) => {
      state = { ...state, displayWindowColor };
    }),
    setLineWidth: vi.fn((lineWidth) => {
      state = { ...state, lineWidth };
    }),
    setDashPattern: vi.fn((dashPattern) => {
      state = { ...state, dashPattern };
    }),
  };
}

describe('EXRWindowOverlaySettingsMenu', () => {
  let overlay: ReturnType<typeof createOverlayMock>;
  let menu: EXRWindowOverlaySettingsMenu;

  beforeEach(() => {
    overlay = createOverlayMock();
    menu = new EXRWindowOverlaySettingsMenu(overlay as any);
  });

  afterEach(() => {
    menu.dispose();
    document.body.innerHTML = '';
  });

  it('EXRSM-001: shows a settings menu with expected aria label', () => {
    menu.show(100, 120);
    const el = document.querySelector('.exr-window-overlay-settings-menu');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-label')).toBe('EXR Window Overlay settings');
    expect(menu.isVisible()).toBe(true);
  });

  it('EXRSM-002: visibility toggles update the overlay', () => {
    menu.show(100, 120);
    document.querySelector<HTMLElement>('[data-setting="show-data-window"]')?.click();
    document.querySelector<HTMLElement>('[data-setting="show-display-window"]')?.click();
    document.querySelector<HTMLElement>('[data-setting="show-labels"]')?.click();

    expect(overlay.setShowDataWindow).toHaveBeenCalledWith(false);
    expect(overlay.setShowDisplayWindow).toHaveBeenCalledWith(false);
    expect(overlay.setShowLabels).toHaveBeenCalledWith(false);
  });

  it('EXRSM-003: color inputs update the overlay', () => {
    menu.show(100, 120);
    const dataColor = document.querySelector<HTMLInputElement>('[data-testid="exr-data-window-color"]')!;
    dataColor.value = '#ff0000';
    dataColor.dispatchEvent(new Event('input', { bubbles: true }));

    const displayColor = document.querySelector<HTMLInputElement>('[data-testid="exr-display-window-color"]')!;
    displayColor.value = '#0000ff';
    displayColor.dispatchEvent(new Event('input', { bubbles: true }));

    expect(overlay.setDataWindowColor).toHaveBeenCalledWith('#ff0000');
    expect(overlay.setDisplayWindowColor).toHaveBeenCalledWith('#0000ff');
  });

  it('EXRSM-004: style sliders update the overlay', () => {
    menu.show(100, 120);

    const lineWidth = document.querySelector<HTMLInputElement>('[data-testid="exr-line-width-slider"]')!;
    lineWidth.value = '4';
    lineWidth.dispatchEvent(new Event('input', { bubbles: true }));

    const dashLength = document.querySelector<HTMLInputElement>('[data-testid="exr-dash-length-slider"]')!;
    dashLength.value = '10';
    dashLength.dispatchEvent(new Event('input', { bubbles: true }));

    const gapLength = document.querySelector<HTMLInputElement>('[data-testid="exr-gap-length-slider"]')!;
    gapLength.value = '2';
    gapLength.dispatchEvent(new Event('input', { bubbles: true }));

    expect(overlay.setLineWidth).toHaveBeenCalledWith(4);
    expect(overlay.setDashPattern).toHaveBeenCalledWith([10, 4]);
    expect(overlay.setDashPattern).toHaveBeenCalledWith([10, 2]);
  });

  it('EXRSM-005: hides on outside click and Escape', () => {
    menu.show(100, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.isVisible()).toBe(false);

    menu.show(100, 120);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isVisible()).toBe(false);
  });
});
