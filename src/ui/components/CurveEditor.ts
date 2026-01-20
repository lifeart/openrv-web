/**
 * CurveEditor - Interactive curve editing canvas
 *
 * Canvas-based UI for editing color curves with draggable control points.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import {
  CurveChannel,
  ColorCurvesData,
  createDefaultCurve,
  evaluateCurveAtPoint,
  addPointToCurve,
  removePointFromCurve,
  updatePointInCurve,
} from '../../color/ColorCurves';
import { setupHiDPICanvas, clientToCanvasCoordinates } from '../../utils/HiDPICanvas';

export type CurveChannelType = 'master' | 'red' | 'green' | 'blue';

interface CurveEditorEvents extends EventMap {
  curveChanged: { channel: CurveChannelType; curve: CurveChannel };
  channelChanged: CurveChannelType;
}

const CHANNEL_COLORS: Record<CurveChannelType, string> = {
  master: '#ffffff',
  red: '#ff6b6b',
  green: '#69db7c',
  blue: '#74c0fc',
};

const CHANNEL_BG_COLORS: Record<CurveChannelType, string> = {
  master: 'rgba(255, 255, 255, 0.1)',
  red: 'rgba(255, 107, 107, 0.1)',
  green: 'rgba(105, 219, 124, 0.1)',
  blue: 'rgba(116, 192, 252, 0.1)',
};

export class CurveEditor extends EventEmitter<CurveEditorEvents> {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private channelButtons: Map<CurveChannelType, HTMLButtonElement> = new Map();

  private curves: ColorCurvesData;
  private activeChannel: CurveChannelType = 'master';
  private size = 200;
  private padding = 10;

  private draggingPointIndex: number | null = null;
  private hoverPointIndex: number | null = null;

  constructor(initialCurves?: ColorCurvesData) {
    super();

    this.curves = initialCurves ?? {
      master: createDefaultCurve(),
      red: createDefaultCurve(),
      green: createDefaultCurve(),
      blue: createDefaultCurve(),
    };

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'curve-editor';
    this.container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px;
      background: #1a1a1a;
      border-radius: 6px;
    `;

    // Create channel selector
    const channelBar = document.createElement('div');
    channelBar.style.cssText = `
      display: flex;
      gap: 4px;
    `;

    const channels: CurveChannelType[] = ['master', 'red', 'green', 'blue'];
    channels.forEach((channel) => {
      const btn = document.createElement('button');
      btn.textContent = channel === 'master' ? 'RGB' : channel.charAt(0).toUpperCase();
      btn.title = channel === 'master' ? 'Master (RGB)' : `${channel.charAt(0).toUpperCase()}${channel.slice(1)} channel`;
      btn.dataset.testid = `curve-channel-${channel}`;
      btn.style.cssText = `
        flex: 1;
        padding: 4px 8px;
        border: 1px solid #3a3a3a;
        border-radius: 3px;
        background: ${channel === this.activeChannel ? CHANNEL_BG_COLORS[channel] : 'transparent'};
        color: ${CHANNEL_COLORS[channel]};
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.15s ease;
      `;
      btn.addEventListener('click', () => this.setActiveChannel(channel));
      btn.addEventListener('mouseenter', () => {
        if (channel !== this.activeChannel) {
          btn.style.background = '#2a2a2a';
        }
      });
      btn.addEventListener('mouseleave', () => {
        if (channel !== this.activeChannel) {
          btn.style.background = 'transparent';
        }
      });
      channelBar.appendChild(btn);
      this.channelButtons.set(channel, btn);
    });
    this.container.appendChild(channelBar);

    // Create canvas with hi-DPI support
    this.canvas = document.createElement('canvas');
    this.canvas.dataset.testid = 'curve-canvas';
    this.canvas.style.cssText = `
      background: #0a0a0a;
      border-radius: 4px;
      cursor: crosshair;
    `;
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;

    // Setup hi-DPI canvas scaling
    setupHiDPICanvas({
      canvas: this.canvas,
      ctx: this.ctx,
      width: this.size,
      height: this.size,
    });

    // Bind events
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
    this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));

    // Initial render
    this.render();
  }

  private setActiveChannel(channel: CurveChannelType): void {
    if (channel === this.activeChannel) return;

    this.activeChannel = channel;

    // Update button styles
    this.channelButtons.forEach((btn, ch) => {
      btn.style.background = ch === channel ? CHANNEL_BG_COLORS[ch] : 'transparent';
    });

    this.emit('channelChanged', channel);
    this.render();
  }

  private getActiveCurve(): CurveChannel {
    return this.curves[this.activeChannel];
  }

  private setActiveCurve(curve: CurveChannel): void {
    this.curves[this.activeChannel] = curve;
    this.emit('curveChanged', { channel: this.activeChannel, curve });
  }

  private canvasToNormalized(x: number, y: number): { x: number; y: number } {
    const innerSize = this.size - this.padding * 2;
    return {
      x: (x - this.padding) / innerSize,
      y: 1 - (y - this.padding) / innerSize,
    };
  }

  private normalizedToCanvas(x: number, y: number): { x: number; y: number } {
    const innerSize = this.size - this.padding * 2;
    return {
      x: this.padding + x * innerSize,
      y: this.padding + (1 - y) * innerSize,
    };
  }

  private findPointNear(canvasX: number, canvasY: number, threshold = 10): number | null {
    const curve = this.getActiveCurve();
    for (let i = 0; i < curve.points.length; i++) {
      const pt = curve.points[i]!;
      const canvasPt = this.normalizedToCanvas(pt.x, pt.y);
      const dx = canvasX - canvasPt.x;
      const dy = canvasY - canvasPt.y;
      if (Math.sqrt(dx * dx + dy * dy) < threshold) {
        return i;
      }
    }
    return null;
  }

  private handleMouseDown(e: MouseEvent): void {
    // Convert client coordinates to logical canvas coordinates (handles hi-DPI correctly)
    const { x, y } = clientToCanvasCoordinates(
      this.canvas,
      e.clientX,
      e.clientY,
      this.size,
      this.size
    );

    const pointIndex = this.findPointNear(x, y);
    if (pointIndex !== null) {
      this.draggingPointIndex = pointIndex;
      this.canvas.style.cursor = 'grabbing';
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    // Convert client coordinates to logical canvas coordinates (handles hi-DPI correctly)
    const { x, y } = clientToCanvasCoordinates(
      this.canvas,
      e.clientX,
      e.clientY,
      this.size,
      this.size
    );

    if (this.draggingPointIndex !== null) {
      const norm = this.canvasToNormalized(x, y);
      const newCurve = updatePointInCurve(
        this.getActiveCurve(),
        this.draggingPointIndex,
        norm.x,
        norm.y
      );
      this.setActiveCurve(newCurve);
      this.render();
    } else {
      const pointIndex = this.findPointNear(x, y);
      if (pointIndex !== this.hoverPointIndex) {
        this.hoverPointIndex = pointIndex;
        this.canvas.style.cursor = pointIndex !== null ? 'grab' : 'crosshair';
        this.render();
      }
    }
  }

  private handleMouseUp(): void {
    if (this.draggingPointIndex !== null) {
      this.draggingPointIndex = null;
      this.canvas.style.cursor = this.hoverPointIndex !== null ? 'grab' : 'crosshair';
    }
  }

  private handleMouseLeave(): void {
    this.draggingPointIndex = null;
    this.hoverPointIndex = null;
    this.canvas.style.cursor = 'crosshair';
    this.render();
  }

  private handleDoubleClick(e: MouseEvent): void {
    // Convert client coordinates to logical canvas coordinates (handles hi-DPI correctly)
    const { x, y } = clientToCanvasCoordinates(
      this.canvas,
      e.clientX,
      e.clientY,
      this.size,
      this.size
    );

    const norm = this.canvasToNormalized(x, y);

    // Only add if within bounds
    if (norm.x > 0 && norm.x < 1 && norm.y >= 0 && norm.y <= 1) {
      const newCurve = addPointToCurve(this.getActiveCurve(), norm.x);
      // Find the newly added point and set its y value
      const newPoints = newCurve.points.map((pt) => {
        if (Math.abs(pt.x - norm.x) < 0.001) {
          return { x: pt.x, y: Math.max(0, Math.min(1, norm.y)) };
        }
        return pt;
      });
      this.setActiveCurve({ ...newCurve, points: newPoints });
      this.render();
    }
  }

  private handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    // Convert client coordinates to logical canvas coordinates (handles hi-DPI correctly)
    const { x, y } = clientToCanvasCoordinates(
      this.canvas,
      e.clientX,
      e.clientY,
      this.size,
      this.size
    );

    const pointIndex = this.findPointNear(x, y);
    if (pointIndex !== null && pointIndex > 0 && pointIndex < this.getActiveCurve().points.length - 1) {
      const newCurve = removePointFromCurve(this.getActiveCurve(), pointIndex);
      this.setActiveCurve(newCurve);
      this.hoverPointIndex = null;
      this.render();
    }
  }

  private render(): void {
    const ctx = this.ctx;
    const size = this.size;
    const padding = this.padding;
    const innerSize = size - padding * 2;

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, size, size);

    // Draw grid
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;

    // Vertical and horizontal lines at 25%, 50%, 75%
    [0.25, 0.5, 0.75].forEach((t) => {
      const pos = padding + t * innerSize;

      // Vertical
      ctx.beginPath();
      ctx.moveTo(pos, padding);
      ctx.lineTo(pos, size - padding);
      ctx.stroke();

      // Horizontal
      ctx.beginPath();
      ctx.moveTo(padding, pos);
      ctx.lineTo(size - padding, pos);
      ctx.stroke();
    });

    // Draw border
    ctx.strokeStyle = '#3a3a3a';
    ctx.strokeRect(padding, padding, innerSize, innerSize);

    // Draw diagonal reference line (identity)
    ctx.strokeStyle = '#3a3a3a';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding, size - padding);
    ctx.lineTo(size - padding, padding);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw curve
    const curve = this.getActiveCurve();
    const color = CHANNEL_COLORS[this.activeChannel];

    if (curve.points.length > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      // Draw smooth curve by sampling many points
      for (let i = 0; i <= innerSize; i++) {
        const x = i / innerSize;
        const y = evaluateCurveAtPoint(curve.points, x);
        const canvasPt = this.normalizedToCanvas(x, y);

        if (i === 0) {
          ctx.moveTo(canvasPt.x, canvasPt.y);
        } else {
          ctx.lineTo(canvasPt.x, canvasPt.y);
        }
      }
      ctx.stroke();

      // Draw control points
      curve.points.forEach((pt, i) => {
        const canvasPt = this.normalizedToCanvas(pt.x, pt.y);
        const isHovered = i === this.hoverPointIndex;
        const isDragging = i === this.draggingPointIndex;
        const isEndpoint = i === 0 || i === curve.points.length - 1;

        const radius = isHovered || isDragging ? 7 : 5;

        // Outer circle
        ctx.beginPath();
        ctx.arc(canvasPt.x, canvasPt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isDragging ? color : (isHovered ? '#ffffff' : '#1a1a1a');
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner dot for endpoints
        if (isEndpoint) {
          ctx.beginPath();
          ctx.arc(canvasPt.x, canvasPt.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      });
    }

    // Draw inactive channel curves faintly
    const inactiveChannels: CurveChannelType[] = ['master', 'red', 'green', 'blue'].filter(
      (c) => c !== this.activeChannel
    ) as CurveChannelType[];

    inactiveChannels.forEach((channel) => {
      const ch = this.curves[channel];
      if (ch.points.length > 1) {
        ctx.strokeStyle = CHANNEL_COLORS[channel];
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let i = 0; i <= innerSize; i++) {
          const x = i / innerSize;
          const y = evaluateCurveAtPoint(ch.points, x);
          const canvasPt = this.normalizedToCanvas(x, y);

          if (i === 0) {
            ctx.moveTo(canvasPt.x, canvasPt.y);
          } else {
            ctx.lineTo(canvasPt.x, canvasPt.y);
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
  }

  /**
   * Get all curves data
   * Returns a deep copy to prevent mutation of internal state
   */
  getCurves(): ColorCurvesData {
    const deepCopyChannel = (ch: CurveChannel): CurveChannel => ({
      enabled: ch.enabled,
      points: ch.points.map((p) => ({ x: p.x, y: p.y })),
    });

    return {
      master: deepCopyChannel(this.curves.master),
      red: deepCopyChannel(this.curves.red),
      green: deepCopyChannel(this.curves.green),
      blue: deepCopyChannel(this.curves.blue),
    };
  }

  /**
   * Set all curves data
   * Deep copies the curves to prevent mutation of the source data
   */
  setCurves(curves: ColorCurvesData): void {
    const deepCopyChannel = (ch: CurveChannel): CurveChannel => ({
      enabled: ch.enabled,
      points: ch.points.map((p) => ({ x: p.x, y: p.y })),
    });

    this.curves = {
      master: deepCopyChannel(curves.master),
      red: deepCopyChannel(curves.red),
      green: deepCopyChannel(curves.green),
      blue: deepCopyChannel(curves.blue),
    };
    this.render();
  }

  /**
   * Reset active channel to default
   */
  resetActiveChannel(): void {
    this.setActiveCurve(createDefaultCurve());
    this.render();
  }

  /**
   * Reset all channels to default
   */
  resetAll(): void {
    this.curves = {
      master: createDefaultCurve(),
      red: createDefaultCurve(),
      green: createDefaultCurve(),
      blue: createDefaultCurve(),
    };
    this.emit('curveChanged', { channel: 'master', curve: this.curves.master });
    this.render();
  }

  /**
   * Get the active channel
   */
  getActiveChannel(): CurveChannelType {
    return this.activeChannel;
  }

  /**
   * Render the component
   */
  render_element(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave.bind(this));
    this.canvas.removeEventListener('dblclick', this.handleDoubleClick.bind(this));
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu.bind(this));
  }
}
