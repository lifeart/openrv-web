import { test, expect } from './fixtures';

test.describe('Application Initialization', () => {
  test('APP-001: should load the application without errors', async ({ page }) => {
    await page.goto('/');

    // App container should exist
    await expect(page.locator('#app')).toBeVisible();

    // Should have no console errors
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });

  test('APP-002: should render main UI components', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Header bar should be visible (check for header-bar class)
    const header = page.locator('.header-bar');
    await expect(header).toBeVisible();

    // Canvas should be present
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });

  test('APP-003: should display tab bar with all tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Check all tabs exist by their data-tab-id attribute
    const tabIds = ['view', 'color', 'effects', 'transform', 'annotate'];
    for (const tabId of tabIds) {
      const tab = page.locator(`button[data-tab-id="${tabId}"]`);
      await expect(tab).toBeVisible();
    }
  });

  test('APP-004: should have View tab selected by default', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // View tab should be active by default (white text color)
    const viewTab = page.locator('button[data-tab-id="view"]');
    await expect(viewTab).toBeVisible();
    // The active tab has white color (#fff) vs inactive (#888)
    const color = await viewTab.evaluate(el => getComputedStyle(el).color);
    expect(color).toBe('rgb(255, 255, 255)');
  });

  test('APP-005: should have playback controls in header', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Play button should exist (check by title)
    const playButton = page.locator('button[title*="Play/Pause"]');
    await expect(playButton).toBeVisible();

    // Frame step buttons
    const stepBackButton = page.locator('button[title*="Step back"]');
    await expect(stepBackButton).toBeVisible();
  });

  test('APP-006: should have file open button', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Folder/Open button should exist
    const openButton = page.locator('button[title*="Open media"]');
    await expect(openButton).toBeVisible();
  });

  test('APP-007: should have timeline component', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Timeline should be present (canvas element in timeline area)
    const timeline = page.locator('canvas').last();
    await expect(timeline).toBeVisible();
  });

  test('APP-008: should have context toolbar that changes with tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Click View tab - should show zoom controls
    await page.click('button[data-tab-id="view"]');
    const fitButton = page.locator('button:has-text("Fit")');
    await expect(fitButton).toBeVisible();

    // Click Color tab - should show color controls
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);
    // Color tab should have exposure-related content
    const colorContent = page.locator('.context-toolbar');
    await expect(colorContent).toBeVisible();
  });

  test('APP-009: should have export controls', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Export button should exist
    const exportButton = page.locator('button:has-text("Export")').first();
    await expect(exportButton).toBeVisible();
  });

  test('APP-010: should have help button', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Help button should exist (check by title)
    const helpButton = page.locator('button[title="Keyboard shortcuts"]');
    await expect(helpButton).toBeVisible();
  });

  test('APP-011: should show keyboard shortcuts on help click', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Click help button
    const helpButton = page.locator('button[title="Keyboard shortcuts"]');
    await helpButton.click();

    // Modal with shortcuts should appear
    await page.waitForTimeout(200);
    const modal = page.getByRole('heading', { name: 'Keyboard Shortcuts' });
    await expect(modal).toBeVisible();

    // Should contain shortcuts info
    const shortcutsContent = page.locator('text=Space');
    await expect(shortcutsContent).toBeVisible();
  });

  test('APP-012: should have volume control', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Volume control container has class 'volume-control-container' with a mute button
    const volumeControl = page.locator('.volume-control-container, button[title*="mute"]').first();
    await expect(volumeControl).toBeVisible();
  });

  test('APP-013: should have responsive canvas', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(100);

    const canvas = page.locator('canvas').first();

    // Get initial size
    const initialBox = await canvas.boundingBox();
    expect(initialBox).not.toBeNull();

    // Resize window to smaller
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(300);

    const newBox = await canvas.boundingBox();
    expect(newBox).not.toBeNull();

    // Canvas should resize with window (or at least not be bigger)
    expect(newBox!.width).toBeLessThanOrEqual(initialBox!.width);
  });
});
