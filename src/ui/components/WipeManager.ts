/**
 * WipeManager - Manages wipe and split-screen comparison state, UI elements,
 * and pointer interaction.
 *
 * Extracted from Viewer.ts to separate the wipe/split concern from the
 * monolithic Viewer class.
 *
 * The manager owns state, DOM elements, and drag logic. Rendering stays in
 * Viewer because it needs deep session/canvas coupling.
 */

import { WipeState, WipeMode, DEFAULT_WIPE_STATE } from './WipeControl';
import {
  createWipeUIElements,
  updateWipeLinePosition,
  isPointerOnWipeLine,
  calculateWipePosition,
  setWipeLabels as setWipeLabelsUtil,
  getWipeLabels as getWipeLabelsUtil,
  WipeUIElements,
} from './ViewerWipe';
import {
  SplitScreenState,
  SplitScreenUIElements,
  createSplitScreenUIElements,
  updateSplitScreenPosition,
  isPointerOnSplitLine,
  calculateSplitPosition,
  isSplitScreenMode,
} from './ViewerSplitScreen';

// Wipe label constants
const DEFAULT_WIPE_LABEL_A = 'Original';
const DEFAULT_WIPE_LABEL_B = 'Graded';

export class WipeManager {
  private _state: WipeState = { ...DEFAULT_WIPE_STATE };
  private _wipeElements: WipeUIElements | null = null;
  private _splitScreenElements: SplitScreenUIElements | null = null;
  private _isDraggingWipe = false;
  private _isDraggingSplit = false;

  // =========================================================================
  // State Access
  // =========================================================================

  get state(): WipeState {
    return this._state;
  }

  get mode(): WipeMode {
    return this._state.mode;
  }

  get position(): number {
    return this._state.position;
  }

  get isOff(): boolean {
    return this._state.mode === 'off';
  }

  get isSplitScreen(): boolean {
    return isSplitScreenMode(this._state.mode);
  }

  get isDragging(): boolean {
    return this._isDraggingWipe || this._isDraggingSplit;
  }

  // =========================================================================
  // State Management
  // =========================================================================

  setState(state: WipeState): void {
    this._state = { ...state };
  }

  getState(): WipeState {
    return { ...this._state };
  }

  resetState(): void {
    this._state = { ...DEFAULT_WIPE_STATE };
  }

  setMode(mode: WipeMode): void {
    this._state.mode = mode;
  }

  setPosition(position: number): void {
    this._state.position = Math.max(0, Math.min(1, position));
  }

  // =========================================================================
  // UI Initialization
  // =========================================================================

  initUI(container: HTMLElement): void {
    this._wipeElements = createWipeUIElements(container);
    this._splitScreenElements = createSplitScreenUIElements(container);
  }

  // =========================================================================
  // DOM Element Access (for isViewerContentElement check)
  // =========================================================================

  get wipeLine(): HTMLElement | null {
    return this._wipeElements?.wipeLine ?? null;
  }

  get splitLine(): HTMLElement | null {
    return this._splitScreenElements?.splitLine ?? null;
  }

  // =========================================================================
  // Label Management
  // =========================================================================

  setLabels(labelA: string, labelB: string): void {
    if (this._wipeElements) {
      setWipeLabelsUtil(this._wipeElements, labelA, labelB);
    }
  }

  getLabels(): { labelA: string; labelB: string } {
    if (this._wipeElements) {
      return getWipeLabelsUtil(this._wipeElements);
    }
    return { labelA: DEFAULT_WIPE_LABEL_A, labelB: DEFAULT_WIPE_LABEL_B };
  }

  // =========================================================================
  // UI Position Updates
  // =========================================================================

  updateWipeLine(
    containerRect: DOMRect,
    canvasRect: DOMRect,
    displayWidth: number,
    displayHeight: number
  ): void {
    if (!this._wipeElements) return;

    // If split screen mode is active, hide the wipe line (split screen has its own UI)
    if (isSplitScreenMode(this._state.mode)) {
      this._wipeElements.wipeLine.style.display = 'none';
      this._wipeElements.wipeLabelA.style.display = 'none';
      this._wipeElements.wipeLabelB.style.display = 'none';
      return;
    }

    updateWipeLinePosition(
      this._state,
      this._wipeElements,
      containerRect,
      canvasRect,
      displayWidth,
      displayHeight
    );
  }

  updateSplitScreenLine(
    containerRect: DOMRect,
    canvasRect: DOMRect,
    displayWidth: number,
    displayHeight: number
  ): void {
    if (!this._splitScreenElements) return;

    // Only update if actually in split screen mode
    if (!isSplitScreenMode(this._state.mode)) {
      // Hide split screen UI when not in split screen mode
      this._splitScreenElements.splitLine.style.display = 'none';
      this._splitScreenElements.labelA.style.display = 'none';
      this._splitScreenElements.labelB.style.display = 'none';
      return;
    }

    // Safe to cast since we validated with isSplitScreenMode
    const splitState: SplitScreenState = {
      mode: this._state.mode as 'splitscreen-h' | 'splitscreen-v',
      position: this._state.position,
    };

    updateSplitScreenPosition(
      splitState,
      this._splitScreenElements,
      containerRect,
      canvasRect,
      displayWidth,
      displayHeight
    );
  }

  // =========================================================================
  // Pointer Interaction
  // =========================================================================

  handlePointerDown(e: PointerEvent): boolean {
    if (this._state.mode === 'off') return false;

    // Handle split screen mode
    if (isSplitScreenMode(this._state.mode) && this._splitScreenElements) {
      const splitRect = this._splitScreenElements.splitLine.getBoundingClientRect();
      const splitState: SplitScreenState = {
        mode: this._state.mode as 'splitscreen-h' | 'splitscreen-v',
        position: this._state.position,
      };
      if (isPointerOnSplitLine(e, splitState, splitRect)) {
        this._isDraggingSplit = true;
        return true;
      }
      return false;
    }

    // Handle regular wipe mode
    if (!this._wipeElements) return false;

    const wipeRect = this._wipeElements.wipeLine.getBoundingClientRect();
    if (isPointerOnWipeLine(e, this._state, wipeRect)) {
      this._isDraggingWipe = true;
      return true;
    }

    return false;
  }

  handlePointerMove(
    e: PointerEvent,
    canvasRect: DOMRect,
    containerRect: DOMRect,
    displayWidth: number,
    displayHeight: number
  ): boolean {
    // Handle split screen dragging
    if (this._isDraggingSplit) {
      const splitState: SplitScreenState = {
        mode: this._state.mode as 'splitscreen-h' | 'splitscreen-v',
        position: this._state.position,
      };
      this._state.position = calculateSplitPosition(
        e,
        splitState,
        canvasRect,
        displayWidth,
        displayHeight
      );
      this.updateSplitScreenLine(containerRect, canvasRect, displayWidth, displayHeight);
      return true;
    }

    // Handle regular wipe dragging
    if (!this._isDraggingWipe) return false;

    this._state.position = calculateWipePosition(
      e,
      this._state,
      canvasRect,
      displayWidth,
      displayHeight
    );
    this.updateWipeLine(containerRect, canvasRect, displayWidth, displayHeight);
    return true;
  }

  handlePointerUp(): void {
    this._isDraggingWipe = false;
    this._isDraggingSplit = false;
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  dispose(): void {
    this._wipeElements = null;
    this._splitScreenElements = null;
  }
}
