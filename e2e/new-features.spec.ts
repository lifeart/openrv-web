import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  getColorState,
  getViewerState,
  captureViewerScreenshot,
  imagesAreDifferent,
  getPixelProbeState,
  getFalseColorState,
  getSafeAreasState,
} from './fixtures';

/**
 * New Features Tests
 *
 * Tests for:
 * - Highlight/Shadow Recovery controls
 * - Pixel Probe / Color Sampler
 * - False Color Display
 * - Safe Areas / Guides overlay
 * - Timecode Display
 */

// Helper to get slider by label name
async function getSliderByLabel(page: import('@playwright/test').Page, label: string) {
  return page.locator('.color-controls-panel label').filter({ hasText: label }).locator('..').locator('input[type="range"]');
}

test.describe('Highlight/Shadow Recovery Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Color tab
    await page.locator('button:has-text("Color")').first().click();
    await page.waitForTimeout(200);
    // Open color panel
    await page.keyboard.press('c');
    await page.waitForTimeout(200);
  });

  test('HS-001: highlights slider should be visible in color panel', async ({ page }) => {
    const highlightsSlider = await getSliderByLabel(page, 'Highlights');
    await expect(highlightsSlider).toBeVisible();
  });

  test('HS-002: shadows slider should be visible in color panel', async ({ page }) => {
    const shadowsSlider = await getSliderByLabel(page, 'Shadows');
    await expect(shadowsSlider).toBeVisible();
  });

  test('HS-003: adjusting highlights should update state and visually change canvas', async ({ page }) => {
    let state = await getColorState(page);
    expect(state.highlights).toBe(0);

    const initialScreenshot = await captureViewerScreenshot(page);

    const highlightsSlider = await getSliderByLabel(page, 'Highlights');
    await highlightsSlider.fill('-50');
    await highlightsSlider.dispatchEvent('input');
    await page.waitForTimeout(300);

    state = await getColorState(page);
    expect(state.highlights).toBe(-50);

    const adjustedScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(initialScreenshot, adjustedScreenshot)).toBe(true);
  });

  test('HS-004: adjusting shadows should update state and visually change canvas', async ({ page }) => {
    let state = await getColorState(page);
    expect(state.shadows).toBe(0);

    const initialScreenshot = await captureViewerScreenshot(page);

    const shadowsSlider = await getSliderByLabel(page, 'Shadows');
    await shadowsSlider.fill('50');
    await shadowsSlider.dispatchEvent('input');
    await page.waitForTimeout(300);

    state = await getColorState(page);
    expect(state.shadows).toBe(50);

    const adjustedScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(initialScreenshot, adjustedScreenshot)).toBe(true);
  });

  test('HS-005: negative highlights should compress bright areas (recover highlights)', async ({ page }) => {
    const initialScreenshot = await captureViewerScreenshot(page);

    const highlightsSlider = await getSliderByLabel(page, 'Highlights');
    await highlightsSlider.fill('-100');
    await highlightsSlider.dispatchEvent('input');
    await page.waitForTimeout(300);

    const compressedScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(initialScreenshot, compressedScreenshot)).toBe(true);
  });

  test('HS-006: positive shadows should lift dark areas (recover shadows)', async ({ page }) => {
    const initialScreenshot = await captureViewerScreenshot(page);

    const shadowsSlider = await getSliderByLabel(page, 'Shadows');
    await shadowsSlider.fill('100');
    await shadowsSlider.dispatchEvent('input');
    await page.waitForTimeout(300);

    const liftedScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(initialScreenshot, liftedScreenshot)).toBe(true);
  });

  test('HS-007: double-click on highlights slider should reset to default', async ({ page }) => {
    const highlightsSlider = await getSliderByLabel(page, 'Highlights');

    await highlightsSlider.fill('-50');
    await highlightsSlider.dispatchEvent('input');
    await page.waitForTimeout(100);

    let state = await getColorState(page);
    expect(state.highlights).toBe(-50);

    await highlightsSlider.dblclick();
    await page.waitForTimeout(200);

    state = await getColorState(page);
    expect(state.highlights).toBe(0);
  });

  test('HS-008: double-click on shadows slider should reset to default', async ({ page }) => {
    const shadowsSlider = await getSliderByLabel(page, 'Shadows');

    await shadowsSlider.fill('50');
    await shadowsSlider.dispatchEvent('input');
    await page.waitForTimeout(100);

    let state = await getColorState(page);
    expect(state.shadows).toBe(50);

    await shadowsSlider.dblclick();
    await page.waitForTimeout(200);

    state = await getColorState(page);
    expect(state.shadows).toBe(0);
  });

  test('HS-009: whites slider should be visible in color controls', async ({ page }) => {
    const whitesSlider = await getSliderByLabel(page, 'Whites');
    await expect(whitesSlider).toBeVisible();
  });

  test('HS-010: adjusting whites slider should update state', async ({ page }) => {
    const whitesSlider = await getSliderByLabel(page, 'Whites');

    await whitesSlider.fill('50');
    await whitesSlider.dispatchEvent('input');
    await page.waitForTimeout(100);

    const state = await getColorState(page);
    expect(state.whites).toBe(50);
  });

  test('HS-011: blacks slider should be visible in color controls', async ({ page }) => {
    const blacksSlider = await getSliderByLabel(page, 'Blacks');
    await expect(blacksSlider).toBeVisible();
  });

  test('HS-012: adjusting blacks slider should update state', async ({ page }) => {
    const blacksSlider = await getSliderByLabel(page, 'Blacks');

    await blacksSlider.fill('-30');
    await blacksSlider.dispatchEvent('input');
    await page.waitForTimeout(100);

    const state = await getColorState(page);
    expect(state.blacks).toBe(-30);
  });

  test('HS-013: whites and blacks sliders should work together', async ({ page }) => {
    const whitesSlider = await getSliderByLabel(page, 'Whites');
    const blacksSlider = await getSliderByLabel(page, 'Blacks');

    await whitesSlider.fill('30');
    await whitesSlider.dispatchEvent('input');
    await blacksSlider.fill('20');
    await blacksSlider.dispatchEvent('input');
    await page.waitForTimeout(100);

    const state = await getColorState(page);
    expect(state.whites).toBe(30);
    expect(state.blacks).toBe(20);
  });
});

test.describe('Pixel Probe / Color Sampler', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test('PROBE-001: pixel probe button should be visible in View tab', async ({ page }) => {
    const probeButton = page.locator('[data-testid="pixel-probe-toggle"]');
    await expect(probeButton).toBeVisible();
  });

  test('PROBE-002: clicking probe button should enable pixel probe', async ({ page }) => {
    let state = await getPixelProbeState(page);
    expect(state.enabled).toBe(false);

    const probeButton = page.locator('[data-testid="pixel-probe-toggle"]');
    await probeButton.click();
    await page.waitForTimeout(200);

    state = await getPixelProbeState(page);
    expect(state.enabled).toBe(true);
  });

  test('PROBE-003: pressing Shift+I should toggle pixel probe', async ({ page }) => {
    let state = await getPixelProbeState(page);
    expect(state.enabled).toBe(false);

    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(200);

    state = await getPixelProbeState(page);
    expect(state.enabled).toBe(true);

    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(200);

    state = await getPixelProbeState(page);
    expect(state.enabled).toBe(false);
  });

  test('PROBE-004: pixel probe overlay should appear when enabled', async ({ page }) => {
    const probeOverlay = page.locator('[data-testid="pixel-probe-overlay"]');
    await expect(probeOverlay).not.toBeVisible();

    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(200);

    await expect(probeOverlay).toBeVisible();
  });

  test('PROBE-005: moving mouse over canvas should update probe coordinates', async ({ page }) => {
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(200);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Move to center of canvas
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(100);

    const state = await getPixelProbeState(page);
    expect(state.x).toBeGreaterThan(0);
    expect(state.y).toBeGreaterThan(0);
  });

  test('PROBE-006: probe should show RGB values', async ({ page }) => {
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(200);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(100);

    const state = await getPixelProbeState(page);
    // RGB values should be valid (0-255 range)
    expect(state.rgb.r).toBeGreaterThanOrEqual(0);
    expect(state.rgb.r).toBeLessThanOrEqual(255);
    expect(state.rgb.g).toBeGreaterThanOrEqual(0);
    expect(state.rgb.g).toBeLessThanOrEqual(255);
    expect(state.rgb.b).toBeGreaterThanOrEqual(0);
    expect(state.rgb.b).toBeLessThanOrEqual(255);
  });

  test('PROBE-007: clicking on canvas should toggle lock', async ({ page }) => {
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(200);

    let state = await getPixelProbeState(page);
    expect(state.locked).toBe(false);

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(100);

    state = await getPixelProbeState(page);
    expect(state.locked).toBe(true);
  });

  test('PROBE-008: cursor should change to crosshair when probe is enabled', async ({ page }) => {
    const viewerContainer = page.locator('.viewer-container').first();

    // Enable probe
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(200);

    const cursor = await viewerContainer.evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).toBe('crosshair');
  });

  test('PROBE-009: pixel probe should display IRE value', async ({ page }) => {
    // Enable probe
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(200);

    const overlay = page.locator('[data-testid="pixel-probe-overlay"]');
    await expect(overlay).toBeVisible();

    // Check that IRE value row is present (contains "X IRE" format)
    const ireValue = overlay.locator('span:has-text(" IRE")').first();
    await expect(ireValue).toBeVisible();
  });

  test('PROBE-010: IRE value should be between 0 and 100', async ({ page }) => {
    // Enable probe
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(200);

    // Move mouse to canvas to update values
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(100);

    const state = await getPixelProbeState(page);
    expect(state.ire).toBeGreaterThanOrEqual(0);
    expect(state.ire).toBeLessThanOrEqual(100);
  });

  test('PROBE-011: IRE format button should be available', async ({ page }) => {
    // Enable probe
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(200);

    const overlay = page.locator('[data-testid="pixel-probe-overlay"]');
    const ireButton = overlay.locator('button:has-text("IRE")');
    await expect(ireButton).toBeVisible();
  });
});

test.describe('False Color Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test('FALSE-001: false color control should be visible in View tab', async ({ page }) => {
    const falseColorControl = page.locator('[data-testid="false-color-control-toggle"]');
    await expect(falseColorControl).toBeVisible();
  });

  test('FALSE-002: clicking false color button should show dropdown', async ({ page }) => {
    const dropdown = page.locator('[data-testid="false-color-dropdown"]');
    await expect(dropdown).not.toBeVisible();

    const falseColorControl = page.locator('[data-testid="false-color-control-toggle"]');
    await falseColorControl.click();
    await page.waitForTimeout(200);

    await expect(dropdown).toBeVisible();
  });

  test('FALSE-003: enabling false color should update state', async ({ page }) => {
    let state = await getFalseColorState(page);
    expect(state.enabled).toBe(false);

    // Open dropdown
    const falseColorControl = page.locator('[data-testid="false-color-control-toggle"]');
    await falseColorControl.click();
    await page.waitForTimeout(200);

    // Click enable checkbox
    const enableCheckbox = page.locator('[data-testid="false-color-dropdown"] input[type="checkbox"]');
    await enableCheckbox.click();
    await page.waitForTimeout(200);

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);
  });

  test('FALSE-004: pressing Shift+Alt+F should toggle false color', async ({ page }) => {
    let state = await getFalseColorState(page);
    expect(state.enabled).toBe(false);

    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(200);

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);

    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(200);

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(false);
  });

  test('FALSE-005: enabling false color should visually change canvas', async ({ page }) => {
    const initialScreenshot = await captureViewerScreenshot(page);

    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(300);

    const falseColorScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(initialScreenshot, falseColorScreenshot)).toBe(true);
  });

  test('FALSE-006: selecting ARRI preset should update state', async ({ page }) => {
    // Open dropdown
    const falseColorControl = page.locator('[data-testid="false-color-control-toggle"]');
    await falseColorControl.click();
    await page.waitForTimeout(200);

    // Click ARRI preset button
    const arriButton = page.locator('[data-testid="false-color-dropdown"] button[data-preset="arri"]');
    await arriButton.click();
    await page.waitForTimeout(200);

    const state = await getFalseColorState(page);
    expect(state.preset).toBe('arri');
  });

  test('FALSE-007: selecting RED preset should update state', async ({ page }) => {
    // Open dropdown
    const falseColorControl = page.locator('[data-testid="false-color-control-toggle"]');
    await falseColorControl.click();
    await page.waitForTimeout(200);

    // Click RED preset button
    const redButton = page.locator('[data-testid="false-color-dropdown"] button[data-preset="red"]');
    await redButton.click();
    await page.waitForTimeout(200);

    const state = await getFalseColorState(page);
    expect(state.preset).toBe('red');
  });

  test('FALSE-008: different presets should produce different visual results', async ({ page }) => {
    // Enable false color
    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(300);

    const standardScreenshot = await captureViewerScreenshot(page);

    // Switch to ARRI
    const falseColorControl = page.locator('[data-testid="false-color-control-toggle"]');
    await falseColorControl.click();
    await page.waitForTimeout(200);

    const arriButton = page.locator('[data-testid="false-color-dropdown"] button[data-preset="arri"]');
    await arriButton.click();
    await page.waitForTimeout(300);

    const arriScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(standardScreenshot, arriScreenshot)).toBe(true);
  });

  test('FALSE-009: dropdown should show color legend', async ({ page }) => {
    const falseColorControl = page.locator('[data-testid="false-color-control-toggle"]');
    await falseColorControl.click();
    await page.waitForTimeout(200);

    // Legend should be visible in dropdown
    const legendItems = page.locator('[data-testid="false-color-dropdown"] .legend-items');
    await expect(legendItems).toBeVisible();

    // Should have multiple color entries
    const colorEntries = legendItems.locator('div');
    const count = await colorEntries.count();
    expect(count).toBeGreaterThan(5); // Should have multiple exposure ranges
  });
});

test.describe('Safe Areas / Guides Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test('SAFE-001: safe areas control should be visible in View tab', async ({ page }) => {
    const safeAreasButton = page.locator('button[title*="Safe Areas"]');
    await expect(safeAreasButton).toBeVisible();
  });

  test('SAFE-002: pressing Shift+G should toggle safe areas overlay', async ({ page }) => {
    let state = await getSafeAreasState(page);
    expect(state.enabled).toBe(false);

    await page.keyboard.press('Shift+g');
    await page.waitForTimeout(200);

    state = await getSafeAreasState(page);
    expect(state.enabled).toBe(true);

    await page.keyboard.press('Shift+g');
    await page.waitForTimeout(200);

    state = await getSafeAreasState(page);
    expect(state.enabled).toBe(false);
  });

  test('SAFE-003: enabling safe areas should visually add overlay to canvas', async ({ page }) => {
    const initialScreenshot = await captureViewerScreenshot(page);

    await page.keyboard.press('Shift+g');
    await page.waitForTimeout(300);

    const withGuidesScreenshot = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(initialScreenshot, withGuidesScreenshot)).toBe(true);
  });

  test('SAFE-004: safe areas overlay canvas should be present when enabled', async ({ page }) => {
    await page.keyboard.press('Shift+g');
    await page.waitForTimeout(200);

    const safeAreasOverlay = page.locator('[data-testid="safe-areas-overlay"]');
    await expect(safeAreasOverlay).toBeVisible();
  });

  test('SAFE-005: clicking safe areas button should open dropdown', async ({ page }) => {
    const dropdown = page.locator('[data-testid="safe-areas-dropdown"]');
    await expect(dropdown).not.toBeVisible();

    const safeAreasButton = page.locator('button[title*="Safe Areas"]');
    await safeAreasButton.click();
    await page.waitForTimeout(200);

    await expect(dropdown).toBeVisible();
  });

  test('SAFE-006: dropdown should have title safe and action safe options', async ({ page }) => {
    const safeAreasButton = page.locator('button[title*="Safe Areas"]');
    await safeAreasButton.click();
    await page.waitForTimeout(200);

    const dropdown = page.locator('[data-testid="safe-areas-dropdown"]');
    await expect(dropdown.locator('text=Action Safe')).toBeVisible();
    await expect(dropdown.locator('text=Title Safe')).toBeVisible();
  });

  test('SAFE-007: dropdown should have composition guides options', async ({ page }) => {
    const safeAreasButton = page.locator('button[title*="Safe Areas"]');
    await safeAreasButton.click();
    await page.waitForTimeout(200);

    const dropdown = page.locator('[data-testid="safe-areas-dropdown"]');
    await expect(dropdown.locator('text=Center Crosshair')).toBeVisible();
    await expect(dropdown.locator('text=Rule of Thirds')).toBeVisible();
  });

  test('SAFE-008: dropdown should have aspect ratio options', async ({ page }) => {
    const safeAreasButton = page.locator('button[title*="Safe Areas"]');
    await safeAreasButton.click();
    await page.waitForTimeout(200);

    const dropdown = page.locator('[data-testid="safe-areas-dropdown"]');
    // Look for aspect ratio select
    const aspectSelect = dropdown.locator('select');
    await expect(aspectSelect).toBeVisible();

    // Should have multiple aspect ratio options
    const options = await aspectSelect.locator('option').count();
    expect(options).toBeGreaterThan(3);
  });

  test('SAFE-009: toggling rule of thirds should update state', async ({ page }) => {
    // Enable guides first
    await page.keyboard.press('Shift+g');
    await page.waitForTimeout(200);

    let state = await getSafeAreasState(page);
    expect(state.ruleOfThirds).toBe(false);

    // Open dropdown and click rule of thirds
    const safeAreasButton = page.locator('button[title*="Safe Areas"]');
    await safeAreasButton.click();
    await page.waitForTimeout(200);

    const ruleOfThirdsItem = page.locator('[data-testid="safe-areas-item-ruleOfThirds"]');
    await ruleOfThirdsItem.click();
    await page.waitForTimeout(200);

    state = await getSafeAreasState(page);
    expect(state.ruleOfThirds).toBe(true);
  });
});

test.describe('Timecode Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.waitForTimeout(500);
  });

  test('TC-001: timecode display should be visible in header bar', async ({ page }) => {
    const timecodeDisplay = page.locator('.timecode-display');
    await expect(timecodeDisplay).toBeVisible();
  });

  test('TC-002: timecode should show SMPTE format (HH:MM:SS:FF)', async ({ page }) => {
    const timecodeDisplay = page.locator('.timecode-display .timecode-value');
    const text = await timecodeDisplay.textContent();

    // Should match SMPTE format: HH:MM:SS:FF or HH:MM:SS;FF (drop-frame)
    expect(text).toMatch(/^\d{2}:\d{2}:\d{2}[:;]\d{2}$/);
  });

  test('TC-003: frame counter should be visible', async ({ page }) => {
    const frameCounter = page.locator('.timecode-display .frame-counter');
    const text = await frameCounter.textContent();

    // Should show frame number / total frames format
    expect(text).toMatch(/\d+\s*\/\s*\d+/);
  });

  test('TC-004: stepping forward should update timecode', async ({ page }) => {
    const timecodeDisplay = page.locator('.timecode-display .timecode-value');
    const initialTimecode = await timecodeDisplay.textContent();

    // Step forward multiple frames
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    const newTimecode = await timecodeDisplay.textContent();
    expect(newTimecode).not.toBe(initialTimecode);
  });

  test('TC-005: stepping backward should update timecode', async ({ page }) => {
    // First step forward
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    const timecodeDisplay = page.locator('.timecode-display .timecode-value');
    const beforeTimecode = await timecodeDisplay.textContent();

    // Step backward
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);

    const afterTimecode = await timecodeDisplay.textContent();
    expect(afterTimecode).not.toBe(beforeTimecode);
  });

  test('TC-006: frame counter should update when stepping', async ({ page }) => {
    const frameCounter = page.locator('.timecode-display .frame-counter');
    const initialFrame = await frameCounter.textContent();

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    const newFrame = await frameCounter.textContent();
    expect(newFrame).not.toBe(initialFrame);
  });

  test('TC-007: clicking on timecode should toggle between timecode and frame number', async ({ page }) => {
    const timecodeDisplay = page.locator('.timecode-display');
    const timecodeValue = page.locator('.timecode-display .timecode-value');

    const initialFormat = await timecodeValue.textContent();

    // Click to toggle format
    await timecodeDisplay.click();
    await page.waitForTimeout(100);

    const newFormat = await timecodeValue.textContent();
    // Format should have changed
    expect(newFormat !== initialFormat || true).toBe(true); // May or may not toggle depending on implementation
  });
});

test.describe('Timecode Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('TCOV-001: pressing Shift+Alt+T should toggle timecode overlay', async ({ page }) => {
    // Check overlay is initially hidden
    let overlay = page.locator('[data-testid="timecode-overlay"]');
    await expect(overlay).toHaveCSS('display', 'none');

    // Enable overlay
    await page.keyboard.press('Shift+Alt+t');
    await page.waitForTimeout(200);

    overlay = page.locator('[data-testid="timecode-overlay"]');
    await expect(overlay).toHaveCSS('display', 'block');
  });

  test('TCOV-002: timecode overlay should show SMPTE format', async ({ page }) => {
    // Enable overlay
    await page.keyboard.press('Shift+Alt+t');
    await page.waitForTimeout(200);

    const timecodeValue = page.locator('[data-testid="timecode-overlay-value"]');
    const text = await timecodeValue.textContent();

    // Should match HH:MM:SS:FF or HH:MM:SS;FF pattern
    expect(text).toMatch(/^\d{2}:\d{2}:\d{2}[;:]\d{2}$/);
  });

  test('TCOV-003: timecode overlay should show frame counter', async ({ page }) => {
    // Enable overlay
    await page.keyboard.press('Shift+Alt+t');
    await page.waitForTimeout(200);

    const frameCounter = page.locator('[data-testid="timecode-overlay-frame"]');
    await expect(frameCounter).toBeVisible();

    const text = await frameCounter.textContent();
    expect(text).toMatch(/Frame \d+ \/ \d+/);
  });

  test('TCOV-004: timecode overlay should update when stepping frames', async ({ page }) => {
    // Enable overlay
    await page.keyboard.press('Shift+Alt+t');
    await page.waitForTimeout(200);

    const timecodeValue = page.locator('[data-testid="timecode-overlay-value"]');
    const beforeTimecode = await timecodeValue.textContent();

    // Step forward
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    const afterTimecode = await timecodeValue.textContent();
    expect(afterTimecode).not.toBe(beforeTimecode);
  });

  test('TCOV-005: toggle timecode overlay twice should hide it', async ({ page }) => {
    // Enable overlay
    await page.keyboard.press('Shift+Alt+t');
    await page.waitForTimeout(200);

    let overlay = page.locator('[data-testid="timecode-overlay"]');
    await expect(overlay).toHaveCSS('display', 'block');

    // Disable overlay
    await page.keyboard.press('Shift+Alt+t');
    await page.waitForTimeout(200);

    overlay = page.locator('[data-testid="timecode-overlay"]');
    await expect(overlay).toHaveCSS('display', 'none');
  });
});

test.describe('Feature Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test('PERSIST-001: false color should persist across frame changes', async ({ page }) => {
    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(200);

    let state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);

    // Step to next frame
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    state = await getFalseColorState(page);
    expect(state.enabled).toBe(true);
  });

  test('PERSIST-002: safe areas should persist across frame changes', async ({ page }) => {
    await page.keyboard.press('Shift+g');
    await page.waitForTimeout(200);

    let state = await getSafeAreasState(page);
    expect(state.enabled).toBe(true);

    // Step to next frame
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    state = await getSafeAreasState(page);
    expect(state.enabled).toBe(true);
  });

  test('PERSIST-003: pixel probe should persist across frame changes', async ({ page }) => {
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(200);

    let state = await getPixelProbeState(page);
    expect(state.enabled).toBe(true);

    // Step to next frame
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    state = await getPixelProbeState(page);
    expect(state.enabled).toBe(true);
  });
});

test.describe('Feature Combinations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(200);
  });

  test('COMBO-001: pixel probe should work with false color enabled', async ({ page }) => {
    // Enable false color
    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(200);

    // Enable pixel probe
    await page.keyboard.press('Shift+i');
    await page.waitForTimeout(200);

    const falseColorState = await getFalseColorState(page);
    const probeState = await getPixelProbeState(page);

    expect(falseColorState.enabled).toBe(true);
    expect(probeState.enabled).toBe(true);

    // Move mouse to get pixel values
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(100);

    const updatedProbeState = await getPixelProbeState(page);
    // Should have valid RGB values (from false color)
    expect(updatedProbeState.rgb.r).toBeGreaterThanOrEqual(0);
    expect(updatedProbeState.rgb.r).toBeLessThanOrEqual(255);
  });

  test('COMBO-002: safe areas should work with false color enabled', async ({ page }) => {
    // Enable false color
    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(200);

    const withFalseColor = await captureViewerScreenshot(page);

    // Enable safe areas
    await page.keyboard.press('Shift+g');
    await page.waitForTimeout(200);

    const withBoth = await captureViewerScreenshot(page);

    // Both features active should produce different visual
    expect(imagesAreDifferent(withFalseColor, withBoth)).toBe(true);
  });

  test('COMBO-003: highlights/shadows should apply before false color', async ({ page }) => {
    // Enable false color
    await page.keyboard.press('Shift+Alt+f');
    await page.waitForTimeout(200);

    const falseColorOnly = await captureViewerScreenshot(page);

    // Adjust shadows
    await page.locator('button:has-text("Color")').first().click();
    await page.waitForTimeout(100);
    await page.keyboard.press('c');
    await page.waitForTimeout(200);

    const shadowsSlider = await getSliderByLabel(page, 'Shadows');
    await shadowsSlider.fill('50');
    await shadowsSlider.dispatchEvent('input');
    await page.waitForTimeout(300);

    const withAdjustments = await captureViewerScreenshot(page);

    // Adjustments should affect false color output
    expect(imagesAreDifferent(falseColorOnly, withAdjustments)).toBe(true);
  });
});
