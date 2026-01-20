import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HSLQualifier } from './HSLQualifier';

/**
 * Helper to create test ImageData with specific RGB values
 */
function createImageData(width: number, height: number, fillValue: number = 128): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fillValue;     // R
    data[i + 1] = fillValue; // G
    data[i + 2] = fillValue; // B
    data[i + 3] = 255;       // A
  }
  return new ImageData(data, width, height);
}

/**
 * Helper to create ImageData with specific color at specific pixel
 */
function createColoredImageData(
  width: number,
  height: number,
  colors: Array<{ x: number; y: number; r: number; g: number; b: number }>
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  // Fill with gray
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128;
    data[i + 1] = 128;
    data[i + 2] = 128;
    data[i + 3] = 255;
  }
  // Set specific colors
  for (const { x, y, r, g, b } of colors) {
    const idx = (y * width + x) * 4;
    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
  }
  return new ImageData(data, width, height);
}

describe('HSLQualifier', () => {
  let hslQualifier: HSLQualifier;

  beforeEach(() => {
    hslQualifier = new HSLQualifier();
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      const state = hslQualifier.getState();
      expect(state.enabled).toBe(false);
      expect(state.hue.center).toBe(0);
      expect(state.hue.width).toBe(30);
      expect(state.hue.softness).toBe(20);
      expect(state.saturation.center).toBe(50);
      expect(state.luminance.center).toBe(50);
      expect(state.correction.hueShift).toBe(0);
      expect(state.correction.saturationScale).toBe(1);
      expect(state.correction.luminanceScale).toBe(1);
      expect(state.invert).toBe(false);
      expect(state.mattePreview).toBe(false);
    });

    it('should not be enabled by default', () => {
      expect(hslQualifier.isEnabled()).toBe(false);
    });
  });

  describe('Enable/Disable', () => {
    it('should enable the qualifier', () => {
      hslQualifier.enable();
      expect(hslQualifier.isEnabled()).toBe(true);
    });

    it('should disable the qualifier', () => {
      hslQualifier.enable();
      hslQualifier.disable();
      expect(hslQualifier.isEnabled()).toBe(false);
    });

    it('should toggle the qualifier', () => {
      expect(hslQualifier.isEnabled()).toBe(false);
      hslQualifier.toggle();
      expect(hslQualifier.isEnabled()).toBe(true);
      hslQualifier.toggle();
      expect(hslQualifier.isEnabled()).toBe(false);
    });

    it('should emit stateChanged event when enabled', () => {
      const callback = vi.fn();
      hslQualifier.on('stateChanged', callback);
      hslQualifier.enable();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('should emit stateChanged event when disabled', () => {
      hslQualifier.enable();
      const callback = vi.fn();
      hslQualifier.on('stateChanged', callback);
      hslQualifier.disable();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });

    it('should not emit event if already enabled', () => {
      hslQualifier.enable();
      const callback = vi.fn();
      hslQualifier.on('stateChanged', callback);
      hslQualifier.enable();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should not emit event if already disabled', () => {
      const callback = vi.fn();
      hslQualifier.on('stateChanged', callback);
      hslQualifier.disable();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Hue Range', () => {
    it('should set hue center', () => {
      hslQualifier.setHueRange({ center: 180 });
      expect(hslQualifier.getState().hue.center).toBe(180);
    });

    it('should set hue width', () => {
      hslQualifier.setHueRange({ width: 60 });
      expect(hslQualifier.getState().hue.width).toBe(60);
    });

    it('should set hue softness', () => {
      hslQualifier.setHueRange({ softness: 50 });
      expect(hslQualifier.getState().hue.softness).toBe(50);
    });

    it('should wrap hue center to 0-360 range (positive)', () => {
      hslQualifier.setHueRange({ center: 400 });
      expect(hslQualifier.getState().hue.center).toBe(40);
    });

    it('should wrap hue center to 0-360 range (negative)', () => {
      hslQualifier.setHueRange({ center: -30 });
      expect(hslQualifier.getState().hue.center).toBe(330);
    });
  });

  describe('Saturation Range', () => {
    it('should set saturation center', () => {
      hslQualifier.setSaturationRange({ center: 75 });
      expect(hslQualifier.getState().saturation.center).toBe(75);
    });

    it('should clamp saturation center to 0-100', () => {
      hslQualifier.setSaturationRange({ center: 150 });
      expect(hslQualifier.getState().saturation.center).toBe(100);
      hslQualifier.setSaturationRange({ center: -10 });
      expect(hslQualifier.getState().saturation.center).toBe(0);
    });

    it('should set saturation width', () => {
      hslQualifier.setSaturationRange({ width: 50 });
      expect(hslQualifier.getState().saturation.width).toBe(50);
    });

    it('should set saturation softness', () => {
      hslQualifier.setSaturationRange({ softness: 30 });
      expect(hslQualifier.getState().saturation.softness).toBe(30);
    });
  });

  describe('Luminance Range', () => {
    it('should set luminance center', () => {
      hslQualifier.setLuminanceRange({ center: 25 });
      expect(hslQualifier.getState().luminance.center).toBe(25);
    });

    it('should clamp luminance center to 0-100', () => {
      hslQualifier.setLuminanceRange({ center: 120 });
      expect(hslQualifier.getState().luminance.center).toBe(100);
      hslQualifier.setLuminanceRange({ center: -5 });
      expect(hslQualifier.getState().luminance.center).toBe(0);
    });

    it('should set luminance width', () => {
      hslQualifier.setLuminanceRange({ width: 80 });
      expect(hslQualifier.getState().luminance.width).toBe(80);
    });
  });

  describe('Correction Values', () => {
    it('should set hue shift', () => {
      hslQualifier.setCorrection({ hueShift: 45 });
      expect(hslQualifier.getState().correction.hueShift).toBe(45);
    });

    it('should clamp hue shift to -180 to +180', () => {
      hslQualifier.setCorrection({ hueShift: 200 });
      expect(hslQualifier.getState().correction.hueShift).toBe(180);
      hslQualifier.setCorrection({ hueShift: -200 });
      expect(hslQualifier.getState().correction.hueShift).toBe(-180);
    });

    it('should set saturation scale', () => {
      hslQualifier.setCorrection({ saturationScale: 1.5 });
      expect(hslQualifier.getState().correction.saturationScale).toBe(1.5);
    });

    it('should clamp saturation scale to 0-2', () => {
      hslQualifier.setCorrection({ saturationScale: 3 });
      expect(hslQualifier.getState().correction.saturationScale).toBe(2);
      hslQualifier.setCorrection({ saturationScale: -1 });
      expect(hslQualifier.getState().correction.saturationScale).toBe(0);
    });

    it('should set luminance scale', () => {
      hslQualifier.setCorrection({ luminanceScale: 0.5 });
      expect(hslQualifier.getState().correction.luminanceScale).toBe(0.5);
    });

    it('should clamp luminance scale to 0-2', () => {
      hslQualifier.setCorrection({ luminanceScale: 2.5 });
      expect(hslQualifier.getState().correction.luminanceScale).toBe(2);
    });
  });

  describe('Invert', () => {
    it('should set invert mode', () => {
      hslQualifier.setInvert(true);
      expect(hslQualifier.getState().invert).toBe(true);
    });

    it('should toggle invert mode', () => {
      expect(hslQualifier.getState().invert).toBe(false);
      hslQualifier.toggleInvert();
      expect(hslQualifier.getState().invert).toBe(true);
      hslQualifier.toggleInvert();
      expect(hslQualifier.getState().invert).toBe(false);
    });

    it('should not emit event if invert value is same', () => {
      const callback = vi.fn();
      hslQualifier.on('stateChanged', callback);
      hslQualifier.setInvert(false);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Matte Preview', () => {
    it('should set matte preview mode', () => {
      hslQualifier.setMattePreview(true);
      expect(hslQualifier.getState().mattePreview).toBe(true);
    });

    it('should toggle matte preview mode', () => {
      expect(hslQualifier.getState().mattePreview).toBe(false);
      hslQualifier.toggleMattePreview();
      expect(hslQualifier.getState().mattePreview).toBe(true);
      hslQualifier.toggleMattePreview();
      expect(hslQualifier.getState().mattePreview).toBe(false);
    });
  });

  describe('State Management', () => {
    it('should set full state with partial update', () => {
      hslQualifier.setState({
        enabled: true,
        hue: { center: 120, width: 40, softness: 30 },
      });
      const state = hslQualifier.getState();
      expect(state.enabled).toBe(true);
      expect(state.hue.center).toBe(120);
      expect(state.hue.width).toBe(40);
    });

    it('should reset to default state', () => {
      hslQualifier.enable();
      hslQualifier.setHueRange({ center: 180 });
      hslQualifier.setCorrection({ hueShift: 30 });
      hslQualifier.reset();
      const state = hslQualifier.getState();
      expect(state.enabled).toBe(false);
      expect(state.hue.center).toBe(0);
      expect(state.correction.hueShift).toBe(0);
    });

    it('should return deep copy of state', () => {
      const state1 = hslQualifier.getState();
      state1.hue.center = 999;
      const state2 = hslQualifier.getState();
      expect(state2.hue.center).toBe(0); // Original state unchanged
    });
  });

  describe('hasCorrections', () => {
    it('should return false when no corrections applied', () => {
      expect(hslQualifier.hasCorrections()).toBe(false);
    });

    it('should return true when hue shift is non-zero', () => {
      hslQualifier.setCorrection({ hueShift: 10 });
      expect(hslQualifier.hasCorrections()).toBe(true);
    });

    it('should return true when saturation scale is not 1', () => {
      hslQualifier.setCorrection({ saturationScale: 1.5 });
      expect(hslQualifier.hasCorrections()).toBe(true);
    });

    it('should return true when luminance scale is not 1', () => {
      hslQualifier.setCorrection({ luminanceScale: 0.8 });
      expect(hslQualifier.hasCorrections()).toBe(true);
    });
  });

  describe('pickColor', () => {
    it('should pick red color (hue ~0)', () => {
      hslQualifier.pickColor(255, 0, 0);
      const state = hslQualifier.getState();
      expect(state.hue.center).toBeCloseTo(0, 0);
      expect(state.saturation.center).toBeCloseTo(100, 0);
      expect(state.luminance.center).toBeCloseTo(50, 0);
    });

    it('should pick green color (hue ~120)', () => {
      hslQualifier.pickColor(0, 255, 0);
      const state = hslQualifier.getState();
      expect(state.hue.center).toBeCloseTo(120, 0);
    });

    it('should pick blue color (hue ~240)', () => {
      hslQualifier.pickColor(0, 0, 255);
      const state = hslQualifier.getState();
      expect(state.hue.center).toBeCloseTo(240, 0);
    });

    it('should pick yellow color (hue ~60)', () => {
      hslQualifier.pickColor(255, 255, 0);
      const state = hslQualifier.getState();
      expect(state.hue.center).toBeCloseTo(60, 0);
    });

    it('should pick gray color (low saturation)', () => {
      hslQualifier.pickColor(128, 128, 128);
      const state = hslQualifier.getState();
      expect(state.saturation.center).toBe(0);
      expect(state.luminance.center).toBeCloseTo(50, 0);
    });
  });

  describe('apply() - Basic Functionality', () => {
    it('should not modify image when disabled', () => {
      const imageData = createImageData(2, 2, 128);
      const originalData = new Uint8ClampedArray(imageData.data);

      hslQualifier.apply(imageData);

      expect(imageData.data).toEqual(originalData);
    });

    it('should not modify gray pixels when selecting red hue', () => {
      hslQualifier.enable();
      hslQualifier.setHueRange({ center: 0, width: 30, softness: 10 }); // Red
      hslQualifier.setCorrection({ hueShift: 60 }); // Shift to yellow

      const imageData = createImageData(2, 2, 128); // Gray image
      const originalData = new Uint8ClampedArray(imageData.data);

      hslQualifier.apply(imageData);

      // Gray pixels have 0 saturation, so they shouldn't be affected
      expect(imageData.data).toEqual(originalData);
    });
  });

  describe('apply() - Hue Selection', () => {
    it('HSL-001: Hue selection isolates specific color', () => {
      hslQualifier.enable();
      hslQualifier.setMattePreview(true);
      // Select red hue range
      hslQualifier.setHueRange({ center: 0, width: 60, softness: 20 });
      hslQualifier.setSaturationRange({ center: 50, width: 100, softness: 50 });
      hslQualifier.setLuminanceRange({ center: 50, width: 100, softness: 50 });

      // Create image with red pixel and blue pixel
      const imageData = createColoredImageData(2, 1, [
        { x: 0, y: 0, r: 255, g: 0, b: 0 },   // Red - should be selected (white matte)
        { x: 1, y: 0, r: 0, g: 0, b: 255 },   // Blue - should not be selected (black matte)
      ]);

      hslQualifier.apply(imageData);

      // Red pixel (x=0) should have high matte (white-ish)
      const redMatte = imageData.data[0];
      // Blue pixel (x=1) should have low matte (black-ish)
      const blueMatte = imageData.data[4];

      expect(redMatte).toBeGreaterThan(200);
      expect(blueMatte).toBeLessThan(50);
    });

    it('HSL-008: Hue wrap-around handles red correctly', () => {
      hslQualifier.enable();
      hslQualifier.setMattePreview(true);
      // Select around hue 350 (should wrap to include hue 10)
      hslQualifier.setHueRange({ center: 350, width: 40, softness: 10 });
      hslQualifier.setSaturationRange({ center: 50, width: 100, softness: 50 });
      hslQualifier.setLuminanceRange({ center: 50, width: 100, softness: 50 });

      // Create red image (hue ~0)
      const imageData = createColoredImageData(1, 1, [
        { x: 0, y: 0, r: 255, g: 0, b: 0 },
      ]);

      hslQualifier.apply(imageData);

      // Red pixel should be selected due to wrap-around
      expect(imageData.data[0]).toBeGreaterThan(200);
    });
  });

  describe('apply() - Saturation and Luminance Selection', () => {
    it('HSL-002: Saturation range filters by color intensity', () => {
      hslQualifier.enable();
      hslQualifier.setMattePreview(true);
      // Select high saturation only (center 100%, width 20, so 80-100% range)
      hslQualifier.setHueRange({ center: 0, width: 180, softness: 50 }); // Wide hue
      hslQualifier.setSaturationRange({ center: 95, width: 10, softness: 5 }); // Very high sat only (90-100%)
      hslQualifier.setLuminanceRange({ center: 50, width: 100, softness: 50 });

      // Create saturated red and nearly-gray pink
      const imageData = createColoredImageData(2, 1, [
        { x: 0, y: 0, r: 255, g: 0, b: 0 },     // Fully saturated (100%)
        { x: 1, y: 0, r: 150, g: 130, b: 130 }, // Very low saturation (~15%)
      ]);

      hslQualifier.apply(imageData);

      // Saturated red should be selected
      expect(imageData.data[0]).toBeGreaterThan(150);
      // Very desaturated color should not be selected
      expect(imageData.data[4]).toBeLessThan(80);
    });

    it('HSL-003: Luminance range filters by brightness', () => {
      hslQualifier.enable();
      hslQualifier.setMattePreview(true);
      // Select mid-luminance only
      hslQualifier.setHueRange({ center: 0, width: 180, softness: 50 });
      hslQualifier.setSaturationRange({ center: 50, width: 100, softness: 50 });
      hslQualifier.setLuminanceRange({ center: 50, width: 30, softness: 10 }); // Mid lum only

      // Create bright, mid, and dark versions
      const imageData = createColoredImageData(3, 1, [
        { x: 0, y: 0, r: 255, g: 255, b: 255 }, // Bright (high lum)
        { x: 1, y: 0, r: 128, g: 128, b: 128 }, // Mid (gray)
        { x: 2, y: 0, r: 32, g: 32, b: 32 },    // Dark (low lum)
      ]);

      hslQualifier.apply(imageData);

      // Mid luminance should be selected more
      const brightMatte = imageData.data[0]!;
      const midMatte = imageData.data[4]!;
      const darkMatte = imageData.data[8]!;

      expect(midMatte).toBeGreaterThan(brightMatte);
      expect(midMatte).toBeGreaterThan(darkMatte);
    });
  });

  describe('apply() - Softness/Falloff', () => {
    it('HSL-004: Soft falloff creates smooth matte edges', () => {
      hslQualifier.enable();
      hslQualifier.setMattePreview(true);
      // Select around hue 60 (yellow) with softness
      hslQualifier.setHueRange({ center: 60, width: 20, softness: 50 });
      hslQualifier.setSaturationRange({ center: 50, width: 100, softness: 50 });
      hslQualifier.setLuminanceRange({ center: 50, width: 100, softness: 50 });

      // Create colors at different hue distances
      const imageData = createColoredImageData(3, 1, [
        { x: 0, y: 0, r: 255, g: 255, b: 0 },   // Yellow (hue 60) - fully selected
        { x: 1, y: 0, r: 255, g: 200, b: 0 },   // Orange-yellow - partially selected
        { x: 2, y: 0, r: 255, g: 128, b: 0 },   // Orange (hue ~30) - less selected
      ]);

      hslQualifier.apply(imageData);

      // Yellow should be brightest (most selected)
      const yellowMatte = imageData.data[0]!;
      const orangeYellowMatte = imageData.data[4]!;
      const orangeMatte = imageData.data[8]!;

      // Verify gradient: yellow > orange-yellow > orange
      expect(yellowMatte).toBeGreaterThanOrEqual(orangeYellowMatte);
      expect(orangeYellowMatte).toBeGreaterThanOrEqual(orangeMatte);
    });
  });

  describe('apply() - Matte Preview', () => {
    it('HSL-005: Matte preview shows selection accurately', () => {
      hslQualifier.enable();
      hslQualifier.setMattePreview(true);
      hslQualifier.setHueRange({ center: 0, width: 60, softness: 20 });

      // Create red pixel
      const imageData = createColoredImageData(1, 1, [
        { x: 0, y: 0, r: 255, g: 0, b: 0 },
      ]);

      hslQualifier.apply(imageData);

      // In matte preview, all channels should be equal (grayscale)
      expect(imageData.data[0]!).toBe(imageData.data[1]!);
      expect(imageData.data[1]!).toBe(imageData.data[2]!);
    });

    it('should show white for fully selected and black for unselected in matte preview', () => {
      hslQualifier.enable();
      hslQualifier.setMattePreview(true);
      // Very narrow selection on red
      hslQualifier.setHueRange({ center: 0, width: 30, softness: 5 });
      hslQualifier.setSaturationRange({ center: 100, width: 50, softness: 10 });
      hslQualifier.setLuminanceRange({ center: 50, width: 50, softness: 10 });

      const imageData = createColoredImageData(2, 1, [
        { x: 0, y: 0, r: 255, g: 0, b: 0 }, // Red - should be white
        { x: 1, y: 0, r: 0, g: 255, b: 0 }, // Green - should be black
      ]);

      hslQualifier.apply(imageData);

      expect(imageData.data[0]).toBeGreaterThan(200); // Red pixel -> white matte
      expect(imageData.data[4]).toBeLessThan(50);     // Green pixel -> black matte
    });
  });

  describe('apply() - Invert Selection', () => {
    it('HSL-006: Invert selection works correctly', () => {
      hslQualifier.enable();
      hslQualifier.setMattePreview(true);
      hslQualifier.setHueRange({ center: 0, width: 60, softness: 20 });
      hslQualifier.setSaturationRange({ center: 50, width: 100, softness: 50 });
      hslQualifier.setLuminanceRange({ center: 50, width: 100, softness: 50 });

      // Red pixel
      const imageData1 = createColoredImageData(1, 1, [
        { x: 0, y: 0, r: 255, g: 0, b: 0 },
      ]);
      hslQualifier.apply(imageData1);
      const normalMatte = imageData1.data[0]!;

      // Now with invert
      hslQualifier.setInvert(true);
      const imageData2 = createColoredImageData(1, 1, [
        { x: 0, y: 0, r: 255, g: 0, b: 0 },
      ]);
      hslQualifier.apply(imageData2);
      const invertedMatte = imageData2.data[0]!;

      // Inverted should be opposite
      expect(normalMatte + invertedMatte).toBeCloseTo(255, -1);
    });
  });

  describe('apply() - Corrections', () => {
    it('HSL-007: Corrections apply only to selected region', () => {
      hslQualifier.enable();
      // Select red hue
      hslQualifier.setHueRange({ center: 0, width: 60, softness: 10 });
      hslQualifier.setSaturationRange({ center: 50, width: 100, softness: 50 });
      hslQualifier.setLuminanceRange({ center: 50, width: 100, softness: 50 });
      // Desaturate selected region
      hslQualifier.setCorrection({ saturationScale: 0 });

      const imageData = createColoredImageData(2, 1, [
        { x: 0, y: 0, r: 255, g: 0, b: 0 },   // Red - should be desaturated
        { x: 1, y: 0, r: 0, g: 255, b: 0 },   // Green - should stay green
      ]);

      hslQualifier.apply(imageData);

      // Red pixel should be desaturated (gray-ish)
      const r1 = imageData.data[0]!;
      const g1 = imageData.data[1]!;
      // Desaturated red becomes gray (R,G,B should be closer)
      expect(Math.abs(r1 - g1)).toBeLessThan(100);

      // Green pixel should still be green (high G, low R/B)
      const r2 = imageData.data[4]!;
      const g2 = imageData.data[5]!;
      const b2 = imageData.data[6]!;
      expect(g2).toBeGreaterThan(r2 + 100);
      expect(g2).toBeGreaterThan(b2 + 100);
    });

    it('should apply hue shift to selected region', () => {
      hslQualifier.enable();
      // Select red hue
      hslQualifier.setHueRange({ center: 0, width: 60, softness: 10 });
      hslQualifier.setSaturationRange({ center: 50, width: 100, softness: 50 });
      hslQualifier.setLuminanceRange({ center: 50, width: 100, softness: 50 });
      // Shift hue by 120 (red -> green)
      hslQualifier.setCorrection({ hueShift: 120 });

      const imageData = createColoredImageData(1, 1, [
        { x: 0, y: 0, r: 255, g: 0, b: 0 },
      ]);

      hslQualifier.apply(imageData);

      // After hue shift, red should become green-ish
      const r = imageData.data[0]!;
      const g = imageData.data[1]!;
      const b = imageData.data[2]!;

      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    });
  });

  describe('dispose', () => {
    it('should remove all listeners on dispose', () => {
      const callback = vi.fn();
      hslQualifier.on('stateChanged', callback);
      hslQualifier.dispose();
      hslQualifier.enable();
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
