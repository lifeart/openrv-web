/**
 * MiniHistogram Tests
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { MiniHistogram } from './MiniHistogram';
import type { HistogramData } from '../../components/Histogram';

// Mock ScopesControl
function createMockScopesControl() {
  return {
    toggleScope: vi.fn(),
    setScopeVisible: vi.fn(),
    isScopeVisible: vi.fn(() => false),
    getState: vi.fn(() => ({ histogram: false, waveform: false, vectorscope: false, gamutDiagram: false })),
    render: vi.fn(() => document.createElement('div')),
    dispose: vi.fn(),
    on: vi.fn(() => () => {}),
  } as any;
}

function createTestHistogramData(maxValue = 1000): HistogramData {
  const red = new Uint32Array(256);
  const green = new Uint32Array(256);
  const blue = new Uint32Array(256);
  const luminance = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    red[i] = Math.floor(Math.sin(i / 256 * Math.PI) * maxValue);
    green[i] = Math.floor(Math.sin((i + 85) / 256 * Math.PI) * (maxValue * 0.8));
    blue[i] = Math.floor(Math.sin((i + 170) / 256 * Math.PI) * (maxValue * 0.6));
    luminance[i] = Math.floor((red[i]! * 0.2126 + green[i]! * 0.7152 + blue[i]! * 0.0722));
  }

  return {
    red, green, blue, luminance,
    maxValue,
    pixelCount: 1920 * 1080,
    clipping: { shadows: 0, highlights: 0, shadowsPercent: 0, highlightsPercent: 0 },
  };
}

describe('MiniHistogram', () => {
  let histogram: MiniHistogram;
  let mockScopes: ReturnType<typeof createMockScopesControl>;

  beforeEach(() => {
    mockScopes = createMockScopesControl();
    histogram = new MiniHistogram(mockScopes);
    document.body.appendChild(histogram.getElement());
  });

  afterEach(() => {
    histogram?.dispose();
  });

  describe('initialization', () => {
    it('MH-001: creates container element', () => {
      const el = histogram.getElement();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.dataset.testid).toBe('mini-histogram');
    });

    it('MH-002: has canvas element', () => {
      const canvas = histogram.getElement().querySelector('canvas');
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('MH-003: data is null initially', () => {
      expect(histogram.getData()).toBeNull();
    });

    it('MH-004: has mode toggle button', () => {
      const btn = histogram.getElement().querySelector('[data-testid="mini-histogram-mode"]');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('RGB');
    });

    it('MH-004b: canvas hidden initially, placeholder visible', () => {
      const canvas = histogram.getElement().querySelector('canvas') as HTMLCanvasElement;
      const placeholder = histogram.getElement().querySelector('div[style*="align-items: center"]') as HTMLElement;
      expect(canvas.style.display).toBe('none');
      expect(placeholder?.style.display).toBe('flex');
    });

    it('MH-004c: canvas has correct dimensions', () => {
      const canvas = histogram.getElement().querySelector('canvas') as HTMLCanvasElement;
      expect(canvas.width).toBe(256);
      expect(canvas.height).toBe(80);
    });

    it('MH-004d: placeholder shows hint text', () => {
      expect(histogram.getElement().textContent).toContain('Open or drop a file');
    });
  });

  describe('update', () => {
    it('MH-005: stores data after update', () => {
      const data = createTestHistogramData();
      histogram.update(data);
      expect(histogram.getData()).toBe(data);
    });

    it('MH-006: shows canvas after update', () => {
      const data = createTestHistogramData();
      histogram.update(data);
      const canvas = histogram.getElement().querySelector('canvas') as HTMLCanvasElement;
      expect(canvas.style.display).toBe('block');
    });

    it('MH-006b: hides placeholder after update', () => {
      const data = createTestHistogramData();
      histogram.update(data);
      const placeholder = histogram.getElement().querySelector('div[style*="align-items: center"]') as HTMLElement;
      expect(placeholder?.style.display).toBe('none');
    });

    it('MH-006c: handles maxValue=0 without error', () => {
      const data = createTestHistogramData(0);
      data.maxValue = 0;
      expect(() => histogram.update(data)).not.toThrow();
    });

    it('MH-006d: skips update when container display is none (visibility guard)', () => {
      histogram.getElement().style.display = 'none';
      const data = createTestHistogramData();
      histogram.update(data);
      // Data is stored but canvas not shown
      expect(histogram.getData()).toBe(data);
      const canvas = histogram.getElement().querySelector('canvas') as HTMLCanvasElement;
      expect(canvas.style.display).toBe('none');
    });

    it('MH-006e: multiple updates replace data', () => {
      const data1 = createTestHistogramData(500);
      const data2 = createTestHistogramData(1000);
      histogram.update(data1);
      histogram.update(data2);
      expect(histogram.getData()).toBe(data2);
    });
  });

  describe('mode toggle', () => {
    it('MH-007: starts in RGB mode', () => {
      expect(histogram.getMode()).toBe('rgb');
    });

    it('MH-008: toggles to luminance mode', () => {
      const btn = histogram.getElement().querySelector('[data-testid="mini-histogram-mode"]') as HTMLButtonElement;
      btn.click();
      expect(histogram.getMode()).toBe('luminance');
      expect(btn.textContent).toBe('Luma');
    });

    it('MH-009: toggles back to RGB', () => {
      const btn = histogram.getElement().querySelector('[data-testid="mini-histogram-mode"]') as HTMLButtonElement;
      btn.click(); // -> luminance
      btn.click(); // -> rgb
      expect(histogram.getMode()).toBe('rgb');
    });

    it('MH-009b: mode toggle redraws when data exists', () => {
      const data = createTestHistogramData();
      histogram.update(data);
      const btn = histogram.getElement().querySelector('[data-testid="mini-histogram-mode"]') as HTMLButtonElement;
      // Should not throw and should redraw
      expect(() => btn.click()).not.toThrow();
      expect(histogram.getMode()).toBe('luminance');
    });

    it('MH-009c: mode toggle without data does not throw', () => {
      const btn = histogram.getElement().querySelector('[data-testid="mini-histogram-mode"]') as HTMLButtonElement;
      expect(() => btn.click()).not.toThrow();
    });
  });

  describe('click to open scope', () => {
    it('MH-010: clicking canvas toggles histogram scope', () => {
      const canvas = histogram.getElement().querySelector('canvas') as HTMLCanvasElement;
      canvas.click();
      expect(mockScopes.toggleScope).toHaveBeenCalledWith('histogram');
    });

    it('MH-010b: clicking canvas multiple times calls toggleScope each time', () => {
      const canvas = histogram.getElement().querySelector('canvas') as HTMLCanvasElement;
      canvas.click();
      canvas.click();
      expect(mockScopes.toggleScope).toHaveBeenCalledTimes(2);
    });
  });

  describe('dispose', () => {
    it('MH-011: removes element from DOM', () => {
      expect(document.body.contains(histogram.getElement())).toBe(true);
      histogram.dispose();
      expect(document.body.contains(histogram.getElement())).toBe(false);
    });
  });
});
