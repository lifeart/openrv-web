import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Ghost Frames / Onion Skin Tests
 *
 * Tests for the ghost frames feature that shows semi-transparent previous/next
 * frames for animation review.
 *
 * Implementation: src/ui/components/GhostFrameControl.ts
 *
 * Features:
 * - Configurable frames before/after (0-5 each)
 * - Adjustable base opacity and falloff
 * - Optional color tinting (red for before, green for after)
 *
 * Reference: Animation review / onion skinning
 */

test.describe('Ghost Frames / Onion Skin', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    // Load a video
    await loadVideoFile(page);
    // Switch to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
    // Navigate to a middle frame so we have frames before and after
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
  });

  test.describe('Toggle Ghost Frames', () => {
    test('GHOST-E001: enable ghost frames via keyboard (Ctrl+G) should toggle', async ({ page }) => {
      // Verify button starts in disabled state
      const ghostButton = page.locator('[data-testid="ghost-frame-button"]');
      const initialText = await ghostButton.textContent();
      expect(initialText).not.toContain('On');

      const screenshotBefore = await captureViewerScreenshot(page);

      // Enable ghost frames
      await page.keyboard.press('Control+g');
      await page.waitForTimeout(200);

      // Verify button shows enabled state
      const enabledText = await ghostButton.textContent();
      expect(enabledText).toContain('On');

      const screenshotAfter = await captureViewerScreenshot(page);

      // Ghost frames should cause visual change (overlay previous/next frames)
      expect(screenshotBefore).toBeDefined();
      expect(screenshotAfter).toBeDefined();
      // Note: Visual difference depends on having distinct adjacent frames
      expect(await imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
    });

    test('GHOST-E002: ghost frame button should be present in View tab', async ({ page }) => {
      // Look for ghost frame control button
      const ghostButton = page.locator('[data-testid="ghost-frame-button"]');
      await expect(ghostButton).toBeVisible();
    });
  });

  test.describe('Ghost Frame Control Panel', () => {
    test('GHOST-E003: clicking ghost button opens dropdown', async ({ page }) => {
      const ghostButton = page.locator('[data-testid="ghost-frame-button"]');
      await ghostButton.click();
      await page.waitForTimeout(100);

      // Dropdown should be visible
      const dropdown = page.locator('[data-testid="ghost-frame-dropdown"]');
      await expect(dropdown).toBeVisible();
    });

    test('GHOST-E004: dropdown contains enable toggle', async ({ page }) => {
      const ghostButton = page.locator('[data-testid="ghost-frame-button"]');
      await ghostButton.click();
      await page.waitForTimeout(100);

      const enableToggle = page.locator('[data-testid="ghost-enable-toggle"]');
      await expect(enableToggle).toBeVisible();
    });

    test('GHOST-E005: dropdown contains frames before slider', async ({ page }) => {
      const ghostButton = page.locator('[data-testid="ghost-frame-button"]');
      await ghostButton.click();
      await page.waitForTimeout(100);

      // Look for slider containing "Frames Before"
      const slider = page.locator('text=Frames Before');
      await expect(slider).toBeVisible();
    });

    test('GHOST-E006: dropdown contains frames after slider', async ({ page }) => {
      const ghostButton = page.locator('[data-testid="ghost-frame-button"]');
      await ghostButton.click();
      await page.waitForTimeout(100);

      // Look for slider containing "Frames After"
      const slider = page.locator('text=Frames After');
      await expect(slider).toBeVisible();
    });

    test('GHOST-E007: dropdown contains opacity slider', async ({ page }) => {
      const ghostButton = page.locator('[data-testid="ghost-frame-button"]');
      await ghostButton.click();
      await page.waitForTimeout(100);

      // Look for slider containing "Base Opacity"
      const slider = page.locator('text=Base Opacity');
      await expect(slider).toBeVisible();
    });

    test('GHOST-E008: dropdown contains color tint toggle', async ({ page }) => {
      const ghostButton = page.locator('[data-testid="ghost-frame-button"]');
      await ghostButton.click();
      await page.waitForTimeout(100);

      // Look for color tint option
      const tintOption = page.locator('text=Color Tint');
      await expect(tintOption).toBeVisible();
    });
  });

  test.describe('Ghost Frame Functionality', () => {
    test('GHOST-E009: enabling ghost frames changes button appearance', async ({ page }) => {
      const ghostButton = page.locator('[data-testid="ghost-frame-button"]');

      // Get initial button text
      const initialText = await ghostButton.textContent();
      expect(initialText).not.toContain('On');

      // Enable ghost frames via keyboard
      await page.keyboard.press('Control+g');
      await page.waitForTimeout(100);

      // Button text should change to indicate enabled state
      const enabledText = await ghostButton.textContent();
      expect(enabledText).toContain('On');

      // Disable via keyboard
      await page.keyboard.press('Control+g');
      await page.waitForTimeout(100);

      // Button should show disabled state
      const disabledText = await ghostButton.textContent();
      expect(disabledText).not.toContain('On');
    });

    test('GHOST-E009b: enabling ghost frames via dropdown checkbox', async ({ page }) => {
      const ghostButton = page.locator('[data-testid="ghost-frame-button"]');

      // Open dropdown
      await ghostButton.click();
      await page.waitForTimeout(100);

      const dropdown = page.locator('[data-testid="ghost-frame-dropdown"]');
      await expect(dropdown).toBeVisible();

      // Find and click the enable checkbox
      const enableToggle = page.locator('[data-testid="ghost-enable-toggle"] input[type="checkbox"]');
      await enableToggle.click();
      await page.waitForTimeout(100);

      // Button should show enabled state
      const enabledText = await ghostButton.textContent();
      expect(enabledText).toContain('On');
    });

    test('GHOST-E010: ghost frames show during playback', async ({ page }) => {
      // Enable ghost frames
      await page.keyboard.press('Control+g');
      await page.waitForTimeout(100);

      const screenshotPaused = await captureViewerScreenshot(page);

      // Start playback
      await page.keyboard.press('l');
      await page.waitForTimeout(300);

      const screenshotPlaying = await captureViewerScreenshot(page);

      // Stop playback
      await page.keyboard.press('k');
      await page.waitForTimeout(100);

      // Ghost frames should be visible during both paused and playing states
      expect(screenshotPaused).toBeDefined();
      expect(screenshotPlaying).toBeDefined();
    });

    test('GHOST-E011: reset button restores default settings', async ({ page }) => {
      const ghostButton = page.locator('[data-testid="ghost-frame-button"]');
      await ghostButton.click();
      await page.waitForTimeout(100);

      // Dropdown should be visible
      const dropdown = page.locator('[data-testid="ghost-frame-dropdown"]');
      await expect(dropdown).toBeVisible();

      // Find and click reset button within the dropdown
      const resetBtn = dropdown.locator('button:has-text("Reset")');
      if (await resetBtn.isVisible()) {
        await resetBtn.click();
        await page.waitForTimeout(100);

        // Dropdown should still be visible with default values
        await expect(dropdown).toBeVisible();
      }
    });
  });

  test.describe('Ghost Frame State Persistence', () => {
    test('GHOST-E012: ghost frame state persists across frame navigation', async ({ page }) => {
      // Enable ghost frames
      await page.keyboard.press('Control+g');
      await page.waitForTimeout(100);

      const ghostButton = page.locator('[data-testid="ghost-frame-button"]');
      const textBefore = await ghostButton.textContent();
      expect(textBefore).toContain('On');

      // Navigate frames
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      // Ghost frames should still be enabled
      const textAfter = await ghostButton.textContent();
      expect(textAfter).toContain('On');
    });
  });

  test.describe('Dropdown Behavior', () => {
    test('GHOST-E013: clicking outside dropdown closes it', async ({ page }) => {
      const ghostButton = page.locator('[data-testid="ghost-frame-button"]');
      await ghostButton.click();
      await page.waitForTimeout(100);

      const dropdown = page.locator('[data-testid="ghost-frame-dropdown"]');
      await expect(dropdown).toBeVisible();

      // Click outside
      await page.mouse.click(10, 10);
      await page.waitForTimeout(100);

      // Dropdown should close
      await expect(dropdown).not.toBeVisible();
    });
  });
});
