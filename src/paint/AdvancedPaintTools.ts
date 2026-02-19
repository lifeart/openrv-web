/**
 * AdvancedPaintTools - Dodge, Burn, Clone, and Smudge tools for pixel manipulation.
 *
 * These tools operate directly on pixel data (Float32Array RGBA buffers)
 * rather than the annotation overlay system. They destructively modify
 * the image canvas pixels under the brush.
 *
 * Each tool implements the PaintToolInterface for consistent brush handling.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pixel buffer for destructive paint operations */
export interface PixelBuffer {
  /** RGBA pixel data, 4 floats per pixel, values in [0, 1] or HDR range */
  data: Float32Array;
  /** Width of the buffer in pixels */
  width: number;
  /** Height of the buffer in pixels */
  height: number;
  /** Number of channels (always 4 for RGBA) */
  channels: 4;
}

/** Brush parameters shared by all advanced tools */
export interface BrushParams {
  /** Brush radius in pixels */
  size: number;
  /** Opacity/strength 0-1 */
  opacity: number;
  /** Pen pressure 0-1 (from tablet input) */
  pressure: number;
  /** Brush hardness 0-1 (0 = soft gaussian, 1 = hard circle) */
  hardness: number;
}

/** A point in pixel coordinates */
export interface PixelPoint {
  x: number;
  y: number;
}

/** Interface for destructive paint tools */
export interface PaintToolInterface {
  /** Tool name */
  readonly name: string;
  /** Apply the tool at a given position on the pixel buffer */
  apply(buffer: PixelBuffer, position: PixelPoint, brush: BrushParams): void;
  /** Called when a stroke begins */
  beginStroke(position: PixelPoint): void;
  /** Called when a stroke ends */
  endStroke(): void;
  /** Reset internal tool state */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Brush kernel helpers
// ---------------------------------------------------------------------------

/**
 * Compute the brush falloff at a given distance from center.
 * Returns a value in [0, 1] representing the brush intensity.
 *
 * @param distance - Distance from brush center in pixels
 * @param radius - Brush radius in pixels
 * @param hardness - Brush hardness 0-1
 * @returns Intensity 0-1
 */
export function brushFalloff(distance: number, radius: number, hardness: number): number {
  if (radius <= 0) return 0;
  if (distance >= radius) return 0;

  const t = distance / radius; // 0 at center, 1 at edge

  if (hardness >= 1) {
    return 1; // Hard brush: full intensity everywhere inside radius
  }

  // Soft brush: gaussian-like falloff
  // hardness controls where the falloff starts (0 = smooth from center, 1 = no falloff)
  const falloffStart = hardness;
  if (t <= falloffStart) return 1;

  const falloffT = (t - falloffStart) / (1 - falloffStart);
  // Smooth hermite (cubic) falloff
  return 1 - falloffT * falloffT * (3 - 2 * falloffT);
}

/**
 * Iterate over pixels within the brush radius, calling the callback for each.
 * The callback receives the pixel index (into the data array) and the brush intensity.
 */
export function forEachBrushPixel(
  buffer: PixelBuffer,
  center: PixelPoint,
  brush: BrushParams,
  callback: (index: number, intensity: number, px: number, py: number) => void,
): void {
  const radius = brush.size;
  const effectiveOpacity = brush.opacity * brush.pressure;

  const minX = Math.max(0, Math.floor(center.x - radius));
  const maxX = Math.min(buffer.width - 1, Math.ceil(center.x + radius));
  const minY = Math.max(0, Math.floor(center.y - radius));
  const maxY = Math.min(buffer.height - 1, Math.ceil(center.y + radius));

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const dx = px - center.x;
      const dy = py - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > radius) continue;

      const falloff = brushFalloff(dist, radius, brush.hardness);
      const intensity = falloff * effectiveOpacity;

      if (intensity <= 0) continue;

      const index = (py * buffer.width + px) * 4;
      callback(index, intensity, px, py);
    }
  }
}

/**
 * Read RGBA values from a pixel buffer at the given coordinates.
 * Returns [0, 0, 0, 0] for out-of-bounds coordinates.
 */
export function samplePixel(
  buffer: PixelBuffer,
  x: number,
  y: number,
): [number, number, number, number] {
  const px = Math.round(x);
  const py = Math.round(y);

  if (px < 0 || px >= buffer.width || py < 0 || py >= buffer.height) {
    return [0, 0, 0, 0];
  }

  const idx = (py * buffer.width + px) * 4;
  return [
    buffer.data[idx]!,
    buffer.data[idx + 1]!,
    buffer.data[idx + 2]!,
    buffer.data[idx + 3]!,
  ];
}

// ---------------------------------------------------------------------------
// Dodge Tool
// ---------------------------------------------------------------------------

/**
 * DodgeTool - Lightens (increases brightness of) pixels under the brush.
 *
 * Multiplies pixel values by a factor > 1 based on pressure and opacity,
 * which INCREASES pixel brightness. This matches the traditional darkroom
 * technique where "dodging" blocks light during exposure, resulting in
 * a lighter print area.
 */
export class DodgeTool implements PaintToolInterface {
  readonly name = 'dodge';

  /** Dodge strength multiplier. Higher = more lightening per stroke. */
  strength = 0.3;

  apply(buffer: PixelBuffer, position: PixelPoint, brush: BrushParams): void {
    forEachBrushPixel(buffer, position, brush, (index, intensity) => {
      // Dodge: factor > 1 increases pixel brightness (lightens the image)
      const factor = 1 + this.strength * intensity;

      // Don't clamp upper bound so HDR values > 1.0 are preserved.
      // Only clamp lower bound to 0 to avoid negative values.
      buffer.data[index] = Math.max(0, buffer.data[index]! * factor);
      buffer.data[index + 1] = Math.max(0, buffer.data[index + 1]! * factor);
      buffer.data[index + 2] = Math.max(0, buffer.data[index + 2]! * factor);
      // Alpha unchanged
    });
  }

  beginStroke(_position: PixelPoint): void {
    // No state to track
  }

  endStroke(): void {
    // No cleanup needed
  }

  reset(): void {
    this.strength = 0.3;
  }
}

// ---------------------------------------------------------------------------
// Burn Tool
// ---------------------------------------------------------------------------

/**
 * BurnTool - Darkens (decreases brightness of) pixels under the brush.
 *
 * Multiplies pixel values by a factor < 1 based on pressure and opacity,
 * which DECREASES pixel brightness. This matches the traditional darkroom
 * technique where "burning" adds extra light exposure, resulting in a
 * darker print area.
 */
export class BurnTool implements PaintToolInterface {
  readonly name = 'burn';

  /** Burn strength. Higher = more darkening per stroke. */
  strength = 0.3;

  apply(buffer: PixelBuffer, position: PixelPoint, brush: BrushParams): void {
    forEachBrushPixel(buffer, position, brush, (index, intensity) => {
      // Burn: factor < 1 decreases pixel brightness (darkens the image)
      const factor = 1 - this.strength * intensity;

      // Don't clamp upper bound so HDR values > 1.0 are preserved.
      // Only clamp lower bound to 0 to avoid negative values.
      buffer.data[index] = Math.max(0, buffer.data[index]! * factor);
      buffer.data[index + 1] = Math.max(0, buffer.data[index + 1]! * factor);
      buffer.data[index + 2] = Math.max(0, buffer.data[index + 2]! * factor);
      // Alpha unchanged
    });
  }

  beginStroke(_position: PixelPoint): void {
    // No state to track
  }

  endStroke(): void {
    // No cleanup needed
  }

  reset(): void {
    this.strength = 0.3;
  }
}

// ---------------------------------------------------------------------------
// Clone Tool
// ---------------------------------------------------------------------------

/**
 * CloneTool - Samples pixels from an offset position and paints them at the cursor.
 *
 * Usage:
 * 1. Hold Alt and click to set the source point.
 * 2. Paint normally - pixels are copied from source offset to cursor.
 *
 * The offset between source and destination is maintained throughout the stroke.
 */
export class CloneTool implements PaintToolInterface {
  readonly name = 'clone';

  /** Source offset from the current cursor position */
  private _sourceOffset: PixelPoint | null = null;
  /** Whether the source point has been set */
  private _sourceSet = false;
  /** Temporary source position set via Alt-click */
  private _sourcePoint: PixelPoint | null = null;
  /** First stroke position (used to establish offset) */
  private _strokeStarted = false;

  /** Whether the source has been set (Alt-click completed) */
  get sourceSet(): boolean {
    return this._sourceSet;
  }

  /** Current source offset */
  get sourceOffset(): PixelPoint | null {
    return this._sourceOffset ? { ...this._sourceOffset } : null;
  }

  /**
   * Set the source sample point (called on Alt-click).
   */
  setSource(position: PixelPoint): void {
    this._sourcePoint = { ...position };
    this._sourceSet = true;
    this._sourceOffset = null; // Will be calculated on first stroke point
  }

  apply(buffer: PixelBuffer, position: PixelPoint, brush: BrushParams): void {
    if (!this._sourceSet || !this._sourceOffset) return;

    forEachBrushPixel(buffer, position, brush, (index, intensity, px, py) => {
      const srcX = px + this._sourceOffset!.x;
      const srcY = py + this._sourceOffset!.y;

      const [sr, sg, sb, sa] = samplePixel(buffer, srcX, srcY);

      // Blend source pixel with destination based on intensity
      buffer.data[index] = buffer.data[index]! * (1 - intensity) + sr * intensity;
      buffer.data[index + 1] = buffer.data[index + 1]! * (1 - intensity) + sg * intensity;
      buffer.data[index + 2] = buffer.data[index + 2]! * (1 - intensity) + sb * intensity;
      buffer.data[index + 3] = buffer.data[index + 3]! * (1 - intensity) + sa * intensity;
    });
  }

  beginStroke(position: PixelPoint): void {
    if (this._sourceSet && this._sourcePoint && !this._strokeStarted) {
      // Calculate offset from cursor to source
      this._sourceOffset = {
        x: this._sourcePoint.x - position.x,
        y: this._sourcePoint.y - position.y,
      };
      this._strokeStarted = true;
    }
  }

  endStroke(): void {
    this._strokeStarted = false;
  }

  reset(): void {
    this._sourceOffset = null;
    this._sourceSet = false;
    this._sourcePoint = null;
    this._strokeStarted = false;
  }
}

// ---------------------------------------------------------------------------
// Smudge Tool
// ---------------------------------------------------------------------------

/**
 * SmudgeTool - Blends neighboring pixels in the stroke direction.
 *
 * Picks up color from the starting point and drags it along the stroke,
 * using a running average that gradually mixes with underlying pixels.
 */
export class SmudgeTool implements PaintToolInterface {
  readonly name = 'smudge';

  /** Smudge strength 0-1. Higher = more paint carried. */
  strength = 0.5;

  /** Running color being dragged along the stroke */
  private _carriedColor: [number, number, number, number] | null = null;

  /** The currently carried color (for testing/inspection) */
  get carriedColor(): [number, number, number, number] | null {
    return this._carriedColor ? [...this._carriedColor] : null;
  }

  apply(buffer: PixelBuffer, position: PixelPoint, brush: BrushParams): void {
    // Sample center pixel to initialize or update carried color
    const centerColor = samplePixel(buffer, Math.round(position.x), Math.round(position.y));

    if (!this._carriedColor) {
      this._carriedColor = centerColor;
      // Position tracked for potential future directional blending
      return; // First point just picks up color
    }

    // Update carried color: mix current carried color with center sample
    const carry = this.strength;
    this._carriedColor = [
      this._carriedColor[0] * carry + centerColor[0] * (1 - carry),
      this._carriedColor[1] * carry + centerColor[1] * (1 - carry),
      this._carriedColor[2] * carry + centerColor[2] * (1 - carry),
      this._carriedColor[3] * carry + centerColor[3] * (1 - carry),
    ];

    // Apply carried color to pixels under brush
    const carried = this._carriedColor;
    forEachBrushPixel(buffer, position, brush, (index, intensity) => {
      const blendAmt = intensity * carry;

      buffer.data[index] = buffer.data[index]! * (1 - blendAmt) + carried[0] * blendAmt;
      buffer.data[index + 1] = buffer.data[index + 1]! * (1 - blendAmt) + carried[1] * blendAmt;
      buffer.data[index + 2] = buffer.data[index + 2]! * (1 - blendAmt) + carried[2] * blendAmt;
      buffer.data[index + 3] = buffer.data[index + 3]! * (1 - blendAmt) + carried[3] * blendAmt;
    });

    // Position tracked for potential future directional blending
  }

  beginStroke(_position: PixelPoint): void {
    this._carriedColor = null;
  }

  endStroke(): void {
    this._carriedColor = null;
  }

  reset(): void {
    this.strength = 0.5;
    this._carriedColor = null;
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export type AdvancedToolName = 'dodge' | 'burn' | 'clone' | 'smudge';

/**
 * Create an advanced paint tool by name.
 */
export function createAdvancedTool(name: AdvancedToolName): PaintToolInterface {
  switch (name) {
    case 'dodge': return new DodgeTool();
    case 'burn': return new BurnTool();
    case 'clone': return new CloneTool();
    case 'smudge': return new SmudgeTool();
    default: throw new Error(`Unknown advanced paint tool: ${name}`);
  }
}
