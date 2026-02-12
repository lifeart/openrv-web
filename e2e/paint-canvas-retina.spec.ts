import { test as baseTest, expect, type Page } from '@playwright/test';
import {
  loadVideoFile,
  loadImageFile,
  loadExrFile,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Paint Canvas Retina/Hi-DPI Tests
 *
 * Verifies that the annotation (paint) canvas uses DPR-scaled physical
 * dimensions so annotations render at retina quality, matching the GL canvas.
 * Tests run at both DPR=1 (standard) and DPR=2 (retina) to catch regressions.
 */

/**
 * Draw a diagonal stroke across the center of the viewer canvas.
 * Switches to annotate tab + pen tool, draws, then verifies the stroke was recorded.
 */
async function drawStrokeOnPage(page: Page): Promise<void> {
  await page.click('button[data-tab-id="annotate"]');
  await page.waitForTimeout(200);
  await page.keyboard.press('p');
  await page.waitForTimeout(100);

  const paintCanvas = page.locator('canvas[data-testid="viewer-paint-canvas"]');
  const box = await paintCanvas.boundingBox();
  if (!box) throw new Error('Paint canvas not found');

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

    // Pick the active render canvas by data-testid: prefer WebGPU blit > GL > image
    const renderCanvas = [blitCanvas, glCanvas, imageCanvas].find(
      c => c && c.style.display !== 'none' && c.width > 0,
    ) ?? null;
    const renderRect = renderCanvas?.getBoundingClientRect();

    return {
      dpr,
      paint: {
        bufferWidth: paintCanvas.width,
        bufferHeight: paintCanvas.height,
        cssWidth: paintCanvas.style.width,
        cssHeight: paintCanvas.style.height,
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

    // At DPR=1: buffer dimensions should equal CSS dimensions
    expect(info!.paint.bufferWidth).toBeCloseTo(info!.paint.rectWidth, 0);
    expect(info!.paint.bufferHeight).toBeCloseTo(info!.paint.rectHeight, 0);
  });

  baseTest('PAINT-RETINA-002: paint canvas visual area matches render canvas', async ({ page }) => {
    const info = await getPaintCanvasInfo(page);
    expect(info).not.toBeNull();

    if (info!.render) {
      expect(Math.abs(info!.paint.rectWidth - info!.render.rectWidth)).toBeLessThanOrEqual(1);
      expect(Math.abs(info!.paint.rectHeight - info!.render.rectHeight)).toBeLessThanOrEqual(1);
    }
  });

  baseTest('PAINT-RETINA-003: pixel density ratio matches DPR', async ({ page }) => {
    const info = await getPaintCanvasInfo(page);
    expect(info).not.toBeNull();

    const widthRatio = info!.paint.bufferWidth / info!.paint.rectWidth;
    const heightRatio = info!.paint.bufferHeight / info!.paint.rectHeight;

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

    // Buffer should be 2x the CSS rect
    expect(info!.paint.bufferWidth).toBeCloseTo(info!.paint.rectWidth * 2, 0);
    expect(info!.paint.bufferHeight).toBeCloseTo(info!.paint.rectHeight * 2, 0);

    // CSS dimensions must be set
    expect(info!.paint.cssWidth).not.toBe('');
    expect(info!.paint.cssHeight).not.toBe('');
  });

  baseTest('PAINT-RETINA-011: paint canvas has 2x buffer after video load', async () => {
    await loadVideoFile(retinaPage);

    const info = await getPaintCanvasInfo(retinaPage);
    expect(info).not.toBeNull();
    expect(info!.dpr).toBe(2);

    // Buffer should be 2x the CSS rect
    expect(info!.paint.bufferWidth).toBeCloseTo(info!.paint.rectWidth * 2, 0);
    expect(info!.paint.bufferHeight).toBeCloseTo(info!.paint.rectHeight * 2, 0);
  });

  baseTest('PAINT-RETINA-012: paint canvas has 2x buffer after image load', async () => {
    await loadImageFile(retinaPage);

    const info = await getPaintCanvasInfo(retinaPage);
    expect(info).not.toBeNull();
    expect(info!.dpr).toBe(2);

    expect(info!.paint.bufferWidth).toBeCloseTo(info!.paint.rectWidth * 2, 0);
    expect(info!.paint.bufferHeight).toBeCloseTo(info!.paint.rectHeight * 2, 0);
  });

  baseTest('PAINT-RETINA-013: paint canvas visual area matches render canvas at DPR=2', async () => {
    await loadVideoFile(retinaPage);

    const info = await getPaintCanvasInfo(retinaPage);
    expect(info).not.toBeNull();

    if (info!.render) {
      // Both canvases should cover the same visual area
      expect(Math.abs(info!.paint.rectWidth - info!.render.rectWidth)).toBeLessThanOrEqual(1);
      expect(Math.abs(info!.paint.rectHeight - info!.render.rectHeight)).toBeLessThanOrEqual(1);
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

    // Draw a stroke across the canvas
    const paintCanvas = retinaPage.locator('canvas[data-testid="viewer-paint-canvas"]');
    const box = await paintCanvas.boundingBox();
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
    expect(infoAfter!.paint.bufferWidth).toBeCloseTo(infoAfter!.paint.rectWidth * 2, 0);
    expect(infoAfter!.paint.bufferHeight).toBeCloseTo(infoAfter!.paint.rectHeight * 2, 0);
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
    await loadExrFile(page);

    // Capture before drawing
    const before = await captureViewerScreenshot(page);

    // Draw a stroke
    await drawStrokeOnPage(page);

    // Capture after drawing — annotations must be visible
    const after = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  baseTest('PAINT-HDR-002: paint canvas overlays render canvas for HDR content', async ({ page }) => {
    await loadExrFile(page);

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
    await loadExrFile(page);

    const before = await captureViewerScreenshot(page);
    await drawStrokeOnPage(page);
    const after = await captureViewerScreenshot(page);

    // Annotations must be visible even on HDR content at retina DPR
    expect(imagesAreDifferent(before, after)).toBe(true);

    // Verify retina dimensions are maintained
    const info = await getPaintCanvasInfo(page);
    expect(info).not.toBeNull();
    expect(info!.dpr).toBe(2);
    expect(info!.paint.bufferWidth).toBeCloseTo(info!.paint.rectWidth * 2, 0);
    expect(info!.paint.bufferHeight).toBeCloseTo(info!.paint.rectHeight * 2, 0);

    await page.close();
  });
});
