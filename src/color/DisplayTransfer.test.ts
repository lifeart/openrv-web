/**
 * DisplayTransfer Unit Tests
 *
 * Tests for display color management transfer functions,
 * pipeline processing, and ImageData application.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  linearToSRGB,
  linearToRec709,
  applyDisplayTransfer,
  applyDisplayColorManagement,
  applyDisplayColorManagementToImageData,
  DEFAULT_DISPLAY_COLOR_STATE,
  DISPLAY_TRANSFER_CODES,
  isDisplayStateActive,
  saveDisplayProfile,
  loadDisplayProfile,
  DisplayColorState,
} from './DisplayTransfer';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('DisplayTransfer', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // ====================================================================
  // sRGB Transfer Function
  // ====================================================================
  describe('linearToSRGB', () => {
    it('DT-001: linearToSRGB(0) should return 0', () => {
      expect(linearToSRGB(0)).toBe(0);
    });

    it('DT-002: linearToSRGB(1) should return 1', () => {
      expect(linearToSRGB(1)).toBeCloseTo(1.0, 4);
    });

    it('DT-003: linearToSRGB(0.5) should return approximately 0.735', () => {
      expect(linearToSRGB(0.5)).toBeCloseTo(0.735, 2);
    });

    it('DT-004: linearToSRGB uses linear segment below 0.0031308', () => {
      const input = 0.001;
      expect(linearToSRGB(input)).toBeCloseTo(12.92 * input, 6);
    });

    it('DT-005: linearToSRGB uses power curve above 0.0031308', () => {
      const input = 0.5;
      const expected = 1.055 * Math.pow(input, 1.0 / 2.4) - 0.055;
      expect(linearToSRGB(input)).toBeCloseTo(expected, 6);
    });

    it('DT-006: linearToSRGB is monotonically increasing', () => {
      let prev = -1;
      for (let i = 0; i <= 10; i++) {
        const val = linearToSRGB(i / 10);
        expect(val).toBeGreaterThan(prev);
        prev = val;
      }
    });

    it('DT-007: linearToSRGB transition is continuous at 0.0031308', () => {
      const cutoff = 0.0031308;
      const fromLinear = 12.92 * cutoff;
      const fromPower = 1.055 * Math.pow(cutoff, 1.0 / 2.4) - 0.055;
      expect(fromLinear).toBeCloseTo(fromPower, 4);
    });

    it('DT-008: linearToSRGB clamps negative input to 0', () => {
      expect(linearToSRGB(-0.1)).toBe(0);
    });
  });

  // ====================================================================
  // Rec. 709 OETF
  // ====================================================================
  describe('linearToRec709', () => {
    it('DT-010: linearToRec709(0) should return 0', () => {
      expect(linearToRec709(0)).toBe(0);
    });

    it('DT-011: linearToRec709(1) should return 1', () => {
      expect(linearToRec709(1)).toBeCloseTo(1.0, 4);
    });

    it('DT-012: linearToRec709(0.5) should return approximately 0.705', () => {
      expect(linearToRec709(0.5)).toBeCloseTo(0.705, 2);
    });

    it('DT-013: linearToRec709 uses linear segment below 0.018', () => {
      const input = 0.01;
      expect(linearToRec709(input)).toBeCloseTo(4.5 * input, 6);
    });

    it('DT-014: linearToRec709 uses power curve above 0.018', () => {
      const input = 0.5;
      const expected = 1.099 * Math.pow(input, 0.45) - 0.099;
      expect(linearToRec709(input)).toBeCloseTo(expected, 6);
    });

    it('DT-015: linearToRec709 is monotonically increasing', () => {
      let prev = -1;
      for (let i = 0; i <= 10; i++) {
        const val = linearToRec709(i / 10);
        expect(val).toBeGreaterThan(prev);
        prev = val;
      }
    });

    it('DT-016: linearToRec709 transition is continuous at 0.018', () => {
      const cutoff = 0.018;
      const fromLinear = 4.5 * cutoff;
      const fromPower = 1.099 * Math.pow(cutoff, 0.45) - 0.099;
      expect(fromLinear).toBeCloseTo(fromPower, 3);
    });

    it('DT-017: linearToRec709 differs from sRGB', () => {
      expect(linearToRec709(0.5)).not.toBeCloseTo(linearToSRGB(0.5), 2);
    });
  });

  // ====================================================================
  // Display Transfer Application
  // ====================================================================
  describe('applyDisplayTransfer', () => {
    it('DT-020: linear returns unchanged value', () => {
      expect(applyDisplayTransfer(0.5, 'linear', 2.2)).toBe(0.5);
    });

    it('DT-021: srgb calls linearToSRGB', () => {
      const input = 0.5;
      expect(applyDisplayTransfer(input, 'srgb', 2.2)).toBeCloseTo(linearToSRGB(input), 6);
    });

    it('DT-022: rec709 calls linearToRec709', () => {
      const input = 0.5;
      expect(applyDisplayTransfer(input, 'rec709', 2.2)).toBeCloseTo(linearToRec709(input), 6);
    });

    it('DT-023: gamma2.2 applies pow(1/2.2)', () => {
      const input = 0.5;
      const expected = Math.pow(input, 1.0 / 2.2);
      expect(applyDisplayTransfer(input, 'gamma2.2', 2.2)).toBeCloseTo(expected, 6);
    });

    it('DT-024: gamma2.4 applies pow(1/2.4)', () => {
      const input = 0.5;
      const expected = Math.pow(input, 1.0 / 2.4);
      expect(applyDisplayTransfer(input, 'gamma2.4', 2.2)).toBeCloseTo(expected, 6);
    });

    it('DT-025: custom uses customGamma parameter', () => {
      const input = 0.5;
      const customGamma = 1.8;
      const expected = Math.pow(input, 1.0 / customGamma);
      expect(applyDisplayTransfer(input, 'custom', customGamma)).toBeCloseTo(expected, 6);
    });

    it('DT-026: clamps negative input to 0', () => {
      expect(applyDisplayTransfer(-0.5, 'srgb', 2.2)).toBe(0);
      expect(applyDisplayTransfer(-0.5, 'linear', 2.2)).toBe(0);
      expect(applyDisplayTransfer(-0.5, 'gamma2.2', 2.2)).toBe(0);
    });
  });

  // ====================================================================
  // Display Color Management Pipeline
  // ====================================================================
  describe('applyDisplayColorManagement', () => {
    it('DT-030: defaults returns sRGB output', () => {
      const [r, g, b] = applyDisplayColorManagement(0.5, 0.5, 0.5, DEFAULT_DISPLAY_COLOR_STATE);
      expect(r).toBeCloseTo(linearToSRGB(0.5), 4);
      expect(g).toBeCloseTo(linearToSRGB(0.5), 4);
      expect(b).toBeCloseTo(linearToSRGB(0.5), 4);
    });

    it('DT-031: display gamma 1.0 does not modify output', () => {
      const state: DisplayColorState = { ...DEFAULT_DISPLAY_COLOR_STATE, displayGamma: 1.0 };
      const [r] = applyDisplayColorManagement(0.5, 0.5, 0.5, state);
      expect(r).toBeCloseTo(linearToSRGB(0.5), 4);
    });

    it('DT-032: display gamma 2.0 further brightens output', () => {
      const stateDefault: DisplayColorState = { ...DEFAULT_DISPLAY_COLOR_STATE };
      const stateGamma: DisplayColorState = { ...DEFAULT_DISPLAY_COLOR_STATE, displayGamma: 2.0 };
      const [rDefault] = applyDisplayColorManagement(0.5, 0.5, 0.5, stateDefault);
      const [rGamma] = applyDisplayColorManagement(0.5, 0.5, 0.5, stateGamma);
      // Gamma override > 1 means output^(1/gamma) which makes values closer to 1 (brighter)
      expect(rGamma).toBeGreaterThan(rDefault);
    });

    it('DT-033: display brightness 1.0 does not modify output', () => {
      const state: DisplayColorState = { ...DEFAULT_DISPLAY_COLOR_STATE, displayBrightness: 1.0 };
      const [r] = applyDisplayColorManagement(0.5, 0.5, 0.5, state);
      expect(r).toBeCloseTo(linearToSRGB(0.5), 4);
    });

    it('DT-034: display brightness 0.5 halves all channels', () => {
      const state: DisplayColorState = { ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'linear', displayBrightness: 0.5 };
      const [r, g, b] = applyDisplayColorManagement(0.8, 0.6, 0.4, state);
      expect(r).toBeCloseTo(0.4, 4);
      expect(g).toBeCloseTo(0.3, 4);
      expect(b).toBeCloseTo(0.2, 4);
    });

    it('DT-035: display brightness 0.0 produces black', () => {
      const state: DisplayColorState = { ...DEFAULT_DISPLAY_COLOR_STATE, displayBrightness: 0 };
      const [r, g, b] = applyDisplayColorManagement(0.5, 0.5, 0.5, state);
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });

    it('DT-036: display brightness preserves R:G:B ratio', () => {
      const state: DisplayColorState = {
        ...DEFAULT_DISPLAY_COLOR_STATE,
        transferFunction: 'linear',
        displayBrightness: 0.5,
      };
      const [r, g, b] = applyDisplayColorManagement(0.8, 0.4, 0.2, state);
      // Ratios should be 4:2:1
      expect(r / b).toBeCloseTo(4, 4);
      expect(g / b).toBeCloseTo(2, 4);
    });

    it('DT-037: output is clamped to [0, 1]', () => {
      const state: DisplayColorState = {
        ...DEFAULT_DISPLAY_COLOR_STATE,
        transferFunction: 'linear',
        displayBrightness: 2.0,
      };
      const [r, g, b] = applyDisplayColorManagement(0.8, 0.9, 1.0, state);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(1);
    });

    it('DT-038: full pipeline order is transfer -> gamma -> brightness', () => {
      // Verify by checking with known values
      const state: DisplayColorState = {
        transferFunction: 'srgb',
        displayGamma: 2.0,
        displayBrightness: 0.5,
        customGamma: 2.2,
      };
      const input = 0.5;
      // Step 1: sRGB encode
      let expected = linearToSRGB(input);
      // Step 2: gamma override (1/2.0)
      expected = Math.pow(expected, 1.0 / 2.0);
      // Step 3: brightness multiply
      expected = expected * 0.5;
      // Step 4: clamp
      expected = Math.min(Math.max(expected, 0), 1);

      const [r] = applyDisplayColorManagement(input, input, input, state);
      expect(r).toBeCloseTo(expected, 6);
    });
  });

  // ====================================================================
  // ImageData Processing
  // ====================================================================
  describe('applyDisplayColorManagementToImageData', () => {
    it('DT-040: processes all pixels', () => {
      const data = new Uint8ClampedArray([128, 64, 32, 255, 200, 100, 50, 255]);
      const imageData = new ImageData(data, 2, 1);
      const originalR1 = data[0];
      const originalR2 = data[4];

      applyDisplayColorManagementToImageData(imageData, DEFAULT_DISPLAY_COLOR_STATE);

      // Both pixels should have been transformed (sRGB encode makes values different)
      expect(imageData.data[0]).not.toBe(originalR1);
      expect(imageData.data[4]).not.toBe(originalR2);
    });

    it('DT-041: preserves alpha channel', () => {
      const imageData = new ImageData(new Uint8ClampedArray([128, 64, 32, 200]), 1, 1);
      applyDisplayColorManagementToImageData(imageData, DEFAULT_DISPLAY_COLOR_STATE);
      expect(imageData.data[3]).toBe(200);
    });

    it('DT-042: linear state with defaults is near identity', () => {
      const state: DisplayColorState = {
        transferFunction: 'linear',
        displayGamma: 1.0,
        displayBrightness: 1.0,
        customGamma: 2.2,
      };
      const imageData = new ImageData(new Uint8ClampedArray([128, 64, 32, 255]), 1, 1);
      applyDisplayColorManagementToImageData(imageData, state);
      // Linear with no gamma/brightness changes should be near identity
      expect(imageData.data[0]).toBe(128);
      expect(imageData.data[1]).toBe(64);
      expect(imageData.data[2]).toBe(32);
    });

    it('DT-043: handles single pixel', () => {
      const imageData = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
      applyDisplayColorManagementToImageData(imageData, DEFAULT_DISPLAY_COLOR_STATE);
      // White should map to white through sRGB
      expect(imageData.data[0]).toBe(255);
    });

    it('DT-044: handles empty ImageData', () => {
      const imageData = new ImageData(1, 1);
      // Should not throw
      expect(() => {
        applyDisplayColorManagementToImageData(imageData, DEFAULT_DISPLAY_COLOR_STATE);
      }).not.toThrow();
    });
  });

  // ====================================================================
  // Default State and Constants
  // ====================================================================
  describe('constants', () => {
    it('DT-050: default transfer function is srgb', () => {
      expect(DEFAULT_DISPLAY_COLOR_STATE.transferFunction).toBe('srgb');
    });

    it('DT-051: default gamma override is 1.0', () => {
      expect(DEFAULT_DISPLAY_COLOR_STATE.displayGamma).toBe(1.0);
    });

    it('DT-052: default brightness is 1.0', () => {
      expect(DEFAULT_DISPLAY_COLOR_STATE.displayBrightness).toBe(1.0);
    });

    it('DT-053: default customGamma is 2.2', () => {
      expect(DEFAULT_DISPLAY_COLOR_STATE.customGamma).toBe(2.2);
    });

    it('DT-054: DISPLAY_TRANSFER_CODES has correct integer mappings', () => {
      expect(DISPLAY_TRANSFER_CODES['linear']).toBe(0);
      expect(DISPLAY_TRANSFER_CODES['srgb']).toBe(1);
      expect(DISPLAY_TRANSFER_CODES['rec709']).toBe(2);
      expect(DISPLAY_TRANSFER_CODES['gamma2.2']).toBe(3);
      expect(DISPLAY_TRANSFER_CODES['gamma2.4']).toBe(4);
      expect(DISPLAY_TRANSFER_CODES['custom']).toBe(5);
    });
  });

  // ====================================================================
  // isDisplayStateActive
  // ====================================================================
  describe('isDisplayStateActive', () => {
    it('returns false for default sRGB state', () => {
      expect(isDisplayStateActive(DEFAULT_DISPLAY_COLOR_STATE)).toBe(false);
    });

    it('returns true for non-sRGB transfer function', () => {
      expect(isDisplayStateActive({ ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'linear' })).toBe(true);
    });

    it('returns true for non-default gamma', () => {
      expect(isDisplayStateActive({ ...DEFAULT_DISPLAY_COLOR_STATE, displayGamma: 1.5 })).toBe(true);
    });

    it('returns true for non-default brightness', () => {
      expect(isDisplayStateActive({ ...DEFAULT_DISPLAY_COLOR_STATE, displayBrightness: 0.8 })).toBe(true);
    });
  });

  // ====================================================================
  // Persistence
  // ====================================================================
  describe('persistence', () => {
    it('saveDisplayProfile stores to localStorage', () => {
      const state: DisplayColorState = { ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'rec709' };
      saveDisplayProfile(state);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'openrv-display-profile',
        JSON.stringify(state),
      );
    });

    it('loadDisplayProfile returns null when nothing stored', () => {
      expect(loadDisplayProfile()).toBeNull();
    });

    it('loadDisplayProfile returns stored state', () => {
      const state: DisplayColorState = { ...DEFAULT_DISPLAY_COLOR_STATE, transferFunction: 'rec709' };
      localStorageMock.setItem('openrv-display-profile', JSON.stringify(state));
      const loaded = loadDisplayProfile();
      expect(loaded).toEqual(state);
    });
  });
});
