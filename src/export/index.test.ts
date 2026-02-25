/**
 * Export barrel re-exports test
 *
 * Verifies that all expected symbols are accessible through src/export/index.ts.
 */

import { describe, it, expect } from 'vitest';

import {
  // OTIOWriter re-exports
  exportOTIO,
  exportOTIOMultiTrack,
  buildExportClips,
} from './index';

describe('export/index re-exports', () => {
  it('EXP-001: re-exports exportOTIO from OTIOWriter', () => {
    expect(typeof exportOTIO).toBe('function');
  });

  it('EXP-002: re-exports exportOTIOMultiTrack from OTIOWriter', () => {
    expect(typeof exportOTIOMultiTrack).toBe('function');
  });

  it('EXP-003: re-exports buildExportClips from OTIOWriter', () => {
    expect(typeof buildExportClips).toBe('function');
  });

  it('EXP-004: exportOTIO produces valid OTIO JSON', () => {
    const json = exportOTIO(
      [
        {
          sourceName: 'test',
          sourceUrl: 'file:///test.exr',
          inPoint: 1,
          outPoint: 24,
          globalStartFrame: 1,
          duration: 24,
          fps: 24,
        },
      ],
      { name: 'ReExport Test', fps: 24 },
    );

    const parsed = JSON.parse(json);
    expect(parsed.OTIO_SCHEMA).toBe('Timeline.1');
    expect(parsed.name).toBe('ReExport Test');
  });
});
