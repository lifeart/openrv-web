import { GTOBuilder } from 'gto-js';
import type { ObjectData } from 'gto-js';
import type { Session } from '../Session';
import type { PaintEngine } from '../../../paint/PaintEngine';
import type { Annotation, PaintEffects, PenStroke, TextAnnotation } from '../../../paint/types';
import { BrushType, LineCap, LineJoin, RV_PEN_WIDTH_SCALE, RV_TEXT_SIZE_SCALE } from '../../../paint/types';

interface PaintSnapshot {
  nextId: number;
  show: boolean;
  frames: Record<number, Annotation[]>;
  effects: PaintEffects;
}

/**
 * Paint settings for RVPaint
 */
export interface PaintSettings {
  /** Node is active */
  active?: boolean;
  /** Show paint on frame */
  show?: boolean;
  /** Next stroke ID */
  nextId?: number;
  /** Frames to exclude from paint display */
  exclude?: number[];
  /** Frames to include for paint display */
  include?: number[];
}

/**
 * Rectangle overlay element for RVOverlay
 */
export interface OverlayRect {
  /** Unique ID for the rectangle */
  id: number;
  /** Rectangle width (normalized 0-1) */
  width?: number;
  /** Rectangle height (normalized 0-1) */
  height?: number;
  /** RGBA color [r, g, b, a] */
  color?: [number, number, number, number];
  /** Position [x, y] (normalized 0-1) */
  position?: [number, number];
  /** Eye assignment (0=both, 1=left, 2=right) */
  eye?: number;
  /** Whether this rectangle is active */
  active?: boolean;
}

/**
 * Text overlay element for RVOverlay
 */
export interface OverlayText {
  /** Unique ID for the text */
  id: number;
  /** Position [x, y] (normalized 0-1) */
  position?: [number, number];
  /** RGBA color [r, g, b, a] */
  color?: [number, number, number, number];
  /** Font size */
  size?: number;
  /** Text scale */
  scale?: number;
  /** Rotation angle in degrees */
  rotation?: number;
  /** Character spacing */
  spacing?: number;
  /** Font name */
  font?: string;
  /** Text content */
  text?: string;
  /** Anchor point origin */
  origin?: string;
  /** Debug mode */
  debug?: boolean;
  /** Eye assignment (0=both, 1=left, 2=right) */
  eye?: number;
  /** Whether this text is active */
  active?: boolean;
  /** Pixel scaling factor */
  pixelScale?: number;
  /** First frame to display */
  firstFrame?: number;
}

/**
 * Window overlay element for RVOverlay
 */
export interface OverlayWindow {
  /** Unique ID for the window */
  id: number;
  /** Eye assignment (0=both, 1=left, 2=right) */
  eye?: number;
  /** Window is active */
  windowActive?: boolean;
  /** Outline is active */
  outlineActive?: boolean;
  /** Outline width */
  outlineWidth?: number;
  /** Outline RGBA color */
  outlineColor?: [number, number, number, number];
  /** Brush style */
  outlineBrush?: string;
  /** Window fill RGBA color */
  windowColor?: [number, number, number, number];
  /** Image aspect ratio */
  imageAspect?: number;
  /** Pixel scaling factor */
  pixelScale?: number;
  /** First frame to display */
  firstFrame?: number;
  /** Upper-left corner [x, y] */
  upperLeft?: [number, number];
  /** Upper-right corner [x, y] */
  upperRight?: [number, number];
  /** Lower-left corner [x, y] */
  lowerLeft?: [number, number];
  /** Lower-right corner [x, y] */
  lowerRight?: [number, number];
  /** Enable antialiasing */
  antialias?: boolean;
}

/**
 * RVOverlay settings for text, rectangle, and window overlays
 */
export interface OverlaySettings {
  /** Show overlays */
  show?: boolean;
  /** Rectangle overlays */
  rectangles?: OverlayRect[];
  /** Text overlays */
  texts?: OverlayText[];
  /** Window overlays */
  windows?: OverlayWindow[];
  /** Matte settings */
  matte?: {
    /** Show matte */
    show?: boolean;
    /** Matte opacity (0-1) */
    opacity?: number;
    /** Matte aspect ratio */
    aspect?: number;
    /** Visible height fraction */
    heightVisible?: number;
    /** Matte center [x, y] (normalized 0-1) */
    centerPoint?: [number, number];
  };
}

/**
 * RVChannelMap settings for channel remapping
 */
export interface ChannelMapSettings {
  /** Channel name mapping (e.g., ['R', 'G', 'B', 'A']) */
  channels?: string[];
}

/**
 * Paint/annotation serialization functions for GTO export.
 * Handles building paint nodes, overlay objects, channel maps,
 * and the main annotations paint object with pen/text strokes.
 */
export const PaintSerializer = {
  /**
   * Build a basic RVPaint node object (without stroke data)
   * For creating standalone paint nodes with frame filters
   */
  buildPaintNodeObject(name: string, settings: PaintSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVPaint', 1);

    // Node component (active state)
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .end();

    // Paint component (frame filters)
    const paintComp = obj.component('paint');
    paintComp
      .int('show', settings.show !== false ? 1 : 0)
      .int('nextId', settings.nextId ?? 0);

    // Add exclude frames if provided
    if (settings.exclude && settings.exclude.length > 0) {
      paintComp.int('exclude', settings.exclude);
    }

    // Add include frames if provided
    if (settings.include && settings.include.length > 0) {
      paintComp.int('include', settings.include);
    }

    paintComp.end();
    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVOverlay object for text, rectangle, and window overlays
   */
  buildOverlayObject(name: string, settings: OverlaySettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const overlayObject = builder.object(name, 'RVOverlay', 1);

    // Calculate next IDs based on provided elements
    const nextRectId = settings.rectangles?.length ?? 0;
    const nextTextId = settings.texts?.length ?? 0;

    // Overlay component (metadata)
    overlayObject
      .component('overlay')
      .int('nextRectId', nextRectId)
      .int('nextTextId', nextTextId)
      .int('show', settings.show !== false ? 1 : 0)
      .end();

    // Matte component (if provided)
    if (settings.matte) {
      const matte = settings.matte;
      overlayObject
        .component('matte')
        .int('show', matte.show ? 1 : 0)
        .float('opacity', matte.opacity ?? 1.0)
        .float('aspect', matte.aspect ?? 1.78)
        .float('heightVisible', matte.heightVisible ?? 1.0)
        .float2('centerPoint', [matte.centerPoint ?? [0.5, 0.5]])
        .end();
    }

    // Rectangle overlays
    if (settings.rectangles) {
      for (const rect of settings.rectangles) {
        overlayObject
          .component(`rect:${rect.id}`)
          .float('width', rect.width ?? 0.1)
          .float('height', rect.height ?? 0.1)
          .float4('color', [rect.color ?? [1, 1, 1, 1]])
          .float2('position', [rect.position ?? [0.5, 0.5]])
          .int('eye', rect.eye ?? 0)
          .int('active', rect.active !== false ? 1 : 0)
          .end();
      }
    }

    // Text overlays
    if (settings.texts) {
      for (const text of settings.texts) {
        const textComp = overlayObject.component(`text:${text.id}`);
        textComp
          .float2('position', [text.position ?? [0.5, 0.5]])
          .float4('color', [text.color ?? [1, 1, 1, 1]])
          .float('size', text.size ?? 24)
          .float('scale', text.scale ?? 1.0)
          .float('rotation', text.rotation ?? 0)
          .float('spacing', text.spacing ?? 0)
          .string('font', text.font ?? '')
          .string('text', text.text ?? '')
          .string('origin', text.origin ?? 'top-left')
          .int('debug', text.debug ? 1 : 0)
          .int('eye', text.eye ?? 0)
          .int('active', text.active !== false ? 1 : 0)
          .float('pixelScale', text.pixelScale ?? 1.0)
          .int('firstFrame', text.firstFrame ?? 1);
        textComp.end();
      }
    }

    // Window overlays
    if (settings.windows) {
      for (const win of settings.windows) {
        const winComp = overlayObject.component(`window:${win.id}`);
        winComp
          .int('eye', win.eye ?? 0)
          .int('windowActive', win.windowActive ? 1 : 0)
          .int('outlineActive', win.outlineActive ? 1 : 0)
          .float('outlineWidth', win.outlineWidth ?? 1.0)
          .float4('outlineColor', [win.outlineColor ?? [1, 1, 1, 1]])
          .string('outlineBrush', win.outlineBrush ?? 'solid')
          .float4('windowColor', [win.windowColor ?? [0, 0, 0, 0.5]])
          .float('imageAspect', win.imageAspect ?? 1.0)
          .float('pixelScale', win.pixelScale ?? 1.0)
          .int('firstFrame', win.firstFrame ?? 1)
          .float('windowULx', win.upperLeft?.[0] ?? 0)
          .float('windowULy', win.upperLeft?.[1] ?? 0)
          .float('windowURx', win.upperRight?.[0] ?? 1)
          .float('windowURy', win.upperRight?.[1] ?? 0)
          .float('windowLLx', win.lowerLeft?.[0] ?? 0)
          .float('windowLLy', win.lowerLeft?.[1] ?? 1)
          .float('windowLRx', win.lowerRight?.[0] ?? 1)
          .float('windowLRy', win.lowerRight?.[1] ?? 1)
          .int('antialias', win.antialias !== false ? 1 : 0);
        winComp.end();
      }
    }

    overlayObject.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVChannelMap object for channel remapping
   */
  buildChannelMapObject(name: string, settings: ChannelMapSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const channelMapObject = builder.object(name, 'RVChannelMap', 1);

    // Format component (channel mapping)
    if (settings.channels && settings.channels.length > 0) {
      channelMapObject
        .component('format')
        .string('channels', settings.channels)
        .end();
    }

    channelMapObject.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build the full paint/annotations object with stroke data
   */
  buildPaintObject(session: Session, paintEngine: PaintEngine, name: string): ObjectData {
    const builder = new GTOBuilder();
    const aspectRatio = getAspectRatio(session);
    const paintJSON = paintEngine.toJSON() as PaintSnapshot;

    const paintObject = builder.object(name, 'RVPaint', 3);
    paintObject
      .component('paint')
      .int('nextId', paintJSON.nextId)
      .int('nextAnnotationId', 0)
      .int('show', paintJSON.show ? 1 : 0)
      .int('ghost', paintJSON.effects.ghost ? 1 : 0)
      .int('hold', paintJSON.effects.hold ? 1 : 0)
      .int('ghostBefore', paintJSON.effects.ghostBefore)
      .int('ghostAfter', paintJSON.effects.ghostAfter)
      .string('exclude', [])
      .string('include', [])
      .end();

    const frameOrder = new Map<number, string[]>();
    const frames = Object.entries(paintJSON.frames).sort(([a], [b]) => Number(a) - Number(b));

    for (const [frameKey, annotations] of frames) {
      const frame = Number(frameKey);
      for (const annotation of annotations) {
        const componentName = annotationComponentName(annotation, frame);
        if (!frameOrder.has(frame)) {
          frameOrder.set(frame, []);
        }
        frameOrder.get(frame)!.push(componentName);

        if (annotation.type === 'pen') {
          writePenComponent(paintObject, componentName, annotation, aspectRatio);
        } else {
          writeTextComponent(paintObject, componentName, annotation as TextAnnotation, aspectRatio);
        }
      }
    }

    for (const [frame, order] of frameOrder) {
      paintObject
        .component(`frame:${frame}`)
        .string('order', order)
        .end();
    }

    paintObject.end();

    return builder.build().objects[0]!;
  },
};

function getAspectRatio(session: Session): number {
  const source = session.allSources[0];
  if (!source || source.height === 0) {
    return 1;
  }
  return source.width / source.height;
}

function annotationComponentName(annotation: Annotation, frame: number): string {
  const user = annotation.user?.replace(/:/g, '_') || 'user';
  const prefix = annotation.type === 'pen' ? 'pen' : 'text';
  return `${prefix}:${annotation.id}:${frame}:${user}`;
}

function writePenComponent(
  paintObject: ReturnType<GTOBuilder['object']>,
  componentName: string,
  annotation: PenStroke,
  aspectRatio: number
): void {
  const points = annotation.points.map((point) => [
    (point.x - 0.5) * aspectRatio,
    point.y - 0.5,
  ]);

  const widths = Array.isArray(annotation.width)
    ? annotation.width
    : [annotation.width];
  const normalizedWidths = widths.map((value) => value / RV_PEN_WIDTH_SCALE);

  paintObject
    .component(componentName)
    .float4('color', [annotation.color])
    .float('width', normalizedWidths)
    .string('brush', annotation.brush === BrushType.Gaussian ? 'gaussian' : 'circle')
    .float2('points', points)
    .int('join', mapLineJoin(annotation.join))
    .int('cap', mapLineCap(annotation.cap))
    .int('splat', annotation.splat ? 1 : 0)
    .end();
}

function writeTextComponent(
  paintObject: ReturnType<GTOBuilder['object']>,
  componentName: string,
  annotation: TextAnnotation,
  aspectRatio: number
): void {
  const position: [number, number] = [
    (annotation.position.x - 0.5) * aspectRatio,
    annotation.position.y - 0.5,
  ];

  paintObject
    .component(componentName)
    .float2('position', [position])
    .float4('color', [annotation.color])
    .string('text', annotation.text)
    .float('size', annotation.size / RV_TEXT_SIZE_SCALE)
    .float('scale', annotation.scale)
    .float('rotation', annotation.rotation)
    .float('spacing', annotation.spacing)
    .string('font', annotation.font)
    .end();
}

function mapLineJoin(join: LineJoin): number {
  switch (join) {
    case LineJoin.Miter:
      return 0;
    case LineJoin.Bevel:
      return 2;
    default:
      return 3;
  }
}

function mapLineCap(cap: LineCap): number {
  switch (cap) {
    case LineCap.NoCap:
      return 0;
    case LineCap.Square:
      return 2;
    default:
      return 1;
  }
}
