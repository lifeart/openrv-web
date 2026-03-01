/**
 * VirtualSliderController - Key-hold-to-adjust virtual slider system.
 *
 * Implements a state machine (IDLE -> ARMED -> ACTIVE -> LOCKED) that
 * allows users to hold a key (E/Y/B/H/S/K) and drag the mouse
 * horizontally to adjust color parameters in real time.
 */

import type { ColorControls } from './ColorControls';
import type { KeyboardManager } from '../../utils/input/KeyboardManager';
import { VirtualSliderHUD } from './VirtualSliderHUD';
import {
  VirtualSliderState,
  VIRTUAL_SLIDER_PARAMS,
  VIRTUAL_SLIDER_KEYS,
  VIRTUAL_SLIDER_ACTIVE_KEYS,
  ARMED_TIMEOUT_MS,
  ARMED_DEAD_ZONE_PX,
  FINE_ADJUSTMENT_MULTIPLIER,
  MOVEMENT_X_CLAMP,
  type VirtualSliderParam,
} from './VirtualSliderConfig';
import { getGlobalHistoryManager } from '../../utils/HistoryManager';
import type { ColorAdjustments } from '../../core/types/color';

/**
 * Optional context for checking whether the viewer is in the middle
 * of another interaction (pan, paint stroke, etc.).
 */
export interface ViewerInteractionQuery {
  isInteracting(): boolean;
}

export class VirtualSliderController {
  private state: VirtualSliderState = VirtualSliderState.IDLE;
  private activeParam: VirtualSliderParam | null = null;
  private activatorCode: string | null = null;
  private currentValue = 0;
  private preActivationValue = 0;
  private preActivationAdjustments: ColorAdjustments | null = null;

  // Cumulative mouse displacement during ARMED state
  private armedCumulativeDisplacement = 0;
  // Timer for auto-transition from ARMED -> ACTIVE
  private armedTimer: ReturnType<typeof setTimeout> | null = null;

  // Numeric entry buffer
  private numericBuffer: string | null = null;

  // rAF coalescing
  private pendingDelta = 0;
  private rafId: number | null = null;

  // Components
  private hud: VirtualSliderHUD;
  private colorControls: ColorControls;
  private keyboardManager: KeyboardManager;
  private viewerQuery: ViewerInteractionQuery | null = null;

  // Container for pointer events
  private container: HTMLElement;

  // Bound event handlers (for cleanup)
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundBlur: () => void;
  private boundVisibilityChange: () => void;

  private disposed = false;

  constructor(opts: {
    colorControls: ColorControls;
    container: HTMLElement;
    keyboardManager: KeyboardManager;
    viewerQuery?: ViewerInteractionQuery;
  }) {
    this.colorControls = opts.colorControls;
    this.container = opts.container;
    this.keyboardManager = opts.keyboardManager;
    this.viewerQuery = opts.viewerQuery ?? null;
    this.hud = new VirtualSliderHUD(opts.container);

    // Bind event handlers
    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundBlur = this.onBlur.bind(this);
    this.boundVisibilityChange = this.onVisibilityChange.bind(this);

    // Attach listeners at capture phase so we can intercept before KeyboardManager
    document.addEventListener('keydown', this.boundKeyDown, true);
    document.addEventListener('keyup', this.boundKeyUp, true);
    this.container.addEventListener('pointermove', this.boundPointerMove);
    // Listen for mouse button press to cancel during ACTIVE/LOCKED
    this.container.addEventListener('pointerdown', this.boundPointerDown);

    // State leak prevention
    window.addEventListener('blur', this.boundBlur);
    document.addEventListener('visibilitychange', this.boundVisibilityChange);
  }

  /**
   * Get the current state of the virtual slider.
   */
  getState(): VirtualSliderState {
    return this.state;
  }

  /**
   * Get the currently active parameter, or null if IDLE.
   */
  getActiveParam(): VirtualSliderParam | null {
    return this.activeParam;
  }

  /**
   * Get the current value being adjusted.
   */
  getCurrentValue(): number {
    return this.currentValue;
  }

  /**
   * Get the numeric entry buffer, or null if not in numeric entry mode.
   */
  getNumericBuffer(): string | null {
    return this.numericBuffer;
  }

  /**
   * Dispose all resources and event listeners.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Cancel any active interaction
    if (this.state !== VirtualSliderState.IDLE) {
      this.cancel();
    }

    // Remove event listeners
    document.removeEventListener('keydown', this.boundKeyDown, true);
    document.removeEventListener('keyup', this.boundKeyUp, true);
    this.container.removeEventListener('pointermove', this.boundPointerMove);
    this.container.removeEventListener('pointerdown', this.boundPointerDown);
    window.removeEventListener('blur', this.boundBlur);
    document.removeEventListener('visibilitychange', this.boundVisibilityChange);

    // Cancel rAF
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Clear armed timer
    if (this.armedTimer !== null) {
      clearTimeout(this.armedTimer);
      this.armedTimer = null;
    }

    this.hud.dispose();
  }

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  private onKeyDown(e: KeyboardEvent): void {
    if (this.disposed) return;

    // Ignore repeat events from held keys
    if (e.repeat) {
      // During ACTIVE/LOCKED, consume repeat events to prevent other shortcuts
      if (this.state === VirtualSliderState.ACTIVE || this.state === VirtualSliderState.LOCKED) {
        e.stopPropagation();
        e.preventDefault();
      }
      return;
    }

    // During ACTIVE or LOCKED: intercept ALL keys
    if (this.state === VirtualSliderState.ACTIVE || this.state === VirtualSliderState.LOCKED) {
      this.handleActiveKeyDown(e);
      return;
    }

    // During ARMED: if a different activator key is pressed, switch to it
    if (this.state === VirtualSliderState.ARMED) {
      if (VIRTUAL_SLIDER_KEYS.has(e.code) && e.code !== this.activatorCode) {
        // Switch to new parameter
        this.clearArmedState();
        this.keyboardManager.releaseKey(this.activatorCode!);
        this.armKey(e);
        return;
      }
      // If any non-activator key is pressed during ARMED, let it through
      // (the armed state only suppresses the activator key)
      return;
    }

    // IDLE: check if this is an activator key
    if (this.state === VirtualSliderState.IDLE && VIRTUAL_SLIDER_KEYS.has(e.code)) {
      // Skip if modifier keys are held (Ctrl, Alt, Meta) - allow normal shortcuts
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // Skip if typing in an input field
      if (this.isInputElement(e.target)) return;

      // Skip if the viewer is in another interaction
      if (this.viewerQuery?.isInteracting()) return;

      this.armKey(e);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (this.disposed) return;

    if (this.state === VirtualSliderState.ARMED && e.code === this.activatorCode) {
      // Key released during ARMED window -> let the original shortcut fire
      this.clearArmedState();
      this.keyboardManager.releaseKey(this.activatorCode!);
      this.activatorCode = null;
      this.activeParam = null;
      this.state = VirtualSliderState.IDLE;
      return;
    }

    if (this.state === VirtualSliderState.ACTIVE && e.code === this.activatorCode) {
      // Key released during ACTIVE -> commit the value
      this.commit();
      return;
    }

    // In LOCKED state, releasing the activator key does nothing (that's the point of lock)
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.disposed) return;

    // Early return for touch devices
    if (e.pointerType === 'touch') return;

    if (this.state === VirtualSliderState.ARMED) {
      // Accumulate displacement
      this.armedCumulativeDisplacement += Math.abs(e.movementX);
      if (this.armedCumulativeDisplacement >= ARMED_DEAD_ZONE_PX) {
        this.transitionToActive();
        // Process the initial movement
        this.accumulateDelta(e);
      }
      return;
    }

    if (this.state === VirtualSliderState.ACTIVE || this.state === VirtualSliderState.LOCKED) {
      this.accumulateDelta(e);
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.disposed) return;
    if (e.pointerType === 'touch') return;

    // Cancel during ACTIVE/LOCKED on any mouse button press
    if (this.state === VirtualSliderState.ACTIVE || this.state === VirtualSliderState.LOCKED) {
      this.cancel();
    }
    // Cancel ARMED state on mouse click too
    if (this.state === VirtualSliderState.ARMED) {
      this.clearArmedState();
      this.keyboardManager.releaseKey(this.activatorCode!);
      this.activatorCode = null;
      this.activeParam = null;
      this.state = VirtualSliderState.IDLE;
    }
  }

  private onBlur(): void {
    if (this.state !== VirtualSliderState.IDLE) {
      this.cancel();
    }
  }

  private onVisibilityChange(): void {
    if (document.hidden && this.state !== VirtualSliderState.IDLE) {
      this.cancel();
    }
  }

  // -----------------------------------------------------------------------
  // ARMED -> ACTIVE transition
  // -----------------------------------------------------------------------

  private armKey(e: KeyboardEvent): void {
    const param = VIRTUAL_SLIDER_PARAMS[e.code];
    if (!param) return;

    this.state = VirtualSliderState.ARMED;
    this.activatorCode = e.code;
    this.activeParam = param;
    this.armedCumulativeDisplacement = 0;

    // Suppress the activator key in KeyboardManager
    this.keyboardManager.suppressKey(e.code);

    // Prevent the default action for this key
    e.stopPropagation();
    e.preventDefault();

    // Start the auto-transition timer
    this.armedTimer = setTimeout(() => {
      this.armedTimer = null;
      if (this.state === VirtualSliderState.ARMED) {
        this.transitionToActive();
      }
    }, ARMED_TIMEOUT_MS);
  }

  private clearArmedState(): void {
    if (this.armedTimer !== null) {
      clearTimeout(this.armedTimer);
      this.armedTimer = null;
    }
    this.armedCumulativeDisplacement = 0;
  }

  private transitionToActive(): void {
    this.clearArmedState();

    if (!this.activeParam) return;

    // Capture the pre-activation value
    const adjustments = this.colorControls.getAdjustments();
    this.preActivationAdjustments = { ...adjustments };
    this.preActivationValue = adjustments[this.activeParam.key] as number;
    this.currentValue = this.preActivationValue;
    this.numericBuffer = null;

    // Suppress history in ColorControls
    this.colorControls.suppressHistory = true;

    // Suppress ALL keys during ACTIVE state
    this.keyboardManager.suppressAllKeys(true);

    // Change state
    this.state = VirtualSliderState.ACTIVE;

    // Change cursor
    this.container.style.cursor = 'ew-resize';

    // Show HUD
    this.hud.show(this.activeParam, this.currentValue);
  }

  // -----------------------------------------------------------------------
  // Key handling during ACTIVE/LOCKED
  // -----------------------------------------------------------------------

  private handleActiveKeyDown(e: KeyboardEvent): void {
    // Always prevent propagation during ACTIVE/LOCKED
    e.stopPropagation();
    e.preventDefault();

    const code = e.code;

    // Check if this is a key we process
    if (!VIRTUAL_SLIDER_ACTIVE_KEYS.has(code) && code !== this.activatorCode) {
      // Consume but ignore unrecognized keys
      return;
    }

    // Escape -> cancel
    if (code === 'Escape') {
      this.cancel();
      return;
    }

    // L -> toggle lock
    if (code === 'KeyL') {
      if (this.state === VirtualSliderState.ACTIVE) {
        this.state = VirtualSliderState.LOCKED;
        this.updateHUD();
      } else if (this.state === VirtualSliderState.LOCKED) {
        this.commit();
      }
      return;
    }

    // Enter -> commit (works in both ACTIVE and LOCKED, and confirms numeric entry)
    if (code === 'Enter' || code === 'NumpadEnter') {
      if (this.numericBuffer !== null) {
        this.applyNumericEntry();
      }
      this.commit();
      return;
    }

    // +/- keys -> fine increment/decrement
    // Equal and NumpadAdd always do fine increment.
    // NumpadSubtract always does fine decrement.
    // Minus (main keyboard) starts numeric entry with a leading '-' when no
    // buffer exists, or does fine decrement if a buffer is already active.
    if (code === 'Equal' || code === 'NumpadAdd') {
      this.applyFineStep(1);
      return;
    }
    if (code === 'NumpadSubtract' && this.numericBuffer === null) {
      this.applyFineStep(-1);
      return;
    }

    // Backspace -> delete last character of numeric buffer
    if (code === 'Backspace') {
      if (this.numericBuffer !== null && this.numericBuffer.length > 0) {
        this.numericBuffer = this.numericBuffer.slice(0, -1);
        if (this.numericBuffer.length === 0) {
          this.numericBuffer = null;
        }
        this.updateHUD();
      }
      return;
    }

    // Shift -> handled via e.shiftKey in pointer move, no action needed here
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      return;
    }

    // Digit keys and period/minus -> numeric entry
    if (this.isNumericEntryKey(code)) {
      this.handleNumericKey(e);
      return;
    }
  }

  // -----------------------------------------------------------------------
  // Numeric entry
  // -----------------------------------------------------------------------

  private isNumericEntryKey(code: string): boolean {
    return /^(Digit[0-9]|Numpad[0-9]|Period|NumpadDecimal|Minus|NumpadSubtract)$/.test(code);
  }

  private handleNumericKey(e: KeyboardEvent): void {
    if (!this.activeParam) return;

    const code = e.code;
    let char = '';

    if (code.startsWith('Digit')) {
      char = code.charAt(5);
    } else if (code.startsWith('Numpad') && code !== 'NumpadDecimal' && code !== 'NumpadSubtract') {
      char = code.charAt(6);
    } else if (code === 'Period' || code === 'NumpadDecimal') {
      char = '.';
    } else if (code === 'Minus' || code === 'NumpadSubtract') {
      char = '-';
    }

    if (!char) return;

    // Initialize or append to buffer
    if (this.numericBuffer === null) {
      this.numericBuffer = '';
    }

    // Validate: only one period, minus only at start
    if (char === '.' && this.numericBuffer.includes('.')) return;
    if (char === '-' && this.numericBuffer.length > 0) return;

    this.numericBuffer += char;
    this.updateHUD();
  }

  private applyNumericEntry(): void {
    if (this.numericBuffer === null || !this.activeParam) return;

    const parsed = parseFloat(this.numericBuffer);
    if (Number.isFinite(parsed)) {
      this.currentValue = Math.max(this.activeParam.min, Math.min(this.activeParam.max, parsed));
      this.applyValue();
    }
    this.numericBuffer = null;
  }

  // -----------------------------------------------------------------------
  // Value computation
  // -----------------------------------------------------------------------

  private applyFineStep(direction: number): void {
    if (!this.activeParam) return;
    this.currentValue += direction * this.activeParam.fineStep;
    this.currentValue = Math.max(this.activeParam.min, Math.min(this.activeParam.max, this.currentValue));
    this.applyValue();
    this.updateHUD();
  }

  private accumulateDelta(e: PointerEvent): void {
    if (!this.activeParam) return;

    let dx = e.movementX;

    // Clamp to prevent browser-quirk jumps
    if (Math.abs(dx) > MOVEMENT_X_CLAMP) {
      dx = 0;
    }

    // Fine adjustment when Shift is held
    const step = e.shiftKey
      ? this.activeParam.coarseStep * FINE_ADJUSTMENT_MULTIPLIER
      : this.activeParam.coarseStep;

    this.pendingDelta += dx * step;

    // Schedule rAF if not already pending
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        if (this.disposed || !this.activeParam) return;
        if (this.pendingDelta === 0) return;

        // Exit numeric entry mode if mouse moves during it
        if (this.numericBuffer !== null) {
          this.numericBuffer = null;
        }

        this.currentValue += this.pendingDelta;
        this.currentValue = Math.max(this.activeParam.min, Math.min(this.activeParam.max, this.currentValue));
        this.pendingDelta = 0;

        this.applyValue();
        this.updateHUD();
      });
    }
  }

  private applyValue(): void {
    if (!this.activeParam) return;
    this.colorControls.setAdjustments({ [this.activeParam.key]: this.currentValue });
  }

  private updateHUD(): void {
    if (!this.activeParam) return;
    this.hud.update(
      this.activeParam,
      this.currentValue,
      this.state === VirtualSliderState.LOCKED,
      this.numericBuffer,
    );
  }

  // -----------------------------------------------------------------------
  // Commit / Cancel
  // -----------------------------------------------------------------------

  /**
   * Commit the current value and record a history entry.
   */
  private commit(): void {
    if (!this.activeParam || !this.preActivationAdjustments) {
      this.resetToIdle();
      return;
    }

    const paramKey = this.activeParam.key;
    const committedValue = this.currentValue;
    const previousAdjustments = { ...this.preActivationAdjustments };
    const previousValue = this.preActivationValue;

    // Only record history if value actually changed
    if (committedValue !== previousValue) {
      const historyManager = getGlobalHistoryManager();
      const description = `Adjust ${this.activeParam.label}`;

      historyManager.recordAction(
        description,
        'color',
        () => {
          // Undo: restore the pre-activation adjustments
          this.colorControls.setAdjustments(previousAdjustments);
        },
        () => {
          // Redo: re-apply the committed value
          this.colorControls.setAdjustments({ [paramKey]: committedValue });
        },
      );
    }

    this.resetToIdle();
  }

  /**
   * Cancel the current interaction and restore the pre-activation value.
   */
  private cancel(): void {
    if (this.preActivationAdjustments && this.activeParam) {
      // Restore the full pre-activation adjustments
      this.colorControls.setAdjustments(this.preActivationAdjustments);
    }
    this.resetToIdle();
  }

  /**
   * Reset the controller to IDLE state, cleaning up all transient state.
   */
  private resetToIdle(): void {
    // Clear armed timer
    this.clearArmedState();

    // Cancel pending rAF
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Clear history suppression
    this.colorControls.suppressHistory = false;

    // Release key suppression
    if (this.activatorCode) {
      this.keyboardManager.releaseKey(this.activatorCode);
    }
    this.keyboardManager.suppressAllKeys(false);

    // Restore cursor
    this.container.style.cursor = '';

    // Hide HUD
    if (this.state === VirtualSliderState.ACTIVE || this.state === VirtualSliderState.LOCKED) {
      this.hud.hide();
    } else {
      this.hud.hideImmediate();
    }

    // Reset state
    this.state = VirtualSliderState.IDLE;
    this.activeParam = null;
    this.activatorCode = null;
    this.currentValue = 0;
    this.preActivationValue = 0;
    this.preActivationAdjustments = null;
    this.numericBuffer = null;
    this.pendingDelta = 0;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private isInputElement(el: EventTarget | null): boolean {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return true;
    }
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      return true;
    }
    return false;
  }
}
