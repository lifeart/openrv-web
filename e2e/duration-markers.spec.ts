import { test, expect } from '@playwright/test';
import { loadVideoFile, getSessionState, waitForTestHelper } from './fixtures';

/**
 * Helper: open the marker list panel via the Annotate tab > Markers button.
 */
async function openMarkerPanel(page: import('@playwright/test').Page): Promise<void> {
  // Switch to the Annotate tab so the Markers toggle button is visible
  const annotateTab = page.locator('button[data-tab-id="annotate"]');
  if (await annotateTab.isVisible()) {
    await annotateTab.click();
    await page.waitForTimeout(100);
  }

  const panel = page.locator('[data-testid="marker-list-panel"]');
  // Only open if not already visible
  const isVisible = await panel.evaluate(el => el.style.display !== 'none');
  if (!isVisible) {
    const markersToggle = page.locator('[data-testid="markers-toggle-button"]');
    await markersToggle.click();
    await page.waitForTimeout(200);
  }
}

/**
 * Helper: navigate to a specific frame using arrow keys from frame 1.
 * After loading a video the current frame is 1, so pressing Right (targetFrame - 1) times.
 */
async function navigateToFrame(page: import('@playwright/test').Page, targetFrame: number): Promise<void> {
  const state = await getSessionState(page);
  const currentFrame = state.currentFrame;
  const diff = targetFrame - currentFrame;

  if (diff > 0) {
    for (let i = 0; i < diff; i++) {
      await page.keyboard.press('ArrowRight');
    }
  } else if (diff < 0) {
    for (let i = 0; i < Math.abs(diff); i++) {
      await page.keyboard.press('ArrowLeft');
    }
  }
  await page.waitForTimeout(100);
}

test.describe('Duration Markers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  // DM-001: No markers by default
  test('DM-001: no markers exist by default', async ({ page }) => {
    await loadVideoFile(page);

    const state = await getSessionState(page);
    expect(state.markers).toHaveLength(0);
  });

  // DM-002: Add a point marker
  test('DM-002: adding a marker creates a point marker', async ({ page }) => {
    await loadVideoFile(page);

    // Add a marker at the current frame using keyboard shortcut 'm'
    await page.keyboard.press('m');
    await page.waitForTimeout(200);

    const state = await getSessionState(page);
    expect(state.markers.length).toBeGreaterThanOrEqual(1);
    expect(state.marks.length).toBeGreaterThanOrEqual(1);
  });

  // DM-003: Create a duration marker via the marker panel UI
  test('DM-003: marker panel UI can create duration markers with endFrame', async ({ page }) => {
    await loadVideoFile(page);

    // Navigate to frame 5 and add a marker via keyboard
    await navigateToFrame(page, 5);
    await page.keyboard.press('m');
    await page.waitForTimeout(200);

    // Open the marker panel
    await openMarkerPanel(page);

    // Click the edit button for the marker at frame 5
    const editBtn = page.locator('[data-testid="marker-edit-5"]');
    await editBtn.click();
    await page.waitForTimeout(200);

    // Fill in the note
    const noteInput = page.locator('[data-testid="marker-note-input-5"]');
    await noteInput.fill('Test range marker');

    // Set end frame to 15
    const endFrameInput = page.locator('[data-testid="marker-endframe-input-5"]');
    await endFrameInput.fill('15');

    // Save the marker edit
    const saveBtn = page.locator('[data-testid="marker-save-5"]');
    await saveBtn.click();
    await page.waitForTimeout(200);

    // Verify state via reading
    const state = await getSessionState(page);
    expect(state.markers.length).toBe(1);
    expect(state.markers[0]?.frame).toBe(5);
    expect(state.markers[0]?.note).toBe('Test range marker');

    // Verify the endFrame is set
    const hasEndFrame = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      const marker = app?.session?.marks?.get(5);
      return marker?.endFrame;
    });
    expect(hasEndFrame).toBe(15);
  });

  // DM-004: Duration marker renders on timeline
  test('DM-004: timeline canvas is visible with markers set', async ({ page }) => {
    await loadVideoFile(page);

    // Navigate to frame 3 and add a marker via keyboard
    await navigateToFrame(page, 3);
    await page.keyboard.press('m');
    await page.waitForTimeout(200);

    // Open the marker panel and set endFrame via UI
    await openMarkerPanel(page);

    const editBtn = page.locator('[data-testid="marker-edit-3"]');
    await editBtn.click();
    await page.waitForTimeout(200);

    const noteInput = page.locator('[data-testid="marker-note-input-3"]');
    await noteInput.fill('Scene A');

    const endFrameInput = page.locator('[data-testid="marker-endframe-input-3"]');
    await endFrameInput.fill('10');

    const saveBtn = page.locator('[data-testid="marker-save-3"]');
    await saveBtn.click();
    await page.waitForTimeout(200);

    // Timeline canvas should still be visible and rendering
    const timelineCanvas = page.locator('[data-testid="timeline-canvas"]');
    await expect(timelineCanvas).toBeVisible();
  });

  // DM-005: Set end frame for existing marker via panel UI
  test('DM-005: editing marker via panel converts point marker to duration marker', async ({ page }) => {
    await loadVideoFile(page);

    // Navigate to frame 10 and create a point marker via keyboard
    await navigateToFrame(page, 10);
    await page.keyboard.press('m');
    await page.waitForTimeout(200);

    // Open marker panel
    await openMarkerPanel(page);

    // Edit the marker: add note and set endFrame
    const editBtn = page.locator('[data-testid="marker-edit-10"]');
    await editBtn.click();
    await page.waitForTimeout(200);

    const noteInput = page.locator('[data-testid="marker-note-input-10"]');
    await noteInput.fill('Convert me');

    const endFrameInput = page.locator('[data-testid="marker-endframe-input-10"]');
    await endFrameInput.fill('20');

    const saveBtn = page.locator('[data-testid="marker-save-10"]');
    await saveBtn.click();
    await page.waitForTimeout(200);

    // Verify the endFrame was set
    const endFrame = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.marks?.get(10)?.endFrame;
    });
    expect(endFrame).toBe(20);
  });

  // DM-006: Remove end frame to revert to point marker via panel UI
  test('DM-006: clearing endFrame via panel reverts to point marker', async ({ page }) => {
    await loadVideoFile(page);

    // Navigate to frame 5 and create a marker
    await navigateToFrame(page, 5);
    await page.keyboard.press('m');
    await page.waitForTimeout(200);

    // Open marker panel and set it as a duration marker first
    await openMarkerPanel(page);

    let editBtn = page.locator('[data-testid="marker-edit-5"]');
    await editBtn.click();
    await page.waitForTimeout(200);

    const noteInput = page.locator('[data-testid="marker-note-input-5"]');
    await noteInput.fill('Duration test');

    let endFrameInput = page.locator('[data-testid="marker-endframe-input-5"]');
    await endFrameInput.fill('15');

    let saveBtn = page.locator('[data-testid="marker-save-5"]');
    await saveBtn.click();
    await page.waitForTimeout(200);

    // Verify endFrame is set
    let endFrame = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.marks?.get(5)?.endFrame;
    });
    expect(endFrame).toBe(15);

    // Now edit again and clear the endFrame using the Clear button
    editBtn = page.locator('[data-testid="marker-edit-5"]');
    await editBtn.click();
    await page.waitForTimeout(200);

    // Click the Clear button to clear the endFrame input
    const clearEndBtn = page.locator('[data-testid="marker-clear-endframe-5"]');
    await clearEndBtn.click();
    await page.waitForTimeout(100);

    // Save
    saveBtn = page.locator('[data-testid="marker-save-5"]');
    await saveBtn.click();
    await page.waitForTimeout(200);

    // Verify endFrame is cleared
    endFrame = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.marks?.get(5)?.endFrame;
    });
    expect(endFrame).toBeUndefined();
  });

  // DM-007: Frame falls within duration marker range
  test('DM-007: isFrameInMarkerRange detects frames within duration markers', async ({ page }) => {
    await loadVideoFile(page);

    // Navigate to frame 10, add marker, then set endFrame=20 via panel UI
    await navigateToFrame(page, 10);
    await page.keyboard.press('m');
    await page.waitForTimeout(200);

    await openMarkerPanel(page);

    const editBtn = page.locator('[data-testid="marker-edit-10"]');
    await editBtn.click();
    await page.waitForTimeout(200);

    const noteInput = page.locator('[data-testid="marker-note-input-10"]');
    await noteInput.fill('Range check');

    const endFrameInput = page.locator('[data-testid="marker-endframe-input-10"]');
    await endFrameInput.fill('20');

    const saveBtn = page.locator('[data-testid="marker-save-10"]');
    await saveBtn.click();
    await page.waitForTimeout(200);

    // Check if frame 15 is within the marker range (read-only evaluate)
    const inRange = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.isFrameInMarkerRange?.(15);
    });
    expect(inRange).toBe(true);

    // Check if frame 25 is outside the range (read-only evaluate)
    const outOfRange = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.isFrameInMarkerRange?.(25);
    });
    expect(outOfRange).toBe(false);
  });

  // DM-008: Multiple duration markers can coexist
  test('DM-008: multiple duration markers can be created', async ({ page }) => {
    await loadVideoFile(page);

    // Create marker at frame 5
    await navigateToFrame(page, 5);
    await page.keyboard.press('m');
    await page.waitForTimeout(200);

    // Create marker at frame 15
    await navigateToFrame(page, 15);
    await page.keyboard.press('m');
    await page.waitForTimeout(200);

    // Create marker at frame 30
    await navigateToFrame(page, 30);
    await page.keyboard.press('m');
    await page.waitForTimeout(200);

    // Open marker panel and edit first marker (frame 5) to be a duration marker
    await openMarkerPanel(page);

    // Edit marker at frame 5: set note and endFrame=10
    let editBtn = page.locator('[data-testid="marker-edit-5"]');
    await editBtn.click();
    await page.waitForTimeout(200);

    let noteInput = page.locator('[data-testid="marker-note-input-5"]');
    await noteInput.fill('Scene A');
    let endFrameInput = page.locator('[data-testid="marker-endframe-input-5"]');
    await endFrameInput.fill('10');
    let saveBtn = page.locator('[data-testid="marker-save-5"]');
    await saveBtn.click();
    await page.waitForTimeout(200);

    // Edit marker at frame 15: set note and endFrame=25
    editBtn = page.locator('[data-testid="marker-edit-15"]');
    await editBtn.click();
    await page.waitForTimeout(200);

    noteInput = page.locator('[data-testid="marker-note-input-15"]');
    await noteInput.fill('Scene B');
    endFrameInput = page.locator('[data-testid="marker-endframe-input-15"]');
    await endFrameInput.fill('25');
    saveBtn = page.locator('[data-testid="marker-save-15"]');
    await saveBtn.click();
    await page.waitForTimeout(200);

    // Edit marker at frame 30: set note only (point marker)
    editBtn = page.locator('[data-testid="marker-edit-30"]');
    await editBtn.click();
    await page.waitForTimeout(200);

    noteInput = page.locator('[data-testid="marker-note-input-30"]');
    await noteInput.fill('Point marker');
    saveBtn = page.locator('[data-testid="marker-save-30"]');
    await saveBtn.click();
    await page.waitForTimeout(200);

    // Verify all markers exist
    const state = await getSessionState(page);
    expect(state.markers.length).toBe(3);

    // Verify endFrames via read-only evaluate
    const endFrames = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      const marks = app?.session?.marks;
      return {
        ef5: marks?.get(5)?.endFrame,
        ef15: marks?.get(15)?.endFrame,
        ef30: marks?.get(30)?.endFrame,
      };
    });
    expect(endFrames.ef5).toBe(10);
    expect(endFrames.ef15).toBe(25);
    expect(endFrames.ef30).toBeUndefined();
  });

  // DM-009: Marker panel shows end frame editing
  test('DM-009: marker list panel is accessible', async ({ page }) => {
    await loadVideoFile(page);

    // Create a marker via keyboard
    await page.keyboard.press('m');
    await page.waitForTimeout(200);

    // The marker list panel should exist in the DOM
    const panel = page.locator('[data-testid="marker-list-panel"]');
    // Panel may be hidden by default; check it exists
    await expect(panel).toBeAttached();
  });

  // DM-010: Duration marker endFrame must be greater than start frame
  test('DM-010: endFrame must be greater than start frame', async ({ page }) => {
    await loadVideoFile(page);

    // Navigate to frame 10 and add a marker
    await navigateToFrame(page, 10);
    await page.keyboard.press('m');
    await page.waitForTimeout(200);

    // Open marker panel and try to set an invalid endFrame (5 < 10)
    await openMarkerPanel(page);

    const editBtn = page.locator('[data-testid="marker-edit-10"]');
    await editBtn.click();
    await page.waitForTimeout(200);

    const noteInput = page.locator('[data-testid="marker-note-input-10"]');
    await noteInput.fill('Invalid range');

    const endFrameInput = page.locator('[data-testid="marker-endframe-input-10"]');
    await endFrameInput.fill('5'); // endFrame < frame, should be treated as invalid

    const saveBtn = page.locator('[data-testid="marker-save-10"]');
    await saveBtn.click();
    await page.waitForTimeout(200);

    // The marker should exist but without endFrame (since 5 < 10 is invalid)
    const endFrame = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.marks?.get(10)?.endFrame;
    });
    expect(endFrame).toBeUndefined();
  });
});
