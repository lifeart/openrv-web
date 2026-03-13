/**
 * Regression tests for issue #423: RV/GTO import cannot clear markers
 * when the file carries an empty marks array.
 *
 * When a GTO file contains a session.marks property that parses to an
 * empty array, sessionInfo.marks should be set to [] so that
 * SessionGraph.loadFromGTO can clear old markers via markerManager.
 *
 * When a GTO file does NOT contain a marks property at all, the field
 * should remain undefined so existing markers are preserved (backward compat).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadGTOGraph } from './GTOGraphLoader';
import type { GTODTO } from 'gto-js';

/**
 * Creates a minimal mock GTODTO with configurable marks support.
 */
function createMockDTO(config: {
  sessions?: Array<{
    name: string;
    marks?: unknown;
    markerNotes?: unknown;
    markerColors?: unknown;
    markerEndFrames?: unknown;
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
              if (propName === 'marks') return s.marks;
              if (propName === 'markerNotes') return s.markerNotes;
              if (propName === 'markerColors') return s.markerColors;
              if (propName === 'markerEndFrames') return s.markerEndFrames;
              return undefined;
            },
          }),
        };
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

describe('Issue #423: empty marks array should clear old markers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ISS-423-001: marks property with empty array sets sessionInfo.marks to []', () => {
    const dto = createMockDTO({
      sessions: [{ name: 'S', marks: [] }],
      objects: [],
    });

    const result = loadGTOGraph(dto as never);

    expect(result.sessionInfo.marks).toEqual([]);
  });

  it('ISS-423-002: no marks property leaves sessionInfo.marks undefined (backward compat)', () => {
    const dto = createMockDTO({
      sessions: [{ name: 'S' }],
      objects: [],
    });

    const result = loadGTOGraph(dto as never);

    expect(result.sessionInfo.marks).toBeUndefined();
  });

  it('ISS-423-003: marks property with non-numeric values filters to empty array', () => {
    const dto = createMockDTO({
      sessions: [{ name: 'S', marks: ['not', 'numbers'] }],
      objects: [],
    });

    const result = loadGTOGraph(dto as never);

    expect(result.sessionInfo.marks).toEqual([]);
  });

  it('ISS-423-004: marks property with valid frame numbers still works', () => {
    const dto = createMockDTO({
      sessions: [{ name: 'S', marks: [10, 20, 30] }],
      objects: [],
    });

    const result = loadGTOGraph(dto as never);

    expect(result.sessionInfo.marks).toEqual([10, 20, 30]);
  });

  it('ISS-423-005: marks property that is not an array leaves sessionInfo.marks undefined', () => {
    const dto = createMockDTO({
      sessions: [{ name: 'S', marks: 'not-an-array' }],
      objects: [],
    });

    const result = loadGTOGraph(dto as never);

    expect(result.sessionInfo.marks).toBeUndefined();
  });

  it('ISS-423-006: marks=undefined (property returns undefined) leaves sessionInfo.marks undefined', () => {
    // When the session component exists but marks property returns undefined
    const dto = createMockDTO({
      sessions: [{ name: 'S', marks: undefined }],
      objects: [],
    });

    const result = loadGTOGraph(dto as never);

    expect(result.sessionInfo.marks).toBeUndefined();
  });

  it('ISS-423-007: mixed valid/invalid marks filters correctly', () => {
    const dto = createMockDTO({
      sessions: [{ name: 'S', marks: [10, 'bad', 20, null, 30] }],
      objects: [],
    });

    const result = loadGTOGraph(dto as never);

    expect(result.sessionInfo.marks).toEqual([10, 20, 30]);
  });
});
