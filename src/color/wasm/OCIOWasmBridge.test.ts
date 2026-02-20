/**
 * OCIOWasmBridge Unit Tests
 *
 * Tests lifecycle, event emission, error handling, guard logic, and cleanup.
 * Tests that merely verify mock WASM return values (config queries, shader
 * content, LUT data, color transform results) have been removed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OCIOWasmBridge } from './OCIOWasmBridge';
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
    ocioGetProcessorLUT3D: vi.fn((_, size: number) => new Float32Array(size * size * size * 3)),
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

describe('OCIOWasmBridge', () => {
  let mockExports: OCIOWasmExports;
  let factory: OCIOWasmFactory;
  let bridge: OCIOWasmBridge;

  beforeEach(async () => {
    mockExports = createMockExports();
    factory = createMockFactory(mockExports);
    bridge = new OCIOWasmBridge({ factory });
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('lifecycle', () => {
    it('BRG-001: starts not ready', () => {
      expect(bridge.isReady()).toBe(false);
    });

    it('BRG-002: init transitions to ready', async () => {
      await bridge.init();
      expect(bridge.isReady()).toBe(true);
    });

    it('BRG-003: emits statusChanged on init', async () => {
      const events: Array<{ ready: boolean }> = [];
      bridge.on('statusChanged', e => events.push(e));
      await bridge.init();
      expect(events).toHaveLength(1);
      expect(events[0]!.ready).toBe(true);
    });

    it('BRG-004: emits statusChanged with error on failure', async () => {
      const failFactory = vi.fn(() => Promise.reject(new Error('boom')));
      const failBridge = new OCIOWasmBridge({ factory: failFactory });
      const events: Array<{ ready: boolean; error?: string }> = [];
      failBridge.on('statusChanged', e => events.push(e));

      await expect(failBridge.init()).rejects.toThrow();
      expect(events).toHaveLength(1);
      expect(events[0]!.ready).toBe(false);
      expect(events[0]!.error).toContain('boom');
    });

    it('BRG-005: dispose cleans up', async () => {
      await bridge.init();
      bridge.dispose();
      expect(bridge.isReady()).toBe(false);
    });

    it('BRG-006: methods throw after dispose', async () => {
      await bridge.init();
      bridge.dispose();
      await expect(bridge.init()).rejects.toThrow('disposed');
    });
  });

  // -----------------------------------------------------------------------
  // Pipeline State — initial defaults
  // -----------------------------------------------------------------------

  describe('pipeline state', () => {
    it('BRG-STATE-001: initial state shows not using WASM', () => {
      const state = bridge.getPipelineState();
      expect(state.usingWasm).toBe(false);
      expect(state.configName).toBeNull();
      expect(state.processorHandle).toBeNull();
      expect(state.shader).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Config Management — guard / error / cleanup logic
  // -----------------------------------------------------------------------

  describe('config management', () => {
    beforeEach(async () => {
      await bridge.init();
    });

    it('BRG-CFG-002: loadConfig throws when not ready', () => {
      const notReady = new OCIOWasmBridge({ factory });
      expect(() => notReady.loadConfig('yaml', 'test')).toThrow('not initialised');
    });

    it('BRG-CFG-004: getConfigInfo returns null without config', () => {
      expect(bridge.getConfigInfo()).toBeNull();
    });

    it('BRG-CFG-006: loading new config destroys old one', () => {
      bridge.loadConfig('yaml1', 'first');
      bridge.loadConfig('yaml2', 'second');
      expect(mockExports.ocioDestroyConfig).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Display Pipeline — event emission / error handling / cleanup
  // -----------------------------------------------------------------------

  describe('display pipeline', () => {
    beforeEach(async () => {
      await bridge.init();
      bridge.loadConfig('yaml', 'test');
    });

    it('BRG-PIPE-002: emits shaderReady event', () => {
      const shaders: unknown[] = [];
      bridge.on('shaderReady', s => shaders.push(s));

      bridge.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      expect(shaders).toHaveLength(1);
    });

    it('BRG-PIPE-003: building new pipeline destroys old processor', () => {
      bridge.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      bridge.buildDisplayPipeline('sRGB', 'Rec.709', 'Raw');
      expect(mockExports.ocioDestroyProcessor).toHaveBeenCalledTimes(1);
    });

    it('BRG-PIPE-004: buildDisplayPipeline emits fallback when not ready', () => {
      const notReady = new OCIOWasmBridge({ factory });
      const fallbacks: Array<{ reason: string }> = [];
      notReady.on('fallback', f => fallbacks.push(f));

      const result = notReady.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      expect(result).toBeNull();
      expect(fallbacks).toHaveLength(1);
      expect(fallbacks[0]!.reason).toContain('not ready');
    });

    it('BRG-PIPE-005: buildDisplayPipeline emits fallback on processor error', () => {
      (mockExports.ocioGetDisplayProcessor as ReturnType<typeof vi.fn>).mockReturnValue(-1);

      const fallbacks: Array<{ reason: string }> = [];
      bridge.on('fallback', f => fallbacks.push(f));

      const result = bridge.buildDisplayPipeline('bad', 'bad', 'bad');
      expect(result).toBeNull();
      expect(fallbacks).toHaveLength(1);
      expect(fallbacks[0]!.reason).toContain('failed');
    });
  });

  // -----------------------------------------------------------------------
  // Conversion Pipeline — fallback when WASM unavailable
  // -----------------------------------------------------------------------

  describe('conversion pipeline', () => {
    it('BRG-CONV-002: emits fallback when WASM unavailable', () => {
      const notReady = new OCIOWasmBridge({ factory });
      const fallbacks: unknown[] = [];
      notReady.on('fallback', f => fallbacks.push(f));

      const result = notReady.buildConversionPipeline('ACEScg', 'sRGB');
      expect(result).toBeNull();
      expect(fallbacks).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // bake3DLUT / transformColor — guard logic only
  // -----------------------------------------------------------------------

  describe('bake3DLUT', () => {
    it('BRG-LUT-002: bake3DLUT returns null without processor', async () => {
      await bridge.init();
      expect(bridge.bake3DLUT()).toBeNull();
    });
  });

  describe('transformColor', () => {
    it('BRG-COLOR-002: transformColor returns null without processor', async () => {
      await bridge.init();
      expect(bridge.transformColor(0.5, 0.5, 0.5)).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // loadConfigWithFiles — real VFS / file extraction logic
  // -----------------------------------------------------------------------

  describe('loadConfigWithFiles', () => {
    beforeEach(async () => {
      await bridge.init();
    });

    it('BRG-CFG-007: loadConfigWithFiles preloads files and loads config', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
      });
      vi.stubGlobal('fetch', mockFetch);

      const yaml = `ocio_profile_version: 2
search_path: luts
colorspaces:
  - !<ColorSpace>
    name: sRGB
    to_reference: !<FileTransform> {src: srgb.spi3d}
`;
      await bridge.loadConfigWithFiles(yaml, 'test');

      expect(mockExports.ocioLoadConfig).toHaveBeenCalledWith(yaml);
      expect(mockFetch).toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('BRG-CFG-008: loadConfigWithFiles tries all search paths', async () => {
      const fetchedUrls: string[] = [];
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        fetchedUrls.push(url);
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
        });
      });
      vi.stubGlobal('fetch', mockFetch);

      const yaml = `ocio_profile_version: 2
search_path: luts:luts/aces:shared
colorspaces:
  - !<ColorSpace>
    name: sRGB
    to_reference: !<FileTransform> {src: srgb.spi3d}
`;
      await bridge.loadConfigWithFiles(yaml, 'test');

      expect(fetchedUrls).toContain('luts/srgb.spi3d');
      expect(fetchedUrls).toContain('luts/aces/srgb.spi3d');
      expect(fetchedUrls).toContain('shared/srgb.spi3d');

      vi.unstubAllGlobals();
    });

    it('BRG-CFG-009: loadConfigWithFiles throws when not ready', async () => {
      const notReady = new OCIOWasmBridge({ factory });
      await expect(
        notReady.loadConfigWithFiles('yaml', 'test')
      ).rejects.toThrow('not initialised');
    });
  });

  // -----------------------------------------------------------------------
  // VFS Access
  // -----------------------------------------------------------------------

  describe('VFS access', () => {
    it('BRG-VFS-001: getVFS returns the VFS instance', () => {
      const vfs = bridge.getVFS();
      expect(vfs).toBeDefined();
      vfs.writeFile('test.cube', new Uint8Array([1, 2, 3]));
      expect(vfs.hasFile('test.cube')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Dispose Cleanup
  // -----------------------------------------------------------------------

  describe('dispose cleanup', () => {
    it('BRG-CLEAN-001: dispose destroys processor and config', async () => {
      await bridge.init();
      bridge.loadConfig('yaml', 'test');
      bridge.buildDisplayPipeline('ACEScg', 'sRGB', 'ACES 1.0 SDR-video');

      bridge.dispose();

      expect(mockExports.ocioDestroyProcessor).toHaveBeenCalled();
      expect(mockExports.ocioDestroyConfig).toHaveBeenCalled();
    });

    it('BRG-CLEAN-002: double dispose is safe', async () => {
      await bridge.init();
      bridge.dispose();
      expect(() => bridge.dispose()).not.toThrow();
    });
  });
});
