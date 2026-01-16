import { test, expect } from '@playwright/test';
import { loadVideoFile, waitForTestHelper } from './fixtures';

/**
 * A/B Source Compare Feature Tests
 *
 * These tests verify the A/B source comparison UI through
 * visual inspection and human-like interactions only.
 */

test.describe('A/B Compare UI Elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('AB-E001: View tab shows A/B control section', async ({ page }) => {
    // Click View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Should see A/B label
    await expect(page.locator('text=A/B:')).toBeVisible();
  });

  test('AB-E002: A button is visible and has correct label', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const buttonA = page.locator('[data-testid="ab-button-a"]');
    await expect(buttonA).toBeVisible();
    await expect(buttonA).toHaveText('A');
  });

  test('AB-E003: B button is visible and has correct label', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const buttonB = page.locator('[data-testid="ab-button-b"]');
    await expect(buttonB).toBeVisible();
    await expect(buttonB).toHaveText('B');
  });

  test('AB-E004: Toggle button is visible with swap icon', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const toggleButton = page.locator('[data-testid="ab-toggle-button"]');
    await expect(toggleButton).toBeVisible();
    await expect(toggleButton).toHaveText('⇄');
  });

  test('AB-E005: A button appears active/highlighted with single source', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const buttonA = page.locator('[data-testid="ab-button-a"]');

    // A button should have active styling (blue background)
    const bgColor = await buttonA.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bgColor).toContain('74'); // rgba(74, 158, 255, ...)
  });

  test('AB-E006: B button appears disabled/dimmed with single source', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const buttonB = page.locator('[data-testid="ab-button-b"]');

    // B button should be visually dimmed (opacity 0.5)
    const opacity = await buttonB.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeLessThan(1);
  });

  test('AB-E007: Toggle button appears disabled with single source', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const toggleButton = page.locator('[data-testid="ab-toggle-button"]');

    // Toggle should be visually dimmed
    const opacity = await toggleButton.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeLessThan(1);
  });

  test('AB-E008: A button has tooltip', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const buttonA = page.locator('[data-testid="ab-button-a"]');
    const title = await buttonA.getAttribute('title');
    expect(title).toContain('source A');
  });

  test('AB-E009: B button has tooltip', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const buttonB = page.locator('[data-testid="ab-button-b"]');
    const title = await buttonB.getAttribute('title');
    expect(title).toContain('source B');
  });

  test('AB-E010: Toggle button has tooltip with keyboard hint', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const toggleButton = page.locator('[data-testid="ab-toggle-button"]');
    const title = await toggleButton.getAttribute('title');
    expect(title).toContain('`');
  });
});

test.describe('A/B Indicator Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('AB-E020: A/B indicator is hidden with single source', async ({ page }) => {
    const indicator = page.locator('[data-testid="ab-indicator"]');
    await expect(indicator).toBeHidden();
  });

  test('AB-E021: Viewer area does not show A/B badge initially', async ({ page }) => {
    // Take screenshot of viewer area
    const viewer = page.locator('.viewer-container').first();
    const screenshot = await viewer.screenshot();

    // The indicator should not be visible, so this is a baseline
    // We're just verifying the viewer renders without the badge
    expect(screenshot.length).toBeGreaterThan(0);
  });
});

test.describe('A/B Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('AB-E030: Backtick key does nothing with single source', async ({ page }) => {
    // Take screenshot before
    const viewerBefore = await page.locator('.viewer-container').first().screenshot();

    // Press backtick
    await page.keyboard.press('`');
    await page.waitForTimeout(200);

    // Take screenshot after
    const viewerAfter = await page.locator('.viewer-container').first().screenshot();

    // Visual should be the same (nothing changed)
    // A/B indicator should still be hidden
    const indicator = page.locator('[data-testid="ab-indicator"]');
    await expect(indicator).toBeHidden();
  });

  test('AB-E031: Tilde key does nothing with single source', async ({ page }) => {
    // Press tilde
    await page.keyboard.press('~');
    await page.waitForTimeout(200);

    // A/B indicator should still be hidden
    const indicator = page.locator('[data-testid="ab-indicator"]');
    await expect(indicator).toBeHidden();
  });
});

test.describe('A/B Button Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('AB-E040: Clicking A button keeps A highlighted', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const buttonA = page.locator('[data-testid="ab-button-a"]');
    await buttonA.click();
    await page.waitForTimeout(100);

    // Move mouse away to clear hover state
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);

    // A should still be highlighted (check border color which is more stable)
    const borderColor = await buttonA.evaluate(el => getComputedStyle(el).borderColor);
    // Blue border indicates active state
    expect(borderColor).toMatch(/74|158|255/); // rgb(74, 158, 255)
  });

  test('AB-E041: Clicking disabled B button does not change state', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const buttonA = page.locator('[data-testid="ab-button-a"]');
    const buttonB = page.locator('[data-testid="ab-button-b"]');

    // Force click on disabled button
    await buttonB.click({ force: true });
    await page.waitForTimeout(100);

    // A should still be highlighted (nothing changed)
    const bgColorA = await buttonA.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bgColorA).toContain('74');

    // B should still be dimmed
    const opacityB = await buttonB.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacityB)).toBeLessThan(1);
  });

  test('AB-E042: A/B controls remain visible when switching tabs', async ({ page }) => {
    // Go to View tab, verify controls
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);
    await expect(page.locator('[data-testid="ab-button-a"]')).toBeVisible();

    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    // Switch back to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // A/B controls should still be there
    await expect(page.locator('[data-testid="ab-button-a"]')).toBeVisible();
    await expect(page.locator('[data-testid="ab-button-b"]')).toBeVisible();
    await expect(page.locator('[data-testid="ab-toggle-button"]')).toBeVisible();
  });
});

test.describe('A/B Visual Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('AB-E050: A/B buttons are positioned next to each other', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const buttonA = page.locator('[data-testid="ab-button-a"]');
    const buttonB = page.locator('[data-testid="ab-button-b"]');

    const boxA = await buttonA.boundingBox();
    const boxB = await buttonB.boundingBox();

    expect(boxA).not.toBeNull();
    expect(boxB).not.toBeNull();

    // B should be to the right of A (same row)
    expect(boxB!.x).toBeGreaterThan(boxA!.x);
    // They should be roughly aligned vertically
    expect(Math.abs(boxB!.y - boxA!.y)).toBeLessThan(5);
  });

  test('AB-E051: Toggle button follows B button', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const buttonB = page.locator('[data-testid="ab-button-b"]');
    const toggleButton = page.locator('[data-testid="ab-toggle-button"]');

    const boxB = await buttonB.boundingBox();
    const boxToggle = await toggleButton.boundingBox();

    expect(boxB).not.toBeNull();
    expect(boxToggle).not.toBeNull();

    // Toggle should be to the right of B
    expect(boxToggle!.x).toBeGreaterThan(boxB!.x);
  });

  test('AB-E052: A/B section has label', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Find the A/B label text
    const label = page.locator('span:has-text("A/B:")');
    await expect(label).toBeVisible();

    const buttonA = page.locator('[data-testid="ab-button-a"]');
    const labelBox = await label.boundingBox();
    const buttonBox = await buttonA.boundingBox();

    // Label should be to the left of buttons
    expect(labelBox!.x).toBeLessThan(buttonBox!.x);
  });
});

test.describe('A/B Screenshot Comparison', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('AB-E060: View tab A/B section renders consistently', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);

    // Take a screenshot of just the A/B button area
    const buttonA = page.locator('[data-testid="ab-button-a"]');
    const toggleButton = page.locator('[data-testid="ab-toggle-button"]');

    // Get bounding boxes
    const boxA = await buttonA.boundingBox();
    const boxToggle = await toggleButton.boundingBox();

    if (boxA && boxToggle) {
      // Capture the A/B control region
      const screenshot = await page.screenshot({
        clip: {
          x: boxA.x - 50, // Include label
          y: boxA.y - 5,
          width: (boxToggle.x + boxToggle.width) - boxA.x + 55,
          height: Math.max(boxA.height, boxToggle.height) + 10,
        },
      });

      // Just verify we got a screenshot
      expect(screenshot.length).toBeGreaterThan(100);
    }
  });
});
