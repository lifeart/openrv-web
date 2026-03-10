# Issues

This file tracks findings from exploratory review and targeted validation runs.

## Confirmed Issues

### 1. Histogram shortcut is broken while the UI still advertises it

- Severity: High
- Area: Keyboard shortcuts, scopes UI
- Evidence:
  - `KeyH` is assigned to both fit-to-height and histogram in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L222) and [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L226).
  - Histogram is explicitly hidden from direct registration in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L45).
  - The scopes button and dropdown still advertise `H` for histogram in [src/ui/components/ScopesControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ScopesControl.ts#L21) and [src/ui/components/ScopesControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ScopesControl.ts#L68).
- Reproduction:
  - Chromium Playwright: `HG-E002` and `HG-E003` fail.
  - Pressing `H` does not make the histogram visible.

### 2. Gamut diagram shortcut is broken while the UI still advertises it

- Severity: Medium
- Area: Keyboard shortcuts, scopes UI
- Evidence:
  - The scopes UI advertises `G` for the gamut diagram in [src/ui/components/ScopesControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ScopesControl.ts#L25) and [src/ui/components/ScopesControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ScopesControl.ts#L68).
  - The main tab context never switches to `panel`; QC sets `viewer` in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L202).
  - `KeyG` is registered as goto-frame in global context and gamut diagram only in `panel` context in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L282).
- Reproduction:
  - Browser spot-check in QC: pressing `G` opens goto-frame and does not show the gamut diagram.

### 3. Scope shortcut hints are stale for waveform as well

- Severity: Medium
- Area: Keyboard shortcuts, scopes UI
- Evidence:
  - Waveform is hidden from direct registration in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L45).
  - The scopes UI still advertises `w` for waveform in [src/ui/components/ScopesControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ScopesControl.ts#L23) and [src/ui/components/ScopesControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ScopesControl.ts#L68).
- Notes:
  - This one is source-confirmed rather than browser-reproduced, but it is the same conflict pattern as the confirmed histogram bug.

### 4. Zoom control uses inconsistent notation between the menu and the selected value

- Severity: Medium
- Area: View controls, zoom UI
- Evidence:
  - The dropdown presents numeric presets as percentages in [src/ui/components/ZoomControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ZoomControl.ts#L21).
  - The button rewrites the selected value into ratio notation such as `2:1` in [src/ui/components/ZoomControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ZoomControl.ts#L130).
- Reproduction:
  - Chromium Playwright: `WORKFLOW-001` fails around the zoom step.
  - Selecting `200%` does not leave the control reading `200%`, which makes the active state harder to read.

### 5. EXR layer names are injected into `innerHTML` without escaping

- Severity: High
- Area: EXR UI, metadata rendering
- Evidence:
  - EXR layer names come directly from metadata and are passed as plain labels in [src/ui/components/ChannelSelect.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ChannelSelect.ts#L457).
  - The selected layer button renders that layer name with `innerHTML` in [src/ui/components/ChannelSelect.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ChannelSelect.ts#L468).
  - The shared dropdown utility uses `textContent` for labels in [src/ui/components/shared/DropdownMenu.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/DropdownMenu.ts#L211), which highlights that this button path bypasses the safer pattern.
- Impact:
  - A malicious or malformed EXR layer name can inject markup into the toolbar button.

### 6. Build and e2e bootstrap are fragile because the runtime is not pinned tightly enough

- Severity: High
- Area: Tooling, build, test bootstrap
- Evidence:
  - The repo scripts rely on `vite` through [package.json](/Users/lifeart/Repos/openrv-web/package.json#L15).
  - Playwright’s default web server uses `pnpm dev` in [playwright.config.ts](/Users/lifeart/Repos/openrv-web/playwright.config.ts#L67).
- Reproduction:
  - In this workspace, `pnpm` resolves to Node `20.11.0`.
  - `pnpm build` fails before app startup because Vite 7 requires a newer Node and crashes with `crypto.hash is not a function`.
  - Default Playwright startup fails for the same reason.

### 7. Lint is already red because the Vitest setup file imports `vitest` twice

- Severity: Medium
- Area: Repo hygiene, test tooling
- Evidence:
  - `vitest` is imported at both [test/setup.ts](/Users/lifeart/Repos/openrv-web/test/setup.ts#L6) and [test/setup.ts](/Users/lifeart/Repos/openrv-web/test/setup.ts#L186).
- Reproduction:
  - `pnpm lint` fails with `import-x/no-duplicates`.

### 8. Several advertised channel shortcuts are unreachable in production

- Severity: High
- Area: Keyboard shortcuts, channel selection
- Evidence:
  - `channel.red` is scoped to `channel` context in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L396), and `channel.blue` / `channel.none` are also redirected into `channel` context via contextual registration in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L305).
  - Production tab switching never sets `channel` context; it only uses `paint`, `transform`, `viewer`, and `global` in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L202).
- Reproduction:
  - Browser spot-check:
    - `Shift+R` rotates instead of selecting red.
    - `Shift+N` opens Network Sync instead of selecting no channel.
    - `Shift+B` does not switch to blue channel.
- Impact:
  - The shortcut model for channel isolation is internally inconsistent and some documented shortcuts cannot be reached.

### 9. `Shift+L` has two conflicting meanings depending on the active tab

- Severity: Medium
- Area: Keyboard shortcuts, channel selection, color tools
- Evidence:
  - The binding is described as `Select luminance channel` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L417).
  - The handler opens the LUT pipeline panel instead of selecting luminance when the Color tab is active in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L604).
  - The repo has tests that encode both behaviors:
    - luminance selection in [e2e/channel-select.spec.ts](/Users/lifeart/Repos/openrv-web/e2e/channel-select.spec.ts#L125)
    - LUT pipeline toggle in [e2e/multi-point-lut-pipeline.spec.ts](/Users/lifeart/Repos/openrv-web/e2e/multi-point-lut-pipeline.spec.ts#L108)
- Reproduction:
  - Browser spot-check on the Color tab:
    - `Shift+L` opens `[data-testid="lut-pipeline-panel"]`
    - viewer channel mode remains `rgb`
- Impact:
  - The same shortcut means “luminance” in one place and “open LUT panel” in another, which makes keyboard behavior hard to predict.

### 10. The context system has production-dead branches that tests and bindings still rely on

- Severity: Medium
- Area: Keyboard/input architecture
- Evidence:
  - Production tab switching only activates `paint`, `transform`, `viewer`, and `global` in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L202).
  - Binding definitions still rely on `timeline`, `panel`, `channel`, and `annotate` contexts in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L73), [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L219), [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L396), and [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L607).
  - I found no production `pushContext()` / `setContext()` calls for those contexts outside tests.
- Impact:
  - Shortcut behavior depends on contexts that do not occur in the real app.
  - This is the root cause behind the broken gamut and channel shortcuts and makes the keyboard tests easier to diverge from real behavior.

### 11. Network e2e tests target a stale UI contract instead of the actual NetworkControl DOM

- Severity: Medium
- Area: E2E tests, network UI contract
- Evidence:
  - The skipped network specs still look for `network-button`, `room-code`, `room-code-input`, `connection-status`, `user-presence-list`, and `user-entry` in [e2e/network-sync.spec.ts](/Users/lifeart/Repos/openrv-web/e2e/network-sync.spec.ts#L188).
  - The real control renders different test IDs:
    - `network-sync-button` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L132)
    - `network-disconnected-panel`, `network-connecting-panel`, and `network-connected-panel` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L366)
    - `network-room-code-display` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L570)
    - `network-user-list` and per-user rows like `network-user-${id}` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L767)
- Impact:
  - These tests are written against obsolete selectors, so un-skipping them would validate the wrong DOM contract.
  - Some cases only work because the test falls back to loose text or class selectors, which hides the mismatch.

### 12. The A/B badge e2e test checks a selector that the app never renders

- Severity: Medium
- Area: E2E tests, compare indicator coverage
- Evidence:
  - `AB-E021` looks for `ab-indicator-badge` in [e2e/ab-compare.spec.ts](/Users/lifeart/Repos/openrv-web/e2e/ab-compare.spec.ts#L166).
  - The real viewer HUD creates `ab-indicator`, not `ab-indicator-badge`, in [src/ui/components/ViewerIndicators.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerIndicators.ts#L39).
- Impact:
  - The test is not exercising the actual A/B indicator element used by the app.
  - Regressions in the real badge wiring can slip through because the assertion is pointed at the wrong node.

### 13. Several header controls used in e2e still do not expose stable test IDs

- Severity: Low
- Area: Testability, header UI contract
- Evidence:
  - Recovery and export flows fall back to tooltip text instead of a stable selector for save/export in [e2e/session-recovery.spec.ts](/Users/lifeart/Repos/openrv-web/e2e/session-recovery.spec.ts#L135) and [e2e/export-workflow.spec.ts](/Users/lifeart/Repos/openrv-web/e2e/export-workflow.spec.ts#L50).
  - Audio tests fall back to tooltip text and container classes for mute and volume in [e2e/audio-playback.spec.ts](/Users/lifeart/Repos/openrv-web/e2e/audio-playback.spec.ts#L40).
  - The production controls are rendered without explicit `data-testid`s:
    - save button is created icon-only in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L222)
    - export button in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L46)
    - mute button and volume slider in [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L47)
- Impact:
  - Tests are coupled to tooltip copy and incidental CSS structure instead of a stable UI contract.
  - Small text or icon changes can break tests without any behavioral regression.

### 15. Plugin-contributed UI panels are stored in the registry but never consumed by the app

- Severity: Medium
- Area: Plugin system, UI extension points
- Evidence:
  - Plugins can register UI panels through `registerUIPanel()` in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L403).
  - The registry exposes `getUIPanel()` and `getUIPanels()` in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L310).
  - I found no non-test production callsites for either getter.
- Impact:
  - Plugin UI panel contributions can be registered successfully but have no path into the visible application.
  - This is another production-dead extension branch: the registry accepts the contribution, but the app never mounts it.

### 16. `CacheManagementPanel` is a fully implemented component with no production wiring at all

- Severity: Low
- Area: Components, cache UI
- Evidence:
  - The component is implemented in [src/ui/components/CacheManagementPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheManagementPanel.ts#L41).
  - I found no non-test import or mount path for `CacheManagementPanel` anywhere in `src`.
  - The only related production surface is the passive cache indicator used by layout wiring in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L254), not this panel.
- Impact:
  - The repo contains a complete cache-management UI that users cannot open.
  - Tests or future work can easily assume cache management exists in the app when it is currently orphaned code.

### 17. DCC media loading derives the display name with POSIX-only path splitting

- Severity: Medium
- Area: Integrations, DCC service wiring
- Evidence:
  - `wireDCCBridge()` extracts the media name with `path.split('/').pop()` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L100).
  - The DCC bridge protocol describes `path` as a generic file path or URL in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L34).
- Impact:
  - Windows-style paths such as `C:\\shots\\plate.exr` will keep the whole path as the source name instead of the basename.
  - That leaks platform-specific paths into session/UI naming and makes DCC-driven media loading inconsistent across operating systems.

### 18. Plugin exporters can be registered but the export flow never consults them

- Severity: Medium
- Area: Plugin system, export pipeline
- Evidence:
  - Plugins can register exporters and query them through the registry in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L298) and [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L395).
  - The production export flow is wired directly from `ExportControl` to built-in viewer/session handlers in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L128).
  - I found no non-test production callsites for `getExporter()` or `getExporters()`.
- Impact:
  - Plugin exporter contributions can be registered successfully but never appear in export UI or runtime export dispatch.
  - This leaves another extension point production-dead: registration succeeds, but user-visible export behavior cannot reach it.

### 19. The async render-worker path silently drops file/look/display LUT stages

- Severity: High
- Area: Rendering, async worker path, color pipeline
- Evidence:
  - The live viewer prefers the OffscreenCanvas worker path when available in [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L378).
  - `RenderWorkerProxy` implements `setFileLUT()`, `setLookLUT()`, and `setDisplayLUT()` as TODO no-ops in [src/render/RenderWorkerProxy.ts](/Users/lifeart/Repos/openrv-web/src/render/RenderWorkerProxy.ts#L660).
  - The worker sync protocol only carries a single `lut` field in [src/render/renderWorker.messages.ts](/Users/lifeart/Repos/openrv-web/src/render/renderWorker.messages.ts#L258), and the worker only applies that single LUT in [src/workers/renderWorker.worker.ts](/Users/lifeart/Repos/openrv-web/src/workers/renderWorker.worker.ts#L76).
- Impact:
  - When the app is running on the async worker renderer, file LUT, look LUT, and display LUT stages from the multi-point LUT pipeline are ignored.
  - This creates renderer-dependent color behavior: the same session can grade differently depending on whether the worker path is active.

### 20. RV/GTO session import silently drops mapped-but-unimplemented nodes

- Severity: High
- Area: Session import, GTO/RV compatibility
- Evidence:
  - The loader explicitly documents that mapped effect nodes such as `RVColor` and `RVTransform2D` are "not yet implemented" and will be skipped in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L93).
  - During graph construction, mapped but unregistered node types are skipped without warning in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L2108).
  - Production `.rv` / `.gto` loading routes through this parser in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L235) and is triggered from the UI in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1401).
- Impact:
  - Importing an RV/GTO session can silently lose color, transform, or other pipeline nodes while still appearing to load successfully.
  - That makes session interchange lossy in a way that is hard for users to detect or debug.

### 21. POSIX-only basename extraction also exists in the core source nodes

- Severity: Medium
- Area: Media loading, source metadata
- Evidence:
  - `FileSourceNode.load()` derives the fallback display name with `url.split('/').pop()` in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L604).
  - `VideoSourceNode` does the same when populating metadata in [src/nodes/sources/VideoSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/VideoSourceNode.ts#L174).
  - The same path-handling assumption already exists in DCC wiring in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L96).
- Impact:
  - The Windows-path naming bug is not confined to DCC integration; it also affects direct source-node loading.
  - Source names can retain the full path instead of the basename, which pollutes UI/session metadata and produces inconsistent naming across platforms.

### 22. ViewerGLRenderer's fallback auto gamut-mapping path is self-cancelling

- Severity: Low
- Area: Rendering logic, gamut mapping
- Evidence:
  - The HDR render flow repeatedly calls `detectGamutMapping()` when gamut mapping is unset or `off` in [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L708).
  - `detectGamutMapping()` immediately returns the existing state unchanged when that mode is `off` in [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L256).
  - Even if execution continues past that early return, `sourceGamut` is assigned `'srgb'` in both branches in [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L267), which then forces the method back to `mode: 'off'`.
- Impact:
  - The supposed fallback auto-detection branch never produces an active gamut-mapping state.
  - This leaves dead logic in a hot render path and makes the code comments about auto-detection misleading.

### 23. Stack layer opacity round-trips are broken, and layer visibility is not serialized at all

- Severity: High
- Area: Session export/import, stack compositing
- Evidence:
  - The stack UI exposes per-layer visibility and opacity controls in [src/ui/components/StackControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StackControl.ts#L275) and [src/ui/components/StackControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StackControl.ts#L540).
  - App wiring only pushes those layer settings into the live viewer state in [src/AppStackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppStackWiring.ts#L32).
  - `SessionGTOExporter` declares `layerOpacities` but no `layerVisible` field in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L154), and writes per-layer opacity into a `layerOutput.opacity` component in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L740).
  - `GTOGraphLoader` reads per-layer opacity from `output.opacity` instead of `layerOutput.opacity` in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L1306).
- Impact:
  - Saving and reopening a session loses per-layer stack opacity because export and import disagree on the component path.
  - Layer visibility has no serialization path here, so hidden stack layers come back visible after round-trip.

### 24. Imported RV stack modes `dissolve` and `topmost` degrade silently to normal compositing

- Severity: Medium
- Area: RV/GTO compatibility, stack compositing
- Evidence:
  - `GTOGraphLoader` imports the stack composite mode from session files in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L1280).
  - The compatibility mapping explicitly downgrades `dissolve` and `topmost` to `normal` in [src/composite/BlendModes.ts](/Users/lifeart/Repos/openrv-web/src/composite/BlendModes.ts#L293).
  - `StackGroupNode` then uses that downgraded blend mode during compositing in [src/nodes/groups/StackGroupNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/groups/StackGroupNode.ts#L270).
- Impact:
  - RV/GTO sessions that rely on `dissolve` or `topmost` do not render with their authored stack semantics after import.
  - The downgrade is silent, so sessions appear to load successfully while producing different imagery.

### 25. Project, snapshot, and auto-save persistence omit major live viewer state

- Severity: High
- Area: Persistence, project save/load, auto-save, snapshots
- Evidence:
  - `SessionSerializer.toJSON()` only saves a narrow subset of viewer state in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L73), covering color adjustments, CDL, filters, transform, crop, lens, wipe, stack, noise reduction, watermark, LUT intensity, PAR, and background pattern.
  - The app has additional live controls wired into the viewer for OCIO, display profile, gamut mapping, compare state, tone mapping, ghost frames, and stereo in [src/AppColorWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppColorWiring.ts#L178) and [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L89).
  - `SessionSerializer.fromJSON()` restores none of those omitted states in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L274).
- Impact:
  - Saving a `.orvproject`, snapshot, or auto-save drops significant user-visible state such as OCIO/display profile/gamut mapping/tone mapping/compare/stereo configuration.
  - Restored sessions can load "successfully" while reopening with materially different viewing and color behavior.

### 26. Restore paths leave control UI out of sync with restored state

- Severity: High
- Area: Persistence UI, restore flows
- Evidence:
  - `.orvproject` loading calls `SessionSerializer.fromJSON(...)` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L301) but does not push restored values back into any controls afterward.
  - Snapshot restore and auto-save recovery only resync a small subset of controls in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L233) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L436).
  - Compare and stack UI both expose setters/getters for restored viewer state in [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L1029) and [src/ui/components/StackControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StackControl.ts#L664), but `AppPersistenceManager` does not even depend on those controls.
- Impact:
  - After project load, the visible controls can still show stale pre-load values even though the viewer/session state changed underneath them.
  - After snapshot or auto-save recovery, some controls resync and others do not, so the next user interaction can overwrite restored state with stale UI values.

### 27. Custom LUT persistence is effectively broken for project/snapshot/auto-save workflows

- Severity: Medium
- Area: Persistence, LUT pipeline
- Evidence:
  - Serialization stores only `viewer.getLUT()?.title` as `lutPath` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L96).
  - Restore only reapplies LUT intensity in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L276).
  - The serializer explicitly downgrades the LUT to a warning requiring manual reload in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L301).
- Impact:
  - Project load, snapshot restore, and auto-save recovery do not bring back the active LUT itself.
  - Users can recover a session with the correct LUT blend amount but without the LUT that amount was supposed to modulate.

### 28. The OPFS media cache is initialized and used during restore, but the active media-loading stack never populates it

- Severity: Medium
- Area: Caching, media persistence
- Evidence:
  - The app constructs and initializes `MediaCacheManager` in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L159) and [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L628).
  - `SessionSerializer` is prepared to save and later reload media by `opfsCacheKey` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L180).
  - The active `SessionMedia` file-loading path never writes into `MediaCacheManager` or assigns `opfsCacheKey` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L336), [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L388), and [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L514).
  - The only OPFS write path I found lives in the legacy/orphaned `MediaManager` in [src/core/session/MediaManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaManager.ts#L1023).
- Impact:
  - The advertised fast-reload cache path is effectively dead in the production session stack.
  - Projects can carry cache keys for reload only if they came from legacy code paths, not from normal current media loading.

### 29. External presentation windows never render the viewer and ignore most synced state

- Severity: High
- Area: External presentation, multi-window review
- Evidence:
  - The generated presentation-window HTML contains only a blank `<canvas>` and an info label in [src/ui/components/ExternalPresentation.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExternalPresentation.ts#L150).
  - The child window script handles only `ping` and `syncFrame`, and `syncFrame` merely rewrites the info text in [src/ui/components/ExternalPresentation.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExternalPresentation.ts#L183).
  - The main app still sends frame, playback, and color sync messages to external presentation windows in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L447).
- Impact:
  - Opening external presentation produces a blank shell rather than a synchronized clean viewer.
  - Playback and color sync are emitted by the main app but have no effect in the child window.

### 30. The app still wires a legacy `AudioMixer` pipeline alongside `SessionPlayback`'s `AudioCoordinator`

- Severity: High
- Area: Audio architecture, playback wiring
- Evidence:
  - `App` still constructs and binds `AudioOrchestrator` in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L486), and playback wiring still forwards volume/mute changes to `audioOrchestrator.getAudioMixer()` in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L544).
  - `AudioOrchestrator` listens to `playbackChanged` and `sourceLoaded`, then starts/stops an `AudioMixer` and separately fetches/decodes video audio into mixer tracks in [src/services/AudioOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/AudioOrchestrator.ts#L72).
  - The real session media path already loads video audio through `SessionPlayback`'s `AudioCoordinator` in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L386).
- Impact:
  - The app maintains two live audio systems with overlapping responsibilities.
  - After lazy init and subsequent source loads, video audio can be decoded twice and playback/volume state can diverge between the legacy mixer path and the session-owned audio path.

### 31. Network “View (Pan/Zoom)” sync is only half wired and does not send local view changes

- Severity: High
- Area: Network sync, collaboration, view state
- Evidence:
  - The Network Sync panel advertises a `View (Pan/Zoom)` toggle in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L786).
  - `NetworkSyncManager` has a full `sendViewSync()` path in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L493).
  - I found no non-test production callsite for `sendViewSync()`.
  - On the receive side, `syncView` only applies `viewer.setZoom(payload.zoom)` in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L495), ignoring the rest of the view payload.
- Impact:
  - Enabling view sync does not actually transmit local pan/zoom/view changes from the host app.
  - Even if a `syncView` message arrives, only zoom is applied, so the UI promise of `Pan/Zoom` sync is not met.

### 32. Initial network state transfer omits the host's current color adjustments

- Severity: Medium
- Area: Network sync, initial join state
- Evidence:
  - `AppNetworkBridge` describes the join payload as `full state transfer`, but `sessionStateRequested` only sends `encodeSessionState(...)` plus annotations and notes in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L197).
  - The shared URL/session state capture used there does not include current viewer color adjustments; it only captures frame/range/source/A-B/transform/wipe/OCIO in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L114).
  - Color adjustments are only sent later from live `adjustmentsChanged` events in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L530).
- Impact:
  - A user joining an already-active review session does not inherit the host's current exposure/gamma/contrast/saturation state unless the host changes those controls again after the join.
  - The initial synced image can differ from the host even when the room join succeeds and the session state payload is accepted.

### 33. The multi-source layout UI cannot actually add the current source and offers no way to reassign tile sources

- Severity: High
- Area: View UI, multi-source layout control
- Evidence:
  - The button is labeled `+ Add current source` in [src/ui/components/MultiSourceLayoutControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MultiSourceLayoutControl.ts#L183).
  - Clicking it always adds `source 0`, not the active/current source, in [src/ui/components/MultiSourceLayoutControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MultiSourceLayoutControl.ts#L200).
  - The code comment claims the user can later change the source assignment in the tile row, but the rendered tile row contains only a label and a remove button in [src/ui/components/MultiSourceLayoutControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MultiSourceLayoutControl.ts#L208).
- Impact:
  - The layout tool’s main source-management action does not do what its label promises.
  - In practice the UI cannot build a meaningful multi-source layout from arbitrary loaded sources, which makes the control much less useful than it appears.

### 34. Several toolbar toggle buttons drift out of sync with the actual panel visibility state

- Severity: Medium
- Area: Toolbar UI, panel toggles, active-state feedback
- Evidence:
  - The shared panel utility closes panels on outside click and `Escape` in [src/ui/components/shared/Panel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Panel.ts#L49) and [src/ui/components/shared/Panel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Panel.ts#L111).
  - The Effects tab buttons for Denoise, Watermark, and Slate only set their active styling immediately after their own click in [src/services/tabContent/buildEffectsTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildEffectsTab.ts#L37), with no follow-up visibility subscription.
  - The View tab timeline-editor button has the same one-shot pattern in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L352).
  - The always-visible Conform button also only updates its active state inside the click handler in [src/services/tabContent/buildPanelToggles.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildPanelToggles.ts#L87).
- Impact:
  - These buttons can remain visually “on” after the underlying panel has already closed via outside click or `Escape`.
  - That makes the toolbar state misleading and weakens keyboard/mouse workflows because the controls stop describing the real UI state.

### 35. QC pixel-picking tools use the wrong coordinate model for transformed or letterboxed viewer states

- Severity: High
- Area: QC UI, HSL eyedropper, stereo convergence measurement
- Evidence:
  - The HSL eyedropper maps clicks by querying the first `canvas` in the viewer container and scaling raw container coordinates against `imageData.width / canvas.clientWidth` in [src/services/tabContent/buildQCTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildQCTab.ts#L64).
  - Stereo convergence measurement uses the same pattern in [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L255).
  - The viewer actually stacks multiple canvases and overlays inside the same container in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L693), so `querySelector('canvas')` is not a stable proxy for displayed image space.
  - The app already has a more correct pixel-sampling path that uses the image-canvas rect and explicit coordinate conversion in [src/ui/components/PixelSamplingManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelSamplingManager.ts#L115).
- Impact:
  - These tools can sample the wrong pixel or wrong stereo position when the viewer is zoomed, panned, rotated, letterboxed, or using layered render canvases.
  - The result is a QC workflow that looks available but becomes unreliable exactly in the more complex inspection cases where users need it most.

### 36. The 360-view toolbar button can lie about the current spherical-projection state

- Severity: Medium
- Area: View UI, spherical projection
- Evidence:
  - The `360 View` button only updates its active styling inside its own click handler in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L161).
  - The app also auto-enables and auto-disables spherical projection on source load in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L382).
  - I found no subscription from the button to spherical-projection state changes outside that click path.
- Impact:
  - Loading a 360 source can turn spherical projection on while the toolbar still looks off.
  - Loading a normal source afterward can turn it back off while the button still looks active, so the control stops reflecting the real viewing mode.

### 37. Floating-window QC status can remain stale after switching sources

- Severity: Medium
- Area: View UI, stereo QC feedback
- Evidence:
  - The floating-window button becomes active from `lastResult?.hasViolation` in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L62).
  - `FloatingWindowControl` persists the last detection result until `clearResult()` is called in [src/ui/components/FloatingWindowControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FloatingWindowControl.ts#L55) and [src/ui/components/FloatingWindowControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FloatingWindowControl.ts#L101).
  - The only production clear path I found is when stereo is turned off in [src/AppControlRegistry.ts](/Users/lifeart/Repos/openrv-web/src/AppControlRegistry.ts#L518); I found no clear-on-source-change path.
- Impact:
  - After detecting a violation on one stereo pair, the button can remain lit when the user switches to a different source that has never been checked.
  - That makes the QC indicator look like a live status for the current image when it is really just cached history from an earlier detection run.

### 38. The Compare dropdown exposes a `Quad View` mode that is not wired to the viewer

- Severity: High
- Area: Compare UI, viewer integration
- Evidence:
  - The Compare dropdown exposes a full `Quad View` section with an enable toggle and quadrant selectors in [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L579).
  - The control emits `quadViewChanged` and updates its own active label/state in [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L712) and [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L888).
  - Production viewer wiring handles wipe, A/B, difference matte, and blend modes in [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L87), but there is no `quadViewChanged` subscription there.
- Impact:
  - The UI can show Quad as active even though the viewer never receives a quad-view state change.
  - This makes a prominent comparison mode look implemented while doing nothing in the actual image view.

### 39. Quad-view source selectors expose `C` and `D` concepts that production UI never lets the user bind to real sources

- Severity: High
- Area: Compare UI, source assignment semantics
- Evidence:
  - The quad-view UI lets users assign quadrants to `A`, `B`, `C`, and `D` in [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L624).
  - Session-level production compare APIs only expose `setSourceA`, `setSourceB`, `toggleAB`, and `setCurrentAB` in [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L336).
  - `setSourceC()` and `setSourceD()` exist only inside the low-level compare manager in [src/core/session/ABCompareManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/ABCompareManager.ts#L155), and I found no production caller outside tests.
- Impact:
  - Even before renderer wiring is considered, part of the quad-view UI is semantically empty: users can choose labels that are never mapped to actual loaded media.
  - The control suggests four-source comparison is available when the real app only exposes two-source assignment.

### 40. Several advanced dropdowns and panels can render partly off-screen on narrow viewports

- Severity: Medium
- Area: UI layout, small-window/mobile usability
- Evidence:
  - `CompareControl` explicitly clamps its dropdown to viewport bounds in [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L934).
  - `DisplayProfileControl` positions its dropdown at `rect.left` with no clamping in [src/ui/components/DisplayProfileControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/DisplayProfileControl.ts#L453).
  - `ToneMappingControl` does the same in [src/ui/components/ToneMappingControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ToneMappingControl.ts#L657).
  - `StereoControl` does the same in [src/ui/components/StereoControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoControl.ts#L265).
  - `OCIOControl` uses `Math.min(rect.left, window.innerWidth - 360)` in [src/ui/components/OCIOControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OCIOControl.ts#L1032), which still goes negative when the viewport is narrower than the panel.
- Impact:
  - On small windows or mobile-sized layouts, these controls can open clipped or partially unreachable.
  - The app already has one control that solves this correctly, so this inconsistency shows up as avoidable UI breakage rather than a hard platform limit.

### 41. The tone-mapping shortcut can toggle a hidden flag without actually enabling tone mapping

- Severity: Medium
- Area: Effects UI, keyboard semantics
- Evidence:
  - The tone-mapping control advertises `Shift+Alt+J` in its button title in [src/ui/components/ToneMappingControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ToneMappingControl.ts#L88).
  - The keyboard handler path simply calls `toggle()` in [src/ui/components/ToneMappingControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ToneMappingControl.ts#L791).
  - `toggle()` only flips `enabled` in [src/ui/components/ToneMappingControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ToneMappingControl.ts#L713).
  - The default state still has `operator: 'off'` in [src/core/types/effects.ts](/Users/lifeart/Repos/openrv-web/src/core/types/effects.ts#L24), and the control only considers itself active when `enabled && operator !== 'off'` in [src/ui/components/ToneMappingControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ToneMappingControl.ts#L777).
- Impact:
  - On a fresh state, pressing the advertised shortcut can change internal state without making the control visibly active or changing output.
  - That makes the shortcut feel broken until the user first opens the panel and manually picks a non-`off` operator.


### 43. The volume popout is too narrow to cleanly fit both the slider and the audio-scrub toggle

- Severity: Medium
- Area: Header UI, audio controls
- Evidence:
  - The popout container is hard-capped to `96px` both on hover and when pinned open in [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L149) and [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L193).
  - The slider alone already consumes `80px` plus `16px` of horizontal margin in [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L101).
  - The audio-scrub checkbox and `Scrub` label are then appended after the slider in [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L125), while the container itself has `overflow: hidden` in [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L85).
- Impact:
  - The audio-scrub control is cramped or clipped inside the volume popout instead of being cleanly readable and clickable.
  - A real playback option is present in the DOM and in app wiring, but its header UI makes it unnecessarily hard to discover and use.

### 44. Network Sync has no real in-panel name entry and falls back to generic `Host` / `User` labels when no stored name exists

- Severity: Medium
- Area: Collaboration UI, session identity
- Evidence:
  - `NetworkControl` defines `createRoom` / `joinRoom` events that carry a `userName` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L28).
  - The control now reads `generalPrefs.userName` through `getUserName(...)`, but if that preference is missing it still falls back to generic labels: auto-join/manual join use `User`, and create-room falls back to `Host` / `User`, in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L421), [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L455), [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L960), and [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L980).
  - The visible panel still exposes no direct per-room display-name input, so the collaboration identity shown to peers depends on an external stored preference rather than the join/create flow itself.
- Impact:
  - First-time or shared-browser users can still appear as generic `User` / `Host`, which makes the connected-user list less informative in real sessions.
  - The collaboration stack supports user identity, but the shipped entry flow still does not let users set or confirm that identity where they actually create or join a room.

### 45. Closing HSL Qualifier can leave the eyedropper armed and the viewer in a hidden pick state

- Severity: Medium
- Area: QC UI, HSL Qualifier workflow
- Evidence:
  - The eyedropper only notifies the viewer callback when the button itself is toggled in [src/ui/components/HSLQualifierControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HSLQualifierControl.ts#L251).
  - When the dropdown is closed, the close paths just hide the panel and remove listeners in [src/ui/components/HSLQualifierControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HSLQualifierControl.ts#L718) and [src/ui/components/HSLQualifierControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HSLQualifierControl.ts#L753); they never deactivate the eyedropper or call the callback with `false`.
  - The QC tab wiring keeps a pending viewer click handler and crosshair cursor alive until that callback is explicitly deactivated in [src/services/tabContent/buildQCTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildQCTab.ts#L66).
- Impact:
  - A user can close the HSL panel and still have the next viewer click unexpectedly sampled as a color pick.
  - That leaves the UI in a misleading hidden-tool state where the control looks closed but still captures viewer interaction semantics.

### 46. Playlist OTIO export produces clips with empty media references

- Severity: Medium
- Area: Playlist UI, interchange/export usefulness
- Evidence:
  - The `Export as OTIO` action maps every playlist clip to an `OTIOExportClip` with `sourceUrl: ''` in [src/ui/components/PlaylistPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts#L802).
  - The OTIO writer then serializes that value directly into `ExternalReference.target_url` in [src/utils/media/OTIOWriter.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/OTIOWriter.ts#L88).
- Impact:
  - The UI presents OTIO export as a real interchange action, but the resulting file does not identify the underlying media locations.
  - That makes the exported timeline much less useful outside OpenRV, especially in pipelines that expect OTIO clips to carry resolvable source references.

### 47. ShotGrid versions with frame-sequence paths are shown but cannot actually be loaded from the panel

- Severity: Medium
- Area: ShotGrid integration UI, media loading
- Evidence:
  - `ShotGridPanel.resolveMediaUrl()` only accepts uploaded-movie URLs or HTTP(S) movie paths in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L297).
  - Rows with `sg_path_to_frames` but no movie URL are explicitly labeled `Frame sequence only` in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L457), but their `Load` button is still disabled because `mediaUrl` is `null` in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L475).
  - The integration bridge then ignores `loadVersion` events with `null` media URLs in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L157).
- Impact:
  - The panel can successfully surface a ShotGrid version but still leave the user unable to load it if the version only exposes a frame sequence path.
  - That is a real workflow hole for review pipelines that publish sequences instead of uploaded movies.

### 48. History can be cleared in one click with no confirmation, unlike other destructive review panels

- Severity: Low
- Area: History UI, destructive action safety
- Evidence:
  - The History panel wires its `Clear` button directly to `clearHistory()` in [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L80).
  - `clearHistory()` immediately calls `historyManager.clear()` with no confirmation or undo guard in [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L185).
  - Comparable destructive panel actions do confirm first, such as marker clearing in [src/ui/components/MarkerListPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MarkerListPanel.ts#L292) and snapshot clearing in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L583).
- Impact:
  - A stray click can wipe the visible undo/redo history immediately.
  - This is inconsistent with the rest of the app’s destructive-panel behavior and makes a debugging/review surface easier to erase accidentally than it should be.

### 49. Conform panel browse-based relinking is stubbed out in production

- Severity: Medium
- Area: Conform / Re-link UI, media recovery workflow
- Evidence:
  - The panel exposes per-clip `Browse...` and `Re-link by Folder...` actions in [src/ui/components/ConformPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ConformPanel.ts#L308) and [src/ui/components/ConformPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ConformPanel.ts#L331).
  - Both actions only dispatch custom DOM events instead of opening a picker or calling an application service in [src/ui/components/ConformPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ConformPanel.ts#L349).
  - In production wiring, the app instantiates the panel in [src/services/controls/createPanelControls.ts](/Users/lifeart/Repos/openrv-web/src/services/controls/createPanelControls.ts#L84) and shows it from [src/services/tabContent/buildPanelToggles.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildPanelToggles.ts#L87), but there are no non-test listeners for `conform-browse` or `conform-browse-folder`.
- Impact:
  - The panel looks like it supports manual browse-based recovery, but those buttons do nothing unless a host page adds its own handlers.
  - In the shipped app, users are effectively limited to dropdown suggestions and auto-relink, even though the UI advertises richer recovery actions.

### 50. Notes import silently replaces the entire local note set

- Severity: Medium
- Area: Notes UI, import safety
- Evidence:
  - The Notes panel `Import` action reads the JSON file and passes its `notes` array straight into `noteManager.fromSerializable(...)` in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L846).
  - `NoteManager.fromSerializable()` starts by clearing all existing notes before inserting the imported ones in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L247).
  - The UI does not label this as a replace operation and does not ask for confirmation beforehand.
- Impact:
  - Importing a notes file can wipe current local review notes unexpectedly instead of merging them.
  - That is a risky behavior mismatch for a panel action labeled only `Import`, especially in collaborative review workflows where users may expect additive import.

### 51. The Notes panel badge exists in code and tests but is never attached to the real toolbar

- Severity: Low
- Area: Annotate UI, note awareness
- Evidence:
  - `NotePanel` implements `createBadge()` and keeps it updated with the open-note count for the current source in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L289).
  - The badge behavior is explicitly tested in [src/ui/components/NotePanel.test.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.test.ts#L748).
  - Production Annotate-tab wiring only renders the `Notes` button in [src/services/tabContent/buildAnnotateTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildAnnotateTab.ts#L63), and the only production `createBadge()` mount I found is for luminance visualization in [src/services/tabContent/buildQCTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildQCTab.ts#L61).
- Impact:
  - Users do not get the intended at-a-glance note count indicator even though the panel already implements it.
  - That makes open notes easier to miss during review, especially when the Notes panel is closed.

### 52. Client Mode hides almost none of the real UI because its restriction selectors do not match production DOM

- Severity: High
- Area: Review-safe UI mode, presentation locking
- Evidence:
  - `ClientMode` defines its restricted UI surface entirely through selectors like `[data-panel="color"]` and `[data-toolbar="editing"]` in [src/ui/components/ClientMode.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClientMode.ts#L79).
  - `LayoutOrchestrator.applyClientModeRestrictions()` just queries those selectors and sets `display: none` in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L615).
  - I could not find any production elements that actually use `data-panel=` or `data-toolbar=` attributes; the only matches are tests and the selector list itself.
- Impact:
  - URL-locked client mode can still leave most editing UI visible even though the feature is supposed to present a review-safe interface.
  - That creates a misleading “locked” mode where parts of the UI still look available even if some actions are blocked elsewhere.

### 53. The right inspector can reopen with stale or empty content because it drops updates while hidden

- Severity: Medium
- Area: Right panel UI, media/scopes awareness
- Evidence:
  - `RightPanelContent.updateInfo()` bails out entirely when the panel root has `display: none` in [src/ui/layout/panels/RightPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/RightPanelContent.ts#L170).
  - That behavior is explicitly tested in [src/ui/layout/panels/RightPanelContent.test.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/RightPanelContent.test.ts#L158), where reopening still shows `No media loaded`.
  - The embedded `MiniHistogram` has the same hidden-update guard in [src/ui/layout/panels/MiniHistogram.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/MiniHistogram.ts#L99), and its tests also confirm skipped updates while hidden.
- Impact:
  - If the inspector is hidden during a source change or histogram update, reopening it can show stale metadata or the placeholder instead of the current source state.
  - That makes the right-side review panel less trustworthy exactly when users rely on it for quick context after switching media.

### 54. The multi-source layout button advertises an `L` shortcut that does not exist in production

- Severity: Medium
- Area: View toolbar, multi-source layout UI
- Evidence:
  - The mounted layout control button tooltip says `Layout modes (L)` in [src/ui/components/MultiSourceLayoutControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MultiSourceLayoutControl.ts#L60).
  - There is no corresponding layout-mode `L` binding in the default shortcut map; `KeyL` is already bound to playback speed-up in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L59).
  - The only layout keyboard bindings in production are preset switches on `Alt+1..Alt+4`, not a mode toggle.
- Impact:
  - The View toolbar advertises a keyboard affordance that users cannot actually use.
  - Pressing `L` changes playback speed instead of opening or cycling layout modes, which is a misleading and easy-to-hit mismatch.

### 55. The volume tooltip still frames mute as a video-only action even though the shortcut is wired as a generic audio toggle

- Severity: Low
- Area: Header audio UI, shortcut discoverability
- Evidence:
  - The mounted mute button tooltip says `Toggle mute (Shift+M in video mode)` in [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L51).
  - The actual shortcut map describes the binding generically as `Toggle audio mute` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L761) through [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L764).
  - The keyboard action path routes `audio.toggleMute` straight to `session.toggleMute()` with no video-mode guard in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L709).
- Impact:
  - The visible tooltip makes the mute shortcut sound narrower than the actual behavior, so users can assume it only applies in a special “video mode.”
  - That weakens one of the few discoverable audio hints in the shipped header UI.

### 56. Sequence export uses a one-off popup instead of the real export progress dialog

- Severity: Medium
- Area: Export UI consistency, long-running workflow feedback
- Evidence:
  - Frame-sequence export builds its own bare `div` popup inline in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L269) and appends it directly to `document.body` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L329).
  - That popup has no modal backdrop, no `role="dialog"`, no keyboard handling, and no focus management.
  - Video export already uses the proper `ExportProgressDialog` component with backdrop, `aria-modal`, progress semantics, and Escape/cancel handling in [src/ui/components/ExportProgress.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportProgress.ts#L42).
- Impact:
  - Exporting a frame sequence gives a weaker, less accessible progress UI than exporting MP4 even though both are long-running export workflows.
  - Background UI remains interactive during sequence export, and the user cannot rely on the same keyboard/modal behavior the app uses for video export.

### 57. The Help menu exposes “Custom Key Bindings”, but production never surfaces the full shortcut editor with import/export

- Severity: Low
- Area: Help / customization UI
- Evidence:
  - The Help menu routes `Custom Key Bindings` into `showCustomBindingsDialog()` via [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L993).
  - The production dialog is only a simple inline rebind table in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L474), with no import/export actions.
  - A dedicated `ShortcutEditor` component already exists with `Reset All`, `Export`, and `Import` controls in [src/ui/components/ShortcutEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShortcutEditor.ts#L306), but it is not what the real app opens from Help.
- Impact:
  - Users can rebind keys one-by-one, but they cannot import or export keybinding sets from the shipped customization entry point.
  - The app carries a richer shortcut-management UI that is effectively unreachable, so the visible customization flow is less useful than the implemented feature set suggests.

### 58. The app ships two different shortcut-reference UIs, and different entry points open different ones

- Severity: Low
- Area: Help / shortcut discoverability
- Evidence:
  - The `?` shortcut toggles the `ShortcutCheatSheet` overlay through `help.toggleCheatSheet` in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L687), and that overlay is instantiated in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L353).
  - The Help menu’s `Keyboard Shortcuts` item does not open that overlay; it routes to `showShortcutsDialog()` through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L992) and [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L57).
  - `showShortcutsDialog()` is a separate hardcoded modal implementation in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L113), not the same component as `ShortcutCheatSheet`.
- Impact:
  - Users can reach two different “shortcut help” UIs depending on whether they press `?` or use the Help menu.
  - That split creates duplicate display logic and makes the shortcut documentation surface easier to drift, which is already happening elsewhere in the app.

### 59. The main tab bar is marked up as a tablist but does not support arrow-key tab navigation

- Severity: Medium
- Area: Primary navigation, keyboard accessibility
- Evidence:
  - The mounted control uses `role="tablist"` on the container and `role="tab"` on each tab button in [src/ui/components/layout/TabBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/TabBar.ts#L45) and [src/ui/components/layout/TabBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/TabBar.ts#L100).
  - There are no per-tab `keydown` handlers for `ArrowLeft`, `ArrowRight`, `Home`, or `End`; the component only changes tabs on click and on the global number shortcuts handled by `handleKeyboard()` in [src/ui/components/layout/TabBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/TabBar.ts#L214).
  - Focus is kept on the active tab via roving `tabindex`, so keyboard users naturally land on the tabstrip but cannot move between tabs with the expected keys.
- Impact:
  - Keyboard and assistive-technology users get a control that announces itself as a tablist but behaves more like a row of plain buttons.
  - Once focus is in the tab bar, the expected left/right tab navigation does not work, which makes primary navigation less accessible than the markup implies.

### 60. The left inspector’s “All Controls…” button can close the full color panel instead of opening it

- Severity: Medium
- Area: Left panel UI, color workflow
- Evidence:
  - The compact left-panel button is labeled `All Controls…` in [src/ui/layout/panels/LeftPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/LeftPanelContent.ts#L116).
  - Its click handler calls `colorControls.toggle()` rather than a one-way open/show action in [src/ui/layout/panels/LeftPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/LeftPanelContent.ts#L131).
- Impact:
  - A button that reads like “open the full panel” can instead hide it if the color controls are already open.
  - That makes the compact inspector feel unstable: the same affordance can either reveal more controls or unexpectedly remove them.

### 61. Several review panels still stack in the same top-right slot and can obscure each other

- Severity: Medium
- Area: Floating panel layout, review workflow
- Evidence:
  - `HistoryPanel`, `MarkerListPanel`, and `NotePanel` all render at the same fixed corner position: `right: 10px; top: 60px` in [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L43), [src/ui/components/MarkerListPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MarkerListPanel.ts#L72), and [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L80).
  - Production wiring only declares mutual exclusion for `NotePanel` and `MarkerListPanel` in [src/services/controls/createPanelControls.ts](/Users/lifeart/Repos/openrv-web/src/services/controls/createPanelControls.ts#L59).
  - `HistoryPanel` is created alongside them in the same factory but is not part of that exclusion logic in [src/services/controls/createPanelControls.ts](/Users/lifeart/Repos/openrv-web/src/services/controls/createPanelControls.ts#L53).
- Impact:
  - Users can open History together with Notes or Markers and end up with overlapping floating panels competing for the same space.
  - That makes simultaneous review tasks harder because one panel can partially hide another instead of cooperating spatially.

### 62. The export button says “Export current frame”, but clicking it only opens the menu

- Severity: Low
- Area: Header export UI, action semantics
- Evidence:
  - The mounted button is labeled and titled as `Export current frame (Ctrl+S)` in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L61).
  - Its click handler does not export anything; it only calls `toggleDropdown()` in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L81).
  - The actual quick-export path lives separately in the keyboard/action wiring, where `exportRequested` is handled by `viewer.exportFrame(...)` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L127).
- Impact:
  - The visible button copy suggests a primary one-click action, but the control actually behaves as a menu trigger.
  - That mismatch makes the header less predictable: the keyboard shortcut performs a direct export, while the matching toolbar button does not.

### 63. Side-panel tabs are marked up as tabs but do not behave like tabs

- Severity: Medium
- Area: Left/right inspector navigation, keyboard accessibility
- Evidence:
  - The side-panel tab strips are declared as `role="tablist"` in [src/ui/layout/LayoutManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/LayoutManager.ts#L214).
  - Each tab button gets `role="tab"` and only a click handler in [src/ui/layout/LayoutManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/LayoutManager.ts#L463).
  - The implementation does not add arrow-key handling, `Home`/`End` handling, `aria-controls`, or roving `tabindex`; it only swaps content visibility by setting `tab.element.style.display` in [src/ui/layout/LayoutManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/LayoutManager.ts#L481).
- Impact:
  - Keyboard users can tab onto the inspector tabs, but they do not get the expected tab semantics once there.
  - The side inspectors present themselves as structured tab interfaces while behaving like uncoordinated buttons, which makes the navigation model inconsistent with the main app chrome.

### 64. Keyboard zone navigation skips the left and right inspector panels entirely

- Severity: Medium
- Area: Keyboard accessibility, layout navigation
- Evidence:
  - `LayoutOrchestrator` registers focus zones only for `headerBar`, `tabBar`, `contextToolbar`, `viewer`, and `timeline` in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L314).
  - The layout itself mounts separate left and right panel wrappers with interactive content in [src/ui/layout/LayoutManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/LayoutManager.ts#L136) and [src/ui/layout/LayoutManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/LayoutManager.ts#L241).
  - Those side panels are never added to `FocusManager`, so the app’s documented F6-style zone navigation cannot land on them.
- Impact:
  - Users navigating by keyboard can cycle across the header, tab strip, viewer, and timeline, but not the side inspectors that hold color/history/media-info controls.
  - That leaves part of the shipped UI effectively mouse-only even though the app already has a zone-navigation system intended to solve exactly this problem.

### 65. Inspector accordion headers are mouse-only despite gating most side-panel content

- Severity: Medium
- Area: Left/right inspector usability, keyboard accessibility
- Evidence:
  - The reusable section header in [src/ui/layout/panels/CollapsibleSection.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/CollapsibleSection.ts#L30) is built as a plain `div`, not a button.
  - Expansion/collapse is wired only through a click listener in [src/ui/layout/panels/CollapsibleSection.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/CollapsibleSection.ts#L59), with no `tabindex`, keyboard handler, or ARIA expanded state.
  - Those sections gate core left/right panel content such as Color, History, Scopes, and Media Info in [src/ui/layout/panels/LeftPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/LeftPanelContent.ts#L90) and [src/ui/layout/panels/RightPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/RightPanelContent.ts#L47).
- Impact:
  - Users can visually see expandable sections in the side inspectors, but keyboard navigation cannot operate them.
  - Because major inspector content is hidden behind these accordions, the side panels become partially unusable without a mouse.

### 66. The right inspector’s scope buttons never show which scopes are actually active

- Severity: Low
- Area: Right panel UI truthfulness, scopes workflow
- Evidence:
  - `RightPanelContent` renders dedicated `H`, `W`, `V`, and `G` scope toggle buttons and stores them in `scopeButtons` in [src/ui/layout/panels/RightPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/RightPanelContent.ts#L59) and [src/ui/layout/panels/RightPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/RightPanelContent.ts#L96).
  - Those buttons only call `scopesControl.toggleScope(type)` on click in [src/ui/layout/panels/RightPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/RightPanelContent.ts#L95); the component never listens for scope visibility changes and never updates button styling afterward.
  - The rest of the app does maintain active-state wiring for scope controls elsewhere, for example in the QC toolbar listeners in [src/services/tabContent/buildQCTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildQCTab.ts#L108).
- Impact:
  - The right inspector offers scope toggles with no visible “on/off” truth, so users cannot tell from that panel which scopes are currently active.
  - Scope state can be changed from the QC toolbar or shortcuts while the inspector buttons remain visually unchanged, which makes the panel a weak status surface.

### 67. The header loop button advertises the wrong shortcut

- Severity: Low
- Area: Playback header, shortcut discoverability
- Evidence:
  - The loop button tooltip is set to `Cycle loop mode (L)` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L318).
  - The actual keybinding for `timeline.cycleLoopMode` is `Ctrl+L`, not plain `L`, in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L109).
  - Plain `L` is already occupied by playback speed-up in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L59).
- Impact:
  - The playback header teaches a shortcut that triggers a different action than the one shown.
  - Users relying on tooltips to learn the app will hit playback-speed changes when they expect loop-mode changes.

### 68. The Info panel is shipped as a simple on/off overlay even though its real customization features have no UI

- Severity: Low
- Area: Review overlays, feature reachability
- Evidence:
  - `InfoPanel` implements configurable position and per-field visibility through `setPosition(...)`, `setFields(...)`, and `toggleField(...)` in [src/ui/components/InfoPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/InfoPanel.ts#L152), [src/ui/components/InfoPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/InfoPanel.ts#L168), and [src/ui/components/InfoPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/InfoPanel.ts#L184).
  - The only production UI affordance wired for it is a single header toggle button in [src/services/tabContent/buildPanelToggles.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildPanelToggles.ts#L24), which just calls `registry.infoPanel.toggle()`.
  - The runtime wiring updates the panel’s content data, but not its configuration surface, in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L558).
- Impact:
  - Users can turn the Info panel on and off, but they cannot actually choose its corner or which metadata fields it shows from the shipped UI.
  - The component advertises a richer, review-friendly overlay model than the app currently makes reachable.

### 69. The mini histogram promises to open the full histogram, but it actually toggles it

- Severity: Low
- Area: Right inspector, scopes UX
- Evidence:
  - The embedded histogram canvas advertises `Click to open full Histogram` in [src/ui/layout/panels/MiniHistogram.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/MiniHistogram.ts#L45).
  - Its click handler does not perform a one-way open; it calls `scopesControl.toggleScope('histogram')` in [src/ui/layout/panels/MiniHistogram.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/MiniHistogram.ts#L55).
- Impact:
  - Clicking the mini histogram can close the full histogram when the user expected an “open” affordance.
  - That makes the right-panel scopes preview less predictable, especially when users bounce between the inspector and the QC toolbar.

### 70. The auto-save indicator keeps the same accessible label even when it changes from settings to retry

- Severity: Low
- Area: Header utility UI, accessibility
- Evidence:
  - `AutoSaveIndicator` is now keyboard-focusable and button-like, with `tabindex="0"`, `role="button"`, and Enter/Space activation in [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L88) through [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L104).
  - Its accessible name is hardcoded once as `Auto-save settings` in [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L89) through [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L91).
  - In the error state the same control becomes a retry surface, with visible text `Save failed`, tooltip `Auto-save failed - click to retry`, and click behavior that calls the retry callback in [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L106) through [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L113) and [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L514) through [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L520).
- Impact:
  - Screen-reader and keyboard users are told the control is for settings even when the live action has switched to retrying a failed auto-save.
  - That makes the error-recovery affordance less understandable precisely when the user needs it most.

### 71. The playback-speed control advertises a menu button, but default activation does not open its menu

- Severity: Medium
- Area: Playback header, control semantics
- Evidence:
  - The speed button declares `aria-haspopup="menu"` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L622).
  - Its normal click handler cycles playback speed instead of opening the menu in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L660).
  - The actual preset menu is only available through right-click or `Shift+Enter` / `Shift+Space` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L663) and [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L668).
- Impact:
  - Assistive-tech and keyboard users encounter a control that announces menu semantics but does something else on standard activation.
  - The full speed preset list is effectively hidden behind non-obvious alternate gestures, which makes the control harder to understand and less useful than it looks.

### 72. Notes and markers still rely on clickable text for key actions, leaving parts of review workflow mouse-only

- Severity: Medium
- Area: Notes/markers review panels, keyboard accessibility
- Evidence:
  - `MarkerListPanel` uses plain text elements for navigation and editing affordances: the frame label click-to-jump in [src/ui/components/MarkerListPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MarkerListPanel.ts#L548), the note text click-to-edit in [src/ui/components/MarkerListPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MarkerListPanel.ts#L730), and the empty-note hint click-to-edit in [src/ui/components/MarkerListPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MarkerListPanel.ts#L745).
  - `NotePanel` likewise uses a plain `span` for frame-jump interaction in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L536), and the whole note card itself becomes a click target for navigation in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L718).
  - Those elements are not buttons and do not receive keyboard activation wiring.
- Impact:
  - Important review actions like “jump to this note/marker” and “edit this marker note” work by mouse click but are not reachable as proper controls from the keyboard.
  - The panels are visually rich and interactive, but some of their most common actions still behave like hidden mouse gestures rather than explicit UI controls.

### 73. Several header menu buttons open popups without exposing expanded state

- Severity: Low
- Area: Header accessibility, menu truthfulness
- Evidence:
  - The layout menu button correctly manages `aria-expanded` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L376), [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1227), and [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1232).
  - By contrast, the Sources button only sets `aria-haspopup="menu"` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L268) and then delegates to `DropdownMenu.toggle(...)` without ever syncing `aria-expanded` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L264).
  - The Help button also sets `aria-haspopup="menu"` without maintaining `aria-expanded` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L432), and the speed button has the same gap in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L622).
- Impact:
  - Similar header controls report different accessibility state quality even though they all open menus.
  - Screen-reader and keyboard users do not get reliable open/closed state feedback for several header popups, which makes the header feel inconsistent and harder to trust.

### 74. Custom header menus trap `Tab` back onto their trigger instead of letting focus continue

- Severity: Medium
- Area: Header keyboard navigation, accessibility
- Evidence:
  - The speed menu intercepts `Tab`, calls `preventDefault()`, closes, and forces focus back to the anchor in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L930).
  - The help menu does the same in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1066).
  - The layout menu repeats the same pattern in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1208).
- Impact:
  - Keyboard users cannot tab through the header naturally after opening one of these menus, because focus snaps back to the trigger instead of advancing.
  - That makes the custom header menus feel stickier and less usable than the shared dropdowns elsewhere in the app, which close on `Tab` without hijacking focus flow.

### 75. Pixel Probe `Source` mode silently falls back to rendered values on the WebGL / HDR path

- Severity: High
- Area: QC tools, measurement correctness
- Evidence:
  - In the WebGL / HDR branch, `PixelSamplingManager` samples the displayed float pixels and always forwards them through `updateFromHDRValues(...)` in [src/ui/components/PixelSamplingManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelSamplingManager.ts#L131) and [src/ui/components/PixelSamplingManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelSamplingManager.ts#L279).
  - The pre-grade `sourceImageData` path is only populated in the 2D-canvas branch when `getSourceMode() === 'source'` in [src/ui/components/PixelSamplingManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelSamplingManager.ts#L191).
  - `PixelProbe` itself treats missing `sourceImageData` as a silent fallback to the rendered image in [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L652).
- Impact:
  - On the common graded / GL-rendered path, the probe can show `Source` in the UI while still reporting post-pipeline values.
  - That makes the probe unreliable for real QC tasks where users are explicitly trying to compare original pixel values against rendered output.

### 76. Viewer timecode overlay ignores source start-frame offsets, and exported frameburn inherits the wrong offset

- Severity: High
- Area: Viewer overlays, export correctness
- Evidence:
  - App-level timecode offset sync only updates the goto-frame overlay and the header timecode display in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L767).
  - The viewer `TimecodeOverlay` does support its own `startFrame` offset in [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L235), but that setter is never wired from app bootstrap.
  - Exported frameburn options are taken from the viewer overlay’s state, including `timecodeOverlay.getStartFrame()`, in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3334).
- Impact:
  - The viewer overlay can show different timecode than the header for sources with non-zero start-frame offsets.
  - Frame exports that include timecode burn-in can inherit the same wrong offset, so the exported image disagrees with the rest of the app UI.

### 77. The viewer timecode overlay is effectively hidden from the shipped UI

- Severity: Medium
- Area: View overlays, discoverability and usefulness
- Evidence:
  - The feature is wired to a keyboard-only action: `view.toggleTimecodeOverlay` is defined in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L477) and mapped in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L392).
  - The shipped View toolbar exposes Info Strip and FPS toggles, but no timecode overlay control, in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L398).
  - `TimecodeOverlay` has real user-facing configuration surface in code, including position, font size, frame counter, and background opacity, in [src/ui/components/TimecodeOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimecodeOverlay.ts#L18).
- Impact:
  - A visible viewer overlay feature exists, but normal users have no in-app way to discover or configure it unless they already know the hidden shortcut.
  - Because the same overlay state feeds export frameburn, a feature with output impact is effectively missing from the production UI.

### 78. The FPS indicator has rich persisted settings, but the shipped UI only exposes a binary toggle

- Severity: Medium
- Area: View overlays, settings reachability
- Evidence:
  - The View tab only exposes a single `Toggle FPS indicator` button in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L415).
  - `FPSIndicator` itself carries real settings for position, dropped-frame visibility, target-FPS visibility, background opacity, and warning / critical thresholds in [src/ui/components/FPSIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FPSIndicator.ts#L23).
  - Those settings are persisted through `FPSIndicatorPrefs` in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L101).
- Impact:
  - Users can only turn the HUD on or off, while every other meaningful aspect of its behavior is hidden behind internal state or persisted prefs.
  - If the indicator ever ends up in a non-default configuration, the shipped UI offers no way to inspect, tune, or reset what the HUD is actually showing.

### 79. Pixel Probe exposes copyable value rows as mouse-only `div`s

- Severity: Medium
- Area: QC tools, keyboard accessibility
- Evidence:
  - The generic Pixel Probe value rows are built as plain `div` containers with only hover and click handlers in [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L578).
  - The HDR `Nits` row is implemented the same way in [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L300).
  - Those rows are presented as explicit copy actions in the overlay, but they are never given button semantics, focusability, or keyboard activation.
- Impact:
  - Keyboard users can reach the probe’s format/source buttons, but not the visible “click row to copy” actions that the overlay itself advertises.
  - A core QC tool ends up partially mouse-only even though its on-screen layout looks like a complete interactive panel.

### 80. Several custom popups bypass the shared dropdown primitive and lose its keyboard navigation

- Severity: Medium
- Area: View/QC control consistency, keyboard usability
- Evidence:
  - The shared [src/ui/components/shared/DropdownMenu.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/shared/DropdownMenu.ts#L429) already implements arrow-key navigation, `Home`/`End`, `Enter`/`Space`, and close-on-`Tab` behavior for popup lists.
  - `DisplayProfileControl` declares menu/radio semantics in [src/ui/components/DisplayProfileControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/DisplayProfileControl.ts#L55) and [src/ui/components/DisplayProfileControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/DisplayProfileControl.ts#L122), but each profile option only gets click handlers in [src/ui/components/DisplayProfileControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/DisplayProfileControl.ts#L147), and the popup-level key handling only closes on `Escape` in [src/ui/components/DisplayProfileControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/DisplayProfileControl.ts#L465).
  - `MultiSourceLayoutControl` exposes its own fixed popup in [src/ui/components/MultiSourceLayoutControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MultiSourceLayoutControl.ts#L58) and builds mode rows as click-only buttons in [src/ui/components/MultiSourceLayoutControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MultiSourceLayoutControl.ts#L367), with no matching popup keyboard navigation layer.
  - `BackgroundPatternControl` marks its popup as a `radiogroup` in [src/ui/components/BackgroundPatternControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/BackgroundPatternControl.ts#L103), but individual items only support click plus `Enter`/`Space` in [src/ui/components/BackgroundPatternControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/BackgroundPatternControl.ts#L283), so users cannot browse the radio set with arrow keys.
- Impact:
  - Similar controls behave inconsistently depending on whether they use the shared dropdown utility or a bespoke popup.
  - Keyboard users lose fast list navigation in several real production controls even though the app already has a working implementation for that behavior.

### 81. Safe Areas ships only the binary guide toggles while real overlay customization stays unreachable

- Severity: Medium
- Area: View overlays, usefulness
- Evidence:
  - `SafeAreasControl` still describes itself as a dropdown for safe-area presets with guide color and opacity controls in [src/ui/components/SafeAreasControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts#L1).
  - The actual popup only exposes enable/title-safe/action-safe/center-crosshair/rule-of-thirds toggles plus an aspect-ratio preset list in [src/ui/components/SafeAreasControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts#L109) and [src/ui/components/SafeAreasControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasControl.ts#L153).
  - The mounted overlay still carries `guideColor`, `guideOpacity`, and a `custom` aspect ratio mode in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L20), with dedicated setters in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L141).
  - Those setters are not called anywhere in production UI code; the remaining references are tests.
- Impact:
  - Users can enable the overlay, but they cannot tune its line visibility or define a custom framing ratio even though the live overlay and persisted state support both.
  - The control presents Safe Areas as a complete review tool while shipping only a reduced subset of the functionality the app actually implements.

### 82. Watermark panel drops the overlay's custom-position mode on the floor

- Severity: Medium
- Area: Effects panel, watermark usability
- Evidence:
  - The watermark panel only renders the 3x3 preset grid in [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L174) and [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L191).
  - The live overlay still supports a distinct `custom` position with persisted `customX` / `customY` coordinates in [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L331).
  - Saved snapshot / recovery state is pushed straight back into the watermark control in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L241) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L444), so production can restore watermark states that the panel itself cannot represent.
- Impact:
  - A restored or programmatically configured custom watermark position has no matching UI state in the panel, so users cannot tell which placement is active.
  - Any edit from the panel snaps the watermark back onto the nearest preset workflow, which makes the persisted custom-position capability effectively unmanageable from the shipped UI.

### 83. Client mode hides restricted UI one-way and does not restore it when the mode is turned off

- Severity: Medium
- Area: Review mode, layout state
- Evidence:
  - The app initializes a real `ClientMode` state object in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L133).
  - Layout orchestration only reacts to client-mode state changes when `enabled` becomes true in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L589).
  - `applyClientModeRestrictions()` mutates matching elements to `style.display = 'none'` in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L615), and there is no inverse path that restores the previous display state when client mode is later disabled.
- Impact:
  - Any host or embedding flow that enables review/client mode and then turns it back off leaves parts of the editing UI hidden until a full reload.
  - The mode behaves like a destructive layout mutation instead of a reversible presentation state, which makes API-driven review workflows unreliable.

### 84. Info Strip ships as a toggle-only overlay while its opacity control stays hidden

- Severity: Low
- Area: View overlays, usefulness
- Evidence:
  - The live info-strip state includes `backgroundOpacity` in [src/ui/components/InfoStripOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/InfoStripOverlay.ts#L15), and the overlay renders that value into its background in [src/ui/components/InfoStripOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/InfoStripOverlay.ts#L84).
  - Production UI only exposes a View-tab toggle button in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L398) plus the keyboard path/full-path toggle in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L393).
  - There is no production control path that adjusts `backgroundOpacity`; the remaining references are component tests.
- Impact:
  - Users can show the strip and flip between basename and full-path display, but they cannot tune how intrusive the overlay is against different footage.
  - Another viewer HUD ships as a binary on/off feature even though the live overlay already supports a more practical review setting.

### 85. EXR window overlay exposes only a binary toggle while the useful per-window controls stay unreachable

- Severity: Medium
- Area: View overlays, EXR review
- Evidence:
  - `EXRWindowOverlay` supports separate `showDataWindow` / `showDisplayWindow` toggles, independent colors, line width, dash pattern, and labels in [src/ui/components/EXRWindowOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/EXRWindowOverlay.ts#L22) and [src/ui/components/EXRWindowOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/EXRWindowOverlay.ts#L149).
  - The shipped View tab only mounts a single icon button that calls `viewer.getEXRWindowOverlay().toggle()` in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L381).
  - There is no other production UI path for the per-window visibility or styling settings; the remaining references are tests.
- Impact:
  - Artists can turn the EXR boundary overlay on, but they cannot isolate just the data window or just the display window, which is often the whole point of checking these boundaries.
  - The overlay’s most useful review controls exist in code but are absent from the shipped UI, so the feature lands as a blunt diagnostic instead of a practical EXR inspection tool.

### 86. Bug overlay is implemented in the viewer but has no production entry point

- Severity: Medium
- Area: Viewer overlays, branding/review workflows
- Evidence:
  - The viewer exposes a real bug/logo overlay via [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3783), backed by `OverlayManager.getBugOverlay()` in [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L246).
  - `BugOverlay` itself is a complete feature with image loading, corner placement, size, opacity, and margin controls in [src/ui/components/BugOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/BugOverlay.ts#L57).
  - There is no View-tab button, panel, or keyboard action that references `getBugOverlay()`; the remaining matches are the viewer/overlay-manager plumbing and tests.
- Impact:
  - A potentially useful review/branding overlay is effectively absent from the shipped app even though the underlying feature is implemented.
  - Teams that need a persistent logo or channel-identification bug cannot activate or configure it without adding new UI or calling private APIs.

### 87. Matte overlay is fully implemented but unreachable from the shipped UI

- Severity: Medium
- Area: Viewer overlays, framing/review tools
- Evidence:
  - `MatteOverlay` is a complete letterbox/pillarbox feature with aspect, opacity, and center-point controls in [src/ui/components/MatteOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MatteOverlay.ts#L1).
  - The overlay is eagerly created in the viewer stack via [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L111) and exposed through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3719).
  - There is no tab button, panel, or keyboard action that references `getMatteOverlay()`; the only production matches are the viewer/overlay-manager plumbing.
- Impact:
  - Users have no way to turn on or tune an overlay that would be directly useful for aspect-framing and letterbox review.
  - The app carries a finished framing tool in the runtime layer without shipping the UI needed to use it.

### 88. Clipping overlay ships as a binary histogram toggle while its useful controls stay hidden

- Severity: Medium
- Area: QC tools, clipping review
- Evidence:
  - `ClippingOverlay` supports separate highlight/shadow toggles plus configurable overlay opacity in [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L14) and [src/ui/components/ClippingOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClippingOverlay.ts#L139).
  - Production wiring only connects the histogram footer click target to `enable()` / `disable()` in [src/services/tabContent/buildQCTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildQCTab.ts#L128), and the histogram UI itself only advertises “Click to toggle clipping overlay on viewer” in [src/ui/components/Histogram.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Histogram.ts#L175).
  - There is no production UI path for `showHighlights`, `showShadows`, or `opacity`; the remaining references are tests.
- Impact:
  - Users can only switch the clipping visualization on or off, even though real grading review often needs highlights-only, shadows-only, or lower-opacity inspection.
  - The app ships a more capable clipping-analysis feature than the UI actually allows people to use.

### 89. Reference comparison exposes only capture/on-off while the real comparison modes stay inaccessible

- Severity: Medium
- Area: View tools, reference comparison
- Evidence:
  - The View tab only exposes `Capture reference frame` and `Toggle reference comparison` in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L96) and [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L105).
  - `ReferenceManager` still carries `viewMode`, `opacity`, and `wipePosition` as first-class state in [src/ui/components/ReferenceManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ReferenceManager.ts#L25).
  - The viewer renderer does honor multiple reference view modes and overlay opacity in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3812) and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3853), but there is no production control path for selecting those modes.
  - `wipePosition` is even worse: it exists in `ReferenceManager`, but the viewer hardcodes split comparisons to `0.5` in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3859) and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3868), with no production consumer for the stored value.
- Impact:
  - Users can capture a reference image, but they cannot choose whether to compare it as overlay, vertical split, horizontal split, side-by-side, or toggle despite the renderer supporting those modes.
  - Part of the persisted reference state model is effectively dead, so the feature looks much simpler in the shipped UI than the underlying implementation and tests imply.

### 90. Spotlight ships as a bare toggle while most of the tool's real controls are hidden

- Severity: Medium
- Area: View tools, spotlight review aid
- Evidence:
  - Production UI only exposes a Spotlight toggle button in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L364) and the matching keyboard action in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L402).
  - `SpotlightOverlay` supports shape switching, explicit position/size control, dim amount, and feather settings in [src/ui/components/SpotlightOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SpotlightOverlay.ts#L313) through [src/ui/components/SpotlightOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SpotlightOverlay.ts#L350).
  - There is no production panel or dropdown that exposes those settings; the remaining non-test wiring only toggles the overlay.
- Impact:
  - Users can move and resize the default spotlight directly on the canvas, but they cannot switch to the rectangular mode or tune how strong and soft the isolation effect is.
  - A review aid that is implemented as a configurable tool ships as a much narrower fixed-behavior overlay.

### 91. The shipped slate panel exposes only a small subset of the slate feature it actually drives

- Severity: Medium
- Area: Effects panel, export usability
- Evidence:
  - The production slate panel only builds inputs for show, shot, version, artist, date, background color, font size, logo upload, and manual preview generation in [src/AppControlRegistry.ts](/Users/lifeart/Repos/openrv-web/src/AppControlRegistry.ts#L567) through [src/AppControlRegistry.ts](/Users/lifeart/Repos/openrv-web/src/AppControlRegistry.ts#L765).
  - The underlying `SlateEditor` state and config model also support custom fields, text and accent colors, logo position, logo scale, and explicit output resolution in [src/ui/components/SlateEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SlateEditor.ts#L67), [src/ui/components/SlateEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SlateEditor.ts#L201), [src/ui/components/SlateEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SlateEditor.ts#L387), [src/ui/components/SlateEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SlateEditor.ts#L401), and [src/ui/components/SlateEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SlateEditor.ts#L473).
  - The slate metadata model also supports frame in/out, FPS, resolution, codec, and color-space fields in [src/export/SlateRenderer.ts](/Users/lifeart/Repos/openrv-web/src/export/SlateRenderer.ts#L54), and export prepends whatever `controls.slateEditor.generateConfig()` returns in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L531).
- Impact:
  - Users can technically export a slate, but they cannot configure many of the fields and layout controls that the runtime slate generator already supports.
  - The shipped panel makes the slate feature look much simpler than the real export path, which reduces usefulness for actual review deliverables.

### 92. Slate logo upload failures are swallowed without any user-visible feedback

- Severity: Medium
- Area: Effects panel, error handling
- Evidence:
  - `SlateEditor` emits explicit `logoError` events for invalid URLs and failed image loads in [src/ui/components/SlateEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SlateEditor.ts#L58), [src/ui/components/SlateEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SlateEditor.ts#L301), and [src/ui/components/SlateEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SlateEditor.ts#L329).
  - The production panel upload handler catches `loadLogoFile()` failures and does nothing except a comment saying the error was emitted elsewhere in [src/AppControlRegistry.ts](/Users/lifeart/Repos/openrv-web/src/AppControlRegistry.ts#L704).
  - I found no production listener for `logoError`; the remaining matches are the event declaration and emission sites.
- Impact:
  - If a logo file is corrupt or unsupported, the upload simply fails with no alert, inline error, or status message.
  - Users are left guessing whether the file was ignored, still loading, or incompatible, which is poor behavior for an export-facing tool.

### 93. The advanced multi-field frameburn export overlay is implemented but unreachable in production

- Severity: Medium
- Area: Export UI, frameburn overlays
- Evidence:
  - `ViewerExport` supports a separate `frameburnConfig` and `frameburnContext` path that composites a multi-field export overlay via `compositeFrameburn()` in [src/ui/components/ViewerExport.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerExport.ts#L157) and [src/ui/components/ViewerExport.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerExport.ts#L235).
  - That config can express multiple field types plus font, colors, padding, and six anchor positions in [src/ui/components/FrameburnCompositor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FrameburnCompositor.ts#L20).
  - The only non-test production callsites of `createExportCanvas()` and `renderFrameToCanvas()` come from `Viewer`, and they pass only the simpler timecode-overlay options in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3362) and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3386).
  - I found no non-test production consumer of `frameburnConfig` or `frameburnContext`, and no export UI that authors those values.
- Impact:
  - The app ships a richer export frameburn system than users can actually reach from the production UI.
  - Export behavior is effectively limited to the on-viewer timecode overlay, while the more useful multi-field frameburn path remains dead code in real workflows.

### 94. Watermark image load failures are swallowed without any user-visible feedback

- Severity: Medium
- Area: Effects panel, error handling
- Evidence:
  - `WatermarkOverlay` emits explicit `error` events when image loading fails in [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L48), [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L112), and [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L165).
  - `WatermarkControl` forwards those errors as its own `error` event in [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L346), but the production file-upload handler catches `loadImage()` failures and intentionally does not surface them in [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L351).
  - I found no production listener that turns the watermark control’s `error` event into an alert, inline message, or panel status.
- Impact:
  - If a watermark file is corrupt or unsupported, the panel simply stays unchanged with no explanation.
  - That makes a real export-facing feature feel unreliable, because users get no indication whether the image was rejected, is still loading, or failed for browser reasons.

### 95. Playlist transition edits can silently collapse back to a cut with no explanation

- Severity: Medium
- Area: Playlist editor, transitions
- Evidence:
  - The transition row UI lets users pick a non-cut transition type and duration in [src/ui/components/PlaylistPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts#L720).
  - If `TransitionManager.validateTransition(...)` rejects the requested transition, the panel silently rewrites the selector back to `cut` and clears the transition in [src/ui/components/PlaylistPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts#L734) through [src/ui/components/PlaylistPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts#L743).
  - `TransitionManager.validateTransition()` can reject a transition for several real reasons, including clip duration limits and overlap with adjacent transitions, in [src/core/session/TransitionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/TransitionManager.ts#L72).
- Impact:
  - Users can try to create a transition and watch it disappear back to a hard cut without any inline error or explanation.
  - That makes the timeline editor feel unreliable when the real problem is just an invalid overlap or duration constraint.

### 96. ShotGrid load requests with invalid IDs fail as a silent no-op

- Severity: Low
- Area: ShotGrid panel, query flow
- Evidence:
  - The ShotGrid panel always renders an enabled `Load` button in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L165).
  - `handleLoad()` parses the input and simply returns when the ID is missing, non-numeric, or less than `1` in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L302).
  - There is no matching error message, disabled-state logic, or validation hint for that failure path.
- Impact:
  - Users can click `Load` or press `Enter` and get no response at all if the query field is empty or malformed.
  - The panel behaves like the action was ignored rather than telling the user what needs to be corrected.

### 97. Timeline context menu advertises `Ctrl+C` for timecode copy, but that shortcut is still bound to frame copy

- Severity: Medium
- Area: Timeline context menu, shortcut truthfulness
- Evidence:
  - The timeline context menu renders `Copy Timecode` with a visible `Ctrl+C` hint in [src/ui/components/TimelineContextMenu.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimelineContextMenu.ts#L99) and [src/ui/components/TimelineContextMenu.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimelineContextMenu.ts#L268).
  - The menu's keyboard handling only supports navigation keys, `Enter`, `Space`, and `Escape`; it never handles `Ctrl+C` in [src/ui/components/TimelineContextMenu.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimelineContextMenu.ts#L306).
  - The global binding for `Ctrl+C` is still `export.copyFrame` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L271), and the action map routes that to `viewer.copyFrameToClipboard(true)` in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L545).
  - The actual timecode copy path is click-only through `navigator.clipboard.writeText(tc)` in [src/ui/components/Timeline.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts#L579).
- Impact:
  - The menu tells users one shortcut, but pressing it performs a different clipboard action.
  - That makes the timeline context menu actively misleading during review work where copying a timecode quickly matters.

### 98. Ghost Frames, PAR, and Stereo Align use different interaction models for mouse and keyboard

- Severity: Medium
- Area: View toolbar controls, state semantics
- Evidence:
  - The Ghost Frames button is titled as a feature shortcut in [src/ui/components/GhostFrameControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/GhostFrameControl.ts#L88), but clicking it only opens the dropdown in [src/ui/components/GhostFrameControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/GhostFrameControl.ts#L110), while the keyboard path flips the enabled state via `controls.ghostFrameControl.toggle()` in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L384) and [src/ui/components/GhostFrameControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/GhostFrameControl.ts#L416).
  - The PAR button follows the same pattern: its title advertises `Shift+P` in [src/ui/components/PARControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PARControl.ts#L47), clicking only opens the dropdown in [src/ui/components/PARControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PARControl.ts#L66), but the keyboard action toggles live PAR correction through [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L385) and [src/ui/components/PARControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PARControl.ts#L415).
  - Stereo Align has the same mismatch: the button advertises `Shift+4` in [src/ui/components/StereoAlignControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoAlignControl.ts#L55), clicking only opens the dropdown, but the shortcut cycles the active overlay mode through [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L612) and [src/ui/components/StereoAlignControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoAlignControl.ts#L257).
- Impact:
  - These controls look and read like direct feature toggles or mode selectors, but mouse users and keyboard users get different behavior from the same named control.
  - That inconsistency makes it harder to predict whether a toolbar click will change the image immediately or just open settings.

### 99. Timeline editor context menu shows shortcut hints that are not actually wired

- Severity: Medium
- Area: Timeline editor, context menu
- Evidence:
  - The timeline editor context menu renders `Split at Playhead` with `S`, `Duplicate Cut` with `D`, and `Delete Cut` with `Del` in [src/ui/components/TimelineEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimelineEditor.ts#L1092), [src/ui/components/TimelineEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimelineEditor.ts#L1099), and [src/ui/components/TimelineEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimelineEditor.ts#L1114).
  - Those hints are only visual text added by `createMenuItem(...)` in [src/ui/components/TimelineEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimelineEditor.ts#L1135); the context menu itself has no keyboard handler.
  - The editor's real keyboard handling only implements `Delete` / `Backspace`, `Escape`, arrow nudging, and `Tab` selection in [src/ui/components/TimelineEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TimelineEditor.ts#L677), with no `S` or `D` path at all.
- Impact:
  - The context menu presents keyboard affordances for split and duplicate that users cannot actually trigger from the keyboard.
  - That makes the visual timeline editor feel more capable than it is, then fails exactly when an editor tries to use it efficiently.

### 101. The floating Info Panel is mostly unwired and can only show cursor color reliably

- Severity: Medium
- Area: Viewer overlays, info panel
- Evidence:
  - `InfoPanel` is implemented to render filename, resolution, frame info, timecode, duration, FPS, and cursor color in [src/ui/components/InfoPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/InfoPanel.ts#L1) and [src/ui/components/InfoPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/InfoPanel.ts#L301).
  - In production wiring, the only `controls.infoPanel.update(...)` call is the cursor-color callback in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L537).
  - The normal metadata update path in the same file goes to `rightPanelContent.updateInfo(...)`, not the floating info panel, in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L552).
- Impact:
  - The shipped Info Panel toggle suggests a viewer metadata overlay, but in practice it is largely limited to `RGB: ...` at cursor or `No data`.
  - That makes the feature much less useful than its UI and implementation surface imply, especially for quick filename/frame/timecode reference in the viewer.

### 102. Cache indicator’s `Clear` action only clears video cache while still presenting effects-cache stats

- Severity: Medium
- Area: Cache UI, viewer performance tools
- Evidence:
  - The cache indicator displays both normal cache stats and a separate `Effects: ...` prerender cache line in [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L131) and [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L353).
  - Its only visible `Clear` button calls `this.session.clearVideoCache()` in [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L167).
  - `Session.clearVideoCache()` only delegates to media/video cache clearing in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1165), with no corresponding prerender/effects cache clear path here.
- Impact:
  - Users looking at both cache lines reasonably expect `Clear` to clear the caches being reported, but the effects cache can remain populated.
  - That makes the cache UI misleading during troubleshooting, because the one visible purge action does not match the full state the indicator is showing.

### 103. Right-panel media info can go stale after the panel is hidden and shown again

- Severity: Medium
- Area: Right inspector, media info
- Evidence:
  - `RightPanelContent.updateInfo(...)` explicitly skips all updates when its root element is hidden with `display: none` in [src/ui/layout/panels/RightPanelContent.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/panels/RightPanelContent.ts#L170).
  - The layout system does hide panel content with `display: none` when side panels are collapsed or removed from the active layout in [src/ui/layout/LayoutManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/LayoutManager.ts#L409).
  - The normal metadata refresh path is only driven by `frameChanged` and `sourceLoaded` in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L551), and reopening the panel itself does not force a refresh.
- Impact:
  - If the right inspector is hidden while playback/frame/source state changes, reopening it can show stale frame/timecode/media info until another frame or source event happens.
  - That makes the inspector feel unreliable precisely when users reopen it to check current media state.

### 104. Advanced paint-tool buttons advertise `D` / `U` / `C` / `M`, but those shortcuts do not exist

- Severity: Medium
- Area: Annotate toolbar, paint tools
- Evidence:
  - The shipped paint toolbar labels the advanced buttons as `Dodge tool (D)`, `Burn tool (U)`, `Clone stamp (C)`, and `Smudge tool (M)` in [src/ui/components/PaintToolbar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PaintToolbar.ts#L55).
  - The actual default paint shortcut block only defines `paint.pan`, `paint.pen`, `paint.eraser`, `paint.text`, `paint.rectangle`, `paint.ellipse`, `paint.line`, `paint.arrow`, `paint.toggleBrush`, `paint.toggleGhost`, and `paint.toggleHold` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L337).
  - The production keyboard action map mirrors that same limited set and has no handlers for `dodge`, `burn`, `clone`, or `smudge` in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L572).
- Impact:
  - The Annotate toolbar promises fast single-key access to four destructive paint tools, but those keys do nothing in the shipped app.
  - That makes the toolbar misleading and slows down the exact workflows those tools are intended for.

### 105. Text-format toolbar advertises `Ctrl+B` / `Ctrl+I` / `Ctrl+U`, but production never routes those shortcuts to it

- Severity: Medium
- Area: Annotate toolbar, text annotation formatting
- Evidence:
  - The text-format buttons are explicitly titled `Bold (Ctrl+B)`, `Italic (Ctrl+I)`, and `Underline (Ctrl+U)` in [src/ui/components/TextFormattingToolbar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TextFormattingToolbar.ts#L63).
  - The component does implement a local `handleKeyboard(key, ctrlKey)` path for those combinations in [src/ui/components/TextFormattingToolbar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TextFormattingToolbar.ts#L291).
  - But the shipped annotate tab only renders the toolbar in [src/services/tabContent/buildAnnotateTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildAnnotateTab.ts#L24), and the production keyboard map contains no corresponding text-format actions or calls into `textFormattingToolbar.handleKeyboard(...)`.
- Impact:
  - Users are told standard rich-text shortcuts work for text annotations, but those shortcuts are not actually wired through the app.
  - That makes text formatting slower and undermines confidence in the rest of the annotate toolbar’s shortcut hints.

### 106. Text-format toolbar never follows actual text selection, so it only tracks newly created or most-recent text

- Severity: Medium
- Area: Annotate toolbar, text annotation editing
- Evidence:
  - The component documentation says it updates the “currently selected or most recently created text annotation” in [src/ui/components/TextFormattingToolbar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TextFormattingToolbar.ts#L1).
  - In practice, its internal tracking is only refreshed from `toolChanged`, `strokeAdded`, and `annotationsChanged` in [src/ui/components/TextFormattingToolbar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TextFormattingToolbar.ts#L98).
  - The explicit `setActiveAnnotation(id, frame)` entry point exists in [src/ui/components/TextFormattingToolbar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/TextFormattingToolbar.ts#L241), but the production annotate wiring just instantiates and renders the toolbar in [src/services/controls/createAnnotateControls.ts](/Users/lifeart/Repos/openrv-web/src/services/controls/createAnnotateControls.ts#L15) and [src/services/tabContent/buildAnnotateTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildAnnotateTab.ts#L24), with no selection handoff.
- Impact:
  - On frames with multiple text annotations, the toolbar has no production path to retarget formatting to the text the user actually wants to edit.
  - That leaves the UI behaving like a “last text” formatter while presenting itself as a real selected-text editor.

### 107. Snapshot panel promises a Preview action, but the shipped UI only shows preview metadata

- Severity: Medium
- Area: Snapshot management
- Evidence:
  - The component advertises snapshot actions as `Preview, Restore, Export, Delete, Rename` in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L2).
  - The actual action row only creates `Restore`, `Rename`, `Export`, and `Delete` buttons in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L383).
  - The only preview-related rendering is passive summary metadata from `snapshot.preview` in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L354), and there is no preview event or action path in `SnapshotPanelEvents`.
- Impact:
  - Users can inspect small bits of snapshot metadata, but they cannot actually preview a snapshot before restoring it.
  - That makes snapshot comparison less useful and turns restore into a more blind action than the panel suggests.

### 108. Playlist panel claims EDL import/export support, but the shipped UI only exposes export

- Severity: Medium
- Area: Playlist management
- Evidence:
  - The panel advertises `EDL import/export` in its feature block in [src/ui/components/PlaylistPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts#L2).
  - The visible footer only exposes `EDL` and `OTIO` export buttons in [src/ui/components/PlaylistPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PlaylistPanel.ts#L258).
  - There is no import button, import event, or playlist-panel import flow in the component itself, even though the broader app can load `.rvedl` through separate file-open flows.
- Impact:
  - Users working inside the playlist UI cannot round-trip timelines the way the panel description implies.
  - Import exists as an app capability, but not as a usable playlist-panel workflow.

### 109. Network Sync can show `Copied!` before the share link copy actually succeeds

- Severity: Medium
- Area: Network Sync, share/invite flow
- Evidence:
  - The panel’s `Copy Link` button immediately updates its own label to `Copied!` right after emitting `copyLink` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L842).
  - The actual clipboard write happens asynchronously in the app bridge in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L138).
  - That bridge can still fail and surface `Clipboard unavailable...` or `Failed to generate share URL...` errors after the button has already switched to success styling in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L167).
- Impact:
  - The panel can briefly report success and failure at the same time for the same copy attempt.
  - That makes the invite/share workflow less trustworthy, especially on browsers or environments with clipboard restrictions.

### 110. Shortcut editor import failures are completely silent

- Severity: Medium
- Area: Custom key bindings UI
- Evidence:
  - The shortcut editor exposes an `Import` button in its toolbar in [src/ui/components/ShortcutEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShortcutEditor.ts#L320).
  - Its file import path catches parse/validation errors and does nothing with them in [src/ui/components/ShortcutEditor.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShortcutEditor.ts#L401).
  - There is no error banner, modal, inline status, or retry guidance for malformed or incompatible keybinding files in that path.
- Impact:
  - Users can choose an invalid bindings file and see no visible result at all, with no explanation of what went wrong.
  - That makes recovery and troubleshooting unnecessarily hard in one of the app’s more configuration-heavy workflows.

### 111. Curves import failures only hit the console, not the UI

- Severity: Medium
- Area: Curves panel
- Evidence:
  - The curves panel exposes an `Import` button in [src/ui/components/CurvesControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CurvesControl.ts#L132).
  - Invalid imported data only triggers `console.error('Invalid curves JSON file')` in [src/ui/components/CurvesControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CurvesControl.ts#L216).
  - Read/parse failures likewise only log `Failed to import curves` in [src/ui/components/CurvesControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CurvesControl.ts#L232), with no alert or inline error state.
- Impact:
  - From the user’s perspective, a bad curves file looks like a dead button or a no-op.
  - That makes the import workflow fragile and much harder to use outside ideal files.

### 112. External presentation window opens can fail silently when blocked by the browser

- Severity: Medium
- Area: Presentation / multi-window workflow
- Evidence:
  - The header exposes an `External Presentation (Ctrl+Shift+Alt+P)` action in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L389).
  - That button is wired directly to `externalPresentation.openWindow()` in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L528).
  - `ExternalPresentation.openWindow()` explicitly returns `null` when `window.open(...)` is blocked, but surfaces no alert or status message in [src/ui/components/ExternalPresentation.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExternalPresentation.ts#L392).
- Impact:
  - If the browser blocks popups, the user can click the presentation action and get no visible result or explanation.
  - That makes a high-value review workflow fail like a dead control instead of a recoverable browser permission issue.

### 113. The `?` shortcut cheat sheet advertises search/context filtering in code, but the shipped overlay exposes neither

- Severity: Medium
- Area: Help / shortcut discovery
- Evidence:
  - The cheat-sheet component documents support for `context filtering and text search` in [src/ui/components/ShortcutCheatSheet.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShortcutCheatSheet.ts#L2).
  - Its production mount path only instantiates the overlay in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L352), and the keyboard action map only toggles visibility in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L682).
  - The rendered overlay itself is only a columns wrapper in [src/ui/components/ShortcutCheatSheet.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShortcutCheatSheet.ts#L107), with no search input or visible context controls, unlike the separate help dialog in `AppKeyboardHandler`.
- Impact:
  - Users opening the `?` overlay get a static wall of shortcuts, not the searchable/context-aware cheat sheet the component surface suggests.
  - That reduces the usefulness of the app’s fastest shortcut-discovery path and contributes to drift between the two help UIs.

### 114. Tone Mapping can be “enabled” in the dropdown while still being functionally off

- Severity: Medium
- Area: Color / tone mapping UI
- Evidence:
  - The dropdown exposes an `Enable Tone Mapping` checkbox in [src/ui/components/ToneMappingControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ToneMappingControl.ts#L152).
  - That checkbox only flips `state.enabled` via `setEnabled(...)` in [src/ui/components/ToneMappingControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ToneMappingControl.ts#L680), and does not change the operator from the default `off`.
  - The control button and the actual active-state logic both still treat tone mapping as off unless `enabled && operator !== 'off'` in [src/ui/components/ToneMappingControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ToneMappingControl.ts#L591) and [src/ui/components/ColorPipelineManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ColorPipelineManager.ts#L338).
  - The test suite explicitly codifies this contradiction: `setEnabled(true)` with operator `off` still yields `isEnabled() === false` in [src/ui/components/ToneMappingControl.test.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ToneMappingControl.test.ts#L605).
- Impact:
  - A user can check `Enable Tone Mapping` and still get no tone-mapping effect, no active button state, and no obvious explanation.
  - That makes the control internally self-contradictory and undermines trust in the Color tab.

### 115. Typing a custom PAR value does not actually enable PAR correction

- Severity: Medium
- Area: View / pixel aspect ratio
- Evidence:
  - Choosing a PAR preset explicitly sets `state.enabled = true` in [src/ui/components/PARControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PARControl.ts#L281).
  - Editing `Custom PAR` only updates `state.par` and `state.preset = 'custom'` in [src/ui/components/PARControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PARControl.ts#L184), but never enables correction.
  - The control only shows active state and applies a non-trivial correction when `enabled && par != 1.0` in [src/ui/components/PARControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PARControl.ts#L337) and [src/utils/media/PixelAspectRatio.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/PixelAspectRatio.ts#L141).
- Impact:
  - Presets and manual entry for the same feature behave differently: presets apply immediately, but a typed custom PAR can look like a no-op until the user separately discovers the enable toggle.
  - That makes the custom path feel broken and is especially confusing when the button label still says plain `PAR`.

### 116. Volume slider disclosure is tied to the mute button, so keyboard/touch use mutates audio state just to reach the slider

- Severity: Medium
- Area: Header / audio controls
- Evidence:
  - The only visible volume affordance in the header is the mute button from [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L47), mounted by [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L95) and [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L410).
  - Hover expands the slider on desktop in [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L152), but the click path on the mute button does two things at once: `toggleMute()` and `toggleSliderExpanded()` in [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L68).
  - The tests explicitly describe this as the mobile/touch/keyboard path, where clicking the mute button expands the slider in [src/ui/components/VolumeControl.test.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.test.ts#L155).
- Impact:
  - Keyboard, touch, and any non-hover user has to mute audio first just to access the volume slider and scrub toggle.
  - That turns basic volume adjustment into a state-changing side effect instead of a clean disclosure action.

### 117. The OCIO button advertises the wrong shortcut

- Severity: Low
- Area: Color / shortcut discoverability
- Evidence:
  - The OCIO button title says `Toggle OCIO color management panel (O)` in [src/ui/components/OCIOControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OCIOControl.ts#L98).
  - The real shared key binding for `panel.ocio` is `Shift+O`, not plain `O`, in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L231) through [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L234).
  - The docs also consistently teach `Shift+O`, so the drift is in the shipped button tooltip, not the written shortcut reference, in [docs/color/ocio.md](/Users/lifeart/Repos/openrv-web/docs/color/ocio.md#L17), [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L114), and [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L117).
- Impact:
  - Users relying on the tooltip are taught the wrong shortcut for a high-traffic color-management panel.
  - That is another UI-to-keymap drift point in the app’s shortcut system.

### 118. `WipeControl` is a dead legacy UI widget with no production mount path

- Severity: Low
- Area: UI codebase / comparison tooling
- Evidence:
  - `WipeControl` is explicitly marked as a deprecated legacy widget kept for backward compatibility in [src/ui/components/WipeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WipeControl.ts#L17).
  - Production compare UI now goes through `CompareControl` instead, which carries the shipped wipe/A-B entry point in [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L86) and [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L38).
  - A repo-wide search shows no production `new WipeControl(...)` instantiation path outside tests.
- Impact:
  - The repo still carries a tested UI control surface that users can never actually reach in the shipped app.
  - That increases maintenance noise and makes shortcut/help drift easier, because old wipe-specific UI behavior can diverge without affecting production until much later.

### 119. Project save knows it is dropping active viewer state, but the save flow only logs that loss to the console

- Severity: High
- Area: Persistence / project save
- Evidence:
  - `SessionSerializer` explicitly tracks a long list of unsaved viewer-state gaps, including OCIO, display profile, gamut mapping, curves, tone mapping, ghost frames, stereo, blend mode, and channel isolation, in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L71).
  - `SessionSerializer.toJSON(...)` detects active gaps and only emits a `console.warn(...)` about them in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L230).
  - The real save entry point `AppPersistenceManager.saveProject()` just calls `SessionSerializer.toJSON(...)` and downloads the file; it never surfaces those warnings in the UI in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L240).
  - The load path does surface warnings to the user via `showAlert(...)`, including serialization-gap warnings, in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L303) and [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L504).
- Impact:
  - Users can save a project believing the current review/color/view state is preserved, while the app already knows several active states will be lost.
  - The warning arrives only after reload, which is too late for a save workflow that should let the user decide whether to continue, snapshot, or export another format first.

### 120. Restored PAR and background-pattern state can disagree with the visible controls

- Severity: Medium
- Area: Persistence / UI state sync
- Evidence:
  - Project serialization saves both PAR and background-pattern state in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L288).
  - Project load restores those states directly into the viewer in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L467).
  - The production view wiring is one-way from controls to viewer for those features in [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L192) and [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L199).
  - `AppPersistenceManager.syncControlsFromState(...)` updates many restored controls, but it has no PAR or background-pattern control inputs and no sync step for them in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L442).
  - Both shipped controls do have explicit state setters, so this is a missing bridge rather than a missing control API: [src/ui/components/PARControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PARControl.ts#L409) and [src/ui/components/BackgroundPatternControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/BackgroundPatternControl.ts#L487).
- Impact:
  - After project load, snapshot restore, or auto-recovery, the viewer can be showing PAR correction or a background pattern while the visible controls still show their pre-load state.
  - That makes the UI untrustworthy exactly when users are checking whether a restored session came back correctly.

### 121. Opening a project imports its media on top of the current session instead of replacing the session

- Severity: High
- Area: Persistence / project open / recovery
- Evidence:
  - `HeaderBar` exposes this flow as `Open project` rather than an import/append action in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L238).
  - `AppPersistenceManager.openProject()` calls `SessionSerializer.fromJSON(...)` without clearing the existing session first in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L282).
  - `SessionSerializer.fromJSON(...)` simply loops the saved media and calls `session.loadImage(...)`, `session.loadVideo(...)`, or `session.loadFile(...)` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L364).
  - The runtime media service appends every loaded source via `_sources.push(source)` in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L210).
  - The only “reset” helper in `SessionMedia` is `resetSourcesInternal(...)`, and it is explicitly test-only in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L190).
- Impact:
  - Loading a project, restoring a snapshot, or recovering an auto-save can leave the previous session’s media still present alongside the restored session’s media.
  - That corrupts source indexing, compare setups, playlist assumptions, and any per-source notes/status workflows that depend on the restored session being a clean replacement.

### 122. Saved current-source selection is serialized but never restored

- Severity: Medium
- Area: Persistence / playback restore
- Evidence:
  - Project save serializes `currentSourceIndex` as part of playback state in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1270).
  - The project state schema also defines `currentSourceIndex` as a persisted field in [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L63).
  - `SessionSerializer.fromJSON(...)` restores playback by calling `session.setPlaybackState(migrated.playback)` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L433).
  - `Session.setPlaybackState(...)` applies fps, loop mode, playback mode, volume, mute, in/out, frame, and marks, but it never applies `currentSourceIndex` despite accepting it in the type in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1303).
  - Meanwhile the media loader makes the most recently loaded source current by default in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L216).
- Impact:
  - Multi-source projects do not reopen on the source the user was actually reviewing when they saved.
  - In practice the active source drifts to the last file loaded during restore, which is an especially bad failure mode for compare/QC notes tied to a specific source.

### 123. Loading empty notes, version groups, or statuses does not clear the old session data

- Severity: High
- Area: Persistence / session-owned metadata restore
- Evidence:
  - `SessionSerializer.fromJSON(...)` only restores notes when `migrated.notes.length > 0`, only restores version groups when `migrated.versionGroups.length > 0`, and only restores statuses when `migrated.statuses.length > 0` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L476).
  - The underlying managers are designed to clear and replace their contents on restore in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L247), [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L338), and [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L178).
  - Because `fromJSON(...)` skips those calls for empty arrays, the previous in-memory data survives instead of being replaced by “empty.”
- Impact:
  - Opening a clean project after a reviewed session can leave old notes, version groups, or shot statuses attached to the new session.
  - That is data contamination, not just stale UI, because the underlying managers keep reporting metadata that the newly loaded project does not contain.

### 124. State-only or failed-media project loads skip playback-state restore entirely

- Severity: Medium
- Area: Persistence / load with missing media
- Evidence:
  - `SessionSerializer.fromJSON(...)` only calls `session.setPlaybackState(...)` when `loadedMedia > 0` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L433).
  - The same load flow can legitimately produce `loadedMedia === 0` for state-only projects, skipped blob reloads, sequence placeholders, or failed media loads in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L366).
  - The project schema still persists playback settings like loop mode, playback mode, volume, mute, and audio scrub in [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L63).
  - The serializer tests even document that playback restoration currently depends on loading at least one source: “Must include a source so that `loadedMedia > 0` and `setPlaybackState` is called” in [src/core/session/SessionSerializer.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.test.ts#L1048).
- Impact:
  - If a project reopens without media, or the user skips reloading local files, the app silently drops persisted playback settings instead of restoring the parts that are still meaningful.
  - That makes project recovery much less reliable for exactly the cases where users most need the saved state to survive partial media failure.

### 125. RV/GTO session import keeps old review metadata when the imported file contains none

- Severity: High
- Area: RV/GTO import / session metadata restore
- Evidence:
  - `SessionGraph.loadFromGTO(...)` only applies imported marks, notes, version groups, and statuses when the parsed arrays have `length > 0` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L294).
  - The GTO parser also omits those fields from `sessionInfo` when the imported file contains zero entries in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L291), [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L475), [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L527), and [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L629).
  - The underlying managers are replace-style loaders that would clear old state if they were called, in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L247), [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L338), and [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L178).
- Impact:
  - Importing an RV/GTO session with no notes, no marks, or no version/status metadata can leave the previous session’s review metadata still active.
  - That makes format import non-idempotent: “empty” in the imported session does not mean empty in the running app.

### 126. `.orvproject` save/load never persists the node graph, even though the project schema and graph serializer exist

- Severity: High
- Area: Persistence / node graph / session topology
- Evidence:
  - The `.orvproject` schema explicitly reserves `graph?: SerializedGraph` in [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L148).
  - The app also has a dedicated graph serializer/deserializer for project persistence in [src/core/session/SessionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionManager.ts#L328).
  - But `SessionSerializer.toJSON(...)` never writes any `graph` field into the saved project object in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L257).
  - `SessionSerializer.fromJSON(...)` likewise never reads `state.graph` or calls `SessionManager.fromSerializedGraph(...)` anywhere in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L354).
  - The runtime session does carry graph state when loaded from GTO/RV, exposed via `session.graph`, in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L416).
- Impact:
  - Saving a project from a graph-based session drops the session topology outright instead of round-tripping it through `.orvproject`.
  - That makes project save/load materially weaker than the repo’s own schema and graph-management code imply, especially for stack/layout/sequence workflows that depend on graph structure rather than flat source lists.

### 127. Session renaming in the header is not honored by project save/load

- Severity: Medium
- Area: Project metadata / file workflow
- Evidence:
  - The shipped header exposes a rename-session flow through `session.setDisplayName(...)` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L565).
  - Project save ignores that session metadata and hardcodes the serialized project name to `'project'` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L243).
  - The same flow also hardcodes the download filename to `project.orvproject` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L253).
  - `SessionSerializer.toJSON(...)` only records the caller-provided `projectName` as `state.name` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L226).
  - `SessionSerializer.fromJSON(...)` does not apply `state.name` back onto session metadata or the header name display anywhere in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L354).
- Impact:
  - The app presents session naming as a first-class UI concept, but manual project save/load discards it and normalizes everything to `project`.
  - That makes saved project files harder to distinguish and breaks the expectation that a named review session will round-trip with its own identity.

### 128. RV/GTO marker notes and marker colors are exported and parsed, but import drops them

- Severity: Medium
- Area: RV/GTO round-trip / review metadata
- Evidence:
  - GTO export writes marker frame numbers, marker notes, and marker colors as parallel arrays in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1478).
  - GTO import parses `markerNotes` and `markerColors` back into `sessionInfo` in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L299).
  - But `SessionGraph.loadFromGTO(...)` restores markers with `markerManager.setFromFrameNumbers(...)`, which explicitly assigns empty notes and default colors in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L294) and [src/core/session/MarkerManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.ts#L253).
- Impact:
  - Marker placement survives RV/GTO round-trips, but marker annotations and color coding do not.
  - That weakens the app’s review-session interchange because the imported marker list no longer carries the meaning the exporter wrote out.

### 129. RV/GTO audio-scrub state is exported and parsed, but never restored

- Severity: Medium
- Area: RV/GTO round-trip / playback settings
- Evidence:
  - GTO export writes `audioScrubEnabled` from playback state in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1495).
  - The GTO loader parses that property into `sessionInfo.audioScrubEnabled` in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L357).
  - `SessionGraph.loadFromGTO(...)` applies fps, frame, in/out, marks, frame increment, notes, statuses, and playback mode, but there is no step that applies `audioScrubEnabled` to the live session in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L282).
- Impact:
  - RV/GTO round-trips silently forget whether scrub audio was enabled in the original session.
  - That creates another “exported but not actually restorable” playback setting in the session interchange path.

### 130. Several shipped Effects-tab controls are fully wired, but `.orvproject` persistence ignores them entirely and does not warn

- Severity: High
- Area: Project persistence / effects stack
- Evidence:
  - The shipped Effects tab exposes deinterlace, film emulation, perspective correction, and stabilization controls in [src/services/tabContent/buildEffectsTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildEffectsTab.ts#L19).
  - Those controls are fully wired into the real viewer state in [src/AppEffectsWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppEffectsWiring.ts#L73), and the viewer has explicit getters/setters for those effect states in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2767), [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2784), [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2801), and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2937).
  - The same applies to uncrop/canvas extension: it is a real user control and viewer state in [src/AppEffectsWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppEffectsWiring.ts#L51) and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2835).
  - But the `.orvproject` schema and serializer only persist crop, lens, filters, noise reduction, watermark, LUT intensity, PAR, and background pattern, with no fields for uncrop, deinterlace, film emulation, perspective correction, or stabilization in [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L94) and [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L257).
  - `SessionSerializer.getSerializationGaps(...)` also does not warn about any of those omitted states in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L98).
- Impact:
  - Users can spend time configuring shipped effects and save a project that silently loses them on reload.
  - Because these omissions are not even included in the serializer’s warning list, the save flow gives a false sense that the current Effects-tab state is project-safe.

### 131. Loading ordinary media after a GTO/RV session does not clear the old session metadata or uncrop side-state

- Severity: High
- Area: Session reset / media loading / export correctness
- Evidence:
  - All normal media-loading paths call `clearGraphData()` before loading new files or procedural sources in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L272), [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L316), [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L348), [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L363), and [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L481).
  - But `SessionGraph.clearData()` only nulls `_graph`, `_gtoData`, and `_graphParseResult`; it does not reset `_metadata`, `_uncropState`, or `_edlEntries` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L199).
  - Header/session identity comes directly from that persistent metadata object, and the header display listens to `metadataChanged` from the session in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L152) and [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1486).
  - RV export also still consumes `session.metadata` and `session.uncropState` after ordinary media loads in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1462) and [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L492).
  - The normal `sourceLoaded` handling updates crop dimensions but does not reset uncrop state in [src/handlers/sourceLoadedHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/sourceLoadedHandlers.ts#L169).
- Impact:
  - After opening a plain image/video following an imported RV/GTO session, the app can continue showing the old session name/comment/origin in the header instead of reflecting the new media context.
  - The previous uncrop state can also leak into later RV exports or remain active in effect state even though the user has already moved on to unrelated media.

### 132. Project save/load preserves wipe mode but not the actual A/B compare assignment state

- Severity: Medium
- Area: Project persistence / compare workflow
- Evidence:
  - The live session tracks real A/B compare state including `currentAB`, `sourceAIndex`, `sourceBIndex`, and `syncPlayhead` in [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L228).
  - The shipped compare UI is built around those A/B concepts, not just wipe mode, in [src/ui/components/CompareControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CompareControl.ts#L1).
  - `.orvproject` playback serialization does not include any of those A/B fields; `Session.getPlaybackState()` only saves frame/fps/loop/volume/mute/marks/current source/audio scrub in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1270).
  - `SessionState.PlaybackState` likewise has no A/B assignment fields in [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L63).
  - The project serializer only persists `wipe` as a visual compare setting in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L282), so project restore can recover wipe position without recovering which sources were assigned to A/B.
- Impact:
  - Multi-source compare sessions do not round-trip as actual compare sessions; they reopen without the source B assignment and linked-playhead behavior the user was reviewing.
  - That is especially confusing because part of the compare UI survives, making the restored state look more complete than it really is.

### 133. RV/GTO import loses `play all frames` playback mode because `realtime = 0` is parsed as “missing”

- Severity: Medium
- Area: RV/GTO round-trip / playback mode
- Evidence:
  - RV/GTO export encodes `playAllFrames` by writing `realtime = 0` in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1476).
  - The GTO loader only treats `realtime` as meaningful when it is greater than zero in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L317).
  - `SessionGraph.loadFromGTO(...)` restores playback mode only when `sessionInfo.realtime !== undefined`, and then specifically interprets `0` as `playAllFrames`, in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L329).
  - Because the parser discards zero, that restoration branch never runs for exported `playAllFrames` sessions.
- Impact:
  - RV/GTO round-trips silently reopen in realtime mode even when the source session was explicitly saved in play-all-frames mode.
  - This is a pure export/import contradiction: the exporter writes the sentinel value that the importer-side application logic expects, but the parser strips it first.

### 134. `.orvproject` serializes media representations, but project load never rebuilds or reselects them

- Severity: Medium
- Area: Project persistence / media representations
- Evidence:
  - `SessionSerializer.serializeMedia(...)` writes per-source `representations` and `activeRepresentationId` into the saved project in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L335).
  - The project schema explicitly includes those fields on `MediaReference` in [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L33).
  - But `SessionSerializer.fromJSON(...)` only reloads the base media paths via `session.loadImage(...)`, `session.loadVideo(...)`, or `session.loadFile(...)` and never applies `ref.representations` or `ref.activeRepresentationId` anywhere in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L364).
  - The runtime session does have real APIs for adding and switching representations in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1178) and [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1195).
- Impact:
  - Projects can save representation ladders and active-representation selection that never come back on reload.
  - That makes representation-aware review workflows look project-safe in the file format while actually restoring only the default source stream.

### 135. RV/GTO round-trips collapse duration markers into point markers

- Severity: Medium
- Area: RV/GTO round-trip / marker fidelity
- Evidence:
  - The app’s real marker model supports range markers via optional `endFrame` in [src/core/session/MarkerManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.ts#L20), and the marker UI exposes editing of that end frame in [src/ui/components/MarkerListPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MarkerListPanel.ts#L416).
  - Project/session state can preserve full marker objects through `MarkerManager.toArray()` in [src/core/session/MarkerManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.ts#L285).
  - But RV/GTO export only writes bare `marks` frame numbers plus parallel note/color arrays, with no end-frame field at all, in [src/core/session/SessionGTOExporter.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGTOExporter.ts#L1478).
  - RV/GTO import then rebuilds markers from frame numbers only via `setFromFrameNumbers(...)`, which creates point markers without `endFrame`, in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L294) and [src/core/session/MarkerManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.ts#L253).
- Impact:
  - Review sessions that use duration/range markers lose their span information when exported to and reloaded from RV/GTO.
  - That changes marker meaning, not just presentation, because a range marker becomes a single-frame marker after interchange.

### 136. Omitted viewer states can leak from the previous session on project load, even though the warning says they “use defaults”

- Severity: High
- Area: Project load / viewer-state restore correctness
- Evidence:
  - The serializer explicitly tells users that omitted states such as tone mapping, ghost frames, stereo, channel isolation, difference matte, and blend mode “use defaults” after load in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L504).
  - But `SessionSerializer.fromJSON(...)` only reapplies the serialized viewer fields and never resets any of those omitted states in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L455).
  - The viewer does have explicit reset methods for those omitted states, such as `resetToneMappingState()`, `resetGhostFrameState()`, `resetStereoState()`, `resetStereoEyeTransforms()`, `resetStereoAlignMode()`, `resetChannelMode()`, and `resetDifferenceMatteState()`, in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2985), [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3000), [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3015), [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3044), [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3086), [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3107), and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2969).
  - `getSerializationGaps(...)` decides omission by comparing the current live viewer state to defaults in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L146), so leaked prior-session state can survive and still be reported as if the load fell back to defaults.
- Impact:
  - Loading a project after using omitted viewer features can leave those old features still active, even though they were not part of the project being loaded.
  - That is worse than ordinary non-persistence: the app not only fails to restore the saved project correctly, it can actively contaminate it with stale state from the previous session while presenting a misleading warning message.

### 137. Project load and auto-save recovery can never reach a clean success state because `fromJSON()` always injects a generic serialization-gap warning

- Severity: Medium
- Area: Persistence / recovery UX semantics
- Evidence:
  - `SessionSerializer.getSerializationGaps(...)` builds a fixed catalog of unsupported viewer states and marks each one with `isActive`, but it returns the full list regardless of whether those states are active in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L98).
  - `SessionSerializer.toJSON(...)` correctly filters that list down to `activeGaps` before warning on save in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L230).
  - `SessionSerializer.fromJSON(...)`, however, unconditionally appends a warning using `gaps.map((g) => g.name)` with no `isActive` filter in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L504).
  - Project open and auto-save recovery only show their success state when `warnings.length === 0`, but both flows route any warning list into the warning UI branch in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L303) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L412).
  - The current tests explicitly codify this always-on warning behavior in `SER-GAP-030` in [src/core/session/SessionSerializer.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.test.ts#L988).
- Impact:
  - Clean project loads and clean crash recoveries still surface as warning flows instead of success flows, even when the only “warning” is a static list of unsupported features that may not have been used.
  - That dilutes genuinely actionable restore problems like skipped reloads or failed media loads because the UI is trained to warn all the time.

### 138. Snapshots, auto-checkpoints, and auto-saves are presented as session-state recovery features, but they use the same lossy project serializer

- Severity: High
- Area: Snapshots / auto-save / recovery fidelity
- Evidence:
  - The snapshot UI explicitly tells users to “Create a snapshot to save your session state” in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L261).
  - Auto-save dirty tracking serializes state through `SessionSerializer.toJSON(...)` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L111).
  - Quick snapshots and auto-checkpoints also serialize through the same `SessionSerializer.toJSON(...)` path in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L154) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L180).
  - That serializer is the same project serializer which already omits multiple live viewer/effects states and only warns in the console for active gaps in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L226).
  - Snapshot restore and crash recovery both deserialize through `SessionSerializer.fromJSON(...)` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L215) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L401).
- Impact:
  - These features read like full-fidelity “save my session / recover my session” tools, but they silently inherit the same persistence gaps as manual project save/load.
  - Users can trust snapshots or crash recovery as safety nets for active review state that those mechanisms do not actually preserve.

### 139. Snapshot restore appends the snapshot onto the current session instead of replacing it

- Severity: High
- Area: Snapshot restore semantics
- Evidence:
  - `restoreSnapshot(...)` restores directly into the live session via `SessionSerializer.fromJSON(...)` without clearing or resetting the current session first in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L202).
  - `SessionSerializer.fromJSON(...)` restores media by calling `session.loadImage(...)`, `session.loadVideo(...)`, and `session.loadFile(...)` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L364).
  - `SessionMedia.addSource(...)` appends every restored source with `_sources.push(source)` and makes the newly appended one current in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L210).
- Impact:
  - Restoring a snapshot during an active review session merges the snapshot media into the current session instead of rolling the app back to the snapshot’s own state.
  - That breaks the normal expectation of a snapshot restore and can quietly accumulate extra sources, A/B assignments, and stale session state across repeated restores.

### 140. Snapshot restore ignores partial-load warnings and always reports success

- Severity: High
- Area: Snapshot restore / user feedback correctness
- Evidence:
  - `restoreSnapshot(...)` awaits `SessionSerializer.fromJSON(...)` but discards its `{ loadedMedia, warnings }` result in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L214).
  - The same method then force-syncs UI controls from the raw serialized state via `syncControlsFromState(state)` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L223).
  - Finally it always shows `Restored "..."` success UI in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L229).
  - `SessionSerializer.fromJSON(...)` can legitimately accumulate warnings for skipped reload prompts and failed reloads in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L369), and for manual LUT re-apply requirements in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L491).
- Impact:
  - A snapshot can be only partially restored while the app still claims the restore succeeded and updates controls to match the intended snapshot state.
  - That leaves users with a misleading UI: the controls and success message can imply a complete rollback even when key media or LUT inputs did not actually come back.

### 141. Auto-save recovery deletes the only recovery entry even when recovery completed with warnings

- Severity: High
- Area: Crash recovery / retry safety
- Evidence:
  - Crash recovery promises users they can “Recover” a previous session from the most recent auto-save in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L364).
  - `recoverAutoSave(...)` restores through `SessionSerializer.fromJSON(...)` and can surface warning-laden recovery in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L399).
  - Those warnings include cases like `Skipped reload: ...` and `Failed to reload: ...` from [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L369).
  - But `recoverAutoSave(...)` deletes the recovered auto-save entry unconditionally immediately afterward in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L424).
- Impact:
  - If the user skips a reload prompt, picks the wrong replacement file, or otherwise gets an incomplete recovery, the original recovery checkpoint is destroyed before they can try again.
  - That turns a recoverable partial-restore path into a one-shot operation with no built-in retry safety.

### 142. Disabling audio scrub does not stop the scrub snippet that is already playing

- Severity: Medium
- Area: Audio scrub / playback controls
- Evidence:
  - `AudioCoordinator.onAudioScrubEnabledChanged(...)` is documented as stopping any active scrub snippet immediately when scrub is disabled in [src/audio/AudioCoordinator.ts](/Users/lifeart/Repos/openrv-web/src/audio/AudioCoordinator.ts#L172).
  - The implementation only flips `_audioScrubEnabled` and resets the scrub mode to `discrete`; it explicitly admits it is merely relying on future gating instead of stopping the current snippet in [src/audio/AudioCoordinator.ts](/Users/lifeart/Repos/openrv-web/src/audio/AudioCoordinator.ts#L176).
  - The underlying manager does have active scrub state (`scrubSourceNode`, `scrubEnvelopeNode`) and a real `stopScrubSnippet()` implementation in [src/audio/AudioPlaybackManager.ts](/Users/lifeart/Repos/openrv-web/src/audio/AudioPlaybackManager.ts#L678).
- Impact:
  - Toggling scrub audio off does not take effect immediately if a scrub snippet is already sounding.
  - That makes the control semantically unreliable: the UI says scrub is off while the user can still hear the tail of the just-triggered scrub audio.

### 143. The HEIC WASM fallback can decode the wrong top-level image when `is_primary()` is unavailable

- Severity: Medium
- Area: HEIC decoding / cross-browser fallback correctness
- Evidence:
  - The WASM HEIC fallback is the production path for Chrome/Firefox/Edge, while Safari uses native `createImageBitmap`, in [src/formats/HEICWasmDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/HEICWasmDecoder.ts#L2) and [src/formats/HEICGainmapDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/HEICGainmapDecoder.ts#L716).
  - `decodeHEICToImageData(...)` is intended to return the primary image, but if the libheif binding does not expose `is_primary()`, it falls back to `targetIndex = 0` in [src/formats/HEICWasmDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/HEICWasmDecoder.ts#L62).
  - The source code itself notes that `is_primary()` may be unavailable in some libheif-js builds in [src/formats/HEICWasmDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/HEICWasmDecoder.ts#L76).
  - The HEIC gainmap fallback path depends on that same `decodeHEICToImageData(buffer)` call for the base image in [src/formats/HEICGainmapDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/HEICGainmapDecoder.ts#L780).
- Impact:
  - Multi-image HEIC files can decode the wrong top-level image on the WASM fallback path when the primary-item binding is missing.
  - On gainmap HEICs, that can also mean the HDR reconstruction starts from the wrong base image, producing an incorrect final result rather than a clean failure.

### 144. The single 3D LUT path silently becomes a no-op when the WebGL LUT processor is unavailable

- Severity: High
- Area: Color pipeline / LUT rendering fallback
- Evidence:
  - `ColorPipelineManager.initLUTProcessor()` logs that it is “falling back to CPU” when `WebGLLUTProcessor` creation fails in [src/ui/components/ColorPipelineManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ColorPipelineManager.ts#L88).
  - `setLUT(...)` still accepts and stores the LUT even when no `_lutProcessor` exists in [src/ui/components/ColorPipelineManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ColorPipelineManager.ts#L196).
  - `Viewer` keeps calling `applyLUTToCanvas(...)` whenever `currentLUT` is set and intensity is non-zero in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2140).
  - But `ColorPipelineManager.applyLUTToCanvas(...)` only applies through the GPU processor and explicitly states there is “No CPU fallback implemented” in [src/ui/components/ColorPipelineManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ColorPipelineManager.ts#L368).
- Impact:
  - On browsers or environments where the dedicated WebGL LUT processor cannot be created, users can successfully load a LUT and keep seeing LUT state in the UI while the image output is unchanged.
  - The current log message is actively misleading because it claims a CPU fallback that the implementation does not provide.

### 145. File / Look / Display LUT pipeline stages are dropped entirely when the GPU LUT chain is unavailable

- Severity: High
- Area: Multi-stage LUT pipeline / renderer fallback
- Evidence:
  - The shipped pipeline is explicitly modeled as `Pre-Cache -> File -> [Color Corrections] -> Look -> Display`, with File/Look/Display intended as runtime stages in [src/color/pipeline/LUTPipeline.ts](/Users/lifeart/Repos/openrv-web/src/color/pipeline/LUTPipeline.ts#L1).
  - `Viewer.syncLUTPipeline()` only transfers File/Look/Display LUT stage state into the renderer when `gpuChain` exists; otherwise it does nothing for those stages in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2512).
  - The actual draw path only applies the multi-stage pipeline through `gpuLUTChain.applyToCanvas(...)` when `gpuLUTChain?.hasAnyLUT()` is true in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2131).
  - `ColorPipelineManager.initGPULUTChain()` can legitimately fail and leave `_gpuLUTChain = null` on non-WebGL2 paths in [src/ui/components/ColorPipelineManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ColorPipelineManager.ts#L102).
- Impact:
  - On fallback rendering paths, File/Look/Display LUT assignments remain editable state but never affect pixels.
  - That makes the multi-stage LUT pipeline partly fiction outside the GPU-chain path: the app stores and syncs the configuration, but the renderer drops it completely.

### 146. The shipped LUT Pipeline panel does not persist through project save/load at all

- Severity: High
- Area: Color workflow / project persistence
- Evidence:
  - The shipped Color tab exposes a real `LUT Pipeline` panel toggle in [src/services/tabContent/buildColorTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildColorTab.ts#L73), and the panel itself is a first-class UI for `Pre-Cache -> File -> Look -> Display` LUT stages in [src/ui/components/LUTPipelinePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/LUTPipelinePanel.ts#L1).
  - Runtime panel edits are wired into the viewer via `pipelineChanged -> viewer.syncLUTPipeline()` in [src/AppColorWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppColorWiring.ts#L207).
  - The pipeline model even has an explicit serializable state API in `LUTPipeline.getSerializableState()` in [src/color/pipeline/LUTPipeline.ts](/Users/lifeart/Repos/openrv-web/src/color/pipeline/LUTPipeline.ts#L314).
  - But `.orvproject` schema has no field for LUT pipeline state in [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L94), and `SessionSerializer.toJSON(...)` / `fromJSON(...)` never save or restore it in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L257) and [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L354).
- Impact:
  - The app exposes a detailed, production-mounted LUT pipeline workflow that completely disappears after project save/load.
  - That is especially misleading because the codebase already contains a serializable pipeline state shape, so the feature looks designed for persistence even though the shipping persistence layer ignores it.

### 147. The registered MXF “decoder” returns a dummy 1x1 pixel instead of actual image data

- Severity: High
- Area: Format support / MXF media loading
- Evidence:
  - The format registry registers MXF as a normal decoder with `canDecode: isMXFFile` in [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L785).
  - The adapter comment explicitly states it does not decode video frames and only returns metadata in [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L772).
  - Its `decode()` implementation returns `width: 1`, `height: 1`, and `data: new Float32Array(4)` with `metadataOnly: true` in [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L792).
  - No other production code path consumes `metadataOnly` as a special “do not display” contract; that marker appears only in this adapter result in [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L802).
- Impact:
  - MXF can be recognized as supported media while producing a fake 1x1 image instead of real frames.
  - That is worse than an explicit unsupported-format error because the app pretends to load the file successfully while showing meaningless pixels.

### 148. HDR VideoFrame upload failure degrades to a blank frame rather than a usable fallback

- Severity: High
- Area: HDR rendering / browser fallback correctness
- Evidence:
  - HDR video and several HDR image formats are represented as VideoFrame-backed `IPImage`s with only a 4-byte placeholder buffer, for example in [src/nodes/sources/VideoSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/VideoSourceNode.ts#L924), [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1249), [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1343), and [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L1504).
  - The renderer’s HDR path tries `gl.texImage2D(..., image.videoFrame)` directly in [src/render/Renderer.ts](/Users/lifeart/Repos/openrv-web/src/render/Renderer.ts#L857).
  - If that upload fails, the renderer releases the managed VideoFrame and falls through to the typed-array upload path in [src/render/Renderer.ts](/Users/lifeart/Repos/openrv-web/src/render/Renderer.ts#L880).
  - The source code explicitly notes that for these HDR VideoFrame-only images, the typed-array fallback “will produce a blank frame” in [src/render/Renderer.ts](/Users/lifeart/Repos/openrv-web/src/render/Renderer.ts#L883).
- Impact:
  - On browsers/GPUs where `texImage2D(VideoFrame)` fails, HDR video and HDR VideoFrame-backed image formats can turn into blank output instead of degrading to SDR or surfacing a clear unsupported-path error.
  - This is a user-visible render failure, not just a performance downgrade.

### 149. Share links serialize `sourceUrl` but never use it, so a clean recipient cannot reconstruct the shared media

- Severity: High
- Area: URL sharing / review-link reproducibility
- Evidence:
  - `SessionURLService.captureSessionURLState()` explicitly serializes the current source URL into `sourceUrl` in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L124).
  - The URL-state schema describes that field as `Source URL (for reference / re-loading)` in [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L27).
  - The encoder persists that field as compact key `su` in [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L135), and decoding restores it in [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L200).
  - But `SessionURLService.applySessionURLState()` never reads `state.sourceUrl` at all in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L146).
  - The parallel network-share path captures the same `sourceUrl` field in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L1073), but its apply path also never consumes it in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L1083).
- Impact:
  - The app advertises shareable review links with encoded source identity, but opening that link in a clean session cannot reload the shared shot from the serialized URL.
  - In practice, the link only replays partial view state onto whatever media is already open locally, which makes the shared hash non-reproducible for the most important case: a fresh recipient opening the link.

### 150. Share-link URL state cannot explicitly reset defaults, so recipients keep stale local transform / wipe / OCIO / A-B state

- Severity: High
- Area: URL sharing / state application semantics
- Evidence:
  - The compact URL encoder intentionally omits default/off values: current A/B stays omitted when it is `A`, wipe mode is omitted when it is `off`, default transforms are omitted, and OCIO is omitted when disabled in [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L140), [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L142), [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L146), and [src/core/session/SessionURLManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.ts#L151).
  - The tests explicitly codify that omission behavior, for example `currentAB` omitted when default, `wipeMode` omitted when `"off"`, and disabled OCIO omitted in [src/core/session/SessionURLManager.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.test.ts#L220), [src/core/session/SessionURLManager.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.test.ts#L225), and [src/core/session/SessionURLManager.test.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionURLManager.test.ts#L235).
  - `SessionURLService.applySessionURLState()` applies only fields that are present and never resets omitted state back to defaults in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L166), [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L180), [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L184), and [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L191).
- Impact:
  - A sender with default/off state cannot reliably share that state to a recipient who already has non-default settings.
  - Links from a neutral view can still open with stale pan/zoom, wipe, OCIO enabled, or B-side compare state on the receiver, which breaks the promise that the URL reproduces the shared review state.

### 151. Unified preferences export / import / reset drops FPS indicator settings even though the shipped overlay persists them

- Severity: Medium
- Area: Preferences portability / overlay state persistence
- Evidence:
  - `FPSIndicator` loads its live state from persisted `getFPSIndicatorPrefs()` on construction in [src/ui/components/FPSIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FPSIndicator.ts#L80).
  - The core preferences facade defines a dedicated `fpsIndicator` storage key in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L72) and read/write methods in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L330).
  - But the exported preferences payload has no `fpsIndicatorPrefs` field at all in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L57), and `buildExportPayload()` never includes it in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L454).
  - `importAll(...)` also never restores FPS indicator prefs in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L356), and `resetAll()` does not emit an `fpsIndicatorPrefsChanged` reset event in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L433).
- Impact:
  - The app treats FPS indicator configuration as persisted user state during normal use, but that state is silently lost when users rely on the unified preferences backup/restore path.
  - A reset/import flow can leave the FPS overlay configuration diverging from the rest of the supposedly restored preferences set.

### 152. Large parts of the unified preferences model are storage-only and never affect runtime behavior

- Severity: Medium
- Area: Preferences / dead user configuration
- Evidence:
  - The core preferences model defines persisted `ColorDefaults`, `ExportDefaults`, and `GeneralPrefs` fields including `defaultInputColorSpace`, `defaultExposure`, `frameburnEnabled`, `frameburnConfig`, `defaultFps`, `autoPlayOnLoad`, and `showWelcome` in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L35), [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L42), and [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L50).
  - Those values are exported/imported as first-class preference payload fields in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L65) and [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L400).
  - But outside `PreferencesManager` itself, the only production read of `getGeneralPrefs()` is the note-author fallback in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L949).
  - Source-level search found no non-test production callers of `getColorDefaults()` or `getExportDefaults()`, and no production reads of the modeled fields like `autoPlayOnLoad`, `showWelcome`, `defaultInputColorSpace`, `defaultExposure`, or `frameburnEnabled`.
- Impact:
  - The app persists and backs up several preference categories that users would reasonably expect to change startup, default color, or export behavior, but they currently do nothing in production.
  - That creates misleading configuration surface area: exported preferences can look richer and more complete than the runtime behavior they actually control.

### 153. Drag-and-drop GTO/RV session loading loses sidecar file resolution that the file picker preserves

- Severity: High
- Area: Session ingest / drag-and-drop parity
- Evidence:
  - The header file-picker path builds an `availableFiles` map from the non-session files in the selection and passes it into `loadFromGTO(...)` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1392).
  - The viewer drag-and-drop path detects `.rv` / `.gto` files but calls `session.loadFromGTO(content)` without any `availableFiles` map in [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L728).
  - GTO import actually uses `availableFiles` to resolve referenced media/CDL files by basename in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L692) and [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L1991).
- Impact:
  - Importing an RV/GTO session together with its companion media works differently depending on whether users use the file picker or drag-and-drop.
  - The drag path silently loses local sidecar resolution, so the same bundle can import more incompletely from the viewer than from the header.

### 154. Drag-and-drop skips single-file sequence inference that the file picker supports

- Severity: Medium
- Area: Media ingest / sequence detection consistency
- Evidence:
  - The header file-picker path tries `inferSequenceFromSingleFile(singleFile, fileArray)` when exactly one image file is selected and will promote that single file into a detected sequence in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1436).
  - The viewer drag-and-drop path only auto-detects sequences when more than one image file is dropped; otherwise it falls straight through to single-file loading in [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L709).
- Impact:
  - A numbered frame chosen through the file picker can open as a full sequence, while dropping the exact same file onto the viewer only loads a single still.
  - That makes the app’s main ingest paths disagree on a core review workflow.

### 155. Drag-and-drop treats `.rvedl` as media and routes it into the wrong loader

- Severity: Medium
- Area: Session ingest / EDL workflow
- Evidence:
  - The header file input explicitly accepts `.rvedl` and has a dedicated RVEDL parse path through `session.loadEDL(text)` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L216) and [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1350).
  - The viewer drag-and-drop path only special-cases `.rv` / `.gto`; everything else goes through `session.loadFile(file)` in [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L726).
  - `SessionMedia.loadFile(...)` only dispatches to image/video loading in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L352).
  - Unknown extensions default to `'image'` in `detectMediaTypeFromFile(...)` in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L88).
- Impact:
  - A `.rvedl` that loads correctly from the header can fail or be misrouted when dropped onto the viewer.
  - Users are given two different session-ingest surfaces, but only one of them actually supports the documented EDL path.

### 156. Dropping a session bundle with multiple image files can ignore the session file completely

- Severity: High
- Area: Session ingest / drag-and-drop branch ordering
- Evidence:
  - The viewer drag-and-drop path checks `imageFiles.length > 1` before it looks for `.rv` / `.gto` files in [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L709).
  - When that branch succeeds, it immediately calls `session.loadSequence(bestSequence)` and `return`s in [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L715).
  - The `.rv` / `.gto` handling loop only runs afterward in [src/ui/components/ViewerInputHandler.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerInputHandler.ts#L725).
  - The header file-picker path does the opposite: it prioritizes the session file first and only falls back to sequence detection when no session file is present in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1387).
- Impact:
  - Dropping an RV/GTO session together with a frame sequence can open the sequence directly and skip the session instructions, nodes, and review state entirely.
  - That makes “drop the whole session bundle” actively unsafe in the viewer, because the same file set is interpreted differently from the header import path.

### 157. Unsupported dropped files are deliberately misclassified as images instead of being rejected up front

- Severity: Medium
- Area: File ingest / unsupported-format handling
- Evidence:
  - `detectMediaTypeFromFile(...)` documents that unknown types “default to image to preserve existing behavior” in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L88).
  - The implementation returns `'image'` for any extension/MIME it does not recognize in [src/utils/media/SupportedMediaFormats.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/SupportedMediaFormats.ts#L113).
  - `SessionMedia.loadFile(...)` only branches into image/video loading based on that classification and has no unsupported-file path in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L352).
- Impact:
  - Non-media files dropped onto the viewer are pushed through the image loader stack instead of getting an immediate “unsupported file type” rejection.
  - That produces misleading downstream errors and is the underlying reason session-adjacent files like `.rvedl` get routed into the wrong loader when drag-and-dropped.

### 158. The dedicated `Open Project` button cannot actually pick most formats that its loader supports

- Severity: Medium
- Area: Project/session open workflow
- Evidence:
  - The header’s dedicated project input only accepts `.orvproject` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L223).
  - But the `openProject(...)` handler explicitly supports `.orvproject`, `.rv`, `.gto`, and `.rvedl` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L290) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L319).
  - The unsupported-file warning in that same handler even tells users it expects `.orvproject, .rv, .gto, or .rvedl` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L327).
- Impact:
  - The shipped `Open Project` UI suggests a broader project/session open path exists, but in normal use the browser picker only exposes `.orvproject`.
  - That leaves the `.rv` / `.gto` / `.rvedl` branches effectively unreachable from the button that is supposed to invoke them.

### 159. Plugin settings have backup/import APIs but are excluded from the app’s real preferences backup flow

- Severity: Medium
- Area: Plugin persistence / backup portability
- Evidence:
  - The plugin system owns a real persistent `PluginSettingsStore` on the registry in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L90).
  - Plugin settings are exposed to plugins through `PluginContext.settings` in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L457).
  - That store has explicit `exportAll()` / `importAll()` backup helpers in [src/plugin/PluginSettingsStore.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginSettingsStore.ts#L198).
  - But the app’s actual unified backup/import path goes through `PreferencesManager.exportAll()` / `importAll()` in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L352), and that payload contains no plugin-settings field in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L57).
  - Source-level search found no production caller wiring `PluginSettingsStore.exportAll()` or `importAll()` into any app backup/restore flow.
- Impact:
  - Plugin settings can persist locally during normal use but disappear from the app’s real preferences backup/transfer mechanism.
  - That makes plugin-backed workflows non-portable even though both sides of the codebase imply a complete settings backup story.

### 160. `openProject()` only resyncs compare/stack UI for `.orvproject`, not for `.rv` / `.gto` loads

- Severity: Medium
- Area: Project/session open workflow / UI truthfulness
- Evidence:
  - `openProject()` calls `syncControlsFromState(state)` only in the `.orvproject` branch in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L290).
  - The `.rv` / `.gto` branch only calls `session.loadFromGTO(content)` and returns in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L319).
  - `syncControlsFromState(...)` is the helper that explicitly pushes loaded wipe state into `compareControl` and loaded stack state into `stackControl` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L477).
  - The tests for this helper are written only around the `.orvproject` path (`APM-100` / `APM-101` / `APM-102`) in [src/AppPersistenceManager.test.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.test.ts#L625).
- Impact:
  - Loading RV/GTO sessions through the project-open path can leave compare/stack controls showing stale UI state even if the underlying session/viewer state changed.
  - The app already has a dedicated post-load control sync step, but it is applied inconsistently across supported project/session formats.

### 161. `openProject()` creates an auto-checkpoint before it knows whether anything will actually be loaded

- Severity: Medium
- Area: Project/session open workflow / recovery history quality
- Evidence:
  - `openProject()` unconditionally calls `createAutoCheckpoint('Before Project Load')` before any extension/type branching in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L286).
  - `createAutoCheckpoint(...)` serializes the current session and writes an auto-checkpoint through `snapshotManager.createAutoCheckpoint(...)` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L180).
  - The later branches include non-replacing flows like `.rvedl` import and even the unsupported-file warning path in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L322) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L326).
- Impact:
  - Trying to open an unsupported file, or opening an EDL that does not actually replace the session, still creates a “Before Project Load” recovery checkpoint.
  - That pollutes recovery history with misleading checkpoints for operations that never became a real project/session replacement.

### 162. The project-open path for `.rv/.gto` can never provide companion files for session-side media resolution

- Severity: Medium
- Area: Project/session open workflow / RV-GTO interchange
- Evidence:
  - `openProject(file: File)` only accepts a single `File` object and the dedicated project input is not multi-select in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L223).
  - The `.rv` / `.gto` branch in `openProject()` reads that single file and calls `session.loadFromGTO(content)` with no `availableFiles` map in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L319).
  - The broader media/session import path is explicitly designed to pass a map of companion files into `loadFromGTO(...)` for basename resolution in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1392).
  - GTO import uses that `availableFiles` map to match referenced media/CDL files in [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L692) and [src/core/session/GTOGraphLoader.ts](/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts#L1991).
- Impact:
  - Even if an RV/GTO session is opened through the project-open API, that path cannot bring along the companion media bundle that the importer needs for best-effort reconstruction.
  - So the app ships two session-open paths, but only the general media-open flow can perform the richer sidecar-aware RV/GTO import.

### 163. RVEDL import parses and stores entries, but the timeline editor never consumes them

- Severity: Medium
- Area: EDL workflow / timeline visibility
- Evidence:
  - RVEDL import stores parsed entries on the session and emits `edlLoaded` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L227).
  - The session exposes those parsed entries through `session.edlEntries` in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L509).
  - `TimelineEditorService` does not subscribe to `edlLoaded`; it only resyncs on `graphLoaded`, `durationChanged`, and `sourceLoaded` in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L152).
  - Its `syncFromGraph()` path also never reads `session.edlEntries`; it only loads from a `SequenceGroupNode`, playlist clips, or a synthetic fallback built from loaded sources in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L264).
  - The header/import UI still presents RVEDL load as a successful operation in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1352) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L322).
- Impact:
  - Users can successfully import an RVEDL and get a success message, but the timeline editor does not switch to or display that imported cut structure.
  - In practice, RVEDL support currently behaves more like metadata storage than an actually usable timeline-import workflow.

### 164. Loaded RVEDL state is not saved into `.orvproject` at all

- Severity: Medium
- Area: EDL workflow / project persistence
- Evidence:
  - RVEDL entries are stored on `SessionGraph` as `_edlEntries` and exposed through `session.edlEntries` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L73) and [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L509).
  - `SessionState` has no field for EDL entries in [src/core/session/SessionState.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionState.ts#L94).
  - `SessionSerializer.toJSON(...)` serializes media/playback/view/color/playlist/notes/version/status state, but not `edlEntries`, in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L257).
- Impact:
  - Even if a user loads an RVEDL successfully, saving the session as `.orvproject` silently drops that imported cut list.
  - So RVEDL import is not only weakly consumed at runtime, it is also non-persistent across the app’s main project-save workflow.

### 165. The viewer’s persisted texture-filter preference is outside the app’s real preferences backup/import path

- Severity: Medium
- Area: Viewer preferences / backup portability
- Evidence:
  - The viewer loads its texture-filter mode from `loadFilterModePreference()` during startup in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L874).
  - Changing the mode persists it through `persistFilterModePreference(...)` in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2439).
  - That preference is stored under its own standalone localStorage key `openrv.filterMode` in [src/ui/components/ViewerIndicators.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerIndicators.ts#L15) and [src/ui/components/ViewerIndicators.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerIndicators.ts#L240).
  - The app’s formal preferences backup/import flow only exports the `PreferencesManager` payload in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L352), and that payload contains no filter-mode field in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L57).
- Impact:
  - A user’s nearest-neighbor/bilinear QC preference persists locally, but disappears when they rely on the app’s real preferences export/import path.
  - That makes viewer behavior less portable than the rest of the settings model implies.

### 166. Display profile state is applied as a real persisted viewer preference, but unified preferences export/import omits it

- Severity: Medium
- Area: Display preferences / backup portability
- Evidence:
  - Display-profile persistence uses the formal preference key `openrv-display-profile` in [src/utils/preferences/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/preferences/PreferencesManager.ts#L18).
  - The control loads and saves that state through `loadDisplayProfile()` / `saveDisplayProfile()` in [src/color/DisplayTransfer.ts](/Users/lifeart/Repos/openrv-web/src/color/DisplayTransfer.ts#L207).
  - The app applies the persisted display-profile state to the real viewer on startup in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L707).
  - But the unified preferences payload has no `displayProfile` field in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L57), and `importAll()` likewise has no display-profile branch in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L356).
- Impact:
  - Users can tune the display transfer/gamma/brightness and see that state persist locally across reloads, but it disappears when they use the app’s real preferences export/import flow.
  - That makes display calibration one of the shipped viewer settings that is not actually portable with the rest of the saved preferences.

### 167. Timeline timecode-display mode persists locally but is outside unified preferences backup/import/reset

- Severity: Medium
- Area: Timeline preferences / backup portability
- Evidence:
  - The timeline stores its chosen display mode under a standalone localStorage key `openrv.timeline.displayMode` in [src/ui/components/Timeline.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts#L43).
  - It restores that mode on construction in [src/ui/components/Timeline.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts#L136) and saves changes whenever the user toggles display mode in [src/ui/components/Timeline.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts#L438).
  - The unified preferences payload exported by `PreferencesManager` does not include any timeline display-mode field in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L454).
  - `resetAll()` only clears `PREFERENCE_STORAGE_KEYS` plus `CORE_PREFERENCE_STORAGE_KEYS` in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L433), and `openrv.timeline.displayMode` is not one of those keys.
- Impact:
  - A user’s chosen Frames / Timecode / Seconds / Footage view survives page reloads on one machine, but it is neither exportable/importable nor reset by the app’s “all preferences” workflow.
  - So timeline display behavior can unexpectedly survive a global reset or fail to travel with a preferences backup.

### 168. Missing-frame overlay mode persists locally but bypasses the app’s real preferences portability/reset flow

- Severity: Medium
- Area: Viewer preferences / backup portability
- Evidence:
  - The shipped View tab exposes a real missing-frame mode selector that calls `viewer.setMissingFrameMode(...)` in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L184) and [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L324).
  - The viewer persists that mode under its own standalone key `openrv.missingFrameMode` in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L184), restores it on startup in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1155), and writes it back on change in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1167).
  - The unified preferences export/import payload in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L454) has no field for that setting.
  - `resetAll()` also does not clear `openrv.missingFrameMode`, because it only removes the registered preference-key sets in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L433).
- Impact:
  - Missing-frame behavior is a real shipped viewer choice that survives reloads, but it does not survive preferences export/import and is not actually covered by “reset all preferences.”
  - That leaves a user-visible viewer mode sticky in ways the rest of the settings model does not explain.

### 169. Multi-source layout persistence exists in code and tests, but production never calls it

- Severity: Medium
- Area: Multi-source layout / persistence wiring
- Evidence:
  - `MultiSourceLayoutStore` implements explicit local persistence via `saveToStorage()` / `loadFromStorage()` using `openrv-multi-source-layout` in [src/ui/multisource/MultiSourceLayoutStore.ts](/Users/lifeart/Repos/openrv-web/src/ui/multisource/MultiSourceLayoutStore.ts#L27) and [src/ui/multisource/MultiSourceLayoutStore.ts](/Users/lifeart/Repos/openrv-web/src/ui/multisource/MultiSourceLayoutStore.ts#L313).
  - The shipped UI creates the real control with a default `MultiSourceLayoutManager(new MultiSourceLayoutStore())` in [src/ui/components/MultiSourceLayoutControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MultiSourceLayoutControl.ts#L69) and [src/services/controls/createViewControls.ts](/Users/lifeart/Repos/openrv-web/src/services/controls/createViewControls.ts#L39).
  - A production source search only finds `saveToStorage()` / `loadFromStorage()` references in the store itself and tests, not in runtime wiring, as shown by [src/ui/multisource/MultiSourceLayoutStore.ts](/Users/lifeart/Repos/openrv-web/src/ui/multisource/MultiSourceLayoutStore.ts#L314).
- Impact:
  - Multi-source layout options look like a persisted feature on paper, but real users do not get reload persistence because the save/load methods are never invoked.
  - The codebase and tests imply a remembered layout experience that the shipped app does not actually deliver.

### 170. Playback FPS reporting can contradict the dropped-frame counter

- Severity: Medium
- Area: Playback metrics / viewer diagnostics
- Evidence:
  - `PlaybackEngine.advanceFrame()` explicitly documents that `trackFrameAdvance()` is called for skipped frames too, which inflates the measured FPS, in [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L1012).
  - The same emitted measurement object also carries the real dropped-frame count in [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L1027).
  - The FPS overlay renders both values side by side, showing green/yellow/red FPS plus a `N skipped` counter, in [src/ui/components/FPSIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FPSIndicator.ts#L233) and [src/ui/components/FPSIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FPSIndicator.ts#L257).
- Impact:
  - The diagnostics UI can show apparently healthy real-time FPS while simultaneously reporting skipped frames, which is exactly the opposite of what users rely on that indicator to judge.
  - That weakens the QC value of the shipped FPS overlay during stressed playback.

### 171. Snapshot export is one-way in the shipped UI

- Severity: Medium
- Area: Snapshot workflow / interchange
- Evidence:
  - `SnapshotManager` implements both `exportSnapshot(...)` and `importSnapshot(...)` in [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L453) and [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L508).
  - The shipped `SnapshotPanel` advertises actions `Preview, Restore, Export, Delete, Rename` in its own header comment in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L6).
  - A production source search finds no runtime caller of `importSnapshot(...)` outside the manager itself.
  - The panel implements an Export action in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L428) and [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L569), but there is no corresponding import control or wiring.
- Impact:
  - Users can export snapshot JSON from the app, but they cannot bring that snapshot back through the shipped UI.
  - That makes snapshot interchange effectively one-way despite the underlying manager already supporting both directions.

### 172. The unified preferences export/import/reset system is effectively unreachable in production UI

- Severity: Medium
- Area: Preferences workflow / UI wiring
- Evidence:
  - The core preferences facade implements `exportAll()`, `importAll(...)`, and `resetAll()` in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L352) and [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L433).
  - The app only wires live subsystems into that facade via `setSubsystems(...)` in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L430).
  - A production source search finds no runtime caller of `PreferencesManager.exportAll()`, `importAll(...)`, or `resetAll()` outside the class itself and tests.
- Impact:
  - The app has a nominal “unified preferences” portability/reset system, but users cannot actually invoke it from the shipped UI.
  - That makes all of the backup/import/reset logic much less useful in practice than the code structure suggests.

### 173. Annotation JSON import exists, but the shipped UI hardwires it to destructive replace mode

- Severity: Medium
- Area: Annotation workflow / interchange
- Evidence:
  - The shipped Export menu now exposes both `Export Annotations (JSON)` and `Import Annotations (JSON)` in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L205) through [src/ui/components/ExportControl.ts#L208).
  - Playback wiring does call `parseAnnotationsJSON(...)` and `applyAnnotationsJSON(...)`, but it always passes `{ mode: 'replace' }` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L253) through [src/AppPlaybackWiring.ts#L274).
  - The lower-level annotation utility supports both `mode: 'merge'` and `frameOffset`, but those options are never surfaced in the shipped UI in [src/utils/export/AnnotationJSONExporter.ts](/Users/lifeart/Repos/openrv-web/src/utils/export/AnnotationJSONExporter.ts#L198) through [src/utils/export/AnnotationJSONExporter.ts#L224).
  - The success alert explicitly tells the user that existing annotations were replaced in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L273) through [src/AppPlaybackWiring.ts#L274).
- Impact:
  - Users can re-import annotation JSON, but only by wiping the current annotation set.
  - That makes the built-in interchange workflow much less useful for review updates, retimed shots, or layered feedback where merge/offset behavior is the safer default.

### 174. Marker import is merge-only in the shipped UI and silently drops frame collisions

- Severity: Medium
- Area: Marker workflow / interchange
- Evidence:
  - The marker panel’s Import button always calls `importMarkers('merge')` in [src/ui/components/MarkerListPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MarkerListPanel.ts#L173).
  - The panel code supports both `replace` and `merge` modes in [src/ui/components/MarkerListPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MarkerListPanel.ts#L325), but the shipped UI exposes only the merge path.
  - In merge mode, imported markers that land on a frame that already has a marker are silently skipped in [src/ui/components/MarkerListPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MarkerListPanel.ts#L373).
- Impact:
  - Users cannot faithfully restore a marker export over an existing session from the shipped UI unless they manually clear markers first.
  - Even then, accidental frame collisions during import are silently lost instead of being surfaced or resolved.

### 175. The shipped export UI ignores the app’s saved export-default preferences

- Severity: Medium
- Area: Export workflow / preferences
- Evidence:
  - The app defines persisted export defaults such as `defaultFormat`, `defaultQuality`, and `includeAnnotations` in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L42) and exposes them through `getExportDefaults()` in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L319).
  - A production source search finds no runtime consumer of `getExportDefaults()` outside `PreferencesManager` itself.
  - The shipped export UI hardcodes its emitted values instead: single-frame export uses `quality: 0.92` in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L419), source export uses `0.92` in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L431), and sequence export hardcodes `format: 'png'` plus `quality: 0.95` in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L438).
- Impact:
  - Users can persist export defaults in the preferences model, but the real export menu never honors them.
  - So exported files keep using hardcoded defaults instead of the user’s saved export behavior.

### 176. The export menu’s `Include annotations` option does not apply to `Copy to Clipboard`

- Severity: Medium
- Area: Export UI / behavior consistency
- Evidence:
  - `ExportControl` presents a shared `Include annotations` checkbox for the export menu in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L303).
  - Single-frame and sequence exports read that checkbox through `getIncludeAnnotations()` / `annotationsCheckbox?.checked` in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L415) and [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L438).
  - But `Copy to Clipboard` emits only `copyRequested` with no annotation flag in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L427).
  - Playback wiring hardcodes that path to `viewer.copyFrameToClipboard(true)` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L140), and the keyboard action does the same in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L543).
- Impact:
  - Users can uncheck `Include annotations` and still get annotations copied to the clipboard.
  - That makes the export menu internally inconsistent and undermines trust in the option’s meaning.

### 177. Notes import performs almost no schema validation and can inject malformed notes into live UI state

- Severity: Medium
- Area: Notes workflow / data integrity
- Evidence:
  - The Notes panel import path only checks for `data.notes` being an array before calling `noteManager.fromSerializable(...)` in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L845).
  - `NoteManager.fromSerializable(...)` clears existing notes and inserts each imported object verbatim with no field validation in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L247).
  - The live Notes UI immediately assumes imported notes have valid `createdAt`, `frameStart`, `frameEnd`, `author`, `status`, and `text` fields when sorting/rendering in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L441) and [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L538).
- Impact:
  - An externally edited or incompatible notes JSON file can replace the current note set with malformed entries instead of being rejected cleanly.
  - That can lead to broken note rendering or partially corrupted note state right after import, with no compatibility warning up front.

### 178. Marker import silently drops invalid entries and merge collisions with no summary

- Severity: Medium
- Area: Marker workflow / data integrity
- Evidence:
  - After only top-level shape validation, the marker import path filters entries down to `validMarkers` in [src/ui/components/MarkerListPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MarkerListPanel.ts#L355).
  - Entries that fail field checks are simply removed by that filter, with no user-visible warning or count in [src/ui/components/MarkerListPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MarkerListPanel.ts#L360).
  - In merge mode, frame collisions are also silently skipped via `continue` in [src/ui/components/MarkerListPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/MarkerListPanel.ts#L373).
- Impact:
  - A marker import can appear to “work” while quietly losing part of the file.
  - Users get no indication whether markers were skipped because they were malformed or because the target frames were already occupied.

### 179. ShotGrid note pull flattens note timing and review metadata

- Severity: Medium
- Area: ShotGrid integration / notes workflow
- Evidence:
  - `ShotGridBridge.getNotesForVersion(...)` only requests `subject,content,note_links,created_at,user` and does not fetch any frame-range field in [src/integrations/ShotGridBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridBridge.ts#L247).
  - `ShotGridIntegrationBridge.addNotesFromShotGrid(...)` then creates every pulled note at hardcoded frame `1-1` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L281).
  - `NoteManager.addNote(...)` always stamps pulled notes with a fresh local `createdAt`, `modifiedAt`, and default `open` status in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L69).
- Impact:
  - ShotGrid notes lose their real review timing context when pulled into the app.
  - Re-imported notes all look like new local notes on frame 1 instead of preserving the original review metadata users expect to sync.

### 180. ShotGrid note deduplication resets on disconnect, so re-pulls can duplicate everything

- Severity: Medium
- Area: ShotGrid integration / notes workflow
- Evidence:
  - Deduplication is based only on the in-memory `sgNoteIdMap` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L48).
  - That map is cleared on disconnect and disposal in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L105) and [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L259).
  - Pulled notes themselves do not persist the remote ShotGrid note ID anywhere in local note data, because `addNotesFromShotGrid(...)` only calls `noteManager.addNote(...)` with local fields in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L281).
- Impact:
  - Pulling the same ShotGrid notes again after reconnecting or restarting can create duplicate local notes instead of recognizing them as already synced.
  - The sync flow behaves like one-time session memory, not a durable integration.

### 181. Annotation PDF export can fail with no user-visible feedback when popups are blocked

- Severity: Medium
- Area: Export workflow / annotations
- Evidence:
  - The shipped export wiring fires `void exportAnnotationsPDF(...)` with no `catch` or alert path in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L173).
  - `exportAnnotationsPDF(...)` explicitly throws when `window.open(...)` fails in [src/utils/export/AnnotationPDFExporter.ts](/Users/lifeart/Repos/openrv-web/src/utils/export/AnnotationPDFExporter.ts#L461).
  - The exporter only catches thumbnail-render errors; it does not convert popup/open failures into app UI feedback in [src/utils/export/AnnotationPDFExporter.ts](/Users/lifeart/Repos/openrv-web/src/utils/export/AnnotationPDFExporter.ts#L437).
- Impact:
  - In normal popup-blocked browser setups, `Export Annotations (PDF)` can appear to do nothing useful from the user’s perspective.
  - The export path has a real failure mode, but the app does not surface it through the UI.

### 182. Fullscreen failures are reduced to console warnings, leaving the UI looking dead

- Severity: Low
- Area: Window management / browser integration
- Evidence:
  - Header-bar fullscreen requests call `fullscreenManager.toggle()` directly in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L68).
  - `FullscreenManager.enter()` and `exit()` swallow browser API failures and only `console.warn(...)` in [src/utils/ui/FullscreenManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/FullscreenManager.ts#L62) and [src/utils/ui/FullscreenManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/FullscreenManager.ts#L78).
  - No higher-level alert, status indicator, or recovery path is wired on failure.
- Impact:
  - If the browser rejects fullscreen, the control can feel unresponsive rather than explicitly failing.
  - Users get no guidance about whether fullscreen is unsupported, blocked, or just temporarily unavailable.

### 183. DCC `syncColor` advertises LUT sync, but the app silently ignores it

- Severity: Medium
- Area: DCC integration / color sync
- Evidence:
  - The DCC protocol exposes `lutPath` on inbound `syncColor` messages in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L53).
  - Production wiring in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L128) only forwards `exposure`, `gamma`, `temperature`, and `tint`.
  - No runtime consumer of `msg.lutPath` exists in the shipped DCC wiring path.
- Impact:
  - A DCC tool can send a syntactically valid color-sync message that looks supported by the protocol but still loses its LUT intent on arrival.
  - The integration behaves as partial color sync while presenting itself as a fuller transport.

### 184. DCC bridge defines outbound `annotationAdded`, but production never emits it

- Severity: Medium
- Area: DCC integration / review sync
- Evidence:
  - `DCCBridge` exposes `sendAnnotationAdded(...)` and documents `annotationAdded` as an outbound event in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L12) and [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L308).
  - The shipped wiring in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L77) only connects frame sync and color sync.
  - Production search finds no runtime caller of `sendAnnotationAdded(...)` outside tests and the bridge class itself.
- Impact:
  - External DCC clients cannot rely on live annotation notifications even though the integration API claims they exist.
  - The bridge surface overstates what the real app actually sends.

### 185. DCC `loadMedia` failures are never reported back to the requesting tool

- Severity: Medium
- Area: DCC integration / error handling
- Evidence:
  - Inbound `loadMedia` requests are handled in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L96).
  - When media loading fails, the app only logs `Failed to load video from DCC` or `Failed to load image from DCC` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L110) and [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L121).
  - The DCC protocol already has an outbound `error` message type in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L104), but this failure path never sends one.
- Impact:
  - A remote DCC client can issue `loadMedia` and receive no structured failure response when the app cannot open the media.
  - That makes automation and host-side UX harder because the request can fail silently from the sender’s point of view.

### 186. Network session join only requests host media when the guest starts completely empty

- Severity: Medium
- Area: Collaboration / session transfer
- Evidence:
  - The join flow decides whether to request media sync via `shouldRequestMediaSync(...)` in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L842).
  - That method returns `true` only when `session.sourceCount === 0` in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L843).
  - When media sync is skipped, the received session state is applied onto whatever local sources already exist in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L284) and [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L1088).
- Impact:
  - Joining a collaborative review from a non-empty session can map the host’s frame/source/A-B state onto unrelated local media instead of bringing over the correct media.
  - The collaboration flow only behaves correctly for “empty guest” cases, not for realistic mid-session joins.

### 187. Network media-transfer decline or failure still applies the host’s pending session state

- Severity: Medium
- Area: Collaboration / session transfer
- Evidence:
  - When host state arrives and media sync is requested, the guest stores `pendingStateByTransferId` but also immediately applies the shared state in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L274) and [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L278).
  - If the guest declines the media transfer, the pending state is still applied in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L330).
  - If media import later fails, the same pending state is still applied after the error in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L399) and [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L408).
- Impact:
  - A guest can end up with the host’s frame/view/compare state layered onto missing or incompatible local media even after refusing the transfer or hitting an import error.
  - The recovery path preserves the wrong part of the sync and loses the part that would have made it meaningful.

### 188. DCC bridge connection and protocol errors have no app-level surface

- Severity: Medium
- Area: DCC integration / diagnostics
- Evidence:
  - `DCCBridge` emits `error` for connection failures, parse failures, send failures, and reconnect exhaustion in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L126), [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L357), and [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L465).
  - The production bootstrap only constructs the bridge, wires frame/color/media sync, and calls `connect()` in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L591).
  - Production search finds no runtime subscriber for `dccBridge.on('error', ...)` outside tests.
- Impact:
  - A broken `?dcc=` integration can fail without any app-level toast, modal, or status indication for the user.
  - Debugging DCC connectivity becomes unnecessarily opaque because the bridge has error signals, but the shipped app drops them.

### 189. Audio playback setup errors are detected internally but never surfaced through the app

- Severity: Medium
- Area: Audio playback / diagnostics
- Evidence:
  - `AudioPlaybackManager` emits structured `error` events in [src/audio/AudioPlaybackManager.ts](/Users/lifeart/Repos/openrv-web/src/audio/AudioPlaybackManager.ts#L16) and [src/audio/AudioPlaybackManager.ts](/Users/lifeart/Repos/openrv-web/src/audio/AudioPlaybackManager.ts#L733).
  - `AudioCoordinator` only exposes path-change and scrub-availability callbacks in [src/audio/AudioCoordinator.ts](/Users/lifeart/Repos/openrv-web/src/audio/AudioCoordinator.ts#L27), not playback errors.
  - `SessionPlayback` only wires those two callbacks in [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L569), and production search finds no runtime subscriber to `audioPlaybackManager.on('error', ...)`.
- Impact:
  - Audio initialization or decode failures can leave playback/scrub audio unavailable with no app-level explanation.
  - The app has the failure signal, but users only get silent degradation or console-only diagnostics.

### 190. Timeline waveform extraction failures are reduced to a missing waveform with no UI explanation

- Severity: Low
- Area: Timeline / audio UX
- Evidence:
  - On every `sourceLoaded`, the timeline calls `loadWaveform().catch((err) => console.warn(...))` in [src/ui/components/Timeline.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts#L247).
  - `loadWaveform()` sets `waveformLoaded = false` and only redraws on success in [src/ui/components/Timeline.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts#L340).
  - `WaveformRenderer` stores an internal error string via `getError()` in [src/audio/WaveformRenderer.ts](/Users/lifeart/Repos/openrv-web/src/audio/WaveformRenderer.ts#L623) and [src/audio/WaveformRenderer.ts](/Users/lifeart/Repos/openrv-web/src/audio/WaveformRenderer.ts#L668), but production search finds no runtime consumer of that error state.
- Impact:
  - When waveform extraction fails, the timeline simply loses the waveform instead of telling the user why.
  - Troubleshooting falls back to the console even though the waveform subsystem already captures the failure reason.

### 191. Pre-restore and pre-load auto-checkpoints can fail silently while destructive operations still proceed

- Severity: Medium
- Area: Persistence / recovery safety
- Evidence:
  - `createAutoCheckpoint(...)` catches all failures and only `console.error(...)`s them in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L184).
  - Snapshot restore still proceeds immediately after that call in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L215).
  - Project load does the same before replacing the current session in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L304).
- Impact:
  - The app promises itself a rollback checkpoint before major state replacement, but users are not told when that protection was never created.
  - A failed checkpoint can turn restore/load into a one-way action with no visible warning that the safety net is gone.

### 192. Auto-save can fail to initialize while the header indicator still makes it look active

- Severity: Medium
- Area: Persistence / autosave UX
- Evidence:
  - The header auto-save indicator is connected and rendered during playback wiring in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L62).
  - App startup only initializes the actual IndexedDB-backed autosave system later in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L716).
  - If initialization fails, `AutoSaveManager.initialize()` returns `false` after only logging the error in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L136), and `AppPersistenceManager.initAutoSave()` also only logs in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L406).
- Impact:
  - Users can see an autosave control in the header even when the autosave backend never came up.
  - The failure mode is misleading: the feature looks present, but recovery and background saves may be unavailable with no explicit in-app notice.

### 193. Room share links without a PIN do not auto-join during URL bootstrap

- Severity: Medium
- Area: Collaboration / URL bootstrap
- Evidence:
  - `SessionURLService.handleURLBootstrap()` only auto-joins a room when both `roomCode` and `pinCode` are present in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L260).
  - The same service still pre-fills the join-room UI when only `room` exists in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L216).
  - The underlying `NetworkSyncManager.joinRoom(...)` API already accepts an optional PIN in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L403).
- Impact:
  - A valid room share link without a PIN stops at a prefilled panel instead of actually joining.
  - PIN-protected and non-PIN room links behave inconsistently even though the join API supports both.

### 194. Client mode relies on selector attributes that the shipped DOM still does not provide

- Severity: High
- Area: Review mode / restricted UI
- Evidence:
  - The client-mode selector list still targets `[data-panel="..."]` and `[data-toolbar="..."]` attributes in [src/ui/components/ClientMode.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClientMode.ts#L103).
  - The same file explicitly documents that no production DOM elements currently have those attributes in [src/ui/components/ClientMode.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClientMode.ts#L84).
  - Production source search finds those `data-panel` and `data-toolbar` attributes only in tests and in the selector definitions themselves, not in real mounted UI components.
  - `LayoutOrchestrator.applyClientModeRestrictions()` already warns that unmatched selectors mean client mode may not be hiding the intended UI in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L663).
- Impact:
  - Client mode can be enabled while restricted editing panels and toolbars remain visible because the hide selectors match nothing.
  - The feature’s core promise, a review-safe trimmed UI, is currently dependent on test-only markup rather than the shipped interface.

### 195. Client mode's action allowlist is not enforced by the production app

- Severity: High
- Area: Review mode / action gating
- Evidence:
  - `ClientMode.isActionAllowed(...)` implements the actual allowlist/denylist decision in [src/ui/components/ClientMode.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClientMode.ts#L223).
  - Production source search finds runtime usage of `clientMode` limited to URL enablement, state toggling, and DOM hiding in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L133) and [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L613).
  - Production search finds no runtime caller of `isActionAllowed(...)` outside tests and the `ClientMode` class itself.
- Impact:
  - Restricted operations can still remain reachable through keyboard shortcuts, direct control APIs, or other non-hidden entry points even when client mode is enabled.
  - The shipped implementation mostly behaves like cosmetic UI hiding instead of a true locked-down review mode.

### 196. Several clipboard-copy actions fail silently outside the Network Sync UI

- Severity: Medium
- Area: Export / probe / timeline clipboard UX
- Evidence:
  - Export menu `Copy to Clipboard` emits `copyRequested`, but production wiring just calls `viewer.copyFrameToClipboard(true)` and ignores the returned `Promise<boolean>` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L140).
  - The keyboard `export.copyFrame` action does the same in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L545).
  - `Viewer.copyFrameToClipboard(...)` delegates to `copyCanvasToClipboard(...)`, and that helper reduces clipboard failures to a console error plus `false` in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3350) and [src/utils/export/FrameExporter.ts](/Users/lifeart/Repos/openrv-web/src/utils/export/FrameExporter.ts#L152).
  - Pixel Probe row copies also only `console.warn(...)` on clipboard failure in [src/ui/components/PixelProbe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PixelProbe.ts#L943).
  - Timeline timecode copy swallows clipboard failure entirely in [src/ui/components/Timeline.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Timeline.ts#L579).
  - By contrast, Network Sync copy actions do surface clipboard errors via `showError(...)`, so the app already has a better pattern in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L746).
- Impact:
  - On browsers with denied clipboard permissions or unsupported clipboard APIs, copy commands can appear to do nothing with no user-visible explanation.
  - The app treats similar clipboard workflows inconsistently, which makes export/probe/timeline copy actions less trustworthy than the network-sharing UI.

### 197. Malformed WebRTC share links are silently ignored during URL bootstrap

- Severity: Medium
- Area: Collaboration / URL bootstrap
- Evidence:
  - `SessionURLService.handleURLBootstrap()` only handles WebRTC URL signals when `decodeWebRTCURLSignal(...)` yields an `offer` or `answer`; any other decoded result falls through with no `showInfo(...)` or error path in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L226).
  - For offer links, `NetworkSyncManager.joinServerlessRoomFromOfferToken(...)` also returns `null` on malformed tokens, wrong signal type, invalid room codes, or already-busy connection state without emitting a user-facing message in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L280).
  - App startup awaits `handleURLBootstrap()` directly in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L721), so a bad `?webrtc=` link can complete bootstrap with no visible indication that link handling failed.
- Impact:
  - Users opening a malformed or partially-corrupted WebRTC invite/response URL can land in a normal-looking app state with no clue that the collaboration link was ignored.
  - That makes shared-link failures hard to diagnose because the broken input disappears into startup logic instead of surfacing an actionable error.

### 198. Mu compat `realFPS()` reports nominal FPS, not measured playback FPS

- Severity: Medium
- Area: Mu compatibility / playback scripting
- Evidence:
  - The shipped Mu command manifest marks `realFPS` as supported in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L93).
  - The implementation explicitly documents itself as a stub and returns `this.fps()` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L232).
  - The compat tests lock that behavior in by asserting `realFPS()` always equals `fps()` in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L206).
- Impact:
  - Mu scripts that expect measured playback throughput get the configured timeline FPS instead, even during dropped-frame or throttled playback.
  - That makes performance-sensitive review tooling built on the compat API draw the wrong conclusions while still looking “supported”.

### 199. Mu compat `sourcePixelValue()` returns black for normal GPU-backed sources

- Severity: High
- Area: Mu compatibility / source inspection
- Evidence:
  - `MuSourceBridge.sourcePixelValue(...)` is documented as the Mu equivalent of `commands.sourcePixelValue(sourceName, x, y)` in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L423).
  - The implementation also states that it currently returns `[0,0,0,0]` when GPU texture sampling is unavailable in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L426).
  - In the live code path, if there is no special in-memory `imageData` backing for that source, the method falls through to `return [0, 0, 0, 0]` in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L453).
  - The compat tests explicitly encode that zero-read behavior for a registered source with no in-memory image data in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L337).
- Impact:
  - Scripts using the Mu-compatible source-inspection API can receive bogus black pixels for perfectly valid sources on the normal GPU-backed path.
  - That is a functional correctness issue, not just a missing optimization, because the API returns a plausible value instead of failing loudly.

### 200. Mu compat `openUrl()` fails silently when the browser blocks popups

- Severity: Medium
- Area: Mu compatibility / utility commands
- Evidence:
  - `MuUtilsBridge.openUrl(url)` is exposed as the Mu-compatible URL opener in [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L148).
  - The implementation just calls `window.open(url, '_blank', 'noopener,noreferrer')` and ignores the return value in [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L151).
  - The broader app already has other popup-blocked failure paths where `window.open(...)` can return `null`, such as external presentation and annotation PDF export, and those are documented separately in issues `112` and `181`.
- Impact:
  - Mu-compatible scripts can request an external URL open and get no result or error when the browser blocks the popup.
  - That makes automation built on the utility bridge harder to debug because a real runtime failure is reduced to a silent no-op.

### 201. The Mu compatibility layer is not registered in production bootstrap

- Severity: High
- Area: Mu compatibility / app bootstrap
- Evidence:
  - The compat entrypoint requires an explicit `registerMuCompat()` call to create `window.rv.commands` / `window.rv.extra_commands` in [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L35).
  - Production bootstrap in [src/main.ts](/Users/lifeart/Repos/openrv-web/src/main.ts#L22) only installs `window.openrv` and plugin dependencies; it never calls `registerMuCompat()`.
  - Production source search finds `registerMuCompat()` only in the compat module itself and tests, not in the live app startup path.
- Impact:
  - Mu-style scripts that expect the documented `window.rv` namespace will find it missing in the shipped app.
  - Large parts of the compat layer can appear implemented and tested in-repo while still being unavailable to real users unless something external registers it manually.

### 202. The global error handler claims uncaught-error coverage, but only listens for unhandled rejections

- Severity: Medium
- Area: App bootstrap / diagnostics
- Evidence:
  - `installGlobalErrorHandler()` is documented as installing listeners for both uncaught errors and unhandled promise rejections in [src/utils/globalErrorHandler.ts](/Users/lifeart/Repos/openrv-web/src/utils/globalErrorHandler.ts#L8).
  - The actual implementation only adds an `unhandledrejection` listener in [src/utils/globalErrorHandler.ts](/Users/lifeart/Repos/openrv-web/src/utils/globalErrorHandler.ts#L18).
  - Production bootstrap relies on that helper in [src/main.ts](/Users/lifeart/Repos/openrv-web/src/main.ts#L12), so there is no separate app-level `error` listener compensating for the missing uncaught-error path.
- Impact:
  - Synchronous uncaught exceptions do not get the centralized logger treatment the app bootstrap promises.
  - That weakens crash diagnostics in exactly the path meant to improve them, and it can mislead maintainers into thinking top-level error coverage is broader than it really is.

### 203. The public `openrv.events` API advertises an `error` event that production never emits

- Severity: Medium
- Area: Public API / plugin automation
- Evidence:
  - `EventsAPI` exposes `error` as a valid public event name in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L15) and provides `emitError(...)` for internal producers in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L276).
  - Production bootstrap wires that same `EventsAPI` instance into plugins through `pluginRegistry.setEventsAPI(window.openrv.events)` in [src/main.ts](/Users/lifeart/Repos/openrv-web/src/main.ts#L31).
  - Production source search finds no runtime caller of `emitError(...)` outside `EventsAPI` itself and tests, even though multiple subsystems produce structured errors through their own event emitters.
- Impact:
  - Scripts and plugins can subscribe to `openrv.events.on('error', ...)` and receive nothing for real runtime failures.
  - The API surface implies a centralized public error stream exists, but in the shipped app that channel is effectively inert.

### 204. The public `openrv.events` API advertises `stop`, but production never emits it

- Severity: Medium
- Area: Public API / playback events
- Evidence:
  - `EventsAPI` declares `stop` as a valid public event name and payload type in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L15) and [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L37).
  - The internal event wiring only translates `session.on('playbackChanged', ...)` into `play` or `pause` in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L199).
  - Production source search finds no runtime `this.emit('stop', ...)` call in `EventsAPI` or elsewhere.
- Impact:
  - Scripts that wait for a distinct stop event never receive it, even when users trigger the app’s stop/pause behavior.
  - The public event contract suggests more playback-state granularity than the shipped implementation actually provides.

### 205. `openrv.playback.step(n)` bypasses in/out-range and ping-pong rules for multi-frame steps

- Severity: Medium
- Area: Public API / playback navigation
- Evidence:
  - `PlaybackAPI.step(direction)` special-cases only `±1` to call `session.stepForward()` / `stepBackward()`, but for larger magnitudes it computes a target frame directly from `currentFrame`, `currentSource.duration`, and `session.loopMode` in [src/api/PlaybackAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/PlaybackAPI.ts#L106).
  - That direct path ignores the session’s active `inPoint` / `outPoint`, and it only implements wrap semantics for `loop`, not `pingpong`, in [src/api/PlaybackAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/PlaybackAPI.ts#L118).
  - The real playback engine’s stepping logic uses `_inPoint`, `_outPoint`, and explicit `pingpong` direction reversal in [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L1012).
- Impact:
  - API consumers stepping by more than one frame can land outside the active playback range or get different boundary behavior than the normal viewer controls.
  - The public API and the live playback engine disagree on frame-navigation semantics exactly when automation tries to do efficient larger jumps.

### 206. `openrv.dispose()` marks the API as not ready, but most sub-APIs remain fully callable

- Severity: Medium
- Area: Public API / lifecycle contract
- Evidence:
  - `OpenRVAPI.dispose()` documents that “the API instance should not be used” after disposal and only guarantees `isReady()` becomes false in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L119).
  - The implementation only flips `_ready` and disposes the event bus in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L128).
  - The sub-APIs (`playback`, `media`, `audio`, `loop`, `view`, `color`, `markers`) are constructed once with direct `session` / `viewer` references in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L93) and do not check `isReady()` before mutating state.
- Impact:
  - External code holding a disposed `window.openrv` reference can still keep driving playback, view, color, audio, and marker changes even though the API reports itself as not ready.
  - That weakens the lifecycle contract and makes hot-reload or multi-instance scripting behavior harder to reason about.

### 207. `registerMuCompat()` claims repeat calls are no-ops, but still allocates and returns fresh, non-installed command objects

- Severity: Low
- Area: Mu compatibility / registration contract
- Evidence:
  - The barrel docs say repeated calls are safe and “subsequent calls are no-ops” in [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L35).
  - The implementation always constructs `new MuCommands()` and `new MuExtraCommands(commands)` before checking whether `globalThis.rv` already exists in [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L42).
  - If `window.rv` is already present, the function preserves the existing global object but still returns the freshly allocated pair rather than the installed one in [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L46).
  - The current tests only verify that an existing `window.rv` is not overwritten; they do not assert true no-op or instance reuse in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L734).
- Impact:
  - Callers can receive command objects that are not the same objects reachable via `window.rv`, even though the API contract reads like an idempotent registration helper.
  - Repeated bootstrap or tool-side setup code can silently diverge between “returned handle” and “installed global” state.

### 208. `openrv.events` drops duration-marker `endFrame` data from `markerChange`

- Severity: Medium
- Area: Public API / events
- Evidence:
  - Session markers support duration ranges through an optional `endFrame` on the core `Marker` type in [src/core/session/MarkerManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MarkerManager.ts#L20).
  - The public marker API preserves that field in `MarkerInfo`, `add()`, `get()`, and `getAll()` in [src/api/MarkersAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MarkersAPI.ts#L13).
  - The public event payload type for `markerChange` omits `endFrame` entirely in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L33).
  - The bridge from `marksChanged` to `markerChange` only emits `frame`, `note`, and `color` in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L245).
- Impact:
  - External scripts listening to `openrv.events.on('markerChange', ...)` cannot distinguish range markers from point markers.
  - The public marker query API and the public marker event API expose inconsistent marker semantics, so automation loses information exactly on change notification.

### 209. The public plugin scripting API is one-way: it exposes no `dispose` or `unregister`, so plugin IDs cannot be fully reloaded from `window.openrv`

- Severity: Medium
- Area: Public API / plugins
- Evidence:
  - `window.openrv.plugins` only exposes `register`, `activate`, `deactivate`, `loadFromURL`, `getState`, and `list` in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L75).
  - The underlying registry has separate `dispose(id)` and `unregister(id)` lifecycle steps in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L259).
  - `PluginRegistry.register()` rejects duplicate IDs even when a prior entry still exists in disposed state in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L127).
  - `PluginRegistry.unregister()` is explicitly required to remove a disposed plugin so it can be re-registered with the same ID in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L290).
- Impact:
  - External scripting can load or register a plugin, but it cannot fully unload that plugin through the same public API.
  - Public API consumers cannot do clean same-ID plugin reloads or hot-reload-style workflows from `window.openrv`, even though the underlying registry supports them.

### 210. `window.openrv.plugins.loadFromURL()` is unrestricted by origin in production

- Severity: Medium
- Area: Public API / plugin loading
- Evidence:
  - `PluginRegistry.loadFromURL(url)` only enforces an origin allowlist if `allowedOrigins` has been populated in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L362).
  - The registry starts with `allowedOrigins = new Set()` and the inline docs explicitly say an empty list means all origins are allowed in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L344).
  - Production source search finds `setAllowedOrigins(...)` only in tests, not in the live app bootstrap or plugin initialization path.
  - The unrestricted loader is exposed directly to external scripts as `window.openrv.plugins.loadFromURL(...)` in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L82).
- Impact:
  - Any script with access to `window.openrv` can ask the app to import plugin code from arbitrary remote origins.
  - The codebase has a trust-boundary hook for safer loading, but the shipped app never turns it on, so the public plugin loader runs in its least-restricted mode.

### 211. Plugin settings writes can fail persistence while still looking successful at runtime

- Severity: Low
- Area: Plugin system / settings persistence
- Evidence:
  - `PluginSettingsStore.setSetting()` updates the in-memory cache before persisting and returns no status in [src/plugin/PluginSettingsStore.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginSettingsStore.ts#L127).
  - `saveSettings()` catches all storage failures and only logs `Failed to persist settings to localStorage` in [src/plugin/PluginSettingsStore.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginSettingsStore.ts#L303).
  - The plugin-facing accessor exposed through `PluginContext.settings.set(...)` is just a thin wrapper over that void-returning store API in [src/plugin/PluginSettingsStore.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginSettingsStore.ts#L247).
- Impact:
  - A plugin or its settings UI can appear to save a value successfully for the current session even when the write never reaches persistent storage.
  - After reload/restart, settings can revert with no structured error path back to the plugin or host UI.

### 212. Failed plugin hot reload removes the old plugin and forgets its tracked URL

- Severity: Medium
- Area: Plugin development / hot reload
- Evidence:
  - `HotReloadManager.reload()` disposes and unregisters the current plugin before attempting the cache-busted re-import in [src/plugin/dev/HotReloadManager.ts](/Users/lifeart/Repos/openrv-web/src/plugin/dev/HotReloadManager.ts#L67).
  - If `loadFromURL()` then fails, the catch block deletes the tracked URL entry and rethrows in [src/plugin/dev/HotReloadManager.ts](/Users/lifeart/Repos/openrv-web/src/plugin/dev/HotReloadManager.ts#L75).
  - The existing regression test `PHOT-019` asserts exactly this behavior: the old plugin is disposed/unregistered, activation never happens, and `manager.isTracked('test.plugin')` becomes false in [src/plugin/dev/HotReloadManager.test.ts](/Users/lifeart/Repos/openrv-web/src/plugin/dev/HotReloadManager.test.ts#L208).
- Impact:
  - A transient reload failure leaves the old plugin gone instead of keeping the last working version alive.
  - The hot-reload manager also loses the source URL, so the developer cannot simply retry the reload without manually re-tracking the plugin.

### 213. HDR video extraction silently downgrades to SDR when `VideoSampleSink` setup fails

- Severity: Medium
- Area: Media decoding / HDR video
- Evidence:
  - `MediabunnyFrameExtractor` correctly detects HDR and then tries to create a `VideoSampleSink` specifically for HDR frame extraction in [src/utils/media/MediabunnyFrameExtractor.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/MediabunnyFrameExtractor.ts#L310).
  - If that setup throws, the code only logs `HDR frames will use SDR fallback` and then forcibly flips `isHDR = false` in [src/utils/media/MediabunnyFrameExtractor.ts](/Users/lifeart/Repos/openrv-web/src/utils/media/MediabunnyFrameExtractor.ts#L313).
  - `VideoSourceNode` consumes that downgraded metadata directly: `this.isHDRVideo = metadata.isHDR`, initializes HDR resizers only when true, and otherwise routes the source through the normal SDR preload path in [src/nodes/sources/VideoSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/VideoSourceNode.ts#L229).
- Impact:
  - On platforms where the mediabunny HDR extraction path is partially available but `VideoSampleSink` creation fails, real HDR video is silently treated as SDR content.
  - Users get incorrect color/output behavior without any app-level indication that HDR handling fell back to a lower-fidelity path.

### 214. Deep tiled EXR files are rejected even though EXR is broadly advertised as supported

- Severity: Medium
- Area: Format support / EXR decoding
- Evidence:
  - The EXR decoder explicitly throws for single-part `deeptile` files with `Deep tiled images (deeptile) are not yet supported` in [src/formats/EXRDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.ts#L2066).
  - The same hard rejection exists for multi-part EXRs when the selected part has type `deeptile` in [src/formats/EXRDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.ts#L2174).
  - The test suite locks this in as expected behavior in `EXR-MP031` and `EXR-DEEP010` in [src/formats/EXRDecoder.test.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.test.ts#L2542) and [src/formats/EXRDecoder.test.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.test.ts#L4878).
- Impact:
  - Users can reasonably treat “EXR supported” as covering deep EXR workflows, but deep tiled EXR files fail at decode time.
  - This creates a real format-compatibility gap for VFX/rendering pipelines that emit `deeptile` data.

### 215. Tiled EXR files with mipmap or ripmap levels are rejected; only `ONE_LEVEL` tiles work

- Severity: Medium
- Area: Format support / EXR decoding
- Evidence:
  - For single-part tiled EXRs, the decoder throws unless `header.tileDesc.levelMode === EXRLevelMode.ONE_LEVEL` in [src/formats/EXRDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.ts#L2097).
  - The multi-part path applies the same restriction to tiled parts and throws a descriptive error for any other level mode in [src/formats/EXRDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.ts#L2184).
  - The thrown message is explicit: `Only ONE_LEVEL tiled images are supported.` in both code paths above.
- Impact:
  - Valid EXR files that use mipmapped or ripmapped tiled storage decode as hard failures instead of degrading or selecting a usable level.
  - Texture-oriented or preview-optimized EXR assets can therefore fail even though ordinary tiled EXRs load.

### 216. EXR decode hard-fails on `UINT` channels instead of tolerating common data/AOV layers

- Severity: Medium
- Area: Format support / EXR decoding
- Evidence:
  - While parsing channel definitions, the decoder explicitly throws on `EXRPixelType.UINT` with `Unsupported pixel type UINT ... Only HALF and FLOAT are supported` in [src/formats/EXRDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.ts#L695).
  - The comment above the throw acknowledges that `UINT` is a spec-defined EXR pixel type, not malformed input, in [src/formats/EXRDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.ts#L697).
  - The test suite also locks this in as expected behavior in [src/formats/EXRDecoder.test.ts](/Users/lifeart/Repos/openrv-web/src/formats/EXRDecoder.test.ts#L730).
- Impact:
  - EXR files that carry valid `UINT` auxiliary channels can fail completely instead of loading the float/half image data that is actually viewable.
  - That makes the decoder brittle on production EXRs with IDs, masks, or other integer data layers mixed into otherwise normal renders.

### 217. Float TIFF support rejects valid non-RGB channel layouts

- Severity: Medium
- Area: Format support / TIFF decoding
- Evidence:
  - `decodeTIFFFloat(...)` throws whenever `samplesPerPixel` is less than 3 or greater than 4 in [src/formats/TIFFFloatDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/TIFFFloatDecoder.ts#L635).
  - The thrown error is explicit: `Only 3 (RGB) or 4 (RGBA) are supported.` in [src/formats/TIFFFloatDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/TIFFFloatDecoder.ts#L636).
  - The test suite locks this behavior in for 1-channel and 5-channel float TIFFs in [src/formats/TIFFFloatDecoder.test.ts](/Users/lifeart/Repos/openrv-web/src/formats/TIFFFloatDecoder.test.ts#L541).
- Impact:
  - Valid float TIFFs with grayscale, luminance+alpha, or broader scientific/multi-channel layouts fail completely instead of loading a usable subset.
  - The app therefore supports only a narrow RGB/RGBA slice of float TIFF workflows while the format family is broader in practice.

### 218. DPX files with non-RGB/A descriptors are silently reinterpreted as RGB

- Severity: Medium
- Area: Format support / DPX decoding
- Evidence:
  - `getDPXInfo()` recognizes only descriptors `50` (RGB), `51` (RGBA), and `52` (ABGR); any other descriptor falls through to `channels = 3` in [src/formats/DPXDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/DPXDecoder.ts#L107).
  - The test suite explicitly locks that fallback in: an unknown descriptor is expected to report 3 channels in [src/formats/DPXDecoder.test.ts](/Users/lifeart/Repos/openrv-web/src/formats/DPXDecoder.test.ts#L548).
  - `decodeDPX()` then decodes pixel data using that inferred channel count and converts it straight to RGBA in [src/formats/DPXDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/DPXDecoder.ts#L287) and [src/formats/DPXDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/DPXDecoder.ts#L320).
- Impact:
  - Valid DPX files that use other SMPTE descriptor layouts are not rejected or surfaced as unsupported; they are silently decoded as if they were RGB.
  - That produces misinterpreted pixels and metadata instead of a clear compatibility failure.

### 219. MXF start timecode falls back to 24fps when edit rate is missing or invalid

- Severity: Medium
- Area: Format metadata / MXF parsing
- Evidence:
  - When a Timecode Component is present, `parseMXFHeader()` converts frame counts to a string using `metadata.editRate` if available, but otherwise hardcodes `24` fps in [src/formats/MXFDemuxer.ts](/Users/lifeart/Repos/openrv-web/src/formats/MXFDemuxer.ts#L865).
  - The same 24fps fallback is used when `metadata.editRate.den === 0` in [src/formats/MXFDemuxer.ts](/Users/lifeart/Repos/openrv-web/src/formats/MXFDemuxer.ts#L866).
  - The produced `startTimecode` is then exposed as parsed metadata in [src/formats/MXFDemuxer.ts](/Users/lifeart/Repos/openrv-web/src/formats/MXFDemuxer.ts#L872).
- Impact:
  - MXF files with valid timecode counts but missing/bad edit-rate metadata can show the wrong start timecode instead of an “unknown” or unresolved value.
  - That is especially misleading for non-24fps material because the parser manufactures a concrete timecode string that looks authoritative.

### 220. JP2 parsing stops on valid extended boxes larger than 4 GB

- Severity: Low
- Area: Format support / JP2 parsing
- Evidence:
  - `findCodestreamOffset()` handles extended JP2 box lengths only when the high 32 bits are zero; otherwise it immediately `break`s out of parsing in [src/formats/JP2Decoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JP2Decoder.ts#L171).
  - The inline comment is explicit that `> 4 GB` extended boxes are “not supported in this parser” in [src/formats/JP2Decoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JP2Decoder.ts#L176).
  - That helper is the codestream locator for JP2 container parsing in [src/formats/JP2Decoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/JP2Decoder.ts#L156).
- Impact:
  - Large valid JP2 container files with extended-length boxes can fail before the codestream is even discovered.
  - The limitation is silent at the parser level rather than being represented as an explicit format-support boundary.

### 221. Float TIFF decoding supports only 32-bit float samples

- Severity: Medium
- Area: Format support / TIFF decoding
- Evidence:
  - `decodeTIFFFloat(...)` throws unless `bitsPerSample === 32` in [src/formats/TIFFFloatDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/TIFFFloatDecoder.ts#L616).
  - The thrown error is explicit: `Only 32-bit float is supported.` in [src/formats/TIFFFloatDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/TIFFFloatDecoder.ts#L617).
  - The test suite already locks the rejection for 16-bit input in [src/formats/TIFFFloatDecoder.test.ts](/Users/lifeart/Repos/openrv-web/src/formats/TIFFFloatDecoder.test.ts#L538).
- Impact:
  - Valid float TIFF variants such as half-float or 64-bit float fail as hard decode errors instead of degrading or surfacing a narrower support boundary.
  - This keeps the decoder limited to one specific float TIFF layout while the format family is broader in practice.

### 222. Float TIFF decoding rejects common TIFF compression modes outside uncompressed, LZW, and Deflate

- Severity: Medium
- Area: Format support / TIFF decoding
- Evidence:
  - The decoder whitelists only `1`, `5`, `8`, and `32946` compression codes in [src/formats/TIFFFloatDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/TIFFFloatDecoder.ts#L620).
  - It throws a hard error for anything else in [src/formats/TIFFFloatDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/TIFFFloatDecoder.ts#L621).
  - The tests explicitly lock failures for JPEG (`7`) and PackBits (`32773`) in [src/formats/TIFFFloatDecoder.test.ts](/Users/lifeart/Repos/openrv-web/src/formats/TIFFFloatDecoder.test.ts#L392) and [src/formats/TIFFFloatDecoder.test.ts](/Users/lifeart/Repos/openrv-web/src/formats/TIFFFloatDecoder.test.ts#L644).
- Impact:
  - Float TIFFs using other legal TIFF compression schemes fail completely instead of decoding or surfacing format-specific limitations earlier in the workflow.
  - That creates another compatibility boundary for production/scientific TIFF assets that are structurally valid but compressed differently.

### 223. Auto-exposure and Drago tone mapping silently fall back to synthetic scene-luminance defaults on unsupported WebGL setups

- Severity: Medium
- Area: HDR analysis / viewer rendering
- Evidence:
  - `LuminanceAnalyzer` uses a fixed cached result of `{ avg: 0.18, linearAvg: 1.0 }` from construction in [src/render/LuminanceAnalyzer.ts](/Users/lifeart/Repos/openrv-web/src/render/LuminanceAnalyzer.ts#L49).
  - If `EXT_color_buffer_float` is unavailable, initialization only warns and leaves the analyzer returning that cached default in [src/render/LuminanceAnalyzer.ts](/Users/lifeart/Repos/openrv-web/src/render/LuminanceAnalyzer.ts#L168).
  - `ViewerGLRenderer` always feeds those luminance stats into auto-exposure and Drago whenever either feature is enabled in [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L295), [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L318), and [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L324).
- Impact:
  - On browsers/GPUs without float color-buffer support, “adaptive” exposure and Drago scene analysis degrade to fixed synthetic luminance assumptions instead of measured scene values.
  - The features remain enabled in normal app flow, so users can trust output that is no longer actually scene-driven.

### 224. HDR output mode UI can claim a mode change even when the renderer rejects it

- Severity: Medium
- Area: HDR output / UI state truthfulness
- Evidence:
  - `ToneMappingControl.setHDROutputMode(...)` updates its own state and emits `hdrModeChanged` immediately in [src/ui/components/ToneMappingControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ToneMappingControl.ts#L577).
  - The app wiring forwards that event to `viewer.setHDROutputMode(mode)` without checking success in [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L207).
  - The viewer also ignores the renderer/backend boolean result in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3129).
  - The renderer can legitimately reject a mode and return `false` when color-space assignment or half-float backbuffer setup fails in [src/render/Renderer.ts](/Users/lifeart/Repos/openrv-web/src/render/Renderer.ts#L1200) and [src/render/Renderer.ts](/Users/lifeart/Repos/openrv-web/src/render/Renderer.ts#L1218).
- Impact:
  - The HDR mode buttons can show `HLG`, `PQ`, or `Extended` as selected even though the active renderer stayed on the previous mode.
  - Users get a misleading control state on exactly the browsers/GPUs where HDR capability boundaries matter most.

### 225. Changing HDR output mode does not schedule a viewer redraw

- Severity: Medium
- Area: HDR output / viewer refresh
- Evidence:
  - Most viewer state setters immediately call `scheduleRender()`, including neighboring tone-mapping and PAR setters in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3110) and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3135).
  - `Viewer.setHDROutputMode(...)` only forwards the request to the GL renderer and does not call `scheduleRender()` in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3129).
  - The app wiring for `hdrModeChanged` likewise only calls `viewer.setHDROutputMode(mode)` in [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L207).
- Impact:
  - Even when the backend accepts the new HDR mode, the viewer can keep showing the old frame until some unrelated state change triggers a render.
  - That makes HDR mode changes feel unreliable or inert, especially on static images where no other redraw source is active.

### 226. Async system HDR headroom detection updates renderer state without triggering a redraw

- Severity: Medium
- Area: HDR output / viewer refresh
- Evidence:
  - On source load, the viewer starts an async `queryHDRHeadroom()` call in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1001).
  - When that promise resolves, it calls `this.glRendererManager.setHDRHeadroom(headroom)` and logs the value, but does not call `scheduleRender()` in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1002).
  - The underlying renderer setters only store the new headroom value; they do not trigger rendering themselves in [src/render/Renderer.ts](/Users/lifeart/Repos/openrv-web/src/render/Renderer.ts#L1267), [src/render/WebGPUBackend.ts](/Users/lifeart/Repos/openrv-web/src/render/WebGPUBackend.ts#L457), and [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L1472).
- Impact:
  - On HDR-capable systems, the initial frame can render with stale/default headroom and stay that way until another unrelated interaction causes a redraw.
  - That makes highlight rolloff and tone mapping depend on incidental follow-up events instead of updating when the measured display capability arrives.

### 227. Per-source OCIO assignments are keyed by display name, so same-named media can inherit each other's color space

- Severity: Medium
- Area: OCIO / per-source state identity
- Evidence:
  - On source load, the app builds the OCIO per-source key as `source.name || \`source_${session.currentSourceIndex}\`` in [src/handlers/sourceLoadedHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/sourceLoadedHandlers.ts#L178).
  - The per-source OCIO map is then persisted verbatim by source ID in [src/color/OCIOProcessor.ts](/Users/lifeart/Repos/openrv-web/src/color/OCIOProcessor.ts#L331), [src/color/OCIOProcessor.ts](/Users/lifeart/Repos/openrv-web/src/color/OCIOProcessor.ts#L382), and [src/ui/components/OCIOStateManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OCIOStateManager.ts#L341).
  - Real media sources only carry a display-style `name` plus `url`; for URL loads the name is derived from the basename in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1100), and for image/video loads it is stored exactly as passed in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L402) and [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L530).
- Impact:
  - Two unrelated files named `plate.exr` can share the same persisted OCIO input assignment even when they come from different folders or URLs.
  - That breaks the promise that OCIO detection/overrides are per-source; switching to a different same-named shot can silently pick up the previous shot's color space.

### 228. Share-link media auto-load misclassifies signed or query-string video URLs as images

- Severity: Medium
- Area: Share links / URL media loading
- Evidence:
  - `Session.loadSourceFromUrl(...)` extracts the extension from `url.split('/').pop()` and then `name.split('.').pop()`, without stripping query or hash parts, in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1099).
  - The share-link restore path depends on that helper in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L153) and [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L1091).
  - Elsewhere in the UI, the repo already treats `?token=...` URLs as normal asset URLs and strips query parameters when extracting a basename in [src/ui/components/InfoStripOverlay.test.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/InfoStripOverlay.test.ts#L278).
- Impact:
  - A shared media URL like `shot.mov?token=...` or `clip.mp4#signed` is classified as an image, so clean-session share-link restore can fail to reconstruct the media at all.
  - This particularly hurts real-world CDN or signed review links, where query parameters are common rather than exceptional.

### 229. Display HDR / gamut capability is frozen at startup, so moving the app between displays leaves stale output assumptions

- Severity: Medium
- Area: Display capability detection / HDR output
- Evidence:
  - The app detects display capabilities exactly once in the constructor and stores them on the app instance in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L125).
  - `detectDisplayCapabilities()` is explicitly documented as a one-time startup probe in [src/color/DisplayCapabilities.ts](/Users/lifeart/Repos/openrv-web/src/color/DisplayCapabilities.ts#L112).
  - The repo does not register any `matchMedia('(dynamic-range: high)')` or `matchMedia('(color-gamut: ...)')` change listeners for display capability refresh; the only related runtime probe left is `queryHDRHeadroom()`, which runs on source-load paths in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L1022) and [src/handlers/sourceLoadedHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/sourceLoadedHandlers.ts#L125).
- Impact:
  - If the window is moved between SDR and HDR displays, or between sRGB and wide-gamut displays, the renderer and UI keep using the startup display assumptions until the whole app is reloaded.
  - That makes HDR availability, tone-mapping defaults, and output color-space behavior drift from the actual monitor the user is now viewing on.

### 230. `openrv.media.getFPS()` reports mutable session playback FPS, not the current source FPS it claims to return

- Severity: Medium
- Area: Public API / media metadata consistency
- Evidence:
  - The public API documentation for `MediaAPI.getFPS()` says it returns “the frames per second of the current source” in [src/api/MediaAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MediaAPI.ts#L69).
  - The implementation actually returns `this.session.fps` in [src/api/MediaAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MediaAPI.ts#L79), while `getCurrentSource()` exposes the source’s own stored `fps` field in [src/api/MediaAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/MediaAPI.ts#L45).
  - Session playback FPS is independently mutable after media load, for example when applying shared URL state in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L174) and [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L1109), without rewriting the source metadata object.
- Impact:
  - API consumers can observe contradictory values for the same loaded clip, such as `openrv.media.getCurrentSource().fps === 24` while `openrv.media.getFPS() === 48`.
  - That makes scripting/export logic unreliable if it expects `getFPS()` to describe source metadata rather than the current session playback rate override.

### 231. The RAW preview path advertises broader RAW support than its TIFF-only parser can actually handle

- Severity: Medium
- Area: Format support / camera RAW preview loading
- Evidence:
  - The RAW preview decoder advertises support for `CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2, PEF, SRW` in [src/formats/RAWPreviewDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/RAWPreviewDecoder.ts#L8), and `isRAWExtension(...)` accepts those extensions in [src/formats/RAWPreviewDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/RAWPreviewDecoder.ts#L46).
  - The actual extractor only understands TIFF-style RAW containers: `extractRAWPreview(...)` immediately requires TIFF byte-order marks plus TIFF magic `42` in [src/formats/RAWPreviewDecoder.ts](/Users/lifeart/Repos/openrv-web/src/formats/RAWPreviewDecoder.ts#L269), and the registry’s detection path is likewise TIFF-header-only in [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L328).
  - The live file-loading path routes any extension-listed RAW file into this extractor with no alternate non-TIFF RAW implementation in [src/nodes/sources/FileSourceNode.ts](/Users/lifeart/Repos/openrv-web/src/nodes/sources/FileSourceNode.ts#L2030).
- Impact:
  - Inference from the parser design: extension-listed RAW families that are not actually TIFF/IFD containers are advertised as supported but will still fall through or fail at load time.
  - That makes the RAW support surface look broader than the implementation really is, especially for users relying on extension-based expectations rather than the underlying container format.

### 232. Display gamma and brightness controls are neutralized on HDR output paths, so the sliders stop having any effect there

- Severity: Medium
- Area: Display profile / HDR output behavior
- Evidence:
  - The shipped display-profile UI exposes both `Display Gamma` and `Display Brightness` as live controls in [src/ui/components/DisplayProfileControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/DisplayProfileControl.ts#L194) and [src/ui/components/DisplayProfileControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/DisplayProfileControl.ts#L225).
  - Those values are carried into the renderer state from the active display profile in [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L548).
  - But every HDR output path then calls `applyHDRDisplayOverrides(...)`, which forcibly rewrites `transferFunction: 0`, `displayGamma: 1`, and `displayBrightness: 1` in [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L288), [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L696), [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L865), and [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L970).
  - The source comments explicitly call out that these user calibration knobs are being forced to neutral values, including a TODO that they “should be preserved” for some HDR paths in [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L693) and [src/ui/components/ViewerGLRenderer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerGLRenderer.ts#L860).
- Impact:
  - On HDR-capable output paths, users can move the display gamma/brightness sliders and see the UI state change while the actual HDR render path ignores those settings.
  - That makes part of the display-profile panel misleading exactly on the higher-end output modes where calibration controls matter most.

### 233. MXF parsing hard-fails on indefinite BER lengths instead of degrading or surfacing narrower support

- Severity: Medium
- Area: Format support / MXF parsing
- Evidence:
  - `parseKLV(...)` treats BER byte `0x80` as an immediate decoder error: `Indefinite BER length ... is not supported` in [src/formats/MXFDemuxer.ts](/Users/lifeart/Repos/openrv-web/src/formats/MXFDemuxer.ts#L235).
  - That helper is the shared KLV reader for both header walking and essence walking in [src/formats/MXFDemuxer.ts](/Users/lifeart/Repos/openrv-web/src/formats/MXFDemuxer.ts#L733) and [src/formats/MXFDemuxer.ts](/Users/lifeart/Repos/openrv-web/src/formats/MXFDemuxer.ts#L947).
  - The file-level parser comments explicitly document indefinite BER as “not supported” rather than a transient unhandled edge case in [src/formats/MXFDemuxer.ts](/Users/lifeart/Repos/openrv-web/src/formats/MXFDemuxer.ts#L204).
- Impact:
  - MXF files that legitimately use indefinite-length KLV encoding fail at the container-parser level instead of loading partially or surfacing a more specific unsupported-feature boundary.
  - This is a distinct compatibility limit from the already-logged “dummy 1x1 MXF decoder” problem: the demuxer can reject some MXF files before even reaching the later fake-frame path.

### 234. Mu compat `setFPS()` only changes compat readback state and does not affect real playback timing

- Severity: Medium
- Area: Mu compatibility / playback scripting
- Evidence:
  - The Mu command manifest marks `setFPS` as fully supported in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L92).
  - The implementation only stores the value in a private `_overrideFPS` field in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L219).
  - `fps()` then just returns that local override instead of the real app/session state in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L226).
  - The compat tests explicitly validate only that local readback behavior in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L194).
- Impact:
  - Mu-compatible scripts can call `rv.commands.setFPS(30)` and then see `rv.commands.fps()` report `30` even though actual playback timing and session FPS remain unchanged.
  - That creates a false sense that the compat command worked, which is worse than an explicit unsupported-path warning for automation or DCC integrations.

### 235. Several Mu compat display commands are marked supported but only mutate bridge-local state, not the real viewer

- Severity: Medium
- Area: Mu compatibility / view-display scripting
- Evidence:
  - The support manifest marks `setFiltering`, `getFiltering`, `setBGMethod`, `bgMethod`, `setMargins`, and `margins` as supported in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L112) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L117).
  - Their implementations only update local bridge fields `_filterMode`, `_bgMethod`, and `_margins` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L136), [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L420), [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L433), and [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L446).
  - There is no call from those methods into `window.openrv`, the viewer, the renderer, or layout services; the compat tests also only assert local readback in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L370) through [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L399).
- Impact:
  - Mu-compatible tooling can be told that filtering, background method, or margins were changed successfully while the actual OpenRV Web viewer stays visually unchanged.
  - This makes those commands operationally misleading in embeds and scripted review flows because they behave like in-memory echoes rather than real viewer controls.

### 236. Mu compat `viewSize()` and `setViewSize()` target the first DOM canvas instead of the real viewer surface

- Severity: Medium
- Area: Mu compatibility / viewport scripting
- Evidence:
  - `MuCommands` only uses an explicitly assigned canvas if someone calls `setCanvas(...)`; otherwise `getCanvas()` falls back to `document.querySelector('canvas')` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L141).
  - Production source search finds no runtime caller of `setCanvas(...)`; it exists only on the compat class itself in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L145).
  - The app renders multiple canvases in normal viewer flow, including at least the image canvas and paint canvas in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L694) and [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L759).
  - `viewSize()` and `setViewSize()` operate directly on whichever canvas `getCanvas()` returns in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L362) and [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L374).
- Impact:
  - Mu-compatible scripts can read or mutate the wrong canvas when multiple canvases are present, which is normal in the shipped viewer.
  - That makes viewport-size scripting depend on DOM order rather than the actual viewer abstraction, so results can be wrong or visually inert even though the commands are marked supported.

### 237. Mu compat playback direction is only local bookkeeping and does not control real reverse playback

- Severity: Medium
- Area: Mu compatibility / transport scripting
- Evidence:
  - The compat command manifest marks `setInc` and `inc` as supported in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L94).
  - `setInc(...)` only normalizes and stores a private `_inc` field in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L247), and no transport command in `MuCommands` forwards that value into `window.openrv.playback` or the session.
  - `MuExtraCommands` then uses that same local flag for direction reporting and toggling in [src/compat/MuExtraCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuExtraCommands.ts#L148) and [src/compat/MuExtraCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuExtraCommands.ts#L166).
  - The compat tests only assert that local state flips, not that playback direction changes in the real app, in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L230) and [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L596).
- Impact:
  - Mu-compatible scripts can believe they switched to reverse playback because `inc()` and `isPlayingBackwards()` say so, while the actual viewer keeps using the normal forward transport.
  - That makes direction-sensitive automation misleading rather than merely incomplete, because the compat layer reports a state transition that never reached playback.

### 238. Mu compat `frameStart()` is a hardcoded local default, which distorts range predicates built on it

- Severity: Medium
- Area: Mu compatibility / timeline-range scripting
- Evidence:
  - `MuCommands` stores a private `_frameStart = 1` and `frameStart()` simply returns that field in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L131) and [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L208).
  - Production source search finds no setter or synchronization path that ever updates `_frameStart` from the real session/source state.
  - `MuExtraCommands` uses `frameStart()` in higher-level predicates like `isNarrowed()` and `isPlayable()` in [src/compat/MuExtraCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuExtraCommands.ts#L133).
  - The compat tests only assert the hardcoded default behavior (`frameStart() returns 1 by default`) in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L185).
- Impact:
  - Mu-compatible scripts get a plausible frame-range start even when the real source/session start semantics differ, because the value is not coming from actual media state.
  - That also means compat helpers built on `frameStart()`, such as `isNarrowed()` and `isPlayable()`, can return results based on a synthetic start frame rather than the true session range.

### 239. Mu source-management commands mostly mutate a shadow source registry instead of the real OpenRV session

- Severity: High
- Area: Mu compatibility / source management
- Evidence:
  - The source bridge is documented as operating against `window.openrv.media.*` “where possible,” but its core mutators `addSource(...)`, `addSources(...)`, `addSourceVerbose(...)`, and `clearSession()` only call the private `_createSourceRecord(...)` or clear local maps in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L205), [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L220), [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L237), and [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L555).
  - `_createSourceRecord(...)` only creates an in-memory `SourceRecord` with placeholder dimensions/range and stores it in `_sources`; it never loads media into the app session in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L773).
  - Related mutators such as `setSourceMedia(...)`, `relocateSource(...)`, and `setActiveSourceMediaRep(...)` also only rewrite bridge-local records in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L307), [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L319), and [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L602).
- Impact:
  - Mu-compatible source-management scripts can appear to succeed while the real viewer/session media stays unchanged.
  - This is more severe than a missing feature flag because follow-up compat queries then read from the shadow registry and reinforce the false impression that the script really modified the live session.

### 240. Mu compat `displayFeedbackQueue()` never drains queued messages after the first one

- Severity: Medium
- Area: Mu compatibility / HUD-feedback scripting
- Evidence:
  - `displayFeedbackQueue(...)` pushes each entry into `feedbackQueue`, but it only displays immediately when `_currentFeedback === null` and then removes just that first item in [src/compat/MuExtraCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuExtraCommands.ts#L92) through [src/compat/MuExtraCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuExtraCommands.ts#L103).
  - `displayFeedback(...)` clears `_currentFeedback` after a timeout, but that timeout handler only sets `_currentFeedback = null`; it never dequeues and displays the next message in [src/compat/MuExtraCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuExtraCommands.ts#L69) through [src/compat/MuExtraCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuExtraCommands.ts#L86).
  - There is no other queue-drain path in `MuExtraCommands`; production source search finds no method that consumes `feedbackQueue` after the first display.
  - The compat tests only assert that `displayFeedbackQueue()` "does not throw" in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L519), so the queued-display behavior itself is unverified.
- Impact:
  - A Mu-compatible script can enqueue several feedback messages and only the first one will ever be shown.
  - That makes queued HUD/toast flows unreliable in automation because later messages are silently stranded in the internal queue.

### 241. Mu compat `bindRegex()` is effectively dead because dispatch never evaluates regex bindings

- Severity: Medium
- Area: Mu compatibility / event binding
- Evidence:
  - `bindRegex(...)` stores regex handlers under sentinel keys like `__regex__pattern` and explicitly assumes "dispatch handles regex matching" in [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L48) through [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L62).
  - `ModeManager.dispatchEvent(...)` never iterates bindings or checks regex sentinels; it only performs exact `bindings.get(event.name)` lookups for override tables, event tables, and global tables in [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L185) through [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L235).
  - Production source search finds no alternate regex-dispatch path and no non-test use of the sentinel `__regex__` keys outside [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L56).
  - There are no compat tests covering `bindRegex()` or `unbindRegex()`.
- Impact:
  - Mu-compatible scripts that rely on regex event bindings can register successfully and still never receive matching events.
  - This is a silent logic break because the API surface exists and accepts the binding, but dispatch cannot reach it.

### 242. Mu compat `bind()` and `unbind()` ignore `modeName`, so mode-scoped handlers become always-active table bindings

- Severity: Medium
- Area: Mu compatibility / mode system
- Evidence:
  - `MuEventBridge.bind(...)` and `unbind(...)` ignore the `modeName` argument entirely and forward only `tableName` into `ModeManager.bind(...)` / `unbind(...)` in [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L35) through [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L68).
  - `ModeManager.bind(...)` creates or reuses plain event-table-stack entries, not minor-mode global/override tables, in [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L156) through [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L170).
  - The event table stack is dispatched independently of mode activation in [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L200) through [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L219).
  - The bridge tests confirm that `bridge.bind('mode', 'table', ...)` handlers fire immediately via `sendInternalEvent(...)` without any mode definition or activation in [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L341) through [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L349).
- Impact:
  - Mu-compatible code cannot rely on `modeName` to scope handlers to active/inactive modes the way the API signature suggests.
  - That changes event precedence and lifecycle semantics, because handlers that should be gated by mode activation are instead effectively live as soon as they are bound.

### 243. Mu compat progressive-loading state is disconnected from real media loading

- Severity: Medium
- Area: Mu compatibility / loading-progress scripting
- Evidence:
  - `MuUtilsBridge` exposes `loadTotal()`, `loadCount()`, `progressiveSourceLoading()`, and `waitForProgressiveLoading()` entirely from private fields `_loadTotal`, `_loadCount`, and `_progressiveSourceLoading` in [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L21) through [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L272).
  - Those counters are only mutated by the bridge’s own helper paths `startPreloadingMedia(...)` and `setLoadCounters(...)` in [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L277) through [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L293).
  - Production source search finds no non-test caller of `startPreloadingMedia(...)` or `setLoadCounters(...)`.
  - The compat tests seed those counters manually with `setLoadCounters(...)` and only verify local readback / immediate resolution in [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L604) through [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L620).
- Impact:
  - Mu-compatible scripts can query loading progress or wait for progressive loading and get answers based on synthetic bridge-local counters instead of actual OpenRV media activity.
  - In practice that means `waitForProgressiveLoading()` can resolve too early, or never become meaningful at all, unless some external caller manually keeps the counters in sync.

### 244. Mu compat remote contact-name and permission settings are local-only metadata that never reach the wire

- Severity: Medium
- Area: Mu compatibility / remote networking
- Evidence:
  - `MuNetworkBridge` stores `localContactName` and `defaultPermission` only as private fields with plain getters/setters in [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L17) through [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L24) and [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L217) through [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L266).
  - `remoteConnect(...)` does not transmit either field; it only opens a raw WebSocket and stores the caller-supplied `name`, `host`, and `port` in local `connectionInfo` in [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L73) through [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L113).
  - `remoteSendMessage(...)`, `remoteSendEvent(...)`, and `remoteSendDataEvent(...)` also omit both `localContactName` and `defaultPermission` from their payloads in [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L132) through [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L190).
  - The compat tests only validate local readback of those settings in [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L647) through [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L668).
- Impact:
  - Mu-compatible scripts can set a remote contact name or default permission and then get a successful local readback even though remote peers never see or enforce either value.
  - That makes the remote-networking bridge misleading for automation because identity/permission controls look mutable but are effectively inert outside the local bridge object.

### 245. Mu eval/image-query commands are effectively unwired because production never feeds render or view state into `MuEvalBridge`

- Severity: Medium
- Area: Mu compatibility / image-query scripting
- Evidence:
  - `MuEvalBridge` depends on external callers to seed both live view state via `setViewTransform(...)` and the current rendered-image list via `setRenderedImages(...)` in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L82) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L95).
  - Commands like `renderedImages()`, `imagesAtPixel(...)`, `imageGeometry(...)`, and `eventToImageSpace(...)` all read from those private caches in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L221) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L333).
  - Production source search finds no non-test caller of `setViewTransform(...)` or `setRenderedImages(...)`.
  - `registerMuCompat()` only wires `window.rv.commands` and `window.rv.extra_commands`, not an eval bridge that the app keeps synchronized in [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L42) through [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L53).
- Impact:
  - Mu-compatible image-query commands can legitimately exist in code while returning empty/default answers in the shipped app, because no live renderer or viewport state reaches the bridge.
  - That makes rendered-image hit testing and image-geometry scripting unreliable by default rather than merely approximate.

### 246. Mu compat batched `addSourceVerbose()` returns source names that do not match the records created at commit time

- Severity: Medium
- Area: Mu compatibility / source management
- Evidence:
  - In batch mode, `addSourceVerbose(...)` enqueues the source and returns `this._generateSourceName()` immediately instead of creating the record in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L237) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L244).
  - `addSourceEnd()` later commits that same queued item by calling `_createSourceRecord(...)`, which calls `_generateSourceName()` again and therefore advances the counter a second time in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L279) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L287) and [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L773).
  - That means the name returned during batching is not the name of the committed source record unless the counter is specially compensated, which the implementation never does.
  - The existing batch test only asserts that `addSourceVerbose` returns a string during batch mode and never checks that the returned name resolves after `addSourceEnd()` in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L174).
- Impact:
  - Mu-compatible scripts can store the returned source name from batched verbose adds and then fail to look that source up after the batch commits.
  - This breaks the main reason to use the verbose variant in batch workflows, because the bridge hands back an identifier that does not actually name the created source.

### 247. Mu node-view history can get stuck repeating the same node when navigating back then forward

- Severity: Medium
- Area: Mu compatibility / node-view navigation
- Evidence:
  - `setViewNode(...)` stores prior view nodes in `_viewHistory` and leaves the currently active node outside the history array in [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L291) through [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L308).
  - `previousViewNode()` then appends the current view node into `_viewHistory` when `_viewHistoryIndex === _viewHistory.length - 1`, but it does not advance the index before reading the previous entry in [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L321) through [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L337).
  - With the sequence `setViewNode('source1') -> setViewNode('color1') -> setViewNode('seq1')`, history becomes `[source1, color1]` and current is `seq1`; calling `previousViewNode()` pushes `seq1` to history but returns `color1`, leaving `_viewHistoryIndex` at `0`.
  - A subsequent `nextViewNode()` increments the index back to `1` and returns `history[1]`, which is still `color1`, not `seq1`, per the implementation in [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L348) through [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L359).
  - The existing test only checks that `nextViewNode()` returns a non-empty string after a back-step and never verifies that it returns the actual forward successor in [src/compat/__tests__/MuNodeBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuNodeBridge.test.ts#L293).
- Impact:
  - Mu-compatible scripts using previous/next view navigation can fail to return to the node they just backed out of.
  - That makes view-history traversal logically inconsistent and can strand automation on repeated intermediate nodes instead of moving through the actual navigation stack.

### 248. Mu compat `newImageSource()` can silently replace an existing source with the same name

- Severity: Medium
- Area: Mu compatibility / in-memory source management
- Evidence:
  - `newImageSource(...)` validates only that `name` is non-empty and dimensions are positive; it never checks whether `_sources` or `_imageSources` already contain that name in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L479) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L518).
  - After creating an auto-named record, it deletes the temporary entry and unconditionally writes `this._sources.set(name, record)` in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L506) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L508).
  - It then unconditionally overwrites any prior in-memory pixel store with `this._imageSources.set(name, ...)` in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L510) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L516).
  - The existing tests cover creation and validation errors, but not duplicate-name collisions.
- Impact:
  - Mu-compatible scripts can accidentally destroy or replace a previously created source just by reusing its name.
  - Because the overwrite is silent, later source and pixel queries can appear to “work” while actually pointing at a different in-memory image than the script intended.

### 249. Mu compat ND properties lose their declared shape after any set or insert operation

- Severity: Medium
- Area: Mu compatibility / property system
- Evidence:
  - `newNDProperty(...)` correctly stores the declared multi-dimensional shape in `prop.dimensions` when the property is created in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L236) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L254).
  - Every write path then overwrites that metadata with a flat one-dimensional shape: `setStringProperty(...)` sets `prop.dimensions = [values.length]` in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L154) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L165), `_setNumericProperty(...)` does the same in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L397) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L410), and both insert helpers flatten dimensions in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L177) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L189) and [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L412) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L431).
  - The tests only verify that `newNDProperty(...)` starts with the right `[4, 4]` dimensions in [src/compat/__tests__/MuPropertyBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuPropertyBridge.test.ts#L78) through [src/compat/__tests__/MuPropertyBridge.test.ts#L85); there is no coverage for writing to an ND property and preserving its shape metadata.
- Impact:
  - Mu-compatible scripts can create a matrix- or tensor-shaped property and have its metadata silently collapse to a flat vector after the first update.
  - That breaks any downstream logic that relies on `propertyInfo().dimensions` to understand the property's declared structure.

### 250. Mu compat `closestNodesOfType()` returns farther matches too, instead of only the nearest layer of matches

- Severity: Medium
- Area: Mu compatibility / graph evaluation
- Evidence:
  - `closestNodesOfType(...)` uses BFS, but it keeps traversing upstream even after it finds a node of the target type, collecting every later match into the result array in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L164) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L190).
  - Because the search does not stop at the first matching depth, a branched graph with both near and far matches will return the far ones too, despite the API name and docs saying “closest nodes of a given type.”
  - The current tests only cover single-depth or same-depth cases and explicitly accept multiple returned matches without checking that farther-depth matches are excluded in [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L166) through [src/compat/__tests__/MuEvalBridge.test.ts#L196).
- Impact:
  - Mu-compatible scripts asking for the nearest upstream nodes of a type can receive a broader set that includes non-nearest ancestors.
  - That changes graph-query semantics in a way that can select the wrong control or source node when scripts expect the first matching layer only.

### 251. Mu compat `metaEvaluateClosestByType()` chooses the first depth-first match, not the actual closest match in branched graphs

- Severity: Medium
- Area: Mu compatibility / graph evaluation
- Evidence:
  - `metaEvaluateClosestByType(...)` delegates to `_traverseEvalChainUntilType(...)`, which performs a depth-first recursive walk over `node.inputs` and returns as soon as any branch finds the target type in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L139) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L151) and [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L471) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L505).
  - In a branched graph, that means the returned path depends on input iteration order, not on which matching node is actually topologically closest to the start node.
  - The existing tests exercise only a single linear chain, so they confirm “first encountered in DFS” behavior rather than true closest-match behavior in [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L135) through [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L159).
- Impact:
  - Mu-compatible scripts can get a path to the wrong matching node when multiple upstream branches contain the requested type.
  - That makes “closest by type” unstable across graph shapes and input ordering, which is a logic bug rather than just an approximation.

### 252. Mu compat source-list fallbacks can return phantom source names that the rest of the source API cannot resolve

- Severity: Medium
- Area: Mu compatibility / source management
- Evidence:
  - When there are no local source records, `sources()` fabricates an entry from `openrv.media.getCurrentSource()` and returns its `name` as a source identifier in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L124) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L147).
  - `sourcesAtFrame(...)` does the same fallback and returns `current.name` even though no corresponding local `SourceRecord` exists in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L158) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L179).
  - Almost every other source command resolves through `_getSource(...)`, which only looks in the local `_sources` map and throws if the name is absent in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L785) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L790).
  - The fallback tests explicitly validate that `sources()` and `sourcesAtFrame()` return the OpenRV current source name `test-source` when no local sources exist in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L43) through [src/compat/__tests__/MuSourceBridge.test.ts#L48) and [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L71) through [src/compat/__tests__/MuSourceBridge.test.ts#L74), but there is no test that follow-up source queries can actually use that returned name.
- Impact:
  - Mu-compatible scripts can enumerate a source name from `sources()` or `sourcesAtFrame()` and then immediately fail when calling `sourceMedia(...)`, `sourceMediaInfo(...)`, `sourceAttributes(...)`, or other source methods on that same name.
  - This also makes the bridge internally inconsistent, because source discovery can report a source while `hasSource(...)` and `sourceCount()` still say there are no local sources.

### 253. Mu compat `properties('#TypeName')` does not honor the documented hash-path semantics

- Severity: Medium
- Area: Mu compatibility / property system
- Evidence:
  - The `properties(nodeName)` API is documented as accepting either a node name or `#TypeName` in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L270) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L285).
  - Its implementation does not use `_resolveKey(...)` or any hash resolution logic; it merely strips `#` and does `key.startsWith(prefix + '.')` in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L276) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L284).
  - That behavior is inconsistent with the rest of the hash-path API, where `_resolveKey(...)` matches exact names or node names containing the type token for `#TypeName.component.property` lookups in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L343) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L380).
  - The tests cover normal `properties('myNode')` usage and hash-path resolution for `get*`, `propertyInfo`, and `propertyExists`, but there is no coverage for `properties('#TypeName')` in [src/compat/__tests__/MuPropertyBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuPropertyBridge.test.ts#L134) through [src/compat/__tests__/MuPropertyBridge.test.ts#L151) and [src/compat/__tests__/MuPropertyBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuPropertyBridge.test.ts#L331) through [src/compat/__tests__/MuPropertyBridge.test.ts#L356).
- Impact:
  - Mu-compatible scripts can successfully use `#TypeName.component.property` in point lookups and then get a contradictory empty or incomplete result when they try to list properties with `properties('#TypeName')`.
  - That inconsistency makes hash-based property discovery unreliable and can break tooling that first enumerates properties by type and then reads them individually.

### 254. Mu compat `fileKind()` misclassifies normal signed or query-string media URLs as unknown files

- Severity: Medium
- Area: Mu compatibility / file-kind detection
- Evidence:
  - `fileKind(path)` determines the extension by calling `getExtension(path)` and lowercasing the substring after the last literal `.` in [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L83) through [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L143).
  - `getExtension(...)` does not strip query strings or fragments; it simply returns `path.slice(lastDot + 1)` in [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L351) through [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L355).
  - A common browser URL like `https://example.com/shot.exr?token=abc` therefore yields the extension `exr?token=abc`, which will not match any supported extension list.
  - The tests only cover bare filenames such as `test.exr`, `video.mp4`, and `TEST.EXR`; there is no coverage for URL-style inputs with `?` or `#` in [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L558) through [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L599).
- Impact:
  - Mu-compatible scripts that classify browser-delivered media URLs can get `UnknownFile` for ordinary signed image, movie, LUT, or CDL URLs.
  - That breaks detection logic exactly in the web scenarios where browser-style URLs are most common.

### 255. Mu compat `remoteConnect()` forces `wss` for every non-local host, which blocks valid plain-`ws` remotes

- Severity: Medium
- Area: Mu compatibility / remote networking
- Evidence:
  - `remoteConnect(name, host, port)` selects `ws` only for `localhost` or `127.0.0.1`; every other host is forced to `wss` in [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L85) through [src/compat/MuNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNetworkBridge.ts#L87).
  - The method does not inspect the current page protocol, allow an explicit scheme, or provide any override for environments where a non-local remote is legitimately served over plain `ws`.
  - The compat tests only check the disabled-network warning path and never exercise actual socket URL construction in [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L671) through [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L677).
- Impact:
  - Mu-compatible scripts cannot connect to a valid non-local RV peer that is exposed over plain WebSocket, even in environments where that is expected and allowed.
  - This is a logic bug in connection setup rather than a browser limitation, because the bridge chooses the scheme before the connection attempt even starts.

### 256. Mu compat hash-path property resolution is insertion-order dependent when multiple node names contain the same type token

- Severity: Medium
- Area: Mu compatibility / property system
- Evidence:
  - For hash paths like `#TypeName.component.property`, `_resolveKey(...)` first checks an exact node-name match and then returns the first stored key whose node name merely `includes(typeName)` in [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L360) through [src/compat/MuPropertyBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuPropertyBridge.ts#L378).
  - Because the fallback search iterates `this._store.keys()` directly, the chosen property depends on insertion order when multiple node names contain the same token and share the same component/property suffix.
  - There is no disambiguation by actual node type, graph structure, or strongest match beyond exact node-name equality.
  - The current tests cover only a single matching hash target at a time in [src/compat/__tests__/MuPropertyBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuPropertyBridge.test.ts#L331) through [src/compat/__tests__/MuPropertyBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuPropertyBridge.test.ts#L356), so ambiguous multi-match behavior is unverified.
- Impact:
  - Mu-compatible scripts can read or overwrite the wrong property when multiple nodes happen to contain the same type token in their names.
  - That makes hash-path access nondeterministic at the API level, because the result depends on property insertion order rather than a stable graph identity rule.

### 257. Mu compat playback-health commands are marked supported but only expose hardcoded or never-updated local state

- Severity: Medium
- Area: Mu compatibility / playback telemetry
- Evidence:
  - `skipped()` returns the private `_skippedFrames` field, but production source search finds no non-test code that ever increments or synchronizes that field; it is only initialized to `0` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L134) and read in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L301) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L304).
  - `mbps()` likewise returns the private `_mbps` field, and `resetMbps()` only sets that same local field back to `0` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L135) and [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L321) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L329); there is no non-test writer that records real throughput.
  - `isCurrentFrameIncomplete()`, `isCurrentFrameError()`, and `isBuffering()` are all marked supported in the command manifest in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L97) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L100), but their implementations are hardcoded `false` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L306) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L319) despite the real app having buffering state in [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L148), [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L371), and [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L616).
  - The compat tests explicitly validate the inert behavior: `skipped()` returns `0`, `mbps()` returns `0`, and the three health booleans return `false` in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L295) through [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L315).
- Impact:
  - Mu-compatible scripts can query playback health and receive clean-looking values even while the real player is buffering, skipping frames, or experiencing decode issues.
  - That is more misleading than an unsupported-path warning because the API reports a valid state snapshot that never came from the actual playback engine.

### 258. Mu compat media-representation node APIs return fabricated node names that are never created in a real graph

- Severity: Medium
- Area: Mu compatibility / source representations
- Evidence:
  - `addSourceMediaRep(...)` synthesizes `nodeName = \`${sourceName}_${repName}_source\`` and `switchNodeName = \`${sourceName}_switch\`` and stores them only inside the local representation record in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L573) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L595).
  - The method never creates corresponding nodes in a graph, never talks to `window.openrv`, and never wires representation switching into the live session.
  - `sourceMediaRepsAndNodes(...)`, `sourceMediaRepSwitchNode(...)`, and `sourceMediaRepSourceNode(...)` simply read back those stored string fields in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L635) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L660).
  - The tests only assert that the returned strings contain the rep or switch names, not that those nodes actually exist anywhere in a graph or session in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L507) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L615).
- Impact:
  - Mu-compatible scripts can receive plausible source-representation node names and then fail when they try to use them as real node identities.
  - That is especially misleading because the API shape implies graph-backed media-rep wiring, but the returned node IDs are only local placeholders.

### 259. Mu compat event-table BBox `tag` is accepted and stored but never participates in dispatch

- Severity: Medium
- Area: Mu compatibility / event dispatch
- Evidence:
  - `setEventTableBBox(tableName, tag, x, y, w, h)` stores the supplied `tag` alongside the bounding box in [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L142) through [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L150).
  - `dispatchEvent(...)` only checks the numeric rectangle and never reads or compares `bbox.tag` in [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L204) through [src/compat/ModeManager.ts](/Users/lifeart/Repos/openrv-web/src/compat/ModeManager.ts#L210).
  - `MuEventBridge.setEventTableBBox(...)` exposes that same `tag` parameter directly in [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L158) through [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L166).
  - The tests only verify inside/outside rectangle filtering and never exercise tag semantics in [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L273) through [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L310).
- Impact:
  - Mu-compatible code can pass a tag expecting tag-scoped hit testing and get no behavioral difference at all.
  - That makes the API misleading for any integration that relies on tagged regions rather than a single bare rectangle per event table.

### 260. Mu compat `wireDOMEvents()` double-registers listeners if called more than once on the same target

- Severity: Medium
- Area: Mu compatibility / DOM event wiring
- Evidence:
  - Each `wireDOMEvents(target)` call unconditionally adds fresh `keydown`, `keyup`, `pointerdown`, `pointerup`, `pointermove`, and `wheel` listeners to the target in [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L208) through [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L219).
  - The bridge keeps only cleanup callbacks in `domListenerCleanups`; it does not track which targets were already wired or deduplicate handlers in [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L15) through [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L16) and [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L208) through [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L220).
  - That means a second call on the same target will dispatch each DOM event twice until `dispose()` runs.
  - There is no compat test covering repeated `wireDOMEvents(...)` on the same element.
- Impact:
  - Mu-compatible integrations that reinitialize or rewire the same canvas/element can end up with duplicated key and pointer handling.
  - Because the failure mode is repeated event dispatch rather than an explicit error, it can look like random double-triggering in interactive tools.

### 261. Mu compat fullscreen helpers do not track the Safari/WebKit fullscreen path that the main app supports

- Severity: Medium
- Area: Mu compatibility / fullscreen control
- Evidence:
  - `MuCommands.fullScreenMode(...)` only calls the standard `requestFullscreen` / `exitFullscreen` methods and does not catch rejected fullscreen promises in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L391) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L399).
  - `MuCommands.isFullScreen()` checks only `document.fullscreenElement` in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L401) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L405).
  - `MuUtilsBridge.fullScreenMode(...)` at least catches promise rejection, but it also uses only the standard API and `MuUtilsBridge.isFullScreen()` likewise checks only `document.fullscreenElement` in [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L312) through [src/compat/MuUtilsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuUtilsBridge.ts#L329).
  - The shipped app’s real fullscreen manager explicitly supports the WebKit-prefixed path and state via `webkitRequestFullscreen`, `webkitExitFullscreen`, and `webkitFullscreenElement` in [src/utils/ui/FullscreenManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/FullscreenManager.ts#L62) through [src/utils/ui/FullscreenManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/FullscreenManager.ts#L110).
- Impact:
  - Mu-compatible scripts can fail to enter fullscreen, or incorrectly think fullscreen is off, in Safari-like environments where the main app itself still handles fullscreen correctly.
  - On the `MuCommands` path, denied fullscreen can also surface as an unhandled promise rejection instead of a contained warning.

### 262. Mu compat active media-representation selection never changes what `sourceMedia()` or `sourceMediaInfo()` report

- Severity: Medium
- Area: Mu compatibility / source representations
- Evidence:
  - `setActiveSourceMediaRep(...)` only updates `source.activeRep` in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L602) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L610).
  - `sourceMedia(...)` ignores `activeRep` and always returns `source.mediaPaths` from the base source record in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L341) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L344).
  - `sourceMediaInfo(...)` likewise ignores `activeRep` and always reports `file: source.mediaPaths[0]` plus the base source dimensions/range in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L350) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L381).
  - The tests confirm that active representation can be switched via `sourceMediaRep(name)` in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L524) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L538), but there is no test that `sourceMedia(...)` or `sourceMediaInfo(...)` reflect that switch.
- Impact:
  - Mu-compatible scripts can switch a source to `proxy` or another representation and still have follow-up media queries report the old base media.
  - That breaks representation-aware workflows because the bridge advertises rep switching while its own read APIs continue to describe a different source state.

### 263. Mu compat `imagesAtPixel()` returns all rendered images, not just images under the queried point

- Severity: Medium
- Area: Mu compatibility / image-query scripting
- Evidence:
  - The API documentation says `imagesAtPixel(...)` should return “images under the point” in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L226) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L234).
  - The implementation computes `inside` and `edge`, but then unconditionally pushes a result for every rendered image as long as `_screenToImage(...)` returns coordinates in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L239) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L263).
  - That means a point far outside the image still returns that image with `inside: false`, which the current tests explicitly accept in [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L274) through [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L279).
  - On multi-image renders, the method will therefore report all images with projected coordinates rather than filtering to the actual hit set.
- Impact:
  - Mu-compatible hit-testing scripts can treat non-hit images as if they were returned by the query, unless they add their own extra filtering.
  - That makes the command semantically misleading because its name and docs promise a filtered hit result, but the implementation returns a per-image projection table instead.

### 264. Mu compat `imageGeometryByTag()` ignores the tag argument entirely

- Severity: Medium
- Area: Mu compatibility / image-query scripting
- Evidence:
  - `imageGeometryByTag(imageName, _tag)` explicitly comments that tags are not implemented and simply forwards to `imageGeometry(imageName)` in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L305) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L307).
  - That means the `tag` parameter never influences the selected geometry, even though the API name and signature imply tag-based selection.
  - The current test only verifies that the method falls back to name-based lookup and does not check any tag distinction in [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L420) through [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L426).
- Impact:
  - Mu-compatible scripts cannot query per-tag image geometry even though the command surface suggests they can.
  - This is another silent semantic mismatch because callers can vary the tag and receive the same answer every time.

### 265. Mu compat `eventToImageSpace()` ignores its `useLocalCoords` flag

- Severity: Medium
- Area: Mu compatibility / coordinate transforms
- Evidence:
  - The method signature includes `_useLocalCoords = false` and the documentation describes it as controlling whether local coordinates are used in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L313) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L319).
  - The implementation never branches on `_useLocalCoords`; it follows the same code path regardless of the flag value in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L320) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L333).
  - There is no compat test covering differing outputs for `useLocalCoords = true` versus `false`.
- Impact:
  - Mu-compatible tools that expect local-coordinate conversion can pass `true` and still get the global/default coordinate behavior.
  - That can break overlay or node-local interaction logic because the flag is accepted but semantically inert.

### 266. Mu compat `sourcesAtFrame()` ignores the requested frame when it falls back to the current OpenRV source

- Severity: Medium
- Area: Mu compatibility / source queries
- Evidence:
  - `sourcesAtFrame(frame)` correctly filters local `SourceRecord`s against `startFrame` and `endFrame` in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L158) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L167).
  - If no local source matches, the fallback path simply appends `getOpenRV().media.getCurrentSource().name` without comparing the requested frame to any duration or range in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L169) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L178).
  - The mock current source used in tests even exposes a `duration` field, but the fallback path does not consult it in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L6) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L22).
  - The existing fallback test only checks frame `1`, so the out-of-range behavior is untested in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L71) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L74).
- Impact:
  - Mu-compatible scripts can ask which sources are active at an out-of-range frame and still be told that the current OpenRV source is active.
  - That makes the fallback semantics inconsistent with the local-source path and unreliable for timeline-aware tooling.

### 267. Mu compat `sourceMediaInfoList()` omits the same fallback current source that `sources()` exposes

- Severity: Medium
- Area: Mu compatibility / source queries
- Evidence:
  - `sources()` returns a fabricated fallback entry from `openrv.media.getCurrentSource()` when there are no local sources in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L124) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L147).
  - `sourceMediaInfoList()` does not use that fallback path at all; it only maps over `this._sources.values()` in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L389) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L393).
  - So in the “no local sources, but current OpenRV source exists” case, the bridge can report one source via `sources()` and zero sources via `sourceMediaInfoList()`.
  - The current tests cover local-source listing for `sourceMediaInfoList()`, but not its behavior in the fallback-only case in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L284) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L292).
- Impact:
  - Mu-compatible scripts can get contradictory answers from adjacent source-listing APIs depending on whether they ask for names or info objects.
  - That inconsistency makes the fallback source model harder to consume and easy to mis-handle in integrations.

### 268. Mu compat fallback `sources()` entries put the source name in the `media` field instead of a media path

- Severity: Medium
- Area: Mu compatibility / source queries
- Evidence:
  - When no local sources exist, `sources()` returns a fallback object using `media: current.name` in [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L133) through [src/compat/MuSourceBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSourceBridge.ts#L141).
  - The mocked `getCurrentSource()` payload used by the tests contains only metadata such as `name`, `type`, `width`, `height`, `duration`, and `fps`; it does not contain an actual media path in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L6) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L22).
  - So the fallback `media` value is, by construction, not the same kind of data that locally tracked source entries return in their `media` field.
  - The current fallback test only asserts the returned `name` and does not validate the `media` field content in [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L43) through [src/compat/__tests__/MuSourceBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuSourceBridge.test.ts#L48).
- Impact:
  - Mu-compatible scripts consuming `sources()` can interpret the fallback entry’s `media` value as a real path and then mis-handle it in file/path-based workflows.
  - This is another schema inconsistency inside the same API, because local entries expose media paths while fallback entries expose source identifiers.

### 269. Mu compat `setNodeInputs()` is not atomic and can leave a node partially rewired after a later connection failure

- Severity: Medium
- Area: Mu compatibility / node graph editing
- Evidence:
  - `setNodeInputs(name, inputNames)` resolves all input nodes first, then immediately disconnects all existing inputs via `node.disconnectAllInputs()` in [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L178) through [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L188).
  - It then connects the new inputs one by one in a loop, relying on `Graph.connect(...)` to detect cycles in [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L189) through [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L192).
  - `Graph.connect(...)` can throw `Connection would create a cycle` after earlier connections have already been applied in [src/core/graph/Graph.ts](/Users/lifeart/Repos/openrv-web/src/core/graph/Graph.ts#L57) through [src/core/graph/Graph.ts](/Users/lifeart/Repos/openrv-web/src/core/graph/Graph.ts#L68).
  - There is no rollback path to restore the original inputs if one of the later connections fails.
- Impact:
  - Mu-compatible scripts can attempt to replace a node’s inputs and end up with a partially applied graph mutation instead of either the old inputs or the full new set.
  - That makes graph editing brittle because a single invalid input in the requested set can silently destroy the previous connection layout before the method throws.

### 270. Mu compat `nodeConnections(..., traverseGroups)` ignores the `traverseGroups` flag

- Severity: Medium
- Area: Mu compatibility / node graph queries
- Evidence:
  - The API signature exposes `nodeConnections(name, traverseGroups)` and documents the second parameter as controlling whether group nodes are traversed in [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L152) through [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L159).
  - The implementation names that parameter `_traverseGroups` and never branches on it in [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L160) through [src/compat/MuNodeBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuNodeBridge.ts#L165).
  - So the method always returns the direct `node.inputs` and `node.outputs` lists, regardless of the caller’s traversal request.
  - The existing tests only cover the default direct-connection behavior and do not exercise `traverseGroups = true` in [src/compat/__tests__/MuNodeBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuNodeBridge.test.ts#L134) through [src/compat/__tests__/MuNodeBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuNodeBridge.test.ts#L148).
- Impact:
  - Mu-compatible scripts cannot use this API to flatten or traverse through group nodes even though the flag suggests they can.
  - That creates another silent semantic mismatch, because callers can pass `true` and receive the exact same answer as `false`.

### 271. Mu compat `imagesAtPixel()` ignores its `useStencil` flag

- Severity: Medium
- Area: Mu compatibility / image-query scripting
- Evidence:
  - The API signature exposes `imagesAtPixel(point, viewNodeName, useStencil)` and documents `useStencil` as controlling precise hit testing in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L226) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L234).
  - The implementation names the parameter `_useStencil` and never branches on it anywhere in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L235) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L266).
  - There is no compat test covering different behavior for `useStencil = true`.
- Impact:
  - Mu-compatible scripts can request stencil-accurate hit testing and still receive the same coarse projected result as the default path.
  - That is another silent no-op flag in the image-query API surface.

### 272. Mu compat `eventToCameraSpace()` ignores the supplied view-node argument

- Severity: Medium
- Area: Mu compatibility / coordinate transforms
- Evidence:
  - The method signature is `eventToCameraSpace(viewNodeName, eventPoint)` in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L336) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L345).
  - The implementation names the parameter `_viewNodeName` and computes camera coordinates solely from the global `_viewTransform` in [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L346) through [src/compat/MuEvalBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEvalBridge.ts#L355).
  - There is no branch that resolves or uses the named view node, and the tests call the method with an empty string rather than validating per-view-node behavior in [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L489) through [src/compat/__tests__/MuEvalBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEvalBridge.test.ts#L518).
- Impact:
  - Mu-compatible tools cannot query camera-space coordinates relative to a specific view node even though the method signature suggests they can.
  - In multi-view or graph-aware contexts, that makes the returned coordinates depend only on whatever global transform was last injected.

### 273. Mu settings helpers can throw in blocked-storage environments even though read/write paths are guarded

- Severity: Medium
- Area: Mu compatibility / settings persistence
- Evidence:
  - `readSetting(...)` and `writeSetting(...)` wrap `localStorage` access in `try/catch` in [src/compat/MuSettingsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSettingsBridge.ts#L23) through [src/compat/MuSettingsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSettingsBridge.ts#L55).
  - The rest of the API does not: `hasSetting(...)`, `removeSetting(...)`, `listSettings(...)`, `clearGroup(...)`, and `clearAll()` call `localStorage` directly with no protection in [src/compat/MuSettingsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSettingsBridge.ts#L60) through [src/compat/MuSettingsBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuSettingsBridge.ts#L123).
  - In browsers or privacy modes where storage access itself throws, the bridge therefore mixes “graceful fallback” behavior for some operations with hard exceptions for adjacent ones.
  - The compat tests only cover normal storage behavior and do not exercise blocked or throwing `localStorage` paths.
- Impact:
  - Mu-compatible integrations can see settings reads/writes quietly degrade while settings enumeration or removal crashes the bridge in the same environment.
  - That inconsistency makes storage failures harder to reason about and can break recovery/cleanup paths specifically when storage is already degraded.

### 274. Mu compat `sendInternalEvent()` discards handler-written `returnContents`

- Severity: Medium
- Area: Mu compatibility / event dispatch
- Evidence:
  - The `MuEvent` type explicitly includes a mutable `returnContents` field “for reject/accept signaling” in [src/compat/types.ts](/Users/lifeart/Repos/openrv-web/src/compat/types.ts#L15) through [src/compat/types.ts](/Users/lifeart/Repos/openrv-web/src/compat/types.ts#L25).
  - `MuEventBridge.sendInternalEvent(...)` creates an event object with `returnContents: ''`, dispatches it, and returns `void` in [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L191) through [src/compat/MuEventBridge.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuEventBridge.ts#L200).
  - That means any handler mutation of `event.returnContents` is lost to the caller unless they bypass `MuEventBridge` and directly use `ModeManager.dispatchEvent(...)` with their own event object.
  - The current bridge tests validate only that `sendInternalEvent(...)` creates and dispatches the event object, not that any return payload can be observed by the caller in [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L341) through [src/compat/__tests__/MuEventBridge.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuEventBridge.test.ts#L424).
- Impact:
  - Mu-compatible code cannot use the public bridge to get reply data back from internal event handlers even though the event model advertises a return channel.
  - That turns `sendInternalEvent()` into a fire-and-forget dispatch path, which is a semantic mismatch for callers expecting request/response-style event handling.

### 275. `registerMuCompat()` is documented as a no-op on repeat calls but still returns fresh unmounted command objects each time

- Severity: Medium
- Area: Mu compatibility / bootstrap contract
- Evidence:
  - The function comment says repeated calls are safe and “subsequent calls are no-ops” in [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L35) through [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L40), and the public docs repeat the same promise in [docs/advanced/mu-compat.md](/Users/lifeart/Repos/openrv-web/docs/advanced/mu-compat.md#L12) through [docs/advanced/mu-compat.md](/Users/lifeart/Repos/openrv-web/docs/advanced/mu-compat.md#L16).
  - The implementation still constructs a brand new `MuCommands` and `MuExtraCommands` pair on every call in [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L42) through [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L53).
  - If `window.rv` already exists, the function leaves the global untouched but still returns the fresh pair, so the returned objects are not the mounted global compat instances in [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L46) through [src/compat/index.ts](/Users/lifeart/Repos/openrv-web/src/compat/index.ts#L50).
  - The tests verify only that an existing `window.rv` is not overwritten, not that repeat calls return the already-mounted objects in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L734) through [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L740).
- Impact:
  - Integrations can call `registerMuCompat()` twice and receive a second compat object graph that is detached from the globally mounted `window.rv` namespace.
  - That breaks the documented “no-op” contract and can split state across multiple compat instances without the caller realizing it.

### 276. Mu compat async introspection says `fullScreenMode` is async, but the command does not actually return a Promise

- Severity: Medium
- Area: Mu compatibility / command introspection
- Evidence:
  - `MuCommands.isAsync(name)` reports `true` for `fullScreenMode` because `ASYNC_COMMANDS` contains that command name in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L126) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L173).
  - The public docs reinforce that contract by saying `fullScreenMode()` returns a Promise internally and pointing callers to `commands.isAsync(name)` in [docs/advanced/mu-compat.md](/Users/lifeart/Repos/openrv-web/docs/advanced/mu-compat.md#L486) through [docs/advanced/mu-compat.md](/Users/lifeart/Repos/openrv-web/docs/advanced/mu-compat.md#L490).
  - The actual implementation of `MuCommands.fullScreenMode(...)` returns `void` and just fires the fullscreen calls without awaiting or returning their promises in [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L391) through [src/compat/MuCommands.ts](/Users/lifeart/Repos/openrv-web/src/compat/MuCommands.ts#L399).
  - The tests only validate that `isAsync('fullScreenMode')` is `true`; they do not check the runtime return value of `fullScreenMode(...)` in [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L135) through [src/compat/__tests__/MuCommands.test.ts](/Users/lifeart/Repos/openrv-web/src/compat/__tests__/MuCommands.test.ts#L140).
- Impact:
  - A caller can use the official introspection path, conclude that `fullScreenMode` is awaitable, and then receive `undefined` instead of a promise.
  - That makes the async-command contract unreliable exactly where the docs tell callers to depend on it.

### 277. Unified preferences import/reset writes storage but does not apply the live theme/layout/keybinding/OCIO subsystems

- Severity: High
- Area: Preferences / runtime state application
- Evidence:
  - Production wires live subsystem references into the unified facade in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L430) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L436).
  - `PreferencesManager` stores those subsystem references behind getters, but `importAll(...)` and `resetAll()` only write/remove storage keys and emit facade events; they never call `this.theme`, `this.layout`, `this.keyBindings`, or `this.ocio` in [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L290) through [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L320) and [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L383) through [src/core/PreferencesManager.ts](/Users/lifeart/Repos/openrv-web/src/core/PreferencesManager.ts#L481).
  - The live subsystems all load persisted state only during their own construction or direct setters: `ThemeManager` reads storage in its constructor and applies changes only through `setMode(...)` in [src/utils/ui/ThemeManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/ThemeManager.ts#L128) through [src/utils/ui/ThemeManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/ThemeManager.ts#L165), `CustomKeyBindingsManager` loads storage only in its constructor in [src/utils/input/CustomKeyBindingsManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/CustomKeyBindingsManager.ts#L25) through [src/utils/input/CustomKeyBindingsManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/CustomKeyBindingsManager.ts#L29) and [src/utils/input/CustomKeyBindingsManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/CustomKeyBindingsManager.ts#L153) through [src/utils/input/CustomKeyBindingsManager.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/CustomKeyBindingsManager.ts#L189), `OCIOStateManager` loads persisted state only in its constructor in [src/ui/components/OCIOStateManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OCIOStateManager.ts#L61) through [src/ui/components/OCIOStateManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OCIOStateManager.ts#L79), and `LayoutStore` loads storage only in its constructor in [src/ui/layout/LayoutStore.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/LayoutStore.ts#L150) through [src/ui/layout/LayoutStore.ts](/Users/lifeart/Repos/openrv-web/src/ui/layout/LayoutStore.ts#L159).
  - In the current tree, `fpsIndicatorPrefsChanged` is the only unified-preferences event with a clear production subscriber; the rest of the imported/reset state is left to storage.
- Impact:
  - Importing or resetting unified preferences can leave the live app showing the old theme, panel layout, keybindings, and OCIO state until a reload or manual subsystem-specific action.
  - That makes the facade behave like an offline storage editor instead of a true runtime preferences system.

### 278. `MediaCacheManager` claims graceful OPFS fallback, but browsers without `createWritable()` still initialize and then fail writes noisily

- Severity: Medium
- Area: Caching / storage fallback
- Evidence:
  - The class header says it is “Designed to degrade gracefully” and that when storage is unavailable “all public methods become safe no-ops” in [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L1) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L9).
  - `initialize()` succeeds as long as `navigator.storage.getDirectory()` and IndexedDB work; it does not probe `createWritable()` support before marking the manager initialized in [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L94) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L117).
  - Later, `put(...)` always calls `writeFile(...)`, and `writeFile(...)` throws `createWritable not supported` whenever the file handle lacks that method in [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L154) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L187) and [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L331) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L352).
  - The code comment even calls this branch a “fallback,” but the implementation is a hard failure rather than a no-op path.
- Impact:
  - On partial-OPFS environments, media caching can look initialized and then fail on every background write instead of cleanly disabling itself.
  - That creates repeated error churn and violates the cache layer’s advertised fallback contract.

### 279. The main LUT load UI rejects 1D LUTs even though the app advertises them as supported formats

- Severity: Medium
- Area: Color pipeline / LUT UX
- Evidence:
  - The user-facing LUT docs say the color-controls Load button accepts “any supported format,” and the supported-format table explicitly includes multiple 1D LUT families such as Cube, 3DL, CSP, Houdini LUT, and RV Channel LUT in [docs/color/lut.md](/Users/lifeart/Repos/openrv-web/docs/color/lut.md#L23) through [docs/color/lut.md](/Users/lifeart/Repos/openrv-web/docs/color/lut.md#L45).
  - The shipped `ColorControls` Load flow parses the file and then unconditionally rejects any non-3D LUT with the error “1D LUTs are not supported. Please load a 3D LUT file.” in [src/ui/components/ColorControls.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ColorControls.ts#L449) through [src/ui/components/ColorControls.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ColorControls.ts#L455).
  - The underlying LUT pipeline still has explicit 1D support in `LUTStage`, which stores a generic `LUT` rather than only `LUT3D`, in [src/color/pipeline/LUTStage.ts](/Users/lifeart/Repos/openrv-web/src/color/pipeline/LUTStage.ts#L1) through [src/color/pipeline/LUTStage.ts](/Users/lifeart/Repos/openrv-web/src/color/pipeline/LUTStage.ts#L74).
- Impact:
  - Users following the shipped LUT documentation can select a documented 1D LUT and get a hard rejection from the primary LUT UI.
  - That makes the advertised LUT support materially narrower in practice than the app and docs suggest.

### 280. The published scripting docs expose `openrv.color` LUT methods that the real `ColorAPI` does not implement

- Severity: Medium
- Area: Public scripting API
- Evidence:
  - The LUT docs publish `window.openrv.color.loadLUT(...)`, `setLUTIntensity(...)`, `clearLUT()`, and `applyLUTPreset(...)` as part of the scripting API in [docs/color/lut.md](/Users/lifeart/Repos/openrv-web/docs/color/lut.md#L113) through [docs/color/lut.md](/Users/lifeart/Repos/openrv-web/docs/color/lut.md#L127).
  - The real `ColorAPI` class exposes adjustments, CDL, and curves only; there are no LUT load/intensity/clear/preset methods anywhere in [src/api/ColorAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/ColorAPI.ts#L64) through [src/api/ColorAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/ColorAPI.ts#L343).
  - `OpenRVAPI` mounts that `ColorAPI` instance directly at `window.openrv.color` in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L88) through [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L96), so those documented methods are absent in the shipped public object.
- Impact:
  - External scripts following the published API docs will hit `undefined is not a function` style failures for basic LUT operations.
  - That makes the scripting documentation unreliable for one of the app’s documented color workflows.

### 281. MXF is still registered as a decoder even though the decode result is only a 1x1 placeholder and the registry admits consumers do not handle that mode

- Severity: High
- Area: Formats / decoder registry
- Evidence:
  - The MXF adapter is explicitly documented as metadata-only and says it “does NOT decode video frames” and instead returns a dummy `1x1` RGBA image in [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L770) through [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L783).
  - The implementation keeps MXF registered as a normal decoder anyway in [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L785) through [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L815).
  - The inline TODO states the core problem directly: the decoder returns dummy pixel data and “Consumers do not currently handle `metadataOnly`” in [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L789) through [src/formats/DecoderRegistry.ts](/Users/lifeart/Repos/openrv-web/src/formats/DecoderRegistry.ts#L790).
- Impact:
  - MXF can enter the normal decode path and produce something that looks like a decoded image object even though there are no real frames behind it.
  - That is a runtime contract break inside the registry itself, not just a documentation caveat.

### 282. Multiple shipped color scripting pages document `window.openrv.color` methods that do not exist in the real API

- Severity: High
- Area: Public scripting API / documentation contract
- Evidence:
  - The real `ColorAPI` surface stops at adjustments, CDL, and curves in [src/api/ColorAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/ColorAPI.ts#L64) through [src/api/ColorAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/ColorAPI.ts#L343), and `OpenRVAPI` mounts that object directly at `window.openrv.color` in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L88) through [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L96).
  - Separate shipped docs still publish additional color methods that are absent from that class:
    - `resetCDL()` in [docs/color/cdl.md](/Users/lifeart/Repos/openrv-web/docs/color/cdl.md#L105) through [docs/color/cdl.md](/Users/lifeart/Repos/openrv-web/docs/color/cdl.md#L121)
    - `setDisplayProfile()` and `getDisplayCapabilities()` in [docs/color/display-profiles.md](/Users/lifeart/Repos/openrv-web/docs/color/display-profiles.md#L134) through [docs/color/display-profiles.md](/Users/lifeart/Repos/openrv-web/docs/color/display-profiles.md#L149)
    - `setOCIOState()`, `getOCIOState()`, and `getAvailableConfigs()` in [docs/color/ocio.md](/Users/lifeart/Repos/openrv-web/docs/color/ocio.md#L122) through [docs/color/ocio.md](/Users/lifeart/Repos/openrv-web/docs/color/ocio.md#L141)
    - `setToneMapping()` in [docs/color/tone-mapping.md](/Users/lifeart/Repos/openrv-web/docs/color/tone-mapping.md#L122) through [docs/color/tone-mapping.md](/Users/lifeart/Repos/openrv-web/docs/color/tone-mapping.md#L140)
    - `exportCurvesJSON()` and `importCurvesJSON()` in [docs/color/curves.md](/Users/lifeart/Repos/openrv-web/docs/color/curves.md#L78) through [docs/color/curves.md](/Users/lifeart/Repos/openrv-web/docs/color/curves.md#L84)
  - Those methods do exist elsewhere in UI/control classes, but they are not exposed through the public API object the docs tell external scripts to call.
- Impact:
  - External scripting against the shipped documentation is materially unreliable across several major color workflows, not just LUT loading.
  - The public API looks much broader in docs than it is in the actual runtime object.

### 283. `openrv.dispose()` advertises the API as unusable afterward, but only the event module is actually torn down

- Severity: Medium
- Area: Public scripting API / lifecycle contract
- Evidence:
  - `OpenRVAPI.dispose()` sets `_ready = false` and calls only `this.events.dispose()` in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L120) through [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L131).
  - The doc comment says “After calling this, the API instance should not be used” in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L112) through [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L127).
  - None of the other modules are disposed or guarded by `_ready`: `playback`, `media`, `audio`, `loop`, `view`, `color`, `markers`, and `plugins` remain the same live objects created in the constructor in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L81) through [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L96).
  - `EventsAPI.dispose()` only removes subscriptions and clears listener sets in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L279) through [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L292), so transport/view/color operations still have their original session and viewer references.
- Impact:
  - External callers can see `openrv.isReady()` return `false` and still successfully mutate playback, view, audio, markers, and plugins through the supposedly disposed API object.
  - That makes the lifecycle contract misleading and can break integrations that treat `dispose()` as a hard shutdown boundary.

### 284. The overlays docs publish `openrv.matte.enable(...)`, but `openrv.matte` is not part of the shipped public API

- Severity: Medium
- Area: Public scripting API / documentation contract
- Evidence:
  - The overlays guide says “The matte overlay is accessible via the API” and gives `openrv.matte.enable({ aspect: 2.39, opacity: 0.8 })` as the public call in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L100) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L105).
  - The mounted public API modules are only `playback`, `media`, `audio`, `loop`, `view`, `color`, `markers`, `events`, and `plugins` in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L42) through [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L87).
  - A repo-wide search only finds `openrv.matte` in that documentation page; there is no corresponding public API module or mounted property in the runtime tree.
- Impact:
  - Users following the overlays documentation will try to call a public API module that does not exist.
  - That turns the documented matte-overlay scripting path into an immediate runtime failure.

### 285. The scripting guide’s `exposureCheck()` example can hang because it waits for `frameChange` after a synchronous `seek()`

- Severity: Medium
- Area: Documentation / scripting workflow example
- Evidence:
  - The published example seeks first and only then subscribes with `openrv.events.once('frameChange', resolve)` in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L326) through [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L336).
  - `PlaybackAPI.seek(...)` immediately calls `session.goToFrame(frame)` in [src/api/PlaybackAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/PlaybackAPI.ts#L67) through [src/api/PlaybackAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/PlaybackAPI.ts#L83).
  - `PlaybackEngine.goToFrame(...)` immediately assigns `currentFrame`, and that setter emits `frameChanged` synchronously in [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L221) through [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L228) and [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L667) through [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L668).
- Impact:
  - On a normal synchronous seek path, the sample can miss the event entirely and await forever on the very first loop iteration.
  - That makes the published “custom workflow” example unsafe to copy into real automation code.

### 286. The scripting guide’s plugin examples do not match the actual plugin registration API shape

- Severity: High
- Area: Plugin API / documentation contract
- Evidence:
  - The actual `Plugin` interface requires a `manifest` object containing `id`, `name`, `version`, and `contributes`, with lifecycle methods alongside it in [src/plugin/types.ts](/Users/lifeart/Repos/openrv-web/src/plugin/types.ts#L15) through [src/plugin/types.ts](/Users/lifeart/Repos/openrv-web/src/plugin/types.ts#L118).
  - `PluginRegistry.register(...)` immediately reads `plugin.manifest` and throws if it is missing in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L127) through [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L144).
  - The scripting guide examples instead pass flat top-level plugin objects with `id`, `name`, `version`, `contributes`, and `settingsSchema` directly on the plugin object rather than inside `manifest` in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L385) through [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L399), [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L405) through [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L443), [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L452) through [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L476), and [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L482) through [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L520).
  - The first example also calls `context.registerExporter({ name, label, export })`, but the real context signature is `registerExporter(name, exporter)` in [src/plugin/types.ts](/Users/lifeart/Repos/openrv-web/src/plugin/types.ts#L55) through [src/plugin/types.ts](/Users/lifeart/Repos/openrv-web/src/plugin/types.ts#L63).
- Impact:
  - Copying the published plugin examples into real code will fail at registration before activation ever runs.
  - That makes the main plugin onboarding documentation misleading at the most basic “hello world” level.

### 287. `openrv.isReady()` can return true before mount-time initialization has finished

- Severity: Medium
- Area: Public scripting API / bootstrap contract
- Evidence:
  - The scripting docs say `isReady()` returns `true` “once the application has fully initialized” in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L27) through [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L37).
  - In production bootstrap, `main.ts` calls `app.mount('#app')` without awaiting the returned promise, then immediately constructs `window.openrv = new OpenRVAPI(app.getAPIConfig())` in [src/main.ts](/Users/lifeart/Repos/openrv-web/src/main.ts#L14) through [src/main.ts](/Users/lifeart/Repos/openrv-web/src/main.ts#L27).
  - `OpenRVAPI` sets `_ready = true` synchronously in its constructor in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L81) through [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L103).
  - The awaited tail of `App.mount(...)` still has work after layout/render startup, including `await this.persistenceManager.init()` and `await this.sessionURLService.handleURLBootstrap()` in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L715) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L721).
- Impact:
  - External scripts can observe `openrv.isReady() === true` while persistence recovery and URL bootstrap are still in flight.
  - That makes readiness checks unreliable for integrations that need the post-bootstrap session state rather than just a constructed API object.

### 288. The plugin scripting guide omits the required `openrv.plugins.activate(id)` step, so its examples would remain inert even if the object shape were corrected

- Severity: Medium
- Area: Plugin API / documentation contract
- Evidence:
  - The scripting guide presents plugin registration examples as the complete workflow and says plugins “are registered through `window.openrv.plugins` and can contribute” in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L375) through [docs/advanced/scripting-api.md#L399](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L399).
  - The mounted public API exposes a separate `plugins.activate(id)` method in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L75) through [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L87).
  - `PluginRegistry.register(...)` only stores the plugin with state `'registered'` and does not call `activate(...)` in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L127) through [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L170).
  - Actual lifecycle execution happens only in `activate(id)`, which calls `plugin.activate(context)` and flips the state to `'active'` in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L186) through [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L220).
- Impact:
  - A reader who fixes the documented plugin object shape but follows the guide literally will still end up with a registered-only plugin that contributes nothing.
  - That leaves the public plugin quick-start incomplete even before the deeper plugin wiring gaps already recorded elsewhere.

### 289. The AI docs-generation templates are seeded with nonexistent `window.openrv.*` methods, so regenerated docs can keep reintroducing API drift

- Severity: Medium
- Area: Docs toolchain / API documentation source of truth
- Evidence:
  - The tutorial template instructs generated examples to use `await window.openrv.media.loadFiles(...)` and `window.openrv.view.setCompareMode('wipe')` in [docs/scripts/lib/templates.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/lib/templates.ts#L187) through [docs/scripts/lib/templates.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/lib/templates.ts#L205).
  - The FAQ template likewise uses `window.openrv.loop.setRange(...)` and `window.openrv.loop.enable()` in [docs/scripts/lib/templates.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/lib/templates.ts#L250) through [docs/scripts/lib/templates.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/lib/templates.ts#L257).
  - Those templates are not dead text; the docs generator imports them and uses them to build prompts in [docs/scripts/ai-generate.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/ai-generate.ts#L23) through [docs/scripts/ai-generate.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/ai-generate.ts#L25) and [docs/scripts/ai-generate.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/ai-generate.ts#L181) through [docs/scripts/ai-generate.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/ai-generate.ts#L189).
  - The public API tree has no `media.loadFiles`, `view.setCompareMode`, `loop.setRange`, or `loop.enable` methods in the mounted scripting modules.
- Impact:
  - Even after fixing individual markdown pages, the docs toolchain can regenerate new public docs with invalid API examples.
  - That makes documentation drift a recurring pipeline problem rather than a one-off page bug.

### 290. Plugin `engineVersion` is declared as a minimum host-version requirement, but plugin registration never enforces it

- Severity: Medium
- Area: Plugin runtime / compatibility contract
- Evidence:
  - The plugin manifest type declares `engineVersion?: SemVer` as the “Minimum OpenRV Web version required” in [src/plugin/types.ts](/Users/lifeart/Repos/openrv-web/src/plugin/types.ts#L36) through [src/plugin/types.ts](/Users/lifeart/Repos/openrv-web/src/plugin/types.ts#L37).
  - `PluginRegistry.register(...)` validates `manifest.id`, `manifest.name`, `manifest.version`, and `manifest.contributes`, but does not read or validate `manifest.engineVersion` at all in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L127) through [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L169).
- Impact:
  - Plugins can declare a minimum required host version and still be accepted unchanged by older or incompatible app builds.
  - That turns version-gating metadata into a no-op and pushes compatibility failures to runtime behavior instead of install-time rejection.

### 291. Plugin manifests advertise a `processor` contribution type, but the plugin context exposes no way to register one

- Severity: Medium
- Area: Plugin API / contribution model
- Evidence:
  - `PluginContributionType` includes `'processor'` in [src/plugin/types.ts](/Users/lifeart/Repos/openrv-web/src/plugin/types.ts#L46).
  - The published scripting guide uses a plugin example with `contributes: ['processor']` in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L484) through [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L495).
  - The actual `PluginContext` only exposes `registerDecoder`, `registerNode`, `registerTool`, `registerExporter`, `registerBlendMode`, and `registerUIPanel` in [src/plugin/types.ts](/Users/lifeart/Repos/openrv-web/src/plugin/types.ts#L61) through [src/plugin/types.ts](/Users/lifeart/Repos/openrv-web/src/plugin/types.ts#L79).
  - `PluginRegistry.createContext(...)` builds exactly those registration hooks and no `registerProcessor(...)` path in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L395) through [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L456).
- Impact:
  - A plugin can truthfully declare itself as a `processor` plugin, but there is no host API for it to contribute any processor capability.
  - That leaves one of the advertised plugin contribution types structurally dead, not just unwired in the UI.

### 292. The docs advertise a `playlistEnded` event, but the public scripting event API never exposes it

- Severity: Medium
- Area: Playlist / public scripting API contract
- Evidence:
  - The playlist docs say no-loop mode emits a `playlistEnded` event in [docs/advanced/playlist.md](/Users/lifeart/Repos/openrv-web/docs/advanced/playlist.md#L68) through [docs/advanced/playlist.md](/Users/lifeart/Repos/openrv-web/docs/advanced/playlist.md#L70).
  - The session-compatibility guide repeats that claim in [docs/guides/session-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/guides/session-compatibility.md#L294) through [docs/guides/session-compatibility.md#L299](/Users/lifeart/Repos/openrv-web/docs/guides/session-compatibility.md#L299).
  - Internally, `PlaylistManager` does emit `playlistEnded` in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L76) and [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L296).
  - The public `EventsAPI` event-name union and valid-event set omit `playlistEnded` entirely in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L15) through [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L64).
- Impact:
  - External scripts following the docs cannot actually subscribe to the playlist-end signal they were told exists.
  - That breaks automation around multi-clip review completion even though the underlying playlist manager already knows when playback has ended.

### 293. `window.openrv.plugins.list()` includes disposed plugins, even though they are no longer activatable or truly registered

- Severity: Medium
- Area: Plugin public API / state reporting
- Evidence:
  - The public API describes `plugins.list()` as “List all registered plugin IDs” in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L84) through [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L87).
  - `PluginRegistry.dispose(...)` explicitly retains disposed plugins in the registry map instead of deleting them in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L281) through [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L287).
  - `getRegisteredIds()` just returns `Array.from(this.plugins.keys())` without filtering by state in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L316) through [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L317).
  - A disposed plugin cannot be activated again and must be separately unregistered first in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L190) through [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L191) and [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L291) through [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L301).
- Impact:
  - Integrations that treat `plugins.list()` as the currently registered/usable plugin set can receive dead entries that cannot be reactivated.
  - That makes the public plugin inventory API semantically misleading after disposal or hot-reload flows.

### 294. `window.openrv.version` is hardcoded to `1.0.0` and drifts from the shipped package version

- Severity: Medium
- Area: Public scripting API / version contract
- Evidence:
  - The shipped package currently declares version `0.1.0` in [package.json](/Users/lifeart/Repos/openrv-web/package.json#L1).
  - The public API exposes `readonly version: string = '1.0.0'` in [src/api/OpenRVAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L46) through [src/api/OpenRVAPI.ts#L48](/Users/lifeart/Repos/openrv-web/src/api/OpenRVAPI.ts#L48).
  - The scripting docs present `window.openrv.version` as the API version string consumers should inspect in [docs/advanced/scripting-api.md](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L22) through [docs/advanced/scripting-api.md#L37](/Users/lifeart/Repos/openrv-web/docs/advanced/scripting-api.md#L37).
- Impact:
  - External integrations can read a version string that does not match the actual shipped build/package they are running against.
  - That weakens version-based debugging and future compatibility checks, especially alongside the already-unenforced plugin `engineVersion` metadata.

### 295. Plugin authors are offered `app:stop` and `app:error` subscriptions, but those bridged app events never fire

- Severity: Medium
- Area: Plugin event API / application event bridge
- Evidence:
  - `PluginEventBus` exposes `app:stop` and `app:error` as valid plugin-visible app events and maps them directly from `OpenRVEventName` in [src/plugin/PluginEventBus.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginEventBus.ts#L18) through [src/plugin/PluginEventBus.ts#L35](/Users/lifeart/Repos/openrv-web/src/plugin/PluginEventBus.ts#L35) and [src/plugin/PluginEventBus.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginEventBus.ts#L79) through [src/plugin/PluginEventBus.ts#L92](/Users/lifeart/Repos/openrv-web/src/plugin/PluginEventBus.ts#L92).
  - The generated API docs also advertise both events to plugin authors in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L99) through [docs/api/index.md#L115](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L115).
  - The underlying `EventsAPI` never emits `stop` in its internal wiring and only exposes `error` through a manual `emitError(...)` helper that production does not use in [src/api/EventsAPI.ts](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L192) through [src/api/EventsAPI.ts#L278](/Users/lifeart/Repos/openrv-web/src/api/EventsAPI.ts#L278).
- Impact:
  - Plugin code can subscribe to `context.events.onApp('app:stop', ...)` or `context.events.onApp('app:error', ...)` and never receive callbacks in production.
  - That makes the plugin-facing event bridge broader on paper than in live behavior, which is especially misleading for automation or monitoring plugins.

### 296. The generated API reference leaks the dev-only `HotReloadManager` as if it were part of the shipped API surface

- Severity: Medium
- Area: Documentation / generated API reference
- Evidence:
  - The generated API reference publishes a `HotReloadManager` section with `trackURL`, `reload`, `getTrackedPlugins`, and `isTracked` methods in [docs/api/index.md](/Users/lifeart/Repos/openrv-web/docs/api/index.md#L158) through [docs/api/index.md#L170).
  - The actual public API entrypoint in [src/api/index.ts](/Users/lifeart/Repos/openrv-web/src/api/index.ts#L1) exports the scripting API classes and plugin types, but not `HotReloadManager`.
  - The implementation itself is explicitly development-only in [src/plugin/dev/HotReloadManager.ts](/Users/lifeart/Repos/openrv-web/src/plugin/dev/HotReloadManager.ts#L1) through [src/plugin/dev/HotReloadManager.ts#L6).
- Impact:
  - Readers of the published API reference can reasonably assume plugin hot-reload is part of the supported public API when it is not.
  - That makes the generated docs a source of false capability discovery for plugin developers.

### 297. The session guides claim `.orvproject` captures the complete viewer/session state, but the serializer explicitly omits multiple active states

- Severity: Medium
- Area: Documentation / session persistence contract
- Evidence:
  - The session-management guide says `.orvproject` “captures every aspect of the current viewer state” in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L9) through [docs/advanced/session-management.md#L12).
  - The compatibility guide likewise describes the native session format as containing the complete `SessionState` in [docs/guides/session-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/guides/session-compatibility.md#L252) through [docs/guides/session-compatibility.md#L260).
  - The real serializer tracks known active gaps and warns that viewer states are “NOT saved in the project file,” including LUT pipeline stages, difference matte/blend mode state, and other viewer-side settings in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L253) through [src/core/session/SessionSerializer.ts#L316).
  - The app save path also surfaces that same omission list to users at save time in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L292) through [src/AppPersistenceManager.ts#L297).
- Impact:
  - The published session docs overpromise what a saved project actually round-trips.
  - That can mislead users into treating `.orvproject` as a full-fidelity interchange or backup format when the app itself already knows that some live states will be lost.

### 298. The session-compatibility guide claims schema v2 persists the node graph, but `.orvproject` save still leaves `graph` unwired

- Severity: Medium
- Area: Documentation / session graph persistence
- Evidence:
  - The compatibility guide says schema version 2 includes an optional `graph` field containing serialized node-graph topology and lists preserved nodes, connections, properties, and active output in [docs/guides/session-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/guides/session-compatibility.md#L302) through [docs/guides/session-compatibility.md#L311).
  - It also presents `graph` as part of the complete serializable `SessionState` table in [docs/guides/session-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/guides/session-compatibility.md#L168) through [docs/guides/session-compatibility.md#L199).
  - The actual serializer still carries an explicit TODO that the node-graph serializer exists but “is not wired into .orvproject save/load,” and the `graph` field remains commented out in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L367) through [src/core/session/SessionSerializer.ts#L371).
- Impact:
  - Readers of the compatibility guide can believe graph topology is already preserved in native project files when it is not.
  - That makes the native-session documentation materially ahead of the implementation for node-graph workflows.

### 299. `AutoSaveManager` emits a `recoveryAvailable` event, but production app code never subscribes to it

- Severity: Low
- Area: Auto-save / recovery event contract
- Evidence:
  - `AutoSaveManager` defines `recoveryAvailable` as part of its event interface and emits it during startup recovery detection in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L51) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L64) and [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L114) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L120).
  - A production-code search finds no `on('recoveryAvailable', ...)` subscriber outside tests.
  - The actual app recovery flow in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L428) through [src/AppPersistenceManager.ts#L461](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L461) instead polls the boolean returned by `initialize()` and then manually lists auto-saves.
- Impact:
  - The emitted recovery event is not part of the live app flow even though the manager advertises it.
  - That leaves recovery signaling split between an unused event path and a separate return-value path, which makes the API harder to rely on or extend cleanly.

### 300. Save-project shortcut guidance is internally inconsistent, and there is no actual keyboard binding for project save

- Severity: Medium
- Area: UI / documentation / keyboard contract
- Evidence:
  - The session docs tell users to save a session with `Ctrl+S` in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L43) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L45) and [docs/guides/session-compatibility.md](/Users/lifeart/Repos/openrv-web/docs/guides/session-compatibility.md#L245).
  - The shipped shortcut reference assigns `Ctrl+S` to frame export and `Ctrl+Shift+S` to quick snapshot in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L165) through [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L172).
  - The header save button itself advertises `Save project (Ctrl+Shift+S)` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L235).
  - The actual keyboard map wires `Ctrl+S` to `export.quickExport` and `Ctrl+Shift+S` to `snapshot.create` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L266) and [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L570), while project save is only triggered from the header click wiring in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L59).
- Impact:
  - Keyboard-focused users are told three different stories about how project save works and none of them matches a real save shortcut.
  - That makes save behavior easy to mislearn and increases the chance of exporting a frame or creating a snapshot when the user intended to save the project.

### 301. RV/GTO import diagnostics for skipped nodes and degraded modes are emitted internally but never surfaced to users

- Severity: Medium
- Area: Session import / diagnostic visibility
- Evidence:
  - `SessionGraph` emits `skippedNodes` and `degradedModes` when RV/GTO import drops nodes or downgrades composite modes in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L396) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L412).
  - The production persistence handlers only subscribe to `annotationsLoaded`, `sessionLoaded`, `frameChanged`, `inOutChanged`, `marksChanged`, `fpsChanged`, `paintEffectsLoaded`, `matteChanged`, `metadataChanged`, and `settingsLoaded` in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L14) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L65).
  - The RV/GTO open path in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L371) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L398) loads the session and resyncs some controls, but shows no success/warning summary for skipped nodes or degraded modes.
- Impact:
  - Users can import an RV/GTO session with known dropped nodes or downgraded blend modes and receive no UI-level indication that the import was lossy.
  - That makes session interchange failures harder to detect than they need to be, even though the loader already computes the exact diagnostics.

### 302. Media representation failures and automatic fallbacks are emitted internally, but the app never surfaces them

- Severity: Medium
- Area: Media representations / degraded-runtime visibility
- Evidence:
  - `MediaRepresentationManager` emits `representationError` when a representation load/switch fails and `fallbackActivated` when it silently moves to another representation in [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L212) through [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L223) and [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L252) through [src/core/session/MediaRepresentationManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/MediaRepresentationManager.ts#L263).
  - `SessionMedia` forwards both events onto the session in [src/core/session/SessionMedia.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L139) through [src/core/session/SessionMedia.ts#L146](/Users/lifeart/Repos/openrv-web/src/core/session/SessionMedia.ts#L146).
  - Production code subscribes to `representationChanged`, but a search finds no non-test subscriber for `representationError` or `fallbackActivated`; the live app hooks only `representationChanged` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L124) and [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L185).
- Impact:
  - If a preferred representation fails and the app falls back to another one, users get no visible indication that playback quality or source selection degraded.
  - That makes proxy/original/HDR representation problems harder to detect and diagnose than the underlying event model would allow.

### 303. Network Sync ignores `roomLeft`, so disconnect-driven room exits can leave stale room info in the panel

- Severity: Medium
- Area: Network sync / UI state truthfulness
- Evidence:
  - `NetworkSyncManager` emits `roomLeft` both on normal room exit and when a guest-side serverless/WebRTC peer disconnect tears the room down in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L438) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L447) and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1348) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1355).
  - `AppNetworkBridge` subscribes to `connectionStateChanged`, `roomCreated`, `roomJoined`, `usersChanged`, `error`, and `rttUpdated`, but not `roomLeft`, in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L414) through [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L466).
  - The only place that explicitly clears room info and users in the UI is the direct `leaveRoom` click handler in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L119) through [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L129), while `NetworkControl.setConnectionState(...)` does not clear `roomInfo` or `users` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L985) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L999) and [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1070) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1085).
- Impact:
  - If the room ends because of a remote/serverless disconnect instead of the local `Leave` button, the Network Sync UI can stay populated with stale room code, users, and share-link state while showing a disconnected connection state.
  - That makes collaboration teardown harder to understand and can mislead users into thinking they are still attached to the previous room context.

### 304. Playback buffering and decode-timeout diagnostics are emitted internally, but the app never surfaces them

- Severity: Medium
- Area: Playback / degraded-runtime visibility
- Evidence:
  - `PlaybackEngine` emits `buffering` and `frameDecodeTimeout` during starvation handling, and the code explicitly comments that buffering is emitted “so UI shows a loading indicator” in [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L813) through [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L824).
  - `SessionPlayback` forwards both events onto the session in [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L603) through [src/core/session/SessionPlayback.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionPlayback.ts#L612).
  - The main session-event bridge only wires `frameChanged`, `sourceLoaded`, `unsupportedCodec`, and `playbackChanged`-driven updates in [src/AppSessionBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppSessionBridge.ts#L124) through [src/AppSessionBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppSessionBridge.ts#L180), and a production-code search finds no non-test subscriber for `buffering` or `frameDecodeTimeout`.
- Impact:
  - When playback stalls waiting for frames or skips an undecodable frame after a timeout, the app has no built-in loading/timeout feedback even though the engine already computes that state.
  - Users can experience frozen or degraded playback with no explanation beyond the image not advancing as expected.

### 305. `NetworkSyncManager` emits toast-style collaboration feedback, but the production app never consumes it

- Severity: Medium
- Area: Network sync / user feedback
- Evidence:
  - `NetworkSyncManager` emits `toastMessage` for state-sync timeouts, reconnect progress/outcomes, peer join/leave activity, and other collaboration feedback in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L632) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L635), [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L764) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L794), and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L958) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L980).
  - `AppNetworkBridge` only subscribes to `connectionStateChanged`, `roomCreated`, `roomJoined`, `usersChanged`, `error`, and `rttUpdated` in [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L414) through [src/AppNetworkBridge.ts](/Users/lifeart/Repos/openrv-web/src/AppNetworkBridge.ts#L466).
  - A production-code search finds no non-test subscriber for `toastMessage`, `userJoined`, or `userLeft`.
- Impact:
  - The collaboration stack generates useful runtime feedback like “connection lost,” “reconnected,” and “user joined,” but the shipped app drops it.
  - Users only see the low-level panel state mutate, with no transient explanation for reconnects, sync failures, or peer activity.

### 306. Media-cache failures are emitted internally, but the shipped app never surfaces them

- Severity: Medium
- Area: Media cache / degraded-runtime visibility
- Evidence:
  - `MediaCacheManager` advertises evented cache lifecycle/error reporting and emits `error`, `entryAdded`, and `cleared` from initialization, write, and clear paths in [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L1) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L9), [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L118) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L121), [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L182) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L187), and [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L252) through [src/cache/MediaCacheManager.ts](/Users/lifeart/Repos/openrv-web/src/cache/MediaCacheManager.ts#L255).
  - The app constructs the cache manager and only fire-and-forget initializes it with a debug log fallback in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L710) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L713).
  - A production-code search finds no `cacheManager.on(...)` subscriber, and the only fuller cache UI (`CacheManagementPanel`) is itself documented as not mounted in production in [src/ui/components/CacheManagementPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheManagementPanel.ts#L1) through [src/ui/components/CacheManagementPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheManagementPanel.ts#L12).
- Impact:
  - If OPFS caching fails during init, writes, or cache clearing, the shipped app provides no user-facing signal that the cache is unavailable or malfunctioning.
  - That makes cache-backed reload/resilience behavior harder to trust or diagnose than the internal event model suggests.

### 307. The adaptive `FrameCacheController` subsystem is fully implemented but never instantiated in production

- Severity: Medium
- Area: Playback cache architecture
- Evidence:
  - `FrameCacheController` is described as the central frame-caching coordinator with region/lookahead modes, memory-pressure management, and pre-roll warm-up in [src/cache/FrameCacheController.ts](/Users/lifeart/Repos/openrv-web/src/cache/FrameCacheController.ts#L1) through [src/cache/FrameCacheController.ts](/Users/lifeart/Repos/openrv-web/src/cache/FrameCacheController.ts#L15).
  - Its companion config explicitly defines UI labels/tooltips and even a cache-mode cycle “for `Shift+C` keyboard shortcut” in [src/config/CacheConfig.ts](/Users/lifeart/Repos/openrv-web/src/config/CacheConfig.ts#L1) through [src/config/CacheConfig.ts](/Users/lifeart/Repos/openrv-web/src/config/CacheConfig.ts#L37) and [src/config/CacheConfig.ts](/Users/lifeart/Repos/openrv-web/src/config/CacheConfig.ts#L92) through [src/config/CacheConfig.ts](/Users/lifeart/Repos/openrv-web/src/config/CacheConfig.ts#L95).
  - A production-code search finds no `new FrameCacheController(...)` outside tests, and the shipped controls only create the simpler passive `CacheIndicator` in [src/services/controls/createPanelControls.ts](/Users/lifeart/Repos/openrv-web/src/services/controls/createPanelControls.ts#L71) through [src/services/controls/createPanelControls.ts](/Users/lifeart/Repos/openrv-web/src/services/controls/createPanelControls.ts#L72), which itself just reflects session/viewer cache stats and a clear button in [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L1) through [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L9) and [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L169) through [src/ui/components/CacheIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/CacheIndicator.ts#L192).
- Impact:
  - The app carries a substantial adaptive frame-cache design, but the shipped runtime never actually turns it on.
  - That leaves cache modes, warm-up behavior, and memory-pressure coordination effectively test-only despite the surrounding config and UI-oriented metadata.

### 308. Collaboration permission roles affect sync behavior, but the shipped UI never reflects or enforces them locally

- Severity: Medium
- Area: Network sync / collaboration permissions
- Evidence:
  - `NetworkSyncManager` exposes real participant roles, defaults unknown users to `reviewer`, and uses `viewer` to suppress outgoing sync via `canUserSync(...)`, `sendAnnotationSync(...)`, and `sendNoteSync(...)` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L210) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L236) and [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L547) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L594).
  - Incoming host permission changes are applied and emitted as `participantPermissionChanged` in [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1105) through [src/network/NetworkSyncManager.ts](/Users/lifeart/Repos/openrv-web/src/network/NetworkSyncManager.ts#L1113).
  - A production-code search finds no `participantPermissionChanged` subscriber in app wiring, and the visible network panel only renders a `Host` badge with no reviewer/viewer state or permission controls in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1278) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1320).
- Impact:
  - A user can be downgraded to `viewer` and silently stop sending synced notes or annotations while the local UI still presents normal collaboration controls.
  - The permission system exists at the transport layer, but the shipped interface gives no clear indication of current role or why collaboration actions stopped propagating.

### 309. `SessionManager` is documented as a central session subsystem, but it is never instantiated in production

- Severity: Low
- Area: Session graph architecture
- Evidence:
  - `SessionManager` presents itself as the “Central orchestrator for graph mutations, view history, tree model, and media-graph bridge” in [src/core/session/SessionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionManager.ts#L1) through [src/core/session/SessionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionManager.ts#L7).
  - The docs-generation templates also present `SessionManager` as part of the session-system architecture and include its source file in the generated module set in [docs/scripts/lib/templates.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/lib/templates.ts#L288) through [docs/scripts/lib/templates.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/lib/templates.ts#L304) and [docs/scripts/modules.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/modules.ts#L46) through [docs/scripts/modules.ts](/Users/lifeart/Repos/openrv-web/docs/scripts/modules.ts#L52).
  - A production-code search finds no `new SessionManager()` outside tests.
- Impact:
  - The repo carries a documented graph-mutation/view-history service that is effectively test-only in the shipped app.
  - That makes the published session architecture ahead of production wiring for any future graph-browser or view-history workflows that would depend on this manager.

### 310. Editing a multi-cut timeline collapses session `pingpong` looping into plain playlist looping

- Severity: Medium
- Area: Timeline editing / playback loop semantics
- Evidence:
  - Core session playback supports `once`, `loop`, and `pingpong` loop modes in [src/core/types/session.ts](/Users/lifeart/Repos/openrv-web/src/core/types/session.ts#L1) and [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L850) through [src/core/session/PlaybackEngine.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaybackEngine.ts#L943).
  - When `TimelineEditorService` applies edits that produce multiple cuts, it hands playback over to `PlaylistManager` and maps the session loop mode with `const mappedMode = this.session.loopMode === 'once' ? 'none' : 'all'` in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L410) through [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L412).
  - `PlaylistManager` only supports `none`, `single`, and `all` in [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L52) and [src/core/session/PlaylistManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/PlaylistManager.ts#L486).
- Impact:
  - If a user is in `pingpong` loop mode and then edits or creates a multi-cut timeline, playback silently degrades to simple wraparound looping.
  - That changes loop behavior as a side effect of editing structure, not of any explicit loop-mode choice by the user.

### 311. RVEDL entries with unmatched source paths are silently rebound to loaded source `0`

- Severity: Medium
- Area: RVEDL import / timeline source mapping
- Evidence:
  - `TimelineEditorService.buildEDLFromRVEDLEntries(...)` resolves RVEDL source paths by basename against loaded sources in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L220) through [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L249).
  - When no match is found, it explicitly falls back to `sourceIndex = 0` “so the cut structure is still visible” in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L251) through [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L252).
  - The resulting mapped EDL is then loaded straight into the timeline editor as if it were resolved successfully in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L348) through [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L353).
- Impact:
  - An RVEDL that references media the app cannot actually match will still render a timeline, but those cuts can point at the wrong loaded source instead of remaining visibly unresolved.
  - That makes timeline review look superficially successful while silently corrupting clip-to-media mapping.

### 312. Imported RVEDL cuts are ignored whenever the session already has playlist clips

- Severity: Medium
- Area: RVEDL import / timeline precedence
- Evidence:
  - `SessionGraph.loadEDL(...)` stores RVEDL entries and emits `edlLoaded` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L244) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L259).
  - `TimelineEditorService.syncFromGraph()` checks playlist clips before it checks `session.edlEntries`; if any playlist clips exist, it immediately loads those and returns in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L334) through [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L345).
  - The RVEDL branch only runs afterward, in [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L348) through [src/services/TimelineEditorService.ts](/Users/lifeart/Repos/openrv-web/src/services/TimelineEditorService.ts#L353).
- Impact:
  - If a user imports an RVEDL into a session that already has playlist clips, the timeline editor continues to show the old playlist structure instead of the newly imported edit list.
  - That makes RVEDL import feel ineffective or broken in exactly the scenarios where users are likely comparing or replacing an existing cut structure.

### 313. Shot status tracking exists in session/export code, but the shipped app exposes no real status UI

- Severity: Medium
- Area: Review workflow / status tracking
- Evidence:
  - The session layer ships a real `StatusManager` with per-source status state, counts, colors, serialization, and change callbacks in [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L1) through [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L190).
  - Production consumers are effectively limited to export and ShotGrid integration: `generateReport(...)` reads `session.statusManager` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L293), and ShotGrid push/pull maps statuses through [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L182) through [src/integrations/ShotGridIntegrationBridge.ts#L247).
  - A production-code search finds no real UI code using `session.statusManager`, `getStatus(...)`, or `setStatus(...)` in the shipped header, QC tab, or source panels, while the QC toolbar itself only mounts scopes/analysis/pixel-probe controls in [src/services/tabContent/buildQCTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildQCTab.ts#L17) through [src/services/tabContent/buildQCTab.ts#L130).
  - The current docs and UI overview still describe shot-status controls as part of QC/review flow in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L22) through [docs/advanced/review-workflow.md#L26) and [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L71).
- Impact:
  - Users can load, save, export, and even sync status data indirectly, but they cannot actually set or inspect shot status through the shipped app UI.
  - That leaves a core review-workflow feature implemented underneath the app yet unavailable in the normal production workflow.

### 314. Version management is implemented underneath the session layer, but the shipped app never wires it to UI or auto-detection

- Severity: Medium
- Area: Review workflow / version management
- Evidence:
  - `VersionManager` implements grouping, next/previous navigation, active-version switching, and filename-based auto-detection in [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L1) through [src/core/session/VersionManager.ts#L349).
  - The auto-detection entry point `autoDetectGroups(...)` exists in [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L273) through [src/core/session/VersionManager.ts#L324), but a production-code search finds no caller outside the manager itself.
  - The only live consumers of version groups are export/report serialization paths such as [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L120) through [src/export/ReportExporter.ts#L129) and session save/load in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L372) through [src/core/session/SessionSerializer.ts#L376) and [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L574) through [src/core/session/SessionSerializer.ts#L577).
  - A production-code search finds no header/QC/source-panel UI that calls `getGroups()`, `getGroupForSource()`, `nextVersion()`, `previousVersion()`, or `setActiveVersion(...)`, even though the shipped docs still promise a header-bar version selector and version list in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L36) through [docs/advanced/review-workflow.md#L40).
- Impact:
  - Version groups can exist in saved state and reports, but the production app never auto-detects them from filenames and never exposes navigation or selection controls.
  - That makes version management effectively a persistence/export-only subsystem instead of a usable review feature.

### 315. Project restore does not clear old RVEDL state when the new project has no EDL entries

- Severity: Medium
- Area: Project restore / RVEDL state
- Evidence:
  - `.orvproject` save only serializes `edlEntries` when the current session has at least one entry in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L372) through [src/core/session/SessionSerializer.ts#L375).
  - Project load clears media with `session.clearSources()` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L446) through [src/core/session/SessionSerializer.ts#L447), but `Session.clearSources()` only delegates to media clearing in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L1208) through [src/core/session/Session.ts#L1214) and does not reset `edlEntries`.
  - Restore only calls `session.setEdlEntries(...)` when `migrated.edlEntries.length > 0` in [src/core/session/SessionSerializer.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionSerializer.ts#L584) through [src/core/session/SessionSerializer.ts#L587).
  - The underlying session graph explicitly stores RVEDL state separately in `_edlEntries` and only clears it when its own `clear()` path runs in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L202) through [src/core/session/SessionGraph.ts#L221).
- Impact:
  - Loading a project with no RVEDL data after a session that had imported EDL cuts can leave the old edit list hanging around in session state.
  - That creates another stale-state path where the newly loaded project does not fully replace the previous editorial context.

### 316. Review notes do not support priority or category, so the richer dailies workflow is impossible in the shipped app

- Severity: Medium
- Area: Notes / review workflow
- Evidence:
  - The shipped review-workflow guide describes notes with priority, category, and category-based report statistics in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L64) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L68) and [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L106) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L111).
  - The actual `Note` model only stores `text`, `author`, frame range, status, reply parent, and color in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L8) through [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L23), and the CRUD surface only updates `text`, `status`, or `color` in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L71) through [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L120).
  - The shipped `NotePanel` only renders frame, status, author, text, and reply/edit/delete actions; there is no priority/category display or editor in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L522) through [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L728).
  - Report generation only pulls raw note text arrays per source in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L137) through [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L164), so there is no data available for category rollups.
- Impact:
  - Reviewers cannot tag notes by department/severity, and supervisors cannot produce the category-based dailies summaries the workflow describes.
  - The shipped note system is materially simpler than the advertised review process, which limits its usefulness in actual production review sessions.

### 317. Review-status semantics are lossy: several documented production states collapse into unrelated local values

- Severity: Medium
- Area: Review workflow / status semantics
- Evidence:
  - The review-workflow guide defines six user-meaningful states: `Pending`, `In Review`, `Revisions Needed`, `Approved`, `Final`, and `On Hold` in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L11) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L20).
  - The actual session layer only supports five different local values: `pending`, `approved`, `needs-work`, `cbb`, and `omit` in [src/core/session/StatusManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/StatusManager.ts#L4) through [src/core/session/StatusManager.ts#L37).
  - ShotGrid integration further collapses multiple upstream statuses into those local buckets in [src/integrations/ShotGridBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridBridge.ts#L93) through [src/integrations/ShotGridBridge.ts#L103):
    `fin -> approved`, `ip -> pending`, `hld -> pending`, `wtg -> pending`, and `vwd -> approved`.
- Impact:
  - Distinct production-review meanings like “final”, “in progress”, and “on hold” cannot survive a local OpenRV Web round-trip as distinct statuses.
  - That makes status-based review/export/sync workflows semantically weaker than the app and docs suggest, even before the missing status UI is addressed.

### 318. Dailies report export ignores playlist structure and always reports every loaded source

- Severity: Medium
- Area: Reports / playlist review workflow
- Evidence:
  - The documented dailies workflow says to load shots as a playlist, review them, then generate a report in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L97) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L113).
  - The production export path wires `reportExportRequested` straight to `generateReport(session, session.noteManager, session.statusManager, session.versionManager, ...)` with no playlist input in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L292) through [src/AppPlaybackWiring.ts#L300).
  - `buildReportRows(...)` then iterates `for (let i = 0; i < session.sourceCount; i++)` and builds one row per loaded source from `session.getSourceByIndex(i)` in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L105) through [src/export/ReportExporter.ts#L167).
- Impact:
  - A dailies report cannot honor playlist order, omitted shots, repeated comparison clips, or a curated review subset; it just exports the whole loaded source set.
  - That makes reports diverge from the actual session the reviewer just stepped through whenever playlist structure matters.

### 319. Dailies reports omit core session metadata and the category-based summary the workflow promises

- Severity: Medium
- Area: Reports / review workflow
- Evidence:
  - The review-workflow guide says dailies reports include “Session date, supervisor name, and project identifier” plus “Statistics: total shots reviewed, approval rate, revision counts by category” in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L106) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L111).
  - The actual `ReportOptions` only carry `title` and optional `dateRange` in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L30) through [src/export/ReportExporter.ts#L37), and the production call site passes only `format`, `include*` flags, and `title` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L292) through [src/AppPlaybackWiring.ts#L299).
  - HTML generation only renders the title, optional `dateRange`, and a simple count-by-status summary in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L239) through [src/export/ReportExporter.ts#L249) and [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L294) through [src/export/ReportExporter.ts#L296).
- Impact:
  - Exported dailies reports cannot capture who ran the session, what project it belonged to, or any category-based review statistics.
  - That makes the generated reports much less useful for real production circulation than the workflow suggests.

### 320. Dailies reports flatten notes to raw text and lose per-note frame/timecode context

- Severity: Medium
- Area: Reports / notes export
- Evidence:
  - The workflow describes note exports as formatted reports with “timecodes and note text” in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L83) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L89).
  - `buildReportRows(...)` only reads `noteManager.getNotesForSource(i).map((n) => n.text)` in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L137) through [src/export/ReportExporter.ts#L139), so note frame ranges, authors, timestamps, and threading never enter the report model.
  - CSV and HTML export then serialize those notes as a single joined text field per source in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L196) through [src/export/ReportExporter.ts#L210) and [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L252) through [src/export/ReportExporter.ts#L269).
- Impact:
  - The exported report cannot tell artists which exact frame or timecode a specific note belongs to once multiple notes exist on the same source.
  - That reduces the report from a timecoded review artifact to a per-shot text dump, which is much less actionable in production.

### 321. Version-manager navigation is a no-op at runtime because active-version changes never switch the session source

- Severity: Medium
- Area: Version management / session behavior
- Evidence:
  - `VersionManager.nextVersion(...)`, `previousVersion(...)`, and `setActiveVersion(...)` all invoke the `onActiveVersionChanged(...)` callback after updating internal state in [src/core/session/VersionManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/VersionManager.ts#L191) through [src/core/session/VersionManager.ts#L232).
  - `SessionAnnotations` wires that callback to an explicit no-op with the comment “Can be extended for source switching in future” in [src/core/session/SessionAnnotations.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionAnnotations.ts#L37) through [src/core/session/SessionAnnotations.ts#L42).
  - The session only re-emits a generic `versionsChanged` event in [src/core/session/Session.ts](/Users/lifeart/Repos/openrv-web/src/core/session/Session.ts#L316) through [src/core/session/Session.ts#L329); there is no production caller that translates active-version changes into `session.setCurrentSource(...)`.
- Impact:
  - Even if version navigation were exposed through UI, scripting, or future automation, changing the active version group state would not actually change the displayed media.
  - That leaves the version subsystem internally inconsistent: it can record an “active” version without the viewer ever following it.

### 322. ShotGrid version loading never feeds the app’s own version-management system

- Severity: Medium
- Area: ShotGrid integration / version management
- Evidence:
  - When a ShotGrid version is loaded, the integration bridge only loads the media, records a panel-local `versionId -> sourceIndex` mapping, and applies status via `session.statusManager.setStatus(...)` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L171) through [src/integrations/ShotGridIntegrationBridge.ts#L184).
  - The `ShotGridPanel` stores those mappings only in its own `versionSourceMap` / `sourceVersionMap` in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L53) through [src/ui/components/ShotGridPanel.ts#L55) and [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L256) through [src/ui/components/ShotGridPanel.ts#L266).
  - A production-code search finds no call from the ShotGrid flow into `session.versionManager`, `createGroup(...)`, `addVersionToGroup(...)`, or `autoDetectGroups(...)`.
- Impact:
  - ShotGrid can surface and load multiple versions of the same shot, but those versions remain isolated inside the ShotGrid panel instead of becoming first-class OpenRV Web version groups.
  - That means report/export/version-navigation features built around `VersionManager` never benefit from the versions users actually loaded through the production tracking integration.

### 323. ShotGrid playlist loading is not real playlist sync; it only fills the browser panel

- Severity: Medium
- Area: ShotGrid integration / playlist workflow
- Evidence:
  - The integration guide says “ShotGrid playlists can be imported into OpenRV Web as review playlists, maintaining clip order and metadata” in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L104) through [docs/advanced/dcc-integration.md#L109).
  - The actual `loadPlaylist` flow only fetches versions and calls `panel.setVersions(versions)` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L115) through [src/integrations/ShotGridIntegrationBridge.ts#L131).
  - A production-code search finds no ShotGrid path that calls `playlistManager`, `replaceClips(...)`, `addClip(...)`, or similar playlist runtime APIs.
- Impact:
  - Entering a ShotGrid playlist ID does not build an OpenRV Web review playlist; it just populates the ShotGrid side panel with version rows.
  - Users still have to load versions manually one by one, so clip order and review-playlist semantics are not actually imported.

### 324. The ShotGrid panel does not support the advertised “paste a version URL” workflow

- Severity: Medium
- Area: ShotGrid integration / UX contract
- Evidence:
  - The integration guide says users can load versions “by pasting a version URL or using the ShotGrid panel” in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L102) through [docs/advanced/dcc-integration.md#L106).
  - The shipped `ShotGridPanel` only supports two query modes, `playlist` and `shot`, toggled in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L331) through [src/ui/components/ShotGridPanel.ts#L335).
  - Its load handler parses the input strictly as a positive integer ID and rejects anything else as invalid in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L337) through [src/ui/components/ShotGridPanel.ts#L359).
- Impact:
  - A real ShotGrid version URL cannot be pasted into the shipped panel even though that is presented as a supported workflow.
  - Users have to manually extract numeric IDs and also cannot query versions directly, only playlists or shots.

### 325. ShotGrid note publishing sends only plain note text, not annotations or thumbnails

- Severity: Medium
- Area: ShotGrid integration / note publishing
- Evidence:
  - The integration guide describes “Publish review notes and annotations ... with frame references and thumbnails” in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L104) through [docs/advanced/dcc-integration.md#L107).
  - The production `pushNotes` flow iterates `session.noteManager.getNotesForSource(sourceIndex)` and calls `bridge.pushNote(...)` with only `text` and an optional `frameRange` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L192) through [src/integrations/ShotGridIntegrationBridge.ts#L224).
  - `ShotGridBridge.pushNote(...)` only serializes `subject`, `content`, and `frame_range` into the REST payload in [src/integrations/ShotGridBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridBridge.ts#L266) through [src/integrations/ShotGridBridge.ts#L299).
  - The path never reads from the annotation store, never renders thumbnails, and never uploads attachments.
- Impact:
  - Users who rely on annotated frames or visual context cannot actually publish that review artifact back to ShotGrid from the shipped app.
  - The current integration behaves like plain text note posting, which is much less useful than the advertised review-to-tracking workflow.

### 326. The published DCC inbound command set overstates what the bridge actually understands

- Severity: Medium
- Area: DCC integration / protocol contract
- Evidence:
  - The DCC integration guide documents inbound commands `load`, `seek`, `setFrameRange`, `setMetadata`, `setColorSpace`, and `ping` in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L68) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L80).
  - The actual bridge protocol only defines inbound message types `loadMedia`, `syncFrame`, `syncColor`, and `ping` in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L11) through [src/integrations/DCCBridge.ts#L26).
  - Runtime dispatch in `DCCBridge.handleMessage(...)` only routes those four message types and rejects everything else as `UNKNOWN_TYPE` in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L395) through [src/integrations/DCCBridge.ts#L418).
  - `AppDCCWiring` likewise only subscribes to `loadMedia`, `syncFrame`, and `syncColor` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L84) through [src/AppDCCWiring.ts#L141).
- Impact:
  - Real DCC clients following the published contract for frame-range, metadata, or color-space commands will hit unsupported-message errors instead of getting the documented behavior.
  - That blocks several advertised roundtrip workflows such as pushing shot context, frame ranges, or input color metadata from Maya/Nuke/Houdini into the viewer.

### 327. DCC status roundtrip is documented, but the shipped bridge has no `statusChanged` message path

- Severity: Medium
- Area: DCC integration / status sync
- Evidence:
  - The DCC integration guide documents outbound `statusChanged` messages from the viewer in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L85) through [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L96).
  - The actual outbound protocol only defines `frameChanged`, `colorChanged`, `annotationAdded`, `pong`, and `error` in [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L22) through [src/integrations/DCCBridge.ts#L27) and [src/integrations/DCCBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/DCCBridge.ts#L75) through [src/integrations/DCCBridge.ts#L117).
  - `AppDCCWiring` only forwards `session.frameChanged` and `colorControls.adjustmentsChanged` in [src/AppDCCWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppDCCWiring.ts#L143) through [src/AppDCCWiring.ts#L162); it never subscribes to `session.statusChanged`.
- Impact:
  - A DCC tool cannot rely on OpenRV Web to push review-status changes back over the live bridge, even though that workflow is presented as supported.
  - Any pipeline expecting browser-driven approval or needs-revision updates to flow back into a DCC-side review context will silently get nothing.

### 328. The shipped note workflow only exports JSON, despite the UI/docs presenting HTML and CSV note exports

- Severity: Medium
- Area: Notes / export workflow
- Evidence:
  - The review-workflow guide says notes can be exported as HTML, CSV, and JSON in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L83) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L89).
  - The actual `NotePanel` only exposes `Export` / `Import` buttons for JSON and its export implementation is explicitly “Export all notes to a JSON file download” in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L159) through [src/ui/components/NotePanel.ts#L177) and [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L841) through [src/ui/components/NotePanel.ts#L862).
  - The main Export menu’s CSV/HTML options are dailies reports, not note exports, in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L213) through [src/ui/components/ExportControl.ts#L216).
- Impact:
  - Users looking for note export in spreadsheet/report formats will only find JSON in the actual note workflow.
  - HTML/CSV exports are currently a different report feature with different scope and structure, so the note-export contract is misleading in production.

### 329. Dailies reports include only the current version label, not the version history they advertise

- Severity: Medium
- Area: Reports / version data
- Evidence:
  - The report docs describe “Version info | Version number and history” in [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L86) through [docs/export/edl-otio.md](/Users/lifeart/Repos/openrv-web/docs/export/edl-otio.md#L96).
  - `buildReportRows(...)` looks up the version group for a source, then only extracts the single `label` for the current source’s matching entry in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L120) through [src/export/ReportExporter.ts#L129).
  - Neither the CSV nor HTML output adds any other version-group entries or history fields in [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L196) through [src/export/ReportExporter.ts#L210) and [src/export/ReportExporter.ts](/Users/lifeart/Repos/openrv-web/src/export/ReportExporter.ts#L252) through [src/export/ReportExporter.ts#L269).
- Impact:
  - Review reports cannot show a shot’s version lineage or alternative versions, only the one label attached to the exported source row.
  - That makes the report less useful for production review trails where version progression itself matters.

### 330. ShotGrid note sync flattens local note threads and statuses into plain top-level comments

- Severity: Medium
- Area: ShotGrid integration / note round-trip fidelity
- Evidence:
  - Local notes support threaded replies via `parentId` and review state via `status: 'open' | 'resolved' | 'wontfix'` in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L11) through [src/core/session/NoteManager.ts#L23).
  - ShotGrid push iterates every local note for a source and sends only `text` plus optional `frameRange` in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L197) through [src/integrations/ShotGridIntegrationBridge.ts#L215) and [src/integrations/ShotGridBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridBridge.ts#L266) through [src/integrations/ShotGridBridge.ts#L291).
  - ShotGrid pull reconstructs local notes with `addNote(...)` using source/frame/text/author only, with no reply linkage or restored note status in [src/integrations/ShotGridIntegrationBridge.ts](/Users/lifeart/Repos/openrv-web/src/integrations/ShotGridIntegrationBridge.ts#L276) through [src/integrations/ShotGridIntegrationBridge.ts#L308).
- Impact:
  - A threaded review conversation or resolved/won’t-fix state in OpenRV Web cannot survive a ShotGrid sync round-trip as equivalent structured review data.
  - The integration reduces richer local note workflows to a flat list of plain comments, which weakens production review traceability.

### 331. The shipped note UI cannot create or edit frame-range notes even though the note system supports them

- Severity: Medium
- Area: Notes / review workflow
- Evidence:
  - The review-workflow guide says “Notes with frame ranges can be created by setting a start and end frame” in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L62) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L69).
  - The note model itself supports `frameStart` and `frameEnd` in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L11) through [src/core/session/NoteManager.ts#L23).
  - The shipped `NotePanel` add flow always creates notes with `frameStart === frameEnd === currentFrame` in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L332) through [src/ui/components/NotePanel.ts#L348).
  - `NoteManager.updateNote(...)` only edits `text`, `status`, or `color`, and the panel never exposes any UI for changing a note’s frame start/end after creation in [src/core/session/NoteManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/NoteManager.ts#L98) through [src/core/session/NoteManager.ts#L120) and [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L808) through [src/ui/components/NotePanel.ts#L818).
- Impact:
  - Users cannot author the frame-range notes that the review workflow describes from the shipped UI.
  - Range support currently exists only in imported data or programmatic paths, which makes multi-frame feedback much less practical in real review sessions.

### 332. Compare overlays never show real version/source labels, even though the review workflow says they do

- Severity: Medium
- Area: Compare UI / review workflow clarity
- Evidence:
  - The review workflow docs explicitly say that when comparing versions, "The version labels appear in the comparison overlay" in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L42) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L44).
  - The split-screen overlay hardcodes its on-canvas labels to plain `A` and `B` in [src/ui/components/ViewerSplitScreen.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerSplitScreen.ts#L72) through [src/ui/components/ViewerSplitScreen.ts#L97).
  - The wipe overlay hardcodes its labels to `Original` and `Graded` in [src/ui/components/ViewerWipe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerWipe.ts#L8) through [src/ui/components/ViewerWipe.ts#L10) and [src/ui/components/ViewerWipe.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerWipe.ts#L37) through [src/ui/components/ViewerWipe.ts#L59).
  - Production compare wiring only forwards wipe mode/position and A/B source selection into the viewer in [src/AppViewWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppViewWiring.ts#L87) through [src/AppViewWiring.ts#L110), while the viewer's explicit `setWipeLabels(...)` API exists but is not part of that runtime wiring in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2664) through [src/ui/components/Viewer.ts#L2669).
- Impact:
  - Users comparing two shot versions in wipe or split-screen mode cannot tell from the on-image overlay which actual version/source is on each side.
  - That makes the shipped compare HUD materially less useful in review sessions than the documentation promises, especially when filenames or version numbers matter more than abstract `A/B` labels.

### 333. Reference `toggle` mode is documented as a switch between live and reference, but the renderer only replaces the frame

- Severity: Medium
- Area: Reference comparison / API semantics
- Evidence:
  - The advanced compare docs describe reference `Toggle` mode as "Press to switch between reference and live" in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L21) through [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L29).
  - `ReferenceManager` treats `toggle` as a first-class view mode alongside `split-h`, `split-v`, `overlay`, and `side-by-side` in [src/ui/components/ReferenceManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ReferenceManager.ts#L13) through [src/ui/components/ReferenceManager.ts#L18) and [src/ui/components/ReferenceManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ReferenceManager.ts#L40) through [src/ui/components/ReferenceManager.ts#L46).
  - The shipped View tab still only exposes capture and a binary enable/disable button for reference comparison in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L85) through [src/services/tabContent/buildViewTab.ts#L117).
  - In the renderer, `viewMode === 'toggle'` just draws the reference image over the full frame once, the same way a static replacement would, in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3920) through [src/ui/components/Viewer.ts#L3925); there is no additional input path there that alternates between live and reference imagery.
- Impact:
  - Anyone using the documented/API-level `toggle` reference mode gets a latched full-frame reference display, not a real switch-back-and-forth comparison mode.
  - That makes one of the advertised reference comparison modes semantically misleading and less useful for quick before/after review.

### 334. Comparison annotations are tied to the `A/B` slot, not to the underlying source they were drawn on

- Severity: Medium
- Area: Paint / compare review data fidelity
- Evidence:
  - The advanced compare docs say comparison annotations are "tied to the source they were drawn on" so switching between A and B preserves each source's annotation layer independently in [docs/compare/advanced-compare.md](/Users/lifeart/Repos/openrv-web/docs/compare/advanced-compare.md#L61) through [docs/compare/advanced-compare.md#L63).
  - The actual paint annotation model has no source identity field; it only stores `version?: 'A' | 'B' | 'all'` on annotations in [src/paint/types.ts](/Users/lifeart/Repos/openrv-web/src/paint/types.ts#L58) through [src/paint/types.ts](/Users/lifeart/Repos/openrv-web/src/paint/types.ts#L69) and [src/paint/types.ts](/Users/lifeart/Repos/openrv-web/src/paint/types.ts#L83) through [src/paint/types.ts](/Users/lifeart/Repos/openrv-web/src/paint/types.ts#L89).
  - When new paint data is created, `PaintEngine` writes only the current annotation version slot into the annotation payload in [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L237) through [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L254) and [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L291) through [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L299).
  - Display filtering also keys entirely off that `A/B` version tag, not a source index or media identifier, in [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L633) through [src/paint/PaintEngine.ts](/Users/lifeart/Repos/openrv-web/src/paint/PaintEngine.ts#L703).
- Impact:
  - If users redraw A/B assignments to different sources, the annotation layer follows the `A` or `B` slot rather than staying attached to the original media source.
  - That makes the shipped comparison-annotation workflow less reliable than documented for real version review, because annotation meaning can drift when compare assignments change.

### 335. Presentation mode does not provide the visual playback HUD that the review docs describe

- Severity: Medium
- Area: Presentation mode / review UX
- Evidence:
  - The review workflow docs say that in presentation mode "A minimal HUD appears briefly when playback state changes (play/pause indicator, frame counter)" in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L145) through [docs/advanced/review-workflow.md#L151).
  - `PresentationMode` itself only manages hidden elements and cursor auto-hide; its stated responsibility is to hide UI and show only the viewer canvas in [src/utils/ui/PresentationMode.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/PresentationMode.ts#L1) through [src/utils/ui/PresentationMode.ts#L5), and its enter/exit logic only hides/restores DOM elements plus cursor state in [src/utils/ui/PresentationMode.ts](/Users/lifeart/Repos/openrv-web/src/utils/ui/PresentationMode.ts#L111) through [src/utils/ui/PresentationMode.ts#L165).
  - The live playback-state hook in `LayoutOrchestrator` only announces play/pause changes to the screen-reader announcer in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L423) through [src/services/LayoutOrchestrator.ts#L428); it does not create any visual presentation HUD.
  - The nearest visual playback overlay, `FPSIndicator`, is a separate optional viewer overlay with its own enable flag and is not tied to presentation mode in [src/ui/components/FPSIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/FPSIndicator.ts#L193) through [src/ui/components/FPSIndicator.ts#L215).
- Impact:
  - Users entering presentation mode get hidden chrome and cursor auto-hide, but not the transient play/pause plus frame-counter HUD the review workflow promises.
  - That makes playback-state feedback weaker than documented in screening-room or client-review usage, especially once normal UI chrome is hidden.

### 336. The documentation repeatedly sends users to a `View menu` that the shipped app does not actually have

- Severity: Medium
- Area: UI discoverability / documentation contract
- Evidence:
  - Multiple user guides instruct users to access features from the `View menu`, including presentation mode in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L143), playlist in [docs/advanced/playlist.md](/Users/lifeart/Repos/openrv-web/docs/advanced/playlist.md#L11), stereo display modes in [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L17), spherical projection in [docs/playback/viewer-navigation.md](/Users/lifeart/Repos/openrv-web/docs/playback/viewer-navigation.md#L97), and stereo alignment in [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L117).
  - The shipped header utility area exposes layout, presentation, external presentation, fullscreen, volume, theme, and docs buttons, but no `View` menu control, in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L372) through [src/ui/components/layout/HeaderBar.ts#L425).
  - In production those features are generally surfaced through the View tab/context toolbar or direct header buttons, not a menu structure matching the docs.
- Impact:
  - Users following the docs can waste time looking for a top-level `View menu` that does not exist in the shipped interface.
  - That makes multiple otherwise-real features harder to discover, because the guidance points to the wrong UI affordance class.

### 337. The documentation also relies on a non-existent `Settings panel` for several real workflows

- Severity: Medium
- Area: UI discoverability / configuration workflow
- Evidence:
  - The docs tell users to open the shortcut editor from the `Settings panel` in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L191).
  - The review workflow tells users to enable client mode from the `Settings panel` in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L131) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L133), while the live client-mode implementation explicitly keys off the URL parameter path in [src/ui/components/ClientMode.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClientMode.ts#L185) through [src/ui/components/ClientMode.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ClientMode.ts#L190).
  - The DCC/ShotGrid docs say API-key auth is configured in the `OpenRV Web settings panel` in [docs/advanced/dcc-integration.md](/Users/lifeart/Repos/openrv-web/docs/advanced/dcc-integration.md#L109), but the shipped ShotGrid UI actually embeds configuration inside the ShotGrid panel’s disconnected config section in [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L127) through [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L130).
  - The keyboard handler only exposes shortcut management through help-driven dialogs, and its own code comments note that the richer shortcut-editor path is not what production currently opens in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L481) through [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L487).
  - A production UI search finds no actual `Settings panel` control surface matching those docs.
- Impact:
  - Users trying to follow documentation for shortcut customization, client-mode enablement, or ShotGrid authentication can look for a settings panel that does not exist in the shipped UI.
  - That turns several otherwise-implemented workflows into trial-and-error discovery problems and makes the docs materially less trustworthy.

### 338. The review workflow tells users to press `F` for fullscreen, but the shipped fullscreen shortcut is `F11`

- Severity: Medium
- Area: Documentation / keyboard workflow
- Evidence:
  - The review workflow says "Press `F` for fullscreen mode" before enabling presentation mode in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L141) through [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L143).
  - The actual default fullscreen binding is `F11` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L662) through [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L665).
  - The shipped header button tooltip also advertises `Fullscreen (F11)` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L408) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L415).
  - Other user-facing docs agree with `F11`, including [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L228) and [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L36).
- Impact:
  - Users following the review workflow can press the wrong key and conclude fullscreen/presentation entry is broken.
  - That is especially confusing because presentation mode is documented as a two-step fullscreen-first workflow.

### 339. The session-management guide gives the snapshot panel the history panel's shortcut

- Severity: Medium
- Area: Documentation / session workflow
- Evidence:
  - The session-management guide says "Open the Snapshot Panel ... with the keyboard shortcut `Shift+Alt+H`" in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L98) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L100).
  - The same guide later uses `Shift+Alt+H` for the History Panel in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L192).
  - The shipped keymap assigns `Shift+Alt+H` to `panel.history` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L562) through [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L566), while the snapshots panel is actually `Ctrl+Shift+Alt+S` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L572) through [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L580).
  - The keyboard shortcut reference agrees with the keymap and lists `Shift+Alt+H` for history, not snapshots, in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L161) and [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L166).
- Impact:
  - Users following the session-management guide can open the wrong panel when trying to work with snapshots.
  - That is especially confusing because the same guide reuses the same shortcut for two different panels.

### 340. The session-management guide describes the History panel as snapshot/autosave recovery, but the shipped panel is only undo/redo action history

- Severity: Medium
- Area: Documentation / recovery workflow
- Evidence:
  - The session-management guide says the History Panel provides "a unified view of both manual snapshots and auto-save entries" with filtering by snapshot/checkpoint/autosave type and quick restore in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L190) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L199).
  - The shipped `HistoryPanel` source describes itself as a "Visual panel showing undo/redo history" in [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L1) through [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L7).
  - Its implementation is built entirely on `HistoryManager` action entries and exposes only entry selection plus clear-history behavior in [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L25) through [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L124) and [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L175) through [src/ui/components/HistoryPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/HistoryPanel.ts#L205).
  - Snapshot and autosave recovery are handled by separate systems (`SnapshotPanel`, `SnapshotManager`, `AutoSaveManager`, and `AppPersistenceManager`), not by `HistoryPanel`, as shown in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L1) through [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L8) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L2) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L6).
- Impact:
  - Users looking for crash recovery, auto-checkpoints, or snapshot restore in the History panel will land in the wrong tool entirely.
  - That makes the recovery workflow docs materially misleading, because the described panel does not match the shipped runtime behavior.

### 341. Network-sync docs promise participant avatars in the viewer, but presence only renders inside the connection panel

- Severity: Medium
- Area: Collaboration UI / documentation contract
- Evidence:
  - The network-sync docs say participants are visible "as avatar overlays in the viewer" and that presence avatars appear "in the top-right corner of the viewer" in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L41) through [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L47).
  - The shipped `NetworkControl` renders user avatars only inside `userListContainer` in the connection panel in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1273) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1325).
  - A production-code search finds no viewer-side presence overlay or avatar rendering path outside that panel list; the runtime matches are limited to `NetworkControl`'s panel DOM.
- Impact:
  - Users expecting live participant presence in the viewer itself will not get the on-image collaboration cue the docs describe.
  - That makes collaborative review feel less visible than documented, especially when the network panel is closed during playback.

### 342. Network-sync docs describe a dedicated conflict/warning header state that the shipped indicator cannot represent

- Severity: Medium
- Area: Collaboration status UI / documentation contract
- Evidence:
  - The network-sync guide says the header sync indicator shows a `Red warning` state for conflicts and manual intervention in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L139) through [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L143).
  - The runtime connection-state model only defines `disconnected`, `connecting`, `connected`, `reconnecting`, and `error` in [src/network/types.ts](/Users/lifeart/Repos/openrv-web/src/network/types.ts#L9).
  - `NetworkControl.updateButtonStyle()` only renders three visual cases: connected, connecting/reconnecting, and everything else muted; there is no separate conflict/manual-intervention styling path in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1133) through [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1148).
  - Conflict detection currently lives in `SyncStateManager` logic only, with no UI consumer found in the production indicator path.
- Impact:
  - Users cannot rely on the header control to distinguish a sync conflict from ordinary disconnection/reconnection states the way the docs describe.
  - That weakens trust in the collaboration status indicator during remote review, because one of the documented states is not actually expressible in the shipped UI.

### 343. The stereo documentation disagrees with itself and with the shipped mode list

- Severity: Medium
- Area: Documentation / stereo workflow
- Evidence:
  - The practical stereo guide says users get "seven primary display modes," then "seven stereo display modes plus the default Off state," and later says the dropdown contains "all eight options" in [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L3), [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L11), and [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L55).
  - The technical stereo guide instead says OpenRV Web supports "ten stereo display modes" and includes `left-only` and `right-only` in the cycle order in [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L9), [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L17), and [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L125).
  - The shipped runtime exposes exactly ten total `StereoMode` values including `off`, with `left-only` and `right-only` present in both the core type and the actual dropdown order in [src/core/types/stereo.ts](/Users/lifeart/Repos/openrv-web/src/core/types/stereo.ts#L1) through [src/core/types/stereo.ts](/Users/lifeart/Repos/openrv-web/src/core/types/stereo.ts#L11) and [src/ui/components/StereoControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoControl.ts#L19) through [src/ui/components/StereoControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoControl.ts#L30).
- Impact:
  - Users cannot trust the stereo guides to tell them how many modes actually exist or which ones `Shift+3` will cycle through.
  - That makes the stereo feature set look unstable even though the runtime behavior is deterministic.

### 344. The stereo guides publish the wrong convergence-offset range for the shipped UI

- Severity: Medium
- Area: Documentation / stereo control contract
- Evidence:
  - The technical stereo guide says the convergence offset range is `-50 to +50` in [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L105).
  - The practical stereo guide describes the control as an offset slider and uses example values, but the shipped slider is explicitly clamped to `-20` through `20` with `0.5` steps in [src/ui/components/StereoControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoControl.ts#L213) through [src/ui/components/StereoControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoControl.ts#L219).
  - The same stereo control is the production entry point for mode/offset changes; there is no separate wider-range UI path in the shipped component.
- Impact:
  - Users following the docs can expect correction headroom that the actual control cannot provide.
  - That is especially misleading for stereo review/calibration workflows where the numeric offset range matters.

### 345. Multi-view EXR and alternate stereo-input workflows are documented as integrated, but production hardcodes side-by-side stereo

- Severity: High
- Area: Stereo media workflow / documentation contract
- Evidence:
  - The docs say multi-view EXR "integrates with the stereo viewing system" and can be displayed via stereo mode in [docs/playback/exr-layers.md](/Users/lifeart/Repos/openrv-web/docs/playback/exr-layers.md#L72) through [docs/playback/exr-layers.md](/Users/lifeart/Repos/openrv-web/docs/playback/exr-layers.md#L76), and say separate stereo input plus automatic multi-view stereo-pair mapping are supported in [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L79) through [docs/guides/stereo-3d-viewing.md](/Users/lifeart/Repos/openrv-web/docs/guides/stereo-3d-viewing.md#L97) and [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L163) through [docs/advanced/stereo-3d.md](/Users/lifeart/Repos/openrv-web/docs/advanced/stereo-3d.md#L171).
  - The `MultiViewEXR` parser/helpers exist, but a production-code search finds no runtime consumer outside the format barrel export in [src/formats/index.ts](/Users/lifeart/Repos/openrv-web/src/formats/index.ts#L14) through [src/formats/index.ts](/Users/lifeart/Repos/openrv-web/src/formats/index.ts#L20).
  - The shipped viewer stereo path applies `StereoManager.applyStereoMode(...)` / `applyStereoModeWithEyeTransforms(...)` without any input-format argument in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2112) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L2118), and `Viewer.getStereoPair()` explicitly hardcodes `'side-by-side'` in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3050) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3058).
  - `StereoManager` also calls the renderer helpers without supplying any alternate `StereoInputFormat`, so the default side-by-side path is used in [src/ui/components/StereoManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoManager.ts#L132) through [src/ui/components/StereoManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StereoManager.ts#L152).
- Impact:
  - Users are told to expect separate-input and multi-view stereo workflows that the shipped viewer does not actually wire end-to-end.
  - That makes stereo EXR review look supported on paper while production behavior remains side-by-side-centric.

### 346. The accessibility overview overclaims live announcements for frame navigation and tool selection

- Severity: Medium
- Area: Accessibility / documentation contract
- Evidence:
  - The UI overview says screen readers are notified for "playback start/stop, frame navigation, source loading, and tool selection" in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L234) through [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L236).
  - The production `AriaAnnouncer` wiring in `LayoutOrchestrator` only announces tab changes, file loads, playback start/pause, and playback speed changes in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L388) through [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L435).
  - `KeyboardActionMap` adds announcements for range-shift actions only, not ordinary frame stepping or generic tool selection, in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L343) through [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L366).
  - A source search for frame-announcement calls finds no production announcement path for normal frame stepping/seek events.
- Impact:
  - Assistive-technology users can rely on the docs for a level of navigation feedback that the shipped app does not consistently provide.
  - That makes the accessibility overview materially overstate what is currently announced at runtime.

### 347. The channel-isolation docs still advertise `Shift+L` as the normal luminance shortcut even though production routes that combo elsewhere

- Severity: Medium
- Area: Documentation / channel-isolation workflow
- Evidence:
  - The channel-isolation guide tells users luminance is on `Shift+L` or `Shift+Y`, and specifically instructs them to switch to luminance with `Shift+L`, in [docs/playback/channel-isolation.md](/Users/lifeart/Repos/openrv-web/docs/playback/channel-isolation.md#L18) and [docs/playback/channel-isolation.md](/Users/lifeart/Repos/openrv-web/docs/playback/channel-isolation.md#L63).
  - The shortcut reference also lists `Shift+L` as `Luminance / Grayscale` and `Shift+Y` as its alias in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L107) and [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L108).
  - In the shipped keymap, `Shift+L` is a conflict between `channel.luminance` and `lut.togglePanel` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L418) through [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L428).
  - `AppKeyboardHandler` explicitly treats `channel.luminance` as a conflicting default and does not register it like a normal direct shortcut, while `channel.grayscale` (`Shift+Y`) remains separately listed in the channel section in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L48), [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L205) through [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L213), and [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L430) through [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L434).
- Impact:
  - Users following the docs can press `Shift+L` and land in LUT-panel behavior instead of luminance view, then conclude channel isolation is unreliable.
  - The only robust documented shortcut here is effectively the alias, not the primary combo the docs emphasize.

### 348. The shortcut docs still advertise `H` and `W` for histogram and waveform even though those defaults are hidden by conflicts

- Severity: Medium
- Area: Documentation / scopes workflow
- Evidence:
  - The shortcut reference lists `H` for histogram and `W` for waveform in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L72) through [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L73).
  - The getting-started UI overview repeats those same shortcuts for the panels in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L203) through [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L204).
  - In production, `AppKeyboardHandler` marks both `panel.histogram` and `panel.waveform` as conflicting defaults because `H` and `W` are taken by fit-to-height and fit-to-width behavior in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L41) through [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L47).
  - The scopes actions still exist in `KeyboardActionMap`, but the conflict handling means the docs are describing shortcuts that are not normally registered for direct use in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L442) through [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L445).
- Impact:
  - Users can follow the official shortcut docs, press `H` or `W`, and get a different viewer action than the scopes panel they were promised.
  - That keeps the scopes area looking broken even when the underlying panels themselves still work through buttons or custom bindings.

### 349. The published shortcut reference assigns several key combos to different actions in the same table

- Severity: Medium
- Area: Documentation / keyboard reference integrity
- Evidence:
  - The shortcut reference lists `Shift+B` both for background pattern cycling and for blue-channel isolation in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L38) and [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L105).
  - The same reference lists `Shift+R` both for red-channel isolation and for rotate-left in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L103) and [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L127).
  - It also lists `Shift+N` both for resetting channel view and for opening network sync in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L109) and [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L163).
  - Those collisions match the production conflict list in `AppKeyboardHandler`, which explicitly notes `Shift+R`, `Shift+B`, and `Shift+N` are reserved by other actions in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L43) through [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L45).
- Impact:
  - Users cannot treat the published shortcut table as a reliable source of truth because it contradicts itself before they even try the app.
  - That also makes support/debugging harder, since two different official pages can both appear "correct" while describing the same key differently.

### 350. Multiple docs still teach `Shift+R` / `Shift+B` / `Shift+N` channel shortcuts that production reserves for other actions

- Severity: Medium
- Area: Documentation / channel-isolation workflow
- Evidence:
  - The channel-isolation guide still tells users to use `Shift+R`, `Shift+B`, and `Shift+N` for red, blue, and reset in [docs/playback/channel-isolation.md](/Users/lifeart/Repos/openrv-web/docs/playback/channel-isolation.md#L13) through [docs/playback/channel-isolation.md](/Users/lifeart/Repos/openrv-web/docs/playback/channel-isolation.md#L17) and [docs/playback/channel-isolation.md](/Users/lifeart/Repos/openrv-web/docs/playback/channel-isolation.md#L71).
  - Other docs repeat those same combos as if they are normal live shortcuts, including troubleshooting, EXR-layer review, and histogram guidance in [docs/reference/troubleshooting.md](/Users/lifeart/Repos/openrv-web/docs/reference/troubleshooting.md#L49), [docs/playback/exr-layers.md](/Users/lifeart/Repos/openrv-web/docs/playback/exr-layers.md#L102), and [docs/scopes/histogram.md](/Users/lifeart/Repos/openrv-web/docs/scopes/histogram.md#L66).
  - In the shipped keyboard layer, those three channel actions are explicitly marked as conflicting defaults because `Shift+R`, `Shift+B`, and `Shift+N` are already taken by rotate-left, background-pattern cycling, and network sync in [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L43) through [src/AppKeyboardHandler.ts](/Users/lifeart/Repos/openrv-web/src/AppKeyboardHandler.ts#L45).
  - The channel actions still exist in `KeyboardActionMap`, but the conflict handling means the docs are publishing shortcuts that are not the normal production path in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L603) through [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L611).
- Impact:
  - Users following the docs for EXR QC, histogram analysis, or basic troubleshooting can keep pressing keys that are consumed by unrelated actions instead of changing channels.
  - That turns several otherwise-valid workflows into false bug reports because the official docs are teaching shortcuts that production intentionally does not expose as defaults.

### 351. The format-support reference overstates several partially supported formats as if they were fully usable

- Severity: Medium
- Area: Documentation / format support contract
- Evidence:
  - The quick format table presents `EXR` as supporting "multi-view stereo", `Float TIFF` as a supported HDR image format, and `MXF` as a supported video format in [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L16), [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L20), and [docs/reference/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/reference/file-formats.md#L59).
  - The FAQ likewise lists `MXF` among supported video formats in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L29).
  - Production stereo wiring is still side-by-side-centric: `Viewer.getStereoPair()` hardcodes `'side-by-side'`, and the `MultiViewEXR` helpers have no production consumer outside barrel exports in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3050) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3058) and [src/formats/index.ts](/Users/lifeart/Repos/openrv-web/src/formats/index.ts#L14) through [src/formats/index.ts](/Users/lifeart/Repos/openrv-web/src/formats/index.ts#L20).
  - The deeper technical guide already admits MXF is metadata-only with "No pixel decode" in [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L262) through [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L269) and [docs/guides/file-formats.md](/Users/lifeart/Repos/openrv-web/docs/guides/file-formats.md#L418).
  - Existing decoder/runtime behavior also narrows the practical support envelope further than the top-level table suggests:
    - valid float TIFF layouts are rejected outside the decoder’s narrow accepted channel/compression cases
    - EXR multi-view stereo is parsed but not wired to real stereo playback
    - MXF registration does not mean usable frame decode
- Impact:
  - Users reading the top-level support table can assume they can review MXF media or multi-view stereo EXRs end-to-end when the shipped app only provides partial or metadata-level behavior.
  - That makes the support matrix look more complete than the runtime actually is, which is costly when teams plan media handoff formats around it.

### 352. The overlays guide relies on a non-existent `Overlays` submenu and a non-existent `Clear All Overlays` action

- Severity: Medium
- Area: Documentation / overlay controls
- Evidence:
  - The overlays guide tells users to toggle overlays from the `Overlays menu`, says the EXR window overlay is enabled from the `Overlays menu`, and claims all overlays live under an `Overlays` submenu in the View tab with a master `Clear All Overlays` option in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L20), [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L86), and [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L211) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L215).
  - A production-code search finds no `Overlays` menu/submenu and no `Clear All Overlays` implementation.
  - The shipped overlay entry points are scattered as individual buttons and controls instead, such as EXR window, info strip, spotlight, and FPS indicator toggles in the View tab and watermark in Effects, as shown in [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L375) through [src/services/tabContent/buildViewTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildViewTab.ts#L440) and [src/services/tabContent/buildEffectsTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildEffectsTab.ts#L53) through [src/services/tabContent/buildEffectsTab.ts](/Users/lifeart/Repos/openrv-web/src/services/tabContent/buildEffectsTab.ts#L66).
- Impact:
  - Users following the overlays guide can waste time looking for a centralized menu and bulk-clear action that do not exist in the shipped app.
  - That also obscures the real control layout, because the actual overlay toggles are distributed across separate toolbar buttons and panels.

### 353. The overlays guide says EXR window overlay auto-activates on mismatched windows, but production only loads the bounds and leaves it disabled

- Severity: Medium
- Area: Documentation / EXR overlay behavior
- Evidence:
  - The overlays guide says the EXR window overlay "activates automatically when an EXR file with mismatched data/display windows is detected" in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L86).
  - The runtime default state is still `enabled: false`, and visibility only changes through `toggle()`, `enable()`, or direct state updates in [src/ui/components/EXRWindowOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/EXRWindowOverlay.ts#L44) through [src/ui/components/EXRWindowOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/EXRWindowOverlay.ts#L53) and [src/ui/components/EXRWindowOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/EXRWindowOverlay.ts#L140) through [src/ui/components/EXRWindowOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/EXRWindowOverlay.ts#L158).
  - On source load, production only calls `setWindows(...)` or `clearWindows()` and never enables the overlay in [src/handlers/sourceLoadedHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/sourceLoadedHandlers.ts#L273) through [src/handlers/sourceLoadedHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/sourceLoadedHandlers.ts#L283).
- Impact:
  - Users can load an EXR with mismatched windows and see no overlay until they manually toggle it, even though the docs present that case as automatic.
  - That makes EXR overscan/data-window review look broken when the actual problem is a bad documentation contract.

### 354. The overlays guide documents a viewer note overlay, but production `NoteOverlay` is only a timeline note-bar helper

- Severity: Medium
- Area: Documentation / notes UI
- Evidence:
  - The overlays guide describes a bottom-of-viewer note panel with frame text, authors, stacked notes, and navigation arrows in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L171) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L182).
  - The shipped `NoteOverlay` implementation explicitly "draws colored bars on the timeline canvas for notes" and contains only timeline draw logic, not viewer-overlay text UI, in [src/ui/components/NoteOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NoteOverlay.ts#L1) through [src/ui/components/NoteOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NoteOverlay.ts#L104).
  - App bootstrap wires that object into the timeline, not the viewer, in [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L171) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L177).
  - `OverlayManager` enumerates the actual viewer overlays and does not include any viewer note overlay in [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L10) through [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L32) and [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L45) through [src/ui/components/OverlayManager.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OverlayManager.ts#L63).
- Impact:
  - Users looking for a live viewer note overlay will not find the panel, arrows, or automatic current-frame note text that the docs describe.
  - The only shipped "note overlay" is a compact timeline mark, so the documentation currently promises a different UI than the app provides.

### 355. The overlays guide documents a tiled text watermark system, but the shipped watermark is only a single positioned image overlay

- Severity: Medium
- Area: Documentation / watermark workflow
- Evidence:
  - The overlays guide says the watermark overlay tiles "a text string or image across the entire frame" and exposes text, rotation, and color controls in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L130) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L146).
  - The shipped `WatermarkOverlay` is defined as a "Static image overlay" whose state only contains image URL, position, scale, opacity, and margin in [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L1) through [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L31).
  - Rendering is a single `drawImage(...)` call at one calculated position, not a tiled text/image pattern, in [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L199) through [src/ui/components/WatermarkOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts#L215).
  - The shipped `WatermarkControl` only exposes image upload/removal plus position, scale, opacity, and margin controls in [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L1) through [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L8) and [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L89) through [src/ui/components/WatermarkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts#L140).
- Impact:
  - Users expecting confidential tiled text watermarks or recipient-name overlays from the shipped UI will not be able to create them.
  - The current documentation describes a substantially broader watermark feature than the runtime actually implements.

### 356. The overlays guide's `Perspective Grid` section describes composition guides, but production splits those features between Safe Areas and a perspective-correction mesh

- Severity: Medium
- Area: Documentation / overlay feature model
- Evidence:
  - The overlays guide describes a configurable `Perspective Grid` with rule-of-thirds, golden-ratio, custom-grid, and crosshair modes plus color/line-width/diagonal options in [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L150) through [docs/advanced/overlays.md](/Users/lifeart/Repos/openrv-web/docs/advanced/overlays.md#L167).
  - The shipped `PerspectiveGridOverlay` is actually a perspective-correction mesh with four draggable corner handles, a fixed 8x8 subdivision count, and fixed colors in [src/ui/components/PerspectiveGridOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PerspectiveGridOverlay.ts#L1) through [src/ui/components/PerspectiveGridOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PerspectiveGridOverlay.ts#L13) and [src/ui/components/PerspectiveGridOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PerspectiveGridOverlay.ts#L78) through [src/ui/components/PerspectiveGridOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/PerspectiveGridOverlay.ts#L104).
  - The composition-guide pieces the docs mention are instead attached to `SafeAreasOverlay`, which implements rule-of-thirds, center crosshair, aspect-ratio guides, and configurable color/opacity in [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L1) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L29), [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L151) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L201), and [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L307) through [src/ui/components/SafeAreasOverlay.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SafeAreasOverlay.ts#L380).
  - There is no production evidence for the documented golden-ratio, arbitrary row/column grid, diagonal-line, or line-width options.
- Impact:
  - Users are taught to look for one configurable perspective-grid feature, but the shipped app splits part of that into Safe Areas and omits the rest entirely.
  - That makes both the composition-guide workflow and the perspective-correction workflow harder to discover because the docs collapse them into a feature model the UI does not match.

### 357. The session export docs tell users to save `.orvproject` files from the Export menu, but production only exposes RV/GTO exports there

- Severity: Medium
- Area: Documentation / session save workflow
- Evidence:
  - The session save/load guide says users can "Click the Save button in the header bar or use the Export menu to save the current session" in [docs/export/sessions.md](/Users/lifeart/Repos/openrv-web/docs/export/sessions.md#L9) through [docs/export/sessions.md](/Users/lifeart/Repos/openrv-web/docs/export/sessions.md#L11).
  - The shipped export dropdown's `Session` section contains only `Save RV Session (.rv)` and `Save RV Session (.gto)` items, not `.orvproject` save, in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L198) through [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L201).
  - Production `.orvproject` save is triggered from the header save button wiring, not from `ExportControl`, in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L237) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L240) and [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L59).
- Impact:
  - Users following the session docs can open the Export menu looking for `.orvproject` save and find only RV/GTO export commands.
  - That makes the primary session-save workflow look missing or mislabeled even though it still exists in the header.

### 358. The frame-export docs promise an error message on clipboard denial, but production clipboard export only logs and returns `false`

- Severity: Medium
- Area: Documentation / frame export feedback
- Evidence:
  - The frame-export guide says that if clipboard access is denied, "an error message appears" in [docs/export/frame-export.md](/Users/lifeart/Repos/openrv-web/docs/export/frame-export.md#L40) through [docs/export/frame-export.md](/Users/lifeart/Repos/openrv-web/docs/export/frame-export.md#L42).
  - The actual clipboard helper catches errors, logs `Failed to copy to clipboard`, and only returns `false` in [src/utils/export/FrameExporter.ts](/Users/lifeart/Repos/openrv-web/src/utils/export/FrameExporter.ts#L152) through [src/utils/export/FrameExporter.ts](/Users/lifeart/Repos/openrv-web/src/utils/export/FrameExporter.ts#L163).
  - `Viewer.copyFrameToClipboard(...)` just forwards that boolean result in [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3361) through [src/ui/components/Viewer.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts#L3365), and the keyboard/export action path does not surface any alert for a `false` result in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L545) through [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L549).
- Impact:
  - Users can follow the frame-export docs, hit a browser clipboard denial, and receive no user-visible explanation even though the docs promise one.
  - That makes clipboard export failures look random and silent instead of a permissions issue the user can act on.

### 359. The network-sync guide overstates generic one-click joining from share URLs

- Severity: Medium
- Area: Documentation / network sync onboarding
- Evidence:
  - The network-sync guide says opening a copied shareable URL "automatically populates the room code and initiates a join" in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L35), and later describes URL-based signaling as one-click joining without manual entry in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L88).
  - During URL bootstrap, production only auto-joins the normal room path when both `room` and `pin` are present, in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L295) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L299).
  - Plain room links without a PIN are only prefilled into the UI and do not auto-join, since `handleURLBootstrap()` sets the join field from `room` but skips `joinRoom(...)` unless `pinCode` is also present, in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L251) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L260) and [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L295) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L299).
  - Malformed WebRTC share links are also silently ignored during bootstrap because invalid decoded payloads never produce a UI error path in [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L263) through [src/services/SessionURLService.ts](/Users/lifeart/Repos/openrv-web/src/services/SessionURLService.ts#L293).
- Impact:
  - Users can rely on the docs for generic one-click join behavior that only works for narrower URL shapes than the guide implies.
  - When a copied link does not auto-join or a malformed invite opens silently, the app appears unreliable instead of merely under-documented.

### 360. The crash-recovery docs say the UI offers restore on `recoveryAvailable`, but production never consumes that event

- Severity: Medium
- Area: Documentation / crash recovery workflow
- Evidence:
  - The session-management guide says startup crash detection emits `recoveryAvailable` and "the UI offers to restore from the most recent auto-save entry" in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L163) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L170).
  - `AutoSaveManager` does define and emit that event during startup recovery detection in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L60) and [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L119).
  - A production-code search finds no `on('recoveryAvailable', ...)` subscriber outside tests, so there is no live UI hook for the event.
- Impact:
  - Users following the crash-recovery docs can expect an automatic restore prompt that the shipped app does not actually wire from the emitted event.
  - That makes recovery behavior feel inconsistent and harder to trust after an unclean shutdown.

### 361. The stabilization docs describe controls and viewer progress UI that the shipped stabilization panel does not provide

- Severity: Medium
- Area: Documentation / stabilization workflow
- Evidence:
  - The effects guide describes a short pre-analysis pass with a progress indicator in the viewer, and lists translation and rotation enable/disable controls in [docs/advanced/filters-effects.md](/Users/lifeart/Repos/openrv-web/docs/advanced/filters-effects.md#L85) through [docs/advanced/filters-effects.md](/Users/lifeart/Repos/openrv-web/docs/advanced/filters-effects.md#L90).
  - The shipped `StabilizationControl` only exposes three user-facing controls: `Enabled`, `Smoothing Strength`, and `Crop Amount` in [src/ui/components/StabilizationControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StabilizationControl.ts#L158) through [src/ui/components/StabilizationControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/StabilizationControl.ts#L203).
  - A production-code search finds no viewer-side stabilization progress indicator or progress UI path.
  - The underlying effect adapter does still mention `stabilizationAutoMotion`, but there is no corresponding shipped panel control for the documented translation/rotation toggles in [src/effects/adapters/StabilizationEffect.ts](/Users/lifeart/Repos/openrv-web/src/effects/adapters/StabilizationEffect.ts#L13) through [src/effects/adapters/StabilizationEffect.ts#L18).
- Impact:
  - Users following the stabilization docs can look for controls and progress feedback that the shipped panel never surfaces.
  - That makes stabilization feel incomplete or broken in production even when the simpler crop/smoothing implementation is working as designed.

### 362. The display-profile guide promises a viewer status-area profile indicator that production does not expose

- Severity: Low
- Area: Documentation / display-profile feedback
- Evidence:
  - The display-profile guide says `Shift+Alt+D` cycles display profiles and that "The active profile name appears in the viewer status area" in [docs/color/display-profiles.md](/Users/lifeart/Repos/openrv-web/docs/color/display-profiles.md#L22) through [docs/color/display-profiles.md](/Users/lifeart/Repos/openrv-web/docs/color/display-profiles.md#L24).
  - The shipped `DisplayProfileControl` does provide the `Shift+Alt+D` shortcut and the dropdown/button UI in [src/ui/components/DisplayProfileControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/DisplayProfileControl.ts#L56) through [src/ui/components/DisplayProfileControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/DisplayProfileControl.ts#L59), but it does not create any separate viewer status indicator.
  - A production-code search for display-profile status rendering only finds the control itself and its tests; there is no viewer HUD/status widget that displays the active profile name.
- Impact:
  - Users following the guide can look for an on-viewer status readout that never appears.
  - That makes profile cycling feel less observable than the docs imply, especially when using only the keyboard shortcut.

### 363. The shortcut-cheat-sheet docs promise outside-click dismissal, but the shipped overlay has no such path

- Severity: Low
- Area: Documentation / shortcut help UI
- Evidence:
  - The keyboard-shortcuts guide says the shortcut cheat sheet "is dismissed by pressing `Escape` or clicking outside the panel" in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L185) through [docs/reference/keyboard-shortcuts.md#L187).
  - The shipped `ShortcutCheatSheet` component only exposes `show()`, `hide()`, `toggle()`, and `isVisible()` around a bare overlay element in [src/ui/components/ShortcutCheatSheet.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShortcutCheatSheet.ts#L31) through [src/ui/components/ShortcutCheatSheet.ts#L70); it does not register any outside-click or backdrop-dismiss listener.
  - Production dismissal is wired through the global `panel.close` Escape path, which explicitly hides the cheat sheet when visible in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L462) through [src/services/KeyboardActionMap.ts#L466).
- Impact:
  - Users can follow the docs, click outside the `?` overlay, and get no dismissal even though the guide says that interaction should work.
  - That makes the shortcut-help surface feel stuck or inconsistent unless the user already knows the keyboard-only exit path.

### 364. The annotation-import docs promise merge and frame-offset workflows, but the shipped UI always replaces in place

- Severity: Medium
- Area: Documentation / annotation import workflow
- Evidence:
  - The annotation export/import guide says annotation import supports `Merge` and `Frame offset` workflows in [docs/annotations/export.md](/Users/lifeart/Repos/openrv-web/docs/annotations/export.md#L25) through [docs/annotations/export.md#L31).
  - The shipped Export menu exposes only a single `Import Annotations (JSON)` action in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L205) through [src/ui/components/ExportControl.ts#L209).
  - Production import wiring always calls `applyAnnotationsJSON(...)` with `{ mode: 'replace' }` and tells the user "Existing annotations were replaced" in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L253) through [src/AppPlaybackWiring.ts#L274).
  - The lower-level utility still supports both `mode: 'merge'` and `frameOffset`, but the shipped UI never exposes either option in [src/utils/export/AnnotationJSONExporter.ts](/Users/lifeart/Repos/openrv-web/src/utils/export/AnnotationJSONExporter.ts#L199) through [src/utils/export/AnnotationJSONExporter.ts#L218).
- Impact:
  - Users following the docs can expect to merge imported annotations into an existing review or shift them for retimed media, but the live app only offers destructive replacement.
  - That turns a documented interchange workflow into a lossy overwrite operation unless the user writes code against the utility layer.

### 365. The session-management docs tell users to delete auto-save entries from the Snapshot Panel, but that panel does not manage auto-saves

- Severity: Medium
- Area: Documentation / session-storage cleanup
- Evidence:
  - The session-management guide says, "To free storage, delete old snapshots and auto-save entries from the Snapshot Panel" in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L180) through [docs/advanced/session-management.md#L186).
  - The shipped `SnapshotPanel` is a snapshot browser with `Create Snapshot`, `Import`, and per-snapshot restore/export/delete actions in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L1) through [src/ui/components/SnapshotPanel.ts#L10) and [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L187) through [src/ui/components/SnapshotPanel.ts#L249).
  - The underlying `SnapshotManager` models manual snapshots and auto-checkpoints, not `AutoSaveManager` entries, in [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L5) through [src/core/session/SnapshotManager.ts#L24) and [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L121) through [src/core/session/SnapshotManager.ts#L183).
  - The same docs page separately describes a `History Panel` as the place for auto-save history and recovery in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L190) through [docs/advanced/session-management.md#L199), which does not match the shipped history UI either.
- Impact:
  - Users trying to free storage via the documented panel cannot actually remove auto-save entries there, because that panel only manages snapshots and auto-checkpoints.
  - That makes a concrete maintenance workflow in the docs impossible to complete from the named UI.

### 366. The annotation-export docs say the export items appear only when annotations exist, but the shipped menu shows them all the time

- Severity: Low
- Area: Documentation / export menu behavior
- Evidence:
  - The annotation export page says "Both export options appear in the Export dropdown menu ... when annotations exist in the session" in [docs/annotations/export.md](/Users/lifeart/Repos/openrv-web/docs/annotations/export.md#L84) through [docs/annotations/export.md#L89).
  - The shipped `ExportControl` builds `Export Annotations (JSON)` and `Export Annotations (PDF)` as unconditional menu items in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L205) through [src/ui/components/ExportControl.ts#L209).
  - There is no production visibility guard around those menu items based on current annotation count; the control builds the same menu structure up front.
- Impact:
  - Users can read the docs and expect the annotation export entries to appear only after creating annotations, but the shipped menu always contains them.
  - That weakens the docs as a guide to real UI state and makes the menu behavior look inconsistent with the documented workflow.

### 367. The FAQ still tells users plain `L` cycles loop mode, but the real shortcut is `Ctrl+L`

- Severity: Low
- Area: Documentation / playback shortcuts
- Evidence:
  - The FAQ says, "Press `L` to cycle between" loop modes in [docs/reference/faq.md](/Users/lifeart/Repos/openrv-web/docs/reference/faq.md#L67) through [docs/reference/faq.md#L69).
  - The canonical keyboard shortcuts page documents `Ctrl+L` for loop-mode cycling in [docs/reference/keyboard-shortcuts.md](/Users/lifeart/Repos/openrv-web/docs/reference/keyboard-shortcuts.md#L52).
  - The shipped header tooltip also advertises `Cycle loop mode (Ctrl+L)` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L325) through [src/ui/components/layout/HeaderBar.ts#L326).
- Impact:
  - Users following the FAQ can press plain `L`, change playback speed instead of loop mode, and conclude the app ignored the documented shortcut.
  - That creates avoidable confusion in a basic playback workflow that already has an overloaded key space.

### 368. The review docs promise a shot-status badge in the header, but production has no such header status UI

- Severity: Medium
- Area: Documentation / review workflow UI
- Evidence:
  - The review workflow guide says, "The current shot status is displayed as a colored badge in the header bar next to the source name" and that it follows the visible clip during playlist playback in [docs/advanced/review-workflow.md](/Users/lifeart/Repos/openrv-web/docs/advanced/review-workflow.md#L26).
  - A production UI search finds status badges only in note and ShotGrid-related surfaces, such as [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L522) and [src/ui/components/ShotGridPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ShotGridPanel.ts#L7), not in the main header bar.
  - There is no corresponding header-bar component or wiring path that reads `StatusManager` and renders a source-adjacent status badge in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts).
- Impact:
  - Users following the review docs can look for a persistent header-level status readout that never appears in the shipped app.
  - That makes shot-status tracking feel partially missing even before users hit the deeper limitation that there is no real production status-management UI.

### 369. The network-sync docs say the header badge shows participant count, but production hides it for a one-person room

- Severity: Low
- Area: Documentation / collaboration header UI
- Evidence:
  - The network-sync guide says, "The network button badge displays the current participant count" in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L45) through [docs/advanced/network-sync.md#L47).
  - The shipped `NetworkControl` only shows the badge when `count > 1`; for a solo host or solo reconnect state it explicitly hides the badge in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1151) through [src/ui/components/NetworkControl.ts#L1158).
- Impact:
  - Users following the docs can expect a visible `1` badge after creating a room, but the shipped header shows no participant count until someone else joins.
  - That makes the header control less informative than the docs imply during the common “host waiting for others” state.

### 370. The network-sync docs say the host is labeled `You (Host)`, but production only shows a plain `Host` badge

- Severity: Low
- Area: Documentation / collaboration participant list
- Evidence:
  - The network-sync guide says the connection panel labels the host as `You (Host)` in [docs/advanced/network-sync.md](/Users/lifeart/Repos/openrv-web/docs/advanced/network-sync.md#L45).
  - The shipped user-list renderer shows `user.name` and, when `user.isHost`, appends a badge whose text is just `Host` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L1303) through [src/ui/components/NetworkControl.ts#L1320).
  - There is no production self/other distinction in that label path, so the host never gets a literal `You (Host)` treatment.
- Impact:
  - Users following the guide can expect a self-aware host label in the participant list and instead see only a generic host badge.
  - That makes the participant list slightly less clear in collaborative sessions, especially when the stored display name is also generic.

### 371. The playback docs describe a labeled loop-mode button, but production renders an icon-only compact control

- Severity: Low
- Area: Documentation / playback controls
- Evidence:
  - The loop-mode guide says the header button "shows an icon and label (e.g., `Loop`, `Ping`, `Once`) and has a minimum width of 70px" in [docs/playback/loop-modes-stepping.md](/Users/lifeart/Repos/openrv-web/docs/playback/loop-modes-stepping.md#L39).
  - The UI overview likewise says the loop control "displays current mode (Loop, Ping, Once)" in [docs/getting-started/ui-overview.md](/Users/lifeart/Repos/openrv-web/docs/getting-started/ui-overview.md#L84).
  - The shipped header creates the loop button with a `28px` minimum width in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L325) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L328).
  - Runtime updates replace the button contents with SVG only and move the text label into `aria-label`, not visible UI, in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1346) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1360).
- Impact:
  - Users following the docs can look for visible `Loop` / `Ping` / `Once` text in the header and instead find only a compact icon.
  - That makes the current mode less glanceable than the documentation implies, especially for users still learning the transport controls.

### 372. Production 360 auto-detection throws away spherical metadata and falls back to aspect ratio only

- Severity: Medium
- Area: Viewer / spherical projection
- Evidence:
  - The viewer-navigation guide says 360 detection works via metadata or 2:1 aspect ratio in [docs/playback/viewer-navigation.md](/Users/lifeart/Repos/openrv-web/docs/playback/viewer-navigation.md#L90) through [docs/playback/viewer-navigation.md](/Users/lifeart/Repos/openrv-web/docs/playback/viewer-navigation.md#L97).
  - The detection helper does support explicit `isSpherical` and `projectionType === 'equirectangular'` metadata in [src/render/SphericalProjection.ts](/Users/lifeart/Repos/openrv-web/src/render/SphericalProjection.ts#L320) through [src/render/SphericalProjection.ts](/Users/lifeart/Repos/openrv-web/src/render/SphericalProjection.ts#L333).
  - But the production source-load path calls `detect360Content({}, width, height)` with an empty metadata object in [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L409) through [src/services/LayoutOrchestrator.ts](/Users/lifeart/Repos/openrv-web/src/services/LayoutOrchestrator.ts#L417).
- Impact:
  - Metadata-tagged 360 content that is not close to 2:1 will not auto-enable spherical viewing even though the underlying detector supports that path.
  - Explicit non-spherical metadata also cannot suppress 2:1 false positives, because production never forwards the metadata to the detector.

### 373. Plain media loads leave the header title at `Untitled` unless the user manually renames the session

- Severity: Medium
- Area: Header UI / session context
- Evidence:
  - Fresh session metadata starts with an empty `displayName` in [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L60) through [src/core/session/SessionGraph.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SessionGraph.ts#L66).
  - The header’s main title renders `metadata.displayName || 'Untitled'` in [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L590) through [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L597).
  - The normal `sourceLoaded` handler updates info panels, crop dimensions, OCIO state, and HDR behavior, but it never assigns a display name from the loaded source in [src/handlers/sourceLoadedHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/sourceLoadedHandlers.ts#L166) through [src/handlers/sourceLoadedHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/sourceLoadedHandlers.ts#L190).
  - A production-code search finds `setDisplayName(...)` only in the manual rename path and session-metadata internals, not in the standard file-load flow, as shown by [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L587).
- Impact:
  - After loading ordinary media from a clean session, the header’s primary label can still say `Untitled` instead of reflecting the file the user is reviewing.
  - That removes a basic piece of glanceable context from the main chrome and makes docs that talk about header-adjacent source context feel more misleading than they need to.

### 374. Snapshot creation is hardwired to anonymous quick-save behavior instead of the documented name-and-description flow

- Severity: Medium
- Area: Snapshot workflow / documentation
- Evidence:
  - The session-management guide says users should click `Create Snapshot` and then "Provide a name and optional description" in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L94).
  - The shipped Snapshot panel’s `Create Snapshot` button only emits a bare `createRequested` event with no prompt UI or metadata form in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L198) through [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L211).
  - Production wiring maps that event directly to `persistenceManager.createQuickSnapshot()` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L327) through [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L329).
  - `createQuickSnapshot()` auto-generates a timestamp name like `Snapshot 10:42:13 PM` and never supplies a description to `snapshotManager.createSnapshot(...)` in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L165) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L181).
- Impact:
  - Users cannot name or describe a snapshot at creation time even though the docs present that as the normal workflow.
  - That makes the snapshot list harder to curate for real review sessions, especially when multiple checkpoints are created close together.

### 375. Auto-save settings expose only 1-50 saved versions even though the manager and docs support 1-100

- Severity: Low
- Area: Auto-save settings UI / documentation
- Evidence:
  - The session-management guide documents `Max versions` as `1--100` in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L136) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L140).
  - `AutoSaveManager` also clamps `maxVersions` to `1..100` in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L552).
  - But the shipped auto-save settings popover creates its `Max versions` range input with `max = '50'` in [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L318) through [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L327).
  - The same component’s config import/storage path still accepts values up to `100` in [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L463) through [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L464), so the narrower limit is UI-only.
- Impact:
  - Users cannot set the documented upper half of the supported retention range from the shipped UI.
  - That also means imported or persisted values above 50 are outside the control’s visible authored range, which makes the settings surface less trustworthy.

### 376. Auto-checkpoints are documented as broad safety nets before major operations, but production only creates them for restore and project-load flows

- Severity: Medium
- Area: Snapshots / recovery workflow / documentation
- Evidence:
  - The session-management guide says, "Auto-checkpoints are generated before major operations (e.g., loading new media, clearing annotations)" in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L96).
  - Production only defines checkpoint creation in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L194) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L212).
  - A production-code search shows live call sites only before snapshot restore and project/session load in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L227) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L234), [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L349) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L356), and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L385) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L393).
  - There is no corresponding checkpoint wiring around ordinary media loads, annotation clearing, or similar destructive editing paths.
- Impact:
  - Users can trust auto-checkpoints to protect routine destructive actions that the shipped app never checkpoints.
  - That makes the documented safety net much narrower than it sounds, especially during active review/editing work where people are not explicitly loading projects.

### 377. Crash-recovery detection leaves auto-save half-initialized, so normal auto-save is not re-armed after recovery is found

- Severity: High
- Area: Auto-save / crash recovery
- Evidence:
  - `AutoSaveManager.initialize()` returns early as soon as it finds recovery entries in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L113) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L120).
  - That early return skips the normal post-init path that marks the session active, starts the timer, and installs the `beforeunload` clean-shutdown handler in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L123) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L132).
  - The app consumes the boolean from `initialize()` and then immediately goes into recover/discard UI flow in [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L448) through [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L487), but it never re-initializes or otherwise re-arms the manager afterward.
- Impact:
  - After any startup path that detects crash recovery, the session can continue without the normal auto-save timer and clean-shutdown bookkeeping fully restored.
  - That weakens the very safety mechanism users depend on right after a crash, when another failure would be most costly.

### 378. Snapshot descriptions are searchable and displayable, but the shipped UI never lets users author or edit them

- Severity: Low
- Area: Snapshot workflow / UI completeness
- Evidence:
  - The Snapshot panel supports searching by description and renders description text on cards in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L130) through [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L145) and [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L385) through [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L398).
  - The shipped actions only expose create, import, restore, rename, export, delete, and clear-all in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L197) through [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L260) and [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L540) through [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L569).
  - The underlying manager does have an `updateDescription(...)` API in [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L405) through [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L420), but a production-code search finds no live caller for it.
- Impact:
  - In normal production use, snapshot descriptions are effectively import-only metadata even though the panel treats them like a first-class searchable field.
  - That makes the description search/filter path much less useful for real in-app snapshot curation than the UI suggests.

### 379. Turning auto-save off does not actually stop auto-save writes after state changes

- Severity: High
- Area: Auto-save / settings correctness
- Evidence:
  - The session-management guide presents `Enabled: On / Off` as a real auto-save configuration switch in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L132) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L140), and the UI renders an `Enable auto-save` toggle plus `Auto-save off` disabled state in [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L280) through [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L286) and [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L527).
  - Disabling only stops the interval timer in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L554) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L564).
  - `markDirty(...)` still schedules a 2-second delayed save unconditionally in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L276) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L290), and `saveWithGetter()` / `save()` do not check `config.enabled` in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L232) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L237) and [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L296) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L335).
  - Production marks the session dirty on ordinary review changes such as frame changes, marks, annotations, and effects in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L36) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L39) and [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L781) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L784).
- Impact:
  - Users can disable auto-save in the UI, see an `Auto-save off` state, and still have new auto-save entries written a couple of seconds after ordinary edits.
  - That makes the toggle misleading for privacy, storage, and workflow expectations, not just cosmetically wrong.

### 380. The auto-save interval setting is mostly bypassed by a hardcoded 2-second save path

- Severity: Medium
- Area: Auto-save timing semantics
- Evidence:
  - The session-management guide says the system saves "at the configured interval" after state becomes dirty in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L142) through [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L147).
  - `AutoSaveManager` does have an interval timer keyed off the configured minutes value in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L219) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L226).
  - But every `markDirty(...)` call also starts a separate hardcoded `2000ms` debounce that directly saves the session in [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L276) through [src/core/session/AutoSaveManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/AutoSaveManager.ts#L290).
  - Production invokes that dirty-mark path for routine review interactions like frame changes, marks, annotations, and effects in [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L36) through [src/handlers/persistenceHandlers.ts](/Users/lifeart/Repos/openrv-web/src/handlers/persistenceHandlers.ts#L39) and [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L781) through [src/App.ts](/Users/lifeart/Repos/openrv-web/src/App.ts#L784).
- Impact:
  - In normal use, the selected interval is not the real cadence users get; most changes are saved after about two seconds of inactivity instead.
  - That makes the interval control misleading and changes the storage/performance tradeoff users think they are configuring.

### 381. Snapshot import bypasses the documented snapshot-retention limits

- Severity: Low
- Area: Snapshot storage / import workflow
- Evidence:
  - The session-management guide documents hard limits of 50 manual snapshots and 10 auto-checkpoints in [docs/advanced/session-management.md](/Users/lifeart/Repos/openrv-web/docs/advanced/session-management.md#L118) through [docs/advanced/session-management.md#L122).
  - Normal in-app snapshot creation enforces those limits by pruning after `createSnapshot(...)` and `createAutoCheckpoint(...)` in [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L124) through [src/core/session/SnapshotManager.ts#L152) and [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L159) through [src/core/session/SnapshotManager.ts#L188).
  - But `importSnapshot(...)` writes the imported snapshot and notifies listeners without calling any prune path in [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L508) through [src/core/session/SnapshotManager.ts](/Users/lifeart/Repos/openrv-web/src/core/session/SnapshotManager.ts#L539).
- Impact:
  - Users can exceed the documented retention limits simply by importing snapshot files, so the storage model behaves differently depending on how entries were created.
  - That makes the snapshot limits less trustworthy and can leave more retained state than the UI/docs imply.

## Validation Notes

- `pnpm typecheck`: passed
- `pnpm lint`: failed
- `pnpm build`: failed under the current `pnpm` Node runtime
- Targeted Chromium init/layout/mobile checks: passed
- Smoke subset: reproduced `WORKFLOW-001`, `HG-E002`, and `HG-E003`
- Browser spot-check: pressing `G` in QC opens goto-frame instead of the gamut diagram
- Browser spot-check: `Shift+R` / `Shift+B` / `Shift+N` do not activate red / blue / none channel selection
- Browser spot-check: `Shift+L` on Color opens the LUT pipeline panel instead of switching to luminance
- Browser spot-check: `Shift+G` and `Shift+A` still work, so the channel shortcut breakage is selective rather than universal
- Isolated reruns of `CS-030`, `EXR-011`, and `SEQ-012`: passed
