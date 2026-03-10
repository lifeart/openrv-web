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
  - The OCIO button title says `Toggle OCIO color management panel (Shift+O)` in [src/ui/components/OCIOControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/OCIOControl.ts#L98).
  - The real shared key binding for `panel.ocio` is plain `O`, not `Shift+O`, in [src/utils/input/KeyBindings.ts](/Users/lifeart/Repos/openrv-web/src/utils/input/KeyBindings.ts#L231).
  - The action map wires that binding directly to `controls.ocioControl.toggle()` in [src/services/KeyboardActionMap.ts](/Users/lifeart/Repos/openrv-web/src/services/KeyboardActionMap.ts#L445).
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

### 173. Annotation JSON support is export-only in the shipped app

- Severity: Medium
- Area: Annotation workflow / interchange
- Evidence:
  - The export menu exposes `Export Annotations (JSON)` in [src/ui/components/ExportControl.ts](/Users/lifeart/Repos/openrv-web/src/ui/components/ExportControl.ts#L197).
  - Playback wiring hooks that menu item to `downloadAnnotationsJSON(...)` in [src/AppPlaybackWiring.ts](/Users/lifeart/Repos/openrv-web/src/AppPlaybackWiring.ts#L167).
  - The annotation utility layer also implements `parseAnnotationsJSON(...)` and `applyAnnotationsJSON(...)` in [src/utils/export/AnnotationJSONExporter.ts](/Users/lifeart/Repos/openrv-web/src/utils/export/AnnotationJSONExporter.ts#L179) and [src/utils/export/AnnotationJSONExporter.ts](/Users/lifeart/Repos/openrv-web/src/utils/export/AnnotationJSONExporter.ts#L218).
  - A production source search finds no runtime caller of `parseAnnotationsJSON(...)` or `applyAnnotationsJSON(...)`.
- Impact:
  - Users can export annotations to JSON, but the shipped app provides no way to re-import that JSON.
  - That makes the annotation JSON format effectively archival/export-only rather than a practical interchange workflow.

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
