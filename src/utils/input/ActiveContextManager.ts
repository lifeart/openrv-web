/**
 * ActiveContextManager - Manages key binding context scoping
 *
 * Tracks which context is currently active (e.g., 'global', 'timeline', 'paint',
 * 'viewer', 'panel') so that key bindings can be resolved in a context-aware manner.
 *
 * When a key press occurs, bindings in the active context are checked first.
 * If no match is found in the active context, global bindings are used as fallback.
 */

import { Signal } from '../../core/graph/Signal';

/**
 * Known binding contexts.
 * - 'global': Always active; serves as a fallback for all other contexts.
 * - Other contexts are mutually exclusive: only one non-global context can be active at a time.
 */
export type BindingContext = 'global' | 'timeline' | 'paint' | 'viewer' | 'panel' | 'channel' | 'transform';

export class ActiveContextManager {
  private _activeContext: BindingContext = 'global';
  private _contextStack: BindingContext[] = [];

  readonly contextChanged = new Signal<BindingContext>();

  /**
   * Get the currently active context.
   */
  get activeContext(): BindingContext {
    return this._activeContext;
  }

  /**
   * Set the active context directly.
   * This replaces the current context without pushing to the stack.
   */
  setContext(context: BindingContext): void {
    if (this._activeContext === context) return;
    const old = this._activeContext;
    this._activeContext = context;
    this.contextChanged.emit(context, old);
  }

  /**
   * Push a new context onto the stack and make it active.
   * The previous context is saved so it can be restored with popContext().
   */
  pushContext(context: BindingContext): void {
    this._contextStack.push(this._activeContext);
    const old = this._activeContext;
    this._activeContext = context;
    this.contextChanged.emit(context, old);
  }

  /**
   * Pop the current context from the stack and restore the previous one.
   * If the stack is empty, reverts to 'global'.
   */
  popContext(): BindingContext {
    const old = this._activeContext;
    this._activeContext = this._contextStack.pop() ?? 'global';
    this.contextChanged.emit(this._activeContext, old);
    return this._activeContext;
  }

  /**
   * Reset to global context, clearing the stack.
   */
  reset(): void {
    const old = this._activeContext;
    this._contextStack = [];
    this._activeContext = 'global';
    if (old !== 'global') {
      this.contextChanged.emit('global', old);
    }
  }

  /**
   * Check if a given context is currently active.
   * 'global' is always considered active.
   */
  isContextActive(context: BindingContext): boolean {
    if (context === 'global') return true;
    return this._activeContext === context;
  }

  /**
   * Get the depth of the context stack.
   */
  get stackDepth(): number {
    return this._contextStack.length;
  }
}
