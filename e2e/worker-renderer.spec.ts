import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { getViewerState, waitForTestHelper } from './fixtures';

/**
 * Worker Renderer Tests
 *
 * Production builds render through the OffscreenCanvas worker
 * (RenderWorkerProxy), but E2E test mode normally forces the main-thread
 * Renderer so tests can sample pixels. `?renderer=worker` opts back into the
 * worker so this suite exercises the production render path.
 *
 * Regression: loading HDR content threw "isOCIOWasmActive is not a function"
 * and opening scopes threw on renderForScopes, because the proxy lacked
 * Renderer-only methods (app review H1).
 */

const SAMPLE_EXR = 'sample/test_hdr.exr';

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /is not a function/.test(msg.text())) errors.push(msg.text());
  });
  return errors;
}

async function openScope(page: Page, scope: 'histogram' | 'waveform' | 'vectorscope'): Promise<void> {
  await page.click('button[data-tab-id="qc"]');
  const scopesButton = page.locator('[data-testid="scopes-control-button"]');
  const dropdown = page.locator('[data-testid="scopes-dropdown"]');
  if (!(await dropdown.isVisible())) await scopesButton.click();
  await dropdown.locator(`button[data-scope-type="${scope}"]`).click();
  if (await dropdown.isVisible()) await scopesButton.click();
}

test.describe('Worker renderer (production render path)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?renderer=worker');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test('WRK-001: renders an HDR EXR through the worker without errors', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.locator('input[type="file"]').first().setInputFiles(path.resolve(process.cwd(), SAMPLE_EXR));
    await page.waitForFunction(() => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true, undefined, {
      timeout: 20_000,
    });
    await page.waitForTimeout(1000);

    const state = await getViewerState(page);
    expect(state.glRendererIsWorker).toBe(true);
    expect(errors).toEqual([]);
  });

  test('WRK-002: scopes fill from the worker readback', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.locator('input[type="file"]').first().setInputFiles(path.resolve(process.cwd(), SAMPLE_EXR));
    await page.waitForFunction(() => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true, undefined, {
      timeout: 20_000,
    });

    await openScope(page, 'histogram');
    await openScope(page, 'waveform');

    await expect
      .poll(async () => (await getViewerState(page)).histogramPixelCount, { timeout: 10_000 })
      .toBeGreaterThan(0);
    const state = await getViewerState(page);
    expect(state.glRendererIsWorker).toBe(true);
    expect(state.waveformVisible).toBe(true);
    expect(errors).toEqual([]);
  });
});
