import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginSettingsStore } from './PluginSettingsStore';
import type { PluginSettingsSchema } from './PluginSettingsStore';

const testSchema: PluginSettingsSchema = {
  settings: [
    { key: 'name', label: 'Name', type: 'string', default: 'default-name' },
    { key: 'count', label: 'Count', type: 'number', default: 10, min: 0, max: 100 },
    { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    {
      key: 'theme',
      label: 'Theme',
      type: 'select',
      default: 'dark',
      options: [
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' },
      ],
    },
    { key: 'opacity', label: 'Opacity', type: 'range', default: 0.8, min: 0, max: 1, step: 0.1 },
    { key: 'accent', label: 'Accent', type: 'color', default: '#ff0000' },
  ],
};

describe('PluginSettingsStore', () => {
  let store: PluginSettingsStore;

  beforeEach(() => {
    store = new PluginSettingsStore();
    // Clear any persisted data
    try {
      localStorage.removeItem('openrv-plugin-settings:test.plugin');
    } catch {
      // localStorage may not be available
    }
  });

  describe('registerSchema', () => {
    it('PSET-001: initializes settings with defaults', () => {
      store.registerSchema('test.plugin', testSchema);
      const settings = store.getSettings('test.plugin');
      expect(settings.name).toBe('default-name');
      expect(settings.count).toBe(10);
      expect(settings.enabled).toBe(true);
      expect(settings.theme).toBe('dark');
    });
  });

  describe('getSetting / setSetting', () => {
    it('PSET-010: get returns default value', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(store.getSetting('test.plugin', 'name')).toBe('default-name');
    });

    it('PSET-011: set updates value', () => {
      store.registerSchema('test.plugin', testSchema);
      store.setSetting('test.plugin', 'name', 'custom');
      expect(store.getSetting('test.plugin', 'name')).toBe('custom');
    });

    it('PSET-012: set validates string type', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(() => store.setSetting('test.plugin', 'name', 123)).toThrow('must be a string');
    });

    it('PSET-013: set validates number type', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(() => store.setSetting('test.plugin', 'count', 'not-a-number')).toThrow('must be a finite number');
    });

    it('PSET-014: set validates number range', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(() => store.setSetting('test.plugin', 'count', -1)).toThrow('>= 0');
      expect(() => store.setSetting('test.plugin', 'count', 101)).toThrow('<= 100');
    });

    it('PSET-015: set validates boolean type', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(() => store.setSetting('test.plugin', 'enabled', 'true')).toThrow('must be a boolean');
    });

    it('PSET-016: set validates select options', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(() => store.setSetting('test.plugin', 'theme', 'blue')).toThrow('defined options');
    });

    it('PSET-017: set throws for unknown key', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(() => store.setSetting('test.plugin', 'unknown', 'val')).toThrow('Unknown setting key');
    });

    it('PSET-018: set throws for unregistered plugin', () => {
      expect(() => store.setSetting('unknown.plugin', 'key', 'val')).toThrow('No settings schema');
    });
  });

  describe('resetSettings', () => {
    it('PSET-020: resets all settings to defaults', () => {
      store.registerSchema('test.plugin', testSchema);
      store.setSetting('test.plugin', 'name', 'modified');
      store.setSetting('test.plugin', 'count', 50);

      store.resetSettings('test.plugin');
      expect(store.getSetting('test.plugin', 'name')).toBe('default-name');
      expect(store.getSetting('test.plugin', 'count')).toBe(10);
    });
  });

  describe('onChange', () => {
    it('PSET-030: notifies on value change', () => {
      store.registerSchema('test.plugin', testSchema);
      const cb = vi.fn();
      store.onChange('test.plugin', 'count', cb);

      store.setSetting('test.plugin', 'count', 42);
      expect(cb).toHaveBeenCalledWith(42, 10);
    });

    it('PSET-031: does not notify when value unchanged', () => {
      store.registerSchema('test.plugin', testSchema);
      const cb = vi.fn();
      store.onChange('test.plugin', 'count', cb);

      store.setSetting('test.plugin', 'count', 10); // same as default
      expect(cb).not.toHaveBeenCalled();
    });

    it('PSET-032: unsubscribe stops notifications', () => {
      store.registerSchema('test.plugin', testSchema);
      const cb = vi.fn();
      const unsub = store.onChange('test.plugin', 'count', cb);

      unsub();
      store.setSetting('test.plugin', 'count', 99);
      expect(cb).not.toHaveBeenCalled();
    });

    it('PSET-033: notifies on reset', () => {
      store.registerSchema('test.plugin', testSchema);
      store.setSetting('test.plugin', 'count', 50);

      const cb = vi.fn();
      store.onChange('test.plugin', 'count', cb);
      store.resetSettings('test.plugin');

      expect(cb).toHaveBeenCalledWith(10, 50);
    });
  });

  describe('createAccessor', () => {
    it('PSET-040: accessor get/set works', () => {
      store.registerSchema('test.plugin', testSchema);
      const accessor = store.createAccessor('test.plugin');

      expect(accessor.get('name')).toBe('default-name');
      accessor.set('name', 'new-name');
      expect(accessor.get('name')).toBe('new-name');
    });

    it('PSET-041: accessor getAll returns all settings', () => {
      store.registerSchema('test.plugin', testSchema);
      const accessor = store.createAccessor('test.plugin');

      const all = accessor.getAll();
      expect(all.name).toBe('default-name');
      expect(all.count).toBe(10);
    });

    it('PSET-042: accessor reset restores defaults', () => {
      store.registerSchema('test.plugin', testSchema);
      const accessor = store.createAccessor('test.plugin');

      accessor.set('name', 'changed');
      accessor.reset();
      expect(accessor.get('name')).toBe('default-name');
    });

    it('PSET-043: accessor onChange works', () => {
      store.registerSchema('test.plugin', testSchema);
      const accessor = store.createAccessor('test.plugin');

      const cb = vi.fn();
      accessor.onChange('count', cb);
      accessor.set('count', 77);
      expect(cb).toHaveBeenCalledWith(77, 10);
    });
  });

  describe('export/import', () => {
    it('PSET-050: exports all settings', () => {
      store.registerSchema('test.plugin', testSchema);
      store.setSetting('test.plugin', 'name', 'exported');

      const exported = store.exportAll();
      expect(exported['test.plugin']?.name).toBe('exported');
    });

    it('PSET-051: imports settings for registered plugins', () => {
      store.registerSchema('test.plugin', testSchema);
      store.importAll({ 'test.plugin': { name: 'imported', count: 55 } });

      expect(store.getSetting('test.plugin', 'name')).toBe('imported');
      expect(store.getSetting('test.plugin', 'count')).toBe(55);
    });

    it('PSET-052: import ignores unregistered plugins', () => {
      store.importAll({ 'unknown.plugin': { key: 'val' } });
      // No error thrown
    });

    it('PSET-053: import validates values and falls back to defaults for invalid', () => {
      store.registerSchema('test.plugin', testSchema);
      store.importAll({ 'test.plugin': { name: 123, count: 'bad', enabled: true } });

      // Invalid values fall back to defaults
      expect(store.getSetting('test.plugin', 'name')).toBe('default-name');
      expect(store.getSetting('test.plugin', 'count')).toBe(10);
      // Valid value preserved
      expect(store.getSetting('test.plugin', 'enabled')).toBe(true);
    });

    it('PSET-054: import fires onChange notifications', () => {
      store.registerSchema('test.plugin', testSchema);
      const cb = vi.fn();
      store.onChange('test.plugin', 'name', cb);

      store.importAll({ 'test.plugin': { name: 'imported' } });
      expect(cb).toHaveBeenCalledWith('imported', 'default-name');
    });
  });

  describe('unregisterSchema', () => {
    it('PSET-060: clears cache and listeners', () => {
      store.registerSchema('test.plugin', testSchema);
      store.setSetting('test.plugin', 'name', 'test');
      store.unregisterSchema('test.plugin');

      expect(store.getSetting('test.plugin', 'name')).toBeUndefined();
    });
  });

  describe('range type validation', () => {
    it('PSET-070: rejects non-number for range', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(() => store.setSetting('test.plugin', 'opacity', 'high')).toThrow('must be a finite number');
    });

    it('PSET-071: validates range min/max', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(() => store.setSetting('test.plugin', 'opacity', -0.5)).toThrow('>= 0');
      expect(() => store.setSetting('test.plugin', 'opacity', 1.5)).toThrow('<= 1');
    });

    it('PSET-072: accepts valid range value', () => {
      store.registerSchema('test.plugin', testSchema);
      store.setSetting('test.plugin', 'opacity', 0.5);
      expect(store.getSetting('test.plugin', 'opacity')).toBe(0.5);
    });
  });

  describe('color type validation', () => {
    it('PSET-080: rejects non-string for color', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(() => store.setSetting('test.plugin', 'accent', 123)).toThrow('must be a string');
    });

    it('PSET-081: accepts valid color string', () => {
      store.registerSchema('test.plugin', testSchema);
      store.setSetting('test.plugin', 'accent', '#00ff00');
      expect(store.getSetting('test.plugin', 'accent')).toBe('#00ff00');
    });

    it('PSET-082: color type rejects invalid format', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(() => store.setSetting('test.plugin', 'accent', 'not-a-color')).toThrow('must be a valid hex color');
      expect(() => store.setSetting('test.plugin', 'accent', '#xyz')).toThrow('must be a valid hex color');
      expect(() => store.setSetting('test.plugin', 'accent', '')).toThrow('must be a valid hex color');
    });

    it('PSET-083: color accepts valid short hex (#fff)', () => {
      store.registerSchema('test.plugin', testSchema);
      store.setSetting('test.plugin', 'accent', '#fff');
      expect(store.getSetting('test.plugin', 'accent')).toBe('#fff');
    });
  });

  describe('number edge cases', () => {
    it('PSET-019: rejects NaN', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(() => store.setSetting('test.plugin', 'count', NaN)).toThrow('must be a finite number');
    });

    it('PSET-019b: rejects Infinity', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(() => store.setSetting('test.plugin', 'count', Infinity)).toThrow('must be a finite number');
    });

    it('PSET-019c: rejects -Infinity', () => {
      store.registerSchema('test.plugin', testSchema);
      expect(() => store.setSetting('test.plugin', 'count', -Infinity)).toThrow('must be a finite number');
    });
  });

  describe('getSettings edge cases', () => {
    it('PSET-120: getSetting returns undefined for unregistered plugin', () => {
      expect(store.getSetting('nonexistent', 'key')).toBeUndefined();
    });

    it('PSET-121: getSettings returns empty object for unregistered plugin', () => {
      expect(store.getSettings('nonexistent')).toEqual({});
    });

    it('PSET-130: getSettings returns a shallow copy', () => {
      store.registerSchema('test.plugin', testSchema);
      const settings1 = store.getSettings('test.plugin');
      settings1.name = 'mutated';
      const settings2 = store.getSettings('test.plugin');
      expect(settings2.name).toBe('default-name');
    });
  });

  describe('listener error isolation', () => {
    it('PSET-034: listener error does not break other listeners', () => {
      store.registerSchema('test.plugin', testSchema);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const cb1 = vi.fn(() => {
        throw new Error('listener error');
      });
      const cb2 = vi.fn();
      store.onChange('test.plugin', 'count', cb1);
      store.onChange('test.plugin', 'count', cb2);

      store.setSetting('test.plugin', 'count', 42);
      expect(cb2).toHaveBeenCalledWith(42, 10);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('multi-plugin isolation', () => {
    it('PSET-140: settings for different plugins are isolated', () => {
      const schema2: PluginSettingsSchema = {
        settings: [{ key: 'name', label: 'Name', type: 'string', default: 'other-default' }],
      };
      store.registerSchema('test.plugin', testSchema);
      store.registerSchema('other.plugin', schema2);

      store.setSetting('test.plugin', 'name', 'changed');
      expect(store.getSetting('other.plugin', 'name')).toBe('other-default');
    });
  });

  describe('string maxLength validation', () => {
    const maxLenSchema: PluginSettingsSchema = {
      settings: [{ key: 'short', label: 'Short', type: 'string', default: 'hi', maxLength: 5 }],
    };

    it('PSET-090: rejects string exceeding maxLength', () => {
      store.registerSchema('test.plugin', maxLenSchema);
      expect(() => store.setSetting('test.plugin', 'short', 'toolong')).toThrow('exceeds max length');
    });

    it('PSET-091: accepts string at exactly maxLength', () => {
      store.registerSchema('test.plugin', maxLenSchema);
      store.setSetting('test.plugin', 'short', 'abcde');
      expect(store.getSetting('test.plugin', 'short')).toBe('abcde');
    });
  });

  describe('persistence status', () => {
    it('PSET-150: setSetting returns true when persistence succeeds', () => {
      store.registerSchema('test.plugin', testSchema);
      const result = store.setSetting('test.plugin', 'name', 'persisted');
      expect(result).toBe(true);
      expect(store.getSetting('test.plugin', 'name')).toBe('persisted');
    });

    it('PSET-151: setSetting returns false when persistence fails', () => {
      store.registerSchema('test.plugin', testSchema);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Simulate localStorage failure
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const result = store.setSetting('test.plugin', 'name', 'fail-persist');
      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to persist'));

      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('PSET-152: in-memory cache updates even when persistence fails', () => {
      store.registerSchema('test.plugin', testSchema);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      store.setSetting('test.plugin', 'name', 'in-memory-only');
      // Value is available in memory for the current session
      expect(store.getSetting('test.plugin', 'name')).toBe('in-memory-only');

      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('PSET-153: accessor set returns true on successful persistence', () => {
      store.registerSchema('test.plugin', testSchema);
      const accessor = store.createAccessor('test.plugin');
      const result = accessor.set('name', 'accessor-persist');
      expect(result).toBe(true);
    });

    it('PSET-154: accessor set returns false on failed persistence', () => {
      store.registerSchema('test.plugin', testSchema);
      const accessor = store.createAccessor('test.plugin');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const result = accessor.set('name', 'fail');
      expect(result).toBe(false);
      expect(accessor.get('name')).toBe('fail'); // still updated in memory

      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe('re-register schema warning', () => {
    it('PSET-110: re-registering schema logs warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      store.registerSchema('test.plugin', testSchema);
      store.registerSchema('test.plugin', testSchema);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Settings schema re-registered'));
      warnSpy.mockRestore();
    });
  });

  describe('resetSettings edge cases', () => {
    it('PSET-022: resetSettings for unregistered plugin is a no-op', () => {
      expect(() => store.resetSettings('nonexistent.plugin')).not.toThrow();
    });
  });

  describe('createNoopAccessor', () => {
    it('PSET-160: noop accessor get() returns undefined', () => {
      const accessor = store.createNoopAccessor('no.schema.plugin');
      expect(accessor.get('anything')).toBeUndefined();
    });

    it('PSET-161: noop accessor getAll() returns empty object', () => {
      const accessor = store.createNoopAccessor('no.schema.plugin');
      expect(accessor.getAll()).toEqual({});
    });

    it('PSET-162: noop accessor set() warns instead of throwing', () => {
      const accessor = store.createNoopAccessor('no.schema.plugin');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = accessor.set('key', 'value');
      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('no settingsSchema'),
      );
      warnSpy.mockRestore();
    });

    it('PSET-163: noop accessor onChange() returns working unsubscribe', () => {
      const accessor = store.createNoopAccessor('no.schema.plugin');
      const unsub = accessor.onChange('key', vi.fn());
      expect(typeof unsub).toBe('function');
      expect(() => unsub()).not.toThrow();
    });

    it('PSET-164: noop accessor reset() is a no-op', () => {
      const accessor = store.createNoopAccessor('no.schema.plugin');
      expect(() => accessor.reset()).not.toThrow();
    });
  });

  describe('accessor unsubscribe', () => {
    it('PSET-044: accessor onChange returns working unsubscribe function', () => {
      store.registerSchema('test.plugin', testSchema);
      const accessor = store.createAccessor('test.plugin');

      const cb = vi.fn();
      const unsub = accessor.onChange('count', cb);

      accessor.set('count', 42);
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();
      accessor.set('count', 99);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});
