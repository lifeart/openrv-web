import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';

export interface VolumeState {
  volume: number;  // 0-1
  muted: boolean;
}

export interface VolumeControlEvents extends EventMap {
  volumeChanged: number;
  mutedChanged: boolean;
  stateChanged: VolumeState;
}

export class VolumeControl extends EventEmitter<VolumeControlEvents> {
  private container: HTMLElement;
  private muteButton: HTMLButtonElement;
  private volumeSlider: HTMLInputElement;
  private volumeContainer: HTMLElement;

  private _volume = 0.7;
  private _muted = false;
  private _previousVolume = 0.7;
  private _sliderExpanded = false;
  private _boundDocumentClick: (e: MouseEvent) => void;
  private _cleanupA11yFocus: (() => void) | null = null;

  constructor() {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'volume-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: 8px;
    `;

    // Create mute button
    this.muteButton = document.createElement('button');
    this.updateMuteButton();
    this.muteButton.title = 'Toggle mute (M in video mode)';
    this.muteButton.setAttribute('aria-label', 'Toggle mute');
    this.muteButton.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 6px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.12s ease;
      min-width: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      outline: none;
    `;

    this.muteButton.addEventListener('click', () => {
      this.toggleMute();
      this.toggleSliderExpanded();
    });
    this.muteButton.addEventListener('pointerenter', () => {
      this.muteButton.style.background = 'var(--bg-hover)';
      this.muteButton.style.borderColor = 'var(--border-primary)';
      this.muteButton.style.color = 'var(--text-primary)';
    });
    this.muteButton.addEventListener('pointerleave', () => {
      this.muteButton.style.background = 'transparent';
      this.muteButton.style.borderColor = 'transparent';
      this.muteButton.style.color = 'var(--text-muted)';
    });

    // Apply A11Y focus handling
    this._cleanupA11yFocus = applyA11yFocus(this.muteButton);

    // Create volume slider container (shows on hover)
    this.volumeContainer = document.createElement('div');
    this.volumeContainer.style.cssText = `
      display: flex;
      align-items: center;
      overflow: hidden;
      width: 0;
      transition: width 0.2s ease;
    `;

    // Create volume slider
    this.volumeSlider = document.createElement('input');
    this.volumeSlider.type = 'range';
    this.volumeSlider.min = '0';
    this.volumeSlider.max = '1';
    this.volumeSlider.step = '0.01';
    this.volumeSlider.value = String(this._volume);
    this.volumeSlider.style.cssText = `
      width: 80px;
      height: 4px;
      cursor: pointer;
      accent-color: var(--accent-primary);
      margin: 0 8px;
    `;

    this.volumeSlider.addEventListener('input', () => {
      const value = parseFloat(this.volumeSlider.value);
      this.setVolume(value);
    });

    this.volumeContainer.appendChild(this.volumeSlider);

    // Show slider on hover (but don't collapse if pinned open via click)
    this.container.addEventListener('pointerenter', () => {
      this.volumeContainer.style.width = '96px';
    });

    this.container.addEventListener('pointerleave', () => {
      if (!this._sliderExpanded) {
        this.volumeContainer.style.width = '0';
      }
    });

    // Collapse slider when focus leaves the volume control area (keyboard a11y)
    this.container.addEventListener('focusout', (e: FocusEvent) => {
      const relatedTarget = e.relatedTarget as Node | null;
      if (relatedTarget && this.container.contains(relatedTarget)) {
        return; // Focus moved within the control, keep expanded
      }
      if (this._sliderExpanded) {
        this.collapseSlider();
      }
    });

    // Collapse slider when clicking outside the volume control area
    this._boundDocumentClick = (e: MouseEvent) => {
      if (this._sliderExpanded && !this.container.contains(e.target as Node)) {
        this.collapseSlider();
      }
    };
    document.addEventListener('click', this._boundDocumentClick);

    this.container.appendChild(this.muteButton);
    this.container.appendChild(this.volumeContainer);
  }

  private updateMuteButton(): void {
    if (this._muted || this._volume === 0) {
      this.muteButton.innerHTML = getIconSvg('volume-mute', 'sm');
    } else if (this._volume < 0.5) {
      this.muteButton.innerHTML = getIconSvg('volume-low', 'sm');
    } else {
      this.muteButton.innerHTML = getIconSvg('volume-high', 'sm');
    }
  }

  /** Toggle the slider expanded (pinned open) state. */
  private toggleSliderExpanded(): void {
    this._sliderExpanded = !this._sliderExpanded;
    this.volumeContainer.style.width = this._sliderExpanded ? '96px' : '0';
  }

  /** Collapse the slider and clear the expanded flag. */
  private collapseSlider(): void {
    this._sliderExpanded = false;
    this.volumeContainer.style.width = '0';
  }

  /** Returns whether the slider is currently pinned open via click/tap. */
  isSliderExpanded(): boolean {
    return this._sliderExpanded;
  }

  toggleMute(): void {
    if (this._muted) {
      // Unmute - restore previous volume
      this._muted = false;
      this._volume = this._previousVolume || 0.7;
    } else {
      // Mute - save current volume
      this._previousVolume = this._volume;
      this._muted = true;
    }

    this.volumeSlider.value = String(this._muted ? 0 : this._volume);
    this.updateMuteButton();
    this.emit('mutedChanged', this._muted);
    this.emit('stateChanged', this.getState());
  }

  setVolume(value: number): void {
    this._volume = Math.max(0, Math.min(1, value));
    this._muted = this._volume === 0;

    if (this._volume > 0) {
      this._previousVolume = this._volume;
    }

    this.volumeSlider.value = String(this._volume);
    this.updateMuteButton();
    this.emit('volumeChanged', this._volume);
    this.emit('stateChanged', this.getState());
  }

  getVolume(): number {
    return this._muted ? 0 : this._volume;
  }

  isMuted(): boolean {
    return this._muted;
  }

  getState(): VolumeState {
    return {
      volume: this._volume,
      muted: this._muted,
    };
  }

  /**
   * Sync volume from external source (e.g., Session) without emitting events.
   * Use this to update the UI when the Session's volume changes externally.
   */
  syncVolume(value: number): void {
    this._volume = Math.max(0, Math.min(1, value));
    if (this._volume > 0) {
      this._previousVolume = this._volume;
      this._muted = false;
    }
    this.volumeSlider.value = String(this._volume);
    this.updateMuteButton();
  }

  /**
   * Sync muted state from external source (e.g., Session) without emitting events.
   * Use this to update the UI when the Session's muted state changes externally.
   */
  syncMuted(muted: boolean): void {
    this._muted = muted;
    this.volumeSlider.value = String(this._muted ? 0 : this._volume);
    this.updateMuteButton();
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    document.removeEventListener('click', this._boundDocumentClick);
    this._cleanupA11yFocus?.();
    this._cleanupA11yFocus = null;
  }
}
