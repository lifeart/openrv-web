/**
 * SnapshotPanel Unit Tests
 *
 * Tests for the session snapshot management panel.
 * Uses a mocked SnapshotManager since the real one requires IndexedDB.
 * Based on test ID naming convention: SNAP-NNN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SnapshotPanel } from './SnapshotPanel';
import type { ExclusivePanel } from './SnapshotPanel';
import type { Snapshot, SnapshotManager } from '../../core/session/SnapshotManager';

vi.mock('./shared/Modal', () => ({
  showPrompt: vi.fn(),
  showConfirm: vi.fn(),
  showAlert: vi.fn(),
}));

import { showPrompt, showConfirm } from './shared/Modal';

function createMockSnapshotManager(): SnapshotManager {
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
    listSnapshots: vi.fn().mockResolvedValue([]),
    deleteSnapshot: vi.fn().mockResolvedValue(undefined),
    renameSnapshot: vi.fn().mockResolvedValue(undefined),
    exportSnapshot: vi.fn().mockResolvedValue('{"metadata":{},"state":{}}'),
    clearAll: vi.fn().mockResolvedValue(undefined),
    // Expose listeners for test assertions
    _listeners: listeners,
  } as unknown as SnapshotManager;
}

function createMockSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    id: 'snap-1',
    name: 'Test Snapshot',
    createdAt: new Date().toISOString(),
    isAutoCheckpoint: false,
    version: 1,
    size: 1024,
    ...overrides,
  };
}

describe('SnapshotPanel', () => {
  let panel: SnapshotPanel;
  let manager: SnapshotManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = createMockSnapshotManager();
    panel = new SnapshotPanel(manager);
  });

  afterEach(() => {
    panel.dispose();
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('SNAP-001: creates container element with data-testid "snapshot-panel"', () => {
      const el = panel.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.dataset.testid).toBe('snapshot-panel');
    });

    it('SNAP-002: container has snapshot-panel class', () => {
      const el = panel.render();
      expect(el.className).toBe('snapshot-panel');
    });

    it('SNAP-003: starts hidden', () => {
      expect(panel.isOpen()).toBe(false);
    });

    it('SNAP-004: container display is none initially', () => {
      const el = panel.render();
      expect(el.style.display).toBe('none');
    });

    it('SNAP-005: subscribes to snapshotManager snapshotsChanged event', () => {
      expect(manager.on).toHaveBeenCalledWith(
        'snapshotsChanged',
        expect.any(Function)
      );
    });
  });

  // ---------------------------------------------------------------------------
  // show / hide / toggle / isOpen
  // ---------------------------------------------------------------------------
  describe('show / hide / toggle', () => {
    it('SNAP-010: show() sets container display to flex', () => {
      document.body.appendChild(panel.render());
      panel.show();

      expect(panel.render().style.display).toBe('flex');
      expect(panel.isOpen()).toBe(true);

      document.body.removeChild(panel.render());
    });

    it('SNAP-011: show() loads snapshots from manager', () => {
      document.body.appendChild(panel.render());
      panel.show();

      expect(manager.listSnapshots).toHaveBeenCalled();

      document.body.removeChild(panel.render());
    });

    it('SNAP-012: hide() sets container display to none', () => {
      document.body.appendChild(panel.render());
      panel.show();
      panel.hide();

      expect(panel.render().style.display).toBe('none');
      expect(panel.isOpen()).toBe(false);

      document.body.removeChild(panel.render());
    });

    it('SNAP-013: hide() emits closed event', () => {
      const handler = vi.fn();
      panel.on('closed', handler);
      document.body.appendChild(panel.render());
      panel.show();

      panel.hide();

      expect(handler).toHaveBeenCalledTimes(1);

      document.body.removeChild(panel.render());
    });

    it('SNAP-014: toggle() shows hidden panel', () => {
      document.body.appendChild(panel.render());
      expect(panel.isOpen()).toBe(false);

      panel.toggle();

      expect(panel.isOpen()).toBe(true);

      document.body.removeChild(panel.render());
    });

    it('SNAP-015: toggle() hides visible panel', () => {
      document.body.appendChild(panel.render());
      panel.show();

      panel.toggle();

      expect(panel.isOpen()).toBe(false);

      document.body.removeChild(panel.render());
    });

    it('SNAP-016: isOpen() returns correct state', () => {
      document.body.appendChild(panel.render());

      expect(panel.isOpen()).toBe(false);
      panel.show();
      expect(panel.isOpen()).toBe(true);
      panel.hide();
      expect(panel.isOpen()).toBe(false);

      document.body.removeChild(panel.render());
    });

    it('SNAP-017: show() appends container to body if not already', () => {
      // Container is not in DOM initially
      expect(document.body.contains(panel.render())).toBe(false);

      panel.show();

      expect(document.body.contains(panel.render())).toBe(true);

      // Clean up
      document.body.removeChild(panel.render());
    });

    it('SNAP-018: show()/hide() emit visibilityChanged events', () => {
      const handler = vi.fn();
      panel.on('visibilityChanged', handler);

      document.body.appendChild(panel.render());
      panel.show();
      panel.hide();

      expect(handler).toHaveBeenCalledWith({ open: true });
      expect(handler).toHaveBeenCalledWith({ open: false });

      document.body.removeChild(panel.render());
    });
  });

  // ---------------------------------------------------------------------------
  // render
  // ---------------------------------------------------------------------------
  describe('render', () => {
    it('SNAP-020: render returns container element', () => {
      const el = panel.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('SNAP-021: render returns same element on subsequent calls', () => {
      const el1 = panel.render();
      const el2 = panel.render();
      expect(el1).toBe(el2);
    });
  });

  // ---------------------------------------------------------------------------
  // Snapshot list rendering
  // ---------------------------------------------------------------------------
  describe('snapshot list', () => {
    it('SNAP-030: shows empty state when no snapshots', async () => {
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      document.body.appendChild(panel.render());
      panel.show();

      // Wait for async loadSnapshots
      await vi.waitFor(() => {
        expect(panel.render().textContent).toContain('No snapshots found');
      });

      document.body.removeChild(panel.render());
    });

    it('SNAP-031: renders snapshot items when snapshots exist', async () => {
      const snapshots = [
        createMockSnapshot({ id: 'snap-1', name: 'Snapshot A' }),
        createMockSnapshot({ id: 'snap-2', name: 'Snapshot B' }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      document.body.appendChild(panel.render());
      panel.show();

      await vi.waitFor(() => {
        expect(panel.render().textContent).toContain('Snapshot A');
        expect(panel.render().textContent).toContain('Snapshot B');
      });

      document.body.removeChild(panel.render());
    });

    it('SNAP-032: shows MANUAL badge for manual snapshots', async () => {
      const snapshots = [
        createMockSnapshot({ isAutoCheckpoint: false }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      document.body.appendChild(panel.render());
      panel.show();

      await vi.waitFor(() => {
        expect(panel.render().textContent).toContain('MANUAL');
      });

      document.body.removeChild(panel.render());
    });

    it('SNAP-033: shows AUTO badge for auto-checkpoints', async () => {
      const snapshots = [
        createMockSnapshot({ isAutoCheckpoint: true, name: 'Auto: source loaded' }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      document.body.appendChild(panel.render());
      panel.show();

      await vi.waitFor(() => {
        expect(panel.render().textContent).toContain('AUTO');
      });

      document.body.removeChild(panel.render());
    });

    it('SNAP-034: updates list when snapshotsChanged event fires', () => {
      document.body.appendChild(panel.render());
      panel.show();

      const newSnapshots = [
        createMockSnapshot({ id: 'snap-new', name: 'New Snapshot' }),
      ];

      // Simulate snapshotsChanged event from manager
      (manager as unknown as { _listeners: Record<string, Array<(data: unknown) => void>> })
        ._listeners['snapshotsChanged']
        ?.forEach((cb) => cb({ snapshots: newSnapshots }));

      expect(panel.render().textContent).toContain('New Snapshot');

      document.body.removeChild(panel.render());
    });
  });

  // ---------------------------------------------------------------------------
  // Snapshot item actions
  // ---------------------------------------------------------------------------
  describe('snapshot actions', () => {
    it('SNAP-040: restore button emits restoreRequested event', async () => {
      const snapshots = [
        createMockSnapshot({ id: 'snap-restore', name: 'Restore Me' }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      document.body.appendChild(panel.render());
      panel.show();

      const handler = vi.fn();
      panel.on('restoreRequested', handler);

      await vi.waitFor(() => {
        const restoreBtn = panel.render().querySelector('button[title="Restore"]');
        expect(restoreBtn).not.toBeNull();
        (restoreBtn as HTMLButtonElement).click();
      });

      expect(handler).toHaveBeenCalledWith({ id: 'snap-restore' });

      document.body.removeChild(panel.render());
    });

    it('SNAP-041: rename button calls showPrompt and manager.renameSnapshot', async () => {
      const snapshots = [
        createMockSnapshot({ id: 'snap-rename', name: 'Old Name' }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      (showPrompt as ReturnType<typeof vi.fn>).mockResolvedValue('New Name');

      document.body.appendChild(panel.render());
      panel.show();

      await vi.waitFor(() => {
        const renameBtn = panel.render().querySelector('button[title="Rename"]');
        expect(renameBtn).not.toBeNull();
        (renameBtn as HTMLButtonElement).click();
      });

      await vi.waitFor(() => {
        expect(showPrompt).toHaveBeenCalled();
        expect(manager.renameSnapshot).toHaveBeenCalledWith(
          'snap-rename',
          'New Name'
        );
      });

      document.body.removeChild(panel.render());
    });

    it('SNAP-042: delete button calls showConfirm and manager.deleteSnapshot', async () => {
      const snapshots = [
        createMockSnapshot({ id: 'snap-delete', name: 'Delete Me' }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      (showConfirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      document.body.appendChild(panel.render());
      panel.show();

      await vi.waitFor(() => {
        const deleteBtn = panel.render().querySelector('button[title="Delete"]');
        expect(deleteBtn).not.toBeNull();
        (deleteBtn as HTMLButtonElement).click();
      });

      await vi.waitFor(() => {
        expect(showConfirm).toHaveBeenCalled();
        expect(manager.deleteSnapshot).toHaveBeenCalledWith('snap-delete');
      });

      document.body.removeChild(panel.render());
    });

    it('SNAP-043: delete does not proceed when user cancels confirmation', async () => {
      const snapshots = [
        createMockSnapshot({ id: 'snap-cancel', name: 'Keep Me' }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      (showConfirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      document.body.appendChild(panel.render());
      panel.show();

      await vi.waitFor(() => {
        const deleteBtn = panel.render().querySelector('button[title="Delete"]');
        expect(deleteBtn).not.toBeNull();
        (deleteBtn as HTMLButtonElement).click();
      });

      // Give async operation time to resolve
      await new Promise((r) => setTimeout(r, 10));

      expect(manager.deleteSnapshot).not.toHaveBeenCalled();

      document.body.removeChild(panel.render());
    });
  });

  // ---------------------------------------------------------------------------
  // Preview info
  // ---------------------------------------------------------------------------
  describe('preview info', () => {
    it('SNAP-050: renders preview info when snapshot has preview', async () => {
      const snapshots = [
        createMockSnapshot({
          id: 'snap-preview',
          name: 'With Preview',
          preview: {
            frameCount: 100,
            currentFrame: 42,
            annotationCount: 5,
            hasColorGrade: true,
            sourceName: 'my-clip.exr',
          },
        }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      document.body.appendChild(panel.render());
      panel.show();

      await vi.waitFor(() => {
        const text = panel.render().textContent || '';
        expect(text).toContain('Source');
        expect(text).toContain('my-clip.exr');
        expect(text).toContain('Frame');
        expect(text).toContain('42/100');
        expect(text).toContain('Annotations');
        expect(text).toContain('5');
        expect(text).toContain('Color');
      });

      document.body.removeChild(panel.render());
    });

    it('SP-L49a: Snapshot preview info should use textContent (not innerHTML) for user-derived values', async () => {
      const snapshots = [
        createMockSnapshot({
          id: 'snap-safe',
          name: 'Safe Snapshot',
          preview: {
            frameCount: 100,
            currentFrame: 1,
            annotationCount: 0,
            hasColorGrade: false,
            sourceName: 'test-file.exr',
          },
        }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      document.body.appendChild(panel.render());
      panel.show();

      await vi.waitFor(() => {
        const text = panel.render().textContent || '';
        expect(text).toContain('test-file.exr');
      });

      // Find the span containing the source name value and verify it was set
      // via textContent (DOM construction), not innerHTML
      const allSpans = panel.render().querySelectorAll('span');
      let sourceValueSpan: HTMLSpanElement | null = null;
      for (const s of allSpans) {
        // The outer span that contains both the label child span and the value text node
        if (s.textContent?.includes('Source:') && s.textContent?.includes('test-file.exr')) {
          sourceValueSpan = s as HTMLSpanElement;
          break;
        }
      }
      expect(sourceValueSpan).not.toBeNull();
      // The value should be a text node, not part of innerHTML markup.
      // The outer span should have child nodes: a <span> for label + a text node for value
      const childNodes = Array.from(sourceValueSpan!.childNodes);
      const textNodes = childNodes.filter((n) => n.nodeType === Node.TEXT_NODE);
      expect(textNodes.length).toBeGreaterThanOrEqual(1);
      expect(textNodes.some((n) => n.textContent?.includes('test-file.exr'))).toBe(true);

      document.body.removeChild(panel.render());
    });

    it('SP-L49b: Filenames containing HTML tags should be displayed as plain text, not rendered', async () => {
      const maliciousName = '<img src=x onerror=alert(1)>';
      const snapshots = [
        createMockSnapshot({
          id: 'snap-xss',
          name: 'XSS Snapshot',
          preview: {
            frameCount: 50,
            currentFrame: 1,
            annotationCount: 0,
            hasColorGrade: false,
            sourceName: maliciousName,
          },
        }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      document.body.appendChild(panel.render());
      panel.show();

      await vi.waitFor(() => {
        const text = panel.render().textContent || '';
        // The raw HTML tag text should appear as literal text content
        expect(text).toContain(maliciousName);
      });

      // Ensure no <img> element was created in the DOM (would happen with innerHTML XSS)
      const imgs = panel.render().querySelectorAll('img');
      expect(imgs.length).toBe(0);

      document.body.removeChild(panel.render());
    });

    it('SNAP-051: does not render annotation count when zero', async () => {
      const snapshots = [
        createMockSnapshot({
          id: 'snap-no-annot',
          name: 'Clean Snapshot',
          preview: {
            frameCount: 50,
            currentFrame: 1,
            annotationCount: 0,
            hasColorGrade: false,
          },
        }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      document.body.appendChild(panel.render());
      panel.show();

      await vi.waitFor(() => {
        const text = panel.render().textContent || '';
        expect(text).toContain('Frame');
        // "Annotations:" label should not appear when count is 0
        expect(text).not.toContain('Annotations:');
      });

      document.body.removeChild(panel.render());
    });
  });

  // ---------------------------------------------------------------------------
  // Size formatting
  // ---------------------------------------------------------------------------
  describe('size formatting', () => {
    it('SNAP-060: formats bytes correctly', async () => {
      const snapshots = [
        createMockSnapshot({ size: 512 }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      document.body.appendChild(panel.render());
      panel.show();

      await vi.waitFor(() => {
        expect(panel.render().textContent).toContain('512 B');
      });

      document.body.removeChild(panel.render());
    });

    it('SNAP-061: formats kilobytes correctly', async () => {
      const snapshots = [
        createMockSnapshot({ size: 2048 }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      document.body.appendChild(panel.render());
      panel.show();

      await vi.waitFor(() => {
        expect(panel.render().textContent).toContain('2.0 KB');
      });

      document.body.removeChild(panel.render());
    });

    it('SNAP-062: formats megabytes correctly', async () => {
      const snapshots = [
        createMockSnapshot({ size: 2 * 1024 * 1024 }),
      ];
      (manager.listSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(
        snapshots
      );
      document.body.appendChild(panel.render());
      panel.show();

      await vi.waitFor(() => {
        expect(panel.render().textContent).toContain('2.0 MB');
      });

      document.body.removeChild(panel.render());
    });
  });

  // ---------------------------------------------------------------------------
  // dispose
  // ---------------------------------------------------------------------------
  describe('dispose', () => {
    it('SNAP-070: dispose hides the panel', () => {
      document.body.appendChild(panel.render());
      panel.show();

      panel.dispose();

      expect(panel.isOpen()).toBe(false);
    });

    it('SNAP-071: dispose removes container from DOM', () => {
      document.body.appendChild(panel.render());
      const el = panel.render();
      expect(document.body.contains(el)).toBe(true);

      panel.dispose();

      expect(document.body.contains(el)).toBe(false);
    });

    it('SNAP-072: dispose is idempotent', () => {
      document.body.appendChild(panel.render());
      panel.dispose();
      expect(() => panel.dispose()).not.toThrow();
    });

    it('SNAP-073: dispose emits closed event', () => {
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
    it('PL-L48b: opening the snapshot panel should close the playlist panel if open', () => {
      const mockPlaylistPanel: ExclusivePanel = {
        isOpen: vi.fn().mockReturnValue(true),
        hide: vi.fn(),
      };

      panel.setExclusiveWith(mockPlaylistPanel);

      document.body.appendChild(panel.render());
      panel.show();

      expect(mockPlaylistPanel.hide).toHaveBeenCalledTimes(1);

      document.body.removeChild(panel.render());
    });

    it('PL-L48b-2: opening the snapshot panel does not close playlist panel if it is already closed', () => {
      const mockPlaylistPanel: ExclusivePanel = {
        isOpen: vi.fn().mockReturnValue(false),
        hide: vi.fn(),
      };

      panel.setExclusiveWith(mockPlaylistPanel);

      document.body.appendChild(panel.render());
      panel.show();

      expect(mockPlaylistPanel.hide).not.toHaveBeenCalled();

      document.body.removeChild(panel.render());
    });
  });
});
