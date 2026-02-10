/**
 * WebGPUHDRBlit - WebGPU-based HDR display output via blit
 *
 * Self-contained module that accepts Float32Array pixel data (from WebGL2
 * FBO readback) and displays it on a WebGPU canvas configured for HDR
 * extended-range output.
 *
 * Architecture:
 *   WebGL2 Renderer (full effects pipeline) renders to RGBA16F FBO
 *   → gl.readPixels(FLOAT) → Float32Array
 *   → device.queue.writeTexture() → GPUTexture (rgba32float)
 *   → WGSL pass-through shader → WebGPU canvas (rgba16float, toneMapping: extended)
 *   → HDR display (values > 1.0 = brighter than SDR white)
 *
 * This module has NO dependency on WebGPUBackend.ts (that's for the full
 * pipeline). It only handles the final blit to an HDR-capable canvas.
 */

import { Logger } from '../utils/Logger';

const log = new Logger('WebGPUHDRBlit');

// ---------------------------------------------------------------------------
// WebGPU type shims (experimental API, not in TS DOM lib)
// ---------------------------------------------------------------------------

interface WGPUAdapter {
  features?: Set<string>;
  limits?: { maxBufferSize?: number };
  requestDevice(desc?: { requiredFeatures?: string[]; requiredLimits?: Record<string, number> }): Promise<WGPUDevice>;
}

interface WGPUDevice {
  createShaderModule(desc: { code: string }): WGPUShaderModule;
  createRenderPipeline(desc: WGPURenderPipelineDescriptor): WGPURenderPipeline;
  createSampler(desc: WGPUSamplerDescriptor): WGPUSampler;
  createTexture(desc: WGPUTextureDescriptor): WGPUTexture;
  createBindGroup(desc: WGPUBindGroupDescriptor): WGPUBindGroup;
  createCommandEncoder(): WGPUCommandEncoder;
  queue: WGPUQueue;
  destroy(): void;
}

interface WGPUShaderModule {}

interface WGPURenderPipelineDescriptor {
  layout: string;
  vertex: { module: WGPUShaderModule; entryPoint: string };
  fragment: { module: WGPUShaderModule; entryPoint: string; targets: { format: string }[] };
  primitive?: { topology: string };
}

interface WGPURenderPipeline {
  getBindGroupLayout(index: number): WGPUBindGroupLayout;
}

interface WGPUBindGroupLayout {}

interface WGPUSamplerDescriptor {
  magFilter: string;
  minFilter: string;
}

interface WGPUTextureDescriptor {
  size: { width: number; height: number };
  format: string;
  usage: number;
}

interface WGPUTexture {
  createView(): WGPUTextureView;
  destroy(): void;
}

interface WGPUTextureView {}

interface WGPUBindGroupDescriptor {
  layout: WGPUBindGroupLayout;
  entries: { binding: number; resource: WGPUSampler | WGPUTextureView }[];
}

interface WGPUBindGroup {}

interface WGPUQueue {
  writeTexture(
    dest: { texture: WGPUTexture },
    data: Float32Array,
    layout: { bytesPerRow: number; rowsPerImage: number },
    size: { width: number; height: number },
  ): void;
  submit(commands: WGPUCommandBuffer[]): void;
}

interface WGPUCommandEncoder {
  beginRenderPass(desc: WGPURenderPassDescriptor): WGPURenderPassEncoder;
  finish(): WGPUCommandBuffer;
}

interface WGPURenderPassDescriptor {
  colorAttachments: {
    view: WGPUTextureView;
    loadOp: string;
    storeOp: string;
  }[];
}

interface WGPURenderPassEncoder {
  setPipeline(pipeline: WGPURenderPipeline): void;
  setBindGroup(index: number, group: WGPUBindGroup): void;
  draw(vertexCount: number): void;
  end(): void;
}

interface WGPUCommandBuffer {}

interface WGPUSampler {}

interface WGPUCanvasContext {
  configure(config: {
    device: WGPUDevice;
    format: string;
    toneMapping?: { mode: string };
    alphaMode?: string;
  }): void;
  getCurrentTexture(): WGPUTexture;
  unconfigure(): void;
}

interface WGPUNavigatorGPU {
  requestAdapter(options?: { powerPreference?: string }): Promise<WGPUAdapter | null>;
}

// ---------------------------------------------------------------------------
// WGSL shader source
// ---------------------------------------------------------------------------

const BLIT_WGSL = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var out: VSOut;
  let x = f32(i32(i) / 2) * 4.0 - 1.0;
  let y = f32(i32(i) % 2) * 4.0 - 1.0;
  out.pos = vec4f(x, y, 0.0, 1.0);
  // WebGL readPixels returns rows bottom-to-top; WebGPU textures are top-to-bottom.
  // Flip V so row 0 (bottom of GL image, stored at top of GPU texture) maps to screen bottom.
  out.uv = vec2f((x + 1.0) / 2.0, (y + 1.0) / 2.0);
  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return textureSample(tex, samp, in.uv);
}
`;

// WebGPU texture usage flags (not in TS DOM lib)
const GPUTextureUsage_TEXTURE_BINDING = 0x04;
const GPUTextureUsage_COPY_DST = 0x02;

// ---------------------------------------------------------------------------
// WebGPUHDRBlit class
// ---------------------------------------------------------------------------

export class WebGPUHDRBlit {
  private canvas: HTMLCanvasElement;
  private device: WGPUDevice | null = null;
  private gpuContext: WGPUCanvasContext | null = null;
  private pipeline: WGPURenderPipeline | null = null;
  private sampler: WGPUSampler | null = null;

  // Source texture (recreated on resize)
  private srcTexture: WGPUTexture | null = null;
  private srcTextureWidth = 0;
  private srcTextureHeight = 0;
  private bindGroup: WGPUBindGroup | null = null;

  private _initialized = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;top:0;left:0;display:none;';
  }

  /** The HTMLCanvasElement used for WebGPU HDR output. */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Whether initialize() has completed successfully. */
  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Async initialization: request adapter/device, configure context, create pipeline.
   * Throws if WebGPU is not available or HDR configuration fails.
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      throw new Error('WebGPU not available');
    }

    const gpu = (navigator as unknown as { gpu: WGPUNavigatorGPU }).gpu;
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('WebGPU adapter not available');
    }

    // Request float32-filterable so rgba32float textures can use linear sampling.
    // Fall back to nearest filter if the feature is unavailable.
    // Request higher maxBufferSize for large HDR images (default 256MB is too small for 4K+ RGBA32Float).
    const hasFloat32Filterable = adapter.features?.has('float32-filterable') === true;
    const adapterMaxBuffer = adapter.limits?.maxBufferSize ?? 268435456;
    const desiredMaxBuffer = Math.min(adapterMaxBuffer, 1024 * 1024 * 1024); // up to 1GB
    const deviceDesc: { requiredFeatures?: string[]; requiredLimits?: Record<string, number> } = {
      requiredLimits: { maxBufferSize: desiredMaxBuffer },
    };
    if (hasFloat32Filterable) {
      deviceDesc.requiredFeatures = ['float32-filterable'];
    }
    const device = await adapter.requestDevice(deviceDesc);
    this.device = device;

    // Get WebGPU canvas context
    const ctx = this.canvas.getContext('webgpu' as string);
    if (!ctx) {
      device.destroy();
      this.device = null;
      throw new Error('WebGPU canvas context not available');
    }
    this.gpuContext = ctx as unknown as WGPUCanvasContext;

    // Configure for HDR: rgba16float + extended tone mapping
    this.gpuContext.configure({
      device,
      format: 'rgba16float',
      toneMapping: { mode: 'extended' },
      alphaMode: 'opaque',
    });

    // Create shader module and render pipeline
    const shaderModule = device.createShaderModule({ code: BLIT_WGSL });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shaderModule, entryPoint: 'vs' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs',
        targets: [{ format: 'rgba16float' }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // Create sampler: bilinear when float32-filterable is available, nearest otherwise
    const filterMode = hasFloat32Filterable ? 'linear' : 'nearest';
    this.sampler = device.createSampler({
      magFilter: filterMode,
      minFilter: filterMode,
    });

    this._initialized = true;
    log.info('WebGPU HDR blit initialized');
  }

  /**
   * Upload float pixel data and display it on the HDR canvas.
   *
   * @param pixels - RGBA Float32Array from gl.readPixels (bottom-to-top row order;
   *                 the WGSL shader flips via UV so no CPU flip is needed)
   * @param width  - Image width in pixels
   * @param height - Image height in pixels
   */
  uploadAndDisplay(pixels: Float32Array, width: number, height: number): void {
    if (!this._initialized || !this.device || !this.gpuContext || !this.pipeline || !this.sampler) {
      return;
    }

    // Resize canvas if needed
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Recreate source texture if dimensions changed
    if (width !== this.srcTextureWidth || height !== this.srcTextureHeight) {
      if (this.srcTexture) {
        this.srcTexture.destroy();
      }
      this.srcTexture = this.device.createTexture({
        size: { width, height },
        format: 'rgba32float',
        usage: GPUTextureUsage_TEXTURE_BINDING | GPUTextureUsage_COPY_DST,
      });
      this.srcTextureWidth = width;
      this.srcTextureHeight = height;

      // Recreate bind group with new texture view
      this.bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: this.srcTexture.createView() },
        ],
      });
    }

    // Upload pixel data to GPU texture
    this.device.queue.writeTexture(
      { texture: this.srcTexture! },
      pixels,
      { bytesPerRow: width * 4 * 4, rowsPerImage: height }, // 4 channels * 4 bytes/float
      { width, height },
    );

    // Render pass: blit source texture to canvas
    const canvasTexture = this.gpuContext.getCurrentTexture();
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: canvasTexture.createView(),
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup!);
    pass.draw(3); // Fullscreen triangle (3 vertices)
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * Release all GPU resources and remove the canvas.
   */
  dispose(): void {
    // Remove canvas from DOM
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    if (this.srcTexture) {
      this.srcTexture.destroy();
      this.srcTexture = null;
    }
    if (this.gpuContext) {
      try { this.gpuContext.unconfigure(); } catch { /* context may be lost */ }
      this.gpuContext = null;
    }
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.pipeline = null;
    this.sampler = null;
    this.bindGroup = null;
    this.srcTextureWidth = 0;
    this.srcTextureHeight = 0;
    this._initialized = false;
  }
}
