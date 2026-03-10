/**
 * Tests for SnapshotPanel - specifically the Import snapshot feature.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SnapshotPanel } from '../SnapshotPanel';
import type { SnapshotManager, Snapshot } from '../../../core/session/SnapshotManager';

// Mock the Modal module
vi.mock('../shared/Modal', () => ({
  showAlert: vi.fn().mockResolvedValue(undefined),
  showConfirm: vi.fn().mockResolvedValue(false),
  showPrompt: vi.fn().mockResolvedValue(null),
}));

function createMockSnapshotManager(): SnapshotManager {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  return {
    listSnapshots: vi.fn<() => Promise<Snapshot[]>>().mockResolvedValue([]),
    createSnapshot: vi.fn().mockResolvedValue({ id: 'test' }),
    createAutoCheckpoint: vi.fn().mockResolvedValue({ id: 'test' }),
    deleteSnapshot: vi.fn().mockResolvedValue(undefined),
    renameSnapshot: vi.fn().mockResolvedValue(undefined),
    exportSnapshot: vi.fn().mockResolvedValue('{}'),
    importSnapshot: vi.fn<(json: string) => Promise<Snapshot>>().mockResolvedValue({
      id: 'imported-1',
      name: 'Imported Snapshot',
      createdAt: new Date().toISOString(),
      isAutoCheckpoint: false,
      version: 1,
      size: 100,
    }),
    clearAll: vi.fn().mockResolvedValue(undefined),
    getSnapshot: vi.fn().mockResolvedValue(null),
    getSnapshotMetadata: vi.fn().mockResolvedValue(null),
    updateDescription: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
      return () => {
        listeners.get(event)?.delete(handler);
      };
    }),
    off: vi.fn(),
    emit: vi.fn(),
  } as unknown as SnapshotManager;
}

describe('SnapshotPanel', () => {
  let panel: SnapshotPanel;
  let manager: SnapshotManager;

  beforeEach(() => {
    manager = createMockSnapshotManager();
    panel = new SnapshotPanel(manager);
  });

  afterEach(() => {
    panel.dispose();
  });

  describe('Import button', () => {
    it('renders an import button with correct test id', () => {
      const el = panel.render();
      const importBtn = el.querySelector('[data-testid="import-snapshot-btn"]');
      expect(importBtn).toBeTruthy();
    });

    it('import button contains "Import" text', () => {
      const el = panel.render();
      const importBtn = el.querySelector('[data-testid="import-snapshot-btn"]') as HTMLElement;
      expect(importBtn.textContent).toContain('Import');
    });

    it('clicking import button creates a file input and triggers click', () => {
      const el = panel.render();
      document.body.appendChild(el);

      const importBtn = el.querySelector('[data-testid="import-snapshot-btn"]') as HTMLElement;

      // Spy on document.createElement to capture the file input
      const originalCreateElement = document.createElement.bind(document);
      let fileInput: HTMLInputElement | null = null;
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const element = originalCreateElement(tag);
        if (tag === 'input' && !fileInput) {
          fileInput = element as HTMLInputElement;
          // Prevent actual click from opening file picker
          vi.spyOn(fileInput, 'click').mockImplementation(() => {});
        }
        return element;
      });

      importBtn.click();

      expect(fileInput).toBeTruthy();
      expect(fileInput!.type).toBe('file');
      expect(fileInput!.accept).toContain('.json');
      expect(fileInput!.click).toHaveBeenCalled();

      createElementSpy.mockRestore();
      document.body.removeChild(el);
    });

    it('successful import calls importSnapshot and refreshes list', async () => {
      const el = panel.render();
      document.body.appendChild(el);

      const snapshotJson = JSON.stringify({
        metadata: { name: 'Test', version: 1 },
        state: { version: 1 },
      });

      // Create a mock file
      const file = new File([snapshotJson], 'snapshot.json', { type: 'application/json' });

      // Spy on createElement to intercept the file input
      const originalCreateElement = document.createElement.bind(document);
      let fileInput: HTMLInputElement | null = null;
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const element = originalCreateElement(tag);
        if (tag === 'input' && !fileInput) {
          fileInput = element as HTMLInputElement;
          vi.spyOn(fileInput, 'click').mockImplementation(() => {});
        }
        return element;
      });

      const importBtn = el.querySelector('[data-testid="import-snapshot-btn"]') as HTMLElement;
      importBtn.click();

      createElementSpy.mockRestore();

      // Simulate file selection
      Object.defineProperty(fileInput!, 'files', { value: [file] });
      fileInput!.dispatchEvent(new Event('change'));

      // Wait for async operations
      await vi.waitFor(() => {
        expect(manager.importSnapshot).toHaveBeenCalledWith(snapshotJson);
      });

      // Verify list was refreshed (listSnapshots called after import)
      await vi.waitFor(() => {
        expect(manager.listSnapshots).toHaveBeenCalled();
      });

      document.body.removeChild(el);
    });

    it('failed import shows error alert', async () => {
      const { showAlert } = await import('../shared/Modal');

      const el = panel.render();
      document.body.appendChild(el);

      // Make importSnapshot reject
      (manager.importSnapshot as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Invalid snapshot format'),
      );

      // Create a mock file
      const file = new File(['invalid'], 'bad.json', { type: 'application/json' });

      // Spy on createElement to intercept the file input
      const originalCreateElement = document.createElement.bind(document);
      let fileInput: HTMLInputElement | null = null;
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const element = originalCreateElement(tag);
        if (tag === 'input' && !fileInput) {
          fileInput = element as HTMLInputElement;
          vi.spyOn(fileInput, 'click').mockImplementation(() => {});
        }
        return element;
      });

      const importBtn = el.querySelector('[data-testid="import-snapshot-btn"]') as HTMLElement;
      importBtn.click();

      createElementSpy.mockRestore();

      // Simulate file selection
      Object.defineProperty(fileInput!, 'files', { value: [file] });
      fileInput!.dispatchEvent(new Event('change'));

      // Wait for the error alert to be shown
      await vi.waitFor(() => {
        expect(showAlert).toHaveBeenCalledWith(
          expect.stringContaining('Invalid snapshot format'),
          expect.objectContaining({ type: 'error', title: 'Import Error' }),
        );
      });

      document.body.removeChild(el);
    });
  });
});
