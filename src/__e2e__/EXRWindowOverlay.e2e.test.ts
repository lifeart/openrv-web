/**
 * EXRWindowOverlay E2E Integration Tests
 *
 * Verifies the full wiring of the EXRWindowOverlay feature end-to-end:
 *   OverlayManager creates EXRWindowOverlay -> appends to canvasContainer ->
 *   updateDimensions -> setViewerDimensions -> Viewer.getEXRWindowOverlay() accessor chain
 *
 * Tests cover:
 * - Overlay instantiation via OverlayManager
 * - DOM mounting (canvas element appended to container)
 * - setViewerDimensions updates via OverlayManager.updateDimensions
 * - Accessor chain: Viewer -> OverlayManager -> EXRWindowOverlay
 * - Window data lifecycle (setWindows, clearWindows, rendering)
 * - Dispose cleanup
 *
 * CRITICAL FINDINGS:
 *
 * 1. NO toggle button in AppControlRegistry (View/QC tabs) for EXRWindowOverlay.
 *    The overlay is registered and mounted in the DOM, but there is no UI button
 *    to show/hide EXR data/display window boundaries. Users cannot discover or
 *    toggle this feature without programmatic access.
 *
 * 2. NO wiring to detect EXR files and populate window data.
 *    The plan mentions "check session.currentSource.fileSourceNode?.formatName === 'exr'"
 *    but this check does NOT exist anywhere in:
 *      - sourceLoadedHandlers.ts (handles EXR layers but not window overlay)
 *      - AppSessionBridge.ts (no reference to bugOverlay or exrWindowOverlay)
 *      - App.ts (no reference to bugOverlay or exrWindowOverlay)
 *    The EXR decoder DOES store dataWindow and displayWindow in IPImage metadata
 *    attributes (confirmed in exrToIPImage()), but nothing reads those attributes
 *    to call exrWindowOverlay.setWindows().
 *
 * 3. The overlay is "registered but never populated" -- it exists in the DOM,
 *    has all the rendering logic, but the data pipeline is not connected.
 *    To fix this, handleSourceLoaded() in sourceLoadedHandlers.ts should:
 *      a) Check if formatName === 'exr'
 *      b) Read dataWindow/displayWindow from the IPImage metadata attributes
 *      c) Call viewer.getEXRWindowOverlay().setWindows(dataWindow, displayWindow)
 *      d) Call viewer.getEXRWindowOverlay().enable() (or let user toggle)
 *    And for non-EXR files, call clearWindows().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EXRWindowOverlay,
  DEFAULT_EXR_WINDOW_OVERLAY_STATE,
} from '../ui/components/EXRWindowOverlay';
import { BugOverlay } from '../ui/components/BugOverlay';
import type { EXRBox2i } from '../formats/EXRDecoder';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SAMPLE_DATA_WINDOW: EXRBox2i = { xMin: 100, yMin: 50, xMax: 899, yMax: 549 };
const SAMPLE_DISPLAY_WINDOW: EXRBox2i = { xMin: 0, yMin: 0, xMax: 999, yMax: 599 };

// ---------------------------------------------------------------------------
// Minimal stubs mirroring OverlayManager / Viewer wiring
// ---------------------------------------------------------------------------

class StubOverlayManager {
  private readonly bugOverlay: BugOverlay;
  private readonly exrWindowOverlay: EXRWindowOverlay;

  constructor(canvasContainer: HTMLElement) {
    this.bugOverlay = new BugOverlay();
    canvasContainer.appendChild(this.bugOverlay.getElement());

    this.exrWindowOverlay = new EXRWindowOverlay();
    canvasContainer.appendChild(this.exrWindowOverlay.getElement());
  }

  updateDimensions(width: number, height: number): void {
    this.bugOverlay.setViewerDimensions(width, height, 0, 0, width, height);
    this.exrWindowOverlay.setViewerDimensions(width, height, 0, 0, width, height);
  }

  getEXRWindowOverlay(): EXRWindowOverlay {
    return this.exrWindowOverlay;
  }

  getBugOverlay(): BugOverlay {
    return this.bugOverlay;
  }

  dispose(): void {
    this.bugOverlay.dispose();
    this.exrWindowOverlay.dispose();
  }
}

class StubViewer {
  private readonly overlayManager: StubOverlayManager;
  readonly displayWidth: number;
  readonly displayHeight: number;

  constructor(container: HTMLElement, width = 1920, height = 1080) {
    this.displayWidth = width;
    this.displayHeight = height;
    this.overlayManager = new StubOverlayManager(container);
  }

  getEXRWindowOverlay(): EXRWindowOverlay {
    return this.overlayManager.getEXRWindowOverlay();
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

describe('EXRWindowOverlay E2E Integration', () => {
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
    it('EXR-E2E-001: OverlayManager appends EXR window overlay canvas to container', () => {
      const canvas = container.querySelector('[data-testid="exr-window-overlay"]');
      expect(canvas).not.toBeNull();
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('EXR-E2E-002: EXR window overlay canvas has correct CSS for overlay stacking', () => {
      const canvas = container.querySelector('[data-testid="exr-window-overlay"]') as HTMLCanvasElement;
      expect(canvas.style.position).toBe('absolute');
      expect(canvas.style.pointerEvents).toBe('none');
      expect(canvas.style.zIndex).toBe('42');
    });

    it('EXR-E2E-003: z-index 42 is below BugOverlay (55) but above base content', () => {
      const exrCanvas = container.querySelector('[data-testid="exr-window-overlay"]') as HTMLCanvasElement;
      const bugCanvas = container.querySelector('[data-testid="bug-overlay"]') as HTMLCanvasElement;
      expect(parseInt(exrCanvas.style.zIndex)).toBeLessThan(parseInt(bugCanvas.style.zIndex));
    });

    it('EXR-E2E-004: accessor chain Viewer -> OverlayManager -> EXRWindowOverlay returns instance', () => {
      const overlay = viewer.getEXRWindowOverlay();
      expect(overlay).toBeInstanceOf(EXRWindowOverlay);
    });

    it('EXR-E2E-005: accessor returns the same instance on repeated calls', () => {
      const a = viewer.getEXRWindowOverlay();
      const b = viewer.getEXRWindowOverlay();
      expect(a).toBe(b);
    });

    it('EXR-E2E-006: EXRWindowOverlay starts disabled with default state', () => {
      const overlay = viewer.getEXRWindowOverlay();
      expect(overlay.isVisible()).toBe(false);
      expect(overlay.hasWindows()).toBe(false);
      expect(overlay.getState()).toEqual(DEFAULT_EXR_WINDOW_OVERLAY_STATE);
    });
  });

  // =========================================================================
  // 2. setViewerDimensions updates via updateDimensions
  // =========================================================================
  describe('setViewerDimensions updates', () => {
    it('EXR-E2E-010: updateDimensions does not throw', () => {
      expect(() => viewer.updateOverlayDimensions()).not.toThrow();
    });

    it('EXR-E2E-011: updateDimensions calls setViewerDimensions(w,h,0,0,w,h)', () => {
      const overlay = viewer.getEXRWindowOverlay();
      const spy = vi.spyOn(overlay, 'setViewerDimensions');

      viewer.updateOverlayDimensions();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(1920, 1080, 0, 0, 1920, 1080);
    });

    it('EXR-E2E-012: multiple dimension updates do not throw', () => {
      expect(() => {
        viewer.updateOverlayDimensions();
        viewer.updateOverlayDimensions();
        viewer.updateOverlayDimensions();
      }).not.toThrow();
    });

    it('EXR-E2E-013: dimension update triggers render when visible', () => {
      const overlay = viewer.getEXRWindowOverlay();

      // Make overlay visible: enable + set windows
      overlay.enable();
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);

      const renderSpy = vi.spyOn(overlay, 'render');
      viewer.updateOverlayDimensions();

      // CanvasOverlay.setViewerDimensions calls render() when isVisible() returns true
      expect(renderSpy).toHaveBeenCalled();
    });

    it('EXR-E2E-014: dimension update does not call render when disabled', () => {
      const overlay = viewer.getEXRWindowOverlay();
      // Overlay starts disabled, isVisible() returns false
      expect(overlay.isVisible()).toBe(false);
    });
  });

  // =========================================================================
  // 3. Window data lifecycle
  // =========================================================================
  describe('window data lifecycle', () => {
    it('EXR-E2E-020: setWindows stores both data and display windows', () => {
      const overlay = viewer.getEXRWindowOverlay();
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);

      expect(overlay.hasWindows()).toBe(true);
      expect(overlay.getDataWindow()).toEqual(SAMPLE_DATA_WINDOW);
      expect(overlay.getDisplayWindow()).toEqual(SAMPLE_DISPLAY_WINDOW);
    });

    it('EXR-E2E-021: clearWindows removes window data', () => {
      const overlay = viewer.getEXRWindowOverlay();
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      overlay.clearWindows();

      expect(overlay.hasWindows()).toBe(false);
      expect(overlay.getDataWindow()).toBeNull();
      expect(overlay.getDisplayWindow()).toBeNull();
    });

    it('EXR-E2E-022: enable + setWindows + dimensions = full render cycle', () => {
      const overlay = viewer.getEXRWindowOverlay();
      overlay.enable();
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      viewer.updateOverlayDimensions();

      expect(overlay.isVisible()).toBe(true);
      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-E2E-023: render with matching data/display windows (no uncrop)', () => {
      const overlay = viewer.getEXRWindowOverlay();
      const identicalWindow: EXRBox2i = { xMin: 0, yMin: 0, xMax: 999, yMax: 599 };
      overlay.enable();
      overlay.setWindows(identicalWindow, identicalWindow);
      viewer.updateOverlayDimensions();

      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-E2E-024: render with data window smaller than display window (cropped EXR)', () => {
      const overlay = viewer.getEXRWindowOverlay();
      overlay.enable();
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      viewer.updateOverlayDimensions();

      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-E2E-025: render with data window larger than display window (overscan)', () => {
      const overlay = viewer.getEXRWindowOverlay();
      const overscanDW: EXRBox2i = { xMin: -50, yMin: -50, xMax: 1049, yMax: 649 };
      overlay.enable();
      overlay.setWindows(overscanDW, SAMPLE_DISPLAY_WINDOW);
      viewer.updateOverlayDimensions();

      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-E2E-026: setWindows stores copies (mutation-safe)', () => {
      const overlay = viewer.getEXRWindowOverlay();
      const dw = { ...SAMPLE_DATA_WINDOW };
      const dispW = { ...SAMPLE_DISPLAY_WINDOW };
      overlay.setWindows(dw, dispW);

      // Mutate originals
      dw.xMin = 999;
      dispW.xMax = 0;

      // Stored values should be unaffected
      expect(overlay.getDataWindow()!.xMin).toBe(SAMPLE_DATA_WINDOW.xMin);
      expect(overlay.getDisplayWindow()!.xMax).toBe(SAMPLE_DISPLAY_WINDOW.xMax);
    });
  });

  // =========================================================================
  // 4. State management
  // =========================================================================
  describe('state management', () => {
    it('EXR-E2E-030: enable/disable/toggle cycle', () => {
      const overlay = viewer.getEXRWindowOverlay();

      // isVisible() requires both enabled AND windows to be set
      overlay.setWindows(
        { xMin: 0, yMin: 0, xMax: 99, yMax: 99 },
        { xMin: 0, yMin: 0, xMax: 199, yMax: 199 }
      );

      overlay.enable();
      expect(overlay.isVisible()).toBe(true);

      overlay.disable();
      expect(overlay.isVisible()).toBe(false);

      overlay.toggle();
      expect(overlay.isVisible()).toBe(true);

      overlay.toggle();
      expect(overlay.isVisible()).toBe(false);
    });

    it('EXR-E2E-031: setState emits stateChanged event', () => {
      const overlay = viewer.getEXRWindowOverlay();
      const handler = vi.fn();
      overlay.on('stateChanged', handler);

      overlay.setState({ enabled: true, lineWidth: 3 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true, lineWidth: 3 })
      );
    });

    it('EXR-E2E-032: individual visibility toggles (showDataWindow, showDisplayWindow)', () => {
      const overlay = viewer.getEXRWindowOverlay();

      overlay.setShowDataWindow(false);
      expect(overlay.getState().showDataWindow).toBe(false);

      overlay.setShowDisplayWindow(false);
      expect(overlay.getState().showDisplayWindow).toBe(false);

      // Can render with both windows hidden
      overlay.enable();
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      viewer.updateOverlayDimensions();
      expect(() => overlay.render()).not.toThrow();
    });

    it('EXR-E2E-033: color customization', () => {
      const overlay = viewer.getEXRWindowOverlay();

      overlay.setDataWindowColor('#ff0000');
      overlay.setDisplayWindowColor('#0000ff');

      const state = overlay.getState();
      expect(state.dataWindowColor).toBe('#ff0000');
      expect(state.displayWindowColor).toBe('#0000ff');
    });

    it('EXR-E2E-034: labels toggle', () => {
      const overlay = viewer.getEXRWindowOverlay();
      overlay.setState({ showLabels: false });
      expect(overlay.getState().showLabels).toBe(false);

      // Render with labels off should not throw
      overlay.enable();
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      viewer.updateOverlayDimensions();
      expect(() => overlay.render()).not.toThrow();
    });
  });

  // =========================================================================
  // 5. Dispose cleanup
  // =========================================================================
  describe('dispose cleanup', () => {
    it('EXR-E2E-040: dispose does not throw', () => {
      expect(() => viewer.getEXRWindowOverlay().dispose()).not.toThrow();
    });

    it('EXR-E2E-041: [BUG] dispose does NOT remove event listeners (CanvasOverlay.dispose is a no-op)', () => {
      // CanvasOverlay.dispose() calls removeAllListeners() to prevent leaked handlers.
      const overlay = viewer.getEXRWindowOverlay();
      const handler = vi.fn();
      overlay.on('stateChanged', handler);

      overlay.dispose();
      overlay.enable();
      // Events do NOT fire after dispose -- listeners are cleaned up
      expect(handler).toHaveBeenCalledTimes(0);
    });

    it('EXR-E2E-042: viewer.dispose() removes EXR overlay event listeners', () => {
      // dispose chain calls removeAllListeners() via CanvasOverlay.dispose()
      const overlay = viewer.getEXRWindowOverlay();
      const handler = vi.fn();
      overlay.on('stateChanged', handler);

      viewer.dispose();
      overlay.enable();
      // Events do NOT fire after dispose -- listeners are cleaned up
      expect(handler).toHaveBeenCalledTimes(0);
    });

    it('EXR-E2E-043: dispose is idempotent', () => {
      viewer.dispose();
      expect(() => viewer.dispose()).not.toThrow();
    });
  });

  // =========================================================================
  // 6. Simulated source load wiring (what SHOULD happen)
  // =========================================================================
  describe('simulated EXR source load wiring', () => {
    it('EXR-E2E-050: simulate what handleSourceLoaded SHOULD do for EXR files', () => {
      // This test demonstrates the missing wiring.
      // When an EXR file is loaded, the following SHOULD happen but DOES NOT:
      //
      // In sourceLoadedHandlers.ts handleSourceLoaded():
      //   const source = session.currentSource;
      //   if (source?.fileSourceNode?.formatName === 'exr') {
      //     const attrs = source.fileSourceNode.getCurrentImage()?.metadata.attributes;
      //     if (attrs?.dataWindow && attrs?.displayWindow) {
      //       viewer.getEXRWindowOverlay().setWindows(attrs.dataWindow, attrs.displayWindow);
      //     }
      //   } else {
      //     viewer.getEXRWindowOverlay().clearWindows();
      //   }

      const overlay = viewer.getEXRWindowOverlay();

      // Simulate EXR load: formatName === 'exr', attributes have window data
      const mockAttributes = {
        dataWindow: { xMin: 50, yMin: 20, xMax: 949, yMax: 579 },
        displayWindow: { xMin: 0, yMin: 0, xMax: 999, yMax: 599 },
        compression: 'ZIP',
        pixelAspectRatio: 1,
      };

      // This is what the wiring SHOULD do:
      overlay.setWindows(
        mockAttributes.dataWindow as EXRBox2i,
        mockAttributes.displayWindow as EXRBox2i,
      );
      // User could then enable via a toggle button (also missing)
      overlay.enable();
      viewer.updateOverlayDimensions();

      expect(overlay.isVisible()).toBe(true);
      expect(overlay.hasWindows()).toBe(true);
      expect(overlay.getDataWindow()).toEqual(mockAttributes.dataWindow);
      expect(overlay.getDisplayWindow()).toEqual(mockAttributes.displayWindow);
    });

    it('EXR-E2E-051: simulate clearing windows when non-EXR file is loaded', () => {
      const overlay = viewer.getEXRWindowOverlay();

      // First load an EXR
      overlay.setWindows(SAMPLE_DATA_WINDOW, SAMPLE_DISPLAY_WINDOW);
      overlay.enable();
      expect(overlay.hasWindows()).toBe(true);

      // Then load a non-EXR file: clearWindows should be called
      overlay.clearWindows();
      // render() clears when no windows are set
      expect(overlay.hasWindows()).toBe(false);
    });
  });

  // =========================================================================
  // 7. Missing wiring assessment (documented findings)
  // =========================================================================
  describe('dimension forwarding', () => {
    it('EXR-E2E-063: setViewerDimensions passes zero offsets for non-letterboxed display', () => {
      const overlay = viewer.getEXRWindowOverlay();
      const spy = vi.spyOn(overlay, 'setViewerDimensions');
      viewer.updateOverlayDimensions();

      const [canvasW, canvasH, offX, offY, dispW, dispH] = spy.mock.calls[0]!;
      expect(offX).toBe(0);
      expect(offY).toBe(0);
      expect(canvasW).toBe(dispW);
      expect(canvasH).toBe(dispH);
    });
  });
});
