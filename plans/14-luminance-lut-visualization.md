# 14 - Luminance LUT Visualization (GPU-Accelerated)

## Overview

Luminance LUT Visualization provides three GPU-accelerated modes for analyzing image luminance distribution: **HSV Rainbow**, **Random Color per Band**, and **Contour Iso-Lines**. Desktop OpenRV supports these as part of its luminance visualization toolkit for depth maps and gradient analysis. The web version currently has a CPU-based implementation in `LuminanceVisualization.ts` that processes `ImageData` pixel-by-pixel -- functional but slow at high resolutions and incompatible with the WebGL2 rendering path where `ImageData` is never produced.

### Goals

- Move all three luminance visualization modes (HSV, Random Color, Contour) from CPU `ImageData` processing to GPU fragment shader execution.
- Add new shader uniforms and a 1D LUT texture for HSV/Random modes, plus contour detection uniforms for the Contour mode.
- Integrate with the existing `ShaderStateManager` dirty-flag system and `RenderState` pipeline.
- Maintain the existing `LuminanceVisualization` component API, UI controls, keyboard shortcut (`Shift+Alt+V`), and badge overlay.
- Ensure the CPU fallback path (Canvas2D) continues to work for browsers without WebGL2.
- Achieve real-time performance at 4K resolution (< 2ms per frame for the visualization pass).

### Non-Goals

- Adding new visualization modes beyond the existing three (HSV, Random Color, Contour).
- Modifying the existing FalseColor GPU path (it already works via `u_falseColorLUT`).
- Replacing the `LuminanceVisualization` class -- it remains the state owner and CPU fallback.

---

## Current State

### LuminanceVisualization (`src/ui/components/LuminanceVisualization.ts`)

- State management class with five modes: `'off'`, `'false-color'`, `'hsv'`, `'random-color'`, `'contour'`.
- Emits `stateChanged` and `modeChanged` events via `EventEmitter`.
- CPU-based `apply(imageData: ImageData)` method iterates over every pixel:
  - **HSV**: Pre-computed 256-entry LUT mapping luminance to hue 0-300 degrees. Lookup per pixel using `luminanceRec709()`.
  - **Random Color**: Seeded PRNG (`mulberry32`) generates `bandCount` (4-64) colors. Pixels are quantized into bands by `floor(lum * bandCount)`.
  - **Contour**: Pre-computes luminance grid, then checks 4-connected neighbors for quantization boundary crossings. Optionally desaturates non-contour pixels.
- `false-color` mode delegates to the `FalseColor` component, which already has GPU support via `u_falseColorLUT` uniform and 256x1 texture.
- Default state: 16 random bands, seed 42, 10 contour levels, desaturate enabled, white contour lines.

### LuminanceVisualizationControl (`src/ui/components/LuminanceVisualizationControl.ts`)

- UI dropdown with mode selector buttons, mode-specific sub-controls (band slider, reseed, contour levels, presets, desaturate toggle).
- Badge overlay showing active mode name and parameters.
- Keyboard shortcut `Shift+Alt+V` cycles modes via `view.cycleLuminanceVis` in `KeyBindings.ts` and `KeyboardActionMap.ts`.

### OverlayManager (`src/ui/components/OverlayManager.ts`)

- Owns `LuminanceVisualization` instance (and `FalseColor` which it wraps).
- Wires `stateChanged` to `callbacks.refresh()` to trigger re-render.
- Exposes `getLuminanceVisualization()` accessor used by `Viewer.ts`.

### Viewer.ts Integration Points

- **`applyPixelEffects()`** (line ~2780): Checks `hasLuminanceVis` (mode not `'off'` and not `'false-color'`), calls `luminanceVisualization.apply(imageData)` for CPU path.
- **`applyLightweightEffects()`** (line ~3158): Same check and apply for the lightweight playback path.
- **`applyPixelEffectsAsync()`** (line ~2967): Same check for the async worker path.
- Luminance vis is mutually exclusive with false color and zebra stripes in the Viewer's overlay precedence chain.

### Fragment Shader Pipeline (`src/render/shaders/viewer.frag.glsl`)

The monolithic fragment shader processes in this order relevant to diagnostics:
```
Phase 10: Channel isolation (u_channelMode)
Phase 11: False Color (u_falseColorEnabled + u_falseColorLUT texture lookup)
Phase 12: Zebra Stripes (u_zebraEnabled + threshold + animated diagonal pattern)
Phase 12c: Dither + Quantize
SDR clamp -> Premultiply -> Background blend -> fragColor
```

Luminance visualization should be inserted at **Phase 11**, alongside false color (they are mutually exclusive). The false color mode of luminance vis already uses the `u_falseColorLUT` path. HSV and Random Color modes can reuse the same `u_falseColorLUT` texture slot with different LUT data. Contour mode requires a separate shader path with neighbor sampling.

### ShaderStateManager (`src/render/ShaderStateManager.ts`)

- Manages `InternalShaderState` with dirty flags per feature.
- `setFalseColor(state)` sets `falseColorEnabled`, `falseColorLUTData`, and `falseColorLUTDirty`.
- `applyUniforms()` pushes dirty state to GPU. False color LUT uses texture unit 2 (`u_falseColorLUT`).
- Dirty flag system: `DIRTY_FALSE_COLOR` triggers uniform re-upload.

### RenderState (`src/render/RenderState.ts`)

- Aggregated state object passed from Viewer to Renderer via `applyRenderState()`.
- `falseColor: FalseColorState` field with `{ enabled: boolean; lut: Uint8Array | null }`.
- No luminance visualization field exists yet.

### ShaderPipeline (`src/render/ShaderPipeline.ts`)

- Multi-pass pipeline with stages: `inputDecode`, `linearize`, `primaryGrade`, `secondaryGrade`, `spatialEffects`, `colorPipeline`, `sceneAnalysis`, `spatialEffectsPost`, `displayOutput`, `diagnostics`, `compositing`.
- The `diagnostics` stage handles channel isolation, false color, and zebra stripes.
- Contour mode requires neighbor pixel sampling, which means it needs `needsBilinearInput: true` or should use `texelFetch` with offsets for exact neighbor access.

### ViewerGLRenderer (`src/ui/components/ViewerGLRenderer.ts`)

- `buildRenderState()` constructs the `RenderState` including `falseColor` from the OverlayManager.
- This is where luminance vis state would be injected into the render state.

---

## Proposed Architecture

### Strategy: Extend the Existing False Color LUT Path

HSV and Random Color modes work identically to false color: they map scalar luminance to an RGB color via a 1D LUT. The existing `u_falseColorLUT` texture (256x1 RGB) and `u_falseColorEnabled` uniform can be reused by uploading different LUT data depending on the active luminance vis mode. This requires **zero new texture uniforms or shader texture slots**.

Contour mode is fundamentally different -- it requires sampling neighboring pixels to detect quantization boundaries. This requires a new shader uniform `u_contourEnabled` and uses `texelFetch` offsets (no bilinear filtering needed). Since it samples neighbors, it must operate on the already-processed image, placing it in the `diagnostics` stage after the color pipeline.

### Data Flow

```
LuminanceVisualization (state owner)
    |
    v
Viewer.ts / ViewerGLRenderer.ts
    |  buildRenderState() includes luminanceVis state
    v
RenderState { luminanceVis: LuminanceVisRenderState }
    |
    v
ShaderStateManager.applyRenderState()
    |  Updates falseColorLUTData with HSV/Random LUT
    |  Updates contour uniforms
    v
viewer.frag.glsl
    |  Phase 11: if u_falseColorEnabled -> LUT lookup (HSV/Random/FalseColor)
    |  Phase 11b: if u_contourEnabled -> neighbor sampling + edge detection
    v
fragColor
```

### Mode-to-Shader Mapping

| Luminance Vis Mode | Shader Path | LUT Source | Extra Uniforms |
|---|---|---|---|
| `off` | No-op | -- | -- |
| `false-color` | `u_falseColorEnabled` + `u_falseColorLUT` | `FalseColor.getColorLUT()` | None |
| `hsv` | `u_falseColorEnabled` + `u_falseColorLUT` | `LuminanceVisualization.hsvLUT` (256x3 -> expanded to RGBA) | None |
| `random-color` | `u_falseColorEnabled` + `u_falseColorLUT` | `LuminanceVisualization.randomLUT` (bandCount entries -> expanded to 256 RGBA) | None |
| `contour` | `u_contourEnabled` + neighbor texelFetch | -- | `u_contourLevels`, `u_contourDesaturate`, `u_contourLineColor` |

### LUT Expansion for HSV and Random Color

The existing `u_falseColorLUT` is a 256x1 texture sampled with `texture(u_falseColorLUT, vec2(luminance, 0.5))`. HSV and Random Color LUTs must be converted to the same 256-entry format:

- **HSV LUT**: Already 256 entries (one per 8-bit luminance value). Convert from `Uint8Array[256*3]` (RGB) to `Uint8Array[256*3]` (same format as false color LUT). The existing `buildHsvLUT()` output is directly compatible.

- **Random Color LUT**: Has `bandCount` entries (4-64). Must be expanded to 256 entries where each luminance index maps to `palette[floor(lum/255 * bandCount)]`. Pre-expand on CPU to avoid per-pixel branching in shader.

Both LUTs are uploaded through the same `FalseColorState.lut` field in `RenderState`, reusing the existing texture upload path without any new GPU resources.

---

## Shader Design

### Phase 11: Extended False Color / Luminance LUT (No Changes Needed)

The existing Phase 11 code in `viewer.frag.glsl` already does exactly what HSV and Random Color need:

```glsl
// 11. False Color (diagnostic overlay - replaces color)
if (u_falseColorEnabled) {
    float fcLuma = dot(color.rgb, LUMA);
    float lumaSDR = clamp(fcLuma, 0.0, 1.0);
    color.rgb = texture(u_falseColorLUT, vec2(lumaSDR, 0.5)).rgb;
}
```

By uploading HSV or Random LUT data into the same texture, this code automatically performs the correct luminance-to-color mapping. No shader modification is needed for HSV and Random Color modes.

### Phase 11b: Contour Visualization (New)

Add after the existing Phase 11 false color block:

```glsl
// 11b. Contour iso-lines (diagnostic overlay - edge detection on luminance)
uniform bool u_contourEnabled;
uniform float u_contourLevels;      // 2.0 to 50.0
uniform bool u_contourDesaturate;
uniform vec3 u_contourLineColor;    // normalized RGB [0,1]

// ... inside main():
if (u_contourEnabled) {
    float cLuma = dot(color.rgb, LUMA);
    float quantC = floor(cLuma * u_contourLevels) / u_contourLevels;

    // Sample 4-connected neighbors using texelFetch for exact pixel access
    ivec2 texSize = textureSize(u_texture, 0);
    ivec2 pixelCoord = ivec2(v_texCoord * vec2(texSize));

    // Clamp neighbor coordinates to texture bounds
    ivec2 left  = ivec2(max(pixelCoord.x - 1, 0), pixelCoord.y);
    ivec2 right = ivec2(min(pixelCoord.x + 1, texSize.x - 1), pixelCoord.y);
    ivec2 up    = ivec2(pixelCoord.x, max(pixelCoord.y - 1, 0));
    ivec2 down  = ivec2(pixelCoord.x, min(pixelCoord.y + 1, texSize.y - 1));

    float lumL = dot(texelFetch(u_texture, left, 0).rgb, LUMA);
    float lumR = dot(texelFetch(u_texture, right, 0).rgb, LUMA);
    float lumU = dot(texelFetch(u_texture, up, 0).rgb, LUMA);
    float lumD = dot(texelFetch(u_texture, down, 0).rgb, LUMA);

    float qL = floor(lumL * u_contourLevels) / u_contourLevels;
    float qR = floor(lumR * u_contourLevels) / u_contourLevels;
    float qU = floor(lumU * u_contourLevels) / u_contourLevels;
    float qD = floor(lumD * u_contourLevels) / u_contourLevels;

    bool isContour = (qL != quantC) || (qR != quantC) || (qU != quantC) || (qD != quantC);

    if (isContour) {
        color.rgb = u_contourLineColor;
    } else if (u_contourDesaturate) {
        // Desaturate non-contour pixels: blend toward luminance grey
        float grey = cLuma;
        color.rgb = mix(color.rgb, vec3(grey), 0.5);
    }
}
```

### Shader Uniform Summary

| Uniform | Type | Default | Used By |
|---|---|---|---|
| `u_falseColorEnabled` | `bool` | `false` | HSV, Random, FalseColor (existing) |
| `u_falseColorLUT` | `sampler2D` | -- | HSV, Random, FalseColor (existing) |
| `u_contourEnabled` | `bool` | `false` | Contour (new) |
| `u_contourLevels` | `float` | `10.0` | Contour (new) |
| `u_contourDesaturate` | `bool` | `true` | Contour (new) |
| `u_contourLineColor` | `vec3` | `(1.0, 1.0, 1.0)` | Contour (new) |

### Contour: texelFetch vs texture()

The contour shader uses `texelFetch(u_texture, coord, 0)` rather than `texture()` for neighbor sampling. This is critical because:

1. **Exact pixel access**: `texelFetch` reads exact integer pixel coordinates, avoiding bilinear interpolation that would smear quantization boundaries.
2. **No filtering artifacts**: With `texture()` and `NEAREST` filtering, sub-texel coordinate precision could cause off-by-one pixel reads.
3. **WebGL2 native**: `texelFetch` is a core GLSL ES 3.0 feature, available in all WebGL2 implementations.

Note: In the monolithic shader, `u_texture` is the source image texture. In the multi-pass pipeline's `diagnostics` stage, `u_inputTexture` (the ping-pong FBO texture) would be sampled instead. The contour code must use the correct sampler name depending on the pipeline mode.

### Multi-Pass Pipeline Consideration

In the `ShaderPipeline`, the `diagnostics` stage receives the output of all prior stages via `u_inputTexture`. The contour shader's `texelFetch` calls should sample `u_inputTexture`, not the original `u_texture`. The stage's `fragmentSource` would need to declare `u_inputTexture` as the sampler. Since the existing diagnostics stage in the monolithic shader uses `u_texture` (which is the source at that point in the monolithic flow), and the multi-pass pipeline maps `u_inputTexture` to texture unit 0, the contour code should be written to sample `u_texture` in the monolithic path and conditionally use the correct sampler.

However, the simplest approach is to keep everything in the monolithic shader for now (matching the existing false color and zebra patterns) and defer multi-pass stage integration to a future PR. The monolithic path is the active rendering path used in production.

---

## UI Design

### No UI Changes Required

The existing `LuminanceVisualizationControl` already provides:

- Mode selector dropdown with buttons for Off, False Color, HSV, Random Color, Contour.
- Mode-specific sub-controls (HSV legend bar, Random band count slider + reseed button, Contour levels slider + presets + desaturate toggle).
- Badge overlay showing active mode and parameters.
- Keyboard shortcut `Shift+Alt+V` wired through `KeyBindings.ts` and `KeyboardActionMap.ts`.

The GPU migration is transparent to the UI layer. The `LuminanceVisualization` component continues to own state and emit events. The Viewer consumes the state and passes it to the renderer instead of calling `apply(imageData)`.

### Future Enhancement: Contour Line Color Picker

The `LuminanceVisualizationControl` currently has `setContourLineColor()` API but no UI color picker for it. This could be added as a follow-up, using a simple color input element in the contour sub-controls. Not part of this implementation.

---

## Implementation Steps

### Step 1: Add Luminance Vis State to RenderState

**Files:** `src/render/RenderState.ts`

Add a new field to `RenderState`:

```typescript
export interface LuminanceVisRenderState {
  mode: 'off' | 'hsv' | 'random-color' | 'contour';
  // HSV/Random modes: the 256-entry LUT is passed via falseColor.lut
  // Contour mode:
  contourLevels: number;
  contourDesaturate: boolean;
  contourLineColor: [number, number, number]; // RGB normalized 0-1
}

export interface RenderState {
  // ... existing fields ...
  luminanceVis?: LuminanceVisRenderState;
}
```

### Step 2: Expose LUT Data from LuminanceVisualization

**Files:** `src/ui/components/LuminanceVisualization.ts`

Add public accessors for the pre-computed LUT data so the ViewerGLRenderer can pass it to the shader:

```typescript
/** Get the pre-computed HSV LUT (256*3 Uint8Array) for GPU upload. */
getHsvLUT(): Uint8Array { return this.hsvLUT; }

/** Get the pre-computed random palette (bandCount*3 Uint8Array) for GPU upload. */
getRandomLUT(): Uint8Array { return this.randomLUT; }

/**
 * Expand the random palette to a 256-entry LUT for GPU upload.
 * Maps each luminance index [0-255] to its band color.
 */
buildRandomLUT256(): Uint8Array {
  const lut = new Uint8Array(256 * 3);
  const bandCount = this.state.randomBandCount;
  const palette = this.randomLUT;
  for (let i = 0; i < 256; i++) {
    const lum = i / 255;
    const band = Math.min(Math.floor(lum * bandCount), bandCount - 1);
    lut[i * 3] = palette[band * 3]!;
    lut[i * 3 + 1] = palette[band * 3 + 1]!;
    lut[i * 3 + 2] = palette[band * 3 + 2]!;
  }
  return lut;
}
```

### Step 3: Wire Luminance Vis into ViewerGLRenderer.buildRenderState()

**Files:** `src/ui/components/ViewerGLRenderer.ts`

In `buildRenderState()`, read the luminance vis state and inject it into the render state. When the mode is `hsv` or `random-color`, override the `falseColor` field with the appropriate LUT:

```typescript
const lumVis = this.ctx.getLuminanceVisualization();
const lumVisMode = lumVis.getMode();

// For HSV and Random modes, drive the GPU false color LUT with the luminance vis LUT
if (lumVisMode === 'hsv') {
  state.falseColor = { enabled: true, lut: lumVis.getHsvLUT() };
} else if (lumVisMode === 'random-color') {
  state.falseColor = { enabled: true, lut: lumVis.buildRandomLUT256() };
}

// Pass contour state for GPU processing
state.luminanceVis = {
  mode: lumVisMode === 'false-color' ? 'off' : lumVisMode, // false-color handled by existing path
  contourLevels: lumVis.getState().contourLevels,
  contourDesaturate: lumVis.getState().contourDesaturate,
  contourLineColor: [
    lumVis.getState().contourLineColor[0] / 255,
    lumVis.getState().contourLineColor[1] / 255,
    lumVis.getState().contourLineColor[2] / 255,
  ],
};
```

This also requires adding `getLuminanceVisualization()` to the `ViewerGLRendererContext` interface if not already there. Currently `Viewer.ts` exposes it, but the GL renderer context needs access through the same interface used for `getFalseColor()` and `getZebraStripes()`.

### Step 4: Add Contour Uniforms to ShaderStateManager

**Files:** `src/render/ShaderStateManager.ts`

Add contour fields to `InternalShaderState`:

```typescript
// Contour visualization
contourEnabled: boolean;
contourLevels: number;
contourDesaturate: boolean;
contourLineColor: [number, number, number];
```

Add a new dirty flag:

```typescript
export const DIRTY_CONTOUR = 'contour';
```

Add to `ALL_DIRTY_FLAGS` array.

Add defaults in `createDefaultInternalState()`:

```typescript
contourEnabled: false,
contourLevels: 10,
contourDesaturate: true,
contourLineColor: [1.0, 1.0, 1.0],
```

In `applyRenderState()`, read `renderState.luminanceVis`:

```typescript
if (renderState.luminanceVis) {
  const lv = renderState.luminanceVis;
  const contourEnabled = lv.mode === 'contour';
  if (s.contourEnabled !== contourEnabled ||
      s.contourLevels !== lv.contourLevels ||
      s.contourDesaturate !== lv.contourDesaturate ||
      s.contourLineColor[0] !== lv.contourLineColor[0] ||
      s.contourLineColor[1] !== lv.contourLineColor[1] ||
      s.contourLineColor[2] !== lv.contourLineColor[2]) {
    s.contourEnabled = contourEnabled;
    s.contourLevels = lv.contourLevels;
    s.contourDesaturate = lv.contourDesaturate;
    s.contourLineColor = [...lv.contourLineColor];
    this.dirtyFlags.add(DIRTY_CONTOUR);
  }
}
```

In `applyUniforms()`, add the contour block:

```typescript
if (this.dirtyFlags.has(DIRTY_CONTOUR)) {
  shader.setUniformBool('u_contourEnabled', s.contourEnabled);
  shader.setUniformFloat('u_contourLevels', s.contourLevels);
  shader.setUniformBool('u_contourDesaturate', s.contourDesaturate);
  shader.setUniformVec3('u_contourLineColor', s.contourLineColor);
}
```

### Step 5: Add Contour Uniforms to Fragment Shader

**Files:** `src/render/shaders/viewer.frag.glsl`

Add uniform declarations near the existing false color uniforms (around line 62-63):

```glsl
// Contour iso-lines (luminance visualization)
uniform bool u_contourEnabled;
uniform float u_contourLevels;      // 2.0 to 50.0
uniform bool u_contourDesaturate;   // desaturate non-contour pixels
uniform vec3 u_contourLineColor;    // normalized RGB
```

Add the contour processing block after Phase 11 (false color), before Phase 12 (zebra stripes), around line 1366:

```glsl
// 11b. Contour iso-lines (luminance visualization - neighbor edge detection)
if (u_contourEnabled) {
    float cLuma = dot(color.rgb, LUMA);
    float quantC = floor(cLuma * u_contourLevels) / u_contourLevels;

    ivec2 texSize = textureSize(u_texture, 0);
    ivec2 pc = ivec2(v_texCoord * vec2(texSize));

    ivec2 left  = ivec2(max(pc.x - 1, 0), pc.y);
    ivec2 right = ivec2(min(pc.x + 1, texSize.x - 1), pc.y);
    ivec2 up    = ivec2(pc.x, max(pc.y - 1, 0));
    ivec2 down  = ivec2(pc.x, min(pc.y + 1, texSize.y - 1));

    float qL = floor(dot(texelFetch(u_texture, left, 0).rgb, LUMA) * u_contourLevels) / u_contourLevels;
    float qR = floor(dot(texelFetch(u_texture, right, 0).rgb, LUMA) * u_contourLevels) / u_contourLevels;
    float qU = floor(dot(texelFetch(u_texture, up, 0).rgb, LUMA) * u_contourLevels) / u_contourLevels;
    float qD = floor(dot(texelFetch(u_texture, down, 0).rgb, LUMA) * u_contourLevels) / u_contourLevels;

    bool isContour = (qL != quantC) || (qR != quantC) || (qU != quantC) || (qD != quantC);

    if (isContour) {
        color.rgb = u_contourLineColor;
    } else if (u_contourDesaturate) {
        color.rgb = mix(color.rgb, vec3(cLuma), 0.5);
    }
}
```

### Step 6: Add Contour Setter to StateAccessor Interface

**Files:** `src/render/StateAccessor.ts`

No new method needed. The contour state is part of `RenderState.luminanceVis`, which is consumed by `applyRenderState()`. The existing `applyRenderState(renderState: RenderState)` method handles all state.

### Step 7: Skip CPU Apply When GPU Renderer Active

**Files:** `src/ui/components/Viewer.ts`

The Viewer currently calls `luminanceVisualization.apply(imageData)` in the CPU path. When the GL renderer is active, the GPU shader handles visualization, so the CPU `apply()` call should be skipped. However, the current architecture already handles this correctly:

- When the GL renderer is active (`isGLRendererActive()` is true), `applyPixelEffects()` and `applyLightweightEffects()` are called on the Canvas2D context for the non-GL path.
- The GL path uses `buildRenderState()` -> `renderer.applyRenderState()` -> shader uniforms.

The key change is that `buildRenderState()` must populate `falseColor.lut` with the correct LUT for HSV/Random modes. The existing Viewer code that checks `hasLuminanceVis` in the CPU path continues to work as a fallback.

However, there is a subtle interaction: when the GL renderer is active, `buildRenderState()` already sets `falseColor.enabled` based on `FalseColor.isEnabled()`. The luminance vis override in Step 3 must take precedence. The order in `buildRenderState()` should be:

```typescript
// 1. Start with false color state from FalseColor component
falseColor: { enabled: fc.isEnabled(), lut: fc.getColorLUT() },

// 2. Override with luminance vis LUT if HSV or Random mode
// (done after the initial state construction)
```

### Step 8: Update Tests

**Files:**
- `src/render/ShaderStateManager.test.ts` -- Add tests for contour dirty flag, uniform upload, and state transitions.
- `src/render/Renderer.test.ts` -- Add tests for luminance vis LUT upload via the false color texture path.
- `src/ui/components/LuminanceVisualization.test.ts` -- Add tests for `buildRandomLUT256()` and `getHsvLUT()` accessors.
- `src/ui/components/ViewerGLRenderer.test.ts` -- Add tests for `buildRenderState()` luminance vis integration.

Key test scenarios:
1. HSV mode sets `falseColor.enabled=true` and uploads the HSV LUT.
2. Random color mode sets `falseColor.enabled=true` and uploads a 256-entry expanded random LUT.
3. Contour mode sets `contourEnabled=true` with correct levels/desaturate/lineColor.
4. Switching modes clears the previous mode's state (e.g., HSV->Contour disables falseColorEnabled and enables contourEnabled).
5. Mode `'off'` disables both falseColorEnabled and contourEnabled.
6. False color mode continues to use the standard false color LUT from `FalseColor.getColorLUT()`.
7. `buildRandomLUT256()` correctly expands N-band palette to 256 entries.
8. Band count changes regenerate the random LUT.
9. Contour levels, desaturate, and line color changes mark `DIRTY_CONTOUR`.

### Step 9: Verify Visual Parity

Manual verification steps:
1. Load a gradient test image (black to white horizontal ramp).
2. Enable each luminance vis mode (HSV, Random, Contour) and compare GPU output to the existing CPU output.
3. Verify that HSV produces the red-green-cyan-blue-magenta rainbow across the gradient.
4. Verify that Random Color produces uniform color bands with sharp boundaries.
5. Verify that Contour produces lines at luminance boundaries with desaturated regions between.
6. Toggle between GL and Canvas2D rendering and confirm visual parity.
7. Test at 4K resolution and measure frame time to confirm < 2ms overhead.

---

## Files to Create/Modify

### Modified Files

| File | Changes |
|---|---|
| `src/render/RenderState.ts` | Add `LuminanceVisRenderState` interface and optional `luminanceVis` field to `RenderState`. |
| `src/render/ShaderStateManager.ts` | Add `DIRTY_CONTOUR` flag, contour fields to `InternalShaderState`, state defaults, `applyRenderState()` contour handling, `applyUniforms()` contour uniform upload. |
| `src/render/StateAccessor.ts` | No changes needed (uses `applyRenderState`). |
| `src/render/shaders/viewer.frag.glsl` | Add contour uniform declarations and Phase 11b contour processing block. |
| `src/ui/components/LuminanceVisualization.ts` | Add `getHsvLUT()`, `getRandomLUT()`, `buildRandomLUT256()` public accessors. |
| `src/ui/components/ViewerGLRenderer.ts` | Update `buildRenderState()` to inject luminance vis LUT data and contour state. Add `getLuminanceVisualization()` to context interface if needed. |
| `src/ui/components/Viewer.ts` | Update ViewerGLRendererContext to expose `getLuminanceVisualization()`. |
| `src/render/ShaderStateManager.test.ts` | Add contour state tests. |
| `src/ui/components/LuminanceVisualization.test.ts` | Add LUT accessor tests. |
| `src/ui/components/ViewerGLRenderer.test.ts` | Add luminance vis buildRenderState tests. |

### No New Files Needed

The implementation reuses existing infrastructure (false color LUT texture, shader uniform system, dirty flags). No new shader files, components, or modules are created.

---

## Risks

### 1. Contour `texelFetch` on Transformed Coordinates

**Risk**: The monolithic shader applies pan/zoom/rotation via the vertex shader. `texelFetch` uses integer texel coordinates derived from `v_texCoord * textureSize`. After pan/zoom, `v_texCoord` maps to the visible region of the texture, so `texelFetch` should still sample the correct neighbors. However, when rotation is applied (`u_texRotation`), the texture coordinate mapping changes and neighbor directions (left/right/up/down) may not correspond to screen-space neighbors.

**Mitigation**: Contour detection operates on luminance boundaries in texture space, not screen space. This is acceptable behavior -- contours follow the image content regardless of rotation. The CPU path has the same behavior (it processes the rotated ImageData).

### 2. Floating-Point Quantization Precision

**Risk**: In the contour shader, comparing `floor(luma * levels) / levels` between neighbors with `!=` operator may produce false positives or negatives due to floating-point precision differences across texture fetches.

**Mitigation**: Use `abs(qL - quantC) > epsilon` instead of `qL != quantC`, where `epsilon = 0.5 / u_contourLevels`. This is more robust. The CPU code uses integer-based `Math.floor()` which has exact semantics, but the GPU path works in float where rounding can differ.

### 3. False Color LUT Override Conflict

**Risk**: If the user enables FalseColor independently (via the FalseColor component, not through luminance vis) while also having luminance vis in HSV/Random mode, the `buildRenderState()` override could create confusing behavior.

**Mitigation**: The luminance vis modes are mutually exclusive with false color by design. `LuminanceVisualization.setMode('false-color')` enables the FalseColor component, and switching to any other mode disables it. The `buildRenderState()` override in Step 3 only applies when `lumVisMode` is `'hsv'` or `'random-color'`, which cannot co-exist with false color enabled. The existing Viewer precedence chain (`hasLuminanceVis ? lumVis : hasFalseColor ? falseColor`) already enforces this.

### 4. Random LUT Regeneration on Every Frame

**Risk**: `buildRandomLUT256()` allocates a new `Uint8Array(768)` and performs 256 iterations. If called every frame in `buildRenderState()`, this creates GC pressure.

**Mitigation**: Cache the expanded 256-entry LUT in `LuminanceVisualization` and only regenerate it when `randomBandCount` or `randomSeed` changes. Add a `private randomLUT256: Uint8Array | null` field that is invalidated in `setRandomBandCount()` and `reseedRandom()`.

### 5. Contour Performance at 4K

**Risk**: Contour mode performs 4 additional texture fetches per pixel (left, right, up, down) plus 4 luminance dot products and 4 quantization operations. At 4K (3840x2160 = 8.3M pixels), this is 33M extra texture fetches per frame.

**Mitigation**: Modern GPUs handle texture cache hits efficiently for adjacent-pixel access patterns. The 4-connected neighborhood has excellent cache locality. Benchmarking on mid-range GPUs (e.g., Apple M1, Intel UHD 630) should confirm that this stays under 2ms. If performance is insufficient, the contour shader can be simplified to 2-connected (right + down only) neighbors, which halves the work while still producing visible contour lines.

### 6. Multi-Pass Pipeline Stage Compatibility

**Risk**: The contour shader uses `texelFetch(u_texture, ...)` which works in the monolithic shader where `u_texture` is the source image. In the multi-pass pipeline's `diagnostics` stage, the input comes from `u_inputTexture` (the ping-pong FBO), not `u_texture`.

**Mitigation**: For the initial implementation, contour is added only to the monolithic shader path, which is the active production path. Multi-pass pipeline integration would require the `diagnostics` stage fragment shader to declare its own contour code using `u_inputTexture`. This can be done as a follow-up when multi-pass pipeline adoption is complete.

### 7. Canvas2D Fallback Regression

**Risk**: Modifying `buildRenderState()` to inject luminance vis LUT data into `falseColor` could affect the Canvas2D fallback path if the false color component's state is modified as a side effect.

**Mitigation**: `buildRenderState()` constructs a new state object for each render frame. It reads from the `FalseColor` component's state but does not write back to it. The luminance vis LUT override is local to the `RenderState` object and does not affect the `FalseColor` component's internal state. The CPU fallback path continues to call `luminanceVisualization.apply(imageData)` directly, bypassing the render state entirely.
