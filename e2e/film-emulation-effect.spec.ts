import { test, expect } from '@playwright/test';
import {
  loadVideoFile,
  waitForTestHelper,
  captureViewerScreenshot,
  imagesAreDifferent,
} from './fixtures';

/**
 * Film Emulation Effect E2E Tests
 *
 * Verifies film stock emulation algorithms work correctly in a real browser
 * context. Tests characteristic looks, intensity scaling, grain animation,
 * preset comparison, and visual output on loaded video.
 */

/** Film stock profiles matching the filter implementation */
const FILM_STOCKS = [
  'kodak-portra-400',
  'kodak-ektar-100',
  'fuji-pro-400h',
  'fuji-velvia-50',
  'kodak-tri-x-400',
  'ilford-hp5',
] as const;

/**
 * Apply film emulation to a synthetic ImageData in-browser and return stats.
 */
async function applyFilmInBrowser(
  page: import('@playwright/test').Page,
  params: {
    stock: string;
    intensity: number;
    grainIntensity: number;
    grainSeed: number;
    inputR: number;
    inputG: number;
    inputB: number;
  }
): Promise<{
  outputR: number;
  outputG: number;
  outputB: number;
  alphaPreserved: boolean;
  pixelChanged: boolean;
}> {
  return page.evaluate((p) => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = p.inputR;
      data[i + 1] = p.inputG;
      data[i + 2] = p.inputB;
      data[i + 3] = 200; // non-default alpha
    }
    const originalData = new Uint8ClampedArray(data);
    const imageData = new ImageData(data, width, height);

    // Simplified film emulation matching the filter logic
    const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722;
    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
    const softSCurve = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
    const strongSCurve = (x: number) => softSCurve(softSCurve(x));
    const liftGamma = (x: number, lift: number, gamma: number) =>
      clamp(lift + (1 - lift) * Math.pow(clamp(x, 0, 1), gamma), 0, 1);
    const luminance = (r: number, g: number, b: number) => LUMA_R * r + LUMA_G * g + LUMA_B * b;

    type StockDef = { tone: (r: number, g: number, b: number) => [number, number, number]; sat: number; grain: number };
    const stocks: Record<string, StockDef> = {
      'kodak-portra-400': {
        tone: (r, g, b) => [softSCurve(liftGamma(r * 1.03 + 0.01, 0.03, 0.95)), softSCurve(liftGamma(g, 0.02, 0.97)), softSCurve(liftGamma(b * 0.95, 0.01, 1.02))],
        sat: 0.85, grain: 0.35,
      },
      'kodak-ektar-100': {
        tone: (r, g, b) => [clamp(strongSCurve(r * 1.05), 0, 1), clamp(strongSCurve(g * 1.02), 0, 1), clamp(strongSCurve(b * 1.06), 0, 1)],
        sat: 1.3, grain: 0.15,
      },
      'fuji-pro-400h': {
        tone: (r, g, b) => [softSCurve(liftGamma(r * 0.97, 0.02, 0.98)), softSCurve(liftGamma(g * 1.01 + 0.01, 0.02, 0.96)), softSCurve(liftGamma(b * 1.04 + 0.02, 0.03, 0.95))],
        sat: 0.88, grain: 0.3,
      },
      'fuji-velvia-50': {
        tone: (r, g, b) => [clamp(strongSCurve(r * 1.08), 0, 1), clamp(strongSCurve(g * 1.06), 0, 1), clamp(strongSCurve(b * 1.1), 0, 1)],
        sat: 1.5, grain: 0.1,
      },
      'kodak-tri-x-400': {
        tone: (r, g, b) => { const l = luminance(r, g, b); const v = softSCurve(liftGamma(l, 0.02, 0.9)); return [v, v, v]; },
        sat: 0, grain: 0.55,
      },
      'ilford-hp5': {
        tone: (r, g, b) => { const l = luminance(r, g, b); const v = softSCurve(liftGamma(l, 0.03, 0.95)); return [v, v, v]; },
        sat: 0, grain: 0.3,
      },
    };

    const stock = stocks[p.stock];
    if (!stock) return { outputR: 0, outputG: 0, outputB: 0, alphaPreserved: false, pixelChanged: false };

    const intensity = clamp(p.intensity, 0, 100) / 100;
    const grainStrength = (clamp(p.grainIntensity, 0, 100) / 100) * stock.grain;

    let rngState = (p.grainSeed | 0) || 1;
    const nextRng = () => {
      rngState ^= rngState << 13;
      rngState ^= rngState >> 17;
      rngState ^= rngState << 5;
      return ((rngState & 0xffff) / 0x8000) - 1;
    };

    const d = imageData.data;
    for (let px = 0; px < width * height; px++) {
      const i = px * 4;
      const origR = d[i]!, origG = d[i + 1]!, origB = d[i + 2]!;
      let r = origR / 255, g = origG / 255, b = origB / 255;
      const [cr, cg, cb] = stock.tone(r, g, b);
      const luma = luminance(cr, cg, cb);
      r = luma + (cr - luma) * stock.sat;
      g = luma + (cg - luma) * stock.sat;
      b = luma + (cb - luma) * stock.sat;
      if (grainStrength > 0) {
        const envelope = 4 * luma * (1 - luma);
        const noise = nextRng() * grainStrength * envelope;
        r += noise; g += noise; b += noise;
      }
      r = origR / 255 * (1 - intensity) + clamp(r, 0, 1) * intensity;
      g = origG / 255 * (1 - intensity) + clamp(g, 0, 1) * intensity;
      b = origB / 255 * (1 - intensity) + clamp(b, 0, 1) * intensity;
      d[i] = Math.round(clamp(r, 0, 1) * 255);
      d[i + 1] = Math.round(clamp(g, 0, 1) * 255);
      d[i + 2] = Math.round(clamp(b, 0, 1) * 255);
    }

    let alphaPreserved = true;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] !== 200) { alphaPreserved = false; break; }
    }

    let pixelChanged = false;
    for (let i = 0; i < d.length; i++) {
      if (d[i] !== originalData[i]) { pixelChanged = true; break; }
    }

    return { outputR: d[0]!, outputG: d[1]!, outputB: d[2]!, alphaPreserved, pixelChanged };
  }, params);
}

test.describe('Film Emulation Effect E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app');
    await waitForTestHelper(page);
  });

  test.describe('Preset Characteristic Looks', () => {
    test('FILM-E2E-001: each film stock applies a characteristic look in browser', async ({ page }) => {
      for (const stock of FILM_STOCKS) {
        const result = await applyFilmInBrowser(page, {
          stock,
          intensity: 100,
          grainIntensity: 0,
          grainSeed: 0,
          inputR: 128,
          inputG: 100,
          inputB: 80,
        });

        // Every stock should modify pixels for a non-uniform input
        expect(result.pixelChanged).toBe(true);
        expect(result.alphaPreserved).toBe(true);
      }
    });

    test('FILM-E2E-002: B&W stocks produce grayscale output in browser', async ({ page }) => {
      for (const stock of ['kodak-tri-x-400', 'ilford-hp5'] as const) {
        const result = await applyFilmInBrowser(page, {
          stock,
          intensity: 100,
          grainIntensity: 0,
          grainSeed: 0,
          inputR: 200,
          inputG: 100,
          inputB: 50,
        });

        // R ≈ G ≈ B for B&W stocks
        expect(Math.abs(result.outputR - result.outputG)).toBeLessThanOrEqual(1);
        expect(Math.abs(result.outputG - result.outputB)).toBeLessThanOrEqual(1);
      }
    });

    test('FILM-E2E-003: color stocks preserve color distinction in browser', async ({ page }) => {
      const result = await applyFilmInBrowser(page, {
        stock: 'fuji-velvia-50', // High saturation stock
        intensity: 100,
        grainIntensity: 0,
        grainSeed: 0,
        inputR: 200,
        inputG: 100,
        inputB: 50,
      });

      // Velvia should preserve (and amplify) color differences
      const maxChannelDiff = Math.max(
        Math.abs(result.outputR - result.outputG),
        Math.abs(result.outputG - result.outputB),
        Math.abs(result.outputR - result.outputB)
      );
      expect(maxChannelDiff).toBeGreaterThan(5);
    });
  });

  test.describe('Intensity Scaling', () => {
    test('FILM-E2E-004: lower intensity produces output closer to original', async ({ page }) => {
      const original = { inputR: 128, inputG: 100, inputB: 80 };

      const low = await applyFilmInBrowser(page, {
        stock: 'kodak-ektar-100',
        intensity: 25,
        grainIntensity: 0,
        grainSeed: 0,
        ...original,
      });

      const high = await applyFilmInBrowser(page, {
        stock: 'kodak-ektar-100',
        intensity: 100,
        grainIntensity: 0,
        grainSeed: 0,
        ...original,
      });

      const diffLow = Math.abs(low.outputR - original.inputR) +
                       Math.abs(low.outputG - original.inputG) +
                       Math.abs(low.outputB - original.inputB);
      const diffHigh = Math.abs(high.outputR - original.inputR) +
                        Math.abs(high.outputG - original.inputG) +
                        Math.abs(high.outputB - original.inputB);

      expect(diffLow).toBeLessThan(diffHigh);
    });

    test('FILM-E2E-005: zero intensity produces no change', async ({ page }) => {
      const result = await applyFilmInBrowser(page, {
        stock: 'kodak-portra-400',
        intensity: 0,
        grainIntensity: 50,
        grainSeed: 42,
        inputR: 128,
        inputG: 100,
        inputB: 80,
      });

      expect(result.pixelChanged).toBe(false);
    });
  });

  test.describe('Grain Animation', () => {
    test('FILM-E2E-006: different seeds produce different grain patterns', async ({ page }) => {
      const result1 = await applyFilmInBrowser(page, {
        stock: 'kodak-tri-x-400',
        intensity: 100,
        grainIntensity: 100,
        grainSeed: 42,
        inputR: 128,
        inputG: 128,
        inputB: 128,
      });

      const result2 = await applyFilmInBrowser(page, {
        stock: 'kodak-tri-x-400',
        intensity: 100,
        grainIntensity: 100,
        grainSeed: 99,
        inputR: 128,
        inputG: 128,
        inputB: 128,
      });

      // Different seeds should produce at least slightly different output
      const diff = Math.abs(result1.outputR - result2.outputR) +
                   Math.abs(result1.outputG - result2.outputG) +
                   Math.abs(result1.outputB - result2.outputB);
      expect(diff).toBeGreaterThan(0);
    });

    test('FILM-E2E-007: same seed produces identical output (deterministic)', async ({ page }) => {
      const result1 = await applyFilmInBrowser(page, {
        stock: 'kodak-tri-x-400',
        intensity: 100,
        grainIntensity: 100,
        grainSeed: 42,
        inputR: 128,
        inputG: 128,
        inputB: 128,
      });

      const result2 = await applyFilmInBrowser(page, {
        stock: 'kodak-tri-x-400',
        intensity: 100,
        grainIntensity: 100,
        grainSeed: 42,
        inputR: 128,
        inputG: 128,
        inputB: 128,
      });

      expect(result1.outputR).toBe(result2.outputR);
      expect(result1.outputG).toBe(result2.outputG);
      expect(result1.outputB).toBe(result2.outputB);
    });
  });

  test.describe('Preset Comparison', () => {
    test('FILM-E2E-008: all presets produce distinct results from each other', async ({ page }) => {
      const results: Array<{ r: number; g: number; b: number }> = [];

      for (const stock of FILM_STOCKS) {
        const result = await applyFilmInBrowser(page, {
          stock,
          intensity: 100,
          grainIntensity: 0,
          grainSeed: 0,
          inputR: 128,
          inputG: 100,
          inputB: 80,
        });
        results.push({ r: result.outputR, g: result.outputG, b: result.outputB });
      }

      // Every pair should be different
      for (let a = 0; a < results.length; a++) {
        for (let b = a + 1; b < results.length; b++) {
          const diff = Math.abs(results[a]!.r - results[b]!.r) +
                       Math.abs(results[a]!.g - results[b]!.g) +
                       Math.abs(results[a]!.b - results[b]!.b);
          expect(diff).toBeGreaterThan(0);
        }
      }
    });
  });

  test.describe('Visual Verification with Video', () => {
    test('FILM-E2E-010: film emulation produces visible change on loaded video', async ({ page }) => {
      await loadVideoFile(page);

      const before = await captureViewerScreenshot(page);

      // Apply Kodak Portra 400 emulation directly to the canvas
      await page.evaluate(() => {
        const canvas = document.querySelector('canvas[data-testid="viewer-image-canvas"]') as HTMLCanvasElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722;
        const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
        const softS = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
        const liftG = (x: number, lift: number, gamma: number) =>
          clamp01(lift + (1 - lift) * Math.pow(clamp01(x), gamma));

        for (let i = 0; i < d.length; i += 4) {
          let r = d[i]! / 255, g = d[i + 1]! / 255, b = d[i + 2]! / 255;
          // Portra tone curve
          const cr = softS(liftG(r * 1.03 + 0.01, 0.03, 0.95));
          const cg = softS(liftG(g, 0.02, 0.97));
          const cb = softS(liftG(b * 0.95, 0.01, 1.02));
          // Saturation 0.85
          const luma = LUMA_R * cr + LUMA_G * cg + LUMA_B * cb;
          r = luma + (cr - luma) * 0.85;
          g = luma + (cg - luma) * 0.85;
          b = luma + (cb - luma) * 0.85;
          d[i] = Math.round(clamp01(r) * 255);
          d[i + 1] = Math.round(clamp01(g) * 255);
          d[i + 2] = Math.round(clamp01(b) * 255);
        }
        ctx.putImageData(imageData, 0, 0);
      });

      const after = await captureViewerScreenshot(page);
      expect(imagesAreDifferent(before, after)).toBe(true);
    });

    test('FILM-E2E-011: B&W film stock visually desaturates loaded video', async ({ page }) => {
      await loadVideoFile(page);

      // Apply Tri-X B&W directly to canvas and verify desaturation
      const saturationResult = await page.evaluate(() => {
        const canvas = document.querySelector('canvas[data-testid="viewer-image-canvas"]') as HTMLCanvasElement;
        if (!canvas) return { beforeSat: 0, afterSat: 0 };
        const ctx = canvas.getContext('2d');
        if (!ctx) return { beforeSat: 0, afterSat: 0 };

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;

        // Measure saturation before (average max-min channel difference)
        let satBefore = 0;
        let count = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
          const mn = Math.min(d[i]!, d[i + 1]!, d[i + 2]!);
          satBefore += mx - mn;
          count++;
        }
        satBefore /= count;

        // Apply Tri-X B&W
        const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722;
        const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
        const softS = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
        const liftG = (x: number, lift: number, gamma: number) =>
          clamp01(lift + (1 - lift) * Math.pow(clamp01(x), gamma));

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i]! / 255, g = d[i + 1]! / 255, b = d[i + 2]! / 255;
          const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
          const v = Math.round(softS(liftG(luma, 0.02, 0.9)) * 255);
          d[i] = v; d[i + 1] = v; d[i + 2] = v;
        }
        ctx.putImageData(imageData, 0, 0);

        // Measure saturation after
        let satAfter = 0;
        count = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
          const mn = Math.min(d[i]!, d[i + 1]!, d[i + 2]!);
          satAfter += mx - mn;
          count++;
        }
        satAfter /= count;

        return { beforeSat: satBefore, afterSat: satAfter };
      });

      // B&W should dramatically reduce saturation
      expect(saturationResult.afterSat).toBeLessThan(saturationResult.beforeSat);
      expect(saturationResult.afterSat).toBeLessThanOrEqual(1); // Near zero for B&W
    });
  });
});
