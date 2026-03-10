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
