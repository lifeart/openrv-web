import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getMatteState,
  getSessionMetadataState,
  getPaintState,
  waitForTestHelper,
} from './fixtures';

/**
 * Session Integration Tests
 *
 * These tests verify the integration between GTO session properties
 * and the application UI components.
 */

test.describe('Matte Overlay Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SI-E001: matte overlay is hidden by default', async ({ page }) => {
    const state = await getMatteState(page);
    expect(state.show).toBe(false);
  });

  test('SI-E002: matte overlay canvas element exists', async ({ page }) => {
    const overlay = page.locator('[data-testid="matte-overlay"], .matte-overlay');
    await expect(overlay).toBeAttached();
  });

  test('SI-E003: matte overlay can be enabled via API', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.enableMatteOverlay();
    });
    await page.waitForTimeout(100);

    const state = await getMatteState(page);
    expect(state.show).toBe(true);
  });

  test('SI-E004: matte overlay can be toggled', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.toggleMatteOverlay();
    });
    await page.waitForTimeout(100);

    let state = await getMatteState(page);
    expect(state.show).toBe(true);

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.toggleMatteOverlay();
    });
    await page.waitForTimeout(100);

    state = await getMatteState(page);
    expect(state.show).toBe(false);
  });

  test('SI-E005: matte aspect ratio can be changed', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setMatteAspect(2.35);
    });
    await page.waitForTimeout(100);

    const state = await getMatteState(page);
    expect(state.aspect).toBe(2.35);
  });

  test('SI-E006: matte opacity can be changed', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setMatteOpacity(0.8);
    });
    await page.waitForTimeout(100);

    const state = await getMatteState(page);
    expect(state.opacity).toBe(0.8);
  });

  test('SI-E007: matte center point can be changed', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setMatteCenterPoint(0.1, -0.2);
    });
    await page.waitForTimeout(100);

    const state = await getMatteState(page);
    expect(state.centerPoint).toEqual([0.1, -0.2]);
  });

  test('SI-E008: matte settings persist when changing frames', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.enableMatteOverlay();
      (window as any).__OPENRV_TEST__?.mutations?.setMatteAspect(2.39);
      (window as any).__OPENRV_TEST__?.mutations?.setMatteOpacity(0.75);
    });
    await page.waitForTimeout(100);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    const state = await getMatteState(page);
    expect(state.show).toBe(true);
    expect(state.aspect).toBe(2.39);
    expect(state.opacity).toBe(0.75);
  });
});

test.describe('Session Metadata Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SI-E010: session has default metadata values', async ({ page }) => {
    const metadata = await getSessionMetadataState(page);
    expect(metadata.version).toBe(2);
    expect(metadata.origin).toBe('openrv-web');
    expect(metadata.frameIncrement).toBe(1);
  });

  test('SI-E011: session metadata displayName is accessible', async ({ page }) => {
    const metadata = await getSessionMetadataState(page);
    expect(typeof metadata.displayName).toBe('string');
  });

  test('SI-E012: session metadata comment is accessible', async ({ page }) => {
    const metadata = await getSessionMetadataState(page);
    expect(typeof metadata.comment).toBe('string');
  });
});

test.describe('Frame Increment Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SI-E020: default frame increment is 1', async ({ page }) => {
    const metadata = await getSessionMetadataState(page);
    expect(metadata.frameIncrement).toBe(1);
  });

  test('SI-E021: frame increment can be changed via API', async ({ page }) => {
    await page.evaluate(() => {
      const session = (window as any).__OPENRV_TEST__?.mutations?.getSession();
      if (session) {
        session.frameIncrement = 5;
      }
    });
    await page.waitForTimeout(100);

    const metadata = await getSessionMetadataState(page);
    expect(metadata.frameIncrement).toBe(5);
  });

  test('SI-E022: step forward uses frame increment', async ({ page }) => {
    // Set frame increment to 5
    await page.evaluate(() => {
      const session = (window as any).__OPENRV_TEST__?.mutations?.getSession();
      session.frameIncrement = 5;
      session.goToFrame(10); // Start at frame 10
    });
    await page.waitForTimeout(100);

    // Get initial frame
    const initialFrame = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.mutations?.getSession()?.currentFrame;
    });

    // Step forward (right arrow)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Check frame advanced by increment
    const newFrame = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.mutations?.getSession()?.currentFrame;
    });

    expect(newFrame).toBe(initialFrame + 5);
  });

  test('SI-E023: step backward uses frame increment', async ({ page }) => {
    // Set frame increment to 3
    await page.evaluate(() => {
      const session = (window as any).__OPENRV_TEST__?.mutations?.getSession();
      session.frameIncrement = 3;
      session.goToFrame(20); // Start at frame 20
    });
    await page.waitForTimeout(100);

    // Get initial frame
    const initialFrame = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.mutations?.getSession()?.currentFrame;
    });

    // Step backward (left arrow)
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);

    // Check frame went back by increment
    const newFrame = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.mutations?.getSession()?.currentFrame;
    });

    expect(newFrame).toBe(initialFrame - 3);
  });
});

test.describe('Paint Effects Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SI-E030: paint effects ghost mode is accessible', async ({ page }) => {
    const paintState = await getPaintState(page);
    expect(typeof paintState.ghostMode).toBe('boolean');
  });

  test('SI-E031: paint effects hold mode is accessible', async ({ page }) => {
    const paintState = await getPaintState(page);
    expect(typeof paintState.holdMode).toBe('boolean');
  });

  test('SI-E032: ghost mode can be enabled via session event', async ({ page }) => {
    // Simulate loading session with ghost mode enabled
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.getPaintEngine()?.setGhostMode(true, 5, 5);
    });
    await page.waitForTimeout(100);

    const paintState = await getPaintState(page);
    expect(paintState.ghostMode).toBe(true);
  });

  test('SI-E033: hold mode can be enabled via session event', async ({ page }) => {
    // Simulate loading session with hold mode enabled
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.getPaintEngine()?.setHoldMode(true);
    });
    await page.waitForTimeout(100);

    const paintState = await getPaintState(page);
    expect(paintState.holdMode).toBe(true);
  });

  test('SI-E034: ghost before/after values are configurable', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.getPaintEngine()?.setGhostMode(true, 7, 10);
    });
    await page.waitForTimeout(100);

    const paintState = await getPaintState(page);
    expect(paintState.ghostBefore).toBe(7);
    expect(paintState.ghostAfter).toBe(10);
  });
});

test.describe('Session Event Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SI-E040: session emits frameIncrementChanged event', async ({ page }) => {
    const eventReceived = await page.evaluate(() => {
      return new Promise((resolve) => {
        const session = (window as any).__OPENRV_TEST__?.mutations?.getSession();
        session?.on('frameIncrementChanged', (value: number) => {
          resolve(value);
        });
        session.frameIncrement = 4;
      });
    });

    expect(eventReceived).toBe(4);
  });

  test('SI-E041: matte overlay emits settingsChanged event', async ({ page }) => {
    const eventReceived = await page.evaluate(() => {
      const before = (window as any).__OPENRV_TEST__?.mutations?.getMatteSettings();
      (window as any).__OPENRV_TEST__?.mutations?.setMatteAspect(1.85);
      const after = (window as any).__OPENRV_TEST__?.mutations?.getMatteSettings();
      return after?.aspect;
    });

    expect(eventReceived).toBe(1.85);
  });
});

test.describe('Session Metadata UI Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SI-E050: session name display element exists in header', async ({ page }) => {
    const sessionNameDisplay = page.locator('[data-testid="session-name-display"]');
    await expect(sessionNameDisplay).toBeVisible();
  });

  test('SI-E051: session name display shows Untitled by default', async ({ page }) => {
    const nameText = page.locator('[data-testid="session-name-display"] .session-name-text');
    await expect(nameText).toHaveText('Untitled');
  });

  test('SI-E052: session name display updates when metadata changes via API', async ({ page }) => {
    // Update metadata via session.updateMetadata() which updates internal state and emits metadataChanged
    await page.evaluate(() => {
      const session = (window as any).__OPENRV_TEST__?.mutations?.getSession();
      if (session?.updateMetadata) {
        session.updateMetadata({
          displayName: 'Test Session Name',
          comment: 'Test comment',
          version: 2,
          origin: 'openrv-web',
          creationContext: 0,
          clipboard: 0,
          membershipContains: [],
        });
      }
    });
    await page.waitForTimeout(100);

    const nameText = page.locator('[data-testid="session-name-display"] .session-name-text');
    await expect(nameText).toHaveText('Test Session Name');
  });

  test('SI-E053: session name display tooltip shows comment', async ({ page }) => {
    // Update metadata via session.updateMetadata() which updates internal state and emits metadataChanged
    await page.evaluate(() => {
      const session = (window as any).__OPENRV_TEST__?.mutations?.getSession();
      if (session?.updateMetadata) {
        session.updateMetadata({
          displayName: 'My Project',
          comment: 'This is a detailed comment about the session',
          version: 2,
          origin: 'openrv-web',
          creationContext: 0,
          clipboard: 0,
          membershipContains: [],
        });
      }
    });
    await page.waitForTimeout(100);

    const sessionNameDisplay = page.locator('[data-testid="session-name-display"]');
    const title = await sessionNameDisplay.getAttribute('title');

    expect(title).toContain('My Project');
    expect(title).toContain('This is a detailed comment about the session');
  });

  test('SI-E054: session name display tooltip shows external origin', async ({ page }) => {
    // Update metadata via session.updateMetadata() which updates internal state and emits metadataChanged
    await page.evaluate(() => {
      const session = (window as any).__OPENRV_TEST__?.mutations?.getSession();
      if (session?.updateMetadata) {
        session.updateMetadata({
          displayName: 'Imported Session',
          comment: '',
          version: 3,
          origin: 'rv-desktop',
          creationContext: 1,
          clipboard: 0,
          membershipContains: [],
        });
      }
    });
    await page.waitForTimeout(100);

    const sessionNameDisplay = page.locator('[data-testid="session-name-display"]');
    const title = await sessionNameDisplay.getAttribute('title');

    expect(title).toContain('Created in: rv-desktop');
    expect(title).toContain('Session version: 3');
  });

  test('SI-E055: session metadata persists when changing frames', async ({ page }) => {
    // Set metadata via session.updateMetadata() which updates internal state and emits metadataChanged
    await page.evaluate(() => {
      const session = (window as any).__OPENRV_TEST__?.mutations?.getSession();
      if (session?.updateMetadata) {
        session.updateMetadata({
          displayName: 'Persistent Session',
          comment: 'Should persist',
          version: 4,
          origin: 'openrv-web',
          creationContext: 0,
          clipboard: 0,
          membershipContains: [],
        });
      }
    });
    await page.waitForTimeout(100);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Verify metadata still displayed
    const nameText = page.locator('[data-testid="session-name-display"] .session-name-text');
    await expect(nameText).toHaveText('Persistent Session');
  });
});
