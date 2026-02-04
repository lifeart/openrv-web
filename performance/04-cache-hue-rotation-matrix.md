# 04 - Cache Hue Rotation Matrix by Angle

## Problem Description

The `buildHueRotationMatrix()` function performs 30+ floating point operations (including `Math.cos`, `Math.sin`, `Math.sqrt`, and a chain of multiplications and additions) to compute a 9-element Float32Array hue rotation matrix. This function is called on every frame when hue rotation is active, even though the matrix only changes when the hue rotation angle changes. Since users typically set a hue rotation angle and leave it, the matrix is being recomputed identically on every frame.

**Impact:** 30+ floating point operations including two transcendental function calls (`Math.cos`, `Math.sin`) and one `Math.sqrt` per frame, plus a `new Float32Array(9)` allocation per frame, all producing the same result until the user changes the hue angle.

## Current Code

**File:** `src/utils/effectProcessing.shared.ts`

### buildHueRotationMatrix (lines 278-317)

```typescript
/**
 * Build a 3x3 luminance-preserving hue rotation matrix.
 * Uses Rodrigues rotation around (1,1,1)/sqrt(3) with a luminance shear
 * correction to preserve Rec.709 luminance.
 * Returns a 9-element Float32Array in column-major order (for WebGL mat3).
 */
export function buildHueRotationMatrix(degrees: number): Float32Array {
  const rad = (degrees * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const sq3 = Math.sqrt(3);
  const oo = 1 / 3;
  const t = 1 - cosA;

  // Rodrigues rotation around (1,1,1)/sqrt(3) (row-major)
  const r00 = cosA + t * oo;
  const r01 = t * oo - sinA / sq3;
  const r02 = t * oo + sinA / sq3;
  const r10 = t * oo + sinA / sq3;
  const r11 = cosA + t * oo;
  const r12 = t * oo - sinA / sq3;
  const r20 = t * oo - sinA / sq3;
  const r21 = t * oo + sinA / sq3;
  const r22 = cosA + t * oo;

  // Luminance shear correction: M = TInv * rot * T
  const dR = LUMA_R - oo;
  const dG = LUMA_G - oo;
  const dB = LUMA_B - oo;

  // P = rot * T: P[i][j] = r[i][j] + dj (row sums of rot = 1)
  const p00 = r00 + dR, p01 = r01 + dG, p02 = r02 + dB;
  const p10 = r10 + dR, p11 = r11 + dG, p12 = r12 + dB;
  const p20 = r20 + dR, p21 = r21 + dG, p22 = r22 + dB;

  // M = TInv * P: M[i][j] = P[i][j] - (dR*P[0][j] + dG*P[1][j] + dB*P[2][j])
  const col0 = dR * p00 + dG * p10 + dB * p20;
  const col1 = dR * p01 + dG * p11 + dB * p21;
  const col2 = dR * p02 + dG * p12 + dB * p22;

  return new Float32Array([
    p00 - col0, p10 - col0, p20 - col0,
    p01 - col1, p11 - col1, p21 - col1,
    p02 - col2, p12 - col2, p22 - col2,
  ]);
}
```

### isIdentityHueRotation (lines 322-324)

```typescript
export function isIdentityHueRotation(degrees: number): boolean {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized === 0;
}
```

## Implementation Plan

### Step 1: Add module-level cache

Add a simple cache at module scope in `effectProcessing.shared.ts`, right before the `buildHueRotationMatrix` function. Since the file is shared between main thread and worker, the cache is per-context (each gets its own module instance), which is correct.

```typescript
// Cache for hue rotation matrix - keyed by degrees value
let cachedHueRotationDegrees: number | null = null;
let cachedHueRotationMatrix: Float32Array | null = null;
```

### Step 2: Add a cached wrapper function

```typescript
/**
 * Get a cached hue rotation matrix for the given angle.
 * Returns the same Float32Array reference if the angle hasn't changed.
 *
 * IMPORTANT: Callers must NOT modify the returned Float32Array.
 */
export function getHueRotationMatrix(degrees: number): Float32Array {
  // Normalize to handle equivalent angles
  const normalized = ((degrees % 360) + 360) % 360;

  if (cachedHueRotationMatrix !== null && cachedHueRotationDegrees === normalized) {
    return cachedHueRotationMatrix;
  }

  cachedHueRotationDegrees = normalized;
  cachedHueRotationMatrix = buildHueRotationMatrix(normalized);
  return cachedHueRotationMatrix;
}
```

### Step 3: Update all callers to use the cached version

Search for all call sites of `buildHueRotationMatrix` and replace with `getHueRotationMatrix`:

```bash
grep -rn "buildHueRotationMatrix" src/
```

Update each call site. The function signature is the same (`degrees: number`) and the return type is the same (`Float32Array`), so this is a drop-in replacement.

### Step 4: Keep buildHueRotationMatrix exported

Keep the original `buildHueRotationMatrix` function exported for testing and for cases where a fresh matrix is explicitly needed. The cached function delegates to it.

### Step 5: Add a cache-clear function for testing

```typescript
/**
 * Clear the hue rotation matrix cache.
 * Primarily for testing purposes.
 */
export function clearHueRotationCache(): void {
  cachedHueRotationDegrees = null;
  cachedHueRotationMatrix = null;
}
```

## Testing Approach

1. **Correctness:** Verify that `getHueRotationMatrix(45)` returns the same values as `buildHueRotationMatrix(45)` by comparing all 9 elements.

2. **Cache hit:** Call `getHueRotationMatrix(45)` twice and verify the second call returns the same object reference (`===`).

3. **Cache invalidation:** Call `getHueRotationMatrix(45)`, then `getHueRotationMatrix(90)`, and verify the second call returns a different matrix with correct values for 90 degrees.

4. **Angle normalization:** Verify `getHueRotationMatrix(360)` and `getHueRotationMatrix(0)` return equivalent matrices. Verify `getHueRotationMatrix(-90)` and `getHueRotationMatrix(270)` return equivalent matrices.

5. **Visual test:** Apply hue rotation in the viewer and verify the colors shift correctly. Change the angle and verify it updates.

6. **Performance:** Use a profiler to verify that `Math.cos`/`Math.sin` are not called on every frame when the hue angle is static.

7. **Worker isolation:** Verify that the worker's cache is independent of the main thread's cache (they each import their own module instance).

## Acceptance Criteria

- [ ] `getHueRotationMatrix()` returns correct results for all angles
- [ ] Matrix is computed only once per unique angle (cache hit on repeated calls)
- [ ] Cache correctly invalidates when angle changes
- [ ] Equivalent angles (e.g., 0 and 360, -90 and 270) produce cache hits
- [ ] `buildHueRotationMatrix()` remains available for direct use
- [ ] Hue rotation visual output is unchanged
- [ ] Cache works independently in main thread and worker contexts
- [ ] No `Float32Array` allocation on cache hits
- [ ] All existing tests pass
