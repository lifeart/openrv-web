import { chromium } from '@playwright/test';
import path from 'path';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', msg => {
  if (msg.text().includes('[HDR]') || msg.text().includes('[SessionMedia]'))
    console.log('CONSOLE:', msg.text());
});

await page.goto('http://localhost:5173/');
await page.waitForSelector('#app');
await page.waitForFunction(() => window.__OPENRV_TEST__ != null, { timeout: 5000 });

// Load EXR first
const exrPath = path.resolve('sample/test_hdr.exr');
const fileInput = page.locator('input[type="file"]').first();
await fileInput.setInputFiles(exrPath);
await page.waitForFunction(() => window.__OPENRV_TEST__?.getSessionState()?.hasMedia === true, undefined, { timeout: 10000 });
await page.waitForTimeout(2000);

let state = await page.evaluate(() => window.__OPENRV_TEST__?.getViewerState()?.histogramHDRActive);
console.log('After EXR: histogramHDRActive =', state);

// Now load SDR video
const videoPath = path.resolve('sample/2d56d82687b78171f50c496bab002bc18d53149b.mp4');
await fileInput.setInputFiles(videoPath);
await page.waitForTimeout(3000);

state = await page.evaluate(() => window.__OPENRV_TEST__?.getViewerState()?.histogramHDRActive);
console.log('After video: histogramHDRActive =', state);

let maxVal = await page.evaluate(() => window.__OPENRV_TEST__?.getViewerState()?.histogramMaxValue);
console.log('After video: histogramMaxValue =', maxVal);

await browser.close();
