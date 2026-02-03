/**
 * LUT Format Detection Tests
 */

import { describe, it, expect } from 'vitest';
import { detectLUTFormat, parseLUT } from './LUTFormatDetect';

describe('LUTFormatDetect', () => {
  describe('detectLUTFormat', () => {
    it('LUTD-001: returns cube for .cube extension', () => {
      expect(detectLUTFormat('my_lut.cube')).toBe('cube');
    });

    it('LUTD-002: returns 3dl for .3dl extension', () => {
      expect(detectLUTFormat('my_lut.3dl')).toBe('3dl');
    });

    it('LUTD-003: returns csp for .csp extension', () => {
      expect(detectLUTFormat('my_lut.csp')).toBe('csp');
    });

    it('LUTD-004: returns itx for .itx extension', () => {
      expect(detectLUTFormat('my_lut.itx')).toBe('itx');
    });

    it('LUTD-005: returns look for .look extension', () => {
      expect(detectLUTFormat('my_lut.look')).toBe('look');
    });

    it('LUTD-006: returns houdini_lut for .lut extension', () => {
      expect(detectLUTFormat('my_lut.lut')).toBe('houdini_lut');
    });

    it('LUTD-007: returns nuke_nk for .nk extension', () => {
      expect(detectLUTFormat('my_lut.nk')).toBe('nuke_nk');
    });

    it('LUTD-008: returns mga for .mga extension', () => {
      expect(detectLUTFormat('my_lut.mga')).toBe('mga');
    });

    it('LUTD-009: returns null for unknown extension without content', () => {
      expect(detectLUTFormat('my_lut.xyz')).toBeNull();
    });

    it('LUTD-010: sniffs csp from CSPLUTV100 magic header', () => {
      expect(detectLUTFormat('unknown', 'CSPLUTV100\n3D\n')).toBe('csp');
    });

    it('LUTD-011: sniffs mga from MGA magic header', () => {
      expect(detectLUTFormat('unknown', 'MGA\nLUT_TYPE 3D\n')).toBe('mga');
    });

    it('LUTD-012: sniffs rv3d from RV3DLUT magic header', () => {
      expect(detectLUTFormat('unknown', 'RV3DLUT\nsize 32\n')).toBe('rv3d');
    });

    it('LUTD-013: sniffs rv_channel from RVCHANNELLUT magic header', () => {
      expect(detectLUTFormat('unknown', 'RVCHANNELLUT\nsize 1024\n')).toBe('rv_channel');
    });

    it('LUTD-014: sniffs nuke_nk from Vectorfield content', () => {
      expect(detectLUTFormat('unknown', 'Vectorfield {\n cube_size 32\n')).toBe('nuke_nk');
    });

    it('LUTD-015: sniffs look from XML with look element', () => {
      expect(detectLUTFormat('unknown', '<?xml version="1.0"?>\n<look>\n</look>')).toBe('look');
    });

    it('LUTD-016: sniffs cube from LUT_3D_SIZE content', () => {
      expect(detectLUTFormat('unknown', '# Comment\nLUT_3D_SIZE 17\n')).toBe('cube');
    });

    it('LUTD-017: sniffs houdini_lut from Version header', () => {
      expect(detectLUTFormat('unknown', 'Version\t\t3\nFormat\t\tany\n')).toBe('houdini_lut');
    });

    it('LUTD-019: parseLUT throws for unsupported format', () => {
      expect(() => parseLUT('test.xyz', 'random data')).toThrow('Unsupported LUT format');
    });

    it('LUTD-020: is case-insensitive for extensions', () => {
      expect(detectLUTFormat('MY_LUT.CUBE')).toBe('cube');
      expect(detectLUTFormat('my_lut.3DL')).toBe('3dl');
      expect(detectLUTFormat('my_lut.CSP')).toBe('csp');
      expect(detectLUTFormat('my_lut.ITX')).toBe('itx');
      expect(detectLUTFormat('my_lut.LOOK')).toBe('look');
      expect(detectLUTFormat('my_lut.LUT')).toBe('houdini_lut');
      expect(detectLUTFormat('my_lut.NK')).toBe('nuke_nk');
      expect(detectLUTFormat('my_lut.MGA')).toBe('mga');
    });
  });

  describe('parseLUT', () => {
    it('LUTD-018: delegates to correct parser for cube format', () => {
      const content = `TITLE "Test"
LUT_3D_SIZE 2
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0`;

      const lut = parseLUT('test.cube', content);
      expect(lut.size).toBe(2);
      expect(lut.title).toBe('Test');
    });
  });
});
