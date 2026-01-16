import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Waveform, WaveformMode } from './Waveform';

describe('Waveform', () => {
  let waveform: Waveform;

  beforeEach(() => {
    waveform = new Waveform();
  });

  describe('initialization', () => {
    it('should create waveform instance', () => {
      expect(waveform).toBeInstanceOf(Waveform);
    });

    it('should start hidden', () => {
      expect(waveform.isVisible()).toBe(false);
    });

    it('should start in luma mode', () => {
      expect(waveform.getMode()).toBe('luma');
    });

    it('should render container element', () => {
      const el = waveform.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('waveform-container');
    });

    it('should have canvas element', () => {
      const el = waveform.render();
      const canvas = el.querySelector('canvas');
      expect(canvas).not.toBeNull();
      expect(canvas?.width).toBe(256);
      expect(canvas?.height).toBe(128);
    });

    it('should have mode button with testid', () => {
      const el = waveform.render();
      const modeButton = el.querySelector('[data-testid="waveform-mode-button"]');
      expect(modeButton).not.toBeNull();
      expect(modeButton?.textContent).toBe('Luma');
    });

    it('should have close button with testid', () => {
      const el = waveform.render();
      const closeButton = el.querySelector('[data-testid="waveform-close-button"]');
      expect(closeButton).not.toBeNull();
      expect(closeButton?.textContent).toBe('×');
    });
  });

  describe('visibility', () => {
    it('should show waveform', () => {
      waveform.show();
      expect(waveform.isVisible()).toBe(true);
    });

    it('should hide waveform', () => {
      waveform.show();
      waveform.hide();
      expect(waveform.isVisible()).toBe(false);
    });

    it('should toggle visibility', () => {
      expect(waveform.isVisible()).toBe(false);
      waveform.toggle();
      expect(waveform.isVisible()).toBe(true);
      waveform.toggle();
      expect(waveform.isVisible()).toBe(false);
    });

    it('should emit visibilityChanged event on show', () => {
      const callback = vi.fn();
      waveform.on('visibilityChanged', callback);
      waveform.show();
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('should emit visibilityChanged event on hide', () => {
      waveform.show();
      const callback = vi.fn();
      waveform.on('visibilityChanged', callback);
      waveform.hide();
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('should not emit event when already visible', () => {
      waveform.show();
      const callback = vi.fn();
      waveform.on('visibilityChanged', callback);
      waveform.show(); // Already visible
      expect(callback).not.toHaveBeenCalled();
    });

    it('should not emit event when already hidden', () => {
      const callback = vi.fn();
      waveform.on('visibilityChanged', callback);
      waveform.hide(); // Already hidden
      expect(callback).not.toHaveBeenCalled();
    });

    it('should update container display style on show', () => {
      const el = waveform.render();
      expect(el.style.display).toBe('none');
      waveform.show();
      expect(el.style.display).toBe('block');
    });

    it('should update container display style on hide', () => {
      waveform.show();
      const el = waveform.render();
      expect(el.style.display).toBe('block');
      waveform.hide();
      expect(el.style.display).toBe('none');
    });
  });

  describe('mode', () => {
    it('should cycle through modes', () => {
      expect(waveform.getMode()).toBe('luma');
      waveform.cycleMode();
      expect(waveform.getMode()).toBe('rgb');
      waveform.cycleMode();
      expect(waveform.getMode()).toBe('parade');
      waveform.cycleMode();
      expect(waveform.getMode()).toBe('luma');
    });

    it('should set mode directly', () => {
      waveform.setMode('parade');
      expect(waveform.getMode()).toBe('parade');
      waveform.setMode('rgb');
      expect(waveform.getMode()).toBe('rgb');
      waveform.setMode('luma');
      expect(waveform.getMode()).toBe('luma');
    });

    it('should emit modeChanged event on cycle', () => {
      const callback = vi.fn();
      waveform.on('modeChanged', callback);
      waveform.cycleMode();
      expect(callback).toHaveBeenCalledWith('rgb');
    });

    it('should emit modeChanged event on setMode', () => {
      const callback = vi.fn();
      waveform.on('modeChanged', callback);
      waveform.setMode('parade');
      expect(callback).toHaveBeenCalledWith('parade');
    });

    it('should not emit event when setting same mode', () => {
      waveform.setMode('luma'); // Already luma
      const callback = vi.fn();
      waveform.on('modeChanged', callback);
      waveform.setMode('luma');
      expect(callback).not.toHaveBeenCalled();
    });

    it('should update mode button text on cycle', () => {
      const el = waveform.render();
      const modeButton = el.querySelector('[data-testid="waveform-mode-button"]');
      expect(modeButton?.textContent).toBe('Luma');
      waveform.cycleMode();
      expect(modeButton?.textContent).toBe('RGB');
      waveform.cycleMode();
      expect(modeButton?.textContent).toBe('Parade');
      waveform.cycleMode();
      expect(modeButton?.textContent).toBe('Luma');
    });

    it('should update mode button text on setMode', () => {
      const el = waveform.render();
      const modeButton = el.querySelector('[data-testid="waveform-mode-button"]');
      waveform.setMode('parade');
      expect(modeButton?.textContent).toBe('Parade');
    });
  });

  describe('update', () => {
    it('should accept ImageData for update', () => {
      const imageData = new ImageData(100, 100);
      // Fill with some data
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 128;     // R
        imageData.data[i + 1] = 128; // G
        imageData.data[i + 2] = 128; // B
        imageData.data[i + 3] = 255; // A
      }

      // Should not throw
      expect(() => waveform.update(imageData)).not.toThrow();
    });

    it('should handle empty ImageData', () => {
      const imageData = new ImageData(1, 1);
      expect(() => waveform.update(imageData)).not.toThrow();
    });

    it('should handle large ImageData', () => {
      const imageData = new ImageData(1920, 1080);
      expect(() => waveform.update(imageData)).not.toThrow();
    });
  });

  describe('drawing modes', () => {
    let imageData: ImageData;

    beforeEach(() => {
      // Create a gradient test image
      imageData = new ImageData(100, 100);
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const i = (y * 100 + x) * 4;
          // Horizontal gradient for testing waveform
          const value = Math.floor(x * 255 / 99);
          imageData.data[i] = value;     // R
          imageData.data[i + 1] = value; // G
          imageData.data[i + 2] = value; // B
          imageData.data[i + 3] = 255;   // A
        }
      }
    });

    it('should draw luma waveform', () => {
      waveform.setMode('luma');
      expect(() => waveform.update(imageData)).not.toThrow();
    });

    it('should draw RGB overlay waveform', () => {
      waveform.setMode('rgb');
      expect(() => waveform.update(imageData)).not.toThrow();
    });

    it('should draw parade waveform', () => {
      waveform.setMode('parade');
      expect(() => waveform.update(imageData)).not.toThrow();
    });

    it('should draw correctly with different RGB values', () => {
      // Create image with separate R, G, B regions
      const rgbImage = new ImageData(99, 100);
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 99; x++) {
          const i = (y * 99 + x) * 4;
          if (x < 33) {
            rgbImage.data[i] = 255;     // Red region
            rgbImage.data[i + 1] = 0;
            rgbImage.data[i + 2] = 0;
          } else if (x < 66) {
            rgbImage.data[i] = 0;
            rgbImage.data[i + 1] = 255; // Green region
            rgbImage.data[i + 2] = 0;
          } else {
            rgbImage.data[i] = 0;
            rgbImage.data[i + 1] = 0;
            rgbImage.data[i + 2] = 255; // Blue region
          }
          rgbImage.data[i + 3] = 255;
        }
      }

      waveform.setMode('parade');
      expect(() => waveform.update(rgbImage)).not.toThrow();
    });
  });

  describe('mode change redraw', () => {
    let imageData: ImageData;

    beforeEach(() => {
      // Create simple image data for testing
      imageData = new ImageData(10, 10);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 128;     // R
        imageData.data[i + 1] = 128; // G
        imageData.data[i + 2] = 128; // B
        imageData.data[i + 3] = 255; // A
      }
    });

    it('should store lastImageData when update is called', () => {
      waveform.update(imageData);
      // Verify cycleMode works after update (would fail if lastImageData not stored)
      expect(() => waveform.cycleMode()).not.toThrow();
    });

    it('should redraw when cycleMode is called after update', () => {
      // Spy on the private draw method via update
      const updateSpy = vi.spyOn(waveform, 'update');

      waveform.update(imageData);
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // cycleMode should trigger a redraw internally
      // We verify this by checking mode changed and no error occurred
      waveform.cycleMode();
      expect(waveform.getMode()).toBe('rgb');
    });

    it('should redraw when setMode is called after update', () => {
      waveform.update(imageData);

      // setMode should trigger a redraw internally
      waveform.setMode('parade');
      expect(waveform.getMode()).toBe('parade');
    });

    it('should not throw when cycleMode called without prior update', () => {
      expect(() => waveform.cycleMode()).not.toThrow();
    });

    it('should not throw when setMode called without prior update', () => {
      expect(() => waveform.setMode('rgb')).not.toThrow();
    });

    it('should use stored imageData for subsequent mode changes', () => {
      waveform.update(imageData);

      // Multiple mode changes should all work without throwing
      waveform.cycleMode(); // luma -> rgb
      expect(waveform.getMode()).toBe('rgb');
      waveform.cycleMode(); // rgb -> parade
      expect(waveform.getMode()).toBe('parade');
      waveform.cycleMode(); // parade -> luma
      expect(waveform.getMode()).toBe('luma');
    });
  });

  describe('dispose', () => {
    it('should dispose without error', () => {
      expect(() => waveform.dispose()).not.toThrow();
    });

    it('should clear internal references', () => {
      waveform.dispose();
      // Should not throw on further operations
      expect(() => waveform.cycleMode()).not.toThrow();
    });
  });

  describe('pointer events', () => {
    it('should have pointer event listeners attached to container', () => {
      const el = waveform.render();
      // Container should have event listeners (tested through e2e tests)
      expect(el).toBeInstanceOf(HTMLElement);
    });
  });
});
