/**
 * ComparisonManager - Pure logic manager for comparison state
 *
 * Manages comparison state (wipe mode, A/B source, difference matte, blend modes, quad view)
 * with no DOM dependencies. Emits events on state changes so UI components
 * can react accordingly.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { clamp } from '../../utils/math';
import { DifferenceMatteState, DEFAULT_DIFFERENCE_MATTE_STATE } from './DifferenceMatteControl';
import type { WipeMode, StencilBox } from '../../core/types/wipe';
import {
  DEFAULT_STENCIL_BOX,
  computeHorizontalWipeBoxes,
  computeVerticalWipeBoxes,
} from '../../core/types/wipe';

export type { WipeMode };
export type ABSource = 'A' | 'B' | 'C' | 'D';
export type ComparisonBlendMode = 'off' | 'onionskin' | 'flicker' | 'blend';

export interface QuadViewState {
  enabled: boolean;
  /** Source assigned to each quadrant (top-left, top-right, bottom-left, bottom-right) */
  sources: [ABSource, ABSource, ABSource, ABSource];
}

export const DEFAULT_QUAD_VIEW_STATE: QuadViewState = {
  enabled: false,
  sources: ['A', 'B', 'C', 'D'],
};

export interface BlendModeState {
  mode: ComparisonBlendMode;
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
  quadView: QuadViewState;
}

export interface ComparisonManagerEvents extends EventMap {
  wipeModeChanged: WipeMode;
  wipePositionChanged: number;
  abSourceChanged: ABSource;
  abToggled: void;
  differenceMatteChanged: DifferenceMatteState;
  blendModeChanged: BlendModeState;
  quadViewChanged: QuadViewState;
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
    quadView: { enabled: false, sources: [...DEFAULT_QUAD_VIEW_STATE.sources] },
  };
  private flickerInterval: number | null = null;
  private flickerFrame: 0 | 1 = 0;

  // Wipe methods
  setWipeMode(mode: WipeMode): void {
    if (this.state.wipeMode !== mode) {
      this.state.wipeMode = mode;
      // Disable quad view when enabling a wipe mode
      if (mode !== 'off' && this.state.quadView.enabled) {
        this.state.quadView.enabled = false;
        this.emit('quadViewChanged', { enabled: false, sources: [...this.state.quadView.sources] });
      }
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
    // When enabling difference matte, disable wipe mode and quad view to avoid conflicts
    if (this.state.differenceMatte.enabled) {
      if (this.state.wipeMode !== 'off') {
        this.state.wipeMode = 'off';
        this.emit('wipeModeChanged', 'off');
      }
      if (this.state.quadView.enabled) {
        this.state.quadView.enabled = false;
        this.emit('quadViewChanged', { enabled: false, sources: [...this.state.quadView.sources] });
      }
    }
    this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
    this.emit('stateChanged', { ...this.state });
  }

  setDifferenceMatteEnabled(enabled: boolean): void {
    if (this.state.differenceMatte.enabled !== enabled) {
      this.state.differenceMatte.enabled = enabled;
      // When enabling difference matte, disable wipe mode and quad view to avoid conflicts
      if (enabled) {
        if (this.state.wipeMode !== 'off') {
          this.state.wipeMode = 'off';
          this.emit('wipeModeChanged', 'off');
        }
        if (this.state.quadView.enabled) {
          this.state.quadView.enabled = false;
          this.emit('quadViewChanged', { enabled: false, sources: [...this.state.quadView.sources] });
        }
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
  toggleBlendMode(mode: ComparisonBlendMode): void {
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
  setBlendMode(mode: ComparisonBlendMode): void {
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

      // When enabling a blend mode, disable wipe, difference matte, and quad view to avoid conflicts
      if (mode !== 'off') {
        if (this.state.wipeMode !== 'off') {
          this.state.wipeMode = 'off';
          this.emit('wipeModeChanged', 'off');
        }
        if (this.state.differenceMatte.enabled) {
          this.state.differenceMatte.enabled = false;
          this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
        }
        if (this.state.quadView.enabled) {
          this.state.quadView.enabled = false;
          this.emit('quadViewChanged', { enabled: false, sources: [...this.state.quadView.sources] });
        }
      }

      this.emit('blendModeChanged', { ...this.state.blendMode });
      this.emit('stateChanged', { ...this.state });
    }
  }

  getBlendMode(): ComparisonBlendMode {
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

  // Quad View methods

  /**
   * Enable or disable quad view mode.
   * When enabled, disables wipe mode, blend modes, and difference matte.
   */
  setQuadViewEnabled(enabled: boolean): void {
    if (this.state.quadView.enabled !== enabled) {
      this.state.quadView.enabled = enabled;

      if (enabled) {
        // Disable conflicting modes
        if (this.state.wipeMode !== 'off') {
          this.state.wipeMode = 'off';
          this.emit('wipeModeChanged', 'off');
        }
        if (this.state.blendMode.mode !== 'off') {
          const previousMode = this.state.blendMode.mode;
          this.state.blendMode.mode = 'off';
          if (previousMode === 'flicker') {
            this.stopFlicker();
          }
          this.emit('blendModeChanged', { ...this.state.blendMode });
        }
        if (this.state.differenceMatte.enabled) {
          this.state.differenceMatte.enabled = false;
          this.emit('differenceMatteChanged', { ...this.state.differenceMatte });
        }
      }

      this.emit('quadViewChanged', { enabled: this.state.quadView.enabled, sources: [...this.state.quadView.sources] });
      this.emit('stateChanged', { ...this.state });
    }
  }

  /**
   * Toggle quad view on/off.
   */
  toggleQuadView(): void {
    this.setQuadViewEnabled(!this.state.quadView.enabled);
  }

  isQuadViewEnabled(): boolean {
    return this.state.quadView.enabled;
  }

  /**
   * Assign a source to a quadrant (0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right).
   */
  setQuadSource(quadrant: 0 | 1 | 2 | 3, source: ABSource): void {
    if (this.state.quadView.sources[quadrant] !== source) {
      this.state.quadView.sources[quadrant] = source;
      this.emit('quadViewChanged', { enabled: this.state.quadView.enabled, sources: [...this.state.quadView.sources] });
      this.emit('stateChanged', { ...this.state });
    }
  }

  getQuadSources(): [ABSource, ABSource, ABSource, ABSource] {
    return [...this.state.quadView.sources];
  }

  getQuadViewState(): QuadViewState {
    return { enabled: this.state.quadView.enabled, sources: [...this.state.quadView.sources] };
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
   * Compute stencil boxes for two inputs (A and B) based on the current wipe mode/position.
   * Returns [boxA, boxB] where each is [xMin, xMax, yMin, yMax] in normalized 0-1 range.
   * When wipe is off, both boxes cover the full image.
   */
  computeStencilBoxes(): [StencilBox, StencilBox] {
    if (this.state.wipeMode === 'off') {
      return [[...DEFAULT_STENCIL_BOX], [...DEFAULT_STENCIL_BOX]];
    }

    if (this.state.wipeMode === 'horizontal' || this.state.wipeMode === 'splitscreen-h') {
      return computeHorizontalWipeBoxes(this.state.wipePosition);
    }

    if (this.state.wipeMode === 'vertical' || this.state.wipeMode === 'splitscreen-v') {
      return computeVerticalWipeBoxes(this.state.wipePosition);
    }

    return [[...DEFAULT_STENCIL_BOX], [...DEFAULT_STENCIL_BOX]];
  }

  /**
   * Check if any comparison feature is active.
   */
  isActive(): boolean {
    return this.state.wipeMode !== 'off' ||
           (this.state.currentAB === 'B' && this.state.abAvailable) ||
           this.state.differenceMatte.enabled ||
           this.state.blendMode.mode !== 'off' ||
           this.state.quadView.enabled;
  }

  /**
   * Clean up flicker interval.
   */
  dispose(): void {
    this.stopFlicker();
  }
}
