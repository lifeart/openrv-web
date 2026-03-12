import { describe, it, expect } from 'vitest';
import * as publicAPI from './index';

describe('Public API exports', () => {
  it('does not export HotReloadManager (dev-only, internal)', () => {
    // HotReloadManager is a dev-only utility under src/plugin/dev/ and must
    // not be part of the public API surface (see issue #296).
    expect('HotReloadManager' in publicAPI).toBe(false);
  });
});
