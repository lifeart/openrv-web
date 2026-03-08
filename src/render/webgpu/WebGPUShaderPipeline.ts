/**
 * WebGPUShaderPipeline - Multi-pass shader pipeline orchestrator for WebGPU.
 *
 * WebGPU equivalent of ShaderPipeline.ts. Implements the same 11-stage
 * architecture with identical stage ordering and optimization logic:
 *
 *   1. Determine which stages are active (not identity).
 *   2. If 0 active stages -> passthrough (direct blit).
 *   3. If 1 active stage  -> single-pass (source -> stage -> output).
 *   4. If N active stages -> multi-pass with ping-pong textures.
 *
 * The first active stage uses the viewer vertex transform (pan/zoom/rotation).
 * All subsequent stages use passthrough vertex transform (identity for FBO quads).
 */

import type { StageId } from '../ShaderStage';
import type { InternalShaderState } from '../ShaderStateTypes';
import type {
  WGPUDevice,
  WGPURenderPipeline,
  WGPUBindGroup,
  WGPUBuffer,
  WGPUSampler,
  WGPUTextureView,
} from './WebGPUTypes';
import { GPUBufferUsage } from './WebGPUTypes';
import { WebGPUPingPong } from './WebGPUPingPong';
import type { PingPongFormat } from './WebGPUPingPong';

// ---------------------------------------------------------------------------
// Stage descriptor for WebGPU pipeline
// ---------------------------------------------------------------------------

/** Describes a single stage in the WebGPU shader pipeline. */
export interface WebGPUStageDescriptor {
  /** Unique stage identifier (matches WebGL2 StageId). */
  readonly id: StageId;

  /** Display name for debugging/profiling. */
  readonly name: string;

  /** WGSL shader source for this stage. */
  readonly wgslSource: string;

  /**
   * Returns true when this stage has no effect and can be skipped.
   * Checked every frame BEFORE uploading any uniforms.
   */
  isIdentity: (state: Readonly<InternalShaderState>) => boolean;

  /**
   * Whether this stage requires bilinear texture filtering on its input.
   * Stages that sample neighboring pixels (clarity, sharpen) set this to true.
   * Default: false (nearest filtering).
   */
  needsBilinearInput?: boolean;
}

// ---------------------------------------------------------------------------
// Passthrough WGSL shader (used when 0 active stages)
// ---------------------------------------------------------------------------

const PASSTHROUGH_WGSL = /* wgsl */ `
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var out: VSOut;
  let x = f32(i32(i & 1u) * 2) - 1.0;
  let y = f32(i32(i >> 1u) * 2) - 1.0;
  out.pos = vec4f(x, y, 0.0, 1.0);
  out.uv = vec2f((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return textureSample(tex, samp, in.uv);
}
`;

// ---------------------------------------------------------------------------
// Viewer vertex WGSL (pan/zoom transform for first stage)
// ---------------------------------------------------------------------------

const VIEWER_VERT_WGSL = /* wgsl */ `
struct ViewerUniforms {
  offset: vec2f,
  scale: vec2f,
}

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@group(1) @binding(0) var<uniform> viewer: ViewerUniforms;

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var out: VSOut;
  let x = f32(i32(i & 1u) * 2) - 1.0;
  let y = f32(i32(i >> 1u) * 2) - 1.0;
  out.pos = vec4f(x * viewer.scale.x + viewer.offset.x,
                  y * viewer.scale.y + viewer.offset.y, 0.0, 1.0);
  out.uv = vec2f((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
  return out;
}
`;

// ---------------------------------------------------------------------------
// Passthrough vertex WGSL (identity transform for intermediate FBO stages)
// ---------------------------------------------------------------------------

const PASSTHROUGH_VERT_WGSL = /* wgsl */ `
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var out: VSOut;
  let x = f32(i32(i & 1u) * 2) - 1.0;
  let y = f32(i32(i >> 1u) * 2) - 1.0;
  out.pos = vec4f(x, y, 0.0, 1.0);
  out.uv = vec2f((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
  return out;
}
`;

// ---------------------------------------------------------------------------
// Pipeline cache key helpers
// ---------------------------------------------------------------------------

function pipelineCacheKey(stageId: StageId, isFirst: boolean): string {
  return `${stageId}:${isFirst ? 'first' : 'intermediate'}`;
}

// ---------------------------------------------------------------------------
// WebGPUShaderPipeline
// ---------------------------------------------------------------------------

export class WebGPUShaderPipeline {
  private stages: WebGPUStageDescriptor[] = [];
  private pingPong = new WebGPUPingPong();

  /** Ordered stage IDs -- defines the default pipeline order (11 stages). */
  private stageOrder: StageId[] = [
    'inputDecode',
    'linearize',
    'primaryGrade',
    'secondaryGrade',
    'spatialEffects',
    'colorPipeline',
    'sceneAnalysis',
    'spatialEffectsPost',
    'displayOutput',
    'diagnostics',
    'compositing',
  ];

  /** Cached render pipelines. Key: `${stageId}:${isFirst}`. */
  private pipelineCache = new Map<string, WGPURenderPipeline>();

  /** Per-stage uniform buffers. Key: stageId. */
  private uniformBuffers = new Map<string, WGPUBuffer>();

  /** Passthrough render pipeline (for 0-active-stages blit). */
  private passthroughPipeline: WGPURenderPipeline | null = null;

  /** Sampler for nearest-neighbor filtering. */
  private nearestSampler: WGPUSampler | null = null;

  /** Sampler for bilinear filtering. */
  private linearSampler: WGPUSampler | null = null;

  /** Global uniforms UBO (shared across all stages). */
  private globalUBO: WGPUBuffer | null = null;
  private globalUBOData = new Float32Array(8);

  /** Renderer-set values for UBO fields not in InternalShaderState. */
  private _hdrHeadroom = 1.0;
  private _outputMode = 0;

  // ─── Public API ──────────────────────────────────────────────────────

  /**
   * Register a stage descriptor. Stages are executed in the order
   * defined by stageOrder, regardless of registration order.
   */
  registerStage(descriptor: WebGPUStageDescriptor): void {
    const existingIdx = this.stages.findIndex((s) => s.id === descriptor.id);
    if (existingIdx !== -1) {
      this.stages[existingIdx] = descriptor;
    } else {
      this.stages.push(descriptor);
    }
    this.sortStages();
  }

  /** Get the current stage order. */
  getStageOrder(): readonly StageId[] {
    return this.stageOrder;
  }

  /** Get registered stages (read-only). */
  getStages(): readonly WebGPUStageDescriptor[] {
    return this.stages;
  }

  /**
   * Reorder stages at runtime. Validates that the new order contains
   * all currently registered stage IDs.
   */
  setStageOrder(newOrder: StageId[]): boolean {
    const registeredIds = new Set(this.stages.map((s) => s.id));
    const newIds = new Set(newOrder);

    if (newIds.size !== newOrder.length) {
      return false;
    }

    for (const id of registeredIds) {
      if (!newIds.has(id)) {
        return false;
      }
    }

    this.stageOrder = [...newOrder];
    this.sortStages();
    return true;
  }

  /** Set the hdrHeadroom value for the global UBO. */
  setGlobalHDRHeadroom(headroom: number): void {
    this._hdrHeadroom = headroom;
  }

  /** Set the outputMode value for the global UBO. */
  setGlobalOutputMode(mode: number): void {
    this._outputMode = mode;
  }

  /**
   * Execute the pipeline.
   *
   * @param device - WebGPU device
   * @param inputTextureView - The input image texture view
   * @param outputView - The output texture view (canvas or FBO)
   * @param state - Current shader state (read-only)
   * @param renderWidth - Width of the render target
   * @param renderHeight - Height of the render target
   * @param isHDR - Whether the content is HDR
   * @param offsetX - Viewer pan X offset (for first stage vertex transform)
   * @param offsetY - Viewer pan Y offset
   * @param scaleX - Viewer zoom X scale
   * @param scaleY - Viewer zoom Y scale
   */
  execute(
    device: WGPUDevice,
    inputTextureView: WGPUTextureView,
    outputView: WGPUTextureView,
    state: Readonly<InternalShaderState>,
    renderWidth: number,
    renderHeight: number,
    isHDR = false,
    offsetX = 0,
    offsetY = 0,
    scaleX = 1,
    scaleY = 1,
  ): void {
    // 1. Determine active stages
    const activeStages = this.stages.filter((s) => !s.isIdentity(state));

    if (activeStages.length === 0) {
      // Passthrough: just blit source to output
      this.renderPassthrough(device, inputTextureView, outputView);
      return;
    }

    // Update Global Uniforms UBO
    this.updateGlobalUBO(device, state);

    if (activeStages.length === 1) {
      // Single-pass: no ping-pong overhead
      const stage = activeStages[0]!;
      this.renderSingleStage(device, stage, inputTextureView, outputView, true, offsetX, offsetY, scaleX, scaleY);
      return;
    }

    // Multi-pass: ping-pong texture chain
    const ppFormat: PingPongFormat = isHDR ? 'rgba16float' : 'rgba8unorm';
    this.pingPong.resize(device, renderWidth, renderHeight, ppFormat);
    this.pingPong.resetChain();

    let currentInput: WGPUTextureView = inputTextureView;

    for (let i = 0; i < activeStages.length; i++) {
      const stage = activeStages[i]!;
      const isFirst = i === 0;
      const isLast = i === activeStages.length - 1;

      const target = isLast ? outputView : this.pingPong.getTarget()!;

      this.renderSingleStage(
        device,
        stage,
        currentInput,
        target,
        isFirst,
        isFirst ? offsetX : 0,
        isFirst ? offsetY : 0,
        isFirst ? scaleX : 1,
        isFirst ? scaleY : 1,
      );

      if (!isLast) {
        this.pingPong.swap();
        currentInput = this.pingPong.getSource()!;
      }
    }
  }

  /**
   * Count how many stages are currently active for the given state.
   * Useful for callers to determine rendering path without executing.
   */
  countActiveStages(state: Readonly<InternalShaderState>): number {
    return this.stages.filter((s) => !s.isIdentity(state)).length;
  }

  /**
   * Get active stages for the given state.
   * Returns the list of stage descriptors that are not identity.
   */
  getActiveStages(state: Readonly<InternalShaderState>): readonly WebGPUStageDescriptor[] {
    return this.stages.filter((s) => !s.isIdentity(state));
  }

  /** Whether the pipeline has been initialized with at least samplers. */
  isReady(): boolean {
    return this.nearestSampler !== null && this.linearSampler !== null;
  }

  /**
   * Initialize shared resources (samplers, global UBO).
   * Must be called once after device creation.
   */
  initializeSharedResources(device: WGPUDevice): void {
    this.nearestSampler = device.createSampler({
      magFilter: 'nearest',
      minFilter: 'nearest',
    });

    this.linearSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // Create global UBO (8 floats = 32 bytes)
    this.globalUBO = device.createBuffer({
      size: this.globalUBOData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /** Release all GPU resources. */
  dispose(): void {
    this.pingPong.dispose();

    // Destroy uniform buffers
    for (const buf of this.uniformBuffers.values()) {
      buf.destroy();
    }
    this.uniformBuffers.clear();

    if (this.globalUBO) {
      this.globalUBO.destroy();
      this.globalUBO = null;
    }

    this.pipelineCache.clear();
    this.passthroughPipeline = null;
    this.nearestSampler = null;
    this.linearSampler = null;
  }

  /** Per-layer stage IDs (scene-referred / linear space). */
  static readonly PER_LAYER_STAGES: ReadonlySet<StageId> = new Set([
    'inputDecode',
    'linearize',
    'primaryGrade',
    'secondaryGrade',
    'spatialEffects',
    'colorPipeline',
  ]);

  /** Display output stage IDs (applied once to the composited result). */
  static readonly DISPLAY_STAGES: ReadonlySet<StageId> = new Set([
    'sceneAnalysis',
    'spatialEffectsPost',
    'displayOutput',
    'diagnostics',
    'compositing',
  ]);

  // ─── Private Methods ────────────────────────────────────────────────

  private sortStages(): void {
    const orderMap = new Map(this.stageOrder.map((id, i) => [id, i]));
    this.stages.sort(
      (a, b) => (orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  /**
   * Render a passthrough blit (0 active stages).
   */
  private renderPassthrough(device: WGPUDevice, inputView: WGPUTextureView, outputView: WGPUTextureView): void {
    if (!this.passthroughPipeline) {
      const shaderModule = device.createShaderModule({ code: PASSTHROUGH_WGSL });
      this.passthroughPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vs' },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs',
          targets: [{ format: 'rgba16float' }],
        },
        primitive: { topology: 'triangle-list' },
      });
    }

    const sampler = this.linearSampler ?? this.nearestSampler;
    if (!sampler) return;

    const textureBindGroup = device.createBindGroup({
      layout: this.passthroughPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: inputView },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    pass.setPipeline(this.passthroughPipeline);
    pass.setBindGroup(0, textureBindGroup);
    pass.draw(3);
    pass.end();

    device.queue.submit([encoder.finish()]);
  }

  /**
   * Render a single stage to an output view.
   */
  private renderSingleStage(
    device: WGPUDevice,
    stage: WebGPUStageDescriptor,
    inputView: WGPUTextureView,
    outputView: WGPUTextureView,
    isFirstStage: boolean,
    offsetX: number,
    offsetY: number,
    scaleX: number,
    scaleY: number,
  ): void {
    const cacheKey = pipelineCacheKey(stage.id, isFirstStage);
    let pipeline = this.pipelineCache.get(cacheKey);

    if (!pipeline) {
      // Build combined WGSL: vertex (viewer or passthrough) + stage fragment
      const vertSource = isFirstStage ? VIEWER_VERT_WGSL : PASSTHROUGH_VERT_WGSL;
      const combined = vertSource + '\n' + stage.wgslSource;
      const shaderModule = device.createShaderModule({ code: combined });

      pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vs' },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs',
          targets: [{ format: 'rgba16float' }],
        },
        primitive: { topology: 'triangle-list' },
      });
      this.pipelineCache.set(cacheKey, pipeline);
    }

    // Choose sampler based on stage needs
    const sampler = stage.needsBilinearInput && !isFirstStage
      ? (this.linearSampler ?? this.nearestSampler)
      : (this.nearestSampler ?? this.linearSampler);
    if (!sampler) return;

    // Create texture bind group (group 0)
    const textureBindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: inputView },
      ],
    });

    // Create viewer uniform bind group (group 1) if first stage
    let viewerBindGroup: WGPUBindGroup | null = null;
    if (isFirstStage) {
      const viewerUBO = this.ensureUniformBuffer(device, `viewer_${stage.id}`, 16);
      const viewerData = new Float32Array([offsetX, offsetY, scaleX, scaleY]);
      device.queue.writeBuffer(viewerUBO, 0, viewerData);

      viewerBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(1),
        entries: [{ binding: 0, resource: { buffer: viewerUBO } }],
      });
    }

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, textureBindGroup);
    if (viewerBindGroup) {
      pass.setBindGroup(1, viewerBindGroup);
    }
    pass.draw(3);
    pass.end();

    device.queue.submit([encoder.finish()]);
  }

  /**
   * Update the global uniforms UBO with current state values.
   */
  private updateGlobalUBO(device: WGPUDevice, state: Readonly<InternalShaderState>): void {
    if (!this.globalUBO) return;

    this.globalUBOData[0] = this._hdrHeadroom;
    this.globalUBOData[1] = state.channelModeCode;
    this.globalUBOData[2] = state.premultMode;
    this.globalUBOData[3] = this._outputMode;
    this.globalUBOData[4] = state.texelSize[0];
    this.globalUBOData[5] = state.texelSize[1];
    this.globalUBOData[6] = 0; // padding
    this.globalUBOData[7] = 0; // padding

    device.queue.writeBuffer(this.globalUBO, 0, this.globalUBOData);
  }

  /**
   * Ensure a uniform buffer exists for a given key, creating it if needed.
   */
  private ensureUniformBuffer(device: WGPUDevice, key: string, size: number): WGPUBuffer {
    let buffer = this.uniformBuffers.get(key);
    if (!buffer) {
      buffer = device.createBuffer({
        size,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.uniformBuffers.set(key, buffer);
    }
    return buffer;
  }
}
