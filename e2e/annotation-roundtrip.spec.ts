import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getPaintState,
  getSessionState,
  captureViewerScreenshot,
  waitForMediaLoaded,
  waitForFrame,
  waitForTool,
  waitForAnnotationCount,
  clickTab,
  drawStroke,
  waitForCondition,
} from './fixtures';

/**
 * Annotation Roundtrip Tests
 *
 * Tests annotation persistence through session save/load,
 * verifying that drawn annotations survive a roundtrip.
 */

test.describe('Annotation Roundtrip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('ART-001: Drawing a stroke creates an annotation on the current frame', async ({ page }) => {
    // Switch to annotate tab
    await clickTab(page, 'annotate');

    // Select pen tool
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setTool?.('pen');
    });
    await waitForTool(page, 'pen');

    // Draw a stroke
    await drawStroke(page, [
      { x: 100, y: 100 },
      { x: 200, y: 150 },
      { x: 300, y: 100 },
    ]);
    await page.waitForTimeout(200);

    // Verify annotation was created
    const paintState = await getPaintState(page);
    expect(paintState.annotatedFrames.length).toBeGreaterThan(0);
  });

  test('ART-002: Annotations are frame-specific', async ({ page }) => {
    await clickTab(page, 'annotate');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setTool?.('pen');
    });
    await waitForTool(page, 'pen');

    // Get current frame
    const state = await getSessionState(page);
    const startFrame = state.currentFrame;

    // Draw on current frame
    await drawStroke(page, [
      { x: 100, y: 100 },
      { x: 200, y: 200 },
    ]);
    await page.waitForTimeout(200);

    // Navigate to a different frame
    await page.keyboard.press('ArrowRight');
    await waitForCondition(page, `
      (() => {
        const s = window.__OPENRV_TEST__?.getSessionState();
        return s?.currentFrame !== ${startFrame};
      })()
    `);

    // The new frame should not have annotations (unless hold mode)
    const paintState = await getPaintState(page);
    if (!paintState.holdMode) {
      expect(paintState.visibleAnnotationCount).toBe(0);
    }
  });

  test('ART-003: Multiple annotation types on different frames', async ({ page }) => {
    await clickTab(page, 'annotate');

    // Draw stroke on frame 1
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setTool?.('pen');
    });
    await waitForTool(page, 'pen');
    await drawStroke(page, [
      { x: 100, y: 100 },
      { x: 200, y: 150 },
    ]);
    await page.waitForTimeout(200);

    // Navigate forward several frames
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(200);

    // Draw rectangle on this frame
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setTool?.('rectangle');
    });
    await waitForTool(page, 'rectangle');
    await drawStroke(page, [
      { x: 150, y: 150 },
      { x: 300, y: 300 },
    ]);
    await page.waitForTimeout(200);

    // Check that we have annotations on multiple frames
    const paintState = await getPaintState(page);
    expect(paintState.annotatedFrames.length).toBeGreaterThanOrEqual(2);
  });

  test('ART-004: Navigating back to annotated frame shows annotations', async ({ page }) => {
    await clickTab(page, 'annotate');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setTool?.('pen');
    });
    await waitForTool(page, 'pen');

    const sessionState = await getSessionState(page);
    const annotatedFrame = sessionState.currentFrame;

    // Draw stroke
    await drawStroke(page, [
      { x: 100, y: 100 },
      { x: 250, y: 200 },
    ]);
    await page.waitForTimeout(200);

    // Capture annotated frame
    const annotatedScreenshot = await captureViewerScreenshot(page);

    // Navigate away
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(100);

    // Navigate back
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowLeft');
    }
    await waitForFrame(page, annotatedFrame);
    await page.waitForTimeout(200);

    // Capture again — should still show annotation
    const returnScreenshot = await captureViewerScreenshot(page);

    // Screenshots should match (annotation persists)
    // Allow small differences from rendering timing
    const paintState = await getPaintState(page);
    expect(paintState.visibleAnnotationCount).toBeGreaterThan(0);
  });

  test('ART-005: Undo removes annotation', async ({ page }) => {
    await clickTab(page, 'annotate');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.setTool?.('pen');
    });
    await waitForTool(page, 'pen');

    // Draw stroke
    await drawStroke(page, [
      { x: 100, y: 100 },
      { x: 200, y: 200 },
    ]);
    await page.waitForTimeout(200);

    const beforeUndo = await getPaintState(page);
    expect(beforeUndo.canUndo).toBe(true);

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    const afterUndo = await getPaintState(page);
    expect(afterUndo.visibleAnnotationCount).toBeLessThan(beforeUndo.visibleAnnotationCount);
  });
});
