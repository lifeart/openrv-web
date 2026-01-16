/**
 * Viewer Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Viewer } from './Viewer';
import { Session } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { DEFAULT_COLOR_ADJUSTMENTS } from './ColorControls';
import { DEFAULT_TRANSFORM } from './TransformControl';
import { DEFAULT_FILTER_SETTINGS } from './FilterControl';
import { DEFAULT_CROP_STATE, DEFAULT_CROP_REGION } from './CropControl';
import { DEFAULT_CDL } from '../../color/CDL';
import { DEFAULT_LENS_PARAMS } from '../../transform/LensDistortion';

// Mock WebGLLUTProcessor
vi.mock('../../color/WebGLLUT', () => ({
  WebGLLUTProcessor: vi.fn().mockImplementation(() => ({
    setLUT: vi.fn(),
    hasLUT: vi.fn().mockReturnValue(false),
    applyToCanvas: vi.fn(),
    dispose: vi.fn(),
  })),
}));

describe('Viewer', () => {
  let session: Session;
  let paintEngine: PaintEngine;
  let viewer: Viewer;

  beforeEach(() => {
    session = new Session();
    paintEngine = new PaintEngine();
    viewer = new Viewer(session, paintEngine);
  });

  afterEach(() => {
    viewer.dispose();
  });

  describe('initialization', () => {
    it('VWR-001: creates viewer element', () => {
      const element = viewer.getElement();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.className).toBe('viewer-container');
    });

    it('VWR-002: starts with default zoom level', () => {
      expect(viewer.getZoom()).toBe(1);
    });

    it('VWR-003: starts with default pan position', () => {
      const pan = viewer.getPan();
      expect(pan.x).toBe(0);
      expect(pan.y).toBe(0);
    });

    it('VWR-004: starts with default color adjustments', () => {
      const adjustments = viewer.getColorAdjustments();
      expect(adjustments).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
    });

    it('VWR-005: starts with default transform', () => {
      const transform = viewer.getTransform();
      expect(transform).toEqual(DEFAULT_TRANSFORM);
    });

    it('VWR-006: starts with default filter settings', () => {
      const settings = viewer.getFilterSettings();
      expect(settings).toEqual(DEFAULT_FILTER_SETTINGS);
    });

    it('VWR-007: starts with no LUT', () => {
      expect(viewer.getLUT()).toBeNull();
    });

    it('VWR-008: starts with default LUT intensity', () => {
      expect(viewer.getLUTIntensity()).toBe(1);
    });
  });

  describe('resize and render', () => {
    it('VWR-009: resize does not throw', () => {
      expect(() => {
        viewer.resize();
      }).not.toThrow();
    });

    it('VWR-010: refresh triggers render', () => {
      expect(() => {
        viewer.refresh();
      }).not.toThrow();
    });

    it('VWR-011: render does not throw', () => {
      expect(() => {
        viewer.render();
      }).not.toThrow();
    });
  });

  describe('setZoom', () => {
    it('VWR-012: setZoom changes zoom level', () => {
      viewer.setZoom(2);
      expect(viewer.getZoom()).toBe(2);
    });

    it('VWR-013: setZoom resets pan', () => {
      viewer.setPan(100, 100);
      viewer.setZoom(2);
      const pan = viewer.getPan();
      expect(pan.x).toBe(0);
      expect(pan.y).toBe(0);
    });
  });

  describe('setPan', () => {
    it('VWR-014: setPan changes pan position', () => {
      viewer.setPan(50, 75);
      const pan = viewer.getPan();
      expect(pan.x).toBe(50);
      expect(pan.y).toBe(75);
    });

    it('VWR-015: setPan accepts negative values', () => {
      viewer.setPan(-100, -200);
      const pan = viewer.getPan();
      expect(pan.x).toBe(-100);
      expect(pan.y).toBe(-200);
    });
  });

  describe('fitToWindow', () => {
    it('VWR-016: fitToWindow resets zoom to 1', () => {
      viewer.setZoom(3);
      viewer.fitToWindow();
      expect(viewer.getZoom()).toBe(1);
    });

    it('VWR-017: fitToWindow resets pan to 0', () => {
      viewer.setPan(100, 100);
      viewer.fitToWindow();
      const pan = viewer.getPan();
      expect(pan.x).toBe(0);
      expect(pan.y).toBe(0);
    });
  });

  describe('color adjustments', () => {
    it('VWR-018: setColorAdjustments updates values', () => {
      viewer.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        exposure: 1.5,
        gamma: 2.2,
      });
      const adjustments = viewer.getColorAdjustments();
      expect(adjustments.exposure).toBe(1.5);
      expect(adjustments.gamma).toBe(2.2);
    });

    it('VWR-019: getColorAdjustments returns copy', () => {
      const adj1 = viewer.getColorAdjustments();
      const adj2 = viewer.getColorAdjustments();
      expect(adj1).not.toBe(adj2);
      expect(adj1).toEqual(adj2);
    });

    it('VWR-020: resetColorAdjustments restores defaults', () => {
      viewer.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        exposure: 2,
        saturation: 0,
      });
      viewer.resetColorAdjustments();
      expect(viewer.getColorAdjustments()).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
    });
  });

  describe('LUT handling', () => {
    it('VWR-021: setLUT stores LUT', () => {
      const mockLUT = { title: 'Test', size: 17, data: new Float32Array(17 * 17 * 17 * 3) };
      viewer.setLUT(mockLUT);
      expect(viewer.getLUT()).toBe(mockLUT);
    });

    it('VWR-022: setLUT accepts null', () => {
      const mockLUT = { title: 'Test', size: 17, data: new Float32Array(17 * 17 * 17 * 3) };
      viewer.setLUT(mockLUT);
      viewer.setLUT(null);
      expect(viewer.getLUT()).toBeNull();
    });

    it('VWR-023: setLUTIntensity clamps to 0-1', () => {
      viewer.setLUTIntensity(1.5);
      expect(viewer.getLUTIntensity()).toBe(1);

      viewer.setLUTIntensity(-0.5);
      expect(viewer.getLUTIntensity()).toBe(0);
    });

    it('VWR-024: setLUTIntensity accepts valid values', () => {
      viewer.setLUTIntensity(0.5);
      expect(viewer.getLUTIntensity()).toBe(0.5);
    });
  });

  describe('wipe state', () => {
    it('VWR-025: setWipeState updates state', () => {
      viewer.setWipeState({ mode: 'horizontal', position: 0.3, showOriginal: 'left' });
      const state = viewer.getWipeState();
      expect(state.mode).toBe('horizontal');
      expect(state.position).toBe(0.3);
    });

    it('VWR-026: getWipeState returns copy', () => {
      const state1 = viewer.getWipeState();
      const state2 = viewer.getWipeState();
      expect(state1).not.toBe(state2);
    });

    it('VWR-027: setWipeMode changes mode', () => {
      viewer.setWipeMode('vertical');
      expect(viewer.getWipeState().mode).toBe('vertical');
    });

    it('VWR-028: setWipePosition clamps to 0-1', () => {
      viewer.setWipePosition(1.5);
      expect(viewer.getWipeState().position).toBe(1);

      viewer.setWipePosition(-0.5);
      expect(viewer.getWipeState().position).toBe(0);
    });
  });

  describe('transform', () => {
    it('VWR-029: setTransform updates transform', () => {
      viewer.setTransform({ rotation: 90, flipH: true, flipV: false });
      const transform = viewer.getTransform();
      expect(transform.rotation).toBe(90);
      expect(transform.flipH).toBe(true);
    });

    it('VWR-030: getTransform returns copy', () => {
      const t1 = viewer.getTransform();
      const t2 = viewer.getTransform();
      expect(t1).not.toBe(t2);
      expect(t1).toEqual(t2);
    });
  });

  describe('filter settings', () => {
    it('VWR-031: setFilterSettings updates settings', () => {
      viewer.setFilterSettings({ blur: 5, sharpen: 50 });
      const settings = viewer.getFilterSettings();
      expect(settings.blur).toBe(5);
      expect(settings.sharpen).toBe(50);
    });

    it('VWR-032: getFilterSettings returns copy', () => {
      const s1 = viewer.getFilterSettings();
      const s2 = viewer.getFilterSettings();
      expect(s1).not.toBe(s2);
      expect(s1).toEqual(s2);
    });

    it('VWR-033: resetFilterSettings restores defaults', () => {
      viewer.setFilterSettings({ blur: 10, sharpen: 80 });
      viewer.resetFilterSettings();
      expect(viewer.getFilterSettings()).toEqual(DEFAULT_FILTER_SETTINGS);
    });
  });

  describe('crop state', () => {
    it('VWR-034: setCropState updates state', () => {
      viewer.setCropState({
        enabled: true,
        region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        aspectRatio: '16:9',
      });
      const state = viewer.getCropState();
      expect(state.enabled).toBe(true);
      expect(state.aspectRatio).toBe('16:9');
    });

    it('VWR-035: getCropState returns copy', () => {
      const c1 = viewer.getCropState();
      const c2 = viewer.getCropState();
      expect(c1).not.toBe(c2);
      expect(c1.region).not.toBe(c2.region);
    });

    it('VWR-036: setCropRegion updates region', () => {
      viewer.setCropRegion({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 });
      const state = viewer.getCropState();
      expect(state.region.x).toBe(0.2);
      expect(state.region.width).toBe(0.6);
    });

    it('VWR-037: setCropEnabled toggles enabled', () => {
      viewer.setCropEnabled(true);
      expect(viewer.getCropState().enabled).toBe(true);

      viewer.setCropEnabled(false);
      expect(viewer.getCropState().enabled).toBe(false);
    });
  });

  describe('CDL', () => {
    it('VWR-038: setCDL updates CDL values', () => {
      const cdl = {
        slope: { r: 1.2, g: 1.0, b: 0.9 },
        offset: { r: 0.1, g: 0, b: -0.05 },
        power: { r: 1, g: 1, b: 1 },
        saturation: 1.1,
      };
      viewer.setCDL(cdl);
      const result = viewer.getCDL();
      expect(result.slope.r).toBe(1.2);
      expect(result.saturation).toBe(1.1);
    });

    it('VWR-039: getCDL returns deep copy', () => {
      const cdl1 = viewer.getCDL();
      const cdl2 = viewer.getCDL();
      expect(cdl1).not.toBe(cdl2);
      expect(cdl1.slope).not.toBe(cdl2.slope);
    });

    it('VWR-040: resetCDL restores defaults', () => {
      viewer.setCDL({
        slope: { r: 2, g: 2, b: 2 },
        offset: { r: 0.5, g: 0.5, b: 0.5 },
        power: { r: 2, g: 2, b: 2 },
        saturation: 2,
      });
      viewer.resetCDL();
      const cdl = viewer.getCDL();
      expect(cdl.slope.r).toBe(DEFAULT_CDL.slope.r);
      expect(cdl.saturation).toBe(DEFAULT_CDL.saturation);
    });
  });

  describe('lens distortion', () => {
    it('VWR-041: setLensParams updates params', () => {
      viewer.setLensParams({ k1: 0.2, k2: 0.05, centerX: 0.5, centerY: 0.5, scale: 1.1 });
      const params = viewer.getLensParams();
      expect(params.k1).toBe(0.2);
      expect(params.scale).toBe(1.1);
    });

    it('VWR-042: getLensParams returns copy', () => {
      const p1 = viewer.getLensParams();
      const p2 = viewer.getLensParams();
      expect(p1).not.toBe(p2);
      expect(p1).toEqual(p2);
    });

    it('VWR-043: resetLensParams restores defaults', () => {
      viewer.setLensParams({ k1: 0.5, k2: 0.2, centerX: 0.4, centerY: 0.6, scale: 1.5 });
      viewer.resetLensParams();
      expect(viewer.getLensParams()).toEqual(DEFAULT_LENS_PARAMS);
    });
  });

  describe('stack layers', () => {
    it('VWR-044: setStackLayers updates layers', () => {
      const layers = [
        { sourceIndex: 0, blendMode: 'normal', opacity: 1, visible: true },
        { sourceIndex: 1, blendMode: 'multiply', opacity: 0.5, visible: true },
      ];
      viewer.setStackLayers(layers);
      const result = viewer.getStackLayers();
      expect(result.length).toBe(2);
    });

    it('VWR-045: getStackLayers returns copy', () => {
      const layers = [{ sourceIndex: 0, blendMode: 'normal', opacity: 1, visible: true }];
      viewer.setStackLayers(layers);
      const l1 = viewer.getStackLayers();
      const l2 = viewer.getStackLayers();
      expect(l1).not.toBe(l2);
    });

    it('VWR-046: setStackEnabled toggles stack mode', () => {
      viewer.setStackEnabled(true);
      // Stack requires multiple layers to be active
      expect(viewer.isStackEnabled()).toBe(false); // No layers yet

      viewer.setStackLayers([
        { sourceIndex: 0, blendMode: 'normal', opacity: 1, visible: true },
        { sourceIndex: 1, blendMode: 'normal', opacity: 1, visible: true },
      ]);
      viewer.setStackEnabled(true);
      expect(viewer.isStackEnabled()).toBe(true);
    });

    it('VWR-047: isStackEnabled requires multiple layers', () => {
      viewer.setStackEnabled(true);
      viewer.setStackLayers([{ sourceIndex: 0, blendMode: 'normal', opacity: 1, visible: true }]);
      expect(viewer.isStackEnabled()).toBe(false); // Only 1 layer
    });
  });

  describe('getPaintEngine', () => {
    it('VWR-048: returns paint engine instance', () => {
      expect(viewer.getPaintEngine()).toBe(paintEngine);
    });
  });

  describe('dispose', () => {
    it('VWR-049: dispose does not throw', () => {
      expect(() => {
        viewer.dispose();
      }).not.toThrow();
    });

    it('VWR-050: dispose can be called multiple times', () => {
      expect(() => {
        viewer.dispose();
        viewer.dispose();
      }).not.toThrow();
    });
  });

  describe('session events', () => {
    it('VWR-051: responds to sourceLoaded event', () => {
      expect(() => {
        session.emit('sourceLoaded');
      }).not.toThrow();
    });

    it('VWR-052: responds to frameChanged event', () => {
      expect(() => {
        session.currentFrame = 10;
      }).not.toThrow();
    });
  });

  describe('paint events', () => {
    it('VWR-053: responds to annotationsChanged event', () => {
      expect(() => {
        paintEngine.emit('annotationsChanged');
      }).not.toThrow();
    });

    it('VWR-054: responds to toolChanged event', () => {
      expect(() => {
        paintEngine.emit('toolChanged', 'pen');
      }).not.toThrow();
    });
  });
});
