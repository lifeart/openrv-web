/**
 * DifferenceMatteControl Component Tests
 *
 * Tests for the difference matte comparison tool that shows pixel differences
 * between A/B sources with optional gain and heatmap visualization.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DifferenceMatteControl,
  DEFAULT_DIFFERENCE_MATTE_STATE,
  applyDifferenceMatte,
} from './DifferenceMatteControl';

describe('DifferenceMatteControl', () => {
  let control: DifferenceMatteControl;

  beforeEach(() => {
    control = new DifferenceMatteControl();
  });

  describe('initialization', () => {
    it('DIFF-U001: should initialize with default state', () => {
      expect(control.getState()).toEqual(DEFAULT_DIFFERENCE_MATTE_STATE);
    });

    it('DIFF-U002: default state should be disabled', () => {
      expect(control.isEnabled()).toBe(false);
    });

    it('DIFF-U003: default gain should be 1.0', () => {
      expect(control.getGain()).toBe(1.0);
    });

    it('DIFF-U004: default heatmap should be false', () => {
      expect(control.isHeatmap()).toBe(false);
    });
  });

  describe('enable/disable', () => {
    it('DIFF-U010: enable() enables difference matte', () => {
      control.enable();
      expect(control.isEnabled()).toBe(true);
    });

    it('DIFF-U011: disable() disables difference matte', () => {
      control.enable();
      control.disable();
      expect(control.isEnabled()).toBe(false);
    });

    it('DIFF-U012: toggle() switches enabled state', () => {
      expect(control.isEnabled()).toBe(false);
      control.toggle();
      expect(control.isEnabled()).toBe(true);
      control.toggle();
      expect(control.isEnabled()).toBe(false);
    });

    it('DIFF-U013: enable() emits enabledChanged event', () => {
      const callback = vi.fn();
      control.on('enabledChanged', callback);

      control.enable();
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('DIFF-U014: disable() emits enabledChanged event', () => {
      control.enable();
      const callback = vi.fn();
      control.on('enabledChanged', callback);

      control.disable();
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('DIFF-U015: enable() does not emit if already enabled', () => {
      control.enable();
      const callback = vi.fn();
      control.on('enabledChanged', callback);

      control.enable();
      expect(callback).not.toHaveBeenCalled();
    });

    it('DIFF-U016: disable() does not emit if already disabled', () => {
      const callback = vi.fn();
      control.on('enabledChanged', callback);

      control.disable();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('gain', () => {
    it('DIFF-U020: setGain sets gain value', () => {
      control.setGain(5.0);
      expect(control.getGain()).toBe(5.0);
    });

    it('DIFF-U021: setGain clamps to minimum 1.0', () => {
      control.setGain(0.5);
      expect(control.getGain()).toBe(1.0);

      control.setGain(-5);
      expect(control.getGain()).toBe(1.0);
    });

    it('DIFF-U022: setGain clamps to maximum 10.0', () => {
      control.setGain(15);
      expect(control.getGain()).toBe(10.0);
    });

    it('DIFF-U023: setGain accepts boundary values', () => {
      control.setGain(1.0);
      expect(control.getGain()).toBe(1.0);

      control.setGain(10.0);
      expect(control.getGain()).toBe(10.0);
    });

    it('DIFF-U024: setGain emits gainChanged event', () => {
      const callback = vi.fn();
      control.on('gainChanged', callback);

      control.setGain(5.0);
      expect(callback).toHaveBeenCalledWith(5.0);
    });

    it('DIFF-U025: setGain does not emit if value unchanged', () => {
      control.setGain(5.0);
      const callback = vi.fn();
      control.on('gainChanged', callback);

      control.setGain(5.0);
      expect(callback).not.toHaveBeenCalled();
    });

    it('DIFF-U026: setGain with clamped value emits clamped value', () => {
      const callback = vi.fn();
      control.on('gainChanged', callback);

      control.setGain(15); // Should clamp to 10
      expect(callback).toHaveBeenCalledWith(10.0);
    });
  });

  describe('heatmap', () => {
    it('DIFF-U030: enableHeatmap enables heatmap mode', () => {
      control.enableHeatmap();
      expect(control.isHeatmap()).toBe(true);
    });

    it('DIFF-U031: disableHeatmap disables heatmap mode', () => {
      control.enableHeatmap();
      control.disableHeatmap();
      expect(control.isHeatmap()).toBe(false);
    });

    it('DIFF-U032: toggleHeatmap switches heatmap state', () => {
      expect(control.isHeatmap()).toBe(false);
      control.toggleHeatmap();
      expect(control.isHeatmap()).toBe(true);
      control.toggleHeatmap();
      expect(control.isHeatmap()).toBe(false);
    });

    it('DIFF-U033: enableHeatmap emits heatmapChanged event', () => {
      const callback = vi.fn();
      control.on('heatmapChanged', callback);

      control.enableHeatmap();
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('DIFF-U034: disableHeatmap emits heatmapChanged event', () => {
      control.enableHeatmap();
      const callback = vi.fn();
      control.on('heatmapChanged', callback);

      control.disableHeatmap();
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('DIFF-U035: enableHeatmap does not emit if already enabled', () => {
      control.enableHeatmap();
      const callback = vi.fn();
      control.on('heatmapChanged', callback);

      control.enableHeatmap();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    it('DIFF-U040: getState returns copy of state', () => {
      const state1 = control.getState();
      const state2 = control.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('DIFF-U041: setState sets multiple values at once', () => {
      control.setState({ enabled: true, gain: 5.0, heatmap: true });
      const state = control.getState();
      expect(state.enabled).toBe(true);
      expect(state.gain).toBe(5.0);
      expect(state.heatmap).toBe(true);
    });

    it('DIFF-U042: setState accepts partial state', () => {
      control.setState({ gain: 3.0 });
      const state = control.getState();
      expect(state.gain).toBe(3.0);
      expect(state.enabled).toBe(false); // Unchanged
      expect(state.heatmap).toBe(false); // Unchanged
    });

    it('DIFF-U043: setState clamps gain value', () => {
      control.setState({ gain: 20 });
      expect(control.getGain()).toBe(10.0);

      control.setState({ gain: -5 });
      expect(control.getGain()).toBe(1.0);
    });

    it('DIFF-U044: setState emits stateChanged event', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setState({ enabled: true });
      expect(callback).toHaveBeenCalled();
    });

    it('DIFF-U045: reset restores default state', () => {
      control.enable();
      control.setGain(5.0);
      control.enableHeatmap();

      control.reset();

      expect(control.getState()).toEqual(DEFAULT_DIFFERENCE_MATTE_STATE);
    });

    it('DIFF-U046: reset emits stateChanged event', () => {
      control.enable();
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.reset();
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('stateChanged event', () => {
    it('DIFF-U050: enable/disable emits stateChanged', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.enable();
      expect(callback).toHaveBeenCalledTimes(1);

      control.disable();
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('DIFF-U051: setGain emits stateChanged', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.setGain(5.0);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('DIFF-U052: heatmap toggle emits stateChanged', () => {
      const callback = vi.fn();
      control.on('stateChanged', callback);

      control.toggleHeatmap();
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});

describe('applyDifferenceMatte function', () => {
  describe('grayscale mode', () => {
    it('DIFF-U060: identical images produce black output', () => {
      const imageA = createImageData(2, 2, [100, 100, 100, 255]);
      const imageB = createImageData(2, 2, [100, 100, 100, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 1.0, false);

      // All pixels should be black (0, 0, 0)
      for (let i = 0; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(0);
        expect(result.data[i + 1]).toBe(0);
        expect(result.data[i + 2]).toBe(0);
        expect(result.data[i + 3]).toBe(255); // Full opacity
      }
    });

    it('DIFF-U061: completely different images produce bright output', () => {
      const imageA = createImageData(2, 2, [0, 0, 0, 255]);
      const imageB = createImageData(2, 2, [255, 255, 255, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 1.0, false);

      // Difference is 255 per channel, average = 255
      for (let i = 0; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(255);
        expect(result.data[i + 1]).toBe(255);
        expect(result.data[i + 2]).toBe(255);
      }
    });

    it('DIFF-U062: partial difference produces gray output', () => {
      const imageA = createImageData(2, 2, [100, 100, 100, 255]);
      const imageB = createImageData(2, 2, [150, 150, 150, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 1.0, false);

      // Difference is 50 per channel, average = 50
      for (let i = 0; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(50);
        expect(result.data[i + 1]).toBe(50);
        expect(result.data[i + 2]).toBe(50);
      }
    });

    it('DIFF-U063: computes absolute difference (A < B)', () => {
      const imageA = createImageData(2, 2, [50, 50, 50, 255]);
      const imageB = createImageData(2, 2, [100, 100, 100, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 1.0, false);

      // |50 - 100| = 50
      for (let i = 0; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(50);
      }
    });

    it('DIFF-U064: computes absolute difference (A > B)', () => {
      const imageA = createImageData(2, 2, [100, 100, 100, 255]);
      const imageB = createImageData(2, 2, [50, 50, 50, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 1.0, false);

      // |100 - 50| = 50
      for (let i = 0; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(50);
      }
    });
  });

  describe('gain amplification', () => {
    it('DIFF-U070: gain of 2.0 doubles difference', () => {
      const imageA = createImageData(2, 2, [100, 100, 100, 255]);
      const imageB = createImageData(2, 2, [150, 150, 150, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 2.0, false);

      // Difference is 50, with gain 2.0 = 100
      for (let i = 0; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(100);
      }
    });

    it('DIFF-U071: gain clamps at 255', () => {
      const imageA = createImageData(2, 2, [0, 0, 0, 255]);
      const imageB = createImageData(2, 2, [100, 100, 100, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 5.0, false);

      // Difference is 100, with gain 5.0 = 500, clamped to 255
      for (let i = 0; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(255);
      }
    });

    it('DIFF-U072: gain of 1.0 does not change value', () => {
      const imageA = createImageData(2, 2, [100, 100, 100, 255]);
      const imageB = createImageData(2, 2, [130, 130, 130, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 1.0, false);

      // Difference is 30, with gain 1.0 = 30
      for (let i = 0; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(30);
      }
    });
  });

  describe('heatmap mode', () => {
    it('DIFF-U080: zero difference produces dark/black output', () => {
      const imageA = createImageData(2, 2, [100, 100, 100, 255]);
      const imageB = createImageData(2, 2, [100, 100, 100, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 1.0, true);

      // Zero difference = black in heatmap
      for (let i = 0; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(0); // R
        expect(result.data[i + 1]).toBe(0); // G
        expect(result.data[i + 2]).toBe(0); // B
      }
    });

    it('DIFF-U081: small difference produces blue output', () => {
      // Difference of ~50 = 50/255 = 0.196 (in 0-0.25 range = black to blue)
      const imageA = createImageData(2, 2, [100, 100, 100, 255]);
      const imageB = createImageData(2, 2, [150, 150, 150, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 1.0, true);

      // Should be in blue range
      const pixel = getPixel(result, 0, 0);
      expect(pixel[2]).toBeGreaterThan(0); // Has blue
    });

    it('DIFF-U082: maximum difference produces red/white output', () => {
      const imageA = createImageData(2, 2, [0, 0, 0, 255]);
      const imageB = createImageData(2, 2, [255, 255, 255, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 1.0, true);

      // Maximum difference = red/white in heatmap
      const pixel = getPixel(result, 0, 0);
      expect(pixel[0]).toBe(255); // Red is at max
    });

    it('DIFF-U083: medium difference produces green output', () => {
      // Difference of ~128 = 128/255 = 0.5 (in 0.5 range = green)
      const imageA = createImageData(2, 2, [0, 0, 0, 255]);
      const imageB = createImageData(2, 2, [128, 128, 128, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 1.0, true);

      // Should be in green range
      const pixel = getPixel(result, 0, 0);
      expect(pixel[1]).toBeGreaterThan(pixel[0]); // More green than red
    });

    it('DIFF-U084: heatmap with gain amplifies before color mapping', () => {
      // Small difference amplified with gain
      const imageA = createImageData(2, 2, [100, 100, 100, 255]);
      const imageB = createImageData(2, 2, [110, 110, 110, 255]); // 10 difference

      const result1x = applyDifferenceMatte(imageA, imageB, 1.0, true);
      const result10x = applyDifferenceMatte(imageA, imageB, 10.0, true);

      const pixel1x = getPixel(result1x, 0, 0);
      const pixel10x = getPixel(result10x, 0, 0);

      // 10x gain should produce brighter/different color
      const brightness1x = pixel1x[0] + pixel1x[1] + pixel1x[2];
      const brightness10x = pixel10x[0] + pixel10x[1] + pixel10x[2];
      expect(brightness10x).toBeGreaterThan(brightness1x);
    });
  });

  describe('per-channel differences', () => {
    it('DIFF-U090: handles different R/G/B differences', () => {
      const imageA = createImageData(2, 2, [100, 50, 200, 255]);
      const imageB = createImageData(2, 2, [150, 100, 150, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 1.0, false);

      // R: |100-150| = 50
      // G: |50-100| = 50
      // B: |200-150| = 50
      // Average = (50+50+50)/3 = 50
      const pixel = getPixel(result, 0, 0);
      expect(pixel[0]).toBe(50);
      expect(pixel[1]).toBe(50);
      expect(pixel[2]).toBe(50);
    });

    it('DIFF-U091: asymmetric channel differences produce average', () => {
      const imageA = createImageData(2, 2, [100, 100, 100, 255]);
      const imageB = createImageData(2, 2, [200, 100, 100, 255]); // Only R differs

      const result = applyDifferenceMatte(imageA, imageB, 1.0, false);

      // R: 100, G: 0, B: 0
      // Average = (100+0+0)/3 = 33.33
      const pixel = getPixel(result, 0, 0);
      expect(pixel[0]).toBeCloseTo(33, 0);
    });
  });

  describe('edge cases', () => {
    it('DIFF-U100: handles 1x1 image', () => {
      const imageA = createImageData(1, 1, [100, 100, 100, 255]);
      const imageB = createImageData(1, 1, [150, 150, 150, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 1.0, false);

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.data[0]).toBe(50);
    });

    it('DIFF-U101: preserves full opacity in output', () => {
      const imageA = createImageData(2, 2, [100, 100, 100, 128]); // Semi-transparent
      const imageB = createImageData(2, 2, [150, 150, 150, 64]); // More transparent

      const result = applyDifferenceMatte(imageA, imageB, 1.0, false);

      // Output should always be fully opaque
      for (let i = 3; i < result.data.length; i += 4) {
        expect(result.data[i]).toBe(255);
      }
    });

    it('DIFF-U102: handles boundary values 0 and 255', () => {
      const imageA = createImageData(2, 2, [0, 0, 0, 255]);
      const imageB = createImageData(2, 2, [255, 255, 255, 255]);

      const result = applyDifferenceMatte(imageA, imageB, 1.0, false);

      // Maximum difference
      expect(result.data[0]).toBe(255);
    });
  });
});

// Helper functions

function createImageData(width: number, height: number, color: [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3];
  }
  return new ImageData(data, width, height);
}

function getPixel(imageData: ImageData, x: number, y: number): [number, number, number, number] {
  const i = (y * imageData.width + x) * 4;
  return [
    imageData.data[i]!,
    imageData.data[i + 1]!,
    imageData.data[i + 2]!,
    imageData.data[i + 3]!,
  ];
}
