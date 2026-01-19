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
   * Set a custom key binding for an action
   */
  setCustomBinding(action: string, customCombo: KeyCombination): void {
    const defaultBinding = DEFAULT_KEY_BINDINGS[action as KeyBindingKeys];
    if (!defaultBinding) {
      throw new Error(`Unknown action: ${action}`);
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

      for (const item of data) {
        // Validate each item has required fields
        if (!this.isValidBindingData(item)) {
          console.warn('Skipping invalid custom key binding:', item);
          continue;
        }
        this.customBindings.set(item.action, item);
      }
    } catch (err) {
      console.warn('Failed to load custom key bindings:', err);
    }
  }

  /**
   * Validate that an item from localStorage has the required structure
   */
  private isValidBindingData(item: unknown): item is CustomKeyBinding {
    if (typeof item !== 'object' || item === null) return false;
    const obj = item as Record<string, unknown>;

    // Check required fields exist and have correct types
    if (typeof obj.action !== 'string') return false;
    if (!this.isValidKeyCombination(obj.originalCombo)) return false;
    if (!this.isValidKeyCombination(obj.customCombo)) return false;

    // Check that the action exists in default bindings
    if (!(obj.action in DEFAULT_KEY_BINDINGS)) return false;

    return true;
  }

  /**
   * Validate that an object is a valid KeyCombination
   */
  private isValidKeyCombination(combo: unknown): combo is KeyCombination {
    if (typeof combo !== 'object' || combo === null) return false;
    const obj = combo as Record<string, unknown>;

    // Must have a code property that is a string
    if (typeof obj.code !== 'string' && typeof obj.key !== 'string') return false;

    // Optional modifier fields must be booleans if present
    if (obj.ctrl !== undefined && typeof obj.ctrl !== 'boolean') return false;
    if (obj.shift !== undefined && typeof obj.shift !== 'boolean') return false;
    if (obj.alt !== undefined && typeof obj.alt !== 'boolean') return false;
    if (obj.meta !== undefined && typeof obj.meta !== 'boolean') return false;

    return true;
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