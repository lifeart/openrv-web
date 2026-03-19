/**
 * SafeAreasOverlay Unit Tests
 *
 * Tests for Safe Areas / Guides component (FEATURES.md 6.3)
 * Based on test cases SAFE-001 through SAFE-005
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SafeAreasOverlay, type AspectRatioGuide, ASPECT_RATIOS, DEFAULT_SAFE_AREAS_STATE } from './SafeAreasOverlay';
import type { CropRegion } from './CropControl';

// Canvas mocks are provided by test/setup.ts

describe('SafeAreasOverlay hi-DPI support', () => {
  let safeAreas: SafeAreasOverlay;
  let originalDevicePixelRatio: number;

  const setDevicePixelRatio = (value: number) => {
    Object.defineProperty(window, 'devicePixelRatio', {
      value,
      writable: true,
      configurable: true,
    });
  };

  beforeEach(() => {
    originalDevicePixelRatio = window.devicePixelRatio;
  });

  afterEach(() => {
    if (safeAreas) {
      safeAreas.dispose();
    }
    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDevicePixelRatio,
      writable: true,
      configurable: true,
    });
  });

  it('SAFE-130: canvas physical dimensions scale with DPR after setViewerDimensions', () => {
    setDevicePixelRatio(2);
    safeAreas = new SafeAreasOverlay();
    const canvas = safeAreas.getElement();

    safeAreas.setViewerDimensions(800, 600, 0, 0, 800, 600);

    // Physical dimensions should be 2x logical (800x600 -> 1600x1200)
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
  });

  it('SAFE-131: canvas renders correctly at 3x DPR', () => {
    setDevicePixelRatio(3);
    safeAreas = new SafeAreasOverlay();
    const canvas = safeAreas.getElement();

    safeAreas.setViewerDimensions(800, 600, 0, 0, 800, 600);

    expect(canvas.width).toBe(2400);
    expect(canvas.height).toBe(1800);
  });

  it('SAFE-132: render works correctly at high DPR', () => {
    setDevicePixelRatio(2);
    safeAreas = new SafeAreasOverlay();

    safeAreas.setState({
      enabled: true,
      titleSafe: true,
      actionSafe: true,
      centerCrosshair: true,
      ruleOfThirds: true,
      aspectRatio: '16:9',
    });
    safeAreas.setViewerDimensions(800, 600, 0, 0, 800, 600);

    expect(() => safeAreas.render()).not.toThrow();
  });

  it('SAFE-133: guide drawing works at high DPR', () => {
    setDevicePixelRatio(2);
    safeAreas = new SafeAreasOverlay();

    safeAreas.enable();
    safeAreas.setViewerDimensions(1920, 1080, 0, 0, 1920, 1080);

    // All guide options should render without error at high DPR
    expect(() => {
      safeAreas.toggleTitleSafe();
      safeAreas.toggleActionSafe();
      safeAreas.toggleCenterCrosshair();
      safeAreas.toggleRuleOfThirds();
      safeAreas.setAspectRatio('2.39:1');
    }).not.toThrow();
  });
});

describe('SafeAreasOverlay', () => {
  let safeAreas: SafeAreasOverlay;

  beforeEach(() => {
    safeAreas = new SafeAreasOverlay();
  });

  afterEach(() => {
    safeAreas.dispose();
  });

  describe('initialization', () => {
    it('SAFE-001: starts disabled', () => {
      expect(safeAreas.isVisible()).toBe(false);
    });

    it('SAFE-002: default state matches specification', () => {
      expect(DEFAULT_SAFE_AREAS_STATE).toEqual({
        enabled: false,
        titleSafe: true,
        actionSafe: true,
        centerCrosshair: false,
        ruleOfThirds: false,
        aspectRatio: null,
        guideColor: '#ffffff',
        guideOpacity: 0.5,
      });
    });

    it('SAFE-003: provides canvas element', () => {
      const element = safeAreas.getElement();
      expect(element).toBeInstanceOf(HTMLCanvasElement);
      expect(element.className).toContain('safe-areas-overlay');
    });

    it('SAFE-004: canvas has correct data-testid', () => {
      const element = safeAreas.getElement();
      expect(element.dataset.testid).toBe('safe-areas-overlay');
    });
  });

  describe('enable/disable', () => {
    it('SAFE-010: enable shows overlay', () => {
      const handler = vi.fn();
      safeAreas.on('stateChanged', handler);

      safeAreas.enable();

      expect(safeAreas.isVisible()).toBe(true);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('SAFE-011: disable hides overlay', () => {
      safeAreas.enable();
      const handler = vi.fn();
      safeAreas.on('stateChanged', handler);

      safeAreas.disable();

      expect(safeAreas.isVisible()).toBe(false);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });

    it('SAFE-004: toggle enables/disables (FEATURES.md SAFE-004)', () => {
      expect(safeAreas.isVisible()).toBe(false);

      safeAreas.toggle();
      expect(safeAreas.isVisible()).toBe(true);

      safeAreas.toggle();
      expect(safeAreas.isVisible()).toBe(false);
    });
  });

  describe('title safe area (FEATURES.md SAFE-001)', () => {
    it('SAFE-001: title safe area is 90% of frame by default (SMPTE RP 2046-2:2018)', () => {
      const state = safeAreas.getState();
      expect(state.titleSafe).toBe(true);
      // Title safe is rendered at 90% - verified by testing render behavior
    });

    it('SAFE-020: toggleTitleSafe toggles title safe', () => {
      expect(safeAreas.getState().titleSafe).toBe(true);

      safeAreas.toggleTitleSafe();
      expect(safeAreas.getState().titleSafe).toBe(false);

      safeAreas.toggleTitleSafe();
      expect(safeAreas.getState().titleSafe).toBe(true);
    });

    it('SAFE-021: toggleTitleSafe emits stateChanged', () => {
      const handler = vi.fn();
      safeAreas.on('stateChanged', handler);

      safeAreas.toggleTitleSafe();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ titleSafe: false }));
    });
  });

  describe('action safe area (FEATURES.md SAFE-002)', () => {
    it('SAFE-002: action safe area is 93% of frame by default (SMPTE RP 2046-2:2018)', () => {
      const state = safeAreas.getState();
      expect(state.actionSafe).toBe(true);
      // Action safe is rendered at 93% - verified by testing render behavior
    });

    it('SAFE-030: toggleActionSafe toggles action safe', () => {
      expect(safeAreas.getState().actionSafe).toBe(true);

      safeAreas.toggleActionSafe();
      expect(safeAreas.getState().actionSafe).toBe(false);

      safeAreas.toggleActionSafe();
      expect(safeAreas.getState().actionSafe).toBe(true);
    });

    it('SAFE-031: toggleActionSafe emits stateChanged', () => {
      const handler = vi.fn();
      safeAreas.on('stateChanged', handler);

      safeAreas.toggleActionSafe();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ actionSafe: false }));
    });
  });

  describe('aspect ratio guides (FEATURES.md SAFE-003)', () => {
    it('SAFE-003: aspect ratio shows letterbox/pillarbox', () => {
      safeAreas.setAspectRatio('2.39:1');

      const state = safeAreas.getState();
      expect(state.aspectRatio).toBe('2.39:1');
    });

    it('SAFE-040: setAspectRatio changes aspect ratio', () => {
      const ratios: AspectRatioGuide[] = ['16:9', '4:3', '1:1', '2.39:1', '2.35:1', '1.85:1', '9:16'];

      for (const ratio of ratios) {
        safeAreas.setAspectRatio(ratio);
        expect(safeAreas.getState().aspectRatio).toBe(ratio);
      }
    });

    it('SAFE-041: setAspectRatio null removes guide', () => {
      safeAreas.setAspectRatio('16:9');
      safeAreas.setAspectRatio(null);

      expect(safeAreas.getState().aspectRatio).toBeNull();
    });

    it('SAFE-042: setAspectRatio emits stateChanged', () => {
      const handler = vi.fn();
      safeAreas.on('stateChanged', handler);

      safeAreas.setAspectRatio('2.39:1');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ aspectRatio: '2.39:1' }));
    });

    it('SAFE-043: custom aspect ratio can be set', () => {
      safeAreas.setAspectRatio('custom');
      safeAreas.setCustomAspectRatio(1.777);

      expect(safeAreas.getState().aspectRatio).toBe('custom');
    });

    it('SAFE-044: ASPECT_RATIOS contains all standard ratios', () => {
      expect(ASPECT_RATIOS['16:9'].ratio).toBeCloseTo(16 / 9);
      expect(ASPECT_RATIOS['4:3'].ratio).toBeCloseTo(4 / 3);
      expect(ASPECT_RATIOS['1:1'].ratio).toBe(1);
      expect(ASPECT_RATIOS['2.39:1'].ratio).toBe(2.39);
      expect(ASPECT_RATIOS['2.35:1'].ratio).toBe(2.35);
      expect(ASPECT_RATIOS['1.85:1'].ratio).toBe(1.85);
      expect(ASPECT_RATIOS['9:16'].ratio).toBeCloseTo(9 / 16);
    });

    it('SAFE-045: ASPECT_RATIOS has labels', () => {
      expect(ASPECT_RATIOS['16:9'].label).toBe('16:9 (HD)');
      expect(ASPECT_RATIOS['4:3'].label).toBe('4:3 (SD)');
      expect(ASPECT_RATIOS['2.39:1'].label).toBe('2.39:1 (Scope)');
    });
  });

  describe('center crosshair', () => {
    it('SAFE-050: center crosshair defaults to off', () => {
      expect(safeAreas.getState().centerCrosshair).toBe(false);
    });

    it('SAFE-051: toggleCenterCrosshair toggles crosshair', () => {
      safeAreas.toggleCenterCrosshair();
      expect(safeAreas.getState().centerCrosshair).toBe(true);

      safeAreas.toggleCenterCrosshair();
      expect(safeAreas.getState().centerCrosshair).toBe(false);
    });

    it('SAFE-052: toggleCenterCrosshair emits stateChanged', () => {
      const handler = vi.fn();
      safeAreas.on('stateChanged', handler);

      safeAreas.toggleCenterCrosshair();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ centerCrosshair: true }));
    });
  });

  describe('rule of thirds', () => {
    it('SAFE-060: rule of thirds defaults to off', () => {
      expect(safeAreas.getState().ruleOfThirds).toBe(false);
    });

    it('SAFE-061: toggleRuleOfThirds toggles grid', () => {
      safeAreas.toggleRuleOfThirds();
      expect(safeAreas.getState().ruleOfThirds).toBe(true);

      safeAreas.toggleRuleOfThirds();
      expect(safeAreas.getState().ruleOfThirds).toBe(false);
    });

    it('SAFE-062: toggleRuleOfThirds emits stateChanged', () => {
      const handler = vi.fn();
      safeAreas.on('stateChanged', handler);

      safeAreas.toggleRuleOfThirds();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ ruleOfThirds: true }));
    });
  });

  describe('guide customization (FEATURES.md SAFE-005)', () => {
    it('SAFE-005: colors customizable', () => {
      safeAreas.setGuideColor('#ff0000');
      expect(safeAreas.getState().guideColor).toBe('#ff0000');
    });

    it('SAFE-070: setGuideColor emits stateChanged', () => {
      const handler = vi.fn();
      safeAreas.on('stateChanged', handler);

      safeAreas.setGuideColor('#00ff00');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ guideColor: '#00ff00' }));
    });

    it('SAFE-071: setGuideOpacity changes opacity', () => {
      safeAreas.setGuideOpacity(0.8);
      expect(safeAreas.getState().guideOpacity).toBe(0.8);
    });

    it('SAFE-072: setGuideOpacity clamps to 0-1', () => {
      safeAreas.setGuideOpacity(-0.5);
      expect(safeAreas.getState().guideOpacity).toBe(0);

      safeAreas.setGuideOpacity(1.5);
      expect(safeAreas.getState().guideOpacity).toBe(1);
    });

    it('SAFE-073: setGuideOpacity emits stateChanged', () => {
      const handler = vi.fn();
      safeAreas.on('stateChanged', handler);

      safeAreas.setGuideOpacity(0.7);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ guideOpacity: 0.7 }));
    });
  });

  describe('setState', () => {
    it('SAFE-080: setState updates multiple properties', () => {
      safeAreas.setState({
        enabled: true,
        titleSafe: false,
        actionSafe: false,
        centerCrosshair: true,
        ruleOfThirds: true,
        aspectRatio: '16:9',
        guideColor: '#00ffff',
        guideOpacity: 0.3,
      });

      const state = safeAreas.getState();
      expect(state.enabled).toBe(true);
      expect(state.titleSafe).toBe(false);
      expect(state.actionSafe).toBe(false);
      expect(state.centerCrosshair).toBe(true);
      expect(state.ruleOfThirds).toBe(true);
      expect(state.aspectRatio).toBe('16:9');
      expect(state.guideColor).toBe('#00ffff');
      expect(state.guideOpacity).toBe(0.3);
    });

    it('SAFE-081: setState preserves unspecified properties', () => {
      safeAreas.setGuideColor('#ff0000');
      safeAreas.setState({ enabled: true });

      expect(safeAreas.getState().guideColor).toBe('#ff0000');
    });

    it('SAFE-082: setState emits stateChanged once', () => {
      const handler = vi.fn();
      safeAreas.on('stateChanged', handler);

      safeAreas.setState({
        enabled: true,
        titleSafe: false,
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getState', () => {
    it('SAFE-090: getState returns copy', () => {
      const state1 = safeAreas.getState();
      state1.enabled = true;
      const state2 = safeAreas.getState();

      expect(state2.enabled).toBe(false);
    });

    it('SAFE-091: getState includes all properties', () => {
      const state = safeAreas.getState();

      expect(state).toHaveProperty('enabled');
      expect(state).toHaveProperty('titleSafe');
      expect(state).toHaveProperty('actionSafe');
      expect(state).toHaveProperty('centerCrosshair');
      expect(state).toHaveProperty('ruleOfThirds');
      expect(state).toHaveProperty('aspectRatio');
      expect(state).toHaveProperty('guideColor');
      expect(state).toHaveProperty('guideOpacity');
    });
  });

  describe('setViewerDimensions', () => {
    it('SAFE-100: setViewerDimensions updates canvas size', () => {
      const canvas = safeAreas.getElement();

      safeAreas.setViewerDimensions(800, 600, 0, 0, 800, 600);

      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(600);
    });

    it('SAFE-101: setViewerDimensions triggers render when enabled', () => {
      safeAreas.enable();

      // Should not throw
      expect(() => {
        safeAreas.setViewerDimensions(800, 600, 0, 0, 800, 600);
      }).not.toThrow();
    });
  });

  describe('render', () => {
    it('SAFE-110: render clears canvas when disabled', () => {
      safeAreas.setViewerDimensions(100, 100, 0, 0, 100, 100);

      // Enable then disable
      safeAreas.enable();
      safeAreas.disable();

      // Render should not throw
      expect(() => {
        safeAreas.render();
      }).not.toThrow();
    });

    it('SAFE-111: render handles zero dimensions', () => {
      safeAreas.enable();
      safeAreas.setViewerDimensions(0, 0, 0, 0, 0, 0);

      // Should not throw
      expect(() => {
        safeAreas.render();
      }).not.toThrow();
    });

    it('SAFE-112: render works with all options enabled', () => {
      safeAreas.setState({
        enabled: true,
        titleSafe: true,
        actionSafe: true,
        centerCrosshair: true,
        ruleOfThirds: true,
        aspectRatio: '16:9',
      });
      safeAreas.setViewerDimensions(800, 600, 0, 0, 800, 600);

      // Should not throw
      expect(() => {
        safeAreas.render();
      }).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('SAFE-120: dispose cleans up resources', () => {
      safeAreas.enable();

      // Should not throw
      expect(() => {
        safeAreas.dispose();
      }).not.toThrow();
    });
  });
});

describe('Compositing: display:none for inactive overlay', () => {
  it('SA-DISP-001: canvas starts with display:none', () => {
    const overlay = new SafeAreasOverlay();
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });

  it('SA-DISP-002: canvas shown when enabled', () => {
    const overlay = new SafeAreasOverlay();
    overlay.setState({ enabled: true });
    expect(overlay.getElement().style.display).toBe('');
    overlay.dispose();
  });

  it('SA-DISP-003: canvas hidden when disabled after being enabled', () => {
    const overlay = new SafeAreasOverlay();
    overlay.setState({ enabled: true });
    overlay.setState({ enabled: false });
    expect(overlay.getElement().style.display).toBe('none');
    overlay.dispose();
  });

  it('SA-DISP-004: canvas shown after setViewerDimensions when enabled', () => {
    const overlay = new SafeAreasOverlay();
    overlay.setState({ enabled: true });
    overlay.setViewerDimensions(800, 600, 0, 0, 800, 600);
    expect(overlay.getElement().style.display).toBe('');
    overlay.dispose();
  });
});

describe('SMPTE RP 2046-2:2018 safe area percentages (Issue #482)', () => {
  let overlay: SafeAreasOverlay;

  beforeEach(() => {
    overlay = new SafeAreasOverlay();
    overlay.setViewerDimensions(1000, 1000, 0, 0, 1000, 1000);
  });

  afterEach(() => {
    overlay.dispose();
  });

  it('SAFE-200: action safe area uses 93% (3.5% inset per edge)', () => {
    overlay.setState({ enabled: true, actionSafe: true, titleSafe: false });

    // Access the internal ctx that was captured at construction time
    const ctx = (overlay as unknown as { ctx: CanvasRenderingContext2D }).ctx;
    const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

    overlay.render();

    // Action safe: 93% of 1000 = 930, margin = (1-0.93)/2 * 1000 = 35
    const actionCall = strokeRectSpy.mock.calls.find(
      ([_x, _y, w, h]) => Math.abs(w - 930) < 1 && Math.abs(h - 930) < 1,
    );
    expect(actionCall).toBeDefined();
    expect(actionCall![0]).toBeCloseTo(35, 0); // x offset
    expect(actionCall![1]).toBeCloseTo(35, 0); // y offset
    expect(actionCall![2]).toBeCloseTo(930, 0); // width
    expect(actionCall![3]).toBeCloseTo(930, 0); // height
  });

  it('SAFE-201: title safe area uses 90% (5% inset per edge)', () => {
    overlay.setState({ enabled: true, actionSafe: false, titleSafe: true });

    const ctx = (overlay as unknown as { ctx: CanvasRenderingContext2D }).ctx;
    const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

    overlay.render();

    // Title safe: 90% of 1000 = 900, margin = (1-0.9)/2 * 1000 = 50
    const titleCall = strokeRectSpy.mock.calls.find(
      ([_x, _y, w, h]) => Math.abs(w - 900) < 1 && Math.abs(h - 900) < 1,
    );
    expect(titleCall).toBeDefined();
    expect(titleCall![0]).toBeCloseTo(50, 0); // x offset
    expect(titleCall![1]).toBeCloseTo(50, 0); // y offset
    expect(titleCall![2]).toBeCloseTo(900, 0); // width
    expect(titleCall![3]).toBeCloseTo(900, 0); // height
  });

  it('SAFE-202: action safe is NOT 90% (old incorrect value)', () => {
    overlay.setState({ enabled: true, actionSafe: true, titleSafe: false });

    const ctx = (overlay as unknown as { ctx: CanvasRenderingContext2D }).ctx;
    const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

    overlay.render();

    // Should NOT find a 900x900 rect (that was the old incorrect action safe)
    const oldActionCall = strokeRectSpy.mock.calls.find(
      ([_x, _y, w, h]) => Math.abs(w - 900) < 1 && Math.abs(h - 900) < 1,
    );
    expect(oldActionCall).toBeUndefined();
  });

  it('SAFE-203: title safe is NOT 80% (old incorrect value)', () => {
    overlay.setState({ enabled: true, actionSafe: false, titleSafe: true });

    const ctx = (overlay as unknown as { ctx: CanvasRenderingContext2D }).ctx;
    const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

    overlay.render();

    // Should NOT find an 800x800 rect (that was the old incorrect title safe)
    const oldTitleCall = strokeRectSpy.mock.calls.find(
      ([_x, _y, w, h]) => Math.abs(w - 800) < 1 && Math.abs(h - 800) < 1,
    );
    expect(oldTitleCall).toBeUndefined();
  });

  it('SAFE-204: both safe areas render at correct SMPTE percentages simultaneously', () => {
    overlay.setState({ enabled: true, actionSafe: true, titleSafe: true });

    const ctx = (overlay as unknown as { ctx: CanvasRenderingContext2D }).ctx;
    const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

    overlay.render();

    const calls = strokeRectSpy.mock.calls;
    // Should have at least 2 strokeRect calls (action + title)
    expect(calls.length).toBeGreaterThanOrEqual(2);

    // Action safe: 93% -> 930x930 at offset 35,35
    const actionCall = calls.find(([_x, _y, w]) => Math.abs(w - 930) < 1);
    expect(actionCall).toBeDefined();

    // Title safe: 90% -> 900x900 at offset 50,50
    const titleCall = calls.find(([_x, _y, w]) => Math.abs(w - 900) < 1);
    expect(titleCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Issue #480: Safe areas respect crop region
// ---------------------------------------------------------------------------
describe('Safe areas crop-region support (Issue #480)', () => {
  let overlay: SafeAreasOverlay;

  beforeEach(() => {
    overlay = new SafeAreasOverlay();
    // 1000x1000 display for easy math
    overlay.setViewerDimensions(1000, 1000, 0, 0, 1000, 1000);
  });

  afterEach(() => {
    overlay.dispose();
  });

  // -------------------------------------------------------------------------
  // setCropRegion / getCropRegion
  // -------------------------------------------------------------------------

  it('SAFE-300: getCropRegion returns null by default', () => {
    expect(overlay.getCropRegion()).toBeNull();
  });

  it('SAFE-301: setCropRegion stores and getCropRegion returns a copy', () => {
    const crop: CropRegion = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
    overlay.setCropRegion(crop);
    const result = overlay.getCropRegion();
    expect(result).toEqual(crop);
    // Must be a copy, not the same reference
    expect(result).not.toBe(crop);
  });

  it('SAFE-302: setCropRegion(null) clears the crop region', () => {
    overlay.setCropRegion({ x: 0.1, y: 0.2, width: 0.5, height: 0.6 });
    overlay.setCropRegion(null);
    expect(overlay.getCropRegion()).toBeNull();
  });

  it('SAFE-303: setCropRegion triggers render when visible', () => {
    overlay.setState({ enabled: true });
    const renderSpy = vi.spyOn(overlay, 'render');
    overlay.setCropRegion({ x: 0.1, y: 0.2, width: 0.5, height: 0.6 });
    expect(renderSpy).toHaveBeenCalled();
  });

  it('SAFE-304: setCropRegion does not render when overlay is hidden', () => {
    overlay.setState({ enabled: false });
    const renderSpy = vi.spyOn(overlay, 'render');
    overlay.setCropRegion({ x: 0.1, y: 0.2, width: 0.5, height: 0.6 });
    expect(renderSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Safe area drawing with crop region active
  // -------------------------------------------------------------------------

  it('SAFE-310: action safe area is drawn relative to crop region', () => {
    // Crop to right half: x=0.5, y=0, w=0.5, h=1.0
    // Effective region: offset (500,0), size (500,1000)
    overlay.setCropRegion({ x: 0.5, y: 0, width: 0.5, height: 1 });
    overlay.setState({ enabled: true, actionSafe: true, titleSafe: false });

    const ctx = (overlay as unknown as { ctx: CanvasRenderingContext2D }).ctx;
    const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

    overlay.render();

    // Action safe: 93% of 500x1000
    // width = 500 * 0.93 = 465, height = 1000 * 0.93 = 930
    // margin_x = 500 * (1-0.93)/2 = 17.5, margin_y = 1000 * (1-0.93)/2 = 35
    // x = 500 + 17.5 = 517.5, y = 0 + 35 = 35
    const actionCall = strokeRectSpy.mock.calls.find(
      ([_x, _y, w, h]) => Math.abs(w - 465) < 1 && Math.abs(h - 930) < 1,
    );
    expect(actionCall).toBeDefined();
    expect(actionCall![0]).toBeCloseTo(517.5, 0); // x offset
    expect(actionCall![1]).toBeCloseTo(35, 0); // y offset
  });

  it('SAFE-311: title safe area is drawn relative to crop region', () => {
    // Crop to center 50%: x=0.25, y=0.25, w=0.5, h=0.5
    // Effective region: offset (250,250), size (500,500)
    overlay.setCropRegion({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    overlay.setState({ enabled: true, actionSafe: false, titleSafe: true });

    const ctx = (overlay as unknown as { ctx: CanvasRenderingContext2D }).ctx;
    const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

    overlay.render();

    // Title safe: 90% of 500x500
    // width = 500 * 0.9 = 450, height = 500 * 0.9 = 450
    // margin = 500 * 0.05 = 25
    // x = 250 + 25 = 275, y = 250 + 25 = 275
    const titleCall = strokeRectSpy.mock.calls.find(
      ([_x, _y, w, h]) => Math.abs(w - 450) < 1 && Math.abs(h - 450) < 1,
    );
    expect(titleCall).toBeDefined();
    expect(titleCall![0]).toBeCloseTo(275, 0);
    expect(titleCall![1]).toBeCloseTo(275, 0);
  });

  it('SAFE-312: without crop, safe areas use full display (backward compat)', () => {
    overlay.setState({ enabled: true, actionSafe: true, titleSafe: false });

    const ctx = (overlay as unknown as { ctx: CanvasRenderingContext2D }).ctx;
    const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

    overlay.render();

    // Action safe: 93% of 1000x1000 = 930x930 at offset 35,35
    const actionCall = strokeRectSpy.mock.calls.find(
      ([_x, _y, w, h]) => Math.abs(w - 930) < 1 && Math.abs(h - 930) < 1,
    );
    expect(actionCall).toBeDefined();
    expect(actionCall![0]).toBeCloseTo(35, 0);
    expect(actionCall![1]).toBeCloseTo(35, 0);
  });

  it('SAFE-313: clearing crop restores full-display safe areas', () => {
    overlay.setCropRegion({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    overlay.setState({ enabled: true, actionSafe: true, titleSafe: false });

    // Clear crop
    overlay.setCropRegion(null);

    const ctx = (overlay as unknown as { ctx: CanvasRenderingContext2D }).ctx;
    const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

    overlay.render();

    // Should be full display: 930x930 at 35,35
    const actionCall = strokeRectSpy.mock.calls.find(
      ([_x, _y, w, h]) => Math.abs(w - 930) < 1 && Math.abs(h - 930) < 1,
    );
    expect(actionCall).toBeDefined();
    expect(actionCall![0]).toBeCloseTo(35, 0);
    expect(actionCall![1]).toBeCloseTo(35, 0);
  });

  // -------------------------------------------------------------------------
  // Center crosshair with crop
  // -------------------------------------------------------------------------

  it('SAFE-320: center crosshair is centered on cropped region', () => {
    // Crop to bottom-right quarter: x=0.5, y=0.5, w=0.5, h=0.5
    // Effective region: offset (500,500), size (500,500)
    // Center: (750, 750)
    overlay.setCropRegion({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
    overlay.setState({
      enabled: true,
      actionSafe: false,
      titleSafe: false,
      centerCrosshair: true,
    });

    const ctx = (overlay as unknown as { ctx: CanvasRenderingContext2D }).ctx;
    const moveToSpy = vi.spyOn(ctx, 'moveTo');

    overlay.render();

    // The crosshair should be centered at (750, 750)
    // moveTo calls include horizontal and vertical lines around center
    const moveToArgs = moveToSpy.mock.calls.map(([x, y]) => [x as number, y as number]);

    // At least one moveTo should reference x=750 or y=750
    const hasCenterX = moveToArgs.some(([x]) => Math.abs(x! - 750) < 1);
    const hasCenterY = moveToArgs.some(([, y]) => Math.abs(y! - 750) < 1);
    expect(hasCenterX).toBe(true);
    expect(hasCenterY).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Rule of thirds with crop
  // -------------------------------------------------------------------------

  it('SAFE-330: rule of thirds grid is drawn relative to crop region', () => {
    // Crop to left half: x=0, y=0, w=0.5, h=1.0
    // Effective region: offset (0,0), size (500,1000)
    overlay.setCropRegion({ x: 0, y: 0, width: 0.5, height: 1 });
    overlay.setState({
      enabled: true,
      actionSafe: false,
      titleSafe: false,
      ruleOfThirds: true,
    });

    const ctx = (overlay as unknown as { ctx: CanvasRenderingContext2D }).ctx;
    const moveToSpy = vi.spyOn(ctx, 'moveTo');

    overlay.render();

    // Vertical thirds of 500px: 500/3 ~= 166.67, 500*2/3 ~= 333.33
    // Horizontal thirds of 1000px: 1000/3 ~= 333.33, 1000*2/3 ~= 666.67
    const moveToArgs = moveToSpy.mock.calls.map(([x, y]) => [x as number, y as number]);

    // Check for vertical third line at ~166.67
    const hasFirstVertical = moveToArgs.some(([x]) => Math.abs(x! - 500 / 3) < 1);
    expect(hasFirstVertical).toBe(true);

    // Check for horizontal third line at ~333.33
    const hasFirstHorizontal = moveToArgs.some(([, y]) => Math.abs(y! - 1000 / 3) < 1);
    expect(hasFirstHorizontal).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Aspect ratio guide with crop
  // -------------------------------------------------------------------------

  it('SAFE-340: aspect ratio guide is drawn relative to crop region', () => {
    // Crop to a 500x500 square region
    overlay.setCropRegion({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    overlay.setState({
      enabled: true,
      actionSafe: false,
      titleSafe: false,
      aspectRatio: '16:9',
    });

    const ctx = (overlay as unknown as { ctx: CanvasRenderingContext2D }).ctx;
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');

    overlay.render();

    // 16:9 in a 500x500 cropped region -> letterbox
    // newHeight = 500 / (16/9) = 281.25, barHeight = (500-281.25)/2 = 109.375
    // fillRect calls for top bar: (250, 250, 500, 109.375)
    const letterboxBar = fillRectSpy.mock.calls.find(
      ([x, _y, w, h]) => Math.abs(x - 250) < 1 && Math.abs(w - 500) < 1 && Math.abs(h - 109.375) < 1,
    );
    expect(letterboxBar).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Full-frame crop region (no change from default)
  // -------------------------------------------------------------------------

  it('SAFE-350: full-frame crop region behaves same as no crop', () => {
    overlay.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });
    overlay.setState({ enabled: true, actionSafe: true, titleSafe: false });

    const ctx = (overlay as unknown as { ctx: CanvasRenderingContext2D }).ctx;
    const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

    overlay.render();

    // Same as no crop: 930x930 at 35,35
    const actionCall = strokeRectSpy.mock.calls.find(
      ([_x, _y, w, h]) => Math.abs(w - 930) < 1 && Math.abs(h - 930) < 1,
    );
    expect(actionCall).toBeDefined();
    expect(actionCall![0]).toBeCloseTo(35, 0);
    expect(actionCall![1]).toBeCloseTo(35, 0);
  });
});
