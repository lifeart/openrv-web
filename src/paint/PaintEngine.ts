import { EventEmitter, EventMap } from '../utils/EventEmitter';
import {
  Annotation,
  PenStroke,
  TextAnnotation,
  PaintState,
  PaintEffects,
  StrokePoint,
  BrushType,
  LineJoin,
  LineCap,
  StrokeMode,
  TextOrigin,
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_BRUSH_TYPE,
  DEFAULT_PAINT_EFFECTS,
} from './types';

export interface PaintEngineEvents extends EventMap {
  strokeAdded: Annotation;
  strokeRemoved: Annotation;
  annotationsChanged: number; // frame number
  effectsChanged: PaintEffects;
  toolChanged: PaintTool;
}

export type PaintTool = 'pen' | 'text' | 'eraser' | 'select' | 'none';

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
    this._brush = value;
  }

  get user(): string {
    return this._user;
  }

  set user(value: string) {
    this._user = value;
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

    this.currentStroke = {
      type: 'pen',
      id: String(this.state.nextId++),
      frame,
      user: this._user,
      color: [...this._color],
      width: this._width,
      brush: this._brush,
      points: [point],
      join: LineJoin.Round,
      cap: LineCap.Round,
      splat: this._brush === BrushType.Gaussian,
      mode: this._tool === 'eraser' ? StrokeMode.Erase : StrokeMode.Draw,
      startFrame: frame,
      duration: 0, // Visible only on the frame it was drawn
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
  addText(frame: number, position: StrokePoint, text: string, size = 24): TextAnnotation {
    const annotation: TextAnnotation = {
      type: 'text',
      id: String(this.state.nextId++),
      frame,
      user: this._user,
      position: { x: position.x, y: position.y },
      color: [...this._color],
      text,
      size,
      scale: 1,
      rotation: 0,
      spacing: 1,
      font: 'sans-serif',
      origin: TextOrigin.BottomLeft,
      startFrame: frame,
      duration: 0, // Visible only on the frame it was added
    };

    this.addAnnotation(annotation);
    return annotation;
  }

  // Annotation management
  addAnnotation(annotation: Annotation): void {
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

  // Get annotations for display
  getAnnotationsForFrame(frame: number): Annotation[] {
    if (!this.state.show) return [];

    const result: Annotation[] = [];

    // Get annotations visible on this frame
    for (const [_annotationFrame, annotations] of this.state.annotations) {
      for (const annotation of annotations) {
        if (this.isAnnotationVisibleOnFrame(annotation, frame)) {
          result.push(annotation);
        }
      }
    }

    return result;
  }

  // Get annotations with ghost effect
  getAnnotationsWithGhost(frame: number): Array<{ annotation: Annotation; opacity: number }> {
    if (!this.state.show) return [];

    const result: Array<{ annotation: Annotation; opacity: number }> = [];
    const { ghost, ghostBefore, ghostAfter, hold: _hold } = this.state.effects;

    for (const [annotationFrame, annotations] of this.state.annotations) {
      for (const annotation of annotations) {
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

  // Get all frames that have annotations
  getAnnotatedFrames(): number[] {
    return Array.from(this.state.annotations.keys()).sort((a, b) => a - b);
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
  toJSON(): object {
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
    }
  }
}
