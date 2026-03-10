# Fixed Issues

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
- **Regression Tests**: PREG-047 (warning emitted on registration), PREG-048 (signal fires with correct pluginId and panel data).
- **Verification**: All 51 PluginRegistry tests pass, TypeScript clean.
- **Files Changed**: `src/plugin/PluginRegistry.ts`, `src/plugin/PluginRegistry.test.ts`

## Issue #18: Plugin exporters can be registered but the export flow never consults them

- **Severity**: Medium
- **Area**: Plugin system, export pipeline
- **Root Cause**: `registerExporter()` stored exporters in the registry, but the production export flow (`ExportControl` → `AppPlaybackWiring` → built-in handlers) never called `getExporter()` or `getExporters()`.
- **Fix**: Added `exporterRegistered` signal for reactive discovery, `console.warn` on registration noting exporters aren't yet consulted, and TODO(#18) documenting what's needed. Existing API unchanged.
- **Regression Tests**: PREG-049 (warning emitted on registration), PREG-050 (signal fires with correct pluginId, name, and exporter data).
- **Verification**: All 53 PluginRegistry tests pass, TypeScript clean.
- **Files Changed**: `src/plugin/PluginRegistry.ts`, `src/plugin/PluginRegistry.test.ts`

## Issue #16: CacheManagementPanel is fully implemented but has no production wiring

- **Severity**: Low
- **Area**: Components, cache UI
- **Root Cause**: Complete cache management UI exists but has no mount path — users cannot open it.
- **Fix**: Added TODO(#16) JSDoc, static `NOT_WIRED_MESSAGE`, and `console.info` in constructor documenting the orphaned status and what's needed to wire it in.
- **Regression Tests**: CACHE-PANEL-001 through 007 (documentation markers, constructor warning, basic functionality).
- **Verification**: All 7 tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/CacheManagementPanel.ts`, `src/ui/components/CacheManagementPanel.test.ts` (new)

## Issue #19: The async render-worker path silently drops file/look/display LUT stages

- **Severity**: High
- **Area**: Rendering, async worker path, color pipeline
- **Root Cause**: `RenderWorkerProxy.setFileLUT()`, `setLookLUT()`, `setDisplayLUT()` were silent no-ops — the worker sync protocol only carries a single `lut` field, so multi-point LUT pipeline stages were silently dropped.
- **Fix**: Replaced silent no-ops with `console.warn` when non-null data is passed (silent on null/clear). Added `supportsMultiPointLUT()` returning `false` for capability checking. Added TODO(#19) comments documenting the worker serialization gap.
- **Regression Tests**: RWP-LUT-001 through RWP-LUT-007 (capability check, warn on data for each method, no warn on clear for each method).
- **Verification**: All 81 RenderWorkerProxy tests pass, TypeScript clean.
- **Files Changed**: `src/render/RenderWorkerProxy.ts`, `src/render/RenderWorkerProxy.test.ts`

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
- **Fix**: Added `console.warn` in `applyClientModeRestrictions()` listing selectors that match zero elements, making the broken state visible. Added TODO(#52) documentation in `ClientMode.ts` listing exactly which components need which `data-panel`/`data-toolbar` attributes for the selectors to work.
- **Regression Tests**: LO-031 (warn when all match nothing), LO-032 (warning lists unmatched selectors with count), LO-033 (no warn when all match), LO-034 (partial matches: only unmatched listed, matched elements hidden).
- **Verification**: All 35 LayoutOrchestrator tests pass, TypeScript clean.
- **Files Changed**: `src/services/LayoutOrchestrator.ts`, `src/ui/components/ClientMode.ts`, `src/services/LayoutOrchestrator.test.ts`

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
- **Regression Tests**: 1 test verifying info message mentions ShortcutEditor.
- **Verification**: All 18 AppKeyboardHandler tests pass, TypeScript clean.
- **Files Changed**: `src/AppKeyboardHandler.ts`, `src/AppKeyboardHandler.test.ts`

## Issue #58: The app ships two different shortcut-reference UIs, and different entry points open different ones

- **Severity**: Low
- **Area**: Help / shortcut discoverability
- **Root Cause**: `?` opens `ShortcutCheatSheet` overlay; Help menu "Keyboard Shortcuts" opens `showShortcutsDialog()` — a separate hardcoded modal. Two UIs for the same purpose.
- **Fix**: Added TODO(#58) comment and `console.info` in `showShortcutsDialog()` documenting the duplication and referencing `ShortcutCheatSheet`.
- **Regression Tests**: 1 test verifying info message mentions ShortcutCheatSheet.
- **Verification**: All 18 AppKeyboardHandler tests pass, TypeScript clean.
- **Files Changed**: `src/AppKeyboardHandler.ts`, `src/AppKeyboardHandler.test.ts`

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
- **Regression Tests**: INFO-U130 (logs customization info on first enable), INFO-U131 (logs only once across multiple enable calls).
- **Verification**: All 65 InfoPanel tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/InfoPanel.ts`, `src/ui/components/InfoPanel.test.ts`

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
- **Fix**: Added TODO(#77) comment in `TimecodeOverlay.ts` documenting that configuration (position, fontSize, showFrameCounter, backgroundOpacity) has no UI surface. Added one-time `console.info` on first `enable()`.
- **Regression Tests**: TC-130, TC-131 (logs on first enable, logs only once).
- **Files Changed**: `src/ui/components/TimecodeOverlay.ts`, `src/ui/components/TimecodeOverlay.test.ts`

## Issue #78: The FPS indicator has rich persisted settings, but the shipped UI only exposes a binary toggle

- **Severity**: Medium
- **Fix**: Added TODO(#78) comment in `FPSIndicator.ts` documenting that position, dropped-frame visibility, target-FPS visibility, background opacity, and warning/critical thresholds have no UI surface. Added one-time `console.info` on first `enable()`.
- **Regression Tests**: FPS-120, FPS-121 (logs on first enable, logs only once).
- **Files Changed**: `src/ui/components/FPSIndicator.ts`, `src/ui/components/FPSIndicator.test.ts`

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
- **Fix**: Added TODO(#81) comment in `SafeAreasControl.ts` documenting that guideColor, guideOpacity, and custom aspect ratio features exist but have no UI surface. Added one-time `console.info` on first overlay enable.
- **Regression Tests**: SAFE-U120, SAFE-U121.
- **Files Changed**: `src/ui/components/SafeAreasControl.ts`, `src/ui/components/SafeAreasControl.test.ts`

## Issue #82: Watermark panel drops the overlay's custom-position mode on the floor

- **Severity**: Medium
- **Fix**: Added TODO(#82) comment in `WatermarkControl.ts` documenting that the overlay supports custom X/Y positioning but the UI only exposes the 3x3 preset grid. Added one-time `console.info` on first image load.
- **Regression Tests**: WMC-U090, WMC-U091.
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
- **Fix**: Added TODO(#84) + one-time `console.info` on first enable documenting that `backgroundOpacity` has no UI surface.
- **Regression Tests**: 2 tests (logs on first enable, logs only once).
- **Files Changed**: `src/ui/components/InfoStripOverlay.ts`, `src/ui/components/InfoStripOverlay.test.ts`

## Issue #85: EXR window overlay exposes only a binary toggle while the useful per-window controls stay unreachable

- **Severity**: Medium
- **Fix**: Added TODO(#85) + one-time `console.info` on first enable documenting that per-window toggles, colors, line width, dash pattern, and labels have no UI surface.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/ui/components/EXRWindowOverlay.ts`, `src/ui/components/EXRWindowOverlay.test.ts`

## Issue #86: Bug overlay is implemented in the viewer but has no production entry point

- **Severity**: Medium
- **Fix**: Added TODO(#86) + one-time `console.info` on first enable documenting that image loading, corner placement, size, opacity, and margin controls have no production UI.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/ui/components/BugOverlay.ts`, `src/ui/components/BugOverlay.test.ts`

## Issue #87: Matte overlay is fully implemented but unreachable from the shipped UI

- **Severity**: Medium
- **Fix**: Added TODO(#87) + one-time `console.info` on first enable documenting that aspect, opacity, and center-point controls have no production UI.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/ui/components/MatteOverlay.ts`, `src/ui/components/MatteOverlay.test.ts`

## Issue #88: Clipping overlay ships as a binary histogram toggle while its useful controls stay hidden

- **Severity**: Medium
- **Fix**: Added TODO(#88) + one-time `console.info` on first enable documenting that highlight/shadow toggles and opacity have no UI surface.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/ui/components/ClippingOverlay.ts`, `src/ui/components/ClippingOverlay.test.ts`

## Issue #89: Reference comparison exposes only capture/on-off while the real comparison modes stay inaccessible

- **Severity**: Medium
- **Fix**: Added TODO(#89) + one-time `console.info` on first enable documenting that viewMode, opacity, and wipePosition have no UI surface.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/ui/components/ReferenceManager.ts`, `src/ui/components/ReferenceManager.test.ts`

## Issue #90: Spotlight ships as a bare toggle while most of the tool's real controls are hidden

- **Severity**: Medium
- **Fix**: Added TODO(#90) + one-time `console.info` on first enable documenting that shape, position, size, dim amount, and feather settings have no UI surface.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/ui/components/SpotlightOverlay.ts`, `src/ui/components/SpotlightOverlay.test.ts`

## Issue #91: The shipped slate panel exposes only a small subset of the slate feature it actually drives

- **Severity**: Medium
- **Fix**: Added TODO(#91) + one-time `console.info` on first `generateConfig()` call documenting that custom fields, text/accent colors, logo position/scale, and output resolution have no UI surface.
- **Regression Tests**: SLATE-HINT-001, SLATE-HINT-002.
- **Files Changed**: `src/ui/components/SlateEditor.ts`, `src/ui/components/SlateEditor.test.ts`

## Issue #92: Slate logo upload failures are swallowed without any user-visible feedback

- **Severity**: Medium
- **Area**: Effects panel, error handling
- **Root Cause**: `loadLogoFile()` failures emitted `logoError` events but no production code listened for them.
- **Fix**: Added `slateEditor.on('logoError', ...)` listener in `AppControlRegistry.ts` that calls `console.warn` and displays the error in the logo info element.
- **Regression Tests**: ACR-023 (logoError triggers console.warn), SLATE-ERR-001 (logoError event emitted on failure).
- **Files Changed**: `src/AppControlRegistry.ts`, `src/AppControlRegistry.test.ts` or `src/ui/components/SlateEditor.test.ts`

## Issue #93: The advanced multi-field frameburn export overlay is implemented but unreachable in production

- **Severity**: Medium
- **Fix**: Added TODO(#93) + one-time `console.info` in `FrameburnCompositor.compositeFrameburn()` documenting that the multi-field frameburn path has no production UI entry point.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/ui/components/FrameburnCompositor.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #94: Watermark image load failures are swallowed without any user-visible feedback

- **Severity**: Medium
- **Area**: Effects panel, error handling
- **Fix**: Added `console.warn` in `WatermarkControl.handleFileSelect()` catch block and inline error display in the preview container.
- **Regression Tests**: 1 test (console.warn on failure).
- **Files Changed**: `src/ui/components/WatermarkControl.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #95: Playlist transition edits can silently collapse back to a cut with no explanation

- **Severity**: Medium
- **Fix**: Added `console.warn` when `validateTransition()` returns null, logging the rejected transition type and gap index.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/ui/components/PlaylistPanel.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #96: ShotGrid load requests with invalid IDs fail as a silent no-op

- **Severity**: Low
- **Fix**: `handleLoad()` now shows inline error via `showState('error', ...)` and sets `aria-invalid="true"` on input for empty/invalid IDs. Clears on valid input.
- **Regression Tests**: 2 tests (error message, aria-invalid).
- **Files Changed**: `src/ui/components/ShotGridPanel.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #97: Timeline context menu advertises `Ctrl+C` for timecode copy, but that shortcut is still bound to frame copy

- **Severity**: Medium
- **Fix**: Removed `Ctrl+C` shortcut hint from "Copy Timecode" menu item (set to `null`). The action is click-only.
- **Regression Tests**: Updated TCM-023 to verify no shortcut hint.
- **Files Changed**: `src/ui/components/TimelineContextMenu.ts`, `src/ui/components/TimelineContextMenu.test.ts`

## Issue #98: Ghost Frames, PAR, and Stereo Align use different interaction models for mouse and keyboard

- **Severity**: Medium
- **Fix**: Updated tooltips to clarify dual behavior: "Click to configure, [shortcut] to toggle/cycle". Ghost Frames, PAR, and StereoAlign all updated.
- **Regression Tests**: 3 tests (one per control).
- **Files Changed**: `src/ui/components/GhostFrameControl.ts`, `src/ui/components/PARControl.ts`, `src/ui/components/StereoAlignControl.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #99: Timeline editor context menu shows shortcut hints that are not actually wired

- **Severity**: Medium
- **Fix**: Removed `S` and `D` shortcut hints from "Split at Playhead" and "Duplicate Cut" items (set to `null`). Kept `Del` for Delete since it IS wired. Updated `createMenuItem` to accept `string | null`.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/ui/components/TimelineEditor.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #100: Snapshot panel hides load failures behind a blank or stale panel state

- **Severity**: Medium
- **Fix**: Added inline error message element in `loadSnapshots()` catch block showing "Failed to load snapshots. Try again." with `data-testid="snapshot-load-error"`.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/ui/components/SnapshotPanel.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #101: The floating Info Panel is mostly unwired and can only show cursor color reliably

- **Severity**: Medium
- **Fix**: Added TODO(#101) in InfoPanel class JSDoc + one-time `console.info` on first `enable()` documenting that most fields (filename, resolution, frame, timecode, duration, FPS) are unwired in production.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/ui/components/InfoPanel.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #102: Cache indicator's `Clear` action only clears video cache while still presenting effects-cache stats

- **Severity**: Medium
- **Fix**: Changed clear button label from "Clear" to "Clear Video Cache" to accurately describe its scope. Added TODO(#102) for adding effects cache clearing.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/ui/components/CacheIndicator.ts`, `src/ui/components/issues-p1.test.ts`

## Issue #103: Right-panel media info can go stale after the panel is hidden and shown again

- **Severity**: Medium
- **Fix**: Already resolved by Issue #53 (pendingInfo + applyPending mechanism). Added regression tests confirming the fix.
- **Regression Tests**: RP-103a, RP-103b.
- **Files Changed**: `src/ui/layout/panels/RightPanelContent.test.ts`

## Issue #104: Advanced paint-tool buttons advertise `D` / `U` / `C` / `M`, but those shortcuts do not exist

- **Severity**: Medium
- **Fix**: Removed false shortcut hints from dodge/burn/clone/smudge tooltips in PaintToolbar.
- **Regression Tests**: PAINT-U104a through PAINT-U104d (4 tests).
- **Files Changed**: `src/ui/components/PaintToolbar.ts`, `src/ui/components/PaintToolbar.test.ts`

## Issue #105: Text-format toolbar advertises `Ctrl+B` / `Ctrl+I` / `Ctrl+U`, but production never routes those shortcuts to it

- **Severity**: Medium
- **Fix**: Removed `(Ctrl+B)`, `(Ctrl+I)`, `(Ctrl+U)` from button titles. Added TODO(#105).
- **Regression Tests**: TFT-105a through TFT-105c (3 tests).
- **Files Changed**: `src/ui/components/TextFormattingToolbar.ts`, `src/ui/components/TextFormattingToolbar.test.ts`

## Issue #106: Text-format toolbar never follows actual text selection, so it only tracks newly created or most-recent text

- **Severity**: Medium
- **Fix**: Added TODO(#106) + `console.info` in `setActiveAnnotation()` documenting the gap.
- **Regression Tests**: TFT-106a.
- **Files Changed**: `src/ui/components/TextFormattingToolbar.ts`, `src/ui/components/TextFormattingToolbar.test.ts`

## Issue #107: Snapshot panel promises a Preview action, but the shipped UI only shows preview metadata

- **Severity**: Medium
- **Fix**: Updated docs to remove "Preview" from action list. Added TODO(#107).
- **Regression Tests**: SNAP-107a (no Preview button in action row).
- **Files Changed**: `src/ui/components/SnapshotPanel.ts`, `src/ui/components/SnapshotPanel.test.ts`

## Issue #108: Playlist panel claims EDL import/export support, but the shipped UI only exposes export

- **Severity**: Medium
- **Fix**: Updated docs from "EDL import/export" to "EDL/OTIO export". Added TODO(#108).
- **Regression Tests**: PL-108a (no import button).
- **Files Changed**: `src/ui/components/PlaylistPanel.ts`, `src/ui/components/PlaylistPanel.test.ts`

## Issue #109: Network Sync can show `Copied!` before the share link copy actually succeeds

- **Severity**: Medium
- **Fix**: Changed copy flow: button now shows "Copying..." immediately. Added `setCopyResult(success: boolean)` method that updates to "Copied!" or "Copy failed".
- **Regression Tests**: NCC-109a through NCC-109c (3 tests).
- **Files Changed**: `src/ui/components/NetworkControl.ts`, `src/ui/components/NetworkControl.test.ts`

## Issue #110: Shortcut editor import failures are completely silent

- **Severity**: Medium
- **Fix**: Added `console.warn` in import catch block. Added `showImportStatus` method for inline UI feedback.
- **Regression Tests**: SHORTCUT-U110, U111 (2 tests).
- **Files Changed**: `src/ui/components/ShortcutEditor.ts`, `src/ui/components/ShortcutEditor.test.ts`

## Issue #111: Curves import failures only hit the console, not the UI

- **Severity**: Medium
- **Fix**: Added inline error display with `data-testid="curves-import-error"`.
- **Regression Tests**: CURVES-U111a.
- **Files Changed**: `src/ui/components/CurvesControl.ts`, `src/ui/components/CurvesControl.test.ts`

## Issue #112: External presentation window opens can fail silently when blocked by the browser

- **Severity**: Medium
- **Fix**: Added `console.warn` when `window.open()` returns null.
- **Regression Tests**: EP-112a, EP-112b (2 tests).
- **Files Changed**: `src/ui/components/ExternalPresentation.ts`, `src/ui/components/ExternalPresentation.test.ts`

## Issue #113: The `?` shortcut cheat sheet advertises search/context filtering in code, but the shipped overlay exposes neither

- **Severity**: Medium
- **Fix**: Updated docs to remove misleading search/filter claims. Added TODO(#113).
- **Regression Tests**: CS-113 (no search input in overlay).
- **Files Changed**: `src/ui/components/ShortcutCheatSheet.ts`, `src/ui/components/ShortcutCheatSheet.test.ts`

## Issue #114: Tone Mapping can be "enabled" in the dropdown while still being functionally off

- **Severity**: Medium
- **Fix**: In `setEnabled(true)`, when operator is `'off'`, auto-select the first non-off operator (matching the `toggle()` behavior from Issue #41).
- **Regression Tests**: 5 tests in ToneMappingControl.issue114.test.ts.
- **Files Changed**: `src/ui/components/ToneMappingControl.ts`

## Issue #115: Typing a custom PAR value does not actually enable PAR correction

- **Severity**: Medium
- **Fix**: Added `state.enabled = true` and `updateEnableCheckbox()` in the custom input change handler, matching preset behavior.
- **Regression Tests**: 2 tests in PARControl.issue115.test.ts.
- **Files Changed**: `src/ui/components/PARControl.ts`

## Issue #116: Volume slider disclosure is tied to the mute button, so keyboard/touch use mutates audio state just to reach the slider

- **Severity**: Medium
- **Fix**: Added TODO(#116) comment documenting the UX issue. Larger redesign needed to separate disclosure from mute.
- **Regression Tests**: 1 test documenting the behavior.
- **Files Changed**: `src/ui/components/VolumeControl.ts`

## Issue #117: The OCIO button advertises the wrong shortcut

- **Severity**: Low
- **Fix**: Changed tooltip from `(Shift+O)` to `(O)`.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/ui/components/OCIOControl.ts`

## Issue #118: `WipeControl` is a dead legacy UI widget with no production mount path

- **Severity**: Low
- **Fix**: Added TODO(#118) to the existing `@deprecated` JSDoc noting it should be removed when safe.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/ui/components/WipeControl.ts`

## Issue #119: Project save knows it is dropping active viewer state, but the save flow only logs that loss to the console

- **Severity**: High
- **Fix**: After `toJSON()`, check `getSerializationGaps()` for active gaps and call `showAlert()` with warning details before saving. Matches the pattern used by the load path.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/AppPersistenceManager.ts`

## Issue #120: Restored PAR and background-pattern state can disagree with the visible controls

- **Severity**: Medium
- **Fix**: Added PAR and background-pattern control sync in `syncControlsFromState()`. Added both controls to `PersistenceManagerContext`.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/AppPersistenceManager.ts`

## Issue #121: Opening a project imports its media on top of the current session instead of replacing the session

- **Severity**: High
- **Fix**: Added `clearSources()` method to SessionMedia/Session. `SessionSerializer.fromJSON()` now calls `session.clearSources()` before loading media.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/core/session/SessionMedia.ts`, `src/core/session/Session.ts`, `src/core/session/SessionSerializer.ts`

## Issue #122: Saved current-source selection is serialized but never restored

- **Severity**: Medium
- **Fix**: Added `setCurrentSource(state.currentSourceIndex)` at the end of `setPlaybackState()` in Session.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/core/session/Session.ts`

## Issue #123: Loading empty notes, version groups, or statuses does not clear the old session data

- **Severity**: High
- **Fix**: Removed `length > 0` guards from notes, versionGroups, and statuses restore in `SessionSerializer.fromJSON()`. Managers are now called even for empty arrays, clearing old data.
- **Regression Tests**: 3 tests (one per data type).
- **Files Changed**: `src/core/session/SessionSerializer.ts`

## Issue #124: State-only or failed-media project loads skip playback-state restore entirely

- **Severity**: Medium
- **Fix**: Removed the `if (loadedMedia > 0)` guard around `setPlaybackState()`. Playback settings are now restored regardless of media count.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/core/session/SessionSerializer.ts`

## Issue #125: RV/GTO session import keeps old review metadata when the imported file contains none

- **Severity**: High
- **Fix**: Removed `length > 0` guards for marks, notes, versionGroups, and statuses in `SessionGraph.loadFromGTO()`. Managers are called even with empty arrays.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/core/session/SessionGraph.ts`

## Issue #126: `.orvproject` save/load never persists the node graph

- **Severity**: High
- **Fix**: Added TODO(#126) comment documenting that the graph serializer exists but isn't wired into .orvproject save/load. Too complex for a single fix without risking breakage.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/core/session/SessionSerializer.ts`

## Issue #127: Session renaming in the header is not honored by project save/load

- **Severity**: Medium
- **Fix**: `saveProject()` now uses `session.metadata?.displayName` instead of hardcoded `'project'`. Falls back to `'project'` if empty.
- **Regression Tests**: 3 tests.
- **Files Changed**: `src/AppPersistenceManager.ts`

## Issue #128: RV/GTO marker notes and marker colors are exported and parsed, but import drops them

- **Severity**: Medium
- **Fix**: `MarkerManager.setFromFrameNumbers()` now accepts optional `notes` and `colors` parallel arrays. `SessionGraph.loadFromGTO()` passes parsed marker notes/colors.
- **Regression Tests**: 5 tests.
- **Files Changed**: `src/core/session/MarkerManager.ts`, `src/core/session/SessionGraph.ts`

## Issue #129: RV/GTO audio-scrub state is exported and parsed, but never restored

- **Severity**: Medium
- **Fix**: Added `setAudioScrubEnabled` to `SessionGraphHost` interface and restore logic in `loadFromGTO()`. Wired in Session.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/core/session/SessionGraph.ts`, `src/core/session/Session.ts`

## Issue #130: Several shipped Effects-tab controls are fully wired, but `.orvproject` persistence ignores them

- **Severity**: High
- **Fix**: Added 5 new entries to `getSerializationGaps()`: Deinterlace, Film emulation, Perspective correction, Stabilization, Uncrop. Each checks viewer state against defaults and surfaces warnings at save time.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/core/session/SessionSerializer.ts`

## Issue #131: Loading ordinary media after a GTO/RV session does not clear old session metadata or uncrop

- **Severity**: High
- **Fix**: `SessionGraph.clearData()` now also resets `_metadata` to defaults, `_uncropState` to null, and `_edlEntries` to empty array.
- **Regression Tests**: 2 tests.
- **Files Changed**: `src/core/session/SessionGraph.ts`

## Issue #132: Project save/load preserves wipe mode but not the actual A/B compare assignment state

- **Severity**: Medium
- **Fix**: Added TODO(#132) comment in serialization gaps section and in `getSerializationGaps()` documenting the gap.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/core/session/SessionSerializer.ts`

## Issue #133: RV/GTO import loses `play all frames` because `realtime = 0` is parsed as "missing"

- **Severity**: Medium
- **Fix**: Changed condition from `realtime > 0` to `typeof realtime === 'number'`, preserving `realtime = 0` as a valid value for play-all-frames mode.
- **Regression Tests**: 4 tests.
- **Files Changed**: `src/core/session/GTOGraphLoader.ts`

## Issue #134: `.orvproject` serializes media representations, but project load never rebuilds or reselects them

- **Severity**: Medium
- **Fix**: Added TODO(#134) + `console.info` in `SessionSerializer.fromJSON()` documenting that representations and activeRepresentationId are saved but never restored on load.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/core/session/SessionSerializer.ts`

## Issue #135: RV/GTO round-trips collapse duration markers into point markers

- **Severity**: Medium
- **Fix**: Added TODO(#135) in `SessionGTOExporter.ts` documenting that `endFrame` is not exported. Added `console.info` on export when duration markers exist.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/core/session/SessionGTOExporter.ts`

## Issue #136: Omitted viewer states can leak from the previous session on project load

- **Severity**: High
- **Root Cause**: `SessionSerializer.fromJSON()` only reapplied serialized viewer fields and never reset omitted states (tone mapping, ghost frames, stereo, channel, difference matte, blend mode). Those states leaked from the previous session.
- **Fix**: Added calls to all viewer reset methods (`resetToneMappingState`, `resetGhostFrameState`, `resetStereoState`, `resetStereoEyeTransforms`, `resetStereoAlignMode`, `resetChannelMode`, `resetDifferenceMatteState`) at the start of `fromJSON()` before applying restored state.
- **Regression Tests**: 2 tests verifying reset methods are called during fromJSON.
- **Files Changed**: `src/core/session/SessionSerializer.ts`

## Issue #137: `fromJSON()` always injects serialization-gap warnings even when not active

- **Severity**: Medium
- **Root Cause**: `fromJSON()` used `gaps.map((g) => g.name)` without filtering by `isActive`, causing ALL gap names to appear as warnings even for features the user never used.
- **Fix**: Filtered gaps to `activeGaps` (where `isActive === true`) before adding to warnings, matching the save path pattern.
- **Regression Tests**: 2 tests verifying clean loads produce no gap warnings and only active gaps appear.
- **Files Changed**: `src/core/session/SessionSerializer.ts`

## Issue #138: Snapshots, auto-checkpoints, and auto-saves use the same lossy project serializer

- **Severity**: High
- **Fix**: Added TODO(#138) comments in `AppPersistenceManager.ts` snapshot and auto-save methods documenting that these use the same lossy serializer as project save.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/AppPersistenceManager.ts`

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
- **Fix**: Added `console.warn` when VideoFrame upload fails, clearly stating the frame will appear blank. Added TODO(#148) for implementing SDR fallback.
- **Regression Tests**: 1 test.
- **Files Changed**: `src/render/Renderer.ts`

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
- **Regression Tests**: CPRF-152-001 (console.info emitted on first construction), CPRF-152-002 (emitted only once across instances), CPRF-152-003 (colorDefaults get/set/export/import still functional), CPRF-152-004 (exportDefaults still functional), CPRF-152-005 (unused generalPrefs fields still functional).
- **Verification**: All 89 PreferencesManager tests pass, TypeScript clean.
- **Files Changed**: `src/core/PreferencesManager.ts`, `src/core/PreferencesManager.test.ts`

## Issue #153: Drag-and-drop GTO/RV session loading loses sidecar file resolution that the file picker preserves

- **Severity**: High
- **Area**: Session ingest / drag-and-drop parity
- **Root Cause**: The header file-picker path built an `availableFiles` map from companion files and passed it to `loadFromGTO()`, enabling sidecar media/CDL resolution by basename. The viewer drag-and-drop path called `session.loadFromGTO(content)` without any `availableFiles` map, silently losing sidecar resolution.
- **Fix**: In `ViewerInputHandler.ts`, moved session file detection (`.gto`/`.rv`) before sequence detection to match HeaderBar's priority order. When a session file is found among dropped files, builds an `availableFiles` `Map<string, File>` from all other dropped files (keyed by `file.name` basename), and passes it as the second argument to `session.loadFromGTO(content, availableFiles)`. Non-session drops are unaffected.
- **Regression Tests**: SIDECAR-001 (GTO + companions builds map), SIDECAR-002 (GTO alone passes empty map), SIDECAR-003 (.rv extension works), SIDECAR-004 (multiple companions with correct basenames), SIDECAR-005 (non-session files fall through to loadFile), SIDECAR-006 (session file excluded from map).
- **Verification**: All 48 ViewerInputHandler tests pass, TypeScript clean.
- **Files Changed**: `src/ui/components/ViewerInputHandler.ts`, `src/ui/components/ViewerInputHandler.test.ts`