# Implementation Plan: Missing Features

This document outlines the implementation plan for verified missing features in OpenRV Web.

---

## Table of Contents

1. [Page Visibility Handling](#1-page-visibility-handling)
2. [1D LUT Support](#2-1d-lut-support)
3. [YCbCr Waveform Mode](#3-ycbcr-waveform-mode)
4. [Noise Reduction Filter](#4-noise-reduction-filter)
5. [Grayscale Toggle](#5-grayscale-toggle)
6. [Missing Frame Indicator](#6-missing-frame-indicator)
7. [Compare Modes (Onion Skin, Flicker, Blend)](#7-compare-modes)
8. [Watermark/Logo Overlay](#8-watermarklogo-overlay)

> **Note:** OTIO Import and EXR Decoding require external libraries (WebAssembly) and are deferred to a future phase.

---

## 1. Page Visibility Handling

### Description
Pause playback and reduce resource usage when the browser tab is hidden or the window loses focus.

### Files to Modify
- `src/App.ts` - Add visibility change listener
- `src/core/session/Session.ts` - Add pause/resume methods

### Algorithm

```typescript
// In App.ts constructor or init()
private setupVisibilityHandling(): void {
  // Track playback state before hiding
  let wasPlayingBeforeHide = false;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Tab hidden - pause if playing
      wasPlayingBeforeHide = this.session.isPlaying;
      if (wasPlayingBeforeHide) {
        this.session.pause();
      }
      // Reduce scope update frequency
      this.histogram.setPlaybackMode(true); // Use aggressive subsampling
      this.waveform.setPlaybackMode(true);
      this.vectorscope.setPlaybackMode(true);
    } else {
      // Tab visible - resume if was playing
      if (wasPlayingBeforeHide) {
        this.session.play();
      }
      // Restore scope quality
      if (!this.session.isPlaying) {
        this.histogram.setPlaybackMode(false);
        this.waveform.setPlaybackMode(false);
        this.vectorscope.setPlaybackMode(false);
      }
    }
  });

  // Optional: Also handle window blur/focus for multi-window scenarios
  window.addEventListener('blur', () => {
    // Could optionally pause here too, but less aggressive
  });
}
```

### Acceptance Criteria
- [ ] Playback pauses when tab becomes hidden
- [ ] Playback resumes automatically when tab becomes visible (if was playing)
- [ ] Scopes use reduced quality mode when tab is hidden
- [ ] Animation frame loop does not run when tab is hidden (browser default, verify)
- [ ] No memory leaks from event listeners (cleanup on dispose)

### E2E Tests

```typescript
// e2e/visibility-handling.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Page Visibility Handling', () => {
  test('VIS-001: playback pauses when tab is hidden', async ({ page, context }) => {
    await page.goto('/');
    await loadTestVideo(page);

    // Start playback
    await page.keyboard.press('Space');
    await expect(page.locator('[data-testid="play-button"]')).toHaveAttribute('data-playing', 'true');

    const frameBefore = await getViewerState(page).then(s => s.currentFrame);

    // Create new tab to hide current one
    const newPage = await context.newPage();
    await newPage.goto('about:blank');
    await newPage.waitForTimeout(500);

    // Switch back
    await page.bringToFront();

    // Playback should have been paused (frame should not have advanced much)
    const frameAfter = await getViewerState(page).then(s => s.currentFrame);
    // Allow for 1-2 frames of timing tolerance
    expect(Math.abs(frameAfter - frameBefore)).toBeLessThan(3);
  });

  test('VIS-002: playback resumes when tab becomes visible', async ({ page, context }) => {
    await page.goto('/');
    await loadTestVideo(page);

    // Start playback
    await page.keyboard.press('Space');

    // Hide tab
    const newPage = await context.newPage();
    await newPage.goto('about:blank');
    await newPage.waitForTimeout(200);

    // Return to original tab
    await page.bringToFront();
    await page.waitForTimeout(500);

    // Should be playing again
    await expect(page.locator('[data-testid="play-button"]')).toHaveAttribute('data-playing', 'true');
  });

  test('VIS-003: paused playback stays paused after visibility change', async ({ page, context }) => {
    await page.goto('/');
    await loadTestVideo(page);

    // Ensure NOT playing
    await expect(page.locator('[data-testid="play-button"]')).not.toHaveAttribute('data-playing', 'true');

    // Hide and show tab
    const newPage = await context.newPage();
    await newPage.goto('about:blank');
    await newPage.waitForTimeout(200);
    await page.bringToFront();

    // Should still NOT be playing
    await expect(page.locator('[data-testid="play-button"]')).not.toHaveAttribute('data-playing', 'true');
  });
});
```

---

## 2. 1D LUT Support

### Description
Support loading and applying 1D LUT files (.cube format with LUT_1D_SIZE).

### Files to Modify
- `src/color/LUTLoader.ts` - Add 1D LUT parsing
- `src/color/WebGLLUT.ts` - Add 1D LUT shader
- `src/ui/components/Viewer.ts` - Apply 1D LUT in pipeline

### Algorithm

```typescript
// In LUTLoader.ts
export interface LUT1D {
  type: '1d';
  size: number;
  data: Float32Array; // R, G, B interleaved: [R0, G0, B0, R1, G1, B1, ...]
  domain: { min: [number, number, number]; max: [number, number, number] };
}

export function parse1DLUT(content: string): LUT1D {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('LUT_1D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1]!, 10);
    } else if (line.startsWith('DOMAIN_MIN')) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      domainMin = [parts[0]!, parts[1]!, parts[2]!];
    } else if (line.startsWith('DOMAIN_MAX')) {
      const parts = line.split(/\s+/).slice(1).map(Number);
      domainMax = [parts[0]!, parts[1]!, parts[2]!];
    } else if (/^[\d.-]/.test(line)) {
      dataLines.push(line);
    }
  }

  if (!size) throw new Error('LUT_1D_SIZE not found');
  if (dataLines.length !== size) {
    throw new Error(`Expected ${size} data lines, got ${dataLines.length}`);
  }

  const data = new Float32Array(size * 3);
  for (let i = 0; i < size; i++) {
    const parts = dataLines[i]!.split(/\s+/).map(Number);
    data[i * 3] = parts[0]!;     // R
    data[i * 3 + 1] = parts[1]!; // G
    data[i * 3 + 2] = parts[2]!; // B
  }

  return { type: '1d', size, data, domain: { min: domainMin, max: domainMax } };
}

// GLSL shader for 1D LUT application
const LUT_1D_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform sampler2D u_lut1d;  // 1D texture (width = LUT size, height = 3 for R/G/B)
uniform int u_lutSize;
uniform vec3 u_domainMin;
uniform vec3 u_domainMax;

in vec2 v_texCoord;
out vec4 fragColor;

float apply1DLUT(float value, int channel) {
  // Normalize to domain
  float domainRange = u_domainMax[channel] - u_domainMin[channel];
  float normalized = (value - u_domainMin[channel]) / domainRange;
  normalized = clamp(normalized, 0.0, 1.0);

  // Sample LUT with linear interpolation
  float lutCoord = normalized * float(u_lutSize - 1);
  int idx0 = int(floor(lutCoord));
  int idx1 = min(idx0 + 1, u_lutSize - 1);
  float frac = lutCoord - float(idx0);

  float val0 = texelFetch(u_lut1d, ivec2(idx0, channel), 0).r;
  float val1 = texelFetch(u_lut1d, ivec2(idx1, channel), 0).r;

  return mix(val0, val1, frac);
}

void main() {
  vec4 color = texture(u_image, v_texCoord);

  fragColor = vec4(
    apply1DLUT(color.r, 0),
    apply1DLUT(color.g, 1),
    apply1DLUT(color.b, 2),
    color.a
  );
}`;
```

### Acceptance Criteria
- [ ] 1D .cube files load without error
- [ ] 1D LUTs apply correct per-channel color transformation
- [ ] DOMAIN_MIN/DOMAIN_MAX are respected
- [ ] Linear interpolation between LUT entries
- [ ] Works with both WebGL and CPU fallback
- [ ] Mixed 1D/3D LUT support (detect type automatically)

### E2E Tests

```typescript
// e2e/lut-1d.spec.ts
test.describe('1D LUT Support', () => {
  test('LUT1D-001: loads 1D cube file without error', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    // Open LUT file picker
    await page.click('[data-testid="lut-load-button"]');

    // Load test 1D LUT
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('test-assets/gamma_2.2.cube'); // 1D LUT file

    // Should apply without error
    await expect(page.locator('[data-testid="lut-name"]')).toContainText('gamma_2.2');
  });

  test('LUT1D-002: 1D LUT changes pixel values correctly', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    const beforeScreenshot = await captureViewerScreenshot(page);

    // Apply 1D gamma LUT
    await applyLUT(page, 'test-assets/gamma_2.2.cube');

    const afterScreenshot = await captureViewerScreenshot(page);

    // Image should be different (gamma curve applied)
    expect(imagesAreDifferent(beforeScreenshot, afterScreenshot)).toBe(true);
  });

  test('LUT1D-003: 1D LUT with custom domain applies correctly', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    // LUT with DOMAIN_MIN 0.1 0.1 0.1 and DOMAIN_MAX 0.9 0.9 0.9
    await applyLUT(page, 'test-assets/custom_domain_1d.cube');

    // Should clamp values outside domain
    await expect(page.locator('[data-testid="lut-active"]')).toBeVisible();
  });

  test('LUT1D-004: removing 1D LUT restores original image', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    const original = await captureViewerScreenshot(page);
    await applyLUT(page, 'test-assets/gamma_2.2.cube');

    // Remove LUT
    await page.click('[data-testid="lut-clear-button"]');

    const restored = await captureViewerScreenshot(page);
    expect(imagesMatch(original, restored)).toBe(true);
  });
});
```

---

## 3. YCbCr Waveform Mode

### Description
Add YCbCr (luma + chroma difference) mode to the waveform/parade scope.

### Files to Modify
- `src/ui/components/Waveform.ts` - Add YCbCr mode
- `src/scopes/WebGLScopes.ts` - Add YCbCr GPU computation

### Algorithm

```typescript
// YCbCr conversion (BT.709)
// Y  =  0.2126 * R + 0.7152 * G + 0.0722 * B
// Cb = -0.1146 * R - 0.3854 * G + 0.5000 * B + 0.5
// Cr =  0.5000 * R - 0.4542 * G - 0.0458 * B + 0.5

export type WaveformMode = 'luma' | 'rgb' | 'parade' | 'ycbcr';

interface YCbCrCoefficients {
  // BT.709 (HD)
  kr: 0.2126;
  kg: 0.7152;
  kb: 0.0722;
}

function rgbToYCbCr(r: number, g: number, b: number): [number, number, number] {
  const y  =  0.2126 * r + 0.7152 * g + 0.0722 * b;
  const cb = -0.1146 * r - 0.3854 * g + 0.5000 * b + 0.5;
  const cr =  0.5000 * r - 0.4542 * g - 0.0458 * b + 0.5;
  return [y, cb, cr];
}

// In Waveform.ts - renderYCbCr method
private renderYCbCr(data: Uint8ClampedArray, width: number, height: number): void {
  const scopeWidth = this.canvas.width;
  const scopeHeight = this.canvas.height;
  const thirdWidth = Math.floor(scopeWidth / 3);

  // Three columns: Y, Cb, Cr
  const yHistogram = new Uint32Array(scopeHeight);
  const cbHistogram = new Uint32Array(scopeHeight);
  const crHistogram = new Uint32Array(scopeHeight);

  // Sample pixels
  const step = Math.max(1, Math.floor((width * height) / this.maxSamples));

  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;

    const [y, cb, cr] = rgbToYCbCr(r, g, b);

    const yBin = Math.floor(y * (scopeHeight - 1));
    const cbBin = Math.floor(cb * (scopeHeight - 1));
    const crBin = Math.floor(cr * (scopeHeight - 1));

    if (yBin >= 0 && yBin < scopeHeight) yHistogram[yBin]++;
    if (cbBin >= 0 && cbBin < scopeHeight) cbHistogram[cbBin]++;
    if (crBin >= 0 && crBin < scopeHeight) crHistogram[crBin]++;
  }

  // Render three columns
  this.ctx.fillStyle = '#000';
  this.ctx.fillRect(0, 0, scopeWidth, scopeHeight);

  // Y channel (white)
  this.renderColumn(yHistogram, 0, thirdWidth, '#ffffff', 'Y');

  // Cb channel (blue)
  this.renderColumn(cbHistogram, thirdWidth, thirdWidth, '#4488ff', 'Cb');

  // Cr channel (red)
  this.renderColumn(crHistogram, thirdWidth * 2, thirdWidth, '#ff4444', 'Cr');

  // Draw reference lines at 0.5 for Cb/Cr (neutral point)
  this.ctx.strokeStyle = '#444';
  this.ctx.setLineDash([2, 2]);
  const neutralY = scopeHeight * 0.5;
  this.ctx.beginPath();
  this.ctx.moveTo(thirdWidth, neutralY);
  this.ctx.lineTo(scopeWidth, neutralY);
  this.ctx.stroke();
  this.ctx.setLineDash([]);
}
```

### Acceptance Criteria
- [ ] YCbCr mode selectable from waveform dropdown
- [ ] Three columns displayed: Y (white), Cb (blue), Cr (red)
- [ ] Reference line at 0.5 for Cb/Cr channels (neutral point)
- [ ] Accurate BT.709 conversion
- [ ] Works with GPU-accelerated scopes
- [ ] Labels displayed for each channel

### E2E Tests

```typescript
// e2e/waveform-ycbcr.spec.ts (add to parade-scope.spec.ts)
test.describe('YCbCr Waveform Mode', () => {
  test('YCBCR-001: YCbCr mode is selectable', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    // Open waveform
    await page.keyboard.press('w');
    await expect(page.locator('[data-testid="waveform-panel"]')).toBeVisible();

    // Click mode dropdown
    await page.click('[data-testid="waveform-mode-dropdown"]');

    // YCbCr option should exist
    await expect(page.locator('text=YCbCr')).toBeVisible();
    await page.click('text=YCbCr');

    // Mode should be set
    const state = await getViewerState(page);
    expect(state.waveformMode).toBe('ycbcr');
  });

  test('YCBCR-002: YCbCr mode shows three labeled columns', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    await page.keyboard.press('w');
    await setWaveformMode(page, 'ycbcr');

    const canvas = page.locator('[data-testid="waveform-canvas"]');
    const screenshot = await canvas.screenshot();

    // Verify three distinct columns are visible
    // (visual regression or pixel analysis)
    expect(screenshot).toBeTruthy();
  });

  test('YCBCR-003: neutral gray shows Cb/Cr at center', async ({ page }) => {
    await page.goto('/');
    // Load a neutral gray test image (RGB 128,128,128)
    await loadTestImage(page, 'test-assets/neutral-gray.png');

    await page.keyboard.press('w');
    await setWaveformMode(page, 'ycbcr');

    // Cb and Cr should show energy at ~50% (0.5)
    // Y should show energy at ~50% (128/255 ≈ 0.5)
    const state = await getViewerState(page);
    expect(state.waveformMode).toBe('ycbcr');
  });

  test('YCBCR-004: saturated red shows high Cr, low Cb', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page, 'test-assets/red-swatch.png');

    await page.keyboard.press('w');
    await setWaveformMode(page, 'ycbcr');

    // Red: Y=0.2126, Cb≈0.11, Cr≈0.96
    // Visual verification needed
  });
});
```

---

## 4. Noise Reduction Filter

### Description
Implement spatial noise reduction filter with controls for strength and luminance/chroma separation.

### Files to Create
- `src/filters/NoiseReduction.ts` - Core algorithm
- `src/ui/components/NoiseReductionControl.ts` - UI panel

### Files to Modify
- `src/ui/components/Viewer.ts` - Apply in render pipeline
- `src/ui/components/layout/ContextToolbar.ts` - Add to Effects tab

### Algorithm

```typescript
// src/filters/NoiseReduction.ts
export interface NoiseReductionParams {
  strength: number;           // 0-100
  luminanceStrength: number;  // 0-100 (defaults to strength)
  chromaStrength: number;     // 0-100 (defaults to strength * 1.5)
  radius: number;             // 1-5 (kernel size = radius * 2 + 1)
}

/**
 * Bilateral filter for edge-preserving noise reduction.
 * Uses spatial distance AND pixel value difference for weighting.
 */
export function applyNoiseReduction(
  imageData: ImageData,
  params: NoiseReductionParams
): void {
  const { data, width, height } = imageData;
  const { strength, luminanceStrength, chromaStrength, radius } = params;

  if (strength === 0) return;

  // Create copy for reading
  const original = new Uint8ClampedArray(data);

  // Precompute spatial weights (Gaussian)
  const spatialSigma = radius / 2;
  const rangeSigmaLuma = (100 - luminanceStrength) * 0.5 + 5; // Lower = more smoothing
  const rangeSigmaChroma = (100 - chromaStrength) * 0.5 + 5;

  const spatialWeights = new Float32Array((radius * 2 + 1) ** 2);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (dy + radius) * (radius * 2 + 1) + (dx + radius);
      spatialWeights[idx] = Math.exp(-(dist * dist) / (2 * spatialSigma * spatialSigma));
    }
  }

  // Process each pixel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerIdx = (y * width + x) * 4;
      const centerR = original[centerIdx]!;
      const centerG = original[centerIdx + 1]!;
      const centerB = original[centerIdx + 2]!;

      // Convert center to YCbCr for separate luma/chroma filtering
      const centerY = 0.299 * centerR + 0.587 * centerG + 0.114 * centerB;

      let sumR = 0, sumG = 0, sumB = 0, sumWeight = 0;

      // Bilateral filter kernel
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          const neighborIdx = (ny * width + nx) * 4;

          const nR = original[neighborIdx]!;
          const nG = original[neighborIdx + 1]!;
          const nB = original[neighborIdx + 2]!;

          // Luminance difference
          const nY = 0.299 * nR + 0.587 * nG + 0.114 * nB;
          const lumaDiff = Math.abs(centerY - nY);

          // Spatial weight
          const spatialIdx = (dy + radius) * (radius * 2 + 1) + (dx + radius);
          const spatialW = spatialWeights[spatialIdx]!;

          // Range weight (based on luminance difference)
          const rangeW = Math.exp(-(lumaDiff * lumaDiff) / (2 * rangeSigmaLuma * rangeSigmaLuma));

          const weight = spatialW * rangeW;
          sumR += nR * weight;
          sumG += nG * weight;
          sumB += nB * weight;
          sumWeight += weight;
        }
      }

      // Normalize and write
      data[centerIdx] = Math.round(sumR / sumWeight);
      data[centerIdx + 1] = Math.round(sumG / sumWeight);
      data[centerIdx + 2] = Math.round(sumB / sumWeight);
    }
  }
}

// GPU-accelerated version using separable approximation
export const NOISE_REDUCTION_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform float u_strength;
uniform float u_rangeSigma;
uniform int u_radius;
uniform vec2 u_resolution;

in vec2 v_texCoord;
out vec4 fragColor;

float luminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec4 center = texture(u_image, v_texCoord);
  float centerLuma = luminance(center.rgb);

  vec3 sum = vec3(0.0);
  float weightSum = 0.0;

  float spatialSigma = float(u_radius) / 2.0;

  for (int dy = -u_radius; dy <= u_radius; dy++) {
    for (int dx = -u_radius; dx <= u_radius; dx++) {
      vec2 offset = vec2(float(dx), float(dy)) / u_resolution;
      vec4 neighbor = texture(u_image, v_texCoord + offset);

      float dist = length(vec2(float(dx), float(dy)));
      float spatialW = exp(-(dist * dist) / (2.0 * spatialSigma * spatialSigma));

      float lumaDiff = abs(centerLuma - luminance(neighbor.rgb));
      float rangeW = exp(-(lumaDiff * lumaDiff) / (2.0 * u_rangeSigma * u_rangeSigma));

      float weight = spatialW * rangeW;
      sum += neighbor.rgb * weight;
      weightSum += weight;
    }
  }

  fragColor = vec4(sum / weightSum, center.a);
}`;
```

### Acceptance Criteria
- [ ] Noise reduction slider in Effects tab (0-100)
- [ ] Separate luminance/chroma strength options
- [ ] Radius control (1-5)
- [ ] Preserves edges while smoothing flat areas
- [ ] GPU-accelerated with CPU fallback
- [ ] Real-time preview during adjustment
- [ ] Settings saved in project file

### E2E Tests

```typescript
// e2e/noise-reduction.spec.ts
test.describe('Noise Reduction Filter', () => {
  test('NR-001: noise reduction slider is available in Effects tab', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="tab-effects"]');

    await expect(page.locator('[data-testid="noise-reduction-slider"]')).toBeVisible();
  });

  test('NR-002: applying noise reduction changes image', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page, 'test-assets/noisy-image.png');

    const before = await captureViewerScreenshot(page);

    await page.click('[data-testid="tab-effects"]');
    await page.fill('[data-testid="noise-reduction-slider"]', '50');
    await page.dispatchEvent('[data-testid="noise-reduction-slider"]', 'input');

    await page.waitForTimeout(100); // Wait for processing
    const after = await captureViewerScreenshot(page);

    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  test('NR-003: noise reduction=0 does not modify image', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    const before = await captureViewerScreenshot(page);

    await page.click('[data-testid="tab-effects"]');
    await page.fill('[data-testid="noise-reduction-slider"]', '0');

    const after = await captureViewerScreenshot(page);
    expect(imagesMatch(before, after)).toBe(true);
  });

  test('NR-004: noise reduction preserves edges', async ({ page }) => {
    await page.goto('/');
    // Image with sharp edge + noise
    await loadTestImage(page, 'test-assets/edge-with-noise.png');

    await page.click('[data-testid="tab-effects"]');
    await page.fill('[data-testid="noise-reduction-slider"]', '70');

    // Verify edge is still visible (histogram or visual check)
    const screenshot = await captureViewerScreenshot(page);
    // Edge detection or contrast measurement would verify edge preservation
  });

  test('NR-005: reset button clears noise reduction', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    const original = await captureViewerScreenshot(page);

    await page.click('[data-testid="tab-effects"]');
    await page.fill('[data-testid="noise-reduction-slider"]', '80');
    await page.waitForTimeout(100);

    await page.click('[data-testid="effects-reset-button"]');

    const afterReset = await captureViewerScreenshot(page);
    expect(imagesMatch(original, afterReset)).toBe(true);
  });
});
```

---

## 5. Grayscale Toggle

### Description
Quick toggle to view image in grayscale for luminance evaluation.

### Files to Modify
- `src/ui/components/ChannelSelect.ts` - Add grayscale option (or separate toggle)
- `src/ui/components/Viewer.ts` - Apply grayscale conversion
- `src/utils/KeyBindings.ts` - Add keyboard shortcut

### Algorithm

```typescript
// Add to ChannelSelect or create separate toggle
// Grayscale conversion using Rec.709 coefficients

export function applyGrayscale(imageData: ImageData): void {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;

    // Rec.709 luminance
    const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

    data[i] = luma;
    data[i + 1] = luma;
    data[i + 2] = luma;
    // Alpha unchanged
  }
}

// In KeyBindings.ts
'view.toggleGrayscale': {
  key: { code: 'KeyG', shift: true },
  action: 'view.toggleGrayscale',
  category: 'VIEW',
  description: 'Toggle grayscale view mode'
}

// In App.ts
'view.toggleGrayscale': () => {
  this.viewer.toggleGrayscale();
}
```

### Acceptance Criteria
- [ ] Grayscale toggle button in View tab
- [ ] Keyboard shortcut Shift+G toggles grayscale
- [ ] Uses Rec.709 luminance coefficients
- [ ] Toggles on/off (not cumulative)
- [ ] Works with video playback
- [ ] Indicator shows when grayscale is active
- [ ] Does NOT affect other channel modes (mutually exclusive with RGB isolation)

### E2E Tests

```typescript
// e2e/grayscale.spec.ts
test.describe('Grayscale Toggle', () => {
  test('GRAY-001: Shift+G toggles grayscale mode', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    const colorScreenshot = await captureViewerScreenshot(page);

    await page.keyboard.press('Shift+G');

    const grayScreenshot = await captureViewerScreenshot(page);

    // Verify grayscale (R=G=B for all pixels)
    expect(isGrayscaleImage(grayScreenshot)).toBe(true);
    expect(imagesAreDifferent(colorScreenshot, grayScreenshot)).toBe(true);
  });

  test('GRAY-002: toggling grayscale off restores color', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    const original = await captureViewerScreenshot(page);

    await page.keyboard.press('Shift+G'); // On
    await page.keyboard.press('Shift+G'); // Off

    const restored = await captureViewerScreenshot(page);
    expect(imagesMatch(original, restored)).toBe(true);
  });

  test('GRAY-003: grayscale indicator visible when active', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    await page.keyboard.press('Shift+G');

    // Check for indicator badge
    await expect(page.locator('[data-testid="grayscale-indicator"]')).toBeVisible();
  });

  test('GRAY-004: grayscale works during video playback', async ({ page }) => {
    await page.goto('/');
    await loadTestVideo(page);

    await page.keyboard.press('Shift+G');
    await page.keyboard.press('Space'); // Play
    await page.waitForTimeout(500);

    // Capture frame during playback
    const frame = await captureViewerScreenshot(page);
    expect(isGrayscaleImage(frame)).toBe(true);
  });

  test('GRAY-005: grayscale is mutually exclusive with channel isolation', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    // Enable red channel isolation
    await page.keyboard.press('Shift+R');

    // Toggle grayscale
    await page.keyboard.press('Shift+G');

    // Should be in grayscale mode, not red channel
    const screenshot = await captureViewerScreenshot(page);
    expect(isGrayscaleImage(screenshot)).toBe(true);
  });
});
```

---

## 6. Missing Frame Indicator

### Description
Visual indicator on timeline and viewer when frames are missing from an image sequence.

### Files to Create
- `src/ui/components/MissingFrameOverlay.ts` - Viewer overlay

### Files to Modify
- `src/ui/components/Timeline.ts` - Timeline markers
- `src/utils/SequenceLoader.ts` - Detect gaps
- `src/core/session/Session.ts` - Track missing frames

### Algorithm

```typescript
// In SequenceLoader.ts
export interface SequenceInfo {
  files: File[];
  pattern: string;
  startFrame: number;
  endFrame: number;
  missingFrames: number[]; // NEW: list of missing frame numbers
}

export function detectMissingFrames(
  files: File[],
  pattern: string
): number[] {
  const frameNumbers = files
    .map(f => extractFrameNumber(f.name))
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);

  if (frameNumbers.length === 0) return [];

  const missing: number[] = [];
  const min = frameNumbers[0]!;
  const max = frameNumbers[frameNumbers.length - 1]!;
  const presentSet = new Set(frameNumbers);

  for (let f = min; f <= max; f++) {
    if (!presentSet.has(f)) {
      missing.push(f);
    }
  }

  return missing;
}

// In Timeline.ts - render missing frame markers
private renderMissingFrameMarkers(): void {
  const missing = this.session.getMissingFrames();
  if (missing.length === 0) return;

  this.ctx.fillStyle = 'rgba(255, 100, 100, 0.5)';

  for (const frame of missing) {
    const x = this.frameToX(frame);
    // Draw vertical stripe for missing frame
    this.ctx.fillRect(x, 0, Math.max(2, this.frameWidth), this.height);
  }

  // Draw small warning icon if many missing
  if (missing.length > 10) {
    this.drawMissingFrameWarning(missing.length);
  }
}

// In MissingFrameOverlay.ts
export class MissingFrameOverlay {
  private container: HTMLDivElement;

  show(frameNumber: number): void {
    this.container.innerHTML = `
      <div class="missing-frame-overlay">
        <div class="warning-icon">⚠️</div>
        <div class="message">MISSING FRAME</div>
        <div class="frame-number">Frame ${frameNumber}</div>
      </div>
    `;
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
  }
}
```

### Acceptance Criteria
- [ ] Missing frames detected when loading sequence
- [ ] Timeline shows red markers for missing frames
- [ ] Viewer shows "MISSING FRAME" overlay when on a missing frame
- [ ] Info panel shows count of missing frames
- [ ] Tooltip on timeline marker shows frame number
- [ ] Option to hold previous frame OR show placeholder
- [ ] Option to skip missing frames during playback
- [ ] Works with both image sequences and video (if applicable)

### E2E Tests

```typescript
// e2e/missing-frames.spec.ts
test.describe('Missing Frame Indicator', () => {
  test('MF-001: missing frames detected in sequence', async ({ page }) => {
    await page.goto('/');
    // Load sequence with gaps (frames 1,2,4,5 - missing frame 3)
    await loadSequenceWithGaps(page, 'test-assets/sequence-with-gaps/');

    const state = await getViewerState(page);
    expect(state.missingFrames).toContain(3);
  });

  test('MF-002: timeline shows markers for missing frames', async ({ page }) => {
    await page.goto('/');
    await loadSequenceWithGaps(page);

    // Check for red marker at frame 3 position
    const timeline = page.locator('[data-testid="timeline-canvas"]');
    // Visual verification or pixel color check
    await expect(page.locator('[data-testid="missing-frame-marker"]')).toBeVisible();
  });

  test('MF-003: viewer shows overlay on missing frame', async ({ page }) => {
    await page.goto('/');
    await loadSequenceWithGaps(page);

    // Navigate to missing frame
    await setCurrentFrame(page, 3);

    await expect(page.locator('.missing-frame-overlay')).toBeVisible();
    await expect(page.locator('.missing-frame-overlay')).toContainText('MISSING FRAME');
  });

  test('MF-004: hold previous frame option works', async ({ page }) => {
    await page.goto('/');
    await loadSequenceWithGaps(page);

    // Enable hold previous frame
    await page.click('[data-testid="missing-frame-options"]');
    await page.click('[data-testid="hold-previous-frame"]');

    // Go to frame before missing
    await setCurrentFrame(page, 2);
    const frame2 = await captureViewerScreenshot(page);

    // Go to missing frame
    await setCurrentFrame(page, 3);
    const frame3 = await captureViewerScreenshot(page);

    // Should show frame 2's content
    expect(imagesMatch(frame2, frame3)).toBe(true);
  });

  test('MF-005: skip missing frames option works', async ({ page }) => {
    await page.goto('/');
    await loadSequenceWithGaps(page);

    // Enable skip missing frames
    await page.click('[data-testid="missing-frame-options"]');
    await page.click('[data-testid="skip-missing-frames"]');

    // Go to frame 2 and step forward
    await setCurrentFrame(page, 2);
    await page.keyboard.press('ArrowRight');

    // Should be at frame 4, not 3
    const state = await getViewerState(page);
    expect(state.currentFrame).toBe(4);
  });

  test('MF-006: info panel shows missing frame count', async ({ page }) => {
    await page.goto('/');
    await loadSequenceWithGaps(page);

    await page.click('[data-testid="tab-info"]');

    await expect(page.locator('[data-testid="missing-frames-count"]')).toContainText('1 missing');
  });
});
```

---

## 7. Compare Modes

### Description
Additional comparison modes: Onion Skin (semi-transparent overlay), Flicker (rapid alternation), and Blend (50/50 mix).

### Files to Modify
- `src/ui/components/CompareControl.ts` - Add new modes
- `src/ui/components/Viewer.ts` - Implement rendering for each mode

### Algorithm

```typescript
// Extended compare modes
export type CompareMode = 'off' | 'wipe' | 'difference' | 'onionskin' | 'flicker' | 'blend';

// In CompareControl.ts
interface CompareState {
  mode: CompareMode;
  wipePosition: number;      // 0-1 for wipe mode
  onionOpacity: number;      // 0-1 for onion skin mode
  flickerRate: number;       // Hz for flicker mode
  blendRatio: number;        // 0-1 for blend mode (0.5 = 50/50)
}

// In Viewer.ts

// Onion Skin: Draw B at reduced opacity over A
private renderOnionSkin(ctx: CanvasRenderingContext2D, imageA: ImageData, imageB: ImageData): void {
  // Draw A at full opacity
  ctx.putImageData(imageA, 0, 0);

  // Create temp canvas for B
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = imageB.width;
  tempCanvas.height = imageB.height;
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.putImageData(imageB, 0, 0);

  // Draw B at reduced opacity
  ctx.globalAlpha = this.compareState.onionOpacity;
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.globalAlpha = 1.0;
}

// Flicker: Alternate between A and B based on timer
private flickerFrame = 0;
private flickerInterval: number | null = null;

private startFlicker(): void {
  if (this.flickerInterval) return;

  const intervalMs = 1000 / this.compareState.flickerRate;
  this.flickerInterval = window.setInterval(() => {
    this.flickerFrame = 1 - this.flickerFrame; // Toggle 0/1
    this.refresh();
  }, intervalMs);
}

private stopFlicker(): void {
  if (this.flickerInterval) {
    window.clearInterval(this.flickerInterval);
    this.flickerInterval = null;
  }
}

private renderFlicker(ctx: CanvasRenderingContext2D, imageA: ImageData, imageB: ImageData): void {
  // Display A or B based on current flicker frame
  ctx.putImageData(this.flickerFrame === 0 ? imageA : imageB, 0, 0);
}

// Blend: Linear interpolation between A and B
private renderBlend(imageA: ImageData, imageB: ImageData): ImageData {
  const result = new ImageData(imageA.width, imageA.height);
  const dataA = imageA.data;
  const dataB = imageB.data;
  const dataOut = result.data;

  const t = this.compareState.blendRatio;
  const oneMinusT = 1 - t;

  for (let i = 0; i < dataA.length; i += 4) {
    dataOut[i]     = Math.round(dataA[i]! * oneMinusT + dataB[i]! * t);
    dataOut[i + 1] = Math.round(dataA[i + 1]! * oneMinusT + dataB[i + 1]! * t);
    dataOut[i + 2] = Math.round(dataA[i + 2]! * oneMinusT + dataB[i + 2]! * t);
    dataOut[i + 3] = Math.round(dataA[i + 3]! * oneMinusT + dataB[i + 3]! * t);
  }

  return result;
}
```

### Acceptance Criteria

#### Onion Skin
- [ ] Opacity slider (0-100%)
- [ ] A visible underneath B (B overlaid on A)
- [ ] Real-time opacity adjustment
- [ ] Works with video playback

#### Flicker
- [ ] Rate control (1-30 Hz)
- [ ] Smooth alternation between A and B
- [ ] Stops when mode changes
- [ ] Visual indicator showing current source

#### Blend
- [ ] Ratio slider (0-100%, default 50%)
- [ ] Smooth linear interpolation
- [ ] Works with playback

### E2E Tests

```typescript
// e2e/compare-modes.spec.ts
test.describe('Compare Modes', () => {
  test.describe('Onion Skin', () => {
    test('ONION-001: onion skin mode is selectable', async ({ page }) => {
      await page.goto('/');
      await loadTwoImages(page);

      await page.click('[data-testid="compare-dropdown"]');
      await page.click('[data-testid="compare-onionskin"]');

      const state = await getViewerState(page);
      expect(state.compareMode).toBe('onionskin');
    });

    test('ONION-002: opacity slider adjusts overlay transparency', async ({ page }) => {
      await page.goto('/');
      await loadTwoImages(page);
      await setCompareMode(page, 'onionskin');

      // Set 50% opacity
      await page.fill('[data-testid="onion-opacity-slider"]', '50');
      const half = await captureViewerScreenshot(page);

      // Set 100% opacity
      await page.fill('[data-testid="onion-opacity-slider"]', '100');
      const full = await captureViewerScreenshot(page);

      expect(imagesAreDifferent(half, full)).toBe(true);
    });

    test('ONION-003: 0% opacity shows only source A', async ({ page }) => {
      await page.goto('/');
      await loadTwoImages(page);
      await setCompareMode(page, 'onionskin');

      // Get source A alone
      await page.click('[data-testid="source-a-button"]');
      await setCompareMode(page, 'off');
      const sourceA = await captureViewerScreenshot(page);

      // Onion skin at 0%
      await setCompareMode(page, 'onionskin');
      await page.fill('[data-testid="onion-opacity-slider"]', '0');
      const onionZero = await captureViewerScreenshot(page);

      expect(imagesMatch(sourceA, onionZero)).toBe(true);
    });
  });

  test.describe('Flicker', () => {
    test('FLICKER-001: flicker mode alternates between A and B', async ({ page }) => {
      await page.goto('/');
      await loadTwoImages(page);
      await setCompareMode(page, 'flicker');

      // Capture multiple frames
      const frames: Buffer[] = [];
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(200);
        frames.push(await captureViewerScreenshot(page));
      }

      // Should have at least 2 different images
      let differences = 0;
      for (let i = 1; i < frames.length; i++) {
        if (imagesAreDifferent(frames[0]!, frames[i]!)) differences++;
      }
      expect(differences).toBeGreaterThan(0);
    });

    test('FLICKER-002: flicker rate slider changes speed', async ({ page }) => {
      await page.goto('/');
      await loadTwoImages(page);
      await setCompareMode(page, 'flicker');

      // Slow flicker (2 Hz)
      await page.fill('[data-testid="flicker-rate-slider"]', '2');
      // Fast flicker (10 Hz)
      await page.fill('[data-testid="flicker-rate-slider"]', '10');

      // Rate slider should exist and be adjustable
      await expect(page.locator('[data-testid="flicker-rate-slider"]')).toBeVisible();
    });

    test('FLICKER-003: flicker stops when mode changes', async ({ page }) => {
      await page.goto('/');
      await loadTwoImages(page);
      await setCompareMode(page, 'flicker');
      await page.waitForTimeout(500);

      await setCompareMode(page, 'off');

      // Image should be static now
      const frame1 = await captureViewerScreenshot(page);
      await page.waitForTimeout(500);
      const frame2 = await captureViewerScreenshot(page);

      expect(imagesMatch(frame1, frame2)).toBe(true);
    });
  });

  test.describe('Blend', () => {
    test('BLEND-001: blend mode mixes A and B', async ({ page }) => {
      await page.goto('/');
      await loadTwoImages(page); // Different colored images
      await setCompareMode(page, 'blend');

      // Get individual sources
      const sourceA = await getSourceAScreenshot(page);
      const sourceB = await getSourceBScreenshot(page);

      // 50% blend
      await page.fill('[data-testid="blend-ratio-slider"]', '50');
      const blended = await captureViewerScreenshot(page);

      // Blended should be different from both sources
      expect(imagesAreDifferent(sourceA, blended)).toBe(true);
      expect(imagesAreDifferent(sourceB, blended)).toBe(true);
    });

    test('BLEND-002: 0% blend shows only source A', async ({ page }) => {
      await page.goto('/');
      await loadTwoImages(page);

      const sourceA = await getSourceAScreenshot(page);

      await setCompareMode(page, 'blend');
      await page.fill('[data-testid="blend-ratio-slider"]', '0');
      const blendZero = await captureViewerScreenshot(page);

      expect(imagesMatch(sourceA, blendZero)).toBe(true);
    });

    test('BLEND-003: 100% blend shows only source B', async ({ page }) => {
      await page.goto('/');
      await loadTwoImages(page);

      const sourceB = await getSourceBScreenshot(page);

      await setCompareMode(page, 'blend');
      await page.fill('[data-testid="blend-ratio-slider"]', '100');
      const blendFull = await captureViewerScreenshot(page);

      expect(imagesMatch(sourceB, blendFull)).toBe(true);
    });
  });
});
```

---

## 8. Watermark/Logo Overlay

### Description
Add static image overlays (logos, watermarks) with position, scale, and opacity controls.

### Files to Create
- `src/ui/components/WatermarkOverlay.ts` - Core component
- `src/ui/components/WatermarkControl.ts` - UI panel

### Files to Modify
- `src/ui/components/Viewer.ts` - Render watermark layer
- `src/core/session/SessionSerializer.ts` - Save/load watermark settings

### Algorithm

```typescript
// src/ui/components/WatermarkOverlay.ts
export type WatermarkPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
  | 'custom';

export interface WatermarkState {
  enabled: boolean;
  imageUrl: string | null;
  position: WatermarkPosition;
  customX: number;  // 0-1 (percentage of canvas width)
  customY: number;  // 0-1 (percentage of canvas height)
  scale: number;    // 0.1 - 2.0 (percentage of original size)
  opacity: number;  // 0-1
  margin: number;   // Pixels from edge
}

export const DEFAULT_WATERMARK_STATE: WatermarkState = {
  enabled: false,
  imageUrl: null,
  position: 'bottom-right',
  customX: 0.9,
  customY: 0.9,
  scale: 1.0,
  opacity: 0.7,
  margin: 20
};

export class WatermarkOverlay {
  private state: WatermarkState = { ...DEFAULT_WATERMARK_STATE };
  private watermarkImage: HTMLImageElement | null = null;

  async loadImage(file: File): Promise<void> {
    const url = URL.createObjectURL(file);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (this.state.imageUrl) {
          URL.revokeObjectURL(this.state.imageUrl);
        }
        this.watermarkImage = img;
        this.state.imageUrl = url;
        this.state.enabled = true;
        resolve();
      };
      img.onerror = () => reject(new Error('Failed to load watermark image'));
      img.src = url;
    });
  }

  render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    if (!this.state.enabled || !this.watermarkImage) return;

    const img = this.watermarkImage;
    const scaledWidth = img.width * this.state.scale;
    const scaledHeight = img.height * this.state.scale;

    let x: number, y: number;

    switch (this.state.position) {
      case 'top-left':
        x = this.state.margin;
        y = this.state.margin;
        break;
      case 'top-center':
        x = (canvasWidth - scaledWidth) / 2;
        y = this.state.margin;
        break;
      case 'top-right':
        x = canvasWidth - scaledWidth - this.state.margin;
        y = this.state.margin;
        break;
      case 'center-left':
        x = this.state.margin;
        y = (canvasHeight - scaledHeight) / 2;
        break;
      case 'center':
        x = (canvasWidth - scaledWidth) / 2;
        y = (canvasHeight - scaledHeight) / 2;
        break;
      case 'center-right':
        x = canvasWidth - scaledWidth - this.state.margin;
        y = (canvasHeight - scaledHeight) / 2;
        break;
      case 'bottom-left':
        x = this.state.margin;
        y = canvasHeight - scaledHeight - this.state.margin;
        break;
      case 'bottom-center':
        x = (canvasWidth - scaledWidth) / 2;
        y = canvasHeight - scaledHeight - this.state.margin;
        break;
      case 'bottom-right':
        x = canvasWidth - scaledWidth - this.state.margin;
        y = canvasHeight - scaledHeight - this.state.margin;
        break;
      case 'custom':
        x = this.state.customX * canvasWidth - scaledWidth / 2;
        y = this.state.customY * canvasHeight - scaledHeight / 2;
        break;
    }

    ctx.globalAlpha = this.state.opacity;
    ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
    ctx.globalAlpha = 1.0;
  }

  dispose(): void {
    if (this.state.imageUrl) {
      URL.revokeObjectURL(this.state.imageUrl);
    }
    this.watermarkImage = null;
  }
}
```

### Acceptance Criteria
- [ ] Load PNG/WebP/SVG image as watermark
- [ ] Position presets: 9 positions (3x3 grid) + custom
- [ ] Custom position via drag or coordinate input
- [ ] Scale slider (10% - 200%)
- [ ] Opacity slider (0% - 100%)
- [ ] Margin control for edge positions
- [ ] Preview in viewer while adjusting
- [ ] Watermark included in frame export
- [ ] Settings saved in project file
- [ ] Remove watermark button

### E2E Tests

```typescript
// e2e/watermark.spec.ts
test.describe('Watermark Overlay', () => {
  test('WM-001: can load watermark image', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    await page.click('[data-testid="tab-view"]');
    await page.click('[data-testid="watermark-load-button"]');

    const fileInput = page.locator('[data-testid="watermark-file-input"]');
    await fileInput.setInputFiles('test-assets/logo.png');

    await expect(page.locator('[data-testid="watermark-preview"]')).toBeVisible();
  });

  test('WM-002: watermark appears on canvas', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    const before = await captureViewerScreenshot(page);

    await loadWatermark(page, 'test-assets/logo.png');

    const after = await captureViewerScreenshot(page);
    expect(imagesAreDifferent(before, after)).toBe(true);
  });

  test('WM-003: position presets work correctly', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);
    await loadWatermark(page, 'test-assets/logo.png');

    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const screenshots: Buffer[] = [];

    for (const pos of positions) {
      await page.click(`[data-testid="watermark-position-${pos}"]`);
      screenshots.push(await captureViewerScreenshot(page));
    }

    // All positions should produce different results
    for (let i = 0; i < screenshots.length - 1; i++) {
      expect(imagesAreDifferent(screenshots[i]!, screenshots[i + 1]!)).toBe(true);
    }
  });

  test('WM-004: opacity slider adjusts watermark visibility', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);
    await loadWatermark(page, 'test-assets/logo.png');

    // Full opacity
    await page.fill('[data-testid="watermark-opacity-slider"]', '100');
    const opaque = await captureViewerScreenshot(page);

    // Half opacity
    await page.fill('[data-testid="watermark-opacity-slider"]', '50');
    const half = await captureViewerScreenshot(page);

    expect(imagesAreDifferent(opaque, half)).toBe(true);
  });

  test('WM-005: scale slider resizes watermark', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);
    await loadWatermark(page, 'test-assets/logo.png');

    await page.fill('[data-testid="watermark-scale-slider"]', '50');
    const small = await captureViewerScreenshot(page);

    await page.fill('[data-testid="watermark-scale-slider"]', '150');
    const large = await captureViewerScreenshot(page);

    expect(imagesAreDifferent(small, large)).toBe(true);
  });

  test('WM-006: removing watermark clears it from canvas', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);

    const original = await captureViewerScreenshot(page);

    await loadWatermark(page, 'test-assets/logo.png');
    await page.click('[data-testid="watermark-remove-button"]');

    const afterRemove = await captureViewerScreenshot(page);
    expect(imagesMatch(original, afterRemove)).toBe(true);
  });

  test('WM-007: watermark included in frame export', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);
    await loadWatermark(page, 'test-assets/logo.png');

    // Export frame
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-frame-button"]');
    const download = await downloadPromise;

    // Verify exported image contains watermark
    const buffer = await download.createReadStream().then(stream => {
      return new Promise<Buffer>((resolve) => {
        const chunks: Buffer[] = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
    });

    // Compare with no-watermark export
    expect(buffer.length).toBeGreaterThan(0);
  });

  test('WM-008: watermark settings saved in project', async ({ page }) => {
    await page.goto('/');
    await loadTestImage(page);
    await loadWatermark(page, 'test-assets/logo.png');
    await page.fill('[data-testid="watermark-opacity-slider"]', '75');

    // Save project
    await saveProject(page);

    // Reload and open project
    await page.reload();
    await openProject(page);

    // Watermark should still be visible with same settings
    const opacityValue = await page.inputValue('[data-testid="watermark-opacity-slider"]');
    expect(opacityValue).toBe('75');
  });
});
```

---

## Implementation Priority

| Feature | Priority | Complexity | Dependencies |
|---------|----------|------------|--------------|
| Page Visibility Handling | High | Low | None |
| Grayscale Toggle | High | Low | None |
| 1D LUT Support | Medium | Medium | LUTLoader exists |
| Missing Frame Indicator | Medium | Medium | SequenceLoader |
| YCbCr Waveform Mode | Medium | Low | Waveform exists |
| Compare Modes | Medium | Medium | CompareControl exists |
| Noise Reduction | Low | High | CPU-intensive |
| Watermark Overlay | Low | Medium | None |

---

## Test Asset Requirements

Create the following test assets in `test-assets/`:

1. **gamma_2.2.cube** - 1D LUT file with gamma 2.2 curve
2. **custom_domain_1d.cube** - 1D LUT with custom DOMAIN_MIN/MAX
3. **noisy-image.png** - Image with visible noise for NR testing
4. **edge-with-noise.png** - Sharp edges + noise for edge preservation test
5. **neutral-gray.png** - Solid 128,128,128 gray
6. **red-swatch.png** - Solid red for YCbCr testing
7. **sequence-with-gaps/** - Image sequence with missing frame(s)
8. **logo.png** - Small PNG for watermark testing

---

## Notes

- All features should include unit tests alongside E2E tests
- GPU acceleration should be implemented where beneficial with CPU fallback
- All settings should be serializable to project files
- Keyboard shortcuts should be documented in help panel
