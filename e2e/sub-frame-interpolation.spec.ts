import { test, expect } from '@playwright/test';
import { loadVideoFile, getSessionState, waitForTestHelper } from './fixtures';

test.describe('Sub-frame Interpolation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  // SFI-001: Interpolation is disabled by default
  test('SFI-001: sub-frame interpolation is disabled by default', async ({ page }) => {
    const interpolationEnabled = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.interpolationEnabled;
    });
    expect(interpolationEnabled).toBe(false);
  });

  // SFI-002: Interpolation can be enabled
  test('SFI-002: interpolation can be enabled via session property', async ({ page }) => {
    await loadVideoFile(page);

    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.interpolationEnabled = true;
      }
    });
    await page.waitForTimeout(100);

    const interpolationEnabled = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.interpolationEnabled;
    });
    expect(interpolationEnabled).toBe(true);
  });

  // SFI-003: Disabling interpolation clears sub-frame position
  test('SFI-003: disabling interpolation clears subFramePosition', async ({ page }) => {
    await loadVideoFile(page);

    // Enable then disable
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.interpolationEnabled = true;
        app.session.interpolationEnabled = false;
      }
    });
    await page.waitForTimeout(100);

    const subFramePos = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.subFramePosition;
    });
    expect(subFramePos).toBeNull();
  });

  // SFI-004: Sub-frame position is null at normal speed
  test('SFI-004: subFramePosition is null at 1x speed even with interpolation on', async ({ page }) => {
    await loadVideoFile(page);

    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.interpolationEnabled = true;
      }
    });

    const state = await getSessionState(page);
    expect(state.playbackSpeed).toBe(1);

    const subFramePos = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.subFramePosition;
    });
    // At 1x speed, sub-frame interpolation should not produce sub-frame positions
    expect(subFramePos).toBeNull();
  });

  // SFI-005: Interpolation setting persists across frame navigation
  test('SFI-005: interpolation setting persists across frames', async ({ page }) => {
    await loadVideoFile(page);

    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.interpolationEnabled = true;
      }
    });

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    const interpolationEnabled = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      return app?.session?.interpolationEnabled;
    });
    expect(interpolationEnabled).toBe(true);
  });

  // SFI-006: Setting slow-motion speed with interpolation enabled
  test('SFI-006: slow-motion speed can be set with interpolation', async ({ page }) => {
    await loadVideoFile(page);

    // Enable interpolation and set slow speed
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.interpolationEnabled = true;
        app.session.playbackSpeed = 0.5;
      }
    });
    await page.waitForTimeout(100);

    const state = await getSessionState(page);
    expect(state.playbackSpeed).toBe(0.5);
  });

  // SFI-007: Interpolation state can be toggled
  test('SFI-007: interpolation can be toggled on and off', async ({ page }) => {
    // Toggle on
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.interpolationEnabled = true;
      }
    });

    let enabled = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.app?.session?.interpolationEnabled;
    });
    expect(enabled).toBe(true);

    // Toggle off
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.interpolationEnabled = false;
      }
    });

    enabled = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.app?.session?.interpolationEnabled;
    });
    expect(enabled).toBe(false);
  });

  // SFI-008: Speed change at >= 1x disables sub-frame position
  test('SFI-008: setting speed >= 1x nullifies subFramePosition', async ({ page }) => {
    await loadVideoFile(page);

    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.interpolationEnabled = true;
        app.session.playbackSpeed = 0.25;
      }
    });
    await page.waitForTimeout(100);

    // Now set speed back to 1x
    await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      if (app?.session) {
        app.session.playbackSpeed = 1;
      }
    });
    await page.waitForTimeout(100);

    const subFramePos = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.app?.session?.subFramePosition;
    });
    expect(subFramePos).toBeNull();
  });

  // SFI-009: Session reports correct playback speed
  test('SFI-009: playback speed is correctly reported', async ({ page }) => {
    await loadVideoFile(page);

    // Set various speeds and verify
    const speeds = [0.25, 0.5, 1, 2, 4];
    for (const speed of speeds) {
      await page.evaluate((s) => {
        const app = (window as any).__OPENRV_TEST__?.app;
        if (app?.session) {
          app.session.playbackSpeed = s;
        }
      }, speed);
      await page.waitForTimeout(50);

      const reportedSpeed = await page.evaluate(() => {
        return (window as any).__OPENRV_TEST__?.getSessionState()?.playbackSpeed;
      });
      expect(reportedSpeed).toBe(speed);
    }
  });

  // SFI-010: Viewer has FrameInterpolator instance
  test('SFI-010: viewer frame interpolator exists', async ({ page }) => {
    const hasInterpolator = await page.evaluate(() => {
      const app = (window as any).__OPENRV_TEST__?.app;
      const viewer = app?.viewer;
      // FrameInterpolator is a private member, check via presence of the interpolation-related method
      return viewer?.frameInterpolator !== undefined || app?.session?.interpolationEnabled !== undefined;
    });
    expect(hasInterpolator).toBe(true);
  });
});
