/**
 * Regression tests for issues #93-#102 (P1 batch)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// Issue #98: Tooltip dual-behavior documentation
// ============================================================
import { GhostFrameControl } from './GhostFrameControl';
import { PARControl } from './PARControl';
import { StereoAlignControl } from './StereoAlignControl';

describe('Issue #98: Tooltips describe both interaction models', () => {
  it('#98-1: GhostFrameControl tooltip mentions click and keyboard shortcut', () => {
    const control = new GhostFrameControl();
    const button = control.render().querySelector('[data-testid="ghost-frame-button"]') as HTMLButtonElement;
    expect(button.title).toMatch(/click/i);
    expect(button.title).toMatch(/Ctrl\+G/i);
    expect(button.title).toMatch(/toggle/i);
    control.dispose();
  });

  it('#98-2: PARControl tooltip mentions click and keyboard shortcut', () => {
    const control = new PARControl();
    const button = control.render().querySelector('[data-testid="par-control-button"]') as HTMLButtonElement;
    expect(button.title).toMatch(/click/i);
    expect(button.title).toMatch(/Shift\+P/i);
    expect(button.title).toMatch(/toggle/i);
    control.dispose();
  });

  it('#98-3: StereoAlignControl tooltip mentions click and keyboard shortcut', () => {
    const control = new StereoAlignControl();
    const button = control.render().querySelector('[data-testid="stereo-align-button"]') as HTMLButtonElement;
    expect(button.title).toMatch(/click/i);
    expect(button.title).toMatch(/Shift\+4/i);
    expect(button.title).toMatch(/cycle/i);
    control.dispose();
  });
});

// ============================================================
// Issue #99: TimelineEditor context menu shortcut hints
// ============================================================
import { TimelineEditor } from './TimelineEditor';
import { Session } from '../../core/session/Session';
import { SequenceGroupNode } from '../../nodes/groups/SequenceGroupNode';

describe('Issue #99: TimelineEditor context menu shortcut hints', () => {
  let container: HTMLElement;
  let session: Session;
  let editor: TimelineEditor;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    session = new Session();

    const seq = new SequenceGroupNode('TestSeq');
    seq.setEDL([
      { frame: 1, source: 0, inPoint: 1, outPoint: 50 },
    ]);
    editor = new TimelineEditor(container, session, seq);
  });

  afterEach(() => {
    editor?.dispose();
    container.remove();
    document.querySelectorAll('.timeline-context-menu').forEach((el) => el.remove());
  });

  it('#99-1: Split and Duplicate items do not show shortcut hints', () => {
    // Trigger context menu on the first cut
    const cutEl = container.querySelector('.timeline-cut') as HTMLElement;
    expect(cutEl).toBeTruthy();
    cutEl.dispatchEvent(new MouseEvent('contextmenu', { clientX: 50, clientY: 50, bubbles: true }));

    const contextMenu = document.querySelector('.timeline-context-menu');
    expect(contextMenu).toBeTruthy();

    const items = contextMenu!.querySelectorAll('div[style*="cursor: pointer"]');
    let splitItem: Element | null = null;
    let duplicateItem: Element | null = null;
    let deleteItem: Element | null = null;
    items.forEach((item) => {
      const text = item.textContent || '';
      if (text.includes('Split at Playhead')) splitItem = item;
      if (text.includes('Duplicate Cut')) duplicateItem = item;
      if (text.includes('Delete Cut')) deleteItem = item;
    });

    // Split should not have a shortcut span (only label span)
    expect(splitItem).toBeTruthy();
    expect(splitItem!.querySelectorAll('span').length).toBe(1);

    // Duplicate should not have a shortcut span
    expect(duplicateItem).toBeTruthy();
    expect(duplicateItem!.querySelectorAll('span').length).toBe(1);

    // Delete should still show 'Del'
    expect(deleteItem).toBeTruthy();
    expect(deleteItem!.textContent).toContain('Del');
    expect(deleteItem!.querySelectorAll('span').length).toBe(2);
  });
});

// ============================================================
// Issue #100: SnapshotPanel shows error on load failure
// ============================================================
import { SnapshotPanel } from './SnapshotPanel';

describe('Issue #100: SnapshotPanel load failure error message', () => {
  it('#100-1: shows error message in panel when loadSnapshots fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockManager = {
      listSnapshots: vi.fn().mockRejectedValue(new Error('storage unavailable')),
      renameSnapshot: vi.fn(),
      exportSnapshot: vi.fn(),
      deleteSnapshot: vi.fn(),
      clearAll: vi.fn(),
      on: vi.fn(() => () => {}),
      off: vi.fn(),
    };

    const panel = new SnapshotPanel(mockManager as any);
    panel.show();

    await vi.waitFor(() => {
      const errorEl = document.querySelector('[data-testid="snapshot-load-error"]');
      expect(errorEl).toBeTruthy();
      expect(errorEl!.textContent).toContain('Failed to load snapshots');
    });

    panel.dispose();
    errorSpy.mockRestore();
  });
});

// ============================================================
// Issue #101: InfoPanel unwired fields documentation
// ============================================================
import { InfoPanel } from './InfoPanel';

describe('Issue #101: InfoPanel unwired fields documentation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('#101-1: logs console.info about unwired fields on first enable', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const panel = new InfoPanel();
    panel.enable();

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Most fields'),
    );
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('#101'),
    );

    panel.dispose();
  });

  it('#101-2: unwired fields hint is logged only once', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const panel = new InfoPanel();
    panel.enable();
    panel.disable();
    panel.enable();

    const matchingCalls = spy.mock.calls.filter((args) =>
      String(args[0]).includes('#101'),
    );
    expect(matchingCalls).toHaveLength(1);

    panel.dispose();
  });
});

// ============================================================
// Issue #102: CacheIndicator clear button label
// ============================================================
import { CacheIndicator } from './CacheIndicator';

vi.useFakeTimers();

describe('Issue #102: CacheIndicator clear button label and effects cache clearing', () => {
  const createMockSession102 = () => ({
    getCachedFrames: vi.fn(() => new Set<number>()),
    getPendingFrames: vi.fn(() => new Set<number>()),
    getCacheStats: vi.fn(() => ({ cachedFrames: 0 })),
    clearVideoCache: vi.fn(),
    isUsingMediabunny: vi.fn(() => true),
    get currentSource() {
      return { duration: 100, width: 1920, height: 1080 };
    },
    get inPoint() {
      return 1;
    },
    get outPoint() {
      return 100;
    },
    on: vi.fn(),
    off: vi.fn(),
  });

  it('#102-1: clear button label says "Clear Video Cache"', () => {
    const mockSession = createMockSession102();
    const indicator = new CacheIndicator(mockSession as any);
    const el = indicator.getElement();
    const clearBtn = el.querySelector('[data-testid="cache-indicator-clear"]') as HTMLButtonElement;
    expect(clearBtn).toBeTruthy();
    expect(clearBtn.textContent).toBe('Clear Video Cache');

    indicator.dispose();
  });

  it('#102-2: effects clear button label says "Clear Effects Cache"', () => {
    const mockSession = createMockSession102();
    const indicator = new CacheIndicator(mockSession as any);
    const el = indicator.getElement();
    const clearEffectsBtn = el.querySelector('[data-testid="cache-indicator-clear-effects"]') as HTMLButtonElement;
    expect(clearEffectsBtn).toBeTruthy();
    expect(clearEffectsBtn.textContent).toBe('Clear Effects Cache');

    indicator.dispose();
  });

  it('#102-3: clicking effects clear button calls viewer.clearPrerenderCache()', () => {
    const mockSession = createMockSession102();
    const mockViewer = {
      getPrerenderStats: vi.fn(() => ({
        cacheSize: 5,
        totalFrames: 100,
        pendingRequests: 0,
        activeRequests: 0,
        memorySizeMB: 10,
        cacheHits: 0,
        cacheMisses: 0,
        hitRate: 0,
      })),
      setOnPrerenderCacheUpdate: vi.fn(),
      clearPrerenderCache: vi.fn(),
    };

    const indicator = new CacheIndicator(mockSession as any, mockViewer as any);
    vi.advanceTimersByTime(16);

    const el = indicator.getElement();
    const clearEffectsBtn = el.querySelector('[data-testid="cache-indicator-clear-effects"]') as HTMLButtonElement;
    clearEffectsBtn.click();

    expect(mockViewer.clearPrerenderCache).toHaveBeenCalled();

    indicator.dispose();
    vi.useRealTimers();
    vi.useFakeTimers();
  });
});
