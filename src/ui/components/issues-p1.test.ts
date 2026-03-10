/**
 * Regression tests for issues #93-#102 (P1 batch)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// Issue #93: FrameburnCompositor multi-field path unreachable
// ============================================================
import {
  compositeFrameburn,
  _frameburnGapState,
  _resetFrameburnGapFlag,
  type FrameburnConfig,
  type FrameburnContext,
} from './FrameburnCompositor';

const baseContext: FrameburnContext = {
  currentFrame: 48,
  totalFrames: 240,
  fps: 24,
  shotName: 'vfx_010_020',
  width: 1920,
  height: 1080,
};

const enabledConfig: FrameburnConfig = {
  enabled: true,
  fields: [{ type: 'timecode' }],
};

function createCtx() {
  const c = document.createElement('canvas');
  c.width = 1920;
  c.height = 1080;
  return c.getContext('2d')!;
}

describe('Issue #93: FrameburnCompositor multi-field gap documentation', () => {
  beforeEach(() => {
    _resetFrameburnGapFlag();
    vi.restoreAllMocks();
  });

  it('#93-1: compositeFrameburn logs console.info about unreachable path on first call', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    compositeFrameburn(createCtx(), 1920, 1080, enabledConfig, baseContext);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('multi-field frameburn overlay is implemented'),
    );
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('#93'));
  });

  it('#93-2: console.info is logged only once across multiple calls', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    compositeFrameburn(createCtx(), 1920, 1080, enabledConfig, baseContext);
    compositeFrameburn(createCtx(), 1920, 1080, enabledConfig, baseContext);
    const matchingCalls = spy.mock.calls.filter((args) =>
      String(args[0]).includes('#93'),
    );
    expect(matchingCalls).toHaveLength(1);
    expect(_frameburnGapState.logged).toBe(true);
  });
});

// ============================================================
// Issue #94: Watermark image load failure feedback
// ============================================================
import { WatermarkControl } from './WatermarkControl';
import { WatermarkOverlay } from './WatermarkOverlay';

describe('Issue #94: WatermarkControl load failure feedback', () => {
  it('#94-1: console.warn is called on image load failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const overlay = new WatermarkOverlay();
    vi.spyOn(overlay, 'loadImage').mockRejectedValue(new Error('corrupt file'));
    const control = new WatermarkControl(overlay);

    // Simulate file selection
    const fileInput = control.render().querySelector('[data-testid="watermark-file-input"]') as HTMLInputElement;
    // Create a fake FileList
    const file = new File([''], 'bad.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fileInput.dispatchEvent(new Event('change'));

    // Wait for async handler
    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load watermark image'),
      );
    });

    // Verify error is displayed in UI
    const errorEl = control.render().querySelector('[data-testid="watermark-load-error"]');
    expect(errorEl).toBeTruthy();
    expect(errorEl!.textContent).toContain('corrupt file');

    control.dispose();
    warnSpy.mockRestore();
  });
});

// ============================================================
// Issue #95: Playlist transition rejection feedback
// ============================================================
import { PlaylistPanel } from './PlaylistPanel';

describe('Issue #95: PlaylistPanel transition rejection warning', () => {
  it('#95-1: logs console.warn when transition is rejected', () => {
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

    const pm = {
      getClips: vi.fn(() => clips),
      getTotalDuration: vi.fn(() => 80),
      getLoopMode: vi.fn(() => 'none' as const),
      isEnabled: vi.fn(() => false),
      setEnabled: vi.fn(),
      setLoopMode: vi.fn(),
      moveClip: vi.fn(),
      removeClip: vi.fn(),
      updateClipPoints: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    const tm = {
      getTransition: vi.fn(() => null),
      setTransition: vi.fn(),
      validateTransition: vi.fn(() => null), // Returns null = rejected
      calculateOverlapAdjustedFrames: vi.fn((c: unknown[]) => c),
      on: vi.fn(),
      off: vi.fn(),
    };

    const panel = new PlaylistPanel(pm as any);
    panel.setTransitionManager(tm as any);
    panel.show();

    // Find the transition type select and trigger a change
    const typeSelect = document.querySelector('[data-testid="transition-type-0"]') as HTMLSelectElement;
    expect(typeSelect).toBeTruthy();

    typeSelect.value = 'crossfade';
    typeSelect.dispatchEvent(new Event('change'));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Transition "crossfade" rejected'),
    );

    panel.dispose();
    warnSpy.mockRestore();
  });
});

// ============================================================
// Issue #96: ShotGridPanel validation feedback
// ============================================================
import { ShotGridPanel } from './ShotGridPanel';

describe('Issue #96: ShotGridPanel invalid ID feedback', () => {
  let panel: ShotGridPanel;

  beforeEach(() => {
    panel = new ShotGridPanel();
    panel.setConnected(true);
    panel.show();
  });

  afterEach(() => {
    panel.dispose();
  });

  it('#96-1: shows error message for empty ID', () => {
    const input = document.querySelector('[data-testid="shotgrid-query-input"]') as HTMLInputElement;
    const loadBtn = document.querySelector('[data-testid="shotgrid-load-btn"]') as HTMLButtonElement;
    expect(input).toBeTruthy();
    expect(loadBtn).toBeTruthy();

    input.value = '';
    loadBtn.click();

    expect(input.getAttribute('aria-invalid')).toBe('true');
    const stateEl = document.querySelector('[data-testid="shotgrid-state"]') as HTMLElement;
    expect(stateEl.style.display).not.toBe('none');
    expect(stateEl.textContent).toContain('required');
  });

  it('#96-2: shows error and aria-invalid for invalid ID', () => {
    const input = document.querySelector('[data-testid="shotgrid-query-input"]') as HTMLInputElement;
    const loadBtn = document.querySelector('[data-testid="shotgrid-load-btn"]') as HTMLButtonElement;

    input.value = '-5';
    loadBtn.click();

    expect(input.getAttribute('aria-invalid')).toBe('true');
    const stateEl = document.querySelector('[data-testid="shotgrid-state"]') as HTMLElement;
    expect(stateEl.textContent).toContain('Invalid');
  });
});

// ============================================================
// Issue #97: TimelineContextMenu Ctrl+C shortcut removed
// ============================================================
import { TimelineContextMenu, type TimelineContextMenuOptions } from './TimelineContextMenu';

function makeContextMenuOptions(overrides: Partial<TimelineContextMenuOptions> = {}): TimelineContextMenuOptions {
  return {
    x: 100,
    y: 100,
    frame: 42,
    frameLabel: 'Frame 42',
    timecode: '00:00:01:18',
    sourceName: 'clip.mp4',
    sourceResolution: '1920x1080',
    sourceType: 'video',
    markerAtFrame: null,
    hasCustomInOut: false,
    inPoint: 1,
    outPoint: 100,
    onGoToFrame: vi.fn(),
    onSetInPoint: vi.fn(),
    onSetOutPoint: vi.fn(),
    onResetInOutPoints: vi.fn(),
    onToggleMark: vi.fn(),
    onRemoveMark: vi.fn(),
    onCopyTimecode: vi.fn(),
    ...overrides,
  };
}

describe('Issue #97: TimelineContextMenu Copy Timecode shortcut removed', () => {
  let menu: TimelineContextMenu;

  afterEach(() => {
    menu?.dispose();
    document.querySelectorAll('.timeline-main-context-menu').forEach((el) => el.remove());
  });

  it('#97-1: Copy Timecode menu item does NOT show a shortcut hint', () => {
    menu = new TimelineContextMenu();
    menu.show(makeContextMenuOptions());

    const menuItems = document.querySelectorAll('.timeline-main-context-menu [role="menuitem"]');
    let copyTimecodeItem: Element | null = null;
    menuItems.forEach((item) => {
      if (item.textContent?.includes('Copy Timecode')) {
        copyTimecodeItem = item;
      }
    });

    expect(copyTimecodeItem).toBeTruthy();
    // Should have only one child span (the label), no shortcut span
    const spans = copyTimecodeItem!.querySelectorAll('span');
    expect(spans.length).toBe(1);
    expect(spans[0]!.textContent).toBe('Copy Timecode');
    // Confirm no Ctrl+C text anywhere in the item
    expect(copyTimecodeItem!.textContent).not.toContain('Ctrl+C');
  });
});

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
