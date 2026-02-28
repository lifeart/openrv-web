import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getViewerState,
  waitForTestHelper,
} from './fixtures';

/**
 * Waveform Monitor Feature Tests
 *
 * These tests verify the waveform display functionality,
 * including visibility toggle, mode cycling, and button controls.
 */

test.describe('Waveform Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('WF-E001: waveform is hidden by default', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.waveformVisible).toBe(false);
  });

  test('WF-E002: pressing w toggles waveform visibility', async ({ page }) => {
    let state = await getViewerState(page);
    expect(state.waveformVisible).toBe(false);

    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);

    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(false);
  });

  test('WF-E003: waveform container is visible when shown', async ({ page }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    const waveform = page.locator('.waveform-container');
    await expect(waveform).toBeVisible();
  });

  test('WF-E004: waveform has canvas element', async ({ page }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    const canvas = page.locator('.waveform-container canvas');
    await expect(canvas).toBeVisible();
  });

  test('WF-E005: clicking Waveform button in QC tab toggles waveform', async ({ page }) => {
    // Go to QC tab
    await page.click('button[data-tab-id="qc"]');
    await page.waitForTimeout(100);

    // Open scopes dropdown then toggle waveform option
    const scopesButton = page.locator('[data-testid="scopes-control-button"]');
    await expect(scopesButton).toBeVisible();
    await scopesButton.click();

    const waveformOption = page.locator('[data-scope-type="waveform"]');
    await expect(waveformOption).toBeVisible();
    await waveformOption.click();
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);

    // Click again to hide
    await waveformOption.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(false);
  });
});

test.describe('Waveform Modes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show waveform
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
  });

  test('WF-E010: default mode is luma', async ({ page }) => {
    const state = await getViewerState(page);
    expect(state.waveformMode).toBe('luma');
  });

  test('WF-E011: cycling mode changes waveform mode state', async ({ page }) => {
    // Use direct method call
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.cycleWaveformMode();
    });
    await page.waitForTimeout(100);
    let state = await getViewerState(page);
    expect(state.waveformMode).toBe('rgb');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.cycleWaveformMode();
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.waveformMode).toBe('parade');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.cycleWaveformMode();
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.waveformMode).toBe('ycbcr');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.cycleWaveformMode();
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.waveformMode).toBe('luma');
  });

  test('WF-E012: setMode changes waveform mode', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setWaveformMode('rgb');
    });
    await page.waitForTimeout(100);
    let state = await getViewerState(page);
    expect(state.waveformMode).toBe('rgb');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setWaveformMode('parade');
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.waveformMode).toBe('parade');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setWaveformMode('ycbcr');
    });
    await page.waitForTimeout(100);
    state = await getViewerState(page);
    expect(state.waveformMode).toBe('ycbcr');
  });
});

test.describe('YCbCr Waveform Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show waveform
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
  });

  test('YCBCR-001: YCbCr mode is selectable via setMode', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setWaveformMode('ycbcr');
    });
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.waveformMode).toBe('ycbcr');
  });

  test('YCBCR-002: mode button shows YCbCr label in YCbCr mode', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setWaveformMode('ycbcr');
    });
    await page.waitForTimeout(100);

    const modeButton = page.locator('[data-testid="waveform-mode-button"]');
    await expect(modeButton).toHaveText('YCbCr');
  });

  test('YCBCR-003: RGB controls are hidden in YCbCr mode', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setWaveformMode('ycbcr');
    });
    await page.waitForTimeout(100);

    const rgbControls = page.locator('[data-testid="waveform-rgb-controls"]');
    await expect(rgbControls).toBeHidden();
  });

  test('YCBCR-004: waveform canvas is visible in YCbCr mode', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setWaveformMode('ycbcr');
    });
    await page.waitForTimeout(100);

    const canvas = page.locator('.waveform-container canvas');
    await expect(canvas).toBeVisible();
  });
});

test.describe('Waveform Closing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show waveform
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
  });

  test('WF-E030: hide method hides waveform', async ({ page }) => {
    // Use direct method call
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.hideWaveform();
    });
    await page.waitForTimeout(100);

    const state = await getViewerState(page);
    expect(state.waveformVisible).toBe(false);

    const waveform = page.locator('.waveform-container');
    await expect(waveform).toBeHidden();
  });
});

test.describe('Waveform Internal Button Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show waveform
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
  });

  test('WF-E050: clicking mode button inside waveform cycles modes', async ({ page }) => {
    const waveformContainer = page.locator('.waveform-container');
    await expect(waveformContainer).toBeVisible();

    // Find the mode button by data-testid
    const modeButton = page.locator('[data-testid="waveform-mode-button"]');
    await expect(modeButton).toBeVisible();
    await expect(modeButton).toHaveText('Luma');

    // Click to change from Luma to RGB
    await modeButton.click();
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.waveformMode).toBe('rgb');
    await expect(modeButton).toHaveText('RGB');

    // Click to change from RGB to Parade
    await modeButton.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformMode).toBe('parade');
    await expect(modeButton).toHaveText('Parade');

    // Click to change from Parade to YCbCr
    await modeButton.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformMode).toBe('ycbcr');
    await expect(modeButton).toHaveText('YCbCr');

    // Click to change from YCbCr back to Luma
    await modeButton.click();
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformMode).toBe('luma');
    await expect(modeButton).toHaveText('Luma');
  });

  test('WF-E052: clicking close button inside waveform hides waveform', async ({ page }) => {
    const waveformContainer = page.locator('.waveform-container');
    await expect(waveformContainer).toBeVisible();

    // Find the close button by data-testid
    const closeButton = page.locator('[data-testid="waveform-close-button"]');
    await expect(closeButton).toBeVisible();

    // Click to close
    await closeButton.click();
    await page.waitForTimeout(100);

    // Waveform should be hidden
    const state = await getViewerState(page);
    expect(state.waveformVisible).toBe(false);
    await expect(waveformContainer).toBeHidden();
  });
});

test.describe('Waveform State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('WF-E040: waveform visibility persists when changing frames', async ({ page }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);

    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);
  });

  test('WF-E041: waveform mode persists when changing frames', async ({ page }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    // Change to parade mode using direct method call
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setWaveformMode('parade');
    });
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.waveformMode).toBe('parade');

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformMode).toBe('parade');
  });

  test('WF-E042: waveform visibility persists when changing tabs', async ({ page }) => {
    await page.keyboard.press('w');
    await page.waitForTimeout(100);

    let state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);

    // Switch to Color tab
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);

    // Switch back to QC tab
    await page.click('button[data-tab-id="qc"]');
    await page.waitForTimeout(100);

    state = await getViewerState(page);
    expect(state.waveformVisible).toBe(true);
  });
});

test.describe('RGB Overlay Waveform Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Show waveform and switch to RGB mode
    await page.keyboard.press('w');
    await page.waitForTimeout(100);
    // Cycle to RGB mode
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setWaveformMode('rgb');
    });
    await page.waitForTimeout(100);
  });

  test('RGBW-E001: RGB controls are visible in RGB mode', async ({ page }) => {
    const rgbControls = page.locator('[data-testid="waveform-rgb-controls"]');
    await expect(rgbControls).toBeVisible();
  });

  test('RGBW-E002: RGB controls are hidden in Luma mode', async ({ page }) => {
    // Switch back to luma mode
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setWaveformMode('luma');
    });
    await page.waitForTimeout(100);

    const rgbControls = page.locator('[data-testid="waveform-rgb-controls"]');
    await expect(rgbControls).toBeHidden();
  });

  test('RGBW-E003: RGB controls are hidden in Parade mode', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setWaveformMode('parade');
    });
    await page.waitForTimeout(100);

    const rgbControls = page.locator('[data-testid="waveform-rgb-controls"]');
    await expect(rgbControls).toBeHidden();
  });

  test('RGBW-E010: R channel button is visible', async ({ page }) => {
    const rButton = page.locator('[data-testid="waveform-channel-r"]');
    await expect(rButton).toBeVisible();
    await expect(rButton).toHaveText('R');
  });

  test('RGBW-E011: G channel button is visible', async ({ page }) => {
    const gButton = page.locator('[data-testid="waveform-channel-g"]');
    await expect(gButton).toBeVisible();
    await expect(gButton).toHaveText('G');
  });

  test('RGBW-E012: B channel button is visible', async ({ page }) => {
    const bButton = page.locator('[data-testid="waveform-channel-b"]');
    await expect(bButton).toBeVisible();
    await expect(bButton).toHaveText('B');
  });

  test('RGBW-E020: clicking R button toggles R channel', async ({ page }) => {
    const rButton = page.locator('[data-testid="waveform-channel-r"]');

    // Initially full opacity
    let opacity = await rButton.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBe(1);

    // Click to disable
    await rButton.click();
    await page.waitForTimeout(100);

    // Should be dimmed
    opacity = await rButton.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeLessThan(1);

    // Click to re-enable
    await rButton.click();
    await page.waitForTimeout(100);

    opacity = await rButton.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBe(1);
  });

  test('RGBW-E021: toggling channels updates state', async ({ page }) => {
    // Disable R channel
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setWaveformChannel('r', false);
    });
    await page.waitForTimeout(100);

    const channels = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.mutations?.getWaveformEnabledChannels();
    });

    expect(channels.r).toBe(false);
    expect(channels.g).toBe(true);
    expect(channels.b).toBe(true);
  });

  test('RGBW-E030: intensity slider is visible', async ({ page }) => {
    const intensitySlider = page.locator('[data-testid="waveform-intensity-slider"]');
    await expect(intensitySlider).toBeVisible();
  });

  test('RGBW-E031: intensity slider has aria-label', async ({ page }) => {
    const intensitySlider = page.locator('[data-testid="waveform-intensity-slider"]');
    const ariaLabel = await intensitySlider.getAttribute('aria-label');
    expect(ariaLabel).toBe('Trace intensity');
  });

  test('RGBW-E032: changing intensity slider updates intensity', async ({ page }) => {
    const intensitySlider = page.locator('[data-testid="waveform-intensity-slider"]');

    // Set to max (30 = 0.3)
    await intensitySlider.evaluate((el) => {
      const input = el as HTMLInputElement;
      input.value = '30';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(100);

    const intensity = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.mutations?.getWaveformIntensity();
    });

    expect(intensity).toBe(0.3);
  });

  test('RGBW-E033: setIntensity syncs slider value', async ({ page }) => {
    // Set intensity programmatically
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setWaveformIntensity(0.2);
    });
    await page.waitForTimeout(100);

    // Verify slider value updated
    const intensitySlider = page.locator('[data-testid="waveform-intensity-slider"]');
    const value = await intensitySlider.inputValue();
    expect(parseInt(value, 10)).toBe(20);
  });
});
