import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PreferencesManager,
  DEFAULT_COLOR_DEFAULTS,
  DEFAULT_EXPORT_DEFAULTS,
  DEFAULT_GENERAL_PREFS,
  CORE_PREFERENCE_STORAGE_KEYS,
  getCorePreferencesManager,
  resetCorePreferencesManagerForTests,
  type ColorDefaults,
  type PreferencesExportPayload,
} from './PreferencesManager';
import {
  PreferencesManager as StoragePreferencesManager,
  PREFERENCE_STORAGE_KEYS,
  type StorageLike,
} from '../utils/preferences/PreferencesManager';

function createStorage(seed?: Record<string, string>): StorageLike {
  const store: Record<string, string> = { ...(seed ?? {}) };
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
}

function createManager(seed?: Record<string, string>): {
  manager: PreferencesManager;
  storage: StorageLike;
  storageManager: StoragePreferencesManager;
} {
  const storage = createStorage(seed);
  const storageManager = new StoragePreferencesManager(() => storage);
  const manager = new PreferencesManager(storageManager);
  return { manager, storage, storageManager };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe('PreferencesManager defaults', () => {
  it('CPRF-001: getColorDefaults returns defaults when storage is empty', () => {
    const { manager } = createManager();
    expect(manager.getColorDefaults()).toEqual(DEFAULT_COLOR_DEFAULTS);
  });

  it('CPRF-002: getExportDefaults returns defaults when storage is empty', () => {
    const { manager } = createManager();
    expect(manager.getExportDefaults()).toEqual(DEFAULT_EXPORT_DEFAULTS);
  });

  it('CPRF-003: getGeneralPrefs returns defaults when storage is empty', () => {
    const { manager } = createManager();
    expect(manager.getGeneralPrefs()).toEqual(DEFAULT_GENERAL_PREFS);
  });

  it('CPRF-004: getThemeMode returns null when storage is empty', () => {
    const { manager } = createManager();
    expect(manager.getThemeMode()).toBeNull();
  });

  it('CPRF-005: default color values are sensible', () => {
    expect(DEFAULT_COLOR_DEFAULTS.defaultInputColorSpace).toBe('Auto');
    expect(DEFAULT_COLOR_DEFAULTS.defaultExposure).toBe(0);
    expect(DEFAULT_COLOR_DEFAULTS.defaultGamma).toBe(1);
    expect(DEFAULT_COLOR_DEFAULTS.defaultCDLPreset).toBeNull();
  });

  it('CPRF-006: default export values are sensible', () => {
    expect(DEFAULT_EXPORT_DEFAULTS.defaultFormat).toBe('png');
    expect(DEFAULT_EXPORT_DEFAULTS.defaultQuality).toBeGreaterThan(0);
    expect(DEFAULT_EXPORT_DEFAULTS.defaultQuality).toBeLessThanOrEqual(1);
    expect(DEFAULT_EXPORT_DEFAULTS.includeAnnotations).toBe(true);
    expect(DEFAULT_EXPORT_DEFAULTS.frameburnEnabled).toBe(false);
  });

  it('CPRF-007: default general prefs are sensible', () => {
    expect(DEFAULT_GENERAL_PREFS.userName).toBe('');
    expect(DEFAULT_GENERAL_PREFS.defaultFps).toBe(24);
    expect(DEFAULT_GENERAL_PREFS.autoPlayOnLoad).toBe(false);
    expect(DEFAULT_GENERAL_PREFS.showWelcome).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Persistence (round-trip)
// ---------------------------------------------------------------------------

describe('PreferencesManager persistence', () => {
  it('CPRF-010: setColorDefaults persists and round-trips', () => {
    const { manager } = createManager();
    const update: Partial<ColorDefaults> = { defaultExposure: 1.5, defaultGamma: 2.2 };
    manager.setColorDefaults(update);
    const result = manager.getColorDefaults();
    expect(result.defaultExposure).toBe(1.5);
    expect(result.defaultGamma).toBe(2.2);
    expect(result.defaultInputColorSpace).toBe('Auto');
  });

  it('CPRF-011: setExportDefaults persists and round-trips', () => {
    const { manager } = createManager();
    manager.setExportDefaults({ defaultFormat: 'jpeg', defaultQuality: 0.8 });
    const result = manager.getExportDefaults();
    expect(result.defaultFormat).toBe('jpeg');
    expect(result.defaultQuality).toBe(0.8);
    expect(result.includeAnnotations).toBe(true);
  });

  it('CPRF-012: setGeneralPrefs persists and round-trips', () => {
    const { manager } = createManager();
    manager.setGeneralPrefs({ userName: 'Alice', defaultFps: 30 });
    const result = manager.getGeneralPrefs();
    expect(result.userName).toBe('Alice');
    expect(result.defaultFps).toBe(30);
    expect(result.autoPlayOnLoad).toBe(false);
  });

  it('CPRF-013: setThemeMode persists and round-trips', () => {
    const { manager } = createManager();
    manager.setThemeMode('light');
    expect(manager.getThemeMode()).toBe('light');
  });

  it('CPRF-014: setThemeMode(null) removes stored value', () => {
    const { manager, storage } = createManager();
    manager.setThemeMode('dark');
    expect(manager.getThemeMode()).toBe('dark');
    manager.setThemeMode(null);
    expect(manager.getThemeMode()).toBeNull();
    expect(storage.getItem(PREFERENCE_STORAGE_KEYS.themeMode)).toBeNull();
  });

  it('CPRF-015: partial setColorDefaults merges with existing', () => {
    const { manager } = createManager();
    manager.setColorDefaults({ defaultExposure: 3 });
    manager.setColorDefaults({ defaultGamma: 4 });
    const result = manager.getColorDefaults();
    expect(result.defaultExposure).toBe(3);
    expect(result.defaultGamma).toBe(4);
  });

  it('CPRF-016: writes to correct storage keys', () => {
    const { manager, storage } = createManager();
    manager.setColorDefaults({ defaultExposure: 1 });
    expect(storage.getItem(CORE_PREFERENCE_STORAGE_KEYS.color)).not.toBeNull();

    manager.setExportDefaults({ defaultFormat: 'webp' });
    expect(storage.getItem(CORE_PREFERENCE_STORAGE_KEYS.export)).not.toBeNull();

    manager.setGeneralPrefs({ userName: 'Bob' });
    expect(storage.getItem(CORE_PREFERENCE_STORAGE_KEYS.general)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Validation / Sanitization
// ---------------------------------------------------------------------------

describe('PreferencesManager validation', () => {
  it('CPRF-020: clamps exposure to [-20, 20]', () => {
    const { manager } = createManager();
    manager.setColorDefaults({ defaultExposure: 100 });
    expect(manager.getColorDefaults().defaultExposure).toBe(20);

    manager.setColorDefaults({ defaultExposure: -100 });
    expect(manager.getColorDefaults().defaultExposure).toBe(-20);
  });

  it('CPRF-021: clamps gamma to [0.01, 8]', () => {
    const { manager } = createManager();
    manager.setColorDefaults({ defaultGamma: 0 });
    expect(manager.getColorDefaults().defaultGamma).toBe(0.01);

    manager.setColorDefaults({ defaultGamma: 100 });
    expect(manager.getColorDefaults().defaultGamma).toBe(8);
  });

  it('CPRF-022: clamps quality to [0, 1]', () => {
    const { manager } = createManager();
    manager.setExportDefaults({ defaultQuality: 2 });
    expect(manager.getExportDefaults().defaultQuality).toBe(1);

    manager.setExportDefaults({ defaultQuality: -1 });
    expect(manager.getExportDefaults().defaultQuality).toBe(0);
  });

  it('CPRF-023: clamps fps to [1, 240]', () => {
    const { manager } = createManager();
    manager.setGeneralPrefs({ defaultFps: 0 });
    expect(manager.getGeneralPrefs().defaultFps).toBe(1);

    manager.setGeneralPrefs({ defaultFps: 1000 });
    expect(manager.getGeneralPrefs().defaultFps).toBe(240);
  });

  it('CPRF-024: rejects invalid format values', () => {
    const { manager } = createManager();
    manager.setExportDefaults({ defaultFormat: 'bmp' as 'png' });
    expect(manager.getExportDefaults().defaultFormat).toBe('png');
  });

  it('CPRF-025: trims whitespace-only inputColorSpace to default', () => {
    const { manager } = createManager();
    manager.setColorDefaults({ defaultInputColorSpace: '   ' });
    expect(manager.getColorDefaults().defaultInputColorSpace).toBe('Auto');
  });

  it('CPRF-026: trims userName but allows empty string', () => {
    const { manager } = createManager();
    manager.setGeneralPrefs({ userName: '  Bob  ' });
    expect(manager.getGeneralPrefs().userName).toBe('Bob');
  });

  it('CPRF-027: handles corrupted JSON in storage gracefully', () => {
    const { manager } = createManager({
      [CORE_PREFERENCE_STORAGE_KEYS.color]: '{not-json',
    });
    expect(manager.getColorDefaults()).toEqual(DEFAULT_COLOR_DEFAULTS);
  });

  it('CPRF-028: handles non-object stored values gracefully', () => {
    const { manager } = createManager({
      [CORE_PREFERENCE_STORAGE_KEYS.color]: '"just a string"',
    });
    expect(manager.getColorDefaults()).toEqual(DEFAULT_COLOR_DEFAULTS);
  });

  it('CPRF-029: getThemeMode returns null for invalid stored value', () => {
    const { manager } = createManager({
      [PREFERENCE_STORAGE_KEYS.themeMode]: 'neon',
    });
    expect(manager.getThemeMode()).toBeNull();
  });

  it('CPRF-030: NaN/Infinity exposure falls back to default', () => {
    const { manager } = createManager();
    manager.setColorDefaults({ defaultExposure: NaN });
    expect(manager.getColorDefaults().defaultExposure).toBe(DEFAULT_COLOR_DEFAULTS.defaultExposure);

    manager.setColorDefaults({ defaultExposure: Infinity });
    expect(manager.getColorDefaults().defaultExposure).toBe(DEFAULT_COLOR_DEFAULTS.defaultExposure);
  });

  it('CPRF-031: CDL preset trims empty string to null', () => {
    const { manager } = createManager();
    manager.setColorDefaults({ defaultCDLPreset: '   ' });
    expect(manager.getColorDefaults().defaultCDLPreset).toBeNull();
  });

  it('CPRF-032: frameburnConfig accepts null', () => {
    const { manager } = createManager();
    manager.setExportDefaults({ frameburnConfig: null });
    expect(manager.getExportDefaults().frameburnConfig).toBeNull();
  });

  it('CPRF-033: frameburnConfig accepts object', () => {
    const { manager } = createManager();
    const config = { fontSize: 14, position: 'bottom' };
    manager.setExportDefaults({ frameburnConfig: config });
    expect(manager.getExportDefaults().frameburnConfig).toEqual(config);
  });
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

describe('PreferencesManager events', () => {
  it('CPRF-040: emits colorDefaultsChanged on setColorDefaults', () => {
    const { manager } = createManager();
    const cb = vi.fn();
    manager.on('colorDefaultsChanged', cb);
    manager.setColorDefaults({ defaultExposure: 2 });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].defaultExposure).toBe(2);
  });

  it('CPRF-041: emits exportDefaultsChanged on setExportDefaults', () => {
    const { manager } = createManager();
    const cb = vi.fn();
    manager.on('exportDefaultsChanged', cb);
    manager.setExportDefaults({ defaultFormat: 'webp' });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].defaultFormat).toBe('webp');
  });

  it('CPRF-042: emits generalPrefsChanged on setGeneralPrefs', () => {
    const { manager } = createManager();
    const cb = vi.fn();
    manager.on('generalPrefsChanged', cb);
    manager.setGeneralPrefs({ defaultFps: 60 });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].defaultFps).toBe(60);
  });

  it('CPRF-043: emits reset on resetAll', () => {
    const { manager } = createManager();
    const cb = vi.fn();
    manager.on('reset', cb);
    manager.resetAll();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('CPRF-044: emits imported on importAll', () => {
    const { manager } = createManager();
    const cb = vi.fn();
    manager.on('imported', cb);
    const payload: Partial<PreferencesExportPayload> = {
      version: 1,
      colorDefaults: { ...DEFAULT_COLOR_DEFAULTS, defaultExposure: 5 },
    };
    manager.importAll(JSON.stringify(payload));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('CPRF-045: unsubscribe works', () => {
    const { manager } = createManager();
    const cb = vi.fn();
    const unsub = manager.on('colorDefaultsChanged', cb);
    unsub();
    manager.setColorDefaults({ defaultExposure: 1 });
    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

describe('PreferencesManager export/import', () => {
  it('CPRF-050: exportAll returns valid JSON with version', () => {
    const { manager } = createManager();
    const json = manager.exportAll();
    const parsed = JSON.parse(json) as PreferencesExportPayload;
    expect(parsed.version).toBe(1);
  });

  it('CPRF-051: exportAll contains all expected keys', () => {
    const { manager } = createManager();
    const parsed = JSON.parse(manager.exportAll()) as PreferencesExportPayload;
    expect(parsed).toHaveProperty('themeMode');
    expect(parsed).toHaveProperty('cursorAutoHide');
    expect(parsed).toHaveProperty('layout');
    expect(parsed).toHaveProperty('layoutCustomList');
    expect(parsed).toHaveProperty('keyBindings');
    expect(parsed).toHaveProperty('ocioState');
    expect(parsed).toHaveProperty('ocioPerSource');
    expect(parsed).toHaveProperty('autoSaveConfig');
    expect(parsed).toHaveProperty('colorDefaults');
    expect(parsed).toHaveProperty('exportDefaults');
    expect(parsed).toHaveProperty('generalPrefs');
  });

  it('CPRF-052: export then import is a round-trip', () => {
    const { manager: m1 } = createManager();
    m1.setThemeMode('light');
    m1.setColorDefaults({ defaultExposure: 3, defaultGamma: 2.2 });
    m1.setExportDefaults({ defaultFormat: 'jpeg', defaultQuality: 0.75 });
    m1.setGeneralPrefs({ userName: 'Charlie', defaultFps: 48 });

    const json = m1.exportAll();

    const { manager: m2 } = createManager();
    m2.importAll(json);

    expect(m2.getThemeMode()).toBe('light');
    expect(m2.getColorDefaults().defaultExposure).toBe(3);
    expect(m2.getColorDefaults().defaultGamma).toBe(2.2);
    expect(m2.getExportDefaults().defaultFormat).toBe('jpeg');
    expect(m2.getExportDefaults().defaultQuality).toBe(0.75);
    expect(m2.getGeneralPrefs().userName).toBe('Charlie');
    expect(m2.getGeneralPrefs().defaultFps).toBe(48);
  });

  it('CPRF-053: importAll throws on invalid JSON', () => {
    const { manager } = createManager();
    expect(() => manager.importAll('not-json')).toThrow('Invalid preferences JSON payload');
  });

  it('CPRF-054: importAll throws on non-object payload', () => {
    const { manager } = createManager();
    expect(() => manager.importAll('"just a string"')).toThrow('Invalid preferences payload shape');
  });

  it('CPRF-055: importAll throws on array payload', () => {
    const { manager } = createManager();
    expect(() => manager.importAll('[1,2,3]')).toThrow('Invalid preferences payload shape');
  });

  it('CPRF-056: importAll with partial payload only updates specified keys', () => {
    const { manager } = createManager();
    manager.setColorDefaults({ defaultExposure: 5 });
    manager.importAll(JSON.stringify({ generalPrefs: { defaultFps: 120 } }));
    expect(manager.getColorDefaults().defaultExposure).toBe(5);
    expect(manager.getGeneralPrefs().defaultFps).toBe(120);
  });

  it('CPRF-057: importAll with null colorDefaults resets to default', () => {
    const { manager } = createManager();
    manager.setColorDefaults({ defaultExposure: 5 });
    manager.importAll(JSON.stringify({ colorDefaults: null }));
    expect(manager.getColorDefaults()).toEqual(DEFAULT_COLOR_DEFAULTS);
  });

  it('CPRF-058: importAll with null exportDefaults resets to default', () => {
    const { manager } = createManager();
    manager.setExportDefaults({ defaultFormat: 'jpeg' });
    manager.importAll(JSON.stringify({ exportDefaults: null }));
    expect(manager.getExportDefaults()).toEqual(DEFAULT_EXPORT_DEFAULTS);
  });

  it('CPRF-059: importAll with null generalPrefs resets to default', () => {
    const { manager } = createManager();
    manager.setGeneralPrefs({ userName: 'Eve' });
    manager.importAll(JSON.stringify({ generalPrefs: null }));
    expect(manager.getGeneralPrefs()).toEqual(DEFAULT_GENERAL_PREFS);
  });

  it('CPRF-060: importAll with null themeMode clears theme', () => {
    const { manager } = createManager();
    manager.setThemeMode('dark');
    manager.importAll(JSON.stringify({ themeMode: null }));
    expect(manager.getThemeMode()).toBeNull();
  });

  it('CPRF-061: importAll with invalid themeMode clears theme', () => {
    const { manager } = createManager();
    manager.setThemeMode('dark');
    manager.importAll(JSON.stringify({ themeMode: 'neon' }));
    expect(manager.getThemeMode()).toBeNull();
  });

  it('CPRF-062: importAll handles cursorAutoHide boolean', () => {
    const { manager, storage } = createManager();
    manager.importAll(JSON.stringify({ cursorAutoHide: true }));
    expect(storage.getItem(PREFERENCE_STORAGE_KEYS.cursorAutoHide)).toBe('true');
  });

  it('CPRF-063: importAll handles cursorAutoHide null (removes)', () => {
    const { manager, storage } = createManager({
      [PREFERENCE_STORAGE_KEYS.cursorAutoHide]: 'true',
    });
    manager.importAll(JSON.stringify({ cursorAutoHide: null }));
    expect(storage.getItem(PREFERENCE_STORAGE_KEYS.cursorAutoHide)).toBeNull();
  });

  it('CPRF-064: importAll forwards opaque subsystem keys (layout, keybindings, ocio, autosave)', () => {
    const { manager, storage } = createManager();
    const payload = {
      layout: { version: 1, panels: {} },
      layoutCustomList: ['custom-1'],
      keyBindings: { shortcuts: [] },
      ocioState: { config: 'path' },
      ocioPerSource: { src1: {} },
      autoSaveConfig: { interval: 30 },
    };
    manager.importAll(JSON.stringify(payload));

    expect(JSON.parse(storage.getItem(PREFERENCE_STORAGE_KEYS.layout)!)).toEqual(payload.layout);
    expect(JSON.parse(storage.getItem(PREFERENCE_STORAGE_KEYS.layoutCustomList)!)).toEqual(
      payload.layoutCustomList,
    );
    expect(JSON.parse(storage.getItem(PREFERENCE_STORAGE_KEYS.customKeyBindings)!)).toEqual(
      payload.keyBindings,
    );
    expect(JSON.parse(storage.getItem(PREFERENCE_STORAGE_KEYS.ocioState)!)).toEqual(
      payload.ocioState,
    );
    expect(JSON.parse(storage.getItem(PREFERENCE_STORAGE_KEYS.ocioPerSource)!)).toEqual(
      payload.ocioPerSource,
    );
    expect(JSON.parse(storage.getItem(PREFERENCE_STORAGE_KEYS.autoSaveConfig)!)).toEqual(
      payload.autoSaveConfig,
    );
  });

  it('CPRF-065: importAll with null opaque key removes it', () => {
    const { manager, storage } = createManager({
      [PREFERENCE_STORAGE_KEYS.layout]: '{"old": true}',
    });
    manager.importAll(JSON.stringify({ layout: null }));
    expect(storage.getItem(PREFERENCE_STORAGE_KEYS.layout)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

describe('PreferencesManager resetAll', () => {
  it('CPRF-070: resetAll clears all categories to defaults', () => {
    const { manager } = createManager();
    manager.setThemeMode('light');
    manager.setColorDefaults({ defaultExposure: 5 });
    manager.setExportDefaults({ defaultFormat: 'webp' });
    manager.setGeneralPrefs({ userName: 'Zara' });

    manager.resetAll();

    expect(manager.getThemeMode()).toBeNull();
    expect(manager.getColorDefaults()).toEqual(DEFAULT_COLOR_DEFAULTS);
    expect(manager.getExportDefaults()).toEqual(DEFAULT_EXPORT_DEFAULTS);
    expect(manager.getGeneralPrefs()).toEqual(DEFAULT_GENERAL_PREFS);
  });

  it('CPRF-071: resetAll removes storage entries for PREFERENCE_STORAGE_KEYS', () => {
    const { manager, storage } = createManager();
    manager.setThemeMode('dark');
    manager.resetAll();
    expect(storage.getItem(PREFERENCE_STORAGE_KEYS.themeMode)).toBeNull();
  });

  it('CPRF-072: resetAll removes storage entries for CORE_PREFERENCE_STORAGE_KEYS', () => {
    const { manager, storage } = createManager();
    manager.setColorDefaults({ defaultExposure: 1 });
    manager.resetAll();
    expect(storage.getItem(CORE_PREFERENCE_STORAGE_KEYS.color)).toBeNull();
    expect(storage.getItem(CORE_PREFERENCE_STORAGE_KEYS.export)).toBeNull();
    expect(storage.getItem(CORE_PREFERENCE_STORAGE_KEYS.general)).toBeNull();
  });

  it('CPRF-073: resetAll emits category change events', () => {
    const { manager } = createManager();
    const colorCb = vi.fn();
    const exportCb = vi.fn();
    const generalCb = vi.fn();
    const resetCb = vi.fn();

    manager.on('colorDefaultsChanged', colorCb);
    manager.on('exportDefaultsChanged', exportCb);
    manager.on('generalPrefsChanged', generalCb);
    manager.on('reset', resetCb);

    manager.resetAll();

    expect(colorCb).toHaveBeenCalledWith(DEFAULT_COLOR_DEFAULTS);
    expect(exportCb).toHaveBeenCalledWith(DEFAULT_EXPORT_DEFAULTS);
    expect(generalCb).toHaveBeenCalledWith(DEFAULT_GENERAL_PREFS);
    expect(resetCb).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Storage key constants
// ---------------------------------------------------------------------------

describe('PreferencesManager storage keys', () => {
  it('CPRF-080: CORE_PREFERENCE_STORAGE_KEYS use openrv-prefs- prefix', () => {
    for (const key of Object.values(CORE_PREFERENCE_STORAGE_KEYS)) {
      expect(key).toMatch(/^openrv-prefs-/);
    }
  });

  it('CPRF-081: CORE_PREFERENCE_STORAGE_KEYS do not collide with PREFERENCE_STORAGE_KEYS', () => {
    const existing = new Set(Object.values(PREFERENCE_STORAGE_KEYS));
    for (const key of Object.values(CORE_PREFERENCE_STORAGE_KEYS)) {
      expect(existing.has(key as (typeof PREFERENCE_STORAGE_KEYS)[keyof typeof PREFERENCE_STORAGE_KEYS])).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Facade getters (subsystem delegation)
// ---------------------------------------------------------------------------

describe('PreferencesManager facade getters', () => {
  it('CPRF-090: theme getter returns the wired ThemeManager', () => {
    const { manager } = createManager();
    const fakeTheme = { getMode: () => 'dark' } as any;
    manager.setSubsystems({ theme: fakeTheme });
    expect(manager.theme).toBe(fakeTheme);
  });

  it('CPRF-091: layout getter returns the wired LayoutStore', () => {
    const { manager } = createManager();
    const fakeLayout = { panels: {} } as any;
    manager.setSubsystems({ layout: fakeLayout });
    expect(manager.layout).toBe(fakeLayout);
  });

  it('CPRF-092: keyBindings getter returns the wired CustomKeyBindingsManager', () => {
    const { manager } = createManager();
    const fakeKB = { getCustomBindings: () => [] } as any;
    manager.setSubsystems({ keyBindings: fakeKB });
    expect(manager.keyBindings).toBe(fakeKB);
  });

  it('CPRF-093: ocio getter returns the wired OCIOStateManager', () => {
    const { manager } = createManager();
    const fakeOCIO = { getState: () => ({}) } as any;
    manager.setSubsystems({ ocio: fakeOCIO });
    expect(manager.ocio).toBe(fakeOCIO);
  });

  it('CPRF-094: theme getter throws when not wired', () => {
    const { manager } = createManager();
    expect(() => manager.theme).toThrow('theme subsystem not wired');
  });

  it('CPRF-095: layout getter throws when not wired', () => {
    const { manager } = createManager();
    expect(() => manager.layout).toThrow('layout subsystem not wired');
  });

  it('CPRF-096: keyBindings getter throws when not wired', () => {
    const { manager } = createManager();
    expect(() => manager.keyBindings).toThrow('keyBindings subsystem not wired');
  });

  it('CPRF-097: ocio getter throws when not wired', () => {
    const { manager } = createManager();
    expect(() => manager.ocio).toThrow('ocio subsystem not wired');
  });

  it('CPRF-098: setSubsystems allows partial wiring', () => {
    const { manager } = createManager();
    const fakeTheme = { getMode: () => 'auto' } as any;
    manager.setSubsystems({ theme: fakeTheme });
    expect(manager.theme).toBe(fakeTheme);
    expect(() => manager.layout).toThrow('layout subsystem not wired');
  });

  it('CPRF-099: setSubsystems can be called multiple times', () => {
    const { manager } = createManager();
    const theme1 = { id: 1 } as any;
    const theme2 = { id: 2 } as any;
    manager.setSubsystems({ theme: theme1 });
    expect(manager.theme).toBe(theme1);
    manager.setSubsystems({ theme: theme2 });
    expect(manager.theme).toBe(theme2);
  });
});

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

describe('getCorePreferencesManager singleton', () => {
  afterEach(() => {
    resetCorePreferencesManagerForTests();
  });

  it('CPRF-100: returns a PreferencesManager instance', () => {
    const instance = getCorePreferencesManager();
    expect(instance).toBeInstanceOf(PreferencesManager);
  });

  it('CPRF-101: returns the same instance on repeated calls', () => {
    const a = getCorePreferencesManager();
    const b = getCorePreferencesManager();
    expect(a).toBe(b);
  });

  it('CPRF-102: resetCorePreferencesManagerForTests creates a new instance', () => {
    const a = getCorePreferencesManager();
    resetCorePreferencesManagerForTests();
    const b = getCorePreferencesManager();
    expect(a).not.toBe(b);
  });
});
