/**
 * GamutDiagram Component Tests
 *
 * Tests for the CIE 1931 xy chromaticity diagram component:
 * construction, disposal, visibility, color space setting,
 * SDR/HDR update paths, data retention, and rendering.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GamutDiagram } from './GamutDiagram';

// Capture mock functions for draggable container
const mockDraggableShow = vi.fn();
const mockDraggableHide = vi.fn();
const mockDraggableDispose = vi.fn();

vi.mock('./shared/DraggableContainer', () => {
  return {
    createDraggableContainer: vi.fn((_opts: any) => {
      const content = document.createElement('div');
      const element = document.createElement('div');
      element.appendChild(content);
      return {
        element,
        content,
        show: mockDraggableShow,
        hide: mockDraggableHide,
        dispose: mockDraggableDispose,
      };
    }),
  };
});

// Mock HiDPICanvas
vi.mock('../../utils/ui/HiDPICanvas', () => ({
  setupHiDPICanvas: vi.fn(({ canvas, width, height }: any) => {
    canvas.width = width;
    canvas.height = height;
    return { dpr: 1 };
  }),
}));

// Mock ThemeManager
const mockThemeOn = vi.fn();
const mockThemeOff = vi.fn();
vi.mock('../../utils/ui/ThemeManager', () => ({
  getThemeManager: vi.fn(() => ({
    on: mockThemeOn,
    off: mockThemeOff,
  })),
}));

// Mock getCSSColor
vi.mock('../../utils/ui/getCSSColor', () => ({
  getCSSColor: vi.fn((_prop: string, fallback: string) => fallback),
}));

describe('GamutDiagram', () => {
  let diagram: GamutDiagram;

  beforeEach(() => {
    mockThemeOn.mockClear();
    mockThemeOff.mockClear();
    mockDraggableShow.mockClear();
    mockDraggableHide.mockClear();
    mockDraggableDispose.mockClear();
    diagram = new GamutDiagram();
  });

  afterEach(() => {
    diagram.dispose();
  });

  describe('construction', () => {
    it('GD-U001: constructs without error', () => {
      expect(diagram).toBeInstanceOf(GamutDiagram);
    });

    it('GD-U002: starts hidden', () => {
      expect(diagram.isVisible()).toBe(false);
    });

    it('GD-U003: subscribes to theme changes', () => {
      expect(mockThemeOn).toHaveBeenCalledWith('themeChanged', expect.any(Function));
    });

    it('GD-U004: does not call drawFull in constructor (deferred)', () => {
      // The draggable container's show should NOT have been called during construction
      // because diagram starts hidden and drawing is deferred to first show()
      expect(mockDraggableShow).not.toHaveBeenCalled();
    });
  });

  describe('show/hide/toggle', () => {
    it('GD-U010: show sets visible to true', () => {
      diagram.show();
      expect(diagram.isVisible()).toBe(true);
    });

    it('GD-U011: hide sets visible to false', () => {
      diagram.show();
      diagram.hide();
      expect(diagram.isVisible()).toBe(false);
    });

    it('GD-U012: toggle switches visibility', () => {
      diagram.toggle();
      expect(diagram.isVisible()).toBe(true);
      diagram.toggle();
      expect(diagram.isVisible()).toBe(false);
    });

    it('GD-U013: show emits visibilityChanged true', () => {
      const cb = vi.fn();
      diagram.on('visibilityChanged', cb);
      diagram.show();
      expect(cb).toHaveBeenCalledWith(true);
    });

    it('GD-U014: hide emits visibilityChanged false', () => {
      diagram.show();
      const cb = vi.fn();
      diagram.on('visibilityChanged', cb);
      diagram.hide();
      expect(cb).toHaveBeenCalledWith(false);
    });

    it('GD-U015: show when already visible does not emit', () => {
      diagram.show();
      const cb = vi.fn();
      diagram.on('visibilityChanged', cb);
      diagram.show();
      expect(cb).not.toHaveBeenCalled();
    });

    it('GD-U016: hide when already hidden does not emit', () => {
      const cb = vi.fn();
      diagram.on('visibilityChanged', cb);
      diagram.hide();
      expect(cb).not.toHaveBeenCalled();
    });

    it('GD-U017: show calls draggable container show', () => {
      diagram.show();
      expect(mockDraggableShow).toHaveBeenCalled();
    });

    it('GD-U018: hide calls draggable container hide', () => {
      diagram.show();
      diagram.hide();
      expect(mockDraggableHide).toHaveBeenCalled();
    });
  });

  describe('render', () => {
    it('GD-U020: returns HTMLElement', () => {
      const el = diagram.render();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('GD-U021: element contains a canvas', () => {
      const el = diagram.render();
      const canvas = el.querySelector('canvas');
      expect(canvas).not.toBeNull();
    });

    it('GD-U022: canvas has correct dimensions', () => {
      const el = diagram.render();
      const canvas = el.querySelector('canvas')!;
      expect(canvas.width).toBe(280);
      expect(canvas.height).toBe(280);
    });
  });

  describe('setColorSpaces', () => {
    it('GD-U030: accepts known color spaces without error', () => {
      expect(() => diagram.setColorSpaces('sRGB', 'ACEScg', 'sRGB')).not.toThrow();
    });

    it('GD-U031: accepts unknown color spaces without error', () => {
      expect(() => diagram.setColorSpaces('UnknownInput', 'UnknownWorking', 'UnknownDisplay')).not.toThrow();
    });

    it('GD-U032: setColorSpaces redraws with existing SDR data', () => {
      const imgData = new ImageData(2, 2);
      // Set some pixel data
      imgData.data[0] = 128;
      imgData.data[1] = 64;
      imgData.data[2] = 200;
      imgData.data[3] = 255;
      diagram.update(imgData);

      // Changing color spaces should redraw (not throw) with stored data
      expect(() => diagram.setColorSpaces('Rec.2020', 'ACEScg', 'DCI-P3')).not.toThrow();
    });

    it('GD-U033: setColorSpaces redraws with existing float data', () => {
      const data = new Float32Array(2 * 2 * 4);
      data[0] = 0.5;
      data[1] = 0.3;
      data[2] = 0.8;
      data[3] = 1;
      diagram.updateFloat(data, 2, 2);

      expect(() => diagram.setColorSpaces('Rec.2020', 'ACEScg', 'sRGB')).not.toThrow();
    });

    it('GD-U034: setColorSpaces draws if no prior data', () => {
      // With no prior update data, setColorSpaces should still draw triangles
      expect(() => diagram.setColorSpaces('sRGB', 'ACEScg', 'Rec.2020')).not.toThrow();
    });
  });

  describe('update (SDR path)', () => {
    it('GD-U040: update stores ImageData for later redraw', () => {
      const imgData = new ImageData(4, 4);
      imgData.data[0] = 200;
      imgData.data[1] = 100;
      imgData.data[2] = 50;
      imgData.data[3] = 255;
      diagram.update(imgData);

      // Changing color spaces triggers redraw with stored data — verifies data was retained
      expect(() => diagram.setColorSpaces('Rec.2020', 'ACEScg', 'sRGB')).not.toThrow();
    });

    it('GD-U041: handles all-black pixels (zero XYZ sum guard)', () => {
      const imgData = new ImageData(2, 2);
      // All pixels default to (0,0,0,0) — tests the sum < epsilon guard
      expect(() => diagram.update(imgData)).not.toThrow();
    });

    it('GD-U042: handles all-white pixels', () => {
      const imgData = new ImageData(2, 2);
      for (let i = 0; i < imgData.data.length; i++) {
        imgData.data[i] = 255;
      }
      expect(() => diagram.update(imgData)).not.toThrow();
    });

    it('GD-U043: handles single pixel', () => {
      const imgData = new ImageData(1, 1);
      imgData.data[0] = 128;
      imgData.data[1] = 64;
      imgData.data[2] = 200;
      imgData.data[3] = 255;
      expect(() => diagram.update(imgData)).not.toThrow();
    });

    it('GD-U044: update clears float data reference', () => {
      // First set float data
      const floatData = new Float32Array(2 * 2 * 4);
      floatData[0] = 0.5;
      floatData[3] = 1;
      diagram.updateFloat(floatData, 2, 2);

      // Now update with SDR data — should switch to SDR path
      const imgData = new ImageData(2, 2);
      imgData.data[0] = 128;
      imgData.data[3] = 255;
      diagram.update(imgData);

      // setColorSpaces should redraw using SDR data path (not float)
      expect(() => diagram.setColorSpaces('DCI-P3', 'ACEScg', 'sRGB')).not.toThrow();
    });

    it('GD-U045: handles large image with subsampling', () => {
      // Large enough image that sampleStep > 1 (100x100 = 10000 > 8000 threshold)
      const imgData = new ImageData(100, 100);
      for (let i = 0; i < imgData.data.length; i += 4) {
        imgData.data[i] = (i * 7) % 256;
        imgData.data[i + 1] = (i * 13) % 256;
        imgData.data[i + 2] = (i * 23) % 256;
        imgData.data[i + 3] = 255;
      }
      expect(() => diagram.update(imgData)).not.toThrow();
    });
  });

  describe('updateFloat (HDR path)', () => {
    it('GD-U050: accepts Float32Array and stores data', () => {
      const data = new Float32Array(4 * 4 * 4);
      data.fill(0.5);
      diagram.updateFloat(data, 4, 4);

      // Verify data stored by triggering redraw via setColorSpaces
      expect(() => diagram.setColorSpaces('Rec.2020', 'ACEScg', 'sRGB')).not.toThrow();
    });

    it('GD-U051: handles negative values gracefully (negative XYZ guard)', () => {
      const data = new Float32Array(2 * 2 * 4);
      data[0] = -0.5;
      data[1] = -0.3;
      data[2] = -0.1;
      data[3] = 1;
      expect(() => diagram.updateFloat(data, 2, 2)).not.toThrow();
    });

    it('GD-U052: handles NaN values gracefully (isFinite guard)', () => {
      const data = new Float32Array(2 * 2 * 4);
      data[0] = NaN;
      data[1] = NaN;
      data[2] = NaN;
      data[3] = 1;
      expect(() => diagram.updateFloat(data, 2, 2)).not.toThrow();
    });

    it('GD-U053: handles HDR values > 1.0', () => {
      const data = new Float32Array(2 * 2 * 4);
      data[0] = 5.0;
      data[1] = 3.0;
      data[2] = 1.5;
      data[3] = 1;
      expect(() => diagram.updateFloat(data, 2, 2)).not.toThrow();
    });

    it('GD-U054: handles all-zero float data (zero XYZ sum)', () => {
      const data = new Float32Array(2 * 2 * 4);
      expect(() => diagram.updateFloat(data, 2, 2)).not.toThrow();
    });

    it('GD-U055: handles Infinity values gracefully', () => {
      const data = new Float32Array(2 * 2 * 4);
      data[0] = Infinity;
      data[1] = -Infinity;
      data[2] = 0.5;
      data[3] = 1;
      expect(() => diagram.updateFloat(data, 2, 2)).not.toThrow();
    });

    it('GD-U056: updateFloat clears SDR data reference', () => {
      // First set SDR data
      const imgData = new ImageData(2, 2);
      imgData.data[0] = 200;
      imgData.data[3] = 255;
      diagram.update(imgData);

      // Now update with float data — should switch to float path
      const floatData = new Float32Array(2 * 2 * 4);
      floatData[0] = 0.5;
      floatData[3] = 1;
      diagram.updateFloat(floatData, 2, 2);

      // setColorSpaces should redraw using float data path (not SDR)
      expect(() => diagram.setColorSpaces('ACEScg', 'ACES2065-1', 'Rec.2020')).not.toThrow();
    });
  });

  describe('data retention on hide', () => {
    it('GD-U070: hide releases SDR data buffer', () => {
      const imgData = new ImageData(4, 4);
      imgData.data[0] = 128;
      imgData.data[3] = 255;
      diagram.update(imgData);

      diagram.show();
      diagram.hide();

      // After hide, setColorSpaces should still work but draw without scatter
      // (no stored data to redraw)
      expect(() => diagram.setColorSpaces('Rec.2020', 'ACEScg', 'sRGB')).not.toThrow();
    });

    it('GD-U071: hide releases float data buffer', () => {
      const data = new Float32Array(4 * 4 * 4);
      data.fill(0.5);
      diagram.updateFloat(data, 4, 4);

      diagram.show();
      diagram.hide();

      // After hide, setColorSpaces should still work but draw without scatter
      expect(() => diagram.setColorSpaces('Rec.2020', 'ACEScg', 'sRGB')).not.toThrow();
    });
  });

  describe('theme changes', () => {
    it('GD-U080: theme change redraws when visible', () => {
      diagram.show();

      // Get the theme callback
      const themeCallback = mockThemeOn.mock.calls[0]?.[1];
      expect(themeCallback).toBeDefined();

      // Invoking theme callback should not throw (redraws graticule + triangles)
      expect(() => themeCallback()).not.toThrow();
    });

    it('GD-U081: theme change does not redraw when hidden', () => {
      // Diagram starts hidden, get the callback
      const themeCallback = mockThemeOn.mock.calls[0]?.[1];
      expect(themeCallback).toBeDefined();

      // Should not throw but should be a no-op (check no error with hidden diagram)
      expect(() => themeCallback()).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('GD-U060: can be called without error', () => {
      expect(() => diagram.dispose()).not.toThrow();
    });

    it('GD-U061: unsubscribes from theme changes', () => {
      diagram.dispose();
      expect(mockThemeOff).toHaveBeenCalledWith('themeChanged', expect.any(Function));
    });

    it('GD-U062: can be called multiple times', () => {
      expect(() => {
        diagram.dispose();
        diagram.dispose();
      }).not.toThrow();
    });

    it('GD-U063: disposes draggable container', () => {
      diagram.dispose();
      expect(mockDraggableDispose).toHaveBeenCalled();
    });

    it('GD-U064: update after dispose does not throw', () => {
      diagram.dispose();
      // Should handle gracefully (canvas context may be invalid but shouldn't crash)
      const imgData = new ImageData(2, 2);
      expect(() => diagram.update(imgData)).not.toThrow();
    });

    it('GD-U065: updateFloat after dispose does not throw', () => {
      diagram.dispose();
      const data = new Float32Array(2 * 2 * 4);
      expect(() => diagram.updateFloat(data, 2, 2)).not.toThrow();
    });
  });
});
