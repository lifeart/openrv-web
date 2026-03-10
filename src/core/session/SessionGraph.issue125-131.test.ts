/**
 * Regression tests for issues #125, #128, #129, #131: SessionGraph persistence fixes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionGraph } from './SessionGraph';
import type { SessionGraphHost } from './SessionGraph';
import type { SessionAnnotations } from './SessionAnnotations';

describe('Issue #131: clearData resets metadata, uncropState, edlEntries', () => {
  let graph: SessionGraph;

  beforeEach(() => {
    graph = new SessionGraph();
  });

  it('ISS-131-001: clearData resets metadata to defaults', () => {
    // Set non-default metadata
    graph.updateMetadata({ displayName: 'My Session', comment: 'test comment' });
    expect(graph.metadata.displayName).toBe('My Session');

    graph.clearData();

    expect(graph.metadata.displayName).toBe('');
    expect(graph.metadata.comment).toBe('');
    expect(graph.metadata.version).toBe(2);
    expect(graph.metadata.origin).toBe('openrv-web');
    expect(graph.metadata.creationContext).toBe(0);
    expect(graph.metadata.clipboard).toBe(0);
    expect(graph.metadata.membershipContains).toEqual([]);
    expect(graph.metadata.realtime).toBe(0);
    expect(graph.metadata.bgColor).toEqual([0.18, 0.18, 0.18, 1.0]);
  });

  it('ISS-131-002: clearData resets uncropState to null', () => {
    graph.uncropState = { active: true, width: 1920, height: 1080, x: 10, y: 20 };
    expect(graph.uncropState).not.toBeNull();

    graph.clearData();

    expect(graph.uncropState).toBeNull();
  });

  it('ISS-131-003: clearData resets edlEntries to empty', () => {
    // Manually set edl entries via internal access
    (graph as any)._edlEntries = [{ source: '/path/clip.mov', inFrame: 1, outFrame: 100 }];
    expect(graph.edlEntries.length).toBe(1);

    graph.clearData();

    expect(graph.edlEntries).toEqual([]);
  });

  it('ISS-131-004: clearData still resets graph, gtoData, graphParseResult', () => {
    (graph as any)._graph = { nodes: new Map() };
    (graph as any)._gtoData = { components: [] };
    (graph as any)._graphParseResult = { nodes: new Map() };

    graph.clearData();

    expect(graph.graph).toBeNull();
    expect(graph.gtoData).toBeNull();
    expect(graph.graphParseResult).toBeNull();
  });
});

describe('Issue #125: empty GTO metadata clears old data (host interface checks)', () => {
  it('ISS-125-001: SessionGraphHost interface includes setAudioScrubEnabled', () => {
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
      setPlaybackMode: vi.fn(),
      setAudioScrubEnabled: vi.fn(),
      getAnnotations: () => mockAnnotations,
      loadVideoSourcesFromGraph: vi.fn().mockResolvedValue(undefined),
    };

    const graph = new SessionGraph();
    graph.setHost(host);

    // Verify the host compiles and can be set
    expect((graph as any)._host).toBe(host);
  });
});
