import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  StatusManager,
  STATUS_COLORS,
  VALID_STATUSES,
  type ShotStatus,
  type StatusEntry,
} from './StatusManager';

describe('StatusManager', () => {
  let manager: StatusManager;
  let onStatusChanged: ReturnType<typeof vi.fn>;
  let onStatusesChanged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manager = new StatusManager();
    onStatusChanged = vi.fn();
    onStatusesChanged = vi.fn();
    manager.setCallbacks({ onStatusChanged, onStatusesChanged });
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('setStatus', () => {
    it('STATUS-001: stores status for sourceIndex', () => {
      const entry = manager.setStatus(0, 'approved', 'Alice');
      expect(entry.sourceIndex).toBe(0);
      expect(entry.status).toBe('approved');
      expect(entry.setBy).toBe('Alice');
      expect(entry.setAt).toBeTruthy();
      expect(manager.getStatus(0)).toBe('approved');
    });

    it('STATUS-002: emits statusChanged with previous status', () => {
      manager.setStatus(0, 'approved', 'Alice');
      expect(onStatusChanged).toHaveBeenCalledWith(0, 'approved', 'pending');

      onStatusChanged.mockClear();
      manager.setStatus(0, 'needs-work', 'Bob');
      expect(onStatusChanged).toHaveBeenCalledWith(0, 'needs-work', 'approved');
    });

    it('STATUS-006: overwrites previous status', () => {
      manager.setStatus(0, 'approved', 'Alice');
      manager.setStatus(0, 'needs-work', 'Bob');
      expect(manager.getStatus(0)).toBe('needs-work');

      const entry = manager.getStatusEntry(0)!;
      expect(entry.setBy).toBe('Bob');
    });

    it('triggers onStatusesChanged callback', () => {
      manager.setStatus(0, 'approved', 'Alice');
      expect(onStatusesChanged).toHaveBeenCalledOnce();
    });

    it('returns a copy, not internal reference', () => {
      const entry = manager.setStatus(0, 'approved', 'Alice');
      entry.status = 'omit' as ShotStatus;
      expect(manager.getStatus(0)).toBe('approved');
    });
  });

  describe('getStatus', () => {
    it('STATUS-003: returns pending for unset sources', () => {
      expect(manager.getStatus(0)).toBe('pending');
      expect(manager.getStatus(99)).toBe('pending');
    });
  });

  describe('getStatusCounts', () => {
    it('STATUS-004: returns correct counts', () => {
      manager.setStatus(0, 'approved', 'Alice');
      manager.setStatus(1, 'approved', 'Alice');
      manager.setStatus(2, 'needs-work', 'Bob');
      manager.setStatus(3, 'cbb', 'Charlie');

      const counts = manager.getStatusCounts();
      expect(counts.approved).toBe(2);
      expect(counts['needs-work']).toBe(1);
      expect(counts.cbb).toBe(1);
      expect(counts.omit).toBe(0);
      expect(counts.pending).toBe(0);
    });

    it('includes implicit pending when totalSources provided', () => {
      manager.setStatus(0, 'approved', 'Alice');
      manager.setStatus(1, 'needs-work', 'Bob');

      const counts = manager.getStatusCounts(10);
      expect(counts.approved).toBe(1);
      expect(counts['needs-work']).toBe(1);
      expect(counts.pending).toBe(8); // 10 - 2 explicit
    });

    it('returns all zeros on empty manager', () => {
      const counts = manager.getStatusCounts();
      expect(Object.values(counts).every(c => c === 0)).toBe(true);
    });
  });

  describe('serialization', () => {
    it('STATUS-005: toSerializable()/fromSerializable() round-trips', () => {
      manager.setStatus(0, 'approved', 'Alice');
      manager.setStatus(1, 'needs-work', 'Bob');
      manager.setStatus(2, 'cbb', 'Charlie');

      const serialized = manager.toSerializable();
      const json = JSON.stringify(serialized);
      const parsed = JSON.parse(json) as StatusEntry[];

      const manager2 = new StatusManager();
      manager2.fromSerializable(parsed);

      expect(manager2.getStatus(0)).toBe('approved');
      expect(manager2.getStatus(1)).toBe('needs-work');
      expect(manager2.getStatus(2)).toBe('cbb');
      expect(manager2.getStatusEntry(0)!.setBy).toBe('Alice');

      manager2.dispose();
    });

    it('fromSerializable clears existing statuses', () => {
      manager.setStatus(0, 'approved', 'Alice');
      manager.fromSerializable([]);
      expect(manager.getStatus(0)).toBe('pending');
      expect(manager.getAllStatuses()).toHaveLength(0);
    });

    it('fromSerializable triggers callback', () => {
      onStatusesChanged.mockClear();
      manager.fromSerializable([]);
      expect(onStatusesChanged).toHaveBeenCalledOnce();
    });
  });

  describe('clearStatus', () => {
    it('STATUS-007: resets to pending', () => {
      manager.setStatus(0, 'approved', 'Alice');
      onStatusChanged.mockClear();

      const result = manager.clearStatus(0);
      expect(result).toBe(true);
      expect(manager.getStatus(0)).toBe('pending');
      expect(manager.getStatusEntry(0)).toBeUndefined();
      expect(onStatusChanged).toHaveBeenCalledWith(0, 'pending', 'approved');
    });

    it('returns false for non-existent entry', () => {
      expect(manager.clearStatus(99)).toBe(false);
    });
  });

  describe('multiple sources', () => {
    it('STATUS-008: independent statuses per source', () => {
      manager.setStatus(0, 'approved', 'Alice');
      manager.setStatus(1, 'needs-work', 'Bob');
      manager.setStatus(2, 'omit', 'Charlie');

      expect(manager.getStatus(0)).toBe('approved');
      expect(manager.getStatus(1)).toBe('needs-work');
      expect(manager.getStatus(2)).toBe('omit');

      // Changing one doesn't affect others
      manager.setStatus(0, 'cbb', 'Dave');
      expect(manager.getStatus(1)).toBe('needs-work');
      expect(manager.getStatus(2)).toBe('omit');
    });
  });

  describe('getStatusColor', () => {
    it('returns correct colors for all statuses', () => {
      for (const status of VALID_STATUSES) {
        expect(manager.getStatusColor(status)).toBe(STATUS_COLORS[status]);
      }
    });
  });

  describe('getAllStatuses', () => {
    it('returns all explicitly set entries', () => {
      manager.setStatus(0, 'approved', 'Alice');
      manager.setStatus(5, 'needs-work', 'Bob');
      const all = manager.getAllStatuses();
      expect(all).toHaveLength(2);
    });

    it('returns empty array on empty manager', () => {
      expect(manager.getAllStatuses()).toEqual([]);
    });

    it('returns copies, not internal references', () => {
      manager.setStatus(0, 'approved', 'Alice');
      const all = manager.getAllStatuses();
      all[0]!.status = 'omit';
      expect(manager.getStatus(0)).toBe('approved');
    });
  });

  describe('dispose', () => {
    it('clears statuses and callbacks', () => {
      manager.setStatus(0, 'approved', 'Alice');
      onStatusesChanged.mockClear();

      manager.dispose();
      manager.setStatus(1, 'needs-work', 'Bob');
      expect(onStatusesChanged).not.toHaveBeenCalled();
    });
  });

  describe('GTO integration', () => {
    it('STATUS-009: statuses survive serialize → deserialize round-trip', () => {
      manager.setStatus(0, 'approved', 'Alice');
      manager.setStatus(1, 'needs-work', 'Bob');
      manager.setStatus(2, 'cbb', 'Charlie');
      manager.setStatus(3, 'omit', 'Dave');

      const serialized = manager.toSerializable();
      const json = JSON.stringify(serialized);
      const restored = JSON.parse(json) as StatusEntry[];

      const manager2 = new StatusManager();
      manager2.fromSerializable(restored);

      expect(manager2.getStatus(0)).toBe('approved');
      expect(manager2.getStatus(1)).toBe('needs-work');
      expect(manager2.getStatus(2)).toBe('cbb');
      expect(manager2.getStatus(3)).toBe('omit');
      expect(manager2.getStatus(99)).toBe('pending'); // Not set

      // Verify metadata survives
      expect(manager2.getStatusEntry(0)!.setBy).toBe('Alice');
      expect(manager2.getStatusEntry(0)!.setAt).toBeTruthy();
      expect(manager2.getStatusEntry(1)!.setBy).toBe('Bob');

      manager2.dispose();
    });

    it('STATUS-010: serialized entries use correct property naming', () => {
      manager.setStatus(0, 'approved', 'Alice');
      const serialized = manager.toSerializable();

      // Verify the serialized structure has the expected shape
      expect(serialized).toHaveLength(1);
      const entry = serialized[0]!;
      expect(entry).toHaveProperty('sourceIndex', 0);
      expect(entry).toHaveProperty('status', 'approved');
      expect(entry).toHaveProperty('setBy', 'Alice');
      expect(entry).toHaveProperty('setAt');
      expect(typeof entry.setAt).toBe('string');
      // setAt should be a valid ISO 8601 timestamp
      expect(new Date(entry.setAt).toISOString()).toBe(entry.setAt);
    });
  });

  describe('edge cases', () => {
    it('toSerializable returns empty array on empty manager', () => {
      expect(manager.toSerializable()).toEqual([]);
    });

    it('works without callbacks set', () => {
      const mgr = new StatusManager();
      expect(() => {
        mgr.setStatus(0, 'approved', 'Alice');
        mgr.clearStatus(0);
        mgr.dispose();
      }).not.toThrow();
    });

    it('setStatus with same value still emits', () => {
      manager.setStatus(0, 'approved', 'Alice');
      onStatusChanged.mockClear();
      manager.setStatus(0, 'approved', 'Bob');
      expect(onStatusChanged).toHaveBeenCalledWith(0, 'approved', 'approved');
    });
  });
});
