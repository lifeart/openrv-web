/**
 * ColorPipelineManager - Manages all color pipeline state for the Viewer.
 *
 * Extracted from Viewer.ts to separate the color pipeline concern (adjustments,
 * CDL, curves, LUT, OCIO, tone mapping, display color management, color
 * inversion) from the monolithic Viewer class.
 *
 * The manager owns the state but does NOT own the Renderer reference. The Viewer
 * is responsible for syncing this state to the Renderer and scheduling renders.
 */

import { ColorAdjustments, DEFAULT_COLOR_ADJUSTMENTS } from './ColorControls';
import {
  type LUT3D,
  WebGLLUTProcessor,
  LUTPipeline,
  GPULUTChain,
  type CDLValues,
  DEFAULT_CDL,
  type ColorCurvesData,
  createDefaultCurvesData,
  CurveLUTCache,
  type DisplayColorState,
  DEFAULT_DISPLAY_COLOR_STATE,
  getSharedOCIOProcessor,
} from '../../color/ColorProcessingFacade';
import { ToneMappingState, DEFAULT_TONE_MAPPING_STATE } from './ToneMappingControl';

/**
 * Snapshot of all color pipeline state, used by the Viewer to sync state
 * to the Renderer or to build prerender effects state.
 */
export interface ColorPipelineSnapshot {
  colorAdjustments: ColorAdjustments;
  colorInversionEnabled: boolean;
  cdlValues: CDLValues;
  curvesData: ColorCurvesData;
  currentLUT: LUT3D | null;
  lutIntensity: number;
  toneMappingState: ToneMappingState;
  displayColorState: DisplayColorState;
  ocioEnabled: boolean;
  ocioBakedLUT: LUT3D | null;
}

export class ColorPipelineManager {
  // --- Color adjustments (exposure, gamma, saturation, etc.) ---
  private _colorAdjustments: ColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };

  // --- Color inversion ---
  private _colorInversionEnabled = false;

  // --- CDL (Color Decision List) ---
  private _cdlValues: CDLValues = JSON.parse(JSON.stringify(DEFAULT_CDL));

  // --- Color curves ---
  private _curvesData: ColorCurvesData = createDefaultCurvesData();
  private _curveLUTCache = new CurveLUTCache();

  // --- LUT (single 3D LUT) ---
  private _currentLUT: LUT3D | null = null;
  private _lutIntensity = 1.0;
  private _lutProcessor: WebGLLUTProcessor | null = null;

  // --- Multi-point LUT pipeline ---
  private _lutPipeline: LUTPipeline = new LUTPipeline();
  private _gpuLUTChain: GPULUTChain | null = null;

  // --- OCIO GPU-accelerated color management ---
  private _ocioLUTProcessor: WebGLLUTProcessor | null = null;
  private _ocioEnabled = false;
  private _ocioBakedLUT: LUT3D | null = null;

  // --- Tone mapping ---
  private _toneMappingState: ToneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };

  // --- Display color management (final pipeline stage) ---
  private _displayColorState: DisplayColorState = { ...DEFAULT_DISPLAY_COLOR_STATE };

  // =========================================================================
  // Initialization (called by Viewer constructor)
  // =========================================================================

  /**
   * Initialize WebGL LUT processor for GPU-accelerated LUT application.
   * Returns the created processor or null if WebGL is not available.
   */
  initLUTProcessor(): WebGLLUTProcessor | null {
    try {
      this._lutProcessor = new WebGLLUTProcessor();
    } catch (e) {
      console.warn('WebGL LUT processor not available, falling back to CPU:', e);
      this._lutProcessor = null;
    }
    return this._lutProcessor;
  }

  /**
   * Initialize the multi-point LUT pipeline GPU chain.
   * Returns the created chain or null if WebGL2 is not available.
   */
  initGPULUTChain(): GPULUTChain | null {
    try {
      const chainCanvas = document.createElement('canvas');
      const chainGl = chainCanvas.getContext('webgl2', {
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      });
      if (chainGl) {
        const parallelCompileExt = chainGl.getExtension('KHR_parallel_shader_compile');
        this._gpuLUTChain = new GPULUTChain(chainGl, parallelCompileExt);
      }
    } catch (e) {
      console.warn('GPU LUT chain not available:', e);
      this._gpuLUTChain = null;
    }
    return this._gpuLUTChain;
  }

  /**
   * Register the default source and set it as active in the LUT pipeline.
   */
  initLUTPipelineDefaults(): void {
    this._lutPipeline.registerSource('default');
    this._lutPipeline.setActiveSource('default');
  }

  /**
   * Initialize dedicated OCIO WebGL LUT processor.
   * Returns the created processor or null if WebGL is not available.
   */
  initOCIOProcessor(): WebGLLUTProcessor | null {
    try {
      this._ocioLUTProcessor = new WebGLLUTProcessor();
    } catch (e) {
      console.warn('WebGL OCIO LUT processor not available, OCIO will use CPU fallback:', e);
      this._ocioLUTProcessor = null;
    }
    return this._ocioLUTProcessor;
  }

  // =========================================================================
  // Color Adjustments
  // =========================================================================

  get colorAdjustments(): ColorAdjustments {
    return this._colorAdjustments;
  }

  setColorAdjustments(adjustments: ColorAdjustments): void {
    this._colorAdjustments = { ...adjustments };
  }

  getColorAdjustments(): ColorAdjustments {
    return { ...this._colorAdjustments };
  }

  resetColorAdjustments(): void {
    this._colorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
  }

  // =========================================================================
  // Color Inversion
  // =========================================================================

  get colorInversionEnabled(): boolean {
    return this._colorInversionEnabled;
  }

  setColorInversion(enabled: boolean): boolean {
    if (this._colorInversionEnabled === enabled) return false;
    this._colorInversionEnabled = enabled;
    return true; // changed
  }

  getColorInversion(): boolean {
    return this._colorInversionEnabled;
  }

  // =========================================================================
  // LUT (single 3D LUT)
  // =========================================================================

  get currentLUT(): LUT3D | null {
    return this._currentLUT;
  }

  get lutIntensity(): number {
    return this._lutIntensity;
  }

  get lutProcessor(): WebGLLUTProcessor | null {
    return this._lutProcessor;
  }

  setLUT(lut: LUT3D | null): void {
    this._currentLUT = lut;
    if (this._lutProcessor) {
      this._lutProcessor.setLUT(lut);
    }
  }

  getLUT(): LUT3D | null {
    return this._currentLUT;
  }

  setLUTIntensity(intensity: number): void {
    this._lutIntensity = Math.max(0, Math.min(1, intensity));
  }

  getLUTIntensity(): number {
    return this._lutIntensity;
  }

  // =========================================================================
  // Multi-point LUT Pipeline
  // =========================================================================

  get lutPipeline(): LUTPipeline {
    return this._lutPipeline;
  }

  get gpuLUTChain(): GPULUTChain | null {
    return this._gpuLUTChain;
  }

  getLUTPipeline(): LUTPipeline {
    return this._lutPipeline;
  }

  getGPULUTChain(): GPULUTChain | null {
    return this._gpuLUTChain;
  }

  // =========================================================================
  // OCIO
  // =========================================================================

  get ocioEnabled(): boolean {
    return this._ocioEnabled;
  }

  get ocioBakedLUT(): LUT3D | null {
    return this._ocioBakedLUT;
  }

  get ocioLUTProcessor(): WebGLLUTProcessor | null {
    return this._ocioLUTProcessor;
  }

  setOCIOBakedLUT(lut: LUT3D | null, enabled: boolean): void {
    this._ocioBakedLUT = lut;
    this._ocioEnabled = enabled;
    if (this._ocioLUTProcessor) {
      this._ocioLUTProcessor.setLUT(lut);
    }
  }

  isOCIOEnabled(): boolean {
    return this._ocioEnabled && this._ocioBakedLUT !== null;
  }

  // =========================================================================
  // CDL (Color Decision List)
  // =========================================================================

  get cdlValues(): CDLValues {
    return this._cdlValues;
  }

  setCDL(cdl: CDLValues): void {
    this._cdlValues = JSON.parse(JSON.stringify(cdl));
  }

  getCDL(): CDLValues {
    return JSON.parse(JSON.stringify(this._cdlValues));
  }

  resetCDL(): void {
    this._cdlValues = JSON.parse(JSON.stringify(DEFAULT_CDL));
  }

  // =========================================================================
  // Color Curves
  // =========================================================================

  get curvesData(): ColorCurvesData {
    return this._curvesData;
  }

  get curveLUTCache(): CurveLUTCache {
    return this._curveLUTCache;
  }

  setCurves(curves: ColorCurvesData): void {
    this._curvesData = {
      master: { ...curves.master, points: [...curves.master.points] },
      red: { ...curves.red, points: [...curves.red.points] },
      green: { ...curves.green, points: [...curves.green.points] },
      blue: { ...curves.blue, points: [...curves.blue.points] },
    };
  }

  getCurves(): ColorCurvesData {
    return {
      master: { ...this._curvesData.master, points: [...this._curvesData.master.points] },
      red: { ...this._curvesData.red, points: [...this._curvesData.red.points] },
      green: { ...this._curvesData.green, points: [...this._curvesData.green.points] },
      blue: { ...this._curvesData.blue, points: [...this._curvesData.blue.points] },
    };
  }

  resetCurves(): void {
    this._curvesData = createDefaultCurvesData();
  }

  // =========================================================================
  // Tone Mapping
  // =========================================================================

  get toneMappingState(): ToneMappingState {
    return this._toneMappingState;
  }

  setToneMappingState(state: ToneMappingState): void {
    this._toneMappingState = { ...state };
  }

  getToneMappingState(): ToneMappingState {
    return { ...this._toneMappingState };
  }

  resetToneMappingState(): void {
    this._toneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };
  }

  isToneMappingEnabled(): boolean {
    return this._toneMappingState.enabled && this._toneMappingState.operator !== 'off';
  }

  // =========================================================================
  // Display Color Management
  // =========================================================================

  get displayColorState(): DisplayColorState {
    return this._displayColorState;
  }

  setDisplayColorState(state: DisplayColorState): void {
    this._displayColorState = { ...state };
  }

  getDisplayColorState(): DisplayColorState {
    return { ...this._displayColorState };
  }

  resetDisplayColorState(): void {
    this._displayColorState = { ...DEFAULT_DISPLAY_COLOR_STATE };
  }

  // =========================================================================
  // LUT Application Helpers
  // =========================================================================

  /**
   * Apply the current LUT to a canvas context using the GPU LUT processor.
   */
  applyLUTToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this._currentLUT || this._lutIntensity === 0) return;

    // Use WebGL processor if available for GPU acceleration
    if (this._lutProcessor && this._lutProcessor.hasLUT()) {
      this._lutProcessor.applyToCanvas(ctx, width, height, this._lutIntensity);
    }
    // Fallback: No CPU fallback implemented for performance reasons
    // The WebGL path handles all LUT processing
  }

  /**
   * Apply OCIO display transform using GPU-accelerated baked 3D LUT.
   */
  applyOCIOToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this._ocioBakedLUT) return;

    // Use dedicated GPU LUT processor for OCIO
    if (this._ocioLUTProcessor && this._ocioLUTProcessor.hasLUT()) {
      this._ocioLUTProcessor.applyToCanvas(ctx, width, height, 1.0);
      return;
    }

    // CPU fallback: apply OCIO transform via the shared processor
    // This is slower but ensures OCIO always works even without GPU support
    const ocioProcessor = getSharedOCIOProcessor();
    if (ocioProcessor.isEnabled()) {
      const imageData = ctx.getImageData(0, 0, width, height);
      ocioProcessor.apply(imageData);
      ctx.putImageData(imageData, 0, 0);
    }
  }

  // =========================================================================
  // Snapshot
  // =========================================================================

  /**
   * Get a snapshot of all color pipeline state. Used by the Viewer to read
   * state values for renderer sync or prerender effects building.
   */
  getColorState(): ColorPipelineSnapshot {
    return {
      colorAdjustments: { ...this._colorAdjustments },
      colorInversionEnabled: this._colorInversionEnabled,
      cdlValues: JSON.parse(JSON.stringify(this._cdlValues)),
      curvesData: {
        master: { ...this._curvesData.master, points: [...this._curvesData.master.points] },
        red: { ...this._curvesData.red, points: [...this._curvesData.red.points] },
        green: { ...this._curvesData.green, points: [...this._curvesData.green.points] },
        blue: { ...this._curvesData.blue, points: [...this._curvesData.blue.points] },
      },
      currentLUT: this._currentLUT,
      lutIntensity: this._lutIntensity,
      toneMappingState: { ...this._toneMappingState },
      displayColorState: { ...this._displayColorState },
      ocioEnabled: this._ocioEnabled,
      ocioBakedLUT: this._ocioBakedLUT,
    };
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  /**
   * Dispose of all GPU resources owned by the color pipeline.
   */
  dispose(): void {
    if (this._lutProcessor) {
      this._lutProcessor.dispose();
      this._lutProcessor = null;
    }

    if (this._gpuLUTChain) {
      this._gpuLUTChain.dispose();
      this._gpuLUTChain = null;
    }

    if (this._ocioLUTProcessor) {
      this._ocioLUTProcessor.dispose();
      this._ocioLUTProcessor = null;
    }
  }
}
