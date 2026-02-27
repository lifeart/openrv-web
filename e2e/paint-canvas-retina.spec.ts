import { test as baseTest, expect, type Page } from '@playwright/test';
import path from 'path';
import {
  loadVideoFile,
  loadImageFile,
  waitForTestHelper,
  waitForMediaLoaded,
  captureViewerScreenshot,
  imagesAreDifferent,
  SAMPLE_EXR,
} from './fixtures';

/**
 * Paint Canvas Retina/Hi-DPI Tests
 *
 * Verifies that the annotation (paint) canvas uses DPR-scaled physical
 * dimensions so annotations render at retina quality, matching the GL canvas.
 * Tests run at both DPR=1 (standard) and DPR=2 (retina) to catch regressions.
 */

/**
 * Load an EXR file with a robust waiting strategy.
 * The shared loadExrFile uses waitForFrame(page, 1) which can race when the
 * frame is already at 1 before the polling starts. For single-frame EXR files,
 * waitForMediaLoaded is sufficient as the frame is guaranteed to be 1.
 */
async function loadExrFileRobust(page: Page): Promise<void> {
  const filePath = path.resolve(process.cwd(), SAMPLE_EXR);
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);
  await waitForMediaLoaded(page);
  // For a single-frame EXR, the first frame render triggers on load.
  // Give one animation frame for the GL pipeline to draw.
  await page.waitForTimeout(200);
}

/**
 * Draw a diagonal stroke across the center of the viewer canvas.
 * Switches to annotate tab + pen tool, draws, then verifies the stroke was recorded.
 *
 * Uses the canvas container for coordinates because the paint canvas may be
 * hidden (display: none) before any annotations are drawn, which causes
 * boundingBox() to return null.
 */
async function drawStrokeOnPage(page: Page): Promise<void> {
  await page.click('button[data-tab-id="annotate"]');
  await page.waitForTimeout(200);
  await page.keyboard.press('p');
  await page.waitForTimeout(100);

  // Use the canvas container for bounding box since the paint canvas starts
  // hidden and has pointer-events: none anyway.
  const container = page.locator('[data-testid="viewer-canvas-container"]');
  const box = await container.boundingBox();
  if (!box) throw new Error('Canvas container not found');

  const startX = box.x + box.width * 0.25;
  const startY = box.y + box.height * 0.25;
  const endX = box.x + box.width * 0.75;
  const endY = box.y + box.height * 0.75;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    await page.mouse.move(
      startX + (endX - startX) * t,
      startY + (endY - startY) * t,
    );
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
}

// Helper to get paint canvas info from page
async function getPaintCanvasInfo(page: Page) {
  return page.evaluate(() => {
    const dpr = window.devicePixelRatio || 1;
    const paintCanvas = document.querySelector('canvas[data-testid="viewer-paint-canvas"]') as HTMLCanvasElement | null;
    const glCanvas = document.querySelector('canvas[data-testid="viewer-gl-canvas"]') as HTMLCanvasElement | null;
    const blitCanvas = document.querySelector('canvas[data-testid="viewer-webgpu-blit-canvas"]') as HTMLCanvasElement | null;
    const imageCanvas = document.querySelector('canvas[data-testid="viewer-image-canvas"]') as HTMLCanvasElement | null;

    if (!paintCanvas) return null;

    const paintRect = paintCanvas.getBoundingClientRect();
    const isHidden = paintCanvas.style.display === 'none';

    // When the paint canvas is hidden (display: none), getBoundingClientRect()
    // returns 0. Derive logical dimensions from CSS style instead.
    const cssW = parseFloat(paintCanvas.style.width) || 0;
    const cssH = parseFloat(paintCanvas.style.height) || 0;
    const logicalWidth = isHidden ? cssW : paintRect.width;
    const logicalHeight = isHidden ? cssH : paintRect.height;

    // Pick the active render canvas by data-testid: prefer WebGPU blit > GL > image
    const renderCanvas = [blitCanvas, glCanvas, imageCanvas].find(
      c => c && c.style.display !== 'none' && c.width > 0,
    ) ?? null;
    const renderRect = renderCanvas?.getBoundingClientRect();

    return {
      dpr,
      isHidden,
      paint: {
        bufferWidth: paintCanvas.width,
        bufferHeight: paintCanvas.height,
        cssWidth: paintCanvas.style.width,
        cssHeight: paintCanvas.style.height,
        logicalWidth,
        logicalHeight,
        rectWidth: paintRect.width,
        rectHeight: paintRect.height,
      },
      render: renderRect ? {
        bufferWidth: renderCanvas!.width,
        bufferHeight: renderCanvas!.height,
        rectWidth: renderRect.width,
        rectHeight: renderRect.height,
      } : null,
    };
  });
}

// Standard DPR=1 tests
baseTest.describe('Paint Canvas Retina Support (DPR=1)', () => {
  baseTest.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadVideoFile(page);
  });

  baseTest('PAINT-RETINA-001: paint canvas has CSS sizing and DPR-scaled buffer', async ({ page }) => {
    const info = await getPaintCanvasInfo(page);
    expect(info).not.toBeNull();

    // CSS width/height must be explicitly set for proper overlay positioning
    expect(info!.paint.cssWidth).not.toBe('');
    expect(info!.paint.cssHeight).not.toBe('');

    // At DPR=1: buffer dimensions should equal logical (CSS) dimensions.
    // The paint canvas may be hidden (display: none) when no annotations exist,
    // so use logicalWidth/Height derived from CSS style.
    expect(info!.paint.bufferWidth).toBeCloseTo(info!.paint.logicalWidth, 0);
    expect(info!.paint.bufferHeight).toBeCloseTo(info!.paint.logicalHeight, 0);
  });

  baseTest('PAINT-RETINA-002: paint canvas visual area covers render canvas', async ({ page }) => {
    const info = await getPaintCanvasInfo(page);
    expect(info).not.toBeNull();

    if (info!.render) {
      // The paint canvas includes overdraw padding and is at least as large
      // as the render canvas so annotations can extend beyond the image area.
      expect(info!.paint.logicalWidth).toBeGreaterThanOrEqual(info!.render.rectWidth);
      expect(info!.paint.logicalHeight).toBeGreaterThanOrEqual(info!.render.rectHeight);
    }
  });

  baseTest('PAINT-RETINA-003: pixel density ratio matches DPR', async ({ page }) => {
    const info = await getPaintCanvasInfo(page);
    expect(info).not.toBeNull();

    // Use logicalWidth/Height (derived from CSS style) since the canvas
    // may be hidden (display: none) before any annotations are drawn.
    const widthRatio = info!.paint.bufferWidth / info!.paint.logicalWidth;
    const heightRatio = info!.paint.bufferHeight / info!.paint.logicalHeight;

    expect(widthRatio).toBeCloseTo(info!.dpr, 0);
    expect(heightRatio).toBeCloseTo(info!.dpr, 0);
  });
});

// Retina DPR=2 tests — use a dedicated browser context with deviceScaleFactor
baseTest.describe('Paint Canvas Retina Support (DPR=2)', () => {
  let retinaPage: Page;

  baseTest.beforeEach(async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    retinaPage = await context.newPage();
    await retinaPage.goto('/');
    await retinaPage.waitForSelector('#app');
    await waitForTestHelper(retinaPage);
  });

  baseTest.afterEach(async () => {
    await retinaPage.close();
  });

  baseTest('PAINT-RETINA-010: placeholder paint canvas has 2x buffer dimensions', async () => {
    // No media loaded — placeholder mode
    const info = await getPaintCanvasInfo(retinaPage);
    expect(info).not.toBeNull();
    expect(info!.dpr).toBe(2);

    // Buffer should be 2x the logical (CSS) dimensions.
    // Paint canvas may be hidden before annotations exist; use logicalWidth.
    expect(info!.paint.bufferWidth).toBeCloseTo(info!.paint.logicalWidth * 2, 0);
    expect(info!.paint.bufferHeight).toBeCloseTo(info!.paint.logicalHeight * 2, 0);

    // CSS dimensions must be set
    expect(info!.paint.cssWidth).not.toBe('');
    expect(info!.paint.cssHeight).not.toBe('');
  });

  baseTest('PAINT-RETINA-011: paint canvas has 2x buffer after video load', async () => {
    await loadVideoFile(retinaPage);

    const info = await getPaintCanvasInfo(retinaPage);
    expect(info).not.toBeNull();
    expect(info!.dpr).toBe(2);

    // Buffer should be 2x the logical (CSS) dimensions
    expect(info!.paint.bufferWidth).toBeCloseTo(info!.paint.logicalWidth * 2, 0);
    expect(info!.paint.bufferHeight).toBeCloseTo(info!.paint.logicalHeight * 2, 0);
  });

  baseTest('PAINT-RETINA-012: paint canvas has 2x buffer after image load', async () => {
    await loadImageFile(retinaPage);

    const info = await getPaintCanvasInfo(retinaPage);
    expect(info).not.toBeNull();
    expect(info!.dpr).toBe(2);

    expect(info!.paint.bufferWidth).toBeCloseTo(info!.paint.logicalWidth * 2, 0);
    expect(info!.paint.bufferHeight).toBeCloseTo(info!.paint.logicalHeight * 2, 0);
  });

  baseTest('PAINT-RETINA-013: paint canvas visual area covers render canvas at DPR=2', async () => {
    await loadVideoFile(retinaPage);

    const info = await getPaintCanvasInfo(retinaPage);
    expect(info).not.toBeNull();

    if (info!.render) {
      // Paint canvas includes overdraw padding and must be at least as large
      // as the render canvas so annotations can extend beyond the image area.
      expect(info!.paint.logicalWidth).toBeGreaterThanOrEqual(info!.render.rectWidth);
      expect(info!.paint.logicalHeight).toBeGreaterThanOrEqual(info!.render.rectHeight);
    }
  });

  baseTest('PAINT-RETINA-014: drawing a stroke covers correct area at DPR=2', async () => {
    await loadVideoFile(retinaPage);

    // Switch to annotate tab and select pen
    await retinaPage.click('button[data-tab-id="annotate"]');
    await retinaPage.waitForTimeout(200);
    await retinaPage.keyboard.press('p');
    await retinaPage.waitForTimeout(100);

    // Capture before screenshot
    const before = await captureViewerScreenshot(retinaPage);

    // Draw a stroke across the canvas (use canvas container since paint canvas
    // may be hidden before first annotation)
    const container = retinaPage.locator('[data-testid="viewer-canvas-container"]');
    const box = await container.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      // Draw a diagonal stroke across the center of the canvas
      const startX = box.x + box.width * 0.25;
      const startY = box.y + box.height * 0.25;
      const endX = box.x + box.width * 0.75;
      const endY = box.y + box.height * 0.75;

      await retinaPage.mouse.move(startX, startY);
      await retinaPage.mouse.down();
      // Move in steps for a visible stroke
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        await retinaPage.mouse.move(
          startX + (endX - startX) * t,
          startY + (endY - startY) * t,
        );
      }
      await retinaPage.mouse.up();
      await retinaPage.waitForTimeout(200);
    }

    // Capture after screenshot — should be different (stroke visible)
    const after = await captureViewerScreenshot(retinaPage);
    expect(before).not.toEqual(after);

    // Verify paint canvas still has correct retina dimensions after drawing
    const infoAfter = await getPaintCanvasInfo(retinaPage);
    expect(infoAfter).not.toBeNull();
    expect(infoAfter!.paint.bufferWidth).toBeCloseTo(infoAfter!.paint.logicalWidth * 2, 0);
    expect(infoAfter!.paint.bufferHeight).toBeCloseTo(infoAfter!.paint.logicalHeight * 2, 0);
  });
});

// HDR annotation visibility tests — ensure annotations actually appear on HDR content
baseTest.describe('Annotation Visibility on HDR Content', () => {
  baseTest.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  baseTest('PAINT-HDR-001: drawing on HDR EXR produces visible annotations', async ({ page }) => {
    await loadExrFileRobust(page);

    // Capture before drawing
    const before = await captureViewerScreenshot(page);

    // Draw a stroke
    await drawStrokeOnPage(page);

    // Capture after drawing — annotations must be visible
    const after = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  baseTest('PAINT-HDR-002: paint canvas overlays render canvas for HDR content', async ({ page }) => {
    await loadExrFileRobust(page);

    // Verify the paint canvas is positioned on top of all render canvases
    const zOrder = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="viewer-canvas-container"]');
      if (!container) return null;

      const children = Array.from(container.children) as HTMLElement[];
      const indexOf = (testid: string) =>
        children.findIndex(el => (el as HTMLCanvasElement).dataset?.testid === testid);

      const paintIdx = indexOf('viewer-paint-canvas');
      const glIdx = indexOf('viewer-gl-canvas');
      const imageIdx = indexOf('viewer-image-canvas');
      const blitIdx = indexOf('viewer-webgpu-blit-canvas');

      // Paint canvas must come after ALL render canvases in DOM order
      const renderIndices = [glIdx, imageIdx, blitIdx].filter(i => i >= 0);
      const lastRenderIdx = renderIndices.length > 0 ? Math.max(...renderIndices) : -1;

      return {
        paintIdx,
        glIdx,
        imageIdx,
        blitIdx,
        lastRenderIdx,
        paintIsAfterAllRenderCanvases: paintIdx > lastRenderIdx,
      };
    });

    expect(zOrder).not.toBeNull();
    // Paint canvas must come AFTER all render canvases (GL, image, WebGPU blit) in DOM order
    expect(zOrder!.paintIsAfterAllRenderCanvases).toBe(true);
  });

  baseTest('PAINT-HDR-003: annotations visible after drawing on SDR video', async ({ page }) => {
    await loadVideoFile(page);

    const before = await captureViewerScreenshot(page);
    await drawStrokeOnPage(page);
    const after = await captureViewerScreenshot(page);

    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  baseTest('PAINT-HDR-004: annotations visible after drawing on static image', async ({ page }) => {
    await loadImageFile(page);

    const before = await captureViewerScreenshot(page);
    await drawStrokeOnPage(page);
    const after = await captureViewerScreenshot(page);

    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  baseTest('PAINT-HDR-005: paint canvas stacking is correct with DPR=2 and HDR', async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
    await loadExrFileRobust(page);

    const before = await captureViewerScreenshot(page);
    await drawStrokeOnPage(page);
    const after = await captureViewerScreenshot(page);

    // Annotations must be visible even on HDR content at retina DPR
    expect(imagesAreDifferent(before, after)).toBe(true);

    // Verify retina dimensions are maintained
    const info = await getPaintCanvasInfo(page);
    expect(info).not.toBeNull();
    expect(info!.dpr).toBe(2);
    expect(info!.paint.bufferWidth).toBeCloseTo(info!.paint.logicalWidth * 2, 0);
    expect(info!.paint.bufferHeight).toBeCloseTo(info!.paint.logicalHeight * 2, 0);

    await page.close();
  });
});
