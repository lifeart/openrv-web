# Implementation Plan: Splitting Large Files

## Overview

| File | Current | Target | Effort | Impact |
|------|---------|--------|--------|--------|
| Viewer.ts | 4,811 | ~2,500 | High | High |
| ShaderStateManager.ts | 2,185 | ~900 | Medium | Medium |
| Session.ts | 1,382 | ~1,100 | Low | Low |
| PlaybackEngine.ts | 1,152 | ~1,152 | Low | Low |

**Recommended order:** ShaderStateManager (cleanest) -> Viewer (highest value) -> Session (modest) -> PlaybackEngine (refactor only, no split).

---

## File 1: Viewer.ts (4,811 lines)

Already has 18 extracted sub-modules (~7,834 lines). The remaining 4,811 lines cluster into identifiable responsibilities.

### Proposed Splits

#### A. `ViewerPixelEffects.ts` (~450 lines)

Extract the CPU pixel effect pipeline:
- `applyBatchedPixelEffects()`, `applyBatchedPixelEffectsAsync()`
- `applyLightweightEffects()`
- `compositeImageDataOverBackground()`
- `isToneMappingEnabled()`

Interface: `PixelEffectsContext` providing access to color pipeline, filter settings, channel mode, etc.

#### B. `ViewerImageRenderer.ts` (~800 lines)

Extract the core rendering dispatch:
- `renderImage()` (~700 lines, the largest single method)
- `renderWithWipe()`, `renderSplitScreen()`, `drawClippedSource()`, `drawSourceToContext()`
- `renderGhostFrames()`
- `renderBlendMode()`, `renderDifferenceMatte()`, `compositeStackLayers()`

Interface: `ImageRendererContext` providing session, managers, state, and callbacks.

#### C. `ViewerIndicators.ts` (~200 lines)

Extract HUD indicator/badge management:
- LUT indicator creation/management
- A/B indicator, `updateABIndicator()`
- Filter mode badge, toggle, preference loading
- Fit mode indicator

#### D. `ViewerCanvasSetup.ts` (~250 lines)

Extract DOM/canvas setup and layout:
- `initializeCanvas()`, `setCanvasSize()`, `updatePaintCanvasSize()`
- `updateCanvasPosition()`, `updateOverlayDimensions()`
- `drawPlaceholder()`, layout cache methods
- `updateCSSBackground()`, DPR listener management

### Import Updates

New files are internal implementation details -- **no import changes needed** in consuming files. The `Viewer` class public API is unchanged.

### Test Plan

Existing 14 test files continue working unchanged (Viewer API preserved). New test files:
- `ViewerPixelEffects.test.ts` -- unit tests for pixel effects in isolation
- `ViewerImageRenderer.test.ts` -- focused tests for source dispatch logic

### Risks

1. `renderImage()` accesses ~60 private fields -- very large context interface needed
2. Async effects generation tracking tightly coupled to `render()`
3. State mutation from multiple paths in `renderImage()`
4. `applyBatchedPixelEffectsAsync()` must also be extracted alongside the sync version

---

## File 2: ShaderStateManager.ts (2,185 lines)

The cleanest split opportunity -- pure data, procedural functions, clear boundaries.

### Proposed Splits

#### A. `ShaderConstants.ts` (~200 lines)

Pure data, no behavior:
- Dirty flag constants and `ALL_DIRTY_FLAGS` array
- `TONE_MAPPING_OPERATOR_CODES`, `GAMUT_CODES`, `GAMUT_MODE_CODES`
- `COLOR_PRIMARIES_MATRICES`
- `CHANNEL_MODE_CODES`, background pattern constants

#### B. `ShaderStateTypes.ts` (~250 lines)

State interface and factory:
- `InternalShaderState` interface (~195 lines)
- `createDefaultInternalState()` factory (~130 lines)
- `TextureCallbacks` interface
- Utility functions: `float32ArrayEquals`, `hexToRgbInto`, `assignColorAdjustments`, `assignToneMappingState`

#### C. `ShaderUniformUploader.ts` (~500 lines)

Extract `applyUniforms()` as standalone function:

```typescript
export function applyUniforms(
  state: InternalShaderState,
  dirtyFlags: Set<string>,
  shader: ShaderProgram,
  texCb: TextureCallbacks,
  buffers: UniformBuffers,
  textureUnitsInitialized: boolean,
): boolean;
```

Largest single method (460 lines). Purely procedural -- reads state, writes to shader. Clean and testable.

#### D. `ShaderBatchApplicator.ts` (~350 lines)

Extract `applyRenderState()`:

```typescript
export function applyRenderState(
  manager: ShaderStateManager,
  renderState: RenderState,
): void;
```

Compares incoming RenderState against current state and calls setters.

### Resulting ShaderStateManager.ts: ~900 lines

Remaining: class definition, dirty flag management, individual setters (~550 lines), cached getters (~100 lines), pre-allocated buffers (~30 lines), dispose.

### Import Updates

Re-export from `ShaderStateManager.ts` for backward compatibility:
```typescript
export { DIRTY_COLOR, TONE_MAPPING_OPERATOR_CODES, ... } from './ShaderConstants';
```

Or update imports in consuming files (preferred).

### Risks

1. Pre-allocated buffers (`exposureRGBBuffer`, etc.) must be passed to extracted functions
2. `_textureUnitsInitialized` flag toggled in `applyUniforms` -- manage via return value
3. `applyRenderState` has intimate knowledge of setter API
4. Constants like `GAMUT_CODES`, `GAMUT_MODE_CODES`, etc. are currently private — need export promotion when extracted to `ShaderConstants.ts`

---

## File 3: Session.ts (1,382 lines)

Already well-decomposed with `SessionPlayback`, `SessionAnnotations`, `SessionGraph`, `SessionMedia`, `SessionState`, `PlaybackTimingController`.

### Assessment: Low ROI

Remaining code is primarily:
- Type definitions (~260 lines)
- Constructor wiring (~90 lines)
- Thin delegation methods (~400 lines of one-liners)
- Backward-compat protected accessors (~75 lines)
- GTO parsing wrapper methods (~90 lines for test compat)

### Proposed Splits

#### A. `SessionTypes.ts` (~170 lines)

Move interfaces: `GTOComponentDTO`, `ParsedAnnotations`, `UnsupportedCodecInfo`, `GTOViewSettings`, `MatteSettings`, `SessionMetadata`, `AudioPlaybackError`, `SessionEvents`, `MediaSource`.

Re-export from `Session.ts` for backward compatibility.

#### B. `SessionGTOCompat.ts` (~100 lines)

Move private GTO wrapper methods kept for test backward compatibility. Low priority.

### Resulting Session.ts: ~1,100 lines

Modest reduction. File is already well-factored; remaining size justified by facade role.

---

## File 4: PlaybackEngine.ts (1,152 lines)

### Assessment: Refactor, Don't Split

At 1,152 lines with timing controller already extracted, the file is reasonably sized. The `update()` method (216 lines) is the main complexity.

### Recommendation

Refactor `update()` into named sub-methods within the same class:
- `updateMediabunnyPlayback()` -- mediabunny video path
- `updateNativeVideoPlayback()` -- native video fallback
- `updateImagePlayback()` -- image/reverse playback

This improves readability without the overhead of a separate file.

---

## Implementation Sequence

1. **ShaderStateManager.ts** -- Cleanest splits, pure data/function extraction, low risk
2. **Viewer.ts (ViewerPixelEffects)** -- High value, well-bounded
3. **Viewer.ts (ViewerImageRenderer)** -- Highest complexity, biggest win
4. **Viewer.ts (ViewerIndicators + ViewerCanvasSetup)** -- Straightforward
5. **Session.ts (SessionTypes)** -- Low effort, modest value
6. **PlaybackEngine.ts** -- Refactor `update()` into sub-methods only

---

## Critical Files

- `src/ui/components/Viewer.ts` -- Primary target (4,811 lines)
- `src/render/ShaderStateManager.ts` -- Cleanest split (2,185 lines)
- `src/ui/components/ViewerGLRenderer.ts` -- Pattern to follow (context interface)
- `src/render/RenderState.ts` -- Interface consumed by batch applicator
