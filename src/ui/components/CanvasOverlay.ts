/**
 * CanvasOverlay - Abstract base class for canvas-based overlays
 *
 * Provides the shared boilerplate for overlays that render onto an HTML canvas
 * positioned on top of the viewer. Handles:
 * - Canvas element creation with absolute positioning and pointer-events: none
 * - HiDPI setup via setupHiDPICanvas
 * - Viewer dimension tracking (canvasWidth/Height, displayWidth/Height, offset)
 * - setViewerDimensions() with automatic re-render when visible
 * - getElement() / dispose() implementing the UIControl interface
 * - EventEmitter integration for state change events
 *
 * Subclasses must implement:
 * - render(): draw overlay content using this.ctx and the tracked dimensions
 * - isVisible(): return whether the overlay should currently be drawn
 *
 * Subclasses may override setViewerDimensions() or dispose() to add their
 * own logic, but should call the super method.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { setupHiDPICanvas } from '../../utils/ui/HiDPICanvas';
import type { UIControl } from '../UIControl';

export abstract class CanvasOverlay<E extends EventMap = EventMap>
  extends EventEmitter<E>
  implements UIControl
{
  protected canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;
  protected canvasWidth = 0;
  protected canvasHeight = 0;
  protected displayWidth = 0;
  protected displayHeight = 0;
  protected offsetX = 0;
  protected offsetY = 0;

  constructor(className: string, testId: string, zIndex: number) {
    super();

    this.canvas = document.createElement('canvas');
    this.canvas.className = className;
    this.canvas.dataset.testid = testId;
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: ${zIndex};
    `;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error(`Failed to get 2D context for ${className}`);
    this.ctx = ctx;
  }

  /**
   * Update canvas size and position to match viewer.
   * canvasWidth/canvasHeight are logical (CSS) dimensions.
   */
  setViewerDimensions(
    canvasWidth: number,
    canvasHeight: number,
    offsetX: number,
    offsetY: number,
    displayWidth: number,
    displayHeight: number,
  ): void {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
    this.offsetX = offsetX;
    this.offsetY = offsetY;

    setupHiDPICanvas({
      canvas: this.canvas,
      ctx: this.ctx,
      width: canvasWidth,
      height: canvasHeight,
      setStyle: true,
    });

    if (this.isVisible()) {
      try {
        this.render();
      } catch (err) {
        console.error(`${this.constructor.name} render failed:`, err);
      }
    }
  }

  /**
   * Render the overlay content. Subclasses implement drawing logic here.
   */
  abstract render(): void;

  /**
   * Whether the overlay is currently visible / should be rendered.
   */
  abstract isVisible(): boolean;

  /**
   * Get the canvas element for mounting in the DOM.
   */
  getElement(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Clean up resources. Subclasses should call super.dispose() if they override.
   */
  dispose(): void {
    // Base class has no cleanup needed; subclasses may override.
  }
}
