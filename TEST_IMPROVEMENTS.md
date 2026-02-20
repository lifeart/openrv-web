# Test Suite Quality Audit & Improvement Plan

## Executive Summary

**513 test files audited** across 12 expert agent runs analyzing the entire codebase.
**Overall test quality is excellent** -- the vast majority of 7600+ tests exercise real production code with meaningful assertions.

**~156 useless or noop tests identified** concentrated in **20 files** (3.9% of all test files).
These tests mock instead of testing real logic, use tautological assertions, or exercise zero production code.

---

## Findings by Priority

### P0 -- Critical (tests provide zero real coverage)

#### 1. `src/formats/HEICWasmDecoder.test.ts` -- ~15 useless tests (ALL)

**Anti-pattern:** Every test mocks the entire `libheif-js` module via `vi.doMock`. The mock controls width, height, and pixel values. Tests verify that mock values pass through unchanged.

**Example:**
```ts
// Mock says width=4, test asserts width===4. Tests nothing real.
vi.doMock('libheif-js', () => ({
  HeifDecoder: vi.fn().mockImplementation(() => ({
    decode: vi.fn().mockReturnValue([{ get_width: () => 4, get_height: () => 3, ... }]),
  })),
}));
const result = await decodeHEICToImageData(new ArrayBuffer(16));
expect(result.width).toBe(4); // just reads back the mock value
```

**Affected tests:** All ~15 tests including "should decode to correct width and height", "should return Uint8ClampedArray data", "should return correct RGBA pixel values", "should handle decode failure", etc.

**Fix:** Rewrite with real binary buffer tests (similar to `HEICGainmapDecoder.test.ts` which builds real HEIC box structures). If libheif-js can't run in Node, keep a thin mock test for glue layer but add integration tests with real HEIC fixtures.

---

#### 2. `src/workers/effectProcessor.worker.test.ts` -- 13 of 15 useless tests

**Anti-pattern:** Tests declare local constants and local function copies, then assert against themselves. Never imports the worker's actual implementations.

**Example:**
```ts
// Declares local constant, asserts it equals itself
const HIGHLIGHT_SHADOW_RANGE = 128;
expect(HIGHLIGHT_SHADOW_RANGE).toBe(128);

// Defines local smoothstep, tests the local copy instead of the worker's
function smoothstep(edge0, edge1, x) { ... }
expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
```

**Affected tests:** EPW-002 through EPW-013, EPW-015 (message structures, constants, smoothstep, bellCurve, rgbToHsl, hslToRgb).

**Fix:** Import the worker's exported `__test__` object (like `effectProcessor.worker.buffers.test.ts` does correctly) and test the real implementations. Delete the local function copies.

---

#### 3. `src/AppWiringFixes.test.ts` -- 9 of 19 useless tests

**Anti-pattern:** Tests copy-paste handler logic from `App.ts` into the test body, execute the copy, and assert the mock was called. If the real `App.ts` code diverges, these tests still pass.

**Example:**
```ts
// Copy-pasted production logic inline in the test
const handler = (data) => {
  if (!audioInitialized) return;
  if (source.type !== 'video') return;
  audioMixer.loadTrack(source.audioUrl);
};
handler(testData);
expect(audioMixer.loadTrack).toHaveBeenCalled(); // tests the copy, not the real code
```

**Affected tests:** DCCFIX-001 through DCCFIX-007, DCCFIX-020 through DCCFIX-023.

**Fix:** Import and test the real wiring functions (like `AppColorWiring.test.ts` does correctly). Use the actual `App` initialization path instead of replicating logic inline.

---

### P1 -- High (mock passthrough / weak assertions)

#### 4. `src/color/OCIOProcessor.wasm.test.ts` -- ~15 useless tests

**Anti-pattern:** All tests use `createMockExports()` mocking every WASM function. Tests verify mock values flow through unchanged.

**Example:** Mock `ocioApplyRGB` returns `[0.25, 0.50, 0.75]`, test asserts result equals `[0.25, 0.50, 0.75]`. No actual color transform tested.

**Fix:** Keep basic dispatch tests (WASM can't run in jsdom). Add property-based tests for the JS fallback mode with known color space conversions.

---

#### 5. `src/color/wasm/OCIOWasmModule.test.ts` -- ~8 of 30 useless tests

**Anti-pattern:** Config query tests verify `JSON.parse` of hardcoded mock strings.

**Example:** Mock returns `'["sRGB","Rec.709"]'`, test asserts `displays === ['sRGB', 'Rec.709']`. Tests `JSON.parse`, not OCIO.

**Useful tests to keep:** WASM-001 through WASM-009 (lifecycle/state machine), WASM-CONC-001 through WASM-CONC-003 (concurrent init).

**Fix:** Remove config-query passthrough tests. Keep lifecycle and concurrency tests.

---

#### 6. `src/color/wasm/OCIOWasmBridge.test.ts` -- ~8 of 25 useless tests

**Anti-pattern:** Same `createMockExports()` pattern as OCIOWasmModule.

**Useful tests to keep:** BRG-001 through BRG-006 (bridge lifecycle), event emission tests.

**Fix:** Remove mock-value passthrough tests. Keep orchestration and event tests.

---

#### 7. `src/color/wasm/OCIOWasmPipeline.test.ts` -- ~8 of 30 useless tests

**Anti-pattern:** Same mock pattern. Color transform / LUT generation tests just verify mock return values.

**Useful tests to keep:** Caching logic tests, event dispatch tests.

**Fix:** Remove transform passthrough tests. Keep caching and event logic.

---

#### 8. `src/render/Renderer.test.ts` -- ~15 tests with weak assertions

**Anti-pattern:** Tests claim to verify shader uniforms but only assert `result instanceof HTMLCanvasElement` or that `mockGL.uniform1i` was called at all (without checking which uniform or which value).

**Example:**
```ts
// Claims to verify "sets inputTransfer to 0 (sRGB)" but never checks the value
renderer.renderSDRFrame(image, adjustments);
expect(mockGL.uniform1i).toHaveBeenCalled(); // any uniform1i call passes
```

**Affected tests:** REN-SDR-003, REN-SDR-004, REN-SDR-005, REN-SDR-012, REN-SDR-013, REN-SDR-014, REN-1B-001 through REN-1B-012, REN-EXT-007, REN-EXT-008.

**Fix:** Assert against specific uniform names and values using the mock GL's recorded calls. E.g., verify `uniform1i` was called with the `u_inputTransfer` location and value `0`.

---

#### 9. `src/render/RenderState.test.ts` -- ~17 tests on local reimplementation

**Anti-pattern:** The `applyRenderState dispatch` test group defines its own `applyRenderState` function (lines 99-120) instead of importing the real one. All 17 dispatch tests verify this local copy.

**Fix:** Import and test the actual `Renderer.applyRenderState` method.

---

### P2 -- Medium (tautological / structure-only)

#### 10-12. Gainmap "structure" and "math" tests -- 17 useless tests across 3 files

- `src/formats/JPEGGainmapDecoder.test.ts` (5 tests, lines 160-231)
- `src/formats/AVIFGainmapDecoder.test.ts` (5 tests, lines 1017-1078)
- `src/formats/HEICGainmapDecoder.test.ts` (7 tests, lines 1211-1316)

**Anti-pattern:** Copy-pasted across all three files. Create local objects and check `toBeDefined()` on hardcoded values. "HDR reconstruction math" tests compute `Math.pow()` locally without calling any production code.

**Example:**
```ts
// Creates local object, checks its own hardcoded fields are defined
const info: GainmapInfo = { baseImageOffset: 0, headroom: 4.0, ... };
expect(info.headroom).toBeDefined(); // can never fail

// Tests Math.pow, not production code
const gain = Math.pow(2, 0.5 * 4.0);
expect(gain).toBe(4.0);
```

**Fix:** Delete structure tests (TypeScript types guarantee this). Move math tests to shared file that imports and tests the actual reconstruction function.

---

#### 13. `src/color/DisplayCapabilities.test.ts` -- 13 useless tests

**Anti-pattern:** Tests DC-008 through DC-019c check `typeof caps.field === 'boolean'` on a fully-typed object. TypeScript already guarantees this.

**Fix:** Delete these 13 tests. The detection logic tests (DC-020+) that mock `matchMedia` and WebGL contexts are valuable and should stay.

---

#### 14. `src/nodes/sources/FileSourceNode.test.ts` -- 5 tautological tests

**Anti-pattern:** Tests FSN-GM-001, FSN-GM-002, FSN-AVIF-GM-002, FSN-AVIF-GM-004 construct `IPImage` with hardcoded metadata then assert those same values back.

**Fix:** Test the actual gainmap loading path instead of IPImage constructor passthrough.

---

#### 15. `src/network/NetworkSyncManager.test.ts` -- 5 noop tests

**Anti-pattern:** Tests NSM-021, NSM-025, NSM-032, NSM-042, NSM-024 only assert `not.toThrow()` without verifying any messages were actually sent or suppressed.

**Fix:** Add spies on the send mechanism and verify message content.

---

### P3 -- Low (minor / placeholders)

#### 16. `src/utils/media/MediabunnyFrameExtractor.test.ts` -- 3 noop tests

**Anti-pattern:** MFE-FPS-002, -003, -004 only check `typeof method === 'function'`.

**Fix:** Test real behavior or delete if redundant.

---

#### 17. `src/AppNetworkBridge.test.ts` -- 2 trivial tests

**Anti-pattern:** ANB-001 and ANB-010 only verify `instanceof` and `not.toThrow()`, already covered by every other test.

**Fix:** Delete or merge into first behavioral test.

---

#### 18. `src/nodes/sources/VideoSourceNode.test.ts` -- 1 placeholder test

**Anti-pattern:** VSN-008 is a no-op placeholder claiming to check config values.

**Fix:** Implement the actual check or delete.

---

#### 19. E2E tests -- ~30 weak tests across 8 files

| File | Issues |
|------|--------|
| `e2e/state-verification.spec.ts` | 6 noop/tautological tests (`expect(typeof x).toBe('boolean')`, `expect(true).toBe(true)`, missing assertions) |
| `e2e/playback-edge-cases.spec.ts` | Screenshots captured then `void`-ed; constant tested in e2e context |
| `e2e/timeline-thumbnails.spec.ts` | 5 tests with only visibility checks, no behavioral assertions |
| `e2e/hdr-format-loading.spec.ts` | Empty skip-only tests; "missing file" test never loads a file |
| `e2e/ghost-frames.spec.ts` | `toBeDefined()` on screenshots that can never be undefined |
| `e2e/user-flows.spec.ts` | 2 noop tests with zero assertions |
| `e2e/parade-scope.spec.ts` | `toBeDefined()` on screenshot buffer |
| `e2e/ab-compare.spec.ts` | `screenshot.length > 0` assertions (always true) |

**Fix:** Add real assertions (screenshot comparison, state verification) or delete the tests.

---

## Summary Table

| Priority | File | Useless | Total | Issue |
|----------|------|---------|-------|-------|
| P0 | `formats/HEICWasmDecoder.test.ts` | ~15 | ~15 | Mock-only, zero real decoding |
| P0 | `workers/effectProcessor.worker.test.ts` | 13 | 15 | Tautological, local copies |
| P0 | `AppWiringFixes.test.ts` | 9 | 19 | Copy-pasted production logic |
| P1 | `color/OCIOProcessor.wasm.test.ts` | ~15 | ~23 | Mock passthrough |
| P1 | `color/wasm/OCIOWasmModule.test.ts` | ~8 | ~30 | Tests JSON.parse |
| P1 | `color/wasm/OCIOWasmBridge.test.ts` | ~8 | ~25 | Mock passthrough |
| P1 | `color/wasm/OCIOWasmPipeline.test.ts` | ~8 | ~30 | Mock passthrough |
| P1 | `render/Renderer.test.ts` | ~15 | ~50 | Weak uniform assertions |
| P1 | `render/RenderState.test.ts` | ~17 | ~20 | Tests local reimplementation |
| P2 | `formats/JPEGGainmapDecoder.test.ts` | 5 | ~80 | Tautological structure/math |
| P2 | `formats/AVIFGainmapDecoder.test.ts` | 5 | ~90 | Tautological structure/math |
| P2 | `formats/HEICGainmapDecoder.test.ts` | 7 | ~100 | Tautological structure/math |
| P2 | `color/DisplayCapabilities.test.ts` | 13 | ~50 | typeof checks can't fail |
| P2 | `nodes/sources/FileSourceNode.test.ts` | 5 | ~80 | Tautological IPImage |
| P2 | `network/NetworkSyncManager.test.ts` | 5 | ~30 | Only assert not.toThrow |
| P3 | `utils/media/MediabunnyFrameExtractor.test.ts` | 3 | ~40 | typeof === 'function' |
| P3 | `AppNetworkBridge.test.ts` | 2 | ~20 | Trivial instanceof |
| P3 | `nodes/sources/VideoSourceNode.test.ts` | 1 | ~30 | Placeholder test |
| P3 | E2E files (8 files) | ~30 | ~800 | Noop assertions |
| | **TOTAL** | **~156** | **7600+** | |

---

## What's Working Well

**493 out of 513 test files (96.1%) are clean** with excellent test quality:

- **`src/core/`** (all 34 files) -- Excellent. Real graph operations, pixel manipulation, session management, GTO parsing, keyframe interpolation.
- **`src/ui/components/`** (all 125 files audited) -- All instantiate real classes with meaningful DOM and state assertions.
- **`src/color/`** (most files) -- TransferFunctions, CDL, LUTLoader, ICCProfile, OCIOShaderTranslator, OCIOVirtualFS all test real math/parsing.
- **`src/formats/`** (most files) -- EXR, DPX, Cineon, TIFF, HDR, MXF, RAW all build real binary data and test real parsing.
- **`src/filters/`** -- StabilizeMotion tests build real textured frames and verify motion detection with pixel-level assertions.
- **`src/stereo/`** -- StereoEyeTransform, StereoAlignOverlay test real pixel transforms.
- **`src/export/MP4Muxer.test.ts`** -- Parses actual ISO BMFF boxes from real binary output.

---

## Recommended Fix Order

1. **P0: HEICWasmDecoder** -- Highest risk (no real decoder coverage at all)
2. **P0: effectProcessor.worker** -- Quick win (pattern exists in adjacent `*.buffers.test.ts`)
3. **P0: AppWiringFixes** -- Use real wiring functions (9 tests testing copied code)
4. **P1: OCIO WASM tests (4 files)** -- Remove passthrough, keep lifecycle/state machine
5. **P1: Renderer.test.ts** -- Strengthen uniform assertions
6. **P1: RenderState.test.ts** -- Import real applyRenderState
7. **P2: Gainmap structure/math (3 files)** -- Delete tautological tests
8. **P2: DisplayCapabilities** -- Delete typeof checks
9. **P2: FileSourceNode, NetworkSyncManager** -- Fix tautological/noop tests
10. **P3: Minor issues** -- MediabunnyFrameExtractor, AppNetworkBridge, VideoSourceNode, E2E tests
