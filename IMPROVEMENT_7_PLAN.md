# Improvement 7: Plugin Architecture

## Problem Statement

OpenRV Web currently has no formal plugin system. All extension points -- format decoders, node types, blend modes, paint tools, export formats, UI panels -- are hardcoded through static imports, switch statements, and constructor-time registrations. This creates several concrete problems:

1. **No runtime extensibility.** Adding a new image format decoder requires modifying `src/formats/DecoderRegistry.ts` and rebuilding the application. Adding a new node type requires creating a class with the `@RegisterNode` decorator and statically importing it. There is no way to load new capabilities after the initial bundle is loaded.

2. **Tight coupling to source tree.** Third parties cannot add formats, nodes, effects, or UI panels without forking the repository. Every extension point is wired by import statements scattered across index files (`src/formats/index.ts`, `src/nodes/groups/index.ts`, `src/nodes/sources/index.ts`, `src/export/index.ts`).

3. **No lifecycle management.** Components that need initialization, activation/deactivation, and cleanup must manage their own lifecycle ad-hoc. There is no centralized mechanism for orderly startup and teardown of optional modules.

4. **No dependency declaration.** If a hypothetical "ACES color management plugin" depends on a "LUT loader plugin", there is no way to express or enforce that dependency today.

5. **Paint tool registration is a closed enum.** The `PaintTool` type in `src/paint/PaintEngine.ts` is a union literal (`'pen' | 'text' | 'eraser' | ... | 'smudge'`), and the advanced tools are instantiated by a `switch` in `createAdvancedTool()`. Adding a new tool requires editing both locations.

### Existing Patterns Worth Preserving

The codebase already has several proto-plugin patterns that work well and should be formalized, not replaced:

| Pattern | Location | What It Does |
|---------|----------|--------------|
| `DecoderRegistry` | `src/formats/DecoderRegistry.ts` | Typed `FormatDecoder` interface, `registerDecoder()` method, singleton `decoderRegistry` |
| `NodeFactory` + `@RegisterNode` | `src/nodes/base/NodeFactory.ts` | Map-based registry, decorator-driven registration, `create(type)` factory |
| `NodeProcessor` interface | `src/nodes/base/NodeProcessor.ts` | Strategy pattern: swap processing logic on a node at runtime |
| `PaintToolInterface` | `src/paint/AdvancedPaintTools.ts` | Typed tool interface with `apply/beginStroke/endStroke/reset` contract |
| `EventEmitter` / `Signal` | `src/utils/EventEmitter.ts`, `src/core/graph/Signal.ts` | Pub-sub infrastructure already used everywhere |
| `OpenRVAPI` facade | `src/api/OpenRVAPI.ts` | Public API surface exposed as `window.openrv` |

---

## Proposed Solution

A **PluginRegistry** that provides:
- Typed plugin interfaces for each extension category
- Runtime registration and unregistration
- Lifecycle hooks (init, activate, deactivate, dispose)
- A plugin manifest describing metadata and dependencies
- Dynamic loading via ES module `import()` or URL
- Migration path for existing hardcoded registrations

### Architecture Overview

```
                    PluginRegistry (singleton)
                    /    |    \     \      \
            NodePlugin  DecoderPlugin  ToolPlugin  ExporterPlugin  UIPlugin
               |            |              |            |              |
          NodeFactory  DecoderRegistry  PaintEngine  ExportRegistry  UIPanelRegistry
```

Each plugin type targets one of the existing registries. The `PluginRegistry` orchestrates lifecycle and delegates actual capability registration to the domain-specific registries that already exist.

---

## Detailed Steps

### Step 1: Define Core Plugin Interfaces

**New file: `src/plugin/types.ts`**

```typescript
/**
 * Plugin system type definitions.
 *
 * Every plugin has a manifest (metadata) and implements one or more
 * typed contribution interfaces. The PluginRegistry manages lifecycle
 * and delegates capability registration to domain-specific registries.
 */

// ---------------------------------------------------------------------------
// Plugin Manifest
// ---------------------------------------------------------------------------

/** Semantic version string, e.g. "1.2.3" */
export type SemVer = string;

/** Unique plugin identifier, reverse-domain style: "com.example.myformat" */
export type PluginId = string;

/**
 * Static metadata describing a plugin.
 * Shipped as a JSON file or exported from the plugin module.
 */
export interface PluginManifest {
  /** Unique identifier (reverse-domain recommended) */
  id: PluginId;
  /** Human-readable name */
  name: string;
  /** Plugin version */
  version: SemVer;
  /** Short description */
  description?: string;
  /** Author name or organization */
  author?: string;
  /** License identifier (SPDX) */
  license?: string;
  /** Minimum OpenRV Web version required */
  engineVersion?: SemVer;
  /** IDs of plugins this plugin depends on */
  dependencies?: PluginId[];
  /** Which contribution types this plugin provides */
  contributes: PluginContributionType[];
}

export type PluginContributionType =
  | 'decoder'
  | 'node'
  | 'processor'
  | 'tool'
  | 'exporter'
  | 'blendMode'
  | 'uiPanel';

// ---------------------------------------------------------------------------
// Plugin Lifecycle
// ---------------------------------------------------------------------------

export enum PluginState {
  /** Registered but not yet initialized */
  Registered = 'registered',
  /** init() completed successfully */
  Initialized = 'initialized',
  /** activate() completed; contributions are live */
  Active = 'active',
  /** deactivate() completed; contributions withdrawn */
  Inactive = 'inactive',
  /** dispose() completed; cannot be reactivated */
  Disposed = 'disposed',
  /** An error occurred during a lifecycle transition */
  Error = 'error',
}

/**
 * Context object passed to plugin lifecycle hooks.
 * Provides access to the host application's registries and API.
 */
export interface PluginContext {
  /** The plugin's own manifest */
  readonly manifest: PluginManifest;
  /** Register a format decoder */
  registerDecoder(decoder: import('../formats/DecoderRegistry').FormatDecoder): void;
  /** Register a node type */
  registerNode(type: string, creator: () => import('../nodes/base/IPNode').IPNode): void;
  /** Register a paint tool */
  registerTool(name: string, factory: () => import('../paint/AdvancedPaintTools').PaintToolInterface): void;
  /** Register an exporter */
  registerExporter(name: string, exporter: ExporterContribution): void;
  /** Register a blend mode */
  registerBlendMode(name: string, blendFn: BlendModeContribution): void;
  /** Register a UI panel */
  registerUIPanel(panel: UIPanelContribution): void;
  /** Access the public OpenRV API */
  readonly api: import('../api/OpenRVAPI').OpenRVAPI;
  /** Subscribe to application events; returns unsubscribe function */
  onEvent(event: string, handler: (...args: unknown[]) => void): () => void;
  /** Logger scoped to this plugin */
  readonly log: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

// ---------------------------------------------------------------------------
// Base Plugin Interface
// ---------------------------------------------------------------------------

/**
 * Every plugin module must export a default object satisfying this interface.
 */
export interface Plugin {
  /** Static manifest metadata */
  readonly manifest: PluginManifest;

  /**
   * One-time initialization. Allocate resources, validate environment.
   * Throwing here prevents the plugin from activating.
   */
  init?(context: PluginContext): Promise<void> | void;

  /**
   * Activate the plugin: register all contributions with the host.
   * Called after init() and after all dependencies are active.
   */
  activate(context: PluginContext): Promise<void> | void;

  /**
   * Deactivate the plugin: withdraw contributions.
   * The plugin may be re-activated later.
   */
  deactivate?(context: PluginContext): Promise<void> | void;

  /**
   * Final cleanup. Release all resources.
   * Called once; the plugin cannot be reactivated after this.
   */
  dispose?(context: PluginContext): Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Contribution Interfaces
// ---------------------------------------------------------------------------

/**
 * Exporter contribution: produces a file/blob from a frame range.
 */
export interface ExporterContribution {
  /** Human-readable label shown in export UI */
  label: string;
  /** File extension(s) this exporter produces */
  extensions: string[];
  /** Export function */
  export(config: ExporterConfig): Promise<Blob>;
}

export interface ExporterConfig {
  frameRange: { start: number; end: number };
  width: number;
  height: number;
  fps: number;
  getFrame: (frame: number) => Promise<ImageData>;
  onProgress?: (pct: number) => void;
}

/**
 * Blend mode contribution: a per-channel blending function.
 * Receives normalized [0,1] channel values and returns the blended result.
 */
export interface BlendModeContribution {
  /** Human-readable label */
  label: string;
  /** Blend function: (baseChannel, topChannel) => blendedChannel, all in [0,1] */
  blend(base: number, top: number): number;
}

/**
 * UI Panel contribution: a panel that can be mounted into the application layout.
 */
export interface UIPanelContribution {
  /** Unique panel ID */
  id: string;
  /** Display label */
  label: string;
  /** Where the panel can be docked */
  location: 'left' | 'right' | 'bottom' | 'floating';
  /** Icon identifier or SVG string */
  icon?: string;
  /** Create the panel's DOM content */
  render(container: HTMLElement, context: PluginContext): void;
  /** Cleanup when panel is removed */
  destroy?(): void;
}
```

### Step 2: Implement the PluginRegistry

**New file: `src/plugin/PluginRegistry.ts`**

```typescript
/**
 * PluginRegistry - Central orchestrator for plugin lifecycle management.
 *
 * Responsibilities:
 * - Register, initialize, activate, deactivate, and dispose plugins
 * - Enforce dependency ordering
 * - Create PluginContext instances that scope registrations per-plugin
 * - Provide runtime discovery of registered plugins and their states
 */

import { Signal } from '../core/graph/Signal';
import { decoderRegistry } from '../formats/DecoderRegistry';
import { NodeFactory } from '../nodes/base/NodeFactory';
import type {
  Plugin,
  PluginId,
  PluginManifest,
  PluginState,
  PluginContext,
  ExporterContribution,
  BlendModeContribution,
  UIPanelContribution,
} from './types';
import type { FormatDecoder } from '../formats/DecoderRegistry';
import type { IPNode } from '../nodes/base/IPNode';
import type { PaintToolInterface } from '../paint/AdvancedPaintTools';

interface PluginEntry {
  plugin: Plugin;
  state: PluginState;
  /** Track registrations so we can unregister on deactivate */
  registrations: {
    decoders: string[];       // formatName keys
    nodes: string[];          // node type keys
    tools: string[];          // tool name keys
    exporters: string[];      // exporter name keys
    blendModes: string[];     // blend mode name keys
    uiPanels: string[];       // panel id keys
  };
  error?: Error;
}

export class PluginRegistry {
  private plugins = new Map<PluginId, PluginEntry>();

  // Domain-specific extension registries (to be injected or imported)
  private exporterRegistry = new Map<string, ExporterContribution>();
  private blendModeRegistry = new Map<string, BlendModeContribution>();
  private uiPanelRegistry = new Map<string, UIPanelContribution>();
  private toolRegistry = new Map<string, () => PaintToolInterface>();

  /** Emitted when a plugin changes state */
  readonly pluginStateChanged = new Signal<{ id: PluginId; state: PluginState }>();

  /** Reference to the OpenRV API instance, set during app bootstrap */
  private apiRef: import('../api/OpenRVAPI').OpenRVAPI | null = null;

  setAPI(api: import('../api/OpenRVAPI').OpenRVAPI): void {
    this.apiRef = api;
  }

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  register(plugin: Plugin): void {
    const id = plugin.manifest.id;
    if (this.plugins.has(id)) {
      throw new Error(`Plugin "${id}" is already registered`);
    }
    this.plugins.set(id, {
      plugin,
      state: 'registered' as PluginState,
      registrations: {
        decoders: [], nodes: [], tools: [],
        exporters: [], blendModes: [], uiPanels: [],
      },
    });
    this.pluginStateChanged.emit(
      { id, state: 'registered' as PluginState },
      { id, state: 'registered' as PluginState },
    );
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async activateAll(): Promise<void> {
    const sorted = this.topologicalSort();
    for (const id of sorted) {
      await this.activate(id);
    }
  }

  async activate(id: PluginId): Promise<void> {
    const entry = this.plugins.get(id);
    if (!entry) throw new Error(`Plugin "${id}" not found`);
    if (entry.state === 'active') return;

    // Ensure dependencies are active
    for (const depId of entry.plugin.manifest.dependencies ?? []) {
      const dep = this.plugins.get(depId);
      if (!dep) throw new Error(`Plugin "${id}" depends on "${depId}" which is not registered`);
      if (dep.state !== 'active') {
        await this.activate(depId);
      }
    }

    const context = this.createContext(entry);

    try {
      // Init
      if (entry.plugin.init) {
        await entry.plugin.init(context);
      }
      entry.state = 'initialized' as PluginState;

      // Activate
      await entry.plugin.activate(context);
      entry.state = 'active' as PluginState;

      this.pluginStateChanged.emit(
        { id, state: entry.state },
        { id, state: 'initialized' as PluginState },
      );
    } catch (err) {
      entry.state = 'error' as PluginState;
      entry.error = err instanceof Error ? err : new Error(String(err));
      this.pluginStateChanged.emit(
        { id, state: entry.state },
        { id, state: 'registered' as PluginState },
      );
      throw err;
    }
  }

  async deactivate(id: PluginId): Promise<void> {
    const entry = this.plugins.get(id);
    if (!entry || entry.state !== 'active') return;

    // Deactivate dependents first
    for (const [otherId, other] of this.plugins) {
      if (other.plugin.manifest.dependencies?.includes(id) && other.state === 'active') {
        await this.deactivate(otherId);
      }
    }

    const context = this.createContext(entry);
    if (entry.plugin.deactivate) {
      await entry.plugin.deactivate(context);
    }

    // Unregister all contributions
    this.unregisterContributions(entry);

    entry.state = 'inactive' as PluginState;
    this.pluginStateChanged.emit(
      { id, state: entry.state },
      { id, state: 'active' as PluginState },
    );
  }

  async dispose(id: PluginId): Promise<void> {
    const entry = this.plugins.get(id);
    if (!entry) return;

    if (entry.state === 'active') {
      await this.deactivate(id);
    }

    const context = this.createContext(entry);
    if (entry.plugin.dispose) {
      await entry.plugin.dispose(context);
    }

    entry.state = 'disposed' as PluginState;
    this.plugins.delete(id);
    this.pluginStateChanged.emit(
      { id, state: 'disposed' as PluginState },
      { id, state: 'inactive' as PluginState },
    );
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  getPlugin(id: PluginId): Plugin | undefined {
    return this.plugins.get(id)?.plugin;
  }

  getState(id: PluginId): PluginState | undefined {
    return this.plugins.get(id)?.state as PluginState | undefined;
  }

  getRegisteredIds(): PluginId[] {
    return Array.from(this.plugins.keys());
  }

  getExporter(name: string): ExporterContribution | undefined {
    return this.exporterRegistry.get(name);
  }

  getExporters(): Map<string, ExporterContribution> {
    return new Map(this.exporterRegistry);
  }

  getBlendMode(name: string): BlendModeContribution | undefined {
    return this.blendModeRegistry.get(name);
  }

  getUIPanel(id: string): UIPanelContribution | undefined {
    return this.uiPanelRegistry.get(id);
  }

  getUIPanels(): Map<string, UIPanelContribution> {
    return new Map(this.uiPanelRegistry);
  }

  getToolFactory(name: string): (() => PaintToolInterface) | undefined {
    return this.toolRegistry.get(name);
  }

  // -----------------------------------------------------------------------
  // Dynamic loading
  // -----------------------------------------------------------------------

  /**
   * Load a plugin from a URL (ES module with default export).
   * The module must export a default Plugin object.
   */
  async loadFromURL(url: string): Promise<PluginId> {
    const module = await import(/* @vite-ignore */ url);
    const plugin: Plugin = module.default;
    if (!plugin?.manifest?.id) {
      throw new Error(`Module at ${url} does not export a valid Plugin`);
    }
    this.register(plugin);
    return plugin.manifest.id;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private createContext(entry: PluginEntry): PluginContext {
    const manifest = entry.plugin.manifest;
    const reg = entry.registrations;

    return {
      manifest,
      registerDecoder: (decoder: FormatDecoder) => {
        decoderRegistry.registerDecoder(decoder);
        reg.decoders.push(decoder.formatName);
      },
      registerNode: (type: string, creator: () => IPNode) => {
        NodeFactory.register(type, creator);
        reg.nodes.push(type);
      },
      registerTool: (name: string, factory: () => PaintToolInterface) => {
        this.toolRegistry.set(name, factory);
        reg.tools.push(name);
      },
      registerExporter: (name: string, exporter: ExporterContribution) => {
        this.exporterRegistry.set(name, exporter);
        reg.exporters.push(name);
      },
      registerBlendMode: (name: string, contribution: BlendModeContribution) => {
        this.blendModeRegistry.set(name, contribution);
        reg.blendModes.push(name);
      },
      registerUIPanel: (panel: UIPanelContribution) => {
        this.uiPanelRegistry.set(panel.id, panel);
        reg.uiPanels.push(panel.id);
      },
      get api() {
        // Deliberately late-bound so plugins created before API init still work
        const api = (this as any)._registry?.apiRef;
        if (!api) throw new Error('OpenRV API not yet initialized');
        return api;
      },
      onEvent: (_event: string, _handler: (...args: unknown[]) => void) => {
        // Delegate to EventsAPI; implementation wired during bootstrap
        return () => {};
      },
      log: {
        info: (msg: string, ...args: unknown[]) =>
          console.log(`[plugin:${manifest.id}]`, msg, ...args),
        warn: (msg: string, ...args: unknown[]) =>
          console.warn(`[plugin:${manifest.id}]`, msg, ...args),
        error: (msg: string, ...args: unknown[]) =>
          console.error(`[plugin:${manifest.id}]`, msg, ...args),
      },
    };
  }

  private unregisterContributions(entry: PluginEntry): void {
    const reg = entry.registrations;

    // Decoders: DecoderRegistry currently lacks unregister, so we will add it
    // For now, track for future unregister support

    // Nodes: NodeFactory currently lacks unregister, so we will add it

    // Tools
    for (const name of reg.tools) this.toolRegistry.delete(name);

    // Exporters
    for (const name of reg.exporters) this.exporterRegistry.delete(name);

    // Blend modes
    for (const name of reg.blendModes) this.blendModeRegistry.delete(name);

    // UI panels
    for (const id of reg.uiPanels) {
      const panel = this.uiPanelRegistry.get(id);
      panel?.destroy?.();
      this.uiPanelRegistry.delete(id);
    }

    // Reset tracking
    reg.decoders = [];
    reg.nodes = [];
    reg.tools = [];
    reg.exporters = [];
    reg.blendModes = [];
    reg.uiPanels = [];
  }

  private topologicalSort(): PluginId[] {
    const visited = new Set<PluginId>();
    const sorted: PluginId[] = [];

    const visit = (id: PluginId) => {
      if (visited.has(id)) return;
      visited.add(id);
      const entry = this.plugins.get(id);
      if (!entry) return;
      for (const dep of entry.plugin.manifest.dependencies ?? []) {
        visit(dep);
      }
      sorted.push(id);
    };

    for (const id of this.plugins.keys()) {
      visit(id);
    }
    return sorted;
  }
}

/** Singleton plugin registry */
export const pluginRegistry = new PluginRegistry();
```

### Step 3: Add `unregisterDecoder` to DecoderRegistry

**File: `src/formats/DecoderRegistry.ts`** -- add method to the existing `DecoderRegistry` class:

```typescript
// Add inside the DecoderRegistry class, after registerDecoder():

  /**
   * Unregister a format decoder by format name.
   * Returns true if a decoder was found and removed.
   */
  unregisterDecoder(formatName: string): boolean {
    const index = this.decoders.findIndex(d => d.formatName === formatName);
    if (index >= 0) {
      this.decoders.splice(index, 1);
      return true;
    }
    return false;
  }
```

### Step 4: Add `unregister` to NodeFactory

**File: `src/nodes/base/NodeFactory.ts`** -- add method to the existing `NodeFactoryClass`:

```typescript
// Add inside NodeFactoryClass, after isRegistered():

  unregister(type: string): boolean {
    return this.registry.delete(type);
  }
```

### Step 5: Create ExporterRegistry

**New file: `src/plugin/ExporterRegistry.ts`**

A thin registry so export UI can discover both built-in and plugin-provided exporters:

```typescript
import type { ExporterContribution } from './types';

class ExporterRegistryClass {
  private exporters = new Map<string, ExporterContribution>();

  register(name: string, exporter: ExporterContribution): void {
    this.exporters.set(name, exporter);
  }

  unregister(name: string): boolean {
    return this.exporters.delete(name);
  }

  get(name: string): ExporterContribution | undefined {
    return this.exporters.get(name);
  }

  getAll(): Map<string, ExporterContribution> {
    return new Map(this.exporters);
  }
}

export const ExporterRegistry = new ExporterRegistryClass();
```

### Step 6: Extend PaintEngine for Plugin Tools

**File: `src/paint/PaintEngine.ts`** -- make tool registration open:

```typescript
// Add a new method to PaintEngine:

  /**
   * Register a custom advanced paint tool.
   * Plugins call this to add tools beyond the built-in set.
   */
  registerAdvancedTool(name: string, tool: PaintToolInterface): void {
    this.advancedTools.set(name, tool);
  }

  /**
   * Unregister a custom advanced paint tool.
   */
  unregisterAdvancedTool(name: string): boolean {
    return this.advancedTools.delete(name);
  }
```

The `PaintTool` type union should also be extended to allow `string` for plugin tools:

```typescript
// Change from:
export type PaintTool = 'pen' | 'text' | 'eraser' | 'none' | 'rectangle' | ...;

// To:
export type BuiltinPaintTool = 'pen' | 'text' | 'eraser' | 'none' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'dodge' | 'burn' | 'clone' | 'smudge';
export type PaintTool = BuiltinPaintTool | (string & {});
```

### Step 7: Wire PluginRegistry into Application Bootstrap

**File: `src/api/OpenRVAPI.ts`** -- expose plugin registration on the public API:

```typescript
import { pluginRegistry } from '../plugin/PluginRegistry';
import type { Plugin, PluginId, PluginState } from '../plugin/types';

// Add to the OpenRVAPI class:

  /** Plugin management */
  readonly plugins = {
    /** Register a plugin object */
    register: (plugin: Plugin) => pluginRegistry.register(plugin),

    /** Activate a registered plugin */
    activate: (id: PluginId) => pluginRegistry.activate(id),

    /** Deactivate an active plugin */
    deactivate: (id: PluginId) => pluginRegistry.deactivate(id),

    /** Load and register a plugin from a URL */
    loadFromURL: (url: string) => pluginRegistry.loadFromURL(url),

    /** Get current state of a plugin */
    getState: (id: PluginId) => pluginRegistry.getState(id),

    /** List all registered plugin IDs */
    list: () => pluginRegistry.getRegisteredIds(),
  };
```

This allows external scripts to do:

```javascript
// From browser console or external script:
const plugin = await import('https://cdn.example.com/my-exr-plugin.js');
window.openrv.plugins.register(plugin.default);
await window.openrv.plugins.activate('com.example.exr-plus');
```

### Step 8: Create Plugin Module Entry Point

**New file: `src/plugin/index.ts`**

```typescript
export { PluginRegistry, pluginRegistry } from './PluginRegistry';
export { ExporterRegistry } from './ExporterRegistry';
export type {
  Plugin,
  PluginManifest,
  PluginId,
  PluginState,
  PluginContext,
  PluginContributionType,
  ExporterContribution,
  ExporterConfig,
  BlendModeContribution,
  UIPanelContribution,
  PaintToolInterface,
} from './types';
```

### Step 9: Migrate Existing Built-in Decoders to Plugin Format

To validate the architecture, migrate one built-in decoder to a plugin. The existing `DecoderRegistry` constructor continues to register built-in decoders directly (for zero-overhead startup), but each decoder can also be expressed as a plugin for consistency.

**New file: `src/plugin/builtins/HDRDecoderPlugin.ts`** (example):

```typescript
import type { Plugin, PluginManifest, PluginContext } from '../types';
import type { FormatDecoder, DecodeResult } from '../../formats/DecoderRegistry';

const manifest: PluginManifest = {
  id: 'openrv.builtin.hdr-decoder',
  name: 'Radiance HDR Decoder',
  version: '1.0.0',
  description: 'Decodes Radiance .hdr files',
  author: 'OpenRV Team',
  license: 'Apache-2.0',
  contributes: ['decoder'],
};

const hdrDecoder: FormatDecoder = {
  formatName: 'hdr',
  canDecode(buffer: ArrayBuffer): boolean {
    if (buffer.byteLength < 6) return false;
    const len = Math.min(buffer.byteLength, 10);
    const bytes = new Uint8Array(buffer, 0, len);
    const header = String.fromCharCode(...bytes);
    return header.startsWith('#?RADIANCE') || header.startsWith('#?RGBE');
  },
  async decode(buffer: ArrayBuffer): Promise<DecodeResult> {
    const { decodeHDR } = await import('../../formats/HDRDecoder');
    const result = await decodeHDR(buffer);
    return {
      width: result.width,
      height: result.height,
      data: result.data,
      channels: result.channels,
      colorSpace: result.colorSpace,
      metadata: result.metadata,
    };
  },
};

const HDRDecoderPlugin: Plugin = {
  manifest,
  activate(context: PluginContext) {
    context.registerDecoder(hdrDecoder);
    context.log.info('HDR decoder registered');
  },
  deactivate() {
    // Decoder will be unregistered by the registry via tracked registrations
  },
};

export default HDRDecoderPlugin;
```

### Step 10: Sandboxing and Security Considerations

Plugins loaded from third-party URLs represent a significant trust boundary. The following mitigations should be implemented:

1. **Content Security Policy (CSP).** The application should enforce a CSP that limits `script-src` to trusted origins. Plugin URLs must be explicitly allowed.

2. **Plugin allowlist.** The `PluginRegistry.loadFromURL()` should accept an optional `allowedOrigins: string[]` parameter. Reject URLs not matching the allowlist.

3. **Capability restrictions.** The `PluginContext` intentionally does not expose `Session`, `Graph`, or raw canvas access. Plugins interact only through typed contribution interfaces. This limits the damage a malicious plugin can cause.

4. **Resource limits.** Decoders registered by plugins should be wrapped in a timeout guard:

```typescript
async decode(buffer: ArrayBuffer, options?: Record<string, unknown>): Promise<DecodeResult> {
  const timeoutMs = 30_000;
  const result = await Promise.race([
    originalDecoder.decode(buffer, options),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Plugin decoder timed out')), timeoutMs)
    ),
  ]);
  return result;
}
```

5. **Web Worker isolation (future).** For maximum isolation, plugins could run in a dedicated Web Worker with `postMessage`-based communication. This is a Phase 2 enhancement that requires serializable contribution interfaces.

6. **No `eval` or dynamic code generation.** Plugins must be ES modules. The registry should not support string-based code evaluation.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `src/plugin/types.ts` | **Create** | Plugin manifest, lifecycle, and contribution interfaces |
| `src/plugin/PluginRegistry.ts` | **Create** | Central lifecycle orchestrator with singleton export |
| `src/plugin/ExporterRegistry.ts` | **Create** | Registry for export format contributions |
| `src/plugin/index.ts` | **Create** | Public module entry point |
| `src/plugin/builtins/HDRDecoderPlugin.ts` | **Create** | Example built-in plugin migration |
| `src/formats/DecoderRegistry.ts` | **Modify** | Add `unregisterDecoder()` method |
| `src/nodes/base/NodeFactory.ts` | **Modify** | Add `unregister()` method |
| `src/paint/PaintEngine.ts` | **Modify** | Add `registerAdvancedTool()`, `unregisterAdvancedTool()`; widen `PaintTool` type |
| `src/paint/AdvancedPaintTools.ts` | **Modify** | Export `PaintToolInterface` from plugin index (already exported, ensure re-export) |
| `src/api/OpenRVAPI.ts` | **Modify** | Add `plugins` namespace to public API |
| `src/api/index.ts` | **Modify** | Re-export plugin types for external consumers |

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Plugin load order bugs** causing missing dependencies | Medium | Medium | Topological sort with cycle detection; clear error messages naming the missing dependency |
| **Memory leaks** from plugins that don't clean up | Medium | High | Track all registrations per-plugin; force-unregister on deactivate; warn on dispose if registrations remain |
| **Breaking existing code** during migration | High | Low | Existing static registrations continue to work unchanged; plugin system is additive, not a replacement |
| **Performance overhead** from registry indirection | Low | Low | Hot path (decoder dispatch, node evaluation) unchanged; only registration/lookup adds Map operations which are O(1) |
| **Security: malicious third-party plugins** | High | Medium | CSP enforcement, URL allowlist, no raw Session/Graph access, timeout wrappers on decoder dispatch |
| **API surface bloat** | Medium | Medium | Keep `PluginContext` minimal; resist adding methods that expose internal state |
| **Type safety erosion** from `string` tool names | Low | Medium | Keep `BuiltinPaintTool` union for type-safe built-in tools; only plugin tools use the `string &{}` escape |

---

## Testing Strategy

### Unit Tests

**New file: `src/plugin/PluginRegistry.test.ts`**

| Test Case | What It Validates |
|-----------|-------------------|
| `register() stores plugin and emits signal` | Basic registration |
| `activate() calls init() then activate()` | Lifecycle ordering |
| `activate() resolves dependencies first` | Dependency chain |
| `activate() with circular dependency throws` | Cycle detection |
| `activate() with missing dependency throws` | Dependency validation |
| `deactivate() unregisters contributions` | Cleanup completeness |
| `deactivate() cascades to dependents` | Reverse dependency ordering |
| `dispose() prevents reactivation` | Terminal state |
| `loadFromURL() loads ES module and registers` | Dynamic loading |
| `loadFromURL() rejects invalid module` | Error handling |
| `PluginContext.registerDecoder() delegates to DecoderRegistry` | Integration with DecoderRegistry |
| `PluginContext.registerNode() delegates to NodeFactory` | Integration with NodeFactory |
| `PluginContext.registerTool() makes tool available` | Integration with PaintEngine |
| `PluginContext.registerExporter() makes exporter available` | Exporter discovery |
| `activateAll() processes plugins in dependency order` | Topological sort |

**New file: `src/plugin/ExporterRegistry.test.ts`**

| Test Case | What It Validates |
|-----------|-------------------|
| `register() and get()` | Basic CRUD |
| `unregister() removes and returns true` | Cleanup |
| `getAll() returns copy` | Isolation |

**Modified: `src/formats/DecoderRegistry.test.ts`**

| Test Case | What It Validates |
|-----------|-------------------|
| `unregisterDecoder() removes by format name` | New method |
| `unregisterDecoder() returns false for unknown` | Edge case |

**Modified: `src/nodes/base/NodeFactory.test.ts`** (or new if none exists)

| Test Case | What It Validates |
|-----------|-------------------|
| `unregister() removes node creator` | New method |
| `create() returns null after unregister` | Post-removal behavior |

**Modified: `src/paint/PaintEngine.test.ts`**

| Test Case | What It Validates |
|-----------|-------------------|
| `registerAdvancedTool() adds a new tool` | Plugin tool registration |
| `unregisterAdvancedTool() removes the tool` | Plugin tool cleanup |
| `isAdvancedTool() returns true for plugin tools` | Discovery |

### Integration Tests

**New file: `src/plugin/PluginRegistry.integration.test.ts`**

| Test Case | What It Validates |
|-----------|-------------------|
| End-to-end: register + activate decoder plugin, then decode a buffer | Full pipeline |
| End-to-end: register + activate node plugin, then create via NodeFactory | Full pipeline |
| Deactivate plugin removes its decoder from the registry | Lifecycle cleanup |
| Two plugins with dependency: A depends on B | Multi-plugin orchestration |
| Plugin re-activation after deactivate | State transitions |

### Example Plugin Test

**New file: `src/plugin/builtins/HDRDecoderPlugin.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from '../PluginRegistry';
import HDRDecoderPlugin from './HDRDecoderPlugin';
import { decoderRegistry } from '../../formats/DecoderRegistry';

describe('HDRDecoderPlugin', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('registers HDR decoder on activate', async () => {
    registry.register(HDRDecoderPlugin);
    await registry.activate('openrv.builtin.hdr-decoder');

    // The HDR decoder is already built-in, so registerDecoder replaces it
    const decoder = decoderRegistry.getDecoder(
      new Uint8Array([0x23, 0x3F, 0x52, 0x41, 0x44, 0x49, 0x41, 0x4E, 0x43, 0x45]).buffer
    );
    expect(decoder).not.toBeNull();
    expect(decoder?.formatName).toBe('hdr');
  });

  it('has correct manifest', () => {
    expect(HDRDecoderPlugin.manifest.id).toBe('openrv.builtin.hdr-decoder');
    expect(HDRDecoderPlugin.manifest.contributes).toContain('decoder');
  });
});
```

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **All existing tests pass** without modification | 100% green | `npx vitest run` after changes |
| **New plugin tests** | >= 25 test cases | Count in `PluginRegistry.test.ts` + integration tests |
| **Plugin registration roundtrip** | Register -> activate -> use -> deactivate -> verify gone | Integration test |
| **Dynamic loading** | Load plugin from data: URL in test | Unit test with mocked import |
| **Type safety** | Zero `any` types in plugin interfaces | `npx tsc --noEmit` |
| **No bundle size regression** for users not using plugins | < 2KB gzipped addition to core bundle | Build size comparison |
| **Time to create a new decoder plugin** | < 30 minutes for someone reading the docs | Validated by writing the HDR example |
| **Existing DecoderRegistry/NodeFactory API unchanged** | All existing call sites compile without modification | TypeScript compilation |

---

## Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| **Phase 1: Core interfaces** | `types.ts`, `PluginRegistry.ts`, `ExporterRegistry.ts`, `index.ts` | 3-4 days |
| **Phase 2: Registry modifications** | `unregisterDecoder`, `unregister` (NodeFactory), `registerAdvancedTool` (PaintEngine), widen `PaintTool` type | 1-2 days |
| **Phase 3: API integration** | Wire into `OpenRVAPI`, bootstrap sequence | 1 day |
| **Phase 4: Tests** | Unit tests, integration tests, example plugin test | 2-3 days |
| **Phase 5: Example migration** | Convert HDR decoder to plugin form, document pattern | 1 day |
| **Phase 6: Security hardening** | CSP guidance, URL allowlist, timeout wrappers, documentation | 1-2 days |
| **Phase 7: Documentation** | Plugin authoring guide, contribution type reference | 1-2 days |
| **Total** | | **10-15 days** |

### Phase 2 (Future) Enhancements

These are explicitly out of scope for the initial implementation but should be tracked:

- **Web Worker isolation** for untrusted plugins
- **Plugin marketplace UI** panel for browsing/installing plugins
- **Hot module replacement (HMR)** support for plugin development
- **Plugin settings/configuration UI** auto-generated from a schema in the manifest
- **Versioned plugin API** so the host can support multiple plugin API versions simultaneously
- **WASM plugin support** for performance-critical decoders written in C++/Rust

---

## QA Review — Round 1

### Verdict: APPROVE WITH CHANGES

The plan is well-structured and correctly identifies the existing proto-plugin patterns (`DecoderRegistry`, `NodeFactory`, `@RegisterNode`, `PaintToolInterface`) as foundations. The proposed architecture is additive, which greatly reduces migration risk. However, there are several testability gaps, one implementation bug, and missing edge-case coverage that should be addressed before implementation begins.

### Test Coverage Assessment

**Existing DecoderRegistry tests (`src/formats/DecoderRegistry.test.ts`):** 26 test cases covering `detectFormat`, `getDecoder`, `registerDecoder` (including replacement semantics), `detectAndDecode`, and the singleton. The tests create fresh `new DecoderRegistry()` instances per test, which means the constructor-registered built-in decoders are always present. This is good for isolation. There are no tests for an `unregisterDecoder` method yet, which the plan correctly identifies as a new test need.

**Existing NodeFactory tests:** There is NO dedicated `NodeFactory.test.ts` file. The only NodeFactory test coverage lives in `src/__e2e__/CacheLUTNode.e2e.test.ts`, which tests `NodeFactory.isRegistered('CacheLUT')` and `NodeFactory.create('CacheLUT')` as part of an integration test. The `NodeFactory` class (`src/nodes/base/NodeFactory.ts`) is a 38-line file with `register`, `create`, `getRegisteredTypes`, and `isRegistered` methods. The plan proposes adding `unregister()` but lists the new test file as "Modified: `src/nodes/base/NodeFactory.test.ts` (or new if none exists)". Since none exists, it **must** be created. The plan should be explicit about this -- the new file needs tests for existing `register`/`create`/`isRegistered`/`getRegisteredTypes` behavior (establishing a baseline), not just the new `unregister()` method.

**Existing PaintEngine tests (`src/paint/PaintEngine.test.ts`):** 60+ test cases. The `advanced paint tools` section (PAINT-040 through PAINT-048) tests `getAdvancedTool`, `isAdvancedTool`, and verifies that advanced tools are rejected by `beginStroke`. However, the tests access `advancedTools` only through the four hardcoded names (`dodge`, `burn`, `clone`, `smudge`). The plan proposes `registerAdvancedTool`/`unregisterAdvancedTool` but the `advancedTools` map is `private`. The plan needs to clarify how the new methods will be exposed -- whether they are public methods on `PaintEngine` or routed through the `PluginContext` only.

**Proposed test strategy:** The plan lists 15 unit test cases for `PluginRegistry`, 3 for `ExporterRegistry`, 2 for `DecoderRegistry`, 2 for `NodeFactory`, 3 for `PaintEngine`, 5 integration tests, and 2 example plugin tests. Total: approximately 30 new test cases. This meets the stated target of >= 25.

### Risk Assessment

1. **`PluginContext.api` getter bug (Critical).** The `createContext` method builds a plain object literal for `PluginContext`, and the `api` getter uses `(this as any)._registry?.apiRef`. Inside an object literal's `get api()`, `this` refers to the context object itself, not the `PluginRegistry` instance. The `_registry` property is never set on the context object, so `this._registry` will always be `undefined`, and the getter will always throw "OpenRV API not yet initialized". This needs to be fixed by capturing `this.apiRef` in a closure variable outside the object literal:

   ```typescript
   const registry = this;
   // ...
   get api() {
     if (!registry.apiRef) throw new Error('OpenRV API not yet initialized');
     return registry.apiRef;
   }
   ```

   A test for `PluginContext.api` must verify both the success and error paths.

2. **`unregisterContributions` does NOT actually unregister decoders or nodes.** The method body has comments saying "DecoderRegistry currently lacks unregister, so we will add it" and "Nodes: NodeFactory currently lacks unregister, so we will add it", but Step 3 and Step 4 add those methods. The `unregisterContributions` code must be updated to call `decoderRegistry.unregisterDecoder(name)` and `NodeFactory.unregister(type)` for each tracked registration. Without this, deactivating a plugin that registered a decoder or node will leave stale entries in those registries -- directly contradicting the lifecycle cleanup guarantee. Integration tests for deactivation will fail or be meaningless without this fix.

3. **`topologicalSort` does not detect cycles.** The plan's risk table says "Topological sort with cycle detection" but the implementation simply skips already-visited nodes without distinguishing "in-progress" from "completed". A cycle like A depends on B, B depends on A will silently produce an incomplete ordering. The test case "activate() with circular dependency throws" will not pass with the current implementation. The algorithm needs a separate `inProgress` set:

   ```typescript
   const inProgress = new Set<PluginId>();
   const visit = (id: PluginId) => {
     if (visited.has(id)) return;
     if (inProgress.has(id)) throw new Error(`Circular dependency detected: ${id}`);
     inProgress.add(id);
     // ...visit deps...
     inProgress.delete(id);
     visited.add(id);
     sorted.push(id);
   };
   ```

4. **`onEvent` is a no-op stub.** The context's `onEvent` returns an empty function and never actually subscribes to anything. The plan mentions "Delegate to EventsAPI; implementation wired during bootstrap" but provides no wiring code. This means any plugin attempting to use `context.onEvent()` will silently fail. A test should verify that `onEvent` either delegates correctly or throws a clear "not implemented" error.

5. **Singleton mutation in tests.** The `DecoderRegistry.test.ts` singleton test registers a custom decoder named `'singleton-test'` on the global `decoderRegistry` and never removes it. If the plugin system also operates on the global singleton, tests will accumulate side effects. The new `unregisterDecoder` method should be used in test cleanup.

### Recommended Test Additions

Beyond the plan's listed tests, the following are needed:

| Test Case | Category | Rationale |
|-----------|----------|-----------|
| `activate() with circular dependency (A->B->A) throws` | Unit | Plan lists this but implementation lacks cycle detection (see above) |
| `activate() with transitive circular dependency (A->B->C->A) throws` | Unit | Multi-hop cycles are a common real-world scenario |
| `activate() when already in Error state resets and retries` | Unit | Error recovery path is untested |
| `register() with invalid manifest (missing id) throws` | Unit | No manifest validation exists; should it? |
| `register() with invalid manifest (missing contributes) throws` | Unit | Same concern |
| `PluginContext.api succeeds after setAPI()` | Unit | Validates the api getter works (currently broken) |
| `PluginContext.api throws before setAPI()` | Unit | Error path for early access |
| `PluginContext.onEvent delegates to EventsAPI` | Unit | Currently a no-op; must be wired or tested as such |
| `deactivate() calls unregisterDecoder on DecoderRegistry` | Integration | Validates cleanup actually removes decoders |
| `deactivate() calls unregister on NodeFactory` | Integration | Validates cleanup actually removes nodes |
| `dispose() after dispose() is idempotent` | Unit | Double-dispose should not throw |
| `activate() after dispose() throws or re-registers` | Unit | Terminal state enforcement |
| `loadFromURL() with module that throws in init()` | Unit | Error propagation from dynamic loading |
| `Multiple plugins registering same decoder name` | Integration | What happens if two plugins register `formatName: 'exr'`? The `DecoderRegistry.registerDecoder` replaces silently -- plugin A's decoder gets overwritten by plugin B without warning |
| `Plugin deactivation while dependent is in init()` | Edge case | Race condition during async lifecycle |
| `NodeFactory.unregister() for type registered via @RegisterNode` | Unit | Verifies decorator-registered types can be cleanly removed |
| `NodeFactory baseline tests: register, create, isRegistered, getRegisteredTypes` | Unit | Needed since no `NodeFactory.test.ts` exists today |
| `PaintEngine.registerAdvancedTool with existing tool name` | Unit | Should it throw or overwrite? |
| `PaintEngine.unregisterAdvancedTool for built-in tool (dodge)` | Unit | Should plugins be allowed to remove built-in tools? |
| `PluginRegistry.register with duplicate contributes entries` | Unit | Manifest with `contributes: ['decoder', 'decoder']` |

### Migration Safety

**Backwards compatibility is strong.** The plan is explicitly additive:
- `DecoderRegistry` constructor continues to register built-in decoders. Only a new `unregisterDecoder` method is added.
- `NodeFactory` keeps its existing `register`/`create`/`isRegistered`/`getRegisteredTypes` API. Only `unregister` is added.
- `PaintTool` type widening from a union to `BuiltinPaintTool | (string & {})` preserves assignability -- all existing literal values remain valid.
- The `@RegisterNode` decorator continues to work unchanged.
- All existing static imports (`src/nodes/sources/index.ts`, `src/nodes/groups/index.ts`, `src/formats/index.ts`, `src/export/index.ts`) remain untouched.

**One migration risk:** The `PaintTool` type widening to `BuiltinPaintTool | (string & {})` will cause any code that does exhaustive `switch` on `PaintTool` to lose TypeScript exhaustiveness checking. The plan should audit `switch` statements on `PaintTool` and ensure they have a `default` case. The existing `PaintEngine.test.ts` test PAINT-L57a checks a hardcoded list of valid tools -- this test should be updated to also verify that `BuiltinPaintTool` covers the known set while allowing `string` extensions.

**Test suite preservation:** The plan's success metric of "all existing tests pass without modification" is the right bar. However, since `DecoderRegistry.test.ts` mutates the singleton (line 461-483), and the plugin system also interacts with the singleton, there is a risk of test ordering issues. The `DecoderRegistry` tests should use fresh instances (which most already do) and the singleton tests should clean up after themselves.

### Concerns

1. **No manifest validation.** The `register()` method checks only `this.plugins.has(id)` for duplicate ID. There is no validation that `manifest.id` is non-empty, that `manifest.contributes` is a non-empty array, that `manifest.version` follows semver, or that `manifest.dependencies` reference valid IDs. Malformed manifests will cause confusing downstream errors. At minimum, `register()` should validate that `id`, `name`, and `contributes` are present and well-formed.

2. **`activate()` skips the `Initialized` state signal emission.** The code sets `entry.state = 'initialized'` after `init()` but only emits `pluginStateChanged` once, after `activate()` completes, with `state: 'active'` and `oldState: 'initialized'`. The transition from `registered` to `initialized` is never emitted. Any listener tracking the full lifecycle will miss this intermediate state.

3. **`dispose()` deletes the plugin from the Map** (`this.plugins.delete(id)`) and then emits a signal with `state: 'disposed'`. After deletion, `getPlugin(id)` and `getState(id)` will return `undefined`, which is inconsistent with the `PluginState.Disposed` enum value existing. Consider keeping the entry in the map with `Disposed` state rather than deleting it, or document this behavior clearly.

4. **No re-activation test after deactivate.** The plan lists "Plugin re-activation after deactivate" as an integration test but the implementation does not show whether `activate()` on an `'inactive'` plugin re-calls `init()` or goes straight to `activate()`. Looking at the code: `activate()` calls `init()` unconditionally if it exists. For re-activation, `init()` should probably not be called again (resources are already allocated). The state machine needs a check: if `entry.state === 'inactive'`, skip `init()` and go directly to `activate()`.

5. **`ExporterRegistry` is redundant with `PluginRegistry` internals.** The `PluginRegistry` already has `private exporterRegistry = new Map<string, ExporterContribution>()` with `getExporter`/`getExporters` accessors. Step 5 creates a separate `ExporterRegistry` class in its own file. These two registries will drift unless one delegates to the other. The plan should clarify which is the source of truth and remove the duplication.

6. **No test for the `HDRDecoderPlugin` example interacting with the real singleton.** The example test (`HDRDecoderPlugin.test.ts`) creates a new `PluginRegistry` but the plugin's `activate()` calls `context.registerDecoder()` which delegates to the global `decoderRegistry` singleton. This means the test mutates global state. Either the `PluginRegistry` constructor should accept a `DecoderRegistry` instance (dependency injection), or tests should restore the singleton state in `afterEach`.

7. **`FormatName` type is a closed union.** `DecoderRegistry.ts` defines `FormatName = 'exr' | 'dpx' | ... | null`. Plugin-registered decoders will have `formatName` values outside this union, so `detectFormat()` casts with `as FormatName`. The type should be widened to `string | null` or the cast should be removed, with a note that the union only covers built-in formats.

---

## Expert Review -- Round 1

### Verdict: APPROVE WITH CHANGES

This is a well-structured plan that correctly identifies the existing proto-plugin patterns in the codebase and proposes a lightweight orchestration layer on top of them. The design follows the right instinct: formalize what already exists rather than rewrite it. However, several API design issues, a broken `PluginContext.api` accessor, incomplete unregistration support, and an impractical sandboxing story need to be addressed before implementation.

### Accuracy Check

1. **DecoderRegistry description is accurate.** The plan correctly identifies the singleton `decoderRegistry` in `src/formats/DecoderRegistry.ts` with its `registerDecoder()` method, the `FormatDecoder` interface shape (`formatName`, `canDecode`, `decode`), and the detection-order chain in the constructor. The plan also correctly notes that `registerDecoder()` already handles duplicates by replacing an existing decoder with the same `formatName` (lines 822-830 of DecoderRegistry.ts).

2. **NodeFactory description is accurate.** `src/nodes/base/NodeFactory.ts` exports a singleton `NodeFactory` (a `NodeFactoryClass` instance) with `register()`, `create()`, `getRegisteredTypes()`, and `isRegistered()`. The `@RegisterNode` decorator uses `NodeFactory.register()`. Side-effect imports in `src/main.ts` (`import './nodes/sources'`, `import './nodes/groups'`, `import './nodes/CacheLUTNode'`) trigger decorator execution -- the plan captures this correctly.

3. **PaintEngine description is accurate.** The `PaintTool` type is indeed a closed union literal at line 40 of `src/paint/PaintEngine.ts`. The `advancedTools` Map is populated from a hardcoded `AdvancedToolName[]` array in the constructor. The `PaintToolInterface` in `src/paint/AdvancedPaintTools.ts` is accurately described.

4. **OpenRVAPI description is accurate.** It is a facade class instantiated in `src/main.ts` and assigned to `window.openrv`. It composes sub-API modules (PlaybackAPI, MediaAPI, etc.) and takes an `OpenRVAPIConfig` with `session`, `viewer`, `colorControls`, `cdlControl`, `curvesControl`.

5. **Signal usage is accurately described.** `Signal<T>` in `src/core/graph/Signal.ts` uses `emit(value, oldValue)` with two parameters, and the plan's `PluginRegistry` code uses this signature correctly.

6. **BlendMode implementation is NOT a simple per-channel function.** The plan's `BlendModeContribution` interface defines `blend(base: number, top: number): number` as a scalar channel operation. However, the actual `compositeImageData()` function in `src/composite/BlendModes.ts` is significantly more complex: it handles alpha compositing (Porter-Duff "over"), premultiplied vs. straight alpha paths, per-pixel RGBA iteration, and opacity. A per-channel blend function alone cannot express the full compositing behavior. The plan's contribution interface would only work as an extension to the *existing* `blendChannel()` helper, not as a replacement for the full compositing path.

7. **Export system has no registry.** The plan correctly observes that export is wired through static imports in `src/export/index.ts`. The `VideoExporter` class is a standalone encoder -- there is no `ExportRegistry` pattern yet. The plan's proposal for `ExporterRegistry` is sound in principle.

8. **No existing UI panel registry.** A grep for `UIPanelRegistry` or `registerPanel` returns zero results outside the plan itself. The `UIPanelContribution` is entirely new surface area, which is fine but needs more specification.

### Strengths

1. **Additive architecture.** The plan explicitly preserves all existing static registration paths. Built-in decoders still register in the `DecoderRegistry` constructor; `@RegisterNode` decorators continue to work. The plugin system adds a parallel runtime registration path without requiring migration of existing code. This is the right strategy for a codebase with 7600+ passing tests.

2. **Per-plugin registration tracking.** The `PluginEntry.registrations` object that records every `formatName`, node type, tool name, etc. registered by a specific plugin is essential for clean deactivation. This is a detail many plugin system designs miss.

3. **Topological sort for dependency ordering.** The `activateAll()` method with topological sort and recursive activation in `activate()` is correct for the stated requirement. The dependency model is simple (just a list of plugin IDs) which is appropriate for V1.

4. **Lifecycle state machine.** The `PluginState` enum with Registered -> Initialized -> Active -> Inactive -> Disposed (plus Error) covers the necessary states. Separating `init()` (validation/resource allocation) from `activate()` (capability registration) is a good design.

5. **Correct identification of the `PaintTool` type problem.** The `BuiltinPaintTool | (string & {})` pattern is the standard TypeScript idiom for keeping autocomplete on known literals while allowing arbitrary strings. This is the right fix.

6. **Lazy-loaded example plugin.** The HDR decoder plugin example uses `await import('../../formats/HDRDecoder')` inside `decode()`, preserving the existing lazy-loading strategy that keeps initial bundle size small.

### Concerns

1. **`PluginContext.api` getter is broken (also identified by QA review).** In the `createContext()` method (lines 537-540 of the plan), the `api` getter references `(this as any)._registry?.apiRef`. However, `this` inside the getter refers to the `PluginContext` object literal, not the `PluginRegistry`. The `_registry` property is never set on the context object. This will always throw `'OpenRV API not yet initialized'`. The fix is to close over the registry instance:

   ```typescript
   private createContext(entry: PluginEntry): PluginContext {
     const registry = this;  // capture the PluginRegistry
     // ...
     return {
       get api() {
         if (!registry.apiRef) throw new Error('OpenRV API not yet initialized');
         return registry.apiRef;
       },
       // ...
     };
   }
   ```

2. **`onEvent` is a no-op stub with no integration path.** The `PluginContext.onEvent()` method returns an empty unsubscribe function with a comment saying "implementation wired during bootstrap." But there is no step in the plan that actually wires it. The `EventsAPI` in `src/api/EventsAPI.ts` has a fixed `OpenRVEventName` union and uses `VALID_EVENTS` for validation, so plugins cannot subscribe to arbitrary event strings through it. The plan should either: (a) implement `onEvent` by delegating to `EventsAPI.on()` with appropriate typing, or (b) remove it from the V1 interface and add it in a follow-up.

3. **`unregisterContributions` is incomplete for decoders and nodes (also identified by QA review).** The method has comments saying these registries lack unregister, but Steps 3 and 4 add those methods. The `unregisterContributions()` implementation in Step 2 never calls them -- it only handles tools, exporters, blend modes, and UI panels. After Steps 3 and 4 are implemented, `unregisterContributions()` must also call `decoderRegistry.unregisterDecoder()` and `NodeFactory.unregister()` for tracked entries. This is a bug in the plan that would cause decoder and node registrations to leak after plugin deactivation.

4. **Topological sort does not detect cycles (also identified by QA review).** The `topologicalSort()` method uses a `visited` Set to avoid re-visiting, but it does not distinguish between "visiting" (in current DFS path) and "visited" (fully processed). A cycle A -> B -> A would silently produce an ordering without error. The plan's risk table mentions "Topological sort with cycle detection" as a mitigation, but the code does not implement it. Add a `visiting` Set to detect back-edges and throw a descriptive error.

5. **Decoder detection order matters, but `registerDecoder()` appends to the end.** The existing `DecoderRegistry` has carefully ordered decoders (e.g., float TIFF before RAW preview, AVIF gainmap before plain AVIF). Plugin-registered decoders are pushed to the end of the chain. If a plugin wants to override an existing format's detection (e.g., a better EXR decoder), `registerDecoder()` correctly replaces by `formatName`. But if a plugin introduces a new format whose magic bytes overlap with an existing detector (quite plausible with container formats like ISOBMFF), it will never be reached because the existing detector matches first. Consider adding an optional `priority` or `insertBefore` parameter to `registerDecoder()`.

6. **BlendModeContribution does not integrate with existing compositing.** The existing `BlendMode` is a string union used in `compositeImageData()` via a `switch` statement in `blendChannel()`. The plan creates a separate `blendModeRegistry` Map in `PluginRegistry` but provides no mechanism for `compositeImageData()` to look up plugin blend modes. The `blendChannel()` function's `default` case returns `bn` (pass-through), so plugin blend modes would silently fall back to "normal." The plan needs a step that modifies `blendChannel()` (or `compositeImageData`) to check the plugin registry when the blend mode is not in the built-in switch.

7. **The `ExporterContribution` interface returns `Promise<Blob>`, but the existing `VideoExporter` returns `ExportResult` (encoded chunks).** These are very different export models. The plan's `ExporterContribution` assumes a simple Blob-based export, but the real export pipeline involves `VideoExporter` -> `EncodedChunk[]` -> `muxToMP4Blob()`. There is also `generateReport()` for CSV/HTML reports and `generateEDL()`/`exportOTIO()` for editorial interchange. The `ExporterContribution` interface should be more carefully designed to either wrap the existing pipeline or provide a clear alternative. As written, migrating `VideoExporter` to an `ExporterContribution` plugin would require a lossy abstraction.

8. **UIPanelContribution uses raw DOM (`render(container: HTMLElement)`).** This is framework-agnostic, which is a strength, but the current application's UI layer would need an integration point -- a panel host component that creates containers and calls `render()`. This is entirely absent from the plan. Without it, `registerUIPanel()` just stores an object in a Map that nothing reads.

9. **Sandboxing approach is surface-level for a web application.** The plan proposes CSP, URL allowlists, timeout wrappers, and restricted `PluginContext`. In practice: (a) CSP enforcement is a deployment concern, not something the `PluginRegistry` can control at runtime -- a plugin loaded via `import()` runs with the full privileges of the page's JavaScript context regardless of `PluginContext` restrictions. (b) Timeout wrappers on `decode()` do not protect against synchronous CPU-bound infinite loops. (c) The "no raw Session/Graph access" claim is easily circumvented -- a plugin can access `window.openrv` directly, or import modules from the same bundle. The plan should be honest that V1 provides **trust-based** security (allowlisted plugin origins) rather than **isolation-based** security (Web Worker sandboxing). The Web Worker approach correctly flagged as Phase 2 is the only real sandboxing mechanism for web applications.

### Recommended Changes

1. **Fix the `PluginContext.api` getter** by closing over the `PluginRegistry` instance rather than relying on `(this as any)._registry`. This is a straightforward closure fix.

2. **Complete `unregisterContributions()`** to actually call `decoderRegistry.unregisterDecoder(name)` and `NodeFactory.unregister(type)` for each tracked registration. Without this, the deactivation guarantee is hollow.

3. **Implement cycle detection** in `topologicalSort()`. Use a three-color (white/gray/black) or two-Set approach. Throw an error naming the cycle participants.

4. **Remove or defer `onEvent()`** from the V1 `PluginContext`. It is a no-op stub with no integration plan. Shipping a documented API method that does nothing violates the principle of least surprise. If it stays, wire it to `EventsAPI.on()` and restrict the event names to `OpenRVEventName`.

5. **Wire BlendModeContribution into `blendChannel()`** by adding a fallback to the plugin registry's blend mode map when the mode is not in the built-in switch. The function signature change is small:
   ```typescript
   function blendChannel(a: number, b: number, mode: BlendMode | string): number {
     // ... existing switch ...
     default: {
       const pluginBlend = pluginRegistry.getBlendMode(mode);
       if (pluginBlend) return Math.round(pluginBlend.blend(a / 255, b / 255) * 255);
       return b; // fallback
     }
   }
   ```

6. **Add a `registerDecoder` option for priority/ordering.** Either add an optional `before?: string` parameter to specify insertion before a named decoder, or an integer priority. This is important for format detection correctness with overlapping magic bytes.

7. **Refine `ExporterContribution`** to support both simple (Blob) and streaming (chunk-based) export models. Consider a union type or an optional `encodeChunks()` method alongside `export()`. Also consider that the existing export system includes non-video outputs (CSV, HTML, EDL, OTIO) that do not fit the proposed `frameRange`/`getFrame` model at all.

8. **Resolve the `ExporterRegistry` duplication.** The plan creates a standalone `ExporterRegistry` class in Step 5 *and* a private `exporterRegistry` Map inside `PluginRegistry`. These are two separate data structures. Pick one as the source of truth. The cleanest approach is to have `PluginRegistry` delegate to the standalone `ExporterRegistry`, just as it delegates to `decoderRegistry` and `NodeFactory`.

9. **Handle the `activate()` state machine for re-activation.** Currently `activate()` calls `init()` unconditionally. If a plugin is deactivated (state = `'inactive'`) and then re-activated, `init()` should not run again -- resources are already allocated. Add a guard: skip `init()` if `entry.state === 'inactive'`.

### Missing Considerations

1. **Plugin context identity across lifecycle calls.** The plan creates a new `PluginContext` on each lifecycle call (`activate`, `deactivate`, `dispose`). This means a plugin cannot store a reference to its context in `init()` and reuse it in `deactivate()`. The context objects are structurally identical but not referentially equal. Consider creating the context once per plugin entry and reusing it, or documenting that plugins must not cache the context.

2. **Concurrent activation safety.** If `activateAll()` is called while a previous `activateAll()` is still running (both are async), there is no guard preventing double-activation. A simple `activating` flag or a per-plugin lock would prevent this.

3. **Error recovery after partial activation.** If plugin A activates successfully but plugin B (which depends on A) fails during `activate()`, plugin A remains active with its contributions registered. The plan does not specify whether the caller should roll back A. Consider adding a `safeActivateAll()` that rolls back on failure, or at minimum document the expected behavior.

4. **No versioned plugin API enforcement.** The plan's `engineVersion` field in the manifest is a minimum version check, but `PluginRegistry.register()` does not check `engineVersion` against the host's `OpenRVAPI.version`. This check should be implemented in `register()` or `activate()` to prevent incompatible plugins from loading.

5. **The `FormatName` type is a closed union.** `DecoderRegistry.ts` defines `FormatName = 'exr' | 'dpx' | ... | null`. Plugin decoders with new format names will not be assignable to `FormatName`. The `detectFormat()` method returns `FormatName`, which means callers using exhaustive type narrowing on `FormatName` will break. Widen `FormatName` to `string | null` or introduce `FormatName | (string & {})`.

6. **`@RegisterNode` decorator coexistence is undocumented.** Plugins use `context.registerNode(type, creator)`, which calls `NodeFactory.register(type, creator)`. But the existing `@RegisterNode` decorator takes a constructor and wraps it: `NodeFactory.register(type, () => new constructor())`. If a plugin wants to register a node class (rather than a factory function), it must manually wrap it. The `PluginContext.registerNode()` signature should match or document this distinction. Consider also exposing `registerNodeClass(type, constructor)` as a convenience.

7. **PaintEngine integration gap.** The plan proposes adding `registerAdvancedTool(name, tool)` to `PaintEngine` (Step 6), but `PluginContext.registerTool()` (Step 2) stores factories in `PluginRegistry.toolRegistry`, not in `PaintEngine.advancedTools`. There is no bridge between the two. Plugin tools would be discoverable via `pluginRegistry.getToolFactory()` but invisible to `PaintEngine.isAdvancedTool()` and `PaintEngine.getAdvancedTool()`. The `PluginContext.registerTool()` should delegate to `PaintEngine.registerAdvancedTool()` to maintain a single source of truth, consistent with how decoder and node registration delegates to `decoderRegistry` and `NodeFactory`.

8. **Testing `loadFromURL()` in Vitest.** Dynamic `import()` of arbitrary URLs is constrained by bundler and runtime behavior. Vitest uses Node.js or happy-dom, neither of which supports `import()` of HTTP URLs natively. The plan should specify the test approach: mocking `import()`, using blob URLs, or using Vitest's `vi.mock` / `vi.importActual` patterns. Without this, the "Load plugin from data: URL in test" success metric is at risk of being untestable.

9. **No consideration of tree-shaking impact.** The `PluginRegistry` imports `decoderRegistry`, `NodeFactory`, and types from the paint system. If the plugin module is imported, these dependencies are pulled into the bundle even if no plugins are used. Since the plan's success metric includes "< 2KB gzipped addition to core bundle," the imports should be lazy (dynamic import or dependency injection) or the plugin module should be a separate entry point that is not included in the core bundle unless explicitly imported.

10. **Reframing the sandboxing narrative.** The plan should replace "sandboxing" with "trust boundary." In V1, plugin security is based on: (a) only loading plugins from allowlisted origins, (b) providing a narrow `PluginContext` API to guide plugin authors toward supported extension points, and (c) CSP headers configured at the deployment level. True isolation requires Web Workers (Phase 2). Framing it as "trust-based" rather than "sandboxed" sets correct expectations for the security posture.
