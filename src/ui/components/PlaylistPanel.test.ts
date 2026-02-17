/**
 * PlaylistPanel Unit Tests
 *
 * Tests for the playlist management panel.
 * Uses a mocked PlaylistManager since the real one is complex.
 * Based on test ID naming convention: PL-NNN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaylistPanel } from './PlaylistPanel';
import type { ExclusivePanel } from './PlaylistPanel';
import type { PlaylistManager } from '../../core/session/PlaylistManager';

function createMockPlaylistManager(): PlaylistManager {
  const listeners: Record<string, Array<(data: unknown) => void>> = {};
  return {
    on: vi.fn((event: string, callback: (data: unknown) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
      return () => {
        const idx = listeners[event]?.indexOf(callback) ?? -1;
        if (idx >= 0) listeners[event]!.splice(idx, 1);
      };
    }),
    off: vi.fn(),
    emit: vi.fn((event: string, data: unknown) => {
      listeners[event]?.forEach((cb) => cb(data));
    }),
    isEnabled: vi.fn().mockReturnValue(false),
    getClips: vi.fn().mockReturnValue([]),
    getTotalDuration: vi.fn().mockReturnValue(0),
    getLoopMode: vi.fn().mockReturnValue('none'),
    setLoopMode: vi.fn(),
    setEnabled: vi.fn(),
    moveClip: vi.fn(),
    removeClip: vi.fn(),
    addClip: vi.fn(),
    toEDL: vi.fn().mockReturnValue(''),
    _listeners: listeners,
  } as unknown as PlaylistManager;
}

describe('PlaylistPanel', () => {
  let panel: PlaylistPanel;
  let manager: PlaylistManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createMockPlaylistManager();
    panel = new PlaylistPanel(manager);
  });

  afterEach(() => {
    panel.dispose();
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('PL-001: creates container element with data-testid "playlist-panel"', () => {
      const el = panel.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.dataset.testid).toBe('playlist-panel');
    });

    it('PL-002: container has playlist-panel class', () => {
      const el = panel.render();
      expect(el.className).toBe('playlist-panel');
    });

    it('PL-003: starts hidden', () => {
      expect(panel.isOpen()).toBe(false);
    });

    it('PL-004: container display is none initially', () => {
      const el = panel.render();
      expect(el.style.display).toBe('none');
    });
  });

  // ---------------------------------------------------------------------------
  // show / hide / toggle / isOpen
  // ---------------------------------------------------------------------------
  describe('show / hide / toggle', () => {
    it('PL-010: show() sets container display to flex', () => {
      document.body.appendChild(panel.render());
      panel.show();

      expect(panel.render().style.display).toBe('flex');
      expect(panel.isOpen()).toBe(true);

      document.body.removeChild(panel.render());
    });

    it('PL-011: hide() sets container display to none', () => {
      document.body.appendChild(panel.render());
      panel.show();
      panel.hide();

      expect(panel.render().style.display).toBe('none');
      expect(panel.isOpen()).toBe(false);

      document.body.removeChild(panel.render());
    });

    it('PL-012: hide() emits closed event', () => {
      const handler = vi.fn();
      panel.on('closed', handler);
      document.body.appendChild(panel.render());
      panel.show();

      panel.hide();

      expect(handler).toHaveBeenCalledTimes(1);

      document.body.removeChild(panel.render());
    });

    it('PL-013: toggle() shows hidden panel', () => {
      document.body.appendChild(panel.render());
      expect(panel.isOpen()).toBe(false);

      panel.toggle();

      expect(panel.isOpen()).toBe(true);

      document.body.removeChild(panel.render());
    });

    it('PL-014: toggle() hides visible panel', () => {
      document.body.appendChild(panel.render());
      panel.show();

      panel.toggle();

      expect(panel.isOpen()).toBe(false);

      document.body.removeChild(panel.render());
    });

    it('PL-015: isOpen() returns correct state', () => {
      document.body.appendChild(panel.render());

      expect(panel.isOpen()).toBe(false);
      panel.show();
      expect(panel.isOpen()).toBe(true);
      panel.hide();
      expect(panel.isOpen()).toBe(false);

      document.body.removeChild(panel.render());
    });

    it('PL-016: show() appends container to body if not already', () => {
      expect(document.body.contains(panel.render())).toBe(false);

      panel.show();

      expect(document.body.contains(panel.render())).toBe(true);

      document.body.removeChild(panel.render());
    });
  });

  // ---------------------------------------------------------------------------
  // render
  // ---------------------------------------------------------------------------
  describe('render', () => {
    it('PL-020: render returns container element', () => {
      const el = panel.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('PL-021: render returns same element on subsequent calls', () => {
      const el1 = panel.render();
      const el2 = panel.render();
      expect(el1).toBe(el2);
    });
  });

  // ---------------------------------------------------------------------------
  // dispose
  // ---------------------------------------------------------------------------
  describe('dispose', () => {
    it('PL-030: dispose hides the panel', () => {
      document.body.appendChild(panel.render());
      panel.show();

      panel.dispose();

      expect(panel.isOpen()).toBe(false);
    });

    it('PL-031: dispose removes container from DOM', () => {
      document.body.appendChild(panel.render());
      const el = panel.render();
      expect(document.body.contains(el)).toBe(true);

      panel.dispose();

      expect(document.body.contains(el)).toBe(false);
    });

    it('PL-032: dispose is idempotent', () => {
      document.body.appendChild(panel.render());
      panel.dispose();
      expect(() => panel.dispose()).not.toThrow();
    });

    it('PL-033: dispose emits closed event', () => {
      const handler = vi.fn();
      panel.on('closed', handler);
      document.body.appendChild(panel.render());
      panel.show();

      panel.dispose();

      expect(handler).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Mutual exclusion (L-48)
  // ---------------------------------------------------------------------------
  describe('mutual exclusion', () => {
    it('PL-L48a: opening the playlist panel should close the snapshot panel if open', () => {
      const mockSnapshotPanel: ExclusivePanel = {
        isOpen: vi.fn().mockReturnValue(true),
        hide: vi.fn(),
      };

      panel.setExclusiveWith(mockSnapshotPanel);

      panel.show();

      expect(mockSnapshotPanel.hide).toHaveBeenCalledTimes(1);

      // Clean up
      if (document.body.contains(panel.render())) {
        document.body.removeChild(panel.render());
      }
    });

    it('PL-L48a-2: opening the playlist panel does not close snapshot panel if it is already closed', () => {
      const mockSnapshotPanel: ExclusivePanel = {
        isOpen: vi.fn().mockReturnValue(false),
        hide: vi.fn(),
      };

      panel.setExclusiveWith(mockSnapshotPanel);

      panel.show();

      expect(mockSnapshotPanel.hide).not.toHaveBeenCalled();

      // Clean up
      if (document.body.contains(panel.render())) {
        document.body.removeChild(panel.render());
      }
    });
  });
});
