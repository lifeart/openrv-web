import { test as base, expect, Page } from '@playwright/test';
import path from 'path';

// Sample file paths
export const SAMPLE_VIDEO = 'sample/2d56d82687b78171f50c496bab002bc18d53149b.mp4';
export const SAMPLE_IMAGE = 'sample/test_image.png';
export const SAMPLE_RV_SESSION = 'sample/test_session.rv';

// Types matching test-helper.ts
export interface SessionState {
  currentFrame: number;
  frameCount: number;
  inPoint: number;
  outPoint: number;
  isPlaying: boolean;
  loopMode: 'once' | 'loop' | 'pingpong';
  playDirection: number;
  volume: number;
  muted: boolean;
  fps: number;
  hasMedia: boolean;
  mediaType: string | null;
  mediaName: string | null;
  marks: number[];
  // A/B Compare state
  currentAB: 'A' | 'B';
  sourceAIndex: number;
  sourceBIndex: number;
  abCompareAvailable: boolean;
  syncPlayhead: boolean;
}

export interface ViewerState {
  zoom: number;
  panX: number;
  panY: number;
  wipeMode: 'off' | 'horizontal' | 'vertical' | 'quad';
  wipePosition: number;
  cropEnabled: boolean;
  channelMode: 'rgb' | 'red' | 'green' | 'blue' | 'alpha' | 'luminance';
  histogramVisible: boolean;
  histogramMode: 'rgb' | 'luminance' | 'separate';
  histogramLogScale: boolean;
  waveformVisible: boolean;
  waveformMode: 'luma' | 'rgb' | 'parade';
  vectorscopeVisible: boolean;
  vectorscopeZoom: number;
}

export interface ColorState {
  exposure: number;
  gamma: number;
  saturation: number;
  contrast: number;
  temperature: number;
  tint: number;
  brightness: number;
  hasLUT: boolean;
  lutIntensity: number;
}

export interface TransformState {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export interface PaintState {
  currentTool: 'pan' | 'pen' | 'eraser' | 'text';
  strokeColor: string;
  strokeWidth: number;
  brushType: 'circle' | 'gaussian';
  ghostMode: boolean;
  annotatedFrames: number[];
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Get session state from the app
 */
export async function getSessionState(page: Page): Promise<SessionState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getSessionState() ?? {
      currentFrame: 0,
      frameCount: 0,
      inPoint: 0,
      outPoint: 0,
      isPlaying: false,
      loopMode: 'loop',
      playDirection: 1,
      volume: 0.7,
      muted: false,
      fps: 24,
      hasMedia: false,
      mediaType: null,
      mediaName: null,
      marks: [],
      currentAB: 'A',
      sourceAIndex: 0,
      sourceBIndex: -1,
      abCompareAvailable: false,
      syncPlayhead: true,
    };
  });
}

/**
 * Get viewer state from the app
 */
export async function getViewerState(page: Page): Promise<ViewerState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getViewerState() ?? {
      zoom: 1,
      panX: 0,
      panY: 0,
      wipeMode: 'off',
      wipePosition: 0.5,
      cropEnabled: false,
      channelMode: 'rgb',
      histogramVisible: false,
      histogramMode: 'rgb',
      histogramLogScale: false,
      waveformVisible: false,
      waveformMode: 'luma',
      vectorscopeVisible: false,
      vectorscopeZoom: 1,
    };
  });
}

/**
 * Get color adjustment state from the app
 */
export async function getColorState(page: Page): Promise<ColorState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getColorState() ?? {
      exposure: 0,
      gamma: 1,
      saturation: 1,
      contrast: 1,
      temperature: 0,
      tint: 0,
      brightness: 0,
      hasLUT: false,
      lutIntensity: 1,
    };
  });
}

/**
 * Get transform state from the app
 */
export async function getTransformState(page: Page): Promise<TransformState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getTransformState() ?? {
      rotation: 0,
      flipH: false,
      flipV: false,
    };
  });
}

/**
 * Get paint/annotation state from the app
 */
export async function getPaintState(page: Page): Promise<PaintState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getPaintState() ?? {
      currentTool: 'pan',
      strokeColor: '#ff0000',
      strokeWidth: 4,
      brushType: 'circle',
      ghostMode: false,
      annotatedFrames: [],
      canUndo: false,
      canRedo: false,
    };
  });
}

/**
 * Wait for test helper to be available
 */
export async function waitForTestHelper(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(() => !!window.__OPENRV_TEST__, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// Test fixtures interface
interface AppFixtures {
  appPage: Page;
}

// Extended test with app fixtures
export const test = base.extend<AppFixtures>({
  appPage: async ({ page }, use) => {
    await page.goto('/');
    // Wait for app to be fully loaded
    await page.waitForSelector('#app');
    await page.waitForSelector('.viewer-canvas, canvas');
    await use(page);
  },
});

export { expect };

// Helper functions
export async function loadVideoFile(page: Page): Promise<void> {
  const filePath = path.resolve(process.cwd(), SAMPLE_VIDEO);

  // Get the file input
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Wait for video to load and render
  await page.waitForTimeout(1000);
}

export async function loadImageFile(page: Page): Promise<void> {
  const filePath = path.resolve(process.cwd(), SAMPLE_IMAGE);

  // Get the file input
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Wait for image to load and render
  await page.waitForTimeout(500);
}

export async function loadRvSession(page: Page): Promise<void> {
  const filePath = path.resolve(process.cwd(), SAMPLE_RV_SESSION);

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Wait for session to load
  await page.waitForTimeout(1000);
}

/**
 * Capture canvas pixel data as a base64 string for comparison
 */
export async function captureCanvasState(page: Page): Promise<string> {
  const canvas = page.locator('canvas').first();
  const dataUrl = await canvas.evaluate((el: HTMLCanvasElement) => {
    return el.toDataURL('image/png');
  });
  return dataUrl;
}

/**
 * Verify that canvas content changed between two states
 */
export function verifyCanvasChanged(before: string, after: string): boolean {
  return before !== after;
}

/**
 * Get the computed transform style of the canvas or viewer element
 */
export async function getCanvasTransform(page: Page): Promise<{ scale: number; translateX: number; translateY: number }> {
  const canvas = page.locator('canvas').first();
  const transform = await canvas.evaluate((el) => {
    const style = getComputedStyle(el);
    const matrix = style.transform;
    if (matrix === 'none') {
      return { scale: 1, translateX: 0, translateY: 0 };
    }
    // Parse matrix(a, b, c, d, tx, ty)
    const values = matrix.match(/matrix\(([^)]+)\)/)?.[1]?.split(',').map(v => parseFloat(v.trim()));
    if (values && values.length >= 6) {
      return {
        scale: values[0] || 1,
        translateX: values[4] || 0,
        translateY: values[5] || 0,
      };
    }
    return { scale: 1, translateX: 0, translateY: 0 };
  });
  return transform;
}

/**
 * Get current frame number from session (via DOM inspection)
 */
export async function getCurrentFrame(page: Page): Promise<number> {
  // Try to get frame from any element showing frame info
  const frameText = await page.evaluate(() => {
    // Look for frame display in the app
    const allText = document.body.innerText;
    const frameMatch = allText.match(/Frame:?\s*(\d+)/i);
    if (frameMatch) return parseInt(frameMatch[1] || '0', 10);
    // Try timeline text
    const timeMatch = allText.match(/(\d+)\s*\/\s*\d+/);
    if (timeMatch) return parseInt(timeMatch[1] || '0', 10);
    return 0;
  });
  return frameText;
}

/**
 * Sample canvas pixel colors at specific points
 */
export async function sampleCanvasPixels(page: Page, points: Array<{ x: number; y: number }>): Promise<Array<{ r: number; g: number; b: number; a: number }>> {
  const canvas = page.locator('canvas').first();
  const pixels = await canvas.evaluate((el: HTMLCanvasElement, pts: Array<{ x: number; y: number }>) => {
    const ctx = el.getContext('2d');
    if (!ctx) return pts.map(() => ({ r: 0, g: 0, b: 0, a: 0 }));

    return pts.map(pt => {
      const data = ctx.getImageData(pt.x, pt.y, 1, 1).data;
      return { r: data[0] || 0, g: data[1] || 0, b: data[2] || 0, a: data[3] || 0 };
    });
  }, points);
  return pixels;
}

/**
 * Check if canvas has non-black content (media loaded)
 */
export async function canvasHasContent(page: Page): Promise<boolean> {
  const canvas = page.locator('canvas').first();
  const hasContent = await canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext('2d');
    if (!ctx) return false;

    // Sample several points across the canvas
    const width = el.width;
    const height = el.height;
    const samplePoints = [
      { x: Math.floor(width / 4), y: Math.floor(height / 4) },
      { x: Math.floor(width / 2), y: Math.floor(height / 2) },
      { x: Math.floor(3 * width / 4), y: Math.floor(3 * height / 4) },
    ];

    for (const pt of samplePoints) {
      const data = ctx.getImageData(pt.x, pt.y, 1, 1).data;
      // Check if pixel is not black (any channel > 10)
      if ((data[0] || 0) > 10 || (data[1] || 0) > 10 || (data[2] || 0) > 10) {
        return true;
      }
    }
    return false;
  });
  return hasContent;
}

/**
 * Calculate average brightness of canvas
 */
export async function getCanvasBrightness(page: Page): Promise<number> {
  const canvas = page.locator('canvas').first();
  const brightness = await canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext('2d');
    if (!ctx) return 0;

    const width = el.width;
    const height = el.height;

    // Sample a grid of points
    const gridSize = 10;
    let totalBrightness = 0;
    let sampleCount = 0;

    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        const px = Math.floor((x + 0.5) * width / gridSize);
        const py = Math.floor((y + 0.5) * height / gridSize);
        const data = ctx.getImageData(px, py, 1, 1).data;
        // Calculate perceived brightness
        const brightness = 0.299 * (data[0] || 0) + 0.587 * (data[1] || 0) + 0.114 * (data[2] || 0);
        totalBrightness += brightness;
        sampleCount++;
      }
    }

    return totalBrightness / sampleCount;
  });
  return brightness;
}

/**
 * Get canvas dimensions
 */
export async function getCanvasDimensions(page: Page): Promise<{ width: number; height: number }> {
  const canvas = page.locator('canvas').first();
  const dims = await canvas.evaluate((el: HTMLCanvasElement) => ({
    width: el.width,
    height: el.height,
  }));
  return dims;
}

/**
 * Trigger export and capture the exported image data
 * Returns the download data as base64
 */
export async function exportFrame(page: Page, format: 'png' | 'jpeg' | 'webp' = 'png'): Promise<{ data: Buffer; filename: string }> {
  // Set up download handler before triggering export
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

  // Trigger export via keyboard shortcut (Ctrl+S for PNG)
  await page.keyboard.press('Control+s');

  const download = await downloadPromise;
  const filename = download.suggestedFilename();
  const readStream = await download.createReadStream();

  // Read the download data
  const chunks: Buffer[] = [];
  for await (const chunk of readStream) {
    chunks.push(Buffer.from(chunk));
  }
  const data = Buffer.concat(chunks);

  return { data, filename };
}

/**
 * Export with specific format using the export dropdown
 */
export async function exportFrameWithFormat(page: Page, format: 'png' | 'jpeg' | 'webp', includeAnnotations: boolean = true): Promise<Buffer> {
  // Set up download handler
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

  // Click export button
  const exportButton = page.locator('button:has-text("Export")').first();
  await exportButton.click();
  await page.waitForTimeout(100);

  // Select format
  const formatButton = page.locator(`button:has-text("${format.toUpperCase()}")`).first();
  if (await formatButton.isVisible()) {
    await formatButton.click();
  }

  const download = await downloadPromise;
  const readStream = await download.createReadStream();

  const chunks: Buffer[] = [];
  for await (const chunk of readStream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Compare two image buffers and return whether they are different
 */
export function imagesAreDifferent(img1: Buffer, img2: Buffer): boolean {
  if (img1.length !== img2.length) return true;
  return !img1.equals(img2);
}

/**
 * Get app state via the session serializer
 */
export async function getAppState(page: Page): Promise<{
  currentFrame: number;
  isPlaying: boolean;
  inPoint: number;
  outPoint: number;
  loopMode: string;
  volume: number;
  muted: boolean;
}> {
  const state = await page.evaluate(() => {
    // Access the app instance through the window (if exposed)
    const app = (window as unknown as { __openrv_app__?: { session: { currentFrame: number; isPlaying: boolean; inPoint: number; outPoint: number; loopMode: string; volume: number; muted: boolean } } }).__openrv_app__;
    if (app?.session) {
      return {
        currentFrame: app.session.currentFrame,
        isPlaying: app.session.isPlaying,
        inPoint: app.session.inPoint,
        outPoint: app.session.outPoint,
        loopMode: app.session.loopMode,
        volume: app.session.volume,
        muted: app.session.muted,
      };
    }
    return {
      currentFrame: 0,
      isPlaying: false,
      inPoint: 0,
      outPoint: 0,
      loopMode: 'loop',
      volume: 1,
      muted: false,
    };
  });
  return state;
}

/**
 * Verify video frame changed by checking visual difference
 * Uses screenshot comparison instead of canvas pixel access
 */
export async function captureViewerScreenshot(page: Page): Promise<Buffer> {
  const canvas = page.locator('canvas').first();
  const screenshot = await canvas.screenshot();
  return screenshot;
}

/**
 * Compare screenshots with tolerance for minor differences
 */
export function screenshotsMatch(img1: Buffer, img2: Buffer, tolerance: number = 0): boolean {
  if (tolerance === 0) {
    return img1.equals(img2);
  }
  // For tolerance > 0, we'd need image comparison library
  // For now, exact match
  return img1.equals(img2);
}

// Tab selectors
export const TABS = {
  view: '[data-tab="view"], button:has-text("View")',
  color: '[data-tab="color"], button:has-text("Color")',
  effects: '[data-tab="effects"], button:has-text("Effects")',
  transform: '[data-tab="transform"], button:has-text("Transform")',
  annotate: '[data-tab="annotate"], button:has-text("Annotate")',
};

// Common selectors
export const SELECTORS = {
  canvas: 'canvas',
  timeline: '.timeline',
  headerBar: '.header-bar',
  tabBar: '.tab-bar',
  contextToolbar: '.context-toolbar',
  playButton: 'button[title*="Play"], button:has-text("Play"), .play-button',
  pauseButton: 'button[title*="Pause"], button:has-text("Pause")',
  volumeControl: '.volume-control',
  exportButton: 'button[title*="Export"], .export-button',
  helpButton: 'button[title*="Help"], button:has-text("?")',
  fileInput: 'input[type="file"]',
};

// Helper to click a tab
export async function clickTab(page: Page, tabName: 'view' | 'color' | 'effects' | 'transform' | 'annotate'): Promise<void> {
  const tabTexts: Record<string, string> = {
    view: 'View',
    color: 'Color',
    effects: 'Effects',
    transform: 'Transform',
    annotate: 'Annotate',
  };

  await page.click(`button:has-text("${tabTexts[tabName]}")`);
  await page.waitForTimeout(100);
}

// Helper to get canvas element
export async function getCanvas(page: Page): Promise<ReturnType<Page['locator']>> {
  return page.locator('canvas').first();
}

// Helper to perform drag operation on canvas
export async function dragOnCanvas(
  page: Page,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): Promise<void> {
  const canvas = await getCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');

  const actualStartX = box.x + startX;
  const actualStartY = box.y + startY;
  const actualEndX = box.x + endX;
  const actualEndY = box.y + endY;

  await page.mouse.move(actualStartX, actualStartY);
  await page.mouse.down();
  await page.mouse.move(actualEndX, actualEndY);
  await page.mouse.up();
}

// Helper to draw a stroke on canvas
export async function drawStroke(
  page: Page,
  points: Array<{ x: number; y: number }>
): Promise<void> {
  const canvas = await getCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');

  if (points.length < 2) return;

  const [start, ...rest] = points;
  await page.mouse.move(box.x + start!.x, box.y + start!.y);
  await page.mouse.down();

  for (const point of rest) {
    await page.mouse.move(box.x + point.x, box.y + point.y);
  }

  await page.mouse.up();
}

// Helper to get current frame display value
export async function getCurrentFrameDisplay(page: Page): Promise<string> {
  const frameDisplay = page.locator('.frame-display, [class*="frame"]').first();
  return await frameDisplay.textContent() || '';
}

// Helper to wait for media to load
export async function waitForMediaLoad(page: Page): Promise<void> {
  // Wait for either video element or image to be present
  await page.waitForFunction(() => {
    const videos = document.querySelectorAll('video');
    const images = document.querySelectorAll('img');
    return videos.length > 0 || images.length > 0;
  }, { timeout: 10000 }).catch(() => {
    // Media might be rendered directly to canvas without video/img elements
  });
  await page.waitForTimeout(300);
}

// Helper to check if slider exists and get its value
export async function getSliderValue(page: Page, label: string): Promise<number> {
  const slider = page.locator(`input[type="range"]`).filter({ hasText: label });
  const value = await slider.inputValue();
  return parseFloat(value);
}

// Helper to set slider value
export async function setSliderValue(page: Page, selector: string, value: number): Promise<void> {
  const slider = page.locator(selector);
  await slider.fill(String(value));
  await slider.dispatchEvent('input');
  await slider.dispatchEvent('change');
}

// Helper to verify button state
export async function isButtonActive(page: Page, buttonText: string): Promise<boolean> {
  const button = page.locator(`button:has-text("${buttonText}")`);
  const className = await button.getAttribute('class') || '';
  return className.includes('active') || className.includes('selected');
}

// Export type for page with loaded media
export type AppPageWithMedia = Page;
