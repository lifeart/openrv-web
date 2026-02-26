/**
 * App Smoke Tests
 *
 * Verifies that the App composition root can be constructed,
 * disposed, and that its public API surface has the expected shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock canvas-dependent controls (same set as AppControlRegistry.test.ts)
// ---------------------------------------------------------------------------

const createMockClass = vi.hoisted(() => {
  return function createMockClass() {
    return class {
      dispose = vi.fn();
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
  };
});

vi.mock('./ui/components/Histogram', () => ({ Histogram: createMockClass() }));
vi.mock('./ui/components/Waveform', () => ({ Waveform: createMockClass() }));
vi.mock('./ui/components/Vectorscope', () => ({ Vectorscope: createMockClass() }));
vi.mock('./ui/components/GamutDiagram', () => ({ GamutDiagram: createMockClass() }));
vi.mock('./ui/components/CurvesControl', () => ({ CurvesControl: createMockClass() }));
vi.mock('./ui/components/CacheIndicator', () => ({ CacheIndicator: createMockClass() }));
vi.mock('./ui/layout/panels/RightPanelContent', () => ({ RightPanelContent: createMockClass() }));
vi.mock('./ui/components/PaintToolbar', () => ({ PaintToolbar: createMockClass() }));
vi.mock('./ui/components/TextFormattingToolbar', () => ({ TextFormattingToolbar: createMockClass() }));
vi.mock('./ui/components/SafeAreasControl', () => ({ SafeAreasControl: createMockClass() }));
vi.mock('./ui/components/FalseColorControl', () => ({ FalseColorControl: createMockClass() }));
vi.mock('./ui/components/LuminanceVisualizationControl', () => ({ LuminanceVisualizationControl: createMockClass() }));
vi.mock('./ui/components/ZebraControl', () => ({ ZebraControl: createMockClass() }));
vi.mock('./ui/components/HSLQualifierControl', () => ({ HSLQualifierControl: createMockClass() }));
vi.mock('./ui/components/MarkerListPanel', () => ({ MarkerListPanel: createMockClass() }));
vi.mock('./ui/components/NotePanel', () => ({ NotePanel: createMockClass() }));

// ---------------------------------------------------------------------------
// Mock wiring modules (they wire .on() subscriptions; stubs avoid deep deps)
// ---------------------------------------------------------------------------

vi.mock('./AppColorWiring', () => ({
  wireColorControls: vi.fn(() => ({ colorHistoryTimer: null, colorHistoryPrevious: {} })),
  updateOCIOPipeline: vi.fn(),
}));
vi.mock('./AppViewWiring', () => ({ wireViewControls: vi.fn() }));
vi.mock('./AppEffectsWiring', () => ({ wireEffectsControls: vi.fn() }));
vi.mock('./AppTransformWiring', () => ({ wireTransformControls: vi.fn() }));
vi.mock('./AppPlaybackWiring', () => ({ wirePlaybackControls: vi.fn() }));
vi.mock('./AppStackWiring', () => ({ wireStackControls: vi.fn() }));
vi.mock('./AppDCCWiring', () => ({ wireDCCBridge: vi.fn() }));

import { App } from './App';

// ---------------------------------------------------------------------------
// BroadcastChannel polyfill for jsdom (used by ExternalPresentation)
// ---------------------------------------------------------------------------

class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(name: string) { this.name = name; }
  postMessage = vi.fn();
  close = vi.fn();
}

describe('App', () => {
  let app: App;

  beforeEach(() => {
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('APP-001: constructor does not throw', () => {
    expect(() => {
      app = new App();
    }).not.toThrow();
  });

  it('APP-002: dispose does not throw', () => {
    app = new App();
    expect(() => {
      app.dispose();
    }).not.toThrow();
  });

  it('APP-003: getAPIConfig returns expected shape', () => {
    app = new App();
    const config = app.getAPIConfig();
    expect(config).toBeDefined();
    expect(config).toHaveProperty('session');
    expect(config).toHaveProperty('viewer');
    expect(config).toHaveProperty('colorControls');
    expect(config).toHaveProperty('cdlControl');
    expect(config).toHaveProperty('curvesControl');
    app.dispose();
  });

  it('APP-004: getAPIConfig properties are not null', () => {
    app = new App();
    const config = app.getAPIConfig();
    expect(config.session).toBeTruthy();
    expect(config.viewer).toBeTruthy();
    expect(config.colorControls).toBeTruthy();
    expect(config.cdlControl).toBeTruthy();
    expect(config.curvesControl).toBeTruthy();
    app.dispose();
  });

  it('APP-005: can construct and dispose multiple times', () => {
    const app1 = new App();
    app1.dispose();
    const app2 = new App();
    app2.dispose();
  });
});
