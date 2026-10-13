import { test as base, expect, type Page } from '@playwright/test';
import { waitForTestHelper } from './fixtures';
import {
  ENC_DISPLAY,
  ENC_EXTENDED_SRGB,
  ENC_HLG,
  ENC_LINEAR,
  ENC_PQ,
  collectErrors,
  loadExr,
  expectEncoding,
  getHDRState,
  openToneMapping,
  renderErrors,
  selectHDRMode,
} from './hdrOutputHelpers';

/**
 * HDR output on an HDR display (PR #41 checklist).
 *
 * `--force-color-profile=scrgb-linear` makes headless Chromium report an HDR
 * display and `--enable-experimental-web-platform-features` turns on its
 * rec2100 / float16 canvas support, so capability detection, headroom, mode switching and output
 * encoding run for real. Two more stand-ins:
 * - `(dynamic-range: high)` is replaced before the app loads to simulate
 *   moving the window between an SDR and an HDR display.
 * - WebGL is made to refuse rec2100 / float16 buffers to force the Canvas2D
 *   HDR blit.
 * Brightness and colour still need a real HDR display (PR #41 checklist).
 */

// Keep the project's launch options and add the forced HDR colour profile.
const test = base.extend({
  launchOptions: [
    async ({ launchOptions }, use) => {
      await use({
        ...launchOptions,
        args: [
          ...(launchOptions.args ?? []),
          '--force-color-profile=scrgb-linear',
          '--enable-experimental-web-platform-features',
        ],
      });
    },
    { scope: 'worker' },
  ],
});

test.describe('HDR output on an HDR display', () => {
  test('HDROUT-010: the HDR display is detected and headroom is above SDR', async ({ page }) => {
    await page.goto('/');
    await waitForTestHelper(page);
    await loadExr(page);

    const state = await getHDRState(page);
    expect(state.displayHDR).toBe(true);
    expect(state.hdrOutputMode).not.toBe('sdr');
    // Either the system-reported headroom or the 1000 / 203 fallback, never 1.0.
    expect(state.headroom).toBeGreaterThan(1);

    await openToneMapping(page);
    await expect(page.locator('[data-testid="hdr-output-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="hdr-peak-nits-input"]')).toBeVisible();
  });

  test('HDROUT-011: the peak-nits setting drives the headroom', async ({ page }) => {
    await page.goto('/');
    await waitForTestHelper(page);
    await loadExr(page);
    const auto = (await getHDRState(page)).headroom;

    await openToneMapping(page);
    const input = page.locator('[data-testid="hdr-peak-nits-input"]');
    await input.fill('600');
    await input.press('Enter');
    await input.blur();
    await expect.poll(async () => (await getHDRState(page)).headroom).toBeCloseTo(600 / 203, 3);

    await input.fill('');
    await input.press('Enter');
    await input.blur();
    await expect.poll(async () => (await getHDRState(page)).headroom).toBeCloseTo(auto, 3);
  });

  test('HDROUT-012: each HDR mode renders with its own output encoding', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForTestHelper(page);
    await loadExr(page);

    const expected: Array<['sdr' | 'hlg' | 'pq' | 'extended', number, string]> = [
      ['extended', ENC_EXTENDED_SRGB, 'non-rec2020'],
      ['hlg', ENC_HLG, 'rec2020'],
      ['pq', ENC_PQ, 'rec2020'],
      ['sdr', ENC_DISPLAY, 'non-rec2020'],
    ];
    for (const [mode, encoding, space] of expected) {
      await selectHDRMode(page, mode);
      await expectEncoding(page, encoding);
      const state = await getHDRState(page);
      if (space === 'rec2020') expect(state.outputColorSpace).toBe('rec2020');
      else expect(state.outputColorSpace).not.toBe('rec2020');
    }
    expect(renderErrors(errors)).toEqual([]);
  });

  test('HDROUT-013: the worker renderer follows HDR mode changes', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?renderer=worker');
    await waitForTestHelper(page);
    await loadExr(page);

    for (const mode of ['hlg', 'pq', 'extended', 'sdr'] as const) {
      await selectHDRMode(page, mode);
      await page.waitForTimeout(300);
    }
    const state = await getHDRState(page);
    expect(state.isWorker).toBe(true);
    expect(state.headroom).toBeGreaterThan(1);
    expect(renderErrors(errors)).toEqual([]);
  });
});

test.describe('Canvas2D HDR blit fallback', () => {
  test('HDROUT-030: without WebGL HDR buffers the Canvas2D blit shows the frame', async ({ page }) => {
    const errors = collectErrors(page);
    // Make WebGL refuse rec2100 and float16 drawing buffers, as on browsers
    // that only support HDR through a float16 2D canvas.
    await page.addInitScript(() => {
      const proto = WebGL2RenderingContext.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'drawingBufferColorSpace');
      if (desc?.set && desc.get) {
        const { get, set } = desc;
        Object.defineProperty(proto, 'drawingBufferColorSpace', {
          configurable: true,
          get() {
            return get.call(this);
          },
          set(v: PredefinedColorSpace) {
            if (String(v).startsWith('rec2100')) return;
            set.call(this, v);
          },
        });
      }
      Object.defineProperty(proto, 'drawingBufferStorage', { configurable: true, value: undefined });
    });
    await page.goto('/');
    await waitForTestHelper(page);
    await loadExr(page);

    await expect.poll(async () => (await getHDRState(page)).canvas2dBlitReady, { timeout: 10_000 }).toBe(true);
    // The blit reads back either linear (srgb-linear canvas) or HLG (rec2100-hlg canvas).
    await expect
      .poll(async () => (await getHDRState(page)).lastOutputEncoding, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(ENC_LINEAR);
    const encoding = (await getHDRState(page)).lastOutputEncoding;
    expect([ENC_LINEAR, ENC_HLG]).toContain(encoding);
    expect(renderErrors(errors)).toEqual([]);
  });
});

/**
 * Replace `(dynamic-range: high)` with a switchable query so a test can move
 * the window between an SDR and an HDR display. The real display stays SDR.
 */
async function installSwitchableDisplay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    let hdr = true;
    const query = '(dynamic-range: high)';
    const realMatchMedia = window.matchMedia.bind(window);
    const fake = {
      get matches() {
        return hdr;
      },
      media: query,
      onchange: null,
      addEventListener: (_t: string, l: (e: MediaQueryListEvent) => void) => listeners.add(l),
      removeEventListener: (_t: string, l: (e: MediaQueryListEvent) => void) => listeners.delete(l),
      addListener: (l: (e: MediaQueryListEvent) => void) => listeners.add(l),
      removeListener: (l: (e: MediaQueryListEvent) => void) => listeners.delete(l),
      dispatchEvent: () => true,
    };
    window.matchMedia = (q: string) =>
      q.replace(/\s+/g, ' ').trim() === query ? (fake as unknown as MediaQueryList) : realMatchMedia(q);
    (window as unknown as { __setDisplayHDR: (v: boolean) => void }).__setDisplayHDR = (v: boolean) => {
      hdr = v;
      const event = { matches: v, media: query } as MediaQueryListEvent;
      for (const l of listeners) l(event);
    };
  });
}

async function setDisplayHDR(page: Page, hdr: boolean): Promise<void> {
  await page.evaluate((v) => (window as unknown as { __setDisplayHDR: (v: boolean) => void }).__setDisplayHDR(v), hdr);
}

test.describe('Moving between SDR and HDR displays (emulated)', () => {
  test('HDROUT-020: output follows the window onto an SDR display and back', async ({ page }) => {
    const errors = collectErrors(page);
    await installSwitchableDisplay(page);
    await page.goto('/');
    await waitForTestHelper(page);
    await loadExr(page);

    // Starts on the (forced) HDR display. Test mode always opens an HDR
    // drawing buffer, so the SDR start case is checked by moving the window.
    let state = await getHDRState(page);
    expect(state.displayHDR).toBe(true);
    expect(state.hdrOutputMode).not.toBe('sdr');
    const hdrHeadroom = state.headroom;
    expect(hdrHeadroom).toBeGreaterThan(1);

    await setDisplayHDR(page, false);
    await expect.poll(async () => (await getHDRState(page)).hdrOutputMode).toBe('sdr');
    state = await getHDRState(page);
    expect(state.displayHDR).toBe(false);
    expect(state.headroom).toBe(1);
    await expectEncoding(page, ENC_DISPLAY);

    await setDisplayHDR(page, true);
    await expect.poll(async () => (await getHDRState(page)).hdrOutputMode).not.toBe('sdr');
    await expect.poll(async () => (await getHDRState(page)).headroom).toBeCloseTo(hdrHeadroom, 3);
    await expect.poll(async () => (await getHDRState(page)).lastOutputEncoding).not.toBe(ENC_DISPLAY);
    await openToneMapping(page);
    await expect(page.locator('[data-testid="hdr-output-section"]')).toBeVisible();
    expect(renderErrors(errors)).toEqual([]);
  });
});
