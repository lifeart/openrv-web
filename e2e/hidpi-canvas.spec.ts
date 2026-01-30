import { test, expect, loadVideoFile } from './fixtures';

test.describe('Hi-DPI Canvas Support', () => {
  test('HIDPI-001: placeholder canvas should have proper hi-DPI configuration', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Get the viewer canvas (placeholder state - no media loaded)
    const canvas = page.locator('.viewer-container canvas').first();
    await expect(canvas).toBeVisible();

    // Check canvas dimensions and CSS styles
    const canvasInfo = await canvas.evaluate((el: HTMLCanvasElement) => {
      const dpr = window.devicePixelRatio || 1;
      const computedStyle = getComputedStyle(el);
      const cssWidth = parseFloat(computedStyle.width) || el.offsetWidth;
      const cssHeight = parseFloat(computedStyle.height) || el.offsetHeight;

      return {
        // Physical canvas dimensions (should be CSS * dpr)
        physicalWidth: el.width,
        physicalHeight: el.height,
        // CSS dimensions (logical size)
        cssWidth,
        cssHeight,
        // Device pixel ratio
        dpr,
        // Style values if explicitly set
        styleWidth: el.style.width,
        styleHeight: el.style.height,
      };
    });

    // Verify hi-DPI scaling is applied correctly
    // Physical dimensions should be approximately CSS dimensions * DPR
    const expectedPhysicalWidth = Math.floor(canvasInfo.cssWidth * canvasInfo.dpr);
    const expectedPhysicalHeight = Math.floor(canvasInfo.cssHeight * canvasInfo.dpr);

    // Allow some tolerance for rounding
    expect(Math.abs(canvasInfo.physicalWidth - expectedPhysicalWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(canvasInfo.physicalHeight - expectedPhysicalHeight)).toBeLessThanOrEqual(1);
  });

  test('HIDPI-002: canvas should transition correctly from placeholder to media', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // First verify placeholder state has hi-DPI configuration
    const canvas = page.locator('.viewer-container canvas').first();
    await expect(canvas).toBeVisible();

    const placeholderInfo = await canvas.evaluate((el: HTMLCanvasElement) => {
      const dpr = window.devicePixelRatio || 1;
      const ctx = el.getContext('2d');
      const transform = ctx?.getTransform();
      return {
        physicalWidth: el.width,
        physicalHeight: el.height,
        styleWidth: el.style.width,
        styleHeight: el.style.height,
        dpr,
        // Check if context is scaled (hi-DPI mode)
        contextScaleX: transform?.a ?? 1,
        contextScaleY: transform?.d ?? 1,
      };
    });

    // In placeholder state with hi-DPI:
    // - CSS style dimensions should be set (to maintain logical size)
    // - Physical dimensions should be scaled by DPR
    // - Context should be scaled by DPR
    expect(placeholderInfo.styleWidth).not.toBe('');
    expect(placeholderInfo.styleHeight).not.toBe('');

    // On hi-DPI displays, context scale should match DPR
    if (placeholderInfo.dpr > 1) {
      expect(placeholderInfo.contextScaleX).toBeCloseTo(placeholderInfo.dpr, 1);
      expect(placeholderInfo.contextScaleY).toBeCloseTo(placeholderInfo.dpr, 1);
    }

    // Load a video file
    await loadVideoFile(page);

    // After loading media, canvas should be reset from hi-DPI mode
    const loadedInfo = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      const transform = ctx?.getTransform();
      return {
        physicalWidth: el.width,
        physicalHeight: el.height,
        styleWidth: el.style.width,
        styleHeight: el.style.height,
        hasContext: !!ctx,
        // Context transform should be identity after reset
        contextScaleX: transform?.a ?? 1,
        contextScaleY: transform?.d ?? 1,
      };
    });

    // After media loads:
    // - Canvas should have valid dimensions
    // - Context transform should be identity (scale = 1)
    expect(loadedInfo.hasContext).toBe(true);
    expect(loadedInfo.physicalWidth).toBeGreaterThan(0);
    expect(loadedInfo.physicalHeight).toBeGreaterThan(0);
    // Context should be reset to identity transform
    expect(loadedInfo.contextScaleX).toBe(1);
    expect(loadedInfo.contextScaleY).toBe(1);
  });

  test('HIDPI-003: Timeline canvas should have proper hi-DPI scaling', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Timeline is usually the bottom canvas
    const timeline = page.locator('.timeline canvas, canvas').last();
    await expect(timeline).toBeVisible();

    const timelineInfo = await timeline.evaluate((el: HTMLCanvasElement) => {
      const dpr = window.devicePixelRatio || 1;
      const rect = el.getBoundingClientRect();
      return {
        physicalWidth: el.width,
        physicalHeight: el.height,
        cssWidth: rect.width,
        cssHeight: rect.height,
        dpr,
      };
    });

    // Timeline should have hi-DPI scaling
    // Physical dimensions should be approximately CSS dimensions * DPR
    const expectedWidth = Math.floor(timelineInfo.cssWidth * timelineInfo.dpr);
    const expectedHeight = Math.floor(timelineInfo.cssHeight * timelineInfo.dpr);

    // Allow tolerance for rounding
    expect(Math.abs(timelineInfo.physicalWidth - expectedWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(timelineInfo.physicalHeight - expectedHeight)).toBeLessThanOrEqual(2);
  });

  test('HIDPI-004: placeholder should be rendered with hi-DPI scaling', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    // Get the viewer canvas in placeholder state
    const canvas = page.locator('.viewer-container canvas').first();
    await expect(canvas).toBeVisible();

    // Verify hi-DPI configuration is applied correctly
    const hiDpiInfo = await canvas.evaluate((el: HTMLCanvasElement) => {
      const dpr = window.devicePixelRatio || 1;
      const ctx = el.getContext('2d');
      if (!ctx) return { valid: false };

      // Get computed CSS dimensions
      const computedStyle = getComputedStyle(el);
      const cssWidth = parseFloat(computedStyle.width) || el.offsetWidth;
      const cssHeight = parseFloat(computedStyle.height) || el.offsetHeight;

      // Sample center area where text should be
      const centerX = el.width / 2;
      const centerY = el.height / 2;
      const size = 50;

      let hasTextPixels = false;
      try {
        const imageData = ctx.getImageData(
          Math.floor(centerX - size / 2),
          Math.floor(centerY - size / 2),
          size,
          size
        );

        // Check if there are any non-background pixels (text)
        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          if (r !== undefined && g !== undefined && b !== undefined) {
            if (r > 50 || g > 50 || b > 50) {
              hasTextPixels = true;
              break;
            }
          }
        }
      } catch {
        // getImageData may fail in some test environments
      }

      return {
        valid: true,
        dpr,
        physicalWidth: el.width,
        physicalHeight: el.height,
        cssWidth,
        cssHeight,
        hasTextPixels,
        // Verify physical dimensions are scaled by DPR
        isProperlyScaled: Math.abs(el.width - cssWidth * dpr) <= 1 &&
                          Math.abs(el.height - cssHeight * dpr) <= 1,
      };
    });

    expect(hiDpiInfo.valid).toBe(true);
    // Physical dimensions should be CSS dimensions * DPR (with small tolerance for rounding)
    expect(hiDpiInfo.isProperlyScaled).toBe(true);
    // Canvas should have rendered content
    expect(hiDpiInfo.hasTextPixels).toBe(true);
  });

  test('HIDPI-005: context transform should be reset after media load', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');

    const canvas = page.locator('.viewer-container canvas').first();
    await expect(canvas).toBeVisible();

    // Load media
    await loadVideoFile(page);

    // Verify the canvas context is usable and at correct dimensions
    const contextInfo = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d');
      if (!ctx) return { hasContext: false, transform: null };

      // Get current transform
      const transform = ctx.getTransform();
      return {
        hasContext: true,
        transform: {
          a: transform.a,
          b: transform.b,
          c: transform.c,
          d: transform.d,
          e: transform.e,
          f: transform.f,
        },
        canvasWidth: el.width,
        canvasHeight: el.height,
      };
    });

    expect(contextInfo.hasContext).toBe(true);
    // After loading media, transform should be identity (1, 0, 0, 1, 0, 0)
    if (contextInfo.transform) {
      expect(contextInfo.transform.a).toBe(1);
      expect(contextInfo.transform.d).toBe(1);
      expect(contextInfo.transform.e).toBe(0);
      expect(contextInfo.transform.f).toBe(0);
    }
  });
});
