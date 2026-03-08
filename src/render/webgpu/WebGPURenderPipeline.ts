/**
 * WebGPURenderPipeline - Pipeline and bind group management for passthrough rendering.
 *
 * Creates the GPU render pipeline, manages the uniform buffer for transform
 * (offset/scale), and handles texture bind groups. Uses a fullscreen triangle
 * approach (no vertex buffer needed).
 */

import type {
  WGPUDevice,
  WGPURenderPipeline,
  WGPUBindGroup,
  WGPUBuffer,
  WGPUSampler,
  WGPUTexture,
  WGPUTextureView,
} from './WebGPUTypes';
import { GPUBufferUsage, GPUTextureUsage } from './WebGPUTypes';

// Inline the WGSL shader to avoid bundler complexity with .wgsl files
const PASSTHROUGH_WGSL = /* wgsl */ `
struct Uniforms {
  offset: vec2f,
  scale: vec2f,
}

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@group(1) @binding(0) var<uniform> u: Uniforms;

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var out: VSOut;
  let x = f32(i32(i & 1u) * 2) - 1.0;
  let y = f32(i32(i >> 1u) * 2) - 1.0;
  out.pos = vec4f(x * u.scale.x + u.offset.x, y * u.scale.y + u.offset.y, 0.0, 1.0);
  out.uv = vec2f((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return textureSample(tex, samp, in.uv);
}
`;

/** Uniform buffer layout: offset (vec2f) + scale (vec2f) = 16 bytes */
const UNIFORM_BUFFER_SIZE = 16;

export class WebGPURenderPipelineManager {
  private pipeline: WGPURenderPipeline | null = null;
  private uniformBuffer: WGPUBuffer | null = null;
  private sampler: WGPUSampler | null = null;
  private uniformBindGroup: WGPUBindGroup | null = null;

  // Cache for texture bind groups (keyed by texture view identity)
  private lastTextureView: WGPUTextureView | null = null;
  private lastTextureBindGroup: WGPUBindGroup | null = null;

  /**
   * Initialize the render pipeline, uniform buffer, and sampler.
   * Call once after device initialization.
   */
  initialize(device: WGPUDevice, filterMode: 'linear' | 'nearest' = 'linear'): void {
    // Create shader module
    const shaderModule = device.createShaderModule({ code: PASSTHROUGH_WGSL });

    // Create render pipeline with auto layout
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

    // Create uniform buffer (16 bytes: vec2f offset + vec2f scale)
    this.uniformBuffer = device.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create sampler
    this.sampler = device.createSampler({
      magFilter: filterMode,
      minFilter: filterMode,
    });

    // Create uniform bind group (group 1)
    this.uniformBindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  /**
   * Update the uniform buffer with offset and scale values.
   */
  updateUniforms(device: WGPUDevice, offsetX: number, offsetY: number, scaleX: number, scaleY: number): void {
    if (!this.uniformBuffer) return;

    const data = new Float32Array([offsetX, offsetY, scaleX, scaleY]);
    device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  /**
   * Create or retrieve a texture bind group for the given texture view.
   */
  getTextureBindGroup(device: WGPUDevice, textureView: WGPUTextureView): WGPUBindGroup | null {
    if (!this.pipeline || !this.sampler) return null;

    // Reuse cached bind group if texture hasn't changed
    if (textureView === this.lastTextureView && this.lastTextureBindGroup) {
      return this.lastTextureBindGroup;
    }

    const bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: textureView },
      ],
    });

    this.lastTextureView = textureView;
    this.lastTextureBindGroup = bindGroup;
    return bindGroup;
  }

  get renderPipeline(): WGPURenderPipeline | null {
    return this.pipeline;
  }

  get uniforms(): WGPUBindGroup | null {
    return this.uniformBindGroup;
  }

  /**
   * Upload image data to a GPU texture.
   * Supports Uint8ClampedArray (SDR rgba8unorm) and Float32Array (HDR rgba32float).
   */
  uploadImageTexture(
    device: WGPUDevice,
    data: ArrayBufferView,
    width: number,
    height: number,
    isFloat: boolean,
  ): WGPUTexture {
    const format = isFloat ? 'rgba32float' : 'rgba8unorm';
    const bytesPerPixel = isFloat ? 16 : 4; // 4 channels * (4 bytes or 1 byte)

    const texture = device.createTexture({
      size: { width, height },
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    device.queue.writeTexture(
      { texture },
      data,
      { bytesPerRow: width * bytesPerPixel, rowsPerImage: height },
      { width, height },
    );

    return texture;
  }

  /**
   * Upload a VideoFrame or ImageBitmap to a GPU texture (zero-copy path).
   */
  uploadExternalTexture(
    device: WGPUDevice,
    source: VideoFrame | ImageBitmap,
    width: number,
    height: number,
  ): WGPUTexture {
    const texture = device.createTexture({
      size: { width, height },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture({ source }, { texture }, { width, height });

    return texture;
  }

  /**
   * Release all GPU resources.
   */
  dispose(): void {
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
    }
    this.pipeline = null;
    this.uniformBuffer = null;
    this.sampler = null;
    this.uniformBindGroup = null;
    this.lastTextureView = null;
    this.lastTextureBindGroup = null;
  }
}
