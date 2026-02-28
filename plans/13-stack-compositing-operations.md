# Plan 13: Stack Compositing Operations (GPU-Accelerated)

## Overview

Desktop OpenRV supports Over, Replace, Add, Difference (and variants like ReverseDifference, Dissolve, Topmost) as compositing modes for stacked sources. The openrv-web codebase already has:

- CPU-based multi-layer compositing via `StackGroupNode.compositeLayers()` and `compositeImageData()` in `BlendModes.ts`
- Difference matte (A/B pixel diff with gain and heatmap) via `DifferenceMatteControl`
- Onion skin, flicker, and blend ratio comparison modes via `ComparisonManager`
- Wipe and split-screen A/B comparison via `ViewerWipe` / `ViewerSplitScreen`
- A/B/C/D source management via `ABCompareManager`

What is **missing** is GPU-accelerated compositing. All current stack/comparison compositing is CPU-side (`ImageData` pixel loops in JavaScript), which is too slow for real-time playback at production resolutions (1920x1080+, 3+ layers). This plan describes how to move compositing to WebGL2, adding proper Over/Replace/Add/Difference modes as GPU shader operations, integrating with the existing wipe system, and providing a unified UI for mode selection.

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

1. **Render each layer to its own FBO** using the existing `Renderer.renderImage()` pipeline (full color processing per layer).
2. **Composite FBO textures** using either WebGL blend state (for simple modes) or a dedicated compositing fragment shader (for complex modes).
3. **Reuse `TransitionRenderer` pattern** -- it already renders two textures with a blend shader.
4. **Integrate with wipe** -- stencil boxes / scissor test control which region of each layer is visible.
5. **Minimal shader changes** -- add a new `compositing.frag.glsl` shader rather than modifying the monolithic `viewer.frag.glsl`.
6. **Progressive enhancement** -- CPU fallback remains for environments without FBO support.

### Layer Rendering Pipeline

```
For each visible layer i:
  1. Bind FBO[i]
  2. Renderer.renderImage(layer[i].image)  // full color pipeline
  3. Result: textured FBO with processed layer pixels

Composite pass:
  4. Bind screen framebuffer (or target FBO)
  5. For each layer bottom-to-top:
     a. Bind layer FBO texture
     b. Set blend mode (GL state or shader uniform)
     c. Set opacity uniform
     d. Apply stencil box via scissor test or shader discard
     e. Draw fullscreen quad
  6. Result: composited image on screen
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

## Shader Design

### New File: `src/render/shaders/compositing.frag.glsl`

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_baseTexture;   // accumulated result so far
uniform sampler2D u_layerTexture;  // current layer to composite
uniform int u_compositeMode;       // compositing operation
uniform float u_opacity;           // layer opacity (0-1)
uniform bool u_premultiplied;      // premultiplied alpha mode

// Stencil box clipping [xMin, xMax, yMin, yMax] in normalized coords
uniform vec4 u_stencilBox;
uniform bool u_stencilEnabled;

// Dissolve noise parameters
uniform float u_dissolveThreshold; // for dissolve mode
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

    // Compute blended color
    vec3 blended = blendColors(base.rgb, layer.rgb, u_compositeMode);

    if (u_premultiplied) {
        // Premultiplied alpha compositing (OpenRV default)
        float outA = layerAlpha + base.a * (1.0 - layerAlpha);
        vec3 outRGB = blended * layerAlpha + base.rgb * (1.0 - layerAlpha);
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

## UI Design

### CompareControl Integration

The existing `CompareControl` dropdown already has sections for wipe, A/B, difference matte, blend modes, and quad view. Stack compositing modes should be added as a new section or integrated with the existing blend mode section.

**Option A: Extend Blend Mode Section** (Recommended)

Add the OpenRV composite types (Over, Replace, Add, Difference) as options in the blend mode selector alongside onionskin/flicker/blend. This keeps the UI compact and familiar.

```
Compare Dropdown:
  Wipe: Off | H-Wipe | V-Wipe | H-Split | V-Split
  A/B: [A] [B] [C] [D]
  ----
  Blend Mode: Off | Onion Skin | Flicker | Blend | Over | Replace | Add | Difference
  ----
  Difference Matte: [Toggle] Gain: [slider] Heatmap: [toggle]
  Quad View: [Toggle]
```

**Option B: Separate Stack Compositing Section**

Add a dedicated "Composite Mode" section. This is clearer but takes more vertical space.

### StackControl Enhancement

The existing `StackControl` panel already supports per-layer blend mode selection from the `BlendMode` type. The dropdown currently lists: normal, add, minus, multiply, screen, overlay, difference, exclusion. These map directly to the GPU shader modes.

Enhancement: Add "Over (Alpha)" and "Replace" to the dropdown, and show the OpenRV-style composite type names as a separate global stack mode selector.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+1` through `Alt+4` | Set stack composite to Replace/Over/Add/Difference |
| `Shift+O` | Toggle onion skin |
| `D` | Toggle difference matte (existing) |
| `[` / `]` | Cycle blend mode |

## Implementation Steps

### Phase 1: CompositingRenderer Class

Create a new `CompositingRenderer` class that manages multi-layer GPU compositing.

1. Create `src/render/CompositingRenderer.ts`:
   - Constructor takes `WebGL2RenderingContext`
   - Manages a pool of FBOs (one per layer, lazily allocated)
   - `compositeFrame(layers[], canvasWidth, canvasHeight)` method
   - Detects per-layer whether to use GL blend state or shader path
   - Handles stencil box clipping via scissor test

2. Create `src/render/shaders/compositing.frag.glsl`:
   - Dual-texture compositing shader as designed above
   - All blend modes from `BlendModes.ts` plus OpenRV-specific modes

3. Create `src/render/shaders/compositing.vert.glsl`:
   - Reuse `passthrough.vert.glsl` (or a simple pass-through)

### Phase 2: Layer FBO Management

Extend `Renderer.ts` to support rendering a single image into an FBO (not just the screen).

1. Add `renderImageToFBO(image, fbo, width, height)` method to `Renderer`:
   - Binds the given FBO
   - Calls `renderImage()` with the FBO as target
   - Returns the FBO texture

2. Create `LayerFBOPool` utility in `CompositingRenderer`:
   - Lazily allocates FBOs as layers are added
   - Reuses FBOs when layer count decreases
   - Supports RGBA8 and RGBA16F formats
   - Handles resize

### Phase 3: GL Blend State Path

Implement the fast path for Over, Replace, and Add using WebGL blend equations.

1. For Replace: `gl.disable(gl.BLEND)`, draw layer quad
2. For Over (premultiplied): `gl.enable(gl.BLEND)`, `gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)`
3. For Over (straight): `gl.enable(gl.BLEND)`, `gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)`
4. For Add: `gl.enable(gl.BLEND)`, `gl.blendFunc(gl.ONE, gl.ONE)`

This path avoids the compositing shader entirely -- just draw each layer's FBO texture as a quad with the appropriate blend state.

### Phase 4: Shader Composite Path

Implement the shader path for Difference, Multiply, Screen, Overlay, Exclusion, Minus, Dissolve.

1. Compile `compositing.frag.glsl` shader
2. Ping-pong FBO approach:
   - Start with layer 0 in FBO-A
   - For each subsequent layer: read FBO-A as `u_baseTexture`, layer FBO as `u_layerTexture`, write to FBO-B
   - Swap FBO-A and FBO-B
   - Final result blit to screen
3. Reuse `FBOPingPong` from `src/render/FBOPingPong.ts`

### Phase 5: Integrate with Viewer

Wire up `CompositingRenderer` into the Viewer's render loop.

1. In `Viewer.ts`, replace `compositeStackLayers()` CPU path:
   - When `isStackEnabled()` and GPU compositing available, use `CompositingRenderer`
   - Otherwise fall back to existing CPU path

2. In `ViewerGLRenderer.ts`, add `renderCompositedStack()` method:
   - Constructs `RenderState` per layer (each layer may have different color adjustments)
   - Calls `Renderer.renderImageToFBO()` per layer
   - Calls `CompositingRenderer.compositeFrame()` with the FBO textures

3. Update the render priority chain in `Viewer.render()`:
   - GPU stack compositing should be attempted before the CPU fallback
   - Integrate with the existing HDR/SDR WebGL render paths

### Phase 6: Wipe + Compositing Integration

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

### Phase 7: A/B Comparison with Compositing

Unify A/B comparison modes with stack compositing.

1. **Difference matte on GPU**: Replace `applyDifferenceMatte()` CPU function with a shader variant using `u_compositeMode = MODE_DIFFERENCE` plus a gain uniform.

2. **Onion skin on GPU**: Alpha-blended overlay of A and B using `gl.blendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA)` with opacity control.

3. **Flicker on GPU**: Alternate which FBO texture is blit to screen (no compositing needed, just swap which texture is displayed).

### Phase 8: RendererBackend Interface Update

Extend `RendererBackend` to expose compositing capabilities.

1. Add to `RendererBackend` interface:
   ```typescript
   /** Render an image into an offscreen FBO and return the texture handle. */
   renderImageToLayerFBO?(image: IPImage, layerIndex: number, width: number, height: number): TextureHandle;

   /** Composite multiple layer textures using the specified modes. */
   compositeLayerTextures?(layers: CompositeLayerDescriptor[], width: number, height: number): void;
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

### Phase 9: UI Updates

1. Add OpenRV composite types to `ComparisonManager`:
   - New `ComparisonBlendMode` values: `'over' | 'replace' | 'add' | 'compositeDifference'`
   - These work like blend modes but use GPU compositing

2. Update `CompareControl` dropdown:
   - New "Composite" section with Over / Replace / Add / Difference buttons
   - Active state indicator

3. Update `StackControl`:
   - Add "Global Composite Mode" selector at the top of the panel
   - Show per-layer blend mode only when global mode allows it

### Phase 10: Testing

1. Unit tests for `CompositingRenderer`:
   - Each blend mode produces correct pixel values (compare with CPU `compositeImageData()` reference)
   - Stencil box clipping works correctly
   - FBO pool allocation/deallocation

2. Integration tests:
   - Stack with 2, 3, 4 layers composites correctly
   - Wipe + compositing produces correct split
   - Mode switching (Over to Difference) updates immediately
   - GPU and CPU paths produce visually equivalent results

3. Performance benchmarks:
   - Measure frame time for 3-layer 1920x1080 compositing (GPU vs CPU)
   - Target: GPU path < 4ms per frame (vs ~40ms+ for CPU path)

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/render/CompositingRenderer.ts` | GPU compositing orchestrator: FBO pool, layer rendering, blend state/shader dispatch |
| `src/render/CompositingRenderer.test.ts` | Unit tests for compositing modes, stencil clipping, FBO management |
| `src/render/shaders/compositing.frag.glsl` | Compositing fragment shader with all blend modes |
| `src/render/LayerFBOPool.ts` | Manages a pool of FBOs for layer rendering (lazily allocated, auto-resized) |
| `src/render/LayerFBOPool.test.ts` | Unit tests for FBO pool lifecycle |

### Modified Files

| File | Changes |
|------|---------|
| `src/render/Renderer.ts` | Add `renderImageToFBO()` method. Expose `displayShader`, `quadVAO` for reuse by `CompositingRenderer`. Add `getQuadVAO()` accessor. |
| `src/render/RendererBackend.ts` | Add `renderImageToLayerFBO?()` and `compositeLayerTextures?()` optional methods to the interface. Add `CompositeLayerDescriptor` type. |
| `src/render/RenderState.ts` | No changes needed (per-layer render state is already supported via `applyRenderState()`). |
| `src/ui/components/Viewer.ts` | Replace CPU `compositeStackLayers()` with GPU path when available. Update render priority chain. Add `renderGPUStack()` method. |
| `src/ui/components/ViewerGLRenderer.ts` | Add `renderCompositedStack()` that drives `CompositingRenderer`. Initialize `CompositingRenderer` alongside `Renderer`. |
| `src/ui/components/ComparisonManager.ts` | Add composite mode types to `ComparisonBlendMode`. Add `setCompositeMode()` / `getCompositeMode()` methods. |
| `src/ui/components/CompareControl.ts` | Add "Composite" section to dropdown with Over/Replace/Add/Difference buttons. |
| `src/ui/components/StackControl.ts` | Add global composite mode selector. Update blend mode dropdown to include Over and Replace. |
| `src/composite/BlendModes.ts` | Add `COMPOSITE_MODES` constant array. Add `isGLBlendStateMode()` helper to classify modes by rendering strategy. Add shader mode code mapping `COMPOSITE_MODE_CODES`. |
| `src/nodes/groups/StackGroupNode.ts` | No structural changes, but the `compositeLayers()` method becomes the CPU fallback. Add `supportsGPUCompositing()` flag. |
| `src/core/types/wipe.ts` | No changes needed (stencil boxes already support the required clipping). |

## Risks

### 1. FBO Memory Pressure

Each layer FBO at 1920x1080 RGBA8 consumes ~8MB, or ~16MB for RGBA16F. With 4 layers + 2 ping-pong FBOs, that is ~96MB of GPU memory. On mobile devices or low-end GPUs, this could exceed available VRAM.

**Mitigation**: Lazy FBO allocation -- only allocate FBOs for visible layers. Downscale FBOs during interaction (like the existing interaction quality tiering). Limit maximum layer count (e.g., 8 layers).

### 2. Per-Layer Color Pipeline Cost

Each layer needs a full render pass through the viewer shader pipeline (EOTF, exposure, CDL, tone mapping, etc.). For N layers, that is N full shader passes plus the compositing pass.

**Mitigation**: Cache layer FBO results when the layer's source image and render state have not changed (dirty-flag optimization). Only re-render layers that changed. Most review workflows change one layer at a time.

### 3. Premultiplied vs Straight Alpha Mismatch

OpenRV uses premultiplied alpha throughout its pipeline. The web codebase uses straight alpha in Canvas2D paths. Mixing the two produces incorrect compositing results (halos around transparent edges).

**Mitigation**: The compositing shader supports both modes via `u_premultiplied` uniform. Default to premultiplied for GPU path (matching OpenRV). Add a toggle in StackControl for users who need straight alpha compatibility. The existing `setPremultMode()` on the Renderer already handles premultiply/unpremultiply.

### 4. Wipe + Compositing Interaction Complexity

When wipe mode is active simultaneously with multi-layer compositing, the render logic becomes complex: which layers appear on which side of the wipe, and with what blend mode?

**Mitigation**: Follow OpenRV's model -- in wipe mode, input[0] appears on one side and the composited result of input[1..N] appears on the other. The `processWipe()` logic in `StackGroupNode` already implements this pattern. For the GPU path, render the composited stack to an FBO first, then use scissor clipping for the wipe.

### 5. Shader Compilation Latency

Adding a new compositing shader means an additional compile step at startup. On some GPUs (especially mobile), shader compilation can take hundreds of milliseconds.

**Mitigation**: Use `KHR_parallel_shader_compile` (already used by the Renderer for the viewer shader). Compile the compositing shader lazily on first use rather than at initialization. The shader is much simpler than the monolithic viewer shader, so compilation should be fast.

### 6. Regression Risk to Existing Comparison Features

The existing difference matte, onion skin, flicker, and split screen features are stable. Refactoring the render pipeline to add GPU compositing could break these.

**Mitigation**: Keep the CPU path as a fallback. Gate the GPU path behind a feature flag initially. Comprehensive test coverage for all comparison modes. The existing `ComparisonManager` mutual exclusivity logic prevents conflicting modes from activating simultaneously.

### 7. WebGPU Backend Compatibility

The `RendererBackend` interface supports both WebGL2 and WebGPU backends. The compositing shader and GL blend state approach are WebGL2-specific.

**Mitigation**: Define the compositing interface at the `RendererBackend` level with optional methods. The WebGPU backend can implement its own compositing using compute shaders or render pipelines. The `CompositeLayerDescriptor` type is backend-agnostic.

### 8. HDR Content in Compositing

When compositing HDR layers (RGBA16F), the intermediate FBOs must also be RGBA16F to avoid precision loss. This doubles the per-FBO memory cost.

**Mitigation**: The `FBOPingPong` class already supports RGBA16F format selection. Detect if any layer has HDR content (using the existing `isHDRContent()` function) and promote all FBOs to RGBA16F only when needed.
