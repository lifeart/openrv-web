/**
 * Shared default state utilities
 *
 * Provides a helper for merging partial overrides into default state objects.
 * This pattern is common across the codebase when initializing component state.
 */

/**
 * Merge partial overrides into a defaults object, returning a complete typed object.
 * Performs a shallow merge - nested objects are replaced, not deep-merged.
 *
 * @param defaults - The complete default state object
 * @param overrides - Optional partial overrides to apply
 * @returns A new object with defaults and overrides merged
 *
 * @example
 * ```ts
 * const state = withDefaults(DEFAULT_WIPE_STATE, { mode: 'horizontal' });
 * // { mode: 'horizontal', position: 0.5, showOriginal: 'left' }
 * ```
 */
export function withDefaults<T extends Record<string, unknown>>(defaults: T, overrides?: Partial<T>): T {
  if (!overrides) return { ...defaults };
  return { ...defaults, ...overrides };
}
