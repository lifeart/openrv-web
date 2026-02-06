/**
 * LUT Presets Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  LUT_PRESETS,
  generatePresetLUT,
  getPresets,
  getPresetsByCategory,
} from './LUTPresets';
import { isLUT3D } from './LUTLoader';

const LUT_SIZE = 17;
const TOTAL_ENTRIES = LUT_SIZE * LUT_SIZE * LUT_SIZE;
const EXPECTED_DATA_LENGTH = TOTAL_ENTRIES * 3;

describe('LUTPresets', () => {
  describe('generatePresetLUT', () => {
    it('LUTP-001: all presets generate valid LUT3D with correct size', () => {
      for (const preset of LUT_PRESETS) {
        const lut = generatePresetLUT(preset.id);
        expect(lut, `preset "${preset.id}" should not return null`).not.toBeNull();
        expect(lut!.size).toBe(LUT_SIZE);
        expect(isLUT3D(lut!)).toBe(true);
      }
    });

    it('LUTP-002: identity preset produces identity LUT (input == output)', () => {
      const lut = generatePresetLUT('identity');
      expect(lut).not.toBeNull();

      const size = lut!.size;
      const data = lut!.data;

      for (let b = 0; b < size; b++) {
        for (let g = 0; g < size; g++) {
          for (let r = 0; r < size; r++) {
            const idx = (b * size * size + g * size + r) * 3;
            const expectedR = r / (size - 1);
            const expectedG = g / (size - 1);
            const expectedB = b / (size - 1);

            expect(data[idx]).toBeCloseTo(expectedR, 10);
            expect(data[idx + 1]).toBeCloseTo(expectedG, 10);
            expect(data[idx + 2]).toBeCloseTo(expectedB, 10);
          }
        }
      }
    });

    it('LUTP-003: all preset transforms produce values in [0,1] range', () => {
      for (const preset of LUT_PRESETS) {
        const lut = generatePresetLUT(preset.id);
        expect(lut).not.toBeNull();

        const data = lut!.data;
        for (let i = 0; i < data.length; i++) {
          expect(data[i]).toBeGreaterThanOrEqual(0);
          expect(data[i]).toBeLessThanOrEqual(1);
        }
      }
    });

    it('LUTP-004: LUT data has correct length (17^3 * 3)', () => {
      for (const preset of LUT_PRESETS) {
        const lut = generatePresetLUT(preset.id);
        expect(lut).not.toBeNull();
        expect(lut!.data.length).toBe(EXPECTED_DATA_LENGTH);
      }
    });

    it('LUTP-005: returns null for unknown preset ID', () => {
      const lut = generatePresetLUT('nonexistent-preset');
      expect(lut).toBeNull();
    });

    it('LUTP-006: each non-identity preset produces distinct output from identity', () => {
      const identityLut = generatePresetLUT('identity');
      expect(identityLut).not.toBeNull();

      for (const preset of LUT_PRESETS) {
        if (preset.id === 'identity') continue;

        const lut = generatePresetLUT(preset.id);
        expect(lut).not.toBeNull();

        // Check that at least one value differs from identity
        let hasDifference = false;
        for (let i = 0; i < lut!.data.length; i++) {
          if (Math.abs(lut!.data[i]! - identityLut!.data[i]!) > 1e-6) {
            hasDifference = true;
            break;
          }
        }

        expect(hasDifference, `preset "${preset.id}" should differ from identity`).toBe(true);
      }
    });

    it('LUTP-007: generated LUT has correct domain and title', () => {
      for (const preset of LUT_PRESETS) {
        const lut = generatePresetLUT(preset.id);
        expect(lut).not.toBeNull();
        expect(lut!.domainMin).toEqual([0, 0, 0]);
        expect(lut!.domainMax).toEqual([1, 1, 1]);
        expect(lut!.title).toBe(preset.name);
      }
    });
  });

  describe('getPresets', () => {
    it('LUTP-008: returns all presets', () => {
      const presets = getPresets();
      expect(presets.length).toBe(LUT_PRESETS.length);
      expect(presets.length).toBe(10);
    });

    it('LUTP-009: returns a copy, not the original array', () => {
      const presets = getPresets();
      expect(presets).not.toBe(LUT_PRESETS);
      expect(presets).toEqual(LUT_PRESETS);
    });
  });

  describe('getPresetsByCategory', () => {
    it('LUTP-010: groups presets by category correctly', () => {
      const categories = getPresetsByCategory();

      expect(categories.has('Film')).toBe(true);
      expect(categories.has('Creative')).toBe(true);
      expect(categories.has('B&W')).toBe(true);
      expect(categories.has('Technical')).toBe(true);

      // Film: warm-film, cool-chrome, bleach-bypass
      expect(categories.get('Film')!.length).toBe(3);
      // Creative: cross-process, cinematic-teal-orange, vintage-fade
      expect(categories.get('Creative')!.length).toBe(3);
      // B&W: monochrome
      expect(categories.get('B&W')!.length).toBe(1);
      // Technical: high-contrast, low-contrast, identity
      expect(categories.get('Technical')!.length).toBe(3);
    });

    it('LUTP-011: total presets across all categories equals total preset count', () => {
      const categories = getPresetsByCategory();
      let total = 0;
      for (const [, presets] of categories) {
        total += presets.length;
      }
      expect(total).toBe(LUT_PRESETS.length);
    });
  });
});
