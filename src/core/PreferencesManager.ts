/**
 * Core PreferencesManager - unified preference facade.
 *
 * Wraps existing persisted subsystems (theme/layout/keybindings/OCIO/autosave)
 * and adds new persisted categories for color defaults, export defaults,
 * and general user preferences.
 */

import { EventEmitter, EventMap } from '../utils/EventEmitter';
import {
  PreferencesManager as StoragePreferencesManager,
  getPreferencesManager,
  PREFERENCE_STORAGE_KEYS,
} from '../utils/preferences/PreferencesManager';
import type { ThemeManager } from '../utils/ui/ThemeManager';
import type { LayoutStore } from '../ui/layout/LayoutStore';
import type { CustomKeyBindingsManager } from '../utils/input/CustomKeyBindingsManager';
import type { OCIOStateManager } from '../ui/components/OCIOStateManager';

/**
 * Subsystem references that the PreferencesManager can delegate to.
 * All fields are optional — the facade getters throw if the subsystem
 * was never provided (i.e. PreferencesManager was used stand-alone).
 */
export interface PreferencesSubsystems {
  theme?: ThemeManager;
  layout?: LayoutStore;
  keyBindings?: CustomKeyBindingsManager;
  ocio?: OCIOStateManager;
}

export type ThemeMode = 'dark' | 'light' | 'auto';

export interface ColorDefaults {
  defaultInputColorSpace: string;
  defaultExposure: number;
  defaultGamma: number;
  defaultCDLPreset: string | null;
}

export interface ExportDefaults {
  defaultFormat: 'png' | 'jpeg' | 'webp';
  defaultQuality: number;
  includeAnnotations: boolean;
  frameburnEnabled: boolean;
  frameburnConfig: Record<string, unknown> | null;
}

export interface GeneralPrefs {
  userName: string;
  defaultFps: number;
  autoPlayOnLoad: boolean;
  showWelcome: boolean;
}

export interface PreferencesExportPayload {
  version: number;
  themeMode: ThemeMode | null;
  cursorAutoHide: boolean | null;
  layout: unknown;
  layoutCustomList: unknown;
  keyBindings: unknown;
  ocioState: unknown;
  ocioPerSource: unknown;
  autoSaveConfig: unknown;
  colorDefaults: ColorDefaults;
  exportDefaults: ExportDefaults;
  generalPrefs: GeneralPrefs;
}

export const CORE_PREFERENCE_STORAGE_KEYS = {
  color: 'openrv-prefs-color',
  export: 'openrv-prefs-export',
  general: 'openrv-prefs-general',
} as const;

export const DEFAULT_COLOR_DEFAULTS: ColorDefaults = {
  defaultInputColorSpace: 'Auto',
  defaultExposure: 0,
  defaultGamma: 1,
  defaultCDLPreset: null,
};

export const DEFAULT_EXPORT_DEFAULTS: ExportDefaults = {
  defaultFormat: 'png',
  defaultQuality: 0.92,
  includeAnnotations: true,
  frameburnEnabled: false,
  frameburnConfig: null,
};

export const DEFAULT_GENERAL_PREFS: GeneralPrefs = {
  userName: '',
  defaultFps: 24,
  autoPlayOnLoad: false,
  showWelcome: true,
};

export interface CorePreferencesEvents extends EventMap {
  colorDefaultsChanged: ColorDefaults;
  exportDefaultsChanged: ExportDefaults;
  generalPrefsChanged: GeneralPrefs;
  imported: PreferencesExportPayload;
  reset: void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeColorDefaults(value: unknown): ColorDefaults {
  const out: ColorDefaults = { ...DEFAULT_COLOR_DEFAULTS };
  if (!isRecord(value)) return out;

  if (typeof value.defaultInputColorSpace === 'string') {
    const normalized = value.defaultInputColorSpace.trim();
    if (normalized.length > 0) out.defaultInputColorSpace = normalized;
  }
  if (typeof value.defaultExposure === 'number' && Number.isFinite(value.defaultExposure)) {
    out.defaultExposure = clamp(value.defaultExposure, -20, 20);
  }
  if (typeof value.defaultGamma === 'number' && Number.isFinite(value.defaultGamma)) {
    out.defaultGamma = clamp(value.defaultGamma, 0.01, 8);
  }
  if (typeof value.defaultCDLPreset === 'string') {
    const normalized = value.defaultCDLPreset.trim();
    out.defaultCDLPreset = normalized.length > 0 ? normalized : null;
  } else if (value.defaultCDLPreset === null) {
    out.defaultCDLPreset = null;
  }

  return out;
}

function sanitizeExportDefaults(value: unknown): ExportDefaults {
  const out: ExportDefaults = { ...DEFAULT_EXPORT_DEFAULTS };
  if (!isRecord(value)) return out;

  if (value.defaultFormat === 'png' || value.defaultFormat === 'jpeg' || value.defaultFormat === 'webp') {
    out.defaultFormat = value.defaultFormat;
  }
  if (typeof value.defaultQuality === 'number' && Number.isFinite(value.defaultQuality)) {
    out.defaultQuality = clamp(value.defaultQuality, 0, 1);
  }
  if (typeof value.includeAnnotations === 'boolean') {
    out.includeAnnotations = value.includeAnnotations;
  }
  if (typeof value.frameburnEnabled === 'boolean') {
    out.frameburnEnabled = value.frameburnEnabled;
  }
  if (value.frameburnConfig === null) {
    out.frameburnConfig = null;
  } else if (isRecord(value.frameburnConfig)) {
    out.frameburnConfig = value.frameburnConfig;
  }

  return out;
}

function sanitizeGeneralPrefs(value: unknown): GeneralPrefs {
  const out: GeneralPrefs = { ...DEFAULT_GENERAL_PREFS };
  if (!isRecord(value)) return out;

  if (typeof value.userName === 'string') {
    out.userName = value.userName.trim();
  }
  if (typeof value.defaultFps === 'number' && Number.isFinite(value.defaultFps)) {
    out.defaultFps = clamp(value.defaultFps, 1, 240);
  }
  if (typeof value.autoPlayOnLoad === 'boolean') {
    out.autoPlayOnLoad = value.autoPlayOnLoad;
  }
  if (typeof value.showWelcome === 'boolean') {
    out.showWelcome = value.showWelcome;
  }

  return out;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'auto';
}

function hasOwnKey(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export class PreferencesManager extends EventEmitter<CorePreferencesEvents> {
  private _subsystems: PreferencesSubsystems = {};

  constructor(private readonly storage: StoragePreferencesManager = getPreferencesManager()) {
    super();
  }

  /**
   * Provide subsystem references for facade access.
   * Called by App after all subsystems are created.
   */
  setSubsystems(subsystems: PreferencesSubsystems): void {
    this._subsystems = { ...subsystems };
  }

  /** Facade: ThemeManager (throws if not wired). */
  get theme(): ThemeManager {
    if (!this._subsystems.theme) {
      throw new Error('PreferencesManager: theme subsystem not wired');
    }
    return this._subsystems.theme;
  }

  /** Facade: LayoutStore (throws if not wired). */
  get layout(): LayoutStore {
    if (!this._subsystems.layout) {
      throw new Error('PreferencesManager: layout subsystem not wired');
    }
    return this._subsystems.layout;
  }

  /** Facade: CustomKeyBindingsManager (throws if not wired). */
  get keyBindings(): CustomKeyBindingsManager {
    if (!this._subsystems.keyBindings) {
      throw new Error('PreferencesManager: keyBindings subsystem not wired');
    }
    return this._subsystems.keyBindings;
  }

  /** Facade: OCIOStateManager (throws if not wired). */
  get ocio(): OCIOStateManager {
    if (!this._subsystems.ocio) {
      throw new Error('PreferencesManager: ocio subsystem not wired');
    }
    return this._subsystems.ocio;
  }

  getThemeMode(): ThemeMode | null {
    const mode = this.storage.getString(PREFERENCE_STORAGE_KEYS.themeMode);
    return isThemeMode(mode) ? mode : null;
  }

  setThemeMode(mode: ThemeMode | null): void {
    if (mode === null) {
      this.storage.remove(PREFERENCE_STORAGE_KEYS.themeMode);
      return;
    }
    this.storage.setString(PREFERENCE_STORAGE_KEYS.themeMode, mode);
  }

  getColorDefaults(): ColorDefaults {
    return sanitizeColorDefaults(this.storage.getJSON<unknown>(CORE_PREFERENCE_STORAGE_KEYS.color));
  }

  setColorDefaults(defaults: Partial<ColorDefaults>): void {
    const current = this.getColorDefaults();
    const merged = sanitizeColorDefaults({ ...current, ...defaults });
    this.storage.setJSON(CORE_PREFERENCE_STORAGE_KEYS.color, merged);
    this.emit('colorDefaultsChanged', merged);
  }

  getExportDefaults(): ExportDefaults {
    return sanitizeExportDefaults(this.storage.getJSON<unknown>(CORE_PREFERENCE_STORAGE_KEYS.export));
  }

  setExportDefaults(defaults: Partial<ExportDefaults>): void {
    const current = this.getExportDefaults();
    const merged = sanitizeExportDefaults({ ...current, ...defaults });
    this.storage.setJSON(CORE_PREFERENCE_STORAGE_KEYS.export, merged);
    this.emit('exportDefaultsChanged', merged);
  }

  getGeneralPrefs(): GeneralPrefs {
    return sanitizeGeneralPrefs(this.storage.getJSON<unknown>(CORE_PREFERENCE_STORAGE_KEYS.general));
  }

  setGeneralPrefs(prefs: Partial<GeneralPrefs>): void {
    const current = this.getGeneralPrefs();
    const merged = sanitizeGeneralPrefs({ ...current, ...prefs });
    this.storage.setJSON(CORE_PREFERENCE_STORAGE_KEYS.general, merged);
    this.emit('generalPrefsChanged', merged);
  }

  exportAll(): string {
    return JSON.stringify(this.buildExportPayload());
  }

  importAll(json: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('Invalid preferences JSON payload');
    }
    if (!isRecord(parsed)) {
      throw new Error('Invalid preferences payload shape');
    }

    if (hasOwnKey(parsed, 'themeMode')) {
      const value = parsed.themeMode;
      this.setThemeMode(isThemeMode(value) ? value : null);
    }

    if (hasOwnKey(parsed, 'cursorAutoHide')) {
      const value = parsed.cursorAutoHide;
      if (typeof value === 'boolean') {
        this.storage.setBoolean(PREFERENCE_STORAGE_KEYS.cursorAutoHide, value);
      } else if (value === null) {
        this.storage.remove(PREFERENCE_STORAGE_KEYS.cursorAutoHide);
      }
    }

    if (hasOwnKey(parsed, 'layout')) {
      this.writeJSON(PREFERENCE_STORAGE_KEYS.layout, parsed.layout);
    }
    if (hasOwnKey(parsed, 'layoutCustomList')) {
      this.writeJSON(PREFERENCE_STORAGE_KEYS.layoutCustomList, parsed.layoutCustomList);
    }
    if (hasOwnKey(parsed, 'keyBindings')) {
      this.writeJSON(PREFERENCE_STORAGE_KEYS.customKeyBindings, parsed.keyBindings);
    }
    if (hasOwnKey(parsed, 'ocioState')) {
      this.writeJSON(PREFERENCE_STORAGE_KEYS.ocioState, parsed.ocioState);
    }
    if (hasOwnKey(parsed, 'ocioPerSource')) {
      this.writeJSON(PREFERENCE_STORAGE_KEYS.ocioPerSource, parsed.ocioPerSource);
    }
    if (hasOwnKey(parsed, 'autoSaveConfig')) {
      this.writeJSON(PREFERENCE_STORAGE_KEYS.autoSaveConfig, parsed.autoSaveConfig);
    }

    if (hasOwnKey(parsed, 'colorDefaults')) {
      const value = parsed.colorDefaults;
      if (value === null) {
        this.storage.remove(CORE_PREFERENCE_STORAGE_KEYS.color);
        this.emit('colorDefaultsChanged', { ...DEFAULT_COLOR_DEFAULTS });
      } else if (isRecord(value)) {
        this.setColorDefaults(value as Partial<ColorDefaults>);
      }
    }

    if (hasOwnKey(parsed, 'exportDefaults')) {
      const value = parsed.exportDefaults;
      if (value === null) {
        this.storage.remove(CORE_PREFERENCE_STORAGE_KEYS.export);
        this.emit('exportDefaultsChanged', { ...DEFAULT_EXPORT_DEFAULTS });
      } else if (isRecord(value)) {
        this.setExportDefaults(value as Partial<ExportDefaults>);
      }
    }

    if (hasOwnKey(parsed, 'generalPrefs')) {
      const value = parsed.generalPrefs;
      if (value === null) {
        this.storage.remove(CORE_PREFERENCE_STORAGE_KEYS.general);
        this.emit('generalPrefsChanged', { ...DEFAULT_GENERAL_PREFS });
      } else if (isRecord(value)) {
        this.setGeneralPrefs(value as Partial<GeneralPrefs>);
      }
    }

    this.emit('imported', this.buildExportPayload());
  }

  resetAll(): void {
    for (const key of Object.values(PREFERENCE_STORAGE_KEYS)) {
      this.storage.remove(key);
    }
    for (const key of Object.values(CORE_PREFERENCE_STORAGE_KEYS)) {
      this.storage.remove(key);
    }
    this.emit('colorDefaultsChanged', { ...DEFAULT_COLOR_DEFAULTS });
    this.emit('exportDefaultsChanged', { ...DEFAULT_EXPORT_DEFAULTS });
    this.emit('generalPrefsChanged', { ...DEFAULT_GENERAL_PREFS });
    this.emit('reset', undefined);
  }

  private writeJSON(key: string, value: unknown): void {
    if (value === null) {
      this.storage.remove(key);
      return;
    }
    this.storage.setJSON(key, value);
  }

  private buildExportPayload(): PreferencesExportPayload {
    return {
      version: 1,
      themeMode: this.getThemeMode(),
      cursorAutoHide: this.storage.getBoolean(PREFERENCE_STORAGE_KEYS.cursorAutoHide),
      layout: this.storage.getJSON(PREFERENCE_STORAGE_KEYS.layout),
      layoutCustomList: this.storage.getJSON(PREFERENCE_STORAGE_KEYS.layoutCustomList),
      keyBindings: this.storage.getJSON(PREFERENCE_STORAGE_KEYS.customKeyBindings),
      ocioState: this.storage.getJSON(PREFERENCE_STORAGE_KEYS.ocioState),
      ocioPerSource: this.storage.getJSON(PREFERENCE_STORAGE_KEYS.ocioPerSource),
      autoSaveConfig: this.storage.getJSON(PREFERENCE_STORAGE_KEYS.autoSaveConfig),
      colorDefaults: this.getColorDefaults(),
      exportDefaults: this.getExportDefaults(),
      generalPrefs: this.getGeneralPrefs(),
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let sharedCorePreferencesManager: PreferencesManager | null = null;

/** Get or create the global core PreferencesManager singleton. */
export function getCorePreferencesManager(): PreferencesManager {
  if (!sharedCorePreferencesManager) {
    sharedCorePreferencesManager = new PreferencesManager();
  }
  return sharedCorePreferencesManager;
}

/** Test helper: reset the singleton between tests. */
export function resetCorePreferencesManagerForTests(): void {
  sharedCorePreferencesManager = null;
}

