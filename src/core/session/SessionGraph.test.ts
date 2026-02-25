import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionGraph } from './SessionGraph';
import type { SessionGraphHost } from './SessionGraph';
import type { SessionAnnotations } from './SessionAnnotations';

describe('SessionGraph', () => {
  let graph: SessionGraph;

  beforeEach(() => {
    graph = new SessionGraph();
  });

  describe('construction', () => {
    it('SG-001: can be constructed standalone without Session', () => {
      expect(graph).toBeInstanceOf(SessionGraph);
    });

    it('SG-002: starts with null graph', () => {
      expect(graph.graph).toBeNull();
    });

    it('SG-003: starts with null graphParseResult', () => {
      expect(graph.graphParseResult).toBeNull();
    });

    it('SG-004: starts with null gtoData', () => {
      expect(graph.gtoData).toBeNull();
    });

    it('SG-005: starts with default metadata', () => {
      expect(graph.metadata).toEqual({
        displayName: '',
        comment: '',
        version: 2,
        origin: 'openrv-web',
        creationContext: 0,
        clipboard: 0,
        membershipContains: [],
        realtime: 0,
        bgColor: [0.18, 0.18, 0.18, 1.0],
      });
    });

    it('SG-006: starts with empty edlEntries', () => {
      expect(graph.edlEntries).toEqual([]);
    });

    it('SG-007: starts with null uncropState', () => {
      expect(graph.uncropState).toBeNull();
    });
  });

  describe('resolveProperty', () => {
    it('SG-010: returns null when no graph or gtoData is loaded', () => {
      expect(graph.resolveProperty('#RVColor.color.exposure')).toBeNull();
    });

    it('SG-011: returns null for at-address when no graph or gtoData', () => {
      expect(graph.resolveProperty('@RVDisplayColor')).toBeNull();
    });

    it('SG-012: returns null for invalid address format', () => {
      expect(graph.resolveProperty('invalidAddress')).toBeNull();
    });
  });

  describe('updateMetadata', () => {
    it('SG-020: emits metadataChanged when displayName changes', () => {
      const listener = vi.fn();
      graph.on('metadataChanged', listener);

      graph.updateMetadata({ displayName: 'My Session' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'My Session' }),
      );
    });

    it('SG-021: does NOT emit metadataChanged when nothing changes', () => {
      const listener = vi.fn();
      graph.on('metadataChanged', listener);

      // Updating with default values should not emit
      graph.updateMetadata({
        displayName: '',
        comment: '',
        version: 2,
        origin: 'openrv-web',
        creationContext: 0,
        clipboard: 0,
        membershipContains: [],
        realtime: 0,
        bgColor: [0.18, 0.18, 0.18, 1.0],
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('SG-022: trims displayName', () => {
      const listener = vi.fn();
      graph.on('metadataChanged', listener);

      graph.updateMetadata({ displayName: '  My Session  ' });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'My Session' }),
      );
    });

    it('SG-023: emits metadataChanged when comment changes', () => {
      const listener = vi.fn();
      graph.on('metadataChanged', listener);

      graph.updateMetadata({ comment: 'Test comment' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(graph.metadata.comment).toBe('Test comment');
    });

    it('SG-024: emits metadataChanged when bgColor changes', () => {
      const listener = vi.fn();
      graph.on('metadataChanged', listener);

      graph.updateMetadata({ bgColor: [0.5, 0.5, 0.5, 1.0] });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(graph.metadata.bgColor).toEqual([0.5, 0.5, 0.5, 1.0]);
    });

    it('SG-025: emits metadataChanged when membershipContains changes', () => {
      const listener = vi.fn();
      graph.on('metadataChanged', listener);

      graph.updateMetadata({ membershipContains: ['group1'] });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(graph.metadata.membershipContains).toEqual(['group1']);
    });
  });

  describe('setDisplayName', () => {
    it('SG-030: updates the displayName via updateMetadata', () => {
      const listener = vi.fn();
      graph.on('metadataChanged', listener);

      graph.setDisplayName('New Name');

      expect(graph.metadata.displayName).toBe('New Name');
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearData', () => {
    it('SG-040: resets graph, gtoData, and graphParseResult to null', () => {
      // Set non-null values first
      (graph as any)._graph = { nodes: new Map() };
      (graph as any)._gtoData = { components: [] };
      (graph as any)._graphParseResult = { nodes: new Map() };

      // Verify they are set
      expect(graph.graph).not.toBeNull();
      expect(graph.gtoData).not.toBeNull();
      expect(graph.graphParseResult).not.toBeNull();

      // clearData should reset all three
      graph.clearData();
      expect(graph.graph).toBeNull();
      expect(graph.gtoData).toBeNull();
      expect(graph.graphParseResult).toBeNull();
    });

    it('SG-041: clearData is idempotent (safe on already-null state)', () => {
      graph.clearData();
      expect(graph.graph).toBeNull();
      expect(graph.gtoData).toBeNull();
      expect(graph.graphParseResult).toBeNull();
    });
  });

  describe('loadEDL', () => {
    it('SG-050: populates entries and emits edlLoaded', () => {
      const listener = vi.fn();
      graph.on('edlLoaded', listener);

      const edlText = [
        '# RVEDL Test',
        '/path/to/clip.mov 1 100',
      ].join('\n');

      const entries = graph.loadEDL(edlText);

      expect(entries.length).toBeGreaterThan(0);
      expect(graph.edlEntries.length).toBeGreaterThan(0);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(entries);
    });

    it('SG-051: does not emit edlLoaded for empty EDL', () => {
      const listener = vi.fn();
      graph.on('edlLoaded', listener);

      const entries = graph.loadEDL('');

      expect(entries).toEqual([]);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('uncropState', () => {
    it('SG-060: can set and get uncropState', () => {
      const state = { active: true, width: 1920, height: 1080, x: 0, y: 0 };
      graph.uncropState = state;
      expect(graph.uncropState).toBe(state);
    });

    it('SG-061: can reset uncropState to null', () => {
      graph.uncropState = { active: true, width: 1920, height: 1080, x: 0, y: 0 };
      graph.uncropState = null;
      expect(graph.uncropState).toBeNull();
    });
  });

  describe('events', () => {
    it('SG-070: all 5 SessionGraphEvents can be listened to', () => {
      const graphLoadedListener = vi.fn();
      const settingsLoadedListener = vi.fn();
      const sessionLoadedListener = vi.fn();
      const edlLoadedListener = vi.fn();
      const metadataChangedListener = vi.fn();

      graph.on('graphLoaded', graphLoadedListener);
      graph.on('settingsLoaded', settingsLoadedListener);
      graph.on('sessionLoaded', sessionLoadedListener);
      graph.on('edlLoaded', edlLoadedListener);
      graph.on('metadataChanged', metadataChangedListener);

      // metadataChanged fires via updateMetadata
      graph.updateMetadata({ displayName: 'test' });
      expect(metadataChangedListener).toHaveBeenCalledTimes(1);

      // All listeners should be registerable without error
      expect(graphLoadedListener).not.toHaveBeenCalled();
      expect(settingsLoadedListener).not.toHaveBeenCalled();
      expect(sessionLoadedListener).not.toHaveBeenCalled();
      expect(edlLoadedListener).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('SG-090: dispose clears graph, gtoData, graphParseResult', () => {
      graph.dispose();
      expect(graph.graph).toBeNull();
      expect(graph.gtoData).toBeNull();
      expect(graph.graphParseResult).toBeNull();
    });

    it('SG-091: dispose removes all event listeners', () => {
      const listener = vi.fn();
      graph.on('metadataChanged', listener);

      graph.dispose();

      // Emitting after dispose should not call the listener
      graph.updateMetadata({ displayName: 'after dispose' });
      // updateMetadata won't emit because removeAllListeners was called,
      // but the metadata object still updates internally. Verify no listener call.
      expect(listener).not.toHaveBeenCalled();
    });

    it('SG-092: dispose can be called safely multiple times', () => {
      expect(() => {
        graph.dispose();
        graph.dispose();
      }).not.toThrow();
    });

    it('SG-093: dispose nullifies _host', () => {
      const host: SessionGraphHost = {
        setFps: vi.fn(),
        setCurrentFrame: vi.fn(),
        setInPoint: vi.fn(),
        setOutPoint: vi.fn(),
        setFrameIncrement: vi.fn(),
        emitInOutChanged: vi.fn(),
        emitFrameIncrementChanged: vi.fn(),
        getAnnotations: vi.fn() as any,
        loadVideoSourcesFromGraph: vi.fn().mockResolvedValue(undefined),
      };

      graph.setHost(host);
      expect((graph as any)._host).toBe(host);

      graph.dispose();
      expect((graph as any)._host).toBeNull();
    });
  });

  describe('host interface', () => {
    it('SG-080: setHost sets the host and allows host calls', () => {
      const mockAnnotations = {
        markerManager: { setFromFrameNumbers: vi.fn() },
        annotationStore: {
          setPaintEffects: vi.fn(),
          setMatteSettings: vi.fn(),
          parsePaintAnnotations: vi.fn(),
        },
        noteManager: { fromSerializable: vi.fn() },
        versionManager: { fromSerializable: vi.fn() },
        statusManager: { fromSerializable: vi.fn() },
      } as unknown as SessionAnnotations;

      const host: SessionGraphHost = {
        setFps: vi.fn(),
        setCurrentFrame: vi.fn(),
        setInPoint: vi.fn(),
        setOutPoint: vi.fn(),
        setFrameIncrement: vi.fn(),
        emitInOutChanged: vi.fn(),
        emitFrameIncrementChanged: vi.fn(),
        getAnnotations: () => mockAnnotations,
        loadVideoSourcesFromGraph: vi.fn().mockResolvedValue(undefined),
      };

      graph.setHost(host);

      // Host is wired - no error thrown
      expect(host.setFps).not.toHaveBeenCalled();
    });
  });
});
