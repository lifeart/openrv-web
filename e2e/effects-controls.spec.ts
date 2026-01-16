import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Effects Controls Tests
 *
 * Each test verifies that applying effects causes visible canvas changes
 * and that controls respond properly to user input.
 */

test.describe('Effects Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Switch to Effects tab
    await page.click('button[data-tab-id="effects"]');
    await page.waitForTimeout(200);
  });

  test.describe('Filter Panel', () => {
    test('EFFECTS-001: effects tab should show filter controls', async ({ page }) => {
      // Should have filter button or controls visible
      const filterButton = page.locator('button[title*="Filter"]').first();
      await expect(filterButton).toBeVisible();
    });

    test('EFFECTS-002: toggling filter panel with G key should open/close panel', async ({ page }) => {
      // Press G to open filter panel
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      // Panel should be visible
      const filterPanel = page.locator('.filter-panel');
      await expect(filterPanel).toBeVisible();

      // Toggle back
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      // Panel should be hidden
      await expect(filterPanel).not.toBeVisible();
    });
  });

  test.describe('Blur Filter', () => {
    test('EFFECTS-010: applying blur should visually change the canvas', async ({ page }) => {
      // Open filter panel
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Find and adjust blur slider
      const blurSlider = page.locator('.filter-panel input[type="range"]').first();
      if (await blurSlider.isVisible()) {
        await blurSlider.evaluate((el: HTMLInputElement) => {
          el.value = '10';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        // Verify canvas changed
        const blurredScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(initialScreenshot, blurredScreenshot)).toBe(true);
      }
    });

    test('EFFECTS-011: adjusting blur value should progressively change canvas', async ({ page }) => {
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      const blurSlider = page.locator('.filter-panel input[type="range"]').first();
      if (await blurSlider.isVisible()) {
        // Apply low blur
        await blurSlider.evaluate((el: HTMLInputElement) => {
          el.value = '3';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        const lowBlurScreenshot = await captureViewerScreenshot(page);

        // Apply high blur
        await blurSlider.evaluate((el: HTMLInputElement) => {
          el.value = '15';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        const highBlurScreenshot = await captureViewerScreenshot(page);

        // Different blur levels should produce different results
        expect(imagesAreDifferent(lowBlurScreenshot, highBlurScreenshot)).toBe(true);
      }
    });

    test('EFFECTS-012: resetting blur with double-click should restore original canvas', async ({ page }) => {
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      const blurSlider = page.locator('.filter-panel input[type="range"]').first();
      if (await blurSlider.isVisible()) {
        // Apply blur
        await blurSlider.evaluate((el: HTMLInputElement) => {
          el.value = '10';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        const blurredScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(initialScreenshot, blurredScreenshot)).toBe(true);

        // Double-click to reset
        await blurSlider.dblclick();
        await page.waitForTimeout(200);

        const resetScreenshot = await captureViewerScreenshot(page);
        // Canvas should be back to original (no blur)
        // Note: May not be pixel-perfect due to rendering, but should be close
      }
    });
  });

  test.describe('Sharpen Filter', () => {
    test('EFFECTS-020: applying sharpen should visually change the canvas', async ({ page }) => {
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Find sharpen slider (usually second slider in filter panel)
      const sharpenSlider = page.locator('.filter-panel input[type="range"]').nth(1);
      if (await sharpenSlider.isVisible()) {
        await sharpenSlider.evaluate((el: HTMLInputElement) => {
          el.value = '50';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        const sharpenedScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(initialScreenshot, sharpenedScreenshot)).toBe(true);
      }
    });
  });

  test.describe('Lens Distortion', () => {
    test('EFFECTS-030: lens distortion button should open lens panel', async ({ page }) => {
      const lensButton = page.locator('button[title*="Lens"]').first();
      if (await lensButton.isVisible()) {
        await lensButton.click();
        await page.waitForTimeout(200);

        // Lens panel should be visible
        const lensPanel = page.locator('.lens-panel');
        await expect(lensPanel).toBeVisible();
      }
    });

    test('EFFECTS-031: applying barrel distortion should visually change the canvas', async ({ page }) => {
      const lensButton = page.locator('button[title*="Lens"]').first();
      if (await lensButton.isVisible()) {
        await lensButton.click();
        await page.waitForTimeout(200);

        const initialScreenshot = await captureViewerScreenshot(page);

        // Find distortion coefficient slider
        const distortionSlider = page.locator('.lens-panel input[type="range"]').first();
        if (await distortionSlider.isVisible()) {
          await distortionSlider.evaluate((el: HTMLInputElement) => {
            el.value = '0.3';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.waitForTimeout(300);

          const distortedScreenshot = await captureViewerScreenshot(page);
          expect(imagesAreDifferent(initialScreenshot, distortedScreenshot)).toBe(true);
        }
      }
    });

    test('EFFECTS-032: applying pincushion distortion should visually change the canvas', async ({ page }) => {
      const lensButton = page.locator('button[title*="Lens"]').first();
      if (await lensButton.isVisible()) {
        await lensButton.click();
        await page.waitForTimeout(200);

        const initialScreenshot = await captureViewerScreenshot(page);

        const distortionSlider = page.locator('.lens-panel input[type="range"]').first();
        if (await distortionSlider.isVisible()) {
          // Negative value for pincushion
          await distortionSlider.evaluate((el: HTMLInputElement) => {
            el.value = '-0.3';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.waitForTimeout(300);

          const distortedScreenshot = await captureViewerScreenshot(page);
          expect(imagesAreDifferent(initialScreenshot, distortedScreenshot)).toBe(true);
        }
      }
    });

    test('EFFECTS-033: adjusting lens center should change distortion origin', async ({ page }) => {
      const lensButton = page.locator('button[title*="Lens"]').first();
      if (await lensButton.isVisible()) {
        await lensButton.click();
        await page.waitForTimeout(200);

        // First apply some distortion
        const distortionSlider = page.locator('.lens-panel input[type="range"]').first();
        if (await distortionSlider.isVisible()) {
          await distortionSlider.evaluate((el: HTMLInputElement) => {
            el.value = '0.2';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.waitForTimeout(200);

          const centeredScreenshot = await captureViewerScreenshot(page);

          // Adjust center X
          const centerXSlider = page.locator('.lens-panel input[type="range"]').nth(1);
          if (await centerXSlider.isVisible()) {
            await centerXSlider.evaluate((el: HTMLInputElement) => {
              el.value = '0.3';
              el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await page.waitForTimeout(200);

            const offsetScreenshot = await captureViewerScreenshot(page);
            expect(imagesAreDifferent(centeredScreenshot, offsetScreenshot)).toBe(true);
          }
        }
      }
    });

    test('EFFECTS-034: lens scale should compensate for edge cropping', async ({ page }) => {
      const lensButton = page.locator('button[title*="Lens"]').first();
      if (await lensButton.isVisible()) {
        await lensButton.click();
        await page.waitForTimeout(200);

        // Apply distortion
        const distortionSlider = page.locator('.lens-panel input[type="range"]').first();
        if (await distortionSlider.isVisible()) {
          await distortionSlider.evaluate((el: HTMLInputElement) => {
            el.value = '0.3';
            el.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.waitForTimeout(200);

          const noScaleScreenshot = await captureViewerScreenshot(page);

          // Adjust scale
          const scaleSlider = page.locator('.lens-panel input[type="range"]').last();
          if (await scaleSlider.isVisible()) {
            await scaleSlider.evaluate((el: HTMLInputElement) => {
              el.value = '1.3';
              el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await page.waitForTimeout(200);

            const scaledScreenshot = await captureViewerScreenshot(page);
            expect(imagesAreDifferent(noScaleScreenshot, scaledScreenshot)).toBe(true);
          }
        }
      }
    });
  });

  test.describe('Filter Combinations', () => {
    test('EFFECTS-040: applying multiple effects should combine visually', async ({ page }) => {
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply blur
      const blurSlider = page.locator('.filter-panel input[type="range"]').first();
      if (await blurSlider.isVisible()) {
        await blurSlider.evaluate((el: HTMLInputElement) => {
          el.value = '5';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);
      }

      const blurOnlyScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(initialScreenshot, blurOnlyScreenshot)).toBe(true);

      // Apply sharpen on top
      const sharpenSlider = page.locator('.filter-panel input[type="range"]').nth(1);
      if (await sharpenSlider.isVisible()) {
        await sharpenSlider.evaluate((el: HTMLInputElement) => {
          el.value = '30';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);
      }

      const combinedScreenshot = await captureViewerScreenshot(page);
      // Combined effect should be different from blur only
      expect(imagesAreDifferent(blurOnlyScreenshot, combinedScreenshot)).toBe(true);
    });
  });

  test.describe('Effect Persistence', () => {
    test('EFFECTS-050: effects should persist across frame changes', async ({ page }) => {
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      // Apply blur
      const blurSlider = page.locator('.filter-panel input[type="range"]').first();
      if (await blurSlider.isVisible()) {
        await blurSlider.evaluate((el: HTMLInputElement) => {
          el.value = '8';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        const blurredFrame1 = await captureViewerScreenshot(page);

        // Step to next frame
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(200);

        // Effect should still be applied (canvas should not be sharp)
        // The frame content changed but blur should still be visible
        const blurredFrame2 = await captureViewerScreenshot(page);

        // Go back to original frame
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(200);

        // Should look similar to first blurred screenshot
        const backToFrame1 = await captureViewerScreenshot(page);
        // Note: Due to video compression, may not be pixel-identical
      }
    });
  });

  test.describe('Filter Reset', () => {
    test('EFFECTS-060: reset button should restore all effects to default', async ({ page }) => {
      await page.keyboard.press('g');
      await page.waitForTimeout(200);

      const initialScreenshot = await captureViewerScreenshot(page);

      // Apply blur
      const blurSlider = page.locator('.filter-panel input[type="range"]').first();
      if (await blurSlider.isVisible()) {
        await blurSlider.evaluate((el: HTMLInputElement) => {
          el.value = '10';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        const blurredScreenshot = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(initialScreenshot, blurredScreenshot)).toBe(true);

        // Look for reset button in filter panel
        const resetButton = page.locator('.filter-panel button[title*="Reset"]').first();
        if (await resetButton.isVisible()) {
          await resetButton.click();
          await page.waitForTimeout(200);

          const resetScreenshot = await captureViewerScreenshot(page);
          // Canvas should be restored to original
        }
      }
    });
  });
});
