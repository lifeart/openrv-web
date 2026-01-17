/**
 * Keyboard Manager - Centralized keyboard shortcut handling
 *
 * Provides a flexible system for registering, managing, and dispatching keyboard shortcuts.
 * Supports modifier keys and allows for easy reconfiguration of key bindings.
 */

export interface KeyCombination {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export interface KeyBinding {
  combo: KeyCombination;
  handler: () => void;
  description?: string;
  enabled?: boolean;
}

export class KeyboardManager {
  private bindings: Map<string, KeyBinding> = new Map();
  private eventHandler: (e: KeyboardEvent) => void;
  private enabled = true;

  constructor() {
    this.eventHandler = this.handleKeydown.bind(this);
  }

  /**
   * Register a keyboard shortcut
   */
  register(key: string | KeyCombination, handler: () => void, description?: string): void;
  register(binding: KeyCombination & { description: string }, handler: () => void): void;
  register(keyOrBinding: string | KeyCombination | (KeyCombination & { description: string }), handler: () => void, description?: string): void {
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

    const id = this.comboToId(combo);

    this.bindings.set(id, {
      combo,
      handler,
      description: desc,
      enabled: true
    });
  }

  /**
   * Unregister a keyboard shortcut
   */
  unregister(key: string | KeyCombination): void {
    const combo = typeof key === 'string' ? this.parseKeyString(key) : key;
    const id = this.comboToId(combo);
    this.bindings.delete(id);
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
    return this.bindings.has(id);
  }

  /**
   * Get all registered bindings
   */
  getBindings(): KeyBinding[] {
    return Array.from(this.bindings.values());
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

    // Skip if typing in input fields (except for specific global keys)
    if (this.shouldSkipEvent(e)) return;

    const combo: KeyCombination = {
      key: e.key,
      ctrl: e.ctrlKey || e.metaKey, // Treat meta as ctrl for cross-platform
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey && !e.ctrlKey // Only set meta if ctrl is not pressed
    };

    const id = this.comboToId(combo);
    const binding = this.bindings.get(id);

    if (binding && binding.enabled) {
      e.preventDefault();
      binding.handler();
    }
  }

  /**
   * Determine if the event should be skipped (when typing in inputs)
   */
  private shouldSkipEvent(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement;

    // Allow global keys that should always work
    const globalKeys = [' ', 'Escape', 'Home', 'End'];
    if (globalKeys.includes(e.key)) {
      return false;
    }

    // Skip if target is a text input
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const input = target as HTMLInputElement;
      const isTextInput = input.type === 'text' || input.type === 'search' ||
                          input.type === 'password' || input.type === 'email' ||
                          input.type === 'url' || input.type === 'tel' ||
                          target instanceof HTMLTextAreaElement;
      return isTextInput;
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
    
    const parts = keyStr.split('+').map(p => p.trim());
    if (parts.length === 0) {
      throw new Error('Invalid key string');
    }
    const combo: KeyCombination = { key: parts[parts.length - 1]!.length === 1 ? parts[parts.length - 1]!.toLowerCase() : parts[parts.length - 1]! };

    if (!combo.key) {
      throw new Error('Invalid key string');
    }

    for (let i = 0; i < parts.length - 1; i++) {
      const modifier = parts[i]!.toLowerCase();
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
    const parts = [];
    if (combo.ctrl) parts.push('ctrl');
    if (combo.shift) parts.push('shift');
    if (combo.alt) parts.push('alt');
    if (combo.meta && !combo.ctrl) parts.push('meta'); // Don't include meta if ctrl is set (cross-platform compatibility)
    parts.push(combo.key.toLowerCase());
    return parts.join('+');
  }
}