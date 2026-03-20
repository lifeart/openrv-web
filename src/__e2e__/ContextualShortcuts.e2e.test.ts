/**
 * Contextual Keyboard Shortcuts E2E Tests
 *
 * Tests the full wiring of tab-based contextual keyboard shortcuts:
 * simulating a tab switch, then a keypress, and verifying the correct
 * action fires based on the active context.
 *
 * Key scenarios verified:
 * - G/H/W keys change behavior on QC tab (panel context) vs other tabs
 * - Shift+R resolves to rotate on Transform tab vs red channel elsewhere
 * - Shift+L resolves to LUT panel on Color tab vs luminance elsewhere
 * - Shift+N resolves to network panel on QC tab vs channel.none elsewhere
 * - TAB_CONTEXT_MAP correctness for all six tabs
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActiveContextManager, type BindingContext } from '../utils/input/ActiveContextManager';
import { ContextualKeyboardManager } from '../utils/input/ContextualKeyboardManager';
import { DEFAULT_KEY_BINDINGS } from '../utils/input/KeyBindings';

// Mirrors the production TAB_CONTEXT_MAP from App.ts
const TAB_CONTEXT_MAP: Record<string, BindingContext> = {
  annotate: 'paint',
  transform: 'transform',
  view: 'viewer',
  qc: 'panel',
  color: 'color',
};

type TabId = 'view' | 'color' | 'effects' | 'transform' | 'annotate' | 'qc';

/** Simulates a tab switch by updating the active context, mirroring App.ts wiring. */
function switchTab(manager: ActiveContextManager, tabId: TabId): void {
  manager.setContext(TAB_CONTEXT_MAP[tabId] ?? 'global');
}

/**
 * Registers all DEFAULT_KEY_BINDINGS into a ContextualKeyboardManager with
 * spy handlers, returning a map from action name to handler spy.
 */
function registerAllDefaults(ckm: ContextualKeyboardManager): Map<string, ReturnType<typeof vi.fn>> {
  const handlers = new Map<string, ReturnType<typeof vi.fn>>();
  for (const [action, entry] of Object.entries(DEFAULT_KEY_BINDINGS)) {
    const handler = vi.fn();
    handlers.set(action, handler);
    const { description, context, ...combo } = entry;
    ckm.register(action, combo, handler, context ?? 'global', description);
  }
  return handlers;
}

describe('Contextual Keyboard Shortcuts E2E', () => {
  let acm: ActiveContextManager;
  let ckm: ContextualKeyboardManager;
  let handlers: Map<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    acm = new ActiveContextManager();
    ckm = new ContextualKeyboardManager(acm);
    handlers = registerAllDefaults(ckm);
  });

  // ===== TAB_CONTEXT_MAP Verification =====

  describe('TAB_CONTEXT_MAP correctness', () => {
    it('E2E-CS-001: local TAB_CONTEXT_MAP mirrors production mapping', () => {
      // This mirrors the exported TAB_CONTEXT_MAP from App.ts.
      // The AppKeyboardHandler.test.ts TABCTX-* tests verify the production
      // constant directly; here we verify our local mirror is consistent.
      expect(TAB_CONTEXT_MAP).toEqual({
        annotate: 'paint',
        transform: 'transform',
        view: 'viewer',
        qc: 'panel',
        color: 'color',
      });
    });

    it('E2E-CS-002: effects tab has no mapping (falls back to global)', () => {
      expect(TAB_CONTEXT_MAP['effects']).toBeUndefined();
      switchTab(acm, 'effects');
      expect(acm.activeContext).toBe('global');
    });

    it('E2E-CS-003: color tab maps to color context', () => {
      switchTab(acm, 'color');
      expect(acm.activeContext).toBe('color');
    });
  });

  // ===== QC Tab: G -> Gamut Diagram (not Goto Frame) =====

  describe('QC tab -> G key -> gamut diagram', () => {
    it('E2E-CS-010: press G on QC tab resolves to panel.gamutDiagram', () => {
      switchTab(acm, 'qc');
      const result = ckm.resolve({ code: 'KeyG' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('panel.gamutDiagram');
    });

    it('E2E-CS-011: press G on QC tab fires gamut handler, not goto-frame', () => {
      switchTab(acm, 'qc');
      const result = ckm.resolve({ code: 'KeyG' });
      result!.handler();

      expect(handlers.get('panel.gamutDiagram')).toHaveBeenCalledTimes(1);
      expect(handlers.get('navigation.gotoFrame')).not.toHaveBeenCalled();
    });
  });

  // ===== QC Tab: H -> Histogram (not Fit to Height) =====

  describe('QC tab -> H key -> histogram', () => {
    it('E2E-CS-020: press H on QC tab resolves to panel.histogram', () => {
      switchTab(acm, 'qc');
      const result = ckm.resolve({ code: 'KeyH' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('panel.histogram');
    });

    it('E2E-CS-021: press H on QC tab fires histogram handler, not fit-to-height', () => {
      switchTab(acm, 'qc');
      const result = ckm.resolve({ code: 'KeyH' });
      result!.handler();

      expect(handlers.get('panel.histogram')).toHaveBeenCalledTimes(1);
      expect(handlers.get('view.fitToHeight')).not.toHaveBeenCalled();
    });
  });

  // ===== QC Tab: W -> Waveform (not Fit to Width) =====

  describe('QC tab -> W key -> waveform', () => {
    it('E2E-CS-025: press W on QC tab resolves to panel.waveform', () => {
      switchTab(acm, 'qc');
      const result = ckm.resolve({ code: 'KeyW' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('panel.waveform');
    });

    it('E2E-CS-026: press W on QC tab fires waveform handler, not fit-to-width', () => {
      switchTab(acm, 'qc');
      const result = ckm.resolve({ code: 'KeyW' });
      result!.handler();

      expect(handlers.get('panel.waveform')).toHaveBeenCalledTimes(1);
      expect(handlers.get('view.fitToWidth')).not.toHaveBeenCalled();
    });
  });

  // ===== View Tab: G -> Goto Frame (not Gamut) =====

  describe('View tab -> G key -> goto-frame', () => {
    it('E2E-CS-030: press G on View tab resolves to navigation.gotoFrame', () => {
      switchTab(acm, 'view');
      const result = ckm.resolve({ code: 'KeyG' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('navigation.gotoFrame');
    });

    it('E2E-CS-031: press G on View tab fires goto-frame handler, not gamut', () => {
      switchTab(acm, 'view');
      const result = ckm.resolve({ code: 'KeyG' });
      result!.handler();

      expect(handlers.get('navigation.gotoFrame')).toHaveBeenCalledTimes(1);
      expect(handlers.get('panel.gamutDiagram')).not.toHaveBeenCalled();
    });
  });

  // ===== View Tab: H -> Fit to Height (not Histogram) =====

  describe('View tab -> H key -> fit-to-height', () => {
    it('E2E-CS-035: press H on View tab resolves to view.fitToHeight', () => {
      switchTab(acm, 'view');
      const result = ckm.resolve({ code: 'KeyH' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('view.fitToHeight');
    });
  });

  // ===== Color Tab: Shift+L -> LUT Panel (not Luminance) =====

  describe('Color tab -> Shift+L -> LUT panel', () => {
    it('E2E-CS-040: press Shift+L on Color tab resolves to lut.togglePanel', () => {
      switchTab(acm, 'color');
      const result = ckm.resolve({ code: 'KeyL', shift: true });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('lut.togglePanel');
    });

    it('E2E-CS-041: press Shift+L on Color tab fires LUT handler, not luminance', () => {
      switchTab(acm, 'color');
      const result = ckm.resolve({ code: 'KeyL', shift: true });
      result!.handler();

      expect(handlers.get('lut.togglePanel')).toHaveBeenCalledTimes(1);
      expect(handlers.get('channel.luminance')).not.toHaveBeenCalled();
    });
  });

  // ===== Effects Tab: Shift+L -> Luminance (global, not LUT) =====

  describe('Effects tab -> Shift+L -> luminance channel', () => {
    it('E2E-CS-045: press Shift+L on Effects tab resolves to channel.luminance', () => {
      switchTab(acm, 'effects');
      const result = ckm.resolve({ code: 'KeyL', shift: true });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('channel.luminance');
    });
  });

  // ===== Effects Tab: Shift+R -> Red Channel (global) =====

  describe('Effects tab -> Shift+R -> red channel', () => {
    it('E2E-CS-050: press Shift+R on Effects tab resolves to channel.red', () => {
      switchTab(acm, 'effects');
      const result = ckm.resolve({ code: 'KeyR', shift: true });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('channel.red');
    });

    it('E2E-CS-051: press Shift+R on Effects tab fires red handler, not rotate', () => {
      switchTab(acm, 'effects');
      const result = ckm.resolve({ code: 'KeyR', shift: true });
      result!.handler();

      expect(handlers.get('channel.red')).toHaveBeenCalledTimes(1);
      expect(handlers.get('transform.rotateLeft')).not.toHaveBeenCalled();
    });
  });

  // ===== Transform Tab: Shift+R -> Rotate Left (not Red Channel) =====

  describe('Transform tab -> Shift+R -> rotate left', () => {
    it('E2E-CS-060: press Shift+R on Transform tab resolves to transform.rotateLeft', () => {
      switchTab(acm, 'transform');
      const result = ckm.resolve({ code: 'KeyR', shift: true });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('transform.rotateLeft');
    });

    it('E2E-CS-061: press Shift+R on Transform tab fires rotate handler, not red channel', () => {
      switchTab(acm, 'transform');
      const result = ckm.resolve({ code: 'KeyR', shift: true });
      result!.handler();

      expect(handlers.get('transform.rotateLeft')).toHaveBeenCalledTimes(1);
      expect(handlers.get('channel.red')).not.toHaveBeenCalled();
    });
  });

  // ===== QC Tab: Shift+N -> Network Panel (not Channel None) =====

  describe('QC tab -> Shift+N -> network panel', () => {
    it('E2E-CS-070: press Shift+N on QC tab resolves to network.togglePanel', () => {
      switchTab(acm, 'qc');
      const result = ckm.resolve({ code: 'KeyN', shift: true });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('network.togglePanel');
    });

    it('E2E-CS-071: press Shift+N on QC tab fires network handler, not channel.none', () => {
      switchTab(acm, 'qc');
      const result = ckm.resolve({ code: 'KeyN', shift: true });
      result!.handler();

      expect(handlers.get('network.togglePanel')).toHaveBeenCalledTimes(1);
      expect(handlers.get('channel.none')).not.toHaveBeenCalled();
    });
  });

  // ===== View Tab: Shift+B -> Background Pattern (not global) =====

  describe('View tab -> Shift+B -> background pattern cycle', () => {
    it('E2E-CS-075: press Shift+B on View tab resolves to view.cycleBackgroundPattern', () => {
      switchTab(acm, 'view');
      const result = ckm.resolve({ code: 'KeyB', shift: true });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('view.cycleBackgroundPattern');
    });
  });

  // ===== Cross-Tab Consistency for Global Shortcuts =====

  describe('global shortcuts work across all tabs', () => {
    const allTabs: TabId[] = ['view', 'color', 'effects', 'transform', 'annotate', 'qc'];

    it('E2E-CS-080: Space (playback toggle) resolves on every tab', () => {
      for (const tab of allTabs) {
        switchTab(acm, tab);
        const result = ckm.resolve({ code: 'Space' });
        expect(result).not.toBeNull();
        expect(result!.action).toBe('playback.toggle');
      }
    });

    it('E2E-CS-081: Arrow keys (step forward/backward) resolve on every tab', () => {
      for (const tab of allTabs) {
        switchTab(acm, tab);
        const fwd = ckm.resolve({ code: 'ArrowRight' });
        expect(fwd).not.toBeNull();
        expect(fwd!.action).toBe('playback.stepForward');

        const bwd = ckm.resolve({ code: 'ArrowLeft' });
        expect(bwd).not.toBeNull();
        expect(bwd!.action).toBe('playback.stepBackward');
      }
    });

    it('E2E-CS-082: Ctrl+S (quick export) resolves on every tab', () => {
      for (const tab of allTabs) {
        switchTab(acm, tab);
        const result = ckm.resolve({ code: 'KeyS', ctrl: true });
        expect(result).not.toBeNull();
        expect(result!.action).toBe('export.quickExport');
      }
    });
  });

  // ===== Full Tab Cycle: Verify G Key Changes Meaning =====

  describe('full tab cycle: G key meaning changes per tab', () => {
    it('E2E-CS-090: G key resolves differently across tabs', () => {
      // QC tab -> gamut diagram (panel context)
      switchTab(acm, 'qc');
      expect(ckm.resolve({ code: 'KeyG' })!.action).toBe('panel.gamutDiagram');

      // View tab -> goto frame (global fallback, since viewer has no G binding)
      switchTab(acm, 'view');
      expect(ckm.resolve({ code: 'KeyG' })!.action).toBe('navigation.gotoFrame');

      // Annotate tab -> toggle ghost (paint context)
      switchTab(acm, 'annotate');
      expect(ckm.resolve({ code: 'KeyG' })!.action).toBe('paint.toggleGhost');

      // Effects tab -> goto frame (global fallback)
      switchTab(acm, 'effects');
      expect(ckm.resolve({ code: 'KeyG' })!.action).toBe('navigation.gotoFrame');

      // Color tab -> goto frame (global fallback, color context has no G)
      switchTab(acm, 'color');
      expect(ckm.resolve({ code: 'KeyG' })!.action).toBe('navigation.gotoFrame');

      // Transform tab -> goto frame (global fallback)
      switchTab(acm, 'transform');
      expect(ckm.resolve({ code: 'KeyG' })!.action).toBe('navigation.gotoFrame');
    });
  });

  // ===== Full Tab Cycle: Verify H Key Changes Meaning =====

  describe('full tab cycle: H key meaning changes per tab', () => {
    it('E2E-CS-091: H key resolves differently on QC vs other tabs', () => {
      // QC tab -> histogram (panel context)
      switchTab(acm, 'qc');
      expect(ckm.resolve({ code: 'KeyH' })!.action).toBe('panel.histogram');

      // View tab -> fit to height (global fallback)
      switchTab(acm, 'view');
      expect(ckm.resolve({ code: 'KeyH' })!.action).toBe('view.fitToHeight');

      // Effects tab -> fit to height (global)
      switchTab(acm, 'effects');
      expect(ckm.resolve({ code: 'KeyH' })!.action).toBe('view.fitToHeight');

      // Color tab -> fit to height (global fallback, color context has no H)
      switchTab(acm, 'color');
      expect(ckm.resolve({ code: 'KeyH' })!.action).toBe('view.fitToHeight');
    });
  });

  // ===== Full Tab Cycle: Verify Shift+R Changes Meaning =====

  describe('full tab cycle: Shift+R meaning changes per tab', () => {
    it('E2E-CS-092: Shift+R resolves to rotate on Transform, red channel elsewhere', () => {
      // Transform tab -> rotate left
      switchTab(acm, 'transform');
      expect(ckm.resolve({ code: 'KeyR', shift: true })!.action).toBe('transform.rotateLeft');

      // View tab -> red channel (global)
      switchTab(acm, 'view');
      expect(ckm.resolve({ code: 'KeyR', shift: true })!.action).toBe('channel.red');

      // Effects tab -> red channel (global)
      switchTab(acm, 'effects');
      expect(ckm.resolve({ code: 'KeyR', shift: true })!.action).toBe('channel.red');

      // QC tab -> red channel (global fallback, panel has no Shift+R)
      switchTab(acm, 'qc');
      expect(ckm.resolve({ code: 'KeyR', shift: true })!.action).toBe('channel.red');

      // Color tab -> red channel (global fallback)
      switchTab(acm, 'color');
      expect(ckm.resolve({ code: 'KeyR', shift: true })!.action).toBe('channel.red');
    });
  });

  // ===== Annotate Tab: R -> Rectangle (not Reset In/Out) =====

  describe('Annotate tab -> R key -> rectangle tool', () => {
    it('E2E-CS-100: press R on Annotate tab resolves to paint.rectangle', () => {
      switchTab(acm, 'annotate');
      const result = ckm.resolve({ code: 'KeyR' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('paint.rectangle');
    });

    it('E2E-CS-101: press R on View tab resolves to timeline.resetInOut', () => {
      switchTab(acm, 'view');
      const result = ckm.resolve({ code: 'KeyR' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('timeline.resetInOut');
    });
  });

  // ===== Annotate Tab: O -> Ellipse (not Set Out Point) =====

  describe('Annotate tab -> O key -> ellipse tool', () => {
    it('E2E-CS-105: press O on Annotate tab resolves to paint.ellipse', () => {
      switchTab(acm, 'annotate');
      const result = ckm.resolve({ code: 'KeyO' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('paint.ellipse');
    });

    it('E2E-CS-106: press O on Effects tab resolves to timeline.setOutPoint', () => {
      switchTab(acm, 'effects');
      const result = ckm.resolve({ code: 'KeyO' });
      expect(result).not.toBeNull();
      expect(result!.action).toBe('timeline.setOutPoint');
    });
  });

  // ===== Handler Execution Verification =====

  describe('handler execution end-to-end', () => {
    it('E2E-CS-110: switching tabs and pressing keys fires correct sequence of handlers', () => {
      const callOrder: string[] = [];

      // Override handlers to track call order
      for (const [action, handler] of handlers) {
        handler.mockImplementation(() => callOrder.push(action));
      }

      // Scenario: user switches through tabs pressing context-specific keys
      switchTab(acm, 'qc');
      ckm.resolve({ code: 'KeyG' })!.handler(); // gamut
      ckm.resolve({ code: 'KeyH' })!.handler(); // histogram

      switchTab(acm, 'view');
      ckm.resolve({ code: 'KeyG' })!.handler(); // goto-frame
      ckm.resolve({ code: 'KeyH' })!.handler(); // fit-to-height

      switchTab(acm, 'color');
      ckm.resolve({ code: 'KeyL', shift: true })!.handler(); // LUT panel

      switchTab(acm, 'transform');
      ckm.resolve({ code: 'KeyR', shift: true })!.handler(); // rotate left

      expect(callOrder).toEqual([
        'panel.gamutDiagram',
        'panel.histogram',
        'navigation.gotoFrame',
        'view.fitToHeight',
        'lut.togglePanel',
        'transform.rotateLeft',
      ]);
    });
  });

  // ===== DEFAULT_KEY_BINDINGS Context Annotations =====

  describe('DEFAULT_KEY_BINDINGS context annotations', () => {
    it('E2E-CS-120: panel-context bindings are correctly annotated', () => {
      expect(DEFAULT_KEY_BINDINGS['panel.gamutDiagram']!.context).toBe('panel');
      expect(DEFAULT_KEY_BINDINGS['panel.histogram']!.context).toBe('panel');
      expect(DEFAULT_KEY_BINDINGS['panel.waveform']!.context).toBe('panel');
      expect(DEFAULT_KEY_BINDINGS['network.togglePanel']!.context).toBe('panel');
    });

    it('E2E-CS-121: transform-context bindings are correctly annotated', () => {
      expect(DEFAULT_KEY_BINDINGS['transform.rotateLeft']!.context).toBe('transform');
    });

    it('E2E-CS-122: color-context bindings are correctly annotated', () => {
      expect(DEFAULT_KEY_BINDINGS['lut.togglePanel']!.context).toBe('color');
    });

    it('E2E-CS-123: paint-context bindings are correctly annotated', () => {
      expect(DEFAULT_KEY_BINDINGS['paint.rectangle']!.context).toBe('paint');
      expect(DEFAULT_KEY_BINDINGS['paint.ellipse']!.context).toBe('paint');
      expect(DEFAULT_KEY_BINDINGS['paint.toggleGhost']!.context).toBe('paint');
      expect(DEFAULT_KEY_BINDINGS['notes.addNote']!.context).toBe('paint');
    });

    it('E2E-CS-124: viewer-context bindings are correctly annotated', () => {
      expect(DEFAULT_KEY_BINDINGS['view.cycleBackgroundPattern']!.context).toBe('viewer');
    });

    it('E2E-CS-125: global bindings have no context or undefined context', () => {
      expect(DEFAULT_KEY_BINDINGS['playback.toggle']!.context).toBeUndefined();
      expect(DEFAULT_KEY_BINDINGS['navigation.gotoFrame']!.context).toBeUndefined();
      expect(DEFAULT_KEY_BINDINGS['channel.red']!.context).toBeUndefined();
      expect(DEFAULT_KEY_BINDINGS['view.fitToHeight']!.context).toBeUndefined();
    });
  });
});
