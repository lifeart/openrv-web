/**
 * ContextualKeyboardManager Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextualKeyboardManager } from './ContextualKeyboardManager';
import { ActiveContextManager } from './ActiveContextManager';

describe('ContextualKeyboardManager', () => {
  let contextManager: ActiveContextManager;
  let keyManager: ContextualKeyboardManager;

  beforeEach(() => {
    contextManager = new ActiveContextManager();
    keyManager = new ContextualKeyboardManager(contextManager);
  });

  describe('registration', () => {
    it('CKM-001: registers a binding with context', () => {
      const handler = vi.fn();
      keyManager.register('paint.rectangle', { code: 'KeyR' }, handler, 'paint', 'Rectangle tool');

      const bindings = keyManager.getAllBindings();
      expect(bindings).toHaveLength(1);
      expect(bindings[0]!.action).toBe('paint.rectangle');
      expect(bindings[0]!.context).toBe('paint');
    });

    it('CKM-002: defaults to global context', () => {
      const handler = vi.fn();
      keyManager.register('playback.toggle', { code: 'Space' }, handler);

      const bindings = keyManager.getAllBindings();
      expect(bindings[0]!.context).toBe('global');
    });

    it('CKM-003: replaces existing binding for same action', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      keyManager.register('test.action', { code: 'KeyA' }, handler1, 'global');
      keyManager.register('test.action', { code: 'KeyB' }, handler2, 'global');

      const bindings = keyManager.getAllBindings();
      expect(bindings).toHaveLength(1);
      expect(bindings[0]!.combo.code).toBe('KeyB');
    });
  });

  describe('unregistration', () => {
    it('CKM-004: removes binding by action name', () => {
      const handler = vi.fn();
      keyManager.register('test.action', { code: 'KeyA' }, handler);

      keyManager.unregister('test.action');
      expect(keyManager.getAllBindings()).toHaveLength(0);
    });
  });

  describe('context resolution - collision scenarios', () => {
    it('CKM-010: KeyR resolves to paint.rectangle when paint context is active', () => {
      const paintHandler = vi.fn();
      const timelineHandler = vi.fn();

      keyManager.register('paint.rectangle', { code: 'KeyR' }, paintHandler, 'paint');
      keyManager.register('timeline.resetInOut', { code: 'KeyR' }, timelineHandler, 'timeline');

      contextManager.setContext('paint');

      const result = keyManager.resolve({ code: 'KeyR' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('paint.rectangle');

      result!.handler();
      expect(paintHandler).toHaveBeenCalled();
      expect(timelineHandler).not.toHaveBeenCalled();
    });

    it('CKM-011: KeyR resolves to timeline.resetInOut when timeline context is active', () => {
      const paintHandler = vi.fn();
      const timelineHandler = vi.fn();

      keyManager.register('paint.rectangle', { code: 'KeyR' }, paintHandler, 'paint');
      keyManager.register('timeline.resetInOut', { code: 'KeyR' }, timelineHandler, 'timeline');

      contextManager.setContext('timeline');

      const result = keyManager.resolve({ code: 'KeyR' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('timeline.resetInOut');
    });

    it('CKM-012: KeyO resolves to paint.ellipse when paint context is active', () => {
      const paintHandler = vi.fn();
      const timelineHandler = vi.fn();

      keyManager.register('paint.ellipse', { code: 'KeyO' }, paintHandler, 'paint');
      keyManager.register('timeline.setOutPoint', { code: 'KeyO' }, timelineHandler, 'timeline');

      contextManager.setContext('paint');

      const result = keyManager.resolve({ code: 'KeyO' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('paint.ellipse');
    });

    it('CKM-013: KeyG resolves to paint.toggleGhost when paint context is active', () => {
      const paintHandler = vi.fn();
      const panelHandler = vi.fn();

      keyManager.register('paint.toggleGhost', { code: 'KeyG' }, paintHandler, 'paint');
      keyManager.register('panel.gamutDiagram', { code: 'KeyG' }, panelHandler, 'panel');

      contextManager.setContext('paint');

      const result = keyManager.resolve({ code: 'KeyG' });
      expect(result!.action).toBe('paint.toggleGhost');
    });

    it('CKM-014: KeyG resolves to panel.gamutDiagram when panel context is active', () => {
      const paintHandler = vi.fn();
      const panelHandler = vi.fn();

      keyManager.register('paint.toggleGhost', { code: 'KeyG' }, paintHandler, 'paint');
      keyManager.register('panel.gamutDiagram', { code: 'KeyG' }, panelHandler, 'panel');

      contextManager.setContext('panel');

      const result = keyManager.resolve({ code: 'KeyG' });
      expect(result!.action).toBe('panel.gamutDiagram');
    });

    it('CKM-015: Shift+KeyR resolves to transform.rotateLeft in transform context', () => {
      const transformHandler = vi.fn();
      const channelHandler = vi.fn();

      keyManager.register('transform.rotateLeft', { code: 'KeyR', shift: true }, transformHandler, 'transform');
      keyManager.register('channel.red', { code: 'KeyR', shift: true }, channelHandler, 'channel');

      contextManager.setContext('transform');

      const result = keyManager.resolve({ code: 'KeyR', shift: true });
      expect(result!.action).toBe('transform.rotateLeft');
    });

    it('CKM-016: Shift+KeyR resolves to channel.red in channel context', () => {
      const transformHandler = vi.fn();
      const channelHandler = vi.fn();

      keyManager.register('transform.rotateLeft', { code: 'KeyR', shift: true }, transformHandler, 'transform');
      keyManager.register('channel.red', { code: 'KeyR', shift: true }, channelHandler, 'channel');

      contextManager.setContext('channel');

      const result = keyManager.resolve({ code: 'KeyR', shift: true });
      expect(result!.action).toBe('channel.red');
    });
  });

  describe('global fallback', () => {
    it('CKM-020: falls back to global when active context has no match', () => {
      const globalHandler = vi.fn();

      keyManager.register('playback.toggle', { code: 'Space' }, globalHandler, 'global');
      keyManager.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');

      contextManager.setContext('paint');

      // Space is not in paint context, should fall back to global
      const result = keyManager.resolve({ code: 'Space' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('playback.toggle');
    });

    it('CKM-021: global bindings are available in any context', () => {
      const handler = vi.fn();
      keyManager.register('edit.undo', { code: 'KeyZ', ctrl: true }, handler, 'global');

      // Test in various contexts
      const contexts: Array<'paint' | 'timeline' | 'viewer' | 'panel'> = ['paint', 'timeline', 'viewer', 'panel'];
      for (const ctx of contexts) {
        contextManager.setContext(ctx);
        const result = keyManager.resolve({ code: 'KeyZ', ctrl: true });
        expect(result).not.toBeNull();
        expect(result!.action).toBe('edit.undo');
      }
    });

    it('CKM-022: returns null when no binding matches at all', () => {
      keyManager.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');

      contextManager.setContext('timeline');

      // KeyR is only in paint context, and we're in timeline context
      const result = keyManager.resolve({ code: 'KeyR' });
      expect(result).toBeNull();
    });

    it('CKM-023: context binding takes priority over global for same combo', () => {
      const globalHandler = vi.fn();
      const contextHandler = vi.fn();

      keyManager.register('global.action', { code: 'KeyR' }, globalHandler, 'global');
      keyManager.register('paint.rectangle', { code: 'KeyR' }, contextHandler, 'paint');

      contextManager.setContext('paint');

      const result = keyManager.resolve({ code: 'KeyR' });
      expect(result!.action).toBe('paint.rectangle');
      expect(result!.context).toBe('paint');
    });
  });

  describe('context switching', () => {
    it('CKM-030: resolves differently after context change', () => {
      const paintHandler = vi.fn();
      const timelineHandler = vi.fn();

      keyManager.register('paint.rectangle', { code: 'KeyR' }, paintHandler, 'paint');
      keyManager.register('timeline.resetInOut', { code: 'KeyR' }, timelineHandler, 'timeline');

      // In paint context
      contextManager.setContext('paint');
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('paint.rectangle');

      // Switch to timeline context
      contextManager.setContext('timeline');
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('timeline.resetInOut');
    });

    it('CKM-031: resolves correctly after push/pop', () => {
      const paintHandler = vi.fn();
      const timelineHandler = vi.fn();

      keyManager.register('paint.rectangle', { code: 'KeyR' }, paintHandler, 'paint');
      keyManager.register('timeline.resetInOut', { code: 'KeyR' }, timelineHandler, 'timeline');

      contextManager.setContext('timeline');
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('timeline.resetInOut');

      // Push paint context
      contextManager.pushContext('paint');
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('paint.rectangle');

      // Pop back to timeline
      contextManager.popContext();
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('timeline.resetInOut');
    });
  });

  describe('getBindingsForContext', () => {
    it('CKM-040: returns bindings for specific context', () => {
      keyManager.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');
      keyManager.register('paint.ellipse', { code: 'KeyO' }, vi.fn(), 'paint');
      keyManager.register('timeline.resetInOut', { code: 'KeyR' }, vi.fn(), 'timeline');
      keyManager.register('playback.toggle', { code: 'Space' }, vi.fn(), 'global');

      const paintBindings = keyManager.getBindingsForContext('paint');
      expect(paintBindings).toHaveLength(2);
      expect(paintBindings.map(b => b.action)).toContain('paint.rectangle');
      expect(paintBindings.map(b => b.action)).toContain('paint.ellipse');
    });
  });

  describe('findAllMatches', () => {
    it('CKM-050: finds all bindings for a given key combo across contexts', () => {
      keyManager.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');
      keyManager.register('timeline.resetInOut', { code: 'KeyR' }, vi.fn(), 'timeline');
      keyManager.register('paint.ellipse', { code: 'KeyO' }, vi.fn(), 'paint');

      const matches = keyManager.findAllMatches({ code: 'KeyR' });
      expect(matches).toHaveLength(2);
      expect(matches.map(m => m.action)).toContain('paint.rectangle');
      expect(matches.map(m => m.action)).toContain('timeline.resetInOut');
    });

    it('CKM-051: returns empty array for unregistered combo', () => {
      const matches = keyManager.findAllMatches({ code: 'KeyZ' });
      expect(matches).toHaveLength(0);
    });
  });

  describe('clearAll', () => {
    it('CKM-060: clears all bindings', () => {
      keyManager.register('a', { code: 'KeyA' }, vi.fn());
      keyManager.register('b', { code: 'KeyB' }, vi.fn());

      keyManager.clearAll();
      expect(keyManager.getAllBindings()).toHaveLength(0);
    });
  });

  describe('modifier key matching', () => {
    it('CKM-070: correctly distinguishes bindings with different modifiers', () => {
      const bareHandler = vi.fn();
      const shiftHandler = vi.fn();
      const ctrlHandler = vi.fn();

      keyManager.register('action.bare', { code: 'KeyR' }, bareHandler, 'global');
      keyManager.register('action.shift', { code: 'KeyR', shift: true }, shiftHandler, 'global');
      keyManager.register('action.ctrl', { code: 'KeyR', ctrl: true }, ctrlHandler, 'global');

      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('action.bare');
      expect(keyManager.resolve({ code: 'KeyR', shift: true })!.action).toBe('action.shift');
      expect(keyManager.resolve({ code: 'KeyR', ctrl: true })!.action).toBe('action.ctrl');
    });
  });
});
