import { test, expect } from '@playwright/test';
import path from 'path';
import { waitForTestHelper, waitForMediaLoaded, getViewerState, canvasHasContent } from './fixtures';

/**
 * Integer TIFF, TGA and SGI load in Chromium, which has no native decoder
 * for any of them. Fixtures: test-assets/still-formats/ (Pillow/ImageMagick).
 */

const FIXTURES = path.resolve(process.cwd(), 'test-assets/still-formats');

const CASES = [
  { file: 'rgb16-tiled.tif', format: 'tiff-int' },
  { file: 'rgb8-lzw-pred.tif', format: 'tiff-int' },
  { file: 'rgba32-rle.tga', format: 'tga' },
  { file: 'rgb16-rle.sgi', format: 'sgi' },
];

test.describe('Still formats without browser support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  for (const { file, format } of CASES) {
    test(`STILL-E2E: ${file} loads and renders`, async ({ page }) => {
      await page.locator('input[type="file"]').first().setInputFiles(path.join(FIXTURES, file));
      await waitForMediaLoaded(page);

      await expect.poll(async () => (await getViewerState(page)).formatName).toBe(format);
      await expect.poll(() => canvasHasContent(page)).toBe(true);
    });
  }
});
