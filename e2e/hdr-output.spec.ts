import { test, expect } from '@playwright/test';
import { waitForTestHelper } from './fixtures';
import { ENC_DISPLAY, collectErrors, loadExr, expectEncoding, getHDRState, renderErrors } from './hdrOutputHelpers';

/**
 * HDR sources on an SDR display (app review H2; PR #41 checklist).
 *
 * The HDR-display side of the checklist lives in hdr-output-hdr-display.spec.ts.
 * Whether the picture looks right still needs a person looking at a display.
 */

test.describe('HDR output on an SDR display', () => {
  test('HDROUT-001: an HDR EXR on an SDR display is not given a second gamma', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForTestHelper(page);
    await loadExr(page);

    const color = await page.evaluate(() => window.__OPENRV_TEST__?.getColorState());
    expect(color?.gamma).toBe(1);

    const state = await getHDRState(page);
    expect(state.displayHDR).toBe(false);
    expect(state.hdrOutputMode).toBe('sdr');
    expect(state.headroom).toBe(1);
    await expectEncoding(page, ENC_DISPLAY);
    expect(renderErrors(errors)).toEqual([]);
  });

  test('HDROUT-002: the worker renderer shows an HDR EXR on an SDR display', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?renderer=worker');
    await waitForTestHelper(page);
    await loadExr(page);
    await page.waitForTimeout(500);

    const state = await getHDRState(page);
    expect(state.isWorker).toBe(true);
    expect(state.hdrOutputMode).toBe('sdr');
    const color = await page.evaluate(() => window.__OPENRV_TEST__?.getColorState());
    expect(color?.gamma).toBe(1);
    expect(renderErrors(errors)).toEqual([]);
  });
});
