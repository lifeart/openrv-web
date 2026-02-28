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

export type PluginState =
  | 'registered'
  | 'initialized'
  | 'active'
  | 'inactive'
  | 'disposed'
  | 'error';

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
  /** Register a paint tool (delegates to PaintEngine.registerAdvancedTool) */
  registerTool(name: string, factory: () => import('../paint/AdvancedPaintTools').PaintToolInterface): void;
  /** Register an exporter (delegates to standalone ExporterRegistry) */
  registerExporter(name: string, exporter: ExporterContribution): void;
  /** Register a blend mode */
  registerBlendMode(name: string, blendFn: BlendModeContribution): void;
  /** Register a UI panel */
  registerUIPanel(panel: UIPanelContribution): void;
  /** Access the public OpenRV API (late-bound via closure over PluginRegistry) */
  readonly api: import('../api/OpenRVAPI').OpenRVAPI;
  /**
   * NOTE: onEvent() is deferred to Phase 2. The existing EventsAPI uses a closed
   * OpenRVEventName union that cannot accommodate arbitrary plugin event strings.
   * Shipping a no-op stub would violate the principle of least surprise.
   */
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

/** Blob-based exporter (e.g., image sequences, custom video encodings) */
export interface BlobExporterContribution {
  kind: 'blob';
  /** Human-readable label shown in export UI */
  label: string;
  /** File extension(s) this exporter produces */
  extensions: string[];
  /** Export function returning a Blob */
  export(config: BlobExporterConfig): Promise<Blob>;
}

export interface BlobExporterConfig {
  frameRange: { start: number; end: number };
  width: number;
  height: number;
  fps: number;
  getFrame: (frame: number) => Promise<ImageData>;
  onProgress?: (pct: number) => void;
}

/** Text-based exporter (e.g., CSV reports, EDL, OTIO, HTML) */
export interface TextExporterContribution {
  kind: 'text';
  /** Human-readable label shown in export UI */
  label: string;
  /** File extension(s) this exporter produces (e.g., ['csv'], ['edl'], ['otio']) */
  extensions: string[];
  /** MIME type for the output (e.g., 'text/csv', 'application/json') */
  mimeType: string;
  /** Export function returning text content */
  export(config: TextExporterConfig): Promise<string>;
}

export interface TextExporterConfig {
  /** Application state/data the exporter needs -- varies by export type */
  [key: string]: unknown;
}

/** Union of all exporter contribution types */
export type ExporterContribution = BlobExporterContribution | TextExporterContribution;

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
