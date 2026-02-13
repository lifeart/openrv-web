/**
 * Shared format decoder utilities - Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { validateImageDimensions, toRGBA, applyLogToLinearRGBA, drawImageWithOrientation, applyOrientationRGBA } from './shared';
import { IMAGE_LIMITS } from '../config/ImageLimits';

describe('shared decoder utilities', () => {
  describe('validateImageDimensions', () => {
    it('SH-U001: should accept valid small dimensions', () => {
      expect(() => validateImageDimensions(100, 200, 'Test')).not.toThrow();
    });

    it('SH-U002: should accept 1x1 image', () => {
      expect(() => validateImageDimensions(1, 1, 'Test')).not.toThrow();
    });

    it('SH-U003: should accept maximum single-dimension image', () => {
      expect(() => validateImageDimensions(65536, 1, 'Test')).not.toThrow();
      expect(() => validateImageDimensions(1, 65536, 'Test')).not.toThrow();
    });

    it('SH-U004: should reject zero width', () => {
      expect(() => validateImageDimensions(0, 100, 'Test')).toThrow(
        'Invalid Test dimensions: 0x100'
      );
    });

    it('SH-U005: should reject zero height', () => {
      expect(() => validateImageDimensions(100, 0, 'Test')).toThrow(
        'Invalid Test dimensions: 100x0'
      );
    });

    it('SH-U006: should reject negative width', () => {
      expect(() => validateImageDimensions(-1, 100, 'Test')).toThrow(
        'Invalid Test dimensions: -1x100'
      );
    });

    it('SH-U007: should reject negative height', () => {
      expect(() => validateImageDimensions(100, -5, 'Test')).toThrow(
        'Invalid Test dimensions: 100x-5'
      );
    });

    it('SH-U008: should reject width exceeding max dimension', () => {
      expect(() => validateImageDimensions(65537, 100, 'Test')).toThrow(
        'Test dimensions 65537x100 exceed maximum of 65536x65536'
      );
    });

    it('SH-U009: should reject height exceeding max dimension', () => {
      expect(() => validateImageDimensions(100, 65537, 'Test')).toThrow(
        'Test dimensions 100x65537 exceed maximum of 65536x65536'
      );
    });

    it('SH-U010: should reject total pixels exceeding max', () => {
      // 20000 * 20000 = 400M > 268M limit
      expect(() => validateImageDimensions(20000, 20000, 'Test')).toThrow(
        'Test image has 400000000 pixels, exceeding maximum of 268435456'
      );
    });

    it('SH-U011: should include format name in all error messages', () => {
      expect(() => validateImageDimensions(0, 0, 'DPX')).toThrow(/DPX/);
      expect(() => validateImageDimensions(99999, 1, 'EXR')).toThrow(/EXR/);
      expect(() => validateImageDimensions(20000, 20000, 'Cineon')).toThrow(/Cineon/);
    });

    it('SH-U012: should use custom maxDimension when provided', () => {
      expect(() => validateImageDimensions(200, 200, 'Test', 100)).toThrow(
        'Test dimensions 200x200 exceed maximum of 100x100'
      );
      expect(() => validateImageDimensions(100, 100, 'Test', 100)).not.toThrow();
    });

    it('SH-U013: should use custom maxPixels when provided', () => {
      expect(() => validateImageDimensions(100, 100, 'Test', 65536, 5000)).toThrow(
        'Test image has 10000 pixels, exceeding maximum of 5000'
      );
    });

    it('SH-U014: default limits should match IMAGE_LIMITS config', () => {
      // Verify the defaults are wired to the centralized config
      expect(IMAGE_LIMITS.MAX_DIMENSION).toBe(65536);
      expect(IMAGE_LIMITS.MAX_PIXELS).toBe(268435456);
    });
  });

  describe('toRGBA', () => {
    it('SH-U020: should pass through 4-channel data unchanged', () => {
      const input = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
      const result = toRGBA(input, 2, 1, 4);
      expect(result).toBe(input); // Same reference, not a copy
    });

    it('SH-U021: should convert 3-channel RGB to RGBA with alpha=1.0', () => {
      const input = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
      const result = toRGBA(input, 2, 1, 3);
      expect(result.length).toBe(8); // 2 pixels * 4 channels
      // Pixel 0
      expect(result[0]).toBeCloseTo(0.1);
      expect(result[1]).toBeCloseTo(0.2);
      expect(result[2]).toBeCloseTo(0.3);
      expect(result[3]).toBe(1.0);
      // Pixel 1
      expect(result[4]).toBeCloseTo(0.4);
      expect(result[5]).toBeCloseTo(0.5);
      expect(result[6]).toBeCloseTo(0.6);
      expect(result[7]).toBe(1.0);
    });

    it('SH-U022: should convert 1-channel grayscale to RGBA (R=G=B=value, A=1.0)', () => {
      const input = new Float32Array([0.5, 0.8]);
      const result = toRGBA(input, 2, 1, 1);
      expect(result.length).toBe(8);
      // Pixel 0: grayscale 0.5
      expect(result[0]).toBeCloseTo(0.5);
      expect(result[1]).toBeCloseTo(0.5);
      expect(result[2]).toBeCloseTo(0.5);
      expect(result[3]).toBe(1.0);
      // Pixel 1: grayscale 0.8
      expect(result[4]).toBeCloseTo(0.8);
      expect(result[5]).toBeCloseTo(0.8);
      expect(result[6]).toBeCloseTo(0.8);
      expect(result[7]).toBe(1.0);
    });

    it('SH-U023: should handle single pixel with 3 channels', () => {
      const input = new Float32Array([1.0, 0.0, 0.5]);
      const result = toRGBA(input, 1, 1, 3);
      expect(result.length).toBe(4);
      expect(result[0]).toBe(1.0);
      expect(result[1]).toBe(0.0);
      expect(result[2]).toBe(0.5);
      expect(result[3]).toBe(1.0);
    });

    it('SH-U024: should handle multi-row images', () => {
      // 2x2 image with 3 channels
      const input = new Float32Array([
        0.1, 0.2, 0.3,  // row 0, col 0
        0.4, 0.5, 0.6,  // row 0, col 1
        0.7, 0.8, 0.9,  // row 1, col 0
        1.0, 0.0, 0.5,  // row 1, col 1
      ]);
      const result = toRGBA(input, 2, 2, 3);
      expect(result.length).toBe(16); // 4 pixels * 4 channels
      // Last pixel
      expect(result[12]).toBeCloseTo(1.0);
      expect(result[13]).toBeCloseTo(0.0);
      expect(result[14]).toBeCloseTo(0.5);
      expect(result[15]).toBe(1.0);
    });

    it('SH-U025: should always set alpha to 1.0 for non-4-channel input', () => {
      const input = new Float32Array([0.1, 0.2, 0.3]);
      const result = toRGBA(input, 1, 1, 3);
      expect(result[3]).toBe(1.0);
    });

    it('SH-U026: should create new Float32Array for non-4-channel input', () => {
      const input = new Float32Array([0.1, 0.2, 0.3]);
      const result = toRGBA(input, 1, 1, 3);
      expect(result).not.toBe(input);
      expect(result).toBeInstanceOf(Float32Array);
    });
  });

  describe('applyLogToLinearRGBA', () => {
    it('SH-U030: should apply conversion function to RGB channels only', () => {
      // 1 pixel RGBA
      const data = new Float32Array([0.5, 0.5, 0.5, 0.9]);
      const fn = (cv: number) => cv * 2; // simple doubling
      applyLogToLinearRGBA(data, 1, 1, 8, fn);
      // 0.5 * 255 = 127.5, then fn(127.5) = 255
      expect(data[0]).toBeCloseTo(255);
      expect(data[1]).toBeCloseTo(255);
      expect(data[2]).toBeCloseTo(255);
      // Alpha unchanged
      expect(data[3]).toBeCloseTo(0.9);
    });

    it('SH-U031: should preserve alpha channel', () => {
      const data = new Float32Array([0.0, 0.0, 0.0, 0.42]);
      applyLogToLinearRGBA(data, 1, 1, 10, (cv) => cv);
      expect(data[3]).toBeCloseTo(0.42);
    });

    it('SH-U032: should compute correct code values for 10-bit data', () => {
      // maxCodeValue = (1 << 10) - 1 = 1023
      const calls: number[] = [];
      const data = new Float32Array([1.0, 0.5, 0.0, 1.0]);
      applyLogToLinearRGBA(data, 1, 1, 10, (cv) => {
        calls.push(cv);
        return cv;
      });
      expect(calls[0]).toBeCloseTo(1023);    // 1.0 * 1023
      expect(calls[1]).toBeCloseTo(511.5);   // 0.5 * 1023
      expect(calls[2]).toBeCloseTo(0);       // 0.0 * 1023
    });

    it('SH-U033: should handle multi-pixel images', () => {
      // 2x1 image
      const data = new Float32Array([
        0.5, 0.5, 0.5, 1.0,  // pixel 0
        1.0, 1.0, 1.0, 0.5,  // pixel 1
      ]);
      applyLogToLinearRGBA(data, 2, 1, 8, (cv) => cv / 255);
      // pixel 0: 0.5 * 255 = 127.5, then / 255 = 0.5
      expect(data[0]).toBeCloseTo(0.5);
      // pixel 0 alpha unchanged
      expect(data[3]).toBeCloseTo(1.0);
      // pixel 1: 1.0 * 255 = 255, then / 255 = 1.0
      expect(data[4]).toBeCloseTo(1.0);
      // pixel 1 alpha unchanged
      expect(data[7]).toBeCloseTo(0.5);
    });

    it('SH-U034: should modify data in-place', () => {
      const data = new Float32Array([0.5, 0.5, 0.5, 1.0]);
      const ref = data;
      applyLogToLinearRGBA(data, 1, 1, 8, () => 42);
      expect(data).toBe(ref); // Same reference
      expect(data[0]).toBe(42);
    });
  });

  describe('drawImageWithOrientation', () => {
    function createMockCtx() {
      return {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        drawImage: vi.fn(),
      };
    }

    it('SH-U040: orientation 1 calls drawImage without transforms', () => {
      const ctx = createMockCtx();
      const image = {} as CanvasImageSource;
      drawImageWithOrientation(ctx as unknown as CanvasRenderingContext2D, image, 100, 200, 1);

      expect(ctx.save).toHaveBeenCalledOnce();
      expect(ctx.restore).toHaveBeenCalledOnce();
      expect(ctx.translate).not.toHaveBeenCalled();
      expect(ctx.rotate).not.toHaveBeenCalled();
      expect(ctx.scale).not.toHaveBeenCalled();
      expect(ctx.drawImage).toHaveBeenCalledWith(image, 0, 0, 100, 200);
    });

    it('SH-U041: orientation 6 calls translate(dW,0), rotate(PI/2), drawImage(dH, dW)', () => {
      const ctx = createMockCtx();
      const image = {} as CanvasImageSource;
      drawImageWithOrientation(ctx as unknown as CanvasRenderingContext2D, image, 100, 200, 6);

      expect(ctx.save).toHaveBeenCalledOnce();
      expect(ctx.restore).toHaveBeenCalledOnce();
      expect(ctx.translate).toHaveBeenCalledWith(100, 0);
      expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
      expect(ctx.drawImage).toHaveBeenCalledWith(image, 0, 0, 200, 100);
    });

    it('SH-U042: orientation 8 calls translate(0,dH), rotate(-PI/2), drawImage(dH, dW)', () => {
      const ctx = createMockCtx();
      const image = {} as CanvasImageSource;
      drawImageWithOrientation(ctx as unknown as CanvasRenderingContext2D, image, 100, 200, 8);

      expect(ctx.save).toHaveBeenCalledOnce();
      expect(ctx.restore).toHaveBeenCalledOnce();
      expect(ctx.translate).toHaveBeenCalledWith(0, 200);
      expect(ctx.rotate).toHaveBeenCalledWith(-Math.PI / 2);
      expect(ctx.drawImage).toHaveBeenCalledWith(image, 0, 0, 200, 100);
    });

    it('SH-U043: all 8 orientations run without error (smoke test)', () => {
      for (let orientation = 1; orientation <= 8; orientation++) {
        const ctx = createMockCtx();
        const image = {} as CanvasImageSource;
        expect(() => {
          drawImageWithOrientation(ctx as unknown as CanvasRenderingContext2D, image, 640, 480, orientation);
        }).not.toThrow();
        expect(ctx.save).toHaveBeenCalledOnce();
        expect(ctx.restore).toHaveBeenCalledOnce();
        expect(ctx.drawImage).toHaveBeenCalledOnce();
      }
    });
  });

  describe('applyOrientationRGBA', () => {
    // Helper: create a 2x3 (W=2, H=3) RGBA grid with unique pixel values.
    // Pixel at (x, y) has values [x*10 + y, x*10 + y + 0.1, x*10 + y + 0.2, 1.0]
    function make2x3Grid(): Float32Array {
      const W = 2;
      const H = 3;
      const data = new Float32Array(W * H * 4);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const idx = (y * W + x) * 4;
          const base = x * 10 + y;
          data[idx] = base;
          data[idx + 1] = base + 0.1;
          data[idx + 2] = base + 0.2;
          data[idx + 3] = 1.0;
        }
      }
      return data;
    }

    // Helper: get the RGBA values of a pixel at (x, y) from a flat array
    function getPixel(data: Float32Array, w: number, x: number, y: number): number[] {
      const idx = (y * w + x) * 4;
      return [data[idx]!, data[idx + 1]!, data[idx + 2]!, data[idx + 3]!];
    }

    // Helper: expected base value for the original pixel at (x, y)
    function expectedBase(x: number, y: number): number {
      return x * 10 + y;
    }

    it('SH-U050: orientation 1 returns same data reference (no-op)', () => {
      const data = new Float32Array([0.1, 0.2, 0.3, 1.0, 0.4, 0.5, 0.6, 1.0]);
      const result = applyOrientationRGBA(data, 2, 1, 1);
      expect(result.data).toBe(data);
      expect(result.width).toBe(2);
      expect(result.height).toBe(1);
    });

    it('SH-U051: orientation 0 and 9 treated as no-op (returns same ref)', () => {
      const data = new Float32Array([0.1, 0.2, 0.3, 1.0]);
      const result0 = applyOrientationRGBA(data, 1, 1, 0);
      expect(result0.data).toBe(data);
      expect(result0.width).toBe(1);
      expect(result0.height).toBe(1);

      const result9 = applyOrientationRGBA(data, 1, 1, 9);
      expect(result9.data).toBe(data);
      expect(result9.width).toBe(1);
      expect(result9.height).toBe(1);
    });

    it('SH-U052: orientation 6 on 2x3 grid produces 3x2 with correct pixel positions', () => {
      // Orientation 6: dx = H-1-y, dy = x => 90 CW, output is 3x2 (outW=H=3, outH=W=2)
      const data = make2x3Grid();
      const result = applyOrientationRGBA(data, 2, 3, 6);
      expect(result.width).toBe(3);
      expect(result.height).toBe(2);

      // For each source pixel (x, y), it maps to destination (H-1-y, x) = (2-y, x)
      // Source (0,0) -> Dest (2, 0)
      const p00 = getPixel(result.data, 3, 2, 0);
      expect(p00[0]).toBeCloseTo(expectedBase(0, 0));

      // Source (1,0) -> Dest (2, 1)
      const p10 = getPixel(result.data, 3, 2, 1);
      expect(p10[0]).toBeCloseTo(expectedBase(1, 0));

      // Source (0,1) -> Dest (1, 0)
      const p01 = getPixel(result.data, 3, 1, 0);
      expect(p01[0]).toBeCloseTo(expectedBase(0, 1));

      // Source (1,1) -> Dest (1, 1)
      const p11 = getPixel(result.data, 3, 1, 1);
      expect(p11[0]).toBeCloseTo(expectedBase(1, 1));

      // Source (0,2) -> Dest (0, 0)
      const p02 = getPixel(result.data, 3, 0, 0);
      expect(p02[0]).toBeCloseTo(expectedBase(0, 2));

      // Source (1,2) -> Dest (0, 1)
      const p12 = getPixel(result.data, 3, 0, 1);
      expect(p12[0]).toBeCloseTo(expectedBase(1, 2));
    });

    it('SH-U053: orientation 8 on 2x3 grid produces 3x2 with correct pixel positions', () => {
      // Orientation 8: dx = y, dy = W-1-x => 90 CCW, output is 3x2 (outW=H=3, outH=W=2)
      const data = make2x3Grid();
      const result = applyOrientationRGBA(data, 2, 3, 8);
      expect(result.width).toBe(3);
      expect(result.height).toBe(2);

      // Source (0,0) -> Dest (0, 1)  (dx=0, dy=2-1-0=1)
      const p00 = getPixel(result.data, 3, 0, 1);
      expect(p00[0]).toBeCloseTo(expectedBase(0, 0));

      // Source (1,0) -> Dest (0, 0)  (dx=0, dy=2-1-1=0)
      const p10 = getPixel(result.data, 3, 0, 0);
      expect(p10[0]).toBeCloseTo(expectedBase(1, 0));

      // Source (0,1) -> Dest (1, 1)  (dx=1, dy=2-1-0=1)
      const p01 = getPixel(result.data, 3, 1, 1);
      expect(p01[0]).toBeCloseTo(expectedBase(0, 1));

      // Source (1,1) -> Dest (1, 0)  (dx=1, dy=2-1-1=0)
      const p11 = getPixel(result.data, 3, 1, 0);
      expect(p11[0]).toBeCloseTo(expectedBase(1, 1));

      // Source (0,2) -> Dest (2, 1)  (dx=2, dy=2-1-0=1)
      const p02 = getPixel(result.data, 3, 2, 1);
      expect(p02[0]).toBeCloseTo(expectedBase(0, 2));

      // Source (1,2) -> Dest (2, 0)  (dx=2, dy=2-1-1=0)
      const p12 = getPixel(result.data, 3, 2, 0);
      expect(p12[0]).toBeCloseTo(expectedBase(1, 2));
    });

    it('SH-U054: all 8 orientations with a 2x3 non-square grid, verify each pixel', () => {
      const W = 2;
      const H = 3;
      const data = make2x3Grid();

      // Define the expected pixel mapping for each orientation
      // Maps (x, y) -> (dx, dy) and expected output dimensions
      const orientationMappings: Record<number, {
        outW: number; outH: number;
        map: (x: number, y: number) => [number, number];
      }> = {
        1: { outW: W, outH: H, map: (x, y) => [x, y] },
        2: { outW: W, outH: H, map: (x, y) => [W - 1 - x, y] },
        3: { outW: W, outH: H, map: (x, y) => [W - 1 - x, H - 1 - y] },
        4: { outW: W, outH: H, map: (x, y) => [x, H - 1 - y] },
        5: { outW: H, outH: W, map: (x, y) => [y, x] },
        6: { outW: H, outH: W, map: (x, y) => [H - 1 - y, x] },
        7: { outW: H, outH: W, map: (x, y) => [H - 1 - y, W - 1 - x] },
        8: { outW: H, outH: W, map: (x, y) => [y, W - 1 - x] },
      };

      for (let orientation = 1; orientation <= 8; orientation++) {
        const inputData = new Float32Array(data);
        const result = applyOrientationRGBA(inputData, W, H, orientation);
        const mapping = orientationMappings[orientation]!;

        expect(result.width).toBe(mapping.outW);
        expect(result.height).toBe(mapping.outH);

        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const [dx, dy] = mapping.map(x, y);
            const pixel = getPixel(result.data, mapping.outW, dx, dy);
            const base = expectedBase(x, y);
            expect(pixel[0]).toBeCloseTo(base, 5);
            expect(pixel[1]).toBeCloseTo(base + 0.1, 5);
            expect(pixel[2]).toBeCloseTo(base + 0.2, 5);
            expect(pixel[3]).toBeCloseTo(1.0, 5);
          }
        }
      }
    });

    it('SH-U055: orientation 3 (rotate 180) preserves dimensions', () => {
      const W = 2;
      const H = 3;
      const data = make2x3Grid();
      const result = applyOrientationRGBA(data, W, H, 3);

      expect(result.width).toBe(W);
      expect(result.height).toBe(H);

      // Orientation 3: dx = W-1-x, dy = H-1-y (180 rotation)
      // Source (0,0) -> Dest (1, 2)
      const p00 = getPixel(result.data, W, 1, 2);
      expect(p00[0]).toBeCloseTo(expectedBase(0, 0));
      expect(p00[1]).toBeCloseTo(expectedBase(0, 0) + 0.1);
      expect(p00[2]).toBeCloseTo(expectedBase(0, 0) + 0.2);
      expect(p00[3]).toBeCloseTo(1.0);

      // Source (1,2) -> Dest (0, 0)
      const p12 = getPixel(result.data, W, 0, 0);
      expect(p12[0]).toBeCloseTo(expectedBase(1, 2));
      expect(p12[1]).toBeCloseTo(expectedBase(1, 2) + 0.1);
      expect(p12[2]).toBeCloseTo(expectedBase(1, 2) + 0.2);
      expect(p12[3]).toBeCloseTo(1.0);
    });
  });
});
