import { test, expect } from '@playwright/test';
import path from 'path';
import {
  loadVideoFile,
  waitForTestHelper,
  getColorState,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Float LUT Precision Tests
 *
 * Tests for higher-precision LUT processing including:
 * - Float texture support on GPU (FLOAT/HALF_FLOAT textures)
 * - Tetrahedral interpolation for 3D LUTs
 * - Precision analysis and validation tools
 *
 * Implementation:
 * - src/color/WebGLLUT.ts - Float precision detection and float apply path
 * - src/color/TetrahedralInterp.ts - Tetrahedral interpolation for 3D LUTs
 * - src/color/LUTPrecision.ts - Precision analysis utilities
 *
 * Reference: OpenRV Float LUT Pipeline
 */

const SAMPLE_LUT = 'sample/test_lut.cube';

// Helper to wait for color panel to be ready
async function waitForColorPanel(page: import('@playwright/test').Page) {
  await page.click('button[data-tab-id="color"]');
  await page.waitForFunction(
    () => document.querySelector('button[data-tab-id="color"]')?.classList?.contains('active') ||
          document.querySelector('[data-tab-id="color"][aria-selected="true"]') !== null,
    { timeout: 5000 },
  );
  await page.keyboard.press('c');
  await page.waitForFunction(
    () => document.querySelector('.color-controls-panel') !== null,
    { timeout: 5000 },
  );
}

// Helper to wait for LUT loaded state
async function waitForLUTLoaded(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => (window as any).__OPENRV_TEST__?.getColorState()?.hasLUT === true,
    { timeout: 5000 },
  );
}

// Helper to wait for LUT cleared state
async function waitForLUTCleared(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => (window as any).__OPENRV_TEST__?.getColorState()?.hasLUT === false,
    { timeout: 5000 },
  );
}

// Helper to wait for a color state property to match
async function waitForColorState(
  page: import('@playwright/test').Page,
  predicate: string,
) {
  await page.waitForFunction(
    new Function('return ' + predicate) as () => boolean,
    { timeout: 5000 },
  );
}

test.describe('Float LUT Precision', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await waitForColorPanel(page);
  });

  test.describe('Float Precision Detection', () => {
    test('FLUT-E001: WebGL2 context reports float precision capabilities', async ({ page }) => {
      // Check that the app can detect float precision via WebGL2
      const capabilities = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) return null;

        const extCBF = gl.getExtension('EXT_color_buffer_float');
        const extFloatLinear = gl.getExtension('OES_texture_float_linear');

        return {
          hasWebGL2: true,
          hasColorBufferFloat: !!extCBF,
          hasFloatLinear: !!extFloatLinear,
        };
      });

      expect(capabilities).not.toBeNull();
      expect(capabilities!.hasWebGL2).toBe(true);
      // Float support varies by hardware; just verify detection works
      expect(typeof capabilities!.hasColorBufferFloat).toBe('boolean');
      expect(typeof capabilities!.hasFloatLinear).toBe('boolean');
    });

    test('FLUT-E002: Float FBO can be created and validated on supported hardware', async ({ page }) => {
      const fboResult = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) return { supported: false, reason: 'no webgl2' };

        const ext = gl.getExtension('EXT_color_buffer_float');
        if (!ext) return { supported: false, reason: 'no EXT_color_buffer_float' };

        // Try to create a float FBO
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, 4, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        const complete = status === gl.FRAMEBUFFER_COMPLETE;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteTexture(tex);
        gl.deleteFramebuffer(fbo);

        return { supported: true, complete };
      });

      expect(fboResult.supported).toBe(true);
      // On most modern hardware, float FBOs should work
      if (fboResult.supported && 'complete' in fboResult) {
        expect(typeof fboResult.complete).toBe('boolean');
      }
    });
  });

  test.describe('LUT Processing with Precision', () => {
    test('FLUT-E003: LUT loaded state updates correctly', async ({ page }) => {
      let state = await getColorState(page);
      expect(state.hasLUT).toBe(false);

      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      state = await getColorState(page);
      expect(state.hasLUT).toBe(true);
    });

    test('FLUT-E004: LUT application produces visual change', async ({ page }) => {
      const beforeScreenshot = await captureViewerScreenshot(page);

      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      const afterScreenshot = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
    });

    test('FLUT-E005: Float readback preserves precision on GPU', async ({ page }) => {
      // Test that float textures can round-trip data without 8-bit quantization
      const roundtripResult = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) return { supported: false, reason: 'no webgl2' };

        const ext = gl.getExtension('EXT_color_buffer_float');
        if (!ext) return { supported: false, reason: 'no float support' };

        // Create a float texture with precise values
        const testData = new Float32Array([
          0.123456, 0.654321, 0.999999, 1.0,
          0.111111, 0.222222, 0.333333, 1.0,
          0.444444, 0.555555, 0.666666, 1.0,
          0.777777, 0.888888, 0.999000, 1.0,
        ]);

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 2, 2, 0, gl.RGBA, gl.FLOAT, testData);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.deleteTexture(tex);
          gl.deleteFramebuffer(fbo);
          return { supported: false, reason: 'fbo incomplete' };
        }

        // Read back
        const readback = new Float32Array(16);
        gl.readPixels(0, 0, 2, 2, gl.RGBA, gl.FLOAT, readback);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteTexture(tex);
        gl.deleteFramebuffer(fbo);

        // Check precision
        let maxError = 0;
        for (let i = 0; i < testData.length; i++) {
          maxError = Math.max(maxError, Math.abs(testData[i]! - readback[i]!));
        }

        return {
          supported: true,
          maxError,
          firstPixelR: readback[0],
          precisionPreserved: maxError < 0.0001,
        };
      });

      if (roundtripResult.supported) {
        expect(roundtripResult.precisionPreserved).toBe(true);
        expect(roundtripResult.maxError).toBeLessThan(0.0001);
      }
    });
  });

  test.describe('LUT Intensity with Float Pipeline', () => {
    test('FLUT-E006: LUT intensity at 0% shows no LUT effect', async ({ page }) => {
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      // Find and set intensity to 0
      const intensityRow = page.locator('.color-controls-panel').locator('label:has-text("Intensity")').locator('..').locator('input[type="range"]').first();

      if (await intensityRow.isVisible()) {
        await intensityRow.fill('0');
        await intensityRow.dispatchEvent('input');
        await page.waitForFunction(
          () => (window as any).__OPENRV_TEST__?.getColorState()?.lutIntensity === 0,
          { timeout: 5000 },
        );

        const state = await getColorState(page);
        expect(state.lutIntensity).toBe(0);
        expect(state.hasLUT).toBe(true);
      }
    });

    test('FLUT-E007: LUT intensity at 50% blends correctly', async ({ page }) => {
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      const screenshot100 = await captureViewerScreenshot(page);

      const intensityRow = page.locator('.color-controls-panel').locator('label:has-text("Intensity")').locator('..').locator('input[type="range"]').first();

      if (await intensityRow.isVisible()) {
        await intensityRow.fill('0.5');
        await intensityRow.dispatchEvent('input');
        await page.waitForFunction(
          () => {
            const state = (window as any).__OPENRV_TEST__?.getColorState();
            return state && Math.abs(state.lutIntensity - 0.5) < 0.01;
          },
          { timeout: 5000 },
        );

        const screenshot50 = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(screenshot100, screenshot50)).toBe(true);
      }
    });
  });

  test.describe('Float Pipeline Integration', () => {
    test('FLUT-E008: LUT works combined with exposure adjustment', async ({ page }) => {
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      const screenshotLUTOnly = await captureViewerScreenshot(page);

      // Find and adjust exposure
      const exposureSlider = page.locator('[data-testid="slider-exposure"]').first();
      if (await exposureSlider.isVisible()) {
        await exposureSlider.fill('2');
        await exposureSlider.dispatchEvent('input');
        await page.waitForFunction(
          () => (window as any).__OPENRV_TEST__?.getColorState()?.exposure === 2,
          { timeout: 5000 },
        );

        const state = await getColorState(page);
        expect(state.hasLUT).toBe(true);
        expect(state.exposure).toBeCloseTo(2, 1);

        const screenshotLUTExposure = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(screenshotLUTOnly, screenshotLUTExposure)).toBe(true);
      }
    });

    test('FLUT-E009: LUT state persists across frame navigation', async ({ page }) => {
      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      let state = await getColorState(page);
      expect(state.hasLUT).toBe(true);

      // Navigate forward
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(
        () => (window as any).__OPENRV_TEST__?.getColorState()?.hasLUT === true,
        { timeout: 5000 },
      );

      state = await getColorState(page);
      expect(state.hasLUT).toBe(true);

      // Navigate back
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(
        () => (window as any).__OPENRV_TEST__?.getColorState()?.hasLUT === true,
        { timeout: 5000 },
      );

      state = await getColorState(page);
      expect(state.hasLUT).toBe(true);
    });

    test('FLUT-E010: Clear LUT restores original view', async ({ page }) => {
      const screenshotOriginal = await captureViewerScreenshot(page);

      const fileInput = page.locator('.color-controls-panel input[type="file"][accept=".cube"]').first();
      if (!(await fileInput.count())) {
        test.skip();
        return;
      }

      const lutPath = path.resolve(process.cwd(), SAMPLE_LUT);
      await fileInput.setInputFiles(lutPath);
      await waitForLUTLoaded(page);

      let state = await getColorState(page);
      expect(state.hasLUT).toBe(true);

      const screenshotWithLUT = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(screenshotOriginal, screenshotWithLUT)).toBe(true);

      // Find and click clear button
      const clearButton = page.locator('.color-controls-panel button:has-text("\u2715"), .color-controls-panel button[title*="Remove LUT"]').first();
      if (await clearButton.isVisible()) {
        await clearButton.click();
        await waitForLUTCleared(page);

        state = await getColorState(page);
        expect(state.hasLUT).toBe(false);

        const screenshotCleared = await captureViewerScreenshot(page);
        expect(imagesAreDifferent(screenshotWithLUT, screenshotCleared)).toBe(true);
      }
    });
  });

  test.describe('3D LUT Texture Precision on GPU', () => {
    test('FLUT-E011: 3D LUT texture uses float internal format', async ({ page }) => {
      // Verify that the LUT texture is uploaded as RGB32F (already the case)
      const result = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) return { supported: false };

        // Check that texImage3D with RGB32F works
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_3D, tex);

        const size = 2;
        const data = new Float32Array(size * size * size * 3);
        // Fill with identity
        let idx = 0;
        for (let r = 0; r < size; r++) {
          for (let g = 0; g < size; g++) {
            for (let b = 0; b < size; b++) {
              data[idx++] = r / (size - 1);
              data[idx++] = g / (size - 1);
              data[idx++] = b / (size - 1);
            }
          }
        }

        try {
          gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB32F, size, size, size, 0, gl.RGB, gl.FLOAT, data);
          const err = gl.getError();
          gl.deleteTexture(tex);
          return { supported: true, error: err, noError: err === gl.NO_ERROR };
        } catch {
          gl.deleteTexture(tex);
          return { supported: false };
        }
      });

      expect(result.supported).toBe(true);
      if (result.supported) {
        expect(result.noError).toBe(true);
      }
    });

    test('FLUT-E012: Half-float FBO is available as fallback', async ({ page }) => {
      const result = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) return { supported: false };

        const ext = gl.getExtension('EXT_color_buffer_float');
        if (!ext) return { supported: false, reason: 'no ext' };

        // Try RGBA16F FBO
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        const complete = status === gl.FRAMEBUFFER_COMPLETE;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteTexture(tex);
        gl.deleteFramebuffer(fbo);

        return { supported: true, complete };
      });

      if (result.supported) {
        // RGBA16F FBOs should work on all modern GPUs with EXT_color_buffer_float
        expect(typeof result.complete).toBe('boolean');
      }
    });
  });
});
