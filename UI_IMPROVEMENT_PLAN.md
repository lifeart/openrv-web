# UI Improvement Plan: Unwired Functionality Audit

Date: 2026-02-18
Repository: `/Users/lifeart/Repos/openrv-web`

## Scope and Method

This plan captures current unwired functionality found in `openrv-web`, then validates each item against original OpenRV behavior (from local source checkout at `/tmp/OpenRV`) to define "same or better" implementation targets and required tests.

Audit method:
- Enumerated unreferenced UI modules (non-test imports only).
- Verified app shell wiring paths: `App.ts`, `AppControlRegistry.ts`, `App*Wiring.ts`, `AppKeyboardHandler.ts`, `KeyBindings.ts`.
- Cross-checked OpenRV implementation details in `/tmp/OpenRV/src`.

## Findings

## 1) Noise Reduction Exists but Is Not Wired

Current `openrv-web` state:
- Control exists: `/Users/lifeart/Repos/openrv-web/src/ui/components/NoiseReductionControl.ts:19`
- CPU/GPU implementations exist:
  - `/Users/lifeart/Repos/openrv-web/src/filters/NoiseReduction.ts:41`
  - `/Users/lifeart/Repos/openrv-web/src/filters/WebGLNoiseReduction.ts:94`
- GTO parse/write paths exist:
  - `/Users/lifeart/Repos/openrv-web/src/core/session/GTOGraphLoader.ts:1916`
  - `/Users/lifeart/Repos/openrv-web/src/core/session/serializers/FilterSerializer.ts:95`
- But active filter model only includes blur/sharpen:
  - `/Users/lifeart/Repos/openrv-web/src/core/types/filter.ts:1`
  - `/Users/lifeart/Repos/openrv-web/src/ui/components/FilterControl.ts:10`
- No app-level references found in `App.ts` / `AppControlRegistry.ts` / `App*Wiring.ts`.

OpenRV reference behavior:
- Noise reduction is a first-class node in default color/filter pipeline:
  - `/tmp/OpenRV/src/lib/ip/IPBaseNodes/BaseDefinitions.cpp:166`
  - `/tmp/OpenRV/src/lib/ip/IPBaseNodes/BaseDefinitions.cpp:242`
- OpenRV parameters: `active`, `amount`, `radius`, `threshold`:
  - `/tmp/OpenRV/src/lib/ip/IPBaseNodes/NoiseReductionIPNode.cpp:31`

Same-or-better target:
- Wire noise reduction into Effects tab and viewer pipeline.
- Preserve OpenRV-compatible params (`active/amount/radius/threshold`) for GTO parity.
- Keep current web extension (luma/chroma separation) as optional advanced behavior, not as a replacement for OpenRV fields.

Implementation touchpoints:
- `AppControlRegistry` instantiate + render control.
- `AppEffectsWiring` event wiring to viewer + persistence.
- Viewer effect pipeline and state snapshot.
- Session persistence/load mapping.

Tests needed:
- Unit:
  - Extend `src/AppEffectsWiring.test.ts` for noise reduction event flow.
  - Extend viewer effect tests for active/bypass behavior.
  - Extend GTO load/save tests for noise reduction property round-trip.
- Integration:
  - App control registry create/dispose includes noise reduction control.
- E2E:
  - New `e2e/noise-reduction.spec.ts`:
    - slider changes image output
    - bypass toggles effect
    - session save/load restores params

## 2) Watermark UI/Overlay Exists but Is Not Wired

Current `openrv-web` state:
- Control/overlay exist:
  - `/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkControl.ts:35`
  - `/Users/lifeart/Repos/openrv-web/src/ui/components/WatermarkOverlay.ts:51`
- README claims feature:
  - `/Users/lifeart/Repos/openrv-web/README.md:276`
- No app-level references in registry/wiring/export path.

OpenRV reference behavior:
- OpenRV watermark is an rvio overlay script (text watermark for export), not an in-viewer panel:
  - `/tmp/OpenRV/src/plugins/rv-packages/rvio_basic_scripts/watermark.mu:13`
  - `/tmp/OpenRV/src/plugins/rv-packages/rvio_basic_scripts/watermark.mu:17`
  - `/tmp/OpenRV/src/plugins/rv-packages/rvio_basic_scripts/watermark.mu:24`

Same-or-better target:
- Keep image-based watermark UI (already richer than OpenRV text-only script).
- Ensure watermark is applied consistently in:
  - viewer preview (optional toggle)
  - frame export
  - sequence export
- Optional "text watermark" mode can be added for OpenRV-like parity.

Implementation touchpoints:
- Add control to appropriate tab/panel.
- Integrate watermark render pass into viewer/export rendering path.
- Add persistence if expected by session workflows.

Tests needed:
- Unit:
  - Control -> overlay -> viewer state propagation.
  - Export rendering includes watermark when enabled.
- Integration:
  - App wiring and disposal.
- E2E:
  - New `e2e/watermark-overlay.spec.ts`:
    - position/scale/opacity changes visible output
    - exported frame contains watermark

## 3) Missing Frame Overlay Exists but Is Not Wired

Current `openrv-web` state:
- Overlay exists:
  - `/Users/lifeart/Repos/openrv-web/src/ui/components/MissingFrameOverlay.ts:13`
- Missing-frame detection exists:
  - `/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts:23`
  - `/Users/lifeart/Repos/openrv-web/src/utils/media/SequenceLoader.ts:252`
- README claims visual overlay:
  - `/Users/lifeart/Repos/openrv-web/README.md:40`
- No integration between detection and overlay display.

OpenRV reference behavior:
- OpenRV package supports multiple missing-frame render modes + persisted preference:
  - `/tmp/OpenRV/src/plugins/rv-packages/missing_frame_bling/PACKAGE:17`
  - `/tmp/OpenRV/src/plugins/rv-packages/missing_frame_bling/PACKAGE:30`
  - `/tmp/OpenRV/src/plugins/rv-packages/missing_frame_bling/missing_frame_bling_mode.mu:176`
- Modes: hold previous frame, red X, show frame number, black.

Same-or-better target:
- Wire overlay into sequence playback when frame gaps are encountered.
- Minimum parity behavior:
  - show frame number mode
  - hold previous frame mode
  - black frame mode
- Persist mode preference.

Implementation touchpoints:
- Sequence playback/frame fetch path emits missing-frame status.
- Viewer toggles missing-frame overlay based on current frame availability.
- UI control/menu for mode selection.

Tests needed:
- Unit:
  - Missing-frame status -> overlay visibility/state transitions.
- Integration:
  - Sequence loader metadata consumed by playback/viewer pipeline.
- E2E:
  - New `e2e/missing-frame-overlay.spec.ts` with sparse sequence fixture:
    - overlay appears on missing frame
    - mode switching behavior validated

## 4) LUT Pipeline Panel Exists but Is Not Wired

Current `openrv-web` state:
- Panel exists:
  - `/Users/lifeart/Repos/openrv-web/src/ui/components/LUTPipelinePanel.ts:19`
- Viewer has pipeline internals:
  - `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts:635`
  - `/Users/lifeart/Repos/openrv-web/src/ui/components/Viewer.ts:2047`
- E2E suite currently skips if panel not wired:
  - `/Users/lifeart/Repos/openrv-web/e2e/multi-point-lut-pipeline.spec.ts:98`
- Test helper expects control key:
  - `/Users/lifeart/Repos/openrv-web/src/test-helper.ts:1317`
- No App registry/wiring references.

OpenRV reference behavior:
- OpenRV supports File/Look/Display/Pre-Cache LUT slots:
  - `/tmp/OpenRV/src/lib/app/mu_rvui/lutgen.mu:131`
  - `/tmp/OpenRV/src/lib/app/mu_rvui/lutgen.mu:158`
  - `/tmp/OpenRV/src/lib/app/mu_rvui/lutgen.mu:182`
- Node definitions include `RVLookLUT`, `RVDisplayColor`, `RVCacheLUT`, `RVLinearize`:
  - `/tmp/OpenRV/src/lib/app/RvApp/RvNodeDefinitions.cpp:227`
  - `/tmp/OpenRV/src/lib/app/RvApp/RvNodeDefinitions.cpp:295`
  - `/tmp/OpenRV/src/lib/app/RvApp/RvNodeDefinitions.cpp:306`
- OpenRV custom LUT package exposes Display/Look/File/Pre-Cache menus:
  - `/tmp/OpenRV/src/plugins/rv-packages/custom_lut_menu_mode/PACKAGE:16`

Same-or-better target:
- Wire panel into Color workflow and connect to actual viewer LUT stages.
- Preserve source-scoped vs display-scoped behavior.
- Keep e2e feature parity already drafted in test suite.
- Avoid keybinding conflicts (current `Shift+L` is used by channel luminance).

Implementation touchpoints:
- App registry instantiation.
- Color wiring subscriptions to panel events.
- Keyboard binding/action handler for panel toggle.
- Persistence layer mapping to session/GTO where applicable.

Tests needed:
- Unit:
  - Extend `AppControlRegistry.test.ts` for panel create/dispose.
  - Extend color wiring tests for stage changes.
  - Extend keyboard action tests for panel toggle action.
- Integration:
  - test-helper `getLUTPipelinePanel()` returns non-null.
- E2E:
  - Unskip and pass `e2e/multi-point-lut-pipeline.spec.ts`.

## 5) TimelineEditor Exists but Is Not Wired

Current `openrv-web` state:
- Component exists:
  - `/Users/lifeart/Repos/openrv-web/src/ui/components/TimelineEditor.ts:64`
- No app-level wiring/instantiation.
- README claims visual EDL editing:
  - `/Users/lifeart/Repos/openrv-web/README.md:299`

OpenRV reference behavior:
- OpenRV has `SequenceIPNode` with EDL properties and auto-EDL behavior:
  - `/tmp/OpenRV/src/lib/ip/IPBaseNodes/SequenceIPNode.cpp:66`
  - `/tmp/OpenRV/src/lib/ip/IPBaseNodes/SequenceIPNode.cpp:569`
- OpenRV Python session API explicitly notes "TODO: hand-edit edl":
  - `/tmp/OpenRV/src/plugins/python/rvSession/rvSession.py:528`
- Conclusion: visual timeline editing is a web feature that can exceed OpenRV.

Same-or-better target:
- Wire TimelineEditor into sequence editing workflows with full event round-trip.
- Keep current timeline keyboard workflows intact.
- Preserve EDL consistency when importing/exporting/editing cut boundaries.

Implementation touchpoints:
- Bind editor events to `SequenceGroupNode`/session mutation APIs.
- Hook UI entry point (tab/panel/modal) and lifecycle.
- Sync editor selection with playback frame and source state.

Tests needed:
- Unit:
  - Existing component tests are good; add adapter tests for editor -> session mutations.
- Integration:
  - Add wiring tests for open/close and event subscriptions.
- E2E:
  - New dedicated edit-flow cases (trim/move/delete cut) beyond current generic timeline tests.

## 6) ViewerCompositor Module Is Unreferenced (Internal Technical Debt)

Current `openrv-web` state:
- Module exists:
  - `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerCompositor.ts:102`
- Tests exist:
  - `/Users/lifeart/Repos/openrv-web/src/ui/components/ViewerCompositor.test.ts:23`
- No non-test imports found in app runtime.

OpenRV reference behavior:
- No direct UI parity requirement (this is internal renderer architecture).

Decision required:
- Integrate `ViewerCompositor` into `Viewer` runtime, or
- Remove module/tests if this extraction is abandoned.

Tests needed:
- If integrated: add viewer integration regression tests for wipe/ghost/composite paths.
- If removed: delete dead tests and verify no behavior regression in `Viewer` test suite.

## 7) Shared Panel Utility Is Unreferenced

Current `openrv-web` state:
- Utility exists:
  - `/Users/lifeart/Repos/openrv-web/src/ui/components/shared/Panel.ts:22`
- No non-test imports found.

OpenRV reference behavior:
- N/A (web utility).

Decision required:
- Adopt utility in existing controls that implement custom panel logic, or
- Remove as dead code.

Tests needed:
- If adopted: one integration test in a representative control.
- If removed: no additional tests.

## Documentation/Parity Mismatch to Fix

Current docs suggest shipped functionality that is not currently wired in app runtime:
- Missing-frame visual overlay claim:
  - `/Users/lifeart/Repos/openrv-web/README.md:40`
- Watermark overlay claim:
  - `/Users/lifeart/Repos/openrv-web/README.md:276`
- Timeline editor claim:
  - `/Users/lifeart/Repos/openrv-web/README.md:299`
- Parity table marks some items as complete while wiring is absent:
  - `/Users/lifeart/Repos/openrv-web/PARITY_PLAN.md:234`
  - `/Users/lifeart/Repos/openrv-web/PARITY_PLAN.md:271`

Action:
- Update status labels to "implemented but not wired" until runtime integration lands.

## Implementation Order (Recommended)

1. LUT Pipeline Panel wiring (existing e2e already prepared; fastest path to visible progress).
2. Missing-frame overlay wiring (high user impact, docs already promise it).
3. Watermark wiring (export parity and docs alignment).
4. Noise reduction wiring + GTO compatibility completion.
5. TimelineEditor wiring (bigger UX/workflow integration).
6. Internal cleanup: ViewerCompositor + shared Panel adoption/removal.

## Definition of Done (Per Feature)

For each wired feature:
- App runtime instantiates control/module.
- Keyboard/menu/tab entry point exists (if applicable).
- Viewer behavior updates in real time.
- State persists/restores where expected.
- Unit + integration + e2e coverage added/updated.
- README/PARITY docs reflect actual runtime status.
