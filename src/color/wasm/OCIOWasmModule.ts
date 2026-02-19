/**
 * OCIOWasmModule — TypeScript wrapper for the OpenColorIO WASM binary
 *
 * Provides lazy initialization, lifecycle management, and a typed API surface
 * over the Emscripten-compiled OpenColorIO WASM module. Falls back gracefully
 * when the WASM binary is not available (e.g. in test environments).
 *
 * The WASM binary exports the C++ OCIO functions via Embind/cwrap.
 * This module normalises that interface for use in TypeScript.
 */

import { OCIOVirtualFS } from './OCIOVirtualFS';

// ---------------------------------------------------------------------------
// Types — mirror of the OCIO C++ API surface exposed by Emscripten
// ---------------------------------------------------------------------------

/** Raw exports from the OCIO WASM module (Emscripten Embind) */
export interface OCIOWasmExports {
  /** Load an OCIO config from a string (YAML text) */
  ocioLoadConfig(configYaml: string): number; // handle
  /** Destroy a previously loaded config */
  ocioDestroyConfig(handle: number): void;
  /** Get display names (JSON array string) */
  ocioGetDisplays(configHandle: number): string;
  /** Get view names for a display (JSON array string) */
  ocioGetViews(configHandle: number, display: string): string;
  /** Get color space names (JSON array string) */
  ocioGetColorSpaces(configHandle: number): string;
  /** Get look names (JSON array string) */
  ocioGetLooks(configHandle: number): string;
  /** Build a GPU processor and return GLSL shader code */
  ocioGetProcessor(
    configHandle: number,
    srcColorSpace: string,
    dstColorSpace: string,
  ): number; // processor handle
  /** Build a display processor: src → display + view, optional look */
  ocioGetDisplayProcessor(
    configHandle: number,
    srcColorSpace: string,
    display: string,
    view: string,
    look: string,
  ): number; // processor handle
  /** Generate GLSL shader text from a processor */
  ocioGenerateShaderCode(processorHandle: number): string;
  /** Get the 3D LUT texture data for a processor (Float32Array, RGB triplets) */
  ocioGetProcessorLUT3D(processorHandle: number, size: number): Float32Array;
  /** Destroy a processor */
  ocioDestroyProcessor(processorHandle: number): void;
  /** Apply a processor to a single RGB triplet (returns [r, g, b]) */
  ocioApplyRGB(processorHandle: number, r: number, g: number, b: number): Float32Array;
  /** Get WASM module version string */
  ocioGetVersion(): string;
  /** Mount a virtual filesystem directory */
  ocioMountVFS?(path: string): void;
  /** Write a file to the virtual filesystem */
  ocioWriteVFSFile?(path: string, data: Uint8Array): void;
}

/** Emscripten module factory */
export type OCIOWasmFactory = () => Promise<OCIOWasmExports>;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Initialisation status */
export type OCIOWasmStatus = 'uninitialised' | 'loading' | 'ready' | 'error' | 'disposed';

/** A loaded config handle with its metadata */
export interface ConfigHandle {
  id: number;
  name: string;
}

// ---------------------------------------------------------------------------
// OCIOWasmModule
// ---------------------------------------------------------------------------

export class OCIOWasmModule {
  private status: OCIOWasmStatus = 'uninitialised';
  private wasm: OCIOWasmExports | null = null;
  private initPromise: Promise<void> | null = null;
  private factory: OCIOWasmFactory | null;
  private configs: Map<number, ConfigHandle> = new Map();
  private processors: Set<number> = new Set();
  private vfs: OCIOVirtualFS;
  private syncedFiles: Set<string> = new Set();

  constructor(factory?: OCIOWasmFactory, vfs?: OCIOVirtualFS) {
    this.factory = factory ?? null;
    this.vfs = vfs ?? new OCIOVirtualFS();
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Current status */
  getStatus(): OCIOWasmStatus {
    return this.status;
  }

  /** Whether the module is ready for use */
  isReady(): boolean {
    return this.status === 'ready' && this.wasm !== null;
  }

  /**
   * Initialise the WASM module. Safe to call multiple times — deduplicates.
   * @throws Error if no factory was provided or initialisation fails
   */
  async init(): Promise<void> {
    if (this.status === 'disposed') throw new Error('OCIOWasmModule is disposed');
    if (this.status === 'ready') return;

    // If a previous init failed, allow retry by creating a new promise
    if (!this.initPromise || this.status === 'error') {
      this.initPromise = this.doInit();
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    if (!this.factory) {
      this.status = 'error';
      throw new Error('OCIOWasmModule: no factory provided. Pass an Emscripten module factory to the constructor.');
    }

    this.status = 'loading';
    try {
      this.wasm = await this.factory();
      this.status = 'ready';
    } catch (e) {
      this.status = 'error';
      this.wasm = null;
      // Keep initPromise alive so concurrent callers get same rejection
      throw new Error(`OCIOWasmModule: init failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Only clear on success so concurrent callers share the resolved promise
    this.initPromise = null;
  }

  /**
   * Dispose all resources. Module cannot be used after this.
   */
  dispose(): void {
    if (this.status === 'disposed') return;

    // Destroy all processors first
    for (const ph of this.processors) {
      try { this.wasm?.ocioDestroyProcessor(ph); } catch { /* best effort */ }
    }
    this.processors.clear();

    // Destroy all configs
    for (const [id] of this.configs) {
      try { this.wasm?.ocioDestroyConfig(id); } catch { /* best effort */ }
    }
    this.configs.clear();

    this.vfs.dispose();
    this.wasm = null;
    this.status = 'disposed';
  }

  /** Get OCIO version string from the WASM module */
  getVersion(): string {
    this.ensureReady();
    return this.wasm!.ocioGetVersion();
  }

  // -----------------------------------------------------------------------
  // Config Management
  // -----------------------------------------------------------------------

  /**
   * Load an OCIO config from YAML text.
   * Any LUT files referenced by the config should be preloaded via the VFS.
   *
   * @param yaml - OCIO config YAML text
   * @param name - Human-readable config name
   * @returns Config handle
   */
  loadConfig(yaml: string, name: string = 'custom'): ConfigHandle {
    this.ensureReady();

    // Sync VFS files to WASM filesystem (if the module supports it)
    this.syncVFS();

    const id = this.wasm!.ocioLoadConfig(yaml);
    if (id < 0) {
      throw new Error(`OCIOWasmModule: failed to load config '${name}'`);
    }

    const handle: ConfigHandle = { id, name };
    this.configs.set(id, handle);
    return handle;
  }

  /**
   * Destroy a loaded config and free its WASM resources.
   */
  destroyConfig(handle: ConfigHandle): void {
    this.ensureReady();
    if (!this.configs.has(handle.id)) return;

    this.wasm!.ocioDestroyConfig(handle.id);
    this.configs.delete(handle.id);
  }

  /**
   * Get display names from a loaded config.
   */
  getDisplays(config: ConfigHandle): string[] {
    this.ensureReady();
    const json = this.wasm!.ocioGetDisplays(config.id);
    return parseJSONArray(json);
  }

  /**
   * Get view names for a display in a loaded config.
   */
  getViews(config: ConfigHandle, display: string): string[] {
    this.ensureReady();
    const json = this.wasm!.ocioGetViews(config.id, display);
    return parseJSONArray(json);
  }

  /**
   * Get all color space names from a loaded config.
   */
  getColorSpaces(config: ConfigHandle): string[] {
    this.ensureReady();
    const json = this.wasm!.ocioGetColorSpaces(config.id);
    return parseJSONArray(json);
  }

  /**
   * Get all look names from a loaded config.
   */
  getLooks(config: ConfigHandle): string[] {
    this.ensureReady();
    const json = this.wasm!.ocioGetLooks(config.id);
    return parseJSONArray(json);
  }

  // -----------------------------------------------------------------------
  // Processor / Shader
  // -----------------------------------------------------------------------

  /**
   * Build a display viewing processor: src color space → display + view.
   *
   * @param config - Config handle
   * @param srcColorSpace - Input color space name
   * @param display - Display device
   * @param view - View transform
   * @param look - Optional look transform (empty string for none)
   * @returns Processor handle (number)
   */
  createDisplayProcessor(
    config: ConfigHandle,
    srcColorSpace: string,
    display: string,
    view: string,
    look: string = '',
  ): number {
    this.ensureReady();
    const ph = this.wasm!.ocioGetDisplayProcessor(
      config.id, srcColorSpace, display, view, look,
    );
    if (ph < 0) {
      throw new Error(
        `OCIOWasmModule: failed to create processor ` +
        `(${srcColorSpace} → ${display}/${view}, look=${look || 'none'})`
      );
    }
    this.processors.add(ph);
    return ph;
  }

  /**
   * Build a color space conversion processor: src → dst.
   */
  createProcessor(
    config: ConfigHandle,
    srcColorSpace: string,
    dstColorSpace: string,
  ): number {
    this.ensureReady();
    const ph = this.wasm!.ocioGetProcessor(config.id, srcColorSpace, dstColorSpace);
    if (ph < 0) {
      throw new Error(
        `OCIOWasmModule: failed to create processor (${srcColorSpace} → ${dstColorSpace})`
      );
    }
    this.processors.add(ph);
    return ph;
  }

  /**
   * Generate GLSL shader code from a processor.
   * The returned GLSL is in GLSL 1.x format; use OCIOShaderTranslator
   * to convert to GLSL ES 300 for WebGL2.
   */
  generateShaderCode(processorHandle: number): string {
    this.ensureReady();
    if (!this.processors.has(processorHandle)) {
      throw new Error('OCIOWasmModule: invalid processor handle');
    }
    return this.wasm!.ocioGenerateShaderCode(processorHandle);
  }

  /**
   * Get a baked 3D LUT from a processor (for GPU upload).
   *
   * @param processorHandle - Processor handle
   * @param size - LUT cube size (e.g. 33 or 65)
   * @returns Float32Array of size^3 * 3 RGB values
   */
  getProcessorLUT3D(processorHandle: number, size: number): Float32Array {
    this.ensureReady();
    if (!this.processors.has(processorHandle)) {
      throw new Error('OCIOWasmModule: invalid processor handle');
    }
    return this.wasm!.ocioGetProcessorLUT3D(processorHandle, size);
  }

  /**
   * Apply a processor to a single RGB triplet.
   */
  applyRGB(processorHandle: number, r: number, g: number, b: number): [number, number, number] {
    this.ensureReady();
    if (!this.processors.has(processorHandle)) {
      throw new Error('OCIOWasmModule: invalid processor handle');
    }
    const result = this.wasm!.ocioApplyRGB(processorHandle, r, g, b);
    return [result[0]!, result[1]!, result[2]!];
  }

  /**
   * Destroy a processor and free its WASM resources.
   */
  destroyProcessor(processorHandle: number): void {
    this.ensureReady();
    if (!this.processors.has(processorHandle)) return;

    this.wasm!.ocioDestroyProcessor(processorHandle);
    this.processors.delete(processorHandle);
  }

  // -----------------------------------------------------------------------
  // VFS Access
  // -----------------------------------------------------------------------

  /**
   * Get the virtual filesystem instance for preloading LUT files.
   */
  getVFS(): OCIOVirtualFS {
    return this.vfs;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private ensureReady(): void {
    if (this.status === 'disposed') throw new Error('OCIOWasmModule is disposed');
    if (this.status !== 'ready' || !this.wasm) {
      throw new Error('OCIOWasmModule is not initialised. Call init() first.');
    }
  }

  /**
   * Sync VFS contents to the WASM virtual filesystem (if supported).
   * Clears the sync cache on each config load so updated files are re-synced.
   */
  private syncVFS(): void {
    if (!this.wasm?.ocioMountVFS || !this.wasm?.ocioWriteVFSFile) return;

    // Clear sync cache so overwritten VFS files are re-synced
    this.syncedFiles.clear();

    for (const entry of this.vfs.listFiles()) {
      this.wasm.ocioWriteVFSFile(entry.path, entry.data);
      this.syncedFiles.add(entry.path);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJSONArray(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
