/**
 * MuSettingsBridge — localStorage-backed settings store
 *
 * Implements Mu's readSetting/writeSetting using browser localStorage
 * with a namespaced key format: "openrv-setting:{group}:{key}".
 */

import type { SettingsValue } from './types';

/** Prefix for all settings keys in localStorage */
const SETTINGS_PREFIX = 'openrv-setting:';

export class MuSettingsBridge {
  /**
   * Read a setting value.
   * Mu signature: readSetting(group, key, defaultValue)
   *
   * @param group - Settings group/category name
   * @param key - Setting key within the group
   * @param defaultValue - Default value if setting does not exist
   * @returns The stored value, or defaultValue if not found
   */
  readSetting(group: string, key: string, defaultValue: SettingsValue): SettingsValue {
    const storageKey = this.makeKey(group, key);

    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) {
        return defaultValue;
      }

      const parsed: unknown = JSON.parse(raw);
      return this.validateSettingsValue(parsed, defaultValue);
    } catch {
      return defaultValue;
    }
  }

  /**
   * Write a setting value.
   * Mu signature: writeSetting(group, key, value)
   *
   * @param group - Settings group/category name
   * @param key - Setting key within the group
   * @param value - Value to store
   */
  writeSetting(group: string, key: string, value: SettingsValue): void {
    const storageKey = this.makeKey(group, key);

    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (err) {
      console.warn(`[MuSettingsBridge] Failed to write setting "${storageKey}":`, err);
    }
  }

  /**
   * Check if a setting exists.
   */
  hasSetting(group: string, key: string): boolean {
    return localStorage.getItem(this.makeKey(group, key)) !== null;
  }

  /**
   * Remove a setting.
   */
  removeSetting(group: string, key: string): void {
    localStorage.removeItem(this.makeKey(group, key));
  }

  /**
   * List all setting keys in a group.
   */
  listSettings(group: string): string[] {
    const prefix = `${SETTINGS_PREFIX}${group}:`;
    const keys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keys.push(key.slice(prefix.length));
      }
    }

    return keys;
  }

  /**
   * Clear all settings in a group.
   */
  clearGroup(group: string): void {
    const prefix = `${SETTINGS_PREFIX}${group}:`;
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }

  /**
   * Clear all openrv settings.
   */
  clearAll(): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(SETTINGS_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }

  private makeKey(group: string, key: string): string {
    return `${SETTINGS_PREFIX}${group}:${key}`;
  }

  /**
   * Validate that a parsed JSON value is a valid SettingsValue.
   * Falls back to defaultValue if the type doesn't match.
   */
  private validateSettingsValue(parsed: unknown, defaultValue: SettingsValue): SettingsValue {
    if (parsed === null || parsed === undefined) {
      return defaultValue;
    }

    // Match the type of the default value
    if (typeof defaultValue === 'number' && typeof parsed === 'number') {
      return parsed;
    }
    if (typeof defaultValue === 'string' && typeof parsed === 'string') {
      return parsed;
    }
    if (typeof defaultValue === 'boolean' && typeof parsed === 'boolean') {
      return parsed;
    }
    if (Array.isArray(defaultValue) && Array.isArray(parsed)) {
      // Validate array element types match
      if (defaultValue.length === 0 || parsed.length === 0) {
        return parsed as SettingsValue;
      }
      const expectedType = typeof defaultValue[0];
      if (parsed.every((item: unknown) => typeof item === expectedType)) {
        return parsed as SettingsValue;
      }
    }

    // If types don't match, accept any valid SettingsValue type
    if (
      typeof parsed === 'number' ||
      typeof parsed === 'string' ||
      typeof parsed === 'boolean'
    ) {
      return parsed;
    }
    if (Array.isArray(parsed)) {
      if (parsed.every((item: unknown) => typeof item === 'number')) {
        return parsed as number[];
      }
      if (parsed.every((item: unknown) => typeof item === 'string')) {
        return parsed as string[];
      }
    }

    return defaultValue;
  }
}
