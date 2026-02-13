/**
 * Custom Key Bindings Manager
 *
 * Handles user-defined key bindings stored in localStorage.
 * Notifies listeners when bindings change so they can update
 * the KeyboardManager with the new shortcuts.
 */

import { KeyCombination } from './KeyboardManager';
import { DEFAULT_KEY_BINDINGS, KeyBindingKeys } from './KeyBindings';

export interface CustomKeyBinding {
  action: string;
  originalCombo: KeyCombination;
  customCombo: KeyCombination;
}

export class CustomKeyBindingsManager {
  private static readonly STORAGE_KEY = 'openrv-custom-keybindings';
  private customBindings: Map<string, CustomKeyBinding> = new Map();
  private onBindingsChanged?: () => void;

  constructor(onBindingsChanged?: () => void) {
    this.onBindingsChanged = onBindingsChanged;
    this.loadFromStorage();
    this.applyCustomBindings();
  }

  /**
   * Convert a KeyCombination to a canonical string ID for comparison
   */
  comboToId(combo: KeyCombination): string {
    const parts = [];
    if (combo.ctrl) parts.push('ctrl');
    if (combo.shift) parts.push('shift');
    if (combo.alt) parts.push('alt');
    if (combo.meta && !combo.ctrl) parts.push('meta');
    parts.push(combo.code.toLowerCase());
    return parts.join('+');
  }

  /**
   * Find the action currently bound to a given key combination.
   * Returns the action name or null if no action uses the combo.
   * Checks both custom bindings and default bindings.
   * @param combo The key combination to look up
   * @param excludeAction Optional action to exclude from the search (for self-reassignment)
   */
  findConflictingAction(combo: KeyCombination, excludeAction?: string): string | null {
    const targetId = this.comboToId(combo);

    for (const actionName of Object.keys(DEFAULT_KEY_BINDINGS)) {
      if (actionName === excludeAction) continue;
      const effective = this.getEffectiveCombo(actionName);
      if (this.comboToId(effective) === targetId) {
        return actionName;
      }
    }
    return null;
  }

  /**
   * Set a custom key binding for an action.
   * Throws if the combo is already used by another action, unless force is true.
   */
  setCustomBinding(action: string, customCombo: KeyCombination, force = false): void {
    const defaultBinding = DEFAULT_KEY_BINDINGS[action as KeyBindingKeys];
    if (!defaultBinding) {
      throw new Error(`Unknown action: ${action}`);
    }

    if (!force) {
      const conflict = this.findConflictingAction(customCombo, action);
      if (conflict) {
        throw new Error(`Key combination already used by "${conflict}"`);
      }
    }

    // Extract the KeyCombination part (without description)
    const { description: _, ...originalCombo } = defaultBinding;

    const binding: CustomKeyBinding = {
      action,
      originalCombo: originalCombo as KeyCombination,
      customCombo
    };

    this.customBindings.set(action, binding);
    this.saveToStorage();
    this.applyCustomBindings();
  }

  /**
   * Remove custom binding for an action (restore default)
   */
  removeCustomBinding(action: string): void {
    this.customBindings.delete(action);
    this.saveToStorage();
    this.applyCustomBindings();
  }

  /**
   * Get all custom bindings
   */
  getCustomBindings(): CustomKeyBinding[] {
    return Array.from(this.customBindings.values());
  }

  /**
   * Get custom binding for a specific action
   */
  getCustomBinding(action: string): CustomKeyBinding | undefined {
    return this.customBindings.get(action);
  }

  /**
   * Check if an action has a custom binding
   */
  hasCustomBinding(action: string): boolean {
    return this.customBindings.has(action);
  }

  /**
   * Get the effective key combination for an action (custom or default)
   */
  getEffectiveCombo(action: string): KeyCombination {
    const custom = this.customBindings.get(action);
    if (custom) {
      return custom.customCombo;
    }

    const defaultBinding = DEFAULT_KEY_BINDINGS[action as KeyBindingKeys];
    if (!defaultBinding) {
      throw new Error(`Unknown action: ${action}`);
    }

    // Extract the KeyCombination part (without description)
    const { description: _, ...combo } = defaultBinding;
    return combo as KeyCombination;
  }

  /**
   * Reset all custom bindings
   */
  resetAll(): void {
    this.customBindings.clear();
    this.saveToStorage();
    this.applyCustomBindings();
  }

  /**
   * Load custom bindings from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(CustomKeyBindingsManager.STORAGE_KEY);
      if (!stored) return;

      const data = JSON.parse(stored);

      // Validate that data is an array
      if (!Array.isArray(data)) {
        console.warn('Invalid custom key bindings data: expected array');
        return;
      }

      let needsSave = false;
      for (const item of data) {
        // Try to migrate old format (with 'key' instead of 'code')
        const migrated = this.migrateBindingData(item);
        if (!migrated) {
          console.warn('Skipping invalid custom key binding:', item);
          continue;
        }
        if (migrated !== item) {
          needsSave = true;
        }
        this.customBindings.set(migrated.action, migrated);
      }

      // Save migrated data back to storage
      if (needsSave) {
        this.saveToStorage();
      }
    } catch (err) {
      console.warn('Failed to load custom key bindings:', err);
    }
  }

  /**
   * Migrate old binding format to new format
   */
  private migrateBindingData(item: unknown): CustomKeyBinding | null {
    if (typeof item !== 'object' || item === null) return null;
    const obj = item as Record<string, unknown>;

    // Check required fields exist
    if (typeof obj.action !== 'string') return null;
    if (!(obj.action in DEFAULT_KEY_BINDINGS)) return null;

    // Migrate originalCombo
    const originalCombo = this.migrateKeyCombination(obj.originalCombo);
    if (!originalCombo) return null;

    // Migrate customCombo
    const customCombo = this.migrateKeyCombination(obj.customCombo);
    if (!customCombo) return null;

    return {
      action: obj.action,
      originalCombo,
      customCombo
    };
  }

  /**
   * Migrate a KeyCombination, handling old formats with 'key' instead of 'code'
   */
  private migrateKeyCombination(combo: unknown): KeyCombination | null {
    if (typeof combo !== 'object' || combo === null) return null;
    const obj = combo as Record<string, unknown>;

    // Get code from either 'code' or 'key' property
    let code: string | undefined;
    if (typeof obj.code === 'string' && obj.code) {
      code = obj.code;
    } else if (typeof obj.key === 'string' && obj.key) {
      // Migrate old 'key' format to 'code'
      code = this.keyToCode(obj.key);
    }

    if (!code) return null;

    const result: KeyCombination = { code };

    // Copy modifiers if they are valid booleans
    if (typeof obj.ctrl === 'boolean') result.ctrl = obj.ctrl;
    if (typeof obj.shift === 'boolean') result.shift = obj.shift;
    if (typeof obj.alt === 'boolean') result.alt = obj.alt;
    if (typeof obj.meta === 'boolean') result.meta = obj.meta;

    return result;
  }

  /**
   * Convert a key character to a code (for migration)
   */
  private keyToCode(key: string): string {
    switch (key) {
      case ' ': return 'Space';
      case 'ArrowUp': return 'ArrowUp';
      case 'ArrowDown': return 'ArrowDown';
      case 'ArrowLeft': return 'ArrowLeft';
      case 'ArrowRight': return 'ArrowRight';
      case 'Home': return 'Home';
      case 'End': return 'End';
      case 'Escape': return 'Escape';
      case '[': return 'BracketLeft';
      case ']': return 'BracketRight';
      case ',': return 'Comma';
      case '.': return 'Period';
      case '`': return 'Backquote';
      default:
        if (key.length === 1) {
          if (/[a-zA-Z]/.test(key)) {
            return 'Key' + key.toUpperCase();
          } else if (/[0-9]/.test(key)) {
            return 'Digit' + key;
          }
        }
        return key;
    }
  }

  /**
   * Save custom bindings to localStorage
   */
  private saveToStorage(): void {
    try {
      const data = Array.from(this.customBindings.values());
      localStorage.setItem(CustomKeyBindingsManager.STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to save custom key bindings:', err);
    }
  }

  /**
   * Apply custom bindings to the keyboard manager
   */
  private applyCustomBindings(): void {
    // Notify that bindings have changed so the app can refresh keyboard shortcuts
    this.onBindingsChanged?.();
  }

  /**
   * Get available actions for binding
   */
  getAvailableActions(): Array<{ action: string; description: string; currentCombo: KeyCombination }> {
    return Object.entries(DEFAULT_KEY_BINDINGS).map(([action, binding]) => ({
      action,
      description: binding.description || action,
      currentCombo: this.getEffectiveCombo(action)
    }));
  }
}