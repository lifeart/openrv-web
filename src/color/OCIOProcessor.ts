/**
 * OCIOProcessor - OCIO color management processor
 *
 * Manages OCIO state and applies color space transforms to images.
 * Integrates with existing LUT infrastructure for GPU-accelerated processing.
 */

import { EventEmitter, EventMap } from '../utils/EventEmitter';
import {
  OCIOState,
  DEFAULT_OCIO_STATE,
  getBuiltinConfig,
  getInputColorSpaces,
  getWorkingColorSpaces,
  getDisplays,
  getViewsForDisplay,
  getLooks,
  isDefaultOCIOState,
} from './OCIOConfig';
import { OCIOTransform, RGB } from './OCIOTransform';
import { LUT3D } from './LUTLoader';

/**
 * OCIO processor events
 */
export interface OCIOProcessorEvents extends EventMap {
  stateChanged: OCIOState;
  transformChanged: void;
}

/**
 * Metadata for auto-detecting color space
 */
export interface MediaMetadata {
  colorPrimaries?: string;
  transferCharacteristics?: string;
  matrixCoefficients?: string;
  manufacturer?: string;
  camera?: string;
  gammaProfile?: string;
}

/**
 * OCIO Processor class
 *
 * Manages the OCIO color pipeline state and applies transforms to images.
 */
export class OCIOProcessor extends EventEmitter<OCIOProcessorEvents> {
  private state: OCIOState;
  private transform: OCIOTransform | null = null;
  private bakedLUT: LUT3D | null = null;
  private lutDirty = true;

  constructor() {
    super();
    this.state = { ...DEFAULT_OCIO_STATE };
    this.updateTransform();
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Get current state
   */
  getState(): OCIOState {
    return { ...this.state };
  }

  /**
   * Set full state
   */
  setState(state: Partial<OCIOState>): void {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...state };

    // Check if transform-affecting properties changed
    if (
      oldState.inputColorSpace !== this.state.inputColorSpace ||
      oldState.workingColorSpace !== this.state.workingColorSpace ||
      oldState.display !== this.state.display ||
      oldState.view !== this.state.view ||
      oldState.look !== this.state.look ||
      oldState.lookDirection !== this.state.lookDirection ||
      oldState.configName !== this.state.configName
    ) {
      this.updateTransform();
    }

    this.emit('stateChanged', this.getState());
  }

  /**
   * Reset to default state
   */
  reset(): void {
    this.setState({ ...DEFAULT_OCIO_STATE });
  }

  // ==========================================================================
  // Enable/Disable
  // ==========================================================================

  /**
   * Check if OCIO is enabled
   */
  isEnabled(): boolean {
    return this.state.enabled;
  }

  /**
   * Enable or disable OCIO processing
   */
  setEnabled(enabled: boolean): void {
    if (this.state.enabled !== enabled) {
      this.setState({ enabled });
    }
  }

  /**
   * Toggle enabled state
   */
  toggle(): void {
    this.setEnabled(!this.state.enabled);
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Get current config name
   */
  getConfigName(): string {
    return this.state.configName;
  }

  /**
   * Load a built-in configuration
   */
  loadConfig(configName: string): void {
    // Validate config exists (also serves as fetching the config)
    getBuiltinConfig(configName);

    // Update state with new config and reset color spaces to defaults
    const workingSpaces = getWorkingColorSpaces(configName);
    const displays = getDisplays(configName);
    const display = displays[0] ?? 'sRGB';
    const views = getViewsForDisplay(configName, display);

    this.setState({
      configName,
      inputColorSpace: 'Auto',
      workingColorSpace: workingSpaces[0] ?? 'ACEScg',
      display,
      view: views[0] ?? 'Standard',
      look: 'None',
    });
  }

  // ==========================================================================
  // Color Space Selection
  // ==========================================================================

  /**
   * Get available input color spaces
   */
  getAvailableInputColorSpaces(): string[] {
    return getInputColorSpaces(this.state.configName);
  }

  /**
   * Get available working color spaces
   */
  getAvailableWorkingColorSpaces(): string[] {
    return getWorkingColorSpaces(this.state.configName);
  }

  /**
   * Get available displays
   */
  getAvailableDisplays(): string[] {
    return getDisplays(this.state.configName);
  }

  /**
   * Get available views for current display
   */
  getAvailableViews(): string[] {
    return getViewsForDisplay(this.state.configName, this.state.display);
  }

  /**
   * Get available looks
   */
  getAvailableLooks(): string[] {
    return getLooks(this.state.configName);
  }

  /**
   * Set input color space
   */
  setInputColorSpace(colorSpace: string): void {
    this.setState({ inputColorSpace: colorSpace });
  }

  /**
   * Set working color space
   */
  setWorkingColorSpace(colorSpace: string): void {
    this.setState({ workingColorSpace: colorSpace });
  }

  /**
   * Set display
   */
  setDisplay(display: string): void {
    // Also update view to first available for new display
    const views = getViewsForDisplay(this.state.configName, display);
    this.setState({
      display,
      view: views[0] ?? 'Standard',
    });
  }

  /**
   * Set view
   *
   * Validates that the view exists for the current display.
   * If the view is invalid, falls back to the first available view for the display.
   */
  setView(view: string): void {
    // Validate that the view exists for the current display
    const availableViews = getViewsForDisplay(this.state.configName, this.state.display);
    if (availableViews.includes(view)) {
      this.setState({ view });
    } else if (availableViews.length > 0) {
      // Fallback to first available view for this display
      this.setState({ view: availableViews[0] });
    }
    // If no views available, keep current view (shouldn't happen with valid configs)
  }

  /**
   * Set look
   */
  setLook(look: string): void {
    this.setState({ look });
  }

  /**
   * Set look direction
   */
  setLookDirection(direction: 'forward' | 'inverse'): void {
    this.setState({ lookDirection: direction });
  }

  // ==========================================================================
  // Transform Building
  // ==========================================================================

  /**
   * Update the internal transform based on current state
   */
  private updateTransform(): void {
    // Determine effective input space
    let inputSpace = this.state.inputColorSpace;
    if (inputSpace === 'Auto') {
      inputSpace = this.state.detectedColorSpace ?? 'sRGB';
    }

    // Create transform chain: input -> display
    // In a full implementation, this would be: input -> working -> look -> display+view
    this.transform = OCIOTransform.createDisplayTransform(
      inputSpace,
      this.state.workingColorSpace,
      this.state.display,
      this.state.view
    );

    this.lutDirty = true;
    this.emit('transformChanged', undefined);
  }

  // ==========================================================================
  // Color Space Detection
  // ==========================================================================

  /**
   * Detect color space from media metadata
   */
  detectColorSpace(metadata: MediaMetadata): string | null {
    // Check for ARRI cameras
    if (
      metadata.manufacturer?.toLowerCase().includes('arri') ||
      metadata.camera?.toLowerCase().includes('alexa')
    ) {
      if (metadata.gammaProfile?.toLowerCase().includes('logc4')) {
        return 'ARRI LogC4';
      }
      if (metadata.gammaProfile?.toLowerCase().includes('logc')) {
        return 'ARRI LogC3 (EI 800)';
      }
      if (
        metadata.transferCharacteristics?.toLowerCase().includes('log')
      ) {
        return 'ARRI LogC3 (EI 800)';
      }
    }

    // Check for Sony cameras
    if (
      metadata.manufacturer?.toLowerCase().includes('sony') ||
      metadata.gammaProfile?.toLowerCase().includes('s-log')
    ) {
      return 'Sony S-Log3';
    }

    // Check for RED cameras
    if (
      metadata.manufacturer?.toLowerCase().includes('red') ||
      metadata.gammaProfile?.toLowerCase().includes('log3g10')
    ) {
      return 'RED Log3G10';
    }

    // Check for standard video color spaces
    if (
      metadata.colorPrimaries?.toLowerCase().includes('bt709') ||
      metadata.colorPrimaries?.toLowerCase().includes('709')
    ) {
      if (
        metadata.transferCharacteristics?.toLowerCase().includes('srgb') ||
        metadata.transferCharacteristics?.toLowerCase().includes('iec')
      ) {
        return 'sRGB';
      }
      return 'Rec.709';
    }

    // Check for sRGB
    if (metadata.transferCharacteristics?.toLowerCase().includes('srgb')) {
      return 'sRGB';
    }

    return null;
  }

  /**
   * Set detected color space from metadata
   */
  setDetectedColorSpace(metadata: MediaMetadata): void {
    const detected = this.detectColorSpace(metadata);
    this.setState({ detectedColorSpace: detected });
  }

  // ==========================================================================
  // Transform Application
  // ==========================================================================

  /**
   * Apply OCIO transform to a single RGB color
   *
   * @param r Red (0-1)
   * @param g Green (0-1)
   * @param b Blue (0-1)
   * @returns Transformed RGB values
   */
  transformColor(r: number, g: number, b: number): RGB {
    if (!this.state.enabled || !this.transform) {
      return [r, g, b];
    }

    return this.transform.apply(r, g, b);
  }

  /**
   * Apply OCIO transform to ImageData
   *
   * @param imageData Source image data
   * @returns Transformed image data (same object, modified in place)
   */
  apply(imageData: ImageData): ImageData {
    if (!this.state.enabled || !this.transform) {
      return imageData;
    }

    return this.transform.applyToImageData(imageData);
  }

  // ==========================================================================
  // LUT Baking (for GPU acceleration)
  // ==========================================================================

  /**
   * Bake the current transform to a 3D LUT
   *
   * @param size LUT size (typically 17, 33, or 65). Must be >= 1 and <= 129.
   * @returns 3D LUT suitable for WebGL processing
   * @throws Error if size is invalid
   */
  bakeTo3DLUT(size: number = 33): LUT3D {
    // Validate size
    if (!Number.isInteger(size) || size < 1) {
      throw new Error(`Invalid LUT size: ${size}. Must be a positive integer.`);
    }
    if (size > 129) {
      throw new Error(`LUT size ${size} is too large. Maximum is 129.`);
    }

    if (!this.lutDirty && this.bakedLUT && this.bakedLUT.size === size) {
      return this.bakedLUT;
    }

    const data = new Float32Array(size * size * size * 3);

    // Generate LUT data
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const idx = (b * size * size + g * size + r) * 3;
          const inR = r / (size - 1);
          const inG = g / (size - 1);
          const inB = b / (size - 1);

          const [outR, outG, outB] = this.transformColor(inR, inG, inB);

          data[idx] = outR;
          data[idx + 1] = outG;
          data[idx + 2] = outB;
        }
      }
    }

    this.bakedLUT = {
      title: `OCIO: ${this.state.inputColorSpace} -> ${this.state.display}`,
      size,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data,
    };

    this.lutDirty = false;
    return this.bakedLUT;
  }

  /**
   * Check if current state is default (no OCIO processing needed)
   */
  isDefaultState(): boolean {
    return isDefaultOCIOState(this.state);
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.transform = null;
    this.bakedLUT = null;
    this.lutDirty = true;
    this.removeAllListeners();
  }
}

/**
 * Shared processor instance
 */
let sharedProcessor: OCIOProcessor | null = null;

/**
 * Get shared OCIO processor instance
 */
export function getSharedOCIOProcessor(): OCIOProcessor {
  if (!sharedProcessor) {
    sharedProcessor = new OCIOProcessor();
  }
  return sharedProcessor;
}

/**
 * Dispose shared OCIO processor
 */
export function disposeSharedOCIOProcessor(): void {
  if (sharedProcessor) {
    sharedProcessor.dispose();
    sharedProcessor = null;
  }
}
