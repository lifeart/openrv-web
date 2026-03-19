import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so these are available in mock factories
const { disposeMocks, createMockClass } = vi.hoisted(() => {
  const disposeMocks: Record<string, ReturnType<(typeof import('vitest'))['vi']['fn']>> = {};

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
vi.mock('./ui/components/TextFormattingToolbar', () => ({
  TextFormattingToolbar: createMockClass('TextFormattingToolbar'),
}));
// These controls call .on() / .isVisible() / .isEnabled() on their overlay arg during construction:
vi.mock('./ui/components/SafeAreasControl', () => ({ SafeAreasControl: createMockClass('SafeAreasControl') }));
vi.mock('./ui/components/FalseColorControl', () => ({ FalseColorControl: createMockClass('FalseColorControl') }));
vi.mock('./ui/components/LuminanceVisualizationControl', () => ({
  LuminanceVisualizationControl: createMockClass('LuminanceVisualizationControl'),
}));
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
  LUTPipelinePanel: 'lutPipelinePanel',
  NoiseReductionControl: 'noiseReductionControl',
  WatermarkControl: 'watermarkControl',
  TimelineEditor: 'timelineEditor',
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
  ShotGridConfigUI: 'shotGridConfig',
  ShotGridPanel: 'shotGridPanel',
  ConformPanel: 'conformPanel',
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
  const makeOverlay = () => ({
    toggle: vi.fn(),
    hasImage: vi.fn(() => false),
    getState: vi.fn(() => ({
      enabled: false,
      imageUrl: null,
      position: 'top-left',
      size: 0.1,
      opacity: 1,
      margin: 12,
      showFullPath: false,
      showDataWindow: true,
      showDisplayWindow: true,
      dataWindowColor: '#00ff00',
      displayWindowColor: '#00ccff',
      lineWidth: 2,
      dashPattern: [6, 4],
      showLabels: true,
      fontSize: 'medium',
      showFrameCounter: true,
      backgroundOpacity: 0.6,
      showDroppedFrames: true,
      showTargetFps: true,
      warningThreshold: 0.97,
      criticalThreshold: 0.85,
    })),
    getSettings: vi.fn(() => ({
      show: false,
      aspect: 1.78,
      opacity: 0.66,
      heightVisible: -1,
      centerPoint: [0, 0],
    })),
    loadImage: vi.fn(),
    removeImage: vi.fn(),
    setPosition: vi.fn(),
    setFontSize: vi.fn(),
    setShowFrameCounter: vi.fn(),
    setBackgroundOpacity: vi.fn(),
    setShowFullPath: vi.fn(),
    setShowDataWindow: vi.fn(),
    setShowDisplayWindow: vi.fn(),
    setShowLabels: vi.fn(),
    setDataWindowColor: vi.fn(),
    setDisplayWindowColor: vi.fn(),
    setLineWidth: vi.fn(),
    setDashPattern: vi.fn(),
    setAspect: vi.fn(),
    setOpacity: vi.fn(),
    setCenterPoint: vi.fn(),
    setShape: vi.fn(),
    setSize: vi.fn(),
    setDimAmount: vi.fn(),
    setFeather: vi.fn(),
    on: vi.fn(() => vi.fn()),
  });

  return {
    session: { currentFrame: 1, frameCount: 1, on: vi.fn(() => vi.fn()) } as any,
    viewer: {
      getSafeAreasOverlay: vi.fn(() => ({})),
      getFalseColor: vi.fn(() => ({})),
      getLuminanceVisualization: vi.fn(() => ({})),
      getZebraStripes: vi.fn(() => ({})),
      getHSLQualifier: vi.fn(() => ({})),
      getWatermarkOverlay: vi.fn(() => undefined),
      getBugOverlay: vi.fn(() => makeOverlay()),
      getMatteOverlay: vi.fn(() => makeOverlay()),
      getEXRWindowOverlay: vi.fn(() => makeOverlay()),
      getInfoStripOverlay: vi.fn(() => makeOverlay()),
      getTimecodeOverlay: vi.fn(() => makeOverlay()),
      getFPSIndicator: vi.fn(() => makeOverlay()),
      getSpotlightOverlay: vi.fn(() => makeOverlay()),
      getStereoPair: vi.fn(() => null),
      getImageData: vi.fn(() => null),
      setReferenceImage: vi.fn(),
      getDisplayWidth: vi.fn(() => 1920),
      getDisplayHeight: vi.fn(() => 1080),
      setSphericalProjectionRef: vi.fn(),
      setSphericalProjection: vi.fn(),
      getMissingFrameMode: vi.fn(() => 'off'),
      setMissingFrameMode: vi.fn(),
      getLUTPipeline: vi.fn(() => ({
        registerSource: vi.fn(),
        setActiveSource: vi.fn(),
        getSourceConfig: vi.fn(() => ({
          preCacheLUT: { enabled: true, lutData: null, intensity: 1, lutName: null },
          fileLUT: { enabled: true, lutData: null, intensity: 1, lutName: null },
          lookLUT: { enabled: true, lutData: null, intensity: 1, lutName: null },
        })),
        getState: vi.fn(() => ({
          displayLUT: { enabled: true, lutData: null, intensity: 1, lutName: null },
        })),
        getActiveSourceId: vi.fn(() => 'default'),
      })),
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

    // Access lazy-created scopes so they are instantiated before dispose
    void registry.histogram;
    void registry.waveform;
    void registry.vectorscope;

    registry.dispose();

    // Complete list of all controls/managers disposed in dispose() (source lines 545-592)
    const expectedDisposed = [
      'OCIOControl',
      'GhostFrameControl',
      'SafeAreasControl',
      'FalseColorControl',
      'LuminanceVisualizationControl',
      'ToneMappingControl',
      'LUTPipelinePanel',
      'NoiseReductionControl',
      'WatermarkControl',
      'TimelineEditor',
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
      'ShotGridConfigUI',
      'ShotGridPanel',
      'ConformPanel',
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

  describe('Lazy scope creation (histogram, waveform, vectorscope)', () => {
    it('ACR-010: histogram is not created until first access via the getter', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      // The lazy histogram should not exist before first access
      expect(registry.analysis.isHistogramCreated()).toBe(false);
      // Access the getter to trigger creation
      const instance = registry.histogram;
      expect(instance).toBeDefined();
      expect(registry.analysis.isHistogramCreated()).toBe(true);
    });

    it('ACR-011: waveform is not created until first access via the getter', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      expect(registry.analysis.isWaveformCreated()).toBe(false);
      const instance = registry.waveform;
      expect(instance).toBeDefined();
      expect(registry.analysis.isWaveformCreated()).toBe(true);
    });

    it('ACR-012: vectorscope is not created until first access via the getter', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      expect(registry.analysis.isVectorscopeCreated()).toBe(false);
      const instance = registry.vectorscope;
      expect(instance).toBeDefined();
      expect(registry.analysis.isVectorscopeCreated()).toBe(true);
    });

    it('ACR-013: subsequent histogram accesses return the same instance', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const first = registry.histogram;
      const second = registry.histogram;
      expect(first).toBe(second);
    });

    it('ACR-014: subsequent waveform accesses return the same instance', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const first = registry.waveform;
      const second = registry.waveform;
      expect(first).toBe(second);
    });

    it('ACR-015: subsequent vectorscope accesses return the same instance', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const first = registry.vectorscope;
      const second = registry.vectorscope;
      expect(first).toBe(second);
    });

    it('ACR-016: dispose succeeds without ever accessing lazy scopes', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      // Never access histogram, waveform, or vectorscope
      expect(registry.analysis.isHistogramCreated()).toBe(false);
      expect(registry.analysis.isWaveformCreated()).toBe(false);
      expect(registry.analysis.isVectorscopeCreated()).toBe(false);
      // dispose() should not throw when lazy scopes were never created
      expect(() => registry.dispose()).not.toThrow();
    });
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
        getBugOverlay: vi.fn(() => createMockOverlay()),
        getMatteOverlay: vi.fn(() => createMockOverlay()),
        getSpotlightOverlay: vi.fn(() => createMockOverlay()),
        getMissingFrameMode: vi.fn(() => 'off'),
        setMissingFrameMode: vi.fn(),
        getPixelProbe: vi.fn(() => createMockOverlay()),
        getContainer: vi.fn(() => document.createElement('div')),
        getImageData: vi.fn(() => null),
        getClippingOverlay: vi.fn(() => createMockOverlay()),
        getCanvasContainer: vi.fn(() => document.createElement('div')),
        getColorWheels: vi.fn(() => createMockOverlay()),
        refresh: vi.fn(),
        setSphericalProjectionRef: vi.fn(),
        getDisplayWidth: vi.fn(() => 800),
        getDisplayHeight: vi.fn(() => 600),
        getEXRWindowOverlay: vi.fn(() => createMockOverlay()),
        getFPSIndicator: vi.fn(() => createMockOverlay()),
        getInfoStripOverlay: vi.fn(() => createMockOverlay()),
        getTimecodeOverlay: vi.fn(() => createMockOverlay()),
        setSphericalProjection: vi.fn(),
        getStereoPair: vi.fn(() => null),
        setReferenceImage: vi.fn(),
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

    it('ACR-005: panels slot contains exactly 5 toggle buttons (info, snapshots, playlist, conform, shotgrid)', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const { contextToolbar, viewer, sessionBridge, headerBar, panelsSlot } = createSetupDeps();

      registry.setupTabContents(contextToolbar, viewer, sessionBridge, headerBar);

      const buttons = panelsSlot.querySelectorAll('button');
      expect(buttons.length).toBe(5);
    });

    it('ACR-006: each panel toggle button has the correct data-testid', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const { contextToolbar, viewer, sessionBridge, headerBar, panelsSlot } = createSetupDeps();

      registry.setupTabContents(contextToolbar, viewer, sessionBridge, headerBar);

      const expectedTestIds = [
        'info-panel-toggle',
        'snapshot-panel-toggle',
        'playlist-panel-toggle',
        'conform-panel-toggle',
        'shotgrid-panel-toggle',
      ];
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

      // It should contain exactly the 5 buttons as direct children
      const childButtons = panelTogglesContainer.querySelectorAll(':scope > button');
      expect(childButtons.length).toBe(5);
    });

    it('ACR-008: missing-frame mode selector reflects viewer state and updates mode on change', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const { contextToolbar, viewer, sessionBridge, headerBar } = createSetupDeps();

      viewer.getMissingFrameMode.mockReturnValue('hold');
      registry.setupTabContents(contextToolbar, viewer, sessionBridge, headerBar);

      const viewCall = contextToolbar.setTabContent.mock.calls.find(([tabId]: [string]) => tabId === 'view');
      expect(viewCall).toBeDefined();
      const viewContent = viewCall![1] as HTMLElement;
      const container = viewContent.querySelector('[data-testid="missing-frame-mode-select"]') as HTMLElement | null;
      expect(container).not.toBeNull();

      // Button label should reflect current mode
      const button = container!.querySelector('button') as HTMLButtonElement;
      expect(button).not.toBeNull();
      expect(button!.textContent).toContain('Hold');

      // Open dropdown by clicking the button (appends to body like stereo control)
      button!.click();
      const dropdown = document.body.querySelector('[data-testid="missing-frame-mode-dropdown"]') as HTMLElement;
      expect(dropdown).not.toBeNull();

      // Click an option in the dropdown to change mode
      const blackOption = dropdown.querySelector('button[data-value="black"]') as HTMLButtonElement;
      expect(blackOption).not.toBeNull();
      blackOption.click();
      expect(viewer.setMissingFrameMode).toHaveBeenCalledWith('black');
    });

    it('ACR-009: effects/view toolbars include denoise, watermark, and timeline editor toggles', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const { contextToolbar, viewer, sessionBridge, headerBar } = createSetupDeps();

      registry.setupTabContents(contextToolbar, viewer, sessionBridge, headerBar);

      const viewCall = contextToolbar.setTabContent.mock.calls.find(([tabId]: [string]) => tabId === 'view');
      const effectsCall = contextToolbar.setTabContent.mock.calls.find(([tabId]: [string]) => tabId === 'effects');
      expect(viewCall).toBeDefined();
      expect(effectsCall).toBeDefined();

      const viewContent = viewCall![1] as HTMLElement;
      const effectsContent = effectsCall![1] as HTMLElement;

      expect(viewContent.querySelector('[data-testid="timeline-editor-toggle-button"]')).not.toBeNull();
      expect(effectsContent.querySelector('[data-testid="noise-reduction-toggle-button"]')).not.toBeNull();
      expect(effectsContent.querySelector('[data-testid="watermark-toggle-button"]')).not.toBeNull();
    });
  });

  describe('Facade completeness – all original properties resolve through compatibility getters', () => {
    /**
     * Complete list of all original readonly properties that existed on AppControlRegistry
     * before the control-group decomposition. Each must resolve to a non-undefined value
     * through the permanent compatibility getters.
     */
    const ORIGINAL_PROPERTIES: string[] = [
      // Annotate
      'paintToolbar',
      'textFormattingToolbar',
      // Color
      'colorControls',
      'colorInversionToggle',
      'premultControl',
      'cdlControl',
      'curvesControl',
      'ocioControl',
      'lutPipelinePanel',
      // View
      'zoomControl',
      'channelSelect',
      'compareControl',
      'referenceManager',
      'stereoControl',
      'stereoEyeTransformControl',
      'stereoAlignControl',
      'ghostFrameControl',
      'convergenceMeasure',
      'floatingWindowControl',
      'sphericalProjection',
      'stackControl',
      'parControl',
      'backgroundPatternControl',
      'displayProfileControl',
      // Effects
      'filterControl',
      'slateEditor',
      'lensControl',
      'deinterlaceControl',
      'filmEmulationControl',
      'perspectiveCorrectionControl',
      'stabilizationControl',
      'noiseReductionControl',
      'watermarkControl',
      'timelineEditor',
      // Transform
      'transformControl',
      'cropControl',
      // Analysis
      'scopesControl',
      'safeAreasControl',
      'falseColorControl',
      'luminanceVisControl',
      'toneMappingControl',
      'zebraControl',
      'hslQualifierControl',
      'gamutMappingControl',
      'gamutDiagram',
      'histogram',
      'waveform',
      'vectorscope',
      // Panels
      'historyPanel',
      'infoPanel',
      'markerListPanel',
      'notePanel',
      'rightPanelContent',
      'leftPanelContent',
      'cacheIndicator',
      'snapshotPanel',
      'playlistPanel',
      'shotGridConfig',
      'shotGridPanel',
      'conformPanel',
      // Playback / Network
      'autoSaveManager',
      'autoSaveIndicator',
      'snapshotManager',
      'playlistManager',
      'transitionManager',
      'presentationMode',
      'networkSyncManager',
      'networkControl',
    ];

    it('ACR-020: every original property resolves to a non-undefined value via the facade getter', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);

      const undefinedProps: string[] = [];
      for (const prop of ORIGINAL_PROPERTIES) {
        const value = (registry as any)[prop];
        if (value === undefined) {
          undefinedProps.push(prop);
        }
      }

      expect(undefinedProps, `These properties resolved to undefined: ${undefinedProps.join(', ')}`).toEqual([]);
    });

    it('ACR-021: control groups are exposed as readonly fields', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);

      const groupNames = ['color', 'view', 'effects', 'transform', 'annotate', 'analysis', 'panel', 'playback'];
      for (const group of groupNames) {
        expect((registry as any)[group], `registry.${group} should be defined`).toBeDefined();
        expect(typeof (registry as any)[group], `registry.${group} should be an object`).toBe('object');
      }
    });

    it('ACR-022: facade getter returns the same object as the group field', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);

      // Spot-check a sample from each group
      expect(registry.colorControls).toBe(registry.color.colorControls);
      expect(registry.zoomControl).toBe(registry.view.zoomControl);
      expect(registry.filterControl).toBe(registry.effects.filterControl);
      expect(registry.transformControl).toBe(registry.transform.transformControl);
      expect(registry.paintToolbar).toBe(registry.annotate.paintToolbar);
      expect(registry.scopesControl).toBe(registry.analysis.scopesControl);
      expect(registry.historyPanel).toBe(registry.panel.historyPanel);
      expect(registry.autoSaveManager).toBe(registry.playback.autoSaveManager);
    });
  });

  // -------------------------------------------------------------------------
  // #92: logoError event listener is wired
  // -------------------------------------------------------------------------
  describe('logoError wiring (#92)', () => {
    it('ACR-023: logoError event triggers console.warn', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        // Emit logoError on the real slateEditor instance
        registry.slateEditor.emit('logoError', new Error('test upload failure'));
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]![0]).toContain('[SlateEditor]');
        expect(warnSpy.mock.calls[0]![1]).toBe('test upload failure');
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('slate editor panel surface (#91)', () => {
    it('ACR-024: exposes text and accent color plus resolution controls', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const panel = (registry as any).slateEditorPanel.element as HTMLElement;

      const textColor = panel.querySelector<HTMLInputElement>('[data-testid="slate-text-color"]')!;
      textColor.value = '#112233';
      textColor.dispatchEvent(new Event('input', { bubbles: true }));

      const accentColor = panel.querySelector<HTMLInputElement>('[data-testid="slate-accent-color"]')!;
      accentColor.value = '#445566';
      accentColor.dispatchEvent(new Event('input', { bubbles: true }));

      const widthInput = panel.querySelector<HTMLInputElement>('[data-testid="slate-resolution-width"]')!;
      widthInput.value = '3840';
      widthInput.dispatchEvent(new Event('input', { bubbles: true }));

      const heightInput = panel.querySelector<HTMLInputElement>('[data-testid="slate-resolution-height"]')!;
      heightInput.value = '2160';
      heightInput.dispatchEvent(new Event('input', { bubbles: true }));

      expect(registry.slateEditor.getColors().text).toBe('#112233');
      expect(registry.slateEditor.getColors().accent).toBe('#445566');
      expect(registry.slateEditor.getResolution()).toEqual({ width: 3840, height: 2160 });
    });

    it('ACR-025: exposes custom field CRUD controls', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const panel = (registry as any).slateEditorPanel.element as HTMLElement;

      const addButton = panel.querySelector<HTMLButtonElement>('[data-testid="slate-custom-field-add"]')!;
      addButton.click();

      const labelInput = panel.querySelector<HTMLInputElement>('[data-testid="slate-custom-field-label-0"]')!;
      labelInput.value = 'Codec';
      labelInput.dispatchEvent(new Event('input', { bubbles: true }));

      const valueInput = panel.querySelector<HTMLInputElement>('[data-testid="slate-custom-field-value-0"]')!;
      valueInput.value = 'ProRes 4444';
      valueInput.dispatchEvent(new Event('input', { bubbles: true }));

      const sizeSelect = panel.querySelector<HTMLSelectElement>('[data-testid="slate-custom-field-size-0"]')!;
      sizeSelect.value = 'large';
      sizeSelect.dispatchEvent(new Event('change', { bubbles: true }));

      expect(registry.slateEditor.getCustomFields()).toEqual([{ label: 'Codec', value: 'ProRes 4444', size: 'large' }]);

      panel.querySelector<HTMLButtonElement>('[data-testid="slate-custom-field-remove-0"]')!.click();
      expect(registry.slateEditor.getCustomFields()).toEqual([]);
    });

    it('ACR-026: exposes logo position and scale controls', () => {
      const deps = createMockDeps();
      const registry = new AppControlRegistry(deps);
      const panel = (registry as any).slateEditorPanel.element as HTMLElement;

      const positionSelect = panel.querySelector<HTMLSelectElement>('[data-testid="slate-logo-position"]')!;
      positionSelect.value = 'top-left';
      positionSelect.dispatchEvent(new Event('change', { bubbles: true }));

      const scaleSlider = panel.querySelector<HTMLInputElement>('[data-testid="slate-logo-scale"]')!;
      scaleSlider.value = '28';
      scaleSlider.dispatchEvent(new Event('input', { bubbles: true }));

      expect(registry.slateEditor.getLogoPosition()).toBe('top-left');
      expect(registry.slateEditor.getLogoScale()).toBe(0.28);
    });
  });
});
