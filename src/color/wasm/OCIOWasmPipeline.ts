/**
 * OCIOWasmPipeline -- End-to-end orchestrator for the OCIO WASM GPU pipeline
 *
 * This module connects all the WASM OCIO pieces together:
 *   1. OCIOWasmBridge  -- manages the WASM module lifecycle and config
 *   2. OCIOShaderTranslator -- translates OCIO GLSL 1.x to GLSL ES 300 es
 *   3. Renderer -- consumes the translated shader + 3D LUT texture
 *
 * Usage:
 *   const pipeline = new OCIOWasmPipeline({ factory });
 *   await pipeline.init();
 *   pipeline.loadConfig(configYaml, 'aces_cg');
 *   const result = pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
 *   // result.shader  -- translated GLSL ES 300 es function snippet
 *   // result.lut3D   -- baked 3D LUT (Float32Array RGB, size^3*3)
 *   // result.uniforms -- uniform metadata for the renderer
 *
 * The pipeline also provides a fallback path: when WASM is not available,
 * it returns a baked 3D LUT from OCIOProcessor's JS transform, using the
 * same LUT3D interface the renderer already consumes via setLUT().
 */

import { OCIOWasmBridge, type OCIOWasmBridgeConfig } from './OCIOWasmBridge';
import type { TranslatedShader, UniformInfo, ShaderTranslateOptions } from './OCIOShaderTranslator';
import type { LUT3D } from '../LUTLoader';
import { EventEmitter, EventMap } from '../../utils/EventEmitter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of building an OCIO pipeline through WASM */
export interface OCIOPipelineResult {
  /** Translated GLSL ES 300 es shader code (function snippet) */
  shader: TranslatedShader;
  /** Baked 3D LUT from the WASM processor (RGB Float32Array) */
  lut3D: LUT3D;
  /** Uniform metadata extracted from the OCIO shader */
  uniforms: UniformInfo[];
  /** The OCIO function entry point name */
  functionName: string;
  /** Whether this result came from WASM (true) or JS fallback (false) */
  fromWasm: boolean;
}

/** Pipeline mode: wasm uses native OCIO GLSL, baked uses 3D LUT only */
export type OCIOPipelineMode = 'wasm' | 'baked' | 'off';

/** Events emitted by the pipeline */
export interface OCIOWasmPipelineEvents extends EventMap {
  /** Fired when the pipeline mode changes */
  modeChanged: { mode: OCIOPipelineMode; reason: string };
  /** Fired when a new pipeline result is available */
  pipelineReady: OCIOPipelineResult;
  /** Fired on pipeline errors (non-fatal, pipeline degrades gracefully) */
  error: { message: string; phase: string };
}

/** Configuration for the pipeline */
export interface OCIOWasmPipelineConfig extends OCIOWasmBridgeConfig {
  /** Default LUT size for baking. Default: 65 */
  lutSize?: number;
  /** Shader translation options */
  shaderOptions?: ShaderTranslateOptions;
}

// ---------------------------------------------------------------------------
// OCIOWasmPipeline
// ---------------------------------------------------------------------------

export class OCIOWasmPipeline extends EventEmitter<OCIOWasmPipelineEvents> {
  private bridge: OCIOWasmBridge;
  private mode: OCIOPipelineMode = 'off';
  private lutSize: number;
  private shaderOptions: ShaderTranslateOptions;
  private currentResult: OCIOPipelineResult | null = null;
  private disposed = false;

  // Track current pipeline parameters to detect changes
  private currentParams: {
    srcColorSpace: string;
    display: string;
    view: string;
    look: string;
  } | null = null;

  constructor(config: OCIOWasmPipelineConfig = {}) {
    super();
    this.bridge = new OCIOWasmBridge(config);
    this.lutSize = config.lutSize ?? 65;
    this.shaderOptions = config.shaderOptions ?? {};
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initialize the WASM module. If initialization fails, the pipeline
   * degrades to 'baked' mode (using the JS OCIOProcessor's baked LUTs).
   */
  async init(): Promise<void> {
    if (this.disposed) throw new Error('OCIOWasmPipeline is disposed');

    try {
      await this.bridge.init();
      this.setMode('wasm', 'WASM module initialized successfully');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setMode('baked', `WASM init failed, using baked LUT fallback: ${msg}`);
      this.emit('error', { message: msg, phase: 'init' });
    }
  }

  /** Whether the WASM module is ready */
  isReady(): boolean {
    return this.bridge.isReady();
  }

  /** Current pipeline mode */
  getMode(): OCIOPipelineMode {
    return this.mode;
  }

  /** Get the current pipeline result (null if no pipeline has been built) */
  getCurrentResult(): OCIOPipelineResult | null {
    return this.currentResult;
  }

  /** Get the underlying bridge for advanced config/VFS access */
  getBridge(): OCIOWasmBridge {
    return this.bridge;
  }

  /** Dispose all resources */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bridge.dispose();
    this.currentResult = null;
    this.currentParams = null;
    this.removeAllListeners();
  }

  // -----------------------------------------------------------------------
  // Config Management
  // -----------------------------------------------------------------------

  /**
   * Load an OCIO config from YAML text.
   * Delegates to the bridge, which handles VFS syncing.
   */
  loadConfig(configYaml: string, name: string = 'custom'): void {
    this.ensureNotDisposed();
    if (!this.bridge.isReady()) {
      this.emit('error', { message: 'Cannot load config: WASM not ready', phase: 'loadConfig' });
      return;
    }
    this.bridge.loadConfig(configYaml, name);
    // Clear current result since config changed
    this.currentResult = null;
    this.currentParams = null;
  }

  /**
   * Load an OCIO config with its referenced LUT files.
   */
  async loadConfigWithFiles(
    configYaml: string,
    name: string,
    options: { baseUrl?: string } = {},
  ): Promise<void> {
    this.ensureNotDisposed();
    if (!this.bridge.isReady()) {
      this.emit('error', { message: 'Cannot load config: WASM not ready', phase: 'loadConfigWithFiles' });
      return;
    }
    await this.bridge.loadConfigWithFiles(configYaml, name, options);
    this.currentResult = null;
    this.currentParams = null;
  }

  /**
   * Get available displays from the loaded config.
   */
  getDisplays(): string[] {
    const info = this.bridge.getConfigInfo();
    return info?.displays ?? [];
  }

  /**
   * Get views for a display from the loaded config.
   */
  getViews(display: string): string[] {
    return this.bridge.getViews(display);
  }

  /**
   * Get color spaces from the loaded config.
   */
  getColorSpaces(): string[] {
    const info = this.bridge.getConfigInfo();
    return info?.colorSpaces ?? [];
  }

  // -----------------------------------------------------------------------
  // Pipeline Building
  // -----------------------------------------------------------------------

  /**
   * Build the full display viewing pipeline.
   *
   * When in 'wasm' mode:
   *   1. Creates an OCIO processor via the bridge
   *   2. Generates GLSL shader code
   *   3. Translates to GLSL ES 300 es
   *   4. Bakes a 3D LUT from the processor
   *   5. Returns shader + LUT + uniforms
   *
   * When WASM fails, falls back to returning just a baked LUT
   * (the caller should use the existing setLUT() path).
   *
   * @param srcColorSpace - Input color space
   * @param display - Display device
   * @param view - View transform
   * @param look - Look transform (empty for none)
   * @returns Pipeline result, or null if nothing could be built
   */
  buildDisplayPipeline(
    srcColorSpace: string,
    display: string,
    view: string,
    look: string = '',
  ): OCIOPipelineResult | null {
    this.ensureNotDisposed();

    // Check if parameters haven't changed
    if (
      this.currentResult &&
      this.currentParams &&
      this.currentParams.srcColorSpace === srcColorSpace &&
      this.currentParams.display === display &&
      this.currentParams.view === view &&
      this.currentParams.look === look
    ) {
      return this.currentResult;
    }

    // Store current params
    this.currentParams = { srcColorSpace, display, view, look };

    if (this.mode === 'off') {
      return null;
    }

    // Try WASM path first
    if (this.mode === 'wasm' && this.bridge.isReady()) {
      const result = this.buildWasmPipeline(srcColorSpace, display, view, look);
      if (result) {
        this.currentResult = result;
        this.emit('pipelineReady', result);
        return result;
      }
      // WASM failed, degrade to baked mode
      this.setMode('baked', 'WASM pipeline build failed, falling back to baked LUT');
    }

    // Baked LUT fallback: use the bridge's bake3DLUT if a processor exists
    if (this.bridge.isReady()) {
      const bakedResult = this.buildBakedFallback(srcColorSpace, display, view, look);
      if (bakedResult) {
        this.currentResult = bakedResult;
        this.emit('pipelineReady', bakedResult);
        return bakedResult;
      }
    }

    return null;
  }

  /**
   * Force rebuild the current pipeline (e.g. after LUT size change).
   */
  rebuild(): OCIOPipelineResult | null {
    if (!this.currentParams) return null;
    // Clear cached result to force rebuild
    this.currentResult = null;
    return this.buildDisplayPipeline(
      this.currentParams.srcColorSpace,
      this.currentParams.display,
      this.currentParams.view,
      this.currentParams.look,
    );
  }

  /**
   * Set the LUT baking size. Invalidates the cached result if the size changes.
   */
  setLutSize(size: number): void {
    if (size >= 2 && size <= 129 && size !== this.lutSize) {
      this.lutSize = size;
      // Invalidate cached result since LUT size changed
      this.currentResult = null;
    }
  }

  /**
   * Get the LUT baking size.
   */
  getLutSize(): number {
    return this.lutSize;
  }

  /**
   * Apply the OCIO processor to a single RGB triplet.
   * Useful for color probing/picking.
   */
  transformColor(r: number, g: number, b: number): [number, number, number] | null {
    return this.bridge.transformColor(r, g, b);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private buildWasmPipeline(
    srcColorSpace: string,
    display: string,
    view: string,
    look: string,
  ): OCIOPipelineResult | null {
    try {
      // Build display processor and get translated shader
      const shader = this.bridge.buildDisplayPipeline(
        srcColorSpace,
        display,
        view,
        look,
        this.shaderOptions,
      );

      if (!shader) {
        return null;
      }

      // Bake 3D LUT from the processor
      const lut3D = this.bridge.bake3DLUT(this.lutSize);
      if (!lut3D) {
        this.emit('error', { message: 'Failed to bake 3D LUT from WASM processor', phase: 'bake3DLUT' });
        return null;
      }

      return {
        shader,
        lut3D,
        uniforms: shader.uniforms,
        functionName: shader.functionName,
        fromWasm: true,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.emit('error', { message: msg, phase: 'buildWasmPipeline' });
      return null;
    }
  }

  private buildBakedFallback(
    srcColorSpace: string,
    display: string,
    view: string,
    look: string,
  ): OCIOPipelineResult | null {
    try {
      // Try to build a processor and bake the LUT even without shader generation
      const shader = this.bridge.buildDisplayPipeline(
        srcColorSpace,
        display,
        view,
        look,
        this.shaderOptions,
      );

      const lut3D = this.bridge.bake3DLUT(this.lutSize);
      if (!lut3D) {
        return null;
      }

      return {
        shader: shader ?? {
          code: '',
          uniforms: [],
          functionName: 'OCIODisplay',
          requires3DLUT: true,
          lut3dSize: this.lutSize,
        },
        lut3D,
        uniforms: shader?.uniforms ?? [],
        functionName: shader?.functionName ?? 'OCIODisplay',
        fromWasm: false,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.emit('error', { message: msg, phase: 'buildBakedFallback' });
      return null;
    }
  }

  private setMode(mode: OCIOPipelineMode, reason: string): void {
    if (this.mode !== mode) {
      this.mode = mode;
      this.emit('modeChanged', { mode, reason });
    }
  }

  private ensureNotDisposed(): void {
    if (this.disposed) throw new Error('OCIOWasmPipeline is disposed');
  }
}
