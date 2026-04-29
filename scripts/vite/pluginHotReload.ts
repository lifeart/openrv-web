/**
 * Vite dev-server plugin: openrv:plugin-hot-reload
 *
 * Watches in-tree plugin source files under `src/plugin/builtins/*.ts`,
 * extracts each file's `manifest.id` once at server start, and pushes a
 * custom HMR event (`openrv:plugin-hot-reload`) to the client whenever a
 * tracked file changes. The client-side bridge
 * (`src/plugin/dev/clientBridge.ts`) drives `HotReloadManager.reload()`
 * from those events.
 *
 * Scope guarantees:
 *   - `apply: 'serve'` ensures the plugin is excluded from production
 *     builds. The matching production-safety test
 *     (`tests/build/no-dev-leak.test.ts`) asserts that none of this code
 *     leaks into the dist bundle.
 *   - We do not read or send file contents, only the manifest id and
 *     filesystem path. The client uses the id to look up its tracked URL.
 *
 * Concurrency:
 *   - Bursts of `change` events can fire (e.g., editor save-on-blur). The
 *     client bridge implements a coalesce-with-trailing-replay race policy
 *     so this plugin can stay simple and just dispatch every event.
 */

import type { Plugin as VitePlugin } from 'vite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';

/**
 * Best-effort regex to pull `id: '...'` (or `"..."`/`` `...` ``) out of a
 * `manifest = { ... id: '...' ... }` literal in a TS source file.
 *
 * Tolerates an inline type annotation (`manifest: PluginManifest = { ... }`)
 * by allowing arbitrary non-`{` characters between `manifest` and the
 * opening brace.
 *
 * This intentionally trades full TS-AST correctness for zero build-time
 * tooling cost: the worst failure mode is "we couldn't extract id; warn
 * once and skip this file" — never a false positive.
 */
const MANIFEST_ID_REGEX = /\bmanifest\b[^{]*\{[^}]*?\bid\s*:\s*['"`]([^'"`]+)['"`]/s;

const BUILTINS_DIR_REL = 'src/plugin/builtins';

export function pluginHotReload(): VitePlugin {
  const fileToId = new Map<string, string>();

  return {
    name: 'openrv:plugin-hot-reload',
    apply: 'serve',
    configureServer(server) {
      const builtinsDir = resolve(server.config.root, BUILTINS_DIR_REL);

      let entries: string[] = [];
      try {
        entries = readdirSync(builtinsDir);
      } catch (err) {
        console.warn(`[openrv:plugin-hot-reload] could not read ${builtinsDir}:`, err);
        return;
      }

      for (const name of entries) {
        if (!name.endsWith('.ts') || name.endsWith('.test.ts') || name.endsWith('.d.ts')) continue;
        const file = join(builtinsDir, name);
        try {
          const stat = statSync(file);
          if (!stat.isFile()) continue;
        } catch {
          continue;
        }

        try {
          const src = readFileSync(file, 'utf8');
          const m = MANIFEST_ID_REGEX.exec(src);
          if (m) {
            fileToId.set(file, m[1]);
          } else {
            console.warn(
              `[openrv:plugin-hot-reload] could not extract manifest.id from ${basename(
                file,
              )}; hot-reload will skip this file`,
            );
          }
        } catch (err) {
          console.warn(`[openrv:plugin-hot-reload] failed to read ${file}:`, err);
        }
      }

      if (fileToId.size === 0) {
        console.info('[openrv:plugin-hot-reload] no plugins matched; watcher idle');
      }

      server.watcher.on('change', (filePath) => {
        const id = fileToId.get(filePath);
        if (!id) return;
        server.ws.send({
          type: 'custom',
          event: 'openrv:plugin-hot-reload',
          data: { pluginId: id, filePath, ts: Date.now() },
        });
      });
    },
  };
}
