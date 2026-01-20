/**
 * DifferenceMatteControl - Compare two sources by showing pixel differences
 *
 * Features:
 * - Display absolute difference between A/B sources
 * - Grayscale mode (average of RGB differences)
 * - Heatmap mode (color-coded differences)
 * - Gain control (1x to 10x) to amplify small differences
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export interface DifferenceMatteState {
  enabled: boolean;
  gain: number; // 1.0 to 10.0
  heatmap: boolean;
}

export interface DifferenceMatteEvents extends EventMap {
  stateChanged: DifferenceMatteState;
  enabledChanged: boolean;
  gainChanged: number;
  heatmapChanged: boolean;
}

export const DEFAULT_DIFFERENCE_MATTE_STATE: DifferenceMatteState = {
  enabled: false,
  gain: 1.0,
  heatmap: false,
};

export class DifferenceMatteControl extends EventEmitter<DifferenceMatteEvents> {
  private state: DifferenceMatteState = { ...DEFAULT_DIFFERENCE_MATTE_STATE };

  constructor() {
    super();
  }

  /**
   * Enable difference matte mode
   */
  enable(): void {
    if (!this.state.enabled) {
      this.state.enabled = true;
      this.emit('enabledChanged', true);
      this.emitStateChanged();
    }
  }

  /**
   * Disable difference matte mode
   */
  disable(): void {
    if (this.state.enabled) {
      this.state.enabled = false;
      this.emit('enabledChanged', false);
      this.emitStateChanged();
    }
  }

  /**
   * Toggle difference matte mode
   */
  toggle(): void {
    if (this.state.enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /**
   * Check if difference matte is enabled
   */
  isEnabled(): boolean {
    return this.state.enabled;
  }

  /**
   * Set gain value (1.0 to 10.0)
   */
  setGain(gain: number): void {
    const clamped = Math.max(1.0, Math.min(10.0, gain));
    if (clamped !== this.state.gain) {
      this.state.gain = clamped;
      this.emit('gainChanged', clamped);
      this.emitStateChanged();
    }
  }

  /**
   * Get current gain value
   */
  getGain(): number {
    return this.state.gain;
  }

  /**
   * Enable heatmap mode
   */
  enableHeatmap(): void {
    if (!this.state.heatmap) {
      this.state.heatmap = true;
      this.emit('heatmapChanged', true);
      this.emitStateChanged();
    }
  }

  /**
   * Disable heatmap mode
   */
  disableHeatmap(): void {
    if (this.state.heatmap) {
      this.state.heatmap = false;
      this.emit('heatmapChanged', false);
      this.emitStateChanged();
    }
  }

  /**
   * Toggle heatmap mode
   */
  toggleHeatmap(): void {
    if (this.state.heatmap) {
      this.disableHeatmap();
    } else {
      this.enableHeatmap();
    }
  }

  /**
   * Check if heatmap mode is enabled
   */
  isHeatmap(): boolean {
    return this.state.heatmap;
  }

  /**
   * Get current state
   */
  getState(): DifferenceMatteState {
    return { ...this.state };
  }

  /**
   * Set state from saved config
   */
  setState(state: Partial<DifferenceMatteState>): void {
    if (state.enabled !== undefined) {
      this.state.enabled = state.enabled;
    }
    if (state.gain !== undefined) {
      this.state.gain = Math.max(1.0, Math.min(10.0, state.gain));
    }
    if (state.heatmap !== undefined) {
      this.state.heatmap = state.heatmap;
    }
    this.emitStateChanged();
  }

  /**
   * Reset to default state
   */
  reset(): void {
    this.state = { ...DEFAULT_DIFFERENCE_MATTE_STATE };
    this.emitStateChanged();
  }

  /**
   * Emit state changed event
   */
  private emitStateChanged(): void {
    this.emit('stateChanged', this.getState());
  }
}

/**
 * Apply difference matte effect to image data
 * Computes |A - B| per channel with gain and optional heatmap
 */
export function applyDifferenceMatte(
  dataA: ImageData,
  dataB: ImageData,
  gain: number,
  heatmap: boolean
): ImageData {
  const width = dataA.width;
  const height = dataA.height;
  const result = new ImageData(width, height);

  const srcA = dataA.data;
  const srcB = dataB.data;
  const dst = result.data;

  for (let i = 0; i < srcA.length; i += 4) {
    // Compute absolute difference per channel
    const diffR = Math.abs(srcA[i]! - srcB[i]!);
    const diffG = Math.abs(srcA[i + 1]! - srcB[i + 1]!);
    const diffB = Math.abs(srcA[i + 2]! - srcB[i + 2]!);

    // Compute grayscale magnitude (average of differences)
    const magnitude = (diffR + diffG + diffB) / 3;

    // Apply gain
    const amplified = Math.min(255, magnitude * gain);

    if (heatmap) {
      // Map to heatmap color (blue -> cyan -> green -> yellow -> red)
      const [r, g, b] = magnitudeToHeatmap(amplified / 255);
      dst[i] = r;
      dst[i + 1] = g;
      dst[i + 2] = b;
    } else {
      // Grayscale output
      dst[i] = amplified;
      dst[i + 1] = amplified;
      dst[i + 2] = amplified;
    }
    dst[i + 3] = 255; // Full opacity
  }

  return result;
}

/**
 * Convert magnitude (0-1) to heatmap RGB color
 * Uses a perceptually uniform color ramp:
 * 0.0 = black, 0.25 = blue, 0.5 = green, 0.75 = yellow, 1.0 = red/white
 */
function magnitudeToHeatmap(t: number): [number, number, number] {
  // Clamp input
  t = Math.max(0, Math.min(1, t));

  let r: number, g: number, b: number;

  if (t < 0.25) {
    // Black to blue
    const s = t / 0.25;
    r = 0;
    g = 0;
    b = Math.round(s * 255);
  } else if (t < 0.5) {
    // Blue to cyan/green
    const s = (t - 0.25) / 0.25;
    r = 0;
    g = Math.round(s * 255);
    b = Math.round((1 - s * 0.5) * 255);
  } else if (t < 0.75) {
    // Green to yellow
    const s = (t - 0.5) / 0.25;
    r = Math.round(s * 255);
    g = 255;
    b = Math.round((1 - s) * 128);
  } else {
    // Yellow to red/white
    const s = (t - 0.75) / 0.25;
    r = 255;
    g = Math.round((1 - s * 0.5) * 255);
    b = Math.round(s * 128);
  }

  return [r, g, b];
}
