# openrv-web

## Classes

- [AudioAPI](classes/AudioAPI.md)
- [ColorAPI](classes/ColorAPI.md)
- [EventsAPI](classes/EventsAPI.md)
- [LoopAPI](classes/LoopAPI.md)
- [MarkersAPI](classes/MarkersAPI.md)
- [MediaAPI](classes/MediaAPI.md)
- [OpenRVAPI](classes/OpenRVAPI.md)
- [PlaybackAPI](classes/PlaybackAPI.md)
- [ViewAPI](classes/ViewAPI.md)

## Interfaces

- [BlendModeContribution](interfaces/BlendModeContribution.md)
- [CDLProvider](interfaces/CDLProvider.md)
- [ColorAdjustmentProvider](interfaces/ColorAdjustmentProvider.md)
- [CurvesProvider](interfaces/CurvesProvider.md)
- [MarkerInfo](interfaces/MarkerInfo.md)
- [OpenRVAPIConfig](interfaces/OpenRVAPIConfig.md)
- [OpenRVEventData](interfaces/OpenRVEventData.md)
- [Plugin](interfaces/Plugin.md)
- [PluginContext](interfaces/PluginContext.md)
- [PluginManifest](interfaces/PluginManifest.md)
- [PublicColorAdjustments](interfaces/PublicColorAdjustments.md)
- [PublicColorCurvesData](interfaces/PublicColorCurvesData.md)
- [PublicColorCurvesUpdate](interfaces/PublicColorCurvesUpdate.md)
- [SourceInfo](interfaces/SourceInfo.md)
- [UIPanelContribution](interfaces/UIPanelContribution.md)
- [ViewerProvider](interfaces/ViewerProvider.md)

## Type Aliases

### ExporterContribution

> **ExporterContribution** = `BlobExporterContribution` \| `TextExporterContribution`

Defined in: [plugin/types.ts:178](https://github.com/lifeart/openrv-web/blob/c0dd53144dcb872c686e6581e476322380198403/src/plugin/types.ts#L178)

Union of all exporter contribution types

***

### OpenRVEventName

> **OpenRVEventName** = `"frameChange"` \| `"play"` \| `"pause"` \| `"stop"` \| `"speedChange"` \| `"volumeChange"` \| `"muteChange"` \| `"audioScrubEnabledChange"` \| `"loopModeChange"` \| `"inOutChange"` \| `"markerChange"` \| `"sourceLoadingStarted"` \| `"sourceLoaded"` \| `"sourceLoadFailed"` \| `"viewTransformChanged"` \| `"renderedImagesChanged"` \| `"representationChanged"` \| `"fallbackActivated"` \| `"playlistEnded"` \| `"error"`

Defined in: [api/EventsAPI.ts:15](https://github.com/lifeart/openrv-web/blob/c0dd53144dcb872c686e6581e476322380198403/src/api/EventsAPI.ts#L15)

Events that can be subscribed to via the public API

***

### PluginContributionType

> **PluginContributionType** = `"decoder"` \| `"node"` \| `"tool"` \| `"exporter"` \| `"blendMode"` \| `"uiPanel"`

Defined in: [plugin/types.ts:44](https://github.com/lifeart/openrv-web/blob/c0dd53144dcb872c686e6581e476322380198403/src/plugin/types.ts#L44)

***

### PluginId

> **PluginId** = `string`

Defined in: [plugin/types.ts:17](https://github.com/lifeart/openrv-web/blob/c0dd53144dcb872c686e6581e476322380198403/src/plugin/types.ts#L17)

Unique plugin identifier, reverse-domain style: "com.example.myformat"

***

### PluginState

> **PluginState** = `"registered"` \| `"initialized"` \| `"active"` \| `"inactive"` \| `"disposed"` \| `"error"`

Defined in: [plugin/types.ts:57](https://github.com/lifeart/openrv-web/blob/c0dd53144dcb872c686e6581e476322380198403/src/plugin/types.ts#L57)

---

## Plugin Event Subscription

The `PluginEventSubscription` interface is provided to each plugin via `context.events`. All subscriptions are tracked per-plugin and automatically cleaned up on deactivation.

Defined in: [plugin/PluginEventBus.ts](https://github.com/lifeart/openrv-web/blob/c0dd53144dcb872c686e6581e476322380198403/src/plugin/PluginEventBus.ts)

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `onApp` | `onApp<K>(event: AppEventName, callback: (data) => void): () => void` | Subscribe to an application or plugin lifecycle event. Returns an unsubscribe function. |
| `onceApp` | `onceApp<K>(event: AppEventName, callback: (data) => void): () => void` | One-shot subscription to an application event. Automatically unsubscribes after the first invocation. |
| `onPlugin` | `onPlugin(event: string, callback: (data: unknown) => void): () => void` | Subscribe to a custom plugin-to-plugin event. Events are namespaced as `"{pluginId}:{eventName}"`. |
| `emitPlugin` | `emitPlugin(event: string, data: unknown): void` | Emit a custom plugin event. The event name is automatically prefixed with the emitting plugin's ID. |

### App Events Available to Plugins

Application events are prefixed with `app:` and map directly to the corresponding `OpenRVEventName` values from the public API:

| Event | Data | Status |
|-------|------|--------|
| `app:frameChange` | `{ frame }` | Active |
| `app:play` | (none) | Active |
| `app:pause` | (none) | Active |
| `app:stop` | (none) | Active |
| `app:speedChange` | `{ speed }` | Active |
| `app:volumeChange` | `{ volume }` | Active |
| `app:muteChange` | `{ muted }` | Active |
| `app:audioScrubEnabledChange` | `{ enabled }` | Active |
| `app:loopModeChange` | `{ mode }` | Active |
| `app:inOutChange` | `{ inPoint, outPoint }` | Active |
| `app:markerChange` | `{ markers: [{ frame, note, color }] }` | Active |
| `app:sourceLoadingStarted` | `{ name }` | Active |
| `app:sourceLoaded` | `{ name, type, width, height, duration, fps }` | Active |
| `app:sourceLoadFailed` | `{ name, error }` | Active |
| `app:viewTransformChanged` | `{ transform }` | Active |
| `app:renderedImagesChanged` | `{ images }` | Active |
| `app:representationChanged` | `{ representationId, kind }` | Active |
| `app:fallbackActivated` | `{ representationId, reason }` | Active |
| `app:playlistEnded` | (none) | Active |
| `app:error` | `{ message, code? }` | Active |

### Plugin Lifecycle Events

| Event | Data | Description |
|-------|------|-------------|
| `plugin:activated` | `{ id: PluginId }` | Fired when any plugin is activated |
| `plugin:deactivated` | `{ id: PluginId }` | Fired when any plugin is deactivated |
| `plugin:error` | `{ id: PluginId, error: string }` | Fired when a plugin encounters an error |

---

## Plugin Settings Accessor

The `PluginSettingsAccessor` interface is provided to each plugin via `context.settings`. It requires a `settingsSchema` in the plugin manifest.

Defined in: [plugin/PluginSettingsStore.ts](https://github.com/lifeart/openrv-web/blob/c0dd53144dcb872c686e6581e476322380198403/src/plugin/PluginSettingsStore.ts)

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

## HotReloadManager (Dev-only / Internal)

> **Warning:** This class is **not part of the public API**. It lives under `src/plugin/dev/` and is **not exported** from `src/api/index.ts`. It is intended for development-time use only and may change or be removed without notice. Do not depend on it in production plugin code.

Development-time hot reload support for plugins. Allows reloading plugin modules without restarting the application, optionally preserving state across reloads via `getState()`/`restoreState()` lifecycle hooks.

Defined in: [plugin/dev/HotReloadManager.ts](https://github.com/lifeart/openrv-web/blob/c0dd53144dcb872c686e6581e476322380198403/src/plugin/dev/HotReloadManager.ts)

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `trackURL` | `trackURL(pluginId: PluginId, url: string): void` | Register a plugin's source URL for hot-reload tracking. |
| `reload` | `reload(pluginId: PluginId): Promise<void>` | Reload a plugin: captures state, disposes the old version, re-imports with cache-busting, activates the new version, and restores state. |
| `getTrackedPlugins` | `getTrackedPlugins(): PluginId[]` | Returns all plugin IDs currently tracked for hot-reload. |
| `isTracked` | `isTracked(pluginId: PluginId): boolean` | Check if a plugin has a tracked URL for hot-reload. |
