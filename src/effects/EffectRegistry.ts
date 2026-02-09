/**
 * EffectRegistry - Central registry for ImageEffect instances.
 *
 * Provides registration, lookup by name or category, and a convenience
 * method to apply all active effects to an ImageData buffer in
 * registration order.
 *
 * Usage:
 *   import { effectRegistry } from '../effects';
 *
 *   effectRegistry.register(myEffect);
 *   effectRegistry.applyAll(imageData, params);
 */

import type { EffectCategory, ImageEffect } from './ImageEffect';

export class EffectRegistry {
  /** Effects stored in registration order. */
  private effects: Map<string, ImageEffect> = new Map();

  /**
   * Register an effect. Throws if an effect with the same name is already
   * registered (prevents silent overwrites).
   */
  register(effect: ImageEffect): void {
    if (this.effects.has(effect.name)) {
      throw new Error(
        `EffectRegistry: effect "${effect.name}" is already registered.`
      );
    }
    this.effects.set(effect.name, effect);
  }

  /**
   * Remove a previously registered effect by name.
   * Returns true if the effect was found and removed, false otherwise.
   */
  unregister(name: string): boolean {
    return this.effects.delete(name);
  }

  /** Look up an effect by its unique name. */
  get(name: string): ImageEffect | undefined {
    return this.effects.get(name);
  }

  /** Return all effects that belong to the given category, in registration order. */
  getByCategory(category: EffectCategory): ImageEffect[] {
    const result: ImageEffect[] = [];
    for (const effect of this.effects.values()) {
      if (effect.category === category) {
        result.push(effect);
      }
    }
    return result;
  }

  /** Return every registered effect in registration order. */
  getAll(): ImageEffect[] {
    return [...this.effects.values()];
  }

  /** Return the names of all registered effects. */
  names(): string[] {
    return [...this.effects.keys()];
  }

  /** Return the number of registered effects. */
  get size(): number {
    return this.effects.size;
  }

  /**
   * Apply every *active* effect to the ImageData buffer, in registration
   * order.  Effects whose `isActive(params)` returns false are skipped.
   */
  applyAll(imageData: ImageData, params: Record<string, unknown>): void {
    for (const effect of this.effects.values()) {
      if (effect.isActive(params)) {
        effect.apply(imageData, params);
      }
    }
  }

  /**
   * Apply only the active effects from a specific category.
   */
  applyByCategory(
    category: EffectCategory,
    imageData: ImageData,
    params: Record<string, unknown>
  ): void {
    for (const effect of this.effects.values()) {
      if (effect.category === category && effect.isActive(params)) {
        effect.apply(imageData, params);
      }
    }
  }

  /** Remove all registered effects (useful for testing). */
  clear(): void {
    this.effects.clear();
  }
}

/**
 * Shared singleton registry.
 *
 * Most application code should use this instance. Tests can create their
 * own `new EffectRegistry()` for isolation.
 */
export const effectRegistry = new EffectRegistry();
