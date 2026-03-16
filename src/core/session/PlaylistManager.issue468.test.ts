/**
 * Regression tests for issue #468:
 * OTIO clip metadata is parsed by OTIOParser but dropped during
 * PlaylistManager.fromOTIO() import. Metadata should be stored on
 * the resulting PlaylistClip objects.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlaylistManager } from './PlaylistManager';

/**
 * Helper: build a minimal OTIO JSON string with a single video track
 * containing clips that carry metadata.
 */
function buildOTIOWithMetadata(
  clips: Array<{
    name: string;
    inFrame: number;
    outFrame: number;
    metadata?: Record<string, unknown>;
  }>,
): string {
  const fps = 24;
  const otioClips = clips.map((c) => ({
    OTIO_SCHEMA: 'Clip.1',
    name: c.name,
    source_range: {
      OTIO_SCHEMA: 'TimeRange.1',
      start_time: { OTIO_SCHEMA: 'RationalTime.1', value: c.inFrame, rate: fps },
      duration: { OTIO_SCHEMA: 'RationalTime.1', value: c.outFrame - c.inFrame + 1, rate: fps },
    },
    media_reference: {
      OTIO_SCHEMA: 'ExternalReference.1',
      target_url: `file:///media/${c.name}.exr`,
    },
    metadata: c.metadata,
  }));

  return JSON.stringify({
    OTIO_SCHEMA: 'Timeline.1',
    name: 'Test Timeline',
    global_start_time: { OTIO_SCHEMA: 'RationalTime.1', value: 0, rate: fps },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      children: [
        {
          OTIO_SCHEMA: 'Track.1',
          name: 'Video 1',
          kind: 'Video',
          children: otioClips,
        },
      ],
    },
  });
}

/** Simple source resolver that always succeeds */
function resolver(_name: string) {
  return { index: 0, frameCount: 10000 };
}

describe('PlaylistManager – issue #468: OTIO metadata preserved on playlist clips', () => {
  let pm: PlaylistManager;

  beforeEach(() => {
    pm = new PlaylistManager();
  });

  afterEach(() => {
    pm.dispose();
  });

  it('should store clip metadata from OTIO import (multi-track path)', () => {
    const meta = { department: 'comp', artist: 'jane', version: 3 };
    const otio = buildOTIOWithMetadata([
      { name: 'shot_010', inFrame: 0, outFrame: 47, metadata: meta },
      { name: 'shot_020', inFrame: 0, outFrame: 23 },
    ]);

    const count = pm.fromOTIO(otio, resolver);
    expect(count).toBe(2);

    const clips = pm.getClips();
    expect(clips[0]!.metadata).toEqual(meta);
    // Clip without metadata should have no metadata field
    expect(clips[1]!.metadata).toBeUndefined();
  });

  it('should preserve nested metadata objects', () => {
    const meta = {
      'ftrack': { shotId: 'abc-123', taskId: 'xyz-789' },
      'openrv': { colorSpace: 'ACEScg' },
    };
    const otio = buildOTIOWithMetadata([
      { name: 'shot_030', inFrame: 10, outFrame: 59, metadata: meta },
    ]);

    pm.fromOTIO(otio, resolver);
    const clip = pm.getClips()[0]!;
    expect(clip.metadata).toEqual(meta);
    expect((clip.metadata!['ftrack'] as Record<string, unknown>).shotId).toBe('abc-123');
  });

  it('should make metadata accessible via getClip()', () => {
    const meta = { status: 'approved' };
    const otio = buildOTIOWithMetadata([
      { name: 'shot_040', inFrame: 0, outFrame: 11, metadata: meta },
    ]);

    pm.fromOTIO(otio, resolver);
    const clips = pm.getClips();
    const fetched = pm.getClip(clips[0]!.id);
    expect(fetched).toBeDefined();
    expect(fetched!.metadata).toEqual(meta);
  });

  it('should make metadata accessible via getClipAtFrame()', () => {
    const meta = { note: 'check edge' };
    const otio = buildOTIOWithMetadata([
      { name: 'shot_050', inFrame: 0, outFrame: 23, metadata: meta },
    ]);

    pm.fromOTIO(otio, resolver);
    const mapping = pm.getClipAtFrame(1);
    expect(mapping).not.toBeNull();
    expect(mapping!.clip.metadata).toEqual(meta);
  });

  it('should store metadata via addClip() directly', () => {
    const meta = { custom: 'value' };
    const clip = pm.addClip(0, 'direct', 1, 50, meta);
    expect(clip.metadata).toEqual(meta);
    expect(pm.getClips()[0]!.metadata).toEqual(meta);
  });

  it('should not set metadata when none is provided to addClip()', () => {
    const clip = pm.addClip(0, 'no-meta', 1, 50);
    expect(clip.metadata).toBeUndefined();
  });

  it('should preserve metadata through replaceClips()', () => {
    const meta = { pipeline: 'v2' };
    pm.replaceClips([
      { sourceIndex: 0, sourceName: 'A', inPoint: 1, outPoint: 50, metadata: meta },
      { sourceIndex: 1, sourceName: 'B', inPoint: 1, outPoint: 30 },
    ]);

    const clips = pm.getClips();
    expect(clips[0]!.metadata).toEqual(meta);
    expect(clips[1]!.metadata).toBeUndefined();
  });

  it('should preserve metadata through state serialization round-trip', () => {
    const meta = { review: 'pending' };
    const otio = buildOTIOWithMetadata([
      { name: 'shot_060', inFrame: 0, outFrame: 47, metadata: meta },
    ]);

    pm.fromOTIO(otio, resolver);
    const state = pm.getState();

    // Create a new manager and restore state
    const pm2 = new PlaylistManager();
    pm2.setState(state);

    const clips = pm2.getClips();
    expect(clips[0]!.metadata).toEqual(meta);

    pm2.dispose();
  });
});
