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

export enum ShapeType {
  Rectangle = 'rectangle',
  Ellipse = 'ellipse',
  Line = 'line',
  Arrow = 'arrow',
  Polygon = 'polygon',
}

// Re-export for backward compatibility
export { RV_PEN_WIDTH_SCALE, RV_TEXT_SIZE_SCALE } from '../config/UIConfig';

export interface Point {
  x: number; // Normalized 0-1 (0 = left)
  y: number; // Normalized 0-1 (0 = bottom, OpenGL convention)
}

export interface StrokePoint extends Point {
  pressure?: number; // 0-1, for variable width
}

/** Which A/B compare version an annotation belongs to. */
export type AnnotationVersion = 'A' | 'B' | 'all';

/** Which stereo eye an annotation applies to. */
export type AnnotationEye = 'left' | 'right' | 'both';

export interface PenStroke {
  type: 'pen';
  id: string;
  frame: number;
  user: string;
  version?: AnnotationVersion;
  eye?: AnnotationEye;
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
  version?: AnnotationVersion;
  eye?: AnnotationEye;
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
  // Enhanced text styling properties
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  backgroundColor?: [number, number, number, number]; // RGBA 0-1 for text background/highlight
  // Callout support - endpoint of leader line from text position
  calloutPoint?: Point;
}

export interface ShapeAnnotation {
  type: 'shape';
  id: string;
  frame: number;
  user: string;
  version?: AnnotationVersion;
  eye?: AnnotationEye;
  shapeType: ShapeType;
  // Bounding points (normalized 0-1)
  startPoint: Point; // First corner or start of line
  endPoint: Point;   // Opposite corner or end of line
  // Styling
  strokeColor: [number, number, number, number]; // RGBA 0-1
  strokeWidth: number;
  fillColor?: [number, number, number, number]; // RGBA 0-1, undefined = no fill
  // Transform
  rotation: number; // Degrees
  // Shape-specific options
  cornerRadius?: number; // For rounded rectangles (0-1, fraction of smaller dimension)
  arrowheadSize?: number; // For arrows, size of arrowhead
  points?: Point[]; // For polygons, array of vertices (normalized 0-1)
  // Visibility
  startFrame: number;
  duration: number;
}

export type Annotation = PenStroke | TextAnnotation | ShapeAnnotation;

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
export interface PaintSnapshot {
  nextId: number;
  show: boolean;
  frames: Record<number, Annotation[]>;
  effects: PaintEffects;
}

/** Controls which brush properties are modulated by pen pressure. */
export interface PressureMapping {
  /** Pressure modulates stroke width (default: true) */
  width: boolean;
  /** Pressure modulates opacity (default: false) */
  opacity: boolean;
  /** Pressure modulates color saturation (default: false) */
  saturation: boolean;
}

export const DEFAULT_PRESSURE_MAPPING: PressureMapping = {
  width: true,
  opacity: false,
  saturation: false,
};

/**
 * Adjust the saturation of an RGBA color.
 * @param color RGBA 0-1 array
 * @param factor Saturation multiplier (0 = grayscale, 1 = unchanged)
 * @returns New RGBA array with adjusted saturation
 */
export function adjustSaturation(
  color: [number, number, number, number],
  factor: number,
): [number, number, number, number] {
  const [r, g, b, a] = color;
  // Luminance-weighted desaturation (Rec. 709)
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [
    luma + (r - luma) * factor,
    luma + (g - luma) * factor,
    luma + (b - luma) * factor,
    a,
  ];
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
