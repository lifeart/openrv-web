import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  getSpotlightState,
  waitForTestHelper,
} from './fixtures';

/**
 * Spotlight Feature Tests
 *
 * These tests verify the spotlight/vignette functionality,
 * including toggling, position, and appearance settings.
 */

test.describe('Spotlight Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SL-E001: spotlight is disabled by default', async ({ page }) => {
    const state = await getSpotlightState(page);
    expect(state.enabled).toBe(false);
  });

  test('SL-E002: pressing Shift+Q toggles spotlight', async ({ page }) => {
    let state = await getSpotlightState(page);
    expect(state.enabled).toBe(false);

    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);

    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.enabled).toBe(false);
  });

  test('SL-E003: spotlight changes canvas appearance', async ({ page }) => {
    // Capture spotlight overlay state before enabling
    const beforeData = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      if (!overlay) return null;
      return overlay.toDataURL('image/png');
    });

    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(200);

    // Capture spotlight overlay state after enabling
    const afterData = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      if (!overlay) return null;
      return overlay.toDataURL('image/png');
    });

    // The spotlight overlay should have changed
    expect(beforeData !== afterData).toBe(true);
  });

  test('SL-E004: spotlight overlay is visible when enabled', async ({ page }) => {
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    const overlay = page.locator('[data-testid="spotlight-overlay"], .spotlight-overlay');
    await expect(overlay).toBeVisible();
  });
});

test.describe('Spotlight Properties', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Enable spotlight
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);
  });

  test('SL-E010: default shape is circle', async ({ page }) => {
    const state = await getSpotlightState(page);
    expect(state.shape).toBe('circle');
  });

  test('SL-E011: default position is center (0.5, 0.5)', async ({ page }) => {
    const state = await getSpotlightState(page);
    expect(state.x).toBeCloseTo(0.5, 1);
    expect(state.y).toBeCloseTo(0.5, 1);
  });

  test('SL-E012: default dim amount is 0.7', async ({ page }) => {
    const state = await getSpotlightState(page);
    expect(state.dimAmount).toBeCloseTo(0.7, 1);
  });

  test('SL-E013: changing position updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.getSpotlightOverlay?.()?.setPosition(0.3, 0.7);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.x).toBeCloseTo(0.3, 1);
    expect(state.y).toBeCloseTo(0.7, 1);
  });

  test('SL-E014: changing size updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.getSpotlightOverlay?.()?.setSize(0.4, 0.4);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.width).toBeCloseTo(0.4, 1);
    expect(state.height).toBeCloseTo(0.4, 1);
  });

  test('SL-E015: changing dim amount updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.getSpotlightOverlay?.()?.setDimAmount(0.5);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.dimAmount).toBeCloseTo(0.5, 1);
  });

  test('SL-E016: changing feather updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.getSpotlightOverlay?.()?.setFeather(0.1);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.feather).toBeCloseTo(0.1, 1);
  });
});

test.describe('Spotlight Shape', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);
  });

  test('SL-E020: changing shape to rectangle updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.getSpotlightOverlay?.()?.setShape('rectangle');
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.shape).toBe('rectangle');
  });

  test('SL-E021: different shapes produce different visuals', async ({ page }) => {
    // Capture spotlight overlay with circle shape
    const circleData = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      if (!overlay) return null;
      return overlay.toDataURL('image/png');
    });

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.getSpotlightOverlay?.()?.setShape('rectangle');
    });
    await page.waitForTimeout(200);

    // Capture spotlight overlay with rectangle shape
    const rectangleData = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      if (!overlay) return null;
      return overlay.toDataURL('image/png');
    });

    // The shapes should produce different visuals
    expect(circleData !== rectangleData).toBe(true);
  });
});

test.describe('Spotlight UI Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SL-E030: spotlight control exists in View tab', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Look for spotlight control
    const control = page.locator('[data-testid="spotlight-control"], button:has-text("Spotlight"), button:has-text("Focus")');
    await expect(control.first()).toBeVisible();
  });
});

test.describe('Spotlight Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Enable spotlight
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);
  });

  test('SL-E050: spotlight overlay has correct CSS dimensions when enabled', async ({ page }) => {
    // Check that the spotlight overlay canvas has CSS width/height set
    const hasCorrectDimensions = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      if (!overlay) return false;
      // CSS width/height should be set (not empty and not 0)
      return overlay.style.width !== '' && overlay.style.height !== '';
    });
    expect(hasCorrectDimensions).toBe(true);
  });

  test('SL-E051: spotlight overlay is positioned correctly', async ({ page }) => {
    const isPositionedCorrectly = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      if (!overlay) return false;
      const style = getComputedStyle(overlay);
      // Should have absolute or fixed positioning and be within the viewer
      return style.position === 'absolute' || style.position === 'fixed';
    });
    expect(isPositionedCorrectly).toBe(true);
  });

  test('SL-E052: spotlight overlay accepts pointer events when enabled', async ({ page }) => {
    // Check that pointer-events is set to auto when spotlight is enabled
    const hasPointerEvents = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      if (!overlay) return false;
      return overlay.style.pointerEvents === 'auto';
    });
    expect(hasPointerEvents).toBe(true);
  });

  test('SL-E053: spotlight overlay has correct z-index', async ({ page }) => {
    const zIndex = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      if (!overlay) return -1;
      const style = getComputedStyle(overlay);
      return parseInt(style.zIndex) || 0;
    });
    // Should have a positive z-index to appear above the viewer canvas
    expect(zIndex).toBeGreaterThan(0);
  });

  test('SL-E054: spotlight overlay dimensions match canvas CSS size', async ({ page }) => {
    // Verify the overlay CSS dimensions are set correctly (the main fix)
    const dimensions = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      if (!overlay) return null;
      const rect = overlay.getBoundingClientRect();
      const cssWidth = overlay.style.width;
      const cssHeight = overlay.style.height;
      return {
        cssWidth,
        cssHeight,
        rectWidth: rect.width,
        rectHeight: rect.height,
        canvasWidth: overlay.width,
        canvasHeight: overlay.height,
      };
    });

    expect(dimensions).not.toBeNull();
    if (dimensions) {
      // CSS width/height should be set
      expect(dimensions.cssWidth).not.toBe('');
      expect(dimensions.cssHeight).not.toBe('');
      // Bounding rect should have non-zero dimensions
      expect(dimensions.rectWidth).toBeGreaterThan(0);
      expect(dimensions.rectHeight).toBeGreaterThan(0);
      // Canvas physical dimensions should be set (for hi-DPI)
      expect(dimensions.canvasWidth).toBeGreaterThan(0);
      expect(dimensions.canvasHeight).toBeGreaterThan(0);
    }
  });

  test('SL-E055: spotlight position can be changed via API', async ({ page }) => {
    // Verify that position changes work correctly (validates coordinate system)
    let state = await getSpotlightState(page);
    expect(state.x).toBeCloseTo(0.5, 1);
    expect(state.y).toBeCloseTo(0.5, 1);

    // Change position via API
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.getSpotlightOverlay?.()?.setPosition(0.25, 0.75);
    });
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.x).toBeCloseTo(0.25, 1);
    expect(state.y).toBeCloseTo(0.75, 1);

    // Capture canvas to verify visual changed
    const beforeData = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      return overlay?.toDataURL('image/png') ?? null;
    });

    // Move position again
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.getSpotlightOverlay?.()?.setPosition(0.75, 0.25);
    });
    await page.waitForTimeout(100);

    const afterData = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      return overlay?.toDataURL('image/png') ?? null;
    });

    // Visual should have changed
    expect(beforeData !== afterData).toBe(true);
  });

  test('SL-E056: mouse drag within spotlight area moves the spotlight', async ({ page }) => {
    // Get the spotlight overlay element and its bounding box
    const overlay = page.locator('[data-testid="spotlight-overlay"]');
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      // Get initial state
      let state = await getSpotlightState(page);
      const initialX = state.x;
      const initialY = state.y;

      // The spotlight is at center (0.5, 0.5) with size 0.2
      // Calculate pixel position of spotlight center
      const centerX = box.x + box.width * 0.5;
      const centerY = box.y + box.height * 0.5;

      // Perform drag operation - click in center and drag
      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      // Drag significantly - 100 pixels right and 80 pixels down
      await page.mouse.move(centerX + 100, centerY + 80, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(150);

      // Get new state
      state = await getSpotlightState(page);

      // Position should have changed (moved right and down)
      // Check with some tolerance since exact values depend on canvas size
      const xChanged = Math.abs(state.x - initialX) > 0.05;
      const yChanged = Math.abs(state.y - initialY) > 0.05;
      expect(xChanged || yChanged).toBe(true);
    }
  });
});

/**
 * Regression Tests for Spotlight Issues
 *
 * These tests specifically cover bugs that were found and fixed:
 * 1. Spotlight rendered too big (CSS dimensions not set correctly for HiDPI)
 * 2. Unable to move/resize spotlight (viewer captured pointer events)
 */
test.describe('Spotlight Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Enable spotlight
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);
  });

  test('SL-R001: spotlight canvas CSS size matches bounding rect (HiDPI fix)', async ({ page }) => {
    // This test catches the issue where setStyle: false caused canvas to render too big
    const sizeCheck = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      if (!overlay) return null;

      const rect = overlay.getBoundingClientRect();
      const cssWidth = parseFloat(overlay.style.width) || 0;
      const cssHeight = parseFloat(overlay.style.height) || 0;

      return {
        cssWidth,
        cssHeight,
        rectWidth: rect.width,
        rectHeight: rect.height,
        // CSS dimensions should closely match bounding rect (within 1px tolerance)
        widthMatches: Math.abs(cssWidth - rect.width) < 1,
        heightMatches: Math.abs(cssHeight - rect.height) < 1,
      };
    });

    expect(sizeCheck).not.toBeNull();
    if (sizeCheck) {
      expect(sizeCheck.cssWidth).toBeGreaterThan(0);
      expect(sizeCheck.cssHeight).toBeGreaterThan(0);
      expect(sizeCheck.widthMatches).toBe(true);
      expect(sizeCheck.heightMatches).toBe(true);
    }
  });

  test('SL-R002: spotlight canvas is not oversized for HiDPI displays', async ({ page }) => {
    // This test ensures canvas doesn't render at physical pixel size
    const dimensionCheck = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      if (!overlay) return null;

      const rect = overlay.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // Physical canvas dimensions (canvas.width/height) should be CSS size * DPR
      // CSS dimensions (rect) should NOT be multiplied by DPR
      return {
        physicalWidth: overlay.width,
        physicalHeight: overlay.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        dpr,
        // Physical should be approximately CSS * DPR (for HiDPI)
        physicalMatchesExpected: Math.abs(overlay.width - rect.width * dpr) < 2,
      };
    });

    expect(dimensionCheck).not.toBeNull();
    if (dimensionCheck) {
      // CSS dimensions should be reasonable (not 0, not huge)
      expect(dimensionCheck.cssWidth).toBeGreaterThan(100);
      expect(dimensionCheck.cssWidth).toBeLessThan(5000);
      expect(dimensionCheck.cssHeight).toBeGreaterThan(100);
      expect(dimensionCheck.cssHeight).toBeLessThan(5000);
      // Physical dimensions should scale with DPR
      expect(dimensionCheck.physicalMatchesExpected).toBe(true);
    }
  });

  test('SL-R003: dragging spotlight does NOT move the viewer canvas', async ({ page }) => {
    // This test catches the issue where pointer events were captured by viewer
    // Get initial viewer pan state
    const initialViewerState = await page.evaluate(() => {
      return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
    });
    expect(initialViewerState).not.toBeNull();

    const initialPanX = initialViewerState.panX;
    const initialPanY = initialViewerState.panY;

    // Get spotlight overlay bounding box
    const overlay = page.locator('[data-testid="spotlight-overlay"]');
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      // Click and drag in the spotlight center
      const centerX = box.x + box.width * 0.5;
      const centerY = box.y + box.height * 0.5;

      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      await page.mouse.move(centerX + 50, centerY + 50, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Check viewer pan state - it should NOT have changed
      const afterViewerState = await page.evaluate(() => {
        return (window as any).__OPENRV_TEST__?.getViewerState?.() ?? null;
      });

      // Viewer pan should be the same (spotlight drag should not move viewer)
      expect(afterViewerState.panX).toBeCloseTo(initialPanX, 0);
      expect(afterViewerState.panY).toBeCloseTo(initialPanY, 0);
    }
  });

  test('SL-R004: spotlight position changes when dragged (not viewer)', async ({ page }) => {
    // This test verifies spotlight actually moves when dragged
    let state = await getSpotlightState(page);
    const initialSpotX = state.x;
    const initialSpotY = state.y;

    const overlay = page.locator('[data-testid="spotlight-overlay"]');
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      const centerX = box.x + box.width * 0.5;
      const centerY = box.y + box.height * 0.5;

      // Drag spotlight
      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      await page.mouse.move(centerX + 80, centerY + 60, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Spotlight position should have changed
      state = await getSpotlightState(page);
      const spotMoved = Math.abs(state.x - initialSpotX) > 0.03 ||
                        Math.abs(state.y - initialSpotY) > 0.03;
      expect(spotMoved).toBe(true);
    }
  });

  test('SL-R005: spotlight resize handles work correctly', async ({ page }) => {
    // Increase spotlight size for easier handle targeting
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.getSpotlightOverlay?.()?.setSize(0.3, 0.3);
    });
    await page.waitForTimeout(100);

    let state = await getSpotlightState(page);
    const initialWidth = state.width;

    const overlay = page.locator('[data-testid="spotlight-overlay"]');
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      // Calculate position of the east (right) resize handle
      // Handle is at spotlight center + width in normalized coords
      const spotCenterX = box.x + box.width * state.x;
      const spotCenterY = box.y + box.height * state.y;
      const handleX = spotCenterX + (state.width * box.width);
      const handleY = spotCenterY;

      // Drag the east handle to resize
      await page.mouse.move(handleX, handleY);
      await page.mouse.down();
      await page.mouse.move(handleX + 40, handleY, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Width should have increased
      state = await getSpotlightState(page);
      expect(state.width).toBeGreaterThan(initialWidth);
    }
  });

  test('SL-R006: pointer events are captured by spotlight, not viewer', async ({ page }) => {
    // Verify that when clicking inside spotlight, the spotlight handles it
    const eventCheck = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      if (!overlay) return { hasPointerEvents: false, pointerEventsValue: '' };

      const style = getComputedStyle(overlay);
      return {
        hasPointerEvents: overlay.style.pointerEvents === 'auto',
        pointerEventsValue: overlay.style.pointerEvents,
        computedPointerEvents: style.pointerEvents,
      };
    });

    expect(eventCheck.hasPointerEvents).toBe(true);
    expect(eventCheck.pointerEventsValue).toBe('auto');
  });

  test('SL-R007: clicking outside spotlight area does not start drag', async ({ page }) => {
    // Clicking in the dimmed area (outside spotlight circle) should not drag
    let state = await getSpotlightState(page);
    const initialX = state.x;
    const initialY = state.y;

    const overlay = page.locator('[data-testid="spotlight-overlay"]');
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      // Click in corner (outside spotlight circle which is at center with 0.2 radius)
      const cornerX = box.x + box.width * 0.1;
      const cornerY = box.y + box.height * 0.1;

      await page.mouse.move(cornerX, cornerY);
      await page.mouse.down();
      await page.mouse.move(cornerX + 50, cornerY + 50, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Spotlight position should NOT have changed
      state = await getSpotlightState(page);
      expect(state.x).toBeCloseTo(initialX, 1);
      expect(state.y).toBeCloseTo(initialY, 1);
    }
  });
});

test.describe('Spotlight State Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SL-E040: spotlight state persists when changing frames', async ({ page }) => {
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    let state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);
  });

  test('SL-E041: spotlight position persists when changing frames', async ({ page }) => {
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    // Change position
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.app?.viewer?.getSpotlightOverlay?.()?.setPosition(0.3, 0.7);
    });
    await page.waitForTimeout(100);

    let state = await getSpotlightState(page);
    expect(state.x).toBeCloseTo(0.3, 1);

    // Navigate frames
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.x).toBeCloseTo(0.3, 1);
  });

  test('SL-E042: spotlight state persists when changing tabs', async ({ page }) => {
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    let state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);

    // Switch tabs
    await page.click('button[data-tab-id="color"]');
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);
  });
});
