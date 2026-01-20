/**
 * SpotlightOverlay - Highlight a region while dimming the rest of the image
 *
 * Features:
 * - Circular or rectangular spotlight shape
 * - Adjustable position and size
 * - Adjustable dim amount (how dark the rest becomes)
 * - Optional feathered edge for smooth transitions
 * - Click and drag to position
 * - Handles to resize
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export interface SpotlightEvents extends EventMap {
  stateChanged: SpotlightState;
}

export type SpotlightShape = 'circle' | 'rectangle';

export interface SpotlightState {
  enabled: boolean;
  shape: SpotlightShape;
  // Position (normalized 0-1, center of spotlight)
  x: number;
  y: number;
  // Size (normalized 0-1, radius for circle, half-width/height for rectangle)
  width: number;
  height: number;
  // Dim amount (0-1, how dark the surrounding area becomes)
  dimAmount: number;
  // Feather amount (0-1, how soft the edge is)
  feather: number;
}

export const DEFAULT_SPOTLIGHT_STATE: SpotlightState = {
  enabled: false,
  shape: 'circle',
  x: 0.5,
  y: 0.5,
  width: 0.2,
  height: 0.2,
  dimAmount: 0.7,
  feather: 0.05,
};

export class SpotlightOverlay extends EventEmitter<SpotlightEvents> {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: SpotlightState = { ...DEFAULT_SPOTLIGHT_STATE };
  private displayWidth = 0;
  private displayHeight = 0;
  private offsetX = 0;
  private offsetY = 0;

  // Interaction state
  private isDragging = false;
  private isResizing = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private initialX = 0;
  private initialY = 0;
  private resizeHandle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null = null;

  constructor() {
    super();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'spotlight-overlay';
    this.canvas.dataset.testid = 'spotlight-overlay';
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 44;
    `;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context for spotlight overlay');
    this.ctx = ctx;

    this.bindEvents();
  }

  private bindEvents(): void {
    // Bind mouse events for interaction when enabled
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.state.enabled) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.offsetX) / this.displayWidth;
    const y = (e.clientY - rect.top - this.offsetY) / this.displayHeight;

    // Check if clicking on resize handle
    const handle = this.getResizeHandle(x, y);
    if (handle) {
      this.isResizing = true;
      this.resizeHandle = handle;
      this.dragStartX = x;
      this.dragStartY = y;
      this.initialX = this.state.width;
      this.initialY = this.state.height;
      return;
    }

    // Check if clicking inside spotlight
    if (this.isInsideSpotlight(x, y)) {
      this.isDragging = true;
      this.dragStartX = x;
      this.dragStartY = y;
      this.initialX = this.state.x;
      this.initialY = this.state.y;
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.state.enabled) return;
    if (!this.isDragging && !this.isResizing) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.offsetX) / this.displayWidth;
    const y = (e.clientY - rect.top - this.offsetY) / this.displayHeight;

    if (this.isDragging) {
      const dx = x - this.dragStartX;
      const dy = y - this.dragStartY;

      this.setState({
        x: Math.max(0, Math.min(1, this.initialX + dx)),
        y: Math.max(0, Math.min(1, this.initialY + dy)),
      });
    } else if (this.isResizing && this.resizeHandle) {
      const dx = x - this.dragStartX;
      const dy = y - this.dragStartY;

      let newWidth = this.state.width;
      let newHeight = this.state.height;

      if (this.resizeHandle.includes('e')) {
        newWidth = Math.max(0.05, this.initialX + dx);
      } else if (this.resizeHandle.includes('w')) {
        newWidth = Math.max(0.05, this.initialX - dx);
      }

      if (this.resizeHandle.includes('s')) {
        newHeight = Math.max(0.05, this.initialY + dy);
      } else if (this.resizeHandle.includes('n')) {
        newHeight = Math.max(0.05, this.initialY - dy);
      }

      this.setState({
        width: newWidth,
        height: this.state.shape === 'circle' ? newWidth : newHeight,
      });
    }
  };

  private onMouseUp = (): void => {
    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = null;
  };

  private isInsideSpotlight(x: number, y: number): boolean {
    const { x: cx, y: cy, width, height, shape } = this.state;

    if (shape === 'circle') {
      const dx = (x - cx) / width;
      const dy = (y - cy) / height;
      return dx * dx + dy * dy <= 1;
    } else {
      return (
        x >= cx - width &&
        x <= cx + width &&
        y >= cy - height &&
        y <= cy + height
      );
    }
  }

  private getResizeHandle(
    x: number,
    y: number
  ): 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null {
    const { x: cx, y: cy, width, height, shape } = this.state;
    const handleSize = 0.02;

    if (shape === 'circle') {
      // Only check the 4 cardinal points for circle
      if (Math.abs(x - cx) < handleSize && Math.abs(y - (cy - height)) < handleSize) return 'n';
      if (Math.abs(x - cx) < handleSize && Math.abs(y - (cy + height)) < handleSize) return 's';
      if (Math.abs(x - (cx + width)) < handleSize && Math.abs(y - cy) < handleSize) return 'e';
      if (Math.abs(x - (cx - width)) < handleSize && Math.abs(y - cy) < handleSize) return 'w';
    } else {
      // Rectangle has 8 handles
      const corners = [
        { handle: 'nw' as const, hx: cx - width, hy: cy - height },
        { handle: 'ne' as const, hx: cx + width, hy: cy - height },
        { handle: 'sw' as const, hx: cx - width, hy: cy + height },
        { handle: 'se' as const, hx: cx + width, hy: cy + height },
        { handle: 'n' as const, hx: cx, hy: cy - height },
        { handle: 's' as const, hx: cx, hy: cy + height },
        { handle: 'e' as const, hx: cx + width, hy: cy },
        { handle: 'w' as const, hx: cx - width, hy: cy },
      ];

      for (const { handle, hx, hy } of corners) {
        if (Math.abs(x - hx) < handleSize && Math.abs(y - hy) < handleSize) {
          return handle;
        }
      }
    }

    return null;
  }

  /**
   * Update canvas size and position to match viewer
   */
  setViewerDimensions(
    canvasWidth: number,
    canvasHeight: number,
    offsetX: number,
    offsetY: number,
    displayWidth: number,
    displayHeight: number
  ): void {
    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
    this.offsetX = offsetX;
    this.offsetY = offsetY;

    if (this.state.enabled) {
      this.render();
    }
  }

  /**
   * Set the complete state
   */
  setState(state: Partial<SpotlightState>): void {
    this.state = { ...this.state, ...state };
    this.render();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Get current state
   */
  getState(): SpotlightState {
    return { ...this.state };
  }

  /**
   * Toggle spotlight on/off
   */
  toggle(): void {
    this.setState({ enabled: !this.state.enabled });
    // Toggle pointer events based on enabled state
    this.canvas.style.pointerEvents = this.state.enabled ? 'auto' : 'none';
  }

  /**
   * Enable spotlight
   */
  enable(): void {
    this.setState({ enabled: true });
    this.canvas.style.pointerEvents = 'auto';
  }

  /**
   * Disable spotlight
   */
  disable(): void {
    this.setState({ enabled: false });
    this.canvas.style.pointerEvents = 'none';
  }

  /**
   * Set spotlight shape
   */
  setShape(shape: SpotlightShape): void {
    this.setState({ shape });
  }

  /**
   * Set spotlight position (normalized 0-1)
   */
  setPosition(x: number, y: number): void {
    this.setState({
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    });
  }

  /**
   * Set spotlight size (normalized 0-1)
   */
  setSize(width: number, height?: number): void {
    this.setState({
      width: Math.max(0.01, Math.min(1, width)),
      height: Math.max(0.01, Math.min(1, height ?? width)),
    });
  }

  /**
   * Set dim amount (0-1)
   */
  setDimAmount(amount: number): void {
    this.setState({ dimAmount: Math.max(0, Math.min(1, amount)) });
  }

  /**
   * Set feather amount (0-1)
   */
  setFeather(amount: number): void {
    this.setState({ feather: Math.max(0, Math.min(0.5, amount)) });
  }

  /**
   * Render the spotlight overlay
   */
  render(): void {
    const { ctx, canvas } = this;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!this.state.enabled || this.displayWidth === 0 || this.displayHeight === 0) {
      return;
    }

    const { x, y, width, height, dimAmount, feather, shape } = this.state;
    const { offsetX, offsetY, displayWidth, displayHeight } = this;

    // Convert normalized coordinates to pixel coordinates
    const centerX = offsetX + x * displayWidth;
    const centerY = offsetY + y * displayHeight;
    const pixelWidth = width * displayWidth;
    const pixelHeight = height * displayHeight;
    const pixelFeather = feather * Math.min(displayWidth, displayHeight);

    // Create gradient for spotlight with feathered edge
    if (shape === 'circle') {
      const radius = Math.max(pixelWidth, pixelHeight);
      const innerRadius = Math.max(0, radius - pixelFeather);

      // Draw dimming layer with circular cutout
      ctx.save();

      // Create radial gradient for feathered edge
      const gradient = ctx.createRadialGradient(
        centerX, centerY, innerRadius,
        centerX, centerY, radius + pixelFeather
      );
      gradient.addColorStop(0, `rgba(0, 0, 0, 0)`);
      gradient.addColorStop(1, `rgba(0, 0, 0, ${dimAmount})`);

      // Fill everything with dim color
      ctx.fillStyle = `rgba(0, 0, 0, ${dimAmount})`;
      ctx.fillRect(offsetX, offsetY, displayWidth, displayHeight);

      // Cut out the spotlight area with gradient
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + pixelFeather, 0, Math.PI * 2);
      ctx.fill();

      // Add back the feathered edge
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + pixelFeather, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Draw spotlight outline for visual feedback
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw resize handles
      this.drawResizeHandles(centerX, centerY, radius, radius);

    } else {
      // Rectangle spotlight
      const left = centerX - pixelWidth;
      const top = centerY - pixelHeight;
      const right = centerX + pixelWidth;
      const bottom = centerY + pixelHeight;

      ctx.save();

      // Fill everything with dim color
      ctx.fillStyle = `rgba(0, 0, 0, ${dimAmount})`;
      ctx.fillRect(offsetX, offsetY, displayWidth, displayHeight);

      // Cut out the spotlight area
      ctx.globalCompositeOperation = 'destination-out';

      if (pixelFeather > 0) {
        // Draw feathered rectangle using multiple passes
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
          const alpha = i / steps;
          const expand = (1 - alpha) * pixelFeather;
          ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
          ctx.fillRect(
            left - expand,
            top - expand,
            (right - left) + expand * 2,
            (bottom - top) + expand * 2
          );
        }
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 1)';
        ctx.fillRect(left, top, right - left, bottom - top);
      }

      ctx.restore();

      // Draw spotlight outline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(left, top, right - left, bottom - top);
      ctx.setLineDash([]);

      // Draw resize handles
      this.drawRectangleHandles(left, top, right, bottom);
    }
  }

  private drawResizeHandles(cx: number, cy: number, rx: number, ry: number): void {
    const { ctx } = this;
    const handleSize = 6;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1;

    // Draw 4 handles at cardinal points
    const handles = [
      { x: cx, y: cy - ry },       // N
      { x: cx, y: cy + ry },       // S
      { x: cx + rx, y: cy },       // E
      { x: cx - rx, y: cy },       // W
    ];

    for (const h of handles) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, handleSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawRectangleHandles(left: number, top: number, right: number, bottom: number): void {
    const { ctx } = this;
    const handleSize = 6;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1;

    // 8 handles for rectangle
    const handles = [
      { x: left, y: top },         // NW
      { x: right, y: top },        // NE
      { x: left, y: bottom },      // SW
      { x: right, y: bottom },     // SE
      { x: cx, y: top },           // N
      { x: cx, y: bottom },        // S
      { x: right, y: cy },         // E
      { x: left, y: cy },          // W
    ];

    for (const h of handles) {
      ctx.beginPath();
      ctx.rect(h.x - handleSize, h.y - handleSize, handleSize * 2, handleSize * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  /**
   * Check if overlay is visible
   */
  isVisible(): boolean {
    return this.state.enabled;
  }

  /**
   * Get the canvas element
   */
  getElement(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Dispose
   */
  dispose(): void {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
  }
}
