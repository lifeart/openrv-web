import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PreferencesManager,
  DEFAULT_COLOR_DEFAULTS,
  DEFAULT_EXPORT_DEFAULTS,
  DEFAULT_GENERAL_PREFS,
  DEFAULT_FPS_INDICATOR_PREFS,
  CORE_PREFERENCE_STORAGE_KEYS,
  getCorePreferencesManager,
  resetCorePreferencesManagerForTests,
  type ColorDefaults,
  type FPSIndicatorPrefs,
  type PluginSettingsProvider,
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
    expect(cb.mock.calls[0]![0].defaultExposure).toBe(2);
  });

  it('CPRF-041: emits exportDefaultsChanged on setExportDefaults', () => {
    const { manager } = createManager();
    const cb = vi.fn();
    manager.on('exportDefaultsChanged', cb);
    manager.setExportDefaults({ defaultFormat: 'webp' });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0].defaultFormat).toBe('webp');
  });

  it('CPRF-042: emits generalPrefsChanged on setGeneralPrefs', () => {
    const { manager } = createManager();
    const cb = vi.fn();
    manager.on('generalPrefsChanged', cb);
    manager.setGeneralPrefs({ defaultFps: 60 });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0].defaultFps).toBe(60);
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
    expect(parsed).toHaveProperty('fpsIndicatorPrefs');
    expect(parsed).toHaveProperty('displayProfile');
    expect(parsed).toHaveProperty('timelineDisplayMode');
    expect(parsed).toHaveProperty('missingFrameMode');
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
    expect(JSON.parse(storage.getItem(PREFERENCE_STORAGE_KEYS.layoutCustomList)!)).toEqual(payload.layoutCustomList);
    expect(JSON.parse(storage.getItem(PREFERENCE_STORAGE_KEYS.customKeyBindings)!)).toEqual(payload.keyBindings);
    expect(JSON.parse(storage.getItem(PREFERENCE_STORAGE_KEYS.ocioState)!)).toEqual(payload.ocioState);
    expect(JSON.parse(storage.getItem(PREFERENCE_STORAGE_KEYS.ocioPerSource)!)).toEqual(payload.ocioPerSource);
    expect(JSON.parse(storage.getItem(PREFERENCE_STORAGE_KEYS.autoSaveConfig)!)).toEqual(payload.autoSaveConfig);
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

// =================================================================
// FPS Indicator Preferences
// =================================================================

describe('FPS Indicator Preferences', () => {
  afterEach(() => {
    resetCorePreferencesManagerForTests();
  });

  it('CPRF-FPS-001: returns defaults when no data is stored', () => {
    const { manager } = createManager();
    const prefs = manager.getFPSIndicatorPrefs();
    expect(prefs).toEqual(DEFAULT_FPS_INDICATOR_PREFS);
  });

  it('CPRF-FPS-002: persists and retrieves FPS indicator prefs', () => {
    const { manager } = createManager();
    manager.setFPSIndicatorPrefs({ enabled: false, position: 'bottom-left' });
    const prefs = manager.getFPSIndicatorPrefs();
    expect(prefs.enabled).toBe(false);
    expect(prefs.position).toBe('bottom-left');
    // Other fields should remain at default
    expect(prefs.showDroppedFrames).toBe(true);
    expect(prefs.backgroundOpacity).toBe(0.6);
  });

  it('CPRF-FPS-003: emits fpsIndicatorPrefsChanged on set', () => {
    const { manager } = createManager();
    const handler = vi.fn();
    manager.on('fpsIndicatorPrefsChanged', handler);
    manager.setFPSIndicatorPrefs({ warningThreshold: 0.9 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ warningThreshold: 0.9 }));
  });

  it('CPRF-FPS-004: clamps backgroundOpacity to 0-1', () => {
    const { manager } = createManager();
    manager.setFPSIndicatorPrefs({ backgroundOpacity: 1.5 });
    expect(manager.getFPSIndicatorPrefs().backgroundOpacity).toBe(1);
    manager.setFPSIndicatorPrefs({ backgroundOpacity: -0.5 });
    expect(manager.getFPSIndicatorPrefs().backgroundOpacity).toBe(0);
  });

  it('CPRF-FPS-005: clamps warningThreshold to 0-1', () => {
    const { manager } = createManager();
    manager.setFPSIndicatorPrefs({ warningThreshold: 2 });
    expect(manager.getFPSIndicatorPrefs().warningThreshold).toBe(1);
    // Setting warningThreshold below criticalThreshold triggers swap
    manager.setFPSIndicatorPrefs({ warningThreshold: -1, criticalThreshold: 0 });
    expect(manager.getFPSIndicatorPrefs().warningThreshold).toBe(0);
    expect(manager.getFPSIndicatorPrefs().criticalThreshold).toBe(0);
  });

  it('CPRF-FPS-006: clamps criticalThreshold to 0-1', () => {
    const { manager } = createManager();
    // Setting criticalThreshold above warningThreshold triggers swap
    manager.setFPSIndicatorPrefs({ criticalThreshold: 1.5, warningThreshold: 1 });
    expect(manager.getFPSIndicatorPrefs().criticalThreshold).toBe(1);
    expect(manager.getFPSIndicatorPrefs().warningThreshold).toBe(1);
    manager.setFPSIndicatorPrefs({ criticalThreshold: -2, warningThreshold: 0 });
    expect(manager.getFPSIndicatorPrefs().criticalThreshold).toBe(0);
    expect(manager.getFPSIndicatorPrefs().warningThreshold).toBe(0);
  });

  it('CPRF-FPS-007: invalid position values are sanitized to default', () => {
    const { manager, storage } = createManager();
    // Store invalid data directly
    storage.setItem(CORE_PREFERENCE_STORAGE_KEYS.fpsIndicator, JSON.stringify({ position: 'invalid-position' }));
    const prefs = manager.getFPSIndicatorPrefs();
    expect(prefs.position).toBe('top-right'); // default
  });

  it('CPRF-FPS-008: partial set merges with existing prefs', () => {
    const { manager } = createManager();
    manager.setFPSIndicatorPrefs({ enabled: false });
    manager.setFPSIndicatorPrefs({ position: 'bottom-right' });
    const prefs = manager.getFPSIndicatorPrefs();
    expect(prefs.enabled).toBe(false);
    expect(prefs.position).toBe('bottom-right');
  });

  it('CPRF-FPS-009: all valid positions are accepted', () => {
    const { manager } = createManager();
    const positions: FPSIndicatorPrefs['position'][] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    for (const pos of positions) {
      manager.setFPSIndicatorPrefs({ position: pos });
      expect(manager.getFPSIndicatorPrefs().position).toBe(pos);
    }
  });

  it('CPRF-FPS-010: corrupt JSON returns defaults', () => {
    const { manager, storage } = createManager();
    storage.setItem(CORE_PREFERENCE_STORAGE_KEYS.fpsIndicator, 'not-valid-json{{{');
    const prefs = manager.getFPSIndicatorPrefs();
    expect(prefs).toEqual(DEFAULT_FPS_INDICATOR_PREFS);
  });

  it('CPRF-FPS-011: buildExportPayload includes fpsIndicatorPrefs', () => {
    const { manager } = createManager();
    manager.setFPSIndicatorPrefs({ enabled: false, position: 'bottom-left' });
    const parsed = JSON.parse(manager.exportAll()) as PreferencesExportPayload;
    expect(parsed.fpsIndicatorPrefs).toBeDefined();
    expect(parsed.fpsIndicatorPrefs.enabled).toBe(false);
    expect(parsed.fpsIndicatorPrefs.position).toBe('bottom-left');
  });

  it('CPRF-FPS-012: importAll restores fpsIndicatorPrefs', () => {
    const { manager } = createManager();
    const payload = {
      fpsIndicatorPrefs: { enabled: false, position: 'bottom-right', backgroundOpacity: 0.3 },
    };
    manager.importAll(JSON.stringify(payload));
    const prefs = manager.getFPSIndicatorPrefs();
    expect(prefs.enabled).toBe(false);
    expect(prefs.position).toBe('bottom-right');
    expect(prefs.backgroundOpacity).toBe(0.3);
  });

  it('CPRF-FPS-013: importAll with null fpsIndicatorPrefs resets to default', () => {
    const { manager } = createManager();
    manager.setFPSIndicatorPrefs({ enabled: false, position: 'bottom-left' });
    manager.importAll(JSON.stringify({ fpsIndicatorPrefs: null }));
    expect(manager.getFPSIndicatorPrefs()).toEqual(DEFAULT_FPS_INDICATOR_PREFS);
  });

  it('CPRF-FPS-014: resetAll emits fpsIndicatorPrefsChanged with defaults', () => {
    const { manager } = createManager();
    manager.setFPSIndicatorPrefs({ enabled: false, position: 'bottom-left' });
    const handler = vi.fn();
    manager.on('fpsIndicatorPrefsChanged', handler);
    manager.resetAll();
    expect(handler).toHaveBeenCalledWith(DEFAULT_FPS_INDICATOR_PREFS);
  });

  it('CPRF-FPS-015: export then import round-trips FPS indicator settings', () => {
    const { manager: m1 } = createManager();
    m1.setFPSIndicatorPrefs({
      enabled: false,
      position: 'bottom-left',
      showDroppedFrames: false,
      showTargetFps: false,
      backgroundOpacity: 0.4,
      warningThreshold: 0.9,
      criticalThreshold: 0.7,
    });

    const json = m1.exportAll();

    const { manager: m2 } = createManager();
    m2.importAll(json);

    const prefs = m2.getFPSIndicatorPrefs();
    expect(prefs.enabled).toBe(false);
    expect(prefs.position).toBe('bottom-left');
    expect(prefs.showDroppedFrames).toBe(false);
    expect(prefs.showTargetFps).toBe(false);
    expect(prefs.backgroundOpacity).toBe(0.4);
    expect(prefs.warningThreshold).toBe(0.9);
    expect(prefs.criticalThreshold).toBe(0.7);
  });
});

// ---------------------------------------------------------------------------
// Issue #152 — storage-only advisory & regression
// ---------------------------------------------------------------------------

describe('Issue #152: preferences wiring', () => {
  afterEach(() => {
    resetCorePreferencesManagerForTests();
    vi.restoreAllMocks();
  });

  it('CPRF-152-003: colorDefaults get/set/export/import remain functional', () => {
    const { manager } = createManager();
    manager.setColorDefaults({ defaultExposure: 7, defaultGamma: 1.8 });
    expect(manager.getColorDefaults().defaultExposure).toBe(7);
    expect(manager.getColorDefaults().defaultGamma).toBe(1.8);

    const json = manager.exportAll();
    const parsed = JSON.parse(json) as PreferencesExportPayload;
    expect(parsed.colorDefaults.defaultExposure).toBe(7);

    const { manager: m2 } = createManager();
    m2.importAll(json);
    expect(m2.getColorDefaults().defaultExposure).toBe(7);
  });

  it('CPRF-152-004: exportDefaults get/set/export/import remain functional', () => {
    const { manager } = createManager();
    manager.setExportDefaults({ defaultFormat: 'webp', frameburnEnabled: true });
    expect(manager.getExportDefaults().defaultFormat).toBe('webp');
    expect(manager.getExportDefaults().frameburnEnabled).toBe(true);

    const json = manager.exportAll();
    const parsed = JSON.parse(json) as PreferencesExportPayload;
    expect(parsed.exportDefaults.defaultFormat).toBe('webp');

    const { manager: m2 } = createManager();
    m2.importAll(json);
    expect(m2.getExportDefaults().defaultFormat).toBe('webp');
    expect(m2.getExportDefaults().frameburnEnabled).toBe(true);
  });

  it('CPRF-152-005: generalPrefs fields get/set/export/import remain functional', () => {
    const { manager } = createManager();
    manager.setGeneralPrefs({ autoPlayOnLoad: true, showWelcome: false, defaultFps: 60 });
    const prefs = manager.getGeneralPrefs();
    expect(prefs.autoPlayOnLoad).toBe(true);
    expect(prefs.showWelcome).toBe(false);
    expect(prefs.defaultFps).toBe(60);

    const json = manager.exportAll();
    const parsed = JSON.parse(json) as PreferencesExportPayload;
    expect(parsed.generalPrefs.autoPlayOnLoad).toBe(true);
    expect(parsed.generalPrefs.showWelcome).toBe(false);
    expect(parsed.generalPrefs.defaultFps).toBe(60);

    const { manager: m2 } = createManager();
    m2.importAll(json);
    expect(m2.getGeneralPrefs().autoPlayOnLoad).toBe(true);
    expect(m2.getGeneralPrefs().showWelcome).toBe(false);
    expect(m2.getGeneralPrefs().defaultFps).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Issue #159 — Plugin settings in backup flow
// ---------------------------------------------------------------------------

function createMockPluginSettingsProvider(
  data: Record<string, Record<string, unknown>> = {},
): PluginSettingsProvider & { _data: Record<string, Record<string, unknown>>; importAllCalls: number; clearAllCalls: number } {
  return {
    _data: { ...data },
    importAllCalls: 0,
    clearAllCalls: 0,
    exportAll() {
      return { ...this._data };
    },
    importAll(incoming: Record<string, Record<string, unknown>>) {
      this.importAllCalls++;
      this._data = { ...incoming };
    },
    clearAll() {
      this.clearAllCalls++;
      this._data = {};
    },
  };
}

describe('Issue #159: plugin settings in preferences backup flow', () => {
  afterEach(() => {
    resetCorePreferencesManagerForTests();
  });

  it('CPRF-159-001: exportAll includes pluginSettings when provider is set', () => {
    const { manager } = createManager();
    const provider = createMockPluginSettingsProvider({
      'my-plugin': { theme: 'dark', fontSize: 14 },
    });
    manager.setPluginSettingsProvider(provider);

    const parsed = JSON.parse(manager.exportAll()) as PreferencesExportPayload;
    expect(parsed.pluginSettings).toEqual({
      'my-plugin': { theme: 'dark', fontSize: 14 },
    });
  });

  it('CPRF-159-002: exportAll omits pluginSettings when provider is not set', () => {
    const { manager } = createManager();
    const parsed = JSON.parse(manager.exportAll()) as PreferencesExportPayload;
    expect(parsed.pluginSettings).toBeUndefined();
  });

  it('CPRF-159-003: importAll restores plugin settings via provider', () => {
    const { manager } = createManager();
    const provider = createMockPluginSettingsProvider();
    manager.setPluginSettingsProvider(provider);

    const payload = {
      pluginSettings: { 'my-plugin': { color: '#ff0000' } },
    };
    manager.importAll(JSON.stringify(payload));

    expect(provider.importAllCalls).toBe(1);
    expect(provider._data).toEqual({ 'my-plugin': { color: '#ff0000' } });
  });

  it('CPRF-159-004: importAll with no provider does not crash when pluginSettings present', () => {
    const { manager } = createManager();
    // No provider set — should not throw
    const payload = {
      pluginSettings: { 'my-plugin': { color: '#ff0000' } },
    };
    expect(() => manager.importAll(JSON.stringify(payload))).not.toThrow();
  });

  it('CPRF-159-005: importAll ignores pluginSettings when value is not an object', () => {
    const { manager } = createManager();
    const provider = createMockPluginSettingsProvider({ existing: { key: 'val' } });
    manager.setPluginSettingsProvider(provider);

    manager.importAll(JSON.stringify({ pluginSettings: 'invalid' }));
    expect(provider.importAllCalls).toBe(0);
    expect(provider._data).toEqual({ existing: { key: 'val' } });
  });

  it('CPRF-159-006: resetAll clears plugin settings via provider', () => {
    const { manager } = createManager();
    const provider = createMockPluginSettingsProvider({
      'my-plugin': { theme: 'dark' },
    });
    manager.setPluginSettingsProvider(provider);

    manager.resetAll();

    expect(provider.clearAllCalls).toBe(1);
    expect(provider._data).toEqual({});
  });

  it('CPRF-159-007: resetAll does not crash when provider is not set', () => {
    const { manager } = createManager();
    expect(() => manager.resetAll()).not.toThrow();
  });

  it('CPRF-159-008: setPluginSettingsProvider(null) removes provider', () => {
    const { manager } = createManager();
    const provider = createMockPluginSettingsProvider({
      'my-plugin': { theme: 'dark' },
    });
    manager.setPluginSettingsProvider(provider);
    manager.setPluginSettingsProvider(null);

    const parsed = JSON.parse(manager.exportAll()) as PreferencesExportPayload;
    expect(parsed.pluginSettings).toBeUndefined();
  });

  it('CPRF-159-009: export then import round-trips plugin settings', () => {
    const pluginData = {
      'plugin-a': { enabled: true, color: '#00ff00' },
      'plugin-b': { volume: 0.8 },
    };

    const { manager: m1 } = createManager();
    const provider1 = createMockPluginSettingsProvider(pluginData);
    m1.setPluginSettingsProvider(provider1);

    const json = m1.exportAll();

    const { manager: m2 } = createManager();
    const provider2 = createMockPluginSettingsProvider();
    m2.setPluginSettingsProvider(provider2);
    m2.importAll(json);

    expect(provider2._data).toEqual(pluginData);
  });

  it('CPRF-159-010: imported event payload includes pluginSettings', () => {
    const { manager } = createManager();
    const provider = createMockPluginSettingsProvider({
      'my-plugin': { key: 'value' },
    });
    manager.setPluginSettingsProvider(provider);

    const cb = vi.fn();
    manager.on('imported', cb);

    manager.importAll(JSON.stringify({ pluginSettings: { 'other-plugin': { x: 1 } } }));

    expect(cb).toHaveBeenCalledTimes(1);
    const emittedPayload = cb.mock.calls[0]![0] as PreferencesExportPayload;
    // After import, the provider now has the imported data, so buildExportPayload reflects it
    expect(emittedPayload.pluginSettings).toEqual({ 'other-plugin': { x: 1 } });
  });
});

// ---------------------------------------------------------------------------
// Filter mode in export/import/reset (#165)
// ---------------------------------------------------------------------------

describe('PreferencesManager filterMode (#165)', () => {
  it('CPRF-165-001: exportAll includes filterMode when set', () => {
    const { manager } = createManager();
    manager.setFilterMode('nearest');
    const parsed = JSON.parse(manager.exportAll()) as PreferencesExportPayload;
    expect(parsed.filterMode).toBe('nearest');
  });

  it('CPRF-165-002: exportAll includes filterMode as null when not set', () => {
    const { manager } = createManager();
    const parsed = JSON.parse(manager.exportAll()) as PreferencesExportPayload;
    expect(parsed.filterMode).toBeNull();
  });

  it('CPRF-165-003: importAll restores filterMode nearest', () => {
    const { manager } = createManager();
    manager.importAll(JSON.stringify({ filterMode: 'nearest' }));
    expect(manager.getFilterMode()).toBe('nearest');
  });

  it('CPRF-165-004: importAll restores filterMode linear', () => {
    const { manager } = createManager();
    manager.setFilterMode('nearest');
    manager.importAll(JSON.stringify({ filterMode: 'linear' }));
    expect(manager.getFilterMode()).toBe('linear');
  });

  it('CPRF-165-005: importAll with null filterMode clears it', () => {
    const { manager } = createManager();
    manager.setFilterMode('nearest');
    manager.importAll(JSON.stringify({ filterMode: null }));
    expect(manager.getFilterMode()).toBeNull();
  });

  it('CPRF-165-006: importAll with invalid filterMode clears it', () => {
    const { manager } = createManager();
    manager.setFilterMode('nearest');
    manager.importAll(JSON.stringify({ filterMode: 'invalid-value' }));
    expect(manager.getFilterMode()).toBeNull();
  });

  it('CPRF-165-007: importAll without filterMode key does not change existing value', () => {
    const { manager } = createManager();
    manager.setFilterMode('nearest');
    manager.importAll(JSON.stringify({ generalPrefs: { defaultFps: 30 } }));
    expect(manager.getFilterMode()).toBe('nearest');
  });

  it('CPRF-165-008: resetAll clears filterMode', () => {
    const { manager } = createManager();
    manager.setFilterMode('nearest');
    manager.resetAll();
    expect(manager.getFilterMode()).toBeNull();
  });

  it('CPRF-165-009: full round-trip export/import preserves filterMode', () => {
    const { manager: m1 } = createManager();
    m1.setFilterMode('nearest');
    const json = m1.exportAll();

    const { manager: m2 } = createManager();
    m2.importAll(json);
    expect(m2.getFilterMode()).toBe('nearest');
  });

  it('CPRF-165-010: getFilterMode returns null for unknown stored value', () => {
    const { manager, storage } = createManager();
    storage.setItem!('openrv-prefs-filter-mode', 'bicubic');
    expect(manager.getFilterMode()).toBeNull();
  });

  it('CPRF-165-011: setFilterMode(null) removes the key', () => {
    const { manager, storage } = createManager();
    manager.setFilterMode('nearest');
    expect(storage.getItem!('openrv-prefs-filter-mode')).toBe('nearest');
    manager.setFilterMode(null);
    expect(storage.getItem!('openrv-prefs-filter-mode')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #166: Display profile in unified preferences
// ---------------------------------------------------------------------------

describe('PreferencesManager displayProfile (#166)', () => {
  it('CPRF-166-001: getDisplayProfile returns null when storage is empty', () => {
    const { manager } = createManager();
    expect(manager.getDisplayProfile()).toBeNull();
  });

  it('CPRF-166-002: setDisplayProfile persists valid state', () => {
    const { manager } = createManager();
    const profile = {
      transferFunction: 'rec709' as const,
      displayGamma: 1.2,
      displayBrightness: 0.8,
      customGamma: 2.4,
    };
    manager.setDisplayProfile(profile);
    expect(manager.getDisplayProfile()).toEqual(profile);
  });

  it('CPRF-166-003: setDisplayProfile(null) clears the profile', () => {
    const { manager } = createManager();
    manager.setDisplayProfile({
      transferFunction: 'srgb',
      displayGamma: 1.0,
      displayBrightness: 1.0,
      customGamma: 2.2,
    });
    manager.setDisplayProfile(null);
    expect(manager.getDisplayProfile()).toBeNull();
  });

  it('CPRF-166-004: exportAll includes displayProfile', () => {
    const { manager } = createManager();
    const profile = {
      transferFunction: 'gamma2.2' as const,
      displayGamma: 1.0,
      displayBrightness: 1.0,
      customGamma: 2.2,
    };
    manager.setDisplayProfile(profile);
    const parsed = JSON.parse(manager.exportAll()) as PreferencesExportPayload;
    expect(parsed.displayProfile).toEqual(profile);
  });

  it('CPRF-166-005: exportAll includes displayProfile as null when not set', () => {
    const { manager } = createManager();
    const parsed = JSON.parse(manager.exportAll()) as PreferencesExportPayload;
    expect(parsed.displayProfile).toBeNull();
  });

  it('CPRF-166-006: importAll restores displayProfile', () => {
    const { manager } = createManager();
    const profile = {
      transferFunction: 'rec709',
      displayGamma: 1.5,
      displayBrightness: 0.9,
      customGamma: 2.2,
    };
    manager.importAll(JSON.stringify({ displayProfile: profile }));
    const restored = manager.getDisplayProfile();
    expect(restored).not.toBeNull();
    expect(restored!.transferFunction).toBe('rec709');
    expect(restored!.displayGamma).toBe(1.5);
    expect(restored!.displayBrightness).toBe(0.9);
  });

  it('CPRF-166-007: importAll with null displayProfile clears it', () => {
    const { manager } = createManager();
    manager.setDisplayProfile({
      transferFunction: 'srgb',
      displayGamma: 1.0,
      displayBrightness: 1.0,
      customGamma: 2.2,
    });
    manager.importAll(JSON.stringify({ displayProfile: null }));
    expect(manager.getDisplayProfile()).toBeNull();
  });

  it('CPRF-166-008: importAll with invalid displayProfile is ignored', () => {
    const { manager } = createManager();
    manager.setDisplayProfile({
      transferFunction: 'srgb',
      displayGamma: 1.0,
      displayBrightness: 1.0,
      customGamma: 2.2,
    });
    // Invalid: missing required fields
    manager.importAll(JSON.stringify({ displayProfile: { transferFunction: 'srgb' } }));
    // Original value preserved since invalid data is skipped
    expect(manager.getDisplayProfile()!.transferFunction).toBe('srgb');
  });

  it('CPRF-166-009: importAll without displayProfile key does not change existing value', () => {
    const { manager } = createManager();
    manager.setDisplayProfile({
      transferFunction: 'rec709',
      displayGamma: 1.0,
      displayBrightness: 1.0,
      customGamma: 2.2,
    });
    manager.importAll(JSON.stringify({ generalPrefs: { defaultFps: 30 } }));
    expect(manager.getDisplayProfile()!.transferFunction).toBe('rec709');
  });

  it('CPRF-166-010: resetAll clears displayProfile', () => {
    const { manager } = createManager();
    manager.setDisplayProfile({
      transferFunction: 'gamma2.4',
      displayGamma: 1.0,
      displayBrightness: 1.0,
      customGamma: 2.2,
    });
    manager.resetAll();
    expect(manager.getDisplayProfile()).toBeNull();
  });

  it('CPRF-166-011: full round-trip export/import preserves displayProfile', () => {
    const { manager: m1 } = createManager();
    m1.setDisplayProfile({
      transferFunction: 'custom',
      displayGamma: 1.3,
      displayBrightness: 0.7,
      customGamma: 3.0,
      outputGamut: 'display-p3',
    });
    const json = m1.exportAll();

    const { manager: m2 } = createManager();
    m2.importAll(json);
    const profile = m2.getDisplayProfile();
    expect(profile).not.toBeNull();
    expect(profile!.transferFunction).toBe('custom');
    expect(profile!.displayGamma).toBe(1.3);
    expect(profile!.displayBrightness).toBe(0.7);
    expect(profile!.customGamma).toBe(3.0);
    expect(profile!.outputGamut).toBe('display-p3');
  });

  it('CPRF-166-012: getDisplayProfile clamps out-of-range values', () => {
    const { manager, storage } = createManager();
    storage.setItem!(
      'openrv-display-profile',
      JSON.stringify({
        transferFunction: 'srgb',
        displayGamma: 100,
        displayBrightness: -5,
        customGamma: 999,
      }),
    );
    const profile = manager.getDisplayProfile();
    expect(profile).not.toBeNull();
    expect(profile!.displayGamma).toBe(4.0);
    expect(profile!.displayBrightness).toBe(0.0);
    expect(profile!.customGamma).toBe(10.0);
  });

  it('CPRF-166-013: getDisplayProfile returns null for corrupt JSON', () => {
    const { manager, storage } = createManager();
    storage.setItem!('openrv-display-profile', 'not-json');
    expect(manager.getDisplayProfile()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// #167: Timeline display mode in unified preferences
// ---------------------------------------------------------------------------

describe('PreferencesManager timelineDisplayMode (#167)', () => {
  it('CPRF-167-001: getTimelineDisplayMode returns null when storage is empty', () => {
    const { manager } = createManager();
    expect(manager.getTimelineDisplayMode()).toBeNull();
  });

  it('CPRF-167-002: setTimelineDisplayMode persists valid mode', () => {
    const { manager } = createManager();
    manager.setTimelineDisplayMode('timecode');
    expect(manager.getTimelineDisplayMode()).toBe('timecode');
  });

  it('CPRF-167-003: setTimelineDisplayMode(null) clears the mode', () => {
    const { manager } = createManager();
    manager.setTimelineDisplayMode('seconds');
    manager.setTimelineDisplayMode(null);
    expect(manager.getTimelineDisplayMode()).toBeNull();
  });

  it('CPRF-167-004: exportAll includes timelineDisplayMode', () => {
    const { manager } = createManager();
    manager.setTimelineDisplayMode('footage');
    const parsed = JSON.parse(manager.exportAll()) as PreferencesExportPayload;
    expect(parsed.timelineDisplayMode).toBe('footage');
  });

  it('CPRF-167-005: exportAll includes timelineDisplayMode as null when not set', () => {
    const { manager } = createManager();
    const parsed = JSON.parse(manager.exportAll()) as PreferencesExportPayload;
    expect(parsed.timelineDisplayMode).toBeNull();
  });

  it('CPRF-167-006: importAll restores timelineDisplayMode', () => {
    const { manager } = createManager();
    manager.importAll(JSON.stringify({ timelineDisplayMode: 'timecode' }));
    expect(manager.getTimelineDisplayMode()).toBe('timecode');
  });

  it('CPRF-167-007: importAll with invalid timelineDisplayMode clears it', () => {
    const { manager } = createManager();
    manager.setTimelineDisplayMode('seconds');
    manager.importAll(JSON.stringify({ timelineDisplayMode: 'invalid-mode' }));
    expect(manager.getTimelineDisplayMode()).toBeNull();
  });

  it('CPRF-167-008: importAll with null timelineDisplayMode clears it', () => {
    const { manager } = createManager();
    manager.setTimelineDisplayMode('frames');
    manager.importAll(JSON.stringify({ timelineDisplayMode: null }));
    expect(manager.getTimelineDisplayMode()).toBeNull();
  });

  it('CPRF-167-009: importAll without timelineDisplayMode key does not change existing value', () => {
    const { manager } = createManager();
    manager.setTimelineDisplayMode('footage');
    manager.importAll(JSON.stringify({ generalPrefs: { defaultFps: 30 } }));
    expect(manager.getTimelineDisplayMode()).toBe('footage');
  });

  it('CPRF-167-010: resetAll clears timelineDisplayMode', () => {
    const { manager } = createManager();
    manager.setTimelineDisplayMode('timecode');
    manager.resetAll();
    expect(manager.getTimelineDisplayMode()).toBeNull();
  });

  it('CPRF-167-011: full round-trip export/import preserves timelineDisplayMode', () => {
    const { manager: m1 } = createManager();
    m1.setTimelineDisplayMode('seconds');
    const json = m1.exportAll();

    const { manager: m2 } = createManager();
    m2.importAll(json);
    expect(m2.getTimelineDisplayMode()).toBe('seconds');
  });

  it('CPRF-167-012: all four display modes are valid', () => {
    const { manager } = createManager();
    for (const mode of ['frames', 'timecode', 'seconds', 'footage'] as const) {
      manager.setTimelineDisplayMode(mode);
      expect(manager.getTimelineDisplayMode()).toBe(mode);
    }
  });

  it('CPRF-167-013: getTimelineDisplayMode returns null for unknown stored value', () => {
    const { manager, storage } = createManager();
    storage.setItem!(CORE_PREFERENCE_STORAGE_KEYS.timelineDisplayMode, 'unknown-mode');
    expect(manager.getTimelineDisplayMode()).toBeNull();
  });

  it('CPRF-167-014: setTimelineDisplayMode ignores invalid mode strings', () => {
    const { manager } = createManager();
    manager.setTimelineDisplayMode('timecode');
    manager.setTimelineDisplayMode('bogus' as any);
    // Should still be 'timecode' since 'bogus' was rejected
    expect(manager.getTimelineDisplayMode()).toBe('timecode');
  });
});

// ---------------------------------------------------------------------------
// #168: Missing-frame mode in unified preferences
// ---------------------------------------------------------------------------

describe('PreferencesManager missingFrameMode (#168)', () => {
  it('CPRF-168-001: getMissingFrameMode returns null when storage is empty', () => {
    const { manager } = createManager();
    expect(manager.getMissingFrameMode()).toBeNull();
  });

  it('CPRF-168-002: setMissingFrameMode persists and getMissingFrameMode reads it back', () => {
    const { manager } = createManager();
    manager.setMissingFrameMode('hold');
    expect(manager.getMissingFrameMode()).toBe('hold');
  });

  it('CPRF-168-003: setMissingFrameMode(null) clears the value', () => {
    const { manager } = createManager();
    manager.setMissingFrameMode('black');
    manager.setMissingFrameMode(null);
    expect(manager.getMissingFrameMode()).toBeNull();
  });

  it('CPRF-168-004: exportAll includes missingFrameMode', () => {
    const { manager } = createManager();
    manager.setMissingFrameMode('hold');
    const parsed = JSON.parse(manager.exportAll()) as PreferencesExportPayload;
    expect(parsed.missingFrameMode).toBe('hold');
  });

  it('CPRF-168-005: exportAll includes missingFrameMode as null when not set', () => {
    const { manager } = createManager();
    const parsed = JSON.parse(manager.exportAll()) as PreferencesExportPayload;
    expect(parsed.missingFrameMode).toBeNull();
  });

  it('CPRF-168-006: importAll restores missingFrameMode', () => {
    const { manager } = createManager();
    manager.importAll(JSON.stringify({ missingFrameMode: 'black' }));
    expect(manager.getMissingFrameMode()).toBe('black');
  });

  it('CPRF-168-007: importAll with invalid missingFrameMode clears it', () => {
    const { manager } = createManager();
    manager.setMissingFrameMode('hold');
    manager.importAll(JSON.stringify({ missingFrameMode: 'invalid-mode' }));
    expect(manager.getMissingFrameMode()).toBeNull();
  });

  it('CPRF-168-008: importAll with null missingFrameMode clears it', () => {
    const { manager } = createManager();
    manager.setMissingFrameMode('show-frame');
    manager.importAll(JSON.stringify({ missingFrameMode: null }));
    expect(manager.getMissingFrameMode()).toBeNull();
  });

  it('CPRF-168-009: importAll without missingFrameMode key does not change existing value', () => {
    const { manager } = createManager();
    manager.setMissingFrameMode('hold');
    manager.importAll(JSON.stringify({ generalPrefs: { defaultFps: 30 } }));
    expect(manager.getMissingFrameMode()).toBe('hold');
  });

  it('CPRF-168-010: resetAll clears missingFrameMode', () => {
    const { manager } = createManager();
    manager.setMissingFrameMode('black');
    manager.resetAll();
    expect(manager.getMissingFrameMode()).toBeNull();
  });

  it('CPRF-168-011: full round-trip export/import preserves missingFrameMode', () => {
    const { manager: m1 } = createManager();
    m1.setMissingFrameMode('off');
    const json = m1.exportAll();

    const { manager: m2 } = createManager();
    m2.importAll(json);
    expect(m2.getMissingFrameMode()).toBe('off');
  });

  it('CPRF-168-012: all four missing-frame modes are valid', () => {
    const { manager } = createManager();
    for (const mode of ['off', 'show-frame', 'hold', 'black'] as const) {
      manager.setMissingFrameMode(mode);
      expect(manager.getMissingFrameMode()).toBe(mode);
    }
  });

  it('CPRF-168-013: getMissingFrameMode returns null for unknown stored value', () => {
    const { manager, storage } = createManager();
    storage.setItem!(CORE_PREFERENCE_STORAGE_KEYS.missingFrameMode, 'unknown-mode');
    expect(manager.getMissingFrameMode()).toBeNull();
  });

  it('CPRF-168-014: setMissingFrameMode ignores invalid mode strings', () => {
    const { manager } = createManager();
    manager.setMissingFrameMode('hold');
    manager.setMissingFrameMode('bogus' as any);
    // Should still be 'hold' since 'bogus' was rejected
    expect(manager.getMissingFrameMode()).toBe('hold');
  });
});

// ---------------------------------------------------------------------------
// Issue #277: importAll/resetAll apply live subsystems
// ---------------------------------------------------------------------------

describe('Issue #277: importAll/resetAll apply live subsystems', () => {
  function createMockSubsystems() {
    return {
      theme: { setMode: vi.fn() } as any,
      layout: { reloadFromStorage: vi.fn() } as any,
      keyBindings: { reloadFromStorage: vi.fn() } as any,
      ocio: { reloadFromStorage: vi.fn() } as any,
    };
  }

  it('CPRF-277-001: importAll with theme data calls ThemeManager.setMode', () => {
    const { manager } = createManager();
    const subs = createMockSubsystems();
    manager.setSubsystems(subs);

    manager.importAll(JSON.stringify({ themeMode: 'light' }));

    expect(subs.theme.setMode).toHaveBeenCalledWith('light');
  });

  it('CPRF-277-002: importAll with invalid themeMode calls setMode("auto")', () => {
    const { manager } = createManager();
    const subs = createMockSubsystems();
    manager.setSubsystems(subs);

    manager.importAll(JSON.stringify({ themeMode: 'neon' }));

    expect(subs.theme.setMode).toHaveBeenCalledWith('auto');
  });

  it('CPRF-277-003: importAll with null themeMode calls setMode("auto")', () => {
    const { manager } = createManager();
    const subs = createMockSubsystems();
    manager.setSubsystems(subs);

    manager.importAll(JSON.stringify({ themeMode: null }));

    expect(subs.theme.setMode).toHaveBeenCalledWith('auto');
  });

  it('CPRF-277-004: importAll calls reloadFromStorage on layout, keyBindings, ocio', () => {
    const { manager } = createManager();
    const subs = createMockSubsystems();
    manager.setSubsystems(subs);

    manager.importAll(
      JSON.stringify({
        layout: { version: 1 },
        keyBindings: [],
        ocioState: { enabled: true },
      }),
    );

    expect(subs.layout.reloadFromStorage).toHaveBeenCalled();
    expect(subs.keyBindings.reloadFromStorage).toHaveBeenCalled();
    expect(subs.ocio.reloadFromStorage).toHaveBeenCalled();
  });

  it('CPRF-277-005: importAll without themeMode key does not call theme.setMode', () => {
    const { manager } = createManager();
    const subs = createMockSubsystems();
    manager.setSubsystems(subs);

    manager.importAll(JSON.stringify({ generalPrefs: { userName: 'Alice' } }));

    expect(subs.theme.setMode).not.toHaveBeenCalled();
  });

  it('CPRF-277-006: resetAll calls setMode("auto") on theme and reloadFromStorage on others', () => {
    const { manager } = createManager();
    const subs = createMockSubsystems();
    manager.setSubsystems(subs);

    manager.resetAll();

    expect(subs.theme.setMode).toHaveBeenCalledWith('auto');
    expect(subs.layout.reloadFromStorage).toHaveBeenCalled();
    expect(subs.keyBindings.reloadFromStorage).toHaveBeenCalled();
    expect(subs.ocio.reloadFromStorage).toHaveBeenCalled();
  });

  it('CPRF-277-007: importAll with null subsystems does not crash', () => {
    const { manager } = createManager();
    // No subsystems wired — should not throw
    expect(() => {
      manager.importAll(
        JSON.stringify({
          themeMode: 'dark',
          layout: { version: 1 },
          keyBindings: [],
          ocioState: { enabled: true },
        }),
      );
    }).not.toThrow();
  });

  it('CPRF-277-008: resetAll with null subsystems does not crash', () => {
    const { manager } = createManager();
    // No subsystems wired — should not throw
    expect(() => manager.resetAll()).not.toThrow();
  });

  it('CPRF-277-009: importAll still emits imported event after applying subsystems', () => {
    const { manager } = createManager();
    const subs = createMockSubsystems();
    manager.setSubsystems(subs);

    const spy = vi.fn();
    manager.on('imported', spy);
    manager.importAll(JSON.stringify({ themeMode: 'dark' }));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('CPRF-277-010: resetAll still emits reset event after applying subsystems', () => {
    const { manager } = createManager();
    const subs = createMockSubsystems();
    manager.setSubsystems(subs);

    const spy = vi.fn();
    manager.on('reset', spy);
    manager.resetAll();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
