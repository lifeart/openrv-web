/**
 * OCIOStateManager - OCIO state management separated from UI
 *
 * Manages OCIO configuration state, persistence, custom config loading,
 * and validation. Emits events for state changes and validation feedback
 * so that UI components can react accordingly.
 *
 * No DOM dependencies - pure logic.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import {
  type OCIOState,
  getAvailableConfigs,
  registerCustomConfig,
  OCIOProcessor,
  parseOCIOConfig,
  validateOCIOConfig,
  getPresetById,
} from '../../color/ColorProcessingFacade';
import { getPreferencesManager, PREFERENCE_STORAGE_KEYS } from '../../utils/preferences/PreferencesManager';

/**
 * Validation feedback message emitted by the state manager
 */
export interface ValidationFeedback {
  message: string;
  type: 'success' | 'warning' | 'error';
}

/**
 * OCIOStateManager events
 */
export interface OCIOStateManagerEvents extends EventMap {
  stateChanged: OCIOState;
  validationFeedback: ValidationFeedback;
  configListChanged: Array<{ name: string; description: string }>;
}

/**
 * localStorage key for OCIO state persistence
 */
const STORAGE_KEY = PREFERENCE_STORAGE_KEYS.ocioState;

/**
 * localStorage key for per-source color space persistence
 */
const PER_SOURCE_STORAGE_KEY = PREFERENCE_STORAGE_KEYS.ocioPerSource;

/** How long to debounce before writing per-source state to localStorage (ms). */
const PER_SOURCE_SAVE_DEBOUNCE_MS = 500;

/**
 * OCIOStateManager - Pure state management for OCIO color pipeline
 */
export class OCIOStateManager extends EventEmitter<OCIOStateManagerEvents> {
  private processor: OCIOProcessor;
  private _perSourceSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly preferences = getPreferencesManager();

  constructor(processor?: OCIOProcessor) {
    super();
    this.processor = processor ?? new OCIOProcessor();

    // Load persisted state (both global and per-source)
    this.loadState();
    this.loadPerSourceState();

    // Listen to processor state changes
    this.processor.on('stateChanged', (state) => {
      this.saveState();
      this.emit('stateChanged', state);
    });

    // Listen to per-source color space changes for persistence
    this.processor.on('perSourceColorSpaceChanged', () => {
      this.schedulePerSourceSave();
    });
  }

  // ==========================================================================
  // Processor Access
  // ==========================================================================

  /**
   * Get the underlying OCIO processor
   */
  getProcessor(): OCIOProcessor {
    return this.processor;
  }

  // ==========================================================================
  // State Access & Mutation
  // ==========================================================================

  /**
   * Get current OCIO state
   */
  getState(): OCIOState {
    return this.processor.getState();
  }

  /**
   * Set OCIO state
   */
  setState(state: Partial<OCIOState>): void {
    this.processor.setState(state);
  }

  /**
   * Check if OCIO is enabled
   */
  isEnabled(): boolean {
    return this.processor.isEnabled();
  }

  /**
   * Enable or disable OCIO processing
   */
  setEnabled(enabled: boolean): void {
    this.processor.setEnabled(enabled);
  }

  /**
   * Reset OCIO to defaults
   */
  reset(): void {
    this.processor.reset();
  }

  // ==========================================================================
  // Config Selection
  // ==========================================================================

  /**
   * Load a built-in or registered configuration by name
   */
  loadConfig(configName: string): void {
    this.processor.loadConfig(configName);
  }

  /**
   * Set input color space
   */
  setInputColorSpace(colorSpace: string): void {
    this.processor.setInputColorSpace(colorSpace);
  }

  /**
   * Set working color space
   */
  setWorkingColorSpace(colorSpace: string): void {
    this.processor.setWorkingColorSpace(colorSpace);
  }

  /**
   * Set display
   */
  setDisplay(display: string): void {
    this.processor.setDisplay(display);
  }

  /**
   * Set view
   */
  setView(view: string): void {
    this.processor.setView(view);
  }

  /**
   * Set look
   */
  setLook(look: string): void {
    this.processor.setLook(look);
  }

  /**
   * Set look direction
   */
  setLookDirection(direction: 'forward' | 'inverse'): void {
    this.processor.setLookDirection(direction);
  }

  // ==========================================================================
  // Custom Config Loading
  // ==========================================================================

  /**
   * Get the list of available configs (built-in + custom)
   */
  getAvailableConfigs(): Array<{ name: string; description: string }> {
    return getAvailableConfigs();
  }

  /**
   * Load and validate an OCIO config from a File object.
   * Emits validationFeedback events for success/warning/error.
   * Emits configListChanged when a new config is successfully registered.
   */
  loadConfigFromFile(file: File): void {
    const reader = new FileReader();
    reader.onerror = () => {
      this.emit('validationFeedback', {
        message: 'Failed to read file',
        type: 'error',
      });
    };
    reader.onload = () => {
      try {
        const configText = reader.result as string;

        // Validate before parsing
        const validation = validateOCIOConfig(configText);
        if (!validation.valid) {
          const errors = validation.errors.slice(0, 3).join('; ');
          this.emit('validationFeedback', {
            message: `Invalid config: ${errors}`,
            type: 'error',
          });
          return;
        }

        // Show warnings if any
        if (validation.warnings.length > 0) {
          const warnings = validation.warnings.slice(0, 3).join('; ');
          this.emit('validationFeedback', {
            message: `Loaded with warnings: ${warnings}`,
            type: 'warning',
          });
        }

        const configName = file.name.replace(/\.ocio$/i, '').replace(/[^a-zA-Z0-9_.-]/g, '_');
        const config = parseOCIOConfig(configText, configName);

        // Register the custom config
        registerCustomConfig(config);

        // Emit config list changed so UI can refresh dropdowns
        this.emit('configListChanged', this.getAvailableConfigs());

        // Load the new config in the processor
        this.processor.loadConfig(config.name);

        if (validation.warnings.length === 0) {
          this.emit('validationFeedback', {
            message: `Loaded "${file.name}" successfully`,
            type: 'success',
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.emit('validationFeedback', {
          message: `Load failed: ${msg}`,
          type: 'error',
        });
      }
    };
    reader.readAsText(file);
  }

  // ==========================================================================
  // Workflow Presets
  // ==========================================================================

  /**
   * Apply a workflow preset by ID.
   * Sets the full OCIO pipeline state in a single call.
   */
  applyPreset(presetId: string): void {
    const preset = getPresetById(presetId);
    if (!preset) {
      console.warn(`[OCIO] Unknown preset ID: "${presetId}"`);
      return;
    }
    this.processor.setState({ ...preset.state, enabled: true });
  }

  // ==========================================================================
  // State Persistence
  // ==========================================================================

  /**
   * Load OCIO state from localStorage
   */
  private loadState(): void {
    const raw = this.preferences.getJSON<any>(STORAGE_KEY);
    if (typeof raw !== 'object' || raw === null) return;

    // Only apply known, correctly-typed properties
    const safe: Partial<OCIOState> = {};
    if (typeof raw.enabled === 'boolean') safe.enabled = raw.enabled;
    if (typeof raw.configName === 'string') safe.configName = raw.configName;
    if (typeof raw.inputColorSpace === 'string') safe.inputColorSpace = raw.inputColorSpace;
    if (typeof raw.workingColorSpace === 'string') safe.workingColorSpace = raw.workingColorSpace;
    if (typeof raw.display === 'string') safe.display = raw.display;
    if (typeof raw.view === 'string') safe.view = raw.view;
    if (typeof raw.look === 'string') safe.look = raw.look;
    if (raw.lookDirection === 'forward' || raw.lookDirection === 'inverse') safe.lookDirection = raw.lookDirection;

    if (Object.keys(safe).length > 0) {
      this.processor.setState(safe);
    }
  }

  /**
   * Save OCIO state to localStorage
   */
  private saveState(): void {
    const state = this.processor.getState();
    this.preferences.setJSON(STORAGE_KEY, state);
  }

  // ==========================================================================
  // Per-Source Color Space Persistence
  // ==========================================================================

  /**
   * Load per-source color space mappings from localStorage.
   * Validates each entry before loading into the processor.
   */
  private loadPerSourceState(): void {
    const raw = this.preferences.getJSON<any>(PER_SOURCE_STORAGE_KEY);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return;

    // Validate: only accept string-to-string mappings
    const validated: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof key === 'string' && typeof value === 'string') {
        validated[key] = value;
      }
    }

    if (Object.keys(validated).length > 0) {
      this.processor.loadPerSourceColorSpaces(validated);
    }
  }

  /**
   * Save per-source color space mappings to localStorage.
   */
  private savePerSourceState(): void {
    const mappings = this.processor.getAllPerSourceColorSpaces();
    this.preferences.setJSON(PER_SOURCE_STORAGE_KEY, mappings);
  }

  /**
   * Schedule a debounced save of per-source color space state.
   */
  private schedulePerSourceSave(): void {
    if (this._perSourceSaveTimer !== null) {
      clearTimeout(this._perSourceSaveTimer);
    }
    this._perSourceSaveTimer = setTimeout(() => {
      this._perSourceSaveTimer = null;
      this.savePerSourceState();
    }, PER_SOURCE_SAVE_DEBOUNCE_MS);
  }

  /**
   * Immediately flush any pending per-source save.
   * Useful for tests or shutdown.
   */
  flushPerSourceSave(): void {
    if (this._perSourceSaveTimer !== null) {
      clearTimeout(this._perSourceSaveTimer);
      this._perSourceSaveTimer = null;
      this.savePerSourceState();
    }
  }
}
