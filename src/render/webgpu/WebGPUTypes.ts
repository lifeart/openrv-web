/**
 * WebGPU type shims (experimental API, not yet in TS DOM lib)
 *
 * Shared across all WebGPU modules. These are minimal shapes needed for
 * type-safe interactions; runtime objects come from the browser's WebGPU impl.
 */

// ---------------------------------------------------------------------------
// GPU Adapter / Device / Queue
// ---------------------------------------------------------------------------

export interface WGPUAdapter {
  features?: Set<string>;
  limits?: { maxBufferSize?: number };
  requestDevice(desc?: { requiredFeatures?: string[]; requiredLimits?: Record<string, number> }): Promise<WGPUDevice>;
}

export interface WGPUDevice {
  createShaderModule(desc: { code: string }): WGPUShaderModule;
  createRenderPipeline(desc: WGPURenderPipelineDescriptor): WGPURenderPipeline;
  createSampler(desc: WGPUSamplerDescriptor): WGPUSampler;
  createTexture(desc: WGPUTextureDescriptor): WGPUTexture;
  createBindGroup(desc: WGPUBindGroupDescriptor): WGPUBindGroup;
  createBuffer(desc: WGPUBufferDescriptor): WGPUBuffer;
  createCommandEncoder(): WGPUCommandEncoder;
  queue: WGPUQueue;
  destroy(): void;
}

export interface WGPUQueue {
  writeTexture(
    dest: { texture: WGPUTexture },
    data: ArrayBufferView,
    layout: { bytesPerRow: number; rowsPerImage: number },
    size: { width: number; height: number },
  ): void;
  writeBuffer(buffer: WGPUBuffer, offset: number, data: ArrayBufferView): void;
  copyExternalImageToTexture(
    source: { source: VideoFrame | ImageBitmap },
    dest: { texture: WGPUTexture },
    size: { width: number; height: number },
  ): void;
  submit(commands: WGPUCommandBuffer[]): void;
}

// ---------------------------------------------------------------------------
// Shader / Pipeline
// ---------------------------------------------------------------------------

export interface WGPUShaderModule {}

export interface WGPURenderPipelineDescriptor {
  layout: string | WGPUPipelineLayout;
  vertex: {
    module: WGPUShaderModule;
    entryPoint: string;
    buffers?: WGPUVertexBufferLayout[];
  };
  fragment: {
    module: WGPUShaderModule;
    entryPoint: string;
    targets: { format: string }[];
  };
  primitive?: { topology: string };
}

export interface WGPUPipelineLayout {}

export interface WGPUVertexBufferLayout {
  arrayStride: number;
  attributes: { format: string; offset: number; shaderLocation: number }[];
}

export interface WGPURenderPipeline {
  getBindGroupLayout(index: number): WGPUBindGroupLayout;
}

// ---------------------------------------------------------------------------
// Bind Groups / Buffers
// ---------------------------------------------------------------------------

export interface WGPUBindGroupLayout {}

export interface WGPUSamplerDescriptor {
  magFilter: string;
  minFilter: string;
}

export interface WGPUBindGroupDescriptor {
  layout: WGPUBindGroupLayout;
  entries: WGPUBindGroupEntry[];
}

export interface WGPUBindGroupEntry {
  binding: number;
  resource: WGPUSampler | WGPUTextureView | WGPUBufferBinding;
}

export interface WGPUBufferBinding {
  buffer: WGPUBuffer;
  offset?: number;
  size?: number;
}

export interface WGPUBindGroup {}

export interface WGPUBufferDescriptor {
  size: number;
  usage: number;
  mappedAtCreation?: boolean;
}

export interface WGPUBuffer {
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

export interface WGPUSampler {}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

export interface WGPUTextureDescriptor {
  size: { width: number; height: number };
  format: string;
  usage: number;
}

export interface WGPUTexture {
  createView(): WGPUTextureView;
  destroy(): void;
}

export interface WGPUTextureView {}

// ---------------------------------------------------------------------------
// Command Encoding / Render Pass
// ---------------------------------------------------------------------------

export interface WGPUCommandEncoder {
  beginRenderPass(desc: WGPURenderPassDescriptor): WGPURenderPassEncoder;
  finish(): WGPUCommandBuffer;
}

export interface WGPURenderPassDescriptor {
  colorAttachments: {
    view: WGPUTextureView;
    loadOp: string;
    storeOp: string;
    clearValue?: { r: number; g: number; b: number; a: number };
  }[];
}

export interface WGPURenderPassEncoder {
  setPipeline(pipeline: WGPURenderPipeline): void;
  setBindGroup(index: number, group: WGPUBindGroup): void;
  draw(vertexCount: number): void;
  end(): void;
}

export interface WGPUCommandBuffer {}

// ---------------------------------------------------------------------------
// Canvas Context
// ---------------------------------------------------------------------------

export interface WGPUCanvasContext {
  configure(config: WGPUCanvasConfiguration): void;
  getCurrentTexture(): WGPUTexture;
  unconfigure(): void;
}

export interface WGPUCanvasConfiguration {
  device: WGPUDevice;
  format: string;
  colorSpace?: string;
  toneMapping?: { mode: string };
  alphaMode?: string;
}

// ---------------------------------------------------------------------------
// Navigator GPU
// ---------------------------------------------------------------------------

export interface WGPUNavigatorGPU {
  requestAdapter(options?: { powerPreference?: string }): Promise<WGPUAdapter | null>;
}

// ---------------------------------------------------------------------------
// GPU usage flags (not in TS DOM lib)
// ---------------------------------------------------------------------------

export const GPUTextureUsage = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  RENDER_ATTACHMENT: 0x10,
} as const;

export const GPUBufferUsage = {
  MAP_READ: 0x01,
  MAP_WRITE: 0x02,
  COPY_SRC: 0x04,
  COPY_DST: 0x08,
  UNIFORM: 0x40,
  VERTEX: 0x20,
} as const;
