# E2E Test Improvements Plan

This document outlines the improvements needed for each e2e test file to ensure all tests have meaningful assertions that verify actual application behavior.

## Test Quality Standards

Every test should follow this pattern:
1. **Capture initial state** (using test helper or screenshot)
2. **Perform action** (click, keyboard shortcut, drag)
3. **Verify state changed** (using `getSessionState`, `getPaintState`, etc.)
4. **Verify visual change** (using `captureViewerScreenshot` + `imagesAreDifferent`)

---

## File Status Overview

| File | Status | Priority | Tests | Issues |
|------|--------|----------|-------|--------|
| `playback-controls.spec.ts` | GOOD | - | 28 | Improved - has state verification |
| `timeline.spec.ts` | GOOD | - | 20 | Improved - has state verification |
| `paint-tools.spec.ts` | GOOD | - | 19 | Has state verification |
| `color-controls.spec.ts` | GOOD | - | 18 | Has state & screenshot verification |
| `effects-controls.spec.ts` | GOOD | - | 16 | Has screenshot verification |
| `view-controls.spec.ts` | GOOD | - | 18 | Has state & screenshot verification |
| `transform-controls.spec.ts` | GOOD | - | 19 | Has state & screenshot verification |
| `business-logic.spec.ts` | GOOD | - | 24 | Comprehensive state verification |
| `state-verification.spec.ts` | GOOD | - | 27 | Good state verification |
| `keyboard-shortcuts.spec.ts` | NEEDS WORK | HIGH | 36 | No state verification |
| `media-loading.spec.ts` | NEEDS WORK | MEDIUM | 11 | Only visibility checks |
| `tab-navigation.spec.ts` | NEEDS WORK | MEDIUM | 13 | Only CSS class checks |
| `export-workflow.spec.ts` | NEEDS WORK | LOW | 23 | Minimal assertions |
| `app-initialization.spec.ts` | OK | LOW | 13 | Basic UI checks (acceptable) |

---

## Detailed Improvement Plan

### 1. keyboard-shortcuts.spec.ts - HIGH PRIORITY

**Current Issues:**
- [ ] KEYS-010 to KEYS-015: No state verification after playback shortcuts
- [ ] KEYS-020 to KEYS-022: No state verification after view shortcuts
- [ ] KEYS-030 to KEYS-036: No state verification after timeline shortcuts
- [ ] KEYS-040 to KEYS-047: No state verification after paint shortcuts
- [ ] KEYS-050 to KEYS-051: No state verification after color shortcuts
- [ ] KEYS-060 to KEYS-064: No state verification after transform shortcuts

**Required Improvements:**

```typescript
// BEFORE (weak):
test('KEYS-010: Space should toggle play/pause', async ({ page }) => {
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
});

// AFTER (meaningful):
test('KEYS-010: Space should toggle play/pause and update isPlaying state', async ({ page }) => {
  let state = await getSessionState(page);
  expect(state.isPlaying).toBe(false);

  await page.keyboard.press('Space');
  await page.waitForTimeout(100);

  state = await getSessionState(page);
  expect(state.isPlaying).toBe(true);

  await page.keyboard.press('Space');
  await page.waitForTimeout(100);

  state = await getSessionState(page);
  expect(state.isPlaying).toBe(false);
});
```

**Todo Items:**
- [ ] Add `getSessionState` verification for playback shortcuts (Space, Arrow keys, Home, End, ArrowUp)
- [ ] Add `getViewerState` verification for view shortcuts (F, 0, W)
- [ ] Add `getSessionState` verification for timeline shortcuts (I, O, [, ], R, M, L)
- [ ] Add `getPaintState` verification for paint shortcuts (V, P, E, T, B, G, Ctrl+Z, Ctrl+Y)
- [ ] Add visual verification for color panel toggle (C, Escape)
- [ ] Add `getTransformState` verification for transform shortcuts (Shift+R, Alt+R, Shift+H, Shift+V, K)

---

### 2. media-loading.spec.ts - MEDIUM PRIORITY

**Current Issues:**
- [ ] MEDIA-001 to MEDIA-004: Only check visibility, no state verification
- [ ] MEDIA-010 to MEDIA-011: No verification of loaded session state
- [ ] MEDIA-020 to MEDIA-021: No actual file drop testing

**Required Improvements:**

```typescript
// BEFORE (weak):
test('MEDIA-001: should load video file via file input', async ({ page }) => {
  await loadVideoFile(page);
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
});

// AFTER (meaningful):
test('MEDIA-001: should load video file and update session state', async ({ page }) => {
  let state = await getSessionState(page);
  expect(state.hasMedia).toBe(false);
  expect(state.frameCount).toBe(0);

  await loadVideoFile(page);

  state = await getSessionState(page);
  expect(state.hasMedia).toBe(true);
  expect(state.frameCount).toBeGreaterThan(0);
  expect(state.mediaType).toBe('video');

  // Verify canvas has content
  const screenshot = await captureViewerScreenshot(page);
  expect(screenshot.length).toBeGreaterThan(1000); // Not empty
});
```

**Todo Items:**
- [ ] Add `hasMedia`, `frameCount`, `mediaType` verification after video load
- [ ] Add `mediaName` verification
- [ ] Verify timeline duration matches `frameCount`
- [ ] Add canvas content verification (not just visibility)
- [ ] Add state verification for RV session loading (annotations loaded)

---

### 3. tab-navigation.spec.ts - MEDIUM PRIORITY

**Current Issues:**
- [ ] TAB-001 to TAB-005: Only check CSS class, should verify toolbar content
- [ ] TAB-010 to TAB-014: Same issue with keyboard navigation
- [ ] TAB-020 to TAB-024: Weak content checks
- [ ] TAB-030: No actual state persistence verification

**Required Improvements:**

```typescript
// BEFORE (weak):
test('TAB-020: View tab should show zoom and wipe controls', async ({ page }) => {
  await page.click('button:has-text("View")');
  const fitButton = page.locator('button:has-text("Fit")');
  await expect(fitButton).toBeVisible();
});

// AFTER (meaningful):
test('TAB-020: View tab should show zoom controls that actually work', async ({ page }) => {
  await loadVideoFile(page);
  await page.click('button:has-text("View")');
  await page.waitForTimeout(100);

  // Verify zoom buttons are functional
  let state = await getViewerState(page);
  const initialZoom = state.zoom;

  const zoom200 = page.locator('button:has-text("200%")');
  await expect(zoom200).toBeVisible();
  await zoom200.click();
  await page.waitForTimeout(100);

  state = await getViewerState(page);
  expect(state.zoom).toBe(2);
  expect(state.zoom).not.toBe(initialZoom);
});
```

**Todo Items:**
- [ ] Verify toolbar buttons are functional (not just visible)
- [ ] Add state verification for zoom controls on View tab
- [ ] Add state verification for color controls on Color tab
- [ ] Add state verification for filter controls on Effects tab
- [ ] Add state verification for transform controls on Transform tab
- [ ] Add state verification for paint tools on Annotate tab
- [ ] Add actual state persistence test (zoom preserved across tab switches)

---

### 4. export-workflow.spec.ts - LOW PRIORITY

**Current Issues:**
- [ ] EXPORT-002 to EXPORT-005: Only check visibility, don't verify export works
- [ ] WORKFLOW-001 to WORKFLOW-006: Minimal assertions, mostly just run actions
- [ ] RV-001, RV-002: No state verification for session loading

**Required Improvements:**

```typescript
// BEFORE (weak):
test('WORKFLOW-003: annotation workflow', async ({ page }) => {
  // ... draws, navigates, but no state verification
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
});

// AFTER (meaningful):
test('WORKFLOW-003: annotation workflow with state verification', async ({ page }) => {
  await loadVideoFile(page);
  await page.click('button:has-text("Annotate")');
  await page.keyboard.press('p');

  let paintState = await getPaintState(page);
  expect(paintState.currentTool).toBe('pen');
  expect(paintState.annotatedFrames.length).toBe(0);

  // Draw annotation
  // ... drawing code ...

  paintState = await getPaintState(page);
  expect(paintState.annotatedFrames).toContain(1);
  expect(paintState.canUndo).toBe(true);

  // Undo
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);

  paintState = await getPaintState(page);
  expect(paintState.canUndo).toBe(false);
  expect(paintState.canRedo).toBe(true);
});
```

**Todo Items:**
- [ ] Add state verification to all workflow tests
- [ ] Add actual export verification (check downloaded file)
- [ ] Verify RV session loads annotations into `annotatedFrames`
- [ ] Add error state verification for error handling tests

---

## Implementation Order

1. **Phase 1: keyboard-shortcuts.spec.ts** (36 tests)
   - Most critical - these are the core interaction tests
   - Estimated: 2 hours

2. **Phase 2: media-loading.spec.ts** (11 tests)
   - Important for verifying sample files work
   - Estimated: 1 hour

3. **Phase 3: tab-navigation.spec.ts** (13 tests)
   - Important for UI workflow verification
   - Estimated: 1 hour

4. **Phase 4: export-workflow.spec.ts** (23 tests)
   - Lower priority, but good for completeness
   - Estimated: 1.5 hours

---

## Verification Checklist

After improvements, each test file should pass these checks:

- [ ] Uses `getSessionState` to verify playback/frame state
- [ ] Uses `getPaintState` to verify annotation state
- [ ] Uses `getViewerState` to verify zoom/pan/wipe/crop state
- [ ] Uses `getColorState` to verify color adjustments
- [ ] Uses `getTransformState` to verify rotation/flip
- [ ] Uses `captureViewerScreenshot` + `imagesAreDifferent` for visual verification
- [ ] Tests verify state BEFORE and AFTER actions
- [ ] No "toothless" tests that only check visibility

---

## Sample Files Verification

- [x] `sample/2d56d82687b78171f50c496bab002bc18d53149b.mp4` - Video file exists
- [x] `sample/test_session.rv` - RV session file exists
- [ ] Verify video loads and has correct frame count
- [ ] Verify RV session loads with expected state

---

## Progress Tracking

Update this section as improvements are made:

| File | Started | Completed | Tests Updated |
|------|---------|-----------|---------------|
| keyboard-shortcuts.spec.ts | [x] | [x] | 33/33 |
| media-loading.spec.ts | [x] | [x] | 12/12 |
| tab-navigation.spec.ts | [x] | [x] | 19/19 |
| export-workflow.spec.ts | [ ] | [ ] | 0/23 |

### Summary of Improvements Made

**keyboard-shortcuts.spec.ts** (33 tests - all passing):
- Added `getSessionState` verification for playback shortcuts
- Added `getViewerState` verification for view shortcuts (zoom, wipe)
- Added `getSessionState` verification for timeline shortcuts (in/out points, marks, loop mode)
- Added `getPaintState` verification for paint shortcuts (tool selection, undo/redo)
- Added `getTransformState` verification for transform shortcuts (rotation, flip)
- Added screenshot verification for visual changes

**media-loading.spec.ts** (12 tests - all passing):
- Added `hasMedia`, `frameCount` verification after video load
- Added navigation verification (ArrowRight, End keys work after load)
- Added playback verification (Space toggles isPlaying)
- Added in/out point initialization verification
- Added sample files verification tests

**tab-navigation.spec.ts** (19 tests - all passing):
- Added state verification for toolbar controls (zoom, color, effects, transform, paint)
- Added state persistence tests (zoom, rotation, paint tool persist across tab switches)
- Added functional verification that controls actually update state

---

*Last Updated: 2026-01-16*
