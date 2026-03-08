# Implementation Plan: Plugin System Phase 2

> **Status:** P0 (Event Subscriptions), P1 (Settings), P2 (Hot-Reload) are **COMPLETE**
> (commits `338312e`, `c246ca8`, `eddd816`). P3 (Marketplace/Discovery) remains as future work.

## Phase 1 Recap (Current State)

- **Manifest-driven** with `PluginId`, `SemVer`, dependency declarations, cycle detection
- **Lifecycle**: register -> init -> activate -> deactivate -> dispose (topological ordering)
- **Contribution types**: decoder, node, processor, tool, exporter, blendMode, uiPanel
- **Dynamic loading**: `loadFromURL()` with origin allowlisting
- **Public API**: `window.openrv.plugins.{register, activate, deactivate, loadFromURL, getState, list}`
- **No event subscriptions** (explicitly deferred in `types.ts`)

## Phase 2 Priority Order

| Priority | Feature | Effort | Rationale |
|----------|---------|--------|-----------|
| **P0** | A. Plugin Event Subscriptions | Medium | Explicitly deferred in Phase 1. Most plugins need events. |
| **P1** | B. Plugin Settings/Preferences | Medium | Many plugins need config. Required before marketplace. |
| **P2** | D. Hot-Reload for Development | Small | Important for developer experience. Attracts plugin authors. |
| **P3** | C. Plugin Marketplace/Discovery | Large | Requires other features first. Largest scope. |

---

## A. Plugin Event Subscriptions

### Event Taxonomy

**Application events** (bridged from existing system):
- `app:frameChange`, `app:play`, `app:pause`, `app:stop`, `app:speedChange`
- `app:volumeChange`, `app:muteChange`, `app:loopModeChange`, `app:inOutChange`
- `app:markerChange`, `app:sourceLoaded`, `app:error`
- `plugin:activated`, `plugin:deactivated`, `plugin:error`

**Plugin-to-plugin events** (custom, namespaced):
- Arbitrary string keys prefixed with plugin ID: `com.example.myformat:decoded`

### Interface

```typescript
// src/plugin/PluginEventBus.ts

interface PluginEventSubscription {
  /** Subscribe to an application event */
  onApp<K extends AppEventName>(event: K, callback: (data: AppEventDataMap[K]) => void): () => void;
  /** Subscribe to a custom plugin event */
  onPlugin(event: PluginCustomEvent, callback: (data: unknown) => void): () => void;
  /** Emit a custom plugin event (namespaced to this plugin's id) */
  emitPlugin(event: string, data: unknown): void;
  /** One-shot subscription */
  onceApp<K extends AppEventName>(event: K, callback: (data: AppEventDataMap[K]) => void): () => void;
}
```

### Implementation

- `PluginEventBus` wraps `EventsAPI` for app events (read-only subscription)
- Separate `EventEmitter` instance for plugin custom events
- `emitPlugin('myEvent', data)` emits as `{pluginId}:myEvent`
- `PluginContext` gains `events: PluginEventSubscription`
- All subscriptions tracked per-plugin for auto-cleanup on deactivation

### Sandboxing

- Callbacks wrapped in try/catch (matching existing `EventEmitter.emit` pattern)
- Optional `maxListenersPerPlugin` config (default 50)
- Event data passed by reference (no deep clone) for performance

### Files

| File | Change |
|------|--------|
| `src/plugin/PluginEventBus.ts` | **New** |
| `src/plugin/types.ts` | Add `events` to `PluginContext`, add tracking |
| `src/plugin/PluginRegistry.ts` | Create bus, wire, track subscriptions, cleanup |
| `src/api/OpenRVAPI.ts` | Pass `EventsAPI` reference for wiring |

---

## B. Plugin Settings/Preferences

### Schema Format

```typescript
type PluginSettingType = 'string' | 'number' | 'boolean' | 'select' | 'color' | 'range';

interface PluginSetting {
  key: string;
  label: string;
  description?: string;
  type: PluginSettingType;
  default: unknown;
  // Type-specific: min, max, step, options, placeholder, maxLength
}

interface PluginSettingsSchema {
  settings: PluginSetting[];
}
```

`PluginManifest` gains optional `settingsSchema?: PluginSettingsSchema`.

### Storage Backend

Leverage existing `PreferencesManager` with namespaced keys:
```
openrv-plugin-settings:{pluginId}
```

```typescript
// src/plugin/PluginSettingsStore.ts
class PluginSettingsStore {
  getSettings(pluginId, schema): Record<string, unknown>;
  getSetting(pluginId, key, schema): unknown;
  setSetting(pluginId, key, value, schema): void;  // validated
  resetSettings(pluginId): void;
  exportAll(): Record<PluginId, Record<string, unknown>>;
  importAll(data): void;
}
```

### UI Generation

`PluginSettingsPanel` auto-generates form from schema:
- Each setting type -> DOM control (input, checkbox, select, color picker, range)
- Changes persisted immediately
- "Reset to Defaults" per plugin

### Plugin Context API

```typescript
readonly settings: {
  get<T = unknown>(key: string): T;
  set(key: string, value: unknown): void;
  getAll(): Record<string, unknown>;
  onChange(key: string, callback: (value: unknown, oldValue: unknown) => void): () => void;
  reset(): void;
};
```

### Files

| File | Change |
|------|--------|
| `src/plugin/PluginSettingsStore.ts` | **New** |
| `src/plugin/types.ts` | Add schema types, `settings` to `PluginContext` |
| `src/plugin/PluginRegistry.ts` | Create store, wire into context |
| `src/plugin/ui/PluginSettingsPanel.ts` | **New** -- auto-generated UI |
| `src/core/PreferencesManager.ts` | Add plugin settings to export/import |

---

## C. Plugin Marketplace/Discovery

### Catalog Format

```typescript
interface PluginRegistryEntry {
  id: PluginId;
  name: string;
  version: SemVer;
  description: string;
  author: string;
  license: string;
  moduleUrl: string;
  iconUrl?: string;
  readmeUrl?: string;
  tags: string[];
  engineVersion?: SemVer;
  dependencies?: PluginId[];
  downloads?: number;
  integrity?: string;  // SHA-256
  versions: Array<{ version: SemVer; moduleUrl: string; integrity?: string; releaseDate: string }>;
}

interface PluginCatalog {
  schemaVersion: number;
  updatedAt: string;
  plugins: PluginRegistryEntry[];
}
```

### Discovery & Installation

```typescript
// MarketplaceClient
async fetchCatalog(): Promise<PluginCatalog>;
async search(options?: MarketplaceSearchOptions): Promise<PluginRegistryEntry[]>;
async checkUpdates(installed): Promise<Map<PluginId, PluginRegistryEntry>>;

// PluginInstaller
async install(id, options?): Promise<void>;
async installFromURL(url, options?): Promise<PluginId>;
async uninstall(id): Promise<void>;
async update(id): Promise<void>;
getInstalled(): InstalledPluginRecord[];
async autoLoadInstalled(): Promise<void>;  // on app startup
```

Installed records persisted to `openrv-installed-plugins` localStorage key.

### Security

- Origin allowlisting (extends `PluginRegistry.setAllowedOrigins()`)
- Optional SRI (`integrity` field, SHA-256 hash verification)
- ES modules via `import()` only -- no `eval()` or `new Function()`

### Public API Extension

```typescript
plugins: {
  // ... existing ...
  search: (options?) => Promise<PluginRegistryEntry[]>,
  install: (id, options?) => Promise<void>,
  uninstall: (id) => Promise<void>,
  checkUpdates: () => Promise<Map<PluginId, PluginRegistryEntry>>,
  update: (id) => Promise<void>,
  installed: () => InstalledPluginRecord[],
};
```

### Files

| File | Change |
|------|--------|
| `src/plugin/marketplace/types.ts` | **New** |
| `src/plugin/marketplace/MarketplaceClient.ts` | **New** |
| `src/plugin/marketplace/PluginInstaller.ts` | **New** |
| `src/plugin/marketplace/semver.ts` | **New** -- lightweight comparison |
| `src/api/OpenRVAPI.ts` | Extend `plugins` object |
| `src/plugin/PluginRegistry.ts` | Support re-registration for updates |

---

## D. Hot-Reload for Development

### Reload Flow

1. Capture state (if plugin implements `getState()`)
2. `PluginRegistry.deactivate(id)`
3. `PluginRegistry.dispose(id)` + `unregister(id)` (new method)
4. Re-import: `import(url + '?t=' + Date.now())`
5. `PluginRegistry.register(newPlugin)` + `activate(id)`
6. Restore state (if captured)

### Plugin Lifecycle Additions

```typescript
interface Plugin {
  // ... existing ...
  /** Serialize state for hot-reload preservation */
  getState?(): unknown;
  /** Restore state after hot-reload */
  restoreState?(state: unknown): void;
}
```

### Developer API

```typescript
// window.openrv.dev (development mode only)
interface DevAPI {
  watch(id: PluginId): void;
  reload(id: PluginId): Promise<void>;
  watched(): PluginId[];
  debug(id: PluginId): void;
}
```

### Files

| File | Change |
|------|--------|
| `src/plugin/dev/HotReloadManager.ts` | **New** |
| `src/plugin/dev/DevAPI.ts` | **New** |
| `src/plugin/types.ts` | Add `getState()` / `restoreState()` to Plugin |
| `src/plugin/PluginRegistry.ts` | Add `unregister()` for disposed plugins |
| `src/api/OpenRVAPI.ts` | Conditional `dev` property |

---

## Summary: PluginContext Phase 2 Additions

```typescript
export interface PluginContext {
  // --- Phase 1 (existing) ---
  readonly manifest: PluginManifest;
  registerDecoder(decoder: FormatDecoder): void;
  registerNode(type: string, creator: () => IPNode): void;
  registerTool(name: string, factory: () => PaintToolInterface): void;
  registerExporter(name: string, exporter: ExporterContribution): void;
  registerBlendMode(name: string, blendFn: BlendModeContribution): void;
  registerUIPanel(panel: UIPanelContribution): void;
  readonly api: OpenRVAPI;
  readonly log: { info; warn; error };

  // --- Phase 2 additions ---
  readonly events: PluginEventSubscription;
  readonly settings: PluginSettingsAccessor;
}
```

---

## Critical Files

- `src/plugin/types.ts` -- Central types: extend PluginContext, PluginManifest, Plugin
- `src/plugin/PluginRegistry.ts` -- Wire new subsystems, extend lifecycle
- `src/api/EventsAPI.ts` -- Bridge for plugin event subscriptions
- `src/core/PreferencesManager.ts` -- Integrate plugin settings storage
- `src/api/OpenRVAPI.ts` -- Extend public API surface
