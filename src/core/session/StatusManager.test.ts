import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatusManager, STATUS_COLORS, VALID_STATUSES, type ShotStatus, type StatusEntry } from './StatusManager';

describe('StatusManager', () => {
  let manager: StatusManager;
  let onStatusChanged: ReturnType<typeof vi.fn>;
  let onStatusesChanged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manager = new StatusManager();
    onStatusChanged = vi.fn();
    onStatusesChanged = vi.fn();
    manager.setCallbacks({ onStatusChanged: onStatusChanged as any, onStatusesChanged: onStatusesChanged as any });
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
      expect(Object.values(counts).every((c) => c === 0)).toBe(true);
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

  describe('new status values (issue #317)', () => {
    it('STATUS-317-001: in-review status can be set and retrieved', () => {
      const entry = manager.setStatus(0, 'in-review', 'Alice');
      expect(entry.status).toBe('in-review');
      expect(manager.getStatus(0)).toBe('in-review');
    });

    it('STATUS-317-002: final status can be set and retrieved', () => {
      const entry = manager.setStatus(0, 'final', 'Alice');
      expect(entry.status).toBe('final');
      expect(manager.getStatus(0)).toBe('final');
    });

    it('STATUS-317-003: on-hold status can be set and retrieved', () => {
      const entry = manager.setStatus(0, 'on-hold', 'Alice');
      expect(entry.status).toBe('on-hold');
      expect(manager.getStatus(0)).toBe('on-hold');
    });

    it('STATUS-317-004: status counts include new values', () => {
      manager.setStatus(0, 'in-review', 'Alice');
      manager.setStatus(1, 'final', 'Bob');
      manager.setStatus(2, 'on-hold', 'Charlie');
      manager.setStatus(3, 'approved', 'Dave');

      const counts = manager.getStatusCounts(6);
      expect(counts['in-review']).toBe(1);
      expect(counts.final).toBe(1);
      expect(counts['on-hold']).toBe(1);
      expect(counts.approved).toBe(1);
      expect(counts.pending).toBe(2); // 6 total - 4 explicit
    });

    it('STATUS-317-005: serialization round-trips new status values', () => {
      manager.setStatus(0, 'in-review', 'Alice');
      manager.setStatus(1, 'final', 'Bob');
      manager.setStatus(2, 'on-hold', 'Charlie');

      const serialized = manager.toSerializable();
      const json = JSON.stringify(serialized);
      const parsed = JSON.parse(json) as StatusEntry[];

      const manager2 = new StatusManager();
      manager2.fromSerializable(parsed);

      expect(manager2.getStatus(0)).toBe('in-review');
      expect(manager2.getStatus(1)).toBe('final');
      expect(manager2.getStatus(2)).toBe('on-hold');
      expect(manager2.getStatusEntry(0)!.setBy).toBe('Alice');
      expect(manager2.getStatusEntry(1)!.setBy).toBe('Bob');
      expect(manager2.getStatusEntry(2)!.setBy).toBe('Charlie');

      manager2.dispose();
    });

    it('STATUS-317-006: colors are defined for all status values', () => {
      for (const status of VALID_STATUSES) {
        const color = STATUS_COLORS[status];
        expect(color).toBeTruthy();
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    it('STATUS-317-007: VALID_STATUSES includes all eight values', () => {
      expect(VALID_STATUSES).toHaveLength(8);
      expect(VALID_STATUSES).toContain('pending');
      expect(VALID_STATUSES).toContain('in-review');
      expect(VALID_STATUSES).toContain('approved');
      expect(VALID_STATUSES).toContain('needs-work');
      expect(VALID_STATUSES).toContain('cbb');
      expect(VALID_STATUSES).toContain('final');
      expect(VALID_STATUSES).toContain('on-hold');
      expect(VALID_STATUSES).toContain('omit');
    });
  });

  describe('old-schema migration', () => {
    it('STATUS-317-008: deserializes data with only old 5-status values correctly', () => {
      // Simulate a saved session from before #317 that only used the original 5 statuses
      const oldEntries: StatusEntry[] = [
        { sourceIndex: 0, status: 'pending', setBy: 'Alice', setAt: '2025-01-01T00:00:00.000Z' },
        { sourceIndex: 1, status: 'approved', setBy: 'Bob', setAt: '2025-01-01T00:00:00.000Z' },
        { sourceIndex: 2, status: 'needs-work', setBy: 'Charlie', setAt: '2025-01-01T00:00:00.000Z' },
        { sourceIndex: 3, status: 'cbb', setBy: 'Dave', setAt: '2025-01-01T00:00:00.000Z' },
        { sourceIndex: 4, status: 'omit', setBy: 'Eve', setAt: '2025-01-01T00:00:00.000Z' },
      ];

      const manager2 = new StatusManager();
      manager2.fromSerializable(oldEntries);

      expect(manager2.getStatus(0)).toBe('pending');
      expect(manager2.getStatus(1)).toBe('approved');
      expect(manager2.getStatus(2)).toBe('needs-work');
      expect(manager2.getStatus(3)).toBe('cbb');
      expect(manager2.getStatus(4)).toBe('omit');

      manager2.dispose();
    });

    it('STATUS-317-009: unknown status values default to pending on deserialization', () => {
      // Simulate corrupted or future data with an unrecognized status
      const badEntries = [
        { sourceIndex: 0, status: 'bogus-status' as ShotStatus, setBy: 'Alice', setAt: '2025-01-01T00:00:00.000Z' },
        { sourceIndex: 1, status: 'approved', setBy: 'Bob', setAt: '2025-01-01T00:00:00.000Z' },
      ];

      const manager2 = new StatusManager();
      manager2.fromSerializable(badEntries);

      expect(manager2.getStatus(0)).toBe('pending');
      expect(manager2.getStatus(1)).toBe('approved');

      manager2.dispose();
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
