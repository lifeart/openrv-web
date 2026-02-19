import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getPresentationState,
  getFullscreenState,
  simulateFullscreenEnter,
  simulateFullscreenExit,
  canvasHasContent,
  getCanvasDimensions,
  captureViewerScreenshot,
  waitForPendingFramesBelow,
} from './fixtures';

test.describe('Fullscreen / Presentation Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  // === FULLSCREEN BUTTON TESTS ===

  test('FS-001: fullscreen button is visible in header bar', async ({ page }) => {
    const button = page.locator('[data-testid="fullscreen-toggle-button"]');
    await expect(button).toBeVisible();
  });

  test('FS-002: fullscreen button has correct tooltip', async ({ page }) => {
    const button = page.locator('[data-testid="fullscreen-toggle-button"]');
    const title = await button.getAttribute('title');
    expect(title).toContain('Fullscreen');
  });

  test('FS-005: fullscreen state defaults to false', async ({ page }) => {
    const state = await getFullscreenState(page);
    expect(state.isFullscreen).toBe(false);
  });

  // === FULLSCREEN TOGGLE TESTS ===

  test('FS-003: fullscreen enter/exit updates button tooltip', async ({ page }) => {
    const button = page.locator('[data-testid="fullscreen-toggle-button"]');

    // Initial: should say "Fullscreen"
    await expect(button).toHaveAttribute('title', /^Fullscreen/);

    // Enter fullscreen
    await simulateFullscreenEnter(page);
    await expect(button).toHaveAttribute('title', /Exit Fullscreen/);
    const enterState = await getFullscreenState(page);
    expect(enterState.isFullscreen).toBe(true);

    // Exit fullscreen
    await simulateFullscreenExit(page);
    await expect(button).toHaveAttribute('title', /^Fullscreen/);
    const exitState = await getFullscreenState(page);
    expect(exitState.isFullscreen).toBe(false);
  });

  test('FS-006: viewer expands when viewport grows during fullscreen', async ({ page }) => {
    // Default viewport: 1280x720
    const viewerBefore = await page.locator('.viewer-container').boundingBox();
    expect(viewerBefore).not.toBeNull();

    // Simulate entering fullscreen: state change + viewport grows to 1920x1080
    await simulateFullscreenEnter(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    // Wait for rAF resize dispatch + timeline debounce (150ms) to settle
    await page.waitForTimeout(400);

    const viewerAfter = await page.locator('.viewer-container').boundingBox();
    expect(viewerAfter).not.toBeNull();

    // Viewer container should have grown with the viewport
    expect(viewerAfter!.width).toBeGreaterThan(viewerBefore!.width);
    expect(viewerAfter!.height).toBeGreaterThan(viewerBefore!.height);

    // Canvas buffer should remain valid after resize.
    const canvasDimsAfter = await getCanvasDimensions(page);
    expect(canvasDimsAfter.width).toBeGreaterThan(0);
    expect(canvasDimsAfter.height).toBeGreaterThan(0);

    // Canvas should still have rendered content (not blank)
    expect(await canvasHasContent(page)).toBe(true);

    // Restore viewport for cleanup
    await simulateFullscreenExit(page);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('FS-007: layout restores correctly after fullscreen exit', async ({ page }) => {
    const headerBar = page.locator('.header-bar');
    const viewer = page.locator('.viewer-container');
    const timeline = page.locator('.timeline-container');

    // Wait for background frame loading to finish so the UI is stable
    await waitForPendingFramesBelow(page, 1).catch(() => {});
    await page.waitForTimeout(200);

    // Record baseline layout
    const headerBefore = await headerBar.boundingBox();
    const viewerBefore = await viewer.boundingBox();
    const timelineBefore = await timeline.boundingBox();
    const canvasDimsBefore = await getCanvasDimensions(page);

    // Capture viewer canvas screenshot before fullscreen
    const canvasBefore = await captureViewerScreenshot(page);
    // Capture header bar screenshot (pure UI chrome, no dynamic content)
    const headerScreenBefore = await headerBar.screenshot();

    // Full cycle: enter fullscreen + grow viewport → exit + restore viewport
    await simulateFullscreenEnter(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(400);

    await simulateFullscreenExit(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(400);

    // Viewer canvas screenshot after should match before
    const canvasAfter = await captureViewerScreenshot(page);
    expect(canvasAfter.equals(canvasBefore)).toBe(true);

    // Header bar screenshot should match (proves chrome UI restored)
    const headerScreenAfter = await headerBar.screenshot();
    expect(headerScreenAfter.equals(headerScreenBefore)).toBe(true);

    // All elements should be visible
    await expect(headerBar).toBeVisible();
    await expect(viewer).toBeVisible();
    await expect(timeline).toBeVisible();

    // Layout should match baseline
    const headerAfter = await headerBar.boundingBox();
    const viewerAfter = await viewer.boundingBox();
    const timelineAfter = await timeline.boundingBox();

    // Header keeps its fixed height
    expect(headerAfter!.height).toBe(headerBefore!.height);
    // Viewer restores to original size
    expect(viewerAfter!.width).toBeCloseTo(viewerBefore!.width, 0);
    expect(viewerAfter!.height).toBeCloseTo(viewerBefore!.height, 0);
    // Timeline keeps its fixed height
    expect(timelineAfter!.height).toBe(timelineBefore!.height);

    // Vertical ordering: header above viewer above timeline
    expect(headerAfter!.y).toBeLessThan(viewerAfter!.y);
    expect(viewerAfter!.y).toBeLessThan(timelineAfter!.y);

    // Canvas buffer size should have been restored
    const canvasDimsAfter = await getCanvasDimensions(page);
    expect(canvasDimsAfter.width).toBe(canvasDimsBefore.width);

    // Canvas should still have rendered content
    expect(await canvasHasContent(page)).toBe(true);
  });

  test('FS-008: canvas renders correctly through viewport resize cycle', async ({ page }) => {
    // Verify canvas has content at initial size
    expect(await canvasHasContent(page)).toBe(true);

    // Resize to several different viewport sizes (simulating fullscreen on different monitors)
    const viewportSizes = [
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
      { width: 800, height: 600 },
    ];

    for (const size of viewportSizes) {
      await simulateFullscreenEnter(page);
      await page.setViewportSize(size);
      await page.waitForTimeout(400);

      // Canvas should have content at each size
      expect(await canvasHasContent(page)).toBe(true);

      // Viewer should not collapse
      const viewerBox = await page.locator('.viewer-container').boundingBox();
      expect(viewerBox!.width).toBeGreaterThan(50);
      expect(viewerBox!.height).toBeGreaterThan(50);

      await simulateFullscreenExit(page);
    }

    // Restore original viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(400);

    // Canvas should still render after all the resizing
    expect(await canvasHasContent(page)).toBe(true);

    // Canvas buffer should remain valid after the resize cycle.
    const dimsAfter = await getCanvasDimensions(page);
    expect(dimsAfter.width).toBeGreaterThan(0);
    expect(dimsAfter.height).toBeGreaterThan(0);
  });

  test('FS-009: rapid viewport resize cycles do not break layout', async ({ page }) => {
    const headerBar = page.locator('.header-bar');
    const viewer = page.locator('.viewer-container');
    const timeline = page.locator('.timeline-container');
    const initialViewport = page.viewportSize()!;

    // Rapidly cycle between two viewport sizes (simulating fast fullscreen toggles)
    for (let i = 0; i < 5; i++) {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await simulateFullscreenEnter(page);
      await page.waitForTimeout(30);
      await page.setViewportSize(initialViewport);
      await simulateFullscreenExit(page);
      await page.waitForTimeout(30);
    }

    // Wait for all pending rAF + timeline debounce to settle
    await page.waitForTimeout(400);

    // Final state should be non-fullscreen
    const state = await getFullscreenState(page);
    expect(state.isFullscreen).toBe(false);

    // All elements visible, not collapsed
    await expect(headerBar).toBeVisible();
    await expect(viewer).toBeVisible();
    await expect(timeline).toBeVisible();

    const viewerBox = await viewer.boundingBox();
    expect(viewerBox!.width).toBeGreaterThan(100);
    expect(viewerBox!.height).toBeGreaterThan(100);

    // Canvas should still render
    expect(await canvasHasContent(page)).toBe(true);
  });

  // === PRESENTATION MODE BUTTON TESTS ===

  test('FS-010: presentation mode button is visible in header bar', async ({ page }) => {
    const button = page.locator('[data-testid="presentation-mode-button"]');
    await expect(button).toBeVisible();
  });

  test('FS-011: enter presentation mode hides UI', async ({ page }) => {
    // Click presentation mode button
    await page.click('[data-testid="presentation-mode-button"]');
    await page.waitForTimeout(500); // Wait for transition + display:none

    // Verify state
    const state = await getPresentationState(page);
    expect(state.enabled).toBe(true);

    // Header bar should be hidden
    const headerBar = page.locator('.header-bar');
    await expect(headerBar).toBeHidden();
  });

  test('FS-012: exit presentation mode shows UI', async ({ page }) => {
    // Enter presentation mode
    await page.click('[data-testid="presentation-mode-button"]');
    await page.waitForTimeout(500);

    let state = await getPresentationState(page);
    expect(state.enabled).toBe(true);

    // Exit via ESC key
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Verify state
    state = await getPresentationState(page);
    expect(state.enabled).toBe(false);

    // Header bar should be visible again
    const headerBar = page.locator('.header-bar');
    await expect(headerBar).toBeVisible();
  });

  test('FS-013: presentation mode keyboard shortcut Ctrl+Shift+P', async ({ page }) => {
    // Press Ctrl+Shift+P
    await page.keyboard.press('Control+Shift+p');
    await page.waitForTimeout(500);

    // Verify state
    const state = await getPresentationState(page);
    expect(state.enabled).toBe(true);

    // Header bar should be hidden
    const headerBar = page.locator('.header-bar');
    await expect(headerBar).toBeHidden();
  });

  test('FS-020: presentation mode default state', async ({ page }) => {
    const state = await getPresentationState(page);
    expect(state.enabled).toBe(false);
    expect(state.cursorAutoHide).toBe(true);
    expect(state.cursorHideDelay).toBe(3000);
  });

  test('FS-040: playback controls work in presentation mode', async ({ page }) => {
    // Enter presentation mode
    await page.click('[data-testid="presentation-mode-button"]');
    await page.waitForTimeout(500);

    const state = await getPresentationState(page);
    expect(state.enabled).toBe(true);

    // Arrow keys should still step frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    // Space should toggle playback (we just verify no error occurs)
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
  });

  test('FS-041: ESC exits presentation mode, pressing again does not re-enter', async ({ page }) => {
    // Enter presentation mode
    await page.click('[data-testid="presentation-mode-button"]');
    await page.waitForTimeout(500);

    let state = await getPresentationState(page);
    expect(state.enabled).toBe(true);

    // ESC should exit presentation mode
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    state = await getPresentationState(page);
    expect(state.enabled).toBe(false);

    // Second ESC should not re-enter (just close panels normally)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    state = await getPresentationState(page);
    expect(state.enabled).toBe(false);
  });

  test('FS-042: toggling presentation mode preserves toolbar button visibility/layout', async ({ page }) => {
    const viewTabButton = page.locator('button[data-tab-id="view"]');
    const zoomButton = page.locator('[data-testid="zoom-control-button"]');
    const presentationButton = page.locator('[data-testid="presentation-mode-button"]');

    await expect(viewTabButton).toBeVisible();
    await expect(zoomButton).toBeVisible();

    await presentationButton.click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await expect(viewTabButton).toBeVisible();
    await expect(zoomButton).toBeVisible();

    const tabBarDisplay = await page.locator('.tab-bar').evaluate((el) => getComputedStyle(el).display);
    const toolbarDisplay = await page.locator('.context-toolbar').evaluate((el) => getComputedStyle(el).display);
    expect(tabBarDisplay).toBe('flex');
    expect(toolbarDisplay).toBe('flex');
  });
});
