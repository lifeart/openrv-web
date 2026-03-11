/**
 * MuEventBridge — Event binding/mode system bridge
 *
 * Bridges the Mu-style event system (mode-scoped event tables with
 * reject/accept semantics) to the web DOM event model.
 *
 * Mu events have the form: "event-type--detail" (e.g. "key-down--a", "pointer--move")
 * DOM events are translated into this format and dispatched through the ModeManager.
 */

import { ModeManager } from './ModeManager';
import type { MuEvent, MuEventCallback } from './types';

export class MuEventBridge {
  private modeManager: ModeManager;
  private domListenerCleanups: Array<() => void> = [];
  private wiredTargets = new WeakSet<EventTarget>();

  constructor(modeManager?: ModeManager) {
    this.modeManager = modeManager ?? new ModeManager();
  }

  /**
   * Get the underlying ModeManager.
   */
  getModeManager(): ModeManager {
    return this.modeManager;
  }

  // ── Mu commands.bind / unbind ──

  /**
   * Bind an event handler in a named table.
   * Mu signature: bind(modeName, tableName, eventName, callback, documentation)
   *
   * If modeName is non-empty and not "default", the binding is scoped to
   * the named mode and only dispatches when that mode is active.
   */
  bind(
    modeName: string,
    tableName: string,
    eventName: string,
    callback: MuEventCallback,
    documentation: string = '',
  ): void {
    this.modeManager.bind(tableName, eventName, callback, documentation, undefined, modeName);
  }

  /**
   * Bind with regex matching (stores pattern, matches at dispatch time).
   */
  bindRegex(
    modeName: string,
    tableName: string,
    eventPattern: RegExp,
    callback: MuEventCallback,
    documentation: string = '',
  ): void {
    const key = `__regex__${eventPattern.source}`;
    this.modeManager.bind(tableName, key, callback, documentation, eventPattern, modeName);
  }

  /**
   * Unbind an event handler from a table.
   *
   * If modeName is non-empty and not "default", the binding is removed
   * from the mode-scoped table.
   */
  unbind(modeName: string, tableName: string, eventName: string): void {
    this.modeManager.unbind(tableName, eventName, modeName);
  }

  /**
   * Unbind a regex-bound handler.
   */
  unbindRegex(modeName: string, tableName: string, eventPattern: RegExp): void {
    const key = `__regex__${eventPattern.source}`;
    this.modeManager.unbind(tableName, key, modeName);
  }

  // ── Mu mode management ──

  /**
   * Define a minor mode with global and override event bindings.
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
    this.modeManager.defineMinorMode(
      name,
      order,
      globalBindings,
      overrideBindings,
      activate,
      deactivate,
      icon,
    );
  }

  /**
   * Activate a named mode.
   */
  activateMode(name: string): void {
    this.modeManager.activateMode(name);
  }

  /**
   * Deactivate a named mode.
   */
  deactivateMode(name: string): void {
    this.modeManager.deactivateMode(name);
  }

  /**
   * Check if a mode is currently active.
   */
  isModeActive(name: string): boolean {
    return this.modeManager.isModeActive(name);
  }

  /**
   * Get list of active mode names.
   */
  activeModes(): string[] {
    return this.modeManager.getActiveModes();
  }

  // ── Event table management ──

  /**
   * Push an event table onto the stack.
   */
  pushEventTable(name: string): void {
    this.modeManager.pushEventTable(name);
  }

  /**
   * Pop an event table from the stack.
   */
  popEventTable(name: string): void {
    this.modeManager.popEventTable(name);
  }

  /**
   * Get active event table names.
   */
  activeEventTables(): string[] {
    return this.modeManager.getActiveEventTables();
  }

  /**
   * Set a bounding-box constraint for event table hit-testing.
   */
  setEventTableBBox(
    tableName: string,
    tag: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    this.modeManager.setEventTableBBox(tableName, tag, x, y, w, h);
  }

  // ── Bindings introspection ──

  /**
   * Get all active bindings as [eventName, documentation] pairs.
   */
  bindings(): Array<[string, string]> {
    return this.modeManager.getBindings();
  }

  /**
   * Get documentation for a specific binding.
   */
  bindingDocumentation(tableName: string, eventName: string): string {
    return this.modeManager.getBindingDocumentation(tableName, eventName);
  }

  // ── Custom event dispatch ──

  /**
   * Send an internal event through the mode system.
   * Mu signature: sendInternalEvent(eventName, contents, sender)
   */
  sendInternalEvent(eventName: string, contents: string = '', sender: string = ''): void {
    const event: MuEvent = {
      name: eventName,
      sender,
      contents,
      returnContents: '',
      reject: false,
    };
    this.modeManager.dispatchEvent(event);
  }

  // ── DOM event wiring ──

  /**
   * Wire DOM events from a target element to the Mu event system.
   * Translates keyboard, pointer, and wheel events into Mu event names.
   */
  wireDOMEvents(target: EventTarget): void {
    if (this.wiredTargets.has(target)) return;
    this.wiredTargets.add(target);

    const wire = (type: string, handler: (e: Event) => void) => {
      target.addEventListener(type, handler);
      this.domListenerCleanups.push(() => target.removeEventListener(type, handler));
    };

    wire('keydown', (e) => this.dispatchKeyEvent('key-down', e as KeyboardEvent));
    wire('keyup', (e) => this.dispatchKeyEvent('key-up', e as KeyboardEvent));
    wire('pointerdown', (e) => this.dispatchPointerEvent('pointer--push', e as PointerEvent));
    wire('pointerup', (e) => this.dispatchPointerEvent('pointer--release', e as PointerEvent));
    wire('pointermove', (e) => this.dispatchPointerEvent('pointer--move', e as PointerEvent));
    wire('wheel', (e) => this.dispatchWheelEvent(e as WheelEvent));
  }

  /**
   * Clean up all DOM event listeners and mode state.
   */
  dispose(): void {
    for (const cleanup of this.domListenerCleanups) {
      cleanup();
    }
    this.domListenerCleanups = [];
    this.wiredTargets = new WeakSet<EventTarget>();
    this.modeManager.dispose();
  }

  // ── Private helpers ──

  private dispatchKeyEvent(prefix: string, e: KeyboardEvent): void {
    const muEvent = this.createMuEvent(`${prefix}--${e.key}`, e);
    muEvent.key = e.key;
    muEvent.modifiers = {
      shift: e.shiftKey,
      control: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
    };
    this.modeManager.dispatchEvent(muEvent);
  }

  private dispatchPointerEvent(name: string, e: PointerEvent): void {
    const muEvent = this.createMuEvent(name, e);
    muEvent.pointer = { x: e.clientX, y: e.clientY };
    muEvent.button = e.button;
    muEvent.modifiers = {
      shift: e.shiftKey,
      control: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
    };
    this.modeManager.dispatchEvent(muEvent);
  }

  private dispatchWheelEvent(e: WheelEvent): void {
    const direction = e.deltaY > 0 ? 'down' : 'up';
    const muEvent = this.createMuEvent(`pointer--wheel-${direction}`, e);
    muEvent.pointer = { x: e.clientX, y: e.clientY };
    muEvent.modifiers = {
      shift: e.shiftKey,
      control: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
    };
    this.modeManager.dispatchEvent(muEvent);
  }

  private createMuEvent(name: string, domEvent: Event): MuEvent {
    return {
      name,
      sender: '',
      contents: '',
      returnContents: '',
      reject: false,
      domEvent,
    };
  }
}
