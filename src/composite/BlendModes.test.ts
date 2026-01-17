/**
 * Blend Modes Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  BLEND_MODES,
  BLEND_MODE_LABELS,
  compositeImageData,
  compositeMultipleLayers,
  CompositeLayer,
} from './BlendModes';
import { createTestImageData } from '../../test/utils';

describe('BlendModes', () => {
  describe('BLEND_MODES constant', () => {
    it('contains all expected blend modes', () => {
      expect(BLEND_MODES).toContain('normal');
      expect(BLEND_MODES).toContain('add');
      expect(BLEND_MODES).toContain('multiply');
      expect(BLEND_MODES).toContain('screen');
      expect(BLEND_MODES).toContain('overlay');
      expect(BLEND_MODES).toContain('difference');
      expect(BLEND_MODES).toContain('exclusion');
    });

    it('has labels for all modes', () => {
      for (const mode of BLEND_MODES) {
        expect(BLEND_MODE_LABELS[mode]).toBeDefined();
        expect(typeof BLEND_MODE_LABELS[mode]).toBe('string');
      }
    });
  });

  describe('compositeImageData', () => {
    describe('normal mode', () => {
      it('BLD-001: replaces base with top at full opacity', () => {
        const base = createTestImageData(2, 2, { r: 100, g: 100, b: 100, a: 255 });
        const top = createTestImageData(2, 2, { r: 200, g: 150, b: 50, a: 255 });

        const result = compositeImageData(base, top, 'normal', 1);

        expect(result.data[0]).toBe(200); // R
        expect(result.data[1]).toBe(150); // G
        expect(result.data[2]).toBe(50);  // B
        expect(result.data[3]).toBe(255); // A
      });

      it('BLD-008: opacity=0 shows only base', () => {
        const base = createTestImageData(2, 2, { r: 100, g: 100, b: 100, a: 255 });
        const top = createTestImageData(2, 2, { r: 200, g: 200, b: 200, a: 255 });

        const result = compositeImageData(base, top, 'normal', 0);

        expect(result.data[0]).toBe(100);
        expect(result.data[1]).toBe(100);
        expect(result.data[2]).toBe(100);
      });

      it('BLD-009: opacity=0.5 blends 50/50', () => {
        const base = createTestImageData(2, 2, { r: 0, g: 0, b: 0, a: 255 });
        const top = createTestImageData(2, 2, { r: 200, g: 200, b: 200, a: 255 });

        const result = compositeImageData(base, top, 'normal', 0.5);

        // Should be approximately midpoint
        expect(result.data[0]).toBeCloseTo(100, -1);
      });
    });

    describe('add mode', () => {
      it('BLD-002: sums values and clamps', () => {
        const base = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });
        const top = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });

        const result = compositeImageData(base, top, 'add', 1);

        // 128 + 128 = 256, clamped to 255
        expect(result.data[0]).toBe(255);
      });

      it('adds without overflow when result < 255', () => {
        const base = createTestImageData(2, 2, { r: 50, g: 50, b: 50, a: 255 });
        const top = createTestImageData(2, 2, { r: 50, g: 50, b: 50, a: 255 });

        const result = compositeImageData(base, top, 'add', 1);

        // 50/255 + 50/255 ≈ 0.39 -> 100
        expect(result.data[0]).toBeCloseTo(100, -1);
      });
    });

    describe('multiply mode', () => {
      it('BLD-003: darkens image', () => {
        const base = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });
        const top = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });

        const result = compositeImageData(base, top, 'multiply', 1);

        // (128/255) * (128/255) ≈ 0.25 -> 64
        expect(result.data[0]).toBeCloseTo(64, -1);
      });

      it('multiply with white produces original', () => {
        const base = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });
        const top = createTestImageData(2, 2, { r: 255, g: 255, b: 255, a: 255 });

        const result = compositeImageData(base, top, 'multiply', 1);

        expect(result.data[0]).toBeCloseTo(128, -1);
      });

      it('multiply with black produces black', () => {
        const base = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });
        const top = createTestImageData(2, 2, { r: 0, g: 0, b: 0, a: 255 });

        const result = compositeImageData(base, top, 'multiply', 1);

        expect(result.data[0]).toBe(0);
      });
    });

    describe('screen mode', () => {
      it('BLD-004: lightens image', () => {
        const base = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });
        const top = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });

        const result = compositeImageData(base, top, 'screen', 1);

        // 1 - (1-0.5)*(1-0.5) = 0.75 -> 191
        expect(result.data[0]).toBeCloseTo(191, -1);
      });

      it('screen with black produces original', () => {
        const base = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });
        const top = createTestImageData(2, 2, { r: 0, g: 0, b: 0, a: 255 });

        const result = compositeImageData(base, top, 'screen', 1);

        expect(result.data[0]).toBeCloseTo(128, -1);
      });
    });

    describe('overlay mode', () => {
      it('BLD-005: combines multiply and screen', () => {
        const base = createTestImageData(2, 2, { r: 64, g: 64, b: 64, a: 255 });
        const top = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });

        const result = compositeImageData(base, top, 'overlay', 1);

        // For base < 0.5: 2 * base * top
        // 2 * 0.25 * 0.5 = 0.25 -> 64
        expect(result.data[0]).toBeCloseTo(64, -1);
      });
    });

    describe('difference mode', () => {
      it('BLD-006: shows absolute difference', () => {
        const base = createTestImageData(2, 2, { r: 200, g: 200, b: 200, a: 255 });
        const top = createTestImageData(2, 2, { r: 100, g: 100, b: 100, a: 255 });

        const result = compositeImageData(base, top, 'difference', 1);

        // |200/255 - 100/255| ≈ 0.39 -> 100
        expect(result.data[0]).toBeCloseTo(100, -1);
      });

      it('difference of identical images is black', () => {
        const base = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });
        const top = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });

        const result = compositeImageData(base, top, 'difference', 1);

        expect(result.data[0]).toBe(0);
      });
    });

    describe('exclusion mode', () => {
      it('BLD-007: similar to difference but softer', () => {
        const base = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });
        const top = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 255 });

        const result = compositeImageData(base, top, 'exclusion', 1);

        // a + b - 2*a*b = 0.5 + 0.5 - 2*0.5*0.5 = 0.5 -> 128
        expect(result.data[0]).toBeCloseTo(128, -1);
      });
    });

    describe('alpha handling', () => {
      it('BLD-010: uses Porter-Duff over operation', () => {
        const base = createTestImageData(2, 2, { r: 255, g: 0, b: 0, a: 255 });
        const top = createTestImageData(2, 2, { r: 0, g: 255, b: 0, a: 128 });

        const result = compositeImageData(base, top, 'normal', 1);

        // Semi-transparent green over red
        expect(result.data[0]).toBeLessThan(255); // Some red showing through
        expect(result.data[1]).toBeGreaterThan(0); // Green visible
      });

      it('fully transparent top shows base', () => {
        const base = createTestImageData(2, 2, { r: 255, g: 0, b: 0, a: 255 });
        const top = createTestImageData(2, 2, { r: 0, g: 255, b: 0, a: 0 });

        const result = compositeImageData(base, top, 'normal', 1);

        expect(result.data[0]).toBe(255); // Red unchanged
        expect(result.data[1]).toBe(0);   // No green
      });

      it('fully transparent base shows top', () => {
        const base = createTestImageData(2, 2, { r: 255, g: 0, b: 0, a: 0 });
        const top = createTestImageData(2, 2, { r: 0, g: 255, b: 0, a: 255 });

        const result = compositeImageData(base, top, 'normal', 1);

        expect(result.data[0]).toBe(0);   // No red
        expect(result.data[1]).toBe(255); // Green
      });
    });

    describe('error handling', () => {
      it('BLD-011: throws if dimensions mismatch', () => {
        const base = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });
        const top = createTestImageData(5, 5, { r: 128, g: 128, b: 128 });

        expect(() => compositeImageData(base, top)).toThrow('dimensions must match');
      });
    });
  });

  describe('compositeMultipleLayers', () => {
    it('BLD-012: stacks layers from bottom to top', () => {
      const layers: CompositeLayer[] = [
        {
          imageData: createTestImageData(10, 10, { r: 255, g: 0, b: 0, a: 255 }),
          blendMode: 'normal',
          opacity: 1,
          visible: true,
        },
        {
          imageData: createTestImageData(10, 10, { r: 0, g: 255, b: 0, a: 255 }),
          blendMode: 'normal',
          opacity: 1,
          visible: true,
        },
      ];

      const result = compositeMultipleLayers(layers, 10, 10);

      // Top layer (green) should be visible
      expect(result.data[0]).toBe(0);   // No red
      expect(result.data[1]).toBe(255); // Green
    });

    it('BLD-013: skips invisible layers', () => {
      const layers: CompositeLayer[] = [
        {
          imageData: createTestImageData(10, 10, { r: 255, g: 0, b: 0, a: 255 }),
          blendMode: 'normal',
          opacity: 1,
          visible: true,
        },
        {
          imageData: createTestImageData(10, 10, { r: 0, g: 255, b: 0, a: 255 }),
          blendMode: 'normal',
          opacity: 1,
          visible: false, // Invisible
        },
      ];

      const result = compositeMultipleLayers(layers, 10, 10);

      // Only red layer should be visible
      expect(result.data[0]).toBe(255); // Red
      expect(result.data[1]).toBe(0);   // No green
    });

    it('skips layers with opacity 0', () => {
      const layers: CompositeLayer[] = [
        {
          imageData: createTestImageData(10, 10, { r: 255, g: 0, b: 0, a: 255 }),
          blendMode: 'normal',
          opacity: 1,
          visible: true,
        },
        {
          imageData: createTestImageData(10, 10, { r: 0, g: 255, b: 0, a: 255 }),
          blendMode: 'normal',
          opacity: 0, // Zero opacity
          visible: true,
        },
      ];

      const result = compositeMultipleLayers(layers, 10, 10);

      // Only red layer should be visible
      expect(result.data[0]).toBe(255);
      expect(result.data[1]).toBe(0);
    });

    it('returns transparent for no layers', () => {
      const result = compositeMultipleLayers([], 10, 10);

      expect(result.data[0]).toBe(0);
      expect(result.data[1]).toBe(0);
      expect(result.data[2]).toBe(0);
      expect(result.data[3]).toBe(0);
    });

    it('BLD-014: resizes layers to match output size', () => {
      const layers: CompositeLayer[] = [
        {
          imageData: createTestImageData(5, 5, { r: 255, g: 0, b: 0, a: 255 }),
          blendMode: 'normal',
          opacity: 1,
          visible: true,
        },
      ];

      // Request larger output
      const result = compositeMultipleLayers(layers, 10, 10);

      expect(result.width).toBe(10);
      expect(result.height).toBe(10);
      // Content should be resized (red color present)
      expect(result.data[0]).toBe(255);
    });

    it('applies blend modes correctly', () => {
      const layers: CompositeLayer[] = [
        {
          imageData: createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 }),
          blendMode: 'normal',
          opacity: 1,
          visible: true,
        },
        {
          imageData: createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 }),
          blendMode: 'multiply',
          opacity: 1,
          visible: true,
        },
      ];

      const result = compositeMultipleLayers(layers, 10, 10);

      // Multiply should darken
      expect(result.data[0]).toBeLessThan(128);
    });
  });
});
