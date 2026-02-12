/**
 * ComparisonManager - Pure logic manager for comparison state
 *
 * Manages comparison state (wipe mode, A/B source, difference matte, blend modes)
 * with no DOM dependencies. Emits events on state changes so UI components
 * can react accordingly.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { clamp } from '../../utils/math';
import { DifferenceMatteState, DEFAULT_DIFFERENCE_MATTE_STATE } from './DifferenceMatteControl';

export type WipeMode = 'off' | 'horizontal' | 'vertical' | 'splitscreen-h' | 'splitscreen-v';
export type ABSource = 'A' | 'B';
export type BlendMode = 'off' | 'onionskin' | 'flicker' | 'blend';

export interface BlendModeState {
  mode: BlendMode;
  onionOpacity: number;    // 0-1 for onion skin mode
  flickerRate: number;     // Hz for flicker mode (1-30)
  blendRatio: number;      // 0-1 for blend mode (0.5 = 50/50)
}

export const DEFAULT_BLEND_MODE_STATE: BlendModeState = {
  mode: 'off',
  onionOpacity: 0.5,
  flickerRate: 4,
  blendRatio: 0.5,
};

export interface CompareState {
  wipeMode: WipeMode;
  wipePosition: number;
  currentAB: ABSource;
  abAvailable: boolean;
  differenceMatte: DifferenceMatteState;
  blendMode: BlendModeState;
}

export interface ComparisonManagerEvents extends EventMap {
  wipeModeChanged: WipeMode;
  wipePositionChanged: number;
  abSourceChanged: ABSource;
  abToggled: void;
  differenceMatteChanged: DifferenceMatteState;
  blendModeChanged: BlendModeState;
  stateChanged: CompareState;
}

export class ComparisonManager extends EventEmitter<ComparisonManagerEvents> {
  private state: CompareState = {
    wipeMode: 'off',
    wipePosition: 0.5,
    currentAB: 'A',
    abAvailable: false,
    differenceMatte: { ...DEFAULT_DIFFERENCE_MATTE_STATE },
    blendMode: { ...DEFAULT_BLEND_MODE_STATE },
  };
  private flickerInterval: number | null = null;
  private flickerFrame: 0 | 1 = 0;

  // Wipe methods
  setWipeMode(mode: WipeMode): void {
    if (this.state.wipeMode !== mode) {
      this.state.wipeMode = mode;
      this.emit('wipeModeChanged', mode);
      this.emit('stateChanged', { ...this.state });
    }
  }

  cycleWipeMode(): void {
    const modes: WipeMode[] = ['off', 'horizontal', 'vertical', 'splitscreen-h', 'splitscreen-v'];
    const currentIndex = modes.indexOf(this.state.wipeMode);
    const nextMode = modes[(currentIndex + 1) % modes.length]!;
    this.setWipeMode(nextMode);
  }

  getWipeMode(): WipeMode {
    return this.state.wipeMode;
  }

  setWipePosition(position: number): void {
    const clamped = clamp(position, 0, 1);
    if (clamped !== this.state.wipePosition) {
      this.state.wipePosition = clamped;
      this.emit('wipePositionChanged', clamped);
      this.emit('stateChanged', { ...this.state });
    }
  }

  getWipePosition(): number {
    return this.state.wipePosition;
  }

  // A/B methods
  setABSource(source: ABSource): void {
    if (this.state.currentAB !== source) {
      this.state.currentAB = source;
      this.emit('abSourceChanged', source);
      this.emit('stateChanged', { ...this.state });
    }
  }

  toggleAB(): void {
    if (this.state.abAvailable) {
      const newSource = this.state.currentAB === 'A' ? 'B' : 'A';
      this.setABSource(newSource);
      this.emit('abToggled', undefined);
    }
  }

  getABSource(): ABSource {
    return this.state.currentAB;
  }

  setABAvailable(available: boolean): void {
    if (this.state.abAvailable !== available) {
      this.state.abAvailable = available;
    }
  }

  isABAvailable(): boolean {
    return this.state.abAvailable;
  }

  // Difference Matte methods
  toggleDifferenceMatte(): void {
    this.state.differenceMatte.enabled = !this.state.differenceMatte.enabled;
    // When enabling difference matte, disable wipe mode to avoid conflicts
    if (this.state.differenceMatte.enabled && this.state.wipeMode !== 'off') {
      this.state.wipeMode = 'off';
      this.emit('wipeModeChanged', 'off');
    }
    this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
    this.emit('stateChanged', { ...this.state });
  }

  setDifferenceMatteEnabled(enabled: boolean): void {
    if (this.state.differenceMatte.enabled !== enabled) {
      this.state.differenceMatte.enabled = enabled;
      // When enabling difference matte, disable wipe mode to avoid conflicts
      if (enabled && this.state.wipeMode !== 'off') {
        this.state.wipeMode = 'off';
        this.emit('wipeModeChanged', 'off');
      }
      this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
      this.emit('stateChanged', { ...this.state });
    }
  }

  setDifferenceMatteGain(gain: number): void {
    const clamped = clamp(gain, 1.0, 10.0);
    if (clamped !== this.state.differenceMatte.gain) {
      this.state.differenceMatte.gain = clamped;
      this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
      this.emit('stateChanged', { ...this.state });
    }
  }

  toggleDifferenceMatteHeatmap(): void {
    this.state.differenceMatte.heatmap = !this.state.differenceMatte.heatmap;
    this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
    this.emit('stateChanged', { ...this.state });
  }

  setDifferenceMatteHeatmap(enabled: boolean): void {
    if (this.state.differenceMatte.heatmap !== enabled) {
      this.state.differenceMatte.heatmap = enabled;
      this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
      this.emit('stateChanged', { ...this.state });
    }
  }

  getDifferenceMatteState(): DifferenceMatteState {
    return { ...this.state.differenceMatte };
  }

  isDifferenceMatteEnabled(): boolean {
    return this.state.differenceMatte.enabled;
  }

  // Blend Mode methods

  /**
   * Toggle a blend mode on/off.
   * If the specified mode is already active, turns it off.
   * Otherwise, activates the specified mode.
   */
  toggleBlendMode(mode: BlendMode): void {
    if (this.state.blendMode.mode === mode) {
      this.setBlendMode('off');
    } else {
      this.setBlendMode(mode);
    }
  }

  /**
   * Set the active blend mode.
   * Automatically disables wipe mode and difference matte when enabling a blend mode.
   */
  setBlendMode(mode: BlendMode): void {
    if (this.state.blendMode.mode !== mode) {
      const previousMode = this.state.blendMode.mode;
      this.state.blendMode.mode = mode;

      // Stop flicker if switching away from it
      if (previousMode === 'flicker') {
        this.stopFlicker();
      }

      // Start flicker if switching to it
      if (mode === 'flicker') {
        this.startFlicker();
      }

      // When enabling a blend mode, disable wipe and difference matte to avoid conflicts
      if (mode !== 'off') {
        if (this.state.wipeMode !== 'off') {
          this.state.wipeMode = 'off';
          this.emit('wipeModeChanged', 'off');
        }
        if (this.state.differenceMatte.enabled) {
          this.state.differenceMatte.enabled = false;
          this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
        }
      }

      this.emit('blendModeChanged', { ...this.state.blendMode });
      this.emit('stateChanged', { ...this.state });
    }
  }

  getBlendMode(): BlendMode {
    return this.state.blendMode.mode;
  }

  getBlendModeState(): BlendModeState {
    return { ...this.state.blendMode };
  }

  /**
   * Set the opacity for onion skin blend mode.
   */
  setOnionOpacity(opacity: number): void {
    const clamped = clamp(opacity, 0, 1);
    if (clamped !== this.state.blendMode.onionOpacity) {
      this.state.blendMode.onionOpacity = clamped;
      this.emit('blendModeChanged', { ...this.state.blendMode });
      this.emit('stateChanged', { ...this.state });
    }
  }

  getOnionOpacity(): number {
    return this.state.blendMode.onionOpacity;
  }

  /**
   * Set the flicker rate for flicker blend mode.
   */
  setFlickerRate(rate: number): void {
    const clamped = clamp(Math.round(rate), 1, 30);
    if (clamped !== this.state.blendMode.flickerRate) {
      this.state.blendMode.flickerRate = clamped;
      // Restart flicker with new rate if active
      if (this.state.blendMode.mode === 'flicker') {
        this.stopFlicker();
        this.startFlicker();
      }
      this.emit('blendModeChanged', { ...this.state.blendMode });
      this.emit('stateChanged', { ...this.state });
    }
  }

  getFlickerRate(): number {
    return this.state.blendMode.flickerRate;
  }

  private startFlicker(): void {
    if (this.flickerInterval !== null) return;
    const intervalMs = 1000 / this.state.blendMode.flickerRate;
    this.flickerInterval = window.setInterval(() => {
      this.flickerFrame = this.flickerFrame === 0 ? 1 : 0;
      this.emit('blendModeChanged', { ...this.state.blendMode });
    }, intervalMs);
  }

  private stopFlicker(): void {
    if (this.flickerInterval !== null) {
      window.clearInterval(this.flickerInterval);
      this.flickerInterval = null;
      this.flickerFrame = 0;
    }
  }

  /**
   * Get the current flicker frame (for rendering).
   * Alternates between 0 (show A) and 1 (show B) at the flicker rate.
   */
  getFlickerFrame(): 0 | 1 {
    return this.flickerFrame;
  }

  /**
   * Set the blend ratio for blend mode.
   */
  setBlendRatio(ratio: number): void {
    const clamped = clamp(ratio, 0, 1);
    if (clamped !== this.state.blendMode.blendRatio) {
      this.state.blendMode.blendRatio = clamped;
      this.emit('blendModeChanged', { ...this.state.blendMode });
      this.emit('stateChanged', { ...this.state });
    }
  }

  getBlendRatio(): number {
    return this.state.blendMode.blendRatio;
  }

  getState(): CompareState {
    return { ...this.state };
  }

  /**
   * Get wipe state for WipeControl compatibility
   */
  getWipeState(): { mode: WipeMode; position: number; showOriginal: 'left' | 'right' | 'top' | 'bottom' } {
    let showOriginal: 'left' | 'right' | 'top' | 'bottom' = 'left';
    if (this.state.wipeMode === 'horizontal' || this.state.wipeMode === 'splitscreen-h') {
      showOriginal = 'left';
    } else {
      showOriginal = 'top';
    }
    return {
      mode: this.state.wipeMode,
      position: this.state.wipePosition,
      showOriginal,
    };
  }

  /**
   * Check if split screen mode is active
   */
  isSplitScreenMode(): boolean {
    return this.state.wipeMode === 'splitscreen-h' || this.state.wipeMode === 'splitscreen-v';
  }

  /**
   * Toggle split screen mode (cycles between off, horizontal split, vertical split)
   */
  toggleSplitScreen(): void {
    if (this.state.wipeMode === 'off' || this.state.wipeMode === 'horizontal' || this.state.wipeMode === 'vertical') {
      this.setWipeMode('splitscreen-h');
    } else if (this.state.wipeMode === 'splitscreen-h') {
      this.setWipeMode('splitscreen-v');
    } else {
      this.setWipeMode('off');
    }
  }

  /**
   * Check if any comparison feature is active.
   */
  isActive(): boolean {
    return this.state.wipeMode !== 'off' ||
           (this.state.currentAB === 'B' && this.state.abAvailable) ||
           this.state.differenceMatte.enabled ||
           this.state.blendMode.mode !== 'off';
  }

  /**
   * Clean up flicker interval.
   */
  dispose(): void {
    this.stopFlicker();
  }
}
