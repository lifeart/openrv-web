import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs before vi.mock hoisting, so these are available in mock factories
const { disposeMocks, createMockClass, createAsyncDisposeMockClass } = vi.hoisted(() => {
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
    };
  }

  function createAsyncDisposeMockClass(name: string) {
    const disposeFn = vi.fn((): Promise<void> => Promise.resolve()) as any;
    disposeMocks[name] = disposeFn;
    return class {
      dispose = disposeFn;
      render = vi.fn(() => document.createElement('div'));
      on = vi.fn(() => vi.fn());
    };
  }

  return { disposeMocks, createMockClass, createAsyncDisposeMockClass };
});

// Mock all UI control imports
vi.mock('./ui/components/PaintToolbar', () => ({ PaintToolbar: createMockClass('PaintToolbar') }));
vi.mock('./ui/components/ColorControls', () => ({ ColorControls: createMockClass('ColorControls') }));
vi.mock('./ui/components/TransformControl', () => ({ TransformControl: createMockClass('TransformControl') }));
vi.mock('./ui/components/FilterControl', () => ({ FilterControl: createMockClass('FilterControl') }));
vi.mock('./ui/components/CropControl', () => ({ CropControl: createMockClass('CropControl') }));
vi.mock('./ui/components/CDLControl', () => ({ CDLControl: createMockClass('CDLControl') }));
vi.mock('./ui/components/CurvesControl', () => ({ CurvesControl: createMockClass('CurvesControl') }));
vi.mock('./ui/components/LensControl', () => ({ LensControl: createMockClass('LensControl') }));
vi.mock('./ui/components/StackControl', () => ({ StackControl: createMockClass('StackControl') }));
vi.mock('./ui/components/ChannelSelect', () => ({ ChannelSelect: createMockClass('ChannelSelect') }));
vi.mock('./ui/components/StereoControl', () => ({ StereoControl: createMockClass('StereoControl') }));
vi.mock('./ui/components/StereoEyeTransformControl', () => ({ StereoEyeTransformControl: createMockClass('StereoEyeTransformControl') }));
vi.mock('./ui/components/StereoAlignControl', () => ({ StereoAlignControl: createMockClass('StereoAlignControl') }));
vi.mock('./ui/components/Histogram', () => ({ Histogram: createMockClass('Histogram') }));
vi.mock('./ui/components/Waveform', () => ({ Waveform: createMockClass('Waveform') }));
vi.mock('./ui/components/Vectorscope', () => ({ Vectorscope: createMockClass('Vectorscope') }));
vi.mock('./ui/components/ZoomControl', () => ({ ZoomControl: createMockClass('ZoomControl') }));
vi.mock('./ui/components/ScopesControl', () => ({ ScopesControl: createMockClass('ScopesControl') }));
vi.mock('./ui/components/CompareControl', () => ({ CompareControl: createMockClass('CompareControl') }));
vi.mock('./ui/components/SafeAreasControl', () => ({ SafeAreasControl: createMockClass('SafeAreasControl') }));
vi.mock('./ui/components/FalseColorControl', () => ({ FalseColorControl: createMockClass('FalseColorControl') }));
vi.mock('./ui/components/LuminanceVisualizationControl', () => ({ LuminanceVisualizationControl: createMockClass('LuminanceVisualizationControl') }));
vi.mock('./ui/components/ToneMappingControl', () => ({ ToneMappingControl: createMockClass('ToneMappingControl') }));
vi.mock('./ui/components/ZebraControl', () => ({ ZebraControl: createMockClass('ZebraControl') }));
vi.mock('./ui/components/HSLQualifierControl', () => ({ HSLQualifierControl: createMockClass('HSLQualifierControl') }));
vi.mock('./ui/components/GhostFrameControl', () => ({ GhostFrameControl: createMockClass('GhostFrameControl') }));
vi.mock('./ui/components/PARControl', () => ({ PARControl: createMockClass('PARControl') }));
vi.mock('./ui/components/BackgroundPatternControl', () => ({ BackgroundPatternControl: createMockClass('BackgroundPatternControl') }));
vi.mock('./ui/components/OCIOControl', () => ({ OCIOControl: createMockClass('OCIOControl') }));
vi.mock('./ui/components/DisplayProfileControl', () => ({ DisplayProfileControl: createMockClass('DisplayProfileControl') }));
vi.mock('./ui/components/ColorInversionToggle', () => ({ ColorInversionToggle: createMockClass('ColorInversionToggle') }));
vi.mock('./ui/components/HistoryPanel', () => ({ HistoryPanel: createMockClass('HistoryPanel') }));
vi.mock('./ui/components/InfoPanel', () => ({ InfoPanel: createMockClass('InfoPanel') }));
vi.mock('./ui/components/MarkerListPanel', () => ({ MarkerListPanel: createMockClass('MarkerListPanel') }));
vi.mock('./ui/components/CacheIndicator', () => ({ CacheIndicator: createMockClass('CacheIndicator') }));
vi.mock('./ui/components/TextFormattingToolbar', () => ({ TextFormattingToolbar: createMockClass('TextFormattingToolbar') }));
vi.mock('./ui/components/AutoSaveIndicator', () => ({ AutoSaveIndicator: createMockClass('AutoSaveIndicator') }));
vi.mock('./ui/components/SnapshotPanel', () => ({ SnapshotPanel: createMockClass('SnapshotPanel') }));
vi.mock('./ui/components/PlaylistPanel', () => ({ PlaylistPanel: createMockClass('PlaylistPanel') }));
vi.mock('./ui/components/NetworkControl', () => ({ NetworkControl: createMockClass('NetworkControl') }));

// Manager / utility mocks
vi.mock('./core/session/AutoSaveManager', () => ({ AutoSaveManager: createAsyncDisposeMockClass('AutoSaveManager') }));
vi.mock('./core/session/SnapshotManager', () => ({ SnapshotManager: createMockClass('SnapshotManager') }));
vi.mock('./core/session/PlaylistManager', () => ({ PlaylistManager: createMockClass('PlaylistManager') }));
vi.mock('./utils/ui/PresentationMode', () => ({ PresentationMode: createMockClass('PresentationMode') }));
vi.mock('./network/NetworkSyncManager', () => ({ NetworkSyncManager: createMockClass('NetworkSyncManager') }));

vi.mock('./utils/HistoryManager', () => ({
  getGlobalHistoryManager: vi.fn(() => ({})),
}));

// ContextToolbar is imported but not used by constructor/dispose - mock to avoid side effects
vi.mock('./ui/components/layout/ContextToolbar', () => ({
  ContextToolbar: createMockClass('ContextToolbar'),
}));

import { AppControlRegistry } from './AppControlRegistry';

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

    // AutoSaveManager.dispose returns a Promise - the code calls .catch() on it
    registry.dispose();

    const autoSaveDispose = disposeMocks['AutoSaveManager']!;
    expect(autoSaveDispose).toHaveBeenCalledTimes(1);
    // Verify it returned a promise (thenable)
    const result = autoSaveDispose.mock.results[0]!.value;
    expect(result).toBeInstanceOf(Promise);
  });
});
