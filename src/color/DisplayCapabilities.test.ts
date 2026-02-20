/**
 * DisplayCapabilities Unit Tests
 *
 * Tests for display capability detection including P3, HDR,
 * and WebGPU probing. All probes must be safe (try/catch wrapped)
 * and use throwaway canvases that are cleaned up.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DisplayCapabilities,
  DEFAULT_CAPABILITIES,
  detectDisplayCapabilities,
  detectWebGPUHDR,
  isHDROutputAvailable,
  isHDROutputAvailableWithLog,
  queryHDRHeadroom,
  resolveActiveColorSpace,
} from './DisplayCapabilities';

describe('DisplayCapabilities', () => {
  // ====================================================================
  // DEFAULT_CAPABILITIES
  // ====================================================================
  describe('DEFAULT_CAPABILITIES', () => {
    it('DC-001: has all boolean fields defaulting to false', () => {
      expect(DEFAULT_CAPABILITIES.canvasP3).toBe(false);
      expect(DEFAULT_CAPABILITIES.webglP3).toBe(false);
      expect(DEFAULT_CAPABILITIES.displayHDR).toBe(false);
      expect(DEFAULT_CAPABILITIES.webglHLG).toBe(false);
      expect(DEFAULT_CAPABILITIES.webglPQ).toBe(false);
      expect(DEFAULT_CAPABILITIES.canvasHLG).toBe(false);
      expect(DEFAULT_CAPABILITIES.canvasFloat16).toBe(false);
      expect(DEFAULT_CAPABILITIES.webgpuAvailable).toBe(false);
      expect(DEFAULT_CAPABILITIES.webgpuHDR).toBe(false);
    });

    it('DC-002: displayGamut defaults to srgb', () => {
      expect(DEFAULT_CAPABILITIES.displayGamut).toBe('srgb');
    });

    it('DC-003: activeColorSpace defaults to srgb', () => {
      expect(DEFAULT_CAPABILITIES.activeColorSpace).toBe('srgb');
    });

    it('DC-004: activeHDRMode defaults to sdr', () => {
      expect(DEFAULT_CAPABILITIES.activeHDRMode).toBe('sdr');
    });

    it('DC-004b: webglDrawingBufferStorage defaults to false', () => {
      expect(DEFAULT_CAPABILITIES.webglDrawingBufferStorage).toBe(false);
    });

    it('DC-004c: canvasExtendedHDR defaults to false', () => {
      expect(DEFAULT_CAPABILITIES.canvasExtendedHDR).toBe(false);
    });

    it('DC-005: is a complete DisplayCapabilities object', () => {
      const requiredKeys: Array<keyof DisplayCapabilities> = [
        'canvasP3', 'webglP3', 'displayGamut',
        'displayHDR', 'webglHLG', 'webglPQ', 'canvasHLG', 'canvasFloat16',
        'webgpuAvailable', 'webgpuHDR',
        'webglDrawingBufferStorage', 'canvasExtendedHDR',
        'activeColorSpace', 'activeHDRMode',
      ];
      for (const key of requiredKeys) {
        expect(DEFAULT_CAPABILITIES).toHaveProperty(key);
      }
    });
  });

  // ====================================================================
  // detectDisplayCapabilities
  // ====================================================================
  describe('detectDisplayCapabilities', () => {
    let originalMatchMedia: typeof globalThis.matchMedia;

    beforeEach(() => {
      originalMatchMedia = globalThis.matchMedia;
    });

    afterEach(() => {
      globalThis.matchMedia = originalMatchMedia;
      vi.restoreAllMocks();
    });

    it('DC-006: returns an object with all required fields', () => {
      const caps = detectDisplayCapabilities();
      expect(caps).toHaveProperty('canvasP3');
      expect(caps).toHaveProperty('webglP3');
      expect(caps).toHaveProperty('displayGamut');
      expect(caps).toHaveProperty('displayHDR');
      expect(caps).toHaveProperty('webglHLG');
      expect(caps).toHaveProperty('webglPQ');
      expect(caps).toHaveProperty('canvasHLG');
      expect(caps).toHaveProperty('canvasFloat16');
      expect(caps).toHaveProperty('webgpuAvailable');
      expect(caps).toHaveProperty('webgpuHDR');
      expect(caps).toHaveProperty('activeColorSpace');
      expect(caps).toHaveProperty('activeHDRMode');
    });

    it('DC-007: does not throw', () => {
      expect(() => detectDisplayCapabilities()).not.toThrow();
    });

    it('DC-020: detects p3 display gamut when matchMedia matches', () => {
      globalThis.matchMedia = vi.fn((query: string) => ({
        matches: query === '(color-gamut: p3)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const caps = detectDisplayCapabilities();
      expect(caps.displayGamut).toBe('p3');
    });

    it('DC-021: detects rec2020 display gamut when matchMedia matches', () => {
      globalThis.matchMedia = vi.fn((query: string) => ({
        matches: query === '(color-gamut: rec2020)' || query === '(color-gamut: p3)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const caps = detectDisplayCapabilities();
      expect(caps.displayGamut).toBe('rec2020');
    });

    it('DC-022: detects HDR display when matchMedia matches dynamic-range: high', () => {
      globalThis.matchMedia = vi.fn((query: string) => ({
        matches: query === '(dynamic-range: high)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const caps = detectDisplayCapabilities();
      expect(caps.displayHDR).toBe(true);
    });

    it('DC-023: survives matchMedia throwing', () => {
      globalThis.matchMedia = vi.fn(() => {
        throw new Error('matchMedia not supported');
      });

      const caps = detectDisplayCapabilities();
      expect(caps.displayGamut).toBe('srgb');
      expect(caps.displayHDR).toBe(false);
    });
  });

  // ====================================================================
  // WebGL context cleanup
  // ====================================================================
  describe('WebGL context cleanup', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('DC-040: loseContext is called even when drawingBufferColorSpace assignment throws', () => {
      const mockLoseContext = vi.fn();
      const mockGetExtension = vi.fn().mockReturnValue({ loseContext: mockLoseContext });
      const mockGl = {
        getExtension: mockGetExtension,
        get drawingBufferColorSpace() { return 'srgb'; },
        set drawingBufferColorSpace(_v: string) { throw new Error('not supported'); },
      };
      // Ensure 'drawingBufferColorSpace' in mockGl is true
      Object.defineProperty(mockGl, 'drawingBufferColorSpace', {
        get() { return 'srgb'; },
        set(_v: string) { throw new Error('not supported'); },
        enumerable: true,
        configurable: true,
      });

      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === 'canvas') {
          const canvasEl = el as HTMLCanvasElement;
          canvasEl.getContext = vi.fn().mockImplementation((type: string) => {
            if (type === 'webgl2') return mockGl;
            return null;
          }) as unknown as typeof canvasEl.getContext;
        }
        return el;
      });

      // Should not throw despite internal error
      expect(() => detectDisplayCapabilities()).not.toThrow();
      // loseContext must still be called in the finally block
      expect(mockLoseContext).toHaveBeenCalled();
    });

    it('DC-041: loseContext is called on successful probe', () => {
      const mockLoseContext = vi.fn();
      const mockGetExtension = vi.fn().mockReturnValue({ loseContext: mockLoseContext });
      let currentColorSpace = 'srgb';
      const mockGl = {
        getExtension: mockGetExtension,
      };
      Object.defineProperty(mockGl, 'drawingBufferColorSpace', {
        get() { return currentColorSpace; },
        set(v: string) { currentColorSpace = v; },
        enumerable: true,
        configurable: true,
      });

      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === 'canvas') {
          const canvasEl = el as HTMLCanvasElement;
          canvasEl.getContext = vi.fn().mockImplementation((type: string) => {
            if (type === 'webgl2') return mockGl;
            return null;
          }) as unknown as typeof canvasEl.getContext;
        }
        return el;
      });

      detectDisplayCapabilities();
      expect(mockLoseContext).toHaveBeenCalled();
    });
  });

  // ====================================================================
  // resolveActiveColorSpace
  // ====================================================================
  describe('resolveActiveColorSpace', () => {
    it('DC-050: returns srgb when preference is srgb regardless of capabilities', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, webglP3: true, displayGamut: 'p3' };
      expect(resolveActiveColorSpace(caps, 'srgb')).toBe('srgb');
    });

    it('DC-051: returns display-p3 when preference is display-p3 and webglP3 is true', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, webglP3: true };
      expect(resolveActiveColorSpace(caps, 'display-p3')).toBe('display-p3');
    });

    it('DC-052: returns srgb when preference is display-p3 but webglP3 is false', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, webglP3: false };
      expect(resolveActiveColorSpace(caps, 'display-p3')).toBe('srgb');
    });

    it('DC-053: returns display-p3 for auto when webglP3 and displayGamut is p3', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, webglP3: true, displayGamut: 'p3' };
      expect(resolveActiveColorSpace(caps, 'auto')).toBe('display-p3');
    });

    it('DC-054: returns display-p3 for auto when webglP3 and displayGamut is rec2020', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, webglP3: true, displayGamut: 'rec2020' };
      expect(resolveActiveColorSpace(caps, 'auto')).toBe('display-p3');
    });

    it('DC-055: returns srgb for auto when webglP3 is false', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, webglP3: false, displayGamut: 'p3' };
      expect(resolveActiveColorSpace(caps, 'auto')).toBe('srgb');
    });

    it('DC-056: returns srgb for auto when displayGamut is srgb', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, webglP3: true, displayGamut: 'srgb' };
      expect(resolveActiveColorSpace(caps, 'auto')).toBe('srgb');
    });
  });

  // ====================================================================
  // queryHDRHeadroom
  // ====================================================================
  describe('queryHDRHeadroom', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('DC-030: returns null when getScreenDetails is not available', async () => {
      const result = await queryHDRHeadroom();
      expect(result).toBeNull();
    });

    it('DC-031: returns headroom value when API is available', async () => {
      const mockGetScreenDetails = vi.fn().mockResolvedValue({
        currentScreen: {
          highDynamicRangeHeadroom: 2.5,
        },
      });
      vi.stubGlobal('getScreenDetails', mockGetScreenDetails);
      (window as unknown as { getScreenDetails: typeof mockGetScreenDetails }).getScreenDetails = mockGetScreenDetails;

      const result = await queryHDRHeadroom();
      expect(result).toBe(2.5);

      vi.unstubAllGlobals();
    });

    it('DC-032: returns null when API throws', async () => {
      const mockGetScreenDetails = vi.fn().mockRejectedValue(new Error('Permission denied'));
      (window as unknown as { getScreenDetails: typeof mockGetScreenDetails }).getScreenDetails = mockGetScreenDetails;

      const result = await queryHDRHeadroom();
      expect(result).toBeNull();

      delete (window as unknown as { getScreenDetails?: unknown }).getScreenDetails;
    });

    it('DC-033: returns null when headroom is not a finite positive number', async () => {
      const mockGetScreenDetails = vi.fn().mockResolvedValue({
        currentScreen: {
          highDynamicRangeHeadroom: -1,
        },
      });
      (window as unknown as { getScreenDetails: typeof mockGetScreenDetails }).getScreenDetails = mockGetScreenDetails;

      const result = await queryHDRHeadroom();
      expect(result).toBeNull();

      delete (window as unknown as { getScreenDetails?: unknown }).getScreenDetails;
    });
  });

  // ====================================================================
  // detectWebGPUHDR
  // ====================================================================
  describe('detectWebGPUHDR', () => {
    let originalGpu: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
    });

    afterEach(() => {
      vi.restoreAllMocks();
      if (originalGpu) {
        Object.defineProperty(navigator, 'gpu', originalGpu);
      } else {
        try {
          delete (navigator as unknown as Record<string, unknown>)['gpu'];
        } catch {
          // Cannot delete non-configurable property
        }
      }
    });

    it('DC-WGPU-001: returns false when navigator.gpu is undefined', async () => {
      // In jsdom, navigator.gpu is not defined by default
      const result = await detectWebGPUHDR();
      expect(result).toBe(false);
    });

    it('DC-WGPU-002: returns false when requestAdapter returns null', async () => {
      Object.defineProperty(navigator, 'gpu', {
        value: { requestAdapter: vi.fn().mockResolvedValue(null) },
        configurable: true,
        writable: true,
      });

      const result = await detectWebGPUHDR();
      expect(result).toBe(false);
    });

    it('DC-WGPU-003: returns true when adapter is obtained', async () => {
      const mockAdapter = { features: new Set<string>() };
      Object.defineProperty(navigator, 'gpu', {
        value: { requestAdapter: vi.fn().mockResolvedValue(mockAdapter) },
        configurable: true,
        writable: true,
      });

      const result = await detectWebGPUHDR();
      expect(result).toBe(true);
    });

    it('DC-WGPU-004: returns false when requestAdapter throws', async () => {
      Object.defineProperty(navigator, 'gpu', {
        value: { requestAdapter: vi.fn().mockRejectedValue(new Error('GPU error')) },
        configurable: true,
        writable: true,
      });

      const result = await detectWebGPUHDR();
      expect(result).toBe(false);
    });

    it('DC-WGPU-005: never throws (safe to call without try/catch)', async () => {
      Object.defineProperty(navigator, 'gpu', {
        value: { requestAdapter: vi.fn().mockRejectedValue(new Error('crash')) },
        configurable: true,
        writable: true,
      });

      await expect(detectWebGPUHDR()).resolves.not.toThrow();
    });

    it('DC-WGPU-006: does not create a device (lightweight probe)', async () => {
      const mockRequestDevice = vi.fn();
      const mockAdapter = {
        features: new Set<string>(),
        requestDevice: mockRequestDevice,
      };
      Object.defineProperty(navigator, 'gpu', {
        value: { requestAdapter: vi.fn().mockResolvedValue(mockAdapter) },
        configurable: true,
        writable: true,
      });

      await detectWebGPUHDR();

      // detectWebGPUHDR should NOT call requestDevice (lightweight adapter-only check)
      expect(mockRequestDevice).not.toHaveBeenCalled();
    });
  });

  // ====================================================================
  // isHDROutputAvailable
  // ====================================================================
  describe('isHDROutputAvailable', () => {
    it('DC-HDR-001: returns false for default capabilities (SDR)', () => {
      expect(isHDROutputAvailable(DEFAULT_CAPABILITIES)).toBe(false);
    });

    it('DC-HDR-002: returns true when activeHDRMode is hlg', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, activeHDRMode: 'hlg' };
      expect(isHDROutputAvailable(caps)).toBe(true);
    });

    it('DC-HDR-003: returns true when activeHDRMode is pq', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, activeHDRMode: 'pq' };
      expect(isHDROutputAvailable(caps)).toBe(true);
    });

    it('DC-HDR-004: returns true when activeHDRMode is extended', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, activeHDRMode: 'extended' };
      expect(isHDROutputAvailable(caps)).toBe(true);
    });

    it('DC-HDR-005: returns true when webgpuHDR is true', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, webgpuHDR: true };
      expect(isHDROutputAvailable(caps)).toBe(true);
    });

    it('DC-HDR-006: returns true when display HDR + wide gamut + WebGPU available', () => {
      const caps: DisplayCapabilities = {
        ...DEFAULT_CAPABILITIES,
        displayHDR: true,
        displayGamut: 'p3',
        webgpuAvailable: true,
      };
      expect(isHDROutputAvailable(caps)).toBe(true);
    });

    it('DC-HDR-007: returns true when display HDR + rec2020 + WebGPU available', () => {
      const caps: DisplayCapabilities = {
        ...DEFAULT_CAPABILITIES,
        displayHDR: true,
        displayGamut: 'rec2020',
        webgpuAvailable: true,
      };
      expect(isHDROutputAvailable(caps)).toBe(true);
    });

    it('DC-HDR-008: returns false when display HDR but no WebGPU', () => {
      const caps: DisplayCapabilities = {
        ...DEFAULT_CAPABILITIES,
        displayHDR: true,
        displayGamut: 'p3',
        webgpuAvailable: false,
      };
      expect(isHDROutputAvailable(caps)).toBe(false);
    });

    it('DC-HDR-009: returns false when display HDR + WebGPU but srgb gamut', () => {
      const caps: DisplayCapabilities = {
        ...DEFAULT_CAPABILITIES,
        displayHDR: true,
        displayGamut: 'srgb',
        webgpuAvailable: true,
      };
      expect(isHDROutputAvailable(caps)).toBe(false);
    });

    it('DC-HDR-010: returns false when activeHDRMode is sdr', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, activeHDRMode: 'sdr' };
      expect(isHDROutputAvailable(caps)).toBe(false);
    });

    it('DC-HDR-011: returns false when activeHDRMode is none', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, activeHDRMode: 'none' };
      expect(isHDROutputAvailable(caps)).toBe(false);
    });
  });

  // ====================================================================
  // isHDROutputAvailableWithLog
  // ====================================================================
  describe('isHDROutputAvailableWithLog', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('DC-HDR-020: returns same result as isHDROutputAvailable for all modes', () => {
      const modes: DisplayCapabilities['activeHDRMode'][] = ['sdr', 'hlg', 'pq', 'extended', 'none'];
      for (const mode of modes) {
        const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, activeHDRMode: mode };
        expect(isHDROutputAvailableWithLog(caps)).toBe(isHDROutputAvailable(caps));
      }
    });

    it('DC-HDR-021: logs diagnostic info', () => {
      isHDROutputAvailableWithLog(DEFAULT_CAPABILITIES);
      expect(console.log).toHaveBeenCalledWith('[HDR Display]', expect.objectContaining({
        dynamicRange: 'standard',
        activeHDRMode: 'sdr',
      }));
    });

    it('DC-HDR-022: logs "Not capable" for SDR defaults', () => {
      isHDROutputAvailableWithLog(DEFAULT_CAPABILITIES);
      expect(console.log).toHaveBeenCalledWith('[HDR Display] Not capable');
    });

    it('DC-HDR-023: logs "Capable via WebGL native" for HLG', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, activeHDRMode: 'hlg' };
      isHDROutputAvailableWithLog(caps);
      expect(console.log).toHaveBeenCalledWith('[HDR Display] Capable via WebGL native (hlg)');
    });

    it('DC-HDR-024: logs "Capable via WebGPU blit" when webgpuHDR is true', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES, webgpuHDR: true };
      isHDROutputAvailableWithLog(caps);
      expect(console.log).toHaveBeenCalledWith('[HDR Display] Capable via WebGPU blit');
    });

    it('DC-HDR-025: considers webgpuBlitReady from extraInfo', () => {
      const caps: DisplayCapabilities = { ...DEFAULT_CAPABILITIES };
      const result = isHDROutputAvailableWithLog(caps, { webgpuBlitReady: true });
      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith('[HDR Display] Capable via WebGPU blit');
    });

    it('DC-HDR-026: logs display HDR + wide gamut path', () => {
      const caps: DisplayCapabilities = {
        ...DEFAULT_CAPABILITIES,
        displayHDR: true,
        displayGamut: 'p3',
        webgpuAvailable: true,
      };
      isHDROutputAvailableWithLog(caps);
      expect(console.log).toHaveBeenCalledWith('[HDR Display] Capable via display HDR + wide gamut + WebGPU');
    });
  });
});
