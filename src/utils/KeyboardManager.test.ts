/**
 * KeyboardManager Tests
 *
 * Tests for the centralized keyboard shortcut management system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyboardManager, KeyCombination } from './KeyboardManager';

describe('KeyboardManager', () => {
  let keyboardManager: KeyboardManager;
  let mockHandler: () => void;

  beforeEach(() => {
    keyboardManager = new KeyboardManager();
    mockHandler = vi.fn();
  });

  describe('registration', () => {
    it('KBM-001: registers a key combination with handler', () => {
      const combo: KeyCombination = { code: 'KeyA' };
      keyboardManager.register(combo, mockHandler, 'Test action');

      expect(keyboardManager.isRegistered(combo)).toBe(true);
    });

    it('KBM-002: registers a key string with handler', () => {
      keyboardManager.register('Ctrl+S', mockHandler, 'Save');

      expect(keyboardManager.isRegistered({ code: 'KeyS', ctrl: true })).toBe(true);
    });

    it('KBM-003: registers binding object directly', () => {
      const binding = {
        code: 'KeyB',
        shift: true,
        description: 'Bold'
      };
      keyboardManager.register(binding, mockHandler);

      expect(keyboardManager.isRegistered({ code: 'KeyB', shift: true })).toBe(true);
    });

    it('KBM-004: allows multiple registrations for different combinations', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      keyboardManager.register({ code: 'KeyA' }, handler1);
      keyboardManager.register({ code: 'KeyB' }, handler2);

      expect(keyboardManager.isRegistered({ code: 'KeyA' })).toBe(true);
      expect(keyboardManager.isRegistered({ code: 'KeyB' })).toBe(true);
    });

    it('KBM-005: overwrites existing binding when registering same combination', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      keyboardManager.register({ code: 'KeyA' }, handler1, 'First');
      keyboardManager.register({ code: 'KeyA' }, handler2, 'Second');

      // Simulate key press
      const mockEvent = {
        code: 'KeyA',
        key: 'a',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('unregistration', () => {
    it('KBM-006: unregisters a key combination', () => {
      const combo: KeyCombination = { code: 'KeyX' };
      keyboardManager.register(combo, mockHandler);
      expect(keyboardManager.isRegistered(combo)).toBe(true);

      keyboardManager.unregister(combo);
      expect(keyboardManager.isRegistered(combo)).toBe(false);
    });

    it('KBM-007: unregisters a key string', () => {
      keyboardManager.register('Ctrl+Z', mockHandler);
      expect(keyboardManager.isRegistered({ code: 'KeyZ', ctrl: true })).toBe(true);

      keyboardManager.unregister('Ctrl+Z');
      expect(keyboardManager.isRegistered({ code: 'KeyZ', ctrl: true })).toBe(false);
    });
  });

  describe('key parsing', () => {
    it('KBM-008: parses simple key', () => {
      const combo = keyboardManager['parseKeyString']('a');
      expect(combo).toEqual({ code: 'KeyA' });
    });

    it('KBM-009: parses Ctrl modifier', () => {
      const combo = keyboardManager['parseKeyString']('Ctrl+S');
      expect(combo).toEqual({ code: 'KeyS', ctrl: true });
    });

    it('KBM-010: parses Shift modifier', () => {
      const combo = keyboardManager['parseKeyString']('Shift+A');
      expect(combo).toEqual({ code: 'KeyA', shift: true });
    });

    it('KBM-011: parses Alt modifier', () => {
      const combo = keyboardManager['parseKeyString']('Alt+X');
      expect(combo).toEqual({ code: 'KeyX', alt: true });
    });

    it('KBM-012: parses Meta modifier', () => {
      const combo = keyboardManager['parseKeyString']('Meta+V');
      expect(combo).toEqual({ code: 'KeyV', meta: true });
    });

    it('KBM-013: parses multiple modifiers', () => {
      const combo = keyboardManager['parseKeyString']('Ctrl+Shift+S');
      expect(combo).toEqual({ code: 'KeyS', ctrl: true, shift: true });
    });

    it('KBM-014: handles case insensitive modifiers', () => {
      const combo = keyboardManager['parseKeyString']('ctrl+shift+s');
      expect(combo).toEqual({ code: 'KeyS', ctrl: true, shift: true });
    });

    it('KBM-015: handles alternative modifier names', () => {
      const combo = keyboardManager['parseKeyString']('Cmd+Shift+P');
      expect(combo).toEqual({ code: 'KeyP', meta: true, shift: true });
    });
  });

  describe('key combination ID generation', () => {
    it('KBM-016: generates unique ID for simple key', () => {
      const combo: KeyCombination = { code: 'KeyA' };
      const id = keyboardManager['comboToId'](combo);
      expect(id).toBe('keya');
    });

    it('KBM-017: generates unique ID for modified key', () => {
      const combo: KeyCombination = { code: 'KeyS', ctrl: true };
      const id = keyboardManager['comboToId'](combo);
      expect(id).toBe('ctrl+keys');
    });

    it('KBM-018: generates unique ID for multiple modifiers', () => {
      const combo: KeyCombination = { code: 'KeyS', ctrl: true, shift: true };
      const id = keyboardManager['comboToId'](combo);
      expect(id).toBe('ctrl+shift+keys');
    });

    it('KBM-019: normalizes key case', () => {
      const combo: KeyCombination = { code: 'KeyA' };
      const id = keyboardManager['comboToId'](combo);
      expect(id).toBe('keya');
    });
  });

  describe('event handling', () => {
    beforeEach(() => {
      keyboardManager.attach();
    });

    it('KBM-020: calls handler when key combination matches', () => {
      keyboardManager.register({ code: 'KeyB', ctrl: true }, mockHandler);

      const mockEvent = {
        code: 'KeyB',
        key: 'b',
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).toHaveBeenCalled();
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it('KBM-021: does not call handler when key combination does not match', () => {
      keyboardManager.register({ code: 'KeyB', ctrl: true }, mockHandler);

      const mockEvent = {
        code: 'KeyB',
        key: 'b',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('KBM-022: skips events when typing in input fields', () => {
      keyboardManager.register({ code: 'KeyA' }, mockHandler);

      const mockInput = document.createElement('input');
      mockInput.type = 'text';

      const mockEvent = {
        code: 'KeyA',
        key: 'a',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('KBM-023: allows global keys in input fields', () => {
      keyboardManager.register({ code: 'Escape' }, mockHandler);

      const mockInput = document.createElement('input');
      mockInput.type = 'text';

      const mockEvent = {
        code: 'Escape',
        key: 'Escape',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('KBM-024: treats meta key as ctrl for cross-platform compatibility', () => {
      keyboardManager.register({ code: 'KeyS', ctrl: true }, mockHandler);

      const mockEvent = {
        code: 'KeyS',
        key: 's',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true, // Meta key pressed instead of Ctrl
        preventDefault: vi.fn(),
        target: document.body
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe('enable/disable', () => {
    it('KBM-025: disables event handling when set to false', () => {
      keyboardManager.register({ code: 'KeyC' }, mockHandler);
      keyboardManager.setEnabled(false);

      const mockEvent = {
        code: 'KeyC',
        key: 'c',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('KBM-026: re-enables event handling when set to true', () => {
      keyboardManager.register({ code: 'KeyD' }, mockHandler);
      keyboardManager.setEnabled(false);
      keyboardManager.setEnabled(true);

      const mockEvent = {
        code: 'KeyD',
        key: 'd',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe('binding management', () => {
    it('KBM-027: returns all registered bindings', () => {
      const binding1 = { code: 'KeyA', description: 'Action A' };
      const binding2 = { code: 'KeyB', ctrl: true, description: 'Action B' };

      keyboardManager.register(binding1, mockHandler);
      keyboardManager.register(binding2, vi.fn());

      const bindings = keyboardManager.getBindings();
      expect(bindings).toHaveLength(2);

      const bindingIds = bindings.map(b => keyboardManager['comboToId'](b.combo));
      expect(bindingIds).toContain('keya');
      expect(bindingIds).toContain('ctrl+keyb');
    });

    it('KBM-028: preserves binding descriptions', () => {
      const description = 'Test description';
      keyboardManager.register({ code: 'KeyT' }, mockHandler, description);

      const bindings = keyboardManager.getBindings();
      const binding = bindings.find(b => b.combo.code === 'KeyT');
      expect(binding?.description).toBe(description);
    });
  });

  describe('attachment/detachment', () => {
    it('KBM-029: attaches to specified element', () => {
      const mockElement = { addEventListener: vi.fn() } as any;
      keyboardManager.attach(mockElement);

      expect(mockElement.addEventListener).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      );
    });

    it('KBM-030: detaches from specified element', () => {
      const mockElement = { removeEventListener: vi.fn() } as any;
      keyboardManager.detach(mockElement);

      expect(mockElement.removeEventListener).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function)
      );
    });

    it('KBM-031: attaches to document by default', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      keyboardManager.attach();

      expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      addSpy.mockRestore();
    });

    it('KBM-032: detaches from document by default', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      keyboardManager.detach();

      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      removeSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('KBM-033: handles empty key string gracefully', () => {
      expect(() => {
        keyboardManager['parseKeyString']('');
      }).toThrow('Invalid key string');
    });

    it('KBM-034: handles key with no modifiers', () => {
      const combo = keyboardManager['parseKeyString']('Enter');
      expect(combo).toEqual({ code: 'Enter' });
    });

    it('KBM-035: handles special keys', () => {
      const combo = keyboardManager['parseKeyString']('ArrowUp');
      expect(combo).toEqual({ code: 'ArrowUp' });
    });

    it('KBM-036: normalizes modifier order', () => {
      const combo1 = keyboardManager['parseKeyString']('Ctrl+Shift+X');
      const combo2 = keyboardManager['parseKeyString']('Shift+Ctrl+X');

      const id1 = keyboardManager['comboToId'](combo1);
      const id2 = keyboardManager['comboToId'](combo2);

      expect(id1).toBe(id2);
    });
  });

  describe('clearAll', () => {
    it('KBM-037: clears all registered bindings', () => {
      keyboardManager.register({ code: 'KeyA' }, mockHandler);
      keyboardManager.register({ code: 'KeyB' }, mockHandler);
      keyboardManager.register({ code: 'KeyC', ctrl: true }, mockHandler);

      expect(keyboardManager.getBindings()).toHaveLength(3);

      keyboardManager.clearAll();

      expect(keyboardManager.getBindings()).toHaveLength(0);
      expect(keyboardManager.isRegistered({ code: 'KeyA' })).toBe(false);
      expect(keyboardManager.isRegistered({ code: 'KeyB' })).toBe(false);
      expect(keyboardManager.isRegistered({ code: 'KeyC', ctrl: true })).toBe(false);
    });
  });
});
