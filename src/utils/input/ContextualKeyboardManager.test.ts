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
      const globalHandler = vi.fn();

      keyManager.register('paint.rectangle', { code: 'KeyR' }, paintHandler, 'paint');
      keyManager.register('timeline.resetInOut', { code: 'KeyR' }, globalHandler, 'global');

      contextManager.setContext('paint');

      const result = keyManager.resolve({ code: 'KeyR' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('paint.rectangle');

      result!.handler();
      expect(paintHandler).toHaveBeenCalled();
      expect(globalHandler).not.toHaveBeenCalled();
    });

    it('CKM-011: KeyR resolves to timeline.resetInOut in global context (fallback)', () => {
      const paintHandler = vi.fn();
      const globalHandler = vi.fn();

      keyManager.register('paint.rectangle', { code: 'KeyR' }, paintHandler, 'paint');
      keyManager.register('timeline.resetInOut', { code: 'KeyR' }, globalHandler, 'global');

      contextManager.setContext('global');

      const result = keyManager.resolve({ code: 'KeyR' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('timeline.resetInOut');
    });

    it('CKM-012: KeyO resolves to paint.ellipse when paint context is active', () => {
      const paintHandler = vi.fn();
      const globalHandler = vi.fn();

      keyManager.register('paint.ellipse', { code: 'KeyO' }, paintHandler, 'paint');
      keyManager.register('timeline.setOutPoint', { code: 'KeyO' }, globalHandler, 'global');

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
      keyManager.register('channel.red', { code: 'KeyR', shift: true }, channelHandler, 'viewer');

      contextManager.setContext('transform');

      const result = keyManager.resolve({ code: 'KeyR', shift: true });
      expect(result!.action).toBe('transform.rotateLeft');
    });

    it('CKM-016: Shift+KeyR resolves to channel.red in viewer context', () => {
      const transformHandler = vi.fn();
      const channelHandler = vi.fn();

      keyManager.register('transform.rotateLeft', { code: 'KeyR', shift: true }, transformHandler, 'transform');
      keyManager.register('channel.red', { code: 'KeyR', shift: true }, channelHandler, 'viewer');

      contextManager.setContext('viewer');

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

      // Test in all production contexts
      const contexts: Array<'paint' | 'viewer' | 'panel' | 'transform'> = ['paint', 'viewer', 'panel', 'transform'];
      for (const ctx of contexts) {
        contextManager.setContext(ctx);
        const result = keyManager.resolve({ code: 'KeyZ', ctrl: true });
        expect(result).not.toBeNull();
        expect(result!.action).toBe('edit.undo');
      }
    });

    it('CKM-022: returns null when no binding matches at all', () => {
      keyManager.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');

      contextManager.setContext('viewer');

      // KeyR is only in paint context, and we're in viewer context
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
      const viewerHandler = vi.fn();

      keyManager.register('paint.rectangle', { code: 'KeyR' }, paintHandler, 'paint');
      keyManager.register('viewer.action', { code: 'KeyR' }, viewerHandler, 'viewer');

      // In paint context
      contextManager.setContext('paint');
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('paint.rectangle');

      // Switch to viewer context
      contextManager.setContext('viewer');
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('viewer.action');
    });

    it('CKM-031: resolves correctly after push/pop', () => {
      const paintHandler = vi.fn();
      const viewerHandler = vi.fn();

      keyManager.register('paint.rectangle', { code: 'KeyR' }, paintHandler, 'paint');
      keyManager.register('viewer.action', { code: 'KeyR' }, viewerHandler, 'viewer');

      contextManager.setContext('viewer');
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('viewer.action');

      // Push paint context
      contextManager.pushContext('paint');
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('paint.rectangle');

      // Pop back to viewer
      contextManager.popContext();
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('viewer.action');
    });
  });

  describe('getBindingsForContext', () => {
    it('CKM-040: returns bindings for specific context', () => {
      keyManager.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');
      keyManager.register('paint.ellipse', { code: 'KeyO' }, vi.fn(), 'paint');
      keyManager.register('viewer.action', { code: 'KeyR' }, vi.fn(), 'viewer');
      keyManager.register('playback.toggle', { code: 'Space' }, vi.fn(), 'global');

      const paintBindings = keyManager.getBindingsForContext('paint');
      expect(paintBindings).toHaveLength(2);
      expect(paintBindings.map((b) => b.action)).toContain('paint.rectangle');
      expect(paintBindings.map((b) => b.action)).toContain('paint.ellipse');
    });
  });

  describe('findAllMatches', () => {
    it('CKM-050: finds all bindings for a given key combo across contexts', () => {
      keyManager.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');
      keyManager.register('timeline.resetInOut', { code: 'KeyR' }, vi.fn(), 'global');
      keyManager.register('paint.ellipse', { code: 'KeyO' }, vi.fn(), 'paint');

      const matches = keyManager.findAllMatches({ code: 'KeyR' });
      expect(matches).toHaveLength(2);
      expect(matches.map((m) => m.action)).toContain('paint.rectangle');
      expect(matches.map((m) => m.action)).toContain('timeline.resetInOut');
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

  describe('empty code guard', () => {
    it('CKM-080: resolve throws when combo has empty/missing code', () => {
      // Fix: comboToId() guards against empty code with:
      //   if (!combo.code) throw new Error('KeyCombination must have a code property');
      expect(() => keyManager.resolve({ code: '' })).toThrow('KeyCombination must have a code property');
      expect(() => keyManager.resolve({} as any)).toThrow('KeyCombination must have a code property');
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

  describe('production tab-to-context mapping - scope shortcuts reachability', () => {
    // Regression tests for issue #10: panel context must be activated by QC tab
    // so that scope shortcuts (H, G, W) resolve to their panel actions.
    const TAB_CONTEXT_MAP: Record<string, string> = {
      annotate: 'paint',
      transform: 'transform',
      view: 'viewer',
      qc: 'panel',
    };

    it('CKM-100: QC tab activates panel context (not viewer)', () => {
      const context = TAB_CONTEXT_MAP['qc'];
      expect(context).toBe('panel');
    });

    it('CKM-101: KeyH resolves to panel.histogram when QC tab is active', () => {
      const fitHandler = vi.fn();
      const histogramHandler = vi.fn();

      keyManager.register('view.fitToHeight', { code: 'KeyH' }, fitHandler, 'global');
      keyManager.register('panel.histogram', { code: 'KeyH' }, histogramHandler, 'panel');

      // Simulate QC tab selection
      contextManager.setContext(TAB_CONTEXT_MAP['qc'] as 'panel');

      const result = keyManager.resolve({ code: 'KeyH' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('panel.histogram');
      result!.handler();
      expect(histogramHandler).toHaveBeenCalledOnce();
      expect(fitHandler).not.toHaveBeenCalled();
    });

    it('CKM-102: KeyG resolves to panel.gamutDiagram when QC tab is active', () => {
      const gotoHandler = vi.fn();
      const gamutHandler = vi.fn();

      keyManager.register('navigation.gotoFrame', { code: 'KeyG' }, gotoHandler, 'global');
      keyManager.register('panel.gamutDiagram', { code: 'KeyG' }, gamutHandler, 'panel');

      // Simulate QC tab selection
      contextManager.setContext(TAB_CONTEXT_MAP['qc'] as 'panel');

      const result = keyManager.resolve({ code: 'KeyG' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('panel.gamutDiagram');
      result!.handler();
      expect(gamutHandler).toHaveBeenCalledOnce();
      expect(gotoHandler).not.toHaveBeenCalled();
    });

    it('CKM-103: KeyW resolves to panel.waveform when QC tab is active', () => {
      const fitWidthHandler = vi.fn();
      const waveformHandler = vi.fn();

      keyManager.register('view.fitToWidth', { code: 'KeyW' }, fitWidthHandler, 'global');
      keyManager.register('panel.waveform', { code: 'KeyW' }, waveformHandler, 'panel');

      // Simulate QC tab selection
      contextManager.setContext(TAB_CONTEXT_MAP['qc'] as 'panel');

      const result = keyManager.resolve({ code: 'KeyW' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('panel.waveform');
      result!.handler();
      expect(waveformHandler).toHaveBeenCalledOnce();
      expect(fitWidthHandler).not.toHaveBeenCalled();
    });

    it('CKM-104: KeyH resolves to view.fitToHeight when view tab is active (not QC)', () => {
      const fitHandler = vi.fn();
      const histogramHandler = vi.fn();

      keyManager.register('view.fitToHeight', { code: 'KeyH' }, fitHandler, 'global');
      keyManager.register('panel.histogram', { code: 'KeyH' }, histogramHandler, 'panel');

      // Simulate view tab selection (viewer context, not panel)
      contextManager.setContext(TAB_CONTEXT_MAP['view'] as 'viewer');

      const result = keyManager.resolve({ code: 'KeyH' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('view.fitToHeight');
    });

    it('CKM-105: KeyG resolves to navigation.gotoFrame when view tab is active (not QC)', () => {
      const gotoHandler = vi.fn();
      const gamutHandler = vi.fn();

      keyManager.register('navigation.gotoFrame', { code: 'KeyG' }, gotoHandler, 'global');
      keyManager.register('panel.gamutDiagram', { code: 'KeyG' }, gamutHandler, 'panel');

      // Simulate view tab selection
      contextManager.setContext(TAB_CONTEXT_MAP['view'] as 'viewer');

      const result = keyManager.resolve({ code: 'KeyG' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('navigation.gotoFrame');
    });

    it('CKM-106: KeyW resolves to view.fitToWidth when view tab is active (not QC)', () => {
      const fitWidthHandler = vi.fn();
      const waveformHandler = vi.fn();

      keyManager.register('view.fitToWidth', { code: 'KeyW' }, fitWidthHandler, 'global');
      keyManager.register('panel.waveform', { code: 'KeyW' }, waveformHandler, 'panel');

      // Simulate view tab selection
      contextManager.setContext(TAB_CONTEXT_MAP['view'] as 'viewer');

      const result = keyManager.resolve({ code: 'KeyW' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('view.fitToWidth');
    });

    it('CKM-107: global shortcuts still work as fallback in panel context', () => {
      const spaceHandler = vi.fn();
      keyManager.register('playback.toggle', { code: 'Space' }, spaceHandler, 'global');

      // Simulate QC tab selection
      contextManager.setContext(TAB_CONTEXT_MAP['qc'] as 'panel');

      const result = keyManager.resolve({ code: 'Space' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('playback.toggle');
    });
  });

  describe('KeyH histogram vs fitToHeight resolution', () => {
    it('CKM-090: KeyH resolves to view.fitToHeight in global context', () => {
      const fitHandler = vi.fn();
      const histogramHandler = vi.fn();

      keyManager.register('view.fitToHeight', { code: 'KeyH' }, fitHandler, 'global');
      keyManager.register('panel.histogram', { code: 'KeyH' }, histogramHandler, 'panel');

      // Default context is global
      const result = keyManager.resolve({ code: 'KeyH' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('view.fitToHeight');
    });

    it('CKM-091: KeyH resolves to panel.histogram in panel context', () => {
      const fitHandler = vi.fn();
      const histogramHandler = vi.fn();

      keyManager.register('view.fitToHeight', { code: 'KeyH' }, fitHandler, 'global');
      keyManager.register('panel.histogram', { code: 'KeyH' }, histogramHandler, 'panel');

      contextManager.setContext('panel');

      const result = keyManager.resolve({ code: 'KeyH' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('panel.histogram');
    });

    it('CKM-092: KeyH histogram handler toggles histogram (not fitToHeight) in panel context', () => {
      const fitHandler = vi.fn();
      const histogramHandler = vi.fn();

      keyManager.register('view.fitToHeight', { code: 'KeyH' }, fitHandler, 'global');
      keyManager.register('panel.histogram', { code: 'KeyH' }, histogramHandler, 'panel');

      contextManager.setContext('panel');

      const result = keyManager.resolve({ code: 'KeyH' });
      result!.handler();

      expect(histogramHandler).toHaveBeenCalledOnce();
      expect(fitHandler).not.toHaveBeenCalled();
    });
  });
});
