/**
 * ColorAPI LUT Pipeline Stage tests (MED-51 PR-1 Phase 1)
 *
 * Covers the per-stage output color-space declaration surface added to
 * ColorAPI: setLUTStage{ColorPrimaries,TransferFunction} and their getters.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ColorAPI } from './ColorAPI';
import type { LUTPipelineProvider, LUTPipelineStage } from './types';
import type { ColorPrimaries, TransferFunction } from '../core/image/Image';
import { ValidationError, APIError } from '../core/errors';

// --------------------------------------------------------------------------
// Mock factories — ColorAPI constructor needs the three required providers,
// the LUTPipelineProvider is the new (optional) ninth argument.
// --------------------------------------------------------------------------

function createMockColorControls() {
  return {
    _state: {
      exposure: 0,
      gamma: 1,
      saturation: 1,
      contrast: 1,
      hueRotation: 0,
      temperature: 0,
      tint: 0,
      brightness: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
    },
    getAdjustments: vi.fn(function (this: any) {
      return { ...this._state };
    }),
    setAdjustments: vi.fn(function (this: any, state: any) {
      this._state = { ...state };
    }),
    reset: vi.fn(),
  };
}

function createMockCDLControl() {
  return {
    _state: {
      slope: { r: 1, g: 1, b: 1 },
      offset: { r: 0, g: 0, b: 0 },
      power: { r: 1, g: 1, b: 1 },
      saturation: 1,
    },
    getCDL: vi.fn(function (this: any) {
      return JSON.parse(JSON.stringify(this._state));
    }),
    setCDL: vi.fn(function (this: any, state: any) {
      this._state = JSON.parse(JSON.stringify(state));
    }),
  };
}

function createMockCurvesControl() {
  return {
    getCurves: vi.fn(() => ({
      master: {
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        enabled: true,
      },
      red: {
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        enabled: true,
      },
      green: {
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        enabled: true,
      },
      blue: {
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        enabled: true,
      },
    })),
    setCurves: vi.fn(),
  };
}

interface MockLUTPipelineProvider extends LUTPipelineProvider {
  _primaries: Map<LUTPipelineStage, ColorPrimaries | null>;
  _transfer: Map<LUTPipelineStage, TransferFunction | null>;
  _ocioActive: boolean;
}

function createMockLUTPipelineProvider(): MockLUTPipelineProvider {
  const provider: MockLUTPipelineProvider = {
    _primaries: new Map<LUTPipelineStage, ColorPrimaries | null>([
      ['precache', null],
      ['file', null],
      ['look', null],
      ['display', null],
    ]),
    _transfer: new Map<LUTPipelineStage, TransferFunction | null>([
      ['precache', null],
      ['file', null],
      ['look', null],
      ['display', null],
    ]),
    _ocioActive: false,
    setLUTStageOutputColorPrimaries: vi.fn(function (this: any, stage, primaries) {
      this._primaries.set(stage, primaries);
    }),
    getLUTStageOutputColorPrimaries: vi.fn(function (this: any, stage) {
      return this._primaries.get(stage) ?? null;
    }),
    setLUTStageOutputTransferFunction: vi.fn(function (this: any, stage, transfer) {
      this._transfer.set(stage, transfer);
    }),
    getLUTStageOutputTransferFunction: vi.fn(function (this: any, stage) {
      return this._transfer.get(stage) ?? null;
    }),
    isOCIOActiveForDisplay: vi.fn(function (this: any) {
      return this._ocioActive;
    }),
  };
  return provider;
}

const ALL_STAGES: LUTPipelineStage[] = ['precache', 'file', 'look', 'display'];

describe('ColorAPI — LUT Pipeline Stage output color-space (MED-51)', () => {
  let color: ColorAPI;
  let lutPipelineProvider: MockLUTPipelineProvider;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    lutPipelineProvider = createMockLUTPipelineProvider();
    color = new ColorAPI(
      createMockColorControls() as any,
      createMockCDLControl() as any,
      createMockCurvesControl() as any,
      undefined, // lutProvider not used
      undefined, // toneMappingProvider
      undefined, // displayProvider
      undefined, // displayCapabilitiesProvider
      undefined, // ocioProvider
      lutPipelineProvider, // lutPipelineProvider
    );
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // CAPI-LSO-001: setter/getter round-trip per stage × per axis
  describe('CAPI-LSO-001: setter/getter round-trip', () => {
    for (const stage of ALL_STAGES) {
      it(`primaries round-trip on stage "${stage}"`, () => {
        color.setLUTStageColorPrimaries(stage, 'bt2020');
        expect(color.getLUTStageColorPrimaries(stage)).toBe('bt2020');
        expect(lutPipelineProvider.setLUTStageOutputColorPrimaries).toHaveBeenCalledWith(stage, 'bt2020');
      });

      it(`transfer round-trip on stage "${stage}"`, () => {
        color.setLUTStageTransferFunction(stage, 'pq');
        expect(color.getLUTStageTransferFunction(stage)).toBe('pq');
        expect(lutPipelineProvider.setLUTStageOutputTransferFunction).toHaveBeenCalledWith(stage, 'pq');
      });
    }
  });

  // CAPI-LSO-002: null clears state
  it('CAPI-LSO-002: null sentinel clears state on every stage and axis', () => {
    for (const stage of ALL_STAGES) {
      // Set then clear primaries
      color.setLUTStageColorPrimaries(stage, 'p3');
      color.setLUTStageColorPrimaries(stage, null);
      expect(color.getLUTStageColorPrimaries(stage)).toBeNull();

      // Set then clear transfer
      color.setLUTStageTransferFunction(stage, 'hlg');
      color.setLUTStageTransferFunction(stage, null);
      expect(color.getLUTStageTransferFunction(stage)).toBeNull();
    }
  });

  // CAPI-LSO-003: rejects invalid stage with ValidationError
  it('CAPI-LSO-003: rejects invalid stage with ValidationError', () => {
    expect(() => color.setLUTStageColorPrimaries('bogus' as any, null)).toThrow(ValidationError);
    expect(() => color.setLUTStageColorPrimaries('bogus' as any, null)).toThrow(/stage.*precache.*file.*look.*display/);
    expect(() => color.getLUTStageColorPrimaries('bogus' as any)).toThrow(ValidationError);
    expect(() => color.setLUTStageTransferFunction('bogus' as any, null)).toThrow(ValidationError);
    expect(() => color.getLUTStageTransferFunction('bogus' as any)).toThrow(ValidationError);

    // Non-string types
    expect(() => color.setLUTStageColorPrimaries(42 as any, null)).toThrow(ValidationError);
    expect(() => color.setLUTStageColorPrimaries(null as any, null)).toThrow(ValidationError);
    expect(() => color.setLUTStageColorPrimaries(undefined as any, null)).toThrow(ValidationError);
  });

  // CAPI-LSO-004: rejects invalid primaries
  it('CAPI-LSO-004: rejects invalid primaries with ValidationError', () => {
    expect(() => color.setLUTStageColorPrimaries('file', 'rec709-bogus' as any)).toThrow(ValidationError);
    expect(() => color.setLUTStageColorPrimaries('file', 'rec709-bogus' as any)).toThrow(
      /primaries.*null.*bt709.*bt2020.*p3/,
    );
    expect(() => color.setLUTStageColorPrimaries('file', 5 as any)).toThrow(ValidationError);
    expect(() => color.setLUTStageColorPrimaries('file', {} as any)).toThrow(ValidationError);
    // Valid bt709 / bt2020 / p3 should pass
    expect(() => color.setLUTStageColorPrimaries('file', 'bt709')).not.toThrow();
    expect(() => color.setLUTStageColorPrimaries('file', 'bt2020')).not.toThrow();
    expect(() => color.setLUTStageColorPrimaries('file', 'p3')).not.toThrow();
  });

  // CAPI-LSO-005: rejects invalid transfer (but accepts 'linear')
  it('CAPI-LSO-005: rejects invalid transfer with ValidationError but accepts "linear"', () => {
    expect(() => color.setLUTStageTransferFunction('look', 'rec1886' as any)).toThrow(ValidationError);
    expect(() => color.setLUTStageTransferFunction('look', 'rec1886' as any)).toThrow(
      /transfer.*null.*srgb.*hlg.*pq.*smpte240m.*linear/,
    );
    expect(() => color.setLUTStageTransferFunction('look', 5 as any)).toThrow(ValidationError);
    // Valid values should pass — including 'linear' (added in PR-0)
    for (const t of ['srgb', 'hlg', 'pq', 'smpte240m', 'linear'] as TransferFunction[]) {
      expect(() => color.setLUTStageTransferFunction('look', t)).not.toThrow();
    }
  });

  // CAPI-LSO-006: rejects 'auto' string explicitly
  it('CAPI-LSO-006: rejects "auto" string explicitly on both axes', () => {
    expect(() => color.setLUTStageColorPrimaries('file', 'auto' as any)).toThrow(ValidationError);
    expect(() => color.setLUTStageColorPrimaries('file', 'auto' as any)).toThrow(/auto.*null instead/);
    expect(() => color.setLUTStageTransferFunction('file', 'auto' as any)).toThrow(ValidationError);
    expect(() => color.setLUTStageTransferFunction('file', 'auto' as any)).toThrow(/auto.*null instead/);
  });

  // CAPI-LSO-007: throws APIError when no provider configured
  it('CAPI-LSO-007: throws APIError when no LUT pipeline provider configured', () => {
    const colorNoProvider = new ColorAPI(
      createMockColorControls() as any,
      createMockCDLControl() as any,
      createMockCurvesControl() as any,
    );
    expect(() => colorNoProvider.setLUTStageColorPrimaries('file', 'bt709')).toThrow(APIError);
    expect(() => colorNoProvider.setLUTStageColorPrimaries('file', 'bt709')).toThrow(/not available/i);
    expect(() => colorNoProvider.getLUTStageColorPrimaries('file')).toThrow(APIError);
    expect(() => colorNoProvider.setLUTStageTransferFunction('file', 'srgb')).toThrow(APIError);
    expect(() => colorNoProvider.getLUTStageTransferFunction('file')).toThrow(APIError);
  });

  // CAPI-LSO-008: OCIO-active path: setter does not throw; warning logged once per session
  describe('CAPI-LSO-008: OCIO-active warn-not-throw contract', () => {
    beforeEach(() => {
      lutPipelineProvider._ocioActive = true;
    });

    it('does NOT throw when OCIO is active for display', () => {
      expect(() => color.setLUTStageColorPrimaries('display', 'bt709')).not.toThrow();
      expect(() => color.setLUTStageTransferFunction('display', 'srgb')).not.toThrow();
    });

    it('still calls through to the provider so state is stored', () => {
      color.setLUTStageColorPrimaries('display', 'bt709');
      expect(lutPipelineProvider.setLUTStageOutputColorPrimaries).toHaveBeenCalledWith('display', 'bt709');
    });

    it('logs a one-time warning per ColorAPI instance', () => {
      color.setLUTStageColorPrimaries('display', 'bt709');
      color.setLUTStageColorPrimaries('display', 'bt2020');
      color.setLUTStageTransferFunction('display', 'pq');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/OCIO is active/);
    });

    it('does NOT log a warning for non-display stages even when OCIO active', () => {
      color.setLUTStageColorPrimaries('precache', 'bt709');
      color.setLUTStageColorPrimaries('file', 'bt709');
      color.setLUTStageColorPrimaries('look', 'bt709');
      color.setLUTStageTransferFunction('precache', 'srgb');
      color.setLUTStageTransferFunction('file', 'srgb');
      color.setLUTStageTransferFunction('look', 'srgb');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  // CAPI-LSO-009: backward-compat — calling no methods leaves all stages at null
  it('CAPI-LSO-009: default state is null on every stage and axis (no API calls)', () => {
    for (const stage of ALL_STAGES) {
      expect(color.getLUTStageColorPrimaries(stage)).toBeNull();
      expect(color.getLUTStageTransferFunction(stage)).toBeNull();
    }
  });

  it('all four stages survive disposal-guard checks', () => {
    color.dispose();
    expect(() => color.setLUTStageColorPrimaries('file', 'bt709')).toThrow();
    expect(() => color.getLUTStageColorPrimaries('file')).toThrow();
    expect(() => color.setLUTStageTransferFunction('file', 'srgb')).toThrow();
    expect(() => color.getLUTStageTransferFunction('file')).toThrow();
  });
});
