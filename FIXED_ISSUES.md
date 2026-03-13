# Fixed Issues

## Issue #1: Histogram shortcut is broken while the UI still advertises it
## Issue #2: Gamut diagram shortcut is broken while the UI still advertises it
## Issue #3: Scope shortcut hints are stale for waveform as well

**Root cause**: `KeyH`, `KeyW`, and `KeyG` were assigned to both view actions (fit-to-height, fit-to-width, goto-frame) and scope toggles (histogram, waveform, gamut diagram). To avoid conflicts, the scope bindings were placed in a `panel` context that never activates in production, making them permanently dead. The UI still advertised the old single-key shortcuts.

**Fix**: Restored bare H/W/G shortcuts using the context-aware dispatch system. On the QC tab (panel context), H/W/G toggle scopes. On other tabs, H/W/G perform their original actions (fit-to-height/width, goto-frame). Registered in `ContextualKeyboardManager` alongside the existing global bindings.

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

**Fix**: Implemented matte overlay API on `ViewAPI` with `setMatte()`, `clearMatte()`, `getMatte()` methods. Wired through Viewer to existing MatteOverlay. Updated docs with working examples.

**Tests added**: 14 regression tests (API-U060M through API-U073M) covering enable/disable/query, validation, clamping, dispose.

**Files changed**:
- `src/api/ViewAPI.ts`
- `src/api/types.ts`
- `src/ui/components/Viewer.ts`
- `src/api/OpenRVAPI.test.ts`
- `docs/advanced/overlays.md`

## Issue #285: Scripting guide's `exposureCheck()` can hang due to seek-before-subscribe race

**Fix**: Rewrote example in `docs/advanced/scripting-api.md` to subscribe to `frameChange` before calling `seek()`.

## Issue #286: Plugin examples don't match the actual plugin registration API shape

**Fix**: Updated all 6 plugin examples to use `manifest: { ... }` wrapper and correct `registerExporter(name, exporter)` two-arg signature. Added 3 regression tests.

**Files changed**:
- `docs/advanced/overlays.md`
- `docs/advanced/scripting-api.md`
- `src/plugin/PluginRegistry.test.ts`

## Issue #297: Session docs overclaim `.orvproject` captures complete state

**Fix**: Changed "captures every aspect" to "captures most of" and added Known Omissions section listing all 17 viewer states the serializer does not persist.

## Issue #298: Session-compatibility guide claims graph persistence that doesn't exist

**Fix**: Clarified that graph serialization is implemented but only present for multi-source/imported sessions, not simple single-file viewing.

## Issue #299: `AutoSaveManager` emits `recoveryAvailable` but production never subscribes

**Fix**: Added JSDoc annotation explaining the event is emitted but production uses polling instead. Updated docs to not reference the event as user-facing.

## Issue #300: Save-project shortcut guidance is inconsistent

**Fix**: Removed false `Ctrl+S`/`Ctrl+Shift+S` save-project claims from docs and header tooltip. No project-save shortcut exists — documented accurately.

**Tests added**: 4 keybinding tests (KB-U100-103) + 1 header tooltip test (HDR-U201).

**Files changed**:
- `docs/advanced/session-management.md`
- `docs/guides/session-compatibility.md`
- `features/session-management.md`
- `src/core/session/AutoSaveManager.ts`
- `src/ui/components/layout/HeaderBar.ts`
- `src/utils/input/KeyBindings.test.ts`
- `src/ui/components/layout/HeaderBar.test.ts`

## Issue #295: Plugin `app:stop` and `app:error` events never fire

**Root cause**: Both events ARE fully wired end-to-end in production — the original annotations were incorrect.
- `app:stop`: PlaybackAPI.stop() → Session.stop() → emit('playbackStopped') → EventsAPI → PluginEventBus
- `app:error`: SessionPlayback/Media/PlaybackEngine emit audioError/unsupportedCodec/representationError/frameDecodeTimeout → Session → EventsAPI.emitError() → PluginEventBus

**Fix**: Removed all "planned/not yet emitted" annotations. Marked both events as Active in docs. Added 5 tests proving the full event chain works.

## Issue #296: Generated API reference leaks dev-only `HotReloadManager`

**Fix**: Marked HotReloadManager section as "Dev-only / Internal" in `docs/api/index.md` with a warning blockquote. Added test verifying it's not exported from the public API.

**Tests added**: 2 forward-compatibility tests for plugin events + 1 export test for HotReloadManager.

**Files changed**:
- `src/plugin/PluginEventBus.ts`
- `src/plugin/PluginEventBus.test.ts`
- `src/api/exports.test.ts` (new)
- `docs/api/index.md`

## Issue #292: Docs advertise `playlistEnded` event not exposed in public API

**Root cause**: `PlaylistManager` emitted `playlistEnded` internally but it was never bridged to the public `EventsAPI`.

**Fix**: Added `playlistEnded` to `OpenRVEventName` type, `VALID_EVENTS` set, and `wireInternalEvents()`. Forwarded PlaylistManager event through Session to EventsAPI.

**Tests added**: 6 regression tests (API-U292a-f) covering event name validity, subscribe/unsubscribe, firing, dispose cleanup, once().

**Files changed**:
- `src/api/EventsAPI.ts`
- `src/api/OpenRVAPI.test.ts`
- `src/core/session/SessionTypes.ts`
- `src/AppPlaybackWiring.ts`

## Issue #294: `window.openrv.version` is hardcoded to `1.0.0`

**Root cause**: `OpenRVAPI.version` was hardcoded `'1.0.0'` while `package.json` declares `0.1.0`.

**Fix**: Both `ENGINE_VERSION` and `OpenRVAPI.version` now derive from `package.json` via `resolveJsonModule`. Single source of truth.

**Tests added**: 1 regression test verifying ENGINE_VERSION matches package.json.

**Files changed**:
- `src/api/OpenRVAPI.ts`
- `src/api/OpenRVAPI.test.ts`
- `src/plugin/version.ts`
- `src/plugin/version.test.ts`
- `tsconfig.json`

## Issue #293: `window.openrv.plugins.list()` includes disposed plugins

**Root cause**: `getRegisteredIds()` returned all keys without filtering by state.

**Fix**: Filter out entries with `state === 'disposed'` in `getRegisteredIds()`.

**Tests added**: 3 regression tests (PREG-031a/b/c) for disposed, registered-only, and active plugins.

**Files changed**:
- `src/plugin/PluginRegistry.ts`
- `src/plugin/PluginRegistry.test.ts`

## Issue #288: Plugin scripting guide omits required `activate(id)` step

**Fix**: Added `openrv.plugins.activate(id)` calls after every `register()` example in `docs/advanced/scripting-api.md`.

## Issue #289: AI docs-generation templates use nonexistent API methods

**Fix**: Replaced `media.loadFiles()`, `view.setCompareMode()`, `loop.setRange()`, `loop.enable()` with real API methods in `docs/scripts/lib/templates.ts`.

**Files changed**:
- `docs/advanced/scripting-api.md`
- `docs/scripts/lib/templates.ts`

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

## Issue #377: Crash-recovery detection leaves auto-save half-initialized

**Root cause**: `AutoSaveManager.initialize()` returned early when recovery entries were found, skipping session arming (active marking, timer start, beforeunload handler).

**Fix**: Extracted `armSession()` method. `initialize()` now always calls `armSession()` after recovery detection, ensuring auto-save is fully operational regardless of recovery state.

**Tests added**: 7 regression tests in `AutoSaveManager.issue377.test.ts`.

**Files changed**:
- `src/core/session/AutoSaveManager.ts`
- `src/core/session/AutoSaveManager.issue377.test.ts` (new)

## Issue #379: Turning auto-save off does not actually stop writes

**Root cause**: `markDirty()` scheduled a 2-second debounce save unconditionally; `saveWithGetter()`/`save()` didn't check `config.enabled`; disabling only stopped the interval timer.

**Fix**: `markDirty()` checks `config.enabled` before scheduling. `saveWithGetter()` guards against disabled state. `setConfig()` clears debounce timer on disable.

**Tests added**: 5 regression tests (AUTOSAVE-U035 through U039).

**Files changed**:
- `src/core/session/AutoSaveManager.ts`
- `src/core/session/AutoSaveManager.test.ts`

## Issue #566: `step(Infinity)` poisons playback with NaN frames

**Root cause**: `PlaybackAPI.step()` and `seek()` used `!isNaN()` instead of `Number.isFinite()`, allowing Infinity through. Loop-mode modular arithmetic on Infinity produces NaN.

**Fix**: Changed to `Number.isFinite()` in both `step()` and `seek()`. Added belt-and-suspenders guard in `PlaybackEngine.currentFrame` setter.

**Tests added**: 5 regression tests (API-U026b, API-U029b update, PE-007b/c/d).

**Files changed**:
- `src/api/PlaybackAPI.ts`
- `src/core/session/PlaybackEngine.ts`
- `src/core/session/PlaybackEngine.test.ts`
- `src/api/OpenRVAPI.test.ts`

## Issue #567: `setZoom()`/`setPan()` accept non-finite numbers

**Root cause**: `ViewAPI.setZoom()` and `setPan()` used `isNaN()` not `Number.isFinite()`, allowing Infinity into live transform state.

**Fix**: Changed to `Number.isFinite()` in both methods.

**Tests added**: 2 regression tests (API-U044b, API-U044c).

**Files changed**:
- `src/api/ViewAPI.ts`
- `src/api/OpenRVAPI.test.ts`

## Issue #568: `setCDL()` accepts non-finite values

**Root cause**: `ColorAPI.setCDL()` validated with `isNaN()` not `Number.isFinite()`, allowing Infinity into CDL grading pipeline.

**Fix**: Changed `validateRGB()` and saturation validation to use `Number.isFinite()`.

**Tests added**: 4 regression tests (API-U069e-inf through API-U069h-inf).

**Files changed**:
- `src/api/ColorAPI.ts`
- `src/api/OpenRVAPI.test.ts`

## Issue #277: Unified preferences import/reset doesn't apply live subsystems

**Status**: Already fixed in codebase (commit `5943340`). `importAll()` calls `applySubsystemsFromStorage()`, `resetAll()` calls `resetSubsystems()`. Each subsystem has `reloadFromStorage()`. Verified with 10 regression tests.

## Issue #384: Reloading a saved local image sequence collapses to single image

**Root cause**: Reload path used single-file picker with `accept='image/*'` and `loadFile()` for all non-video types, including sequences.

**Fix**: Sequence media now uses multi-file picker (`showSequenceReloadPrompt()`) and `loadSequence()`. Accept filter uses `SUPPORTED_MEDIA_ACCEPT` for all non-video reloads.

**Tests added**: 7 regression tests + 1 updated existing test.

**Files changed**:
- `src/core/session/SessionSerializer.ts`
- `src/ui/components/shared/Modal.ts`
- `src/core/session/SessionSerializer.test.ts`
- `src/core/session/SessionSerializer.issue384.test.ts` (new)

## Issue #405: Changing playlist transitions doesn't recalculate clip global start frames

**Root cause**: `PlaylistManager.setTransitionManager()` never subscribed to transition events, so `recalculateGlobalFrames()` never ran when transitions changed.

**Fix**: Subscribe to `transitionChanged` and `transitionsReset` in `setTransitionManager()`, recalculate frames and emit `clipsChanged`. Clean up old subscriptions on reassignment.

**Tests added**: 9 regression tests.

**Files changed**:
- `src/core/session/PlaylistManager.ts`
- `src/core/session/PlaylistManager.issue405.test.ts` (new)

## Issue #407: Removing/replacing clips leaves stale transitions shortening duration

**Root cause**: Clip-changing methods never called `transitionManager.resizeToClips()` to trim excess transitions.

**Fix**: Call `resizeToClips(this.clips.length)` in `addClip()`, `replaceClips()`, `removeClip()`, and `moveClip()`.

**Tests added**: 9 regression tests.

**Files changed**:
- `src/core/session/PlaylistManager.ts`
- `src/core/session/PlaylistManager.issue407.test.ts` (new)

## Issue #410: Partial restore doesn't remap currentSourceIndex

**Root cause**: `fromJSON()` built `mediaIndexMap` but only used it for representation restore. Playback state applied saved `currentSourceIndex` verbatim.

**Fix**: Remap `currentSourceIndex`, `sourceAIndex`, `sourceBIndex` through `mediaIndexMap`. Falls back to nearest valid index when saved source was skipped. Preserves `-1` sentinel values.

**Tests added**: 6 regression tests.

**Files changed**:
- `src/core/session/SessionSerializer.ts`
- `src/core/session/SessionSerializer.issue410.test.ts` (new)

## Issue #249: Mu compat ND properties lose their declared shape after any set or insert operation

**Status**: Already fixed in codebase. Write paths (`setStringProperty`, `_setNumericProperty`, insert helpers) now preserve the original `prop.dimensions` instead of flattening to `[values.length]`.

**Tests added**: Regression tests verifying ND property shape is preserved after set and insert operations.

**Files changed**:
- `src/compat/MuPropertyBridge.ts`
- `src/compat/__tests__/MuPropertyBridge.test.ts`

## Issue #250: Mu compat `closestNodesOfType()` returns farther matches too

**Status**: Already fixed in codebase. BFS now stops at the first matching depth, excluding farther-depth matches. Regression test added.

**Tests added**: 1 regression test verifying farther-depth matches are excluded in branched graphs.

**Files changed**:
- `src/compat/__tests__/MuEvalBridge.test.ts`

## Issue #252: Mu compat source-list fallbacks can return phantom source names

**Status**: Already fixed with `_ensureFallbackSourceRegistered`. Fallback sources from `sources()` and `sourcesAtFrame()` are now registered in the local `_sources` map so follow-up source queries can resolve them.

**Tests added**: Regression tests verifying fallback source names are resolvable by other source API methods.

**Files changed**:
- `src/compat/MuSourceBridge.ts`
- `src/compat/__tests__/MuSourceBridge.test.ts`

## Issue #253: Mu compat `properties('#TypeName')` does not honor hash-path semantics

**Root cause**: `properties(nodeName)` stripped `#` and did `key.startsWith(prefix + '.')` instead of using `_resolveKey()` three-tier priority logic (exact match, type-token match, substring match).

**Fix**: Aligned `properties('#TypeName')` with the same resolution logic used by `get*`, `propertyInfo`, and `propertyExists`.

**Tests added**: Regression tests covering `properties('#TypeName')` resolution with exact, type-token, and substring matches.

**Files changed**:
- `src/compat/MuPropertyBridge.ts`
- `src/compat/__tests__/MuPropertyBridge.test.ts`

## Issue #256: Mu compat hash-path property resolution is insertion-order dependent

**Status**: Already fixed with deterministic sorting. When multiple node names contain the same type token, resolution now uses stable ordering instead of depending on `Map` insertion order.

**Tests added**: Regression tests verifying deterministic hash-path resolution across insertion orders.

**Files changed**:
- `src/compat/__tests__/MuPropertyBridge.test.ts`

## Issue #310: Editing a multi-cut timeline collapses session pingpong looping

**Root cause**: `PlaylistManager` only supported `none`, `single`, and `all` loop modes. `TimelineEditorService` mapped `pingpong` to `all`, silently losing the bounce behavior.

**Fix**: Added `pingpong` to `PlaylistManager`'s loop mode type and implementation. Updated `TimelineEditorService` to pass `pingpong` through.

**Tests added**: Regression tests in `PlaylistManager.issue310.test.ts` and `TimelineEditorService.issue310.test.ts`.

**Files changed**:
- `src/core/session/PlaylistManager.ts`
- `src/core/session/PlaylistManager.issue310.test.ts` (new)
- `src/services/TimelineEditorService.ts`
- `src/services/TimelineEditorService.issue310.test.ts` (new)

## Issue #311: RVEDL entries with unmatched source paths are silently rebound to loaded source 0

**Root cause**: `buildEDLFromRVEDLEntries()` fell back to `sourceIndex = 0` for unmatched paths without any warning, making the timeline look resolved when it was not.

**Fix**: Return `unresolvedPaths` array from the builder and log warnings for each unresolved RVEDL source path.

**Tests added**: Regression tests verifying unresolved paths are surfaced and logged.

**Files changed**:
- `src/services/TimelineEditorService.ts`
- `src/services/TimelineEditorService.test.ts`

## Issue #312: Imported RVEDL cuts are ignored whenever the session already has playlist clips

**Root cause**: `syncFromGraph()` checked playlist clips before RVEDL entries. If any playlist clips existed, the RVEDL branch was unreachable.

**Fix**: Reordered `syncFromGraph()` to check RVEDL entries before playlist clips, giving imported EDLs priority.

**Tests added**: Regression tests verifying RVEDL entries take precedence over existing playlist clips.

**Files changed**:
- `src/services/TimelineEditorService.ts`
- `src/services/TimelineEditorService.test.ts`

## Issue #315: Project restore does not clear old RVEDL state when the new project has no EDL entries

**Root cause**: `fromJSON()` only called `session.setEdlEntries()` when the saved project had entries (`length > 0`). Loading a project with no EDL after one that had EDL left stale entries in session state.

**Fix**: Unconditionally call `setEdlEntries()` during restore, passing an empty array when the project has no EDL data.

**Tests added**: Regression tests verifying EDL state is cleared on restore.

**Files changed**:
- `src/core/session/SessionSerializer.ts`
- `src/core/session/SessionSerializer.test.ts`

## Issue #534: Representation fallback and removal can change active media without emitting representationChanged

**Root cause**: `removeRepresentation()` picked the next ready representation but emitted no `representationChanged` event. Error fallback emitted only `fallbackActivated`, not `representationChanged`.

**Fix**: Emit `representationChanged` event in both the removal fallback and error fallback paths.

**Tests added**: Regression tests verifying the event is emitted on both removal and error fallback.

**Files changed**:
- `src/core/session/MediaRepresentationManager.ts`
- `src/core/session/MediaRepresentationManager.test.ts`

## Issue #541: Adding a new representation corrupts activeRepresentationIndex after priority sort

**Root cause**: `addRepresentation()` sorted representations by priority but never remapped the existing `activeRepresentationIndex` to track the same representation object.

**Fix**: After sorting, remap `activeRepresentationIndex` to the new position of the previously active representation.

**Tests added**: Regression tests verifying active representation identity is preserved after sort.

**Files changed**:
- `src/core/session/MediaRepresentationManager.ts`
- `src/core/session/MediaRepresentationManager.test.ts`

## Issue #553: Public `openrv.media.getStartFrame()` coerces 0 to 1

**Root cause**: `MediaAPI.getStartFrame()` used `return startFrame || 1`, which treated `0` as falsy and replaced it with `1`.

**Fix**: Changed to explicit null check (`startFrame != null ? startFrame : 1`) so legitimate frame-0 media is preserved.

**Tests added**: Regression tests verifying `getStartFrame()` returns `0` for 0-based media.

**Files changed**:
- `src/api/MediaAPI.ts`
- `src/api/OpenRVAPI.test.ts`
