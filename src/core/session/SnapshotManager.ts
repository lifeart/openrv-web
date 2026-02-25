/**
 * Snapshot Manager
 *
 * Manages named session version snapshots with IndexedDB persistence.
 * Supports manual snapshots, auto-checkpoints, preview, and restore.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import type { SessionState } from './SessionState';
import { SESSION_STATE_VERSION } from './SessionState';

/** Snapshot metadata */
export interface Snapshot {
  /** Unique ID */
  id: string;
  /** User-provided name */
  name: string;
  /** Optional description */
  description?: string;
  /** Timestamp when created */
  createdAt: string;
  /** Whether this is an auto-checkpoint (not user-created) */
  isAutoCheckpoint: boolean;
  /** Event that triggered auto-checkpoint */
  autoCheckpointEvent?: string;
  /** Session state version */
  version: number;
  /** Size in bytes */
  size: number;
  /** Quick preview of key settings */
  preview?: SnapshotPreview;
}

/** Quick preview of snapshot state */
export interface SnapshotPreview {
  frameCount: number;
  currentFrame: number;
  annotationCount: number;
  hasColorGrade: boolean;
  sourceName?: string;
}

/** Events emitted by SnapshotManager */
export interface SnapshotManagerEvents extends EventMap {
  /** Emitted when snapshot is created */
  snapshotCreated: { snapshot: Snapshot };
  /** Emitted when snapshot is restored */
  snapshotRestored: { snapshot: Snapshot };
  /** Emitted when snapshot is deleted */
  snapshotDeleted: { id: string };
  /** Emitted when snapshot is renamed */
  snapshotRenamed: { id: string; name: string };
  /** Emitted when snapshot list changes */
  snapshotsChanged: { snapshots: Snapshot[] };
  /** Emitted on error */
  error: { error: Error };
}

/** IndexedDB database name */
const DB_NAME = 'openrv-web-snapshots';
/** IndexedDB object store name */
const STORE_NAME = 'snapshots';
/** Maximum manual snapshots */
const MAX_MANUAL_SNAPSHOTS = 50;
/** Maximum auto-checkpoints */
const MAX_AUTO_CHECKPOINTS = 10;

/**
 * SnapshotManager handles session version history
 */
export class SnapshotManager extends EventEmitter<SnapshotManagerEvents> {
  private db: IDBDatabase | null = null;
  private isInitialized = false;

  constructor() {
    super();
  }

  /**
   * Initialize the snapshot system
   */
  async initialize(): Promise<void> {
    try {
      await this.openDatabase();
      this.isInitialized = true;
    } catch (err) {
      console.error('SnapshotManager initialization failed:', err);
      throw err;
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

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('isAutoCheckpoint', 'isAutoCheckpoint', { unique: false });
        }
      };
    });
  }

  /**
   * Create a manual snapshot
   */
  async createSnapshot(
    name: string,
    state: SessionState,
    description?: string
  ): Promise<Snapshot> {
    if (!this.db || !this.isInitialized) {
      throw new Error('SnapshotManager not initialized');
    }

    // Serialize once and measure size in bytes
    const stateJson = JSON.stringify(state);
    const sizeBytes = new TextEncoder().encode(stateJson).length;

    const now = new Date();
    const snapshot: Snapshot = {
      id: `snapshot-${now.getTime()}`,
      name: name || `Snapshot ${now.toLocaleTimeString()}`,
      description,
      createdAt: now.toISOString(),
      isAutoCheckpoint: false,
      version: SESSION_STATE_VERSION,
      size: sizeBytes,
      preview: this.createPreview(state),
    };

    // Save to IndexedDB
    await this.putSnapshot(snapshot, state);

    // Prune old manual snapshots
    await this.pruneSnapshots(false, MAX_MANUAL_SNAPSHOTS);

    this.emit('snapshotCreated', { snapshot });
    this.notifySnapshotsChanged();

    return snapshot;
  }

  /**
   * Create an auto-checkpoint before a major operation
   */
  async createAutoCheckpoint(
    event: string,
    state: SessionState
  ): Promise<Snapshot> {
    if (!this.db || !this.isInitialized) {
      throw new Error('SnapshotManager not initialized');
    }

    // Serialize once and measure size in bytes
    const stateJson = JSON.stringify(state);
    const sizeBytes = new TextEncoder().encode(stateJson).length;

    const now = new Date();
    const snapshot: Snapshot = {
      id: `checkpoint-${now.getTime()}`,
      name: `Auto: ${event}`,
      createdAt: now.toISOString(),
      isAutoCheckpoint: true,
      autoCheckpointEvent: event,
      version: SESSION_STATE_VERSION,
      size: sizeBytes,
      preview: this.createPreview(state),
    };

    // Save to IndexedDB
    await this.putSnapshot(snapshot, state);

    // Prune old auto-checkpoints
    await this.pruneSnapshots(true, MAX_AUTO_CHECKPOINTS);

    this.emit('snapshotCreated', { snapshot });
    this.notifySnapshotsChanged();

    return snapshot;
  }

  /**
   * Create preview data from state
   */
  private createPreview(state: SessionState): SnapshotPreview {
    let annotationCount = 0;
    if (state.paint?.frames) {
      for (const frameAnnotations of Object.values(state.paint.frames)) {
        annotationCount += frameAnnotations.length;
      }
    }

    const hasColorGrade =
      state.color?.brightness !== 0 ||
      state.color?.contrast !== 0 ||
      state.color?.saturation !== 0 ||
      state.color?.exposure !== 0 ||
      state.color?.gamma !== 1 ||
      (state.cdl?.slope && (state.cdl.slope.r !== 1 || state.cdl.slope.g !== 1 || state.cdl.slope.b !== 1)) ||
      (state.cdl?.offset && (state.cdl.offset.r !== 0 || state.cdl.offset.g !== 0 || state.cdl.offset.b !== 0)) ||
      (state.cdl?.power && (state.cdl.power.r !== 1 || state.cdl.power.g !== 1 || state.cdl.power.b !== 1));

    return {
      frameCount: state.playback?.outPoint ?? 1,
      currentFrame: state.playback?.currentFrame ?? 1,
      annotationCount,
      hasColorGrade: !!hasColorGrade,
      sourceName: state.media?.[0]?.name,
    };
  }

  /**
   * Put a snapshot in the database
   */
  private putSnapshot(snapshot: Snapshot, state: SessionState): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put({ ...snapshot, state });

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
   * Prune old snapshots beyond limit
   */
  private async pruneSnapshots(isAutoCheckpoint: boolean, maxCount: number): Promise<void> {
    const snapshots = await this.listSnapshots();
    const filtered = snapshots.filter(s => s.isAutoCheckpoint === isAutoCheckpoint);

    if (filtered.length > maxCount) {
      // Sort by date, oldest first
      filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      // Delete oldest
      const toDelete = filtered.slice(0, filtered.length - maxCount);
      for (const snapshot of toDelete) {
        await this.deleteSnapshot(snapshot.id);
      }
    }
  }

  /**
   * List all snapshots (metadata only, using cursor to avoid loading full state into memory)
   */
  async listSnapshots(): Promise<Snapshot[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const snapshots: Snapshot[] = [];

      // Use cursor to iterate without loading all states into memory
      const cursorRequest = store.openCursor();

      tx.onerror = () => {
        reject(new Error(`Transaction error: ${tx.error?.message || 'Unknown error'}`));
      };
      tx.onabort = () => {
        reject(new Error(`Transaction aborted: ${tx.error?.message || 'Unknown reason'}`));
      };

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          // Extract only metadata fields, skip the state
          const record = cursor.value as Snapshot & { state: SessionState };
          const { state: _state, ...metadata } = record;
          snapshots.push(metadata);
          cursor.continue();
        } else {
          // Cursor exhausted, sort by date newest first and resolve
          snapshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          resolve(snapshots);
        }
      };

      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
  }

  /**
   * Get a snapshot with full state
   */
  async getSnapshot(id: string): Promise<SessionState | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      tx.onerror = () => {
        reject(new Error(`Transaction error: ${tx.error?.message || 'Unknown error'}`));
      };
      tx.onabort = () => {
        reject(new Error(`Transaction aborted: ${tx.error?.message || 'Unknown reason'}`));
      };

      request.onsuccess = () => {
        const result = request.result as (Snapshot & { state: SessionState }) | undefined;
        resolve(result?.state ?? null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get snapshot metadata by ID
   */
  async getSnapshotMetadata(id: string): Promise<Snapshot | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      tx.onerror = () => {
        reject(new Error(`Transaction error: ${tx.error?.message || 'Unknown error'}`));
      };

      request.onsuccess = () => {
        const result = request.result as (Snapshot & { state: SessionState }) | undefined;
        if (result) {
          const { state: _state, ...metadata } = result;
          resolve(metadata);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(id: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      tx.onerror = () => {
        reject(new Error(`Transaction error: ${tx.error?.message || 'Unknown error'}`));
      };
      tx.onabort = () => {
        reject(new Error(`Transaction aborted: ${tx.error?.message || 'Unknown reason'}`));
      };

      request.onsuccess = () => {
        this.emit('snapshotDeleted', { id });
        this.notifySnapshotsChanged();
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Rename a snapshot
   */
  async renameSnapshot(id: string, name: string): Promise<void> {
    if (!this.db) return;

    const state = await this.getSnapshot(id);
    const metadata = await this.getSnapshotMetadata(id);
    if (!state || !metadata) {
      throw new Error(`Snapshot not found: ${id}`);
    }

    metadata.name = name;
    await this.putSnapshot(metadata, state);

    this.emit('snapshotRenamed', { id, name });
    this.notifySnapshotsChanged();
  }

  /**
   * Update snapshot description
   */
  async updateDescription(id: string, description: string): Promise<void> {
    if (!this.db) return;

    const state = await this.getSnapshot(id);
    const metadata = await this.getSnapshotMetadata(id);
    if (!state || !metadata) {
      throw new Error(`Snapshot not found: ${id}`);
    }

    metadata.description = description;
    await this.putSnapshot(metadata, state);

    this.notifySnapshotsChanged();
  }

  /**
   * Clear all snapshots
   */
  async clearAll(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      tx.onerror = () => {
        reject(new Error(`Transaction error: ${tx.error?.message || 'Unknown error'}`));
      };
      tx.onabort = () => {
        reject(new Error(`Transaction aborted: ${tx.error?.message || 'Unknown reason'}`));
      };

      request.onsuccess = () => {
        this.notifySnapshotsChanged();
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Export snapshot as JSON
   */
  async exportSnapshot(id: string): Promise<string | null> {
    const state = await this.getSnapshot(id);
    const metadata = await this.getSnapshotMetadata(id);
    if (!state || !metadata) return null;

    return JSON.stringify({
      metadata,
      state,
    }, null, 2);
  }

  /**
   * Validate snapshot data structure
   */
  private validateSnapshotData(data: unknown): data is { metadata: Snapshot; state: SessionState } {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const obj = data as Record<string, unknown>;

    // Validate metadata exists and has required fields
    if (!obj.metadata || typeof obj.metadata !== 'object') {
      return false;
    }

    const metadata = obj.metadata as Record<string, unknown>;
    if (typeof metadata.name !== 'string') {
      return false;
    }
    if (typeof metadata.version !== 'number') {
      return false;
    }

    // Validate state exists
    if (!obj.state || typeof obj.state !== 'object') {
      return false;
    }

    // Validate state has expected structure
    const state = obj.state as Record<string, unknown>;
    if (typeof state.version !== 'number') {
      return false;
    }

    return true;
  }

  /**
   * Import snapshot from JSON
   */
  async importSnapshot(json: string): Promise<Snapshot> {
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      throw new Error('Invalid JSON format');
    }

    if (!this.validateSnapshotData(data)) {
      throw new Error('Invalid snapshot format: missing or invalid metadata/state');
    }

    // Check version compatibility
    if (data.metadata.version > SESSION_STATE_VERSION) {
      throw new Error(
        `Snapshot version ${data.metadata.version} is newer than supported version ${SESSION_STATE_VERSION}`
      );
    }

    // Generate new ID to avoid conflicts
    const now = new Date();
    const snapshot: Snapshot = {
      ...data.metadata,
      id: `imported-${now.getTime()}`,
      createdAt: now.toISOString(),
    };

    await this.putSnapshot(snapshot, data.state);
    this.emit('snapshotCreated', { snapshot });
    this.notifySnapshotsChanged();

    return snapshot;
  }

  /**
   * Notify listeners that snapshots list changed
   */
  private async notifySnapshotsChanged(): Promise<void> {
    try {
      const snapshots = await this.listSnapshots();
      this.emit('snapshotsChanged', { snapshots });
    } catch (err) {
      console.error('Failed to notify snapshots changed:', err);
    }
  }

  /**
   * Dispose of the manager
   */
  dispose(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.isInitialized = false;
  }
}
