/**
 * ViewHistory - Navigation stack for view node history
 *
 * Maintains a bounded stack of previously viewed nodes, enabling
 * back/forward navigation through the session graph. Only stores
 * nodeId and timestamp -- node names are resolved at display time
 * from the live graph to avoid stale names after renames.
 */

export interface ViewHistoryEntry {
  nodeId: string;
  timestamp: number;
}

export class ViewHistory {
  private entries: ViewHistoryEntry[] = [];
  private index = -1;
  private maxSize: number;

  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  /**
   * Push a new entry onto the history stack.
   * Truncates any forward history beyond the current position.
   * If the stack exceeds maxSize, the oldest entry is removed.
   */
  push(entry: ViewHistoryEntry): void {
    // If we have forward history, truncate it
    if (this.index < this.entries.length - 1) {
      this.entries = this.entries.slice(0, this.index + 1);
    }

    // Don't push duplicates of the current entry
    if (this.entries.length > 0 && this.entries[this.index]?.nodeId === entry.nodeId) {
      return;
    }

    this.entries.push(entry);

    // Trim oldest entries if we exceed maxSize
    if (this.entries.length > this.maxSize) {
      this.entries = this.entries.slice(this.entries.length - this.maxSize);
    }

    this.index = this.entries.length - 1;
  }

  /**
   * Navigate backward in history. Returns the previous entry, or null
   * if already at the beginning.
   */
  back(): ViewHistoryEntry | null {
    if (!this.canGoBack) {
      return null;
    }
    this.index--;
    return this.entries[this.index] ?? null;
  }

  /**
   * Navigate forward in history. Returns the next entry, or null
   * if already at the end.
   */
  forward(): ViewHistoryEntry | null {
    if (!this.canGoForward) {
      return null;
    }
    this.index++;
    return this.entries[this.index] ?? null;
  }

  /**
   * Returns the current history entry, or null if empty.
   */
  current(): ViewHistoryEntry | null {
    if (this.index < 0 || this.index >= this.entries.length) {
      return null;
    }
    return this.entries[this.index] ?? null;
  }

  get canGoBack(): boolean {
    return this.index > 0;
  }

  get canGoForward(): boolean {
    return this.index < this.entries.length - 1;
  }

  /**
   * Clear all history entries and reset the index.
   */
  clear(): void {
    this.entries = [];
    this.index = -1;
  }

  /**
   * Get the number of entries in the history.
   */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Serialize history for persistence.
   */
  toJSON(): ViewHistoryEntry[] {
    return [...this.entries];
  }

  /**
   * Restore history from serialized data.
   * Sets the index to the last entry.
   */
  fromJSON(entries: ViewHistoryEntry[]): void {
    this.entries = [...entries];
    this.index = this.entries.length - 1;
  }

  /**
   * Remove all entries referencing a specific node ID.
   * Adjusts the index to remain valid after removal.
   */
  removeNodeEntries(nodeId: string): void {
    const currentEntry = this.current();
    this.entries = this.entries.filter((e) => e.nodeId !== nodeId);
    if (this.entries.length === 0) {
      this.index = -1;
    } else if (currentEntry && currentEntry.nodeId === nodeId) {
      // Current entry was removed; clamp index
      this.index = Math.min(this.index, this.entries.length - 1);
    } else if (currentEntry) {
      // Recalculate index based on the current entry's position
      const newIndex = this.entries.findIndex(
        (e) => e.nodeId === currentEntry.nodeId && e.timestamp === currentEntry.timestamp,
      );
      this.index = newIndex >= 0 ? newIndex : Math.min(this.index, this.entries.length - 1);
    }
  }
}
