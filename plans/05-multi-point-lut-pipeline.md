# Multi-Point LUT Pipeline - Implementation Plan

## Overview

Desktop OpenRV provides four LUT insertion points in the imaging chain: Pre-Cache (software, per-source), File (GPU, per-source input transform), Look (GPU, per-source creative grade), and Display (GPU, session-wide calibration). The web version currently has a partially-implemented multi-point pipeline with state management and UI scaffolding in place, but the GPU stages are not integrated into the main rendering shader. The single-LUT `u_lut3D` uniform in `viewer.frag.glsl` serves as the only active LUT application point.

This plan details how to complete the integration so that all four LUT stages apply correctly in the rendering pipeline, drag-and-drop import routes LUTs to the correct slot with smart target detection, per-slot enable/disable and intensity controls function end-to-end, and the UI accurately reflects active slots.

### Goal

Replace the single-LUT application point (`u_lut3D` in the monolithic shader) with a four-point LUT pipeline that operates within the existing `viewer.frag.glsl` single-pass architecture, avoiding the overhead of multi-pass FBO ping-pong for LUT application alone.

---

## Current State

### What Exists

**State management (complete):**
- `LUTPipeline` (`src/color/pipeline/LUTPipeline.ts`) -- orchestrator with per-source Pre-Cache/File/Look + session-wide Display state, event emitter, serialization.
- `LUTStage` (`src/color/pipeline/LUTStage.ts`) -- per-stage load/clear/enable/intensity/matrix management.
- `LUTPipelineState` (`src/color/pipeline/LUTPipelineState.ts`) -- TypeScript interfaces for all state shapes.
- `PreCacheLUTStage` (`src/color/pipeline/PreCacheLUTStage.ts`) -- CPU-side LUT application with bit-depth reformatting and matrix support.

**GPU chain (standalone, not integrated into main shader):**
- `GPULUTChain` (`src/color/pipeline/GPULUTChain.ts`) -- separate WebGL2 shader program with its own fullscreen quad, applying File/Look/Display LUTs via three `sampler3D` uniforms. Operates in a standalone GL context (its own canvas), not within the Renderer's context. Its `applyToCanvas()` method does `getImageData()` -> GPU upload -> render -> `readPixels()` -> `putImageData()`, which is a full CPU round-trip that destroys HDR/wide-gamut precision by truncating to 8-bit `Uint8ClampedArray`.

**UI (complete):**
- `LUTPipelinePanel` (`src/ui/components/LUTPipelinePanel.ts`) -- four-stage panel with source selector, help popover, reset, close.
- `LUTStageControl` (`src/ui/components/LUTStageControl.ts`) -- per-stage widget with file load, clear, enable toggle, intensity slider, source selector (manual/OCIO).
- Integrated into `AppControlRegistry`, keyboard shortcuts (`Shift+L`), Color Tab toolbar button.

**Format support (complete):**
- `LUTLoader.ts` -- `.cube` parser (1D and 3D), `createLUTTexture`, software `applyLUT3D`/`applyLUT1D`.
- `LUTFormats.ts` -- `.3dl`, `.csp`, `.itx`, `.look`, `.lut` (Houdini), `.nk` (Nuke), `.mga` (Pandora), `RV3DLUT`, `RVCHANNELLUT`.
- `LUTFormatDetect.ts` -- extension + content sniffing, unified `parseLUT()`.
- `LUTPresets.ts` -- 10 programmatic film emulation presets generating 17^3 3D LUTs.
- `LUTUtils.ts` -- matrix sanitization, color matrix application, reorder helpers.

**Wiring (partial):**
- `Viewer.syncLUTPipeline()` (`src/ui/components/Viewer.ts:2358`) synchronizes pipeline state to `GPULUTChain` and routes pre-cache LUT through the single-LUT `setLUT()` path.
- `AppColorWiring.ts` listens for `pipelineChanged` events on `LUTPipelinePanel` and calls `syncLUTPipeline()`.
- `ColorPipelineManager` (`src/ui/components/ColorPipelineManager.ts`) initializes `GPULUTChain` and `LUTPipeline`.

**Monolithic shader (single LUT only):**
- `viewer.frag.glsl` has one `sampler3D u_lut3D` uniform applied at step 6d (after CDL, curves, color wheels; before HSL qualifier).
- `ShaderStateManager` tracks `lut3DEnabled`, `lut3DIntensity`, `lut3DSize`, `lut3DData` as a single slot.
- The 3D LUT texture is bound to texture unit 3.

### What Is Missing

1. **Shader integration**: The monolithic `viewer.frag.glsl` has no File/Look/Display LUT uniforms. The existing `u_lut3D` is used as a generic single-LUT slot, not as a specific pipeline stage.

2. **Renderer texture management**: The `Renderer` class manages one `lut3DTexture`. There is no mechanism for multiple LUT textures (file, look, display) in the main rendering context.

3. **Pipeline position**: File LUT should apply *before* the input primaries conversion and color corrections (exposure, CDL, curves); the current `u_lut3D` applies *after* them. Look LUT correctly follows corrections. Display LUT should apply after tone mapping/gamut mapping, before display transfer.

4. **Domain min/max support**: The existing `applyLUT3D()` function in the shader hardcodes a `[0, 1]` domain. The `LUT3D` interface in `LUTLoader.ts` supports `domainMin`/`domainMax` per channel, and `GPULUTChain` correctly handles non-unit domains. The inline shader must preserve this capability.

5. **1D LUT support in GPU slots**: The `LUT` type is a union of `LUT3D | LUT1D`. Many production LUTs are 1D (gamma curves, simple log-to-linear transforms). The current `syncLUTPipeline()` silently drops 1D LUTs via `isLUT3D()` filtering. A CPU-side 1D-to-3D bake is needed so users can load 1D `.cube` files into any GPU slot.

6. **Drag-and-drop smart routing**: LUT files dropped on the viewer go through generic file loading, not to a specific pipeline stage.

7. **GPULUTChain integration gap**: `GPULUTChain` runs in its own GL context with a separate shader. Its output is never composited back into the main render. It is essentially dead code in the current render path.

8. **Pre-cache CPU path**: `PreCacheLUTStage.apply()` exists but is never called during frame decode. The pre-cache LUT is routed through the GPU `u_lut3D` path instead.

---

## Proposed Pipeline Architecture

### Design Decision: Inline in Monolithic Shader (Recommended)

Rather than using `GPULUTChain`'s separate multi-pass approach (which requires pixel readback or FBO blit between GL contexts), extend the existing `viewer.frag.glsl` monolithic shader with three additional `sampler3D` uniforms. This:

- Avoids context-switching overhead between the Renderer's GL context and GPULUTChain's context.
- Keeps the single-pass architecture (no extra FBO passes just for LUTs).
- Leverages existing `ShaderStateManager` dirty-flag optimization.
- Is consistent with how all other effects (CDL, curves, tone mapping) are integrated.
- Maintains full `highp float` (32-bit) precision throughout, unlike `GPULUTChain.applyToCanvas()` which truncates to 8-bit.
- Uses three additional texture units (6, 7, 8) out of the 16 available in WebGL2 (units 0-5 are already allocated: source, curves, false color, lut3D, film, inline LUT).

### New Pipeline Order in `viewer.frag.glsl`

```
Phase 0: Input decode (deinterlace, perspective, spherical, swizzle, unpremultiply)
Phase 0c-0d: Linearize, EOTF

NEW Phase 0e-alt: File LUT (u_fileLUT3D) -- per-source, file-to-working-space
                  When active, BYPASSES automatic input primaries conversion (step 0e),
                  because the File LUT (IDT) is expected to handle the full input device
                  transform including primaries. When inactive, input primaries (step 0e)
                  applies normally.

Phase 0e: Input primaries (only when File LUT is NOT active)

Phase 1-5: Exposure, scale/offset, inline LUT, temp/tint, brightness, contrast,
           saturation, highlights/shadows, vibrance, hue rotation, clarity

Phase 6: Color grading (color wheels, CDL, curves, HSL qualifier, film emulation)

Phase 6d: Look LUT (u_lookLUT3D) -- rename existing u_lut3D to u_lookLUT3D

Phase 6e-6g: HSL qualifier, film emulation, out-of-range

Phase 7: Tone mapping, gamut mapping
Phase 7b: Sharpen
Phase 7c: Output primaries

NEW Phase 7d: Display LUT (u_displayLUT3D) -- session-wide, after output primaries,
              before display transfer

Phase 8: Display transfer, gamma, brightness
Phase 9-13: Inversion, channel isolation, false color, zebra, dither, compositing
```

**Key change from original draft**: The File LUT is placed between EOTF (step 0d) and input primaries (step 0e), not after input primaries. When the File LUT is active, the automatic input primaries conversion is bypassed for that source. This matches how ACES IDTs and OCIO file-level transforms work -- the File LUT encompasses both the transfer function inversion and the primaries conversion from camera-native to working space. Applying input primaries before the File LUT would double-convert, producing incorrect colors.

### Texture Unit Allocation

| Unit | Current Use          | New Use                |
|------|---------------------|------------------------|
| 0    | Source image         | Source image (unchanged) |
| 1    | Curves LUT (2D)     | Curves LUT (unchanged)  |
| 2    | False Color LUT (2D)| False Color (unchanged) |
| 3    | 3D LUT (single)     | Look LUT (renamed)      |
| 4    | Film emulation (2D) | Film emulation (unchanged)|
| 5    | Inline 1D LUT (2D)  | Inline 1D LUT (unchanged)|
| 6    | *unused*            | **File LUT (3D)**       |
| 7    | *unused*            | **Display LUT (3D)**    |

This stays well within the WebGL2 minimum guarantee of 16 texture units per fragment shader.

---

## Shader Changes

### New Uniforms in `viewer.frag.glsl`

```glsl
// File LUT (per-source, applied after EOTF, before/instead-of input primaries)
uniform sampler3D u_fileLUT3D;
uniform bool u_fileLUT3DEnabled;
uniform float u_fileLUT3DIntensity;
uniform float u_fileLUT3DSize;
uniform vec3 u_fileLUT3DDomainMin;
uniform vec3 u_fileLUT3DDomainMax;

// Look LUT (renamed from u_lut3D -- per-source, creative grade)
uniform sampler3D u_lookLUT3D;
uniform bool u_lookLUT3DEnabled;
uniform float u_lookLUT3DIntensity;
uniform float u_lookLUT3DSize;
uniform vec3 u_lookLUT3DDomainMin;
uniform vec3 u_lookLUT3DDomainMax;

// Display LUT (session-wide, applied after output primaries, before display transfer)
uniform sampler3D u_displayLUT3D;
uniform bool u_displayLUT3DEnabled;
uniform float u_displayLUT3DIntensity;
uniform float u_displayLUT3DSize;
uniform vec3 u_displayLUT3DDomainMin;
uniform vec3 u_displayLUT3DDomainMax;

// Pre-allocated for future matrix support (unused in Phase 1, optimized out by compiler)
uniform mat4 u_fileLUT3DInMatrix;
uniform mat4 u_fileLUT3DOutMatrix;
uniform mat4 u_lookLUT3DInMatrix;
uniform mat4 u_lookLUT3DOutMatrix;
uniform mat4 u_displayLUT3DInMatrix;
uniform mat4 u_displayLUT3DOutMatrix;
```

The existing `u_lut3D`, `u_lut3DEnabled`, `u_lut3DIntensity`, `u_lut3DSize` uniforms are renamed to `u_lookLUT3D*` in Phase 1. This rename is mechanical (search-and-replace across `ShaderStateManager.ts`, `viewer.frag.glsl`, and `Renderer.ts`) and avoids semantic confusion where future contributors would not know that "lut3D" means "Look LUT." Domain min/max uniforms are added to the Look LUT slot as well, fixing the existing lack of domain support.

### New Shared Function

```glsl
// Generic 3D LUT application with domain mapping, trilinear interpolation, and intensity blend
vec3 applyLUT3DGeneric(sampler3D lut, vec3 color, float lutSize, float intensity,
                       vec3 domainMin, vec3 domainMax) {
  vec3 normalized = (color - domainMin) / (domainMax - domainMin);
  normalized = clamp(normalized, 0.0, 1.0);
  float offset = 0.5 / lutSize;
  float scale = (lutSize - 1.0) / lutSize;
  vec3 lutCoord = normalized * scale + offset;
  vec3 lutColor = texture(lut, lutCoord).rgb;
  return mix(color, lutColor, intensity);
}
```

This correctly handles LUTs with non-unit domains (e.g., `.cube` files with `DOMAIN_MIN -0.1 -0.1 -0.1` for camera negative values), matching the behavior of the existing `GPULUTChain` shader. For LUTs with default `[0,1]` domain, `domainMin` is set to `vec3(0.0)` and `domainMax` to `vec3(1.0)` by the state manager.

### Insertion Points in `main()`

**File LUT** -- after phase 0d (EOTF), replacing/bypassing phase 0e (input primaries):

```glsl
// 0e-alt. File LUT (per-source input device transform)
// When active, bypasses automatic input primaries conversion
if (u_fileLUT3DEnabled) {
  color.rgb = applyLUT3DGeneric(u_fileLUT3D, color.rgb, u_fileLUT3DSize,
                                 u_fileLUT3DIntensity, u_fileLUT3DDomainMin,
                                 u_fileLUT3DDomainMax);
  // Skip input primaries -- the File LUT handles the full IDT
} else {
  // 0e. Normal input primaries conversion
  // (existing input primaries code stays here)
}
```

**Look LUT** -- at existing step 6d (renamed from `u_lut3D`):

```glsl
// 6d. Look LUT (per-source creative grade)
if (u_lookLUT3DEnabled) {
  color.rgb = applyLUT3DGeneric(u_lookLUT3D, color.rgb, u_lookLUT3DSize,
                                 u_lookLUT3DIntensity, u_lookLUT3DDomainMin,
                                 u_lookLUT3DDomainMax);
}
```

**Display LUT** -- new phase 7d, after output primaries (7c), before display transfer (8a):

```glsl
// 7d. Display LUT (session-wide display calibration)
if (u_displayLUT3DEnabled) {
  color.rgb = applyLUT3DGeneric(u_displayLUT3D, color.rgb, u_displayLUT3DSize,
                                 u_displayLUT3DIntensity, u_displayLUT3DDomainMin,
                                 u_displayLUT3DDomainMax);
}
```

---

## State Management Changes

### ShaderStateManager Extensions

Add new fields to `InternalShaderState`:

```typescript
// File LUT (per-source)
fileLUT3DEnabled: boolean;
fileLUT3DIntensity: number;
fileLUT3DSize: number;
fileLUT3DDirty: boolean;
fileLUT3DData: Float32Array | null;
fileLUT3DDomainMin: [number, number, number];
fileLUT3DDomainMax: [number, number, number];

// Look LUT (renamed from lut3D* -- per-source)
// Existing fields are renamed: lut3DEnabled -> lookLUT3DEnabled, etc.
// Add domain support:
lookLUT3DDomainMin: [number, number, number];
lookLUT3DDomainMax: [number, number, number];

// Display LUT (session-wide)
displayLUT3DEnabled: boolean;
displayLUT3DIntensity: number;
displayLUT3DSize: number;
displayLUT3DDirty: boolean;
displayLUT3DData: Float32Array | null;
displayLUT3DDomainMin: [number, number, number];
displayLUT3DDomainMax: [number, number, number];
```

Add new dirty flags: `DIRTY_FILE_LUT3D`, `DIRTY_DISPLAY_LUT3D`.

Add setter methods: `setFileLUT(data, size, intensity, domainMin?, domainMax?)`, `setDisplayLUT(data, size, intensity, domainMin?, domainMax?)`. Update existing `setLUT()` to `setLookLUT()` and add domain parameters.

Add texture snapshots: `getFileLUT3DSnapshot()`, `getDisplayLUT3DSnapshot()`.

**Critical: Sampler uniform initialization** -- The sampler unit assignments (`u_fileLUT3D = 6`, `u_displayLUT3D = 7`, `u_lookLUT3D = 3`) must be set once after the shader program is linked, in the shader initialization path (after `gl.useProgram`), not in the dirty-flag-gated `applyUniforms()` path. If sampler uniforms are only set when dirty, they default to unit 0 on first use, overriding the source image texture and causing rendering corruption. The existing code sets sampler uniforms inside `createTextureCallbacks` / `applyUniforms`; the new implementation must ensure these are set unconditionally on first use.

### RenderState Extensions

Extend `RenderState` interface:

```typescript
fileLUT: {
  data: Float32Array | null;
  size: number;
  intensity: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
};
displayLUT: {
  data: Float32Array | null;
  size: number;
  intensity: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
};
```

Update existing `lut` field to `lookLUT` with added `domainMin`/`domainMax`.

### Renderer Texture Management

Add to `Renderer`:

```typescript
private fileLUT3DTexture: WebGLTexture | null = null;
private displayLUT3DTexture: WebGLTexture | null = null;
```

Add `TextureCallbacks` methods: `bindFileLUT3DTexture()`, `bindDisplayLUT3DTexture()`.

Handle texture upload in `applyUniforms` when dirty flags are set, bind to units 6 and 7 respectively.

**Float texture filtering**: All LUT textures must be uploaded as `RGBA32F` (matching the existing `ensureLUT3DTexture` pattern) with `gl.LINEAR` filtering for correct trilinear interpolation. At renderer initialization, check for the `OES_texture_float_linear` extension. If unavailable, log a warning and fall back to `RGBA16F` (which supports linear filtering natively in WebGL2 without an extension). Without this check, `gl.LINEAR` on `RGBA32F` textures silently falls back to `gl.NEAREST` on unsupported devices, producing visible banding artifacts on LUT edges.

**LUT size validation**: Reject LUTs larger than 129^3 at parse time. Show a toast warning for LUTs larger than 65^3 on devices with limited VRAM (detected via `renderer.getParameter(gl.MAX_TEXTURE_SIZE)` or user-agent heuristics for mobile/integrated GPUs).

---

## 1D LUT Support in GPU Slots

The `LUT` type is `LUT3D | LUT1D`. Many production LUTs are 1D (gamma curves, simple log-to-linear transforms, channel-independent color correction). The plan uses `sampler3D` uniforms exclusively for GPU slots. To support 1D LUTs without adding extra sampler types:

**Phase 1 approach (CPU-side 1D-to-3D bake):** When a 1D LUT is assigned to a File, Look, or Display slot, bake it into a 3D LUT on the CPU by applying the 1D transform along the identity diagonal of a small 3D LUT (e.g., 33^3). This is how Resolve, Nuke, and OCIO handle mixed LUT types internally.

Implementation:
```typescript
function bake1DTo3D(lut1D: LUT1D, size: number = 33): LUT3D {
  const data = new Float32Array(size * size * size * 3);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const idx = (b * size * size + g * size + r) * 3;
        const rNorm = r / (size - 1);
        const gNorm = g / (size - 1);
        const bNorm = b / (size - 1);
        data[idx + 0] = sampleLUT1D(lut1D.r, rNorm);
        data[idx + 1] = sampleLUT1D(lut1D.g, gNorm);
        data[idx + 2] = sampleLUT1D(lut1D.b, bNorm);
      }
    }
  }
  return { type: '3d', size, data, domainMin: lut1D.domainMin, domainMax: lut1D.domainMax };
}
```

This preserves the single `sampler3D` approach per slot and avoids doubling the number of uniforms.

> **Review Note (Nice to Have):** A future Phase 2 could add native `sampler2D` uniforms per slot for 1D LUTs with a boolean selecting which sampler to use, which is cleaner but not necessary for the initial implementation.

---

## UI Design

### Current UI (Already Implemented)

The `LUTPipelinePanel` and `LUTStageControl` components are fully implemented with all four stages, source selector, enable/disable toggles, intensity sliders, and clear buttons. No major UI changes are needed.

The help popover in `LUTPipelinePanel` should include a brief mapping to OCIO terminology (input transform = File LUT, look = Look LUT, display = Display LUT) since many colorists are more familiar with OCIO terms than OpenRV terms.

### Drag-and-Drop Smart Target Detection

When a `.cube`/`.3dl`/etc. file is dropped on the viewer:

1. **Single file drop**: Show a stage-picker popover near the drop location with four buttons: "Pre-Cache", "File LUT", "Look LUT", "Display LUT". Highlight the recommended slot based on filename heuristics (as a *subtle visual hint*, not a pre-selection, to avoid accidental mis-routing):
   - Filename contains `log`, `linear`, `input`, `camera` --> File LUT
   - Filename contains `look`, `grade`, `show`, `creative` --> Look LUT
   - Filename contains `display`, `monitor`, `calibrat`, `output` --> Display LUT
   - Otherwise --> Look LUT (most common use case)

2. **Error handling**: The `LUTDropPicker` must catch `parseLUT()` errors and display a user-friendly toast notification rather than silently failing. Invalid or corrupt LUT files should produce a clear error message.

3. **Implementation**: Extend `ViewerInputHandler`'s drop handler to detect LUT file extensions, parse the file, and show the picker. The picker routes to `pipeline.setFileLUT()` / `pipeline.setLookLUT()` / `pipeline.setDisplayLUT()` accordingly, then triggers `syncLUTPipeline()` and render.

> **Review Note (Nice to Have):** The original plan proposed an `Alt`-key bypass to skip the picker and auto-route to the heuristic-recommended slot. Since filename heuristics are unreliable with production naming conventions (e.g., `PROJ_A042_v3.cube`), consider making this a preference setting instead of a modifier key, with "always show picker" as the default.

### Active Slots Indicator

Add a compact status bar below the viewer (or in the existing LUT indicator area) showing:
```
LUT: [F] [L] [D]
```
Where each letter lights up (colored) when the corresponding GPU stage has an active LUT. Clicking any letter opens the pipeline panel scrolled to that stage. Each badge should show the LUT filename as a tooltip on hover.

---

## Implementation Steps

### Phase 1: Shader & State Plumbing (Core)

1. **Rename `u_lut3D` to `u_lookLUT3D` across the codebase**
   - Search-and-replace `u_lut3D` -> `u_lookLUT3D` in `viewer.frag.glsl`, `ShaderStateManager.ts`, `Renderer.ts`, and related test files.
   - Rename state fields: `lut3DEnabled` -> `lookLUT3DEnabled`, etc.
   - Update public API: `setLUT()` -> `setLookLUT()` (keep `setLUT()` as a deprecated alias).
   - This is a mechanical change that must happen first to avoid semantic confusion during the rest of implementation.

2. **Add File LUT, Look LUT domain, and Display LUT uniforms to `viewer.frag.glsl`**
   - Add `u_fileLUT3D`, `u_fileLUT3DEnabled`, `u_fileLUT3DIntensity`, `u_fileLUT3DSize`, `u_fileLUT3DDomainMin`, `u_fileLUT3DDomainMax` declarations.
   - Add `u_displayLUT3D`, `u_displayLUT3DEnabled`, `u_displayLUT3DIntensity`, `u_displayLUT3DSize`, `u_displayLUT3DDomainMin`, `u_displayLUT3DDomainMax` declarations.
   - Add `u_lookLUT3DDomainMin`, `u_lookLUT3DDomainMax` to the renamed Look LUT slot.
   - Pre-allocate matrix uniform slots (`mat4 u_*LUT3DInMatrix`, `u_*LUT3DOutMatrix`) -- unused in Phase 1 but avoids shader recompile later.
   - Add `applyLUT3DGeneric()` helper function with domain min/max support.
   - Insert File LUT application after EOTF (line ~1025), *before* input primaries (line ~1027), with conditional bypass of input primaries when File LUT is active.
   - Update existing Look LUT application at step 6d to use `applyLUT3DGeneric()` with domain support.
   - Insert Display LUT application after output primaries (line ~1321), before display transfer (line ~1332).

3. **Extend `ShaderStateManager`**
   - Add `fileLUT3D*` and `displayLUT3D*` fields to `InternalShaderState` including domain min/max.
   - Add `lookLUT3DDomainMin`/`lookLUT3DDomainMax` to the renamed Look LUT fields.
   - Add `DIRTY_FILE_LUT3D` and `DIRTY_DISPLAY_LUT3D` to dirty flags.
   - Add `setFileLUT()` and `setDisplayLUT()` methods with optional domain parameters (default to `[0,0,0]` and `[1,1,1]`).
   - Add snapshot methods for texture upload coordination.
   - Update `applyUniforms()` to push new uniforms when dirty.
   - Update `setState()` to accept `fileLUT` and `displayLUT` in `RenderState`.
   - **Critical**: Ensure sampler uniform initialization (`u_fileLUT3D = 6`, `u_displayLUT3D = 7`, `u_lookLUT3D = 3`) happens once after shader link in the initialization path, NOT gated by dirty flags.

4. **Extend `Renderer` texture management**
   - Add `fileLUT3DTexture` and `displayLUT3DTexture` fields.
   - Add `TextureCallbacks` for binding to units 6 and 7.
   - Handle 3D texture upload (reuse `createLUTTexture` pattern from `LUTLoader.ts`, or the existing RGB-to-RGBA padding logic). Ensure textures are uploaded as `RGBA32F`.
   - Check for `OES_texture_float_linear` extension at init time. If unavailable, fall back to `RGBA16F` and log a warning.
   - Set sampler uniforms during initial uniform setup (not in dirty-flag path).
   - Clean up textures in `dispose()`.

5. **Implement 1D-to-3D LUT baking utility**
   - Add `bake1DTo3D(lut1D: LUT1D, size?: number): LUT3D` to `LUTUtils.ts`.
   - Integrate into the pipeline: when a `LUT1D` is assigned to any GPU slot, automatically bake it to 3D before uploading.
   - Add unit tests for the baking function (verify identity LUT, known 1D transforms).

6. **Extend `RenderState` interface**
   - Add `fileLUT` and `displayLUT` fields matching the existing `lut` field shape, with added `domainMin`/`domainMax`.
   - Update existing `lut` -> `lookLUT` with domain fields.

### Phase 2: Pipeline Integration

7. **Rewire `Viewer.syncLUTPipeline()`**
   - Replace the `GPULUTChain` calls with direct `ShaderStateManager`/`RenderState` updates.
   - Map `pipeline.fileLUT` --> `renderState.fileLUT` (data, size, intensity, enabled, domainMin, domainMax).
   - Map `pipeline.lookLUT` --> `renderState.lookLUT` (renamed from `renderState.lut`).
   - Map `pipeline.displayLUT` --> `renderState.displayLUT` (new path).
   - When assigning a `LUT1D` to any GPU slot, run it through `bake1DTo3D()` before setting render state.
   - Keep pre-cache routing through `PreCacheLUTStage.apply()` at decode time (Phase 3).

8. **Update `ColorPipelineManager`**
   - Add methods to push File/Look/Display LUT data to the renderer's state.
   - The existing `setLUT()`/`setLUTIntensity()` methods become deprecated aliases for the Look LUT path.
   - Add `setFileLUT()`, `setDisplayLUT()` convenience methods.
   - Handle OCIO conflict: when OCIO is active and uploads a baked 3D LUT, it takes the Look LUT slot. If the user also manually loads a Look LUT, document precedence (manual override wins; OCIO is re-applied when manual LUT is cleared).

9. **Implement per-source LUT texture caching**
   - Pre-upload all per-source LUT textures to GPU and cache them by source ID.
   - Switching sources becomes a texture bind (near-zero cost) rather than a texture upload.
   - A 65^3 RGBA32F 3D LUT is ~8.6 MB; synchronous `texImage3D` on source switch can stall for 1-5ms. Pre-caching avoids visible stalls during review sessions.
   - Note: The plan originally referenced a `TextureCacheManager` pattern, but this class does not exist in the codebase and must be created (or the caching logic can be integrated directly into `Renderer`).

10. **Deprecate `GPULUTChain` for main render path**
    - Since File/Look/Display LUTs are now applied inline in the monolithic shader, `GPULUTChain` becomes redundant for the main render path.
    - Keep it available for standalone/offline use (e.g., thumbnail generation, LUT preview).
    - Mark as `@deprecated` for main pipeline use.

### Phase 3: Pre-Cache CPU Integration

11. **Wire `PreCacheLUTStage.apply()` into frame decode**
    - In the frame decode path (wherever decoded `ImageData` enters the cache), check if the active source has a pre-cache LUT configured.
    - If so, run `PreCacheLUTStage.apply(imageData)` before the frame enters the GPU cache.
    - This requires identifying the decode callsite (likely in `FileSourceNode` or `MediabunnyFrameExtractor` output handling).
    - Cache the result so the pre-cache LUT is not re-applied every frame.

### Phase 4: Drag-and-Drop Smart Routing

12. **Extend `ViewerInputHandler` drop handler**
    - Detect LUT file extensions in the dropped files list.
    - Parse the LUT file content (with error handling -- catch `parseLUT()` failures and show toast).
    - Apply filename heuristics to suggest a target stage (as subtle highlight, not pre-selection).
    - Show a stage-picker popover (new `LUTDropPicker` component).
    - Call `pipeline.setFileLUT()` / `pipeline.setLookLUT()` / `pipeline.setDisplayLUT()` accordingly.
    - Trigger `syncLUTPipeline()` and render.

13. **Create `LUTDropPicker` UI component**
    - Temporary floating panel near the mouse position.
    - Four buttons: "Pre-Cache", "File", "Look", "Display".
    - Subtly highlight recommended target (not pre-selected).
    - Auto-dismiss on click or after timeout.

### Phase 5: Active Slots Indicator

14. **Enhance LUT status indicator**
    - Replace the current single "LUT: name" indicator with a multi-slot display.
    - Show colored badges for each active stage (P, F, L, D).
    - Wire click handlers to open `LUTPipelinePanel` at the relevant section.
    - Show LUT filename as tooltip on each badge.
    - Update on every `pipelineChanged` event.

### Phase 6: Testing

15. **Unit tests**
    - Test `ShaderStateManager.setFileLUT()` and `setDisplayLUT()` set dirty flags correctly.
    - Test domain min/max values are propagated to uniforms.
    - Test `applyUniforms()` pushes File/Display LUT uniforms when dirty.
    - Test texture callback invocations for units 6/7.
    - Test `RenderState` integration with File/Display LUT fields.
    - Test `bake1DTo3D()` produces correct output for known 1D transforms.
    - Test sampler uniform initialization is not gated by dirty flags.

16. **Integration tests**
    - Test `syncLUTPipeline()` routes all four stages correctly.
    - Test that enabling/disabling individual stages only affects that stage's uniform.
    - Test intensity blending at 0%, 50%, 100% for each stage.
    - Test per-source switching (change active source, verify LUT uniforms update).
    - Test 1D LUT loading into GPU slots (verify bake-to-3D path).
    - Test File LUT bypasses input primaries conversion.
    - Test domain min/max handling for non-unit-domain LUTs.

17. **E2E tests**
    - Extend existing `e2e/multi-point-lut-pipeline.spec.ts`.
    - Verify pixel-level output for a known LUT at each pipeline stage.
    - Verify chain ordering (File before corrections, Look after, Display last).
    - Verify drag-and-drop routing with filename heuristics.
    - Verify error toast on corrupt LUT file drop.

---

## Files to Create/Modify

### Files to Modify

| File | Changes |
|------|---------|
| `src/render/shaders/viewer.frag.glsl` | Rename `u_lut3D` to `u_lookLUT3D`; add File LUT and Display LUT uniforms with domain min/max; add `applyLUT3DGeneric()` function; pre-allocate matrix uniform slots; add File LUT application with input primaries bypass; add Display LUT application point; update Look LUT to use generic helper with domain support |
| `src/render/ShaderStateManager.ts` | Rename `lut3D*` to `lookLUT3D*`; add `fileLUT3D*` and `displayLUT3D*` state fields with domain min/max; add dirty flags; add setter methods; add snapshot methods; update `applyUniforms()`; ensure sampler init is not dirty-flag-gated |
| `src/render/RenderState.ts` | Rename `lut` to `lookLUT` with domain fields; add `fileLUT` and `displayLUT` fields |
| `src/render/Renderer.ts` | Rename LUT references; add `fileLUT3DTexture` and `displayLUT3DTexture`; texture upload/bind logic for units 6/7; `OES_texture_float_linear` check; `TextureCallbacks` extensions; cleanup in `dispose()` |
| `src/render/StateAccessor.ts` | Add `getFileLUT3DSnapshot()`, `getDisplayLUT3DSnapshot()` to interface |
| `src/ui/components/Viewer.ts` | Rewrite `syncLUTPipeline()` to route File/Look/Display through `ShaderStateManager` instead of `GPULUTChain`; integrate 1D-to-3D bake path |
| `src/ui/components/ColorPipelineManager.ts` | Add `setFileLUT()`, `setDisplayLUT()` methods; deprecate `setLUT()` as alias for Look; document OCIO precedence |
| `src/ui/components/LUTPipelinePanel.ts` | Add OCIO terminology mapping to help popover; wire up active-slot indicator updates |
| `src/color/pipeline/LUTUtils.ts` | Add `bake1DTo3D()` function |
| `src/services/controls/ControlGroups.ts` | No change needed (already has `lutPipelinePanel`) |
| `src/AppColorWiring.ts` | No change needed (already listens for `pipelineChanged`) |
| `src/render/ShaderStateManager.test.ts` | Add tests for new state fields, dirty flags, domain handling, sampler init |
| `src/render/Renderer.test.ts` | Add tests for File/Display LUT texture management, float filtering check |
| `e2e/multi-point-lut-pipeline.spec.ts` | Extend with rendering integration tests, domain tests, 1D LUT tests |

### Files to Create

| File | Purpose |
|------|---------|
| `src/ui/components/LUTDropPicker.ts` | Stage-picker popover for drag-and-drop LUT routing with error handling |
| `src/ui/components/LUTDropPicker.test.ts` | Unit tests for drag-and-drop picker including error cases |
| `src/ui/components/LUTStatusIndicator.ts` | Multi-slot active indicator widget (P/F/L/D badges) with tooltips |
| `src/ui/components/LUTStatusIndicator.test.ts` | Unit tests for status indicator |

### Files That May Be Deprecated

| File | Reason |
|------|--------|
| `src/color/pipeline/GPULUTChain.ts` | Replaced by inline shader integration; keep for standalone/offline use |
| `src/color/pipeline/GPULUTChain.test.ts` | Tests remain valid for standalone use |

---

## Risks

### 1. Texture Unit Exhaustion
**Risk**: Using 8 of 16 available texture units leaves only 8 for future features (OCIO multi-LUT, environment maps, noise textures, etc.).
**Mitigation**: WebGL2 guarantees a minimum of 16 texture units (`MAX_TEXTURE_IMAGE_UNITS`). Most desktop GPUs support 32. Future OCIO multi-LUT expansion would likely bake to a single 3D LUT per slot, not require additional texture units. If needed, the File and Display LUTs can share a texture unit with conditional binding.

### 2. Shader Compilation Time
**Risk**: Adding new uniforms and two more texture lookups increases the monolithic shader size, potentially increasing first-compile latency.
**Mitigation**: The additions are minimal (~30 lines for two conditional blocks and a shared helper). The existing shader is already ~1400 lines. `KHR_parallel_shader_compile` is already used for non-blocking compilation. Impact is estimated at <5% compile time increase. Pre-allocated matrix uniforms are optimized out by the GLSL compiler when unused.

### 3. Performance Impact of Three LUT Lookups
**Risk**: Three 3D texture samples per fragment (File + Look + Display) could reduce frame rate on low-end GPUs. Each lookup is a trilinear interpolation (8 texel fetches + blending), so up to 24 additional texel fetches in the worst case.
**Mitigation**: Each lookup is guarded by a boolean uniform check (`if (u_*Enabled)`). When a stage has no LUT loaded, the branch is never taken. GPU hardware handles uniform-driven branching efficiently (all fragments take the same path). For a 33^3 RGBA32F LUT, each texture is ~573 KB, fitting in L2 cache on Apple Silicon. Benchmarking on integrated GPUs is recommended.

> **Review Note (Nice to Have -- LUT Composition):** When all three GPU LUT slots are active with simple identity-domain transforms, they can be pre-composed into a single 3D LUT on the CPU side (trilinear sample File -> sample Look -> sample Display, bake into one combined LUT). This reduces three lookups to one. Worth implementing as a future optimization for integrated GPUs.

### 4. Pre-Cache LUT Integration Complexity
**Risk**: Inserting CPU-side LUT processing into the frame decode pipeline may be complex, as decode paths vary by format (EXR, DPX, JPEG, video frames via mediabunny).
**Mitigation**: Start with a post-decode hook that applies `PreCacheLUTStage.apply()` to the resulting `ImageData` before it is uploaded as a GPU texture. This is format-agnostic. The hook can be placed in a single location (the frame cache insertion point). Float32 sources can be supported by extending `PreCacheLUTStage` to accept Float32Array in addition to ImageData.

### 5. GPULUTChain Removal Scope
**Risk**: Other code paths may depend on `GPULUTChain` (thumbnails, export, scope rendering).
**Mitigation**: Keep `GPULUTChain` available but mark it as deprecated for the main render path. Any code using `GPULUTChain.applyToCanvas()` can continue to work independently. The main render path exclusively uses the monolithic shader.

### 6. Per-Source State Switching Latency
**Risk**: When switching between sources with different File/Look LUTs, the 3D texture re-upload could cause a visible stall. A 65^3 RGBA32F 3D LUT is ~8.6 MB; synchronous `texImage3D` can stall for 1-5ms.
**Mitigation**: Pre-upload all per-source LUT textures to GPU and cache them by source ID in Phase 2. Switching sources then becomes a texture bind (near-zero cost) rather than a texture upload. Note: The `TextureCacheManager` class referenced in early drafts does not exist in the codebase and must be created as part of Phase 2.

### 7. Backwards Compatibility with Existing `u_lut3D` Consumers
**Risk**: External code or saved sessions may reference the existing single-LUT `renderState.lut` field.
**Mitigation**: The rename from `u_lut3D` to `u_lookLUT3D` is atomic in Phase 1. Keep `renderState.lut` as a deprecated alias for `renderState.lookLUT`. The `setLUT()` / `getLUT()` methods on `ColorPipelineManager` continue to work as deprecated aliases routing to the Look stage. Existing `.rv` session files that save LUT state will be migrated: the saved `lut` field is loaded into the Look slot by default.

### 8. Matrix Support Gap
**Risk**: `GPULUTChain` supports per-stage `inMatrix`/`outMatrix`. The inline shader approach initially omits matrix application logic.
**Mitigation**: Phase 1 ships without per-stage matrices in the monolithic shader (none of the current UI exposes matrix configuration). Matrix uniform slots are pre-allocated in the shader (optimized out by compiler when unused) so that adding matrix support later does not require a shader recompile. The `LUTStageState` already carries `inMatrix`/`outMatrix` fields for when this is implemented.

### 9. Float Texture Linear Filtering
**Risk**: 3D LUT textures use `RGBA32F` with `gl.LINEAR` filtering for trilinear interpolation. Linear filtering on float textures requires the `OES_texture_float_linear` extension. Without it, filtering silently falls back to `gl.NEAREST`, producing visible banding on LUT edges.
**Mitigation**: Check for `OES_texture_float_linear` at renderer initialization. If unavailable, fall back to `RGBA16F` (which supports linear filtering natively in WebGL2 without an extension) and log a warning. Add this check to Phase 1.

### 10. Session Persistence of LUT Data
**Risk**: The `SerializableLUTPipelineState` explicitly sets `lutData: undefined` to omit binary data. Session save/restore remembers LUT *names* but not the LUT *data*. Restoring a session requires either file system access or re-loading.

> **Review Note (Nice to Have):** Store loaded LUT binary data in IndexedDB so session restore does not require re-loading LUT files from disk. For Phase 1, prompt the user to re-load the LUT on session restore. Plan IndexedDB persistence for a future phase.

### 11. OCIO Baked LUT Conflict
**Risk**: The `Renderer` already has an OCIO WASM integration path (`ocioWasmActive`) that uploads a baked 3D LUT through the Look LUT slot. If OCIO is active and the user also loads a Look LUT manually, there is a conflict for the same texture slot.
**Mitigation**: Define precedence rules: manual Look LUT override wins over OCIO baked LUT. When the manual Look LUT is cleared, OCIO re-applies its baked LUT. Document this behavior in the `ColorPipelineManager` and in the UI help popover.

---

## Estimated Effort

| Phase | Scope | Estimate |
|-------|-------|----------|
| Phase 1 | Shader + State plumbing (including rename, domain support, 1D bake, sampler init, float filtering check) | 3-4 days |
| Phase 2 | Pipeline integration (including per-source texture caching) | 2-3 days |
| Phase 3 | Pre-cache CPU integration | 1 day |
| Phase 4 | Drag-and-drop smart routing (with error handling) | 1-2 days |
| Phase 5 | Active slots indicator | 0.5 day |
| Phase 6 | Testing | 2-3 days |
| **Total** | | **9-13 days** |

Phases 1-2 are the critical path and should be implemented first to unblock end-to-end testing. Phases 3-5 can be parallelized. The estimate is increased from the original 7-11 days to account for the domain min/max support, 1D-to-3D baking, u_lut3D rename, sampler initialization fix, and float filtering validation that were identified as must-fix items.

> **Review Note (Nice to Have -- CDL/OCIO Coordination):** In ACES/OCIO pipelines, CDL is applied before the Look LUT (CDL at 6b, Look at 6d), which this pipeline achieves. However, when OCIO-driven CDL is configured via the OCIO source mode on `LUTStageControl`, there is no coordination between the CDL panel and the Look LUT panel to ensure they reference the same OCIO config. This is a workflow limitation to document, not a shader concern.

> **Review Note (Nice to Have -- File LUT Input Encoding Selector):** Many production File LUTs expect input in log space (e.g., Log-C3, S-Log3). The current pipeline applies EOTF before the File LUT, so the File LUT receives linear data. If the File LUT was designed for log input, results will be incorrect. A future enhancement could add an optional "input encoding" selector to the File LUT stage UI (linear, sRGB, Log-C3, S-Log3, etc.), where the shader converts from working-space linear back to the specified encoding before applying the File LUT, then converts back after. This is essential for professional camera-native LUT workflows and should be planned for a future phase.
