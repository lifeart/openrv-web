import {
  Annotation,
  PenStroke,
  TextAnnotation,
  BrushType,
  StrokeMode,
  TextOrigin,
  StrokePoint,
  LineJoin,
  LineCap,
} from './types';

export interface RenderOptions {
  width: number;  // Canvas width in pixels
  height: number; // Canvas height in pixels
  opacity?: number;
  ghostTintBefore?: string; // Tint for ghost annotations from before
  ghostTintAfter?: string;  // Tint for ghost annotations from after
}

export class PaintRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // Render all annotations with optional ghost effect
  renderAnnotations(
    annotations: Array<{ annotation: Annotation; opacity: number }>,
    options: RenderOptions
  ): void {
    this.resize(options.width, options.height);
    this.clear();

    for (const { annotation, opacity } of annotations) {
      const effectiveOpacity = (options.opacity ?? 1) * opacity;

      if (annotation.type === 'pen') {
        this.renderStroke(annotation, options, effectiveOpacity);
      } else if (annotation.type === 'text') {
        this.renderText(annotation, options, effectiveOpacity);
      }
    }
  }

  // Render a single stroke (for live drawing preview)
  renderStroke(stroke: PenStroke, options: RenderOptions, opacity = 1): void {
    const ctx = this.ctx;
    const { width, height } = options;
    const points = stroke.points;

    if (points.length === 0) return;

    ctx.save();
    ctx.globalAlpha = opacity;

    // Convert normalized coordinates to canvas pixels
    // Note: OpenRV uses (0,0) at bottom-left, canvas uses top-left
    const toCanvasX = (x: number) => x * width;
    const toCanvasY = (y: number) => (1 - y) * height; // Flip Y

    // Set stroke style
    const [r, g, b, a] = stroke.color;
    ctx.strokeStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
    ctx.fillStyle = ctx.strokeStyle;

    // Handle erase mode
    if (stroke.mode === StrokeMode.Erase) {
      ctx.globalCompositeOperation = 'destination-out';
    }

    // Set line style
    ctx.lineCap = stroke.cap === 2 ? 'round' : stroke.cap === 1 ? 'square' : 'butt';
    ctx.lineJoin = stroke.join === 3 ? 'round' : stroke.join === 2 ? 'miter' : stroke.join === 1 ? 'bevel' : 'miter';

    // Get width (could be array for pressure sensitivity)
    const getWidth = (index: number): number => {
      if (Array.isArray(stroke.width)) {
        return stroke.width[Math.min(index, stroke.width.length - 1)] ?? stroke.width[0] ?? 3;
      }
      return stroke.width;
    };

    if (stroke.brush === BrushType.Gaussian && stroke.splat) {
      // Soft brush using Gaussian splats
      this.renderGaussianStroke(points, toCanvasX, toCanvasY, getWidth, stroke.color, opacity);
    } else {
      // Hard brush using regular line drawing
      if (points.length === 1) {
        // Single point - draw a circle
        const p = points[0]!;
        const w = getWidth(0);
        ctx.beginPath();
        ctx.arc(toCanvasX(p.x), toCanvasY(p.y), w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Multiple points - draw path
        ctx.lineWidth = getWidth(0);
        ctx.beginPath();
        ctx.moveTo(toCanvasX(points[0]!.x), toCanvasY(points[0]!.y));

        for (let i = 1; i < points.length; i++) {
          const p = points[i]!;

          // Variable width requires segment-by-segment drawing
          if (Array.isArray(stroke.width)) {
            ctx.lineWidth = getWidth(i);
            ctx.lineTo(toCanvasX(p.x), toCanvasY(p.y));
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(toCanvasX(p.x), toCanvasY(p.y));
          } else {
            // Smooth curve using quadratic bezier
            if (i < points.length - 1) {
              const nextP = points[i + 1]!;
              const midX = (p.x + nextP.x) / 2;
              const midY = (p.y + nextP.y) / 2;
              ctx.quadraticCurveTo(toCanvasX(p.x), toCanvasY(p.y), toCanvasX(midX), toCanvasY(midY));
            } else {
              ctx.lineTo(toCanvasX(p.x), toCanvasY(p.y));
            }
          }
        }

        if (!Array.isArray(stroke.width)) {
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  private renderGaussianStroke(
    points: StrokePoint[],
    toCanvasX: (x: number) => number,
    toCanvasY: (y: number) => number,
    getWidth: (index: number) => number,
    color: [number, number, number, number],
    opacity: number
  ): void {
    const ctx = this.ctx;
    const [r, g, b, a] = color;

    // Render each point as a radial gradient "splat"
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      const w = getWidth(i) * (p.pressure ?? 1);
      const radius = w;
      const x = toCanvasX(p.x);
      const y = toCanvasY(p.y);

      // Create radial gradient for soft edge
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a * opacity})`);
      gradient.addColorStop(1, `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderText(text: TextAnnotation, options: RenderOptions, opacity = 1): void {
    const ctx = this.ctx;
    const { width, height } = options;

    ctx.save();
    ctx.globalAlpha = opacity;

    // Convert position
    const x = text.position.x * width;
    const y = (1 - text.position.y) * height; // Flip Y

    // Set text style
    const [r, g, b, a] = text.color;
    ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

    const fontSize = text.size * text.scale;
    ctx.font = `${fontSize}px ${text.font}`;

    // Handle text alignment based on origin
    switch (text.origin) {
      case TextOrigin.TopLeft:
      case TextOrigin.CenterLeft:
      case TextOrigin.BottomLeft:
        ctx.textAlign = 'left';
        break;
      case TextOrigin.TopCenter:
      case TextOrigin.Center:
      case TextOrigin.BottomCenter:
        ctx.textAlign = 'center';
        break;
      case TextOrigin.TopRight:
      case TextOrigin.CenterRight:
      case TextOrigin.BottomRight:
        ctx.textAlign = 'right';
        break;
    }

    switch (text.origin) {
      case TextOrigin.TopLeft:
      case TextOrigin.TopCenter:
      case TextOrigin.TopRight:
        ctx.textBaseline = 'top';
        break;
      case TextOrigin.CenterLeft:
      case TextOrigin.Center:
      case TextOrigin.CenterRight:
        ctx.textBaseline = 'middle';
        break;
      case TextOrigin.BottomLeft:
      case TextOrigin.BottomCenter:
      case TextOrigin.BottomRight:
        ctx.textBaseline = 'bottom';
        break;
    }

    // Apply rotation
    if (text.rotation !== 0) {
      ctx.translate(x, y);
      ctx.rotate((text.rotation * Math.PI) / 180);
      ctx.fillText(text.text, 0, 0);
    } else {
      ctx.fillText(text.text, x, y);
    }

    ctx.restore();
  }

  // Render live stroke being drawn (before it's finalized)
  // NOTE: Call renderAnnotations() first to set up canvas size and render existing annotations
  renderLiveStroke(
    points: StrokePoint[],
    color: [number, number, number, number],
    width: number,
    brush: BrushType,
    isEraser: boolean,
    options: RenderOptions
  ): void {
    if (points.length === 0) return;

    // Ensure canvas is properly sized (don't clear - may have existing annotations)
    if (this.canvas.width !== options.width || this.canvas.height !== options.height) {
      this.resize(options.width, options.height);
    }

    const tempStroke: PenStroke = {
      type: 'pen',
      id: 'live',
      frame: 0,
      user: 'live',
      color,
      width,
      brush,
      points,
      join: LineJoin.Round,
      cap: LineCap.Round,
      splat: brush === BrushType.Gaussian,
      mode: isEraser ? StrokeMode.Erase : StrokeMode.Draw,
      startFrame: 0,
      duration: 1,
    };

    this.renderStroke(tempStroke, options, 1);
  }
}
