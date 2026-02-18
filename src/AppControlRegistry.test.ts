import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so these are available in mock factories
const { disposeMocks, createMockClass } = vi.hoisted(() => {
  const disposeMocks: Record<string, ReturnType<typeof import('vitest')['vi']['fn']>> = {};

  function createMockClass(name: string) {
    const disposeFn = vi.fn();
    disposeMocks[name] = disposeFn;
    return class {
      dispose = disposeFn;
      render = vi.fn(() => document.createElement('div'));
      on = vi.fn(() => vi.fn());
      getState = vi.fn();
      setState = vi.fn();
      isActive = vi.fn(() => false);
      toggle = vi.fn();
      isEnabled = vi.fn(() => false);
      loadPreference = vi.fn();
      getSyncStateManager = vi.fn();
      setScopeVisible = vi.fn();
      setEyedropperCallback = vi.fn();
      deactivateEyedropper = vi.fn();
      createBadge = vi.fn(() => document.createElement('div'));
      setExclusiveWith = vi.fn();
      setTabContent = vi.fn();
    };
  }

  return { disposeMocks, createMockClass };
});

// --- Mocks only for controls that cannot run in jsdom ---
// Canvas 2D / WebGL dependencies in constructor:
vi.mock('./ui/components/Histogram', () => ({ Histogram: createMockClass('Histogram') }));
vi.mock('./ui/components/Waveform', () => ({ Waveform: createMockClass('Waveform') }));
vi.mock('./ui/components/Vectorscope', () => ({ Vectorscope: createMockClass('Vectorscope') }));
vi.mock('./ui/components/GamutDiagram', () => ({ GamutDiagram: createMockClass('GamutDiagram') }));
vi.mock('./ui/components/CurvesControl', () => ({ CurvesControl: createMockClass('CurvesControl') }));
vi.mock('./ui/components/CacheIndicator', () => ({ CacheIndicator: createMockClass('CacheIndicator') }));
// RightPanelContent transitively uses canvas via MiniHistogram:
vi.mock('./ui/layout/panels/RightPanelContent', () => ({ RightPanelContent: createMockClass('RightPanelContent') }));
// PaintToolbar / TextFormattingToolbar need a real PaintEngine with .on(), .brush, .color, etc.:
vi.mock('./ui/components/PaintToolbar', () => ({ PaintToolbar: createMockClass('PaintToolbar') }));
vi.mock('./ui/components/TextFormattingToolbar', () => ({ TextFormattingToolbar: createMockClass('TextFormattingToolbar') }));
// These controls call .on() / .isVisible() / .isEnabled() on their overlay arg during construction:
vi.mock('./ui/components/SafeAreasControl', () => ({ SafeAreasControl: createMockClass('SafeAreasControl') }));
vi.mock('./ui/components/FalseColorControl', () => ({ FalseColorControl: createMockClass('FalseColorControl') }));
vi.mock('./ui/components/LuminanceVisualizationControl', () => ({ LuminanceVisualizationControl: createMockClass('LuminanceVisualizationControl') }));
vi.mock('./ui/components/ZebraControl', () => ({ ZebraControl: createMockClass('ZebraControl') }));
vi.mock('./ui/components/HSLQualifierControl', () => ({ HSLQualifierControl: createMockClass('HSLQualifierControl') }));
// MarkerListPanel calls session.on() and session.marks in constructor:
vi.mock('./ui/components/MarkerListPanel', () => ({ MarkerListPanel: createMockClass('MarkerListPanel') }));
// NotePanel calls session.on() and session.noteManager in constructor:
vi.mock('./ui/components/NotePanel', () => ({ NotePanel: createMockClass('NotePanel') }));

import { AppControlRegistry } from './AppControlRegistry';

/**
 * Spy on a real control's dispose method and register it in disposeMocks
 * so the existing assertions continue to work identically.
 */
function spyOnDispose(registry: AppControlRegistry, field: string, name: string) {
  const control = (registry as any)[field];
  const originalDispose = control.dispose.bind(control);
  const spy = vi.fn(originalDispose);
  control.dispose = spy;
  disposeMocks[name] = spy;
}

/**
 * Names of controls that use real implementations (not mocked).
 * Map: disposeMocks name -> registry field name.
 */
const REAL_CONTROL_FIELDS: Record<string, string> = {
  // No-arg pure DOM controls
  ColorControls: 'colorControls',
  TransformControl: 'transformControl',
  FilterControl: 'filterControl',
  CropControl: 'cropControl',
  CDLControl: 'cdlControl',
  LensControl: 'lensControl',
  StackControl: 'stackControl',
  ChannelSelect: 'channelSelect',
  StereoControl: 'stereoControl',
  StereoEyeTransformControl: 'stereoEyeTransformControl',
  StereoAlignControl: 'stereoAlignControl',
  ZoomControl: 'zoomControl',
  ScopesControl: 'scopesControl',
  CompareControl: 'compareControl',
  GhostFrameControl: 'ghostFrameControl',
  PARControl: 'parControl',
  BackgroundPatternControl: 'backgroundPatternControl',
  OCIOControl: 'ocioControl',
  DisplayProfileControl: 'displayProfileControl',
  ColorInversionToggle: 'colorInversionToggle',
  ToneMappingControl: 'toneMappingControl',
  InfoPanel: 'infoPanel',
  NetworkControl: 'networkControl',
  DeinterlaceControl: 'deinterlaceControl',
  FilmEmulationControl: 'filmEmulationControl',
  GamutMappingControl: 'gamutMappingControl',
  AutoSaveIndicator: 'autoSaveIndicator',
  // Controls with trivially-satisfiable args
  HistoryPanel: 'historyPanel',
  SnapshotPanel: 'snapshotPanel',
  PlaylistPanel: 'playlistPanel',
  // Layout panel using real ColorControls + real HistoryManager
  LeftPanelContent: 'leftPanelContent',
  // Managers with trivial constructors
  SnapshotManager: 'snapshotManager',
  PlaylistManager: 'playlistManager',
  PresentationMode: 'presentationMode',
  NetworkSyncManager: 'networkSyncManager',
  AutoSaveManager: 'autoSaveManager',
};

/**
 * After constructing an AppControlRegistry with real implementations,
 * install dispose spies on all real controls so disposeMocks tracks them.
 */
function installDisposeSpies(registry: AppControlRegistry) {
  for (const [name, field] of Object.entries(REAL_CONTROL_FIELDS)) {
    spyOnDispose(registry, field, name);
  }
}

function createMockDeps() {
  return {
    session: { currentFrame: 1 } as any,
    viewer: {
      getSafeAreasOverlay: vi.fn(() => ({})),
      getFalseColor: vi.fn(() => ({})),
      getLuminanceVisualization: vi.fn(() => ({})),
      getZebraStripes: vi.fn(() => ({})),
      getHSLQualifier: vi.fn(() => ({})),
    } as any,
    paintEngine: {} as any,
    displayCapabilities: {} as any,
  };
}

describe('AppControlRegistry', () => {
  beforeEach(() => {
    // Reset all tracked dispose mocks before each test
    for (const key of Object.keys(disposeMocks)) {
      disposeMocks[key]!.mockClear();
    }
  });

  it('ACR-001: constructor creates all controls without throwing', () => {
    const deps = createMockDeps();
    expect(() => new AppControlRegistry(deps)).not.toThrow();
  });

  it('ACR-002: dispose() calls dispose on every control and manager', () => {
    const deps = createMockDeps();
    const registry = new AppControlRegistry(deps);
    installDisposeSpies(registry);

    registry.dispose();

    // Complete list of all controls/managers disposed in dispose() (source lines 545-592)
    const expectedDisposed = [
      'OCIOControl',
      'GhostFrameControl',
      'SafeAreasControl',
      'FalseColorControl',
      'LuminanceVisualizationControl',
      'ToneMappingControl',
      'ZebraControl',
      'HSLQualifierControl',
      'HistoryPanel',
      'InfoPanel',
      'MarkerListPanel',
      'NotePanel',
      'RightPanelContent',
      'LeftPanelContent',
      'CacheIndicator',
      'PaintToolbar',
      'ColorControls',
      'ZoomControl',
      'ScopesControl',
      'CompareControl',
      'TransformControl',
      'FilterControl',
      'CropControl',
      'CDLControl',
      'ColorInversionToggle',
      'DisplayProfileControl',
      'CurvesControl',
      'LensControl',
      'DeinterlaceControl',
      'FilmEmulationControl',
      'StackControl',
      'ChannelSelect',
      'PARControl',
      'BackgroundPatternControl',
      'StereoControl',
      'StereoEyeTransformControl',
      'StereoAlignControl',
      'Histogram',
      'Waveform',
      'Vectorscope',
      'TextFormattingToolbar',
      'AutoSaveIndicator',
      'SnapshotPanel',
      'SnapshotManager',
      'PlaylistPanel',
      'PlaylistManager',
      'PresentationMode',
      'NetworkSyncManager',
      'NetworkControl',
      'AutoSaveManager',
    ];

    // First check: collect any controls whose dispose was NOT called
    const notDisposed: string[] = [];
    for (const name of expectedDisposed) {
      const mock = disposeMocks[name];
      if (!mock || mock.mock.calls.length === 0) {
        notDisposed.push(name);
      }
    }
    expect(notDisposed).toEqual([]);

    // Second check: verify each dispose was called exactly once
    for (const name of expectedDisposed) {
      expect(disposeMocks[name], `${name}.dispose`).toHaveBeenCalledTimes(1);
    }
  });

  it('ACR-003: dispose() handles AutoSaveManager async dispose (returns promise)', () => {
    const deps = createMockDeps();
    const registry = new AppControlRegistry(deps);
    installDisposeSpies(registry);

    // AutoSaveManager.dispose returns a Promise - the code calls .catch() on it
    registry.dispose();

    const autoSaveDispose = disposeMocks['AutoSaveManager']!;
    expect(autoSaveDispose).toHaveBeenCalledTimes(1);
    // Verify it returned a promise (thenable)
    const result = autoSaveDispose.mock.results[0]!.value;
    expect(result).toBeInstanceOf(Promise);
  });

  describe('setupTabContents – panel toggle buttons in HeaderBar panels slot', () => {
    function createMockOverlay() {
      return { on: vi.fn(() => vi.fn()), toggle: vi.fn(), enable: vi.fn(), disable: vi.fn() };
    }

    function createSetupDeps() {
      const contextToolbar = { setTabContent: vi.fn() } as any;
      const viewer = {
        getSafeAreasOverlay: vi.fn(() => ({})),
        getFalseColor: vi.fn(() => createMockOverlay()),
        getLuminanceVisualization: vi.fn(() => ({})),
        getZebraStripes: vi.fn(() => ({})),
        getHSLQualifier: vi.fn(() => ({ pickColor: vi.fn() })),
        getSpotlightOverlay: vi.fn(() => createMockOverlay()),
        getPixelProbe: vi.fn(() => createMockOverlay()),
        getContainer: vi.fn(() => document.createElement('div')),
        getImageData: vi.fn(() => null),
        getClippingOverlay: vi.fn(() => ({ enable: vi.fn(), disable: vi.fn() })),
        getCanvasContainer: vi.fn(() => document.createElement('div')),
        getColorWheels: vi.fn(() => createMockOverlay()),
        refresh: vi.fn(),
      } as any;
      const sessionBridge = { updateInfoPanel: vi.fn() } as any;

      // Build a real panels-slot element so we can inspect its children
      const panelsSlot = document.createElement('div');
      panelsSlot.dataset.testid = 'panels-slot';
      const headerBar = {
        setPanelToggles: vi.fn((el: HTMLElement) => {
          panelsSlot.innerHTML = '';
          panelsSlot.appendChild(el);
        }),
        getPanelsSlot: vi.fn(() => panelsSlot),
      } as any;

      return { contextToolbar, viewer, sessionBridge, headerBar, panelsSlot };
    }

    it('ACR-004: panels slot receives panel toggle buttons after setupTabContents', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const { contextToolbar, viewer, sessionBridge, headerBar, panelsSlot } = createSetupDeps();

      registry.setupTabContents(contextToolbar, viewer, sessionBridge, headerBar);

      // headerBar.setPanelToggles should have been called once with a container div
      expect(headerBar.setPanelToggles).toHaveBeenCalledTimes(1);
      const panelTogglesArg = headerBar.setPanelToggles.mock.calls[0][0] as HTMLElement;
      expect(panelTogglesArg).toBeInstanceOf(HTMLElement);

      // The container should now be inside the panels slot
      expect(panelsSlot.contains(panelTogglesArg)).toBe(true);
    });

    it('ACR-005: panels slot contains exactly 3 toggle buttons (info, snapshots, playlist)', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const { contextToolbar, viewer, sessionBridge, headerBar, panelsSlot } = createSetupDeps();

      registry.setupTabContents(contextToolbar, viewer, sessionBridge, headerBar);

      const buttons = panelsSlot.querySelectorAll('button');
      expect(buttons.length).toBe(3);
    });

    it('ACR-006: each panel toggle button has the correct data-testid', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const { contextToolbar, viewer, sessionBridge, headerBar, panelsSlot } = createSetupDeps();

      registry.setupTabContents(contextToolbar, viewer, sessionBridge, headerBar);

      const expectedTestIds = ['info-panel-toggle', 'snapshot-panel-toggle', 'playlist-panel-toggle'];
      for (const testid of expectedTestIds) {
        const btn = panelsSlot.querySelector(`[data-testid="${testid}"]`);
        expect(btn, `button with data-testid="${testid}" should exist`).not.toBeNull();
        expect(btn!.tagName).toBe('BUTTON');
      }
    });

    it('ACR-007: panel toggle container uses flex layout', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const { contextToolbar, viewer, sessionBridge, headerBar } = createSetupDeps();

      registry.setupTabContents(contextToolbar, viewer, sessionBridge, headerBar);

      // The container div passed to setPanelToggles should have flex layout
      const panelTogglesContainer = headerBar.setPanelToggles.mock.calls[0][0] as HTMLElement;
      expect(panelTogglesContainer.style.display).toBe('flex');
      expect(panelTogglesContainer.style.alignItems).toBe('center');

      // It should contain exactly the 3 buttons as direct children
      const childButtons = panelTogglesContainer.querySelectorAll(':scope > button');
      expect(childButtons.length).toBe(3);
    });
  });
});
