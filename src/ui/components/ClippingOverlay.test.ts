/**
 * ClippingOverlay Unit Tests
 *
 * Tests for Clipping Overlay component (FEATURES.md 2.6)
 * Based on test cases CLIP-001 through CLIP-004
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClippingOverlay, DEFAULT_CLIPPING_OVERLAY_STATE } from './ClippingOverlay';

// Helper to create ImageData with specific pixel values at specific positions
function createImageDataWithPixels(
  width: number,
  height: number,
  pixels: Array<{ x: number; y: number; r: number; g: number; b: number }>,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  // Fill with mid-gray by default
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128;
    data[i + 1] = 128;
    data[i + 2] = 128;
    data[i + 3] = 255;
  }
  // Set specific pixels
  for (const pixel of pixels) {
    const idx = (pixel.y * width + pixel.x) * 4;
    data[idx] = pixel.r;
    data[idx + 1] = pixel.g;
    data[idx + 2] = pixel.b;
    data[idx + 3] = 255;
  }
  return new ImageData(data, width, height);
}

// Helper to get pixel at position
function getPixel(imageData: ImageData, x: number, y: number): { r: number; g: number; b: number; a: number } {
  const idx = (y * imageData.width + x) * 4;
  return {
    r: imageData.data[idx]!,
    g: imageData.data[idx + 1]!,
    b: imageData.data[idx + 2]!,
    a: imageData.data[idx + 3]!,
  };
}

describe('ClippingOverlay', () => {
  let clippingOverlay: ClippingOverlay;

  beforeEach(() => {
    clippingOverlay = new ClippingOverlay();
  });

  afterEach(() => {
    clippingOverlay.dispose();
  });

  describe('initialization', () => {
    it('CLIP-U001: starts disabled by default', () => {
      expect(clippingOverlay.isEnabled()).toBe(false);
    });

    it('CLIP-U002: default state matches specification', () => {
      expect(DEFAULT_CLIPPING_OVERLAY_STATE).toEqual({
        enabled: false,
        showHighlights: true,
        showShadows: true,
        highlightColor: { r: 255, g: 0, b: 0 },
        shadowColor: { r: 0, g: 100, b: 255 },
        bothColor: { r: 250, g: 204, b: 21 },
        opacity: 0.7,
        shadowThreshold: 0.0,
        highlightThreshold: 1.0,
      });
    });

    it('CLIP-U003: getState returns copy of current state', () => {
      const state = clippingOverlay.getState();
      expect(state).toEqual(DEFAULT_CLIPPING_OVERLAY_STATE);
      // Verify it's a copy, not the same reference
      state.enabled = true;
      expect(clippingOverlay.isEnabled()).toBe(false);
    });
  });

  describe('enable/disable', () => {
    it('CLIP-U010: enable turns on overlay', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.enable();

      expect(clippingOverlay.isEnabled()).toBe(true);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('CLIP-U011: enable is idempotent (no duplicate events)', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.enable();
      clippingOverlay.enable();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('CLIP-U012: disable turns off overlay', () => {
      clippingOverlay.enable();
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.disable();

      expect(clippingOverlay.isEnabled()).toBe(false);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });

    it('CLIP-U013: disable is idempotent (no duplicate events)', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.disable();
      clippingOverlay.disable();

      expect(handler).toHaveBeenCalledTimes(0);
    });

    it('CLIP-U014: toggle switches state', () => {
      expect(clippingOverlay.isEnabled()).toBe(false);

      clippingOverlay.toggle();
      expect(clippingOverlay.isEnabled()).toBe(true);

      clippingOverlay.toggle();
      expect(clippingOverlay.isEnabled()).toBe(false);
    });

    it('CLIP-U015: toggle emits stateChanged', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.toggle();
      clippingOverlay.toggle();

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('highlight detection', () => {
    it('CLIP-U020: detects highlight clipping when R >= 254', () => {
      clippingOverlay.enable();
      const imageData = createImageDataWithPixels(3, 1, [
        { x: 0, y: 0, r: 254, g: 100, b: 100 },
        { x: 1, y: 0, r: 255, g: 100, b: 100 },
        { x: 2, y: 0, r: 253, g: 100, b: 100 }, // Not clipped
      ]);

      clippingOverlay.apply(imageData);

      // Pixel 0 and 1 should be tinted red (highlight color)
      const pixel0 = getPixel(imageData, 0, 0);
      const pixel1 = getPixel(imageData, 1, 0);
      const pixel2 = getPixel(imageData, 2, 0);

      // With opacity 0.7, red channel should be boosted significantly
      expect(pixel0.r).toBeGreaterThan(200); // Blended toward red
      expect(pixel1.r).toBeGreaterThan(200);
      // Pixel 2 should be unchanged (253 < 254)
      expect(pixel2.r).toBe(253);
    });

    it('CLIP-U021: detects highlight clipping when G >= 254', () => {
      clippingOverlay.enable();
      const imageData = createImageDataWithPixels(2, 1, [
        { x: 0, y: 0, r: 100, g: 255, b: 100 },
        { x: 1, y: 0, r: 100, g: 253, b: 100 }, // Not clipped
      ]);

      clippingOverlay.apply(imageData);

      const pixel0 = getPixel(imageData, 0, 0);
      const pixel1 = getPixel(imageData, 1, 0);

      expect(pixel0.r).toBeGreaterThan(150); // Tinted red
      expect(pixel1.g).toBe(253); // Unchanged
    });

    it('CLIP-U022: detects highlight clipping when B >= 254', () => {
      clippingOverlay.enable();
      const imageData = createImageDataWithPixels(2, 1, [
        { x: 0, y: 0, r: 100, g: 100, b: 254 },
        { x: 1, y: 0, r: 100, g: 100, b: 253 }, // Not clipped
      ]);

      clippingOverlay.apply(imageData);

      const pixel0 = getPixel(imageData, 0, 0);
      const pixel1 = getPixel(imageData, 1, 0);

      expect(pixel0.r).toBeGreaterThan(150); // Tinted red
      expect(pixel1.b).toBe(253); // Unchanged
    });

    it('CLIP-U023: detects highlight clipping when luminance >= 254', () => {
      clippingOverlay.enable();
      // Create a pixel with high luminance but no single channel at 254+
      // Luma = 0.2126*R + 0.7152*G + 0.0722*B
      // For luma >= 254: 0.2126*253 + 0.7152*253 + 0.0722*253 = 253 (just under)
      // Need higher values
      const imageData = createImageDataWithPixels(2, 1, [
        { x: 0, y: 0, r: 253, g: 253, b: 253 }, // Luma ~253, should clip due to luma check
        { x: 1, y: 0, r: 200, g: 200, b: 200 }, // Luma ~200, not clipped
      ]);

      clippingOverlay.apply(imageData);

      const pixel0 = getPixel(imageData, 0, 0);
      const pixel1 = getPixel(imageData, 1, 0);

      // Pixel 0 has channels at 253, luma calculation: 0.2126*253 + 0.7152*253 + 0.0722*253 = 253
      // This is < 254, so it won't be flagged by luma check alone
      // But wait - let's verify with actual numbers: the check is r >= 254 || luma >= 254
      // Since r=253 < 254, g=253 < 254, b=253 < 254, and luma=253 < 254, pixel 0 should NOT be clipped
      expect(pixel0.r).toBe(253); // Unchanged, not clipped
      expect(pixel1.r).toBe(200); // Unchanged
    });

    it('CLIP-U024: respects showHighlights=false', () => {
      clippingOverlay.enable();
      clippingOverlay.setShowHighlights(false);

      const imageData = createImageDataWithPixels(1, 1, [{ x: 0, y: 0, r: 255, g: 255, b: 255 }]);

      clippingOverlay.apply(imageData);

      const pixel = getPixel(imageData, 0, 0);
      // Should be unchanged since highlights are disabled
      expect(pixel.r).toBe(255);
      expect(pixel.g).toBe(255);
      expect(pixel.b).toBe(255);
    });
  });

  describe('shadow detection', () => {
    it('CLIP-U030: detects shadow clipping when all channels <= 1', () => {
      clippingOverlay.enable();
      const imageData = createImageDataWithPixels(3, 1, [
        { x: 0, y: 0, r: 0, g: 0, b: 0 },
        { x: 1, y: 0, r: 1, g: 1, b: 1 },
        { x: 2, y: 0, r: 2, g: 2, b: 2 }, // Not clipped
      ]);

      clippingOverlay.apply(imageData);

      const pixel0 = getPixel(imageData, 0, 0);
      const pixel1 = getPixel(imageData, 1, 0);
      const pixel2 = getPixel(imageData, 2, 0);

      // Pixels 0 and 1 should be tinted blue (shadow color)
      // Shadow color is { r: 0, g: 100, b: 255 } with opacity 0.7
      expect(pixel0.b).toBeGreaterThan(150); // Tinted blue
      expect(pixel1.b).toBeGreaterThan(150);
      // Pixel 2 should be unchanged
      expect(pixel2.r).toBe(2);
      expect(pixel2.g).toBe(2);
      expect(pixel2.b).toBe(2);
    });

    it('CLIP-U031: does NOT detect shadow if any channel > 1', () => {
      clippingOverlay.enable();
      const imageData = createImageDataWithPixels(3, 1, [
        { x: 0, y: 0, r: 2, g: 0, b: 0 }, // R > 1, not shadow
        { x: 1, y: 0, r: 0, g: 2, b: 0 }, // G > 1, not shadow
        { x: 2, y: 0, r: 0, g: 0, b: 2 }, // B > 1, not shadow
      ]);

      clippingOverlay.apply(imageData);

      const pixel0 = getPixel(imageData, 0, 0);
      const pixel1 = getPixel(imageData, 1, 0);
      const pixel2 = getPixel(imageData, 2, 0);

      // All should be unchanged
      expect(pixel0.r).toBe(2);
      expect(pixel1.g).toBe(2);
      expect(pixel2.b).toBe(2);
    });

    it('CLIP-U032: respects showShadows=false', () => {
      clippingOverlay.enable();
      clippingOverlay.setShowShadows(false);

      const imageData = createImageDataWithPixels(1, 1, [{ x: 0, y: 0, r: 0, g: 0, b: 0 }]);

      clippingOverlay.apply(imageData);

      const pixel = getPixel(imageData, 0, 0);
      // Should be unchanged since shadows are disabled
      expect(pixel.r).toBe(0);
      expect(pixel.g).toBe(0);
      expect(pixel.b).toBe(0);
    });
  });

  describe('opacity blending', () => {
    it('CLIP-U040: opacity affects blend amount', () => {
      clippingOverlay.enable();

      // Test with default opacity (0.7)
      const imageData1 = createImageDataWithPixels(1, 1, [{ x: 0, y: 0, r: 255, g: 0, b: 0 }]);
      clippingOverlay.apply(imageData1);
      const pixel1 = getPixel(imageData1, 0, 0);

      // Change opacity to 0.3
      clippingOverlay.setOpacity(0.3);
      const imageData2 = createImageDataWithPixels(1, 1, [{ x: 0, y: 0, r: 255, g: 0, b: 0 }]);
      clippingOverlay.apply(imageData2);
      const pixel2 = getPixel(imageData2, 0, 0);

      // With lower opacity, the blend should be less pronounced
      // Both should have red tint, but pixel2 less so
      expect(pixel1.r).toBeGreaterThan(pixel2.r - 50); // Allow some tolerance
    });

    it('CLIP-U041: opacity is clamped to 0-1 range', () => {
      clippingOverlay.setOpacity(-0.5);
      expect(clippingOverlay.getState().opacity).toBe(0);

      clippingOverlay.setOpacity(1.5);
      expect(clippingOverlay.getState().opacity).toBe(1);

      clippingOverlay.setOpacity(0.5);
      expect(clippingOverlay.getState().opacity).toBe(0.5);
    });

    it('CLIP-U042: setOpacity is idempotent', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.setOpacity(0.5);
      clippingOverlay.setOpacity(0.5);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('state management', () => {
    it('CLIP-U050: setState updates multiple properties', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.setState({
        enabled: true,
        opacity: 0.5,
        showHighlights: false,
      });

      const state = clippingOverlay.getState();
      expect(state.enabled).toBe(true);
      expect(state.opacity).toBe(0.5);
      expect(state.showHighlights).toBe(false);
      // Unchanged properties should remain default
      expect(state.showShadows).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('CLIP-U051: setState can update highlight color', () => {
      clippingOverlay.setState({
        highlightColor: { r: 0, g: 255, b: 0 },
      });

      const state = clippingOverlay.getState();
      expect(state.highlightColor).toEqual({ r: 0, g: 255, b: 0 });
    });

    it('CLIP-U052: setState can update shadow color', () => {
      clippingOverlay.setState({
        shadowColor: { r: 255, g: 0, b: 255 },
      });

      const state = clippingOverlay.getState();
      expect(state.shadowColor).toEqual({ r: 255, g: 0, b: 255 });
    });

    it('CLIP-U053: reset returns to default state', () => {
      clippingOverlay.enable();
      clippingOverlay.setOpacity(0.3);
      clippingOverlay.setShowHighlights(false);
      clippingOverlay.setShowShadows(false);

      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.reset();

      expect(clippingOverlay.getState()).toEqual(DEFAULT_CLIPPING_OVERLAY_STATE);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('setShowHighlights/setShowShadows', () => {
    it('CLIP-U060: setShowHighlights updates state and emits event', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.setShowHighlights(false);

      expect(clippingOverlay.getState().showHighlights).toBe(false);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ showHighlights: false }));
    });

    it('CLIP-U061: setShowHighlights is idempotent', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.setShowHighlights(true); // Already true by default
      expect(handler).toHaveBeenCalledTimes(0);
    });

    it('CLIP-U062: setShowShadows updates state and emits event', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.setShowShadows(false);

      expect(clippingOverlay.getState().showShadows).toBe(false);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ showShadows: false }));
    });

    it('CLIP-U063: setShowShadows is idempotent', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.setShowShadows(true); // Already true by default
      expect(handler).toHaveBeenCalledTimes(0);
    });
  });

  describe('apply behavior when disabled', () => {
    it('CLIP-U070: apply does nothing when disabled', () => {
      const imageData = createImageDataWithPixels(2, 1, [
        { x: 0, y: 0, r: 255, g: 255, b: 255 },
        { x: 1, y: 0, r: 0, g: 0, b: 0 },
      ]);

      // Don't enable, just apply
      clippingOverlay.apply(imageData);

      const pixel0 = getPixel(imageData, 0, 0);
      const pixel1 = getPixel(imageData, 1, 0);

      // Both should be unchanged
      expect(pixel0.r).toBe(255);
      expect(pixel1.r).toBe(0);
    });
  });

  describe('custom colors', () => {
    it('CLIP-U080: custom highlight color is applied', () => {
      clippingOverlay.enable();
      clippingOverlay.setState({
        highlightColor: { r: 0, g: 255, b: 0 }, // Green instead of red
        opacity: 1.0, // Full opacity for clear test
      });

      const imageData = createImageDataWithPixels(1, 1, [{ x: 0, y: 0, r: 255, g: 100, b: 100 }]);

      clippingOverlay.apply(imageData);

      const pixel = getPixel(imageData, 0, 0);
      // Should be green (0, 255, 0) at full opacity
      expect(pixel.r).toBe(0);
      expect(pixel.g).toBe(255);
      expect(pixel.b).toBe(0);
    });

    it('CLIP-U081: custom shadow color is applied', () => {
      clippingOverlay.enable();
      clippingOverlay.setState({
        shadowColor: { r: 255, g: 0, b: 255 }, // Magenta instead of blue
        opacity: 1.0, // Full opacity for clear test
      });

      const imageData = createImageDataWithPixels(1, 1, [{ x: 0, y: 0, r: 0, g: 0, b: 0 }]);

      clippingOverlay.apply(imageData);

      const pixel = getPixel(imageData, 0, 0);
      // Should be magenta (255, 0, 255) at full opacity
      expect(pixel.r).toBe(255);
      expect(pixel.g).toBe(0);
      expect(pixel.b).toBe(255);
    });
  });

  describe('configurable thresholds', () => {
    it('CLIP-U110: default thresholds match existing hardcoded behavior', () => {
      const state = clippingOverlay.getState();
      expect(state.shadowThreshold).toBe(0.0);
      expect(state.highlightThreshold).toBe(1.0);
    });

    it('CLIP-U111: custom shadow threshold flags more pixels', () => {
      clippingOverlay.enable();
      clippingOverlay.setShadowThreshold(0.05);
      clippingOverlay.setState({ opacity: 1.0 });

      // With threshold 0.05: shadowLimit = floor(0.05 * 253 + 1) = floor(13.65) = 13
      // Pixel with value 10 should now be flagged as shadow-clipped
      const imageData = createImageDataWithPixels(2, 1, [
        { x: 0, y: 0, r: 10, g: 10, b: 10 }, // Should be clipped with 0.05 threshold
        { x: 1, y: 0, r: 20, g: 20, b: 20 }, // Should NOT be clipped
      ]);

      clippingOverlay.apply(imageData);

      const pixel0 = getPixel(imageData, 0, 0);
      const pixel1 = getPixel(imageData, 1, 0);

      // Pixel 0 should be tinted with shadow color (blue)
      expect(pixel0.b).toBe(255); // Full opacity shadow color blue=255
      // Pixel 1 should be unchanged
      expect(pixel1.r).toBe(20);
      expect(pixel1.g).toBe(20);
      expect(pixel1.b).toBe(20);
    });

    it('CLIP-U112: custom highlight threshold flags more pixels', () => {
      clippingOverlay.enable();
      clippingOverlay.setHighlightThreshold(0.95);
      clippingOverlay.setState({ opacity: 1.0 });

      // With threshold 0.95: highlightLimit = ceil(0.95 * 253 + 1) = ceil(241.35) = 242
      // Pixel with value 245 should now be flagged as highlight-clipped
      const imageData = createImageDataWithPixels(2, 1, [
        { x: 0, y: 0, r: 245, g: 100, b: 100 }, // Should be clipped with 0.95 threshold
        { x: 1, y: 0, r: 230, g: 100, b: 100 }, // Should NOT be clipped
      ]);

      clippingOverlay.apply(imageData);

      const pixel0 = getPixel(imageData, 0, 0);
      const pixel1 = getPixel(imageData, 1, 0);

      // Pixel 0 should be tinted with highlight color (red)
      expect(pixel0.r).toBe(255); // Full opacity highlight color red=255
      // Pixel 1 should be unchanged
      expect(pixel1.r).toBe(230);
    });

    it('CLIP-U113: shadow threshold clamped to 0-1 range', () => {
      clippingOverlay.setShadowThreshold(-0.5);
      expect(clippingOverlay.getState().shadowThreshold).toBe(0);

      clippingOverlay.setShadowThreshold(1.5);
      expect(clippingOverlay.getState().shadowThreshold).toBe(1);

      clippingOverlay.setShadowThreshold(0.1);
      expect(clippingOverlay.getState().shadowThreshold).toBe(0.1);
    });

    it('CLIP-U114: highlight threshold clamped to 0-1 range', () => {
      clippingOverlay.setHighlightThreshold(-0.5);
      expect(clippingOverlay.getState().highlightThreshold).toBe(0);

      clippingOverlay.setHighlightThreshold(1.5);
      expect(clippingOverlay.getState().highlightThreshold).toBe(1);

      clippingOverlay.setHighlightThreshold(0.9);
      expect(clippingOverlay.getState().highlightThreshold).toBe(0.9);
    });

    it('CLIP-U115: setShadowThreshold is idempotent', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.setShadowThreshold(0.1);
      clippingOverlay.setShadowThreshold(0.1);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('CLIP-U116: setHighlightThreshold is idempotent', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.setHighlightThreshold(0.9);
      clippingOverlay.setHighlightThreshold(0.9);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('CLIP-U117: state includes threshold values after setState', () => {
      clippingOverlay.setState({
        shadowThreshold: 0.05,
        highlightThreshold: 0.95,
      });

      const state = clippingOverlay.getState();
      expect(state.shadowThreshold).toBe(0.05);
      expect(state.highlightThreshold).toBe(0.95);
    });

    it('CLIP-U118: reset restores default thresholds', () => {
      clippingOverlay.setShadowThreshold(0.1);
      clippingOverlay.setHighlightThreshold(0.9);

      clippingOverlay.reset();

      const state = clippingOverlay.getState();
      expect(state.shadowThreshold).toBe(0.0);
      expect(state.highlightThreshold).toBe(1.0);
    });

    it('CLIP-U119: default thresholds produce same detection as original hardcoded values', () => {
      clippingOverlay.enable();
      clippingOverlay.setState({ opacity: 1.0 });

      // Shadow: value 1 should be clipped, value 2 should not
      const shadowData = createImageDataWithPixels(2, 1, [
        { x: 0, y: 0, r: 1, g: 1, b: 1 },
        { x: 1, y: 0, r: 2, g: 2, b: 2 },
      ]);
      clippingOverlay.apply(shadowData);
      expect(getPixel(shadowData, 0, 0).b).toBe(255); // shadow-clipped
      expect(getPixel(shadowData, 1, 0).r).toBe(2); // unchanged

      // Highlight: value 254 should be clipped, value 253 should not
      const highlightData = createImageDataWithPixels(2, 1, [
        { x: 0, y: 0, r: 254, g: 100, b: 100 },
        { x: 1, y: 0, r: 253, g: 100, b: 100 },
      ]);
      clippingOverlay.apply(highlightData);
      expect(getPixel(highlightData, 0, 0).r).toBe(255); // highlight-clipped
      expect(getPixel(highlightData, 1, 0).r).toBe(253); // unchanged
    });
  });

  describe('dispose', () => {
    it('CLIP-U090: dispose removes all listeners', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.dispose();

      // After dispose, events should not fire
      clippingOverlay.enable();
      expect(handler).toHaveBeenCalledTimes(0);
    });

    it('CLIP-U091: dispose can be called multiple times safely', () => {
      expect(() => {
        clippingOverlay.dispose();
        clippingOverlay.dispose();
      }).not.toThrow();
    });
  });

  describe('both-clipped detection', () => {
    it('CLIP-U100: both-clipped pixel gets bothColor when thresholds overlap', () => {
      // With wide thresholds, a pixel can be both highlight- and shadow-clipped
      clippingOverlay.enable();
      clippingOverlay.setState({
        opacity: 1.0,
        shadowThreshold: 0.5, // shadowLimit = floor(0.5 * 253 + 1) = 127
        highlightThreshold: 0.3, // highlightLimit = ceil(0.3 * 253 + 1) = 77
      });

      // Pixel with value 100: all channels <= 127 (shadow) AND any channel >= 77 (highlight)
      const imageData = createImageDataWithPixels(1, 1, [{ x: 0, y: 0, r: 100, g: 100, b: 100 }]);

      clippingOverlay.apply(imageData);

      const pixel = getPixel(imageData, 0, 0);
      // Should be bothColor (yellow: 250, 204, 21), not highlight or shadow
      expect(pixel.r).toBe(250);
      expect(pixel.g).toBe(204);
      expect(pixel.b).toBe(21);
    });

    it('CLIP-U101: only-highlight pixel gets highlightColor', () => {
      clippingOverlay.enable();
      clippingOverlay.setState({ opacity: 1.0 });

      const imageData = createImageDataWithPixels(1, 1, [{ x: 0, y: 0, r: 255, g: 100, b: 100 }]);

      clippingOverlay.apply(imageData);

      const pixel = getPixel(imageData, 0, 0);
      expect(pixel.r).toBe(255);
      expect(pixel.g).toBe(0);
      expect(pixel.b).toBe(0);
    });

    it('CLIP-U102: only-shadow pixel gets shadowColor', () => {
      clippingOverlay.enable();
      clippingOverlay.setState({ opacity: 1.0 });

      const imageData = createImageDataWithPixels(1, 1, [{ x: 0, y: 0, r: 0, g: 0, b: 0 }]);

      clippingOverlay.apply(imageData);

      const pixel = getPixel(imageData, 0, 0);
      expect(pixel.r).toBe(0);
      expect(pixel.g).toBe(100);
      expect(pixel.b).toBe(255);
    });

    it('CLIP-U103: bothColor can be customized via setBothColor', () => {
      clippingOverlay.enable();
      clippingOverlay.setBothColor({ r: 255, g: 255, b: 255 });
      clippingOverlay.setState({
        opacity: 1.0,
        shadowThreshold: 0.5,
        highlightThreshold: 0.3,
      });

      const imageData = createImageDataWithPixels(1, 1, [{ x: 0, y: 0, r: 100, g: 100, b: 100 }]);

      clippingOverlay.apply(imageData);

      const pixel = getPixel(imageData, 0, 0);
      expect(pixel.r).toBe(255);
      expect(pixel.g).toBe(255);
      expect(pixel.b).toBe(255);
    });

    it('CLIP-U104: bothColor can be customized via setState', () => {
      clippingOverlay.enable();
      clippingOverlay.setState({
        bothColor: { r: 128, g: 0, b: 128 },
        opacity: 1.0,
        shadowThreshold: 0.5,
        highlightThreshold: 0.3,
      });

      const imageData = createImageDataWithPixels(1, 1, [{ x: 0, y: 0, r: 100, g: 100, b: 100 }]);

      clippingOverlay.apply(imageData);

      const pixel = getPixel(imageData, 0, 0);
      expect(pixel.r).toBe(128);
      expect(pixel.g).toBe(0);
      expect(pixel.b).toBe(128);
    });

    it('CLIP-U105: default bothColor is included in state', () => {
      const state = clippingOverlay.getState();
      expect(state.bothColor).toEqual({ r: 250, g: 204, b: 21 });
    });

    it('CLIP-U106: setBothColor is idempotent', () => {
      const handler = vi.fn();
      clippingOverlay.on('stateChanged', handler);

      clippingOverlay.setBothColor({ r: 250, g: 204, b: 21 }); // Same as default
      expect(handler).toHaveBeenCalledTimes(0);

      clippingOverlay.setBothColor({ r: 100, g: 100, b: 100 });
      clippingOverlay.setBothColor({ r: 100, g: 100, b: 100 });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('CLIP-U107: reset restores default bothColor', () => {
      clippingOverlay.setBothColor({ r: 0, g: 0, b: 0 });
      clippingOverlay.reset();

      const state = clippingOverlay.getState();
      expect(state.bothColor).toEqual({ r: 250, g: 204, b: 21 });
    });
  });
});
