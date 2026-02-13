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

## Task 28 (P1): Stabilize crop interaction tests around explicit crop controls and safe outside-click targets
### Problem
Crop E2E previously failed from ambiguous panel selectors (`OFF`/`Reset`) after uncrop controls were added, plus outside-click actions that hit panel overlays instead of viewer canvas.

### Root cause
- `e2e/crop.spec.ts` used broad text selectors:
  - `button:has-text("OFF")`
  - `button:has-text("Reset")`
- Tests clicked `canvas` at fixed top-left coordinates that can be overlapped by floating panels.

### Implementation scope
- Use role+name selectors scoped to crop controls:
  - crop toggle: `getByRole('switch', { name: 'Enable Crop' })`
  - crop reset: `getByRole('button', { name: 'Reset Crop' })`
- Route canvas interactions through shared stable helper (`getCanvas`) instead of `canvas.first()`.
- Use deterministic outside-click target selection (canvas bounds bottom-right) or `Esc` where panel-close behavior is under test.
- Align zoom interaction in crop integration tests to current zoom dropdown test IDs.

### Unit tests to add/update
- Update `src/ui/components/CropControl.test.ts`:
  1. crop toggle and reset controls retain unique accessible names with uncrop section present.
  2. panel close/open flow does not depend on ambiguous control text.

### E2E verification
- Re-run full `e2e/crop.spec.ts`.
- Expected outcome: selector strict-mode failures and panel-overlay click timeouts are eliminated.

---

## Task 29 (P1): Validate false-color preset changes with deterministic LUT signatures
### Problem
Visual diff assertion for false-color preset switching can fail on content-dependent frames even when preset state changed correctly.

### Root cause
`FC-E012` compared full-canvas screenshots for preset differences. Depending on source luminance distribution, two presets can produce near-identical rendered output for sampled frames.

### Implementation scope
- Add deterministic preset-verification helper in E2E:
  - read false-color LUT signature from `viewer.getFalseColor().getColorLUT()`.
- Assert LUT signature changes when preset changes (`standard` -> `arri`) in preset coverage.
- Keep state assertions (`getFalseColorState().preset`) as primary behavior contract.

### Unit tests to add/update
- Add/update `src/ui/components/FalseColor.test.ts`:
  1. `setPreset()` mutates LUT data for different presets.
  2. `getState().preset` and LUT snapshot stay in sync.

### E2E verification
- Re-run `e2e/false-color.spec.ts` (`FC-E010`, `FC-E011`, `FC-E012`, `FC-E031`).
- Expected outcome: preset tests are deterministic and no longer content-fragile.

---

## Task 31 (P1): Make tab zoom control E2E assertions animation-aware and dropdown-native
### Problem
Tab navigation zoom tests were using legacy button selectors and hardcoded zoom values, causing strict-mode selector failures and false negatives on animated zoom transitions.

### Root cause
- Legacy selectors (`button:has-text("Fit")`, `button:has-text("200%")`) no longer match the `ZoomControl` dropdown architecture.
- Zoom transitions are animated and media-dependent, so immediate equality assertions (`zoom === 2`) can fail.

### Implementation scope
- In `e2e/tab-navigation.spec.ts`:
  - use `[data-testid="zoom-control-button"]` and `[data-testid="zoom-dropdown"] button[data-value=...]`.
  - wait for zoom to settle with `expect.poll(...)` before persistence assertions.
  - assert relative zoom behavior (zoomed-in value and fit decrease) where exact equality is not guaranteed.

### Unit tests to add/update
- Update `src/ui/components/ZoomControl.test.ts`:
  1. dropdown options expose stable data values (`fit`, `0.25`, `0.5`, `1`, `2`, `4`),
  2. selecting dropdown items updates emitted zoom value consistently.

### E2E verification
- Re-run:
  - `e2e/tab-navigation.spec.ts`
  - `e2e/view-controls.spec.ts`
  - `e2e/dropdown-menu.spec.ts` (zoom menu interaction sanity)
- Expected outcome: no strict-mode selector collisions and no timing-flaky zoom persistence failures.
