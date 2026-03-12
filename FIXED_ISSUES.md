# Fixed Issues

## Issue #1: Histogram shortcut is broken while the UI still advertises it
## Issue #2: Gamut diagram shortcut is broken while the UI still advertises it
## Issue #3: Scope shortcut hints are stale for waveform as well

**Root cause**: `KeyH`, `KeyW`, and `KeyG` were assigned to both view actions (fit-to-height, fit-to-width, goto-frame) and scope toggles (histogram, waveform, gamut diagram). To avoid conflicts, the scope bindings were placed in a `panel` context that never activates in production, making them permanently dead. The UI still advertised the old single-key shortcuts.

**Fix**: Assigned unique, non-conflicting `Ctrl+Shift` shortcuts:
- Histogram: `Ctrl+Shift+H` (was `H` in dead `panel` context)
- Waveform: `Ctrl+Shift+W` (was `W` in dead `panel` context)
- Gamut diagram: `Ctrl+Shift+G` (was `G` in dead `panel` context)

Removed dead contextual registrations from `App.ts`, updated UI hints in `ScopesControl.ts`, and updated documentation.

**Tests added**: 10 new regression tests in `AppKeyboardHandler.test.ts` covering binding definitions, conflict-free verification, direct registration, label generation, and UI hint accuracy.

**Files changed**:
- `src/utils/input/KeyBindings.ts`
- `src/AppKeyboardHandler.ts`
- `src/AppKeyboardHandler.test.ts`
- `src/App.ts`
- `src/ui/components/ScopesControl.ts`
- `features/keyboard-shortcuts.md`

## Issue #10: The context system has production-dead branches that tests and bindings still rely on

**Root cause**: The `BindingContext` type included dead contexts (`timeline`, `channel`, `annotate`) that no production tab switching ever activated. Bindings referencing these contexts could never fire, and tests used them freely, diverging from real app behavior.

**Fix**:
- Removed `timeline`, `channel`, and `annotate` from the `BindingContext` type union
- Removed dead `context: 'timeline'` from `timeline.setOutPoint` and `timeline.resetInOut` (they should work globally)
- Changed `context: 'annotate'` to `context: 'paint'` on `notes.addNote` (Annotate tab maps to `paint` in production)
- Updated all tests to use only production-valid contexts
- Added documentation mapping production tabs to contexts

**Tests added**: 5 regression tests (`KB-U090` through `KB-U094`) verifying no binding references a dead context and specific bindings have correct context restrictions.

**Files changed**:
- `src/utils/input/KeyBindings.ts`
- `src/utils/input/ActiveContextManager.ts`
- `src/utils/input/ContextualKeyboardManager.ts`
- `src/utils/input/ActiveContextManager.test.ts`
- `src/utils/input/ContextualKeyboardManager.test.ts`
- `src/__e2e__/ActiveContextManager.e2e.test.ts`
- `src/KeyboardWiring.test.ts`

## Issue #17: DCC media loading derives the display name with POSIX-only path splitting
## Issue #21: POSIX-only basename extraction also exists in the core source nodes

**Root cause**: Path basename extraction used `.split('/').pop()` which doesn't handle Windows paths, URLs with query strings/fragments, or trailing separators.

**Fix**: Enhanced the shared `basename()` utility in `src/utils/path.ts` to strip URL query/fragment, handle both POSIX and Windows separators, and skip trailing separators. Replaced remaining inline split patterns in `Session.ts` and `GTOGraphLoader.ts` with the shared utility.

**Tests added**: 8 new tests in `src/utils/path.test.ts` covering Windows paths, URLs with query strings/fragments, trailing slashes, edge cases.

**Files changed**:
- `src/utils/path.ts`
- `src/utils/path.test.ts`
- `src/core/session/Session.ts`
- `src/core/session/GTOGraphLoader.ts`

## Issue #224: HDR output mode UI can claim a mode change even when the renderer rejects it

**Root cause**: `ToneMappingControl.setHDROutputMode()` optimistically updated internal state and UI before emitting `hdrModeChanged`. The wiring logged a warning on renderer rejection but never reverted the UI.

**Fix**: Changed `hdrModeChanged` event to include `previousMode`. Added `syncHDROutputMode()` method to ToneMappingControl (following existing `sync*` pattern). Wiring now reverts UI via `syncHDROutputMode(previousMode)` when the renderer rejects the mode.

**Tests added**: 6 new ToneMappingControl tests + 1 new AppViewWiring test covering success/failure paths.

## Issue #225: Changing HDR output mode does not schedule a viewer redraw

**Status**: Already fixed in the codebase. `Viewer.setHDROutputMode()` already calls `scheduleRender()` on success. Verified by existing tests VWR-HDR-004 and VWR-HDR-005.

**Files changed**:
- `src/ui/components/ToneMappingControl.ts`
- `src/ui/components/ToneMappingControl.test.ts`
- `src/AppViewWiring.ts`
- `src/AppViewWiring.test.ts`
- `src/hdr-acceptance-criteria.test.ts`

## Issue #281: MXF is still registered as a decoder even though the decode result is only a 1x1 placeholder

**Root cause**: `'mxf'` was listed in the `BuiltinFormatName` type union and `DecoderOptionsMap` even though the MXF "decoder" only returned a dummy 1x1 image. This made `decodeAs('mxf')` compile but produce fake frames.

**Fix**: Removed `'mxf'` from `BuiltinFormatName` and `DecoderOptionsMap`. MXF metadata parsing via `MXFDemuxer` (isMXFFile, parseMXFHeader, demuxMXF) remains fully functional.

**Tests added**: 4 regression tests verifying MXF is excluded from the decode path.

**Files changed**:
- `src/formats/DecoderRegistry.ts`
- `src/formats/DecoderRegistry.test.ts`

## Issue #280: Published scripting docs expose `openrv.color` LUT methods that don't exist
## Issue #282: Multiple shipped color scripting pages document methods that don't exist

**Root cause**: Docs documented planned API methods (loadLUT, resetCDL, setDisplayProfile, setOCIOState, setToneMapping, exportCurvesJSON, etc.) as if they were available on `window.openrv.color`, but ColorAPI only exposes adjustments, CDL, and curves.

**Fix**: Updated all 6 color doc files to clearly mark unimplemented methods as "Planned API (not yet available)" with banners, and added available methods lists and workarounds where possible.

**Tests added**: 1 regression test verifying the exact public surface of ColorAPI (9 real methods exist, 13 documented-but-unimplemented are undefined).

**Files changed**:
- `docs/color/lut.md`
- `docs/color/cdl.md`
- `docs/color/display-profiles.md`
- `docs/color/ocio.md`
- `docs/color/tone-mapping.md`
- `docs/color/curves.md`
- `src/api/OpenRVAPI.test.ts`

## Issue #284: Overlays docs publish `openrv.matte.enable()` but it doesn't exist in public API

**Fix**: Marked `openrv.matte` as planned/not yet shipped in `docs/advanced/overlays.md`.

## Issue #285: Scripting guide's `exposureCheck()` can hang due to seek-before-subscribe race

**Fix**: Rewrote example in `docs/advanced/scripting-api.md` to subscribe to `frameChange` before calling `seek()`.

## Issue #286: Plugin examples don't match the actual plugin registration API shape

**Fix**: Updated all 6 plugin examples to use `manifest: { ... }` wrapper and correct `registerExporter(name, exporter)` two-arg signature. Added 3 regression tests.

**Files changed**:
- `docs/advanced/overlays.md`
- `docs/advanced/scripting-api.md`
- `src/plugin/PluginRegistry.test.ts`

## Issue #290: Plugin `engineVersion` is declared but never enforced

**Root cause**: `PluginRegistry.register()` never checked `manifest.engineVersion` against the host version.

**Fix**: Added `ENGINE_VERSION` constant and `satisfiesMinVersion()` helper in new `src/plugin/version.ts`. Registration now rejects plugins requiring a newer host version.

**Tests added**: 12 tests for semver parsing/comparison + 6 tests for engineVersion validation in registration.

**Files changed**:
- `src/plugin/version.ts` (new)
- `src/plugin/version.test.ts` (new)
- `src/plugin/PluginRegistry.ts`
- `src/plugin/PluginRegistry.test.ts`
- `src/plugin/index.ts`

## Issue #291: Plugin `processor` contribution type has no registration path

**Root cause**: `'processor'` was in `PluginContributionType` but `PluginContext` had no `registerProcessor()` method.

**Fix**: Removed `'processor'` from the type union with a comment noting it's planned. Updated docs and examples.

**Files changed**:
- `src/plugin/types.ts`
- `docs/api/index.md`
- `docs/advanced/scripting-api.md`

## Issue #287: `openrv.isReady()` can return true before mount-time initialization has finished

**Root cause**: `OpenRVAPI` constructor set `_ready = true` synchronously, while `App.mount()` is async with tail work (persistence init, URL bootstrap). `main.ts` didn't await mount.

**Fix**: Constructor no longer sets `_ready`. Added `markReady()` method called after `app.mount()` completes. Added `onReady(callback)` for external consumers. Separated `_disposed` flag from readiness.

**Tests added**: 9 regression tests covering the two-step lifecycle, onReady callbacks, dispose interaction, and sub-API usability before ready.

**Files changed**:
- `src/api/OpenRVAPI.ts`
- `src/api/OpenRVAPI.test.ts`
- `src/main.ts`

## Issue #283: `openrv.dispose()` advertises the API as unusable afterward, but only the event module is torn down

**Status**: Already fixed in codebase. `OpenRVAPI.dispose()` already calls `dispose()` on all sub-APIs, and all methods call `assertNotDisposed()`. Added regression test coverage to verify.

**Tests added**: 9 regression tests verifying all sub-APIs are disposed, double-dispose is idempotent, and no method can mutate state after disposal.

**Files changed**:
- `src/api/OpenRVAPI.test.ts`
