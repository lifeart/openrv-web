/**
 * ActiveContextManager Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActiveContextManager, type BindingContext } from './ActiveContextManager';

describe('ActiveContextManager', () => {
  let manager: ActiveContextManager;

  beforeEach(() => {
    manager = new ActiveContextManager();
  });

  describe('initialization', () => {
    it('ACM-001: defaults to global context', () => {
      expect(manager.activeContext).toBe('global');
    });

    it('ACM-002: starts with empty stack', () => {
      expect(manager.stackDepth).toBe(0);
    });
  });

  describe('setContext', () => {
    it('ACM-003: changes the active context', () => {
      manager.setContext('paint');
      expect(manager.activeContext).toBe('paint');
    });

    it('ACM-004: emits contextChanged signal', () => {
      const listener = vi.fn();
      manager.contextChanged.connect(listener);

      manager.setContext('timeline');
      expect(listener).toHaveBeenCalledWith('timeline', 'global');
    });

    it('ACM-005: does not emit if setting same context', () => {
      manager.setContext('paint');
      const listener = vi.fn();
      manager.contextChanged.connect(listener);

      manager.setContext('paint');
      expect(listener).not.toHaveBeenCalled();
    });

    it('ACM-006: supports all context types', () => {
      const contexts: BindingContext[] = ['global', 'timeline', 'paint', 'viewer', 'panel', 'channel', 'transform'];
      for (const ctx of contexts) {
        manager.setContext(ctx);
        expect(manager.activeContext).toBe(ctx);
      }
    });
  });

  describe('pushContext', () => {
    it('ACM-007: pushes context onto stack and makes it active', () => {
      manager.pushContext('paint');
      expect(manager.activeContext).toBe('paint');
      expect(manager.stackDepth).toBe(1);
    });

    it('ACM-008: saves previous context on stack', () => {
      manager.setContext('timeline');
      manager.pushContext('paint');
      expect(manager.activeContext).toBe('paint');
      expect(manager.stackDepth).toBe(1);

      // Pop should restore timeline
      manager.popContext();
      expect(manager.activeContext).toBe('timeline');
    });

    it('ACM-009: supports nested pushes', () => {
      manager.pushContext('timeline');
      manager.pushContext('paint');
      manager.pushContext('viewer');

      expect(manager.activeContext).toBe('viewer');
      expect(manager.stackDepth).toBe(3);
    });

    it('ACM-010: emits contextChanged signal on push', () => {
      const listener = vi.fn();
      manager.contextChanged.connect(listener);

      manager.pushContext('panel');
      expect(listener).toHaveBeenCalledWith('panel', 'global');
    });
  });

  describe('popContext', () => {
    it('ACM-011: restores previous context from stack', () => {
      manager.setContext('timeline');
      manager.pushContext('paint');

      const restored = manager.popContext();
      expect(restored).toBe('timeline');
      expect(manager.activeContext).toBe('timeline');
    });

    it('ACM-012: restores to global when stack is empty', () => {
      manager.setContext('paint');
      // Note: setContext does not push to stack, so stack is empty

      const restored = manager.popContext();
      expect(restored).toBe('global');
      expect(manager.activeContext).toBe('global');
    });

    it('ACM-013: handles multiple pops', () => {
      manager.pushContext('timeline');
      manager.pushContext('paint');
      manager.pushContext('viewer');

      expect(manager.popContext()).toBe('paint');
      expect(manager.popContext()).toBe('timeline');
      expect(manager.popContext()).toBe('global');
    });

    it('ACM-014: emits contextChanged signal on pop', () => {
      manager.pushContext('paint');

      const listener = vi.fn();
      manager.contextChanged.connect(listener);

      manager.popContext();
      expect(listener).toHaveBeenCalledWith('global', 'paint');
    });

    it('ACM-015: decrements stack depth', () => {
      manager.pushContext('timeline');
      manager.pushContext('paint');
      expect(manager.stackDepth).toBe(2);

      manager.popContext();
      expect(manager.stackDepth).toBe(1);

      manager.popContext();
      expect(manager.stackDepth).toBe(0);
    });
  });

  describe('isContextActive', () => {
    it('ACM-016: global is always active', () => {
      expect(manager.isContextActive('global')).toBe(true);

      manager.setContext('paint');
      expect(manager.isContextActive('global')).toBe(true);

      manager.pushContext('timeline');
      expect(manager.isContextActive('global')).toBe(true);
    });

    it('ACM-017: returns true for current active context', () => {
      manager.setContext('paint');
      expect(manager.isContextActive('paint')).toBe(true);
    });

    it('ACM-018: returns false for non-active context', () => {
      manager.setContext('paint');
      expect(manager.isContextActive('timeline')).toBe(false);
      expect(manager.isContextActive('viewer')).toBe(false);
    });

    it('ACM-019: only checks current context, not stack', () => {
      manager.pushContext('timeline');
      manager.pushContext('paint');

      expect(manager.isContextActive('paint')).toBe(true);
      // timeline is on the stack but not active
      expect(manager.isContextActive('timeline')).toBe(false);
    });
  });

  describe('reset', () => {
    it('ACM-020: resets to global context', () => {
      manager.setContext('paint');
      manager.reset();
      expect(manager.activeContext).toBe('global');
    });

    it('ACM-021: clears the context stack', () => {
      manager.pushContext('timeline');
      manager.pushContext('paint');
      manager.pushContext('viewer');

      manager.reset();
      expect(manager.stackDepth).toBe(0);
    });

    it('ACM-022: emits contextChanged when resetting from non-global', () => {
      manager.setContext('paint');
      const listener = vi.fn();
      manager.contextChanged.connect(listener);

      manager.reset();
      expect(listener).toHaveBeenCalledWith('global', 'paint');
    });

    it('ACM-023: does not emit when already global', () => {
      const listener = vi.fn();
      manager.contextChanged.connect(listener);

      manager.reset();
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
