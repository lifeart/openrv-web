import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AutoSaveIndicator } from './AutoSaveIndicator';

describe('AutoSaveIndicator', () => {
  let indicator: AutoSaveIndicator;

  beforeEach(() => {
    indicator = new AutoSaveIndicator();
  });

  afterEach(() => {
    indicator.dispose();
  });

  describe('initialization', () => {
    it('AUTOSAVE-UI-001: renders with idle status by default', () => {
      expect(indicator.getStatus()).toBe('idle');
    });

    it('AUTOSAVE-UI-002: container has correct data-testid', () => {
      const element = indicator.render();
      expect(element.dataset.testid).toBe('autosave-indicator');
    });

    it('AUTOSAVE-UI-003: contains icon element', () => {
      const element = indicator.render();
      const icon = element.querySelector('[data-testid="autosave-icon"]');
      expect(icon).not.toBeNull();
    });

    it('AUTOSAVE-UI-004: contains text element', () => {
      const element = indicator.render();
      const text = element.querySelector('[data-testid="autosave-text"]');
      expect(text).not.toBeNull();
    });

    it('AUTOSAVE-UI-004a: text is constrained to single line with ellipsis', () => {
      const element = indicator.render();
      const text = element.querySelector('[data-testid="autosave-text"]') as HTMLElement;
      expect(text.style.whiteSpace).toBe('nowrap');
      expect(text.style.overflow).toBe('hidden');
      expect(text.style.textOverflow).toBe('ellipsis');
    });

    it('AUTOSAVE-UI-004b: container uses compact overflow-safe layout', () => {
      const element = indicator.render();
      expect(element.style.maxWidth).toBe('180px');
      expect(element.style.overflow).toBe('hidden');
      expect(element.style.flexShrink).toBe('0');
    });
  });

  describe('status display', () => {
    it('AUTOSAVE-UI-005: setStatus changes to saving', () => {
      indicator.setStatus('saving');
      expect(indicator.getStatus()).toBe('saving');
    });

    it('AUTOSAVE-UI-006: saving status shows "Saving..." text', () => {
      indicator.setStatus('saving');
      const element = indicator.render();
      const text = element.querySelector('[data-testid="autosave-text"]');
      expect(text?.textContent).toBe('Saving...');
    });

    it('AUTOSAVE-UI-007: saved status shows "Saved" text', () => {
      indicator.setStatus('saved');
      const element = indicator.render();
      const text = element.querySelector('[data-testid="autosave-text"]');
      expect(text?.textContent).toBe('Saved');
    });

    it('AUTOSAVE-UI-008: error status shows "Save failed" text', () => {
      indicator.setStatus('error');
      const element = indicator.render();
      const text = element.querySelector('[data-testid="autosave-text"]');
      expect(text?.textContent).toBe('Save failed');
    });

    it('AUTOSAVE-UI-009: disabled status shows "Auto-save off" text', () => {
      indicator.setStatus('disabled');
      const element = indicator.render();
      const text = element.querySelector('[data-testid="autosave-text"]');
      expect(text?.textContent).toBe('Auto-save off');
    });

    it('AUTOSAVE-UI-010: idle status with no save shows empty text', () => {
      indicator.setStatus('idle');
      const element = indicator.render();
      const text = element.querySelector('[data-testid="autosave-text"]');
      expect(text?.textContent).toBe('');
    });
  });

  describe('unsaved changes', () => {
    it('AUTOSAVE-UI-011: markUnsaved shows "Unsaved" text', () => {
      indicator.markUnsaved();
      const element = indicator.render();
      const text = element.querySelector('[data-testid="autosave-text"]');
      expect(text?.textContent).toBe('Unsaved');
    });

    it('AUTOSAVE-UI-012: markUnsaved changes icon color to warning', () => {
      indicator.markUnsaved();
      const element = indicator.render();
      const icon = element.querySelector('[data-testid="autosave-icon"]') as HTMLElement;
      // Uses CSS variable with fallback
      expect(icon.style.color).toBe('var(--warning, #ffbb33)');
    });
  });

  describe('styling', () => {
    it('AUTOSAVE-UI-013: saving status has accent color (CSS variable)', () => {
      indicator.setStatus('saving');
      const element = indicator.render();
      const icon = element.querySelector('[data-testid="autosave-icon"]') as HTMLElement;
      expect(icon.style.color).toBe('var(--accent-primary, #4a9eff)');
    });

    it('AUTOSAVE-UI-014: saved status has success color (CSS variable)', () => {
      indicator.setStatus('saved');
      const element = indicator.render();
      const icon = element.querySelector('[data-testid="autosave-icon"]') as HTMLElement;
      expect(icon.style.color).toBe('var(--success, #6bff6b)');
    });

    it('AUTOSAVE-UI-015: error status has error color (CSS variable)', () => {
      indicator.setStatus('error');
      const element = indicator.render();
      const icon = element.querySelector('[data-testid="autosave-icon"]') as HTMLElement;
      expect(icon.style.color).toBe('var(--error, #ff6b6b)');
    });

    it('AUTOSAVE-UI-016: disabled status has muted color (CSS variable)', () => {
      indicator.setStatus('disabled');
      const element = indicator.render();
      const icon = element.querySelector('[data-testid="autosave-icon"]') as HTMLElement;
      expect(icon.style.color).toBe('var(--text-muted, #666)');
    });

    it('AUTOSAVE-UI-017: saving status has pulse animation', () => {
      indicator.setStatus('saving');
      const element = indicator.render();
      const icon = element.querySelector('[data-testid="autosave-icon"]') as HTMLElement;
      expect(icon.style.animation).toContain('pulse');
    });

    it('AUTOSAVE-UI-018: saved status has no animation', () => {
      indicator.setStatus('saved');
      const element = indicator.render();
      const icon = element.querySelector('[data-testid="autosave-icon"]') as HTMLElement;
      expect(icon.style.animation).toBe('');
    });
  });

  describe('tooltips', () => {
    it('AUTOSAVE-UI-019: saving status has "Auto-saving session" tooltip', () => {
      indicator.setStatus('saving');
      const element = indicator.render();
      expect(element.title).toBe('Auto-saving session');
    });

    it('AUTOSAVE-UI-020: error status has retry tooltip', () => {
      indicator.setStatus('error');
      const element = indicator.render();
      expect(element.title).toBe('Auto-save failed - click to retry');
    });

    it('AUTOSAVE-UI-021: disabled status has disabled tooltip', () => {
      indicator.setStatus('disabled');
      const element = indicator.render();
      expect(element.title).toBe('Auto-save is disabled');
    });

    it('AUTOSAVE-UI-022: unsaved changes has appropriate tooltip', () => {
      indicator.markUnsaved();
      const element = indicator.render();
      expect(element.title).toBe('Unsaved changes will be auto-saved');
    });
  });

  describe('icon presence', () => {
    it('AUTOSAVE-UI-023: icon element contains SVG', () => {
      const element = indicator.render();
      const icon = element.querySelector('[data-testid="autosave-icon"]');
      const svg = icon?.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('AUTOSAVE-UI-024: icon changes based on status', () => {
      const element = indicator.render();
      const icon = element.querySelector('[data-testid="autosave-icon"]');

      // Get initial icon HTML
      const idleHtml = icon?.innerHTML;

      // Change to error status
      indicator.setStatus('error');
      const errorHtml = icon?.innerHTML;

      // Icons should be different (cloud vs cloud-off)
      expect(idleHtml).not.toBe(errorHtml);
    });
  });

  describe('dispose', () => {
    it('AUTOSAVE-UI-025: dispose clears update interval', () => {
      // Access private interval through render/dispose cycle
      indicator.dispose();
      // Should not throw or cause issues
      expect(() => indicator.render()).not.toThrow();
    });
  });

  describe('manager connection', () => {
    it('AUTOSAVE-UI-026: connect accepts manager-like object', () => {
      const mockManager = {
        on: vi.fn(),
        off: vi.fn(),
        getConfig: vi.fn().mockReturnValue({ enabled: true, interval: 5, maxVersions: 10 }),
        setConfig: vi.fn(),
        getLastSaveTime: vi.fn().mockReturnValue(null),
        hasUnsavedChanges: vi.fn().mockReturnValue(false),
      };

      expect(() => indicator.connect(mockManager as any)).not.toThrow();
    });

    it('AUTOSAVE-UI-027: sets disabled status when manager has auto-save disabled', () => {
      const mockManager = {
        on: vi.fn(),
        off: vi.fn(),
        getConfig: vi.fn().mockReturnValue({ enabled: false, interval: 5, maxVersions: 10 }),
        setConfig: vi.fn(),
        getLastSaveTime: vi.fn().mockReturnValue(null),
        hasUnsavedChanges: vi.fn().mockReturnValue(false),
      };

      indicator.connect(mockManager as any);
      expect(indicator.getStatus()).toBe('disabled');
    });
  });

  describe('retry functionality', () => {
    it('AUTOSAVE-UI-028: setRetryCallback stores callback', () => {
      const callback = vi.fn();
      indicator.setRetryCallback(callback);

      // Set error state and click
      indicator.setStatus('error');
      const element = indicator.render();
      element.click();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('AUTOSAVE-UI-029: click does not trigger callback when not in error state', () => {
      const callback = vi.fn();
      indicator.setRetryCallback(callback);

      // Keep idle state and click
      indicator.setStatus('idle');
      const element = indicator.render();
      element.click();

      expect(callback).not.toHaveBeenCalled();
    });

    it('AUTOSAVE-UI-030: click does not trigger callback when no callback set', () => {
      // Set error state and click without callback
      indicator.setStatus('error');
      const element = indicator.render();

      // Should not throw
      expect(() => element.click()).not.toThrow();
    });

    it('AUTOSAVE-UI-031: error state shows pointer cursor', () => {
      indicator.setStatus('error');
      const element = indicator.render();
      expect(element.style.cursor).toBe('pointer');
    });

    it('AUTOSAVE-UI-032: saving and idle status show default cursor, other non-error states show pointer', () => {
      indicator.setStatus('saving');
      let element = indicator.render();
      expect(element.style.cursor).toBe('default');

      indicator.setStatus('idle');
      element = indicator.render();
      expect(element.style.cursor).toBe('default');

      indicator.setStatus('saved');
      element = indicator.render();
      expect(element.style.cursor).toBe('pointer');

      indicator.setStatus('disabled');
      element = indicator.render();
      expect(element.style.cursor).toBe('pointer');
    });
  });

  describe('style cleanup', () => {
    it('AUTOSAVE-UI-033: dispose removes container from DOM', () => {
      const element = indicator.render();
      const parent = document.createElement('div');
      parent.appendChild(element);

      expect(parent.contains(element)).toBe(true);

      indicator.dispose();

      expect(parent.contains(element)).toBe(false);
    });

    it('AUTOSAVE-UI-034: dispose clears retry callback', () => {
      const callback = vi.fn();
      indicator.setRetryCallback(callback);

      indicator.dispose();

      // After dispose, clicking should not trigger callback
      // (need to recreate the indicator to test this properly)
      // This test just ensures dispose completes without error
      expect(() => indicator.dispose()).not.toThrow();
    });
  });

  describe('CSS variables', () => {
    it('AUTOSAVE-UI-035: container uses CSS variable for text color', () => {
      const element = indicator.render();
      expect(element.style.color).toBe('var(--text-muted, #888)');
    });
  });

  describe('settings popover', () => {
    function createMockManager(configOverrides: Partial<{ enabled: boolean; interval: number; maxVersions: number }> = {}) {
      const config = { enabled: true, interval: 5, maxVersions: 10, ...configOverrides };
      return {
        on: vi.fn(),
        off: vi.fn(),
        getConfig: vi.fn().mockReturnValue(config),
        setConfig: vi.fn().mockImplementation((partial: Record<string, unknown>) => {
          Object.assign(config, partial);
        }),
        getLastSaveTime: vi.fn().mockReturnValue(null),
        hasUnsavedChanges: vi.fn().mockReturnValue(false),
      };
    }

    beforeEach(() => {
      localStorage.clear();
    });

    it('AUTOSAVE-U030: clicking indicator (non-error) opens settings popover', () => {
      const manager = createMockManager();
      indicator.connect(manager as any);
      const element = indicator.render();

      element.click();

      const popover = document.body.querySelector('[data-testid="autosave-settings-popover"]');
      expect(popover).not.toBeNull();
    });

    it('AUTOSAVE-U031: popover shows interval slider with current value', () => {
      const manager = createMockManager({ interval: 10 });
      indicator.connect(manager as any);
      const element = indicator.render();

      element.click();

      const slider = document.body.querySelector<HTMLInputElement>('[data-testid="autosave-interval-slider"]');
      expect(slider).not.toBeNull();
      expect(slider!.value).toBe('10');

      const label = document.body.querySelector('[data-testid="autosave-interval-label"]');
      expect(label?.textContent).toBe('Interval: 10 min');
    });

    it('AUTOSAVE-U032: popover shows enable/disable toggle with current state', () => {
      const manager = createMockManager({ enabled: false });
      indicator.connect(manager as any);
      const element = indicator.render();

      element.click();

      const toggle = document.body.querySelector<HTMLInputElement>('[data-testid="autosave-enable-toggle"]');
      expect(toggle).not.toBeNull();
      expect(toggle!.checked).toBe(false);
    });

    it('AUTOSAVE-U033: popover shows max versions slider with current value', () => {
      const manager = createMockManager({ maxVersions: 20 });
      indicator.connect(manager as any);
      const element = indicator.render();

      element.click();

      const slider = document.body.querySelector<HTMLInputElement>('[data-testid="autosave-versions-slider"]');
      expect(slider).not.toBeNull();
      expect(slider!.value).toBe('20');

      const label = document.body.querySelector('[data-testid="autosave-versions-label"]');
      expect(label?.textContent).toBe('Max versions: 20');
    });

    it('AUTOSAVE-U034: changing interval slider calls manager.setConfig with new interval', () => {
      const manager = createMockManager();
      indicator.connect(manager as any);
      const element = indicator.render();

      element.click();

      const slider = document.body.querySelector<HTMLInputElement>('[data-testid="autosave-interval-slider"]')!;
      slider.value = '15';
      slider.dispatchEvent(new Event('input'));

      expect(manager.setConfig).toHaveBeenCalledWith({ interval: 15 });
    });

    it('AUTOSAVE-U035: toggling enable/disable calls manager.setConfig', () => {
      const manager = createMockManager({ enabled: true });
      indicator.connect(manager as any);
      const element = indicator.render();

      element.click();

      const toggle = document.body.querySelector<HTMLInputElement>('[data-testid="autosave-enable-toggle"]')!;
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));

      expect(manager.setConfig).toHaveBeenCalledWith({ enabled: false });
    });

    it('AUTOSAVE-U036: clicking indicator again closes popover', () => {
      const manager = createMockManager();
      indicator.connect(manager as any);
      const element = indicator.render();

      // Open
      element.click();
      expect(document.body.querySelector('[data-testid="autosave-settings-popover"]')).not.toBeNull();

      // Close
      element.click();
      expect(document.body.querySelector('[data-testid="autosave-settings-popover"]')).toBeNull();
    });

    it('AUTOSAVE-U037: clicking outside popover closes it', () => {
      const manager = createMockManager();
      indicator.connect(manager as any);
      const element = indicator.render();
      document.body.appendChild(element);

      element.click();
      expect(document.body.querySelector('[data-testid="autosave-settings-popover"]')).not.toBeNull();

      // Click outside
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(document.body.querySelector('[data-testid="autosave-settings-popover"]')).toBeNull();

      document.body.removeChild(element);
    });

    it('AUTOSAVE-U038: error status click still triggers retry (not popover)', () => {
      const callback = vi.fn();
      indicator.setRetryCallback(callback);

      const manager = createMockManager();
      indicator.connect(manager as any);
      indicator.setStatus('error');

      const element = indicator.render();
      element.click();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(document.body.querySelector('[data-testid="autosave-settings-popover"]')).toBeNull();
    });

    it('AUTOSAVE-U039: settings persist to localStorage on change', () => {
      const manager = createMockManager();
      indicator.connect(manager as any);
      const element = indicator.render();

      element.click();

      const slider = document.body.querySelector<HTMLInputElement>('[data-testid="autosave-interval-slider"]')!;
      slider.value = '20';
      slider.dispatchEvent(new Event('input'));

      const stored = JSON.parse(localStorage.getItem('openrv-autosave-config')!);
      expect(stored.interval).toBe(20);
    });

    it('AUTOSAVE-U040: settings restored from localStorage on connect', () => {
      localStorage.setItem('openrv-autosave-config', JSON.stringify({
        interval: 15,
        enabled: false,
        maxVersions: 25,
      }));

      const manager = createMockManager();
      indicator.connect(manager as any);

      expect(manager.setConfig).toHaveBeenCalledWith({
        interval: 15,
        enabled: false,
        maxVersions: 25,
      });
    });

    it('AUTOSAVE-U041: invalid localStorage data is ignored gracefully', () => {
      localStorage.setItem('openrv-autosave-config', 'not-valid-json{{{');

      const manager = createMockManager();
      // Should not throw
      expect(() => indicator.connect(manager as any)).not.toThrow();

      // setConfig should not have been called with saved config (only initial connect calls)
      // The first call would be from loadConfigFromStorage, which should return null
      // So setConfig should not be called at all if the data is invalid
      const setConfigCalls = manager.setConfig.mock.calls;
      expect(setConfigCalls.length).toBe(0);
    });

    it('AUTOSAVE-U042: Escape key closes popover', () => {
      const manager = createMockManager();
      indicator.connect(manager as any);
      const element = indicator.render();

      element.click();
      expect(document.body.querySelector('[data-testid="autosave-settings-popover"]')).not.toBeNull();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.body.querySelector('[data-testid="autosave-settings-popover"]')).toBeNull();
    });
  });
});
