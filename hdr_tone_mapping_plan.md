# HDR Tone Mapping Pipeline Improvement Plan

**Status: ALL 5 PHASES IMPLEMENTED** (verified 2026-02-13)

## Context

Based on analysis of the "Best Tone-Mapping Algorithms for HDR Images and Video" research paper against our current OpenRV Web pipeline. The paper identifies **temporal stability** as the dominant constraint for video, recommends **"filmic/global curve + stable exposure control + conservative local enhancement"** for real-time renderers, and highlights **gamut clipping** as a major artifact category.

**Current strengths**: 7 tone mapping operators (Reinhard, Filmic, ACES, AgX, PBR Neutral, GT, ACES Hill) with GPU/CPU parity, solid HDR I/O (HLG/PQ/extended), full color grading pipeline.

**Critical gaps**: No temporal stability, no auto-exposure, no gamut mapping, no scene analysis, missing Drago logarithmic operator.

---

## Phase 1: Scene Analysis Infrastructure (Foundation)

Everything else depends on this. Two sub-phases: GPU luminance and pure-math scene analysis.

### 1.1 GPU Luminance Computation via Mipmap Chain

WebGL2 has no compute shaders. Use mipmap trick: render log-luminance to a small FBO, generate mipmaps, attach the 1x1 mip level to a second FBO, readPixels from that.

**Critical WebGL2 detail**: `readPixels` always reads from the currently bound FBO at mip level 0. To read a specific mip level, use `gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, mipLevel)` to attach the desired mip level to a readback FBO. This IS supported in WebGL2.

**Async readback via double-buffered PBO** (reusing existing pattern from `Renderer.ts:949-1044`): Read PREVIOUS frame's luminance while current frame's luminance is being computed. One-frame latency is imperceptible when auto-exposure is already smoothed over multiple frames.

**New file: `src/render/LuminanceAnalyzer.ts`** (~150 lines)
- Owns a 256x256 RGBA16F FBO + minimal luminance shader program
- Owns a 1x1 readback FBO for mip-level attachment
- Double-buffered PBO for async readback (eliminates GPU stall)
- Shader outputs `vec4(log(dot(color.rgb, vec3(0.2126, 0.7152, 0.0722)) + 1e-6), 0, 0, 1)` after input EOTF
- `computeAverageLuminance(gl, sourceTexture): number` -- renders to FBO, mipmaps, async reads 1x1 pixel, returns `exp(value)`
- `computeLuminanceStats(gl, sourceTexture): { avg: number, max: number }` -- also tracks max via separate 1x1 mip readback with MAX blend
- Cached result per frame; returns previous frame's result (1-frame latency from PBO)
- During interactions (InteractionQualityManager active): skip computation entirely, hold last value
- **Edge case: NaN/Infinity from readback**: clamp to sane range `[1e-6, 1e6]`, log to console on first occurrence

**New shader: `src/render/shaders/luminance.frag.glsl`** (~30 lines)
- Sample source texture, apply input EOTF (reuse same `u_inputTransfer` logic), output log-luminance
- Also output max-luminance channel for Drago's `Lmax` parameter

**CPU path in `src/utils/effects/effectProcessing.shared.ts`:** (~30 lines)
- `computeSceneLuminance(data: Uint8ClampedArray, width: number, height: number): { avgLogLuminance: number, maxLuminance: number }`
- Downsampled 16x16 grid (256 samples), compute `mean(log(L + 1e-6))` and `max(L)`
- **This is the primary path for PrerenderBufferManager** (workers have no GL context)
- Pure function, no shared state, fully worker-safe

### 1.2 Scene Key Estimation

**New file: `src/color/SceneAnalysis.ts`** (~50 lines)
- `estimateSceneKey(avgLogLuminance: number): number` -- returns Reinhard key value
- `computeExposureFromKey(avgLuminance: number, targetKey: number): number` -- returns stops
- `clampLuminance(value: number): number` -- clamp to `[1e-6, 1e6]`, handles NaN/Infinity by returning 1e-6
- Pure math, fully unit-testable

---

## Phase 2: Auto-Exposure with Temporal Smoothing

Paper's #1 recommendation for real-time video. This also inherently provides temporal stability.

**New file: `src/color/AutoExposureController.ts`** (~100 lines)

```typescript
export interface AutoExposureState {
  enabled: boolean;
  targetKey: number;       // default 0.18 (mid-gray)
  adaptationSpeed: number; // 0.0-1.0 EMA alpha per normalized step
  minExposure: number;     // -5.0 stops floor
  maxExposure: number;     // +5.0 stops ceiling
}

export const DEFAULT_AUTO_EXPOSURE_STATE: AutoExposureState = {
  enabled: false,
  targetKey: 0.18,
  adaptationSpeed: 0.05,
  minExposure: -5.0,
  maxExposure: 5.0,
};
```

**Algorithm:**
```
targetExposure = log2(clampLuminance(targetKey / avgSceneLuminance))
clamp(targetExposure, minExposure, maxExposure)
currentExposure = previousExposure + adaptationSpeed * (targetExposure - previousExposure)
```

**Edge cases:**
- **First frame**: `previousExposure` initialized to `targetExposure` (instant convergence, no fade-in artifact)
- **Pure black image** (`avgSceneLuminance ≈ 0`): `clampLuminance` ensures minimum 1e-6, so `targetExposure` clamps to `maxExposure` (+5.0 stops)
- **Pure white / extreme HDR** (`avgSceneLuminance >> 1`): `targetExposure` goes very negative, clamped to `minExposure` (-5.0 stops)
- **Toggle off**: Revert `u_exposure` to the user's manual `colorAdjustments.exposure` value. The manual value is always preserved separately; auto-exposure only overrides the uniform, never the stored manual value.

**Key design decision: Auto-exposure does NOT modify `colorAdjustments.exposure`.**
Instead, `ViewerGLRenderer` computes the final exposure:
```typescript
const finalExposure = autoExposure.enabled
  ? autoExposureController.currentExposure + colorAdjustments.exposure  // manual = compensation
  : colorAdjustments.exposure;  // manual = absolute
```
This avoids state collision. The manual slider always stores the user's intent; auto-exposure adds to it.

**Integration -- no shader changes needed:**
- `ViewerGLRenderer.renderHDRWithWebGL()`: after calling `LuminanceAnalyzer`, feed result to `AutoExposureController.update(avgLuminance, deltaTime)`, then override `state.colorAdjustments.exposure` with `finalExposure` before `applyRenderState()`
- The shader's existing `u_exposure` uniform receives the combined value

**PrerenderBufferManager integration (two-pass approach):**
1. **Luminance pre-scan**: Before prerendering effects, run `computeSceneLuminance()` on all queued frames via workers. Store results in `Map<frameNumber, { avg: number, max: number }>`. This is fast (~0.1ms per frame for 256 CPU samples).
2. **Temporal smoothing pre-computation**: On main thread, iterate frame numbers in order, apply EMA smoothing to produce `Map<frameNumber, number>` of per-frame exposure values.
3. **Prerender with per-frame exposure**: Each worker receives `AllEffectsState` with the pre-computed exposure for that specific frame number.
4. **Effects hash**: Exclude auto-exposure `currentExposure` from hash. Instead, hash only the `AutoExposureState` config (enabled, targetKey, adaptationSpeed, min, max). Per-frame exposure variations don't invalidate the cache; only config changes do. Per-frame exposure is stored as `CachedFrame` metadata.

---

## Phase 3: Generic Temporal Smoother (Utility)

**New file: `src/color/TemporalSmoother.ts`** (~40 lines)

```typescript
export class TemporalSmoother {
  private previousValues = new Map<string, number>();

  smooth(key: string, currentValue: number, alpha: number): number {
    const prev = this.previousValues.get(key);
    if (prev === undefined) {
      this.previousValues.set(key, currentValue);
      return currentValue; // first call: instant, no smoothing
    }
    const smoothed = prev + alpha * (currentValue - prev);
    this.previousValues.set(key, smoothed);
    return smoothed;
  }

  reset(): void { this.previousValues.clear(); }
}
```

Used by `AutoExposureController` internally for its EMA. Also available for future scene-adaptive parameters. No shader changes. The paper's recommended approach: smoothing on CPU, modifying uniform values before they reach the shader.

**Testing approach for determinism**: Pass explicit `alpha` values (no dependency on real time). Test step response: feed constant luminance for N iterations, verify convergence to expected value within epsilon. Test reset: verify next call after `reset()` returns the raw value.

---

## Phase 4: Gamut Mapping (Independent, Can Parallelize with Phases 1-3)

### Pipeline Position: AFTER Tone Mapping, BEFORE Display Transfer

**Rationale**: Tone mapping operates in scene-referred linear light and should see the full gamut and dynamic range. Gamut mapping after tone mapping converts display-referred colors from source gamut to display gamut. This matches ACES pipeline ordering (RRT → ODT including gamut mapping).

**Shader insertion point**: Between current step 7 (tone mapping, line ~700) and step 7b (sharpen, line ~703) in `viewer.frag.glsl`.

### Shader Changes (`src/render/shaders/viewer.frag.glsl`, ~45 lines)

**New uniforms:**
```glsl
uniform bool u_gamutMappingEnabled;  // follows existing bool-guard pattern
uniform int u_gamutMappingMode;      // 0=clip, 1=compress
uniform int u_sourceGamut;           // 0=sRGB, 1=Rec.2020, 2=Display-P3
uniform int u_targetGamut;           // 0=sRGB, 1=Display-P3
```

**Algorithm: Per-channel soft clip after matrix conversion** (simpler and cheaper than full ACES RGC for initial implementation):
```glsl
// Exact 3x3 matrices (derived from ITU-R BT.2020 and sRGB chromaticity coordinates)
const mat3 REC2020_TO_SRGB = mat3(
   1.6605, -0.1246, -0.0182,
  -0.5876,  1.1329, -0.1006,
  -0.0728, -0.0083,  1.1187
);
const mat3 REC2020_TO_P3 = mat3(
   1.3459, -0.0986, -0.0079,
  -0.2557,  1.0985, -0.0681,
  -0.0511, -0.0001,  1.0760
);

vec3 softClip(vec3 color) {
  // Per-channel: below threshold pass through, above compress smoothly
  vec3 result;
  for (int i = 0; i < 3; i++) {
    float x = color[i];
    if (x <= 0.0) {
      result[i] = 0.0; // clamp negatives (from matrix transform)
    } else if (x <= 0.8) {
      result[i] = x; // passthrough
    } else {
      // Smooth compression: 0.8 + 0.2 * tanh((x - 0.8) / 0.2)
      result[i] = 0.8 + 0.2 * tanh((x - 0.8) / 0.2);
    }
  }
  return result;
}

// In main pipeline (after tone mapping):
if (u_gamutMappingEnabled) {
  if (u_sourceGamut == 1) { // Rec.2020
    color.rgb = (u_targetGamut == 1) ? REC2020_TO_P3 * color.rgb : REC2020_TO_SRGB * color.rgb;
  } else if (u_sourceGamut == 2 && u_targetGamut == 0) { // P3 -> sRGB
    color.rgb = P3_TO_SRGB * color.rgb;
  }
  if (u_gamutMappingMode == 1) {
    color.rgb = softClip(color.rgb);
  } else {
    color.rgb = clamp(color.rgb, 0.0, 1.0); // hard clip
  }
}
```

**Identity case**: When `u_sourceGamut == u_targetGamut`, the `u_gamutMappingEnabled` should be false (no-op). Auto-detection logic in `ViewerGLRenderer` skips gamut mapping when source matches target.

**Auto-detection in `ViewerGLRenderer.buildRenderState()`:**
```typescript
const sourceGamut = image?.metadata?.colorPrimaries === 'bt2020' ? 'rec2020'
                   : image?.metadata?.colorPrimaries === 'display-p3' ? 'display-p3'
                   : 'srgb';
const targetGamut = capabilities.colorGamut === 'p3' ? 'display-p3' : 'srgb';
const enabled = sourceGamut !== 'srgb' && sourceGamut !== targetGamut;
```
**Fallback when `colorPrimaries` is undefined**: default to `'srgb'` (no gamut mapping).

**CPU path (`effectProcessing.shared.ts`):** (~35 lines)
```typescript
export function gamutMapRGB(r: number, g: number, b: number,
  sourceGamut: string, targetGamut: string, mode: 'clip' | 'compress'): [number, number, number]
```
- Matrix multiply for conversion, then `softClip()` or `clamp()`
- Handles negative inputs from matrix transform

### Types and State Management

**In `src/core/types/effects.ts`** (NOT a separate file -- follows existing pattern):
```typescript
export type GamutMappingMode = 'off' | 'clip' | 'compress';
export type GamutIdentifier = 'srgb' | 'rec2020' | 'display-p3';

export interface GamutMappingState {
  mode: GamutMappingMode;
  sourceGamut: GamutIdentifier;
  targetGamut: GamutIdentifier;
}

export const DEFAULT_GAMUT_MAPPING_STATE: GamutMappingState = {
  mode: 'off',
  sourceGamut: 'srgb',
  targetGamut: 'srgb',
};
```

**In `src/render/RenderState.ts`:**
```typescript
export interface RenderState {
  // ... existing fields ...
  gamutMapping?: GamutMappingState;  // optional for backward compat
}
```

**In `src/render/ShaderStateManager.ts`:**
- Add `DIRTY_GAMUT_MAPPING` to dirty flag constants AND to `ALL_DIRTY_FLAGS` array
- Add gamut mapping codes: `const GAMUT_CODES = { 'srgb': 0, 'rec2020': 1, 'display-p3': 2 }`
- Add `setGamutMapping(state: GamutMappingState)` method
- In `applyUniforms()`: upload `u_gamutMappingEnabled`, `u_gamutMappingMode`, `u_sourceGamut`, `u_targetGamut`
- In `applyRenderState()`: check for `renderState.gamutMapping` and call `setGamutMapping()`

**In `src/render/StateAccessor.ts`:**
- Add `setGamutMapping(state: GamutMappingState): void`
- Add `getGamutMapping(): GamutMappingState`

**In `src/render/RendererBackend.ts`:**
- Add `setGamutMapping(state: GamutMappingState): void` to `RendererEffects` interface

**In `src/render/Renderer.ts`:**
- Add delegation method `setGamutMapping(state)` that calls `this.stateAccessor.setGamutMapping(state)`

**Performance**: Matrix multiply (9 MADs) + soft clip (~10 ops/channel with `tanh`) ≈ 40 ALU ops. Guarded by `u_gamutMappingEnabled` bool, zero cost when off.

---

## Phase 5: Drago Logarithmic Operator

Paper includes Drago as a core classical operator. Good for extreme dynamic range compression (EXR viewing). **Hard dependency on Phase 1** -- Drago requires scene luminance statistics (`Lwa`, `Lmax`) and produces meaningless results without them.

### Drago is a Per-Channel Operator with Scene Parameters

Following the existing pattern split (per-channel: Reinhard/Filmic/ACES/GT; RGB-triplet: AgX/PBR Neutral/ACES Hill), Drago is **per-channel** but requires additional `ToneMappingParams` fields.

### Type Changes (`src/core/types/effects.ts`)

```typescript
// Update union type
export type ToneMappingOperator = 'off' | 'reinhard' | 'filmic' | 'aces' | 'agx' | 'pbrNeutral' | 'gt' | 'acesHill' | 'drago';

// Update ToneMappingState with Drago params
export interface ToneMappingState {
  enabled: boolean;
  operator: ToneMappingOperator;
  reinhardWhitePoint?: number;
  filmicExposureBias?: number;
  filmicWhitePoint?: number;
  dragoBias?: number;    // default 0.85 (range 0.7-0.95)
  dragoLwa?: number;     // scene average luminance (from LuminanceAnalyzer)
  dragoLmax?: number;    // scene max luminance (from LuminanceAnalyzer)
}

// Update TONE_MAPPING_OPERATORS info array
{ key: 'drago', label: 'Drago', description: 'Adaptive logarithmic (requires scene analysis)' },

// Update DEFAULT_TONE_MAPPING_STATE
dragoBias: 0.85,
dragoLwa: 0.18,
dragoLmax: 10.0,
```

### All Locations Requiring Synchronization for Drago

1. `ToneMappingOperator` type in `src/core/types/effects.ts` (line 1)
2. `TONE_MAPPING_OPERATORS` array in `src/core/types/effects.ts` (line 25)
3. `DEFAULT_TONE_MAPPING_STATE` in `src/core/types/effects.ts` (line 11)
4. `TONE_MAPPING_OPERATOR_CODES` in `src/render/ShaderStateManager.ts` (line 66) -- add `'drago': 8`
5. `applyToneMapping()` switch in `viewer.frag.glsl` (line 325) -- add `else if (op == 8)` branch
6. `applyToneMappingToChannel()` in `effectProcessing.shared.ts` (line 615) -- add `case 'drago'`
7. `applyToneMappingToRGB()` in `effectProcessing.shared.ts` (line 635) -- add `case 'drago'`
8. Drago uniform upload in `ShaderStateManager.applyUniforms()` DIRTY_TONE_MAPPING section
9. Tone mapping test file `toneMappingOperators.test.ts` -- new Drago section

### Shader Implementation (`viewer.frag.glsl`, ~20 lines)

**New uniforms:**
```glsl
uniform float u_tmDragoBias;  // default 0.85
uniform float u_tmDragoLmax;  // scene max luminance
uniform float u_tmDragoLwa;   // scene average luminance
```

**Function:**
```glsl
float tonemapDragoChannel(float L) {
  float Lwa = max(u_tmDragoLwa, 1e-6);
  float Lmax = max(u_tmDragoLmax, 1e-6) * u_hdrHeadroom;
  float Ln = L / Lwa;
  float biasP = log(u_tmDragoBias) / log(0.5);
  float denom = log2(1.0 + Lmax / Lwa);
  float num = log(1.0 + Ln) / log(2.0 + 8.0 * pow(Ln / (Lmax / Lwa), biasP));
  return num / denom;
}
```

**CPU implementation (`effectProcessing.shared.ts`):**
```typescript
export function tonemapDragoChannel(value: number, bias = 0.85, Lwa = 0.18, Lmax = 10.0): number {
  // Match GPU formula exactly
}
```

**Scene luminance feeding:**
- When auto-exposure enabled (Phase 2): `LuminanceAnalyzer` provides both `avg` and `max`, set as `dragoLwa` and `dragoLmax` on `ToneMappingState` in `ViewerGLRenderer`
- When auto-exposure disabled: use `DEFAULT_TONE_MAPPING_STATE.dragoLwa/dragoLmax` defaults. The UI should display a note: "Drago works best with auto-exposure enabled"

### Testing (following existing pattern in `toneMappingOperators.test.ts`)

```
HDRTM-U_DRAGO_001: black (0) maps to 0
HDRTM-U_DRAGO_002: monotonically increasing
HDRTM-U_DRAGO_003: bounded for high inputs
HDRTM-U_DRAGO_004: formula matches Drago et al. reference
HDRTM-U_DRAGO_005: handles NaN → 0
HDRTM-U_DRAGO_006: handles Infinity → 0
HDRTM-U_DRAGO_007: handles negative → 0
HDRTM-U_DRAGO_008: bias parameter affects output (0.7 vs 0.95)
HDRTM-U_DRAGO_009: operates per-channel
HDRTM-U_DRAGO_010: GPU/CPU parity
```

Update existing cross-operator tests ("all operators produce different output", "all operators map 0 to approximately 0") to include Drago.

---

## Phase 6: Display-Adaptive Tone Mapping (Deferred)

**Not implementing now.** The existing `u_hdrHeadroom` + auto-exposure provides ~80% of the benefit. Full Mantiuk-style display model requires multi-pass rendering (violates single-pass constraint) and display ICC profiles (unavailable in WebGL2).

---

## Dependency Graph

```
Phase 1.1 (LuminanceAnalyzer) ──┐
Phase 1.2 (SceneAnalysis)    ───┼──> Phase 2 (Auto-Exposure) ──> Phase 3 (Temporal Smoother)
                                │                                       │
                                └────────────────────> Phase 5 (Drago, HARD dependency on Phase 1)
Phase 4 (Gamut Mapping) ─── fully independent, can parallel with all ───┘
```

---

## Complete File Change Summary

### New Files (7 + tests)
| File | Purpose | ~Lines |
|------|---------|--------|
| `src/render/shaders/luminance.frag.glsl` | Minimal log-luminance extraction shader | 30 |
| `src/render/LuminanceAnalyzer.ts` | GPU luminance via mipmap + async PBO readback | 150 |
| `src/color/SceneAnalysis.ts` | Scene key estimation, luminance clamping (pure math) | 50 |
| `src/color/AutoExposureController.ts` | Auto-exposure with EMA temporal smoothing | 100 |
| `src/color/TemporalSmoother.ts` | Generic EMA smoothing utility | 40 |
| `src/color/SceneAnalysis.test.ts` | Tests for scene key / luminance | 60 |
| `src/color/AutoExposureController.test.ts` | Tests for auto-exposure (step response, clamping, toggle) | 100 |
| `src/color/TemporalSmoother.test.ts` | Tests for EMA convergence, reset | 50 |

### Modified Files (10)
| File | Changes | ~Lines Added |
|------|---------|-------------|
| `src/render/shaders/viewer.frag.glsl` | Gamut mapping functions/uniforms (after tone mapping), Drago operator + uniforms | +65 |
| `src/core/types/effects.ts` | `'drago'` operator, `GamutMappingState`/`GamutMappingMode`/`GamutIdentifier` types, `AutoExposureState` interface, defaults, TONE_MAPPING_OPERATORS update | +40 |
| `src/render/ShaderStateManager.ts` | `DIRTY_GAMUT_MAPPING` in dirty flags + `ALL_DIRTY_FLAGS`, gamut codes, `setGamutMapping()`, Drago uniforms, gamut uniforms in `applyUniforms()` | +50 |
| `src/render/RenderState.ts` | `gamutMapping?: GamutMappingState` (optional field) | +5 |
| `src/render/StateAccessor.ts` | `setGamutMapping()`, `getGamutMapping()` methods | +5 |
| `src/render/RendererBackend.ts` | `setGamutMapping()` in `RendererEffects` interface | +3 |
| `src/render/Renderer.ts` | `setGamutMapping()` delegation, `LuminanceAnalyzer` lazy init + `computeFrameLuminance()` | +25 |
| `src/ui/components/ViewerGLRenderer.ts` | Luminance analysis → auto-exposure → final exposure computation, gamut auto-detection in `buildRenderState()`, Drago Lwa/Lmax feeding | +40 |
| `src/utils/effects/effectProcessing.shared.ts` | CPU `tonemapDragoChannel()`, `gamutMapRGB()`, `computeSceneLuminance()`, update dispatchers | +90 |
| `src/utils/effects/PrerenderBufferManager.ts` | Two-pass luminance pre-scan, per-frame exposure storage, effects hash exclusion for auto-exposure | +40 |
| `src/utils/effects/toneMappingOperators.test.ts` | Drago test section (10 tests), update cross-operator tests | +80 |

---

## Verification Plan

### Unit Tests
1. **SceneAnalysis**: Known luminance → expected key value; NaN/Infinity → clamped; pure black → 1e-6
2. **AutoExposureController**: Step response (dark→bright, verify exponential convergence); min/max clamping; first frame = instant convergence; toggle off = revert to manual; pure black = maxExposure
3. **TemporalSmoother**: EMA convergence to constant input; reset() clears state; first call returns raw value
4. **tonemapDragoChannel**: Black→0, monotonic, bounded, NaN/Inf/negative→0, bias variation, per-channel independence, GPU/CPU parity
5. **gamutMapRGB**: sRGB passthrough (identity); Rec.2020 green → all channels in [0,1]; negative inputs clamped; compress mode vs clip mode

### Integration Tests
6. **GPU luminance → auto-exposure → render**: Load EXR, verify `u_exposure` reflects scene luminance (mock GL context if needed, or browser-only test)
7. **PrerenderBufferManager two-pass**: Verify luminance pre-scan runs before effects, per-frame exposure varies, cache not invalidated by exposure variation

### Regression
8. **TypeScript check**: `npx tsc --noEmit`
9. **Full test suite**: `npx vitest run` (7600+ existing tests must pass)
10. **Visual verification**: Load HDR EXR/video, toggle auto-exposure on/off, verify no flicker; toggle gamut mapping on Rec.2020 content, verify no hue shifts
