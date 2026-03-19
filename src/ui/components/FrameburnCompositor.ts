import { frameToTimecode, formatTimecode } from './TimecodeDisplay';
import type { OverlayPosition, TimecodeOverlayState } from './TimecodeOverlay';

export interface FrameburnTimecodeOptions extends TimecodeOverlayState {
  frame: number;
  totalFrames: number;
  fps: number;
  startFrame?: number;
}

/** Extended field-based frameburn config */
export type FrameburnPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface FrameburnField {
  type: 'timecode' | 'frame' | 'shotName' | 'date' | 'custom' | 'resolution' | 'fps' | 'colorspace' | 'codec';
  label?: string;
  value?: string;
}

export interface FrameburnConfig {
  enabled: boolean;
  fields: FrameburnField[];
  font?: string;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  backgroundPadding?: number;
  position?: FrameburnPosition;
}

export interface FrameburnContext {
  currentFrame: number;
  totalFrames: number;
  fps: number;
  shotName: string;
  width: number;
  height: number;
  colorSpace?: string;
  codec?: string;
  date?: string;
}

const VALID_FRAMEBURN_POSITIONS: ReadonlySet<FrameburnPosition> = new Set([
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]);

const VALID_FRAMEBURN_FIELD_TYPES: ReadonlySet<FrameburnField['type']> = new Set([
  'timecode',
  'frame',
  'shotName',
  'date',
  'custom',
  'resolution',
  'fps',
  'colorspace',
  'codec',
]);

const FONT_SIZES: Record<TimecodeOverlayState['fontSize'], number> = {
  small: 14,
  medium: 18,
  large: 24,
};

const FONT_FAMILY = "'SF Mono', 'Fira Code', 'Consolas', monospace";

export const DEFAULT_FRAMEBURN_CONFIG: FrameburnConfig = {
  enabled: false,
  fields: [{ type: 'timecode' }],
  font: FONT_FAMILY,
  fontSize: 16,
  fontColor: '#ffffff',
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  backgroundPadding: 8,
  position: 'bottom-left',
};

function getAnchorPosition(
  position: OverlayPosition | FrameburnPosition,
  canvasWidth: number,
  canvasHeight: number,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number } {
  const margin = 16;
  switch (position) {
    case 'top-center':
      return { x: Math.round((canvasWidth - boxWidth) / 2), y: margin };
    case 'top-right':
      return { x: canvasWidth - boxWidth - margin, y: margin };
    case 'bottom-left':
      return { x: margin, y: canvasHeight - boxHeight - margin };
    case 'bottom-center':
      return { x: Math.round((canvasWidth - boxWidth) / 2), y: canvasHeight - boxHeight - margin };
    case 'bottom-right':
      return { x: canvasWidth - boxWidth - margin, y: canvasHeight - boxHeight - margin };
    case 'top-left':
    default:
      return { x: margin, y: margin };
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
    return;
  }

  // Fallback for environments without roundRect support.
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
  ctx.fill();
}

/**
 * Composite a timecode frameburn overlay directly into an export canvas.
 * Drawn last so it appears above image content and annotations.
 */
export function compositeTimecodeFrameburn(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  options?: FrameburnTimecodeOptions | null,
): void {
  if (!options?.enabled) return;

  // Resolve display format with backward compat for showFrameCounter
  const displayFormat = options.displayFormat ?? (options.showFrameCounter ? 'both' : 'smpte');
  const showTimecode = displayFormat === 'smpte' || displayFormat === 'both';
  const showFrame = displayFormat === 'frame' || displayFormat === 'both';

  const timecode = formatTimecode(frameToTimecode(options.frame, options.fps, options.startFrame ?? 0));
  const frameCounter = `Frame ${options.frame} / ${options.totalFrames}`;

  const fontSize = FONT_SIZES[options.fontSize];
  const counterFontSize = Math.max(11, Math.round(fontSize * 0.75));
  const horizontalPadding = Math.max(10, Math.round(fontSize * 0.66));
  const verticalPadding = Math.max(8, Math.round(fontSize * 0.5));
  const showBothLines = showTimecode && showFrame;
  const lineGap = showBothLines ? Math.max(4, Math.round(fontSize * 0.22)) : 0;

  ctx.save();
  ctx.textBaseline = 'top';

  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  const timecodeWidth = showTimecode ? ctx.measureText(timecode).width : 0;

  let maxTextWidth = timecodeWidth;
  if (showFrame) {
    ctx.font = `${counterFontSize}px ${FONT_FAMILY}`;
    maxTextWidth = Math.max(maxTextWidth, ctx.measureText(frameCounter).width);
  }

  const primaryLineHeight = showTimecode ? fontSize : counterFontSize;
  const boxWidth = Math.ceil(maxTextWidth + horizontalPadding * 2);
  const boxHeight = Math.ceil(
    verticalPadding * 2 + primaryLineHeight + (showBothLines ? lineGap + counterFontSize : 0),
  );

  const { x, y } = getAnchorPosition(options.position, canvasWidth, canvasHeight, boxWidth, boxHeight);

  ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, options.backgroundOpacity))})`;
  drawRoundedRect(ctx, x, y, boxWidth, boxHeight, 4);

  let currentY = y + verticalPadding;

  if (showTimecode) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    ctx.fillText(timecode, x + horizontalPadding, currentY);
    currentY += fontSize + lineGap;
  }

  if (showFrame) {
    ctx.fillStyle = showTimecode ? 'rgba(255, 255, 255, 0.75)' : '#ffffff';
    ctx.font = `${counterFontSize}px ${FONT_FAMILY}`;
    ctx.fillText(frameCounter, x + horizontalPadding, currentY);
  }

  ctx.restore();
}

/**
 * Build display text lines from frameburn config fields and context.
 */
export function buildTextLines(fields: FrameburnField[], context: FrameburnContext): string[] {
  const lines: string[] = [];
  for (const field of fields) {
    let text: string;
    switch (field.type) {
      case 'timecode': {
        const tc = frameToTimecode(context.currentFrame, context.fps, 0);
        text = formatTimecode(tc);
        break;
      }
      case 'frame':
        text = `${context.currentFrame} / ${context.totalFrames}`;
        break;
      case 'shotName':
        text = context.shotName;
        break;
      case 'date':
        text = context.date ?? new Date().toISOString().split('T')[0]!;
        break;
      case 'resolution':
        text = `${context.width}x${context.height}`;
        break;
      case 'fps':
        text = `${context.fps} fps`;
        break;
      case 'colorspace':
        text = context.colorSpace ?? '';
        break;
      case 'codec':
        text = context.codec ?? '';
        break;
      case 'custom':
        text = field.value ?? '';
        break;
      default:
        continue;
    }
    if (!text) continue;
    const prefix = field.label ? `${field.label}: ` : '';
    lines.push(prefix + text);
  }
  return lines;
}

export function sanitizeFrameburnConfig(value: unknown): FrameburnConfig | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const config: FrameburnConfig = { ...DEFAULT_FRAMEBURN_CONFIG, fields: [] };

  if (typeof record.enabled === 'boolean') {
    config.enabled = record.enabled;
  }
  if (typeof record.font === 'string' && record.font.trim()) {
    config.font = record.font;
  }
  if (typeof record.fontSize === 'number' && Number.isFinite(record.fontSize)) {
    config.fontSize = Math.max(8, Math.min(72, Math.round(record.fontSize)));
  }
  if (typeof record.fontColor === 'string' && record.fontColor.trim()) {
    config.fontColor = record.fontColor;
  }
  if (typeof record.backgroundColor === 'string' && record.backgroundColor.trim()) {
    config.backgroundColor = record.backgroundColor;
  }
  if (typeof record.backgroundPadding === 'number' && Number.isFinite(record.backgroundPadding)) {
    config.backgroundPadding = Math.max(0, Math.min(64, Math.round(record.backgroundPadding)));
  }
  if (typeof record.position === 'string' && VALID_FRAMEBURN_POSITIONS.has(record.position as FrameburnPosition)) {
    config.position = record.position as FrameburnPosition;
  }

  if (Array.isArray(record.fields)) {
    config.fields = record.fields.flatMap((field): FrameburnField[] => {
      if (typeof field !== 'object' || field === null || Array.isArray(field)) {
        return [];
      }
      const raw = field as Record<string, unknown>;
      if (typeof raw.type !== 'string' || !VALID_FRAMEBURN_FIELD_TYPES.has(raw.type as FrameburnField['type'])) {
        return [];
      }
      const sanitized: FrameburnField = { type: raw.type as FrameburnField['type'] };
      if (typeof raw.label === 'string' && raw.label.trim()) {
        sanitized.label = raw.label;
      }
      if (typeof raw.value === 'string' && raw.value.trim()) {
        sanitized.value = raw.value;
      }
      return [sanitized];
    });
  }

  return config;
}

/**
 * Composite multi-field frameburn overlay onto an export canvas.
 */
export function compositeFrameburn(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  config: FrameburnConfig,
  context: FrameburnContext,
): void {
  if (!config.enabled || config.fields.length === 0) return;

  const lines = buildTextLines(config.fields, context);
  if (lines.length === 0) return;

  const fontSize = config.fontSize ?? 16;
  const fontFamily = config.font ?? 'monospace';
  const fontColor = config.fontColor ?? '#ffffff';
  const bgColor = config.backgroundColor ?? 'rgba(0, 0, 0, 0.6)';
  const padding = config.backgroundPadding ?? 8;
  const position = config.position ?? 'bottom-left';
  const lineHeight = Math.round(fontSize * 1.4);

  ctx.save();
  ctx.textBaseline = 'top';
  ctx.font = `${fontSize}px ${fontFamily}`;

  // Measure all lines to find max width
  let maxWidth = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxWidth) maxWidth = w;
  }

  const boxWidth = Math.ceil(maxWidth + padding * 2);
  const boxHeight = Math.ceil(padding * 2 + lines.length * lineHeight);

  const { x, y } = getAnchorPosition(position, canvasWidth, canvasHeight, boxWidth, boxHeight);

  // Background
  ctx.fillStyle = bgColor;
  drawRoundedRect(ctx, x, y, boxWidth, boxHeight, 4);

  // Text lines
  ctx.fillStyle = fontColor;
  ctx.font = `${fontSize}px ${fontFamily}`;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, x + padding, y + padding + i * lineHeight);
  }

  ctx.restore();
}
