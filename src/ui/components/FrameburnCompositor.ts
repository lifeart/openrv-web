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
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

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

const FONT_SIZES: Record<TimecodeOverlayState['fontSize'], number> = {
  small: 14,
  medium: 18,
  large: 24,
};

const FONT_FAMILY = "'SF Mono', 'Fira Code', 'Consolas', monospace";

function getAnchorPosition(
  position: OverlayPosition | FrameburnPosition,
  canvasWidth: number,
  canvasHeight: number,
  boxWidth: number,
  boxHeight: number
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
  radius: number
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
  options?: FrameburnTimecodeOptions | null
): void {
  if (!options?.enabled) return;

  const timecode = formatTimecode(frameToTimecode(
    options.frame,
    options.fps,
    options.startFrame ?? 0
  ));
  const frameCounter = `Frame ${options.frame} / ${options.totalFrames}`;

  const fontSize = FONT_SIZES[options.fontSize];
  const counterFontSize = Math.max(11, Math.round(fontSize * 0.75));
  const horizontalPadding = Math.max(10, Math.round(fontSize * 0.66));
  const verticalPadding = Math.max(8, Math.round(fontSize * 0.5));
  const lineGap = options.showFrameCounter ? Math.max(4, Math.round(fontSize * 0.22)) : 0;

  ctx.save();
  ctx.textBaseline = 'top';

  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  const timecodeWidth = ctx.measureText(timecode).width;

  let maxTextWidth = timecodeWidth;
  if (options.showFrameCounter) {
    ctx.font = `${counterFontSize}px ${FONT_FAMILY}`;
    maxTextWidth = Math.max(maxTextWidth, ctx.measureText(frameCounter).width);
  }

  const boxWidth = Math.ceil(maxTextWidth + horizontalPadding * 2);
  const boxHeight = Math.ceil(
    verticalPadding * 2 +
      fontSize +
      (options.showFrameCounter ? lineGap + counterFontSize : 0)
  );

  const { x, y } = getAnchorPosition(options.position, canvasWidth, canvasHeight, boxWidth, boxHeight);

  ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, options.backgroundOpacity))})`;
  drawRoundedRect(ctx, x, y, boxWidth, boxHeight, 4);

  ctx.fillStyle = '#ffffff';
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  ctx.fillText(timecode, x + horizontalPadding, y + verticalPadding);

  if (options.showFrameCounter) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = `${counterFontSize}px ${FONT_FAMILY}`;
    ctx.fillText(frameCounter, x + horizontalPadding, y + verticalPadding + fontSize + lineGap);
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

/**
 * Composite multi-field frameburn overlay onto an export canvas.
 */
export function compositeFrameburn(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  config: FrameburnConfig,
  context: FrameburnContext
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

