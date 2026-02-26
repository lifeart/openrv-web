import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LayoutOrchestrator, type LayoutOrchestratorDeps } from './LayoutOrchestrator';

// ---------------------------------------------------------------------------
// Lightweight test doubles
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

function createMockElement(tag = 'div'): HTMLElement {
  const el = document.createElement(tag);
  return el;
}

function createMockSession() {
  const et = createEventTarget();
  return {
    ...et,
    isSingleImage: false,
    currentFrame: 0,
    currentSource: { name: 'test.exr', width: 1920, height: 1080, duration: 100 },
    metadata: { displayName: 'test.exr' },
    fps: 24,
    currentAB: 'A',
  };
}

function createMockViewer() {
  const containerEl = createMockElement();
  const viewerEl = createMockElement();
  return {
    getElement: vi.fn().mockReturnValue(viewerEl),
    getContainer: vi.fn().mockReturnValue(containerEl),
    resize: vi.fn(),
    onCursorColorChange: vi.fn(),
    _element: viewerEl,
    _container: containerEl,
  };
}

function createMockHeaderBar() {
  const containerEl = createMockElement();
  const renderEl = createMockElement();
  return {
    render: vi.fn().mockReturnValue(renderEl),
    getContainer: vi.fn().mockReturnValue(containerEl),
    setFullscreenState: vi.fn(),
    setImageMode: vi.fn(),
    setActiveLayoutPreset: vi.fn(),
    _renderEl: renderEl,
  };
}

function createMockTabBar() {
  const et = createEventTarget();
  const containerEl = createMockElement();
  const renderEl = createMockElement();
  return {
    ...et,
    render: vi.fn().mockReturnValue(renderEl),
    getContainer: vi.fn().mockReturnValue(containerEl),
    getButtons: vi.fn().mockReturnValue([]),
    _renderEl: renderEl,
  };
}

function createMockContextToolbar() {
  const containerEl = createMockElement();
  const renderEl = createMockElement();
  return {
    render: vi.fn().mockReturnValue(renderEl),
    getContainer: vi.fn().mockReturnValue(containerEl),
    _renderEl: renderEl,
  };
}

function createMockTimeline() {
  const renderEl = createMockElement();
  return {
    render: vi.fn().mockReturnValue(renderEl),
    _renderEl: renderEl,
  };
}

function createMockLayoutManager() {
  const et = createEventTarget();
  const rootEl = createMockElement();
  const topEl = createMockElement();
  const viewerSlot = createMockElement();
  const bottomSlot = createMockElement();
  return {
    ...et,
    getElement: vi.fn().mockReturnValue(rootEl),
    getTopSection: vi.fn().mockReturnValue(topEl),
    getViewerSlot: vi.fn().mockReturnValue(viewerSlot),
    getBottomSlot: vi.fn().mockReturnValue(bottomSlot),
    addPanelTab: vi.fn(),
    _rootEl: rootEl,
    _topEl: topEl,
    _viewerSlot: viewerSlot,
    _bottomSlot: bottomSlot,
  };
}

function createMockLayoutStore() {
  const et = createEventTarget();
  return {
    ...et,
  };
}

function createMockControls() {
  const paintToolbarEl = createMockElement();
  return {
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
    paintToolbar: {
      render: vi.fn().mockReturnValue(paintToolbarEl),
      setAnnotationVersion: vi.fn(),
    },
    presentationMode: createEventTarget() as ReturnType<typeof createEventTarget> & {
      setElementsToHide: ReturnType<typeof vi.fn>;
    },
    sphericalProjection: {
      enabled: false,
      enable: vi.fn(),
      disable: vi.fn(),
    },
    setupTabContents: vi.fn(),
    _paintToolbarEl: paintToolbarEl,
  };
}

function createMockSessionBridge() {
  return {
    setHistogramDataCallback: vi.fn(),
    bindSessionEvents: vi.fn(),
  };
}

function createMockClientMode() {
  const et = createEventTarget();
  return {
    ...et,
    isEnabled: vi.fn().mockReturnValue(false),
    getRestrictedElements: vi.fn().mockReturnValue([
      '[data-panel="color"]',
      '[data-panel="effects"]',
    ]),
  };
}

function createMockPaintEngine() {
  return {
    clearFrame: vi.fn(),
  };
}

function createMockCustomKeyBindingsManager() {
  return {
    getBindings: vi.fn().mockReturnValue([]),
    setBinding: vi.fn(),
    removeBinding: vi.fn(),
    applyCustomBindings: vi.fn(),
  };
}

function createDeps(): {
  deps: LayoutOrchestratorDeps;
  mocks: {
    container: HTMLElement;
    session: ReturnType<typeof createMockSession>;
    viewer: ReturnType<typeof createMockViewer>;
    headerBar: ReturnType<typeof createMockHeaderBar>;
    tabBar: ReturnType<typeof createMockTabBar>;
    contextToolbar: ReturnType<typeof createMockContextToolbar>;
    timeline: ReturnType<typeof createMockTimeline>;
    layoutManager: ReturnType<typeof createMockLayoutManager>;
    layoutStore: ReturnType<typeof createMockLayoutStore>;
    controls: ReturnType<typeof createMockControls>;
    sessionBridge: ReturnType<typeof createMockSessionBridge>;
    clientMode: ReturnType<typeof createMockClientMode>;
    paintEngine: ReturnType<typeof createMockPaintEngine>;
    customKeyBindingsManager: ReturnType<typeof createMockCustomKeyBindingsManager>;
  };
} {
  const container = createMockElement();
  const session = createMockSession();
  const viewer = createMockViewer();
  const headerBar = createMockHeaderBar();
  const tabBar = createMockTabBar();
  const contextToolbar = createMockContextToolbar();
  const timeline = createMockTimeline();
  const layoutManager = createMockLayoutManager();
  const layoutStore = createMockLayoutStore();
  const controls = createMockControls();
  const sessionBridge = createMockSessionBridge();
  const clientMode = createMockClientMode();
  const paintEngine = createMockPaintEngine();
  const customKeyBindingsManager = createMockCustomKeyBindingsManager();

  // Add setElementsToHide to presentationMode mock
  (controls.presentationMode as unknown as Record<string, unknown>).setElementsToHide = vi.fn();

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

  return {
    deps,
    mocks: {
      container,
      session,
      viewer,
      headerBar,
      tabBar,
      contextToolbar,
      timeline,
      layoutManager,
      layoutStore,
      controls,
      sessionBridge,
      clientMode,
      paintEngine,
      customKeyBindingsManager,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LayoutOrchestrator', () => {
  let d: ReturnType<typeof createDeps>;
  let orchestrator: LayoutOrchestrator;

  beforeEach(() => {
    d = createDeps();
    orchestrator = new LayoutOrchestrator(d.deps);
  });

  afterEach(() => {
    orchestrator.dispose();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // LO-001: createLayout builds expected DOM structure
  // -------------------------------------------------------------------------
  it('LO-001: createLayout appends skip link and layout root to container', () => {
    orchestrator.createLayout();

    const children = Array.from(d.mocks.container.children);
    // Should have at least: skip link + layout root
    expect(children.length).toBeGreaterThanOrEqual(2);
    // First child is skip link (an anchor)
    expect(children[0]!.tagName).toBe('A');
    expect(children[0]!.textContent).toBe('Skip to main content');
  });

  it('LO-002: createLayout places header, tabbar, context toolbar in top section', () => {
    orchestrator.createLayout();

    const topSection = d.mocks.layoutManager._topEl;
    const children = Array.from(topSection.children);
    expect(children).toContain(d.mocks.headerBar._renderEl);
    expect(children).toContain(d.mocks.tabBar._renderEl);
    expect(children).toContain(d.mocks.contextToolbar._renderEl);
  });

  it('LO-003: createLayout places viewer in viewer slot', () => {
    orchestrator.createLayout();

    const viewerSlot = d.mocks.layoutManager._viewerSlot;
    expect(viewerSlot.contains(d.mocks.viewer._element)).toBe(true);
  });

  it('LO-004: createLayout places timeline in bottom slot', () => {
    orchestrator.createLayout();

    const bottomSlot = d.mocks.layoutManager._bottomSlot;
    expect(bottomSlot.contains(d.mocks.timeline._renderEl)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // LO-005: fullscreenManager is accessible after createLayout
  // -------------------------------------------------------------------------
  it('LO-005: fullscreenManager is accessible after createLayout', () => {
    expect(orchestrator.fullscreenManager).toBeNull();
    orchestrator.createLayout();
    expect(orchestrator.fullscreenManager).not.toBeNull();
    expect(orchestrator.fullscreenManager).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // LO-006: focusManager is accessible after createLayout
  // -------------------------------------------------------------------------
  it('LO-006: focusManager is accessible after createLayout', () => {
    expect(orchestrator.focusManager).toBeNull();
    orchestrator.createLayout();
    expect(orchestrator.focusManager).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // LO-007: shortcutCheatSheet is accessible after createLayout
  // -------------------------------------------------------------------------
  it('LO-007: shortcutCheatSheet is accessible after createLayout', () => {
    expect(orchestrator.shortcutCheatSheet).toBeNull();
    orchestrator.createLayout();
    expect(orchestrator.shortcutCheatSheet).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // LO-008: ariaAnnouncer setup and session announcements
  // -------------------------------------------------------------------------
  it('LO-008: ariaAnnouncer is created and announces tab changes', () => {
    orchestrator.createLayout();
    expect(orchestrator.ariaAnnouncer).not.toBeNull();

    // Spy on announce
    const announceSpy = vi.spyOn(orchestrator.ariaAnnouncer!, 'announce');

    // Emit tabChanged
    d.mocks.tabBar._emit('tabChanged', 'color');
    expect(announceSpy).toHaveBeenCalledWith('Color tab');
  });

  it('LO-009: ariaAnnouncer announces file loaded', () => {
    orchestrator.createLayout();
    const announceSpy = vi.spyOn(orchestrator.ariaAnnouncer!, 'announce');

    d.mocks.session._emit('sourceLoaded', { name: 'test.exr', width: 1920, height: 1080 });
    expect(announceSpy).toHaveBeenCalledWith('File loaded: test.exr');
  });

  it('LO-010: ariaAnnouncer announces playback state changes', () => {
    orchestrator.createLayout();
    const announceSpy = vi.spyOn(orchestrator.ariaAnnouncer!, 'announce');

    d.mocks.session._emit('playbackChanged', true);
    expect(announceSpy).toHaveBeenCalledWith('Playback started');

    d.mocks.session._emit('playbackChanged', false);
    expect(announceSpy).toHaveBeenCalledWith('Playback paused');
  });

  it('LO-011: ariaAnnouncer announces playback speed changes', () => {
    orchestrator.createLayout();
    const announceSpy = vi.spyOn(orchestrator.ariaAnnouncer!, 'announce');

    d.mocks.session._emit('playbackSpeedChanged', 2);
    expect(announceSpy).toHaveBeenCalledWith('Playback speed: 2x');
  });

  // -------------------------------------------------------------------------
  // LO-012: a11y setup - viewer ARIA attributes
  // -------------------------------------------------------------------------
  it('LO-012: sets viewer ARIA attributes correctly', () => {
    orchestrator.createLayout();
    const viewerEl = d.mocks.viewer._element;
    expect(viewerEl.id).toBe('main-content');
    expect(viewerEl.getAttribute('role')).toBe('main');
    expect(viewerEl.getAttribute('aria-label')).toBe('Image viewer');
    expect(viewerEl.getAttribute('tabindex')).toBe('0');
  });

  // -------------------------------------------------------------------------
  // LO-013: Client mode restrictions
  // -------------------------------------------------------------------------
  it('LO-013: applies client mode restrictions when enabled at creation', () => {
    d.mocks.clientMode.isEnabled.mockReturnValue(true);

    // Add elements matching restricted selectors
    const restricted = document.createElement('div');
    restricted.setAttribute('data-panel', 'color');
    d.mocks.container.appendChild(restricted);

    orchestrator.createLayout();

    expect(restricted.style.display).toBe('none');
  });

  it('LO-014: applies client mode restrictions on stateChanged event', () => {
    orchestrator.createLayout();

    // Add restricted element
    const restricted = document.createElement('div');
    restricted.setAttribute('data-panel', 'effects');
    d.mocks.container.appendChild(restricted);

    // Emit stateChanged
    d.mocks.clientMode._emit('stateChanged', { enabled: true, locked: false, source: 'api' });

    expect(restricted.style.display).toBe('none');
  });

  // -------------------------------------------------------------------------
  // LO-015: dispose cleans up sub-objects
  // -------------------------------------------------------------------------
  it('LO-015: dispose nulls out sub-objects', () => {
    orchestrator.createLayout();

    // Verify they exist
    expect(orchestrator.fullscreenManager).not.toBeNull();
    expect(orchestrator.focusManager).not.toBeNull();
    expect(orchestrator.shortcutCheatSheet).not.toBeNull();
    expect(orchestrator.ariaAnnouncer).not.toBeNull();

    orchestrator.dispose();

    expect(orchestrator.fullscreenManager).toBeNull();
    expect(orchestrator.focusManager).toBeNull();
    expect(orchestrator.shortcutCheatSheet).toBeNull();
    expect(orchestrator.ariaAnnouncer).toBeNull();
  });

  it('LO-016: dispose clears image transition timer', () => {
    orchestrator.createLayout();

    // Trigger image mode to set a timer
    d.mocks.session.isSingleImage = true;
    d.mocks.session._emit('sourceLoaded', { name: 'test.jpg', width: 100, height: 100, duration: 0 });

    expect(orchestrator.imageTransitionTimer).not.toBeNull();

    orchestrator.dispose();

    expect(orchestrator.imageTransitionTimer).toBeNull();
  });

  it('LO-017: dispose unsubscribes session event handlers', () => {
    orchestrator.createLayout();

    // Count how many times session.on was called
    const onCallCount = d.mocks.session.on.mock.calls.length;
    expect(onCallCount).toBeGreaterThan(0);

    orchestrator.dispose();

    // session.off should have been called for each tracked handler
    expect(d.mocks.session.off.mock.calls.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // LO-018: Image mode transitions
  // -------------------------------------------------------------------------
  it('LO-018: image mode hides timeline when session is single image', () => {
    orchestrator.createLayout();
    const timelineEl = d.mocks.timeline._renderEl;

    d.mocks.session.isSingleImage = true;
    d.mocks.session._emit('sourceLoaded', { name: 'img.exr', width: 100, height: 100 });

    expect(timelineEl.style.opacity).toBe('0');
    expect(timelineEl.style.pointerEvents).toBe('none');
    expect(timelineEl.getAttribute('aria-hidden')).toBe('true');
  });

  it('LO-019: image mode shows timeline when not single image', () => {
    orchestrator.createLayout();
    const timelineEl = d.mocks.timeline._renderEl;

    // First set to image mode
    d.mocks.session.isSingleImage = true;
    d.mocks.session._emit('sourceLoaded', { name: 'img.exr', width: 100, height: 100 });

    // Then switch back to video
    d.mocks.session.isSingleImage = false;
    d.mocks.session._emit('durationChanged');

    expect(timelineEl.style.opacity).toBe('1');
    expect(timelineEl.style.display).toBe('');
  });

  // -------------------------------------------------------------------------
  // LO-020: Layout store integration
  // -------------------------------------------------------------------------
  it('LO-020: presetApplied from layout store updates header and panels', () => {
    orchestrator.createLayout();

    d.mocks.layoutStore._emit('presetApplied', 'review');

    expect(d.mocks.headerBar.setActiveLayoutPreset).toHaveBeenCalledWith('review');
    expect(d.mocks.controls.rightPanelContent.setPresetMode).toHaveBeenCalledWith('review');
    expect(d.mocks.controls.leftPanelContent.setPresetMode).toHaveBeenCalledWith('review');
  });

  // -------------------------------------------------------------------------
  // LO-021: Session bridge binding
  // -------------------------------------------------------------------------
  it('LO-021: calls sessionBridge.bindSessionEvents during createLayout', () => {
    orchestrator.createLayout();
    expect(d.mocks.sessionBridge.bindSessionEvents).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // LO-022: Viewer overlays
  // -------------------------------------------------------------------------
  it('LO-022: appends overlay controls to viewer container', () => {
    orchestrator.createLayout();
    const viewerContainer = d.mocks.viewer._container;

    // histogram, waveform, curves, vectorscope, gamutDiagram, historyPanel, infoPanel, markerListPanel, notePanel
    expect(viewerContainer.childElementCount).toBeGreaterThanOrEqual(9);
  });

  // -------------------------------------------------------------------------
  // LO-023: Panel registration
  // -------------------------------------------------------------------------
  it('LO-023: registers right and left panel tabs in layout manager', () => {
    orchestrator.createLayout();

    expect(d.mocks.layoutManager.addPanelTab).toHaveBeenCalledWith('right', 'Inspector', expect.any(HTMLElement));
    expect(d.mocks.layoutManager.addPanelTab).toHaveBeenCalledWith('left', 'Color Tools', expect.any(HTMLElement));
  });

  // -------------------------------------------------------------------------
  // LO-024: setupTabContents delegation
  // -------------------------------------------------------------------------
  it('LO-024: delegates to controls.setupTabContents', () => {
    orchestrator.createLayout();
    expect(d.mocks.controls.setupTabContents).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // LO-025: Presentation mode elements to hide
  // -------------------------------------------------------------------------
  it('LO-025: sets elements to hide in presentation mode', () => {
    orchestrator.createLayout();
    const setFn = (d.mocks.controls.presentationMode as unknown as Record<string, ReturnType<typeof vi.fn>>).setElementsToHide!;
    expect(setFn).toHaveBeenCalledTimes(1);
    const args = (setFn as ReturnType<typeof vi.fn>).mock.calls[0]![0] as HTMLElement[];
    expect(args.length).toBe(5);
  });

  // -------------------------------------------------------------------------
  // LO-026: 360 content auto-detection
  // -------------------------------------------------------------------------
  it('LO-026: enables spherical projection for 2:1 aspect ratio sources', () => {
    orchestrator.createLayout();

    d.mocks.controls.sphericalProjection.enabled = false;
    // 360 content typically has 2:1 aspect ratio
    d.mocks.session._emit('sourceLoaded', { name: 'pano.jpg', width: 4096, height: 2048 });

    expect(d.mocks.controls.sphericalProjection.enable).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // LO-027: Histogram data callback
  // -------------------------------------------------------------------------
  it('LO-027: wires histogram data callback to right panel', () => {
    orchestrator.createLayout();

    expect(d.mocks.sessionBridge.setHistogramDataCallback).toHaveBeenCalledWith(expect.any(Function));

    // Get the callback and test it
    const cb = d.mocks.sessionBridge.setHistogramDataCallback.mock.calls[0][0] as (data: unknown) => void;
    const fakeData = { r: [], g: [], b: [] };
    cb(fakeData);
    expect(d.mocks.controls.rightPanelContent.updateHistogram).toHaveBeenCalledWith(fakeData);
  });

  // -------------------------------------------------------------------------
  // LO-028: Right panel info wiring
  // -------------------------------------------------------------------------
  it('LO-028: updates right panel info on frameChanged', () => {
    orchestrator.createLayout();

    d.mocks.session._emit('frameChanged');

    expect(d.mocks.controls.rightPanelContent.updateInfo).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // LO-029: A/B source sync
  // -------------------------------------------------------------------------
  it('LO-029: syncs annotation version on abSourceChanged', () => {
    orchestrator.createLayout();

    d.mocks.session.currentAB = 'B';
    d.mocks.session._emit('abSourceChanged');

    expect(d.mocks.controls.paintToolbar.setAnnotationVersion).toHaveBeenCalledWith('B');
  });

  // -------------------------------------------------------------------------
  // LO-030: Presentation mode exit re-asserts image mode
  // -------------------------------------------------------------------------
  it('LO-030a: dispose() on freshly constructed orchestrator (no createLayout) does not throw', () => {
    const fresh = new LayoutOrchestrator(d.deps);
    expect(() => fresh.dispose()).not.toThrow();
    // All sub-objects should still be null
    expect(fresh.fullscreenManager).toBeNull();
    expect(fresh.focusManager).toBeNull();
    expect(fresh.shortcutCheatSheet).toBeNull();
    expect(fresh.ariaAnnouncer).toBeNull();
  });

  it('LO-030: re-asserts image mode after exiting presentation mode', () => {
    orchestrator.createLayout();
    d.mocks.session.isSingleImage = true;
    const timelineEl = d.mocks.timeline._renderEl;

    // Simulate exiting presentation mode
    d.mocks.controls.presentationMode._emit('stateChanged', { enabled: false });

    expect(timelineEl.style.display).toBe('none');
    expect(d.mocks.headerBar.setImageMode).toHaveBeenCalledWith(true);
  });
});
