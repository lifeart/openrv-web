/**
 * OverlayManager Unit Tests
 *
 * Tests for lazy-creation of DOM overlay canvases (Task 2.6).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OverlayManager, type OverlayManagerCallbacks } from './OverlayManager';
import { Session } from '../../core/session/Session';

function createMockCallbacks(): OverlayManagerCallbacks {
  return {
    refresh: vi.fn(),
    onProbeStateChanged: vi.fn(),
  };
}

describe('OverlayManager', () => {
  let container: HTMLElement;
  let session: Session;
  let callbacks: OverlayManagerCallbacks;
  let manager: OverlayManager;

  beforeEach(() => {
    container = document.createElement('div');
    session = new Session();
    callbacks = createMockCallbacks();
    manager = new OverlayManager(container, session, callbacks);
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('Lazy-Create DOM Overlay Canvases', () => {
    it('OM-LAZY-001: only matte overlay canvas created at construction time', () => {
      const canvasChildren = Array.from(container.children).filter((el) => el instanceof HTMLCanvasElement);
      // Matte overlay is eagerly created so its DOM element is always present
      expect(canvasChildren.length).toBe(1);
    });

    it('OM-LAZY-002: safe areas overlay created on first access', () => {
      const overlay = manager.getSafeAreasOverlay();
      expect(overlay).toBeTruthy();
      expect(container.contains(overlay.getElement())).toBe(true);
    });

    it('OM-LAZY-003: second access returns same instance', () => {
      const overlay1 = manager.getSafeAreasOverlay();
      const overlay2 = manager.getSafeAreasOverlay();
      expect(overlay1).toBe(overlay2);
    });

    it('OM-LAZY-004: updateDimensions is no-op for uncreated overlays', () => {
      expect(() => manager.updateDimensions(1920, 1080)).not.toThrow();
    });

    it('OM-LAZY-005: lazy-created overlay receives stored dimensions', () => {
      manager.updateDimensions(1920, 1080);
      const overlay = manager.getSafeAreasOverlay();
      const spy = vi.spyOn(overlay, 'setViewerDimensions');
      // Trigger a second dimension update to verify overlay is wired up
      manager.updateDimensions(800, 600);
      expect(spy).toHaveBeenCalledWith(800, 600, 0, 0, 800, 600);
    });

    it('OM-LAZY-006: dispose handles uncreated overlays gracefully', () => {
      const freshManager = new OverlayManager(container, session, callbacks);
      // Don't access any overlay
      expect(() => freshManager.dispose()).not.toThrow();
    });

    it('OM-LAZY-007: matte overlay created on first access', () => {
      const overlay = manager.getMatteOverlay();
      expect(overlay).toBeTruthy();
      expect(container.contains(overlay.getElement())).toBe(true);
    });

    it('OM-LAZY-008: spotlight overlay created on first access', () => {
      const overlay = manager.getSpotlightOverlay();
      expect(overlay).toBeTruthy();
      expect(container.contains(overlay.getElement())).toBe(true);
    });

    it('OM-LAZY-009: bug overlay created on first access', () => {
      const overlay = manager.getBugOverlay();
      expect(overlay).toBeTruthy();
      expect(container.contains(overlay.getElement())).toBe(true);
    });

    it('OM-LAZY-010: EXR window overlay created on first access', () => {
      const overlay = manager.getEXRWindowOverlay();
      expect(overlay).toBeTruthy();
      expect(container.contains(overlay.getElement())).toBe(true);
    });

    it('OM-LAZY-011: timecode overlay created on first access', () => {
      const overlay = manager.getTimecodeOverlay();
      expect(overlay).toBeTruthy();
      expect(container.contains(overlay.getElement())).toBe(true);
    });

    it('OM-LAZY-012: pixel-level overlays are eagerly created', () => {
      // These non-DOM overlays should always be available without null checks
      expect(manager.getPixelProbe()).toBeTruthy();
      expect(manager.getFalseColor()).toBeTruthy();
      expect(manager.getLuminanceVisualization()).toBeTruthy();
      expect(manager.getZebraStripes()).toBeTruthy();
      expect(manager.getClippingOverlay()).toBeTruthy();
    });

    it('OM-LAZY-013: updateDimensions updates already-created overlay', () => {
      const overlay = manager.getSafeAreasOverlay();
      const spy = vi.spyOn(overlay, 'setViewerDimensions');
      manager.updateDimensions(1920, 1080);
      expect(spy).toHaveBeenCalledWith(1920, 1080, 0, 0, 1920, 1080);
    });

    it('OM-LAZY-014: updateDimensions skips uncreated overlays without error', () => {
      // Access only safe areas; others remain uncreated
      manager.getSafeAreasOverlay();
      expect(() => manager.updateDimensions(800, 600)).not.toThrow();
    });

    it('OM-LAZY-015: dispose calls dispose on created overlays', () => {
      const freshManager = new OverlayManager(container, session, callbacks);
      const spotlight = freshManager.getSpotlightOverlay();
      const bug = freshManager.getBugOverlay();
      const disposeSpy1 = vi.spyOn(spotlight, 'dispose');
      const disposeSpy2 = vi.spyOn(bug, 'dispose');
      freshManager.dispose();
      expect(disposeSpy1).toHaveBeenCalled();
      expect(disposeSpy2).toHaveBeenCalled();
    });

    it('OM-LAZY-016: updateDimensions updates all created overlays', () => {
      const safeAreas = manager.getSafeAreasOverlay();
      const matte = manager.getMatteOverlay();
      const bug = manager.getBugOverlay();
      const spy1 = vi.spyOn(safeAreas, 'setViewerDimensions');
      const spy2 = vi.spyOn(matte, 'setViewerDimensions');
      const spy3 = vi.spyOn(bug, 'setViewerDimensions');
      manager.updateDimensions(1280, 720);
      expect(spy1).toHaveBeenCalledWith(1280, 720, 0, 0, 1280, 720);
      expect(spy2).toHaveBeenCalledWith(1280, 720, 0, 0, 1280, 720);
      expect(spy3).toHaveBeenCalledWith(1280, 720, 0, 0, 1280, 720);
    });

    it('OM-LAZY-017: info strip overlay created on first access', () => {
      const overlay = manager.getInfoStripOverlay();
      expect(overlay).toBeTruthy();
      expect(container.contains(overlay.getElement())).toBe(true);
    });

    it('OM-LAZY-018: info strip overlay second access returns same instance', () => {
      const overlay1 = manager.getInfoStripOverlay();
      const overlay2 = manager.getInfoStripOverlay();
      expect(overlay1).toBe(overlay2);
    });

    it('OM-LAZY-019: dispose disposes info strip overlay', () => {
      const freshManager = new OverlayManager(container, session, callbacks);
      const infoStrip = freshManager.getInfoStripOverlay();
      const disposeSpy = vi.spyOn(infoStrip, 'dispose');
      freshManager.dispose();
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('OM-LAZY-020: info strip overlay element is appended to canvasContainer', () => {
      const overlay = manager.getInfoStripOverlay();
      const element = overlay.getElement();
      expect(element.parentElement).toBe(container);
    });

    it('OM-LAZY-021: FPS indicator created on first access', () => {
      const overlay = manager.getFPSIndicator();
      expect(overlay).toBeTruthy();
      expect(container.contains(overlay.getElement())).toBe(true);
    });

    it('OM-LAZY-022: FPS indicator second access returns same instance', () => {
      const overlay1 = manager.getFPSIndicator();
      const overlay2 = manager.getFPSIndicator();
      expect(overlay1).toBe(overlay2);
    });

    it('OM-LAZY-023: dispose disposes FPS indicator', () => {
      const freshManager = new OverlayManager(container, session, callbacks);
      const fpsIndicator = freshManager.getFPSIndicator();
      const disposeSpy = vi.spyOn(fpsIndicator, 'dispose');
      freshManager.dispose();
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('OM-LAZY-024: FPS indicator element is appended to canvasContainer', () => {
      const overlay = manager.getFPSIndicator();
      const element = overlay.getElement();
      expect(element.parentElement).toBe(container);
    });
  });
});
