/**
 * GTOSettingsParser Tests -- Per-channel RVColor arrays
 *
 * Tests for parseColorAdjustments per-channel extraction (exposureRGB, gammaRGB, contrastRGB),
 * scalar fallback, edge cases (NaN, empty array, float[2], float[4]), and round-trip.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseColorAdjustments, parseLinearize, parseUncrop } from './GTOSettingsParser';
import type { GTODTO } from 'gto-js';

/**
 * Helper to create a mock GTODTO with RVColor and optional RVDisplayColor nodes.
 * The `colorProps` object maps property names to their raw values as they
 * would come from the GTO parser (scalar, array, or nested array).
 */
function createMockDTO(
  colorProps?: Record<string, unknown>,
  displayColorProps?: Record<string, unknown>,
): GTODTO {
  const mockComponent = (props: Record<string, unknown> | undefined) => ({
    exists: () => props !== undefined,
    property: (name: string) => ({
      value: () => props?.[name],
      exists: () => props !== undefined && name in props,
    }),
  });

  const mockNode = (data: Record<string, unknown> | undefined) => ({
    component: (name: string) => {
      if (name === 'color') return mockComponent(data);
      return mockComponent(undefined);
    },
    name: 'mock',
  });

  return {
    byProtocol: (proto: string) => {
      if (proto === 'RVColor' && colorProps) {
        const results = [mockNode(colorProps)] as any;
        results.first = () => results[0];
        results.length = 1;
        return results;
      }
      if (proto === 'RVDisplayColor' && displayColorProps) {
        const results = [mockNode(displayColorProps)] as any;
        results.first = () => results[0];
        results.length = 1;
        return results;
      }
      const empty = [] as any;
      empty.first = () => mockNode(undefined);
      empty.length = 0;
      return empty;
    },
  } as unknown as GTODTO;
}

describe('GTOSettingsParser.parseColorAdjustments', () => {
  // =================================================================
  // Per-channel extraction
  // =================================================================

  describe('per-channel float[3] arrays', () => {
    it('returns per-channel exposureRGB when GTO has float[3] exposure', () => {
      const dto = createMockDTO({ exposure: [0.5, 1.0, 1.5] });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.exposure).toBe(0.5); // scalar = first element
      expect(result!.exposureRGB).toEqual([0.5, 1.0, 1.5]);
    });

    it('returns per-channel gammaRGB when GTO has float[3] gamma', () => {
      const dto = createMockDTO({ gamma: [1.1, 1.2, 1.3] });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.gamma).toBe(1.1);
      expect(result!.gammaRGB).toEqual([1.1, 1.2, 1.3]);
    });

    it('returns per-channel contrastRGB when GTO has float[3] contrast', () => {
      const dto = createMockDTO({ contrast: [0.8, 1.0, 1.2] });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.contrast).toBe(0.8);
      expect(result!.contrastRGB).toEqual([0.8, 1.0, 1.2]);
    });

    it('returns all three per-channel fields together', () => {
      const dto = createMockDTO({
        exposure: [0.2, 0.3, 0.4],
        gamma: [1.1, 1.2, 1.3],
        contrast: [0.9, 1.0, 1.1],
      });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.exposureRGB).toEqual([0.2, 0.3, 0.4]);
      expect(result!.gammaRGB).toEqual([1.1, 1.2, 1.3]);
      expect(result!.contrastRGB).toEqual([0.9, 1.0, 1.1]);
    });
  });

  // =================================================================
  // Scalar fallback
  // =================================================================

  describe('scalar fallback', () => {
    it('returns scalar exposure when GTO has single-element array', () => {
      const dto = createMockDTO({ exposure: [1.5] });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.exposure).toBe(1.5);
      expect(result!.exposureRGB).toBeUndefined();
    });

    it('returns scalar when GTO has plain number exposure = 1.5', () => {
      const dto = createMockDTO({ exposure: 1.5 });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.exposure).toBe(1.5);
      expect(result!.exposureRGB).toBeUndefined();
    });

    it('returns scalar gamma when GTO has single value', () => {
      const dto = createMockDTO({ gamma: 2.2 });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.gamma).toBe(2.2);
      expect(result!.gammaRGB).toBeUndefined();
    });

    it('returns scalar contrast when GTO has single value', () => {
      const dto = createMockDTO({ contrast: 1.5 });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.contrast).toBe(1.5);
      expect(result!.contrastRGB).toBeUndefined();
    });
  });

  // =================================================================
  // Contrast zero-mapping
  // =================================================================

  describe('contrast zero mapping', () => {
    it('maps scalar contrast 0 to 1 (OpenRV convention)', () => {
      const dto = createMockDTO({ contrast: 0 });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.contrast).toBe(1);
    });

    it('maps per-channel contrast [0, 0, 0] to [1, 1, 1]', () => {
      const dto = createMockDTO({ contrast: [0, 0, 0] });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.contrastRGB).toEqual([1, 1, 1]);
    });

    it('maps mixed per-channel contrast [0, 1.5, 0] to [1, 1.5, 1]', () => {
      const dto = createMockDTO({ contrast: [0, 1.5, 0] });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.contrastRGB).toEqual([1, 1.5, 1]);
    });
  });

  // =================================================================
  // Negative / edge cases
  // =================================================================

  describe('edge cases', () => {
    it('float[2] array falls back to scalar (first element)', () => {
      const dto = createMockDTO({ exposure: [0.7, 1.3] });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.exposure).toBe(0.7);
      expect(result!.exposureRGB).toBeUndefined();
    });

    it('float[4] array uses first 3 elements for per-channel', () => {
      const dto = createMockDTO({ exposure: [0.1, 0.2, 0.3, 0.4] });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.exposure).toBe(0.1); // scalar from first element
      expect(result!.exposureRGB).toEqual([0.1, 0.2, 0.3]);
    });

    it('empty array falls back to default (returns null for property)', () => {
      const dto = createMockDTO({ exposure: [] });
      const result = parseColorAdjustments(dto);

      // Empty array means no exposure was parsed, result might be null or missing exposure
      expect(result).toBeNull();
    });

    it('[NaN, 1.0, 1.0] is sanitized (NaN replaced with default)', () => {
      const dto = createMockDTO({ exposure: [NaN, 1.0, 1.0] });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      // NaN in exposure is sanitized to default (0 for exposure)
      expect(result!.exposure).toBe(0);
      expect(result!.exposureRGB).toEqual([0, 1.0, 1.0]);
    });

    it('[1.0, NaN, NaN] gamma is sanitized (NaN replaced with default 1)', () => {
      const dto = createMockDTO({ gamma: [1.0, NaN, NaN] });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.gamma).toBe(1.0);
      expect(result!.gammaRGB).toEqual([1.0, 1, 1]);
    });

    it('[Infinity, -Infinity, NaN] exposure is sanitized', () => {
      const dto = createMockDTO({ exposure: [Infinity, -Infinity, NaN] });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      // All non-finite values sanitized to default (0 for exposure)
      expect(result!.exposureRGB).toEqual([0, 0, 0]);
    });

    it('undefined property does not set the field', () => {
      const dto = createMockDTO({ saturation: 0.8 });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.saturation).toBe(0.8);
      expect(result!.exposure).toBeUndefined();
      expect(result!.exposureRGB).toBeUndefined();
      expect(result!.gamma).toBeUndefined();
      expect(result!.gammaRGB).toBeUndefined();
    });
  });

  // =================================================================
  // Existing scalar behavior regression
  // =================================================================

  describe('regression: existing scalar behavior', () => {
    it('scalar float exposure = 1.5 still returns exposure: 1.5', () => {
      const dto = createMockDTO({ exposure: 1.5 });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.exposure).toBe(1.5);
    });

    it('saturation is still parsed correctly', () => {
      const dto = createMockDTO({ saturation: 0.5 });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.saturation).toBe(0.5);
    });

    it('offset is still mapped to brightness', () => {
      const dto = createMockDTO({ offset: 0.1 });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.brightness).toBe(0.1);
    });

    it('returns null when no color nodes exist', () => {
      const dto = createMockDTO();
      const result = parseColorAdjustments(dto);

      expect(result).toBeNull();
    });

    it('RVDisplayColor brightness still parsed', () => {
      const dto = createMockDTO(undefined, { brightness: 0.75 });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      expect(result!.brightness).toBe(0.75);
    });

    it('RVDisplayColor gamma used when RVColor gamma is absent', () => {
      const dto = createMockDTO({ saturation: 1.0 }, { gamma: 2.4 });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      // RVColor has no gamma, so RVDisplayColor gamma is used
      expect(result!.gamma).toBe(2.4);
    });

    it('RVColor gamma takes precedence over RVDisplayColor gamma', () => {
      const dto = createMockDTO({ gamma: 1.8 }, { gamma: 2.4 });
      const result = parseColorAdjustments(dto);

      expect(result).not.toBeNull();
      // RVColor gamma is already set, so RVDisplayColor gamma is ignored
      expect(result!.gamma).toBe(1.8);
    });
  });

  // =================================================================
  // Inline LUT (luminanceLUT component)
  // =================================================================

  describe('inline LUT from luminanceLUT component', () => {
    /**
     * Enhanced mock that supports both 'color' and 'luminanceLUT' components
     * on the same RVColor node.
     */
    function createMockDTOWithLUT(
      colorProps?: Record<string, unknown>,
      lumLutProps?: Record<string, unknown>,
    ): GTODTO {
      const mockComponent = (props: Record<string, unknown> | undefined) => ({
        exists: () => props !== undefined,
        property: (name: string) => ({
          value: () => props?.[name],
          exists: () => props !== undefined && name in props,
        }),
      });

      const mockNode = (colorData: Record<string, unknown> | undefined, lumLutData: Record<string, unknown> | undefined) => ({
        component: (name: string) => {
          if (name === 'color') return mockComponent(colorData);
          if (name === 'luminanceLUT') return mockComponent(lumLutData);
          return mockComponent(undefined);
        },
        name: 'mock',
      });

      return {
        byProtocol: (proto: string) => {
          if (proto === 'RVColor') {
            const results = [mockNode(colorProps, lumLutProps)] as any;
            results.first = () => results[0];
            results.length = 1;
            return results;
          }
          const empty = [] as any;
          empty.first = () => mockNode(undefined, undefined);
          empty.length = 0;
          return empty;
        },
      } as unknown as GTODTO;
    }

    it('parses 768-element float array as 3-channel LUT with 256 entries/channel', () => {
      // 768 = 256 * 3, so channels = 3
      const lutData = new Array(768).fill(0).map((_, i) => i / 768);
      const dto = createMockDTOWithLUT(
        { saturation: 1.0 },
        { active: 1, lut: lutData },
      );

      const result = parseColorAdjustments(dto);
      expect(result).not.toBeNull();
      expect(result!.inlineLUT).toBeInstanceOf(Float32Array);
      expect(result!.inlineLUT!.length).toBe(768);
      expect(result!.lutChannels).toBe(3);
    });

    it('parses 256-element float array as 1-channel luminance LUT', () => {
      // 256 is divisible by 3? No: 256 % 3 !== 0, so channels = 1
      // Wait: 256 % 3 = 1, not 0. So this should be 1-channel.
      // But actually 256 IS NOT divisible by 3 (256/3 = 85.33), so channels=1.
      const lutData = new Array(256).fill(0).map((_, i) => i / 256);
      const dto = createMockDTOWithLUT(
        { saturation: 1.0 },
        { active: 1, lut: lutData },
      );

      const result = parseColorAdjustments(dto);
      expect(result).not.toBeNull();
      expect(result!.inlineLUT).toBeInstanceOf(Float32Array);
      expect(result!.inlineLUT!.length).toBe(256);
      expect(result!.lutChannels).toBe(1);
    });

    it('returns undefined inlineLUT when luminanceLUT component is absent', () => {
      const dto = createMockDTOWithLUT(
        { saturation: 1.0 },
        undefined, // no luminanceLUT component
      );

      const result = parseColorAdjustments(dto);
      expect(result).not.toBeNull();
      expect(result!.inlineLUT).toBeUndefined();
      expect(result!.lutChannels).toBeUndefined();
    });

    it('treats LUT length not divisible by 3 (e.g. 770) as 1-channel', () => {
      // 770 % 3 = 2, so channels = 1
      const lutData = new Array(770).fill(0).map((_, i) => i / 770);
      const dto = createMockDTOWithLUT(
        { saturation: 1.0 },
        { active: 1, lut: lutData },
      );

      const result = parseColorAdjustments(dto);
      expect(result).not.toBeNull();
      expect(result!.inlineLUT).toBeInstanceOf(Float32Array);
      expect(result!.inlineLUT!.length).toBe(770);
      expect(result!.lutChannels).toBe(1);
    });

    it('returns undefined inlineLUT when luminanceLUT active=0', () => {
      const lutData = new Array(768).fill(0);
      const dto = createMockDTOWithLUT(
        { saturation: 1.0 },
        { active: 0, lut: lutData },
      );

      const result = parseColorAdjustments(dto);
      expect(result).not.toBeNull();
      expect(result!.inlineLUT).toBeUndefined();
    });

    it('returns undefined inlineLUT when lut array is empty', () => {
      const dto = createMockDTOWithLUT(
        { saturation: 1.0 },
        { active: 1, lut: [] },
      );

      const result = parseColorAdjustments(dto);
      expect(result).not.toBeNull();
      expect(result!.inlineLUT).toBeUndefined();
    });

    it('returns undefined inlineLUT when active property is absent (undefined)', () => {
      // When the active property is missing entirely, it should NOT activate the LUT.
      // This guards against `undefined !== 0` being truthy.
      const lutData = new Array(768).fill(0).map((_, i) => i / 768);
      const dto = createMockDTOWithLUT(
        { saturation: 1.0 },
        { lut: lutData }, // no 'active' property at all
      );

      const result = parseColorAdjustments(dto);
      expect(result).not.toBeNull();
      expect(result!.inlineLUT).toBeUndefined();
      expect(result!.lutChannels).toBeUndefined();
    });

    it('round-trip: 768-element LUT Float32Array values match input within float32 precision', () => {
      const lutData = new Array(768).fill(0).map((_, i) => i / 768);
      const dto = createMockDTOWithLUT(
        { saturation: 1.0 },
        { active: 1, lut: lutData },
      );

      const result = parseColorAdjustments(dto);
      expect(result).not.toBeNull();
      expect(result!.inlineLUT).toBeInstanceOf(Float32Array);

      // Verify every value matches the input (5 decimal places = Float32 precision)
      const parsed = result!.inlineLUT!;
      for (let i = 0; i < 768; i++) {
        expect(parsed[i]).toBeCloseTo(lutData[i]!, 5);
      }
    });

    it('spot-check: 768-element LUT has correct first/last values', () => {
      const lutData = new Array(768).fill(0).map((_, i) => i / 768);
      const dto = createMockDTOWithLUT(
        { saturation: 1.0 },
        { active: 1, lut: lutData },
      );

      const result = parseColorAdjustments(dto);
      expect(result).not.toBeNull();
      expect(result!.inlineLUT![0]).toBeCloseTo(0 / 768, 5);
      expect(result!.inlineLUT![767]).toBeCloseTo(767 / 768, 5);
    });

    it('spot-check: 256-element LUT has correct first/last values', () => {
      const lutData = new Array(256).fill(0).map((_, i) => i / 256);
      const dto = createMockDTOWithLUT(
        { saturation: 1.0 },
        { active: 1, lut: lutData },
      );

      const result = parseColorAdjustments(dto);
      expect(result).not.toBeNull();
      expect(result!.inlineLUT![0]).toBeCloseTo(0 / 256, 5);
      expect(result!.inlineLUT![255]).toBeCloseTo(255 / 256, 5);
    });
  });

  // =================================================================
  // Round-trip: export -> re-parse
  // =================================================================

  describe('round-trip preservation', () => {
    it('per-channel values survive mock round-trip', () => {
      // Simulate what buildColorObject produces: exposure as float[3]
      const dto = createMockDTO({
        exposure: [0.5, 1.0, 1.5],
        gamma: [1.1, 1.2, 1.3],
        contrast: [0.8, 1.0, 1.2],
        saturation: 0.9,
      });

      const result = parseColorAdjustments(dto);
      expect(result).not.toBeNull();

      // Verify per-channel values are preserved
      expect(result!.exposureRGB).toEqual([0.5, 1.0, 1.5]);
      expect(result!.gammaRGB).toEqual([1.1, 1.2, 1.3]);
      expect(result!.contrastRGB).toEqual([0.8, 1.0, 1.2]);

      // Verify scalar values are the first element
      expect(result!.exposure).toBe(0.5);
      expect(result!.gamma).toBe(1.1);
      expect(result!.contrast).toBe(0.8);
      expect(result!.saturation).toBe(0.9);
    });

    it('uniform values (all channels same) round-trip correctly', () => {
      // When all channels are the same, e.g., [1.5, 1.5, 1.5]
      const dto = createMockDTO({
        exposure: [1.5, 1.5, 1.5],
      });

      const result = parseColorAdjustments(dto);
      expect(result).not.toBeNull();
      expect(result!.exposure).toBe(1.5);
      expect(result!.exposureRGB).toEqual([1.5, 1.5, 1.5]);
    });
  });
});

// =================================================================
// GTOSettingsParser.parseLinearize
// =================================================================

/**
 * Helper to create a mock GTODTO with an RVLinearize node.
 * The `colorProps` object maps property names to their raw values.
 * The optional `nodeProps` maps node-level properties (e.g. `active`).
 */
function createLinearizeMockDTO(
  colorProps?: Record<string, unknown>,
  nodeProps?: Record<string, unknown>,
): GTODTO {
  const mockComponent = (props: Record<string, unknown> | undefined) => ({
    exists: () => props !== undefined,
    property: (name: string) => ({
      value: () => props?.[name],
      exists: () => props !== undefined && name in props,
    }),
  });

  const mockNode = (colorData: Record<string, unknown> | undefined, nodeData: Record<string, unknown> | undefined) => ({
    component: (name: string) => {
      if (name === 'color') return mockComponent(colorData);
      if (name === 'node') return mockComponent(nodeData);
      return mockComponent(undefined);
    },
    name: 'mock-linearize',
  });

  return {
    byProtocol: (proto: string) => {
      if (proto === 'RVLinearize' && colorProps) {
        const results = [mockNode(colorProps, nodeProps)] as any;
        results.first = () => results[0];
        results.length = 1;
        return results;
      }
      const empty = [] as any;
      empty.first = () => mockNode(undefined, undefined);
      empty.length = 0;
      return empty;
    },
  } as unknown as GTODTO;
}

describe('GTOSettingsParser.parseLinearize', () => {
  // =================================================================
  // Log type parsing
  // =================================================================

  describe('log type parsing', () => {
    it('parses logtype=1 (Cineon)', () => {
      const dto = createLinearizeMockDTO({ logtype: 1 });
      const result = parseLinearize(dto);

      expect(result).not.toBeNull();
      expect(result!.logType).toBe(1);
      expect(result!.sRGB2linear).toBe(false);
      expect(result!.rec709ToLinear).toBe(false);
      expect(result!.fileGamma).toBe(1.0);
      expect(result!.alphaType).toBe(0);
    });

    it('parses logtype=2 (Viper/Cineon fallback)', () => {
      // Suppress console.warn for this test
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const dto = createLinearizeMockDTO({ logtype: 2 });
      const result = parseLinearize(dto);

      expect(result).not.toBeNull();
      expect(result!.logType).toBe(2);
      warnSpy.mockRestore();
    });

    it('parses logtype=3 (ARRI LogC3)', () => {
      const dto = createLinearizeMockDTO({ logtype: 3 });
      const result = parseLinearize(dto);

      expect(result).not.toBeNull();
      expect(result!.logType).toBe(3);
    });
  });

  // =================================================================
  // sRGB2linear and Rec709ToLinear
  // =================================================================

  describe('sRGB2linear and Rec709ToLinear', () => {
    it('parses sRGB2linear=1', () => {
      const dto = createLinearizeMockDTO({ sRGB2linear: 1 });
      const result = parseLinearize(dto);

      expect(result).not.toBeNull();
      expect(result!.sRGB2linear).toBe(true);
      expect(result!.logType).toBe(0);
    });

    it('parses Rec709ToLinear=1', () => {
      const dto = createLinearizeMockDTO({ Rec709ToLinear: 1 });
      const result = parseLinearize(dto);

      expect(result).not.toBeNull();
      expect(result!.rec709ToLinear).toBe(true);
    });

    it('parses sRGB2linear=0 as false', () => {
      const dto = createLinearizeMockDTO({ sRGB2linear: 0 });
      const result = parseLinearize(dto);

      // All defaults -> null
      expect(result).toBeNull();
    });
  });

  // =================================================================
  // File gamma
  // =================================================================

  describe('file gamma', () => {
    it('parses fileGamma=2.2', () => {
      const dto = createLinearizeMockDTO({ fileGamma: 2.2 });
      const result = parseLinearize(dto);

      expect(result).not.toBeNull();
      expect(result!.fileGamma).toBe(2.2);
    });

    it('fileGamma=1.0 is default -> returns null (all defaults)', () => {
      const dto = createLinearizeMockDTO({ fileGamma: 1.0 });
      const result = parseLinearize(dto);

      // fileGamma=1.0 is the default, so all values are default -> null
      expect(result).toBeNull();
    });

    it('fileGamma=0 returns fileGamma=0 (parser does not clamp)', () => {
      // Note: The parser stores the raw value; boundary safety is handled
      // by the shader (pow with max(0) guard) or the caller.
      const dto = createLinearizeMockDTO({ fileGamma: 0 });
      const result = parseLinearize(dto);

      expect(result).not.toBeNull();
      expect(result!.fileGamma).toBe(0);
    });
  });

  // =================================================================
  // Missing / inactive nodes
  // =================================================================

  describe('missing and inactive nodes', () => {
    it('returns null when no RVLinearize node exists', () => {
      const dto = createLinearizeMockDTO(); // no colorProps
      const result = parseLinearize(dto);

      expect(result).toBeNull();
    });

    it('returns null when node active=0', () => {
      const dto = createLinearizeMockDTO({ logtype: 1 }, { active: 0 });
      const result = parseLinearize(dto);

      expect(result).toBeNull();
    });

    it('returns null when color component active=0', () => {
      const dto = createLinearizeMockDTO({ logtype: 1, active: 0 });
      const result = parseLinearize(dto);

      expect(result).toBeNull();
    });

    it('returns null when all values are defaults', () => {
      const dto = createLinearizeMockDTO({ logtype: 0, sRGB2linear: 0, fileGamma: 1.0 });
      const result = parseLinearize(dto);

      expect(result).toBeNull();
    });
  });

  // =================================================================
  // Combined settings
  // =================================================================

  describe('combined settings', () => {
    it('parses logtype with fileGamma together', () => {
      const dto = createLinearizeMockDTO({ logtype: 1, fileGamma: 2.2 });
      const result = parseLinearize(dto);

      expect(result).not.toBeNull();
      expect(result!.logType).toBe(1);
      expect(result!.fileGamma).toBe(2.2);
    });

    it('parses alphaType=1 (premultiplied)', () => {
      const dto = createLinearizeMockDTO({ alphaType: 1 });
      const result = parseLinearize(dto);

      expect(result).not.toBeNull();
      expect(result!.alphaType).toBe(1);
    });
  });

  // =================================================================
  // Edge cases: invalid logtype, NaN fileGamma, negative values
  // =================================================================

  describe('edge cases', () => {
    it('invalid logtype (99) maps to 0 -> all defaults -> returns null', () => {
      const dto = createLinearizeMockDTO({ logtype: 99 });
      const result = parseLinearize(dto);

      // logtype=99 is not handled by any branch, so logType stays 0.
      // With all other fields at defaults, the result is null.
      expect(result).toBeNull();
    });

    it('negative logtype (-1) maps to 0 -> all defaults -> returns null', () => {
      const dto = createLinearizeMockDTO({ logtype: -1 });
      const result = parseLinearize(dto);

      // Negative logtype is not handled by any branch, so logType stays 0.
      expect(result).toBeNull();
    });

    it('NaN fileGamma falls back to default 1.0', () => {
      const dto = createLinearizeMockDTO({ fileGamma: NaN, logtype: 1 });
      const result = parseLinearize(dto);

      expect(result).not.toBeNull();
      // NaN is not finite, so it falls back to 1.0
      expect(result!.fileGamma).toBe(1.0);
    });

    it('Infinity fileGamma falls back to default 1.0', () => {
      const dto = createLinearizeMockDTO({ fileGamma: Infinity, logtype: 1 });
      const result = parseLinearize(dto);

      expect(result).not.toBeNull();
      expect(result!.fileGamma).toBe(1.0);
    });

    it('negative fileGamma is passed through (no clamping by parser)', () => {
      // Negative fileGamma is technically invalid but the parser does not clamp;
      // boundary safety is handled by the shader (pow with max guard).
      const dto = createLinearizeMockDTO({ fileGamma: -0.5 });
      const result = parseLinearize(dto);

      expect(result).not.toBeNull();
      expect(result!.fileGamma).toBe(-0.5);
    });
  });
});

// =================================================================
// GTOSettingsParser.parseUncrop
// =================================================================

/**
 * Helper to create a mock GTODTO with an RVFormat node that supports
 * both 'crop' and 'uncrop' components.
 */
function createUncropMockDTO(
  uncropProps?: Record<string, unknown>,
  cropProps?: Record<string, unknown>,
): GTODTO {
  const mockComponent = (props: Record<string, unknown> | undefined) => ({
    exists: () => props !== undefined,
    property: (name: string) => ({
      value: () => props?.[name],
      exists: () => props !== undefined && name in props,
    }),
  });

  const mockNode = (
    uncropData: Record<string, unknown> | undefined,
    cropData: Record<string, unknown> | undefined,
  ) => ({
    component: (name: string) => {
      if (name === 'uncrop') return mockComponent(uncropData);
      if (name === 'crop') return mockComponent(cropData);
      return mockComponent(undefined);
    },
    name: 'mock-format',
  });

  return {
    byProtocol: (proto: string) => {
      if (proto === 'RVFormat' && (uncropProps || cropProps)) {
        const results = [mockNode(uncropProps, cropProps)] as any;
        results.first = () => results[0];
        results.length = 1;
        return results;
      }
      const empty = [] as any;
      empty.first = () => mockNode(undefined, undefined);
      empty.length = 0;
      return empty;
    },
  } as unknown as GTODTO;
}

describe('GTOSettingsParser.parseUncrop', () => {
  // =================================================================
  // Active uncrop parsing
  // =================================================================

  describe('active uncrop', () => {
    it('parses uncrop.active=1 with x, y, width, height', () => {
      const dto = createUncropMockDTO({
        active: 1,
        x: 100,
        y: 50,
        width: 1920,
        height: 1080,
      });

      const result = parseUncrop(dto);

      expect(result).not.toBeNull();
      expect(result!.active).toBe(true);
      expect(result!.x).toBe(100);
      expect(result!.y).toBe(50);
      expect(result!.width).toBe(1920);
      expect(result!.height).toBe(1080);
    });

    it('defaults x and y to 0 when not provided', () => {
      const dto = createUncropMockDTO({
        active: 1,
        width: 1920,
        height: 1080,
      });

      const result = parseUncrop(dto);

      expect(result).not.toBeNull();
      expect(result!.x).toBe(0);
      expect(result!.y).toBe(0);
      expect(result!.width).toBe(1920);
      expect(result!.height).toBe(1080);
    });
  });

  // =================================================================
  // Inactive uncrop
  // =================================================================

  describe('inactive uncrop', () => {
    it('returns null when active=0', () => {
      const dto = createUncropMockDTO({
        active: 0,
        x: 100,
        y: 50,
        width: 1920,
        height: 1080,
      });

      const result = parseUncrop(dto);
      expect(result).toBeNull();
    });

    it('returns null when active is undefined', () => {
      const dto = createUncropMockDTO({
        x: 100,
        y: 50,
        width: 1920,
        height: 1080,
      });

      const result = parseUncrop(dto);
      expect(result).toBeNull();
    });

    it('returns null when no RVFormat node exists', () => {
      const dto = createUncropMockDTO(); // no props at all
      const result = parseUncrop(dto);
      expect(result).toBeNull();
    });
  });

  // =================================================================
  // Boundary: invalid dimensions
  // =================================================================

  describe('boundary: invalid dimensions', () => {
    it('returns null when width is negative', () => {
      const dto = createUncropMockDTO({
        active: 1,
        x: 0,
        y: 0,
        width: -100,
        height: 1080,
      });

      const result = parseUncrop(dto);
      expect(result).toBeNull();
    });

    it('returns null when height is negative', () => {
      const dto = createUncropMockDTO({
        active: 1,
        x: 0,
        y: 0,
        width: 1920,
        height: -50,
      });

      const result = parseUncrop(dto);
      expect(result).toBeNull();
    });

    it('returns null when width is zero', () => {
      const dto = createUncropMockDTO({
        active: 1,
        x: 0,
        y: 0,
        width: 0,
        height: 1080,
      });

      const result = parseUncrop(dto);
      expect(result).toBeNull();
    });

    it('returns null when height is zero', () => {
      const dto = createUncropMockDTO({
        active: 1,
        x: 0,
        y: 0,
        width: 1920,
        height: 0,
      });

      const result = parseUncrop(dto);
      expect(result).toBeNull();
    });

    it('returns null when both width and height are zero', () => {
      const dto = createUncropMockDTO({
        active: 1,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      });

      const result = parseUncrop(dto);
      expect(result).toBeNull();
    });
  });

  // =================================================================
  // Round-trip: export -> re-parse
  // =================================================================

  describe('round-trip', () => {
    it('round-trip: parsed values match exported uncrop settings', () => {
      // Simulate what buildFormatObject would produce
      const dto = createUncropMockDTO({
        active: 1,
        x: 100,
        y: 50,
        width: 1920,
        height: 1080,
      });

      const parsed = parseUncrop(dto);
      expect(parsed).not.toBeNull();

      // Verify the values match what we'd export
      expect(parsed!.active).toBe(true);
      expect(parsed!.x).toBe(100);
      expect(parsed!.y).toBe(50);
      expect(parsed!.width).toBe(1920);
      expect(parsed!.height).toBe(1080);
    });
  });
});
