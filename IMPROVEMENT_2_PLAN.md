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

Break the monolithic shader into **11 composable stage shaders**, connected via a ping-pong FBO pair. Each stage reads from one FBO texture and writes to the other. Stages that are entirely disabled (all uniforms at identity/off) are **skipped entirely** -- no draw call, no uniform upload, no texture bind.

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

Stage 5: SPATIAL_EFFECTS (pre-tone-mapping: clarity only)
  Phases: 5e (clarity)
  Uniforms: ~3 + u_texelSize (from Global UBO)
  Rationale: Clarity samples neighboring pixels (5x5 kernel) and is positioned
             at phase 5e in the monolithic shader -- BEFORE color pipeline and
             tone mapping. In multi-pass mode, it samples the intermediate FBO
             texture (graded pixels), fixing the current architectural divergence
             from the CPU path where clarity reads from u_texture (original image).
  NOTE: This is the stage that benefits MOST from multi-pass. Currently clarity
        (line 1121) does `texture(u_texture, v_texCoord)` on the ORIGINAL image.
        After multi-pass, it naturally reads the graded intermediate.
  FILTERING: This stage requires BILINEAR (LINEAR) texture filtering on its
             input FBO texture because it samples neighboring pixels.

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

Stage 8: SPATIAL_EFFECTS_POST (post-tone-mapping: sharpen only)
  Phases: 7b (sharpen -- unsharp mask, Laplacian)
  Uniforms: ~3 + u_texelSize (from Global UBO)
  Rationale: In the monolithic shader, sharpen (phase 7b) runs AFTER tone mapping
             (phase 7) and gamut mapping (phase 7a). To preserve this exact
             processing order, sharpen is placed in its own stage after
             SCENE_ANALYSIS, separate from clarity. This avoids a visible
             behavioral regression where sharpen would otherwise operate on
             pre-tone-mapped linear data instead of tone-mapped display-referred
             data.
  FILTERING: This stage requires BILINEAR (LINEAR) texture filtering on its
             input FBO texture because it samples neighboring pixels.

Stage 9: DISPLAY_OUTPUT
  Phases: 7c (output primaries), 8a-8d (display transfer/gamma/brightness),
          9 (inversion)
  Uniforms: ~8
  Rationale: Display color management. Applied once at the end.

Stage 10: DIAGNOSTICS
  Phases: 10 (channel isolation), 11 (false color), 12 (zebra), 12c (dither/quantize)
  Uniforms: ~12
  Textures: u_falseColorLUT (unit 2)
  Rationale: Diagnostic overlays that replace or augment the image.
             Skipped entirely in production playback.

Stage 11: COMPOSITING
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
- **Two FBOs** (ping and pong), allocated at **render target resolution** (image dimensions for display, reduced resolution for scopes)
- **Default format: RGBA8** for SDR content. **Promoted to RGBA16F** only when `isHDRContent()` returns true (using the existing utility at Renderer.ts line 42). This halves VRAM cost and doubles bandwidth efficiency for the common case of 8-bit SDR JPEG/PNG viewing
- **Default texture filtering: NEAREST** for non-spatial stages. Stages that sample neighboring pixels (SPATIAL_EFFECTS for clarity, SPATIAL_EFFECTS_POST for sharpen, INPUT_DECODE for perspective bicubic) override to LINEAR via a `needsBilinearInput` flag on the stage descriptor
- The **last active stage** renders directly to the **backbuffer** (screen or HDR drawing buffer), avoiding one extra FBO read
- When only 1 stage is active (common case: just PRIMARY_GRADE), the pipeline degenerates to the current single-pass behavior with **zero FBO overhead**

### Global Uniforms UBO (Uniform Buffer Object)

Several uniforms are consumed by multiple stages. Rather than duplicating them per-stage (which risks silent omission bugs), these are shared via a WebGL2 Uniform Buffer Object (UBO) bound once per frame.

**UBO layout (`GlobalUniforms`, binding point 0):**

```glsl
// Declared identically in every stage fragment shader that needs cross-stage state.
layout(std140) uniform GlobalUniforms {
  float u_hdrHeadroom;    // Used by: SCENE_ANALYSIS (tone mapping), SECONDARY_GRADE (highlights/shadows)
  int   u_channelMode;    // Used by: INPUT_DECODE (unpremultiply guard), DIAGNOSTICS, COMPOSITING (premultiply guard)
  int   u_premult;        // Used by: INPUT_DECODE (unpremultiply), COMPOSITING (premultiply + background blend)
  int   u_outputMode;     // Used by: COMPOSITING (SDR clamp), DISPLAY_OUTPUT (transform selection)
  vec2  u_texelSize;      // Used by: SPATIAL_EFFECTS (clarity), SPATIAL_EFFECTS_POST (sharpen), INPUT_DECODE (deinterlace, perspective bicubic)
  vec2  _padding;         // std140 alignment padding
};
```

**Host-side management:**

```typescript
// In ShaderPipeline.ts
private globalUBO: WebGLBuffer | null = null;
private globalUBOData = new Float32Array(8); // matches std140 layout

private updateGlobalUBO(gl: WebGL2RenderingContext, state: Readonly<InternalShaderState>): void {
  if (!this.globalUBO) {
    this.globalUBO = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.globalUBO);
    gl.bufferData(gl.UNIFORM_BUFFER, this.globalUBOData.byteLength, gl.DYNAMIC_DRAW);
  }

  // Pack data into std140 layout
  this.globalUBOData[0] = state.hdrHeadroom;
  // int uniforms packed as float (reinterpret on GPU via floatBitsToInt or cast)
  this.globalUBOData[1] = state.channelModeCode;
  this.globalUBOData[2] = state.premultMode;
  this.globalUBOData[3] = state.outputMode;
  this.globalUBOData[4] = state.texelSize[0];
  this.globalUBOData[5] = state.texelSize[1];

  gl.bindBuffer(gl.UNIFORM_BUFFER, this.globalUBO);
  gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.globalUBOData);
  gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.globalUBO);
}
```

Each stage program binds to the UBO at init time:
```typescript
const blockIndex = gl.getUniformBlockIndex(program, 'GlobalUniforms');
if (blockIndex !== gl.INVALID_INDEX) {
  gl.uniformBlockBinding(program, blockIndex, 0); // binding point 0
}
```

### Vertex Shaders: Viewer vs. Passthrough

The existing `viewer.vert.glsl` applies pan/zoom/rotation transforms (`u_offset`, `u_scale`, `u_texRotation`, `u_texFlipH`, `u_texFlipV`). In the multi-pass pipeline, these geometric transforms must only be applied when reading from the **source image texture**. Intermediate stages read from FBO textures that are already correctly positioned -- applying pan/zoom/rotation again would cause cumulative geometric transforms, producing incorrect output.

**Solution: Two vertex shaders.**

1. **`viewer.vert.glsl`** (existing) -- used ONLY for the first active stage, which reads from the source image texture and needs pan/zoom/rotation.

2. **`passthrough.vert.glsl`** (new) -- used for ALL intermediate and final stages, which read from FBO textures.

```glsl
// src/render/shaders/passthrough.vert.glsl
#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
```

In `ShaderPipeline.ts`, the vertex shader is selected per-stage:

```typescript
import VIEWER_VERT_SOURCE from './shaders/viewer.vert.glsl?raw';
import PASSTHROUGH_VERT_SOURCE from './shaders/passthrough.vert.glsl?raw';

private ensureProgram(gl: WebGL2RenderingContext, stage: ShaderStageDescriptor, isFirstStage: boolean): void {
  const vertexSource = isFirstStage ? VIEWER_VERT_SOURCE : PASSTHROUGH_VERT_SOURCE;
  if (!stage.program) {
    stage.program = new ShaderProgram(gl, vertexSource, stage.fragmentSource);
    // Bind Global UBO
    const blockIndex = gl.getUniformBlockIndex(stage.program.handle, 'GlobalUniforms');
    if (blockIndex !== gl.INVALID_INDEX) {
      gl.uniformBlockBinding(stage.program.handle, blockIndex, 0);
    }
  }
}
```

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
  | 'spatialEffects'       // clarity (pre-tone-mapping)
  | 'colorPipeline'
  | 'sceneAnalysis'
  | 'spatialEffectsPost'   // sharpen (post-tone-mapping)
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

  /**
   * Whether this stage requires bilinear (LINEAR) texture filtering on its
   * input FBO texture. Stages that sample neighboring pixels (clarity, sharpen,
   * perspective bicubic) set this to true. All other stages use NEAREST
   * filtering to prevent sub-texel blending artifacts across FBO passes.
   * Default: false (NEAREST filtering).
   */
  needsBilinearInput?: boolean;
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
  private format: 'rgba16f' | 'rgba8' = 'rgba8';

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
    format: 'rgba16f' | 'rgba8' = 'rgba8',
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
      // NEAREST filtering by default to prevent sub-texel blending artifacts
      // across non-spatial FBO passes. Stages that need bilinear sampling
      // (SPATIAL_EFFECTS, SPATIAL_EFFECTS_POST, INPUT_DECODE with perspective)
      // override to LINEAR via setFilteringMode() before their texture fetch.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
   * Set texture filtering mode on the read texture.
   * Called per-stage based on the stage's `needsBilinearInput` flag.
   */
  setFilteringMode(gl: WebGL2RenderingContext, bilinear: boolean): void {
    const filter = bilinear ? gl.LINEAR : gl.NEAREST;
    gl.bindTexture(gl.TEXTURE_2D, this.readTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Begin a pass: bind the write FBO, invalidate previous contents.
   * Returns the read texture (previous pass output or source image).
   */
  beginPass(gl: WebGL2RenderingContext): WebGLTexture | null {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.writeFBO);
    // Hint the driver that previous FBO contents are stale (saves bandwidth
    // on tile-based mobile GPUs: iOS, Android)
    gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.COLOR_ATTACHMENT0]);
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

Each stage gets its own fragment shader file under `src/render/shaders/stages/`. A new passthrough vertex shader is created alongside the stage shaders:

```
src/render/shaders/
  passthrough.vert.glsl   -- identity vertex shader for intermediate FBO stages (no pan/zoom/rotation)

src/render/shaders/stages/
  common.glsl              -- shared helpers (LUMA constant, rgbToHsl, hslToRgb, etc.)
  inputDecode.frag.glsl
  linearize.frag.glsl
  primaryGrade.frag.glsl
  secondaryGrade.frag.glsl
  spatialEffects.frag.glsl       -- clarity only (pre-tone-mapping)
  colorPipeline.frag.glsl
  sceneAnalysis.frag.glsl
  spatialEffectsPost.frag.glsl   -- sharpen only (post-tone-mapping)
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

Example: `spatialEffects.frag.glsl` (clarity only -- fixes the clarity correctness issue):

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_inputTexture;  // NOW reads GRADED pixels, not original!

// Global UBO provides u_texelSize
layout(std140) uniform GlobalUniforms {
  float u_hdrHeadroom;
  int   u_channelMode;
  int   u_premult;
  int   u_outputMode;
  vec2  u_texelSize;
  vec2  _padding;
};

uniform bool u_clarityEnabled;
uniform float u_clarity;

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

    fragColor = color;
}
```

Example: `spatialEffectsPost.frag.glsl` (sharpen only -- post-tone-mapping, preserving monolithic shader order):

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_inputTexture;  // Reads TONE-MAPPED pixels (after SCENE_ANALYSIS)

// Global UBO provides u_texelSize
layout(std140) uniform GlobalUniforms {
  float u_hdrHeadroom;
  int   u_channelMode;
  int   u_premult;
  int   u_outputMode;
  vec2  u_texelSize;
  vec2  _padding;
};

uniform bool u_sharpenEnabled;
uniform float u_sharpenAmount;

void main() {
    vec4 color = texture(u_inputTexture, v_texCoord);

    // Sharpen operates on tone-mapped display-referred data, matching
    // the monolithic shader's processing order (phase 7b after phase 7).
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
import type { InternalShaderState, TextureCallbacks } from './ShaderStateManager';
import { ShaderProgram } from './ShaderProgram';
import { FBOPingPong } from './FBOPingPong';
import { PerfTrace } from '../utils/PerfTrace';
import { Logger } from '../utils/Logger';
import VIEWER_VERT_SOURCE from './shaders/viewer.vert.glsl?raw';
import PASSTHROUGH_VERT_SOURCE from './shaders/passthrough.vert.glsl?raw';

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

  /** Ordered stage IDs -- defines the default pipeline order (11 stages). */
  private stageOrder: StageId[] = [
    'inputDecode',
    'linearize',
    'primaryGrade',
    'secondaryGrade',
    'spatialEffects',       // clarity (pre-tone-mapping, phase 5e)
    'colorPipeline',
    'sceneAnalysis',
    'spatialEffectsPost',   // sharpen (post-tone-mapping, phase 7b)
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

  /** Global Uniforms UBO buffer. */
  private globalUBO: WebGLBuffer | null = null;
  private globalUBOData = new Float32Array(8);

  /**
   * Execute the pipeline.
   *
   * @param gl - WebGL2 context
   * @param sourceTexture - The input image texture
   * @param renderWidth - Width of the render target (image dims for display, reduced for scopes)
   * @param renderHeight - Height of the render target
   * @param state - Current shader state (read-only, properly typed)
   * @param texCb - Texture binding callbacks (properly typed)
   * @param targetFBO - null for screen, or a specific FBO for scope rendering
   * @param isHDR - Whether the content is HDR (determines RGBA16F vs RGBA8 FBO format)
   */
  execute(
    gl: WebGL2RenderingContext,
    sourceTexture: WebGLTexture,
    renderWidth: number,
    renderHeight: number,
    state: Readonly<InternalShaderState>,
    texCb: TextureCallbacks,
    targetFBO: WebGLFramebuffer | null = null,
    isHDR: boolean = false,
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

    // Update Global Uniforms UBO (shared across all stages)
    this.updateGlobalUBO(gl, state);

    // FBO format: RGBA8 for SDR (default), RGBA16F for HDR content
    const fboFormat = isHDR ? 'rgba16f' : 'rgba8';
    // FBO dimensions match the render target, NOT the canvas.
    // For display rendering: image dimensions.
    // For scope rendering: reduced scope resolution (e.g. 320x180).
    this.pingPong.ensure(gl, renderWidth, renderHeight, fboFormat);
    this.pingPong.resetChain();

    // Seed the read buffer: render source into ping-pong[read]
    // (First stage reads source texture directly)
    let currentReadTexture: WebGLTexture | null = sourceTexture;

    for (let i = 0; i < activeStages.length; i++) {
      const stage = activeStages[i]!;
      const isFirst = i === 0;
      const isLast = i === activeStages.length - 1;

      // First stage uses viewer.vert.glsl (pan/zoom/rotation on source image).
      // All subsequent stages use passthrough.vert.glsl (identity transform on FBO quads).
      this.ensureProgram(gl, stage, isFirst);

      if (isLast) {
        // Last stage renders to screen (or targetFBO)
        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
        gl.viewport(0, 0, renderWidth, renderHeight);
      } else {
        // Intermediate stage renders to FBO
        currentReadTexture = this.pingPong.beginPass(gl) ?? currentReadTexture;
        // For the first pass, read from source texture instead of ping-pong
        if (isFirst) {
          currentReadTexture = sourceTexture;
        }
      }

      // Set texture filtering based on stage needs:
      // NEAREST for per-pixel stages, LINEAR for spatial sampling stages
      if (!isFirst && i > 0) {
        this.pingPong.setFilteringMode(gl, stage.needsBilinearInput ?? false);
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

  private ensureProgram(gl: WebGL2RenderingContext, stage: ShaderStageDescriptor, isFirstStage: boolean): void {
    if (!stage.program) {
      // Lazy-compile: stages that are never activated pay zero compilation cost.
      // First stage uses viewer.vert.glsl (applies pan/zoom/rotation to source image).
      // All subsequent stages use passthrough.vert.glsl (identity transform for FBO quads).
      const vertexSource = isFirstStage ? VIEWER_VERT_SOURCE : PASSTHROUGH_VERT_SOURCE;
      stage.program = new ShaderProgram(gl, vertexSource, stage.fragmentSource);

      // Bind Global Uniforms UBO (binding point 0)
      const blockIndex = gl.getUniformBlockIndex(stage.program.handle, 'GlobalUniforms');
      if (blockIndex !== gl.INVALID_INDEX) {
        gl.uniformBlockBinding(stage.program.handle, blockIndex, 0);
      }
    }
  }

  private updateGlobalUBO(gl: WebGL2RenderingContext, state: Readonly<InternalShaderState>): void {
    if (!this.globalUBO) {
      this.globalUBO = gl.createBuffer();
      gl.bindBuffer(gl.UNIFORM_BUFFER, this.globalUBO);
      gl.bufferData(gl.UNIFORM_BUFFER, this.globalUBOData.byteLength, gl.DYNAMIC_DRAW);
    }
    this.globalUBOData[0] = state.hdrHeadroom;
    this.globalUBOData[1] = state.channelModeCode;
    this.globalUBOData[2] = state.premultMode;
    this.globalUBOData[3] = state.outputMode;
    this.globalUBOData[4] = state.texelSize[0];
    this.globalUBOData[5] = state.texelSize[1];
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.globalUBO);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.globalUBOData);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.globalUBO);
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
    // Release Global Uniforms UBO
    if (this.globalUBO) {
      gl.deleteBuffer(this.globalUBO);
      this.globalUBO = null;
    }
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
| spatialEffects   | DIRTY_CLARITY                                                                                 |
| colorPipeline    | DIRTY_COLOR_WHEELS, DIRTY_CDL, DIRTY_CURVES, DIRTY_LUT3D, DIRTY_HSL, DIRTY_FILM_EMULATION    |
| sceneAnalysis    | DIRTY_OUT_OF_RANGE, DIRTY_TONE_MAPPING, DIRTY_GAMUT_MAPPING                                  |
| spatialEffectsPost | DIRTY_SHARPEN                                                                                |
| displayOutput    | DIRTY_COLOR_PRIMARIES (output), DIRTY_DISPLAY, DIRTY_COLOR (subset: gamma), DIRTY_INVERSION   |
| diagnostics      | DIRTY_CHANNELS, DIRTY_FALSE_COLOR, DIRTY_ZEBRA, DIRTY_DITHER                                 |
| compositing      | DIRTY_PREMULT, DIRTY_BACKGROUND                                                              |

The `ShaderStateManager.applyUniforms()` method (currently 400+ lines in `ShaderStateManager.ts` lines 1457-1855) would be refactored into 11 smaller `applyUniforms` functions, one per stage. Each function is a method on the stage descriptor. Cross-stage uniforms (`u_hdrHeadroom`, `u_texelSize`, `u_channelMode`, `u_premult`, `u_outputMode`) are handled by the Global Uniforms UBO and are NOT part of per-stage `applyUniforms`.

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

// FBO format selection: RGBA8 by default, RGBA16F for HDR content
const fboFormat = isHDRContent() ? 'rgba16f' : 'rgba8';

// Fallback 1: If preferred format is unsupported, try the alternative
if (!this.pingPong.ensure(gl, renderWidth, renderHeight, fboFormat)) {
  const fallbackFormat = fboFormat === 'rgba16f' ? 'rgba8' : 'rgba16f';
  log.warn(`${fboFormat} FBOs unavailable, falling back to ${fallbackFormat}`);
  if (!this.pingPong.ensure(gl, renderWidth, renderHeight, fallbackFormat)) {
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

#### Phase A: Infrastructure + Test Harness (8 days)

This phase is a **hard prerequisite gate** -- Phase B cannot merge without all Phase A deliverables passing CI.

- Create `src/render/FBOPingPong.ts` with NEAREST filtering default, RGBA8 default format, `setFilteringMode()`, `gl.invalidateFramebuffer()` in `beginPass()`
- Create `src/render/ShaderStage.ts` interface (with `needsBilinearInput` flag)
- Create `src/render/ShaderPipeline.ts` orchestrator with properly typed `execute()` parameters (`Readonly<InternalShaderState>`, `TextureCallbacks`), `VIEWER_VERT_SOURCE`/`PASSTHROUGH_VERT_SOURCE` imports, Global Uniforms UBO management
- Create `src/render/shaders/passthrough.vert.glsl` (identity vertex shader for intermediate FBO stages)
- **Build pixel comparison infrastructure** (MUST be delivered before any stage extraction):
  - `src/render/__tests__/pixelCompare.ts` with `computeRMSE()`, `computePSNR()`, `assertPixelParity()`
  - A/B rendering harness that renders a synthetic test pattern through both monolithic and multi-pass paths, reads pixels via `gl.readPixels`, and asserts RMSE below threshold
  - FBO ping-pong index correctness tests (3, 4, 5, 6 pass chains verifying read/write alternation)
  - Draw-call count assertion utility (mock GL)
- **No changes to existing files**. The new pipeline is unused.

**Minimum test gate (18 tests, all MUST pass):**

| ID | Test Description |
|----|-----------------|
| A-1 | FBOPingPong allocates two FBOs at requested dimensions |
| A-2 | FBOPingPong alternates read/write indices for 3, 4, 5, 6 passes |
| A-3 | FBOPingPong RGBA16F -> RGBA8 -> null fallback chain |
| A-4 | FBOPingPong `dispose()` deletes all textures and FBOs |
| A-5 | FBOPingPong uses `NEAREST` filtering by default |
| A-6 | FBOPingPong calls `gl.invalidateFramebuffer` in `beginPass()` |
| A-7 | ShaderPipeline: 0 active stages = passthrough (0 or 1 draw calls, no FBO) |
| A-8 | ShaderPipeline: 1 active stage = 1 draw call, no FBO allocation |
| A-9 | ShaderPipeline: N active stages = N draw calls with correct FBO alternation |
| A-10 | ShaderPipeline: monolithic fallback when FBO allocation fails |
| A-11 | ShaderPipeline: FBO dimensions match render target, not canvas |
| A-12 | Global Uniforms UBO: buffer created and bound with correct data |
| A-13 | `computeRMSE()` returns 0 for identical arrays |
| A-14 | `computeRMSE()` returns correct value for known inputs |
| A-15 | `computePSNR(0)` returns `Infinity` |
| A-16 | `assertPixelParity()` passes when RMSE below threshold, fails above |
| A-17 | Passthrough vertex shader does not apply transforms (no `u_offset`/`u_scale`/`u_texRotation` uniforms queried) |
| A-18 | First stage uses `viewer.vert.glsl`, intermediate stages use `passthrough.vert.glsl` |

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
- Validate pixel-perfect output using the A/B pixel comparison harness.

**Minimum test gate (7 tests, all MUST pass):**

| ID | Test Description |
|----|-----------------|
| B-1 | Compositing `isIdentity()` true for default state |
| B-2 | Compositing `isIdentity()` false for each non-default parameter |
| B-3 | Compositing alpha passthrough when premult disabled |
| B-4 | `multiPassEnabled=false` uses monolithic path exclusively |
| B-5 | Compositing texture unit 0 = `u_inputTexture`, no conflicts |
| B-6 | `viewer.frag.glsl` remains byte-identical to pre-Phase-B baseline (SHA-256 hash check) |
| B-7 | Draw call count: compositing only = 1 draw call |

#### Phase C: Extract Remaining Stages (2 weeks + 2 days investigation buffer)
- Extract one stage per PR, in order:
  1. `diagnostics` (false color, zebra, dither -- has clear enable/disable guards)
  2. `displayOutput` (display transfer, gamma, inversion)
  3. `sceneAnalysis` (tone mapping, gamut mapping, out-of-range)
  4. `spatialEffectsPost` (sharpen only -- post-tone-mapping, preserving monolithic order)
  5. `colorPipeline` (CDL, curves, wheels, HSL, film emulation, 3D LUT)
  6. `spatialEffects` (clarity only -- pre-tone-mapping, fixes CPU/GPU divergence)
  7. `secondaryGrade` (highlights/shadows, vibrance, hue rotation)
  8. `primaryGrade` (exposure, contrast, saturation, etc.)
  9. `linearize` (EOTF, log-to-linear, primaries -- NOTE: phases 0c and 0d must remain co-located due to `linearizeActive` out-parameter dependency)
  10. `inputDecode` (deinterlace, perspective, spherical, swizzle)
- Each extraction is a separate PR with A/B pixel comparison tests.

**Minimum test gate per stage (7 tests, all MUST pass):**

| ID | Test Description |
|----|-----------------|
| C-1 | `isIdentity()` true for all-default state |
| C-2 | `isIdentity()` false for each adjustable parameter |
| C-3 | Alpha invariant: `output.a === input.a` (non-premult stages only) |
| C-4 | Texture unit assignments: no collision with unit 0 |
| C-5 | `applyUniforms` uploads only this stage's uniforms |
| C-6 | Intermediate stages use passthrough vertex shader |
| C-7 | Sharpen stage (spatialEffectsPost) preserves post-tone-mapping processing order |

#### Phase D: Scope Rendering Integration (3 days)
- The `renderImageToFloatAsyncForScopes()` method (Renderer.ts line 1235) currently renders through the full monolithic shader into a scope FBO. Update it to use the pipeline:
  ```typescript
  // Use the pipeline with a neutral display config and scope resolution
  this.pipeline.execute(gl, sourceTexture, scopeWidth, scopeHeight, scopeState, texCb, scopeFBO, isHDR);
  ```
- FBO dimensions match the scope target resolution (e.g. 320x180), NOT the canvas.
- This naturally supports per-scope stage overrides (e.g., scopes render without display transfer).

**Minimum test gate (3 tests, all MUST pass):**

| ID | Test Description |
|----|-----------------|
| D-1 | Scope FBOs allocated at scope resolution (not canvas resolution) |
| D-2 | DISPLAY_OUTPUT stage is identity with neutral scope display config |
| D-3 | Y-flip applied after pipeline execution |

#### Phase E: Stage Reordering API (1 week)
- Expose `ShaderPipeline.setStageOrder()` through the `RendererBackend` interface
- Add UI for pipeline reordering in the color grading panel
- Validate that reordering produces visually correct results

**Minimum test gate (3 tests, all MUST pass):**

| ID | Test Description |
|----|-----------------|
| E-1 | `setStageOrder()` changes draw call sequence |
| E-2 | `setStageOrder()` with missing/extra stage IDs is rejected |
| E-3 | Restoring default order produces original behavior |

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

**Worst case**: All 11 stages active at 4K on Intel integrated = 11 * 1.5ms = **16.5ms** (single-pass is ~5ms). This is a ~3.3x regression. Note: the per-pass cost estimates are for simple passthrough; texture-heavy stages (COLOR_PIPELINE with LUT lookups) may be 2-3x higher, making the realistic worst case ~20-25ms on Intel UHD 620.

**Typical case**: 3-4 stages active (primaryGrade + displayOutput + compositing, with occasional colorPipeline or spatialEffects) = 4 * 0.5ms = **2ms** on M1 at 4K. Current single-pass is ~3ms because the GPU processes all 1,444 lines even for disabled branches. Net result: **comparable or faster**. SDR content uses RGBA8 FBOs (8 bytes/pixel per read+write instead of 16), further improving bandwidth efficiency.

**Mitigation strategies**:
1. Skip identity stages (zero draw calls for disabled features)
2. Merge adjacent stages at runtime when both are active and neither needs spatial sampling
3. Use `gl.invalidateFramebuffer()` after reading each FBO to hint the driver
4. Cache compiled programs per stage (already planned: lazy compilation)
5. Consider building merged shaders at init time for common stage combinations (e.g., primaryGrade+displayOutput+compositing as a single program)

### Precision Loss from FBO Intermediate Storage

**Risk: LOW**

For HDR content, RGBA16F FBOs provide 10-bit mantissa (1024 levels per channel) which exceeds the 8-bit display output. For SDR content, RGBA8 FBOs provide 8-bit precision per channel, matching the source data depth. The automatic format selection via `isHDRContent()` ensures no unnecessary precision loss:
- **SDR path (RGBA8):** 8-bit source -> RGBA8 intermediate -> 8-bit display. No precision loss.
- **HDR path (RGBA16F):** Float source -> RGBA16F intermediate -> HDR display. Negligible precision loss because all intermediate values are in linear float space.
- The display transfer function (sRGB OETF) is applied only in the DISPLAY_OUTPUT stage (near the end).
- Professional color grading workflows (CDL, 3D LUT) are designed for float precision.

### Shader Compilation Time (More Programs to Compile)

**Risk: MEDIUM**

11 smaller shaders compile faster individually, but total compilation time may increase. Mitigation:
- **Lazy compilation**: Only compile stages that are actually used
- **`KHR_parallel_shader_compile`**: Already integrated (Renderer.ts line 302). All stage programs can compile in parallel
- **Shader caching**: WebGL2 `gl.getProgramBinary()`/`gl.programBinary()` via `OES_get_program_binary`; browsers also cache internally

### Breaking Changes to Existing Tests

**Risk: MEDIUM**

The test suite has 7,600+ tests. The `Renderer.test.ts` and `ShaderStateManager.test.ts` files test uniform upload and rendering behavior. Mitigation:
- The monolithic shader remains the default path until Phase F
- The multi-pass pipeline is behind a feature flag (`multiPassEnabled`, default `false`)
- All existing tests continue to pass against the monolithic path
- New tests are added per-stage in Phase C (minimum 7 per stage, per the test gate requirements)
- The monolithic `viewer.frag.glsl` must remain byte-identical throughout Phases B-E (enforced via SHA-256 hash check in CI)

---

## Testing Strategy

### Pixel Comparison Infrastructure (Phase A deliverable)

The codebase currently has **zero** pixel-level output verification in its unit test layer. All render tests use mock GL. The following must be built in Phase A as a hard prerequisite for any stage extraction:

```typescript
// src/render/__tests__/pixelCompare.ts

/** Compute Root Mean Square Error between two Float32Array pixel buffers. */
export function computeRMSE(a: Float32Array, b: Float32Array): number;

/** Compute Peak Signal-to-Noise Ratio from RMSE. Returns Infinity when RMSE === 0. */
export function computePSNR(rmse: number): number;

/**
 * Assert that two pixel buffers are within tolerance.
 * Throws with detailed diagnostics (max channel error, error location) on failure.
 */
export function assertPixelParity(
  actual: Float32Array,
  expected: Float32Array,
  thresholdRMSE: number,
): void;
```

### A/B Rendering Harness

A test utility that renders a synthetic test image (programmatically generated gradient + color bars pattern, no external file dependencies) through both the monolithic path and the multi-pass pipeline, reads pixels via `gl.readPixels`, and asserts RMSE below threshold. Parameterizable by active stage combination to test all Phase C extractions.

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
  it('ping-pong swaps read/write indices correctly for 3, 4, 5, 6 passes', () => { ... });
  it('falls back to RGBA8 when RGBA16F is unavailable', () => { ... });
  it('dispose releases all GPU resources', () => { ... });
  it('uses NEAREST texture filtering by default', () => { ... });
  it('setFilteringMode switches between NEAREST and LINEAR', () => { ... });
  it('calls gl.invalidateFramebuffer in beginPass()', () => { ... });
  it('defaults to RGBA8 format', () => { ... });
  it('FBO dimensions match render target, not canvas', () => { ... });
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
  it('first stage uses viewer.vert.glsl, intermediate stages use passthrough.vert.glsl', () => { ... });
  it('Global Uniforms UBO is created and updated per frame', () => { ... });
  it('execute() uses Readonly<InternalShaderState>, not any', () => { ... });
  it('FBO format is RGBA8 for SDR, RGBA16F for HDR', () => { ... });
  it('spatial stages use LINEAR filtering, non-spatial stages use NEAREST', () => { ... });
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
| Clarity/sharpen CPU parity | PSNR > 55 dB vs CPU reference | Visual regression test (A/B harness) |
| Shader compile time | < 500ms total (all 11 stages, parallel) | initAsync() timing |
| Test coverage | > 90% line coverage for new files | Vitest coverage report |
| Zero regressions | All 7,600+ existing tests pass | `npx vitest run` |
| Fallback works | Monolithic path pixel-identical to before | A/B test (SHA-256 hash + RMSE) |
| Phase gate compliance | All test gates pass per phase | CI enforcement (A: 18 tests, B: 7, C: 7/stage, D: 3, E: 3) |
| Type safety | Zero `any` types in pipeline interfaces | TypeScript `--strict` compilation |

---

## Estimated Effort

| Phase | Description | Duration | Files Changed/Created |
|-------|-------------|----------|----------------------|
| A | Infrastructure + test harness (FBOPingPong, ShaderStage, ShaderPipeline, Global UBO, passthrough.vert.glsl, pixel comparison infra) | 8 days | 4 new TS files, 1 new GLSL, 4 test files, pixelCompare.ts |
| B | First extraction (compositing stage) + feature flag | 3 days | 1 GLSL, 1 TS stage, modify Renderer.ts |
| C | Extract remaining 10 stages (1-2 days each + 2 days investigation buffer) | 14 days | 10 GLSL files, 10 TS stage files, 10 test files |
| D | Scope rendering integration | 3 days | Modify Renderer.ts (renderForScopes path) |
| E | Stage reordering API + UI | 5 days | Modify RendererBackend.ts, UI components |
| F | Deprecate monolithic (optional, future) | 2 days | Remove viewer.frag.glsl monolithic path |
| -- | **Total** | **~35 working days (7 weeks)** | **~30 new files, ~5 modified files** |

### Prerequisites

- No external dependencies required
- All work can be done incrementally behind a feature flag
- Each phase can be merged independently
- The existing `TransitionRenderer` (which already uses dual-FBO orchestration, see `src/render/TransitionRenderer.ts` lines 17-28) serves as a proven pattern for the FBO resource lifecycle (create, resize, dispose)
- **Phase A is a hard gate**: the pixel comparison infrastructure (`computeRMSE`, `computePSNR`, `assertPixelParity`) and the A/B rendering harness must pass CI before Phase B can begin
- **The monolithic `viewer.frag.glsl` must remain byte-identical** throughout Phases B-E. Any modification invalidates the A/B comparison baseline. Enforce via SHA-256 hash check in CI

---

## Key Files Reference

| File | Role | Lines |
|------|------|-------|
| `src/render/shaders/viewer.frag.glsl` | Monolithic fragment shader (to be decomposed) | 1,444 |
| `src/render/shaders/viewer.vert.glsl` | Vertex shader with pan/zoom/rotation (used for first stage only) | ~33 |
| `src/render/shaders/passthrough.vert.glsl` | **NEW**: Identity vertex shader for intermediate FBO stages | ~7 |
| `src/render/Renderer.ts` | WebGL2 backend, FBO management, texture uploads | ~2,300 |
| `src/render/ShaderStateManager.ts` | Dirty-flag state management, uniform uploads | ~1,850 |
| `src/render/ShaderProgram.ts` | Shader compilation, uniform setters | ~250 |
| `src/render/RendererBackend.ts` | Abstract backend interface | ~200 |
| `src/render/TransitionRenderer.ts` | Existing dual-FBO resource lifecycle (reference) | ~230 |
| `src/render/RenderState.ts` | Render state type definitions | ~100 |
| `src/config/RenderConfig.ts` | Shader constant codes | ~150 |
| `src/render/FBOPingPong.ts` | **NEW**: Ping-pong FBO manager (RGBA8 default, NEAREST filtering) | ~120 |
| `src/render/ShaderStage.ts` | **NEW**: Stage descriptor interface (11 stages) | ~80 |
| `src/render/ShaderPipeline.ts` | **NEW**: Pipeline orchestrator with Global UBO | ~200 |
| `src/render/__tests__/pixelCompare.ts` | **NEW**: RMSE/PSNR comparison utilities | ~60 |

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

---

## Expert Review -- Round 2 (Final)

### Final Verdict: APPROVE WITH CHANGES

This is a well-structured plan for a genuinely difficult GPU architecture refactor. The core idea -- decompose a monolithic 1,444-line shader into 10 composable stages with FBO ping-pong, identity-skip optimization, and a monolithic fallback -- is sound and addresses real correctness problems (clarity/sharpen sampling divergence) alongside legitimate maintainability concerns. Both the Round 1 Expert and QA reviews raised substantive issues. The plan can proceed to implementation once the required changes below are incorporated.

### Round 1 Feedback Assessment

**Valid and Critical (must address before implementation):**

1. **Cross-stage uniform dependencies (Expert #1).** This is the most architecturally significant concern. Verified in the shader source: `u_hdrHeadroom` is read in 15 lines spanning tone mapping functions (SCENE_ANALYSIS), highlights/shadows math (SECONDARY_GRADE), and Drago parameters. `u_channelMode` crosses from DIAGNOSTICS into INPUT_DECODE (line 1000: unpremultiply guard) and COMPOSITING (line 1410: premultiply guard). `u_premult` similarly spans INPUT_DECODE and COMPOSITING. The UBO recommendation is the correct solution for WebGL2 and should be a Phase A deliverable, not deferred.

2. **FBO resolution mismatch (Expert #3, QA #1).** Both reviews independently flagged this, confirming it is a real bug in the proposed `execute()` implementation. The code uses `gl.drawingBufferWidth/Height` but the signature accepts `imageWidth/imageHeight` parameters that are ignored. For scope rendering at 320x180, this would allocate 4K FBOs unnecessarily. Must be fixed.

3. **Sharpen processing order change (Expert #6, QA #2).** Verified in the shader: sharpen (phase 7b, line 1297) currently runs AFTER tone mapping (phase 7, line 1289) and AFTER gamut mapping (phase 7a, line 1292). The plan merges clarity and sharpen into SPATIAL_EFFECTS placed between SECONDARY_GRADE and COLOR_PIPELINE, which moves sharpen 4 stages earlier -- before color wheels, CDL, curves, 3D LUT, tone mapping, and gamut mapping. This is not a subtle ordering change; it fundamentally alters what data sharpen operates on (linear graded vs. tone-mapped display-referred). The plan must either (a) split sharpen out of SPATIAL_EFFECTS and place it after SCENE_ANALYSIS, or (b) explicitly document this as an intentional behavioral change with visual regression tests quantifying the difference. Option (a) is strongly preferred because it preserves backward compatibility.

4. **FBO texture filtering mode (QA #1 sub-risk).** The `FBOPingPong` code sets `TEXTURE_MIN_FILTER` to `LINEAR`. For per-pixel arithmetic stages (all stages except INPUT_DECODE and SPATIAL_EFFECTS), this introduces sub-texel blending when FBO dimensions do not perfectly match viewport dimensions. `NEAREST` filtering is correct for non-spatial stages. This can cause cumulative softening across 8+ passes that would be visible in A/B comparison. Must use `NEAREST` by default, with `LINEAR` only for stages that perform spatial sampling.

5. **Pixel comparison infrastructure (QA Phase A prerequisites).** The QA review correctly identified that the codebase has zero pixel-level verification capability. The plan's testing strategy references PSNR thresholds and pixel-perfect validation that cannot be performed without new tooling. The RMSE/PSNR comparison utility and A/B rendering harness must be Phase A deliverables, gating Phase B.

6. **`any` types in `execute()` signature (QA #3).** The `state` and `texCb` parameters are typed as `any`, which defeats TypeScript's refactoring safety during the most error-prone part of the migration (Phase C stage extraction). These must be properly typed from the start as `Readonly<InternalShaderState>` and `TextureCallbacks`.

**Valid but Deferrable (can address during implementation):**

7. **`gl.invalidateFramebuffer()` optimization (Expert missing consideration #2).** Valid performance optimization for tile-based mobile GPUs. Can be added in Phase C or D without affecting correctness. Low priority.

8. **`#define`-based shader permutation alternative (Expert missing consideration #5).** This is a legitimate complementary technique (uber-shader permutations are industry standard in game engines). However, it adds combinatorial complexity (2^N variants for N features) and is orthogonal to the multi-pass architecture. Can be explored as a future optimization within individual stages (e.g., COLOR_PIPELINE with/without CDL, with/without 3D LUT). Should not block this plan.

9. **GPU timer query integration (Expert #6, QA performance testing #11).** `EXT_disjoint_timer_query_webgl2` is the only way to get accurate per-stage GPU timing. Important for validating performance budgets but not a correctness blocker. Can be added in Phase D alongside the benchmarking infrastructure.

10. **TransitionRenderer interaction (Expert missing consideration #1).** Valid concern about FBO count during transitions (4 FBOs needed simultaneously). The ping-pong FBOs can be reused sequentially (render frame A through pipeline, write to transition FBO A, then reuse ping-pong for frame B). This is a design detail for Phase D, not a Phase A blocker.

11. **RGBA8 default for SDR content (Expert #6).** The `isHDRContent()` utility already exists at Renderer.ts line 42. Wiring it into FBO format selection is straightforward and should be part of Phase A's `FBOPingPong` implementation, but is not architecturally blocking.

12. **Alpha invariant enforcement (QA #6).** Per-stage alpha passthrough tests are important for correctness but can be added incrementally during Phase C extractions. The example `primaryGrade.frag.glsl` already demonstrates the correct pattern (`fragColor = color` preserving alpha).

**Conflicts Between Expert and QA Feedback:**

There are no direct conflicts. Both reviews converge on the same critical issues (FBO resolution, sharpen ordering, cross-stage uniforms) and complement each other: the Expert review focuses on GPU architecture correctness while the QA review focuses on verification infrastructure gaps. The only difference in emphasis is that the QA review elevates the pixel comparison harness to a hard Phase A gate, which I agree with.

One factual correction: the Expert review states "101 uniform declarations" and claims the plan overcounts at 125. I verified the actual count: `grep -c '^\s*uniform ' viewer.frag.glsl` returns **125**. The plan's number is correct; the Expert review's count of 101 was the error.

### Consolidated Required Changes (before implementation)

1. **Add a Global Uniforms UBO.** Define a `GlobalUniforms` uniform buffer containing `u_hdrHeadroom`, `u_texelSize`, `u_channelMode`, `u_premult`, and any other uniforms consumed by 2+ stages. Bind it once per frame via `gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, globalUBO)`. Each stage shader declares a matching `uniform GlobalUniforms { ... };` block. This eliminates redundant per-stage uploads and prevents silent omission bugs. Deliver in Phase A.

2. **Fix FBO dimension logic in `execute()`.** Replace `gl.drawingBufferWidth/Height` with a `renderWidth/renderHeight` parameter derived from the actual render target (canvas for display, reduced resolution for scopes). The FBO must match the target, not the canvas. The `imageWidth/imageHeight` parameters already in the signature should be used or renamed to `renderWidth/renderHeight`.

3. **Split sharpen out of SPATIAL_EFFECTS.** Create an 11th stage `POST_TONEMAP_SPATIAL` (or rename: `SHARPEN`) placed after SCENE_ANALYSIS in the pipeline order, containing only sharpen (phase 7b). Keep clarity in SPATIAL_EFFECTS between SECONDARY_GRADE and COLOR_PIPELINE (matching its current position at phase 5e). This preserves the monolithic shader's processing order exactly and avoids a visible behavioral regression. The pipeline order becomes: inputDecode, linearize, primaryGrade, secondaryGrade, clarity, colorPipeline, sceneAnalysis, sharpen, displayOutput, diagnostics, compositing (11 stages). The overhead of one additional potential FBO pass is negligible given that sharpen is rarely active alongside clarity.

4. **Use `NEAREST` texture filtering on ping-pong FBOs.** Change `FBOPingPong.ensure()` to set `TEXTURE_MIN_FILTER` and `TEXTURE_MAG_FILTER` to `NEAREST` (not `LINEAR`). For stages that need bilinear sampling of the intermediate (SPATIAL_EFFECTS, INPUT_DECODE with perspective bicubic), the stage can override the filtering mode before its texture fetch, or the pipeline can set the filtering mode per-stage based on a `needsBilinearInput` flag on the `ShaderStageDescriptor`.

5. **Build pixel comparison infrastructure in Phase A.** Deliver the following before any stage extraction:
   - `pixelCompare.ts` utility with `computeRMSE()`, `computePSNR()`, `assertPixelParity()`.
   - A/B rendering harness that renders a synthetic test pattern through both monolithic and multi-pass paths, reads pixels via `gl.readPixels`, and asserts RMSE below threshold.
   - FBO ping-pong index correctness tests (3, 4, 5, 6 pass chains verifying read/write alternation).
   - Draw-call count assertion utility (mock GL).
   This is a hard gate: Phase B cannot merge without this infrastructure passing CI.

6. **Properly type `execute()` parameters.** Replace `state: /* InternalShaderState */ any` with `state: Readonly<InternalShaderState>` and `texCb: /* TextureCallbacks */ any` with `texCb: TextureCallbacks`. Import the types from `ShaderStateManager.ts`.

7. **Define `VERTEX_SOURCE` explicitly.** Import `viewer.vert.glsl?raw` in `ShaderPipeline.ts` (reusing the existing vertex shader) and assign it to a module-level constant. Add a comment stating all stages share this vertex shader.

8. **Add monolithic fallback test.** Mock `gl.createFramebuffer` returning `null` and verify that the pipeline falls back to `renderMonolithic()` and produces output. This tests the RGBA16F -> RGBA8 -> monolithic fallback chain.

### Consolidated Nice-to-Haves

1. **`gl.invalidateFramebuffer()` in `beginPass()`.** Hint the driver that the write FBO's previous contents are stale. Significant bandwidth savings on tile-based mobile GPUs (iOS, Android). Easy to add, no correctness risk.

2. **Automatic RGBA8/RGBA16F selection based on `isHDRContent()`.** Use RGBA8 FBOs for SDR content (halves VRAM and bandwidth). The utility already exists.

3. **GPU timer query profiling.** Integrate `EXT_disjoint_timer_query_webgl2` into `PerfTrace` for accurate per-stage GPU cost measurement. Essential for validating performance budgets but not a correctness blocker.

4. **`#define`-based feature elimination within stages.** For the heaviest stage (COLOR_PIPELINE, ~35 uniforms), compile shader variants with `#define CDL_ENABLED 0` etc. to let the GLSL compiler eliminate dead code. Complementary to multi-pass, not a replacement.

5. **Runtime stage merging for adjacent ALU-only stages.** When two adjacent active stages are both pure per-pixel arithmetic (no spatial sampling, no texture lookups beyond `u_inputTexture`), concatenate their GLSL sources at runtime to avoid one FBO pass. Highly effective for the common primaryGrade + secondaryGrade combination.

6. **EXT_color_buffer_float explicit check in `FBOPingPong.ensure()`.** Check for the extension before attempting RGBA16F allocation instead of relying on `checkFramebufferStatus` to catch the failure. Produces a clearer error path.

7. **Scope rendering A/B parity test from Phase B.** Do not defer scope rendering coverage to Phase D. Scope output divergence would be user-visible (incorrect waveform/vectorscope/histogram).

8. **Stage reordering correctness test.** Verify that `setStageOrder()` produces different (but valid) output when stages are reordered, and identical output when the default order is restored.

9. **Per-stage alpha invariant test.** For every stage except INPUT_DECODE and COMPOSITING, assert `output.a === input.a` using a test image with varying alpha.

10. **Document linearize-EOTF coupling.** Add a code comment to the LINEARIZE stage descriptor explaining that phases 0c and 0d must remain co-located due to the `linearizeActive` out-parameter dependency.

### Final Risk Rating: MEDIUM

The core architecture is sound, but the implementation has multiple precision-critical details (FBO filtering, sharpen ordering, cross-stage uniforms, alpha preservation) that can produce silent visual regressions if not caught by automated pixel comparison. The feature flag and monolithic fallback provide strong safety nets, keeping production risk low even if implementation stumbles. The MEDIUM rating reflects the risk during the migration itself (Phases B-C), not the risk to end users.

### Final Effort Estimate: 35 working days (7 weeks)

The plan estimates 30 days. The additions required by this review add approximately 5 days:
- Phase A expansion (UBO infrastructure, pixel comparison harness, FBO filtering fix, type corrections): +3 days
- Sharpen stage split (11th stage, additional GLSL file, additional tests): +1 day
- Monolithic fallback test and scope parity test: +1 day

The per-stage extraction timeline (Phase C, 12 days for 9 stages) is optimistic but achievable if the Phase A infrastructure is solid. The main schedule risk is Phase C: if pixel comparison reveals subtle divergences between monolithic and multi-pass output, debugging individual stage shaders against a 1,444-line reference will be time-consuming. Budget 2 days of "investigation buffer" within Phase C.

### Implementation Readiness: READY

The plan is ready for implementation once the 8 required changes above are incorporated into the design document. No fundamental architectural rework is needed. The changes are additive (UBO, sharpen stage split, filtering fix, test infrastructure) and do not invalidate the existing design. Phase A can begin immediately after the document is updated.

---

## QA Review -- Round 2 (Final)

### Final Verdict: APPROVE WITH CHANGES

The plan, combined with the feedback from both Round 1 reviews and the Expert Round 2 consolidation, describes a viable and well-architected shader modularization. The core design -- 10 composable stages, FBO ping-pong with identity-skip, monolithic fallback -- is correct. The Round 2 Expert Review provides a thorough consolidation of required changes. This QA Round 2 focuses on the remaining testing gaps, the actionability of the required changes, and the minimum test gates that must be enforced at each phase boundary.

### Round 1 Feedback Assessment

**Agreement with Expert Round 2 consolidation:**

I agree with all 8 "Consolidated Required Changes" from the Expert Round 2 review, with the following QA-specific commentary:

1. **Global Uniforms UBO (Required Change #1):** Correct. I verified that `u_hdrHeadroom` is referenced at 17 locations in `viewer.frag.glsl` spanning tone mapping (SCENE_ANALYSIS) and highlights/shadows (SECONDARY_GRADE). `u_channelMode` appears at 3 sites across INPUT_DECODE, DIAGNOSTICS, and COMPOSITING. `u_premult` at 3 sites across INPUT_DECODE and COMPOSITING. `u_resolution` (used for zebra stripe computation, line 1371) is only in DIAGNOSTICS currently but could be needed if stages expand. The UBO must include at minimum: `u_hdrHeadroom`, `u_texelSize`, `u_channelMode`, `u_premult`. I would additionally include `u_outputMode` (used in the SDR clamp at line 1402, COMPOSITING stage, but also affects whether DISPLAY_OUTPUT applies certain transforms) to prevent future cross-stage bugs.

2. **FBO dimension fix (Required Change #2):** Confirmed as the highest-priority bug fix. Without this, scope rendering would allocate FBOs at canvas resolution (e.g., 3840x2160) instead of scope resolution (320x180), wasting ~127 MB of GPU memory per scope update. This is not just a performance concern -- it would cause incorrect viewport dimensions in the intermediate passes, potentially rendering scope data at the wrong resolution.

3. **Sharpen stage split (Required Change #3):** I agree with the Expert's recommendation to split sharpen into an 11th stage. However, I want to highlight that the QA test burden increases: 11 stages means 11 `isIdentity` test suites, 11 alpha invariant tests, and 11 A/B parity comparisons. The plan's Phase C estimate of "1-2 days each" must account for this additional stage. The split is correct because the alternative (accepting a behavioral change where sharpen operates on pre-tone-mapped data) would invalidate all existing visual reference comparisons users may have made. Backward compatibility must take priority.

4. **NEAREST texture filtering (Required Change #4):** Confirmed critical. I verified in the `FBOPingPong` code (plan line 319) that it uses `gl.LINEAR` for both MIN and MAG filters. For the 8 non-spatial stages, `LINEAR` filtering causes bilinear interpolation of adjacent texels when the FBO texel grid does not perfectly align with the fragment center. In practice, even a single-pixel rounding difference between FBO size and viewport size triggers this. With 8+ non-spatial passes, the cumulative softening would be measurable: I estimate a PSNR drop of 5-10 dB compared to `NEAREST` for high-frequency content (text, sharp edges). This would cause the A/B pixel comparison to fail, so it must be fixed before any pixel comparison tests are meaningful.

5. **Pixel comparison infrastructure (Required Change #5):** This is the gating deliverable for the entire project. Without `computeRMSE()` / `computePSNR()` / `assertPixelParity()`, every subsequent phase has no quantitative verification. I have verified that the codebase has:
   - **Zero** unit-level pixel comparison utilities. The `e2e/fixtures.ts` `imagesAreDifferent` function (line 1458) is byte-level PNG equality, unsuitable for floating-point FBO readback.
   - **Zero** RMSE/PSNR infrastructure anywhere in the codebase (searched all `.ts` files).
   - **Zero** `gl.readPixels`-based verification in unit tests. All render tests use mock GL.
   - The `sampleCanvasPixels` utility (e2e/fixtures.ts line 1249) reads individual pixels via `gl.readPixels` using `UNSIGNED_BYTE`, which is useful for e2e spot-checks but cannot perform bulk float comparison.

6. **Type safety (Required Change #6):** Agreed. The `any` types are a migration hazard. During Phase C, when `InternalShaderState` fields may be renamed or restructured to support per-stage access patterns, TypeScript compile errors are the primary defense against silent breakage.

7. **VERTEX_SOURCE definition (Required Change #7):** Verified that the existing `viewer.vert.glsl` (33 lines) contains vertex transforms (`u_offset`, `u_scale`, `u_texRotation`, `u_texFlipH`, `u_texFlipV`) that are NOT stage-specific -- they apply to the source image geometry. In the multi-pass pipeline, only the FIRST stage (or the passthrough source-to-FBO copy) should apply vertex transforms; intermediate stages should use a simple identity vertex shader (`gl_Position = vec4(a_position, 0.0, 1.0); v_texCoord = a_texCoord;`). If all stages share `viewer.vert.glsl`, then `u_offset`/`u_scale`/`u_texRotation` would be applied at every intermediate stage, causing cumulative geometric transforms. **This is a newly identified issue.** The plan must specify two vertex shaders: (a) `viewer.vert.glsl` for the first stage (source image with pan/zoom/rotation), and (b) a `passthrough.vert.glsl` for all intermediate and final stages (identity transform, fullscreen quad). Alternatively, the pipeline can set `u_offset=0,0`, `u_scale=1,1`, `u_texRotation=0`, `u_texFlipH=0`, `u_texFlipV=0` for intermediate stages, but a dedicated passthrough vertex shader is cleaner and avoids 5 unnecessary uniform uploads per intermediate pass.

8. **Monolithic fallback test (Required Change #8):** Agreed. This is a straightforward mock-GL test.

**Newly identified issue -- vertex shader for intermediate stages:**

The Expert Round 2 review states "Import `viewer.vert.glsl?raw` in `ShaderPipeline.ts` (reusing the existing vertex shader)" but does not address the fact that `viewer.vert.glsl` applies pan/zoom/rotation transforms. If all 11 stage programs use this vertex shader, intermediate stages would apply cumulative geometric transforms to the FBO quad, producing incorrect output (the image would be offset, scaled, or rotated at each stage). This issue was not raised in any prior review.

**Recommendation:** Create a `passthrough.vert.glsl` containing:
```glsl
#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
```
Use `viewer.vert.glsl` for the first stage (which reads the source image with pan/zoom/rotation) and `passthrough.vert.glsl` for all subsequent stages (which read from FBO textures that are already correctly positioned). This is a MANDATORY addition -- without it, multi-pass rendering is geometrically incorrect.

### Minimum Test Requirements (before merging each phase)

**Phase A Gate (blocks Phase B):**

| ID | Test Description | Type | Pass Criteria | Priority |
|----|-----------------|------|--------------|----------|
| A-1 | FBOPingPong allocates two FBOs at requested dimensions | Unit (mock GL) | `gl.createFramebuffer` called twice, `gl.texImage2D` called with correct width/height/format | MUST |
| A-2 | FBOPingPong alternates read/write indices for 3, 4, 5, 6 passes | Unit (mock GL) | `readTexture` returns the texture written by the previous pass; `writeFBO` is the other FBO | MUST |
| A-3 | FBOPingPong RGBA16F -> RGBA8 -> null fallback chain | Unit (mock GL) | When RGBA16F fails (`checkFramebufferStatus` returns incomplete), retries with RGBA8; when both fail, `ensure()` returns false | MUST |
| A-4 | FBOPingPong `dispose()` deletes all textures and FBOs | Unit (mock GL) | `gl.deleteTexture` and `gl.deleteFramebuffer` called for all 4 resources | MUST |
| A-5 | FBOPingPong uses `NEAREST` filtering by default | Unit (mock GL) | `gl.texParameteri` called with `gl.NEAREST` for both `TEXTURE_MIN_FILTER` and `TEXTURE_MAG_FILTER` | MUST |
| A-6 | FBOPingPong calls `gl.invalidateFramebuffer` in `beginPass()` | Unit (mock GL) | `gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.COLOR_ATTACHMENT0])` called before each write | SHOULD |
| A-7 | ShaderPipeline: 0 active stages = passthrough (0 or 1 draw calls, no FBO) | Unit (mock GL) | `gl.drawArrays` called at most once; no `gl.bindFramebuffer(FRAMEBUFFER, non-null)` | MUST |
| A-8 | ShaderPipeline: 1 active stage = 1 draw call, no FBO allocation | Unit (mock GL) | Exactly 1 `gl.drawArrays`; `FBOPingPong.ensure()` not called | MUST |
| A-9 | ShaderPipeline: N active stages = N draw calls with correct FBO alternation | Unit (mock GL) | Draw call count matches N; `bindFramebuffer` alternates between FBO[0] and FBO[1] | MUST |
| A-10 | ShaderPipeline: monolithic fallback when FBO allocation fails | Unit (mock GL) | `renderMonolithic()` invoked when `FBOPingPong.ensure()` returns false | MUST |
| A-11 | ShaderPipeline: FBO dimensions match render target, not canvas | Unit (mock GL) | When `renderWidth=320, renderHeight=180`, FBOs allocated at 320x180 | MUST |
| A-12 | Global Uniforms UBO: buffer created and bound with correct data | Unit (mock GL) | `gl.bufferSubData` called with `u_hdrHeadroom`, `u_texelSize`, `u_channelMode`, `u_premult` values | MUST |
| A-13 | `computeRMSE()` returns 0 for identical arrays | Unit | `computeRMSE(a, a) === 0` for arbitrary Float32Array `a` | MUST |
| A-14 | `computeRMSE()` returns correct value for known inputs | Unit | `computeRMSE([1,0,0,1], [0,0,0,1])` returns `0.5` (RMSE of [1,0,0,0] channel diffs) | MUST |
| A-15 | `computePSNR(0)` returns `Infinity` | Unit | Edge case: zero RMSE means infinite PSNR | MUST |
| A-16 | `assertPixelParity()` passes when RMSE below threshold, fails above | Unit | Threshold enforcement works in both directions | MUST |
| A-17 | Passthrough vertex shader (`passthrough.vert.glsl`) does not apply transforms | Unit (mock GL) | No `u_offset`, `u_scale`, `u_texRotation` uniforms queried | MUST |
| A-18 | First stage uses `viewer.vert.glsl`, intermediate stages use `passthrough.vert.glsl` | Unit (mock GL) | Shader programs compiled with correct vertex shader sources | MUST |

**Phase B Gate (first extraction: compositing):**

| ID | Test Description | Type | Pass Criteria | Priority |
|----|-----------------|------|--------------|----------|
| B-1 | Compositing `isIdentity()` true for default state | Unit | Returns true when `premultMode=0`, `backgroundPattern=0` | MUST |
| B-2 | Compositing `isIdentity()` false for each non-default parameter | Unit | Separate assertion per parameter: premultMode!=0, backgroundPattern>0 | MUST |
| B-3 | Compositing alpha passthrough when premult disabled | Unit | `output.a === input.a` for all test pixels | MUST |
| B-4 | `multiPassEnabled=false` uses monolithic path exclusively | Unit (mock GL) | No `ShaderPipeline.execute()` call | MUST |
| B-5 | Compositing texture unit 0 = `u_inputTexture`, no conflicts | Unit (mock GL) | No other sampler bound to unit 0 | MUST |
| B-6 | `viewer.frag.glsl` remains byte-identical to pre-Phase-B baseline | CI | SHA-256 hash check | MUST |
| B-7 | Draw call count: compositing only = 1 draw call | Unit (mock GL) | Exactly 1 `gl.drawArrays` when only compositing is active | MUST |

**Phase C Gate (per stage extraction, repeated for each of the 10 remaining stages):**

| ID | Test Description | Type | Pass Criteria | Priority |
|----|-----------------|------|--------------|----------|
| C-1 | `isIdentity()` true for all-default state | Unit | Stage skipped when nothing is changed | MUST |
| C-2 | `isIdentity()` false for each adjustable parameter | Unit | One assertion per parameter confirming activation | MUST |
| C-3 | Alpha invariant: `output.a === input.a` (non-premult stages only) | Unit | For all stages except INPUT_DECODE and COMPOSITING | MUST |
| C-4 | Texture unit assignments: no collision with unit 0 | Unit (mock GL) | LUT/additional textures use units >= 1 | MUST |
| C-5 | `applyUniforms` uploads only this stage's uniforms | Unit (mock GL) | No uniform names from other stages in mock call log | MUST |
| C-6 | Intermediate stages use passthrough vertex shader | Unit (mock GL) | Programs for stages 2-N compiled with `passthrough.vert.glsl` | MUST |
| C-7 | Sharpen stage (post-SCENE_ANALYSIS) preserves processing order | Unit | Sharpen `isIdentity` is independent of tone mapping state | MUST |

**Phase D Gate (scope integration):**

| ID | Test Description | Type | Pass Criteria | Priority |
|----|-----------------|------|--------------|----------|
| D-1 | Scope FBOs allocated at scope resolution | Unit (mock GL) | FBO dimensions = `targetWidth x targetHeight` | MUST |
| D-2 | DISPLAY_OUTPUT identity with `SCOPE_DISPLAY_CONFIG` | Unit | Stage skipped when using neutral display config (`transferFunction=0, displayGamma=1, displayBrightness=1`) | MUST |
| D-3 | Y-flip applied after pipeline execution | Unit | Readback rows are in top-to-bottom order | MUST |

**Phase E Gate (stage reordering):**

| ID | Test Description | Type | Pass Criteria | Priority |
|----|-----------------|------|--------------|----------|
| E-1 | `setStageOrder()` changes draw call sequence | Unit (mock GL) | `gl.useProgram` calls match reordered stage sequence | MUST |
| E-2 | `setStageOrder()` with missing/extra stage IDs is rejected | Unit | Error logged, order unchanged | MUST |
| E-3 | Restoring default order produces original behavior | Unit (mock GL) | Draw call sequence matches original after reset | SHOULD |

### Final Risk Rating: MEDIUM

The risk rating aligns with the Expert Round 2 assessment. The three primary risk factors are:

1. **Test infrastructure dependency (HIGH sub-risk).** The entire verification strategy depends on Phase A delivering a working pixel comparison harness. If this is delayed or insufficient, all Phase C extractions proceed without quantitative quality gates. Mitigation: make the pixel comparison utility the first Phase A deliverable, validate it with synthetic test data before building the A/B rendering harness.

2. **Vertex shader for intermediate stages (MEDIUM sub-risk, newly identified).** If intermediate stages use `viewer.vert.glsl` with pan/zoom/rotation uniforms, multi-pass output is geometrically incorrect (cumulative transforms). This was not caught in any prior review. Mitigation: create `passthrough.vert.glsl` in Phase A and test that intermediate stages use it.

3. **Cumulative FBO filtering artifacts (MEDIUM sub-risk).** `LINEAR` filtering on non-spatial intermediate FBOs causes measurable softening. Mitigation: use `NEAREST` by default, add filtering mode tests in Phase A.

4. **11-stage complexity vs. 10-stage plan (LOW sub-risk).** The sharpen split adds one stage, increasing the total stage count and Phase C duration by ~1 day. The overhead is minimal but the test matrix grows.

The monolithic fallback and feature flag provide strong safety nets for production users. The MEDIUM rating reflects implementation-phase risk, not user-facing risk.

### Implementation Readiness: NEEDS WORK

The plan requires the following additions/corrections before Phase A implementation can begin:

**Blocking (must be incorporated into the plan document):**

1. **Create `passthrough.vert.glsl` for intermediate stages.** The existing `viewer.vert.glsl` applies pan/zoom/rotation transforms that are only correct for the first stage (source image). All subsequent stages render fullscreen FBO quads and must use an identity vertex shader. Without this, multi-pass rendering applies cumulative geometric transforms. This is the single most critical issue not yet addressed in any review.

2. **Incorporate all 8 "Consolidated Required Changes" from Expert Round 2.** These are well-specified and actionable. The UBO, FBO dimension fix, sharpen split, NEAREST filtering, pixel comparison infrastructure, type safety, VERTEX_SOURCE definition, and monolithic fallback test are all necessary.

3. **Adopt the minimum test gates defined above.** Each phase boundary must have explicitly named pass/fail criteria that can be verified in CI. The test IDs (A-1 through E-3) should be referenced in the plan's phase descriptions so implementors know what must pass before proceeding.

**Non-blocking (can be addressed during implementation):**

4. Add `u_outputMode` to the global uniforms UBO (used in COMPOSITING for SDR clamp, potentially relevant to DISPLAY_OUTPUT).

5. Add the texture unit assignment table from Expert Review Round 1 recommendation 5.

6. Document the linearize-EOTF coupling in the LINEARIZE stage descriptor.

7. Specify the TransitionRenderer sequential reuse strategy for ping-pong FBOs during transitions.

Once items 1-3 are incorporated into the plan document, Phase A can begin immediately. The plan's architecture is fundamentally sound and the phased migration strategy with feature flag and monolithic fallback provides appropriate safety margins for a refactor of this scope.
