/**
 * Regression tests for wiring fixes:
 * - ConvergenceMeasure measurement pipeline
 * - Convergence button visibility with stereo mode
 * - FloatingWindowDetector on frame changes
 * - SlateEditor form fields update state
 * - Slate frames prepended to export
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConvergenceMeasure,
} from '../ui/components/ConvergenceMeasure';
import { SlateEditor } from '../ui/components/SlateEditor';
import { extractStereoEyes } from '../stereo/StereoRenderer';
import {
  detectFloatingWindowViolations,
} from '../stereo/FloatingWindowDetector';
import { generateSlateFrame } from '../export/SlateRenderer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createImageData(width: number, height: number, fill?: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill !== undefined) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill;
      data[i + 1] = fill;
      data[i + 2] = fill;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

function createSideBySideStereoImage(
  width: number,
  height: number,
  leftFill: number,
  rightFill: number,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  const halfWidth = Math.floor(width / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const fill = x < halfWidth ? leftFill : rightFill;
      data[idx] = fill;
      data[idx + 1] = fill;
      data[idx + 2] = fill;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

// ---------------------------------------------------------------------------
// ConvergenceMeasure: measurement produces results when stereo is active
// ---------------------------------------------------------------------------

describe('ConvergenceMeasure measurement pipeline', () => {
  let measure: ConvergenceMeasure;

  beforeEach(() => {
    measure = new ConvergenceMeasure();
  });

  it('REG-CM-001: measureAtCursor produces a result with identical stereo pair', () => {
    const img = createImageData(64, 64, 128);
    measure.setEnabled(true);
    measure.setCursorPosition(32, 32);
    const result = measure.measureAtCursor(img, img);
    expect(result.disparity).toBe(0);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.x).toBe(32);
    expect(result.y).toBe(32);
    expect(measure.getCursorDisparity()).toEqual(result);
  });

  it('REG-CM-002: measureAtCursor emits disparityMeasured event', () => {
    const handler = vi.fn();
    measure.on('disparityMeasured', handler);
    const img = createImageData(64, 64, 128);
    measure.setCursorPosition(32, 32);
    measure.measureAtCursor(img, img);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].disparity).toBe(0);
  });

  it('REG-CM-003: computeStats produces valid statistics', () => {
    const img = createImageData(64, 64, 128);
    measure.setEnabled(true);
    const stats = measure.computeStats(img, img, 16);
    expect(stats.sampleCount).toBeGreaterThan(0);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.avg).toBe(0);
  });

  it('REG-CM-004: dispose resets state and removes listeners', () => {
    const handler = vi.fn();
    measure.on('stateChanged', handler);
    measure.setEnabled(true);
    expect(handler).toHaveBeenCalledTimes(1);

    measure.dispose();
    expect(measure.isEnabled()).toBe(false);
    expect(measure.getCursorDisparity()).toBeNull();
    expect(measure.getFrameStats()).toBeNull();

    // After dispose, further enable should NOT fire the old handler
    measure.setEnabled(true);
    // Handler was called once before dispose, and should not be called again
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Convergence button hidden when stereo off
// ---------------------------------------------------------------------------

describe('ConvergenceMeasure visibility with stereo state', () => {
  it('REG-CV-001: disabling convergence when stereo is off resets measurements', () => {
    const measure = new ConvergenceMeasure();
    const img = createImageData(64, 64, 128);
    measure.setEnabled(true);
    measure.setCursorPosition(32, 32);
    measure.measureAtCursor(img, img);
    expect(measure.getCursorDisparity()).not.toBeNull();

    // Simulate stereo off: disable convergence
    measure.setEnabled(false);
    expect(measure.isEnabled()).toBe(false);
    expect(measure.getCursorDisparity()).toBeNull();
    expect(measure.getFrameStats()).toBeNull();
    measure.dispose();
  });
});

// ---------------------------------------------------------------------------
// extractStereoEyes is now exported and usable
// ---------------------------------------------------------------------------

describe('extractStereoEyes export', () => {
  it('REG-SE-001: extractStereoEyes splits side-by-side image', () => {
    const stereoImg = createSideBySideStereoImage(128, 64, 100, 200);
    const { left, right } = extractStereoEyes(stereoImg, 'side-by-side', false);

    expect(left.width).toBe(64);
    expect(left.height).toBe(64);
    expect(right.width).toBe(64);
    expect(right.height).toBe(64);

    // Left eye should be filled with ~100
    expect(left.data[0]).toBe(100);
    // Right eye should be filled with ~200
    expect(right.data[0]).toBe(200);
  });

  it('REG-SE-002: extractStereoEyes respects eye swap', () => {
    const stereoImg = createSideBySideStereoImage(128, 64, 100, 200);
    const { left, right } = extractStereoEyes(stereoImg, 'side-by-side', true);

    // With eye swap, left should have the right fill and vice versa
    expect(left.data[0]).toBe(200);
    expect(right.data[0]).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// FloatingWindowDetector runs on frame changes
// ---------------------------------------------------------------------------

describe('FloatingWindowDetector integration', () => {
  it('REG-FW-001: detectFloatingWindowViolations runs on identical images without violations', () => {
    const img = createImageData(64, 64, 128);
    const result = detectFloatingWindowViolations(img, img);
    expect(result.hasViolation).toBe(false);
    expect(result.violations).toHaveLength(0);
    expect(result.worstDisparity).toBe(0);
  });

  it('REG-FW-002: detection result has expected structure', () => {
    const img = createImageData(64, 64, 128);
    const result = detectFloatingWindowViolations(img, img);
    expect('hasViolation' in result).toBe(true);
    expect('violations' in result).toBe(true);
    expect('worstDisparity' in result).toBe(true);
    expect('affectedEdges' in result).toBe(true);
    expect(Array.isArray(result.violations)).toBe(true);
  });

  it('REG-FW-003: convergence measure can receive floating window events', () => {
    const measure = new ConvergenceMeasure();
    const handler = vi.fn();
    // Use 'as never' pattern matching the wiring code
    measure.on('floatingWindowViolation' as never, handler);

    const img = createImageData(64, 64, 128);
    const result = detectFloatingWindowViolations(img, img);
    measure.emit('floatingWindowViolation' as never, result as never);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toEqual(result);
    measure.dispose();
  });
});

// ---------------------------------------------------------------------------
// SlateEditor form fields update state
// ---------------------------------------------------------------------------

describe('SlateEditor form fields update state', () => {
  let editor: SlateEditor;

  beforeEach(() => {
    editor = new SlateEditor();
  });

  it('REG-SL-001: setMetadata updates show name', () => {
    editor.setMetadata({ showName: 'Test Show' });
    expect(editor.getMetadata().showName).toBe('Test Show');
  });

  it('REG-SL-002: setMetadata updates shot name', () => {
    editor.setMetadata({ shotName: 'shot_010' });
    expect(editor.getMetadata().shotName).toBe('shot_010');
  });

  it('REG-SL-003: setMetadata updates version', () => {
    editor.setMetadata({ version: 'v03' });
    expect(editor.getMetadata().version).toBe('v03');
  });

  it('REG-SL-004: setMetadata updates artist', () => {
    editor.setMetadata({ artist: 'Alice' });
    expect(editor.getMetadata().artist).toBe('Alice');
  });

  it('REG-SL-005: setMetadata updates date', () => {
    editor.setMetadata({ date: '2026-02-19' });
    expect(editor.getMetadata().date).toBe('2026-02-19');
  });

  it('REG-SL-006: setColors updates background color', () => {
    editor.setColors({ background: '#112233' });
    expect(editor.getColors().background).toBe('#112233');
  });

  it('REG-SL-007: setFontSizeMultiplier updates font size', () => {
    editor.setFontSizeMultiplier(1.5);
    expect(editor.getFontSizeMultiplier()).toBe(1.5);
  });

  it('REG-SL-008: setLogoUrl updates logo URL', () => {
    editor.setLogoUrl('https://example.com/logo.png');
    expect(editor.getLogoUrl()).toBe('https://example.com/logo.png');
  });

  it('REG-SL-009: form field changes emit stateChanged', () => {
    const handler = vi.fn();
    editor.on('stateChanged', handler);

    editor.setMetadata({ showName: 'New Show' });
    expect(handler).toHaveBeenCalledTimes(1);

    editor.setColors({ text: '#aaa' });
    expect(handler).toHaveBeenCalledTimes(2);

    editor.setFontSizeMultiplier(0.8);
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('REG-SL-010: generateConfig includes configured metadata fields', () => {
    editor.setMetadata({
      showName: 'My Show',
      shotName: 'sh020',
      version: 'v01',
      artist: 'Bob',
      date: '2026-01-01',
    });
    const config = editor.generateConfig();
    expect(config.fields.length).toBeGreaterThan(0);
    expect(config.fields.some(f => f.value === 'My Show')).toBe(true);
    expect(config.fields.some(f => f.value === 'sh020')).toBe(true);
    expect(config.fields.some(f => f.value === 'v01')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Slate frames are prepended to export
// ---------------------------------------------------------------------------

describe('Slate frame generation for export', () => {
  it('REG-EX-001: generateSlateFrame produces valid frame from config', () => {
    const editor = new SlateEditor();
    editor.setMetadata({
      showName: 'Test Show',
      shotName: 'sh010',
      version: 'v02',
    });
    editor.setResolution(640, 480);
    editor.setColors({ background: '#000', text: '#fff' });

    const config = editor.generateConfig();
    expect(config.fields.length).toBeGreaterThan(0);

    const frame = generateSlateFrame(config);
    // In jsdom, canvas dimensions may not match requested size,
    // but the frame object should report the requested dimensions
    expect(frame.width).toBe(640);
    expect(frame.height).toBe(480);
    // Pixel data should be a valid Uint8ClampedArray
    expect(frame.pixels).toBeInstanceOf(Uint8ClampedArray);
    expect(frame.pixels.length).toBeGreaterThan(0);
    editor.dispose();
  });

  it('REG-EX-002: slate config from editor has correct dimensions', () => {
    const editor = new SlateEditor();
    editor.setResolution(1920, 1080);
    const config = editor.generateConfig();
    expect(config.width).toBe(1920);
    expect(config.height).toBe(1080);
    editor.dispose();
  });

  it('REG-EX-003: slate config can be overridden with export dimensions', () => {
    const editor = new SlateEditor();
    editor.setMetadata({ showName: 'Export Test' });
    const config = editor.generateConfig();
    // Override dimensions to match video export
    config.width = 3840;
    config.height = 2160;
    const frame = generateSlateFrame(config);
    expect(frame.width).toBe(3840);
    expect(frame.height).toBe(2160);
    editor.dispose();
  });

  it('REG-EX-004: empty metadata produces config with no fields (no slate prepended)', () => {
    const editor = new SlateEditor();
    // No metadata set
    const config = editor.generateConfig();
    expect(config.fields.length).toBe(0);
    editor.dispose();
  });

  it('REG-EX-005: generateSlateFrame produces pixel buffer and emits configGenerated', () => {
    const editor = new SlateEditor();
    const handler = vi.fn();
    editor.on('configGenerated', handler);

    editor.setMetadata({ showName: 'Visible Text' });
    editor.setColors({ background: '#000000', text: '#ffffff' });
    editor.setResolution(128, 64);
    const config = editor.generateConfig();

    // configGenerated event should have been emitted
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].width).toBe(128);
    expect(handler.mock.calls[0]![0].height).toBe(64);

    const frame = generateSlateFrame(config);
    // Frame pixel data should be a valid Uint8ClampedArray
    expect(frame.pixels).toBeInstanceOf(Uint8ClampedArray);
    expect(frame.pixels.length).toBeGreaterThan(0);
    editor.dispose();
  });
});
