import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { TimecodeOverlaySettingsMenu } from './TimecodeOverlaySettingsMenu';

function createOverlayMock() {
  let state = {
    enabled: false,
    position: 'top-left' as const,
    fontSize: 'medium' as const,
    showFrameCounter: true,
    backgroundOpacity: 0.6,
  };

  return {
    getState: vi.fn(() => ({ ...state })),
    setPosition: vi.fn((position) => {
      state = { ...state, position };
    }),
    setFontSize: vi.fn((fontSize) => {
      state = { ...state, fontSize };
    }),
    setShowFrameCounter: vi.fn((showFrameCounter) => {
      state = { ...state, showFrameCounter };
    }),
    setBackgroundOpacity: vi.fn((backgroundOpacity) => {
      state = { ...state, backgroundOpacity };
    }),
  };
}

describe('TimecodeOverlaySettingsMenu', () => {
  let overlay: ReturnType<typeof createOverlayMock>;
  let menu: TimecodeOverlaySettingsMenu;

  beforeEach(() => {
    overlay = createOverlayMock();
    menu = new TimecodeOverlaySettingsMenu(overlay as any);
  });

  afterEach(() => {
    menu.dispose();
    document.body.innerHTML = '';
  });

  it('TOM-001: shows a settings menu with expected aria label', () => {
    menu.show(100, 120);
    const el = document.querySelector('.timecode-overlay-settings-menu');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-label')).toBe('Timecode Overlay settings');
    expect(menu.isVisible()).toBe(true);
  });

  it('TOM-002: position selection updates the overlay', () => {
    menu.show(100, 120);
    const item = document.querySelector<HTMLElement>('[data-position="bottom-right"]');
    item?.click();
    expect(overlay.setPosition).toHaveBeenCalledWith('bottom-right');
  });

  it('TOM-003: font size selection updates the overlay', () => {
    menu.show(100, 120);
    const item = document.querySelector<HTMLElement>('[data-font-size="large"]');
    item?.click();
    expect(overlay.setFontSize).toHaveBeenCalledWith('large');
  });

  it('TOM-004: frame counter toggle updates the overlay', () => {
    menu.show(100, 120);
    const item = document.querySelector<HTMLElement>('[data-setting="frame-counter"]');
    item?.click();
    expect(overlay.setShowFrameCounter).toHaveBeenCalledWith(false);
  });

  it('TOM-005: opacity slider updates the overlay', () => {
    menu.show(100, 120);
    const slider = document.querySelector<HTMLInputElement>('[data-testid="timecode-opacity-slider"]');
    expect(slider).not.toBeNull();
    slider!.value = '80';
    slider!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(overlay.setBackgroundOpacity).toHaveBeenCalledWith(0.8);
    expect(document.querySelector('[data-testid="timecode-opacity-value"]')?.textContent).toBe('80%');
  });

  it('TOM-006: hides on outside click', () => {
    menu.show(100, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.isVisible()).toBe(false);
  });

  it('TOM-007: hides on Escape', () => {
    menu.show(100, 120);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isVisible()).toBe(false);
  });
});
