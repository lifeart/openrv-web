/**
 * Auto-Save Indicator
 *
 * Displays the current auto-save status in the header bar.
 * Shows saving animation, last saved time, and unsaved changes indicator.
 */

import { getIconSvg } from './shared/Icons';
import type { AutoSaveManager } from '../../core/session/AutoSaveManager';
import type { AutoSaveConfig } from '../../core/session/AutoSaveManager';

/** Auto-save status */
export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'disabled';

/** localStorage key for persisted config */
const STORAGE_KEY = 'openrv-autosave-config';

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
    configChanged: (config: { enabled: boolean; interval: number; maxVersions: number }) => void;
  } | null = null;
  private onRetryCallback: (() => void) | null = null;
  private boundClickHandler: () => void;
  private popoverElement: HTMLElement | null = null;
  private boundOutsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private boundEscapeHandler: ((e: KeyboardEvent) => void) | null = null;
  private boundViewportChangeHandler: (() => void) | null = null;

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
   * Handle click on the indicator
   */
  private handleClick(): void {
    if (this.status === 'error' && this.onRetryCallback) {
      this.onRetryCallback();
      return;
    }
    if (this.popoverElement) {
      this.hideSettingsPopover();
    } else {
      this.showSettingsPopover();
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

    // Restore persisted config from localStorage
    const savedConfig = AutoSaveIndicator.loadConfigFromStorage();
    if (savedConfig) {
      manager.setConfig(savedConfig);
    }

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
        this.syncPopoverControls(config);
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
   * Show the settings popover
   */
  private showSettingsPopover(): void {
    if (this.popoverElement || !this.connectedManager) return;

    const config = this.connectedManager.getConfig();

    const popover = document.createElement('div');
    popover.dataset.testid = 'autosave-settings-popover';
    popover.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      padding: 12px;
      background: var(--bg-secondary, #2a2a2a);
      border: 1px solid var(--border-color, #444);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      min-width: 220px;
      max-width: calc(100vw - 16px);
      font-size: 12px;
      color: var(--text-primary, #eee);
    `;

    // Enable/disable toggle
    const enableRow = document.createElement('label');
    enableRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      cursor: pointer;
    `;
    const enableCheckbox = document.createElement('input');
    enableCheckbox.type = 'checkbox';
    enableCheckbox.checked = config.enabled;
    enableCheckbox.dataset.testid = 'autosave-enable-toggle';
    enableCheckbox.addEventListener('change', () => {
      this.applyConfig({ enabled: enableCheckbox.checked });
    });
    enableRow.appendChild(enableCheckbox);
    enableRow.appendChild(document.createTextNode('Enable auto-save'));
    popover.appendChild(enableRow);

    // Interval slider
    const intervalLabel = document.createElement('div');
    intervalLabel.style.cssText = 'margin-bottom: 4px;';
    intervalLabel.dataset.testid = 'autosave-interval-label';
    intervalLabel.textContent = `Interval: ${config.interval} min`;
    popover.appendChild(intervalLabel);

    const intervalSlider = document.createElement('input');
    intervalSlider.type = 'range';
    intervalSlider.min = '1';
    intervalSlider.max = '30';
    intervalSlider.value = String(config.interval);
    intervalSlider.dataset.testid = 'autosave-interval-slider';
    intervalSlider.style.cssText = 'width: 100%; margin-bottom: 12px;';
    intervalSlider.addEventListener('input', () => {
      const val = Number(intervalSlider.value);
      intervalLabel.textContent = `Interval: ${val} min`;
      this.applyConfig({ interval: val });
    });
    popover.appendChild(intervalSlider);

    // Max versions slider
    const versionsLabel = document.createElement('div');
    versionsLabel.style.cssText = 'margin-bottom: 4px;';
    versionsLabel.dataset.testid = 'autosave-versions-label';
    versionsLabel.textContent = `Max versions: ${config.maxVersions}`;
    popover.appendChild(versionsLabel);

    const versionsSlider = document.createElement('input');
    versionsSlider.type = 'range';
    versionsSlider.min = '1';
    versionsSlider.max = '50';
    versionsSlider.value = String(config.maxVersions);
    versionsSlider.dataset.testid = 'autosave-versions-slider';
    versionsSlider.style.cssText = 'width: 100%;';
    versionsSlider.addEventListener('input', () => {
      const val = Number(versionsSlider.value);
      versionsLabel.textContent = `Max versions: ${val}`;
      this.applyConfig({ maxVersions: val });
    });
    popover.appendChild(versionsSlider);

    document.body.appendChild(popover);
    this.popoverElement = popover;
    this.positionSettingsPopover();

    // Close on click outside
    this.boundOutsideClickHandler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (!this.container.contains(target) && !this.popoverElement?.contains(target)) {
        this.hideSettingsPopover();
      }
    };
    document.addEventListener('mousedown', this.boundOutsideClickHandler);

    // Close on Escape
    this.boundEscapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hideSettingsPopover();
      }
    };
    document.addEventListener('keydown', this.boundEscapeHandler);

    // Reposition when viewport or scroll containers change
    this.boundViewportChangeHandler = () => this.positionSettingsPopover();
    window.addEventListener('resize', this.boundViewportChangeHandler);
    document.addEventListener('scroll', this.boundViewportChangeHandler, true);
  }

  /**
   * Position the settings popover relative to the indicator in viewport space
   */
  private positionSettingsPopover(): void {
    if (!this.popoverElement) return;

    const anchorRect = this.container.getBoundingClientRect();
    const margin = 4;
    const viewportPadding = 8;
    const popoverWidth = this.popoverElement.offsetWidth;
    const popoverHeight = this.popoverElement.offsetHeight;

    let left = anchorRect.right - popoverWidth;
    const maxLeft = window.innerWidth - popoverWidth - viewportPadding;
    left = Math.min(Math.max(left, viewportPadding), Math.max(viewportPadding, maxLeft));

    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const canOpenAbove = anchorRect.top >= popoverHeight + margin + viewportPadding;
    let top = anchorRect.bottom + margin;
    if (spaceBelow < popoverHeight + margin && canOpenAbove) {
      top = anchorRect.top - popoverHeight - margin;
    }
    const maxTop = window.innerHeight - popoverHeight - viewportPadding;
    top = Math.min(Math.max(top, viewportPadding), Math.max(viewportPadding, maxTop));

    this.popoverElement.style.left = `${Math.round(left)}px`;
    this.popoverElement.style.top = `${Math.round(top)}px`;
  }

  /**
   * Hide the settings popover
   */
  private hideSettingsPopover(): void {
    if (this.popoverElement) {
      this.popoverElement.remove();
      this.popoverElement = null;
    }
    if (this.boundOutsideClickHandler) {
      document.removeEventListener('mousedown', this.boundOutsideClickHandler);
      this.boundOutsideClickHandler = null;
    }
    if (this.boundEscapeHandler) {
      document.removeEventListener('keydown', this.boundEscapeHandler);
      this.boundEscapeHandler = null;
    }
    if (this.boundViewportChangeHandler) {
      window.removeEventListener('resize', this.boundViewportChangeHandler);
      document.removeEventListener('scroll', this.boundViewportChangeHandler, true);
      this.boundViewportChangeHandler = null;
    }
  }

  /**
   * Apply a config change to the manager and persist to localStorage
   */
  private applyConfig(partial: Partial<AutoSaveConfig>): void {
    if (!this.connectedManager) return;
    this.connectedManager.setConfig(partial);
    const fullConfig = this.connectedManager.getConfig();
    AutoSaveIndicator.saveConfigToStorage(fullConfig);
  }

  /**
   * Sync popover controls with current config (if popover is open)
   */
  private syncPopoverControls(config: { enabled: boolean; interval: number; maxVersions: number }): void {
    if (!this.popoverElement) return;

    const toggle = this.popoverElement.querySelector<HTMLInputElement>('[data-testid="autosave-enable-toggle"]');
    if (toggle) toggle.checked = config.enabled;

    const intervalSlider = this.popoverElement.querySelector<HTMLInputElement>('[data-testid="autosave-interval-slider"]');
    if (intervalSlider) intervalSlider.value = String(config.interval);

    const intervalLabel = this.popoverElement.querySelector<HTMLElement>('[data-testid="autosave-interval-label"]');
    if (intervalLabel) intervalLabel.textContent = `Interval: ${config.interval} min`;

    const versionsSlider = this.popoverElement.querySelector<HTMLInputElement>('[data-testid="autosave-versions-slider"]');
    if (versionsSlider) versionsSlider.value = String(config.maxVersions);

    const versionsLabel = this.popoverElement.querySelector<HTMLElement>('[data-testid="autosave-versions-label"]');
    if (versionsLabel) versionsLabel.textContent = `Max versions: ${config.maxVersions}`;
  }

  /**
   * Load config from localStorage
   */
  static loadConfigFromStorage(): Partial<AutoSaveConfig> | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return null;
      const result: Partial<AutoSaveConfig> = {};
      if (typeof parsed.interval === 'number' && parsed.interval >= 1 && parsed.interval <= 30) {
        result.interval = parsed.interval;
      }
      if (typeof parsed.enabled === 'boolean') {
        result.enabled = parsed.enabled;
      }
      if (typeof parsed.maxVersions === 'number' && parsed.maxVersions >= 1 && parsed.maxVersions <= 100) {
        result.maxVersions = parsed.maxVersions;
      }
      return Object.keys(result).length > 0 ? result : null;
    } catch {
      return null;
    }
  }

  /**
   * Save config to localStorage
   */
  static saveConfigToStorage(config: AutoSaveConfig): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        interval: config.interval,
        enabled: config.enabled,
        maxVersions: config.maxVersions,
      }));
    } catch {
      // Ignore storage errors
    }
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
        this.container.style.cursor = 'pointer';
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
        this.container.style.cursor = 'pointer';
        break;

      case 'idle':
      default:
        this.iconElement.innerHTML = getIconSvg('cloud', 'sm');
        this.iconElement.style.animation = '';
        this.container.style.cursor = 'pointer';

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
    // Close popover if open
    this.hideSettingsPopover();

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
