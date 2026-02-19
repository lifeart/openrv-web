/**
 * ClientMode - Client-safe locked UI mode for review presentations
 *
 * When enabled, restricts the UI to playback and navigation only.
 * Editing controls (color, effects, annotations, transforms, etc.) are blocked.
 * View-only analysis tools (waveform, pixel probe, guides, etc.) remain available.
 * Can be locked via URL parameter so viewers cannot re-enable editing.
 *
 * This is a state manager only — actual UI hiding is done by external wiring code.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

/** Source that triggered the client mode state change */
export type ClientModeSource = 'url' | 'api';

export interface ClientModeStateChange {
  enabled: boolean;
  locked: boolean;
  source: ClientModeSource;
}

export interface ClientModeEvents extends EventMap {
  stateChanged: ClientModeStateChange;
}

export interface ClientModeConfig {
  /** URL search parameter name to check for auto-enable (default: 'clientMode') */
  urlParamName?: string;
  /** Override the default set of allowed action categories */
  allowedCategories?: string[];
}

/**
 * Default action patterns allowed in client mode.
 * Uses prefix matching: 'playback.' matches 'playback.toggle', 'playback.stepForward', etc.
 * Exact matches are also supported for specific actions.
 */
const DEFAULT_ALLOWED_ACTIONS: string[] = [
  // All playback actions
  'playback.',
  // Specific timeline navigation
  'timeline.nextShot',
  'timeline.previousShot',
  // All view actions (read-only analysis/display tools)
  'view.',
  // Panel close (Escape)
  'panel.close',
  // All help actions
  'help.',
  // Focus zone navigation (accessibility)
  'focus.',
  // Tab navigation for view/qc tabs
  'tab.view',
  'tab.qc',
];

/**
 * Categories that are restricted (blocked) in client mode.
 * External UI managers can use this list to hide entire panels.
 */
const DEFAULT_RESTRICTED_CATEGORIES: string[] = [
  'edit',
  'paint',
  'annotation',
  'color',
  'transform',
  'export',
  'channel',
  'stereo',
  'display',
  'snapshot',
  'notes',
  'network',
  'tab',
  'layout',
];

/**
 * CSS selectors / element identifiers for UI elements that should be
 * hidden or disabled in client mode. External code uses these to apply
 * visibility changes.
 */
const DEFAULT_RESTRICTED_ELEMENTS: string[] = [
  '[data-panel="color"]',
  '[data-panel="effects"]',
  '[data-panel="transform"]',
  '[data-panel="annotate"]',
  '[data-panel="export"]',
  '[data-panel="paint"]',
  '[data-panel="channel"]',
  '[data-panel="stereo"]',
  '[data-panel="notes"]',
  '[data-panel="snapshots"]',
  '[data-panel="network"]',
  '[data-toolbar="editing"]',
  '[data-toolbar="annotation"]',
  '[data-toolbar="paint"]',
];

export class ClientMode extends EventEmitter<ClientModeEvents> {
  private enabled = false;
  private locked = false;
  private disposed = false;
  private urlParamName: string;
  private allowedActions: string[];

  constructor(config: ClientModeConfig = {}) {
    super();
    this.urlParamName = config.urlParamName ?? 'clientMode';
    if (config.allowedCategories) {
      // Convert category names to prefix patterns (e.g. 'playback' -> 'playback.')
      this.allowedActions = config.allowedCategories.map((cat) =>
        cat.endsWith('.') ? cat : cat + '.'
      );
    } else {
      this.allowedActions = [...DEFAULT_ALLOWED_ACTIONS];
    }
  }

  /**
   * Enable client mode. If already enabled, this is a no-op (idempotent).
   */
  enable(): void {
    if (this.disposed) return;
    if (this.enabled) return;
    this.enabled = true;
    this.emit('stateChanged', { enabled: true, locked: this.locked, source: 'api' });
  }

  /**
   * Disable client mode. No-op if already disabled or if locked via URL.
   */
  disable(): void {
    if (this.disposed) return;
    if (!this.enabled) return;
    if (this.locked) return;
    this.enabled = false;
    this.emit('stateChanged', { enabled: false, locked: false, source: 'api' });
  }

  /**
   * Toggle client mode on/off. Respects locked state.
   */
  toggle(): void {
    if (this.disposed) return;
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /**
   * Returns whether client mode is currently enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Returns true if client mode was enabled via URL param and cannot be toggled off.
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Check the URL search parameters for the client mode param.
   * If present (with any truthy value or no value), enables and locks client mode.
   * Values '0', 'false', 'no', 'off' (case-insensitive) are treated as falsy.
   * Safe for SSR — catches errors when window/location is unavailable.
   */
  checkURLParam(): void {
    if (this.disposed) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has(this.urlParamName)) {
        const value = (params.get(this.urlParamName) ?? '').toLowerCase();
        const falsyValues = ['0', 'false', 'no', 'off'];
        if (!falsyValues.includes(value)) {
          const wasLocked = this.locked;
          if (!this.enabled) {
            this.enabled = true;
            this.locked = true;
            this.emit('stateChanged', { enabled: true, locked: true, source: 'url' });
          } else {
            // Already enabled, promote to locked
            this.locked = true;
            if (!wasLocked) {
              this.emit('stateChanged', { enabled: true, locked: true, source: 'url' });
            }
          }
        }
      }
    } catch {
      // SSR or restricted environment — silently ignore
    }
  }

  /**
   * Check if a given action is allowed in the current mode.
   * When client mode is disabled, all actions are allowed.
   * When enabled, only whitelisted actions pass.
   */
  isActionAllowed(action: string): boolean {
    if (!this.enabled) return true;

    for (const pattern of this.allowedActions) {
      // Prefix match (e.g. 'playback.' matches 'playback.toggle')
      if (pattern.endsWith('.') && action.startsWith(pattern)) {
        return true;
      }
      // Exact match (e.g. 'timeline.nextShot')
      if (action === pattern) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns CSS selectors / element identifiers for UI elements
   * that should be hidden or disabled in client mode.
   */
  getRestrictedElements(): string[] {
    return [...DEFAULT_RESTRICTED_ELEMENTS];
  }

  /**
   * Returns the list of action categories that are restricted in client mode.
   * External UI managers can use this to hide entire category panels.
   */
  getRestrictedCategories(): string[] {
    return [...DEFAULT_RESTRICTED_CATEGORIES];
  }

  /**
   * Clean up all event listeners and reset state.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    this.locked = false;
    this.removeAllListeners();
  }
}
