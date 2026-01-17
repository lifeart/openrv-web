/**
 * LUT Loader Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  isLUT3D,
  parseCubeLUT,
  applyLUT3D,
} from './LUTLoader';
import { createSampleCubeLUT } from '../../test/utils';

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

    it('LUT-006: throws error without LUT_3D_SIZE', () => {
      const content = `TITLE "No Size"
0.0 0.0 0.0`;

      expect(() => parseCubeLUT(content)).toThrow('LUT_3D_SIZE not found');
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
});
