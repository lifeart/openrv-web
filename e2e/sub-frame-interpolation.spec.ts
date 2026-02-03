import { test, expect } from '@playwright/test';
import { loadVideoFile, getSessionState, waitForTestHelper } from './fixtures';

/**
 * Sub-frame interpolation is a programmatic feature without a dedicated UI toggle.
 * These tests use the window.openrv public scripting API (which IS a real user-facing
 * interface for scripters) for playback speed control, and page.evaluate() only for
 * state verification. For enabling/disabling interpolation itself, since it is not
 * exposed via window.openrv, we access it through the session property -- this is
 * the closest to a real scripting workflow.
 */

/** Helper: enable interpolation via the public session property */
async function enableInterpolation(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    // Access via session -- this is the programmatic interface for enabling interpolation
    const session = (window as any).__OPENRV_TEST__?.app?.session;
    if (session) {
      session.interpolationEnabled = true;
    }
  });
  await page.waitForTimeout(100);
}

/** Helper: disable interpolation via the public session property */
async function disableInterpolation(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const session = (window as any).__OPENRV_TEST__?.app?.session;
    if (session) {
      session.interpolationEnabled = false;
    }
  });
  await page.waitForTimeout(100);
}

/** Helper: read interpolation enabled state (verification only) */
async function getInterpolationEnabled(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => {
    const session = (window as any).__OPENRV_TEST__?.app?.session;
    return session?.interpolationEnabled ?? false;
  });
}

/** Helper: read sub-frame position state (verification only) */
async function getSubFramePosition(page: import('@playwright/test').Page): Promise<unknown> {
  return page.evaluate(() => {
    const session = (window as any).__OPENRV_TEST__?.app?.session;
    return session?.subFramePosition ?? null;
  });
}

test.describe('Sub-frame Interpolation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  // SFI-001: Interpolation is disabled by default
  test('SFI-001: sub-frame interpolation is disabled by default', async ({ page }) => {
    const enabled = await getInterpolationEnabled(page);
    expect(enabled).toBe(false);
  });

  // SFI-002: Interpolation can be enabled
  test('SFI-002: interpolation can be enabled via session property', async ({ page }) => {
    await loadVideoFile(page);

    await enableInterpolation(page);

    const enabled = await getInterpolationEnabled(page);
    expect(enabled).toBe(true);
  });

  // SFI-003: Disabling interpolation clears sub-frame position
  test('SFI-003: disabling interpolation clears subFramePosition', async ({ page }) => {
    await loadVideoFile(page);

    // Enable then disable
    await enableInterpolation(page);
    await disableInterpolation(page);

    const subFramePos = await getSubFramePosition(page);
    expect(subFramePos).toBeNull();
  });

  // SFI-004: Sub-frame position is null at normal speed
  test('SFI-004: subFramePosition is null at 1x speed even with interpolation on', async ({ page }) => {
    await loadVideoFile(page);

    await enableInterpolation(page);

    // Verify speed is 1x using the public API for state verification
    const state = await getSessionState(page);
    expect(state.playbackSpeed).toBe(1);

    const subFramePos = await getSubFramePosition(page);
    // At 1x speed, sub-frame interpolation should not produce sub-frame positions
    expect(subFramePos).toBeNull();
  });

  // SFI-005: Interpolation setting persists across frame navigation
  test('SFI-005: interpolation setting persists across frames', async ({ page }) => {
    await loadVideoFile(page);

    await enableInterpolation(page);

    // Navigate frames using keyboard (real user interaction)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    const enabled = await getInterpolationEnabled(page);
    expect(enabled).toBe(true);
  });

  // SFI-006: Setting slow-motion speed with interpolation enabled
  test('SFI-006: slow-motion speed can be set with interpolation', async ({ page }) => {
    await loadVideoFile(page);

    // Enable interpolation and set slow speed using the public scripting API
    await enableInterpolation(page);
    await page.evaluate(() => {
      (window as any).openrv.playback.setSpeed(0.5);
    });
    await page.waitForTimeout(100);

    const state = await getSessionState(page);
    expect(state.playbackSpeed).toBe(0.5);
  });

  // SFI-007: Interpolation state can be toggled
  test('SFI-007: interpolation can be toggled on and off', async ({ page }) => {
    // Toggle on
    await enableInterpolation(page);
    let enabled = await getInterpolationEnabled(page);
    expect(enabled).toBe(true);

    // Toggle off
    await disableInterpolation(page);
    enabled = await getInterpolationEnabled(page);
    expect(enabled).toBe(false);
  });

  // SFI-008: Speed change at >= 1x disables sub-frame position
  test('SFI-008: setting speed >= 1x nullifies subFramePosition', async ({ page }) => {
    await loadVideoFile(page);

    // Enable interpolation and set slow speed
    await enableInterpolation(page);
    await page.evaluate(() => {
      (window as any).openrv.playback.setSpeed(0.25);
    });
    await page.waitForTimeout(100);

    // Now set speed back to 1x using the public scripting API
    await page.evaluate(() => {
      (window as any).openrv.playback.setSpeed(1);
    });
    await page.waitForTimeout(100);

    const subFramePos = await getSubFramePosition(page);
    expect(subFramePos).toBeNull();
  });

  // SFI-009: Session reports correct playback speed via public API
  test('SFI-009: playback speed is correctly reported', async ({ page }) => {
    await loadVideoFile(page);

    // Set various speeds using the public scripting API and verify
    const speeds = [0.25, 0.5, 1, 2, 4];
    for (const speed of speeds) {
      await page.evaluate((s) => {
        (window as any).openrv.playback.setSpeed(s);
      }, speed);
      await page.waitForTimeout(50);

      const state = await getSessionState(page);
      expect(state.playbackSpeed).toBe(speed);
    }
  });

  // SFI-010: Viewer has interpolation capability
  test('SFI-010: interpolation capability is available', async ({ page }) => {
    // Verify the session supports interpolation by checking the property exists
    const hasInterpolation = await page.evaluate(() => {
      const session = (window as any).__OPENRV_TEST__?.app?.session;
      return typeof session?.interpolationEnabled === 'boolean';
    });
    expect(hasInterpolation).toBe(true);
  });
});
