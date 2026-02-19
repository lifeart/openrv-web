/**
 * Shot Status Tracking for review workflows.
 *
 * Tracks per-source status (approved, needs-work, cbb, omit, pending).
 * Status shows in playlist panel and exports in reports.
 */

/**
 * Status values for shots in a review session
 */
export type ShotStatus = 'pending' | 'approved' | 'needs-work' | 'cbb' | 'omit';

/**
 * A status entry for a single source
 */
export interface StatusEntry {
  sourceIndex: number;
  status: ShotStatus;
  setBy: string;       // Author who set the status
  setAt: string;       // ISO 8601 timestamp
}

/**
 * Color mapping for each status (for UI badges and GTO export)
 */
export const STATUS_COLORS: Record<ShotStatus, string> = {
  pending: '#94a3b8',     // slate-400
  approved: '#22c55e',    // green-500
  'needs-work': '#f97316', // orange-500
  cbb: '#eab308',         // yellow-500
  omit: '#ef4444',        // red-500
};

/**
 * All valid status values
 */
export const VALID_STATUSES: ShotStatus[] = ['pending', 'approved', 'needs-work', 'cbb', 'omit'];

/**
 * Callback interface for StatusManager to notify Session of changes
 * without importing Session (avoids circular deps).
 */
export interface StatusManagerCallbacks {
  onStatusChanged(sourceIndex: number, status: ShotStatus, previous: ShotStatus): void;
  onStatusesChanged(): void;
}

/**
 * StatusManager owns per-source review status state:
 * - Setting and getting status per source
 * - Clearing status (revert to pending)
 * - Status counts for summary display
 * - Serialization for save/load
 *
 * Sources without an explicit status entry are implicitly 'pending'.
 * State is owned by this manager. Session delegates to it.
 */
export class StatusManager {
  private _statuses = new Map<number, StatusEntry>();
  private _callbacks: StatusManagerCallbacks | null = null;

  /**
   * Set the callbacks object. Called once by Session after construction.
   */
  setCallbacks(callbacks: StatusManagerCallbacks): void {
    this._callbacks = callbacks;
  }

  private notifyChange(): void {
    this._callbacks?.onStatusesChanged();
  }

  // ---- CRUD ----

  /**
   * Set or update the status for a source.
   * Returns the created/updated status entry.
   */
  setStatus(sourceIndex: number, status: ShotStatus, author: string): StatusEntry {
    const previous = this.getStatus(sourceIndex);
    const entry: StatusEntry = {
      sourceIndex,
      status,
      setBy: author,
      setAt: new Date().toISOString(),
    };
    this._statuses.set(sourceIndex, entry);

    this._callbacks?.onStatusChanged(sourceIndex, status, previous);
    this.notifyChange();
    return { ...entry };
  }

  /**
   * Get the status for a source. Returns 'pending' if not explicitly set.
   */
  getStatus(sourceIndex: number): ShotStatus {
    return this._statuses.get(sourceIndex)?.status ?? 'pending';
  }

  /**
   * Get the full status entry for a source (includes author, timestamp).
   * Returns undefined if not explicitly set.
   */
  getStatusEntry(sourceIndex: number): StatusEntry | undefined {
    const entry = this._statuses.get(sourceIndex);
    return entry ? { ...entry } : undefined;
  }

  /**
   * Clear the status for a source (revert to implicit 'pending').
   * Returns true if a status was explicitly set and has been removed.
   */
  clearStatus(sourceIndex: number): boolean {
    if (!this._statuses.has(sourceIndex)) return false;
    const previous = this.getStatus(sourceIndex);
    this._statuses.delete(sourceIndex);

    this._callbacks?.onStatusChanged(sourceIndex, 'pending', previous);
    this.notifyChange();
    return true;
  }

  // ---- Queries ----

  /**
   * Get status counts across all sources.
   * If totalSources is provided, unset sources are counted as 'pending'.
   */
  getStatusCounts(totalSources?: number): Record<ShotStatus, number> {
    const counts: Record<ShotStatus, number> = {
      pending: 0,
      approved: 0,
      'needs-work': 0,
      cbb: 0,
      omit: 0,
    };

    for (const entry of this._statuses.values()) {
      counts[entry.status]++;
    }

    // Count implicit pending sources
    if (totalSources !== undefined) {
      const explicitCount = this._statuses.size;
      counts.pending += Math.max(0, totalSources - explicitCount);
    }

    return counts;
  }

  /**
   * Get all explicitly set status entries
   */
  getAllStatuses(): StatusEntry[] {
    return Array.from(this._statuses.values()).map(e => ({ ...e }));
  }

  /**
   * Get the color for a given status
   */
  getStatusColor(status: ShotStatus): string {
    return STATUS_COLORS[status];
  }

  // ---- Serialization ----

  /**
   * Produce a JSON-safe array of all status entries (for save/export)
   */
  toSerializable(): StatusEntry[] {
    return Array.from(this._statuses.values()).map(e => ({ ...e }));
  }

  /**
   * Restore statuses from a serialized array (for load/import)
   */
  fromSerializable(entries: StatusEntry[]): void {
    this._statuses.clear();
    for (const entry of entries) {
      this._statuses.set(entry.sourceIndex, { ...entry });
    }
    this.notifyChange();
  }

  dispose(): void {
    this._statuses.clear();
    this._callbacks = null;
  }
}
