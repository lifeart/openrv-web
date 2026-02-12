/**
 * Auto-Save Manager
 *
 * Automatically saves session state at regular intervals to IndexedDB
 * to prevent data loss. Includes recovery detection on startup.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import type { SessionState } from './SessionState';
import { SESSION_STATE_VERSION } from './SessionState';
import { Logger } from '../../utils/Logger';

const log = new Logger('AutoSaveManager');

/** Auto-save configuration */
export interface AutoSaveConfig {
  /** Auto-save interval in minutes (1-30) */
  interval: number;
  /** Whether auto-save is enabled */
  enabled: boolean;
  /** Maximum number of auto-save versions to keep */
  maxVersions: number;
}

/** Auto-save metadata */
export interface AutoSaveEntry {
  /** Unique ID for this auto-save */
  id: string;
  /** Session name */
  name: string;
  /** Timestamp when saved */
  savedAt: string;
  /** Whether this was a clean save or crash recovery */
  cleanShutdown: boolean;
  /** Session state version */
  version: number;
  /** Size in bytes */
  size: number;
}

/** Storage quota information */
export interface StorageQuotaInfo {
  /** Used storage in bytes */
  used: number;
  /** Available storage quota in bytes */
  quota: number;
  /** Percentage of quota used */
  percentUsed: number;
}

/** Events emitted by AutoSaveManager */
export interface AutoSaveEvents extends EventMap {
  /** Emitted when save starts */
  saving: undefined;
  /** Emitted when save completes */
  saved: { entry: AutoSaveEntry };
  /** Emitted when save fails */
  error: { error: Error };
  /** Emitted when recovery data is found */
  recoveryAvailable: { entries: AutoSaveEntry[] };
  /** Emitted when config changes */
  configChanged: AutoSaveConfig;
  /** Emitted when storage quota is low (>80% used) */
  storageWarning: StorageQuotaInfo;
}

/** IndexedDB database name */
const DB_NAME = 'openrv-web-autosave';
/** IndexedDB object store name */
const STORE_NAME = 'sessions';
/** Metadata store name */
const META_STORE_NAME = 'metadata';
/** Key for shutdown flag */
const SHUTDOWN_KEY = 'cleanShutdown';
/** Storage warning threshold (percentage) */
const STORAGE_WARNING_THRESHOLD = 80;

/** Default configuration */
export const DEFAULT_AUTO_SAVE_CONFIG: AutoSaveConfig = {
  interval: 5, // 5 minutes
  enabled: true,
  maxVersions: 10,
};

/**
 * AutoSaveManager handles automatic session persistence
 */
export class AutoSaveManager extends EventEmitter<AutoSaveEvents> {
  private db: IDBDatabase | null = null;
  private config: AutoSaveConfig;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSaveTime: Date | null = null;
  private isDirty = false;
  private isInitialized = false;
  private stateGetter: (() => SessionState) | null = null;
  private isSaving = false;
  private isDisposing = false;

  constructor(config: Partial<AutoSaveConfig> = {}) {
    super();
    this.config = { ...DEFAULT_AUTO_SAVE_CONFIG, ...config };
  }

  /**
   * Initialize the auto-save system
   * Returns true if recovery data is available
   */
  async initialize(): Promise<boolean> {
    try {
      await this.openDatabase();
      this.isInitialized = true;

      // Check for crash recovery
      const wasCleanShutdown = await this.checkCleanShutdown();
      if (!wasCleanShutdown) {
        const entries = await this.listAutoSaves();
        if (entries.length > 0) {
          this.emit('recoveryAvailable', { entries });
          return true;
        }
      }

      // Mark as active session (not clean shutdown until dispose)
      await this.setCleanShutdown(false);

      // Start auto-save timer if enabled
      if (this.config.enabled) {
        this.startTimer();
      }

      // Listen for beforeunload to mark clean shutdown
      window.addEventListener('beforeunload', this.handleBeforeUnload);

      return false;
    } catch (err) {
      console.error('AutoSaveManager initialization failed:', err);
      return false;
    }
  }

  /**
   * Open or create the IndexedDB database
   */
  private openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create sessions store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        }

        // Create metadata store
        if (!db.objectStoreNames.contains(META_STORE_NAME)) {
          db.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Check if the last session had a clean shutdown
   */
  private async checkCleanShutdown(): Promise<boolean> {
    if (!this.db) return true;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(META_STORE_NAME, 'readonly');
      const store = tx.objectStore(META_STORE_NAME);
      const request = store.get(SHUTDOWN_KEY);

      request.onsuccess = () => {
        const result = request.result as { key: string; value: boolean } | undefined;
        resolve(result?.value ?? true);
      };

      request.onerror = () => {
        resolve(true); // Assume clean if we can't read
      };
    });
  }

  /**
   * Set the clean shutdown flag
   */
  private async setCleanShutdown(clean: boolean): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(META_STORE_NAME, 'readwrite');
      const store = tx.objectStore(META_STORE_NAME);
      const request = store.put({ key: SHUTDOWN_KEY, value: clean });

      // Handle transaction-level errors
      tx.onerror = () => {
        reject(new Error(`Transaction error: ${tx.error?.message || 'Unknown error'}`));
      };
      tx.onabort = () => {
        reject(new Error(`Transaction aborted: ${tx.error?.message || 'Unknown reason'}`));
      };

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Start the auto-save timer
   */
  private startTimer(): void {
    this.stopTimer();
    const intervalMs = this.config.interval * 60 * 1000;
    this.saveTimer = setInterval(() => {
      if (this.isDirty && this.stateGetter) {
        this.saveWithGetter();
      }
    }, intervalMs);
  }

  /**
   * Execute save using the stored state getter
   */
  private saveWithGetter(): void {
    if (!this.stateGetter) return;
    try {
      const state = this.stateGetter();
      this.save(state);
    } catch (err) {
      console.error('Failed to get state for auto-save:', err);
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', { error });
    }
  }

  /**
   * Stop the auto-save timer
   */
  private stopTimer(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /**
   * Handle beforeunload event - mark clean shutdown
   */
  private handleBeforeUnload = (): void => {
    // Use sync IndexedDB call for beforeunload
    // Note: This may not complete in all browsers
    try {
      if (this.db) {
        const tx = this.db.transaction(META_STORE_NAME, 'readwrite');
        const store = tx.objectStore(META_STORE_NAME);
        store.put({ key: SHUTDOWN_KEY, value: true });
      }
    } catch {
      // Ignore errors during unload
    }
  };

  /**
   * Mark session as dirty (needs save)
   * Call this whenever session state changes
   * @param stateGetter - A function that returns the current state (lazy evaluation)
   */
  markDirty(stateGetter: () => SessionState): void {
    this.isDirty = true;
    this.stateGetter = stateGetter;

    // Debounce: if multiple changes happen rapidly, only save once after 2s of inactivity
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      if (this.isDirty && this.stateGetter) {
        this.saveWithGetter();
      }
      this.debounceTimer = null;
    }, 2000);
  }

  /**
   * Save session state to IndexedDB
   */
  async save(state: SessionState): Promise<AutoSaveEntry | null> {
    if (!this.db || !this.isInitialized || this.isDisposing) {
      return null;
    }

    // Prevent concurrent saves
    if (this.isSaving) {
      return null;
    }

    this.isSaving = true;
    this.emit('saving', undefined);

    try {
      const now = new Date();
      const entry: AutoSaveEntry = {
        id: `autosave-${now.getTime()}`,
        name: state.name || 'Untitled',
        savedAt: now.toISOString(),
        cleanShutdown: false,
        version: SESSION_STATE_VERSION,
        size: 0,
      };

      // Serialize state
      const stateJson = JSON.stringify(state);
      entry.size = stateJson.length;

      // Save to IndexedDB
      await this.putSession({
        ...entry,
        state,
      });

      // Clean up old versions
      await this.pruneOldVersions();

      this.isDirty = false;
      this.lastSaveTime = now;
      this.emit('saved', { entry });

      // Check storage quota and warn if low (async, non-blocking)
      this.checkStorageQuota().catch((err) => {
        log.debug('Storage quota check failed', err);
      });

      return entry;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', { error });
      return null;
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Put a session in the database
   */
  private putSession(data: AutoSaveEntry & { state: SessionState }): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(data);

      // Handle transaction-level errors
      tx.onerror = () => {
        reject(new Error(`Transaction error: ${tx.error?.message || 'Unknown error'}`));
      };
      tx.onabort = () => {
        reject(new Error(`Transaction aborted: ${tx.error?.message || 'Unknown reason'}`));
      };

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Remove old auto-save versions beyond maxVersions
   */
  private async pruneOldVersions(): Promise<void> {
    const entries = await this.listAutoSaves();

    if (entries.length > this.config.maxVersions) {
      // Sort by date, oldest first
      entries.sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime());

      // Delete oldest entries
      const toDelete = entries.slice(0, entries.length - this.config.maxVersions);
      for (const entry of toDelete) {
        await this.deleteAutoSave(entry.id);
      }
    }
  }

  /**
   * List all auto-save entries
   */
  async listAutoSaves(): Promise<AutoSaveEntry[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      // Handle transaction-level errors
      tx.onerror = () => {
        reject(new Error(`Transaction error: ${tx.error?.message || 'Unknown error'}`));
      };
      tx.onabort = () => {
        reject(new Error(`Transaction aborted: ${tx.error?.message || 'Unknown reason'}`));
      };

      request.onsuccess = () => {
        const results = request.result as Array<AutoSaveEntry & { state: SessionState }>;
        // Return only metadata, not the full state
        const entries = results.map(({ state: _state, ...entry }) => entry);
        // Sort by date, newest first
        entries.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
        resolve(entries);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a specific auto-save entry with full state
   */
  async getAutoSave(id: string): Promise<SessionState | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      // Handle transaction-level errors
      tx.onerror = () => {
        reject(new Error(`Transaction error: ${tx.error?.message || 'Unknown error'}`));
      };
      tx.onabort = () => {
        reject(new Error(`Transaction aborted: ${tx.error?.message || 'Unknown reason'}`));
      };

      request.onsuccess = () => {
        const result = request.result as (AutoSaveEntry & { state: SessionState }) | undefined;
        resolve(result?.state ?? null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a specific auto-save entry
   */
  async deleteAutoSave(id: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      // Handle transaction-level errors
      tx.onerror = () => {
        reject(new Error(`Transaction error: ${tx.error?.message || 'Unknown error'}`));
      };
      tx.onabort = () => {
        reject(new Error(`Transaction aborted: ${tx.error?.message || 'Unknown reason'}`));
      };

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all auto-save data
   */
  async clearAll(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      // Handle transaction-level errors
      tx.onerror = () => {
        reject(new Error(`Transaction error: ${tx.error?.message || 'Unknown error'}`));
      };
      tx.onabort = () => {
        reject(new Error(`Transaction aborted: ${tx.error?.message || 'Unknown reason'}`));
      };

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get the most recent auto-save entry
   */
  async getMostRecent(): Promise<SessionState | null> {
    const entries = await this.listAutoSaves();
    const mostRecent = entries[0];
    if (!mostRecent) return null;
    return this.getAutoSave(mostRecent.id);
  }

  /**
   * Check storage quota and emit warning if low
   * Returns quota info or null if not available
   */
  async checkStorageQuota(): Promise<StorageQuotaInfo | null> {
    if (!navigator.storage?.estimate) {
      return null;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;
      const percentUsed = quota > 0 ? (used / quota) * 100 : 0;

      const info: StorageQuotaInfo = {
        used,
        quota,
        percentUsed: Math.round(percentUsed * 10) / 10,
      };

      // Emit warning if storage is low
      if (percentUsed >= STORAGE_WARNING_THRESHOLD) {
        this.emit('storageWarning', info);
      }

      return info;
    } catch {
      // Storage API not available or failed
      return null;
    }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<AutoSaveConfig>): void {
    const prevEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // Clamp interval to valid range
    this.config.interval = Math.max(1, Math.min(30, this.config.interval));
    this.config.maxVersions = Math.max(1, Math.min(100, this.config.maxVersions));

    // Handle enable/disable
    if (this.config.enabled && !prevEnabled) {
      this.startTimer();
    } else if (!this.config.enabled && prevEnabled) {
      this.stopTimer();
    } else if (this.config.enabled) {
      // Restart timer with new interval
      this.startTimer();
    }

    this.emit('configChanged', { ...this.config });
  }

  /**
   * Get current configuration
   */
  getConfig(): AutoSaveConfig {
    return { ...this.config };
  }

  /**
   * Get the last save time
   */
  getLastSaveTime(): Date | null {
    return this.lastSaveTime;
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.isDirty;
  }

  /**
   * Force an immediate save
   */
  async saveNow(state: SessionState): Promise<AutoSaveEntry | null> {
    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    return this.save(state);
  }

  /**
   * Dispose of the manager
   */
  async dispose(): Promise<void> {
    // Prevent new saves from starting
    this.isDisposing = true;

    // Stop timers
    this.stopTimer();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Remove event listener
    window.removeEventListener('beforeunload', this.handleBeforeUnload);

    // Wait briefly for any in-progress save to complete
    if (this.isSaving) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Mark clean shutdown (only if db is still valid)
    if (this.db && !this.isSaving) {
      try {
        await this.setCleanShutdown(true);
      } catch {
        // Ignore errors during cleanup
      }
    }

    // Close database
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.isInitialized = false;
    this.isDisposing = false;
  }
}
