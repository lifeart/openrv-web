/**
 * OCIOConfigParser Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { parseOCIOConfig, validateOCIOConfig } from './OCIOConfigParser';

// Sample OCIO config text for testing
const SAMPLE_ACES_CONFIG = `
ocio_profile_version: 2

description: Custom ACES Config for Testing
name: custom_aces

roles:
  default: sRGB
  reference: ACES2065-1
  color_picking: sRGB
  data: Raw

displays:
  sRGB:
    - !<View> {name: ACES 1.0 SDR-video, colorspace: sRGB}
    - !<View> {name: Raw, colorspace: Raw}
  Rec.709:
    - !<View> {name: ACES 1.0 SDR-video, colorspace: Rec.709}
    - !<View> {name: Raw, colorspace: Raw}

colorspaces:
  - !<ColorSpace>
    name: ACES2065-1
    description: Academy Color Encoding Specification
    family: ACES
    encoding: scene-linear

  - !<ColorSpace>
    name: ACEScg
    description: ACES CG working space
    family: ACES
    encoding: scene-linear

  - !<ColorSpace>
    name: sRGB
    description: sRGB display space
    family: Display
    encoding: sdr-video

  - !<ColorSpace>
    name: Rec.709
    description: ITU-R BT.709
    family: Display
    encoding: sdr-video

  - !<ColorSpace>
    name: Raw
    description: Pass-through
    family: Utility
    encoding: data

looks:
  - !<Look>
    name: ACES 1.0
    description: ACES reference rendering

  - !<Look>
    name: Filmic
    description: Filmic contrast look
`;

const MINIMAL_CONFIG = `
ocio_profile_version: 1

colorspaces:
  - !<ColorSpace>
    name: sRGB
    description: sRGB
    family: Display
    encoding: sdr-video
`;

const SIMPLE_FORMAT_CONFIG = `
ocio_profile_version: 2
description: Simple format test

roles:
  default: sRGB
  reference: Linear
  color_picking: sRGB
  data: Raw

displays:
  sRGB:
    - Standard
    - Raw

colorspaces:
  - name: Linear
    description: Linear light
    family: Utility
    encoding: scene-linear

  - name: sRGB
    description: sRGB
    family: Display
    encoding: sdr-video

  - name: Raw
    description: Raw data
    family: Utility
    encoding: data

looks:
  - name: Filmic
    description: Filmic look
`;

describe('OCIOConfigParser', () => {
  // ===========================================================================
  // validateOCIOConfig
  // ===========================================================================

  describe('validateOCIOConfig', () => {
    it('OCIO-V2-001: validates a complete config successfully', () => {
      const result = validateOCIOConfig(SAMPLE_ACES_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('OCIO-V2-002: rejects empty string', () => {
      const result = validateOCIOConfig('');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('OCIO-V2-003: rejects whitespace-only string', () => {
      const result = validateOCIOConfig('   \n\n  \n  ');
      expect(result.valid).toBe(false);
    });

    it('OCIO-V2-004: rejects config without ocio_profile_version', () => {
      const result = validateOCIOConfig(`
colorspaces:
  - !<ColorSpace>
    name: sRGB
    description: sRGB
    family: Display
    encoding: sdr-video
`);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('ocio_profile_version'))).toBe(true);
    });

    it('OCIO-V2-005: rejects config without colorspaces section', () => {
      const result = validateOCIOConfig(`
ocio_profile_version: 2
roles:
  default: sRGB
`);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('colorspaces'))).toBe(true);
    });

    it('OCIO-V2-006: warns when displays section is missing', () => {
      const result = validateOCIOConfig(MINIMAL_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('displays'))).toBe(true);
    });

    it('OCIO-V2-007: warns when roles section is missing', () => {
      const result = validateOCIOConfig(MINIMAL_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('roles'))).toBe(true);
    });

    it('OCIO-V2-008: rejects null/undefined input', () => {
      const result = validateOCIOConfig(null as unknown as string);
      expect(result.valid).toBe(false);
    });
  });

  // ===========================================================================
  // parseOCIOConfig - Full Config
  // ===========================================================================

  describe('parseOCIOConfig - full config', () => {
    it('OCIO-V2-009: parses complete ACES config', () => {
      const config = parseOCIOConfig(SAMPLE_ACES_CONFIG);
      expect(config.name).toBe('custom_aces');
      expect(config.version).toBe('2');
      expect(config.description).toBe('Custom ACES Config for Testing');
    });

    it('OCIO-V2-010: parses color spaces correctly', () => {
      const config = parseOCIOConfig(SAMPLE_ACES_CONFIG);
      expect(config.colorSpaces.length).toBe(5);

      const acescg = config.colorSpaces.find((cs) => cs.name === 'ACEScg');
      expect(acescg).toBeDefined();
      expect(acescg?.encoding).toBe('scene-linear');
      expect(acescg?.family).toBe('ACES');
      expect(acescg?.isWorkingSpace).toBe(true);

      const srgb = config.colorSpaces.find((cs) => cs.name === 'sRGB');
      expect(srgb).toBeDefined();
      expect(srgb?.encoding).toBe('sdr-video');

      const raw = config.colorSpaces.find((cs) => cs.name === 'Raw');
      expect(raw).toBeDefined();
      expect(raw?.encoding).toBe('data');
    });

    it('OCIO-V2-011: parses displays correctly', () => {
      const config = parseOCIOConfig(SAMPLE_ACES_CONFIG);
      expect(config.displays.length).toBe(2);

      const srgbDisplay = config.displays.find((d) => d.name === 'sRGB');
      expect(srgbDisplay).toBeDefined();
      expect(srgbDisplay?.views).toContain('ACES 1.0 SDR-video');
      expect(srgbDisplay?.views).toContain('Raw');

      const rec709Display = config.displays.find((d) => d.name === 'Rec.709');
      expect(rec709Display).toBeDefined();
      expect(rec709Display?.views).toContain('ACES 1.0 SDR-video');
    });

    it('OCIO-V2-012: parses looks correctly', () => {
      const config = parseOCIOConfig(SAMPLE_ACES_CONFIG);
      // Should have None (auto-added) + ACES 1.0 + Filmic = 3
      expect(config.looks.length).toBe(3);
      expect(config.looks.some((l) => l.name === 'None')).toBe(true);
      expect(config.looks.some((l) => l.name === 'ACES 1.0')).toBe(true);
      expect(config.looks.some((l) => l.name === 'Filmic')).toBe(true);
    });

    it('OCIO-V2-013: parses roles correctly', () => {
      const config = parseOCIOConfig(SAMPLE_ACES_CONFIG);
      expect(config.roles.default).toBe('sRGB');
      expect(config.roles.reference).toBe('ACES2065-1');
      expect(config.roles.colorPicking).toBe('sRGB');
      expect(config.roles.data).toBe('Raw');
    });

    it('OCIO-V2-014: always includes None look', () => {
      const config = parseOCIOConfig(SAMPLE_ACES_CONFIG);
      expect(config.looks[0]?.name).toBe('None');
    });
  });

  // ===========================================================================
  // parseOCIOConfig - Minimal Config
  // ===========================================================================

  describe('parseOCIOConfig - minimal config', () => {
    it('OCIO-V2-015: parses minimal config with defaults', () => {
      const config = parseOCIOConfig(MINIMAL_CONFIG);
      expect(config.version).toBe('1');
      expect(config.colorSpaces.length).toBe(1);
      expect(config.colorSpaces[0]?.name).toBe('sRGB');
    });

    it('OCIO-V2-016: uses default roles when not specified', () => {
      const config = parseOCIOConfig(MINIMAL_CONFIG);
      expect(config.roles.default).toBe('sRGB');
      expect(config.roles.data).toBe('Raw');
    });

    it('OCIO-V2-017: allows overriding config name', () => {
      const config = parseOCIOConfig(MINIMAL_CONFIG, 'my_config');
      expect(config.name).toBe('my_config');
    });

    it('OCIO-V2-018: uses "custom" as fallback name', () => {
      const config = parseOCIOConfig(MINIMAL_CONFIG);
      expect(config.name).toBe('custom');
    });
  });

  // ===========================================================================
  // parseOCIOConfig - Simple Format
  // ===========================================================================

  describe('parseOCIOConfig - simple format', () => {
    it('OCIO-V2-019: parses simple display format (dash + name)', () => {
      const config = parseOCIOConfig(SIMPLE_FORMAT_CONFIG);
      const srgbDisplay = config.displays.find((d) => d.name === 'sRGB');
      expect(srgbDisplay).toBeDefined();
      expect(srgbDisplay?.views).toContain('Standard');
      expect(srgbDisplay?.views).toContain('Raw');
    });

    it('OCIO-V2-020: parses simple colorspace format (- name: value)', () => {
      const config = parseOCIOConfig(SIMPLE_FORMAT_CONFIG);
      expect(config.colorSpaces.length).toBe(3);
      expect(config.colorSpaces.some((cs) => cs.name === 'Linear')).toBe(true);
      expect(config.colorSpaces.some((cs) => cs.name === 'sRGB')).toBe(true);
      expect(config.colorSpaces.some((cs) => cs.name === 'Raw')).toBe(true);
    });

    it('OCIO-V2-021: parses simple look format (- name: value)', () => {
      const config = parseOCIOConfig(SIMPLE_FORMAT_CONFIG);
      expect(config.looks.some((l) => l.name === 'Filmic')).toBe(true);
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('parseOCIOConfig - error handling', () => {
    it('OCIO-V2-022: throws on empty string', () => {
      expect(() => parseOCIOConfig('')).toThrow('Invalid OCIO config');
    });

    it('OCIO-V2-023: throws when missing version', () => {
      expect(() =>
        parseOCIOConfig(`
colorspaces:
  - !<ColorSpace>
    name: sRGB
    description: sRGB
    family: Display
    encoding: sdr-video
`)
      ).toThrow();
    });

    it('OCIO-V2-024: throws when missing colorspaces', () => {
      expect(() =>
        parseOCIOConfig(`
ocio_profile_version: 2
roles:
  default: sRGB
`)
      ).toThrow();
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge cases', () => {
    it('OCIO-V2-025: handles comments in config', () => {
      const config = parseOCIOConfig(`
ocio_profile_version: 2
# This is a comment
description: Test with comments

colorspaces:
  # Color spaces section
  - !<ColorSpace>
    name: sRGB
    description: sRGB display
    family: Display
    encoding: sdr-video
`);
      expect(config.colorSpaces.length).toBe(1);
      expect(config.colorSpaces[0]?.name).toBe('sRGB');
    });

    it('OCIO-V2-026: handles quoted values', () => {
      const config = parseOCIOConfig(`
ocio_profile_version: 2
description: "Quoted description"

colorspaces:
  - !<ColorSpace>
    name: "Color Space With Spaces"
    description: 'Single quoted'
    family: Utility
    encoding: scene-linear
`);
      expect(config.description).toBe('Quoted description');
      expect(config.colorSpaces[0]?.name).toBe('Color Space With Spaces');
      expect(config.colorSpaces[0]?.description).toBe('Single quoted');
    });

    it('OCIO-V2-027: encoding normalization handles variants', () => {
      const config = parseOCIOConfig(`
ocio_profile_version: 2

colorspaces:
  - !<ColorSpace>
    name: Linear1
    description: Linear
    family: Utility
    encoding: scene_linear

  - !<ColorSpace>
    name: Linear2
    description: Linear
    family: Utility
    encoding: linear

  - !<ColorSpace>
    name: Log1
    description: Log
    family: Camera
    encoding: logarithmic

  - !<ColorSpace>
    name: Video1
    description: Video
    family: Display
    encoding: video

  - !<ColorSpace>
    name: Data1
    description: Data
    family: Utility
    encoding: raw
`);
      expect(config.colorSpaces.find((cs) => cs.name === 'Linear1')?.encoding).toBe('scene-linear');
      expect(config.colorSpaces.find((cs) => cs.name === 'Linear2')?.encoding).toBe('scene-linear');
      expect(config.colorSpaces.find((cs) => cs.name === 'Log1')?.encoding).toBe('log');
      expect(config.colorSpaces.find((cs) => cs.name === 'Video1')?.encoding).toBe('sdr-video');
      expect(config.colorSpaces.find((cs) => cs.name === 'Data1')?.encoding).toBe('data');
    });

    it('OCIO-V2-028: scene-linear spaces are marked as working spaces', () => {
      const config = parseOCIOConfig(SAMPLE_ACES_CONFIG);
      const linearSpaces = config.colorSpaces.filter((cs) => cs.encoding === 'scene-linear');
      for (const space of linearSpaces) {
        expect(space.isWorkingSpace).toBe(true);
      }
    });

    it('OCIO-V2-029: display family spaces are marked as display spaces', () => {
      const config = parseOCIOConfig(SAMPLE_ACES_CONFIG);
      const srgb = config.colorSpaces.find((cs) => cs.name === 'sRGB');
      expect(srgb?.isDisplaySpace).toBe(true);
    });

    it('OCIO-V2-030: handles config with isdata flag', () => {
      const config = parseOCIOConfig(`
ocio_profile_version: 2

colorspaces:
  - !<ColorSpace>
    name: Raw
    description: Raw data
    family: Utility
    isdata: true
    encoding: sdr-video
`);
      // isdata: true should override encoding to 'data'
      expect(config.colorSpaces[0]?.encoding).toBe('data');
    });

    it('OCIO-V2-031: handles multiple empty lines between sections', () => {
      const config = parseOCIOConfig(`
ocio_profile_version: 2


description: Spaced config


colorspaces:

  - !<ColorSpace>
    name: sRGB
    description: sRGB
    family: Display
    encoding: sdr-video


`);
      expect(config.colorSpaces.length).toBe(1);
    });

    it('OCIO-V2-032: handles config without looks section', () => {
      const config = parseOCIOConfig(MINIMAL_CONFIG);
      // Should still have at least 'None' look
      expect(config.looks.length).toBe(1);
      expect(config.looks[0]?.name).toBe('None');
    });

    it('OCIO-V2-033: handles config with empty displays section', () => {
      const config = parseOCIOConfig(`
ocio_profile_version: 2

displays:

colorspaces:
  - !<ColorSpace>
    name: sRGB
    description: sRGB
    family: Display
    encoding: sdr-video
`);
      expect(config.displays.length).toBe(0);
    });

    it('OCIO-V2-034: preserves order of color spaces', () => {
      const config = parseOCIOConfig(SAMPLE_ACES_CONFIG);
      expect(config.colorSpaces[0]?.name).toBe('ACES2065-1');
      expect(config.colorSpaces[1]?.name).toBe('ACEScg');
      expect(config.colorSpaces[2]?.name).toBe('sRGB');
    });

    it('OCIO-V2-035: preserves order of displays', () => {
      const config = parseOCIOConfig(SAMPLE_ACES_CONFIG);
      expect(config.displays[0]?.name).toBe('sRGB');
      expect(config.displays[1]?.name).toBe('Rec.709');
    });

    it('OCIO-V2-036: does not duplicate None look if already present', () => {
      const config = parseOCIOConfig(`
ocio_profile_version: 2

colorspaces:
  - !<ColorSpace>
    name: sRGB
    description: sRGB
    family: Display
    encoding: sdr-video

looks:
  - !<Look>
    name: None
    description: No look applied
`);
      const noneLooks = config.looks.filter((l) => l.name === 'None');
      expect(noneLooks.length).toBe(1);
    });
  });
});
