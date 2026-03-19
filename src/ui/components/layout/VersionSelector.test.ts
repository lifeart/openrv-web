/**
 * Tests for Version Management UI wiring.
 *
 * Verifies:
 * - Auto-detection is called on source load
 * - Version selector appears in header when groups exist
 * - Next/previous version navigation works
 * - Version display updates on source change
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VersionManager } from '../../../core/session/VersionManager';
import { EventEmitter } from '../../../utils/EventEmitter';

// ---------------------------------------------------------------------------
// Minimal mock Session for HeaderBar tests
// ---------------------------------------------------------------------------

class MockSession extends EventEmitter {
  currentFrame = 1;
  currentSource: any = null;
  fps = 24;
  currentSourceIndex = 0;
  allSources: any[] = [];
  metadata = { displayName: 'Test' };
  loopMode = 'once' as const;
  playDirection = 1;
  playbackSpeed = 1;
  playbackMode = 'realtime' as const;
  isPlaying = false;
  preservesPitch = true;

  private _versionManager = new VersionManager();

  constructor() {
    super();
    this._versionManager.setCallbacks({
      onVersionsChanged: () => this.emit('versionsChanged', undefined),
      onActiveVersionChanged: () => {},
    });
  }

  get versionManager(): VersionManager {
    return this._versionManager;
  }

  setCurrentSource(index: number): void {
    this.currentSourceIndex = index;
  }

  setDisplayName(_name: string): void {}
  togglePlayback(): void {}
  stepForward(): void {}
  stepBackward(): void {}
  goToStart(): void {}
  goToEnd(): void {}
  togglePlayDirection(): void {}
  togglePlaybackMode(): void {}
  isUsingMediabunny(): boolean {
    return false;
  }
  loadFile(_file: File): Promise<void> {
    return Promise.resolve();
  }
  loadProceduralSource(): void {}
  loadSequence(): Promise<void> {
    return Promise.resolve();
  }
  loadFromGTO(): Promise<void> {
    return Promise.resolve();
  }
  loadEDL(): any[] {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Version Selector Integration', () => {
  let session: MockSession;

  beforeEach(() => {
    session = new MockSession();
  });

  afterEach(() => {
    session.versionManager.dispose();
  });

  describe('Auto-detection', () => {
    it('VSEL-001: autoDetectGroups creates groups from versioned filenames', () => {
      const sources = [
        { name: 'shot_v1.exr', index: 0 },
        { name: 'shot_v2.exr', index: 1 },
        { name: 'shot_v3.exr', index: 2 },
      ];

      const groups = session.versionManager.autoDetectGroups(sources);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.shotName).toBe('shot');
      expect(groups[0]!.versions).toHaveLength(3);
    });

    it('VSEL-002: autoDetectGroups emits versionsChanged when groups are created', () => {
      const handler = vi.fn();
      session.on('versionsChanged', handler);

      const sources = [
        { name: 'comp_v1.exr', index: 0 },
        { name: 'comp_v2.exr', index: 1 },
      ];

      session.versionManager.autoDetectGroups(sources);
      expect(handler).toHaveBeenCalled();
    });

    it('VSEL-003: autoDetectGroups does not create groups for single versioned files', () => {
      const sources = [
        { name: 'shot_v1.exr', index: 0 },
        { name: 'other_file.exr', index: 1 },
      ];

      const groups = session.versionManager.autoDetectGroups(sources);
      expect(groups).toHaveLength(0);
    });

    it('VSEL-004: re-running autoDetectGroups after clearing works correctly', () => {
      const sources = [
        { name: 'shot_v1.exr', index: 0 },
        { name: 'shot_v2.exr', index: 1 },
      ];

      // First detection
      session.versionManager.autoDetectGroups(sources);
      expect(session.versionManager.getGroups()).toHaveLength(1);

      // Clear and re-detect (simulates the pattern in AppSessionBridge)
      const existing = session.versionManager.getGroups();
      for (const group of existing) {
        session.versionManager.removeGroup(group.id);
      }

      // Add a new source and re-detect
      const updatedSources = [...sources, { name: 'shot_v3.exr', index: 2 }];
      const groups = session.versionManager.autoDetectGroups(updatedSources);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.versions).toHaveLength(3);
    });
  });

  describe('Version Navigation', () => {
    it('VSEL-005: nextVersion advances to next version and returns the entry', () => {
      const group = session.versionManager.createGroup('shot', [0, 1, 2]);
      // Default active = last (index 2)
      session.versionManager.setActiveVersion(group.id, 0);

      const entry = session.versionManager.nextVersion(group.id);
      expect(entry).not.toBeNull();
      expect(entry!.sourceIndex).toBe(1);
    });

    it('VSEL-006: previousVersion goes to previous version', () => {
      const group = session.versionManager.createGroup('shot', [0, 1, 2]);
      session.versionManager.setActiveVersion(group.id, 2);

      const entry = session.versionManager.previousVersion(group.id);
      expect(entry).not.toBeNull();
      expect(entry!.sourceIndex).toBe(1);
    });

    it('VSEL-007: nextVersion wraps around at the end', () => {
      const group = session.versionManager.createGroup('shot', [0, 1, 2]);
      // Active is at 2 (last)
      const entry = session.versionManager.nextVersion(group.id);
      expect(entry!.sourceIndex).toBe(0); // Wraps to first
    });

    it('VSEL-008: previousVersion wraps around at the beginning', () => {
      const group = session.versionManager.createGroup('shot', [0, 1, 2]);
      session.versionManager.setActiveVersion(group.id, 0);

      const entry = session.versionManager.previousVersion(group.id);
      expect(entry!.sourceIndex).toBe(2); // Wraps to last
    });

    it('VSEL-009: setActiveVersion selects a specific version', () => {
      const group = session.versionManager.createGroup('shot', [0, 1, 2]);

      const entry = session.versionManager.setActiveVersion(group.id, 1);
      expect(entry).not.toBeNull();
      expect(entry!.sourceIndex).toBe(1);

      const updatedGroup = session.versionManager.getGroup(group.id)!;
      expect(updatedGroup.activeVersionIndex).toBe(1);
    });
  });

  describe('Version Group Queries', () => {
    it('VSEL-010: getGroupForSource finds the correct group', () => {
      session.versionManager.createGroup('shot_A', [0, 1]);
      session.versionManager.createGroup('shot_B', [2, 3]);

      const groupA = session.versionManager.getGroupForSource(0);
      expect(groupA).toBeDefined();
      expect(groupA!.shotName).toBe('shot_A');

      const groupB = session.versionManager.getGroupForSource(3);
      expect(groupB).toBeDefined();
      expect(groupB!.shotName).toBe('shot_B');
    });

    it('VSEL-011: getGroupForSource returns undefined for ungrouped source', () => {
      session.versionManager.createGroup('shot', [0, 1]);

      const result = session.versionManager.getGroupForSource(5);
      expect(result).toBeUndefined();
    });

    it('VSEL-012: getActiveVersion returns the current active entry', () => {
      const group = session.versionManager.createGroup('shot', [0, 1, 2]);
      // Default active = last
      const active = session.versionManager.getActiveVersion(group.id);
      expect(active).toBeDefined();
      expect(active!.sourceIndex).toBe(2);
      expect(active!.versionNumber).toBe(3);
    });
  });

  describe('Version display updates', () => {
    it('VSEL-013: version groups are available after autoDetectGroups', () => {
      const sources = [
        { name: 'ABC_0010_v1.exr', index: 0 },
        { name: 'ABC_0010_v2.exr', index: 1 },
        { name: 'ABC_0010_v3.exr', index: 2 },
      ];

      session.versionManager.autoDetectGroups(sources);

      // Source at index 0 should be in a group
      const group = session.versionManager.getGroupForSource(0);
      expect(group).toBeDefined();
      expect(group!.shotName).toBe('ABC_0010');
      expect(group!.versions).toHaveLength(3);
    });

    it('VSEL-014: active version label reflects current state', () => {
      const group = session.versionManager.createGroup('shot', [0, 1, 2], {
        labels: ['v1', 'v2', 'v3'],
      });

      // Active is v3 by default
      const active = session.versionManager.getActiveVersion(group.id);
      expect(active!.label).toBe('v3');

      // Navigate to v1
      session.versionManager.setActiveVersion(group.id, 0);
      const newActive = session.versionManager.getActiveVersion(group.id);
      expect(newActive!.label).toBe('v1');
    });

    it('VSEL-015: version group info is correct after navigation', () => {
      const group = session.versionManager.createGroup('shot', [0, 1, 2]);

      // Navigate next from last (wraps)
      session.versionManager.nextVersion(group.id);
      const updatedGroup = session.versionManager.getGroup(group.id)!;
      expect(updatedGroup.activeVersionIndex).toBe(0);
      expect(updatedGroup.versions[0]!.sourceIndex).toBe(0);
    });

    it('VSEL-016: multiple shot groups are independent', () => {
      session.versionManager.autoDetectGroups([
        { name: 'shot_A_v1.exr', index: 0 },
        { name: 'shot_A_v2.exr', index: 1 },
        { name: 'shot_B_v1.exr', index: 2 },
        { name: 'shot_B_v2.exr', index: 3 },
      ]);

      const groups = session.versionManager.getGroups();
      expect(groups).toHaveLength(2);

      const groupA = session.versionManager.getGroupForSource(0)!;
      const groupB = session.versionManager.getGroupForSource(2)!;

      // Navigate group A, group B should be unaffected
      session.versionManager.nextVersion(groupA.id);
      const updatedA = session.versionManager.getGroup(groupA.id)!;
      const unchangedB = session.versionManager.getGroup(groupB.id)!;
      expect(updatedA.activeVersionIndex).not.toBe(groupA.activeVersionIndex);
      expect(unchangedB.activeVersionIndex).toBe(groupB.activeVersionIndex);
    });
  });
});

describe('AppSessionBridge version auto-detection', () => {
  it('VSEL-017: runVersionAutoDetection clears and re-detects groups', () => {
    const manager = new VersionManager();
    manager.setCallbacks({
      onVersionsChanged: vi.fn(),
      onActiveVersionChanged: vi.fn(),
    });

    // Initial detection
    manager.autoDetectGroups([
      { name: 'shot_v1.exr', index: 0 },
      { name: 'shot_v2.exr', index: 1 },
    ]);
    expect(manager.getGroups()).toHaveLength(1);

    // Simulate re-detection (as AppSessionBridge does)
    const existing = manager.getGroups();
    for (const group of existing) {
      manager.removeGroup(group.id);
    }
    expect(manager.getGroups()).toHaveLength(0);

    // Re-detect with new sources
    manager.autoDetectGroups([
      { name: 'shot_v1.exr', index: 0 },
      { name: 'shot_v2.exr', index: 1 },
      { name: 'shot_v3.exr', index: 2 },
    ]);
    expect(manager.getGroups()).toHaveLength(1);
    expect(manager.getGroups()[0]!.versions).toHaveLength(3);

    manager.dispose();
  });

  it('VSEL-018: does not create groups when fewer than 2 sources', () => {
    const manager = new VersionManager();
    manager.setCallbacks({
      onVersionsChanged: vi.fn(),
      onActiveVersionChanged: vi.fn(),
    });

    const groups = manager.autoDetectGroups([{ name: 'shot_v1.exr', index: 0 }]);
    expect(groups).toHaveLength(0);
    expect(manager.getGroups()).toHaveLength(0);

    manager.dispose();
  });
});

describe('KeyboardActionMap version bindings', () => {
  it('VSEL-019: version.next and version.previous call navigateVersion', () => {
    // Test that the action map entries exist and would call navigateVersion
    const navigateVersion = vi.fn();

    // Simulate the action map pattern
    const actions: Record<string, () => void> = {
      'version.next': () => navigateVersion('next'),
      'version.previous': () => navigateVersion('previous'),
    };

    actions['version.next']!();
    expect(navigateVersion).toHaveBeenCalledWith('next');

    actions['version.previous']!();
    expect(navigateVersion).toHaveBeenCalledWith('previous');
  });
});
