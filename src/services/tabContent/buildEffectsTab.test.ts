import { describe, expect, it, vi } from 'vitest';
import { createPanel } from '../../ui/components/shared/Panel';
import { buildEffectsTab } from './buildEffectsTab';

function createRenderable() {
  return {
    render: vi.fn(() => document.createElement('div')),
  };
}

function createTestDeps() {
  const noiseReductionPanel = createPanel();
  const watermarkPanel = createPanel();
  const slateEditorPanel = createPanel();

  const registry = {
    filterControl: createRenderable(),
    lensControl: createRenderable(),
    deinterlaceControl: createRenderable(),
    filmEmulationControl: createRenderable(),
    perspectiveCorrectionControl: createRenderable(),
    stabilizationControl: createRenderable(),
  } as any;

  const unsubscribers: Array<() => void> = [];
  const addUnsubscriber = (unsub: () => void) => {
    unsubscribers.push(unsub);
  };

  return { registry, noiseReductionPanel, watermarkPanel, slateEditorPanel, addUnsubscriber, unsubscribers };
}

describe('buildEffectsTab', () => {
  describe('Denoise button active state sync', () => {
    it('button becomes active when panel is shown via toggle', () => {
      const deps = createTestDeps();
      const el = buildEffectsTab(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="noise-reduction-toggle-button"]')!;

      button.click();
      expect(button.classList.contains('active')).toBe(true);
    });

    it('button becomes inactive when panel is closed via toggle', () => {
      const deps = createTestDeps();
      const el = buildEffectsTab(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="noise-reduction-toggle-button"]')!;

      button.click(); // open
      button.click(); // close
      expect(button.classList.contains('active')).toBe(false);
    });

    it('button becomes inactive when panel is closed via Escape', () => {
      const deps = createTestDeps();
      const el = buildEffectsTab(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="noise-reduction-toggle-button"]')!;

      button.click(); // open
      expect(button.classList.contains('active')).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(button.classList.contains('active')).toBe(false);
    });

    it('button becomes inactive when panel is closed via outside click', () => {
      const deps = createTestDeps();
      const el = buildEffectsTab(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="noise-reduction-toggle-button"]')!;

      button.click(); // open
      expect(button.classList.contains('active')).toBe(true);

      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(button.classList.contains('active')).toBe(false);
    });
  });

  describe('Watermark button active state sync', () => {
    it('button becomes inactive when panel is closed via toggle', () => {
      const deps = createTestDeps();
      const el = buildEffectsTab(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="watermark-toggle-button"]')!;

      button.click(); // open
      button.click(); // close
      expect(button.classList.contains('active')).toBe(false);
    });

    it('button becomes active when panel is shown via toggle', () => {
      const deps = createTestDeps();
      const el = buildEffectsTab(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="watermark-toggle-button"]')!;

      button.click();
      expect(button.classList.contains('active')).toBe(true);
    });

    it('button becomes inactive when panel is closed via Escape', () => {
      const deps = createTestDeps();
      const el = buildEffectsTab(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="watermark-toggle-button"]')!;

      button.click();
      expect(button.classList.contains('active')).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(button.classList.contains('active')).toBe(false);
    });

    it('button becomes inactive when panel is closed via outside click', () => {
      const deps = createTestDeps();
      const el = buildEffectsTab(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="watermark-toggle-button"]')!;

      button.click();
      expect(button.classList.contains('active')).toBe(true);

      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(button.classList.contains('active')).toBe(false);
    });
  });

  describe('Slate button active state sync', () => {
    it('button becomes inactive when panel is closed via toggle', () => {
      const deps = createTestDeps();
      const el = buildEffectsTab(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="slate-editor-toggle-button"]')!;

      button.click(); // open
      button.click(); // close
      expect(button.classList.contains('active')).toBe(false);
    });

    it('button becomes active when panel is shown via toggle', () => {
      const deps = createTestDeps();
      const el = buildEffectsTab(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="slate-editor-toggle-button"]')!;

      button.click();
      expect(button.classList.contains('active')).toBe(true);
    });

    it('button becomes inactive when panel is closed via Escape', () => {
      const deps = createTestDeps();
      const el = buildEffectsTab(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="slate-editor-toggle-button"]')!;

      button.click();
      expect(button.classList.contains('active')).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(button.classList.contains('active')).toBe(false);
    });

    it('button becomes inactive when panel is closed via outside click', () => {
      const deps = createTestDeps();
      const el = buildEffectsTab(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="slate-editor-toggle-button"]')!;

      button.click();
      expect(button.classList.contains('active')).toBe(true);

      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(button.classList.contains('active')).toBe(false);
    });
  });

  describe('subscription cleanup', () => {
    it('registers unsubscribers for all three panel buttons', () => {
      const deps = createTestDeps();
      buildEffectsTab(deps);
      expect(deps.unsubscribers).toHaveLength(3);
    });

    it('unsubscribing stops button state updates', () => {
      const deps = createTestDeps();
      const el = buildEffectsTab(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="noise-reduction-toggle-button"]')!;

      // Unsubscribe all listeners
      for (const unsub of deps.unsubscribers) {
        unsub();
      }

      // Toggle opens the panel, but listener was removed so button should NOT become active
      button.click();
      expect(deps.noiseReductionPanel.isVisible()).toBe(true);
      expect(button.classList.contains('active')).toBe(false);
    });
  });
});
