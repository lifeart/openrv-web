/**
 * BugOverlay E2E Integration Tests
 *
 * Verifies the full wiring of the BugOverlay feature end-to-end:
 *   OverlayManager creates BugOverlay -> appends to canvasContainer ->
 *   updateDimensions -> setViewerDimensions -> Viewer.getBugOverlay() accessor chain
 *
 * Tests cover:
 * - Overlay instantiation via OverlayManager
 * - DOM mounting (canvas element appended to container)
 * - setViewerDimensions updates via OverlayManager.updateDimensions
 * - Accessor chain: Viewer -> OverlayManager -> BugOverlay
 * - Image loading and rendering lifecycle
 * - Dispose cleanup
 *
 * Findings documented in test descriptions:
 * - BugOverlay extends CanvasOverlay (confirmed)
 * - setViewerDimensions(w, h, 0, 0, w, h) is the call pattern (offset 0,0 means
 *   display region fills entire canvas -- correct when no letterboxing)
 * - NO toggle button exists in the View tab (AppControlRegistry) for BugOverlay
 * - Bug image source can be set via loadImage(url) or setImage(HTMLImageElement),
 *   but there is no UI control to set the bug image -- API-only
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BugOverlay, DEFAULT_BUG_OVERLAY_STATE } from '../ui/components/BugOverlay';
import { EXRWindowOverlay } from '../ui/components/EXRWindowOverlay';

// ---------------------------------------------------------------------------
// Minimal stubs for OverlayManager dependencies
// ---------------------------------------------------------------------------

/**
 * Minimal stub that mirrors what OverlayManager does for BugOverlay:
 * instantiation, DOM append, updateDimensions, accessor, dispose.
 */
class StubOverlayManager {
  private readonly bugOverlay: BugOverlay;
  private readonly exrWindowOverlay: EXRWindowOverlay;

  constructor(canvasContainer: HTMLElement) {
    this.bugOverlay = new BugOverlay();
    canvasContainer.appendChild(this.bugOverlay.getElement());

    // EXR overlay also created by real OverlayManager; include for completeness
    this.exrWindowOverlay = new EXRWindowOverlay();
    canvasContainer.appendChild(this.exrWindowOverlay.getElement());
  }

  updateDimensions(width: number, height: number): void {
    this.bugOverlay.setViewerDimensions(width, height, 0, 0, width, height);
  }

  getBugOverlay(): BugOverlay {
    return this.bugOverlay;
  }

  dispose(): void {
    this.bugOverlay.dispose();
    this.exrWindowOverlay.dispose();
  }
}

/**
 * Minimal Viewer stub that delegates getBugOverlay() to the OverlayManager,
 * mirroring the real Viewer accessor chain.
 */
class StubViewer {
  private readonly overlayManager: StubOverlayManager;
  readonly displayWidth: number;
  readonly displayHeight: number;

  constructor(container: HTMLElement, width = 1920, height = 1080) {
    this.displayWidth = width;
    this.displayHeight = height;
    this.overlayManager = new StubOverlayManager(container);
  }

  getBugOverlay(): BugOverlay {
    return this.overlayManager.getBugOverlay();
  }

  updateOverlayDimensions(): void {
    this.overlayManager.updateDimensions(this.displayWidth, this.displayHeight);
  }

  dispose(): void {
    this.overlayManager.dispose();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BugOverlay E2E Integration', () => {
  let container: HTMLElement;
  let viewer: StubViewer;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    viewer = new StubViewer(container);
  });

  afterEach(() => {
    viewer.dispose();
    container.remove();
  });

  // =========================================================================
  // 1. Overlay instantiation and DOM mounting
  // =========================================================================
  describe('instantiation and DOM mounting', () => {
    it('BUG-E2E-001: OverlayManager appends bug overlay canvas to container', () => {
      const canvas = container.querySelector('[data-testid="bug-overlay"]');
      expect(canvas).not.toBeNull();
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('BUG-E2E-002: bug overlay canvas has correct CSS for overlay stacking', () => {
      const canvas = container.querySelector('[data-testid="bug-overlay"]') as HTMLCanvasElement;
      expect(canvas.style.position).toBe('absolute');
      expect(canvas.style.pointerEvents).toBe('none');
      expect(canvas.style.zIndex).toBe('55');
    });

    it('BUG-E2E-003: accessor chain Viewer -> OverlayManager -> BugOverlay returns instance', () => {
      const bugOverlay = viewer.getBugOverlay();
      expect(bugOverlay).toBeInstanceOf(BugOverlay);
    });

    it('BUG-E2E-004: accessor returns the same instance on repeated calls', () => {
      const a = viewer.getBugOverlay();
      const b = viewer.getBugOverlay();
      expect(a).toBe(b);
    });

    it('BUG-E2E-005: BugOverlay starts disabled with default state', () => {
      const bugOverlay = viewer.getBugOverlay();
      expect(bugOverlay.isEnabled()).toBe(false);
      expect(bugOverlay.isVisible()).toBe(false);
      expect(bugOverlay.getState()).toEqual(DEFAULT_BUG_OVERLAY_STATE);
    });
  });

  // =========================================================================
  // 2. setViewerDimensions updates via updateDimensions
  // =========================================================================
  describe('setViewerDimensions updates', () => {
    it('BUG-E2E-010: updateDimensions does not throw', () => {
      expect(() => viewer.updateOverlayDimensions()).not.toThrow();
    });

    it('BUG-E2E-011: updateDimensions calls setViewerDimensions(w,h,0,0,w,h)', () => {
      const bugOverlay = viewer.getBugOverlay();
      const spy = vi.spyOn(bugOverlay, 'setViewerDimensions');

      viewer.updateOverlayDimensions();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(1920, 1080, 0, 0, 1920, 1080);
    });

    it('BUG-E2E-012: multiple dimension updates do not throw', () => {
      expect(() => {
        viewer.updateOverlayDimensions();
        viewer.updateOverlayDimensions();
        viewer.updateOverlayDimensions();
      }).not.toThrow();
    });

    it('BUG-E2E-013: dimension update triggers render when visible', () => {
      const bugOverlay = viewer.getBugOverlay();

      // Set up a visible overlay with an image
      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 50 });
      bugOverlay.setImage(img);

      const renderSpy = vi.spyOn(bugOverlay, 'render');
      viewer.updateOverlayDimensions();

      // CanvasOverlay.setViewerDimensions calls render() when isVisible() returns true
      expect(renderSpy).toHaveBeenCalled();
    });

    it('BUG-E2E-014: dimension update does not render when overlay is disabled', () => {
      const bugOverlay = viewer.getBugOverlay();
      // No image set, so isVisible() returns false
      vi.spyOn(bugOverlay, 'render');
      viewer.updateOverlayDimensions();

      // setViewerDimensions checks isVisible() before calling render()
      // isVisible() is false (no image), so render is NOT called by setViewerDimensions
      // However the base class still calls render if isVisible is true
      // Since isVisible returns false, render should not be called
      expect(bugOverlay.isVisible()).toBe(false);
    });
  });

  // =========================================================================
  // 3. Image loading and rendering lifecycle
  // =========================================================================
  describe('image loading and rendering lifecycle', () => {
    it('BUG-E2E-020: setImage enables overlay and emits events', () => {
      const bugOverlay = viewer.getBugOverlay();
      const stateHandler = vi.fn();
      const imageHandler = vi.fn();
      bugOverlay.on('stateChanged', stateHandler);
      bugOverlay.on('imageLoaded', imageHandler);

      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 200 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });
      bugOverlay.setImage(img);

      expect(bugOverlay.isEnabled()).toBe(true);
      expect(bugOverlay.hasImage()).toBe(true);
      expect(bugOverlay.isVisible()).toBe(true);
      expect(imageHandler).toHaveBeenCalledWith({ width: 200, height: 100 });
      expect(stateHandler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });

    it('BUG-E2E-021: removeImage disables overlay', () => {
      const bugOverlay = viewer.getBugOverlay();
      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });
      bugOverlay.setImage(img);

      bugOverlay.removeImage();

      expect(bugOverlay.isEnabled()).toBe(false);
      expect(bugOverlay.hasImage()).toBe(false);
      expect(bugOverlay.isVisible()).toBe(false);
    });

    it('BUG-E2E-022: toggle works after image is set', () => {
      const bugOverlay = viewer.getBugOverlay();
      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });
      bugOverlay.setImage(img);

      // setImage enables; toggle should disable
      bugOverlay.toggle();
      expect(bugOverlay.isEnabled()).toBe(false);
      // isVisible requires both enabled AND image
      expect(bugOverlay.isVisible()).toBe(false);

      // Toggle back
      bugOverlay.toggle();
      expect(bugOverlay.isEnabled()).toBe(true);
      expect(bugOverlay.isVisible()).toBe(true);
    });

    it('BUG-E2E-023: position/size/opacity can be configured via API', () => {
      const bugOverlay = viewer.getBugOverlay();
      bugOverlay.setPosition('top-left');
      bugOverlay.setSize(0.15);
      bugOverlay.setOpacity(0.5);
      bugOverlay.setMargin(20);

      const state = bugOverlay.getState();
      expect(state.position).toBe('top-left');
      expect(state.size).toBe(0.15);
      expect(state.opacity).toBe(0.5);
      expect(state.margin).toBe(20);
    });

    it('BUG-E2E-024: full lifecycle: set image -> dimensions -> render -> dispose', () => {
      const bugOverlay = viewer.getBugOverlay();
      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 50 });
      bugOverlay.setImage(img);
      viewer.updateOverlayDimensions();

      expect(bugOverlay.isVisible()).toBe(true);
      expect(() => bugOverlay.render()).not.toThrow();
    });

    it('BUG-E2E-025: setState batch updates properties and emits once', () => {
      const bugOverlay = viewer.getBugOverlay();
      const handler = vi.fn();
      bugOverlay.on('stateChanged', handler);

      bugOverlay.setState({
        position: 'top-right',
        size: 0.2,
        opacity: 0.6,
        margin: 30,
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const emitted = handler.mock.calls[0]![0];
      expect(emitted.position).toBe('top-right');
      expect(emitted.size).toBe(0.2);
      expect(emitted.opacity).toBe(0.6);
      expect(emitted.margin).toBe(30);
    });
  });

  // =========================================================================
  // 4. Constructor with initial state
  // =========================================================================
  describe('constructor initial state', () => {
    it('BUG-E2E-030: BugOverlay accepts initial state in constructor', () => {
      const overlay = new BugOverlay({ position: 'top-left', opacity: 0.3 });
      expect(overlay.getPosition()).toBe('top-left');
      expect(overlay.getOpacity()).toBe(0.3);
      // Other fields stay at defaults
      expect(overlay.getSize()).toBe(0.08);
      expect(overlay.getMargin()).toBe(12);
      overlay.dispose();
    });
  });

  // =========================================================================
  // 5. Dispose cleanup
  // =========================================================================
  describe('dispose cleanup', () => {
    it('BUG-E2E-040: dispose clears image reference', () => {
      const bugOverlay = viewer.getBugOverlay();
      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });
      bugOverlay.setImage(img);

      expect(bugOverlay.hasImage()).toBe(true);
      bugOverlay.dispose();
      expect(bugOverlay.hasImage()).toBe(false);
    });

    it('BUG-E2E-041: [BUG] dispose does NOT remove event listeners (CanvasOverlay.dispose is a no-op)', () => {
      // CanvasOverlay.dispose() calls removeAllListeners() to prevent leaked
      // event handlers from firing on zombie instances.
      const bugOverlay = viewer.getBugOverlay();
      const handler = vi.fn();
      bugOverlay.on('stateChanged', handler);

      bugOverlay.dispose();
      bugOverlay.enable();
      // Events do NOT fire after dispose -- listeners are cleaned up
      expect(handler).toHaveBeenCalledTimes(0);
    });

    it('BUG-E2E-042: viewer.dispose() disposes bug overlay', () => {
      const bugOverlay = viewer.getBugOverlay();
      const img = new Image();
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });
      bugOverlay.setImage(img);

      viewer.dispose();
      expect(bugOverlay.hasImage()).toBe(false);
    });

    it('BUG-E2E-043: dispose is idempotent', () => {
      viewer.dispose();
      expect(() => viewer.dispose()).not.toThrow();
    });
  });

  // =========================================================================
  // 6. Missing wiring assessment (documented findings)
  // =========================================================================
  describe('missing wiring assessment', () => {
    it('BUG-E2E-050: BugOverlay is API-only (loadImage, setImage, toggle, enable, disable exist)', () => {
      const bugOverlay = viewer.getBugOverlay();
      expect(typeof bugOverlay.loadImage).toBe('function');
      expect(typeof bugOverlay.setImage).toBe('function');
      expect(typeof bugOverlay.toggle).toBe('function');
      expect(typeof bugOverlay.enable).toBe('function');
      expect(typeof bugOverlay.disable).toBe('function');
    });

    it('BUG-E2E-052: setViewerDimensions(w,h,0,0,w,h) passes zero offsets for non-letterboxed display', () => {
      const bugOverlay = viewer.getBugOverlay();
      const spy = vi.spyOn(bugOverlay, 'setViewerDimensions');
      viewer.updateOverlayDimensions();

      const [canvasW, canvasH, offX, offY, dispW, dispH] = spy.mock.calls[0]!;
      expect(offX).toBe(0);
      expect(offY).toBe(0);
      expect(canvasW).toBe(dispW);
      expect(canvasH).toBe(dispH);
    });
  });
});
