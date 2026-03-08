/**
 * PluginSettingsStore - Persistent settings storage for plugins.
 *
 * Plugins declare settings via a schema in their manifest. Values are
 * persisted to localStorage under namespaced keys and validated against
 * the schema on read/write.
 */

import type { PluginId } from './types';

// ---------------------------------------------------------------------------
// Schema Types
// ---------------------------------------------------------------------------

export type PluginSettingType = 'string' | 'number' | 'boolean' | 'select' | 'color' | 'range';

export interface PluginSetting {
  /** Unique key for this setting within the plugin */
  key: string;
  /** Human-readable label */
  label: string;
  /** Optional description shown as help text */
  description?: string;
  /** Setting type */
  type: PluginSettingType;
  /** Default value */
  default: unknown;
  /** For 'range' and 'number': minimum value */
  min?: number;
  /** For 'range' and 'number': maximum value */
  max?: number;
  /** For 'range' and 'number': step increment */
  step?: number;
  /** For 'select': available options */
  options?: Array<{ value: string; label: string }>;
  /** For 'string': placeholder text */
  placeholder?: string;
  /** For 'string': maximum character length */
  maxLength?: number;
}

export interface PluginSettingsSchema {
  settings: PluginSetting[];
}

/**
 * Per-plugin settings accessor provided via PluginContext.
 */
export interface PluginSettingsAccessor {
  /** Get a single setting value */
  get<T = unknown>(key: string): T;
  /** Set a single setting value */
  set(key: string, value: unknown): void;
  /** Get all settings as a key-value map */
  getAll(): Record<string, unknown>;
  /** Subscribe to changes on a specific setting key */
  onChange(key: string, callback: (value: unknown, oldValue: unknown) => void): () => void;
  /** Reset all settings to defaults */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Storage Key
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'openrv-plugin-settings:';

function storageKey(pluginId: PluginId): string {
  return `${STORAGE_PREFIX}${pluginId}`;
}

// ---------------------------------------------------------------------------
// PluginSettingsStore
// ---------------------------------------------------------------------------

export class PluginSettingsStore {
  /** In-memory cache of all plugin settings */
  private cache = new Map<PluginId, Record<string, unknown>>();

  /** Change listeners per plugin per key */
  private changeListeners = new Map<PluginId, Map<string, Set<(value: unknown, oldValue: unknown) => void>>>();

  /** Registered schemas per plugin */
  private schemas = new Map<PluginId, PluginSettingsSchema>();

  /**
   * Register a plugin's settings schema.
   * Must be called before accessing settings.
   */
  registerSchema(pluginId: PluginId, schema: PluginSettingsSchema): void {
    if (this.schemas.has(pluginId)) {
      console.warn(`[plugin:${pluginId}] Settings schema re-registered; previous in-memory changes may be lost`);
    }
    this.schemas.set(pluginId, schema);
    // Load from storage or initialize with defaults
    this.loadSettings(pluginId, schema);
  }

  /**
   * Unregister a plugin's settings (on disposal).
   */
  unregisterSchema(pluginId: PluginId): void {
    this.schemas.delete(pluginId);
    this.cache.delete(pluginId);
    this.changeListeners.delete(pluginId);
  }

  /**
   * Get all settings for a plugin, falling back to schema defaults.
   */
  getSettings(pluginId: PluginId): Record<string, unknown> {
    return { ...(this.cache.get(pluginId) ?? {}) };
  }

  /**
   * Get a single setting value.
   */
  getSetting(pluginId: PluginId, key: string): unknown {
    const settings = this.cache.get(pluginId);
    if (!settings) return undefined;
    return settings[key];
  }

  /**
   * Set a single setting value (validates against schema).
   */
  setSetting(pluginId: PluginId, key: string, value: unknown): void {
    const schema = this.schemas.get(pluginId);
    if (!schema) {
      throw new Error(`No settings schema registered for plugin "${pluginId}"`);
    }

    const settingDef = schema.settings.find((s) => s.key === key);
    if (!settingDef) {
      throw new Error(`Unknown setting key "${key}" for plugin "${pluginId}"`);
    }

    // Validate type
    this.validateValue(pluginId, settingDef, value);

    const settings = this.cache.get(pluginId) ?? {};
    const oldValue = settings[key];
    settings[key] = value;
    this.cache.set(pluginId, settings);

    // Persist
    this.saveSettings(pluginId);

    // Notify listeners
    if (oldValue !== value) {
      this.notifyChange(pluginId, key, value, oldValue);
    }
  }

  /**
   * Reset all settings for a plugin to schema defaults.
   */
  resetSettings(pluginId: PluginId): void {
    const schema = this.schemas.get(pluginId);
    if (!schema) return;

    const oldSettings = this.cache.get(pluginId) ?? {};
    const defaults: Record<string, unknown> = {};
    for (const setting of schema.settings) {
      defaults[setting.key] = setting.default;
    }

    this.cache.set(pluginId, defaults);
    this.saveSettings(pluginId);

    // Notify all changed keys
    for (const setting of schema.settings) {
      if (oldSettings[setting.key] !== defaults[setting.key]) {
        this.notifyChange(pluginId, setting.key, defaults[setting.key], oldSettings[setting.key]);
      }
    }
  }

  /**
   * Subscribe to changes on a specific setting key.
   */
  onChange(pluginId: PluginId, key: string, callback: (value: unknown, oldValue: unknown) => void): () => void {
    if (!this.changeListeners.has(pluginId)) {
      this.changeListeners.set(pluginId, new Map());
    }
    const pluginListeners = this.changeListeners.get(pluginId)!;
    if (!pluginListeners.has(key)) {
      pluginListeners.set(key, new Set());
    }
    pluginListeners.get(key)!.add(callback);

    return () => {
      pluginListeners.get(key)?.delete(callback);
    };
  }

  /**
   * Export all plugin settings for backup/transfer.
   */
  exportAll(): Record<PluginId, Record<string, unknown>> {
    const result: Record<PluginId, Record<string, unknown>> = {};
    for (const [id, settings] of this.cache) {
      result[id] = { ...settings };
    }
    return result;
  }

  /**
   * Import plugin settings from a backup.
   */
  importAll(data: Record<PluginId, Record<string, unknown>>): void {
    for (const [pluginId, settings] of Object.entries(data)) {
      const schema = this.schemas.get(pluginId);
      if (!schema) continue;

      const oldSettings = this.cache.get(pluginId) ?? {};
      // Only import keys that exist in the schema, validate each value
      const validSettings: Record<string, unknown> = {};
      for (const setting of schema.settings) {
        if (setting.key in settings) {
          try {
            this.validateValue(pluginId, setting, settings[setting.key]);
            validSettings[setting.key] = settings[setting.key];
          } catch {
            // Invalid value — fall back to default
            validSettings[setting.key] = setting.default;
          }
        } else {
          validSettings[setting.key] = setting.default;
        }
      }
      this.cache.set(pluginId, validSettings);
      this.saveSettings(pluginId);

      // Notify listeners for changed values
      for (const setting of schema.settings) {
        if (oldSettings[setting.key] !== validSettings[setting.key]) {
          this.notifyChange(pluginId, setting.key, validSettings[setting.key], oldSettings[setting.key]);
        }
      }
    }
  }

  /**
   * Create a scoped settings accessor for a plugin's PluginContext.
   */
  createAccessor(pluginId: PluginId): PluginSettingsAccessor {
    const store = this;
    return {
      get<T = unknown>(key: string): T {
        return store.getSetting(pluginId, key) as T;
      },
      set(key: string, value: unknown): void {
        store.setSetting(pluginId, key, value);
      },
      getAll(): Record<string, unknown> {
        return store.getSettings(pluginId);
      },
      onChange(key: string, callback: (value: unknown, oldValue: unknown) => void): () => void {
        return store.onChange(pluginId, key, callback);
      },
      reset(): void {
        store.resetSettings(pluginId);
      },
    };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private loadSettings(pluginId: PluginId, schema: PluginSettingsSchema): void {
    // Initialize with defaults
    const defaults: Record<string, unknown> = {};
    for (const setting of schema.settings) {
      defaults[setting.key] = setting.default;
    }

    // Try to load from localStorage
    try {
      const stored = localStorage.getItem(storageKey(pluginId));
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        // Merge: stored values override defaults (but only for known keys, validated)
        for (const setting of schema.settings) {
          if (setting.key in parsed) {
            try {
              this.validateValue(pluginId, setting, parsed[setting.key]);
              defaults[setting.key] = parsed[setting.key];
            } catch {
              // Invalid stored value — keep default
            }
          }
        }
      }
    } catch {
      // localStorage not available or corrupted data -- use defaults
    }

    this.cache.set(pluginId, defaults);
  }

  private saveSettings(pluginId: PluginId): void {
    const settings = this.cache.get(pluginId);
    if (!settings) return;
    try {
      localStorage.setItem(storageKey(pluginId), JSON.stringify(settings));
    } catch {
      // localStorage may be full or unavailable
      console.warn(`[plugin:${pluginId}] Failed to persist settings to localStorage`);
    }
  }

  private validateValue(pluginId: PluginId, setting: PluginSetting, value: unknown): void {
    switch (setting.type) {
      case 'string':
        if (typeof value !== 'string') {
          throw new Error(`Plugin "${pluginId}": setting "${setting.key}" must be a string`);
        }
        if (setting.maxLength !== undefined && (value as string).length > setting.maxLength) {
          throw new Error(`Plugin "${pluginId}": setting "${setting.key}" exceeds max length ${setting.maxLength}`);
        }
        break;
      case 'color':
        if (typeof value !== 'string') {
          throw new Error(`Plugin "${pluginId}": setting "${setting.key}" must be a string`);
        }
        if (!/^#[0-9a-fA-F]{3,8}$/.test(value as string)) {
          throw new Error(`Plugin "${pluginId}": setting "${setting.key}" must be a valid hex color (e.g. #ff0000)`);
        }
        break;
      case 'number':
      case 'range':
        if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
          throw new Error(`Plugin "${pluginId}": setting "${setting.key}" must be a finite number`);
        }
        if (setting.min !== undefined && value < setting.min) {
          throw new Error(`Plugin "${pluginId}": setting "${setting.key}" must be >= ${setting.min}`);
        }
        if (setting.max !== undefined && value > setting.max) {
          throw new Error(`Plugin "${pluginId}": setting "${setting.key}" must be <= ${setting.max}`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new Error(`Plugin "${pluginId}": setting "${setting.key}" must be a boolean`);
        }
        break;
      case 'select':
        if (!setting.options?.some((o) => o.value === value)) {
          throw new Error(`Plugin "${pluginId}": setting "${setting.key}" must be one of the defined options`);
        }
        break;
    }
  }

  private notifyChange(pluginId: PluginId, key: string, value: unknown, oldValue: unknown): void {
    const listeners = this.changeListeners.get(pluginId)?.get(key);
    if (!listeners) return;
    for (const cb of listeners) {
      try {
        cb(value, oldValue);
      } catch (err) {
        console.error(`[plugin:${pluginId}] Error in settings change listener for "${key}":`, err);
      }
    }
  }
}
