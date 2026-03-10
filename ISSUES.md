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

### 14. Plugin app-event subscriptions are inert because the registry never receives the Events API

- Severity: High
- Area: Plugin bootstrap, services
- Evidence:
  - The plugin registry exposes `setEventsAPI()` in [src/plugin/PluginRegistry.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginRegistry.ts#L84).
  - The event bus refuses app-event subscriptions when `eventsAPI` is missing in [src/plugin/PluginEventBus.ts](/Users/lifeart/Repos/openrv-web/src/plugin/PluginEventBus.ts#L216).
  - Bootstrap in [src/main.ts](/Users/lifeart/Repos/openrv-web/src/main.ts#L27) only calls `pluginRegistry.setAPI(window.openrv)` and `pluginRegistry.setPaintEngine(...)`; there is no production call to `pluginRegistry.setEventsAPI(...)`.
- Impact:
  - Plugins can register and activate, but `context.events.onApp('app:...')` subscriptions will warn and no-op in the real app.
  - The plugin event surface is partially dead in production even though the types and registry claim it exists.

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

### 42. The Snapshot panel tells users to create snapshots but does not offer any create action on that surface

- Severity: Medium
- Area: Snapshot UI, empty-state usefulness
- Evidence:
  - The Snapshot panel toolbar contains only search and filter controls in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L126), and the footer only offers `Clear All` in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L183).
  - Its empty state tells users `Create a snapshot to save your session state` in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L253).
  - The actual create action exists only as `snapshot.create` in keyboard/persistence wiring in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L631) and [src/AppPersistenceManager.ts](/Users/lifeart/Repos/openrv-web/src/AppPersistenceManager.ts#L148).
- Impact:
  - The panel’s empty state sends the user toward an action that is not available anywhere in that panel.
  - This makes the snapshot-management surface much less self-explanatory than it looks, especially for users who are exploring the UI rather than memorizing shortcuts.

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

### 44. Network Sync hardcodes participant names and never exposes the user name the rest of the app supports

- Severity: Medium
- Area: Collaboration UI, session identity
- Evidence:
  - `NetworkControl` defines `createRoom` / `joinRoom` events that carry a `userName` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L28).
  - The actual UI emits hardcoded names instead of collecting or loading a real one: auto-join emits `User` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L421), manual join emits `User` in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L972), and create emits `Host` from a truthy-object check in [src/ui/components/NetworkControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NetworkControl.ts#L454).
  - The app already has a real user-name preference and uses it in other collaboration-facing UI such as notes in [src/ui/components/NotePanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/NotePanel.ts#L949), but Network Sync never reads it and exposes no name input.
- Impact:
  - Every participant appears as a generic `User` or `Host`, which makes the connected-user list much less informative in real sessions.
  - The collaboration stack supports user identity, but the UI strips that meaning away at the entry point.

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

### 55. The volume control still tells users mute is on `M`, but production mute is on `Shift+M`

- Severity: Medium
- Area: Header audio UI, shortcut discoverability
- Evidence:
  - The mounted mute button tooltip says `Toggle mute (M in video mode)` in [src/ui/components/VolumeControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/VolumeControl.ts#L49).
  - The actual shortcut map binds audio mute to `Shift+M` in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L753).
  - The keyboard action map routes only `audio.toggleMute` to `session.toggleMute()` in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L690).
- Impact:
  - Users following the visible tooltip will press `M` and get marker behavior instead of mute.
  - That makes one of the few discoverable audio shortcuts actively misleading in review sessions.

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

### 70. The auto-save indicator is clickable for settings and retry, but it is not keyboard-focusable

- Severity: Medium
- Area: Header utility UI, keyboard accessibility
- Evidence:
  - `AutoSaveIndicator` builds its interactive root as a plain `div` in [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L42).
  - That root gets a click handler for retry/settings behavior in [src/ui/components/AutoSaveIndicator.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/AutoSaveIndicator.ts#L89), but it is never given button semantics, `tabindex`, or keyboard activation handling.
  - The component is mounted into the header utility area as a visible interactive status element through [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L65) and [src/ui/components/layout/HeaderBar.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/layout/HeaderBar.ts#L1569).
- Impact:
  - Mouse users can open auto-save settings or retry a failed save, but keyboard users cannot focus the same control.
  - A header element that visibly behaves like an action surface is effectively inaccessible unless the user happens to click it.

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

### 100. Snapshot panel hides load failures behind a blank or stale panel state

- Severity: Medium
- Area: Snapshot panel, error handling
- Evidence:
  - Opening the panel in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L605) only shows the container and starts `loadSnapshots()`.
  - `loadSnapshots()` catches snapshot listing failures and only logs `Failed to load snapshots` to the console in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L225), with no alert, inline error, or retry UI.
  - The list is only re-rendered on successful load in [src/ui/components/SnapshotPanel.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/SnapshotPanel.ts#L227), so a failed fetch can leave the panel blank on first open or showing stale results from an earlier successful load.
- Impact:
  - If snapshot storage is unavailable or listing fails, users get a panel that looks empty or out-of-date rather than a clear failure state.
  - That makes snapshot problems look like “no snapshots exist” instead of “the panel failed to load them.”

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
