# Phase 3: Automated Screenshot Generation Using Playwright

## Overview

Build a Playwright-based screenshot pipeline that captures documentation-quality screenshots of OpenRV Web's UI in various states. The system reuses the existing Playwright infrastructure (`playwright.config.ts`, `e2e/fixtures.ts` helpers).

**Key codebase facts:**
- Existing helpers: `loadVideoFile`, `loadTwoVideoFiles`, `loadRvSession`, `waitForTestHelper`, `waitForMediaLoaded`, `waitForFrame`, `captureViewerScreenshot`
- State accessors: `getSessionState`, `getViewerState`, `getColorState`, `getFalseColorState`, `getToneMappingState`, `getZebraStripesState`, `getSafeAreasState`, `getPixelProbeState`
- Test helper bridge: `window.__OPENRV_TEST__` with read and mutation APIs
- Tab IDs: `view`, `color`, `effects`, `transform`, `annotate`, `qc`
- Sample files: `sample/*.mp4`, `sample/test_hdr.exr`, `sample/test_image.png`, `sample/test_session.rv`, `sample/test_lut.cube`, `sample/sequence/`

---

## 3.1 Playwright Screenshot Infrastructure

### Task 3.1.1: Add `screenshots` project to `playwright.config.ts`

- **Time estimate:** 15min
- **Dependencies:** None
- **Description:** Add new project entry:
  ```ts
  {
    name: 'screenshots',
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1440, height: 900 },
      colorScheme: 'dark',
    },
    testDir: './e2e/screenshots',
    testMatch: '*.screenshot.ts',
    retries: 0,
  }
  ```
- **Acceptance criteria:** `npx playwright test --project=screenshots --list` shows zero tests

### Task 3.1.2: Create `e2e/screenshots/screenshot-helpers.ts`

- **Time estimate:** 30min
- **Dependencies:** None
- **Description:** Helper module with:
  - `waitForCanvasStable(page, timeout)` -- waits for WebGL canvas to stop changing
  - `setDocViewport(page, width, height)` -- set consistent viewport
  - `initApp(page)` -- navigate, wait for `#app`, wait for test helper
  - `initWithVideo(page)` -- init + load sample video
  - `loadExrFile(page, path)` -- load EXR via file input (note: `loadExrFile` already exists in `e2e/fixtures.ts` and should be imported directly rather than reimplemented)
  - `takeDocScreenshot(page, name, options?)` -- save to `docs/assets/screenshots/<name>.png`
  - `switchTab(page, tabId)` -- click tab button by `data-tab-id`
- **Acceptance criteria:** TypeScript compiles without errors

### Task 3.1.3: Create output directory

- **Time estimate:** 5min
- **Dependencies:** None
- **Description:** Create `docs/assets/screenshots/.gitkeep`
- **Acceptance criteria:** Directory exists in repo

### Task 3.1.4: Add npm scripts

- **Time estimate:** 5min
- **Dependencies:** Task 3.1.1
- **Description:** Add to `package.json`:
  ```json
  "screenshots": "playwright test --project=screenshots",
  "screenshots:update": "playwright test --project=screenshots --update-snapshots"
  ```
- **Acceptance criteria:** `pnpm screenshots --list` runs without error

---

## 3.2 Core UI Screenshots (10 tasks)

All specs in `e2e/screenshots/core-ui.screenshot.ts`.

### Task 3.2.1: Screenshot 01 -- Empty app state
- **Time estimate:** 15min
- **Media:** None
- **Actions:** `initApp(page)` -> `takeDocScreenshot(page, '01-empty-app')`
- **Output:** `docs/assets/screenshots/01-empty-app.png`
- **Verification:** Header bar, tab bar, empty canvas, timeline visible

### Task 3.2.2: Screenshot 02 -- Video loaded (full UI)
- **Time estimate:** 15min
- **Media:** `sample/*.mp4`
- **Actions:** `initWithVideo(page)` -> `takeDocScreenshot(page, '02-video-loaded')`
- **Output:** `docs/assets/screenshots/02-video-loaded.png`
- **Verification:** Canvas shows video frame content (not black)

### Task 3.2.3: Screenshot 03 -- Header bar close-up
- **Time estimate:** 15min
- **Media:** Sample video
- **Actions:** Capture with clip region of `.header-bar` bounding box
- **Output:** `docs/assets/screenshots/03-header-bar.png`
- **Verification:** Cropped to show playback controls, open button, volume control

### Task 3.2.4: Screenshot 04 -- View tab toolbar
- **Time estimate:** 10min
- **Media:** Sample video
- **Actions:** `switchTab(page, 'view')` -> full screenshot
- **Output:** `docs/assets/screenshots/04-tab-view.png`

### Task 3.2.5: Screenshot 05 -- Color tab toolbar
- **Time estimate:** 10min
- **Media:** Sample video
- **Actions:** `switchTab(page, 'color')` -> full screenshot
- **Output:** `docs/assets/screenshots/05-tab-color.png`

### Task 3.2.6: Screenshot 06 -- Effects tab toolbar
- **Time estimate:** 10min
- **Media:** Sample video
- **Actions:** `switchTab(page, 'effects')` -> full screenshot
- **Output:** `docs/assets/screenshots/06-tab-effects.png`

### Task 3.2.7: Screenshot 07 -- Transform tab toolbar
- **Time estimate:** 10min
- **Media:** Sample video
- **Actions:** `switchTab(page, 'transform')` -> full screenshot
- **Output:** `docs/assets/screenshots/07-tab-transform.png`

### Task 3.2.8: Screenshot 08 -- Annotate tab toolbar
- **Time estimate:** 10min
- **Media:** Sample video
- **Actions:** `switchTab(page, 'annotate')` -> full screenshot
- **Output:** `docs/assets/screenshots/08-tab-annotate.png`

### Task 3.2.9: Screenshot 09 -- Color controls panel expanded
- **Time estimate:** 15min
- **Media:** Sample video
- **Actions:** Switch to color tab -> press `c` -> wait for panel -> screenshot
- **Note:** Verify that the `c` shortcut for the color panel is correct by checking the keybinding configuration in the codebase before implementation.
- **Output:** `docs/assets/screenshots/09-color-panel.png`
- **Verification:** Color panel with sliders for Exposure, Gamma, Saturation, Contrast, etc.

### Task 3.2.10: Screenshot 10 -- Timeline with markers
- **Time estimate:** 20min
- **Media:** Sample video
- **Actions:** Add markers programmatically via `__OPENRV_TEST__.setMarker(frame, note, color)`, clip to timeline region
- **Output:** `docs/assets/screenshots/10-timeline-markers.png`
- **Verification:** Timeline with colored marker indicators

---

## 3.3 Scope/Analysis Screenshots (7 tasks)

All specs in `e2e/screenshots/scopes.screenshot.ts`.

### Task 3.3.1: Screenshot 11 -- Histogram RGB
- **Time estimate:** 10min
- **Actions:** Press `h` -> verify histogram visible -> screenshot
- **Output:** `docs/assets/screenshots/11-histogram-rgb.png`

### Task 3.3.2: Screenshot 12 -- Histogram luminance
- **Time estimate:** 10min
- **Actions:** Press `h` -> click mode button to switch to luminance -> screenshot
- **Output:** `docs/assets/screenshots/12-histogram-luminance.png`

### Task 3.3.3: Screenshot 13 -- Waveform
- **Time estimate:** 10min
- **Actions:** Press `w` -> screenshot
- **Output:** `docs/assets/screenshots/13-waveform.png`

### Task 3.3.4: Screenshot 14 -- Vectorscope
- **Time estimate:** 10min
- **Actions:** Press `v` or use scopes dropdown (note: `toggleVectorscope` does not exist as a test helper API) -> screenshot
- **Output:** `docs/assets/screenshots/14-vectorscope.png`

### Task 3.3.5: Screenshot 15 -- Parade scope
- **Time estimate:** 10min
- **Actions:** Press `w` -> cycle mode button to "Parade" -> screenshot
- **Output:** `docs/assets/screenshots/15-parade-scope.png`

### Task 3.3.6: Screenshot 16 -- Pixel probe
- **Time estimate:** 15min
- **Actions:** Toggle pixel probe -> move mouse to canvas center -> screenshot
- **Output:** `docs/assets/screenshots/16-pixel-probe.png`
- **Verification:** Probe overlay showing RGB values, coordinates

### Task 3.3.7: Screenshot 17 -- False color
- **Time estimate:** 10min
- **Actions:** Press `Shift+Alt+F` -> wait for state -> screenshot
- **Output:** `docs/assets/screenshots/17-false-color.png`
- **Verification:** False-color mapped image with distinct color bands

---

## 3.4 Feature Screenshots (8 tasks)

All specs in `e2e/screenshots/features.screenshot.ts`.

### Task 3.4.1: Screenshot 18 -- Channel isolation (R/G/B/Luma)
- **Time estimate:** 20min
- **Actions:** Switch to view tab -> select each channel via channel select button
- **Output:** `18-channel-red.png`, `18-channel-green.png`, `18-channel-blue.png`, `18-channel-luma.png`
- **Verification:** Monochrome channel views

### Task 3.4.2: Screenshot 19 -- A/B split screen
- **Time estimate:** 15min
- **Media:** Two videos via `loadTwoVideoFiles(page)`
- **Actions:** Activate wipe mode via compare control button
- **Output:** `docs/assets/screenshots/19-ab-split-screen.png`
- **Verification:** Wipe divider visible with two different sources

### Task 3.4.3: Screenshot 20 -- Annotations with paint tools
- **Time estimate:** 20min
- **Actions:** Switch to annotate tab -> draw strokes on canvas -> screenshot
- **Output:** `docs/assets/screenshots/20-annotations.png`
- **Verification:** Annotation strokes overlaid on video

### Task 3.4.4: Screenshot 21 -- Keyboard shortcuts overlay
- **Time estimate:** 10min
- **Media:** None required
- **Actions:** Click help menu -> click shortcuts item -> screenshot modal
- **Output:** `docs/assets/screenshots/21-keyboard-shortcuts.png`
- **Verification:** Modal with shortcut categories and key bindings

### Task 3.4.5: Screenshot 22 -- EXR loaded (HDR content)
- **Time estimate:** 15min
- **Media:** `sample/test_hdr.exr`
- **Actions:** `loadExrFile(page)` -> screenshot
- **Output:** `docs/assets/screenshots/22-exr-loaded.png`

### Task 3.4.6: Screenshot 23 -- Tone mapping dropdown
- **Time estimate:** 15min
- **Media:** `sample/test_hdr.exr`
- **Actions:** Switch to QC tab -> open tone mapping control -> screenshot with dropdown visible
- **Output:** `docs/assets/screenshots/23-tone-mapping.png`

### Task 3.4.7: Screenshot 24 -- Curves editor
- **Time estimate:** 15min
- **Actions:** Press `u` -> wait for curves panel -> screenshot
- **Output:** `docs/assets/screenshots/24-curves-editor.png`
- **Verification:** Curves panel with editable graph, channel selector, preset options

### Task 3.4.8: Screenshot 25 -- Zebra stripes / Safe areas
- **Time estimate:** 15min
- **Actions:** Enable zebra stripes via `__OPENRV_TEST__.toggleZebraHigh()` -> screenshot; disable zebra, enable safe areas via `__OPENRV_TEST__.toggleSafeAreasTitleSafe()` -> screenshot
- **Output:** `25-zebra-stripes.png`, `25-safe-areas.png`
- **Verification:** Zebra shows diagonal stripes; safe areas show boundary rectangles

---

## 3.5 CI Integration

> **SwiftShader rendering quality warning:** Ubuntu CI runners use SwiftShader (software GL), which produces visually different output from hardware-accelerated rendering. For documentation-quality screenshots, consider using a macOS runner with a real GPU instead.

### Task 3.5.1: Create GitHub Actions workflow

- **Time estimate:** 30min
- **Dependencies:** All screenshot tasks
- **File:** `.github/workflows/screenshots.yml`
- **Description:** Workflow that:
  - Triggers on release + manual dispatch
  - Installs deps, Playwright Chromium
  - Runs `pnpm screenshots`
  - Uploads artifacts (30-day retention)
  - Auto-commits updated screenshots on release
- **Warning:** Auto-committing screenshots without human review risks committing broken output (black canvas, partial render). Consider requiring manual approval or a visual diff check before commit.
- **Acceptance criteria:** Workflow appears in Actions tab; manual dispatch works

### Task 3.5.2: Add screenshot artifact upload
- **Time estimate:** 5min
- **Description:** Already included in Task 3.5.1. `upload-artifact@v4` stores screenshots as downloadable artifact.

---

## 3.6 Screenshot Maintenance

### Task 3.6.1: Create naming convention documentation

- **Time estimate:** 15min
- **File:** `e2e/screenshots/README.md`
- **Content:** Naming pattern (`<NN>-<kebab-name>.png`), category ranges (01-10 core, 11-17 scopes, 18-25 features), how to add new screenshots, running instructions
- **Acceptance criteria:** File renders correctly in GitHub

### Task 3.6.2: Create staleness detection script

- **Time estimate:** 20min
- **File:** `e2e/screenshots/check-staleness.mjs`
- **Description:** Compares screenshot modification dates against last git commit touching `src/ui/` or `e2e/screenshots/`. Flags stale screenshots.
- **Acceptance criteria:** Exit 0 when fresh, exit 1 with list when stale

---

## 3.7 Additional Screenshots for User Guide

Phase 6 (User Guide) requires approximately 80 screenshots total (SS-001 through SS-111), far exceeding the 25 produced in sections 3.2-3.4. The following additional categories are needed:

- **LUT loaded state** -- screenshots showing file LUT, look LUT, and display LUT applied
- **Image sequence** -- loading and navigating image sequences from `sample/sequence/`
- **Info panel** -- metadata display for various file types (EXR, DPX, video)
- **Color wheels** -- lift/gamma/gain color wheel controls in various states
- **Stereo modes** -- side-by-side, anaglyph, and other stereo display modes
- **Dark/light theme variants** -- key UI states captured in both color schemes

These additional screenshots can be added incrementally as Phase 6 pages are written. Each user guide page should define its screenshot requirements, and new screenshot specs can be appended to the existing Playwright infrastructure.

---

## Implementation Sequence

1. **3.1.3** -- Create output directory (no deps)
2. **3.1.2** -- Create helpers
3. **3.1.1** -- Update playwright config
4. **3.1.4** -- Add npm scripts
5. **3.2.1-3.2.10** -- Core UI screenshots (parallelizable)
6. **3.3.1-3.3.7** -- Scope screenshots (parallelizable)
7. **3.4.1-3.4.8** -- Feature screenshots (parallelizable)
8. **3.5.1** -- CI workflow
9. **3.6.1-3.6.2** -- Maintenance

## Total: 31 atomic tasks

| Section | Tasks | Time |
|---------|-------|------|
| 3.1 Infrastructure | 4 | ~55min |
| 3.2 Core UI | 10 | ~2h 10min |
| 3.3 Scopes | 7 | ~1h 15min |
| 3.4 Features | 8 | ~2h 5min |
| 3.5 CI | 2 | ~35min |
| 3.6 Maintenance | 2 | ~35min |
| **Total** | **31** | **~7h 35min** |
