/**
 * ManagerBase - Shared interface for all manager classes.
 *
 * Establishes a minimal contract that every manager must follow:
 * - `dispose()` for resource cleanup (required)
 * - `initialize()` for post-construction setup (optional)
 *
 * This interface does NOT mandate state management (getState/setState)
 * since not all managers are stateful.
 */

/**
 * Minimal contract for objects that hold resources requiring cleanup.
 */
export interface Disposable {
  /** Release all resources held by this object. */
  dispose(): void;
}

/**
 * Base interface for manager classes in OpenRV Web.
 *
 * All managers must implement `dispose()` for deterministic cleanup.
 * Managers that need async or deferred initialization can implement
 * the optional `initialize()` hook.
 */
export interface ManagerBase extends Disposable {
  /**
   * Called once after construction to initialize resources.
   * Implementations may be synchronous or asynchronous.
   */
  initialize?(): void | Promise<void>;
}
