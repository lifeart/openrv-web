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
