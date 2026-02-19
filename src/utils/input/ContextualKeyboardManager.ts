/**
 * ContextualKeyboardManager - Context-aware key binding resolution
 *
 * Wraps the KeyboardManager and ActiveContextManager to resolve key bindings
 * with context scoping. When a key press occurs:
 *   1. Check for bindings in the active context first
 *   2. Fall back to global bindings if no active-context match is found
 *
 * This resolves key collisions like:
 *   - KeyR: timeline.resetInOut (timeline context) vs paint.rectangle (paint context)
 *   - KeyO: timeline.setOutPoint (timeline context) vs paint.ellipse (paint context)
 *   - KeyG: panel.gamutDiagram (panel context) vs paint.toggleGhost (paint context)
 *   - Shift+KeyR: transform.rotateLeft (transform context) vs channel.red (channel context)
 */

import type { KeyCombination } from './KeyboardManager';
import type { BindingContext } from './ActiveContextManager';
import { ActiveContextManager } from './ActiveContextManager';
import { DEFAULT_KEY_BINDINGS, type KeyBindingEntry } from './KeyBindings';

export interface ContextualBinding {
  action: string;
  combo: KeyCombination;
  context: BindingContext;
  description: string;
  handler: () => void;
}

export class ContextualKeyboardManager {
  private bindings: ContextualBinding[] = [];
  private readonly contextManager: ActiveContextManager;

  constructor(contextManager: ActiveContextManager) {
    this.contextManager = contextManager;
  }

  /**
   * Register a contextual binding.
   */
  register(
    action: string,
    combo: KeyCombination,
    handler: () => void,
    context: BindingContext = 'global',
    description?: string
  ): void {
    // Remove any existing binding for this action
    this.bindings = this.bindings.filter(b => b.action !== action);

    this.bindings.push({
      action,
      combo,
      context,
      description: description ?? action,
      handler,
    });
  }

  /**
   * Register all default bindings with handlers.
   * Actions are mapped to handler functions via the provided map.
   */
  registerDefaults(handlers: Map<string, () => void>): void {
    for (const [action, entry] of Object.entries(DEFAULT_KEY_BINDINGS)) {
      const handler = handlers.get(action);
      if (!handler) continue;

      const bindingEntry = entry as KeyBindingEntry;
      const { description, context, ...combo } = bindingEntry;
      this.register(action, combo, handler, context ?? 'global', description);
    }
  }

  /**
   * Unregister a binding by action name.
   */
  unregister(action: string): void {
    this.bindings = this.bindings.filter(b => b.action !== action);
  }

  /**
   * Resolve a key combination to the best matching action, considering the active context.
   *
   * Resolution order:
   *   1. Exact match in the active context
   *   2. Exact match in global context
   *
   * Returns the matched binding, or null if no match.
   */
  resolve(combo: KeyCombination): ContextualBinding | null {
    const comboId = this.comboToId(combo);
    const activeContext = this.contextManager.activeContext;

    // First: look for a match in the active context (if not global)
    if (activeContext !== 'global') {
      const contextMatch = this.bindings.find(
        b => b.context === activeContext && this.comboToId(b.combo) === comboId
      );
      if (contextMatch) {
        return contextMatch;
      }
    }

    // Second: fall back to global bindings
    const globalMatch = this.bindings.find(
      b => b.context === 'global' && this.comboToId(b.combo) === comboId
    );
    return globalMatch ?? null;
  }

  /**
   * Get all bindings for a specific context.
   */
  getBindingsForContext(context: BindingContext): ContextualBinding[] {
    return this.bindings.filter(b => b.context === context);
  }

  /**
   * Get all registered bindings.
   */
  getAllBindings(): ContextualBinding[] {
    return [...this.bindings];
  }

  /**
   * Find all bindings that match a given key combination across all contexts.
   * Useful for displaying collision information.
   */
  findAllMatches(combo: KeyCombination): ContextualBinding[] {
    const comboId = this.comboToId(combo);
    return this.bindings.filter(b => this.comboToId(b.combo) === comboId);
  }

  /**
   * Clear all registered bindings.
   */
  clearAll(): void {
    this.bindings = [];
  }

  /**
   * Convert a KeyCombination to a canonical string ID for comparison.
   */
  private comboToId(combo: KeyCombination): string {
    const parts: string[] = [];
    if (combo.ctrl) parts.push('ctrl');
    if (combo.shift) parts.push('shift');
    if (combo.alt) parts.push('alt');
    if (combo.meta && !combo.ctrl) parts.push('meta');
    parts.push(combo.code.toLowerCase());
    return parts.join('+');
  }
}
