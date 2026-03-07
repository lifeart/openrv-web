# Phase 7: Screenshot Coverage Expansion

## Problem

42 screenshots exist (numbers 01-38 + channel variants), covering 31 doc pages. **20 doc pages** that describe visual tools/features have no screenshots. The `e2e/screenshots/README.md` is also outdated — it only lists ranges 01-25 but `color.screenshot.ts` (26-33) and `compare.screenshot.ts` (34-38) already exist.

## Current Screenshot Inventory

| Range | Category | Spec file | Status |
|-------|----------|-----------|--------|
| 01-10 | Core UI | `core-ui.screenshot.ts` | Done |
| 11-17 | Scopes & Analysis | `scopes.screenshot.ts` | Done |
| 18-25 | Features | `features.screenshot.ts` | Done |
| 26-33 | Color Management | `color.screenshot.ts` | Done (not in README) |
| 34-38 | Comparison & Gamut | `compare.screenshot.ts` | Done (not in README) |
| 39-42 | Annotations | `annotations.screenshot.ts` | **NEW** |
| 43-47 | Playback | `playback.screenshot.ts` | **NEW** |
| 48-52 | Export | `export.screenshot.ts` | **NEW** |
| 53-58 | Advanced | `advanced.screenshot.ts` | **NEW** |

---

## Part 1: Fix README (5min)

Update `e2e/screenshots/README.md` to include the missing category ranges (26-33, 34-38) and add entries for new ranges (39-58).

---

## Part 2: New Screenshot Specs

### 2A. Annotations Screenshots (`e2e/screenshots/annotations.screenshot.ts`, range 39-42)

These serve: `annotations/shapes.md`, `annotations/text.md`, `annotations/per-frame-modes.md`, `annotations/export.md`

#### 39-annotation-shapes
- **Doc**: `annotations/shapes.md`
- **Media**: Sample video
- **Actions**:
  1. `initWithVideo(page)` + `switchTab(page, 'annotate')`
  2. Select rectangle tool (`r`), draw a rectangle on canvas
  3. Select ellipse tool (`o`), draw an ellipse
  4. Select arrow tool (`a`), draw an arrow pointing to a region
  5. `waitForCanvasStable` + `takeDocScreenshot`
- **Verifies**: Multiple shape types visible on canvas with different geometry

#### 40-annotation-text
- **Doc**: `annotations/text.md`
- **Media**: Sample video
- **Actions**:
  1. `initWithVideo(page)` + `switchTab(page, 'annotate')`
  2. Select text tool (`t`), click on canvas, type a review note
  3. Place a second text annotation at a different position
  4. `takeDocScreenshot`
- **Verifies**: Text labels visible on canvas with background

#### 41-ghost-mode
- **Doc**: `annotations/per-frame-modes.md`
- **Media**: Sample video
- **Actions**:
  1. `initWithVideo(page)` + `switchTab(page, 'annotate')`
  2. Draw annotations on frame 10, 11, 12 (seek + draw strokes on each)
  3. Seek to frame 11, press `g` to enable ghost mode
  4. `waitForCanvasStable` + `takeDocScreenshot`
- **Verifies**: Semi-transparent annotations from adjacent frames visible (onion-skin effect)

#### 42-annotation-export-menu
- **Doc**: `annotations/export.md`
- **Media**: Sample video with annotations drawn
- **Actions**:
  1. `initWithVideo(page)` + draw a few annotations
  2. Open the Export dropdown menu in header bar
  3. `takeDocScreenshot` (with menu visible)
- **Verifies**: Export menu showing "Export Annotations (JSON)" and "Export Annotations (PDF)" options

---

### 2B. Playback Screenshots (`e2e/screenshots/playback.screenshot.ts`, range 43-47)

These serve: `playback/audio.md`, `playback/jkl-navigation.md`, `playback/loop-modes-stepping.md`, `playback/viewer-navigation.md`, `playback/image-sequences.md`

#### 43-audio-waveform
- **Doc**: `playback/audio.md`
- **Media**: Sample video (has audio track)
- **Actions**:
  1. `initWithVideo(page)`
  2. Ensure audio waveform is visible on timeline (may need to toggle via UI or test helper)
  3. `takeDocScreenshot` clipped to timeline region showing waveform
- **Verifies**: Audio waveform rendered on timeline, volume control visible

#### 44-jkl-speed
- **Doc**: `playback/jkl-navigation.md`
- **Media**: Sample video
- **Actions**:
  1. `initWithVideo(page)`
  2. Press `l` twice to set 2x speed (speed indicator should update)
  3. `takeDocScreenshot` (full page, speed indicator visible in header/transport)
- **Verifies**: Speed indicator showing non-1x playback rate

#### 45-loop-mode
- **Doc**: `playback/loop-modes-stepping.md`
- **Media**: Sample video
- **Actions**:
  1. `initWithVideo(page)`
  2. Click loop mode button to cycle to a visible state (e.g., ping-pong)
  3. `takeDocScreenshot` clipped to transport bar area showing loop button
- **Verifies**: Loop mode icon visible in transport controls

#### 46-viewer-zoomed
- **Doc**: `playback/viewer-navigation.md`
- **Media**: Sample video
- **Actions**:
  1. `initWithVideo(page)`
  2. Zoom in to 200% via `page.evaluate(() => __OPENRV_TEST__?.setZoom?.(2.0))`
  3. Pan slightly to show offset via test helper
  4. `waitForCanvasStable` + `takeDocScreenshot`
- **Verifies**: Zoomed-in view showing only part of image, zoom indicator visible

#### 47-image-sequence
- **Doc**: `playback/image-sequences.md`
- **Media**: `sample/sequence/` directory
- **Actions**:
  1. `initApp(page)`
  2. Load image sequence via test helper or file input
  3. `waitForCanvasStable` + `takeDocScreenshot`
- **Verifies**: Sequence loaded, frame counter shows sequence length, pattern indicator visible

---

### 2C. Export Screenshots (`e2e/screenshots/export.screenshot.ts`, range 48-52)

These serve: `export/frame-export.md`, `export/video-export.md`, `export/slate-frameburn.md`, `export/edl-otio.md`, `export/sessions.md`

#### 48-frame-export-dialog
- **Doc**: `export/frame-export.md`
- **Media**: Sample video
- **Actions**:
  1. `initWithVideo(page)`
  2. Trigger frame export dialog (Ctrl+S or via Export menu)
  3. `takeDocScreenshot` with dialog visible
- **Verifies**: Export format options (PNG/JPEG/WebP), quality settings visible

#### 49-video-export-dialog
- **Doc**: `export/video-export.md`
- **Media**: Sample video
- **Actions**:
  1. `initWithVideo(page)`
  2. Open video export dialog from Export menu
  3. `takeDocScreenshot` with dialog visible
- **Verifies**: Codec selection, bitrate, resolution options visible

#### 50-slate-editor
- **Doc**: `export/slate-frameburn.md`
- **Media**: Sample video
- **Actions**:
  1. `initWithVideo(page)`
  2. Open slate/frameburn configuration (via export settings or dedicated panel)
  3. `takeDocScreenshot`
- **Verifies**: Slate fields (show, shot, version, artist), preview, frameburn toggle

#### 51-session-save
- **Doc**: `export/sessions.md`
- **Media**: Sample video with some state (markers, color adjustments)
- **Actions**:
  1. `initWithVideo(page)`, add markers, adjust exposure
  2. Trigger session save dialog
  3. `takeDocScreenshot` with dialog visible
- **Verifies**: Save dialog showing session state summary

#### 52-edl-export
- **Doc**: `export/edl-otio.md`
- **Media**: Sample video
- **Actions**:
  1. `initWithVideo(page)`
  2. Open EDL/OTIO export option from Export menu
  3. `takeDocScreenshot` with menu/dialog visible
- **Verifies**: EDL export options visible

---

### 2D. Advanced Screenshots (`e2e/screenshots/advanced.screenshot.ts`, range 53-58)

These serve: `advanced/filters-effects.md`, `advanced/transforms.md`, `advanced/playlist.md`, `compare/advanced-compare.md`, `color/ocio.md`

#### 53-filters-panel
- **Doc**: `advanced/filters-effects.md`
- **Media**: Sample video
- **Actions**:
  1. `initWithVideo(page)` + `switchTab(page, 'effects')`
  2. Open the filters panel/controls (expand noise reduction, sharpen sections)
  3. `takeDocScreenshot`
- **Verifies**: Filter controls visible with enable toggles, sliders for strength/radius

#### 54-transform-controls
- **Doc**: `advanced/transforms.md`
- **Media**: Sample video
- **Actions**:
  1. `initWithVideo(page)` + `switchTab(page, 'transform')`
  2. Enable crop tool or rotation to show transform controls
  3. `waitForCanvasStable` + `takeDocScreenshot`
- **Verifies**: Transform controls visible (crop handles, rotation angle, flip buttons)

#### 55-playlist-panel
- **Doc**: `advanced/playlist.md`
- **Media**: Two videos via `loadTwoVideoFiles(page)`
- **Actions**:
  1. `initApp(page)` + `loadTwoVideoFiles(page)`
  2. Open playlist panel (if available)
  3. `takeDocScreenshot`
- **Verifies**: Multiple clips listed in playlist, per-clip controls visible

#### 56-quad-view
- **Doc**: `compare/advanced-compare.md`
- **Media**: Two videos
- **Actions**:
  1. `initApp(page)` + `loadTwoVideoFiles(page)`
  2. Activate quad view mode via wipe mode cycling or test helper
  3. `waitForCanvasStable` + `takeDocScreenshot`
- **Verifies**: Four quadrants visible with viewer content

#### 57-ocio-panel
- **Doc**: `color/ocio.md`
- **Media**: Sample video or EXR
- **Actions**:
  1. `initWithVideo(page)` + `switchTab(page, 'color')`
  2. Open OCIO configuration panel or dropdown
  3. `takeDocScreenshot`
- **Verifies**: OCIO config selection, input/display/view transform dropdowns

#### 58-exr-layers
- **Doc**: `playback/exr-layers.md`
- **Media**: `sample/test_multilayer.exr`
- **Actions**:
  1. `initApp(page)` + load multilayer EXR
  2. Open layer selector dropdown
  3. `takeDocScreenshot`
- **Verifies**: Layer list visible with multiple EXR layer names
- **Note**: `playback/exr-layers.md` currently uses `22-exr-loaded.png` — this new screenshot specifically shows layer selection

---

## Part 3: Update Documentation to Reference New Screenshots

After generating screenshots, update each doc file to include the image reference. Follow the existing pattern:

```markdown
![Description](/assets/screenshots/NN-name.png)
```

### Files to update:

| Doc file | Add screenshot |
|----------|---------------|
| `annotations/shapes.md` | `39-annotation-shapes.png` |
| `annotations/text.md` | `40-annotation-text.png` |
| `annotations/per-frame-modes.md` | `41-ghost-mode.png` |
| `annotations/export.md` | `42-annotation-export-menu.png` |
| `playback/audio.md` | `43-audio-waveform.png` |
| `playback/jkl-navigation.md` | `44-jkl-speed.png` |
| `playback/loop-modes-stepping.md` | `45-loop-mode.png` |
| `playback/viewer-navigation.md` | `46-viewer-zoomed.png` |
| `playback/image-sequences.md` | `47-image-sequence.png` |
| `export/frame-export.md` | `48-frame-export-dialog.png` |
| `export/video-export.md` | `49-video-export-dialog.png` |
| `export/slate-frameburn.md` | `50-slate-editor.png` |
| `export/sessions.md` | `51-session-save.png` |
| `export/edl-otio.md` | `52-edl-export.png` |
| `advanced/filters-effects.md` | `53-filters-panel.png` |
| `advanced/transforms.md` | `54-transform-controls.png` |
| `advanced/playlist.md` | `55-playlist-panel.png` |
| `compare/advanced-compare.md` | `56-quad-view.png` |
| `color/ocio.md` | `57-ocio-panel.png` |
| `playback/exr-layers.md` | `58-exr-layers.png` |

---

## Part 4: Update README

Update `e2e/screenshots/README.md` category table:

```markdown
| Range | Category | Spec file |
|-------|----------|-----------|
| 01-10 | Core UI | `core-ui.screenshot.ts` |
| 11-17 | Scopes & Analysis | `scopes.screenshot.ts` |
| 18-25 | Features | `features.screenshot.ts` |
| 26-33 | Color Management | `color.screenshot.ts` |
| 34-38 | Comparison & Gamut | `compare.screenshot.ts` |
| 39-42 | Annotations | `annotations.screenshot.ts` |
| 43-47 | Playback | `playback.screenshot.ts` |
| 48-52 | Export | `export.screenshot.ts` |
| 53-58 | Advanced | `advanced.screenshot.ts` |
```

Also add `color.screenshot.ts`, `compare.screenshot.ts`, and the 4 new spec files to the Architecture section.

---

## Implementation Order

1. **Part 4**: Update README with correct ranges (5min)
2. **Part 2A**: `annotations.screenshot.ts` — 4 tests (39-42)
3. **Part 2B**: `playback.screenshot.ts` — 5 tests (43-47)
4. **Part 2C**: `export.screenshot.ts` — 5 tests (48-52)
5. **Part 2D**: `advanced.screenshot.ts` — 6 tests (53-58)
6. **Part 3**: Update all 20 doc files with image references
7. Run `pnpm screenshots` to generate all new images
8. Verify each screenshot shows meaningful content

Parts 2A-2D can be developed in parallel.

---

## Risk: Features Not Yet in UI

Some documented features may be aspirational (not yet implemented in the UI). Before writing each screenshot test:

1. Check if the UI element/panel/dialog actually exists by searching `src/ui/` for relevant components
2. If a feature is documented but not implemented, skip its screenshot and note it in a tracking comment
3. Prioritize screenshots for features that definitely exist (annotations, playback controls, scopes are all confirmed)

### Validation checklist before each test:
- [ ] Does the UI element exist? (`Glob` for component files)
- [ ] Is there a keyboard shortcut or test helper to activate it?
- [ ] Can the state be set up deterministically for a consistent screenshot?

---

## Summary

| Part | New Screenshots | New/Updated Files |
|------|----------------|-------------------|
| Part 1 (README) | 0 | 1 |
| Part 2A (Annotations) | 4 | 1 new spec |
| Part 2B (Playback) | 5 | 1 new spec |
| Part 2C (Export) | 5 | 1 new spec |
| Part 2D (Advanced) | 6 | 1 new spec |
| Part 3 (Doc updates) | 0 | 20 doc files |
| **Total** | **20** | **24 files** |
