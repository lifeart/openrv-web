/**
 * ViewAPI - Public view control methods for the OpenRV API
 *
 * Wraps the Viewer and ChannelSelect to expose zoom, pan, and channel controls.
 */

import type { ViewerProvider } from './types';
import type { ChannelMode } from '../core/types/color';
import { ValidationError } from '../core/errors';

const VALID_CHANNELS: ReadonlySet<string> = new Set([
  'rgb', 'red', 'green', 'blue', 'alpha', 'luminance',
]);

// Alias map for user-friendly channel names
const CHANNEL_ALIASES: Record<string, ChannelMode> = {
  'rgb': 'rgb',
  'red': 'red',
  'r': 'red',
  'green': 'green',
  'g': 'green',
  'blue': 'blue',
  'b': 'blue',
  'alpha': 'alpha',
  'a': 'alpha',
  'luminance': 'luminance',
  'luma': 'luminance',
  'l': 'luminance',
};

export class ViewAPI {
  private viewer: ViewerProvider;

  constructor(viewer: ViewerProvider) {
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
    this.viewer.fitToWindow();
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
    if (typeof mode !== 'string') {
      throw new ValidationError('setChannel() requires a string argument');
    }
    const resolved = CHANNEL_ALIASES[mode.toLowerCase()];
    if (!resolved) {
      throw new ValidationError(
        `Invalid channel mode: "${mode}". Valid modes: ${Array.from(VALID_CHANNELS).join(', ')}`
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
    return this.viewer.getChannelMode();
  }
}
