import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import type { PerspectiveCorrectionParams, Point2D } from '../../transform/PerspectiveCorrection';
import { DEFAULT_PERSPECTIVE_PARAMS, generatePerspectiveGrid } from '../../transform/PerspectiveCorrection';

export interface PerspectiveGridOverlayEvents extends EventMap {
  cornersChanged: PerspectiveCorrectionParams;
}

const HANDLE_SIZE = 12;
const GRID_SUBDIVISIONS = 8;
const GRID_COLOR = 'rgba(0, 180, 255, 0.6)';
const HANDLE_COLOR = 'rgba(0, 180, 255, 0.9)';
const HANDLE_BORDER = 'rgba(255, 255, 255, 0.9)';

const CORNER_KEYS: ('topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft')[] = [
  'topLeft', 'topRight', 'bottomRight', 'bottomLeft',
];

export class PerspectiveGridOverlay extends EventEmitter<PerspectiveGridOverlayEvents> {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private handles: HTMLElement[] = [];
  private params: PerspectiveCorrectionParams;
  private viewerWidth = 0;
  private viewerHeight = 0;

  private activeHandle: number = -1;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartCorner: Point2D = { x: 0, y: 0 };

  private boundOnPointerMove: (e: PointerEvent) => void;
  private boundOnPointerUp: (e: PointerEvent) => void;

  constructor() {
    super();

    this.params = {
      ...DEFAULT_PERSPECTIVE_PARAMS,
      topLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.topLeft },
      topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
      bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
      bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
    };

    // Container
    this.container = document.createElement('div');
    this.container.className = 'perspective-grid-overlay';
    this.container.dataset.testid = 'perspective-grid-overlay';
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      display: none;
    `;

    // Canvas for grid lines
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `;
    this.ctx = this.canvas.getContext('2d')!;
    this.container.appendChild(this.canvas);

    // Create corner handles
    for (let i = 0; i < 4; i++) {
      const handle = document.createElement('div');
      handle.dataset.testid = `perspective-handle-${CORNER_KEYS[i]}`;
      handle.style.cssText = `
        position: absolute;
        width: ${HANDLE_SIZE}px;
        height: ${HANDLE_SIZE}px;
        border-radius: 50%;
        background: ${HANDLE_COLOR};
        border: 2px solid ${HANDLE_BORDER};
        cursor: move;
        pointer-events: auto;
        transform: translate(-50%, -50%);
        z-index: 1;
      `;

      const handleIndex = i;
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.startDrag(handleIndex, e);
      });

      this.handles.push(handle);
      this.container.appendChild(handle);
    }

    this.boundOnPointerMove = this.onPointerMove.bind(this);
    this.boundOnPointerUp = this.onPointerUp.bind(this);
  }

  getElement(): HTMLElement {
    return this.container;
  }

  setParams(params: PerspectiveCorrectionParams): void {
    this.params = {
      ...params,
      topLeft: { ...params.topLeft },
      topRight: { ...params.topRight },
      bottomRight: { ...params.bottomRight },
      bottomLeft: { ...params.bottomLeft },
    };
    this.updateVisibility();
    this.renderGrid();
    this.updateHandlePositions();
  }

  getParams(): PerspectiveCorrectionParams {
    return {
      ...this.params,
      topLeft: { ...this.params.topLeft },
      topRight: { ...this.params.topRight },
      bottomRight: { ...this.params.bottomRight },
      bottomLeft: { ...this.params.bottomLeft },
    };
  }

  setViewerDimensions(width: number, height: number): void {
    this.viewerWidth = width;
    this.viewerHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.renderGrid();
    this.updateHandlePositions();
  }

  private updateVisibility(): void {
    this.container.style.display = this.params.enabled ? 'block' : 'none';
  }

  private updateHandlePositions(): void {
    if (this.viewerWidth === 0 || this.viewerHeight === 0) return;

    for (let i = 0; i < 4; i++) {
      const key = CORNER_KEYS[i]!;
      const corner = this.params[key];
      const handle = this.handles[i]!;
      handle.style.left = `${corner.x * this.viewerWidth}px`;
      handle.style.top = `${corner.y * this.viewerHeight}px`;
    }
  }

  private renderGrid(): void {
    if (this.viewerWidth === 0 || this.viewerHeight === 0) return;
    if (!this.params.enabled) return;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const grid = generatePerspectiveGrid(this.params, GRID_SUBDIVISIONS);

    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;

    // Draw horizontal lines
    for (let j = 0; j <= GRID_SUBDIVISIONS; j++) {
      const row = grid[j]!;
      ctx.beginPath();
      for (let i = 0; i <= GRID_SUBDIVISIONS; i++) {
        const p = row[i]!;
        const px = p.x * this.viewerWidth;
        const py = p.y * this.viewerHeight;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }

    // Draw vertical lines
    for (let i = 0; i <= GRID_SUBDIVISIONS; i++) {
      ctx.beginPath();
      for (let j = 0; j <= GRID_SUBDIVISIONS; j++) {
        const p = grid[j]![i]!;
        const px = p.x * this.viewerWidth;
        const py = p.y * this.viewerHeight;
        if (j === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }
  }

  private startDrag(handleIndex: number, e: PointerEvent): void {
    this.activeHandle = handleIndex;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    const key = CORNER_KEYS[handleIndex]!;
    this.dragStartCorner = { ...this.params[key] };

    document.addEventListener('pointermove', this.boundOnPointerMove);
    document.addEventListener('pointerup', this.boundOnPointerUp);
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.activeHandle < 0 || this.viewerWidth === 0 || this.viewerHeight === 0) return;

    const containerRect = this.container.getBoundingClientRect();
    const dx = (e.clientX - this.dragStartX) / containerRect.width;
    const dy = (e.clientY - this.dragStartY) / containerRect.height;

    const key = CORNER_KEYS[this.activeHandle]!;
    this.params[key] = {
      x: Math.max(-0.5, Math.min(1.5, this.dragStartCorner.x + dx)),
      y: Math.max(-0.5, Math.min(1.5, this.dragStartCorner.y + dy)),
    };

    this.renderGrid();
    this.updateHandlePositions();
    this.emit('cornersChanged', this.getParams());
  }

  private onPointerUp(): void {
    this.activeHandle = -1;
    document.removeEventListener('pointermove', this.boundOnPointerMove);
    document.removeEventListener('pointerup', this.boundOnPointerUp);
  }

  dispose(): void {
    document.removeEventListener('pointermove', this.boundOnPointerMove);
    document.removeEventListener('pointerup', this.boundOnPointerUp);
    for (const handle of this.handles) {
      handle.remove();
    }
    this.handles = [];
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
