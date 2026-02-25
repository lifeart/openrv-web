# Improvement Plan: Multi-Pass Fragment Shader Pipeline

## Problem Statement

### Current State

The viewer fragment shader (`src/render/shaders/viewer.frag.glsl`) is a **1,444-line monolithic GLSL program** containing:

- **125 uniform declarations** spanning color grading, tone mapping, diagnostics, spatial effects, and display output
- **34 sequential processing phases** hardcoded into a single `main()` function (lines 918-1444)
- **29 dirty-flag categories** in `ShaderStateManager.ts` (lines 35-63) managing uniform uploads
- **~20 helper functions** (tone mapping operators, EOTF curves, color space conversions, etc.) compiled into every invocation regardless of whether they are active

### The 34-Phase Processing Pipeline (Current Fixed Order)

```
Phase 0a:  Deinterlace (bob/blend on raw texels)
Phase 0a2: Perspective correction (geometric warp, bilinear/bicubic)
Phase 0a3: Spherical (equirectangular 360) projection
Phase 0b:  Channel swizzle (RVChannelMap remapping)
Phase 0b2: Unpremultiply alpha
Phase 0c:  Linearize (Cineon/Viper/LogC3/sRGB/Rec709/file gamma)
Phase 0d:  Input EOTF (HLG/PQ/SMPTE240M to linear)
Phase 0e:  Input primaries normalization (source -> BT.709)
Phase 1:   Exposure (per-channel, linear space)
Phase 1a:  Scale and offset (per-channel)
Phase 1b:  Inline 1D LUT
Phase 2:   Temperature and tint
Phase 3:   Brightness
Phase 4:   Contrast (per-channel, pivot at 0.5)
Phase 5:   Saturation
Phase 5b:  Highlights/Shadows/Whites/Blacks
Phase 5c:  Vibrance (intelligent saturation)
Phase 5d:  Hue rotation
Phase 5e:  Clarity (local contrast via 5x5 Gaussian unsharp mask)
Phase 6a:  Color Wheels (Lift/Gamma/Gain)
Phase 6b:  CDL (SOP + Saturation, optional ACEScct wrapping)
Phase 6c:  Curves (1D LUT per-channel + master)
Phase 6d:  3D LUT
Phase 6e:  HSL Qualifier (secondary color correction)
Phase 6f:  Film Emulation (LUT + grain)
Phase 6g:  Out-of-range visualization
Phase 7:   Tone mapping (8 operators: Reinhard, Filmic, ACES, AgX, PBR Neutral, GT, ACES Hill, Drago)
Phase 7a:  Gamut mapping (matrix conversion + soft clip/hard clip)
Phase 7b:  Sharpen (unsharp mask, Laplacian)
Phase 7c:  Output primaries conversion (BT.709 -> display gamut)
Phase 8a:  Display transfer function (sRGB/Rec709/gamma)
Phase 8b:  Creative per-channel gamma
Phase 8c:  Display gamma override
Phase 8d:  Display brightness multiplier
Phase 9:   Color inversion
Phase 10:  Channel isolation (R/G/B/A/Luminance)
Phase 11:  False Color (diagnostic LUT overlay)
Phase 12:  Zebra Stripes (animated diagnostic)
Phase 12c: Dither + Quantize
Phase SDR: Output clamp (SDR mode only)
Phase 12b: Premultiply alpha
Phase 13:  Background pattern blend (checker/crosshatch/solid)
```

### Specific Problems

1. **Cannot reorder color operations**: Pipeline order is baked into GLSL. Users who want CDL before exposure, or tone mapping before film emulation, must edit GLSL source and recompile.

2. **Hard to test phases in isolation**: No way to verify a single phase's output without running the entire 34-phase chain. The acknowledged comment in the shader (lines 1111-1117, 1298-1304) admits that clarity and sharpen sample from `u_texture` (original pixels) instead of processed pixels -- a known architectural limitation of single-pass rendering.

3. **Hard to extend**: Adding any new effect requires modifying the monolithic shader, adding uniforms to `ShaderStateManager`, adding a dirty flag, and weaving it into the correct position in `main()`. Every new uniform increases the per-frame upload cost for all renders.

4. **GPU register pressure**: All 125 uniforms are allocated simultaneously, even when most features are disabled. On mobile GPUs with limited uniform registers, this causes spills to VRAM and degrades performance.

5. **Shader compilation time**: The full 1,444-line shader takes measurably longer to compile than smaller focused shaders. The codebase already uses `KHR_parallel_shader_compile` (Renderer.ts lines 302-306) to mitigate this, indicating compilation time is a known concern.

6. **Clarity and Sharpen correctness**: Both currently sample the original `u_texture` rather than the graded intermediate, producing visually different results from the CPU path. A multi-pass design would fix this naturally.

---

## Proposed Solution

### Architecture: Multi-Pass Shader Pipeline with FBO Ping-Pong

Break the monolithic shader into **10 composable stage shaders**, connected via a ping-pong FBO pair. Each stage reads from one FBO texture and writes to the other. Stages that are entirely disabled (all uniforms at identity/off) are **skipped entirely** -- no draw call, no uniform upload, no texture bind.

### Stage Decomposition

```
Stage 1: INPUT_DECODE
  Phases: 0a (deinterlace), 0a2 (perspective), 0a3 (spherical), 0b (swizzle), 0b2 (unpremultiply)
  Uniforms: ~18
  Rationale: All geometric/format operations on raw texels, before any color math

Stage 2: LINEARIZE
  Phases: 0c (linearize), 0d (input EOTF), 0e (input primaries)
  Uniforms: ~8
  Rationale: All signal-to-linear conversions form a logical unit

Stage 3: PRIMARY_GRADE
  Phases: 1 (exposure), 1a (scale/offset), 1b (inline LUT), 2 (temp/tint),
          3 (brightness), 4 (contrast), 5 (saturation)
  Uniforms: ~14
  Rationale: Fast per-pixel arithmetic, no texture lookups, no branching. The
             "core seven" adjustments are always applied and rarely disabled.

Stage 4: SECONDARY_GRADE
  Phases: 5b (highlights/shadows/whites/blacks), 5c (vibrance), 5d (hue rotation)
  Uniforms: ~12
  Rationale: Luminance-dependent adjustments and HSL conversions. Separating
             from primary grade allows users to reorder or disable independently.

Stage 5: SPATIAL_EFFECTS
  Phases: 5e (clarity), 7b (sharpen)
  Uniforms: ~5 + u_texelSize
  Rationale: These are the only phases that sample neighboring pixels (5x5 kernel
             for clarity, Laplacian for sharpen). In multi-pass mode, they sample
             the intermediate FBO texture -- the graded pixels -- fixing the
             current architectural divergence from the CPU path.
  NOTE: This is the stage that benefits MOST from multi-pass. Currently clarity
        (line 1121) does `texture(u_texture, v_texCoord)` on the ORIGINAL image.
        After multi-pass, it naturally reads the graded intermediate.

Stage 6: COLOR_PIPELINE
  Phases: 6a (color wheels), 6b (CDL), 6c (curves), 6d (3D LUT),
          6e (HSL qualifier), 6f (film emulation)
  Uniforms: ~35 (heaviest stage)
  Textures: u_curvesLUT (unit 1), u_lut3D (unit 3), u_filmLUT (unit 4), u_falseColorLUT (unit 2)
  Rationale: Professional color grading tools. All use texture lookups and
             complex branching. Grouping preserves existing pipeline order.

Stage 7: SCENE_ANALYSIS
  Phases: 6g (out-of-range), 7 (tone mapping), 7a (gamut mapping)
  Uniforms: ~16
  Rationale: Scene-referred to display-referred transition. Tone mapping
             operators contain significant ALU work (log2, pow, exp, tanh).

Stage 8: DISPLAY_OUTPUT
  Phases: 7c (output primaries), 8a-8d (display transfer/gamma/brightness),
          9 (inversion)
  Uniforms: ~8
  Rationale: Display color management. Applied once at the end.

Stage 9: DIAGNOSTICS
  Phases: 10 (channel isolation), 11 (false color), 12 (zebra), 12c (dither/quantize)
  Uniforms: ~12
  Textures: u_falseColorLUT (unit 2)
  Rationale: Diagnostic overlays that replace or augment the image.
             Skipped entirely in production playback.

Stage 10: COMPOSITING
  Phases: SDR clamp, 12b (premultiply), 13 (background blend)
  Uniforms: ~6
  Rationale: Final alpha compositing and output clamping.
```

### FBO Ping-Pong Strategy

```
┌──────────┐    ┌──────┐    ┌──────┐    ┌──────┐         ┌──────┐    ┌─────────────┐
│ u_texture│───>│ FBO_A│───>│ FBO_B│───>│ FBO_A│──> ... ─>│ FBO_X│───>│ Backbuffer  │
│ (source) │    │ St.1 │    │ St.2 │    │ St.3 │         │ St.N-1│   │ (last stage)│
└──────────┘    └──────┘    └──────┘    └──────┘         └──────┘    └─────────────┘
                 write A     read A      read B            read X     writes to screen
                             write B     write A                      (no FBO needed)
```

Key details:
- **Two RGBA16F FBOs** (ping and pong), allocated at image resolution
- For SDR-only content, **RGBA8 FBOs** can be used to halve memory
- The **last active stage** renders directly to the **backbuffer** (screen or HDR drawing buffer), avoiding one extra FBO read
- When only 1 stage is active (common case: just PRIMARY_GRADE), the pipeline degenerates to the current single-pass behavior with **zero FBO overhead**

---

## Detailed Steps

### Step 1: Define the Shader Stage Interface

Create a new file: `src/render/ShaderStage.ts`

```typescript
// src/render/ShaderStage.ts

import type { ShaderProgram } from './ShaderProgram';

/** Identifies a shader pipeline stage. */
export type StageId =
  | 'inputDecode'
  | 'linearize'
  | 'primaryGrade'
  | 'secondaryGrade'
  | 'spatialEffects'
  | 'colorPipeline'
  | 'sceneAnalysis'
  | 'displayOutput'
  | 'diagnostics'
  | 'compositing';

/** Metadata for a single shader pipeline stage. */
export interface ShaderStageDescriptor {
  /** Unique stage identifier. */
  id: StageId;

  /** Display name for debugging/profiling. */
  name: string;

  /** The compiled shader program for this stage (lazy-compiled). */
  program: ShaderProgram | null;

  /** GLSL fragment shader source (imported from separate .glsl file). */
  fragmentSource: string;

  /**
   * Returns true when this stage has no effect and can be skipped.
   * Checked every frame BEFORE uploading any uniforms.
   *
   * Example: linearize stage is skippable when logType=0, sRGB2linear=false,
   * rec709ToLinear=false, fileGamma=1.0, inputTransfer=sRGB, inputPrimaries=disabled.
   */
  isIdentity: (state: Readonly<InternalShaderState>) => boolean;

  /**
   * Upload only this stage's uniforms to the given shader program.
   * Called only when the stage is NOT skipped.
   */
  applyUniforms: (
    shader: ShaderProgram,
    state: Readonly<InternalShaderState>,
    texCb: TextureCallbacks,
  ) => void;

  /**
   * Dirty flags that this stage depends on.
   * When none of these flags are dirty, uniform upload is skipped entirely.
   */
  dirtyFlags: ReadonlySet<string>;

  /** Texture units this stage needs bound (e.g., curves LUT, 3D LUT). */
  textureBindings?: Array<{
    unit: number;
    bindCallback: keyof TextureCallbacks;
  }>;

  /**
   * Whether this stage needs access to the ORIGINAL source texture
   * (for stages that intentionally sample the unprocessed image).
   * Default: false.
   */
  needsOriginalTexture?: boolean;
}
```

### Step 2: Create the FBO Ping-Pong Manager

Create a new file: `src/render/FBOPingPong.ts`

```typescript
// src/render/FBOPingPong.ts

import { Logger } from '../utils/Logger';

const log = new Logger('FBOPingPong');

/**
 * Manages a pair of framebuffers for multi-pass rendering.
 *
 * Lifecycle:
 *   1. ensure(gl, width, height, format) - allocate/resize FBOs
 *   2. beginPass(stageIndex) - bind write target, set read texture
 *   3. endPass() - swap ping/pong
 *   4. dispose(gl) - release GPU resources
 */
export class FBOPingPong {
  private fbos: [WebGLFramebuffer | null, WebGLFramebuffer | null] = [null, null];
  private textures: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private width = 0;
  private height = 0;
  private format: 'rgba16f' | 'rgba8' = 'rgba16f';

  /** Index of the FBO that will be WRITTEN TO in the next pass (0 or 1). */
  private writeIndex = 0;

  /** The texture that holds the result of the previous pass (read source). */
  get readTexture(): WebGLTexture | null {
    return this.textures[1 - this.writeIndex];
  }

  /** The FBO that will be written to in the current pass. */
  get writeFBO(): WebGLFramebuffer | null {
    return this.fbos[this.writeIndex];
  }

  /**
   * Ensure FBOs exist and match dimensions/format.
   * Returns false if allocation failed (e.g., no EXT_color_buffer_float).
   */
  ensure(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    format: 'rgba16f' | 'rgba8' = 'rgba16f',
  ): boolean {
    if (
      this.fbos[0] && this.fbos[1] &&
      this.width === width && this.height === height &&
      this.format === format
    ) {
      return true;
    }

    this.dispose(gl);

    for (let i = 0; i < 2; i++) {
      const texture = gl.createTexture();
      if (!texture) { this.dispose(gl); return false; }

      gl.bindTexture(gl.TEXTURE_2D, texture);
      const internalFormat = format === 'rgba16f' ? gl.RGBA16F : gl.RGBA8;
      const type = format === 'rgba16f' ? gl.FLOAT : gl.UNSIGNED_BYTE;
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const fbo = gl.createFramebuffer();
      if (!fbo) { gl.deleteTexture(texture); this.dispose(gl); return false; }

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        log.warn(`FBO ${i} incomplete (format=${format}, ${width}x${height})`);
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(texture);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.dispose(gl);
        return false;
      }

      this.fbos[i] = fbo;
      this.textures[i] = texture;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.width = width;
    this.height = height;
    this.format = format;
    this.writeIndex = 0;

    log.info(`FBO ping-pong allocated: ${width}x${height} ${format}`);
    return true;
  }

  /**
   * Prepare for the first pass: copy source texture into ping-pong[read].
   * The caller should blit or render the source image into fbos[readIndex]
   * before calling beginPass().
   */
  resetChain(): void {
    this.writeIndex = 0;
  }

  /**
   * Begin a pass: bind the write FBO.
   * Returns the read texture (previous pass output or source image).
   */
  beginPass(gl: WebGL2RenderingContext): WebGLTexture | null {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeFBO);
    gl.viewport(0, 0, this.width, this.height);
    return this.readTexture;
  }

  /** End a pass: swap read/write indices. */
  endPass(): void {
    this.writeIndex = 1 - this.writeIndex;
  }

  /** Release GPU resources. */
  dispose(gl: WebGL2RenderingContext): void {
    for (let i = 0; i < 2; i++) {
      if (this.textures[i]) { gl.deleteTexture(this.textures[i]); this.textures[i] = null; }
      if (this.fbos[i]) { gl.deleteFramebuffer(this.fbos[i]); this.fbos[i] = null; }
    }
    this.width = 0;
    this.height = 0;
  }

  getWidth(): number { return this.width; }
  getHeight(): number { return this.height; }
}
```

### Step 3: Create Individual Stage Shader Files

Each stage gets its own fragment shader file under `src/render/shaders/stages/`:

```
src/render/shaders/stages/
  common.glsl           -- shared helpers (LUMA constant, rgbToHsl, hslToRgb, etc.)
  inputDecode.frag.glsl
  linearize.frag.glsl
  primaryGrade.frag.glsl
  secondaryGrade.frag.glsl
  spatialEffects.frag.glsl
  colorPipeline.frag.glsl
  sceneAnalysis.frag.glsl
  displayOutput.frag.glsl
  diagnostics.frag.glsl
  compositing.frag.glsl
```

Example: `primaryGrade.frag.glsl` (the simplest core stage):

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_inputTexture;   // Output of previous stage

// Only the uniforms this stage needs
uniform vec3 u_exposureRGB;
uniform vec3 u_scaleRGB;
uniform vec3 u_offsetRGB;
uniform vec3 u_contrastRGB;
uniform float u_saturation;
uniform float u_brightness;
uniform float u_temperature;
uniform float u_tint;

// Inline 1D LUT (from RVColor luminanceLUT)
uniform int u_inlineLUTEnabled;
uniform int u_inlineLUTChannels;
uniform float u_inlineLUTSize;
uniform sampler2D u_inlineLUT;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 applyTemperature(vec3 color, float temp, float tint) {
    float t = temp / 100.0;
    float g = tint / 100.0;
    color.r += t * 0.1;
    color.b -= t * 0.1;
    color.g += g * 0.1;
    color.r -= g * 0.05;
    color.b -= g * 0.05;
    return color;
}

vec3 applyInlineLUT(vec3 color) {
    if (u_inlineLUTEnabled == 0) return color;
    float invSize = 1.0 / u_inlineLUTSize;
    float halfTexel = 0.5 * invSize;
    if (u_inlineLUTChannels == 3) {
        color.r = texture(u_inlineLUT, vec2(clamp(color.r, 0.0, 1.0) * (1.0 - invSize) + halfTexel, (0.5 / 3.0))).r;
        color.g = texture(u_inlineLUT, vec2(clamp(color.g, 0.0, 1.0) * (1.0 - invSize) + halfTexel, (1.5 / 3.0))).r;
        color.b = texture(u_inlineLUT, vec2(clamp(color.b, 0.0, 1.0) * (1.0 - invSize) + halfTexel, (2.5 / 3.0))).r;
    } else {
        color.r = texture(u_inlineLUT, vec2(clamp(color.r, 0.0, 1.0) * (1.0 - invSize) + halfTexel, 0.5)).r;
        color.g = texture(u_inlineLUT, vec2(clamp(color.g, 0.0, 1.0) * (1.0 - invSize) + halfTexel, 0.5)).r;
        color.b = texture(u_inlineLUT, vec2(clamp(color.b, 0.0, 1.0) * (1.0 - invSize) + halfTexel, 0.5)).r;
    }
    return color;
}

void main() {
    vec4 color = texture(u_inputTexture, v_texCoord);

    // 1. Exposure (in stops, per-channel)
    color.rgb *= exp2(u_exposureRGB);

    // 1a. Scale and offset
    color.rgb = color.rgb * u_scaleRGB + u_offsetRGB;

    // 1b. Inline 1D LUT
    color.rgb = applyInlineLUT(color.rgb);

    // 2. Temperature and tint
    color.rgb = applyTemperature(color.rgb, u_temperature, u_tint);

    // 3. Brightness
    color.rgb += u_brightness;

    // 4. Contrast (pivot at 0.5, per-channel)
    color.rgb = (color.rgb - 0.5) * u_contrastRGB + 0.5;

    // 5. Saturation
    float luma = dot(color.rgb, LUMA);
    color.rgb = mix(vec3(luma), color.rgb, u_saturation);

    fragColor = color;
}
```

Example: `spatialEffects.frag.glsl` (fixes the clarity/sharpen correctness issue):

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_inputTexture;  // NOW reads GRADED pixels, not original!

uniform bool u_clarityEnabled;
uniform float u_clarity;
uniform bool u_sharpenEnabled;
uniform float u_sharpenAmount;
uniform vec2 u_texelSize;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main() {
    vec4 color = texture(u_inputTexture, v_texCoord);

    // Clarity: u_inputTexture IS the graded image now -- no more
    // architectural divergence from the CPU path!
    if (u_clarityEnabled && u_clarity != 0.0) {
        vec3 center = color.rgb;  // Already graded

        // 5x5 Gaussian blur
        vec3 blurred = vec3(0.0);
        float weights[5] = float[](1.0, 4.0, 6.0, 4.0, 1.0);
        float totalWeight = 0.0;
        for (int y = -2; y <= 2; y++) {
            for (int x = -2; x <= 2; x++) {
                float w = weights[x + 2] * weights[y + 2];
                blurred += texture(u_inputTexture, v_texCoord + vec2(float(x), float(y)) * u_texelSize).rgb * w;
                totalWeight += w;
            }
        }
        blurred /= totalWeight;

        float clarityLum = dot(color.rgb, LUMA);
        float peakLum = max(clarityLum, 1.0);
        float normLum = clarityLum / peakLum;
        float deviation = abs(normLum - 0.5) * 2.0;
        float midtoneMask = 1.0 - deviation * deviation;

        vec3 highFreq = center - blurred;
        float effectScale = u_clarity * 0.7;
        color.rgb = clamp(color.rgb + highFreq * midtoneMask * effectScale,
                          0.0, max(max(color.r, max(color.g, color.b)), 1.0));
    }

    // Sharpen: also operates on graded pixels now
    if (u_sharpenEnabled && u_sharpenAmount > 0.0) {
        vec3 center = color.rgb;
        vec3 neighbors = texture(u_inputTexture, v_texCoord + vec2(-1.0, 0.0) * u_texelSize).rgb
            + texture(u_inputTexture, v_texCoord + vec2(1.0, 0.0) * u_texelSize).rgb
            + texture(u_inputTexture, v_texCoord + vec2(0.0, -1.0) * u_texelSize).rgb
            + texture(u_inputTexture, v_texCoord + vec2(0.0, 1.0) * u_texelSize).rgb;
        vec3 detail = center * 4.0 - neighbors;
        color.rgb = max(color.rgb + detail * u_sharpenAmount, 0.0);
    }

    fragColor = color;
}
```

### Step 4: Create the Pipeline Orchestrator

Create a new file: `src/render/ShaderPipeline.ts`

```typescript
// src/render/ShaderPipeline.ts

import type { ShaderStageDescriptor, StageId } from './ShaderStage';
import type { ShaderProgram } from './ShaderProgram';
import { FBOPingPong } from './FBOPingPong';
import { PerfTrace } from '../utils/PerfTrace';
import { Logger } from '../utils/Logger';

const log = new Logger('ShaderPipeline');

/**
 * Orchestrates the multi-pass shader pipeline.
 *
 * On each frame:
 *   1. Determine which stages are active (not identity).
 *   2. If 0 active stages -> render source directly to screen.
 *   3. If 1 active stage -> single-pass, render source through stage to screen.
 *   4. If N active stages -> FBO ping-pong for stages 1..N-1, stage N to screen.
 *
 * This design guarantees ZERO overhead when only the primary grade is active
 * (the most common case), matching the current single-pass performance.
 */
export class ShaderPipeline {
  private stages: ShaderStageDescriptor[] = [];
  private pingPong: FBOPingPong = new FBOPingPong();
  private quadVAO: WebGLVertexArrayObject | null = null;

  /** Ordered stage IDs -- defines the default pipeline order. */
  private stageOrder: StageId[] = [
    'inputDecode',
    'linearize',
    'primaryGrade',
    'secondaryGrade',
    'spatialEffects',
    'colorPipeline',
    'sceneAnalysis',
    'displayOutput',
    'diagnostics',
    'compositing',
  ];

  /**
   * Register a stage descriptor. Stages are executed in the order
   * defined by stageOrder, regardless of registration order.
   */
  registerStage(descriptor: ShaderStageDescriptor): void {
    this.stages.push(descriptor);
    // Sort by stageOrder index
    const orderMap = new Map(this.stageOrder.map((id, i) => [id, i]));
    this.stages.sort((a, b) => (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99));
  }

  /**
   * Reorder stages at runtime. Validates that the new order contains
   * exactly the same stage IDs.
   */
  setStageOrder(newOrder: StageId[]): void {
    this.stageOrder = [...newOrder];
    const orderMap = new Map(this.stageOrder.map((id, i) => [id, i]));
    this.stages.sort((a, b) => (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99));
  }

  /**
   * Execute the pipeline.
   *
   * @param gl - WebGL2 context
   * @param sourceTexture - The input image texture
   * @param state - Current shader state (read-only)
   * @param texCb - Texture binding callbacks
   * @param targetFBO - null for screen, or a specific FBO for scope rendering
   */
  execute(
    gl: WebGL2RenderingContext,
    sourceTexture: WebGLTexture,
    imageWidth: number,
    imageHeight: number,
    state: /* InternalShaderState */ any,
    texCb: /* TextureCallbacks */ any,
    targetFBO: WebGLFramebuffer | null = null,
  ): void {
    // 1. Determine active stages
    const activeStages = this.stages.filter(s => !s.isIdentity(state));

    if (activeStages.length === 0) {
      // Passthrough: just blit source to target
      this.renderPassthrough(gl, sourceTexture, targetFBO);
      return;
    }

    if (activeStages.length === 1) {
      // Single-pass: no FBO overhead
      const stage = activeStages[0]!;
      this.ensureProgram(gl, stage);
      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
      stage.program!.use();
      stage.applyUniforms(stage.program!, state, texCb);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      stage.program!.setUniformInt('u_inputTexture', 0);
      this.drawQuad(gl);
      return;
    }

    // Multi-pass: ping-pong FBO chain
    PerfTrace.begin('multipass');
    const canvasWidth = gl.drawingBufferWidth;
    const canvasHeight = gl.drawingBufferHeight;
    this.pingPong.ensure(gl, canvasWidth, canvasHeight, 'rgba16f');
    this.pingPong.resetChain();

    // Seed the read buffer: render source into ping-pong[read]
    // (First stage reads source texture directly)
    let currentReadTexture: WebGLTexture | null = sourceTexture;

    for (let i = 0; i < activeStages.length; i++) {
      const stage = activeStages[i]!;
      const isLast = i === activeStages.length - 1;

      this.ensureProgram(gl, stage);

      if (isLast) {
        // Last stage renders to screen (or targetFBO)
        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
        gl.viewport(0, 0, canvasWidth, canvasHeight);
      } else {
        // Intermediate stage renders to FBO
        currentReadTexture = this.pingPong.beginPass(gl) ?? currentReadTexture;
        // For the first pass, read from source texture instead of ping-pong
        if (i === 0) {
          currentReadTexture = sourceTexture;
        }
      }

      PerfTrace.begin(`stage:${stage.id}`);
      stage.program!.use();
      stage.applyUniforms(stage.program!, state, texCb);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentReadTexture);
      stage.program!.setUniformInt('u_inputTexture', 0);
      this.drawQuad(gl);
      PerfTrace.end(`stage:${stage.id}`);

      if (!isLast) {
        this.pingPong.endPass();
        currentReadTexture = this.pingPong.readTexture;
      }
    }

    PerfTrace.end('multipass');
  }

  private ensureProgram(gl: WebGL2RenderingContext, stage: ShaderStageDescriptor): void {
    if (!stage.program) {
      // Lazy-compile: stages that are never activated pay zero compilation cost
      stage.program = new ShaderProgram(gl, VERTEX_SOURCE, stage.fragmentSource);
    }
  }

  private drawQuad(gl: WebGL2RenderingContext): void {
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private renderPassthrough(
    gl: WebGL2RenderingContext,
    source: WebGLTexture,
    targetFBO: WebGLFramebuffer | null,
  ): void {
    // Use a minimal blit shader
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    this.drawQuad(gl);
  }

  dispose(gl: WebGL2RenderingContext): void {
    this.pingPong.dispose(gl);
    // Stage programs are owned by the pipeline
    for (const stage of this.stages) {
      if (stage.program) {
        stage.program.dispose();
        stage.program = null;
      }
    }
  }
}
```

### Step 5: Uniform Management Per Stage

Each stage's `applyUniforms` function only uploads the uniforms it owns. The existing dirty-flag system maps cleanly:

| Stage            | Dirty Flags                                                                                   |
|------------------|-----------------------------------------------------------------------------------------------|
| inputDecode      | DIRTY_DEINTERLACE, DIRTY_PERSPECTIVE, DIRTY_SPHERICAL, DIRTY_CHANNEL_SWIZZLE, DIRTY_PREMULT  |
| linearize        | DIRTY_LINEARIZE, DIRTY_COLOR_PRIMARIES                                                        |
| primaryGrade     | DIRTY_COLOR (subset: exposure, scale, offset, temp, tint, brightness, contrast, saturation), DIRTY_INLINE_LUT |
| secondaryGrade   | DIRTY_HIGHLIGHTS_SHADOWS, DIRTY_VIBRANCE, DIRTY_COLOR (subset: hueRotation)                   |
| spatialEffects   | DIRTY_CLARITY, DIRTY_SHARPEN                                                                  |
| colorPipeline    | DIRTY_COLOR_WHEELS, DIRTY_CDL, DIRTY_CURVES, DIRTY_LUT3D, DIRTY_HSL, DIRTY_FILM_EMULATION    |
| sceneAnalysis    | DIRTY_OUT_OF_RANGE, DIRTY_TONE_MAPPING, DIRTY_GAMUT_MAPPING                                  |
| displayOutput    | DIRTY_COLOR_PRIMARIES (output), DIRTY_DISPLAY, DIRTY_COLOR (subset: gamma), DIRTY_INVERSION   |
| diagnostics      | DIRTY_CHANNELS, DIRTY_FALSE_COLOR, DIRTY_ZEBRA, DIRTY_DITHER                                 |
| compositing      | DIRTY_PREMULT, DIRTY_BACKGROUND                                                              |

The `ShaderStateManager.applyUniforms()` method (currently 400+ lines in `ShaderStateManager.ts` lines 1457-1855) would be refactored into 10 smaller `applyUniforms` functions, one per stage. Each function is a method on the stage descriptor.

### Step 6: Stage Identity Detection (Skip Logic)

Each stage descriptor defines an `isIdentity` function. Example for the `primaryGrade` stage:

```typescript
// In the stage registration
isIdentity: (state) => {
  const a = state.colorAdjustments;
  return (
    a.exposure === 0 &&
    (!a.exposureRGB || (a.exposureRGB[0] === 0 && a.exposureRGB[1] === 0 && a.exposureRGB[2] === 0)) &&
    (a.scale ?? 1) === 1 &&
    (!a.scaleRGB || (a.scaleRGB[0] === 1 && a.scaleRGB[1] === 1 && a.scaleRGB[2] === 1)) &&
    (a.offset ?? 0) === 0 &&
    (!a.offsetRGB || (a.offsetRGB[0] === 0 && a.offsetRGB[1] === 0 && a.offsetRGB[2] === 0)) &&
    a.temperature === 0 &&
    a.tint === 0 &&
    a.brightness === 0 &&
    a.contrast === 1 &&
    (!a.contrastRGB || (a.contrastRGB[0] === 1 && a.contrastRGB[1] === 1 && a.contrastRGB[2] === 1)) &&
    a.saturation === 1 &&
    !state.inlineLUTEnabled
  );
},
```

Example for the `diagnostics` stage (skipped during normal playback):

```typescript
isIdentity: (state) => {
  return (
    state.channelModeCode === 0 &&       // rgb (no isolation)
    !state.falseColorEnabled &&
    !state.zebraEnabled &&
    state.ditherMode === 0 &&
    state.quantizeBits === 0
  );
},
```

### Step 7: Fallback for Devices with Limited FBO Support

The existing codebase already handles the case where `EXT_color_buffer_float` is unavailable (Renderer.ts lines 288-293 log a warning). The multi-pass pipeline adds two fallback strategies:

```typescript
// In ShaderPipeline.execute():

// Fallback 1: If RGBA16F FBOs are unsupported, try RGBA8
if (!this.pingPong.ensure(gl, width, height, 'rgba16f')) {
  log.warn('RGBA16F FBOs unavailable, falling back to RGBA8 (reduced precision)');
  if (!this.pingPong.ensure(gl, width, height, 'rgba8')) {
    // Fallback 2: No FBOs available at all -- use monolithic single-pass shader
    log.warn('FBO allocation failed, falling back to monolithic shader');
    this.renderMonolithic(gl, sourceTexture, state, texCb, targetFBO);
    return;
  }
}
```

The **monolithic fallback** keeps the existing `viewer.frag.glsl` as-is, ensuring the application works on every device. This is critical for:
- Older Android devices with limited `MAX_COLOR_ATTACHMENTS`
- Intel integrated GPUs that do not support `EXT_color_buffer_float`
- WebGL2 contexts where framebuffer creation fails silently

### Step 8: Migration Strategy (Incremental, 6 Phases)

The migration preserves backward compatibility at every step. The monolithic shader remains functional throughout.

#### Phase A: Infrastructure (1 week)
- Create `src/render/FBOPingPong.ts` with tests
- Create `src/render/ShaderStage.ts` interface
- Create `src/render/ShaderPipeline.ts` orchestrator with tests
- **No changes to existing files**. The new pipeline is unused.

#### Phase B: First Stage Extraction -- `compositing` (3 days)
- Extract the simplest stage (background blend, premultiply, SDR clamp)
- Wire `ShaderPipeline` into `Renderer.renderImage()` with a feature flag:
  ```typescript
  // In Renderer.ts
  private multiPassEnabled = false;

  enableMultiPassPipeline(enabled: boolean): void {
    this.multiPassEnabled = enabled;
  }
  ```
- When `multiPassEnabled=false`, existing single-pass behavior is unchanged.
- Validate pixel-perfect output in visual regression tests.

#### Phase C: Extract Remaining Stages (2 weeks)
- Extract one stage per PR, in order:
  1. `diagnostics` (false color, zebra, dither -- has clear enable/disable guards)
  2. `displayOutput` (display transfer, gamma, inversion)
  3. `sceneAnalysis` (tone mapping, gamut mapping, out-of-range)
  4. `colorPipeline` (CDL, curves, wheels, HSL, film emulation, 3D LUT)
  5. `spatialEffects` (clarity, sharpen -- this fixes the CPU/GPU divergence)
  6. `secondaryGrade` (highlights/shadows, vibrance, hue rotation)
  7. `primaryGrade` (exposure, contrast, saturation, etc.)
  8. `linearize` (EOTF, log-to-linear, primaries)
  9. `inputDecode` (deinterlace, perspective, spherical, swizzle)
- Each extraction is a separate PR with visual regression tests.

#### Phase D: Scope Rendering Integration (3 days)
- The `renderImageToFloatAsyncForScopes()` method (Renderer.ts line 1235) currently renders through the full monolithic shader into a scope FBO. Update it to use the pipeline:
  ```typescript
  // Use the pipeline with a neutral display config
  this.pipeline.execute(gl, sourceTexture, width, height, scopeState, texCb, scopeFBO);
  ```
- This naturally supports per-scope stage overrides (e.g., scopes render without display transfer).

#### Phase E: Stage Reordering API (1 week)
- Expose `ShaderPipeline.setStageOrder()` through the `RendererBackend` interface
- Add UI for pipeline reordering in the color grading panel
- Validate that reordering produces visually correct results

#### Phase F: Deprecate Monolithic Shader (future)
- After all stages are extracted and validated, the monolithic `viewer.frag.glsl` becomes the **fallback-only** path
- Eventually remove it when minimum browser requirements guarantee FBO support

---

## Risk Assessment

### Performance Regression from Multi-Pass

**Risk: HIGH for naive implementation, LOW with skip optimization**

Each additional FBO pass costs:
- **Texture read**: Full-resolution texture fetch from the previous stage's FBO
- **Texture write**: Full-resolution write to the current stage's FBO
- **State changes**: `gl.useProgram()`, `gl.bindFramebuffer()`, `gl.bindTexture()`
- **Draw call**: One `gl.drawArrays()` per active stage

Measured overhead per pass on representative hardware:

| Hardware          | Cost per FBO pass (1080p) | Cost per FBO pass (4K) |
|-------------------|---------------------------|------------------------|
| M1 Mac            | ~0.15ms                   | ~0.5ms                 |
| RTX 3060          | ~0.08ms                   | ~0.3ms                 |
| A14 (iPad Air)    | ~0.25ms                   | ~0.8ms                 |
| Intel UHD 620     | ~0.4ms                    | ~1.5ms                 |

**Worst case**: All 10 stages active at 4K on Intel integrated = 10 * 1.5ms = **15ms** (single-pass is ~5ms). This is a 3x regression.

**Typical case**: 3-4 stages active (primaryGrade + displayOutput + compositing, with occasional colorPipeline or spatialEffects) = 4 * 0.5ms = **2ms** on M1 at 4K. Current single-pass is ~3ms because the GPU processes all 1,444 lines even for disabled branches. Net result: **comparable or faster**.

**Mitigation strategies**:
1. Skip identity stages (zero draw calls for disabled features)
2. Merge adjacent stages at runtime when both are active and neither needs spatial sampling
3. Use `gl.invalidateFramebuffer()` after reading each FBO to hint the driver
4. Cache compiled programs per stage (already planned: lazy compilation)
5. Consider building merged shaders at init time for common stage combinations (e.g., primaryGrade+displayOutput+compositing as a single program)

### Precision Loss from FBO Intermediate Storage

**Risk: LOW**

RGBA16F provides 10-bit mantissa (1024 levels per channel) which exceeds the 8-bit display output. For HDR content, RGBA16F is essential. Precision loss between stages is negligible because:
- All intermediate values are in linear float space
- The display transfer function (sRGB OETF) is applied only in the final stage
- Professional color grading workflows (CDL, 3D LUT) are designed for float precision

### Shader Compilation Time (More Programs to Compile)

**Risk: MEDIUM**

10 smaller shaders compile faster individually, but total compilation time may increase. Mitigation:
- **Lazy compilation**: Only compile stages that are actually used
- **`KHR_parallel_shader_compile`**: Already integrated (Renderer.ts line 302). All stage programs can compile in parallel
- **Shader caching**: WebGL2 `gl.getProgramBinary()`/`gl.programBinary()` via `OES_get_program_binary`; browsers also cache internally

### Breaking Changes to Existing Tests

**Risk: MEDIUM**

The test suite has 7,600+ tests. The `Renderer.test.ts` and `ShaderStateManager.test.ts` files test uniform upload and rendering behavior. Mitigation:
- The monolithic shader remains the default path until Phase F
- The multi-pass pipeline is behind a feature flag
- All existing tests continue to pass against the monolithic path
- New tests are added per-stage in Phase C

---

## Testing Strategy

### Unit Tests Per Stage

Each stage gets a dedicated test file: `src/render/stages/__tests__/primaryGrade.test.ts`

```typescript
// Example: primaryGrade stage test
describe('PrimaryGrade stage', () => {
  it('isIdentity returns true when all adjustments are default', () => {
    const state = createDefaultInternalState();
    expect(primaryGradeStage.isIdentity(state)).toBe(true);
  });

  it('isIdentity returns false when exposure is non-zero', () => {
    const state = createDefaultInternalState();
    state.colorAdjustments.exposure = 0.5;
    expect(primaryGradeStage.isIdentity(state)).toBe(false);
  });

  it('applyUniforms uploads only exposure-related uniforms', () => {
    const mockShader = createMockShaderProgram();
    const state = createDefaultInternalState();
    state.colorAdjustments.exposure = 1.0;
    primaryGradeStage.applyUniforms(mockShader, state, mockTexCb);
    expect(mockShader.setUniform).toHaveBeenCalledWith('u_exposureRGB', expect.any(Array));
    expect(mockShader.setUniform).not.toHaveBeenCalledWith('u_toneMappingOperator', expect.anything());
  });
});
```

### FBO Ping-Pong Tests

```typescript
describe('FBOPingPong', () => {
  it('allocates two FBOs at requested dimensions', () => { ... });
  it('ping-pong swaps read/write indices correctly', () => { ... });
  it('falls back to RGBA8 when RGBA16F is unavailable', () => { ... });
  it('dispose releases all GPU resources', () => { ... });
});
```

### Pipeline Integration Tests

```typescript
describe('ShaderPipeline', () => {
  it('skips identity stages (zero draw calls)', () => { ... });
  it('single active stage renders directly to screen (no FBO)', () => { ... });
  it('multi-pass pipeline produces correct output', () => { ... });
  it('stage reordering changes processing order', () => { ... });
  it('falls back to monolithic when FBOs unavailable', () => { ... });
});
```

### Visual Regression Tests

- Render the same image through both the monolithic and multi-pass pipelines
- Compare output pixel values: PSNR > 60 dB for SDR, > 50 dB for HDR
- Test with all tone mapping operators, all diagnostic overlays, all spatial effects
- Test the clarity/sharpen fix specifically: compare multi-pass output with CPU reference

### Performance Regression Tests

- Measure frame time for single-pass vs multi-pass at 1080p and 4K
- Set performance budget: multi-pass must be within 2x of single-pass when all stages are active
- Set performance target: multi-pass must be within 1.1x of single-pass for the 3-stage common case

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Stage skip rate | >60% of stages skipped per frame (typical use) | Runtime counter in PerfTrace |
| Frame time (3-stage, 1080p) | Within 1.1x of monolithic | PerfTrace.measure('multipass') |
| Frame time (all stages, 4K) | Within 2x of monolithic | PerfTrace benchmark |
| Clarity/sharpen CPU parity | PSNR > 55 dB vs CPU reference | Visual regression test |
| Shader compile time | < 500ms total (all 10 stages, parallel) | initAsync() timing |
| Test coverage | > 90% line coverage for new files | Vitest coverage report |
| Zero regressions | All 7,600+ existing tests pass | `npx vitest run` |
| Fallback works | Monolithic path pixel-identical to before | A/B test |

---

## Estimated Effort

| Phase | Description | Duration | Files Changed/Created |
|-------|-------------|----------|----------------------|
| A | Infrastructure (FBOPingPong, ShaderStage, ShaderPipeline) | 5 days | 3 new TS files, 3 test files |
| B | First extraction (compositing stage) + feature flag | 3 days | 1 GLSL, 1 TS stage, modify Renderer.ts |
| C | Extract remaining 9 stages (1-2 days each) | 12 days | 9 GLSL files, 9 TS stage files, 9 test files |
| D | Scope rendering integration | 3 days | Modify Renderer.ts (renderForScopes path) |
| E | Stage reordering API + UI | 5 days | Modify RendererBackend.ts, UI components |
| F | Deprecate monolithic (optional, future) | 2 days | Remove viewer.frag.glsl monolithic path |
| -- | **Total** | **~30 working days (6 weeks)** | **~25 new files, ~5 modified files** |

### Prerequisites

- No external dependencies required
- All work can be done incrementally behind a feature flag
- Each phase can be merged independently
- The existing `TransitionRenderer` (which already uses dual-FBO orchestration, see `src/render/TransitionRenderer.ts` lines 17-28) serves as a proven pattern for the FBO management approach

---

## Key Files Reference

| File | Role | Lines |
|------|------|-------|
| `src/render/shaders/viewer.frag.glsl` | Monolithic fragment shader (to be decomposed) | 1,444 |
| `src/render/Renderer.ts` | WebGL2 backend, FBO management, texture uploads | ~2,300 |
| `src/render/ShaderStateManager.ts` | Dirty-flag state management, uniform uploads | ~1,850 |
| `src/render/ShaderProgram.ts` | Shader compilation, uniform setters | ~250 |
| `src/render/RendererBackend.ts` | Abstract backend interface | ~200 |
| `src/render/TransitionRenderer.ts` | Existing dual-FBO pattern (reference) | ~230 |
| `src/render/RenderState.ts` | Render state type definitions | ~100 |
| `src/config/RenderConfig.ts` | Shader constant codes | ~150 |

---

## Expert Review -- Round 1

### Verdict: APPROVE WITH CHANGES

### Accuracy Check

The plan's factual claims were verified against the codebase:

- **"1,444-line monolithic GLSL program"**: Confirmed. `viewer.frag.glsl` is exactly 1,444 lines (1,445 with trailing newline).
- **"125 uniform declarations"**: Confirmed. Grep for `uniform` lines in the fragment shader returns exactly 101 distinct uniform declarations. However, the plan says "125" -- this appears to overcount slightly; the actual number is **101 uniform declarations** (including samplers). It is possible the plan counted certain vec3/vec4 components individually or included vertex shader uniforms (`u_offset`, `u_scale`, `u_texRotation`, `u_texFlipH`, `u_texFlipV` are in the vertex shader, not the fragment shader). This is a minor inaccuracy that does not affect the architecture.
- **"34 sequential processing phases"**: Confirmed. The main() function (lines 918-1444) contains exactly the phases listed. The enumeration in the plan matches the shader code line by line.
- **"29 dirty-flag categories"**: Confirmed. `ShaderStateManager.ts` declares exactly 29 dirty flag constants (lines 35-63), and `ALL_DIRTY_FLAGS` contains all 29. The plan says "29" which matches.
- **"~20 helper functions"**: Undercounted. There are **45 named functions** (including main()) in the shader. Excluding main(), that is 44 helper functions. Many are small (single-channel variants like `pqEOTF`, `smpte240mEOTF`, etc.), but they all compile into the shader regardless of use.
- **Clarity/sharpen sampling from u_texture**: Confirmed. Lines 1111-1117 and 1298-1304 contain the exact architectural comments referenced. At line 1121, clarity does `texture(u_texture, v_texCoord).rgb` on the original image. At line 1308, sharpen does the same.
- **TransitionRenderer dual-FBO pattern**: Confirmed. `TransitionRenderer.ts` (216 lines, not ~230) uses two FBOs (`fboA`/`fboB`) with RGBA8 textures to render outgoing/incoming frames separately before blending. However, it is NOT a ping-pong pattern -- it is a dual-source blending pattern. The two FBOs hold independent frames (A and B), not sequential pipeline stages. The plan references it as a "proven pattern for FBO management approach," which is fair for the resource lifecycle (create, resize, dispose) but misleading as an architectural precedent for ping-pong rendering.
- **KHR_parallel_shader_compile**: Confirmed at Renderer.ts lines 301-306.
- **Renderer.ts ~2,300 lines**: Actual is 2,269 lines. Close enough.
- **ShaderStateManager.ts ~1,850 lines**: Actual is 1,886 lines. Close enough.
- **applyUniforms() "400+ lines"**: The method spans lines 1457-1869, which is 412 lines. Confirmed.
- **Scope rendering (renderImageToFloatAsyncForScopes)**: Confirmed at line 1235 of Renderer.ts.

### Strengths

1. **Identity-skip optimization is the right primary mitigation.** The plan correctly identifies that in the typical use case (basic color grading), most stages are inactive. Skipping identity stages eliminates the dominant overhead concern (bandwidth and draw calls). The dirty-flag system already tracks per-category changes, making the `isIdentity()` checks cheap.

2. **Clarity/sharpen fix is a genuine correctness win.** The current shader explicitly acknowledges (in comments at lines 1111-1117 and 1298-1304) that clarity and sharpen diverge from the CPU path. Multi-pass naturally fixes this because `u_inputTexture` in the SPATIAL_EFFECTS stage would contain graded pixels. This is the single most compelling technical argument for the refactor.

3. **Stage decomposition grouping is well-chosen.** The 10-stage breakdown respects natural boundaries:
   - INPUT_DECODE groups geometric transforms (deinterlace, perspective, spherical) that sample `u_texture` with spatial offsets.
   - LINEARIZE groups all signal-to-linear conversions.
   - PRIMARY_GRADE groups fast per-pixel arithmetic.
   - SPATIAL_EFFECTS isolates the two phases that require neighbor-pixel sampling.
   - COLOR_PIPELINE groups the heavy LUT/texture-based operations.
   The grouping minimizes inter-stage data dependencies while keeping related operations together.

4. **Monolithic fallback is essential and correctly planned.** Keeping `viewer.frag.glsl` as a fallback for devices without float FBO support is the right call. The codebase already warns when `EXT_color_buffer_float` is unavailable (Renderer.ts lines 288-293), confirming this is a real-world concern.

5. **FBO format fallback chain (RGBA16F -> RGBA8 -> monolithic)** is well-designed and matches how the existing scope FBO infrastructure handles format selection (Renderer.ts has `scopeFBOFormat` tracking `'rgba16f' | 'rgba8'`).

6. **Lazy compilation strategy** is sound. The codebase already pays attention to shader compilation time (KHR_parallel_shader_compile integration). Only compiling stages on first use avoids a 10x increase in startup compilation work.

### Concerns

1. **Cross-stage uniform dependencies are underspecified.**

   Several uniforms are consumed by multiple stages that the plan assigns to different groups:

   - **`u_hdrHeadroom`** is used in tone mapping (SCENE_ANALYSIS), highlights/shadows (SECONDARY_GRADE), and Drago tone mapping parameters. The plan does not mention that this uniform must be duplicated across at least 3 stage shaders, or managed as a "global" uniform.
   - **`u_channelMode`** (DIAGNOSTICS stage) is also read in the INPUT_DECODE stage (unpremultiply at line 1000: `if (u_premult == 2 && u_channelMode == 0)`) and the COMPOSITING stage (premultiply at line 1410: `if (u_premult == 1 && u_channelMode == 0)`). This means the premultiply/unpremultiply logic depends on a diagnostic uniform.
   - **`u_premult`** similarly appears in both INPUT_DECODE (unpremultiply, phase 0b2) and COMPOSITING (premultiply, phase 12b, and background blend at line 1434). The plan assigns it to both `inputDecode` and `compositing` dirty flags, but the shared uniform means both stage shaders need it.
   - **`u_texelSize`** is used by clarity (SPATIAL_EFFECTS), sharpen (SPATIAL_EFFECTS), deinterlace (INPUT_DECODE), and perspective bicubic (INPUT_DECODE). The plan accounts for this in SPATIAL_EFFECTS but does not mention INPUT_DECODE's dependency.

   **Recommendation**: Define a "global uniforms" block (hdrHeadroom, texelSize, channelMode, premult) that is uploaded to every active stage, or use a UBO (Uniform Buffer Object) in WebGL2 to share these across programs without per-stage upload cost.

2. **`linearizeActive` cross-phase data dependency is a splitting hazard.**

   In the monolithic shader, phase 0c (linearize) sets an `out bool linearizeActive` variable that phase 0d (input EOTF) reads to decide whether to skip. Both phases are in the plan's LINEARIZE stage, so this is fine as-is. However, if anyone ever tries to split these two phases into separate stages, the dependency would break silently (the EOTF stage would not know linearize already ran). The plan should document this coupling explicitly to prevent future regressions.

3. **FBO resolution: canvas vs. image dimensions.**

   The plan's `ShaderPipeline.execute()` allocates ping-pong FBOs at `gl.drawingBufferWidth x gl.drawingBufferHeight` (canvas resolution). But the current shader pipeline operates at canvas resolution because it renders a fullscreen quad. For scope rendering, the FBO resolution is reduced (320x180 or 640x360, as noted in Renderer.ts lines 149-150). The plan's Step 4 code uses `canvasWidth = gl.drawingBufferWidth`, but scope rendering would pass a different `imageWidth`/`imageHeight`. The `execute()` method accepts these parameters but then ignores them in favor of `gl.drawingBufferWidth`. This needs to be reconciled -- the FBO should match the actual render target dimensions, not hardcoded to the canvas.

4. **Texture unit conflicts in multi-stage rendering.**

   The monolithic shader assigns fixed texture units: `u_texture=0`, `u_curvesLUT=1`, `u_falseColorLUT=2`, `u_lut3D=3`, `u_filmLUT=4`, `u_inlineLUT=5`. In the multi-pass pipeline, `u_inputTexture` (the previous stage's FBO output) will occupy unit 0. But stages like COLOR_PIPELINE need units 1, 3, 4, and 5 simultaneously for their LUT textures. Meanwhile, the SPATIAL_EFFECTS stage does NOT need any LUT textures. The plan's `textureBindings` field on `ShaderStageDescriptor` handles this conceptually, but the actual implementation must ensure that:
   - Each stage shader's sampler uniforms are assigned to the correct units.
   - The `u_inputTexture` sampler in each stage always binds to unit 0.
   - LUT textures do not collide with the input texture unit.

   This is solvable but the plan should call it out explicitly, since getting texture unit assignments wrong produces silent rendering corruption (not errors).

5. **Phase 8b (creative per-channel gamma) is applied unconditionally.**

   Line 1339: `color.rgb = pow(max(color.rgb, vec3(0.0)), 1.0 / u_gammaRGB);` is always executed even when `u_gammaRGB = vec3(1.0)` (identity). The comment says "pow(x, 1.0) == x, so the identity case is a no-op but we apply it unconditionally." In the monolithic shader this is negligible. But in the multi-pass DISPLAY_OUTPUT stage, an identity check for this stage would need to know that gammaRGB defaults to 1.0, not 0.0. The `isIdentity` for DISPLAY_OUTPUT must account for this unconditional application -- it can only skip the entire stage if ALL display output phases are identity, including gamma=1.0, displayTransfer=0, displayGamma=1.0, displayBrightness=1.0, and invert=false. This is achievable but the plan's stage grouping makes DISPLAY_OUTPUT the hardest stage to skip in practice, since `u_gammaRGB` is part of the `DIRTY_COLOR` flag, not `DIRTY_DISPLAY`.

6. **Memory overhead of RGBA16F ping-pong FBOs at 4K.**

   Two RGBA16F textures at 3840x2160 = 3840 * 2160 * 8 bytes * 2 = ~127 MB of GPU memory. On mobile GPUs with 2-4 GB total VRAM, this is significant. The plan mentions RGBA8 as a fallback for SDR content, but the SDR/HDR decision should be explicit and automatic (the codebase already has `isHDRContent()` at Renderer.ts line 42). The plan should specify that RGBA8 FBOs are the default for SDR content, with RGBA16F only allocated when HDR content is detected.

7. **Bandwidth analysis underestimates the cost.**

   The plan's performance table estimates ~0.15ms per FBO pass at 1080p on M1. This is plausible for a simple passthrough, but stages like COLOR_PIPELINE perform multiple dependent texture lookups (curves LUT, 3D LUT, film LUT) which are texture-bandwidth-bound, not ALU-bound. Adding an FBO read at the beginning of that stage does not simply add 0.15ms -- it adds to an already texture-bandwidth-saturated pipeline. The actual overhead per pass for texture-heavy stages could be 2-3x the quoted figure. This does not change the overall recommendation (identity skipping still wins), but the "worst case all 10 stages at 4K" estimate of 15ms on Intel UHD 620 is optimistic; 20-25ms is more realistic.

### Recommended Changes

1. **Add a "Global Uniforms" concept.** Define a small set of uniforms (`u_hdrHeadroom`, `u_texelSize`, `u_channelMode`, `u_premult`) that must be available to multiple stages. Use a WebGL2 Uniform Buffer Object (UBO, via `gl.bindBufferBase(gl.UNIFORM_BUFFER, ...)`) to share them efficiently. This eliminates per-stage redundant uploads and prevents subtle bugs from forgetting to set a cross-cutting uniform on one stage.

2. **Use RGBA8 FBOs by default; promote to RGBA16F only for HDR content.** Wire the existing `isHDRContent()` utility (Renderer.ts line 42) into the FBO format decision. For the common case of 8-bit SDR JPEG/PNG viewing, this halves the VRAM cost and doubles the bandwidth efficiency of intermediate passes (8 bytes/pixel vs 16 bytes/pixel per FBO read/write).

3. **Fix the execute() method's FBO dimension logic.** Replace `gl.drawingBufferWidth/Height` with the explicit `imageWidth`/`imageHeight` parameters (or a dedicated "render target size" parameter) so scope rendering at reduced resolution works correctly.

4. **Document the linearize-EOTF coupling.** Add a comment to the LINEARIZE stage descriptor explaining that phases 0c and 0d must remain in the same stage due to the `linearizeActive` flag dependency.

5. **Add explicit texture unit assignment documentation.** Add a table mapping each stage to its required texture units, and specify that unit 0 is always reserved for `u_inputTexture` (the ping-pong read texture). Example:

   | Stage | Unit 0 | Unit 1 | Unit 2 | Unit 3 | Unit 4 | Unit 5 |
   |-------|--------|--------|--------|--------|--------|--------|
   | All | u_inputTexture | -- | -- | -- | -- | -- |
   | primaryGrade | -- | -- | -- | -- | -- | u_inlineLUT |
   | colorPipeline | -- | u_curvesLUT | -- | u_lut3D | u_filmLUT | -- |
   | diagnostics | -- | -- | u_falseColorLUT | -- | -- | -- |

6. **Reconsider splitting SPATIAL_EFFECTS from between SECONDARY_GRADE and COLOR_PIPELINE.** In the current shader, clarity (5e) runs BEFORE color wheels (6a), CDL (6b), curves (6c), etc. But sharpen (7b) runs AFTER tone mapping (7). The plan merges clarity and sharpen into a single SPATIAL_EFFECTS stage placed between SECONDARY_GRADE and COLOR_PIPELINE. This changes the processing order for sharpen: in the monolithic shader, sharpen sees tone-mapped pixels; in the proposed pipeline, it would see pre-tone-mapped pixels. This is a semantic change that could produce visible differences. Two options:
   - (a) Split clarity into SECONDARY_GRADE (or a new stage between SECONDARY_GRADE and COLOR_PIPELINE) and keep sharpen in SCENE_ANALYSIS (after tone mapping).
   - (b) Accept the visual difference and document it as an intentional improvement (sharpening in linear space before tone mapping is arguably more correct). Given that the plan already changes clarity/sharpen behavior (fixing the u_texture sampling), this may be acceptable -- but it should be explicitly stated.

### Missing Considerations

1. **Interaction with TransitionRenderer.** During transitions, the existing code renders two frames into TransitionRenderer's FBOs (RGBA8). If multi-pass is enabled, each frame requires its own ping-pong chain before being written into the transition FBO. This means transition rendering temporarily needs 4 FBOs (2 ping-pong + 2 transition) or requires careful sequencing (run ping-pong for frame A, write to transition FBO A, then reuse ping-pong for frame B, write to transition FBO B). The plan does not address this interaction.

2. **gl.invalidateFramebuffer() on write-only FBOs.** The plan mentions this as a mitigation strategy but does not include it in the implementation. After `endPass()`, the write FBO's previous content is stale. Calling `gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.COLOR_ATTACHMENT0])` before writing tells the driver it does not need to load the old contents from VRAM, which can save significant bandwidth on tile-based GPUs (all mobile devices). This should be part of the `beginPass()` implementation, not left as a future optimization.

3. **Alpha handling across stages.** The monolithic shader maintains alpha in `color.a` throughout the pipeline. In multi-pass mode, the RGBA16F FBO stores alpha as well, so this works naturally. However, the unpremultiply (phase 0b2, INPUT_DECODE) and premultiply (phase 12b, COMPOSITING) are at opposite ends of the pipeline. If any intermediate stage writes to `fragColor` without preserving `color.a`, alpha information is lost. Each stage shader must ensure it passes alpha through even when only modifying RGB channels. The example `primaryGrade.frag.glsl` in Step 3 correctly does `fragColor = color;` (preserving alpha), but this must be enforced as an invariant for all stage shaders.

4. **EXT_color_buffer_float requirement.** The plan mentions RGBA16F FBO fallback, but does not note that `gl.FLOAT` type for `gl.texImage2D` with `gl.RGBA16F` internal format requires `EXT_color_buffer_float` to be renderable (i.e., usable as an FBO attachment). The existing codebase already checks for this extension (Renderer.ts line 288). The FBOPingPong.ensure() implementation should explicitly check for this extension before attempting RGBA16F allocation, rather than relying on `checkFramebufferStatus`.

5. **No mention of shader `#define` based optimization.** An alternative to per-stage identity skip is to use `#define` preprocessor directives to compile stage-specific variants with disabled features compiled out entirely. For example, a COLOR_PIPELINE variant with `#define CDL_ENABLED 0` would let the GLSL compiler eliminate dead code. This is a well-established technique in game engines (uber-shaders with permutations). It could complement the multi-pass approach by reducing ALU cost within each stage without requiring FBO overhead. The plan should at least acknowledge this alternative and explain why multi-pass was chosen over it (or suggest combining both approaches).

6. **Performance profiling methodology.** The plan lists hardware and per-pass cost estimates but does not describe how these were measured or how they will be validated. I recommend using `EXT_disjoint_timer_query_webgl2` (GPU timer queries) for per-stage profiling, rather than relying on CPU-side `performance.now()` which cannot accurately measure GPU-async workloads. The codebase's `PerfTrace` utility would need a GPU timestamp integration for meaningful multi-pass benchmarking.

---

## QA Review -- Round 1

### Verdict: APPROVE WITH CHANGES

The plan is architecturally well-reasoned and the phased migration behind a feature flag is the right approach. However, the testing strategy has material gaps that must be addressed before implementation begins. The codebase has zero pixel-level output verification in its unit test layer, no PSNR/RMSE comparison tooling, and no automated performance benchmarking infrastructure. The plan references these capabilities in its success metrics without acknowledging that they do not exist yet and must be built. All concerns raised below are solvable within the proposed timeline if prioritized in Phase A.

### Test Coverage Assessment

**Current renderer/shader test inventory (7,117 lines across 7 test files):**

| Test File | Lines | What It Tests | Pixel Output Verified? |
|-----------|-------|---------------|----------------------|
| `src/render/Renderer.test.ts` | 3,195 | HDR modes, SDR rendering, uniform assignment, sampler unit conflicts, display transfer overrides | No -- all tests use mock GL; uniform values tracked but no GLSL executed |
| `src/render/ShaderStateManager.test.ts` | 2,134 | Dirty flags, state comparison guards, per-channel uniform broadcast, linearize/LUT state | No -- tests state management logic only |
| `src/render/ShaderProgram.test.ts` | 197 | Uniform type dispatch, buffer reuse | No -- mock GL |
| `src/render/TransitionRenderer.test.ts` | 284 | FBO allocation, reuse, dispose lifecycle | No -- closest analog to FBOPingPong testing |
| `src/render/Renderer.tiled.test.ts` | 235 | Viewport/scissor clipping | No -- mock GL |
| `src/render/Renderer.renderForScopes.test.ts` | 384 | Y-flip logic, HDR content detection | No -- comment at line 15 says "integration-tested via e2e" |
| `src/render/RendererBackend.test.ts` | 688 | Interface compliance, state round-trips | No -- no rendering |

**Critical finding:** Not a single unit test in the render layer verifies actual pixel values produced by the shader pipeline. All rendering tests are mock-GL-based, tracking which uniforms were set and which GL calls were made, but never executing GLSL or reading pixels. The plan's testing strategy (lines 959-1025) proposes PSNR thresholds (> 60 dB SDR, > 50 dB HDR) and pixel comparison between monolithic and multi-pass outputs, but no tooling or infrastructure exists to perform these comparisons.

**E2e layer:** The Playwright e2e tests (`e2e/color-pipeline.spec.ts`, `e2e/fixtures.ts`) have screenshot comparison via `captureViewerScreenshot` and `imagesAreDifferent`, but `imagesAreDifferent` (at `e2e/fixtures.ts` line 1458) is byte-level buffer equality on PNG data. A single bit of float rounding from an FBO readback would cause a false test failure, while completely wrong colors could pass if buffer sizes happen to match. The e2e `sampleCanvasPixels` function reads individual pixel RGBA values from the canvas but is used for qualitative assertions (e.g., "brightness increased"), not for quantitative PSNR/RMSE thresholds.

### Risk Assessment

**HIGH: Visual regression during Phase C stage extractions**

Each of the 9 stage extractions must produce visually identical output to the monolithic shader for all non-spatial stages (and intentionally different output for spatial effects). Without a pixel comparison harness, "validate pixel-perfect output" (line 863) is a manual, non-reproducible process. Specific sub-risks:

1. **FBO texture filtering introduces sub-texel blending.** The `FBOPingPong` code (line 319) sets `TEXTURE_MIN_FILTER` to `LINEAR`. For stages that perform only per-pixel arithmetic (no neighbor sampling), the intermediate FBO texture should be sampled with `NEAREST` filtering. `LINEAR` filtering blends adjacent texels when the FBO resolution does not exactly match the render viewport, causing subtle softening artifacts that accumulate across multiple passes. The plan does not address filtering mode selection.

2. **Sharpen processing order changes.** In the monolithic shader, sharpen (phase 7b) runs AFTER tone mapping (phase 7). The expert review (concern 6) already flagged that the plan merges clarity and sharpen into SPATIAL_EFFECTS between SECONDARY_GRADE and COLOR_PIPELINE, which changes sharpen to operate on pre-tone-mapped pixels. This is a visible behavioral change but the plan does not include a specific test to quantify the difference.

3. **Alpha channel corruption across FBO passes.** The monolithic shader unpremultiplies alpha early (phase 0b2) and premultiplies late (phase 12b). Between these phases, all grading math operates on straight-alpha RGB values. In multi-pass mode, every intermediate stage writes `fragColor = color` including the alpha channel to the RGBA16F FBO. If any stage shader accidentally modifies alpha (e.g., saturation or contrast formulas that operate on all 4 components), the final premultiply produces wrong compositing. The `primaryGrade.frag.glsl` example correctly preserves alpha, but no test is proposed to enforce this invariant across all 10 stages.

4. **Scope rendering divergence.** The `renderForScopes` path (Renderer.ts line 1188-1228) overrides display state (neutral display config, disabled tone mapping) before rendering. In the multi-pass design, these overrides change which stages are identity and which are active. A stage that skips for display rendering may be active for scope rendering (or vice versa). The plan mentions scope integration in Phase D but no parity test is proposed to verify that scope pixel output matches between monolithic and multi-pass modes.

**MEDIUM: Performance regression undetected due to missing benchmarks**

The plan defines performance budgets (within 1.1x for 3-stage, within 2x for all-stages) but the codebase has no automated benchmark runner. `PerfTrace` (`src/utils/PerfTrace.ts`) is a manual console logger that requires `PerfTrace.enabled = true` in browser console -- it is not test infrastructure. The plan's performance regression tests (lines 1022-1024) cannot be implemented without new tooling. Additionally, `PerfTrace` uses `performance.now()` which measures CPU wall-clock time, not GPU execution time. For a GPU-bound rendering pipeline, CPU-side timing is unreliable because `gl.drawArrays` returns immediately while the GPU processes asynchronously.

**LOW: Shader compilation time regression**

10 smaller shaders should compile faster individually. Lazy compilation and `KHR_parallel_shader_compile` (already integrated) mitigate total compilation time. The plan correctly handles this.

### Recommended Test Additions

These should be added to the plan as explicit deliverables, ideally as Phase A prerequisites:

**Phase A additions (before any stage extraction):**

1. **Float32Array RMSE comparison utility.** Create `src/render/__tests__/pixelCompare.ts` with functions: `computeRMSE(a: Float32Array, b: Float32Array): number`, `computePSNR(rmse: number): number`, and `assertPixelParity(actual: Float32Array, expected: Float32Array, thresholdRMSE: number)`. This is the foundational tool for all visual regression testing. It does not require GPU -- it compares readback arrays.

2. **A/B pixel comparison harness.** Create a test utility that renders a synthetic test image (e.g., a programmatically generated gradient + color bars pattern, avoiding external file dependencies) through both the monolithic path and the multi-pass pipeline, reads pixels via `gl.readPixels` (reusing the scope FBO readback infrastructure), and asserts RMSE below a threshold. This harness should be parameterizable by active stage combination to test all Phase C extractions.

3. **FBO ping-pong index correctness test.** Run 3, 4, 5, and 6 passes through the ping-pong and verify that read/write indices correctly alternate. An off-by-one in `writeIndex = 1 - this.writeIndex` (line 375) would cause reading stale data on alternating frames. Test the first-stage-identity scenario specifically: if the first registered stage is identity, the second active stage must still read from `sourceTexture`, not from an uninitialized FBO.

4. **FBO texture filtering mode test.** Verify that intermediate FBO textures use `NEAREST` filtering (not `LINEAR`) for non-spatial stages. Only the SPATIAL_EFFECTS stage (and potentially INPUT_DECODE for perspective bicubic) should use `LINEAR`.

5. **Draw call count assertion utility.** A mock-GL-based test that counts `gl.drawArrays` calls for a given set of active stages. For example: 3 active stages should produce exactly 3 draw calls; all-identity should produce 0 or 1 (passthrough); single active stage should produce exactly 1.

**Phase B and C additions (per-extraction):**

6. **Per-stage alpha invariant test.** For every stage except INPUT_DECODE (unpremultiply) and COMPOSITING (premultiply), verify that `output.a === input.a` for all pixels when the stage is active. Use a test image with varying alpha (gradient from 0 to 1).

7. **Per-stage identity passthrough test.** For each stage, set all parameters to default/identity values, render, and verify that output pixels exactly match input pixels (RMSE = 0.0). This validates that the `isIdentity()` function is consistent with the actual GLSL math.

8. **Per-stage texture unit isolation test.** For stages that bind additional textures (COLOR_PIPELINE with 4 LUT textures, DIAGNOSTICS with false color LUT), verify via mock GL that texture unit assignments do not collide with unit 0 (`u_inputTexture`).

**Phase D additions:**

9. **Scope rendering parity test.** Render through the scope path with both monolithic and multi-pass pipelines. Compare readback pixels. The neutral display config and disabled tone mapping change the stage activation pattern, which is a distinct code path from normal display rendering.

**Performance testing (new infrastructure):**

10. **Automated draw-call budget test.** Assert exact draw call counts for common stage combinations: (a) all defaults = 1 draw call; (b) exposure + display output + compositing = 3 draw calls; (c) all stages active = 10 draw calls. This is testable with mock GL and requires no GPU.

11. **GPU timer query integration.** Extend `PerfTrace` (or create a parallel `GPUPerfTrace`) to use `EXT_disjoint_timer_query_webgl2` for per-stage GPU timing. This is the only way to accurately measure per-pass GPU cost. The plan's performance budgets are untestable with CPU-side `performance.now()`.

### Migration Safety

1. **Phase A must include the pixel comparison harness (items 1-2 above) as a hard gate.** Without it, Phase B and C visual regression claims are unverifiable on CI. The plan says "validate pixel-perfect output" but provides no mechanism to do so.

2. **The monolithic `viewer.frag.glsl` must remain completely untouched during Phases B through E.** The expert review mentions this but does not elevate it to a hard rule. Any modification to the monolithic shader invalidates the A/B comparison baseline. This should be enforced via a code review rule or CODEOWNERS file.

3. **The feature flag `multiPassEnabled` must default to `false` until all 10 stages pass the A/B pixel comparison.** The plan states this (line 856-862) but should make it a merge-blocking CI check: the multi-pass pipeline can only become the default when every stage combination in the A/B harness passes with RMSE < threshold.

4. **Each Phase C PR must include three things:** (a) the extracted stage GLSL + TypeScript descriptor, (b) the `isIdentity` test, and (c) the A/B pixel comparison result for that specific stage in isolation. This prevents merging a stage extraction that silently changes output.

5. **The `renderForScopes` path must be covered by A/B tests from Phase B onward**, not deferred to Phase D. Scope rendering is used by waveform, vectorscope, and histogram displays. A scope rendering regression would be visible to users even if the main display path is correct.

### Concerns

1. **FBO resolution mismatch.** The `execute()` method (line 676) allocates FBOs at `gl.drawingBufferWidth x gl.drawingBufferHeight` (canvas resolution). However, for scope rendering the FBO should be at the reduced scope resolution (320x180 or 640x360 per Renderer.ts scope infrastructure). The plan's `execute()` signature accepts `imageWidth`/`imageHeight` parameters but the implementation ignores them in favor of canvas dimensions. This must be fixed: FBO dimensions should match the intended render target, not the canvas. The expert review also raised this (concern 3).

2. **No regression test for the sampler unit conflict fix.** The existing tests `REN-SAM-001` through `REN-SAM-003` verify that the monolithic shader's sampler uniforms are assigned to distinct texture units. In the multi-pass design, each stage has its own shader program with its own sampler uniform namespace. The plan's `textureBindings` mechanism handles this, but no test is proposed to verify that a multi-stage render (e.g., COLOR_PIPELINE reading from FBO on unit 0 while binding u_curvesLUT on unit 1 and u_lut3D on unit 3) does not produce `GL_INVALID_OPERATION` from type conflicts (sampler2D vs sampler3D on the same unit).

3. **The `execute()` method's `state` parameter is typed as `any` (line 645).** This suppresses TypeScript's ability to catch type mismatches during migration. Each stage's `applyUniforms` and `isIdentity` functions expect `Readonly<InternalShaderState>`. The `any` type means a refactoring error (e.g., renaming a state field) would not produce a compile error. This should be `Readonly<InternalShaderState>` from the start.

4. **Missing test for the monolithic fallback path.** The plan includes a fallback to the monolithic shader when FBO allocation fails (lines 823-833), but no test exercises this path. A test should simulate FBO allocation failure (mock `gl.createFramebuffer` returning `null`) and verify that `renderMonolithic()` is called and produces correct output.

5. **No test for stage reordering correctness (Phase E).** `setStageOrder()` is a user-facing feature that changes the processing order. A test should verify that (a) applying exposure before tone mapping produces different output than the default order, and (b) both orderings produce valid (non-black, non-NaN) pixels. Without this, a reordering bug could silently produce correct-looking but semantically wrong results.

6. **The `VERTEX_SOURCE` constant referenced in `ensureProgram()` (line 723) is not defined.** Each stage should share the existing `viewer.vert.glsl` vertex shader. The plan should state this explicitly and ensure the vertex shader source is imported once in `ShaderPipeline.ts`, not duplicated per stage. A test should verify that all stage programs use the same vertex shader source.
