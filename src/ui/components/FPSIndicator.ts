/**
 * FPSIndicator - FPS HUD overlay displayed on the viewer
 *
 * Features:
 * - Shows target FPS alongside measured actual FPS (rolling average)
 * - Color-codes display (green/yellow/red) based on actual-vs-target ratio
 * - Configurable position (top-left, top-right, bottom-left, bottom-right)
 * - Optional dropped frame counter (labeled "skipped" in the UI)
 * - EMA smoothing for display, raw values for color thresholds
 * - Effective target display at non-1x playback speeds
 * - Auto-hides 2 seconds after pause
 */

import { Session } from '../../core/session/Session';
import type { FPSMeasurement } from '../../core/session/PlaybackEngine';
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { DisposableSubscriptionManager } from '../../utils/DisposableSubscriptionManager';
import { getCSSColor } from '../../utils/ui/getCSSColor';
import type { OverlayPosition } from './TimecodeOverlay';
import { getCorePreferencesManager } from '../../core/PreferencesManager';
import type { PreferencesManager } from '../../core/PreferencesManager';

export interface FPSIndicatorState {
  enabled: boolean;
  position: OverlayPosition;
  showDroppedFrames: boolean;
  showTargetFps: boolean;
  backgroundOpacity: number;
  warningThreshold: number;
  criticalThreshold: number;
}

export interface FPSIndicatorEvents extends EventMap {
  stateChanged: FPSIndicatorState;
}

export const DEFAULT_FPS_INDICATOR_STATE: FPSIndicatorState = {
  enabled: true,
  position: 'top-right',
  showDroppedFrames: true,
  showTargetFps: true,
  backgroundOpacity: 0.6,
  warningThreshold: 0.97,
  criticalThreshold: 0.85,
};

/**
 * Compute the color string for a given ratio and thresholds.
 * Uses raw ratio (not EMA-smoothed) for immediate feedback.
 * Colors are resolved from CSS variables (--success, --warning, --error)
 * with hex fallbacks, following the CacheIndicator pattern.
 */
export function getFPSColor(
  ratio: number,
  warningThreshold: number,
  criticalThreshold: number,
): string {
  if (ratio >= warningThreshold) {
    return getCSSColor('--success', '#4ade80'); // green
  } else if (ratio >= criticalThreshold) {
    return getCSSColor('--warning', '#facc15'); // yellow
  } else {
    return getCSSColor('--error', '#ef4444'); // red
  }
}

export class FPSIndicator extends EventEmitter<FPSIndicatorEvents> {
  private container: HTMLElement;
  private wrapper: HTMLElement;
  private actualFpsElement: HTMLElement;
  private targetFpsElement: HTMLElement;
  private droppedElement: HTMLElement;
  private session: Session;
  private state: FPSIndicatorState = { ...DEFAULT_FPS_INDICATOR_STATE };
  private subs = new DisposableSubscriptionManager();
  private preferences: PreferencesManager;

  // Display state
  private displayedFps = 0;
  private lastMeasurement: FPSMeasurement | null = null;
  private hideTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private updateScheduled = false;

  constructor(session: Session, preferences?: PreferencesManager) {
    super();
    this.session = session;
    this.preferences = preferences ?? getCorePreferencesManager();

    // Load initial state from persisted preferences
    const savedPrefs = this.preferences.getFPSIndicatorPrefs();
    this.state = {
      enabled: savedPrefs.enabled,
      position: savedPrefs.position,
      showDroppedFrames: savedPrefs.showDroppedFrames,
      showTargetFps: savedPrefs.showTargetFps,
      backgroundOpacity: savedPrefs.backgroundOpacity,
      warningThreshold: savedPrefs.warningThreshold,
      criticalThreshold: savedPrefs.criticalThreshold,
    };

    // Create overlay container
    this.container = document.createElement('div');
    this.container.className = 'fps-indicator';
    this.container.dataset.testid = 'fps-indicator';
    this.container.style.cssText = `
      position: absolute;
      z-index: 50;
      display: none;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      user-select: none;
      pointer-events: none;
    `;

    // Create inner wrapper with background
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'fps-indicator-wrapper';
    this.wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px 10px;
      border-radius: 4px;
    `;

    // Actual FPS display (color-coded)
    this.actualFpsElement = document.createElement('div');
    this.actualFpsElement.className = 'fps-indicator-actual';
    this.actualFpsElement.dataset.testid = 'fps-indicator-actual';
    this.actualFpsElement.style.cssText = `
      font-size: 16px;
      font-weight: bold;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
      letter-spacing: 0.5px;
    `;

    // Target FPS display (always white/neutral)
    this.targetFpsElement = document.createElement('div');
    this.targetFpsElement.className = 'fps-indicator-target';
    this.targetFpsElement.dataset.testid = 'fps-indicator-target';
    this.targetFpsElement.style.cssText = `
      font-size: 11px;
      color: rgba(255,255,255,0.7);
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    `;

    // Dropped frame counter
    this.droppedElement = document.createElement('div');
    this.droppedElement.className = 'fps-indicator-dropped';
    this.droppedElement.dataset.testid = 'fps-indicator-dropped';
    this.droppedElement.style.cssText = `
      font-size: 10px;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    `;

    this.wrapper.appendChild(this.actualFpsElement);
    this.wrapper.appendChild(this.targetFpsElement);
    this.wrapper.appendChild(this.droppedElement);
    this.container.appendChild(this.wrapper);

    // Apply initial styles
    this.updateStyles();

    // Subscribe to session events
    this.subs.add(
      this.session.on('fpsUpdated', (measurement) => this.onFPSUpdated(measurement))
    );
    this.subs.add(
      this.session.on('playbackChanged', (playing) => this.onPlaybackChanged(playing))
    );
    this.subs.add(
      this.session.on('abSourceChanged', () => this.scheduleUpdate())
    );
  }

  /**
   * Handle FPS measurement updates from the playback engine.
   */
  private onFPSUpdated(measurement: FPSMeasurement): void {
    this.lastMeasurement = measurement;

    // Apply EMA smoothing for display only
    if (this.displayedFps === 0) {
      this.displayedFps = measurement.actualFps;
    } else {
      this.displayedFps = this.displayedFps * 0.5 + measurement.actualFps * 0.5;
    }

    this.scheduleUpdate();
  }

  /**
   * Handle playback state changes (show/hide with delay).
   */
  private onPlaybackChanged(playing: boolean): void {
    if (this.hideTimeoutId !== null) {
      clearTimeout(this.hideTimeoutId);
      this.hideTimeoutId = null;
    }

    if (playing) {
      // Reset displayed fps on play start
      this.displayedFps = 0;
      this.lastMeasurement = null;
      if (this.state.enabled) {
        this.container.style.display = 'block';
      }
    } else {
      // Hide after 2 seconds
      this.hideTimeoutId = setTimeout(() => {
        this.container.style.display = 'none';
        this.hideTimeoutId = null;
      }, 2000);
    }
  }

  /**
   * Schedule a DOM update on the next animation frame.
   */
  private scheduleUpdate(): void {
    if (this.updateScheduled) return;
    this.updateScheduled = true;
    requestAnimationFrame(() => {
      this.updateScheduled = false;
      this.render();
    });
  }

  /**
   * Render the FPS indicator display.
   */
  private render(): void {
    if (!this.state.enabled) return;

    const measurement = this.lastMeasurement;
    if (!measurement) {
      this.actualFpsElement.textContent = '-- fps';
      this.actualFpsElement.style.color = 'rgba(255,255,255,0.7)';
      this.targetFpsElement.textContent = '';
      this.droppedElement.textContent = '';
      return;
    }

    // Color based on RAW ratio (not EMA-smoothed)
    const color = getFPSColor(
      measurement.ratio,
      this.state.warningThreshold,
      this.state.criticalThreshold,
    );

    // Display smoothed FPS value
    const displayFps = this.displayedFps.toFixed(1);
    this.actualFpsElement.textContent = `${displayFps} fps`;
    this.actualFpsElement.style.color = color;

    // Target FPS display
    if (this.state.showTargetFps) {
      if (measurement.playbackSpeed !== 1) {
        const effTarget = Math.round(measurement.effectiveTargetFps);
        const speedStr = Number.isInteger(measurement.playbackSpeed)
          ? `${measurement.playbackSpeed}x`
          : `${measurement.playbackSpeed.toFixed(1)}x`;
        this.targetFpsElement.textContent = `/ ${effTarget} eff. fps (${speedStr})`;
      } else {
        this.targetFpsElement.textContent = `/ ${Math.round(measurement.targetFps)} fps`;
      }
      this.targetFpsElement.style.display = 'block';
    } else {
      this.targetFpsElement.style.display = 'none';
    }

    // Dropped frame counter
    if (this.state.showDroppedFrames) {
      const dropped = measurement.droppedFrames;
      this.droppedElement.textContent = `${dropped} skipped`;
      this.droppedElement.style.color = dropped > 0 ? '#ef4444' : 'rgba(255,255,255,0.5)';
      this.droppedElement.style.display = 'block';
    } else {
      this.droppedElement.style.display = 'none';
    }
  }

  /**
   * Update styles based on current state.
   */
  private updateStyles(): void {
    // Background opacity
    this.wrapper.style.background = `rgba(0, 0, 0, ${this.state.backgroundOpacity})`;

    // Position
    this.container.style.top = '';
    this.container.style.bottom = '';
    this.container.style.left = '';
    this.container.style.right = '';

    switch (this.state.position) {
      case 'top-left':
        this.container.style.top = '16px';
        this.container.style.left = '16px';
        break;
      case 'top-right':
        this.container.style.top = '16px';
        this.container.style.right = '16px';
        break;
      case 'bottom-left':
        this.container.style.bottom = '16px';
        this.container.style.left = '16px';
        break;
      case 'bottom-right':
        this.container.style.bottom = '16px';
        this.container.style.right = '16px';
        break;
    }

    // Visibility (only show when enabled and playing or during hide timeout)
    if (!this.state.enabled) {
      this.container.style.display = 'none';
    }
  }

  /**
   * Toggle overlay visibility.
   */
  toggle(): void {
    this.setState({ enabled: !this.state.enabled });
  }

  /**
   * Enable overlay.
   */
  enable(): void {
    this.setState({ enabled: true });
  }

  /**
   * Disable overlay.
   */
  disable(): void {
    this.setState({ enabled: false });
  }

  /**
   * Set overlay position.
   */
  setPosition(position: OverlayPosition): void {
    this.setState({ position });
  }

  /**
   * Set background opacity (0-1).
   */
  setBackgroundOpacity(opacity: number): void {
    this.setState({ backgroundOpacity: Math.max(0, Math.min(1, opacity)) });
  }

  /**
   * Set the complete state.
   */
  setState(state: Partial<FPSIndicatorState>): void {
    // Validate threshold ordering: warningThreshold must be >= criticalThreshold
    const merged = { ...this.state, ...state };
    if (merged.warningThreshold < merged.criticalThreshold) {
      const tmp = merged.warningThreshold;
      merged.warningThreshold = merged.criticalThreshold;
      merged.criticalThreshold = tmp;
    }
    this.state = merged;
    this.updateStyles();
    this.render();
    this.emit('stateChanged', { ...this.state });

    // Persist state changes to preferences
    this.preferences.setFPSIndicatorPrefs({ ...this.state });
  }

  /**
   * Get current state.
   */
  getState(): FPSIndicatorState {
    return { ...this.state };
  }

  /**
   * Check if overlay is visible (enabled).
   */
  isVisible(): boolean {
    return this.state.enabled;
  }

  /**
   * Get the DOM element for mounting.
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Get the current displayed (EMA-smoothed) FPS value.
   * Useful for testing.
   */
  getDisplayedFps(): number {
    return this.displayedFps;
  }

  /**
   * Get the last raw FPS measurement.
   * Useful for testing.
   */
  getLastMeasurement(): FPSMeasurement | null {
    return this.lastMeasurement;
  }

  /**
   * Dispose all subscriptions and clean up.
   */
  dispose(): void {
    if (this.hideTimeoutId !== null) {
      clearTimeout(this.hideTimeoutId);
      this.hideTimeoutId = null;
    }
    this.subs.dispose();
    this.removeAllListeners();
  }
}
