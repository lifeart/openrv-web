/**
 * Tests for MuEventBridge and ModeManager — Mu event system compatibility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MuEventBridge } from '../MuEventBridge';
import { ModeManager } from '../ModeManager';
import { MuSettingsBridge } from '../MuSettingsBridge';
import { MuUtilsBridge } from '../MuUtilsBridge';
import { MuNetworkBridge } from '../MuNetworkBridge';
import {
  isSupported,
  getStubFunctions,
  stereoSupported,
  getRendererType,
  cacheMode,
  sessionFileName,
} from '../stubs';
import type { MuEvent } from '../types';
import { FileKind } from '../types';

// ── ModeManager Tests ──

describe('ModeManager', () => {
  let manager: ModeManager;

  beforeEach(() => {
    manager = new ModeManager();
  });

  describe('mode lifecycle', () => {
    it('defines and activates a minor mode', () => {
      const activate = vi.fn();
      const deactivate = vi.fn();

      manager.defineMinorMode('test-mode', 10, [], [], activate, deactivate);

      expect(manager.isModeActive('test-mode')).toBe(false);

      manager.activateMode('test-mode');
      expect(manager.isModeActive('test-mode')).toBe(true);
      expect(activate).toHaveBeenCalledOnce();

      manager.deactivateMode('test-mode');
      expect(manager.isModeActive('test-mode')).toBe(false);
      expect(deactivate).toHaveBeenCalledOnce();
    });

    it('does not double-activate a mode', () => {
      const activate = vi.fn();
      manager.defineMinorMode('m', 0, [], [], activate);

      manager.activateMode('m');
      manager.activateMode('m');
      expect(activate).toHaveBeenCalledOnce();
    });

    it('warns when activating an undefined mode', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      manager.activateMode('nonexistent');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('nonexistent'),
      );
      warnSpy.mockRestore();
    });

    it('lists active modes', () => {
      manager.defineMinorMode('a', 5, [], []);
      manager.defineMinorMode('b', 10, [], []);

      manager.activateMode('a');
      manager.activateMode('b');

      const modes = manager.getActiveModes();
      expect(modes).toContain('a');
      expect(modes).toContain('b');
      expect(modes.length).toBe(2);
    });

    it('sorts active modes by order', () => {
      manager.defineMinorMode('high', 100, [], []);
      manager.defineMinorMode('low', 1, [], []);
      manager.defineMinorMode('mid', 50, [], []);

      manager.activateMode('high');
      manager.activateMode('low');
      manager.activateMode('mid');

      const modes = manager.getActiveModes();
      expect(modes).toEqual(['low', 'mid', 'high']);
    });

    it('isModeDefined returns correct values', () => {
      expect(manager.isModeDefined('test')).toBe(false);
      manager.defineMinorMode('test', 0, [], []);
      expect(manager.isModeDefined('test')).toBe(true);
    });
  });

  describe('event dispatch', () => {
    it('dispatches events to active mode global bindings', () => {
      const handler = vi.fn();

      manager.defineMinorMode(
        'mode1',
        0,
        [['key-down--a', handler, 'Press A']],
        [],
      );
      manager.activateMode('mode1');

      const event: MuEvent = {
        name: 'key-down--a',
        sender: '',
        contents: '',
        returnContents: '',
        reject: false,
      };

      const handled = manager.dispatchEvent(event);
      expect(handled).toBe(true);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('override bindings take priority over global bindings', () => {
      const globalHandler = vi.fn();
      const overrideHandler = vi.fn();

      manager.defineMinorMode(
        'mode1',
        0,
        [['key-down--a', globalHandler, 'Global']],
        [['key-down--a', overrideHandler, 'Override']],
      );
      manager.activateMode('mode1');

      const event: MuEvent = {
        name: 'key-down--a',
        sender: '',
        contents: '',
        returnContents: '',
        reject: false,
      };

      manager.dispatchEvent(event);
      expect(overrideHandler).toHaveBeenCalledOnce();
      expect(globalHandler).not.toHaveBeenCalled();
    });

    it('rejected events pass to next handler', () => {
      const handler1 = vi.fn((e: MuEvent) => {
        e.reject = true;
      });
      const handler2 = vi.fn();

      manager.defineMinorMode('mode1', 10, [['ev', handler2, '']], [['ev', handler1, '']]);
      manager.activateMode('mode1');

      const event: MuEvent = {
        name: 'ev',
        sender: '',
        contents: '',
        returnContents: '',
        reject: false,
      };

      manager.dispatchEvent(event);
      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('returns false when no handler matches', () => {
      const event: MuEvent = {
        name: 'unhandled',
        sender: '',
        contents: '',
        returnContents: '',
        reject: false,
      };

      expect(manager.dispatchEvent(event)).toBe(false);
    });

    it('does not dispatch to inactive modes', () => {
      const handler = vi.fn();
      manager.defineMinorMode('m', 0, [['ev', handler, '']], []);
      // Mode defined but NOT activated

      const event: MuEvent = {
        name: 'ev',
        sender: '',
        contents: '',
        returnContents: '',
        reject: false,
      };

      manager.dispatchEvent(event);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('event table stack', () => {
    it('pushes and pops event tables', () => {
      manager.pushEventTable('table1');
      manager.pushEventTable('table2');

      expect(manager.getActiveEventTables()).toEqual(['table1', 'table2']);

      manager.popEventTable('table1');
      expect(manager.getActiveEventTables()).toEqual(['table2']);
    });

    it('dispatches events through the table stack', () => {
      const handler = vi.fn();
      manager.pushEventTable('myTable');
      manager.bind('myTable', 'custom-event', handler, 'Test binding');

      const event: MuEvent = {
        name: 'custom-event',
        sender: '',
        contents: '',
        returnContents: '',
        reject: false,
      };

      const handled = manager.dispatchEvent(event);
      expect(handled).toBe(true);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('unbind removes bindings from table', () => {
      const handler = vi.fn();
      manager.pushEventTable('t');
      manager.bind('t', 'ev', handler);
      manager.unbind('t', 'ev');

      const event: MuEvent = {
        name: 'ev',
        sender: '',
        contents: '',
        returnContents: '',
        reject: false,
      };

      expect(manager.dispatchEvent(event)).toBe(false);
    });
  });

  describe('bindings introspection', () => {
    it('lists all active bindings', () => {
      manager.defineMinorMode('m', 0, [['ev1', vi.fn(), 'Doc 1']], []);
      manager.activateMode('m');

      manager.pushEventTable('t');
      manager.bind('t', 'ev2', vi.fn(), 'Doc 2');

      const bindings = manager.getBindings();
      expect(bindings.length).toBe(2);
      expect(bindings).toContainEqual(['ev1', 'Doc 1']);
      expect(bindings).toContainEqual(['ev2', 'Doc 2']);
    });

    it('gets binding documentation', () => {
      manager.pushEventTable('t');
      manager.bind('t', 'ev', vi.fn(), 'My documentation');

      expect(manager.getBindingDocumentation('t', 'ev')).toBe('My documentation');
      expect(manager.getBindingDocumentation('t', 'missing')).toBe('');
      expect(manager.getBindingDocumentation('missing', 'ev')).toBe('');
    });
  });

  describe('BBox constraints', () => {
    it('filters events by BBox when pointer is outside', () => {
      const handler = vi.fn();
      manager.pushEventTable('t');
      manager.bind('t', 'pointer--move', handler);
      manager.setEventTableBBox('t', 'region', 100, 100, 200, 200);

      const event: MuEvent = {
        name: 'pointer--move',
        sender: '',
        contents: '',
        returnContents: '',
        reject: false,
        pointer: { x: 50, y: 50 }, // Outside BBox
      };

      expect(manager.dispatchEvent(event)).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('allows events inside BBox', () => {
      const handler = vi.fn();
      manager.pushEventTable('t');
      manager.bind('t', 'pointer--move', handler);
      manager.setEventTableBBox('t', 'region', 100, 100, 200, 200);

      const event: MuEvent = {
        name: 'pointer--move',
        sender: '',
        contents: '',
        returnContents: '',
        reject: false,
        pointer: { x: 150, y: 150 }, // Inside BBox
      };

      expect(manager.dispatchEvent(event)).toBe(true);
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('dispose', () => {
    it('clears all state on dispose', () => {
      manager.defineMinorMode('m', 0, [], []);
      manager.activateMode('m');
      manager.pushEventTable('t');

      manager.dispose();

      expect(manager.getActiveModes()).toEqual([]);
      expect(manager.getActiveEventTables()).toEqual([]);
      expect(manager.isModeDefined('m')).toBe(false);
    });
  });
});

// ── MuEventBridge Tests ──

describe('MuEventBridge', () => {
  let bridge: MuEventBridge;

  beforeEach(() => {
    bridge = new MuEventBridge();
  });

  it('exposes the underlying ModeManager', () => {
    expect(bridge.getModeManager()).toBeInstanceOf(ModeManager);
  });

  it('bind and dispatch through bridge', () => {
    const handler = vi.fn();
    bridge.bind('', 'table', 'test-event', handler, 'test docs');

    bridge.sendInternalEvent('test-event', 'payload', 'sender');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]![0].contents).toBe('payload');
    expect(handler.mock.calls[0]![0].sender).toBe('sender');
  });

  it('unbind removes handler', () => {
    const handler = vi.fn();
    bridge.bind('', 'table', 'ev', handler);
    bridge.unbind('', 'table', 'ev');

    bridge.sendInternalEvent('ev');
    expect(handler).not.toHaveBeenCalled();
  });

  it('defineMinorMode and activate/deactivate', () => {
    const activate = vi.fn();
    const deactivate = vi.fn();

    bridge.defineMinorMode('myMode', 10, [], [], activate, deactivate);
    bridge.activateMode('myMode');
    expect(bridge.isModeActive('myMode')).toBe(true);
    expect(activate).toHaveBeenCalledOnce();

    bridge.deactivateMode('myMode');
    expect(bridge.isModeActive('myMode')).toBe(false);
    expect(deactivate).toHaveBeenCalledOnce();
  });

  it('activeModes returns active mode list', () => {
    bridge.defineMinorMode('a', 0, [], []);
    bridge.defineMinorMode('b', 1, [], []);

    bridge.activateMode('a');
    bridge.activateMode('b');

    expect(bridge.activeModes()).toContain('a');
    expect(bridge.activeModes()).toContain('b');
  });

  it('event table push/pop', () => {
    bridge.pushEventTable('myTable');
    expect(bridge.activeEventTables()).toContain('myTable');

    bridge.popEventTable('myTable');
    expect(bridge.activeEventTables()).not.toContain('myTable');
  });

  it('setEventTableBBox delegates to ModeManager', () => {
    bridge.pushEventTable('t');
    // Should not throw
    bridge.setEventTableBBox('t', 'tag', 0, 0, 100, 100);
  });

  it('bindings introspection', () => {
    bridge.bind('', 'table', 'ev1', vi.fn(), 'Doc A');
    bridge.bind('', 'table', 'ev2', vi.fn(), 'Doc B');

    const bindings = bridge.bindings();
    expect(bindings.length).toBeGreaterThanOrEqual(2);
  });

  it('bindingDocumentation', () => {
    bridge.bind('', 'table', 'ev', vi.fn(), 'My docs');
    expect(bridge.bindingDocumentation('table', 'ev')).toBe('My docs');
  });

  it('sendInternalEvent creates and dispatches MuEvent', () => {
    const handler = vi.fn();
    bridge.bind('', 'table', 'custom', handler);

    bridge.sendInternalEvent('custom', 'data', 'origin');
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'custom',
        contents: 'data',
        sender: 'origin',
        reject: false,
      }),
    );
  });

  it('dispose clears all state', () => {
    bridge.defineMinorMode('m', 0, [], []);
    bridge.activateMode('m');
    bridge.pushEventTable('t');

    bridge.dispose();

    expect(bridge.activeModes()).toEqual([]);
    expect(bridge.activeEventTables()).toEqual([]);
  });
});

// ── Regex Binding Dispatch Tests ──

describe('ModeManager regex dispatch', () => {
  let manager: ModeManager;

  beforeEach(() => {
    manager = new ModeManager();
  });

  function makeEvent(name: string): MuEvent {
    return {
      name,
      sender: '',
      contents: '',
      returnContents: '',
      reject: false,
    };
  }

  it('regex-bound handler fires when event name matches the pattern', () => {
    const handler = vi.fn();
    manager.pushEventTable('t');
    manager.bind('t', '__regex__key-down--.*', handler, 'doc', /key-down--.*/);

    expect(manager.dispatchEvent(makeEvent('key-down--a'))).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('regex-bound handler does NOT fire when event name does not match', () => {
    const handler = vi.fn();
    manager.pushEventTable('t');
    manager.bind('t', '__regex__key-down--.*', handler, 'doc', /key-down--.*/);

    expect(manager.dispatchEvent(makeEvent('pointer--move'))).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('multiple regex patterns — only the matching one fires', () => {
    const keyHandler = vi.fn();
    const pointerHandler = vi.fn();
    manager.pushEventTable('t');
    manager.bind('t', '__regex__key-down--.*', keyHandler, '', /key-down--.*/);
    manager.bind('t', '__regex__pointer--.*', pointerHandler, '', /pointer--.*/);

    manager.dispatchEvent(makeEvent('key-down--x'));

    expect(keyHandler).toHaveBeenCalledOnce();
    expect(pointerHandler).not.toHaveBeenCalled();
  });

  it('exact bindings take priority over regex bindings at the same table level', () => {
    const exactHandler = vi.fn();
    const regexHandler = vi.fn();
    manager.pushEventTable('t');
    manager.bind('t', 'key-down--a', exactHandler, 'exact');
    manager.bind('t', '__regex__key-down--.*', regexHandler, 'regex', /key-down--.*/);

    manager.dispatchEvent(makeEvent('key-down--a'));

    expect(exactHandler).toHaveBeenCalledOnce();
    expect(regexHandler).not.toHaveBeenCalled();
  });

  it('regex fires when there is no exact match but event matches regex', () => {
    const exactHandler = vi.fn();
    const regexHandler = vi.fn();
    manager.pushEventTable('t');
    manager.bind('t', 'key-down--a', exactHandler, 'exact');
    manager.bind('t', '__regex__key-down--.*', regexHandler, 'regex', /key-down--.*/);

    manager.dispatchEvent(makeEvent('key-down--b'));

    expect(exactHandler).not.toHaveBeenCalled();
    expect(regexHandler).toHaveBeenCalledOnce();
  });

  it('regex bindings work in override tables', () => {
    const handler = vi.fn();
    manager.defineMinorMode('m', 0, [], [
      ['__regex__key-down--.*', handler, 'override regex'],
    ]);
    manager.activateMode('m');

    expect(manager.dispatchEvent(makeEvent('key-down--z'))).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('regex bindings work in global tables', () => {
    const handler = vi.fn();
    manager.defineMinorMode('m', 0, [
      ['__regex__pointer--.*', handler, 'global regex'],
    ], []);
    manager.activateMode('m');

    expect(manager.dispatchEvent(makeEvent('pointer--move'))).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('override regex takes priority over event-table regex and global regex', () => {
    const overrideHandler = vi.fn();
    const tableHandler = vi.fn();
    const globalHandler = vi.fn();

    manager.defineMinorMode('m', 0,
      [['__regex__ev--.*', globalHandler, 'global']],
      [['__regex__ev--.*', overrideHandler, 'override']],
    );
    manager.activateMode('m');

    manager.pushEventTable('t');
    manager.bind('t', '__regex__ev--.*', tableHandler, 'table', /ev--.*/);

    manager.dispatchEvent(makeEvent('ev--test'));

    expect(overrideHandler).toHaveBeenCalledOnce();
    expect(tableHandler).not.toHaveBeenCalled();
    expect(globalHandler).not.toHaveBeenCalled();
  });

  it('event-table regex takes priority over global regex', () => {
    const tableHandler = vi.fn();
    const globalHandler = vi.fn();

    manager.defineMinorMode('m', 0,
      [['__regex__ev--.*', globalHandler, 'global']],
      [],
    );
    manager.activateMode('m');

    manager.pushEventTable('t');
    manager.bind('t', '__regex__ev--.*', tableHandler, 'table', /ev--.*/);

    manager.dispatchEvent(makeEvent('ev--test'));

    expect(tableHandler).toHaveBeenCalledOnce();
    expect(globalHandler).not.toHaveBeenCalled();
  });

  it('rejected regex binding passes to next handler', () => {
    const rejectHandler = vi.fn((e: MuEvent) => { e.reject = true; });
    const globalHandler = vi.fn();

    manager.defineMinorMode('m', 0,
      [['__regex__ev--.*', globalHandler, 'global']],
      [['__regex__ev--.*', rejectHandler, 'override reject']],
    );
    manager.activateMode('m');

    manager.dispatchEvent(makeEvent('ev--x'));

    expect(rejectHandler).toHaveBeenCalledOnce();
    // After override regex rejects, dispatch continues to event tables then global
    expect(globalHandler).toHaveBeenCalledOnce();
  });

  it('returns false when no regex binding matches', () => {
    manager.pushEventTable('t');
    manager.bind('t', '__regex__key-down--.*', vi.fn(), '', /key-down--.*/);

    expect(manager.dispatchEvent(makeEvent('completely-different'))).toBe(false);
  });

  it('regex with /g flag matches on every dispatch, not just alternating ones', () => {
    const handler = vi.fn();
    manager.pushEventTable('t');
    manager.bind('t', '__regex__key-down--.*', handler, 'doc', /key-down--.*/g);

    expect(manager.dispatchEvent(makeEvent('key-down--a'))).toBe(true);
    expect(manager.dispatchEvent(makeEvent('key-down--a'))).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('regex with /y flag matches on every dispatch, not just alternating ones', () => {
    const handler = vi.fn();
    manager.pushEventTable('t');
    manager.bind('t', '__regex__key-down--.*', handler, 'doc', /key-down--.*/y);

    expect(manager.dispatchEvent(makeEvent('key-down--a'))).toBe(true);
    expect(manager.dispatchEvent(makeEvent('key-down--a'))).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('handler fires on every dispatch with stateful regex, not alternating', () => {
    const handler = vi.fn();
    manager.pushEventTable('t');
    manager.bind('t', '__regex__ev--.*', handler, 'doc', /ev--.*/g);

    for (let i = 0; i < 5; i++) {
      expect(manager.dispatchEvent(makeEvent('ev--test'))).toBe(true);
    }
    expect(handler).toHaveBeenCalledTimes(5);
  });
});

describe('MuEventBridge regex binding', () => {
  let bridge: MuEventBridge;

  beforeEach(() => {
    bridge = new MuEventBridge();
  });

  it('bindRegex registers and dispatches matching events', () => {
    const handler = vi.fn();
    bridge.bindRegex('', 'table', /key-down--.*/, handler, 'regex doc');

    bridge.sendInternalEvent('key-down--a');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('bindRegex does not fire for non-matching events', () => {
    const handler = vi.fn();
    bridge.bindRegex('', 'table', /key-down--.*/, handler);

    bridge.sendInternalEvent('pointer--move');
    expect(handler).not.toHaveBeenCalled();
  });

  it('unbindRegex removes the binding and it stops firing', () => {
    const handler = vi.fn();
    const pattern = /key-down--.*/;
    bridge.bindRegex('', 'table', pattern, handler);

    bridge.sendInternalEvent('key-down--a');
    expect(handler).toHaveBeenCalledOnce();

    bridge.unbindRegex('', 'table', pattern);

    bridge.sendInternalEvent('key-down--b');
    expect(handler).toHaveBeenCalledOnce(); // not called again
  });

  it('exact bind takes priority over bindRegex at same table', () => {
    const exactHandler = vi.fn();
    const regexHandler = vi.fn();

    bridge.bind('', 'table', 'key-down--a', exactHandler, 'exact');
    bridge.bindRegex('', 'table', /key-down--.*/, regexHandler, 'regex');

    bridge.sendInternalEvent('key-down--a');

    expect(exactHandler).toHaveBeenCalledOnce();
    expect(regexHandler).not.toHaveBeenCalled();
  });

  it('regex with flags works correctly', () => {
    const handler = vi.fn();
    bridge.bindRegex('', 'table', /KEY-DOWN--a/i, handler, 'case insensitive');

    bridge.sendInternalEvent('key-down--a');
    expect(handler).toHaveBeenCalledOnce();
  });
});

// ── Mode-scoped binding tests (Issue #242) ──

describe('MuEventBridge mode-scoped bindings', () => {
  let bridge: MuEventBridge;

  beforeEach(() => {
    bridge = new MuEventBridge();
  });

  it('handler bound to a mode does NOT fire when that mode is not active', () => {
    const handler = vi.fn();
    bridge.defineMinorMode('modeA', 0, [], []);
    bridge.bind('modeA', 'table', 'ev', handler);

    bridge.sendInternalEvent('ev');
    expect(handler).not.toHaveBeenCalled();
  });

  it('handler bound to a mode fires when that mode is active', () => {
    const handler = vi.fn();
    bridge.defineMinorMode('modeA', 0, [], []);
    bridge.bind('modeA', 'table', 'ev', handler);

    bridge.activateMode('modeA');
    bridge.sendInternalEvent('ev');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('handler fires while mode active, stops when deactivated', () => {
    const handler = vi.fn();
    bridge.defineMinorMode('modeA', 0, [], []);
    bridge.bind('modeA', 'table', 'ev', handler);

    bridge.activateMode('modeA');
    bridge.sendInternalEvent('ev');
    expect(handler).toHaveBeenCalledOnce();

    bridge.deactivateMode('modeA');
    bridge.sendInternalEvent('ev');
    expect(handler).toHaveBeenCalledOnce(); // not called again
  });

  it('multiple modes: only active mode handler fires', () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    bridge.defineMinorMode('modeA', 0, [], []);
    bridge.defineMinorMode('modeB', 1, [], []);
    bridge.bind('modeA', 'tableA', 'ev', handlerA);
    bridge.bind('modeB', 'tableB', 'ev', handlerB);

    bridge.activateMode('modeA');
    bridge.sendInternalEvent('ev');
    expect(handlerA).toHaveBeenCalledOnce();
    expect(handlerB).not.toHaveBeenCalled();
  });

  it('default modeName handlers always fire (backward compat)', () => {
    const handler = vi.fn();
    bridge.bind('default', 'table', 'ev', handler);

    bridge.sendInternalEvent('ev');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('empty modeName handlers always fire (backward compat)', () => {
    const handler = vi.fn();
    bridge.bind('', 'table', 'ev', handler);

    bridge.sendInternalEvent('ev');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('unbind with modeName removes only the mode-scoped binding', () => {
    const modeHandler = vi.fn();
    const globalHandler = vi.fn();
    bridge.defineMinorMode('modeA', 0, [], []);
    bridge.bind('modeA', 'table', 'ev', modeHandler);
    bridge.bind('', 'table', 'ev', globalHandler);

    bridge.activateMode('modeA');
    bridge.unbind('modeA', 'table', 'ev');

    bridge.sendInternalEvent('ev');
    expect(modeHandler).not.toHaveBeenCalled();
    expect(globalHandler).toHaveBeenCalledOnce();
  });

  it('always-active table binding takes precedence over mode-scoped binding', () => {
    const tableHandler = vi.fn();
    const modeHandler = vi.fn();
    bridge.defineMinorMode('modeA', 0, [], []);
    bridge.bind('', 'table', 'ev', tableHandler);
    bridge.bind('modeA', 'scopedTable', 'ev', modeHandler);

    bridge.activateMode('modeA');
    bridge.sendInternalEvent('ev');

    // Always-active table stack is checked before mode-scoped tables
    expect(tableHandler).toHaveBeenCalledOnce();
    expect(modeHandler).not.toHaveBeenCalled();
  });

  it('mode-scoped regex binding only fires when mode is active', () => {
    const handler = vi.fn();
    bridge.defineMinorMode('modeA', 0, [], []);
    bridge.bindRegex('modeA', 'table', /key-down--.*/, handler);

    bridge.sendInternalEvent('key-down--a');
    expect(handler).not.toHaveBeenCalled();

    bridge.activateMode('modeA');
    bridge.sendInternalEvent('key-down--a');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('mode-scoped unbindRegex removes only mode-scoped regex binding', () => {
    const modeHandler = vi.fn();
    const globalHandler = vi.fn();
    const pattern = /key-down--.*/;
    bridge.defineMinorMode('modeA', 0, [], []);
    bridge.bindRegex('modeA', 'table', pattern, modeHandler);
    bridge.bindRegex('', 'table', pattern, globalHandler);

    bridge.activateMode('modeA');
    bridge.unbindRegex('modeA', 'table', pattern);

    bridge.sendInternalEvent('key-down--x');
    expect(modeHandler).not.toHaveBeenCalled();
    expect(globalHandler).toHaveBeenCalledOnce();
  });

  it('reactivating a mode makes its bindings fire again', () => {
    const handler = vi.fn();
    bridge.defineMinorMode('modeA', 0, [], []);
    bridge.bind('modeA', 'table', 'ev', handler);

    bridge.activateMode('modeA');
    bridge.sendInternalEvent('ev');
    expect(handler).toHaveBeenCalledTimes(1);

    bridge.deactivateMode('modeA');
    bridge.sendInternalEvent('ev');
    expect(handler).toHaveBeenCalledTimes(1);

    bridge.activateMode('modeA');
    bridge.sendInternalEvent('ev');
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('getBindings includes mode-scoped bindings only when mode is active', () => {
    bridge.defineMinorMode('modeA', 0, [], []);
    bridge.bind('modeA', 'table', 'ev', vi.fn(), 'Mode doc');

    expect(bridge.bindings()).toEqual([]);

    bridge.activateMode('modeA');
    const bindings = bridge.bindings();
    expect(bindings).toContainEqual(['ev', 'Mode doc']);
  });
});

describe('ModeManager mode-scoped bindings', () => {
  let manager: ModeManager;

  beforeEach(() => {
    manager = new ModeManager();
  });

  function makeEvent(name: string): MuEvent {
    return { name, sender: '', contents: '', returnContents: '', reject: false };
  }

  it('mode-scoped binding does not dispatch when mode is inactive', () => {
    const handler = vi.fn();
    manager.defineMinorMode('m', 0, [], []);
    manager.bind('table', 'ev', handler, '', undefined, 'm');

    expect(manager.dispatchEvent(makeEvent('ev'))).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('mode-scoped binding dispatches when mode is active', () => {
    const handler = vi.fn();
    manager.defineMinorMode('m', 0, [], []);
    manager.bind('table', 'ev', handler, '', undefined, 'm');

    manager.activateMode('m');
    expect(manager.dispatchEvent(makeEvent('ev'))).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('dispose clears mode-scoped tables', () => {
    const handler = vi.fn();
    manager.defineMinorMode('m', 0, [], []);
    manager.bind('table', 'ev', handler, '', undefined, 'm');
    manager.activateMode('m');

    manager.dispose();
    manager.defineMinorMode('m', 0, [], []);
    manager.activateMode('m');

    expect(manager.dispatchEvent(makeEvent('ev'))).toBe(false);
  });

  it('override tables still take priority over mode-scoped tables', () => {
    const overrideHandler = vi.fn();
    const scopedHandler = vi.fn();

    manager.defineMinorMode('m', 0, [], [['ev', overrideHandler, 'override']]);
    manager.bind('table', 'ev', scopedHandler, '', undefined, 'm');
    manager.activateMode('m');

    manager.dispatchEvent(makeEvent('ev'));
    expect(overrideHandler).toHaveBeenCalledOnce();
    expect(scopedHandler).not.toHaveBeenCalled();
  });

  it('getBindingDocumentation returns mode-scoped doc when table exists on stack with different event', () => {
    // Place a binding for 'otherEv' on the always-active event table stack
    manager.bind('table', 'otherEv', vi.fn(), 'Stack doc');

    // Place a mode-scoped binding for 'ev' under the same table name
    manager.defineMinorMode('m', 0, [], []);
    manager.activateMode('m');
    manager.bind('table', 'ev', vi.fn(), 'Mode-scoped doc', undefined, 'm');

    // Without the fix, getBindingDocumentation early-returns '' because
    // 'table' is found on the stack even though 'ev' isn't bound there.
    expect(manager.getBindingDocumentation('table', 'ev')).toBe('Mode-scoped doc');
  });

  it('getBindingDocumentation returns empty string for inactive mode-scoped binding', () => {
    manager.defineMinorMode('m', 0, [], []);
    // Bind to mode but do NOT activate it
    manager.bind('table', 'ev', vi.fn(), 'Mode-scoped doc', undefined, 'm');

    expect(manager.getBindingDocumentation('table', 'ev')).toBe('');
  });

  it('getBindingDocumentation reflects mode activation and deactivation', () => {
    manager.defineMinorMode('m', 0, [], []);
    manager.bind('table', 'ev', vi.fn(), 'Mode-scoped doc', undefined, 'm');

    // Not active yet
    expect(manager.getBindingDocumentation('table', 'ev')).toBe('');

    // Activate — doc should be returned
    manager.activateMode('m');
    expect(manager.getBindingDocumentation('table', 'ev')).toBe('Mode-scoped doc');

    // Deactivate — doc should disappear
    manager.deactivateMode('m');
    expect(manager.getBindingDocumentation('table', 'ev')).toBe('');
  });
});

describe('MuSettingsBridge', () => {
  let settings: MuSettingsBridge;

  beforeEach(() => {
    settings = new MuSettingsBridge();
    // Clean up any leftover settings
    settings.clearAll();
  });

  it('returns default value when setting does not exist', () => {
    expect(settings.readSetting('test', 'missing', 42)).toBe(42);
    expect(settings.readSetting('test', 'missing', 'default')).toBe('default');
    expect(settings.readSetting('test', 'missing', true)).toBe(true);
  });

  it('writes and reads a number setting', () => {
    settings.writeSetting('app', 'volume', 0.75);
    expect(settings.readSetting('app', 'volume', 0)).toBe(0.75);
  });

  it('writes and reads a string setting', () => {
    settings.writeSetting('ui', 'theme', 'dark');
    expect(settings.readSetting('ui', 'theme', 'light')).toBe('dark');
  });

  it('writes and reads a boolean setting', () => {
    settings.writeSetting('flags', 'autoplay', true);
    expect(settings.readSetting('flags', 'autoplay', false)).toBe(true);
  });

  it('writes and reads an array setting', () => {
    settings.writeSetting('recent', 'files', ['a.exr', 'b.dpx']);
    expect(settings.readSetting('recent', 'files', [])).toEqual(['a.exr', 'b.dpx']);
  });

  it('hasSetting checks existence', () => {
    expect(settings.hasSetting('g', 'k')).toBe(false);
    settings.writeSetting('g', 'k', 1);
    expect(settings.hasSetting('g', 'k')).toBe(true);
  });

  it('removeSetting removes a setting', () => {
    settings.writeSetting('g', 'k', 'val');
    settings.removeSetting('g', 'k');
    expect(settings.hasSetting('g', 'k')).toBe(false);
  });

  it('listSettings returns keys in a group', () => {
    settings.writeSetting('grp', 'a', 1);
    settings.writeSetting('grp', 'b', 2);
    settings.writeSetting('other', 'c', 3);

    const keys = settings.listSettings('grp');
    expect(keys).toContain('a');
    expect(keys).toContain('b');
    expect(keys).not.toContain('c');
  });

  it('clearGroup removes all settings in a group', () => {
    settings.writeSetting('grp', 'x', 1);
    settings.writeSetting('grp', 'y', 2);
    settings.writeSetting('other', 'z', 3);

    settings.clearGroup('grp');

    expect(settings.hasSetting('grp', 'x')).toBe(false);
    expect(settings.hasSetting('grp', 'y')).toBe(false);
    expect(settings.hasSetting('other', 'z')).toBe(true);

    // Cleanup
    settings.clearAll();
  });

  it('clearAll removes all openrv settings', () => {
    settings.writeSetting('a', 'x', 1);
    settings.writeSetting('b', 'y', 2);

    settings.clearAll();

    expect(settings.hasSetting('a', 'x')).toBe(false);
    expect(settings.hasSetting('b', 'y')).toBe(false);
  });
});

// ── MuUtilsBridge Tests ──

describe('MuUtilsBridge', () => {
  let utils: MuUtilsBridge;

  beforeEach(() => {
    utils = new MuUtilsBridge();
  });

  describe('timer', () => {
    it('starts and stops a timer', () => {
      expect(utils.isTimerRunning()).toBe(false);

      utils.startTimer();
      expect(utils.isTimerRunning()).toBe(true);
      expect(utils.elapsedTime()).toBeGreaterThanOrEqual(0);

      utils.stopTimer();
      expect(utils.isTimerRunning()).toBe(false);

      const elapsed = utils.elapsedTime();
      expect(elapsed).toBeGreaterThanOrEqual(0);
      // Elapsed should be stable after stopping
      expect(utils.elapsedTime()).toBe(elapsed);
    });

    it('theTime returns current time in seconds', () => {
      const now = Date.now() / 1000;
      const time = utils.theTime();
      expect(Math.abs(time - now)).toBeLessThan(1);
    });
  });

  describe('fileKind', () => {
    it('detects image files', () => {
      expect(utils.fileKind('test.exr')).toBe(FileKind.ImageFile);
      expect(utils.fileKind('photo.jpg')).toBe(FileKind.ImageFile);
      expect(utils.fileKind('image.png')).toBe(FileKind.ImageFile);
      expect(utils.fileKind('scan.dpx')).toBe(FileKind.ImageFile);
      expect(utils.fileKind('render.tiff')).toBe(FileKind.ImageFile);
    });

    it('detects movie files', () => {
      expect(utils.fileKind('clip.mov')).toBe(FileKind.MovieFile);
      expect(utils.fileKind('video.mp4')).toBe(FileKind.MovieFile);
      expect(utils.fileKind('footage.mxf')).toBe(FileKind.MovieFile);
    });

    it('detects audio files', () => {
      expect(utils.fileKind('music.wav')).toBe(FileKind.AudioFile);
      expect(utils.fileKind('sound.mp3')).toBe(FileKind.AudioFile);
    });

    it('detects LUT files', () => {
      expect(utils.fileKind('grade.cube')).toBe(FileKind.LUTFile);
      expect(utils.fileKind('lut.3dl')).toBe(FileKind.LUTFile);
    });

    it('detects CDL files', () => {
      expect(utils.fileKind('color.cdl')).toBe(FileKind.CDLFile);
    });

    it('detects RV session files', () => {
      expect(utils.fileKind('session.rv')).toBe(FileKind.RVFile);
    });

    it('returns unknown for unrecognized extensions', () => {
      expect(utils.fileKind('readme.txt')).toBe(FileKind.UnknownFile);
      expect(utils.fileKind('noext')).toBe(FileKind.UnknownFile);
    });

    it('handles case insensitivity', () => {
      expect(utils.fileKind('TEST.EXR')).toBe(FileKind.ImageFile);
      expect(utils.fileKind('VIDEO.MP4')).toBe(FileKind.MovieFile);
    });

    it('handles URLs with query strings', () => {
      expect(utils.fileKind('https://example.com/shot.exr?token=abc')).toBe(FileKind.ImageFile);
      expect(utils.fileKind('path/to/lut.3dl?v=2&sig=xyz')).toBe(FileKind.LUTFile);
      expect(utils.fileKind('image.jpg?')).toBe(FileKind.ImageFile);
    });

    it('handles URLs with fragments', () => {
      expect(utils.fileKind('https://example.com/video.mp4#t=10')).toBe(FileKind.MovieFile);
      expect(utils.fileKind('movie.mov#')).toBe(FileKind.MovieFile);
    });

    it('handles URLs with both query strings and fragments', () => {
      expect(utils.fileKind('https://cdn.example.com/shot.exr?token=abc#preview')).toBe(FileKind.ImageFile);
    });
  });

  describe('progressive loading', () => {
    it('tracks load counters', () => {
      expect(utils.loadTotal()).toBe(0);
      expect(utils.loadCount()).toBe(0);

      utils.setLoadCounters(5, 3);
      expect(utils.loadTotal()).toBe(5);
      expect(utils.loadCount()).toBe(3);
    });

    it('progressive source loading toggle', () => {
      expect(utils.progressiveSourceLoading()).toBe(true);
      utils.setProgressiveSourceLoading(false);
      expect(utils.progressiveSourceLoading()).toBe(false);
    });

    it('waitForProgressiveLoading resolves immediately when nothing to load', async () => {
      utils.setLoadCounters(0, 0);
      await utils.waitForProgressiveLoading(); // Should resolve
    });
  });

  describe('device pixel ratio', () => {
    it('returns a number', () => {
      expect(typeof utils.devicePixelRatio()).toBe('number');
      expect(utils.devicePixelRatio()).toBeGreaterThan(0);
    });
  });
});

// ── MuNetworkBridge Tests ──

describe('MuNetworkBridge', () => {
  let network: MuNetworkBridge;

  beforeEach(() => {
    network = new MuNetworkBridge();
  });

  it('starts with no connections', () => {
    expect(network.remoteConnections()).toEqual([]);
    expect(network.remoteApplications()).toEqual([]);
    expect(network.remoteContacts()).toEqual([]);
  });

  it('manages local contact name', () => {
    expect(network.remoteLocalContactName()).toBe('openrv-web');
    network.setRemoteLocalContactName('my-app');
    expect(network.remoteLocalContactName()).toBe('my-app');
  });

  it('network status starts as off', () => {
    expect(network.remoteNetworkStatus()).toBe(0);
  });

  it('enabling network changes status', () => {
    network.remoteNetwork(true);
    expect(network.remoteNetworkStatus()).toBe(1);

    network.remoteNetwork(false);
    expect(network.remoteNetworkStatus()).toBe(0);
  });

  it('default permission management', () => {
    expect(network.remoteDefaultPermission()).toBe(0);
    network.setRemoteDefaultPermission(2);
    expect(network.remoteDefaultPermission()).toBe(2);
  });

  it('warns when connecting without enabling network', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    network.remoteConnect('test', 'localhost', 9876);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not enabled'),
    );
    warnSpy.mockRestore();
  });

  it('dispose cleans up', () => {
    network.dispose();
    expect(network.remoteConnections()).toEqual([]);
  });
});

// ── MuNetworkBridge Wire-Protocol Tests (Issue #244) ──

describe('MuNetworkBridge wire protocol', () => {
  let network: MuNetworkBridge;
  let mockWs: {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    readyState: number;
    addEventListener: ReturnType<typeof vi.fn>;
    listeners: Record<string, Array<(e?: unknown) => void>>;
  };

  beforeEach(() => {
    network = new MuNetworkBridge();
    network.remoteNetwork(true);

    // Track listeners for manual triggering
    const listeners: Record<string, Array<(e?: unknown) => void>> = {};

    mockWs = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.OPEN,
      addEventListener: vi.fn((event: string, handler: (e?: unknown) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      }),
      listeners,
    };

    // Use a class-based mock so `new WebSocket(...)` works
    const MockWebSocket = function (this: typeof mockWs) {
      Object.assign(this, mockWs);
    } as unknown as typeof WebSocket;
    // Preserve the OPEN constant for readyState checks
    (MockWebSocket as unknown as Record<string, number>).OPEN = WebSocket.OPEN;
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function triggerOpen() {
    for (const handler of mockWs.listeners['open'] ?? []) {
      handler();
    }
  }

  function triggerMessage(data: string) {
    for (const handler of mockWs.listeners['message'] ?? []) {
      handler({ data } as MessageEvent);
    }
  }

  it('remoteConnect sends handshake with localContactName and defaultPermission on open', () => {
    network.setRemoteLocalContactName('alice');
    network.setRemoteDefaultPermission(2);
    network.remoteConnect('test-app', 'localhost', 9876);

    // Before open, no messages sent
    expect(mockWs.send).not.toHaveBeenCalled();

    // Trigger WebSocket open
    triggerOpen();

    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const handshake = JSON.parse(mockWs.send.mock.calls[0]![0] as string);
    expect(handshake).toEqual({
      type: 'handshake',
      contactName: 'alice',
      permission: 2,
    });
  });

  it('handshake uses "anonymous" when localContactName is empty', () => {
    network.setRemoteLocalContactName('');
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();

    const handshake = JSON.parse(mockWs.send.mock.calls[0]![0] as string);
    expect(handshake.contactName).toBe('anonymous');
  });

  it('handshake transmits defaultPermission=0 by default', () => {
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();

    const handshake = JSON.parse(mockWs.send.mock.calls[0]![0] as string);
    expect(handshake.permission).toBe(0);
  });

  it('remoteSendMessage includes senderContactName in payload', () => {
    network.setRemoteLocalContactName('bob');
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();
    mockWs.send.mockClear();

    network.remoteSendMessage('localhost:9876', ['hello', 'world']);

    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const msg = JSON.parse(mockWs.send.mock.calls[0]![0] as string);
    expect(msg.type).toBe('message');
    expect(msg.data).toEqual(['hello', 'world']);
    expect(msg.senderContactName).toBe('bob');
  });

  it('remoteSendEvent includes senderContactName in payload', () => {
    network.setRemoteLocalContactName('carol');
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();
    mockWs.send.mockClear();

    network.remoteSendEvent('play', 'viewer', 'frame=1', ['mu']);

    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const msg = JSON.parse(mockWs.send.mock.calls[0]![0] as string);
    expect(msg.type).toBe('event');
    expect(msg.event).toBe('play');
    expect(msg.target).toBe('viewer');
    expect(msg.contents).toBe('frame=1');
    expect(msg.interp).toEqual(['mu']);
    expect(msg.senderContactName).toBe('carol');
  });

  it('remoteSendDataEvent includes senderContactName in header', () => {
    network.setRemoteLocalContactName('dave');
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();
    mockWs.send.mockClear();

    const binaryData = new Uint8Array([1, 2, 3, 4]);
    network.remoteSendDataEvent('upload', 'target', 'meta', binaryData, ['mu']);

    // header + binary = 2 sends
    expect(mockWs.send).toHaveBeenCalledTimes(2);
    const header = JSON.parse(mockWs.send.mock.calls[0]![0] as string);
    expect(header.type).toBe('dataEvent');
    expect(header.event).toBe('upload');
    expect(header.dataLength).toBe(4);
    expect(header.senderContactName).toBe('dave');

    // Second send is the binary data
    expect(mockWs.send.mock.calls[1]![0]).toEqual(binaryData);
  });

  it('changing localContactName after connect affects subsequent messages', () => {
    network.setRemoteLocalContactName('original');
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();
    mockWs.send.mockClear();

    network.remoteSendMessage('localhost:9876', ['msg1']);
    const msg1 = JSON.parse(mockWs.send.mock.calls[0]![0] as string);
    expect(msg1.senderContactName).toBe('original');

    network.setRemoteLocalContactName('updated');
    network.remoteSendMessage('localhost:9876', ['msg2']);
    const msg2 = JSON.parse(mockWs.send.mock.calls[1]![0] as string);
    expect(msg2.senderContactName).toBe('updated');
  });

  it('send methods use "anonymous" when localContactName is empty', () => {
    network.setRemoteLocalContactName('');
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();
    mockWs.send.mockClear();

    network.remoteSendMessage('localhost:9876', ['test']);
    const msg = JSON.parse(mockWs.send.mock.calls[0]![0] as string);
    expect(msg.senderContactName).toBe('anonymous');

    mockWs.send.mockClear();
    network.remoteSendEvent('ev', 'tgt', 'body');
    const evt = JSON.parse(mockWs.send.mock.calls[0]![0] as string);
    expect(evt.senderContactName).toBe('anonymous');
  });

  it('existing wire fields are preserved in message payload', () => {
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();
    mockWs.send.mockClear();

    network.remoteSendEvent('play', 'viewer', 'frame=1', ['mu']);
    const msg = JSON.parse(mockWs.send.mock.calls[0]![0] as string);

    // All original fields still present
    expect(msg).toHaveProperty('type', 'event');
    expect(msg).toHaveProperty('event', 'play');
    expect(msg).toHaveProperty('target', 'viewer');
    expect(msg).toHaveProperty('contents', 'frame=1');
    expect(msg).toHaveProperty('interp');
    // New field is additive
    expect(msg).toHaveProperty('senderContactName');
  });

  it('permission=0 logs warning for incoming non-handshake messages', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    network.setRemoteDefaultPermission(0);
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();

    triggerMessage(JSON.stringify({ type: 'message', data: ['hello'] }));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Rejecting incoming "message"'),
    );
    warnSpy.mockRestore();
  });

  it('permission=1 (read) logs warning for incoming write-type messages', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    network.setRemoteDefaultPermission(1);
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();

    triggerMessage(JSON.stringify({ type: 'event', event: 'play' }));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Rejecting incoming "event"'),
    );
    warnSpy.mockRestore();
  });

  it('permission=2 (readwrite) allows incoming messages without warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    network.setRemoteDefaultPermission(2);
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();

    triggerMessage(JSON.stringify({ type: 'message', data: ['hello'] }));

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Rejecting'),
    );
    warnSpy.mockRestore();
  });

  it('permission=0 allows incoming handshake messages', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    network.setRemoteDefaultPermission(0);
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();

    triggerMessage(JSON.stringify({ type: 'handshake', contactName: 'peer' }));

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Rejecting'),
    );
    warnSpy.mockRestore();
  });

  it('incoming handshake stores peer identity', () => {
    network.setRemoteDefaultPermission(0);
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();

    triggerMessage(JSON.stringify({ type: 'handshake', contactName: 'peer-rv', permission: 2 }));

    const info = network.getConnectionInfo('localhost:9876');
    expect(info).toBeDefined();
    expect(info!.peerContactName).toBe('peer-rv');
    expect(info!.peerPermission).toBe(2);
  });

  it('incoming message at permission 2 is dispatched', () => {
    network.setRemoteDefaultPermission(2);
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();

    const handler = vi.fn();
    network.setOnRemoteMessage(handler);

    triggerMessage(JSON.stringify({ type: 'message', data: ['hello', 'world'], senderContactName: 'peer' }));

    expect(handler).toHaveBeenCalledWith('localhost:9876', ['hello', 'world'], 'peer');
  });

  it('incoming event at permission 2 is dispatched', () => {
    network.setRemoteDefaultPermission(2);
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();

    const handler = vi.fn();
    network.setOnRemoteEvent(handler);

    triggerMessage(JSON.stringify({
      type: 'event',
      event: 'play',
      target: 'viewer',
      contents: 'frame=1',
      interp: ['mu'],
      senderContactName: 'peer',
    }));

    expect(handler).toHaveBeenCalledWith('localhost:9876', 'play', 'viewer', 'frame=1', ['mu'], 'peer');
  });

  it('binary data event frame is associated with its JSON header', () => {
    vi.useFakeTimers();
    network.setRemoteDefaultPermission(2);
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();

    const handler = vi.fn();
    network.setOnRemoteDataEvent(handler);

    // Send the JSON header first
    triggerMessage(JSON.stringify({
      type: 'dataEvent',
      event: 'upload',
      target: 'target',
      contents: 'meta',
      interp: ['mu'],
      dataLength: 4,
      senderContactName: 'peer',
    }));

    expect(handler).not.toHaveBeenCalled();

    // Send the binary follow-up
    const binaryData = new Uint8Array([1, 2, 3, 4]).buffer;
    for (const h of mockWs.listeners['message'] ?? []) {
      h({ data: binaryData } as MessageEvent);
    }

    expect(handler).toHaveBeenCalledWith(
      'localhost:9876',
      'upload',
      'target',
      'meta',
      new Uint8Array([1, 2, 3, 4]),
      ['mu'],
      'peer',
    );
    vi.useRealTimers();
  });

  it('binary frame without preceding header is dropped safely', () => {
    network.setRemoteDefaultPermission(2);
    network.remoteConnect('test-app', 'localhost', 9876);
    triggerOpen();

    const handler = vi.fn();
    network.setOnRemoteDataEvent(handler);

    // Send a binary frame without a preceding dataEvent header
    const binaryData = new Uint8Array([1, 2, 3, 4]).buffer;
    for (const h of mockWs.listeners['message'] ?? []) {
      h({ data: binaryData } as MessageEvent);
    }

    expect(handler).not.toHaveBeenCalled();
  });
});

// ── MuNetworkBridge dataEvent edge-case tests (Issue #244 QA) ──

describe('MuNetworkBridge dataEvent edge cases', () => {
  let network: MuNetworkBridge;
  let mockWs: {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    readyState: number;
    addEventListener: ReturnType<typeof vi.fn>;
    listeners: Record<string, Array<(e?: unknown) => void>>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    network = new MuNetworkBridge();
    network.remoteNetwork(true);
    network.setRemoteDefaultPermission(2);

    const listeners: Record<string, Array<(e?: unknown) => void>> = {};

    mockWs = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.OPEN,
      addEventListener: vi.fn((event: string, handler: (e?: unknown) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      }),
      listeners,
    };

    const MockWebSocket = function (this: typeof mockWs) {
      Object.assign(this, mockWs);
    } as unknown as typeof WebSocket;
    (MockWebSocket as unknown as Record<string, number>).OPEN = WebSocket.OPEN;
    vi.stubGlobal('WebSocket', MockWebSocket);

    network.remoteConnect('test-app', 'localhost', 9876);
    // Trigger open
    for (const handler of mockWs.listeners['open'] ?? []) {
      handler();
    }
  });

  afterEach(() => {
    network.dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function triggerMessage(data: string | ArrayBuffer) {
    for (const h of mockWs.listeners['message'] ?? []) {
      h({ data } as MessageEvent);
    }
  }

  // Fix 3: dataEvent timeout expires pending entry
  it('dataEvent header expires after timeout — binary follow-up is ignored', () => {
    const handler = vi.fn();
    network.setOnRemoteDataEvent(handler);

    triggerMessage(JSON.stringify({
      type: 'dataEvent',
      event: 'upload',
      target: 'tgt',
      contents: '',
      interp: [],
      dataLength: 4,
      senderContactName: 'peer',
    }));

    // Advance past the 5 000 ms timeout
    vi.advanceTimersByTime(5000);

    // Now send the binary follow-up — should be dropped
    triggerMessage(new Uint8Array([1, 2, 3, 4]).buffer);

    expect(handler).not.toHaveBeenCalled();
  });

  // Fix 4: backward-compat — missing senderContactName defaults to ''
  it('incoming message without senderContactName delivers empty string', () => {
    const handler = vi.fn();
    network.setOnRemoteMessage(handler);

    triggerMessage(JSON.stringify({ type: 'message', data: ['hi'] }));

    expect(handler).toHaveBeenCalledWith('localhost:9876', ['hi'], '');
  });

  it('incoming event without senderContactName delivers empty string', () => {
    const handler = vi.fn();
    network.setOnRemoteEvent(handler);

    triggerMessage(JSON.stringify({
      type: 'event',
      event: 'play',
      target: 'viewer',
      contents: '',
      interp: [],
    }));

    expect(handler).toHaveBeenCalledWith('localhost:9876', 'play', 'viewer', '', [], '');
  });

  // Fix 5: permission tests for dataEvent at levels 0 and 1
  it('permission=0 rejects dataEvent header and creates no pending state', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    network.setRemoteDefaultPermission(0);

    const handler = vi.fn();
    network.setOnRemoteDataEvent(handler);

    triggerMessage(JSON.stringify({
      type: 'dataEvent',
      event: 'upload',
      target: 'tgt',
      contents: '',
      interp: [],
      dataLength: 4,
      senderContactName: 'peer',
    }));

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Rejecting incoming "dataEvent"'));

    // Binary follow-up should not fire handler (no pending state)
    triggerMessage(new Uint8Array([1, 2, 3, 4]).buffer);
    expect(handler).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('permission=1 rejects dataEvent header and creates no pending state', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    network.setRemoteDefaultPermission(1);

    const handler = vi.fn();
    network.setOnRemoteDataEvent(handler);

    triggerMessage(JSON.stringify({
      type: 'dataEvent',
      event: 'upload',
      target: 'tgt',
      contents: '',
      interp: [],
      dataLength: 4,
      senderContactName: 'peer',
    }));

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Rejecting incoming "dataEvent"'));

    triggerMessage(new Uint8Array([1, 2, 3, 4]).buffer);
    expect(handler).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // Fix 1 test: rapid dataEvent headers — second overwrites first cleanly
  it('rapid dataEvent headers — only the second header fires on binary', () => {
    const handler = vi.fn();
    network.setOnRemoteDataEvent(handler);

    // First header
    triggerMessage(JSON.stringify({
      type: 'dataEvent',
      event: 'first',
      target: 'tgt',
      contents: 'c1',
      interp: [],
      dataLength: 2,
      senderContactName: 'peer',
    }));

    // Second header arrives before binary follow-up
    triggerMessage(JSON.stringify({
      type: 'dataEvent',
      event: 'second',
      target: 'tgt',
      contents: 'c2',
      interp: [],
      dataLength: 2,
      senderContactName: 'peer',
    }));

    // Binary follow-up — should match the second header
    triggerMessage(new Uint8Array([0xAB, 0xCD]).buffer);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      'localhost:9876',
      'second',
      'tgt',
      'c2',
      new Uint8Array([0xAB, 0xCD]),
      [],
      'peer',
    );
  });
});

// ── Stubs Tests ──

describe('stubs', () => {
  it('isSupported returns false for N/A commands', () => {
    expect(isSupported('setCacheMode')).toBe(false);
    expect(isSupported('mainWindowWidget')).toBe(false);
    expect(isSupported('watchFile')).toBe(false);
  });

  it('isSupported returns partial for partially supported commands', () => {
    expect(isSupported('getRendererType')).toBe('partial');
  });

  it('isSupported returns false for unknown commands', () => {
    expect(isSupported('totallyUnknownCommand')).toBe(false);
  });

  it('stub functions return sensible defaults', () => {
    expect(stereoSupported()).toBe(false);
    expect(getRendererType()).toBe('WebGL2');
    expect(cacheMode()).toBe(0);
    expect(sessionFileName()).toBe('');
  });

  it('stub functions log warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    stereoSupported();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('stereoSupported'),
    );

    warnSpy.mockRestore();
  });

  it('getStubFunctions returns all stubs as a record', () => {
    const stubs = getStubFunctions();
    expect(typeof stubs).toBe('object');
    expect(Object.keys(stubs).length).toBeGreaterThan(30);

    // All values should be functions
    for (const [, fn] of Object.entries(stubs)) {
      expect(typeof fn).toBe('function');
    }
  });

  it('all stub function names match expected N/A commands', () => {
    const stubs = getStubFunctions();
    const expectedNames = [
      'setAudioCacheMode',
      'audioCacheMode',
      'center',
      'close',
      'stereoSupported',
      'setCacheMode',
      'cacheMode',
      'mainWindowWidget',
      'eval',
      'watchFile',
      'toggleMenuBar',
      'spoofConnectionStream',
      'toggleMotionScope',
      'cacheUsage',
    ];

    for (const name of expectedNames) {
      expect(stubs).toHaveProperty(name);
    }
  });
});
