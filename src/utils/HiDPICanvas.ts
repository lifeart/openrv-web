/**
 * Hi-DPI Canvas utilities for retina/high-DPI display support
 *
 * Provides functions to properly configure canvas elements for crisp rendering
 * on high-DPI displays (retina screens, 4K monitors, etc.)
 *
 * The key pattern for hi-DPI canvas support:
 * 1. Set canvas.width/height to CSS dimensions * devicePixelRatio (physical pixels)
 * 2. Set canvas.style.width/height to CSS dimensions (logical pixels)
 * 3. Scale the 2D context by devicePixelRatio so drawing operations use logical coordinates
 */

/**
 * Get the current device pixel ratio, defaulting to 1 for standard displays
 */
export function getDevicePixelRatio(): number {
  return window.devicePixelRatio || 1;
}

/**
 * Configuration for hi-DPI canvas setup
 */
export interface HiDPICanvasConfig {
  /** The canvas element to configure */
  canvas: HTMLCanvasElement;
  /** The 2D rendering context */
  ctx: CanvasRenderingContext2D;
  /** Desired logical width in CSS pixels */
  width: number;
  /** Desired logical height in CSS pixels */
  height: number;
  /** Whether to also set CSS width/height style. Default: true */
  setStyle?: boolean;
}

/**
 * Result of hi-DPI canvas setup
 */
export interface HiDPICanvasResult {
  /** The device pixel ratio used */
  dpr: number;
  /** Physical canvas width in actual pixels */
  physicalWidth: number;
  /** Physical canvas height in actual pixels */
  physicalHeight: number;
  /** Logical width for drawing operations */
  logicalWidth: number;
  /** Logical height for drawing operations */
  logicalHeight: number;
}

/**
 * Configure a canvas for hi-DPI display support
 *
 * This sets up the canvas with proper physical pixel dimensions and scales
 * the context so that drawing operations can use logical (CSS) coordinates.
 *
 * @example
 * ```ts
 * const canvas = document.createElement('canvas');
 * const ctx = canvas.getContext('2d')!;
 *
 * // Setup for a 256x100 logical size canvas
 * const result = setupHiDPICanvas({
 *   canvas,
 *   ctx,
 *   width: 256,
 *   height: 100,
 * });
 *
 * // Draw using logical coordinates - will be crisp on retina
 * ctx.fillRect(0, 0, 256, 100);
 * ```
 */
export function setupHiDPICanvas(config: HiDPICanvasConfig): HiDPICanvasResult {
  const { canvas, ctx, width, height, setStyle = true } = config;
  const dpr = getDevicePixelRatio();

  // Set physical pixel dimensions
  const physicalWidth = Math.floor(width * dpr);
  const physicalHeight = Math.floor(height * dpr);
  canvas.width = physicalWidth;
  canvas.height = physicalHeight;

  // Set CSS dimensions to maintain logical size
  if (setStyle) {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  // Reset any existing transform and scale context for hi-DPI
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  return {
    dpr,
    physicalWidth,
    physicalHeight,
    logicalWidth: width,
    logicalHeight: height,
  };
}

/**
 * Resize an existing hi-DPI canvas to new dimensions
 *
 * This is a semantic alias for setupHiDPICanvas, provided for code clarity
 * when resizing an already-configured canvas. Both functions are identical
 * in behavior - they fully reconfigure the canvas for hi-DPI support.
 *
 * Use this when the canvas container size changes (e.g., window resize).
 * The function will:
 * - Update physical dimensions (canvas.width/height)
 * - Update CSS dimensions if setStyle is true
 * - Reset and re-scale the context transform
 *
 * @example
 * ```ts
 * window.addEventListener('resize', () => {
 *   const rect = container.getBoundingClientRect();
 *   resizeHiDPICanvas({
 *     canvas,
 *     ctx,
 *     width: rect.width,
 *     height: rect.height,
 *   });
 *   redraw(); // Canvas content is cleared after resize
 * });
 * ```
 */
export function resizeHiDPICanvas(config: HiDPICanvasConfig): HiDPICanvasResult {
  return setupHiDPICanvas(config);
}

/**
 * Create a hi-DPI canvas element with proper configuration
 *
 * This is a convenience function that creates the canvas, gets the context,
 * and configures everything for hi-DPI support in one call.
 *
 * @example
 * ```ts
 * const { canvas, ctx, dpr } = createHiDPICanvas(256, 100);
 * container.appendChild(canvas);
 * ```
 */
export function createHiDPICanvas(
  width: number,
  height: number,
  contextOptions?: CanvasRenderingContext2DSettings
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr: number;
  physicalWidth: number;
  physicalHeight: number;
} {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', contextOptions);

  if (!ctx) {
    throw new Error('Failed to get 2D canvas context');
  }

  const result = setupHiDPICanvas({ canvas, ctx, width, height });

  return {
    canvas,
    ctx,
    ...result,
  };
}

/**
 * Convert logical (CSS) coordinates to physical pixel coordinates
 *
 * Useful when you need to work directly with the physical pixel buffer,
 * such as when using getImageData/putImageData.
 */
export function logicalToPhysical(logical: number, dpr?: number): number {
  return Math.floor(logical * (dpr ?? getDevicePixelRatio()));
}

/**
 * Convert physical pixel coordinates to logical (CSS) coordinates
 *
 * Useful when translating mouse events on hi-DPI canvas.
 */
export function physicalToLogical(physical: number, dpr?: number): number {
  return physical / (dpr ?? getDevicePixelRatio());
}

/**
 * Check if the current display is hi-DPI (devicePixelRatio > 1)
 */
export function isHiDPI(): boolean {
  return getDevicePixelRatio() > 1;
}

/**
 * Convert client (mouse event) coordinates to canvas logical coordinates
 *
 * This handles the case where CSS dimensions may differ from logical dimensions
 * due to CSS transforms, flexbox sizing, or other layout effects.
 *
 * @param canvas - The canvas element
 * @param clientX - Mouse clientX coordinate
 * @param clientY - Mouse clientY coordinate
 * @param logicalWidth - The logical width used when setting up the canvas
 * @param logicalHeight - The logical height used when setting up the canvas
 * @returns The coordinates in logical canvas space
 *
 * @example
 * ```ts
 * canvas.addEventListener('click', (e) => {
 *   const { x, y } = clientToCanvasCoordinates(canvas, e.clientX, e.clientY, 200, 200);
 *   // x and y are now in logical canvas coordinates (0-200 range)
 * });
 * ```
 */
export function clientToCanvasCoordinates(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  logicalWidth: number,
  logicalHeight: number
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  // Scale from CSS coordinates to logical coordinates
  const scaleX = logicalWidth / rect.width;
  const scaleY = logicalHeight / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}
