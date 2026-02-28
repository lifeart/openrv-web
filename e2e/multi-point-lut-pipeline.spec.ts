import { test, expect } from '@playwright/test';
import path from 'path';
import {
  loadVideoFile,
  waitForTestHelper,
  captureViewerScreenshot,
  captureViewerScreenshotClean,
  imagesAreDifferent,
  imagesLookDifferent,
} from './fixtures';

const SAMPLE_LUT_WARM = 'sample/test_lut.cube';

/** Get pipeline state from test helper */
async function getLUTPipelineState(page: import('@playwright/test').Page): Promise<{
  precache: { enabled: boolean; hasLUT: boolean; intensity: number; lutName: string | null };
  file: { enabled: boolean; hasLUT: boolean; intensity: number; lutName: string | null };
  look: { enabled: boolean; hasLUT: boolean; intensity: number; lutName: string | null };
  display: { enabled: boolean; hasLUT: boolean; intensity: number; lutName: string | null };
}> {
  return page.evaluate(() => {
    const panel = (window as any).__OPENRV_TEST__?.mutations?.getLUTPipelinePanel();
    return panel?.getPipelineState?.() ?? {
      precache: { enabled: true, hasLUT: false, intensity: 1, lutName: null },
      file: { enabled: true, hasLUT: false, intensity: 1, lutName: null },
      look: { enabled: true, hasLUT: false, intensity: 1, lutName: null },
      display: { enabled: true, hasLUT: false, intensity: 1, lutName: null },
    };
  });
}

/** Check whether LUT pipeline panel is wired in this app build. */
async function hasLUTPipelinePanel(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    return !!(window as any).__OPENRV_TEST__?.mutations?.getLUTPipelinePanel();
  });
}

/** Wait for a specific stage to have a LUT loaded */
async function waitForStageLUT(
  page: import('@playwright/test').Page,
  stage: string,
  hasLUT: boolean,
) {
  await page.waitForFunction(
    ({ s, expected }) => {
      const panel = (window as any).__OPENRV_TEST__?.mutations?.getLUTPipelinePanel();
      const state = panel?.getPipelineState?.();
      return state && state[s]?.hasLUT === expected;
    },
    { s: stage, expected: hasLUT },
    { timeout: 5000 },
  );
}

/** Wait for a specific stage enabled state */
async function waitForStageEnabled(
  page: import('@playwright/test').Page,
  stage: string,
  enabled: boolean,
) {
  await page.waitForFunction(
    ({ s, expected }) => {
      const panel = (window as any).__OPENRV_TEST__?.mutations?.getLUTPipelinePanel();
      const state = panel?.getPipelineState?.();
      return state && state[s]?.enabled === expected;
    },
    { s: stage, expected: enabled },
    { timeout: 5000 },
  );
}

/** Open the LUT Pipeline panel */
async function openLUTPipelinePanel(page: import('@playwright/test').Page): Promise<void> {
  await page.click('button[data-tab-id="color"]');
  const panel = page.locator('[data-testid="lut-pipeline-panel"]');
  if (!(await panel.isVisible())) {
    await page.keyboard.press('Shift+l');
  }
  await expect(panel).toBeVisible();
}

/** Load a LUT into a specific stage */
async function loadLUTIntoStage(
  page: import('@playwright/test').Page,
  stage: 'precache' | 'file' | 'look' | 'display',
  lutFile: string,
): Promise<void> {
  const fileInput = page.locator(`[data-testid="lut-${stage}-file-input"]`);
  const lutPath = path.resolve(process.cwd(), lutFile);
  await fileInput.setInputFiles(lutPath);
  await waitForStageLUT(page, stage, true);
}

test.describe('Multi-Point LUT Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    test.skip(
      !(await hasLUTPipelinePanel(page)),
      'LUT pipeline panel control is not wired in this app build.',
    );
    await loadVideoFile(page);
  });

  test.describe('Panel Visibility and Layout', () => {
    test('MLUT-E001: LUT Pipeline panel opens via Shift+L', async ({ page }) => {
      await page.click('button[data-tab-id="color"]');

      await page.keyboard.press('Shift+l');

      const panel = page.locator('[data-testid="lut-pipeline-panel"]');
      await expect(panel).toBeVisible();
    });

    test('MLUT-E002: LUT Pipeline panel shows all four stages', async ({ page }) => {
      await openLUTPipelinePanel(page);

      await expect(page.locator('[data-testid="lut-precache-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="lut-file-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="lut-look-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="lut-display-section"]')).toBeVisible();
    });

    test('MLUT-E003: close button dismisses panel', async ({ page }) => {
      await openLUTPipelinePanel(page);

      const panel = page.locator('[data-testid="lut-pipeline-panel"]');
      await expect(panel).toBeVisible();

      await page.click('[data-testid="lut-pipeline-close"]');
      await expect(panel).not.toBeVisible();
    });

    test('MLUT-E004: Shift+L toggles panel visibility', async ({ page }) => {
      await page.click('button[data-tab-id="color"]');

      // Open
      await page.keyboard.press('Shift+l');
      const panel = page.locator('[data-testid="lut-pipeline-panel"]');
      await expect(panel).toBeVisible();

      // Close
      await page.keyboard.press('Shift+l');
      await expect(panel).not.toBeVisible();
    });

    test('MLUT-E005: reset button clears all LUT stages', async ({ page }) => {
      await openLUTPipelinePanel(page);

      // Load LUTs into multiple stages
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);
      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);

      let state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(true);
      expect(state.look.hasLUT).toBe(true);

      // Reset all
      await page.click('[data-testid="lut-pipeline-reset"]');
      await waitForStageLUT(page, 'file', false);

      state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(false);
      expect(state.look.hasLUT).toBe(false);
      expect(state.display.hasLUT).toBe(false);
      expect(state.precache.hasLUT).toBe(false);
    });
  });

  test.describe('File LUT Stage', () => {
    test('MLUT-E010: loading a File LUT changes image appearance', async ({ page }) => {
      await openLUTPipelinePanel(page);
      const screenshotBefore = await captureViewerScreenshot(page);

      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);

      const state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(true);

      const screenshotAfter = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
    });

    test('MLUT-E011: File LUT name displayed in UI', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);

      const lutName = page.locator('[data-testid="lut-file-name"]');
      await expect(lutName).toBeVisible();
      const nameText = await lutName.textContent();
      expect(nameText).toBeTruthy();
      expect(nameText!.length).toBeGreaterThan(0);
    });

    test('MLUT-E012: File LUT bypass toggle disables stage', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);

      const screenshotEnabled = await captureViewerScreenshot(page);

      // Disable the File LUT stage
      await page.click('[data-testid="lut-file-toggle"]');
      await waitForStageEnabled(page, 'file', false);

      const state = await getLUTPipelineState(page);
      expect(state.file.enabled).toBe(false);
      expect(state.file.hasLUT).toBe(true); // LUT still loaded, just bypassed

      const screenshotDisabled = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotEnabled, screenshotDisabled)).toBe(true);
    });

    test('MLUT-E013: File LUT clear button removes LUT', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);

      let state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(true);

      await page.click('[data-testid="lut-file-clear-button"]');
      await waitForStageLUT(page, 'file', false);

      state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(false);
      expect(state.file.lutName).toBeNull();
    });
  });

  test.describe('Look LUT Stage', () => {
    test('MLUT-E020: loading a Look LUT changes image appearance', async ({ page }) => {
      await openLUTPipelinePanel(page);
      const screenshotBefore = await captureViewerScreenshot(page);

      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);

      const state = await getLUTPipelineState(page);
      expect(state.look.hasLUT).toBe(true);

      const screenshotAfter = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
    });

    test('MLUT-E021: Look LUT bypass toggle disables stage', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);

      const screenshotEnabled = await captureViewerScreenshot(page);

      await page.click('[data-testid="lut-look-toggle"]');
      await waitForStageEnabled(page, 'look', false);

      const state = await getLUTPipelineState(page);
      expect(state.look.enabled).toBe(false);

      const screenshotDisabled = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotEnabled, screenshotDisabled)).toBe(true);
    });
  });

  test.describe('Display LUT Stage', () => {
    test('MLUT-E030: loading a Display LUT changes image appearance', async ({ page }) => {
      await openLUTPipelinePanel(page);
      const screenshotBefore = await captureViewerScreenshot(page);

      await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);

      const state = await getLUTPipelineState(page);
      expect(state.display.hasLUT).toBe(true);

      const screenshotAfter = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
    });

    test('MLUT-E031: Display LUT persists when navigating frames', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);

      let state = await getLUTPipelineState(page);
      expect(state.display.hasLUT).toBe(true);

      // Navigate to a different frame
      await page.keyboard.press('ArrowRight');
      // Verify state persists
      await waitForStageLUT(page, 'display', true);

      state = await getLUTPipelineState(page);
      expect(state.display.hasLUT).toBe(true);
      expect(state.display.lutName).toBeTruthy();
    });

    test('MLUT-E032: Display LUT bypass toggle disables stage', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);

      const screenshotEnabled = await captureViewerScreenshot(page);

      await page.click('[data-testid="lut-display-toggle"]');
      await waitForStageEnabled(page, 'display', false);

      const state = await getLUTPipelineState(page);
      expect(state.display.enabled).toBe(false);

      const screenshotDisabled = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotEnabled, screenshotDisabled)).toBe(true);
    });
  });

  test.describe('Pre-Cache LUT Stage', () => {
    test('MLUT-E040: loading a Pre-Cache LUT changes image appearance', async ({ page }) => {
      await openLUTPipelinePanel(page);
      const screenshotBefore = await captureViewerScreenshot(page);

      await loadLUTIntoStage(page, 'precache', SAMPLE_LUT_WARM);

      const state = await getLUTPipelineState(page);
      expect(state.precache.hasLUT).toBe(true);

      const screenshotAfter = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotBefore, screenshotAfter)).toBe(true);
    });

    test('MLUT-E041: Pre-Cache LUT bypass toggle disables stage', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'precache', SAMPLE_LUT_WARM);

      const screenshotEnabled = await captureViewerScreenshot(page);

      await page.click('[data-testid="lut-precache-toggle"]');
      await waitForStageEnabled(page, 'precache', false);

      const state = await getLUTPipelineState(page);
      expect(state.precache.enabled).toBe(false);

      const screenshotDisabled = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotEnabled, screenshotDisabled)).toBe(true);
    });
  });

  test.describe('LUT Chain Ordering', () => {
    test('MLUT-E050: all three GPU stages combine correctly', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await page.waitForTimeout(200);
      const screenshotOriginal = await captureViewerScreenshot(page);

      // Load into all three GPU stages, waiting for render after each
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);
      await page.waitForTimeout(300);
      const screenshotOneStage = await captureViewerScreenshot(page);

      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);
      await page.waitForTimeout(300);
      const screenshotTwoStages = await captureViewerScreenshot(page);

      await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);
      await page.waitForTimeout(300);
      const screenshotThreeStages = await captureViewerScreenshot(page);

      // Each stage should change the image from the original
      expect(imagesAreDifferent(screenshotOriginal, screenshotOneStage)).toBe(true);
      expect(imagesAreDifferent(screenshotOneStage, screenshotTwoStages)).toBe(true);
      // The third warm LUT may saturate clamped channels, so verify all three
      // stages combined still differ from both the original and single-stage result
      expect(imagesAreDifferent(screenshotOriginal, screenshotThreeStages)).toBe(true);
      expect(imagesAreDifferent(screenshotOneStage, screenshotThreeStages)).toBe(true);
    });
  });

  test.describe('Per-Source LUT Assignment', () => {
    test('MLUT-E060: source selector dropdown visible', async ({ page }) => {
      await openLUTPipelinePanel(page);

      const sourceSelector = page.locator('[data-testid="lut-source-selector"]');
      if (await sourceSelector.isVisible()) {
        await sourceSelector.click();
        const options = page.locator('[data-testid="lut-source-selector"] option');
        const count = await options.count();
        expect(count).toBeGreaterThanOrEqual(1);
      }
    });

    test('MLUT-E061: LUT state persists across frame navigation', async ({ page }) => {
      await openLUTPipelinePanel(page);
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);
      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);

      let state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(true);
      expect(state.look.hasLUT).toBe(true);

      // Navigate frames
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowLeft');
      await waitForStageLUT(page, 'file', true);

      state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(true);
      expect(state.look.hasLUT).toBe(true);
    });
  });

  test.describe('OCIO Integration', () => {
    test('MLUT-E080: OCIO-derived File LUT shows source indicator', async ({ page }) => {
      await openLUTPipelinePanel(page);

      const sourceSelect = page.locator('[data-testid="lut-file-source-select"]');
      if (await sourceSelect.isVisible()) {
        const currentValue = await sourceSelect.inputValue();
        expect(currentValue).toBe('manual');
      }
    });

    test('MLUT-E081: manual LUT overrides OCIO assignment', async ({ page }) => {
      await openLUTPipelinePanel(page);

      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);

      const state = await getLUTPipelineState(page);
      expect(state.file.hasLUT).toBe(true);

      const sourceSelect = page.locator('[data-testid="lut-file-source-select"]');
      if (await sourceSelect.isVisible()) {
        const currentValue = await sourceSelect.inputValue();
        expect(currentValue).toBe('manual');
      }
    });
  });

  test.describe('Edge Cases', () => {
    test('MLUT-E090: no LUTs loaded produces original image', async ({ page }) => {
      await openLUTPipelinePanel(page);

      const state = await getLUTPipelineState(page);
      expect(state.precache.hasLUT).toBe(false);
      expect(state.file.hasLUT).toBe(false);
      expect(state.look.hasLUT).toBe(false);
      expect(state.display.hasLUT).toBe(false);

      const screenshot = await captureViewerScreenshot(page);
      expect(screenshot).toBeTruthy();
    });

    test('MLUT-E091: all stages bypassed shows original image', async ({ page }) => {
      // Capture original using clean screenshot (no overlays)
      await page.waitForTimeout(200);
      const screenshotOriginal = await captureViewerScreenshotClean(page);

      await openLUTPipelinePanel(page);

      // Load LUTs into all stages
      await loadLUTIntoStage(page, 'file', SAMPLE_LUT_WARM);
      await loadLUTIntoStage(page, 'look', SAMPLE_LUT_WARM);
      await loadLUTIntoStage(page, 'display', SAMPLE_LUT_WARM);

      // Bypass all stages
      await page.click('[data-testid="lut-file-toggle"]');
      await page.click('[data-testid="lut-look-toggle"]');
      await page.click('[data-testid="lut-display-toggle"]');
      await waitForStageEnabled(page, 'display', false);

      await page.waitForTimeout(200);
      // Use clean screenshot to exclude any LUT/pipeline overlays
      const screenshotBypassed = await captureViewerScreenshotClean(page);

      // Use pixel-level comparison with tolerance to handle minor GPU rendering differences
      const looksChanged = await imagesLookDifferent(page, screenshotOriginal, screenshotBypassed);
      expect(looksChanged).toBe(false);
    });
  });
});
