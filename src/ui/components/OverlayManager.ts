/**
 * OverlayManager - Centralizes creation, lifecycle, and dimension management
 * for all viewer overlays.
 *
 * Extracted from Viewer.ts to reduce its size and isolate overlay concerns.
 * The manager owns the overlay instances, appends their DOM elements to the
 * canvas container, handles dimension updates on resize, and disposes them
 * on teardown.
 *
 * DOM-based overlays (SafeAreas, Matte, Timecode, Spotlight, Bug, EXRWindow)
 * are lazily created on first access to reduce startup overhead and avoid
 * unnecessary GPU compositing layers.
 *
 * Pixel-level overlay *application* (FalseColor.apply, ZebraStripes.apply, etc.)
 * remains in the Viewer rendering pipeline — the manager simply provides
 * typed accessors so the Viewer (and external consumers) can reach each overlay.
 */

import type { Session } from '../../core/session/Session';
import { SafeAreasOverlay } from './SafeAreasOverlay';
import { MatteOverlay } from './MatteOverlay';
import { TimecodeOverlay } from './TimecodeOverlay';
import { PixelProbe } from './PixelProbe';
import { FalseColor } from './FalseColor';
import { LuminanceVisualization } from './LuminanceVisualization';
import { ZebraStripes } from './ZebraStripes';
import { ClippingOverlay } from './ClippingOverlay';
import { SpotlightOverlay } from './SpotlightOverlay';
import { BugOverlay } from './BugOverlay';
import { EXRWindowOverlay } from './EXRWindowOverlay';

/**
 * Callbacks the OverlayManager needs from the Viewer to wire up
 * overlay event listeners at construction time.
 */
export interface OverlayManagerCallbacks {
  /** Called when any overlay changes that requires a full re-render */
  refresh: () => void;
  /** Called when pixel probe enabled state changes (to update cursor) */
  onProbeStateChanged: (enabled: boolean) => void;
}

export class OverlayManager {
  // DOM-based overlays — lazily created on first access
  private _safeAreasOverlay: SafeAreasOverlay | null = null;
  private _matteOverlay: MatteOverlay | null = null;
  private _timecodeOverlay: TimecodeOverlay | null = null;
  private _spotlightOverlay: SpotlightOverlay | null = null;
  private _bugOverlay: BugOverlay | null = null;
  private _exrWindowOverlay: EXRWindowOverlay | null = null;

  // Non-DOM overlays (pixel probe has its own floating panel)
  private readonly pixelProbe: PixelProbe;

  // Pixel-level effect overlays (applied to ImageData, no DOM element)
  private readonly falseColor: FalseColor;
  private readonly luminanceVisualization: LuminanceVisualization;
  private readonly zebraStripes: ZebraStripes;
  private readonly clippingOverlay: ClippingOverlay;

  // Stored for lazy overlay creation
  private readonly canvasContainer: HTMLElement;
  private readonly session: Session;
  private lastWidth = 0;
  private lastHeight = 0;

  constructor(
    canvasContainer: HTMLElement,
    session: Session,
    callbacks: OverlayManagerCallbacks,
  ) {
    this.canvasContainer = canvasContainer;
    this.session = session;

    // --- Non-DOM overlays ---

    // Pixel probe
    this.pixelProbe = new PixelProbe();
    this.pixelProbe.on('stateChanged', (state) => {
      callbacks.onProbeStateChanged(state.enabled);
    });

    // --- Pixel-level effect overlays ---

    // False color display
    this.falseColor = new FalseColor();

    // Luminance visualization (manages HSV, random color, contour, and delegates false-color)
    this.luminanceVisualization = new LuminanceVisualization(this.falseColor);
    this.luminanceVisualization.on('stateChanged', () => {
      callbacks.refresh();
    });

    // Zebra stripes overlay
    this.zebraStripes = new ZebraStripes();
    this.zebraStripes.on('stateChanged', (state) => {
      if (state.enabled && (state.highEnabled || state.lowEnabled)) {
        this.zebraStripes.startAnimation(() => callbacks.refresh());
      } else {
        this.zebraStripes.stopAnimation();
      }
      callbacks.refresh();
    });

    // Clipping overlay
    this.clippingOverlay = new ClippingOverlay();
    this.clippingOverlay.on('stateChanged', () => {
      callbacks.refresh();
    });
  }

  // ---------------------------------------------------------------------------
  // Lazy overlay creation helpers
  // ---------------------------------------------------------------------------

  private applyStoredDimensions(overlay: { setViewerDimensions: (w: number, h: number, ox: number, oy: number, dw: number, dh: number) => void }): void {
    if (this.lastWidth > 0 || this.lastHeight > 0) {
      overlay.setViewerDimensions(this.lastWidth, this.lastHeight, 0, 0, this.lastWidth, this.lastHeight);
    }
  }

  // ---------------------------------------------------------------------------
  // Dimension management
  // ---------------------------------------------------------------------------

  /**
   * Update overlay dimensions to match display size.
   * Called whenever the canvas resizes.
   */
  updateDimensions(width: number, height: number): void {
    this.lastWidth = width;
    this.lastHeight = height;

    // Only update already-created overlays; uncreated ones will receive
    // stored dimensions when lazily created.
    if (this._safeAreasOverlay) {
      try {
        this._safeAreasOverlay.setViewerDimensions(width, height, 0, 0, width, height);
      } catch (err) {
        console.error('SafeAreasOverlay setViewerDimensions failed:', err);
      }
    }

    if (this._matteOverlay) {
      try {
        this._matteOverlay.setViewerDimensions(width, height, 0, 0, width, height);
      } catch (err) {
        console.error('MatteOverlay setViewerDimensions failed:', err);
      }
    }

    if (this._spotlightOverlay) {
      try {
        this._spotlightOverlay.setViewerDimensions(width, height, 0, 0, width, height);
      } catch (err) {
        console.error('SpotlightOverlay setViewerDimensions failed:', err);
      }
    }

    if (this._bugOverlay) {
      try {
        this._bugOverlay.setViewerDimensions(width, height, 0, 0, width, height);
      } catch (err) {
        console.error('BugOverlay setViewerDimensions failed:', err);
      }
    }

    if (this._exrWindowOverlay) {
      try {
        this._exrWindowOverlay.setViewerDimensions(width, height, 0, 0, width, height);
      } catch (err) {
        console.error('EXRWindowOverlay setViewerDimensions failed:', err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Typed accessors (lazy creation on first access)
  // ---------------------------------------------------------------------------

  getSafeAreasOverlay(): SafeAreasOverlay {
    if (!this._safeAreasOverlay) {
      this._safeAreasOverlay = new SafeAreasOverlay();
      this.canvasContainer.appendChild(this._safeAreasOverlay.getElement());
      this.applyStoredDimensions(this._safeAreasOverlay);
    }
    return this._safeAreasOverlay;
  }

  getMatteOverlay(): MatteOverlay {
    if (!this._matteOverlay) {
      this._matteOverlay = new MatteOverlay();
      this.canvasContainer.appendChild(this._matteOverlay.getElement());
      this.applyStoredDimensions(this._matteOverlay);
    }
    return this._matteOverlay;
  }

  getTimecodeOverlay(): TimecodeOverlay {
    if (!this._timecodeOverlay) {
      this._timecodeOverlay = new TimecodeOverlay(this.session);
      this.canvasContainer.appendChild(this._timecodeOverlay.getElement());
    }
    return this._timecodeOverlay;
  }

  getPixelProbe(): PixelProbe {
    return this.pixelProbe;
  }

  getFalseColor(): FalseColor {
    return this.falseColor;
  }

  getLuminanceVisualization(): LuminanceVisualization {
    return this.luminanceVisualization;
  }

  getZebraStripes(): ZebraStripes {
    return this.zebraStripes;
  }

  getClippingOverlay(): ClippingOverlay {
    return this.clippingOverlay;
  }

  getSpotlightOverlay(): SpotlightOverlay {
    if (!this._spotlightOverlay) {
      this._spotlightOverlay = new SpotlightOverlay();
      this.canvasContainer.appendChild(this._spotlightOverlay.getElement());
      this.applyStoredDimensions(this._spotlightOverlay);
    }
    return this._spotlightOverlay;
  }

  getBugOverlay(): BugOverlay {
    if (!this._bugOverlay) {
      this._bugOverlay = new BugOverlay();
      this.canvasContainer.appendChild(this._bugOverlay.getElement());
      this.applyStoredDimensions(this._bugOverlay);
    }
    return this._bugOverlay;
  }

  getEXRWindowOverlay(): EXRWindowOverlay {
    if (!this._exrWindowOverlay) {
      this._exrWindowOverlay = new EXRWindowOverlay();
      this.canvasContainer.appendChild(this._exrWindowOverlay.getElement());
      this.applyStoredDimensions(this._exrWindowOverlay);
    }
    return this._exrWindowOverlay;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Dispose all overlays and release resources.
   */
  dispose(): void {
    this.clippingOverlay.dispose();
    this.luminanceVisualization.dispose();
    this.falseColor.dispose();
    this.zebraStripes.dispose();
    this.pixelProbe.dispose();
    this._safeAreasOverlay?.dispose();
    this._matteOverlay?.dispose();
    this._timecodeOverlay?.dispose();
    this._spotlightOverlay?.dispose();
    this._bugOverlay?.dispose();
    this._exrWindowOverlay?.dispose();
  }
}
