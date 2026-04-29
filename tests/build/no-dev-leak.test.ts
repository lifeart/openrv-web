/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Production no-dev-leak test (MED-19 / PR-2).
 *
 * Builds the production bundle once per test session and asserts that
 * dev-only hot-reload symbols are tree-shaken out:
 *   - `class HotReloadManager` (the manager itself)
 *   - `installPluginHotReloadBridge` (the dev bridge entry)
 *   - `__openrvDev` (the dev-console handle)
 *   - `openrv:plugin-hot-reload` (the HMR event name)
 *
 * The whole bridge is loaded via dynamic import inside an
 * `import.meta.env.DEV` block in `src/main.ts`. In production builds Vite
 * statically evaluates `import.meta.env.DEV` to `false`, dead-code
 * eliminates the block, and the chunks containing those symbols are never
 * emitted. This test guards against accidental regressions (e.g., someone
 * importing `clientBridge` from a non-dev path).
 *
 * Performance: `pnpm build` is slow (~30s+). To skip on fast CI lanes set
 * `CI_FAST=1`.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const fs: typeof import('fs') = (await import('fs' as any)).default ?? (await import('fs' as any));
const path: typeof import('path') = (await import('path' as any)).default ?? (await import('path' as any));
const child_process: typeof import('child_process') =
  (await import('child_process' as any)).default ?? (await import('child_process' as any));

const SKIP_BUILD = process.env.CI_FAST === '1';

describe.skipIf(SKIP_BUILD)('production no-dev-leak (MED-19 / PR-2)', () => {
  const distAssetsDir = path.join(process.cwd(), 'dist', 'assets');

  beforeAll(() => {
    if (!fs.existsSync(distAssetsDir)) {
      // Building once per test session is intentional — we need real Vite
      // output to verify dev-only chunks are absent. Subsequent runs reuse
      // the existing dist/.
      //
      // Force NODE_ENV=production: when run from `vitest`, the parent
      // process leaks `NODE_ENV=test` to subprocesses, which makes Vite
      // statically evaluate `import.meta.env.DEV` to `true` and the dev
      // chunks are kept. We override here to assert the *real* shipping
      // behavior (`pnpm build` from a clean shell).
      // eslint-disable-next-line no-console
      console.log('[no-dev-leak] building production bundle (one-time per session)...');
      const env = { ...process.env, NODE_ENV: 'production' };
      child_process.execSync('pnpm build', { stdio: 'inherit', env });
    }
  }, 600_000);

  function listJsBundles(): string[] {
    return fs
      .readdirSync(distAssetsDir)
      .filter((f: string) => f.endsWith('.js') && !f.endsWith('.map'))
      .map((f: string) => path.join(distAssetsDir, f));
  }

  it('NDL-001: HotReloadManager class is absent from production .js bundles', () => {
    const jsFiles = listJsBundles();
    expect(jsFiles.length).toBeGreaterThan(0);
    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content, `expected no HotReloadManager class in ${path.basename(file)}`).not.toMatch(
        /class\s+HotReloadManager/,
      );
    }
  });

  it('NDL-002: clientBridge / __openrvDev / pluginHotReload symbols absent from .js bundles', () => {
    const jsFiles = listJsBundles();
    expect(jsFiles.length).toBeGreaterThan(0);
    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const base = path.basename(file);
      expect(content, `expected no installPluginHotReloadBridge in ${base}`).not.toMatch(
        /installPluginHotReloadBridge/,
      );
      expect(content, `expected no __openrvDev in ${base}`).not.toMatch(/__openrvDev/);
      expect(content, `expected no openrv:plugin-hot-reload event name in ${base}`).not.toMatch(
        /openrv:plugin-hot-reload/,
      );
    }
  });
});
