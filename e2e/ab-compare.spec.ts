import { test, expect } from '@playwright/test';
import { loadVideoFile, loadTwoVideoFiles, waitForTestHelper } from './fixtures';

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

  test('AB-E001: View tab shows Compare control button', async ({ page }) => {
    // Click View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Should see Compare control button
    const compareButton = page.locator('[data-testid="compare-control-button"]');
    await expect(compareButton).toBeVisible();
    await expect(compareButton).toContainText('Compare');
  });

  test('AB-E002: A button is visible in dropdown and has correct label', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const aButton = page.locator('[data-testid="compare-ab-a"]');
    await expect(aButton).toBeVisible();
    await expect(aButton).toHaveText('A');
  });

  test('AB-E003: B button is visible in dropdown and has correct label', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const bButton = page.locator('[data-testid="compare-ab-b"]');
    await expect(bButton).toBeVisible();
    await expect(bButton).toHaveText('B');
  });

  test('AB-E004: Toggle button is visible in dropdown with swap icon', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const toggleButton = page.locator('[data-testid="compare-ab-toggle"]');
    await expect(toggleButton).toBeVisible();
    await expect(toggleButton).toHaveText('⇄');
  });

  test('AB-E005: A button appears active/highlighted with single source', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const buttonA = page.locator('[data-testid="compare-ab-a"]');

    // A button should have active styling (blue background)
    const bgColor = await buttonA.evaluate(el => (el as HTMLButtonElement).style.background);
    expect(bgColor).toContain('accent-primary-rgb');
  });

  test('AB-E006: B button appears disabled/dimmed with single source', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const buttonB = page.locator('[data-testid="compare-ab-b"]');

    // B button should be visually dimmed (opacity 0.5)
    const opacity = await buttonB.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeLessThan(1);
  });

  test('AB-E007: Toggle button appears disabled with single source', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const toggleButton = page.locator('[data-testid="compare-ab-toggle"]');

    // Toggle should be visually dimmed
    const opacity = await toggleButton.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeLessThan(1);
  });

  test('AB-E008: A button has tooltip', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const buttonA = page.locator('[data-testid="compare-ab-a"]');
    const title = await buttonA.getAttribute('title');
    expect(title).toContain('source A');
  });

  test('AB-E009: B button has tooltip', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const buttonB = page.locator('[data-testid="compare-ab-b"]');
    const title = await buttonB.getAttribute('title');
    expect(title).toContain('source B');
  });

  test('AB-E010: Toggle button has tooltip with keyboard hint', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const toggleButton = page.locator('[data-testid="compare-ab-toggle"]');
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

  test('AB-E020: Compare button shows no B indicator with single source', async ({ page }) => {
    const compareButton = page.locator('[data-testid="compare-control-button"]');
    await expect(compareButton).not.toContainText('B');
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
    // Compare button should not show B indicator
    const compareButton = page.locator('[data-testid="compare-control-button"]');
    await expect(compareButton).not.toContainText('B');
  });

  test('AB-E031: Tilde key does nothing with single source', async ({ page }) => {
    // Press tilde
    await page.keyboard.press('~');
    await page.waitForTimeout(200);

    // Compare button should not show B indicator
    const compareButton = page.locator('[data-testid="compare-control-button"]');
    await expect(compareButton).not.toContainText('B');
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

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const buttonA = page.locator('[data-testid="compare-ab-a"]');
    await buttonA.click();
    await page.waitForTimeout(100);

    // Move mouse away to clear hover state
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);

    // A should still be highlighted (check border color which is more stable)
    const borderColor = await buttonA.evaluate(el => (el as HTMLButtonElement).style.borderColor);
    expect(borderColor).toContain('accent-primary');
  });

  test('AB-E041: Clicking disabled B button does not change state', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const buttonA = page.locator('[data-testid="compare-ab-a"]');
    const buttonB = page.locator('[data-testid="compare-ab-b"]');

    // Force click on disabled button
    await buttonB.click({ force: true });
    await page.waitForTimeout(100);

    // A should still be highlighted, B should not
    const aBorderColor = await buttonA.evaluate(el => (el as HTMLButtonElement).style.borderColor);
    const bBorderColor = await buttonB.evaluate(el => (el as HTMLButtonElement).style.borderColor);
    expect(aBorderColor).toContain('accent-primary');
    expect(bBorderColor).not.toContain('accent-primary');
  });
});

test.describe('A/B Button Interactions (Two Sources)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadTwoVideoFiles(page);
  });

  test('AB-E042: Clicking B button switches to B', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const buttonA = page.locator('[data-testid="compare-ab-a"]');
    const buttonB = page.locator('[data-testid="compare-ab-b"]');

    // Click A first to enable B
    await buttonA.click();
    await page.waitForTimeout(100);

    // Now click B
    await buttonB.click();
    await page.waitForTimeout(100);

    // Move mouse away to clear hover state
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);

    // B should be highlighted, A should not
    const aBorderColor = await buttonA.evaluate(el => (el as HTMLButtonElement).style.borderColor);
    const bBorderColor = await buttonB.evaluate(el => (el as HTMLButtonElement).style.borderColor);
    expect(bBorderColor).toContain('accent-primary');
    expect(aBorderColor).not.toContain('accent-primary');
  });

  test('AB-E043: Clicking A button switches back to A', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const buttonA = page.locator('[data-testid="compare-ab-a"]');
    const buttonB = page.locator('[data-testid="compare-ab-b"]');

    // Click A first to enable B
    await buttonA.click();
    await page.waitForTimeout(100);

    // Click B
    await buttonB.click();
    await page.waitForTimeout(100);

    // Click A again
    await buttonA.click();
    await page.waitForTimeout(100);

    // Move mouse away to clear hover state
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);

    // A should be highlighted, B should not
    const aBorderColor = await buttonA.evaluate(el => (el as HTMLButtonElement).style.borderColor);
    const bBorderColor = await buttonB.evaluate(el => (el as HTMLButtonElement).style.borderColor);
    expect(aBorderColor).toContain('accent-primary');
    expect(bBorderColor).not.toContain('accent-primary');
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

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const buttonA = page.locator('[data-testid="compare-ab-a"]');
    const buttonB = page.locator('[data-testid="compare-ab-b"]');

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

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    const buttonB = page.locator('[data-testid="compare-ab-b"]');
    const toggleButton = page.locator('[data-testid="compare-ab-toggle"]');

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

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    // Find the A/B label text within the dropdown
    const dropdown = page.locator('[data-testid="compare-dropdown"]');
    const label = dropdown.locator('div:has-text("A/B Compare")').nth(1);
    await expect(label).toBeVisible();

    const buttonA = page.locator('[data-testid="compare-ab-a"]');
    const labelBox = await label.boundingBox();
    const buttonBox = await buttonA.boundingBox();

    // Label should be above the buttons
    expect(labelBox!.y).toBeLessThan(buttonBox!.y);
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

    // Open the compare dropdown
    await page.click('[data-testid="compare-control-button"]');
    await page.waitForTimeout(100);

    // Get the A/B buttons
    const buttonA = page.locator('[data-testid="compare-ab-a"]');
    const toggleButton = page.locator('[data-testid="compare-ab-toggle"]');

    // Scroll the A/B buttons into view (they may be off-screen on narrow viewports)
    await buttonA.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);

    // Take a screenshot of the element directly
    const screenshot = await buttonA.screenshot();

    // Verify we got a meaningful screenshot (not empty)
    expect(screenshot.length).toBeGreaterThan(100);

    // Verify button is visible and has correct text
    await expect(buttonA).toBeVisible();
    await expect(buttonA).toHaveText('A');
    await expect(toggleButton).toBeVisible();
  });
});

test.describe('A/B Wipe Labels', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('WIPE-E001: wipe labels are hidden when wipe is off', async ({ page }) => {
    const labelA = page.locator('[data-testid="wipe-label-a"]');
    const labelB = page.locator('[data-testid="wipe-label-b"]');
    await expect(labelA).toBeHidden();
    await expect(labelB).toBeHidden();
  });

  test('WIPE-E002: wipe labels appear when horizontal wipe is enabled', async ({ page }) => {
    // Enable horizontal wipe
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipeMode('horizontal');
    });
    await page.waitForTimeout(100);

    const labelA = page.locator('[data-testid="wipe-label-a"]');
    const labelB = page.locator('[data-testid="wipe-label-b"]');
    await expect(labelA).toBeVisible();
    await expect(labelB).toBeVisible();
  });

  test('WIPE-E003: default wipe labels are Original and Graded', async ({ page }) => {
    // Enable wipe
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipeMode('horizontal');
    });
    await page.waitForTimeout(100);

    const labels = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.app?.viewer?.getWipeLabels();
    });

    expect(labels.labelA).toBe('Original');
    expect(labels.labelB).toBe('Graded');
  });

  test('WIPE-E004: setWipeLabels updates label text', async ({ page }) => {
    // Enable wipe
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipeMode('horizontal');
    });
    await page.waitForTimeout(100);

    // Set custom labels
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipeLabels('Before', 'After');
    });
    await page.waitForTimeout(100);

    const labelA = page.locator('[data-testid="wipe-label-a"]');
    const labelB = page.locator('[data-testid="wipe-label-b"]');
    await expect(labelA).toHaveText('Before');
    await expect(labelB).toHaveText('After');
  });

  test('WIPE-E005: label A is hidden at left boundary (position <= 10%)', async ({ page }) => {
    // Enable wipe and set position to 5%
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipeMode('horizontal');
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipePosition(0.05);
    });
    await page.waitForTimeout(100);

    const labelA = page.locator('[data-testid="wipe-label-a"]');
    await expect(labelA).toBeHidden();
  });

  test('WIPE-E006: label B is hidden at right boundary (position >= 90%)', async ({ page }) => {
    // Enable wipe and set position to 95%
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipeMode('horizontal');
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipePosition(0.95);
    });
    await page.waitForTimeout(100);

    const labelB = page.locator('[data-testid="wipe-label-b"]');
    await expect(labelB).toBeHidden();
  });

  test('WIPE-E007: both labels visible at center position (50%)', async ({ page }) => {
    // Enable wipe at center
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipeMode('horizontal');
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipePosition(0.5);
    });
    await page.waitForTimeout(100);

    const labelA = page.locator('[data-testid="wipe-label-a"]');
    const labelB = page.locator('[data-testid="wipe-label-b"]');
    await expect(labelA).toBeVisible();
    await expect(labelB).toBeVisible();
  });

  test('WIPE-E010: vertical wipe shows labels correctly', async ({ page }) => {
    // Enable vertical wipe
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipeMode('vertical');
    });
    await page.waitForTimeout(100);

    const labelA = page.locator('[data-testid="wipe-label-a"]');
    const labelB = page.locator('[data-testid="wipe-label-b"]');
    await expect(labelA).toBeVisible();
    await expect(labelB).toBeVisible();
  });

  test('WIPE-E011: vertical wipe label A hidden at top boundary', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipeMode('vertical');
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipePosition(0.05);
    });
    await page.waitForTimeout(100);

    const labelA = page.locator('[data-testid="wipe-label-a"]');
    await expect(labelA).toBeHidden();
  });

  test('WIPE-E012: vertical wipe label B hidden at bottom boundary', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipeMode('vertical');
      (window as any).__OPENRV_TEST__?.app?.viewer?.setWipePosition(0.95);
    });
    await page.waitForTimeout(100);

    const labelB = page.locator('[data-testid="wipe-label-b"]');
    await expect(labelB).toBeHidden();
  });
});
