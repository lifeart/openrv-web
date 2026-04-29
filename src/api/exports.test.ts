import { describe, it, expect } from 'vitest';
import * as publicAPI from './index';

describe('Public API exports', () => {
  it('does not export HotReloadManager (dev-only, internal)', () => {
    // HotReloadManager is a dev-only utility under src/plugin/dev/ and must
    // not be part of the public API surface (see issue #296).
    expect('HotReloadManager' in publicAPI).toBe(false);
  });

  // MED-19 / PR-2: dev-time hot-reload bridge & Vite plugin must remain internal.
  // The matching production-safety test (`tests/build/no-dev-leak.test.ts`)
  // verifies these symbols also do not leak into the production bundle.
  it('does not export installPluginHotReloadBridge (dev-only, internal)', () => {
    expect('installPluginHotReloadBridge' in publicAPI).toBe(false);
  });

  it('does not export pluginHotReload Vite plugin (build-tool-only, internal)', () => {
    expect('pluginHotReload' in publicAPI).toBe(false);
  });

  it('does not export __openrvDev (dev-console handle is window-attached only)', () => {
    expect('__openrvDev' in publicAPI).toBe(false);
  });
});
