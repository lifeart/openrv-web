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
    updateClipPoints: vi.fn(),
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

  describe('transition validation', () => {
    it('PL-040: logs a warning and reverts to cut when a transition is rejected', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const clips = [
        {
          id: 'c1',
          sourceIndex: 0,
          sourceName: 'clip1.mp4',
          inPoint: 1,
          outPoint: 50,
          duration: 50,
          globalStartFrame: 1,
        },
        {
          id: 'c2',
          sourceIndex: 1,
          sourceName: 'clip2.mp4',
          inPoint: 1,
          outPoint: 30,
          duration: 30,
          globalStartFrame: 51,
        },
      ];

      const transitionPanel = new PlaylistPanel({
        ...createMockPlaylistManager(),
        getClips: vi.fn().mockReturnValue(clips),
        getTotalDuration: vi.fn().mockReturnValue(80),
      } as unknown as PlaylistManager);
      const transitionManager = {
        getTransition: vi.fn(() => null),
        setTransition: vi.fn(),
        validateTransition: vi.fn(() => null),
        calculateOverlapAdjustedFrames: vi.fn((value: unknown[]) => value),
        on: vi.fn(),
        off: vi.fn(),
      };

      transitionPanel.setTransitionManager(transitionManager as never);
      transitionPanel.show();

      const typeSelect = document.querySelector('[data-testid="transition-type-0"]') as HTMLSelectElement;
      expect(typeSelect).toBeTruthy();

      typeSelect.value = 'crossfade';
      typeSelect.dispatchEvent(new Event('change'));

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Transition "crossfade" rejected'));
      expect(typeSelect.value).toBe('cut');
      expect(transitionManager.setTransition).toHaveBeenCalledWith(0, null);

      transitionPanel.dispose();
      warnSpy.mockRestore();
    });
  });

  describe('clip trimming', () => {
    it('PL-040: changing in/out inputs updates clip points in manager', () => {
      const clip = {
        id: 'clip-1',
        sourceIndex: 0,
        sourceName: 'ShotA',
        inPoint: 1,
        outPoint: 50,
        globalStartFrame: 1,
        duration: 50,
      };
      (manager.getClips as unknown as ReturnType<typeof vi.fn>).mockReturnValue([clip]);

      document.body.appendChild(panel.render());
      panel.show();

      const inputs = panel.render().querySelectorAll<HTMLInputElement>('input[type="number"]');
      const inInput = inputs[0];
      const outInput = inputs[1];
      expect(inInput).toBeDefined();
      expect(outInput).toBeDefined();
      if (!inInput || !outInput) return;

      inInput.value = '10';
      inInput.dispatchEvent(new Event('change', { bubbles: true }));
      outInput.value = '20';
      outInput.dispatchEvent(new Event('change', { bubbles: true }));

      expect((manager.updateClipPoints as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)).toEqual([
        'clip-1',
        10,
        20,
      ]);

      document.body.removeChild(panel.render());
    });
  });

  // ---------------------------------------------------------------------------
  // Source URL resolver (Issue #46)
  // ---------------------------------------------------------------------------

  describe('setSourceUrlResolver', () => {
    it('PL-080: accepts a source URL resolver function', () => {
      const resolver = vi.fn().mockReturnValue('file:///test.exr');
      expect(() => panel.setSourceUrlResolver(resolver)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Issue #108: EDL/OTIO import support
  // ---------------------------------------------------------------------------
  describe('issue #108: EDL/OTIO import', () => {
    it('PL-108a: footer contains import button alongside export buttons', () => {
      const el = panel.render();
      const buttons = el.querySelectorAll('button');
      const buttonTexts = Array.from(buttons).map((btn) => btn.textContent?.trim() ?? '');

      // Should have EDL and OTIO export buttons
      expect(buttonTexts.some((t) => t.includes('EDL'))).toBe(true);
      expect(buttonTexts.some((t) => t.includes('OTIO'))).toBe(true);

      // Should have an import button
      const importBtn = Array.from(buttons).find(
        (btn) =>
          btn.title?.toLowerCase().includes('import') ||
          btn.textContent?.toLowerCase().includes('import'),
      );
      expect(importBtn).toBeDefined();
    });

    it('PL-108b: import button present with correct testid', () => {
      const el = panel.render();
      const importBtn = el.querySelector('[data-testid="playlist-import-btn"]');
      expect(importBtn).toBeInstanceOf(HTMLButtonElement);
    });

    it('PL-108c: clicking import creates file input', () => {
      document.body.appendChild(panel.render());
      panel.show();

      const importBtn = panel.render().querySelector('[data-testid="playlist-import-btn"]') as HTMLButtonElement;
      expect(importBtn).toBeDefined();

      importBtn.click();

      const fileInput = document.body.querySelector('[data-testid="import-playlist-file-input"]');
      expect(fileInput).toBeInstanceOf(HTMLInputElement);
      if (fileInput) {
        expect((fileInput as HTMLInputElement).type).toBe('file');
        expect((fileInput as HTMLInputElement).accept).toBe('.edl,.otio,.json,.rvedl');
      }

      // Clean up the file input if still in DOM
      if (fileInput && document.body.contains(fileInput)) {
        document.body.removeChild(fileInput);
      }
      document.body.removeChild(panel.render());
    });

    it('PL-108d: EDL file import calls manager.fromEDL', async () => {
      (manager as unknown as Record<string, unknown>).fromEDL = vi.fn().mockReturnValue(2);
      (manager as unknown as Record<string, unknown>).clear = vi.fn();
      (manager as unknown as Record<string, unknown>).unresolvedClips = [];

      document.body.appendChild(panel.render());
      panel.show();

      const importedHandler = vi.fn();
      panel.on('imported', importedHandler);

      const importBtn = panel.render().querySelector('[data-testid="playlist-import-btn"]') as HTMLButtonElement;
      importBtn.click();

      const fileInput = document.body.querySelector('[data-testid="import-playlist-file-input"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();

      // Simulate file selection
      const edlContent = '001  ShotA  V  C  01:00:00:00  01:00:01:00  01:00:00:00  01:00:01:00';
      const file = new File([edlContent], 'test.edl', { type: 'text/plain' });
      Object.defineProperty(fileInput, 'files', { value: [file], writable: false });
      fileInput.dispatchEvent(new Event('change'));

      // Wait for FileReader to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect((manager as unknown as Record<string, ReturnType<typeof vi.fn>>).clear).toHaveBeenCalled();
      expect((manager as unknown as Record<string, ReturnType<typeof vi.fn>>).fromEDL).toHaveBeenCalledWith(
        edlContent,
        expect.any(Function),
      );
      expect(importedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'edl', importedCount: 2 }),
      );

      document.body.removeChild(panel.render());
    });

    it('PL-108e: OTIO file import calls manager.fromOTIO', async () => {
      (manager as unknown as Record<string, unknown>).fromOTIO = vi.fn().mockReturnValue(3);
      (manager as unknown as Record<string, unknown>).clear = vi.fn();
      (manager as unknown as Record<string, unknown>).unresolvedClips = [{ id: 'u1' }];

      document.body.appendChild(panel.render());
      panel.show();

      const importedHandler = vi.fn();
      panel.on('imported', importedHandler);

      const importBtn = panel.render().querySelector('[data-testid="playlist-import-btn"]') as HTMLButtonElement;
      importBtn.click();

      const fileInput = document.body.querySelector('[data-testid="import-playlist-file-input"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();

      const otioContent = '{"OTIO_SCHEMA": "Timeline.1"}';
      const file = new File([otioContent], 'test.otio', { type: 'application/json' });
      Object.defineProperty(fileInput, 'files', { value: [file], writable: false });
      fileInput.dispatchEvent(new Event('change'));

      // Wait for FileReader to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect((manager as unknown as Record<string, ReturnType<typeof vi.fn>>).clear).toHaveBeenCalled();
      expect((manager as unknown as Record<string, ReturnType<typeof vi.fn>>).fromOTIO).toHaveBeenCalledWith(
        otioContent,
        expect.any(Function),
      );
      expect(importedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'otio', importedCount: 3, unresolvedCount: 1 }),
      );

      document.body.removeChild(panel.render());
    });

    it('PL-108f: import cleans up file input from DOM', () => {
      document.body.appendChild(panel.render());
      panel.show();

      const importBtn = panel.render().querySelector('[data-testid="playlist-import-btn"]') as HTMLButtonElement;
      importBtn.click();

      const fileInput = document.body.querySelector('[data-testid="import-playlist-file-input"]');
      expect(fileInput).toBeTruthy();

      // Simulate cancel
      fileInput!.dispatchEvent(new Event('cancel'));

      const fileInputAfter = document.body.querySelector('[data-testid="import-playlist-file-input"]');
      expect(fileInputAfter).toBeNull();

      document.body.removeChild(panel.render());
    });

    it('PL-108g: setSourceNameResolver accepts resolver function', () => {
      const resolver = vi.fn().mockReturnValue({ index: 0, frameCount: 100 });
      expect(() => panel.setSourceNameResolver(resolver)).not.toThrow();
    });

    it('PL-108h: import with no resolver handles gracefully', async () => {
      (manager as unknown as Record<string, unknown>).fromEDL = vi.fn().mockReturnValue(0);
      (manager as unknown as Record<string, unknown>).clear = vi.fn();

      document.body.appendChild(panel.render());
      panel.show();

      const importBtn = panel.render().querySelector('[data-testid="playlist-import-btn"]') as HTMLButtonElement;
      importBtn.click();

      const fileInput = document.body.querySelector('[data-testid="import-playlist-file-input"]') as HTMLInputElement;
      const file = new File(['001  ShotA  V  C  01:00:00:00  01:00:01:00'], 'test.edl', { type: 'text/plain' });
      Object.defineProperty(fileInput, 'files', { value: [file], writable: false });
      fileInput.dispatchEvent(new Event('change'));

      // Wait for FileReader to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not throw, and fromEDL should be called with a fallback resolver
      expect((manager as unknown as Record<string, ReturnType<typeof vi.fn>>).fromEDL).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
      );

      document.body.removeChild(panel.render());
    });
  });

  // ---------------------------------------------------------------------------
  // Public API: importOTIOFile, triggerEDLExport, triggerOTIOExport (Issue #465)
  // ---------------------------------------------------------------------------

  describe('public import/export API (Issue #465)', () => {
    it('PL-060: importOTIOFile reads file and calls playlistManager.fromOTIO', async () => {
      const mockManager = manager as unknown as Record<string, ReturnType<typeof vi.fn>>;
      mockManager.fromOTIO = vi.fn().mockReturnValue(2);
      mockManager.clear = vi.fn();
      (manager as any).unresolvedClips = [];

      const otioContent = '{"OTIO_SCHEMA": "Timeline.1", "name": "test"}';
      const file = new File([otioContent], 'timeline.otio');

      panel.importOTIOFile(file);

      // Wait for FileReader to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockManager.clear).toHaveBeenCalledTimes(1);
      expect(mockManager.fromOTIO).toHaveBeenCalledTimes(1);
      expect(mockManager.fromOTIO).toHaveBeenCalledWith(otioContent, expect.any(Function));
    });

    it('PL-061: importOTIOFile emits imported event after successful import', async () => {
      const mockManager = manager as unknown as Record<string, ReturnType<typeof vi.fn>>;
      mockManager.fromOTIO = vi.fn().mockReturnValue(3);
      mockManager.clear = vi.fn();
      (manager as any).unresolvedClips = [{ name: 'unresolved.exr' }];

      const importedCallback = vi.fn();
      panel.on('imported', importedCallback);

      const file = new File(['{}'], 'timeline.otio');
      panel.importOTIOFile(file);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(importedCallback).toHaveBeenCalledWith({
        format: 'otio',
        importedCount: 3,
        unresolvedCount: 1,
      });
    });

    it('PL-062: importOTIOFile uses sourceNameResolver when set', async () => {
      const mockManager = manager as unknown as Record<string, ReturnType<typeof vi.fn>>;
      mockManager.fromOTIO = vi.fn().mockReturnValue(1);
      mockManager.clear = vi.fn();
      (manager as any).unresolvedClips = [];

      const resolver = vi.fn().mockReturnValue({ index: 0, frameCount: 100 });
      panel.setSourceNameResolver(resolver);

      const file = new File(['{}'], 'timeline.otio');
      panel.importOTIOFile(file);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // fromOTIO should receive the resolver, not the fallback
      const passedResolver = mockManager.fromOTIO.mock.calls[0]![1];
      passedResolver('test', 'url');
      expect(resolver).toHaveBeenCalledWith('test', 'url');
    });

    it('PL-063: triggerEDLExport calls the same export logic as the EDL button', () => {
      // Mock downloadEDL by checking that getClips is called (part of exportEDL flow)
      const mockManager = manager as unknown as Record<string, ReturnType<typeof vi.fn>>;
      mockManager.getClips = vi.fn().mockReturnValue([]);

      expect(() => panel.triggerEDLExport()).not.toThrow();
      expect(mockManager.getClips).toHaveBeenCalled();
    });

    it('PL-064: triggerOTIOExport calls the same export logic as the OTIO button', () => {
      const mockManager = manager as unknown as Record<string, ReturnType<typeof vi.fn>>;
      mockManager.getClips = vi.fn().mockReturnValue([]);

      expect(() => panel.triggerOTIOExport()).not.toThrow();
      expect(mockManager.getClips).toHaveBeenCalled();
    });

    it('PL-065: importOTIOFile handles parse errors gracefully', async () => {
      const mockManager = manager as unknown as Record<string, ReturnType<typeof vi.fn>>;
      mockManager.fromOTIO = vi.fn().mockImplementation(() => {
        throw new Error('Invalid OTIO');
      });
      mockManager.clear = vi.fn();

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const file = new File(['not-json'], 'broken.otio');
      panel.importOTIOFile(file);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
