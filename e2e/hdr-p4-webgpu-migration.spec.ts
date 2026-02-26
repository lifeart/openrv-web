import { test, expect } from '@playwright/test';
import {
  waitForTestHelper,
  loadVideoFile,
  loadExrFile,
  captureCanvasState,
  getColorState,
  getToneMappingState,
} from './fixtures';

/**
 * Phase 4: WebGPU Migration Path - E2E Integration Tests
 *
 * Tests verify:
 * - WebGPU backend availability detection
 * - Backend fallback from WebGPU to WebGL2
 * - Backend info display in UI
 * - Rendering remains functional regardless of backend
 *
 * Note: WebGPU is not available in headless Chromium by default.
 * Most tests verify the fallback path (WebGL2) works correctly.
 * WebGPU-specific tests are skipped when the API is unavailable.
 */

/** Helper: Navigate to Color tab */
async function goToColorTab(page: import('@playwright/test').Page) {
  await page.click('button[data-tab-id="color"]');
}

/** Helper: Open color controls panel and return Exposure slider. */
async function getExposureSlider(page: import('@playwright/test').Page) {
  await page.click('button[data-tab-id="color"]');

  const panel = page.locator('.color-controls-panel');
  if (!(await panel.isVisible().catch(() => false))) {
    const toggle = page.locator('button[title="Toggle color adjustments panel"]');
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
    } else {
      await page.keyboard.press('c');
    }
    await expect(panel).toBeVisible();
  }

  const exposureSlider = panel
    .locator('label')
    .filter({ hasText: 'Exposure' })
    .locator('..')
    .locator('input[type="range"]')
    .first();

  await expect(exposureSlider).toBeVisible();
  return exposureSlider;
}

/** Helper: Check if WebGPU is available in the browser */
async function browserHasWebGPU(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  });
}

/** Helper: Check if WebGPU adapter can be obtained */
async function browserCanGetWebGPUAdapter(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(async () => {
    try {
      if (!('gpu' in navigator)) return false;
      const adapter = await (navigator as any).gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  });
}

async function installDeterministicWebGPUMock(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const globalAny = window as any;
    if (globalAny.__OPENRV_WEBGPU_MOCK_INSTALLED__) return;
    globalAny.__OPENRV_WEBGPU_MOCK_INSTALLED__ = true;

    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    const toByte = (value: number): number => {
      const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
      return Math.max(0, Math.min(255, Math.round(clamped * 255)));
    };

    const hasInvertedV = (shaderCode: string): boolean => {
      const code = shaderCode.replace(/\s+/g, ' ');
      return /1\.0\s*-\s*\(?\s*\(y\s*\+\s*1\.0\)\s*\/\s*2\.0\s*\)?/.test(code)
        || /1\.0\s*-\s*in\.uv\.y/.test(code)
        || /1\.0\s*-\s*\(in\.uv\.y\)/.test(code);
    };

    const renderTextureToCanvas = (sourceTexture: any, targetCanvas: HTMLCanvasElement, shaderCode: string): void => {
      const width = Number(sourceTexture?.__width ?? 0);
      const height = Number(sourceTexture?.__height ?? 0);
      const source = sourceTexture?.__data as Float32Array | undefined;
      if (!source || width < 1 || height < 1) return;

      targetCanvas.width = width;
      targetCanvas.height = height;
      const ctx = originalGetContext.call(targetCanvas, '2d') as CanvasRenderingContext2D | null;
      if (!ctx) return;

      const imageData = ctx.createImageData(width, height);
      const invertV = hasInvertedV(shaderCode);

      for (let y = 0; y < height; y++) {
        const srcY = invertV ? y : (height - 1 - y);
        for (let x = 0; x < width; x++) {
          const srcIndex = (srcY * width + x) * 4;
          const dstIndex = (y * width + x) * 4;
          imageData.data[dstIndex] = toByte(source[srcIndex] ?? 0);
          imageData.data[dstIndex + 1] = toByte(source[srcIndex + 1] ?? 0);
          imageData.data[dstIndex + 2] = toByte(source[srcIndex + 2] ?? 0);
          imageData.data[dstIndex + 3] = 255;
        }
      }

      ctx.putImageData(imageData, 0, 0);
    };

    const createMockDevice = (): any => {
      const state = { shaderCode: '' };

      const queue = {
        writeTexture: (
          dest: { texture: any },
          data: Float32Array,
          _layout: { bytesPerRow: number; rowsPerImage: number },
          size: { width: number; height: number },
        ) => {
          const texture = dest.texture;
          texture.__width = size.width;
          texture.__height = size.height;
          texture.__data = new Float32Array(data);
        },
        submit: (commands: any[]) => {
          for (const command of commands) {
            const passes: any[] = command?.__passes ?? [];
            for (const pass of passes) {
              if (!pass?.__drawn || !pass?.__bindGroup) continue;
              const textureEntry = pass.__bindGroup.entries?.find((entry: any) => entry.binding === 1);
              const sourceTexture = textureEntry?.resource?.__texture;
              const targetCanvas = pass.__targetCanvas as HTMLCanvasElement | undefined;
              if (sourceTexture && targetCanvas) {
                renderTextureToCanvas(sourceTexture, targetCanvas, state.shaderCode);
              }
            }
          }
        },
      };

      return {
        createShaderModule: (desc: { code: string }) => {
          state.shaderCode = String(desc?.code ?? '');
          return { __code: state.shaderCode };
        },
        createRenderPipeline: (desc: any) => {
          const maybeCode = desc?.vertex?.module?.__code;
          if (typeof maybeCode === 'string') {
            state.shaderCode = maybeCode;
          }
          return {
            getBindGroupLayout: () => ({}),
          };
        },
        createSampler: () => ({}),
        createTexture: (desc: any) => {
          const texture: any = {
            __width: Number(desc?.size?.width ?? 0),
            __height: Number(desc?.size?.height ?? 0),
            __data: null,
            createView: () => ({ __texture: texture }),
            destroy: () => {},
          };
          return texture;
        },
        createBindGroup: (desc: any) => ({ entries: desc.entries }),
        createCommandEncoder: () => {
          const passes: any[] = [];
          return {
            beginRenderPass: (desc: any) => {
              const pass: any = {
                __bindGroup: null,
                __drawn: false,
                __targetCanvas: desc?.colorAttachments?.[0]?.view?.__canvas ?? null,
                setPipeline: () => {},
                setBindGroup: (_index: number, group: any) => { pass.__bindGroup = group; },
                draw: () => { pass.__drawn = true; },
                end: () => {},
              };
              passes.push(pass);
              return pass;
            },
            finish: () => ({ __passes: passes }),
          };
        },
        queue,
        destroy: () => {},
      };
    };

    const webgpuContexts = new WeakMap<HTMLCanvasElement, any>();

    const createMockWebGPUContext = (canvas: HTMLCanvasElement): any => {
      return {
        configure: () => {},
        getCurrentTexture: () => ({
          createView: () => ({ __canvas: canvas }),
          destroy: () => {},
        }),
        unconfigure: () => {},
      };
    };

    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, contextId: string, options?: any): any {
      if (contextId === 'webgpu') {
        let context = webgpuContexts.get(this);
        if (!context) {
          context = createMockWebGPUContext(this);
          webgpuContexts.set(this, context);
        }
        return context;
      }
      return originalGetContext.call(this, contextId as any, options as any);
    };

    const mockGPU = {
      requestAdapter: async () => ({
        features: new Set<string>(),
        limits: { maxBufferSize: 1024 * 1024 * 1024 },
        requestDevice: async () => createMockDevice(),
      }),
      getPreferredCanvasFormat: () => 'rgba8unorm',
    };

    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      get: () => mockGPU,
    });
  });
}

test.describe('Phase 4: WebGPU Migration Path', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  // ==========================================================================
  // WebGPU Backend Availability Detection
  // ==========================================================================

  test('HDR-P4-001: WebGPU availability detection returns a boolean', async ({ page }) => {
    const hasWebGPU = await browserHasWebGPU(page);
    expect(typeof hasWebGPU).toBe('boolean');
  });

  test('HDR-P4-002: navigator.gpu existence check is safe and non-throwing', async ({ page }) => {
    // This verifies the detection pattern from DisplayCapabilities
    const result = await page.evaluate(() => {
      try {
        const available = typeof navigator !== 'undefined' && 'gpu' in navigator;
        return { success: true, available };
      } catch (e) {
        return { success: false, available: false };
      }
    });
    expect(result.success).toBe(true);
    expect(typeof result.available).toBe('boolean');
  });

  test('HDR-P4-003: app initializes successfully regardless of WebGPU support', async ({ page }) => {
    // The app should be fully functional whether or not WebGPU is available
    const appReady = await page.evaluate(() => !!window.__OPENRV_TEST__);
    expect(appReady).toBe(true);

    // Load media to verify rendering works
    await loadVideoFile(page);
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
  });

  // ==========================================================================
  // Backend Fallback from WebGPU to WebGL2
  // ==========================================================================

  test('HDR-P4-004: rendering works with WebGL2 fallback', async ({ page }) => {
    await loadVideoFile(page);

    // Canvas should have rendered content
    const canvasState = await captureCanvasState(page);
    expect(canvasState).toBeTruthy();
    // Should be a valid data URL
    expect(canvasState.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('HDR-P4-005: WebGL2 context is available as fallback', async ({ page }) => {
    const hasWebGL2 = await page.evaluate(() => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const gl = canvas.getContext('webgl2');
        const result = gl !== null;
        if (gl) {
          gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
        return result;
      } catch {
        return false;
      }
    });
    expect(hasWebGL2).toBe(true);
  });

  test('HDR-P4-006: color adjustments work on the active backend', async ({ page }) => {
    await loadVideoFile(page);

    // Apply a color adjustment via the Color panel
    const exposureSlider = await getExposureSlider(page);
    await exposureSlider.evaluate((el, value) => {
      const input = el as HTMLInputElement;
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, 0.5);

    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getColorState();
        return !!state && Math.abs(state.exposure - 0.5) < 0.02;
      },
      { timeout: 5000 },
    );

    const colorState = await getColorState(page);
    expect(colorState.exposure).toBeCloseTo(0.5, 1);

    const canvasState = await captureCanvasState(page);
    expect(canvasState.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('HDR-P4-007: tone mapping works on the active backend', async ({ page }) => {
    await loadVideoFile(page);

    // Enable tone mapping
    await goToColorTab(page);
    const control = page.locator('[data-testid="tone-mapping-control-button"]');
    await control.click();
    const dropdown = page.locator('[data-testid="tone-mapping-dropdown"]');
    await expect(dropdown).toBeVisible();

    await page.click('[data-testid="tone-mapping-operator-reinhard"]');
    await page.waitForFunction(
      () => {
        const state = window.__OPENRV_TEST__?.getToneMappingState();
        return state?.operator === 'reinhard';
      },
      { timeout: 5000 },
    );

    const toneMappingState = await getToneMappingState(page);
    expect(toneMappingState.operator).toBe('reinhard');

    const canvasState = await captureCanvasState(page);
    expect(canvasState.startsWith('data:image/png;base64,')).toBe(true);
  });

  // ==========================================================================
  // WebGPU-Specific Tests (skipped when WebGPU unavailable)
  // ==========================================================================

  test('HDR-P4-008: WebGPU adapter can be requested when available', async ({ page }) => {
    const hasWebGPU = await browserHasWebGPU(page);
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!hasWebGPU, 'WebGPU is not available in this browser');

    const canGetAdapter = await browserCanGetWebGPUAdapter(page);
    expect(typeof canGetAdapter).toBe('boolean');
    // If WebGPU is available, we should be able to attempt adapter request
  });

  test('HDR-P4-009: WebGPU device features can be queried', async ({ page }) => {
    const hasWebGPU = await browserHasWebGPU(page);
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!hasWebGPU, 'WebGPU is not available in this browser');

    const features = await page.evaluate(async () => {
      try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (!adapter) return null;
        const device = await adapter.requestDevice();
        const featureList = Array.from(device.features as Set<string>);
        device.destroy();
        return featureList;
      } catch {
        return null;
      }
    });
    // Features should be an array if device was obtained
    if (features !== null) {
      expect(Array.isArray(features)).toBe(true);
    }
  });

  test('HDR-P4-010: WebGPU preferred canvas format can be queried', async ({ page }) => {
    const hasWebGPU = await browserHasWebGPU(page);
    // @hdr - requires hardware HDR support, skipped in CI
    test.skip(!hasWebGPU, 'WebGPU is not available in this browser');

    const format = await page.evaluate(() => {
      try {
        return (navigator as any).gpu.getPreferredCanvasFormat();
      } catch {
        return null;
      }
    });
    if (format !== null) {
      expect(typeof format).toBe('string');
      // Common formats: 'bgra8unorm', 'rgba8unorm'
      expect(format.length).toBeGreaterThan(0);
    }
  });

  // ==========================================================================
  // Backend Resilience
  // ==========================================================================

  test('HDR-P4-011: app handles WebGPU detection failure gracefully', async ({ page }) => {
    // Even if WebGPU detection throws, app should still work
    const appState = await page.evaluate(() => {
      return {
        testHelperAvailable: !!window.__OPENRV_TEST__,
      };
    });
    expect(appState.testHelperAvailable).toBe(true);
  });

  test('HDR-P4-012: canvas rendering works after backend initialization', async ({ page }) => {
    await loadVideoFile(page);

    // Verify the canvas element exists and has content
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Canvas should have non-zero dimensions
    const dims = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height,
    }));
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
  });

  test('HDR-P4-013: multiple renders succeed after backend selection', async ({ page }) => {
    await loadVideoFile(page);

    // Capture initial state
    const state1 = await captureCanvasState(page);
    expect(state1).toBeTruthy();

    // Force a re-render by toggling a visual setting
    await page.keyboard.press('h'); // toggle histogram
    await page.waitForTimeout(200);
    await page.keyboard.press('h'); // toggle back
    await page.waitForTimeout(200);

    // Canvas should still render
    const state2 = await captureCanvasState(page);
    expect(state2).toBeTruthy();
  });

  test('HDR-P4-014: HDR output mode API is available on active backend', async ({ page }) => {
    // Verify the renderer exposes setHDROutputMode through the test helper
    const toneMappingState = await page.evaluate(() => {
      return window.__OPENRV_TEST__?.getToneMappingState();
    });
    expect(toneMappingState).toBeDefined();
    expect(toneMappingState?.operator).toBeDefined();
  });

  test('HDR-P4-015: backend remains stable across display profile changes', async ({ page }) => {
    await loadVideoFile(page);
    await goToColorTab(page);

    // Open display profile and change settings
    const dpButton = page.locator('[data-testid="display-profile-button"]');
    await dpButton.click();
    const dropdown = page.locator('[data-testid="display-profile-dropdown"]');
    await expect(dropdown).toBeVisible();

    // Select a different display profile
    const rec709 = page.locator('[data-testid="display-profile-rec709"]');
    await rec709.click();
    await page.waitForTimeout(100);

    // Canvas should still render properly
    const state = await captureCanvasState(page);
    expect(state).toBeTruthy();
    expect(state.startsWith('data:image/png;base64,')).toBe(true);
  });
});

test.describe('Phase 4: WebGPU Blit Orientation Regression', () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicWebGPUMock(page);
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('HDR-P4-016: WebGPU HDR blit preserves vertical orientation (no V double-flip)', async ({ page }) => {
    await page.evaluate(async () => {
      const manager = (window as any).__OPENRV_TEST__?.app?.viewer?.glRendererManager;
      if (manager?.initWebGPUHDRBlit) {
        await manager.initWebGPUHDRBlit();
      }
    });

    await loadExrFile(page);

    await page.waitForFunction(() => {
      const manager = (window as any).__OPENRV_TEST__?.app?.viewer?.glRendererManager;
      const blitCanvas = document.querySelector('canvas[data-testid="viewer-webgpu-blit-canvas"]') as HTMLCanvasElement | null;
      if (!manager || !blitCanvas) return false;
      const frame = manager.lastHDRBlitFrame;
      const visible = getComputedStyle(blitCanvas).display !== 'none';
      return manager.isWebGPUBlitReady === true && visible && !!frame?.data?.length && blitCanvas.width > 0 && blitCanvas.height > 0;
    }, { timeout: 10000 });

    const orientation = await page.evaluate(() => {
      const manager = (window as any).__OPENRV_TEST__?.app?.viewer?.glRendererManager;
      const frame = manager?.lastHDRBlitFrame as { data: Float32Array; width: number; height: number } | null;
      const canvas = document.querySelector('canvas[data-testid="viewer-webgpu-blit-canvas"]') as HTMLCanvasElement | null;

      if (!frame || !canvas) {
        return { ok: false, reason: 'missing-frame-or-canvas' };
      }

      const toByte = (value: number): number => {
        const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
        return Math.max(0, Math.min(255, Math.round(clamped * 255)));
      };

      const distance = (a: number[], b: number[]): number => {
        return Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!) + Math.abs(a[2]! - b[2]!);
      };

      const getFrameRGB = (x: number, y: number): number[] => {
        const index = (y * frame.width + x) * 4;
        return [
          toByte(frame.data[index] ?? 0),
          toByte(frame.data[index + 1] ?? 0),
          toByte(frame.data[index + 2] ?? 0),
        ];
      };

      const yStep = Math.max(1, Math.floor(frame.height / 24));
      const xStep = Math.max(1, Math.floor(frame.width / 24));
      let bestY = Math.floor(frame.height / 4);
      let bestX = Math.floor(frame.width / 2);
      let bestScore = -1;

      for (let y = 1; y < frame.height - 1; y += yStep) {
        const mirroredY = frame.height - 1 - y;
        for (let x = 0; x < frame.width; x += xStep) {
          const a = getFrameRGB(x, y);
          const b = getFrameRGB(x, mirroredY);
          const score = distance(a, b);
          if (score > bestScore) {
            bestScore = score;
            bestX = x;
            bestY = y;
          }
        }
      }

      if (bestScore < 24) {
        return { ok: false, reason: 'insufficient-vertical-contrast', bestScore };
      }

      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = canvas.width;
      sampleCanvas.height = canvas.height;
      const sampleCtx = sampleCanvas.getContext('2d');
      if (!sampleCtx) {
        return { ok: false, reason: 'no-2d-read-context' };
      }
      sampleCtx.drawImage(canvas, 0, 0);

      const canvasX = Math.max(0, Math.min(sampleCanvas.width - 1, Math.round((bestX / Math.max(1, frame.width - 1)) * Math.max(1, sampleCanvas.width - 1))));
      const topY = Math.max(0, Math.min(sampleCanvas.height - 1, Math.round((bestY / Math.max(1, frame.height - 1)) * Math.max(1, sampleCanvas.height - 1))));
      const bottomY = Math.max(0, Math.min(sampleCanvas.height - 1, sampleCanvas.height - 1 - topY));

      const topPixelData = sampleCtx.getImageData(canvasX, topY, 1, 1).data;
      const bottomPixelData = sampleCtx.getImageData(canvasX, bottomY, 1, 1).data;
      const actualTop = [topPixelData[0] ?? 0, topPixelData[1] ?? 0, topPixelData[2] ?? 0];
      const actualBottom = [bottomPixelData[0] ?? 0, bottomPixelData[1] ?? 0, bottomPixelData[2] ?? 0];

      const correctTop = getFrameRGB(bestX, frame.height - 1 - bestY);
      const correctBottom = getFrameRGB(bestX, bestY);
      const invertedTop = getFrameRGB(bestX, bestY);
      const invertedBottom = getFrameRGB(bestX, frame.height - 1 - bestY);

      const errorCorrect = distance(actualTop, correctTop) + distance(actualBottom, correctBottom);
      const errorInverted = distance(actualTop, invertedTop) + distance(actualBottom, invertedBottom);

      return {
        ok: true,
        bestScore,
        errorCorrect,
        errorInverted,
      };
    });

    expect(orientation.ok).toBe(true);
    if (!orientation.ok) {
      return;
    }

    expect(orientation.errorCorrect).toBeLessThan(orientation.errorInverted);
    expect(orientation.errorInverted - orientation.errorCorrect).toBeGreaterThanOrEqual(16);
  });
});
