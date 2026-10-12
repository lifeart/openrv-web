/**
 * Waveform vertical scale (real GLSL): where WebGLScopesProcessor's waveform
 * shader plots a known linear value under the IRE, nits and PQ scales.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { WebGLScopesProcessor } from '../WebGLScopes';
import { linearToPQCode, nitsAxisMax, type WaveformScale } from '../WaveformScale';

const OUT_W = 64;
const OUT_H = 101;
const SRC = 16;

async function createReadyProcessor(): Promise<WebGLScopesProcessor> {
  const processor = new WebGLScopesProcessor();
  for (let i = 0; i < 200 && !processor.isReady(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(processor.isReady()).toBe(true);
  return processor;
}

/** Plot a uniform frame of `value` and return the brightest trace row, counted from the bottom (0..OUT_H-1). */
function plottedRowFromBottom(processor: WebGLScopesProcessor, value: number, scale: WaveformScale): number {
  processor.setFloatImage(new Float32Array(SRC * SRC * 4).fill(value), SRC, SRC);
  const out = document.createElement('canvas');
  out.width = OUT_W;
  out.height = OUT_H;
  processor.renderWaveform(out, 'luma', { scale });
  const data = out.getContext('2d')!.getImageData(0, 0, OUT_W, OUT_H).data;
  let bestRow = -1;
  let best = 0;
  for (let y = 0; y < OUT_H; y++) {
    let sum = 0;
    for (let x = 0; x < OUT_W; x++) sum += data[(y * OUT_W + x) * 4 + 3]!;
    if (sum > best) {
      best = sum;
      bestRow = y;
    }
  }
  expect(bestRow).toBeGreaterThanOrEqual(0);
  return OUT_H - 1 - bestRow;
}

function expectedRow(position: number): number {
  return Math.min(OUT_H - 1, Math.floor(position * OUT_H));
}

describe('Waveform scale (real GPU)', () => {
  let processor: WebGLScopesProcessor | null = null;

  afterEach(() => {
    processor?.dispose();
    processor = null;
  });

  it('WFS-GPU-001: PQ axis plots 4.0 (812 cd/m²) at its PQ code', async () => {
    processor = await createReadyProcessor();
    processor.setHDRMode(true, 4.0);
    const row = plottedRowFromBottom(processor, 4.0, 'pq');
    expect(Math.abs(row - expectedRow(linearToPQCode(4.0)))).toBeLessThanOrEqual(1);
  });

  it('WFS-GPU-002: PQ axis plots 1000 cd/m² at code ~0.75 and 100 cd/m² at ~0.51', async () => {
    processor = await createReadyProcessor();
    processor.setHDRMode(true, 4.0);
    const high = plottedRowFromBottom(processor, 1000 / 203, 'pq');
    expect(Math.abs(high - expectedRow(0.7518))).toBeLessThanOrEqual(1);
    const low = plottedRowFromBottom(processor, 100 / 203, 'pq');
    expect(Math.abs(low - expectedRow(0.5081))).toBeLessThanOrEqual(1);
  });

  it('WFS-GPU-003: nits axis fits a 1000 cd/m² peak at the top', async () => {
    processor = await createReadyProcessor();
    processor.setHDRMode(true, 4.0);
    processor.setHDRAutoFit(true);
    const value = 500 / 203;
    const row = plottedRowFromBottom(processor, value, 'nits');
    // Peak 500 cd/m² -> axis top 1000 cd/m², so 500 cd/m² plots half way.
    expect(nitsAxisMax(value) * 203).toBeCloseTo(1000, 6);
    expect(Math.abs(row - expectedRow(0.5))).toBeLessThanOrEqual(1);
  });

  it('WFS-GPU-004: IRE axis keeps the linear headroom scale (2.0 of 4.0 plots half way)', async () => {
    processor = await createReadyProcessor();
    processor.setHDRMode(true, 4.0);
    const row = plottedRowFromBottom(processor, 2.0, 'ire');
    expect(Math.abs(row - expectedRow(0.5))).toBeLessThanOrEqual(1);
  });
});
