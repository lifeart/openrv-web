import { expect, type Page } from '@playwright/test';
import path from 'path';
import { SAMPLE_EXR } from './fixtures';

/** Shared helpers for the HDR output specs (hdr-output*.spec.ts). */

// Output encodings (src/config/RenderConfig.ts OUTPUT_ENCODING_*).
export const ENC_DISPLAY = 0;
export const ENC_LINEAR = 1;
export const ENC_EXTENDED_SRGB = 2;
export const ENC_PQ = 3;
export const ENC_HLG = 4;

export type HDRState = NonNullable<Window['__OPENRV_TEST__']> extends { getHDROutputState: () => infer S } ? S : never;

export async function getHDRState(page: Page): Promise<HDRState> {
  return page.evaluate(() => {
    const helper = window.__OPENRV_TEST__;
    if (!helper) throw new Error('test helper missing');
    return helper.getHDROutputState();
  });
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** Errors that matter for the render path (ignore unrelated network noise). */
export function renderErrors(errors: string[]): string[] {
  return errors.filter((e) => !/Failed to load resource|favicon/i.test(e));
}

export async function openToneMapping(page: Page): Promise<void> {
  await page.click('button[data-tab-id="color"]');
  const dropdown = page.locator('[data-testid="tone-mapping-dropdown"]');
  if (!(await dropdown.isVisible())) await page.locator('[data-testid="tone-mapping-control-button"]').click();
  await expect(dropdown).toBeVisible();
}

export async function selectHDRMode(page: Page, mode: 'sdr' | 'hlg' | 'pq' | 'extended'): Promise<void> {
  await openToneMapping(page);
  await page.locator(`[data-testid="hdr-mode-${mode}"]`).click();
  await expect.poll(async () => (await getHDRState(page)).hdrOutputMode).toBe(mode);
}

/** Wait until the main-thread renderer has rendered with the expected encoding. */
export async function expectEncoding(page: Page, encoding: number): Promise<void> {
  await expect.poll(async () => (await getHDRState(page)).lastOutputEncoding, { timeout: 10_000 }).toBe(encoding);
}

/**
 * Load the sample EXR without touching the GL canvas (the worker renderer
 * transfers it to an OffscreenCanvas, so fixtures that sample it would throw).
 */
export async function loadExr(page: Page): Promise<void> {
  await page.locator('input[type="file"]').first().setInputFiles(path.resolve(process.cwd(), SAMPLE_EXR));
  await page.waitForFunction(() => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true, undefined, {
    timeout: 20_000,
  });
}
