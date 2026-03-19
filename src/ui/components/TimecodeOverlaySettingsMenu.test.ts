import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { TimecodeOverlaySettingsMenu } from './TimecodeOverlaySettingsMenu';

function createOverlayMock() {
  let state = {
    enabled: false,
    position: 'top-left' as const,
    fontSize: 'medium' as const,
    showFrameCounter: true,
    backgroundOpacity: 0.6,
    displayFormat: 'smpte' as 'smpte' | 'frame' | 'both',
    sourceTimecode: undefined as string | undefined,
    showSourceTimecode: true,
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
    setDisplayFormat: vi.fn((displayFormat) => {
      state = { ...state, displayFormat };
    }),
    setShowSourceTimecode: vi.fn((showSourceTimecode) => {
      state = { ...state, showSourceTimecode };
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

  it('TOM-004: display format selection updates the overlay to frame', () => {
    menu.show(100, 120);
    const item = document.querySelector<HTMLElement>('[data-display-format="frame"]');
    expect(item).not.toBeNull();
    item?.click();
    expect(overlay.setDisplayFormat).toHaveBeenCalledWith('frame');
  });

  it('TOM-008: display format selection updates the overlay to both', () => {
    menu.show(100, 120);
    const item = document.querySelector<HTMLElement>('[data-display-format="both"]');
    expect(item).not.toBeNull();
    item?.click();
    expect(overlay.setDisplayFormat).toHaveBeenCalledWith('both');
  });

  it('TOM-009: display format selection updates the overlay to smpte', () => {
    menu.show(100, 120);
    const item = document.querySelector<HTMLElement>('[data-display-format="smpte"]');
    expect(item).not.toBeNull();
    item?.click();
    expect(overlay.setDisplayFormat).toHaveBeenCalledWith('smpte');
  });

  it('TOM-010: current display format is checked in menu', () => {
    menu.show(100, 120);
    const smpteItem = document.querySelector<HTMLElement>('[data-display-format="smpte"]');
    const frameItem = document.querySelector<HTMLElement>('[data-display-format="frame"]');
    const bothItem = document.querySelector<HTMLElement>('[data-display-format="both"]');

    expect(smpteItem?.getAttribute('aria-checked')).toBe('true');
    expect(frameItem?.getAttribute('aria-checked')).toBe('false');
    expect(bothItem?.getAttribute('aria-checked')).toBe('false');
  });

  it('TOM-011: display format section header exists', () => {
    menu.show(100, 120);
    const headers = document.querySelectorAll('.timecode-overlay-settings-menu div[role="none"]');
    const headerTexts = Array.from(headers).map((h) => h.textContent);
    expect(headerTexts).toContain('Display Format');
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

  it('TOM-012: show source timecode toggle exists', () => {
    menu.show(100, 120);
    const item = document.querySelector<HTMLElement>('[data-testid="show-source-timecode"]');
    expect(item).not.toBeNull();
    expect(item?.getAttribute('role')).toBe('menuitemcheckbox');
  });

  it('TOM-013: show source timecode toggle is checked by default', () => {
    menu.show(100, 120);
    const item = document.querySelector<HTMLElement>('[data-testid="show-source-timecode"]');
    expect(item?.getAttribute('aria-checked')).toBe('true');
  });

  it('TOM-014: clicking source timecode toggle calls setShowSourceTimecode', () => {
    menu.show(100, 120);
    const item = document.querySelector<HTMLElement>('[data-testid="show-source-timecode"]');
    item?.click();
    expect(overlay.setShowSourceTimecode).toHaveBeenCalledWith(false);
  });
});
