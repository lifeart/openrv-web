/**
 * WebGL HDR Type Definitions
 *
 * Augments the standard TypeScript DOM types with experimental browser APIs
 * for High Dynamic Range (HDR) rendering. These APIs are available in
 * Chromium-based browsers but are not yet part of the standard TypeScript
 * DOM library.
 *
 * Covers:
 * - Extended color space type for WebGL2 (rec2100-hlg, rec2100-pq)
 * - WebGL2RenderingContext.drawingBufferColorSpace / unpackColorSpace widened
 * - HTMLCanvasElement.configureHighDynamicRange()
 * - CanvasRenderingContext2DSettings.pixelFormat / colorType (for HDR float16 canvas)
 * - Window.getScreenDetails() (Screen Details API)
 * - OffscreenCanvasRenderingContext2D extended for HDR canvas drawImage
 *
 * Note: PredefinedColorSpace is a type alias and cannot be augmented via
 * declaration merging. For canvas 2D context settings that need HDR color
 * space values (e.g. 'rec2100-hlg'), use `as unknown as
 * CanvasRenderingContext2DSettings` at the call site.
 */

// =============================================================================
// Extended color space values
// =============================================================================

/**
 * HDR color space values not yet in TypeScript's PredefinedColorSpace.
 * These are supported by Chromium when HDR display output is available.
 */
type HDRColorSpace = 'rec2100-hlg' | 'rec2100-pq';

/**
 * All color spaces that can be assigned to drawingBufferColorSpace,
 * unpackColorSpace, and canvas colorSpace options -- including
 * experimental HDR values.
 */
type ExtendedColorSpace = PredefinedColorSpace | HDRColorSpace;

// =============================================================================
// WebGL2 HDR extensions
// =============================================================================

/**
 * Augment WebGL2RenderingContext to accept HDR color space values.
 *
 * WebGL2RenderingContext's own interface body is empty (properties come from
 * WebGLRenderingContextBase), so adding these properties here creates own-
 * properties that shadow the inherited PredefinedColorSpace-typed originals.
 */
interface WebGL2RenderingContext {
  /**
   * The color space of the drawing buffer. Experimental HDR values
   * (rec2100-hlg, rec2100-pq) are accepted by Chromium on HDR displays.
   *
   * The browser may silently ignore unsupported values, so always
   * read back the property after setting to verify it was accepted.
   */
  drawingBufferColorSpace: ExtendedColorSpace;

  /**
   * The color space used when unpacking texture image data.
   * Supports the same extended color space values as drawingBufferColorSpace.
   */
  unpackColorSpace: ExtendedColorSpace;

  /**
   * Configure the drawing buffer's internal storage format and dimensions.
   * When called with RGBA16F, enables a half-float backbuffer that can
   * represent values > 1.0 — essential for HDR extended range output.
   *
   * @see https://www.w3.org/TR/webgl-drawingbuffer-storage/
   */
  drawingBufferStorage?(internalformat: GLenum, width: GLsizei, height: GLsizei): void;
}

// =============================================================================
// Canvas HDR extensions
// =============================================================================

/**
 * Options for configureHighDynamicRange() on HTMLCanvasElement.
 * This API hints to the compositor that the canvas content is HDR.
 */
interface CanvasHighDynamicRangeOptions {
  mode: 'default' | 'extended';
}

interface HTMLCanvasElement {
  /**
   * Configures the canvas for HDR output. Available in Chromium behind
   * the "enable-experimental-web-platform-features" flag or on HDR displays.
   *
   * @see https://github.com/nicoacosta/enable-canvas-hdr
   */
  configureHighDynamicRange?(options: CanvasHighDynamicRangeOptions): void;
}

interface OffscreenCanvas {
  /**
   * Configures the canvas for HDR output (OffscreenCanvas variant).
   */
  configureHighDynamicRange?(options: CanvasHighDynamicRangeOptions): void;
}

// =============================================================================
// Canvas 2D HDR context settings
// =============================================================================

/**
 * Augment CanvasRenderingContext2DSettings with the experimental pixelFormat
 * property. Note: we do NOT re-declare colorSpace here because it is typed
 * as PredefinedColorSpace in the base interface and interface merging cannot
 * widen a directly-declared property. For HDR color spaces in canvas 2D
 * settings, cast the options object: `{ colorSpace: 'rec2100-hlg' } as
 * CanvasRenderingContext2DSettings`.
 */
interface CanvasRenderingContext2DSettings {
  /**
   * The pixel storage format (legacy name, pre-Chrome 133).
   * Superseded by colorType in Chrome 133+.
   *
   * Experimental: Only available in Chromium-based browsers.
   */
  pixelFormat?: 'uint8' | 'float16';

  /**
   * The color type / pixel storage format (Chrome 137+ stable).
   * When set to 'float16', the canvas uses 16-bit float pixel storage
   * capable of representing values > 1.0 (extended range / HDR).
   *
   * @see https://chromestatus.com/feature/5086141338877952
   */
  colorType?: 'unorm8' | 'float16';
}

// =============================================================================
// HDR Canvas context settings for OffscreenCanvas
// =============================================================================

/**
 * Extended context settings for OffscreenCanvas 2D context.
 * Used when creating HDR float16 canvases for VideoFrame resize.
 */
interface HDRCanvasContextSettings {
  colorSpace?: string;  // 'srgb' | 'display-p3' | 'rec2100-hlg' | 'rec2100-pq'
  colorType?: 'unorm8' | 'float16';
  pixelFormat?: 'uint8' | 'float16';
  willReadFrequently?: boolean;
}

// =============================================================================
// ImageData HDR extensions
// =============================================================================

/**
 * Augment ImageDataSettings with the experimental storageFormat property.
 * When set to 'float32', ImageData uses Float32Array storage, enabling HDR
 * pixel values > 1.0. Used by Canvas2DHDRBlit for putImageData with float data.
 *
 * @see https://html.spec.whatwg.org/multipage/canvas.html#imagedata
 */
interface ImageDataSettings {
  storageFormat?: 'uint8' | 'uint16' | 'float32';
}

// =============================================================================
// Screen Details API (experimental)
// =============================================================================

/**
 * A single screen descriptor from the Screen Details API.
 */
interface ScreenDetailed extends Screen {
  /** HDR headroom: ratio of peak luminance to SDR reference white. */
  highDynamicRangeHeadroom?: number;
}

/**
 * Result of window.getScreenDetails().
 */
interface ScreenDetails {
  readonly currentScreen: ScreenDetailed;
  readonly screens: ReadonlyArray<ScreenDetailed>;
}

interface Window {
  /**
   * Requests detailed information about all connected screens.
   * Requires user permission (prompts on first call).
   *
   * @see https://developer.chrome.com/docs/capabilities/screen-details
   */
  getScreenDetails?(): Promise<ScreenDetails>;
}
