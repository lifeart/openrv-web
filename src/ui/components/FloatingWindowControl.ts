/**
 * FloatingWindowControl - On-demand floating window violation detection
 *
 * Wraps the FloatingWindowDetector algorithm and provides UI state management.
 * Detection is triggered on-demand (button click), not on every frame change.
 *
 * Events:
 * - detectionComplete: fired after a detection run with the full result
 * - stateChanged: fired whenever any state property changes
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import {
  detectFloatingWindowViolations,
  DEFAULT_FLOATING_WINDOW_OPTIONS,
} from '../../stereo/FloatingWindowDetector';
import type {
  FloatingWindowViolationResult,
  FloatingWindowDetectorOptions,
} from '../../stereo/FloatingWindowDetector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FloatingWindowControlState {
  /** Whether the last detection found a violation */
  hasResult: boolean;
  /** The last detection result (null if never run) */
  lastResult: FloatingWindowViolationResult | null;
  /** Whether detection is currently running */
  detecting: boolean;
}

export const DEFAULT_FLOATING_WINDOW_CONTROL_STATE: FloatingWindowControlState = {
  hasResult: false,
  lastResult: null,
  detecting: false,
};

export interface FloatingWindowControlEvents extends EventMap {
  detectionComplete: FloatingWindowViolationResult;
  stateChanged: FloatingWindowControlState;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class FloatingWindowControl extends EventEmitter<FloatingWindowControlEvents> {
  private state: FloatingWindowControlState = { ...DEFAULT_FLOATING_WINDOW_CONTROL_STATE };
  private options: FloatingWindowDetectorOptions = { ...DEFAULT_FLOATING_WINDOW_OPTIONS };

  /**
   * Run floating window violation detection on the given stereo pair.
   *
   * @param left - Left eye ImageData
   * @param right - Right eye ImageData
   * @returns The violation detection result
   */
  detect(left: ImageData, right: ImageData): FloatingWindowViolationResult {
    this.state.detecting = true;
    this.emitState();

    const result = detectFloatingWindowViolations(left, right, this.options);

    this.state.detecting = false;
    this.state.hasResult = true;
    this.state.lastResult = result;
    this.emit('detectionComplete', result);
    this.emitState();

    return result;
  }

  /**
   * Get the last detection result, or null if detection has never been run.
   */
  getLastResult(): FloatingWindowViolationResult | null {
    return this.state.lastResult;
  }

  /**
   * Whether a result is available.
   */
  hasResult(): boolean {
    return this.state.hasResult;
  }

  /**
   * Whether the last detection found violations.
   */
  hasViolation(): boolean {
    return this.state.lastResult?.hasViolation ?? false;
  }

  /**
   * Whether detection is currently running.
   */
  isDetecting(): boolean {
    return this.state.detecting;
  }

  /**
   * Clear the last detection result.
   */
  clearResult(): void {
    if (this.state.hasResult || this.state.lastResult !== null) {
      this.state.hasResult = false;
      this.state.lastResult = null;
      this.emitState();
    }
  }

  /**
   * Get a copy of the full state.
   */
  getState(): FloatingWindowControlState {
    return {
      ...this.state,
      lastResult: this.state.lastResult ? { ...this.state.lastResult } : null,
    };
  }

  /**
   * Format the last detection result as a human-readable summary string.
   */
  formatResult(result: FloatingWindowViolationResult): string {
    if (!result.hasViolation) {
      return 'No floating window violations detected';
    }
    const edges = result.affectedEdges.join(', ');
    const worst = result.worstDisparity.toFixed(1);
    return `Floating window violation: ${edges} (worst: ${worst}px)`;
  }

  /**
   * Dispose the control: remove all listeners and reset state.
   */
  dispose(): void {
    this.removeAllListeners();
    this.state = { ...DEFAULT_FLOATING_WINDOW_CONTROL_STATE };
  }

  private emitState(): void {
    this.emit('stateChanged', this.getState());
  }
}
