/**
 * WebGPUDevice - Typed wrapper around GPU adapter, device, and canvas context.
 *
 * Handles initialization, feature detection, and canvas configuration.
 * Owns the GPU device lifecycle; all other WebGPU modules reference this.
 */

import type { WGPUDevice, WGPUCanvasContext, WGPUNavigatorGPU } from './WebGPUTypes';

export class WebGPUDeviceWrapper {
  private _device: WGPUDevice | null = null;
  private _context: WGPUCanvasContext | null = null;
  private _hasFloat32Filterable = false;
  private _extendedToneMapping = false;

  get device(): WGPUDevice | null {
    return this._device;
  }

  get context(): WGPUCanvasContext | null {
    return this._context;
  }

  get hasFloat32Filterable(): boolean {
    return this._hasFloat32Filterable;
  }

  get extendedToneMapping(): boolean {
    return this._extendedToneMapping;
  }

  /**
   * Synchronous initialization: validate WebGPU availability and obtain canvas context.
   */
  initializeSync(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      throw new Error('WebGPU is not available');
    }

    const ctx = (canvas as HTMLCanvasElement).getContext('webgpu' as string);
    if (!ctx) {
      throw new Error('WebGPU canvas context not available');
    }
    this._context = ctx as unknown as WGPUCanvasContext;
  }

  /**
   * Async initialization: request adapter/device and configure canvas.
   * Must be called after initializeSync().
   */
  async initializeAsync(): Promise<void> {
    if (!this._context) {
      throw new Error('initializeSync() must be called first');
    }

    const gpu = (navigator as unknown as { gpu: WGPUNavigatorGPU }).gpu;

    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('WebGPU adapter not available');
    }
    // Detect float32-filterable for linear sampling of HDR textures
    this._hasFloat32Filterable = adapter.features?.has('float32-filterable') === true;

    // Request device with appropriate limits and features
    const adapterMaxBuffer = adapter.limits?.maxBufferSize ?? 268435456;
    const desiredMaxBuffer = Math.min(adapterMaxBuffer, 1024 * 1024 * 1024);

    const deviceDesc: { requiredFeatures?: string[]; requiredLimits?: Record<string, number> } = {
      requiredLimits: { maxBufferSize: desiredMaxBuffer },
    };
    if (this._hasFloat32Filterable) {
      deviceDesc.requiredFeatures = ['float32-filterable'];
    }

    this._device = await adapter.requestDevice(deviceDesc);

    // Configure canvas for HDR output
    this.configureCanvas('extended');
  }

  /**
   * Configure the canvas context with the specified tone mapping mode.
   * Falls back to 'standard' if 'extended' is not supported.
   */
  private configureCanvas(toneMappingMode: 'extended' | 'standard'): void {
    if (!this._context || !this._device) return;

    try {
      this._context.configure({
        device: this._device,
        format: 'rgba16float',
        colorSpace: 'display-p3',
        toneMapping: { mode: toneMappingMode },
        alphaMode: 'opaque',
      });
      this._extendedToneMapping = toneMappingMode === 'extended';
    } catch {
      if (toneMappingMode === 'extended') {
        this.configureCanvas('standard');
      } else {
        throw new Error('WebGPU canvas configuration failed');
      }
    }
  }

  /**
   * Release all GPU resources.
   */
  dispose(): void {
    if (this._context) {
      try {
        this._context.unconfigure();
      } catch {
        // Context may already be lost
      }
    }

    if (this._device) {
      this._device.destroy();
    }

    this._device = null;
    this._context = null;
    this._hasFloat32Filterable = false;
    this._extendedToneMapping = false;
  }
}
