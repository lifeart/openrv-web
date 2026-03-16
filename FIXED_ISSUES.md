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

## Issue #254: Mu compat `fileKind()` misclassifies URLs with query strings

**Status**: Already fixed. `getExtension()` in `MuUtilsBridge.ts` already strips `?` query strings and `#` fragments before extracting the extension.

**Tests added**: 8 regression tests in `MuUtilsBridge.test.ts` covering URLs with query strings, fragments, signed URLs, and normal filenames.

**Files changed**:
- `src/compat/__tests__/MuUtilsBridge.test.ts`

## Issue #260: Mu compat `wireDOMEvents()` double-registers listeners

**Status**: Already fixed. `MuEventBridge` uses a `WeakSet<EventTarget>` to track wired targets and returns early on duplicate calls. `dispose()` resets the set.

**Tests added**: 3 regression tests already existed covering double-wire, re-wire after dispose.

## Issue #269: Mu compat `setNodeInputs()` non-atomic partial rewire

**Status**: Already fixed. `setNodeInputs()` saves `originalInputs` before disconnecting and restores them in a `catch` block on connection failure.

## Issue #273: Mu settings helpers throw in blocked-storage environments

**Status**: Already fixed. All `localStorage` calls in `MuSettingsBridge.ts` are wrapped in `try/catch` with sensible defaults.

**Tests added**: 14 normal-operation regression tests in `MuSettingsBridge.test.ts`.

**Files changed**:
- `src/compat/__tests__/MuSettingsBridge.test.ts`

## Issue #274: Mu compat `sendInternalEvent()` discards `returnContents`

**Status**: Already fixed. `sendInternalEvent()` returns `string` (the `event.returnContents` after dispatch). Tests already exist covering handler-written return values.

## Issue #275: `registerMuCompat()` returns fresh objects on repeat calls

**Status**: Already fixed. Uses `_cachedResult` guard to return the same instances on repeat calls.

## Issue #276: Mu compat `fullScreenMode` marked async but returns void

**Status**: Already fixed. `fullScreenMode()` is declared `async` and returns `Promise<void>`.

## Issue #278: `MediaCacheManager` OPFS fallback fails noisily

**Status**: Already fixed. `initialize()` calls `probeCreateWritable()` and stores `_writableSupported` flag. Writes check this flag before attempting `createWritable()`.

## Issue #255: Mu compat `remoteConnect()` forces `wss` for non-local hosts

**Status**: Already fixed. `remoteConnect()` now inspects `location.protocol` and supports explicit `ws://`/`wss://` prefixes.

**Tests added**: 7 regression tests in `MuNetworkBridge.test.ts`.

**Files changed**:
- `src/compat/__tests__/MuNetworkBridge.test.ts`

## Issue #263: Mu compat `imagesAtPixel()` returns all images, not just under point

**Status**: Already fixed. Added `if (inside || edge)` guard to filter out non-hit images.

## Issue #266: Mu compat `sourcesAtFrame()` ignores frame on fallback

**Status**: Already fixed. Fallback path now checks frame against source duration range.

## Issue #267: Mu compat `sourceMediaInfoList()` omits fallback source

**Status**: Already fixed. `sourceMediaInfoList()` now calls `_ensureFallbackSourceRegistered()` before mapping.

## Issue #268: Mu compat fallback `sources()` puts name in media field

**Root cause**: Fallback source creation used `current.url || current.name`, putting the source identifier name in the `media` field when no URL was available.

**Fix**: Changed to `current.url || ''` in both `sources()` and `_ensureFallbackSourceRegistered()`.

**Tests added**: Updated existing test to verify `media` is empty string (not source name) when no URL available.

**Files changed**:
- `src/compat/MuSourceBridge.ts`
- `src/compat/__tests__/MuSourceBridge.test.ts`

## Issue #375: Auto-save max versions UI caps at 50 instead of 100

**Root cause**: `AutoSaveIndicator` max versions range input had `max = '50'` while `AutoSaveManager` supports 1-100.

**Fix**: Changed `max = '50'` to `max = '100'`.

**Tests added**: 2 regression tests (AUTOSAVE-U043, U044) verifying slider max attribute and value 75.

**Files changed**:
- `src/ui/components/AutoSaveIndicator.ts`
- `src/ui/components/AutoSaveIndicator.test.ts`

## Issue #381: Snapshot import bypasses retention limits

**Root cause**: `importSnapshot()` stored snapshots without calling the prune logic used by `createSnapshot()`.

**Fix**: Added `pruneSnapshots()` call after `putSnapshot()` in `importSnapshot()`, using the same limits as create paths (50 manual / 10 auto-checkpoints).

**Tests added**: 3 regression tests (SNAP-I001 through I003) verifying prune calls for manual, auto-checkpoint, and unconditional invocation.

**Files changed**:
- `src/core/session/SnapshotManager.ts`
- `src/core/session/SnapshotManager.test.ts`

## Issue #385: Restore-time file picker uses `image/*` instead of full supported set

**Root cause**: Session restore picker hardcoded `'video/*'` for video media instead of using the full `SUPPORTED_MEDIA_ACCEPT` constant.

**Fix**: Changed to always use `SUPPORTED_MEDIA_ACCEPT` for all media types.

**Tests added**: 4 regression tests verifying restore picker uses full supported media accept string.

**Files changed**:
- `src/core/session/SessionSerializer.ts`
- `src/core/session/SessionSerializer.issue385.test.ts` (new)
- `src/core/session/SessionSerializer.test.ts`
- `src/core/session/SessionSerializer.issue384.test.ts`

## Issue #386: `.orvproject` drag-drop not supported in viewer

**Root cause**: Viewer drop handler only handled `.rvedl`, `.rv`, `.gto` — `.orvproject` fell through to generic media loader which rejected it.

**Fix**: Added `.orvproject` detection in `ViewerInputHandler.onDrop`, with `onProjectFileDrop` callback. Wired through `Viewer` to `AppPlaybackWiring` calling `persistenceManager.openProject()`.

**Tests added**: 7 regression tests (PROJ-DROP-001 through 007).

**Files changed**:
- `src/ui/components/ViewerInputHandler.ts`
- `src/ui/components/ViewerInputHandler.test.ts`
- `src/ui/components/Viewer.ts`
- `src/AppPlaybackWiring.ts`
- `src/AppPlaybackWiring.test.ts`

## Issue #390: `SnapshotManager` `snapshotRestored` event never emitted

**Root cause**: `SnapshotManagerEvents` declared `snapshotRestored` but no code emitted it. Restore logic lived in `AppPersistenceManager` without notifying the manager.

**Fix**: Added `notifyRestored(snapshot)` method to `SnapshotManager`. Called from `AppPersistenceManager.restoreSnapshot()` after successful restore.

**Tests added**: 5 regression tests (2 unit in SnapshotManager, 3 integration in AppPersistenceManager) covering event emission on success and non-emission on failure.

**Files changed**:
- `src/core/session/SnapshotManager.ts`
- `src/core/session/SnapshotManager.test.ts`
- `src/AppPersistenceManager.ts`
- `src/AppPersistenceManager.test.ts`
- `src/AppPersistenceManager.issue191.test.ts`

## Issue #564: Marker API accepts non-integer frame numbers

**Root cause**: `MarkersAPI.add()` accepted float frames (e.g., `10.7`) and stored them verbatim, but playback is integer-frame based.

**Fix**: Added `Math.round()` for `frame` and `endFrame` in `add()`, `remove()`, and `get()`. Added `isFinite()` check to reject `Infinity`/`-Infinity`.

**Tests added**: 9 regression tests (API-U096 through U104) covering float rounding and non-finite rejection.

**Files changed**:
- `src/api/MarkersAPI.ts`
- `src/api/OpenRVAPI.test.ts`

## Issue #565: Loop-range API accepts fractional frame numbers

**Root cause**: `LoopAPI.setInPoint()` and `setOutPoint()` forwarded raw float values to the session.

**Fix**: Added `Math.round()` and `isFinite()` validation in both methods.

**Tests added**: 4 regression tests (API-U064 through U067).

**Files changed**:
- `src/api/LoopAPI.ts`
- `src/api/OpenRVAPI.test.ts`

## Issue #569: Marker API accepts non-finite frame/endFrame values

**Root cause**: Same as #564 — `isFinite()` check was missing. Fixed together with #564.

## Issue #570: `setAdjustments()` silently ignores invalid numeric values

**Root cause**: `ColorAPI.setAdjustments()` skipped `NaN` fields silently and let `Infinity` through. Downstream `ColorControls` then quietly reset non-finite values to defaults.

**Fix**: Added `Number.isFinite()` validation that throws `ValidationError` for any non-finite numeric field, consistent with `setCDL()` and other validated setters.

**Tests added**: 4 regression tests (API-U067 through U067d) covering NaN, Infinity, and valid value handling.

**Files changed**:
- `src/api/ColorAPI.ts`
- `src/api/OpenRVAPI.test.ts`

## Issue #372: Production 360 auto-detection throws away spherical metadata and falls back to aspect ratio only

**Root cause**: `LayoutOrchestrator` called `detect360Content({}, width, height)` with an empty metadata object, ignoring `isSpherical` and `projectionType` metadata on the loaded source.

**Fix**: Added `isSpherical` and `projectionType` fields to the `MediaSource` interface. Updated `LayoutOrchestrator.onSourceLoaded360` to extract and forward these metadata fields to `detect360Content()`.

**Tests added**: 3 regression tests (LO-044 through LO-046) covering metadata-based 360 detection, projectionType detection, and metadata override of aspect-ratio heuristic.

**Files changed**:
- `src/core/session/SessionTypes.ts`
- `src/services/LayoutOrchestrator.ts`
- `src/services/LayoutOrchestrator.test.ts`

## Issue #373: Plain media loads leave the header title at `Untitled` unless the user manually renames the session

**Root cause**: The `sourceLoaded` handler never assigned a display name from the loaded source. Fresh sessions stayed at `Untitled` until manually renamed.

**Fix**: Added auto-naming in `handleSourceLoaded()` — when the session has no display name and the loaded source has a name, the session display name is set from the source name. Manually set names are never overridden.

**Tests added**: 3 regression tests (SLH-DN001 through SLH-DN003) covering auto-naming, manual name preservation, and nameless source handling.

**Files changed**:
- `src/handlers/sourceLoadedHandlers.ts`
- `src/handlers/sourceLoadedHandlers.test.ts`

## Issue #392: Auto-save failure feedback self-clears after five seconds even when the failure is unresolved

**Root cause**: `AutoSaveIndicator` scheduled a 5-second auto-reset from error state back to idle, removing the retry affordance before the failure was resolved.

**Fix**: Removed the `scheduleStatusReset('idle', 5000)` call from the error handler. Error state now persists until a successful save occurs or a retry succeeds.

**Tests added**: 3 regression tests (AUTOSAVE-UI-060 through AUTOSAVE-UI-062) covering error persistence, clearing on subsequent save, and clearing on successful retry.

**Files changed**:
- `src/ui/components/AutoSaveIndicator.ts`
- `src/ui/components/AutoSaveIndicator.test.ts`

## Issue #396: Discarding crash recovery wipes the entire auto-save history, not just the recovered entry

**Root cause**: On discard, `AppPersistenceManager` called `autoSaveManager.clearAll()` instead of deleting just the prompted entry.

**Fix**: Changed to `autoSaveManager.deleteAutoSave(mostRecent.id)` to only remove the specific entry the user was asked about.

**Tests added**: 2 regression tests (APM-396a, APM-396b) verifying only the prompted entry is deleted and other entries survive.

**Files changed**:
- `src/AppPersistenceManager.ts`
- `src/AppPersistenceManager.test.ts`

## Issue #397: Clean auto-save recovery has no success state when the recovered session contains no media

**Root cause**: `recoverAutoSave()` only showed a success alert when `loadedMedia > 0`, with no feedback for state-only recovery.

**Fix**: Added an else branch showing an info alert "Session recovered (no media files — state only)" for zero-media recoveries, matching the pattern used by project load and snapshot restore.

**Tests added**: 2 regression tests (APM-397a, APM-397b) covering state-only and media recovery feedback.

**Files changed**:
- `src/AppPersistenceManager.ts`
- `src/AppPersistenceManager.test.ts`

## Issue #398: `SnapshotManager` advertises an `error` event, but production never emits it

**Root cause**: `SnapshotManagerEvents` declared an `error` event but no code ever called `emit('error', ...)`. Errors were only logged or thrown.

**Fix**: In `notifySnapshotsChanged()`, the catch block now emits `error` event after logging, with the caught value normalized to an `Error` instance. This is the only place where errors are swallowed without being thrown to callers.

**Tests added**: 3 regression tests (SNAP-ERR001 through SNAP-ERR003) covering error emission on snapshot list refresh failure, non-Error wrapping, and auto-checkpoint paths.

**Files changed**:
- `src/core/session/SnapshotManager.ts`
- `src/core/session/SnapshotManager.test.ts`

## Issue #402: GTO import can keep the previous session title/comment when the new file leaves them blank

**Root cause**: `SessionGraph.loadFromGTO()` did not reset `_metadata` before parsing, so a GTO file with no title/comment inherited stale metadata from the previous session.

**Fix**: Added metadata reset to default values at the beginning of `loadFromGTO()`, before any GTO parsing occurs.

**Tests added**: 4 regression tests (ISS-402-001 through ISS-402-004) covering metadata clearing, setting, sequential loads, and reset-on-failure.

**Files changed**:
- `src/core/session/SessionGraph.ts`
- `src/core/session/SessionGraph.issue402.test.ts` (new)

## Issue #404: Project/snapshot restore can leave stale playlist transitions active when the incoming state has none

**Root cause**: `PlaylistManager.clear()` didn't clear the linked `TransitionManager`, and `setState()` didn't clear transitions when the incoming state had none.

**Fix**: Added `transitionManager?.clear()` call in `clear()`. Changed `setState()` to call `transitionManager.clear()` when no transitions are provided, and `transitionManager.setState()` when they are.

**Tests added**: 5 regression tests covering clear-with-transitions, setState-without-transitions, setState-with-undefined-transitions, setState-with-transitions, and transition replacement.

**Files changed**:
- `src/core/session/PlaylistManager.ts`
- `src/core/session/PlaylistManager.issue404.test.ts` (new)

## Issue #409: Timeline/EDL edits that rebuild the playlist ignore transition-adjusted clip start frames

**Root cause**: `PlaylistManager.replaceClips()` rebuilt clips with sequential `globalStartFrame` values but never called `recalculateGlobalFrames()` to apply transition overlap adjustments.

**Fix**: Added `recalculateGlobalFrames()` call in `replaceClips()` after assigning clips and resizing the transition manager, but before clamping `currentFrame` and emitting `clipsChanged`.

**Tests added**: 5 regression tests covering single transition overlap, multiple transitions, no-transition-manager path, total duration correctness, and currentFrame clamping.

**Files changed**:
- `src/core/session/PlaylistManager.ts`
- `src/core/session/PlaylistManager.issue409.test.ts` (new)

## Issue #415: RV/GTO import cannot explicitly restore the "all scopes off" state

**Root cause**: `parseScopes()` returned `null` when all four scopes were `false`, making it impossible to distinguish "GTO has scopes with all off" from "GTO has no scopes data". The `settingsLoaded` handler only acted when `settings.scopes` existed.

**Fix**: Changed `parseScopes()` to track whether any scope protocol node exists in the GTO data and return the `ScopesState` object (even with all `false` values) when at least one node is found.

**Tests added**: 5 regression tests (3 in Session.graph.test.ts, 2 in persistenceHandlers.test.ts) covering all-off with nodes, nodes with no active property, no scope nodes, handler hiding all scopes, and handler skipping when no scopes property.

**Files changed**:
- `src/core/session/GTOSettingsParser.ts`
- `src/core/session/Session.graph.test.ts`
- `src/handlers/persistenceHandlers.test.ts`

## Issue #303: Network Sync ignores `roomLeft`, so disconnect-driven room exits can leave stale room info in the panel

**Root cause**: `AppNetworkBridge` subscribed to `connectionStateChanged`, `roomCreated`, `roomJoined`, `usersChanged`, `error`, and `rttUpdated` from `NetworkSyncManager`, but not `roomLeft`. When a room ended due to a remote/serverless disconnect (not the local "Leave" button), the Network Sync UI retained stale room code, users, and share-link state while showing a disconnected connection state.

**Fix**: Added a `roomLeft` event subscription in `AppNetworkBridge.setup()` that clears all room-related UI state in `NetworkControl` when fired — setting connection to `disconnected`, clearing host flag, share link kind, response token, room info, users list, hiding the info panel, and clearing `paintEngine.idPrefix`. This mirrors exactly what the manual `leaveRoom` click handler does.

**Tests added**: 5 regression tests (ANB-130 through ANB-134) covering: event subscription verification, full room state clearing on `roomLeft`, paint engine prefix clearing, manual `leaveRoom` independence, and post-dispose safety.

**Files changed**:
- `src/AppNetworkBridge.ts`
- `src/AppNetworkBridge.test.ts`

## Issue #363: Shortcut cheat sheet has no outside-click dismissal despite docs promising it

**Root cause**: The `ShortcutCheatSheet` component only supported dismissal via the Escape key path in `KeyboardActionMap`. It had no click-outside/backdrop-dismiss handler, so clicking outside the overlay content had no effect.

**Fix**: Added an outside-click dismiss handler to `ShortcutCheatSheet`. When `show()` is called, a `mousedown` listener is registered on `document`. The `onClickOutside()` method checks if the click target is inside `.cheatsheet-columns` (the content area) — if yes, does nothing; if no (click on backdrop), calls `hide()`. The listener is cleaned up in `hide()` and `dispose()`.

**Tests added**: 6 regression tests (CS-023 through CS-028) covering: outside-click dismissal, inside-click non-dismissal, backdrop click dismissal, re-show after dismissal, listener cleanup on hide, and listener cleanup on dispose.

**Files changed**:
- `src/ui/components/ShortcutCheatSheet.ts`
- `src/ui/components/ShortcutCheatSheet.test.ts`

## Issue #304: Playback buffering and decode-timeout diagnostics not surfaced to users

**Root cause**: `PlaybackEngine` emits `buffering` and `frameDecodeTimeout` events (forwarded by `SessionPlayback` onto the session), but `AppSessionBridge` never subscribed to them, so users got no feedback during playback stalls or decode timeouts.

**Fix**: Added `buffering` and `frameDecodeTimeout` subscriptions in `AppSessionBridge.bindSessionEvents()`. Created new `bufferingHandlers.ts` module with: `handleBufferingChanged(isBuffering)` that shows/hides a fixed-position overlay with spinner and "Buffering..." label (with ARIA accessibility), and `handleFrameDecodeTimeout(frame)` that shows a warning alert via the existing Modal system.

**Tests added**: 17 tests — 5 in AppSessionBridge.test.ts (ASB-007 through ASB-009, ASB-048, ASB-049) verifying event subscription/forwarding/unsubscription, and 12 in bufferingHandlers.test.ts covering overlay show/hide, idempotency, cycle behavior, decode timeout alerts, and cleanup.

**Files changed**:
- `src/AppSessionBridge.ts`
- `src/AppSessionBridge.test.ts`
- `src/handlers/bufferingHandlers.ts` (new)
- `src/handlers/bufferingHandlers.test.ts` (new)

## Issue #332: Compare overlays show hardcoded A/B labels instead of real source names

**Root cause**: Split-screen overlay hardcoded labels to `A`/`B`, wipe overlay hardcoded to `Original`/`Graded`. The existing `setWipeLabels()` API existed on Viewer but was never called from runtime wiring. Source names were available but never passed through.

**Fix**: Added `deriveCompareLabels(session)` helper in `AppViewWiring.ts` that reads `session.sourceA?.name` and `session.sourceB?.name`, falling back to `A`/`B` when unavailable. Wired label updates into the `wipeModeChanged` handler. Extended `WipeManager.setLabels()` to set labels on both wipe and split-screen elements simultaneously, added `getSplitScreenLabels()` method.

**Tests added**: 14 tests — 10 in AppViewWiring.test.ts (VW-030 through VW-039) covering source name labels, fallbacks, all compare modes, partial availability, and `deriveCompareLabels` unit tests; 4 in WipeManager.test.ts (WM-U016 through WM-U019) verifying split-screen label propagation.

**Files changed**:
- `src/AppViewWiring.ts`
- `src/AppViewWiring.test.ts`
- `src/ui/components/WipeManager.ts`
- `src/ui/components/WipeManager.test.ts`

## Issue #353: EXR window overlay doesn't auto-activate on mismatched data/display windows

**Root cause**: On source load, production called `setWindows()` to store EXR data/display window bounds but never called `enable()`. The overlay defaulted to `enabled: false` and required manual toggle. The documentation promised auto-activation on mismatched windows.

**Fix**: Added mismatch detection in `EXRWindowOverlay.setWindows()` — compares all four bounds (xMin, yMin, xMax, yMax) and auto-enables when they differ, auto-disables when they match. `clearWindows()` now also sets `enabled: false`. Added explicit `enable()`/`disable()` calls in `sourceLoadedHandlers.ts` for defense-in-depth.

**Tests added**: 6 regression tests (EXR-120 through EXR-125) covering auto-enable on mismatch, stays disabled on match, disables on clear, stateChanged events, and mismatch-to-match transitions.

**Files changed**:
- `src/ui/components/EXRWindowOverlay.ts`
- `src/ui/components/EXRWindowOverlay.test.ts`
- `src/handlers/sourceLoadedHandlers.ts`

## Issue #358: Clipboard denial during frame export shows no error message to users

**Root cause**: `FrameExporter.copyToClipboard()` caught clipboard errors, logged them, and returned `false`. The keyboard action handler in `KeyboardActionMap` did not check the return value, so clipboard failures were silent.

**Fix**: Updated the `export.copyFrame` handler in `KeyboardActionMap` to `await` the clipboard result. When it returns `false`, shows a user-visible error alert via `showAlert()` with "Clipboard Error" title explaining access was denied.

**Tests added**: 2 tests verifying: failed clipboard copy triggers `showAlert` with error type, successful copy does not show any alert.

**Files changed**:
- `src/services/KeyboardActionMap.ts`
- `src/services/KeyboardActionMap.test.ts`

## Issue #380: Auto-save interval setting bypassed by hardcoded 2-second debounce

**Root cause**: `AutoSaveManager.markDirty()` contained a hardcoded `2000ms` debounce that directly called `saveWithGetter()`, completely bypassing the user-configured auto-save interval (1-30 minutes). Every routine interaction triggered saves every ~2 seconds regardless of configuration.

**Fix**: Removed the hardcoded 2-second debounce from `markDirty()`. It now only sets `isDirty = true` and stores the `stateGetter`, letting the configured interval timer handle saves. Removed the `debounceTimer` field and cleanup code from `saveNow()` and `dispose()`.

**Tests added**: 6 regression tests (AUTOSAVE-R001 through AUTOSAVE-R006) verifying: no immediate save on markDirty, interval is respected, rapid marks are batched, data saved within configured interval, no save when not dirty, and no timer creation from markDirty.

**Files changed**:
- `src/core/session/AutoSaveManager.ts`
- `src/core/session/AutoSaveManager.test.ts`

## Issue #391: Snapshot backend initialization failures swallowed while snapshot UI stays enabled

**Root cause**: When `snapshotManager.initialize()` failed, the error was caught and only logged. The snapshot panel and all actions remained fully enabled, causing confusing failures at use time when users tried to create or restore snapshots.

**Fix**: Added `_snapshotBackendAvailable` flag to `AppPersistenceManager`. On init failure: sets flag to false, calls `snapshotPanel.setDisabled()` with a reason, and shows a user-visible warning alert. `createQuickSnapshot()` and `restoreSnapshot()` check the flag and show clear error alerts instead of proceeding. `createAutoCheckpoint()` silently returns early (best-effort). Added `setDisabled(reason)` and `renderDisabledState()` to `SnapshotPanel`.

**Tests added**: 11 tests — 7 in AppPersistenceManager.test.ts (init failure warning, flag states, create/restore/checkpoint guards) and 4 in SnapshotPanel.test.ts (disabled state, rendering, open/close behavior).

**Files changed**:
- `src/AppPersistenceManager.ts`
- `src/AppPersistenceManager.test.ts`
- `src/ui/components/SnapshotPanel.ts`
- `src/ui/components/SnapshotPanel.test.ts`

## Issue #399: Auto-save recovery silently fails if chosen entry disappears before load

**Root cause**: `recoverAutoSave()` only handled the `if (state)` branch when reading an auto-save entry. When `getAutoSave()` returned `null` (entry vanished between listing and loading), nothing happened — no alert, no retry. By contrast, snapshot restore already showed a "Snapshot not found" error for the same condition.

**Fix**: Added an `else` branch in `recoverAutoSave()` that calls `showAlert()` with "Auto-save entry not found. Recovery data may have been lost." using error type and "Recovery Error" title, following the snapshot restore pattern.

**Tests added**: 3 regression tests (APM-100 through APM-102) verifying: normal recovery works, missing entry shows error alert, error message is user-friendly.

**Files changed**:
- `src/AppPersistenceManager.ts`
- `src/AppPersistenceManager.test.ts`

## Issue #548: Network Sync copy-link button stuck in "Copying..." state

**Root cause**: When the copy-link button was clicked, `NetworkControl` changed to "Copying..." state. The clipboard operation in `AppNetworkBridge` performed the copy but never reported success/failure back to the control, leaving the button stuck.

**Fix**: Added `reportCopyResult(success, errorMessage?)` method to `NetworkControl` that resets button state on success (with brief "Copied!" feedback) or shows error on failure. Updated `AppNetworkBridge` clipboard operations to call `reportCopyResult(true)` on success and `reportCopyResult(false, message)` on failure.

**Tests added**: ~10 tests across AppNetworkBridge.test.ts and NetworkControl.test.ts verifying: successful copy resets state, failed copy resets and shows error, button never stays stuck.

**Files changed**:
- `src/AppNetworkBridge.ts`
- `src/AppNetworkBridge.test.ts`
- `src/ui/components/NetworkControl.ts`
- `src/ui/components/NetworkControl.test.ts`

## Issue #261: Mu compat fullscreen helpers do not track the Safari/WebKit fullscreen path that the main app supports

**Root cause**: `MuCommands.fullScreenMode()` and `MuUtilsBridge.fullScreenMode()` only used the standard `requestFullscreen`/`exitFullscreen` APIs without WebKit-prefixed fallbacks. `isFullScreen()` only checked `document.fullscreenElement`. The main app's `FullscreenManager` already handled `webkitRequestFullscreen`, `webkitExitFullscreen`, and `webkitFullscreenElement`. Additionally, `MuCommands.fullScreenMode()` did not catch rejected fullscreen promises.

**Fix**:
- Added WebKit-prefixed fallback paths (`webkitRequestFullscreen`, `webkitExitFullscreen`) to both `MuCommands.fullScreenMode()` and `MuUtilsBridge.fullScreenMode()`
- Updated `isFullScreen()` in both classes to check `document.webkitFullscreenElement` via nullish coalescing
- Wrapped all fullscreen calls in proper error handling (try/catch in MuCommands, Promise.resolve().catch() in MuUtilsBridge)

**Tests added**: 11 new regression tests across both test files covering WebKit enter/exit fullscreen, WebKit isFullScreen state detection, standard-over-WebKit preference, and rejection handling for both standard and WebKit APIs.

**Files changed**:
- `src/compat/MuCommands.ts`
- `src/compat/MuUtilsBridge.ts`
- `src/compat/__tests__/MuCommands.test.ts`
- `src/compat/__tests__/MuUtilsBridge.test.ts`

## Issue #251: Mu compat `metaEvaluateClosestByType()` chooses DFS match instead of closest match in branched graphs

**Root cause**: `_traverseEvalChainUntilType()` used a depth-first recursive walk over `node.inputs`, returning as soon as any branch found the target type. In branched graphs this meant the result depended on input iteration order, not on which matching node was topologically closest to the start node.

**Fix**: Replaced the DFS traversal with a BFS (breadth-first search) implementation that explores nodes level by level. The BFS uses a visited set and a parent-pointer map to find the truly closest match, then reconstructs the path from start to the matched node. When no match is found, falls back to collecting all reachable nodes (preserving existing behavior).

**Tests added**: Regression test for branched graph verifying that the near-branch target (depth 1) is returned instead of the deep-branch target (depth 3). Additional test for correct path reconstruction from start to target across a multi-node chain.

**Files changed**:
- `src/compat/MuEvalBridge.ts`
- `src/compat/__tests__/MuEvalBridge.test.ts`

## Issue #265: Mu compat `eventToImageSpace()` ignores its `useLocalCoords` flag

**Root cause**: The method parameter was named `_useLocalCoords` (underscore prefix) and the implementation never branched on it, following the same code path regardless of the flag value. Callers passing `true` still received global/default coordinate behavior.

**Fix**: Renamed the parameter to `useLocalCoords` and added conditional logic: when `false` (default), the method returns the raw screen-space event coordinates directly; when `true`, it looks up the named image in the rendered-images list and converts screen coordinates to image-local pixel coordinates via `_screenToImage()`, falling back to `_screenToImageCoords()` if the image is not found.

**Tests added**: 7 regression tests covering screen-center-to-image-center conversion, top-left corner mapping, scaled-view handling, fallback for unknown images, `useLocalCoords=false` returning screen coordinates, `useLocalCoords=true` returning image-local coordinates, and default (no flag) matching `false` behavior.

**Files changed**:
- `src/compat/MuEvalBridge.ts`
- `src/compat/__tests__/MuEvalBridge.test.ts`

## Issue #270: Mu compat `nodeConnections(..., traverseGroups)` ignores the `traverseGroups` flag

**Root cause**: The method parameter was named `_traverseGroups` (underscore prefix) and the implementation never branched on it, always returning the direct `node.inputs` and `node.outputs` lists regardless of the caller's traversal request.

**Fix**: Renamed the parameter to `traverseGroups` and added conditional logic: when `false` (default), returns direct connections as before; when `true`, passes connection names through `_resolveGroups()`, which recursively replaces group nodes with their non-group leaf members via `_collectLeafNodes()`. Each top-level name gets its own visited set to correctly handle duplicates that appear both directly and via a group.

**Tests added**: 7 regression tests covering `traverseGroups=false` preserving group nodes, `traverseGroups=true` replacing groups with leaf members, identity behavior when no groups exist, duplicate leaf preservation (direct + via group), nested group resolution, group resolution in the outputs list, and empty group pass-through as leaf.

**Files changed**:
- `src/compat/MuNodeBridge.ts`
- `src/compat/__tests__/MuNodeBridge.test.ts`

## Issue #259: Mu compat event-table BBox `tag` is accepted and stored but never participates in dispatch

**Root cause**: `dispatchEvent(...)` in `ModeManager.ts` only checked the numeric bounding-box rectangle for pointer events but never read or compared `bbox.tag`, so the `tag` parameter passed to `setEventTableBBox()` had no effect on event filtering.

**Fix**: Added tag-scoped hit-testing logic inside the BBox constraint check in `dispatchEvent()`: after the rectangle test passes, if the bbox has a non-empty `tag`, the event must carry a matching `tag` or dispatch is skipped. Also added an optional `tag` field to the `MuEvent` interface in `types.ts`.

**Tests added**: 4 regression tests in `MuEventBridge.test.ts` covering: BBox tag matches event tag (fires), BBox tag mismatches event tag (blocks), no-tag BBox matches any event (backward compat), and no-tag event does not match tagged BBox (blocks).

**Files changed**:
- `src/compat/ModeManager.ts`
- `src/compat/types.ts`
- `src/compat/__tests__/MuEventBridge.test.ts`

## Issue #271: Mu compat `imagesAtPixel()` ignores its `useStencil` flag
**Root cause**: The `useStencil` parameter was prefixed with an underscore (`_useStencil`) and never branched on. The method always performed geometry-only hit testing regardless of the flag value, making stencil-accurate hit testing a silent no-op.

**Fix**: Renamed `_useStencil` to `useStencil` and added stencil-based alpha testing. When `useStencil` is true and a `PixelReadbackProvider` is available, `imagesAtPixel()` reads the source pixel alpha at the hit coordinate and skips fully transparent images (alpha <= 0). Falls back to geometry-only when no provider is set or the provider returns null.

**Tests added**: 9 tests in `MuEvalBridge.test.ts` covering: geometry-only default, explicit false, opaque pixel inclusion, transparent pixel exclusion, fallback when no provider, fallback when provider returns null, per-image independent filtering, correct image-local coordinate forwarding, alpha just above zero, point outside geometry, and useStencil=false ignoring provider.

**Files changed**:
- `src/compat/MuEvalBridge.ts`
- `src/compat/__tests__/MuEvalBridge.test.ts`

## Issue #272: Mu compat `eventToCameraSpace()` ignores the supplied view-node argument
**Root cause**: The `viewNodeName` parameter was prefixed with an underscore (`_viewNodeName`) and the implementation computed camera coordinates solely from the global `_viewTransform`, ignoring any per-node transform even when one was registered.

**Fix**: Renamed `_viewNodeName` to `viewNodeName` and added per-node transform lookup via `_viewNodeTransforms` map. When `viewNodeName` is non-empty and a matching transform exists, that transform is used; otherwise falls back to the global view transform. Also added `setViewNodeTransform()`, `clearViewNodeTransform()`, and `getViewNodeTransform()` methods to manage per-node transforms.

**Tests added**: 7 tests in `MuEvalBridge.test.ts` covering: global transform for empty name, per-node transform when name matches, fallback to global for unknown name, multiple independent view nodes, clearViewNodeTransform causing fallback, and integration with resetState clearing all node transforms.

**Files changed**:
- `src/compat/MuEvalBridge.ts`
- `src/compat/__tests__/MuEvalBridge.test.ts`

## Issue #338: Doc says F for fullscreen, real is F11

**Root cause**: The review workflow doc (`docs/advanced/review-workflow.md`) told users to press `F` for fullscreen, but the shipped fullscreen binding is `F11` (matching the header tooltip and keyboard-shortcuts reference).

**Fix**: Updated the review workflow doc to say `F11` instead of `F`.

**Tests added**: None (documentation-only change).

**Files changed**:
- `docs/advanced/review-workflow.md`

## Issue #367: FAQ says L for loop, real is Ctrl+L

**Root cause**: The FAQ (`docs/reference/faq.md`) and quick-start guide (`docs/getting-started/quick-start.md`) told users to press plain `L` to cycle loop modes, but the real binding is `Ctrl+L`.

**Fix**: Updated the FAQ and quick-start guide to use `Ctrl+L`.

**Tests added**: None (documentation-only change).

**Files changed**:
- `docs/reference/faq.md`
- `docs/getting-started/quick-start.md`

## Issue #400: Selecting .rvedl with media files ignores the media

**Root cause**: Both the header file-picker and the viewer drag-and-drop paths checked for `.rvedl` first and returned immediately after loading just the EDL, discarding any accompanying media files the user had also selected.

**Fix**: Removed the early return after EDL loading in both `HeaderBar.ts` and `ViewerInputHandler.ts`. After loading the EDL, remaining non-EDL files are now filtered out of the array and passed through to the normal media-loading path. The success alert dynamically indicates whether accompanying media files will also be loaded.

**Tests added**: None (behavioral fix in UI wiring; EDL + media co-selection now falls through to normal file loading).

**Files changed**:
- `src/ui/components/layout/HeaderBar.ts`
- `src/ui/components/ViewerInputHandler.ts`

## Issue #406: Restored playlist playhead position ignored

**Root cause**: In `PlaylistManager.setState()`, enabling playlist mode (`setEnabled`) was called before `currentFrame` was assigned. The production `enabledChanged` handler in `AppPlaybackWiring.ts` then synced the runtime to a frame derived from the current session state instead of the saved playlist position.

**Fix**: Reordered `setState()` so that `currentFrame` is restored before `setEnabled()` is called, ensuring the `enabledChanged` handler sees the correct saved playhead position.

**Tests added**: 1 regression test in `PlaylistManager.test.ts` verifying that `currentFrame` is set before the `enabledChanged` event fires during `setState()`.

**Files changed**:
- `src/core/session/PlaylistManager.ts`
- `src/core/session/PlaylistManager.test.ts`

## Issue #408: Restored playlist transitions don't trigger redraw

**Root cause**: `TransitionManager.setState()` replaced internal state silently without emitting any event. The playlist panel and timeline only redraw from `transitionChanged` or `transitionsReset` events, so restored transitions were invisible until an unrelated action forced a repaint.

**Fix**: Added `this.emit('transitionsReset', undefined)` at the end of `TransitionManager.setState()`.

**Tests added**: 2 tests in `TransitionManager.test.ts` verifying that `setState()` emits `transitionsReset` for both populated and empty transition arrays.

**Files changed**:
- `src/core/session/TransitionManager.ts`
- `src/core/session/TransitionManager.test.ts`

## Issue #412: Auto-save labels use source name not session name

**Root cause**: Auto-save, snapshot, and checkpoint labels were derived from `session.currentSource?.name` instead of the session's display name, so recovery entries were labeled by whichever source happened to be active.

**Fix**: Introduced a private `getSessionLabel()` method in `AppPersistenceManager` that prefers `session.metadata?.displayName`, falls back to `session.currentSource?.name`, then to `'Untitled'`. All save-label call sites now use this method.

**Tests added**: Dedicated test file `AppPersistenceManager.issue412.test.ts` verifying that auto-save, snapshot, and checkpoint labels reflect the session display name when set.

**Files changed**:
- `src/AppPersistenceManager.ts`
- `src/AppPersistenceManager.issue412.test.ts`

## Issue #413: RV/GTO export filenames use source name not session name

**Root cause**: `saveRvSession()` used `session.currentSource?.name` as the export filename base, ignoring the user-visible session display name even though the GTO exporter itself wrote `metadata.displayName` into the file.

**Fix**: Changed `saveRvSession()` to use the shared `getSessionLabel()` method, so the exported filename matches the session identity.

**Tests added**: Dedicated test file `AppPersistenceManager.issue413.test.ts` verifying that RV/GTO export filenames use the session display name.

**Files changed**:
- `src/AppPersistenceManager.ts`
- `src/AppPersistenceManager.issue413.test.ts`

## Issue #414: RV/GTO companion-file resolution silently collapses duplicate basenames

**Root cause**: `openProject()` built `availableFiles` as a `Map<string, File>` keyed by `f.name`, so when two companion files shared the same basename (common in production packages with per-shot directories), the later entry silently overwrote the earlier one. The `resolveAvailableFile()` helper then had no way to distinguish them.

**Fix**: Changed the map type to `Map<string, File[]>`, grouping all files that share a basename. Updated `resolveAvailableFile()` to pick the best match by longest path-suffix overlap with the original GTO reference path, and to emit a `console.warn` when multiple candidates exist. Updated all call sites in `HeaderBar.ts`, `ViewerInputHandler.ts`, and `GTOGraphLoader.ts`.

**Tests added**: 8 tests in `GTOGraphLoader.test.ts` under the `resolveAvailableFile` describe block, covering single match, missing basename, empty map, multiple distinct basenames, duplicate basename with path-suffix disambiguation, warning emission, single-candidate no-warning, and Windows-style path handling.

**Files changed**:
- `src/core/session/GTOGraphLoader.ts`
- `src/core/session/GTOGraphLoader.test.ts`
- `src/ui/components/layout/HeaderBar.ts`
- `src/ui/components/ViewerInputHandler.ts`
- `src/AppPersistenceManager.ts`

## Issue #435: Inbound WebSocket `ping` messages never send the `pong` response

**Root cause**: `handleMessage()` in WebSocketClient had a comment saying "responding with pong" but only called `resetHeartbeatTimeout()` without actually sending a pong. `createPongMessage()` existed but was never imported/called.

**Fix**: Added import of `createPongMessage`, extracted `sentAt` from ping payload, created and sent pong message before resetting heartbeat timeout.

**Tests added**: 5 new regression tests (WSC-060 through WSC-064) covering pong response, sentAt preservation, missing sentAt handling, non-propagation, and timeout reset.

**Files changed**:
- `src/network/WebSocketClient.ts`
- `src/network/WebSocketClient.test.ts`

## Issue #437: Auto-save failure alert points to nonexistent `File > Save Project` path

**Root cause**: The auto-save init failure catch block logged to console but showed no user-facing alert. The error message referenced a nonexistent menu path.

**Fix**: Added `showAlert()` call with correct guidance referencing the toolbar Save button.

**Tests added**: 5 new tests (ISS-437-001 through ISS-437-005) in AppPersistenceManager.issue437.test.ts.

**Files changed**:
- `src/AppPersistenceManager.ts`
- `src/AppPersistenceManager.issue437.test.ts`

## Issue #438: DCC `loadMedia` misroutes signed or query-string video URLs through the image path

**Root cause**: Extension extraction used `path.split('.').pop()` which doesn't strip URL query strings or fragments. `shot.mov?token=abc` yields extension `mov?token=abc` which fails VIDEO_EXTENSIONS check.

**Fix**: Strip query strings and fragments before extension extraction; preserve full URL for actual loading.

**Tests added**: 4 new tests (DCCFIX-055 through DCCFIX-058) in AppWiringFixes.test.ts.

**Files changed**:
- `src/AppDCCWiring.ts`
- `src/AppWiringFixes.test.ts`

## Issue #442: DCC bridge heartbeat timeout dead + unsolicited pong

**Root cause**: Heartbeat timer sent `pong` instead of `ping`. No timeout mechanism existed to detect dead connections.

**Fix**: Changed keepalive to send `ping`. Added inbound `pong` handling. Added heartbeat timeout that fires when no response received, emitting error and closing WebSocket.

**Tests added**: 6 new tests (DCC-HB-001 through DCC-HB-006).

**Files changed**:
- `src/integrations/DCCBridge.ts`
- `src/integrations/DCCBridge.test.ts`

## Issue #489: Zebra controls hard-stop at 100 IRE for HDR

**Root cause**: Threshold setters used `Math.min(100, value)` and slider max was hardcoded to 100. HDR content needs values up to 10000 IRE.

**Fix**: Added `MAX_ZEBRA_THRESHOLD_IRE = 10000` constant. Updated clamping and slider max. Added step=1 for usable granularity.

**Tests added**: Updated existing tests + 5 new HDR-specific tests (ZEB-U045/U046, ZEBRA-U055/U056/U057).

**Files changed**:
- `src/core/types/effects.ts`
- `src/ui/components/ZebraStripes.ts`
- `src/ui/components/ZebraStripes.test.ts`
- `src/ui/components/ZebraControl.ts`
- `src/ui/components/ZebraControl.test.ts`

## Issue #495: HDR pixel probe clamps IRE to 0-100 range

**Root cause**: `updateFromHDRValues` used `clamp(luminanceFloat * 100, 0, 100)` which capped IRE at 100, but HDR content can exceed 100 IRE.

**Fix**: Changed to `Math.max(luminanceFloat * 100, 0)` removing upper clamp while keeping lower bound at 0.

**Tests added**: 5 new tests (HDR-IRE-001 through HDR-IRE-005).

**Files changed**:
- `src/ui/components/PixelProbe.ts`
- `src/ui/components/PixelProbe.test.ts`

## Issue #496: Pixel probe reports display-canvas coordinates instead of source image space

**Root cause**: Both `updateFromCanvas` and `updateFromHDRValues` stored display-canvas coordinates directly as displayed X/Y without transforming to source image space.

**Fix**: Added `displayToSourceCoordinates()` utility. Updated both methods to accept optional source dimensions and convert reported coordinates. Pixel sampling still uses display coordinates.

**Tests added**: 10 tests for displayToSourceCoordinates (DSC-001 through DSC-010), 9 tests for PixelProbe integration (COORD-001 through COORD-009).

**Files changed**:
- `src/ui/components/ViewerInteraction.ts`
- `src/ui/components/ViewerInteraction.test.ts`
- `src/ui/components/PixelProbe.ts`
- `src/ui/components/PixelProbe.test.ts`
- `src/ui/components/PixelSamplingManager.ts`
- `src/ui/components/PixelSamplingManager.test.ts`
- `src/ui/components/Viewer.ts`

## Issue #512: File classification omits JPEG 2000 / HTJ2K extensions

**Root cause**: `SUPPORTED_IMAGE_EXTENSIONS` was missing `jp2`, `j2k`, `j2c`, `jph`, `jhc` even though the decoder stack handles them.

**Fix**: Added all five extensions to the supported extensions array.

**Tests added**: Extended existing test + 6 new JPEG 2000-specific regression tests.

**Files changed**:
- `src/utils/media/SupportedMediaFormats.ts`
- `src/utils/media/SupportedMediaFormats.test.ts`

## Issue #513: File classification omits `.mxf` extension

**Root cause**: `MEDIABUNNY_VIDEO_EXTENSIONS` was missing `mxf`, causing MXF files to be classified as unknown/rejected.

**Fix**: Added `mxf` to the video extensions array.

**Tests added**: Extended existing test + 3 MXF-specific regression tests.

**Files changed**:
- `src/utils/media/SupportedMediaFormats.ts`
- `src/utils/media/SupportedMediaFormats.test.ts`

## Issue #555: `isSupported()` returns `'stub'` outside type contract

**Root cause**: `SUPPORT_MAP` included `'stub'` values for `setViewSize`, `setMargins`, `margins`, but the documented type contract only allows `true`, `false`, or `'partial'`.

**Fix**: Changed `'stub'` to `'partial'` (semantically correct since these commands exist but provide local-only behavior). Removed `'stub'` from types.

**Tests added**: 2 new regression tests verifying no command returns `'stub'`.

**Files changed**:
- `src/compat/MuCommands.ts`
- `src/compat/__tests__/MuCommands.test.ts`

## Issue #339: The session-management guide gives the snapshot panel the history panel's shortcut

**Root cause**: The session-management guide (`docs/advanced/session-management.md`) documented `Shift+Alt+H` as the Snapshot Panel shortcut, but that key combo is actually mapped to `panel.history`. The real Snapshot Panel shortcut is `Ctrl+Shift+Alt+S` as defined in `KeyBindings.ts`.

**Fix**: Updated `docs/advanced/session-management.md` to use the correct shortcut `Ctrl+Shift+Alt+S` for the Snapshot Panel. Verified all other doc files already had the correct shortcuts.

**Tests added**: 3 new regression tests in `KeyBindings.test.ts`:
- KB-U104: Asserts `panel.snapshots` shortcut is `Ctrl+Shift+Alt+S`
- KB-U105: Asserts `panel.history` shortcut is `Shift+Alt+H`
- KB-U106: Asserts the two panel shortcuts are different from each other

**Files changed**:
- `docs/advanced/session-management.md`
- `src/utils/input/KeyBindings.test.ts`

## Issue #343: The stereo documentation disagrees with itself and with the shipped mode list

**Root cause**: The practical stereo guide (`docs/advanced/stereo-3d.md`) claimed 7 active modes + Off (8 total), omitting `left-only` and `right-only`. The technical guide (`docs/guides/stereo-3d-viewing.md`) correctly stated 10 modes. The runtime has exactly 10 `StereoMode` values including `off`.

**Fix**: Updated `docs/advanced/stereo-3d.md` to consistently reference 10 total modes (9 active + Off). Added `Left Only` and `Right Only` to the mode descriptions, keyboard cycle list, and comparison table.

**Tests added**: 5 new regression tests in `StereoControl.test.ts`:
- STEREO-REG001: Verifies exactly 10 stereo modes via cycle traversal
- STEREO-REG002: Verifies `left-only` and `right-only` are valid active modes
- STEREO-REG003: Verifies offset slider HTML attributes (min=-20, max=20, step=0.5)
- STEREO-REG004: Verifies `setOffset` clamps to -20..+20
- STEREO-REG005: Verifies dropdown contains exactly 10 mode options in correct order

**Files changed**:
- `docs/advanced/stereo-3d.md`
- `docs/guides/stereo-3d-viewing.md`
- `src/ui/components/StereoControl.test.ts`

## Issue #344: The stereo guides publish the wrong convergence-offset range for the shipped UI

**Root cause**: `docs/guides/stereo-3d-viewing.md` documented the convergence offset range as `-50 to +50`, but the shipped `StereoControl.ts` slider is clamped to `-20` through `20` with `0.5` steps.

**Fix**: Updated the convergence offset range in `docs/guides/stereo-3d-viewing.md` to `-20 to +20 with a step size of 0.5`.

**Tests added**: Covered by STEREO-REG003 and STEREO-REG004 above.

**Files changed**:
- `docs/guides/stereo-3d-viewing.md`
- `src/ui/components/StereoControl.test.ts`

## Issue #455: The installation guide still says Node 18+ is enough, but the current toolchain declares Node 20.19+ or 22.12+

**Root cause**: The installation guide (`docs/getting-started/installation.md`) listed "Node.js 18 or later" as a prerequisite, but `package.json` `engines.node` was updated to `^20.19.0 || >=22.12.0` when the toolchain (Vite 7, Vitest 4) was upgraded.

**Fix**: Updated `docs/getting-started/installation.md` to state "Node.js 20.19+ or 22.12+" matching the actual `package.json` engines constraint.

**Tests added**: 1 new regression test in `tests/docs.consistency.test.ts` that reads `engines.node` from `package.json`, extracts version numbers, and verifies the installation doc mentions them while not mentioning outdated versions (14, 16, 18).

**Files changed**:
- `docs/getting-started/installation.md`
- `tests/docs.consistency.test.ts`

## Issue #450: The FAQ still says URL-based loading is not implemented, but production already loads media from `sourceUrl` share links

**Root cause**: The FAQ answer to "Can I load files from a URL?" stated "URL-based loading is not currently implemented", but `SessionURLService` already serializes `sourceUrl` into shared state and `session.loadSourceFromUrl()` works in share-link/bootstrap flows.

**Fix**: Updated the FAQ answer in `docs/reference/faq.md` to accurately describe the current `sourceUrl` share-link loading capability, noting there's no standalone "paste a URL" UI yet.

**Tests added**: 1 regression test in `tests/docs.consistency.test.ts` asserting the FAQ doesn't claim URL loading is unimplemented.

**Files changed**:
- `docs/reference/faq.md`
- `tests/docs.consistency.test.ts`

## Issue #451: The FAQ describes collaboration as peer-to-peer WebRTC, but the normal room lifecycle is WebSocket-based

**Root cause**: The FAQ described collaboration as using "peer-to-peer WebRTC connections" in multiple places, but the actual primary transport is WebSocket (via `WebSocketClient`) for room create/join and sync. WebRTC is an optional additional channel.

**Fix**: Updated three sections in `docs/reference/faq.md` to accurately describe WebSocket as the primary collaboration transport with WebRTC as an optional peer-to-peer channel.

**Tests added**: 1 regression test in `tests/docs.consistency.test.ts` verifying the FAQ mentions WebSocket and doesn't describe collaboration as purely WebRTC.

**Files changed**:
- `docs/reference/faq.md`
- `tests/docs.consistency.test.ts`

## Issue #320: Dailies reports flatten notes to raw text and lose per-note frame/timecode context

**Root cause**: `buildReportRows()` in `ReportExporter.ts` only extracted `n.text` from notes, discarding frame ranges, authors, statuses, and timecodes. CSV and HTML exports serialized notes as flat text strings with no per-note context.

**Fix**: 
- Added `StructuredNote` interface carrying `text`, `author`, `status`, `frameStart`, `frameEnd`, `timecodeStart`, `timecodeEnd`
- Extended `ReportRow` with `structuredNotes: StructuredNote[]` alongside existing `notes: string[]` (backward-compatible)
- Updated `buildReportRows()` to populate structured notes with frame/timecode/author context
- Updated CSV export to render `[TC_START-TC_END] author: text` format
- Updated HTML export with styled timecode spans and bold authors

**Tests added**: 17 new tests in `ReportExporter.test.ts` covering structured notes with frames, without frames, multiple notes, author info, CSV/HTML output formatting, and XSS escaping.

**Files changed**:
- `src/export/ReportExporter.ts`
- `src/export/ReportExporter.test.ts`

## Issue #366: The annotation-export docs say the export items appear only when annotations exist, but the shipped menu shows them all the time

**Root cause**: `ExportControl` built annotation export menu items (`Export Annotations (JSON)`, `Export Annotations (PDF)`) unconditionally with no visibility guard based on annotation count.

**Fix**:
- Added `annotationSectionElements` tracking for annotation section DOM elements
- Added `setAnnotationCount(count)` public method and `annotationCount` getter
- Added `updateAnnotationSectionVisibility()` that shows/hides annotation section based on count > 0
- Updated `docs/annotations/export.md` to describe the correct conditional behavior

**Tests added**: 9 new tests in `ExportControl.test.ts` (EXPORT-ANN01 through EXPORT-ANN09) covering hidden/visible states, transitions, header visibility, and edge cases.

**Files changed**:
- `src/ui/components/ExportControl.ts`
- `src/ui/components/ExportControl.test.ts`
- `docs/annotations/export.md`

## Issue #488: The false-color docs say ARRI skin tones appear green, but the shipped ARRI palette maps that range to grey/yellow instead

**Root cause**: The ARRI false color palette in `FalseColor.ts` incorrectly mapped the 40-50 IRE range (skin tones) to grey instead of green. The ARRI false color standard universally maps skin tones to green.

**Fix**: Restructured the ARRI palette entries:
- 78-89 (~30-35 IRE): teal-green "Low-mid"
- 90-128 (~35-50 IRE): green "Skin tones" — now correctly covers the skin tone range
- 129-153 (50-60 IRE): pink "High-mid" — matches ARRI's pink for upper midtones
- 154-179 (60-70 IRE): yellow "Bright" — yellow moved to highlights where it belongs

**Tests added**: 7 new tests in `FalseColor.test.ts` (FC-110 through FC-116) verifying skin tone IRE range maps to green, legend includes "Skin tones" label, LUT consistency across the range, and non-ARRI palettes unaffected.

**Files changed**:
- `src/ui/components/FalseColor.ts`
- `src/ui/components/FalseColor.test.ts`

## Issue #551: Public `viewTransformChanged` always reports `pixelAspect: 1`, even though non-square-pixel workflows exist and compat consumers use that field

**Root cause**: `EventsAPI` hardcoded `pixelAspect: 1` in every `viewTransformChanged` payload, ignoring the viewer's actual pixel aspect ratio state.

**Fix**:
- Extended `ViewerProvider.getSourceDimensions()` return type in `src/api/types.ts` to include optional `pixelAspect`
- Updated `Viewer.getSourceDimensions()` to return `pixelAspect: this.parState.par`
- Replaced hardcoded `pixelAspect: 1` in `EventsAPI.ts` with `pixelAspect: source.pixelAspect ?? 1`

**Tests added**: 3 new tests in `OpenRVAPI.test.ts`:
- API-U064d: Square pixels (1.0) emits correctly
- API-U064e: Anamorphic source (2.0) emits correct value
- API-U064f: Missing pixelAspect defaults to 1

**Files changed**:
- `src/api/EventsAPI.ts`
- `src/api/types.ts`
- `src/ui/components/Viewer.ts`
- `src/api/OpenRVAPI.test.ts`

## Issue #471: The UI overview advertises snapshots as named captures, but the shipped create flow does not prompt for a snapshot name

**Root cause**: The `SnapshotPanel` had no create button with a naming flow — `createRequested` event carried no name payload. Users couldn't name snapshots during creation.

**Fix**:
- Added "Create Snapshot" button and inline name input row to `SnapshotPanel`
- Input appears when button is clicked, with placeholder "Snapshot name (optional)"
- Enter/Save creates with entered name; Escape creates with auto-generated name
- Auto-generated names use "Snapshot N" pattern with incrementing counter
- Updated `createRequested` event to carry `{ name: string }`
- Updated `AppPlaybackWiring` and `AppPersistenceManager` to pass name through to `createQuickSnapshot()`

**Tests added**: 8 new tests in `SnapshotPanel.test.ts` (SNAP-090 through SNAP-097) covering inline input flow, custom names, auto-generated names, Enter/Escape/Save key handling, name display, and counter incrementing.

**Files changed**:
- `src/ui/components/SnapshotPanel.ts`
- `src/ui/components/SnapshotPanel.test.ts`
- `src/AppPlaybackWiring.ts`
- `src/AppPlaybackWiring.test.ts`
- `src/AppPersistenceManager.ts`
- `src/services/KeyboardActionMap.ts`

## Issue #331: The shipped note UI cannot create or edit frame-range notes even though the note system supports them

**Root cause**: `NotePanel.addNoteAtCurrentFrame()` always created notes with `frameStart === frameEnd === currentFrame`. `NoteManager.updateNote()` only accepted `text`, `status`, and `color` updates — frame range fields were not updatable.

**Fix**:
- Extended `NoteManager.updateNote()` to accept `frameStart` and `frameEnd` in the updates parameter
- Added frame range input fields (start/end) to the NotePanel's note editing UI
- When editing a note, frame range inputs are pre-populated with the note's current values
- When creating a note, frame range defaults to current frame (preserving backward compat) but can be modified

**Tests added**: 9 new tests — 4 in `NoteManager.test.ts` (updateNote with frameStart/frameEnd) and 5 in `NotePanel.test.ts` (frame range UI rendering, editing, creation).

**Files changed**:
- `src/core/session/NoteManager.ts`
- `src/core/session/NoteManager.test.ts`
- `src/ui/components/NotePanel.ts`
- `src/ui/components/NotePanel.test.ts`
- `docs/advanced/review-workflow.md`

## Issue #328: The shipped note workflow only exports JSON, despite the UI/docs presenting HTML and CSV note exports

**Root cause**: `NotePanel` had a single "Export" button hardcoded to JSON serialization. The review-workflow docs promised HTML, CSV, and JSON export formats.

**Fix**:
- Replaced the single Export button with a dropdown menu offering JSON, CSV, and HTML export options
- Added `notesToCSV()` method with proper RFC 4180 escaping (commas, quotes, newlines)
- Added `notesToHTML()` method producing a styled HTML table with XSS-safe content escaping
- Updated review-workflow docs to describe the export dropdown and each format

**Tests added**: 8 new tests covering dropdown menu rendering, CSV format/escaping, HTML format/escaping, empty notes, and backward compatibility.

**Files changed**:
- `src/ui/components/NotePanel.ts`
- `src/ui/components/NotePanel.test.ts`
- `docs/advanced/review-workflow.md`

## Issue #360: The crash-recovery docs say the UI offers restore on `recoveryAvailable`, but production never consumes that event

**Root cause**: `AutoSaveManager` emitted `recoveryAvailable` during startup recovery detection, but `AppPersistenceManager.initAutoSave()` never subscribed to it. Instead it used a separate `listAutoSaves()` call that was disconnected from the event flow.

**Fix**:
- Wired `recoveryAvailable` event subscription in `AppPersistenceManager.initAutoSave()` before calling `initialize()`
- The event handler captures auto-save entries and shows the recovery prompt to the user
- When accepted, restores from the most recent auto-save entry
- When declined, clears all auto-save data

**Tests added**: 6 new regression tests in `AppPersistenceManager.issue360.test.ts` covering event subscription ordering, prompt display, restore flow, dismiss flow, no-data case, and most-recent-entry selection.

**Files changed**:
- `src/AppPersistenceManager.ts`
- `src/AppPersistenceManager.test.ts`
- `src/AppPersistenceManager.issue360.test.ts`

## Issue #301: RV/GTO import diagnostics for skipped nodes and degraded modes are emitted internally but never surfaced to users

**Root cause**: `SessionGraph` emitted `skippedNodes` and `degradedModes` events during RV/GTO import, but `persistenceHandlers.ts` never subscribed to them. Users received no UI indication of lossy imports.

**Fix**:
- Added `skippedNodes` and `degradedModes` event subscriptions in `bindPersistenceHandlers()`
- Uses existing `formatSkippedNodesWarning()` and `formatDegradedModesWarning()` from `GTOGraphLoader.ts` to format messages
- Shows warning alerts via `showAlert()` (filters out `unmapped_protocol` nodes which are expected)

**Tests added**: 4 new tests covering skipped nodes notification, degraded modes notification, filtered unmapped_protocol nodes, and clean import (no warnings).

**Files changed**:
- `src/handlers/persistenceHandlers.ts`
- `src/handlers/persistenceHandlers.test.ts`

## Issue #347: The channel-isolation docs still advertise `Shift+L` as the normal luminance shortcut even though production routes that combo to the LUT panel

**Root cause**: `Shift+L` was assigned to both `channel.luminance` and `lut.togglePanel`, creating a conflict. `AppKeyboardHandler` treated both as contextual defaults, so neither was registered normally.

**Fix**:
- Removed `channel.luminance` from default key bindings entirely (redundant with `channel.grayscale` at `Shift+Y`)
- `Shift+L` now exclusively owned by `lut.togglePanel`, registered without context restriction
- Simplified `channel.luminance` handler and added explicit `lut.togglePanel` handler
- Removed contextual keyboard manager registrations for the Shift+L conflict from `App.ts`

**Tests added/updated**: Updated tests in `AppKeyboardHandler.test.ts` and `KeyboardActionMap.test.ts` to verify conflict resolution. Updated E2E tests to use `Shift+Y`.

**Files changed**:
- `src/utils/input/KeyBindings.ts`
- `src/AppKeyboardHandler.ts`
- `src/services/KeyboardActionMap.ts`
- `src/App.ts`
- `src/AppKeyboardHandler.test.ts`
- `src/services/KeyboardActionMap.test.ts`
- `docs/playback/channel-isolation.md`
- `docs/reference/keyboard-shortcuts.md`
- `features/channel-isolation.md`
- `features/keyboard-shortcuts.md`
- `e2e/grayscale.spec.ts`
- `e2e/channel-select.spec.ts`
- `e2e/screenshots/features.screenshot.ts`

## Issue #349: The published shortcut reference assigns several key combos to different actions in the same table

**Root cause**: The shortcut reference doc listed `Shift+B`, `Shift+R`, and `Shift+N` for channel actions even though those combos are owned by background cycling, rotate-left, and network sync respectively. The channel actions are suppressed by `AppKeyboardHandler.CONTEXTUAL_DEFAULTS`.

**Fix**:
- Removed the three conflicting channel shortcuts from the Channel View table in the shortcut reference
- Added an explanatory note directing users to the Shortcut Editor for reassignment

**Tests added**: 3 new tests in `KeyBindings.test.ts` verifying no duplicate assignments within doc sections, suppressed shortcuts not listed as active, and no cross-section modifier key collisions.

**Files changed**:
- `docs/reference/keyboard-shortcuts.md`
- `src/utils/input/KeyBindings.test.ts`

## Issue #350: Multiple docs still teach `Shift+R` / `Shift+B` / `Shift+N` channel shortcuts that production reserves for other actions

**Root cause**: Channel-isolation, troubleshooting, EXR-layers, and histogram docs all referenced `Shift+R`, `Shift+B`, and `Shift+N` as working channel shortcuts, but these are reserved by rotate-left, background-pattern cycling, and network sync.

**Fix**:
- Updated `channel-isolation.md`: replaced dead shortcuts with "toolbar or custom binding", added warning block
- Updated `troubleshooting.md`: replaced `Shift+N` with Channel Select dropdown reference
- Updated `exr-layers.md`: replaced `Shift+R`/`Shift+B` with `Shift+G` and Channel Select dropdown
- Updated `histogram.md`: replaced `Shift+R` with `Shift+G` and Channel Select dropdown

**Tests added**: 1 new test in `docs.consistency.test.ts` scanning the four doc files for the conflicting shortcuts.

**Files changed**:
- `docs/playback/channel-isolation.md`
- `docs/reference/troubleshooting.md`
- `docs/playback/exr-layers.md`
- `docs/scopes/histogram.md`
- `tests/docs.consistency.test.ts`

## Issue #336: The documentation repeatedly sends users to a `View menu` that the shipped app does not actually have

**Root cause**: Multiple docs referenced a "View menu" for accessing presentation mode, playlist, stereo modes, spherical projection, and stereo alignment. The shipped app has no View menu — these features are accessed via the View tab toolbar or header buttons.

**Fix**:
- `review-workflow.md`: "View menu" → "Presentation Mode button in the header bar"
- `playlist.md`: removed "selecting it from the View menu"
- `stereo-3d-viewing.md`: "View menu" → "Stereo dropdown in the View tab toolbar"
- `viewer-navigation.md`: "View menu" → "360 View button in the View tab toolbar"
- `stereo-3d.md`: "View menu" → "View tab toolbar"

**Tests added**: 5 new tests in `docs-ui-references.test.ts` verifying each doc file doesn't reference "View menu".

**Files changed**:
- `docs/advanced/review-workflow.md`
- `docs/advanced/playlist.md`
- `docs/guides/stereo-3d-viewing.md`
- `docs/playback/viewer-navigation.md`
- `docs/advanced/stereo-3d.md`
- `src/docs-ui-references.test.ts`

## Issue #337: The documentation also relies on a non-existent `Settings panel` for several real workflows

**Root cause**: Docs referenced a "Settings panel" for shortcut editing, client mode enablement, and ShotGrid API key configuration. No such panel exists in the shipped UI.

**Fix**:
- `keyboard-shortcuts.md`: "Settings panel" → "Help menu in the header bar by clicking Custom Key Bindings"
- `review-workflow.md`: removed "from the Settings panel or" (client mode uses URL parameter)
- `dcc-integration.md`: "OpenRV Web settings panel" → "ShotGrid panel's config section"

**Tests added**: 1 new test in `docs.consistency.test.ts` verifying the three doc files don't reference "Settings panel".

**Files changed**:
- `docs/reference/keyboard-shortcuts.md`
- `docs/advanced/review-workflow.md`
- `docs/advanced/dcc-integration.md`
- `tests/docs.consistency.test.ts`

## Issue #357: The session export docs tell users to save `.orvproject` files from the Export menu, but production only exposes RV/GTO exports there

**Root cause**: `docs/export/sessions.md` said users could save sessions from the Export menu, but the Export dropdown only has RV/GTO options. `.orvproject` save is triggered from the header Save button.

**Fix**:
- Clarified that `.orvproject` save uses the header Save button (or Ctrl+S)
- Clarified that RV/GTO exports use the Export menu's Session section
- Removed false claim that GTO sessions are read-only imports

**Tests added**: 1 new test in `docs.consistency.test.ts` verifying the doc doesn't claim `.orvproject` is in the Export menu.

**Files changed**:
- `docs/export/sessions.md`
- `tests/docs.consistency.test.ts`

## Issue #426: RV/GTO import cannot clear notes, version groups, or shot statuses when the incoming session data is empty

**Root cause**: `GTOGraphLoader` only assigned `sessionInfo.notes` when `notes.length > 0`, `sessionInfo.versionGroups` when `versionGroups.length > 0`, and `sessionInfo.statuses` when `parsedStatuses.length > 0`. This meant importing an RV/GTO session with empty review data could never clear existing data, despite `SessionGraph.loadFromGTO()` commenting that it "always calls, even for empty arrays, to clear old data."

**Fix**: Changed `GTOGraphLoader` to always assign the arrays when the relevant GTO component/section exists, even when empty. When the section does not exist at all, the field remains `undefined` (backward compat). Specifically:
- Notes: Always assign when `notesComp.exists()` is true
- Version groups: Always assign when `versionsComp.exists()` is true
- Statuses: Track `hasSourceGroups` flag and assign when any `RVSourceGroup` exists

**Tests added**: 8 regression tests in `GTOGraphLoader.issue426.test.ts` covering empty arrays, missing sections, and edge cases.

**Files changed**:
- `src/core/session/GTOGraphLoader.ts`
- `src/core/session/GTOGraphLoader.issue426.test.ts` (new)

## Issue #420: RV/GTO import ignores inactive RVColor and RVDisplayColor flags, so disabled grading can still be applied

**Root cause**: `parseColorAdjustments()` in `GTOSettingsParser.ts` read color values from RVColor and RVDisplayColor nodes without checking their `active` flag. `parseOutOfRange()` similarly ignored the flag. The serializer properly wrote `active=0` for disabled nodes, but the parser never honored it, causing disabled grading to be applied on import.

**Fix**: Added `active` flag checks in `parseColorAdjustments()` and `parseOutOfRange()`:
- RVColor with `active=0`: Skip exposure, gamma, contrast, scale, offset, saturation (luminanceLUT still parsed independently)
- RVDisplayColor with `active=0`: Skip brightness/gamma
- `parseOutOfRange()` returns `0` (off) when RVDisplayColor is inactive

**Tests added**: 15 regression tests in `GTOSettingsParser.test.ts` covering all active/inactive combinations.

**Files changed**:
- `src/core/session/GTOSettingsParser.ts`
- `src/core/session/GTOSettingsParser.test.ts`

## Issue #419: RV/GTO import cannot explicitly clear CDL, transform, or lens state when those nodes are present but inactive

**Root cause**: `parseCDL()`, `parseTransform()`, and `parseLens()` all returned `null` when their respective nodes had `active=0`. The restore handler only applied settings when non-null (`if (settings.cdl)`), so stale state from the current session was never cleared on import of a session with explicitly disabled CDL/transform/lens.

**Fix**: When a CDL/transform/lens node EXISTS but is inactive (`active=0`), return default/reset values instead of `null`:
- CDL: `DEFAULT_CDL` (slope=[1,1,1], offset=[0,0,0], power=[1,1,1], saturation=1)
- Transform: `DEFAULT_TRANSFORM` (no flip/flop/rotation)
- Lens: `DEFAULT_LENS_PARAMS` (all coefficients zero)
When the node does not exist at all, `null` is still returned (backward compat).

**Tests added**: 10 regression tests in `GTOSettingsParser.test.ts` covering inactive, missing, and active cases for all three node types.

**Files changed**:
- `src/core/session/GTOSettingsParser.ts`
- `src/core/session/GTOSettingsParser.test.ts`

## Issue #416: RV/GTO settings parsing extracts `linearize`, `outOfRange`, and `channelSwizzle`, but production never applies them

**Root cause**: `parseInitialSettings()` properly parsed `linearize`, `outOfRange`, and `channelSwizzle` from GTO files, but `handleSettingsLoaded()` in `persistenceHandlers.ts` had no branches to apply them. The parsed values were silently dropped.

**Fix**: Added full plumbing from persistence handler to viewer:
- Added `setLinearize`, `setOutOfRange`, `setChannelSwizzle` methods through the render pipeline (StateAccessor → Renderer → ViewerGLRenderer → Viewer)
- Added three restore branches in `handleSettingsLoaded()` for the missing settings
- Updated test mocks to include the new methods

**Tests added**: 5 regression tests in `persistenceHandlers.test.ts` covering linearize, outOfRange modes, channelSwizzle, and backward compatibility.

**Files changed**:
- `src/render/StateAccessor.ts`
- `src/render/Renderer.ts`
- `src/ui/components/ViewerGLRenderer.ts`
- `src/ui/components/Viewer.ts`
- `src/handlers/persistenceHandlers.ts`
- `src/handlers/persistenceHandlers.test.ts`
- `test/mocks.ts`

## Issue #423: RV/GTO import cannot clear markers when the file carries an empty marks array

**Root cause**: `GTOGraphLoader` only assigned `sessionInfo.marks` when the filtered array had `length > 0`. Same pattern as Issue #426. `MarkerManager.setFromFrameNumbers([])` properly supports clearing all markers, but the empty array never reached it.

**Fix**: Removed the `marks.length > 0` guard so empty arrays flow through when the marks property exists. Changed `SessionGraph` check to `marks !== undefined` for explicit intent. Applied the fix to both code paths that parse marks.

**Tests added**: 7 regression tests in `GTOGraphLoader.issue423.test.ts` covering empty arrays, missing properties, filtering, and edge cases.

**Files changed**:
- `src/core/session/GTOGraphLoader.ts`
- `src/core/session/SessionGraph.ts`
- `src/core/session/GTOGraphLoader.issue423.test.ts` (new)

## Issue #428: Share-link compare state cannot explicitly clear an unassigned B source

**Root cause**: `applySessionURLState()` only called `setSourceB()` when `sourceBIndex` was present, but never called `clearSourceB()` when it was absent. A share link from a session with no B assignment left the recipient's stale B assignment intact.

**Fix**: Added `clearSourceB()` to the `URLSession` interface. In `applySessionURLState()`, when `sourceAIndex` is present (compare-aware link) but `sourceBIndex` is absent, explicitly call `clearSourceB()`. Links without any compare state leave B untouched (backward compat).

**Tests added**: 4 regression tests in `SessionURLService.test.ts` covering clear-on-absent-B, set-on-present-B, no-compare-state, and round-trip.

**Files changed**:
- `src/services/SessionURLService.ts`
- `src/services/SessionURLService.test.ts`
- `test/mocks.ts`

## Issue #430: Share-link media load failures are silent to users

**Root cause**: When `loadSourceFromUrl()` failed in `applySessionURLState()`, only `console.warn()` was called. The same file already surfaced user-facing messages for malformed WebRTC links via `networkControl.showInfo()`, but not for media load failures.

**Fix**: Added `networkControl.showInfo('Failed to load shared media: <reason>')` in the catch block, matching the pattern used for WebRTC errors. Console.warn preserved for debugging.

**Tests added**: 3 regression tests covering Error rejections, non-Error rejections, and success (no false notification).

**Files changed**:
- `src/services/SessionURLService.ts`
- `src/services/SessionURLService.test.ts`

## Issue #432: Share-link parsing validates `sourceIndex`, but not A/B compare indices

**Root cause**: `applySessionURLState()` clamped the primary `sourceIndex` before applying, but forwarded `sourceAIndex` and `sourceBIndex` raw to the session. Out-of-range indices were silently ignored by ABCompareManager, leaving stale local assignments.

**Fix**: Added validation/clamping before applying A/B indices:
- `sourceAIndex`: Clamped to `[0, sourceCount-1]`
- `sourceBIndex`: If out of range (negative, >= sourceCount, or sourceCount is 0), calls `clearSourceB()` instead

**Tests added**: 8 regression tests covering out-of-range, negative, boundary, and zero-source-count scenarios.

**Files changed**:
- `src/services/SessionURLService.ts`
- `src/services/SessionURLService.test.ts`

## Issue #433: Malformed normal session share links fail silently during URL bootstrap

**Root cause**: `handleURLBootstrap()` did nothing when `decodeSessionState()` returned null for a malformed `#s=...` hash. By contrast, malformed WebRTC links got user-facing messages via `networkControl.showInfo()`.

**Fix**: Added an `else if` branch: when the hash contains a `s=` parameter but decode returns null, calls `networkControl.showInfo('Could not restore shared session state: the link may be corrupted or incomplete.')`. Added a private helper `hashContainsSessionParam()` so the notification only fires for malformed share links, not normal app opens.

**Tests added**: 4 regression tests covering malformed hash, no hash, valid hash, and truncated base64.

**Files changed**:
- `src/services/SessionURLService.ts`
- `src/services/SessionURLService.test.ts`

## Issue #411: Partial project/snapshot restore replays source-indexed review state without remapping it to surviving sources

**Root cause**: `SessionSerializer.fromJSON()` computed `mediaIndexMap` (old→new source index mapping when some media fails to load) but only used it for representations. Playlist clips, notes, version groups, and statuses were restored with their original source indices, causing review data to attach to wrong sources during partial restore.

**Fix**: Added `remapSubsystemSourceIndices()` method that remaps source indices through `mediaIndexMap` for all four subsystems:
- Playlist clips: Remap `sourceIndex`, drop clips whose source was lost
- Notes: Remap `sourceIndex`, drop notes whose source was lost
- Version groups: Remap each entry's `sourceIndex`, drop lost entries, remove empty groups, clamp `activeVersionIndex`
- Statuses: Remap `sourceIndex`, drop entries whose source was lost
Called from `fromJSON()` inside the existing `if (mediaIndexMap.size > 0)` block.

**Tests added**: 15 regression tests in `SessionSerializer.issue411.test.ts` covering all subsystem remapping, lost source handling, identity case, and combined scenarios.

**Files changed**:
- `src/core/session/SessionSerializer.ts`
- `src/core/session/SessionSerializer.issue411.test.ts` (new)

## Issue #369: Network badge hidden for solo host
## Issue #370: Host labeled "Host" instead of "You (Host)"

**Root cause (369)**: `NetworkControl.updateBadge()` used `count > 1` to show the badge, hiding it when only the host was in the room (count=1). The docs said it should always show participant count.

**Root cause (370)**: `NetworkControl.updateUserList()` only checked `user.isHost` to show a "Host" badge, with no concept of which user is the local user. The docs said the local host should be labeled "You (Host)".

**Fix**:
- Changed badge visibility condition from `count > 1` to `count >= 1`
- Added `localUserId` tracking to `NetworkControlState`
- Added `setLocalUserId()` method to `NetworkControl`
- Rewrote badge logic: local host → "You (Host)", local non-host → "You", remote host → "Host"
- Wired `setLocalUserId()` in `AppNetworkBridge` on `roomCreated`, `roomJoined`, and `roomLeft` events

**Tests added**: 6 new regression tests in `NetworkControl.test.ts` (NCC-022b, NCC-022c, NCC-023 through NCC-027) covering solo host badge, empty user badge, and all four "You/Host" badge combinations. Updated `AppNetworkBridge.test.ts` mock.

**Files changed**:
- `src/ui/components/NetworkControl.ts`
- `src/ui/components/NetworkControl.test.ts`
- `src/AppNetworkBridge.ts`
- `src/AppNetworkBridge.test.ts`
- `docs/advanced/network-sync.md`

## Issue #302: Media representation failures and automatic fallbacks are emitted internally, but the app never surfaces them

**Root cause**: `MediaRepresentationManager` emits `representationError` and `fallbackActivated` events, forwarded through `SessionMedia` to the session. But `AppPlaybackWiring` only subscribed to `representationChanged`, not the error/fallback events. Users got no visible indication when playback quality degraded.

**Fix**: Added subscriptions in `AppPlaybackWiring.ts` for both events, surfacing them to users via the existing `showAlert()` notification system:
- `representationError`: shows warning (system-initiated) or error (user-initiated) alert
- `fallbackActivated`: shows info alert with the fallback representation's label

**Tests added**: 3 regression tests in `AppPlaybackWiring.test.ts` (PW-016, PW-017, PW-018) covering system error, user-initiated error, and fallback activation.

**Files changed**:
- `src/AppPlaybackWiring.ts`
- `src/AppPlaybackWiring.test.ts`

## Issue #305: `NetworkSyncManager` emits toast-style collaboration feedback, but the production app never consumes it

**Root cause**: `NetworkSyncManager` emits `toastMessage` events for state-sync timeouts, reconnect progress, peer join/leave, etc. `AppNetworkBridge` only subscribed to `connectionStateChanged`, `roomCreated`, `roomJoined`, `usersChanged`, `error`, and `rttUpdated` — never `toastMessage`.

**Fix**: Added `toastMessage` event subscription in `AppNetworkBridge.ts` that routes messages to `networkControl.showError()` (for error type) or `networkControl.showInfo()` (for info/success/warning types).

**Tests added**: 4 regression tests in `AppNetworkBridge.test.ts` (ANB-140 through ANB-143) covering info, success, error types and disposal cleanup.

**Files changed**:
- `src/AppNetworkBridge.ts`
- `src/AppNetworkBridge.test.ts`

## Issue #306: Media-cache failures are emitted internally, but the shipped app never surfaces them

**Root cause**: `MediaCacheManager` emits `error` events for OPFS cache failures during init, writes, and clearing. The app only fire-and-forget initialized the cache with a debug log. No production subscriber existed for cache error events.

**Fix**:
- Subscribed to `cacheManager.on('error')` in `App.ts` wiring
- Routes errors to `CacheIndicator.showError()` for visual display in the cache bar
- Shows `showAlert` warning dialog for init failures (caching unavailable)
- Logs all cache errors to `console.warn`
- Added `showError(message)` method to `CacheIndicator` with error/clear state

**Tests added**: 5 regression tests in `CacheIndicator.test.ts` (CACHE-U120 through CACHE-U124) + 8 tests in new `MediaCacheErrorSurfacing.test.ts`.

**Files changed**:
- `src/App.ts`
- `src/ui/components/CacheIndicator.ts`
- `src/ui/components/CacheIndicator.test.ts`
- `src/cache/MediaCacheErrorSurfacing.test.ts` (new)

## Issue #374: Snapshot creation is hardwired to anonymous quick-save behavior instead of the documented name-and-description flow

**Root cause**: The Snapshot panel's `Create Snapshot` button emitted a bare `createRequested` event, wired directly to `createQuickSnapshot()` which auto-generated a timestamp name. No UI prompted the user for a name or description.

**Fix**:
- Added `showPrompt` dialog when clicking "Create Snapshot" in `SnapshotPanel`
- Updated `createRequested` event payload to `{ name?: string; description?: string }`
- Added `createSnapshot(name?, description?)` to `AppPersistenceManager`
- Falls back to auto-generated timestamp name when user leaves name blank

**Tests added**: 5 tests in `SnapshotPanel.test.ts` (SNAP-080 through SNAP-084), 4 tests in `AppPersistenceManager.test.ts` (APM-044 through APM-047), 2 tests in `AppPlaybackWiring.test.ts` (PW-050, PW-051).

**Files changed**:
- `src/ui/components/SnapshotPanel.ts`
- `src/ui/components/SnapshotPanel.test.ts`
- `src/AppPlaybackWiring.ts`
- `src/AppPlaybackWiring.test.ts`
- `src/AppPersistenceManager.ts`
- `src/AppPersistenceManager.test.ts`

## Issue #378: Snapshot descriptions are searchable and displayable, but the shipped UI never lets users author or edit them

**Root cause**: The Snapshot panel supports searching by description and renders description text on cards, but no "edit description" action existed. `SnapshotManager.updateDescription()` had no live caller.

**Fix**:
- Added "Edit Description" button (note icon) to each snapshot card's action row
- Shows `showPrompt` dialog pre-populated with current description
- Emits `descriptionUpdated` event wired to `snapshotManager.updateDescription()`

**Tests added**: 4 tests in `SnapshotPanel.test.ts` (SNAP-044 through SNAP-047) covering edit prompt, cancellation, empty description, and unchanged description.

**Files changed**:
- `src/ui/components/SnapshotPanel.ts`
- `src/ui/components/SnapshotPanel.test.ts`
- `src/AppPlaybackWiring.ts`
- `src/AppPlaybackWiring.test.ts`

## Issue #382: The session export docs say RV/GTO sessions are import-only, but the shipped Export menu still saves `.rv` and `.gto`

**Root cause**: Documentation bug. `docs/export/sessions.md` incorrectly stated "GTO sessions are read-only imports -- they are not re-exported in GTO format." The shipped Export control has working "Save RV Session (.rv)" and "Save RV Session (.gto)" menu items wired to `persistenceManager.saveRvSession()`.

**Fix**: Updated `docs/export/sessions.md` to accurately document both import and export capabilities for RV/GTO session formats.

**Tests added**: 4 regression tests in `ExportControl.test.ts` (EXPORT-U080 through EXPORT-U083) verifying the RV/GTO export menu items exist and emit the correct events.

**Files changed**:
- `docs/export/sessions.md`
- `src/ui/components/ExportControl.test.ts`

## Issue #348: The shortcut docs still advertise `H` and `W` for histogram and waveform even though those defaults are hidden by conflicts
## Issue #464: The UI overview still teaches `H` and `W` as direct Histogram/Waveform shortcuts even though those defaults are hidden by conflicts

**Root cause**: Documentation bug across multiple doc files. After Issues #1-3 moved H/W/G to context-aware dispatch, the docs still advertised H/W as direct scope shortcuts.

**Fix**: Updated 8 documentation files to remove incorrect H/W scope shortcut references:
- `docs/reference/keyboard-shortcuts.md` — removed H/W from scopes table, added fit shortcuts section
- `docs/getting-started/ui-overview.md` — changed to "*(none by default)*"
- `docs/scopes/histogram.md`, `docs/scopes/waveform.md` — updated toggle instructions
- `docs/color/primary-controls.md`, `docs/color/tone-mapping.md`, `docs/advanced/filters-effects.md` — removed parenthetical shortcuts
- `UI.md` — updated shortcut table

**Tests added**: 4 documentation consistency tests in `tests/docs.consistency.test.ts`.

**Files changed**: 8 doc files + `tests/docs.consistency.test.ts`

## Issue #371: The playback docs describe a labeled loop-mode button, but production renders an icon-only compact control

**Root cause**: Docs described a 70px wide button with visible "Loop"/"Ping"/"Once" labels. The shipped button is intentionally compact (28px, icon-only) with mode name only in aria-label.

**Fix**:
- Added `title` attribute (tooltip) to loop button showing current mode name on hover
- Updated `docs/playback/loop-modes-stepping.md` to describe icon-only control with tooltip
- Updated `docs/getting-started/ui-overview.md` to match

**Tests added**: 2 regression tests in `HeaderBar.test.ts` (HDR-U052, HDR-U053) verifying tooltip text updates across all loop modes.

**Files changed**:
- `src/ui/components/layout/HeaderBar.ts`
- `src/ui/components/layout/HeaderBar.test.ts`
- `docs/playback/loop-modes-stepping.md`
- `docs/getting-started/ui-overview.md`

## Issue #264: Mu compat `imageGeometryByTag()` ignores the tag argument entirely

**Root cause**: `imageGeometryByTag(imageName, _tag)` in `MuEvalBridge.ts` explicitly ignored the `tag` parameter and forwarded directly to `imageGeometry(imageName)`. The `RenderedImageInfo` type also had no `tag` field, so there was no way to associate tags with rendered images.

**Fix**:
- Added optional `tag?: string` field to `RenderedImageInfo` in `types.ts`
- Implemented tag-based lookup in `imageGeometryByTag()`: first searches for an image matching both `imageName` and `tag`, then falls back to name-only lookup via `imageGeometry()` when tag is empty or no match is found

**Tests added**: 9 regression tests in `MuEvalBridge.test.ts` covering:
- Tag-based lookup returns correct geometry when name+tag match (with dimension assertions)
- Different tags on same image name return different geometry
- Fallback to name-based lookup when tag is not found
- Fallback when tag is empty string
- Fallback when image has no tag set
- Returns empty array when neither name nor tag match
- Tag matches but name does not (requires both)
- First-match-wins when multiple images share same name+tag
- Empty rendered images list returns empty array

**Files changed**:
- `src/compat/types.ts`
- `src/compat/MuEvalBridge.ts`
- `src/compat/__tests__/MuEvalBridge.test.ts`

## Issue #317: Review-status semantics are lossy: several documented production states collapse into unrelated local values

**Root cause**: `ShotStatus` type only had 5 values (`pending`, `approved`, `needs-work`, `cbb`, `omit`), while the review workflow required 8 distinct states. ShotGrid integration collapsed `fin -> approved`, `ip -> pending`, `hld -> pending`, making statuses lossy across round-trips.

**Fix**:
- Extended `ShotStatus` from 5 to 8 values: added `in-review`, `final`, `on-hold`
- Added colors: blue for `in-review`, amber/gold for `final`, red for `on-hold`; moved `omit` from red to slate
- Fixed ShotGrid mappings: `fin -> final`, `ip -> in-review`, `hld -> on-hold` (with reverse mappings)
- Added `fromSerializable` validation: unknown statuses default to `pending`
- Updated `VALID_STATUSES` array and `getStatusCounts` initializer
- Updated review-workflow docs to list all 8 statuses

**Tests added**: 9 regression tests across StatusManager.test.ts and ShotGridBridge.test.ts:
- New status values can be set/retrieved/counted
- All 8 statuses survive ShotGrid round-trip (`local -> SG -> local`)
- Colors defined for all 8 statuses
- VALID_STATUSES has correct length
- Old 5-status serialized data loads correctly (migration test)
- Unknown/corrupted statuses default to `pending` on deserialization
- ShotGrid mapping updated for all new statuses

**Files changed**:
- `src/core/session/StatusManager.ts`
- `src/integrations/ShotGridBridge.ts`
- `src/core/session/StatusManager.test.ts`
- `src/integrations/ShotGridBridge.test.ts`
- `docs/advanced/review-workflow.md`

## Issue #333: Reference `toggle` mode doesn't actually toggle between live and reference

**Root cause**: `ReferenceManager` had no toggle state mechanism. The Viewer's toggle mode branch unconditionally drew the reference image over the full frame, making it a permanent replacement rather than a switchable comparison.

**Fix**:
- Added `showingReference: boolean` to `ReferenceState` (defaults to `false`, showing live)
- Added `toggleView()` method (guarded: only works in toggle mode) and `isShowingReference()` getter
- `disable()` and `setViewMode()` reset `showingReference` to `false`
- Viewer's `setReferenceImage()` gains a 5th `showingReference` parameter (default `true` for backward compat)
- Toggle mode now only draws reference when `showingReference` is true; otherwise live frame shows through
- `buildViewTab.ts` passes `state.showingReference` through to the Viewer

**Tests added**: 10 regression tests (REF-030 through REF-039) covering:
- Initial state is false (showing live)
- toggleView() flips state in toggle mode
- Multiple toggles alternate correctly
- setViewMode resets showingReference
- toggleView() emits stateChanged
- State exposed in getState()
- No-op after dispose
- Switching modes and back resets state
- toggleView() is no-op in non-toggle modes
- disable() resets showingReference

**Files changed**:
- `src/ui/components/ReferenceManager.ts`
- `src/ui/components/ReferenceManager.test.ts`
- `src/ui/components/Viewer.ts`
- `src/services/tabContent/buildViewTab.ts`

## Issue #434: Malformed WebSocket sync messages are dropped silently with no error path

**Root cause**: `WebSocketClient.handleMessage()` silently returned when `deserializeMessage()` failed, with no event emission. `NetworkSyncManager` never learned about protocol corruption, so users saw random state drift with no explanation.

**Fix**:
- Added `warning` event to `WebSocketClientEvents` (separate from `error` to avoid triggering reconnection)
- `handleMessage()` now calls `emitMalformedMessageWarning()` which emits a `warning` with code `MALFORMED_MESSAGE`, descriptive message, and truncated raw data preview (max 120 chars)
- Rate-limited to 5 warnings per 10-second window to prevent flooding
- Rate-limit counters reset on disconnect and reconnect (`cleanup()` and `onopen`)
- `NetworkSyncManager` subscribes to `warning` and forwards it as a `toastMessage` for user visibility

**Tests added**: 7 regression tests across WebSocketClient.test.ts and NetworkSyncManager.test.ts:
- Warning emitted on malformed JSON and structurally invalid messages
- Warning payload includes code, message, and truncated detail
- Long messages truncated in detail field
- Rate limiting at boundary (5 of 10 messages emit)
- Rate limit resets after time window elapses
- Rate limit resets after disconnect/reconnect cycle
- NetworkSyncManager forwards warning as toastMessage

**Files changed**:
- `src/network/types.ts`
- `src/network/WebSocketClient.ts`
- `src/network/WebSocketClient.test.ts`
- `src/network/NetworkSyncManager.ts`
- `src/network/NetworkSyncManager.test.ts`

## Issue #439: DCC LUT sync requests can apply out of order when multiple LUT URLs arrive quickly

**Root cause**: `fetchAndApplyLUT()` was async with no ordering mechanism. Multiple concurrent calls could complete in any order, and a slow old request could overwrite a newer LUT.

**Fix**: Added "latest request wins" pattern using a `lutGeneration` counter on `DCCWiringState`:
- Each `fetchAndApplyLUT()` call increments `state.lutGeneration` at start
- After each `await`, checks if generation still matches before proceeding
- Stale results are logged and discarded
- No changes to existing interfaces or caller signatures (only added a `state` parameter to `fetchAndApplyLUT`)

**Tests added**: 6 regression tests in `AppDCCWiring.test.ts`:
- Single request applies normally
- Slow first request discarded when fast second completes
- Three rapid requests — only last applies
- Fetch failure doesn't apply LUT
- HTTP error doesn't apply LUT
- Generation counter starts at 0

**Files changed**:
- `src/AppDCCWiring.ts`
- `src/AppDCCWiring.test.ts` (new)

## Issue #477: Clipping overlay hardcodes trigger values instead of allowing configurable thresholds

**Root cause**: `ClippingOverlayState` had no threshold fields. Shadow detection was hardcoded to `<= 1` and highlight detection to `>= 254` in 0-255 space, with no way to adjust.

**Fix**:
- Added `shadowThreshold` (default 0.0) and `highlightThreshold` (default 1.0) to `ClippingOverlayState` as normalized 0.0-1.0 values
- Updated `apply()` to compute pixel limits from thresholds: `floor(t * 253 + 1)` for shadow, `ceil(t * 253 + 1)` for highlight
- Added `setShadowThreshold()` and `setHighlightThreshold()` setters with 0-1 clamping
- Default thresholds produce identical detection to original hardcoded values (backward compatible)

**Tests added**: 10 regression tests (CLIP-U110 through CLIP-U119):
- Default thresholds match existing behavior
- Custom thresholds detect near-clipping pixels
- Threshold clamping to 0-1 range
- Setter idempotency
- setState with thresholds
- Reset restores defaults
- Backward compatibility equivalence

**Files changed**:
- `src/ui/components/ClippingOverlay.ts`
- `src/ui/components/ClippingOverlay.test.ts`

## Issue #484: Clipping overlay has no "both clipped" distinct highlight color

**Root cause**: The overlay only had two branches (highlight → highlightColor, shadow → shadowColor). Pixels clipped in both directions got the highlight color, with no way to distinguish them.

**Fix**:
- Added `bothColor` to `ClippingOverlayState` (default: yellow `{ r: 250, g: 204, b: 21 }`)
- Added `setBothColor()` setter with idempotency check
- Updated `apply()` detection priority: both-clipped > highlight-clipped > shadow-clipped
- Backward compatible: existing highlight/shadow behavior unchanged

**Tests added**: 8 regression tests (CLIP-U100 through CLIP-U107):
- Both-clipped pixel gets bothColor
- Highlight-only and shadow-only still get correct colors
- bothColor customizable via setter and setState
- Default included in state
- Idempotency and reset behavior

**Files changed**:
- `src/ui/components/ClippingOverlay.ts`
- `src/ui/components/ClippingOverlay.test.ts`

## Issue #518: `isAvifFile()` returns true for gainmap AVIFs, relying on registry ordering

**Root cause**: `isAvifFile()` only checked the ftyp brand and returned true for all AVIF files including gainmap AVIFs. Correct behavior depended on decoder registry ordering (gainmap decoder placed first), not the detector itself.

**Fix**:
- Imported `isGainmapAVIF` from `AVIFGainmapDecoder.ts` into `avif.ts`
- After brand check passes, calls `isGainmapAVIF(buffer)` and returns false if it matches
- The detector is now self-contained and correct regardless of registry ordering
- No circular dependency (one-way import)

**Tests added**: 3 regression tests in `avif.test.ts`:
- Gainmap AVIF (avif brand) returns false
- Gainmap AVIF (avis brand) returns false
- Gainmap AVIF (mif1 brand) returns false

**Files changed**:
- `src/formats/avif.ts`
- `src/formats/avif.test.ts`

## Issue #538: Switching representations while playing pauses playback and never resumes it

**Root cause**: `SessionMedia.switchRepresentation()` paused playback before delegating to the representation manager, but never resumed it after a successful switch. No production subscriber on representation events restarted playback either.

**Fix**:
- Save `wasPlaying` state before pausing in `switchRepresentation()`
- After a successful switch (`switchRepresentation` returns `true`), call `this._host!.play()` to resume
- Added `play(): void` to `SessionMediaHost` interface and wired it in `Session.ts`
- If the switch fails (returns `false`) or throws, playback stays paused

**Tests added**: 4 regression tests in `SessionMedia.test.ts` (SM-048 through SM-051):
- SM-048: Resumes playback after successful switch when was playing
- SM-049: Does not resume playback after failed switch
- SM-050: Does not resume playback when was not playing before switch
- SM-051: Does not resume playback when switch throws an error

**Files changed**:
- `src/core/session/SessionMedia.ts`
- `src/core/session/Session.ts`
- `src/core/session/SessionMedia.test.ts`

## Issue #522: ShotGrid media loading only recognizes `mp4|mov|webm|mkv` as video
## Issue #523: DCC media loading uses a narrower hardcoded video-extension list than the rest of the app

**Root cause**: Both `ShotGridIntegrationBridge` and `AppDCCWiring` had their own hardcoded video extension lists (a regex and a constant array respectively) instead of using the canonical `SupportedMediaFormats` module. This meant supported video containers like `.m4v`, `.3gp`, `.ogv`, `.mxf`, etc. were misrouted into `loadImage()`.

**Fix**:
- Added `isVideoExtension(ext)` to `SupportedMediaFormats.ts` as the single source of truth for video extension classification
- Replaced the hardcoded regex in `ShotGridIntegrationBridge.ts` with extension extraction + `isVideoExtension()`, also adding query string/fragment stripping
- Removed the `VIDEO_EXTENSIONS` constant from `AppDCCWiring.ts` and replaced `VIDEO_EXTENSIONS.includes(ext)` with `isVideoExtension(ext)`

**Tests added**: 8 new tests:
- 6 in `SupportedMediaFormats.test.ts` (SMF-V001 through SMF-V006): exhaustive coverage of `isVideoExtension()`
- 2 in `ShotGridIntegrationBridge.test.ts` (SG-INT-004b, SG-INT-004c): extended format recognition and query string stripping

**Files changed**:
- `src/utils/media/SupportedMediaFormats.ts`
- `src/utils/media/SupportedMediaFormats.test.ts`
- `src/integrations/ShotGridIntegrationBridge.ts`
- `src/integrations/ShotGridIntegrationBridge.test.ts`
- `src/AppDCCWiring.ts`

## Issue #552: Mu compat `remoteContacts()` returns local labels instead of peer contact names

**Root cause**: `MuNetworkBridge.remoteContacts()` mapped `connectionInfo.values()` to `info.name`, which was the caller-supplied local label from `remoteConnect(name, host, port)`. The actual peer identity stored in `peerContactName` (set during handshake) was never used.

**Fix**: Changed `remoteContacts()` to return `info.peerContactName ?? info.name`, returning the peer's identity received via handshake with a fallback to the local label if handshake hasn't occurred. Added `peerContactName` and `peerPermission` to the `RemoteConnectionInfo` interface type.

**Tests added**: 4 regression tests in `MuNetworkBridge.test.ts` covering pre-handshake fallback, post-handshake peer name, mixed connections, and `remoteApplications()` still returning local labels.

**Files changed**:
- `src/compat/MuNetworkBridge.ts`
- `src/compat/types.ts`
- `src/compat/__tests__/MuNetworkBridge.test.ts`

## Issue #542: Async idle-fallbacks reported as successful before they actually load

**Root cause**: `handleRepresentationError()` in `MediaRepresentationManager` used fire-and-forget (`void this.switchRepresentation(...)`) for the idle-fallback path and returned `true` optimistically. `SessionSerializer.fromJSON()` relied on this return value to decide whether to warn about failed representation restores.

**Fix**: Made `handleRepresentationError()` async, replacing the fire-and-forget with `return this.switchRepresentation(...)` so it properly awaits the fallback switch and returns the actual result.

**Tests added**: Updated existing tests from sync to async, changed the "optimistically true" test to verify actual results, added 2 regression tests for cascading fallback failures.

**Files changed**:
- `src/core/session/MediaRepresentationManager.ts`
- `src/core/session/MediaRepresentationManager.test.ts`

## Issue #537: Removing last active representation leaves source shim pointing at disposed node

**Root cause**: `removeRepresentation()` disposed the loader for the removed representation but when it was active with no fallback, only set `activeRepresentationIndex` to `-1` without clearing source-level node fields. The disposed loader's nodes remained referenced by the source.

**Fix**: Updated `applyRepresentationShim()` to accept `null` representation (clearing all source node fields), and called it in `removeRepresentation()` when the removed rep was active with no fallback.

**Tests added**: 3 regression tests verifying stale field clearing on last-rep removal, no-ready-fallback clearing, and non-active removal preservation.

**Files changed**:
- `src/core/session/MediaRepresentationManager.ts`
- `src/core/session/SessionMedia.ts`
- `src/core/session/MediaRepresentationManager.test.ts`

## Issue #364: Annotation import always replaces; merge and frame-offset never exposed

**Root cause**: The lower-level `applyAnnotationsJSON()` already supported `mode: 'merge'` and `frameOffset`, but `AppPlaybackWiring.ts` hardcoded `{ mode: 'replace' }` and `ExportControl.ts` offered no options dialog.

**Fix**: Added `showAnnotationImportDialog()` to the Modal system (consistent with existing dialog patterns), presenting radio buttons for import mode (Replace/Merge) and a number input for frame offset. Updated the import flow to show this dialog before applying annotations, with success messages reflecting the chosen options.

**Tests added**: 4 regression tests in `AppPlaybackWiring.test.ts` covering dialog opening, merge mode, frame offset, and default replace behavior.

**Files changed**:
- `src/ui/components/shared/Modal.ts`
- `src/AppPlaybackWiring.ts`
- `src/AppPlaybackWiring.test.ts`

## Issue #533: Representation switching never calls `mapFrame()` for frame-accurate remapping

**Root cause**: `MediaRepresentationManager` implemented `mapFrame()` for frame-accurate switching between editorial-offset variants, but `switchRepresentation()` never called it or updated the host's current frame.

**Fix**: Added `_computeMappedFrame()` that checks if two representations have different `startFrame` values, and calls `mapFrame()`. Both switch paths now compute and include `mappedFrame` in the `representationChanged` event. `SessionMedia` applies the mapped frame via `setCurrentFrame()`.

**Tests added**: 5 regression tests for frame remapping on switch: different startFrame, same startFrame, clamping, idle-rep loading, and no-previous-rep cases. Added `mappedFrame` to `RepresentationManagerEvents` and `SessionMediaEvents`.

**Files changed**:
- `src/core/session/MediaRepresentationManager.ts`
- `src/core/types/representation.ts`
- `src/core/session/SessionMedia.ts`
- `src/core/session/MediaRepresentationManager.test.ts`

## Issue #536: Representation switches leave duration/FPS stale

**Root cause**: `applyRepresentationShim()` only copied width/height from the representation, never updating `source.duration`, `source.fps`, or emitting host playback events. Normal media loads update all of these.

**Fix**: Added `duration` and `fps` fields to representation types, loader results, and serialization. `VideoRepresentationLoader` and `SequenceRepresentationLoader` now detect and return these values. `applyRepresentationShim()` updates source duration/fps and emits appropriate events (durationChanged, fpsChanged, inOutChanged).

**Tests added**: 8 regression tests (SM-087 through SM-094) covering duration/fps updates, event emission, value preservation, and non-current source behavior.

**Files changed**:
- `src/core/types/representation.ts`
- `src/core/session/loaders/RepresentationLoader.ts`
- `src/core/session/loaders/VideoRepresentationLoader.ts`
- `src/core/session/loaders/SequenceRepresentationLoader.ts`
- `src/core/session/MediaRepresentationManager.ts`
- `src/core/session/SessionMedia.ts`
- `src/core/session/SessionMedia.test.ts`
- `src/core/session/loaders/RepresentationLoaderFactory.test.ts`

## Issue #540: Representation switches leave `source.name` and `source.url` pinned to base media

**Root cause**: `applyRepresentationShim()` updated only resolution and node-specific fields, never rewriting `source.name` or `source.url` from the active representation's label/path/url.

**Fix**: Added an `_originalSourceIdentity` map to save original name/url before first overwrite. On representation apply, updates `source.name` from `representation.label` and `source.url` from `loaderConfig.url`/`loaderConfig.path`. On null representation (clearing), restores originals.

**Tests added**: 7 regression tests (SM-095 through SM-101) covering label update, url update, path fallback, empty label preservation, original restoration, multi-switch stability, and no-url preservation.

**Files changed**:
- `src/core/session/SessionMedia.ts`
- `src/core/session/SessionMedia.test.ts`

## Issue #545: Public source/rendered-image events stay stale across representation switches

**Root cause**: `EventsAPI` subscribed to `representationError` but not `representationChanged` or `fallbackActivated`. Representation switches didn't update `_lastLoadedSource` or trigger `renderedImagesChanged`.

**Fix**: Added `representationChanged` and `fallbackActivated` to `OpenRVEventName`. Added subscriptions that extract resolution/label from the representation, update `_lastLoadedSource`, emit the public event, and call `emitCurrentRenderedImages()`. Updated `docs/api/index.md` event reference.

**Tests added**: 6 regression tests (API-U545a through API-U545f) covering event name presence, _lastLoadedSource updates, renderedImagesChanged emission, stale overwrite, and unsubscribe.

**Files changed**:
- `src/api/EventsAPI.ts`
- `src/api/OpenRVAPI.test.ts`
- `docs/api/index.md`

## Issue #546: `currentSourceChanged` not emitted for representation switches

**Root cause**: `SessionMedia` emitted `currentSourceChanged` only from `setCurrentSource()` on index change. Representation switches emitted `representationChanged`/`fallbackActivated` but not `currentSourceChanged`, leaving downstream listeners (QC state clearing, API bridge) with stale state.

**Fix**: After forwarding `representationChanged` and `fallbackActivated` events, added a check: if the event's `sourceIndex` matches the current source index, also emit `currentSourceChanged`. This preserves correct event ordering (representation event fires first).

**Tests added**: 5 regression tests (SM-102 through SM-106) covering emission on current source, non-emission on non-current source, fallback variants, and event ordering guarantee.

**Files changed**:
- `src/core/session/SessionMedia.ts`
- `src/core/session/SessionMedia.test.ts`

## Issue #560: `openrv.dispose()` doesn't detach plugin registry

**Root cause**: `OpenRVAPI.dispose()` only marked the API unready and disposed submodules. It never informed `PluginRegistry`, cleared `apiRef`/`eventsAPI`, or reset the plugin event bus. Active plugin contexts kept stale references to the disposed API.

**Fix**: Added `detach()` method to `PluginRegistry` that clears `apiRef`, `paintEngineRef`, and calls `eventBus.dispose()`. Called from `OpenRVAPI.dispose()`. After disposal, `context.api` throws "OpenRV API not yet initialized" instead of returning a stale reference.

**Tests added**: 4 API-level tests (API-U560a through API-U560d), 4 registry-level tests (PREG-070 through PREG-073), and 3 event bus tests (PEVT-061 through PEVT-063) covering stale reference prevention, subscription cleanup, re-initialization, and idempotency.

**Files changed**:
- `src/api/OpenRVAPI.ts`
- `src/plugin/PluginRegistry.ts`
- `src/api/OpenRVAPI.test.ts`
- `src/plugin/PluginRegistry.test.ts`
- `src/plugin/PluginEventBus.test.ts`

## Issue #424: RV/GTO crop restore fails for still-image sessions (RVImageSource)

**Root cause**: `SessionGraph.parseSession()` only extracted `sourceWidth`/`sourceHeight` from `RVFileSource` protocol nodes. Still-image sessions exported as `RVImageSource` were missed, leaving dimensions at 0. This caused `parseCrop()` to fall back to `{ x: 0, y: 0, width: 1, height: 1 }` (full-frame), discarding the authored crop.

**Fix**: After the `RVFileSource` loop, if dimensions are still 0, now also iterates `RVImageSource` protocol nodes using the same proxy-size extraction logic. `RVFileSource` always takes precedence.

**Tests added**: 4 regression tests (ISS-424-001 through ISS-424-004) covering RVImageSource crop, precedence, fallback, and crash safety.

**Files changed**:
- `src/core/session/SessionGraph.ts`
- `src/core/session/SessionGraph.issue424.test.ts` (new)

## Issue #425: RV/GTO paint annotation aspect ratio wrong for RVImageSource sessions

**Root cause**: Same as #424 — `aspectRatio` was only computed from `RVFileSource`. Already resolved by the #424 fix which also computes aspect ratio in the `RVImageSource` fallback path.

**Fix**: Covered by #424 fix. Regression tests added to verify correct aspect ratio is passed to `parsePaintAnnotations()`.

**Tests added**: 6 regression tests (ISS-425-001 through ISS-425-006) covering aspect ratio from RVImageSource, RVFileSource, precedence, defaults, non-square, and square sources.

**Files changed**:
- `src/core/session/SessionGraph.issue425.test.ts` (new)

## Issue #427: Multi-source RV/GTO imports use inconsistent dimensions for crop vs annotations

**Root cause**: The `RVFileSource` loop overwrote `aspectRatio` on every source while `sourceWidth`/`sourceHeight` were only set from the first. Crop used first source's dimensions; annotations used last source's aspect ratio.

**Fix**: Moved `aspectRatio` computation inside the `if (sourceWidth === 0 && sourceHeight === 0)` guard in both the `RVFileSource` and `RVImageSource` loops. Now both crop and annotation geometry consistently use the first source's dimensions.

**Tests added**: 5 regression tests (ISS-427-001 through ISS-427-005) covering multi-source aspect ratio, multi-source crop, single-source regression, multi-source RVImageSource, and 3-source consistency.

**Files changed**:
- `src/core/session/SessionGraph.ts`
- `src/core/session/SessionGraph.issue427.test.ts` (new)

## Issue #417: RV/GTO parser never populates filterSettings despite contract

**Root cause**: `parseInitialSettings()` in `GTOSettingsParser.ts` had no `parseFilterSettings()` step, even though the `GTOViewSettings` type defined `filterSettings` and the live restore handler had a corresponding branch.

**Fix**: Added `parseFilterSettings()` that reads `RVFilterGaussian` (radius → blur) and `RVUnsharpMask` (amount → sharpen) protocol nodes with proper clamping, rounding, and active-flag handling. Wired into `parseInitialSettings()`.

**Tests added**: 12 regression tests covering no nodes, individual parsing, combined, clamping, rounding, inactive, zero, negative, and missing properties.

**Files changed**:
- `src/core/session/GTOSettingsParser.ts`
- `src/core/session/GTOSettingsParser.test.ts`

## Issue #418: RV/GTO parser never populates stereo eye transforms and align mode

**Root cause**: `parseInitialSettings()` never parsed `stereoEyeTransform` or `stereoAlignMode` from GTO data, even though the settings type and restore handler supported them.

**Fix**: Added `parseStereoEyeTransform()` and `parseStereoAlignMode()` that read from `RVDisplayStereo` protocol nodes. Extended `SessionGTOExporter` to serialize eye transforms and align mode for round-trip support.

**Tests added**: 18 regression tests covering eye transform parsing (left/right/both/linked/defaults/clamping/partial) and align mode (all valid modes, invalid, missing).

**Files changed**:
- `src/core/session/GTOSettingsParser.ts`
- `src/core/session/SessionGTOExporter.ts`
- `src/core/session/GTOSettingsParser.test.ts`

## Issue #421: RV/GTO settings restore ignores standalone RVColorCDL nodes

**Root cause**: `parseCDL()` only read CDL from `RVColor` and `RVLinearize` nodes. Standalone `RVColorCDL` and `RVColorACESLogCDL` nodes (used by the repo's own serializer/exporter/loader) were ignored.

**Fix**: Added `readCDLFromStandaloneNodes()` that reads from the `node` component of `RVColorCDL`/`RVColorACESLogCDL` protocols. Uses proper precedence chain: `RVColor >> RVLinearize >> RVColorCDL >> RVColorACESLogCDL`.

**Tests added**: 7 regression tests covering both standalone protocols, inactive nodes, no-node case, precedence, and fallback behavior.

**Files changed**:
- `src/core/session/GTOSettingsParser.ts`
- `src/core/session/GTOSettingsParser.test.ts`

## Issue #422: RV/GTO settings restore ignores standalone color-node protocols (exposure, saturation, etc.)

**Root cause**: Color adjustment parsing only read from `RVColor`/`RVDisplayColor`. Standalone nodes like `RVColorExposure`, `RVColorSaturation`, `RVColorVibrance`, `RVColorShadow`, `RVColorHighlight` were ignored despite being recognized by the loader and serializer.

**Fix**: Added `applyStandaloneColorNode()` helper that reads from standalone color-node protocols as fallbacks. Only fills gaps — `RVColor`/`RVDisplayColor` values always take precedence.

**Tests added**: 14 regression tests covering each standalone node, inactive skipping, precedence, combined parsing, and mixed scenarios.

**Files changed**:
- `src/core/session/GTOSettingsParser.ts`
- `src/core/session/GTOSettingsParser.test.ts`

## Issue #383: File-reload dialog has no real Cancel path (Escape/X treated as Skip)

**Root cause**: The file-reload dialog only had Browse, Load, and Skip buttons. Escape and X resolved `null` (same as Skip), so there was no way to abort the restore flow.

**Fix**: Added `FILE_RELOAD_CANCEL` sentinel. Added Cancel button. Changed Escape/X to resolve as cancel instead of skip. Updated `SessionSerializer.fromJSON()` to throw on cancel, aborting the restore. Skip button still works as before.

**Tests added**: 6 regression tests covering cancel sentinel, cancel on file/sequence reload, skip still works, cancel mid-restore aborts, and non-blob sequence cancel.

**Files changed**:
- `src/ui/components/shared/Modal.ts`
- `src/core/session/SessionSerializer.ts`
- `src/core/session/SessionSerializer.issue383.test.ts` (new)
- `docs/export/sessions.md`

## Issue #389: Open Project picker accepts .rvedl (EDL is not a project)

**Root cause**: The project input accepted `.orvproject,.rv,.gto,.rvedl`, but `.rvedl` only imports an EDL timeline — it doesn't restore project state. Including it in "Open project" was misleading.

**Fix**: Removed `.rvedl` from the project input's accept list. EDL import remains available via the `Open media file` path.

**Tests added**: 1 regression test (HDR-U027) verifying no file input includes `.rvedl`.

**Files changed**:
- `src/ui/components/layout/HeaderBar.ts`
- `src/ui/components/layout/HeaderBar.test.ts`

## Issue #436: Outbound collaboration updates silently dropped on send failure

**Root cause**: `NetworkSyncManager.dispatchRealtimeMessage()` tried WebSocket then serverless peer but ignored whether the fallback succeeded. Failed sends were never surfaced.

**Fix**: `dispatchRealtimeMessage()` now returns `boolean`, tracks `_droppedMessageCount`, and emits `syncMessageDropped` event when both transports fail.

**Tests added**: 6 regression tests (NSM-130 through NSM-135) covering failure tracking, event emission, accumulation, and success cases.

**Files changed**:
- `src/network/NetworkSyncManager.ts`
- `src/network/types.ts`
- `src/network/NetworkSyncManager.test.ts`

## Issue #443: Outbound DCC sync events silently dropped when bridge not writable

**Root cause**: `DCCBridge.send()` returned `false` when not writable, but `AppDCCWiring.ts` ignored the return value for all outbound sync paths.

**Fix**: `DCCBridge` now tracks `_droppedMessageCount` and emits `messageDropped` event. `AppDCCWiring` checks return values and logs warnings via `Logger.warn`.

**Tests added**: 4 DCCBridge tests (DCC-OUT-006 through DCC-OUT-008) and 4 AppDCCWiring tests (DCCFIX-070 through DCCFIX-073).

**Files changed**:
- `src/integrations/DCCBridge.ts`
- `src/AppDCCWiring.ts`
- `src/integrations/DCCBridge.test.ts`
- `src/AppWiringFixes.test.ts`

## Issue #394: Locally loaded image sequences don't round-trip through project save/load

**Root cause**: Sequences created from local files have `url: ''`. `serializeMedia()` only checked for blob URLs to set `requiresReload`, so empty-URL sequences were saved without the flag and couldn't trigger the reload dialog on load.

**Fix**: Extended the `requiresReload` condition to also check for empty URLs: `const needsReload = isBlob || source.url === '';`.

**Tests added**: 8 regression tests (ISS-394-001 through ISS-394-008) covering serialization flag, reload prompt, cancel, skip variants, load failure, round-trip, and blob URL regression.

**Files changed**:
- `src/core/session/SessionSerializer.ts`
- `src/core/session/SessionSerializer.issue394.test.ts` (new)

## Issue #431: Media-bearing share links only load the shared media on an empty session

**Root cause**: `applySessionURLState()` in `SessionURLService` only attempted to load `sourceUrl` when `session.sourceCount === 0`. When the recipient already had media loaded, the shared media URL was silently ignored and the sender's view/compare state was applied to whatever local media the recipient had — potentially the wrong content entirely.

**Fix**: Restructured media resolution into a three-tier strategy that runs regardless of session state:
1. Check if the shared URL is already loaded (navigate to it, avoiding duplication)
2. Empty session: use `session.loadSourceFromUrl()` as before
3. Non-empty session: use a new `deps.loadSourceFromUrl()` callback to add the shared media as a new source
4. All subsequent state (frame, compare, transform, OCIO) uses the resolved source index

The `URLSession` interface gained `allSources` for URL-based lookup. `SessionURLDeps` gained an optional `loadSourceFromUrl` callback for non-empty-session loading.

**Tests added**: 5 regression tests (SU-023 through SU-027) covering: empty session load, non-empty session add, already-loaded dedup, no-callback fallback, and load-failure fallback.

**Files changed**:
- `src/services/SessionURLService.ts`
- `src/services/SessionURLService.test.ts`
- `test/mocks.ts`

## Issue #321: Version-manager navigation is a no-op at runtime because active-version changes never switch the session source

**Root cause**: `SessionAnnotations` wired `VersionManager`'s `onActiveVersionChanged` callback to an explicit no-op with a "future" comment. No production code translated active-version changes into `session.setCurrentSource()`.

**Fix**:
- `SessionAnnotations` now emits `activeVersionChanged` event with `{ groupId, entry }` payload
- `SessionTypes` `SessionEvents` interface gained `activeVersionChanged` event
- `Session` forwards the annotation event and wires a listener that calls `setCurrentSource(entry.sourceIndex)` when a version is activated

**Tests added**: 6 regression tests — 3 in `SessionAnnotations.test.ts` (SA-034 through SA-036) verifying event emission; 3 in `Session.state.test.ts` (SES-VER-001 through SES-VER-003) verifying actual source switching.

**Files changed**:
- `src/core/session/SessionAnnotations.ts`
- `src/core/session/SessionTypes.ts`
- `src/core/session/Session.ts`
- `src/core/session/SessionAnnotations.test.ts`
- `src/core/session/Session.state.test.ts`

## Issue #262: Mu compat active media-representation selection never changes what `sourceMedia()` or `sourceMediaInfo()` report

**Root cause**: `sourceMedia()` and `sourceMediaInfo()` always returned the base source's `mediaPaths`, ignoring the `activeRep` field even after `setActiveSourceMediaRep()` was called.

**Fix**: Already resolved via `_getActiveMediaPaths()` helper that checks `activeRep` and returns the matching representation's media paths (falling back to base paths). Both `sourceMedia()` and `sourceMediaInfo()` were updated to use this helper.

**Tests added**: 7 regression tests covering: base paths with no rep, rep paths after switching, auto-activated first rep, fallback for empty rep paths, and sourceMediaInfo reflecting the active rep.

**Files changed**:
- `src/compat/MuSourceBridge.ts` (previously fixed)
- `src/compat/__tests__/MuSourceBridge.test.ts`

## Issue #257: Mu compat playback-health commands are marked supported but only expose hardcoded or never-updated local state

**Root cause**: `skipped()`, `mbps()`, `isBuffering()`, `isCurrentFrameIncomplete()`, and `isCurrentFrameError()` all returned hardcoded or never-updated local state instead of querying the real playback engine.

**Fix**:
- `skipped()` now delegates to `playback.getDroppedFrameCount()` (real `PlaybackEngine.droppedFrameCount`)
- `isBuffering()` now delegates to `playback.isBuffering()` (real `PlaybackEngine.isBuffering`)
- `mbps()`/`resetMbps()`/`isCurrentFrameIncomplete()`/`isCurrentFrameError()` honestly marked as unsupported since the web engine doesn't track those metrics
- Added `isBuffering()` and `getDroppedFrameCount()` to `PlaybackAPI`

**Tests added**: Updated existing tests + added support status verification tests.

**Files changed**:
- `src/api/PlaybackAPI.ts`
- `src/compat/MuCommands.ts`
- `src/compat/__tests__/MuCommands.test.ts`

## Issue #395: `.rv` / `.gto` imports behave differently depending on whether users choose `Open media file` or `Open project`

**Root cause**: "Open media file" called `session.loadFromGTO()` directly, bypassing `AppPersistenceManager.openProject()` which creates a safety checkpoint and performs control resync.

**Fix**: "Open media file" now emits `openProject` event with `{ file, availableFiles }` for `.rv`/`.gto` files, routing through the same `AppPersistenceManager.openProject()` path. The event type was updated to carry optional companion files. `openProject()` gained an optional `availableFiles` parameter.

**Tests added**: 4 regression tests — 3 in `HeaderBar.test.ts` (HDR-U027 through HDR-U029) verifying `.rv`/`.gto` files emit `openProject` instead of direct `loadFromGTO`; 1 in `AppPersistenceManager.test.ts` (APM-088b) verifying `availableFiles` forwarding.

**Files changed**:
- `src/ui/components/layout/HeaderBar.ts`
- `src/AppPersistenceManager.ts`
- `src/AppPlaybackWiring.ts`
- `src/ui/components/layout/HeaderBar.test.ts`
- `src/AppPersistenceManager.test.ts`

## Issue #403: Mixed `.rvedl` plus `.rv` or `.gto` selections always load only the EDL and silently ignore the session file

**Root cause**: Both the file picker and drop handler checked for `.rvedl` before `.rv`/`.gto` and returned early after the EDL branch, silently dropping the session file.

**Fix**: Added mixed-selection detection in both ingest paths. When both `.rvedl` and `.rv`/`.gto` files are present, a warning alert is shown informing the user that the EDL was loaded and the session file was skipped.

**Tests added**: 2 regression tests — HDR-U030 in `HeaderBar.test.ts` verifying mixed selection loads EDL only; DROP-MIX-001 in `ViewerInputHandler.test.ts` verifying same for drag-and-drop.

**Files changed**:
- `src/ui/components/layout/HeaderBar.ts`
- `src/ui/components/ViewerInputHandler.ts`
- `src/ui/components/layout/HeaderBar.test.ts`
- `src/ui/components/ViewerInputHandler.test.ts`

## Issue #448: Cursor sharing is active in the collaboration stack, but the shipped sync-settings UI gives users no cursor toggle

**Root cause**: The sync-settings UI in `NetworkControl` only rendered checkboxes for `playback`, `view`, `color`, and `annotations`, omitting the `cursor` category despite it being defined in the sync model and enabled by default.

**Fix**: Added `{ key: 'cursor', label: 'Cursor' }` to the sync settings checkbox array in `NetworkControl`, following the exact same pattern as existing settings.

**Tests added**: 2 regression tests (NCC-030b, NCC-030c) verifying the cursor checkbox renders checked by default and toggles correctly.

**Files changed**:
- `src/ui/components/NetworkControl.ts`
- `src/ui/components/NetworkControl.test.ts`

## Issue #441: URL-based media loading cannot detect extensionless or routed video URLs and falls back to the image path

**Root cause**: Both `loadSourceFromUrl` and DCC `loadMedia` determined media type solely from file extension. URLs without recognizable extensions (e.g., CDN routes, signed URLs) were always treated as images.

**Fix**: Added `detectMediaTypeFromUrl()` in `SupportedMediaFormats.ts` that: (1) fast-returns for recognized extensions, (2) performs a HEAD request with 3s timeout to sniff Content-Type for extensionless URLs, (3) falls back to `'image'` on failure. Applied in DCC `loadMedia` and ShotGrid version loading.

**Tests added**: 25 tests in `SupportedMediaFormats.test.ts` covering extension extraction, MIME detection, HEAD request sniffing, network error fallback, and unrecognized content-type handling.

**Files changed**:
- `src/utils/media/SupportedMediaFormats.ts`
- `src/utils/media/SupportedMediaFormats.test.ts` (new)
- `src/AppDCCWiring.ts`
- `src/integrations/ShotGridIntegrationBridge.ts`

## Issue #393: The `Open media file` control is also a session and EDL importer, not just a media picker

**Root cause**: The header button was labeled "Open media file" but actually handles media, `.rv`/`.gto` sessions, and `.rvedl` EDLs — making the label misleading.

**Fix**: Renamed the button tooltip/aria-label from "Open media file" to "Open file". Updated e2e test selectors and documentation references.

**Files changed**:
- `src/ui/components/layout/HeaderBar.ts`
- `e2e/app-initialization.spec.ts`
- `e2e/header-bar-mobile-scroll.spec.ts`
- `features/drag-drop-loading.md`

## Issue #387: The RV/GTO companion-file resolution path is effectively unreachable from the shipped Open Project picker

**Root cause**: The project file input only accepted `.orvproject` files, making it impossible to multi-select `.rv`/`.gto` files alongside companion media/CDL sidecar files.

**Fix**: Expanded the project input's `accept` attribute to `SUPPORTED_PROJECT_ACCEPT` (includes project formats + all supported media extensions + `.cdl`). Enabled multi-select. Updated `handleProjectOpen` to separate the project file from companion files and pass them through the `openProject` event.

**Tests added**: Updated HDR-U024 to verify expanded accept attribute and multi-select. Updated HDR-U131 for new accept string.

**Files changed**:
- `src/utils/media/SupportedMediaFormats.ts`
- `src/ui/components/layout/HeaderBar.ts`
- `src/ui/components/layout/HeaderBar.test.ts`

## Issue #482: Safe area percentages mismatch

**Root cause**: Docs stated Action Safe 93% and Title Safe 90%, but the code used 90%/80%.

**Fix**: Updated `SafeAreasOverlay.ts` and `SafeAreasControl.ts` to use industry-standard SMPTE RP 2046-2:2018 percentages (Action Safe 93%, Title Safe 90%). Added 9 new regression tests.

**Files changed**: `src/ui/components/SafeAreasOverlay.ts`, `src/ui/components/SafeAreasControl.ts`

## Issue #490: Histogram docs claim GPU pixel analysis

**Root cause**: Docs said "Pixel analysis runs on the GPU" but analysis is CPU-based; only bar rendering uses GPU.

**Fix**: Updated `docs/scopes/histogram.md` to accurately describe CPU analysis with optional GPU rendering.

**Files changed**: `docs/scopes/histogram.md`

## Issue #456: Docs say Presentation Mode depends on Fullscreen API

**Root cause**: Browser-requirements page incorrectly listed Presentation Mode under Fullscreen API dependencies.

**Fix**: Removed incorrect dependency claim, clarified that fullscreen and presentation mode are separate features.

**Files changed**: `docs/getting-started/browser-requirements.md`

## Issue #453: FAQ claims files never leave machine

**Root cause**: FAQ said files "never leave the machine" but collaboration media sync can transmit them to other participants.

**Fix**: Updated FAQ to accurately disclose collaboration media sync behavior.

**Files changed**: `docs/reference/faq.md`

## Issue #452: FAQ claims all peer-to-peer collaboration

**Root cause**: FAQ said "No media passes through any server" but WebSocket fallback exists for state and media transfer.

**Fix**: Updated FAQ to describe the dual WebRTC/WebSocket transport model.

**Files changed**: `docs/reference/faq.md`

## Issue #461: Browser requirements overstate WebRTC as required

**Root cause**: Docs said WebRTC is "Required only for network sync features" but normal sync uses WebSocket.

**Fix**: Updated docs to describe WebRTC as an optional optimization, not a baseline requirement.

**Files changed**: `docs/getting-started/browser-requirements.md`

## Issue #459: Image-sequences guide incomplete FPS API

**Root cause**: Docs showed only `getFPS()` but not the real `getPlaybackFPS()`/`setPlaybackFPS()` setters.

**Fix**: Added correct API method names and examples to the image-sequences documentation.

**Files changed**: `docs/playback/image-sequences.md`

## Issue #388: Open Project picker allows multiple files

**Root cause**: Project input had `multiple=true` but only the first file was used; extra files were silently ignored.

**Fix**: Removed `multiple` attribute from the project file input. Added 1 new regression test.

**Files changed**: `src/ui/components/layout/HeaderBar.ts`, `src/ui/components/layout/HeaderBar.test.ts`

## Issue #401: Multi-select session import silently demotes extra .rv/.gto

**Root cause**: Extra `.rv`/`.gto` files in multi-select were silently added to the companion/sidecar map instead of being rejected or prompting the user.

**Fix**: Filter out extra session files from the companion map in both the file picker and drag-drop paths. Added 4 new regression tests.

**Files changed**: `src/ui/components/layout/HeaderBar.ts`, `src/ui/components/ViewerInputHandler.ts`

## Issue #335: Presentation mode lacks documented HUD

**Root cause**: Docs described a transient play/pause + frame counter HUD in presentation mode that does not exist in the shipped app.

**Fix**: Removed false HUD claim from `docs/advanced/review-workflow.md`, kept accurate description of actual presentation mode features.

**Files changed**: `docs/advanced/review-workflow.md`

## Issue #501: The file-format guide advertises `.ico` support, but the shipped supported-format lists and picker accept string do not include it

**Root cause**: `SUPPORTED_IMAGE_EXTENSIONS` in `SupportedMediaFormats.ts` did not include `ico`, so the extension-based classifier, file picker accept string, and all downstream consumers rejected `.ico` files.

**Fix**: Added `'ico'` to `SUPPORTED_IMAGE_EXTENSIONS`, which automatically propagates to `IMAGE_EXTENSION_SET`, `ALL_KNOWN_EXTENSIONS`, and `SUPPORTED_MEDIA_ACCEPT`.

**Tests added**: 5 regression tests verifying `.ico` detection from extension, MIME type, presence in extension list, presence in accept string, and `detectMediaTypeFromFile` classification.

**Files changed**: `src/utils/media/SupportedMediaFormats.ts`, `src/utils/media/SupportedMediaFormats.test.ts`

## Issue #502: The JPEG gainmap guide documents the wrong HDR reconstruction formula for the shipped decoder

**Root cause**: The docs described `hdr = sdr_linear * (1 + gainMap * headroom)` (multiplicative), but the shipped decoder implements the ISO 21496-1 exponential model `HDR_linear = sRGB_to_linear(base) * exp2(gainmap * headroom)`.

**Fix**: Corrected the formula in `docs/guides/file-formats.md` to match the actual implementation.

**Files changed**: `docs/guides/file-formats.md`

## Issue #514: The image-sequence workflow only recognizes a narrow legacy extension subset, even though the docs say sequences can use any supported image format

**Root cause**: `IMAGE_EXTENSIONS` in `SequenceLoader.ts` was a hardcoded set of only 12 legacy extensions, while `SupportedMediaFormats.ts` defines 33 supported image extensions. Formats like AVIF, HEIC, JXL, JP2, HDR were excluded from sequence detection.

**Fix**: Replaced the hardcoded `IMAGE_EXTENSIONS` set with `new Set<string>(SUPPORTED_IMAGE_EXTENSIONS)`, deriving from the single source of truth in `SupportedMediaFormats.ts`.

**Tests added**: 4 regression tests covering JXL/JP2/AVIF/HEIC acceptance, HDR/ICO/SVG/PIC/SXR/RAW acceptance, sequence discovery with new extensions, and non-image rejection.

**Files changed**: `src/utils/media/SequenceLoader.ts`, `src/utils/media/SequenceLoader.test.ts`

## Issue #516: Sequence loads collapse the numeric frame range down to `frames.length`, so missing-frame positions are not preserved as real timeline frames

**Root cause**: Both `SessionMedia.loadSequence()` and `MediaManager.loadSequence()` set source duration/out-point to `sequenceInfo.frames.length` (count of actual files) instead of the numeric frame range (`endFrame - startFrame + 1`). Frame lookups used direct array indexing which only worked for dense sequences.

**Fix**: Added `buildFrameNumberMap()` for O(1) frame lookups by frame number, and `getSequenceFrameRange()` to compute the correct numeric range. Updated `SessionMedia`, `MediaManager`, `Viewer`, and `ViewerExport` to use the frame number map and correct range for duration. A gapped sequence like 1001, 1002, 1004 now correctly becomes a 4-frame timeline with frame 1003 as a missing-frame slot.

**Tests added**: 7 regression tests for `buildFrameNumberMap` and `getSequenceFrameRange`, plus integration test verifying gapped sequence duration and frame lookup.

**Files changed**: `src/utils/media/SequenceLoader.ts`, `src/core/session/SessionTypes.ts`, `src/core/session/SessionMedia.ts`, `src/core/session/MediaManager.ts`, `src/ui/components/Viewer.ts`, `src/ui/components/ViewerExport.ts`, `src/utils/media/SequenceLoader.test.ts`, `src/core/session/Session.media.test.ts`, `src/core/session/SessionMedia.test.ts`, `src/core/session/MediaManager.test.ts`, `src/ui/components/Viewer.render.test.ts`, `src/ui/components/ViewerExport.test.ts`

## Issue #506: The top-level file-format reference presents HEIC/HEIF as a pure WASM decode path, but the shipped runtime uses native Safari decode first and WASM only as fallback

**Root cause**: The format reference table labeled HEIC/HEIF decoder as just "libheif WASM", omitting that Safari uses native decode with WASM as fallback only on other browsers.

**Fix**: Updated the decoder column from "libheif WASM" to "Native (Safari) / libheif WASM (other browsers)".

**Files changed**: `docs/reference/file-formats.md`

## Issue #511: The EXR docs still describe a WASM / compiled OpenEXR decoder, but the shipped `EXRDecoder.ts` is a pure TypeScript implementation

**Root cause**: Docs described EXR as using a "WebAssembly-compiled OpenEXR library" and labeled it "WASM decoder", but the actual implementation is a pure TypeScript EXR parser with TypeScript codec modules (EXRPIZCodec.ts, EXRDWACodec.ts).

**Fix**: Updated `docs/guides/file-formats.md` to say "Pure TypeScript EXR parser" and `docs/reference/file-formats.md` to say "TypeScript decoder".

**Files changed**: `docs/guides/file-formats.md`, `docs/reference/file-formats.md`

## Issue #340: The session-management guide describes the History panel as snapshot/autosave recovery, but the shipped panel is only undo/redo action history

**Root cause**: Docs described the History Panel as providing "a unified view of both manual snapshots and auto-save entries" with filtering and restore, but the shipped `HistoryPanel` is an undo/redo action history viewer built on `HistoryManager`.

**Fix**: Updated `docs/advanced/session-management.md` to accurately describe the History Panel as an undo/redo action history panel and directs users to the Snapshot Panel for snapshot/auto-save recovery.

**Files changed**: `docs/advanced/session-management.md`

## Issue #352: The overlays guide relies on a non-existent `Overlays` submenu and a non-existent `Clear All Overlays` action

**Root cause**: Docs referenced an "Overlays menu" and "Clear All Overlays" action that don't exist. The actual overlay controls are individual toggle buttons in the View tab toolbar and watermark in the Effects tab.

**Fix**: Replaced all references to the non-existent "Overlays menu" with accurate descriptions of the individual toggle buttons in the View tab toolbar, and removed the "Clear All Overlays" claim.

**Files changed**: `docs/advanced/overlays.md`

## Issue #355: The overlays guide documents a tiled text watermark system, but the shipped watermark is only a single positioned image overlay

**Root cause**: Docs described the watermark as tiling "a text string or image across the entire frame" with text, rotation, and color controls. The shipped `WatermarkOverlay` is a single positioned image overlay with image upload, position, scale, opacity, and margin controls.

**Fix**: Updated the watermark section to accurately describe the single positioned image overlay with its actual controls.

**Files changed**: `docs/advanced/overlays.md`

## Issue #354: The overlays guide documents a viewer note overlay, but production `NoteOverlay` is only a timeline note-bar helper

**Root cause**: Docs described a bottom-of-viewer note panel with frame text, authors, stacked notes, and navigation arrows. The shipped `NoteOverlay` draws colored bars on the timeline canvas to indicate frame ranges with notes.

**Fix**: Updated the note overlay section to accurately describe timeline-canvas colored bars filtered by source and note status, not a viewer-level text panel.

**Files changed**: `docs/advanced/overlays.md`

## Issue #527: Sequence-style media representations can never use SequenceRepresentationLoader because the live switch path never passes the isSequence flag

**Root cause**: `MediaRepresentationManager.switchRepresentation()` called `createRepresentationLoader(representation.kind, hdrResizeTier)` without the third `isSequence` parameter, so it always defaulted to `false`. This meant any `frames`-kind representation on a sequence source would incorrectly receive `FileRepresentationLoader` (which expects a single file) instead of `SequenceRepresentationLoader` (which handles multi-file sequences).

**Fix**: Added `isSequenceSource(sourceIndex: number): boolean` to the `RepresentationSourceAccessor` interface. The `SessionMedia` accessor wiring implements it by checking `source?.type === 'sequence'`. The `switchRepresentation` method now queries this before calling the factory, passing the result as the third argument.

**Tests added**: 3 regression tests in `MediaRepresentationManager.test.ts`:
- Verifies `isSequence=true` is passed for sequence sources
- Verifies `isSequence=false` is passed for non-sequence sources
- Full integration path with sequence source switching from `movie` to `frames` representation

**Files changed**:
- `src/core/session/MediaRepresentationManager.ts`
- `src/core/session/SessionMedia.ts`
- `src/core/session/MediaRepresentationManager.test.ts`

## Issue #376: Auto-checkpoints are documented as broad safety nets before major operations, but production only creates them for restore and project-load flows

**Root cause**: `AppPersistenceManager.createAutoCheckpoint()` was only called before snapshot restore and project/session load. No other destructive operations (media loading, clearing annotations, clearing sources) triggered checkpoints, despite documentation stating they would.

**Fix**: Added three new checkpoint methods to `AppPersistenceManager`:
- `checkpointBeforeMediaLoad()` — creates checkpoint when session already has sources (guards on `session.allSources.length > 0`)
- `checkpointBeforeClearAnnotations()` — creates checkpoint when annotations exist (guards on `paintEngine.getAnnotatedFrames().size > 0`)
- `checkpointBeforeClearSources()` — creates checkpoint when sources exist

Wired these into: viewer drag-and-drop media loading (`ViewerInputHandler`), annotation import in replace mode (`AppPlaybackWiring`), and `MediaAPI.clearSources()`.

**Tests added**: 10 regression tests in `AppPersistenceManager.issue376.test.ts` covering all three methods, including guard logic and error resilience.

**Files changed**:
- `src/AppPersistenceManager.ts`
- `src/ui/components/ViewerInputHandler.ts`
- `src/ui/components/Viewer.ts`
- `src/AppPlaybackWiring.ts`
- `src/api/MediaAPI.ts`
- `src/api/OpenRVAPI.ts`
- `src/App.ts`
- `src/AppPlaybackWiring.test.ts`
- `src/AppPersistenceManager.issue376.test.ts` (new)

## Issue #346: The accessibility overview overclaims live announcements for frame navigation and tool selection

**Root cause**: The `AriaAnnouncer` wiring in `LayoutOrchestrator` only announced tab changes, file loads, playback start/pause, and speed changes. Frame navigation and tool selection announcements were missing despite being documented as supported.

**Fix**: Added ARIA announcements in `KeyboardActionMap.ts` at the keyboard action handler level (not session events), ensuring they only fire for user-initiated discrete navigation, not during continuous playback:
- **Frame navigation**: stepForward/backward, goToStart/End, mark/boundary/shot navigation, annotation next/prev, notes next/prev — all announce the current frame number
- **Tool selection**: All 8 paint tools (pan, pen, eraser, text, rectangle, ellipse, line, arrow) plus 3 context-sensitive tool activations — announce tool name

**Tests added**: 26 regression tests in `KeyboardActionMap.test.ts` covering frame announcements for all navigation actions, tool selection announcements for all paint tools, and null-announcer safety.

**Files changed**:
- `src/services/KeyboardActionMap.ts`
- `src/services/KeyboardActionMap.test.ts`

## Issue #449: Remote cursor sync is transported and tracked, but the shipped app never renders or consumes it

**Root cause**: `NetworkSyncManager` handled incoming `sync.cursor` messages, sanitized and stored them in `_remoteCursors`, and emitted `syncCursor` events, but no production code subscribed to render them. The FAQ claimed collaboration syncs cursor position.

**Fix**: Created `RemoteCursorsOverlay` — a DOM-based overlay component that renders colored cursor indicators for each remote participant on the viewer canvas. Features:
- SVG cursor arrows colored with participant's assigned color, plus name labels
- Normalized 0-1 coordinate mapping to viewer display pixels
- Fade at 5s of inactivity, full removal at 7s
- Color sanitization (hex-only regex) and XSS-safe name rendering (textContent)
- Activated/deactivated based on collaboration connection state

Wired into `AppNetworkBridge` (subscribes to syncCursor, usersChanged, userLeft, connection events) and `App.ts` (creates, mounts, resizes, disposes overlay).

**Tests added**: 28 regression tests in `RemoteCursorsOverlay.test.ts` covering activation, cursor rendering, coordinate mapping, fade/hide timing, disconnect behavior, user info updates, disposal, and color sanitization.

**Files changed**:
- `src/ui/components/RemoteCursorsOverlay.ts` (new)
- `src/ui/components/RemoteCursorsOverlay.test.ts` (new)
- `src/AppNetworkBridge.ts`
- `src/App.ts`

## Issue #334: Comparison annotations are tied to the A/B slot, not to the underlying source they were drawn on

**Root cause**: The paint annotation model had no source identity field — only `version?: 'A' | 'B' | 'all'`. Annotations were created and filtered based on the A/B slot, so when users reassigned sources to different slots, annotations followed the slot rather than the original source.

**Fix**: Added `sourceIndex?: number` field to all annotation types (`PenStroke`, `TextAnnotation`, `ShapeAnnotation`). When creating annotations during A/B compare mode, the actual source index (from `ABCompareManager`) is recorded. Display filtering now prefers matching by `sourceIndex` when available, falling back to `version` tag for legacy annotations without `sourceIndex`. Backward compatible — old annotations without `sourceIndex` continue to work via version-based filtering.

**Tests added**: 12 regression tests (COMP-008a through COMP-008l) covering source index stamping on all annotation types, source-following after A/B swap, backward compatibility, `all`-version annotations, ghost mode filtering, and serialization roundtrip.

**Files changed**:
- `src/paint/types.ts`
- `src/paint/PaintEngine.ts`
- `src/services/LayoutOrchestrator.ts`
- `src/ui/components/Viewer.ts`
- `src/paint/ComparisonAnnotations.test.ts`

## Issue #429: Share links claim to share comparison state, but clean recipients can only reconstruct one media source

**Root cause**: `SessionURLState` carried only a single `sourceUrl` field. Capture only saved `session.currentSource?.url`. On the receiving end, at most one URL was loaded before restoring compare state, making A/B comparison reconstruction impossible since it requires at least two sources.

**Fix**: Added `sourceUrls?: string[]` to `SessionURLState` (compact key `sus`). Capture now collects all source URLs when multiple sources are loaded. Apply loads all sources sequentially before restoring compare state, with `findSourceIndexByUrl` to skip already-loaded sources. Backward compatible — old single-`sourceUrl` links still work via fallback path.

**Tests added**: 13 regression tests across `SessionURLManager.test.ts` (5 encoding tests) and `SessionURLService.test.ts` (8 capture/apply tests) covering multi-source round-trip, empty arrays, backward compatibility, already-loaded deduplication, and full capture-encode-decode-apply A/B reconstruction.

**Files changed**:
- `src/core/session/SessionURLManager.ts`
- `src/services/SessionURLService.ts`
- `src/core/session/SessionURLManager.test.ts`
- `src/services/SessionURLService.test.ts`

## Issue #521: `.orvproject` still serializes `sequencePattern` and `frameRange` for sequences, but the restore path never consumes them

**Root cause**: `SessionSerializer.fromJSON()` wrote sequence metadata to project files but the restore path for `ref.type === 'sequence'` only emitted a warning message and silently dropped the source entry. The serialized `sequencePattern` and `frameRange` were never consumed.

**Fix**: Updated both sequence restore paths (requiresReload and non-requiresReload) to create placeholder sources via `createSequencePlaceholder()` that preserve name, dimensions, frame range, pattern, and fps. Placeholders have empty frames (user must re-select files for pixel data). Warning messages now include pattern and frame range via `formatSequenceDetail()` so users know what files to locate.

**Tests added**: 5 regression tests (SER-SEQ-001 through SER-SEQ-005) covering metadata roundtrip, placeholder frame range/pattern preservation, backward compatibility, failed reload fallback, and non-requiresReload placeholder creation.

**Files changed**:
- `src/core/session/SessionSerializer.ts`
- `src/core/session/Session.ts`
- `src/core/session/SessionSerializer.test.ts`

## Issue #440: URL-based media loading bypasses the app's decoder stack and breaks remote EXR or other decoder-backed images

**Root cause**: `Session.loadSourceFromUrl()` classified URLs as "video extension" vs "everything else" and routed all non-video URLs through `loadImage()` which uses a plain `HTMLImageElement`. This bypassed the `FileSourceNode` decoder pipeline, breaking remote EXR, DPX, TIFF, HDR, JXL, HEIC, JP2, and RAW-preview formats.

**Fix**: Added a third routing branch in `loadSourceFromUrl()` for decoder-backed format extensions. When the URL matches a decoder-backed format (EXR, DPX, Cineon, HDR, TIFF, JXL, HEIC, JP2, RAW, etc.), the URL is fetched as a `File` object via `fetchUrlAsFile()` and routed through `loadImageFile()` (the FileSourceNode pipeline). Browser-native formats (PNG, JPEG, GIF, WebP, plain AVIF) still use the fast `HTMLImageElement` path. Video URLs still use `loadVideo()`.

**Tests added**: 42 tests across `Session.loadSourceFromUrl.test.ts` (38 tests: decoder-backed routing, browser-native fast path, video routing, error handling) and `fetchUrlAsFile.test.ts` (4 tests: File creation, MIME, HTTP/network errors).

**Files changed**:
- `src/core/session/Session.ts`
- `src/utils/media/SupportedMediaFormats.ts`
- `src/utils/media/fetchUrlAsFile.ts` (new)
- `src/utils/media/fetchUrlAsFile.test.ts` (new)
- `src/core/session/Session.loadSourceFromUrl.test.ts`

## Issue #515: The sequence-loading path bypasses the custom decoder stack and decodes frames with createImageBitmap(), so documented EXR/DPX/Cineon/HDR sequence workflows are not actually backed by the pro-format loaders

**Root cause**: `SequenceLoader.loadFrameImage()` always used `createImageBitmap(frame.file)` for all formats, bypassing the decoder registry (`decodeEXR`, `decodeDPX`, etc.). Professional format sequences were either decoded as browser-native (incorrect output) or failed silently.

**Fix**: Updated `loadFrameImage()` to check file extensions via `isDecoderBackedExtension()`. For decoder-backed formats (EXR, DPX, Cineon, HDR, TIFF, JXL, HEIC, JP2, RAW), the file is read as ArrayBuffer and routed through `decoderRegistry.detectAndDecode()`. The full-precision Float32Array result is stored in a new `decodedData` field on `SequenceFrame`, preserving HDR data for the render pipeline. `SequenceSourceNode.process()` creates float32 `IPImage` objects from decoded data, enabling the full HDR shader chain (EOTF, tone mapping, exposure). Browser-native formats (PNG, JPEG, GIF, WebP) continue using `createImageBitmap()`.

**Tests added**: 16 new tests covering decoder routing (EXR, DPX, Cineon, HDR, browser-native bypass), `decodedData` preservation, `float32ToImageBitmap` conversion, abort signal handling at all checkpoints, `isFrameLoaded()`, and cleanup.

**Files changed**:
- `src/utils/media/SequenceLoader.ts`
- `src/nodes/sources/SequenceSourceNode.ts`
- `src/utils/media/SequenceLoader.test.ts`

## Issue #345: Multi-view EXR and alternate stereo-input workflows are documented as integrated, but production hardcodes side-by-side stereo

**Root cause**: `Viewer.getStereoPair()` hardcoded `'side-by-side'` as the stereo input format. `StereoManager` called renderer helpers without any input format argument. The `MultiViewEXR` parser existed but had no production consumer. Multi-view EXR files with left/right views were decoded as single-view only.

**Fix**: 
1. **Detection**: `FileSourceNode.loadEXRFromBuffer()` now detects multi-view EXR files with left/right views and sets `stereoInputFormat` to `'separate'`
2. **Right-eye decoding**: When multi-view is detected, both left and right views are decoded. Right-eye data is stored as `cachedIPImage.rightEyeImage` (new `rightEyeImage` field on `IPImage`)
3. **Format propagation**: `Viewer.renderImage()` syncs stereo input format from source metadata into `StereoManager`. `getStereoPair()` reads from `StereoManager.getStereoInputFormat()` instead of hardcoding
4. **Rendering**: `StereoRenderer.extractStereoEyes()` accepts optional `rightEyeImageData` parameter. For `'separate'` format, uses actual right-eye data to produce genuine stereo disparity
5. **Backward compatible**: Default remains `'side-by-side'` for non-multi-view sources

**Tests added**: 28 regression tests across `StereoManager.inputFormat.test.ts` (11 tests) and `StereoInputFormat.test.ts` (17 tests) covering format detection, propagation, backward compat, separate-eye rendering with distinct left/right data, eye swap, and fallback behavior.

**Files changed**:
- `src/core/session/SessionTypes.ts`
- `src/core/image/Image.ts`
- `src/nodes/sources/FileSourceNode.ts`
- `src/ui/components/StereoManager.ts`
- `src/ui/components/Viewer.ts`
- `src/stereo/StereoRenderer.ts`
- `src/ui/components/StereoManager.inputFormat.test.ts` (new)
- `src/stereo/StereoInputFormat.test.ts` (new)

## Issue #529: The representation system still advertises a `streaming` kind, but the live loader factory throws for it

**Root cause**: `RepresentationKind` type union included `'streaming'` as a valid variant, and `getDefaultPriority()` assigned it priority 3. However, `RepresentationLoaderFactory` threw "Streaming representations are not yet supported" for this kind, making it accepted by the type system but rejected at runtime.

**Fix**: Removed `'streaming'` from the `RepresentationKind` type union entirely since it was never implemented. Cleaned up `getDefaultPriority()` to no longer include the dead case. Removed the throw branch from `RepresentationLoaderFactory` and added an exhaustive `default: never` guard so any future unhandled kind causes a compile-time error.

**Tests added**: 4 regression tests:
- `representation.test.ts`: 3 tests verifying only implemented kinds exist, `'streaming'` is rejected by TypeScript, and all valid kinds have distinct priorities
- `RepresentationLoaderFactory.test.ts`: 1 test verifying all valid kinds produce a loader without throwing

**Files changed**:
- `src/core/types/representation.ts`
- `src/core/session/loaders/RepresentationLoaderFactory.ts`
- `src/core/types/representation.test.ts`
- `src/core/session/loaders/RepresentationLoaderFactory.test.ts`

## Issue #532: Representation-level `opfsCacheKey` is serialized and tested, but no live representation loader or restore path ever uses it

**Root cause**: `RepresentationLoaderConfig` included an `opfsCacheKey` field documented as providing "resilience against File reference invalidation." However, no representation loader (`FileRepresentationLoader`, `VideoRepresentationLoader`) or restore path (`SessionSerializer.fromJSON`) ever read it. The top-level `MediaSource.opfsCacheKey` is a separate, working mechanism and was not affected.

**Fix**: Removed `opfsCacheKey` from `RepresentationLoaderConfig` and `SerializedRepresentation` types since no loader or restore path consumed it.

**Tests added**: 3 regression tests verifying `createRepresentation()`, `serializeRepresentation()`, and round-trip serialize/deserialize do not carry `opfsCacheKey` in `loaderConfig`.

**Files changed**:
- `src/core/types/representation.ts`
- `src/core/types/representation.test.ts`


## Issue #258: Mu compat media-representation node APIs return fabricated node names that are never created in a real graph

**Root cause**: `addSourceMediaRep()` synthesized fake node names like `${sourceName}_${repName}_source` and stored them in representation records regardless of whether a graph was attached. Query APIs then returned these unresolvable names, misleading callers.

**Fix**: Made node name generation conditional on graph availability. When no graph is attached, node names are empty strings. When a graph IS present, real `MediaRepNode` objects are created and their names are stored.

**Tests added**: 7 regression tests verifying empty node names without a graph, preserved metadata, and real resolvable node names with a graph.

**Files changed**:
- `src/compat/MuSourceBridge.ts`
- `src/compat/__tests__/MuSourceBridge.test.ts`

## Issue #326: The published DCC inbound command set overstates what the bridge actually understands

**Root cause**: The DCC integration guide documented inbound commands `load`, `seek`, `setFrameRange`, `setMetadata`, `setColorSpace` that don't exist in the actual protocol. The real bridge only supports `loadMedia`, `syncFrame`, `syncColor`, and `ping`. Outbound docs also listed `annotationCreated` (wrong name) and `statusChanged` (doesn't exist).

**Fix**: Updated `docs/advanced/dcc-integration.md` to accurately reflect the actual protocol types, schemas, and field names from `DCCBridge.ts`.

**Tests added**: 2 regression tests in `DCCBridge.test.ts` verifying all documented inbound types are accepted and the old/wrong types are rejected with `UNKNOWN_TYPE`.

**Files changed**:
- `docs/advanced/dcc-integration.md`
- `src/integrations/DCCBridge.test.ts`

## Issue #327: DCC status roundtrip is documented, but the shipped bridge has no `statusChanged` message path

**Root cause**: The DCC integration guide documented an outbound `statusChanged` message type that doesn't exist in the protocol. The actual outbound types are `frameChanged`, `colorChanged`, `annotationAdded`, `pong`, and `error`.

**Fix**: The docs were already corrected as part of Issue #326. Added 2 regression tests explicitly verifying `statusChanged` is not part of the inbound or outbound protocol.

**Tests added**: 2 regression tests in `DCCBridge.test.ts` verifying `statusChanged` is excluded from both inbound and outbound message type sets.

**Files changed**:
- `src/integrations/DCCBridge.test.ts`

## Issue #324: The ShotGrid panel does not support the advertised "paste a version URL" workflow

**Root cause**: The ShotGrid panel only accepted plain numeric IDs and supported two query modes (playlist, shot). ShotGrid URLs were rejected as invalid input, and there was no `version` query mode.

**Fix**: Added `parseShotGridInput()` that extracts entity type and ID from ShotGrid URLs (`/detail/Version/12345` and `#Version_12345` patterns). Added `version` query mode. Auto-detects entity type from pasted URLs. Plain numeric IDs remain backward compatible. Added `getVersionById()` to `ShotGridBridge` and wired the `loadVersionById` event through `ShotGridIntegrationBridge`.

**Tests added**: 19 tests — 8 panel integration tests (mode cycling, URL paste, auto-detection, backward compat) + 11 `parseShotGridInput` unit tests.

**Files changed**:
- `src/ui/components/ShotGridPanel.ts`
- `src/integrations/ShotGridBridge.ts`
- `src/integrations/ShotGridIntegrationBridge.ts`
- `src/ui/components/ShotGridPanel.test.ts`

## Issue #547: The public scripting event surface exposes representation failures, but not successful representation changes or fallbacks

**Root cause**: The public EventsAPI only bridged `representationError` from the internal session, leaving `representationChanged` and `fallbackActivated` invisible to external consumers.

**Fix**: Already integrated in prior work. `EventsAPI` now bridges both `representationChanged` and `fallbackActivated` events from the internal session to the public API with proper payload transformation (lines 391-422 of EventsAPI.ts). Event types are defined in `OpenRVEventName` and `OpenRVEventData`.

**Files**: `src/api/EventsAPI.ts` (already complete)

## Issue #322: ShotGrid version loading never feeds the app's own version-management system

**Root cause**: When ShotGrid versions were loaded, the integration bridge only stored panel-local `versionId → sourceIndex` mappings and applied status. It never called `session.versionManager` to create version groups, so version navigation, grouping, and report features were disconnected from ShotGrid.

**Fix**: Integrated ShotGrid version loading with VersionManager. After successfully loading a version, `registerVersionInManager()` now creates or finds a version group using the shot entity name as group key, adds the version with its ShotGrid code as label, and stores ShotGrid metadata. Multiple versions of the same shot are automatically grouped together. Includes a defensive null check on `versionManager`.

**Tests added**: 4 regression tests (SG-INT-023 through SG-INT-026) verifying single version creates group, multiple versions of same shot are grouped, labels match ShotGrid data, different shots create separate groups.

**Files changed**:
- `src/integrations/ShotGridIntegrationBridge.ts`
- `src/integrations/ShotGridIntegrationBridge.test.ts`

## Issue #519: ShotGrid frame-sequence paths are still routed through `session.loadImage(...)`, so `shot.####.exr` is treated like a single image URL instead of a sequence

**Root cause**: When ShotGrid provided `sg_path_to_frames` with a sequence pattern like `/renders/shot.####.exr`, the integration bridge detected it and logged it, but still routed it through `session.loadImage()` which created a single-frame source with `duration: 1`.

**Fix**: Integrated the existing sequence loading infrastructure with the ShotGrid loading path:
- Added `isSequencePattern()` to detect `####`/`%04d`/`@@@@` patterns in URLs
- Added `expandPatternToURLs()` to generate concrete frame URLs from patterns
- Added `loadImageSequenceFromPattern()` to `SessionMedia`/`Session` to load a URL-pattern-based sequence with proper frame count and timeline duration
- Updated `ShotGridIntegrationBridge` to route sequence patterns through the new method, using `sg_first_frame`/`sg_last_frame` or `frame_range` for bounds
- Added URL-based frame loading support in `getSequenceFrameImage()`

**Tests added**: 17 new tests — 6 bridge regression tests (SG-INT-027 through SG-INT-032) covering all pattern types, frame range fallback, non-sequence fallback, and VersionManager registration; 11 SequenceLoader unit tests for `isSequencePattern`, `expandPatternToURLs`, and `loadFrameImageFromURL`.

**Files changed**:
- `src/utils/media/SequenceLoader.ts`
- `src/utils/media/SequenceLoader.test.ts`
- `src/core/session/SessionMedia.ts`
- `src/core/session/Session.ts`
- `src/integrations/ShotGridIntegrationBridge.ts`
- `src/integrations/ShotGridIntegrationBridge.test.ts`

## Issue #308: Collaboration permission roles affect sync behavior, but the shipped UI never reflects or enforces them locally

**Root cause**: `NetworkSyncManager` tracked participant roles and emitted `participantPermissionChanged` events, but `NetworkControl` never subscribed to them. The UI only showed a `Host` badge. Users downgraded to `viewer` would silently stop syncing with no visual indication.

**Fix**: Integrated the permission system into the collaboration UI:
- Added role badges (Reviewer/Viewer) next to each participant in the user list
- Added "Your role: X" indicator in the connected panel
- Added "View Only" warning banner when the current user has `viewer` role (sync output disabled)
- Wired `participantPermissionChanged` from `NetworkSyncManager` through `AppNetworkBridge` to `NetworkControl`
- Permissions clear automatically on disconnect

**Tests added**: 14 regression tests (NCC-100 through NCC-113) covering role badges, role indicator, view-only banner, dynamic permission changes, bulk set, and cleanup on disconnect.

**Files changed**:
- `src/ui/components/NetworkControl.ts`
- `src/ui/components/NetworkControl.test.ts`
- `src/AppNetworkBridge.ts`

## Issue #539: Video representations lose HTMLVideoElement and audio wiring

**Root cause**: `applyRepresentationShim` in SessionMedia.ts only set `source.videoSourceNode` and `source.type = 'video'` for video representations, without creating an HTMLVideoElement or wiring audio. Large parts of playback and export branch on `source.element instanceof HTMLVideoElement`.

**Fix**: Added HTMLVideoElement creation, `initVideoPreservesPitch`, and `loadAudioFromVideo` calls inside the VideoSourceNode branch of `applyRepresentationShim`, matching the normal video load path.

**Tests added**: 5 regression tests (SM-107 through SM-111) covering video element creation, pitch preservation, audio wiring, URL fallback, and non-video representation verification.

**Files changed**:
- `src/core/session/SessionMedia.ts`
- `src/core/session/SessionMedia.test.ts`

## Issue #556: Generated API reference has dead links and stale commit hashes

**Root cause**: `docs/api/index.md` linked to non-existent `classes/*.md` and `interfaces/*.md` pages, and all "Defined in" source links pointed to a stale commit hash.

**Fix**: Replaced broken links with inline descriptions. Updated all commit hashes to current HEAD. Corrected OpenRVEventName listing to match actual 13-event API surface.

**Files changed**:
- `docs/api/index.md`

## Issue #561: Plugin settings accessor throws for schema-less plugins

**Root cause**: `PluginRegistry.createContext()` always injected a settings accessor, even for plugins without `settingsSchema`. The accessor's `set()` would throw "No settings schema registered" at runtime.

**Fix**: Added `createNoopAccessor()` to PluginSettingsStore that returns a safe no-op accessor (warns on set instead of throwing). `createContext()` now checks for `settingsSchema` and uses the noop accessor when absent.

**Tests added**: 5 regression tests (PSET-160 through PSET-164) covering noop get, getAll, set warning, onChange, and reset.

**Files changed**:
- `src/plugin/PluginSettingsStore.ts`
- `src/plugin/PluginRegistry.ts`
- `src/plugin/PluginSettingsStore.test.ts`

## Issue #470: OTIO import collapses editorial structure into plain clip list

**Root cause**: `PlaylistManager.fromOTIO()` used the single-track `parseOTIO()` helper which returned only clips, dropping transitions, gaps, markers, and metadata.

**Fix**: Rewired `fromOTIO()` to use `parseOTIOMultiTrack()` with single-track fallback. Added gap tracking, marker parsing, and transition wiring to TransitionManager. Editorial structure is preserved in `lastOTIOImportResult`.

**Tests added**: 19 regression tests in PlaylistManager.issue470.test.ts plus 8 new parser tests (OTIO-M027 through OTIO-M034).

**Files changed**:
- `src/utils/media/OTIOParser.ts`
- `src/utils/media/OTIOParser.test.ts`
- `src/core/session/PlaylistManager.ts`
- `src/core/session/PlaylistManager.issue470.test.ts` (new)

## Issue #313: Shot status tracking has no UI

**Root cause**: `StatusManager` was fully implemented but never wired to any UI. No header badge, no status selector.

**Fix**: Created `ShotStatusBadge` component with colored dot + label, dropdown selector for all 8 status values, wired to `session.statusManager.setStatus()`. Mounted in HeaderBar next to source name.

**Tests added**: 26 regression tests covering rendering, status display, StatusManager integration, source tracking, and disposal.

**Files changed**:
- `src/ui/components/ShotStatusBadge.ts` (new)
- `src/ui/components/ShotStatusBadge.test.ts` (new)
- `src/ui/components/layout/HeaderBar.ts`

## Issue #316: Review notes missing priority and category fields

**Root cause**: Note model only stored text, author, frame range, status, reply parent, and color. No priority or category support.

**Fix**: Added `NotePriority` type and `priority`/`category` fields to Note model. Updated NotePanel with color-coded priority badges and category tags. Updated ReportExporter with category-based statistics. Restored `externalId` field for ShotGrid integration.

**Tests added**: 19 new tests across NoteManager, NotePanel, and ReportExporter.

**Files changed**:
- `src/core/session/NoteManager.ts`
- `src/core/session/NoteManager.test.ts`
- `src/ui/components/NotePanel.ts`
- `src/ui/components/NotePanel.test.ts`
- `src/ui/components/NotePanel.e2e.test.ts`
- `src/export/ReportExporter.ts`
- `src/export/ReportExporter.test.ts`
- `src/core/session/GTOGraphLoader.ts`

## Issue #543: Representation subsystem unwired in shipped app

**Root cause**: No production UI, app-shell, or public API caller for representation management. Only reachable through session restore.

**Fix**: Created `RepresentationSelector` dropdown in header bar. Added `getRepresentations()`, `getActiveRepresentation()`, and `switchRepresentation()` to MediaAPI. Exported `RepresentationInfo` type.

**Tests added**: 16 regression tests for RepresentationSelector UI.

**Files changed**:
- `src/ui/components/RepresentationSelector.ts` (new)
- `src/ui/components/RepresentationSelector.test.ts` (new)
- `src/api/MediaAPI.ts`
- `src/api/index.ts`
- `src/ui/components/layout/HeaderBar.ts`

## Issue #307: FrameCacheController never instantiated in production

**Root cause**: `FrameCacheController` was fully implemented with region/lookahead modes, memory-pressure management, and pre-roll warm-up, but no production code ever called `new FrameCacheController(...)`. The shipped app only used the simpler passive `CacheIndicator`.

**Fix**: Instantiated `FrameCacheController` in `App.ts` with adaptive memory budget from `detectDefaultBudget()`. Wired session `frameChanged`, `playbackChanged`, and `sourceLoaded` events to the cache controller. Added `Shift+C` keyboard shortcut for cache mode cycling. Passed controller to `buildActionHandlers()`.

**Tests added**: 28 regression tests (FCCI-001 through FCCI-028) covering instantiation, cache mode cycling, session integration, memory pressure, visibility handling, multi-source budgets, and lifecycle.

**Files changed**:
- `src/App.ts`
- `src/utils/input/KeyBindings.ts`
- `src/cache/FrameCacheControllerIntegration.test.ts` (new)

## Issue #314: Version management not wired to UI or auto-detection

**Root cause**: `VersionManager` implemented grouping, navigation, and auto-detection, but `autoDetectGroups()` had no production caller and no UI existed for version navigation.

**Fix**: Added version auto-detection on source load via `AppSessionBridge.runVersionAutoDetection()`. Created version selector in the header bar with previous/next buttons and dropdown version list. Added `Alt+[` and `Alt+]` keyboard shortcuts for version navigation.

**Tests added**: 19 regression tests (VSEL-001 through VSEL-019) covering auto-detection, navigation with wrapping, group queries, display updates, and keyboard action wiring.

**Files changed**:
- `src/AppSessionBridge.ts`
- `src/ui/components/layout/HeaderBar.ts`
- `src/utils/input/KeyBindings.ts`
- `src/services/KeyboardActionMap.ts`
- `src/services/KeyboardActionMap.test.ts`
- `src/ui/components/layout/VersionSelector.test.ts` (new)

## Issue #342: Network-sync conflict/warning header state missing from UI

**Root cause**: The network-sync docs described a dedicated red warning state for conflicts, but the `ConnectionState` type only had `disconnected`, `connecting`, `connected`, `reconnecting`, and `error`. `SyncStateManager` had conflict detection logic (`hasPlaybackConflict()`, `hasViewConflict()`) but no UI consumer. `NetworkControl.updateButtonStyle()` only rendered three visual cases with no conflict distinction.

**Fix**:
- Added `'conflict'` to the `ConnectionState` union type in `src/network/types.ts`
- Added `hasConflict()` convenience method to `SyncStateManager` that checks both playback and view conflicts
- Added `emitConflictStateIfNeeded()` to `NetworkSyncManager` that transitions to `'conflict'` state when conflicts are detected and back to `'connected'` when cleared, wired into `handleSyncPlayback()` and `handleSyncView()`
- Updated `NetworkControl.updateButtonStyle()` with a distinct red visual for conflict state (red background, red border/color)
- Updated `updatePanelVisibility()` to show connected panel during conflicts (connection is still active)
- Updated `AppNetworkBridge` to preserve host state during conflicts

**Tests added**: 14 regression tests:
- `SyncStateManager.test.ts`: 4 tests (SSM-080 through SSM-083) for `hasConflict()` covering playback-only, view-only, both, and no conflicts
- `NetworkSyncManager.test.ts`: 4 tests (NSM-140 through NSM-143) for conflict state emission on playback sync, view sync, clearing, and disconnected guard
- `NetworkControl.test.ts`: 6 tests (NCC-120 through NCC-125) for distinct conflict button style vs connected/error/connecting, connected panel visibility, and type system

**Files changed**:
- `src/network/types.ts`
- `src/network/SyncStateManager.ts`
- `src/network/SyncStateManager.test.ts`
- `src/network/NetworkSyncManager.ts`
- `src/network/NetworkSyncManager.test.ts`
- `src/ui/components/NetworkControl.ts`
- `src/ui/components/NetworkControl.test.ts`
- `src/AppNetworkBridge.ts`

## Issue #368: Shot-status badge missing from header bar

**Root cause**: The review workflow docs described a shot-status badge in the header bar next to the source name, but no such UI existed. Status badges were only available in NotePanel and ShotGridPanel. The `StatusManager` had full status tracking, but the header bar had no consumer.

**Fix**: Added a shot-status badge to `HeaderBar` that reads from `session.statusManager.getStatus(currentSourceIndex)`. Badge displays a colored dot and status label (Pending, Approved, Needs Revision, Could Be Better, Omit) next to the source name. Wired to three session events: `sourceLoaded`, `statusChanged`, and `statusesChanged` for real-time updates during playlist playback and bulk restore.

**Tests added**: 14 regression tests (HDR-U030 through HDR-U043) covering badge rendering, visibility, status colors, all 5 statuses, source change updates, accessibility (aria-label), DOM positioning, sub-element structure, and bulk status restore.

**Files changed**:
- `src/ui/components/layout/HeaderBar.ts`
- `src/ui/components/layout/HeaderBar.test.ts`

## Issue #447: Manual reconnect option missing after retry exhaustion

**Root cause**: When `NetworkSyncManager` exhausted reconnect retries, it only emitted a toast/error message. `NetworkControl` had no dedicated reconnect button — the disconnected panel only offered create/join flows, leaving users with no way to retry the last room.

**Fix**:
- Added `reconnectExhausted` event to `NetworkSyncEvents` in types
- Added `isReconnectExhausted` getter, `manualReconnect()` method, and `_lastRoomCode`/`_lastRoomAction` tracking to `NetworkSyncManager`
- Added reconnect panel with a "Reconnect" button to `NetworkControl` (shown instead of the normal disconnected panel when retries are exhausted)
- Wired through `AppNetworkBridge`: `reconnectExhausted` event shows the panel, `reconnect` button click triggers `manualReconnect()`
- Exhaustion flag clears on successful `connecting`/`connected`/`reconnecting` state transitions

**Tests added**: 30 regression tests:
- `ReconnectExhausted.test.ts` (new): 15 tests for exhaustion state, event emission, manual reconnect behavior
- `NetworkControl.reconnect.test.ts` (new): 15 tests for panel visibility, button behavior, state transitions

**Files changed**:
- `src/network/types.ts`
- `src/network/NetworkSyncManager.ts`
- `src/network/ReconnectExhausted.test.ts` (new)
- `src/ui/components/NetworkControl.ts`
- `src/ui/components/NetworkControl.reconnect.test.ts` (new)
- `src/AppNetworkBridge.ts`
