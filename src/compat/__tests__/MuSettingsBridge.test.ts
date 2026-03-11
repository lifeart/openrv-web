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
