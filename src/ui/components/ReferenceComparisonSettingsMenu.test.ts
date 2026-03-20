import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReferenceComparisonSettingsMenu } from './ReferenceComparisonSettingsMenu';

function createReferenceManagerMock() {
  let state = {
    enabled: true,
    referenceImage: { width: 2, height: 2, data: new Uint8ClampedArray(16), channels: 4, capturedAt: Date.now() },
    viewMode: 'split-h' as const,
    opacity: 0.5,
    wipePosition: 0.5,
  };

  return {
    getState: vi.fn(() => ({ ...state })),
    getOpacity: vi.fn(() => state.opacity),
    getWipePosition: vi.fn(() => state.wipePosition),
    setViewMode: vi.fn((viewMode) => {
      state = { ...state, viewMode };
    }),
    setOpacity: vi.fn((opacity) => {
      state = { ...state, opacity };
    }),
    setWipePosition: vi.fn((wipePosition) => {
      state = { ...state, wipePosition };
    }),
  };
}

describe('ReferenceComparisonSettingsMenu', () => {
  let referenceManager: ReturnType<typeof createReferenceManagerMock>;
  let menu: ReferenceComparisonSettingsMenu;

  beforeEach(() => {
    referenceManager = createReferenceManagerMock();
    menu = new ReferenceComparisonSettingsMenu(referenceManager as any);
  });

  afterEach(() => {
    menu.dispose();
    document.body.innerHTML = '';
  });

  it('RCSM-001: shows a settings menu with expected aria label', () => {
    menu.show(100, 120);

    const el = document.querySelector('.reference-comparison-settings-menu');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-label')).toBe('Reference Comparison settings');
    expect(menu.isVisible()).toBe(true);
  });

  it('RCSM-002: selecting a mode updates the reference manager', () => {
    menu.show(100, 120);

    document.querySelector<HTMLElement>('[data-mode="overlay"]')?.click();

    expect(referenceManager.setViewMode).toHaveBeenCalledWith('overlay');
  });

  it('RCSM-003: opacity and wipe sliders update the reference manager', () => {
    menu.show(100, 120);

    const opacitySlider = document.querySelector<HTMLInputElement>('[data-testid="reference-opacity-slider"]')!;
    opacitySlider.value = '72';
    opacitySlider.dispatchEvent(new Event('input', { bubbles: true }));

    const wipeSlider = document.querySelector<HTMLInputElement>('[data-testid="reference-wipe-slider"]')!;
    wipeSlider.value = '31';
    wipeSlider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(referenceManager.setOpacity).toHaveBeenCalledWith(0.72);
    expect(referenceManager.setWipePosition).toHaveBeenCalledWith(0.31);
    expect(document.querySelector('[data-testid="reference-opacity-value"]')?.textContent).toBe('72%');
    expect(document.querySelector('[data-testid="reference-wipe-value"]')?.textContent).toBe('31%');
  });

  it('RCSM-004: hides on outside click and Escape', () => {
    menu.show(100, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.isVisible()).toBe(false);

    menu.show(100, 120);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isVisible()).toBe(false);
  });
});
