import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MediaRepresentationManager, type RepresentationSourceAccessor } from './MediaRepresentationManager';
import type { MediaRepresentation, AddRepresentationConfig } from '../types/representation';
import type { BaseSourceNode } from '../../nodes/sources/BaseSourceNode';

// Mock the loader factory
vi.mock('./loaders/RepresentationLoaderFactory', () => ({
  createRepresentationLoader: vi.fn(),
}));

import { createRepresentationLoader } from './loaders/RepresentationLoaderFactory';

function createMockSourceNode(name = 'MockNode'): BaseSourceNode {
  return {
    name,
    id: `mock_${name}`,
    type: 'MockSource',
    isReady: () => true,
    getElement: () => null,
    toJSON: () => ({}),
    getMetadata: () => ({ name, width: 1920, height: 1080, duration: 100, fps: 24 }),
    dispose: vi.fn(),
  } as unknown as BaseSourceNode;
}

function createMockRepresentation(overrides: Partial<MediaRepresentation> = {}): MediaRepresentation {
  return {
    id: overrides.id ?? 'rep-1',
    label: overrides.label ?? 'Test Rep',
    kind: overrides.kind ?? 'movie',
    priority: overrides.priority ?? 1,
    status: overrides.status ?? 'idle',
    resolution: overrides.resolution ?? { width: 1920, height: 1080 },
    par: overrides.par ?? 1.0,
    sourceNode: overrides.sourceNode ?? null,
    loaderConfig: overrides.loaderConfig ?? {},
    audioTrackPresent: overrides.audioTrackPresent ?? false,
    startFrame: overrides.startFrame ?? 0,
    colorSpace: overrides.colorSpace,
    errorInfo: overrides.errorInfo,
  };
}

function createMockAccessor(
  reps: MediaRepresentation[] = [],
  activeIndex = -1,
): { accessor: RepresentationSourceAccessor; representations: MediaRepresentation[]; getActiveIndex: () => number } {
  let currentActiveIndex = activeIndex;
  const accessor: RepresentationSourceAccessor = {
    getRepresentations: vi.fn((_sourceIndex: number) => reps),
    getActiveRepresentationIndex: vi.fn(() => currentActiveIndex),
    setActiveRepresentationIndex: vi.fn((_sourceIndex: number, repIndex: number) => {
      currentActiveIndex = repIndex;
    }),
    applyRepresentationShim: vi.fn(),
    getHDRResizeTier: vi.fn(() => 'none' as const),
    getCurrentFrame: vi.fn(() => 1),
  };
  return { accessor, representations: reps, getActiveIndex: () => currentActiveIndex };
}

describe('MediaRepresentationManager', () => {
  let manager: MediaRepresentationManager;

  beforeEach(() => {
    manager = new MediaRepresentationManager();
    vi.clearAllMocks();
  });

  describe('addRepresentation', () => {
    it('should add a representation to the source', () => {
      const { accessor, representations } = createMockAccessor();
      manager.setAccessor(accessor);

      const config: AddRepresentationConfig = {
        kind: 'movie',
        resolution: { width: 1920, height: 1080 },
        loaderConfig: {},
      };

      const rep = manager.addRepresentation(0, config);
      expect(rep).not.toBeNull();
      expect(representations.length).toBe(1);
      expect(representations[0]?.kind).toBe('movie');
    });

    it('should return null if no accessor is set', () => {
      const config: AddRepresentationConfig = {
        kind: 'movie',
        resolution: { width: 1920, height: 1080 },
        loaderConfig: {},
      };

      const rep = manager.addRepresentation(0, config);
      expect(rep).toBeNull();
    });

    it('should return null if source index is invalid', () => {
      const accessor: RepresentationSourceAccessor = {
        getRepresentations: vi.fn(() => null),
        getActiveRepresentationIndex: vi.fn(() => -1),
        setActiveRepresentationIndex: vi.fn(),
        applyRepresentationShim: vi.fn(),
        getHDRResizeTier: vi.fn(() => 'none') as any,
        getCurrentFrame: vi.fn(() => 1),
      };
      manager.setAccessor(accessor);

      const config: AddRepresentationConfig = {
        kind: 'movie',
        resolution: { width: 1920, height: 1080 },
        loaderConfig: {},
      };

      const rep = manager.addRepresentation(99, config);
      expect(rep).toBeNull();
    });

    it('should sort representations by priority', () => {
      const { accessor, representations } = createMockAccessor();
      manager.setAccessor(accessor);

      manager.addRepresentation(0, {
        kind: 'proxy',
        priority: 2,
        resolution: { width: 960, height: 540 },
        loaderConfig: {},
      });

      manager.addRepresentation(0, {
        kind: 'frames',
        priority: 0,
        resolution: { width: 4096, height: 2160 },
        loaderConfig: {},
      });

      manager.addRepresentation(0, {
        kind: 'movie',
        priority: 1,
        resolution: { width: 1920, height: 1080 },
        loaderConfig: {},
      });

      expect(representations[0]?.kind).toBe('frames');
      expect(representations[1]?.kind).toBe('movie');
      expect(representations[2]?.kind).toBe('proxy');
    });

    it('should auto-activate a ready representation if none is active', () => {
      const sourceNode = createMockSourceNode();
      const { accessor } = createMockAccessor();
      manager.setAccessor(accessor);

      manager.addRepresentation(0, {
        kind: 'movie',
        resolution: { width: 1920, height: 1080 },
        loaderConfig: {},
        sourceNode,
      });

      expect(accessor.applyRepresentationShim).toHaveBeenCalled();
    });

    it('should use default priorities based on kind', () => {
      const { accessor, representations } = createMockAccessor();
      manager.setAccessor(accessor);

      manager.addRepresentation(0, {
        kind: 'frames',
        resolution: { width: 4096, height: 2160 },
        loaderConfig: {},
      });

      manager.addRepresentation(0, {
        kind: 'proxy',
        resolution: { width: 960, height: 540 },
        loaderConfig: {},
      });

      expect(representations[0]?.priority).toBe(0); // frames default
      expect(representations[1]?.priority).toBe(2); // proxy default
    });

    it('should populate par, audioTrackPresent, startFrame from config', () => {
      const { accessor, representations } = createMockAccessor();
      manager.setAccessor(accessor);

      manager.addRepresentation(0, {
        kind: 'movie',
        resolution: { width: 1920, height: 1080 },
        loaderConfig: {},
        par: 2.0,
        audioTrackPresent: true,
        startFrame: 1001,
        colorSpace: { transferFunction: 'PQ', colorPrimaries: 'bt2020' },
      });

      const rep = representations[0]!;
      expect(rep.par).toBe(2.0);
      expect(rep.audioTrackPresent).toBe(true);
      expect(rep.startFrame).toBe(1001);
      expect(rep.colorSpace?.transferFunction).toBe('PQ');
      expect(rep.colorSpace?.colorPrimaries).toBe('bt2020');
    });
  });

  describe('removeRepresentation', () => {
    it('should remove a representation by ID', () => {
      const rep = createMockRepresentation({ id: 'rep-to-remove', status: 'ready' });
      const { accessor, representations } = createMockAccessor([rep]);
      manager.setAccessor(accessor);

      const result = manager.removeRepresentation(0, 'rep-to-remove');
      expect(result).toBe(true);
      expect(representations.length).toBe(0);
    });

    it('should return false if representation not found', () => {
      const { accessor } = createMockAccessor([]);
      manager.setAccessor(accessor);

      const result = manager.removeRepresentation(0, 'nonexistent');
      expect(result).toBe(false);
    });

    it('should return false if no accessor', () => {
      const result = manager.removeRepresentation(0, 'some-id');
      expect(result).toBe(false);
    });

    it('should fall back when removing the active representation', () => {
      const rep1 = createMockRepresentation({
        id: 'rep-1',
        priority: 0,
        status: 'ready',
        sourceNode: createMockSourceNode(),
      });
      const rep2 = createMockRepresentation({
        id: 'rep-2',
        priority: 1,
        status: 'ready',
        sourceNode: createMockSourceNode(),
      });
      const { accessor } = createMockAccessor([rep1, rep2], 0);
      manager.setAccessor(accessor);

      manager.removeRepresentation(0, 'rep-1');
      expect(accessor.applyRepresentationShim).toHaveBeenCalled();
    });

    it('should emit representationChanged when removing the active representation and falling back', () => {
      const rep1 = createMockRepresentation({
        id: 'rep-1',
        priority: 0,
        status: 'ready',
        sourceNode: createMockSourceNode(),
      });
      const rep2 = createMockRepresentation({
        id: 'rep-2',
        priority: 1,
        status: 'ready',
        sourceNode: createMockSourceNode(),
      });
      const { accessor } = createMockAccessor([rep1, rep2], 0);
      manager.setAccessor(accessor);

      const changedEvents: unknown[] = [];
      manager.on('representationChanged', (data) => changedEvents.push(data));

      manager.removeRepresentation(0, 'rep-1');

      expect(changedEvents.length).toBe(1);
      const event = changedEvents[0] as { sourceIndex: number; previousRepId: string; newRepId: string; representation: MediaRepresentation };
      expect(event.sourceIndex).toBe(0);
      expect(event.previousRepId).toBe('rep-1');
      expect(event.newRepId).toBe('rep-2');
      expect(event.representation).toBe(rep2);
    });

    it('should adjust active index when removing a representation before it', () => {
      const rep1 = createMockRepresentation({ id: 'rep-1', priority: 0, status: 'ready' });
      const rep2 = createMockRepresentation({ id: 'rep-2', priority: 1, status: 'ready' });
      const rep3 = createMockRepresentation({ id: 'rep-3', priority: 2, status: 'ready' });
      const { accessor } = createMockAccessor([rep1, rep2, rep3], 2);
      manager.setAccessor(accessor);

      manager.removeRepresentation(0, 'rep-1');
      // Active index 2 should become 1
      expect(accessor.setActiveRepresentationIndex).toHaveBeenCalledWith(0, 1);
    });
  });

  describe('switchRepresentation', () => {
    it('should switch to a ready representation', async () => {
      const rep1 = createMockRepresentation({
        id: 'rep-1',
        priority: 0,
        status: 'ready',
        sourceNode: createMockSourceNode(),
      });
      const rep2 = createMockRepresentation({
        id: 'rep-2',
        priority: 1,
        status: 'ready',
        sourceNode: createMockSourceNode(),
      });
      const { accessor } = createMockAccessor([rep1, rep2], 0);
      manager.setAccessor(accessor);

      const changedEvents: unknown[] = [];
      manager.on('representationChanged', (data) => changedEvents.push(data));

      const result = await manager.switchRepresentation(0, 'rep-2');
      expect(result).toBe(true);
      expect(accessor.applyRepresentationShim).toHaveBeenCalledWith(0, rep2);
      expect(changedEvents.length).toBe(1);
    });

    it('should return true if already on the requested representation', async () => {
      const rep1 = createMockRepresentation({ id: 'rep-1', status: 'ready', sourceNode: createMockSourceNode() });
      const { accessor } = createMockAccessor([rep1], 0);
      manager.setAccessor(accessor);

      const result = await manager.switchRepresentation(0, 'rep-1');
      expect(result).toBe(true);
      // No event should be emitted
    });

    it('should load an idle representation when switching', async () => {
      const sourceNode = createMockSourceNode();
      vi.mocked(createRepresentationLoader).mockReturnValue({
        load: vi.fn().mockResolvedValue({
          sourceNode,
          audioTrackPresent: true,
          resolution: { width: 1920, height: 1080 },
          par: 1.0,
          startFrame: 0,
        }),
        dispose: vi.fn(),
      });

      const rep1 = createMockRepresentation({ id: 'rep-1', status: 'idle', kind: 'movie' });
      const { accessor } = createMockAccessor([rep1]);
      manager.setAccessor(accessor);

      const result = await manager.switchRepresentation(0, 'rep-1');
      expect(result).toBe(true);
      expect(rep1.status).toBe('ready');
      expect(rep1.sourceNode).toBe(sourceNode);
    });

    it('should handle load failure with system-initiated fallback', async () => {
      vi.mocked(createRepresentationLoader).mockReturnValue({
        load: vi.fn().mockRejectedValue(new Error('decode error')),
        dispose: vi.fn(),
      });

      const rep1 = createMockRepresentation({ id: 'rep-1', status: 'idle', kind: 'movie', priority: 0 });
      const rep2 = createMockRepresentation({
        id: 'rep-2',
        status: 'ready',
        kind: 'proxy',
        priority: 1,
        sourceNode: createMockSourceNode(),
      });
      const { accessor } = createMockAccessor([rep1, rep2]);
      manager.setAccessor(accessor);

      const errorEvents: unknown[] = [];
      const fallbackEvents: unknown[] = [];
      manager.on('representationError', (data) => errorEvents.push(data));
      manager.on('fallbackActivated', (data) => fallbackEvents.push(data));

      const result = await manager.switchRepresentation(0, 'rep-1', { userInitiated: false });
      expect(result).toBe(true); // Fallback succeeded
      expect(rep1.status).toBe('error');
      expect(errorEvents.length).toBe(1);
      expect(fallbackEvents.length).toBe(1);
    });

    it('should NOT auto-fallback on user-initiated failure', async () => {
      vi.mocked(createRepresentationLoader).mockReturnValue({
        load: vi.fn().mockRejectedValue(new Error('decode error')),
        dispose: vi.fn(),
      });

      const rep1 = createMockRepresentation({ id: 'rep-1', status: 'idle', kind: 'movie', priority: 0 });
      const rep2 = createMockRepresentation({
        id: 'rep-2',
        status: 'ready',
        kind: 'proxy',
        priority: 1,
        sourceNode: createMockSourceNode(),
      });
      const { accessor } = createMockAccessor([rep1, rep2]);
      manager.setAccessor(accessor);

      const errorEvents: unknown[] = [];
      manager.on('representationError', (data) => errorEvents.push(data));

      const result = await manager.switchRepresentation(0, 'rep-1', { userInitiated: true });
      expect(result).toBe(false); // No fallback
      expect(rep1.status).toBe('error');
      expect(errorEvents.length).toBe(1);
      const errorEvent = errorEvents[0] as { userInitiated: boolean };
      expect(errorEvent.userInitiated).toBe(true);
    });

    it('should return false if representation not found', async () => {
      const { accessor } = createMockAccessor([]);
      manager.setAccessor(accessor);

      const result = await manager.switchRepresentation(0, 'nonexistent');
      expect(result).toBe(false);
    });

    it('should return false if no accessor', async () => {
      const result = await manager.switchRepresentation(0, 'some-id');
      expect(result).toBe(false);
    });
  });

  describe('handleRepresentationError', () => {
    it('should fall back to a ready representation', () => {
      const rep1 = createMockRepresentation({ id: 'rep-1', status: 'error', priority: 0 });
      const rep2 = createMockRepresentation({
        id: 'rep-2',
        status: 'ready',
        priority: 1,
        sourceNode: createMockSourceNode(),
      });
      const { accessor } = createMockAccessor([rep1, rep2]);
      manager.setAccessor(accessor);

      const fallbackEvents: unknown[] = [];
      manager.on('fallbackActivated', (data) => fallbackEvents.push(data));

      const result = manager.handleRepresentationError(0, 'rep-1');
      expect(result).toBe(true);
      expect(fallbackEvents.length).toBe(1);
    });

    it('should emit representationChanged alongside fallbackActivated when falling back to a ready representation', () => {
      const rep1 = createMockRepresentation({ id: 'rep-1', status: 'error', priority: 0 });
      const rep2 = createMockRepresentation({
        id: 'rep-2',
        status: 'ready',
        priority: 1,
        sourceNode: createMockSourceNode(),
      });
      const { accessor } = createMockAccessor([rep1, rep2]);
      manager.setAccessor(accessor);

      const fallbackEvents: unknown[] = [];
      const changedEvents: unknown[] = [];
      manager.on('fallbackActivated', (data) => fallbackEvents.push(data));
      manager.on('representationChanged', (data) => changedEvents.push(data));

      const result = manager.handleRepresentationError(0, 'rep-1');
      expect(result).toBe(true);
      expect(fallbackEvents.length).toBe(1);
      expect(changedEvents.length).toBe(1);
      const event = changedEvents[0] as { sourceIndex: number; previousRepId: string; newRepId: string; representation: MediaRepresentation };
      expect(event.sourceIndex).toBe(0);
      expect(event.previousRepId).toBe('rep-1');
      expect(event.newRepId).toBe('rep-2');
      expect(event.representation).toBe(rep2);
    });

    it('should return false if all representations are in error', () => {
      const rep1 = createMockRepresentation({ id: 'rep-1', status: 'error' });
      const rep2 = createMockRepresentation({ id: 'rep-2', status: 'error' });
      const { accessor } = createMockAccessor([rep1, rep2]);
      manager.setAccessor(accessor);

      const result = manager.handleRepresentationError(0, 'rep-1');
      expect(result).toBe(false);
    });

    it('should try loading an idle representation as fallback', () => {
      const rep1 = createMockRepresentation({ id: 'rep-1', status: 'error', priority: 0 });
      const rep2 = createMockRepresentation({ id: 'rep-2', status: 'idle', priority: 1, kind: 'proxy' });
      const { accessor } = createMockAccessor([rep1, rep2]);
      manager.setAccessor(accessor);

      // Mock the loader for the fallback attempt
      vi.mocked(createRepresentationLoader).mockReturnValue({
        load: vi.fn().mockResolvedValue({
          sourceNode: createMockSourceNode(),
          audioTrackPresent: false,
          resolution: { width: 960, height: 540 },
          par: 1.0,
          startFrame: 0,
        }),
        dispose: vi.fn(),
      });

      const result = manager.handleRepresentationError(0, 'rep-1');
      expect(result).toBe(true); // Optimistically true
    });

    it('should return false if no accessor', () => {
      const result = manager.handleRepresentationError(0, 'some-id');
      expect(result).toBe(false);
    });
  });

  describe('getActiveRepresentation', () => {
    it('should return the active representation', () => {
      const rep1 = createMockRepresentation({ id: 'rep-1', status: 'ready' });
      const { accessor } = createMockAccessor([rep1], 0);
      manager.setAccessor(accessor);

      const active = manager.getActiveRepresentation(0);
      expect(active).toBe(rep1);
    });

    it('should return null if no active representation', () => {
      const { accessor } = createMockAccessor([], -1);
      manager.setAccessor(accessor);

      const active = manager.getActiveRepresentation(0);
      expect(active).toBeNull();
    });

    it('should return null if no accessor', () => {
      const active = manager.getActiveRepresentation(0);
      expect(active).toBeNull();
    });
  });

  describe('mapFrame', () => {
    it('should map frames between representations with same startFrame', () => {
      const fromRep = createMockRepresentation({ startFrame: 0 });
      const toRep = createMockRepresentation({ startFrame: 0 });

      expect(manager.mapFrame(50, fromRep, toRep)).toBe(50);
    });

    it('should map frames between representations with different startFrames', () => {
      const fromRep = createMockRepresentation({ startFrame: 1001 });
      const toRep = createMockRepresentation({ startFrame: 0 });

      // Frame 50 in fromRep = absolute frame 1051
      // In toRep: 1051 - 0 = 1051
      expect(manager.mapFrame(50, fromRep, toRep)).toBe(1051);
    });

    it('should map frames from proxy to full-res with offset', () => {
      const proxyRep = createMockRepresentation({ startFrame: 0 });
      const fullResRep = createMockRepresentation({ startFrame: 1001 });

      // Frame 50 in proxy = absolute frame 50
      // In fullRes: 50 - 1001 = -951 -> clamped to 1
      expect(manager.mapFrame(50, proxyRep, fullResRep)).toBe(1);
    });

    it('should clamp to maxFrame when specified', () => {
      const fromRep = createMockRepresentation({ startFrame: 0 });
      const toRep = createMockRepresentation({ startFrame: 0 });

      expect(manager.mapFrame(200, fromRep, toRep, 100)).toBe(100);
    });

    it('should clamp to 1 at minimum', () => {
      const fromRep = createMockRepresentation({ startFrame: 0 });
      const toRep = createMockRepresentation({ startFrame: 1000 });

      expect(manager.mapFrame(5, fromRep, toRep)).toBe(1);
    });
  });

  describe('event emission', () => {
    it('should emit representationChanged on successful switch', async () => {
      const rep1 = createMockRepresentation({ id: 'rep-1', status: 'ready', sourceNode: createMockSourceNode() });
      const { accessor } = createMockAccessor([rep1]);
      manager.setAccessor(accessor);

      const events: unknown[] = [];
      manager.on('representationChanged', (data) => events.push(data));

      await manager.switchRepresentation(0, 'rep-1');
      expect(events.length).toBe(1);
      const event = events[0] as { sourceIndex: number; newRepId: string };
      expect(event.sourceIndex).toBe(0);
      expect(event.newRepId).toBe('rep-1');
    });

    it('should emit representationError on load failure', async () => {
      vi.mocked(createRepresentationLoader).mockReturnValue({
        load: vi.fn().mockRejectedValue(new Error('load failed')),
        dispose: vi.fn(),
      });

      const rep1 = createMockRepresentation({ id: 'rep-1', status: 'idle', kind: 'movie' });
      const { accessor } = createMockAccessor([rep1]);
      manager.setAccessor(accessor);

      const errors: unknown[] = [];
      manager.on('representationError', (data) => errors.push(data));

      await manager.switchRepresentation(0, 'rep-1', { userInitiated: true });
      expect(errors.length).toBe(1);
      const error = errors[0] as { error: string };
      expect(error.error).toBe('load failed');
    });

    it('should emit fallbackActivated when auto-fallback succeeds', async () => {
      vi.mocked(createRepresentationLoader).mockReturnValue({
        load: vi.fn().mockRejectedValue(new Error('decode error')),
        dispose: vi.fn(),
      });

      const rep1 = createMockRepresentation({ id: 'rep-1', status: 'idle', kind: 'movie', priority: 0 });
      const rep2 = createMockRepresentation({
        id: 'rep-2',
        status: 'ready',
        kind: 'proxy',
        priority: 1,
        sourceNode: createMockSourceNode(),
      });
      const { accessor } = createMockAccessor([rep1, rep2]);
      manager.setAccessor(accessor);

      const fallbacks: unknown[] = [];
      manager.on('fallbackActivated', (data) => fallbacks.push(data));

      await manager.switchRepresentation(0, 'rep-1', { userInitiated: false });
      expect(fallbacks.length).toBe(1);
      const fb = fallbacks[0] as { failedRepId: string; fallbackRepId: string };
      expect(fb.failedRepId).toBe('rep-1');
      expect(fb.fallbackRepId).toBe('rep-2');
    });
  });

  describe('dispose', () => {
    it('should dispose all active loaders', async () => {
      const mockDispose = vi.fn();
      vi.mocked(createRepresentationLoader).mockReturnValue({
        load: vi.fn().mockResolvedValue({
          sourceNode: createMockSourceNode(),
          audioTrackPresent: false,
          resolution: { width: 1920, height: 1080 },
          par: 1.0,
          startFrame: 0,
        }),
        dispose: mockDispose,
      });

      const rep1 = createMockRepresentation({ id: 'rep-1', status: 'idle', kind: 'movie' });
      const { accessor } = createMockAccessor([rep1]);
      manager.setAccessor(accessor);

      await manager.switchRepresentation(0, 'rep-1');

      manager.dispose();
      expect(mockDispose).toHaveBeenCalled();
    });

    it('should clear all listeners', () => {
      manager.on('representationChanged', () => {});
      expect(manager.listenerCount()).toBeGreaterThan(0);

      manager.dispose();
      expect(manager.listenerCount()).toBe(0);
    });
  });

  describe('backward compatibility', () => {
    it('should work when source has no representations', () => {
      const accessor: RepresentationSourceAccessor = {
        getRepresentations: vi.fn(() => null),
        getActiveRepresentationIndex: vi.fn(() => -1),
        setActiveRepresentationIndex: vi.fn(),
        applyRepresentationShim: vi.fn(),
        getHDRResizeTier: vi.fn(() => 'none') as any,
        getCurrentFrame: vi.fn(() => 1),
      };
      manager.setAccessor(accessor);

      // All operations should gracefully return null/false
      expect(manager.getActiveRepresentation(0)).toBeNull();
      expect(manager.removeRepresentation(0, 'any')).toBe(false);
      expect(manager.handleRepresentationError(0, 'any')).toBe(false);
    });
  });
});
