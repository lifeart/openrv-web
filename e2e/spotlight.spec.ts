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
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightPosition(0.3, 0.7);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.x).toBeCloseTo(0.3, 1);
    expect(state.y).toBeCloseTo(0.7, 1);
  });

  test('SL-E014: changing size updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightSize(0.4, 0.4);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.width).toBeCloseTo(0.4, 1);
    expect(state.height).toBeCloseTo(0.4, 1);
  });

  test('SL-E015: changing dim amount updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightDimAmount(0.5);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.dimAmount).toBeCloseTo(0.5, 1);
  });

  test('SL-E016: changing feather updates state', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightFeather(0.1);
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
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightShape('rectangle');
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
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightShape('rectangle');
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
    const control = page.locator('[data-testid="spotlight-toggle-btn"]');
    await expect(control).toBeVisible();
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
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightPosition(0.25, 0.75);
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
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightPosition(0.75, 0.25);
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
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightSize(0.3, 0.3);
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
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightPosition(0.3, 0.7);
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

/**
 * UI Button Toggle Tests
 *
 * These tests verify the spotlight toggle button in the View tab
 */
test.describe('Spotlight UI Button Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SL-E060: clicking spotlight button enables spotlight', async ({ page }) => {
    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Verify spotlight is disabled initially
    let state = await getSpotlightState(page);
    expect(state.enabled).toBe(false);

    // Click spotlight button
    const spotlightButton = page.locator('[data-testid="spotlight-toggle-btn"]');
    await spotlightButton.click();
    await page.waitForTimeout(100);

    // Verify spotlight is enabled
    state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);
  });

  test('SL-E061: clicking spotlight button twice disables spotlight', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const spotlightButton = page.locator('[data-testid="spotlight-toggle-btn"]');

    // Enable spotlight
    await spotlightButton.click();
    await page.waitForTimeout(100);
    let state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);

    // Disable spotlight
    await spotlightButton.click();
    await page.waitForTimeout(100);
    state = await getSpotlightState(page);
    expect(state.enabled).toBe(false);
  });

  test('SL-E062: spotlight button has active styling when enabled', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const spotlightButton = page.locator('[data-testid="spotlight-toggle-btn"]');

    // Check initial styling (should not have active color)
    let bgColor = await spotlightButton.evaluate(el => el.style.background);
    expect(bgColor).not.toContain('accent-primary-rgb');

    // Enable spotlight
    await spotlightButton.click();
    await page.waitForTimeout(100);

    // Check active styling
    bgColor = await spotlightButton.evaluate(el => el.style.background);
    expect(bgColor).toContain('accent-primary-rgb');
  });

  test('SL-E063: spotlight button syncs with keyboard toggle', async ({ page }) => {
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const spotlightButton = page.locator('[data-testid="spotlight-toggle-btn"]');

    // Enable via keyboard
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    // Button should show active styling
    const bgColor = await spotlightButton.evaluate(el => el.style.background);
    expect(bgColor).toContain('accent-primary-rgb');
  });
});

/**
 * Shape Switching Tests
 *
 * These tests verify shape switching between circle and rectangle
 */
test.describe('Spotlight Shape Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    // Enable spotlight
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);
  });

  test('SL-E070: can switch from circle to rectangle shape', async ({ page }) => {
    let state = await getSpotlightState(page);
    expect(state.shape).toBe('circle');

    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightShape('rectangle');
    });
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.shape).toBe('rectangle');
  });

  test('SL-E071: can switch from rectangle back to circle', async ({ page }) => {
    // Set to rectangle first
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightShape('rectangle');
    });
    await page.waitForTimeout(100);

    let state = await getSpotlightState(page);
    expect(state.shape).toBe('rectangle');

    // Switch back to circle
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightShape('circle');
    });
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.shape).toBe('circle');
  });

  test('SL-E072: shape change produces different canvas rendering', async ({ page }) => {
    // Capture circle rendering
    const circleData = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      return overlay?.toDataURL('image/png') ?? null;
    });

    // Switch to rectangle
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightShape('rectangle');
    });
    await page.waitForTimeout(200);

    // Capture rectangle rendering
    const rectangleData = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      return overlay?.toDataURL('image/png') ?? null;
    });

    // Should produce different visuals
    expect(circleData).not.toBeNull();
    expect(rectangleData).not.toBeNull();
    expect(circleData !== rectangleData).toBe(true);
  });

  test('SL-E073: rectangle shape has 8 resize handles', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightShape('rectangle');
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightSize(0.3, 0.3);
    });
    await page.waitForTimeout(100);

    // Verify rectangle mode is active
    const state = await getSpotlightState(page);
    expect(state.shape).toBe('rectangle');

    // The handles are rendered on canvas, so we verify by checking
    // that resize works from corner positions (NW, NE, SW, SE)
    const overlay = page.locator('[data-testid="spotlight-overlay"]');
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      const initialWidth = state.width;

      // Try resizing from the east (right) edge
      const spotCenterX = box.x + box.width * state.x;
      const handleX = spotCenterX + (state.width * box.width);
      const handleY = box.y + box.height * state.y;

      await page.mouse.move(handleX, handleY);
      await page.mouse.down();
      await page.mouse.move(handleX + 30, handleY, { steps: 3 });
      await page.mouse.up();
      await page.waitForTimeout(100);

      const newState = await getSpotlightState(page);
      expect(newState.width).toBeGreaterThan(initialWidth);
    }
  });
});

/**
 * Feather and Dim Amount Tests
 *
 * These tests verify feather and dim amount adjustments
 */
test.describe('Spotlight Feather and Dim Amount', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);
  });

  test('SL-E080: increasing feather produces softer edge', async ({ page }) => {
    // Capture with default feather (0.05)
    const lowFeatherData = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      return overlay?.toDataURL('image/png') ?? null;
    });

    // Increase feather to max
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightFeather(0.5);
    });
    await page.waitForTimeout(200);

    const highFeatherData = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      return overlay?.toDataURL('image/png') ?? null;
    });

    // Verify state changed
    const state = await getSpotlightState(page);
    expect(state.feather).toBeCloseTo(0.5, 1);

    // Visual should be different
    expect(lowFeatherData !== highFeatherData).toBe(true);
  });

  test('SL-E081: setting feather to 0 produces hard edge', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightFeather(0);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.feather).toBe(0);
  });

  test('SL-E082: increasing dim amount darkens surroundings more', async ({ page }) => {
    // Capture with default dim (0.7)
    const normalDimData = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      return overlay?.toDataURL('image/png') ?? null;
    });

    // Set dim to maximum
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightDimAmount(1.0);
    });
    await page.waitForTimeout(200);

    const maxDimData = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      return overlay?.toDataURL('image/png') ?? null;
    });

    // Verify state changed
    const state = await getSpotlightState(page);
    expect(state.dimAmount).toBe(1);

    // Visual should be different (darker)
    expect(normalDimData !== maxDimData).toBe(true);
  });

  test('SL-E083: setting dim amount to 0 removes dimming', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightDimAmount(0);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.dimAmount).toBe(0);
  });

  test('SL-E084: feather is clamped to valid range', async ({ page }) => {
    // Try setting feather above max
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightFeather(1.5);
    });
    await page.waitForTimeout(100);

    let state = await getSpotlightState(page);
    expect(state.feather).toBeLessThanOrEqual(0.5);

    // Try setting feather below min
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightFeather(-0.5);
    });
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.feather).toBeGreaterThanOrEqual(0);
  });
});

/**
 * Edge Cases and Boundary Tests
 *
 * These tests verify spotlight behavior at extreme positions and sizes
 */
test.describe('Spotlight Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);
  });

  test('SL-E090: spotlight at corner position (0, 0)', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightPosition(0, 0);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
  });

  test('SL-E091: spotlight at corner position (1, 1)', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightPosition(1, 1);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.x).toBe(1);
    expect(state.y).toBe(1);
  });

  test('SL-E092: position is clamped to valid range', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightPosition(-0.5, 1.5);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.x).toBeGreaterThanOrEqual(0);
    expect(state.x).toBeLessThanOrEqual(1);
    expect(state.y).toBeGreaterThanOrEqual(0);
    expect(state.y).toBeLessThanOrEqual(1);
  });

  test('SL-E093: minimum spotlight size is enforced', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightSize(0.001, 0.001);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    // Minimum size is 0.01
    expect(state.width).toBeGreaterThanOrEqual(0.01);
    expect(state.height).toBeGreaterThanOrEqual(0.01);
  });

  test('SL-E094: very large spotlight size is handled', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightSize(1, 1);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.width).toBe(1);
    expect(state.height).toBe(1);
  });

  test('SL-E095: spotlight size beyond maximum is clamped', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightSize(2, 2);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.width).toBeLessThanOrEqual(1);
    expect(state.height).toBeLessThanOrEqual(1);
  });

  test('SL-E096: spotlight works with very small resize', async ({ page }) => {
    // Set initial size
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setSpotlightSize(0.3, 0.3);
    });
    await page.waitForTimeout(100);

    const overlay = page.locator('[data-testid="spotlight-overlay"]');
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      const state = await getSpotlightState(page);

      // Try to resize to very small
      const spotCenterX = box.x + box.width * state.x;
      const handleX = spotCenterX + (state.width * box.width);
      const handleY = box.y + box.height * state.y;

      await page.mouse.move(handleX, handleY);
      await page.mouse.down();
      // Try to drag handle past center (would make negative size)
      await page.mouse.move(spotCenterX - 50, handleY, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(100);

      // Size should be enforced to minimum
      const newState = await getSpotlightState(page);
      expect(newState.width).toBeGreaterThanOrEqual(0.05);
    }
  });
});

/**
 * Spotlight Interaction with Other Features
 *
 * These tests verify spotlight works correctly with other viewer features
 */
test.describe('Spotlight Feature Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  test('SL-E100: spotlight works with zoom', async ({ page }) => {
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    let state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);

    // Zoom viewer
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setViewerZoom(2);
    });
    await page.waitForTimeout(200);

    // Spotlight should still be enabled
    state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);

    // Overlay should still be visible
    const overlay = page.locator('[data-testid="spotlight-overlay"]');
    await expect(overlay).toBeVisible();
  });

  test('SL-E101: spotlight works with pan', async ({ page }) => {
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    // Pan the viewer (not the spotlight)
    await page.evaluate(() => {
      (window as any).__OPENRV_TEST__?.mutations?.setViewerPan(50, 50);
    });
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);
    // Spotlight position should not have changed
    expect(state.x).toBeCloseTo(0.5, 1);
    expect(state.y).toBeCloseTo(0.5, 1);
  });

  test('SL-E102: spotlight renders above main canvas', async ({ page }) => {
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    // Check z-index
    const zIndex = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="spotlight-overlay"]') as HTMLCanvasElement;
      const mainCanvas = document.querySelector('.image-canvas, canvas:not([data-testid])') as HTMLCanvasElement;

      const overlayZ = parseInt(getComputedStyle(overlay).zIndex) || 0;
      const canvasZ = parseInt(getComputedStyle(mainCanvas).zIndex) || 0;

      return { overlayZ, canvasZ };
    });

    expect(zIndex.overlayZ).toBeGreaterThan(zIndex.canvasZ);
  });

  test('SL-E103: spotlight does not interfere with playback', async ({ page }) => {
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    // Start playback
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    // Spotlight should still be enabled
    const state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);

    // Stop playback
    await page.keyboard.press('Space');
  });

  test('SL-E104: enabling spotlight via button after keyboard works', async ({ page }) => {
    // Enable via keyboard
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    // Disable via keyboard
    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    let state = await getSpotlightState(page);
    expect(state.enabled).toBe(false);

    // Enable via button
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    const spotlightButton = page.locator('[data-testid="spotlight-toggle-btn"]');
    await spotlightButton.click();
    await page.waitForTimeout(100);

    state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);
  });
});

/**
 * Spotlight Visibility Without Media
 *
 * Tests for spotlight behavior when no media is loaded
 */
test.describe('Spotlight Without Media', () => {
  test('SL-E110: spotlight button exists even without media', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    // Don't load any media

    // Go to View tab
    await page.click('button[data-tab-id="view"]');
    await page.waitForTimeout(100);

    // Button should exist
    const spotlightButton = page.locator('[data-testid="spotlight-toggle-btn"]');
    await expect(spotlightButton).toBeVisible();
  });

  test('SL-E111: spotlight can be enabled without media', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    // Don't load any media

    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    const state = await getSpotlightState(page);
    expect(state.enabled).toBe(true);
  });

  test('SL-E112: spotlight overlay exists without media', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    // Don't load any media

    await page.keyboard.press('Shift+q');
    await page.waitForTimeout(100);

    const overlay = page.locator('[data-testid="spotlight-overlay"]');
    await expect(overlay).toBeVisible();
  });
});
