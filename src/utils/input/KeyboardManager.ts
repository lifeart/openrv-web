/**
 * Keyboard Manager - Centralized keyboard shortcut handling
 *
 * Provides a flexible system for registering, managing, and dispatching keyboard shortcuts.
 * Supports modifier keys and allows for easy reconfiguration of key bindings.
 */

export interface KeyCombination {
  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

import type { ContextualKeyboardManager } from './ContextualKeyboardManager';
import type { BindingContext } from './ActiveContextManager';
import { probe } from '../probe';

export interface KeyBinding {
  combo: KeyCombination;
  handler: () => void;
  description?: string;
  enabled?: boolean;
  /**
   * Context in which the binding is active. Bindings scoped to a non-global
   * context only fire while that context is active (e.g. paint tools only on
   * the Annotate tab). Defaults to 'global'.
   */
  context?: BindingContext;
  /**
   * User-customized binding. Priority bindings are dispatched before the
   * contextual resolver so a user rebind is never shadowed by a built-in
   * context-dependent default on the same key.
   */
  priority?: boolean;
}

/** Extra registration options. */
export interface KeyBindingOptions {
  context?: BindingContext;
  priority?: boolean;
}

/**
 * ARIA roles whose widgets own navigation/activation keys (arrows, Home/End,
 * Space, Enter, PageUp/PageDown). When focus is inside one of these, those keys
 * are left to the widget instead of being treated as app shortcuts.
 */
const NAVIGATION_WIDGET_ROLES = new Set([
  'listbox',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'tree',
  'treeitem',
  'grid',
  'gridcell',
  'radiogroup',
  'radio',
  'tablist',
  'tab',
  'slider',
  'spinbutton',
  'combobox',
]);

const NAVIGATION_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/**
 * Widget roles that behave like plain buttons when clicked with the mouse:
 * they only own navigation keys while keyboard-focused.
 */
const POINTER_RELEASED_ROLES = new Set(['tablist', 'tab', 'radiogroup', 'radio']);

/** Selector matching an open modal dialog (see shared/Modal.ts). */
const OPEN_MODAL_SELECTOR = '[role="dialog"][aria-modal="true"]';

function isElement(target: EventTarget | null): target is Element {
  return typeof Element !== 'undefined' && target instanceof Element;
}

/**
 * True when `el` is focused via keyboard navigation (Tab / arrows) rather than
 * by a mouse click. Browsers only match `:focus-visible` on buttons after
 * keyboard interaction, so a button that merely received focus from a click
 * does not count.
 */
export function isKeyboardFocused(el: Element): boolean {
  if (typeof document !== 'undefined' && document.activeElement !== el) return false;
  // Older engines may not support :focus-visible; assume keyboard focus so
  // native keyboard behavior is preserved.
  return probe('focus-visible', () => el.matches(':focus-visible')) ?? true;
}

function isButtonLike(el: Element): boolean {
  return el instanceof HTMLButtonElement || el.getAttribute('role') === 'button';
}

export class KeyboardManager {
  private bindings: Map<string, KeyBinding> = new Map();
  private eventHandler: (e: KeyboardEvent) => void;
  private enabled = true;
  private contextualResolver?: ContextualKeyboardManager;

  /**
   * Set of key codes currently suppressed by external systems (e.g., virtual slider).
   * When a key code is in this set, handleKeydown will skip both the contextual
   * resolver and the direct binding lookup for that key.
   */
  private suppressedKeys: Set<string> = new Set();

  /**
   * When true, ALL keys are suppressed (used during virtual slider ACTIVE/LOCKED states).
   */
  private allKeysSuppressed = false;

  constructor() {
    this.eventHandler = this.handleKeydown.bind(this);
  }

  setContextualManager(manager: ContextualKeyboardManager): void {
    this.contextualResolver = manager;
  }

  /**
   * Register a keyboard shortcut
   */
  register(key: string | KeyCombination, handler: () => void, description?: string, options?: KeyBindingOptions): void;
  register(binding: KeyCombination & { description: string }, handler: () => void): void;
  register(
    keyOrBinding: string | KeyCombination | (KeyCombination & { description: string }),
    handler: () => void,
    description?: string,
    options?: KeyBindingOptions,
  ): void {
    let combo: KeyCombination;
    let desc: string | undefined;

    if (typeof keyOrBinding === 'string') {
      combo = this.parseKeyString(keyOrBinding);
      desc = description;
    } else if ('description' in keyOrBinding) {
      combo = keyOrBinding;
      desc = keyOrBinding.description;
    } else {
      combo = keyOrBinding;
      desc = description;
    }

    const context = options?.context ?? 'global';
    const id = this.bindingKey(this.comboToId(combo), context);

    const binding: KeyBinding = {
      combo,
      handler,
      description: desc,
      enabled: true,
    };
    if (context !== 'global') binding.context = context;
    if (options?.priority) binding.priority = true;
    this.bindings.set(id, binding);
  }

  /** Map key: global bindings use the bare combo id, scoped ones add `@context`. */
  private bindingKey(comboId: string, context: BindingContext): string {
    return context === 'global' ? comboId : `${comboId}@${context}`;
  }

  /**
   * Unregister a keyboard shortcut
   */
  unregister(key: string | KeyCombination): void {
    const combo = typeof key === 'string' ? this.parseKeyString(key) : key;
    const id = this.comboToId(combo);
    // Remove the global binding and any context-scoped variants of the combo.
    for (const key of [...this.bindings.keys()]) {
      if (key === id || key.startsWith(`${id}@`)) this.bindings.delete(key);
    }
  }

  /**
   * Enable/disable the keyboard manager
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if a key combination is registered
   */
  isRegistered(key: string | KeyCombination): boolean {
    const combo = typeof key === 'string' ? this.parseKeyString(key) : key;
    const id = this.comboToId(combo);
    if (this.bindings.has(id)) return true;
    for (const key of this.bindings.keys()) {
      if (key.startsWith(`${id}@`)) return true;
    }
    return false;
  }

  /**
   * Get all registered bindings
   */
  getBindings(): KeyBinding[] {
    return Array.from(this.bindings.values());
  }

  /**
   * Clear all registered bindings
   */
  clearAll(): void {
    this.bindings.clear();
  }

  /**
   * Suppress a specific key code so that handleKeydown skips it.
   * Used by the virtual slider system during the ARMED window.
   */
  suppressKey(code: string): void {
    this.suppressedKeys.add(code);
  }

  /**
   * Release a previously suppressed key code.
   */
  releaseKey(code: string): void {
    this.suppressedKeys.delete(code);
  }

  /**
   * Suppress or release ALL keys. When enabled, handleKeydown skips
   * every key event. Used during virtual slider ACTIVE/LOCKED states.
   */
  suppressAllKeys(suppress: boolean): void {
    this.allKeysSuppressed = suppress;
  }

  /**
   * Check whether a specific key code is currently suppressed.
   */
  isKeySuppressed(code: string): boolean {
    return this.allKeysSuppressed || this.suppressedKeys.has(code);
  }

  /**
   * Start listening for keyboard events on the given element (defaults to document)
   */
  attach(element: EventTarget = document): void {
    element.addEventListener('keydown', this.eventHandler as EventListener);
  }

  /**
   * Stop listening for keyboard events
   */
  detach(element: EventTarget = document): void {
    element.removeEventListener('keydown', this.eventHandler as EventListener);
  }

  /**
   * Handle keydown events
   */
  private handleKeydown(e: KeyboardEvent): void {
    if (!this.enabled) return;

    // A focused widget (roving toolbar, notes list, modal, ...) already
    // consumed this key - never double-fire a global shortcut on top of it.
    if (e.defaultPrevented) return;

    // Check key suppression FIRST, before any other processing.
    // This allows the virtual slider (and other external systems) to
    // prevent specific keys from triggering bindings.
    if (this.allKeysSuppressed || this.suppressedKeys.has(e.code)) {
      return;
    }

    // App shortcuts never fire while a modal dialog (confirm/prompt, shortcut
    // editor, ...) owns the keyboard.
    if (this.isInsideOpenModal(e.target)) return;

    // Skip if typing in input fields (except for specific global keys)
    if (this.shouldSkipEvent(e)) return;

    const combo: KeyCombination = {
      code: e.code,
      ctrl: e.ctrlKey || e.metaKey, // Treat meta as ctrl for cross-platform
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey && !e.ctrlKey, // Only set meta if ctrl is not pressed
    };

    const binding = this.findActiveBinding(this.comboToId(combo));

    // 1. User-customized bindings win over everything else, including the
    //    built-in context resolver's defaults on the same key.
    if (binding?.priority) {
      this.dispatch(e, binding.handler);
      return;
    }

    // 2. Context-aware resolution of keys shared by several actions.
    if (this.contextualResolver) {
      const resolved = this.contextualResolver.resolve(combo);
      if (resolved) {
        this.dispatch(e, resolved.handler);
        return;
      }
    }

    // 3. Plain bindings.
    if (binding) {
      this.dispatch(e, binding.handler);
    }
  }

  /**
   * Find the enabled binding for a combo id, preferring one scoped to the
   * active context over the global one. Context-scoped bindings whose context
   * is not active are ignored.
   */
  private findActiveBinding(comboId: string): KeyBinding | null {
    const active = this.getActiveContext();
    const candidates: Array<KeyBinding | undefined> = [];
    if (active !== null && active !== 'global') {
      candidates.push(this.bindings.get(this.bindingKey(comboId, active)));
    }
    candidates.push(this.bindings.get(comboId));
    if (active === null) {
      // No context information available: accept any scoped binding.
      for (const [key, b] of this.bindings) {
        if (key.startsWith(`${comboId}@`)) candidates.push(b);
      }
    }
    const usable = candidates.filter((b): b is KeyBinding => !!b && b.enabled !== false);
    return usable.find((b) => b.priority) ?? usable[0] ?? null;
  }

  /** Active context from the contextual resolver, or null when none is attached. */
  private getActiveContext(): BindingContext | null {
    return this.contextualResolver ? this.contextualResolver.getActiveContext() : null;
  }

  private dispatch(e: KeyboardEvent, handler: () => void): void {
    e.preventDefault();
    // A button that only has focus because it was clicked must not also be
    // activated by Space (activation happens on keyup). Drop that stray focus.
    const target = e.target;
    if (e.key === ' ' && isElement(target) && isButtonLike(target) && target instanceof HTMLElement) {
      target.blur();
    }
    handler();
  }

  private isInsideOpenModal(target: EventTarget | null): boolean {
    return isElement(target) && typeof target.closest === 'function' && target.closest(OPEN_MODAL_SELECTOR) !== null;
  }

  /**
   * Determine if the event should be skipped (when typing in inputs)
   */
  private shouldSkipEvent(e: KeyboardEvent): boolean {
    if (!isElement(e.target)) return false;
    const target = e.target as HTMLElement;

    // Check if target is a text input or textarea FIRST
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const input = target as HTMLInputElement;
      const isTextInput =
        input.type === 'text' ||
        input.type === 'search' ||
        input.type === 'password' ||
        input.type === 'email' ||
        input.type === 'url' ||
        input.type === 'tel' ||
        input.type === 'number' ||
        target instanceof HTMLTextAreaElement;

      if (isTextInput) {
        // When in text input, skip ALL keys to let the input handle them
        // This allows typing spaces, using Home/End for cursor movement, etc.
        return true;
      }
    }

    // Check if target is a <select> element - skip bare keys to allow native option selection
    if (target instanceof HTMLSelectElement) {
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
      if (!hasModifier) {
        return true;
      }
    }

    // Also check for contenteditable elements
    if (target.isContentEditable || target.getAttribute('contenteditable') === 'true') {
      return true;
    }

    const isBareKey = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    const isNavKey = NAVIGATION_KEYS.has(e.key);
    const isActivationKey = e.key === ' ' || e.key === 'Enter';

    // Range sliders own their arrow / Home / End / PageUp / PageDown keys.
    if (target instanceof HTMLInputElement && target.type === 'range' && isBareKey && isNavKey) {
      return true;
    }

    // Composite widgets (listbox, menu, tablist, tree, ...) own their
    // navigation and activation keys.
    if (isBareKey && (isNavKey || isActivationKey) && this.isInsideNavigationWidget(target)) {
      return true;
    }

    // Buttons: Enter always activates the button. Space activates it only when
    // the button was reached by keyboard; after a mouse click the stray focus
    // must not steal Space from play/pause.
    if (isButtonLike(target) && isBareKey) {
      if (e.key === 'Enter') return true;
      if (e.key === ' ' && isKeyboardFocused(target)) return true;
    }

    return false;
  }

  private isInsideNavigationWidget(target: Element): boolean {
    let el: Element | null = target;
    while (el) {
      const role = el.getAttribute('role');
      if (role && NAVIGATION_WIDGET_ROLES.has(role)) {
        // Tabs / radio toggles are clicked like plain buttons; after a mouse
        // click they should not keep swallowing playback keys.
        if (POINTER_RELEASED_ROLES.has(role) && !isKeyboardFocused(target)) return false;
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  /**
   * Parse a key string like "Ctrl+S" or "Shift+R" into a KeyCombination
   */
  private parseKeyString(keyStr: string): KeyCombination {
    if (!keyStr.trim()) {
      throw new Error('Invalid key string');
    }

    const parts = keyStr.split('+').map((p) => p.trim());
    if (parts.length === 0) {
      throw new Error('Invalid key string');
    }
    const combo: KeyCombination = { code: this.keyToCode(parts[parts.length - 1] ?? '') };

    if (!combo.code) {
      throw new Error('Invalid key string');
    }

    for (let i = 0; i < parts.length - 1; i++) {
      const modifier = (parts[i] ?? '').toLowerCase();
      switch (modifier) {
        case 'ctrl':
        case 'control':
          combo.ctrl = true;
          break;
        case 'shift':
          combo.shift = true;
          break;
        case 'alt':
          combo.alt = true;
          break;
        case 'meta':
        case 'cmd':
        case 'command':
          combo.meta = true;
          break;
      }
    }

    return combo;
  }

  /**
   * Convert a KeyCombination to a unique string ID
   */
  private comboToId(combo: KeyCombination): string {
    if (!combo.code) {
      throw new Error('KeyCombination must have a code property');
    }
    const parts = [];
    if (combo.ctrl) parts.push('ctrl');
    if (combo.shift) parts.push('shift');
    if (combo.alt) parts.push('alt');
    if (combo.meta && !combo.ctrl) parts.push('meta'); // Don't include meta if ctrl is set (cross-platform compatibility)
    parts.push(combo.code.toLowerCase());
    return parts.join('+');
  }

  /**
   * Convert an English key character to its corresponding code
   */
  private keyToCode(key: string): string {
    // Handle special keys
    switch (key) {
      case ' ':
        return 'Space';
      case 'ArrowUp':
        return 'ArrowUp';
      case 'ArrowDown':
        return 'ArrowDown';
      case 'ArrowLeft':
        return 'ArrowLeft';
      case 'ArrowRight':
        return 'ArrowRight';
      case 'Home':
        return 'Home';
      case 'End':
        return 'End';
      case 'Escape':
        return 'Escape';
      case '[':
        return 'BracketLeft';
      case ']':
        return 'BracketRight';
      case ',':
        return 'Comma';
      case '.':
        return 'Period';
      case '`':
        return 'Backquote';
      case '~':
        return 'Backquote'; // Shift+Backquote
      default:
        // For letters and digits, convert to KeyX or DigitX format
        if (key.length === 1) {
          if (/[a-zA-Z]/.test(key)) {
            return 'Key' + key.toUpperCase();
          } else if (/[0-9]/.test(key)) {
            return 'Digit' + key;
          }
        }
        return key;
    }
  }
}
