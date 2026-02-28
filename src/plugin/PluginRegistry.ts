/**
 * PluginRegistry - Central orchestrator for plugin lifecycle management.
 *
 * Responsibilities:
 * - Register, initialize, activate, deactivate, and dispose plugins
 * - Enforce dependency ordering with cycle detection
 * - Create PluginContext instances that scope registrations per-plugin
 * - Provide runtime discovery of registered plugins and their states
 * - Delegate capability registration to domain-specific registries
 *   (DecoderRegistry, NodeFactory, PaintEngine, ExporterRegistry)
 *
 * Security model: V1 uses trust-based security (allowlisted plugin origins).
 * Plugins run in the same JavaScript context as the host application.
 */

import { Signal } from '../core/graph/Signal';
import { decoderRegistry } from '../formats/DecoderRegistry';
import { NodeFactory } from '../nodes/base/NodeFactory';
import { ExporterRegistry } from './ExporterRegistry';
import type {
  Plugin,
  PluginId,
  PluginState,
  PluginContext,
  ExporterContribution,
  BlendModeContribution,
  UIPanelContribution,
} from './types';
import type { FormatDecoder } from '../formats/DecoderRegistry';
import type { IPNode } from '../nodes/base/IPNode';
import type { PaintToolInterface } from '../paint/AdvancedPaintTools';
import type { PaintEngine } from '../paint/PaintEngine';

interface PluginEntry {
  plugin: Plugin;
  state: PluginState;
  /** Whether init() has been called at least once (survives deactivate/reactivate) */
  initialized: boolean;
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

  // Domain-specific extension registries managed directly (no existing standalone registry)
  private blendModeRegistry = new Map<string, BlendModeContribution>();
  private uiPanelRegistry = new Map<string, UIPanelContribution>();

  /** Emitted when a plugin changes state */
  readonly pluginStateChanged = new Signal<{ id: PluginId; state: PluginState }>();

  /** Reference to the OpenRV API instance, set during app bootstrap */
  private apiRef: import('../api/OpenRVAPI').OpenRVAPI | null = null;

  /** Reference to the PaintEngine instance, set during app bootstrap */
  private paintEngineRef: PaintEngine | null = null;

  setAPI(api: import('../api/OpenRVAPI').OpenRVAPI): void {
    this.apiRef = api;
  }

  /**
   * Inject the PaintEngine reference so that PluginContext.registerTool()
   * can delegate to PaintEngine.registerAdvancedTool(). Called during bootstrap.
   */
  setPaintEngine(engine: PaintEngine): void {
    this.paintEngineRef = engine;
  }

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  /**
   * Register a plugin. Validates the manifest before accepting.
   * Throws if the manifest is invalid or if a plugin with the same ID
   * is already registered (including disposed plugins).
   */
  register(plugin: Plugin): void {
    // -- Manifest validation --
    const manifest = plugin.manifest;
    if (!manifest) {
      throw new Error('Plugin manifest is missing');
    }
    if (typeof manifest.id !== 'string' || manifest.id.trim() === '') {
      throw new Error('Plugin manifest.id must be a non-empty string');
    }
    if (typeof manifest.name !== 'string' || manifest.name.trim() === '') {
      throw new Error(`Plugin "${manifest.id}": manifest.name must be a non-empty string`);
    }
    if (typeof manifest.version !== 'string' || manifest.version.trim() === '') {
      throw new Error(`Plugin "${manifest.id}": manifest.version must be a non-empty string`);
    }
    if (!Array.isArray(manifest.contributes) || manifest.contributes.length === 0) {
      throw new Error(`Plugin "${manifest.id}": manifest.contributes must be a non-empty array`);
    }

    const id = manifest.id;
    if (this.plugins.has(id)) {
      throw new Error(`Plugin "${id}" is already registered`);
    }
    this.plugins.set(id, {
      plugin,
      state: 'registered',
      initialized: false,
      registrations: {
        decoders: [], nodes: [], tools: [],
        exporters: [], blendModes: [], uiPanels: [],
      },
    });
    this.pluginStateChanged.emit(
      { id, state: 'registered' },
      { id, state: 'registered' },
    );
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async activateAll(): Promise<void> {
    const sorted = this.topologicalSort();
    for (const id of sorted) {
      const entry = this.plugins.get(id);
      // Skip already-active and disposed plugins
      if (!entry || entry.state === 'active' || entry.state === 'disposed') continue;
      await this.activate(id);
    }
  }

  async activate(id: PluginId): Promise<void> {
    const entry = this.plugins.get(id);
    if (!entry) throw new Error(`Plugin "${id}" not found`);
    if (entry.state === 'active') return;
    if (entry.state === 'disposed') {
      throw new Error(`Plugin "${id}" has been disposed and cannot be reactivated`);
    }

    // Ensure dependencies are active
    for (const depId of entry.plugin.manifest.dependencies ?? []) {
      const dep = this.plugins.get(depId);
      if (!dep) throw new Error(`Plugin "${id}" depends on "${depId}" which is not registered`);
      if (dep.state !== 'active') {
        await this.activate(depId);
      }
    }

    const context = this.createContext(entry);
    const previousState = entry.state;

    try {
      // Init -- only call on first activation, NOT on re-activation from inactive state.
      if (entry.plugin.init && !entry.initialized) {
        await entry.plugin.init(context);
        entry.initialized = true;
      }
      entry.state = 'initialized';

      // Emit the Initialized state transition
      this.pluginStateChanged.emit(
        { id, state: 'initialized' },
        { id, state: previousState },
      );

      // Activate
      await entry.plugin.activate(context);
      entry.state = 'active';

      this.pluginStateChanged.emit(
        { id, state: entry.state },
        { id, state: 'initialized' },
      );
    } catch (err) {
      entry.state = 'error';
      entry.error = err instanceof Error ? err : new Error(String(err));
      this.pluginStateChanged.emit(
        { id, state: entry.state },
        { id, state: previousState },
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

    // Unregister all contributions from domain-specific registries
    this.unregisterContributions(entry);

    entry.state = 'inactive';
    this.pluginStateChanged.emit(
      { id, state: entry.state },
      { id, state: 'active' },
    );
  }

  async dispose(id: PluginId): Promise<void> {
    const entry = this.plugins.get(id);
    if (!entry) return;

    // Idempotent: double-dispose does not throw
    if (entry.state === 'disposed') return;

    if (entry.state === 'active') {
      await this.deactivate(id);
    }

    const previousState = entry.state;
    const context = this.createContext(entry);
    try {
      if (entry.plugin.dispose) {
        await entry.plugin.dispose(context);
      }
    } catch (err) {
      // Log but don't prevent disposal -- plugin must still be marked disposed
      console.error(`[plugin:${id}] dispose() threw:`, err);
    }

    entry.state = 'disposed';
    // Retain the entry in the Map with 'disposed' state instead of deleting it.
    // This ensures getState(id) returns 'disposed' rather than undefined.
    this.pluginStateChanged.emit(
      { id, state: 'disposed' },
      { id, state: previousState },
    );
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  getPlugin(id: PluginId): Plugin | undefined {
    return this.plugins.get(id)?.plugin;
  }

  getState(id: PluginId): PluginState | undefined {
    return this.plugins.get(id)?.state;
  }

  getRegisteredIds(): PluginId[] {
    return Array.from(this.plugins.keys());
  }

  getExporter(name: string): ExporterContribution | undefined {
    return ExporterRegistry.get(name);
  }

  getExporters(): Map<string, ExporterContribution> {
    return ExporterRegistry.getAll();
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

  // -----------------------------------------------------------------------
  // Dynamic loading
  // -----------------------------------------------------------------------

  /** Allowed URL origins for plugin loading. Empty set = all origins allowed. */
  private allowedOrigins = new Set<string>();

  /**
   * Set allowed origins for loadFromURL. Only URLs matching these origins
   * will be accepted. Pass an empty array to allow all origins (not recommended).
   */
  setAllowedOrigins(origins: string[]): void {
    this.allowedOrigins = new Set(origins);
  }

  /**
   * Load a plugin from a URL (ES module with default export).
   * The module must export a default Plugin object.
   *
   * If allowed origins are configured via setAllowedOrigins(), only URLs
   * matching those origins will be accepted.
   */
  async loadFromURL(url: string): Promise<PluginId> {
    // Validate origin if allowlist is configured
    if (this.allowedOrigins.size > 0) {
      try {
        const parsed = new URL(url);
        if (!this.allowedOrigins.has(parsed.origin)) {
          throw new Error(`Plugin URL origin "${parsed.origin}" is not in the allowed origins list`);
        }
      } catch (e) {
        if (e instanceof TypeError) {
          throw new Error(`Invalid plugin URL: ${url}`);
        }
        throw e;
      }
    }

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
    // Capture the PluginRegistry instance via closure so that the api getter
    // and registerTool can access it correctly.
    const registry = this;

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
        if (!registry.paintEngineRef) {
          throw new Error('PaintEngine not yet initialized; call PluginRegistry.setPaintEngine() during bootstrap');
        }
        const tool = factory();
        registry.paintEngineRef.registerAdvancedTool(name, tool);
        reg.tools.push(name);
      },
      registerExporter: (name: string, exporter: ExporterContribution) => {
        ExporterRegistry.register(name, exporter);
        reg.exporters.push(name);
      },
      registerBlendMode: (name: string, contribution: BlendModeContribution) => {
        registry.blendModeRegistry.set(name, contribution);
        reg.blendModes.push(name);
      },
      registerUIPanel: (panel: UIPanelContribution) => {
        registry.uiPanelRegistry.set(panel.id, panel);
        reg.uiPanels.push(panel.id);
      },
      get api() {
        if (!registry.apiRef) throw new Error('OpenRV API not yet initialized');
        return registry.apiRef;
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

  /**
   * Unregister all contributions made by a plugin.
   * Delegates to domain-specific registries to ensure deactivation actually
   * removes capabilities from the system.
   */
  private unregisterContributions(entry: PluginEntry): void {
    const reg = entry.registrations;

    const pluginId = entry.plugin.manifest.id;

    try {
      // Decoders: delegate to DecoderRegistry.unregisterDecoder()
      for (const name of reg.decoders) {
        try { decoderRegistry.unregisterDecoder(name); } catch (e) {
          console.warn(`[plugin:${pluginId}] Failed to unregister decoder "${name}":`, e);
        }
      }

      // Nodes: delegate to NodeFactory.unregister()
      for (const type of reg.nodes) {
        try { NodeFactory.unregister(type); } catch (e) {
          console.warn(`[plugin:${pluginId}] Failed to unregister node "${type}":`, e);
        }
      }

      // Tools: delegate to PaintEngine.unregisterAdvancedTool()
      if (this.paintEngineRef) {
        for (const name of reg.tools) {
          try { this.paintEngineRef.unregisterAdvancedTool(name); } catch (e) {
            console.warn(`[plugin:${pluginId}] Failed to unregister tool "${name}":`, e);
          }
        }
      }

      // Exporters: delegate to standalone ExporterRegistry
      for (const name of reg.exporters) {
        try { ExporterRegistry.unregister(name); } catch (e) {
          console.warn(`[plugin:${pluginId}] Failed to unregister exporter "${name}":`, e);
        }
      }

      // Blend modes
      for (const name of reg.blendModes) {
        try { this.blendModeRegistry.delete(name); } catch (e) {
          console.warn(`[plugin:${pluginId}] Failed to unregister blend mode "${name}":`, e);
        }
      }

      // UI panels
      for (const id of reg.uiPanels) {
        try {
          const panel = this.uiPanelRegistry.get(id);
          panel?.destroy?.();
          this.uiPanelRegistry.delete(id);
        } catch (e) {
          console.warn(`[plugin:${pluginId}] Failed to unregister UI panel "${id}":`, e);
        }
      }
    } finally {
      // Always reset tracking arrays, even if cleanup partially failed
      reg.decoders = [];
      reg.nodes = [];
      reg.tools = [];
      reg.exporters = [];
      reg.blendModes = [];
      reg.uiPanels = [];
    }
  }

  /**
   * Topological sort of plugins by dependency order.
   * Uses a two-Set DFS approach to detect cycles:
   * - `inProgress`: nodes currently being visited in the DFS stack (gray)
   * - `visited`: nodes fully processed (black)
   * A back-edge to an inProgress node indicates a cycle.
   */
  private topologicalSort(): PluginId[] {
    const visited = new Set<PluginId>();
    const inProgress = new Set<PluginId>();
    const sorted: PluginId[] = [];

    const visit = (id: PluginId) => {
      if (visited.has(id)) return;
      if (inProgress.has(id)) {
        throw new Error(`Circular plugin dependency detected involving: ${id}`);
      }
      inProgress.add(id);
      const entry = this.plugins.get(id);
      if (!entry) return;
      for (const dep of entry.plugin.manifest.dependencies ?? []) {
        visit(dep);
      }
      inProgress.delete(id);
      visited.add(id);
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
