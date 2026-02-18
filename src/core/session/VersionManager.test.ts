import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  VersionManager,
  parseShotVersion,
  type VersionGroup,
} from './VersionManager';

describe('VersionManager', () => {
  let manager: VersionManager;
  let onVersionsChanged: ReturnType<typeof vi.fn>;
  let onActiveVersionChanged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manager = new VersionManager();
    onVersionsChanged = vi.fn();
    onActiveVersionChanged = vi.fn();
    manager.setCallbacks({ onVersionsChanged, onActiveVersionChanged });
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('parseShotVersion', () => {
    it('parses "shot_v001.exr"', () => {
      const result = parseShotVersion('shot_v001.exr');
      expect(result).toEqual({ shotName: 'shot', versionNumber: 1 });
    });

    it('parses "ABC_0010_v3.mov"', () => {
      const result = parseShotVersion('ABC_0010_v3.mov');
      expect(result).toEqual({ shotName: 'ABC_0010', versionNumber: 3 });
    });

    it('parses "comp.v12.exr"', () => {
      const result = parseShotVersion('comp.v12.exr');
      expect(result).toEqual({ shotName: 'comp', versionNumber: 12 });
    });

    it('parses "shot-v005.exr"', () => {
      const result = parseShotVersion('shot-v005.exr');
      expect(result).toEqual({ shotName: 'shot', versionNumber: 5 });
    });

    it('returns null for unversioned filename', () => {
      expect(parseShotVersion('readme.txt')).toBeNull();
    });

    it('returns null for numeric suffix without v prefix', () => {
      // Should NOT match filenames with bare numbers (no 'v' prefix)
      expect(parseShotVersion('render_1024.exr')).toBeNull();
      expect(parseShotVersion('ACES_2065.exr')).toBeNull();
      expect(parseShotVersion('plate_002.dpx')).toBeNull();
    });
  });

  describe('createGroup', () => {
    it('VER-001: creates group with correct entries', () => {
      const group = manager.createGroup('ABC_0010', [0, 1, 2]);
      expect(group.id).toBeTruthy();
      expect(group.shotName).toBe('ABC_0010');
      expect(group.versions).toHaveLength(3);
      expect(group.versions[0]!.versionNumber).toBe(1);
      expect(group.versions[0]!.sourceIndex).toBe(0);
      expect(group.versions[1]!.versionNumber).toBe(2);
      expect(group.versions[1]!.sourceIndex).toBe(1);
      expect(group.versions[2]!.versionNumber).toBe(3);
      expect(group.versions[2]!.sourceIndex).toBe(2);
      expect(group.activeVersionIndex).toBe(2); // Latest by default
    });

    it('VER-002: triggers onVersionsChanged callback', () => {
      manager.createGroup('ABC_0010', [0, 1]);
      expect(onVersionsChanged).toHaveBeenCalledOnce();
    });

    it('creates group with custom labels', () => {
      const group = manager.createGroup('ABC_0010', [0, 1], {
        labels: ['v1 - Initial', 'v2 - Revised'],
      });
      expect(group.versions[0]!.label).toBe('v1 - Initial');
      expect(group.versions[1]!.label).toBe('v2 - Revised');
    });

    it('returns a copy, not internal reference', () => {
      const group = manager.createGroup('ABC_0010', [0]);
      group.shotName = 'mutated';
      expect(manager.getGroup(group.id)!.shotName).toBe('ABC_0010');
    });
  });

  describe('autoDetectGroups', () => {
    it('VER-003: groups sources by shot name', () => {
      const sources = [
        { name: 'ABC_0010_v1.exr', index: 0 },
        { name: 'ABC_0010_v2.exr', index: 1 },
        { name: 'ABC_0010_v3.exr', index: 2 },
      ];
      const groups = manager.autoDetectGroups(sources);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.shotName).toBe('ABC_0010');
      expect(groups[0]!.versions).toHaveLength(3);
    });

    it('VER-004: handles various naming conventions', () => {
      const sources = [
        { name: 'shot_v001.exr', index: 0 },
        { name: 'shot_v002.exr', index: 1 },
        { name: 'comp.v1.mov', index: 2 },
        { name: 'comp.v2.mov', index: 3 },
      ];
      const groups = manager.autoDetectGroups(sources);
      expect(groups).toHaveLength(2);
      const shotNames = groups.map(g => g.shotName).sort();
      expect(shotNames).toEqual(['comp', 'shot']);
    });

    it('VER-005: skips ungrouped single sources', () => {
      const sources = [
        { name: 'ABC_0010_v1.exr', index: 0 },
        { name: 'ABC_0010_v2.exr', index: 1 },
        { name: 'lonely_file_v1.exr', index: 2 }, // Only one version
      ];
      const groups = manager.autoDetectGroups(sources);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.shotName).toBe('ABC_0010');
    });

    it('sorts versions by version number within groups', () => {
      const sources = [
        { name: 'shot_v3.exr', index: 2 },
        { name: 'shot_v1.exr', index: 0 },
        { name: 'shot_v2.exr', index: 1 },
      ];
      const groups = manager.autoDetectGroups(sources);
      expect(groups[0]!.versions[0]!.versionNumber).toBe(1);
      expect(groups[0]!.versions[1]!.versionNumber).toBe(2);
      expect(groups[0]!.versions[2]!.versionNumber).toBe(3);
    });

    it('does not trigger callback when no groups created', () => {
      manager.autoDetectGroups([{ name: 'single.exr', index: 0 }]);
      expect(onVersionsChanged).not.toHaveBeenCalled();
    });
  });

  describe('nextVersion / previousVersion', () => {
    it('VER-006: nextVersion() advances activeVersionIndex and emits event', () => {
      const group = manager.createGroup('ABC', [0, 1, 2]);
      // activeVersionIndex starts at 2 (latest)
      onActiveVersionChanged.mockClear();
      onVersionsChanged.mockClear();

      const entry = manager.nextVersion(group.id);
      expect(entry).not.toBeNull();
      expect(entry!.sourceIndex).toBe(0); // Wraps to 0
      expect(manager.getGroup(group.id)!.activeVersionIndex).toBe(0);
      expect(onActiveVersionChanged).toHaveBeenCalledOnce();
      expect(onVersionsChanged).toHaveBeenCalledOnce();
    });

    it('VER-007: previousVersion() decrements activeVersionIndex', () => {
      const group = manager.createGroup('ABC', [0, 1, 2]);
      // Set to index 1 first
      manager.setActiveVersion(group.id, 1);
      onActiveVersionChanged.mockClear();

      const entry = manager.previousVersion(group.id);
      expect(entry).not.toBeNull();
      expect(entry!.sourceIndex).toBe(0);
      expect(manager.getGroup(group.id)!.activeVersionIndex).toBe(0);
    });

    it('VER-008: nextVersion() wraps around at end', () => {
      const group = manager.createGroup('ABC', [0, 1, 2]);
      // Start at index 2 (last), next should wrap to 0
      const entry = manager.nextVersion(group.id);
      expect(entry!.versionNumber).toBe(1);
      expect(entry!.sourceIndex).toBe(0);
    });

    it('previousVersion() wraps around at beginning', () => {
      const group = manager.createGroup('ABC', [0, 1, 2]);
      manager.setActiveVersion(group.id, 0);
      onActiveVersionChanged.mockClear();

      const entry = manager.previousVersion(group.id);
      expect(entry!.versionNumber).toBe(3);
      expect(entry!.sourceIndex).toBe(2);
    });

    it('returns null for non-existent group', () => {
      expect(manager.nextVersion('non-existent')).toBeNull();
      expect(manager.previousVersion('non-existent')).toBeNull();
    });
  });

  describe('addVersionToGroup', () => {
    it('VER-009: appends and auto-numbers', () => {
      const group = manager.createGroup('ABC', [0, 1]);
      onVersionsChanged.mockClear();

      const entry = manager.addVersionToGroup(group.id, 5, { label: 'v3 - Final' });
      expect(entry).not.toBeNull();
      expect(entry!.versionNumber).toBe(3);
      expect(entry!.sourceIndex).toBe(5);
      expect(entry!.label).toBe('v3 - Final');
      expect(onVersionsChanged).toHaveBeenCalledOnce();

      const updated = manager.getGroup(group.id)!;
      expect(updated.versions).toHaveLength(3);
    });

    it('returns null for non-existent group', () => {
      expect(manager.addVersionToGroup('non-existent', 0)).toBeNull();
    });

    it('stores metadata on entry', () => {
      const group = manager.createGroup('ABC', [0]);
      const entry = manager.addVersionToGroup(group.id, 1, {
        metadata: { artist: 'Alice', notes: 'Final render' },
      });
      expect(entry!.metadata).toEqual({ artist: 'Alice', notes: 'Final render' });
    });
  });

  describe('removeVersionFromGroup', () => {
    it('VER-010: updates indices correctly', () => {
      const group = manager.createGroup('ABC', [0, 1, 2]);
      manager.setActiveVersion(group.id, 2); // Active = last

      const result = manager.removeVersionFromGroup(group.id, 2); // Remove last
      expect(result).toBe(true);

      const updated = manager.getGroup(group.id)!;
      expect(updated.versions).toHaveLength(2);
      expect(updated.activeVersionIndex).toBe(1); // Adjusted
    });

    it('adjusts activeVersionIndex when removing before active', () => {
      const group = manager.createGroup('ABC', [0, 1, 2]);
      manager.setActiveVersion(group.id, 2); // Active = v3 (sourceIndex 2)

      // Remove first entry (before active)
      manager.removeVersionFromGroup(group.id, 0);

      const updated = manager.getGroup(group.id)!;
      expect(updated.versions).toHaveLength(2);
      // Active should shift down to keep pointing at sourceIndex 2
      expect(updated.activeVersionIndex).toBe(1);
      expect(updated.versions[updated.activeVersionIndex]!.sourceIndex).toBe(2);
    });

    it('removes entire group when last version is removed', () => {
      const group = manager.createGroup('ABC', [0]);
      manager.removeVersionFromGroup(group.id, 0);
      expect(manager.getGroup(group.id)).toBeUndefined();
    });

    it('returns false for non-existent group or version', () => {
      expect(manager.removeVersionFromGroup('non-existent', 0)).toBe(false);
      const group = manager.createGroup('ABC', [0]);
      expect(manager.removeVersionFromGroup(group.id, 999)).toBe(false);
    });
  });

  describe('getGroupForSource', () => {
    it('VER-011: returns correct group', () => {
      manager.createGroup('ABC', [0, 1]);
      manager.createGroup('DEF', [2, 3]);

      const group = manager.getGroupForSource(2);
      expect(group).toBeDefined();
      expect(group!.shotName).toBe('DEF');
    });

    it('returns undefined for source not in any group', () => {
      manager.createGroup('ABC', [0, 1]);
      expect(manager.getGroupForSource(99)).toBeUndefined();
    });
  });

  describe('serialization', () => {
    it('VER-012: toSerializable()/fromSerializable() round-trips correctly', () => {
      const g1 = manager.createGroup('ABC', [0, 1, 2]);
      const g2 = manager.createGroup('DEF', [3, 4]);
      manager.setActiveVersion(g1.id, 1);

      const serialized = manager.toSerializable();
      const json = JSON.stringify(serialized);
      const parsed = JSON.parse(json) as VersionGroup[];

      const manager2 = new VersionManager();
      manager2.fromSerializable(parsed);

      const groups = manager2.getGroups();
      expect(groups).toHaveLength(2);

      const restored1 = manager2.getGroup(g1.id)!;
      expect(restored1.shotName).toBe('ABC');
      expect(restored1.versions).toHaveLength(3);
      expect(restored1.activeVersionIndex).toBe(1);

      const restored2 = manager2.getGroup(g2.id)!;
      expect(restored2.shotName).toBe('DEF');
      expect(restored2.versions).toHaveLength(2);

      manager2.dispose();
    });

    it('VER-014: version groups survive GTO-style round-trip', () => {
      const g1 = manager.createGroup('ABC', [0, 1, 2], {
        labels: ['v1 - Initial', 'v2 - Revised', 'v3 - Final'],
      });
      manager.setActiveVersion(g1.id, 1);

      // Simulate GTO round-trip via serialize/deserialize
      const serialized = manager.toSerializable();
      const json = JSON.stringify(serialized);
      const restored = JSON.parse(json) as VersionGroup[];

      const manager2 = new VersionManager();
      manager2.fromSerializable(restored);

      const group = manager2.getGroup(g1.id)!;
      expect(group.shotName).toBe('ABC');
      expect(group.activeVersionIndex).toBe(1);
      expect(group.versions).toHaveLength(3);
      expect(group.versions[0]!.label).toBe('v1 - Initial');
      expect(group.versions[2]!.sourceIndex).toBe(2);

      manager2.dispose();
    });

    it('VER-015: GTO versions component uses correct property naming', () => {
      manager.createGroup('ABC_0010', [0, 1]);
      const groups = manager.toSerializable();

      // Verify the data structure matches GTO naming expectations
      expect(groups).toHaveLength(1);
      const group = groups[0]!;
      expect(group.id).toBeTruthy();
      expect(group.shotName).toBe('ABC_0010');
      expect(group.versions[0]!.versionNumber).toBe(1);
      expect(group.versions[1]!.versionNumber).toBe(2);
      expect(group.activeVersionIndex).toBe(1);
    });

    it('fromSerializable clears existing groups', () => {
      manager.createGroup('ABC', [0]);
      manager.fromSerializable([]);
      expect(manager.getGroups()).toHaveLength(0);
    });

    it('fromSerializable triggers callback', () => {
      onVersionsChanged.mockClear();
      manager.fromSerializable([]);
      expect(onVersionsChanged).toHaveBeenCalledOnce();
    });
  });

  describe('removeGroup', () => {
    it('removes a group and triggers callback', () => {
      const group = manager.createGroup('ABC', [0, 1]);
      onVersionsChanged.mockClear();

      const result = manager.removeGroup(group.id);
      expect(result).toBe(true);
      expect(manager.getGroup(group.id)).toBeUndefined();
      expect(onVersionsChanged).toHaveBeenCalledOnce();
    });

    it('returns false for non-existent group', () => {
      expect(manager.removeGroup('non-existent')).toBe(false);
    });
  });

  describe('setActiveVersion', () => {
    it('sets active version and emits callback', () => {
      const group = manager.createGroup('ABC', [0, 1, 2]);
      onActiveVersionChanged.mockClear();

      const entry = manager.setActiveVersion(group.id, 0);
      expect(entry).not.toBeNull();
      expect(entry!.sourceIndex).toBe(0);
      expect(onActiveVersionChanged).toHaveBeenCalledOnce();
    });

    it('returns null for out of range index', () => {
      const group = manager.createGroup('ABC', [0, 1]);
      expect(manager.setActiveVersion(group.id, -1)).toBeNull();
      expect(manager.setActiveVersion(group.id, 5)).toBeNull();
    });

    it('returns null for non-existent group', () => {
      expect(manager.setActiveVersion('non-existent', 0)).toBeNull();
    });
  });

  describe('getActiveVersion', () => {
    it('returns the active version entry', () => {
      const group = manager.createGroup('ABC', [0, 1, 2]);
      const active = manager.getActiveVersion(group.id);
      expect(active).toBeDefined();
      expect(active!.sourceIndex).toBe(2); // Last by default
    });

    it('returns undefined for non-existent group', () => {
      expect(manager.getActiveVersion('non-existent')).toBeUndefined();
    });
  });

  describe('dispose', () => {
    it('clears groups and callbacks', () => {
      manager.createGroup('ABC', [0]);
      onVersionsChanged.mockClear();

      manager.dispose();
      // Callbacks should not fire after dispose
      manager.createGroup('DEF', [1]);
      expect(onVersionsChanged).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('getGroups returns empty array on empty manager', () => {
      expect(manager.getGroups()).toEqual([]);
    });

    it('toSerializable returns empty array on empty manager', () => {
      expect(manager.toSerializable()).toEqual([]);
    });

    it('multiple groups coexist independently', () => {
      const g1 = manager.createGroup('ABC', [0, 1]);
      const g2 = manager.createGroup('DEF', [2, 3, 4]);

      manager.nextVersion(g1.id);
      expect(manager.getGroup(g1.id)!.activeVersionIndex).toBe(0);
      expect(manager.getGroup(g2.id)!.activeVersionIndex).toBe(2); // Unchanged
    });
  });
});
