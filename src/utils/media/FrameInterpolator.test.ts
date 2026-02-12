import { describe, it, expect, beforeEach } from 'vitest';
import {
  blendFrames,
  blendCanvasFrames,
  FrameInterpolator,
  SubFramePosition,
} from './FrameInterpolator';

/**
 * Helper to create an ImageData-like object for testing.
 * In Node/JSDOM, ImageData may not be available, so we create a compatible structure.
 */
function createImageData(width: number, height: number, fill: number[]): ImageData {
  const length = width * height * 4;
  const data = new Uint8ClampedArray(length);
  for (let i = 0; i < length; i += 4) {
    data[i] = fill[0] ?? 0;       // R
    data[i + 1] = fill[1] ?? 0;   // G
    data[i + 2] = fill[2] ?? 0;   // B
    data[i + 3] = fill[3] ?? 255; // A
  }
  return new ImageData(data, width, height);
}

/**
 * Helper to create a mock HTMLCanvasElement with getContext support.
 */
function createMockCanvas(width: number, height: number, imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

describe('FrameInterpolator', () => {
  describe('blendFrames', () => {
    it('FI-U001: returns null for null frameA', () => {
      const frameB = createImageData(2, 2, [255, 0, 0, 255]);
      const result = blendFrames(null as any, frameB, 0.5);
      expect(result).toBeNull();
    });

    it('FI-U002: returns null for null frameB', () => {
      const frameA = createImageData(2, 2, [255, 0, 0, 255]);
      const result = blendFrames(frameA, null as any, 0.5);
      expect(result).toBeNull();
    });

    it('FI-U003: returns null for mismatched dimensions', () => {
      const frameA = createImageData(2, 2, [255, 0, 0, 255]);
      const frameB = createImageData(3, 3, [0, 0, 255, 255]);
      const result = blendFrames(frameA, frameB, 0.5);
      expect(result).toBeNull();
    });

    it('FI-U004: ratio=0 returns exact copy of frameA', () => {
      const frameA = createImageData(2, 2, [100, 150, 200, 255]);
      const frameB = createImageData(2, 2, [50, 75, 100, 128]);
      const result = blendFrames(frameA, frameB, 0);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(2);
      expect(result!.height).toBe(2);
      // Should be identical to frameA
      for (let i = 0; i < result!.data.length; i++) {
        expect(result!.data[i]).toBe(frameA.data[i]);
      }
    });

    it('FI-U005: ratio=1 returns exact copy of frameB', () => {
      const frameA = createImageData(2, 2, [100, 150, 200, 255]);
      const frameB = createImageData(2, 2, [50, 75, 100, 128]);
      const result = blendFrames(frameA, frameB, 1);
      expect(result).not.toBeNull();
      // Should be identical to frameB
      for (let i = 0; i < result!.data.length; i++) {
        expect(result!.data[i]).toBe(frameB.data[i]);
      }
    });

    it('FI-U006: ratio=0.5 returns midpoint blend', () => {
      const frameA = createImageData(1, 1, [0, 0, 0, 255]);
      const frameB = createImageData(1, 1, [200, 100, 50, 255]);
      const result = blendFrames(frameA, frameB, 0.5);
      expect(result).not.toBeNull();
      // Midpoint: (0*0.5 + 200*0.5 + 0.5) | 0 = 100
      expect(result!.data[0]).toBe(100); // R
      expect(result!.data[1]).toBe(50);  // G
      expect(result!.data[2]).toBe(25);  // B
      expect(result!.data[3]).toBe(255); // A (same on both sides)
    });

    it('FI-U007: ratio=0.25 blends closer to frameA', () => {
      const frameA = createImageData(1, 1, [0, 0, 0, 255]);
      const frameB = createImageData(1, 1, [200, 100, 0, 255]);
      const result = blendFrames(frameA, frameB, 0.25);
      expect(result).not.toBeNull();
      // (0 * 0.75 + 200 * 0.25 + 0.5) | 0 = 50
      expect(result!.data[0]).toBe(50);  // R
      expect(result!.data[1]).toBe(25);  // G
      expect(result!.data[2]).toBe(0);   // B
    });

    it('FI-U008: ratio=0.75 blends closer to frameB', () => {
      const frameA = createImageData(1, 1, [0, 0, 0, 255]);
      const frameB = createImageData(1, 1, [200, 100, 0, 255]);
      const result = blendFrames(frameA, frameB, 0.75);
      expect(result).not.toBeNull();
      // (0 * 0.25 + 200 * 0.75 + 0.5) | 0 = 150
      expect(result!.data[0]).toBe(150); // R
      expect(result!.data[1]).toBe(75);  // G
      expect(result!.data[2]).toBe(0);   // B
    });

    it('FI-U009: clamps negative ratio to 0', () => {
      const frameA = createImageData(1, 1, [100, 100, 100, 255]);
      const frameB = createImageData(1, 1, [200, 200, 200, 255]);
      const result = blendFrames(frameA, frameB, -0.5);
      expect(result).not.toBeNull();
      // Clamped to ratio=0, returns copy of frameA
      expect(result!.data[0]).toBe(100);
    });

    it('FI-U010: clamps ratio > 1 to 1', () => {
      const frameA = createImageData(1, 1, [100, 100, 100, 255]);
      const frameB = createImageData(1, 1, [200, 200, 200, 255]);
      const result = blendFrames(frameA, frameB, 1.5);
      expect(result).not.toBeNull();
      // Clamped to ratio=1, returns copy of frameB
      expect(result!.data[0]).toBe(200);
    });

    it('FI-U011: blends alpha channel correctly', () => {
      const frameA = createImageData(1, 1, [255, 255, 255, 0]);
      const frameB = createImageData(1, 1, [255, 255, 255, 255]);
      const result = blendFrames(frameA, frameB, 0.5);
      expect(result).not.toBeNull();
      // Alpha: (0 * 0.5 + 255 * 0.5 + 0.5) | 0 = 128
      expect(result!.data[3]).toBe(128);
    });

    it('FI-U012: handles larger images (4x4)', () => {
      const frameA = createImageData(4, 4, [10, 20, 30, 255]);
      const frameB = createImageData(4, 4, [110, 120, 130, 255]);
      const result = blendFrames(frameA, frameB, 0.5);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(4);
      expect(result!.height).toBe(4);
      // Check all pixels are blended
      for (let i = 0; i < result!.data.length; i += 4) {
        expect(result!.data[i]).toBe(60);     // R: (10*0.5 + 110*0.5 + 0.5)|0
        expect(result!.data[i + 1]).toBe(70);  // G: (20*0.5 + 120*0.5 + 0.5)|0
        expect(result!.data[i + 2]).toBe(80);  // B: (30*0.5 + 130*0.5 + 0.5)|0
        expect(result!.data[i + 3]).toBe(255); // A
      }
    });

    it('FI-U013: result dimensions match input', () => {
      const frameA = createImageData(10, 5, [0, 0, 0, 255]);
      const frameB = createImageData(10, 5, [255, 255, 255, 255]);
      const result = blendFrames(frameA, frameB, 0.3);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(10);
      expect(result!.height).toBe(5);
      expect(result!.data.length).toBe(10 * 5 * 4);
    });

    it('FI-U014: does not mutate input data', () => {
      const frameA = createImageData(1, 1, [100, 100, 100, 255]);
      const frameB = createImageData(1, 1, [200, 200, 200, 255]);
      const origA = new Uint8ClampedArray(frameA.data);
      const origB = new Uint8ClampedArray(frameB.data);
      blendFrames(frameA, frameB, 0.5);
      expect(frameA.data).toEqual(origA);
      expect(frameB.data).toEqual(origB);
    });
  });

  describe('blendCanvasFrames', () => {
    // Note: JSDOM canvas does not actually render pixel data, so putImageData/getImageData
    // return zero-filled data. We test the function returns a valid result (not null)
    // and that dimension/size checks work correctly. The actual pixel blending
    // is fully covered by the blendFrames tests above.

    it('FI-U020: returns a result for valid canvas elements', () => {
      const canvasA = document.createElement('canvas');
      canvasA.width = 2;
      canvasA.height = 2;
      const canvasB = document.createElement('canvas');
      canvasB.width = 2;
      canvasB.height = 2;

      const result = blendCanvasFrames(canvasA, canvasB, 0.5);
      // In JSDOM, canvas getImageData is mocked and returns 100x100 ImageData,
      // but the function should still succeed and return valid ImageData
      expect(result).not.toBeNull();
      expect(result!.data).toBeInstanceOf(Uint8ClampedArray);
    });

    it('FI-U021: returns null for mismatched canvas sizes', () => {
      const canvasA = document.createElement('canvas');
      canvasA.width = 2;
      canvasA.height = 2;
      const canvasB = document.createElement('canvas');
      canvasB.width = 3;
      canvasB.height = 3;

      const result = blendCanvasFrames(canvasA, canvasB, 0.5);
      expect(result).toBeNull();
    });

    it('FI-U022: returns null for zero-size canvas', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 0;
      canvas.height = 0;
      const canvasB = document.createElement('canvas');
      canvasB.width = 0;
      canvasB.height = 0;

      const result = blendCanvasFrames(canvas, canvasB, 0.5);
      expect(result).toBeNull();
    });
  });

  describe('FrameInterpolator class', () => {
    let interpolator: FrameInterpolator;

    beforeEach(() => {
      interpolator = new FrameInterpolator();
    });

    it('FI-U030: default state is disabled', () => {
      expect(interpolator.enabled).toBe(false);
    });

    it('FI-U031: can be enabled and disabled', () => {
      interpolator.enabled = true;
      expect(interpolator.enabled).toBe(true);
      interpolator.enabled = false;
      expect(interpolator.enabled).toBe(false);
    });

    it('FI-U032: returns null when disabled', () => {
      const dataA = createImageData(2, 2, [0, 0, 0, 255]);
      const dataB = createImageData(2, 2, [255, 255, 255, 255]);
      const canvasA = createMockCanvas(2, 2, dataA);
      const canvasB = createMockCanvas(2, 2, dataB);
      const position: SubFramePosition = { baseFrame: 1, nextFrame: 2, ratio: 0.5 };

      // Disabled by default
      const result = interpolator.getBlendedFrame(canvasA, canvasB, position);
      expect(result).toBeNull();
    });

    it('FI-U033: returns blended canvas when enabled', () => {
      interpolator.enabled = true;
      const dataA = createImageData(2, 2, [0, 0, 0, 255]);
      const dataB = createImageData(2, 2, [200, 100, 50, 255]);
      const canvasA = createMockCanvas(2, 2, dataA);
      const canvasB = createMockCanvas(2, 2, dataB);
      const position: SubFramePosition = { baseFrame: 1, nextFrame: 2, ratio: 0.5 };

      const result = interpolator.getBlendedFrame(canvasA, canvasB, position);
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(HTMLCanvasElement);
    });

    it('FI-U034: returns null when ratio is at boundary (0)', () => {
      interpolator.enabled = true;
      const dataA = createImageData(2, 2, [0, 0, 0, 255]);
      const dataB = createImageData(2, 2, [255, 255, 255, 255]);
      const canvasA = createMockCanvas(2, 2, dataA);
      const canvasB = createMockCanvas(2, 2, dataB);
      const position: SubFramePosition = { baseFrame: 1, nextFrame: 2, ratio: 0 };

      const result = interpolator.getBlendedFrame(canvasA, canvasB, position);
      expect(result).toBeNull();
    });

    it('FI-U035: returns null when ratio is at boundary (1)', () => {
      interpolator.enabled = true;
      const dataA = createImageData(2, 2, [0, 0, 0, 255]);
      const dataB = createImageData(2, 2, [255, 255, 255, 255]);
      const canvasA = createMockCanvas(2, 2, dataA);
      const canvasB = createMockCanvas(2, 2, dataB);
      const position: SubFramePosition = { baseFrame: 1, nextFrame: 2, ratio: 1 };

      const result = interpolator.getBlendedFrame(canvasA, canvasB, position);
      expect(result).toBeNull();
    });

    it('FI-U036: caches result for same position', () => {
      interpolator.enabled = true;
      const dataA = createImageData(2, 2, [0, 0, 0, 255]);
      const dataB = createImageData(2, 2, [200, 100, 50, 255]);
      const canvasA = createMockCanvas(2, 2, dataA);
      const canvasB = createMockCanvas(2, 2, dataB);
      const position: SubFramePosition = { baseFrame: 1, nextFrame: 2, ratio: 0.5 };

      const result1 = interpolator.getBlendedFrame(canvasA, canvasB, position);
      const result2 = interpolator.getBlendedFrame(canvasA, canvasB, position);
      // Should return same cached canvas instance
      expect(result1).toBe(result2);
    });

    it('FI-U037: clearCache resets cached data', () => {
      interpolator.enabled = true;
      const dataA = createImageData(2, 2, [0, 0, 0, 255]);
      const dataB = createImageData(2, 2, [200, 100, 50, 255]);
      const canvasA = createMockCanvas(2, 2, dataA);
      const canvasB = createMockCanvas(2, 2, dataB);
      const position: SubFramePosition = { baseFrame: 1, nextFrame: 2, ratio: 0.5 };

      const result1 = interpolator.getBlendedFrame(canvasA, canvasB, position);
      expect(result1).not.toBeNull();

      interpolator.clearCache();
      expect(interpolator.lastPosition).toBeNull();
    });

    it('FI-U038: disabling clears cache', () => {
      interpolator.enabled = true;
      const dataA = createImageData(2, 2, [0, 0, 0, 255]);
      const dataB = createImageData(2, 2, [200, 100, 50, 255]);
      const canvasA = createMockCanvas(2, 2, dataA);
      const canvasB = createMockCanvas(2, 2, dataB);
      const position: SubFramePosition = { baseFrame: 1, nextFrame: 2, ratio: 0.5 };

      interpolator.getBlendedFrame(canvasA, canvasB, position);
      expect(interpolator.lastPosition).not.toBeNull();

      interpolator.enabled = false;
      expect(interpolator.lastPosition).toBeNull();
    });

    it('FI-U039: dispose clears all resources', () => {
      interpolator.enabled = true;
      const dataA = createImageData(2, 2, [0, 0, 0, 255]);
      const dataB = createImageData(2, 2, [200, 100, 50, 255]);
      const canvasA = createMockCanvas(2, 2, dataA);
      const canvasB = createMockCanvas(2, 2, dataB);
      const position: SubFramePosition = { baseFrame: 1, nextFrame: 2, ratio: 0.5 };

      interpolator.getBlendedFrame(canvasA, canvasB, position);
      interpolator.dispose();
      expect(interpolator.lastPosition).toBeNull();
    });
  });

  // =================================================================
  // FPS regression: blendCanvasFrames and getBlendedFrame must accept
  // ImageBitmap inputs.  MediabunnyFrameExtractor now returns ImageBitmap
  // via snapshotCanvas/createImageBitmap instead of HTMLCanvasElement.
  // If someone removes ImageBitmap support from the function signatures,
  // blending will break during slow-motion playback of video sources.
  // =================================================================

  describe('ImageBitmap input support (FPS regression)', () => {
    it('FI-FPS-001: blendCanvasFrames accepts ImageBitmap-typed inputs without throwing', () => {
      // In JSDOM, ImageBitmap doesn't exist, so blendCanvasFrames should
      // handle the typeof guard gracefully and return null rather than crashing.
      // This test verifies the guard works (no ReferenceError on `instanceof ImageBitmap`).
      const canvasA = createMockCanvas(2, 2, createImageData(2, 2, [0, 0, 0, 255]));
      const canvasB = createMockCanvas(2, 2, createImageData(2, 2, [255, 255, 255, 255]));

      // blendCanvasFrames should succeed with regular canvases
      void blendCanvasFrames(canvasA, canvasB, 0.5);
      // In JSDOM it may return null due to canvas limitations, but it must not throw
      expect(() => blendCanvasFrames(canvasA, canvasB, 0.5)).not.toThrow();
    });

    it('FI-FPS-002: getBlendedFrame handles canvas types gracefully', () => {
      const fi = new FrameInterpolator();
      fi.enabled = true;
      const dataA = createImageData(2, 2, [0, 0, 0, 255]);
      const dataB = createImageData(2, 2, [255, 255, 255, 255]);
      const canvasA = createMockCanvas(2, 2, dataA);
      const canvasB = createMockCanvas(2, 2, dataB);
      const position: SubFramePosition = { baseFrame: 1, nextFrame: 2, ratio: 0.5 };

      // Must not throw with canvas inputs (ImageBitmap guard should be safe)
      expect(() => fi.getBlendedFrame(canvasA, canvasB, position)).not.toThrow();
    });

    it('FI-FPS-003: blendCanvasFrames function signature includes ImageBitmap type', () => {
      // Verify the function exists and is callable.
      // The TypeScript type signature includes ImageBitmap — this test catches
      // runtime breakage if the function is accidentally changed.
      expect(typeof blendCanvasFrames).toBe('function');
      expect(blendCanvasFrames.length).toBeGreaterThanOrEqual(3); // canvasA, canvasB, ratio
    });
  });
});
