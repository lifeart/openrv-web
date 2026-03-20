/**
 * Regression tests for issue #426: RV/GTO import cannot clear notes,
 * version groups, or shot statuses when incoming session data is empty.
 *
 * When a GTO file contains the relevant protocol nodes (notes component,
 * versions component, RVSourceGroup objects) but they parse to empty arrays,
 * sessionInfo.notes / versionGroups / statuses should still be set to []
 * so that SessionGraph.loadFromGTO can clear old data via the managers.
 *
 * When a GTO file does NOT contain those sections at all, the fields should
 * remain undefined so existing data is preserved (backward compat).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadGTOGraph } from './GTOGraphLoader';
import type { GTODTO } from 'gto-js';

/**
 * Creates a mock GTODTO with support for notes, versions, and review components.
 */
function createMockDTO(config: {
  sessions?: Array<{
    name: string;
    frame?: number;
    fps?: number;
    notes?: { totalNotes: number; [key: string]: unknown };
    versions?: { groupCount: number; [key: string]: unknown };
  }>;
  objects?: Array<{
    name: string;
    protocol: string;
    components?: Record<string, Record<string, unknown>>;
  }>;
}) {
  const sessions = config.sessions || [];
  const objects = config.objects || [];

  const createMockComponent = (compData: Record<string, unknown> | undefined) => ({
    exists: () => compData !== undefined,
    property: (name: string) => ({
      value: () => compData?.[name],
    }),
  });

  const createMockObject = (obj: (typeof objects)[0]) => ({
    name: obj.name,
    protocol: obj.protocol,
    component: (name: string) => createMockComponent(obj.components?.[name]),
  });

  const mockObjects = objects.map(createMockObject);
  const mockSessions = sessions.map((s) => ({
    name: s.name,
    component: (name: string) => {
      if (name === 'session') {
        return {
          exists: () => true,
          property: (propName: string) => ({
            value: () => {
              if (propName === 'frame') return s.frame;
              if (propName === 'fps') return s.fps;
              return undefined;
            },
          }),
        };
      }
      if (name === 'notes' && s.notes) {
        return createMockComponent(s.notes);
      }
      if (name === 'versions' && s.versions) {
        return createMockComponent(s.versions);
      }
      return { exists: () => false, property: () => ({ value: () => undefined }) };
    },
  }));

  return {
    byProtocol: (protocol: string) => ({
      length: protocol === 'RVSession' ? mockSessions.length : 0,
      first: () => mockSessions[0],
    }),
    objects: () => mockObjects,
  } as unknown as GTODTO;
}

describe('Issue #426: empty notes/versionGroups/statuses should clear old data', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('notes', () => {
    it('ISS-426-001: notes component with totalNotes=0 sets sessionInfo.notes to empty array', () => {
      const dto = createMockDTO({
        sessions: [{ name: 'S', notes: { totalNotes: 0 } }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.notes).toEqual([]);
    });

    it('ISS-426-002: no notes component leaves sessionInfo.notes undefined (backward compat)', () => {
      const dto = createMockDTO({
        sessions: [{ name: 'S' }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.notes).toBeUndefined();
    });

    it('ISS-426-003: notes component with totalNotes > 0 but no valid notes sets empty array', () => {
      // totalNotes says 2 but no valid note IDs exist
      const dto = createMockDTO({
        sessions: [{ name: 'S', notes: { totalNotes: 2 } }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.notes).toEqual([]);
    });
  });

  describe('versionGroups', () => {
    it('ISS-426-004: versions component with groupCount=0 sets sessionInfo.versionGroups to empty array', () => {
      const dto = createMockDTO({
        sessions: [{ name: 'S', versions: { groupCount: 0 } }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.versionGroups).toEqual([]);
    });

    it('ISS-426-005: no versions component leaves sessionInfo.versionGroups undefined (backward compat)', () => {
      const dto = createMockDTO({
        sessions: [{ name: 'S' }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.versionGroups).toBeUndefined();
    });
  });

  describe('statuses', () => {
    it('ISS-426-006: RVSourceGroup without review component sets sessionInfo.statuses to empty array', () => {
      const dto = createMockDTO({
        sessions: [{ name: 'S' }],
        objects: [
          {
            name: 'sourceGroup000000',
            protocol: 'RVSourceGroup',
            components: {},
          },
        ],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.statuses).toEqual([]);
    });

    it('ISS-426-007: no RVSourceGroup objects leaves sessionInfo.statuses undefined (backward compat)', () => {
      const dto = createMockDTO({
        sessions: [{ name: 'S' }],
        objects: [],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.statuses).toBeUndefined();
    });

    it('ISS-426-008: RVSourceGroup with invalid status still sets empty statuses array', () => {
      const dto = createMockDTO({
        sessions: [{ name: 'S' }],
        objects: [
          {
            name: 'sourceGroup000000',
            protocol: 'RVSourceGroup',
            components: {
              review: { status: 'not-a-valid-status' },
            },
          },
        ],
      });

      const result = loadGTOGraph(dto as never);

      expect(result.sessionInfo.statuses).toEqual([]);
    });
  });
});
