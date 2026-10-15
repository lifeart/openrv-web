/**
 * KeyboardManager Tests
 *
 * Tests for the centralized keyboard shortcut management system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeyboardManager, type KeyCombination } from './KeyboardManager';
import { ActiveContextManager } from './ActiveContextManager';
import { ContextualKeyboardManager } from './ContextualKeyboardManager';

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
        description: 'Bold',
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
        target: document.body,
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
        target: document.body,
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
        target: document.body,
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
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('KBM-023: skips all keys in input fields including Escape', () => {
      // All keys should be skipped in input fields to allow normal text editing
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
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      // Should NOT be called - input field handles Escape for canceling edits
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('KBM-023b: skips events when typing in contenteditable elements', () => {
      keyboardManager.register({ code: 'KeyA' }, mockHandler);

      const mockDiv = document.createElement('div');
      mockDiv.setAttribute('contenteditable', 'true');

      const mockEvent = {
        code: 'KeyA',
        key: 'a',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockDiv,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      // Should NOT be called - contenteditable handles text input
      expect(mockHandler).not.toHaveBeenCalled();
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
        target: document.body,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('KBM-024b: respects contextual keyboard manager', () => {
      const globalHandler = vi.fn();
      const contextualHandler = vi.fn();
      keyboardManager.register({ code: 'KeyR' }, globalHandler, 'Global R');

      const mockContextualManager = {
        resolve: vi.fn().mockReturnValue({ handler: contextualHandler, description: 'Context R' }),
        getActiveContext: () => 'global',
      };

      keyboardManager.setContextualManager(mockContextualManager as any);

      const mockEvent = {
        code: 'KeyR',
        key: 'r',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockContextualManager.resolve).toHaveBeenCalledWith({
        code: 'KeyR',
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
      });
      expect(contextualHandler).toHaveBeenCalled();
      expect(globalHandler).not.toHaveBeenCalled();
      expect(mockEvent.preventDefault).toHaveBeenCalled();
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
        target: document.body,
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
        target: document.body,
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

      const bindingIds = bindings.map((b) => keyboardManager['comboToId'](b.combo));
      expect(bindingIds).toContain('keya');
      expect(bindingIds).toContain('ctrl+keyb');
    });

    it('KBM-028: preserves binding descriptions', () => {
      const description = 'Test description';
      keyboardManager.register({ code: 'KeyT' }, mockHandler, description);

      const bindings = keyboardManager.getBindings();
      const binding = bindings.find((b) => b.combo.code === 'KeyT');
      expect(binding?.description).toBe(description);
    });
  });

  describe('attachment/detachment', () => {
    it('KBM-029: attaches to specified element', () => {
      const mockElement = { addEventListener: vi.fn() } as any;
      keyboardManager.attach(mockElement);

      expect(mockElement.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('KBM-030: detaches from specified element', () => {
      const mockElement = { removeEventListener: vi.fn() } as any;
      keyboardManager.detach(mockElement);

      expect(mockElement.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
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

  describe('playback keyboard controls', () => {
    it('KBM-038: Space key triggers playback toggle', () => {
      const toggleHandler = vi.fn();
      keyboardManager.register({ code: 'Space' }, toggleHandler, 'Toggle playback');

      const mockEvent = {
        code: 'Space',
        key: ' ',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(toggleHandler).toHaveBeenCalledTimes(1);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it('KBM-039: Arrow keys trigger step navigation', () => {
      const stepForward = vi.fn();
      const stepBackward = vi.fn();

      keyboardManager.register({ code: 'ArrowRight' }, stepForward, 'Step forward');
      keyboardManager.register({ code: 'ArrowLeft' }, stepBackward, 'Step backward');

      const rightEvent = {
        code: 'ArrowRight',
        key: 'ArrowRight',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body,
      } as any;

      const leftEvent = {
        code: 'ArrowLeft',
        key: 'ArrowLeft',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body,
      } as any;

      keyboardManager['handleKeydown'](rightEvent);
      keyboardManager['handleKeydown'](leftEvent);

      expect(stepForward).toHaveBeenCalledTimes(1);
      expect(stepBackward).toHaveBeenCalledTimes(1);
    });

    it('KBM-040: Home and End keys trigger go to start/end', () => {
      const goToStart = vi.fn();
      const goToEnd = vi.fn();

      keyboardManager.register({ code: 'Home' }, goToStart, 'Go to start');
      keyboardManager.register({ code: 'End' }, goToEnd, 'Go to end');

      const homeEvent = {
        code: 'Home',
        key: 'Home',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body,
      } as any;

      const endEvent = {
        code: 'End',
        key: 'End',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body,
      } as any;

      keyboardManager['handleKeydown'](homeEvent);
      keyboardManager['handleKeydown'](endEvent);

      expect(goToStart).toHaveBeenCalledTimes(1);
      expect(goToEnd).toHaveBeenCalledTimes(1);
    });

    it('KBM-041: playback controls work when disabled then re-enabled', () => {
      const toggleHandler = vi.fn();
      keyboardManager.register({ code: 'Space' }, toggleHandler, 'Toggle playback');

      // Disable keyboard
      keyboardManager.setEnabled(false);

      const mockEvent1 = {
        code: 'Space',
        key: ' ',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body,
      } as any;

      keyboardManager['handleKeydown'](mockEvent1);
      expect(toggleHandler).not.toHaveBeenCalled();

      // Re-enable keyboard
      keyboardManager.setEnabled(true);

      const mockEvent2 = {
        code: 'Space',
        key: ' ',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body,
      } as any;

      keyboardManager['handleKeydown'](mockEvent2);
      expect(toggleHandler).toHaveBeenCalledTimes(1);
    });

    it('KBM-042: playback keys are skipped in input fields to allow text editing', () => {
      // All keys should be skipped in input fields to allow normal text editing
      // Space should insert space, Home/End should move cursor
      const toggleHandler = vi.fn();
      const goToStart = vi.fn();
      const goToEnd = vi.fn();

      keyboardManager.register({ code: 'Space' }, toggleHandler, 'Toggle playback');
      keyboardManager.register({ code: 'Home' }, goToStart, 'Go to start');
      keyboardManager.register({ code: 'End' }, goToEnd, 'Go to end');

      const mockInput = document.createElement('input');
      mockInput.type = 'text';

      // Space should be skipped in input (let input handle it for typing)
      const spaceEvent = {
        code: 'Space',
        key: ' ',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      // Home should be skipped in input (let input handle cursor movement)
      const homeEvent = {
        code: 'Home',
        key: 'Home',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      // End should be skipped in input (let input handle cursor movement)
      const endEvent = {
        code: 'End',
        key: 'End',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](spaceEvent);
      keyboardManager['handleKeydown'](homeEvent);
      keyboardManager['handleKeydown'](endEvent);

      // None should be called - input field needs these keys for text editing
      expect(toggleHandler).not.toHaveBeenCalled();
      expect(goToStart).not.toHaveBeenCalled();
      expect(goToEnd).not.toHaveBeenCalled();
    });

    it('KBM-043: ArrowUp toggles play direction', () => {
      const toggleDirection = vi.fn();
      keyboardManager.register({ code: 'ArrowUp' }, toggleDirection, 'Toggle direction');

      const mockEvent = {
        code: 'ArrowUp',
        key: 'ArrowUp',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(toggleDirection).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('KBM-044: comboToId throws error for undefined code', () => {
      const invalidCombo = { code: undefined } as any;

      expect(() => {
        keyboardManager['comboToId'](invalidCombo);
      }).toThrow('KeyCombination must have a code property');
    });

    it('KBM-045: comboToId throws error for empty code', () => {
      const invalidCombo = { code: '' } as any;

      expect(() => {
        keyboardManager['comboToId'](invalidCombo);
      }).toThrow('KeyCombination must have a code property');
    });
  });

  describe('input field isolation', () => {
    it('KBM-050: skips events when typing in number input', () => {
      keyboardManager.register({ code: 'KeyA' }, mockHandler);

      const mockInput = document.createElement('input');
      mockInput.type = 'number';

      const mockEvent = {
        code: 'KeyA',
        key: 'a',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('KBM-051: skips events when typing in search input', () => {
      keyboardManager.register({ code: 'KeyS' }, mockHandler);

      const mockInput = document.createElement('input');
      mockInput.type = 'search';

      const mockEvent = {
        code: 'KeyS',
        key: 's',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('KBM-052: skips events when typing in password input', () => {
      keyboardManager.register({ code: 'KeyP' }, mockHandler);

      const mockInput = document.createElement('input');
      mockInput.type = 'password';

      const mockEvent = {
        code: 'KeyP',
        key: 'p',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('KBM-053: skips events when typing in email input', () => {
      keyboardManager.register({ code: 'KeyE' }, mockHandler);

      const mockInput = document.createElement('input');
      mockInput.type = 'email';

      const mockEvent = {
        code: 'KeyE',
        key: 'e',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('KBM-054: skips events when typing in url input', () => {
      keyboardManager.register({ code: 'KeyU' }, mockHandler);

      const mockInput = document.createElement('input');
      mockInput.type = 'url';

      const mockEvent = {
        code: 'KeyU',
        key: 'u',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('KBM-055: skips events when typing in tel input', () => {
      keyboardManager.register({ code: 'Digit1' }, mockHandler);

      const mockInput = document.createElement('input');
      mockInput.type = 'tel';

      const mockEvent = {
        code: 'Digit1',
        key: '1',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('KBM-056: skips events when typing in textarea', () => {
      keyboardManager.register({ code: 'KeyT' }, mockHandler);

      const mockTextarea = document.createElement('textarea');

      const mockEvent = {
        code: 'KeyT',
        key: 't',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockTextarea,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('KBM-057: allows shortcuts on checkbox input', () => {
      keyboardManager.register({ code: 'Space' }, mockHandler);

      const mockInput = document.createElement('input');
      mockInput.type = 'checkbox';

      const mockEvent = {
        code: 'Space',
        key: ' ',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('KBM-058: allows shortcuts on range input (slider)', () => {
      keyboardManager.register({ code: 'Space' }, mockHandler);

      const mockInput = document.createElement('input');
      mockInput.type = 'range';

      const mockEvent = {
        code: 'Space',
        key: ' ',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('KBM-059: Space key does not toggle playback in number input', () => {
      const toggleHandler = vi.fn();
      keyboardManager.register({ code: 'Space' }, toggleHandler, 'Toggle playback');

      const mockInput = document.createElement('input');
      mockInput.type = 'number';

      const mockEvent = {
        code: 'Space',
        key: ' ',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(toggleHandler).not.toHaveBeenCalled();
    });

    it('KBM-060: number keys do not switch tabs in number input', () => {
      const tabHandler = vi.fn();
      keyboardManager.register({ code: 'Digit1' }, tabHandler, 'Switch to tab 1');

      const mockInput = document.createElement('input');
      mockInput.type = 'number';

      const mockEvent = {
        code: 'Digit1',
        key: '1',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(tabHandler).not.toHaveBeenCalled();
    });

    it('KBM-061: arrow keys do not navigate frames in number input', () => {
      const stepForward = vi.fn();
      keyboardManager.register({ code: 'ArrowRight' }, stepForward, 'Step forward');

      const mockInput = document.createElement('input');
      mockInput.type = 'number';

      const mockEvent = {
        code: 'ArrowRight',
        key: 'ArrowRight',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(stepForward).not.toHaveBeenCalled();
    });

    it('KBM-062: Home/End keys do not navigate timeline in number input', () => {
      const goToStart = vi.fn();
      const goToEnd = vi.fn();
      keyboardManager.register({ code: 'Home' }, goToStart, 'Go to start');
      keyboardManager.register({ code: 'End' }, goToEnd, 'Go to end');

      const mockInput = document.createElement('input');
      mockInput.type = 'number';

      const homeEvent = {
        code: 'Home',
        key: 'Home',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      const endEvent = {
        code: 'End',
        key: 'End',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput,
      } as any;

      keyboardManager['handleKeydown'](homeEvent);
      keyboardManager['handleKeydown'](endEvent);

      expect(goToStart).not.toHaveBeenCalled();
      expect(goToEnd).not.toHaveBeenCalled();
    });

    it('KBM-063: allows shortcuts on button elements', () => {
      keyboardManager.register({ code: 'KeyA' }, mockHandler);

      const mockButton = document.createElement('button');

      const mockEvent = {
        code: 'KeyA',
        key: 'a',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockButton,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('KBM-064: allows shortcuts on div elements', () => {
      keyboardManager.register({ code: 'KeyA' }, mockHandler);

      const mockDiv = document.createElement('div');

      const mockEvent = {
        code: 'KeyA',
        key: 'a',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockDiv,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe('select element isolation', () => {
    it('KM-H01a: when a <select> is focused, pressing letter keys should NOT trigger action handlers', () => {
      keyboardManager.register({ code: 'KeyA' }, mockHandler, 'Some action');

      const mockSelect = document.createElement('select');

      const mockEvent = {
        code: 'KeyA',
        key: 'a',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockSelect,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('KM-H01b: when a <select> is focused, pressing arrow keys should NOT trigger action handlers', () => {
      const stepForward = vi.fn();
      const stepBackward = vi.fn();
      keyboardManager.register({ code: 'ArrowDown' }, stepForward, 'Step forward');
      keyboardManager.register({ code: 'ArrowUp' }, stepBackward, 'Step backward');

      const mockSelect = document.createElement('select');

      const downEvent = {
        code: 'ArrowDown',
        key: 'ArrowDown',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockSelect,
      } as any;

      const upEvent = {
        code: 'ArrowUp',
        key: 'ArrowUp',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockSelect,
      } as any;

      keyboardManager['handleKeydown'](downEvent);
      keyboardManager['handleKeydown'](upEvent);

      expect(stepForward).not.toHaveBeenCalled();
      expect(stepBackward).not.toHaveBeenCalled();
    });

    it('KM-H01c: when a <select> is focused, modifier combos (Ctrl+Z) should still be handled by the manager', () => {
      const undoHandler = vi.fn();
      keyboardManager.register({ code: 'KeyZ', ctrl: true }, undoHandler, 'Undo');

      const mockSelect = document.createElement('select');

      const mockEvent = {
        code: 'KeyZ',
        key: 'z',
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockSelect,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(undoHandler).toHaveBeenCalledTimes(1);
    });

    it('KM-H01c2: when a <select> is focused, Meta+key combos (Cmd+Z on macOS) should still be handled by the manager', () => {
      const undoHandler = vi.fn();
      keyboardManager.register({ code: 'KeyZ', ctrl: true }, undoHandler, 'Undo');

      const mockSelect = document.createElement('select');

      const mockEvent = {
        code: 'KeyZ',
        key: 'z',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
        preventDefault: vi.fn(),
        target: mockSelect,
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(undoHandler).toHaveBeenCalledTimes(1);
    });

    it('KM-H01d: after <select> loses focus (blur), keyboard shortcuts resume working normally', () => {
      keyboardManager.register({ code: 'KeyA' }, mockHandler, 'Some action');

      const mockSelect = document.createElement('select');

      // First, press key while select is focused - should be skipped
      const eventOnSelect = {
        code: 'KeyA',
        key: 'a',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockSelect,
      } as any;

      keyboardManager['handleKeydown'](eventOnSelect);
      expect(mockHandler).not.toHaveBeenCalled();

      // After blur, press same key on body - should trigger handler
      const eventOnBody = {
        code: 'KeyA',
        key: 'a',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body,
      } as any;

      keyboardManager['handleKeydown'](eventOnBody);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });
});

describe('KeyboardManager double-fire / precedence fixes', () => {
  let km: KeyboardManager;
  let contexts: ActiveContextManager;
  let contextual: ContextualKeyboardManager;
  // Listen on an isolated root so managers leaked onto `document` by the
  // legacy tests above cannot interfere.
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    km = new KeyboardManager();
    contexts = new ActiveContextManager();
    contextual = new ContextualKeyboardManager(contexts);
    km.setContextualManager(contextual);
    km.attach(root);
    // Keep the events from bubbling to listeners leaked onto `document`.
    root.addEventListener('keydown', (e) => e.stopPropagation());
  });

  afterEach(() => {
    km.detach(root);
    root.remove();
  });

  function press(target: EventTarget, code: string, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  function mount<T extends HTMLElement>(el: T, parent: HTMLElement = root): T {
    parent.appendChild(el);
    return el;
  }

  it('KBM-DP-001: skips events already defaultPrevented by a focused widget', () => {
    const step = vi.fn();
    km.register({ code: 'ArrowRight' }, step);
    const list = mount(document.createElement('div'));
    list.tabIndex = 0;
    const listHandler = (e: KeyboardEvent) => e.preventDefault();
    list.addEventListener('keydown', listHandler);

    press(list, 'ArrowRight', 'ArrowRight');
    expect(step).not.toHaveBeenCalled();

    press(root, 'ArrowRight', 'ArrowRight');
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('KBM-DP-002: preventDefaults keys it handles', () => {
    km.register({ code: 'KeyF' }, vi.fn());
    const handled = press(root, 'KeyF', 'f');
    expect(handled.defaultPrevented).toBe(true);
    const unhandled = press(root, 'KeyQ', 'q');
    expect(unhandled.defaultPrevented).toBe(false);
  });

  it('KBM-DP-003: skips events inside an open modal dialog', () => {
    const handler = vi.fn();
    km.register({ code: 'KeyF' }, handler);
    const dialog = mount(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const btn = mount(document.createElement('button'), dialog);

    press(btn, 'KeyF', 'f');
    expect(handler).not.toHaveBeenCalled();

    // A non-modal dialog (e.g. the cheat sheet) does not block shortcuts
    dialog.removeAttribute('aria-modal');
    press(btn, 'KeyF', 'f');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('KBM-DP-004: Space on a mouse-focused button plays instead of activating it', () => {
    const toggle = vi.fn();
    km.register({ code: 'Space' }, toggle);
    const btn = mount(document.createElement('button'));
    btn.focus();
    // Simulate focus from a mouse click: browsers do not match :focus-visible
    const matches = btn.matches.bind(btn);
    vi.spyOn(btn, 'matches').mockImplementation((sel: string) => (sel === ':focus-visible' ? false : matches(sel)));

    const ev = press(btn, 'Space', ' ');
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(btn);
  });

  it('KBM-DP-005: Space / Enter on a keyboard-focused button activate the button', () => {
    const toggle = vi.fn();
    km.register({ code: 'Space' }, toggle);
    km.register({ code: 'Enter' }, toggle);
    const btn = mount(document.createElement('button'));
    btn.focus(); // jsdom: programmatic focus matches :focus-visible

    const space = press(btn, 'Space', ' ');
    const enter = press(btn, 'Enter', 'Enter');
    expect(toggle).not.toHaveBeenCalled();
    expect(space.defaultPrevented).toBe(false);
    expect(enter.defaultPrevented).toBe(false);
  });

  it('KBM-DP-006: arrow keys inside listbox / menu widgets are left to the widget', () => {
    const step = vi.fn();
    km.register({ code: 'ArrowDown' }, step);
    for (const role of ['listbox', 'menu', 'tree', 'grid']) {
      const widget = mount(document.createElement('div'));
      widget.setAttribute('role', role);
      const item = mount(document.createElement('div'), widget);
      item.tabIndex = 0;
      press(item, 'ArrowDown', 'ArrowDown');
    }
    expect(step).not.toHaveBeenCalled();
  });

  it('KBM-DP-007: arrows on a range slider still step frames', () => {
    const step = vi.fn();
    km.register({ code: 'ArrowRight' }, step);
    const range = mount(document.createElement('input'));
    range.type = 'range';
    press(range, 'ArrowRight', 'ArrowRight');
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('KBM-DP-008: a mouse-clicked tab does not swallow arrow keys', () => {
    const step = vi.fn();
    km.register({ code: 'ArrowRight' }, step);
    const tablist = mount(document.createElement('div'));
    tablist.setAttribute('role', 'tablist');
    const tab = mount(document.createElement('button'), tablist);
    tab.setAttribute('role', 'tab');
    // Not focused / not focus-visible -> treated as pointer interaction
    press(tab, 'ArrowRight', 'ArrowRight');
    expect(step).toHaveBeenCalledTimes(1);

    tab.focus(); // keyboard focus (jsdom matches :focus-visible)
    press(tab, 'ArrowRight', 'ArrowRight');
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('KBM-CTX-001: context-scoped bindings only fire in their context', () => {
    const pen = vi.fn();
    km.register({ code: 'KeyP' }, pen, 'Pen', { context: 'paint' });

    contexts.setContext('viewer');
    expect(press(root, 'KeyP', 'p').defaultPrevented).toBe(false);
    expect(pen).not.toHaveBeenCalled();

    contexts.setContext('paint');
    press(root, 'KeyP', 'p');
    expect(pen).toHaveBeenCalledTimes(1);
  });

  it('KBM-CTX-002: scoped and global bindings on the same key coexist', () => {
    const global = vi.fn();
    const paint = vi.fn();
    km.register({ code: 'KeyB' }, global);
    km.register({ code: 'KeyB' }, paint, 'Brush', { context: 'paint' });

    press(root, 'KeyB', 'b');
    expect(global).toHaveBeenCalledTimes(1);
    contexts.setContext('paint');
    press(root, 'KeyB', 'b');
    expect(paint).toHaveBeenCalledTimes(1);
    expect(global).toHaveBeenCalledTimes(1);

    km.unregister({ code: 'KeyB' });
    expect(km.isRegistered({ code: 'KeyB' })).toBe(false);
  });

  it('KBM-PRI-001: priority (user custom) bindings beat the contextual resolver', () => {
    const builtIn = vi.fn();
    const custom = vi.fn();
    contextual.register('timeline.setOutPoint', { code: 'KeyO' }, builtIn, 'global');
    km.register({ code: 'KeyO' }, custom, 'Custom', { priority: true });

    press(root, 'KeyO', 'o');
    expect(custom).toHaveBeenCalledTimes(1);
    expect(builtIn).not.toHaveBeenCalled();
  });

  it('KBM-PRI-002: non-priority bindings still yield to the contextual resolver', () => {
    const builtIn = vi.fn();
    const plain = vi.fn();
    contextual.register('timeline.setOutPoint', { code: 'KeyO' }, builtIn, 'global');
    km.register({ code: 'KeyO' }, plain);

    press(root, 'KeyO', 'o');
    expect(builtIn).toHaveBeenCalledTimes(1);
    expect(plain).not.toHaveBeenCalled();
  });

  it('KBM-LAYOUT-001: letter shortcuts follow the layout (AZERTY A is physical KeyQ)', () => {
    const a = vi.fn();
    const q = vi.fn();
    km.register({ code: 'KeyA' }, a);
    km.register({ code: 'KeyQ' }, q);

    press(root, 'KeyQ', 'a');
    expect(a).toHaveBeenCalledTimes(1);
    expect(q).not.toHaveBeenCalled();
  });

  it('KBM-LAYOUT-002: QWERTZ Z (physical KeyY) with Ctrl triggers Ctrl+Z', () => {
    const undo = vi.fn();
    const redo = vi.fn();
    km.register({ code: 'KeyZ', ctrl: true }, undo);
    km.register({ code: 'KeyY', ctrl: true }, redo);

    press(root, 'KeyY', 'z', { ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).not.toHaveBeenCalled();
  });

  it('KBM-LAYOUT-003: Shift+letter matches with an upper-case key', () => {
    const handler = vi.fn();
    km.register({ code: 'KeyM', shift: true }, handler);
    // AZERTY M sits on the QWERTY semicolon key
    press(root, 'Semicolon', 'M', { shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('KBM-LAYOUT-004: non-Latin layouts keep the physical QWERTY position', () => {
    const handler = vi.fn();
    km.register({ code: 'KeyL' }, handler);
    press(root, 'KeyL', 'д'); // Russian layout
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('KBM-LAYOUT-005: digits keep their physical key (AZERTY needs Shift for digits)', () => {
    const handler = vi.fn();
    km.register({ code: 'Digit1' }, handler);
    press(root, 'Digit1', '&');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
