/**
 * Version Management for shot versioning.
 *
 * Associates multiple media files as versions of the same shot.
 * Supports navigation between versions and carrying annotations forward.
 */

/**
 * A single version entry within a version group
 */
export interface VersionEntry {
  versionNumber: number;       // 1, 2, 3...
  sourceIndex: number;         // Index into Session.sources[]
  label: string;               // e.g., 'v3 - artist_name - 2026-02-15'
  addedAt: string;             // ISO 8601
  metadata?: Record<string, string>; // Arbitrary key-value
}

/**
 * A group of versions representing the same shot
 */
export interface VersionGroup {
  id: string;                  // crypto.randomUUID()
  shotName: string;            // e.g., 'ABC_0010'
  versions: VersionEntry[];    // Ordered by versionNumber ascending
  activeVersionIndex: number;  // Currently displayed version
}

/**
 * Callback interface for VersionManager to notify Session of changes
 * without importing Session (avoids circular deps).
 */
export interface VersionManagerCallbacks {
  onVersionsChanged(): void;
  onActiveVersionChanged(groupId: string, entry: VersionEntry): void;
}

/**
 * Shot name parsing: extracts base name and version number from filenames.
 * Requires explicit 'v' prefix before the version number.
 * Matches: "shot_v001.exr", "ABC-0010_v3.mov", "comp.v12.exr"
 * Does NOT match: "render_1024.exr", "ACES_2065.exr" (numeric suffix without 'v')
 */
const VERSION_PATTERN = /^(.+?)[\._-]v(\d{1,4})(?:\.\w+)?$/i;

/**
 * Parse a filename into shot name and version number.
 * Returns null if the filename doesn't match a versioning pattern.
 */
export function parseShotVersion(filename: string): { shotName: string; versionNumber: number } | null {
  const match = VERSION_PATTERN.exec(filename);
  if (!match) return null;
  const shotName = match[1]!.replace(/[\._-]$/, ''); // Trim trailing separators
  const versionNumber = parseInt(match[2]!, 10);
  if (isNaN(versionNumber) || versionNumber < 0) return null;
  return { shotName, versionNumber };
}

/**
 * VersionManager owns version group state and operations:
 * - Creating and removing version groups
 * - Adding/removing versions within groups
 * - Navigating between versions (next/previous)
 * - Auto-detecting version groups from filenames
 * - Serialization for save/load
 *
 * State is owned by this manager. Session delegates to it.
 */
export class VersionManager {
  private _groups = new Map<string, VersionGroup>();
  private _callbacks: VersionManagerCallbacks | null = null;

  /**
   * Set the callbacks object. Called once by Session after construction.
   */
  setCallbacks(callbacks: VersionManagerCallbacks): void {
    this._callbacks = callbacks;
  }

  private notifyChange(): void {
    this._callbacks?.onVersionsChanged();
  }

  // ---- CRUD ----

  /**
   * Create a new version group from source indices.
   * Versions are auto-numbered 1, 2, 3... in the order provided.
   * Returns the created group.
   */
  createGroup(
    shotName: string,
    sourceIndices: number[],
    options?: { labels?: string[] },
  ): VersionGroup {
    const now = new Date().toISOString();
    const versions: VersionEntry[] = sourceIndices.map((sourceIndex, i) => ({
      versionNumber: i + 1,
      sourceIndex,
      label: options?.labels?.[i] ?? `v${i + 1}`,
      addedAt: now,
    }));

    const group: VersionGroup = {
      id: crypto.randomUUID(),
      shotName,
      versions,
      activeVersionIndex: versions.length - 1, // Default to latest
    };

    this._groups.set(group.id, group);
    this.notifyChange();
    return this._copyGroup(group);
  }

  /**
   * Remove a version group by ID.
   * Returns true if the group was found and removed.
   */
  removeGroup(groupId: string): boolean {
    if (!this._groups.has(groupId)) return false;
    this._groups.delete(groupId);
    this.notifyChange();
    return true;
  }

  /**
   * Add a version to an existing group.
   * Auto-numbers based on existing max version number.
   * Returns the created entry, or null if group not found.
   */
  addVersionToGroup(
    groupId: string,
    sourceIndex: number,
    options?: { label?: string; metadata?: Record<string, string> },
  ): VersionEntry | null {
    const group = this._groups.get(groupId);
    if (!group) return null;

    const maxVersion = group.versions.reduce((max, v) => Math.max(max, v.versionNumber), 0);
    const entry: VersionEntry = {
      versionNumber: maxVersion + 1,
      sourceIndex,
      label: options?.label ?? `v${maxVersion + 1}`,
      addedAt: new Date().toISOString(),
      metadata: options?.metadata,
    };

    group.versions.push(entry);
    this.notifyChange();
    return { ...entry };
  }

  /**
   * Remove a version from a group by sourceIndex.
   * Updates activeVersionIndex if needed.
   * Returns true if the version was found and removed.
   */
  removeVersionFromGroup(groupId: string, sourceIndex: number): boolean {
    const group = this._groups.get(groupId);
    if (!group) return false;

    const idx = group.versions.findIndex(v => v.sourceIndex === sourceIndex);
    if (idx === -1) return false;

    group.versions.splice(idx, 1);

    // If the group is now empty, remove it
    if (group.versions.length === 0) {
      this._groups.delete(groupId);
      this.notifyChange();
      return true;
    }

    // Adjust activeVersionIndex to keep pointing at the same logical version
    if (idx < group.activeVersionIndex) {
      group.activeVersionIndex--;
    } else if (idx === group.activeVersionIndex) {
      // The active version itself was removed; clamp to end if needed
      if (group.activeVersionIndex >= group.versions.length) {
        group.activeVersionIndex = group.versions.length - 1;
      }
    }

    this.notifyChange();
    return true;
  }

  // ---- Navigation ----

  /**
   * Advance to the next version in a group (wraps around).
   * Returns the new active VersionEntry, or null if group not found.
   */
  nextVersion(groupId: string): VersionEntry | null {
    const group = this._groups.get(groupId);
    if (!group || group.versions.length === 0) return null;

    group.activeVersionIndex = (group.activeVersionIndex + 1) % group.versions.length;
    const entry = group.versions[group.activeVersionIndex]!;

    this._callbacks?.onActiveVersionChanged(groupId, { ...entry });
    this.notifyChange();
    return { ...entry };
  }

  /**
   * Go to the previous version in a group (wraps around).
   * Returns the new active VersionEntry, or null if group not found.
   */
  previousVersion(groupId: string): VersionEntry | null {
    const group = this._groups.get(groupId);
    if (!group || group.versions.length === 0) return null;

    group.activeVersionIndex =
      (group.activeVersionIndex - 1 + group.versions.length) % group.versions.length;
    const entry = group.versions[group.activeVersionIndex]!;

    this._callbacks?.onActiveVersionChanged(groupId, { ...entry });
    this.notifyChange();
    return { ...entry };
  }

  /**
   * Set the active version by index within the group.
   * Returns the active VersionEntry, or null if group not found or index out of range.
   */
  setActiveVersion(groupId: string, versionIndex: number): VersionEntry | null {
    const group = this._groups.get(groupId);
    if (!group || versionIndex < 0 || versionIndex >= group.versions.length) return null;

    group.activeVersionIndex = versionIndex;
    const entry = group.versions[versionIndex]!;

    this._callbacks?.onActiveVersionChanged(groupId, { ...entry });
    this.notifyChange();
    return { ...entry };
  }

  // ---- Queries ----

  /**
   * Get a version group by ID
   */
  getGroup(groupId: string): VersionGroup | undefined {
    const group = this._groups.get(groupId);
    return group ? this._copyGroup(group) : undefined;
  }

  /**
   * Get all version groups
   */
  getGroups(): VersionGroup[] {
    return Array.from(this._groups.values()).map(g => this._copyGroup(g));
  }

  /**
   * Find the version group that contains a given sourceIndex
   */
  getGroupForSource(sourceIndex: number): VersionGroup | undefined {
    for (const group of this._groups.values()) {
      if (group.versions.some(v => v.sourceIndex === sourceIndex)) {
        return this._copyGroup(group);
      }
    }
    return undefined;
  }

  /**
   * Get the active VersionEntry for a group
   */
  getActiveVersion(groupId: string): VersionEntry | undefined {
    const group = this._groups.get(groupId);
    if (!group || group.versions.length === 0) return undefined;
    return { ...group.versions[group.activeVersionIndex]! };
  }

  // ---- Auto-detection ----

  /**
   * Auto-detect version groups from a list of source names.
   * Groups sources with the same base shot name.
   * Only creates groups with 2+ sources.
   * Returns the created groups.
   */
  autoDetectGroups(sources: { name: string; index: number }[]): VersionGroup[] {
    // Parse shot names
    const shotMap = new Map<string, { sourceIndex: number; versionNumber: number; name: string }[]>();
    for (const source of sources) {
      const parsed = parseShotVersion(source.name);
      if (parsed) {
        const entries = shotMap.get(parsed.shotName) ?? [];
        entries.push({ sourceIndex: source.index, versionNumber: parsed.versionNumber, name: source.name });
        shotMap.set(parsed.shotName, entries);
      }
    }

    // Create groups for shots with 2+ versions
    const created: VersionGroup[] = [];
    for (const [shotName, entries] of shotMap) {
      if (entries.length < 2) continue;

      // Sort by version number
      entries.sort((a, b) => a.versionNumber - b.versionNumber);

      const now = new Date().toISOString();
      const versions: VersionEntry[] = entries.map((e) => ({
        versionNumber: e.versionNumber,
        sourceIndex: e.sourceIndex,
        label: `v${e.versionNumber}`,
        addedAt: now,
      }));

      const group: VersionGroup = {
        id: crypto.randomUUID(),
        shotName,
        versions,
        activeVersionIndex: versions.length - 1,
      };

      this._groups.set(group.id, group);
      created.push(this._copyGroup(group));
    }

    if (created.length > 0) {
      this.notifyChange();
    }
    return created;
  }

  // ---- Serialization ----

  /**
   * Produce a JSON-safe array of all version groups (for save/export)
   */
  toSerializable(): VersionGroup[] {
    return Array.from(this._groups.values()).map(g => this._copyGroup(g));
  }

  /**
   * Restore version groups from a serialized array (for load/import)
   */
  fromSerializable(groups: VersionGroup[]): void {
    this._groups.clear();
    for (const group of groups) {
      this._groups.set(group.id, this._copyGroup(group));
    }
    this.notifyChange();
  }

  dispose(): void {
    this._groups.clear();
    this._callbacks = null;
  }

  // ---- Helpers ----

  private _copyGroup(group: VersionGroup): VersionGroup {
    return {
      ...group,
      versions: group.versions.map(v => ({
        ...v,
        metadata: v.metadata ? { ...v.metadata } : undefined,
      })),
    };
  }
}
