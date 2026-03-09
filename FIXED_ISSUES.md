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
