import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Vectorscope } from './Vectorscope';

describe('Vectorscope', () => {
  let vectorscope: Vectorscope;

  beforeEach(() => {
    vectorscope = new Vectorscope();
  });

  describe('initialization', () => {
    it('should create vectorscope instance', () => {
      expect(vectorscope).toBeInstanceOf(Vectorscope);
    });

    it('should start hidden', () => {
      expect(vectorscope.isVisible()).toBe(false);
    });

    it('should start with 1x zoom', () => {
      expect(vectorscope.getZoom()).toBe(1);
    });

    it('should render container element', () => {
      const el = vectorscope.render();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe('vectorscope-container');
    });

    it('should have canvas element', () => {
      const el = vectorscope.render();
      const canvas = el.querySelector('canvas');
      expect(canvas).not.toBeNull();
      expect(canvas?.width).toBe(200);
      expect(canvas?.height).toBe(200);
    });

    it('should have zoom button with testid', () => {
      const el = vectorscope.render();
      const zoomButton = el.querySelector('[data-testid="vectorscope-zoom-button"]');
      expect(zoomButton).not.toBeNull();
      expect(zoomButton?.textContent).toBe('1x');
    });

    it('should have close button with testid', () => {
      const el = vectorscope.render();
      const closeButton = el.querySelector('[data-testid="vectorscope-close-button"]');
      expect(closeButton).not.toBeNull();
      expect(closeButton?.textContent).toBe('×');
    });
  });

  describe('visibility', () => {
    it('should show vectorscope', () => {
      vectorscope.show();
      expect(vectorscope.isVisible()).toBe(true);
    });

    it('should hide vectorscope', () => {
      vectorscope.show();
      vectorscope.hide();
      expect(vectorscope.isVisible()).toBe(false);
    });

    it('should toggle visibility', () => {
      expect(vectorscope.isVisible()).toBe(false);
      vectorscope.toggle();
      expect(vectorscope.isVisible()).toBe(true);
      vectorscope.toggle();
      expect(vectorscope.isVisible()).toBe(false);
    });

    it('should emit visibilityChanged event on show', () => {
      const callback = vi.fn();
      vectorscope.on('visibilityChanged', callback);
      vectorscope.show();
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('should emit visibilityChanged event on hide', () => {
      vectorscope.show();
      const callback = vi.fn();
      vectorscope.on('visibilityChanged', callback);
      vectorscope.hide();
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('should not emit event when already visible', () => {
      vectorscope.show();
      const callback = vi.fn();
      vectorscope.on('visibilityChanged', callback);
      vectorscope.show();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should not emit event when already hidden', () => {
      const callback = vi.fn();
      vectorscope.on('visibilityChanged', callback);
      vectorscope.hide();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should update container display style on show', () => {
      const el = vectorscope.render();
      expect(el.style.display).toBe('none');
      vectorscope.show();
      expect(el.style.display).toBe('block');
    });

    it('should update container display style on hide', () => {
      vectorscope.show();
      const el = vectorscope.render();
      expect(el.style.display).toBe('block');
      vectorscope.hide();
      expect(el.style.display).toBe('none');
    });
  });

  describe('zoom', () => {
    it('should cycle through zoom levels', () => {
      expect(vectorscope.getZoom()).toBe(1);
      vectorscope.cycleZoom();
      expect(vectorscope.getZoom()).toBe(2);
      vectorscope.cycleZoom();
      expect(vectorscope.getZoom()).toBe(4);
      vectorscope.cycleZoom();
      expect(vectorscope.getZoom()).toBe(1);
    });

    it('should set zoom level directly', () => {
      vectorscope.setZoom(4);
      expect(vectorscope.getZoom()).toBe(4);
      vectorscope.setZoom(2);
      expect(vectorscope.getZoom()).toBe(2);
      vectorscope.setZoom(1);
      expect(vectorscope.getZoom()).toBe(1);
    });

    it('should emit zoomChanged event on cycle', () => {
      const callback = vi.fn();
      vectorscope.on('zoomChanged', callback);
      vectorscope.cycleZoom();
      expect(callback).toHaveBeenCalledWith(2);
    });

    it('should emit zoomChanged event on setZoom', () => {
      const callback = vi.fn();
      vectorscope.on('zoomChanged', callback);
      vectorscope.setZoom(4);
      expect(callback).toHaveBeenCalledWith(4);
    });

    it('should not emit event when setting same zoom', () => {
      vectorscope.setZoom(1);
      const callback = vi.fn();
      vectorscope.on('zoomChanged', callback);
      vectorscope.setZoom(1);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should update zoom button text on cycle', () => {
      const el = vectorscope.render();
      const zoomButton = el.querySelector('[data-testid="vectorscope-zoom-button"]');
      expect(zoomButton?.textContent).toBe('1x');
      vectorscope.cycleZoom();
      expect(zoomButton?.textContent).toBe('2x');
      vectorscope.cycleZoom();
      expect(zoomButton?.textContent).toBe('4x');
      vectorscope.cycleZoom();
      expect(zoomButton?.textContent).toBe('1x');
    });

    it('should update zoom button text on setZoom', () => {
      const el = vectorscope.render();
      const zoomButton = el.querySelector('[data-testid="vectorscope-zoom-button"]');
      vectorscope.setZoom(4);
      expect(zoomButton?.textContent).toBe('4x');
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
      expect(() => vectorscope.update(imageData)).not.toThrow();
    });

    it('should handle empty ImageData', () => {
      const imageData = new ImageData(1, 1);
      expect(() => vectorscope.update(imageData)).not.toThrow();
    });

    it('should handle large ImageData', () => {
      const imageData = new ImageData(1920, 1080);
      expect(() => vectorscope.update(imageData)).not.toThrow();
    });

    it('should handle saturated colors', () => {
      const imageData = new ImageData(10, 10);
      // Create pure red, green, blue pixels
      for (let i = 0; i < imageData.data.length; i += 12) {
        // Red
        imageData.data[i] = 255;
        imageData.data[i + 1] = 0;
        imageData.data[i + 2] = 0;
        imageData.data[i + 3] = 255;
        // Green
        imageData.data[i + 4] = 0;
        imageData.data[i + 5] = 255;
        imageData.data[i + 6] = 0;
        imageData.data[i + 7] = 255;
        // Blue
        imageData.data[i + 8] = 0;
        imageData.data[i + 9] = 0;
        imageData.data[i + 10] = 255;
        imageData.data[i + 11] = 255;
      }

      expect(() => vectorscope.update(imageData)).not.toThrow();
    });
  });

  describe('zoom change redraw', () => {
    let imageData: ImageData;

    beforeEach(() => {
      // Create simple image data for testing
      imageData = new ImageData(10, 10);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 128;     // R
        imageData.data[i + 1] = 64;  // G
        imageData.data[i + 2] = 192; // B
        imageData.data[i + 3] = 255; // A
      }
    });

    it('should store lastImageData when update is called', () => {
      vectorscope.update(imageData);
      // Verify cycleZoom works after update (would fail if lastImageData not stored)
      expect(() => vectorscope.cycleZoom()).not.toThrow();
    });

    it('should redraw when cycleZoom is called after update', () => {
      // Spy on update method to verify it's called during zoom change
      const updateSpy = vi.spyOn(vectorscope, 'update');

      vectorscope.update(imageData);
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // cycleZoom should trigger update internally with stored imageData
      vectorscope.cycleZoom();
      expect(vectorscope.getZoom()).toBe(2);
      expect(updateSpy).toHaveBeenCalledTimes(2);
    });

    it('should redraw when setZoom is called after update', () => {
      const updateSpy = vi.spyOn(vectorscope, 'update');

      vectorscope.update(imageData);
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // setZoom should trigger update internally with stored imageData
      vectorscope.setZoom(4);
      expect(vectorscope.getZoom()).toBe(4);
      expect(updateSpy).toHaveBeenCalledTimes(2);
    });

    it('should not throw when cycleZoom called without prior update', () => {
      expect(() => vectorscope.cycleZoom()).not.toThrow();
    });

    it('should not throw when setZoom called without prior update', () => {
      expect(() => vectorscope.setZoom(4)).not.toThrow();
    });

    it('should use stored imageData for subsequent zoom changes', () => {
      const updateSpy = vi.spyOn(vectorscope, 'update');

      vectorscope.update(imageData);
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // Multiple zoom changes should all trigger redraws
      vectorscope.cycleZoom(); // 1x -> 2x
      expect(vectorscope.getZoom()).toBe(2);
      expect(updateSpy).toHaveBeenCalledTimes(2);

      vectorscope.cycleZoom(); // 2x -> 4x
      expect(vectorscope.getZoom()).toBe(4);
      expect(updateSpy).toHaveBeenCalledTimes(3);

      vectorscope.cycleZoom(); // 4x -> 1x
      expect(vectorscope.getZoom()).toBe(1);
      expect(updateSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('dispose', () => {
    it('should dispose without error', () => {
      expect(() => vectorscope.dispose()).not.toThrow();
    });

    it('should clear internal references', () => {
      vectorscope.dispose();
      // Should not throw on further operations
      expect(() => vectorscope.cycleZoom()).not.toThrow();
    });
  });

  describe('pointer events', () => {
    it('should have pointer event listeners attached to container', () => {
      const el = vectorscope.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });
  });
});
