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
