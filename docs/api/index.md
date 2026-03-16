# openrv-web

## Classes

- `AudioAPI` — Volume, mute, pitch correction, audio scrub control
- `ColorAPI` — Color adjustments, CDL, curves
- `EventsAPI` — Public event subscription system (on/off/once)
- `LoopAPI` — Loop mode and in/out point control
- `MarkersAPI` — Timeline marker management
- `MediaAPI` — Source information, resolution, duration, FPS
- `OpenRVAPI` — Top-level API facade exposed at `window.openrv`
- `PlaybackAPI` — Play, pause, seek, step, speed control
- `SequenceAPI` — Image sequence inspection, missing-frame detection
- `ViewAPI` — Zoom, pan, fit modes, channel isolation

## Interfaces

- `BlendModeContribution` — Plugin contribution for custom blend modes
- `CDLProvider` — Color Decision List (slope/offset/power/saturation) data
- `ColorAdjustmentProvider` — Primary color correction values
- `CurvesProvider` — Per-channel curve point data
- `MarkerInfo` — Marker with frame, note, color, and optional duration
- `OpenRVAPIConfig` — Configuration passed to `OpenRVAPI` constructor
- `OpenRVEventData` — Event data types for each `OpenRVEventName`
- `Plugin` — Plugin definition with lifecycle hooks
- `PluginContext` — Context provided to plugin `activate()` / `deactivate()`
- `PluginManifest` — Plugin metadata (id, name, version, dependencies)
- `PublicColorAdjustments` — All color adjustment properties
- `PublicColorCurvesData` — Full curves state (master + per-channel)
- `PublicColorCurvesUpdate` — Partial curves update payload
- `SourceInfo` — Loaded source metadata (name, type, dimensions, fps)
- `UIPanelContribution` — Plugin contribution for custom UI panels
- `ViewerProvider` — Viewer abstraction used by the API layer

## Type Aliases

### ExporterContribution

> **ExporterContribution** = `BlobExporterContribution` \| `TextExporterContribution`

Defined in: [plugin/types.ts:178](https://github.com/lifeart/openrv-web/blob/855018687f3c1558e450abc7baf6913f0784de0e/src/plugin/types.ts#L178)

Union of all exporter contribution types

***

### OpenRVEventName

> **OpenRVEventName** = `"frameChange"` \| `"play"` \| `"pause"` \| `"stop"` \| `"speedChange"` \| `"volumeChange"` \| `"muteChange"` \| `"audioScrubEnabledChange"` \| `"loopModeChange"` \| `"inOutChange"` \| `"markerChange"` \| `"sourceLoadingStarted"` \| `"sourceLoaded"` \| `"sourceLoadFailed"` \| `"viewTransformChanged"` \| `"renderedImagesChanged"` \| `"representationChanged"` \| `"fallbackActivated"` \| `"playlistEnded"` \| `"error"`

Defined in: [api/EventsAPI.ts:15](https://github.com/lifeart/openrv-web/blob/855018687f3c1558e450abc7baf6913f0784de0e/src/api/EventsAPI.ts#L15)

Events that can be subscribed to via the public API

***

### PluginContributionType

> **PluginContributionType** = `"decoder"` \| `"node"` \| `"processor"` \| `"tool"` \| `"exporter"` \| `"blendMode"` \| `"uiPanel"`

Defined in: [plugin/types.ts:44](https://github.com/lifeart/openrv-web/blob/855018687f3c1558e450abc7baf6913f0784de0e/src/plugin/types.ts#L44)

***

### PluginId

> **PluginId** = `string`

Defined in: [plugin/types.ts:17](https://github.com/lifeart/openrv-web/blob/855018687f3c1558e450abc7baf6913f0784de0e/src/plugin/types.ts#L17)

Unique plugin identifier, reverse-domain style: "com.example.myformat"

***

### PluginState

> **PluginState** = `"registered"` \| `"initialized"` \| `"active"` \| `"inactive"` \| `"disposed"` \| `"error"`

Defined in: [plugin/types.ts:57](https://github.com/lifeart/openrv-web/blob/855018687f3c1558e450abc7baf6913f0784de0e/src/plugin/types.ts#L57)

---

## Plugin Event Subscription

The `PluginEventSubscription` interface is provided to each plugin via `context.events`. All subscriptions are tracked per-plugin and automatically cleaned up on deactivation.

Defined in: [plugin/PluginEventBus.ts](https://github.com/lifeart/openrv-web/blob/855018687f3c1558e450abc7baf6913f0784de0e/src/plugin/PluginEventBus.ts)

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `onApp` | `onApp<K>(event: AppEventName, callback: (data) => void): () => void` | Subscribe to an application or plugin lifecycle event. Returns an unsubscribe function. |
| `onceApp` | `onceApp<K>(event: AppEventName, callback: (data) => void): () => void` | One-shot subscription to an application event. Automatically unsubscribes after the first invocation. |
| `onPlugin` | `onPlugin(event: string, callback: (data: unknown) => void): () => void` | Subscribe to a custom plugin-to-plugin event. Events are namespaced as `"{pluginId}:{eventName}"`. |
| `emitPlugin` | `emitPlugin(event: string, data: unknown): void` | Emit a custom plugin event. The event name is automatically prefixed with the emitting plugin's ID. |

### App Events Available to Plugins

Application events are prefixed with `app:` and map directly to the corresponding `OpenRVEventName` values from the public API:

| Event | Data |
|-------|------|
| `app:frameChange` | `{ frame }` |
| `app:play` | (none) |
| `app:pause` | (none) |
| `app:stop` | (none) |
| `app:speedChange` | `{ speed }` |
| `app:volumeChange` | `{ volume }` |
| `app:muteChange` | `{ muted }` |
| `app:audioScrubEnabledChange` | `{ enabled }` |
| `app:loopModeChange` | `{ mode }` |
| `app:inOutChange` | `{ inPoint, outPoint }` |
| `app:markerChange` | `{ markers: [{ frame, note, color }] }` |
| `app:sourceLoaded` | `{ name, type, width, height, duration, fps }` |
| `app:error` | `{ message, code? }` |

### Plugin Lifecycle Events

| Event | Data | Description |
|-------|------|-------------|
| `plugin:activated` | `{ id: PluginId }` | Fired when any plugin is activated |
| `plugin:deactivated` | `{ id: PluginId }` | Fired when any plugin is deactivated |
| `plugin:error` | `{ id: PluginId, error: string }` | Fired when a plugin encounters an error |

---

## Plugin Settings Accessor

The `PluginSettingsAccessor` interface is provided to each plugin via `context.settings`. It requires a `settingsSchema` in the plugin manifest.

Defined in: [plugin/PluginSettingsStore.ts](https://github.com/lifeart/openrv-web/blob/855018687f3c1558e450abc7baf6913f0784de0e/src/plugin/PluginSettingsStore.ts)

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `get<T>(key: string): T` | Get a single setting value by key. Returns the stored value or the schema default. |
| `set` | `set(key: string, value: unknown): void` | Set a single setting value. Validates against the schema and persists to localStorage. |
| `getAll` | `getAll(): Record<string, unknown>` | Get all settings as a key-value map. |
| `onChange` | `onChange(key: string, callback: (value, oldValue) => void): () => void` | Subscribe to changes on a specific setting key. Returns an unsubscribe function. |
| `reset` | `reset(): void` | Reset all settings to their schema-defined defaults. |

### Setting Types

Settings are validated against their declared type:

| Type | Value | Constraints |
|------|-------|-------------|
| `string` | `string` | Optional `maxLength`, `placeholder` |
| `number` | `number` | Optional `min`, `max`, `step` |
| `boolean` | `boolean` | -- |
| `select` | `string` | Must match one of the declared `options` |
| `color` | `string` | Hex color format (e.g., `#ff0000`) |
| `range` | `number` | Required `min`, `max`, optional `step` |

---

## HotReloadManager

Development-time hot reload support for plugins. Allows reloading plugin modules without restarting the application, optionally preserving state across reloads via `getState()`/`restoreState()` lifecycle hooks.

Defined in: [plugin/dev/HotReloadManager.ts](https://github.com/lifeart/openrv-web/blob/855018687f3c1558e450abc7baf6913f0784de0e/src/plugin/dev/HotReloadManager.ts)

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `trackURL` | `trackURL(pluginId: PluginId, url: string): void` | Register a plugin's source URL for hot-reload tracking. |
| `reload` | `reload(pluginId: PluginId): Promise<void>` | Reload a plugin: captures state, disposes the old version, re-imports with cache-busting, activates the new version, and restores state. |
| `getTrackedPlugins` | `getTrackedPlugins(): PluginId[]` | Returns all plugin IDs currently tracked for hot-reload. |
| `isTracked` | `isTracked(pluginId: PluginId): boolean` | Check if a plugin has a tracked URL for hot-reload. |
