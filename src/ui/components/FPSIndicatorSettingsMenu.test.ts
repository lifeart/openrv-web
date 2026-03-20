import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FPSIndicatorSettingsMenu } from './FPSIndicatorSettingsMenu';

function createIndicatorMock() {
  let state = {
    enabled: true,
    position: 'top-right' as const,
    showDroppedFrames: true,
    showTargetFps: true,
    backgroundOpacity: 0.6,
    warningThreshold: 0.97,
    criticalThreshold: 0.85,
  };

  return {
    getState: vi.fn(() => ({ ...state })),
    setPosition: vi.fn((position) => {
      state = { ...state, position };
    }),
    setBackgroundOpacity: vi.fn((backgroundOpacity) => {
      state = { ...state, backgroundOpacity };
    }),
    setState: vi.fn((partial) => {
      const merged = { ...state, ...partial };
      if (merged.warningThreshold < merged.criticalThreshold) {
        const tmp = merged.warningThreshold;
        merged.warningThreshold = merged.criticalThreshold;
        merged.criticalThreshold = tmp;
      }
      state = merged;
    }),
  };
}

describe('FPSIndicatorSettingsMenu', () => {
  let indicator: ReturnType<typeof createIndicatorMock>;
  let menu: FPSIndicatorSettingsMenu;

  beforeEach(() => {
    indicator = createIndicatorMock();
    menu = new FPSIndicatorSettingsMenu(indicator as any);
  });

  afterEach(() => {
    menu.dispose();
    document.body.innerHTML = '';
  });

  it('FOM-001: shows settings menu', () => {
    menu.show(50, 60);
    const el = document.querySelector('.fps-indicator-settings-menu');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-label')).toBe('FPS Indicator settings');
  });

  it('FOM-002: position selection updates indicator', () => {
    menu.show(50, 60);
    document.querySelector<HTMLElement>('[data-position="bottom-left"]')?.click();
    expect(indicator.setPosition).toHaveBeenCalledWith('bottom-left');
  });

  it('FOM-003: dropped-frames toggle updates indicator state', () => {
    menu.show(50, 60);
    document.querySelector<HTMLElement>('[data-setting="show-dropped"]')?.click();
    expect(indicator.setState).toHaveBeenCalledWith({ showDroppedFrames: false });
  });

  it('FOM-004: target-fps toggle updates indicator state', () => {
    menu.show(50, 60);
    document.querySelector<HTMLElement>('[data-setting="show-target"]')?.click();
    expect(indicator.setState).toHaveBeenCalledWith({ showTargetFps: false });
  });

  it('FOM-005: background slider updates indicator opacity', () => {
    menu.show(50, 60);
    const slider = document.querySelector<HTMLInputElement>('[data-testid="fps-bg-slider"]')!;
    slider.value = '30';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(indicator.setBackgroundOpacity).toHaveBeenCalledWith(0.3);
  });

  it('FOM-006: warning threshold slider reflects clamped ordering from indicator state', () => {
    menu.show(50, 60);
    const slider = document.querySelector<HTMLInputElement>('[data-testid="fps-warning-slider"]')!;
    slider.value = '40';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(indicator.setState).toHaveBeenCalledWith({ warningThreshold: 0.4 });
    expect(slider.value).toBe('85');
  });

  it('FOM-007: hides on Escape', () => {
    menu.show(50, 60);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isVisible()).toBe(false);
  });
});
