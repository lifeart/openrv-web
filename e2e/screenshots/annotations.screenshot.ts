/**
 * Annotation Screenshots (39-42)
 *
 * Captures documentation-quality screenshots of annotation features:
 * shape tools, text annotations, ghost mode, and export menu.
 */

import { test, expect } from '@playwright/test';
import { initWithVideo, takeDocScreenshot, switchTab, waitForCanvasStable } from './screenshot-helpers';

test.describe('Annotation Screenshots', () => {
  // ── 39: Shape annotation tools ──────────────────────────────────────

  test('39-annotation-shapes', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'annotate');

    // Select rectangle tool (R) and draw a rectangle
    await page.keyboard.press('r');
    await page.waitForTimeout(200);

    const canvas = page.locator('.viewer-container').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Draw a rectangle (top-left area)
    await page.mouse.move(cx - 200, cy - 100);
    await page.mouse.down();
    await page.mouse.move(cx - 50, cy + 20, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Select ellipse tool (O) and draw an ellipse
    await page.keyboard.press('o');
    await page.waitForTimeout(200);
    await page.mouse.move(cx + 50, cy - 80);
    await page.mouse.down();
    await page.mouse.move(cx + 200, cy + 20, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Select arrow tool (A) and draw an arrow
    await page.keyboard.press('a');
    await page.waitForTimeout(200);
    await page.mouse.move(cx - 150, cy + 60);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy + 100, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '39-annotation-shapes');
  });

  // ── 40: Text annotations ────────────────────────────────────────────

  test('40-annotation-text', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'annotate');

    // Select text tool (T)
    await page.keyboard.press('t');
    await page.waitForTimeout(200);

    const canvas = page.locator('.viewer-container').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Click on canvas to place a text annotation
    await page.mouse.click(cx - 100, cy - 50);
    await page.waitForTimeout(300);

    // Type review note text into the textarea overlay
    const textOverlay1 = page.locator('[data-testid="text-input-overlay"]').first();
    await textOverlay1.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await page.keyboard.type('Fix edge artifact here', { delay: 20 });
    await page.waitForTimeout(200);

    // Click elsewhere to commit first text, then place a second
    await page.mouse.click(cx + 80, cy + 80);
    await page.waitForTimeout(500);

    // Type second annotation
    const textOverlay2 = page.locator('[data-testid="text-input-overlay"]').first();
    await textOverlay2.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await page.keyboard.type('Check color shift', { delay: 20 });
    await page.waitForTimeout(200);

    // Press Escape to commit the text and dismiss overlay
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '40-annotation-text');
  });

  // ── 41: Ghost mode (onion-skin annotations) ────────────────────────

  test('41-ghost-mode', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'annotate');

    // Select pen tool (paint.pen -> KeyP)
    await page.keyboard.press('p');
    await page.waitForTimeout(200);

    const canvas = page.locator('.viewer-container').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Draw annotation on frame 10
    await page.evaluate((f) => {
      window.__OPENRV_TEST__?.seekToFrame?.(f);
    }, 10);
    await page.waitForTimeout(300);
    await page.mouse.move(cx - 120, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy - 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Draw annotation on frame 11
    await page.evaluate((f) => {
      window.__OPENRV_TEST__?.seekToFrame?.(f);
    }, 11);
    await page.waitForTimeout(300);
    await page.mouse.move(cx - 100, cy + 30);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy + 60, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Draw annotation on frame 12
    await page.evaluate((f) => {
      window.__OPENRV_TEST__?.seekToFrame?.(f);
    }, 12);
    await page.waitForTimeout(300);
    await page.mouse.move(cx - 80, cy + 80);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 110, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Seek to frame 11 and enable ghost mode
    await page.evaluate((f) => {
      window.__OPENRV_TEST__?.seekToFrame?.(f);
    }, 11);
    await page.waitForTimeout(300);

    // Press G to toggle ghost mode for annotations
    await page.keyboard.press('g');
    await page.waitForTimeout(500);

    await waitForCanvasStable(page, 2000);
    await takeDocScreenshot(page, '41-ghost-mode');
  });

  // ── 42: Annotation export menu ──────────────────────────────────────

  test('42-annotation-export-menu', async ({ page }) => {
    await initWithVideo(page);
    await switchTab(page, 'annotate');

    // Draw a quick annotation so export options are available
    await page.keyboard.press('p');
    await page.waitForTimeout(200);

    const canvas = page.locator('.viewer-container').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    await page.mouse.move(cx - 50, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 50, cy, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Open the Export dropdown menu in header bar
    const exportButton = page
      .locator('[title*="Export"], [aria-label*="Export"], .export-control-container button')
      .first();
    await exportButton.click();
    await page.waitForTimeout(500);

    // Ensure dropdown is visible
    await page.locator('.export-dropdown').first().waitFor({ state: 'visible', timeout: 3000 });

    await takeDocScreenshot(page, '42-annotation-export-menu');
  });
});
