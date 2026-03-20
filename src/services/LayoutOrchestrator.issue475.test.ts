/**
 * Regression tests for Issue #475:
 * Verify that comparison annotations are keyed to A/B slots, not to the
 * underlying media source identity. This validates:
 * 1. ABCompareManager uses slot-based state ('A'|'B'), not source identity
 * 2. LayoutOrchestrator forwards session.currentAB for annotation routing
 * 3. The docs accurately reflect slot-based annotation behavior
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ABCompareManager } from '../core/session/ABCompareManager';
import { LayoutOrchestrator, type LayoutOrchestratorDeps } from './LayoutOrchestrator';
// @ts-ignore -- Node modules available in test environment
import { readFileSync } from 'fs';
// @ts-ignore -- Node modules available in test environment
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// ABCompareManager: slot-based state tests
// ---------------------------------------------------------------------------

describe('Issue #475: ABCompareManager uses slot-based state', () => {
  let manager: ABCompareManager;

  beforeEach(() => {
    manager = new ABCompareManager();
  });

  it('currentAB returns slot labels A or B, not source identifiers', () => {
    // Initial state is slot 'A'
    expect(manager.currentAB).toBe('A');

    manager.onSourceAdded(1);
    manager.onSourceAdded(2);
    manager.toggle(2);

    // After toggle, state is slot 'B' — not a source name, path, or id
    expect(manager.currentAB).toBe('B');
    expect(['A', 'B']).toContain(manager.currentAB);
  });

  it('emitChanged reports slot label, not source identity', () => {
    const onChanged = vi.fn();
    manager.setCallbacks({ onABSourceChanged: onChanged });

    manager.onSourceAdded(1);
    manager.onSourceAdded(2);

    // Emit while on slot A
    manager.emitChanged(0);
    expect(onChanged).toHaveBeenCalledWith({
      current: 'A',
      sourceIndex: 0,
    });

    // Toggle to B and emit
    manager.toggle(2);
    manager.emitChanged(1);
    expect(onChanged).toHaveBeenCalledWith({
      current: 'B',
      sourceIndex: 1,
    });
  });

  it('swapping source assignments does not change slot state', () => {
    manager.onSourceAdded(1);
    manager.onSourceAdded(2);
    manager.onSourceAdded(3);

    // Currently on slot A, source A = index 0, source B = index 1
    expect(manager.currentAB).toBe('A');
    expect(manager.sourceAIndex).toBe(0);
    expect(manager.sourceBIndex).toBe(1);

    // Reassign: slot A now points to source index 2, slot B to source index 0
    manager.setSourceA(2, 3);
    manager.setSourceB(0, 3);

    // Slot state is still 'A' — it doesn't track which media is where
    expect(manager.currentAB).toBe('A');
    expect(manager.sourceAIndex).toBe(2);
    expect(manager.sourceBIndex).toBe(0);
  });

  it('activeSourceIndex resolves through current slot, not source identity', () => {
    manager.onSourceAdded(1);
    manager.onSourceAdded(2);
    manager.onSourceAdded(3);

    // Reassign slot A to source index 2
    manager.setSourceA(2, 3);

    // On slot A, activeSourceIndex should be 2 (the new A assignment)
    expect(manager.currentAB).toBe('A');
    expect(manager.activeSourceIndex).toBe(2);

    // Toggle to slot B
    manager.toggle(3);
    expect(manager.currentAB).toBe('B');
    expect(manager.activeSourceIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// LayoutOrchestrator: annotation version forwarding
// ---------------------------------------------------------------------------

type EventHandler = (...args: unknown[]) => void;

function createEventTarget() {
  const handlers = new Map<string, EventHandler[]>();
  return {
    on: vi.fn().mockImplementation((event: string, handler: EventHandler) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
      return () => {
        const list = handlers.get(event);
        if (list) {
          const idx = list.indexOf(handler);
          if (idx >= 0) list.splice(idx, 1);
        }
      };
    }),
    off: vi.fn().mockImplementation((event: string, handler: EventHandler) => {
      const list = handlers.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      }
    }),
    _emit(event: string, ...args: unknown[]) {
      const list = handlers.get(event);
      if (list) {
        for (const h of [...list]) h(...args);
      }
    },
    _handlers: handlers,
  };
}

function createMockElement(): HTMLElement {
  return document.createElement('div');
}

function buildDeps() {
  const container = createMockElement();

  const session = {
    ...createEventTarget(),
    isSingleImage: false,
    currentFrame: 0,
    currentSource: { name: 'test.exr', width: 1920, height: 1080, duration: 100 },
    metadata: { displayName: 'test.exr' },
    fps: 24,
    currentAB: 'A' as string,
  };

  const viewerContainer = createMockElement();
  const viewerEl = createMockElement();
  const viewer = {
    getElement: vi.fn().mockReturnValue(viewerEl),
    getContainer: vi.fn().mockReturnValue(viewerContainer),
    resize: vi.fn(),
    onCursorColorChange: vi.fn(),
  };

  const headerBarEl = createMockElement();
  const headerBar = {
    render: vi.fn().mockReturnValue(headerBarEl),
    getContainer: vi.fn().mockReturnValue(createMockElement()),
    setFullscreenState: vi.fn(),
    setImageMode: vi.fn(),
    setActiveLayoutPreset: vi.fn(),
  };

  const tabBarEl = createMockElement();
  const tabBar = {
    ...createEventTarget(),
    render: vi.fn().mockReturnValue(tabBarEl),
    getContainer: vi.fn().mockReturnValue(createMockElement()),
    getButtons: vi.fn().mockReturnValue([]),
  };

  const ctxEl = createMockElement();
  const contextToolbar = {
    render: vi.fn().mockReturnValue(ctxEl),
    getContainer: vi.fn().mockReturnValue(createMockElement()),
  };

  const timeline = { render: vi.fn().mockReturnValue(createMockElement()) };

  const layoutManager = {
    ...createEventTarget(),
    getElement: vi.fn().mockReturnValue(createMockElement()),
    getTopSection: vi.fn().mockReturnValue(createMockElement()),
    getViewerSlot: vi.fn().mockReturnValue(createMockElement()),
    getBottomSlot: vi.fn().mockReturnValue(createMockElement()),
    getPanelWrapper: vi.fn().mockReturnValue(createMockElement()),
    addPanelTab: vi.fn(),
  };

  const layoutStore = createEventTarget();

  const paintToolbarEl = createMockElement();
  const paintToolbar = {
    render: vi.fn().mockReturnValue(paintToolbarEl),
    setAnnotationVersion: vi.fn(),
  };

  const presentationMode = {
    ...createEventTarget(),
    setElementsToHide: vi.fn(),
  };

  const controls = {
    cacheIndicator: { getElement: vi.fn().mockReturnValue(createMockElement()) },
    rightPanelContent: {
      getElement: vi.fn().mockReturnValue(createMockElement()),
      updateHistogram: vi.fn(),
      updateInfo: vi.fn(),
      setPresetMode: vi.fn(),
    },
    leftPanelContent: {
      getElement: vi.fn().mockReturnValue(createMockElement()),
      setPresetMode: vi.fn(),
    },
    histogram: { render: vi.fn().mockReturnValue(createMockElement()) },
    waveform: { render: vi.fn().mockReturnValue(createMockElement()) },
    curvesControl: { render: vi.fn().mockReturnValue(createMockElement()) },
    vectorscope: { render: vi.fn().mockReturnValue(createMockElement()) },
    gamutDiagram: { render: vi.fn().mockReturnValue(createMockElement()) },
    historyPanel: { getElement: vi.fn().mockReturnValue(createMockElement()) },
    infoPanel: {
      getElement: vi.fn().mockReturnValue(createMockElement()),
      isEnabled: vi.fn().mockReturnValue(false),
      update: vi.fn(),
    },
    markerListPanel: { getElement: vi.fn().mockReturnValue(createMockElement()) },
    notePanel: { getElement: vi.fn().mockReturnValue(createMockElement()) },
    paintToolbar,
    presentationMode,
    sphericalProjection: {
      enabled: false,
      enable: vi.fn(),
      disable: vi.fn(),
      onEnabledChange: vi.fn(),
    },
    setupTabContents: vi.fn(),
  };

  const sessionBridge = {
    setHistogramDataCallback: vi.fn(),
    bindSessionEvents: vi.fn(),
  };

  const clientMode = {
    ...createEventTarget(),
    isEnabled: vi.fn().mockReturnValue(false),
    getRestrictedElements: vi.fn().mockReturnValue([]),
  };

  const paintEngine = {
    clearFrame: vi.fn(),
    sourceIndex: undefined as number | undefined,
  };

  const customKeyBindingsManager = {
    getBindings: vi.fn().mockReturnValue([]),
    setBinding: vi.fn(),
    removeBinding: vi.fn(),
    applyCustomBindings: vi.fn(),
  };

  const deps: LayoutOrchestratorDeps = {
    container,
    session: session as unknown as LayoutOrchestratorDeps['session'],
    viewer: viewer as unknown as LayoutOrchestratorDeps['viewer'],
    headerBar: headerBar as unknown as LayoutOrchestratorDeps['headerBar'],
    tabBar: tabBar as unknown as LayoutOrchestratorDeps['tabBar'],
    contextToolbar: contextToolbar as unknown as LayoutOrchestratorDeps['contextToolbar'],
    timeline: timeline as unknown as LayoutOrchestratorDeps['timeline'],
    layoutManager: layoutManager as unknown as LayoutOrchestratorDeps['layoutManager'],
    layoutStore: layoutStore as unknown as LayoutOrchestratorDeps['layoutStore'],
    controls: controls as unknown as LayoutOrchestratorDeps['controls'],
    sessionBridge: sessionBridge as unknown as LayoutOrchestratorDeps['sessionBridge'],
    clientMode: clientMode as unknown as LayoutOrchestratorDeps['clientMode'],
    paintEngine: paintEngine as unknown as LayoutOrchestratorDeps['paintEngine'],
    customKeyBindingsManager: customKeyBindingsManager as unknown as LayoutOrchestratorDeps['customKeyBindingsManager'],
  };

  return { deps, session, paintToolbar, paintEngine };
}

describe('Issue #475: LayoutOrchestrator forwards currentAB for annotation routing', () => {
  let orchestrator: LayoutOrchestrator;
  let parts: ReturnType<typeof buildDeps>;

  beforeEach(() => {
    parts = buildDeps();
    orchestrator = new LayoutOrchestrator(parts.deps);
  });

  afterEach(() => {
    orchestrator.dispose();
    vi.restoreAllMocks();
  });

  it('forwards session.currentAB slot label to paintToolbar.setAnnotationVersion on abSourceChanged', () => {
    orchestrator.createLayout();

    // Simulate switching to slot B
    parts.session.currentAB = 'B';
    parts.session._emit('abSourceChanged', { current: 'B', sourceIndex: 1 });

    expect(parts.paintToolbar.setAnnotationVersion).toHaveBeenCalledWith('B');
  });

  it('forwards slot A label when switching back to A', () => {
    orchestrator.createLayout();

    // Switch to B then back to A
    parts.session.currentAB = 'B';
    parts.session._emit('abSourceChanged', { current: 'B', sourceIndex: 1 });

    parts.session.currentAB = 'A';
    parts.session._emit('abSourceChanged', { current: 'A', sourceIndex: 0 });

    expect(parts.paintToolbar.setAnnotationVersion).toHaveBeenLastCalledWith('A');
  });

  it('uses session.currentAB (slot label) not the sourceIndex from the event payload', () => {
    orchestrator.createLayout();

    // Even when the sourceIndex changes, the annotation version is the slot label
    parts.session.currentAB = 'A';
    parts.session._emit('abSourceChanged', { current: 'A', sourceIndex: 5 });

    // setAnnotationVersion receives the slot label 'A', not 5
    expect(parts.paintToolbar.setAnnotationVersion).toHaveBeenCalledWith('A');
  });

  it('sets paintEngine.sourceIndex from event info for recording source provenance', () => {
    orchestrator.createLayout();

    parts.session.currentAB = 'B';
    parts.session._emit('abSourceChanged', { current: 'B', sourceIndex: 3 });

    expect(parts.paintEngine.sourceIndex).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Documentation accuracy
// ---------------------------------------------------------------------------

// These doc-content string-matching tests are intentional regression guards for
// issue #475 — they ensure the advanced-compare docs stay consistent with the
// slot-based annotation behavior. If the docs are reworded, update the expected
// strings here to match. (Same pattern used for issue #472 doc guards.)
describe('Issue #475: advanced-compare docs reflect slot-based annotation behavior', () => {
  // @ts-ignore -- __dirname available in test environment
  const docPath = resolve(__dirname, '..', '..', 'docs', 'compare', 'advanced-compare.md');
  let docContent: string;

  beforeEach(() => {
    docContent = readFileSync(docPath, 'utf-8');
  });

  it('docs state annotations are keyed to the A/B slot, not the source', () => {
    expect(docContent).toContain('keyed to the A/B slot assignment');
    expect(docContent).toContain('not to the underlying media source');
  });

  it('docs do NOT claim annotations are tied to the source', () => {
    expect(docContent).not.toContain('tied to the source they were drawn on');
  });

  it('docs mention that swapping sources swaps visible annotations', () => {
    expect(docContent).toContain('swapping which source is assigned to slot A vs. slot B');
    expect(docContent).toContain('swap which annotations are visible');
  });
});
