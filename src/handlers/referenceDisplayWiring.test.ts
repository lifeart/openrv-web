/**
 * Regression tests for ReferenceManager display path and EXR window overlay wiring.
 *
 * Covers:
 * - Reference capture + display pipeline works
 * - Capture auto-enables reference mode
 * - EXR overlay receives window data on source load
 * - EXR overlay toggle button works
 * - Keyboard bindings for reference exist
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReferenceManager } from '../ui/components/ReferenceManager';
import { EXRWindowOverlay } from '../ui/components/EXRWindowOverlay';
import { handleSourceLoaded } from './sourceLoadedHandlers';
import { DEFAULT_KEY_BINDINGS } from '../utils/input/KeyBindings';
import type { SessionBridgeContext } from '../AppSessionBridge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSmallImage(channels = 4) {
  return {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray(2 * 2 * channels).fill(128),
    channels,
  };
}

function createMockContext(overrides: {
  currentSource?: Record<string, unknown> | null;
  gtoData?: unknown;
  allSources?: Array<{ name: string }>;
  currentSourceIndex?: number;
} = {}): SessionBridgeContext {
  const cropControl = { setSourceDimensions: vi.fn() };
  const ocioProcessor = {
    setActiveSource: vi.fn(),
    detectColorSpaceFromExtension: vi.fn(() => null),
    setSourceInputColorSpace: vi.fn(),
    getSourceInputColorSpace: vi.fn(() => null),
  };
  const ocioControl = { getProcessor: () => ocioProcessor };
  const toneMappingControl = { setState: vi.fn() };
  const colorControls = { setAdjustments: vi.fn() };
  const persistenceManager = { setGTOStore: vi.fn(), syncGTOStore: vi.fn() };
  const exrWindowOverlay = { setWindows: vi.fn(), clearWindows: vi.fn() };
  const viewer = {
    initPrerenderBuffer: vi.fn(),
    refresh: vi.fn(),
    getGLRenderer: vi.fn(() => null),
    isDisplayHDRCapable: vi.fn(() => false),
    getEXRWindowOverlay: vi.fn(() => exrWindowOverlay),
  };
  const stackControl = { setAvailableSources: vi.fn() };
  const channelSelect = { clearEXRLayers: vi.fn(), setEXRLayers: vi.fn() };
  const infoPanel = { update: vi.fn() };
  const histogram = { setHDRMode: vi.fn(), setHDRAutoFit: vi.fn() };

  const session = {
    currentSource: overrides.currentSource !== undefined ? overrides.currentSource : null,
    gtoData: overrides.gtoData ?? null,
    allSources: overrides.allSources ?? [],
    currentSourceIndex: overrides.currentSourceIndex ?? 0,
  };

  return {
    getSession: () => session,
    getViewer: () => viewer,
    getCropControl: () => cropControl,
    getOCIOControl: () => ocioControl,
    getToneMappingControl: () => toneMappingControl,
    getColorControls: () => colorControls,
    getPersistenceManager: () => persistenceManager,
    getStackControl: () => stackControl,
    getChannelSelect: () => channelSelect,
    getInfoPanel: () => infoPanel,
    getHistogram: () => histogram,
  } as unknown as SessionBridgeContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Reference capture + display pipeline', () => {
  let mgr: ReferenceManager;

  beforeEach(() => {
    mgr = new ReferenceManager();
  });

  afterEach(() => {
    mgr.dispose();
  });

  it('RDW-001: captureReference stores image and emits referenceCaptured', () => {
    const handler = vi.fn();
    mgr.on('referenceCaptured', handler);

    const img = makeSmallImage();
    mgr.captureReference(img);

    expect(mgr.hasReference()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    const captured = handler.mock.calls[0]![0];
    expect(captured.width).toBe(2);
    expect(captured.height).toBe(2);
  });

  it('RDW-002: stateChanged event contains reference image after capture', () => {
    const handler = vi.fn();
    mgr.on('stateChanged', handler);

    mgr.captureReference(makeSmallImage());

    expect(handler).toHaveBeenCalled();
    const state = handler.mock.calls[handler.mock.calls.length - 1]![0];
    expect(state.referenceImage).not.toBeNull();
    expect(state.referenceImage.width).toBe(2);
  });

  it('RDW-003: stateChanged event with enabled=false has no visual reference', () => {
    mgr.captureReference(makeSmallImage());
    mgr.enable();

    const handler = vi.fn();
    mgr.on('stateChanged', handler);

    mgr.disable();

    expect(handler).toHaveBeenCalledTimes(1);
    const state = handler.mock.calls[0]![0];
    expect(state.enabled).toBe(false);
    // Image is still stored but display should be off
    expect(state.referenceImage).not.toBeNull();
  });
});

describe('Capture auto-enables reference mode', () => {
  it('RDW-010: calling enable() after captureReference sets enabled=true', () => {
    const mgr = new ReferenceManager();
    mgr.captureReference(makeSmallImage());
    mgr.enable();

    expect(mgr.isEnabled()).toBe(true);
    expect(mgr.hasReference()).toBe(true);

    mgr.dispose();
  });

  it('RDW-011: stateChanged reflects enabled + reference after capture+enable', () => {
    const mgr = new ReferenceManager();
    const handler = vi.fn();
    mgr.on('stateChanged', handler);

    mgr.captureReference(makeSmallImage());
    mgr.enable();

    // Last stateChanged call should show enabled=true and referenceImage present
    const lastCall = handler.mock.calls[handler.mock.calls.length - 1]![0];
    expect(lastCall.enabled).toBe(true);
    expect(lastCall.referenceImage).not.toBeNull();

    mgr.dispose();
  });
});

describe('EXR overlay receives window data on source load', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('RDW-020: handleSourceLoaded sets EXR windows when EXR attributes present', () => {
    const dataWindow = { xMin: 100, yMin: 50, xMax: 899, yMax: 549 };
    const displayWindow = { xMin: 0, yMin: 0, xMax: 999, yMax: 599 };

    const context = createMockContext({
      currentSource: {
        name: 'test.exr',
        width: 1000,
        height: 600,
        fileSourceNode: {
          isHDR: () => true,
          formatName: 'exr',
          getEXRLayers: () => [],
          getIPImage: () => ({
            metadata: {
              attributes: { dataWindow, displayWindow },
            },
          }),
        },
      },
    });

    handleSourceLoaded(
      context,
      vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()
    );

    const overlay = context.getViewer().getEXRWindowOverlay();
    expect(overlay.setWindows).toHaveBeenCalledWith(dataWindow, displayWindow);
    expect(overlay.clearWindows).not.toHaveBeenCalled();
  });

  it('RDW-021: handleSourceLoaded clears EXR windows for non-EXR source', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.jpg',
        width: 800,
        height: 600,
      },
    });

    handleSourceLoaded(
      context,
      vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()
    );

    const overlay = context.getViewer().getEXRWindowOverlay();
    expect(overlay.clearWindows).toHaveBeenCalled();
    expect(overlay.setWindows).not.toHaveBeenCalled();
  });

  it('RDW-022: handleSourceLoaded clears EXR windows when IPImage has no EXR attributes', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.dpx',
        width: 1920,
        height: 1080,
        fileSourceNode: {
          isHDR: () => true,
          formatName: 'dpx',
          getEXRLayers: () => [],
          getIPImage: () => ({
            metadata: {
              attributes: { formatName: 'dpx' },
            },
          }),
        },
      },
    });

    handleSourceLoaded(
      context,
      vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()
    );

    const overlay = context.getViewer().getEXRWindowOverlay();
    expect(overlay.clearWindows).toHaveBeenCalled();
    expect(overlay.setWindows).not.toHaveBeenCalled();
  });

  it('RDW-023: handleSourceLoaded clears EXR windows when no fileSourceNode', () => {
    const context = createMockContext({
      currentSource: {
        name: 'test.mov',
        width: 1920,
        height: 1080,
        videoSourceNode: { isHDR: () => false },
      },
    });

    handleSourceLoaded(
      context,
      vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()
    );

    const overlay = context.getViewer().getEXRWindowOverlay();
    expect(overlay.clearWindows).toHaveBeenCalled();
  });
});

describe('EXR overlay toggle button pattern', () => {
  it('RDW-030: EXR window overlay supports toggle()', () => {
    // Verify the EXRWindowOverlay has the toggle/enable/disable interface
    // that AppControlRegistry wires to a button
    const overlay = new EXRWindowOverlay();
    expect(overlay.isVisible()).toBe(false);

    // isVisible() requires both enabled AND windows to be set
    overlay.setWindows(
      { xMin: 0, yMin: 0, xMax: 99, yMax: 99 },
      { xMin: 0, yMin: 0, xMax: 199, yMax: 199 }
    );

    overlay.toggle();
    expect(overlay.isVisible()).toBe(true);

    overlay.toggle();
    expect(overlay.isVisible()).toBe(false);

    overlay.dispose();
  });

  it('RDW-031: EXR window overlay emits stateChanged on toggle', () => {
    const overlay = new EXRWindowOverlay();
    const handler = vi.fn();
    overlay.on('stateChanged', handler);

    overlay.toggle();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    );

    overlay.dispose();
  });
});

describe('Keyboard bindings for reference', () => {
  it('RDW-040: view.captureReference binding exists with Alt+Shift+R', () => {
    const binding = DEFAULT_KEY_BINDINGS['view.captureReference'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyR');
    expect(binding!.alt).toBe(true);
    expect(binding!.shift).toBe(true);
    expect(binding!.description).toContain('reference');
  });

  it('RDW-041: view.toggleReference binding exists with Ctrl+Shift+R', () => {
    const binding = DEFAULT_KEY_BINDINGS['view.toggleReference'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyR');
    expect(binding!.ctrl).toBe(true);
    expect(binding!.shift).toBe(true);
    expect(binding!.description).toContain('reference');
  });

  it('RDW-042: captureReference and toggleReference use different modifier combos', () => {
    const capture = DEFAULT_KEY_BINDINGS['view.captureReference']!;
    const toggle = DEFAULT_KEY_BINDINGS['view.toggleReference']!;

    // Both use KeyR but with different modifiers
    expect(capture.code).toBe(toggle.code);
    expect(capture.alt).toBe(true);
    expect(toggle.ctrl).toBe(true);
    // They must not have identical modifier sets
    expect(capture.alt !== toggle.alt || capture.ctrl !== toggle.ctrl).toBe(true);
  });
});

describe('Viewer.setReferenceImage', () => {
  it('RDW-050: setReferenceImage is defined on Viewer prototype', async () => {
    // Import and check the Viewer class has the method
    const { Viewer } = await import('../ui/components/Viewer');
    expect(typeof Viewer.prototype.setReferenceImage).toBe('function');
  });
});
