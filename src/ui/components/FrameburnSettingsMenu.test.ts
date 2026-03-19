import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PreferencesManager, resetCorePreferencesManagerForTests } from '../../core/PreferencesManager';
import { FrameburnSettingsMenu } from './FrameburnSettingsMenu';

describe('FrameburnSettingsMenu', () => {
  let prefs: PreferencesManager;
  let menu: FrameburnSettingsMenu;

  beforeEach(() => {
    resetCorePreferencesManagerForTests();
    prefs = new PreferencesManager();
    menu = new FrameburnSettingsMenu(prefs);
  });

  afterEach(() => {
    menu.dispose();
    document.body.innerHTML = '';
    resetCorePreferencesManagerForTests();
  });

  it('FBSM-001: shows a settings menu with expected aria label', () => {
    menu.show(100, 120);

    const el = document.querySelector('.frameburn-settings-menu');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-label')).toBe('Frameburn settings');
    expect(menu.isVisible()).toBe(true);
  });

  it('FBSM-002: updates export defaults when controls change', () => {
    menu.show(100, 120);

    const enabled = document.querySelector<HTMLInputElement>('[data-testid="frameburn-enabled"]')!;
    enabled.checked = true;
    enabled.dispatchEvent(new Event('input', { bubbles: true }));

    document.querySelector<HTMLButtonElement>('[data-testid="frameburn-field-add"]')!.click();

    const typeSelect = document.querySelector<HTMLSelectElement>('[data-testid="frameburn-field-type-1"]')!;
    typeSelect.value = 'custom';
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const labelInput = document.querySelector<HTMLInputElement>('[data-testid="frameburn-field-label-1"]')!;
    labelInput.value = 'Client';
    labelInput.dispatchEvent(new Event('input', { bubbles: true }));

    const valueInput = document.querySelector<HTMLInputElement>('[data-testid="frameburn-field-value-1"]')!;
    valueInput.value = 'ACME';
    valueInput.dispatchEvent(new Event('input', { bubbles: true }));

    const defaults = prefs.getExportDefaults();
    expect(defaults.frameburnEnabled).toBe(true);
    expect(defaults.frameburnConfig).toEqual(
      expect.objectContaining({
        enabled: true,
        fields: [{ type: 'timecode' }, { type: 'custom', label: 'Client', value: 'ACME' }],
      }),
    );
  });

  it('FBSM-003: hides on outside click and Escape', () => {
    menu.show(100, 120);
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.isVisible()).toBe(false);

    menu.show(100, 120);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isVisible()).toBe(false);
  });
});
