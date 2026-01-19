/**
 * Custom Key Bindings Manager Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CustomKeyBindingsManager } from './CustomKeyBindingsManager';
import { DEFAULT_KEY_BINDINGS } from './KeyBindings';

describe('CustomKeyBindingsManager', () => {
  let manager: CustomKeyBindingsManager;
  let onBindingsChanged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    onBindingsChanged = vi.fn();
    manager = new CustomKeyBindingsManager(onBindingsChanged);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initialization', () => {
    it('CKBM-001: initializes with empty custom bindings', () => {
      expect(manager.getCustomBindings()).toEqual([]);
      expect(manager.getAvailableActions().length).toBeGreaterThan(0);
    });

    it('CKBM-002: loads custom bindings from localStorage', () => {
      const testData = [{
        action: 'playback.toggle',
        originalCombo: { code: 'Space' },
        customCombo: { code: 'KeyP', ctrl: true }
      }];
      localStorage.setItem('openrv-custom-keybindings', JSON.stringify(testData));

      const newManager = new CustomKeyBindingsManager();
      expect(newManager.getCustomBindings()).toHaveLength(1);
      expect(newManager.getCustomBinding('playback.toggle')?.customCombo).toEqual({ code: 'KeyP', ctrl: true });
    });
  });

  describe('custom binding management', () => {
    it('CKBM-003: sets custom binding for valid action', () => {
      const customCombo = { code: 'KeyP', ctrl: true };
      manager.setCustomBinding('playback.toggle', customCombo);

      expect(manager.hasCustomBinding('playback.toggle')).toBe(true);
      expect(manager.getEffectiveCombo('playback.toggle')).toEqual(customCombo);
      expect(manager.getCustomBindings()).toHaveLength(1);
    });

    it('CKBM-004: throws error for invalid action', () => {
      expect(() => {
        manager.setCustomBinding('invalid.action', { code: 'KeyA' });
      }).toThrow('Unknown action: invalid.action');
    });

    it('CKBM-005: removes custom binding', () => {
      manager.setCustomBinding('playback.toggle', { code: 'KeyP', ctrl: true });
      expect(manager.hasCustomBinding('playback.toggle')).toBe(true);

      manager.removeCustomBinding('playback.toggle');
      expect(manager.hasCustomBinding('playback.toggle')).toBe(false);
      const defaultBinding = DEFAULT_KEY_BINDINGS['playback.toggle']!;
      const { description: _, ...expectedCombo } = defaultBinding;
      expect(manager.getEffectiveCombo('playback.toggle')).toEqual(expectedCombo);
    });

    it('CKBM-006: resets all custom bindings', () => {
      manager.setCustomBinding('playback.toggle', { code: 'KeyP', ctrl: true });
      manager.setCustomBinding('playback.stepForward', { code: 'KeyF', ctrl: true });

      expect(manager.getCustomBindings()).toHaveLength(2);

      manager.resetAll();
      expect(manager.getCustomBindings()).toHaveLength(0);
    });
  });

  describe('localStorage persistence', () => {
    it('CKBM-007: saves custom bindings to localStorage', () => {
      const customCombo = { code: 'KeyP', ctrl: true };
      manager.setCustomBinding('playback.toggle', customCombo);

      const stored = localStorage.getItem('openrv-custom-keybindings');
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].action).toBe('playback.toggle');
      expect(parsed[0].customCombo).toEqual(customCombo);
    });

    it('CKBM-008: loads custom bindings from localStorage on initialization', () => {
      const testData = [{
        action: 'playback.toggle',
        originalCombo: { code: 'Space' },
        customCombo: { code: 'KeyP', ctrl: true }
      }];
      localStorage.setItem('openrv-custom-keybindings', JSON.stringify(testData));

      const newManager = new CustomKeyBindingsManager();
      expect(newManager.getCustomBindings()).toHaveLength(1);
    });

    it('CKBM-009: handles corrupted localStorage data gracefully', () => {
      localStorage.setItem('openrv-custom-keybindings', 'invalid json');

      // Should not throw, just log warning
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const newManager = new CustomKeyBindingsManager();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to load custom key bindings:', expect.any(SyntaxError));
      expect(newManager.getCustomBindings()).toEqual([]);

      consoleSpy.mockRestore();
    });
  });

  describe('keyboard manager integration', () => {
    it('CKBM-010: notifies when custom bindings are applied', () => {
      onBindingsChanged.mockClear();
      manager.setCustomBinding('playback.toggle', { code: 'KeyP', ctrl: true });
      expect(onBindingsChanged).toHaveBeenCalledTimes(1);
    });

    it('CKBM-011: notifies when custom binding is removed', () => {
      manager.setCustomBinding('playback.toggle', { code: 'KeyP', ctrl: true });
      onBindingsChanged.mockClear();

      manager.removeCustomBinding('playback.toggle');
      expect(onBindingsChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe('available actions', () => {
    it('CKBM-012: returns all available actions with descriptions', () => {
      const actions = manager.getAvailableActions();
      expect(actions.length).toBe(Object.keys(DEFAULT_KEY_BINDINGS).length);

      // Check that each action has required properties
      for (const action of actions) {
        expect(action).toHaveProperty('action');
        expect(action).toHaveProperty('description');
        expect(action).toHaveProperty('currentCombo');
        expect(typeof action.action).toBe('string');
        expect(typeof action.description).toBe('string');
        expect(typeof action.currentCombo).toBe('object');
      }
    });

    it('CKBM-013: shows custom combo as current when set', () => {
      const customCombo = { code: 'KeyP', ctrl: true };
      manager.setCustomBinding('playback.toggle', customCombo);

      const actions = manager.getAvailableActions();
      const toggleAction = actions.find(a => a.action === 'playback.toggle');
      expect(toggleAction?.currentCombo).toEqual(customCombo);
    });
  });
});