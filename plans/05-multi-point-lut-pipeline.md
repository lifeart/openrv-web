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
- `GPULUTChain` (`src/color/pipeline/GPULUTChain.ts`) -- separate WebGL2 shader program with its own fullscreen quad, applying File/Look/Display LUTs via three `sampler3D` uniforms. Operates in a standalone GL context (its own canvas), not within the Renderer's context.

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

3. **Pipeline position**: File LUT should apply *before* color corrections (exposure, CDL, curves); the current `u_lut3D` applies *after* them. Look LUT correctly follows corrections. Display LUT should apply after tone mapping/gamut mapping, before display transfer.

4. **Drag-and-drop smart routing**: LUT files dropped on the viewer go through generic file loading, not to a specific pipeline stage.

5. **GPULUTChain integration gap**: `GPULUTChain` runs in its own GL context with a separate shader. Its output is never composited back into the main render. It is essentially dead code in the current render path.

6. **Pre-cache CPU path**: `PreCacheLUTStage.apply()` exists but is never called during frame decode. The pre-cache LUT is routed through the GPU `u_lut3D` path instead.

---

## Proposed Pipeline Architecture

### Design Decision: Inline in Monolithic Shader (Recommended)

Rather than using `GPULUTChain`'s separate multi-pass approach (which requires pixel readback or FBO blit between GL contexts), extend the existing `viewer.frag.glsl` monolithic shader with three additional `sampler3D` uniforms. This:

- Avoids context-switching overhead between the Renderer's GL context and GPULUTChain's context.
- Keeps the single-pass architecture (no extra FBO passes just for LUTs).
- Leverages existing `ShaderStateManager` dirty-flag optimization.
- Is consistent with how all other effects (CDL, curves, tone mapping) are integrated.
- Uses three additional texture units (6, 7, 8) out of the 16 available in WebGL2 (units 0-5 are already allocated: source, curves, false color, lut3D, film, inline LUT).

### New Pipeline Order in `viewer.frag.glsl`

```
Phase 0: Input decode (deinterlace, perspective, spherical, swizzle, unpremultiply)
Phase 0c-0e: Linearize, EOTF, input primaries

NEW Phase 0f: File LUT (u_fileLUT3D) -- per-source, file-to-working-space

Phase 1-5: Exposure, scale/offset, inline LUT, temp/tint, brightness, contrast,
           saturation, highlights/shadows, vibrance, hue rotation, clarity

Phase 6: Color grading (color wheels, CDL, curves, HSL qualifier, film emulation)
         (NOTE: existing u_lut3D at step 6d becomes the Look LUT slot)

NEW Phase 6d: Look LUT -- rename existing u_lut3D to u_lookLUT3D semantically,
              or add a second slot here and deprecate u_lut3D

Phase 6e-6g: HSL qualifier, film emulation, out-of-range

Phase 7: Tone mapping, gamut mapping
Phase 7b: Sharpen
Phase 7c: Output primaries

NEW Phase 7d: Display LUT (u_displayLUT3D) -- session-wide, after output primaries,
              before display transfer

Phase 8: Display transfer, gamma, brightness
Phase 9-13: Inversion, channel isolation, false color, zebra, dither, compositing
```

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
// File LUT (per-source, applied after linearize, before color corrections)
uniform sampler3D u_fileLUT3D;
uniform bool u_fileLUT3DEnabled;
uniform float u_fileLUT3DIntensity;
uniform float u_fileLUT3DSize;

// Display LUT (session-wide, applied after output primaries, before display transfer)
uniform sampler3D u_displayLUT3D;
uniform bool u_displayLUT3DEnabled;
uniform float u_displayLUT3DIntensity;
uniform float u_displayLUT3DSize;
```

The existing `u_lut3D`, `u_lut3DEnabled`, `u_lut3DIntensity`, `u_lut3DSize` uniforms are repurposed as the Look LUT. No rename is strictly necessary in the GLSL code (to avoid breaking the `ShaderStateManager` uniform paths), but the semantic meaning changes from "generic single LUT" to "Look LUT (creative grade)". Alternatively, rename them to `u_lookLUT3D*` and update all references.

### New Shared Function

```glsl
// Generic 3D LUT application with trilinear interpolation + intensity blend
vec3 applyLUT3DGeneric(sampler3D lut, vec3 color, float lutSize, float intensity) {
  vec3 c = clamp(color, 0.0, 1.0);
  float offset = 0.5 / lutSize;
  float scale = (lutSize - 1.0) / lutSize;
  vec3 lutCoord = c * scale + offset;
  vec3 lutColor = texture(lut, lutCoord).rgb;
  return mix(color, lutColor, intensity);
}
```

### Insertion Points in `main()`

**File LUT** -- after phase 0e (input primaries), before phase 1 (exposure):

```glsl
// 0f. File LUT (per-source input transform)
if (u_fileLUT3DEnabled) {
  color.rgb = applyLUT3DGeneric(u_fileLUT3D, color.rgb, u_fileLUT3DSize, u_fileLUT3DIntensity);
}
```

**Look LUT** -- at existing step 6d (no change in position, just semantic rename):

```glsl
// 6d. Look LUT (per-source creative grade)
if (u_lut3DEnabled) {
  color.rgb = applyLUT3D(color.rgb);  // existing function, unchanged
}
```

**Display LUT** -- new phase 7d, after output primaries (7c), before display transfer (8a):

```glsl
// 7d. Display LUT (session-wide display calibration)
if (u_displayLUT3DEnabled) {
  color.rgb = applyLUT3DGeneric(u_displayLUT3D, color.rgb, u_displayLUT3DSize, u_displayLUT3DIntensity);
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

// Display LUT (session-wide)
displayLUT3DEnabled: boolean;
displayLUT3DIntensity: number;
displayLUT3DSize: number;
displayLUT3DDirty: boolean;
displayLUT3DData: Float32Array | null;
```

Add new dirty flags: `DIRTY_FILE_LUT3D`, `DIRTY_DISPLAY_LUT3D`.

Add setter methods: `setFileLUT(data, size, intensity)`, `setDisplayLUT(data, size, intensity)`.

Add texture snapshots: `getFileLUT3DSnapshot()`, `getDisplayLUT3DSnapshot()`.

### RenderState Extensions

Extend `RenderState` interface:

```typescript
fileLUT: { data: Float32Array | null; size: number; intensity: number };
displayLUT: { data: Float32Array | null; size: number; intensity: number };
```

### Renderer Texture Management

Add to `Renderer`:

```typescript
private fileLUT3DTexture: WebGLTexture | null = null;
private displayLUT3DTexture: WebGLTexture | null = null;
```

Add `TextureCallbacks` methods: `bindFileLUT3DTexture()`, `bindDisplayLUT3DTexture()`.

Handle texture upload in `applyUniforms` when dirty flags are set, bind to units 6 and 7 respectively.

---

## UI Design

### Current UI (Already Implemented)

The `LUTPipelinePanel` and `LUTStageControl` components are fully implemented with all four stages, source selector, enable/disable toggles, intensity sliders, and clear buttons. No major UI changes are needed.

### Drag-and-Drop Smart Target Detection

When a `.cube`/`.3dl`/etc. file is dropped on the viewer:

1. **Single file drop**: Show a stage-picker popover near the drop location with four buttons: "Pre-Cache", "File LUT", "Look LUT", "Display LUT". Highlight the recommended slot based on filename heuristics:
   - Filename contains `log`, `linear`, `input`, `camera` --> File LUT
   - Filename contains `look`, `grade`, `show`, `creative` --> Look LUT
   - Filename contains `display`, `monitor`, `calibrat`, `output` --> Display LUT
   - Otherwise --> Look LUT (most common use case)

2. **Modifier keys**: Hold `Alt` during drop to bypass the picker and route directly to the recommended slot.

3. **Implementation**: Extend `ViewerInputHandler`'s drop handler to detect LUT file extensions, parse the file, and either show the picker or route to the inferred slot.

### Active Slots Indicator

Add a compact status bar below the viewer (or in the existing LUT indicator area) showing:
```
LUT: [F] [L] [D]
```
Where each letter lights up (colored) when the corresponding GPU stage has an active LUT. Clicking any letter opens the pipeline panel scrolled to that stage.

---

## Implementation Steps

### Phase 1: Shader & State Plumbing (Core)

1. **Add File LUT and Display LUT uniforms to `viewer.frag.glsl`**
   - Add `u_fileLUT3D`, `u_fileLUT3DEnabled`, `u_fileLUT3DIntensity`, `u_fileLUT3DSize` declarations.
   - Add `u_displayLUT3D`, `u_displayLUT3DEnabled`, `u_displayLUT3DIntensity`, `u_displayLUT3DSize` declarations.
   - Add `applyLUT3DGeneric()` helper function.
   - Insert File LUT application after input primaries (line ~1027), before exposure (line ~1029).
   - Insert Display LUT application after output primaries (line ~1321), before display transfer (line ~1332).

2. **Extend `ShaderStateManager`**
   - Add `fileLUT3D*` and `displayLUT3D*` fields to `InternalShaderState`.
   - Add `DIRTY_FILE_LUT3D` and `DIRTY_DISPLAY_LUT3D` to dirty flags.
   - Add `setFileLUT()` and `setDisplayLUT()` methods.
   - Add snapshot methods for texture upload coordination.
   - Update `applyUniforms()` to push new uniforms when dirty.
   - Update `setState()` to accept `fileLUT` and `displayLUT` in `RenderState`.

3. **Extend `Renderer` texture management**
   - Add `fileLUT3DTexture` and `displayLUT3DTexture` fields.
   - Add `TextureCallbacks` for binding to units 6 and 7.
   - Handle 3D texture upload (reuse `createLUTTexture` pattern from `LUTLoader.ts`, or the existing RGB-to-RGBA padding logic).
   - Set sampler uniforms (`u_fileLUT3D = 6`, `u_displayLUT3D = 7`) during initial uniform setup.
   - Clean up textures in `dispose()`.

4. **Extend `RenderState` interface**
   - Add `fileLUT` and `displayLUT` fields matching the existing `lut` field shape.

### Phase 2: Pipeline Integration

5. **Rewire `Viewer.syncLUTPipeline()`**
   - Replace the `GPULUTChain` calls with direct `ShaderStateManager`/`RenderState` updates.
   - Map `pipeline.fileLUT` --> `renderState.fileLUT` (data, size, intensity, enabled).
   - Map `pipeline.lookLUT` --> `renderState.lut` (existing single-LUT path, repurposed as Look).
   - Map `pipeline.displayLUT` --> `renderState.displayLUT` (new path).
   - Keep pre-cache routing through `PreCacheLUTStage.apply()` at decode time (Phase 3).

6. **Update `ColorPipelineManager`**
   - Add methods to push File/Look/Display LUT data to the renderer's state.
   - The existing `setLUT()`/`setLUTIntensity()` methods become the Look LUT path.
   - Add `setFileLUT()`, `setDisplayLUT()` convenience methods.

7. **Deprecate `GPULUTChain` (or keep for standalone use)**
   - Since File/Look/Display LUTs are now applied inline in the monolithic shader, `GPULUTChain` becomes redundant for the main render path.
   - Option A: Remove it entirely and update tests.
   - Option B: Keep it as a standalone utility for offline LUT preview (e.g., thumbnail generation).
   - Recommend Option B: keep but mark as `@deprecated` for main pipeline use.

### Phase 3: Pre-Cache CPU Integration

8. **Wire `PreCacheLUTStage.apply()` into frame decode**
   - In the frame decode path (wherever decoded `ImageData` enters the cache), check if the active source has a pre-cache LUT configured.
   - If so, run `PreCacheLUTStage.apply(imageData)` before the frame enters the GPU cache.
   - This requires identifying the decode callsite (likely in `FileSourceNode` or `MediabunnyFrameExtractor` output handling).
   - Cache the result so the pre-cache LUT is not re-applied every frame.

### Phase 4: Drag-and-Drop Smart Routing

9. **Extend `ViewerInputHandler` drop handler**
   - Detect LUT file extensions in the dropped files list.
   - Parse the LUT file content.
   - Apply filename heuristics to suggest a target stage.
   - Show a stage-picker popover (new `LUTDropPicker` component) or auto-route with modifier key.
   - Call `pipeline.setFileLUT()` / `pipeline.setLookLUT()` / `pipeline.setDisplayLUT()` accordingly.
   - Trigger `syncLUTPipeline()` and render.

10. **Create `LUTDropPicker` UI component**
    - Temporary floating panel near the mouse position.
    - Four buttons: "Pre-Cache", "File", "Look", "Display".
    - Highlight recommended target.
    - Auto-dismiss on click or after timeout.

### Phase 5: Active Slots Indicator

11. **Enhance LUT status indicator**
    - Replace the current single "LUT: name" indicator with a multi-slot display.
    - Show colored badges for each active stage (P, F, L, D).
    - Wire click handlers to open `LUTPipelinePanel` at the relevant section.
    - Update on every `pipelineChanged` event.

### Phase 6: Testing

12. **Unit tests**
    - Test `ShaderStateManager.setFileLUT()` and `setDisplayLUT()` set dirty flags correctly.
    - Test `applyUniforms()` pushes File/Display LUT uniforms when dirty.
    - Test texture callback invocations for units 6/7.
    - Test `RenderState` integration with File/Display LUT fields.

13. **Integration tests**
    - Test `syncLUTPipeline()` routes all four stages correctly.
    - Test that enabling/disabling individual stages only affects that stage's uniform.
    - Test intensity blending at 0%, 50%, 100% for each stage.
    - Test per-source switching (change active source, verify LUT uniforms update).

14. **E2E tests**
    - Extend existing `e2e/multi-point-lut-pipeline.spec.ts`.
    - Verify pixel-level output for a known LUT at each pipeline stage.
    - Verify chain ordering (File before corrections, Look after, Display last).
    - Verify drag-and-drop routing with filename heuristics.

---

## Files to Create/Modify

### Files to Modify

| File | Changes |
|------|---------|
| `src/render/shaders/viewer.frag.glsl` | Add File LUT and Display LUT uniforms, `applyLUT3DGeneric()` function, two new application points in `main()` |
| `src/render/ShaderStateManager.ts` | Add `fileLUT3D*` and `displayLUT3D*` state fields, dirty flags, setter methods, snapshot methods, `applyUniforms()` extensions |
| `src/render/RenderState.ts` | Add `fileLUT` and `displayLUT` fields to `RenderState` interface |
| `src/render/Renderer.ts` | Add `fileLUT3DTexture` and `displayLUT3DTexture` fields, texture upload/bind logic, texture unit assignment, `TextureCallbacks` extensions, cleanup in `dispose()` |
| `src/render/StateAccessor.ts` | Add `getFileLUT3DSnapshot()`, `getDisplayLUT3DSnapshot()` to interface |
| `src/ui/components/Viewer.ts` | Rewrite `syncLUTPipeline()` to route File/Look/Display through `ShaderStateManager` instead of `GPULUTChain` |
| `src/ui/components/ColorPipelineManager.ts` | Add `setFileLUT()`, `setDisplayLUT()` methods that write to renderer state |
| `src/ui/components/LUTPipelinePanel.ts` | Minor: wire up active-slot indicator updates |
| `src/services/controls/ControlGroups.ts` | No change needed (already has `lutPipelinePanel`) |
| `src/AppColorWiring.ts` | No change needed (already listens for `pipelineChanged`) |
| `src/render/ShaderStateManager.test.ts` | Add tests for new state fields and dirty flag behavior |
| `src/render/Renderer.test.ts` | Add tests for File/Display LUT texture management |
| `e2e/multi-point-lut-pipeline.spec.ts` | Extend with rendering integration tests |

### Files to Create

| File | Purpose |
|------|---------|
| `src/ui/components/LUTDropPicker.ts` | Stage-picker popover for drag-and-drop LUT routing |
| `src/ui/components/LUTDropPicker.test.ts` | Unit tests for drag-and-drop picker |
| `src/ui/components/LUTStatusIndicator.ts` | Multi-slot active indicator widget (P/F/L/D badges) |
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
**Mitigation**: WebGL2 guarantees a minimum of 16 texture units (`MAX_TEXTURE_IMAGE_UNITS`). Most desktop GPUs support 32. If needed, the File and Display LUTs can share a texture unit with conditional binding (only one active at a time is uncommon but possible). Alternatively, OCIO LUTs can be baked into the File/Display slots.

### 2. Shader Compilation Time
**Risk**: Adding 8 more uniforms and two more texture lookups increases the monolithic shader size, potentially increasing first-compile latency.
**Mitigation**: The additions are minimal (two conditional blocks with one texture sample each). The existing shader is already ~1400 lines. KHR_parallel_shader_compile is already used for non-blocking compilation. Impact is estimated at <5% compile time increase.

### 3. Performance Impact of Three LUT Lookups
**Risk**: Three 3D texture samples per fragment (File + Look + Display) could reduce frame rate on low-end GPUs.
**Mitigation**: Each 3D texture lookup is guarded by a boolean uniform check (`if (u_*Enabled)`). When a stage has no LUT loaded, the branch is never taken. GPU hardware handles uniform-driven branching efficiently (all fragments take the same path). Benchmarking on integrated GPUs is recommended. If performance is insufficient, stages can be combined into a single pre-baked LUT (LUT composition) as a fallback.

### 4. Pre-Cache LUT Integration Complexity
**Risk**: Inserting CPU-side LUT processing into the frame decode pipeline may be complex, as decode paths vary by format (EXR, DPX, JPEG, video frames via mediabunny).
**Mitigation**: Start with a post-decode hook that applies `PreCacheLUTStage.apply()` to the resulting `ImageData` before it is uploaded as a GPU texture. This is format-agnostic. The hook can be placed in a single location (the frame cache insertion point). Float32 sources can be supported by extending `PreCacheLUTStage` to accept Float32Array in addition to ImageData.

### 5. GPULUTChain Removal Scope
**Risk**: Other code paths may depend on `GPULUTChain` (thumbnails, export, scope rendering).
**Mitigation**: Keep `GPULUTChain` available but mark it as deprecated for the main render path. Any code using `GPULUTChain.applyToCanvas()` can continue to work independently. The main render path exclusively uses the monolithic shader.

### 6. Per-Source State Switching Latency
**Risk**: When switching between sources with different File/Look LUTs, the 3D texture re-upload could cause a visible stall.
**Mitigation**: Pre-upload all per-source LUT textures to GPU and cache them by source ID. Switching sources then becomes a texture bind (near-zero cost) rather than a texture upload. The `TextureCacheManager` pattern already exists in the codebase and can be extended for LUT textures.

### 7. Backwards Compatibility with Existing `u_lut3D` Consumers
**Risk**: External code or saved sessions may reference the existing single-LUT `renderState.lut` field.
**Mitigation**: Keep `renderState.lut` functional as the Look LUT slot. The `setLUT()` / `getLUT()` methods on `ColorPipelineManager` continue to work, now routing to the Look stage. Add deprecation warnings pointing to `renderState.lookLUT` for new code. Existing `.rv` session files that save LUT state will be migrated: the saved `lut` field is loaded into the Look slot by default.

### 8. Matrix Support Gap
**Risk**: `GPULUTChain` supports per-stage `inMatrix`/`outMatrix`. The inline shader approach initially omits these.
**Mitigation**: Phase 1 ships without per-stage matrices in the monolithic shader (none of the current UI exposes matrix configuration anyway). Matrix support can be added in a follow-up by introducing `mat4 u_fileLUT3DInMatrix` etc., matching the `GPULUTChain` approach. The `LUTStageState` already carries `inMatrix`/`outMatrix` fields.

---

## Estimated Effort

| Phase | Scope | Estimate |
|-------|-------|----------|
| Phase 1 | Shader + State plumbing | 2-3 days |
| Phase 2 | Pipeline integration | 1-2 days |
| Phase 3 | Pre-cache CPU integration | 1 day |
| Phase 4 | Drag-and-drop smart routing | 1-2 days |
| Phase 5 | Active slots indicator | 0.5 day |
| Phase 6 | Testing | 2-3 days |
| **Total** | | **7-11 days** |

Phases 1-2 are the critical path and should be implemented first to unblock end-to-end testing. Phases 3-5 can be parallelized.
