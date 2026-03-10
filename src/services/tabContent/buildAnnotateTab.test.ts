import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from '../../utils/EventEmitter';
import { buildAnnotateTab } from './buildAnnotateTab';
import type { BuildAnnotateTabDeps } from './buildAnnotateTab';

// Mock ContextToolbar to avoid DOM dependencies
vi.mock('../../ui/components/layout/ContextToolbar', () => ({
  ContextToolbar: {
    createButton: (_text: string, _cb: () => void, _opts?: object) => {
      const btn = document.createElement('button');
      btn.dataset.testid = 'mock-button';
      return btn;
    },
    createDivider: () => document.createElement('div'),
  },
}));

// Mock setButtonActive
vi.mock('../../ui/components/shared/Button', () => ({
  setButtonActive: vi.fn(),
}));

function createMockDeps() {
  const historyPanel = Object.assign(new EventEmitter(), {
    toggle: vi.fn(),
  });
  const markerListPanel = Object.assign(new EventEmitter(), {
    toggle: vi.fn(),
  });

  const badgeElement = document.createElement('span');
  badgeElement.dataset.testid = 'note-count-badge';
  badgeElement.style.display = 'none';

  const notePanel = Object.assign(new EventEmitter(), {
    toggle: vi.fn(),
    createBadge: vi.fn(() => badgeElement),
  });

  const registry = {
    paintToolbar: { render: vi.fn(() => document.createElement('div')) },
    textFormattingToolbar: { render: vi.fn(() => document.createElement('div')) },
    historyPanel,
    markerListPanel,
    notePanel,
  };

  const unsubscribers: (() => void)[] = [];
  const addUnsubscriber = (unsub: () => void) => unsubscribers.push(unsub);

  const deps = {
    registry,
    addUnsubscriber,
  } as unknown as BuildAnnotateTabDeps;

  return { deps, registry, notePanel, badgeElement };
}

describe('buildAnnotateTab note badge', () => {
  let deps: BuildAnnotateTabDeps;
  let notePanel: ReturnType<typeof createMockDeps>['notePanel'];
  let badgeElement: HTMLElement;

  beforeEach(() => {
    const mock = createMockDeps();
    deps = mock.deps;
    notePanel = mock.notePanel;
    badgeElement = mock.badgeElement;
  });

  it('calls notePanel.createBadge() during build', () => {
    buildAnnotateTab(deps);
    expect(notePanel.createBadge).toHaveBeenCalledOnce();
  });

  it('attaches the badge element to the notes toggle button', () => {
    const content = buildAnnotateTab(deps);
    const notesButton = content.querySelector('[data-testid="notes-toggle-button"]');
    expect(notesButton).not.toBeNull();
    const badge = notesButton!.querySelector('[data-testid="note-count-badge"]');
    expect(badge).not.toBeNull();
    expect(badge).toBe(badgeElement);
  });

  it('badge is a child of the button, not a sibling', () => {
    const content = buildAnnotateTab(deps);
    const notesButton = content.querySelector('[data-testid="notes-toggle-button"]');
    expect(badgeElement.parentElement).toBe(notesButton);
  });
});
