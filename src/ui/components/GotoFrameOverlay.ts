/**
 * GotoFrameOverlay - Inline overlay for "Go to frame" text entry.
 *
 * Provides a lightweight inline text input that appears at the bottom-center
 * of the viewer. The user can type a frame number, SMPTE timecode, seconds
 * value, or relative offset. Auto-detection runs on each keystroke and provides
 * real-time feedback. Enter confirms, Escape dismisses.
 *
 * Follows the overlay pattern from TimecodeOverlay but is interactive (has
 * text input and handles keyboard events). Managed directly by App.ts, NOT
 * by OverlayManager.
 */

import { parseFrameInput, getFormatLabel, type FrameInputResult } from '../../utils/media/FrameInputParser';
import { outsideClickRegistry, type OutsideClickDeregister } from '../../utils/ui/OutsideClickRegistry';

/**
 * Minimal session interface used by GotoFrameOverlay.
 * Structural typing allows lightweight test doubles.
 */
export interface GotoFrameSession {
  fps: number;
  frameCount: number;
  currentFrame: number;
  isPlaying: boolean;
  inPoint: number;
  outPoint: number;
  goToFrame(frame: number): void;
  pause(): void;
}

export class GotoFrameOverlay {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private hintLabel: HTMLElement;
  private errorLabel: HTMLElement;
  private titleLabel: HTMLElement;
  private session: GotoFrameSession;
  private visible = false;
  private previousFocus: Element | null = null;
  private deregisterDismiss: OutsideClickDeregister | null = null;
  private startFrame = 0;

  constructor(session: GotoFrameSession) {
    this.session = session;

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'goto-frame-overlay';
    this.container.dataset.testid = 'goto-frame-overlay';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-label', 'Go to frame');
    this.container.style.cssText = `
      position: absolute;
      bottom: 90px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 60;
      display: none;
      flex-direction: column;
      gap: 8px;
      padding: 12px 16px;
      min-width: 260px;
      background: var(--bg-secondary, #1e1e2e);
      border: 1px solid var(--accent-primary, #4a7dff);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      font-family: system-ui, -apple-system, sans-serif;
      transition: opacity 0.15s ease-in-out;
    `;

    // Title
    this.titleLabel = document.createElement('div');
    this.titleLabel.className = 'goto-frame-title';
    this.titleLabel.dataset.testid = 'goto-frame-title';
    this.titleLabel.textContent = 'Go to frame';
    this.titleLabel.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary, #e0e0e0);
      letter-spacing: 0.5px;
    `;
    this.container.appendChild(this.titleLabel);

    // Input
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'goto-frame-input';
    this.input.dataset.testid = 'goto-frame-input';
    this.input.setAttribute('autocomplete', 'off');
    this.input.setAttribute('spellcheck', 'false');
    this.input.style.cssText = `
      width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 16px;
      background: var(--bg-hover, #2a2a3e);
      border: 1px solid var(--bg-active, #3a3a4e);
      border-radius: 4px;
      color: var(--text-primary, #e0e0e0);
      outline: none;
      transition: border-color 0.15s;
    `;
    this.container.appendChild(this.input);

    // Hint label
    this.hintLabel = document.createElement('div');
    this.hintLabel.className = 'goto-frame-hint';
    this.hintLabel.dataset.testid = 'goto-frame-hint';
    this.hintLabel.setAttribute('aria-live', 'polite');
    this.hintLabel.style.cssText = `
      font-size: 11px;
      color: var(--text-muted, #888);
      min-height: 14px;
    `;
    this.container.appendChild(this.hintLabel);

    // Error label (hidden initially)
    this.errorLabel = document.createElement('div');
    this.errorLabel.className = 'goto-frame-error';
    this.errorLabel.dataset.testid = 'goto-frame-error';
    this.errorLabel.setAttribute('aria-live', 'assertive');
    this.errorLabel.style.cssText = `
      font-size: 11px;
      color: var(--error, #ff5555);
      display: none;
      min-height: 14px;
    `;
    this.container.appendChild(this.errorLabel);

    // Set aria-describedby on input
    this.hintLabel.id = 'goto-frame-hint-id';
    this.errorLabel.id = 'goto-frame-error-id';
    this.input.setAttribute('aria-describedby', 'goto-frame-hint-id goto-frame-error-id');

    // Bind input events
    this.input.addEventListener('keydown', this.onKeyDown);
    this.input.addEventListener('input', this.onInput);
  }

  /**
   * Show the overlay, focus the input, and pause playback.
   */
  show(): void {
    if (this.visible) return;

    this.visible = true;
    this.previousFocus = document.activeElement;

    // Pause playback if playing
    if (this.session.isPlaying) {
      this.session.pause();
    }

    // Set placeholder to current frame
    this.input.placeholder = String(this.session.currentFrame);
    this.input.value = '';

    // Update hint with range info
    this.updateHint();

    // Show container
    this.container.style.display = 'flex';
    this.container.style.opacity = '0';

    // Trigger fade-in
    requestAnimationFrame(() => {
      this.container.style.opacity = '1';
    });

    // Focus input
    this.input.focus();

    // Clear error state
    this.clearError();

    // Register click-outside handler via the centralized registry. The
    // overlay also handles Escape on its own input, so we opt out of the
    // registry's Escape handling to avoid double-dismiss / focus surprises.
    this.deregisterDismiss = outsideClickRegistry.register({
      elements: [this.container],
      onDismiss: () => this.hide(),
      dismissOnEscape: false,
    });
  }

  /**
   * Hide the overlay and restore focus.
   */
  hide(): void {
    if (!this.visible) return;

    this.visible = false;
    this.container.style.display = 'none';
    this.input.value = '';

    // Remove click-outside handler
    if (this.deregisterDismiss) {
      this.deregisterDismiss();
      this.deregisterDismiss = null;
    }

    // Restore focus
    if (this.previousFocus && this.previousFocus instanceof HTMLElement) {
      this.previousFocus.focus();
    } else {
      document.body.focus();
    }
    this.previousFocus = null;
  }

  /**
   * Toggle overlay visibility (programmatic only; not user-reachable
   * while input is focused because shouldSkipEvent blocks G key).
   */
  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if the overlay is currently visible.
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Get the root element for mounting into the DOM.
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Set the start timecode offset (for sources with non-zero start timecodes).
   */
  setStartFrame(frame: number): void {
    this.startFrame = frame;
  }

  /**
   * Get the start timecode offset.
   */
  getStartFrame(): number {
    return this.startFrame;
  }

  /**
   * Dispose of the overlay and clean up event listeners.
   */
  dispose(): void {
    this.hide();
    this.input.removeEventListener('keydown', this.onKeyDown);
    this.input.removeEventListener('input', this.onInput);
  }

  // ---- Private methods ----

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
    }
  };

  private readonly onInput = (): void => {
    const value = this.input.value.trim();

    if (value === '') {
      this.updateHint();
      this.clearError();
      return;
    }

    const result = this.parseInput(value);

    if (result.valid) {
      this.showFormatHint(result);
      this.clearError();
    } else if (result.error) {
      this.showError(result.error);
    }
  };

  private handleSubmit(): void {
    const value = this.input.value.trim();

    if (value === '') {
      // Empty input - go to current frame (effectively no-op)
      this.hide();
      return;
    }

    const result = this.parseInput(value);

    if (result.valid) {
      this.session.goToFrame(result.frame);
      this.hide();
    } else {
      // Flash error border
      this.flashError();
      if (result.error) {
        this.showError(result.error);
      }
    }
  }

  private parseInput(value: string): FrameInputResult {
    return parseFrameInput(
      value,
      this.session.fps,
      this.session.currentFrame,
      1,
      this.session.frameCount,
      this.startFrame,
    );
  }

  private updateHint(): void {
    const duration = this.session.frameCount;
    const inPoint = this.session.inPoint;
    const outPoint = this.session.outPoint;

    let hint = `Range: 1 - ${duration} | Press Enter to go`;

    // Show in/out points if they differ from full range
    if (inPoint > 1 || outPoint < duration) {
      hint += ` (In: ${inPoint}, Out: ${outPoint})`;
    }

    this.hintLabel.textContent = hint;
    this.hintLabel.style.display = 'block';
  }

  private showFormatHint(result: FrameInputResult): void {
    const label = getFormatLabel(result.format);
    this.hintLabel.textContent = `${label} \u2192 Frame ${result.frame}`;
    this.hintLabel.style.display = 'block';
    this.errorLabel.style.display = 'none';
  }

  private showError(message: string): void {
    this.errorLabel.textContent = message;
    this.errorLabel.style.display = 'block';
    this.hintLabel.style.display = 'none';
  }

  private clearError(): void {
    this.errorLabel.textContent = '';
    this.errorLabel.style.display = 'none';
    this.hintLabel.style.display = 'block';
  }

  private flashError(): void {
    this.input.style.borderColor = 'var(--error, #ff5555)';
    setTimeout(() => {
      if (this.visible) {
        this.input.style.borderColor = 'var(--bg-active, #3a3a4e)';
      }
    }, 600);
  }
}
