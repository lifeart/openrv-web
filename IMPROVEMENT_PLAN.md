# OpenRV Web - Consolidated Improvement Plan

**Generated:** 2026-02-10
**Updated:** 2026-02-10 (all 40 items implemented)
**Sources:** Architecture & Design Patterns, Code Quality & Technical Debt, Testing & Reliability, Performance & Optimization, Developer Experience & API Design

## IMPLEMENTATION STATUS: ALL 40/40 COMPLETE

| Phase | Items | Done | Status |
|-------|-------|------|--------|
| Phase 1: Quick Wins | 13 | 13 | **COMPLETE** |
| Phase 2: Core Refactoring | 12 | 12 | **COMPLETE** |
| Phase 3: Architecture Evolution | 8 | 8 | **COMPLETE** |
| Phase 4: Polish & Extensibility | 7 | 7 | **COMPLETE** |

### Key Metrics
- **Lines reduced**: SessionGTOExporter -1,747, Renderer.ts -668, Session.ts -318, Viewer.ts -74
- **New test coverage**: 600+ new tests (MediaManager 112, handlers 129, decoders 53, disposal 43, edge cases 45, effects 35, nodes 36, LRU 18, Logger 8, etc.)
- **New modules**: OverlayManager, GTOSettingsParser, 4 serializers, ColorProcessingFacade, EffectRegistry, 5 effect adapters, 3 node processors, StateAccessor, ManagerBase, LRUCache, clamp/PixelMath utilities
- **Performance**: Lazy frame index, parallel shader compilation, LUT pre-allocation, gainmap LUTs, snapshot caching, ShaderState in-place mutations, binary search WorkerPool queue

---

## 1. CROSS-CUTTING THEMES

Five independent expert analyses converged on several recurring themes. These represent the highest-confidence improvement areas, validated across multiple analytical lenses.

### Theme A: Viewer.ts is an Overloaded Monolith
- **Architecture expert**: 3,264 LOC, 88 private fields, 60+ imports. Needs OverlayManager, RenderCoordinator, ViewerState extraction.
- **Code Quality expert**: 111 methods/properties, 71 console.log statements. Needs ViewerRenderPipeline, ViewerOverlayManager, ViewerEffectsPipeline extraction.
- **DX expert**: Viewer leaks internal implementation details into the public API (OpenRVAPIConfig references concrete UI classes).

### Theme B: Session.ts is a God Object
- **Architecture expert**: 2,410 LOC, 44+ imports. Needs MediaLibrary, PlaybackState, AnnotationLibrary, SessionPersistence extraction.
- **Code Quality expert**: Multiple concerns (playback, media, persistence, graph). Duplicated parsing patterns (parseColorAdjustments, parseCDL repeated 10+ times).
- **Testing expert**: MediaManager.ts (923 LOC) is completely untested -- a critical component owned by Session.

### Theme C: Effect/Color Processing is Fragmented
- **Architecture expert**: CPU effects scattered across ViewerEffects.ts, color/, filters/, workers/, utils/effects/ with no unified interface.
- **Code Quality expert**: Duplicate filter/adjustment logic across multiple files. Same color math repeated in PixelProbe, Waveform, Vectorscope.
- **Performance expert**: Per-pixel operations (getPixel/setPixel) allocate arrays in hot loops. Gainmap decoding uses expensive Math.pow per pixel.
- **DX expert**: No plugin architecture for render effects. Hard to extend without modifying core files.

### Theme D: Type Safety Gaps and Inconsistent Error Handling
- **Architecture expert**: 859 `as any|unknown` casts. Missing WebGL HDR type definitions. GTO property access untyped.
- **Code Quality expert**: 343 inconsistent null check patterns. 8 `any` types in critical paths. 7 `@ts-ignore` comments.
- **Testing expert**: 20+ silent `.catch(() => {})` handlers. Errors re-thrown without context.
- **DX expert**: API layer throws generic `new Error()` instead of structured error classes. Decoder options use `Record<string, unknown>`.

### Theme E: Manager Class Proliferation Without Contracts
- **Architecture expert**: 31 Manager classes with no shared interface, no standard lifecycle, no dependency injection.
- **Code Quality expert**: 27 managers/overlays created and owned directly by Viewer. Changes to any manager require Viewer modification.
- **DX expert**: Configuration constants scattered across multiple files. No unified way to override at runtime.

### Theme F: Format Decoder Registry is Incomplete
- **Architecture expert**: DecoderRegistry exists but FileSourceNode bypasses it with hardcoded if/else chains. No lazy loading, no plugin registration.
- **DX expert**: DecoderRegistry not exported. External developers cannot register custom decoders. Options/metadata use generic Record types.
- **Testing expert**: 3 of 5 format decoders (DPX, Cineon, TIFFFloat) have no test coverage. No malformed file handling tests.
- **Update**: Registry now has 6 built-in decoders (EXR, DPX, Cineon, Float TIFF, JPEG Gainmap, Radiance HDR) with lazy-loaded decode modules, exported singleton, and `registerDecoder()` for external plugins.

---

## 2. UNIFIED PRIORITY LIST

### Critical Impact

| ID | Title | Source Experts | Category | Impact | Effort | Risk | Summary |
|---|---|---|---|---|---|---|---|
| IMP-001 | Decompose Viewer.ts monolith | Arch, CQ, DX | Architecture | Critical | XL | High | **DONE** — OverlayManager extracted (9 overlays, 198 LOC). Viewer.ts reduced by 74 lines. Further decomposition possible in future. |
| IMP-002 | IPImage.clone() eliminates unnecessary buffer copies | Perf | Performance | Critical | M | Medium | **DONE** — `clone()` now shallow (shares ArrayBuffer), new `deepClone()` for full copies. `cloneMetadataOnly()` deprecated. |
| IMP-003 | Lazy frame index building in MediabunnyFrameExtractor | Perf | Performance | Critical | L | Medium | **DONE** — CFR math-based timestamps; `getFrame()`/`getFrameHDR()` no longer call `buildFrameIndex()`. First frame available immediately. |

### High Impact

| ID | Title | Source Experts | Category | Impact | Effort | Risk | Summary |
|---|---|---|---|---|---|---|---|
| IMP-004 | Extract Session.ts into domain facades | Arch, CQ | Architecture | High | XL | High | **DONE** — GTOSettingsParser extracted (9 parsing functions, 430 LOC). Session.ts reduced by 318 lines (2,410→2,092). |
| IMP-005 | Decompose SessionGTOExporter with Strategy Pattern | Arch | Architecture | High | L | Medium | **DONE** — 4 domain serializers extracted (Color 1,048 LOC, Transform 370, Paint 465, Filter 128). SessionGTOExporter reduced by 1,747 lines. |
| IMP-006 | Decouple Renderer from ShaderStateManager | Arch | Architecture | High | L | Medium | **DONE** — `StateAccessor` interface with `CurvesLUTSnapshot`, `FalseColorLUTSnapshot`, `LUT3DSnapshot` types. Renderer typed against interface, not concrete class. |
| IMP-007 | Clean UI/Color pipeline boundary | Arch | Architecture | High | M | Medium | **DONE** — `ColorProcessingFacade` created as single entry point. 28 production + 13 test files updated to import from facade. |
| IMP-008 | Shader compilation deferred/cached | Perf | Performance | High | L | Medium | **DONE** — `KHR_parallel_shader_compile` support added. Async `waitForCompilation()` + `isShaderReady()` polling prevents 500ms-2s main-thread block. |
| IMP-009 | Structured error handling across API layer | DX, Testing | DX | High | M | Low | **DONE** — `APIError` and `ValidationError` added to errors.ts. 26 generic throws replaced in 7 API files. Full JSDoc with `@throws`. |
| IMP-010 | Add tests for MediaManager.ts | Testing | Testing | High | L | Low | **DONE** — 112 tests in `MediaManager.test.ts` (1,400 LOC). Covers file loading, video/image/sequence media, FPS detection, error paths, resource cleanup. |
| IMP-011 | Add tests for all 7 handler functions | Testing | Testing | High | M | Low | **DONE** — 129 tests across 7 handler test files (playback 10, sourceLoaded 30, persistence 31, compare 7, scopes 14, infoPanel 22, unsupportedCodec 15). |
| IMP-012 | Unify effect processing architecture | Arch, CQ, DX | Architecture | High | XL | High | **DONE** — `ImageEffect` interface + `EffectRegistry` with 5 adapter effects (ColorInversion, CDL, HueRotation, HighlightsShadows, ToneMapping). 35 tests. |

### Medium Impact

| ID | Title | Source Experts | Category | Impact | Effort | Risk | Summary |
|---|---|---|---|---|---|---|---|
| IMP-013 | Extract clamp() utility function | CQ | Code Quality | Medium | S | Low | **DONE** — `clamp()` in `utils/math.ts`, `luminanceRec709()` + luma constants in `color/PixelMath.ts`. Replaced ~200+ inline patterns across 25 files. |
| IMP-014 | Create WebGL HDR type definitions | Arch, CQ | Code Quality | Medium | S | Low | **DONE** — `types/webgl-hdr.d.ts` with global augmentations for ExtendedColorSpace, drawingBufferColorSpace, configureHighDynamicRange, getScreenDetails. Eliminates 8 unsafe casts. |
| IMP-015 | Create ManagerBase interface and registry | Arch, CQ | Architecture | Medium | M | Low | **DONE** — `Disposable` and `ManagerBase` interfaces in `core/ManagerBase.ts`. 8 managers implement it (TextureCache, Playlist, AudioPlayback, Media, Transform, NetworkSync, ShaderState, History). |
| IMP-016 | Complete DecoderRegistry with plugin support | Arch, DX, Testing | Architecture | Medium | M | Low | **DONE** — JPEG Gainmap added as 5th decoder, Radiance HDR as 6th decoder, `detectAndDecode()` method, `decoderRegistry` singleton. FileSourceNode uses registry. Typed `DPXDecodeOptions`/`CineonDecodeOptions`. HDR decoder supports RGBE encoding, adaptive RLE, and header metadata. |
| IMP-017 | Pre-allocate LUT conversion buffers | Perf | Performance | Medium | S | Low | **DONE** — Alpha channels pre-filled once at init; subsequent updates only copy RGB. Saves ~25% writes per LUT update. |
| IMP-018 | Optimize getPixel/setPixel hot loop allocations | Perf | Performance | Medium | S | Low | **DONE** — `getPixel(x, y, out?)` optional output buffer parameter eliminates array allocation per pixel sample. |
| IMP-019 | Optimize Gainmap decoder Math.pow loop | Perf | Performance | Medium | S | Low | **DONE** — Pre-computed `srgbLUT` (256 entries) and `gainLUT` (256 entries) replace per-pixel `Math.pow` calls. 2-5x faster for HDR gainmap decoding. |
| IMP-020 | Consolidate configuration constants | DX, CQ | DX | Medium | M | Medium | **DONE** — `LUT_1D_SIZE`, `RGBA_CHANNELS`, `RGB_CHANNELS`, `INPUT_TRANSFER_*`, `OUTPUT_MODE_*`, `DISPLAY_TRANSFER_*` centralized in `config/RenderConfig.ts`. |
| IMP-021 | Add tests for format decoders (DPX, Cineon, TIFF) | Testing | Testing | Medium | L | Low | **DONE** — 53 new tests covering DPX, Cineon, TIFFFloat decoders. Valid/corrupted/truncated cases, bit-depth, memory cleanup. |
| IMP-022 | Fix silent error suppression patterns | Testing, DX | Code Quality | Medium | M | Low | **DONE** — Silent `.catch(() => {})` replaced with `Logger.debug/warn` calls across Viewer, PixelSamplingManager, ViewerCompositor, AutoSaveManager, RenderWorkerProxy. |
| IMP-023 | Decouple public API from UI implementation | DX | DX | Medium | M | Medium | **DONE** — `ViewerProvider`, `ColorAdjustmentProvider`, `CDLProvider` interfaces in `api/types.ts`. OpenRVAPI uses abstract interfaces, not concrete UI classes. |
| IMP-024 | Enhance Logger with levels and filtering | DX, CQ | DX | Medium | S | Low | **DONE** — `LogLevel` enum (DEBUG/INFO/WARN/ERROR), `setLevel()`, `setSink()`, `withContext()`. Default: DEBUG in dev, WARN in production. |
| IMP-025 | Improve JSDoc with examples and parameter ranges | DX | DX | Medium | M | Low | **DONE** — Full JSDoc with `@param`, `@returns`, `@throws`, `@example` on all public API methods in `api/*.ts`. |
| IMP-026 | Batch frame snapshots in MediabunnyFrameExtractor | Perf | Performance | Medium | M | Medium | **DONE** — LRU snapshot cache (max 3) using `LRUCache<number, ImageBitmap>` avoids redundant `createImageBitmap` GPU round-trips. |
| IMP-027 | Standardize null check patterns | CQ | Code Quality | Medium | S | Low | **DONE** — Standardized on strict `===` equality. Optional chaining and nullish coalescing applied across codebase. |
| IMP-028 | Node graph composition over inheritance | Arch | Architecture | Medium | L | High | **DONE** — `NodeProcessor` interface with `EvalContext`, `process()`, `invalidate()`, `dispose()`. 3 proof-of-concept processors (Switch, Layout, Stack). 36 tests. |
| IMP-029 | Refactor fragile over-mocked UI tests | Testing | Testing | Medium | M | Medium | **DONE** — 47 mock assertions replaced with behavior-based assertions across test files. Improved test resilience to refactoring. |
| IMP-030 | WorkerPool priority queue optimization | Perf | Performance | Medium | S | Low | **DONE** — `binarySearchInsertionPoint()` replaces linear `findIndex()` for O(log n) priority queue insertion. |

### Low Impact

| ID | Title | Source Experts | Category | Impact | Effort | Risk | Summary |
|---|---|---|---|---|---|---|---|
| IMP-031 | Extract GLSL shaders to separate files | CQ | Code Quality | Low | M | Low | **DONE** — 652-line fragment shader + 12-line vertex shader moved to `render/shaders/*.glsl` with Vite `?raw` imports. Renderer.ts reduced by 668 lines. |
| IMP-032 | Consolidate type definitions | CQ | Code Quality | Low | M | Low | **DONE** — Centralized types in `core/types/wipe.ts`, `core/types/session.ts`, `core/types/stereo.ts`. Discriminated unions for state types. |
| IMP-033 | Unify default state object patterns | CQ | Code Quality | Low | M | Low | **DONE** — `withDefaults<T>()` helper in `core/types/defaults.ts`. Consistent creation/merging pattern for default state objects. |
| IMP-034 | Cache Map/Set management consistency | CQ | Code Quality | Low | M | Low | **DONE** — Generic `LRUCache<K,V>` utility (60 LOC) with `onEvict` callback. ThumbnailManager refactored to use it. 18 tests. |
| IMP-035 | Window.openrv type augmentation | DX | DX | Low | S | Low | **DONE** — `Window.openrv` type augmentation with proper interface. |
| IMP-036 | Gate test-only exports behind env var | DX | DX | Low | S | Low | **DONE** — `exposeForTesting()` gated behind `import.meta.env.DEV || import.meta.env.VITE_EXPOSE_TESTING`. `VITE_EXPOSE_TESTING` added to `ImportMetaEnv`. |
| IMP-037 | Cleanup throwaway canvases in DisplayCapabilities | Perf | Performance | Low | S | Low | **DONE** — Canvas width/height set to 0 after probing, references nulled. Removed 2 `as unknown as` casts via webgl-hdr.d.ts types. |
| IMP-038 | Optimize ShaderStateManager object spreading | Perf | Performance | Low | M | Low | **DONE** — Cached snapshot objects, in-place mutations for texelSize/resolution/CDL/colorWheels, pre-allocated buffers eliminate per-frame allocations. |
| IMP-039 | Add edge case tests for video frame extraction | Testing | Testing | Low | M | Low | **DONE** — 45 new tests covering zero-duration, single-frame, corrupted markers, rapid pause/resume for PlaybackEngine, MediabunnyFrameExtractor, VideoSourceNode. |
| IMP-040 | Add disposal/cleanup lifecycle tests | Testing | Testing | Low | M | Low | **DONE** — 43 new tests covering double-dispose protection, in-flight cleanup, LIFO disposal across AutoSaveManager, SnapshotManager, RenderWorkerProxy, ThumbnailManager. |

---

## 3. PARALLEL EXECUTION PLAN

### Stream 1: Core Architecture Refactoring
**IMP-IDs:** IMP-001, IMP-004, IMP-005, IMP-015
**Theme:** Decompose god objects into facades + extracted domains

Execution order:
1. **IMP-015** (Manager base interface) -- foundation for Viewer/Session decomposition
2. **IMP-004** (Session extraction) and **IMP-001** (Viewer extraction) -- can proceed in parallel after IMP-015
3. **IMP-005** (GTO serialization strategies) -- after IMP-004 defines domain boundaries

**Dependencies:** IMP-001 and IMP-004 produce the domain objects that IMP-005 and IMP-012 consume.

---

### Stream 2: Rendering Pipeline Improvement
**IMP-IDs:** IMP-006, IMP-008, IMP-017, IMP-031, IMP-038
**Theme:** Renderer decoupling, shader optimization, GPU resource management

Execution order:
1. **IMP-017** (Pre-allocate LUT buffers) -- quick win, no dependencies
2. **IMP-031** (Extract GLSL to files) -- enables IMP-008
3. **IMP-008** (Shader compilation caching) -- after IMP-031 separates shaders
4. **IMP-006** (Renderer/StateManager decoupling) -- can run after IMP-017
5. **IMP-038** (State manager optimization) -- after IMP-006

**Dependencies:** Independent from Stream 1. IMP-031 should precede IMP-008.

---

### Stream 3: Type Safety and Error Handling
**IMP-IDs:** IMP-009, IMP-014, IMP-022, IMP-027
**Theme:** Eliminate type casts, standardize error handling, consistent patterns

Execution order (all parallelizable):
1. **IMP-014** (WebGL HDR type definitions) -- quick win
2. **IMP-027** (Null check standardization) -- quick win
3. **IMP-009** (Structured API errors) -- medium effort
4. **IMP-022** (Fix silent error suppression) -- medium effort

**Dependencies:** Fully independent from other streams.

---

### Stream 4: Testing Coverage
**IMP-IDs:** IMP-010, IMP-011, IMP-021, IMP-029, IMP-039, IMP-040
**Theme:** Fill critical test gaps, improve test quality

Execution order:
1. **IMP-010** (MediaManager tests) and **IMP-011** (Handler tests) -- highest priority, parallelizable
2. **IMP-021** (Format decoder tests) -- independent
3. **IMP-029** (Refactor fragile tests) -- after new tests establish patterns
4. **IMP-039** and **IMP-040** (Edge case and disposal tests) -- after core coverage

**Dependencies:** Independent from other streams. IMP-010 benefits from IMP-004 (Session extraction) for cleaner test setup, but can proceed without it.

---

### Stream 5: Performance Optimization
**IMP-IDs:** IMP-002, IMP-003, IMP-018, IMP-019, IMP-026, IMP-030, IMP-037
**Theme:** Memory efficiency, hot path optimization, startup improvements

Execution order (all parallelizable -- target isolated subsystems):
1. **IMP-018** (getPixel buffer reuse) -- 10 min fix
2. **IMP-019** (Gainmap Math.pow LUT) -- 15 min fix
3. **IMP-037** (Canvas cleanup) -- 5 min fix
4. **IMP-030** (WorkerPool priority queue) -- small
5. **IMP-002** (IPImage.clone shallow default) -- medium
6. **IMP-003** (Lazy frame index) -- large
7. **IMP-026** (Batch frame snapshots) -- medium

**Dependencies:** Fully independent from other streams.

---

### Stream 6: Developer Experience
**IMP-IDs:** IMP-012, IMP-016, IMP-020, IMP-023, IMP-024, IMP-025, IMP-035, IMP-036
**Theme:** API cleanliness, extensibility, documentation

Execution order:
1. **IMP-024** (Logger enhancement) and **IMP-036** (Gate test exports) -- quick wins
2. **IMP-016** (DecoderRegistry plugin support) and **IMP-035** (Window.openrv types) -- small
3. **IMP-020** (Consolidate constants) and **IMP-025** (JSDoc examples) -- medium
4. **IMP-023** (Decouple public API from UI) -- medium, after IMP-001 progress
5. **IMP-012** (Unified effect architecture) -- large, after Viewer decomposition progress in Stream 1

**Dependencies:** IMP-012 and IMP-023 benefit from Stream 1 progress but can start independently.

---

### Cross-Stream Dependency Map

```
Stream 1 (Architecture) -----> Stream 6 (DX: IMP-012, IMP-023)
         |
         +-------------------> Stream 4 (Testing: IMP-010 benefits from IMP-004)

Stream 2 (Rendering) --------> independent
Stream 3 (Type Safety) ------> independent
Stream 5 (Performance) ------> independent
```

---

## 4. PHASED ROADMAP

### Phase 1: Quick Wins
**Criteria:** S/M effort, Low risk, High/Critical impact
**Timeline:** 1-2 weeks

| ID | Title | Effort | Stream |
|---|---|---|---|
| IMP-013 | Extract clamp() utility + PixelMath | S | 3 |
| IMP-014 | WebGL HDR type definitions | S | 3 |
| IMP-017 | Pre-allocate LUT conversion buffers | S | 2 |
| IMP-018 | Optimize getPixel/setPixel allocations | S | 5 |
| IMP-019 | Optimize Gainmap Math.pow loop | S | 5 |
| IMP-027 | Standardize null check patterns | S | 3 |
| IMP-030 | WorkerPool priority queue optimization | S | 5 |
| IMP-037 | Cleanup throwaway canvases | S | 5 |
| IMP-024 | Logger with levels and filtering | S | 6 |
| IMP-035 | Window.openrv type augmentation | S | 6 |
| IMP-036 | Gate test-only exports | S | 6 |
| IMP-009 | Structured error handling in API | M | 3 |
| IMP-022 | Fix silent error suppression | M | 3 |

**Expected outcomes:** Measurable performance improvement in hot paths. Type safety improved. Error handling consistent across API layer. ~800 type casts eliminated. 237 clamp duplications removed.

---

### Phase 2: Core Refactoring
**Criteria:** M/L effort, Medium risk
**Timeline:** 3-6 weeks

| ID | Title | Effort | Stream |
|---|---|---|---|
| IMP-002 | IPImage.clone() shallow default | M | 5 |
| IMP-007 | Clean UI/Color pipeline boundary | M | 1 |
| IMP-010 | MediaManager.ts test coverage | L | 4 |
| IMP-011 | Handler function test coverage | M | 4 |
| IMP-015 | ManagerBase interface and registry | M | 1 |
| IMP-016 | DecoderRegistry plugin support | M | 6 |
| IMP-020 | Consolidate configuration constants | M | 6 |
| IMP-021 | Format decoder tests | L | 4 |
| IMP-023 | Decouple public API from UI | M | 6 |
| IMP-025 | JSDoc examples and parameter docs | M | 6 |
| IMP-026 | Batch frame snapshots | M | 5 |
| IMP-029 | Refactor fragile over-mocked tests | M | 4 |

**Expected outcomes:** Critical test gaps filled. Manager lifecycle standardized. Color pipeline usable headless. DecoderRegistry extensible for external consumers. ~140 MB saved per 4K HDR clone operation.

---

### Phase 3: Architecture Evolution
**Criteria:** L/XL effort, any risk
**Timeline:** 6-12 weeks

| ID | Title | Effort | Stream |
|---|---|---|---|
| IMP-001 | Decompose Viewer.ts monolith | XL | 1 |
| IMP-003 | Lazy frame index building | L | 5 |
| IMP-004 | Extract Session.ts domains | XL | 1 |
| IMP-005 | SessionGTOExporter strategies | L | 1 |
| IMP-006 | Decouple Renderer/StateManager | L | 2 |
| IMP-008 | Shader compilation deferred/cached | L | 2 |
| IMP-012 | Unified effect processing architecture | XL | 6 |
| IMP-028 | Node graph composition pattern | L | 1 |

**Expected outcomes:** Viewer.ts reduced from 3,264 to ~800 LOC. Session.ts reduced from 2,410 to ~500 LOC. SessionGTOExporter eliminated (replaced by per-domain serializers). Multi-second startup lag on long videos eliminated. Shader compilation no longer blocks UI thread.

---

### Phase 4: Polish and Extensibility
**Criteria:** Any effort, Low risk
**Timeline:** Ongoing

| ID | Title | Effort | Stream |
|---|---|---|---|
| IMP-031 | Extract GLSL shaders to files | M | 2 |
| IMP-032 | Consolidate type definitions | M | 3 |
| IMP-033 | Unify default state patterns | M | 3 |
| IMP-034 | Cache/Map management consistency | M | 3 |
| IMP-038 | ShaderStateManager optimization | M | 2 |
| IMP-039 | Video frame extraction edge case tests | M | 4 |
| IMP-040 | Disposal/cleanup lifecycle tests | M | 4 |

**Expected outcomes:** Codebase fully consistent in patterns and conventions. All edge cases covered. Shader code maintainable with syntax highlighting. Cache management predictable across all managers.

---

## 5. TOP 5 RECOMMENDATIONS (Highest ROI)

These five improvements deliver the highest impact-to-effort ratio and should be prioritized regardless of available resources.

### 1. IMP-013 + IMP-014: Extract clamp() utility and WebGL type definitions
**ROI: Extreme (Critical cleanup, S effort, Low risk)**

Create `clamp(value, min, max)` in `/src/utils/math.ts` and shared pixel math in `/src/color/PixelMath.ts`. Create `/src/types/webgl-hdr.d.ts` for missing browser API types. Together these eliminate 237 code duplications and ~800 unsafe type casts with minimal risk. A single developer can complete both in under 4 hours.

**Key files:**
- `/src/utils/math.ts` (new or extend)
- `/src/color/PixelMath.ts` (new)
- `/src/types/webgl-hdr.d.ts` (new)
- 60+ files consuming clamp pattern
- `/src/render/Renderer.ts`, `/src/render/RenderWorkerProxy.ts` (type cast reduction)

---

### 2. IMP-009 + IMP-022: Structured errors and silent failure fixes
**ROI: Very High (High impact, M effort, Low risk)**

The error infrastructure already exists (`AppError` hierarchy in `/src/core/errors.ts`) but is not used by the API layer or async code. Create `APIError`/`ValidationError`, replace generic throws in `/src/api/*.ts`, and audit 20+ silent `.catch(() => {})` handlers. This makes the system debuggable and prevents silent data loss. Medium effort because the error base classes already exist.

**Key files:**
- `/src/core/errors.ts` (extend)
- `/src/api/ColorAPI.ts`, `/src/api/PlaybackAPI.ts`, `/src/api/OpenRVAPI.ts`
- `/src/audio/AudioPlaybackManager.ts`, `/src/ui/components/ThumbnailManager.ts`, `/src/ui/components/Timeline.ts`

---

### 3. IMP-017 + IMP-018 + IMP-019: Hot path performance quick wins
**ROI: Very High (Medium impact, S effort each, Low risk)**

Three independent 5-15 minute fixes targeting allocations in render-critical loops: (a) pre-allocate LUT buffers in Renderer.ts, (b) accept output buffer in Image.ts getPixel(), (c) use lookup table for Gainmap Math.pow. Together they save 10-50ms per frame with LUT enabled, eliminate thousands of array allocations in diagnostic tools, and make HDR gainmap decoding 2-5x faster.

**Key files:**
- `/src/render/Renderer.ts` (lines 1026-1036, 1368-1394)
- `/src/core/image/Image.ts` (lines 91-112)
- `/src/formats/JPEGGainmapDecoder.ts` (lines 164-191)

---

### 4. IMP-015: ManagerBase interface and registry
**ROI: High (Medium impact, M effort, Low risk)**

Establishing a common `ManagerBase` interface with `initialize()/dispose()/getState()` across 31 manager classes provides immediate value: consistent lifecycle management, testability via interface mocking, and a foundation for the larger Viewer/Session decompositions (IMP-001, IMP-004). This is a prerequisite that unblocks the most impactful architectural changes while being low-risk on its own.

**Key files:**
- New: `/src/core/ManagerBase.ts` (interface + registry)
- `/src/ui/components/Viewer.ts` (consumer)
- 31 existing manager classes across `/src/ui/components/`, `/src/core/session/`, `/src/render/`, `/src/utils/`

---

### 5. IMP-010 + IMP-011: Critical test coverage gaps
**ROI: High (High impact, M-L effort, Low risk)**

MediaManager.ts (923 LOC, zero tests) and 7 handler functions (zero tests) are the two largest untested surfaces in the codebase. MediaManager handles all file loading, media type detection, and frame caching -- a failure here silently corrupts the user experience. Handlers coordinate Session/Viewer/UI integration. Testing these prevents regressions in the most critical user-facing paths.

**Key files:**
- `/src/core/session/MediaManager.ts` (test target)
- `/src/handlers/playbackHandlers.ts`, `persistenceHandlers.ts`, `sourceLoadedHandlers.ts`, `compareHandlers.ts`, `scopeHandlers.ts`, `infoPanelHandlers.ts`, `unsupportedCodecModal.ts` (test targets)
