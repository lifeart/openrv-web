import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MuSettingsBridge } from '../MuSettingsBridge';

describe('MuSettingsBridge', () => {
  let bridge: MuSettingsBridge;

  beforeEach(() => {
    bridge = new MuSettingsBridge();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normal operation', () => {
    it('readSetting returns default when key does not exist', () => {
      expect(bridge.readSetting('ui', 'theme', 'dark')).toBe('dark');
    });

    it('writeSetting + readSetting round-trips a string value', () => {
      bridge.writeSetting('ui', 'theme', 'light');
      expect(bridge.readSetting('ui', 'theme', 'dark')).toBe('light');
    });

    it('writeSetting + readSetting round-trips a number value', () => {
      bridge.writeSetting('ui', 'fontSize', 14);
      expect(bridge.readSetting('ui', 'fontSize', 12)).toBe(14);
    });

    it('writeSetting + readSetting round-trips a boolean value', () => {
      bridge.writeSetting('ui', 'enabled', true);
      expect(bridge.readSetting('ui', 'enabled', false)).toBe(true);
    });

    it('writeSetting + readSetting round-trips an array value', () => {
      bridge.writeSetting('ui', 'sizes', [1, 2, 3]);
      expect(bridge.readSetting('ui', 'sizes', [])).toEqual([1, 2, 3]);
    });

    it('hasSetting returns false for non-existent key', () => {
      expect(bridge.hasSetting('ui', 'missing')).toBe(false);
    });

    it('hasSetting returns true for existing key', () => {
      bridge.writeSetting('ui', 'theme', 'dark');
      expect(bridge.hasSetting('ui', 'theme')).toBe(true);
    });

    it('removeSetting deletes an existing key', () => {
      bridge.writeSetting('ui', 'theme', 'dark');
      bridge.removeSetting('ui', 'theme');
      expect(bridge.hasSetting('ui', 'theme')).toBe(false);
    });

    it('removeSetting is a no-op for non-existent key', () => {
      expect(() => bridge.removeSetting('ui', 'missing')).not.toThrow();
    });

    it('listSettings returns keys within a group', () => {
      bridge.writeSetting('ui', 'theme', 'dark');
      bridge.writeSetting('ui', 'fontSize', 14);
      bridge.writeSetting('other', 'unrelated', true);

      const keys = bridge.listSettings('ui');
      expect(keys).toHaveLength(2);
      expect(keys).toContain('theme');
      expect(keys).toContain('fontSize');
    });

    it('listSettings returns empty array for empty group', () => {
      expect(bridge.listSettings('nonexistent')).toEqual([]);
    });

    it('clearGroup removes only keys in the specified group', () => {
      bridge.writeSetting('ui', 'theme', 'dark');
      bridge.writeSetting('ui', 'fontSize', 14);
      bridge.writeSetting('other', 'keep', true);

      bridge.clearGroup('ui');

      expect(bridge.hasSetting('ui', 'theme')).toBe(false);
      expect(bridge.hasSetting('ui', 'fontSize')).toBe(false);
      expect(bridge.hasSetting('other', 'keep')).toBe(true);
    });

    it('clearAll removes all openrv settings', () => {
      bridge.writeSetting('ui', 'theme', 'dark');
      bridge.writeSetting('other', 'value', 42);

      bridge.clearAll();

      expect(bridge.hasSetting('ui', 'theme')).toBe(false);
      expect(bridge.hasSetting('other', 'value')).toBe(false);
    });

    it('clearAll does not remove non-openrv keys', () => {
      localStorage.setItem('unrelated-key', 'keep-me');
      bridge.writeSetting('ui', 'theme', 'dark');

      bridge.clearAll();

      expect(localStorage.getItem('unrelated-key')).toBe('keep-me');
    });
  });

  describe('blocked-storage environments', () => {
    it('hasSetting returns false when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Storage is disabled');
      });

      expect(bridge.hasSetting('group', 'key')).toBe(false);
    });

    it('removeSetting does not throw when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('Storage is disabled');
      });

      expect(() => bridge.removeSetting('group', 'key')).not.toThrow();
    });

    it('listSettings returns empty array when localStorage throws', () => {
      const origDesc = Object.getOwnPropertyDescriptor(Storage.prototype, 'length')!;
      Object.defineProperty(Storage.prototype, 'length', {
        get() {
          throw new DOMException('Storage is disabled');
        },
        configurable: true,
      });

      try {
        expect(bridge.listSettings('group')).toEqual([]);
      } finally {
        Object.defineProperty(Storage.prototype, 'length', origDesc);
      }
    });

    it('clearGroup does not throw when localStorage throws', () => {
      const origDesc = Object.getOwnPropertyDescriptor(Storage.prototype, 'length')!;
      Object.defineProperty(Storage.prototype, 'length', {
        get() {
          throw new DOMException('Storage is disabled');
        },
        configurable: true,
      });

      try {
        expect(() => bridge.clearGroup('group')).not.toThrow();
      } finally {
        Object.defineProperty(Storage.prototype, 'length', origDesc);
      }
    });

    it('readSetting returns default value when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Storage is disabled');
      });

      expect(bridge.readSetting('group', 'key', 42)).toBe(42);
    });

    it('writeSetting does not throw when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Storage is disabled');
      });

      expect(() => bridge.writeSetting('group', 'key', 'value')).not.toThrow();
    });

    it('clearAll does not throw when localStorage throws', () => {
      const origDesc = Object.getOwnPropertyDescriptor(Storage.prototype, 'length')!;
      Object.defineProperty(Storage.prototype, 'length', {
        get() {
          throw new DOMException('Storage is disabled');
        },
        configurable: true,
      });

      try {
        expect(() => bridge.clearAll()).not.toThrow();
      } finally {
        Object.defineProperty(Storage.prototype, 'length', origDesc);
      }
    });
  });
});
