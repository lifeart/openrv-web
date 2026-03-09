import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isToneMappingEnabled,
  detectActivePixelEffects,
  compositeImageDataOverBackground,
  applyBatchedPixelEffects,
  applyBatchedPixelEffectsAsync,
  applyLightweightEffects,
  type PixelEffectsContext,
} from './ViewerPixelEffects';
import {
  isDefaultCDL,
  isDefaultCurves,
  applyColorInversion,
  applyCDLToImageData,
  isDisplayStateActive,
  applyDisplayColorManagementToImageData,
  safeCanvasContext2D,
  isIdentityHueRotation,
} from '../../color/ColorProcessingFacade';
import { applyChannelIsolation } from './ChannelSelect';
import { isDeinterlaceActive } from '../../filters/Deinterlace';
import { isFilmEmulationActive, applyFilmEmulation } from '../../filters/FilmEmulation';
import { isStabilizationActive } from '../../filters/StabilizeMotion';
import { isNoiseReductionActive, applyNoiseReduction } from '../../filters/NoiseReduction';
import { applyHighlightsShadows, applyVibrance, applyToneMappingWithParams } from './ViewerEffects';

// --- Mocks for imported modules ---

vi.mock('../../color/ColorProcessingFacade', () => ({
  isDefaultCDL: vi.fn(() => true),
  isDefaultCurves: vi.fn(() => true),
  applyColorInversion: vi.fn(),
  applyCDLToImageData: vi.fn(),
  isDisplayStateActive: vi.fn(() => false),
  applyDisplayColorManagementToImageData: vi.fn(),
  safeCanvasContext2D: vi.fn(),
  applyHueRotationInto: vi.fn(),
  isIdentityHueRotation: vi.fn(() => true),
}));

vi.mock('./ChannelSelect', () => ({
  applyChannelIsolation: vi.fn(),
}));

vi.mock('../../filters/Deinterlace', () => ({
  isDeinterlaceActive: vi.fn(() => false),
  applyDeinterlace: vi.fn(),
}));

vi.mock('../../filters/FilmEmulation', () => ({
  isFilmEmulationActive: vi.fn(() => false),
  applyFilmEmulation: vi.fn(),
}));

vi.mock('../../filters/StabilizeMotion', () => ({
  isStabilizationActive: vi.fn(() => false),
  applyStabilization: vi.fn(),
}));

vi.mock('../../filters/NoiseReduction', () => ({
  isNoiseReductionActive: vi.fn(() => false),
  applyNoiseReduction: vi.fn(),
}));

vi.mock('./ViewerEffects', () => ({
  applyHighlightsShadows: vi.fn(),
  applyVibrance: vi.fn(),
  applyToneMappingWithParams: vi.fn(),
}));

vi.mock('../../utils/effects/EffectProcessor', () => ({
  yieldToMain: vi.fn(() => Promise.resolve()),
}));

// --- Helper to build a mock PixelEffectsContext ---

function createMockOverlayManager() {
  return {
    getFalseColor: vi.fn(() => ({ isEnabled: vi.fn(() => false), apply: vi.fn() })),
    getLuminanceVisualization: vi.fn(() => ({ getMode: vi.fn(() => 'off'), apply: vi.fn() })),
    getZebraStripes: vi.fn(() => ({ isEnabled: vi.fn(() => false), apply: vi.fn() })),
    getClippingOverlay: vi.fn(() => ({ isEnabled: vi.fn(() => false), apply: vi.fn() })),
  };
}

function createMockColorPipeline() {
  return {
    toneMappingState: { enabled: false, operator: 'off' },
    cdlValues: {},
    curvesData: {},
    colorAdjustments: {
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      vibrance: 0,
      vibranceSkinProtection: true,
      clarity: 0,
      hueRotation: {},
    },
    colorInversionEnabled: false,
    displayColorState: {},
    curveLUTCache: { apply: vi.fn() },
  };
}

function createMockCanvasCtx() {
  return {
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(16),
      width: 2,
      height: 2,
    })),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
  };
}

function createMockCtx(overrides: Record<string, any> = {}): PixelEffectsContext {
  return {
    getColorPipeline: vi.fn(() => createMockColorPipeline()),
    getFilterSettings: vi.fn(() => ({ sharpen: 0 })),
    getChannelMode: vi.fn(() => 'rgb'),
    getColorWheels: vi.fn(() => ({ hasAdjustments: vi.fn(() => false), apply: vi.fn() })),
    getHSLQualifier: vi.fn(() => ({ isEnabled: vi.fn(() => false), apply: vi.fn() })),
    getOverlayManager: vi.fn(() => createMockOverlayManager()),
    getEffectProcessor: vi.fn(() => ({
      applyClarity: vi.fn(),
      applySharpenCPU: vi.fn(),
      applyClarityChunked: vi.fn(() => Promise.resolve()),
      applySharpenCPUChunked: vi.fn(() => Promise.resolve()),
    })),
    getSharpenProcessor: vi.fn(() => null),
    getNoiseReductionProcessor: vi.fn(() => null),
    getDeinterlaceParams: vi.fn(() => ({ enabled: false, method: 'weave' })),
    getFilmEmulationParams: vi.fn(() => ({ enabled: false, intensity: 0, stock: 'none' })),
    getStabilizationParams: vi.fn(() => ({ enabled: false, cropAmount: 0 })),
    getNoiseReductionParams: vi.fn(() => ({ strength: 0 })),
    getBackgroundPatternState: vi.fn(() => ({
      pattern: 'black',
      checkerSize: 'medium' as const,
      customColor: '#000000',
    })),
    getInteractionQuality: vi.fn(() => ({ cpuHalfRes: false })),
    getImageCtx: vi.fn(() => createMockCanvasCtx()),
    getCanvasColorSpace: vi.fn(() => undefined),
    getBgCompositeTempCanvas: vi.fn(() => null),
    setBgCompositeTempCanvas: vi.fn(),
    getBgCompositeTempCtx: vi.fn(() => null),
    setBgCompositeTempCtx: vi.fn(),
    getAsyncEffectsGeneration: vi.fn(() => 1),
    getCropManager: vi.fn(() => ({ clearOutsideCropRegion: vi.fn() })),
    ...overrides,
  } as unknown as PixelEffectsContext;
}

// --- Tests ---

describe('ViewerPixelEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isToneMappingEnabled', () => {
    it('returns false when tone mapping is disabled', () => {
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => ({
          ...createMockColorPipeline(),
          toneMappingState: { enabled: false, operator: 'reinhard' },
        })),
      });
      expect(isToneMappingEnabled(ctx)).toBe(false);
    });

    it('returns false when operator is off', () => {
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => ({
          ...createMockColorPipeline(),
          toneMappingState: { enabled: true, operator: 'off' },
        })),
      });
      expect(isToneMappingEnabled(ctx)).toBe(false);
    });

    it('returns true when enabled and operator is not off', () => {
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => ({
          ...createMockColorPipeline(),
          toneMappingState: { enabled: true, operator: 'reinhard' },
        })),
      });
      expect(isToneMappingEnabled(ctx)).toBe(true);
    });

    it('returns false when both disabled and operator is off', () => {
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => ({
          ...createMockColorPipeline(),
          toneMappingState: { enabled: false, operator: 'off' },
        })),
      });
      expect(isToneMappingEnabled(ctx)).toBe(false);
    });
  });

  describe('detectActivePixelEffects', () => {
    it('returns all flags false and anyActive false when no effects are active', () => {
      const ctx = createMockCtx();
      const flags = detectActivePixelEffects(ctx);

      expect(flags.anyActive).toBe(false);
      expect(flags.hasCDL).toBe(false);
      expect(flags.hasCurves).toBe(false);
      expect(flags.hasSharpen).toBe(false);
      expect(flags.hasNoiseReduction).toBe(false);
      expect(flags.hasChannel).toBe(false);
      expect(flags.hasHighlightsShadows).toBe(false);
      expect(flags.hasVibrance).toBe(false);
      expect(flags.hasClarity).toBe(false);
      expect(flags.hasHueRotation).toBe(false);
      expect(flags.hasColorWheels).toBe(false);
      expect(flags.hasHSLQualifier).toBe(false);
      expect(flags.hasFalseColor).toBe(false);
      expect(flags.hasLuminanceVis).toBe(false);
      expect(flags.hasZebras).toBe(false);
      expect(flags.hasClippingOverlay).toBe(false);
      expect(flags.hasToneMapping).toBe(false);
      expect(flags.hasInversion).toBe(false);
      expect(flags.hasDisplayColorMgmt).toBe(false);
      expect(flags.hasDeinterlace).toBe(false);
      expect(flags.hasFilmEmulation).toBe(false);
      expect(flags.hasStabilization).toBe(false);
    });

    it('detects channel mode change', () => {
      const ctx = createMockCtx({
        getChannelMode: vi.fn(() => 'red'),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasChannel).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects sharpen active', () => {
      const ctx = createMockCtx({
        getFilterSettings: vi.fn(() => ({ sharpen: 50 })),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasSharpen).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects highlights adjustment', () => {
      const pipeline = createMockColorPipeline();
      pipeline.colorAdjustments.highlights = 0.5;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasHighlightsShadows).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects shadows adjustment', () => {
      const pipeline = createMockColorPipeline();
      pipeline.colorAdjustments.shadows = -0.3;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasHighlightsShadows).toBe(true);
    });

    it('detects whites adjustment', () => {
      const pipeline = createMockColorPipeline();
      pipeline.colorAdjustments.whites = 0.2;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasHighlightsShadows).toBe(true);
    });

    it('detects blacks adjustment', () => {
      const pipeline = createMockColorPipeline();
      pipeline.colorAdjustments.blacks = -0.1;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasHighlightsShadows).toBe(true);
    });

    it('detects vibrance adjustment', () => {
      const pipeline = createMockColorPipeline();
      pipeline.colorAdjustments.vibrance = 0.5;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasVibrance).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects clarity adjustment', () => {
      const pipeline = createMockColorPipeline();
      pipeline.colorAdjustments.clarity = 0.3;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasClarity).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects color inversion', () => {
      const pipeline = createMockColorPipeline();
      pipeline.colorInversionEnabled = true;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasInversion).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects CDL when isDefaultCDL returns false', () => {
      vi.mocked(isDefaultCDL).mockReturnValueOnce(false);
      const ctx = createMockCtx();
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasCDL).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects curves when isDefaultCurves returns false', () => {
      vi.mocked(isDefaultCurves).mockReturnValueOnce(false);
      const ctx = createMockCtx();
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasCurves).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects color wheels active', () => {
      const ctx = createMockCtx({
        getColorWheels: vi.fn(() => ({ hasAdjustments: vi.fn(() => true), apply: vi.fn() })),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasColorWheels).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects HSL qualifier active', () => {
      const ctx = createMockCtx({
        getHSLQualifier: vi.fn(() => ({ isEnabled: vi.fn(() => true), apply: vi.fn() })),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasHSLQualifier).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects false color overlay', () => {
      const overlay = createMockOverlayManager();
      overlay.getFalseColor = vi.fn(() => ({ isEnabled: vi.fn(() => true), apply: vi.fn() }));
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasFalseColor).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects zebra stripes overlay', () => {
      const overlay = createMockOverlayManager();
      overlay.getZebraStripes = vi.fn(() => ({ isEnabled: vi.fn(() => true), apply: vi.fn() }));
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasZebras).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects clipping overlay', () => {
      const overlay = createMockOverlayManager();
      overlay.getClippingOverlay = vi.fn(() => ({ isEnabled: vi.fn(() => true), apply: vi.fn() }));
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasClippingOverlay).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects luminance visualization active', () => {
      const overlay = createMockOverlayManager();
      overlay.getLuminanceVisualization = vi.fn(() => ({ getMode: vi.fn(() => 'heatmap'), apply: vi.fn() }));
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasLuminanceVis).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('luminance visualization not active when mode is false-color', () => {
      const overlay = createMockOverlayManager();
      overlay.getLuminanceVisualization = vi.fn(() => ({ getMode: vi.fn(() => 'false-color'), apply: vi.fn() }));
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasLuminanceVis).toBe(false);
    });

    it('detects multiple effects active simultaneously', () => {
      const pipeline = createMockColorPipeline();
      pipeline.colorAdjustments.vibrance = 0.5;
      pipeline.colorInversionEnabled = true;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
        getChannelMode: vi.fn(() => 'red'),
        getFilterSettings: vi.fn(() => ({ sharpen: 30 })),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasVibrance).toBe(true);
      expect(flags.hasInversion).toBe(true);
      expect(flags.hasChannel).toBe(true);
      expect(flags.hasSharpen).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects noise reduction via mocked isNoiseReductionActive', () => {
      vi.mocked(isNoiseReductionActive).mockReturnValueOnce(true);
      const ctx = createMockCtx();
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasNoiseReduction).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects hue rotation via mocked isIdentityHueRotation', () => {
      vi.mocked(isIdentityHueRotation).mockReturnValueOnce(false);
      const ctx = createMockCtx();
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasHueRotation).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects display color management via mocked isDisplayStateActive', () => {
      vi.mocked(isDisplayStateActive).mockReturnValueOnce(true);
      const ctx = createMockCtx();
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasDisplayColorMgmt).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects deinterlace via mocked isDeinterlaceActive', () => {
      vi.mocked(isDeinterlaceActive).mockReturnValueOnce(true);
      const ctx = createMockCtx();
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasDeinterlace).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects film emulation via mocked isFilmEmulationActive', () => {
      vi.mocked(isFilmEmulationActive).mockReturnValueOnce(true);
      const ctx = createMockCtx();
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasFilmEmulation).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('detects stabilization when active and cropAmount > 0', () => {
      vi.mocked(isStabilizationActive).mockReturnValueOnce(true);
      const ctx = createMockCtx({
        getStabilizationParams: vi.fn(() => ({ enabled: true, cropAmount: 5 })),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasStabilization).toBe(true);
      expect(flags.anyActive).toBe(true);
    });

    it('stabilization not active when cropAmount is 0', () => {
      vi.mocked(isStabilizationActive).mockReturnValueOnce(true);
      const ctx = createMockCtx({
        getStabilizationParams: vi.fn(() => ({ enabled: true, cropAmount: 0 })),
      });
      const flags = detectActivePixelEffects(ctx);
      expect(flags.hasStabilization).toBe(false);
    });
  });

  describe('compositeImageDataOverBackground', () => {
    it('uses putImageData directly when pattern is black', () => {
      const mockImageCtx = createMockCanvasCtx();
      const ctx = createMockCtx({
        getImageCtx: vi.fn(() => mockImageCtx) as any,
        getBackgroundPatternState: vi.fn(() => ({
          pattern: 'black',
          checkerSize: 'medium' as const,
          customColor: '#000000',
        })),
      });
      const imageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as unknown as ImageData;

      compositeImageDataOverBackground(ctx, imageData, 1, 1);

      expect(mockImageCtx.putImageData).toHaveBeenCalledWith(imageData, 0, 0);
      expect(mockImageCtx.drawImage).not.toHaveBeenCalled();
    });

    it('creates temp canvas for non-black pattern when no temp canvas exists', () => {
      const mockImageCtx = createMockCanvasCtx();
      const mockTempCtx = createMockCanvasCtx();
      const mockTempCanvas = { width: 0, height: 0 } as HTMLCanvasElement;

      const origCreateElement = globalThis.document?.createElement;
      globalThis.document = { createElement: vi.fn(() => mockTempCanvas) } as any;

      vi.mocked(safeCanvasContext2D).mockReturnValueOnce(mockTempCtx as any);

      const ctx = createMockCtx({
        getImageCtx: vi.fn(() => mockImageCtx) as any,
        getBackgroundPatternState: vi.fn(() => ({
          pattern: 'checker',
          checkerSize: 'medium' as const,
          customColor: '#000000',
        })),
        getBgCompositeTempCanvas: vi.fn(() => null),
        getBgCompositeTempCtx: vi.fn(() => null),
      });

      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 } as unknown as ImageData;
      compositeImageDataOverBackground(ctx, imageData, 2, 2);

      expect(ctx.setBgCompositeTempCanvas).toHaveBeenCalled();
      expect(ctx.setBgCompositeTempCtx).toHaveBeenCalled();
      expect(mockTempCtx.putImageData).toHaveBeenCalledWith(imageData, 0, 0);
      expect(mockImageCtx.drawImage).toHaveBeenCalledWith(mockTempCanvas, 0, 0);

      if (origCreateElement) {
        globalThis.document = { createElement: origCreateElement } as any;
      }
    });

    it('reuses existing temp canvas and resizes if needed', () => {
      const mockImageCtx = createMockCanvasCtx();
      const mockTempCtx = createMockCanvasCtx();
      const mockTempCanvas = { width: 10, height: 10 } as HTMLCanvasElement;

      const ctx = createMockCtx({
        getImageCtx: vi.fn(() => mockImageCtx) as any,
        getBackgroundPatternState: vi.fn(() => ({
          pattern: 'checker',
          checkerSize: 'medium' as const,
          customColor: '#000000',
        })),
        getBgCompositeTempCanvas: vi.fn(() => mockTempCanvas),
        getBgCompositeTempCtx: vi.fn(() => mockTempCtx),
      });

      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 } as unknown as ImageData;
      compositeImageDataOverBackground(ctx, imageData, 2, 2);

      expect(mockTempCanvas.width).toBe(2);
      expect(mockTempCanvas.height).toBe(2);
      expect(mockTempCtx.putImageData).toHaveBeenCalledWith(imageData, 0, 0);
      expect(mockImageCtx.drawImage).toHaveBeenCalledWith(mockTempCanvas, 0, 0);
    });

    it('falls back to putImageData when safeCanvasContext2D returns null', () => {
      const mockImageCtx = createMockCanvasCtx();
      const mockTempCanvas = { width: 0, height: 0 } as HTMLCanvasElement;

      globalThis.document = { createElement: vi.fn(() => mockTempCanvas) } as any;

      vi.mocked(safeCanvasContext2D).mockReturnValueOnce(null as any);

      const ctx = createMockCtx({
        getImageCtx: vi.fn(() => mockImageCtx) as any,
        getBackgroundPatternState: vi.fn(() => ({
          pattern: 'checker',
          checkerSize: 'medium' as const,
          customColor: '#000000',
        })),
        getBgCompositeTempCanvas: vi.fn(() => null),
        getBgCompositeTempCtx: vi.fn(() => null),
      });

      const imageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as unknown as ImageData;
      compositeImageDataOverBackground(ctx, imageData, 1, 1);

      expect(mockImageCtx.putImageData).toHaveBeenCalledWith(imageData, 0, 0);
    });

    it('does not resize temp canvas when dimensions match', () => {
      const mockImageCtx = createMockCanvasCtx();
      const mockTempCtx = createMockCanvasCtx();
      const mockTempCanvas = { _width: 2, _height: 2 } as unknown as HTMLCanvasElement;
      const widthSetter = vi.fn();
      const heightSetter = vi.fn();
      Object.defineProperty(mockTempCanvas, 'width', {
        get() {
          return this._width;
        },
        set: widthSetter,
      });
      Object.defineProperty(mockTempCanvas, 'height', {
        get() {
          return this._height;
        },
        set: heightSetter,
      });

      const ctx = createMockCtx({
        getImageCtx: vi.fn(() => mockImageCtx) as any,
        getBackgroundPatternState: vi.fn(() => ({
          pattern: 'checker',
          checkerSize: 'medium' as const,
          customColor: '#000000',
        })),
        getBgCompositeTempCanvas: vi.fn(() => mockTempCanvas),
        getBgCompositeTempCtx: vi.fn(() => mockTempCtx),
      });

      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 } as unknown as ImageData;
      compositeImageDataOverBackground(ctx, imageData, 2, 2);

      // Width/height setters must NOT have been called since dimensions already match
      expect(widthSetter).not.toHaveBeenCalled();
      expect(heightSetter).not.toHaveBeenCalled();
    });
  });

  describe('applyBatchedPixelEffects', () => {
    it('returns early when no effects are active', () => {
      const canvasCtx = createMockCanvasCtx();
      const ctx = createMockCtx();

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(canvasCtx.getImageData).not.toHaveBeenCalled();
      expect(canvasCtx.putImageData).not.toHaveBeenCalled();
    });

    it('calls getImageData and putImageData with correct imageData when effects are active', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const pipeline = createMockColorPipeline();
      pipeline.colorInversionEnabled = true;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(canvasCtx.getImageData).toHaveBeenCalledWith(0, 0, 2, 2);
      expect(canvasCtx.putImageData).toHaveBeenCalledWith(imageData, 0, 0);
    });

    it('applies color inversion with the imageData when enabled', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const pipeline = createMockColorPipeline();
      pipeline.colorInversionEnabled = true;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(applyColorInversion).toHaveBeenCalledWith(imageData);
    });

    it('applies channel isolation with imageData and channel mode when not rgb', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const ctx = createMockCtx({
        getChannelMode: vi.fn(() => 'red'),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(applyChannelIsolation).toHaveBeenCalledWith(imageData, 'red');
    });

    it('applies sharpen via CPU with correct args when sharpen > 0 and no WebGL processor', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const effectProcessor = {
        applyClarity: vi.fn(),
        applySharpenCPU: vi.fn(),
        applyClarityChunked: vi.fn(),
        applySharpenCPUChunked: vi.fn(),
      };
      const ctx = createMockCtx({
        getFilterSettings: vi.fn(() => ({ sharpen: 50 })),
        getEffectProcessor: vi.fn(() => effectProcessor),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(effectProcessor.applySharpenCPU).toHaveBeenCalledWith(imageData, 2, 2, 0.5, false);
    });

    it('applies sharpen via WebGL processor with correct args when available and ready', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const sharpenProcessor = {
        isReady: vi.fn(() => true),
        applyInPlace: vi.fn(),
      };
      const ctx = createMockCtx({
        getFilterSettings: vi.fn(() => ({ sharpen: 50 })),
        getSharpenProcessor: vi.fn(() => sharpenProcessor),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(sharpenProcessor.applyInPlace).toHaveBeenCalledWith(imageData, 50);
    });

    it('applies highlights/shadows with imageData and params when adjustments are non-zero', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const pipeline = createMockColorPipeline();
      pipeline.colorAdjustments.highlights = 0.5;
      pipeline.colorAdjustments.shadows = -0.2;
      pipeline.colorAdjustments.whites = 0.1;
      pipeline.colorAdjustments.blacks = -0.1;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(applyHighlightsShadows).toHaveBeenCalledWith(imageData, {
        highlights: 0.5,
        shadows: -0.2,
        whites: 0.1,
        blacks: -0.1,
      });
    });

    it('applies vibrance with imageData and params when non-zero', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const pipeline = createMockColorPipeline();
      pipeline.colorAdjustments.vibrance = 0.3;
      pipeline.colorAdjustments.vibranceSkinProtection = true;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(applyVibrance).toHaveBeenCalledWith(imageData, {
        vibrance: 0.3,
        skinProtection: true,
      });
    });

    it('applies false color overlay with imageData when enabled', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const falseColor = { isEnabled: vi.fn(() => true), apply: vi.fn() };
      const overlay = createMockOverlayManager();
      overlay.getFalseColor = vi.fn(() => falseColor);
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(falseColor.apply).toHaveBeenCalledWith(imageData);
    });

    it('applies zebra stripes with imageData when enabled and no false color or luminance vis', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const zebras = { isEnabled: vi.fn(() => true), apply: vi.fn() };
      const overlay = createMockOverlayManager();
      overlay.getZebraStripes = vi.fn(() => zebras);
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(zebras.apply).toHaveBeenCalledWith(imageData);
    });

    it('does not apply zebras when false color is active', () => {
      const canvasCtx = createMockCanvasCtx();
      const falseColor = { isEnabled: vi.fn(() => true), apply: vi.fn() };
      const zebras = { isEnabled: vi.fn(() => true), apply: vi.fn() };
      const overlay = createMockOverlayManager();
      overlay.getFalseColor = vi.fn(() => falseColor);
      overlay.getZebraStripes = vi.fn(() => zebras);
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(falseColor.apply).toHaveBeenCalled();
      expect(zebras.apply).not.toHaveBeenCalled();
    });

    it('does not apply clipping overlay when zebras are active', () => {
      const canvasCtx = createMockCanvasCtx();
      const zebras = { isEnabled: vi.fn(() => true), apply: vi.fn() };
      const clipping = { isEnabled: vi.fn(() => true), apply: vi.fn() };
      const overlay = createMockOverlayManager();
      overlay.getZebraStripes = vi.fn(() => zebras);
      overlay.getClippingOverlay = vi.fn(() => clipping);
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(zebras.apply).toHaveBeenCalled();
      expect(clipping.apply).not.toHaveBeenCalled();
    });
  });

  describe('applyLightweightEffects', () => {
    it('returns early when no lightweight effects are active', () => {
      const canvasCtx = createMockCanvasCtx();
      const ctx = createMockCtx();

      applyLightweightEffects(ctx, canvasCtx as any, 2, 2);

      expect(canvasCtx.getImageData).not.toHaveBeenCalled();
      expect(canvasCtx.putImageData).not.toHaveBeenCalled();
    });

    it('applies channel isolation with imageData and mode for non-rgb mode', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const ctx = createMockCtx({
        getChannelMode: vi.fn(() => 'green'),
      });

      applyLightweightEffects(ctx, canvasCtx as any, 2, 2);

      expect(canvasCtx.getImageData).toHaveBeenCalledWith(0, 0, 2, 2);
      expect(canvasCtx.putImageData).toHaveBeenCalledWith(imageData, 0, 0);
      expect(applyChannelIsolation).toHaveBeenCalledWith(imageData, 'green');
    });

    it('applies false color with imageData when enabled', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const falseColor = { isEnabled: vi.fn(() => true), apply: vi.fn() };
      const overlay = createMockOverlayManager();
      overlay.getFalseColor = vi.fn(() => falseColor);
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });

      applyLightweightEffects(ctx, canvasCtx as any, 2, 2);

      expect(canvasCtx.getImageData).toHaveBeenCalledWith(0, 0, 2, 2);
      expect(falseColor.apply).toHaveBeenCalledWith(imageData);
    });

    it('applies zebra stripes with imageData when enabled and no false color or luminance vis', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const zebras = { isEnabled: vi.fn(() => true), apply: vi.fn() };
      const overlay = createMockOverlayManager();
      overlay.getZebraStripes = vi.fn(() => zebras);
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });

      applyLightweightEffects(ctx, canvasCtx as any, 2, 2);

      expect(zebras.apply).toHaveBeenCalledWith(imageData);
    });

    it('applies clipping overlay with imageData when enabled and no false color, luminance vis, or zebras', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const clipping = { isEnabled: vi.fn(() => true), apply: vi.fn() };
      const overlay = createMockOverlayManager();
      overlay.getClippingOverlay = vi.fn(() => clipping);
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });

      applyLightweightEffects(ctx, canvasCtx as any, 2, 2);

      expect(clipping.apply).toHaveBeenCalledWith(imageData);
    });

    it('does not apply zebras when false color is active', () => {
      const falseColor = { isEnabled: vi.fn(() => true), apply: vi.fn() };
      const zebras = { isEnabled: vi.fn(() => true), apply: vi.fn() };
      const overlay = createMockOverlayManager();
      overlay.getFalseColor = vi.fn(() => falseColor);
      overlay.getZebraStripes = vi.fn(() => zebras);
      const canvasCtx = createMockCanvasCtx();
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });

      applyLightweightEffects(ctx, canvasCtx as any, 2, 2);

      expect(falseColor.apply).toHaveBeenCalled();
      expect(zebras.apply).not.toHaveBeenCalled();
    });

    it('applies luminance visualization over false color when active', () => {
      const falseColor = { isEnabled: vi.fn(() => true), apply: vi.fn() };
      const lumVis = { getMode: vi.fn(() => 'heatmap'), apply: vi.fn() };
      const overlay = createMockOverlayManager();
      overlay.getFalseColor = vi.fn(() => falseColor);
      overlay.getLuminanceVisualization = vi.fn(() => lumVis);
      const canvasCtx = createMockCanvasCtx();
      const ctx = createMockCtx({
        getOverlayManager: vi.fn(() => overlay),
      });

      applyLightweightEffects(ctx, canvasCtx as any, 2, 2);

      expect(lumVis.apply).toHaveBeenCalled();
      expect(falseColor.apply).not.toHaveBeenCalled();
    });

    it('applies display color management with imageData and state when active', () => {
      vi.mocked(isDisplayStateActive).mockReturnValue(true);

      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const pipeline = createMockColorPipeline();
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });

      applyLightweightEffects(ctx, canvasCtx as any, 2, 2);

      expect(canvasCtx.getImageData).toHaveBeenCalledWith(0, 0, 2, 2);
      expect(applyDisplayColorManagementToImageData).toHaveBeenCalledWith(imageData, pipeline.displayColorState);

      vi.mocked(isDisplayStateActive).mockReturnValue(false);
    });
  });

  describe('applyBatchedPixelEffectsAsync', () => {
    it('returns early when no effects are active', async () => {
      const canvasCtx = createMockCanvasCtx();
      const ctx = createMockCtx();

      await applyBatchedPixelEffectsAsync(ctx, canvasCtx as any, 2, 2, 1, false);

      expect(canvasCtx.getImageData).not.toHaveBeenCalled();
      expect(canvasCtx.putImageData).not.toHaveBeenCalled();
    });

    it('calls getImageData and putImageData with correct imageData when effects are active', async () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const pipeline = createMockColorPipeline();
      pipeline.colorInversionEnabled = true;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });

      await applyBatchedPixelEffectsAsync(ctx, canvasCtx as any, 2, 2, 1, false);

      expect(canvasCtx.getImageData).toHaveBeenCalledWith(0, 0, 2, 2);
      expect(canvasCtx.putImageData).toHaveBeenCalledWith(imageData, 0, 0);
    });

    it('aborts when generation changes mid-processing', async () => {
      const canvasCtx = createMockCanvasCtx();
      const pipeline = createMockColorPipeline();
      pipeline.colorAdjustments.highlights = 0.5;

      let callCount = 0;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
        getAsyncEffectsGeneration: vi.fn(() => {
          callCount++;
          // Return mismatched generation after first check
          return callCount > 1 ? 999 : 1;
        }),
      });

      await applyBatchedPixelEffectsAsync(ctx, canvasCtx as any, 2, 2, 1, false);

      // putImageData should NOT be called because generation changed
      expect(canvasCtx.putImageData).not.toHaveBeenCalled();
    });

    it('applies crop clipping when cropClipActive is true', async () => {
      const canvasCtx = createMockCanvasCtx();
      const pipeline = createMockColorPipeline();
      pipeline.colorInversionEnabled = true;
      const cropManager = { clearOutsideCropRegion: vi.fn() };
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
        getCropManager: vi.fn(() => cropManager),
      });

      await applyBatchedPixelEffectsAsync(ctx, canvasCtx as any, 2, 2, 1, true);

      expect(cropManager.clearOutsideCropRegion).toHaveBeenCalledWith(canvasCtx, 2, 2);
    });

    it('does not apply crop clipping when cropClipActive is false', async () => {
      const canvasCtx = createMockCanvasCtx();
      const pipeline = createMockColorPipeline();
      pipeline.colorInversionEnabled = true;
      const cropManager = { clearOutsideCropRegion: vi.fn() };
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
        getCropManager: vi.fn(() => cropManager),
      });

      await applyBatchedPixelEffectsAsync(ctx, canvasCtx as any, 2, 2, 1, false);

      expect(cropManager.clearOutsideCropRegion).not.toHaveBeenCalled();
    });

    it('catches and logs errors', async () => {
      const canvasCtx = {
        getImageData: vi.fn(() => {
          throw new Error('test error');
        }),
        putImageData: vi.fn(),
      };
      const pipeline = createMockColorPipeline();
      pipeline.colorInversionEnabled = true;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await applyBatchedPixelEffectsAsync(ctx, canvasCtx as any, 2, 2, 1, false);

      expect(consoleSpy).toHaveBeenCalledWith('Async batched pixel effects processing failed:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('applies color inversion with imageData in async path', async () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const pipeline = createMockColorPipeline();
      pipeline.colorInversionEnabled = true;
      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
      });

      await applyBatchedPixelEffectsAsync(ctx, canvasCtx as any, 2, 2, 1, false);

      expect(applyColorInversion).toHaveBeenCalledWith(imageData);
    });
  });

  describe('effect pipeline ordering', () => {
    it('applies effects in the correct pipeline order', () => {
      // Enable many effects to verify ordering
      vi.mocked(isDefaultCDL).mockReturnValueOnce(false);
      vi.mocked(isDefaultCurves).mockReturnValueOnce(false);
      vi.mocked(isIdentityHueRotation).mockReturnValueOnce(false);
      vi.mocked(isNoiseReductionActive).mockReturnValueOnce(true);
      vi.mocked(isFilmEmulationActive).mockReturnValueOnce(true);
      vi.mocked(isDisplayStateActive).mockReturnValueOnce(true);

      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);

      const pipeline = createMockColorPipeline();
      pipeline.colorAdjustments.highlights = 0.5;
      pipeline.colorAdjustments.vibrance = 0.3;
      pipeline.colorInversionEnabled = true;
      pipeline.toneMappingState = { enabled: true, operator: 'reinhard' };

      const colorWheelsApply = vi.fn();
      const hslApply = vi.fn();
      const effectProcessor = {
        applyClarity: vi.fn(),
        applySharpenCPU: vi.fn(),
        applyClarityChunked: vi.fn(),
        applySharpenCPUChunked: vi.fn(),
      };

      const ctx = createMockCtx({
        getColorPipeline: vi.fn(() => pipeline),
        getFilterSettings: vi.fn(() => ({ sharpen: 50 })),
        getChannelMode: vi.fn(() => 'red'),
        getColorWheels: vi.fn(() => ({ hasAdjustments: vi.fn(() => true), apply: colorWheelsApply })),
        getHSLQualifier: vi.fn(() => ({ isEnabled: vi.fn(() => true), apply: hslApply })),
        getEffectProcessor: vi.fn(() => effectProcessor),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      // Collect invocation orders of each effect
      const highlightsShadowsOrder = vi.mocked(applyHighlightsShadows).mock.invocationCallOrder[0]!;
      const vibranceOrder = vi.mocked(applyVibrance).mock.invocationCallOrder[0]!;
      // hue rotation calls applyHueRotationInto per-pixel; we skip its order tracking
      const colorWheelsOrder = colorWheelsApply.mock.invocationCallOrder[0]!;
      const cdlOrder = vi.mocked(applyCDLToImageData).mock.invocationCallOrder[0]!;
      const curvesOrder = pipeline.curveLUTCache.apply.mock.invocationCallOrder[0]!;
      const hslOrder = hslApply.mock.invocationCallOrder[0]!;
      const toneMappingOrder = vi.mocked(applyToneMappingWithParams).mock.invocationCallOrder[0]!;
      const inversionOrder = vi.mocked(applyColorInversion).mock.invocationCallOrder[0]!;
      const filmEmulationOrder = vi.mocked(applyFilmEmulation).mock.invocationCallOrder[0]!;
      const noiseReductionOrder = vi.mocked(applyNoiseReduction).mock.invocationCallOrder[0]!;
      const sharpenOrder = effectProcessor.applySharpenCPU.mock.invocationCallOrder[0]!;
      const channelIsolationOrder = vi.mocked(applyChannelIsolation).mock.invocationCallOrder[0]!;
      const displayColorMgmtOrder = vi.mocked(applyDisplayColorManagementToImageData).mock.invocationCallOrder[0]!;

      // Verify the pipeline ordering
      expect(highlightsShadowsOrder).toBeLessThan(vibranceOrder);
      expect(vibranceOrder).toBeLessThan(colorWheelsOrder);
      expect(colorWheelsOrder).toBeLessThan(cdlOrder);
      expect(cdlOrder).toBeLessThan(curvesOrder);
      expect(curvesOrder).toBeLessThan(hslOrder);
      expect(hslOrder).toBeLessThan(toneMappingOrder);
      expect(toneMappingOrder).toBeLessThan(inversionOrder);
      expect(inversionOrder).toBeLessThan(filmEmulationOrder);
      expect(filmEmulationOrder).toBeLessThan(noiseReductionOrder);
      expect(noiseReductionOrder).toBeLessThan(sharpenOrder);
      expect(sharpenOrder).toBeLessThan(channelIsolationOrder);
      expect(channelIsolationOrder).toBeLessThan(displayColorMgmtOrder);
    });
  });

  describe('sharpen processor fallback', () => {
    it('falls back to CPU sharpen when sharpenProcessor exists but isReady() returns false', () => {
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const effectProcessor = {
        applyClarity: vi.fn(),
        applySharpenCPU: vi.fn(),
        applyClarityChunked: vi.fn(),
        applySharpenCPUChunked: vi.fn(),
      };
      const sharpenProcessor = {
        isReady: vi.fn(() => false),
        applyInPlace: vi.fn(),
      };
      const ctx = createMockCtx({
        getFilterSettings: vi.fn(() => ({ sharpen: 50 })),
        getEffectProcessor: vi.fn(() => effectProcessor),
        getSharpenProcessor: vi.fn(() => sharpenProcessor),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(sharpenProcessor.applyInPlace).not.toHaveBeenCalled();
      expect(effectProcessor.applySharpenCPU).toHaveBeenCalledWith(imageData, 2, 2, 0.5, false);
    });
  });

  describe('noise reduction processor branching', () => {
    it('uses noiseReductionProcessor.processInPlace when processor exists', () => {
      vi.mocked(isNoiseReductionActive).mockReturnValueOnce(true);
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const noiseReductionParams = { strength: 50 };
      const noiseReductionProcessor = { processInPlace: vi.fn() };
      const ctx = createMockCtx({
        getNoiseReductionParams: vi.fn(() => noiseReductionParams),
        getNoiseReductionProcessor: vi.fn(() => noiseReductionProcessor),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(noiseReductionProcessor.processInPlace).toHaveBeenCalledWith(imageData, noiseReductionParams);
      expect(applyNoiseReduction).not.toHaveBeenCalled();
    });

    it('falls back to applyNoiseReduction when processor is null', () => {
      vi.mocked(isNoiseReductionActive).mockReturnValueOnce(true);
      const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
      const canvasCtx = createMockCanvasCtx();
      canvasCtx.getImageData.mockReturnValue(imageData);
      const noiseReductionParams = { strength: 50 };
      const ctx = createMockCtx({
        getNoiseReductionParams: vi.fn(() => noiseReductionParams),
        getNoiseReductionProcessor: vi.fn(() => null),
      });

      applyBatchedPixelEffects(ctx, canvasCtx as any, 2, 2);

      expect(applyNoiseReduction).toHaveBeenCalledWith(imageData, noiseReductionParams);
    });
  });
});
