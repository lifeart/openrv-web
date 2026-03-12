/**
 * ViewAPI - Public view control methods for the OpenRV API
 *
 * Wraps the Viewer and ChannelSelect to expose zoom, pan, and channel controls.
 */

import type { ViewerProvider } from './types';
import type { ChannelMode } from '../core/types/color';
import type { TextureFilterMode } from '../core/types/filter';
import type { BackgroundPatternState } from '../core/types/background';
import type { MatteSettings } from '../core/session/SessionTypes';
import { ValidationError } from '../core/errors';
import { DisposableAPI } from './Disposable';

const VALID_CHANNELS: ReadonlySet<string> = new Set(['rgb', 'red', 'green', 'blue', 'alpha', 'luminance']);

// Alias map for user-friendly channel names
const CHANNEL_ALIASES: Record<string, ChannelMode> = {
  rgb: 'rgb',
  red: 'red',
  r: 'red',
  green: 'green',
  g: 'green',
  blue: 'blue',
  b: 'blue',
  alpha: 'alpha',
  a: 'alpha',
  luminance: 'luminance',
  luma: 'luminance',
  l: 'luminance',
};

export class ViewAPI extends DisposableAPI {
  private viewer: ViewerProvider;

  constructor(viewer: ViewerProvider) {
    super();
    this.viewer = viewer;
  }

  /**
   * Set the zoom level of the viewport.
   *
   * @param level - Zoom level as a positive number (e.g., 1.0 = 100%, 2.0 = 200%).
   * @throws {ValidationError} If `level` is not a positive number or is NaN.
   *
   * @example
   * ```ts
   * openrv.view.setZoom(2.0); // zoom to 200%
   * ```
   */
  setZoom(level: number): void {
    this.assertNotDisposed();
    if (typeof level !== 'number' || isNaN(level) || level <= 0) {
      throw new ValidationError('setZoom() requires a positive number');
    }
    this.viewer.setZoom(level);
  }

  /**
   * Get the current zoom level.
   *
   * @returns The current zoom level (e.g., 1.0 = 100%).
   *
   * @example
   * ```ts
   * const zoom = openrv.view.getZoom();
   * ```
   */
  getZoom(): number {
    this.assertNotDisposed();
    return this.viewer.getZoom();
  }

  /**
   * Fit the image to the current window/viewport dimensions.
   *
   * @example
   * ```ts
   * openrv.view.fitToWindow();
   * ```
   */
  fitToWindow(): void {
    this.assertNotDisposed();
    this.viewer.fitToWindow();
  }

  /**
   * Fit the image width to the container width.
   * The image fills the viewport width; user can pan vertically.
   *
   * @example
   * ```ts
   * openrv.view.fitToWidth();
   * ```
   */
  fitToWidth(): void {
    this.assertNotDisposed();
    this.viewer.fitToWidth();
  }

  /**
   * Fit the image height to the container height.
   * The image fills the viewport height; user can pan horizontally.
   *
   * @example
   * ```ts
   * openrv.view.fitToHeight();
   * ```
   */
  fitToHeight(): void {
    this.assertNotDisposed();
    this.viewer.fitToHeight();
  }

  /**
   * Get the current fit mode.
   *
   * @returns The active fit mode ('all', 'width', 'height') or null if no fit mode is active.
   *
   * @example
   * ```ts
   * const mode = openrv.view.getFitMode(); // e.g. 'width'
   * ```
   */
  getFitMode(): string | null {
    this.assertNotDisposed();
    return this.viewer.getFitMode();
  }

  /**
   * Set the pan offset in pixels.
   *
   * @param x - Horizontal pan offset in pixels (positive = right).
   * @param y - Vertical pan offset in pixels (positive = down).
   * @throws {ValidationError} If `x` or `y` is not a valid number or is NaN.
   *
   * @example
   * ```ts
   * openrv.view.setPan(100, -50);
   * ```
   */
  setPan(x: number, y: number): void {
    this.assertNotDisposed();
    if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
      throw new ValidationError('setPan() requires valid x and y coordinates');
    }
    this.viewer.setPan(x, y);
  }

  /**
   * Get the current pan offset.
   *
   * @returns An object with `x` and `y` pixel offsets.
   *
   * @example
   * ```ts
   * const { x, y } = openrv.view.getPan();
   * ```
   */
  getPan(): { x: number; y: number } {
    this.assertNotDisposed();
    return this.viewer.getPan();
  }

  /**
   * Set the channel isolation mode for viewing.
   *
   * @param mode - Channel mode: `'rgb'`, `'red'`, `'green'`, `'blue'`, `'alpha'`, `'luminance'`.
   *   Also accepts shorthand aliases: `'r'`, `'g'`, `'b'`, `'a'`, `'luma'`, `'l'`.
   *   The value is case-insensitive.
   * @throws {ValidationError} If `mode` is not a string or is not a recognized channel name.
   *
   * @example
   * ```ts
   * openrv.view.setChannel('alpha');
   * ```
   */
  setChannel(mode: string): void {
    this.assertNotDisposed();
    if (typeof mode !== 'string') {
      throw new ValidationError('setChannel() requires a string argument');
    }
    const resolved = CHANNEL_ALIASES[mode.toLowerCase()];
    if (!resolved) {
      throw new ValidationError(
        `Invalid channel mode: "${mode}". Valid modes: ${Array.from(VALID_CHANNELS).join(', ')}`,
      );
    }
    this.viewer.setChannelMode(resolved);
  }

  /**
   * Get the current channel isolation mode.
   *
   * @returns The active channel mode string (e.g., `'rgb'`, `'red'`, `'alpha'`).
   *
   * @example
   * ```ts
   * const channel = openrv.view.getChannel(); // e.g. 'rgb'
   * ```
   */
  getChannel(): string {
    this.assertNotDisposed();
    return this.viewer.getChannelMode();
  }

  /**
   * Set the texture filtering mode.
   *
   * @param mode - `'nearest'` for pixel-perfect (nearest-neighbor) or `'linear'` for smooth (bilinear).
   * @throws {ValidationError} If `mode` is not `'nearest'` or `'linear'`.
   *
   * @example
   * ```ts
   * openrv.view.setTextureFilterMode('nearest');
   * ```
   */
  setTextureFilterMode(mode: TextureFilterMode): void {
    this.assertNotDisposed();
    if (mode !== 'nearest' && mode !== 'linear') {
      throw new ValidationError(`setTextureFilterMode() requires 'nearest' or 'linear', got: "${mode}"`);
    }
    this.viewer.setFilterMode(mode);
  }

  /**
   * Get the current texture filtering mode.
   *
   * @returns `'nearest'` or `'linear'`.
   *
   * @example
   * ```ts
   * const mode = openrv.view.getTextureFilterMode(); // e.g. 'linear'
   * ```
   */
  getTextureFilterMode(): TextureFilterMode {
    this.assertNotDisposed();
    return this.viewer.getFilterMode();
  }

  /**
   * Set the background pattern state.
   *
   * @param state - The full background pattern state including pattern type, checker size, and custom color.
   *
   * @example
   * ```ts
   * openrv.view.setBackgroundPattern({ pattern: 'checker', checkerSize: 'medium', customColor: '#1a1a1a' });
   * ```
   */
  setBackgroundPattern(state: BackgroundPatternState): void {
    this.assertNotDisposed();
    this.viewer.setBackgroundPatternState(state);
  }

  /**
   * Get the current background pattern state.
   *
   * @returns The current background pattern state.
   *
   * @example
   * ```ts
   * const bg = openrv.view.getBackgroundPattern();
   * ```
   */
  getBackgroundPattern(): BackgroundPatternState {
    this.assertNotDisposed();
    return this.viewer.getBackgroundPatternState();
  }

  /**
   * Get the current viewport size in CSS pixels.
   *
   * @returns An object with `width` and `height` representing the viewer's display dimensions.
   *
   * @example
   * ```ts
   * const { width, height } = openrv.view.getViewportSize();
   * ```
   */
  getViewportSize(): { width: number; height: number } {
    this.assertNotDisposed();
    return this.viewer.getViewportSize();
  }

  /**
   * Enable the matte overlay and optionally configure it.
   *
   * @param options - Optional partial matte settings to apply.
   *   Supported keys: `aspect` (target aspect ratio, 0.1–10),
   *   `opacity` (0–1), `centerPoint` ([x, y] normalized offsets).
   * @throws {ValidationError} If `aspect` is not a positive number, `opacity` is out of range,
   *   or `centerPoint` is not a two-element numeric array.
   *
   * @example
   * ```ts
   * openrv.view.setMatte({ aspect: 2.39, opacity: 0.8 });
   * ```
   */
  setMatte(options?: Partial<Pick<MatteSettings, 'aspect' | 'opacity' | 'centerPoint'>>): void {
    this.assertNotDisposed();
    const merged: Partial<MatteSettings> = { show: true };

    if (options) {
      if (typeof options !== 'object') {
        throw new ValidationError('setMatte() options must be an object');
      }
      if (options.aspect !== undefined) {
        if (typeof options.aspect !== 'number' || isNaN(options.aspect) || options.aspect <= 0) {
          throw new ValidationError('setMatte() aspect must be a positive number');
        }
        merged.aspect = Math.max(0.1, Math.min(10, options.aspect));
      }
      if (options.opacity !== undefined) {
        if (typeof options.opacity !== 'number' || isNaN(options.opacity)) {
          throw new ValidationError('setMatte() opacity must be a number between 0 and 1');
        }
        merged.opacity = Math.max(0, Math.min(1, options.opacity));
      }
      if (options.centerPoint !== undefined) {
        if (
          !Array.isArray(options.centerPoint) ||
          options.centerPoint.length !== 2 ||
          typeof options.centerPoint[0] !== 'number' ||
          typeof options.centerPoint[1] !== 'number'
        ) {
          throw new ValidationError('setMatte() centerPoint must be a [number, number] array');
        }
        merged.centerPoint = options.centerPoint;
      }
    }

    this.viewer.setMatteSettings(merged);
  }

  /**
   * Disable the matte overlay.
   *
   * @example
   * ```ts
   * openrv.view.clearMatte();
   * ```
   */
  clearMatte(): void {
    this.assertNotDisposed();
    this.viewer.setMatteSettings({ show: false });
  }

  /**
   * Get the current matte overlay settings.
   *
   * @returns The matte settings including `show`, `aspect`, `opacity`, `heightVisible`, and `centerPoint`.
   *
   * @example
   * ```ts
   * const matte = openrv.view.getMatte();
   * if (matte.show) console.log(`Matte active at ${matte.aspect}:1`);
   * ```
   */
  getMatte(): MatteSettings {
    this.assertNotDisposed();
    return this.viewer.getMatteSettings();
  }
}
