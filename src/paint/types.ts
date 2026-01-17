// Paint system types matching OpenRV's RVPaint protocol

export enum BrushType {
  Gaussian = 0, // Soft edges, anti-aliased
  Circle = 1,   // Hard edges, sharp
}

export enum LineJoin {
  NoJoin = 0,
  Bevel = 1,
  Miter = 2,
  Round = 3,
}

export enum LineCap {
  NoCap = 0,
  Square = 1,
  Round = 2,
}

export enum StrokeMode {
  Draw = 0,
  Erase = 1,
}

export enum TextOrigin {
  TopLeft = 0,
  TopCenter = 1,
  TopRight = 2,
  CenterLeft = 3,
  Center = 4,
  CenterRight = 5,
  BottomLeft = 6,
  BottomCenter = 7,
  BottomRight = 8,
}

export const RV_PEN_WIDTH_SCALE = 500;
export const RV_TEXT_SIZE_SCALE = 2000;

export interface Point {
  x: number; // Normalized 0-1 (0 = left)
  y: number; // Normalized 0-1 (0 = bottom, OpenGL convention)
}

export interface StrokePoint extends Point {
  pressure?: number; // 0-1, for variable width
}

export interface PenStroke {
  type: 'pen';
  id: string;
  frame: number;
  user: string;
  color: [number, number, number, number]; // RGBA 0-1
  width: number | number[]; // Single or per-point widths
  brush: BrushType;
  points: StrokePoint[];
  join: LineJoin;
  cap: LineCap;
  splat: boolean;
  mode: StrokeMode;
  startFrame: number; // -1 = from current frame
  duration: number;   // -1 = all subsequent frames
}

export interface TextAnnotation {
  type: 'text';
  id: string;
  frame: number;
  user: string;
  position: Point;
  color: [number, number, number, number];
  text: string;
  size: number;
  scale: number;
  rotation: number;
  spacing: number;
  font: string;
  origin: TextOrigin;
  startFrame: number;
  duration: number;
}

export type Annotation = PenStroke | TextAnnotation;

export interface PaintEffects {
  hold: boolean;
  ghost: boolean;
  ghostBefore: number;
  ghostAfter: number;
}

export interface PaintState {
  nextId: number;
  show: boolean;
  annotations: Map<number, Annotation[]>; // frame -> annotations
  effects: PaintEffects;
}

// Default values
export const DEFAULT_STROKE_COLOR: [number, number, number, number] = [1, 0.3, 0.3, 1]; // Red
export const DEFAULT_STROKE_WIDTH = 3;
export const DEFAULT_BRUSH_TYPE = BrushType.Circle;
export const DEFAULT_TEXT_SIZE = 24;
export const DEFAULT_TEXT_FONT = 'sans-serif';

export const DEFAULT_PAINT_EFFECTS: PaintEffects = {
  hold: false,
  ghost: false,
  ghostBefore: 3,
  ghostAfter: 3,
};
