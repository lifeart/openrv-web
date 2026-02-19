/**
 * OCIOWasmBridge — Connects OCIOProcessor to the WASM OCIO module
 *
 * When the WASM module is available and initialised, the bridge:
 * - Replaces the baked-LUT pipeline with native OCIO GPU processing
 * - Generates GLSL shader code for the WebGL2 renderer
 * - Falls back to the existing JS-based OCIOTransform when WASM is unavailable
 *
 * This bridge is the integration point between:
 *   OCIOProcessor  ←→  OCIOWasmModule  →  OCIOShaderTranslator  →  Renderer
 */

import { OCIOWasmModule, ConfigHandle, OCIOWasmFactory } from './OCIOWasmModule';
import { OCIOVirtualFS, VFSLoadOptions } from './OCIOVirtualFS';
import { translateOCIOShader, TranslatedShader, ShaderTranslateOptions } from './OCIOShaderTranslator';
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import type { LUT3D } from '../LUTLoader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OCIOWasmBridgeEvents extends EventMap {
  /** Fired when WASM module status changes */
  statusChanged: { ready: boolean; error?: string };
  /** Fired when a new shader + LUT is available */
  shaderReady: TranslatedShader;
  /** Fired when the bridge falls back to JS transforms */
  fallback: { reason: string };
}

export interface OCIOWasmBridgeConfig {
  /** WASM module factory (Emscripten loader) */
  factory?: OCIOWasmFactory;
  /** Pre-built VFS instance (optional) */
  vfs?: OCIOVirtualFS;
  /** Whether to auto-initialise on construction. Default: false */
  autoInit?: boolean;
}

/** State of the current OCIO pipeline through WASM */
export interface WasmPipelineState {
  /** Whether using WASM (true) or JS fallback (false) */
  usingWasm: boolean;
  /** Current OCIO config name loaded in WASM */
  configName: string | null;
  /** Active processor handle (or null if none) */
  processorHandle: number | null;
  /** Translated shader (or null if using fallback) */
  shader: TranslatedShader | null;
}

// ---------------------------------------------------------------------------
// OCIOWasmBridge
// ---------------------------------------------------------------------------

export class OCIOWasmBridge extends EventEmitter<OCIOWasmBridgeEvents> {
  private module: OCIOWasmModule;
  private vfs: OCIOVirtualFS;
  private configHandle: ConfigHandle | null = null;
  private processorHandle: number | null = null;
  private currentShader: TranslatedShader | null = null;
  private disposed = false;

  constructor(config: OCIOWasmBridgeConfig = {}) {
    super();
    this.vfs = config.vfs ?? new OCIOVirtualFS();
    this.module = new OCIOWasmModule(config.factory, this.vfs);

    if (config.autoInit && config.factory) {
      // Fire-and-forget init (errors emitted via event)
      this.init().catch(() => {});
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initialise the WASM module. Safe to call multiple times.
   */
  async init(): Promise<void> {
    if (this.disposed) throw new Error('OCIOWasmBridge is disposed');

    try {
      await this.module.init();
      this.emit('statusChanged', { ready: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.emit('statusChanged', { ready: false, error: msg });
      throw e;
    }
  }

  /** Whether the WASM module is ready for use */
  isReady(): boolean {
    return this.module.isReady();
  }

  /** Get the current pipeline state */
  getPipelineState(): WasmPipelineState {
    return {
      usingWasm: this.module.isReady() && this.processorHandle !== null,
      configName: this.configHandle?.name ?? null,
      processorHandle: this.processorHandle,
      shader: this.currentShader,
    };
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.releaseProcessor();
    this.releaseConfig();
    this.module.dispose();
    this.removeAllListeners();
  }

  // -----------------------------------------------------------------------
  // Config Management
  // -----------------------------------------------------------------------

  /**
   * Load an OCIO config from YAML text into the WASM module.
   * LUT files referenced by the config should already be loaded into the VFS.
   *
   * @param configYaml - OCIO config YAML text
   * @param name - Human-readable config name
   */
  loadConfig(configYaml: string, name: string = 'custom'): void {
    this.ensureReady();

    // Release previous config
    this.releaseProcessor();
    this.releaseConfig();

    this.configHandle = this.module.loadConfig(configYaml, name);
  }

  /**
   * Preload LUT files referenced by a config, then load the config.
   *
   * @param configYaml - OCIO config YAML text
   * @param name - Config name
   * @param options - URL loading options (baseUrl for LUT file resolution)
   */
  async loadConfigWithFiles(
    configYaml: string,
    name: string,
    options: VFSLoadOptions = {},
  ): Promise<void> {
    this.ensureReady();

    // Extract file references and search paths
    const files = this.vfs.extractFileReferences(configYaml);
    const searchPaths = this.vfs.extractSearchPaths(configYaml);

    if (files.length > 0) {
      // Build URL entries: for each file, try all search paths in order.
      // Store files under bare name (OCIO resolves via search_path internally).
      const allEntries: Array<{ virtualPath: string; url: string }> = [];
      const prefixes = searchPaths.length > 0 ? searchPaths : [''];

      for (const f of files) {
        for (const prefix of prefixes) {
          const url = prefix ? `${prefix}/${f}` : f;
          allEntries.push({ virtualPath: f, url });
        }
      }

      // Preload with first-match semantics: later overwrites are fine
      await this.vfs.preloadBatch(allEntries, options);
    }

    this.loadConfig(configYaml, name);
  }

  /**
   * Get config information from the loaded WASM config.
   */
  getConfigInfo(): {
    displays: string[];
    colorSpaces: string[];
    looks: string[];
  } | null {
    if (!this.configHandle || !this.module.isReady()) return null;

    return {
      displays: this.module.getDisplays(this.configHandle),
      colorSpaces: this.module.getColorSpaces(this.configHandle),
      looks: this.module.getLooks(this.configHandle),
    };
  }

  /**
   * Get views for a display from the loaded WASM config.
   */
  getViews(display: string): string[] {
    if (!this.configHandle || !this.module.isReady()) return [];
    return this.module.getViews(this.configHandle, display);
  }

  // -----------------------------------------------------------------------
  // Processor / Shader Pipeline
  // -----------------------------------------------------------------------

  /**
   * Build a display viewing processor and generate its GLSL shader.
   * This is the main integration point: it creates the OCIO pipeline
   * for the current display/view/look settings and returns the translated
   * shader code ready for WebGL2.
   *
   * @param srcColorSpace - Input color space
   * @param display - Display device
   * @param view - View transform
   * @param look - Look transform (empty for none)
   * @param shaderOptions - Shader translation options
   * @returns Translated shader, or null if WASM is not available
   */
  buildDisplayPipeline(
    srcColorSpace: string,
    display: string,
    view: string,
    look: string = '',
    shaderOptions: ShaderTranslateOptions = {},
  ): TranslatedShader | null {
    if (!this.module.isReady() || !this.configHandle) {
      this.emit('fallback', { reason: 'WASM module not ready or no config loaded' });
      return null;
    }

    // Release previous processor
    this.releaseProcessor();

    try {
      this.processorHandle = this.module.createDisplayProcessor(
        this.configHandle, srcColorSpace, display, view, look,
      );

      const rawGLSL = this.module.generateShaderCode(this.processorHandle);
      this.currentShader = translateOCIOShader(rawGLSL, shaderOptions);

      this.emit('shaderReady', this.currentShader);
      return this.currentShader;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.emit('fallback', { reason: `Processor creation failed: ${msg}` });
      this.releaseProcessor();
      return null;
    }
  }

  /**
   * Build a simple color space conversion processor.
   */
  buildConversionPipeline(
    srcColorSpace: string,
    dstColorSpace: string,
    shaderOptions: ShaderTranslateOptions = {},
  ): TranslatedShader | null {
    if (!this.module.isReady() || !this.configHandle) {
      this.emit('fallback', { reason: 'WASM module not ready or no config loaded' });
      return null;
    }

    this.releaseProcessor();

    try {
      this.processorHandle = this.module.createProcessor(
        this.configHandle, srcColorSpace, dstColorSpace,
      );

      const rawGLSL = this.module.generateShaderCode(this.processorHandle);
      this.currentShader = translateOCIOShader(rawGLSL, shaderOptions);

      this.emit('shaderReady', this.currentShader);
      return this.currentShader;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.emit('fallback', { reason: `Processor creation failed: ${msg}` });
      this.releaseProcessor();
      return null;
    }
  }

  /**
   * Get a baked 3D LUT from the current processor.
   * This LUT can be uploaded to a WebGL 3D texture for GPU processing.
   *
   * @param size - LUT cube edge size (default: 65)
   * @returns LUT3D compatible with the existing pipeline, or null
   */
  bake3DLUT(size: number = 65): LUT3D | null {
    if (!this.module.isReady() || this.processorHandle === null) {
      return null;
    }

    try {
      const rawData = this.module.getProcessorLUT3D(this.processorHandle, size);
      return {
        title: 'OCIO WASM LUT',
        size,
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        data: new Float32Array(rawData), // Copy — WASM heap views are volatile
      };
    } catch {
      return null;
    }
  }

  /**
   * Apply the current processor to a single RGB triplet.
   * Useful for color picking / pixel probing.
   */
  transformColor(r: number, g: number, b: number): [number, number, number] | null {
    if (!this.module.isReady() || this.processorHandle === null) {
      return null;
    }

    try {
      return this.module.applyRGB(this.processorHandle, r, g, b);
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // VFS Access
  // -----------------------------------------------------------------------

  /** Get the virtual filesystem for preloading LUT files */
  getVFS(): OCIOVirtualFS {
    return this.vfs;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private ensureReady(): void {
    if (this.disposed) throw new Error('OCIOWasmBridge is disposed');
    if (!this.module.isReady()) {
      throw new Error('OCIOWasmBridge: WASM module not initialised. Call init() first.');
    }
  }

  private releaseProcessor(): void {
    if (this.processorHandle !== null && this.module.isReady()) {
      try {
        this.module.destroyProcessor(this.processorHandle);
      } catch { /* best effort */ }
    }
    this.processorHandle = null;
    this.currentShader = null;
  }

  private releaseConfig(): void {
    if (this.configHandle !== null && this.module.isReady()) {
      try {
        this.module.destroyConfig(this.configHandle);
      } catch { /* best effort */ }
    }
    this.configHandle = null;
  }
}
