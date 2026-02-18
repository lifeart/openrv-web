/**
 * Slate/Leader Renderer
 *
 * Generates slate frames for prepending to video exports.
 * A slate shows production metadata: show/project name, shot name,
 * version, artist, date, timecode, resolution, and optional custom fields.
 * Renders via Canvas2D for broad browser support.
 */

import { formatTimecode } from '../utils/media/Timecode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single field to display on the slate. */
export interface SlateField {
  /** Label shown before the value (e.g. "Shot", "Version") */
  label: string;
  /** The value to display */
  value: string;
  /** Size tier: large fields are rendered bigger. Default: 'medium' */
  size?: 'large' | 'medium' | 'small';
}

/** Layout position for the studio logo. */
export type LogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Configuration for slate rendering. */
export interface SlateConfig {
  /** Export resolution width in pixels */
  width: number;
  /** Export resolution height in pixels */
  height: number;
  /** Background color (CSS color string). Default: '#000000' */
  backgroundColor?: string;
  /** Text color (CSS color string). Default: '#ffffff' */
  textColor?: string;
  /** Font family. Default: monospace */
  fontFamily?: string;
  /** Fields to render on the slate, in display order */
  fields: SlateField[];
  /** Optional logo image (already loaded) */
  logo?: ImageBitmap | HTMLImageElement;
  /** Logo position. Default: 'bottom-right' */
  logoPosition?: LogoPosition;
  /** Logo max size as fraction of slate width. Default: 0.15 */
  logoScale?: number;
}

/** Production metadata used to build default slate fields. */
export interface SlateMetadata {
  /** Show or project name */
  showName?: string;
  /** Shot name */
  shotName?: string;
  /** Version label (e.g. "v02") */
  version?: string;
  /** Artist name */
  artist?: string;
  /** Date string (e.g. "2026-02-18") */
  date?: string;
  /** Timecode in frame (1-based) */
  frameIn?: number;
  /** Timecode out frame (1-based, exclusive) */
  frameOut?: number;
  /** Frames per second */
  fps?: number;
  /** Resolution string (e.g. "1920x1080") */
  resolution?: string;
  /** Codec string (e.g. "H.264") */
  codec?: string;
  /** Color space (e.g. "ACES / sRGB") */
  colorSpace?: string;
}

/** Result of rendering a slate. */
export interface SlateFrame {
  /** Pixel data as Uint8ClampedArray (RGBA) */
  pixels: Uint8ClampedArray;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

// ---------------------------------------------------------------------------
// Build default fields from metadata
// ---------------------------------------------------------------------------

/**
 * Build the standard slate field list from production metadata.
 * Fields with empty/undefined values are omitted.
 */
export function buildSlateFields(meta: SlateMetadata): SlateField[] {
  const fields: SlateField[] = [];

  if (meta.showName) {
    fields.push({ label: '', value: meta.showName, size: 'large' });
  }
  if (meta.shotName) {
    fields.push({ label: '', value: meta.shotName, size: 'large' });
  }

  // Medium fields: version, artist, date
  if (meta.version) {
    fields.push({ label: 'Version', value: meta.version });
  }
  if (meta.artist) {
    fields.push({ label: 'Artist', value: meta.artist });
  }
  if (meta.date) {
    fields.push({ label: 'Date', value: meta.date });
  }

  // Timecodes
  if (meta.frameIn != null && meta.fps && meta.fps > 0) {
    fields.push({ label: 'TC In', value: formatTimecode(meta.frameIn, meta.fps) });
  }
  if (meta.frameOut != null && meta.fps && meta.fps > 0) {
    fields.push({ label: 'TC Out', value: formatTimecode(meta.frameOut, meta.fps) });
  }
  if (meta.frameIn != null && meta.frameOut != null && meta.fps && meta.fps > 0) {
    const dur = meta.frameOut - meta.frameIn;
    fields.push({ label: 'Duration', value: `${dur} frames` });
  }

  // Small fields: resolution, codec, color space
  if (meta.resolution) {
    fields.push({ label: 'Resolution', value: meta.resolution, size: 'small' });
  }
  if (meta.codec) {
    fields.push({ label: 'Codec', value: meta.codec, size: 'small' });
  }
  if (meta.colorSpace) {
    fields.push({ label: 'Color Space', value: meta.colorSpace, size: 'small' });
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Font size calculation
// ---------------------------------------------------------------------------

const FONT_SIZE_RATIOS = {
  large: 0.06,
  medium: 0.035,
  small: 0.025,
} as const;

/**
 * Calculate font size in pixels for a given tier and canvas height.
 */
export function getFontSize(size: 'large' | 'medium' | 'small', canvasHeight: number): number {
  return Math.max(10, Math.round(canvasHeight * FONT_SIZE_RATIOS[size]));
}

// ---------------------------------------------------------------------------
// Logo positioning
// ---------------------------------------------------------------------------

export interface LogoRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Compute the position and size for the logo on the slate.
 */
export function computeLogoRect(
  logoWidth: number,
  logoHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  position: LogoPosition,
  scale: number,
): LogoRect {
  const maxW = canvasWidth * scale;
  const maxH = canvasHeight * scale;
  const aspect = logoWidth / logoHeight;

  let w: number, h: number;
  if (aspect >= 1) {
    w = Math.min(logoWidth, maxW);
    h = w / aspect;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
  } else {
    h = Math.min(logoHeight, maxH);
    w = h * aspect;
    if (w > maxW) {
      w = maxW;
      h = w / aspect;
    }
  }

  const margin = canvasWidth * 0.03;
  let x: number, y: number;

  switch (position) {
    case 'top-left':
      x = margin;
      y = margin;
      break;
    case 'top-right':
      x = canvasWidth - w - margin;
      y = margin;
      break;
    case 'bottom-left':
      x = margin;
      y = canvasHeight - h - margin;
      break;
    case 'bottom-right':
    default:
      x = canvasWidth - w - margin;
      y = canvasHeight - h - margin;
      break;
  }

  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

// ---------------------------------------------------------------------------
// Text layout
// ---------------------------------------------------------------------------

export interface TextLine {
  text: string;
  fontSize: number;
  y: number;
}

/**
 * Lay out slate fields as centered text lines, returning positions.
 */
export function layoutText(
  fields: SlateField[],
  canvasHeight: number,
): TextLine[] {
  if (fields.length === 0) return [];

  const lines: TextLine[] = [];
  const lineSpacing = 1.6;

  // Calculate total height needed
  let totalHeight = 0;
  const sizes: number[] = [];
  for (const field of fields) {
    const fontSize = getFontSize(field.size ?? 'medium', canvasHeight);
    sizes.push(fontSize);
    totalHeight += fontSize * lineSpacing;
  }

  // Start Y: vertically center the block
  let y = (canvasHeight - totalHeight) / 2 + sizes[0]!;

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    const fontSize = sizes[i]!;
    const text = field.label ? `${field.label}: ${field.value}` : field.value;
    lines.push({ text, fontSize, y: Math.round(y) });
    y += fontSize * lineSpacing;
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Render slate to canvas
// ---------------------------------------------------------------------------

/**
 * Render a single slate frame onto the given canvas 2D context.
 * The context must already be sized to config.width x config.height.
 */
export function renderSlate(
  ctx: CanvasRenderingContext2D,
  config: SlateConfig,
): void {
  const { width, height } = config;
  const bgColor = config.backgroundColor ?? '#000000';
  const textColor = config.textColor ?? '#ffffff';
  const fontFamily = config.fontFamily ?? "'SF Mono', 'Fira Code', 'Consolas', monospace";

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Text
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = layoutText(config.fields, height);
  for (const line of lines) {
    ctx.font = `${line.fontSize}px ${fontFamily}`;
    ctx.fillText(line.text, width / 2, line.y, width * 0.9);
  }

  // Logo
  if (config.logo) {
    const logoW = config.logo.width;
    const logoH = config.logo.height;
    if (logoW > 0 && logoH > 0) {
      const rect = computeLogoRect(
        logoW,
        logoH,
        width,
        height,
        config.logoPosition ?? 'bottom-right',
        config.logoScale ?? 0.15,
      );
      ctx.drawImage(config.logo, rect.x, rect.y, rect.w, rect.h);
    }
  }
}

// ---------------------------------------------------------------------------
// Generate slate frame pixels
// ---------------------------------------------------------------------------

/**
 * Generate a single slate frame as pixel data.
 * Creates an offscreen canvas, renders the slate, and extracts pixels.
 */
export function generateSlateFrame(config: SlateConfig): SlateFrame {
  if (config.width <= 0 || config.height <= 0) {
    throw new Error('Slate dimensions must be positive');
  }
  const canvas = document.createElement('canvas');
  canvas.width = config.width;
  canvas.height = config.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create canvas 2D context');
  }

  renderSlate(ctx, config);

  const imageData = ctx.getImageData(0, 0, config.width, config.height);
  return {
    pixels: imageData.data,
    width: config.width,
    height: config.height,
  };
}

// ---------------------------------------------------------------------------
// Generate multiple leader frames
// ---------------------------------------------------------------------------

/**
 * Generate N identical slate frames for use as a leader sequence.
 * @param config Slate rendering configuration
 * @param durationSeconds Duration of the leader in seconds
 * @param fps Frames per second
 * @returns Array of SlateFrame objects (all sharing the same pixel data)
 */
export function generateLeaderFrames(
  config: SlateConfig,
  durationSeconds: number,
  fps: number,
): SlateFrame[] {
  if (durationSeconds <= 0 || fps <= 0) return [];

  const frameCount = Math.round(durationSeconds * fps);
  const frame = generateSlateFrame(config);

  // All leader frames are identical, so share the pixel data reference
  return Array.from({ length: frameCount }, () => frame);
}
