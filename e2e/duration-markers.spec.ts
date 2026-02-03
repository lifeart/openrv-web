import { test, expect } from '@playwright/test';
import { loadVideoFile, getSessionState, waitForTestHelper } from './fixtures';

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

  // DM-003: Add a duration marker via scripting API
  test('DM-003: scripting API can create duration markers with endFrame', async ({ page }) => {
    await loadVideoFile(page);

    // Create a marker with a range (frame 5 to frame 15) via session
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.setMarker(5, 'Test range marker', '#ff0000', 15);
      }
    });
    await page.waitForTimeout(200);

    const state = await getSessionState(page);
    expect(state.markers.length).toBe(1);
    expect(state.markers[0]?.frame).toBe(5);
    expect(state.markers[0]?.note).toBe('Test range marker');

    // Verify the endFrame is set by checking the session directly
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

    // Create a duration marker
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.setMarker(3, 'Scene A', '#00ff00', 10);
      }
    });
    await page.waitForTimeout(200);

    // Timeline canvas should still be visible and rendering
    const timelineCanvas = page.locator('[data-testid="timeline-canvas"]');
    await expect(timelineCanvas).toBeVisible();
  });

  // DM-005: Set end frame for existing marker
  test('DM-005: setMarkerEndFrame converts point marker to duration marker', async ({ page }) => {
    await loadVideoFile(page);

    // Create a point marker first
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.setMarker(10, 'Convert me', '#ff6600');
      }
    });
    await page.waitForTimeout(100);

    // Convert to duration marker
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.setMarkerEndFrame(10, 20);
      }
    });
    await page.waitForTimeout(100);

    const endFrame = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.marks?.get(10)?.endFrame;
    });
    expect(endFrame).toBe(20);
  });

  // DM-006: Remove end frame to revert to point marker
  test('DM-006: clearing endFrame reverts to point marker', async ({ page }) => {
    await loadVideoFile(page);

    // Create a duration marker
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.setMarker(5, 'Duration test', '#cc0000', 15);
      }
    });
    await page.waitForTimeout(100);

    // Remove end frame
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.setMarkerEndFrame(5, undefined);
      }
    });
    await page.waitForTimeout(100);

    const endFrame = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.marks?.get(5)?.endFrame;
    });
    expect(endFrame).toBeUndefined();
  });

  // DM-007: Frame falls within duration marker range
  test('DM-007: isFrameInMarkerRange detects frames within duration markers', async ({ page }) => {
    await loadVideoFile(page);

    // Create a duration marker from frame 10 to 20
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.setMarker(10, 'Range check', '#0066ff', 20);
      }
    });
    await page.waitForTimeout(100);

    // Check if frame 15 is within the marker range
    const inRange = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.isFrameInMarkerRange?.(15);
    });
    expect(inRange).toBe(true);

    // Check if frame 25 is outside the range
    const outOfRange = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.isFrameInMarkerRange?.(25);
    });
    expect(outOfRange).toBe(false);
  });

  // DM-008: Multiple duration markers can coexist
  test('DM-008: multiple duration markers can be created', async ({ page }) => {
    await loadVideoFile(page);

    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.setMarker(5, 'Scene A', '#ff0000', 10);
        app.session.setMarker(15, 'Scene B', '#00ff00', 25);
        app.session.setMarker(30, 'Point marker', '#0000ff');
      }
    });
    await page.waitForTimeout(200);

    const state = await getSessionState(page);
    expect(state.markers.length).toBe(3);

    // Verify both duration markers and point marker
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

    // Create a marker
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

    // Attempt to create a marker with endFrame <= frame (should be ignored)
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.setMarker(10, 'Invalid range', '#ff0000', 5); // endFrame < frame
      }
    });
    await page.waitForTimeout(100);

    // The marker should exist but without endFrame (since 5 < 10 is invalid)
    const endFrame = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.marks?.get(10)?.endFrame;
    });
    expect(endFrame).toBeUndefined();
  });
});
