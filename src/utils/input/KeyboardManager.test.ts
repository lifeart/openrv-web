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
        target: mockInput
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
        target: mockDiv
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
        target: document.body
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('KBM-024b: respects contextual keyboard manager', () => {
      const globalHandler = vi.fn();
      const contextualHandler = vi.fn();
      keyboardManager.register({ code: 'KeyR' }, globalHandler, 'Global R');

      const mockContextualManager = {
        resolve: vi.fn().mockReturnValue({ handler: contextualHandler, description: 'Context R' })
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
        target: document.body
      } as any;

      keyboardManager['handleKeydown'](mockEvent);

      expect(mockContextualManager.resolve).toHaveBeenCalledWith({
        code: 'KeyR',
        ctrl: false,
        shift: false,
        alt: false,
        meta: false
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
        target: document.body
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
        target: document.body
      } as any;

      const leftEvent = {
        code: 'ArrowLeft',
        key: 'ArrowLeft',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body
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
        target: document.body
      } as any;

      const endEvent = {
        code: 'End',
        key: 'End',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: document.body
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
        target: document.body
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
        target: document.body
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
        target: mockInput
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
        target: mockInput
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
        target: mockInput
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
        target: document.body
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
        target: mockInput
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
        target: mockInput
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
        target: mockInput
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
        target: mockInput
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
        target: mockInput
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
        target: mockInput
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
        target: mockTextarea
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
        target: mockInput
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
        target: mockInput
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
        target: mockInput
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
        target: mockInput
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
        target: mockInput
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
        target: mockInput
      } as any;

      const endEvent = {
        code: 'End',
        key: 'End',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockInput
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
        target: mockButton
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
        target: mockDiv
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
        target: mockSelect
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
        target: mockSelect
      } as any;

      const upEvent = {
        code: 'ArrowUp',
        key: 'ArrowUp',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        target: mockSelect
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
        target: mockSelect
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
        target: mockSelect
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
        target: mockSelect
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
        target: document.body
      } as any;

      keyboardManager['handleKeydown'](eventOnBody);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });
});
