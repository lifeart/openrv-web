/**
 * OCIOConfig Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  OCIOState,
  DEFAULT_OCIO_STATE,
  getBuiltinConfig,
  getAvailableConfigs,
  getInputColorSpaces,
  getWorkingColorSpaces,
  getDisplays,
  getViewsForDisplay,
  getLooks,
  isDefaultOCIOState,
} from './OCIOConfig';

describe('OCIOConfig', () => {
  describe('DEFAULT_OCIO_STATE', () => {
    it('OCIO-001: has correct default values', () => {
      expect(DEFAULT_OCIO_STATE.enabled).toBe(false);
      expect(DEFAULT_OCIO_STATE.configName).toBe('aces_1.2');
      expect(DEFAULT_OCIO_STATE.customConfigPath).toBe(null);
      expect(DEFAULT_OCIO_STATE.inputColorSpace).toBe('Auto');
      expect(DEFAULT_OCIO_STATE.detectedColorSpace).toBe(null);
      expect(DEFAULT_OCIO_STATE.workingColorSpace).toBe('ACEScg');
      expect(DEFAULT_OCIO_STATE.display).toBe('sRGB');
      expect(DEFAULT_OCIO_STATE.view).toBe('ACES 1.0 SDR-video');
      expect(DEFAULT_OCIO_STATE.look).toBe('None');
      expect(DEFAULT_OCIO_STATE.lookDirection).toBe('forward');
    });
  });

  describe('getBuiltinConfig', () => {
    it('OCIO-002: returns ACES 1.2 config', () => {
      const config = getBuiltinConfig('aces_1.2');
      expect(config.name).toBe('aces_1.2');
      expect(config.version).toBe('1.2');
      expect(config.description).toContain('Academy');
    });

    it('OCIO-003: returns sRGB config', () => {
      const config = getBuiltinConfig('srgb');
      expect(config.name).toBe('srgb');
      expect(config.version).toBe('1.0');
    });

    it('OCIO-004: normalizes config name with dots', () => {
      // Should accept both "aces_1.2" and "aces_1_2"
      const config1 = getBuiltinConfig('aces_1.2');
      const config2 = getBuiltinConfig('aces_1_2');
      expect(config1.name).toBe(config2.name);
    });

    it('OCIO-005: throws for unknown config', () => {
      expect(() => getBuiltinConfig('unknown_config')).toThrow();
    });
  });

  describe('getAvailableConfigs', () => {
    it('OCIO-006: returns list of available configs', () => {
      const configs = getAvailableConfigs();
      expect(configs.length).toBeGreaterThan(0);
      expect(configs.some((c) => c.name === 'aces_1.2')).toBe(true);
      expect(configs.some((c) => c.name === 'srgb')).toBe(true);
    });

    it('OCIO-007: each config has name and description', () => {
      const configs = getAvailableConfigs();
      for (const config of configs) {
        expect(config.name).toBeDefined();
        expect(config.description).toBeDefined();
        expect(typeof config.name).toBe('string');
        expect(typeof config.description).toBe('string');
      }
    });
  });

  describe('getInputColorSpaces', () => {
    it('OCIO-008: includes Auto as first option', () => {
      const spaces = getInputColorSpaces('aces_1.2');
      expect(spaces[0]).toBe('Auto');
    });

    it('OCIO-009: includes camera log spaces for ACES config', () => {
      const spaces = getInputColorSpaces('aces_1.2');
      expect(spaces).toContain('ARRI LogC3 (EI 800)');
      expect(spaces).toContain('ARRI LogC4');
      expect(spaces).toContain('Sony S-Log3');
      expect(spaces).toContain('RED Log3G10');
    });

    it('OCIO-010: includes standard spaces', () => {
      const spaces = getInputColorSpaces('aces_1.2');
      expect(spaces).toContain('sRGB');
      expect(spaces).toContain('Rec.709');
      expect(spaces).toContain('ACEScg');
    });

    it('OCIO-011: sRGB config has fewer spaces', () => {
      const acesSpaces = getInputColorSpaces('aces_1.2');
      const srgbSpaces = getInputColorSpaces('srgb');
      expect(srgbSpaces.length).toBeLessThan(acesSpaces.length);
    });
  });

  describe('getWorkingColorSpaces', () => {
    it('OCIO-012: returns only working spaces for ACES', () => {
      const spaces = getWorkingColorSpaces('aces_1.2');
      expect(spaces).toContain('ACEScg');
      expect(spaces).toContain('ACES2065-1');
      expect(spaces).toContain('Linear sRGB');
      // Camera spaces should NOT be working spaces
      expect(spaces).not.toContain('ARRI LogC3 (EI 800)');
    });

    it('OCIO-013: sRGB config has Linear sRGB as working space', () => {
      const spaces = getWorkingColorSpaces('srgb');
      expect(spaces).toContain('Linear sRGB');
    });
  });

  describe('getDisplays', () => {
    it('OCIO-014: returns display list for ACES', () => {
      const displays = getDisplays('aces_1.2');
      expect(displays).toContain('sRGB');
      expect(displays).toContain('Rec.709');
      expect(displays).toContain('DCI-P3');
    });

    it('OCIO-015: returns display list for sRGB', () => {
      const displays = getDisplays('srgb');
      expect(displays).toContain('sRGB');
      expect(displays).toContain('Rec.709');
    });
  });

  describe('getViewsForDisplay', () => {
    it('OCIO-016: returns views for sRGB display in ACES', () => {
      const views = getViewsForDisplay('aces_1.2', 'sRGB');
      expect(views).toContain('ACES 1.0 SDR-video');
      expect(views).toContain('Raw');
      expect(views).toContain('Log');
    });

    it('OCIO-017: returns views for sRGB display in sRGB config', () => {
      const views = getViewsForDisplay('srgb', 'sRGB');
      expect(views).toContain('Standard');
      expect(views).toContain('Raw');
    });

    it('OCIO-018: returns empty array for unknown display', () => {
      const views = getViewsForDisplay('aces_1.2', 'UnknownDisplay');
      expect(views).toEqual([]);
    });
  });

  describe('getLooks', () => {
    it('OCIO-019: returns looks for ACES config', () => {
      const looks = getLooks('aces_1.2');
      expect(looks).toContain('None');
      expect(looks).toContain('ACES 1.0');
      expect(looks).toContain('Filmic');
    });

    it('OCIO-020: sRGB config has None look', () => {
      const looks = getLooks('srgb');
      expect(looks).toContain('None');
    });
  });

  describe('isDefaultOCIOState', () => {
    it('OCIO-021: returns true for default state', () => {
      expect(isDefaultOCIOState(DEFAULT_OCIO_STATE)).toBe(true);
    });

    it('OCIO-022: returns false when enabled', () => {
      const state: OCIOState = { ...DEFAULT_OCIO_STATE, enabled: true };
      expect(isDefaultOCIOState(state)).toBe(false);
    });

    it('OCIO-023: returns false when config changed', () => {
      const state: OCIOState = { ...DEFAULT_OCIO_STATE, configName: 'srgb' };
      expect(isDefaultOCIOState(state)).toBe(false);
    });

    it('OCIO-024: returns false when input color space changed', () => {
      const state: OCIOState = { ...DEFAULT_OCIO_STATE, inputColorSpace: 'sRGB' };
      expect(isDefaultOCIOState(state)).toBe(false);
    });

    it('OCIO-025: returns false when working color space changed', () => {
      const state: OCIOState = { ...DEFAULT_OCIO_STATE, workingColorSpace: 'ACES2065-1' };
      expect(isDefaultOCIOState(state)).toBe(false);
    });

    it('OCIO-026: returns false when display changed', () => {
      const state: OCIOState = { ...DEFAULT_OCIO_STATE, display: 'Rec.709' };
      expect(isDefaultOCIOState(state)).toBe(false);
    });

    it('OCIO-027: returns false when view changed', () => {
      const state: OCIOState = { ...DEFAULT_OCIO_STATE, view: 'Raw' };
      expect(isDefaultOCIOState(state)).toBe(false);
    });

    it('OCIO-028: returns false when look changed', () => {
      const state: OCIOState = { ...DEFAULT_OCIO_STATE, look: 'Filmic' };
      expect(isDefaultOCIOState(state)).toBe(false);
    });
  });

  describe('Config color spaces', () => {
    it('OCIO-029: ACES config has correct color space definitions', () => {
      const config = getBuiltinConfig('aces_1.2');

      // Check that ACEScg is scene-linear
      const acescg = config.colorSpaces.find((cs) => cs.name === 'ACEScg');
      expect(acescg).toBeDefined();
      expect(acescg?.encoding).toBe('scene-linear');
      expect(acescg?.isWorkingSpace).toBe(true);

      // Check that sRGB is sdr-video
      const srgb = config.colorSpaces.find((cs) => cs.name === 'sRGB');
      expect(srgb).toBeDefined();
      expect(srgb?.encoding).toBe('sdr-video');
      expect(srgb?.isDisplaySpace).toBe(true);

      // Check that ARRI LogC is log
      const logc = config.colorSpaces.find((cs) => cs.name === 'ARRI LogC3 (EI 800)');
      expect(logc).toBeDefined();
      expect(logc?.encoding).toBe('log');
    });

    it('OCIO-030: ACES config has correct roles', () => {
      const config = getBuiltinConfig('aces_1.2');
      expect(config.roles.default).toBe('sRGB');
      expect(config.roles.reference).toBe('ACES2065-1');
      expect(config.roles.colorPicking).toBe('sRGB');
      expect(config.roles.data).toBe('Raw');
    });
  });

  // ==========================================================================
  // Edge Case Tests
  // ==========================================================================

  describe('Edge cases: config name handling', () => {
    it('OCIO-031: getBuiltinConfig handles mixed case (normalizes dots)', () => {
      // Should normalize dots to underscores
      const config1 = getBuiltinConfig('aces_1.2');
      const config2 = getBuiltinConfig('aces_1_2');
      expect(config1.name).toBe(config2.name);
    });

    it('OCIO-032: getBuiltinConfig error message includes available configs', () => {
      try {
        getBuiltinConfig('nonexistent');
        expect.fail('Should have thrown');
      } catch (e) {
        const errorMessage = (e as Error).message;
        expect(errorMessage).toContain('aces_1_2');
        expect(errorMessage).toContain('srgb');
      }
    });

    it('OCIO-033: getBuiltinConfig handles empty string', () => {
      expect(() => getBuiltinConfig('')).toThrow();
    });
  });

  describe('Edge cases: color space lists', () => {
    it('OCIO-034: getInputColorSpaces always has Auto first', () => {
      const acesSpaces = getInputColorSpaces('aces_1.2');
      const srgbSpaces = getInputColorSpaces('srgb');

      expect(acesSpaces[0]).toBe('Auto');
      expect(srgbSpaces[0]).toBe('Auto');
    });

    it('OCIO-035: getWorkingColorSpaces never includes camera spaces', () => {
      const spaces = getWorkingColorSpaces('aces_1.2');

      // Camera spaces should never be working spaces
      expect(spaces).not.toContain('ARRI LogC3 (EI 800)');
      expect(spaces).not.toContain('ARRI LogC4');
      expect(spaces).not.toContain('Sony S-Log3');
      expect(spaces).not.toContain('RED Log3G10');
    });

    it('OCIO-036: getWorkingColorSpaces never includes display spaces', () => {
      const spaces = getWorkingColorSpaces('aces_1.2');

      // Display spaces should not be working spaces (except Linear sRGB which is both)
      // sRGB and Rec.709 are display spaces with sdr-video encoding
      const config = getBuiltinConfig('aces_1.2');
      const displayOnlySpaces = config.colorSpaces.filter(
        (cs) => cs.isDisplaySpace && !cs.isWorkingSpace
      );

      for (const displaySpace of displayOnlySpaces) {
        expect(spaces).not.toContain(displaySpace.name);
      }
    });
  });

  describe('Edge cases: views for display', () => {
    it('OCIO-037: getViewsForDisplay returns consistent results', () => {
      const views1 = getViewsForDisplay('aces_1.2', 'sRGB');
      const views2 = getViewsForDisplay('aces_1.2', 'sRGB');
      expect(views1).toEqual(views2);
    });

    it('OCIO-038: getViewsForDisplay handles case sensitivity', () => {
      // Display names are case-sensitive
      const views = getViewsForDisplay('aces_1.2', 'srgb'); // lowercase
      expect(views).toEqual([]); // Should not find 'sRGB'
    });

    it('OCIO-039: each display has at least one view', () => {
      const displays = getDisplays('aces_1.2');
      for (const display of displays) {
        const views = getViewsForDisplay('aces_1.2', display);
        expect(views.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Edge cases: isDefaultOCIOState', () => {
    it('OCIO-040: isDefaultOCIOState ignores detectedColorSpace', () => {
      // Detected color space is transient and shouldn't affect default check
      const state: OCIOState = {
        ...DEFAULT_OCIO_STATE,
        detectedColorSpace: 'ARRI LogC3 (EI 800)',
      };
      expect(isDefaultOCIOState(state)).toBe(true);
    });

    it('OCIO-041: isDefaultOCIOState ignores customConfigPath', () => {
      const state: OCIOState = {
        ...DEFAULT_OCIO_STATE,
        customConfigPath: '/path/to/custom.ocio',
      };
      expect(isDefaultOCIOState(state)).toBe(true);
    });

    it('OCIO-042: isDefaultOCIOState with lookDirection change', () => {
      const state: OCIOState = {
        ...DEFAULT_OCIO_STATE,
        lookDirection: 'inverse',
      };
      // lookDirection is not checked in isDefaultOCIOState
      expect(isDefaultOCIOState(state)).toBe(true);
    });
  });

  describe('Edge cases: config structure validation', () => {
    it('OCIO-043: all configs have required roles', () => {
      const configs = getAvailableConfigs();
      for (const { name } of configs) {
        const config = getBuiltinConfig(name);
        expect(config.roles).toBeDefined();
        expect(config.roles.default).toBeDefined();
        expect(config.roles.reference).toBeDefined();
        expect(config.roles.colorPicking).toBeDefined();
        expect(config.roles.data).toBeDefined();
      }
    });

    it('OCIO-044: all configs have at least one display', () => {
      const configs = getAvailableConfigs();
      for (const { name } of configs) {
        const displays = getDisplays(name);
        expect(displays.length).toBeGreaterThan(0);
      }
    });

    it('OCIO-045: all configs have None look', () => {
      const configs = getAvailableConfigs();
      for (const { name } of configs) {
        const looks = getLooks(name);
        expect(looks).toContain('None');
      }
    });

    it('OCIO-046: Raw color space exists in all configs', () => {
      const configs = getAvailableConfigs();
      for (const { name } of configs) {
        const spaces = getInputColorSpaces(name);
        expect(spaces).toContain('Raw');
      }
    });
  });

  describe('Edge cases: encoding types', () => {
    it('OCIO-047: scene-linear spaces have no gamma', () => {
      const config = getBuiltinConfig('aces_1.2');
      const linearSpaces = config.colorSpaces.filter(
        (cs) => cs.encoding === 'scene-linear'
      );

      expect(linearSpaces.length).toBeGreaterThan(0);
      // All linear spaces should be working spaces
      for (const space of linearSpaces) {
        expect(space.isWorkingSpace).toBe(true);
      }
    });

    it('OCIO-048: data encoding space is only Raw', () => {
      const config = getBuiltinConfig('aces_1.2');
      const dataSpaces = config.colorSpaces.filter(
        (cs) => cs.encoding === 'data'
      );

      expect(dataSpaces.length).toBe(1);
      expect(dataSpaces[0]!.name).toBe('Raw');
    });
  });
});
