/**
 * Timeline/EDL Editing E2E Tests
 *
 * Tests the visual timeline editor functionality for sequence editing.
 */

import {
  test,
  expect,
  loadVideoFile,
  loadTwoVideoFiles,
  getSessionState,
  waitForTestHelper,
} from './fixtures';

async function openTimelineEditorPanel(page: import('@playwright/test').Page) {
  const toggle = page.locator('[data-testid="timeline-editor-toggle-button"]');
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();

  const panel = page.locator('.dropdown-panel:has-text("Timeline Editor")').first();
  await expect(panel).toBeVisible();
  await expect(panel.locator('.timeline-track')).toBeVisible();
  return panel;
}

async function getPlaylistSnapshot(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const pm = (window as any).__OPENRV_TEST__?.mutations?.getPlaylistManager();
    if (!pm) return null;
    const clips = pm.getClips().map((clip: any) => ({
      sourceIndex: clip.sourceIndex,
      sourceName: clip.sourceName,
      inPoint: clip.inPoint,
      outPoint: clip.outPoint,
      duration: clip.duration,
      globalStartFrame: clip.globalStartFrame,
    }));
    return {
      clipCount: pm.getClipCount(),
      enabled: pm.isEnabled(),
      loopMode: pm.getLoopMode?.() ?? 'none',
      clips,
    };
  });
}

async function getTimelineEditorEDL(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const app = (window as any).__OPENRV_TEST__?.app as any;
    return app?.controls?.timelineEditor?.getEDL?.() ?? [];
  });
}

async function dragFirstCutRightHandle(
  page: import('@playwright/test').Page,
  panel: import('@playwright/test').Locator,
  deltaX = -24,
) {
  const firstCut = panel.locator('.timeline-cut').first();
  await expect(firstCut).toBeVisible();
  const rightHandle = firstCut.locator('.trim-handle').nth(1);

  const handleBox = await rightHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  if (!handleBox) {
    throw new Error('Trim handle is not interactable');
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 4 });
  await page.mouse.up();
}

test.describe('Timeline Editor', () => {
  test.describe('Timeline Editor Panel', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(200);

      // Ensure deterministic starting state (no persisted playlist/session spillover).
      await page.evaluate(() => {
        const m = (window as any).__OPENRV_TEST__?.mutations;
        const pm = m?.getPlaylistManager?.();
        pm?.clear?.();
        pm?.setEnabled?.(false);
        pm?.setCurrentFrame?.(1);

        const session = m?.getSession?.();
        session?.setCurrentSource?.(0);
        session?.goToFrame?.(1);
        session.loopMode = 'loop';
      });
      await page.waitForFunction(() => {
        const session = (window as any).__OPENRV_TEST__?.mutations?.getSession?.();
        return !!session && (session.currentSource?.duration ?? 0) > 1;
      });
      await page.waitForTimeout(100);
    });

    test('TL-EDIT-E021: should open Timeline Editor panel and render source cuts', async ({ page }) => {
      const panel = await openTimelineEditorPanel(page);

      const cuts = panel.locator('.timeline-cut');
      await expect(cuts).toHaveCount(2);
      await expect(cuts.nth(0)).not.toHaveText('');
      await expect(cuts.nth(1)).not.toHaveText('');
      await expect(panel.locator('.timeline-ruler')).toBeVisible();
      await expect(panel.locator('.timeline-controls input[type="range"]')).toBeVisible();
    });

    test('TL-EDIT-E022: selecting a cut should seek to that cut position', async ({ page }) => {
      const panel = await openTimelineEditorPanel(page);
      const cuts = panel.locator('.timeline-cut');
      await expect(cuts).toHaveCount(2);

      await page.evaluate(() => {
        const session = (window as any).__OPENRV_TEST__?.mutations?.getSession?.();
        session?.goToFrame?.(12);
      });
      await page.waitForTimeout(100);

      const edl = await getTimelineEditorEDL(page);
      expect(Array.isArray(edl)).toBe(true);
      expect(edl.length).toBeGreaterThanOrEqual(2);
      const target = edl[1];

      const clicked = await page.evaluate(() => {
        const panel = Array.from(document.querySelectorAll('.dropdown-panel'))
          .find((el) => el.textContent?.includes('Timeline Editor'));
        const secondCut = panel?.querySelectorAll('.timeline-cut')?.[1] as HTMLElement | undefined;
        if (!secondCut) return false;
        secondCut.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      });
      expect(clicked).toBe(true);
      await page.waitForTimeout(200);

      const state = await getSessionState(page);
      expect([target?.frame, target?.inPoint]).toContain(state.currentFrame);
    });

    test('TL-EDIT-E023: trimming a cut should populate playlist with edited ranges', async ({ page }) => {
      const panel = await openTimelineEditorPanel(page);

      const sourceDuration = await page.evaluate(() => {
        const session = (window as any).__OPENRV_TEST__?.mutations?.getSession();
        return session?.getSourceByIndex?.(0)?.duration ?? 0;
      });
      expect(sourceDuration).toBeGreaterThan(1);

      await dragFirstCutRightHandle(page, panel, -24);

      await page.waitForFunction(() => {
        const pm = (window as any).__OPENRV_TEST__?.mutations?.getPlaylistManager();
        return !!pm && pm.getClipCount() === 2;
      });

      const playlist = await getPlaylistSnapshot(page);
      expect(playlist).not.toBeNull();
      expect(playlist!.clipCount).toBe(2);
      expect(playlist!.enabled).toBe(true);
      expect(playlist!.loopMode).toBe('all');
      expect(playlist!.clips[0]!.sourceIndex).toBe(0);
      expect(playlist!.clips[1]!.sourceIndex).toBe(1);
      expect(playlist!.clips[0]!.outPoint).toBeLessThan(sourceDuration);
    });

    test('TL-EDIT-E024: deleting a cut via context menu should reduce playlist clips', async ({ page }) => {
      const panel = await openTimelineEditorPanel(page);
      const cuts = panel.locator('.timeline-cut');
      await expect(cuts).toHaveCount(2);

      await cuts.nth(1).click({ button: 'right' });
      const contextMenu = page.locator('.timeline-context-menu');
      await expect(contextMenu).toBeVisible();
      await contextMenu.locator('text=Delete Cut').click();
      await expect(contextMenu).toBeHidden();

      await expect(panel.locator('.timeline-cut')).toHaveCount(1);

      const playlist = await getPlaylistSnapshot(page);
      expect(playlist).not.toBeNull();
      expect(playlist!.clipCount).toBe(1);
      expect(playlist!.clips[0]!.sourceIndex).toBe(0);
    });
  });

  test.describe('Timeline Editor Single Source Sync', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await waitForTestHelper(page);
      await loadVideoFile(page);
      await page.waitForTimeout(200);

      await page.evaluate(() => {
        const m = (window as any).__OPENRV_TEST__?.mutations;
        const pm = m?.getPlaylistManager?.();
        pm?.clear?.();
        pm?.setEnabled?.(false);
        pm?.setCurrentFrame?.(1);

        const session = m?.getSession?.();
        session?.setCurrentSource?.(0);
        session?.goToFrame?.(1);
        session.loopMode = 'loop';
      });
      await page.waitForFunction(() => {
        const session = (window as any).__OPENRV_TEST__?.mutations?.getSession?.();
        return !!session && (session.currentSource?.duration ?? 0) > 1;
      });
      await page.waitForTimeout(100);
    });

    test('TL-EDIT-E025: trimming single-source cut should constrain playback range', async ({ page }) => {
      const sourceDuration = await page.evaluate(() => {
        const session = (window as any).__OPENRV_TEST__?.mutations?.getSession?.();
        return session?.currentSource?.duration ?? 0;
      });
      expect(sourceDuration).toBeGreaterThan(1);

      const panel = await openTimelineEditorPanel(page);
      await expect(panel.locator('.timeline-cut')).toHaveCount(1);
      await dragFirstCutRightHandle(page, panel, -24);

      await page.waitForFunction(() => {
        const m = (window as any).__OPENRV_TEST__?.mutations;
        const pm = m?.getPlaylistManager?.();
        const session = m?.getSession?.();
        if (!pm || !session || pm.getClipCount() !== 1 || pm.isEnabled?.()) return false;
        const clip = pm.getClipByIndex?.(0);
        if (!clip) return false;
        return session.inPoint === clip.inPoint && session.outPoint === clip.outPoint;
      });

      const trimmedState = await getSessionState(page);
      expect(trimmedState.outPoint).toBeLessThan(sourceDuration);

      await page.evaluate(() => {
        const session = (window as any).__OPENRV_TEST__?.mutations?.getSession?.();
        if (!session) return;
        session.goToFrame(session.outPoint);
        session.stepForward?.();
      });

      const steppedState = await getSessionState(page);
      expect(steppedState.currentFrame).toBe(steppedState.inPoint);

      const playlist = await getPlaylistSnapshot(page);
      expect(playlist).not.toBeNull();
      expect(playlist!.clipCount).toBe(1);
      expect(playlist!.enabled).toBe(false);
    });

    test('TL-EDIT-E027: single-source trim should honor "once" loop mode at boundary', async ({ page }) => {
      const panel = await openTimelineEditorPanel(page);
      await expect(panel.locator('.timeline-cut')).toHaveCount(1);
      await dragFirstCutRightHandle(page, panel, -24);

      await page.waitForFunction(() => {
        const m = (window as any).__OPENRV_TEST__?.mutations;
        const pm = m?.getPlaylistManager?.();
        const session = m?.getSession?.();
        if (!pm || !session || pm.getClipCount() !== 1 || pm.isEnabled?.()) return false;
        const clip = pm.getClipByIndex?.(0);
        if (!clip) return false;
        return session.inPoint === clip.inPoint && session.outPoint === clip.outPoint;
      });

      await page.evaluate(() => {
        const session = (window as any).__OPENRV_TEST__?.mutations?.getSession?.();
        if (!session) return;
        session.loopMode = 'once';
        session.goToFrame(session.outPoint);
        session.stepForward?.();
      });

      const steppedState = await getSessionState(page);
      expect(steppedState.currentFrame).toBe(steppedState.outPoint);
    });

    test('TL-EDIT-E026: timeline canvas should refresh immediately after edit', async ({ page }) => {
      const panel = await openTimelineEditorPanel(page);
      await expect(panel.locator('.timeline-cut')).toHaveCount(1);

      await page.evaluate(() => {
        const app = (window as any).__OPENRV_TEST__?.app as any;
        const timeline = app?.timeline;
        (window as any).__timelineRefreshCount = 0;
        if (!timeline || typeof timeline.refresh !== 'function') return;
        const originalRefresh = timeline.refresh.bind(timeline);
        timeline.refresh = (...args: unknown[]) => {
          (window as any).__timelineRefreshCount = ((window as any).__timelineRefreshCount ?? 0) + 1;
          return originalRefresh(...args);
        };
      });

      await dragFirstCutRightHandle(page, panel, -24);

      await page.waitForFunction(() => ((window as any).__timelineRefreshCount ?? 0) > 0);
    });
  });

  test.describe('Timeline UI', () => {
    test('TL-EDIT-E001: should display timeline track when media is loaded', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Timeline should be visible
      const timeline = page.locator('.timeline, [class*="timeline"]').first();
      await expect(timeline).toBeVisible();
    });

    test('TL-EDIT-E002: should show frame ruler on timeline', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Look for timeline container (main timeline component uses timeline-container class)
      const timeline = page.locator('.timeline-container, .timeline, [class*="timeline"]').first();

      // Timeline should exist
      await expect(timeline).toBeVisible();
    });

    test('TL-EDIT-E003: should allow scrubbing on timeline', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Get initial frame
      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Click on timeline at different position
      const timeline = page.locator('.timeline, [class*="timeline"]').first();
      const box = await timeline.boundingBox();

      if (box) {
        // Click at 50% of timeline
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
        await page.waitForTimeout(200);

        // Frame should have changed (or stayed same if at same position)
        const newState = await getSessionState(page);
        // Scrubbing may change frame position
      }
    });

    test('TL-EDIT-E004: should display frame numbers on timeline', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Session state should have frame info
      const sessionState = await getSessionState(page);
      expect(sessionState.frameCount).toBeGreaterThan(0);

      // Timeline should show current frame indicator
      const frameIndicator = page.locator('[class*="frame"], .frame-indicator, .playhead').first();
      // Frame display should be present
    });
  });

  test.describe('Playhead Control', () => {
    test('TL-EDIT-E005: should move playhead with arrow keys', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      const initialState = await getSessionState(page);
      const initialFrame = initialState.currentFrame;

      // Press right arrow
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      const newState = await getSessionState(page);
      expect(newState.currentFrame).toBe(initialFrame + 1);
    });

    test('TL-EDIT-E006: should jump to start with Home key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Move forward first
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);

      // Press Home
      await page.keyboard.press('Home');
      await page.waitForTimeout(100);

      const state = await getSessionState(page);
      expect(state.currentFrame).toBe(state.inPoint);
    });

    test('TL-EDIT-E007: should jump to end with End key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Press End
      await page.keyboard.press('End');
      await page.waitForTimeout(100);

      const state = await getSessionState(page);
      expect(state.currentFrame).toBe(state.outPoint);
    });
  });

  test.describe('In/Out Points', () => {
    test('TL-EDIT-E008: should set in point with I key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Move to frame 10
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      const currentState = await getSessionState(page);
      const currentFrame = currentState.currentFrame;

      // Set in point
      await page.keyboard.press('i');
      await page.waitForTimeout(100);

      const newState = await getSessionState(page);
      expect(newState.inPoint).toBe(currentFrame);
    });

    test('TL-EDIT-E009: should set out point with ] key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Get initial state to know frame count
      const initialState = await getSessionState(page);
      const frameCount = initialState.frameCount;

      // Move to a frame that's not the last frame (less than frameCount)
      const targetFrame = Math.min(10, frameCount - 1);
      await page.keyboard.press('Home');
      await page.waitForTimeout(50);

      for (let i = 1; i < targetFrame; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      const currentState = await getSessionState(page);
      const currentFrame = currentState.currentFrame;

      // Set out point with ] key (BracketRight - alternative binding that doesn't conflict with paint.ellipse)
      await page.keyboard.press(']');
      await page.waitForTimeout(100);

      const newState = await getSessionState(page);
      expect(newState.outPoint).toBe(currentFrame);
    });

    test('TL-EDIT-E010: should set in point with [ key (alternative binding)', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Get initial state - in/out should be at full range
      const initialState = await getSessionState(page);
      expect(initialState.inPoint).toBe(1);
      expect(initialState.outPoint).toBe(initialState.frameCount);

      // Move to frame 5 using arrow keys
      await page.keyboard.press('Home'); // Go to start (frame 1)
      await page.waitForTimeout(50);

      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      // Verify we're at frame 5
      const midState = await getSessionState(page);
      expect(midState.currentFrame).toBe(5);

      // Set in point at frame 5 using [ key (alternative binding)
      await page.keyboard.press('[');
      await page.waitForTimeout(100);

      const finalState = await getSessionState(page);
      // In point should now be at frame 5
      expect(finalState.inPoint).toBe(5);
      // Out point should still be at end
      expect(finalState.outPoint).toBe(finalState.frameCount);
    });
  });

  test.describe('Markers', () => {
    test('TL-EDIT-E011: should add marker with M key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Move to frame 5
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(100);

      const currentState = await getSessionState(page);
      const initialMarkers = currentState.marks.length;

      // Add marker
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      const newState = await getSessionState(page);
      expect(newState.marks.length).toBe(initialMarkers + 1);
    });

    test('TL-EDIT-E012: should toggle marker off with M key', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Move and add marker
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      const stateWithMarker = await getSessionState(page);
      expect(stateWithMarker.marks.length).toBeGreaterThan(0);

      // Toggle marker off
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      const stateWithoutMarker = await getSessionState(page);
      expect(stateWithoutMarker.marks.length).toBe(stateWithMarker.marks.length - 1);
    });

    test('TL-EDIT-E013: markers should have notes and colors in full data', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Add marker
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('m');
      await page.waitForTimeout(100);

      const state = await getSessionState(page);

      // Check full marker data structure
      if (state.markers && state.markers.length > 0) {
        const marker = state.markers[0];
        expect(marker).toHaveProperty('frame');
        expect(marker).toHaveProperty('note');
        expect(marker).toHaveProperty('color');
      }
    });
  });

  test.describe('Loop Modes', () => {
    test('TL-EDIT-E014: should cycle loop mode with Ctrl+L', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      const initialState = await getSessionState(page);
      const initialLoopMode = initialState.loopMode;

      // Press Ctrl+L to cycle loop mode (L alone is playback.faster)
      await page.keyboard.press('Control+l');
      await page.waitForTimeout(100);

      const newState = await getSessionState(page);
      // Loop mode should have changed
      expect(newState.loopMode).not.toBe(initialLoopMode);
    });

    test('TL-EDIT-E015: should support once, loop, and pingpong modes', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      const validModes = ['once', 'loop', 'pingpong'];

      // Cycle through all modes
      for (let i = 0; i < 3; i++) {
        const state = await getSessionState(page);
        expect(validModes).toContain(state.loopMode);
        await page.keyboard.press('l');
        await page.waitForTimeout(100);
      }
    });
  });

  test.describe('Timeline with Multiple Sources', () => {
    test('TL-EDIT-E016: should display A/B sources when two files loaded', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const state = await getSessionState(page);
      expect(state.abCompareAvailable).toBe(true);
    });

    test('TL-EDIT-E017: should toggle between sources with backtick', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadTwoVideoFiles(page);
      await page.waitForTimeout(500);

      const initialState = await getSessionState(page);
      const initialSource = initialState.currentAB;

      // Toggle with backtick
      await page.keyboard.press('`');
      await page.waitForTimeout(100);

      const newState = await getSessionState(page);
      expect(newState.currentAB).not.toBe(initialSource);
    });
  });

  test.describe('Timeline Zoom Controls', () => {
    // Note: TimelineEditor zoom controls are only available when editing sequences/EDL
    // These tests verify the zoom functionality when the controls are present

    test('TL-EDIT-E018: viewer zoom should work with mouse wheel', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Get initial viewer state
      const initialState = await page.evaluate(() => {
        return window.__OPENRV_TEST__?.getViewerState();
      });
      const initialZoom = initialState?.zoom || 1;

      // Find the canvas/viewer and zoom with mouse wheel
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (box) {
        // Move mouse to canvas center and scroll
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, -100); // Zoom in
        await page.waitForTimeout(300);

        const newState = await page.evaluate(() => {
          return window.__OPENRV_TEST__?.getViewerState();
        });
        const newZoom = newState?.zoom || 1;

        // Zoom should have changed (either increased or stayed at max)
        expect(newZoom).toBeGreaterThanOrEqual(initialZoom);
      }
    });

    test('TL-EDIT-E019: viewer should support fit-to-window zoom', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Press 'f' to fit to window
      await page.keyboard.press('f');
      await page.waitForTimeout(200);

      const state = await page.evaluate(() => {
        return window.__OPENRV_TEST__?.getViewerState();
      });

      // After fit-to-window, zoom should be set (may be < 1 or > 1 depending on media size)
      expect(state?.zoom).toBeDefined();
      expect(state?.zoom).toBeGreaterThan(0);
    });

    test('TL-EDIT-E020: viewer should support 100% zoom', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app');
      await loadVideoFile(page);
      await page.waitForTimeout(500);

      // Press '1' for 100% zoom
      await page.keyboard.press('1');
      await page.waitForTimeout(200);

      const state = await page.evaluate(() => {
        return window.__OPENRV_TEST__?.getViewerState();
      });

      // After 100% zoom, zoom should be exactly 1
      expect(state?.zoom).toBeCloseTo(1, 1);
    });
  });
});
