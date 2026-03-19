/**
 * Issue #472 Regression Tests
 *
 * Validates that Quad View is correctly marked as a preview/experimental feature:
 * 1. CompareControl UI marks Quad View with a "preview" badge
 * 2. AppViewWiring does NOT wire quad-view to the viewer (only logs a warning)
 * 3. Documentation accurately reflects the preview status
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-ignore -- Node modules available in test environment
import { readFileSync } from 'fs';
// @ts-ignore -- Node modules available in test environment
import { resolve } from 'path';
import { CompareControl } from './ui/components/CompareControl';
import { EventEmitter } from './utils/EventEmitter';
import { wireViewControls } from './AppViewWiring';
import type { AppWiringContext } from './AppWiringContext';

// ---------------------------------------------------------------------------
// 1. CompareControl marks Quad View as preview
// ---------------------------------------------------------------------------
describe('Issue #472: CompareControl Quad View preview badge', () => {
  let control: CompareControl;

  beforeEach(() => {
    control = new CompareControl();
  });

  afterEach(() => {
    control.dispose();
  });

  it('should render a preview badge in the Quad View section header', () => {
    // Open the dropdown so its DOM is populated
    const el = control.render();
    const button = el.querySelector('[data-testid="compare-control-button"]') as HTMLButtonElement;
    button.click();

    const badge = document.querySelector('[data-testid="quad-view-preview-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('preview');
  });

  it('should have a tooltip on the preview badge explaining it is not connected to the viewer', () => {
    const el = control.render();
    const button = el.querySelector('[data-testid="compare-control-button"]') as HTMLButtonElement;
    button.click();

    const badge = document.querySelector('[data-testid="quad-view-preview-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.getAttribute('title')).toContain('not yet connected');
    expect(badge!.getAttribute('title')).toContain('viewer rendering pipeline');
  });

  it('should include the header text "Quad View" alongside the preview badge', () => {
    const el = control.render();
    const button = el.querySelector('[data-testid="compare-control-button"]') as HTMLButtonElement;
    button.click();

    const header = document.querySelector('[data-testid="quad-view-header"]');
    expect(header).not.toBeNull();
    expect(header!.textContent).toContain('Quad View');
    expect(header!.textContent).toContain('preview');
  });
});

// ---------------------------------------------------------------------------
// 2. AppViewWiring does NOT wire quad-view (only warns)
// ---------------------------------------------------------------------------
describe('Issue #472: AppViewWiring quad-view produces warning only', () => {
  let wiringResult: { subscriptions: { dispose(): void } } | null = null;

  afterEach(() => {
    wiringResult?.subscriptions.dispose();
    wiringResult = null;
  });

  function createMockContext() {
    const viewerContainer = document.createElement('div');
    const viewer = {
      smoothFitToWindow: vi.fn(),
      smoothFitToWidth: vi.fn(),
      smoothFitToHeight: vi.fn(),
      smoothSetPixelRatio: vi.fn(),
      setWipeState: vi.fn(),
      setDifferenceMatteState: vi.fn(),
      setBlendModeState: vi.fn(),
      setToneMappingState: vi.fn(),
      setHDROutputMode: vi.fn(),
      setGhostFrameState: vi.fn(),
      setPARState: vi.fn(),
      setBackgroundPatternState: vi.fn(),
      setChannelMode: vi.fn(),
      setStereoState: vi.fn(),
      setStereoEyeTransforms: vi.fn(),
      setStereoAlignMode: vi.fn(),
      resetStereoEyeTransforms: vi.fn(),
      resetStereoAlignMode: vi.fn(),
      getContainer: vi.fn(() => viewerContainer),
      getStereoState: vi.fn(() => ({ mode: 'off' })),
      getStereoPair: vi.fn(() => null),
      getPixelCoordinatesFromClient: vi.fn(() => null),
      setWipeLabels: vi.fn(),
    };

    const session = Object.assign(new EventEmitter(), {
      setCurrentAB: vi.fn(),
      sourceCount: 1,
      currentSourceIndex: 0,
      sourceA: null as { name: string } | null,
      sourceB: null as { name: string } | null,
    });

    const sessionBridge = {
      updateHistogram: vi.fn(),
      updateWaveform: vi.fn(),
      updateVectorscope: vi.fn(),
      updateGamutDiagram: vi.fn(),
      scheduleUpdateScopes: vi.fn(),
      handleEXRLayerChange: vi.fn(),
    };

    const persistenceManager = { syncGTOStore: vi.fn() };
    const headerBar = { setPresentationState: vi.fn() };

    const compareControl = Object.assign(new EventEmitter(), {
      getWipePosition: vi.fn().mockReturnValue(0.5),
      getWipeMode: vi.fn().mockReturnValue('off'),
      getFlickerFrame: vi.fn().mockReturnValue(1),
      isDifferenceMatteEnabled: vi.fn().mockReturnValue(false),
      getBlendMode: vi.fn().mockReturnValue('off'),
      isQuadViewEnabled: vi.fn().mockReturnValue(false),
      setWipeMode: vi.fn(),
      setDifferenceMatteEnabled: vi.fn(),
      setBlendMode: vi.fn(),
      setQuadViewEnabled: vi.fn(),
    });

    const layoutManager = {
      enabled: false,
      setDeactivateCompareCallback: vi.fn(),
      on: vi.fn().mockReturnValue(() => {}),
      disable: vi.fn(),
    };

    const layoutControl = Object.assign(new EventEmitter(), {
      getManager: vi.fn().mockReturnValue(layoutManager),
      setSourceCount: vi.fn(),
      setCurrentSourceIndex: vi.fn(),
    });

    const controls = {
      zoomControl: new EventEmitter(),
      scopesControl: new EventEmitter(),
      histogram: { show: vi.fn(), hide: vi.fn() },
      waveform: { show: vi.fn(), hide: vi.fn() },
      vectorscope: { show: vi.fn(), hide: vi.fn() },
      gamutDiagram: { show: vi.fn(), hide: vi.fn() },
      compareControl,
      layoutControl,
      toneMappingControl: Object.assign(new EventEmitter(), {
        syncHDROutputMode: vi.fn(),
        getHDROutputMode: vi.fn().mockReturnValue('sdr'),
      }),
      ghostFrameControl: new EventEmitter(),
      parControl: new EventEmitter(),
      backgroundPatternControl: new EventEmitter(),
      channelSelect: new EventEmitter(),
      stereoControl: new EventEmitter(),
      stereoEyeTransformControl: Object.assign(new EventEmitter(), {
        hidePanel: vi.fn(),
        reset: vi.fn(),
      }),
      stereoAlignControl: Object.assign(new EventEmitter(), {
        reset: vi.fn(),
      }),
      presentationMode: new EventEmitter(),
      convergenceMeasure: Object.assign(new EventEmitter(), {
        isEnabled: vi.fn(() => false),
        setCursorPosition: vi.fn(),
        measureAtCursor: vi.fn(),
      }),
      floatingWindowControl: Object.assign(new EventEmitter(), {
        hasResult: vi.fn(() => false),
        clearResult: vi.fn(),
      }),
      updateStereoEyeControlsVisibility: vi.fn(),
    };

    const ctx = {
      session,
      viewer,
      controls,
      sessionBridge,
      persistenceManager,
      headerBar,
      paintEngine: {},
      tabBar: {},
    } as unknown as AppWiringContext;

    return { ctx, viewer, controls };
  }

  it('should log a console.warn when quad view is enabled, not call any viewer method', () => {
    const { ctx, viewer, controls } = createMockContext();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    wiringResult = wireViewControls(ctx);

    // Emit quadViewChanged with enabled: true
    controls.compareControl.emit('quadViewChanged', {
      enabled: true,
      sources: ['A', 'B', 'A', 'B'] as const,
    });

    // Should have warned
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Quad View is not yet connected to the viewer'),
    );

    // Should NOT have called any viewer rendering method for quad layout
    // (no setQuadViewState or similar exists on the viewer)
    expect(viewer.setWipeState).not.toHaveBeenCalled();
    expect(viewer.setDifferenceMatteState).not.toHaveBeenCalled();
    expect(viewer.setBlendModeState).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('should NOT log a warning when quad view is disabled, and no viewer methods are called', () => {
    const { ctx, viewer, controls } = createMockContext();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    wiringResult = wireViewControls(ctx);

    controls.compareControl.emit('quadViewChanged', {
      enabled: false,
      sources: ['A', 'B', 'A', 'B'] as const,
    });

    // The warn for quad view should NOT fire when enabled is false
    const quadWarns = warnSpy.mock.calls.filter((args) =>
      typeof args[0] === 'string' && args[0].includes('Quad View'),
    );
    expect(quadWarns).toHaveLength(0);

    // Confirm disabled is truly a no-op: no viewer methods were called
    expect(viewer.setWipeState).not.toHaveBeenCalled();
    expect(viewer.setDifferenceMatteState).not.toHaveBeenCalled();
    expect(viewer.setBlendModeState).not.toHaveBeenCalled();
    expect(viewer.setToneMappingState).not.toHaveBeenCalled();
    expect(viewer.setHDROutputMode).not.toHaveBeenCalled();
    expect(viewer.setGhostFrameState).not.toHaveBeenCalled();
    expect(viewer.setChannelMode).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('should wire wipe, A/B, difference matte, and blend mode to the viewer (not quad)', () => {
    const { ctx, viewer, controls } = createMockContext();
    wiringResult = wireViewControls(ctx);

    // Wipe is wired
    controls.compareControl.emit('wipeModeChanged', 'horizontal');
    expect(viewer.setWipeState).toHaveBeenCalled();

    // Difference matte is wired
    controls.compareControl.emit('differenceMatteChanged', { enabled: true, gain: 1, heatmap: false });
    expect(viewer.setDifferenceMatteState).toHaveBeenCalled();

    // Blend mode is wired
    controls.compareControl.emit('blendModeChanged', { mode: 'onionskin', onionOpacity: 0.5, flickerRate: 5, blendRatio: 0.5 });
    expect(viewer.setBlendModeState).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Documentation accurately reflects the preview status
//
// These string-matching tests are intentional regression guards for issue #472.
// They ensure that documentation continues to describe Quad View as a
// preview/experimental feature and does not regress to presenting it as fully
// functional. If the feature is promoted to stable in the future, update these
// tests accordingly.
// ---------------------------------------------------------------------------
describe('Issue #472: advanced-compare.md reflects Quad View preview status', () => {
  // @ts-ignore -- __dirname available in test environment
  const docsPath = resolve(__dirname, '..', 'docs', 'compare', 'advanced-compare.md');
  let content: string;

  beforeEach(() => {
    content = readFileSync(docsPath, 'utf-8');
  });

  it('should have a heading that includes "(Preview)"', () => {
    expect(content).toMatch(/^## Quad View \(Preview\)/m);
  });

  it('should contain a status note about the feature being preview/experimental', () => {
    expect(content).toContain('Preview / Experimental');
  });

  it('should state that Quad View is not yet connected to the viewer rendering pipeline', () => {
    expect(content).toContain('not yet connected to the viewer rendering pipeline');
  });

  it('should use future tense ("will") when describing Quad View behavior', () => {
    // The paragraph after the status note should use "will" rather than present tense
    const quadSection = content.split('## Quad View (Preview)')[1]?.split('##')[0];
    expect(quadSection).toBeDefined();
    expect(quadSection).toContain('will divide');
    expect(quadSection).toContain('will be useful');
    expect(quadSection).toContain('will operate');
    expect(quadSection).toContain('will stay in sync');
  });

  it('should NOT present Quad View as a fully working comparison mode', () => {
    // The old text said "divides" (present tense, implying it works now)
    // After the fix, only "will divide" should appear
    const quadSection = content.split('## Quad View (Preview)')[1]?.split('##')[0];
    expect(quadSection).toBeDefined();
    // Should not have bare present-tense "divides" (only "will divide")
    expect(quadSection).not.toMatch(/(?<!\w)divides(?!\w)/);
  });

  it('should annotate the multi-version workflow step about quad view being preview', () => {
    expect(content).toMatch(/quad view is currently a preview feature/i);
  });
});
