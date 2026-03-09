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
export { ModeManager } from './ModeManager';
export * from './constants';
export type {
  MuEvent,
  MuEventCallback,
  EventTableBinding,
  EventTable,
  MinorModeDefinition,
  CommandSupportStatus,
  SettingsValue,
} from './types';

import { MuCommands } from './MuCommands';
import { MuExtraCommands } from './MuExtraCommands';

/**
 * Register the Mu compatibility layer on `window.rv`.
 *
 * Call this after `window.openrv` (OpenRVAPI) has been initialized.
 * It is safe to call multiple times; subsequent calls are no-ops.
 *
 * @returns The MuCommands instance for programmatic access.
 */
export function registerMuCompat(): { commands: MuCommands; extra_commands: MuExtraCommands } {
  const commands = new MuCommands();
  const extraCommands = new MuExtraCommands(commands);

  if (typeof globalThis !== 'undefined') {
    const g = globalThis as unknown as { rv?: { commands: MuCommands; extra_commands: MuExtraCommands } };
    if (!g.rv) {
      g.rv = { commands, extra_commands: extraCommands };
    }
  }

  return { commands, extra_commands: extraCommands };
}
