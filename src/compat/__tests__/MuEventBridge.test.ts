/**
 * Tests for MuEventBridge and ModeManager — Mu event system compatibility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    bridge.bind('mode', 'table', 'test-event', handler, 'test docs');

    bridge.sendInternalEvent('test-event', 'payload', 'sender');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]![0].contents).toBe('payload');
    expect(handler.mock.calls[0]![0].sender).toBe('sender');
  });

  it('unbind removes handler', () => {
    const handler = vi.fn();
    bridge.bind('mode', 'table', 'ev', handler);
    bridge.unbind('mode', 'table', 'ev');

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
    bridge.bind('mode', 'table', 'ev1', vi.fn(), 'Doc A');
    bridge.bind('mode', 'table', 'ev2', vi.fn(), 'Doc B');

    const bindings = bridge.bindings();
    expect(bindings.length).toBeGreaterThanOrEqual(2);
  });

  it('bindingDocumentation', () => {
    bridge.bind('mode', 'table', 'ev', vi.fn(), 'My docs');
    expect(bridge.bindingDocumentation('table', 'ev')).toBe('My docs');
  });

  it('sendInternalEvent creates and dispatches MuEvent', () => {
    const handler = vi.fn();
    bridge.bind('mode', 'table', 'custom', handler);

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
});

describe('MuEventBridge regex binding', () => {
  let bridge: MuEventBridge;

  beforeEach(() => {
    bridge = new MuEventBridge();
  });

  it('bindRegex registers and dispatches matching events', () => {
    const handler = vi.fn();
    bridge.bindRegex('mode', 'table', /key-down--.*/, handler, 'regex doc');

    bridge.sendInternalEvent('key-down--a');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('bindRegex does not fire for non-matching events', () => {
    const handler = vi.fn();
    bridge.bindRegex('mode', 'table', /key-down--.*/, handler);

    bridge.sendInternalEvent('pointer--move');
    expect(handler).not.toHaveBeenCalled();
  });

  it('unbindRegex removes the binding and it stops firing', () => {
    const handler = vi.fn();
    const pattern = /key-down--.*/;
    bridge.bindRegex('mode', 'table', pattern, handler);

    bridge.sendInternalEvent('key-down--a');
    expect(handler).toHaveBeenCalledOnce();

    bridge.unbindRegex('mode', 'table', pattern);

    bridge.sendInternalEvent('key-down--b');
    expect(handler).toHaveBeenCalledOnce(); // not called again
  });

  it('exact bind takes priority over bindRegex at same table', () => {
    const exactHandler = vi.fn();
    const regexHandler = vi.fn();

    bridge.bind('mode', 'table', 'key-down--a', exactHandler, 'exact');
    bridge.bindRegex('mode', 'table', /key-down--.*/, regexHandler, 'regex');

    bridge.sendInternalEvent('key-down--a');

    expect(exactHandler).toHaveBeenCalledOnce();
    expect(regexHandler).not.toHaveBeenCalled();
  });

  it('regex with flags works correctly', () => {
    const handler = vi.fn();
    bridge.bindRegex('mode', 'table', /KEY-DOWN--a/i, handler, 'case insensitive');

    bridge.sendInternalEvent('key-down--a');
    expect(handler).toHaveBeenCalledOnce();
  });
});

// ── MuSettingsBridge Tests ──

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
