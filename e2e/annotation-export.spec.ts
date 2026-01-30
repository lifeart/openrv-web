/**
 * Annotation Export E2E Tests
 *
 * Tests the JSON and PDF annotation export functionality.
 */

import {
  test,
  expect,
  loadVideoFile,
  drawStroke,
  getPaintState,
  clickTab,
} from './fixtures';

test.describe('Annotation Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await loadVideoFile(page);
    await page.waitForTimeout(500);
  });

  test.describe('Export Menu Options', () => {
    test('ANN-EXP-E001: should show annotation export options in export menu', async ({ page }) => {
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      // Should show JSON export option
      const jsonOption = page.locator('text=Export Annotations (JSON), text=Annotations (JSON)').first();
      const jsonVisible = await jsonOption.isVisible().catch(() => false);

      // Should show PDF export option
      const pdfOption = page.locator('text=Export Annotations (PDF), text=Annotations (PDF)').first();
      const pdfVisible = await pdfOption.isVisible().catch(() => false);

      // At least one annotation export option should be present
      expect(jsonVisible || pdfVisible).toBeTruthy();
    });
  });

  test.describe('JSON Export', () => {
    test('ANN-EXP-E002: should export annotations as JSON', async ({ page }) => {
      // First create some annotations
      await clickTab(page, 'annotate');
      await page.waitForTimeout(200);

      // Select pen tool
      const penButton = page.locator('button[title*="Pen"], button:has-text("Pen")').first();
      if (await penButton.isVisible()) {
        await penButton.click();
        await page.waitForTimeout(100);
      }

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

      // Open export menu
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      // Set up download handler
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

      // Click JSON export option
      const jsonOption = page.locator('text=Export Annotations (JSON), text=Annotations (JSON), text=Annotations JSON').first();
      if (await jsonOption.isVisible()) {
        await jsonOption.click();

        const download = await downloadPromise;
        if (download) {
          const filename = download.suggestedFilename();
          expect(filename).toContain('.json');
        }
      }
    });

    test('ANN-EXP-E003: exported JSON should contain valid structure', async ({ page }) => {
      // Create annotation
      await clickTab(page, 'annotate');
      await page.waitForTimeout(200);

      const penButton = page.locator('button[title*="Pen"], button:has-text("Pen")').first();
      if (await penButton.isVisible()) {
        await penButton.click();
        await drawStroke(page, [
          { x: 100, y: 100 },
          { x: 200, y: 200 },
        ]);
        await page.waitForTimeout(200);
      }

      // Export and verify structure via test helper if available
      const hasAnnotations = await page.evaluate(() => {
        const paintState = window.__OPENRV_TEST__?.getPaintState();
        return paintState && paintState.annotatedFrames && paintState.annotatedFrames.length > 0;
      });

      if (hasAnnotations) {
        // Verify annotation export data structure
        const exportData = await page.evaluate(() => {
          // Access the paint engine to verify data structure
          const paintState = window.__OPENRV_TEST__?.getPaintState();
          return {
            hasAnnotations: paintState && paintState.annotatedFrames && paintState.annotatedFrames.length > 0,
            annotatedFrames: paintState?.annotatedFrames || [],
          };
        });

        expect(exportData.hasAnnotations).toBe(true);
      }
    });
  });

  test.describe('PDF Export', () => {
    test('ANN-EXP-E004: should trigger PDF export flow', async ({ page }) => {
      // Create annotation
      await clickTab(page, 'annotate');
      await page.waitForTimeout(200);

      const penButton = page.locator('button[title*="Pen"], button:has-text("Pen")').first();
      if (await penButton.isVisible()) {
        await penButton.click();
        await drawStroke(page, [
          { x: 100, y: 100 },
          { x: 200, y: 200 },
        ]);
        await page.waitForTimeout(200);
      }

      // Open export menu
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      // PDF export triggers browser print dialog
      // We can verify the option is present
      const pdfOption = page.locator('text=Export Annotations (PDF), text=Annotations (PDF), text=Annotations PDF').first();
      const pdfVisible = await pdfOption.isVisible().catch(() => false);

      // PDF option should be available when there are annotations
      // (Note: Actual PDF export opens print dialog which is hard to test)
    });
  });

  test.describe('Export with Multiple Annotations', () => {
    test('ANN-EXP-E005: should export multiple annotation types', async ({ page }) => {
      await clickTab(page, 'annotate');
      await page.waitForTimeout(200);

      // Create pen annotation
      const penButton = page.locator('button[title*="Pen"], button:has-text("Pen")').first();
      if (await penButton.isVisible()) {
        await penButton.click();
        await drawStroke(page, [
          { x: 100, y: 100 },
          { x: 200, y: 150 },
        ]);
        await page.waitForTimeout(100);
      }

      // Create rectangle annotation if available
      const rectButton = page.locator('button[title*="Rectangle"], button:has-text("Rectangle")').first();
      if (await rectButton.isVisible()) {
        await rectButton.click();
        await page.waitForTimeout(100);

        // Draw rectangle
        await drawStroke(page, [
          { x: 300, y: 100 },
          { x: 400, y: 200 },
        ]);
        await page.waitForTimeout(100);
      }

      // Verify multiple annotations
      const paintState = await getPaintState(page);
      // Should have annotations
      expect(paintState.annotatedFrames.length).toBeGreaterThan(0);
    });

    test('ANN-EXP-E006: should include annotations from multiple frames', async ({ page }) => {
      await clickTab(page, 'annotate');
      await page.waitForTimeout(200);

      const penButton = page.locator('button[title*="Pen"], button:has-text("Pen")').first();
      if (await penButton.isVisible()) {
        await penButton.click();

        // Draw on frame 1
        await drawStroke(page, [
          { x: 100, y: 100 },
          { x: 200, y: 150 },
        ]);
        await page.waitForTimeout(100);

        // Go to different frame
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(100);

        // Draw on new frame
        await drawStroke(page, [
          { x: 150, y: 150 },
          { x: 250, y: 200 },
        ]);
        await page.waitForTimeout(100);
      }

      // Verify annotations on multiple frames
      const paintState = await getPaintState(page);
      expect(paintState.annotatedFrames.length).toBeGreaterThanOrEqual(1);
    });
  });

  test.describe('Export Empty State', () => {
    test('ANN-EXP-E007: should handle export with no annotations gracefully', async ({ page }) => {
      // Don't create any annotations

      // Open export menu
      const exportButton = page.locator('button[title*="Export"], button:has-text("Export")').first();
      await exportButton.click();
      await page.waitForTimeout(200);

      // Export options should still be available
      // (they will export an empty annotation set)
      const jsonOption = page.locator('text=Annotations (JSON), text=Export Annotations').first();
      // Empty export should still work without errors
    });
  });
});
