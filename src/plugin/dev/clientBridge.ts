/**
 * Client-side bridge between the Vite dev-server plugin
 * (`scripts/vite/pluginHotReload.ts`) and the {@link HotReloadManager}.
 *
 * Responsibilities:
 *   - Track each plugin's URL when it reaches `'active'` state, so that
 *     `HotReloadManager.reload()` can re-import the file.
 *   - Listen for `openrv:plugin-hot-reload` HMR events emitted by the dev
 *     plugin and trigger a reload.
 *   - Apply a **coalesce-with-trailing-replay** race policy: at most one
 *     reload per plugin runs at a time; further events that arrive while a
 *     reload is in flight collapse into a single trailing replay so the
 *     final on-disk state always wins.
 *   - Expose a small `__openrvDev` handle on `window` for manual testing
 *     from the dev console.
 *
 * Production safety: this entire module is dynamically imported only from
 * a `import.meta.env.DEV` block in `main.ts`. The companion test
 * `tests/build/no-dev-leak.test.ts` asserts that none of these symbols
 * appear in the production bundle.
 */

import { HotReloadManager } from './HotReloadManager';
import { pluginRegistry } from '../PluginRegistry';
import type { PluginId } from '../types';

interface HotReloadPayload {
  pluginId: PluginId;
  filePath?: string;
  ts?: number;
}

/**
 * Convert a plugin id (reverse-domain string) to the file basename used in
 * `src/plugin/builtins/`.
 *
 * Heuristic-only: in-tree builtins don't enforce a 1:1 id↔filename mapping,
 * so we ship explicit mappings for shipped plugins and fall back to a
 * camel-cased "Plugin" suffix for everything else. If a future plugin
 * doesn't fit either rule, the developer can call
 * `manager.trackURL(id, url)` directly.
 */
function pluginIdToFileName(pluginId: string): string {
  if (pluginId === 'openrv.sample.hot-reload-demo') return 'SamplePlugin';
  if (pluginId === 'openrv.builtin.hdr-decoder') return 'HDRDecoderPlugin';

  // Generic fallback: take the last dot-segment, dash-to-camel, append "Plugin".
  const last = pluginId.split('.').pop() ?? pluginId;
  const camel = last.charAt(0).toUpperCase() + last.slice(1).replace(/-(.)/g, (_, c: string) => c.toUpperCase());
  return camel.endsWith('Plugin') ? camel : `${camel}Plugin`;
}

/**
 * Install the HMR bridge. Safe to call once during DEV bootstrap.
 *
 * Outside Vite's HMR context (e.g., when running plain unit tests that
 * import this module), the HMR listener is skipped but URL-tracking still
 * works — the manager and `__openrvDev` handle remain usable.
 */
export function installPluginHotReloadBridge(): void {
  const manager = new HotReloadManager(pluginRegistry);

  // Track URL when a plugin reaches 'active' state. We use 'active' (not
  // 'initialized') to match the actual state name emitted by the registry.
  pluginRegistry.pluginStateChanged.connect((current, _prev) => {
    if (current.state !== 'active') return;
    const url = `${window.location.origin}/${pluginIdToFileSrcPath(current.id)}`;
    manager.trackURL(current.id, url);
  });

  // Vite injects `import.meta.hot` only in dev. In production the truthy
  // check is statically evaluated to false and the entire block is dropped.
  if (import.meta.hot) {
    const inFlight = new Map<PluginId, Promise<unknown>>();
    const pending = new Set<PluginId>();

    const triggerReload = (pluginId: PluginId): void => {
      if (inFlight.has(pluginId)) {
        // A reload is already running — mark a trailing replay. Multiple
        // events while in-flight collapse into a single replay because
        // `pending` is a Set keyed by id.
        pending.add(pluginId);
        return;
      }

      const run = manager
        .reload(pluginId)
        .catch((err) => {
          console.error(`[hot-reload] failed for ${pluginId}:`, err);
          // Don't cascade-replay a broken edit; developer must save again.
          pending.delete(pluginId);
        })
        .finally(() => {
          inFlight.delete(pluginId);
          if (pending.delete(pluginId)) {
            // Re-run with a fresh cache-bust (captured inside next call).
            triggerReload(pluginId);
          }
        });

      inFlight.set(pluginId, run);
    };

    import.meta.hot.on('openrv:plugin-hot-reload', (data: HotReloadPayload) => {
      if (!data || typeof data.pluginId !== 'string') return;
      triggerReload(data.pluginId);
    });
  }

  // Dev-console handle — never attached in production because the entire
  // bridge is gated behind `import.meta.env.DEV` in main.ts.
  (window as Window & { __openrvDev?: unknown }).__openrvDev = {
    reloadPlugin: (id: PluginId) => manager.reload(id),
    listTrackedPlugins: () => manager.getTrackedPlugins(),
  };
}

/**
 * Map a plugin id to its source path under the dev server, e.g.
 * `openrv.sample.hot-reload-demo` -> `src/plugin/builtins/SamplePlugin.ts`.
 */
function pluginIdToFileSrcPath(pluginId: string): string {
  return `src/plugin/builtins/${pluginIdToFileName(pluginId)}.ts`;
}
