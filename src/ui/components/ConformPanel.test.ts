/**
 * Conform / Re-link Panel Unit Tests
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ConformPanel,
  buildConformEntries,
  extractFilename,
  matchScore,
  findSuggestions,
  batchRelinkByName,
  batchRelinkByFolder,
  type ConformPanelManager,
  type UnresolvedClip,
  type ConformSource,
} from './ConformPanel';

// ---------------------------------------------------------------------------
// Mock Manager
// ---------------------------------------------------------------------------

function createMockManager(
  clips: UnresolvedClip[] = [],
  sources: ConformSource[] = [],
): ConformPanelManager & { _resolved: Set<string> } {
  const resolved = new Set<string>();

  return {
    _resolved: resolved,

    getUnresolvedClips: vi.fn(() => clips.filter(c => !resolved.has(c.id))),

    getAvailableSources: vi.fn(() => sources),

    relinkClip: vi.fn((clipId: string, _sourceIndex: number) => {
      const clip = clips.find(c => c.id === clipId);
      if (!clip) return false;
      resolved.add(clipId);
      return true;
    }),

    getResolutionStatus: vi.fn(() => ({
      resolved: resolved.size,
      total: clips.length,
    })),
  };
}

function makeClip(overrides: Partial<UnresolvedClip> = {}): UnresolvedClip {
  return {
    id: 'clip-1',
    name: 'shot_010_comp_v02',
    originalUrl: '/mnt/shows/project/shot_010_comp_v02.exr',
    inFrame: 0,
    outFrame: 47,
    timelineIn: 0,
    reason: 'not_found',
    ...overrides,
  };
}

function makeSource(overrides: Partial<ConformSource> = {}): ConformSource {
  return {
    index: 0,
    name: 'shot_010_comp_v02.exr',
    url: 'https://cdn.example.com/media/shot_010_comp_v02.exr',
    frameCount: 48,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConformPanel', () => {
  describe('extractFilename', () => {
    it('extracts filename from Unix path', () => {
      expect(extractFilename('/mnt/shows/project/shot.exr')).toBe('shot.exr');
    });

    it('extracts filename from Windows path', () => {
      expect(extractFilename('C:\\shows\\project\\shot.exr')).toBe('shot.exr');
    });

    it('extracts filename from URL', () => {
      expect(extractFilename('https://cdn.example.com/media/shot.exr')).toBe('shot.exr');
    });

    it('returns input if no separator', () => {
      expect(extractFilename('shot.exr')).toBe('shot.exr');
    });

    it('handles trailing slash in URL', () => {
      expect(extractFilename('https://cdn.example.com/media/')).toBe('media');
    });
  });

  describe('matchScore', () => {
    it('returns 100 for exact case-insensitive match', () => {
      expect(matchScore('Shot.EXR', 'shot.exr')).toBe(100);
    });

    it('returns 80 for basename match (different extension)', () => {
      expect(matchScore('shot_010.exr', 'shot_010.dpx')).toBe(80);
    });

    it('returns 50 for substring match', () => {
      expect(matchScore('shot_010', 'shot_010_comp_v02.exr')).toBe(50);
    });

    it('returns 20 for word overlap', () => {
      expect(matchScore('shot_010_comp.exr', 'comp_final.exr')).toBe(20);
    });

    it('returns 0 for no match', () => {
      expect(matchScore('shot_010.exr', 'totally_different.mov')).toBe(0);
    });
  });

  describe('findSuggestions', () => {
    it('returns sources sorted by match score', () => {
      const clip = makeClip();
      const sources = [
        makeSource({ index: 0, name: 'unrelated.mov' }),
        makeSource({ index: 1, name: 'shot_010_comp_v02.exr' }), // exact
        makeSource({ index: 2, name: 'shot_010_comp_v02.dpx' }), // basename
      ];

      const results = findSuggestions(clip, sources);
      expect(results).toHaveLength(2);
      expect(results[0]!.index).toBe(1); // exact match first
      expect(results[1]!.index).toBe(2); // basename second
    });

    it('respects maxResults limit', () => {
      const clip = makeClip();
      const sources = Array.from({ length: 10 }, (_, i) =>
        makeSource({ index: i, name: `shot_010_comp_v02_${i}.exr` }),
      );

      const results = findSuggestions(clip, sources, 3);
      expect(results).toHaveLength(3);
    });

    it('returns empty array when no matches', () => {
      const clip = makeClip();
      const sources = [makeSource({ index: 0, name: 'totally_different.mov' })];

      const results = findSuggestions(clip, sources);
      expect(results).toHaveLength(0);
    });
  });

  describe('buildConformEntries', () => {
    it('CONFORM-001: builds entries with filename and suggestions', () => {
      const clip = makeClip();
      const source = makeSource();
      const manager = createMockManager([clip], [source]);

      const entries = buildConformEntries(manager);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.filename).toBe('shot_010_comp_v02.exr');
      expect(entries[0]!.suggestions).toHaveLength(1);
      expect(entries[0]!.clip.id).toBe('clip-1');
    });

    it('CONFORM-002: returns empty array when all clips resolved', () => {
      const manager = createMockManager([], []);
      const entries = buildConformEntries(manager);
      expect(entries).toHaveLength(0);
    });
  });

  describe('batchRelinkByName', () => {
    it('CONFORM-003: auto-relinks clips with strong filename matches', () => {
      const clips = [
        makeClip({ id: 'clip-1', originalUrl: '/shots/shot_010.exr' }),
        makeClip({ id: 'clip-2', originalUrl: '/shots/shot_020.exr' }),
      ];
      const sources = [
        makeSource({ index: 0, name: 'shot_010.exr' }),
        makeSource({ index: 1, name: 'shot_020.exr' }),
      ];
      const manager = createMockManager(clips, sources);

      const count = batchRelinkByName(manager);
      expect(count).toBe(2);
      expect(manager.relinkClip).toHaveBeenCalledWith('clip-1', 0);
      expect(manager.relinkClip).toHaveBeenCalledWith('clip-2', 1);
    });

    it('CONFORM-004: skips clips with weak matches (score < 80)', () => {
      const clips = [makeClip({ id: 'clip-1', originalUrl: '/shots/shot_010_comp.exr' })];
      const sources = [makeSource({ index: 0, name: 'totally_different.mov' })];
      const manager = createMockManager(clips, sources);

      const count = batchRelinkByName(manager);
      expect(count).toBe(0);
      expect(manager.relinkClip).not.toHaveBeenCalled();
    });
  });

  describe('batchRelinkByFolder', () => {
    it('CONFORM-005: relinks clips to matching sources in target folder', () => {
      const clips = [
        makeClip({ id: 'clip-1', originalUrl: '/old/path/shot_010.exr' }),
        makeClip({ id: 'clip-2', originalUrl: '/old/path/shot_020.exr' }),
      ];
      const sources = [
        makeSource({ index: 0, name: 'shot_010.exr', url: '/new/path/shot_010.exr' }),
        makeSource({ index: 1, name: 'shot_020.exr', url: '/new/path/shot_020.exr' }),
        makeSource({ index: 2, name: 'unrelated.exr', url: '/other/unrelated.exr' }),
      ];
      const manager = createMockManager(clips, sources);

      const count = batchRelinkByFolder(manager, '/new/path/');
      expect(count).toBe(2);
      expect(manager.relinkClip).toHaveBeenCalledWith('clip-1', 0);
      expect(manager.relinkClip).toHaveBeenCalledWith('clip-2', 1);
    });

    it('returns 0 when no sources in target folder', () => {
      const clips = [makeClip()];
      const sources = [makeSource({ url: '/other/folder/shot.exr' })];
      const manager = createMockManager(clips, sources);

      const count = batchRelinkByFolder(manager, '/new/path/');
      expect(count).toBe(0);
    });

    it('appends trailing slash to folder URL', () => {
      const clips = [makeClip({ id: 'clip-1', originalUrl: '/old/shot_010_comp_v02.exr' })];
      const sources = [
        makeSource({ index: 0, name: 'shot_010_comp_v02.exr', url: '/new/shot_010_comp_v02.exr' }),
      ];
      const manager = createMockManager(clips, sources);

      const count = batchRelinkByFolder(manager, '/new');
      expect(count).toBe(1);
    });
  });

  describe('ConformPanel component', () => {
    let container: HTMLElement;
    let manager: ReturnType<typeof createMockManager>;
    let panel: ConformPanel;

    afterEach(() => {
      if (panel) panel.dispose();
      if (container.parentNode) document.body.removeChild(container);
    });

    function setup(clips: UnresolvedClip[] = [], sources: ConformSource[] = []) {
      container = document.createElement('div');
      document.body.appendChild(container);
      manager = createMockManager(clips, sources);
      panel = new ConformPanel(container, manager);
    }

    it('CONFORM-006: renders clip rows for each unresolved clip', () => {
      setup(
        [
          makeClip({ id: 'clip-1', name: 'Shot 010' }),
          makeClip({ id: 'clip-2', name: 'Shot 020', originalUrl: '/shots/shot_020.exr' }),
        ],
        [makeSource()],
      );

      const rows = container.querySelectorAll('.conform-row');
      expect(rows).toHaveLength(2);

      const firstName = rows[0]!.querySelector('.conform-clip-name')!;
      expect(firstName.textContent).toBe('Shot 010');
    });

    it('CONFORM-007: shows resolution status bar', () => {
      setup([makeClip()], []);

      const statusBar = container.querySelector('.conform-status')!;
      expect(statusBar.textContent).toBe('0 of 1 clips resolved');
    });

    it('CONFORM-008: shows "All clips resolved" when empty', () => {
      setup([], []);

      const empty = container.querySelector('.conform-empty')!;
      expect(empty.textContent).toBe('All clips resolved.');
    });

    it('CONFORM-009: shows suggestions dropdown for matching sources', () => {
      setup(
        [makeClip({ id: 'clip-1' })],
        [makeSource({ index: 0, name: 'shot_010_comp_v02.exr' })],
      );

      const select = container.querySelector('.conform-suggestions') as HTMLSelectElement;
      expect(select).not.toBeNull();
      // placeholder + 1 suggestion
      expect(select.options).toHaveLength(2);
      expect(select.options[1]!.textContent).toBe('shot_010_comp_v02.exr');
    });

    it('CONFORM-010: selecting a suggestion relinks the clip', () => {
      setup(
        [makeClip({ id: 'clip-1' })],
        [makeSource({ index: 3, name: 'shot_010_comp_v02.exr' })],
      );

      const select = container.querySelector('.conform-suggestions') as HTMLSelectElement;
      select.value = '3';
      select.dispatchEvent(new Event('change'));

      expect(manager.relinkClip).toHaveBeenCalledWith('clip-1', 3);
      expect(panel.getResolvedIds().has('clip-1')).toBe(true);
    });

    it('CONFORM-011: browse button dispatches custom event', () => {
      setup([makeClip({ id: 'clip-1' })], [makeSource()]);

      const handler = vi.fn();
      container.addEventListener('conform-browse', handler);

      const browseBtn = container.querySelector('.conform-browse') as HTMLButtonElement;
      browseBtn.click();

      expect(handler).toHaveBeenCalledTimes(1);
      const detail = (handler.mock.calls[0]![0] as CustomEvent).detail;
      expect(detail.clipId).toBe('clip-1');
    });

    it('CONFORM-012: auto-relink button triggers batch matching', () => {
      setup(
        [makeClip({ id: 'clip-1', originalUrl: '/old/shot_010.exr' })],
        [makeSource({ index: 0, name: 'shot_010.exr' })],
      );

      const autoBtn = container.querySelector('.conform-auto-relink') as HTMLButtonElement;
      autoBtn.click();

      expect(manager.relinkClip).toHaveBeenCalledWith('clip-1', 0);
    });

    it('CONFORM-013: folder relink button dispatches custom event', () => {
      setup([makeClip()], []);

      const handler = vi.fn();
      container.addEventListener('conform-browse-folder', handler);

      const folderBtn = container.querySelector('.conform-folder-relink') as HTMLButtonElement;
      folderBtn.click();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('shows reason badge for each clip', () => {
      setup([
        makeClip({ id: 'clip-1', reason: 'not_found' }),
        makeClip({ id: 'clip-2', reason: 'load_failed', originalUrl: '/shots/other.exr' }),
      ]);

      const reasons = container.querySelectorAll('.conform-reason');
      expect(reasons[0]!.textContent).toBe('Not Found');
      expect(reasons[1]!.textContent).toBe('Load Failed');
    });

    it('shows original URL as tooltip', () => {
      const fullUrl = '/mnt/shows/project/shot_010_comp_v02.exr';
      setup([makeClip({ id: 'clip-1', originalUrl: fullUrl })]);

      const urlEl = container.querySelector('.conform-original-url') as HTMLElement;
      expect(urlEl.textContent).toBe('shot_010_comp_v02.exr');
      expect(urlEl.title).toBe(fullUrl);
    });

    it('toolbar is not duplicated on re-render', () => {
      setup([makeClip()], []);

      panel.render();
      panel.render();
      panel.render();

      const toolbars = container.querySelectorAll('.conform-toolbar');
      expect(toolbars.length).toBe(1);
    });

    it('dispose clears container and resolved set', () => {
      setup([makeClip({ id: 'clip-1' })], [makeSource()]);

      // Resolve a clip first
      manager.relinkClip('clip-1', 0);
      panel.render();

      panel.dispose();
      expect(container.innerHTML).toBe('');
      expect(panel.getResolvedIds().size).toBe(0);
    });

    it('CONFORM-014: relinkClip failure does not mark clip as resolved', () => {
      const clip = makeClip({ id: 'clip-fail' });
      const source = makeSource({ index: 5, name: 'shot_010_comp_v02.exr' });
      setup([clip], [source]);

      // Override relinkClip to return false for this clip
      (manager.relinkClip as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

      const select = container.querySelector('.conform-suggestions') as HTMLSelectElement;
      select.value = '5';
      select.dispatchEvent(new Event('change'));

      expect(manager.relinkClip).toHaveBeenCalledWith('clip-fail', 5);
      expect(panel.getResolvedIds().has('clip-fail')).toBe(false);
    });

    it('status bar has role="status" for screen readers', () => {
      setup([makeClip()], []);

      const statusBar = container.querySelector('.conform-status')!;
      expect(statusBar.getAttribute('role')).toBe('status');
    });

    it('suggestions select has aria-label', () => {
      setup(
        [makeClip({ id: 'clip-1', name: 'Shot 010' })],
        [makeSource({ index: 0, name: 'shot_010_comp_v02.exr' })],
      );

      const select = container.querySelector('.conform-suggestions') as HTMLSelectElement;
      expect(select.getAttribute('aria-label')).toBe('Re-link source for Shot 010');
    });
  });
});
