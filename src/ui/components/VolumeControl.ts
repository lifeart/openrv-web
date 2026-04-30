import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';

export interface VolumeState {
  volume: number; // 0-1
  muted: boolean;
}

export interface VolumeControlEvents extends EventMap {
  volumeChanged: number;
  mutedChanged: boolean;
  audioScrubChanged: boolean;
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
  private _audioScrubEnabled = true;
  private _cleanupA11yFocus: (() => void) | null = null;
  private scrubToggle: HTMLLabelElement | null = null;
  private scrubCheckbox: HTMLInputElement | null = null;

  constructor() {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'volume-control-container';
    this.container.dataset.testid = 'volume-control';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: 8px;
    `;

    // Create mute button
    this.muteButton = document.createElement('button');
    this.updateMuteButton();
    this.muteButton.dataset.testid = 'mute-button';
    this.muteButton.title = 'Toggle mute (Shift+M in video mode)';
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
    });
    // Expand slider on focus (keyboard a11y — Tab into mute button reveals slider)
    this.muteButton.addEventListener('focus', () => {
      this.volumeContainer.style.width = '160px';
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
    this.volumeSlider.dataset.testid = 'volume-slider';
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

    // Create audio scrub toggle
    this.scrubCheckbox = document.createElement('input');
    this.scrubCheckbox.type = 'checkbox';
    this.scrubCheckbox.checked = this._audioScrubEnabled;
    this.scrubCheckbox.id = 'volume-scrub-toggle';
    this.scrubCheckbox.style.cssText = `
      margin: 0 4px 0 0;
      cursor: pointer;
      accent-color: var(--accent-primary);
    `;

    this.scrubToggle = document.createElement('label');
    this.scrubToggle.htmlFor = 'volume-scrub-toggle';
    this.scrubToggle.style.cssText = `
      display: flex;
      align-items: center;
      font-size: 10px;
      color: var(--text-muted);
      cursor: pointer;
      white-space: nowrap;
      margin-left: 4px;
      user-select: none;
    `;
    this.scrubToggle.title = 'Enable/disable audio scrub during frame stepping';
    this.scrubToggle.appendChild(this.scrubCheckbox);
    this.scrubToggle.appendChild(document.createTextNode('Scrub'));

    this.scrubCheckbox.addEventListener('change', () => {
      this._audioScrubEnabled = this.scrubCheckbox!.checked;
      this.emit('audioScrubChanged', this._audioScrubEnabled);
    });

    this.volumeContainer.appendChild(this.volumeSlider);
    this.volumeContainer.appendChild(this.scrubToggle);

    // Show slider on hover
    this.container.addEventListener('pointerenter', () => {
      this.volumeContainer.style.width = '160px';
    });

    this.container.addEventListener('pointerleave', () => {
      if (!this.container.contains(document.activeElement)) {
        this.volumeContainer.style.width = '0';
      }
    });

    // Collapse slider when focus leaves the volume control area (keyboard a11y)
    this.container.addEventListener('focusout', (e: FocusEvent) => {
      const relatedTarget = e.relatedTarget as Node | null;
      if (relatedTarget && this.container.contains(relatedTarget)) {
        return; // Focus moved within the control, keep expanded
      }
      this.volumeContainer.style.width = '0';
    });

    // Disclosure is fully handled by hover/focus (pointerenter/pointerleave/
    // focus/focusout). No outside-click dismiss is needed because the slider
    // collapses automatically when pointer or focus leaves the control.

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

  /** Returns whether the slider is currently expanded (visible). */
  isSliderExpanded(): boolean {
    const w = this.volumeContainer.style.width;
    return w !== '0' && w !== '0px' && w !== '';
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

  /**
   * Sync audio scrub enabled state from external source without emitting events.
   */
  syncAudioScrub(enabled: boolean): void {
    this._audioScrubEnabled = enabled;
    if (this.scrubCheckbox) {
      this.scrubCheckbox.checked = enabled;
    }
  }

  /**
   * Set whether the scrub audio toggle is available (grayed out when audio buffer unavailable).
   */
  setScrubAudioAvailable(available: boolean): void {
    if (this.scrubCheckbox) {
      this.scrubCheckbox.disabled = !available;
    }
    if (this.scrubToggle) {
      this.scrubToggle.style.opacity = available ? '1' : '0.5';
      this.scrubToggle.title = available
        ? 'Enable/disable audio scrub during frame stepping'
        : 'Audio scrub requires decoded audio data';
    }
  }

  /** Whether audio scrub is currently enabled in this control. */
  isAudioScrubEnabled(): boolean {
    return this._audioScrubEnabled;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this._cleanupA11yFocus?.();
    this._cleanupA11yFocus = null;
  }
}
