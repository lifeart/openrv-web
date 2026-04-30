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
 *
 * Manifest-id rename handling:
 *   - On every `change` event we re-scan the file's `manifest.id`. If it
 *     differs from the previously cached id (developer renamed it), we
 *     dispatch the OLD id to the client (so the existing tracked URL is
 *     reloaded) and update our cache so subsequent edits track the new id.
 *     This avoids "No URL tracked" errors on the second save after rename.
 */

import type { Plugin as VitePlugin } from 'vite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';

/**
 * Pull `id: '...'` (or `"..."`/`` `...` ``) out of a top-level
 * `manifest = { ... id: '...' ... }` (or `manifest: { ... id: '...' }`
 * object-shorthand) declaration.
 *
 * Tightened against the previous, looser `\bmanifest\b[^{]*\{[^}]*?\bid\s*:`
 * pattern, which produced false positives when:
 *   - A comment / docstring contained the word "manifest" before an
 *     unrelated `{ id: ... }` literal further down.
 *   - A parent object used `manifest:` as a shorthand key wrapping another
 *     `{ id: ... }` literal (we matched the inner id).
 *   - The id was a template literal like `` `openrv.${name}` `` — we
 *     captured the literal string `openrv.${name}` as the plugin id.
 *
 * Anchoring rules of this regex:
 *   - `^[ \t]*` — declaration must start at line beginning (not inside a
 *     line comment / block-comment continuation).
 *   - First alternative requires `(export )? const|let|var manifest` —
 *     a top-level binding, not a nested `manifest:` shorthand key.
 *   - Second alternative permits `manifest: { ... }` when it appears at
 *     line start with leading whitespace only (e.g., re-exported manifest
 *     literal in a top-level export object). In practice neither in-tree
 *     plugin uses this form, but we keep it for forward compatibility.
 *   - `[^'"`$]+` in the captured id rejects `${` so template literals
 *     don't capture the literal `${name}` as the plugin id; the caller
 *     warns and skips when no match is found.
 *
 * Failure mode: when the developer uses an unusual declaration shape we
 * can't recognize, we warn once and skip — never a false positive.
 */
const MANIFEST_ID_REGEX =
  /^(?:[ \t]*(?:export\s+)?(?:const|let|var)\s+manifest\s*(?::\s*\w+\s*)?=\s*\{[\s\S]*?\bid\s*:\s*['"`]([^'"`$]+)['"`]|[ \t]*manifest\s*:\s*\{[\s\S]*?\bid\s*:\s*['"`]([^'"`$]+)['"`])/m;

const BUILTINS_DIR_REL = 'src/plugin/builtins';

/**
 * Extract a top-level plugin manifest id from TS source.
 * Exported for unit tests. Returns null when no match (or template-literal
 * id that we deliberately reject) so callers can warn-and-skip.
 */
export function extractManifestId(src: string): string | null {
  const m = MANIFEST_ID_REGEX.exec(src);
  if (!m) return null;
  return m[1] ?? m[2] ?? null;
}

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
        } catch (err) {
          // Per global rule "No Silent Error Swallowing": surface stat
          // failures so a missing/permission-denied file can be diagnosed
          // rather than being silently dropped from the watch set.
          console.warn(`[openrv:plugin-hot-reload] failed to stat ${file}:`, err);
          continue;
        }

        try {
          const src = readFileSync(file, 'utf8');
          const id = extractManifestId(src);
          if (id) {
            fileToId.set(file, id);
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
        const previousId = fileToId.get(filePath);
        if (!previousId) return;

        // Re-scan on every change so a developer renaming `manifest.id`
        // doesn't break subsequent reloads. We dispatch the *previous* id
        // (the one the client already has tracked) and refresh our cache
        // so the next save uses the new id.
        let currentId: string = previousId;
        try {
          const src = readFileSync(filePath, 'utf8');
          const scanned = extractManifestId(src);
          if (scanned) {
            currentId = scanned;
          } else {
            console.warn(
              `[openrv:plugin-hot-reload] could not extract manifest.id from ${basename(
                filePath,
              )} after change; reusing previous id "${previousId}"`,
            );
          }
        } catch (err) {
          console.warn(
            `[openrv:plugin-hot-reload] failed to re-read ${basename(filePath)} after change; reusing previous id "${previousId}":`,
            err,
          );
        }

        if (currentId !== previousId) {
          console.warn(
            `[openrv:plugin-hot-reload] manifest.id changed in ${basename(
              filePath,
            )}: "${previousId}" -> "${currentId}". Hot-reload will dispatch the previous id this round; the client will re-track on the new 'active' transition.`,
          );
          fileToId.set(filePath, currentId);
        }

        server.ws.send({
          type: 'custom',
          event: 'openrv:plugin-hot-reload',
          data: { pluginId: previousId, filePath, ts: Date.now() },
        });
      });
    },
  };
}
