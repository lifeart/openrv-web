/**
 * OCIOWasmModule Unit Tests
 *
 * Tests lifecycle/state machine, concurrent init, error handling, and cleanup.
 * Tests that merely verify mock WASM return values (config queries, shader
 * generation, LUT baking, color transforms) have been removed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OCIOWasmModule } from './OCIOWasmModule';
import type { OCIOWasmExports, OCIOWasmFactory } from './OCIOWasmModule';

// ---------------------------------------------------------------------------
// Mock WASM exports
// ---------------------------------------------------------------------------

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
    ocioGenerateShaderCode: vi.fn(() => ''),
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

describe('OCIOWasmModule', () => {
  let mockExports: OCIOWasmExports;
  let factory: OCIOWasmFactory;
  let mod: OCIOWasmModule;

  beforeEach(() => {
    mockExports = createMockExports();
    factory = createMockFactory(mockExports);
    mod = new OCIOWasmModule(factory);
  });

  // -----------------------------------------------------------------------
  // Lifecycle / State Machine
  // -----------------------------------------------------------------------

  describe('lifecycle', () => {
    it('WASM-001: starts uninitialised', () => {
      expect(mod.getStatus()).toBe('uninitialised');
      expect(mod.isReady()).toBe(false);
    });

    it('WASM-002: init transitions to ready', async () => {
      await mod.init();
      expect(mod.getStatus()).toBe('ready');
      expect(mod.isReady()).toBe(true);
    });

    it('WASM-003: init is idempotent', async () => {
      await mod.init();
      await mod.init(); // should not throw
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('WASM-004: init without factory throws', async () => {
      const noFactory = new OCIOWasmModule();
      await expect(noFactory.init()).rejects.toThrow('no factory provided');
      expect(noFactory.getStatus()).toBe('error');
    });

    it('WASM-005: init failure transitions to error', async () => {
      const failFactory = vi.fn(() => Promise.reject(new Error('WASM load failed')));
      const failMod = new OCIOWasmModule(failFactory);
      await expect(failMod.init()).rejects.toThrow('init failed');
      expect(failMod.getStatus()).toBe('error');
    });

    it('WASM-006: dispose cleans up', async () => {
      await mod.init();
      mod.dispose();
      expect(mod.getStatus()).toBe('disposed');
      expect(mod.isReady()).toBe(false);
    });

    it('WASM-007: methods throw after dispose', async () => {
      await mod.init();
      mod.dispose();
      expect(() => mod.getVersion()).toThrow('disposed');
      await expect(mod.init()).rejects.toThrow('disposed');
    });

    it('WASM-008: methods throw before init', () => {
      expect(() => mod.getVersion()).toThrow('not initialised');
    });

    it('WASM-009: getVersion returns WASM version', async () => {
      await mod.init();
      expect(mod.getVersion()).toBe('2.3.1');
    });
  });

  // -----------------------------------------------------------------------
  // Config Management — error handling only
  // -----------------------------------------------------------------------

  describe('config management', () => {
    beforeEach(async () => {
      await mod.init();
    });

    it('WASM-CFG-001: loadConfig returns handle with id and name', () => {
      const handle = mod.loadConfig('ocio_profile_version: 2\n', 'test');
      expect(handle.id).toBeGreaterThan(0);
      expect(handle.name).toBe('test');
    });

    it('WASM-CFG-003: loadConfig throws on WASM failure', () => {
      (mockExports.ocioLoadConfig as ReturnType<typeof vi.fn>).mockReturnValue(-1);
      expect(() => mod.loadConfig('bad', 'test')).toThrow('failed to load config');
    });

    it('WASM-CFG-009: handles malformed JSON from WASM gracefully', () => {
      (mockExports.ocioGetDisplays as ReturnType<typeof vi.fn>).mockReturnValue('not json');
      const handle = mod.loadConfig('yaml', 'test');
      expect(mod.getDisplays(handle)).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Processor — error handling and handle tracking
  // -----------------------------------------------------------------------

  describe('processor / shader', () => {
    beforeEach(async () => {
      await mod.init();
    });

    it('WASM-PROC-005: generateShaderCode throws for invalid handle', () => {
      expect(() => mod.generateShaderCode(9999)).toThrow('invalid processor handle');
    });

    it('WASM-PROC-008: destroyProcessor removes handle from tracking', () => {
      const config = mod.loadConfig('yaml', 'test');
      const ph = mod.createDisplayProcessor(config, 'ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      mod.destroyProcessor(ph);
      // Using destroyed handle should throw
      expect(() => mod.generateShaderCode(ph)).toThrow('invalid processor handle');
    });

    it('WASM-PROC-009: createProcessor throws on WASM failure', () => {
      const config = mod.loadConfig('yaml', 'test');
      (mockExports.ocioGetProcessor as ReturnType<typeof vi.fn>).mockReturnValue(-1);
      expect(() => mod.createProcessor(config, 'bad', 'bad')).toThrow('failed to create processor');
    });
  });

  // -----------------------------------------------------------------------
  // Dispose Cleanup
  // -----------------------------------------------------------------------

  describe('dispose cleanup', () => {
    it('WASM-CLEAN-001: dispose destroys all processors and configs', async () => {
      await mod.init();
      const config = mod.loadConfig('yaml', 'test');
      mod.createDisplayProcessor(config, 'ACEScg', 'sRGB', 'ACES 1.0 SDR-video');
      mod.createProcessor(config, 'ACEScg', 'sRGB');

      mod.dispose();

      expect(mockExports.ocioDestroyProcessor).toHaveBeenCalledTimes(2);
      expect(mockExports.ocioDestroyConfig).toHaveBeenCalledTimes(1);
    });

    it('WASM-CLEAN-002: double dispose is safe', async () => {
      await mod.init();
      mod.dispose();
      expect(() => mod.dispose()).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Concurrent Init
  // -----------------------------------------------------------------------

  describe('concurrent init', () => {
    it('WASM-CONC-001: concurrent init calls share single factory call', async () => {
      const p1 = mod.init();
      const p2 = mod.init();
      await Promise.all([p1, p2]);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('WASM-CONC-002: concurrent init failure shares single rejection', async () => {
      const failFactory = vi.fn(() => Promise.reject(new Error('fail')));
      const failMod = new OCIOWasmModule(failFactory);
      const p1 = failMod.init().catch(e => e);
      const p2 = failMod.init().catch(e => e);
      const [e1, e2] = await Promise.all([p1, p2]);
      expect(failFactory).toHaveBeenCalledTimes(1);
      expect(e1).toBeInstanceOf(Error);
      expect(e2).toBeInstanceOf(Error);
    });

    it('WASM-CONC-003: init after failure allows retry', async () => {
      let callCount = 0;
      const retryFactory = vi.fn(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('first fail'));
        return Promise.resolve(createMockExports());
      });
      const retryMod = new OCIOWasmModule(retryFactory);

      // First init fails
      await expect(retryMod.init()).rejects.toThrow('init failed');
      expect(retryMod.getStatus()).toBe('error');

      // Second init succeeds (retry)
      await retryMod.init();
      expect(retryMod.getStatus()).toBe('ready');
      expect(retryFactory).toHaveBeenCalledTimes(2);
    });
  });
});
