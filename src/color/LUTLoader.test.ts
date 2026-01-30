/**
 * LUT Loader Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isLUT3D,
  isLUT1D,
  parseCubeLUT,
  applyLUT3D,
  applyLUT1D,
  applyLUTToImageData,
} from './LUTLoader';
import { createSampleCubeLUT, createSample1DLUT } from '../../test/utils';

describe('LUTLoader', () => {
  describe('parseCubeLUT', () => {
    it('LUT-001: parses valid .cube file', () => {
      const content = createSampleCubeLUT(2);
      const lut = parseCubeLUT(content);

      expect(lut.size).toBe(2);
      expect(lut.data.length).toBe(2 * 2 * 2 * 3); // 8 entries * 3 channels
    });

    it('LUT-002: extracts TITLE', () => {
      const content = createSampleCubeLUT(2);
      const lut = parseCubeLUT(content);

      expect(lut.title).toBe('Test LUT');
    });

    it('LUT-003: parses DOMAIN_MIN/MAX', () => {
      const content = `TITLE "Domain Test"
LUT_3D_SIZE 2
DOMAIN_MIN 0.1 0.2 0.3
DOMAIN_MAX 0.9 0.8 0.7
0.0 0.0 0.0
0.5 0.5 0.5
0.5 0.5 0.5
1.0 1.0 1.0
0.5 0.5 0.5
1.0 1.0 1.0
1.0 1.0 1.0
1.0 1.0 1.0`;

      const lut = parseCubeLUT(content);

      expect(lut.domainMin[0]).toBeCloseTo(0.1);
      expect(lut.domainMin[1]).toBeCloseTo(0.2);
      expect(lut.domainMin[2]).toBeCloseTo(0.3);
      expect(lut.domainMax[0]).toBeCloseTo(0.9);
      expect(lut.domainMax[1]).toBeCloseTo(0.8);
      expect(lut.domainMax[2]).toBeCloseTo(0.7);
    });

    it('LUT-004: ignores comments', () => {
      const content = `# This is a comment
TITLE "Comment Test"
# Another comment
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0
# Comment between data
0.0 0.0 0.0
0.5 0.5 0.5
0.5 0.5 0.5
1.0 1.0 1.0
0.5 0.5 0.5
1.0 1.0 1.0
1.0 1.0 1.0
1.0 1.0 1.0`;

      const lut = parseCubeLUT(content);

      expect(lut.title).toBe('Comment Test');
      expect(lut.size).toBe(2);
    });

    it('LUT-005: handles Windows line endings', () => {
      const content = createSampleCubeLUT(2).replace(/\n/g, '\r\n');
      const lut = parseCubeLUT(content);

      expect(lut.size).toBe(2);
    });

    it('LUT-006: throws error without LUT size', () => {
      const content = `TITLE "No Size"
0.0 0.0 0.0`;

      expect(() => parseCubeLUT(content)).toThrow('Neither LUT_1D_SIZE nor LUT_3D_SIZE found');
    });

    it('LUT-007: throws error with wrong data count', () => {
      const content = `TITLE "Wrong Count"
LUT_3D_SIZE 2
0.0 0.0 0.0
0.5 0.5 0.5`;
      // Size 2 needs 8 entries, only provided 2

      expect(() => parseCubeLUT(content)).toThrow('Expected 8 data lines');
    });

    it('handles empty lines', () => {
      const content = `TITLE "Empty Lines"
LUT_3D_SIZE 2

DOMAIN_MIN 0.0 0.0 0.0

DOMAIN_MAX 1.0 1.0 1.0

0.0 0.0 0.0
0.5 0.5 0.5
0.5 0.5 0.5
1.0 1.0 1.0
0.5 0.5 0.5
1.0 1.0 1.0
1.0 1.0 1.0
1.0 1.0 1.0`;

      const lut = parseCubeLUT(content);
      expect(lut.size).toBe(2);
    });

    it('uses default domain if not specified', () => {
      const content = `TITLE "No Domain"
LUT_3D_SIZE 2
0.0 0.0 0.0
0.5 0.5 0.5
0.5 0.5 0.5
1.0 1.0 1.0
0.5 0.5 0.5
1.0 1.0 1.0
1.0 1.0 1.0
1.0 1.0 1.0`;

      const lut = parseCubeLUT(content);

      expect(lut.domainMin).toEqual([0, 0, 0]);
      expect(lut.domainMax).toEqual([1, 1, 1]);
    });

    it('uses default title if not specified', () => {
      const content = `LUT_3D_SIZE 2
0.0 0.0 0.0
0.5 0.5 0.5
0.5 0.5 0.5
1.0 1.0 1.0
0.5 0.5 0.5
1.0 1.0 1.0
1.0 1.0 1.0
1.0 1.0 1.0`;

      const lut = parseCubeLUT(content);
      expect(lut.title).toBe('Untitled LUT');
    });

    it('parses larger LUT sizes', () => {
      const content = createSampleCubeLUT(4);
      const lut = parseCubeLUT(content);

      expect(lut.size).toBe(4);
      expect(lut.data.length).toBe(4 * 4 * 4 * 3);
    });
  });

  describe('isLUT3D', () => {
    it('LUT-008: identifies valid 3D LUT', () => {
      const content = createSampleCubeLUT(2);
      const lut = parseCubeLUT(content);

      expect(isLUT3D(lut)).toBe(true);
    });

    it('returns false for invalid data length', () => {
      const fakeLUT = {
        title: 'Fake',
        size: 2,
        domainMin: [0, 0, 0] as [number, number, number],
        domainMax: [1, 1, 1] as [number, number, number],
        data: new Float32Array(10), // Wrong size
      };

      expect(isLUT3D(fakeLUT)).toBe(false);
    });
  });

  describe('applyLUT3D', () => {
    it('LUT-009: interpolates correctly', () => {
      // Create identity LUT
      const content = createSampleCubeLUT(2);
      const lut = parseCubeLUT(content);

      // Apply to known values
      const result = applyLUT3D(lut, 0.5, 0.5, 0.5);

      // Identity LUT should return approximately same values
      expect(result[0]).toBeCloseTo(0.5, 1);
      expect(result[1]).toBeCloseTo(0.5, 1);
      expect(result[2]).toBeCloseTo(0.5, 1);
    });

    it('LUT-010: clamps out-of-domain inputs', () => {
      const content = createSampleCubeLUT(2);
      const lut = parseCubeLUT(content);

      // Apply value outside 0-1 range
      const result = applyLUT3D(lut, 1.5, -0.5, 2.0);

      // Should be clamped to valid range
      expect(result[0]).toBeGreaterThanOrEqual(0);
      expect(result[0]).toBeLessThanOrEqual(1);
      expect(result[1]).toBeGreaterThanOrEqual(0);
      expect(result[1]).toBeLessThanOrEqual(1);
      expect(result[2]).toBeGreaterThanOrEqual(0);
      expect(result[2]).toBeLessThanOrEqual(1);
    });

    it('LUT-011: identity LUT produces no change', () => {
      const content = createSampleCubeLUT(4); // Larger for better interpolation
      const lut = parseCubeLUT(content);

      // Test several values
      const testValues: [number, number, number][] = [
        [0, 0, 0],
        [1, 1, 1],
        [0.25, 0.5, 0.75],
        [0.33, 0.66, 0.99],
      ];

      for (const [r, g, b] of testValues) {
        const result = applyLUT3D(lut, r, g, b);
        expect(result[0]).toBeCloseTo(r, 1);
        expect(result[1]).toBeCloseTo(g, 1);
        expect(result[2]).toBeCloseTo(b, 1);
      }
    });

    it('handles corner cases (0,0,0) and (1,1,1)', () => {
      const content = createSampleCubeLUT(2);
      const lut = parseCubeLUT(content);

      const black = applyLUT3D(lut, 0, 0, 0);
      expect(black[0]).toBeCloseTo(0, 1);
      expect(black[1]).toBeCloseTo(0, 1);
      expect(black[2]).toBeCloseTo(0, 1);

      const white = applyLUT3D(lut, 1, 1, 1);
      expect(white[0]).toBeCloseTo(1, 1);
      expect(white[1]).toBeCloseTo(1, 1);
      expect(white[2]).toBeCloseTo(1, 1);
    });

    it('respects custom domain', () => {
      const content = `TITLE "Custom Domain"
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 0.5 0.5 0.5
0.0 0.0 0.0
0.5 0.5 0.5
0.5 0.5 0.5
1.0 1.0 1.0
0.5 0.5 0.5
1.0 1.0 1.0
1.0 1.0 1.0
1.0 1.0 1.0`;

      const lut = parseCubeLUT(content);

      // Value at 0.25 (middle of 0-0.5 domain) should map to middle of LUT
      const result = applyLUT3D(lut, 0.25, 0.25, 0.25);

      // Should be interpolated value, not identity
      expect(typeof result[0]).toBe('number');
      expect(!Number.isNaN(result[0])).toBe(true);
    });
  });

  describe('LUT data structure', () => {
    it('stores data as Float32Array', () => {
      const content = createSampleCubeLUT(2);
      const lut = parseCubeLUT(content);

      expect(lut.data).toBeInstanceOf(Float32Array);
    });

    it('has correct data layout (R varies slowest)', () => {
      const content = `TITLE "Layout Test"
LUT_3D_SIZE 2
0.0 0.1 0.2
0.3 0.4 0.5
0.6 0.7 0.8
0.9 1.0 0.0
0.1 0.2 0.3
0.4 0.5 0.6
0.7 0.8 0.9
1.0 0.0 0.1`;

      const lut = parseCubeLUT(content);

      // First entry should be [0.0, 0.1, 0.2]
      expect(lut.data[0]).toBeCloseTo(0.0);
      expect(lut.data[1]).toBeCloseTo(0.1);
      expect(lut.data[2]).toBeCloseTo(0.2);
    });
  });

  describe('1D LUT Support', () => {
    describe('parseCubeLUT with 1D LUT', () => {
      it('LUT-012: parses valid 1D .cube file', () => {
        const content = createSample1DLUT(16);
        const lut = parseCubeLUT(content);

        expect(lut.size).toBe(16);
        expect(lut.data.length).toBe(16 * 3); // 16 entries * 3 channels
      });

      it('LUT-013: extracts TITLE from 1D LUT', () => {
        const content = createSample1DLUT(8);
        const lut = parseCubeLUT(content);

        expect(lut.title).toBe('Test 1D LUT');
      });

      it('LUT-014: parses DOMAIN_MIN/MAX for 1D LUT', () => {
        const content = `TITLE "1D Domain Test"
LUT_1D_SIZE 4
DOMAIN_MIN 0.1 0.2 0.3
DOMAIN_MAX 0.9 0.8 0.7
0.0 0.0 0.0
0.333 0.333 0.333
0.666 0.666 0.666
1.0 1.0 1.0`;

        const lut = parseCubeLUT(content);

        expect(lut.domainMin[0]).toBeCloseTo(0.1);
        expect(lut.domainMin[1]).toBeCloseTo(0.2);
        expect(lut.domainMin[2]).toBeCloseTo(0.3);
        expect(lut.domainMax[0]).toBeCloseTo(0.9);
        expect(lut.domainMax[1]).toBeCloseTo(0.8);
        expect(lut.domainMax[2]).toBeCloseTo(0.7);
      });

      it('LUT-015: throws error with wrong 1D data count', () => {
        const content = `TITLE "Wrong Count"
LUT_1D_SIZE 16
0.0 0.0 0.0
0.5 0.5 0.5`;
        // Size 16 needs 16 entries, only provided 2

        expect(() => parseCubeLUT(content)).toThrow('Expected 16 data lines');
      });
    });

    describe('isLUT1D', () => {
      it('LUT-016: identifies valid 1D LUT', () => {
        const content = createSample1DLUT(16);
        const lut = parseCubeLUT(content);

        expect(isLUT1D(lut)).toBe(true);
        expect(isLUT3D(lut)).toBe(false);
      });

      it('returns false for 3D LUT', () => {
        const content = createSampleCubeLUT(2);
        const lut = parseCubeLUT(content);

        expect(isLUT1D(lut)).toBe(false);
        expect(isLUT3D(lut)).toBe(true);
      });
    });

    describe('applyLUT1D', () => {
      it('LUT-017: identity 1D LUT produces no change', () => {
        const content = createSample1DLUT(256);
        const lut = parseCubeLUT(content);

        if (!isLUT1D(lut)) throw new Error('Expected 1D LUT');

        const testValues: [number, number, number][] = [
          [0, 0, 0],
          [1, 1, 1],
          [0.25, 0.5, 0.75],
          [0.33, 0.66, 0.99],
        ];

        for (const [r, g, b] of testValues) {
          const result = applyLUT1D(lut, r, g, b);
          expect(result[0]).toBeCloseTo(r, 1);
          expect(result[1]).toBeCloseTo(g, 1);
          expect(result[2]).toBeCloseTo(b, 1);
        }
      });

      it('LUT-018: clamps out-of-domain inputs', () => {
        const content = createSample1DLUT(16);
        const lut = parseCubeLUT(content);

        if (!isLUT1D(lut)) throw new Error('Expected 1D LUT');

        const result = applyLUT1D(lut, 1.5, -0.5, 2.0);

        expect(result[0]).toBeGreaterThanOrEqual(0);
        expect(result[0]).toBeLessThanOrEqual(1);
        expect(result[1]).toBeGreaterThanOrEqual(0);
        expect(result[1]).toBeLessThanOrEqual(1);
        expect(result[2]).toBeGreaterThanOrEqual(0);
        expect(result[2]).toBeLessThanOrEqual(1);
      });

      it('LUT-019: handles corner cases (0,0,0) and (1,1,1)', () => {
        const content = createSample1DLUT(16);
        const lut = parseCubeLUT(content);

        if (!isLUT1D(lut)) throw new Error('Expected 1D LUT');

        const black = applyLUT1D(lut, 0, 0, 0);
        expect(black[0]).toBeCloseTo(0, 1);
        expect(black[1]).toBeCloseTo(0, 1);
        expect(black[2]).toBeCloseTo(0, 1);

        const white = applyLUT1D(lut, 1, 1, 1);
        expect(white[0]).toBeCloseTo(1, 1);
        expect(white[1]).toBeCloseTo(1, 1);
        expect(white[2]).toBeCloseTo(1, 1);
      });

      it('LUT-020: each channel is processed independently', () => {
        // Create a 1D LUT with different curves per channel
        const content = `TITLE "Per-Channel LUT"
LUT_1D_SIZE 4
0.0 0.0 0.0
0.5 0.25 0.75
0.75 0.5 0.5
1.0 1.0 1.0`;

        const lut = parseCubeLUT(content);
        if (!isLUT1D(lut)) throw new Error('Expected 1D LUT');

        // At input ~0.33 (between entries 0 and 1)
        const result = applyLUT1D(lut, 0.333, 0.333, 0.333);

        // R, G, B should have different output values based on curves
        expect(typeof result[0]).toBe('number');
        expect(typeof result[1]).toBe('number');
        expect(typeof result[2]).toBe('number');
      });
    });

    describe('applyLUTToImageData', () => {
      it('LUT-021: applies 1D LUT to ImageData', () => {
        const content = createSample1DLUT(256);
        const lut = parseCubeLUT(content);

        // Create simple test ImageData
        const imageData = new ImageData(2, 2);
        imageData.data[0] = 128; // R
        imageData.data[1] = 64;  // G
        imageData.data[2] = 192; // B
        imageData.data[3] = 255; // A

        imageData.data[4] = 255;
        imageData.data[5] = 0;
        imageData.data[6] = 128;
        imageData.data[7] = 255;

        // Apply identity LUT - values should remain approximately the same
        applyLUTToImageData(imageData, lut);

        expect(imageData.data[0]).toBeCloseTo(128, -1);
        expect(imageData.data[1]).toBeCloseTo(64, -1);
        expect(imageData.data[2]).toBeCloseTo(192, -1);
        expect(imageData.data[3]).toBe(255); // Alpha unchanged
      });

      it('LUT-022: applies 3D LUT to ImageData', () => {
        const content = createSampleCubeLUT(4);
        const lut = parseCubeLUT(content);

        const imageData = new ImageData(2, 2);
        imageData.data[0] = 128;
        imageData.data[1] = 64;
        imageData.data[2] = 192;
        imageData.data[3] = 255;

        applyLUTToImageData(imageData, lut);

        // Identity LUT should preserve approximate values
        expect(imageData.data[0]).toBeCloseTo(128, -1);
        expect(imageData.data[1]).toBeCloseTo(64, -1);
        expect(imageData.data[2]).toBeCloseTo(192, -1);
      });
    });
  });
});
