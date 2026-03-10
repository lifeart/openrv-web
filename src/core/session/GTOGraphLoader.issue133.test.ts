/**
 * Regression tests for issue #133: realtime = 0 should not be discarded
 */

import { describe, it, expect } from 'vitest';
import { loadGTOGraph } from './GTOGraphLoader';

// Create a mock GTODTO object (simplified from GTOGraphLoader.test.ts)
function createMockDTO(config: {
  sessions?: Array<{
    name: string;
    fps?: number;
    realtime?: number;
    audioScrubEnabled?: number;
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
              if (propName === 'fps') return s.fps;
              if (propName === 'realtime') return s.realtime;
              if (propName === 'audioScrubEnabled') return s.audioScrubEnabled;
              return undefined;
            },
          }),
        };
      }
      return { exists: () => false, property: () => ({ value: () => undefined }) };
    },
    first: () => undefined,
  }));

  return {
    byProtocol: (protocol: string) => ({
      length: protocol === 'RVSession' ? mockSessions.length : 0,
      first: () => mockSessions[0],
    }),
    objects: () => mockObjects,
  };
}

describe('Issue #133: realtime = 0 is preserved as valid value', () => {
  it('ISS-133-001: realtime = 0 is stored in sessionInfo (not discarded)', () => {
    const dto = createMockDTO({
      sessions: [{ name: 'Test', fps: 24, realtime: 0 }],
      objects: [],
    });

    const result = loadGTOGraph(dto as never);

    expect(result.sessionInfo.realtime).toBe(0);
  });

  it('ISS-133-002: realtime = 0 with fps = 24 uses fps for frame rate', () => {
    const dto = createMockDTO({
      sessions: [{ name: 'Test', fps: 24, realtime: 0 }],
      objects: [],
    });

    const result = loadGTOGraph(dto as never);

    // realtime=0 means play-all-frames, so fps should come from the fps property
    expect(result.sessionInfo.fps).toBe(24);
    expect(result.sessionInfo.realtime).toBe(0);
  });

  it('ISS-133-003: realtime > 0 still preferred over fps', () => {
    const dto = createMockDTO({
      sessions: [{ name: 'Test', fps: 30, realtime: 24 }],
      objects: [],
    });

    const result = loadGTOGraph(dto as never);

    expect(result.sessionInfo.fps).toBe(24);
    expect(result.sessionInfo.realtime).toBe(24);
  });

  it('ISS-133-004: absent realtime falls back to fps', () => {
    const dto = createMockDTO({
      sessions: [{ name: 'Test', fps: 30 }],
      objects: [],
    });

    const result = loadGTOGraph(dto as never);

    expect(result.sessionInfo.fps).toBe(30);
    expect(result.sessionInfo.realtime).toBeUndefined();
  });
});
