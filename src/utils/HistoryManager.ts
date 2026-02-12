/**
 * HistoryManager - Centralized undo/redo history tracking
 *
 * Provides a unified history panel that shows all actions with descriptions
 * and allows jumping to any previous state.
 */

import { EventEmitter, EventMap } from './EventEmitter';
import { getIconSvg } from '../ui/components/shared/Icons';
import type { ManagerBase } from '../core/ManagerBase';

export interface HistoryEntry {
  id: number;
  description: string;
  category: 'color' | 'paint' | 'transform' | 'view' | 'session';
  timestamp: number;
  // Function to restore this state
  restore: () => void;
  // Function to redo from this state
  redo?: () => void;
}

export interface HistoryEvents extends EventMap {
  historyChanged: HistoryEntry[];
  currentIndexChanged: number;
}

export interface HistoryState {
  entries: HistoryEntry[];
  currentIndex: number;
  canUndo: boolean;
  canRedo: boolean;
}

const MAX_HISTORY_LENGTH = 100;

export class HistoryManager extends EventEmitter<HistoryEvents> implements ManagerBase {
  private entries: HistoryEntry[] = [];
  private currentIndex = -1; // -1 means at initial state (no history)
  private nextId = 0;
  private maxLength = MAX_HISTORY_LENGTH;

  constructor(maxLength = MAX_HISTORY_LENGTH) {
    super();
    this.maxLength = maxLength;
  }

  /**
   * Record a new action in history
   */
  recordAction(
    description: string,
    category: HistoryEntry['category'],
    restore: () => void,
    redo?: () => void
  ): HistoryEntry {
    // If we're not at the end of history, remove future entries
    if (this.currentIndex < this.entries.length - 1) {
      this.entries = this.entries.slice(0, this.currentIndex + 1);
    }

    const entry: HistoryEntry = {
      id: this.nextId++,
      description,
      category,
      timestamp: Date.now(),
      restore,
      redo,
    };

    this.entries.push(entry);
    this.currentIndex = this.entries.length - 1;

    // Trim history if it exceeds max length
    if (this.entries.length > this.maxLength) {
      const removeCount = this.entries.length - this.maxLength;
      this.entries = this.entries.slice(removeCount);
      this.currentIndex = Math.max(0, this.currentIndex - removeCount);
    }

    this.emit('historyChanged', [...this.entries]);
    this.emit('currentIndexChanged', this.currentIndex);

    return entry;
  }

  /**
   * Undo to previous state
   */
  undo(): boolean {
    if (!this.canUndo()) return false;

    const currentEntry = this.entries[this.currentIndex];
    if (currentEntry?.restore) {
      currentEntry.restore();
    }

    this.currentIndex--;
    this.emit('currentIndexChanged', this.currentIndex);

    return true;
  }

  /**
   * Redo to next state
   */
  redo(): boolean {
    if (!this.canRedo()) return false;

    this.currentIndex++;
    const entry = this.entries[this.currentIndex];
    if (entry?.redo) {
      entry.redo();
    } else if (entry?.restore) {
      // If no redo function, the restore function should handle it
      entry.restore();
    }

    this.emit('currentIndexChanged', this.currentIndex);

    return true;
  }

  /**
   * Jump to a specific history entry
   */
  jumpTo(index: number): boolean {
    if (index < -1 || index >= this.entries.length) return false;

    // Apply states from current to target
    if (index < this.currentIndex) {
      // Going backwards - call restore functions from current down to target+1
      for (let i = this.currentIndex; i > index; i--) {
        const entry = this.entries[i];
        if (entry?.restore) {
          entry.restore();
        }
      }
    } else if (index > this.currentIndex) {
      // Going forwards - call redo functions from current+1 to target
      for (let i = this.currentIndex + 1; i <= index; i++) {
        const entry = this.entries[i];
        if (entry?.redo) {
          entry.redo();
        } else if (entry?.restore) {
          entry.restore();
        }
      }
    }

    this.currentIndex = index;
    this.emit('currentIndexChanged', this.currentIndex);

    return true;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.currentIndex < this.entries.length - 1;
  }

  /**
   * Get current state
   */
  getState(): HistoryState {
    return {
      entries: [...this.entries],
      currentIndex: this.currentIndex,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    };
  }

  /**
   * Get all history entries
   */
  getEntries(): HistoryEntry[] {
    return [...this.entries];
  }

  /**
   * Get current index
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.entries = [];
    this.currentIndex = -1;
    this.emit('historyChanged', []);
    this.emit('currentIndexChanged', -1);
  }

  /**
   * Get human-readable time difference
   */
  static formatTimeSince(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  /**
   * Get category icon as SVG
   */
  static getCategoryIcon(category: HistoryEntry['category']): string {
    switch (category) {
      case 'color': return getIconSvg('palette', 'sm');
      case 'paint': return getIconSvg('pencil', 'sm');
      case 'transform': return getIconSvg('move', 'sm');
      case 'view': return getIconSvg('eye', 'sm');
      case 'session': return getIconSvg('folder-open', 'sm');
      default: return getIconSvg('info', 'sm');
    }
  }

  /**
   * @deprecated Use getCategoryIcon instead - emojis violate UI.md
   */
  static getCategoryLabel(category: HistoryEntry['category']): string {
    return HistoryManager.getCategoryIcon(category);
  }

  /**
   * Release all resources and clear history.
   */
  dispose(): void {
    this.clear();
    this.removeAllListeners();
  }
}

// Singleton instance for global history tracking
let globalHistoryManager: HistoryManager | null = null;

export function getGlobalHistoryManager(): HistoryManager {
  if (!globalHistoryManager) {
    globalHistoryManager = new HistoryManager();
  }
  return globalHistoryManager;
}
