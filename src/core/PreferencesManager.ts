/**
 * Core PreferencesManager - unified preference facade.
 *
 * Wraps existing persisted subsystems (theme/layout/keybindings/OCIO/autosave)
 * and adds new persisted categories for color defaults, export defaults,
 * and general user preferences.
 */

import { EventEmitter, type EventMap } from '../utils/EventEmitter';
import {
  type PreferencesManager as StoragePreferencesManager,
  getPreferencesManager,
  PREFERENCE_STORAGE_KEYS,
} from '../utils/preferences/PreferencesManager';
import { clamp } from '../utils/math';
import type { TextureFilterMode } from './types/filter';
import type { ThemeManager } from '../utils/ui/ThemeManager';
import type { LayoutStore } from '../ui/layout/LayoutStore';
import type { CustomKeyBindingsManager } from '../utils/input/CustomKeyBindingsManager';
import type { OCIOStateManager } from '../ui/components/OCIOStateManager';
import type { DisplayColorState } from '../color/DisplayTransfer';
import type { TimecodeDisplayMode } from '../utils/media/Timecode';
import {
  DCC_STORAGE_KEY,
  DEFAULT_DCC_PREFS,
  sanitizeDCCPrefs,
  type DCCPrefs,
} from '../integrations/DCCSettings';

export type MissingFrameMode = 'off' | 'show-frame' | 'hold' | 'black';

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

/**
 * Provider interface for plugin settings backup/restore.
 * Decouples PreferencesManager (core) from PluginSettingsStore (plugin layer).
 */
export interface PluginSettingsProvider {
  exportAll(): Record<string, Record<string, unknown>>;
  importAll(data: Record<string, Record<string, unknown>>): void;
  clearAll(): void;
}

export type ThemeMode = 'dark' | 'light' | 'auto';

/**
 * Color defaults applied on source load.
 * - `defaultInputColorSpace`: fallback when no persisted color space and extension detection returns null.
 * - `defaultExposure`: applied when current exposure is at identity (0).
 * - `defaultGamma`: applied when current gamma is at identity (1).
 * - `defaultCDLPreset`: deferred — no CDL preset system exists yet.
 */
export interface ColorDefaults {
  defaultInputColorSpace: string;
  defaultExposure: number;
  defaultGamma: number;
  defaultCDLPreset: string | null;
}

/**
 * Export defaults for snapshot/export operations.
 * `frameburnEnabled` and `frameburnConfig` are consumed by ViewerExport.
 */
export interface ExportDefaults {
  defaultFormat: 'png' | 'jpeg' | 'webp';
  defaultQuality: number;
  includeAnnotations: boolean;
  frameburnEnabled: boolean;
  frameburnConfig: Record<string, unknown> | null;
}

export interface GeneralPrefs {
  /** Used by NotePanel and NetworkControl. */
  userName: string;
  /** Default FPS used for new sessions and media without embedded frame rate. Wired in App constructor. */
  defaultFps: number;
  /** When true, sequences (frameCount > 1) auto-play on source load. Wired in handleSourceLoaded. */
  autoPlayOnLoad: boolean;
  /** Deferred — no welcome dialog component exists yet. */
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
  fpsIndicatorPrefs: FPSIndicatorPrefs;
  filterMode: TextureFilterMode | null;
  displayProfile: DisplayColorState | null;
  timelineDisplayMode: TimecodeDisplayMode | null;
  missingFrameMode: MissingFrameMode | null;
  dccPrefs: DCCPrefs;
  pluginSettings?: Record<string, Record<string, unknown>>;
}

export const CORE_PREFERENCE_STORAGE_KEYS = {
  color: 'openrv-prefs-color',
  export: 'openrv-prefs-export',
  general: 'openrv-prefs-general',
  fpsIndicator: 'openrv-prefs-fps-indicator',
  filterMode: 'openrv-prefs-filter-mode',
  timelineDisplayMode: 'openrv-prefs-timeline-display-mode',
  missingFrameMode: 'openrv-prefs-missing-frame-mode',
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

export interface FPSIndicatorPrefs {
  enabled: boolean;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  showDroppedFrames: boolean;
  showTargetFps: boolean;
  backgroundOpacity: number;
  warningThreshold: number;
  criticalThreshold: number;
}

export const DEFAULT_FPS_INDICATOR_PREFS: FPSIndicatorPrefs = {
  enabled: true,
  position: 'top-right',
  showDroppedFrames: true,
  showTargetFps: true,
  backgroundOpacity: 0.6,
  warningThreshold: 0.97,
  criticalThreshold: 0.85,
};

export interface CorePreferencesEvents extends EventMap {
  colorDefaultsChanged: ColorDefaults;
  exportDefaultsChanged: ExportDefaults;
  generalPrefsChanged: GeneralPrefs;
  fpsIndicatorPrefsChanged: FPSIndicatorPrefs;
  dccPrefsChanged: DCCPrefs;
  imported: PreferencesExportPayload;
  reset: void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function sanitizeFPSIndicatorPrefs(value: unknown): FPSIndicatorPrefs {
  const out: FPSIndicatorPrefs = { ...DEFAULT_FPS_INDICATOR_PREFS };
  if (!isRecord(value)) return out;

  if (typeof value.enabled === 'boolean') {
    out.enabled = value.enabled;
  }
  const validPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  if (typeof value.position === 'string' && validPositions.includes(value.position)) {
    out.position = value.position as FPSIndicatorPrefs['position'];
  }
  if (typeof value.showDroppedFrames === 'boolean') {
    out.showDroppedFrames = value.showDroppedFrames;
  }
  if (typeof value.showTargetFps === 'boolean') {
    out.showTargetFps = value.showTargetFps;
  }
  if (typeof value.backgroundOpacity === 'number' && Number.isFinite(value.backgroundOpacity)) {
    out.backgroundOpacity = clamp(value.backgroundOpacity, 0, 1);
  }
  if (typeof value.warningThreshold === 'number' && Number.isFinite(value.warningThreshold)) {
    out.warningThreshold = clamp(value.warningThreshold, 0, 1);
  }
  if (typeof value.criticalThreshold === 'number' && Number.isFinite(value.criticalThreshold)) {
    out.criticalThreshold = clamp(value.criticalThreshold, 0, 1);
  }

  // Enforce warningThreshold >= criticalThreshold; swap if inverted
  if (out.warningThreshold < out.criticalThreshold) {
    const tmp = out.warningThreshold;
    out.warningThreshold = out.criticalThreshold;
    out.criticalThreshold = tmp;
  }

  return out;
}

const VALID_TRANSFER_FUNCTIONS = new Set(['linear', 'srgb', 'rec709', 'gamma2.2', 'gamma2.4', 'custom']);
const VALID_OUTPUT_GAMUTS = new Set(['auto', 'srgb', 'display-p3']);
const VALID_TIMECODE_DISPLAY_MODES = new Set<string>(['frames', 'timecode', 'seconds', 'footage']);
const VALID_MISSING_FRAME_MODES = new Set<string>(['off', 'show-frame', 'hold', 'black']);

function isTimecodeDisplayMode(value: unknown): value is TimecodeDisplayMode {
  return typeof value === 'string' && VALID_TIMECODE_DISPLAY_MODES.has(value);
}

function isMissingFrameMode(value: unknown): value is MissingFrameMode {
  return typeof value === 'string' && VALID_MISSING_FRAME_MODES.has(value);
}

function sanitizeDisplayProfile(value: unknown): DisplayColorState | null {
  if (!isRecord(value)) return null;
  if (
    !VALID_TRANSFER_FUNCTIONS.has(value.transferFunction as string) ||
    typeof value.displayGamma !== 'number' ||
    !Number.isFinite(value.displayGamma) ||
    typeof value.displayBrightness !== 'number' ||
    !Number.isFinite(value.displayBrightness) ||
    typeof value.customGamma !== 'number' ||
    !Number.isFinite(value.customGamma)
  ) {
    return null;
  }
  const result: DisplayColorState = {
    transferFunction: value.transferFunction as DisplayColorState['transferFunction'],
    displayGamma: clamp(value.displayGamma, 0.1, 4.0),
    displayBrightness: clamp(value.displayBrightness, 0.0, 2.0),
    customGamma: clamp(value.customGamma, 0.1, 10.0),
  };
  if (VALID_OUTPUT_GAMUTS.has(value.outputGamut as string)) {
    result.outputGamut = value.outputGamut as DisplayColorState['outputGamut'];
  }
  return result;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'auto';
}

function hasOwnKey(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export class PreferencesManager extends EventEmitter<CorePreferencesEvents> {
  /** Whether the storage-only warning has been emitted (reset in tests). */
  static _storageOnlyWarningEmitted = false;
  private _subsystems: PreferencesSubsystems = {};
  private _pluginSettingsProvider: PluginSettingsProvider | null = null;

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

  /**
   * Wire a plugin settings provider for backup/restore integration.
   * When set, plugin settings are included in exportAll/importAll/resetAll.
   */
  setPluginSettingsProvider(provider: PluginSettingsProvider | null): void {
    this._pluginSettingsProvider = provider;
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

  getFPSIndicatorPrefs(): FPSIndicatorPrefs {
    return sanitizeFPSIndicatorPrefs(this.storage.getJSON<unknown>(CORE_PREFERENCE_STORAGE_KEYS.fpsIndicator));
  }

  setFPSIndicatorPrefs(prefs: Partial<FPSIndicatorPrefs>): void {
    const current = this.getFPSIndicatorPrefs();
    const merged = sanitizeFPSIndicatorPrefs({ ...current, ...prefs });
    this.storage.setJSON(CORE_PREFERENCE_STORAGE_KEYS.fpsIndicator, merged);
    this.emit('fpsIndicatorPrefsChanged', merged);
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

  getFilterMode(): TextureFilterMode | null {
    const value = this.storage.getString(CORE_PREFERENCE_STORAGE_KEYS.filterMode);
    if (value === 'nearest' || value === 'linear') return value;
    return null;
  }

  setFilterMode(mode: TextureFilterMode | null): void {
    if (mode === null) {
      this.storage.remove(CORE_PREFERENCE_STORAGE_KEYS.filterMode);
      return;
    }
    this.storage.setString(CORE_PREFERENCE_STORAGE_KEYS.filterMode, mode);
  }

  getDisplayProfile(): DisplayColorState | null {
    return sanitizeDisplayProfile(this.storage.getJSON<unknown>(PREFERENCE_STORAGE_KEYS.displayProfile));
  }

  setDisplayProfile(state: DisplayColorState | null): void {
    if (state === null) {
      this.storage.remove(PREFERENCE_STORAGE_KEYS.displayProfile);
      return;
    }
    const sanitized = sanitizeDisplayProfile(state);
    if (sanitized) {
      this.storage.setJSON(PREFERENCE_STORAGE_KEYS.displayProfile, sanitized);
    }
  }

  getTimelineDisplayMode(): TimecodeDisplayMode | null {
    const value = this.storage.getString(CORE_PREFERENCE_STORAGE_KEYS.timelineDisplayMode);
    return isTimecodeDisplayMode(value) ? value : null;
  }

  setTimelineDisplayMode(mode: TimecodeDisplayMode | null): void {
    if (mode === null) {
      this.storage.remove(CORE_PREFERENCE_STORAGE_KEYS.timelineDisplayMode);
      return;
    }
    if (isTimecodeDisplayMode(mode)) {
      this.storage.setString(CORE_PREFERENCE_STORAGE_KEYS.timelineDisplayMode, mode);
    }
  }

  getMissingFrameMode(): MissingFrameMode | null {
    const value = this.storage.getString(CORE_PREFERENCE_STORAGE_KEYS.missingFrameMode);
    return isMissingFrameMode(value) ? value : null;
  }

  setMissingFrameMode(mode: MissingFrameMode | null): void {
    if (mode === null) {
      this.storage.remove(CORE_PREFERENCE_STORAGE_KEYS.missingFrameMode);
      return;
    }
    if (isMissingFrameMode(mode)) {
      this.storage.setString(CORE_PREFERENCE_STORAGE_KEYS.missingFrameMode, mode);
    }
  }

  getDCCPrefs(): DCCPrefs {
    return sanitizeDCCPrefs(this.storage.getJSON<unknown>(DCC_STORAGE_KEY));
  }

  setDCCPrefs(prefs: Partial<DCCPrefs>): void {
    const current = this.getDCCPrefs();
    const merged = sanitizeDCCPrefs({ ...current, ...prefs });
    this.storage.setJSON(DCC_STORAGE_KEY, merged);
    this.emit('dccPrefsChanged', merged);
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

    if (hasOwnKey(parsed, 'fpsIndicatorPrefs')) {
      const value = parsed.fpsIndicatorPrefs;
      if (value === null) {
        this.storage.remove(CORE_PREFERENCE_STORAGE_KEYS.fpsIndicator);
        this.emit('fpsIndicatorPrefsChanged', { ...DEFAULT_FPS_INDICATOR_PREFS });
      } else if (isRecord(value)) {
        this.setFPSIndicatorPrefs(value as Partial<FPSIndicatorPrefs>);
      }
    }

    if (hasOwnKey(parsed, 'filterMode')) {
      const value = parsed.filterMode;
      if (value === 'nearest' || value === 'linear') {
        this.setFilterMode(value);
      } else {
        this.setFilterMode(null);
      }
    }

    if (hasOwnKey(parsed, 'displayProfile')) {
      const value = parsed.displayProfile;
      if (value === null) {
        this.setDisplayProfile(null);
      } else if (isRecord(value)) {
        const sanitized = sanitizeDisplayProfile(value);
        if (sanitized) {
          this.setDisplayProfile(sanitized);
        }
      }
    }

    if (hasOwnKey(parsed, 'timelineDisplayMode')) {
      const value = parsed.timelineDisplayMode;
      if (isTimecodeDisplayMode(value)) {
        this.setTimelineDisplayMode(value);
      } else {
        this.setTimelineDisplayMode(null);
      }
    }

    if (hasOwnKey(parsed, 'missingFrameMode')) {
      const value = parsed.missingFrameMode;
      if (isMissingFrameMode(value)) {
        this.setMissingFrameMode(value);
      } else {
        this.setMissingFrameMode(null);
      }
    }

    if (hasOwnKey(parsed, 'dccPrefs')) {
      const value = parsed.dccPrefs;
      if (value === null) {
        this.storage.remove(DCC_STORAGE_KEY);
        this.emit('dccPrefsChanged', { ...DEFAULT_DCC_PREFS });
      } else if (isRecord(value)) {
        this.setDCCPrefs(value as Partial<DCCPrefs>);
      }
    }

    if (hasOwnKey(parsed, 'pluginSettings') && this._pluginSettingsProvider) {
      const value = parsed.pluginSettings;
      if (isRecord(value)) {
        this._pluginSettingsProvider.importAll(value as Record<string, Record<string, unknown>>);
      }
    }

    // Apply live subsystem changes so the UI updates without a page reload.
    this.applySubsystemsFromStorage(parsed);

    this.emit('imported', this.buildExportPayload());
  }

  resetAll(): void {
    for (const key of Object.values(PREFERENCE_STORAGE_KEYS)) {
      this.storage.remove(key);
    }
    for (const key of Object.values(CORE_PREFERENCE_STORAGE_KEYS)) {
      this.storage.remove(key);
    }
    this.storage.remove(DCC_STORAGE_KEY);
    if (this._pluginSettingsProvider) {
      this._pluginSettingsProvider.clearAll();
    }

    // Apply live subsystem resets so the UI reverts to defaults without a page reload.
    this.resetSubsystems();

    this.emit('colorDefaultsChanged', { ...DEFAULT_COLOR_DEFAULTS });
    this.emit('exportDefaultsChanged', { ...DEFAULT_EXPORT_DEFAULTS });
    this.emit('generalPrefsChanged', { ...DEFAULT_GENERAL_PREFS });
    this.emit('fpsIndicatorPrefsChanged', { ...DEFAULT_FPS_INDICATOR_PREFS });
    this.emit('dccPrefsChanged', { ...DEFAULT_DCC_PREFS });
    this.emit('reset', undefined);
  }

  /**
   * Tell live subsystems to pick up freshly-imported storage values.
   * Null-safe: skips any subsystem that is not yet wired.
   */
  private applySubsystemsFromStorage(parsed: Record<string, unknown>): void {
    if (this._subsystems.theme && hasOwnKey(parsed, 'themeMode')) {
      const mode = parsed.themeMode;
      this._subsystems.theme.setMode(isThemeMode(mode) ? mode : 'auto');
    }
    this._subsystems.layout?.reloadFromStorage();
    this._subsystems.keyBindings?.reloadFromStorage();
    this._subsystems.ocio?.reloadFromStorage();
  }

  /**
   * Tell live subsystems to revert to defaults after storage was cleared.
   * Null-safe: skips any subsystem that is not yet wired.
   */
  private resetSubsystems(): void {
    this._subsystems.theme?.setMode('auto');
    this._subsystems.layout?.reloadFromStorage();
    this._subsystems.keyBindings?.reloadFromStorage();
    this._subsystems.ocio?.reloadFromStorage();
  }

  private writeJSON(key: string, value: unknown): void {
    if (value === null) {
      this.storage.remove(key);
      return;
    }
    this.storage.setJSON(key, value);
  }

  private buildExportPayload(): PreferencesExportPayload {
    const payload: PreferencesExportPayload = {
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
      fpsIndicatorPrefs: this.getFPSIndicatorPrefs(),
      filterMode: this.getFilterMode(),
      displayProfile: this.getDisplayProfile(),
      timelineDisplayMode: this.getTimelineDisplayMode(),
      missingFrameMode: this.getMissingFrameMode(),
      dccPrefs: this.getDCCPrefs(),
    };
    if (this._pluginSettingsProvider) {
      payload.pluginSettings = this._pluginSettingsProvider.exportAll();
    }
    return payload;
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
  // Also reset the one-time storage-only warning so tests can verify it independently.
  PreferencesManager._storageOnlyWarningEmitted = false;
}
