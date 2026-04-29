/**
 * Sample Hot-Reload Demo Plugin.
 *
 * Reference plugin used by developers to exercise the dev-time hot-reload
 * workflow (`HotReloadManager.reload`). It contributes a single, lightweight
 * blend mode so registration is easy to observe and has no GPU side effects.
 *
 * The plugin keeps an internal `_state` containing a counter, an event-count
 * Map, and a small ArrayBuffer scratch region. The shape is chosen to
 * exercise the structuredClone path inside `HotReloadManager.deepCloneState`
 * (Maps and ArrayBuffers are non-trivial to clone).
 *
 * Lifecycle hook semantics:
 *   - `init`     : one-time allocation of the scratch buffer + counter reset
 *   - `activate` : registers the demo blend mode on the host context
 *   - `deactivate`: balances `activate`; the registry tracks contributions
 *                   and unregisters them automatically, so this hook is a
 *                   bookkeeping / log-only step
 *   - `dispose`  : releases the scratch buffer
 *   - `getState` : returns a *copy* (per Plugin contract); HotReloadManager
 *                  defensively re-clones the result before restoring
 *   - `restoreState`: rehydrates with sensible defaults so future shape
 *                     changes degrade gracefully
 */

import type { Plugin, PluginManifest, PluginContext, BlendModeContribution } from '../types';

const manifest: PluginManifest = {
  id: 'openrv.sample.hot-reload-demo',
  name: 'Sample Hot-Reload Demo Plugin',
  version: '1.0.0',
  description: 'Reference plugin demonstrating the dev-time hot-reload workflow with state preservation.',
  author: 'OpenRV Team',
  license: 'Apache-2.0',
  contributes: ['blendMode'],
};

/** Internal state shape, exercised by structuredClone during hot-reload. */
interface SamplePluginState {
  counter: number;
  events: Map<string, number>;
  scratch: ArrayBuffer;
}

const BLEND_MODE_NAME = 'sample-demo-average';

/** Lightweight demo blend mode: arithmetic mean of base and top channels. */
const demoBlendMode: BlendModeContribution = {
  label: 'Sample Demo (Average)',
  blend(base: number, top: number): number {
    return (base + top) * 0.5;
  },
};

const SamplePlugin: Plugin & {
  /** Internal state — exposed for hot-reload state capture/restore. */
  _state: SamplePluginState;
} = {
  manifest,

  _state: {
    counter: 0,
    events: new Map<string, number>(),
    scratch: new ArrayBuffer(0),
  },

  init(context: PluginContext) {
    // One-time allocation. Hot-reload disposes the old plugin and inits the
    // new one; restoreState() will overwrite this scratch buffer if state
    // was preserved.
    this._state = {
      counter: 0,
      events: new Map<string, number>(),
      scratch: new ArrayBuffer(16),
    };
    context.log.info('Sample plugin initialized');
  },

  activate(context: PluginContext) {
    context.registerBlendMode(BLEND_MODE_NAME, demoBlendMode);
    this._state.counter += 1;
    this._state.events.set('activate', (this._state.events.get('activate') ?? 0) + 1);
    context.log.info(`Sample plugin activated (counter=${this._state.counter})`);
  },

  deactivate(context: PluginContext) {
    // Contributions registered during activate() are tracked by the
    // PluginRegistry and torn down via unregisterContributions(). We only
    // bump our internal event tally here.
    this._state.events.set('deactivate', (this._state.events.get('deactivate') ?? 0) + 1);
    context.log.info('Sample plugin deactivated');
  },

  dispose(context: PluginContext) {
    this._state.scratch = new ArrayBuffer(0);
    this._state.events.clear();
    context.log.info('Sample plugin disposed');
  },

  /**
   * Return a structurally-cloneable *copy* of internal state.
   *
   * The HotReloadManager will defensively re-clone whatever we return, but
   * the Plugin contract still asks getState() to hand out a copy so that
   * subsequent mutations to live state do not leak into the snapshot before
   * the manager has a chance to clone it.
   */
  getState(): unknown {
    return {
      counter: this._state.counter,
      events: new Map(this._state.events),
      scratch: this._state.scratch.slice(0),
    } satisfies SamplePluginState;
  },

  /**
   * Rehydrate from a snapshot produced by `getState()`.
   *
   * Defaults are applied for every field so a future schema change (e.g.,
   * adding a new field) does not blow up when restoring state from an older
   * plugin version during hot-reload.
   *
   * Note on type checks: `instanceof ArrayBuffer` / `instanceof Map` can
   * return `false` for values produced by `structuredClone` across realms
   * (e.g., jsdom/happy-dom test environments, iframes). We use duck-typing
   * (`Symbol.toStringTag` for Map, presence of `byteLength` + `slice` for
   * ArrayBuffer) so the same code path works whether the snapshot came
   * from this realm or was cloned in via the HotReloadManager.
   */
  restoreState(state: unknown): void {
    const s = (state ?? {}) as Partial<SamplePluginState>;
    this._state = {
      counter: typeof s.counter === 'number' ? s.counter : 0,
      events: isMapLike<string, number>(s.events) ? new Map(s.events) : new Map<string, number>(),
      scratch: isArrayBufferLike(s.scratch) ? s.scratch.slice(0) : new ArrayBuffer(16),
    };
  },
};

function isMapLike<K, V>(value: unknown): value is Map<K, V> {
  if (value instanceof Map) return true;
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.prototype.toString.call(value) === '[object Map]' &&
    typeof (value as Map<K, V>).entries === 'function' &&
    typeof (value as Map<K, V>).set === 'function'
  );
}

function isArrayBufferLike(value: unknown): value is ArrayBuffer {
  if (value instanceof ArrayBuffer) return true;
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.prototype.toString.call(value) === '[object ArrayBuffer]' &&
    typeof (value as ArrayBuffer).byteLength === 'number' &&
    typeof (value as ArrayBuffer).slice === 'function'
  );
}

export default SamplePlugin;
