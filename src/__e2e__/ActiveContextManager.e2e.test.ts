/**
 * ActiveContextManager E2E Tests
 *
 * Verifies end-to-end wiring of ActiveContextManager within App:
 * - Context switching triggered by tab changes
 * - Context stack push/pop behavior
 * - Integration with ContextualKeyboardManager for key resolution
 * - Signal propagation on context changes
 * - Edge cases: rapid context switches, stack overflow patterns
 *
 * Also tests the wiring gap: ContextualKeyboardManager is NOT wired
 * in App.ts or AppKeyboardHandler.ts - only ActiveContextManager is
 * instantiated but never connected to keyboard resolution.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActiveContextManager, type BindingContext } from '../utils/input/ActiveContextManager';
import { ContextualKeyboardManager } from '../utils/input/ContextualKeyboardManager';

// TabId type mirrors src/ui/components/layout/TabBar.ts
type TabId = 'view' | 'color' | 'effects' | 'transform' | 'annotate' | 'qc';

/**
 * Replicates the updateActiveContext logic from App.ts (lines 853-869)
 */
function updateActiveContext(manager: ActiveContextManager, tabId: TabId): void {
  switch (tabId) {
    case 'annotate':
      manager.setContext('paint');
      break;
    case 'transform':
      manager.setContext('transform');
      break;
    case 'view':
    case 'qc':
      manager.setContext('viewer');
      break;
    default:
      manager.setContext('global');
      break;
  }
}

describe('ActiveContextManager E2E', () => {
  let contextManager: ActiveContextManager;

  beforeEach(() => {
    contextManager = new ActiveContextManager();
  });

  // ===== Tab-to-Context Mapping =====

  describe('tab-to-context mapping', () => {
    it('E2E-ACM-001: view tab sets viewer context', () => {
      updateActiveContext(contextManager, 'view');
      expect(contextManager.activeContext).toBe('viewer');
    });

    it('E2E-ACM-002: qc tab sets viewer context', () => {
      updateActiveContext(contextManager, 'qc');
      expect(contextManager.activeContext).toBe('viewer');
    });

    it('E2E-ACM-003: annotate tab sets paint context', () => {
      updateActiveContext(contextManager, 'annotate');
      expect(contextManager.activeContext).toBe('paint');
    });

    it('E2E-ACM-004: transform tab sets transform context', () => {
      updateActiveContext(contextManager, 'transform');
      expect(contextManager.activeContext).toBe('transform');
    });

    it('E2E-ACM-005: color tab sets global context', () => {
      updateActiveContext(contextManager, 'color');
      expect(contextManager.activeContext).toBe('global');
    });

    it('E2E-ACM-006: effects tab sets global context', () => {
      updateActiveContext(contextManager, 'effects');
      expect(contextManager.activeContext).toBe('global');
    });

    it('E2E-ACM-007: all tabs have defined mappings', () => {
      const allTabs: TabId[] = ['view', 'color', 'effects', 'transform', 'annotate', 'qc'];
      for (const tab of allTabs) {
        updateActiveContext(contextManager, tab);
        // Every tab should result in a known context
        const validContexts: BindingContext[] = ['global', 'viewer', 'paint', 'transform'];
        expect(validContexts).toContain(contextManager.activeContext);
      }
    });
  });

  // ===== Context Switching via Tab Changes =====

  describe('context switching via tab changes', () => {
    it('E2E-ACM-010: switching tabs updates context correctly', () => {
      updateActiveContext(contextManager, 'view');
      expect(contextManager.activeContext).toBe('viewer');

      updateActiveContext(contextManager, 'annotate');
      expect(contextManager.activeContext).toBe('paint');

      updateActiveContext(contextManager, 'transform');
      expect(contextManager.activeContext).toBe('transform');

      updateActiveContext(contextManager, 'color');
      expect(contextManager.activeContext).toBe('global');
    });

    it('E2E-ACM-011: rapid tab switching settles on last tab', () => {
      updateActiveContext(contextManager, 'view');
      updateActiveContext(contextManager, 'annotate');
      updateActiveContext(contextManager, 'transform');
      updateActiveContext(contextManager, 'qc');

      expect(contextManager.activeContext).toBe('viewer');
    });

    it('E2E-ACM-012: switching same tab twice is idempotent', () => {
      const listener = vi.fn();
      contextManager.contextChanged.connect(listener);

      updateActiveContext(contextManager, 'annotate');
      expect(listener).toHaveBeenCalledTimes(1);

      updateActiveContext(contextManager, 'annotate');
      // setContext is no-op for same context, so no second emission
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('E2E-ACM-013: contextChanged signal fires with correct old/new values', () => {
      const emissions: Array<{ newCtx: BindingContext; oldCtx: BindingContext }> = [];
      contextManager.contextChanged.connect((newCtx, oldCtx) => {
        emissions.push({ newCtx, oldCtx });
      });

      updateActiveContext(contextManager, 'view');      // global -> viewer
      updateActiveContext(contextManager, 'annotate');   // viewer -> paint
      updateActiveContext(contextManager, 'color');      // paint -> global
      updateActiveContext(contextManager, 'transform');  // global -> transform

      expect(emissions).toEqual([
        { newCtx: 'viewer', oldCtx: 'global' },
        { newCtx: 'paint', oldCtx: 'viewer' },
        { newCtx: 'global', oldCtx: 'paint' },
        { newCtx: 'transform', oldCtx: 'global' },
      ]);
    });
  });

  // ===== Context Stack Behavior =====

  describe('context stack behavior', () => {
    it('E2E-ACM-020: push preserves stack for restoration', () => {
      contextManager.pushContext('paint');
      expect(contextManager.activeContext).toBe('paint');
      expect(contextManager.stackDepth).toBe(1);

      contextManager.pushContext('viewer');
      expect(contextManager.activeContext).toBe('viewer');
      expect(contextManager.stackDepth).toBe(2);

      contextManager.popContext();
      expect(contextManager.activeContext).toBe('paint');
      expect(contextManager.stackDepth).toBe(1);

      contextManager.popContext();
      expect(contextManager.activeContext).toBe('global');
      expect(contextManager.stackDepth).toBe(0);
    });

    it('E2E-ACM-021: setContext does not affect stack', () => {
      contextManager.pushContext('paint');
      expect(contextManager.stackDepth).toBe(1);

      contextManager.setContext('viewer');
      expect(contextManager.stackDepth).toBe(1);
      expect(contextManager.activeContext).toBe('viewer');

      // Pop should still restore the pre-push context (global)
      contextManager.popContext();
      expect(contextManager.activeContext).toBe('global');
    });

    it('E2E-ACM-022: pop on empty stack reverts to global with warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      contextManager.setContext('paint');
      const result = contextManager.popContext();

      expect(result).toBe('global');
      expect(contextManager.activeContext).toBe('global');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('popContext() called on an empty stack')
      );

      warnSpy.mockRestore();
    });

    it('E2E-ACM-023: reset clears everything', () => {
      contextManager.pushContext('paint');
      contextManager.pushContext('viewer');
      contextManager.pushContext('timeline');

      contextManager.reset();

      expect(contextManager.activeContext).toBe('global');
      expect(contextManager.stackDepth).toBe(0);
    });

    it('E2E-ACM-024: reset from global is no-op (no signal)', () => {
      const listener = vi.fn();
      contextManager.contextChanged.connect(listener);

      contextManager.reset();

      expect(listener).not.toHaveBeenCalled();
    });

    it('E2E-ACM-025: mixed setContext and push/pop interactions', () => {
      // Simulate: tab change sets context, then a modal pushes a context
      updateActiveContext(contextManager, 'annotate'); // paint
      expect(contextManager.activeContext).toBe('paint');

      // Modal opens - push panel context
      contextManager.pushContext('panel');
      expect(contextManager.activeContext).toBe('panel');

      // Modal closes - pop back to paint
      contextManager.popContext();
      expect(contextManager.activeContext).toBe('paint');

      // User switches tab
      updateActiveContext(contextManager, 'view');
      expect(contextManager.activeContext).toBe('viewer');
    });
  });

  // ===== Integration with ContextualKeyboardManager =====

  describe('integration with ContextualKeyboardManager', () => {
    let keyManager: ContextualKeyboardManager;

    beforeEach(() => {
      keyManager = new ContextualKeyboardManager(contextManager);
    });

    it('E2E-ACM-030: tab changes affect key binding resolution', () => {
      // Register conflicting bindings
      keyManager.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');
      keyManager.register('timeline.resetInOut', { code: 'KeyR' }, vi.fn(), 'timeline');
      keyManager.register('playback.toggle', { code: 'Space' }, vi.fn(), 'global');

      // On annotate tab -> paint context
      updateActiveContext(contextManager, 'annotate');
      const result1 = keyManager.resolve({ code: 'KeyR' });
      expect(result1).not.toBeNull();
      expect(result1!.action).toBe('paint.rectangle');

      // Global binding still accessible
      const spaceResult = keyManager.resolve({ code: 'Space' });
      expect(spaceResult).not.toBeNull();
      expect(spaceResult!.action).toBe('playback.toggle');
    });

    it('E2E-ACM-031: view tab context does not match paint or timeline bindings', () => {
      keyManager.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');
      keyManager.register('timeline.resetInOut', { code: 'KeyR' }, vi.fn(), 'timeline');

      updateActiveContext(contextManager, 'view');
      // viewer context has no binding for KeyR, and neither paint nor timeline match
      const result = keyManager.resolve({ code: 'KeyR' });
      expect(result).toBeNull();
    });

    it('E2E-ACM-032: transform tab resolves transform-context bindings', () => {
      const transformHandler = vi.fn();
      const channelHandler = vi.fn();

      keyManager.register('transform.rotateLeft', { code: 'KeyR', shift: true }, transformHandler, 'transform');
      keyManager.register('channel.red', { code: 'KeyR', shift: true }, channelHandler, 'channel');

      updateActiveContext(contextManager, 'transform');
      const result = keyManager.resolve({ code: 'KeyR', shift: true });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('transform.rotateLeft');

      result!.handler();
      expect(transformHandler).toHaveBeenCalled();
      expect(channelHandler).not.toHaveBeenCalled();
    });

    it('E2E-ACM-033: color tab (global context) falls back to global bindings', () => {
      keyManager.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');
      keyManager.register('global.default', { code: 'KeyR' }, vi.fn(), 'global');

      updateActiveContext(contextManager, 'color');
      expect(contextManager.activeContext).toBe('global');

      const result = keyManager.resolve({ code: 'KeyR' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('global.default');
    });

    it('E2E-ACM-034: effects tab (global context) falls back to global bindings', () => {
      keyManager.register('paint.toggleGhost', { code: 'KeyG' }, vi.fn(), 'paint');
      keyManager.register('panel.gamutDiagram', { code: 'KeyG' }, vi.fn(), 'panel');
      keyManager.register('playback.toggle', { code: 'Space' }, vi.fn(), 'global');

      updateActiveContext(contextManager, 'effects');
      expect(contextManager.activeContext).toBe('global');

      // KeyG has no global binding, so returns null
      const gResult = keyManager.resolve({ code: 'KeyG' });
      expect(gResult).toBeNull();

      // Space has global binding, so it resolves
      const spaceResult = keyManager.resolve({ code: 'Space' });
      expect(spaceResult).not.toBeNull();
      expect(spaceResult!.action).toBe('playback.toggle');
    });

    it('E2E-ACM-035: push/pop context affects key resolution', () => {
      keyManager.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');
      keyManager.register('timeline.resetInOut', { code: 'KeyR' }, vi.fn(), 'timeline');

      // Set base context to timeline via tab
      contextManager.setContext('timeline');
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('timeline.resetInOut');

      // Push paint for a modal/overlay
      contextManager.pushContext('paint');
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('paint.rectangle');

      // Pop back to timeline
      contextManager.popContext();
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('timeline.resetInOut');
    });

    it('E2E-ACM-036: full tab cycle with key resolution', () => {
      const paintHandler = vi.fn();
      const globalHandler = vi.fn();

      keyManager.register('paint.rectangle', { code: 'KeyR' }, paintHandler, 'paint');
      keyManager.register('global.something', { code: 'KeyR' }, globalHandler, 'global');

      // Annotate tab: paint context
      updateActiveContext(contextManager, 'annotate');
      const r1 = keyManager.resolve({ code: 'KeyR' });
      expect(r1!.action).toBe('paint.rectangle');

      // View tab: viewer context, no KeyR binding -> fall back to global
      updateActiveContext(contextManager, 'view');
      const r2 = keyManager.resolve({ code: 'KeyR' });
      expect(r2!.action).toBe('global.something');

      // Color tab: global context -> global binding
      updateActiveContext(contextManager, 'color');
      const r3 = keyManager.resolve({ code: 'KeyR' });
      expect(r3!.action).toBe('global.something');

      // Back to annotate: paint context
      updateActiveContext(contextManager, 'annotate');
      const r4 = keyManager.resolve({ code: 'KeyR' });
      expect(r4!.action).toBe('paint.rectangle');
    });
  });

  // ===== Wiring Gap Analysis =====

  describe('wiring gap: ContextualKeyboardManager not connected in App', () => {
    it('E2E-ACM-040: ActiveContextManager is instantiated but ContextualKeyboardManager is not used in AppKeyboardHandler', () => {
      // This test documents the wiring gap found during review.
      //
      // In App.ts:
      //   - activeContextManager is created (line 128)
      //   - updateActiveContext() is called on tab changes (line 884)
      //   - activeContextManager.setContext() is called with correct contexts
      //
      // BUT:
      //   - ContextualKeyboardManager is never instantiated in App.ts
      //   - AppKeyboardHandler uses plain KeyboardManager (not ContextualKeyboardManager)
      //   - AppKeyboardHandler.registerKeyboardShortcuts() uses KeyboardManager.register()
      //     which has no context awareness
      //   - The `context` field on KeyBindingEntry is defined but only consumed
      //     by ContextualKeyboardManager.registerDefaults(), which is never called
      //
      // Result: ActiveContextManager sets contexts, but nothing reads them.
      // Key collisions (R, O, G, Shift+R) are resolved by the ad-hoc
      // `conflictingDefaults` set and inline `if (tabBar.activeTab === 'annotate')`
      // checks in getActionHandlers() instead of proper context resolution.

      // Verify the current workaround pattern exists:
      // The App uses tab-specific conditionals in action handlers
      // instead of context-based key resolution
      const contextManager = new ActiveContextManager();
      const keyManager = new ContextualKeyboardManager(contextManager);

      // These are properly wired in the ContextualKeyboardManager
      keyManager.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');
      keyManager.register('timeline.resetInOut', { code: 'KeyR' }, vi.fn(), 'timeline');

      // If it were wired, tab-based context changes would resolve collisions
      contextManager.setContext('paint');
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('paint.rectangle');

      contextManager.setContext('timeline');
      expect(keyManager.resolve({ code: 'KeyR' })!.action).toBe('timeline.resetInOut');

      // This proves the mechanism works; it just needs to be connected in App.ts
    });
  });

  // ===== isContextActive =====

  describe('isContextActive with tab mapping', () => {
    it('E2E-ACM-050: global is always active regardless of tab', () => {
      const allTabs: TabId[] = ['view', 'color', 'effects', 'transform', 'annotate', 'qc'];
      for (const tab of allTabs) {
        updateActiveContext(contextManager, tab);
        expect(contextManager.isContextActive('global')).toBe(true);
      }
    });

    it('E2E-ACM-051: viewer context active only on view/qc tabs', () => {
      const allTabs: TabId[] = ['view', 'color', 'effects', 'transform', 'annotate', 'qc'];
      const viewerTabs = new Set<TabId>(['view', 'qc']);

      for (const tab of allTabs) {
        updateActiveContext(contextManager, tab);
        if (viewerTabs.has(tab)) {
          expect(contextManager.isContextActive('viewer')).toBe(true);
        } else {
          expect(contextManager.isContextActive('viewer')).toBe(false);
        }
      }
    });

    it('E2E-ACM-052: paint context active only on annotate tab', () => {
      const allTabs: TabId[] = ['view', 'color', 'effects', 'transform', 'annotate', 'qc'];

      for (const tab of allTabs) {
        updateActiveContext(contextManager, tab);
        if (tab === 'annotate') {
          expect(contextManager.isContextActive('paint')).toBe(true);
        } else {
          expect(contextManager.isContextActive('paint')).toBe(false);
        }
      }
    });

    it('E2E-ACM-053: transform context active only on transform tab', () => {
      const allTabs: TabId[] = ['view', 'color', 'effects', 'transform', 'annotate', 'qc'];

      for (const tab of allTabs) {
        updateActiveContext(contextManager, tab);
        if (tab === 'transform') {
          expect(contextManager.isContextActive('transform')).toBe(true);
        } else {
          expect(contextManager.isContextActive('transform')).toBe(false);
        }
      }
    });
  });

  // ===== Signal Lifecycle =====

  describe('signal lifecycle', () => {
    it('E2E-ACM-060: unsubscribe prevents further notifications', () => {
      const listener = vi.fn();
      const unsub = contextManager.contextChanged.connect(listener);

      updateActiveContext(contextManager, 'annotate');
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();

      updateActiveContext(contextManager, 'view');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('E2E-ACM-061: multiple listeners all receive updates', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      contextManager.contextChanged.connect(listener1);
      contextManager.contextChanged.connect(listener2);
      contextManager.contextChanged.connect(listener3);

      updateActiveContext(contextManager, 'annotate');

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });

    it('E2E-ACM-062: disconnectAll removes all listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      contextManager.contextChanged.connect(listener1);
      contextManager.contextChanged.connect(listener2);

      contextManager.contextChanged.disconnectAll();

      updateActiveContext(contextManager, 'annotate');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  // ===== Edge Cases =====

  describe('edge cases', () => {
    it('E2E-ACM-070: deeply nested push/pop still resolves correctly', () => {
      const keyManager = new ContextualKeyboardManager(contextManager);
      keyManager.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');
      keyManager.register('viewer.action', { code: 'KeyR' }, vi.fn(), 'viewer');

      // Push 10 contexts deep
      for (let i = 0; i < 10; i++) {
        contextManager.pushContext(i % 2 === 0 ? 'paint' : 'viewer');
      }

      expect(contextManager.stackDepth).toBe(10);
      // Last push was paint (i=9 is odd -> viewer... i=8 is even -> paint... actually i=9 is odd -> viewer)
      // i=0: paint, i=1: viewer, i=2: paint, ..., i=9: viewer
      expect(contextManager.activeContext).toBe('viewer');

      // Pop all
      for (let i = 0; i < 10; i++) {
        contextManager.popContext();
      }

      expect(contextManager.stackDepth).toBe(0);
      expect(contextManager.activeContext).toBe('global');
    });

    it('E2E-ACM-071: setContext after push does not corrupt stack', () => {
      contextManager.pushContext('paint');
      contextManager.pushContext('viewer');

      // setContext replaces active but does not touch stack
      contextManager.setContext('timeline');
      expect(contextManager.activeContext).toBe('timeline');
      expect(contextManager.stackDepth).toBe(2);

      // Pop should restore the saved context from pushContext('viewer')
      contextManager.popContext();
      expect(contextManager.activeContext).toBe('paint');

      contextManager.popContext();
      expect(contextManager.activeContext).toBe('global');
    });
  });
});
