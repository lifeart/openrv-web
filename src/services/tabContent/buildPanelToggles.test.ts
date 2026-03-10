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
      const el = buildPanelToggles(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="conform-panel-toggle"]')!;

      button.click();
      expect(button.classList.contains('active')).toBe(true);
    });

    it('button becomes inactive when panel is closed via toggle', () => {
      const deps = createTestDeps();
      const el = buildPanelToggles(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="conform-panel-toggle"]')!;

      button.click(); // open
      button.click(); // close
      expect(button.classList.contains('active')).toBe(false);
    });

    it('button becomes inactive when panel is closed via Escape', () => {
      const deps = createTestDeps();
      const el = buildPanelToggles(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="conform-panel-toggle"]')!;

      button.click(); // open
      expect(button.classList.contains('active')).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(button.classList.contains('active')).toBe(false);
    });

    it('button becomes inactive when panel is closed via outside click', () => {
      const deps = createTestDeps();
      const el = buildPanelToggles(deps);
      const button = el.querySelector<HTMLButtonElement>('[data-testid="conform-panel-toggle"]')!;

      button.click(); // open
      expect(button.classList.contains('active')).toBe(true);

      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(button.classList.contains('active')).toBe(false);
    });
  });
});
