import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { InfoStripSettingsMenu } from './InfoStripSettingsMenu';

function createOverlayMock() {
  let state = {
    enabled: false,
    showFullPath: false,
    backgroundOpacity: 0.6,
  };

  return {
    getState: vi.fn(() => ({ ...state })),
    setShowFullPath: vi.fn((showFullPath) => {
      state = { ...state, showFullPath };
    }),
    setBackgroundOpacity: vi.fn((backgroundOpacity) => {
      state = { ...state, backgroundOpacity };
    }),
  };
}

describe('InfoStripSettingsMenu', () => {
  let overlay: ReturnType<typeof createOverlayMock>;
  let menu: InfoStripSettingsMenu;

  beforeEach(() => {
    overlay = createOverlayMock();
    menu = new InfoStripSettingsMenu(overlay as any);
  });

  afterEach(() => {
    menu.dispose();
    document.body.innerHTML = '';
  });

  it('ISM-001: shows a settings menu with expected aria label', () => {
    menu.show(100, 120);
    const el = document.querySelector('.info-strip-settings-menu');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-label')).toBe('Info Strip settings');
    expect(menu.isVisible()).toBe(true);
  });

  it('ISM-002: display mode selection updates the overlay', () => {
    menu.show(100, 120);
    const item = document.querySelector<HTMLElement>('[data-mode="full-path"]');
    item?.click();
    expect(overlay.setShowFullPath).toHaveBeenCalledWith(true);
  });

  it('ISM-003: background opacity slider updates the overlay', () => {
    menu.show(100, 120);
    const slider = document.querySelector<HTMLInputElement>('[data-testid="info-strip-bg-slider"]');
    expect(slider).not.toBeNull();
    slider!.value = '80';
    slider!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(overlay.setBackgroundOpacity).toHaveBeenCalledWith(0.8);
    expect(document.querySelector('[data-testid="info-strip-bg-value"]')?.textContent).toBe('80%');
  });

  it('ISM-004: hides on outside click', () => {
    menu.show(100, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.isVisible()).toBe(false);
  });

  it('ISM-005: hides on Escape', () => {
    menu.show(100, 120);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isVisible()).toBe(false);
  });
});
