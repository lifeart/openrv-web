# Implementation Plan: Fix GC Pressure in Hot Render Paths

## Selected Item: #5 from PERFORMANCE_IMPROVEMENT_PLAN.md

**Why this item?** It contains the highest-impact performance bottleneck in the codebase:
- 5.4 allocates **133 MB per frame** for RGB→RGBA padding on 4K EXR sequences
- 5.1 creates **2M short-lived arrays per frame** in CPU hue rotation path
- 5.2/5.3/5.5 create unnecessary objects in the core render loop at 60fps

## Implementation Order (dependency-aware)

```
Task 1 (5.4) ─── Pool RGB-to-RGBA buffer ──────── HIGHEST IMPACT (133MB/frame)
Task 2 (5.3b) ── Avoid Float32Array in setUniform ─ BROAD BENEFIT (prerequisite for Task 3)
Task 3 (5.5) ─── Pre-allocate SSM tuple buffers ── INTERACTIVE GRADING
Task 4 (5.2) ─── Cache TextureCallbacks ────────── PER-FRAME UNCONDITIONAL
Task 5 (5.3a) ── Pre-allocate u_offset/u_scale ─── SMALL CLEANUP
Task 6 (5.1) ─── applyHueRotationInto ─────────── CPU FALLBACK PATH
```

**Dependencies:** Task 3 benefits from Task 2 (without Task 2, pre-allocated `number[]` tuples still get wrapped in `Float32Array`). All other tasks are fully independent.

---

## Naming Conventions (from codebase analysis)

- **Renderer.ts**: No underscore prefix for buffer fields. Pattern: `{purpose}Buffer` (e.g., `lut3DRGBABuffer`, `falseColorRGBABuffer`)
- **ShaderStateManager.ts**: No underscore prefix. Pattern: `{purpose}Buffer` (e.g., `resolutionBuffer`)
- **Write-into-buffer functions**: `{name}Into` suffix (precedent: `hexToRgbInto` in ShaderStateManager.ts:141)

---

## Task 1: Pool RGB-to-RGBA Padding Buffer on Renderer

**Impact:** Eliminates 133MB allocation per frame at 4K during EXR sequence playback (~3.2 GB/s garbage at 24fps)
**Risk:** Very Low — follows existing `lut3DRGBABuffer` pattern exactly
**Files:** `src/render/Renderer.ts`, `src/render/Renderer.test.ts`

### Sub-task 1a: Add buffer fields and pool in updateTexture

**File:** `src/render/Renderer.ts`

- Add fields after existing buffer declarations (around line 97):
  ```typescript
  private rgbaPadBuffer: Float32Array | null = null;
  private rgbaPadBufferSize = 0;
  ```
- In `updateTexture()` around line 835, replace:
  ```typescript
  // BEFORE:
  const rgba = new Float32Array(pixelCount * 4);

  // AFTER:
  if (this.rgbaPadBufferSize !== pixelCount) {
    this.rgbaPadBuffer = new Float32Array(pixelCount * 4);
    this.rgbaPadBufferSize = pixelCount;
  }
  const rgba = this.rgbaPadBuffer!;
  ```
- **Strategy:** Exact-size-match (reallocate when pixelCount changes), matching `lut3DRGBABuffer` pattern. Not grow-only — avoids retaining 133MB when switching from 4K to 1080p.
- **Done when:** `new Float32Array(pixelCount * 4)` is no longer allocated per frame
- **Verify:** `npx vitest run src/render/Renderer.test.ts && npx tsc --noEmit`

### Sub-task 1b: Null buffer in dispose()

**File:** `src/render/Renderer.ts`

- Add to `dispose()` after line 2132 (alongside existing buffer cleanup):
  ```typescript
  this.rgbaPadBuffer = null;
  this.rgbaPadBufferSize = 0;
  ```
- **Done when:** Both fields nulled in dispose
- **Verify:** `npx vitest run src/render/Renderer.test.ts`

### Sub-task 1c: Add unit tests

**File:** `src/render/Renderer.test.ts`

| Test ID | Test Name | Assertion |
|---------|-----------|-----------|
| REN-PAD-001 | 3-channel float image renders correctly with pooled RGBA buffer | `texImage2D` called with RGBA data where alpha=1.0, RGB values match source |
| REN-PAD-002 | Pooled buffer is reused for same-dimension images | Spy on Float32Array constructor; verify zero calls for pad buffer on second render |
| REN-PAD-003 | Buffer is reallocated when dimensions change | Render 100x100 then 200x200; verify new allocation |
| REN-PAD-004 | 4-channel float image does NOT use RGBA pad buffer | No padding step for channels=4 |
| REN-PAD-005 | Buffer handles 1x1 image | Correct 4-element Float32Array |

---

## Task 2: Avoid Float32Array Conversion in ShaderProgram.setUniform

**Impact:** Eliminates ~16 Float32Array allocations per frame across all vec2/3/4 uniform calls
**Risk:** Low — WebGL2 spec guarantees `uniform*fv` accepts `number[]` (Float32List = Float32Array | sequence<GLfloat>)
**Files:** `src/render/ShaderProgram.ts`, new `src/render/ShaderProgram.test.ts`

### Sub-task 2a: Modify setUniform to pass arrays directly for vec2/3/4

**File:** `src/render/ShaderProgram.ts`

- At line 259-280, refactor the `Array.isArray(value)` branch:
  ```typescript
  // BEFORE:
  const arr = value instanceof Float32Array ? value : new Float32Array(value);
  switch (arr.length) { ... }

  // AFTER:
  // For Float32Array: use directly (zero-copy to WebGL)
  // For number[]: pass directly for vec2/3/4 (WebGL2 accepts number[])
  //              wrap in Float32Array only for matrix uniforms (length 9, 16)
  if (value instanceof Float32Array) {
    // existing switch on value.length
  } else if (Array.isArray(value)) {
    switch (value.length) {
      case 1: gl.uniform1fv(location, value); break;
      case 2: gl.uniform2fv(location, value); break;
      case 3: gl.uniform3fv(location, value); break;
      case 4: gl.uniform4fv(location, value); break;
      case 9: gl.uniformMatrix3fv(location, false, new Float32Array(value)); break;
      case 16: gl.uniformMatrix4fv(location, false, new Float32Array(value)); break;
    }
  }
  ```
- Keep Float32Array wrapping for matrix uniforms (length 9, 16) — conservative approach for driver compatibility
- **Done when:** No `new Float32Array` created for vec2/3/4 uniforms
- **Verify:** `npx vitest run src/render/ && npx tsc --noEmit`

### Sub-task 2b: Add unit tests

**File:** New `src/render/ShaderProgram.test.ts`

| Test ID | Test Name | Assertion |
|---------|-----------|-----------|
| SP-001 | setUniform with number[] length 2 calls uniform2fv directly | `gl.uniform2fv` called with original array, NOT Float32Array |
| SP-002 | setUniform with number[] length 3 calls uniform3fv directly | Same pattern |
| SP-003 | setUniform with number[] length 4 calls uniform4fv directly | Same pattern |
| SP-004 | setUniform with Float32Array bypasses wrapping | `gl.uniform3fv` called with same Float32Array reference |
| SP-005 | setUniform with number[] length 9 still wraps in Float32Array | Matrix path preserved |
| SP-006 | setUniform with number[] length 16 still wraps in Float32Array | Matrix path preserved |
| SP-PERF-001 | setUniform with number[] of length 2-4 does NOT construct Float32Array | Spy on `Float32Array` constructor; verify zero calls |

---

## Task 3: Pre-allocate Color Grading Tuple Buffers on ShaderStateManager

**Impact:** Eliminates ~7 tuple allocations per color change during interactive grading (~420 allocs/sec during slider drags)
**Risk:** Very Low — follows existing `resolutionBuffer` pattern
**Files:** `src/render/ShaderStateManager.ts`, `src/render/ShaderStateManager.test.ts`
**Depends on:** Task 2 (without it, `number[]` tuples still get wrapped in `Float32Array`)

### Sub-task 3a: Add buffer fields

**File:** `src/render/ShaderStateManager.ts`

- Add after `resolutionBuffer` declaration (line 525):
  ```typescript
  private readonly exposureRGBBuffer: [number, number, number] = [0, 0, 0];
  private readonly gammaRGBBuffer: [number, number, number] = [0, 0, 0];
  private readonly contrastRGBBuffer: [number, number, number] = [0, 0, 0];
  private readonly safeGammaRGBBuffer: [number, number, number] = [0, 0, 0];
  private readonly safeExposureRGBBuffer: [number, number, number] = [0, 0, 0];
  private readonly scaleRGBBuffer: [number, number, number] = [0, 0, 0];
  private readonly offsetRGBBuffer: [number, number, number] = [0, 0, 0];
  private readonly channelSwizzleBuffer = new Int32Array(4);
  ```
- These are `readonly` and tiny (~56 bytes each) — no need to null in `dispose()` (matching `resolutionBuffer` pattern which is also not nulled)
- **Done when:** Fields compile without errors
- **Verify:** `npx tsc --noEmit`

### Sub-task 3b: Use buffers in DIRTY_COLOR block

**File:** `src/render/ShaderStateManager.ts`

- In lines 1372-1401, replace tuple creation with writes into pre-allocated buffers:
  ```typescript
  // BEFORE:
  const expRGB = adj.exposureRGB ?? [adj.exposure, adj.exposure, adj.exposure];
  const safeGammaRGB: [number, number, number] = [
    gamRGB[0] <= 0 ? 1e-4 : gamRGB[0], ...
  ];

  // AFTER:
  const expBuf = this.exposureRGBBuffer;
  if (adj.exposureRGB) {
    expBuf[0] = adj.exposureRGB[0]; expBuf[1] = adj.exposureRGB[1]; expBuf[2] = adj.exposureRGB[2];
  } else {
    expBuf[0] = adj.exposure; expBuf[1] = adj.exposure; expBuf[2] = adj.exposure;
  }
  // ... same pattern for all 7 buffers
  ```
- Pass buffer references to `shader.setUniform()` (WebGL consumes data synchronously — buffer aliasing is safe)
- **Done when:** No `[number, number, number]` tuple literals in DIRTY_COLOR block
- **Verify:** `npx vitest run src/render/ShaderStateManager.test.ts && npx tsc --noEmit`

### Sub-task 3c: Use channelSwizzleBuffer in DIRTY_CHANNEL_SWIZZLE block

**File:** `src/render/ShaderStateManager.ts`

- At line 1658, replace `new Int32Array(s.channelSwizzle)` with:
  ```typescript
  this.channelSwizzleBuffer[0] = s.channelSwizzle[0];
  this.channelSwizzleBuffer[1] = s.channelSwizzle[1];
  this.channelSwizzleBuffer[2] = s.channelSwizzle[2];
  this.channelSwizzleBuffer[3] = s.channelSwizzle[3];
  shader.setUniform('u_channelSwizzle', this.channelSwizzleBuffer);
  ```
- Note: `Int32Array` already takes the direct `gl.uniform4iv` path in `setUniform` — independent of Task 2
- **Done when:** No `new Int32Array` in that block
- **Verify:** `npx vitest run src/render/ShaderStateManager.test.ts`

### Sub-task 3d: Add tests for buffer reuse

**File:** `src/render/ShaderStateManager.test.ts`

| Test ID | Test Name | Assertion |
|---------|-----------|-----------|
| SSM-GC-001 | u_exposureRGB receives correct values via pre-allocated buffer | Mock receives expected [exp, exp, exp] |
| SSM-GC-002 | u_gammaRGB clamps zero values to epsilon | Values > 0 |
| SSM-GC-003 | u_exposureRGB sanitizes non-finite values | [Infinity, NaN] → [0, 0, 0] |
| SSM-GC-010 | u_exposureRGB receives same tuple reference across frames | `===` identity check on two consecutive calls |
| SSM-GC-011 | u_gammaRGB receives same reference across frames | Same pattern |
| SSM-GC-020 | u_channelSwizzle uses pre-allocated Int32Array | Same Int32Array reference |
| SSM-GC-021 | u_channelSwizzle values update when swizzle changes | Buffer contains new values |

---

## Task 4: Cache TextureCallbacks Object on Renderer

**Impact:** Eliminates 7 object allocations per frame (1 object + 6 closures), unconditionally at 60fps
**Risk:** Moderate — closures must use deferred `this.gl!`, not captured `const gl`
**Files:** `src/render/Renderer.ts`, `src/render/Renderer.test.ts`

### Sub-task 4a: Add cached callbacks field and modify createTextureCallbacks

**File:** `src/render/Renderer.ts`

- Add field: `private cachedTextureCallbacks: TextureCallbacks | null = null;`
- Modify `createTextureCallbacks()` (line 537):
  ```typescript
  private createTextureCallbacks(): TextureCallbacks {
    if (this.cachedTextureCallbacks) return this.cachedTextureCallbacks;

    // CRITICAL: Use this.gl! inside closures (deferred resolution), NOT captured const gl
    // This ensures context restore works correctly after dispose/initialize cycles
    this.cachedTextureCallbacks = {
      bindCurvesLUTTexture: () => {
        this.ensureCurvesLUTTexture();
        const gl = this.gl!;  // deferred
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.curvesLUTTexture);
      },
      // ... same pattern for all 5 other bind callbacks ...
      getCanvasSize: () => {
        this.canvasSizeCache.width = this.canvas?.width ?? 0;
        this.canvasSizeCache.height = this.canvas?.height ?? 0;
        return this.canvasSizeCache;
      },
    };
    return this.cachedTextureCallbacks;
  }
  ```
- **Why deferred `this.gl!`:** The original code captures `const gl = this.gl!` by value. If the Renderer is disposed and re-initialized (WebGL context restore), the cached closures would hold a stale GL reference. Using `this.gl!` inside each closure ensures the current context is always used.

### Sub-task 4b: Add canvasSizeCache to avoid per-call object allocation

**File:** `src/render/Renderer.ts`

- Add field: `private canvasSizeCache = { width: 0, height: 0 };`
- The `getCanvasSize` closure updates and returns this cached object (see 4a code above)
- **Important:** The consumer (`ShaderStateManager.applyUniforms` line 1525) reads `.width` and `.height` immediately and copies into `resolutionBuffer`. It does NOT store the object reference for later comparison. Mutating in place is safe.

### Sub-task 4c: Null cached callbacks in dispose and initialize

**File:** `src/render/Renderer.ts`

- Add `this.cachedTextureCallbacks = null;` to:
  - `dispose()` (after line 2132)
  - Start of `initialize()` (around line 165) — ensures context restore creates fresh callbacks
- **Done when:** Both methods null the field

### Sub-task 4d: Add tests

**File:** `src/render/Renderer.test.ts`

| Test ID | Test Name | Assertion |
|---------|-----------|-----------|
| REN-TC-001 | renderImage still renders correctly after TextureCallbacks caching | `gl.drawArrays` called, textures bound correctly |
| REN-TC-002 | getCanvasSize returns correct dimensions after canvas resize | `u_resolution` uniform reflects new size |
| REN-TC-003 | After dispose() + initialize(), rendering still works | New GL context used (no stale references) |

---

## Task 5: Pre-allocate u_offset/u_scale Float32Array(2) on Renderer

**Impact:** Eliminates 4 allocations per frame (2 array literals + 2 Float32Array in setUniform)
**Risk:** Very Low
**Files:** `src/render/Renderer.ts`, `src/render/Renderer.test.ts`

### Sub-task 5a: Add buffer fields and use in renderImage

**File:** `src/render/Renderer.ts`

- Add fields:
  ```typescript
  private readonly offsetBuffer = new Float32Array(2);
  private readonly scaleBuffer = new Float32Array(2);
  ```
- In `renderImage()` lines 414-415:
  ```typescript
  // BEFORE:
  this.displayShader.setUniform('u_offset', [offsetX, offsetY]);
  this.displayShader.setUniform('u_scale', [scaleX, scaleY]);

  // AFTER:
  this.offsetBuffer[0] = offsetX; this.offsetBuffer[1] = offsetY;
  this.displayShader.setUniform('u_offset', this.offsetBuffer);
  this.scaleBuffer[0] = scaleX; this.scaleBuffer[1] = scaleY;
  this.displayShader.setUniform('u_scale', this.scaleBuffer);
  ```
- Since these are `Float32Array`, they take the `instanceof Float32Array` path in `setUniform` — no wrapping. Independent of Task 2.

### Sub-task 5b: Use buffers in renderSDRFrame

**File:** `src/render/Renderer.ts`

- At lines 2045-2046, same pattern with values `[0,0]` and `[1,1]`
- **Verify:** `npx vitest run src/render/Renderer.test.ts`

### Sub-task 5c: Add test

| Test ID | Test Name | Assertion |
|---------|-----------|-----------|
| REN-UB-001 | u_offset/u_scale uniforms are set with Float32Array (not plain array) | `uniform2fv` receives Float32Array |

---

## Task 6: Add applyHueRotationInto Write-Into-Buffer Variant

**Impact:** Eliminates ~2M tuple allocations per frame in CPU hue rotation fallback path
**Risk:** Very Low — additive API, original function preserved
**Files:** `src/color/HueRotation.ts`, `src/effects/adapters/HueRotationEffect.ts`, `src/ui/components/Viewer.ts`, `src/color/HueRotation.test.ts`

### Sub-task 6a: Add applyHueRotationInto function

**File:** `src/color/HueRotation.ts`

```typescript
// Follows hexToRgbInto convention (ShaderStateManager.ts:141)
export function applyHueRotationInto(
  r: number, g: number, b: number, degrees: number,
  out: [number, number, number]
): void {
  const mat = getHueRotationMatrix(degrees);
  out[0] = Math.max(0, Math.min(1, mat[0]! * r + mat[3]! * g + mat[6]! * b));
  out[1] = Math.max(0, Math.min(1, mat[1]! * r + mat[4]! * g + mat[7]! * b));
  out[2] = Math.max(0, Math.min(1, mat[2]! * r + mat[5]! * g + mat[8]! * b));
}
```

- Also add export to `src/color/ColorProcessingFacade.ts`
- **Done when:** Function compiles and is exported
- **Verify:** `npx tsc --noEmit`

### Sub-task 6b: Add unit tests

**File:** `src/color/HueRotation.test.ts`

| Test ID | Test Name | Assertion |
|---------|-----------|-----------|
| HRM-INTO-001 | applyHueRotationInto produces identical results to applyHueRotation | All channels match within 1e-6 for angles [0, 30, 90, 137, 180, 270] |
| HRM-INTO-002 | Output buffer is same reference across calls | `===` identity check |
| HRM-INTO-003 | Clamps output to [0,1] | All values in range |
| HRM-INTO-004 | Preserves neutral gray | (0.5, 0.5, 0.5) at 90° → (0.5, 0.5, 0.5) |
| HRM-INTO-005 | Handles (0,0,0) black | Output (0,0,0) |
| HRM-INTO-006 | Handles (1,1,1) white | Output (1,1,1) |

### Sub-task 6c: Update HueRotationEffect.ts call site

**File:** `src/effects/adapters/HueRotationEffect.ts`

- Import `applyHueRotationInto`
- Declare `const hueOut: [number, number, number] = [0, 0, 0]` before loop
- Replace `const [nr, ng, nb] = applyHueRotation(r, g, b, degrees)` with:
  ```typescript
  applyHueRotationInto(r, g, b, degrees, hueOut);
  // use hueOut[0], hueOut[1], hueOut[2]
  ```
- **Verify:** `npx vitest run src/effects/ && npx tsc --noEmit`

### Sub-task 6d: Update Viewer.ts call sites (two locations)

**File:** `src/ui/components/Viewer.ts`

- At lines 2770 and 2966: same pattern as 6c
- **Verify:** `npx vitest run src/ui/ && npx tsc --noEmit`

---

## Parallelization Strategy

```
Wave 1 (all independent):  1a, 2a, 3a, 4a, 5a, 6a
Wave 2 (some dependencies): 1b, 2b, 3b (needs 2a), 3c, 4b+4c, 5b, 6b+6c+6d
Wave 3 (tests):            1c, 3d, 4d, 5c
Final:                     npx vitest run && npx tsc --noEmit
```

## Rollback Strategy

Each task is independently rollbackable:
- **Task 1:** Revert to `new Float32Array(pixelCount * 4)` per call
- **Task 2:** Revert to always wrapping in `new Float32Array(value)`
- **Task 3:** Revert to inline tuple literals (works with or without Task 2)
- **Task 4:** Revert to creating fresh TextureCallbacks per call
- **Task 5:** Revert to `[offsetX, offsetY]` array literals
- **Task 6:** Revert call sites to `applyHueRotation` (function kept intact)

## Impact Summary

| Task | Allocations Eliminated | Bytes/sec Saved (worst case) | Risk |
|------|----------------------|------------------------------|------|
| 1 (5.4) | 24/sec at 24fps | ~3.2 GB/s at 4K | Very Low |
| 2 (5.3b) | ~1,200/sec at 60fps | ~120 KB/s | Low |
| 3 (5.5) | ~420/sec during grading | ~10 KB/s | Very Low |
| 4 (5.2) | ~420/sec at 60fps | ~50 KB/s | Moderate |
| 5 (5.3a) | ~240/sec at 60fps | ~4 KB/s | Very Low |
| 6 (5.1) | ~124M/sec at 60fps (CPU path) | ~6.9 GB/s (CPU path only) | Very Low |

## Test Baseline

- **TypeScript:** Pre-existing errors in 2 test files (unrelated)
- **Tests:** 388 files passed, 16354 individual tests, 1 pre-existing failure (stale test REN-SDR-004)
- **New tests to add:** ~30 across all tasks
