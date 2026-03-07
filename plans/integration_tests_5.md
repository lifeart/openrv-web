# Implementation Plan: Integration Tests for Under-Tested Core Files

## Summary of Current Coverage

| File | Lines | Existing Tests | Direct Test Count |
|------|-------|---------------|-------------------|
| **ColorSerializer.ts** | 1,048 | None | 0 |
| **AnnotationStore.ts** | 586 | None (SessionAnnotations.test.ts tests the wrapper) | 0 |
| **PlaybackEngine.ts** | 1,152 | `PlaybackEngine.setInOutRange.test.ts` (10 tests), indirect via Session tests | ~10 direct |
| **ViewerEffects.ts** | 606 | ToneMapping (63), HighlightsShadows (14), ToneMappingParams (5) | 82 (but 3 functions untested) |

---

## Priority Order

1. **ColorSerializer.ts** -- HIGHEST. Zero tests, 18 builder methods producing GTO objects. Bugs silently produce corrupt session files. Pure functions, easy to test.
2. **AnnotationStore.ts** -- HIGH. Zero tests, complex GTO parsing with coordinate transforms and tag-effect string parsing.
3. **PlaybackEngine.ts** -- MEDIUM. Has indirect coverage but major gaps: play/pause lifecycle, update loop, loop modes.
4. **ViewerEffects.ts** -- LOWER. 82 tests already, gaps only in `applyVibrance`, `applyClarity`, `applySharpenCPU`.

**Grand total: ~456 new test cases**

---

## Infrastructure Prerequisites

Add to `test/mocks.ts`:
- `createMockPlaybackEngineHost()` -- reusable mock for PlaybackEngine tests
- `createMockGTOComponentDTO()` -- mock with `.property(name).value()` chains for AnnotationStore

---

## File 1: ColorSerializer.ts (~143 tests)

**Location:** `src/core/session/serializers/ColorSerializer.test.ts`

**Pattern:** Follow `TransformSerializer.test.ts` -- same directory, ObjectDTO assertion pattern.

**Mocks needed:** None -- pure functions returning GTO `ObjectData`.

### Test Cases

```
describe('ColorSerializer')
  describe('buildColorExposureObject')            ~5 tests
    - default values (active=1, exposure=0.0)
    - custom exposure value
    - active=false sets active to 0
    - correct protocol 'RVColorExposure'

  describe('buildColorCurveObject')               ~5 tests
    - default values, custom contrast, active=false

  describe('buildColorTemperatureObject')         ~7 tests
    - default inWhitePrimary, temperatures, method
    - custom values

  describe('buildColorSaturationObject')          ~4 tests
  describe('buildColorVibranceObject')            ~4 tests
  describe('buildColorShadowObject')              ~4 tests
  describe('buildColorHighlightObject')           ~4 tests

  describe('buildColorGrayScaleObject')           ~4 tests
    - active defaults to 0 (uses ? 1 : 0, not !== false)
    - uses 'node' component (not 'color')

  describe('buildColorCDLObject')                 ~9 tests
    - default slope/offset/power/saturation
    - file property conditional
    - noClamp flag, colorspace

  describe('buildColorLinearToSRGBObject')        ~3 tests
  describe('buildColorSRGBToLinearObject')        ~3 tests
  describe('buildPrimaryConvertObject')           ~6 tests

  describe('buildOCIOObject')                     ~13 tests
    - minimal config, function, look, display
    - conditional components (inTransform, outTransform, config)

  describe('buildICCObject')                      ~8 tests
    - default samples, conditional profiles

  describe('buildLinearizeObject')                ~16 tests
    - node, color, cineon defaults/custom
    - LUT, CDL sub-components conditional

  describe('buildLookLUTObject')                  ~13 tests
    - protocol defaults, RVCacheLUT variant
    - inMatrix/outMatrix flattening

  describe('buildColorObject')                    ~19 tests
    - scalar-to-array conversion
    - CDL/luminanceLUT sub-components
    - outputMatrix: flat vs 2D array flattening

  describe('buildDisplayColorObject')             ~16 tests
    - channelOrder, gamma, boolean flags
    - chromaticities sub-component conditional
```

**Edge cases:** Empty `{}` input, `active: false` vs `active: undefined`, matrix flattening dimensions.

---

## File 2: AnnotationStore.ts (~126 tests)

**Location:** `src/core/session/AnnotationStore.test.ts`

**Pattern:** Follow `GTOSettingsParser.test.ts` for GTO mocking.

### Test Cases

```
describe('GTO value extraction helpers')
  describe('getNumberValue')                      ~8 tests
    - direct number, array, nested, undefined, empty

  describe('getBooleanValue')                     ~13 tests
    - true/false, number 0/1, string 'true'/'false'/'1'/'0'
    - array wrapping

  describe('getNumberArray')                      ~8 tests
  describe('getStringValue')                      ~5 tests
  describe('getStringArray')                      ~7 tests

describe('AnnotationStore')
  describe('construction and callbacks')          ~6 tests
  describe('setPaintEffects')                     ~5 tests

  describe('setMatteSettings')                    ~8 tests
    - default show=false, aspect=1.78, opacity=0.66
    - custom values override defaults
    - callbacks invoked

  describe('parsePaintTagEffects')                ~19 tests
    - JSON object, JSON array
    - key:value, key=value, semicolon/comma separated
    - empty/whitespace returns null
    - bare keywords "ghost"/"hold"
    - ghostBefore/ghostAfter rounded to integers

  describe('parsePenStroke')                      ~18 tests
    - user/id from strokeId
    - color defaults, width scaling, brush types
    - coordinate transforms: x = rawX/aspectRatio + 0.5, y = rawY + 0.5
    - nested vs flat point formats
    - line join/cap parsing, splat flag

  describe('parseTextAnnotation')                 ~16 tests
    - position unwrapping from deeply nested arrays
    - size scaling, defaults for font/rotation/spacing

  describe('parsePaintAnnotations')               ~13 tests (integration)
    - empty DTO, single/multiple strokes
    - mixed pen and text
    - paint/tag/annotation effects
    - callback invocation
```

---

## File 3: PlaybackEngine.ts (~127 tests)

**Location:** `src/core/session/PlaybackEngine.test.ts`

**Pattern:** Follow `PlaybackEngine.setInOutRange.test.ts` for `createMockHost()`.

**Mocks:** `vi.useFakeTimers()`, mock `performance.now()`.

### Test Cases

```
describe('PlaybackEngine')
  describe('frame & range accessors')             ~16 tests
    - currentFrame clamp, round, emit, sync video
    - fps clamp, frameIncrement, frameCount

  describe('playback speed')                      ~13 tests
    - clamp [0.1, 8], increaseSpeed/decreaseSpeed presets
    - resetSpeed, video playbackRate sync

  describe('play/pause lifecycle')                ~19 tests
    - play() sets isPlaying, emits, resets timing
    - play() with mediabunny/native video/HDR
    - pause() clears state, stops video
    - concurrent play() calls guarded

  describe('play direction')                      ~9 tests
    - toggle, audio sync for forward/reverse

  describe('frame navigation')                    ~9 tests
    - stepForward/Backward, goToFrame/Start/End

  describe('in/out points')                       ~11 tests
    - setInPoint/OutPoint clamp, emit, adjust currentFrame

  describe('loop modes')                          ~11 tests
    - loop wrap, once pause, pingpong reverse

  describe('playback mode transitions')           ~13 tests
    - realtime <-> playAllFrames transitions
    - audio enable/disable

  describe('advanceFrame')                        ~11 tests
    - direction, FPS tracking, boundary behaviors

  describe('interpolation')                       ~6 tests
  describe('effectiveFps / droppedFrameCount')    ~5 tests
  describe('dispose')                             ~4 tests
```

**Edge cases:** Concurrent `play()` calls, HDR buffering gate, play-all-frames 60s timeout, 1-based frame boundaries.

---

## File 4: ViewerEffects.ts (~60 tests)

**Location:** Split into 3 files following existing pattern:
- `src/ui/components/ViewerEffects.Vibrance.test.ts`
- `src/ui/components/ViewerEffects.Clarity.test.ts`
- `src/ui/components/ViewerEffects.Sharpen.test.ts`

**Mocks:** None -- pure pixel processing functions.

### Test Cases

```
describe('applyVibrance')                         ~25 tests
  - vibrance=0 unchanged, positive/negative effects
  - skin protection (hue 20-50, low saturation, mid luminance)
  - edge cases: black, white, max/min vibrance

describe('applyClarity')                          ~20 tests
  - clarity=0 unchanged, positive/negative
  - midtone targeting (dark/bright pixels minimal effect)
  - Gaussian blur correctness, edge clamping
  - edge cases: 1x1, 3x3 images

describe('applySharpenCPU')                       ~15 tests
  - amount=0 unchanged, kernel correctness
  - border pixels unchanged
  - value clamping [0, 255]
  - edge cases: 3x3 minimum, 2x2 all-border
```

---

## Implementation Sequence

| Phase | File | Tests | Effort |
|-------|------|-------|--------|
| 1 (infra) | `test/mocks.ts` additions | - | Small |
| 2 | ColorSerializer.test.ts | ~143 | Medium |
| 3 | AnnotationStore.test.ts | ~126 | Medium |
| 4 | PlaybackEngine.test.ts | ~127 | Large |
| 5 | ViewerEffects.*.test.ts | ~60 | Small |
| **Total** | | **~456** | |

---

## Critical Files

- `src/core/session/serializers/ColorSerializer.ts` -- Zero tests, highest risk for data corruption
- `src/core/session/AnnotationStore.ts` -- Zero tests, complex parsing
- `src/core/session/PlaybackEngine.ts` -- 10 direct tests for 1,152 lines
- `src/ui/components/ViewerEffects.ts` -- 3 exported functions untested
- `test/mocks.ts` -- Needs new helpers for PlaybackEngineHost and GTOComponentDTO
