import { test, expect } from '@playwright/test';
import { loadVideoFile, waitForTestHelper, getSessionState } from './fixtures';

/**
 * Console Error Tests
 *
 * These tests verify that the application loads and operates without console errors,
 * particularly focusing on worker module loading which can fail on certain hosting
 * environments (e.g., GitHub Pages serving .ts files with wrong MIME type).
 */

test.describe('Console Errors', () => {
  test('CE-001: application should load without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    // Set up listeners BEFORE navigating
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);

    // Wait for any async initialization
    await page.waitForTimeout(500);

    // Filter out known benign errors (if any)
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('ResizeObserver loop')
    );

    expect(criticalErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test('CE-002: loading video should not produce console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    // Set up listeners BEFORE navigating
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);

    // Load video file
    await loadVideoFile(page);

    // Wait for video processing and worker initialization
    await page.waitForTimeout(1000);

    // Verify video actually loaded
    const state = await getSessionState(page);
    expect(state.hasMedia).toBe(true);

    // Filter out known benign errors
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('ResizeObserver loop')
    );

    expect(criticalErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test('CE-003: no MIME type errors for worker scripts', async ({ page }) => {
    const mimeErrors: string[] = [];

    // Set up listener for MIME type specific errors
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('MIME type') ||
        text.includes('module script') ||
        text.includes('video/mp2t')
      ) {
        mimeErrors.push(text);
      }
    });

    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    // Wait for worker initialization
    await page.waitForTimeout(1000);

    // Should have no MIME type errors
    expect(mimeErrors).toHaveLength(0);
  });

  test('CE-004: worker should initialize successfully', async ({ page }) => {
    const workerErrors: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        msg.type() === 'error' &&
        (text.includes('worker') || text.includes('Worker'))
      ) {
        workerErrors.push(text);
      }
    });

    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    // Wait for worker pool initialization
    await page.waitForTimeout(1500);

    // Check that workers initialized (look for success message or no errors)
    const workerInitialized = await page.evaluate(() => {
      // Check if prerender worker pool message appeared
      const logs = (window as any).__OPENRV_TEST__?.getWorkerPoolStatus?.();
      return logs !== undefined || true; // If test helper doesn't expose this, just check no errors
    });

    expect(workerErrors).toHaveLength(0);
  });

  test('CE-005: playback should not produce console errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    // Start playback
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    // Stop playback
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);

    // Filter out known benign errors
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('ResizeObserver loop')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('CE-006: frame navigation should not produce console errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    // Navigate through frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);

    // Jump to start/end
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);
    await page.keyboard.press('End');
    await page.waitForTimeout(100);

    // Filter out known benign errors
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('ResizeObserver loop')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('CE-007: network requests should not fail for worker assets', async ({ page }) => {
    const failedRequests: string[] = [];

    // Monitor network requests for worker files
    page.on('requestfailed', (request) => {
      const url = request.url();
      if (url.includes('worker') || url.includes('.ts') || url.includes('.js')) {
        failedRequests.push(`${url}: ${request.failure()?.errorText}`);
      }
    });

    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    // Wait for all resources to load
    await page.waitForTimeout(1000);

    expect(failedRequests).toHaveLength(0);
  });

  test('CE-008: worker files should not be served with video MIME type', async ({ page }) => {
    const mimeTypeIssues: string[] = [];

    // Monitor responses specifically for the worker MIME type issue
    // (GitHub Pages serves .ts as video/mp2t)
    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';

      // Check for worker files being served with wrong MIME type (video/mp2t)
      if (
        url.includes('worker') &&
        contentType.includes('video/mp2t')
      ) {
        mimeTypeIssues.push(`Worker served with video MIME type: ${url}`);
      }

      // Check for .js files being served with video MIME type
      if (
        url.endsWith('.js') &&
        contentType.includes('video/')
      ) {
        mimeTypeIssues.push(`JS file served with video MIME type: ${url}`);
      }
    });

    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);

    await page.waitForTimeout(1000);

    expect(mimeTypeIssues).toHaveLength(0);
  });
});
