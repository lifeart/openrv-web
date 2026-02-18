import type { GTODTO } from 'gto-js';
import {
  Annotation,
  PenStroke,
  TextAnnotation,
  BrushType,
  LineJoin,
  LineCap,
  StrokeMode,
  TextOrigin,
  PaintEffects,
  RV_PEN_WIDTH_SCALE,
  RV_TEXT_SIZE_SCALE,
} from '../../paint/types';
import type { GTOComponentDTO, ParsedAnnotations, MatteSettings } from './Session';
import { Logger } from '../../utils/Logger';

const log = new Logger('AnnotationStore');

// ---- GTO value extraction helpers ----
// These are pure functions used by both AnnotationStore and Session for GTO parsing.

export function getNumberValue(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === 'number') {
      return first;
    }
    if (Array.isArray(first) && first.length > 0 && typeof first[0] === 'number') {
      return first[0];
    }
  }
  return undefined;
}

export function getBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === 'boolean') {
      return first;
    }
    if (typeof first === 'number') {
      return first !== 0;
    }
    if (typeof first === 'string') {
      const normalized = first.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return true;
      }
      if (normalized === 'false' || normalized === '0') {
        return false;
      }
    }
  }
  return undefined;
}

export function getNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const first = value[0];
  if (typeof first === 'number') {
    return value.filter((entry): entry is number => typeof entry === 'number');
  }
  if (Array.isArray(first)) {
    const numbers = first.filter((entry): entry is number => typeof entry === 'number');
    return numbers.length > 0 ? numbers : undefined;
  }
  return undefined;
}

export function getStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

/**
 * Extract a string array from a GTO property value.
 *
 * Handles raw string arrays (["R", "G", "B"]) or nested arrays ([["R", "G", "B"]]).
 * Returns undefined for empty, missing, or non-string-array values.
 */
export function getStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const first = value[0];
  if (typeof first === 'string') {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (Array.isArray(first)) {
    const strings = first.filter((entry): entry is string => typeof entry === 'string');
    return strings.length > 0 ? strings : undefined;
  }
  return undefined;
}

/**
 * Callback interface for AnnotationStore to notify Session of changes
 * without importing Session (avoids circular deps).
 */
export interface AnnotationStoreCallbacks {
  onAnnotationsLoaded(data: ParsedAnnotations): void;
  onPaintEffectsLoaded(effects: Partial<PaintEffects>): void;
  onMatteChanged(settings: MatteSettings): void;
}

/**
 * AnnotationStore owns annotation/paint/matte state and parsing:
 * - Paint effects (ghost, hold, ghostBefore, ghostAfter)
 * - Matte overlay settings
 * - GTO paint annotation parsing (pen strokes, text annotations, tag effects)
 *
 * State is owned by this store. Session delegates to it.
 */
export class AnnotationStore {
  private _matteSettings: MatteSettings | null = null;
  private _sessionPaintEffects: Partial<PaintEffects> | null = null;
  private _callbacks: AnnotationStoreCallbacks | null = null;

  /**
   * Set the callbacks object. Called once by Session after construction.
   */
  setCallbacks(callbacks: AnnotationStoreCallbacks): void {
    this._callbacks = callbacks;
  }

  // ---- Read-only accessors ----

  /** Matte overlay settings */
  get matteSettings(): MatteSettings | null {
    return this._matteSettings;
  }

  /** Paint effects from session (ghost, hold, etc.) */
  get sessionPaintEffects(): Partial<PaintEffects> | null {
    return this._sessionPaintEffects;
  }

  // ---- Mutation operations ----

  /**
   * Set paint effects (from GTO graph loading)
   */
  setPaintEffects(effects: Partial<PaintEffects>): void {
    this._sessionPaintEffects = effects;
    this._callbacks?.onPaintEffectsLoaded(this._sessionPaintEffects);
  }

  /**
   * Set matte settings (from GTO graph loading)
   */
  setMatteSettings(matte: {
    show?: boolean;
    aspect?: number;
    opacity?: number;
    heightVisible?: number;
    centerPoint?: [number, number];
  }): void {
    this._matteSettings = {
      show: matte.show ?? false,
      aspect: matte.aspect ?? 1.78,
      opacity: matte.opacity ?? 0.66,
      heightVisible: matte.heightVisible ?? -1,
      centerPoint: matte.centerPoint ?? [0, 0],
    };
    this._callbacks?.onMatteChanged(this._matteSettings);
  }

  // ---- GTO Paint Annotation Parsing ----

  /**
   * Parse paint annotations from GTO DTO with the given aspect ratio.
   * Emits 'annotationsLoaded' callback with parsed annotations and effects.
   */
  parsePaintAnnotations(dto: GTODTO, aspectRatio: number): void {
    const paintObjects = dto.byProtocol('RVPaint');
    log.debug('RVPaint objects:', paintObjects.length);

    if (paintObjects.length === 0) {
      return;
    }

    const annotations: Annotation[] = [];
    let effects: Partial<PaintEffects> | undefined;

    for (const paintObj of paintObjects) {
      log.debug('Paint object:', paintObj.name);

      // Get all components from this paint object using the components() method
      const allComponents = paintObj.components();
      if (!allComponents || allComponents.length === 0) continue;

      // Find frame components and stroke/text components
      const frameOrders = new Map<number, string[]>();
      const strokeData = new Map<string, GTOComponentDTO>();

      for (const comp of allComponents) {
        const compName = comp.name;

        if (compName.startsWith('frame:')) {
          // Parse frame order component like "frame:15"
          const frameNum = parseInt(compName.split(':')[1] ?? '1', 10);
          const orderProp = comp.property('order');
          if (orderProp?.exists()) {
            // Order can be a string or string array
            const orderValue = orderProp.value();
            const order = Array.isArray(orderValue) ? orderValue : [orderValue];
            frameOrders.set(frameNum, order as string[]);
          }
        } else if (compName.startsWith('pen:') || compName.startsWith('text:')) {
          // Store stroke/text data for later lookup
          strokeData.set(compName, comp);
        }
      }

      log.debug('Frame orders:', Object.fromEntries(frameOrders));
      log.debug('Stroke data keys:', Array.from(strokeData.keys()));

      // Parse strokes and text for each frame
      for (const [frame, order] of frameOrders) {
        for (const strokeId of order) {
          const comp = strokeData.get(strokeId);
          if (!comp) continue;

          if (strokeId.startsWith('pen:')) {
            const stroke = this.parsePenStroke(strokeId, frame, comp, aspectRatio);
            if (stroke) {
              annotations.push(stroke);
            }
          } else if (strokeId.startsWith('text:')) {
            const text = this.parseTextAnnotation(strokeId, frame, comp, aspectRatio);
            if (text) {
              annotations.push(text);
            }
          }
        }
      }

      // Parse effects/settings from paint component
      const paintComp = paintObj.component('paint');
      if (paintComp?.exists()) {
        const ghost = getBooleanValue(paintComp.property('ghost').value());
        const hold = getBooleanValue(paintComp.property('hold').value());
        const ghostBefore = getNumberValue(paintComp.property('ghostBefore').value());
        const ghostAfter = getNumberValue(paintComp.property('ghostAfter').value());

        const nextEffects: Partial<PaintEffects> = {
          ...(ghost !== undefined ? { ghost } : {}),
          ...(hold !== undefined ? { hold } : {}),
          ...(ghostBefore !== undefined ? { ghostBefore: Math.round(ghostBefore) } : {}),
          ...(ghostAfter !== undefined ? { ghostAfter: Math.round(ghostAfter) } : {}),
        };

        if (Object.keys(nextEffects).length > 0) {
          effects = { ...effects, ...nextEffects };
        }
      }

      const tagComp = paintObj.component('tag');
      if (tagComp?.exists()) {
        const annotateValue = getStringValue(tagComp.property('annotate').value());
        if (annotateValue) {
          const tagEffects = this.parsePaintTagEffects(annotateValue);
          if (tagEffects) {
            effects = { ...effects, ...tagEffects };
          }
        }
      }

      const annotationComp = paintObj.component('annotation');
      if (annotationComp?.exists()) {
        const ghost = getBooleanValue(annotationComp.property('ghost').value());
        const hold = getBooleanValue(annotationComp.property('hold').value());
        const ghostBefore = getNumberValue(annotationComp.property('ghostBefore').value());
        const ghostAfter = getNumberValue(annotationComp.property('ghostAfter').value());

        const nextEffects: Partial<PaintEffects> = {
          ...(ghost !== undefined ? { ghost } : {}),
          ...(hold !== undefined ? { hold } : {}),
          ...(ghostBefore !== undefined ? { ghostBefore: Math.round(ghostBefore) } : {}),
          ...(ghostAfter !== undefined ? { ghostAfter: Math.round(ghostAfter) } : {}),
        };

        if (Object.keys(nextEffects).length > 0) {
          effects = { ...effects, ...nextEffects };
        }
      }

    }

    log.debug('Total annotations parsed:', annotations.length);
    if (annotations.length > 0 || effects) {
      this._callbacks?.onAnnotationsLoaded({ annotations, effects });
    }
  }

  /**
   * Parse paint tag effects from a tag string value.
   * Supports JSON format and key:value/key=value string format.
   */
  parsePaintTagEffects(tagValue: string): Partial<PaintEffects> | null {
    const trimmed = tagValue.trim();
    if (!trimmed) return null;

    const result: Partial<PaintEffects> = {};
    const applyValue = (key: string, rawValue: unknown): void => {
      if (rawValue === undefined || rawValue === null) return;
      const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
      const booleanVal = getBooleanValue(value);
      const numberVal = getNumberValue(value) ??
        (typeof value === 'string' && value.length > 0 && !isNaN(Number(value))
          ? Number(value)
          : undefined);

      switch (key) {
        case 'ghost':
          if (booleanVal !== undefined) {
            result.ghost = booleanVal;
          }
          break;
        case 'hold':
          if (booleanVal !== undefined) {
            result.hold = booleanVal;
          }
          break;
        case 'ghostbefore':
          if (numberVal !== undefined) {
            result.ghostBefore = Math.round(numberVal);
          }
          break;
        case 'ghostafter':
          if (numberVal !== undefined) {
            result.ghostAfter = Math.round(numberVal);
          }
          break;
        default:
          break;
      }
    };

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown> | Array<Record<string, unknown>>;
        const target = Array.isArray(parsed) ? parsed[0] : parsed;
        if (target && typeof target === 'object') {
          Object.entries(target).forEach(([key, value]) => {
            const normalized = key.replace(/[^a-z]/gi, '').toLowerCase();
            applyValue(normalized, value);
          });
        }
      } catch (e) {
        // fall through to string parsing
        log.debug('JSON parse of paint tag failed, trying string parsing:', e);
      }
    }

    if (Object.keys(result).length === 0) {
      const normalizedText = trimmed.replace(/;/g, ' ').replace(/,/g, ' ');
      const pairRegex = /([a-zA-Z][a-zA-Z0-9_-]*)\s*[:=]\s*([^\s]+)/g;
      let match: RegExpExecArray | null = null;
      while ((match = pairRegex.exec(normalizedText)) !== null) {
        const key = match[1] ?? '';
        const value = match[2] ?? '';
        const normalized = key.replace(/[^a-z]/gi, '').toLowerCase();
        applyValue(normalized, value);
      }

      if (/\bghost\b/i.test(normalizedText) && result.ghost === undefined) {
        result.ghost = true;
      }
      if (/\bhold\b/i.test(normalizedText) && result.hold === undefined) {
        result.hold = true;
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  // Parse a single pen stroke from RV GTO format
  // strokeId format: "pen:ID:FRAME:USER" e.g., "pen:1:15:User"
  parsePenStroke(strokeId: string, frame: number, comp: GTOComponentDTO, aspectRatio: number): PenStroke | null {
    // Parse user from strokeId (e.g., "pen:1:15:User" -> "User")
    const parts = strokeId.split(':');
    const user = parts[3] ?? 'unknown';
    const id = parts[1] ?? '0';

    // Get properties from component using the ComponentDTO API
    const colorValue = comp.property('color').value();
    const widthValue = comp.property('width').value();
    const brushValue = comp.property('brush').value();
    const pointsValue = comp.property('points').value();
    const joinValue = comp.property('join').value();
    const capValue = comp.property('cap').value();
    const splatValue = comp.property('splat').value();

    // Parse color - stored as float[4] in GTO
    let color: [number, number, number, number] = [1, 0, 0, 1];
    if (colorValue && Array.isArray(colorValue) && colorValue.length >= 4) {
      color = [colorValue[0], colorValue[1], colorValue[2], colorValue[3]];
    }

    // Parse width - can be a single value or array (per-point width)
    let width = 3;
      if (widthValue) {
      if (Array.isArray(widthValue) && widthValue.length > 0) {
        // Use the first width value, convert from normalized to pixel
        width = (widthValue[0] as number) * RV_PEN_WIDTH_SCALE;
      } else if (typeof widthValue === 'number') {
        width = widthValue * RV_PEN_WIDTH_SCALE;
      }
    }


    // Parse brush type
    const brushType = brushValue === 'gaussian' ? BrushType.Gaussian : BrushType.Circle;

    // Parse points - stored as float[2] array (flat: [x1, y1, x2, y2, ...])
    // OpenRV coordinate system: X from -aspectRatio to +aspectRatio, Y from -0.5 to +0.5
    const points: Array<{ x: number; y: number; pressure?: number }> = [];
    if (pointsValue && Array.isArray(pointsValue)) {
      // Check if it's a nested array [[x,y], [x,y]] or flat [x, y, x, y]
      const isNested = pointsValue.length > 0 && Array.isArray(pointsValue[0]);

      if (isNested) {
        // Nested format: [[x,y], [x,y]]
        for (const point of pointsValue) {
          if (Array.isArray(point) && point.length >= 2) {
            const rawX = point[0] as number;
            const rawY = point[1] as number;
            points.push({
              x: rawX / aspectRatio + 0.5,
              y: rawY + 0.5,
            });
          }
        }
      } else {
        // Flat format: [x, y, x, y] - chunk into pairs
        for (let i = 0; i < pointsValue.length; i += 2) {
          if (i + 1 < pointsValue.length) {
            const rawX = pointsValue[i] as number;
            const rawY = pointsValue[i + 1] as number;
            points.push({
              x: rawX / aspectRatio + 0.5,
              y: rawY + 0.5,
            });
          }
        }
      }
    }

    if (points.length === 0) {
      log.warn('Stroke has no points:', strokeId);
      return null;
    }

    // Parse line join (0=miter, 1=round, 2=bevel - GTO uses different values)
    let join = LineJoin.Round;
    if (joinValue !== null && joinValue !== undefined) {
      const joinVal = joinValue as number;
      if (joinVal === 0) join = LineJoin.Miter;
      else if (joinVal === 2) join = LineJoin.Bevel;
      // 1 and 3 are round variants
    }

    // Parse line cap
    let cap = LineCap.Round;
    if (capValue !== null && capValue !== undefined) {
      const capVal = capValue as number;
      if (capVal === 0) cap = LineCap.NoCap;
      else if (capVal === 2) cap = LineCap.Square;
    }

    const stroke: PenStroke = {
      type: 'pen',
      id,
      frame,
      user,
      color,
      width,
      brush: brushType,
      points,
      join,
      cap,
      splat: splatValue === 1,
      mode: StrokeMode.Draw,
      startFrame: frame,
      duration: 0, // Only visible on this specific frame
    };

    return stroke;
  }

  // Parse a single text annotation from RV GTO format
  // textId format: "text:ID:FRAME:USER" e.g., "text:6:1:User"
  parseTextAnnotation(textId: string, frame: number, comp: GTOComponentDTO, aspectRatio: number): TextAnnotation | null {
    const parts = textId.split(':');
    const user = parts[3] ?? 'unknown';
    const id = parts[1] ?? '0';

    const positionValue = comp.property('position').value();
    const colorValue = comp.property('color').value();
    const textValue = comp.property('text').value();
    const sizeValue = comp.property('size').value();
    const scaleValue = comp.property('scale').value();
    const rotationValue = comp.property('rotation').value();
    const spacingValue = comp.property('spacing').value();
    const fontValue = comp.property('font').value();

    // Parse position
    // OpenRV coordinate system: X from -aspectRatio to +aspectRatio, Y from -0.5 to +0.5
    let x = 0.5, y = 0.5;
    if (positionValue && Array.isArray(positionValue)) {
      // Check if it's a double-wrapped array [[[x,y]]] or [[x,y]] or flat [x,y]
      let posData = positionValue;

      // Unwrap if nested
      while (posData.length > 0 && Array.isArray(posData[0]) && posData[0].length === 2) {
        posData = posData[0];
      }

      // Now posData should be [x, y]
      if (posData.length >= 2 && typeof posData[0] === 'number') {
        const rawX = posData[0] as number;
        const rawY = posData[1] as number;
        // OpenRV Coords are height-normalized (Y: -0.5 to 0.5)
        x = rawX / aspectRatio + 0.5;
        y = rawY + 0.5;
      }
    }

    // Parse color
    let color: [number, number, number, number] = [1, 1, 1, 1];
    if (colorValue && Array.isArray(colorValue) && colorValue.length >= 4) {
      color = [colorValue[0], colorValue[1], colorValue[2], colorValue[3]];
    }

    const text: TextAnnotation = {
      type: 'text',
      id,
      frame,
      user,
      position: { x, y },
      color,
      text: (textValue as string) ?? '',
      size: ((sizeValue as number) ?? 0.01) * RV_TEXT_SIZE_SCALE, // Scale up from normalized
      scale: (scaleValue as number) ?? 1,
      rotation: (rotationValue as number) ?? 0,
      spacing: (spacingValue as number) ?? 1,
      font: (fontValue as string) || 'sans-serif',
      origin: TextOrigin.BottomLeft,
      startFrame: frame,
      duration: 0, // Only visible on this specific frame
    };

    return text;
  }

  dispose(): void {
    this._callbacks = null;
  }
}
