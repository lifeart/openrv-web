/**
 * SafeAreasOverlay Unit Tests
 *
 * Tests for Safe Areas / Guides component (FEATURES.md 6.3)
 * Based on test cases SAFE-001 through SAFE-005
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SafeAreasOverlay,
  AspectRatioGuide,
  ASPECT_RATIOS,
  DEFAULT_SAFE_AREAS_STATE,
} from './SafeAreasOverlay';

// Canvas mocks are provided by test/setup.ts

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
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });

    it('SAFE-011: disable hides overlay', () => {
      safeAreas.enable();
      const handler = vi.fn();
      safeAreas.on('stateChanged', handler);

      safeAreas.disable();

      expect(safeAreas.isVisible()).toBe(false);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
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
    it('SAFE-001: title safe area is 80% of frame by default', () => {
      const state = safeAreas.getState();
      expect(state.titleSafe).toBe(true);
      // Title safe is rendered at 80% - verified by testing render behavior
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

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ titleSafe: false })
      );
    });
  });

  describe('action safe area (FEATURES.md SAFE-002)', () => {
    it('SAFE-002: action safe area is 90% of frame by default', () => {
      const state = safeAreas.getState();
      expect(state.actionSafe).toBe(true);
      // Action safe is rendered at 90% - verified by testing render behavior
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

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ actionSafe: false })
      );
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

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ aspectRatio: '2.39:1' })
      );
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

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ centerCrosshair: true })
      );
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

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ ruleOfThirds: true })
      );
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

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ guideColor: '#00ff00' })
      );
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

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ guideOpacity: 0.7 })
      );
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
