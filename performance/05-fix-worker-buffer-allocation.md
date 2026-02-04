# 05 - Reuse Buffers in Worker Clarity Effect

## Problem Description

The clarity effect implementation in the Web Worker allocates new `Uint8ClampedArray` buffers on every call. The `applyGaussianBlur5x5` function creates two new buffers (`result` and `temp`) sized to the full image data, and `applyClarity` creates an additional copy (`original`) and a `Float32Array(256)` midtone mask. For a 1920x1080 image, each buffer is ~8MB, so each clarity call allocates ~24MB of temporary memory that is immediately garbage collected.

The main thread version in `EffectProcessor.ts` already has proper buffer reuse via `ensureClarityBuffers()` and `getMidtoneMask()`. This task ports that pattern to the worker.

**Impact:** ~24MB of allocations per frame when clarity is active in the worker, causing GC pressure and potential frame drops.

## Current Code

### Worker Implementation

**File:** `src/workers/effectProcessor.worker.ts`

#### applyGaussianBlur5x5 (lines 184-227)

```typescript
function applyGaussianBlur5x5(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);  // <-- New buffer every call (~8MB)
  const temp = new Uint8ClampedArray(data.length);    // <-- New buffer every call (~8MB)
  const kernel = [1, 4, 6, 4, 1];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0,
          weightSum = 0;
        for (let k = -2; k <= 2; k++) {
          const nx = Math.min(width - 1, Math.max(0, x + k));
          sum += data[(y * width + nx) * 4 + c]! * kernel[k + 2]!;
          weightSum += kernel[k + 2]!;
        }
        temp[idx + c] = sum / weightSum;
      }
      temp[idx + 3] = data[idx + 3]!;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0,
          weightSum = 0;
        for (let k = -2; k <= 2; k++) {
          const ny = Math.min(height - 1, Math.max(0, y + k));
          sum += temp[(ny * width + x) * 4 + c]! * kernel[k + 2]!;
          weightSum += kernel[k + 2]!;
        }
        result[idx + c] = sum / weightSum;
      }
      result[idx + 3] = temp[idx + 3]!;
    }
  }
  return result;
}
```

#### applyClarity (lines 229-261)

```typescript
function applyClarity(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  ca: ColorAdjustments
): void {
  const clarity = ca.clarity / 100;
  const original = new Uint8ClampedArray(data);    // <-- New buffer every call (~8MB)
  const blurred = applyGaussianBlur5x5(original, width, height);

  const midtoneMask = new Float32Array(256);       // <-- New buffer every call (1KB)
  for (let i = 0; i < 256; i++) {
    const n = i / 255;
    const dev = Math.abs(n - 0.5) * 2;
    midtoneMask[i] = 1.0 - dev * dev;
  }

  const effectScale = clarity * CLARITY_EFFECT_SCALE;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const r = original[i]!,
      g = original[i + 1]!,
      b = original[i + 2]!;
    const lum = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    const mask = midtoneMask[Math.min(255, Math.max(0, Math.round(lum)))]!;
    const adj = mask * effectScale;

    data[i] = Math.max(0, Math.min(255, r + (r - blurred[i]!) * adj));
    data[i + 1] = Math.max(0, Math.min(255, g + (g - blurred[i + 1]!) * adj));
    data[i + 2] = Math.max(0, Math.min(255, b + (b - blurred[i + 2]!) * adj));
  }
}
```

### Main Thread Implementation (reference)

**File:** `src/utils/EffectProcessor.ts`

#### ensureClarityBuffers (lines 428-435)

```typescript
private ensureClarityBuffers(size: number): void {
  if (this.clarityBufferSize !== size) {
    this.clarityOriginalBuffer = new Uint8ClampedArray(size);
    this.clarityBlurTempBuffer = new Uint8ClampedArray(size);
    this.clarityBlurResultBuffer = new Uint8ClampedArray(size);
    this.clarityBufferSize = size;
  }
}
```

#### applyClarity with buffer reuse (lines 441-481)

```typescript
private applyClarity(imageData: ImageData, width: number, height: number, colorAdjustments: ColorAdjustments): void {
  const data = imageData.data;
  const clarity = colorAdjustments.clarity / 100;
  const len = data.length;

  // Ensure buffers are the right size (reuses if already correct)
  this.ensureClarityBuffers(len);
  const original = this.clarityOriginalBuffer!;
  original.set(data);

  // Apply blur using reusable buffers
  this.applyGaussianBlur5x5InPlace(original, width, height);
  const blurred = this.clarityBlurResultBuffer!;

  // Use cached midtone mask
  const midtoneMask = this.getMidtoneMask();
  // ... rest of processing
}
```

## Implementation Plan

### Step 1: Add module-level buffer state to the worker

At the top of `effectProcessor.worker.ts` (after imports), add persistent buffer state:

```typescript
// Reusable clarity buffers - allocated once and reused across frames
let clarityOriginalBuffer: Uint8ClampedArray | null = null;
let clarityBlurTempBuffer: Uint8ClampedArray | null = null;
let clarityBlurResultBuffer: Uint8ClampedArray | null = null;
let clarityBufferSize = 0;

// Cached midtone mask (never changes, 256 entries)
let midtoneMask: Float32Array | null = null;
```

### Step 2: Add buffer management functions

```typescript
function ensureClarityBuffers(size: number): void {
  if (clarityBufferSize !== size) {
    clarityOriginalBuffer = new Uint8ClampedArray(size);
    clarityBlurTempBuffer = new Uint8ClampedArray(size);
    clarityBlurResultBuffer = new Uint8ClampedArray(size);
    clarityBufferSize = size;
  }
}

function getMidtoneMask(): Float32Array {
  if (!midtoneMask) {
    midtoneMask = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const n = i / 255;
      const dev = Math.abs(n - 0.5) * 2;
      midtoneMask[i] = 1.0 - dev * dev;
    }
  }
  return midtoneMask;
}
```

### Step 3: Rewrite applyGaussianBlur5x5 to write into pre-allocated buffers

Change the signature to accept and write into the pre-allocated buffers instead of allocating new ones:

```typescript
function applyGaussianBlur5x5InPlace(
  data: Uint8ClampedArray,
  width: number,
  height: number
): void {
  const result = clarityBlurResultBuffer!;
  const temp = clarityBlurTempBuffer!;
  const kernel = [1, 4, 6, 4, 1];

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0,
          weightSum = 0;
        for (let k = -2; k <= 2; k++) {
          const nx = Math.min(width - 1, Math.max(0, x + k));
          sum += data[(y * width + nx) * 4 + c]! * kernel[k + 2]!;
          weightSum += kernel[k + 2]!;
        }
        temp[idx + c] = sum / weightSum;
      }
      temp[idx + 3] = data[idx + 3]!;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0,
          weightSum = 0;
        for (let k = -2; k <= 2; k++) {
          const ny = Math.min(height - 1, Math.max(0, y + k));
          sum += temp[(ny * width + x) * 4 + c]! * kernel[k + 2]!;
          weightSum += kernel[k + 2]!;
        }
        result[idx + c] = sum / weightSum;
      }
      result[idx + 3] = temp[idx + 3]!;
    }
  }
}
```

### Step 4: Rewrite applyClarity to use reusable buffers

```typescript
function applyClarity(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  ca: ColorAdjustments
): void {
  const clarity = ca.clarity / 100;
  const len = data.length;

  // Ensure buffers are correctly sized (reuses if size matches)
  ensureClarityBuffers(len);

  const original = clarityOriginalBuffer!;
  original.set(data);

  // Blur writes into clarityBlurResultBuffer
  applyGaussianBlur5x5InPlace(original, width, height);
  const blurred = clarityBlurResultBuffer!;

  // Use cached midtone mask
  const mask = getMidtoneMask();
  const effectScale = clarity * CLARITY_EFFECT_SCALE;

  for (let i = 0; i < len; i += 4) {
    const r = original[i]!,
      g = original[i + 1]!,
      b = original[i + 2]!;
    const lum = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    const lumIndex = Math.min(255, Math.max(0, Math.round(lum)));
    const adj = mask[lumIndex]! * effectScale;

    data[i] = Math.max(0, Math.min(255, r + (r - blurred[i]!) * adj));
    data[i + 1] = Math.max(0, Math.min(255, g + (g - blurred[i + 1]!) * adj));
    data[i + 2] = Math.max(0, Math.min(255, b + (b - blurred[i + 2]!) * adj));
  }
}
```

## Testing Approach

1. **Visual correctness:** Enable clarity adjustment in the viewer with worker processing active. Compare output visually to the main-thread EffectProcessor at the same clarity value. Pixels should be identical.

2. **Pixel-exact comparison:** Write a test that processes the same ImageData through both the worker `applyClarity` and the main-thread `EffectProcessor.applyClarity` and asserts the output arrays are identical.

3. **Buffer reuse verification:** Add temporary logging or use a profiler to confirm that after the first call, `ensureClarityBuffers` does not allocate new buffers on subsequent calls with the same image dimensions.

4. **Size change handling:** Process an image at one resolution, then process at a different resolution. Verify buffers are correctly reallocated and output is still correct.

5. **Memory profiling:** Use Chrome DevTools Memory tab to compare heap allocations per frame with clarity enabled, before and after the change. Should see a significant reduction in `Uint8ClampedArray` allocations.

6. **Multiple sequential calls:** Call `applyClarity` multiple times in succession to verify buffers are correctly reused without data corruption between calls.

## Acceptance Criteria

- [ ] Worker clarity effect produces pixel-identical output to before
- [ ] Worker clarity effect produces same output as main-thread `EffectProcessor.applyClarity`
- [ ] No new `Uint8ClampedArray` allocation per frame during steady-state (same image dimensions)
- [ ] Midtone mask `Float32Array(256)` is allocated only once
- [ ] Buffers correctly reallocate when image dimensions change
- [ ] No data corruption when processing multiple frames sequentially
- [ ] All existing tests pass
