# BUGFIX Backlog

## Context
A focused browser control audit found major regressions in control behavior and control observability.

- Command run: `npx playwright test e2e/view-controls.spec.ts e2e/color-controls.spec.ts e2e/effects-controls.spec.ts e2e/transform-controls.spec.ts e2e/playback-controls.spec.ts e2e/tab-navigation.spec.ts --reporter=line`
- Result: `59 failed`, `65 passed`
- Failure pattern: controls appear to be no-op in E2E, but many failures are caused by stale state adapters and stale selectors after UI refactors.

This document defines concrete bugfix tasks with verification coverage (unit + e2e) for each.

## Priority Legend
- `P0`: blocks confidence in core controls, must fix first
- `P1`: high-value UX/reliability fixes
- `P2`: robustness and long-term regression prevention

---

## Task 1 (P0): Fix stale E2E state adapter in `test-helper`
### Problem
E2E reads outdated fields, making working controls look broken.

### Root cause
`src/test-helper.ts` still reads pre-refactor internals:
- `appAny.colorControls`, `appAny.transformControl`, `appAny.histogram`, etc.
- direct viewer fields like `viewer.zoom`, `viewer.wipeState`, `viewer.cropState`

After `AppControlRegistry` extraction (`src/App.ts`), the live objects are under `appAny.controls.*` and many viewer states are accessible via getters/managers, not direct fields.

### Implementation scope
- Update `getColorState`, `getTransformState`, `getViewerState`, `getSessionState` in `src/test-helper.ts` to use current sources of truth:
  - `appAny.controls.colorControls.getAdjustments()`
  - `appAny.controls.transformControl.getTransform()`
  - `viewer.getTransform()`, `viewer.getWipeState()`, `viewer.getCropState()`, etc.
  - marks from current session APIs instead of stale `markedFrames` fallback.
- Remove reliance on private/stale properties where a public method exists.
- Fix stale scope/difference/crop/zoom reads that currently use deprecated direct fields:
  - `viewer.zoom`, `viewer.wipeState`, `viewer.cropState`, `viewer.differenceMatteState`
  - `appAny.histogram`, `appAny.waveform`, `appAny.vectorscope` instead of `appAny.controls.*`

### Unit tests to add/update
- New: `src/test-helper.test.ts`
- Cases:
  1. Reads color state from `controls.colorControls.getAdjustments()`.
  2. Reads transform state from `controls.transformControl.getTransform()`.
  3. Reads viewer zoom/pan from viewer transform getter path.
  4. Reads wipe/crop from viewer getter path.
  5. Marks/markers mapping returns current session data.

### E2E verification
- Re-run:
  - `e2e/color-controls.spec.ts`
  - `e2e/transform-controls.spec.ts`
  - `e2e/view-controls.spec.ts`
  - `e2e/playback-controls.spec.ts` (marks/in-out assertions)
  - `e2e/keyboard-shortcuts.spec.ts`
  - `e2e/user-flows.spec.ts`
- Expected outcome: state assertions stop failing due to false negatives.

---

## Task 2 (P0): Update E2E selectors/interactions to current UI controls
### Problem
Several tests target old UI structure (button-per-zoom, old LUT button text, ambiguous selectors), producing false failures.

### Root cause
UI evolved to dropdown and compact controls (`ZoomControl`, updated labels), but tests still use legacy selectors.

### Implementation scope
- Update selectors in:
  - `e2e/view-controls.spec.ts` (zoom button assumptions -> zoom dropdown actions)
  - `e2e/tab-navigation.spec.ts` (avoid strict-mode text collisions like `button:has-text("Fit")`)
  - `e2e/color-controls.spec.ts` (`Load .cube` -> current LUT load button label)
  - `e2e/transform-controls.spec.ts` and `e2e/crop.spec.ts` (disambiguate crop vs uncrop controls where multiple `OFF`/`Reset` buttons exist)
  - `e2e/keyboard-shortcuts.spec.ts` (replace outdated hardcoded key assumptions with current bindings)
  - `e2e/user-flows.spec.ts` (align keyboard-driven steps with current shortcuts and control structure)
  - `e2e/false-color.spec.ts` (replace stale control selector assumptions and avoid matching hidden luminance-visualization menu items)
  - `e2e/spotlight.spec.ts` (replace stale text/data-testid assumptions with current icon-button selector contract)
- Use stable selectors:
  - prefer `data-testid` and role-based selectors over text-only selectors.
  - avoid bare `button:has-text(...)` selectors when duplicate controls are expected.
  - when testing "outside click", compute a click target guaranteed outside floating panel bounds.

### Unit tests to add/update
- Add coverage for test IDs used in E2E:
  - `src/ui/components/ZoomControl.test.ts`
  - `src/ui/components/ColorControls.test.ts`
  - `src/ui/components/CropControl.test.ts`
  - `src/ui/components/FalseColorControl.test.ts`
  - `src/AppControlRegistry.test.ts` (spotlight and other icon-button test-id contracts)
- Ensure expected test IDs/labels are rendered and unique.

### E2E verification
- Re-run targeted specs listed above plus:
  - `e2e/crop.spec.ts`
  - `e2e/false-color.spec.ts`
  - `e2e/spotlight.spec.ts`
- Expected outcome: selector/strict-mode failures removed.

---

## Task 21 (P0): Stabilize E2E viewer screenshot helpers to target active viewer canvas
### Problem
Multiple E2E tests timeout while taking screenshots because helper code captures `page.locator('canvas').first()`, which can resolve to a hidden, detached, or non-viewer canvas.

### Root cause
- `e2e/fixtures.ts` uses generic first-canvas selection in:
  - `captureCanvasState`
  - `captureViewerScreenshot`
  - `captureASideScreenshot`
  - `captureBSideScreenshot`
  - `sampleCanvasPixels` / `getCanvasTransform` paths that also call `canvas.first()`
- The app renders multiple canvases (viewer layers, overlays, scopes), so first match is not stable.

### Implementation scope
- Add a stable test target for the main viewer render surface (for example a dedicated `data-testid` on viewer canvas/container).
- Update canvas/screenshot helpers in `e2e/fixtures.ts` to:
  1. target the explicit viewer canvas,
  2. assert attached + visible before capture,
  3. avoid detached-element races.
- Keep helper APIs unchanged for existing test call sites.

### Unit tests to add/update
- Add helper-level tests (for example `e2e/fixtures.viewer-capture.test.ts`):
  1. resolves viewer canvas target over unrelated canvases,
  2. handles temporary detachment/reattach safely,
  3. verifies all canvas state/screenshot helper entry points use the same stable target resolver.

### E2E verification
- Re-run screenshot-heavy specs:
  - `e2e/user-flows.spec.ts`
  - `e2e/difference-matte.spec.ts`
  - `e2e/color-controls.spec.ts`
  - `e2e/crop.spec.ts`
  - `e2e/false-color.spec.ts`
- Expected outcome: detached/hidden canvas screenshot timeouts are eliminated.

---

## Task 22 (P1): Centralize E2E shortcut presses on `DEFAULT_KEY_BINDINGS` to prevent drift
### Problem
Shortcut tests use hardcoded key strings that no longer match current bindings, producing false failures that look like control no-ops.

### Root cause
Keyboard combos are duplicated manually across specs instead of deriving from `src/utils/input/KeyBindings.ts`.

Observed drift examples:
- tests using `W` for wipe cycle (binding is `Shift+W`)
- tests using `K` for crop toggle (binding is `Shift+K`)
- tests using `L` for loop-mode cycle (binding is `Ctrl+L`)
- tests using `Shift+H` for flip-horizontal (binding is `Alt+H`)

### Implementation scope
- Add an E2E helper to press a shortcut by action id (for example `pressShortcut(page, 'timeline.cycleLoopMode')`).
- Centralize combo-to-Playwright string conversion from `KeyCombination`.
- Update keyboard-heavy specs (`keyboard-shortcuts`, `user-flows`, related suites) to use helper instead of hardcoded keys.

### Unit tests to add/update
- Add helper tests (for example `e2e/shortcut-helper.test.ts`):
  1. action id resolves to expected combo,
  2. modifier conversion to Playwright key string is correct.

### E2E verification
- Re-run:
  - `e2e/keyboard-shortcuts.spec.ts`
  - `e2e/user-flows.spec.ts`
- Expected outcome: outdated-key-assumption failures are removed; remaining failures represent real behavioral issues.

---

## Task 23 (P0): Remove direct private `app` access from E2E and route through stable test-helper API
### Problem
Many E2E specs bypass helper getters and call private internals like `window.__OPENRV_TEST__?.app?.histogram`, `app?.waveform`, `app?.falseColorControl`, etc. After control registry refactor these paths are stale or brittle, causing no-op test actions and false failures.

### Root cause
- E2E suites directly couple to private `App` shape instead of stable test API surface.
- `AppControlRegistry` refactor moved many controls under `app.controls.*`.

### Implementation scope
- Add explicit, stable mutation helpers to `src/test-helper.ts` for test-only control operations currently done via private `app` reach-ins (for example scope mode toggles, wipe setup, false-color preset, spotlight params).
- Update E2E suites to use helper API methods instead of `__OPENRV_TEST__.app.*` access.
- Restrict `__OPENRV_TEST__.app` usage to debugging only (or remove from tests entirely).
- Add a lint/check script for E2E that flags new direct `__OPENRV_TEST__.app.*` access.

### Unit tests to add/update
- Expand `src/test-helper.test.ts`:
  1. new helper mutators call the correct live control/viewer APIs,
  2. helper mutators remain functional after AppControlRegistry-style control indirection.
- Add static test/lint check for E2E files to fail on forbidden direct access patterns.

### E2E verification
- Re-run suites that currently use direct private access heavily:
  - `e2e/new-features.spec.ts`
  - `e2e/session-integration.spec.ts`
  - `e2e/histogram.spec.ts`
  - `e2e/waveform.spec.ts`
  - `e2e/vectorscope.spec.ts`
  - `e2e/false-color.spec.ts`
  - `e2e/zebra-stripes.spec.ts`
  - `e2e/spotlight.spec.ts`
  - `e2e/safe-areas.spec.ts`
  - `e2e/crop.spec.ts`
- Expected outcome: direct-access no-op failures are removed and specs use stable helper contracts.

---

## Task 3 (P0): Align keyboard shortcut tooltips with real keybindings
### Problem
Multiple controls show incorrect shortcut hints in tooltips, causing user-visible "no-op" confusion.

### Root cause
Tooltips in component constructors drifted from `DEFAULT_KEY_BINDINGS`.

### Known mismatches to fix
- `CompareControl`: tooltip says `W`, binding is `Shift+W` for wipe cycle.
- `CropControl`: tooltip says `K`, binding is `Shift+K`.
- `FilterControl`: tooltip says `G`, actual panel toggle is `Shift+Alt+E`.
- `TransformControl`: rotate right tooltip says `R`, binding is `Alt+R`.
- `TransformControl`: flip H says `H`, binding is `Alt+H`.
- `TransformControl`: flip V says `V`, binding is `Shift+V`.
- `ZoomControl`: tooltip says `0-4` presets, but only `0` is a zoom shortcut and `1-5` are tab switches.
- `VolumeControl`: tooltip says `M` toggles mute, but no mute shortcut is registered.

### Implementation scope
- Update titles in:
  - `src/ui/components/CompareControl.ts`
  - `src/ui/components/CropControl.ts`
  - `src/ui/components/FilterControl.ts`
  - `src/ui/components/TransformControl.ts`
- Add a shared helper for shortcut text to reduce future drift.

### Unit tests to add/update
- Add assertions for tooltip text in each affected component test file.
- Add one contract test in `src/utils/input/KeyBindings.test.ts` that verifies critical displayed shortcuts match binding config.

### E2E verification
- Extend `e2e/keyboard-shortcuts.spec.ts` to assert tooltip text and actual key behavior both match.

---

## Task 4 (P0): Switch network "Create Room" from simulation path to real manager path
### Problem
Creating a room uses a mock path in runtime wiring, so network control appears fake/non-functional.

### Root cause
`AppNetworkBridge` currently calls `simulateRoomCreated()` on create.

### Implementation scope
- In `src/AppNetworkBridge.ts`, replace create flow:
  - from `simulateRoomCreated()`
  - to `networkSyncManager.createRoom(userName)`
- Keep simulation only in tests/mocks, not runtime wiring.
- Ensure UI transitions rely on manager events (`roomCreated`, `connectionStateChanged`).

### Unit tests to add/update
- `src/AppNetworkBridge.test.ts`:
  1. `createRoom` event calls `networkSyncManager.createRoom`.
  2. Does not call `simulateRoomCreated` in production wiring.
  3. UI updates on real manager events.

### E2E verification
- Update/add in `e2e/network-sync.spec.ts`:
  - verify create room initiates connecting state and then connected state via mocked socket server.

---

## Task 5 (P1): Make context-dependent controls explicit (disabled + reason)
### Problem
Some actions are clickable but effectively do nothing when prerequisites are missing (for example no source loaded, no B source, no stereo mode).

### Root cause
Controls rely on runtime guards but do not communicate preconditions in UI.

### Implementation scope
- For key controls, add disabled state and tooltip/reason text when prerequisites are unmet:
  - compare/wipe and A/B controls
  - crop/transform actions without media
  - stereo per-eye controls when stereo is off
- Keep keyboard shortcuts no-op safe, but provide user feedback where appropriate.

### Unit tests to add/update
- `src/ui/components/CompareControl.test.ts`
- `src/ui/components/CropControl.test.ts`
- `src/ui/components/StereoEyeTransformControl.test.ts`
- Assert disabled state and explanatory text under unmet prerequisites.

### E2E verification
- Add scenarios in:
  - `e2e/ab-compare.spec.ts`
  - `e2e/crop.spec.ts`
  - `e2e/stereo-eye-transforms.spec.ts`
- Verify no silent no-op: either disabled UI or visible feedback.

---

## Task 6 (P1): Add visible toolbar entry points for snapshots and playlist
### Problem
Snapshots and Playlist are mostly keyboard-discoverable, which looks like missing controls in normal UI flow.

### Root cause
No obvious toolbar buttons in current tab/header surfaces for these panels.

### Implementation scope
- Add Snapshot and Playlist buttons in context toolbar/header.
- Wire to existing actions (`panel.snapshots`, `panel.playlist`) and existing panel managers.

### Unit tests to add/update
- `src/AppControlRegistry.test.ts` and relevant panel tests:
  - buttons render
  - click emits/toggles expected panels

### E2E verification
- `e2e/snapshots.spec.ts`
- `e2e/playlist.spec.ts`
- Add checks for click-based panel open/close without shortcut usage.

---

## Task 7 (P1): Expand ESC close behavior to all floating panels/dropdowns
### Problem
ESC currently closes only a subset of UI, leaving floating dropdowns/panels open and creating inconsistency.

### Root cause
`panel.close` action in `App.getActionHandlers()` manually handles only selected controls.
It also documents fullscreen exit precedence but does not actually route ESC through fullscreen exit logic.

### Implementation scope
- Introduce a centralized "close all transient UI" method:
  - color panel
  - crop panel
  - stereo eye transform panel
  - compare dropdown
  - zoom dropdown
  - network panel
  - other floating overlays with open state
- Call it from ESC action.
- Ensure ESC exits fullscreen mode when fullscreen is active (after presentation-mode exit precedence), matching documented behavior.

### Unit tests to add/update
- Add/extend tests in:
  - `src/AppKeyboardHandler.test.ts`
  - component tests for dropdown close APIs
- Validate ESC closes all open transient elements.
- Add lifecycle assertion that ESC exits fullscreen mode when active and presentation mode is not active.

### E2E verification
- Add flow to `e2e/user-flows.spec.ts` or `e2e/keyboard-shortcuts.spec.ts`:
  - open multiple floating panels, press ESC, verify all closed.
  - enable fullscreen (`F11`), press ESC, verify fullscreen exits.

---

## Task 8 (P2): Add control contract tests for wiring integrity
### Problem
Refactors can silently break control-to-viewer/session wiring without obvious compile errors.

### Root cause
Current tests validate components in isolation but not full wiring contracts per action.

### Implementation scope
- Add integration-style unit tests for wiring modules:
  - `AppViewWiring`
  - `AppColorWiring`
  - `AppEffectsWiring`
  - `AppTransformWiring`
- For each action, assert event -> viewer/session call -> persistence sync.

### Unit tests to add/update
- New test cases in existing wiring test files.
- Minimum contract examples:
  - zoom change triggers `smoothSetZoom`/`smoothFitToWindow`
  - color change triggers `setColorAdjustments` and scope scheduling
  - transform change triggers `setTransform` and history record
  - compare/wipe change triggers `setWipeState`

### E2E verification
- Keep focused smoke suite as contract run:
  - `view-controls`, `color-controls`, `effects-controls`, `transform-controls`
- Add CI job for this subset before full E2E run.

---

## Task 9 (P2): Improve context toolbar overflow/visibility feedback
### Problem
Large control groups can overflow horizontally and appear "missing" on narrower viewports.

### Root cause
Toolbar uses horizontal overflow but lacks explicit affordances and prioritization.

### Implementation scope
- Add visible overflow affordances (fade/scroll hint or arrow controls).
- Ensure critical controls remain accessible on smaller widths.

### Unit tests to add/update
- `src/ui/components/layout/ContextToolbar.test.ts`
- Assertions for overflow affordance rendering and keyboard accessibility.

### E2E verification
- Add responsive checks in `e2e/tab-navigation.spec.ts` for narrow viewport sizes.

---

## Task 10 (P0): Remove default keyboard binding collisions that silently override actions
### Problem
Multiple documented shortcuts are registered to the same key combo, so only the last registered action executes and the other action becomes unreachable.

### Root cause
`KeyboardManager` stores bindings in `Map<string, KeyBinding>`, and `register()` overwrites on identical combo IDs:
- `src/utils/input/KeyboardManager.ts` (`this.bindings.set(id, ...)`)

Conflicts in `DEFAULT_KEY_BINDINGS` include:
- `Shift+D`: `view.toggleDifferenceMatte` vs `display.cycleProfile`
- `Shift+R`: `transform.rotateLeft` vs `channel.red`
- `Shift+B`: `channel.blue` vs `view.cycleBackgroundPattern`
- `Shift+N`: `channel.none` vs `network.togglePanel`

### Implementation scope
- Resolve collisions by assigning unique defaults for conflicting actions.
- Keep explicitly intentional aliases only where behavior is identical.
- Add startup-time conflict detection (warn or throw in dev/test).
- Add a binding policy doc block in `KeyBindings.ts` defining allowed alias cases.

### Unit tests to add/update
- `src/utils/input/KeyBindings.test.ts`:
  1. Fail if non-aliased actions share the same combo.
  2. Allow only a small explicit alias allowlist.
- `src/AppKeyboardHandler.test.ts`:
  1. Verify both actions in each formerly-colliding pair are independently triggerable.

### E2E verification
- Add/update `e2e/keyboard-shortcuts.spec.ts`:
  1. Trigger each previously colliding action by keyboard and assert effect occurs.
  2. Verify no action is shadowed by another shortcut.
- Re-run `e2e/difference-matte.spec.ts` to confirm `Shift+D` reliably toggles difference matte (no longer shadowed by display-profile cycling).

---

## Task 11 (P0): Wire missing `channel.grayscale` action handler
### Problem
`channel.grayscale` is declared in default key bindings but has no action handler, so shortcut press is a no-op.

### Root cause
- Binding exists in `src/utils/input/KeyBindings.ts` (`channel.grayscale`).
- `App.getActionHandlers()` in `src/App.ts` does not define `channel.grayscale`.

### Implementation scope
- Add `channel.grayscale` handler in `App.getActionHandlers()`:
  - map to luminance/grayscale channel behavior (same behavior as `channel.luminance` unless product decides otherwise).
- Ensure this action appears in shortcuts dialog and custom binding flows as an active action.

### Unit tests to add/update
- New/updated tests in `src/AppKeyboardHandler.test.ts`:
  1. Confirm `channel.grayscale` gets registered.
  2. Confirm handler calls channel select luminance/grayscale path.
- Update `src/utils/input/KeyBindings.test.ts`:
  1. Assert every `DEFAULT_KEY_BINDINGS` action has a corresponding App action handler (contract test).

### E2E verification
- Add scenario in `e2e/view-controls.spec.ts` or `e2e/keyboard-shortcuts.spec.ts`:
  1. Press `Shift+Y` and verify channel changes to luminance/grayscale mode.

---

## Task 12 (P1): Fix custom key binding no-op for delegated paint shortcuts
### Problem
Custom bindings for `paint.line`, `paint.rectangle`, and `paint.ellipse` can be saved in UI but never execute.

### Root cause
`AppKeyboardHandler.registerKeyboardShortcuts()` unconditionally skips these actions:
- `paint.line`
- `paint.rectangle`
- `paint.ellipse`

This skip happens even when user remaps them to non-conflicting combos.

### Implementation scope
- Make skip logic conditional:
  - If effective combo is still conflicting default (`L`, `R`, `O`), keep delegated behavior.
  - If user sets a non-conflicting combo, register direct handler normally.
- Add UI warning when user assigns a conflicting combo that will delegate instead of direct register.

### Unit tests to add/update
- `src/AppKeyboardHandler.test.ts`:
  1. Default combos use delegated behavior.
  2. Custom non-conflicting combo for each paint action registers and executes direct handler.
  3. Conflicting custom combos surface warning/expected fallback.
- `src/utils/input/CustomKeyBindingsManager.test.ts`:
  1. Ensure effective combos propagate and refresh registration.

### E2E verification
- Add flow in `e2e/custom-keybindings.spec.ts`:
  1. Rebind `paint.line` to a unique key.
  2. Trigger key in Annotate tab and confirm tool switches to line.
  3. Repeat for rectangle and ellipse.

---

## Task 13 (P1): Fix global document click listener leaks in control dispose paths
### Problem
Several controls add anonymous `document.click` handlers and never remove them, causing leaked listeners and duplicate behavior after remount/reinit.

### Root cause
Anonymous listeners are attached and cannot be removed later:
- `src/ui/components/ColorControls.ts`
- `src/ui/components/FilterControl.ts`
- `src/ui/components/CDLControl.ts`
- `src/ui/components/LensControl.ts`
- `src/ui/components/ExportControl.ts`

Dispose methods are empty/incomplete in these controls.

### Implementation scope
- Replace anonymous listeners with bound class properties.
- Remove listener in each `dispose()`.
- Add a shared disposable-listener utility for controls that bind global events.

### Unit tests to add/update
- Add/update per-control tests:
  - `src/ui/components/ColorControls.test.ts`
  - `src/ui/components/FilterControl.test.ts`
  - `src/ui/components/CDLControl.test.ts`
  - `src/ui/components/LensControl.test.ts`
  - `src/ui/components/ExportControl.test.ts`
- Cases:
  1. `dispose()` removes document listener.
  2. Remounting control does not multiply outside-click side effects.

### E2E verification
- Add regression flow in `e2e/user-flows.spec.ts`:
  1. Open/close affected controls repeatedly.
  2. Navigate remount path.
  3. Verify each outside click closes once (no duplicate execution artifacts).

---

## Task 14 (P1): Track and cleanup all `AppNetworkBridge` subscriptions
### Problem
`AppNetworkBridge.dispose()` unsubscribes only a subset of listeners, leaving control/manager listeners active after dispose.

### Root cause
Only session listeners are pushed into `this.unsubscribers`; most `networkControl.on(...)` and `networkSyncManager.on(...)` returns are ignored.

### Implementation scope
- Capture unsubscribe callbacks from all `.on(...)` calls in `AppNetworkBridge.setup()`.
- Push every unsubscribe into `this.unsubscribers`.
- Ensure `dispose()` is idempotent and safe on repeated calls.

### Unit tests to add/update
- `src/AppNetworkBridge.test.ts`:
  1. `setup()` tracks unsubs for all control + manager + session subscriptions.
  2. `dispose()` removes all listeners.
  3. Re-`setup()` after `dispose()` does not duplicate event responses.

### E2E verification
- Add/update `e2e/network-sync.spec.ts`:
  1. Open app, connect/disconnect, remount path (or app recreation fixture), reconnect.
  2. Assert no duplicate room/user/state updates fire on single event.

---

## Task 15 (P1): Unsubscribe viewer-overlay listeners in overlay-bound controls
### Problem
Several controls subscribe to long-lived viewer overlay/event objects and never unsubscribe, which can retain disposed controls and duplicate UI updates after re-init.

### Root cause
Controls attach `.on('stateChanged', ...)` listeners to external overlay instances but `dispose()` only removes DOM listeners.

Confirmed examples:
- `FalseColorControl`:
  - subscribe: `src/ui/components/FalseColorControl.ts` (`stateChanged` listeners)
  - dispose missing unsubscribe: `src/ui/components/FalseColorControl.ts`
- `HSLQualifierControl`:
  - multiple `hslQualifier.on('stateChanged', ...)` listeners
  - dispose missing unsubscribe: `src/ui/components/HSLQualifierControl.ts`
- `LuminanceVisualizationControl`:
  - control state listener + badge state listener
  - dispose missing unsubscribe: `src/ui/components/LuminanceVisualizationControl.ts`
- `SafeAreasControl`:
  - `overlay.on('stateChanged', ...)` listener
  - dispose missing unsubscribe: `src/ui/components/SafeAreasControl.ts`
- `ZebraControl`:
  - `zebraStripes.on('stateChanged', ...)` listener
  - dispose missing unsubscribe: `src/ui/components/ZebraControl.ts`

### Implementation scope
- Store unsubscribe callbacks returned by `.on(...)` for all external overlay listeners.
- Call all unsubs during `dispose()`.
- Add a small helper pattern (array of teardown callbacks) for consistent lifecycle handling.

### Unit tests to add/update
- Update:
  - `src/ui/components/FalseColorControl.test.ts`
  - `src/ui/components/HSLQualifierControl.test.ts`
  - `src/ui/components/LuminanceVisualizationControl.test.ts`
  - `src/ui/components/SafeAreasControl.test.ts`
  - `src/ui/components/ZebraControl.test.ts`
- Cases:
  1. `dispose()` removes overlay subscriptions.
  2. Re-create control after dispose does not produce duplicate state update callbacks.

### E2E verification
- Add remount/regression flow in `e2e/view-controls.spec.ts`:
  1. Toggle affected controls.
  2. Recreate app fixture.
  3. Toggle again and assert single effect per action (no duplicated updates).

---

## Task 16 (P1): Complete teardown path for overlays/session to prevent stale UI and resource leaks
### Problem
Dispose flow leaves some long-lived resources/listeners active, causing stale overlays or retained event callbacks after app teardown.

### Root cause
- `OverlayManager.dispose()` only disposes a subset of owned overlays (`clipping`, `luminance`, `falseColor`, `zebra`, `spotlight`), but omits:
  - `pixelProbe`
  - `timecodeOverlay`
  - `safeAreasOverlay`
  - `matteOverlay`
- `TimecodeOverlay` subscribes to session events and does not explicitly unsubscribe.
- `App.dispose()` never calls `session.dispose()`.

### Implementation scope
- Expand `OverlayManager.dispose()` to dispose all owned overlay instances.
- Ensure `TimecodeOverlay` stores unsubscribe callbacks and removes them in `dispose()`.
- Call `this.session.dispose()` in `App.dispose()` after dependent components are torn down.
- Add teardown safety for repeated `dispose()` calls.

### Unit tests to add/update
- `src/ui/components/OverlayManager.test.ts`:
  1. `dispose()` calls dispose on every owned overlay/control object.
- `src/ui/components/TimecodeOverlay.test.ts`:
  1. Session listeners are unsubscribed on dispose.
- `src/App.test.ts` or dedicated lifecycle test:
  1. `App.dispose()` calls `session.dispose()`.

### E2E verification
- Add teardown/re-init scenario in `e2e/user-flows.spec.ts`:
  1. Enable timecode + pixel probe.
  2. Teardown/recreate app fixture.
  3. Verify no stale previous overlay remains and interactions work once.

---

## Task 17 (P1): Add custom keybinding conflict detection to prevent user-created no-op shortcuts
### Problem
Custom keybinding UI allows assigning duplicate combos across actions, which silently overrides one action and creates no-op behavior.

### Root cause
- `CustomKeyBindingsManager.setCustomBinding()` stores binding without conflict validation.
- Registration still uses `KeyboardManager` single-binding map semantics.

### Implementation scope
- Add conflict checks in `CustomKeyBindingsManager.setCustomBinding()`:
  - reject or require explicit replacement when combo already used by another action.
- Surface clear UI feedback in `AppKeyboardHandler.promptForKeyBinding()` for conflicts.
- Add programmatic API to query current combo owner for diagnostics.

### Unit tests to add/update
- `src/utils/input/CustomKeyBindingsManager.test.ts`:
  1. Setting combo used by another action is rejected (or replaces deterministically per chosen rule).
  2. Non-conflicting combo persists successfully.
- `src/AppKeyboardHandler.test.ts`:
  1. Conflict prompt/error is shown and binding is not silently saved.

### E2E verification
- Add/update `e2e/custom-keybindings.spec.ts`:
  1. Attempt to assign a duplicate combo to a second action.
  2. Verify conflict message appears and original action still works.

---

## Task 18 (P1): Remove orphaned body-mounted floating panels/dropdowns in dispose paths
### Problem
Several controls append floating UI to `document.body`, but disposal does not remove those nodes. After remount/re-init this can leave stale hidden nodes and duplicate close/position behavior.

### Root cause
Controls mount panel/dropdown elements to `document.body` on open, but `dispose()` is empty/incomplete:
- `src/ui/components/ColorControls.ts` (`panel`)
- `src/ui/components/FilterControl.ts` (`panel`)
- `src/ui/components/CDLControl.ts` (`panel`)
- `src/ui/components/LensControl.ts` (`panel`)
- `src/ui/components/ExportControl.ts` (`dropdown`)

### Implementation scope
- In each affected control, update `dispose()` to:
  1. Close/hide panel state.
  2. Remove body-mounted panel/dropdown if present.
  3. Be idempotent (safe on repeated `dispose()` calls).
- Keep behavior consistent with controls that already cleanup body-mounted nodes (for example `CropControl`, `StackControl`, `NetworkControl`).

### Unit tests to add/update
- Update:
  - `src/ui/components/ColorControls.test.ts`
  - `src/ui/components/FilterControl.test.ts`
  - `src/ui/components/CDLControl.test.ts`
  - `src/ui/components/LensControl.test.ts`
  - `src/ui/components/ExportControl.test.ts`
- Cases:
  1. `dispose()` removes body-mounted panel/dropdown node.
  2. Double `dispose()` does not throw.
  3. Recreate control after dispose results in exactly one panel/dropdown node in `document.body`.

### E2E verification
- Add regression flow in `e2e/user-flows.spec.ts`:
  1. Open each affected floating control.
  2. Trigger app remount/re-init fixture.
  3. Re-open controls and assert no duplicate floating nodes and normal outside-click close behavior.

---

## Task 19 (P1): Track and teardown `AppControlRegistry` UI wiring subscriptions
### Problem
`AppControlRegistry.setupTabContents()` registers many long-lived `.on(...)` listeners and DOM side-effects but does not teardown them in `dispose()`, risking duplicate callbacks and stale references across app re-init paths.

### Root cause
- Unsubscribe callbacks returned by `.on(...)` are not stored.
- `setupTabContents()` creates overlay/button synchronization listeners and UI badge elements without central lifecycle tracking.

Examples in `src/AppControlRegistry.ts` include listeners for:
- `viewer.getFalseColor()`
- `viewer.getPixelProbe()`
- `viewer.getSpotlightOverlay()`
- `infoPanel`, `histogram`, `waveform`, `vectorscope`
- `curvesControl`, `colorWheels`, `historyPanel`, `markerListPanel`

### Implementation scope
- Add a registry-level teardown list (for example `this.unsubscribers: Array<() => void>`).
- Capture and store unsubscribe callbacks for every `.on(...)` registration created in `setupTabContents()`.
- Run and clear all registry-level unsubs in `dispose()` before child control disposal.
- Track and remove transient elements created in setup (for example luminance badge node) during dispose.

### Unit tests to add/update
- Update `src/AppControlRegistry.test.ts`:
  1. `setupTabContents()` records unsubscribe callbacks for all registry-level listeners.
  2. `dispose()` executes all unsubscribe callbacks exactly once.
  3. Re-setup after dispose does not duplicate event-driven UI updates.
  4. Luminance badge node is removed on dispose.

### E2E verification
- Add remount regression flow in `e2e/user-flows.spec.ts`:
  1. Toggle probe/spotlight/info/history/markers controls.
  2. Recreate app fixture.
  3. Re-toggle and assert single state/UI update per action (no duplicated reactions).

---

## Task 20 (P1): Fix HSL eyedropper deactivation path to cancel pending viewer click handler
### Problem
If HSL eyedropper is activated and then deactivated before clicking the viewer, the pending one-shot click listener remains active. A later viewer click can unexpectedly pick a color, and repeated activate/deactivate cycles can queue multiple picks.

### Root cause
In `AppControlRegistry` eyedropper callback wiring:
- Active path registers `viewerContainer.addEventListener('click', clickHandler, { once: true })`.
- Inactive path only resets cursor and does not remove a previously registered pending handler.

### Implementation scope
- Store the pending eyedropper click handler reference in registry-level state.
- On eyedropper deactivation and on `dispose()`, remove pending click listener if present.
- Prevent duplicate pending registrations by removing existing pending handler before adding a new one.
- Keep cursor state and eyedropper active state synchronized in all paths.

### Unit tests to add/update
- Update `src/AppControlRegistry.test.ts` (or dedicated HSL wiring test):
  1. Activate then deactivate without click; subsequent viewer click does not call `pickColor`.
  2. Repeated activate/deactivate cycles keep only one pending click listener.
  3. Dispose while eyedropper is active removes pending listener and cursor override.

### E2E verification
- Add scenario in `e2e/color-controls.spec.ts` (or `e2e/view-controls.spec.ts`):
  1. Open HSL qualifier and activate eyedropper.
  2. Deactivate without picking, click viewer, verify no picker update occurs.
  3. Activate once, click viewer once, verify exactly one color-pick state update.

---

## Task 24 (P1): Replace theme-coupled E2E style assertions with semantic state assertions
### Problem
Some E2E tests fail when UI theme tokens change even though control behavior is correct.

### Root cause
Specs assert exact RGB channel values from computed styles (for example compare A/B active border/background), which is brittle to design-token updates.

### Implementation scope
- In control components (starting with `CompareControl`), expose semantic state attributes for automation:
  - `aria-pressed` / `aria-disabled` where applicable,
  - optional `data-state="active|inactive"` for non-native toggle rows.
- Replace color-channel assertions in E2E with semantic state assertions.
- Keep one visual regression check per control area (snapshot-based), but do not couple behavior assertions to exact color literals.

### Unit tests to add/update
- Update `src/ui/components/CompareControl.test.ts`:
  1. A/B active state updates semantic attributes correctly.
  2. Disabled B/toggle state updates semantic attributes correctly when A/B is unavailable.
- Add a small contract test in `src/ui/components/layout/ContextToolbar.test.ts` for icon-toggle semantic attributes if needed by other controls.

### E2E verification
- Re-run:
  - `e2e/ab-compare.spec.ts`
  - `e2e/keyboard-shortcuts.spec.ts` (for compare shortcut effects)
- Expected outcome: style-token-only regressions stop producing false behavioral failures.

---

## Task 25 (P0): Add fail-fast diagnostics to `test-helper` to prevent silent false negatives
### Problem
When `test-helper` paths drift, getters return default values (`false`, `null`, empty state) instead of surfacing a broken adapter, causing controls to look no-op in E2E.

### Root cause
`src/test-helper.ts` uses permissive fallback logic (`createStateGetter` and direct `??` defaults) that masks missing components and stale object paths.

### Implementation scope
- Add a strict diagnostics mode in `test-helper`:
  - per-getter missing-path detection,
  - structured diagnostics (`missingPaths`, `lastErrors`),
  - optional throw-on-missing behavior for CI.
- Default E2E CI runs to strict mode so stale adapters fail fast.
- Keep a compatibility mode only for local debugging where explicit.

### Unit tests to add/update
- Expand `src/test-helper.test.ts`:
  1. strict mode throws (or flags) when getter target path is missing,
  2. compatibility mode returns defaults without throwing,
  3. diagnostics API reports exact missing getter paths.

### E2E verification
- Add/update a smoke check (for example in `e2e/state-verification.spec.ts`):
  1. enable strict helper mode,
  2. assert no missing-path diagnostics after app init and media load.
- Re-run core control specs relying on helper state reads (`view-controls`, `color-controls`, `transform-controls`, `crop`).

---

## Task 26 (P1): Repair E2E suite topology and verification references
### Problem
Backlog and verification commands reference suites that do not exist (`e2e/custom-keybindings.spec.ts`, `e2e/network-sync.spec.ts`), leaving critical control areas effectively unverified.

### Root cause
Suite rename/removal drifted from documentation and command recipes.

### Implementation scope
- Create missing suites or update verification references to the canonical suite files.
- Add explicit coverage for:
  - custom keybinding flows (save/rebind/execute),
  - network sync room create/join/disconnect lifecycle.
- Add a repo check that fails CI when referenced E2E spec paths do not exist.

### Unit tests to add/update
- Add a small verification-script test (for example `scripts/validate-e2e-targets.test.cjs`):
  1. validates referenced spec paths in `BUGFIX.md` execution commands and CI scripts,
  2. fails on missing files.

### E2E verification
- Run the actual suite set after alignment:
  - custom keybinding suite (new or canonical path),
  - network sync suite (new or canonical path),
  - `e2e/keyboard-shortcuts.spec.ts`
  - `e2e/fullscreen-presentation.spec.ts` (for shared shortcut/event infrastructure sanity).
- Expected outcome: verification commands are executable and cover intended control domains.

---

## Execution Order
1. Task 1
2. Task 2
3. Task 21
4. Task 22
5. Task 23
6. Task 25
7. Task 26
8. Task 24
9. Task 3
10. Task 4
11. Re-run focused E2E suite and re-triage residual fails
12. Task 10
13. Task 11
14. Tasks 12-14
15. Tasks 15-20
16. Tasks 5-9 (non-blocking improvements can continue in parallel where safe)

## Verification Gate
After each task:
1. Run affected unit tests.
2. Run impacted E2E specs only.
3. Run focused control smoke suite.
4. Update this file with status (`todo`, `in_progress`, `done`) and links to PR/commit.
