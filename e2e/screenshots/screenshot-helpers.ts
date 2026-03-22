/**
 * Screenshot helpers for documentation screenshot generation.
 *
 * These helpers wrap common patterns used across screenshot specs:
 * app initialization, media loading, viewport sizing, tab switching,
 * canvas stability detection, and file output.
 */

import { Page } from '@playwright/test';
import path from 'path';
import { waitForTestHelper, loadVideoFile } from '../fixtures';

/** Default output directory for documentation screenshots. */
const SCREENSHOT_OUTPUT_DIR = path.resolve(process.cwd(), 'docs/assets/screenshots');

/**
 * Wait for the WebGL/2D canvas to stop changing.
 * Compares consecutive page screenshots of the viewer area and resolves
 * once two frames in a row are identical (within tolerance).
 */
export async function waitForCanvasStable(page: Page, timeout = 5000): Promise<void> {
  const deadline = Date.now() + timeout;
  let previous: Buffer | null = null;

  while (Date.now() < deadline) {
    const current = await page.screenshot();
    if (previous && current.equals(previous)) {
      return;
    }
    previous = current;
    await page.waitForTimeout(250);
  }
  // Timed out waiting for stability -- proceed anyway so tests are not flaky.
}

/**
 * Set the page viewport to a fixed size for consistent screenshots.
 */
export async function setDocViewport(page: Page, width = 1440, height = 900): Promise<void> {
  await page.setViewportSize({ width, height });
}

/**
 * Navigate to the app, wait for the root element and test helper bridge.
 */
export async function initApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#app', { timeout: 10000 });
  await waitForTestHelper(page);
  await waitForCanvasStable(page, 3000);
}

/**
 * Initialize the app and load a sample video file.
 * Waits for media to be loaded and for canvas content to appear.
 */
export async function initWithVideo(page: Page): Promise<void> {
  await initApp(page);
  await loadVideoFile(page);
  await waitForCanvasStable(page);
}

/**
 * Take a documentation screenshot and save it to the screenshots output dir.
 *
 * @param page   Playwright Page instance
 * @param name   Screenshot name (without extension), e.g. '01-empty-app'
 * @param options  Optional clip region or element handle
 */
export async function takeDocScreenshot(
  page: Page,
  name: string,
  options?: {
    clip?: { x: number; y: number; width: number; height: number };
    fullPage?: boolean;
  },
): Promise<Buffer> {
  const filePath = path.join(SCREENSHOT_OUTPUT_DIR, `${name}.png`);
  const screenshot = await page.screenshot({
    path: filePath,
    type: 'png',
    ...(options?.clip ? { clip: options.clip } : {}),
    ...(options?.fullPage ? { fullPage: options.fullPage } : {}),
  });
  return screenshot;
}

/**
 * Take a screenshot of a specific element and save it to the output dir.
 */
export async function takeElementScreenshot(page: Page, name: string, selector: string): Promise<Buffer> {
  const filePath = path.join(SCREENSHOT_OUTPUT_DIR, `${name}.png`);
  const element = page.locator(selector).first();
  const screenshot = await element.screenshot({ path: filePath, type: 'png' });
  return screenshot;
}

/**
 * Switch to a tab by clicking the tab button with the given data-tab-id.
 */
export async function switchTab(page: Page, tabId: string): Promise<void> {
  const tab = page.locator(`button[data-tab-id="${tabId}"]`);
  await tab.click();
  // Allow the tab content to render
  await page.waitForTimeout(300);
}
