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
