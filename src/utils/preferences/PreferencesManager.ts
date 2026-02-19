/**
 * PreferencesManager - Safe localStorage wrapper for app/user preferences.
 *
 * Centralizes storage keys and read/write behavior so individual modules can
 * focus on validation and domain logic.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PREFERENCE_STORAGE_KEYS = {
  autoSaveConfig: 'openrv-autosave-config',
  customKeyBindings: 'openrv-custom-keybindings',
  cursorAutoHide: 'openrv-cursor-autohide',
  displayProfile: 'openrv-display-profile',
  layout: 'openrv-layout',
  layoutCustomList: 'openrv-layout-custom-list',
  ocioPerSource: 'openrv-ocio-per-source',
  ocioState: 'openrv-ocio-state',
  themeMode: 'openrv-theme-mode',
} as const;

type StorageProvider = () => StorageLike | null | undefined;

function defaultStorageProvider(): StorageLike | null {
  try {
    if (typeof globalThis === 'undefined') return null;
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export class PreferencesManager {
  constructor(private readonly storageProvider: StorageProvider = defaultStorageProvider) {}

  getString(key: string): string | null {
    const storage = this.resolveStorage();
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  setString(key: string, value: string): boolean {
    const storage = this.resolveStorage();
    if (!storage) return false;
    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): boolean {
    const storage = this.resolveStorage();
    if (!storage) return false;
    try {
      storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  getBoolean(key: string): boolean | null {
    const value = this.getString(key);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  }

  setBoolean(key: string, value: boolean): boolean {
    return this.setString(key, String(value));
  }

  getJSON<T>(key: string): T | null {
    const raw = this.getString(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  setJSON<T>(key: string, value: T): boolean {
    try {
      return this.setString(key, JSON.stringify(value));
    } catch {
      return false;
    }
  }

  private resolveStorage(): StorageLike | null {
    try {
      return this.storageProvider() ?? null;
    } catch {
      return null;
    }
  }
}

let sharedPreferencesManager: PreferencesManager | null = null;

export function getPreferencesManager(): PreferencesManager {
  if (!sharedPreferencesManager) {
    sharedPreferencesManager = new PreferencesManager();
  }
  return sharedPreferencesManager;
}

/**
 * Test helper: reset singleton between tests that alter global localStorage.
 */
export function resetPreferencesManagerForTests(): void {
  sharedPreferencesManager = null;
}

