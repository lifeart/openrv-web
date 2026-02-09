import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CropManager, CropManagerContext } from './CropManager';

interface TestableCropManager {
  _isDraggingCrop: boolean;
  _isCropPanelOpen: boolean;
}

function createMockContext(): CropManagerContext {
  return {
    container: document.createElement('div'),
    canvasContainer: document.createElement('div'),
    getSession: vi.fn(() => ({ currentSource: { width: 1920, height: 1080 } })) as any,
    getDisplayDimensions: vi.fn(() => ({ width: 800, height: 600 })),
    getSourceDimensions: vi.fn(() => ({ width: 1920, height: 1080 })),
    scheduleRender: vi.fn(),
  };
}

describe('CropManager', () => {
  let manager: CropManager;
  let ctx: CropManagerContext;

  beforeEach(() => {
    ctx = createMockContext();
    manager = new CropManager(ctx);
  });

  // =========================================================================
  // Constructor & getters (CM-001 through CM-005)
  // =========================================================================

  describe('Constructor & getters', () => {
    it('CM-001: isDragging is initially false', () => {
      expect(manager.isDragging).toBe(false);
    });

    it('CM-002: isPanelOpen is initially false', () => {
      expect(manager.isPanelOpen).toBe(false);
    });

    it('CM-003: getOverlayElement returns a canvas appended to canvasContainer', () => {
      const overlay = manager.getOverlayElement();
      expect(overlay).toBeInstanceOf(HTMLCanvasElement);
      expect(ctx.canvasContainer.contains(overlay!)).toBe(true);
    });

    it('CM-004: getCropState returns default crop state (defensive copy)', () => {
      const state = manager.getCropState();
      expect(state).toEqual({
        enabled: false,
        region: { x: 0, y: 0, width: 1, height: 1 },
        aspectRatio: null,
      });
    });

    it('CM-005: getUncropState returns default uncrop state', () => {
      const state = manager.getUncropState();
      expect(state).toEqual({
        enabled: false,
        paddingMode: 'uniform',
        padding: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });
    });
  });

  // =========================================================================
  // isDragging / isPanelOpen getters (CM-010 through CM-014)
  // =========================================================================

  describe('isDragging / isPanelOpen getters', () => {
    it('CM-010: isDragging reflects internal _isDraggingCrop state', () => {
      expect(manager.isDragging).toBe(false);
      (manager as unknown as TestableCropManager)._isDraggingCrop = true;
      expect(manager.isDragging).toBe(true);
    });

    it('CM-011: isPanelOpen reflects internal _isCropPanelOpen state', () => {
      expect(manager.isPanelOpen).toBe(false);
      (manager as unknown as TestableCropManager)._isCropPanelOpen = true;
      expect(manager.isPanelOpen).toBe(true);
    });

    it('CM-012: setCropPanelOpen(true) makes isPanelOpen return true', () => {
      manager.setCropPanelOpen(true);
      expect(manager.isPanelOpen).toBe(true);
    });

    it('CM-013: setCropPanelOpen(false) makes isPanelOpen return false', () => {
      manager.setCropPanelOpen(true);
      manager.setCropPanelOpen(false);
      expect(manager.isPanelOpen).toBe(false);
    });

    it('CM-014: setCropPanelOpen(false) on initial state keeps isPanelOpen false', () => {
      manager.setCropPanelOpen(false);
      expect(manager.isPanelOpen).toBe(false);
    });
  });

  // =========================================================================
  // Crop state management (CM-020 through CM-025)
  // =========================================================================

  describe('Crop state management', () => {
    it('CM-020: setCropState sets state and schedules render', () => {
      const newState = {
        enabled: true,
        region: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
        aspectRatio: '16:9' as string | null,
      };
      manager.setCropState(newState);

      expect(manager.getCropState()).toEqual(newState);
      expect(ctx.scheduleRender).toHaveBeenCalled();
    });

    it('CM-021: getCropState returns defensive copy (modifying returned object does not affect internal state)', () => {
      const state1 = manager.getCropState();
      state1.enabled = true;
      state1.region.x = 0.99;

      const state2 = manager.getCropState();
      expect(state2.enabled).toBe(false);
      expect(state2.region.x).toBe(0);
    });

    it('CM-022: setCropRegion updates region and schedules render', () => {
      const region = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
      manager.setCropRegion(region);

      expect(manager.getCropState().region).toEqual(region);
      expect(ctx.scheduleRender).toHaveBeenCalled();
    });

    it('CM-023: setCropRegion stores defensive copy of passed region', () => {
      const region = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
      manager.setCropRegion(region);

      region.x = 0.99;
      expect(manager.getCropState().region.x).toBe(0.1);
    });

    it('CM-024: setCropEnabled toggles enabled and schedules render', () => {
      manager.setCropEnabled(true);
      expect(manager.getCropState().enabled).toBe(true);
      expect(ctx.scheduleRender).toHaveBeenCalledTimes(1);

      manager.setCropEnabled(false);
      expect(manager.getCropState().enabled).toBe(false);
      expect(ctx.scheduleRender).toHaveBeenCalledTimes(2);
    });

    it('CM-025: setCropState stores defensive copy of passed state', () => {
      const newState = {
        enabled: true,
        region: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
        aspectRatio: null as string | null,
      };
      manager.setCropState(newState);

      newState.enabled = false;
      newState.region.x = 0.99;
      const internal = manager.getCropState();
      expect(internal.enabled).toBe(true);
      expect(internal.region.x).toBe(0.1);
    });
  });

  // =========================================================================
  // Uncrop state (CM-030 through CM-035)
  // =========================================================================

  describe('Uncrop state', () => {
    it('CM-030: setUncropState sets state and schedules render', () => {
      const newState = {
        enabled: true,
        paddingMode: 'uniform' as const,
        padding: 50,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      };
      manager.setUncropState(newState);

      expect(manager.getUncropState()).toEqual(newState);
      expect(ctx.scheduleRender).toHaveBeenCalled();
    });

    it('CM-031: isUncropActive returns true when enabled with uniform padding > 0', () => {
      manager.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: 10,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });
      expect(manager.isUncropActive()).toBe(true);
    });

    it('CM-032: isUncropActive returns false when disabled', () => {
      manager.setUncropState({
        enabled: false,
        paddingMode: 'uniform',
        padding: 10,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });
      expect(manager.isUncropActive()).toBe(false);
    });

    it('CM-033: isUncropActive returns true when enabled with per-side padding > 0', () => {
      manager.setUncropState({
        enabled: true,
        paddingMode: 'per-side',
        padding: 0,
        paddingTop: 5,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });
      expect(manager.isUncropActive()).toBe(true);
    });

    it('CM-034: isUncropActive returns false when enabled with all padding zero', () => {
      manager.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });
      expect(manager.isUncropActive()).toBe(false);
    });

    it('CM-035: getUncropPadding returns zeroes when disabled, correct values when enabled', () => {
      // Disabled: all zeroes
      expect(manager.getUncropPadding()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });

      // Enabled with uniform padding
      manager.setUncropState({
        enabled: true,
        paddingMode: 'uniform',
        padding: 20,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      });
      expect(manager.getUncropPadding()).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });

      // Enabled with per-side padding
      manager.setUncropState({
        enabled: true,
        paddingMode: 'per-side',
        padding: 0,
        paddingTop: 10,
        paddingRight: 20,
        paddingBottom: 30,
        paddingLeft: 40,
      });
      expect(manager.getUncropPadding()).toEqual({ top: 10, right: 20, bottom: 30, left: 40 });
    });
  });

  // =========================================================================
  // Crop region changed callback (CM-040 through CM-042)
  // =========================================================================

  describe('Crop region changed callback', () => {
    it('CM-040: setOnCropRegionChanged registers callback', () => {
      const callback = vi.fn();
      manager.setOnCropRegionChanged(callback);

      // Set up dragging state so handleCropPointerUp invokes the callback
      (manager as unknown as TestableCropManager)._isDraggingCrop = true;
      manager.handleCropPointerUp();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ x: 0, y: 0, width: 1, height: 1 });
    });

    it('CM-041: handleCropPointerUp invokes callback when dragging', () => {
      const callback = vi.fn();
      manager.setOnCropRegionChanged(callback);

      // Set custom region first
      manager.setCropRegion({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });

      (manager as unknown as TestableCropManager)._isDraggingCrop = true;
      manager.handleCropPointerUp();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    });

    it('CM-042: handleCropPointerUp does NOT invoke callback when not dragging', () => {
      const callback = vi.fn();
      manager.setOnCropRegionChanged(callback);

      manager.handleCropPointerUp();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // isCropClipActive and getExportCropRegion (CM-045 through CM-048)
  // =========================================================================

  describe('isCropClipActive / getExportCropRegion', () => {
    it('CM-045: isCropClipActive returns false when crop is not enabled', () => {
      expect(manager.isCropClipActive()).toBe(false);
    });

    it('CM-046: isCropClipActive returns false when enabled but region is full', () => {
      manager.setCropEnabled(true);
      expect(manager.isCropClipActive()).toBe(false);
    });

    it('CM-047: isCropClipActive returns true when enabled with non-full region', () => {
      manager.setCropEnabled(true);
      manager.setCropRegion({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 });
      expect(manager.isCropClipActive()).toBe(true);
    });

    it('CM-048: getExportCropRegion returns undefined when not enabled, region when enabled', () => {
      expect(manager.getExportCropRegion()).toBeUndefined();

      manager.setCropEnabled(true);
      const region = manager.getExportCropRegion();
      expect(region).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    });
  });

  // =========================================================================
  // dispose (CM-050 through CM-054)
  // =========================================================================

  describe('dispose', () => {
    it('CM-050: dispose resets isDragging to false', () => {
      (manager as unknown as TestableCropManager)._isDraggingCrop = true;
      expect(manager.isDragging).toBe(true);

      manager.dispose();
      expect(manager.isDragging).toBe(false);
    });

    it('CM-051: dispose nulls the callback', () => {
      const callback = vi.fn();
      manager.setOnCropRegionChanged(callback);

      manager.dispose();

      // After dispose, even if we set dragging to true, callback should not fire
      (manager as unknown as TestableCropManager)._isDraggingCrop = true;
      manager.handleCropPointerUp();
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-052: dispose is idempotent', () => {
      (manager as unknown as TestableCropManager)._isDraggingCrop = true;
      manager.setOnCropRegionChanged(vi.fn());

      manager.dispose();
      manager.dispose();

      expect(manager.isDragging).toBe(false);
    });

    it('CM-053: dispose resets isDragging even when callback was never set', () => {
      (manager as unknown as TestableCropManager)._isDraggingCrop = true;

      manager.dispose();
      expect(manager.isDragging).toBe(false);
    });

    it('CM-054: handleCropPointerUp resets isDragging after dispose', () => {
      manager.dispose();

      (manager as unknown as TestableCropManager)._isDraggingCrop = true;
      manager.handleCropPointerUp();
      expect(manager.isDragging).toBe(false);
    });
  });
});
