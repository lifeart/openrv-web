import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from '../../utils/EventEmitter';
import { createPanel } from '../../ui/components/shared/Panel';
import { buildPanelToggles } from './buildPanelToggles';

function createTestDeps() {
  const conformPanelElement = createPanel();

  const registry = {
    infoPanel: Object.assign(new EventEmitter(), {
      toggle: vi.fn(),
      isEnabled: vi.fn(() => false),
    }),
    snapshotPanel: Object.assign(new EventEmitter(), {
      toggle: vi.fn(),
      isOpen: vi.fn(() => false),
    }),
    playlistPanel: Object.assign(new EventEmitter(), {
      toggle: vi.fn(),
      isOpen: vi.fn(() => false),
    }),
    conformPanel: {
      render: vi.fn(),
    },
    shotGridPanel: Object.assign(new EventEmitter(), {
      toggle: vi.fn(),
      isOpen: vi.fn(() => false),
    }),
  } as any;

  const sessionBridge = {
    updateInfoPanel: vi.fn(),
  } as any;

  const unsubscribers: Array<() => void> = [];
  const addUnsubscriber = (unsub: () => void) => {
    unsubscribers.push(unsub);
  };

  return { registry, sessionBridge, conformPanelElement, addUnsubscriber, unsubscribers };
}

describe('buildPanelToggles', () => {
  describe('Conform button active state sync', () => {
    it('button becomes active when panel is shown via toggle', () => {
      const deps = createTestDeps();
      const { element: el } = buildPanelToggles(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="conform-panel-toggle"]')!;

      button.click();
      expect(button.classList.contains('active')).toBe(true);
    });

    it('button becomes inactive when panel is closed via toggle', () => {
      const deps = createTestDeps();
      const { element: el } = buildPanelToggles(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="conform-panel-toggle"]')!;

      button.click(); // open
      button.click(); // close
      expect(button.classList.contains('active')).toBe(false);
    });

    it('button becomes inactive when panel is closed via Escape', () => {
      const deps = createTestDeps();
      const { element: el } = buildPanelToggles(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="conform-panel-toggle"]')!;

      button.click(); // open
      expect(button.classList.contains('active')).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(button.classList.contains('active')).toBe(false);
    });

    it('button becomes inactive when panel is closed via outside click', () => {
      const deps = createTestDeps();
      const { element: el } = buildPanelToggles(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="conform-panel-toggle"]')!;

      button.click(); // open
      expect(button.classList.contains('active')).toBe(true);

      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(button.classList.contains('active')).toBe(false);
    });
  });

  describe('Plugin panel helpers', () => {
    it('addPluginPanel creates a toggle button and container', () => {
      const deps = createTestDeps();
      const result = buildPanelToggles(deps);

      const { button, container } = result.addPluginPanel('my-plugin-panel', 'My Panel');
      expect(button).toBeInstanceOf(HTMLButtonElement);
      expect(button.dataset.testid).toBe('plugin-panel-toggle-my-plugin-panel');
      expect(container).toBeInstanceOf(HTMLElement);
      expect(container.dataset.pluginPanelId).toBe('my-plugin-panel');
    });

    it('addPluginPanel appends toggle button to element', () => {
      const deps = createTestDeps();
      const result = buildPanelToggles(deps);

      result.addPluginPanel('test-panel', 'Test');
      const btn = result.element.querySelector('[data-testid="plugin-panel-toggle-test-panel"]');
      expect(btn).not.toBeNull();
    });

    it('addPluginPanel container starts hidden', () => {
      const deps = createTestDeps();
      const result = buildPanelToggles(deps);

      const { container } = result.addPluginPanel('hidden-panel', 'Hidden');
      expect(container.style.display).toBe('none');
    });

    it('clicking plugin toggle shows/hides container', () => {
      const deps = createTestDeps();
      const result = buildPanelToggles(deps);

      const { button, container } = result.addPluginPanel('toggle-panel', 'Toggle');
      button.click();
      expect(container.style.display).toBe('block');
      button.click();
      expect(container.style.display).toBe('none');
    });

    it('removePluginPanel removes button and container from DOM', () => {
      const deps = createTestDeps();
      const result = buildPanelToggles(deps);

      const { button, container } = result.addPluginPanel('remove-panel', 'Remove');
      // Simulate being in DOM
      document.body.appendChild(result.element);
      document.body.appendChild(container);

      expect(result.element.contains(button)).toBe(true);
      expect(document.body.contains(container)).toBe(true);

      result.removePluginPanel('remove-panel');
      expect(result.element.contains(button)).toBe(false);
      expect(document.body.contains(container)).toBe(false);

      // Cleanup
      result.element.remove();
    });

    it('removePluginPanel is a no-op for unknown panel id', () => {
      const deps = createTestDeps();
      const result = buildPanelToggles(deps);

      // Should not throw
      expect(() => result.removePluginPanel('nonexistent')).not.toThrow();
    });
  });
});
