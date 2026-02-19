/**
 * OCIOWasmPipeline Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OCIOWasmPipeline } from './OCIOWasmPipeline';
import type { OCIOPipelineResult, OCIOPipelineMode } from './OCIOWasmPipeline';
import type { OCIOWasmExports, OCIOWasmFactory } from './OCIOWasmModule';

// ---------------------------------------------------------------------------
// Mock WASM exports
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
    ocioGetProcessorLUT3D: vi.fn((_, size: number) => {
      const data = new Float32Array(size * size * size * 3);
      // Fill with identity LUT pattern for testing
      for (let b = 0; b < size; b++) {
        for (let g = 0; g < size; g++) {
          for (let r = 0; r < size; r++) {
            const idx = (b * size * size + g * size + r) * 3;
            data[idx] = r / (size - 1);
            data[idx + 1] = g / (size - 1);
            data[idx + 2] = b / (size - 1);
          }
        }
      }
      return data;
    }),
    ocioDestroyProcessor: vi.fn(),
    ocioApplyRGB: vi.fn(() => new Float32Array([0.5, 0.6, 0.7])),
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

describe('OCIOWasmPipeline', () => {
  let mockExports: OCIOWasmExports;
  let factory: OCIOWasmFactory;
  let pipeline: OCIOWasmPipeline;

  beforeEach(() => {
    mockExports = createMockExports();
    factory = createMockFactory(mockExports);
    pipeline = new OCIOWasmPipeline({ factory });
  });

  afterEach(() => {
    pipeline.dispose();
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('lifecycle', () => {
    it('PIPE-001: starts in off mode and not ready', () => {
      expect(pipeline.getMode()).toBe('off');
      expect(pipeline.isReady()).toBe(false);
      expect(pipeline.getCurrentResult()).toBeNull();
    });

    it('PIPE-002: init transitions to wasm mode when WASM succeeds', async () => {
      const modes: OCIOPipelineMode[] = [];
      pipeline.on('modeChanged', e => modes.push(e.mode));

      await pipeline.init();

      expect(pipeline.isReady()).toBe(true);
      expect(pipeline.getMode()).toBe('wasm');
      expect(modes).toContain('wasm');
    });

    it('PIPE-003: init falls back to baked mode when WASM fails', async () => {
      const failFactory = vi.fn(() => Promise.reject(new Error('WASM load failed')));
      const failPipeline = new OCIOWasmPipeline({ factory: failFactory });
      const errors: Array<{ message: string; phase: string }> = [];
      failPipeline.on('error', e => errors.push(e));

      await failPipeline.init();

      expect(failPipeline.isReady()).toBe(false);
      expect(failPipeline.getMode()).toBe('baked');
      expect(errors).toHaveLength(1);
      expect(errors[0]!.phase).toBe('init');

      failPipeline.dispose();
    });

    it('PIPE-004: dispose cleans up and throws on subsequent use', async () => {
      await pipeline.init();
      pipeline.dispose();

      expect(() => pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video'))
        .toThrow('disposed');
    });

    it('PIPE-005: double dispose is safe', async () => {
      await pipeline.init();
      pipeline.dispose();
      expect(() => pipeline.dispose()).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Config Management
  // -----------------------------------------------------------------------

  describe('config management', () => {
    beforeEach(async () => {
      await pipeline.init();
    });

    it('PIPE-CFG-001: loadConfig delegates to bridge', () => {
      pipeline.loadConfig('ocio_profile_version: 2\n', 'ACES');
      expect(mockExports.ocioLoadConfig).toHaveBeenCalledWith('ocio_profile_version: 2\n');
    });

    it('PIPE-CFG-002: getDisplays returns available displays', () => {
      pipeline.loadConfig('yaml', 'test');
      const displays = pipeline.getDisplays();
      expect(displays).toEqual(['sRGB', 'Rec.709']);
    });

    it('PIPE-CFG-003: getViews returns views for display', () => {
      pipeline.loadConfig('yaml', 'test');
      const views = pipeline.getViews('sRGB');
      expect(views).toEqual(['ACES 1.0 SDR-video', 'Raw']);
    });

    it('PIPE-CFG-004: getColorSpaces returns available color spaces', () => {
      pipeline.loadConfig('yaml', 'test');
      const spaces = pipeline.getColorSpaces();
      expect(spaces).toEqual(['ACEScg', 'sRGB', 'Linear sRGB']);
    });

    it('PIPE-CFG-005: loadConfig clears current result', () => {
      pipeline.loadConfig('yaml', 'test');
      pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      expect(pipeline.getCurrentResult()).not.toBeNull();

      pipeline.loadConfig('yaml2', 'test2');
      expect(pipeline.getCurrentResult()).toBeNull();
    });

    it('PIPE-CFG-006: loadConfig emits error when WASM not ready', () => {
      const notReadyPipeline = new OCIOWasmPipeline({ factory });
      const errors: Array<{ message: string; phase: string }> = [];
      notReadyPipeline.on('error', e => errors.push(e));

      notReadyPipeline.loadConfig('yaml', 'test');
      expect(errors).toHaveLength(1);
      expect(errors[0]!.phase).toBe('loadConfig');

      notReadyPipeline.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Pipeline Building
  // -----------------------------------------------------------------------

  describe('pipeline building', () => {
    beforeEach(async () => {
      await pipeline.init();
      pipeline.loadConfig('yaml', 'test');
    });

    it('PIPE-BUILD-001: buildDisplayPipeline returns full result with shader + LUT', () => {
      const result = pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');

      expect(result).not.toBeNull();
      expect(result!.shader).toBeDefined();
      expect(result!.shader.code).toContain('texture(');
      expect(result!.shader.functionName).toBe('OCIODisplay');
      expect(result!.lut3D).toBeDefined();
      expect(result!.lut3D.size).toBe(65);
      expect(result!.lut3D.data).toBeInstanceOf(Float32Array);
      expect(result!.lut3D.data.length).toBe(65 * 65 * 65 * 3);
      expect(result!.uniforms).toBeDefined();
      expect(result!.fromWasm).toBe(true);
    });

    it('PIPE-BUILD-002: emits pipelineReady event', () => {
      const results: OCIOPipelineResult[] = [];
      pipeline.on('pipelineReady', r => results.push(r));

      pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');

      expect(results).toHaveLength(1);
      expect(results[0]!.fromWasm).toBe(true);
    });

    it('PIPE-BUILD-003: caches result for same parameters', () => {
      const result1 = pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      const result2 = pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');

      expect(result1).toBe(result2);
      // Should only call the WASM module once
      expect(mockExports.ocioGetDisplayProcessor).toHaveBeenCalledTimes(1);
    });

    it('PIPE-BUILD-004: rebuilds when parameters change', () => {
      pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      pipeline.buildDisplayPipeline('sRGB', 'Rec.709', 'Raw');

      expect(mockExports.ocioGetDisplayProcessor).toHaveBeenCalledTimes(2);
    });

    it('PIPE-BUILD-005: rebuild() forces a new build', () => {
      pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      const result = pipeline.rebuild();

      expect(result).not.toBeNull();
      expect(mockExports.ocioGetDisplayProcessor).toHaveBeenCalledTimes(2);
    });

    it('PIPE-BUILD-006: rebuild() returns null when no params set', () => {
      expect(pipeline.rebuild()).toBeNull();
    });

    it('PIPE-BUILD-007: returns null in off mode', () => {
      const offPipeline = new OCIOWasmPipeline({});
      const result = offPipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      expect(result).toBeNull();
      offPipeline.dispose();
    });

    it('PIPE-BUILD-008: look parameter is passed through', () => {
      pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video', 'Filmic');
      expect(mockExports.ocioGetDisplayProcessor).toHaveBeenCalledWith(
        expect.any(Number), 'ACEScg', 'sRGB', 'ACES 1.0 SDR-video', 'Filmic',
      );
    });

    it('PIPE-BUILD-009: empty look defaults to empty string', () => {
      pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      expect(mockExports.ocioGetDisplayProcessor).toHaveBeenCalledWith(
        expect.any(Number), 'ACEScg', 'sRGB', 'ACES 1.0 SDR-video', '',
      );
    });
  });

  // -----------------------------------------------------------------------
  // LUT Configuration
  // -----------------------------------------------------------------------

  describe('LUT configuration', () => {
    beforeEach(async () => {
      await pipeline.init();
      pipeline.loadConfig('yaml', 'test');
    });

    it('PIPE-LUT-001: default LUT size is 65', () => {
      expect(pipeline.getLutSize()).toBe(65);
    });

    it('PIPE-LUT-002: setLutSize changes the bake size', () => {
      pipeline.setLutSize(33);
      expect(pipeline.getLutSize()).toBe(33);

      const result = pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      expect(result!.lut3D.size).toBe(33);
      expect(mockExports.ocioGetProcessorLUT3D).toHaveBeenCalledWith(
        expect.any(Number), 33,
      );
    });

    it('PIPE-LUT-003: setLutSize ignores invalid values', () => {
      pipeline.setLutSize(1); // too small
      expect(pipeline.getLutSize()).toBe(65);

      pipeline.setLutSize(200); // too large
      expect(pipeline.getLutSize()).toBe(65);

      pipeline.setLutSize(33);
      expect(pipeline.getLutSize()).toBe(33);
    });

    it('PIPE-LUT-004: LUT data has correct structure', () => {
      const result = pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      const lut = result!.lut3D;

      expect(lut.title).toBe('OCIO WASM LUT');
      expect(lut.domainMin).toEqual([0, 0, 0]);
      expect(lut.domainMax).toEqual([1, 1, 1]);
      expect(lut.data.length).toBe(lut.size * lut.size * lut.size * 3);
    });
  });

  // -----------------------------------------------------------------------
  // Color Transform
  // -----------------------------------------------------------------------

  describe('color transform', () => {
    beforeEach(async () => {
      await pipeline.init();
      pipeline.loadConfig('yaml', 'test');
      pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
    });

    it('PIPE-COLOR-001: transformColor returns transformed values', () => {
      const result = pipeline.transformColor(0.5, 0.5, 0.5);
      expect(result).not.toBeNull();
      // Float32Array values have limited precision
      expect(result![0]).toBeCloseTo(0.5, 4);
      expect(result![1]).toBeCloseTo(0.6, 4);
      expect(result![2]).toBeCloseTo(0.7, 4);
    });

    it('PIPE-COLOR-002: transformColor returns null without processor', () => {
      const freshPipeline = new OCIOWasmPipeline({ factory });
      const result = freshPipeline.transformColor(0.5, 0.5, 0.5);
      expect(result).toBeNull();
      freshPipeline.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Shader Translation
  // -----------------------------------------------------------------------

  describe('shader translation', () => {
    beforeEach(async () => {
      await pipeline.init();
      pipeline.loadConfig('yaml', 'test');
    });

    it('PIPE-SHADER-001: shader code is translated to GLSL ES 300 es', () => {
      const result = pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');

      // Should have texture() instead of texture3D()
      expect(result!.shader.code).toContain('texture(');
      expect(result!.shader.code).not.toContain('texture3D(');
    });

    it('PIPE-SHADER-002: uniforms are extracted', () => {
      const result = pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');

      const samplerUniforms = result!.uniforms.filter(u => u.isSampler);
      expect(samplerUniforms.length).toBeGreaterThan(0);
      expect(samplerUniforms[0]!.type).toBe('sampler3D');
    });

    it('PIPE-SHADER-003: requires3DLUT is true for LUT-based shaders', () => {
      const result = pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      expect(result!.shader.requires3DLUT).toBe(true);
    });

    it('PIPE-SHADER-004: function name is OCIODisplay', () => {
      const result = pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      expect(result!.functionName).toBe('OCIODisplay');
    });
  });

  // -----------------------------------------------------------------------
  // Fallback Behavior
  // -----------------------------------------------------------------------

  describe('fallback behavior', () => {
    it('PIPE-FALL-001: degrades to baked mode when processor creation fails', async () => {
      const failExports = createMockExports();
      failExports.ocioGetDisplayProcessor = vi.fn(() => -1); // failure
      const failFactory = createMockFactory(failExports);
      const failPipeline = new OCIOWasmPipeline({ factory: failFactory });

      await failPipeline.init();
      failPipeline.loadConfig('yaml', 'test');

      const modes: OCIOPipelineMode[] = [];
      failPipeline.on('modeChanged', e => modes.push(e.mode));

      const result = failPipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');

      // Should have degraded to baked mode
      expect(failPipeline.getMode()).toBe('baked');
      // Baked fallback will also try and fail (since processor creation fails)
      // so result may be null
      expect(result === null || result.fromWasm === false).toBe(true);

      failPipeline.dispose();
    });

    it('PIPE-FALL-002: degrades mode when shader generation fails', async () => {
      const failExports = createMockExports();
      failExports.ocioGenerateShaderCode = vi.fn(() => { throw new Error('shader gen failed'); });
      const failFactory = createMockFactory(failExports);
      const failPipeline = new OCIOWasmPipeline({ factory: failFactory });

      await failPipeline.init();
      failPipeline.loadConfig('yaml', 'test');

      const modes: OCIOPipelineMode[] = [];
      failPipeline.on('modeChanged', e => modes.push(e.mode));

      failPipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');

      // When WASM shader gen fails, the bridge returns null,
      // the pipeline degrades to baked mode
      expect(failPipeline.getMode()).toBe('baked');
      expect(modes).toContain('baked');

      failPipeline.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // Event Emission
  // -----------------------------------------------------------------------

  describe('events', () => {
    it('PIPE-EVT-001: emits modeChanged on init', async () => {
      const events: Array<{ mode: OCIOPipelineMode; reason: string }> = [];
      pipeline.on('modeChanged', e => events.push(e));

      await pipeline.init();

      expect(events).toHaveLength(1);
      expect(events[0]!.mode).toBe('wasm');
    });

    it('PIPE-EVT-002: emits pipelineReady on successful build', async () => {
      await pipeline.init();
      pipeline.loadConfig('yaml', 'test');

      const results: OCIOPipelineResult[] = [];
      pipeline.on('pipelineReady', r => results.push(r));

      pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      expect(results).toHaveLength(1);
    });

    it('PIPE-EVT-003: does not emit pipelineReady on cached hit', async () => {
      await pipeline.init();
      pipeline.loadConfig('yaml', 'test');

      pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');

      const results: OCIOPipelineResult[] = [];
      pipeline.on('pipelineReady', r => results.push(r));

      pipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      expect(results).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Custom LUT Size
  // -----------------------------------------------------------------------

  describe('custom LUT size via config', () => {
    it('PIPE-CUST-001: constructor accepts lutSize option', async () => {
      const customPipeline = new OCIOWasmPipeline({ factory, lutSize: 33 });
      await customPipeline.init();
      expect(customPipeline.getLutSize()).toBe(33);
      customPipeline.dispose();
    });

    it('PIPE-CUST-002: constructor accepts shaderOptions', async () => {
      const customPipeline = new OCIOWasmPipeline({
        factory,
        shaderOptions: { functionName: 'CustomOCIO' },
      });
      await customPipeline.init();
      customPipeline.loadConfig('yaml', 'test');

      const result = customPipeline.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      expect(result!.functionName).toBe('CustomOCIO');

      customPipeline.dispose();
    });
  });
});
