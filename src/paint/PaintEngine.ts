import { EventEmitter, EventMap } from '../utils/EventEmitter';
import {
  Annotation,
  PenStroke,
  TextAnnotation,
  ShapeAnnotation,
  ShapeType,
  Point,
  PaintState,
  PaintEffects,
  StrokePoint,
  BrushType,
  LineJoin,
  LineCap,
  StrokeMode,
  TextOrigin,
  PaintSnapshot,
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_BRUSH_TYPE,
  DEFAULT_PAINT_EFFECTS,
  type AnnotationVersion,
} from './types';

export interface PaintEngineEvents extends EventMap {
  strokeAdded: Annotation;
  strokeRemoved: Annotation;
  annotationsChanged: number; // frame number
  effectsChanged: PaintEffects;
  toolChanged: PaintTool;
  brushChanged: BrushType;
}

export type PaintTool = 'pen' | 'text' | 'eraser' | 'select' | 'none' | 'rectangle' | 'ellipse' | 'line' | 'arrow';

export class PaintEngine extends EventEmitter<PaintEngineEvents> {
  private state: PaintState;
  private currentStroke: PenStroke | null = null;
  private undoStack: Annotation[][] = [];
  private redoStack: Annotation[][] = [];

  // Current tool settings
  private _tool: PaintTool = 'none';
  private _color: [number, number, number, number] = [...DEFAULT_STROKE_COLOR];
  private _width: number = DEFAULT_STROKE_WIDTH;
  private _brush: BrushType = DEFAULT_BRUSH_TYPE;
  private _user: string = 'user';
  private _annotationVersion: AnnotationVersion = 'all';

  constructor() {
    super();
    this.state = {
      nextId: 0,
      show: true,
      annotations: new Map(),
      effects: { ...DEFAULT_PAINT_EFFECTS },
    };
  }

  // Tool settings
  get tool(): PaintTool {
    return this._tool;
  }

  set tool(value: PaintTool) {
    this._tool = value;
    this.emit('toolChanged', value);
  }

  get color(): [number, number, number, number] {
    return this._color;
  }

  set color(value: [number, number, number, number]) {
    this._color = [...value];
  }

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this._width = Math.max(1, Math.min(100, value));
  }

  get brush(): BrushType {
    return this._brush;
  }

  set brush(value: BrushType) {
    if (value !== this._brush) {
      this._brush = value;
      this.emit('brushChanged', value);
    }
  }

  get user(): string {
    return this._user;
  }

  set user(value: string) {
    this._user = value;
  }

  get annotationVersion(): AnnotationVersion {
    return this._annotationVersion;
  }

  set annotationVersion(value: AnnotationVersion) {
    this._annotationVersion = value;
  }

  get effects(): PaintEffects {
    return { ...this.state.effects };
  }

  get show(): boolean {
    return this.state.show;
  }

  set show(value: boolean) {
    this.state.show = value;
  }

  // Effect settings
  setGhostMode(enabled: boolean, before = 3, after = 3): void {
    this.state.effects.ghost = enabled;
    this.state.effects.ghostBefore = before;
    this.state.effects.ghostAfter = after;
    this.emit('effectsChanged', this.state.effects);
  }

  setHoldMode(enabled: boolean): void {
    this.state.effects.hold = enabled;
    this.emit('effectsChanged', this.state.effects);
  }

  // Stroke operations
  beginStroke(frame: number, point: StrokePoint): void {
    if (this._tool !== 'pen' && this._tool !== 'eraser') return;

    // When hold mode is enabled, annotations persist on all subsequent frames
    const duration = this.state.effects.hold ? -1 : 0;

    this.currentStroke = {
      type: 'pen',
      id: String(this.state.nextId++),
      frame,
      user: this._user,
      version: this._annotationVersion,
      color: [...this._color],
      width: this._width,
      brush: this._brush,
      points: [point],
      join: LineJoin.Round,
      cap: LineCap.Round,
      splat: this._brush === BrushType.Gaussian,
      mode: this._tool === 'eraser' ? StrokeMode.Erase : StrokeMode.Draw,
      startFrame: frame,
      duration, // -1 = visible on all subsequent frames (hold mode), 0 = visible only on drawn frame
    };
  }

  continueStroke(point: StrokePoint): void {
    if (!this.currentStroke) return;
    this.currentStroke.points.push(point);
  }

  endStroke(): PenStroke | null {
    if (!this.currentStroke) return null;

    // Only add if we have at least 2 points (or it's just a dot)
    if (this.currentStroke.points.length >= 1) {
      this.addAnnotation(this.currentStroke);
    }

    const stroke = this.currentStroke;
    this.currentStroke = null;
    return stroke;
  }

  getCurrentStroke(): PenStroke | null {
    return this.currentStroke;
  }

  // Text operations
  addText(frame: number, position: StrokePoint, text: string, size = 24, options?: Partial<TextAnnotation>): TextAnnotation {
    // When hold mode is enabled, annotations persist on all subsequent frames
    // duration: 0 = visible only on drawn frame, -1 = visible on all subsequent frames
    const defaultDuration = this.state.effects.hold ? -1 : 0;

    const annotation: TextAnnotation = {
      type: 'text',
      id: String(this.state.nextId++),
      frame,
      user: this._user,
      version: this._annotationVersion,
      position: { x: position.x, y: position.y },
      color: [...this._color],
      text,
      size,
      scale: 1,
      rotation: 0,
      spacing: 0,
      font: 'sans-serif',
      origin: TextOrigin.Center,
      startFrame: frame,
      duration: options?.duration ?? defaultDuration,
      // Apply optional styling
      bold: options?.bold,
      italic: options?.italic,
      underline: options?.underline,
      backgroundColor: options?.backgroundColor,
      calloutPoint: options?.calloutPoint,
      ...options,
    };

    this.addAnnotation(annotation);
    return annotation;
  }

  /**
   * Update text annotation properties
   */
  updateTextAnnotation(frame: number, id: string, updates: Partial<TextAnnotation>): boolean {
    const annotations = this.state.annotations.get(frame);
    if (!annotations) return false;

    const annotation = annotations.find(a => a.id === id && a.type === 'text') as TextAnnotation | undefined;
    if (!annotation) return false;

    // Apply updates
    if (updates.text !== undefined) annotation.text = updates.text;
    if (updates.size !== undefined) annotation.size = updates.size;
    if (updates.font !== undefined) annotation.font = updates.font;
    if (updates.bold !== undefined) annotation.bold = updates.bold;
    if (updates.italic !== undefined) annotation.italic = updates.italic;
    if (updates.underline !== undefined) annotation.underline = updates.underline;
    if (updates.backgroundColor !== undefined) annotation.backgroundColor = updates.backgroundColor;
    if (updates.calloutPoint !== undefined) annotation.calloutPoint = updates.calloutPoint;
    if (updates.color !== undefined) annotation.color = [...updates.color];
    if (updates.rotation !== undefined) annotation.rotation = updates.rotation;
    if (updates.scale !== undefined) annotation.scale = updates.scale;
    if (updates.origin !== undefined) annotation.origin = updates.origin;

    this.emit('annotationsChanged', frame);
    return true;
  }

  // Shape operations
  /**
   * Add a shape annotation
   */
  addShape(
    frame: number,
    shapeType: ShapeType,
    startPoint: Point,
    endPoint: Point,
    options?: Partial<ShapeAnnotation>
  ): ShapeAnnotation {
    // When hold mode is enabled, annotations persist on all subsequent frames
    // duration: 0 = visible only on drawn frame, -1 = visible on all subsequent frames
    const defaultDuration = this.state.effects.hold ? -1 : 0;

    const annotation: ShapeAnnotation = {
      type: 'shape',
      id: String(this.state.nextId++),
      frame,
      user: this._user,
      version: this._annotationVersion,
      shapeType,
      startPoint: { x: startPoint.x, y: startPoint.y },
      endPoint: { x: endPoint.x, y: endPoint.y },
      strokeColor: options?.strokeColor ?? [...this._color],
      strokeWidth: options?.strokeWidth ?? this._width,
      fillColor: options?.fillColor,
      rotation: options?.rotation ?? 0,
      cornerRadius: options?.cornerRadius,
      arrowheadSize: options?.arrowheadSize ?? 12,
      startFrame: frame,
      duration: options?.duration ?? defaultDuration,
    };

    this.addAnnotation(annotation);
    return annotation;
  }

  /**
   * Add a rectangle shape
   */
  addRectangle(
    frame: number,
    startPoint: Point,
    endPoint: Point,
    options?: Partial<ShapeAnnotation>
  ): ShapeAnnotation {
    return this.addShape(frame, ShapeType.Rectangle, startPoint, endPoint, options);
  }

  /**
   * Add an ellipse shape
   */
  addEllipse(
    frame: number,
    startPoint: Point,
    endPoint: Point,
    options?: Partial<ShapeAnnotation>
  ): ShapeAnnotation {
    return this.addShape(frame, ShapeType.Ellipse, startPoint, endPoint, options);
  }

  /**
   * Add a line shape
   */
  addLine(
    frame: number,
    startPoint: Point,
    endPoint: Point,
    options?: Partial<ShapeAnnotation>
  ): ShapeAnnotation {
    return this.addShape(frame, ShapeType.Line, startPoint, endPoint, options);
  }

  /**
   * Add an arrow shape
   */
  addArrow(
    frame: number,
    startPoint: Point,
    endPoint: Point,
    options?: Partial<ShapeAnnotation>
  ): ShapeAnnotation {
    return this.addShape(frame, ShapeType.Arrow, startPoint, endPoint, options);
  }

  /**
   * Add a polygon shape
   * @param frame - The frame number to add the polygon to
   * @param points - Array of polygon vertices (normalized 0-1 coordinates)
   * @param options - Optional styling and properties
   */
  addPolygon(
    frame: number,
    points: Array<{ x: number; y: number }>,
    options?: Partial<ShapeAnnotation>
  ): ShapeAnnotation {
    // Calculate bounding box from points for startPoint/endPoint
    if (points.length === 0) {
      throw new Error('Polygon requires at least one point');
    }

    let minX = points[0]!.x;
    let maxX = points[0]!.x;
    let minY = points[0]!.y;
    let maxY = points[0]!.y;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    // When hold mode is enabled, annotations persist on all subsequent frames
    // duration: 0 = visible only on drawn frame, -1 = visible on all subsequent frames
    const defaultDuration = this.state.effects.hold ? -1 : 0;

    const annotation: ShapeAnnotation = {
      type: 'shape',
      id: String(this.state.nextId++),
      frame,
      user: this._user,
      version: this._annotationVersion,
      shapeType: ShapeType.Polygon,
      startPoint: { x: minX, y: minY },
      endPoint: { x: maxX, y: maxY },
      strokeColor: options?.strokeColor ?? [...this._color],
      strokeWidth: options?.strokeWidth ?? this._width,
      fillColor: options?.fillColor,
      rotation: options?.rotation ?? 0,
      points: points.map(p => ({ x: p.x, y: p.y })),
      startFrame: frame,
      duration: options?.duration ?? defaultDuration,
    };

    this.addAnnotation(annotation);
    return annotation;
  }

  /**
   * Update shape annotation properties
   */
  updateShapeAnnotation(frame: number, id: string, updates: Partial<ShapeAnnotation>): boolean {
    const annotations = this.state.annotations.get(frame);
    if (!annotations) return false;

    const annotation = annotations.find(a => a.id === id && a.type === 'shape') as ShapeAnnotation | undefined;
    if (!annotation) return false;

    // Apply updates
    if (updates.startPoint !== undefined) annotation.startPoint = { ...updates.startPoint };
    if (updates.endPoint !== undefined) annotation.endPoint = { ...updates.endPoint };
    if (updates.strokeColor !== undefined) annotation.strokeColor = [...updates.strokeColor];
    if (updates.strokeWidth !== undefined) annotation.strokeWidth = updates.strokeWidth;
    if (updates.fillColor !== undefined) annotation.fillColor = updates.fillColor ? [...updates.fillColor] : undefined;
    if (updates.rotation !== undefined) annotation.rotation = updates.rotation;
    if (updates.cornerRadius !== undefined) annotation.cornerRadius = updates.cornerRadius;
    if (updates.arrowheadSize !== undefined) annotation.arrowheadSize = updates.arrowheadSize;
    if (updates.points !== undefined) annotation.points = updates.points.map(p => ({ x: p.x, y: p.y }));

    this.emit('annotationsChanged', frame);
    return true;
  }

  // Annotation management
  addAnnotation(annotation: Annotation): void {
    // Assign a new unique ID if none is provided (e.g., during merge import)
    if (!annotation.id) {
      annotation.id = String(this.state.nextId++);
    }
    const frame = annotation.frame;
    if (!this.state.annotations.has(frame)) {
      this.state.annotations.set(frame, []);
    }
    this.state.annotations.get(frame)!.push(annotation);

    // Save to undo stack
    this.undoStack.push([annotation]);
    this.redoStack = [];

    this.emit('strokeAdded', annotation);
    this.emit('annotationsChanged', frame);
  }

  removeAnnotation(id: string, frame: number): Annotation | null {
    const annotations = this.state.annotations.get(frame);
    if (!annotations) return null;

    const index = annotations.findIndex((a) => a.id === id);
    if (index === -1) return null;

    const [removed] = annotations.splice(index, 1);
    if (removed) {
      this.emit('strokeRemoved', removed);
      this.emit('annotationsChanged', frame);
    }
    return removed ?? null;
  }

  clearFrame(frame: number): Annotation[] {
    const annotations = this.state.annotations.get(frame);
    if (!annotations || annotations.length === 0) return [];

    const removed = [...annotations];
    this.state.annotations.set(frame, []);

    // Save to undo stack
    this.undoStack.push(removed);
    this.redoStack = [];

    this.emit('annotationsChanged', frame);
    return removed;
  }

  clearAll(): void {
    this.state.annotations.clear();
    this.state.nextId = 0;
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Get all frames that have annotations
   * Returns a Set of frame numbers
   */
  getAnnotatedFrames(): Set<number> {
    const frames = new Set<number>();
    for (const [frame, annotations] of this.state.annotations) {
      if (annotations.length > 0) {
        frames.add(frame);
      }
    }
    return frames;
  }

  /**
   * Check if a specific frame has any annotations
   */
  hasAnnotationsOnFrame(frame: number, versionFilter?: 'A' | 'B'): boolean {
    const annotations = this.state.annotations.get(frame);
    if (!annotations || annotations.length === 0) return false;
    if (!versionFilter) return true;
    return annotations.some(a => this.matchesVersionFilter(a, versionFilter));
  }

  // Get annotations for display
  getAnnotationsForFrame(frame: number, versionFilter?: 'A' | 'B'): Annotation[] {
    if (!this.state.show) return [];

    const result: Annotation[] = [];

    // Get annotations visible on this frame
    for (const [_annotationFrame, annotations] of this.state.annotations) {
      for (const annotation of annotations) {
        if (this.isAnnotationVisibleOnFrame(annotation, frame) &&
            this.matchesVersionFilter(annotation, versionFilter)) {
          result.push(annotation);
        }
      }
    }

    return result;
  }

  // Get annotations with ghost effect
  getAnnotationsWithGhost(frame: number, versionFilter?: 'A' | 'B'): Array<{ annotation: Annotation; opacity: number }> {
    if (!this.state.show) return [];

    const result: Array<{ annotation: Annotation; opacity: number }> = [];
    const { ghost, ghostBefore, ghostAfter, hold: _hold } = this.state.effects;

    for (const [annotationFrame, annotations] of this.state.annotations) {
      for (const annotation of annotations) {
        if (!this.matchesVersionFilter(annotation, versionFilter)) continue;

        // Check if annotation is visible on this frame (with hold)
        const isDirectlyVisible = this.isAnnotationVisibleOnFrame(annotation, frame);

        if (isDirectlyVisible) {
          result.push({ annotation, opacity: 1 });
        } else if (ghost) {
          // Check ghost range
          const frameDiff = frame - annotationFrame;
          if (frameDiff > 0 && frameDiff <= ghostBefore) {
            // Ghost from before (red-ish tint could be applied in renderer)
            const opacity = 1 - frameDiff / (ghostBefore + 1);
            result.push({ annotation, opacity: opacity * 0.5 });
          } else if (frameDiff < 0 && -frameDiff <= ghostAfter) {
            // Ghost from after (green-ish tint could be applied in renderer)
            const opacity = 1 - (-frameDiff) / (ghostAfter + 1);
            result.push({ annotation, opacity: opacity * 0.5 });
          }
        }
      }
    }

    return result;
  }

  /**
   * Check if an annotation matches the current version filter.
   * Annotations with version 'all' or no version are always visible.
   */
  private matchesVersionFilter(annotation: Annotation, versionFilter?: 'A' | 'B'): boolean {
    if (!versionFilter) return true;
    const v = annotation.version;
    return !v || v === 'all' || v === versionFilter;
  }

  private isAnnotationVisibleOnFrame(annotation: Annotation, frame: number): boolean {
    const { startFrame, duration } = annotation;

    // If no duration restriction, visible only on its own frame
    if (duration === 0) {
      return annotation.frame === frame;
    }

    // Visible from startFrame
    if (frame < startFrame && startFrame !== -1) {
      return false;
    }

    // Duration -1 means visible on all subsequent frames
    if (duration === -1) {
      return frame >= annotation.frame;
    }

    // Check duration
    return frame >= startFrame && frame < startFrame + duration;
  }

  // Undo/Redo
  undo(): boolean {
    const lastAction = this.undoStack.pop();
    if (!lastAction) return false;

    for (const annotation of lastAction) {
      const annotations = this.state.annotations.get(annotation.frame);
      if (annotations) {
        const index = annotations.findIndex((a) => a.id === annotation.id);
        if (index !== -1) {
          annotations.splice(index, 1);
        }
      }
      this.emit('annotationsChanged', annotation.frame);
    }

    this.redoStack.push(lastAction);
    return true;
  }

  redo(): boolean {
    const lastAction = this.redoStack.pop();
    if (!lastAction) return false;

    for (const annotation of lastAction) {
      if (!this.state.annotations.has(annotation.frame)) {
        this.state.annotations.set(annotation.frame, []);
      }
      this.state.annotations.get(annotation.frame)!.push(annotation);
      this.emit('annotationsChanged', annotation.frame);
    }

    this.undoStack.push(lastAction);
    return true;
  }

  // Serialization for GTO
  toJSON(): PaintSnapshot {
    const frames: Record<number, Annotation[]> = {};
    for (const [frame, annotations] of this.state.annotations) {
      frames[frame] = annotations;
    }
    return {
      nextId: this.state.nextId,
      show: this.state.show,
      frames,
      effects: this.state.effects,
    };
  }

  // Load from parsed GTO data
  loadFromAnnotations(annotations: Annotation[], effects?: Partial<PaintEffects>): void {
    this.clearAll();

    for (const annotation of annotations) {
      if (!this.state.annotations.has(annotation.frame)) {
        this.state.annotations.set(annotation.frame, []);
      }
      this.state.annotations.get(annotation.frame)!.push(annotation);

      // Update nextId to avoid collisions
      const id = parseInt(annotation.id, 10);
      if (!isNaN(id) && id >= this.state.nextId) {
        this.state.nextId = id + 1;
      }
    }

    if (effects) {
      this.state.effects = { ...this.state.effects, ...effects };
      this.emit('effectsChanged', this.state.effects);
    }
  }
}
