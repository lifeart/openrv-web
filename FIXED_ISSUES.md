# Fixed Issues

## Issue #238: Mu compat `frameStart()` is a hardcoded local default, which distorts range predicates built on it

- **Severity**: Medium
- **Area**: Mu compatibility / timeline-range scripting
- **Root Cause**: `MuCommands._frameStart` was a hardcoded private field initialized to `1` with no setter or synchronization path to real session/source state. `frameStart()` returned this constant regardless of the actual media. Downstream predicates `isNarrowed()` and `isPlayable()` in `MuExtraCommands` produced results based on this synthetic value rather than the true session frame range.
- **Fix**: Added `getStartFrame()` to `MediaAPI`, reusing the existing `getCurrentSourceStartFrame()` utility which correctly derives the start frame from active representation or sequence metadata (with `|| 1` fallback for RV's 1-based convention). Wired `MuCommands.frameStart()` to `openrv.media.getStartFrame()`. Removed `_frameStart` field. `isNarrowed()`/`isPlayable()` automatically benefit with no code changes needed.
- **Regression Tests**: Added tests across two files:
  - MuCommands: `frameStart()` delegates to real API, no local caching (mock changes between calls), VFX start frame 1001
  - MuExtraCommands: `isNarrowed()` with frameStart=1001 (matching/non-matching in-point), `isPlayable()` with non-default start
  - OpenRVAPI: `getStartFrame()` default, sequence info path, active representation priority, null source
- **Verification**: TypeScript clean, all 123 MuCommands tests pass, all 282 OpenRVAPI tests pass.
- **Files Changed**: `src/api/MediaAPI.ts`, `src/compat/MuCommands.ts`, `src/compat/__tests__/MuCommands.test.ts`, `src/api/OpenRVAPI.test.ts`

## Issue #237: Mu compat playback direction is only local bookkeeping and does not control real reverse playback

- **Severity**: Medium
- **Area**: Mu compatibility / transport scripting
- **Root Cause**: `MuCommands.setInc()` stored direction in a private `_inc` field without forwarding to the real playback engine. `inc()` read from this local field. `MuExtraCommands.isPlayingBackwards()` and `toggleForwardsBackwards()` used the same local state. The actual viewer continued forward playback regardless.
- **Fix**: Added `playDirection` setter to `PlaybackEngine` (normalizes to ±1, delegates to `togglePlayDirection()` with guard), forwarded through `SessionPlayback` and `Session`. Added `setPlayDirection()`/`getPlayDirection()` to `PlaybackAPI` with input validation. Wired `MuCommands.setInc()`/`inc()` to real API, removed `_inc` field. `isPlayingBackwards()`/`toggleForwardsBackwards()` now reflect real playback state.
- **Regression Tests**: Updated and added tests in `MuCommands.test.ts`:
  - `setInc()` delegates to real `setPlayDirection()` API
  - `inc()` reads from real `getPlayDirection()` API
  - Raw values forwarded correctly (positive/negative)
  - NaN validation
  - No local state leakage (key regression: set +1, mock API returns -1, verify -1 returned)
  - `isPlayingBackwards()` reflects real playback state
  - `toggleForwardsBackwards()` calls real API
- **Verification**: TypeScript clean, all 118 MuCommands tests pass, 42 PlaybackAPI tests pass, 120 PlaybackEngine tests pass.
- **Files Changed**: `src/core/session/PlaybackEngine.ts`, `src/core/session/SessionPlayback.ts`, `src/core/session/Session.ts`, `src/api/PlaybackAPI.ts`, `src/compat/MuCommands.ts`, `src/compat/__tests__/MuCommands.test.ts`

## Issue #236: Mu compat `viewSize()` and `setViewSize()` target the first DOM canvas instead of the real viewer surface

- **Severity**: Medium
- **Area**: Mu compatibility / viewport scripting
- **Root Cause**: `MuCommands.getCanvas()` fell back to `document.querySelector('canvas')`, returning whichever canvas is first in DOM order. The Viewer creates multiple canvases (image, GL, watermark, paint), so `viewSize()` and `setViewSize()` operated on an arbitrary canvas rather than the actual viewer viewport. No production code ever called `setCanvas()`.
- **Fix**: Added `getViewportSize()` to `ViewerProvider` interface, `ViewAPI`, and `Viewer` (returns `displayWidth`/`displayHeight` — the real CSS-pixel viewport dimensions). Rewired `viewSize()` to read from `openrv.view.getViewportSize()`. Downgraded `setViewSize()` to `stub` (web viewport is CSS-managed, not imperatively resizable). Removed unused `_canvas` field, `setCanvas()`, and `getCanvas()` methods entirely.
- **Regression Tests**: 6 new tests in `MuCommands.test.ts`:
  - `viewSize()` reads from real ViewAPI, not DOM canvas
  - `viewSize()` returns correct `[width, height]` tuple
  - `viewSize()` does not call `document.querySelector('canvas')`
  - `setViewSize()` marked as stub
  - `setViewSize()` validates args but doesn't touch DOM
  - `setViewSize()` does not call `document.querySelector('canvas')`
- **Verification**: TypeScript clean, all 115 MuCommands tests pass, all 278 OpenRVAPI tests pass.
- **Files Changed**: `src/compat/MuCommands.ts`, `src/compat/__tests__/MuCommands.test.ts`, `src/api/ViewAPI.ts`, `src/api/types.ts`, `src/api/OpenRVAPI.test.ts`, `src/ui/components/Viewer.ts`

## Issue #235: Several Mu compat display commands are marked supported but only mutate bridge-local state, not the real viewer

- **Severity**: Medium
- **Area**: Mu compatibility / view-display scripting
- **Root Cause**: `setFiltering`, `getFiltering`, `setBGMethod`, `bgMethod`, `setMargins`, and `margins` were marked as `supported` in the Mu command manifest, but implementations only updated local bridge fields (`_filterMode`, `_bgMethod`, `_margins`) without calling into the real viewer/renderer.
- **Fix**:
  - **Filtering**: Wired `setFiltering`/`getFiltering` to new `ViewAPI.setTextureFilterMode()`/`getTextureFilterMode()` → `Viewer.setFilterMode()` → `Renderer.setTextureFilterMode()`. Mu integer constants (0=nearest, 1=linear) mapped to `TextureFilterMode` strings. Extracted `setFilterMode()` from `toggleFilterMode()` in Viewer for direct mode setting.
  - **Background**: Wired `setBGMethod`/`bgMethod` to new `ViewAPI.setBackgroundPattern()`/`getBackgroundPattern()` → `Viewer.setBackgroundPatternState()`/`getBackgroundPatternState()`. Preserves existing pattern state fields via spread on set.
  - **Margins**: Downgraded from `supported` to `'stub'` in manifest — no real viewer margins concept exists. Local-only implementation preserved for backward compat but manifest is now honest.
  - Added `'stub'` as valid support level in `SUPPORT_MAP` type.
  - Removed local `_filterMode` and `_bgMethod` fields.
- **Regression Tests**: Tests across 2 files:
  - MuCommands: Real API delegation for filtering/background, Mu constant mapping, stub status for margins, invalid input validation
  - OpenRVAPI: ViewAPI delegation (API-U048–U056), input validation, disposed guards for all 4 new methods
- **Verification**: TypeScript clean, all 110 MuCommands tests pass, all 278 OpenRVAPI tests pass.
- **Files Changed**: `src/compat/MuCommands.ts`, `src/compat/__tests__/MuCommands.test.ts`, `src/api/ViewAPI.ts`, `src/api/types.ts`, `src/api/OpenRVAPI.test.ts`, `src/ui/components/Viewer.ts`

## Issue #234: Mu compat `setFPS()` only changes compat readback state and does not affect real playback timing

- **Severity**: Medium
- **Area**: Mu compatibility / playback scripting
- **Root Cause**: `MuCommands.setFPS()` only stored the FPS value in a private `_overrideFPS` field without calling through to the session API. `fps()` returned this local override, creating a false sense the command worked while actual playback timing remained unchanged.
- **Fix**: Added `setPlaybackFPS(fps)` to `MediaAPI` that sets `session.fps` (which delegates to `PlaybackEngine.fps`, genuinely changing playback timing). Changed `MuCommands.setFPS()` to call `getOpenRV().media.setPlaybackFPS(fps)`. Changed `MuCommands.fps()` to always read from `getPlaybackFPS()`. Removed the unused `_overrideFPS` field entirely. Both methods include input validation (positive number check).
- **Regression Tests**: Added 6 new tests across two files:
  - MuCommands: `setFPS()` calls real API, `fps()` reads real state after set, playback FPS returned (not source), input validation (0, -1, NaN)
  - OpenRVAPI: `setPlaybackFPS()` basic functionality, input validation, readback consistency
- **Verification**: TypeScript clean, all 106 MuCommands tests pass, all 265 OpenRVAPI tests pass.
- **Files Changed**: `src/api/MediaAPI.ts`, `src/compat/MuCommands.ts`, `src/compat/__tests__/MuCommands.test.ts`, `src/api/OpenRVAPI.test.ts`

## Issue #233: MXF parsing hard-fails on indefinite BER lengths instead of degrading or surfacing narrower support

- **Severity**: Medium
- **Area**: Format support / MXF parsing
- **Root Cause**: `parseKLV()` threw a `DecoderError` on BER byte `0x80` (indefinite length). Since both `parseMXFHeader()` and `demuxMXF()` caught this error and broke out of their parsing loops, a single indefinite-BER KLV would abort all further parsing of the entire MXF file.
- **Fix**: Changed `parseKLV()` to return `length = -1` sentinel instead of throwing. Added `scanForNextUL()` helper that scans forward for the next SMPTE Universal Label prefix (`06 0E 2B 34`) to recover parsing position. Updated both `parseMXFHeader()` and `demuxMXF()` to detect `length === -1`, log a `console.warn` with offset, scan forward to the next KLV, and continue parsing. Includes `next <= offset` guard to prevent infinite loops.
- **Regression Tests**: Added 7 new tests + updated 2 existing tests in `MXFDemuxer.test.ts`:
  - `parseKLV` returns `length = -1` for `0x80` BER (instead of throwing)
  - `parseMXFHeader` skips indefinite BER and finds subsequent CDCI descriptor
  - Warning logged on indefinite BER encounter
  - Graceful stop when no next UL found after indefinite BER
  - `scanForNextUL` finds SMPTE prefix / returns -1 when not found
  - `demuxMXF` skips indefinite BER and finds essence elements
  - Definite-length BER parsing unaffected (non-regression)
- **Verification**: TypeScript clean, all 67 MXFDemuxer tests pass.
- **Files Changed**: `src/formats/MXFDemuxer.ts`, `src/formats/MXFDemuxer.test.ts`

## Issue #232: Display gamma and brightness controls are neutralized on HDR output paths, so the sliders stop having any effect there

- **Severity**: Medium
- **Area**: Display profile / HDR output behavior
- **Root Cause**: `applyHDRDisplayOverrides()` in `ViewerGLRenderer.ts` forcibly set `displayGamma: 1` and `displayBrightness: 1` alongside `transferFunction: 0` on every HDR output path. This neutralized the user's calibration slider values. The `transferFunction: 0` override is correct (prevents double EOTF encoding), but gamma/brightness are independent post-tone-mapping calibration knobs that work as valid relative adjustments on linear-light HDR data.
- **Fix**: Modified `applyHDRDisplayOverrides()` to only override `transferFunction: 0`, preserving `displayGamma` and `displayBrightness` from the user's display profile. Updated comments at all 4 HDR call sites (native WebGL, tiled HDR, WebGPU blit, Canvas2D blit) to document the preserved behavior.
- **Regression Tests**: Updated 4 existing tests + added 2 new tests in `ViewerGLRenderer.test.ts`:
  - VGLR-031: HLG path preserves displayGamma (2.4)
  - VGLR-031b: PQ path preserves gamma/brightness
  - VGLR-031c: Extended HDR path preserves gamma/brightness
  - VGLR-032: HLG path preserves displayBrightness (1.5)
  - VGLR-073: Canvas2D blit path preserves gamma/brightness
  - VGLR-104: Tiled HDR path preserves gamma/brightness
- **Verification**: TypeScript clean, all 97 ViewerGLRenderer tests pass, all 140 Renderer tests pass.
- **Files Changed**: `src/ui/components/ViewerGLRenderer.ts`, `src/ui/components/ViewerGLRenderer.test.ts`

## Issue #231: The RAW preview path advertises broader RAW support than its TIFF-only parser can actually handle

- **Severity**: Medium
- **Area**: Format support / camera RAW preview loading
- **Root Cause**: `RAW_EXTENSIONS` included `cr3` (ISO BMFF container), `raf` (Fuji proprietary header), and `rw2` (Panasonic proprietary) alongside genuinely TIFF-based formats. The `extractRAWPreview()` parser requires TIFF byte-order marks + magic `42`, so these non-TIFF formats would always fail silently at load time despite being advertised as supported.
- **Fix**: Removed `cr3`, `raf`, `rw2` from `RAW_EXTENSIONS` and `SUPPORTED_IMAGE_EXTENSIONS`. Updated `DecoderRegistry` JSDoc, `RAWPreviewDecoder` file-level docs, and `docs/guides/file-formats.md` to clearly document which formats are supported (TIFF-based: CR2, NEF, ARW, DNG, ORF, PEF, SRW) and which are excluded with reasons.
- **Regression Tests**: Added RAW-T016 through RAW-T019 in `RAWPreviewDecoder.test.ts`:
  - RAW-T016: CR3, RAF, RW2 extensions no longer recognized by `isRAWExtension()` (with case variations)
  - RAW-T017: ISO BMFF/CR3-like binary data gracefully returns null
  - RAW-T018: Fuji RAF-like binary data gracefully returns null
  - RAW-T019: Random binary data gracefully returns null
- **Verification**: TypeScript clean, all 21 RAWPreviewDecoder tests pass, all 38 SupportedMediaFormats tests pass.
- **Files Changed**: `src/formats/RAWPreviewDecoder.ts`, `src/formats/RAWPreviewDecoder.test.ts`, `src/formats/DecoderRegistry.ts`, `src/utils/media/SupportedMediaFormats.ts`, `scripts/docs/generate-formats.ts`, `docs/guides/file-formats.md`

## Issue #230: `openrv.media.getFPS()` reports mutable session playback FPS, not the current source FPS it claims to return

- **Severity**: Medium
- **Area**: Public API / media metadata consistency
- **Root Cause**: `MediaAPI.getFPS()` was documented to return "the frames per second of the current source" but implemented as `return this.session.fps`, which returns the mutable session playback rate. Session FPS can be overridden independently (e.g., via shared URL state), causing contradictory values like `getCurrentSource().fps === 24` while `getFPS() === 48`.
- **Fix**: Changed `getFPS()` to return `this.session.currentSource?.fps ?? this.session.fps` — returns the source's FPS when loaded, falls back to session FPS when no source exists. Added `getPlaybackFPS()` for callers needing the session playback rate. Also updated `MuCommands.fps()` to use `getPlaybackFPS()` to preserve Mu compat semantics (original RV's `fps()` returns effective playback rate).
- **Regression Tests**: Added 4 new tests in `OpenRVAPI.test.ts` + 1 in `MuCommands.test.ts`:
  - API-U209: `getFPS()` returns source FPS (24) even when session FPS is overridden (48)
  - API-U210: `getFPS()` falls back to session FPS when no source loaded
  - API-U211: `getPlaybackFPS()` returns session playback FPS
  - API-U212: `getPlaybackFPS()` throws after dispose
  - MuCommands: `fps()` returns playback FPS (not source FPS) when no override
- **Verification**: TypeScript clean, all 262 API tests pass, all 104 MuCommands tests pass.
- **Files Changed**: `src/api/MediaAPI.ts`, `src/api/OpenRVAPI.test.ts`, `src/compat/MuCommands.ts`, `src/compat/__tests__/MuCommands.test.ts`

## Issue #229: Display HDR / gamut capability is frozen at startup, so moving the app between displays leaves stale output assumptions

- **Severity**: Medium
- **Area**: Display capability detection / HDR output
- **Root Cause**: `detectDisplayCapabilities()` was called once in the `App.ts` constructor. No `matchMedia` change listeners were registered for `(dynamic-range: high)` or `(color-gamut: ...)`, so moving the window between SDR/HDR or sRGB/P3 displays left stale capability data until a full app reload.
- **Fix**: Added `watchDisplayChanges(caps, onChange)` in `DisplayCapabilities.ts` that registers `addEventListener('change', ...)` listeners on three media queries (`dynamic-range: high`, `color-gamut: p3`, `color-gamut: rec2020`). On change, re-probes `displayHDR`/`displayGamut`, re-derives `activeColorSpace`/`activeHDRMode`, and calls `onChange` only if something actually changed. Wired in `App.ts` constructor with cleanup via `wiringSubscriptions`. `Viewer.updateDisplayCapabilities()` re-queries HDR headroom and schedules a render on change. Safe no-op when `matchMedia` is unavailable.
- **Regression Tests**: Added DC-WATCH-001 through DC-WATCH-009 in `DisplayCapabilities.test.ts`:
  - DC-WATCH-001: Listeners registered for all media queries
  - DC-WATCH-002: SDR-to-HDR transition updates `displayHDR`
  - DC-WATCH-003: Gamut change updates `displayGamut`
  - DC-WATCH-004: `activeColorSpace` re-derived on gamut change
  - DC-WATCH-005: `activeHDRMode` re-derived to `extended` when HDR available
  - DC-WATCH-006: No spurious `onChange` when nothing changed
  - DC-WATCH-007: Cleanup removes all listeners
  - DC-WATCH-008: No-op when `matchMedia` unavailable
  - DC-WATCH-009: HDR-to-SDR transition resets `activeHDRMode` to `sdr`
- **Verification**: TypeScript clean, all 59 DisplayCapabilities tests pass, all 140 Renderer tests pass, all 100 HDR acceptance tests pass.
- **Files Changed**: `src/color/DisplayCapabilities.ts`, `src/color/DisplayCapabilities.test.ts`, `src/App.ts`, `src/ui/components/Viewer.ts`

## Issue #228: Share-link media auto-load misclassifies signed or query-string video URLs as images

- **Severity**: Medium
- **Area**: Share links / URL media loading
- **Root Cause**: `Session.loadSourceFromUrl(...)` extracted the filename and extension without stripping query (`?...`) or hash (`#...`) parts. A URL like `shot.mov?token=abc` could yield an unrecognized extension. Additionally, percent-encoded characters in filenames were not decoded for display names.
- **Fix**: Confirmed the method already used `new URL(url).pathname` which correctly strips query/hash. Added `decodeURIComponent()` to the extracted filename so display names are clean (e.g., `my%20shot.mov` → `my shot.mov`). Added comprehensive regression tests to lock down correct behavior.
- **Regression Tests**: Added 9 new tests in `Session.loadSourceFromUrl.test.ts`:
  - `.mov?token=abc123` correctly identified as video
  - `.exr?v=2&sig=xyz` correctly identified as image
  - `.mp4#signed` and `.mov#t=5` correctly identified as video (hash fragments)
  - `.mp4?token=abc#t=5` with both query and hash
  - Display name does not contain query params or hash fragments
  - Percent-encoded characters decoded in display name
- **Verification**: TypeScript clean, all 21 loadSourceFromUrl tests pass, all 2519 session-related tests pass.
- **Files Changed**: `src/core/session/Session.ts`, `src/core/session/Session.loadSourceFromUrl.test.ts`

## Issue #227: Per-source OCIO assignments are keyed by display name, so same-named media can inherit each other's color space

- **Severity**: Medium
- **Area**: OCIO / per-source state identity
- **Root Cause**: The OCIO per-source key was constructed as `source.name || \`source_${session.currentSourceIndex}\`` in `sourceLoadedHandlers.ts`. Since `source.name` is just the display filename (e.g., `plate.exr`), two unrelated files with the same basename from different directories shared the same key, causing their OCIO color space assignments to collide.
- **Fix**: Changed the key to `source.url || source.name || \`source_${session.currentSourceIndex}\``. The `url` property is always unique per source (blob URLs for file drops, full HTTP URLs for remote loads), stable within a session, and falls back gracefully when empty.
- **Regression Tests**: Added SLH-U050 through SLH-U053 in `sourceLoadedHandlers.test.ts`:
  - SLH-U050: Two sources with same name but different URLs get different OCIO source IDs
  - SLH-U051: Changing OCIO assignment on one same-named source does not affect the other
  - SLH-U052: URL-based key vs name fallback when URL is empty
  - SLH-U053: Index-based fallback when both URL and name are empty
- **Verification**: TypeScript clean, all 51 sourceLoadedHandlers tests pass, all 119 OCIOProcessor tests pass, all 30 OCIOStateManager tests pass.
- **Files Changed**: `src/handlers/sourceLoadedHandlers.ts`, `src/handlers/sourceLoadedHandlers.test.ts`

## Issue #7: Lint is already red because the Vitest setup file imports `vitest` twice

- **Severity**: Medium
- **Area**: Repo hygiene, test tooling
- **Root Cause**: `vitest` was imported separately at line 6 (`vi`) and line 186 (`beforeEach`) in `test/setup.ts`, violating the `import-x/no-duplicates` lint rule.
- **Fix**: Consolidated into a single `import { vi, beforeEach } from 'vitest'` at line 6, removed the duplicate import at line 186.
- **Verification**: `pnpm lint` passes (no `import-x/no-duplicates` errors), all 21,707 tests pass.
- **Files Changed**: `test/setup.ts`

## Issue #5: EXR layer names are injected into `innerHTML` without escaping

- **Severity**: High (XSS vulnerability)
- **Area**: EXR UI, metadata rendering
- **Root Cause**: `ChannelSelect.ts` interpolated user-controlled EXR layer names directly into `innerHTML`, allowing malicious layer names to inject HTML/JS.
- **Fix**: Split the innerHTML assignment into two steps — set HTML skeleton with trusted SVG icons and an empty `<span>`, then assign the layer name via safe `textContent`. This matches the `textContent` pattern already used in `DropdownMenu.ts`.
- **Regression Test**: Added `CH-072` in `ChannelSelect.test.ts` — tests a classic XSS payload `<img src=x onerror=alert(1)>`, asserts no HTML element is injected and text is displayed as plain text.
- **Verification**: All 60 ChannelSelect tests pass, no lint regressions.
- **Files Changed**: `src/ui/components/ChannelSelect.ts`, `src/ui/components/ChannelSelect.test.ts`

## Issue #4: Zoom control uses inconsistent notation between menu and selected value

- **Severity**: Medium
- **Area**: View controls, zoom UI
- **Root Cause**: `ZoomControl.ts` used `preset.label` (ratio notation like `2:1`) for the button display, while the dropdown menu showed `preset.percentage` (`200%`).
- **Fix**: Changed `updateButtonLabel()` and `updateFromViewer()` to use `preset.percentage` for presets and `Math.round(ratio * 100) + '%'` for non-preset values. Removed unused `formatRatio` import.
- **Regression Tests**: Added ZOOM-U090 through ZOOM-U093 — verify all presets display percentage, no ratio notation appears, custom zoom values use percentage, and dropdown selection shows matching percentage.
- **Verification**: All 49 ZoomControl tests pass, no lint regressions.
- **Files Changed**: `src/ui/components/ZoomControl.ts`, `src/ui/components/ZoomControl.test.ts`

## Issues #17 & #21: POSIX-only basename extraction in DCC wiring and source nodes

- **Severity**: Medium
- **Area**: Integrations, media loading, source metadata
- **Root Cause**: `path.split('/').pop()` in `AppDCCWiring.ts`, `FileSourceNode.ts`, and `VideoSourceNode.ts` only handled POSIX separators, failing on Windows paths like `C:\shots\plate.exr`.
- **Fix**: Created `src/utils/path.ts` with a `basename()` utility that splits on both `/` and `\` via regex. Applied to all 3 locations, preserving existing fallbacks (`'image'`, `'video'`).
- **Regression Tests**: 6 tests in `src/utils/path.test.ts` covering POSIX, Windows, mixed separators, URLs, plain filenames, and empty strings.
- **Verification**: All tests pass, TypeScript clean, lint clean. Grep confirms zero remaining `split('/').pop()` instances in `src/`.
- **Files Changed**: `src/utils/path.ts` (new), `src/utils/path.test.ts` (new), `src/AppDCCWiring.ts`, `src/nodes/sources/FileSourceNode.ts`, `src/nodes/sources/VideoSourceNode.ts`

## Issue #12: A/B badge e2e test checks a selector that the app never renders

- **Severity**: Medium
- **Area**: E2E tests, compare indicator coverage
- **Root Cause**: `AB-E021` in `e2e/ab-compare.spec.ts` used selector `ab-indicator-badge`, but production code in `ViewerIndicators.ts` renders `ab-indicator`.
- **Fix**: Updated the selector from `ab-indicator-badge` to `ab-indicator` (one-line change).
- **Verification**: All 43 ViewerIndicators unit tests pass. No remaining stale references to `ab-indicator-badge` in code.
- **Files Changed**: `e2e/ab-compare.spec.ts`

## Issue #22: ViewerGLRenderer's fallback auto gamut-mapping path is self-cancelling

- **Severity**: Low
- **Area**: Rendering logic, gamut mapping
- **Root Cause**: In `detectGamutMapping()`, both branches of a ternary assigned `'srgb'` to `sourceGamut`, making the subsequent `sourceGamut === 'srgb'` guard always fire and turn gamut mapping off — the method was a no-op.
- **Fix**: Replaced the self-cancelling ternary with actual source gamut detection from `image.metadata.colorPrimaries`: `bt2020` → `'rec2020'`, `p3` → `'display-p3'`, default → `'srgb'`. Simplified the "no mapping needed" guard to `sourceGamut === targetGamut || sourceGamut === 'srgb'`.
- **Regression Tests**: Added VGLR-094 through VGLR-099 covering: mode-off bypass, bt2020 detection, p3 detection, sRGB-to-sRGB off, bt2020-to-p3 compress, and p3-to-p3 identity.
- **Verification**: All 90 ViewerGLRenderer tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/ViewerGLRenderer.ts`, `src/ui/components/ViewerGLRenderer.test.ts`

## Issue #14: Plugin app-event subscriptions are inert because the registry never receives the Events API

- **Severity**: High
- **Area**: Plugin bootstrap, services
- **Root Cause**: `src/main.ts` called `pluginRegistry.setAPI()` and `pluginRegistry.setPaintEngine()` but never called `pluginRegistry.setEventsAPI()`, leaving `PluginEventBus.eventsAPI` null — all `onApp()` subscriptions warned and no-oped.
- **Fix**: Added `pluginRegistry.setEventsAPI(window.openrv.events)` in `src/main.ts` between the other `set*` bootstrap calls.
- **Regression Tests**: Added PINT-041 (happy path: plugin subscribes to app events after wiring, no warnings, events bridged correctly) and PINT-042 (negative path: without wiring, subscription emits "EventsAPI not available" warning).
- **Verification**: All 147 plugin tests pass, TypeScript clean.
- **Files Changed**: `src/main.ts`, `src/plugin/PluginRegistry.integration.test.ts`

## Issue #23: Stack layer opacity round-trips are broken, and layer visibility is not serialized at all

- **Severity**: High
- **Area**: Session export/import, stack compositing
- **Root Cause**: (A) `SessionGTOExporter` writes opacity to `layerOutput.opacity` but `GTOGraphLoader` read from `output.opacity` — path mismatch. (B) Layer visibility had no serialization path at all.
- **Fix**: (A) Changed loader to read opacity from `layerOutput` component matching the exporter. (B) Added `layerVisible` to `StackGroupSettings`, exporter writes visibility as int array `[1,0,1]` to `layerOutput.visible`, loader reads and converts back to boolean array.
- **Regression Tests**: 3 exporter tests (opacity written to layerOutput, visibility written as ints, both coexist) + 4 loader tests (opacity from layerOutput, visibility parsed to booleans, regression: output component ignored, combined parsing).
- **Verification**: All 266 exporter tests + 63 loader tests pass, TypeScript clean.
- **Files Changed**: `src/core/session/SessionGTOExporter.ts`, `src/core/session/GTOGraphLoader.ts`, `src/core/session/SessionGTOExporter.test.ts`, `src/core/session/GTOGraphLoader.test.ts`

## Issue #13: Several header controls used in e2e still do not expose stable test IDs

- **Severity**: Low
- **Area**: Testability, header UI contract
- **Root Cause**: Save, export, mute, volume slider, and volume container controls lacked `data-testid` attributes, forcing e2e tests to fall back to tooltip text and CSS class selectors.
- **Fix**: Added `data-testid` attributes: `save-button` (HeaderBar), `export-button` (ExportControl), `mute-button`, `volume-slider`, `volume-control` (VolumeControl). Updated e2e tests to use stable `[data-testid="..."]` selectors instead of fragile fallbacks.
- **Regression Tests**: HDR-U200 (save button), EXPORT-U100 (export button), VOL-100 (mute button), VOL-101 (volume slider), VOL-102 (volume container) — all verify testid presence and correct element type.
- **Verification**: All 218 affected unit tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/layout/HeaderBar.ts`, `src/ui/components/ExportControl.ts`, `src/ui/components/VolumeControl.ts`, `e2e/session-recovery.spec.ts`, `e2e/export-workflow.spec.ts`, `e2e/audio-playback.spec.ts`, + corresponding test files

## Issues #1, #2, #3, #10: Scope shortcuts broken — histogram (H), gamut (G), waveform (W) unreachable in production

- **Severity**: High (#1), Medium (#2, #3, #10)
- **Area**: Keyboard shortcuts, scopes UI, context system
- **Root Cause**: Two layers — (1) KeyH/KeyG/KeyW each had dual meanings (e.g., H = fitToHeight vs histogram) but histogram/waveform were completely hidden from registration. (2) Even after making them contextual, the `panel` context was never activated because `qc` tab mapped to `viewer` instead of `panel`.
- **Fix (Issue #1)**: Moved `panel.histogram` from HIDDEN_DEFAULTS to CONTEXTUAL_DEFAULTS. Added contextual registrations: `view.fitToHeight` in global, `panel.histogram` in panel context for KeyH.
- **Fix (Issue #3)**: Same pattern for waveform — moved `panel.waveform` from HIDDEN_DEFAULTS to CONTEXTUAL_DEFAULTS. Added contextual registrations: `view.fitToWidth` in global, `panel.waveform` in panel for KeyW.
- **Fix (Issue #2 & #10)**: Changed QC tab context mapping from `'viewer'` to `'panel'` in App.ts, so the `panel` context is actually activated in production. This makes H/G/W resolve to scope toggles when the QC tab is active.
- **Regression Tests**: CKM-090 through CKM-092 (KeyH context resolution), CKM-100 through CKM-107 (production tab-to-context mapping: QC→panel, scope shortcuts resolve correctly, global shortcuts still work as fallback), SK-M25k/l/m (binding metadata validation).
- **Verification**: All 34 ContextualKeyboardManager tests + 13 AppKeyboardHandler tests pass, TypeScript clean.
- **Files Changed**: `src/App.ts`, `src/AppKeyboardHandler.ts`, `src/utils/input/KeyBindings.ts`, `src/AppKeyboardHandler.test.ts`, `src/utils/input/ContextualKeyboardManager.test.ts`

## Issue #8: Several advertised channel shortcuts are unreachable in production

- **Severity**: High
- **Area**: Keyboard shortcuts, channel selection
- **Root Cause**: Channel shortcuts (`Shift+R`=red, `Shift+B`=blue, `Shift+N`=none) were registered under the `channel` context, which no tab ever activates. They always lost to global shortcuts (rotate, background, network).
- **Fix**: Re-registered channel shortcuts under `viewer` and `panel` contexts (matching view and QC tabs). Used `.panel` suffixed action names for deduplication. Changed `channel.red` binding context from `'channel'` to `'viewer'` in KeyBindings.ts.
- **Behavior**: view/QC tabs → Shift+R/B/N select channels; other tabs → Shift+R rotates, Shift+B cycles background, Shift+N opens network.
- **Regression Tests**: KW-060 through KW-068 — channel shortcuts on view tab, QC tab, and global fallbacks on color/effects/transform tabs.
- **Verification**: All 45 KeyboardWiring + 34 ContextualKeyboardManager + 13 AppKeyboardHandler tests pass, TypeScript clean.
- **Files Changed**: `src/App.ts`, `src/utils/input/KeyBindings.ts`, `src/KeyboardWiring.test.ts`, `src/__e2e__/ActiveContextManager.e2e.test.ts`

## Issue #9: `Shift+L` has two conflicting meanings depending on the active tab

- **Severity**: Medium
- **Area**: Keyboard shortcuts, channel selection, color tools
- **Root Cause**: `channel.luminance` handler had a tab-checking `if` block that toggled the LUT pipeline panel on the Color tab instead of selecting luminance. Both behaviors were crammed into one handler.
- **Fix**: Separated into two distinct actions: `channel.luminance` (pure channel select) and `lut.togglePanel` (pure LUT panel toggle). Registered via contextual dispatch: `channel.luminance` in viewer/panel contexts, `lut.togglePanel` in global context. Added `lut.togglePanel` to KeyBindings.ts and shortcuts dialog.
- **Behavior**: view/QC tabs → Shift+L selects luminance channel; all other tabs → Shift+L toggles LUT panel.
- **Regression Tests**: SK-M25n (both skipped from direct registration), SK-M25o (correct contexts), SK-M25p (LUT in shortcuts dialog), plus KeyboardActionMap tests for pure handler behavior.
- **Verification**: All 89 KeyboardActionMap + 16 AppKeyboardHandler tests pass, TypeScript clean.
- **Files Changed**: `src/utils/input/KeyBindings.ts`, `src/services/KeyboardActionMap.ts`, `src/App.ts`, `src/AppKeyboardHandler.ts`, `src/AppKeyboardHandler.test.ts`, `src/services/KeyboardActionMap.test.ts`

## Issue #11: Network e2e tests target a stale UI contract instead of the actual NetworkControl DOM

- **Severity**: Medium
- **Area**: E2E tests, network UI contract
- **Root Cause**: 8 skipped network specs used obsolete selectors (`network-button`, `room-code`, `connection-status`, `user-presence-list`, `user-entry`, `:has-text()` patterns) that don't match the real `NetworkControl` DOM.
- **Fix**: Replaced all stale selectors with correct `data-testid` values from production code. Introduced state-specific panel selectors (`network-disconnected-panel`, `network-connecting-panel`, `network-connected-panel`) instead of a single generic panel.
- **Verification**: All 36 NetworkControl unit tests pass. No stale selectors remain in the codebase.
- **Files Changed**: `e2e/network-sync.spec.ts`

## Issue #6: Build and e2e bootstrap are fragile because the runtime is not pinned tightly enough

- **Severity**: High
- **Area**: Tooling, build, test bootstrap
- **Root Cause**: No `engines` field in `package.json` and no `.nvmrc`. Vite 7 requires Node `^20.19.0 || >=22.12.0` (uses `crypto.hash` added in Node 20.12.0), but nothing enforced this, causing `pnpm build` and Playwright to fail on older Node versions.
- **Fix**: Added `engines.node` constraint to `package.json` matching Vite 7.3.1's requirement (`^20.19.0 || >=22.12.0`). Added `.nvmrc` with `22` for nvm/fnm auto-selection.
- **Verification**: TypeScript check passes, current Node v22.15.0 satisfies constraint. Cross-checked against all dependencies (Vitest, jsdom, ESLint, TypeScript) — all compatible.
- **Files Changed**: `package.json`, `.nvmrc` (new)

## Issue #20: RV/GTO session import silently drops mapped-but-unimplemented nodes

- **Severity**: High
- **Area**: Session import, GTO/RV compatibility
- **Root Cause**: The GTO loader skipped unimplemented node types (RVColor, RVTransform2D, etc.) with no indication to the user, making session import silently lossy.
- **Fix**: Added `SkippedNodeInfo` tracking with three reason codes (`unmapped_protocol`, `unregistered_type`, `creation_failed`). Skipped nodes are collected in `GTOParseResult.skippedNodes`, summarized via `console.warn`, and emitted as a `skippedNodes` event through `SessionGraph` → `Session`. Added `formatSkippedNodesWarning()` utility for user-facing messages. Unmapped protocols (internal RV nodes) are excluded from user-facing warnings.
- **Regression Tests**: GTO-SKIP-001 through GTO-SKIP-006 (tracking, console.warn, summary), GTO-WARN-001 through GTO-WARN-004 (warning format, empty case, filtering).
- **Verification**: All 73 GTOGraphLoader tests pass, TypeScript clean.
- **Files Changed**: `src/core/session/GTOGraphLoader.ts`, `src/core/session/SessionGraph.ts`, `src/core/session/Session.ts`, `src/core/session/SessionTypes.ts`, `src/core/session/index.ts`, `src/core/session/GTOGraphLoader.test.ts`

## Issue #24: Imported RV stack modes `dissolve` and `topmost` degrade silently to normal compositing

- **Severity**: Medium
- **Area**: RV/GTO compatibility, stack compositing
- **Root Cause**: `BlendModes.ts` explicitly downgraded `dissolve` and `topmost` to `normal` with no indication. Sessions appeared to load successfully while producing different imagery.
- **Fix**: Added `stackCompositeToBlendModeWithInfo()` returning `BlendModeMapResult` with `degraded` flag and `originalMode`. GTO loader collects `DegradedModeInfo` entries, emits `console.warn`, and exposes `degradedModes` in `GTOParseResult` + session events. Added `formatDegradedModesWarning()` with deduplication.
- **Regression Tests**: 9 BlendModes tests (degraded/non-degraded mapping), 5 GTOGraphLoader tests (GTO-DEGRADE-001 through 005: warning format, empty case, deduplication, multi-mode).
- **Verification**: All 159 tests pass (81 BlendModes + 78 GTOGraphLoader), TypeScript clean.
- **Files Changed**: `src/composite/BlendModes.ts`, `src/core/session/GTOGraphLoader.ts`, `src/core/session/SessionGraph.ts`, `src/core/session/SessionTypes.ts`, `src/core/session/Session.ts`, `src/core/session/index.ts`, `src/composite/BlendModes.test.ts`, `src/core/session/GTOGraphLoader.test.ts`

## Issue #15: Plugin-contributed UI panels are stored in the registry but never consumed by the app

- **Severity**: Medium
- **Area**: Plugin system, UI extension points
- **Root Cause**: `registerUIPanel()` stored panels in the registry, but no production code called `getUIPanel()` or `getUIPanels()` — panels were invisible to users.
- **Fix**: Added `uiPanelRegistered` signal for reactive discovery, `console.warn` on registration noting panels aren't yet displayed, and TODO(#15) documenting what's needed for layout integration. Existing API unchanged.
- **TODO(#15) Resolved**: Plugin UI panels now appear in the app layout. `buildPanelToggles` returns `PanelTogglesResult` with `addPluginPanel()`/`removePluginPanel()` methods for dynamic toggle buttons with floating containers. `App.wirePluginPanels()` mounts existing panels on layout creation, subscribes to `uiPanelRegistered`/`uiPanelUnregistered` signals for dynamic add/remove. Added `uiPanelUnregistered` signal to `PluginRegistry`. Removed console.warn and TODO comments.
- **Regression Tests**: PREG-047 (updated: no warn), PREG-049 (new: unregistered signal with destroy), 6 new buildPanelToggles tests for plugin panel helpers.
- **Files Changed**: `src/plugin/PluginRegistry.ts`, `src/services/tabContent/buildPanelToggles.ts`, `src/services/tabContent/index.ts`, `src/AppControlRegistry.ts`, `src/App.ts`, and their test files

## Issue #18: Plugin exporters can be registered but the export flow never consults them

- **Severity**: Medium
- **Area**: Plugin system, export pipeline
- **Root Cause**: `registerExporter()` stored exporters in the registry, but the production export flow (`ExportControl` → `AppPlaybackWiring` → built-in handlers) never called `getExporter()` or `getExporters()`.
- **Fix**: Added `exporterRegistered` signal for reactive discovery, `console.warn` on registration noting exporters aren't yet consulted, and TODO(#18) documenting what's needed. Existing API unchanged.
- **TODO(#18) Resolved**: Plugin exporters now appear in the export dropdown. `ExportControl` gained `addPluginExporter()`/`removePluginExporter()` methods with a "Plugin Exporters" section. `AppPlaybackWiring` seeds existing exporters on init, subscribes to `exporterRegistered`/`exporterUnregistered` signals for dynamic updates, and handles `pluginExportRequested` with blob/text export dispatch and download. Added `exporterUnregistered` signal to `PluginRegistry`. Removed console.warn and TODO comments.
- **Regression Tests**: PREG-049 (updated: no warn), PREG-051 (new: unregistered signal), EXPORT-PLG01 through PLG11 (11 new), PW-PLG01 through PLG05 (5 new).
- **Files Changed**: `src/ui/components/ExportControl.ts`, `src/plugin/PluginRegistry.ts`, `src/AppPlaybackWiring.ts`, `src/App.ts`, and their test files

## Issue #16: CacheManagementPanel is fully implemented but has no production wiring

- **Severity**: Low
- **Area**: Components, cache UI
- **Root Cause**: Complete cache management UI exists but has no mount path — users cannot open it.
- **Fix**: Added TODO(#16) JSDoc, static `NOT_WIRED_MESSAGE`, and `console.info` in constructor documenting the orphaned status and what's needed to wire it in.
- **TODO(#16) Resolved**: Wired CacheManagementPanel into the production layout. Added `cacheManager` to control creation pipeline (`createPanelControls` → `AppControlRegistry` → `App.ts`). Panel element mounted in viewer container via `LayoutOrchestrator`. Added "Media Cache" toggle button in `buildPanelToggles` with active state tracking. Removed `NOT_WIRED_MESSAGE`, constructor `console.info`, and TODO comments. Panel is nullable (gracefully absent when OPFS unavailable).
- **Regression Tests**: 4 CacheManagementPanel tests (updated), 4 buildPanelToggles tests pass.
- **Files Changed**: `src/services/controls/createPanelControls.ts`, `src/services/controls/ControlGroups.ts`, `src/AppControlRegistry.ts`, `src/App.ts`, `src/services/LayoutOrchestrator.ts`, `src/services/tabContent/buildPanelToggles.ts`, `src/ui/components/CacheManagementPanel.ts`, `src/ui/components/CacheManagementPanel.test.ts`

## Issue #19: The async render-worker path silently drops file/look/display LUT stages

- **Severity**: High
- **Area**: Rendering, async worker path, color pipeline
- **Root Cause**: `RenderWorkerProxy.setFileLUT()`, `setLookLUT()`, `setDisplayLUT()` were silent no-ops — the worker sync protocol only carries a single `lut` field, so multi-point LUT pipeline stages were silently dropped.
- **Fix**: Replaced silent no-ops with `console.warn` when non-null data is passed (silent on null/clear). Added `supportsMultiPointLUT()` returning `false` for capability checking. Added TODO(#19) comments documenting the worker serialization gap.
- **TODO(#19) Resolved**: Extended `RendererSyncState` with batched `lookLUT`, `fileLUT`, and `displayLUT` payloads (including optional domain min/max), updated `RenderWorkerProxy` to serialize and transfer all four LUT stages, and taught `renderWorker.worker` to apply them via `Renderer.setLookLUT()`, `setFileLUT()`, and `setDisplayLUT()`. `supportsMultiPointLUT()` now returns `true`. Legacy `setLUT()` remains supported as the deprecated look-LUT alias.
- **Regression Tests**: Added/updated tests across 3 files:
  - `RenderWorkerProxy.test.ts`: RWP-LUT-001 through RWP-LUT-007 now verify capability reporting, sync payload contents for file/look/display LUTs, legacy look-LUT precedence, and clear/null payload behavior without warnings
  - `renderWorker.worker.test.ts`: RW-028 through RW-031 verify sync-state application into renderer `setLookLUT()`/`setFileLUT()`/`setDisplayLUT()` and look-vs-legacy precedence
  - `renderWorker.messages.test.ts`: updated full `RendererSyncState` fixture to include the new LUT stage fields
- **Verification**: TypeScript clean. `RenderWorkerProxy.test.ts` (81 tests), `renderWorker.worker.test.ts` (31 tests), and `renderWorker.messages.test.ts` (32 tests) pass.
- **Files Changed**: `src/render/RenderWorkerProxy.ts`, `src/render/RenderWorkerProxy.test.ts`, `src/render/renderWorker.messages.ts`, `src/render/renderWorker.messages.test.ts`, `src/workers/renderWorker.worker.ts`, `src/workers/renderWorker.worker.test.ts`

## Issue #27: Custom LUT persistence is effectively broken for project/snapshot/auto-save workflows

- **Severity**: Medium
- **Area**: Persistence, LUT pipeline
- **Root Cause**: Serializer stored LUT title but restore only applied intensity — the LUT binary was silently lost with a vague warning.
- **Fix**: Improved warning message to be actionable: names the specific LUT, includes non-default intensity value, confirms intensity setting was preserved. Existing `lutPath` serialization and `lutIntensity` restoration were already correct.
- **Regression Tests**: SER-011-LUT-001 through 005 (title preserved, no warning without LUT, warning with/without intensity note, intensity restored even without binary).
- **Verification**: All 40 SessionSerializer tests pass, TypeScript clean.
- **Files Changed**: `src/core/session/SessionSerializer.ts`, `src/core/session/SessionSerializer.test.ts`

## Issue #28: The OPFS media cache is initialized but never populated by the active media-loading stack

- **Severity**: Medium
- **Area**: Caching, media persistence
- **Root Cause**: `MediaCacheManager` was initialized in `App.ts` and the restore path read from it, but `SessionMedia` (the active file-loading stack) never wrote into it — the cache was permanently empty.
- **Fix**: Added `setCacheManager()` to `SessionMedia`, wired from `App.ts`. Added `cacheFileInBackground()` (fire-and-forget with error handling) at the end of `loadImageFile()`, `loadEXRFile()`, and `loadVideoFile()`. Sets `source.opfsCacheKey` for serialization. Clears reference on `dispose()`.
- **Regression Tests**: SM-078 through SM-083 (setCacheManager, dispose, successful caching, no-op without manager, key failure handling, put failure handling).
- **Verification**: All 83 SessionMedia tests pass, TypeScript clean.
- **Files Changed**: `src/core/session/SessionMedia.ts`, `src/App.ts`, `src/core/session/SessionMedia.test.ts`

## Issue #25: Project, snapshot, and auto-save persistence omit major live viewer state

- **Severity**: High
- **Area**: Persistence, project save/load, auto-save, snapshots
- **Root Cause**: `SessionSerializer.toJSON()` only saved a narrow subset of viewer state. OCIO, display profile, gamut mapping, tone mapping, ghost frames, stereo, channel isolation, compare state, color inversion, curves, stereo eye transforms, and stereo align mode were all omitted silently.
- **Fix**: Added `getSerializationGaps()` documenting 13 viewer states not persisted, with `isActive` detection for each. `toJSON()` emits `console.warn` listing active gaps at save time. `fromJSON()` includes gap documentation in warnings. Added TODO block documenting all gaps. 2 additional states (premult mode, HDR output mode) noted as lacking viewer getters.
- **Regression Tests**: SER-GAP-001 through SER-GAP-016 (all 13 gaps returned, all-inactive detection, individual active detection for each gap), SER-GAP-020/021 (toJSON warning behavior), SER-GAP-030 (fromJSON gap documentation).
- **Verification**: All 59 SessionSerializer tests pass, TypeScript clean.
- **Files Changed**: `src/core/session/SessionSerializer.ts`, `src/core/session/SessionSerializer.test.ts`

## Issue #26: Restore paths leave control UI out of sync with restored state

- **Severity**: High
- **Area**: Persistence UI, restore flows
- **Root Cause**: Project load synced no controls, snapshot/auto-save synced only a subset. `CompareControl` (wipe mode/position) and `StackControl` (layers) were never resynced after restore.
- **Fix**: Created centralized `syncControlsFromState()` in `AppPersistenceManager` covering all controls (color, CDL, filters, transform, crop, lens, noise reduction, watermark, wipe/compare, stack). Called from all 3 restore paths. Added `setLayers()` and `clearLayers()` to `StackControl`. Controls are optional (graceful without them).
- **Regression Tests**: APM-100 through APM-106 (project load wipe sync, stack sync, empty stack clearing, auto-save sync, full control verification, graceful without optional controls, no-wipe edge case).
- **Verification**: All 45 persistence + 77 StackControl tests pass, TypeScript clean.
- **Files Changed**: `src/AppPersistenceManager.ts`, `src/ui/components/StackControl.ts`, `src/AppPersistenceManager.test.ts`

## Issue #29: External presentation windows never render the viewer and ignore most synced state

- **Severity**: High
- **Area**: External presentation, multi-window review
- **Root Cause**: The child presentation window's inline script only handled `ping` and `syncFrame` messages. `syncPlayback` and `syncColor` messages sent by `App.ts` were silently dropped.
- **Fix**: Extended `generatePresentationHTML()` inline script to handle all three sync message types: `syncFrame`, `syncPlayback` (tracks playing/paused state, rate, frame), and `syncColor` (stores exposure, gamma, temperature, tint with `console.warn` explaining color pipeline can't be visually applied without WebGL). Added `updateInfoDisplay()` for combined status rendering. Added `default` case that warns on truly unknown message types.
- **Regression Tests**: EP-HTML-MSG-001 through EP-HTML-MSG-005 (HTML contains handlers for all sync types, color pipeline warning, no silent drops), EP-SYNC-001/002 (event forwarding), EP-ISO-001/002 (session isolation), EP-LIFE-001 through EP-LIFE-003 (window lifecycle), EP-EDGE-001 through EP-EDGE-011 (edge cases: pre-init calls, empty/partial fields, rapid sequences, unknown messages, double dispose), EP-HTML-BEH-001 through EP-HTML-BEH-004 (display behavior verification).
- **Verification**: All 53 ExternalPresentation tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/ExternalPresentation.ts`, `src/ui/components/ExternalPresentation.test.ts`

## Issue #30: The app still wires a legacy `AudioMixer` pipeline alongside `SessionPlayback`'s `AudioCoordinator`

- **Severity**: High
- **Area**: Audio architecture, playback wiring
- **Root Cause**: `AudioOrchestrator` (legacy) and `SessionPlayback`'s `AudioCoordinator` (modern) both active simultaneously. `AudioOrchestrator.onSourceLoaded()` fetched/decoded video audio independently, causing double decoding. Volume/mute state could diverge between the two paths.
- **Fix**: Added `sessionAudioActive` dependency to `AudioOrchestrator` (supports boolean or function for lazy evaluation). When session audio is active, `onSourceLoaded()` skips fetch/decode entirely. Added `console.warn` (fires once) when dual-pipeline condition detected. Added `@deprecated` JSDoc and `TODO(audio-cleanup)` markers. App.ts passes `sessionAudioActive: () => this.session.audioPlaybackManager?.isUsingWebAudio ?? false`.
- **Regression Tests**: AO-020 through AO-034 — `isSessionAudioActive` default/boolean/function modes, `setSessionAudioActive` runtime updates, decode skip when session audio active, normal decode when inactive, dual-pipeline warning fires once, dynamic function transitions, deprecation markers, volume/mute interface contract, decode resume after deactivation, negative warning path, empty URL edge case, playback handler independence.
- **Verification**: All 35 AudioOrchestrator tests pass, TypeScript clean.
- **Files Changed**: `src/services/AudioOrchestrator.ts`, `src/App.ts`, `src/services/AudioOrchestrator.test.ts`

## Issue #31: Network "View (Pan/Zoom)" sync is only half wired and does not send local view changes

- **Severity**: High
- **Area**: Network sync, collaboration, view state
- **Root Cause**: (1) `sendViewSync()` had no production caller — outgoing view changes were never transmitted. (2) The receive side only applied `viewer.setZoom(payload.zoom)`, ignoring `panX`, `panY`, and `channelMode`.
- **Fix**: Added `notifyViewChanged()` callback to `TransformManager`, wired to all pan/zoom setters (`panX`, `panY`, `zoom`, `setPan`, `setZoom`, `smoothZoomTo`). `Viewer` exposes `setOnViewChanged()`. `AppNetworkBridge` outgoing: wires callback → `sendViewSync()` with 100ms throttle and `isApplyingRemoteState` feedback loop guard. Incoming: extends `syncView` to apply pan (`setPan`), zoom (`setZoom`), and channelMode (`setChannelMode`). Domain expert review caught missing `notifyViewChanged()` in `zoom` setter — fixed.
- **Regression Tests**: ANB-130 through ANB-141 (incoming full payload, remote apply guard, outgoing trigger, feedback loop protection, not-connected guard, dispose cleanup, throttle behavior, dispose cancels throttle), ANB-136 through ANB-138 (partial payload, zero values, error resilience), TM onViewChanged tests (zoom/panX/panY/setPan/setZoom setters fire callback, null callback, dispose clears, smoothZoomTo, fitToWindow exclusion).
- **Verification**: All 113 tests pass (59 TransformManager + 54 AppNetworkBridge), TypeScript clean.
- **Files Changed**: `src/ui/components/TransformManager.ts`, `src/ui/components/Viewer.ts`, `src/AppNetworkBridge.ts`, `src/AppNetworkBridge.test.ts`, `src/ui/components/TransformManager.test.ts`

## Issue #32: Initial network state transfer omits the host's current color adjustments

- **Severity**: Medium
- **Area**: Network sync, initial join state
- **Root Cause**: `sessionStateRequested` handler sent session state (frame, source, range, OCIO, transform) plus annotations and notes, but never sent color adjustments. Joiners only received color state when the host changed controls after the join.
- **Fix**: Added `sendColorSync` call at the end of the `sessionStateRequested` handler, after the session state response. Restructured encrypted/unencrypted branching so color sync fires in both paths (only skipped on encryption failure). Color payload reads current viewer state (exposure, gamma, contrast, saturation, temperature, tint, brightness).
- **Regression Tests**: ANB-126 (sessionStateRequested triggers sendColorSync), ANB-127 (payload matches non-default viewer state), ANB-128 (color sent even without prior adjustmentsChanged events), ANB-129 (fires after encrypted state), ANB-129b (not sent on encryption failure).
- **Verification**: All 59 AppNetworkBridge tests pass, TypeScript clean.
- **Files Changed**: `src/AppNetworkBridge.ts`, `src/AppNetworkBridge.test.ts`

## Issue #33: The multi-source layout UI cannot actually add the current source and offers no way to reassign tile sources

- **Severity**: High
- **Area**: View UI, multi-source layout control
- **Root Cause**: "Add current source" button hardcoded source index 0. Tile rows only rendered a label and remove button — no source reassignment UI. No production wiring informed the control of the active source.
- **Fix**: Added `_currentSourceIndex`/`_sourceCount` tracking to `MultiSourceLayoutControl` with public setters. Fixed "Add current source" to use actual current index. Added `<select>` dropdown (with `aria-label`) to each tile row for source reassignment, calling `manager.setTileSourceIndex()`. Added `setTileSourceIndex()` to `MultiSourceLayoutStore` and `MultiSourceLayoutManager`. Wired from `AppViewWiring.ts` to update source count and current index on `sourceLoaded`. Domain review fixed: label change detection in store, aria-label on select, production wiring.
- **Regression Tests**: MSL-U010 through MSL-U090 (current index tracking, source count, add uses actual index, selector rendering/reflection/change, store setTileSourceIndex with label/events/invalid ID/label-only change/no-change, manager delegation, max capacity, tile removal, selector refresh, aria-label), VW-030/031 (AppViewWiring source tracking).
- **Verification**: All 52 tests pass (28 MultiSourceLayoutControl + 24 AppViewWiring), TypeScript clean.
- **Files Changed**: `src/ui/components/MultiSourceLayoutControl.ts`, `src/ui/multisource/MultiSourceLayoutStore.ts`, `src/ui/multisource/MultiSourceLayoutManager.ts`, `src/AppViewWiring.ts`, `src/ui/components/MultiSourceLayoutControl.test.ts`, `src/AppViewWiring.test.ts`

## Issue #34: Several toolbar toggle buttons drift out of sync with the actual panel visibility state

- **Severity**: Medium
- **Area**: Toolbar UI, panel toggles, active-state feedback
- **Root Cause**: Panel.ts had no visibility change notification mechanism. Buttons only updated active styling inside click handlers, so outside-click and Escape closes left buttons visually "on".
- **Fix**: Added `onVisibilityChange(listener)` to `Panel.ts` (called from `show()`, `hide()`, covering toggle/outside-click/Escape/dispose). Subscribed all 5 affected buttons (Denoise, Watermark, Slate in `buildEffectsTab`; timeline-editor in `buildViewTab`; Conform in `buildPanelToggles`) to their panel's visibility. Removed inline active-state updates from click handlers. Review fixed: missing `addUnsubscriber` wiring in `buildEffectsTab` and `AppControlRegistry`.
- **Regression Tests**: PANEL-U059/059a/059b (Panel onVisibilityChange: show/hide/Escape/outside-click/unsubscribe/toggle), buildEffectsTab tests (Denoise/Watermark/Slate toggle-on/off/Escape/outside-click, unsubscriber count, unsubscribe stops updates), buildViewTab tests (timeline-editor all close paths), buildPanelToggles tests (Conform all close paths).
- **Verification**: All 81 tests pass (58 Panel + 14 Effects + 5 View + 4 PanelToggles), TypeScript clean.
- **Files Changed**: `src/ui/components/shared/Panel.ts`, `src/services/tabContent/buildEffectsTab.ts`, `src/services/tabContent/buildViewTab.ts`, `src/services/tabContent/buildPanelToggles.ts`, `src/AppControlRegistry.ts`, + corresponding test files

## Issue #35: QC pixel-picking tools use the wrong coordinate model for transformed or letterboxed viewer states

- **Severity**: High
- **Area**: QC UI, HSL eyedropper, stereo convergence measurement
- **Root Cause**: HSL eyedropper and stereo convergence used `querySelector('canvas')` + `clientWidth/clientHeight` scaling for coordinate mapping. This is wrong because the viewer stacks multiple canvases, and the scaling doesn't account for zoom, pan, or letterboxing. The app already had a correct coordinate conversion in `PixelSamplingManager`.
- **Fix**: Added public `getPixelCoordinatesFromClient(clientX, clientY)` to `Viewer.ts`, using `getImageCanvasRect()` and the existing `getPixelCoordinates()` utility (same approach as PixelSamplingManager). Replaced naive coordinate mapping in `buildQCTab.ts` (HSL eyedropper) and `AppViewWiring.ts` (stereo convergence) with the new method. Removed all `querySelector('canvas')` coordinate patterns. No remaining instances of naive pattern in codebase.
- **Regression Tests**: QC-EYE-001 through QC-EYE-006 (correct delegation, out-of-bounds null, zoom, pan, no querySelector regression, image boundary rejection), VW-CONV-001 through VW-CONV-004 (correct delegation, out-of-bounds, zoom, pan).
- **Verification**: All 34 tests pass (6 QC + 28 AppViewWiring), TypeScript clean.
- **Files Changed**: `src/ui/components/Viewer.ts`, `src/services/tabContent/buildQCTab.ts`, `src/AppViewWiring.ts`, `src/services/tabContent/buildQCTab.test.ts` (new), `src/AppViewWiring.test.ts`

## Issue #36: The 360-view toolbar button can lie about the current spherical-projection state

- **Severity**: Medium
- **Area**: View UI, spherical projection
- **Root Cause**: The 360 View button only updated active styling inside its click handler. `LayoutOrchestrator` auto-enables/disables spherical projection on source load, but the button had no subscription to state changes.
- **Fix**: Added `onEnabledChange(listener)` callback to `SphericalProjection.ts` with idempotent guards (no duplicate notifications). Subscribed the button in `buildViewTab.ts` via the callback, removed inline active-state from click handler. Cleanup via `addUnsubscriber`.
- **Regression Tests**: buildViewTab tests (external enable activates button, external disable deactivates, manual click toggle), SP-CLS-027 through SP-CLS-033 (enable/disable idempotency, listener fires on enable/disable, unsubscribe, multiple listeners).
- **Verification**: All 76 tests pass (68 SphericalProjection + 8 buildViewTab), TypeScript clean.
- **Files Changed**: `src/render/SphericalProjection.ts`, `src/services/tabContent/buildViewTab.ts`, `src/services/LayoutOrchestrator.ts`, `src/render/SphericalProjection.test.ts`, `src/services/tabContent/buildViewTab.test.ts`

## Issue #37: Floating-window QC status can remain stale after switching sources

- **Severity**: Medium
- **Area**: View UI, stereo QC feedback
- **Root Cause**: `FloatingWindowControl.clearResult()` was only called when stereo was turned off (`AppControlRegistry`). No clear-on-source-change path existed, so violation indicators persisted across source switches.
- **Fix**: Added `currentSourceChanged` event to `SessionMedia`/`Session` (guarded: only fires when index actually changes, not for same-index or out-of-range). Wired `clearResult()` call in `AppViewWiring` on source change. Existing stereo-off clear path preserved.
- **Regression Tests**: SM-028b/c/d (event fires on change, suppressed for same-index, suppressed for out-of-range), VW-FW-001 through VW-FW-004 (clear on source change with/without result, multiple changes, stereo-off independence).
- **Verification**: All 118 tests pass (86 SessionMedia + 32 AppViewWiring), TypeScript clean.
- **Files Changed**: `src/core/session/SessionMedia.ts`, `src/core/session/SessionTypes.ts`, `src/core/session/Session.ts`, `src/AppViewWiring.ts`, `src/core/session/SessionMedia.test.ts`, `src/AppViewWiring.test.ts`

## Issue #38: The Compare dropdown exposes a `Quad View` mode that is not wired to the viewer

- **Severity**: High
- **Area**: Compare UI, viewer integration
- **Root Cause**: CompareControl emitted `quadViewChanged` events, but no production wiring in AppViewWiring subscribed to them. The viewer never received quad-view state changes, so the UI silently pretended the mode was active.
- **Fix**: Added `quadViewChanged` subscription in `AppViewWiring.ts` with `console.warn` when enabled (explaining the rendering pipeline gap). Added "preview" badge with tooltip to the Quad View section header in `CompareControl.ts`. Added mutual exclusion between quad view and layout mode (consistent with wipe, diff matte, and blend modes).
- **Regression Tests**: VW-QUAD-001 through VW-QUAD-006 (warning on enable, no warning on disable, layout mutual exclusion in both directions, negative cases), QUAD-057/058/059 (preview badge presence, tooltip content, other compare modes unaffected).
- **Verification**: All 188 tests pass (38 AppViewWiring + 150 CompareControl), TypeScript clean.
- **Files Changed**: `src/AppViewWiring.ts`, `src/ui/components/CompareControl.ts`, `src/AppViewWiring.test.ts`, `src/ui/components/CompareControl.test.ts`

## Issue #39: Quad-view source selectors expose C and D concepts that production UI never lets the user bind to real sources

- **Severity**: High
- **Area**: Compare UI, source assignment semantics
- **Root Cause**: Quad-view UI let users assign quadrants to A/B/C/D, but only A and B had production assignment paths via `SessionPlayback`. `setSourceC()`/`setSourceD()` existed only in the low-level `ABCompareManager` with no production callers.
- **Fix**: Disabled C/D options in quad-view dropdown selectors with "(not available)" labels and tooltip explanations. Added warning styling (opacity 0.5, warning border color) for quadrants assigned to C/D. Added `console.warn` when C/D is selected via `setQuadViewSource`. A/B selections unaffected.
- **Regression Tests**: QUAD-060 through QUAD-070 (C/D console.warn, A/B no-warn, A/B still works, C/D disabled in DOM, warning opacity, warning border color, warning tooltip, styling updates on source change, warning is UI-layer only).
- **Verification**: All 51 QuadView tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/CompareControl.ts`, `src/ui/components/QuadView.test.ts`

## Issue #40: Several advanced dropdowns and panels can render partly off-screen on narrow viewports

- **Severity**: Medium
- **Area**: UI layout, small-window/mobile usability
- **Root Cause**: `DisplayProfileControl`, `ToneMappingControl`, `StereoControl`, and `OCIOControl` positioned dropdowns at `rect.left` with no viewport clamping (or insufficient clamping in OCIO's case). `CompareControl` already had the correct pattern.
- **Fix**: Applied CompareControl's clamping pattern to all 4 controls: below-first with above-flip, `viewportPadding = 8`, right-edge clamp (`innerWidth - dropdownWidth - 8`), left-edge clamp (`>= 8`), top clamp (`>= 8`).
- **Regression Tests**: DropdownViewportClamping.test.ts — 12 tests (3 per control: right-edge clamping, left-edge clamping, no-clamping-when-wide-enough).
- **Verification**: All 12 clamping tests + 399 existing control tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/DisplayProfileControl.ts`, `src/ui/components/ToneMappingControl.ts`, `src/ui/components/StereoControl.ts`, `src/ui/components/OCIOControl.ts`, `src/ui/components/DropdownViewportClamping.test.ts` (new)

## Issue #41: The tone-mapping shortcut can toggle a hidden flag without actually enabling tone mapping

- **Severity**: Medium
- **Area**: Effects UI, keyboard semantics
- **Root Cause**: `toggle()` only flipped the `enabled` flag. Default state had `operator: 'off'`, and `isEnabled()` requires both `enabled && operator !== 'off'`. So the shortcut set `enabled=true` without visible effect.
- **Fix**: When `toggle()` enables and `operator === 'off'`, auto-selects `'reinhard'` (first non-off operator from `TONE_MAPPING_OPERATORS`). Updates operator buttons and parameter visibility before enabling. Toggling off preserves operator for re-enable.
- **Regression Tests**: TONE-U072 through TONE-U077 (fresh state selects reinhard, off preserves operator, re-enable restores operator, non-off operator unchanged, isEnabled() returns true, keyboard shortcut exercises full path).
- **Verification**: All 112 ToneMappingControl tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/ToneMappingControl.ts`, `src/ui/components/ToneMappingControl.test.ts`

## Issue #42: The Snapshot panel tells users to create snapshots but does not offer any create action on that surface

- **Severity**: Medium
- **Area**: Snapshot UI, empty-state usefulness
- **Root Cause**: Snapshot panel's empty state said "Create a snapshot to save your session state" but had no create button. The create action only existed as a keyboard shortcut (`Ctrl+Shift+S`).
- **Fix**: Added "Create Snapshot" button in the panel footer (before "Clear All"), emitting `createRequested` event. Wired in `AppPlaybackWiring.ts` to call `persistenceManager.createQuickSnapshot()`. Updated empty-state text to include the `Ctrl+Shift+S` shortcut hint.
- **Regression Tests**: SNAP-080 (button exists), SNAP-081 (click emits createRequested), SNAP-082 (shortcut hint in empty state), PW-016 (production wiring calls createQuickSnapshot), PW-017 (existing restoreRequested wiring).
- **Verification**: All 80 tests pass (41 SnapshotPanel + 39 AppPlaybackWiring), TypeScript clean.
- **Files Changed**: `src/ui/components/SnapshotPanel.ts`, `src/AppPlaybackWiring.ts`, `src/ui/components/SnapshotPanel.test.ts`, `src/AppPlaybackWiring.test.ts`

## Issue #43: The volume popout is too narrow to cleanly fit both the slider and the audio-scrub toggle

- **Severity**: Medium
- **Area**: Header UI, audio controls
- **Root Cause**: Popout container hardcapped at `96px` width. Slider consumed 80px + 16px margin, leaving the scrub checkbox/label cramped or clipped by `overflow: hidden`.
- **Fix**: Widened popout from `96px` to `160px` in both hover and pinned-open paths. 160px accommodates slider (96px) + scrub checkbox (16px) + "Scrub" label (~30px) + padding.
- **Regression Tests**: VOL-043a (expanded width >= 140px), VOL-043b (scrub checkbox present and clickable), VOL-043c (label has nowrap), VOL-043d (hover uses wider width).
- **Verification**: All 29 VolumeControl tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/VolumeControl.ts`, `src/ui/components/VolumeControl.test.ts`

## Issue #44: Network Sync hardcodes participant names and never exposes the user name the rest of the app supports

- **Severity**: Medium
- **Area**: Collaboration UI, session identity
- **Root Cause**: `NetworkControl` hardcoded `'User'` and `'Host'` in all three `createRoom`/`joinRoom` emission points, ignoring `PreferencesManager.getGeneralPrefs().userName`.
- **Fix**: Added `getUserName(fallback)` method that reads from `getCorePreferencesManager().getGeneralPrefs()`, falling back to the provided default if name is empty/whitespace or prefs unavailable. Replaced all 3 hardcoded strings with `getUserName('Host')`/`getUserName('User')`.
- **Regression Tests**: NCC-090 through NCC-095 (custom name in createRoom/joinRoom/auto-join, fallback to Host/User when empty, whitespace-only fallback).
- **Verification**: All 42 NetworkControl tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/NetworkControl.ts`, `src/ui/components/NetworkControl.test.ts`

## Issue #45: Closing HSL Qualifier can leave the eyedropper armed and the viewer in a hidden pick state

- **Severity**: Medium
- **Area**: QC UI, HSL Qualifier workflow
- **Root Cause**: Eyedropper callback only fired on explicit button toggle. Panel close paths (toggle close, outside click, dispose) hid the panel but never deactivated the eyedropper or called the callback with `false`, leaving the viewer click handler and crosshair cursor armed.
- **Fix**: Added `deactivateEyedropper()` calls to all close paths: `toggleDropdown()` close, `handleOutsideClick` close, and `dispose()`. Modified `deactivateEyedropper()` to call `onEyedropperCallback(false)` when the eyedropper was active, so the QC tab wiring properly removes the viewer click handler. No-ops when eyedropper is already inactive (no spurious notifications).
- **Regression Tests**: HSL-U070 through HSL-U076 (toggle close deactivates, callback fires on toggle close, outside click deactivates, callback fires on outside click, button style reset, no spurious callback when inactive, dispose cleanup).
- **Verification**: All 37 HSLQualifierControl tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/HSLQualifierControl.ts`, `src/ui/components/HSLQualifierControl.test.ts`

## Issue #46: Playlist OTIO export produces clips with empty media references

- **Severity**: Medium
- **Area**: Playlist UI, interchange/export usefulness
- **Root Cause**: `exportOTIO()` mapped every clip to `sourceUrl: ''`. No mechanism to resolve clip source indices to actual URLs.
- **Fix**: Added `sourceUrlResolver` callback to `PlaylistPanel` (settable via `setSourceUrlResolver()`). `exportOTIO()` now resolves each clip's `sourceIndex` to a URL, falls back to `clip.sourceName` if resolver returns null or is unconfigured, and emits `console.warn` when resolver returns null. Wired in `createPanelControls.ts` using `session.allSources` lookup.
- **Regression Tests**: PL-080 (resolver API), E2E-OTIO-070 through E2E-OTIO-074 (resolver provides URLs, no resolver fallback, null resolver fallback, URL preservation through serialization, round-trip).
- **Verification**: All 47 tests pass (21 PlaylistPanel + 26 OTIOWriter), TypeScript clean.
- **Files Changed**: `src/ui/components/PlaylistPanel.ts`, `src/services/controls/createPanelControls.ts`, `src/ui/components/PlaylistPanel.test.ts`, `src/__e2e__/OTIOWriter.e2e.test.ts`

## Issue #47: ShotGrid versions with frame-sequence paths are shown but cannot actually be loaded from the panel

- **Severity**: Medium
- **Area**: ShotGrid integration UI, media loading
- **Root Cause**: `resolveMediaUrl()` only accepted uploaded movie URLs or HTTP movie paths. Versions with only `sg_path_to_frames` got `null` mediaUrl, disabling the Load button. The bridge silently ignored null URLs.
- **Fix**: Extended `resolveMediaUrl()` to fall back to `version.sg_path_to_frames` when no movie URL exists. Load button now enabled for frame-sequence-only versions. Bridge detects frame-sequence paths and logs `console.info`. Priority order preserved: uploaded movie > HTTP movie path > frame path. Versions with nothing remain disabled.
- **Regression Tests**: SG-PNL-020 through SG-PNL-025 (frame path resolution, Load button enabled, click emits URL, no-media disabled, priority order), SG-INT-013/014 (bridge frame path handling, no log for regular URLs).
- **Verification**: All 39 tests pass (25 ShotGridPanel + 14 Bridge), TypeScript clean.
- **Files Changed**: `src/ui/components/ShotGridPanel.ts`, `src/integrations/ShotGridIntegrationBridge.ts`, `src/ui/components/ShotGridPanel.test.ts`, `src/integrations/ShotGridIntegrationBridge.test.ts`

## Issue #48: History can be cleared in one click with no confirmation, unlike other destructive review panels

- **Severity**: Low
- **Area**: History UI, destructive action safety
- **Root Cause**: `clearHistory()` immediately called `historyManager.clear()` with no confirmation, unlike MarkerListPanel and SnapshotPanel which both use `showConfirm()`.
- **Fix**: Made `clearHistory()` async, added `showConfirm()` dialog with entry count before clearing. Skips confirmation when history is already empty. Matches pattern used by MarkerListPanel and SnapshotPanel.
- **Regression Tests**: HP-035 (updated: confirm shown), HP-036 (clear shows confirmation), HP-037 (cancel does not clear), HP-038 (no confirm when empty).
- **Verification**: All 28 HistoryPanel tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/HistoryPanel.ts`, `src/ui/components/HistoryPanel.test.ts`

## Issue #49: Conform panel browse-based relinking is stubbed out in production

- **Severity**: Medium
- **Area**: Conform / Re-link UI, media recovery workflow
- **Root Cause**: Browse and Re-link by Folder buttons dispatched custom DOM events but no production code listened for them. Buttons appeared functional but did nothing.
- **Fix**: Added `console.warn` to both `browseForClip()` and `browseFolder()` explaining they require host integration listeners. Added tooltips to both buttons indicating host integration required. DOM events still dispatched after warning (preserving the integration contract).
- **Regression Tests**: CONFORM-015 through CONFORM-020 (Browse/Folder warn on click, DOM events still dispatched, tooltips present).
- **Verification**: All 41 ConformPanel tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/ConformPanel.ts`, `src/ui/components/ConformPanel.test.ts`

## Issue #50: Notes import silently replaces the entire local note set

- **Severity**: Medium
- **Area**: Notes UI, import safety
- **Root Cause**: `NotePanel` import action called `noteManager.fromSerializable()` directly, which clears all existing notes before inserting imported ones. No confirmation or warning.
- **Fix**: Added `showConfirm()` dialog before import when existing notes are present, stating how many notes will be replaced and how many will be imported. Uses `confirmVariant: 'danger'` with "Replace" button. Skips confirmation when no existing notes. Cancel aborts import.
- **Regression Tests**: 4 tests — confirmation shown with existing notes, replace on confirm, preserve on cancel, skip confirmation when empty.
- **Verification**: All 72 NotePanel tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/NotePanel.ts`, `src/ui/components/NotePanel.test.ts`

## Issue #51: The Notes panel badge exists in code and tests but is never attached to the real toolbar

- **Severity**: Low
- **Area**: Annotate UI, note awareness
- **Root Cause**: `NotePanel.createBadge()` was implemented and tested but never mounted in production. `buildAnnotateTab.ts` rendered the Notes button without attaching the badge.
- **Fix**: Added `notePanel.createBadge()` call in `buildAnnotateTab.ts` and appended the badge element to the Notes toggle button, following the same pattern used by `luminanceVisControl` badge in `buildQCTab.ts`.
- **Regression Tests**: 3 tests — `createBadge()` called during build, badge attached to button, badge is child of button.
- **Verification**: All 3 buildAnnotateTab tests pass, TypeScript clean.
- **Files Changed**: `src/services/tabContent/buildAnnotateTab.ts`, `src/services/tabContent/buildAnnotateTab.test.ts` (new)

## Issue #52: Client Mode hides almost none of the real UI because its restriction selectors do not match production DOM

- **Severity**: High
- **Area**: Review-safe UI mode, presentation locking
- **Root Cause**: `ClientMode.DEFAULT_RESTRICTED_ELEMENTS` used selectors like `[data-panel="color"]` and `[data-toolbar="editing"]` that no production DOM elements carry. `applyClientModeRestrictions()` silently matched nothing.
- **TODO(#52) Resolved**: `LayoutOrchestrator.createLayout()` now calls `tagClientModeElements()` before applying restrictions. That helper tags real production DOM with the selectors `ClientMode` already expects:
  - Tab buttons for `color`, `effects`, `transform`, `annotate` get `data-panel`
  - Context toolbar tab panels get matching `data-panel`
  - Paint toolbar gets `data-toolbar="paint"`
  - Notes, snapshots/history, and left-panel color tools get the expected `data-panel`
  - Context toolbar and tab bar get `data-toolbar="editing"` / `data-toolbar="annotation"`
  - The unmatched-selector `console.warn` remains as a regression guard instead of a temporary workaround
- **Regression Tests**: LayoutOrchestrator LO-039 through LO-043 verify DOM tagging for tab buttons, tab panels, toolbars, paint toolbar, and that client mode now hides tagged production elements. Existing LO-031 through LO-034 warning-path tests remain. `ClientMode.test.ts` still verifies the default selector set, and `ClientMode.e2e.test.ts` covers end-to-end restriction behavior.
- **Verification**: `LayoutOrchestrator.test.ts` (44 tests), `ClientMode.test.ts` (33 tests), and `ClientMode.e2e.test.ts` (39 tests) pass.
- **Files Changed**: `src/services/LayoutOrchestrator.ts`, `src/services/LayoutOrchestrator.test.ts`, `src/ui/components/ClientMode.ts`, `src/ui/components/ClientMode.test.ts`, `src/__e2e__/ClientMode.e2e.test.ts`

## Issue #53: The right inspector can reopen with stale or empty content because it drops updates while hidden

- **Severity**: Medium
- **Area**: Right panel UI, media/scopes awareness
- **Root Cause**: `RightPanelContent.updateInfo()` and `MiniHistogram.update()` both bailed out entirely when hidden, discarding data received during that time. Reopening showed stale or empty content.
- **Fix**: Both components now store received data while hidden (`pendingInfo` / `pendingRender` flag). Added `applyPending()` method to each that applies stored data when the panel becomes visible. Only the latest data is stored (not queued).
- **Regression Tests**: RP-009d/e/f (deferred info applied on reopen, no-op when nothing pending, only last deferred applied), MH-006f/g/h (histogram rendered on reopen, no-op without pending, no-op without data).
- **Verification**: All 57 tests pass (33 RightPanelContent + 24 MiniHistogram), TypeScript clean.
- **Files Changed**: `src/ui/layout/panels/RightPanelContent.ts`, `src/ui/layout/panels/MiniHistogram.ts`, `src/ui/layout/panels/RightPanelContent.test.ts`, `src/ui/layout/panels/MiniHistogram.test.ts`

## Issue #54: The multi-source layout button advertises an `L` shortcut that does not exist in production

- **Severity**: Medium
- **Area**: View toolbar, multi-source layout UI
- **Root Cause**: Button tooltip said `Layout modes (L)` but `KeyL` is bound to `playback.faster`, not layout modes. No layout-toggle binding exists.
- **Fix**: Changed tooltip from `'Layout modes (L)'` to `'Layout modes'`.
- **Regression Tests**: 1 test verifying tooltip doesn't contain a single-letter shortcut hint.
- **Verification**: All 38 tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/MultiSourceLayoutControl.ts`, `src/ui/components/__tests__/MultiSourceLayoutControl.test.ts`

## Issue #55: The volume control still tells users mute is on `M`, but production mute is on `Shift+M`

- **Severity**: Medium
- **Area**: Header audio UI, shortcut discoverability
- **Root Cause**: Mute button tooltip said `Toggle mute (M in video mode)` but actual binding is `Shift+M` (`audio.toggleMute` has `shift: true`).
- **Fix**: Changed tooltip to `Toggle mute (Shift+M in video mode)`.
- **Regression Tests**: VOL-103 (tooltip references Shift+M).
- **Verification**: All 30 VolumeControl tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/VolumeControl.ts`, `src/ui/components/VolumeControl.test.ts`

## Issue #56: Sequence export uses a one-off popup instead of the real export progress dialog

- **Severity**: Medium
- **Area**: Export UI consistency, long-running workflow feedback
- **Root Cause**: Frame-sequence export built its own bare `div` popup (60+ lines) with no modal backdrop, `role="dialog"`, keyboard handling, or focus management. Video export already used the proper `ExportProgressDialog` component.
- **Fix**: Replaced inline popup with `ExportProgressDialog`, matching video export's pattern: modal dialog with backdrop, `aria-modal`, progress updates via `updateProgress()`, cancel via event, proper cleanup in `finally` block.
- **Regression Tests**: PW-SE01 through PW-SE05 (uses ExportProgressDialog, progress forwarded, cancel sets token, cleanup on success, cleanup on error).
- **Verification**: All 44 AppPlaybackWiring tests pass, TypeScript clean.
- **Files Changed**: `src/AppPlaybackWiring.ts`, `src/AppPlaybackWiring.test.ts`

## Issue #57: The Help menu exposes "Custom Key Bindings", but production never surfaces the full shortcut editor with import/export

- **Severity**: Low
- **Area**: Help / customization UI
- **Root Cause**: `showCustomBindingsDialog()` renders a simple inline rebind table, while the full `ShortcutEditor` component with Reset All/Export/Import exists but isn't reachable.
- **Fix**: Added TODO(#57) comment and `console.info` in `showCustomBindingsDialog()` documenting the gap and referencing `ShortcutEditor`.
- **TODO(#57) Resolved**: Replaced the inline rebind table with the full `ShortcutEditor` component in `showCustomBindingsDialog()`. Modal now renders `ShortcutEditor` with Reset All, Export, and Import features. Deleted ~300 lines of dead code (`renderCustomBindingsContent`, `promptForKeyBinding`, `formatKeyCombo`). Editor is properly disposed on modal close.
- **Regression Tests**: 1 test verifying ShortcutEditor renders in modal (replaced old console.info test).
- **Files Changed**: `src/AppKeyboardHandler.ts`, `src/AppKeyboardHandler.test.ts`

## Issue #58: The app ships two different shortcut-reference UIs, and different entry points open different ones

- **Severity**: Low
- **Area**: Help / shortcut discoverability
- **Root Cause**: `?` opens `ShortcutCheatSheet` overlay; Help menu "Keyboard Shortcuts" opens `showShortcutsDialog()` — a separate hardcoded modal. Two UIs for the same purpose.
- **Fix**: Added TODO(#58) comment and `console.info` in `showShortcutsDialog()` documenting the duplication and referencing `ShortcutCheatSheet`.
- **TODO(#58) Resolved**: Deleted the entire `showShortcutsDialog()` method (~360 lines) and its `shouldShowShortcutAction()` helper from `AppKeyboardHandler`. Help menu "Keyboard Shortcuts" now opens `ShortcutCheatSheet.show()` instead, routed via `getShortcutCheatSheet` in `PlaybackWiringDeps`. Both `?` key and Help menu now use the same ShortcutCheatSheet overlay (which has search/filter from TODO(#113)).
- **Regression Tests**: PW-007 (updated: verifies cheatSheet.show() called), PW-007b (new: null safety). Removed ~12 tests for deleted modal.
- **Files Changed**: `src/AppPlaybackWiring.ts`, `src/App.ts`, `src/AppKeyboardHandler.ts`, `src/AppKeyboardHandler.test.ts`, `src/AppPlaybackWiring.test.ts`, `src/AppWiringFixes.test.ts`

## Issue #59: The main tab bar is marked up as a tablist but does not support arrow-key tab navigation

- **Severity**: Medium
- **Root Cause**: TabBar used `role="tablist"`/`role="tab"` but had no keydown handlers for arrow keys, Home, or End.
- **Fix**: Added keydown listener handling ArrowRight/Left (wrapping), Home, End. All activate tab and move focus per WAI-ARIA.
- **Regression Tests**: TAB-U080 through TAB-U087.
- **Verification**: All 48 TabBar tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/layout/TabBar.ts`, `src/ui/components/layout/TabBar.test.ts`

## Issue #60: The left inspector's "All Controls…" button can close the full color panel instead of opening it

- **Severity**: Medium
- **Fix**: Changed from `colorControls.toggle()` to `colorControls.show()` for one-way open.
- **Regression Tests**: LP-034.
- **Verification**: All 42 LeftPanelContent tests pass, TypeScript clean.
- **Files Changed**: `src/ui/layout/panels/LeftPanelContent.ts`, `src/ui/layout/panels/LeftPanelContent.test.ts`

## Issue #61: Several review panels still stack in the same top-right slot and can obscure each other

- **Severity**: Medium
- **Fix**: Added HistoryPanel to mutual exclusion group with NotePanel and MarkerListPanel. Changed single exclusive ref to array in all three panels. Wired three-way exclusion in `createPanelControls.ts`.
- **Regression Tests**: 6 tests across HistoryPanel/NotePanel/MarkerListPanel.
- **Verification**: All 196 affected tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/HistoryPanel.ts`, `src/ui/components/NotePanel.ts`, `src/ui/components/MarkerListPanel.ts`, `src/services/controls/createPanelControls.ts`, + test files

## Issue #62: The export button says "Export current frame", but clicking it only opens the menu

- **Severity**: Low
- **Fix**: Changed label from "Export current frame (Ctrl+S)" to "Export options (Ctrl+S)".
- **Regression Tests**: EXPORT-U016.
- **Verification**: All 51 ExportControl tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/ExportControl.ts`, `src/ui/components/ExportControl.test.ts`

## Issue #63: Side-panel tabs are marked up as tabs but do not behave like tabs

- **Severity**: Medium
- **Fix**: Added ArrowLeft/Right/Home/End keydown handlers to side-panel tab strips. Added roving `tabindex` (0 active, -1 inactive).
- **Regression Tests**: LM-026 through LM-029b (5 tests).
- **Files Changed**: `src/ui/layout/LayoutManager.ts`, `src/ui/layout/LayoutManager.test.ts`

## Issue #65: Inspector accordion headers are mouse-only despite gating most side-panel content

- **Severity**: Medium
- **Fix**: Added `tabindex="0"`, `role="button"`, `aria-expanded` to CollapsibleSection headers. Added Enter/Space keydown handler.
- **Regression Tests**: CS-023 through CS-030 (8 tests).
- **Files Changed**: `src/ui/layout/panels/CollapsibleSection.ts`, `src/ui/layout/panels/CollapsibleSection.test.ts`

## Issue #66: The right inspector's scope buttons never show which scopes are actually active

- **Severity**: Low
- **Fix**: Subscribed scope buttons to `scopesControl.on('stateChanged')`, updating background color and `aria-pressed`. Initial state applied from `getState()`. Cleanup in `dispose()`.
- **Regression Tests**: RP-016/017 (2 tests).
- **Files Changed**: `src/ui/layout/panels/RightPanelContent.ts`, `src/ui/layout/panels/RightPanelContent.test.ts`

## Issue #67: The header loop button advertises the wrong shortcut

- **Severity**: Low
- **Fix**: Changed tooltip from `Cycle loop mode (L)` to `Cycle loop mode (Ctrl+L)`.
- **Regression Tests**: HDR-U052.
- **Files Changed**: `src/ui/components/layout/HeaderBar.ts`, `src/ui/components/layout/HeaderBar.test.ts`

## Issue #69: The mini histogram promises to open the full histogram, but it actually toggles it

- **Severity**: Low
- **Fix**: Changed canvas title from `Click to open full Histogram` to `Click to toggle Histogram`.
- **Regression Tests**: MH-012.
- **Files Changed**: `src/ui/layout/panels/MiniHistogram.ts`, `src/ui/layout/panels/MiniHistogram.test.ts`

## Issue #64: Keyboard zone navigation skips the left and right inspector panels entirely

- **Severity**: Medium
- **Area**: Keyboard accessibility, layout navigation
- **Root Cause**: `LayoutOrchestrator` registered focus zones for header, tab bar, context toolbar, viewer, and timeline, but not for the left and right panel wrappers. Side panels with color/history/media-info controls were unreachable via F6-style zone navigation.
- **Fix**: Added `leftPanel` and `rightPanel` focus zones in `LayoutOrchestrator.createLayout()` using `layoutManager.getPanelWrapper('left'|'right')`. Each zone queries for interactive elements (`button:not([disabled]), input, [tabindex="0"]`) filtered by visibility. Added `getPanelWrapper()` to the `LayoutLayoutManager` interface.
- **Regression Tests**: LO-035 (zones registered), LO-036 (correct panel wrapper elements used).
- **Verification**: All 37 LayoutOrchestrator tests pass, TypeScript clean.
- **Files Changed**: `src/services/LayoutOrchestrator.ts`, `src/services/LayoutOrchestrator.test.ts`

## Issue #68: The Info panel is shipped as a simple on/off overlay even though its real customization features have no UI

- **Severity**: Low
- **Area**: Review overlays, feature reachability
- **Root Cause**: `InfoPanel` implements `setPosition()`, `setFields()`, and `toggleField()` for configurable display, but the only production UI affordance is a binary toggle button. Users cannot choose position or visible fields.
- **Fix**: Added TODO(#68) JSDoc on the class documenting the gap and recommending a settings popover. Added one-time `console.info` on first `enable()` call referencing the available customization API and issue #68.
- **TODO(#68) Resolved**: Added `InfoPanelSettingsMenu` — a right-click context menu on the InfoPanel toggle button with: position section (4 radio items: top-left/top-right/bottom-left/bottom-right) and fields section (7 toggle items: filename/resolution/frameInfo/timecode/duration/fps/colorAtCursor). Position selection closes menu; field toggles stay open for multi-toggle. Full ARIA support (menuitemradio/menuitemcheckbox). Dismiss on Escape/click-outside/blur. Removed TODO comment, console.info hint, and `hasLoggedCustomizationHint` flag.
- **Regression Tests**: INFO-U130/U131 (updated: expect 0 console.info), IPSM-U001 through IPSM-U032 (32 new: show/hide, positions, fields, dismiss, ARIA).
- **Files Changed**: `src/ui/components/InfoPanelSettingsMenu.ts` (new), `src/ui/components/InfoPanelSettingsMenu.test.ts` (new), `src/services/tabContent/buildPanelToggles.ts`, `src/ui/components/InfoPanel.ts`, `src/ui/components/InfoPanel.test.ts`

## Issue #70: The auto-save indicator is clickable for settings and retry, but it is not keyboard-focusable

- **Severity**: Medium
- **Area**: Header utility UI, keyboard accessibility
- **Root Cause**: `AutoSaveIndicator` root `div` had a click handler for retry/settings but no `tabindex`, `role`, or keyboard activation handling. Keyboard users could not focus or activate it.
- **Fix**: Added `tabindex="0"`, `role="button"`, `aria-label="Auto-save settings"` to the container. Added `keydown` handler for Enter/Space that calls `handleClick()`. Cleanup in `dispose()`.
- **Regression Tests**: AUTOSAVE-UI-050 through AUTOSAVE-UI-055 (6 tests — tabindex, role, aria-label, Enter activates, Space activates, other keys ignored).
- **Verification**: All 56 AutoSaveIndicator tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/AutoSaveIndicator.ts`, `src/ui/components/AutoSaveIndicator.test.ts`

## Issue #73: Several header menu buttons open popups without exposing expanded state

- **Severity**: Low
- **Area**: Header accessibility, menu truthfulness
- **Root Cause**: Sources, Help, and Speed buttons had `aria-haspopup="menu"` but never synced `aria-expanded`. The layout menu button correctly managed it, but the others did not.
- **Fix**: Added `aria-expanded="false"` on creation for Sources, Help, and Speed buttons. Set `aria-expanded="true"` when menus open and `"false"` when they close. Sources button syncs via `isVisible()` check after toggle.
- **Regression Tests**: HDR-U210 through HDR-U214 (5 tests — initial false for sources/help/speed, true when help menu opens, true when speed menu opens).
- **Verification**: All 150 HeaderBar tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/layout/HeaderBar.ts`, `src/ui/components/layout/HeaderBar.test.ts`

## Issue #71: The playback-speed control advertises a menu button, but default activation does not open its menu

- **Severity**: Medium
- **Area**: Playback header, control semantics
- **Root Cause**: Speed button declared `aria-haspopup="menu"` but its primary click action cycles speed, not opens a menu. The menu is only accessible via right-click or Shift+Enter.
- **Fix**: Removed `aria-haspopup="menu"` since primary activation is not a menu. Added `aria-description="Right-click or Shift+Enter for speed menu"` to document the secondary access method. Kept `aria-expanded` for the expandable popup.
- **Regression Tests**: HDR-U220 (no aria-haspopup), HDR-U221 (aria-description present).
- **Verification**: All 156 HeaderBar tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/layout/HeaderBar.ts`, `src/ui/components/layout/HeaderBar.test.ts`

## Issue #72: Notes and markers still rely on clickable text for key actions, leaving parts of review workflow mouse-only

- **Severity**: Medium
- **Area**: Notes/markers review panels, keyboard accessibility
- **Root Cause**: Frame labels (click-to-jump), note text (click-to-edit), and empty-note hints in MarkerListPanel and NotePanel were plain spans/divs with only click handlers — no tabindex, role, or keyboard activation.
- **Fix**: Added `tabindex="0"`, `role="button"`, appropriate `aria-label`, and Enter/Space keydown handler to each interactive text element in both panels.
- **Regression Tests**: MARK-U180 through MARK-U187 (8 tests), NOTE-U020 through NOTE-U026 (7 tests).
- **Verification**: All 80 NotePanel tests and MarkerListPanel tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/MarkerListPanel.ts`, `src/ui/components/NotePanel.ts`, + test files

## Issue #74: Custom header menus trap `Tab` back onto their trigger instead of letting focus continue

- **Severity**: Medium
- **Area**: Header keyboard navigation, accessibility
- **Root Cause**: Speed, help, and layout menus intercepted Tab with `preventDefault()` and forced focus back to anchor, preventing natural tab flow.
- **Fix**: Separated Tab from Escape handling in all three menus. Tab now closes the menu without `preventDefault()` or forcing focus, letting natural tab order continue. Escape still calls `preventDefault()` and returns focus to anchor.
- **Regression Tests**: HDR-U230 through HDR-U233 (4 tests — Tab does not preventDefault, Escape still does).
- **Verification**: All 156 HeaderBar tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/layout/HeaderBar.ts`, `src/ui/components/layout/HeaderBar.test.ts`

## Issue #75: Pixel Probe `Source` mode silently falls back to rendered values on the WebGL / HDR path

- **Severity**: High
- **Area**: QC tools, measurement correctness
- **Root Cause**: On the WebGL/HDR path, `PixelSamplingManager` always forwards displayed float pixels through `updateFromHDRValues()` without providing pre-grade source data. `PixelProbe` silently falls back to rendered values when `sourceImageData` is missing in source mode.
- **Fix**: Added fallback detection in `PixelProbe.updateFromCanvas()` and `updateFromHDRValues()` — when source mode is active but no source data exists, sets `isRenderedFallback` flag, logs `console.warn` once, and appends `" (rendered fallback)"` to coordinates label in `updateDisplay()`. Added `isSourceFallbackActive()` public method. Added TODO in `PixelSamplingManager` documenting the HDR source data pipeline gap.
- **Regression Tests**: FALLBACK-001 through FALLBACK-010 (10 tests).
- **Verification**: All 103 PixelProbe tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/PixelProbe.ts`, `src/ui/components/PixelSamplingManager.ts`, `src/ui/components/PixelProbe.test.ts`

## Issue #76: Viewer timecode overlay ignores source start-frame offsets, and exported frameburn inherits the wrong offset

- **Severity**: High
- **Area**: Viewer overlays, export correctness
- **Root Cause**: `syncCurrentSourceTimecodeOffsets()` in `App.ts` updated the goto-frame overlay and header timecode display but not the viewer's `TimecodeOverlay`. Since frameburn export reads from `timecodeOverlay.getStartFrame()`, exports inherited the wrong (default 0) offset.
- **Fix**: Added `this.viewer.getTimecodeOverlay().setStartFrame(startFrame)` to `syncCurrentSourceTimecodeOffsets()` so the viewer overlay receives the same offset.
- **Regression Tests**: TC-130 through TC-134 (5 tests — setStartFrame/getStartFrame round-trip, display with offset, default value, consistency for frameburn, multiple updates).
- **Verification**: All TimecodeOverlay tests pass, TypeScript clean.
- **Files Changed**: `src/App.ts`, `src/ui/components/TimecodeOverlay.test.ts`

## Issue #77: The viewer timecode overlay is effectively hidden from the shipped UI

- **Severity**: Medium
- **TODO(#77) Resolved**: Added a real View-tab timecode overlay button with `clock` icon and active-state sync. Right-clicking the button opens a new `TimecodeOverlaySettingsMenu` that exposes all previously API-only settings: position, font size, frame-counter visibility, and background opacity. Removed the stale TODO comment, one-time `console.info`, and `hasLoggedConfigHint` field from `TimecodeOverlay`.
- **Regression Tests**:
  - `TimecodeOverlaySettingsMenu.test.ts`: TOM-001 through TOM-007 cover menu rendering, position/font-size updates, frame-counter toggle, opacity slider, and dismissal behavior
  - `buildViewTab.test.ts`: verifies the new toggle button calls `viewer.getTimecodeOverlay().toggle()` and right-click opens the settings menu
  - `TimecodeOverlay.test.ts`: existing 50 overlay behavior tests remain green after removing the old logging path
- **Verification**: `TimecodeOverlaySettingsMenu.test.ts` (7 tests), `buildViewTab.test.ts` (10 tests), and `TimecodeOverlay.test.ts` (50 tests) pass. TypeScript clean.
- **Files Changed**: `src/services/tabContent/buildViewTab.ts`, `src/services/tabContent/buildViewTab.test.ts`, `src/ui/components/TimecodeOverlay.ts`, `src/ui/components/TimecodeOverlay.test.ts`, `src/ui/components/TimecodeOverlaySettingsMenu.ts`, `src/ui/components/TimecodeOverlaySettingsMenu.test.ts`

## Issue #78: The FPS indicator has rich persisted settings, but the shipped UI only exposes a binary toggle

- **Severity**: Medium
- **TODO(#78) Resolved**: Added `FPSIndicatorSettingsMenu` and wired it to the existing View-tab FPS button via right-click. The menu now exposes all persisted FPS HUD settings: position, dropped-frame visibility, target-FPS visibility, background opacity, warning threshold, and critical threshold. Removed the stale TODO comment, one-time `console.info`, and `hasLoggedConfigHint` field from `FPSIndicator`.
- **Regression Tests**:
  - `FPSIndicatorSettingsMenu.test.ts`: FOM-001 through FOM-007 cover menu rendering, position updates, display toggles, background slider, threshold slider behavior, and dismissal
  - `buildViewTab.test.ts`: verifies right-click on the FPS button opens the settings menu
  - `FPSIndicator.test.ts`: existing 44 indicator tests remain green after removing the old logging path
- **Verification**: `FPSIndicatorSettingsMenu.test.ts` (7 tests), `buildViewTab.test.ts` (11 tests), and `FPSIndicator.test.ts` (44 tests) pass. TypeScript clean.
- **Files Changed**: `src/services/tabContent/buildViewTab.ts`, `src/services/tabContent/buildViewTab.test.ts`, `src/ui/components/FPSIndicator.ts`, `src/ui/components/FPSIndicator.test.ts`, `src/ui/components/FPSIndicatorSettingsMenu.ts`, `src/ui/components/FPSIndicatorSettingsMenu.test.ts`

## Issue #79: Pixel Probe exposes copyable value rows as mouse-only `div`s

- **Severity**: Medium
- **Area**: QC tools, keyboard accessibility
- **Fix**: Added `tabindex="0"`, `role="button"`, `aria-label="Copy {Label} value"` to all value rows and the HDR Nits row. Added Enter/Space keydown handler to each.
- **Regression Tests**: PROBE-U200 through PROBE-U202 (3 tests).
- **Files Changed**: `src/ui/components/PixelProbe.ts`, `src/ui/components/PixelProbe.test.ts`

## Issue #80: Several custom popups bypass the shared dropdown primitive and lose its keyboard navigation

- **Severity**: Medium
- **Area**: View/QC control consistency, keyboard usability
- **Fix**: Added ArrowDown/ArrowUp/Home/End keyboard navigation to `DisplayProfileControl`, `MultiSourceLayoutControl`, and `BackgroundPatternControl`. Each finds focusable items, tracks current index via `document.activeElement`, moves focus with wrapping.
- **Regression Tests**: DPC-110/111/112, MSL-U060/061/062/063, BG-U060/061/062 (10 tests total).
- **Files Changed**: `src/ui/components/DisplayProfileControl.ts`, `src/ui/components/MultiSourceLayoutControl.ts`, `src/ui/components/BackgroundPatternControl.ts`, + test files

## Issue #81: Safe Areas ships only the binary guide toggles while real overlay customization stays unreachable

- **Severity**: Medium
- **Area**: QC overlays, framing guides
- **TODO(#81) Resolved**: Extended `SafeAreasControl`'s existing dropdown to expose the underlying `SafeAreasOverlay` customization API directly. The Aspect Ratio section now includes the `custom` preset plus a numeric custom-ratio input. A new Appearance section adds guide color and guide opacity controls. Removed the stale TODO comment, one-time `console.info`, and `hasLoggedConfigHint` field from `SafeAreasControl`. Added `getCustomAspectRatio()` to `SafeAreasOverlay` so the control can reflect current custom-ratio state.
- **Regression Tests**:
  - `SafeAreasControl.test.ts`: added SAFE-U048/049 for new controls, SAFE-U062b/065/066 for custom aspect-ratio workflow, and SAFE-U067/068 for color/opacity updates; removed the obsolete logging-path tests
  - `SafeAreasOverlay.test.ts`: existing 50 overlay tests remain green with the new getter and unchanged rendering behavior
- **Verification**: `SafeAreasControl.test.ts` (58 tests) and `SafeAreasOverlay.test.ts` (50 tests) pass. TypeScript clean.
- **Files Changed**: `src/ui/components/SafeAreasControl.ts`, `src/ui/components/SafeAreasControl.test.ts`, `src/ui/components/SafeAreasOverlay.ts`

- **Severity**: Medium
- **Fix**: Added TODO(#81) comment in `SafeAreasControl.ts` documenting that guideColor, guideOpacity, and custom aspect ratio features exist but have no UI surface. Added one-time `console.info` on first overlay enable.
- **Regression Tests**: SAFE-U120, SAFE-U121.
- **Files Changed**: `src/ui/components/SafeAreasControl.ts`, `src/ui/components/SafeAreasControl.test.ts`

## Issue #82: Watermark panel drops the overlay's custom-position mode on the floor

- **Severity**: Medium
- **Area**: QC overlays, watermark placement
- **TODO(#82) Resolved**: Extended `WatermarkControl` to expose the overlay's existing custom-position mode instead of logging about it. The position section now includes a dedicated `Custom` mode button plus X/Y percentage inputs wired to `WatermarkOverlay.setCustomPosition()`. The control keeps those inputs synchronized with overlay state, clamps out-of-range values back into the valid 0-100% range, and no longer carries the stale TODO comment, one-time `console.info`, or `hasLoggedConfigHint` state.
- **Regression Tests**:
  - `WatermarkControl.test.ts`: updated WMC-U010/011 for the new custom button, added WMC-U013 through WMC-U019 for custom-mode activation/state sync/clamping, and added WMC-U063 for `stateChanged` emission from custom coordinate edits; removed the obsolete logging-path tests
  - `WatermarkOverlay.test.ts`: existing 43 overlay tests remain green with no overlay behavior changes required
- **Verification**: `WatermarkControl.test.ts` (36 tests) and `WatermarkOverlay.test.ts` (43 tests) pass. TypeScript clean.
- **Files Changed**: `src/ui/components/WatermarkControl.ts`, `src/ui/components/WatermarkControl.test.ts`

## Issue #83: Client mode hides restricted UI one-way and does not restore it when the mode is turned off

- **Severity**: Medium
- **Area**: Review mode, layout state
- **Root Cause**: `applyClientModeRestrictions()` set `style.display = 'none'` on matched elements but had no inverse path. Disabling client mode left UI elements permanently hidden.
- **Fix**: Added `_clientModeOriginalDisplay` map to store previous display values before hiding. Added `restoreClientModeRestrictions()` that restores saved values. Wired it to the `stateChanged` listener when `enabled` becomes false.
- **Regression Tests**: LO-037 (elements restored when client mode disabled), LO-038 (originally hidden elements stay hidden).
- **Files Changed**: `src/services/LayoutOrchestrator.ts`, `src/services/LayoutOrchestrator.test.ts`

## Issue #84: Info Strip ships as a toggle-only overlay while its opacity control stays hidden

- **Severity**: Low
- **Area**: QC overlays, source metadata
- **TODO(#84) Resolved**: Added a right-click settings menu for the View tab's info-strip button so the overlay's existing configuration is now reachable from the UI. The new menu exposes basename vs full-path display mode plus a background-opacity slider, both wired to the overlay API. `InfoStripOverlay` now has a dedicated `setBackgroundOpacity()` method, clamps `backgroundOpacity` updates in `setState()`, and no longer carries the stale TODO comment, one-time `console.info`, or `hasLoggedCustomizationHint` state.
- **Regression Tests**:
  - `InfoStripSettingsMenu.test.ts`: added coverage for menu rendering, display-mode updates, opacity updates, and dismissal behavior
  - `buildViewTab.test.ts`: added right-click coverage for opening the info-strip settings menu from the View tab button
  - `InfoStripOverlay.test.ts`: removed obsolete logging-path tests and added clamping coverage for `setBackgroundOpacity()` / `setState()`
- **Verification**: `InfoStripOverlay.test.ts` (53 tests), `InfoStripSettingsMenu.test.ts` (5 tests), and `buildViewTab.test.ts` (12 tests) pass. TypeScript clean.
- **Files Changed**: `src/ui/components/InfoStripOverlay.ts`, `src/ui/components/InfoStripOverlay.test.ts`, `src/ui/components/InfoStripSettingsMenu.ts`, `src/ui/components/InfoStripSettingsMenu.test.ts`, `src/services/tabContent/buildViewTab.ts`, `src/services/tabContent/buildViewTab.test.ts`

## Issue #85: EXR window overlay exposes only a binary toggle while the useful per-window controls stay unreachable

- **Severity**: Medium
- **Area**: QC overlays, EXR framing diagnostics
- **TODO(#85) Resolved**: Added a right-click settings menu for the View tab's EXR window overlay button so the overlay's full state surface is reachable in production. The new menu exposes data-window/display-window visibility, label visibility, per-window colors, line width, and dash/gap length controls. `EXRWindowOverlay` now has dedicated setters for line width, dash pattern, and label visibility, clamps style values inside `setState()`, and no longer carries the stale TODO comment, one-time `console.info`, or `hasLoggedCustomizationHint` state.
- **Regression Tests**:
  - `EXRWindowOverlaySettingsMenu.test.ts`: added coverage for menu rendering, visibility toggles, color updates, style slider updates, and dismissal behavior
  - `buildViewTab.test.ts`: added right-click coverage for opening the EXR window settings menu from the View tab button
  - `EXRWindowOverlay.test.ts`: removed obsolete logging-path tests and added coverage for line-width, dash-pattern, and label setter behavior
- **Verification**: `EXRWindowOverlay.test.ts` (59 tests), `EXRWindowOverlaySettingsMenu.test.ts` (5 tests), and `buildViewTab.test.ts` (13 tests) pass. TypeScript clean.
- **Files Changed**: `src/ui/components/EXRWindowOverlay.ts`, `src/ui/components/EXRWindowOverlay.test.ts`, `src/ui/components/EXRWindowOverlaySettingsMenu.ts`, `src/ui/components/EXRWindowOverlaySettingsMenu.test.ts`, `src/services/tabContent/buildViewTab.ts`, `src/services/tabContent/buildViewTab.test.ts`

## Issue #86: Bug overlay is implemented in the viewer but has no production entry point

- **Severity**: Medium
- **Area**: Branding overlays, review watermarking
- **TODO(#86) Resolved**: Added a production entry point for `BugOverlay` in the View tab. The new bug-overlay toolbar button opens a settings menu until an image is loaded, then toggles the overlay on click and reopens settings on right-click. The new menu exposes image load/remove actions plus position, size, opacity, and margin controls. `BugOverlay` no longer carries the stale TODO comment, one-time `console.info`, or `hasLoggedCustomizationHint` state.
- **Regression Tests**:
  - `BugOverlaySettingsMenu.test.ts`: added coverage for menu rendering, file-input wiring, image loading, position/slider updates, remove action, and dismissal behavior
  - `buildViewTab.test.ts`: added bug-overlay button coverage for click-to-configure when empty, toggle behavior when an image exists, and right-click menu opening
  - `BugOverlay.test.ts`: removed obsolete logging-path tests and added numeric clamping coverage for `setState()`
  - `BugOverlay.e2e.test.ts`: updated the integration notes to reflect that production UI wiring now exists separately from the overlay API
- **Verification**: `BugOverlay.test.ts` (56 tests), `BugOverlaySettingsMenu.test.ts` (6 tests), `buildViewTab.test.ts` (16 tests), and `BugOverlay.e2e.test.ts` (23 tests) pass. TypeScript clean.
- **Files Changed**: `src/ui/components/BugOverlay.ts`, `src/ui/components/BugOverlay.test.ts`, `src/ui/components/BugOverlaySettingsMenu.ts`, `src/ui/components/BugOverlaySettingsMenu.test.ts`, `src/services/tabContent/buildViewTab.ts`, `src/services/tabContent/buildViewTab.test.ts`, `src/__e2e__/BugOverlay.e2e.test.ts`

## Issue #87: Matte overlay is fully implemented but unreachable from the shipped UI

- **Severity**: Medium
- **Area**: Framing overlays, presentation matte
- **TODO(#87) Resolved**: Added a production matte entry point in the View tab. The new matte-overlay toolbar button toggles the overlay, and right-click opens a settings menu exposing target aspect ratio, opacity, and center-point offsets. `MatteOverlay` no longer carries the stale TODO comment, one-time `console.info`, or `hasLoggedCustomizationHint` state.
- **Regression Tests**:
  - `MatteOverlaySettingsMenu.test.ts`: added coverage for menu rendering, aspect input updates, opacity updates, center-point updates, and dismissal behavior
  - `buildViewTab.test.ts`: added matte-overlay button coverage for toggle behavior and right-click settings-menu opening
  - `MatteOverlay.test.ts`: removed the obsolete logging-path tests while preserving the existing render and API coverage
- **Verification**: `MatteOverlay.test.ts` (58 tests), `MatteOverlaySettingsMenu.test.ts` (5 tests), and `buildViewTab.test.ts` (18 tests) pass. TypeScript clean.
- **Files Changed**: `src/ui/components/MatteOverlay.ts`, `src/ui/components/MatteOverlay.test.ts`, `src/ui/components/MatteOverlaySettingsMenu.ts`, `src/ui/components/MatteOverlaySettingsMenu.test.ts`, `src/services/tabContent/buildViewTab.ts`, `src/services/tabContent/buildViewTab.test.ts`

## Issue #88: Clipping overlay ships as a binary histogram toggle while its useful controls stay hidden

- **Severity**: Medium
- **Area**: QC overlays, exposure diagnostics
- **TODO(#88) Resolved**: Added a dedicated clipping-overlay button to the QC tab plus a right-click settings menu exposing the underlying `ClippingOverlay` controls directly. The new menu lets users toggle highlight and shadow overlays independently and adjust overlay opacity. `buildQCTab` now also keeps the existing histogram clipping indicator synchronized with the overlay state so the old binary surface and the new settings surface stay coherent. `ClippingOverlay` no longer carries the stale TODO comment, one-time `console.info`, or `hasLoggedCustomizationHint` state.
- **Regression Tests**:
  - `ClippingOverlaySettingsMenu.test.ts`: added coverage for menu rendering, highlight/shadow toggles, opacity updates, and dismissal behavior
  - `buildQCTab.test.ts`: added coverage for the new clipping button, right-click settings menu, existing histogram toggle wiring, and histogram state sync from overlay changes
  - `ClippingOverlay.test.ts`: removed the obsolete logging-path tests while preserving existing overlay behavior coverage
- **Verification**: `ClippingOverlay.test.ts` (34 tests), `ClippingOverlaySettingsMenu.test.ts` (4 tests), and `buildQCTab.test.ts` (10 tests) pass. TypeScript clean.
- **Files Changed**: `src/ui/components/ClippingOverlay.ts`, `src/ui/components/ClippingOverlay.test.ts`, `src/ui/components/ClippingOverlaySettingsMenu.ts`, `src/ui/components/ClippingOverlaySettingsMenu.test.ts`, `src/services/tabContent/buildQCTab.ts`, `src/services/tabContent/buildQCTab.test.ts`

## Issue #89: Reference comparison exposes only capture/on-off while the real comparison modes stay inaccessible

- **Severity**: Medium
- **TODO(#89) Resolved**: Added a production right-click settings menu to the View tab reference-comparison button so users can select the real comparison mode and adjust opacity plus wipe position directly. `ReferenceManager` no longer carries the stale TODO/logging shim, and the View-tab render path now forwards `wipePosition` into `Viewer.setReferenceImage(...)` so split comparisons actually honor the configured divider instead of staying fixed at 50%.
- **Regression Tests**:
  - `ReferenceComparisonSettingsMenu.test.ts`: added coverage for menu rendering, mode selection, opacity/wipe updates, and dismissal behavior
  - `buildViewTab.test.ts`: added coverage for opening the reference settings menu and forwarding `viewMode`, `opacity`, and `wipePosition` into the viewer render path
  - `ReferenceManager.test.ts`: removed obsolete logging-path tests while preserving manager behavior coverage
  - `ReferenceManager.e2e.test.ts` and `referenceDisplayWiring.test.ts`: remain green with the shipped display path
- **Verification**: `ReferenceManager.test.ts` (39 tests), `ReferenceComparisonSettingsMenu.test.ts` (4 tests), `buildViewTab.test.ts` (20 tests), `ReferenceManager.e2e.test.ts` (53 tests), `referenceDisplayWiring.test.ts` (15 tests), and `MuEventBridge.test.ts` (130 tests) pass. TypeScript clean.
- **Files Changed**: `src/ui/components/ReferenceManager.ts`, `src/ui/components/ReferenceManager.test.ts`, `src/ui/components/ReferenceComparisonSettingsMenu.ts`, `src/ui/components/ReferenceComparisonSettingsMenu.test.ts`, `src/ui/components/Viewer.ts`, `src/services/tabContent/buildViewTab.ts`, `src/services/tabContent/buildViewTab.test.ts`, `src/__e2e__/ReferenceManager.e2e.test.ts`, `src/compat/__tests__/MuEventBridge.test.ts`

## Issue #90: Spotlight ships as a bare toggle while most of the tool's real controls are hidden

- **Severity**: Medium
- **TODO(#90) Resolved**: Added a production right-click settings menu to the View-tab spotlight button so users can change shape, center position, width/height, dim amount, and feather directly instead of relying on API-only controls. `SpotlightOverlay` no longer carries the stale TODO/logging shim, and the shipped button now advertises right-click settings alongside the existing toggle behavior.
- **Regression Tests**:
  - `SpotlightOverlaySettingsMenu.test.ts`: added coverage for menu rendering, shape selection, slider-driven state updates, and dismissal behavior
  - `buildViewTab.test.ts`: added coverage for the spotlight toggle button and the new right-click settings surface
  - `SpotlightOverlay.test.ts`: removed obsolete logging-path tests while preserving overlay behavior coverage
- **Verification**: `SpotlightOverlay.test.ts` (71 tests), `SpotlightOverlaySettingsMenu.test.ts` (3 tests), and `buildViewTab.test.ts` (22 tests) pass. TypeScript clean.
- **Files Changed**: `src/ui/components/SpotlightOverlay.ts`, `src/ui/components/SpotlightOverlay.test.ts`, `src/ui/components/SpotlightOverlaySettingsMenu.ts`, `src/ui/components/SpotlightOverlaySettingsMenu.test.ts`, `src/services/tabContent/buildViewTab.ts`, `src/services/tabContent/buildViewTab.test.ts`

## Issue #91: The shipped slate panel exposes only a small subset of the slate feature it actually drives

- **Severity**: Medium
- **TODO(#91) Resolved**: Extended the shipped slate panel in `AppControlRegistry` to expose the editor features it already drives: text and accent colors, custom-field CRUD, logo position and scale, and output width/height. `SlateEditor` no longer carries the stale TODO/logging shim because these controls are now available from the production UI instead of only through the API.
- **Regression Tests**:
  - `AppControlRegistry.test.ts`: added coverage for the newly exposed slate panel controls, including color updates, custom-field CRUD, and logo position/scale wiring
  - `SlateEditor.test.ts`: removed obsolete logging-path tests while preserving editor behavior coverage
  - `SlateEditor.e2e.test.ts`: remains green with the expanded shipped panel surface
- **Verification**: `SlateEditor.test.ts` (73 tests), `AppControlRegistry.test.ts` (23 tests), and `SlateEditor.e2e.test.ts` (61 tests) pass. TypeScript clean.
- **Files Changed**: `src/AppControlRegistry.ts`, `src/AppControlRegistry.test.ts`, `src/ui/components/SlateEditor.ts`, `src/ui/components/SlateEditor.test.ts`, `src/compat/MuEvalBridge.ts`

## Issue #92: Slate logo upload failures are swallowed without any user-visible feedback

- **Severity**: Medium
- **Area**: Effects panel, error handling
- **Root Cause**: `loadLogoFile()` failures emitted `logoError` events but no production code listened for them.
- **Fix**: Added `slateEditor.on('logoError', ...)` listener in `AppControlRegistry.ts` that calls `console.warn` and displays the error in the logo info element.
- **Regression Tests**: ACR-023 (logoError triggers console.warn), SLATE-ERR-001 (logoError event emitted on failure).
- **Files Changed**: `src/AppControlRegistry.ts`, `src/AppControlRegistry.test.ts` or `src/ui/components/SlateEditor.test.ts`

## Issue #93: The advanced multi-field frameburn export overlay is implemented but unreachable in production

- **Severity**: Medium
- **TODO(#93) Resolved**: Added a production `Advanced Frameburn...` entry to the export dropdown that opens a new `FrameburnSettingsMenu`, persisting `frameburnEnabled` and multi-field `frameburnConfig` into export defaults instead of leaving the feature API-only. The video export path in `AppPlaybackWiring` now sanitizes that config, builds per-frame export context (shot name, frame range, fps, resolution, codec), and forwards both config and context into `viewer.renderFrameToCanvas(...)` so the advanced frameburn is rendered into exported MP4 frames. `FrameburnCompositor` no longer carries the stale TODO/logging shim and now centrally sanitizes persisted frameburn configs.
- **Regression Tests**:
  - `FrameburnSettingsMenu.test.ts`: added coverage for menu rendering, export-default updates, and dismissal behavior
  - `ExportControl.test.ts`: added coverage for opening the advanced frameburn settings surface from the shipped export menu
  - `AppPlaybackWiring.test.ts`: added coverage for forwarding advanced frameburn config and derived context into rendered export frames
  - `FrameburnCompositor.test.ts`: remains green with the sanitized multi-field compositor path
- **Verification**: `FrameburnCompositor.test.ts` (16 tests), `FrameburnSettingsMenu.test.ts` (3 tests), `ExportControl.test.ts` (82 tests), and `AppPlaybackWiring.test.ts` (72 tests) pass. TypeScript clean.
- **Files Changed**: `src/ui/components/FrameburnCompositor.ts`, `src/ui/components/FrameburnSettingsMenu.ts`, `src/ui/components/FrameburnSettingsMenu.test.ts`, `src/ui/components/ExportControl.ts`, `src/ui/components/ExportControl.test.ts`, `src/ui/components/Viewer.ts`, `src/AppPlaybackWiring.ts`, `src/AppPlaybackWiring.test.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #94: Watermark image load failures are swallowed without any user-visible feedback

- **Severity**: Medium
- **Area**: Effects panel, error handling
- **TODO(#94) Resolved**: `WatermarkControl.handleFileSelect()` now surfaces image-load failures in the shipped panel instead of swallowing them. Failed loads emit a `console.warn`, reveal the preview area, and render an inline error message with the failure text so the user gets immediate feedback after a bad watermark upload.
- **Regression Tests**:
  - `WatermarkControl.test.ts`: added coverage for failed image loads, including the warning path and inline error rendering
  - `issues-p1.test.ts`: removed the now-redundant issue-specific watermark test after migrating coverage into the component suite
- **Verification**: `WatermarkControl.test.ts` (37 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/WatermarkControl.ts`, `src/ui/components/WatermarkControl.test.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #95: Playlist transition edits can silently collapse back to a cut with no explanation

- **Severity**: Medium
- **TODO(#95) Resolved**: `PlaylistPanel` now warns when a requested transition cannot be validated instead of silently reverting the edit. When `validateTransition()` rejects a non-cut transition, the UI logs a clear rejection message naming the transition type and gap, then explicitly resets the selector back to `cut` so the fallback is visible and traceable.
- **Regression Tests**:
  - `PlaylistPanel.test.ts`: added coverage for rejected transition edits, including the warning path, selector reset, and fallback `setTransition(..., null)` behavior
  - `issues-p1.test.ts`: removed the now-redundant issue-specific transition test after migrating coverage into the component suite
- **Verification**: `PlaylistPanel.test.ts` (30 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/PlaylistPanel.ts`, `src/ui/components/PlaylistPanel.test.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #96: ShotGrid load requests with invalid IDs fail as a silent no-op

- **Severity**: Low
- **TODO(#96) Resolved**: `ShotGridPanel.handleLoad()` now validates the query field before dispatching load events. Empty or non-positive IDs immediately show inline error state through `showState('error', ...)`, mark the input with `aria-invalid="true"`, and clear that invalid state again once the query is valid.
- **Regression Tests**:
  - `ShotGridPanel.test.ts`: added coverage for empty-query and invalid-ID validation, including inline error text and `aria-invalid` behavior
  - `issues-p1.test.ts`: removed the now-redundant issue-specific ShotGrid validation tests after migrating coverage into the component suite
- **Verification**: `ShotGridPanel.test.ts` (27 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/ShotGridPanel.ts`, `src/ui/components/ShotGridPanel.test.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #97: Timeline context menu advertises `Ctrl+C` for timecode copy, but that shortcut is still bound to frame copy

- **Severity**: Medium
- **TODO(#97) Resolved**: The main timeline context menu no longer advertises a fake `Ctrl+C` shortcut for timecode copy. `Copy Timecode` is now explicitly click-only while the real keyboard binding remains reserved for frame copy, eliminating the mismatch between the menu hint and actual behavior.
- **Regression Tests**:
  - `TimelineContextMenu.test.ts`: existing `TCM-023` now verifies that `Copy Timecode` renders without a `Ctrl+C` hint while real shortcut-backed items still show their hints
  - `issues-p1.test.ts`: removed the now-redundant issue-specific timeline-context-menu test after confirming coverage in the component suite
- **Verification**: `TimelineContextMenu.test.ts` (54 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/TimelineContextMenu.ts`, `src/ui/components/TimelineContextMenu.test.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #98: Ghost Frames, PAR, and Stereo Align use different interaction models for mouse and keyboard

- **Severity**: Medium
- **TODO(#98) Resolved**: The shipped Ghost Frames, PAR, and Stereo Align controls now describe their split interaction model directly in the button tooltip: click opens configuration, while the keyboard shortcut toggles or cycles the current state. That keeps the UI copy aligned with the real behavior instead of implying a single interaction pattern.
- **Regression Tests**:
  - `GhostFrameControl.test.ts`: added coverage for the dual-behavior tooltip copy on the ghost-frame button
  - `PARControl.test.ts`: added coverage for the dual-behavior tooltip copy on the PAR button
  - `StereoAlignControl.test.ts`: added coverage for the dual-behavior tooltip copy on the stereo-align button
  - `issues-p1.test.ts`: removed the now-redundant issue-specific tooltip tests after migrating coverage into the component suites
- **Verification**: `GhostFrameControl.test.ts` (6 tests), `PARControl.test.ts` (22 tests), and `StereoAlignControl.test.ts` (20 tests) pass. TypeScript clean.
- **Files Changed**: `src/ui/components/GhostFrameControl.ts`, `src/ui/components/GhostFrameControl.test.ts`, `src/ui/components/PARControl.ts`, `src/ui/components/PARControl.test.ts`, `src/ui/components/StereoAlignControl.ts`, `src/ui/components/StereoAlignControl.test.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #99: Timeline editor context menu shows shortcut hints that are not actually wired

- **Severity**: Medium
- **TODO(#99) Resolved**: The timeline editor context menu no longer advertises fake `S` and `D` shortcuts for `Split at Playhead` and `Duplicate Cut`. Those items now render without shortcut badges, while `Delete Cut` keeps its real `Del` hint. `TimelineEditor.createMenuItem()` accepts `string | null` so the menu can distinguish between wired and click-only actions.
- **Regression Tests**:
  - `TimelineEditor.test.ts`: updated `TL-EDIT-U062` to verify that split/duplicate items render label-only entries while delete still renders its `Del` shortcut badge
  - `issues-p1.test.ts`: removed the now-redundant issue-specific timeline-editor context-menu test after moving the assertion into the component suite
- **Verification**: `TimelineEditor.test.ts` (71 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/TimelineEditor.ts`, `src/ui/components/TimelineEditor.test.ts`, `src/ui/components/issues-p1.test.ts`, `src/compat/MuNodeBridge.ts`

## Issue #100: Snapshot panel hides load failures behind a blank or stale panel state

- **Severity**: Medium
- **TODO(#100) Resolved**: `SnapshotPanel.loadSnapshots()` now surfaces snapshot-list load failures inside the shipped panel instead of leaving users with a blank or stale list. When `listSnapshots()` rejects, the panel logs the error, clears the list area, and renders an inline `snapshot-load-error` message telling the user the snapshots failed to load.
- **Regression Tests**:
  - `SnapshotPanel.test.ts`: added coverage for rejected `listSnapshots()` calls, including the inline load-error element rendered during `show()`
  - `issues-p1.test.ts`: removed the now-redundant issue-specific snapshot load-failure test after migrating coverage into the component suite
- **Verification**: `SnapshotPanel.test.ts` (48 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/SnapshotPanel.ts`, `src/ui/components/SnapshotPanel.test.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #101: The floating Info Panel is mostly unwired and can only show cursor color reliably

- **Severity**: Medium
- **Fix**: Added TODO(#101) in InfoPanel class JSDoc + one-time `console.info` on first `enable()` documenting that most fields (filename, resolution, frame, timecode, duration, FPS) are unwired in production.
- **TODO(#101) Resolved**: The metadata wiring was already implemented via `infoPanelHandlers.ts` (`updateInfoPanel()` sends all fields) wired through `AppSessionBridge.bindSessionEvents()` on `frameChanged` and `sourceLoaded` events. Removed the stale TODO(#101) comment, `hasLoggedUnwiredFieldsHint` flag, and console.info warning. Updated INFO-U130/U131 test expectations.
- **Regression Tests**: INFO-U130, INFO-U131 (updated to expect 1 console.info instead of 2).
- **Files Changed**: `src/ui/components/InfoPanel.ts`, `src/ui/components/InfoPanel.test.ts`

## Issue #102: Cache indicator's `Clear` action only clears video cache while still presenting effects-cache stats

- **Severity**: Medium
- **TODO(#102) Resolved**: `CacheIndicator` now distinguishes between the two caches it exposes. The original button is labeled `Clear Video Cache`, and a separate `Clear Effects Cache` action clears the viewer prerender/effects cache through `viewer.clearPrerenderCache()`. The effects-clear action is only shown when the effects cache actually has content, and `CacheIndicator` emits a dedicated `effectsClearRequested` event for that path.
- **Regression Tests**:
  - `CacheIndicator.test.ts`: existing effects-cache coverage (`CACHE-U120` through `CACHE-U125`) remains green, and added label coverage for both `Clear Video Cache` and `Clear Effects Cache`
  - `issues-p1.test.ts`: removed the now-redundant issue-specific cache-indicator tests after confirming full coverage in the component suite
- **Verification**: `CacheIndicator.test.ts` (73 tests) passes. TypeScript clean. Existing non-failing `DisposableSubscriptionManager` teardown warnings still print in this suite.
- **Files Changed**: `src/ui/components/CacheIndicator.ts`, `src/ui/components/Viewer.ts`, `src/ui/components/CacheIndicator.test.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #103: Right-panel media info can go stale after the panel is hidden and shown again

- **Severity**: Medium
- **TODO(#103) Resolved**: This was already fixed by the `pendingInfo` / `applyPending()` work from Issue #53. `RightPanelContent.updateInfo()` now buffers info updates received while the panel is hidden, and `applyPending()` reapplies the latest deferred state when the panel becomes visible again, so the Media Info section no longer reopens stale or blank.
- **Regression Tests**:
  - `RightPanelContent.test.ts`: `RP-103a` and `RP-103b` confirm that hidden-panel updates are applied on reopen and that multiple hidden updates keep only the latest payload
- **Verification**: `RightPanelContent.test.ts` (37 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/layout/panels/RightPanelContent.ts`, `src/ui/layout/panels/RightPanelContent.test.ts`

## Issue #104: Advanced paint-tool buttons advertise `D` / `U` / `C` / `M`, but those shortcuts do not exist

- **Severity**: Medium
- **TODO(#104) Resolved**: `PaintToolbar` no longer advertises fake single-letter shortcuts for the advanced destructive tools. Dodge, Burn, Clone, and Smudge now expose descriptive tooltips without `D` / `U` / `C` / `M` badges, keeping the toolbar copy aligned with the actual keyboard map.
- **Regression Tests**:
  - `PaintToolbar.test.ts`: `PAINT-U104a` through `PAINT-U104d` verify that dodge, burn, clone, and smudge tooltips still identify the tools but do not include nonexistent shortcut hints
- **Verification**: `PaintToolbar.test.ts` (61 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/PaintToolbar.ts`, `src/ui/components/PaintToolbar.test.ts`

## Issue #105: Text-format toolbar advertises `Ctrl+B` / `Ctrl+I` / `Ctrl+U`, but production never routes those shortcuts to it

- **Severity**: Medium
- **Fix**: Removed `(Ctrl+B)`, `(Ctrl+I)`, `(Ctrl+U)` from button titles. Added TODO(#105).
- **TODO(#105) Resolved**: Wired Ctrl+B/I/U keyboard shortcuts to TextFormattingToolbar via the standard keyboard action system. Added `paint.textBold`, `paint.textItalic`, `paint.textUnderline` key bindings scoped to `context: 'paint'` (so Ctrl+I doesn't conflict with global `color.toggleInversion`). Handlers in `KeyboardActionMap` delegate to `textFormattingToolbar.handleKeyboard()`. Restored shortcut hints in button titles. Actions added to `CONTEXTUAL_DEFAULTS` for proper context-scoped dispatch.
- **Regression Tests**: TFT-105a through TFT-105c (updated to expect shortcut hints), KAM-105a through KAM-105c (3 new handler tests).
- **Files Changed**: `src/utils/input/KeyBindings.ts`, `src/services/KeyboardActionMap.ts`, `src/AppKeyboardHandler.ts`, `src/ui/components/TextFormattingToolbar.ts`, `src/ui/components/TextFormattingToolbar.test.ts`, `src/services/KeyboardActionMap.test.ts`

## Issue #106: Text-format toolbar never follows actual text selection, so it only tracks newly created or most-recent text

- **Severity**: Medium
- **Fix**: Added TODO(#106) + `console.info` in `setActiveAnnotation()` documenting the gap.
- **TODO(#106) Resolved**: Added `hitTestTextAnnotations()` to PaintEngine (proximity-based, reverse iteration for topmost-wins). ViewerInputHandler text-tool click now checks hit-test first — if an existing text annotation is hit, emits `annotationSelected` event instead of creating new overlay. TextFormattingToolbar subscribes to `annotationSelected` and updates state via `setActiveAnnotation()`. Removed console.info and TODO comments.
- **Regression Tests**: TFT-106a (updated), TFT-106b/c (new: event wiring, null safety), PAINT-055 through PAINT-061 (7 hit-test tests), H106-01/02 (ViewerInputHandler branching).
- **Files Changed**: `src/paint/PaintEngine.ts`, `src/ui/components/ViewerInputHandler.ts`, `src/ui/components/TextFormattingToolbar.ts`, `src/paint/PaintEngine.test.ts`, `src/ui/components/TextFormattingToolbar.test.ts`, `src/ui/components/ViewerInputHandler.test.ts`

## Issue #107: Snapshot panel promises a Preview action, but the shipped UI only shows preview metadata

- **Severity**: Medium
- **TODO(#107) Resolved**: `SnapshotPanel` now exposes a real Preview action in each snapshot row instead of only showing the lightweight metadata summary. The Preview button fetches the full saved `SessionState`, opens a read-only detail view with media/playback/color/view state, and provides a Back action to return to the list. Missing snapshots are handled gracefully with `console.warn`, and preview opens emit `previewRequested`.
- **Regression Tests**:
  - `SnapshotPanel.test.ts`: `SNAP-107a` through `SNAP-107f` verify the Preview button, `previewRequested` emission, `getSnapshot()` lookup, detail-view rendering, Back navigation, and graceful handling of null snapshot state
- **Verification**: `SnapshotPanel.test.ts` (48 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/SnapshotPanel.ts`, `src/ui/components/SnapshotPanel.test.ts`

## Issue #108: Playlist panel claims EDL import/export support, but the shipped UI only exposes export

- **Severity**: Medium
- **Fix**: Updated docs from "EDL import/export" to "EDL/OTIO export". Added TODO(#108).
- **TODO(#108) Resolved**: Added Import button to PlaylistPanel footer (upload icon, accepts `.edl,.otio,.json,.rvedl`). `handleImport()` detects format by extension, clears playlist, calls `fromEDL()` or `fromOTIO()` with source resolver. Added `imported` event with format/importedCount/unresolvedCount. Added `setSourceNameResolver()` for name-to-index mapping. File input cleaned up on both completion and cancel.
- **Regression Tests**: PL-108a (updated: import button exists), PL-108b through PL-108h (7 new: button testid, file input creation, EDL import, OTIO import, cleanup, resolver, fallback).
- **Files Changed**: `src/ui/components/PlaylistPanel.ts`, `src/ui/components/PlaylistPanel.test.ts`

## Issue #109: Network Sync can show `Copied!` before the share link copy actually succeeds

- **Severity**: Medium
- **TODO(#109) Resolved**: `NetworkControl` no longer flips the share-link button straight to `Copied!` before the clipboard promise settles. The copy flow now shows `Copying...` immediately, then updates through `setCopyResult(success)` to either `Copied!` or `Copy failed` once the async clipboard write actually finishes.
- **Regression Tests**:
  - `NetworkControl.test.ts`: `NCC-109a` through `NCC-109c` verify the immediate `Copying...` state and the final success/failure result handling
- **Verification**: `NetworkControl.test.ts` (45 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/NetworkControl.ts`, `src/ui/components/NetworkControl.test.ts`, `src/compat/MuNodeBridge.ts`

## Issue #110: Shortcut editor import failures are completely silent

- **Severity**: Medium
- **TODO(#110) Resolved**: `ShortcutEditor` no longer swallows bad import files. The import flow now catches parse/format failures, logs a `console.warn`, and surfaces inline toolbar feedback through `showImportStatus(...)` so users immediately see that the import failed instead of getting no response.
- **Regression Tests**:
  - `ShortcutEditor.test.ts`: `SHORTCUT-U110` now exercises the real file-import UI path and verifies both the warning and the inline `Import failed: invalid file format` status; `SHORTCUT-U111` continues covering invalid import payload formats
- **Verification**: `ShortcutEditor.test.ts` (28 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/ShortcutEditor.ts`, `src/ui/components/ShortcutEditor.test.ts`

## Issue #111: Curves import failures only hit the console, not the UI

- **Severity**: Medium
- **TODO(#111) Resolved**: `CurvesControl` now surfaces import failures inside the panel instead of only logging them. Invalid or unreadable JSON imports render an inline `curves-import-error` message in the draggable panel content, so the user sees immediate feedback when a curves import fails.
- **Regression Tests**:
  - `CurvesControl.test.ts`: `CURVES-U111a` now exercises the real invalid-file import flow and verifies that the inline `curves-import-error` element appears with the expected message
- **Verification**: `CurvesControl.test.ts` (31 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/CurvesControl.ts`, `src/ui/components/CurvesControl.test.ts`

## Issue #112: External presentation window opens can fail silently when blocked by the browser

- **Severity**: Medium
- **TODO(#112) Resolved**: `ExternalPresentation.openWindow()` now warns when the browser blocks the popup instead of failing silently. If `window.open()` returns `null`, the presentation flow logs a clear warning about popup blocking; successful opens do not warn.
- **Regression Tests**:
  - `ExternalPresentation.test.ts`: `EP-112a` and `EP-112b` verify the blocked-popup warning path and the no-warning success path
- **Verification**: `ExternalPresentation.test.ts` (55 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/ExternalPresentation.ts`, `src/ui/components/ExternalPresentation.test.ts`

## Issue #113: The `?` shortcut cheat sheet advertises search/context filtering in code, but the shipped overlay exposes neither

- **Severity**: Medium
- **Fix**: Updated docs to remove misleading search/filter claims. Added TODO(#113).
- **TODO(#113) Resolved**: Added search input and context-filter dropdown to the ShortcutCheatSheet overlay. Toolbar (`cheatsheet-toolbar`) is created once and preserved across re-renders; content area cleared separately. Search input fires `filter()` on each keystroke, context dropdown fires `setContext()` on change. Both controls have `keydown` stopPropagation to prevent shortcut interception. Search input auto-focuses on `show()`. Escape in search blurs input. Dropdown options populated dynamically from `buildActionGroups()`.
- **Regression Tests**: CS-113 (updated: search input exists), CS-113a through CS-113j (10 new tests: input filtering, context filtering, clear restores all, All Categories restore, search+context compose, focus on show, keydown isolation, programmatic sync, dropdown population).
- **Files Changed**: `src/ui/components/ShortcutCheatSheet.ts`, `src/ui/components/ShortcutCheatSheet.test.ts`

## Issue #114: Tone Mapping can be "enabled" in the dropdown while still being functionally off

- **Severity**: Medium
- **TODO(#114) Resolved**: `ToneMappingControl.setEnabled(true)` now mirrors the already-correct `toggle()` behavior from Issue #41. If tone mapping is enabled while the operator is still `'off'`, the control automatically switches to the first real operator instead of leaving the UI in an “enabled but visually off” state.
- **Regression Tests**:
  - `ToneMappingControl.issue114.test.ts`: 5 focused tests verify auto-selection of a non-off operator and the enabled-state behavior
- **Verification**: `ToneMappingControl.issue114.test.ts` (5 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/ToneMappingControl.ts`, `src/ui/components/ToneMappingControl.issue114.test.ts`

## Issue #115: Typing a custom PAR value does not actually enable PAR correction

- **Severity**: Medium
- **TODO(#115) Resolved**: Entering a custom PAR value now activates PAR correction the same way choosing a preset does. The custom-value handler explicitly sets `state.enabled = true` and refreshes the enable checkbox, so custom PAR input immediately takes effect instead of silently leaving correction off.
- **Regression Tests**:
  - `PARControl.issue115.test.ts`: 2 focused tests verify that custom PAR input enables correction and keeps the checkbox/UI state in sync
- **Verification**: `PARControl.issue115.test.ts` (2 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/PARControl.ts`, `src/ui/components/PARControl.issue115.test.ts`

## Issue #116: Volume slider disclosure is tied to the mute button, so keyboard/touch use mutates audio state just to reach the slider

- **Severity**: Medium
- **TODO(#116) Resolved**: Volume slider disclosure is no longer tied to mute. Clicking the mute button only toggles mute, while disclosure is handled separately through hover and keyboard focus so users can reach the slider without mutating audio state.
- **Regression Tests**: `VolumeControl.test.ts` covers click-only mute behavior, hover disclosure, keyboard-focus disclosure, focus-within retention, and collapse when focus leaves the control.
- **Verification**: `VolumeControl.test.ts` (29 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/VolumeControl.ts`, `src/ui/components/VolumeControl.test.ts`

## Issue #117: The OCIO button advertises the wrong shortcut

- **Severity**: Low
- **TODO(#117) Resolved**: The OCIO button tooltip now advertises the correct `O` shortcut instead of `Shift+O`.
- **Regression Tests**: `OCIOControl.test.ts` asserts the rendered `ocio-panel-button` tooltip text.
- **Verification**: `OCIOControl.test.ts` (20 tests) passes. TypeScript clean.
- **Files Changed**: `src/ui/components/OCIOControl.ts`, `src/ui/components/OCIOControl.test.ts`

## Issue #118: `WipeControl` is a dead legacy UI widget with no production mount path

- **Severity**: Low
- **Fix**: Added TODO(#118) to the existing `@deprecated` JSDoc noting it should be removed when safe.
- **TODO(#118) Resolved**: Deleted `WipeControl.ts` and its test files. All production and test imports redirected from `./WipeControl` to `../../core/types/wipe` (the canonical source for `WipeState`, `WipeMode`, `DEFAULT_WIPE_STATE`). Cleaned up "WipeControl compatibility" comments in CompareControl and ComparisonManager. No production code instantiated WipeControl.
- **Files Deleted**: `src/ui/components/WipeControl.ts`, `src/ui/components/WipeControl.test.ts`, `src/ui/components/WipeControl.issue118.test.ts`
- **Files Changed**: `src/ui/components/Viewer.ts`, `src/ui/components/WipeManager.ts`, `src/ui/components/ViewerWipe.ts`, `src/ui/components/CompareControl.ts`, `src/ui/components/ComparisonManager.ts` (+ their test files)

## Issue #119: Project save knows it is dropping active viewer state, but the save flow only logs that loss to the console

- **Severity**: High
- **TODO(#119) Resolved**: `saveProject()` now surfaces active serialization gaps with a warning alert before saving, instead of leaving that data loss visible only in the console.
- **Regression Tests**: `AppPersistenceManager.issue119-122.test.ts` verifies warning alerts appear for active gaps and stay silent when no active gaps remain.
- **Verification**: `AppPersistenceManager.issue119-122.test.ts` (6 tests) passes. `AppPersistenceManager.test.ts` (66 tests) passes. TypeScript clean.
- **Files Changed**: `src/AppPersistenceManager.ts`, `src/AppPersistenceManager.issue119-122.test.ts`

## Issue #120: Restored PAR and background-pattern state can disagree with the visible controls

- **Severity**: Medium
- **TODO(#120) Resolved**: `syncControlsFromState()` now pushes restored PAR and background-pattern state back into the visible controls, keeping the UI aligned with restored session state.
- **Regression Tests**: `AppPersistenceManager.issue119-122.test.ts` verifies PAR/background control sync and graceful handling when those controls are not mounted.
- **Verification**: `AppPersistenceManager.issue119-122.test.ts` (6 tests) passes. `AppPersistenceManager.test.ts` (66 tests) passes. TypeScript clean.
- **Files Changed**: `src/AppPersistenceManager.ts`, `src/AppPersistenceManager.issue119-122.test.ts`

## Issue #121: Opening a project imports its media on top of the current session instead of replacing the session

- **Severity**: High
- **TODO(#121) Resolved**: Project restore now clears the current session before loading serialized media, so imported projects replace the session instead of stacking new sources onto existing ones.
- **Regression Tests**: `AppPersistenceManager.issue119-122.test.ts` verifies the load path clears sources before import.
- **Verification**: `AppPersistenceManager.issue119-122.test.ts` (6 tests) passes. TypeScript clean.
- **Files Changed**: `src/core/session/SessionMedia.ts`, `src/core/session/Session.ts`, `src/core/session/SessionSerializer.ts`, `src/AppPersistenceManager.issue119-122.test.ts`

## Issue #122: Saved current-source selection is serialized but never restored

- **Severity**: Medium
- **TODO(#122) Resolved**: `Session.setPlaybackState()` now reapplies `currentSourceIndex`, so project restore returns to the same active source that was saved.
- **Regression Tests**: `AppPersistenceManager.issue119-122.test.ts` verifies playback restore carries `currentSourceIndex` through to the session load path.
- **Verification**: `AppPersistenceManager.issue119-122.test.ts` (6 tests) passes. TypeScript clean.
- **Files Changed**: `src/core/session/Session.ts`, `src/AppPersistenceManager.issue119-122.test.ts`

## Issue #123: Loading empty notes, version groups, or statuses does not clear the old session data

- **Severity**: High
- **TODO(#123) Resolved**: `SessionSerializer.fromJSON()` now restores notes, version groups, and statuses even when the serialized arrays are empty, so restoring a project correctly clears old review metadata instead of leaving stale session data behind.
- **Regression Tests**: `SessionSerializer.issue123-133.test.ts` verifies empty notes, version-groups, and statuses arrays each call their corresponding restore path with `[]`.
- **Verification**: `SessionSerializer.issue123-133.test.ts` (15 tests) passes. TypeScript clean.
- **Files Changed**: `src/core/session/SessionSerializer.ts`, `src/core/session/SessionSerializer.issue123-133.test.ts`

## Issue #124: State-only or failed-media project loads skip playback-state restore entirely

- **Severity**: Medium
- **TODO(#124) Resolved**: Playback restore no longer depends on successfully loaded media. `SessionSerializer.fromJSON()` now reapplies playback state for state-only projects and failed-media restores as well.
- **Regression Tests**: `SessionSerializer.issue123-133.test.ts` verifies playback state is restored when zero media loads and when all media loads fail.
- **Verification**: `SessionSerializer.issue123-133.test.ts` (15 tests) passes. TypeScript clean.
- **Files Changed**: `src/core/session/SessionSerializer.ts`, `src/core/session/SessionSerializer.issue123-133.test.ts`

## Issue #125: RV/GTO session import keeps old review metadata when the imported file contains none

- **Severity**: High
- **TODO(#125) Resolved**: `SessionGraph.loadFromGTO()` now applies empty marker, note, version-group, and status arrays during import, so RV/GTO session restore clears stale review metadata instead of silently keeping old session state.
- **Regression Tests**: `SessionGraph.issue125-131.test.ts` verifies empty `marks` clears markers and empty `notes`/`versionGroups`/`statuses` arrays each trigger their restore path with `[]`.
- **Verification**: `SessionGraph.issue125-131.test.ts` (6 tests) passes. TypeScript clean.
- **Files Changed**: `src/core/session/SessionGraph.ts`, `src/core/session/SessionGraph.issue125-131.test.ts`

## Issue #126: `.orvproject` save/load never persists the node graph

- **Severity**: High
- **TODO(#126) Resolved**: `.orvproject` save/load now persists the live node graph. `SessionSerializer.toJSON()` writes the reserved `graph` field when a graph is present, and `fromJSON()` restores it through `Session`/`SessionGraph`, including output-node, view-node, and connection topology.
- **Regression Tests**: `SessionSerializer.issue123-133.test.ts` verifies graph field save/load wiring, `SessionGraph.test.ts` verifies graph serialization and topology restore, and `SessionSerializer.test.ts` stays green against the updated serializer contract.
- **Verification**: `SessionGraph.test.ts` (31 tests), `SessionSerializer.issue123-133.test.ts` (15 tests), and `SessionSerializer.test.ts` (77 tests) pass. TypeScript clean.
- **Files Changed**: `src/core/session/SessionSerializer.ts`, `src/core/session/Session.ts`, `src/core/session/SessionGraph.ts`, `src/core/session/SessionGraph.test.ts`, `src/core/session/SessionSerializer.issue123-133.test.ts`

## Issue #127: Session renaming in the header is not honored by project save/load

- **Severity**: Medium
- **TODO(#127) Resolved**: Project save now uses the session display name from header metadata instead of always writing `project.orvproject`, while still falling back to `project` when the name is empty or whitespace.
- **Regression Tests**: `AppPersistenceManager.issue127.test.ts` verifies display-name save, empty-name fallback, and whitespace fallback.
- **Verification**: `AppPersistenceManager.issue127.test.ts` (3 tests) passes. TypeScript clean.
- **Files Changed**: `src/AppPersistenceManager.ts`, `src/AppPersistenceManager.issue127.test.ts`

## Issue #128: RV/GTO marker notes and marker colors are exported and parsed, but import drops them

- **Severity**: Medium
- **TODO(#128) Resolved**: RV/GTO marker import now preserves marker notes and colors end to end. Parsed `markerNotes`/`markerColors` are forwarded through `SessionGraph.loadFromGTO()` into `MarkerManager.setFromFrameNumbers()`.
- **Regression Tests**: `MarkerManager.issue128.test.ts` verifies note/color persistence and default filling, and `SessionGraph.issue125-131.test.ts` verifies `loadFromGTO()` forwards marker notes/colors to marker restore.
- **Verification**: `MarkerManager.issue128.test.ts` (5 tests) and `SessionGraph.issue125-131.test.ts` (8 tests) pass. TypeScript clean.
- **Files Changed**: `src/core/session/MarkerManager.ts`, `src/core/session/SessionGraph.ts`, `src/core/session/MarkerManager.issue128.test.ts`, `src/core/session/SessionGraph.issue125-131.test.ts`

## Issue #129: RV/GTO audio-scrub state is exported and parsed, but never restored

- **Severity**: Medium
- **TODO(#129) Resolved**: RV/GTO import now restores audio-scrub state by applying parsed `audioScrubEnabled` through `SessionGraph.loadFromGTO()` into the session host wiring.
- **Regression Tests**: `SessionGraph.issue125-131.test.ts` verifies `loadFromGTO()` applies `audioScrubEnabled` to the host.
- **Verification**: `SessionGraph.issue125-131.test.ts` (8 tests) passes. TypeScript clean.
- **Files Changed**: `src/core/session/SessionGraph.ts`, `src/core/session/Session.ts`, `src/core/session/SessionGraph.issue125-131.test.ts`

## Issue #130: Several shipped Effects-tab controls are fully wired, but `.orvproject` persistence ignores them

- **Severity**: High
- **TODO(#130) Resolved**: `.orvproject` save warnings now explicitly report the missing Effects-tab persistence gaps for Deinterlace, Film emulation, Perspective correction, Stabilization, and Uncrop, with active/default detection per control.
- **Regression Tests**: `SessionSerializer.issue123-133.test.ts` verifies the effects-gap entries exist, stay inactive at defaults, and flip active for representative enabled states.
- **Verification**: `SessionSerializer.issue123-133.test.ts` (15 tests) passes. TypeScript clean.
- **Files Changed**: `src/core/session/SessionSerializer.ts`, `src/core/session/SessionSerializer.issue123-133.test.ts`

## Issue #131: Loading ordinary media after a GTO/RV session does not clear old session metadata or uncrop

- **Severity**: High
- **TODO(#131) Resolved**: `SessionGraph.clearData()` now clears carried-over session metadata, uncrop state, EDL entries, graph, raw GTO data, and parse result so ordinary media loads do not inherit stale RV/GTO session state.
- **Regression Tests**: `SessionGraph.issue125-131.test.ts` verifies metadata reset, uncrop reset, EDL clearing, and graph/GTO/parse-result clearing.
- **Verification**: `SessionGraph.issue125-131.test.ts` (8 tests) passes. TypeScript clean.
- **Files Changed**: `src/core/session/SessionGraph.ts`, `src/core/session/SessionGraph.issue125-131.test.ts`

## Issue #132: Project save/load preserves wipe mode but not the actual A/B compare assignment state

- **Severity**: Medium
- **TODO(#132) Resolved**: Project playback persistence now includes A/B compare assignment state. `.orvproject` save/load round-trips `sourceAIndex`, `sourceBIndex`, and `currentAB` through playback state instead of preserving only wipe mode.
- **Regression Tests**: `SessionSerializer.issue123-133.test.ts` verifies serializer save/load wiring for A/B assignment, and `Session.state.test.ts` verifies `Session.getPlaybackState()`/`setPlaybackState()` export and restore the A/B assignment and active side.
- **Verification**: `SessionSerializer.issue123-133.test.ts` (15 tests), `SessionSerializer.test.ts` (77 tests), and `Session.state.test.ts` (132 tests) pass. TypeScript clean.
- **Files Changed**: `src/core/session/SessionState.ts`, `src/core/session/Session.ts`, `src/core/session/SessionSerializer.ts`, `src/core/session/SessionSerializer.issue123-133.test.ts`, `src/core/session/Session.state.test.ts`

## Issue #133: RV/GTO import loses `play all frames` because `realtime = 0` is parsed as "missing"

- **Severity**: Medium
- **TODO(#133) Resolved**: RV/GTO import now treats `realtime = 0` as a valid parsed value, preserving OpenRV's “play all frames” mode instead of discarding it as missing.
- **Regression Tests**: `GTOGraphLoader.issue133.test.ts` verifies `realtime = 0` is preserved, prefers `realtime` over `fps` when present, and still falls back to `fps` when absent.
- **Verification**: `GTOGraphLoader.issue133.test.ts` (4 tests) and `GTOGraphLoader.test.ts` (80 tests) pass. TypeScript clean.
- **Files Changed**: `src/core/session/GTOGraphLoader.ts`, `src/core/session/GTOGraphLoader.issue133.test.ts`

## Issue #134: `.orvproject` serializes media representations, but project load never rebuilds or reselects them

- **Severity**: Medium
- **Fix**: Implemented representation restoration in `SessionSerializer.fromJSON()`. Added index tracking (`mediaIndexMap`) to map serialized media references to loaded source indices. After media loading, iterates over successfully loaded sources and calls `session.addRepresentationToSource()` for each serialized representation, then `session.switchRepresentation()` to reselect the previously active representation. Handles failed media loads (skipped), missing representations (no-op), and failed switches (warning added). Removed the TODO(#134) comment and `console.info`.
- **Regression Tests**: SER-REP-001 (updated: no spurious console.info), SER-REP-002 (representations restored and active switched), SER-REP-003 (skipped for failed loads), SER-REP-004 (warning on failed switch), SER-REP-005 (no-op for media without representations), SER-REP-006 (representations added but no switch when no activeRepresentationId). 6 tests.
- **Files Changed**: `src/core/session/SessionSerializer.ts`, `src/core/session/SessionSerializer.test.ts`

## Issue #135: RV/GTO round-trips collapse duration markers into point markers

- **Severity**: Medium
- **Fix**: Implemented `endFrame` export/import for duration markers. Added `markerEndFrames` parallel int array to the GTO export (using `-1` sentinel for point markers) in both `buildSessionObject` and `updateSessionObject`. Added `markerEndFrames` parsing in `GTOGraphLoader` with graceful handling of legacy files without the field. Extended `MarkerManager.setFromFrameNumbers()` with optional `endFrames` parameter. Wired through `SessionGraph.loadFromGTO()`. Removed the TODO(#135) comment and `console.info` warning.
- **Regression Tests**: GTO-MRK-U005 through U009 (export markerEndFrames, -1 sentinel for point markers, no console.info warning, updateGTOData path), GTO-MRK-U010/U011 (import markerEndFrames, legacy file handling), MKR-038 through MKR-040 (setFromFrameNumbers with endFrames, partial array, without endFrames). 11 tests.
- **Files Changed**: `src/core/session/SessionGTOExporter.ts`, `src/core/session/GTOGraphLoader.ts`, `src/core/session/MarkerManager.ts`, `src/core/session/SessionGraph.ts`, `src/core/session/SessionGTOExporter.test.ts`, `src/core/session/GTOGraphLoader.test.ts`, `src/core/session/MarkerManager.test.ts`

## Issue #136: Omitted viewer states can leak from the previous session on project load

- **Severity**: High
- **TODO(#136) Resolved**: `SessionSerializer.fromJSON()` now resets omitted viewer state before applying restored project data, preventing stale tone mapping, ghost-frame, stereo, channel, and difference-matte state from leaking across loads.
- **Regression Tests**: `SessionSerializer.test.ts` verifies the viewer reset methods are called during restore.
- **Verification**: `SessionSerializer.test.ts` (77 tests) passes. TypeScript clean.
- **Files Changed**: `src/core/session/SessionSerializer.ts`, `src/core/session/SessionSerializer.test.ts`

## Issue #137: `fromJSON()` always injects serialization-gap warnings even when not active

- **Severity**: Medium
- **TODO(#137) Resolved**: Project-load gap warnings are now filtered to active non-default gaps only, so clean loads no longer report unused persistence gaps.
- **Regression Tests**: `SessionSerializer.test.ts` verifies clean loads stay warning-free and active gaps are still surfaced.
- **Verification**: `SessionSerializer.test.ts` (77 tests) passes. TypeScript clean.
- **Files Changed**: `src/core/session/SessionSerializer.ts`, `src/core/session/SessionSerializer.test.ts`

## Issue #138: Snapshots, auto-checkpoints, and auto-saves use the same lossy project serializer

- **Severity**: High
- **Fix**: `AppPersistenceManager` now wraps project serialization with a local-only `localPersistence` payload for auto-saves, snapshots, and auto-checkpoints. This captures viewer-only state that `.orvproject` still does not persist, including OCIO state, tone mapping, display profile, gamut mapping, color inversion, curves, channel isolation, stereo state, stereo eye transforms, stereo align mode, difference matte, blend mode, deinterlace, film emulation, perspective correction, stabilization, and uncrop. Snapshot and auto-save restore paths now reapply that local state back into both the `Viewer` and the corresponding UI controls.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/AppPersistenceManager.ts`, `src/AppPersistenceManager.test.ts`, `src/App.ts`

## Issue #139: Snapshot restore appends the snapshot onto the current session instead of replacing it

- **Severity**: High
- **Root Cause**: `restoreSnapshot()` called `fromJSON()` without clearing the current session first, causing snapshot media to be appended to the existing session.
- **Fix**: Added `session.clearSources()` call before `fromJSON()` in `restoreSnapshot()`, matching the project load pattern from Issue #121.
- **Regression Tests**: 1 test verifying clearSources is called before restore.
- **Files Changed**: `src/AppPersistenceManager.ts`

## Issue #140: Snapshot restore ignores partial-load warnings and always reports success

- **Severity**: High
- **Root Cause**: `restoreSnapshot()` discarded `fromJSON()` result and always showed success.
- **Fix**: Captured the `{ loadedMedia, warnings }` result. If warnings exist, shows them via `showAlert()` (matching project load pattern). If loadedMedia is 0, shows a more specific warning.
- **Regression Tests**: 2 tests verifying warnings are surfaced.
- **Files Changed**: `src/AppPersistenceManager.ts`

## Issue #141: Auto-save recovery deletes the only recovery entry even when recovery completed with warnings

- **Severity**: High
- **Root Cause**: `recoverAutoSave()` deleted the auto-save entry unconditionally after recovery, destroying the retry safety net.
- **Fix**: Only deletes the entry when recovery completes with no warnings. If warnings exist, keeps the entry and notes this to the user.
- **Regression Tests**: 2 tests verifying entry is preserved with warnings and deleted without.
- **Files Changed**: `src/AppPersistenceManager.ts`

## Issue #142: Disabling audio scrub does not stop the scrub snippet that is already playing

- **Severity**: Medium
- **Root Cause**: `AudioCoordinator.onAudioScrubEnabledChanged()` only flipped `_audioScrubEnabled` flag without stopping active scrub snippets.
- **Fix**: When scrub is disabled, now calls `audioPlaybackManager.pause()` to stop any active scrub snippet.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/audio/AudioCoordinator.ts`

## Issue #143: The HEIC WASM fallback can decode the wrong top-level image when `is_primary()` is unavailable

- **Severity**: Medium
- **Fix**: Added `console.warn` in `decodeHEICToImageData()` when `is_primary()` is unavailable and falling back to index 0. Added TODO(#143).
- **Regression Tests**: 1 test.
- **Files Changed**: `src/formats/HEICWasmDecoder.ts`

## Issue #144: The single 3D LUT path silently becomes a no-op when the WebGL LUT processor is unavailable

- **Severity**: High
- **Root Cause**: Log message claimed "falling back to CPU" but no CPU fallback exists. `setLUT()` accepted LUTs silently when no processor was available.
- **Fix**: Changed the fallback log to accurately say "LUT processing unavailable — no GPU processor and no CPU fallback". Added `console.warn` when `setLUT()` is called but no processor exists.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/ui/components/ColorPipelineManager.ts`

## Issue #145: File / Look / Display LUT pipeline stages are dropped entirely when the GPU LUT chain is unavailable

- **Severity**: High
- **Fix**: Added `console.warn` in `Viewer.syncLUTPipeline()` when pipeline has active stages but no GPU chain. Added TODO(#145).
- **Regression Tests**: 1 test.
- **Files Changed**: `src/ui/components/Viewer.ts`

## Issue #146: The shipped LUT Pipeline panel does not persist through project save/load at all

- **Severity**: High
- **Fix**: Added LUT Pipeline to `getSerializationGaps()` so it surfaces in save-time warnings. Added TODO(#146).
- **Regression Tests**: 1 test.
- **Files Changed**: `src/core/session/SessionSerializer.ts`

## Issue #147: The registered MXF "decoder" returns a dummy 1x1 pixel instead of actual image data

- **Severity**: High
- **Root Cause**: MXF decoder returned fake 1x1 image with `metadataOnly: true` but no consumer handled that marker.
- **Fix**: Added `console.warn` when MXF is decoded, clearly stating it's metadata-only and no video frames are decoded. Added TODO(#147).
- **Regression Tests**: 1 test.
- **Files Changed**: `src/formats/DecoderRegistry.ts`

## Issue #148: HDR VideoFrame upload failure degrades to a blank frame rather than a usable fallback

- **Severity**: High
- **Root Cause**: When `texImage2D(VideoFrame)` fails, the renderer falls through to a typed-array path that produces a blank frame for HDR VideoFrame-only images.
- **Fix**: Implemented SDR fallback via `_extractSDRFromVideoFrame()` helper that draws the VideoFrame to an `OffscreenCanvas` (browser-native HDR→SDR tone-mapping), reads back RGBA pixels via `getImageData()`, and replaces the IPImage's data using the new `overrideData()` method on `IPImage`. On fallback success: clears HDR metadata (`transferFunction`, `colorPrimaries`), nulls `image.texture` so the typed-array path creates a fresh texture, and logs a warning. On fallback failure (e.g., `OffscreenCanvas` unavailable): logs that the frame will appear blank. Added `overrideData(data, dataType, channels)` `@internal` method to `IPImage` for safe mutation of readonly fields with cache invalidation.
- **Regression Tests**: REN-VF-148 (SDR fallback works: data overridden, metadata cleared, VideoFrame released), REN-VF-148-B (blank frame when SDR extraction also fails), REN-VF-148-C (_extractSDRFromVideoFrame returns pixel data), REN-VF-148-D (_extractSDRFromVideoFrame returns null when OffscreenCanvas unavailable). 4 tests.
- **Files Changed**: `src/render/Renderer.ts`, `src/core/image/Image.ts`, `src/render/Renderer.test.ts`

## Issue #149: Share links serialize `sourceUrl` but never use it, so a clean recipient cannot reconstruct the shared media

- **Severity**: High
- **Area**: URL sharing / review-link reproducibility
- **Root Cause**: `SessionURLService.captureSessionURLState()` serialized the current source URL into `sourceUrl` (compact key `su`), and `SessionURLManager` encoded/decoded it correctly, but `applySessionURLState()` never read `state.sourceUrl`. The parallel network-share path in `AppNetworkBridge` had the same gap.
- **Fix**: Made `applySessionURLState()` async. When the session is empty (`sourceCount === 0`) and `state.sourceUrl` is present, calls `session.loadSourceFromUrl(url)` before applying view state. Added `loadSourceFromUrl(url)` to `Session.ts` with URL scheme validation (http/https only), pathname-based extension detection for video vs image routing, and proper query-param handling. Applied the same consumption pattern in `AppNetworkBridge.applyCapturedSessionURLState()`. Graceful degradation: load failures are caught, logged via `console.warn`, and remaining state (frame, transform, wipe, etc.) still applied.
- **Security**: URL scheme allowlist prevents `javascript:`, `data:`, `ftp:`, and other non-HTTP protocols. Extension extraction uses `new URL(url).pathname` to handle query params and fragments correctly.
- **Regression Tests**: SU-023 through SU-031 (sourceUrl consumed when empty, skipped when has media, load failure graceful, empty/undefined skipped, missing method handled, bootstrap integration, javascript: rejected, data: rejected), ANB-150 through ANB-154 (network bridge load, skip, failure, missing, callback delegation), plus 12 direct `Session.loadSourceFromUrl` tests (scheme validation for javascript/data/ftp/invalid, http/https accepted, video extensions routed correctly, query params handled, no-extension defaults to image).
- **Verification**: All 107 tests pass (31 SessionURLService + 64 AppNetworkBridge + 12 Session.loadSourceFromUrl), TypeScript clean.
- **Files Changed**: `src/services/SessionURLService.ts`, `src/AppNetworkBridge.ts`, `src/core/session/Session.ts`, `src/services/SessionURLService.test.ts`, `src/AppNetworkBridge.test.ts`, `src/core/session/Session.loadSourceFromUrl.test.ts` (new)

## Issue #150: Share-link URL state cannot explicitly reset defaults, so recipients keep stale local transform / wipe / OCIO / A-B state

- **Severity**: High
- **Area**: URL sharing / state application semantics
- **Root Cause**: The compact URL encoder intentionally omits default/off values (transform at identity, wipeMode='off', currentAB='A', OCIO disabled) to keep URLs short. But `applySessionURLState()` only applied fields present in the decoded state and never reset omitted fields to defaults. Recipients with non-default local state (e.g., wipe enabled, B-side compare, custom pan/zoom, OCIO active) kept their stale settings when opening a share link.
- **Fix**: Added `else` branches in `applySessionURLState()` for all encoder-omitted fields: transform resets to `DEFAULT_TRANSFORM` (deep-copied to prevent mutation), wipeMode resets to `'off'`, wipePosition resets to `0.5`, currentAB resets to `'A'`, and OCIO resets to `enabled: false` (with idempotency guard to skip when already disabled). The encoder is unchanged — the fix is entirely in the apply path.
- **Regression Tests**: SU-032 (absent transform resets to default), SU-033 (absent wipeMode resets to 'off'), SU-034 (absent currentAB resets to 'A'), SU-035 (absent OCIO resets to disabled when enabled), SU-036 (absent OCIO skips setState when already disabled), SU-037 (present non-default values still applied — no regression), SU-038 (full round-trip: encode default state → decode → apply → all fields at defaults), SU-039 (absent wipePosition resets to 0.5).
- **Verification**: All 63 tests pass (39 SessionURLService + 24 SessionURLManager), TypeScript clean.
- **Files Changed**: `src/services/SessionURLService.ts`, `src/services/SessionURLService.test.ts`

## Issue #151: Unified preferences export/import/reset drops FPS indicator settings even though the shipped overlay persists them

- **Severity**: Medium
- **Area**: Preferences portability / overlay state persistence
- **Root Cause**: `PreferencesManager` had `fpsIndicator` storage key with read/write methods, but `buildExportPayload()` never included it, `importAll()` never restored it, and `resetAll()` didn't emit `fpsIndicatorPrefsChanged`. Additionally, `FPSIndicator` never subscribed to the change event, so even if prefs were updated externally, the live UI wouldn't reflect it.
- **Fix**: (1) Added `fpsIndicatorPrefs` to `PreferencesExportPayload` type and `buildExportPayload()`. Added restoration in `importAll()` (with null→defaults handling). Added `fpsIndicatorPrefsChanged` emission in `resetAll()`. (2) Added `fpsIndicatorPrefsChanged` subscription in `FPSIndicator` constructor that updates live state, styles, and render. Added `updatingPrefs` re-entrancy guard to prevent write-back loops between `setState()` persisting prefs and the incoming event handler.
- **Regression Tests**: CPRF-FPS-011 (export includes prefs), CPRF-FPS-012 (import restores prefs), CPRF-FPS-013 (import null resets to defaults), CPRF-FPS-014 (resetAll emits event), CPRF-FPS-015 (full round-trip), FPS-130 (live state updates on event), FPS-131 (stateChanged emitted), FPS-132 (DOM styles updated), FPS-133 (subscription cleaned up on dispose).
- **Verification**: All 130 tests pass (84 PreferencesManager + 46 FPSIndicator), TypeScript clean.
- **Files Changed**: `src/core/PreferencesManager.ts`, `src/ui/components/FPSIndicator.ts`, `src/core/PreferencesManager.test.ts`, `src/ui/components/FPSIndicator.test.ts`

## Issue #152: Large parts of the unified preferences model are storage-only and never affect runtime behavior

- **Severity**: Medium
- **Area**: Preferences / dead user configuration
- **Root Cause**: `ColorDefaults`, `ExportDefaults`, and most `GeneralPrefs` fields (`defaultFps`, `autoPlayOnLoad`, `showWelcome`) are persisted, exported, and imported by `PreferencesManager`, but no production code reads `getColorDefaults()` or `getExportDefaults()`, and the unused `GeneralPrefs` fields have no runtime consumers. Only `userName` is actually used (by NotePanel and NetworkControl).
- **Fix**: Added TODO(#152) JSDoc to `ColorDefaults` and `ExportDefaults` interfaces, and per-field annotations on unused `GeneralPrefs` fields, documenting each as storage-only with no production consumer. Added one-time `console.info` in constructor (gated by static flag) referencing TODO(#152). No API changes — fields preserved for future wiring.
- **TODO(#152) Partial**: Wired `autoPlayOnLoad` and `defaultFps` preferences. `handleSourceLoaded()` now accepts optional `autoPlayOnLoad` parameter; when true and source has >1 frame and not already playing, calls `session.play()`. `App` constructor reads `defaultFps` and sets `session.fps` after creation, ensuring all downstream fallbacks respect it. Remaining unwired: `showWelcome`, `ColorDefaults`, `ExportDefaults.frameburnEnabled/frameburnConfig`.
- **Regression Tests**: CPRF-152-001 through 005 (unchanged), SLH-U060 through SLH-U064 (5 new: auto-play on/off, still image guard, already-playing guard, undefined guard).
- **Files Changed**: `src/core/PreferencesManager.ts`, `src/handlers/sourceLoadedHandlers.ts`, `src/AppSessionBridge.ts`, `src/handlers/sourceLoadedHandlers.test.ts`

## Issue #153: Drag-and-drop GTO/RV session loading loses sidecar file resolution that the file picker preserves

- **Severity**: High
- **Area**: Session ingest / drag-and-drop parity
- **Root Cause**: The header file-picker path built an `availableFiles` map from companion files and passed it to `loadFromGTO()`, enabling sidecar media/CDL resolution by basename. The viewer drag-and-drop path called `session.loadFromGTO(content)` without any `availableFiles` map, silently losing sidecar resolution.
- **Fix**: In `ViewerInputHandler.ts`, moved session file detection (`.gto`/`.rv`) before sequence detection to match HeaderBar's priority order. When a session file is found among dropped files, builds an `availableFiles` `Map<string, File>` from all other dropped files (keyed by `file.name` basename), and passes it as the second argument to `session.loadFromGTO(content, availableFiles)`. Non-session drops are unaffected.
- **Regression Tests**: SIDECAR-001 (GTO + companions builds map), SIDECAR-002 (GTO alone passes empty map), SIDECAR-003 (.rv extension works), SIDECAR-004 (multiple companions with correct basenames), SIDECAR-005 (non-session files fall through to loadFile), SIDECAR-006 (session file excluded from map).
- **Verification**: All 48 ViewerInputHandler tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/ViewerInputHandler.ts`, `src/ui/components/ViewerInputHandler.test.ts`

## Issue #154: Drag-and-drop skips single-file sequence inference that the file picker supports

- **Severity**: Medium
- **Area**: Media ingest / sequence detection consistency
- **Root Cause**: The header file-picker path called `inferSequenceFromSingleFile()` when exactly one image file was selected, promoting numbered frames to full sequences. The drag-and-drop path in `ViewerInputHandler.ts` only did sequence detection for multiple image files; a single numbered frame fell straight through to single-file loading.
- **Fix**: Added `inferSequenceFromSingleFile(singleFile, fileArray)` call in the drag-and-drop handler when exactly one image file is dropped. If inference succeeds, loads as sequence via `session.loadSequence()`. If it returns null or throws, falls through to single-file `loadFile()` as before. Matches HeaderBar's pattern exactly.
- **Regression Tests**: SEQ-INFER-001 (inference called with correct args), SEQ-INFER-002 (successful inference loads as sequence), SEQ-INFER-003 (null inference falls through to loadFile), SEQ-INFER-004 (multiple images still use existing getBestSequence — no regression), SEQ-INFER-005 (inference error falls through to loadFile).
- **Verification**: All 53 ViewerInputHandler tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/ViewerInputHandler.ts`, `src/ui/components/ViewerInputHandler.test.ts`

## Issue #156: Dropping a session bundle with multiple image files can ignore the session file completely

- **Severity**: High
- **Area**: Session ingest / drag-and-drop branch ordering
- **Root Cause**: The drag-and-drop handler checked `imageFiles.length > 1` (sequence detection) before looking for `.rv`/`.gto` session files. When a session bundle was dropped with companion image files, the sequence detection fired first, loaded the images as a sequence, and returned — skipping the session file entirely.
- **Fix**: Already resolved by Issue #153's fix. Session file detection (`.rv`/`.gto`) was moved before sequence detection in `ViewerInputHandler.onDrop()`. The session file now takes priority, and companion files are passed as `availableFiles` for sidecar resolution. The SIDECAR-004 test from Issue #153 explicitly covers the multi-file + session scenario.
- **Verification**: Confirmed by code inspection — session detection at lines 742-764 runs before sequence detection at line 766+.
- **Files Changed**: (same as Issue #153)

## Issue #155: Drag-and-drop treats `.rvedl` as media and routes it into the wrong loader

- **Severity**: Medium
- **Area**: Session ingest / EDL workflow
- **Root Cause**: The drag-and-drop handler only special-cased `.rv`/`.gto` extensions. `.rvedl` files fell through to `session.loadFile()` which dispatches to image/video loading, and unknown extensions default to `'image'`. The header file-picker had a dedicated RVEDL parse path via `session.loadEDL(text)`.
- **Fix**: Added `.rvedl` detection in the `ViewerInputHandler.onDrop()` handler, placed before the `.rv`/`.gto` check (matching HeaderBar ordering). When detected, reads the file as text via `file.text()` and calls `session.loadEDL(text)`. Shows info alert on success with source summary, warning if no entries found, and error alert on failure — all matching HeaderBar's pattern.
- **Regression Tests**: EDL-DROP-001 (`.rvedl` drop calls loadEDL with correct text), EDL-DROP-002 (not routed through loadFile/loadFromGTO/loadSequence), EDL-DROP-003 (error handled gracefully), EDL-DROP-004 (`.rv`/`.gto` still works — no regression), EDL-DROP-005 (case-insensitive `.RVEDL` recognized).
- **Verification**: All 58 ViewerInputHandler tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/ViewerInputHandler.ts`, `src/ui/components/ViewerInputHandler.test.ts`

## Issue #157: Unsupported dropped files are deliberately misclassified as images instead of being rejected up front

- **Severity**: Medium
- **Area**: File ingest / unsupported-format handling
- **Root Cause**: `detectMediaTypeFromFile()` returned `'image'` for any unrecognized extension/MIME type ("default to image to preserve existing behavior"). `SessionMedia.loadFile()` only branched into image/video loading with no unsupported-file path. Non-media files were pushed through the image loader, producing misleading downstream errors.
- **Fix**: Changed `detectMediaTypeFromFile()` to return `'unknown'` for unrecognized file types instead of `'image'`. Added `'unknown'` handling in both `SessionMedia.loadFile()` and `MediaManager.loadFile()` that throws a clear `Error('Unsupported file type: ${file.name}')` with `console.warn`. The existing try/catch in `ViewerInputHandler.onDrop()` already shows this error to users via `showAlert()`. Updated `MediaManager.test.ts` MM-027 to expect `'unknown'`. `filterImageFiles()` is unaffected (uses its own independent extension set).
- **Regression Tests**: 38 SupportedMediaFormats tests (known image/video extensions, MIME types, MIME priority, unrecognized extensions return 'unknown', no-extension returns 'unknown'), SM-084 through SM-086 (loadFile rejects unknown types, no source added, known types still work).
- **Verification**: All 239 tests pass (38 SupportedMediaFormats + 89 SessionMedia + 112 MediaManager), TypeScript clean.
- **Files Changed**: `src/utils/media/SupportedMediaFormats.ts`, `src/core/session/SessionMedia.ts`, `src/core/session/MediaManager.ts`, `src/core/session/MediaManager.test.ts`, `src/utils/media/SupportedMediaFormats.test.ts` (new), `src/core/session/SessionMedia.test.ts`

## Issue #158: The dedicated `Open Project` button cannot actually pick most formats that its loader supports

- **Severity**: Medium
- **Area**: Project/session open workflow
- **Root Cause**: The project file input's `accept` attribute was set to `'.orvproject'` only, but `openProject()` in `AppPersistenceManager` supports `.orvproject`, `.rv`, `.gto`, and `.rvedl`. The browser file picker filtered out the other three formats.
- **Fix**: Changed the `accept` attribute from `'.orvproject'` to `'.orvproject,.rv,.gto,.rvedl'`, matching all formats that `openProject()` handles.
- **Regression Tests**: HDR-U024 updated to verify accept attribute contains all four extensions.
- **Verification**: All 156 HeaderBar tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/layout/HeaderBar.ts`, `src/ui/components/layout/HeaderBar.test.ts`

## Issue #159: Plugin settings have backup/import APIs but are excluded from the app's real preferences backup flow

- **Severity**: Medium
- **Area**: Plugin persistence / backup portability
- **Root Cause**: `PluginSettingsStore` had `exportAll()`/`importAll()` backup helpers, but `PreferencesManager`'s unified export/import payload had no plugin-settings field. No production code wired plugin settings into the backup flow.
- **Fix**: Added `PluginSettingsProvider` callback interface to `PreferencesManager` with `exportAll()`, `importAll()`, `clearAll()` methods. `buildExportPayload()` includes plugin settings when provider is set. `importAll()` delegates to provider (with `isRecord` guard). `resetAll()` calls `provider.clearAll()`. Added `clearAll()` to `PluginSettingsStore` (resets all registered plugins to schema defaults). Wired in `main.ts` via `preferencesManager.setPluginSettingsProvider(pluginRegistry.settingsStore)`.
- **Regression Tests**: CPRF-159-001 through CPRF-159-010 (export with/without provider, import with/without provider, import non-object skipped, reset with/without provider, null provider removal, round-trip, imported event payload).
- **Verification**: All 144 tests pass (99 PreferencesManager + 45 PluginSettingsStore), TypeScript clean.
- **Files Changed**: `src/core/PreferencesManager.ts`, `src/plugin/PluginSettingsStore.ts`, `src/main.ts`, `src/core/PreferencesManager.test.ts`

## Issue #160: `openProject()` only resyncs compare/stack UI for `.orvproject`, not for `.rv`/`.gto` loads

- **Severity**: Medium
- **Area**: Project/session open workflow / UI truthfulness
- **Root Cause**: `openProject()` called `syncControlsFromState()` only in the `.orvproject` branch. The `.rv`/`.gto` branch called `session.loadFromGTO(content)` and returned without syncing compare/stack/wipe/PAR/background controls. The `settingsLoaded` event fired by GTO loading already syncs color, CDL, filter, transform, crop, lens, and noiseReduction — but NOT wipe, watermark, PAR, backgroundPattern, or stack.
- **Fix**: After `session.loadFromGTO()` in the GTO branch, calls `syncControlsFromState()` with only the controls that `settingsLoaded` does NOT cover: wipe (from `viewer.getWipeState()`), watermark (`getWatermarkState()`), PAR (`getPARState()`), backgroundPattern (`getBackgroundPatternState()`), and stack (cleared via `clearLayers`). Does NOT double-apply color/CDL/filter/transform/crop/lens/noiseReduction that `settingsLoaded` already handles.
- **Regression Tests**: APM-160a (wipe sync for .rv), APM-160b (wipe sync for .gto), APM-160c (color NOT re-synced — handled by settingsLoaded), APM-160d (comprehensive: only wipe/watermark/PAR/backgroundPattern synced, others NOT), APM-160e (graceful without optional controls).
- **Verification**: All 56 AppPersistenceManager tests pass, TypeScript clean.
- **Files Changed**: `src/AppPersistenceManager.ts`, `src/AppPersistenceManager.test.ts`

## Issue #161: `openProject()` creates an auto-checkpoint before it knows whether anything will actually be loaded

- **Severity**: Medium
- **Area**: Project/session open workflow / recovery history quality
- **Root Cause**: `openProject()` unconditionally called `createAutoCheckpoint('Before Project Load')` at the top of the method, before any extension/type branching. This meant unsupported files, `.rvedl` imports (which don't replace the session), and other non-replacing flows all created misleading recovery checkpoints.
- **Fix**: Moved the `createAutoCheckpoint('Before Project Load')` call into only the two branches that actually replace session state: the `.orvproject` branch and the `.rv`/`.gto` branch. The `.rvedl` import branch and unsupported-file fallback no longer trigger checkpoints.
- **Regression Tests**: Added APM-161a through APM-161e — verify checkpoint IS created for `.orvproject`, `.rv`, `.gto` loads, and is NOT created for `.rvedl` import or unsupported file types.
- **Verification**: All 22,463 tests pass, TypeScript clean.
- **Files Changed**: `src/AppPersistenceManager.ts`, `src/AppPersistenceManager.test.ts`

## Issue #162: The project-open path for `.rv/.gto` can never provide companion files for session-side media resolution

- **Severity**: Medium
- **Area**: Project/session open workflow / RV-GTO interchange
- **Root Cause**: `openProject()` accepted only a single `File` and the project file input was not multi-select. The `.rv`/`.gto` branch called `session.loadFromGTO(content)` without passing an `availableFiles` map, even though the GTO importer supports companion-file resolution for referenced media/CDL files.
- **Fix**: Made the project file input multi-select. Changed `openProject(file: File)` to `openProject(file: File, companionFiles?: File[])`. In the `.rv`/`.gto` branch, builds a `Map<string, File>` from companion files and passes it to `session.loadFromGTO(content, availableFiles)`. Single-file selection remains backward compatible.
- **Regression Tests**: Added APM-162a through APM-162e — verify companion files are passed through for `.rv`/`.gto`, single file still works, empty companions handled, `.orvproject` ignores companions.
- **Verification**: All 22,468 tests pass, TypeScript clean.
- **Files Changed**: `src/AppPersistenceManager.ts`, `src/AppPersistenceManager.test.ts`, `src/ui/components/layout/HeaderBar.ts`, `src/ui/components/layout/HeaderBar.test.ts`, `src/AppPlaybackWiring.ts`

## Issue #163: RVEDL import parses and stores entries, but the timeline editor never consumes them

- **Severity**: Medium
- **Area**: EDL workflow / timeline visibility
- **Root Cause**: `TimelineEditorService` did not subscribe to the `edlLoaded` event and `syncFromGraph()` never read `session.edlEntries`. RVEDL import succeeded but the timeline editor never displayed the imported cut structure.
- **Fix**: Added `edlLoaded` event subscription to trigger resync. Added `buildEDLFromRVEDLEntries()` to convert RVEDL entries into timeline cuts by matching basenames against loaded sources. Added RVEDL branch in `syncFromGraph()` with priority: SequenceGroupNode > Playlist > RVEDL > Fallback.
- **Regression Tests**: Added TLE-037 through TLE-046 — unit tests for EDL-to-cut conversion (basename matching, frame clamping, empty input) and integration tests for sync priority and event-driven resync.
- **Verification**: All 22,478 tests pass, TypeScript clean.
- **Files Changed**: `src/services/TimelineEditorService.ts`, `src/services/TimelineEditorService.test.ts`

## Issue #164: Loaded RVEDL state is not saved into `.orvproject` at all

- **Severity**: Medium
- **Area**: EDL workflow / project persistence
- **Root Cause**: `SessionState` had no `edlEntries` field, and `SessionSerializer` neither serialized nor restored RVEDL entries. Saving as `.orvproject` silently dropped the imported cut list.
- **Fix**: Added `edlEntries?: RVEDLEntry[]` to `SessionState`. `toJSON()` serializes entries when non-empty. `fromJSON()` restores them via new `Session.setEdlEntries()` which fires `edlLoaded` so `TimelineEditorService` picks up restored EDL.
- **Regression Tests**: Added SER-EDL-001 through SER-EDL-008 — toJSON includes/omits entries, fromJSON restores/skips, event firing, round-trip.
- **Verification**: All 22,486 tests pass, TypeScript clean.
- **Files Changed**: `src/core/session/SessionState.ts`, `src/core/session/SessionGraph.ts`, `src/core/session/Session.ts`, `src/core/session/SessionSerializer.ts`, `src/core/session/SessionSerializer.test.ts`

## Issue #165: The viewer's persisted texture-filter preference is outside the app's real preferences backup/import path

- **Severity**: Medium
- **Area**: Viewer preferences / backup portability
- **Root Cause**: The texture-filter mode was stored under a standalone localStorage key (`openrv.filterMode`) that wasn't part of `PreferencesManager`'s export/import/reset payload.
- **Fix**: Added `filterMode` to `PreferencesManager` with get/set methods, export, import (with validation for 'nearest'/'linear'), and reset. Unified the localStorage key to `openrv-prefs-filter-mode`. ViewerIndicators updated to use the same key.
- **Regression Tests**: Added CPRF-165-001 through CPRF-165-011 — export includes filterMode, import restores/clears, reset clears, round-trip, getter/setter edge cases.
- **Verification**: All 22,497 tests pass, TypeScript clean.
- **Files Changed**: `src/core/PreferencesManager.ts`, `src/core/PreferencesManager.test.ts`, `src/ui/components/ViewerIndicators.ts`, `src/ui/components/ViewerIndicators.test.ts`

## Issue #166: Display profile state omitted from unified preferences export/import

- **Severity**: Medium
- **Area**: Display preferences / backup portability
- **Root Cause**: The display profile was persisted under its own localStorage key but excluded from `PreferencesManager`'s export/import payload.
- **Fix**: Added `displayProfile` to the unified preferences system — export, import (with `sanitizeDisplayProfile()` validation and value clamping), reset. `DisplayTransfer.ts` continues to work unchanged via existing key.
- **Regression Tests**: 13 tests covering get/set, export, import, round-trip, reset, validation, clamping, corrupt data.
- **Verification**: All 22,524 tests pass, TypeScript clean.
- **Files Changed**: `src/core/PreferencesManager.ts`, `src/core/PreferencesManager.test.ts`

## Issue #167: Timeline timecode-display mode omitted from unified preferences backup/import/reset

- **Severity**: Medium
- **Area**: Timeline preferences / backup portability
- **Root Cause**: Timeline display mode used a standalone localStorage key `openrv.timeline.displayMode` not included in `PreferencesManager` or its reset flow.
- **Fix**: Added `timelineDisplayMode` to `CORE_PREFERENCE_STORAGE_KEYS` with unified key. Updated `Timeline.ts` to reference the shared key. Added export, import (with mode validation), and reset support.
- **Regression Tests**: 14 tests covering get/set, export, import, round-trip, reset, all four valid modes, invalid mode rejection.
- **Verification**: All 22,524 tests pass, TypeScript clean.
- **Files Changed**: `src/core/PreferencesManager.ts`, `src/core/PreferencesManager.test.ts`, `src/ui/components/Timeline.ts`, `src/ui/components/Timeline.test.ts`

## Issue #168: Missing-frame overlay mode bypasses the app's real preferences portability/reset flow

- **Severity**: Medium
- **Area**: Viewer preferences / backup portability
- **Root Cause**: Missing-frame mode was persisted under standalone key `openrv.missingFrameMode` not included in `PreferencesManager`'s export/import/reset.
- **Fix**: Added `missingFrameMode` to `CORE_PREFERENCE_STORAGE_KEYS` with unified key. Viewer.ts reads unified key first with automatic migration from legacy key. Added export, import (with validation for 4 valid modes), and reset support.
- **Regression Tests**: Added CPRF-168-001 through CPRF-168-014 — getter/setter, export, import, round-trip, reset, all four modes, invalid value handling.
- **Verification**: All 22,538 tests pass, TypeScript clean.
- **Files Changed**: `src/core/PreferencesManager.ts`, `src/core/PreferencesManager.test.ts`, `src/ui/components/Viewer.ts`, `src/ui/components/Viewer.render.test.ts`

## Issue #169: Multi-source layout persistence exists in code and tests, but production never calls it

- **Severity**: Medium
- **Area**: Multi-source layout / persistence wiring
- **Root Cause**: `MultiSourceLayoutStore` had `saveToStorage()`/`loadFromStorage()` methods that were never called in runtime wiring, so layout state wasn't persisted across reloads.
- **Fix**: Constructor now calls `loadFromStorage()` on initialization. `emitLayoutChanged()` now triggers debounced (300ms) `saveToStorage()`. Added `flushSave()` for tests/shutdown.
- **Regression Tests**: 6 tests — restore on construction, auto-save on change, debounce coalescing, no-op when unchanged, flush behavior.
- **Verification**: All 22,544 tests pass, TypeScript clean.
- **Files Changed**: `src/ui/multisource/MultiSourceLayoutStore.ts`, `src/ui/multisource/__tests__/MultiSourceLayoutStore.test.ts`

## Issue #170: Playback FPS reporting can contradict the dropped-frame counter

- **Severity**: Medium
- **Area**: Playback metrics / viewer diagnostics
- **Root Cause**: `trackFrameAdvance()` was called for skipped frames, inflating measured FPS while the dropped-frame counter correctly showed skips — contradictory diagnostics.
- **Fix**: `advanceFrame()` now accepts `skipped: boolean = false`. When true, `trackFrameAdvance()` is skipped. Updated three call sites: absolute timeout skip, starvation timeout skip, and accumulator overflow intermediate frames.
- **Regression Tests**: PE-165 (skipped frames don't inflate FPS), PE-166 (dropped-frame counter unaffected), PE-167 (normal playback unchanged).
- **Verification**: All 22,547 tests pass, TypeScript clean.
- **Files Changed**: `src/core/session/PlaybackEngine.ts`, `src/core/session/PlaybackEngine.test.ts`

## Issue #171: Snapshot export is one-way in the shipped UI

- **Severity**: Medium
- **Area**: Snapshot workflow / interchange
- **Root Cause**: `SnapshotManager.importSnapshot()` was fully implemented but never wired to any UI control. The panel had Export but no Import action.
- **Fix**: Added an "Import" button to the SnapshotPanel footer with file picker (`.json`), calls `importSnapshot()`, refreshes the list on success, shows error alert on failure via `showAlert()`.
- **Regression Tests**: 5 tests — import button exists, text content, file picker triggered, successful import refreshes list, failed import shows error.
- **Verification**: All 22,552 tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/SnapshotPanel.ts`, `src/ui/components/__tests__/SnapshotPanel.test.ts`

## Issue #172: The unified preferences export/import/reset system is effectively unreachable in production UI

- **Severity**: Medium
- **Area**: Preferences workflow / UI wiring
- **Root Cause**: `PreferencesManager` had `exportAll()`, `importAll()`, and `resetAll()` methods but no production UI invoked them.
- **Fix**: Added three menu items to the Help dropdown: "Export Preferences" (downloads JSON), "Import Preferences" (file picker + importAll with error handling), "Reset All Preferences" (confirmation dialog + resetAll). Wired through `AppPlaybackWiring`.
- **Regression Tests**: 14 tests — menu items exist with correct labels, emit correct events, export triggers download, import opens picker and calls importAll, failed import shows error, reset shows confirmation, reset skipped on cancel.
- **Verification**: All 22,565 tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/layout/HeaderBar.ts`, `src/ui/components/layout/HeaderBar.test.ts`, `src/AppPlaybackWiring.ts`, `src/AppPlaybackWiring.test.ts`

## Issue #173: Annotation JSON support is export-only in the shipped app

- **Severity**: Medium
- **Area**: Annotation workflow / interchange
- **Root Cause**: `parseAnnotationsJSON()` and `applyAnnotationsJSON()` were implemented but never wired to any UI control. The export menu had "Export Annotations (JSON)" but no import counterpart.
- **Fix**: Added "Import Annotations (JSON)" menu item to ExportControl dropdown. Handler opens file picker (.json), validates via `parseAnnotationsJSON()`, applies in replace mode via `applyAnnotationsJSON()`, shows success count or error feedback.
- **Regression Tests**: 7 tests — menu item exists, event emission, file picker opens, valid file triggers parse+apply+success, invalid JSON shows error, apply exception shows error.
- **Verification**: All 22,572 tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/ExportControl.ts`, `src/ui/components/ExportControl.test.ts`, `src/AppPlaybackWiring.ts`, `src/AppPlaybackWiring.test.ts`

## Issue #174: Marker import is merge-only in the shipped UI and silently drops frame collisions

- **Severity**: Medium
- **Area**: Marker workflow / interchange
- **Root Cause**: Import button hardcoded `importMarkers('merge')` with no user choice. Frame collisions in merge mode were silently skipped.
- **Fix**: Import now prompts for merge/replace choice when existing markers are present (skips dialog when empty). Merge mode tracks and reports collision count via `showAlert()` with correct singular/plural grammar. Replace mode clears before importing.
- **Regression Tests**: MARK-U151 through MARK-U157 — mode choice dialog shown/skipped, replace clears existing, merge preserves existing, collision count reported, single collision grammar, no alert on zero collisions.
- **Verification**: All 22,579 tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/MarkerListPanel.ts`, `src/ui/components/MarkerListPanel.test.ts`

## Issue #175: The shipped export UI ignores the app's saved export-default preferences

- **Severity**: Medium
- **Area**: Export workflow / preferences
- **Root Cause**: `ExportControl` hardcoded quality (0.92/0.95) and format ('png') values. `getExportDefaults()` from `PreferencesManager` was never consumed in production.
- **Fix**: `ExportControl` now reads from `preferencesManager.getExportDefaults()` at call time for format, quality, and includeAnnotations. Falls back to hardcoded defaults when no preferences are stored. Annotations checkbox initial state also driven by preference.
- **Regression Tests**: 14 tests — fallback to defaults, each export type respects persisted quality/format/annotations, runtime preference changes picked up, combined format+quality.
- **Verification**: All 22,592 tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/ExportControl.ts`, `src/ui/components/ExportControl.test.ts`, `src/core/PreferencesManager.ts`

## Issue #176: The export menu's `Include annotations` option does not apply to `Copy to Clipboard`

- **Severity**: Medium
- **Area**: Export UI / behavior consistency
- **Root Cause**: `copyRequested` event carried no annotation flag, and both the wiring and keyboard action hardcoded `viewer.copyFrameToClipboard(true)`.
- **Fix**: `copyRequested` now carries `{ includeAnnotations: boolean }` from the checkbox state. AppPlaybackWiring uses the flag. Keyboard shortcut reads `includeAnnotations` from `PreferencesManager.getExportDefaults()`.
- **Regression Tests**: 5 tests — copy respects checkbox on/off, wiring passes flag through, keyboard shortcut reads preferences.
- **Verification**: All 22,597 tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/ExportControl.ts`, `src/ui/components/ExportControl.test.ts`, `src/AppPlaybackWiring.ts`, `src/AppPlaybackWiring.test.ts`, `src/services/KeyboardActionMap.ts`, `src/services/KeyboardActionMap.test.ts`

## Issue #177: Notes import performs almost no schema validation and can inject malformed notes

- **Severity**: Medium
- **Area**: Notes workflow / data integrity
- **Root Cause**: `NoteManager.fromSerializable()` inserted imported objects verbatim with no field validation. Missing/invalid fields could corrupt live UI state.
- **Fix**: Added `validateNoteEntry()` that validates required fields (frameStart, frameEnd as numbers; text as string), defaults optional fields (author, status, createdAt, color, sourceIndex, parentId, id), filters out invalid entries. Returns `ImportResult` with imported/rejected counts. NotePanel shows alert when entries are skipped.
- **Regression Tests**: 20 tests — valid imports, missing required fields, wrong types, NaN/Infinity rejection, non-object entries, optional defaults, mixed batches, ID generation, status preservation.
- **Verification**: All 22,617 tests pass, TypeScript clean.
- **Files Changed**: `src/core/session/NoteManager.ts`, `src/core/session/NoteManager.test.ts`, `src/ui/components/NotePanel.ts`, `src/AppNetworkBridge.test.ts`

## Issue #178: Marker import silently drops invalid entries with no summary

- **Severity**: Medium
- **Area**: Marker workflow / data integrity
- **Root Cause**: Invalid marker entries (failing field validation) were silently filtered during import with no user feedback. (Merge collision reporting was already fixed in #174.)
- **Fix**: Import now tracks invalid entry count and shows a comprehensive summary alert: "X markers imported." + optional "Y invalid entries skipped." + optional "Z markers skipped due to frame collisions." Correct singular/plural grammar.
- **Regression Tests**: MARK-U158 (invalid entries counted), MARK-U159 (no warning on clean import), MARK-U160A (mixed valid/invalid/collisions), MARK-U160B (singular grammar).
- **Verification**: All 22,621 tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/MarkerListPanel.ts`, `src/ui/components/MarkerListPanel.test.ts`

## Issue #179: ShotGrid note pull flattens note timing and review metadata

- **Severity**: Medium
- **Area**: ShotGrid integration / notes workflow
- **Root Cause**: ShotGrid API request didn't fetch frame fields. All pulled notes hardcoded to frame 1-1 with fresh local timestamps, losing original review context.
- **Fix**: Added `sg_first_frame`, `sg_last_frame`, `frame_range` to API request. Notes use ShotGrid frame range (with fallback chain to frame_range string, then 1-1). Original `created_at` preserved via new `addNote()` `createdAt` option.
- **Regression Tests**: 9 tests — frame range from sg_first_frame/sg_last_frame, fallback to frame_range string, fallback to 1-1, created_at preserved, created_at fallback, addNote createdAt/status overrides, API request fields.
- **Verification**: All 22,630 tests pass, TypeScript clean.
- **Files Changed**: `src/integrations/ShotGridBridge.ts`, `src/integrations/ShotGridBridge.test.ts`, `src/integrations/ShotGridIntegrationBridge.ts`, `src/integrations/ShotGridIntegrationBridge.test.ts`, `src/core/session/NoteManager.ts`, `src/core/session/NoteManager.test.ts`

## Issue #180: ShotGrid note deduplication resets on disconnect, so re-pulls can duplicate everything

- **Severity**: Medium
- **Area**: ShotGrid integration / notes workflow
- **Root Cause**: Deduplication relied on in-memory `sgNoteIdMap` cleared on disconnect. Pulled notes didn't persist the ShotGrid note ID, so re-pulling after reconnect duplicated everything.
- **Fix**: Added `externalId` field to `Note` interface for persisting remote IDs. `addNotesFromShotGrid()` stores ShotGrid note ID as `externalId`. Deduplication falls back to `noteManager.findNoteByExternalId()` after in-memory cache miss. Re-populates cache on match for fast-path future lookups.
- **Regression Tests**: 10 tests — externalId persistence, findNoteByExternalId, dedup after disconnect/reconnect, mixed new+existing, externalId propagation.
- **Verification**: All 22,640 tests pass, TypeScript clean.
- **Files Changed**: `src/core/session/NoteManager.ts`, `src/core/session/NoteManager.test.ts`, `src/integrations/ShotGridIntegrationBridge.ts`, `src/integrations/ShotGridIntegrationBridge.test.ts`, `src/core/session/GTOGraphLoader.ts`, `src/ui/components/NotePanel.e2e.test.ts`

## Issue #181: Annotation PDF export can fail with no user-visible feedback when popups are blocked

- **Severity**: Medium
- **Area**: Export workflow / annotations
- **Root Cause**: `exportAnnotationsPDF(...)` was called with `void` (no catch), so popup-blocked throws were swallowed with no user feedback.
- **Fix**: Added `.catch()` handler around the export call that shows a user-visible alert with the error message and popup-allow guidance.
- **Regression Tests**: PW-015b (popup-blocked shows alert), PW-015c (other errors surface), PW-015d (successful export no error).
- **Verification**: All 22,643 tests pass, TypeScript clean.
- **Files Changed**: `src/AppPlaybackWiring.ts`, `src/AppPlaybackWiring.test.ts`

## Issue #182: Fullscreen failures are reduced to console warnings, leaving the UI looking dead

- **Severity**: Low
- **Area**: Window management / browser integration
- **Root Cause**: `FullscreenManager.enter()`/`exit()` swallowed browser API failures with `console.warn()`. No user-visible feedback.
- **Fix**: `FullscreenManager` now emits `fullscreenError` events and re-throws errors. `AppPlaybackWiring` catches failures and shows a warning alert: "Fullscreen is not available. Your browser may be blocking it."
- **Regression Tests**: FS-U022/U023 (error events emitted), FS-U024/U025 (no error on success), PW-008b (failure shows alert), PW-008c (success no error).
- **Verification**: All 22,649 tests pass, TypeScript clean.
- **Files Changed**: `src/utils/ui/FullscreenManager.ts`, `src/utils/ui/FullscreenManager.test.ts`, `src/AppPlaybackWiring.ts`, `src/AppPlaybackWiring.test.ts`

## Issue #183: DCC `syncColor` advertises LUT sync, but the app silently ignores it

- **Severity**: Medium
- **Area**: DCC integration / color sync
- **Root Cause**: Production wiring in `AppDCCWiring.ts` only forwarded exposure/gamma/temperature/tint from `syncColor`, ignoring the `lutPath` field defined in the protocol.
- **Fix**: Added `fetchAndApplyLUT()` helper that fetches the LUT URL, parses it via the app's universal LUT parser (supports .cube, .3dl, .csp, .itx, .look, .lut, .nk, .mga), validates it's a 3D LUT, and applies it to both viewer and colorControls. Failures handled gracefully without breaking color sync.
- **Regression Tests**: DCCFIX-030 (LUT fetched and applied), DCCFIX-031 (no lutPath no fetch), DCCFIX-032 (network error graceful), DCCFIX-033 (HTTP 404 graceful), DCCFIX-034 (empty string no fetch).
- **Verification**: All 22,654 tests pass, TypeScript clean.
- **Files Changed**: `src/AppDCCWiring.ts`, `src/AppWiringFixes.test.ts`

## Issue #184: DCC bridge defines outbound `annotationAdded`, but production never emits it

- **Severity**: Medium
- **Area**: DCC integration / review sync
- **Root Cause**: `sendAnnotationAdded()` was defined in the bridge but never called from production wiring. DCC clients got no annotation notifications.
- **Fix**: Wired `paintEngine.on('strokeAdded')` to `dccBridge.sendAnnotationAdded(frame, type, id)` with `mapAnnotationType()` helper. Backward compatible when `paintEngine` is not provided. Subscription cleaned up on dispose.
- **Regression Tests**: DCCFIX-040 (pen stroke emits), DCCFIX-041 (text emits), DCCFIX-042 (shape emits), DCCFIX-043 (no emission after dispose), DCCFIX-044 (backward compat without paintEngine).
- **Verification**: All 22,659 tests pass, TypeScript clean.
- **Files Changed**: `src/AppDCCWiring.ts`, `src/App.ts`, `src/AppWiringFixes.test.ts`

## Issue #185: DCC `loadMedia` failures are never reported back to the requesting tool

- **Severity**: Medium
- **Area**: DCC integration / error handling
- **Root Cause**: `loadMedia` catch blocks only used `console.error`. The DCC protocol had an `error` message type but no production code sent it for load failures.
- **Fix**: Added `sendError(code, message, id?)` convenience method to `DCCBridge`. Both video and image load catch blocks now call `dccBridge.sendError('LOAD_MEDIA_FAILED', ...)` with file path, error details, and request ID for correlation.
- **Regression Tests**: DCCFIX-050 (video error sent), DCCFIX-051 (image error sent), DCCFIX-052 (success no error), DCCFIX-053/054 (error messages include file path).
- **Verification**: All 22,664 tests pass, TypeScript clean.
- **Files Changed**: `src/integrations/DCCBridge.ts`, `src/AppDCCWiring.ts`, `src/AppWiringFixes.test.ts`

## Issue #188: DCC bridge connection and protocol errors have no app-level surface

- **Severity**: Medium
- **Area**: DCC integration / diagnostics
- **Root Cause**: `DCCBridge` emitted `error` events for connection/parse/send/reconnect failures, but no production code subscribed to them.
- **Fix**: Added `dccBridge.on('error')` subscription in `wireDCCBridge()` that shows throttled warning alerts (max one per 5 seconds to avoid spam). All errors logged regardless of throttle.
- **Regression Tests**: DCCFIX-060 (error shows alert), DCCFIX-061 (alert contains message), DCCFIX-062 (throttle suppresses rapid duplicates), DCCFIX-063 (no alert after disposal).
- **Verification**: All 22,668 tests pass, TypeScript clean.
- **Files Changed**: `src/AppDCCWiring.ts`, `src/AppWiringFixes.test.ts`

## Issue #186: Network session join only requests host media when the guest starts completely empty

- **Severity**: Medium
- **Area**: Collaboration / session transfer
- **Root Cause**: `shouldRequestMediaSync()` returned `true` only when `session.sourceCount === 0`, so joining from a non-empty session mapped host state onto unrelated local media.
- **Fix**: Removed the `sourceCount === 0` condition. Media sync is now always requested when the host has media, regardless of guest state.
- **Regression Tests**: ANB-186a (media sync requested with existing sources), ANB-186b (shouldRequestMediaSync true regardless of sourceCount).
- **Verification**: All 22,674 tests pass, TypeScript clean.

## Issue #187: Network media-transfer decline or failure still applies the host's pending session state

- **Severity**: Medium
- **Area**: Collaboration / session transfer
- **Root Cause**: Host session state was applied immediately on receipt, before media transfer completed. Declined or failed transfers left incompatible state applied.
- **Fix**: Deferred state/annotation/note application until after media import succeeds. Decline path discards all pending state. Added pending maps with cleanup in `finally`.
- **Regression Tests**: ANB-187a through ANB-187d — state not applied on decline, not applied on failure, applied on success, annotations/notes not applied on decline.
- **Verification**: All 22,674 tests pass, TypeScript clean.
- **Files Changed**: `src/AppNetworkBridge.ts`, `src/AppNetworkBridge.test.ts`

## Issue #189: Audio playback setup errors are detected internally but never surfaced through the app

- **Severity**: Medium
- **Area**: Audio playback / diagnostics
- **Root Cause**: `AudioPlaybackManager` emitted structured `error` events but no production code subscribed. `AudioCoordinator` didn't expose errors to callers.
- **Fix**: Added `onAudioError` callback to `AudioCoordinator`. Wired through `SessionPlayback` → `Session` → `AppPlaybackWiring` to `showAlert()` with non-blocking warning. Proper lifecycle management.
- **Regression Tests**: 8 tests — error forwarding, no-crash without callback, dispose cleanup, normal ops no errors, autoplay errors surfaced, alert content.
- **Verification**: All 22,682 tests pass, TypeScript clean.
- **Files Changed**: `src/audio/AudioCoordinator.ts`, `src/audio/AudioCoordinator.test.ts`, `src/core/session/SessionPlayback.ts`, `src/AppPlaybackWiring.ts`, `src/AppPlaybackWiring.test.ts`

## Issue #190: Timeline waveform extraction failures are reduced to a missing waveform with no UI explanation

- **Severity**: Low
- **Area**: Timeline / audio UX
- **Root Cause**: Waveform load failures were caught with `console.warn()` only. `WaveformRenderer.getError()` was never consumed in production.
- **Fix**: Added `waveformError` state to `Timeline`. On failure, reads `getError()` and renders a subtle inline "Waveform unavailable" text (9px, 60% opacity) centered in the track area. Successful load clears the error.
- **Regression Tests**: TML-WERR-001 through TML-WERR-006 — error set on failure, cleared on success, inline indicator rendered, no indicator on success, fallback message, redraw scheduled.
- **Verification**: All 22,688 tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/Timeline.ts`, `src/ui/components/Timeline.test.ts`

## Issue #191: Pre-restore and pre-load auto-checkpoints can fail silently while destructive operations still proceed

- **Severity**: Medium
- **Area**: Persistence / recovery safety
- **Root Cause**: `createAutoCheckpoint()` caught all failures and only `console.error`-ed. Callers in restore/load proceeded without knowing the safety checkpoint wasn't created.
- **Fix**: `createAutoCheckpoint` now returns `Promise<boolean>` (true on success, false on failure). `restoreSnapshot` and `openProject` check the result and show a non-blocking "Checkpoint Warning" alert on failure. Operations still proceed to not block workflows.
- **Regression Tests**: 8 tests — boolean return, checkpoint-failure warning in restore/orvproject/GTO paths, no warning on success.
- **Verification**: All 22,696 tests pass, TypeScript clean.
- **Files Changed**: `src/AppPersistenceManager.ts`, `src/AppPersistenceManager.test.ts`, `src/AppPersistenceManager.issue191.test.ts`

## Issue #192: Auto-save can fail to initialize while the header indicator still makes it look active

- **Severity**: Medium
- **Area**: Persistence / autosave UX
- **Root Cause**: `AutoSaveManager.initialize()` silently caught errors and returned `false`. `initAutoSave()` only logged. The header indicator was rendered before initialization, showing active even on backend failure.
- **Fix**: Init errors now propagate. `initAutoSave()` catch block calls `autoSaveIndicator.setStatus('disabled')` and shows a user-visible warning about auto-save unavailability.
- **Regression Tests**: PERSIST-192-001 through PERSIST-192-004 — failure shows warning, sets disabled state, success doesn't warn, failure doesn't block snapshots.
- **Verification**: All 22,700 tests pass, TypeScript clean.
- **Files Changed**: `src/core/session/AutoSaveManager.ts`, `src/AppPersistenceManager.ts`, `src/AppPersistenceManager.test.ts`, `src/AppPersistenceManager.issue192.test.ts`

## Issue #193: Room share links without a PIN do not auto-join during URL bootstrap

- **Severity**: Medium
- **Area**: Collaboration / URL bootstrap
- **Root Cause**: `handleURLBootstrap()` required both `roomCode && pinCode` for auto-join, even though `joinRoom()` accepts optional PIN.
- **Fix**: Changed auto-join condition to require only `roomCode`. PIN passed as `undefined` when absent.
- **Regression Tests**: SU-017 (updated — room-only link auto-joins), SU-040 (room+PIN still works), SU-041 (no room code = no auto-join).
- **Verification**: All 22,702 tests pass, TypeScript clean.
- **Files Changed**: `src/services/SessionURLService.ts`, `src/services/SessionURLService.test.ts`

## Issue #194: Client mode relies on selector attributes that the shipped DOM still does not provide

- **Severity**: High
- **Area**: Client mode / layout
- **Root Cause**: `ClientMode.hideRestrictedPanels()` used `[data-panel]` and `[data-toolbar]` selectors, but `LayoutOrchestrator` never added these attributes to the DOM elements it created.
- **Fix**: Added `tagClientModeElements()` to `LayoutOrchestrator` that stamps `data-panel` and `data-toolbar` attributes on layout containers after creation. Trimmed the CSS selector list in `ClientMode` to match the actual DOM structure.
- **Regression Tests**: LO-039 through LO-043 — attributes present after layout creation, correct panel names, toolbar tagged, client mode hides tagged elements, no crash on empty layout.
- **Verification**: All 22,715 tests pass, TypeScript clean.
- **Files Changed**: `src/services/LayoutOrchestrator.ts`, `src/ui/components/ClientMode.ts`, `src/services/LayoutOrchestrator.test.ts`

## Issue #195: Client mode's action allowlist is not enforced by the production app

- **Severity**: High
- **Area**: Client mode / keyboard actions
- **Root Cause**: `KeyboardActionMap` dispatched actions without checking `clientMode.isActionAllowed()`. The allowlist existed but was never consulted in the production key-dispatch path.
- **Fix**: Wrapped every action handler in `KeyboardActionMap` with a `clientMode.isActionAllowed(actionName)` guard. Blocked actions are silently ignored when client mode is active.
- **Regression Tests**: 7 tests — allowed actions execute, blocked actions ignored, all actions pass when client mode inactive, toggle behavior, edge cases.
- **Verification**: All 22,715 tests pass, TypeScript clean.
- **Files Changed**: `src/services/KeyboardActionMap.ts`, `src/App.ts`, `src/services/KeyboardActionMap.test.ts`

## Issue #196: Several clipboard-copy actions fail silently outside the Network Sync UI

- **Severity**: Medium
- **Area**: Export / probe / timeline clipboard UX
- **Root Cause**: Multiple clipboard copy call sites (`copyRequested` handler, `export.copyFrame` keyboard action, PixelProbe row copy, Timeline timecode copy) ignored the `Promise<boolean>` result from clipboard operations and swallowed failures with only `console.warn`/`console.error` or empty catches. NetworkControl already had the correct pattern using `showAlert`.
- **Fix**: All four clipboard copy call sites now await/handle the result and show a user-visible `showAlert` warning on failure: (1) `AppPlaybackWiring` copyRequested handler made async with alert, (2) `KeyboardActionMap` export.copyFrame made async with alert, (3) `PixelProbe` catch block adds showAlert alongside console.warn, (4) `Timeline` onCopyTimecode empty catch replaced with showAlert.
- **Regression Tests**: PW-006d/PW-006e (AppPlaybackWiring clipboard success/failure), 2 KeyboardActionMap tests, PROBE-U203/PROBE-U204 (PixelProbe), TML-CLIP-001/TML-CLIP-002 (Timeline) — 8 tests total.
- **Verification**: All 22,723 tests pass, TypeScript clean.
- **Files Changed**: `src/AppPlaybackWiring.ts`, `src/services/KeyboardActionMap.ts`, `src/ui/components/PixelProbe.ts`, `src/ui/components/Timeline.ts`, and their test files

## Issue #197: Malformed WebRTC share links are silently ignored during URL bootstrap

- **Severity**: Medium
- **Area**: Collaboration / URL bootstrap
- **Root Cause**: `SessionURLService.handleURLBootstrap()` only handled `offer` and `answer` WebRTC signal types — any other decoded result (malformed token, unrecognized type, null decode) fell through silently. Additionally, `joinServerlessRoomFromOfferToken()` returning `null` was not surfaced to the user.
- **Fix**: Added else branches after the offer/answer checks: (1) when `joinServerlessRoomFromOfferToken()` returns null, shows info message about unprocessable link; (2) when decoded signal is null or unrecognized type, shows info message and sets `handledServerlessOffer = true` to prevent fallthrough to websocket auto-join.
- **Regression Tests**: SU-042 through SU-049 — malformed base64, invalid signal type, join returns null, successful offer no error, answer still works, malformed prevents room auto-join, empty token safe, failed offer allows shared state. 8 tests total.
- **Verification**: All 22,731 tests pass, TypeScript clean.
- **Files Changed**: `src/services/SessionURLService.ts`, `src/services/SessionURLService.test.ts`

## Issue #198: Mu compat `realFPS()` reports nominal FPS, not measured playback FPS

- **Severity**: Medium
- **Area**: Mu compatibility / playback scripting
- **Root Cause**: `MuCommands.realFPS()` was a documented stub that simply returned `this.fps()` (the configured timeline FPS), not the actual measured playback throughput.
- **Fix**: Added `getMeasuredFPS()` to `PlaybackAPI` which reads `session.effectiveFps` (the real measured value from `PlaybackEngine`). Wired `realFPS()` in `MuCommands` to delegate to `openrv.playback.getMeasuredFPS()` instead of `this.fps()`. Returns 0 when not playing.
- **Regression Tests**: 4 tests — returns measured FPS from engine, differs from nominal when playback is slower, returns 0 when not playing, independent of setFPS() override.
- **Verification**: All 22,738 tests pass, TypeScript clean.
- **Files Changed**: `src/api/PlaybackAPI.ts`, `src/compat/MuCommands.ts`, `src/compat/__tests__/MuCommands.test.ts`

## Issue #199: Mu compat `sourcePixelValue()` returns black for normal GPU-backed sources

- **Severity**: High
- **Area**: Mu compatibility / source inspection
- **Root Cause**: `MuSourceBridge.sourcePixelValue()` fell through to `return [0,0,0,0]` when no in-memory `imageData` was available, silently returning bogus black pixels for valid GPU-backed sources.
- **Fix**: Added `PixelReadbackProvider` interface with `readSourcePixel(sourceName, x, y)` method. `sourcePixelValue()` now tries: (1) in-memory data, (2) GPU readback provider, (3) returns `null` instead of silent black. Out-of-bounds also returns `null`. Provider can be set via `setPixelReadbackProvider()`.
- **Regression Tests**: 4 new tests — delegates to readback provider for GPU sources, returns null when provider returns null, prefers in-memory over provider, clearing provider restores null. Existing tests updated to expect null instead of [0,0,0,0].
- **Verification**: All 22,738 tests pass, TypeScript clean.
- **Files Changed**: `src/compat/MuSourceBridge.ts`, `src/compat/index.ts`, `src/compat/__tests__/MuSourceBridge.test.ts`

## Issue #200: Mu compat `openUrl()` fails silently when the browser blocks popups

- **Severity**: Medium
- **Area**: Mu compatibility / utility commands
- **Root Cause**: `MuUtilsBridge.openUrl()` called `window.open()` and ignored the return value. When the browser blocked the popup, the call silently failed with no indication.
- **Fix**: Changed `openUrl()` return type from `void` to `boolean`. Now checks `window.open()` return value — returns `true` on success, `false` when blocked (`null`). Logs a `console.warn` with `[MuUtilsBridge]` prefix when blocked.
- **Regression Tests**: 3 tests — successful open returns true, blocked popup returns false with warning, correct arguments passed to window.open.
- **Verification**: All 22,745 tests pass, TypeScript clean.
- **Files Changed**: `src/compat/MuUtilsBridge.ts`, `src/compat/__tests__/MuUtilsBridge.test.ts`

## Issue #201: The Mu compatibility layer is not registered in production bootstrap

- **Severity**: High
- **Area**: Mu compatibility / app bootstrap
- **Root Cause**: `registerMuCompat()` was never called in the production bootstrap (`src/main.ts`). The compat layer was fully implemented and tested but not wired into the live app startup path, so `window.rv.commands` and `window.rv.extra_commands` were missing at runtime.
- **Fix**: Added `import { registerMuCompat } from './compat'` and `registerMuCompat()` call in `src/main.ts` immediately after `window.openrv` initialization, ensuring the OpenRV API is available for the compat layer.
- **Regression Tests**: 4 tests — registerMuCompat is exported/callable, sets up window.rv with commands/extra_commands, main.ts imports and calls it, call appears after window.openrv init.
- **Verification**: All 22,745 tests pass, TypeScript clean.
- **Files Changed**: `src/main.ts`, `src/compat/__tests__/bootstrap-registration.test.ts`

## Issue #202: The global error handler claims uncaught-error coverage, but only listens for unhandled rejections

- **Severity**: Medium
- **Area**: App bootstrap / diagnostics
- **Root Cause**: `installGlobalErrorHandler()` only added an `unhandledrejection` listener despite documentation claiming coverage of both uncaught errors and unhandled rejections. No `error` event listener was installed.
- **Fix**: Added `window.addEventListener('error', ...)` listener that logs uncaught synchronous exceptions via `log.error()` with fallback to `event.message` for cross-origin script errors. Added `uninstallGlobalErrorHandler()` that removes both listeners. Install function returns the uninstall function.
- **Regression Tests**: 7 tests — error listener registration, idempotency, uncaught error logging, cross-origin fallback, uninstall removes both, re-install works, uninstall no-op when not installed.
- **Verification**: All 22,760 tests pass, TypeScript clean.
- **Files Changed**: `src/utils/globalErrorHandler.ts`, `src/utils/globalErrorHandler.test.ts`

## Issue #203: The public `openrv.events` API advertises an `error` event that production never emits

- **Severity**: Medium
- **Area**: Public API / plugin automation
- **Root Cause**: `EventsAPI` declared `error` as a valid event and provided `emitError()`, but no internal subsystem ever called it. The public error channel was effectively inert.
- **Fix**: Wired four internal Session error events to the public error channel in `wireInternalEvents()`: `audioError` → `AUDIO_{TYPE}`, `unsupportedCodec` → `UNSUPPORTED_CODEC`, `representationError` → `REPRESENTATION_ERROR`, `frameDecodeTimeout` → `FRAME_DECODE_TIMEOUT`.
- **Regression Tests**: API-U076 through API-U082 — audio error bridging, unsupported codec (with/without null), representation error, frame decode timeout, multiple errors accumulate, errors stop after dispose.
- **Verification**: All 22,760 tests pass, TypeScript clean.
- **Files Changed**: `src/api/EventsAPI.ts`, `src/api/OpenRVAPI.test.ts`

## Issue #204: The public `openrv.events` API advertises `stop`, but production never emits it

- **Severity**: Medium
- **Area**: Public API / playback events
- **Root Cause**: The `playbackChanged` handler only mapped to `play` or `pause`. No internal session event existed for "stop" (pause + return to start), and `PlaybackAPI.stop()` manually called `session.pause()` + `session.goToStart()` without signaling.
- **Fix**: Added `playbackStopped` event to `SessionEvents`. Added `Session.stop()` method that pauses, goes to start, and emits `playbackStopped`. Wired it in `EventsAPI` to emit the public `stop` event. `PlaybackAPI.stop()` now delegates to `session.stop()`.
- **Regression Tests**: API-U083 through API-U087 — stop event emission, distinction from pause, unsubscribe, dispose cleanup, once() behavior. 5 tests.
- **Verification**: All 22,774 tests pass, TypeScript clean.
- **Files Changed**: `src/core/session/SessionTypes.ts`, `src/core/session/Session.ts`, `src/api/EventsAPI.ts`, `src/api/PlaybackAPI.ts`, `src/api/OpenRVAPI.test.ts`

## Issue #205: `openrv.playback.step(n)` bypasses in/out-range and ping-pong rules for multi-frame steps

- **Severity**: Medium
- **Area**: Public API / playback navigation
- **Root Cause**: `PlaybackAPI.step()` multi-frame path computed target frames using hardcoded `1`/`totalFrames` boundaries, ignoring `session.inPoint`/`outPoint`. Only `loop` wrapping was implemented; `pingpong` was treated as `once` (simple clamp).
- **Fix**: Replaced hardcoded range with `session.inPoint`/`session.outPoint`. Loop mode wraps within in/out range using modular arithmetic. Added proper pingpong reflection with cycle-based boundary bouncing. Once mode clamps to `[inPoint, outPoint]`.
- **Regression Tests**: STEP-060 through STEP-068 — multi-frame clamp to outPoint/inPoint in once mode, within-range no interaction, forward/backward wrapping in custom range with loop, pingpong reflection off both boundaries, large step wrapping, exact boundary hit. 9 tests + 1 updated.
- **Verification**: All 22,774 tests pass, TypeScript clean.
- **Files Changed**: `src/api/PlaybackAPI.ts`, `src/api/PlaybackAPI.step.test.ts`

## Issue #206: `openrv.dispose()` marks the API as not ready, but most sub-APIs remain fully callable

- **Severity**: Medium
- **Area**: Public API / lifecycle contract
- **Root Cause**: `OpenRVAPI.dispose()` only flipped `_ready` and disposed the event bus. Sub-APIs (`playback`, `media`, `audio`, `loop`, `view`, `color`, `markers`) were constructed with direct session/viewer references and never checked disposal state before mutating.
- **Fix**: Created `DisposableAPI` base class with `_disposed` flag and `assertNotDisposed()` guard (throws `APIError`). All 8 sub-APIs extend it. `OpenRVAPI.dispose()` now calls `dispose()` on all sub-APIs. Plugin methods also guarded. Every public mutating method checks disposal state.
- **Regression Tests**: API-U088 through API-U164 — 77 tests verifying every public method on every sub-API and the plugins object throws `APIError` after dispose.
- **Verification**: All 22,854 tests pass, TypeScript clean.
- **Files Changed**: `src/api/Disposable.ts` (new), `src/api/OpenRVAPI.ts`, `src/api/PlaybackAPI.ts`, `src/api/MediaAPI.ts`, `src/api/AudioAPI.ts`, `src/api/LoopAPI.ts`, `src/api/ViewAPI.ts`, `src/api/ColorAPI.ts`, `src/api/MarkersAPI.ts`, `src/api/EventsAPI.ts`, `src/api/OpenRVAPI.test.ts`

## Issue #207: `registerMuCompat()` claims repeat calls are no-ops, but still allocates fresh objects

- **Severity**: Low
- **Area**: Mu compatibility / registration contract
- **Root Cause**: `registerMuCompat()` always constructed `new MuCommands()` and `new MuExtraCommands()` before checking whether `globalThis.rv` existed. On repeat calls, it returned freshly allocated objects that were not the ones installed on `window.rv`.
- **Fix**: Check `globalThis.rv` before any construction. If already present, return the existing `commands` and `extra_commands` directly — zero allocation, true idempotency.
- **Regression Tests**: 3 tests — repeat call returns same objects as window.rv, no new allocation on repeat, returns installed objects when set externally.
- **Verification**: All 22,854 tests pass, TypeScript clean.
- **Files Changed**: `src/compat/index.ts`, `src/compat/__tests__/bootstrap-registration.test.ts`

## Issue #208: `openrv.events` drops duration-marker `endFrame` data from `markerChange`

- **Severity**: Medium
- **Area**: Public API / events
- **Root Cause**: The `markerChange` event payload type in `EventsAPI` omitted `endFrame`, and the bridge from `marksChanged` only emitted `frame`, `note`, and `color`. Duration/range markers were indistinguishable from point markers in the event stream.
- **Fix**: Added `endFrame?: number` to the `markerChange` payload type. Updated the bridge to conditionally include `endFrame` when the marker has one defined.
- **Regression Tests**: API-U208a (endFrame present for duration markers), API-U208b (endFrame absent for point markers), API-U208c (mixed point and duration markers). 3 tests.
- **Verification**: All 22,865 tests pass, TypeScript clean.
- **Files Changed**: `src/api/EventsAPI.ts`, `src/api/OpenRVAPI.test.ts`

## Issue #209: The public plugin scripting API is one-way: no `dispose` or `unregister`

- **Severity**: Medium
- **Area**: Public API / plugins
- **Root Cause**: `window.openrv.plugins` only exposed `register`, `activate`, `deactivate`, `loadFromURL`, `getState`, and `list`. The underlying registry's `dispose(id)` and `unregister(id)` lifecycle steps were not surfaced, making clean plugin unload and same-ID re-registration impossible from the public API.
- **Fix**: Added `dispose(id)` and `unregister(id)` methods to the public `plugins` object, delegating to the plugin registry. Both guarded by `assertNotDisposed()` from Issue #206.
- **Regression Tests**: API-U165/U166 (disposed guard), API-U167 (dispose registered), API-U168 (dispose active), API-U169 (unregister disposed), API-U170 (unregister non-disposed throws), API-U171 (re-registration after dispose+unregister), API-U172 (idempotent dispose). 8 tests.
- **Verification**: All 22,865 tests pass, TypeScript clean.
- **Files Changed**: `src/api/OpenRVAPI.ts`, `src/api/OpenRVAPI.test.ts`

## Issue #210: `window.openrv.plugins.loadFromURL()` is unrestricted by origin in production

- **Severity**: Medium
- **Area**: Public API / plugin loading
- **Root Cause**: `PluginRegistry.loadFromURL()` only enforced an origin allowlist when `allowedOrigins` was non-empty. The default was empty (allow all), and `setAllowedOrigins()` was never called in production bootstrap.
- **Fix**: Changed default behavior to deny-all when `allowedOrigins` is empty (removed the `size > 0` guard). Added `pluginRegistry.setAllowedOrigins([window.location.origin])` to production bootstrap in `main.ts`, restricting to same-origin by default.
- **Regression Tests**: PREG-030c (fresh registry rejects any URL), PREG-030d (localhost rejected without config), PREG-030e (invalid URLs rejected). 3 tests.
- **Verification**: All 22,873 tests pass, TypeScript clean.
- **Files Changed**: `src/plugin/PluginRegistry.ts`, `src/main.ts`, `src/plugin/PluginRegistry.test.ts`

## Issue #211: Plugin settings writes can fail persistence while still looking successful at runtime

- **Severity**: Low
- **Area**: Plugin system / settings persistence
- **Root Cause**: `PluginSettingsStore.setSetting()` updated in-memory cache then called `saveSettings()` which swallowed all localStorage errors and returned void. No status was propagated to callers.
- **Fix**: `saveSettings()` now returns `boolean` (true on success, false on failure). `setSetting()` returns the persistence status. `PluginSettingsAccessor.set()` also returns boolean. In-memory cache still updates on failure for current session.
- **Regression Tests**: PSET-150 through PSET-154 — success returns true, failure returns false, in-memory updated on failure, accessor returns status. 5 tests.
- **Verification**: All 22,873 tests pass, TypeScript clean.
- **Files Changed**: `src/plugin/PluginSettingsStore.ts`, `src/plugin/PluginSettingsStore.test.ts`

## Issue #212: Failed plugin hot reload removes the old plugin and forgets its tracked URL

- **Severity**: Medium
- **Area**: Plugin development / hot reload
- **Root Cause**: `HotReloadManager.reload()` disposed and unregistered the old plugin before attempting `loadFromURL()`. On load failure, the catch block also deleted the tracked URL, making retry impossible.
- **Fix**: Reordered reload flow: `loadFromURL()` is attempted first. Old plugin is only disposed/unregistered after the new module loads successfully. On failure, old plugin and tracked URL remain intact, allowing retry.
- **Regression Tests**: PHOT-019 updated (failure preserves old plugin and tracking), PHOT-021 new (retry succeeds after transient failure). 2 tests.
- **Verification**: All 22,879 tests pass, TypeScript clean.
- **Files Changed**: `src/plugin/dev/HotReloadManager.ts`, `src/plugin/dev/HotReloadManager.test.ts`

## Issue #213: HDR video extraction silently downgrades to SDR when `VideoSampleSink` setup fails

- **Severity**: Medium
- **Area**: Media decoding / HDR video
- **Root Cause**: When `VideoSampleSink` creation failed, `MediabunnyFrameExtractor` logged a console message and flipped `isHDR = false` with no way for the UI or user to know the downgrade occurred.
- **Fix**: Added `hdrDowngraded` flag to `VideoMetadata`. Propagated through `VideoLoadResult` → `SessionMedia` → `Session` → `AppSessionBridge` event chain. `hdrDowngraded` event emitted with filename. Console warning logged at app level.
- **Regression Tests**: MFE-HDR-002/003/004 (metadata flag correct for non-HDR, successful HDR, failed HDR), SM-029b (session event fires), ASB-003b (app logs warning). 5 tests.
- **Verification**: All 22,879 tests pass, TypeScript clean.
- **Files Changed**: `src/utils/media/MediabunnyFrameExtractor.ts`, `src/nodes/sources/VideoSourceNode.ts`, `src/core/session/SessionTypes.ts`, `src/core/session/SessionMedia.ts`, `src/core/session/Session.ts`, `src/AppSessionBridge.ts`, and their test files

## Issue #214: Deep tiled EXR files are rejected even though EXR is broadly advertised as supported

- **Severity**: Medium
- **Area**: Format support / EXR decoding
- **Root Cause**: The EXR decoder threw a terse error on `deeptile` type for both single-part and multi-part files. Multi-part files with mixed deep/flat parts were rejected entirely even when decodable parts existed.
- **Fix**: Improved error messages with user-friendly explanations. Multi-part decoder now auto-skips deeptile parts to find the first decodable part. When explicit `partIndex` targets a deeptile part in a mixed file, error suggests decodable alternatives. All-deep files get a clear error.
- **Regression Tests**: EXR-DEEP010 updated, EXR-MP031b (all-deep error), EXR-MP033 (auto-skip to flat part), EXR-MP034 (helpful suggestion), EXR-MP035 (skip multiple deep parts). 4 new + 1 updated.
- **Verification**: All 22,885 tests pass, TypeScript clean.
- **Files Changed**: `src/formats/EXRDecoder.ts`, `src/formats/EXRDecoder.test.ts`

## Issue #215: Tiled EXR files with mipmap or ripmap levels are rejected; only `ONE_LEVEL` tiles work

- **Severity**: Medium
- **Area**: Format support / EXR decoding
- **Root Cause**: The tiled EXR decoder rejected any `levelMode` other than `ONE_LEVEL`, throwing "Only ONE_LEVEL tiled images are supported" for mipmap and ripmap files.
- **Fix**: Added helper functions (`levelSize`, `numMipLevels`, `computeTotalTileOffsets`) for multi-level tile calculations. Modified `decodeTiledImage` and `decodeMultiPartTiledImage` to read the full offset table but only decode level-0 (full resolution) tiles, skipping lower mip levels. Removed the level mode rejection.
- **Regression Tests**: EXR-T006/T007 updated (mipmap/ripmap now decode successfully), EXR-T006b/T007b new (level-0 output pixel-identical to ONE_LEVEL). 2 new + 2 updated.
- **Verification**: All 22,885 tests pass, TypeScript clean.
- **Files Changed**: `src/formats/EXRDecoder.ts`, `src/formats/EXRDecoder.test.ts`

## Issue #216: EXR decode hard-fails on `UINT` channels instead of tolerating common data/AOV layers

- **Severity**: Medium
- **Area**: Format support / EXR decoding
- **Root Cause**: `parseChannels` threw on any `EXRPixelType.UINT` channel, making EXR files with UINT auxiliary channels (object IDs, masks, integer data) completely undecipherable even when they contained valid HALF/FLOAT image data.
- **Fix**: UINT channels are now parsed but skipped during decode. Channel lookup builders exclude UINT from output mapping while maintaining correct binary offset calculation. All-UINT files still fail with a clear error message listing the UINT channel names.
- **Regression Tests**: EXR-U130 updated (all-UINT error message), EXR-U130b (mixed UINT+FLOAT decodes), EXR-U130c (UINT channels in header metadata). 2 new + 1 updated.
- **Verification**: All 22,890 tests pass, TypeScript clean.
- **Files Changed**: `src/formats/EXRDecoder.ts`, `src/formats/EXRDecoder.test.ts`

## Issue #217: Float TIFF support rejects valid non-RGB channel layouts

- **Severity**: Medium
- **Area**: Format support / TIFF decoding
- **Root Cause**: `decodeTIFFFloat()` threw for `samplesPerPixel < 3 || > 4`, rejecting valid grayscale (1ch), luminance+alpha (2ch), and multi-channel (5+ch) float TIFFs.
- **Fix**: Added `expandPixelToRGBA()` helper: 1ch → replicate to RGB + alpha 1.0; 2ch → replicate luminance to RGB + copy alpha; 3ch/4ch → as-is. 5+ channels capped at 4 via `readChannels = Math.min(samplesPerPixel, 4)`. Applied to both strip and tiled decode paths.
- **Regression Tests**: Updated rejection tests to decode tests for 1ch and 5ch. Added grayscale pixel verification, luminance+alpha pixel verification, 0-samples rejection. 5 tests.
- **Verification**: All 22,890 tests pass, TypeScript clean.
- **Files Changed**: `src/formats/TIFFFloatDecoder.ts`, `src/formats/TIFFFloatDecoder.test.ts`

## Issue #218: DPX files with non-RGB/A descriptors are silently reinterpreted as RGB

- **Severity**: Medium
- **Area**: Format support / DPX decoding
- **Root Cause**: Two problems: (1) The `descriptor` value was not preserved in `DPXInfo` or decode metadata, making it impossible for consumers to know which descriptor was used. (2) ABGR (descriptor 52) data was passed through `toRGBA()` without channel swizzling, so channels were silently misinterpreted (A→R, B→G, G→B, R→A). Unsupported descriptors already threw `DecoderError` on this branch.
- **Fix**: (A) Added `descriptor: number` field to `DPXInfo` interface, returned from `getDPXInfo()`, and included in `decodeDPX()` result metadata. (B) Added ABGR→RGBA in-place swizzle after `toRGBA()` when `descriptor === 52`, correctly remapping [A,B,G,R] → [R,G,B,A] for every pixel.
- **Regression Tests**: 19 new tests — unsupported descriptor rejection (0, 100, 101, 102, 150) via both getDPXInfo and decodeDPX, no-silent-fallthrough guard, descriptor field in DPXInfo for all 4 supported descriptors (6, 50, 51, 52), descriptor in decode metadata (RGB, RGBA, Luma), ABGR swizzle verification at 8-bit and 16-bit, RGBA non-swizzle negative test, ABGR metadata check.
- **Verification**: All 68 DPXDecoder tests pass, TypeScript clean.
- **Files Changed**: `src/formats/DPXDecoder.ts`, `src/formats/DPXDecoder.test.ts`

## Issue #219: MXF start timecode falls back to 24fps when edit rate is missing or invalid

- **Severity**: Medium
- **Area**: Format metadata / MXF parsing
- **Root Cause**: The code already correctly stored the raw frame count in `metadata.startTimecodeFrames` and only computed `startTimecode` when a valid edit rate was present (no 24fps fabrication on this branch). However, when a Timecode Component was found but the edit rate was missing/invalid, the parser silently dropped the timecode with no diagnostic output.
- **Fix**: Added `console.warn` in the `else` branch when a Timecode Component is found but the edit rate is missing or has zero denominator. Warning includes the raw frame count for debugging and clearly states the timecode could not be resolved.
- **Regression Tests**: Updated MXF-TC-COMP-004 (missing edit rate) and MXF-TC-COMP-005 (zero denominator) to verify `console.warn` is called with "Cannot resolve start timecode" message.
- **Verification**: All 60 MXFDemuxer tests pass, TypeScript clean.
- **Files Changed**: `src/formats/MXFDemuxer.ts`, `src/formats/MXFDemuxer.test.ts`

## Issue #220: JP2 parsing stops on valid extended boxes larger than 4 GB

- **Severity**: Low
- **Area**: Format support / JP2 parsing
- **Root Cause**: `findCodestreamOffset()` silently broke out of parsing when encountering a >4GB extended box (high 32 bits non-zero), with no warning or error. Valid JP2 files with large extended boxes could fail to find the codestream with no explanation.
- **Fix**: Added `console.warn` before the `break`, including the box type and high-length value, clearly stating ">4 GB boxes are not supported by this parser." The `break` is preserved since JS DataView can't handle >4GB offsets.
- **Regression Tests**: JP2-EXT-001 (normal boxes still parse), JP2-EXT-002 (extended box with hiLen=0 works), JP2-EXT-003 (extended box with hiLen>0 warns and stops).
- **Verification**: All 59 JP2Decoder tests pass, TypeScript clean.
- **Files Changed**: `src/formats/JP2Decoder.ts`, `src/formats/JP2Decoder.test.ts`

## Issue #221: Float TIFF decoding supports only 32-bit float samples

- **Severity**: Medium
- **Area**: Format support / TIFF decoding
- **Root Cause**: `decodeTIFFFloat()` only supported `bitsPerSample === 32`, throwing a hard error for valid 16-bit half-float and 64-bit double float TIFFs.
- **Fix**: Added full 16-bit half-float support via `float16ToFloat32()` IEEE 754 conversion (handles sign, exponent, mantissa, subnormals, infinity, NaN). Added 64-bit double support via `DataView.getFloat64()` with implicit Float32Array truncation. Added `readFloatSample()` dispatcher by `bytesPerSample`. Updated `isFloatTIFF()` to recognize 16/64-bit. Threaded `bytesPerSample` through strip and tiled decode paths including predictor (horizontal differencing and floating-point planar). Error message for unsupported depths now lists all supported formats.
- **Regression Tests**: 4 new tests — 16-bit half-float decode with pixel verification, 64-bit double decode with pixel verification, `isFloatTIFF` for 16-bit and 64-bit. 1 updated test — unsupported bit depth (24) error message quality.
- **Verification**: All 86 TIFFFloatDecoder tests pass, TypeScript clean.
- **Files Changed**: `src/formats/TIFFFloatDecoder.ts`, `src/formats/TIFFFloatDecoder.test.ts`

## Issue #222: Float TIFF decoding rejects common TIFF compression modes outside uncompressed, LZW, and Deflate

- **Severity**: Medium
- **Area**: Format support / TIFF decoding
- **Root Cause**: The decoder whitelisted only compression codes 1 (uncompressed), 5 (LZW), 8 (Deflate), and 32946 (Adobe Deflate). PackBits (32773), a very common TIFF compression, threw a hard error with a vague message.
- **Fix**: (A) Added full PackBits (32773) RLE decompression per TIFF 6.0 spec — literal runs (0..127), repeat runs (-127..-1), nop (-128), with output padding for truncated data. Wired into both strip and tiled decode paths. (B) Added `COMPRESSION_NAMES` lookup table for human-readable error messages. (C) Improved error messages to include the compression code, human-readable name, and full list of supported modes. (D) Added `console.warn` before throwing for unsupported compression.
- **Regression Tests**: 5 new PackBits tests (RGB decode, RGBA decode, pixel value preservation, repeated-byte runs, cross-validation vs LZW). 2 updated tests (JPEG error message quality, unknown compression code 99).
- **Verification**: All 91 TIFFFloatDecoder tests pass, TypeScript clean.
- **Files Changed**: `src/formats/TIFFFloatDecoder.ts`, `src/formats/TIFFFloatDecoder.test.ts`

## Issue #223: Auto-exposure and Drago tone mapping silently fall back to synthetic scene-luminance defaults on unsupported WebGL setups

- **Severity**: Medium
- **Area**: HDR analysis / viewer rendering
- **Root Cause**: `LuminanceAnalyzer` used fixed synthetic defaults (`avg: 0.18, linearAvg: 1.0`) when `EXT_color_buffer_float` was unavailable. `ViewerGLRenderer` always fed those stats into auto-exposure and Drago with no indication they were fallback values rather than measured scene data.
- **Fix**: (A) Added `isAvailable()` method to `LuminanceAnalyzer` that returns false when GPU float color buffers are unavailable. (B) In `ViewerGLRenderer.applySceneLuminanceAnalysis()`, checks analyzer availability and emits a single `console.warn` naming which features (auto-exposure and/or Drago) are using fallback values and why. Features remain enabled — only the fallback is made visible.
- **Regression Tests**: LA-014 (available when extension present), LA-015 (unavailable without extension), VGLR-223a through VGLR-223e (auto-exposure fallback warn, Drago fallback warn, fire-once dedup, no warn when available, both features named).
- **Verification**: All 111 tests pass (16 LuminanceAnalyzer + 95 ViewerGLRenderer), TypeScript clean.
- **Files Changed**: `src/render/LuminanceAnalyzer.ts`, `src/ui/components/ViewerGLRenderer.ts`, `src/render/LuminanceAnalyzer.test.ts`, `src/ui/components/ViewerGLRenderer.test.ts`

## Issues #224 & #225: HDR output mode UI can claim a mode change even when the renderer rejects it; changing HDR mode does not schedule a viewer redraw

- **Severity**: Medium (both)
- **Area**: HDR output / UI state truthfulness / viewer refresh
- **Root Cause**: (A) `Viewer.setHDROutputMode()` had `void` return type, ignoring the renderer's boolean result. `AppViewWiring` forwarded the event without checking success. The UI could show HLG/PQ/Extended as selected while the renderer stayed on the previous mode. (B) `setHDROutputMode()` did not call `scheduleRender()`, so even successful mode changes didn't trigger a redraw until something else caused one.
- **Fix**: (A) Changed `Viewer.setHDROutputMode()` to return `boolean` from the renderer. Returns `false` when no renderer/capabilities. `AppViewWiring` now checks the result and emits `console.warn` on rejection. (B) Added `scheduleRender()` call after successful mode change only (not on rejection).
- **Regression Tests**: VWR-HDR-001 through VWR-HDR-005 (returns true/false, no-renderer returns false, render on success, no render on reject), VW-011b/VW-011c (warn on reject, no warn on accept).
- **Verification**: All 162 tests pass (Viewer + AppViewWiring), TypeScript clean.
- **Files Changed**: `src/ui/components/Viewer.ts`, `src/AppViewWiring.ts`, `src/ui/components/Viewer.test.ts`, `src/AppViewWiring.test.ts`

## Issue #226: Async system HDR headroom detection updates renderer state without triggering a redraw

- **Severity**: Medium
- **Area**: HDR output / viewer refresh
- **Root Cause**: `syncHDRHeadroomFromSystem()` called `setHDRHeadroom()` when the async `queryHDRHeadroom()` promise resolved, but never called `scheduleRender()`. The initial frame rendered with default headroom and stayed that way until an unrelated event triggered a redraw.
- **Fix**: Added change detection via `lastSystemHDRHeadroom` tracker (initialized to 1.0/SDR default). After headroom resolves, compares against last value — if changed, applies the headroom and calls `scheduleRender()`. Handles null, non-finite, non-positive, missing HDR capability, and rejected promises gracefully (no unnecessary redraws).
- **Regression Tests**: VWR-HDRHROOM-001 through VWR-HDRHROOM-006 (new value triggers render, same value skips, null skips, no HDR capability skips, rejected promise skips, sequential changes tracked correctly).
- **Verification**: All 128 Viewer tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/Viewer.ts`, `src/ui/components/Viewer.test.ts`
## Issue #239: Mu source-management commands mostly mutate a shadow source registry instead of the real OpenRV session

- **Severity**: High
- **Area**: Mu compatibility / source management
- **Root Cause**: `MuSourceBridge` methods (`addSource`, `addSources`, `addSourceVerbose`, `clearSession`, `setSourceMedia`, `relocateSource`, `setActiveSourceMediaRep`, `addToSource`) only created/mutated in-memory `SourceRecord` objects in the private `_sources` map. `_createSourceRecord()` stored placeholder records without ever loading media into the app session. Follow-up compat queries read from this shadow registry, reinforcing the false impression that scripts had modified the live session.
- **Fix**: (A) Added `addSourceFromURL(url)` and `clearSources()` public methods to `MediaAPI` delegating to `Session.loadSourceFromUrl` and `Session.clearSources`. (B) Extracted `OpenRVMediaAPI`/`OpenRVAPI` interfaces in `MuSourceBridge` with optional mutation methods. Added `tryGetOpenRV()` helper for graceful degradation. (C) Added `_loadIntoSession(paths)` private method that routes `.movieproc` paths to `loadMovieProc()`, HTTP/HTTPS URLs to `addSourceFromURL()`, and skips local file paths (browser limitation). (D) Wired all mutator methods through to the real session: `addSource`, `addSources`, `addSourceVerbose`, `addSourceEnd` (batch), `clearSession`, `setSourceMedia`, `relocateSource`, `setActiveSourceMediaRep`, and `addToSource` now propagate to the real OpenRV session. Fire-and-forget pattern with `.catch()` for synchronous methods; `await` for async methods. Shadow registry maintained as cache/compat layer.
- **Regression Tests**: 30 new tests across `MuSourceBridge.test.ts` and `OpenRVAPI.test.ts` covering: URL/movieproc/local-path routing, batch mode deferred loading, clearSession completeness (real + shadow), error resilience (API throws/unavailable), graceful degradation when `window.openrv` undefined, shadow state consistency after mutations, `addToSource` session propagation, MediaAPI delegation and post-dispose guards.
- **Verification**: All 458 compat tests pass (8 files), all API tests pass. TypeScript clean.
- **Files Changed**: `src/api/MediaAPI.ts`, `src/compat/MuSourceBridge.ts`, `src/compat/__tests__/MuSourceBridge.test.ts`, `src/api/OpenRVAPI.test.ts`

## Issue #240: Mu compat `displayFeedbackQueue()` never drains queued messages after the first one

- **Severity**: Medium
- **Area**: Mu compatibility / HUD-feedback scripting
- **Root Cause**: `displayFeedbackQueue()` pushed entries into `feedbackQueue` and displayed the first one immediately via `displayFeedback()`, but the timeout handler in `displayFeedback()` only set `_currentFeedback = null` without dequeuing or displaying the next message. No other code path consumed the queue after the first display. Additionally, messages with `duration <= 0` skipped the timer entirely, permanently stalling the drain chain.
- **Fix**: (A) Added `drainFeedbackQueue()` method that shifts the next entry from `feedbackQueue` and calls `displayFeedback()` — creating a chain: display → timeout → drain → display next → ... until the queue is empty. The timeout handler in `displayFeedback()` now calls `drainFeedbackQueue()` after clearing `_currentFeedback`. (B) Changed the duration guard from `duration > 0` to `Math.max(0, duration * 1000)` so zero/negative durations get `setTimeout(..., 0)` instead of skipping the timer, keeping the drain chain alive.
- **Regression Tests**: 8 new tests covering: multi-message queue drain in order, timeout-based sequencing, mid-drain additions, queue emptiness after completion, zero-duration messages (first/middle/sole position), and single `displayFeedback()` independence.
- **Verification**: All 466 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuExtraCommands.ts`, `src/compat/__tests__/MuCommands.test.ts`

## Issue #241: Mu compat `bindRegex()` is effectively dead because dispatch never evaluates regex bindings

- **Severity**: Medium
- **Area**: Mu compatibility / event binding
- **Root Cause**: `bindRegex()` stored regex handlers under `__regex__` sentinel keys in the binding maps, but `ModeManager.dispatchEvent()` only performed exact `bindings.get(event.name)` lookups. It never iterated bindings to test regex patterns, so regex-bound handlers were silently dead. Additionally, `RegExp` objects with `g` or `y` flags are stateful — `test()` advances `lastIndex`, causing every other dispatch to fail.
- **Fix**: (A) Added `regex?: RegExp` field to `EventTableBinding` and `regexCount` tracker to `EventTable` in `types.ts`. (B) Added `tryRegexBindings()` helper in `ModeManager` that iterates `__regex__`-prefixed entries and tests patterns against event names, with `lastIndex = 0` reset before each test to handle stateful flags. (C) Wired regex fallback into all three dispatch levels (override → event-table → global) with exact-match priority preserved — regex only fires when no exact match exists at the same level. (D) Simplified `MuEventBridge.bindRegex()` to pass the `RegExp` object directly to `ModeManager.bind()`. (E) `regexCount` fast-skip optimization avoids iteration when no regex bindings exist in a table.
- **Regression Tests**: 19 new tests covering: match/no-match, multi-pattern selection, unbindRegex removal, exact > regex priority, override/table/global precedence, reject-and-pass-through, case-insensitive flags, stateful `g`/`y` flag handling (consecutive dispatches), and 5-iteration loop stability.
- **Verification**: All 485 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/ModeManager.ts`, `src/compat/MuEventBridge.ts`, `src/compat/types.ts`, `src/compat/__tests__/MuEventBridge.test.ts`

## Issue #242: Mu compat `bind()` and `unbind()` ignore `modeName`, so mode-scoped handlers become always-active table bindings

- **Severity**: Medium
- **Area**: Mu compatibility / mode system
- **Root Cause**: `MuEventBridge.bind()` and `unbind()` ignored the `modeName` argument entirely, forwarding only `tableName` to `ModeManager.bind()`/`unbind()`. `ModeManager` stored all bindings in the always-active event table stack regardless of mode. The dispatch path walked event tables independently of mode activation, making all handlers always-active as soon as bound.
- **Fix**: (A) `MuEventBridge.bind()`, `unbind()`, `bindRegex()`, and `unbindRegex()` now forward `modeName` to `ModeManager`. (B) Added `modeScopedTables` storage (`Map<modeName, Map<tableName, EventTable>>`) in `ModeManager` with `resolveTable()` helper that routes bindings to mode-scoped or always-active tables based on `modeName`. (C) Updated `dispatchEvent()` to check mode-scoped tables only for active modes (between event-table-stack and global tables in priority). (D) `getBindings()` and `getBindingDocumentation()` consistently filter by active modes. (E) Empty or `"default"` modeName preserves always-active behavior for backward compatibility. (F) `dispose()` cleans up mode-scoped tables.
- **Regression Tests**: 19 new tests covering: mode-gated dispatch (active fires, inactive doesn't), activate/deactivate lifecycle, multi-mode isolation, backward compat for empty/default modeName, scoped unbind, regex mode scoping, precedence (override > stack > mode-scoped > global), getBindingDocumentation mode filtering, and introspection.
- **Verification**: All 504 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/ModeManager.ts`, `src/compat/MuEventBridge.ts`, `src/compat/__tests__/MuEventBridge.test.ts`

## Issue #243: Mu compat progressive-loading state is disconnected from real media loading

- **Severity**: Medium
- **Area**: Mu compatibility / loading-progress scripting
- **Root Cause**: `MuUtilsBridge` loading counters (`_loadTotal`, `_loadCount`, `_progressiveSourceLoading`) were private fields only mutated by `startPreloadingMedia()` and `setLoadCounters()`, neither of which had any production callers. No real media loading events were wired into the bridge, so scripts saw synthetic counters disconnected from actual activity.
- **Fix**: (A) Added `sourceLoadingStarted` and `sourceLoadFailed` events to `SessionMedia`, emitted at the start of every loading method and in all error paths (9 loading methods wrapped with try/catch). Added suppress guard in `loadImageFile→loadImage` fallback to avoid double-counting, with `finally` reset to prevent flag leaks. (B) Wired both events through `Session.ts` forwarding and `EventsAPI.ts`. (C) Added `connectToEvents(events)` in `MuUtilsBridge` subscribing to `sourceLoadingStarted` (increments `_loadTotal`, sets `_progressiveSourceLoading = true`), `sourceLoaded` (increments `_loadCount`), and `sourceLoadFailed` (increments `_loadCount` — so failures don't stall the queue). (D) Added 30-second safety timeout to `waitForProgressiveLoading()`. (E) Added `_disposed` flag so `dispose()` cancels pending polling and resolves promises promptly. (F) Backward compat preserved for `setLoadCounters()` and `startPreloadingMedia()`.
- **Regression Tests**: 17 new tests covering: event-driven counter updates, load failure counter increment, `waitForProgressiveLoading` resolution (normal/failure/timeout/already-complete), concurrent loads, dispose cancels polling, dispose removes all three event listeners, backward compat for manual counter APIs.
- **Verification**: All 521 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/core/session/SessionMedia.ts`, `src/core/session/SessionTypes.ts`, `src/core/session/Session.ts`, `src/api/EventsAPI.ts`, `src/compat/MuUtilsBridge.ts`, `src/compat/__tests__/MuUtilsBridge.test.ts`, `src/compat/index.ts`

## Issue #244: Mu compat remote contact-name and permission settings are local-only metadata that never reach the wire

- **Severity**: Medium
- **Area**: Mu compatibility / remote networking
- **Root Cause**: `MuNetworkBridge` stored `localContactName` and `defaultPermission` as private fields with plain getters/setters that never propagated to the wire. `remoteConnect()` opened a raw WebSocket without sending identity. `remoteSendMessage()`, `remoteSendEvent()`, `remoteSendDataEvent()` omitted both fields from payloads. Incoming messages were never dispatched — `handleIncomingMessage` was a dead-end that enforced permissions but discarded valid messages. Binary WebSocket frames were unconditionally dropped, breaking `dataEvent` receiving.
- **Fix**: (A) `remoteConnect()` now sends a handshake message with `contactName` and `permission` on WebSocket open. (B) All send methods include `senderContactName` in payloads (falls back to `"anonymous"` if empty). (C) `handleIncomingMessage()` now properly dispatches: stores peer identity from handshakes, invokes `_onRemoteMessage`/`_onRemoteEvent`/`_onRemoteDataEvent` handlers for allowed message types. (D) Added binary frame state machine for `dataEvent` — JSON header sets pending state with 5s timeout, next binary frame is matched and dispatched. (E) Permission enforcement gates incoming messages (level 0 = reject all, 1 = read-only, 2 = full). (F) Rapid header replacement clears previous timer. (G) `remoteDisconnect()` and WebSocket `close` clean up pending data event state.
- **Regression Tests**: 25 new tests covering: handshake transmission, senderContactName in all send methods, name change after connect, empty name fallback, peer identity storage, message/event/dataEvent dispatch at permission 2, permission enforcement at levels 0/1 for all types, binary+header association, orphan binary drop, timeout expiry, rapid headers, backward-compat for missing senderContactName, and disconnect cleanup.
- **Verification**: All 545 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuNetworkBridge.ts`, `src/compat/__tests__/MuEventBridge.test.ts`

## Issue #245: Mu eval/image-query commands are effectively unwired because production never feeds render or view state into `MuEvalBridge`

- **Severity**: Medium
- **Area**: Mu compatibility / image-query scripting
- **Root Cause**: `MuEvalBridge` depended on external callers to seed live view state via `setViewTransform()` and rendered-image list via `setRenderedImages()`, but no production code called either method. `registerMuCompat()` only wired `window.rv.commands` and `window.rv.extra_commands`, not the eval bridge. Commands like `renderedImages()`, `imagesAtPixel()`, `imageGeometry()`, and `eventToImageSpace()` returned empty/default answers.
- **Fix**: (A) Added `ViewEventSource` interface and `connectToEvents()` method on `MuEvalBridge` for subscribing to `viewTransformChanged` and `renderedImagesChanged` events, with `dispose()` for cleanup. (B) Added `viewTransformChanged` and `renderedImagesChanged` events to `EventsAPI`, wired from Viewer's view change listeners and source load/switch events. (C) Added `addViewChangeListener()` (multi-listener support) and `getSourceDimensions()` to Viewer. (D) Viewer's ResizeObserver now notifies view change listeners so viewport size changes propagate. (E) `TransformManager.fitToWindow()` and `resetForSourceChange()` now call `notifyViewChanged()` to keep the bridge in sync. (F) `EventsAPI` subscribes to `currentSourceChanged` to update rendered images when switching between already-loaded sources. (G) Backward compat preserved for `setViewTransform()`/`setRenderedImages()`.
- **Regression Tests**: 18 new tests covering: event subscription wiring, view transform updates, rendered image updates, coordinate conversion with live state, source switching emits correct data, viewport resize triggers update, dispose cleanup, reconnection, and backward compat for manual setters.
- **Verification**: All 556 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuEvalBridge.ts`, `src/compat/__tests__/MuEvalBridge.test.ts`, `src/compat/index.ts`, `src/api/EventsAPI.ts`, `src/api/types.ts`, `src/ui/components/Viewer.ts`

## Issue #246: Mu compat batched `addSourceVerbose()` returns source names that do not match the records created at commit time

- **Severity**: Medium
- **Area**: Mu compatibility / source management
- **Root Cause**: In batch mode, `addSourceVerbose()` called `_generateSourceName()` to return a name immediately, then `addSourceEnd()` called `_createSourceRecord()` which called `_generateSourceName()` again — advancing the counter a second time. The name returned during batching never matched the committed source record.
- **Fix**: (A) Extended batch queue entry type to include an optional `name` field. (B) In `addSourceVerbose()` batch path, the pre-generated name is saved with the queue entry. (C) `addSourceEnd()` passes the saved name through to `_createSourceRecord()`. (D) `_createSourceRecord()` accepts an optional `preGeneratedName` parameter and uses it instead of generating a new one when provided. Counter integrity is preserved — each name is generated exactly once.
- **Regression Tests**: 5 new tests covering: single batch name resolves after commit, multiple batch names all resolve, sequential naming correctness, mixed `addSource`+`addSourceVerbose` in same batch, and non-batch backward compat.
- **Verification**: All 561 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuSourceBridge.ts`, `src/compat/__tests__/MuSourceBridge.test.ts`

## Issue #247: Mu node-view history can get stuck repeating the same node when navigating back then forward

- **Severity**: Medium
- **Area**: Mu compatibility / node-view navigation
- **Root Cause**: The view history used a split model where the current node was separate from the history array. `previousViewNode()` appended the current node to history but didn't advance the index correctly. `nextViewNode()` then returned the same intermediate node instead of the forward successor. Additionally, `deleteNode()` didn't clean up history entries, allowing navigation to deleted nodes.
- **Fix**: (A) Replaced the split model with a browser-like cursor model — all visited nodes live in `_viewHistory` with `_viewHistoryIndex` as cursor. `setViewNode()` appends and truncates forward entries (like browser navigation). `previousViewNode()`/`nextViewNode()` simply move the cursor. (B) `deleteNode()` now scrubs deleted node from `_viewHistory`, adjusts `_viewHistoryIndex` for removed entries before cursor, and syncs `_viewNode` with the cursor position to prevent duplicate entries on subsequent `setViewNode()`.
- **Regression Tests**: 11 new/updated tests covering: back returns correct node, forward returns correct node, full back-forward traversal, forward truncation on new navigation, boundary conditions (start/end), deleteNode cleanup (end/middle/current), deleteNode+setViewNode duplicate prevention, and repeated back→forward zigzag stability.
- **Verification**: All 570 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuNodeBridge.ts`, `src/compat/__tests__/MuNodeBridge.test.ts`

## Issue #248: Mu compat `newImageSource()` can silently replace an existing source with the same name

- **Severity**: Medium
- **Area**: Mu compatibility / in-memory source management
- **Root Cause**: `newImageSource()` validated only that the name was non-empty and dimensions were positive. It never checked whether `_sources`, `_imageSources`, or the batch queue already contained the given name, unconditionally overwriting any existing source record and pixel data.
- **Fix**: Added a duplicate-name check before any writes in `newImageSource()`. Throws `TypeError` with a clear message if the name exists in `_sources`, `_imageSources`, or any pending `_batchQueue` entry with a pre-generated name. The check runs before any side effects, so no partial state is created on rejection.
- **Regression Tests**: 5 new tests covering: duplicate name throws TypeError, original source preserved after rejection, different name succeeds after rejection, case-sensitive names treated as distinct, and batch queue collision detection (addSourceVerbose name collides with newImageSource).
- **Verification**: All 575 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuSourceBridge.ts`, `src/compat/__tests__/MuSourceBridge.test.ts`

### 249. Mu compat ND properties lose their declared shape after any set or insert operation
- **Severity**: Medium
- **Area**: Mu compatibility / property system
- **Root Cause**: All four write paths (`setStringProperty`, `_setNumericProperty`, `insertStringProperty`, `_insertNumericProperty`) unconditionally replaced `prop.dimensions` with `[values.length]` or `[data.length]`, flattening any multi-dimensional shape to a 1D vector after the first update.
- **Fix**: Added `prop.dimensions.length > 1` checks in all 4 write methods. For `set` operations: dimensions are preserved and value count is validated against `dimensions.reduce((a,b)=>a*b,1)`. For `insert` operations: innerSize is computed from `dimensions.slice(1).reduce(...)`, value count must be a multiple of innerSize, insertion index must be aligned to innerSize boundary, and outermost dimension is recomputed as `data.length / innerSize`. All validations throw `TypeError` with property path, expected values, and actual values for debuggability. 1D properties continue using the original flat-dimension behavior.
- **Regression Tests**: 14 new tests covering: set preserves 2D shape, set preserves 3D shape, insert updates outermost 2D dimension, insert updates outermost 3D dimension, wrong value count on numeric set throws, wrong value count on string set throws, non-aligned insert count on numeric throws, non-aligned insert count on string throws, misaligned insert index throws, and happy-path round-trips for both numeric and string ND properties.
- **Verification**: All 589 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuPropertyBridge.ts`, `src/compat/__tests__/MuPropertyBridge.test.ts`

### 250. Mu compat closestNodesOfType() returns farther matches too, instead of only the nearest layer of matches
- **Severity**: Medium
- **Area**: Mu compatibility / graph evaluation
- **Root Cause**: `closestNodesOfType()` used a simple BFS that continued traversing past the first matching depth, collecting matches at ALL upstream depths instead of stopping at the nearest layer.
- **Fix**: Replaced single-queue BFS with level-by-level BFS. Each depth level is fully processed before checking for matches. Once any matches are found at a depth, traversal stops immediately — only that nearest layer is returned. Visited-set cycle detection prevents duplicate processing in diamond graphs.
- **Regression Tests**: 4 new tests covering: multi-depth chain (only nearest returned), branching graph with matches at different depths (only nearest depth returned), all matches at same depth (all returned), and no-matches (empty array).
- **Verification**: All 593 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuEvalBridge.ts`, `src/compat/__tests__/MuEvalBridge.test.ts`

### 251. Mu compat metaEvaluateClosestByType() chooses the first depth-first match, not the actual closest match in branched graphs
- **Severity**: Medium
- **Area**: Mu compatibility / graph evaluation
- **Root Cause**: `metaEvaluateClosestByType()` delegated to `_traverseEvalChainUntilType()` which used DFS, returning the first encountered match regardless of topological distance. Dead-end branch nodes also leaked into the result path.
- **Fix**: Replaced DFS-based `_traverseEvalChainUntilType()` with BFS approach: level-by-level traversal finds the true closest matching node, then a parent-map reconstructs the exact path from start to match. Dead-end branches are never included in the result. Added `_collectAllUpstream()` helper for the no-match fallback (preserving backward-compatible behavior of returning all reachable nodes).
- **Regression Tests**: 4 new tests covering: branched graph near-branch wins over far-branch, exact path reconstruction verified, dead-end branch nodes excluded from result, and start-node-is-target returns single-element path.
- **Verification**: All 596 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuEvalBridge.ts`, `src/compat/__tests__/MuEvalBridge.test.ts`

### 252. Mu compat source-list fallbacks can return phantom source names that the rest of the source API cannot resolve
- **Severity**: Medium
- **Area**: Mu compatibility / source management
- **Root Cause**: `sources()` and `sourcesAtFrame()` fabricated fallback entries from `openrv.media.getCurrentSource()` when no local records existed, but never registered them in `_sources`. Every subsequent API call using `_getSource()` (sourceMedia, sourceMediaInfo, sourceAttributes, hasSource, etc.) would throw "Source not found" for the returned name.
- **Fix**: When the fallback discovers a real source from the OpenRV session, it now registers it via `_createSourceRecord()` with a duplicate-prevention guard (`_sources.has()` check). This ensures the returned name is immediately usable by all source APIs. The registration bypasses batch mode since the fallback only triggers when `_sources` is empty.
- **Regression Tests**: 9 new tests covering: fallback name usable by sourceMedia, sourceMediaInfo, sourceAttributes, hasSource returns true, sourceCount reflects fallback, sourcesAtFrame fallback also usable, no duplicate on repeated calls, and existing clearSession assertion updated.
- **Verification**: All 605 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuSourceBridge.ts`, `src/compat/__tests__/MuSourceBridge.test.ts`

### 253. Mu compat properties('#TypeName') does not honor the documented hash-path semantics
- **Severity**: Medium
- **Area**: Mu compatibility / property system
- **Root Cause**: `properties()` handled `#TypeName` by stripping `#` and using `key.startsWith(prefix + '.')`, which looked for keys literally starting with the type name. This was inconsistent with `_resolveKey()` which uses `nodePart.includes(typeName)` to match type tokens embedded in node names (e.g., `group000_RVSourceGroup` matching `#RVSourceGroup`).
- **Fix**: Replaced the `startsWith` logic in the hash branch with `includes`-based matching consistent with `_resolveKey()`. Added empty-hash guard (`if (!typeName) return result`) to prevent `properties('#')` from matching all properties due to JS empty-string `includes` behavior.
- **Regression Tests**: 6 new tests covering: hash-path type matching, multiple nodes of same type, hash vs exact name distinction, non-matching hash returns empty, bare `#` returns empty, and substring over-matching documenting intentional semantics.
- **Verification**: All 611 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuPropertyBridge.ts`, `src/compat/__tests__/MuPropertyBridge.test.ts`

### 254. Mu compat fileKind() misclassifies normal signed or query-string media URLs as unknown files
- **Severity**: Medium
- **Area**: Mu compatibility / file-kind detection
- **Root Cause**: `getExtension()` extracted the extension by finding the last `.` and slicing to end-of-string without stripping URL query strings (`?token=abc`) or fragments (`#section`). URLs like `shot.exr?token=abc` yielded extension `exr?token=abc` which matched no known extension list.
- **Fix**: Added URL cleanup at the start of `getExtension()`: `path.split('?')[0].split('#')[0]` strips query and fragment before extracting the extension. The split order matches RFC 3986 URL structure (`?` precedes `#`).
- **Regression Tests**: 6 new tests covering: URL with query string, URL with fragment, URL with both query+fragment, LUT URL with multiple query params, empty query string, and empty fragment.
- **Verification**: All 614 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuUtilsBridge.ts`, `src/compat/__tests__/MuEventBridge.test.ts`

### 255. Mu compat remoteConnect() forces wss for every non-local host, which blocks valid plain-ws remotes
- **Severity**: Medium
- **Area**: Mu compatibility / remote networking
- **Root Cause**: `remoteConnect()` hardcoded `ws` for localhost/127.0.0.1 and `wss` for everything else, with no way to use plain `ws` for non-local hosts even when the page is served over HTTP or the caller explicitly provides a `ws://` scheme.
- **Fix**: Redesigned scheme selection: (1) explicit `ws://`/`wss://` scheme in host is honored as-is, (2) localhost/127.0.0.1 defaults to `ws`, (3) otherwise matches page protocol (`http:` → `ws`, everything else → `wss` for secure default), (4) SSR/Node falls back to `wss`. Also fixed: double-port URL when host includes embedded port, and connection ID now derived from normalized URL so duplicate-connection detection and metadata are consistent.
- **Regression Tests**: 11 new tests covering: localhost ws, 127.0.0.1 ws, explicit ws scheme, explicit wss scheme, http page → ws, https page → wss, file: page → wss, double-port prevention (wss), double-port prevention (ws), SSR default wss, and connection metadata correctness.
- **Verification**: All 625 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuNetworkBridge.ts`, `src/compat/__tests__/MuEventBridge.test.ts`

### 256. Mu compat hash-path property resolution is insertion-order dependent when multiple node names contain the same type token
- **Severity**: Medium
- **Area**: Mu compatibility / property system
- **Root Cause**: `_resolveKey()` iterated `this._store.keys()` and returned the first key whose node name `includes(typeName)`, making resolution dependent on Map insertion order when multiple nodes matched — nondeterministic from the API user's perspective.
- **Fix**: Replaced first-match-wins with a priority-ranked resolution: (1) exact node-name match (unchanged, highest priority), (2) suffix match — node name ends with `_TypeName` (matches OpenRV naming convention), (3) substring match — node name `includes(TypeName)`. Within each tier, candidates are sorted alphabetically by key for deterministic tiebreaking.
- **Regression Tests**: 4 new tests covering: suffix preferred over substring (with insertion order proving it's not luck), alphabetical tiebreaking among equal-quality matches, insertion-order independence, and exact match still wins over suffix/substring.
- **Verification**: All 629 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuPropertyBridge.ts`, `src/compat/__tests__/MuPropertyBridge.test.ts`

### 257. Mu compat playback-health commands are marked supported but only expose hardcoded or never-updated local state
- **Severity**: Medium
- **Area**: Mu compatibility / playback telemetry
- **Root Cause**: `skipped()` returned a private field never updated from real playback. `isBuffering()` was hardcoded `false`. `mbps()`, `isCurrentFrameIncomplete()`, `isCurrentFrameError()` were also stubs but all marked as fully supported in the command manifest.
- **Fix**: Wired `isBuffering()` to `PlaybackAPI.isBuffering()` which delegates to real session buffering state. Wired `skipped()` to `PlaybackAPI.getDroppedFrameCount()` for real dropped frame tracking. Removed unused `_skippedFrames` field. Changed support table entries for `mbps`, `isCurrentFrameIncomplete`, and `isCurrentFrameError` from `true` to `false` (no session-layer APIs available for these). Added `tryGetOpenRV()` graceful degradation pattern.
- **Regression Tests**: 4 new compat tests (buffering reflects session, skipped tracks real drops, incremental counting, safe defaults without session) + 2 new PlaybackAPI dispose-guard tests for isBuffering and getDroppedFrameCount.
- **Verification**: All 633 compat tests pass, all 332 API tests pass, TypeScript clean.
- **Files Changed**: `src/compat/MuCommands.ts`, `src/compat/__tests__/MuCommands.test.ts`, `src/api/PlaybackAPI.ts`, `src/api/OpenRVAPI.test.ts`

### 258. Mu compat media-representation node APIs return fabricated node names that are never created in a real graph
- **Severity**: Medium
- **Area**: Mu compatibility / source representations
- **Root Cause**: `addSourceMediaRep()` synthesized node names and stored them locally but never created corresponding nodes in the graph, never wired representation switching, and never propagated to the live session. Query APIs returned phantom names that couldn't be used as real node identities.
- **Fix**: Created `MediaRepNode` — a lightweight `IPNode` subclass that materializes fabricated node names as real graph nodes. `addSourceMediaRep()` now calls `_ensureRepNodes()` to create real `RVMediaRepSource` and `RVMediaRepSwitch` nodes in the graph with proper source→switch connections. `setActiveSourceMediaRep()` updates the switch node's `activeInputIndex`. `clearSession()` removes all rep nodes from the graph. `MediaRepNode.process()` routes the correct input based on `activeInputIndex`. Session propagation via `tryGetOpenRV()` for graceful degradation.
- **Regression Tests**: 9 new tests covering: rep nodes in graph, switch node queryable, multiple reps share switch, session propagation, graceful degradation without graph, clearSession removes rep nodes, setActiveRep updates switch, process routes correct input, clearSession across multiple sources.
- **Verification**: All 642 compat tests pass (8 files), TypeScript clean.
- **Files Changed**: `src/compat/MuSourceBridge.ts`, `src/compat/__tests__/MuSourceBridge.test.ts`
