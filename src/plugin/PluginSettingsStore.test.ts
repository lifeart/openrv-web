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
      expect(() => store.setSetting('test.plugin', 'count', 'not-a-number')).toThrow('must be a number');
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
  });

  describe('unregisterSchema', () => {
    it('PSET-060: clears cache and listeners', () => {
      store.registerSchema('test.plugin', testSchema);
      store.setSetting('test.plugin', 'name', 'test');
      store.unregisterSchema('test.plugin');

      expect(store.getSetting('test.plugin', 'name')).toBeUndefined();
    });
  });
});
