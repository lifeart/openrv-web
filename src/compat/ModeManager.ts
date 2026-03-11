/**
 * ModeManager — Minor/Major mode system with event tables
 *
 * Implements the Mu-style mode manager where:
 * - Minor modes can be activated/deactivated independently
 * - Each mode has global bindings and override bindings
 * - Event dispatch walks the mode stack (override tables first, then global)
 * - Event tables can be pushed/popped independently of modes
 */

import type {
  MinorModeDefinition,
  EventTable,
  MuEvent,
  MuEventCallback,
} from './types';

/** Sentinel prefix for regex-bound event keys */
const REGEX_PREFIX = '__regex__';

export class ModeManager {
  /** Registered mode definitions (name -> definition) */
  private modes = new Map<string, MinorModeDefinition>();

  /** Currently active modes, ordered by activation order */
  private activeModes: string[] = [];

  /** Event table stack (independent of modes) */
  private eventTableStack: EventTable[] = [];

  /** BBox constraints for event tables (tableName -> bbox string) */
  private eventTableBBoxes = new Map<string, { tag: string; x: number; y: number; w: number; h: number }>();

  /** Mode-scoped event tables: modeName -> tableName -> EventTable */
  private modeScopedTables = new Map<string, Map<string, EventTable>>();

  /**
   * Define a new minor mode.
   */
  defineMinorMode(
    name: string,
    order: number,
    globalBindings: Array<[string, MuEventCallback, string]>,
    overrideBindings: Array<[string, MuEventCallback, string]>,
    activate?: () => void,
    deactivate?: () => void,
    icon?: string,
  ): void {
    const globalTable = this.createEventTable(`${name}_global`, globalBindings);
    const overrideTable = this.createEventTable(`${name}_override`, overrideBindings);

    this.modes.set(name, {
      name,
      order,
      globalBindings: globalTable,
      overrideBindings: overrideTable,
      icon,
      activate,
      deactivate,
    });
  }

  /**
   * Activate a mode. Calls the mode's activate callback if defined.
   */
  activateMode(name: string): void {
    if (!this.modes.has(name)) {
      console.warn(`[ModeManager] Mode "${name}" is not defined`);
      return;
    }
    if (this.activeModes.includes(name)) {
      return; // Already active
    }

    this.activeModes.push(name);
    // Sort by order (lower order = earlier in evaluation)
    this.activeModes.sort((a, b) => {
      const modeA = this.modes.get(a);
      const modeB = this.modes.get(b);
      return (modeA?.order ?? 0) - (modeB?.order ?? 0);
    });

    const mode = this.modes.get(name);
    mode?.activate?.();
  }

  /**
   * Deactivate a mode. Calls the mode's deactivate callback if defined.
   */
  deactivateMode(name: string): void {
    const idx = this.activeModes.indexOf(name);
    if (idx === -1) return;

    this.activeModes.splice(idx, 1);

    const mode = this.modes.get(name);
    mode?.deactivate?.();
  }

  /**
   * Check if a mode is currently active.
   */
  isModeActive(name: string): boolean {
    return this.activeModes.includes(name);
  }

  /**
   * Get list of all active mode names.
   */
  getActiveModes(): string[] {
    return [...this.activeModes];
  }

  /**
   * Push an event table onto the stack.
   */
  pushEventTable(name: string): void {
    const existing = this.eventTableStack.find((t) => t.name === name);
    if (existing) {
      // Move to top
      this.eventTableStack = this.eventTableStack.filter((t) => t.name !== name);
      this.eventTableStack.push(existing);
    } else {
      this.eventTableStack.push({
        name,
        bindings: new Map(),
        regexCount: 0,
      });
    }
  }

  /**
   * Pop an event table from the stack.
   */
  popEventTable(name: string): void {
    this.eventTableStack = this.eventTableStack.filter((t) => t.name !== name);
  }

  /**
   * Get list of active event table names (from stack).
   */
  getActiveEventTables(): string[] {
    return this.eventTableStack.map((t) => t.name);
  }

  /**
   * Set BBox constraint for an event table.
   */
  setEventTableBBox(
    tableName: string,
    tag: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    this.eventTableBBoxes.set(tableName, { tag, x, y, w, h });
  }

  /**
   * Add a binding to a named event table (either on the stack or in a mode).
   * If `regex` is provided, the binding is a regex binding and will be matched
   * against event names during dispatch when no exact match is found.
   *
   * If `modeName` is provided and non-empty (and not "default"), the binding
   * is scoped to that mode and only participates in dispatch when the mode
   * is active.
   */
  bind(
    tableName: string,
    eventName: string,
    callback: MuEventCallback,
    documentation: string = '',
    regex?: RegExp,
    modeName?: string,
  ): void {
    const table = this.resolveTable(tableName, modeName);
    const isRegex = eventName.startsWith(REGEX_PREFIX);
    if (isRegex && !table.bindings.has(eventName)) {
      table.regexCount++;
    }
    table.bindings.set(eventName, {
      eventName,
      callback,
      documentation,
      ...(regex ? { regex } : {}),
    });
  }

  /**
   * Remove a binding from a named event table.
   *
   * If `modeName` is provided and non-empty (and not "default"), the
   * binding is removed from the mode-scoped table rather than the
   * always-active event table stack.
   */
  unbind(tableName: string, eventName: string, modeName?: string): void {
    let table: EventTable | undefined;
    if (modeName && modeName !== 'default') {
      table = this.modeScopedTables.get(modeName)?.get(tableName);
    } else {
      table = this.eventTableStack.find((t) => t.name === tableName);
    }
    if (table?.bindings.has(eventName) && eventName.startsWith(REGEX_PREFIX)) {
      table.regexCount = Math.max(0, table.regexCount - 1);
    }
    table?.bindings.delete(eventName);
  }

  /**
   * Dispatch an event through the mode system.
   * Walks override tables first, then event table stack, then mode-scoped
   * tables (for active modes), then global tables.
   * Returns true if the event was handled (not rejected).
   *
   * At each level, exact bindings are tried first. If no exact match is found,
   * regex bindings (keys prefixed with `__regex__`) are tested against the
   * event name as a lower-priority fallback.
   */
  dispatchEvent(event: MuEvent): boolean {
    // 1. Check override tables from active modes (highest order first)
    for (let i = this.activeModes.length - 1; i >= 0; i--) {
      const modeName = this.activeModes[i]!;
      const mode = this.modes.get(modeName);
      if (!mode) continue;

      const binding = mode.overrideBindings.bindings.get(event.name);
      if (binding) {
        binding.callback(event);
        if (!event.reject) return true;
        event.reject = false; // Reset for next handler
      } else if (this.tryRegexBindings(mode.overrideBindings, event)) {
        return true;
      }
    }

    // 2. Check event table stack (top-down) — always-active tables
    for (let i = this.eventTableStack.length - 1; i >= 0; i--) {
      const table = this.eventTableStack[i]!;

      // Check BBox constraint
      if (event.pointer && this.eventTableBBoxes.has(table.name)) {
        const bbox = this.eventTableBBoxes.get(table.name)!;
        const { x, y } = event.pointer;
        if (x < bbox.x || x > bbox.x + bbox.w || y < bbox.y || y > bbox.y + bbox.h) {
          continue;
        }
        // Tag-scoped hit-testing: if bbox has a tag, event must carry a matching tag
        if (bbox.tag && bbox.tag !== event.tag) {
          continue;
        }
      }

      const binding = table.bindings.get(event.name);
      if (binding) {
        binding.callback(event);
        if (!event.reject) return true;
        event.reject = false;
      } else if (this.tryRegexBindings(table, event)) {
        return true;
      }
    }

    // 3. Check mode-scoped event tables (only for active modes)
    for (let i = this.activeModes.length - 1; i >= 0; i--) {
      const modeName = this.activeModes[i]!;
      const modeTablesMap = this.modeScopedTables.get(modeName);
      if (!modeTablesMap) continue;

      for (const table of modeTablesMap.values()) {
        const binding = table.bindings.get(event.name);
        if (binding) {
          binding.callback(event);
          if (!event.reject) return true;
          event.reject = false;
        } else if (this.tryRegexBindings(table, event)) {
          return true;
        }
      }
    }

    // 4. Check global tables from active modes
    for (let i = this.activeModes.length - 1; i >= 0; i--) {
      const modeName = this.activeModes[i]!;
      const mode = this.modes.get(modeName);
      if (!mode) continue;

      const binding = mode.globalBindings.bindings.get(event.name);
      if (binding) {
        binding.callback(event);
        if (!event.reject) return true;
        event.reject = false;
      } else if (this.tryRegexBindings(mode.globalBindings, event)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all active bindings as [eventName, documentation] pairs.
   */
  getBindings(): Array<[string, string]> {
    const result: Array<[string, string]> = [];

    // Collect from active modes
    for (const modeName of this.activeModes) {
      const mode = this.modes.get(modeName);
      if (!mode) continue;
      for (const [, binding] of mode.globalBindings.bindings) {
        result.push([binding.eventName, binding.documentation]);
      }
      for (const [, binding] of mode.overrideBindings.bindings) {
        result.push([binding.eventName, binding.documentation]);
      }

      // Collect from mode-scoped tables
      const modeTablesMap = this.modeScopedTables.get(modeName);
      if (modeTablesMap) {
        for (const table of modeTablesMap.values()) {
          for (const [, binding] of table.bindings) {
            result.push([binding.eventName, binding.documentation]);
          }
        }
      }
    }

    // Collect from event table stack
    for (const table of this.eventTableStack) {
      for (const [, binding] of table.bindings) {
        result.push([binding.eventName, binding.documentation]);
      }
    }

    return result;
  }

  /**
   * Get documentation for a specific binding.
   */
  getBindingDocumentation(tableName: string, eventName: string): string {
    // Check event table stack
    const table = this.eventTableStack.find((t) => t.name === tableName);
    if (table) {
      const doc = table.bindings.get(eventName)?.documentation;
      if (doc !== undefined) return doc;
    }

    // Check mode-scoped tables (only for active modes)
    for (const modeName of this.activeModes) {
      const modeTablesMap = this.modeScopedTables.get(modeName);
      if (!modeTablesMap) continue;
      const scopedTable = modeTablesMap.get(tableName);
      if (scopedTable) {
        const doc = scopedTable.bindings.get(eventName)?.documentation;
        if (doc !== undefined) return doc;
      }
    }

    // Check mode tables
    const mode = this.modes.get(tableName);
    if (mode) {
      return (
        mode.globalBindings.bindings.get(eventName)?.documentation ??
        mode.overrideBindings.bindings.get(eventName)?.documentation ??
        ''
      );
    }

    return '';
  }

  /**
   * Check if a mode is defined (registered).
   */
  isModeDefined(name: string): boolean {
    return this.modes.has(name);
  }

  /**
   * Clear all modes and event tables.
   */
  dispose(): void {
    this.modes.clear();
    this.activeModes = [];
    this.eventTableStack = [];
    this.eventTableBBoxes.clear();
    this.modeScopedTables.clear();
  }

  /**
   * Resolve the target EventTable for a bind/unbind operation.
   * If modeName is non-empty and not "default", returns a mode-scoped table;
   * otherwise returns an always-active table from the event table stack.
   */
  private resolveTable(tableName: string, modeName?: string): EventTable {
    if (modeName && modeName !== 'default') {
      let modeTablesMap = this.modeScopedTables.get(modeName);
      if (!modeTablesMap) {
        modeTablesMap = new Map();
        this.modeScopedTables.set(modeName, modeTablesMap);
      }
      let table = modeTablesMap.get(tableName);
      if (!table) {
        table = { name: tableName, bindings: new Map(), regexCount: 0 };
        modeTablesMap.set(tableName, table);
      }
      return table;
    }

    // Always-active: find or create on the event table stack
    let table = this.eventTableStack.find((t) => t.name === tableName);
    if (!table) {
      table = { name: tableName, bindings: new Map(), regexCount: 0 };
      this.eventTableStack.push(table);
    }
    return table;
  }

  private createEventTable(
    name: string,
    bindings: Array<[string, MuEventCallback, string]>,
  ): EventTable {
    const table: EventTable = { name, bindings: new Map(), regexCount: 0 };
    for (const [eventName, callback, doc] of bindings) {
      const isRegex = eventName.startsWith(REGEX_PREFIX);
      const regex = isRegex
        ? new RegExp(eventName.slice(REGEX_PREFIX.length))
        : undefined;
      table.bindings.set(eventName, {
        eventName,
        callback,
        documentation: doc,
        ...(regex ? { regex } : {}),
      });
      if (isRegex) {
        table.regexCount++;
      }
    }
    return table;
  }

  /**
   * Try regex bindings in a table against the event name.
   * Returns true if a binding matched and was not rejected.
   */
  private tryRegexBindings(table: EventTable, event: MuEvent): boolean {
    if (table.regexCount === 0) return false;

    for (const [key, binding] of table.bindings) {
      if (!key.startsWith(REGEX_PREFIX)) continue;

      if (binding.regex) {
        binding.regex.lastIndex = 0;
      }
      const matches = binding.regex
        ? binding.regex.test(event.name)
        : new RegExp(key.slice(REGEX_PREFIX.length)).test(event.name);

      if (matches) {
        binding.callback(event);
        if (!event.reject) return true;
        event.reject = false;
      }
    }

    return false;
  }
}
