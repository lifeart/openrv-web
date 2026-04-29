# Plugin Development

This guide covers authoring plugins for OpenRV Web, with a focus on the dev-time hot-reload workflow that lets you iterate on a plugin module without restarting the host application.

For the user-facing plugin registration API, see [Scripting API → Plugin System](./scripting-api.md#plugin-system). For the public API reference, see the [API documentation](../api/index.md).

---

## Anatomy of a Plugin

A plugin is a module with a default export that satisfies the `Plugin` interface. Two on-disk locations are recognized:

| Location | Purpose |
|----------|---------|
| `src/plugin/builtins/<Name>Plugin.ts` | In-tree builtins shipped with the application. Watched by the dev-server hot-reload plugin. |
| `plugins/contrib/<name>/index.ts` | User-contributed plugins. Loaded explicitly by the host. |

A minimal plugin module looks like this:

```ts
import type { Plugin, PluginManifest, PluginContext } from '../types';

const manifest: PluginManifest = {
  id: 'com.example.my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  description: 'Short summary of what the plugin does.',
  contributes: ['blendMode'],
  // Optional fields:
  // dependencies: ['com.example.other-plugin'],
  // engineVersion: '1.0.0',
};

const MyPlugin: Plugin = {
  manifest,
  activate(context: PluginContext) {
    // Register contributions here.
  },
};

export default MyPlugin;
```

The full `Plugin` and `PluginManifest` shapes live in [`src/plugin/types.ts`](https://github.com/lifeart/openrv-web/blob/master/src/plugin/types.ts).

### Required and recommended manifest fields

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | Reverse-domain string (e.g., `openrv.sample.hot-reload-demo`). Must be a literal string in the source — see [Manifest Parser Constraint](#manifest-parser-constraint). |
| `name` | yes | Human-readable label. |
| `version` | yes | Semantic version. |
| `description` | recommended | Short summary surfaced in plugin lists. |
| `contributes` | yes | Array of `PluginContributionType` values declaring what the plugin registers. |
| `dependencies` | optional | Array of plugin ids that must be active before this one. |
| `engineVersion` | optional | Minimum host application version (semver). |

::: tip `processor` is not a contribution type today
The `PluginContributionType` union is `'decoder' | 'node' | 'tool' | 'exporter' | 'blendMode' | 'uiPanel'`. A `'processor'` entry is reserved for a future release; declaring it today will fail validation.
:::

---

## Lifecycle Hooks

Six optional/required hooks run in this order across a plugin's lifetime:

| Hook | When called | Purpose |
|------|-------------|---------|
| `init(ctx?)` | After registration, before `activate()` | One-time pre-activation setup — allocate buffers, validate environment. Throwing here prevents activation. |
| `activate(ctx)` | After `init()`, after dependencies are active | **Required.** Register contributions on `ctx`. The registry tracks every registration so it can be unwound on deactivate. |
| `deactivate(ctx?)` | Before `dispose()` or before a hot-reload swap | Symmetric counterpart to `activate()`. Contributions are unregistered automatically by the registry — this hook is for plugin-internal bookkeeping. |
| `dispose(ctx?)` | Final tear-down (or before a hot-reload swap) | Release any resources allocated in `init()` or `activate()`. After this the plugin instance is gone. |
| `getState(ctx?)` | During hot-reload, before the old version is disposed | Return a structurally cloneable **copy** of in-memory state. The HotReloadManager defensively re-clones the result. |
| `restoreState(state, ctx?)` | During hot-reload, after the new version is activated | Receive the snapshot from the previous version and rehydrate. Called once with the cloned state. |

Hooks may be `async`. The registry awaits each hook before advancing the state machine.

---

## Contributions

A plugin registers capabilities via methods on the `PluginContext` object passed to `activate()`. Six contribution types are supported today:

| Type | Method | One-line summary |
|------|--------|------------------|
| `decoder` | `context.registerDecoder(decoder)` | Add support for an additional image or video format. |
| `node` | `context.registerNode(type, factory)` | Register a custom processing node for the render graph. |
| `tool` | `context.registerTool(name, factory)` | Add a custom paint / annotation tool. |
| `exporter` | `context.registerExporter(name, exporter)` | Add a custom export format (blob or text variants). |
| `blendMode` | `context.registerBlendMode(name, blendFn)` | Add a per-channel blend mode beyond the built-in set. |
| `uiPanel` | `context.registerUIPanel(panel)` | Inject a dockable panel into the application layout. |

Every registration is scoped per-plugin and torn down automatically when the plugin deactivates.

---

## Hot-Reload Workflow

The dev-server hot-reload bridge re-imports a plugin's source file with cache-busting whenever it changes on disk, preserving in-memory state across the swap.

To exercise the workflow with the bundled `SamplePlugin`:

1. Start the dev server: `pnpm dev`.
2. Open the app in the browser and (optionally) interact with the sample plugin so its internal counter / event Map have non-zero values.
3. Edit `src/plugin/builtins/SamplePlugin.ts` and save — change the blend mode label, log message, anything observable.
4. Watch the browser console for a line like:

   ```text
   [hot-reload] reloaded "openrv.sample.hot-reload-demo"
   ```

5. Verify state survived: the counter is unchanged, the Map still contains its prior keys, the scratch ArrayBuffer is intact.

If the new module fails to import (syntax error, runtime error in `init` / `activate`), the old plugin is left running untouched. Fix the error, save again, and the bridge will re-attempt.

---

## Implementing `getState` / `restoreState`

These are the only hooks that distinguish a hot-reloadable plugin from a "reload-but-lose-state" one.

See [Scripting API → Hot-Reload State Preservation](./scripting-api.md#hot-reload-state-preservation) for the user-facing description of the hooks. The contract:

- **Cloneability.** The value returned from `getState()` must be compatible with `structuredClone`. That covers `Map`, `Set`, `ArrayBuffer`, typed arrays, plain objects, arrays, and cyclic references. Functions, DOM nodes, class instances with private fields, and GPU resources are **not** cloneable.
- **Single-use snapshot.** The captured state is forwarded to `restoreState()` exactly once and then discarded. Do not assume `restoreState()` will be called multiple times.
- **Fallback semantics.** If `structuredClone` throws `DataCloneError`, the manager logs a `[hot-reload:<pluginId>] structuredClone failed …` warning and forwards the **raw reference**. Treat this warning as a bug to fix in `getState()`.
- **Return a copy.** Even though the manager re-clones defensively, `getState()` itself should hand back a copy so subsequent live mutations do not leak into the snapshot before cloning happens.

### Should I implement `getState`?

Decision tree:

- **Stateless registrant** (decoder, node factory, blend mode with no internal counters) → **no.** Re-running `activate()` reproduces the registration. Skip the hooks.
- **In-memory data the user touched** (annotation list, undo history, panel scroll position, accumulated metrics) → **yes.** Implementing `getState` / `restoreState` is the difference between hot-reload feeling magical and feeling like a page refresh.
- **WebGL / WebGPU resource ownership** → **no, but** make sure `dispose()` releases the resource cleanly so the new instance can re-allocate from scratch. GPU handles are not structurally cloneable.

---

## Race Semantics

The dev-server emits one HMR event per save. Editor "save-on-blur" or rapid edits can produce bursts. The client bridge applies a **coalesce-with-trailing-replay** policy:

- At most one reload runs per plugin at a time.
- If additional events arrive while a reload is in flight, they collapse into a single trailing replay (because the pending set is keyed by plugin id).
- The trailing replay re-evaluates fresh on-disk state at execution time — not at the time it was queued — so the latest content always wins.

The result is "burst of saves → one reload now, one more after that finishes" rather than "burst of saves → N parallel re-imports racing each other".

---

## Force-Reload from the Dev Console

The bridge installs a `__openrvDev` handle on `window` for manual triggering. It only exists in dev builds (the production-safety test asserts the symbol does not appear in `dist`).

```js
// Reload a specific plugin by id.
window.__openrvDev?.reloadPlugin('openrv.sample.hot-reload-demo');

// Inspect which plugins are tracked for hot-reload.
window.__openrvDev?.listTrackedPlugins();
```

Useful when you want to reload without modifying the file (for example to verify `getState` / `restoreState` round-trips cleanly).

---

## Sample Plugin Walkthrough

`SamplePlugin` is a reference plugin shipped under `src/plugin/builtins/`. Its `_state` shape (counter, event Map, ArrayBuffer scratch) is intentionally chosen to exercise the `structuredClone` path inside `HotReloadManager.deepCloneState`.

The full source, embedded live from the repository:

<<< @/../src/plugin/builtins/SamplePlugin.ts

Things to notice in the code above:

- **State shape.** `counter`, `events: Map<string, number>`, and `scratch: ArrayBuffer` together cover the three non-trivial cases the deep-clone path handles.
- **`init` vs `activate`.** `init` allocates the ArrayBuffer once; `activate` registers the blend mode. After hot-reload, `restoreState()` overwrites the freshly-allocated buffer with the cloned snapshot.
- **`getState` returns a copy.** New `Map(this._state.events)` and `this._state.scratch.slice(0)` produce independent copies even though the manager re-clones afterwards.
- **`restoreState` defends against schema drift.** Every field has a default (`?? 0`, `new Map()`, `new ArrayBuffer(16)`). A future schema change does not blow up an in-flight reload.
- **Realm-tolerant type checks.** `instanceof Map` / `instanceof ArrayBuffer` can return `false` across realms (jsdom, structuredClone-as-a-test-harness, iframes). The duck-typing helpers (`isMapLike`, `isArrayBufferLike`) keep the same code working in unit tests and the real browser.

---

## Schema-Change Recovery

Hot-reload is most useful when iterating on plugin internals. Three common kinds of state-shape drift have well-defined responses:

- **Adding a field.** `restoreState` should `??` defaults so older snapshots without the new field still rehydrate cleanly:

  ```ts
  restoreState(state: unknown) {
    const s = (state ?? {}) as Partial<MyState>;
    this._state = {
      counter: s.counter ?? 0,
      newField: s.newField ?? 'default',
    };
  }
  ```

- **Removing a field.** Ignore unknown keys — destructure or pick only the fields you care about and let the extras fall through.
- **Incompatible type change.** Throw from `restoreState`. The manager logs a `[hot-reload:<pluginId>] restoreState() threw:` warning and the new plugin instance starts fresh (without the snapshot). The plugin remains active; only the carried-over state is dropped.

---

## What Survives a Reload (and What Doesn't)

**Survives:**

- **Contribution registrations.** The registry unregisters the old plugin's contributions and then re-registers the new plugin's. Anything that was registered via `context.register*()` is carried across the swap.
- **Plugin state.** Anything captured by `getState()` and rehydrated by `restoreState()` (subject to the cloneability contract above).
- **Settings.** Values stored via `PluginSettingsStore` (localStorage-backed) are unaffected by hot-reload — they are not part of the in-memory state machine.

**Does NOT survive:**

- **Event-bus subscriptions made in `activate()`** are torn down by `deactivate()` and then re-established when the new instance's `activate()` runs. No special handling needed if you subscribe in `activate()`.
- **Event-bus subscriptions made at module top level** are **NOT** re-run on hot-reload. The new module is imported once with cache-busting, but module-level side effects only fire on first import. If you subscribe at module scope, your subscription will be broken after the first reload.

::: warning Subscribe in `activate()`, never at module top level
Module-level subscriptions look convenient but break under hot-reload. Always perform side effects (subscriptions, timers, DOM listeners) inside `activate()` so they are re-established on every reload cycle.
:::

---

## Manifest Parser Constraint

The dev-server's manifest scan in [`scripts/vite/pluginHotReload.ts`](https://github.com/lifeart/openrv-web/blob/master/scripts/vite/pluginHotReload.ts) uses a strict literal regex to extract `manifest.id`:

```text
/\bmanifest\b[^{]*\{[^}]*?\bid\s*:\s*['"`]([^'"`]+)['"`]/s
```

This means the parser only recognises **literal** id strings:

- ✅ `id: 'openrv.sample.hot-reload-demo'`
- ✅ `id: "openrv.sample.hot-reload-demo"`
- ✅ ` id: ` `` `openrv.sample.hot-reload-demo` ``
- ❌ `id: PLUGIN_ID` (imported constant — not detected)
- ❌ `id: \`openrv.${name}\`` (template with interpolation — not detected)
- ❌ `id` as destructured shorthand from an outer object — not detected

If the parser cannot extract an id, it logs a one-line warning and skips that file for hot-reload. The plugin still loads at startup; only the file-watcher integration is disabled. Keep `id: 'literal-string'` as a literal in your manifest to opt in.

---

## Allowlist Gotcha (DEV)

The plugin registry validates URLs against an allowlist before importing. The DEV bootstrap calls `setAllowedOrigins([window.location.origin])`, which covers all dev-time reloads driven by the dev server (they all serve from the same origin).

If you need to load a plugin from an external URL — typically only useful in custom embedding scenarios — you must explicitly add that origin via `setAllowedOrigins([...existing, 'https://other.example.com'])`. The allowlist is intentional defence-in-depth; the dev bridge does not bypass it.

---

## `optimizeDeps` Caveat

Vite pre-bundles dependencies declared via `optimizeDeps`. If your plugin imports a dependency that is in `vite.config.ts`'s `optimizeDeps.include` (or that Vite auto-included), changes to that dep are **not** picked up by plugin hot-reload alone — the pre-bundled artefact is stale.

When iterating on a plugin that imports an `optimizeDeps`-bundled dependency, restart the dev server (`Ctrl-C`, `pnpm dev`) to rebuild the dep graph.

---

## Dependency-Aware Reload Semantics (v1 limitation)

Plugins with `manifest.dependencies` are **not** cascade-reloaded in v1. If plugin B depends on plugin A and you hot-reload A, B is not reloaded — its references to A's contributions may now be stale, and behaviour is undefined.

Workaround: reload manually in dependency order via `window.__openrvDev?.reloadPlugin(...)`, leaf-first.

Future work: a registry-wide reload mutex with topological-order cascade. Tracked separately from MED-19.

---

## Related Pages

- [Scripting API](./scripting-api.md) — public `window.openrv` surface, plugin registration, event subscription
- [API Reference](../api/index.md) — generated TypeScript API documentation
