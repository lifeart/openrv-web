# Plan 13: Stack Compositing Operations (GPU-Accelerated)

## Overview

Desktop OpenRV supports Over, Replace, Add, Difference (and variants like ReverseDifference, Dissolve, Topmost) as compositing modes for stacked sources. The openrv-web codebase already has:

- CPU-based multi-layer compositing via `StackGroupNode.compositeLayers()` and `compositeImageData()` in `BlendModes.ts`
- Difference matte (A/B pixel diff with gain and heatmap) via `DifferenceMatteControl`
- Onion skin, flicker, and blend ratio comparison modes via `ComparisonManager`
- Wipe and split-screen A/B comparison via `ViewerWipe` / `ViewerSplitScreen`
- A/B/C/D source management via `ABCompareManager`

What is **missing** is GPU-accelerated compositing. All current stack/comparison compositing is CPU-side (`ImageData` pixel loops in JavaScript), which is too slow for real-time playback at production resolutions (1920x1080+, 3+ layers). This plan describes how to move compositing to WebGL2, adding proper Over/Replace/Add/Difference modes as GPU shader operations, integrating with the existing wipe system, and providing a unified UI for mode selection.

**All compositing must be performed in linear (scene-referred) color space**, before the display output transform (tone mapping, gamma encoding). This matches desktop OpenRV's pipeline, where layers are linearized and color-graded individually, composited in linear space, and then the combined result goes through the display transform.

## Current State

### CPU Compositing Path (Viewer.ts)

The `Viewer.render()` method at line ~1770 handles compositing via a priority chain:

1. **Blend modes** (`renderBlendMode`): onionskin / flicker / blend ratio between A and B sources. Uses `compositeImageData()` on CPU.
2. **Difference matte** (`renderDifferenceMatte`): `abs(A - B)` per pixel with gain/heatmap. CPU `applyDifferenceMatte()`.
3. **Split screen** (`renderSplitScreen`): Canvas2D clipping to show A on one side, B on the other.
4. **Stack layers** (`compositeStackLayers`): Iterates `stackLayers[]`, renders each source to `ImageData` via `renderSourceToImageData()`, applies stencil box clipping, then calls `compositeImageData()` per layer.
5. **Single source** with optional wipe (Canvas2D scissor/clip).

Each mode is mutually exclusive -- enabling one disables conflicting modes (enforced by `ComparisonManager`).

### Key Files

| File | Role |
|------|------|
| `src/composite/BlendModes.ts` | CPU blend functions: normal, add, minus, multiply, screen, overlay, difference, exclusion. `compositeImageData()` with straight and premultiplied alpha paths. Plugin-extensible via `PluginRegistry`. |
| `src/nodes/groups/StackGroupNode.ts` | Node graph stack node. Has `composite` property (StackCompositeType: replace/over/add/difference/-difference/dissolve/minus/topmost), per-layer blend modes/opacities/visibility/stencil boxes. CPU-side `compositeLayers()` and `processWipe()`. |
| `src/nodes/processors/StackProcessor.ts` | Simple active-index selector for wipe mode (does not do multi-layer compositing). |
| `src/ui/components/StackControl.ts` | UI panel for layer management: add/remove/reorder layers, per-layer blend mode dropdown, opacity slider, visibility toggle, source selection, stencil box editing. |
| `src/ui/components/ComparisonManager.ts` | State manager for comparison features: wipe, A/B, difference matte, blend modes (onionskin/flicker/blend), quad view. Enforces mutual exclusivity. |
| `src/ui/components/CompareControl.ts` | Dropdown UI combining wipe, A/B, difference matte, blend modes, and quad view. |
| `src/render/Renderer.ts` | WebGL2 backend. Renders one image per `renderImage()` call. Has `renderTiledImages()` for quad view but no multi-texture compositing. |
| `src/render/TransitionRenderer.ts` | Dual-FBO + transition shader (crossfade, dissolve, wipes between two textures). Already demonstrates the pattern of rendering two textures and blending them on GPU. |
| `src/render/ShaderPipeline.ts` | Multi-pass pipeline orchestrator with FBO ping-pong. The `compositing` stage exists in the stage order but is currently only used for SDR clamp / premultiply / background blend. |
| `src/render/FBOPingPong.ts` | Ping-pong FBO manager for multi-pass rendering. Supports RGBA8 and RGBA16F. |
| `src/render/shaders/viewer.frag.glsl` | Monolithic fragment shader (~1400 lines). Does not have multi-texture compositing. |
| `src/render/shaders/transition.frag.glsl` | Dual-texture transition shader (u_textureA, u_textureB, u_progress, u_transitionType). |

### Performance Problem

Current CPU compositing for a 1920x1080 RGBA image with 3 layers requires:

- 3x `renderSourceToImageData()` calls (each draws to an offscreen canvas, then `getImageData()`)
- 3x `compositeImageData()` loops (1920 * 1080 * 4 channels * blend math)
- Total: ~25M pixel operations per frame on the main thread
- At 24fps this is ~600M operations/sec on CPU -- too slow, causes frame drops

GPU compositing with WebGL2 blending or a compositing shader would reduce this to 1-2 draw calls per layer with hardware-accelerated blending.

## Proposed Architecture

### Design Principles

1. **Composite in linear (scene-referred) color space.** Each layer is rendered through its per-source color pipeline (EOTF, CDL, exposure, etc.) up to but NOT including the display output transform. Compositing happens on these linear results. The display transform (tone mapping, gamma encoding) is applied once to the final composited result. This matches desktop OpenRV and avoids gamma-space compositing artifacts (halo effects around semi-transparent edges).
2. **Render each layer to its own FBO** using a partial `Renderer.renderImage()` pipeline (through linearization and color grading stages only).
3. **Composite FBO textures** using either WebGL blend state (for simple modes) or a dedicated compositing fragment shader (for complex modes).
4. **Reuse `TransitionRenderer` pattern** -- it already renders two textures with a blend shader.
5. **Integrate with wipe** -- stencil boxes / scissor test control which region of each layer is visible. Compositing and wipe are orthogonal: compositing determines WHAT is shown, wipe determines WHERE it is shown.
6. **Minimal shader changes** -- add a new `compositing.frag.glsl` shader rather than modifying the monolithic `viewer.frag.glsl`.
7. **Progressive enhancement** -- CPU fallback remains for environments without FBO support.
8. **Cache layer FBO results** (dirty-flag optimization). Only re-render layers whose source image or render state has changed. This is a Phase 1 requirement, not optional.

### Linear-Space Compositing Pipeline

The `ShaderPipeline` currently executes all stages in a single pass per image. For compositing, we must split execution at the boundary between per-layer color processing and display output:

```
Per-layer stages (linear, per-source):
  inputDecode → colorSpace → exposure → temperature → CDL → saturation → hue → curves

Compositing stage (linear, multi-layer):
  composite all layer FBOs using blend modes

Display output stages (applied once to composited result):
  toneMapping → displayGamma → diagnostics → compositing(premult/background)
```

This requires extending `ShaderPipeline.execute()` to support partial execution:

```typescript
// New methods on ShaderPipeline:
executeToStage(image, targetStage: string): WebGLTexture  // Run stages up to targetStage, return FBO texture
executeFromStage(inputTexture: WebGLTexture, startStage: string): void  // Resume from startStage to end
```

The split point is after the `hue` (or last per-layer color grading) stage and before `toneMapping`. Each layer is processed through the per-layer stages into a linear-space FBO. The compositing pass combines these. Then the composited result is run through the display output stages.

### Resolution Mismatch Handling

Stack layers may have different source resolutions (e.g., 1920x1080 plate + 2048x1556 film scan). The GPU compositing path handles this as follows:

- **All layer FBOs are sized to the output canvas dimensions**, not the source image dimensions.
- `renderImage()` already supports `scaleX`/`scaleY` parameters to scale the source to fit the FBO.
- **Scaling policy:** Each layer is scaled to fit within the canvas while preserving aspect ratio (letterboxing/pillarboxing with transparent black fill). This is consistent with how `Renderer.renderImage()` currently handles image display.
- Per-layer `scaleX`/`scaleY` must be computed from `sourceWidth/sourceHeight` vs `canvasWidth/canvasHeight`, accounting for the layer's own pan/zoom transform.
- Different layers may have different transforms (pan, zoom, rotation) -- these are applied per-layer during the FBO render pass.

### Layer Rendering Pipeline

```
For each visible layer i:
  1. Bind FBO[i] (sized to canvas dimensions)
  2. Compute per-layer scale/transform for resolution fitting
  3. Renderer.renderImageToLinearFBO(layer[i].image)  // partial pipeline: through color grading only
  4. Result: linear-space textured FBO with processed layer pixels

Composite pass:
  5. Bind compositing target FBO
  6. For each layer bottom-to-top:
     a. Bind layer FBO texture
     b. Set blend mode (GL state or shader uniform)
     c. Set opacity uniform
     d. Apply stencil box via scissor test or shader discard
     e. Draw fullscreen quad
  7. Result: composited linear-space image in target FBO

Display output pass:
  8. Bind screen framebuffer
  9. Run composited FBO texture through display stages (tone mapping, gamma, diagnostics)
  10. Result: final display-referred image on screen
```

### Two Compositing Strategies

**Strategy A: WebGL Blend State (for Replace, Over, Add)**

These modes map directly to OpenGL blend equations:

| Mode | GL Blend Equation | GL Blend Func |
|------|------------------|---------------|
| Replace | N/A (disable blending) | N/A |
| Over (premultiplied) | `GL_FUNC_ADD` | `GL_ONE, GL_ONE_MINUS_SRC_ALPHA` |
| Over (straight) | `GL_FUNC_ADD` | `GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA` |
| Add | `GL_FUNC_ADD` | `GL_ONE, GL_ONE` |

This is the fastest path -- zero shader overhead, hardware blending.

**Strategy B: Compositing Shader (for Difference, Dissolve, Multiply, Screen, etc.)**

Modes that require `abs()`, per-pixel noise, or non-linear math cannot be expressed as GL blend equations. These require a shader that reads both the current composited result and the new layer:

```glsl
uniform sampler2D u_baseTexture;  // current composited result
uniform sampler2D u_layerTexture; // new layer to composite
uniform int u_compositeMode;      // 0=over, 1=replace, 2=add, 3=difference, 4=multiply, ...
uniform float u_opacity;
```

This requires rendering the current result to an FBO, then reading it back as a texture in the next pass (ping-pong).

### Recommended Approach: Hybrid

Use **Strategy A** (GL blend state) for Over, Replace, and Add since they are the most common modes and are zero-cost. Use **Strategy B** (shader) for Difference, Dissolve, Multiply, Screen, Overlay, Exclusion, and Minus. The `CompositingRenderer` class will detect which strategy to use per-layer.

### Prioritized Mode Implementation

Based on real-world VFX review usage frequency:

**Release 1 (Phase 1-5):** Over, Replace, Add, Difference -- these cover 95%+ of review workflows.

**Release 2 (Phase 6-9):** Dissolve, Multiply, Screen, Overlay, Exclusion, Minus -- niche modes used primarily in compositing authoring tools, not review.

This reduces the initial shader complexity and testing surface significantly.

## Shader Design

### New File: `src/render/shaders/compositing.frag.glsl`

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_baseTexture;   // accumulated result so far (linear space)
uniform sampler2D u_layerTexture;  // current layer to composite (linear space)
uniform int u_compositeMode;       // compositing operation
uniform float u_opacity;           // layer opacity (0-1)
uniform bool u_premultiplied;      // premultiplied alpha mode

// Stencil box clipping [xMin, xMax, yMin, yMax] in normalized coords
uniform vec4 u_stencilBox;
uniform bool u_stencilEnabled;

// Dissolve noise parameters
uniform float u_dissolveThreshold; // for dissolve mode (default: 0.5)
uniform vec2 u_dissolveNoiseSeed;  // per-frame seed

// Blend mode constants
const int MODE_OVER       = 0;
const int MODE_REPLACE    = 1;
const int MODE_ADD        = 2;
const int MODE_DIFFERENCE = 3;
const int MODE_MULTIPLY   = 4;
const int MODE_SCREEN     = 5;
const int MODE_OVERLAY    = 6;
const int MODE_EXCLUSION  = 7;
const int MODE_MINUS      = 8;
const int MODE_DISSOLVE   = 9;
const int MODE_REV_DIFF   = 10;

// Simple noise function for dissolve (matches OpenRV InlineDissolve2.glsl pattern)
float dissolveNoise(vec2 uv, vec2 seed) {
    return fract(sin(dot(uv + seed, vec2(12.9898, 78.233))) * 43758.5453);
}

// Blend operations work on UNPREMULTIPLIED (straight) color values.
// Caller must unpremultiply before calling and repremultiply after when
// operating in premultiplied alpha mode.
vec3 blendColors(vec3 base, vec3 layer, int mode) {
    if (mode == MODE_REPLACE || mode == MODE_OVER) {
        return layer;
    } else if (mode == MODE_ADD) {
        return base + layer;
    } else if (mode == MODE_DIFFERENCE) {
        return abs(base - layer);
    } else if (mode == MODE_REV_DIFF) {
        return max(layer - base, vec3(0.0));
    } else if (mode == MODE_MINUS) {
        return max(base - layer, vec3(0.0));
    } else if (mode == MODE_MULTIPLY) {
        return base * layer;
    } else if (mode == MODE_SCREEN) {
        return vec3(1.0) - (vec3(1.0) - base) * (vec3(1.0) - layer);
    } else if (mode == MODE_OVERLAY) {
        vec3 result;
        result.r = base.r < 0.5 ? 2.0 * base.r * layer.r : 1.0 - 2.0 * (1.0 - base.r) * (1.0 - layer.r);
        result.g = base.g < 0.5 ? 2.0 * base.g * layer.g : 1.0 - 2.0 * (1.0 - base.g) * (1.0 - layer.g);
        result.b = base.b < 0.5 ? 2.0 * base.b * layer.b : 1.0 - 2.0 * (1.0 - base.b) * (1.0 - layer.b);
        return result;
    } else if (mode == MODE_EXCLUSION) {
        return base + layer - 2.0 * base * layer;
    }
    return layer; // fallback
}

void main() {
    // Stencil box clipping
    if (u_stencilEnabled) {
        if (v_texCoord.x < u_stencilBox.x || v_texCoord.x > u_stencilBox.y ||
            v_texCoord.y < u_stencilBox.z || v_texCoord.y > u_stencilBox.w) {
            // Outside stencil: pass through base unchanged
            fragColor = texture(u_baseTexture, v_texCoord);
            return;
        }
    }

    vec4 base = texture(u_baseTexture, v_texCoord);
    vec4 layer = texture(u_layerTexture, v_texCoord);

    // Apply layer opacity
    float layerAlpha = layer.a * u_opacity;

    // Dissolve: per-pixel random selection
    if (u_compositeMode == MODE_DISSOLVE) {
        float noise = dissolveNoise(v_texCoord, u_dissolveNoiseSeed);
        if (noise > u_dissolveThreshold) {
            fragColor = base;
        } else {
            fragColor = vec4(layer.rgb, layerAlpha);
        }
        return;
    }

    // Replace: just overwrite (no alpha blending)
    if (u_compositeMode == MODE_REPLACE) {
        fragColor = vec4(layer.rgb, layerAlpha);
        return;
    }

    // For non-Over blend modes in premultiplied space, we must unpremultiply
    // before blending and repremultiply after. This matches the CPU path in
    // BlendModes.ts (lines 189-202) which does the same
    // unpremultiply-blend-repremultiply dance.
    vec3 baseColor = base.rgb;
    vec3 layerColor = layer.rgb;

    if (u_premultiplied) {
        // Unpremultiply for blending (avoid division by zero)
        if (base.a > 0.001) {
            baseColor = base.rgb / base.a;
        }
        if (layer.a > 0.001) {
            layerColor = layer.rgb / layer.a;
        }
    }

    // Compute blended color (operates on straight/unpremultiplied values)
    vec3 blended = blendColors(baseColor, layerColor, u_compositeMode);

    if (u_premultiplied) {
        // Premultiplied alpha compositing (OpenRV default)
        float outA = layerAlpha + base.a * (1.0 - layerAlpha);
        // Repremultiply the blended result
        vec3 outRGB = blended * layerAlpha + baseColor * base.a * (1.0 - layerAlpha);
        fragColor = vec4(outRGB, outA);
    } else {
        // Straight alpha compositing
        float outA = layerAlpha + base.a * (1.0 - layerAlpha);
        if (outA > 0.0) {
            vec3 outRGB = (blended * layerAlpha + base.rgb * base.a * (1.0 - layerAlpha)) / outA;
            fragColor = vec4(outRGB, outA);
        } else {
            fragColor = vec4(0.0);
        }
    }
}
```

### Vertex Shader

Reuse `src/render/shaders/passthrough.vert.glsl` (identity transform for FBO quad blitting). For the first layer that needs pan/zoom, use `viewer.vert.glsl`.

### Wipe Integration

The wipe system currently uses stencil boxes (`[xMin, xMax, yMin, yMax]`) to define visible regions. In the GPU path:

- **Scissor test**: For simple rectangular wipes, use `gl.scissor()` to clip each layer's draw call. This is the fastest approach and already used by `renderTiledImages()`.
- **Shader stencil**: The `u_stencilBox` uniform in the compositing shader handles per-layer stencil clipping for complex wipe interactions (e.g., one layer has a wipe region while also being composited with a blend mode).
- **Wipe line**: The wipe position from `ComparisonManager` is translated to stencil boxes via `computeHorizontalWipeBoxes()` / `computeVerticalWipeBoxes()`.

### Premultiplied vs Straight Alpha Convention

After a source image goes through the partial pipeline (linearization + color grading) into a layer FBO, the alpha convention of the FBO contents depends on the per-source `premultMode` setting. To ensure consistent compositing:

1. **Normalize alpha convention at FBO output.** After rendering each layer to its FBO, the output should have a known alpha convention. The `Renderer`'s existing `setPremultMode()` handles per-source premultiplication. We standardize on **premultiplied alpha in FBOs** (matching OpenRV).
2. **If a source has straight alpha** (e.g., PNG), the per-layer render pass premultiplies it during the FBO write. This is already supported via `setPremultMode(1)`.
3. **If a source has premultiplied alpha** (e.g., EXR), no conversion is needed.
4. **The compositing shader's `u_premultiplied` uniform is set to `true`** for the standard GPU path. The straight-alpha path exists for CPU fallback compatibility.

This ensures all FBOs entering the compositing pass have the same alpha convention, preventing mixed-convention artifacts.

## UI Design

### CompareControl Integration

The existing `CompareControl` dropdown already has sections for wipe, A/B, difference matte, blend modes, and quad view. Stack compositing modes are added as a **separate section** with clear labeling to avoid confusion with the existing "blend mode" concept.

**UI Layout** (separate sections with distinct labels):

```
Compare Dropdown:
  -- Wipe --
  Off | H-Wipe | V-Wipe | H-Split | V-Split

  -- A/B Compare --
  [A] [B] [C] [D]
  Onion Skin | Flicker | Blend Ratio

  -- Difference Matte --
  [Toggle] Gain: [slider] Heatmap: [toggle]

  -- Stack Composite --
  Off | Over | Add | Difference
  (Shows: "3 layers active" when stack has layers)

  -- Quad View --
  [Toggle]
```

**Key UI decisions:**

- The "Stack Composite" section only appears (or is enabled) when 2+ visible stack layers are configured in StackControl. This avoids confusing users doing simple A/B review.
- "Blend Mode" label is reserved for Photoshop-style per-layer operations in StackControl. "Compare Mode" is used for onionskin/flicker/blend. "Stack Composite" is used for OpenRV compositing operations. This eliminates the naming collision between three different "blend" concepts.
- When Over mode is selected with fully opaque sources, a tooltip notes: "Over mode with opaque layers behaves like Replace -- lower layers are fully covered unless the top layer has transparency."

### StackControl Enhancement

The existing `StackControl` panel already supports per-layer blend mode selection from the `BlendMode` type. The dropdown currently lists: normal, add, minus, multiply, screen, overlay, difference, exclusion. These map directly to the GPU shader modes.

Enhancement: Add "Over (Alpha)" and "Replace" to the dropdown, and show the OpenRV-style composite type names as a separate global stack mode selector.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+1` through `Ctrl+Shift+4` | Set stack composite to Replace/Over/Add/Difference |
| `Shift+O` | Toggle onion skin |
| `D` | Toggle difference matte (existing) |

> **Review Note:** The originally proposed `Alt+1` through `Alt+4` conflicts with browser tab switching on Windows/Linux. `[` / `]` for cycling blend modes conflicts with common video player shortcuts (step frame backward/forward). Verify all chosen shortcuts against the existing shortcut map before finalizing.

## Implementation Steps

### Release 1: Core GPU Compositing (Phases 1-5)

Implements Over, Replace, Add, Difference -- covering 95%+ of VFX review workflows. No UI changes to CompareControl. Stack compositing triggered only via StackControl. Feature-flagged.

### Phase 1: ShaderPipeline Split + CompositingRenderer Class

Create the linear-space compositing infrastructure.

1. **Extend `ShaderPipeline`** to support partial execution:
   - Add `executeToStage(image, targetStage: string): WebGLTexture` -- runs stages from `inputDecode` through `targetStage`, returns the FBO texture without presenting to screen.
   - Add `executeFromStage(inputTexture: WebGLTexture, startStage: string): void` -- binds the given texture as input and runs from `startStage` through the final stage.
   - The split point for compositing is after `hue` (last per-layer color grading stage) and before `toneMapping`.

2. Create `src/render/CompositingRenderer.ts`:
   - Constructor takes `WebGL2RenderingContext`
   - Manages a pool of FBOs (one per layer, lazily allocated)
   - `compositeFrame(layers[], canvasWidth, canvasHeight)` method
   - Detects per-layer whether to use GL blend state or shader path
   - Handles stencil box clipping via scissor test
   - **Dirty-flag FBO caching**: tracks per-layer dirty state based on source image identity + render state hash. Only re-renders layers whose source or render state has changed. This is essential for acceptable performance during scrubbing/wipe interaction where only one parameter changes per frame.

3. Create `src/render/shaders/compositing.frag.glsl`:
   - Dual-texture compositing shader as designed above
   - Release 1 modes: Over, Replace, Add, Difference
   - Proper unpremultiply-blend-repremultiply for non-Over modes in premultiplied space

4. Create `src/render/shaders/compositing.vert.glsl`:
   - Reuse `passthrough.vert.glsl` (or a simple pass-through)

### Phase 2: Layer FBO Management

Extend `Renderer.ts` to support rendering a single image into an FBO with partial pipeline execution.

1. Add `renderImageToLinearFBO(image, fbo, width, height)` method to `Renderer`:
   - Binds the given FBO
   - Calls `ShaderPipeline.executeToStage(image, 'hue')` to render through color grading only
   - Result: linear-space textured FBO
   - **Resolution handling**: computes per-layer `scaleX`/`scaleY` from source dimensions vs FBO dimensions, preserving aspect ratio (letterbox/pillarbox with transparent black fill)

2. Add `renderDisplayOutput(inputTexture)` method to `Renderer`:
   - Calls `ShaderPipeline.executeFromStage(inputTexture, 'toneMapping')` to apply display transform
   - Used to render the composited linear result to the screen

3. Create `LayerFBOPool` utility in `CompositingRenderer`:
   - Lazily allocates FBOs as layers are added
   - Reuses FBOs when layer count decreases
   - All FBOs are sized to canvas dimensions (not source dimensions)
   - Supports RGBA8 and RGBA16F formats
   - Handles resize
   - **Visible-layer optimization**: only allocate FBOs for visible layers with nonzero opacity

### Phase 3: GL Blend State Path

Implement the fast path for Over, Replace, and Add using WebGL blend equations.

1. For Replace: `gl.disable(gl.BLEND)`, draw layer quad
2. For Over (premultiplied): `gl.enable(gl.BLEND)`, `gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)`
3. For Over (straight): `gl.enable(gl.BLEND)`, `gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)`
4. For Add: `gl.enable(gl.BLEND)`, `gl.blendFunc(gl.ONE, gl.ONE)`

This path avoids the compositing shader entirely -- just draw each layer's FBO texture as a quad with the appropriate blend state.

### Phase 4: Shader Composite Path

Implement the shader path for Difference (Release 1 only).

1. Compile `compositing.frag.glsl` shader
2. Ping-pong FBO approach:
   - Start with layer 0 in FBO-A
   - For each subsequent layer: read FBO-A as `u_baseTexture`, layer FBO as `u_layerTexture`, write to FBO-B
   - Swap FBO-A and FBO-B
   - Final result passed to `renderDisplayOutput()` for display transform
3. Reuse `FBOPingPong` from `src/render/FBOPingPong.ts`

### Phase 5: Integrate with Viewer

Wire up `CompositingRenderer` into the Viewer's render loop.

1. In `Viewer.ts`, replace `compositeStackLayers()` CPU path:
   - When `isStackEnabled()` and GPU compositing available, use `CompositingRenderer`
   - Otherwise fall back to existing CPU path
   - Gate the GPU path behind a feature flag initially
   - Add `console.warn` when the CPU fallback is used during playback, so developers can diagnose why GPU compositing is not being used

2. **Update `isStackEnabled()` to count visible layers**, not total layers:
   ```typescript
   isStackEnabled(): boolean {
     return this.stackEnabled && this.stackLayers.filter(l => l.visible && l.opacity > 0).length > 1;
   }
   ```
   This avoids unnecessary GPU compositing when most layers are hidden.

3. In `ViewerGLRenderer.ts`, add `renderCompositedStack()` method:
   - Constructs `RenderState` per layer (each layer may have different color adjustments)
   - Calls `Renderer.renderImageToLinearFBO()` per layer (skipping clean/cached layers)
   - Calls `CompositingRenderer.compositeFrame()` with the FBO textures
   - Calls `Renderer.renderDisplayOutput()` to apply tone mapping and gamma to the composited result

4. Update the render priority chain in `Viewer.render()`:
   - GPU stack compositing should be attempted before the CPU fallback
   - Integrate with the existing HDR/SDR WebGL render paths

5. **Handle null/missing sources**: If a stack layer references a source index that no longer exists (e.g., media file removed), skip the layer silently (matching current CPU behavior). Log a warning for developer diagnostics.

### Release 2: Wipe Integration, A/B Unification, UI, Remaining Modes (Phases 6-9)

Requires the ComparisonManager refactor. Adds remaining blend modes and full UI integration.

### Phase 6: ComparisonManager State Model Refactor

Refactor `ComparisonManager` to allow compositing and wipe to coexist.

1. **Make compositing orthogonal to wipe.** Currently `ComparisonManager` enforces mutual exclusivity across all modes (lines 83-93, 154-164, 238-267). The new model splits state into two orthogonal axes:
   - **Spatial mode** (where pixels come from): wipe, split screen, quad view -- these control spatial layout
   - **Composite mode** (how layers combine): over, add, difference, onionskin, flicker, blend ratio -- these control layer blending

   Spatial mode and composite mode can coexist (e.g., wipe + over compositing = wipe between source A and a composited stack).

2. Add `setCompositeMode()` / `getCompositeMode()` methods to `ComparisonManager`.

3. Update the mutual exclusivity logic:
   - Within the spatial axis, modes remain mutually exclusive (wipe disables split screen, etc.)
   - Within the composite axis, modes remain mutually exclusive (over disables difference, etc.)
   - Between axes, modes coexist freely

### Phase 7: Wipe + Compositing Integration

Make wipe mode work with stack compositing.

1. When wipe is active with stack layers:
   - Layer A (left of wipe) is rendered normally
   - Layer B (right of wipe) is the composited result of all stack layers
   - Use `gl.scissor()` to clip each side

2. For split-screen with compositing:
   - Source A side: render source A through full pipeline
   - Source B side: render composited stack result
   - Clip via viewport/scissor (same as `renderTiledImages()`)

3. Per-layer stencil boxes:
   - The `u_stencilBox` uniform clips individual layer visibility
   - This allows effects like "layer 2 visible only in the right half" even within a composited stack

### Phase 8: A/B Comparison with Compositing

Unify A/B comparison modes with stack compositing.

1. **Difference matte on GPU**: Replace `applyDifferenceMatte()` CPU function with a shader variant using `u_compositeMode = MODE_DIFFERENCE` plus a gain uniform.

2. **Onion skin on GPU**: Alpha-blended overlay of A and B using `gl.blendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)` with opacity control.

3. **Flicker on GPU**: Alternate which FBO texture is blit to screen (no compositing needed, just swap which texture is displayed).

### Phase 9: Remaining Blend Modes + UI Updates

1. **Add remaining shader modes**: Dissolve, Multiply, Screen, Overlay, Exclusion, Minus to the compositing shader.

2. **Topmost mode**: No shader support needed. Implement as a CPU-side check: if composite type is `'topmost'`, render only the first visible layer and skip compositing entirely.

3. Add OpenRV composite types to `ComparisonManager`:
   - New `ComparisonBlendMode` values: `'over' | 'replace' | 'add' | 'compositeDifference'`
   - These work like blend modes but use GPU compositing

4. Update `CompareControl` dropdown:
   - New "Stack Composite" section with Over / Replace / Add / Difference buttons
   - Active state indicator
   - Layer count indicator ("3 layers active")

5. Update `StackControl`:
   - Add "Global Composite Mode" selector at the top of the panel
   - Show per-layer blend mode only when global mode allows it

### Phase 10: RendererBackend Interface Update

Extend `RendererBackend` to expose compositing capabilities.

1. Add to `RendererBackend` interface:
   ```typescript
   /** Render an image into an offscreen linear-space FBO and return the texture handle. */
   renderImageToLayerFBO?(image: IPImage, layerIndex: number, width: number, height: number): TextureHandle;

   /** Composite multiple layer textures using the specified modes. */
   compositeLayerTextures?(layers: CompositeLayerDescriptor[], width: number, height: number): void;

   /** Apply display output transform to a composited linear texture. */
   renderDisplayOutput?(inputTexture: TextureHandle, width: number, height: number): void;
   ```

2. `CompositeLayerDescriptor` type:
   ```typescript
   interface CompositeLayerDescriptor {
     texture: TextureHandle;
     blendMode: BlendMode | StackCompositeType;
     opacity: number;
     stencilBox?: StencilBox;
     visible: boolean;
   }
   ```

> **Review Note (WebGPU):** The WebGPU backend can implement the same compositing interface using `GPURenderPassDescriptor` with `loadOp: 'load'` for GL-blend-state modes, and compute shaders for complex modes. The `CompositeLayerDescriptor` type is backend-agnostic. This does not need to be in the initial implementation but should be called out as a future item.

### Phase 11: Testing

Testing runs continuously across both releases.

1. **Capture CPU compositing baseline** before implementing: measure actual frame time for 3-layer 1920x1080 compositing on the CPU path to establish a concrete baseline (the estimate is ~40ms+, but actual measurement is more convincing).

2. Unit tests for `CompositingRenderer`:
   - Each blend mode produces correct pixel values (compare with CPU `compositeImageData()` reference)
   - **Specifically test premultiplied alpha correctness**: verify that unpremultiply-blend-repremultiply produces correct results for Multiply, Screen, Overlay (compare against CPU path in `BlendModes.ts` lines 189-202)
   - Stencil box clipping works correctly
   - FBO pool allocation/deallocation
   - Dirty-flag caching: verify layers are not re-rendered when unchanged
   - **Resolution mismatch**: verify correct letterboxing when layers have different source resolutions
   - **Null/missing source handling**: verify graceful skip

3. Unit tests for `ShaderPipeline` partial execution:
   - `executeToStage()` produces linear-space output (verify by comparing against full pipeline output with identity display transform)
   - `executeFromStage()` produces correct display-referred output

4. Integration tests:
   - Stack with 2, 3, 4 layers composites correctly
   - Wipe + compositing produces correct split (Release 2)
   - Mode switching (Over to Difference) updates immediately
   - GPU and CPU paths produce visually equivalent results (noting that GPU path is in linear space, so results will be more correct than the gamma-space CPU path)

5. Performance benchmarks:
   - Measure frame time for 3-layer 1920x1080 compositing (GPU vs CPU)
   - Target: GPU path < 4ms per frame (vs ~40ms+ for CPU path)
   - Measure dirty-flag cache hit rate during scrubbing

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/render/CompositingRenderer.ts` | GPU compositing orchestrator: FBO pool, layer rendering, blend state/shader dispatch, dirty-flag caching |
| `src/render/CompositingRenderer.test.ts` | Unit tests for compositing modes, stencil clipping, FBO management, premultiplied alpha correctness |
| `src/render/shaders/compositing.frag.glsl` | Compositing fragment shader with all blend modes (Release 1: Over, Add, Difference; Release 2: remaining modes) |
| `src/render/LayerFBOPool.ts` | Manages a pool of FBOs for layer rendering (lazily allocated, auto-resized, visible-layer-only) |
| `src/render/LayerFBOPool.test.ts` | Unit tests for FBO pool lifecycle |

### Modified Files

| File | Changes |
|------|---------|
| `src/render/ShaderPipeline.ts` | Add `executeToStage()` and `executeFromStage()` for partial pipeline execution. Define the split point between per-layer stages and display output stages. |
| `src/render/Renderer.ts` | Add `renderImageToLinearFBO()` method (partial pipeline to FBO). Add `renderDisplayOutput()` method (display transform on composited result). Expose `displayShader`, `quadVAO` for reuse by `CompositingRenderer`. Add `getQuadVAO()` accessor. |
| `src/render/RendererBackend.ts` | Add `renderImageToLayerFBO?()`, `compositeLayerTextures?()`, and `renderDisplayOutput?()` optional methods to the interface. Add `CompositeLayerDescriptor` type. |
| `src/render/RenderState.ts` | No changes needed (per-layer render state is already supported via `applyRenderState()`). |
| `src/ui/components/Viewer.ts` | Replace CPU `compositeStackLayers()` with GPU path when available. Update render priority chain. Add `renderGPUStack()` method. Update `isStackEnabled()` to check visible layer count. |
| `src/ui/components/ViewerGLRenderer.ts` | Add `renderCompositedStack()` that drives `CompositingRenderer`. Initialize `CompositingRenderer` alongside `Renderer`. |
| `src/ui/components/ComparisonManager.ts` | Refactor mutual exclusivity to orthogonal spatial/composite axes. Add composite mode types. Add `setCompositeMode()` / `getCompositeMode()` methods. |
| `src/ui/components/CompareControl.ts` | Add "Stack Composite" section to dropdown with Over/Replace/Add/Difference buttons. Show layer count indicator. |
| `src/ui/components/StackControl.ts` | Add global composite mode selector. Update blend mode dropdown to include Over and Replace. |
| `src/composite/BlendModes.ts` | Add `COMPOSITE_MODES` constant array. Add `isGLBlendStateMode()` helper to classify modes by rendering strategy. Add shader mode code mapping `COMPOSITE_MODE_CODES`. |
| `src/nodes/groups/StackGroupNode.ts` | No structural changes, but the `compositeLayers()` method becomes the CPU fallback. Add `supportsGPUCompositing()` flag. |
| `src/core/types/wipe.ts` | No changes needed (stencil boxes already support the required clipping). |

## Risks

### 1. FBO Memory Pressure

Each layer FBO at 1920x1080 RGBA8 consumes ~8MB, or ~16MB for RGBA16F. With 4 layers + 2 ping-pong FBOs, that is ~96MB of GPU memory. On mobile devices or low-end GPUs, this could exceed available VRAM.

**Mitigation**: Lazy FBO allocation -- only allocate FBOs for visible layers with nonzero opacity. Downscale FBOs during interaction (like the existing interaction quality tiering). Limit maximum layer count (e.g., 8 layers).

> **Review Note:** Enforce `MAX_STACK_LAYERS` constant in both the UI (disable "Add Layer" button at limit) and the API. The plan mentions 8 layers max but the limit must be enforced programmatically.

### 2. Per-Layer Color Pipeline Cost

Each layer needs a full render pass through the per-layer shader pipeline stages (EOTF, exposure, CDL, etc.). For N layers, that is N partial shader passes plus the compositing pass plus the display output pass.

**Mitigation**: **Dirty-flag FBO caching is a Phase 1 requirement.** Track per-layer dirty state based on source image identity + render state hash. Only re-render layers whose source or render state has changed. Most review workflows change one layer at a time. During scrubbing, only the active layer's frame changes; other layers' FBOs remain valid.

### 3. Premultiplied vs Straight Alpha Mismatch

OpenRV uses premultiplied alpha throughout its pipeline. The web codebase uses straight alpha in Canvas2D paths. Mixing the two produces incorrect compositing results (halos around transparent edges).

**Mitigation**: Standardize on premultiplied alpha in all layer FBOs. The compositing shader correctly unpremultiplies before blend operations and repremultiplies after (matching the CPU path in `BlendModes.ts` lines 189-202). The `Renderer`'s `setPremultMode()` handles per-source premultiplication during the FBO render pass. A toggle in StackControl allows users who need straight alpha compatibility.

### 4. Wipe + Compositing Interaction Complexity

When wipe mode is active simultaneously with multi-layer compositing, the render logic becomes complex: which layers appear on which side of the wipe, and with what blend mode?

**Mitigation**: Follow OpenRV's model -- in wipe mode, input[0] appears on one side and the composited result of input[1..N] appears on the other. The `processWipe()` logic in `StackGroupNode` already implements this pattern. For the GPU path, render the composited stack to an FBO first, then use scissor clipping for the wipe. The `ComparisonManager` refactor (Phase 6) makes compositing and wipe orthogonal, so they coexist naturally.

### 5. Shader Compilation Latency

Adding a new compositing shader means an additional compile step at startup. On some GPUs (especially mobile), shader compilation can take hundreds of milliseconds.

**Mitigation**: Use `KHR_parallel_shader_compile` (already used by the Renderer for the viewer shader). Compile the compositing shader lazily on first use rather than at initialization. The shader is much simpler than the monolithic viewer shader, so compilation should be fast.

### 6. Regression Risk to Existing Comparison Features

The existing difference matte, onion skin, flicker, and split screen features are stable. Refactoring the render pipeline to add GPU compositing could break these.

**Mitigation**: Keep the CPU path as a fallback. Gate the GPU path behind a feature flag initially. Comprehensive test coverage for all comparison modes. The existing `ComparisonManager` mutual exclusivity logic prevents conflicting modes from activating simultaneously. Log warnings when CPU fallback is used during playback.

### 7. WebGPU Backend Compatibility

The `RendererBackend` interface supports both WebGL2 and WebGPU backends. The compositing shader and GL blend state approach are WebGL2-specific.

**Mitigation**: Define the compositing interface at the `RendererBackend` level with optional methods. The WebGPU backend can implement its own compositing using compute shaders or render pipelines. The `CompositeLayerDescriptor` type is backend-agnostic.

### 8. HDR Content in Compositing

When compositing HDR layers (RGBA16F), the intermediate FBOs must also be RGBA16F to avoid precision loss. This doubles the per-FBO memory cost.

**Mitigation**: The `FBOPingPong` class already supports RGBA16F format selection. Detect if any layer has HDR content (using the existing `isHDRContent()` function) and promote all FBOs to RGBA16F only when needed.

### 9. ShaderPipeline Split Complexity

Splitting `ShaderPipeline.execute()` into partial execution (`executeToStage` / `executeFromStage`) is a significant change to a core rendering component. Incorrect split points or state leakage between partial executions could cause rendering artifacts.

**Mitigation**: Comprehensive unit tests for partial execution. The split point (after `hue`, before `toneMapping`) is well-defined and corresponds to a natural boundary between scene-referred and display-referred processing. Both partial execution methods must correctly manage FBO bindings and shader uniform state.

### 10. Resolution Mismatch Artifacts

Compositing layers with different native resolutions may produce scaling artifacts (aliasing, blurriness) depending on the scaling filter.

**Mitigation**: Use bilinear filtering (the WebGL default for `GL_LINEAR` texture filtering) for scaling during the FBO render pass. For high-quality output, consider offering a Lanczos downscaling option as a future enhancement. Document the scaling behavior in the UI tooltip for the layer resolution indicator.

> **Review Note (Performance Baseline):** Before implementing, capture the current CPU compositing frame time for 3 layers at 1920x1080 using the browser performance API. The estimate of ~40ms+ should be validated with actual measurements to establish a convincing baseline for the GPU improvement.
