import { describe, it, expect } from 'vitest';
import { PreferencesManager, PREFERENCE_STORAGE_KEYS } from './PreferencesManager';

function createStorage(seed?: Record<string, string>) {
  let store: Record<string, string> = { ...(seed ?? {}) };
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  };
}

describe('PreferencesManager', () => {
  it('PRF-001: reads/writes string values', () => {
    const storage = createStorage();
    const manager = new PreferencesManager(() => storage);
    expect(manager.setString(PREFERENCE_STORAGE_KEYS.themeMode, 'dark')).toBe(true);
    expect(manager.getString(PREFERENCE_STORAGE_KEYS.themeMode)).toBe('dark');
  });

  it('PRF-002: reads/writes booleans', () => {
    const storage = createStorage();
    const manager = new PreferencesManager(() => storage);
    expect(manager.setBoolean(PREFERENCE_STORAGE_KEYS.cursorAutoHide, true)).toBe(true);
    expect(manager.getBoolean(PREFERENCE_STORAGE_KEYS.cursorAutoHide)).toBe(true);
  });

  it('PRF-003: reads/writes JSON values', () => {
    const storage = createStorage();
    const manager = new PreferencesManager(() => storage);
    const value = { a: 1, b: 'x' };
    expect(manager.setJSON(PREFERENCE_STORAGE_KEYS.ocioState, value)).toBe(true);
    expect(manager.getJSON<typeof value>(PREFERENCE_STORAGE_KEYS.ocioState)).toEqual(value);
  });

  it('PRF-004: returns null for invalid JSON', () => {
    const storage = createStorage({ [PREFERENCE_STORAGE_KEYS.ocioState]: '{bad-json' });
    const manager = new PreferencesManager(() => storage);
    expect(manager.getJSON(PREFERENCE_STORAGE_KEYS.ocioState)).toBeNull();
  });

  it('PRF-005: handles missing storage gracefully', () => {
    const manager = new PreferencesManager(() => null);
    expect(manager.getString(PREFERENCE_STORAGE_KEYS.themeMode)).toBeNull();
    expect(manager.setString(PREFERENCE_STORAGE_KEYS.themeMode, 'dark')).toBe(false);
  });
});

