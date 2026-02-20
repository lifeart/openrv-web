/**
 * OCIOProcessor WASM Integration Tests
 *
 * Tests the OCIOProcessor's mode switching, JS fallback dispatch, and cleanup logic.
 * Tests that merely verify mock WASM return values have been removed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OCIOProcessor, type OCIOProcessingMode } from './OCIOProcessor';
import { OCIOWasmPipeline } from './wasm/OCIOWasmPipeline';
import type { OCIOWasmExports, OCIOWasmFactory } from './wasm/OCIOWasmModule';

// ---------------------------------------------------------------------------
// Mock WASM pipeline (minimal — only needed as infrastructure for mode tests)
// ---------------------------------------------------------------------------

const SAMPLE_GLSL = `
uniform sampler3D ocio_lut3d_Sampler;
vec4 OCIODisplay(vec4 inPixel) {
  vec4 out_pixel = inPixel;
  out_pixel.rgb = texture3D(ocio_lut3d_Sampler, out_pixel.rgb).rgb;
  return out_pixel;
}
`;

function createMockExports(): OCIOWasmExports {
  let nextHandle = 1;
  return {
    ocioLoadConfig: vi.fn(() => nextHandle++),
    ocioDestroyConfig: vi.fn(),
    ocioGetDisplays: vi.fn(() => '["sRGB","Rec.709"]'),
    ocioGetViews: vi.fn(() => '["ACES 1.0 SDR-video","Raw"]'),
    ocioGetColorSpaces: vi.fn(() => '["ACEScg","sRGB","Linear sRGB"]'),
    ocioGetLooks: vi.fn(() => '["None","Filmic"]'),
    ocioGetProcessor: vi.fn(() => nextHandle++),
    ocioGetDisplayProcessor: vi.fn(() => nextHandle++),
    ocioGenerateShaderCode: vi.fn(() => SAMPLE_GLSL),
    ocioGetProcessorLUT3D: vi.fn((_, size: number) => new Float32Array(size * size * size * 3)),
    ocioDestroyProcessor: vi.fn(),
    ocioApplyRGB: vi.fn(() => new Float32Array([0.25, 0.50, 0.75])),
    ocioGetVersion: vi.fn(() => '2.3.1'),
  };
}

function createMockFactory(exports?: OCIOWasmExports): OCIOWasmFactory {
  const exp = exports ?? createMockExports();
  return vi.fn(() => Promise.resolve(exp));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OCIOProcessor WASM Integration', () => {
  let processor: OCIOProcessor;
  let mockExports: OCIOWasmExports;
  let pipeline: OCIOWasmPipeline;

  beforeEach(async () => {
    processor = new OCIOProcessor();
    mockExports = createMockExports();
    const factory = createMockFactory(mockExports);
    pipeline = new OCIOWasmPipeline({ factory });
    await pipeline.init();
    pipeline.loadConfig('yaml', 'test');
  });

  afterEach(() => {
    processor.dispose();
    pipeline.dispose();
  });

  // -----------------------------------------------------------------------
  // Mode Switching (real JS state-machine logic)
  // -----------------------------------------------------------------------

  describe('mode switching', () => {
    it('PROC-WASM-001: starts in JS mode', () => {
      expect(processor.getProcessingMode()).toBe('js');
      expect(processor.isWasmActive()).toBe(false);
    });

    it('PROC-WASM-002: setWasmPipeline switches to WASM mode', () => {
      const modes: Array<{ mode: OCIOProcessingMode; reason: string }> = [];
      processor.on('processingModeChanged', e => modes.push(e));

      processor.setWasmPipeline(pipeline);

      expect(processor.getProcessingMode()).toBe('wasm');
      expect(processor.isWasmActive()).toBe(true);
      expect(modes).toHaveLength(1);
      expect(modes[0]!.mode).toBe('wasm');
    });

    it('PROC-WASM-003: setWasmPipeline(null) switches back to JS mode', () => {
      processor.setWasmPipeline(pipeline);
      expect(processor.getProcessingMode()).toBe('wasm');

      processor.setWasmPipeline(null);
      expect(processor.getProcessingMode()).toBe('js');
      expect(processor.isWasmActive()).toBe(false);
    });

    it('PROC-WASM-004: uninitialized pipeline stays in JS mode', () => {
      const uninitPipeline = new OCIOWasmPipeline({ factory: createMockFactory() });
      // Not calling init()

      processor.setWasmPipeline(uninitPipeline);
      expect(processor.getProcessingMode()).toBe('js');
      expect(processor.isWasmActive()).toBe(false);

      uninitPipeline.dispose();
    });

    it('PROC-WASM-005: getWasmPipeline returns attached pipeline', () => {
      expect(processor.getWasmPipeline()).toBeNull();

      processor.setWasmPipeline(pipeline);
      expect(processor.getWasmPipeline()).toBe(pipeline);
    });
  });

  // -----------------------------------------------------------------------
  // buildWasmPipeline — guard / null / event logic (no mock-value assertions)
  // -----------------------------------------------------------------------

  describe('WASM pipeline building', () => {
    beforeEach(() => {
      processor.setWasmPipeline(pipeline);
      processor.setState({
        inputColorSpace: 'ACEScg',
        display: 'sRGB',
        view: 'ACES 1.0 SDR-video',
        look: 'None',
      });
    });

    it('PROC-WASM-012: buildWasmPipeline returns null without pipeline', () => {
      processor.setWasmPipeline(null);
      const result = processor.buildWasmPipeline();
      expect(result).toBeNull();
    });

    it('PROC-WASM-013: getWasmResult returns last result', () => {
      expect(processor.getWasmResult()).toBeNull();

      processor.buildWasmPipeline();
      expect(processor.getWasmResult()).not.toBeNull();
    });

    it('PROC-WASM-014: buildWasmPipeline uses Auto input color space', () => {
      processor.setState({
        inputColorSpace: 'Auto',
        detectedColorSpace: 'Linear sRGB',
        display: 'sRGB',
        view: 'ACES 1.0 SDR-video',
      });

      processor.buildWasmPipeline();

      // Should have called with 'Linear sRGB' (the detected space)
      expect(mockExports.ocioGetDisplayProcessor).toHaveBeenCalledWith(
        expect.any(Number),
        'Linear sRGB',
        'sRGB',
        'ACES 1.0 SDR-video',
        '',
      );
    });

    it('PROC-WASM-015: buildWasmPipeline defaults Auto to sRGB when no detection', () => {
      processor.setState({
        inputColorSpace: 'Auto',
        detectedColorSpace: null,
        display: 'sRGB',
        view: 'ACES 1.0 SDR-video',
      });

      processor.buildWasmPipeline();

      expect(mockExports.ocioGetDisplayProcessor).toHaveBeenCalledWith(
        expect.any(Number),
        'sRGB',
        'sRGB',
        'ACES 1.0 SDR-video',
        '',
      );
    });

    it('PROC-WASM-016: buildWasmPipeline strips "None" look', () => {
      processor.setState({
        inputColorSpace: 'ACEScg',
        display: 'sRGB',
        view: 'ACES 1.0 SDR-video',
        look: 'None',
      });

      processor.buildWasmPipeline();

      expect(mockExports.ocioGetDisplayProcessor).toHaveBeenCalledWith(
        expect.any(Number),
        'ACEScg',
        'sRGB',
        'ACES 1.0 SDR-video',
        '', // "None" converted to empty string
      );
    });

    it('PROC-WASM-017: buildWasmPipeline passes non-None look through', () => {
      processor.setState({
        inputColorSpace: 'ACEScg',
        display: 'sRGB',
        view: 'ACES 1.0 SDR-video',
        look: 'Filmic',
      });

      processor.buildWasmPipeline();

      expect(mockExports.ocioGetDisplayProcessor).toHaveBeenCalledWith(
        expect.any(Number),
        'ACEScg',
        'sRGB',
        'ACES 1.0 SDR-video',
        'Filmic',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Auto Methods — JS fallback dispatch
  // -----------------------------------------------------------------------

  describe('auto methods', () => {
    it('PROC-WASM-021: bakeTo3DLUTAuto falls back to JS when WASM not available', () => {
      // No WASM pipeline attached
      const lut = processor.bakeTo3DLUTAuto(17);
      // Should use JS baking path
      expect(lut.size).toBe(17);
      expect(lut.data.length).toBe(17 * 17 * 17 * 3);
      // Verify WASM was NOT called
      expect(mockExports.ocioGetProcessorLUT3D).not.toHaveBeenCalled();
    });

    it('PROC-WASM-023: transformColorAuto falls back to JS when WASM not available', () => {
      // No WASM pipeline
      const result = processor.transformColorAuto(0.5, 0.5, 0.5);
      // JS transform result (identity-ish for default config)
      expect(result).toBeDefined();
      expect(result.length).toBe(3);
      expect(mockExports.ocioApplyRGB).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  describe('cleanup', () => {
    it('PROC-WASM-030: dispose clears WASM state', () => {
      processor.setWasmPipeline(pipeline);
      processor.buildWasmPipeline();

      processor.dispose();

      expect(processor.getProcessingMode()).toBe('js');
      expect(processor.getWasmPipeline()).toBeNull();
      expect(processor.getWasmResult()).toBeNull();
    });
  });
});
