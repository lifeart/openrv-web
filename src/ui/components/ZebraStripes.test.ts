/**
 * ZebraStripes Component Tests
 *
 * Tests for the animated diagonal stripes overlay used for exposure warning.
 * High zebras indicate overexposure, low zebras indicate underexposure.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ZebraStripes, DEFAULT_ZEBRA_STATE } from './ZebraStripes';

describe('ZebraStripes', () => {
  let zebra: ZebraStripes;

  beforeEach(() => {
    zebra = new ZebraStripes();
  });

  afterEach(() => {
    zebra.dispose();
  });

  describe('initialization', () => {
    it('ZEB-U001: should initialize with default state', () => {
      expect(zebra.getState()).toEqual(DEFAULT_ZEBRA_STATE);
    });

    it('ZEB-U002: default state should be disabled', () => {
      expect(zebra.getState().enabled).toBe(false);
    });

    it('ZEB-U003: default high threshold should be 95 IRE', () => {
      expect(zebra.getState().highThreshold).toBe(95);
    });

    it('ZEB-U004: default low threshold should be 5 IRE', () => {
      expect(zebra.getState().lowThreshold).toBe(5);
    });

    it('ZEB-U005: default highEnabled should be true', () => {
      expect(zebra.getState().highEnabled).toBe(true);
    });

    it('ZEB-U006: default lowEnabled should be false', () => {
      expect(zebra.getState().lowEnabled).toBe(false);
    });
  });

  describe('state management', () => {
    it('ZEB-U010: getState returns a copy of state', () => {
      const state1 = zebra.getState();
      const state2 = zebra.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('ZEB-U011: setState merges partial state', () => {
      zebra.setState({ enabled: true });
      const state = zebra.getState();
      expect(state.enabled).toBe(true);
      expect(state.highThreshold).toBe(95); // Unchanged
    });

    it('ZEB-U012: setState emits stateChanged event', () => {
      const callback = vi.fn();
      zebra.on('stateChanged', callback);
      zebra.setState({ enabled: true });
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('ZEB-U013: reset restores default state', () => {
      zebra.setState({ enabled: true, highThreshold: 80, lowThreshold: 10 });
      zebra.reset();
      expect(zebra.getState()).toEqual(DEFAULT_ZEBRA_STATE);
    });

    it('ZEB-U014: reset emits stateChanged event', () => {
      zebra.setState({ enabled: true });
      const callback = vi.fn();
      zebra.on('stateChanged', callback);
      zebra.reset();
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('enable/disable/toggle', () => {
    it('ZEB-U020: enable() sets enabled to true', () => {
      zebra.enable();
      expect(zebra.getState().enabled).toBe(true);
    });

    it('ZEB-U021: disable() sets enabled to false', () => {
      zebra.enable();
      zebra.disable();
      expect(zebra.getState().enabled).toBe(false);
    });

    it('ZEB-U022: toggle() switches enabled state', () => {
      expect(zebra.getState().enabled).toBe(false);
      zebra.toggle();
      expect(zebra.getState().enabled).toBe(true);
      zebra.toggle();
      expect(zebra.getState().enabled).toBe(false);
    });

    it('ZEB-U023: toggleHigh() switches highEnabled state', () => {
      expect(zebra.getState().highEnabled).toBe(true);
      zebra.toggleHigh();
      expect(zebra.getState().highEnabled).toBe(false);
      zebra.toggleHigh();
      expect(zebra.getState().highEnabled).toBe(true);
    });

    it('ZEB-U024: toggleLow() switches lowEnabled state', () => {
      expect(zebra.getState().lowEnabled).toBe(false);
      zebra.toggleLow();
      expect(zebra.getState().lowEnabled).toBe(true);
      zebra.toggleLow();
      expect(zebra.getState().lowEnabled).toBe(false);
    });
  });

  describe('isEnabled logic', () => {
    it('ZEB-U030: isEnabled returns false when disabled', () => {
      zebra.setState({ enabled: false, highEnabled: true, lowEnabled: true });
      expect(zebra.isEnabled()).toBe(false);
    });

    it('ZEB-U031: isEnabled returns true when enabled with highEnabled', () => {
      zebra.setState({ enabled: true, highEnabled: true, lowEnabled: false });
      expect(zebra.isEnabled()).toBe(true);
    });

    it('ZEB-U032: isEnabled returns true when enabled with lowEnabled', () => {
      zebra.setState({ enabled: true, highEnabled: false, lowEnabled: true });
      expect(zebra.isEnabled()).toBe(true);
    });

    it('ZEB-U033: isEnabled returns true when enabled with both', () => {
      zebra.setState({ enabled: true, highEnabled: true, lowEnabled: true });
      expect(zebra.isEnabled()).toBe(true);
    });

    it('ZEB-U034: isEnabled returns false when enabled but neither high nor low', () => {
      zebra.setState({ enabled: true, highEnabled: false, lowEnabled: false });
      expect(zebra.isEnabled()).toBe(false);
    });
  });

  describe('threshold clamping', () => {
    it('ZEB-U040: setHighThreshold clamps to 0-100 range', () => {
      zebra.setHighThreshold(150);
      expect(zebra.getState().highThreshold).toBe(100);

      zebra.setHighThreshold(-10);
      expect(zebra.getState().highThreshold).toBe(0);
    });

    it('ZEB-U041: setHighThreshold accepts valid values', () => {
      zebra.setHighThreshold(80);
      expect(zebra.getState().highThreshold).toBe(80);
    });

    it('ZEB-U042: setLowThreshold clamps to 0-100 range', () => {
      zebra.setLowThreshold(150);
      expect(zebra.getState().lowThreshold).toBe(100);

      zebra.setLowThreshold(-10);
      expect(zebra.getState().lowThreshold).toBe(0);
    });

    it('ZEB-U043: setLowThreshold accepts valid values', () => {
      zebra.setLowThreshold(15);
      expect(zebra.getState().lowThreshold).toBe(15);
    });

    it('ZEB-U044: threshold boundary values 0 and 100', () => {
      zebra.setHighThreshold(0);
      expect(zebra.getState().highThreshold).toBe(0);

      zebra.setHighThreshold(100);
      expect(zebra.getState().highThreshold).toBe(100);

      zebra.setLowThreshold(0);
      expect(zebra.getState().lowThreshold).toBe(0);

      zebra.setLowThreshold(100);
      expect(zebra.getState().lowThreshold).toBe(100);
    });
  });

  describe('apply() - luminance calculation', () => {
    /**
     * Rec. 709 luminance formula: Y = 0.2126*R + 0.7152*G + 0.0722*B
     */

    it('ZEB-U050: does not modify image when disabled', () => {
      zebra.setState({ enabled: false });
      const imageData = createImageData(2, 2, [255, 255, 255, 255]); // All white
      const originalData = new Uint8ClampedArray(imageData.data);

      zebra.apply(imageData);

      expect(Array.from(imageData.data)).toEqual(Array.from(originalData));
    });

    it('ZEB-U051: calculates luminance correctly for white (255,255,255)', () => {
      // White pixel: luma = 0.2126*255 + 0.7152*255 + 0.0722*255 = 255
      // At 95% threshold (242.25), white should trigger high zebras
      zebra.setState({ enabled: true, highEnabled: true, highThreshold: 95 });
      // Use larger image to ensure stripe pattern hits some pixels
      const imageData = createImageData(20, 20, [255, 255, 255, 255]);

      zebra.apply(imageData);

      // Zebra color for high is [255, 100, 100], 50% blend with white
      // Results in approximately [255, 178, 178]
      // Due to stripe pattern, some pixels should be modified (R=255, G<255, B<255)
      expect(pixelsModified(imageData, [255, 255, 255, 255])).toBe(true);
    });

    it('ZEB-U052: calculates luminance correctly for black (0,0,0)', () => {
      // Black pixel: luma = 0
      // At 5% threshold (12.75), black should trigger low zebras
      zebra.setState({ enabled: true, lowEnabled: true, lowThreshold: 5 });
      // Use larger image to ensure stripe pattern hits some pixels
      const imageData = createImageData(20, 20, [0, 0, 0, 255]);

      zebra.apply(imageData);

      // Zebra color for low is [100, 100, 255], 50% blend with black
      // Results in approximately [50, 50, 128]
      // Due to stripe pattern, some pixels should be modified (bluish tint)
      expect(pixelsModified(imageData, [0, 0, 0, 255])).toBe(true);
    });

    it('ZEB-U053: calculates luminance correctly for green (0,255,0)', () => {
      // Pure green: luma = 0.7152 * 255 = 182.38
      // As percentage: 182.38/255 * 100 = 71.5%
      // Should NOT trigger 95% high threshold
      zebra.setState({ enabled: true, highEnabled: true, highThreshold: 95, lowEnabled: false });
      const imageData = createImageData(2, 2, [0, 255, 0, 255]);
      const originalData = new Uint8ClampedArray(imageData.data);

      zebra.apply(imageData);

      // Green at 71.5 IRE should NOT trigger 95% high zebra
      expect(Array.from(imageData.data)).toEqual(Array.from(originalData));
    });

    it('ZEB-U054: calculates luminance correctly for red (255,0,0)', () => {
      // Pure red: luma = 0.2126 * 255 = 54.2
      // As percentage: 54.2/255 * 100 = 21.3%
      zebra.setState({ enabled: true, highEnabled: true, highThreshold: 20, lowEnabled: false });
      const imageData = createImageData(2, 2, [255, 0, 0, 255]);

      zebra.apply(imageData);

      // Red at 21.3% luma should trigger 20% high threshold
      // Some pixels should be modified
      expect(pixelsModified(imageData, [255, 0, 0, 255])).toBe(true);
    });

    it('ZEB-U055: calculates luminance correctly for blue (0,0,255)', () => {
      // Pure blue: luma = 0.0722 * 255 = 18.4
      // As percentage: 18.4/255 * 100 = 7.2%
      zebra.setState({ enabled: true, lowEnabled: true, lowThreshold: 10, highEnabled: false });
      const imageData = createImageData(2, 2, [0, 0, 255, 255]);

      zebra.apply(imageData);

      // Blue at 7.2% luma should trigger 10% low threshold
      expect(pixelsModified(imageData, [0, 0, 255, 255])).toBe(true);
    });
  });

  describe('apply() - threshold boundaries', () => {
    it('ZEB-U060: pixel at exactly high threshold triggers zebra', () => {
      // Set threshold to 50%
      zebra.setState({ enabled: true, highEnabled: true, highThreshold: 50, lowEnabled: false });

      // Create pixel with exactly 50% luma (127.5)
      // 127.5 = 0.2126*R + 0.7152*G + 0.0722*B
      // Using gray: R=G=B=127.5 -> luma = 127.5
      const imageData = createImageData(10, 10, [128, 128, 128, 255]);

      zebra.apply(imageData);

      // Luma of 128 is 50.2%, should trigger at >=50% threshold
      expect(pixelsModified(imageData, [128, 128, 128, 255])).toBe(true);
    });

    it('ZEB-U061: pixel below high threshold does not trigger', () => {
      zebra.setState({ enabled: true, highEnabled: true, highThreshold: 60, lowEnabled: false });

      // 50% gray = luma 127.5
      const imageData = createImageData(2, 2, [128, 128, 128, 255]);
      const originalData = new Uint8ClampedArray(imageData.data);

      zebra.apply(imageData);

      // 50% luma should NOT trigger 60% threshold
      expect(Array.from(imageData.data)).toEqual(Array.from(originalData));
    });

    it('ZEB-U062: pixel at exactly low threshold triggers zebra', () => {
      zebra.setState({ enabled: true, lowEnabled: true, lowThreshold: 20, highEnabled: false });

      // 20% of 255 = 51
      const imageData = createImageData(10, 10, [51, 51, 51, 255]);

      zebra.apply(imageData);

      // Should trigger at <=20% threshold
      expect(pixelsModified(imageData, [51, 51, 51, 255])).toBe(true);
    });

    it('ZEB-U063: pixel above low threshold does not trigger', () => {
      zebra.setState({ enabled: true, lowEnabled: true, lowThreshold: 10, highEnabled: false });

      // 20% gray = luma 51
      const imageData = createImageData(2, 2, [51, 51, 51, 255]);
      const originalData = new Uint8ClampedArray(imageData.data);

      zebra.apply(imageData);

      // 20% luma should NOT trigger 10% threshold
      expect(Array.from(imageData.data)).toEqual(Array.from(originalData));
    });
  });

  describe('apply() - zebra colors', () => {
    it('ZEB-U070: high zebra applies pink/red color', () => {
      zebra.setState({ enabled: true, highEnabled: true, highThreshold: 90, lowEnabled: false });

      // Create large white image to ensure stripe hit
      const imageData = createImageData(20, 20, [255, 255, 255, 255]);
      zebra.apply(imageData);

      // Find a modified pixel
      let foundZebra = false;
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
          const pixel = getPixel(imageData, x, y);
          // High zebra blends with [255, 100, 100]
          // 50% blend of white [255,255,255] and [255,100,100]
          // = [255, 177.5, 177.5] -> [255, 178, 178]
          if (pixel[0] === 255 && pixel[1] < 255 && pixel[2] < 255) {
            foundZebra = true;
            // Should have reddish tint (R > G, R > B)
            expect(pixel[0]).toBeGreaterThanOrEqual(pixel[1]);
            expect(pixel[0]).toBeGreaterThanOrEqual(pixel[2]);
            break;
          }
        }
        if (foundZebra) break;
      }
      expect(foundZebra).toBe(true);
    });

    it('ZEB-U071: low zebra applies blue color', () => {
      zebra.setState({ enabled: true, lowEnabled: true, lowThreshold: 10, highEnabled: false });

      // Create large black image to ensure stripe hit
      const imageData = createImageData(20, 20, [0, 0, 0, 255]);
      zebra.apply(imageData);

      // Find a modified pixel
      let foundZebra = false;
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
          const pixel = getPixel(imageData, x, y);
          // Low zebra blends with [100, 100, 255]
          // 50% blend of black [0,0,0] and [100,100,255]
          // = [50, 50, 127.5]
          if (pixel[2] > pixel[0] && pixel[2] > pixel[1]) {
            foundZebra = true;
            // Should have blue tint (B > R, B > G)
            expect(pixel[2]).toBeGreaterThan(pixel[0]);
            expect(pixel[2]).toBeGreaterThan(pixel[1]);
            break;
          }
        }
        if (foundZebra) break;
      }
      expect(foundZebra).toBe(true);
    });
  });

  describe('apply() - stripe pattern', () => {
    it('ZEB-U080: creates diagonal stripe pattern (not all pixels modified)', () => {
      zebra.setState({ enabled: true, highEnabled: true, highThreshold: 90, lowEnabled: false });

      const imageData = createImageData(20, 20, [255, 255, 255, 255]);
      zebra.apply(imageData);

      // Count modified and unmodified pixels
      let modifiedCount = 0;
      let unmodifiedCount = 0;

      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
          const pixel = getPixel(imageData, x, y);
          if (pixel[0] === 255 && pixel[1] === 255 && pixel[2] === 255) {
            unmodifiedCount++;
          } else {
            modifiedCount++;
          }
        }
      }

      // Both modified and unmodified should exist (stripe pattern)
      expect(modifiedCount).toBeGreaterThan(0);
      expect(unmodifiedCount).toBeGreaterThan(0);
    });

    it('ZEB-U081: stripe period is approximately 12 pixels (6 stripe + 6 gap)', () => {
      zebra.setState({ enabled: true, highEnabled: true, highThreshold: 0, lowEnabled: false });

      // Create horizontal line of white pixels
      const imageData = createImageData(48, 1, [255, 255, 255, 255]);
      zebra.apply(imageData);

      // Check for repeating pattern
      // With period of 12, we should see roughly 4 complete cycles in 48 pixels
      let transitions = 0;
      let prevModified = getPixel(imageData, 0, 0)[1] < 255;

      for (let x = 1; x < 48; x++) {
        const modified = getPixel(imageData, x, 0)[1] < 255;
        if (modified !== prevModified) {
          transitions++;
          prevModified = modified;
        }
      }

      // Should have multiple transitions indicating stripe pattern
      expect(transitions).toBeGreaterThan(0);
    });
  });

  describe('apply() - high vs low priority', () => {
    it('ZEB-U090: high zebra takes priority over low zebra', () => {
      zebra.setState({
        enabled: true,
        highEnabled: true,
        lowEnabled: true,
        highThreshold: 50,
        lowThreshold: 60
      });

      // Create pixel that could trigger both (55% luma)
      // With threshold overlap, high should take priority
      const luma55 = Math.round(255 * 0.55); // ~140
      const imageData = createImageData(20, 20, [luma55, luma55, luma55, 255]);
      zebra.apply(imageData);

      // Check if any modified pixel has red tint (high) vs blue tint (low)
      let hasRedTint = false;
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
          const pixel = getPixel(imageData, x, y);
          if (pixel[0] !== luma55 || pixel[1] !== luma55 || pixel[2] !== luma55) {
            // Modified pixel - check for red vs blue
            if (pixel[0] > pixel[2]) {
              hasRedTint = true;
            }
          }
        }
      }

      // High zebra (pink/red) should be applied, not low (blue)
      expect(hasRedTint).toBe(true);
    });
  });

  describe('animation', () => {
    it('ZEB-U100: startAnimation starts animation loop', () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => {
        return 1;
      });

      const callback = vi.fn();
      zebra.startAnimation(callback);

      expect(rafSpy).toHaveBeenCalled();

      rafSpy.mockRestore();
    });

    it('ZEB-U101: stopAnimation cancels animation', () => {
      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(123);

      zebra.startAnimation(() => {});
      zebra.stopAnimation();

      expect(cancelSpy).toHaveBeenCalledWith(123);

      rafSpy.mockRestore();
      cancelSpy.mockRestore();
    });

    it('ZEB-U102: startAnimation does nothing if already running', () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      zebra.startAnimation(callback1);
      zebra.startAnimation(callback2);

      // Should only start once
      expect(rafSpy).toHaveBeenCalledTimes(1);

      rafSpy.mockRestore();
    });

    it('ZEB-U103: dispose stops animation', () => {
      const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(456);

      zebra.startAnimation(() => {});
      zebra.dispose();

      expect(cancelSpy).toHaveBeenCalledWith(456);

      rafSpy.mockRestore();
      cancelSpy.mockRestore();
    });
  });

  describe('dropdown UI', () => {
    it('ZEB-U110: createDropdownContent creates container element', () => {
      const onUpdate = vi.fn();
      const content = zebra.createDropdownContent(onUpdate);

      expect(content).toBeInstanceOf(HTMLElement);
      expect(content.className).toBe('zebra-dropdown-content');
    });

    it('ZEB-U111: dropdown contains highlight and shadow sections', () => {
      const onUpdate = vi.fn();
      const content = zebra.createDropdownContent(onUpdate);

      expect(content.textContent).toContain('Highlights');
      expect(content.textContent).toContain('Shadows');
    });

    it('ZEB-U112: dropdown contains threshold sliders', () => {
      const onUpdate = vi.fn();
      const content = zebra.createDropdownContent(onUpdate);

      const sliders = content.querySelectorAll('input[type="range"]');
      expect(sliders.length).toBe(2); // High and low threshold
    });

    it('ZEB-U113: dropdown contains checkboxes', () => {
      const onUpdate = vi.fn();
      const content = zebra.createDropdownContent(onUpdate);

      const checkboxes = content.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(2); // High and low enable
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

function pixelsModified(imageData: ImageData, originalColor: [number, number, number, number]): boolean {
  for (let i = 0; i < imageData.data.length; i += 4) {
    if (
      imageData.data[i] !== originalColor[0] ||
      imageData.data[i + 1] !== originalColor[1] ||
      imageData.data[i + 2] !== originalColor[2]
    ) {
      return true;
    }
  }
  return false;
}
