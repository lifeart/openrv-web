import { test, expect } from '@playwright/test';
import {
  waitForTestHelper,
  loadSequenceFiles,
  getViewerState,
  getSessionState,
  waitForPlaybackState,
  waitForWipeMode,
} from './fixtures';

/**
 * Letter shortcuts follow the keyboard layout (review U17). Playwright
 * cannot switch the OS layout, so these tests dispatch the events a
 * QWERTZ / AZERTY keyboard produces: the physical `code` of the QWERTY
 * position plus the `key` the layout types.
 */

async function tapKey(
  page: import('@playwright/test').Page,
  code: string,
  key: string,
  modifiers: { shiftKey?: boolean } = {},
): Promise<void> {
  await page.evaluate(
    ({ c, k, m }) => {
      const target = document.activeElement ?? document.body;
      const init = { code: c, key: k, ...m, bubbles: true, cancelable: true, composed: true };
      target.dispatchEvent(new KeyboardEvent('keydown', init));
      target.dispatchEvent(new KeyboardEvent('keyup', init));
    },
    { c: code, k: key, m: modifiers },
  );
}

test.describe('Shortcuts on non-QWERTY layouts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadSequenceFiles(page);
  });

  test('LAYOUT-001: QWERTZ Y (physical Z key) toggles the vectorscope', async ({ page }) => {
    expect((await getViewerState(page)).vectorscopeVisible).toBe(false);
    await tapKey(page, 'KeyZ', 'y');
    await expect.poll(async () => (await getViewerState(page)).vectorscopeVisible).toBe(true);
  });

  test('LAYOUT-002: AZERTY Shift+W (physical Z key) cycles the wipe mode', async ({ page }) => {
    expect((await getViewerState(page)).wipeMode).toBe('off');
    await tapKey(page, 'KeyZ', 'W', { shiftKey: true });
    await waitForWipeMode(page, 'horizontal');
  });

  test('LAYOUT-003: L and K shuttle and stop through the layout path', async ({ page }) => {
    await tapKey(page, 'KeyL', 'l');
    await waitForPlaybackState(page, true);
    await tapKey(page, 'KeyK', 'k');
    await waitForPlaybackState(page, false);
    expect((await getSessionState(page)).isPlaying).toBe(false);
  });
});
