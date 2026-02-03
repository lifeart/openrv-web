/**
 * ViewAPI - Public view control methods for the OpenRV API
 *
 * Wraps the Viewer and ChannelSelect to expose zoom, pan, and channel controls.
 */

import type { Viewer } from '../ui/components/Viewer';
import type { ChannelMode } from '../ui/components/ChannelSelect';

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
  private viewer: Viewer;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  /**
   * Set zoom level
   * @param level Zoom level (e.g., 1.0 = 100%, 2.0 = 200%)
   */
  setZoom(level: number): void {
    if (typeof level !== 'number' || isNaN(level) || level <= 0) {
      throw new Error('setZoom() requires a positive number');
    }
    this.viewer.setZoom(level);
  }

  /**
   * Get current zoom level
   */
  getZoom(): number {
    return this.viewer.getZoom();
  }

  /**
   * Fit image to the window/viewport
   */
  fitToWindow(): void {
    this.viewer.fitToWindow();
  }

  /**
   * Set pan offset in pixels
   * @param x Horizontal pan offset
   * @param y Vertical pan offset
   */
  setPan(x: number, y: number): void {
    if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
      throw new Error('setPan() requires valid x and y coordinates');
    }
    this.viewer.setPan(x, y);
  }

  /**
   * Get current pan offset
   */
  getPan(): { x: number; y: number } {
    return this.viewer.getPan();
  }

  /**
   * Set channel isolation mode
   * @param mode Channel mode: 'rgb', 'red', 'green', 'blue', 'alpha', 'luminance'
   *             Also accepts aliases: 'r', 'g', 'b', 'a', 'luma', 'l'
   */
  setChannel(mode: string): void {
    if (typeof mode !== 'string') {
      throw new Error('setChannel() requires a string argument');
    }
    const resolved = CHANNEL_ALIASES[mode.toLowerCase()];
    if (!resolved) {
      throw new Error(
        `Invalid channel mode: "${mode}". Valid modes: ${Array.from(VALID_CHANNELS).join(', ')}`
      );
    }
    this.viewer.setChannelMode(resolved);
  }

  /**
   * Get current channel isolation mode
   */
  getChannel(): string {
    return this.viewer.getChannelMode();
  }
}
