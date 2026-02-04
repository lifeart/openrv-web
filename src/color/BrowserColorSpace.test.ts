/**
 * BrowserColorSpace Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  detectBrowserColorSpace,
  canvasSupportsDisplayP3,
  gamutLabel,
  colorSpaceLabel,
  getActiveOutputColorSpace,
} from './BrowserColorSpace';
import { DEFAULT_CAPABILITIES, type DisplayCapabilities } from './DisplayCapabilities';

describe('BrowserColorSpace', () => {
  describe('detectBrowserColorSpace', () => {
    it('BCS-001: returns a valid object with all required fields', () => {
      const info = detectBrowserColorSpace();
      expect(info).toHaveProperty('colorSpace');
      expect(info).toHaveProperty('gamut');
      expect(info).toHaveProperty('hdr');
      expect(info).toHaveProperty('bitDepth');
    });

    it('BCS-002: colorSpace is a string', () => {
      const info = detectBrowserColorSpace();
      expect(typeof info.colorSpace).toBe('string');
    });

    it('BCS-003: gamut is one of known values', () => {
      const info = detectBrowserColorSpace();
      expect(['srgb', 'p3', 'rec2020', 'unknown']).toContain(info.gamut);
    });

    it('BCS-004: hdr is boolean', () => {
      const info = detectBrowserColorSpace();
      expect(typeof info.hdr).toBe('boolean');
    });

    it('BCS-005: bitDepth is number >= 8', () => {
      const info = detectBrowserColorSpace();
      expect(typeof info.bitDepth).toBe('number');
      expect(info.bitDepth).toBeGreaterThanOrEqual(8);
    });
  });

  describe('canvasSupportsDisplayP3', () => {
    it('BCS-010: returns boolean', () => {
      const result = canvasSupportsDisplayP3();
      expect(typeof result).toBe('boolean');
    });

    it('BCS-011: does not throw', () => {
      expect(() => canvasSupportsDisplayP3()).not.toThrow();
    });
  });

  describe('gamutLabel', () => {
    it('returns correct label for srgb', () => {
      expect(gamutLabel('srgb')).toBe('sRGB gamut');
    });

    it('returns correct label for p3', () => {
      expect(gamutLabel('p3')).toBe('P3 gamut');
    });

    it('returns correct label for rec2020', () => {
      expect(gamutLabel('rec2020')).toBe('Rec.2020 gamut');
    });

    it('returns correct label for unknown', () => {
      expect(gamutLabel('unknown')).toBe('Unknown gamut');
    });
  });

  describe('colorSpaceLabel', () => {
    it('returns correct label for srgb', () => {
      expect(colorSpaceLabel('srgb')).toBe('sRGB');
    });

    it('returns correct label for display-p3', () => {
      expect(colorSpaceLabel('display-p3')).toBe('Display P3');
    });

    it('returns passthrough for unknown strings', () => {
      expect(colorSpaceLabel('custom')).toBe('custom');
    });

    it('returns Unknown for empty string', () => {
      expect(colorSpaceLabel('')).toBe('Unknown');
    });
  });

  // ====================================================================
  // getActiveOutputColorSpace (Phase 1.5 acceptance criteria)
  // ====================================================================
  describe('getActiveOutputColorSpace', () => {
    it('BCS-HDR-001: returns display-p3 when webglP3 is true', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, webglP3: true };
      expect(getActiveOutputColorSpace(caps)).toBe('display-p3');
    });

    it('BCS-HDR-002: returns srgb when webglP3 is false', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, webglP3: false };
      expect(getActiveOutputColorSpace(caps)).toBe('srgb');
    });

    it('BCS-HDR-003: existing detectBrowserColorSpace still returns valid object', () => {
      const info = detectBrowserColorSpace();
      expect(info).toHaveProperty('colorSpace');
      expect(info).toHaveProperty('gamut');
      expect(info).toHaveProperty('hdr');
      expect(info).toHaveProperty('bitDepth');
      expect(typeof info.colorSpace).toBe('string');
      expect(['srgb', 'p3', 'rec2020', 'unknown']).toContain(info.gamut);
      expect(typeof info.hdr).toBe('boolean');
      expect(typeof info.bitDepth).toBe('number');
    });

    it('BCS-HDR-004: existing canvasSupportsDisplayP3 returns boolean without throwing', () => {
      expect(() => canvasSupportsDisplayP3()).not.toThrow();
      expect(typeof canvasSupportsDisplayP3()).toBe('boolean');
    });
  });
});
