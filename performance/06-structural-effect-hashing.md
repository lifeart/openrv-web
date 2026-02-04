# 06 - Replace JSON.stringify-Based Hashing with Structural Equality

## Problem Description

Two hot paths use `JSON.stringify()` to detect whether effect state has changed:

1. **`CurveLUTCache.getLUTs()`** in `ColorCurves.ts` serializes the entire `ColorCurvesData` object to JSON on every call to check if curves have changed.
2. **`computeEffectsHash()`** in `EffectProcessor.ts` serializes the entire `AllEffectsState` object (9 nested sub-objects) to JSON, then runs a djb2 hash over the resulting string.

`JSON.stringify` is expensive because it allocates a large temporary string, traverses all nested objects recursively, and converts every number to its string representation. For the `AllEffectsState`, the serialized string can be several kilobytes. These are called on every frame, generating significant GC pressure from the temporary string allocations.

**Impact:** Two `JSON.stringify` calls per frame, producing multi-KB temporary strings that are immediately discarded after comparison/hashing.

## Current Code

### CurveLUTCache

**File:** `src/color/ColorCurves.ts`

#### CurveLUTCache.getLUTs (lines 212-231)

```typescript
export class CurveLUTCache {
  private cachedLUTs: CurveLUTs | null = null;
  private cachedCurvesJSON: string | null = null;

  /**
   * Get LUTs for the given curves, rebuilding only if curves changed
   */
  getLUTs(curves: ColorCurvesData): CurveLUTs {
    const curvesJSON = JSON.stringify(curves);        // <-- Expensive serialization every call

    if (this.cachedLUTs && this.cachedCurvesJSON === curvesJSON) {
      return this.cachedLUTs;
    }

    // Curves changed, rebuild LUTs
    this.cachedLUTs = buildAllCurveLUTs(curves);
    this.cachedCurvesJSON = curvesJSON;

    return this.cachedLUTs;
  }

  // ...
}
```

#### ColorCurvesData structure (lines 18-23)

```typescript
export interface ColorCurvesData {
  master: CurveChannel;  // Applied to all channels
  red: CurveChannel;
  green: CurveChannel;
  blue: CurveChannel;
}

export interface CurveChannel {
  points: CurvePoint[];
  enabled: boolean;
}

export interface CurvePoint {
  x: number;
  y: number;
}
```

### computeEffectsHash

**File:** `src/utils/EffectProcessor.ts`

#### computeEffectsHash (lines 85-107)

```typescript
export function computeEffectsHash(state: AllEffectsState): string {
  // Use a simple string representation for hashing
  const str = JSON.stringify({                        // <-- Expensive serialization every call
    ca: state.colorAdjustments,
    cdl: state.cdlValues,
    curves: state.curvesData,
    filter: state.filterSettings,
    channel: state.channelMode,
    wheels: state.colorWheelsState,
    hsl: state.hslQualifierState,
    tm: state.toneMappingState,
    inv: state.colorInversionEnabled,
  });

  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(36);
}
```

#### AllEffectsState (lines 53-63)

```typescript
export interface AllEffectsState {
  colorAdjustments: ColorAdjustments;
  cdlValues: CDLValues;
  curvesData: ColorCurvesData;
  filterSettings: FilterSettings;
  channelMode: ChannelMode;
  colorWheelsState: ColorWheelsState;
  hslQualifierState: HSLQualifierState;
  toneMappingState: ToneMappingState;
  colorInversionEnabled: boolean;
}
```

## Implementation Plan

### Part A: Fix CurveLUTCache with structural comparison

#### Step 1: Replace JSON comparison with direct property comparison

```typescript
export class CurveLUTCache {
  private cachedLUTs: CurveLUTs | null = null;
  private cachedCurves: ColorCurvesData | null = null;

  getLUTs(curves: ColorCurvesData): CurveLUTs {
    if (this.cachedLUTs && this.cachedCurves && curvesEqual(this.cachedCurves, curves)) {
      return this.cachedLUTs;
    }

    this.cachedLUTs = buildAllCurveLUTs(curves);
    // Deep-copy the curves for future comparison
    this.cachedCurves = deepCopyCurves(curves);
    return this.cachedLUTs;
  }

  clear(): void {
    this.cachedLUTs = null;
    this.cachedCurves = null;
  }
}
```

#### Step 2: Implement structural comparison for curves

```typescript
function curveChannelEqual(a: CurveChannel, b: CurveChannel): boolean {
  if (a.enabled !== b.enabled) return false;
  if (a.points.length !== b.points.length) return false;
  for (let i = 0; i < a.points.length; i++) {
    if (a.points[i]!.x !== b.points[i]!.x || a.points[i]!.y !== b.points[i]!.y) {
      return false;
    }
  }
  return true;
}

function curvesEqual(a: ColorCurvesData, b: ColorCurvesData): boolean {
  return (
    curveChannelEqual(a.master, b.master) &&
    curveChannelEqual(a.red, b.red) &&
    curveChannelEqual(a.green, b.green) &&
    curveChannelEqual(a.blue, b.blue)
  );
}

function deepCopyCurves(curves: ColorCurvesData): ColorCurvesData {
  return {
    master: { enabled: curves.master.enabled, points: curves.master.points.map(p => ({ x: p.x, y: p.y })) },
    red: { enabled: curves.red.enabled, points: curves.red.points.map(p => ({ x: p.x, y: p.y })) },
    green: { enabled: curves.green.enabled, points: curves.green.points.map(p => ({ x: p.x, y: p.y })) },
    blue: { enabled: curves.blue.enabled, points: curves.blue.points.map(p => ({ x: p.x, y: p.y })) },
  };
}
```

### Part B: Fix computeEffectsHash with incremental numeric hashing

#### Step 3: Replace JSON.stringify with direct numeric hashing

Instead of serializing to a string and then hashing the string, hash the numeric values directly using a fast numeric hash function:

```typescript
export function computeEffectsHash(state: AllEffectsState): string {
  let hash = 5381;

  // Hash helper for numbers
  const hashNum = (n: number): void => {
    // Convert to integer bits for consistent hashing
    // Multiply by a large prime to spread the bits, then combine
    const bits = (n * 1000000) | 0;  // Fixed-point to integer
    hash = ((hash << 5) + hash + bits) | 0;
  };

  // Hash helper for booleans
  const hashBool = (b: boolean): void => {
    hash = ((hash << 5) + hash + (b ? 1 : 0)) | 0;
  };

  // Hash helper for strings (channel mode, tone mapping operator, etc.)
  const hashStr = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
    }
  };

  // Color adjustments
  const ca = state.colorAdjustments;
  hashNum(ca.brightness);
  hashNum(ca.contrast);
  hashNum(ca.saturation);
  hashNum(ca.exposure);
  hashNum(ca.temperature);
  hashNum(ca.tint);
  hashNum(ca.highlights);
  hashNum(ca.shadows);
  hashNum(ca.whites);
  hashNum(ca.blacks);
  hashNum(ca.vibrance);
  hashNum(ca.clarity);
  hashNum(ca.hueRotation);

  // CDL values
  const cdl = state.cdlValues;
  hashNum(cdl.slope.r); hashNum(cdl.slope.g); hashNum(cdl.slope.b);
  hashNum(cdl.offset.r); hashNum(cdl.offset.g); hashNum(cdl.offset.b);
  hashNum(cdl.power.r); hashNum(cdl.power.g); hashNum(cdl.power.b);
  hashNum(cdl.saturation);

  // Curves - hash point counts and values
  const hashCurveChannel = (ch: CurveChannel): void => {
    hashBool(ch.enabled);
    hashNum(ch.points.length);
    for (const p of ch.points) {
      hashNum(p.x);
      hashNum(p.y);
    }
  };
  hashCurveChannel(state.curvesData.master);
  hashCurveChannel(state.curvesData.red);
  hashCurveChannel(state.curvesData.green);
  hashCurveChannel(state.curvesData.blue);

  // Filter settings
  hashNum(state.filterSettings.sharpenAmount);
  hashNum(state.filterSettings.sharpenRadius);
  hashNum(state.filterSettings.sharpenThreshold);

  // Channel mode
  hashStr(state.channelMode);

  // Color wheels
  const wheels = state.colorWheelsState;
  for (const wheel of [wheels.lift, wheels.gamma, wheels.gain, wheels.master] as const) {
    hashNum(wheel.r); hashNum(wheel.g); hashNum(wheel.b); hashNum(wheel.y);
  }

  // HSL qualifier
  const hsl = state.hslQualifierState;
  hashBool(hsl.enabled);
  hashNum(hsl.hue); hashNum(hsl.hueRange);
  hashNum(hsl.saturation); hashNum(hsl.saturationRange);
  hashNum(hsl.luminance); hashNum(hsl.luminanceRange);
  hashNum(hsl.softness);

  // Tone mapping
  const tm = state.toneMappingState;
  hashBool(tm.enabled);
  hashStr(tm.operator);
  hashNum(tm.exposure);
  hashNum(tm.whitePoint);

  // Color inversion
  hashBool(state.colorInversionEnabled);

  return (hash >>> 0).toString(36);
}
```

> **Note:** The exact properties to hash depend on the actual interface definitions. Before implementing, check each interface (`ColorAdjustments`, `CDLValues`, `FilterSettings`, `ColorWheelsState`, `HSLQualifierState`, `ToneMappingState`) to ensure all fields are covered. Add any missing fields.

#### Step 4: Import CurveChannel type if needed

The `computeEffectsHash` function may need to import `CurveChannel` from `ColorCurves.ts` to iterate over curve points.

## Testing Approach

1. **Cache correctness - CurveLUTCache:** Create curves data, call `getLUTs()` twice with the same data, verify the same LUT object is returned (cache hit). Modify one point, call again, verify a new LUT is returned.

2. **Cache correctness - computeEffectsHash:** Create two identical `AllEffectsState` objects and verify they produce the same hash. Change one property and verify the hash changes.

3. **Hash sensitivity:** Verify that small changes to individual properties (e.g., brightness 0.5 vs 0.501) produce different hash values.

4. **Hash consistency:** Verify the hash is deterministic (same input always produces same output).

5. **No string allocations:** Use the browser profiler to verify no large string allocations from `JSON.stringify` during render frames.

6. **Visual regression:** Enable all effects (CDL, curves, sharpen, color wheels, etc.) and verify the viewer output is unchanged. Specifically, verify that effect changes are detected and applied, and that unchanged effects are correctly cached.

7. **Edge cases:** Test with default state (all defaults should hash consistently), empty curves (no points), and extreme values.

## Acceptance Criteria

- [ ] `CurveLUTCache` uses structural comparison instead of `JSON.stringify`
- [ ] `computeEffectsHash` hashes numeric values directly instead of serializing to JSON
- [ ] No `JSON.stringify` calls in the render hot path for effect caching
- [ ] Cache hits work correctly when effects have not changed
- [ ] Cache misses work correctly when any effect property changes
- [ ] Small property changes produce different hash values (no false cache hits)
- [ ] All effect combinations render correctly
- [ ] All existing tests pass
