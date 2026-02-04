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

    it('DC-005: is a complete DisplayCapabilities object', () => {
      const requiredKeys: Array<keyof DisplayCapabilities> = [
        'canvasP3', 'webglP3', 'displayGamut',
        'displayHDR', 'webglHLG', 'webglPQ', 'canvasHLG', 'canvasFloat16',
        'webgpuAvailable', 'webgpuHDR',
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

    it('DC-008: canvasP3 is boolean', () => {
      const caps = detectDisplayCapabilities();
      expect(typeof caps.canvasP3).toBe('boolean');
    });

    it('DC-009: webglP3 is boolean', () => {
      const caps = detectDisplayCapabilities();
      expect(typeof caps.webglP3).toBe('boolean');
    });

    it('DC-010: displayGamut is a valid gamut string', () => {
      const caps = detectDisplayCapabilities();
      expect(['srgb', 'p3', 'rec2020']).toContain(caps.displayGamut);
    });

    it('DC-011: displayHDR is boolean', () => {
      const caps = detectDisplayCapabilities();
      expect(typeof caps.displayHDR).toBe('boolean');
    });

    it('DC-012: webglHLG is boolean', () => {
      const caps = detectDisplayCapabilities();
      expect(typeof caps.webglHLG).toBe('boolean');
    });

    it('DC-013: webglPQ is boolean', () => {
      const caps = detectDisplayCapabilities();
      expect(typeof caps.webglPQ).toBe('boolean');
    });

    it('DC-014: canvasHLG is boolean', () => {
      const caps = detectDisplayCapabilities();
      expect(typeof caps.canvasHLG).toBe('boolean');
    });

    it('DC-015: canvasFloat16 is boolean', () => {
      const caps = detectDisplayCapabilities();
      expect(typeof caps.canvasFloat16).toBe('boolean');
    });

    it('DC-016: webgpuAvailable is boolean', () => {
      const caps = detectDisplayCapabilities();
      expect(typeof caps.webgpuAvailable).toBe('boolean');
    });

    it('DC-017: webgpuHDR is boolean', () => {
      const caps = detectDisplayCapabilities();
      expect(typeof caps.webgpuHDR).toBe('boolean');
    });

    it('DC-018: activeColorSpace is srgb or display-p3', () => {
      const caps = detectDisplayCapabilities();
      expect(['srgb', 'display-p3']).toContain(caps.activeColorSpace);
    });

    it('DC-019: activeHDRMode is a valid mode string', () => {
      const caps = detectDisplayCapabilities();
      expect(['sdr', 'hlg', 'pq', 'none']).toContain(caps.activeHDRMode);
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
});
