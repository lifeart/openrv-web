/**
 * Mu API Compatibility Layer — Barrel Export & Registration
 *
 * Exports all compat layer classes and registers them on the
 * `window.rv` namespace for Mu-script-style access.
 *
 * Usage:
 *   import { registerMuCompat } from './compat';
 *   registerMuCompat();  // sets up window.rv.commands / window.rv.extra_commands
 *
 * After registration:
 *   window.rv.commands.play();
 *   window.rv.extra_commands.togglePlay();
 */

export { MuCommands } from './MuCommands';
export { MuExtraCommands } from './MuExtraCommands';
export { MuPropertyBridge } from './MuPropertyBridge';
export { MuNodeBridge } from './MuNodeBridge';
export { MuEventBridge } from './MuEventBridge';
export { ModeManager } from './ModeManager';
export { MuSourceBridge } from './MuSourceBridge';
export type { PixelReadbackProvider } from './MuSourceBridge';
export { MuEvalBridge } from './MuEvalBridge';
export type { ViewEventSource } from './MuEvalBridge';
export { MuNetworkBridge } from './MuNetworkBridge';
export { MuSettingsBridge } from './MuSettingsBridge';
export { MuUtilsBridge } from './MuUtilsBridge';
export type { LoadingEventSource } from './MuUtilsBridge';
export * as stubs from './stubs';
export * from './types';
export * from './constants';

import { MuCommands } from './MuCommands';
import { MuExtraCommands } from './MuExtraCommands';

let _cachedResult: { commands: MuCommands; extra_commands: MuExtraCommands } | null = null;

/**
 * Reset the internal registration cache. Intended for testing only.
 */
export function _resetMuCompatCache(): void {
  _cachedResult = null;
}

/**
 * Register the Mu compatibility layer on `window.rv`.
 *
 * Call this after `window.openrv` (OpenRVAPI) has been initialized.
 * It is safe to call multiple times; subsequent calls are no-ops.
 *
 * @returns The MuCommands instance for programmatic access.
 */
export function registerMuCompat(): { commands: MuCommands; extra_commands: MuExtraCommands } {
  if (_cachedResult) {
    return _cachedResult;
  }

  if (typeof globalThis !== 'undefined') {
    const g = globalThis as unknown as { rv?: { commands: MuCommands; extra_commands: MuExtraCommands } };
    if (g.rv) {
      _cachedResult = { commands: g.rv.commands, extra_commands: g.rv.extra_commands };
      return _cachedResult;
    }

    const commands = new MuCommands();
    const extraCommands = new MuExtraCommands(commands);
    g.rv = { commands, extra_commands: extraCommands };
    _cachedResult = { commands, extra_commands: extraCommands };
    return _cachedResult;
  }

  const commands = new MuCommands();
  const extraCommands = new MuExtraCommands(commands);
  _cachedResult = { commands, extra_commands: extraCommands };
  return _cachedResult;
}
