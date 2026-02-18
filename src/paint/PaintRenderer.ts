import {
  Annotation,
  PenStroke,
  TextAnnotation,
  ShapeAnnotation,
  ShapeType,
  BrushType,
  StrokeMode,
  TextOrigin,
  StrokePoint,
  LineJoin,
  LineCap,
} from './types';
import { safeCanvasContext2D } from '../color/SafeCanvasContext';

export interface RenderOptions {
  width: number;  // Image width in logical pixels
  height: number; // Image height in logical pixels
  canvasWidth?: number;  // Output canvas width in logical pixels (defaults to width)
  canvasHeight?: number; // Output canvas height in logical pixels (defaults to height)
  offsetX?: number; // Image-space X offset in output canvas pixels
  offsetY?: number; // Image-space Y offset in output canvas pixels
  opacity?: number;
  ghostTintBefore?: string; // Tint for ghost annotations from before
  ghostTintAfter?: string;  // Tint for ghost annotations from after
  dpr?: number;  // Device pixel ratio for retina support (default: 1)
}

export class PaintRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private _dpr = 1;

  /**
   * Create a PaintRenderer.
   * @param colorSpace - Optional color space to match the image canvas.
   *   When provided, the paint canvas uses the same color space as the
   *   image canvas so compositing is correct. Color picker values remain
   *   in sRGB gamut; the browser automatically converts CSS color values
   *   when drawn to a P3/HDR canvas.
   */
  constructor(colorSpace?: 'srgb' | 'display-p3') {
    this.canvas = document.createElement('canvas');
    const ctx = safeCanvasContext2D(
      this.canvas,
      {},
      colorSpace === 'display-p3' ? 'display-p3' : undefined,
    );
    this.ctx = ctx;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  resize(width: number, height: number, dpr = 1): void {
    this._dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (dpr !== 1) {
      this.ctx.scale(dpr, dpr);
    }
  }

  clear(): void {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  // Render all annotations with optional ghost effect
  renderAnnotations(
    annotations: Array<{ annotation: Annotation; opacity: number }>,
    options: RenderOptions
  ): void {
    this.resize(options.canvasWidth ?? options.width, options.canvasHeight ?? options.height, options.dpr);
    this.clear();

    for (const { annotation, opacity } of annotations) {
      const effectiveOpacity = (options.opacity ?? 1) * opacity;

      if (annotation.type === 'pen') {
        this.renderStroke(annotation, options, effectiveOpacity);
      } else if (annotation.type === 'text') {
        this.renderText(annotation, options, effectiveOpacity);
      } else if (annotation.type === 'shape') {
        this.renderShape(annotation, options, effectiveOpacity);
      }
    }
  }

  // Render a single stroke (for live drawing preview)
  renderStroke(stroke: PenStroke, options: RenderOptions, opacity = 1): void {
    const ctx = this.ctx;
    const { width, height } = options;
    const offsetX = options.offsetX ?? 0;
    const offsetY = options.offsetY ?? 0;
    const points = stroke.points;

    if (points.length === 0) return;

    ctx.save();
    ctx.globalAlpha = opacity;

    // Convert normalized coordinates to canvas pixels
    // Note: OpenRV uses (0,0) at bottom-left, canvas uses top-left
    const toCanvasX = (x: number) => offsetX + x * width;
    const toCanvasY = (y: number) => offsetY + (1 - y) * height; // Flip Y

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
    const offsetX = options.offsetX ?? 0;
    const offsetY = options.offsetY ?? 0;

    ctx.save();
    ctx.globalAlpha = opacity;

    // Convert position
    const x = offsetX + text.position.x * width;
    const y = offsetY + (1 - text.position.y) * height; // Flip Y

    // Set text style
    const [r, g, b, a] = text.color;
    ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

    // Build font string with bold/italic
    const fontSize = text.size * text.scale;
    const fontStyle = text.italic ? 'italic ' : '';
    const fontWeight = text.bold ? 'bold ' : '';
    ctx.font = `${fontStyle}${fontWeight}${fontSize}px ${text.font}`;

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

    // Measure text for background and underline
    const metrics = ctx.measureText(text.text);
    const textWidth = metrics.width;
    const textHeight = fontSize; // Approximate text height

    // Calculate text bounds for background/underline based on alignment
    let textX = x;
    let textY = y;
    if (text.rotation !== 0) {
      textX = 0;
      textY = 0;
    }

    // Get text bounds offset based on alignment
    let bgX = textX;
    let bgY = textY;

    // Horizontal offset
    if (ctx.textAlign === 'center') {
      bgX -= textWidth / 2;
    } else if (ctx.textAlign === 'right') {
      bgX -= textWidth;
    }

    // Vertical offset
    if (ctx.textBaseline === 'top') {
      // bgY is at top
    } else if (ctx.textBaseline === 'middle') {
      bgY -= textHeight / 2;
    } else {
      bgY -= textHeight;
    }

    // Apply rotation transform if needed
    if (text.rotation !== 0) {
      ctx.translate(x, y);
      ctx.rotate((text.rotation * Math.PI) / 180);
    }

    // Draw callout leader line first (behind text)
    if (text.calloutPoint) {
      this.renderCalloutLine(text, options, opacity);
    }

    // Draw background if specified
    if (text.backgroundColor) {
      const [br, bg, bb, ba] = text.backgroundColor;
      const padding = 4;
      ctx.fillStyle = `rgba(${Math.round(br * 255)}, ${Math.round(bg * 255)}, ${Math.round(bb * 255)}, ${ba})`;
      ctx.fillRect(
        bgX - padding,
        bgY - padding,
        textWidth + padding * 2,
        textHeight + padding * 2
      );
      // Restore text color
      ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
    }

    // Draw text
    ctx.fillText(text.text, textX, textY);

    // Draw underline if specified
    if (text.underline) {
      const underlineY = bgY + textHeight + 2;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = Math.max(1, fontSize / 12);
      ctx.beginPath();
      ctx.moveTo(bgX, underlineY);
      ctx.lineTo(bgX + textWidth, underlineY);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Render callout leader line from text to callout point
  private renderCalloutLine(text: TextAnnotation, options: RenderOptions, opacity: number): void {
    if (!text.calloutPoint) return;

    const ctx = this.ctx;
    const { width, height } = options;
    const offsetX = options.offsetX ?? 0;
    const offsetY = options.offsetY ?? 0;

    // Save current state and reset transform for callout line (preserve DPR scale)
    ctx.save();
    const dpr = this._dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = opacity;

    // Convert positions to canvas coordinates
    const startX = offsetX + text.position.x * width;
    const startY = offsetY + (1 - text.position.y) * height;
    const endX = offsetX + text.calloutPoint.x * width;
    const endY = offsetY + (1 - text.calloutPoint.y) * height;

    // Set line style
    const [r, g, b, a] = text.color;
    ctx.strokeStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
    ctx.lineWidth = Math.max(1, text.size * text.scale / 12);
    ctx.lineCap = 'round';

    // Draw leader line
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Draw arrowhead at the end
    const arrowSize = Math.max(6, text.size * text.scale / 4);
    const angle = Math.atan2(endY - startY, endX - startX);

    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle - Math.PI / 6),
      endY - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle + Math.PI / 6),
      endY - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();

    ctx.restore();
  }

  // Render a shape annotation
  renderShape(shape: ShapeAnnotation, options: RenderOptions, opacity = 1): void {
    const ctx = this.ctx;
    const { width, height } = options;
    const offsetX = options.offsetX ?? 0;
    const offsetY = options.offsetY ?? 0;

    ctx.save();
    ctx.globalAlpha = opacity;

    // Convert normalized coordinates to canvas pixels
    const x1 = offsetX + shape.startPoint.x * width;
    const y1 = offsetY + (1 - shape.startPoint.y) * height; // Flip Y
    const x2 = offsetX + shape.endPoint.x * width;
    const y2 = offsetY + (1 - shape.endPoint.y) * height; // Flip Y

    // Set stroke style
    const [sr, sg, sb, sa] = shape.strokeColor;
    ctx.strokeStyle = `rgba(${Math.round(sr * 255)}, ${Math.round(sg * 255)}, ${Math.round(sb * 255)}, ${sa})`;
    ctx.lineWidth = shape.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Set fill style if fill color is specified
    if (shape.fillColor) {
      const [fr, fg, fb, fa] = shape.fillColor;
      ctx.fillStyle = `rgba(${Math.round(fr * 255)}, ${Math.round(fg * 255)}, ${Math.round(fb * 255)}, ${fa})`;
    }

    // Calculate center and dimensions for rotation
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;

    // Apply rotation around center if needed
    if (shape.rotation !== 0) {
      ctx.translate(centerX, centerY);
      ctx.rotate((shape.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    switch (shape.shapeType) {
      case ShapeType.Rectangle:
        this.renderRectangle(ctx, x1, y1, x2, y2, shape);
        break;
      case ShapeType.Ellipse:
        this.renderEllipse(ctx, x1, y1, x2, y2, shape);
        break;
      case ShapeType.Line:
        this.renderLine(ctx, x1, y1, x2, y2);
        break;
      case ShapeType.Arrow:
        this.renderArrow(ctx, x1, y1, x2, y2, shape);
        break;
      case ShapeType.Polygon:
        this.renderPolygon(ctx, shape, options);
        break;
    }

    ctx.restore();
  }

  private renderRectangle(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
    shape: ShapeAnnotation
  ): void {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const rectWidth = Math.abs(x2 - x1);
    const rectHeight = Math.abs(y2 - y1);

    const cornerRadius = shape.cornerRadius ?? 0;
    const radius = cornerRadius * Math.min(rectWidth, rectHeight) / 2;

    if (radius > 0) {
      // Rounded rectangle
      ctx.beginPath();
      ctx.moveTo(left + radius, top);
      ctx.lineTo(left + rectWidth - radius, top);
      ctx.arcTo(left + rectWidth, top, left + rectWidth, top + radius, radius);
      ctx.lineTo(left + rectWidth, top + rectHeight - radius);
      ctx.arcTo(left + rectWidth, top + rectHeight, left + rectWidth - radius, top + rectHeight, radius);
      ctx.lineTo(left + radius, top + rectHeight);
      ctx.arcTo(left, top + rectHeight, left, top + rectHeight - radius, radius);
      ctx.lineTo(left, top + radius);
      ctx.arcTo(left, top, left + radius, top, radius);
      ctx.closePath();
    } else {
      // Regular rectangle
      ctx.beginPath();
      ctx.rect(left, top, rectWidth, rectHeight);
    }

    if (shape.fillColor) {
      ctx.fill();
    }
    ctx.stroke();
  }

  private renderEllipse(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
    shape: ShapeAnnotation
  ): void {
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const radiusX = Math.abs(x2 - x1) / 2;
    const radiusY = Math.abs(y2 - y1) / 2;

    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);

    if (shape.fillColor) {
      ctx.fill();
    }
    ctx.stroke();
  }

  private renderLine(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  private renderArrow(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
    shape: ShapeAnnotation
  ): void {
    // Draw the line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Draw arrowhead at end point
    const arrowSize = shape.arrowheadSize ?? 12;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - arrowSize * Math.cos(angle - Math.PI / 6),
      y2 - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - arrowSize * Math.cos(angle + Math.PI / 6),
      y2 - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  }

  private renderPolygon(
    ctx: CanvasRenderingContext2D,
    shape: ShapeAnnotation,
    options: RenderOptions
  ): void {
    const points = shape.points;
    if (!points || points.length < 2) return;

    const { width, height } = options;
    const offsetX = options.offsetX ?? 0;
    const offsetY = options.offsetY ?? 0;

    // Convert normalized coordinates to canvas pixels
    const toCanvasX = (x: number) => offsetX + x * width;
    const toCanvasY = (y: number) => offsetY + (1 - y) * height; // Flip Y

    ctx.beginPath();
    ctx.moveTo(toCanvasX(points[0]!.x), toCanvasY(points[0]!.y));

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(toCanvasX(points[i]!.x), toCanvasY(points[i]!.y));
    }

    // Close the polygon path
    ctx.closePath();

    if (shape.fillColor) {
      ctx.fill();
    }
    ctx.stroke();
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
    const dpr = options.dpr ?? 1;
    const expectedW = Math.round((options.canvasWidth ?? options.width) * dpr);
    const expectedH = Math.round((options.canvasHeight ?? options.height) * dpr);
    if (this.canvas.width !== expectedW || this.canvas.height !== expectedH) {
      this.resize(options.canvasWidth ?? options.width, options.canvasHeight ?? options.height, dpr);
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

  // Render live shape being drawn (before it's finalized)
  // NOTE: Call renderAnnotations() first to set up canvas size and render existing annotations
  renderLiveShape(
    shapeType: ShapeType,
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    color: [number, number, number, number],
    width: number,
    options: RenderOptions
  ): void {
    // Ensure canvas is properly sized (don't clear - may have existing annotations)
    const dpr = options.dpr ?? 1;
    const expectedW = Math.round((options.canvasWidth ?? options.width) * dpr);
    const expectedH = Math.round((options.canvasHeight ?? options.height) * dpr);
    if (this.canvas.width !== expectedW || this.canvas.height !== expectedH) {
      this.resize(options.canvasWidth ?? options.width, options.canvasHeight ?? options.height, dpr);
    }

    const tempShape: ShapeAnnotation = {
      type: 'shape',
      id: 'live',
      frame: 0,
      user: 'live',
      shapeType,
      startPoint,
      endPoint,
      strokeColor: color,
      strokeWidth: width,
      rotation: 0,
      startFrame: 0,
      duration: 1,
    };

    this.renderShape(tempShape, options, 1);
  }
}
