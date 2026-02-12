/**
 * ColorProcessingFacade - Single entry point for UI components to consume the color pipeline.
 *
 * This module re-exports the color processing functions, types, and constants
 * most commonly used by the UI layer. Instead of importing from deep paths like
 * `../../color/CDL` or `../../color/DisplayTransfer`, UI components should import
 * from `../../color/ColorProcessingFacade`.
 *
 * Rule: UI -> ColorProcessingFacade -> individual color modules
 *
 * The facade is additive: all existing direct exports from individual modules
 * remain available for non-UI consumers (renderers, workers, tests).
 *
 * IMPORTANT: This module must NEVER import from `../ui/` or any UI module.
 */

// =============================================================================
// CDL (Color Decision List)
// =============================================================================
export type { CDLValues } from './CDL';
export {
  DEFAULT_CDL,
  isDefaultCDL,
  applyCDLToImageData,
  parseCDLXML,
  exportCDLXML,
} from './CDL';

// =============================================================================
// Color Curves
// =============================================================================
export type {
  CurvePoint,
  CurveChannel,
  ColorCurvesData,
  CurvePreset,
  CurveLUTs,
} from './ColorCurves';
export {
  createDefaultCurve,
  createDefaultCurvesData,
  isDefaultCurves,
  buildAllCurveLUTs,
  buildCurveLUT,
  CURVE_PRESETS,
  CurveLUTCache,
  applyCurvesToImageData,
  evaluateCurveAtPoint,
  addPointToCurve,
  removePointFromCurve,
  updatePointInCurve,
  exportCurvesJSON,
  importCurvesJSON,
} from './ColorCurves';

// =============================================================================
// Display Transfer
// =============================================================================
export type {
  DisplayTransferFunction,
  DisplayColorState,
} from './DisplayTransfer';
export {
  DEFAULT_DISPLAY_COLOR_STATE,
  DISPLAY_TRANSFER_CODES,
  PROFILE_CYCLE_ORDER,
  PROFILE_LABELS,
  PROFILE_FULL_LABELS,
  applyDisplayColorManagementToImageData,
  isDisplayStateActive,
  saveDisplayProfile,
  loadDisplayProfile,
} from './DisplayTransfer';

// =============================================================================
// Pixel Math
// =============================================================================
export { luminanceRec709 } from './PixelMath';

// =============================================================================
// LUT Loader & Format Detection
// =============================================================================
export type { LUT3D, LUT1D, LUT } from './LUTLoader';
export { isLUT3D } from './LUTLoader';
export { parseLUT } from './LUTFormatDetect';

// =============================================================================
// Hue Rotation
// =============================================================================
export {
  applyHueRotation,
  isIdentityHueRotation,
} from './HueRotation';

// =============================================================================
// Color Inversion
// =============================================================================
export { applyColorInversion } from './Inversion';

// =============================================================================
// Safe Canvas Context
// =============================================================================
export { safeCanvasContext2D } from './SafeCanvasContext';

// =============================================================================
// Display Capabilities
// =============================================================================
export type { DisplayCapabilities } from './DisplayCapabilities';
export { DEFAULT_CAPABILITIES } from './DisplayCapabilities';

// =============================================================================
// OCIO (OpenColorIO)
// =============================================================================
export type { OCIOState } from './OCIOConfig';
export {
  DEFAULT_OCIO_STATE,
  getAvailableConfigs,
  getInputColorSpaces,
  getWorkingColorSpaces,
  getDisplays,
  getViewsForDisplay,
  getLooks,
  isDefaultOCIOState,
  registerCustomConfig,
  removeCustomConfig,
} from './OCIOConfig';
export { OCIOProcessor, getSharedOCIOProcessor } from './OCIOProcessor';
export { parseOCIOConfig, validateOCIOConfig } from './OCIOConfigParser';
export type { OCIOConfigValidation } from './OCIOConfigParser';

// =============================================================================
// WebGL LUT Processing
// =============================================================================
export { WebGLLUTProcessor } from './WebGLLUT';

// =============================================================================
// LUT Pipeline
// =============================================================================
export { LUTPipeline } from './pipeline/LUTPipeline';
export { GPULUTChain } from './pipeline/GPULUTChain';
