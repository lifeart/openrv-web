/**
 * OverlayManager - Centralizes creation, lifecycle, and dimension management
 * for all viewer overlays.
 *
 * Extracted from Viewer.ts to reduce its size and isolate overlay concerns.
 * The manager owns the overlay instances, appends their DOM elements to the
 * canvas container, handles dimension updates on resize, and disposes them
 * on teardown.
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
  // DOM-based overlays (append their own canvas/element to the container)
  private readonly safeAreasOverlay: SafeAreasOverlay;
  private readonly matteOverlay: MatteOverlay;
  private readonly timecodeOverlay: TimecodeOverlay;
  private readonly spotlightOverlay: SpotlightOverlay;

  // Non-DOM overlays (pixel probe has its own floating panel)
  private readonly pixelProbe: PixelProbe;

  // Pixel-level effect overlays (applied to ImageData, no DOM element)
  private readonly falseColor: FalseColor;
  private readonly luminanceVisualization: LuminanceVisualization;
  private readonly zebraStripes: ZebraStripes;
  private readonly clippingOverlay: ClippingOverlay;

  constructor(
    canvasContainer: HTMLElement,
    session: Session,
    callbacks: OverlayManagerCallbacks,
  ) {
    // --- DOM-based overlays ---

    // Safe areas overlay
    this.safeAreasOverlay = new SafeAreasOverlay();
    canvasContainer.appendChild(this.safeAreasOverlay.getElement());

    // Matte overlay (below safe areas, z-index 40)
    this.matteOverlay = new MatteOverlay();
    canvasContainer.appendChild(this.matteOverlay.getElement());

    // Timecode overlay
    this.timecodeOverlay = new TimecodeOverlay(session);
    canvasContainer.appendChild(this.timecodeOverlay.getElement());

    // Spotlight overlay
    this.spotlightOverlay = new SpotlightOverlay();
    canvasContainer.appendChild(this.spotlightOverlay.getElement());

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
  // Dimension management
  // ---------------------------------------------------------------------------

  /**
   * Update overlay dimensions to match display size.
   * Called whenever the canvas resizes.
   */
  updateDimensions(width: number, height: number): void {
    // Update safe areas overlay dimensions
    try {
      this.safeAreasOverlay.setViewerDimensions(width, height, 0, 0, width, height);
    } catch (err) {
      console.error('SafeAreasOverlay setViewerDimensions failed:', err);
    }

    // Update matte overlay dimensions
    try {
      this.matteOverlay.setViewerDimensions(width, height, 0, 0, width, height);
    } catch (err) {
      console.error('MatteOverlay setViewerDimensions failed:', err);
    }

    // Update spotlight overlay dimensions
    try {
      this.spotlightOverlay.setViewerDimensions(width, height, 0, 0, width, height);
    } catch (err) {
      console.error('SpotlightOverlay setViewerDimensions failed:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Typed accessors
  // ---------------------------------------------------------------------------

  getSafeAreasOverlay(): SafeAreasOverlay {
    return this.safeAreasOverlay;
  }

  getMatteOverlay(): MatteOverlay {
    return this.matteOverlay;
  }

  getTimecodeOverlay(): TimecodeOverlay {
    return this.timecodeOverlay;
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
    return this.spotlightOverlay;
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
    this.spotlightOverlay.dispose();
  }
}
