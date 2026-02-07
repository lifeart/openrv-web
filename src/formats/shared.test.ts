/**
 * Shared format decoder utilities - Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { validateImageDimensions, toRGBA, applyLogToLinearRGBA } from './shared';
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
});
