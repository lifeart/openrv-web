/**
 * WiringHelpers - Cross-cutting utilities for wiring modules.
 *
 * Reduces boilerplate in AppXxxWiring modules by encapsulating the common
 * pattern of calling a primary action followed by scheduleUpdateScopes()
 * and/or syncGTOStore().
 */

import { wiringEventLog } from './WiringEventLog';

/**
 * Side-effect callbacks commonly triggered after wiring actions.
 */
export interface WiringSideEffects {
  scheduleUpdateScopes(): void;
  syncGTOStore(): void;
}

/**
 * Create a wiring handler that calls the primary action,
 * then conditionally triggers scopes and/or GTO sync.
 *
 * When `wiringEventLog.enabled` is true, each invocation records a trace entry.
 *
 * @example
 * ```ts
 * const fx = { scheduleUpdateScopes: ..., syncGTOStore: ... };
 * subs.add(control.on('changed', withSideEffects(fx, (v) => viewer.setFoo(v))));
 * subs.add(control.on('saved', withSideEffects(fx, (v) => viewer.setBar(v), { gto: true })));
 * ```
 */
export function withSideEffects<T>(
  effects: WiringSideEffects,
  primaryAction: (value: T) => void,
  options: { scopes?: boolean; gto?: boolean; label?: string } = { scopes: true, gto: false },
): (value: T) => void {
  return (value: T) => {
    primaryAction(value);
    if (options.scopes !== false) effects.scheduleUpdateScopes();
    if (options.gto) effects.syncGTOStore();
    if (wiringEventLog.enabled && options.label) {
      wiringEventLog.record('wiring', options.label, 'side-effects', value);
    }
  };
}
