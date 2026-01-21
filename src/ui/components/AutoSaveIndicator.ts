/**
 * Auto-Save Indicator
 *
 * Displays the current auto-save status in the header bar.
 * Shows saving animation, last saved time, and unsaved changes indicator.
 */

import { getIconSvg } from './shared/Icons';
import type { AutoSaveManager } from '../../core/session/AutoSaveManager';

/** Auto-save status */
export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'disabled';

/**
 * AutoSaveIndicator component
 */
export class AutoSaveIndicator {
  private container: HTMLElement;
  private iconElement: HTMLElement;
  private textElement: HTMLElement;
  private status: AutoSaveStatus = 'idle';
  private lastSavedTime: Date | null = null;
  private hasUnsavedChanges = false;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private statusResetTimer: ReturnType<typeof setTimeout> | null = null;
  private connectedManager: AutoSaveManager | null = null;
  private boundEventHandlers: {
    saving: () => void;
    saved: (data: { entry: { savedAt: string } }) => void;
    error: () => void;
    configChanged: (config: { enabled: boolean }) => void;
  } | null = null;
  private onRetryCallback: (() => void) | null = null;
  private boundClickHandler: () => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'autosave-indicator';
    this.container.dataset.testid = 'autosave-indicator';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      font-size: 11px;
      color: var(--text-muted, #888);
      border-radius: 4px;
      cursor: default;
      user-select: none;
    `;

    this.iconElement = document.createElement('span');
    this.iconElement.className = 'autosave-icon';
    this.iconElement.dataset.testid = 'autosave-icon';
    this.iconElement.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.3s ease;
    `;

    this.textElement = document.createElement('span');
    this.textElement.className = 'autosave-text';
    this.textElement.dataset.testid = 'autosave-text';
    this.textElement.style.cssText = `
      white-space: nowrap;
    `;

    this.container.appendChild(this.iconElement);
    this.container.appendChild(this.textElement);

    // Setup click handler for retry functionality
    this.boundClickHandler = () => this.handleClick();
    this.container.addEventListener('click', this.boundClickHandler);

    // Update display initially
    this.updateDisplay();

    // Start periodic update for relative time display
    this.updateInterval = setInterval(() => this.updateDisplay(), 60000);
  }

  /**
   * Handle click on the indicator (for retry on error)
   */
  private handleClick(): void {
    if (this.status === 'error' && this.onRetryCallback) {
      this.onRetryCallback();
    }
  }

  /**
   * Set callback for retry action
   */
  setRetryCallback(callback: () => void): void {
    this.onRetryCallback = callback;
  }

  /**
   * Connect to an AutoSaveManager instance
   */
  connect(manager: AutoSaveManager): void {
    // Disconnect from previous manager if any
    this.disconnect();

    this.connectedManager = manager;

    // Create bound event handlers so we can unsubscribe later
    this.boundEventHandlers = {
      saving: () => this.setStatus('saving'),
      saved: ({ entry }) => {
        this.lastSavedTime = new Date(entry.savedAt);
        this.hasUnsavedChanges = false;
        this.setStatus('saved');
        this.scheduleStatusReset('idle', 3000);
      },
      error: () => {
        this.setStatus('error');
        this.scheduleStatusReset('idle', 5000);
      },
      configChanged: (config) => {
        if (!config.enabled) {
          this.setStatus('disabled');
        } else if (this.status === 'disabled') {
          this.setStatus('idle');
        }
      },
    };

    // Subscribe to events
    manager.on('saving', this.boundEventHandlers.saving);
    manager.on('saved', this.boundEventHandlers.saved);
    manager.on('error', this.boundEventHandlers.error);
    manager.on('configChanged', this.boundEventHandlers.configChanged);

    // Initial state from manager
    const config = manager.getConfig();
    if (!config.enabled) {
      this.setStatus('disabled');
    }
    this.lastSavedTime = manager.getLastSaveTime();
    this.hasUnsavedChanges = manager.hasUnsavedChanges();
    this.updateDisplay();
  }

  /**
   * Disconnect from the current manager
   */
  private disconnect(): void {
    if (this.connectedManager && this.boundEventHandlers) {
      this.connectedManager.off('saving', this.boundEventHandlers.saving);
      this.connectedManager.off('saved', this.boundEventHandlers.saved);
      this.connectedManager.off('error', this.boundEventHandlers.error);
      this.connectedManager.off('configChanged', this.boundEventHandlers.configChanged);
    }
    this.connectedManager = null;
    this.boundEventHandlers = null;
  }

  /**
   * Schedule a status reset with cleanup of previous timer
   */
  private scheduleStatusReset(targetStatus: AutoSaveStatus, delay: number): void {
    // Clear any existing reset timer
    if (this.statusResetTimer) {
      clearTimeout(this.statusResetTimer);
    }

    this.statusResetTimer = setTimeout(() => {
      if (this.status !== 'disabled') {
        this.setStatus(targetStatus);
      }
      this.statusResetTimer = null;
    }, delay);
  }

  /**
   * Mark that there are unsaved changes
   */
  markUnsaved(): void {
    this.hasUnsavedChanges = true;
    this.updateDisplay();
  }

  /**
   * Set the status
   */
  setStatus(status: AutoSaveStatus): void {
    this.status = status;
    this.updateDisplay();
  }

  /**
   * Get the current status
   */
  getStatus(): AutoSaveStatus {
    return this.status;
  }

  /**
   * Update the visual display
   * Uses CSS variables from ThemeManager for theme-consistent colors
   */
  private updateDisplay(): void {
    switch (this.status) {
      case 'saving':
        this.iconElement.innerHTML = getIconSvg('cloud', 'sm');
        this.iconElement.style.animation = 'pulse 1s ease-in-out infinite';
        this.iconElement.style.color = 'var(--accent-primary, #4a9eff)';
        this.textElement.textContent = 'Saving...';
        this.container.title = 'Auto-saving session';
        this.container.style.cursor = 'default';
        break;

      case 'saved':
        this.iconElement.innerHTML = getIconSvg('cloud-check', 'sm');
        this.iconElement.style.animation = '';
        this.iconElement.style.color = 'var(--success, #6bff6b)';
        this.textElement.textContent = 'Saved';
        this.container.title = `Saved at ${this.formatTime(this.lastSavedTime)}`;
        this.container.style.cursor = 'default';
        break;

      case 'error':
        this.iconElement.innerHTML = getIconSvg('cloud-off', 'sm');
        this.iconElement.style.animation = '';
        this.iconElement.style.color = 'var(--error, #ff6b6b)';
        this.textElement.textContent = 'Save failed';
        this.container.title = 'Auto-save failed - click to retry';
        this.container.style.cursor = 'pointer';
        break;

      case 'disabled':
        this.iconElement.innerHTML = getIconSvg('cloud-off', 'sm');
        this.iconElement.style.animation = '';
        this.iconElement.style.color = 'var(--text-muted, #666)';
        this.textElement.textContent = 'Auto-save off';
        this.container.title = 'Auto-save is disabled';
        this.container.style.cursor = 'default';
        break;

      case 'idle':
      default:
        this.iconElement.innerHTML = getIconSvg('cloud', 'sm');
        this.iconElement.style.animation = '';
        this.container.style.cursor = 'default';

        if (this.hasUnsavedChanges) {
          this.iconElement.style.color = 'var(--warning, #ffbb33)';
          this.textElement.textContent = 'Unsaved';
          this.container.title = 'Unsaved changes will be auto-saved';
        } else if (this.lastSavedTime) {
          this.iconElement.style.color = 'var(--text-muted, #888)';
          this.textElement.textContent = this.formatRelativeTime(this.lastSavedTime);
          this.container.title = `Last saved at ${this.formatTime(this.lastSavedTime)}`;
        } else {
          this.iconElement.style.color = 'var(--text-muted, #888)';
          this.textElement.textContent = '';
          this.container.title = 'Auto-save enabled';
        }
        break;
    }

    // Add CSS animation if not present
    this.ensureAnimationStyles();
  }

  /**
   * Format a date as time string
   */
  private formatTime(date: Date | null): string {
    if (!date) return 'never';
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Format relative time (e.g., "2 min ago")
   */
  private formatRelativeTime(date: Date | null): string {
    if (!date) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));

    if (diffMin < 1) {
      return 'Just now';
    } else if (diffMin === 1) {
      return '1 min ago';
    } else if (diffMin < 60) {
      return `${diffMin} min ago`;
    } else {
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr === 1) {
        return '1 hr ago';
      } else {
        return `${diffHr} hrs ago`;
      }
    }
  }

  /** Style element ID for animation CSS */
  private static readonly STYLE_ID = 'autosave-indicator-styles';

  /**
   * Ensure animation CSS is added to document
   */
  private ensureAnimationStyles(): void {
    if (!document.getElementById(AutoSaveIndicator.STYLE_ID)) {
      const style = document.createElement('style');
      style.id = AutoSaveIndicator.STYLE_ID;
      style.textContent = `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Clean up animation styles if no other indicators exist
   */
  private cleanupAnimationStyles(): void {
    // Only remove if no other autosave indicators exist in the DOM
    const otherIndicators = document.querySelectorAll('.autosave-indicator');
    if (otherIndicators.length === 0) {
      const style = document.getElementById(AutoSaveIndicator.STYLE_ID);
      if (style) {
        style.remove();
      }
    }
  }

  /**
   * Render the component
   */
  render(): HTMLElement {
    return this.container;
  }

  /**
   * Dispose of the component
   */
  dispose(): void {
    // Disconnect from manager (unsubscribe events)
    this.disconnect();

    // Remove click handler
    this.container.removeEventListener('click', this.boundClickHandler);

    // Clear update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Clear status reset timer
    if (this.statusResetTimer) {
      clearTimeout(this.statusResetTimer);
      this.statusResetTimer = null;
    }

    // Clear retry callback
    this.onRetryCallback = null;

    // Remove container from DOM if attached
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    // Clean up shared styles if no other indicators exist
    this.cleanupAnimationStyles();
  }
}
