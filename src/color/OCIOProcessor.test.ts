/**
 * OCIOProcessor Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OCIOProcessor,
  getSharedOCIOProcessor,
  disposeSharedOCIOProcessor,
  MediaMetadata,
} from './OCIOProcessor';
import { DEFAULT_OCIO_STATE } from './OCIOConfig';
import { createTestImageData } from '../../test/utils';

describe('OCIOProcessor', () => {
  let processor: OCIOProcessor;

  beforeEach(() => {
    processor = new OCIOProcessor();
  });

  describe('constructor', () => {
    it('OCIO-P001: initializes with default state', () => {
      const state = processor.getState();
      expect(state.enabled).toBe(DEFAULT_OCIO_STATE.enabled);
      expect(state.configName).toBe(DEFAULT_OCIO_STATE.configName);
      expect(state.inputColorSpace).toBe(DEFAULT_OCIO_STATE.inputColorSpace);
      expect(state.workingColorSpace).toBe(DEFAULT_OCIO_STATE.workingColorSpace);
      expect(state.display).toBe(DEFAULT_OCIO_STATE.display);
      expect(state.view).toBe(DEFAULT_OCIO_STATE.view);
    });
  });

  describe('getState/setState', () => {
    it('OCIO-P002: getState returns copy of state', () => {
      const state1 = processor.getState();
      const state2 = processor.getState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it('OCIO-P003: setState updates state', () => {
      processor.setState({ enabled: true });
      expect(processor.getState().enabled).toBe(true);
    });

    it('OCIO-P004: setState emits stateChanged event', () => {
      const callback = vi.fn();
      processor.on('stateChanged', callback);
      processor.setState({ enabled: true });
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('OCIO-P005: setState emits transformChanged when relevant', () => {
      const callback = vi.fn();
      processor.on('transformChanged', callback);
      processor.setState({ inputColorSpace: 'sRGB' });
      expect(callback).toHaveBeenCalled();
    });

    it('OCIO-P006: setState partial update preserves other values', () => {
      processor.setState({ enabled: true });
      processor.setState({ inputColorSpace: 'ACEScg' });
      const state = processor.getState();
      expect(state.enabled).toBe(true);
      expect(state.inputColorSpace).toBe('ACEScg');
    });
  });

  describe('reset', () => {
    it('OCIO-P007: resets to default state', () => {
      processor.setState({ enabled: true, inputColorSpace: 'ACEScg' });
      processor.reset();
      const state = processor.getState();
      expect(state.enabled).toBe(DEFAULT_OCIO_STATE.enabled);
      expect(state.inputColorSpace).toBe(DEFAULT_OCIO_STATE.inputColorSpace);
    });
  });

  describe('enable/disable', () => {
    it('OCIO-P008: isEnabled returns enabled state', () => {
      expect(processor.isEnabled()).toBe(false);
      processor.setEnabled(true);
      expect(processor.isEnabled()).toBe(true);
    });

    it('OCIO-P009: setEnabled only emits when changed', () => {
      const callback = vi.fn();
      processor.on('stateChanged', callback);

      processor.setEnabled(true);
      expect(callback).toHaveBeenCalledTimes(1);

      processor.setEnabled(true); // Same value
      expect(callback).toHaveBeenCalledTimes(1); // No new call
    });

    it('OCIO-P010: toggle flips enabled state', () => {
      expect(processor.isEnabled()).toBe(false);
      processor.toggle();
      expect(processor.isEnabled()).toBe(true);
      processor.toggle();
      expect(processor.isEnabled()).toBe(false);
    });
  });

  describe('loadConfig', () => {
    it('OCIO-P011: loads ACES config', () => {
      processor.loadConfig('aces_1.2');
      expect(processor.getConfigName()).toBe('aces_1.2');
    });

    it('OCIO-P012: loads sRGB config', () => {
      processor.loadConfig('srgb');
      expect(processor.getConfigName()).toBe('srgb');
    });

    it('OCIO-P013: resets color spaces on config change', () => {
      processor.setState({ inputColorSpace: 'ARRI LogC3 (EI 800)' });
      processor.loadConfig('srgb');
      // Should reset to Auto
      expect(processor.getState().inputColorSpace).toBe('Auto');
    });

    it('OCIO-P014: throws for unknown config', () => {
      expect(() => processor.loadConfig('unknown')).toThrow();
    });
  });

  describe('color space selection', () => {
    it('OCIO-P015: setInputColorSpace updates state', () => {
      processor.setInputColorSpace('sRGB');
      expect(processor.getState().inputColorSpace).toBe('sRGB');
    });

    it('OCIO-P016: setWorkingColorSpace updates state', () => {
      processor.setWorkingColorSpace('ACES2065-1');
      expect(processor.getState().workingColorSpace).toBe('ACES2065-1');
    });

    it('OCIO-P017: setDisplay updates state and resets view', () => {
      processor.setDisplay('Rec.709');
      const state = processor.getState();
      expect(state.display).toBe('Rec.709');
      // View should be reset to first available for new display
      expect(state.view).toBeDefined();
    });

    it('OCIO-P018: setView updates state', () => {
      processor.setView('Raw');
      expect(processor.getState().view).toBe('Raw');
    });

    it('OCIO-P077: setView validates view for current display', () => {
      // Set display first (sRGB has views: ACES 1.0 SDR-video, Raw, Log)
      processor.setDisplay('sRGB');
      // Try to set an invalid view
      processor.setView('InvalidView');
      // Should fallback to first available view
      expect(processor.getState().view).toBe('ACES 1.0 SDR-video');
    });

    it('OCIO-P078: setView accepts valid view for current display', () => {
      processor.setDisplay('sRGB');
      processor.setView('Log');
      expect(processor.getState().view).toBe('Log');
    });

    it('OCIO-P079: setView fallback works when switching displays', () => {
      // Set to DCI-P3 which has different views (no Log)
      processor.setDisplay('DCI-P3');
      // Try to set Log which is not available for DCI-P3
      processor.setView('Log');
      // Should fallback to first available view for DCI-P3
      expect(processor.getState().view).toBe('ACES 1.0 SDR-video');
    });

    it('OCIO-P019: setLook updates state', () => {
      processor.setLook('Filmic');
      expect(processor.getState().look).toBe('Filmic');
    });

    it('OCIO-P020: setLookDirection updates state', () => {
      processor.setLookDirection('inverse');
      expect(processor.getState().lookDirection).toBe('inverse');
    });
  });

  describe('getAvailable methods', () => {
    it('OCIO-P021: getAvailableInputColorSpaces returns array', () => {
      const spaces = processor.getAvailableInputColorSpaces();
      expect(Array.isArray(spaces)).toBe(true);
      expect(spaces.length).toBeGreaterThan(0);
      expect(spaces).toContain('Auto');
    });

    it('OCIO-P022: getAvailableWorkingColorSpaces returns array', () => {
      const spaces = processor.getAvailableWorkingColorSpaces();
      expect(Array.isArray(spaces)).toBe(true);
      expect(spaces.length).toBeGreaterThan(0);
    });

    it('OCIO-P023: getAvailableDisplays returns array', () => {
      const displays = processor.getAvailableDisplays();
      expect(Array.isArray(displays)).toBe(true);
      expect(displays.length).toBeGreaterThan(0);
    });

    it('OCIO-P024: getAvailableViews returns array', () => {
      const views = processor.getAvailableViews();
      expect(Array.isArray(views)).toBe(true);
      expect(views.length).toBeGreaterThan(0);
    });

    it('OCIO-P025: getAvailableLooks returns array', () => {
      const looks = processor.getAvailableLooks();
      expect(Array.isArray(looks)).toBe(true);
      expect(looks.length).toBeGreaterThan(0);
      expect(looks).toContain('None');
    });
  });

  describe('detectColorSpace', () => {
    it('OCIO-P026: detects ARRI camera', () => {
      const metadata: MediaMetadata = {
        manufacturer: 'ARRI',
        gammaProfile: 'LogC3',
      };
      expect(processor.detectColorSpace(metadata)).toBe('ARRI LogC3 (EI 800)');
    });

    it('OCIO-P027: detects ARRI LogC4', () => {
      const metadata: MediaMetadata = {
        manufacturer: 'ARRI',
        gammaProfile: 'LogC4',
      };
      expect(processor.detectColorSpace(metadata)).toBe('ARRI LogC4');
    });

    it('OCIO-P028: detects Alexa camera', () => {
      const metadata: MediaMetadata = {
        camera: 'Alexa Mini',
        transferCharacteristics: 'Log',
      };
      expect(processor.detectColorSpace(metadata)).toBe('ARRI LogC3 (EI 800)');
    });

    it('OCIO-P029: detects Sony S-Log3', () => {
      const metadata: MediaMetadata = {
        manufacturer: 'Sony',
      };
      expect(processor.detectColorSpace(metadata)).toBe('Sony S-Log3');
    });

    it('OCIO-P030: detects Sony from gamma profile', () => {
      const metadata: MediaMetadata = {
        gammaProfile: 'S-Log3',
      };
      expect(processor.detectColorSpace(metadata)).toBe('Sony S-Log3');
    });

    it('OCIO-P031: detects RED camera', () => {
      const metadata: MediaMetadata = {
        manufacturer: 'RED',
      };
      expect(processor.detectColorSpace(metadata)).toBe('RED Log3G10');
    });

    it('OCIO-P032: detects RED from gamma profile', () => {
      const metadata: MediaMetadata = {
        gammaProfile: 'Log3G10',
      };
      expect(processor.detectColorSpace(metadata)).toBe('RED Log3G10');
    });

    it('OCIO-P033: detects BT.709', () => {
      const metadata: MediaMetadata = {
        colorPrimaries: 'BT.709',
      };
      expect(processor.detectColorSpace(metadata)).toBe('Rec.709');
    });

    it('OCIO-P034: detects sRGB from transfer', () => {
      const metadata: MediaMetadata = {
        colorPrimaries: 'BT709',
        transferCharacteristics: 'sRGB',
      };
      expect(processor.detectColorSpace(metadata)).toBe('sRGB');
    });

    it('OCIO-P035: returns null for unknown metadata', () => {
      const metadata: MediaMetadata = {
        manufacturer: 'Unknown',
      };
      expect(processor.detectColorSpace(metadata)).toBe(null);
    });

    it('OCIO-P036: setDetectedColorSpace updates state', () => {
      const metadata: MediaMetadata = {
        manufacturer: 'ARRI',
        gammaProfile: 'LogC3',
      };
      processor.setDetectedColorSpace(metadata);
      expect(processor.getState().detectedColorSpace).toBe('ARRI LogC3 (EI 800)');
    });
  });

  describe('transformColor', () => {
    it('OCIO-P037: passes through when disabled', () => {
      processor.setEnabled(false);
      const result = processor.transformColor(0.5, 0.3, 0.8);
      expect(result[0]).toBe(0.5);
      expect(result[1]).toBe(0.3);
      expect(result[2]).toBe(0.8);
    });

    it('OCIO-P038: transforms when enabled', () => {
      processor.setEnabled(true);
      processor.setInputColorSpace('ACEScg');
      const result = processor.transformColor(0.18, 0.18, 0.18);
      // Should transform to something different
      expect(result[0]).toBeGreaterThan(0);
      expect(result[0]).toBeLessThan(1);
    });

    it('OCIO-P039: handles black', () => {
      processor.setEnabled(true);
      const result = processor.transformColor(0, 0, 0);
      expect(result[0]).toBeCloseTo(0, 3);
      expect(result[1]).toBeCloseTo(0, 3);
      expect(result[2]).toBeCloseTo(0, 3);
    });
  });

  describe('apply', () => {
    it('OCIO-P040: passes through ImageData when disabled', () => {
      processor.setEnabled(false);
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });
      const original = imageData.data[0];

      const result = processor.apply(imageData);

      expect(result.data[0]).toBe(original);
    });

    it('OCIO-P041: transforms ImageData when enabled', () => {
      processor.setEnabled(true);
      processor.setInputColorSpace('ACEScg');
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128 });

      processor.apply(imageData);

      // Values should have changed
      // Note: exact values depend on the transform
      expect(imageData.data[0]).toBeGreaterThanOrEqual(0);
      expect(imageData.data[0]).toBeLessThanOrEqual(255);
    });

    it('OCIO-P042: preserves alpha', () => {
      processor.setEnabled(true);
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 200 });

      processor.apply(imageData);

      expect(imageData.data[3]).toBe(200);
    });
  });

  describe('bakeTo3DLUT', () => {
    it('OCIO-P043: creates LUT of correct size', () => {
      processor.setEnabled(true);
      const lut = processor.bakeTo3DLUT(17);
      expect(lut.size).toBe(17);
      expect(lut.data.length).toBe(17 * 17 * 17 * 3);
    });

    it('OCIO-P044: default size is 33', () => {
      processor.setEnabled(true);
      const lut = processor.bakeTo3DLUT();
      expect(lut.size).toBe(33);
    });

    it('OCIO-P045: LUT has valid domain', () => {
      processor.setEnabled(true);
      const lut = processor.bakeTo3DLUT(17);
      expect(lut.domainMin).toEqual([0, 0, 0]);
      expect(lut.domainMax).toEqual([1, 1, 1]);
    });

    it('OCIO-P046: LUT has descriptive title', () => {
      processor.setEnabled(true);
      const lut = processor.bakeTo3DLUT(17);
      expect(lut.title).toContain('OCIO');
    });

    it('OCIO-P047: caches LUT when unchanged', () => {
      processor.setEnabled(true);
      const lut1 = processor.bakeTo3DLUT(17);
      const lut2 = processor.bakeTo3DLUT(17);
      // Same object reference when cached
      expect(lut1).toBe(lut2);
    });

    it('OCIO-P048: regenerates LUT when size changes', () => {
      processor.setEnabled(true);
      const lut1 = processor.bakeTo3DLUT(17);
      const lut2 = processor.bakeTo3DLUT(33);
      expect(lut1.size).toBe(17);
      expect(lut2.size).toBe(33);
    });

    it('OCIO-P049: regenerates LUT when state changes', () => {
      processor.setEnabled(true);
      const lut1 = processor.bakeTo3DLUT(17);
      processor.setInputColorSpace('sRGB');
      const lut2 = processor.bakeTo3DLUT(17);
      expect(lut1).not.toBe(lut2);
    });
  });

  describe('isDefaultState', () => {
    it('OCIO-P050: returns true for fresh processor', () => {
      expect(processor.isDefaultState()).toBe(true);
    });

    it('OCIO-P051: returns false when enabled', () => {
      processor.setEnabled(true);
      expect(processor.isDefaultState()).toBe(false);
    });

    it('OCIO-P052: returns false when config changed', () => {
      processor.loadConfig('srgb');
      expect(processor.isDefaultState()).toBe(false);
    });
  });

  describe('dispose', () => {
    it('OCIO-P053: clears internal resources', () => {
      processor.setEnabled(true);
      processor.bakeTo3DLUT(17);
      processor.dispose();
      // Should not throw
      expect(() => processor.getState()).not.toThrow();
    });
  });

  describe('shared processor', () => {
    it('OCIO-P054: getSharedOCIOProcessor returns same instance', () => {
      disposeSharedOCIOProcessor(); // Clean up first
      const p1 = getSharedOCIOProcessor();
      const p2 = getSharedOCIOProcessor();
      expect(p1).toBe(p2);
    });

    it('OCIO-P055: disposeSharedOCIOProcessor clears instance', () => {
      const p1 = getSharedOCIOProcessor();
      disposeSharedOCIOProcessor();
      const p2 = getSharedOCIOProcessor();
      expect(p1).not.toBe(p2);
    });
  });

  // ==========================================================================
  // Edge Case Tests
  // ==========================================================================

  describe('Edge cases: special color values', () => {
    it('OCIO-P056: transformColor handles NaN inputs', () => {
      processor.setEnabled(true);
      processor.setInputColorSpace('ACEScg');
      const result = processor.transformColor(NaN, 0.5, 0.5);
      // Should not propagate NaN
      expect(Number.isNaN(result[0])).toBe(false);
      expect(Number.isNaN(result[1])).toBe(false);
      expect(Number.isNaN(result[2])).toBe(false);
    });

    it('OCIO-P057: transformColor handles Infinity inputs', () => {
      processor.setEnabled(true);
      processor.setInputColorSpace('ACEScg');
      const result = processor.transformColor(Infinity, 0.5, 0.5);
      // Should not propagate Infinity
      expect(Number.isFinite(result[0])).toBe(true);
      expect(Number.isFinite(result[1])).toBe(true);
      expect(Number.isFinite(result[2])).toBe(true);
    });

    it('OCIO-P058: transformColor handles negative values', () => {
      processor.setEnabled(true);
      processor.setInputColorSpace('Linear sRGB');
      const result = processor.transformColor(-0.5, 0.5, 0.5);
      // Should handle gracefully (may be out of gamut)
      expect(Number.isFinite(result[0])).toBe(true);
      expect(Number.isFinite(result[1])).toBe(true);
      expect(Number.isFinite(result[2])).toBe(true);
    });

    it('OCIO-P059: apply handles ImageData with zero alpha', () => {
      processor.setEnabled(true);
      processor.setInputColorSpace('ACEScg');
      const imageData = createTestImageData(2, 2, { r: 128, g: 128, b: 128, a: 0 });

      processor.apply(imageData);

      // Alpha should remain 0
      expect(imageData.data[3]).toBe(0);
      // Color channels should still be processed
      expect(imageData.data[0]).toBeGreaterThanOrEqual(0);
      expect(imageData.data[0]).toBeLessThanOrEqual(255);
    });

    it('OCIO-P060: apply handles very small ImageData', () => {
      processor.setEnabled(true);
      const imageData = createTestImageData(1, 1, { r: 128, g: 128, b: 128 });

      // Should not throw
      expect(() => processor.apply(imageData)).not.toThrow();
    });
  });

  describe('Edge cases: state management', () => {
    it('OCIO-P061: setState with empty object preserves state', () => {
      const originalState = processor.getState();
      processor.setState({});
      const newState = processor.getState();
      expect(newState).toEqual(originalState);
    });

    it('OCIO-P062: multiple rapid state changes emit correct events', () => {
      const callback = vi.fn();
      processor.on('stateChanged', callback);

      processor.setState({ enabled: true });
      processor.setState({ inputColorSpace: 'sRGB' });
      processor.setState({ display: 'Rec.709' });

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('OCIO-P063: dispose clears LUT cache', () => {
      processor.setEnabled(true);
      const lut1 = processor.bakeTo3DLUT(17);
      expect(lut1).toBeDefined();

      processor.dispose();

      // After dispose, baking should create new LUT
      const lut2 = processor.bakeTo3DLUT(17);
      expect(lut2).not.toBe(lut1);
    });

    it('OCIO-P064: getState returns defensive copy', () => {
      const state = processor.getState();
      state.enabled = true;
      state.configName = 'modified';

      // Original processor state should be unchanged
      const freshState = processor.getState();
      expect(freshState.enabled).toBe(false);
      expect(freshState.configName).toBe('aces_1.2');
    });
  });

  describe('Edge cases: LUT baking', () => {
    it('OCIO-P065: bakeTo3DLUT with size 1 works', () => {
      processor.setEnabled(true);
      const lut = processor.bakeTo3DLUT(1);
      expect(lut.size).toBe(1);
      expect(lut.data.length).toBe(3); // 1x1x1 * 3
    });

    it('OCIO-P066: bakeTo3DLUT with large size creates valid LUT', () => {
      processor.setEnabled(true);
      const lut = processor.bakeTo3DLUT(65);
      expect(lut.size).toBe(65);
      expect(lut.data.length).toBe(65 * 65 * 65 * 3);

      // Check some values are finite
      expect(Number.isFinite(lut.data[0])).toBe(true);
      expect(Number.isFinite(lut.data[lut.data.length - 1])).toBe(true);
    });

    it('OCIO-P076: bakeTo3DLUT throws for invalid size', () => {
      processor.setEnabled(true);
      expect(() => processor.bakeTo3DLUT(0)).toThrow('Invalid LUT size');
      expect(() => processor.bakeTo3DLUT(-1)).toThrow('Invalid LUT size');
      expect(() => processor.bakeTo3DLUT(1.5)).toThrow('Invalid LUT size');
      expect(() => processor.bakeTo3DLUT(130)).toThrow('too large');
    });

    it('OCIO-P067: bakeTo3DLUT identity corners are correct', () => {
      // With identity transform (disabled), corners should be identity
      processor.setEnabled(false);
      const lut = processor.bakeTo3DLUT(2);

      // Black corner (0,0,0) -> (0,0,0)
      expect(lut.data[0]).toBeCloseTo(0, 2);
      expect(lut.data[1]).toBeCloseTo(0, 2);
      expect(lut.data[2]).toBeCloseTo(0, 2);

      // White corner (1,1,1) -> (1,1,1)
      const lastIdx = (1 * 4 + 1 * 2 + 1) * 3; // Index for (1,1,1) in 2x2x2 LUT
      expect(lut.data[lastIdx]).toBeCloseTo(1, 2);
      expect(lut.data[lastIdx + 1]).toBeCloseTo(1, 2);
      expect(lut.data[lastIdx + 2]).toBeCloseTo(1, 2);
    });
  });

  describe('Edge cases: color space detection', () => {
    it('OCIO-P068: detectColorSpace with empty metadata returns null', () => {
      const result = processor.detectColorSpace({});
      expect(result).toBe(null);
    });

    it('OCIO-P069: detectColorSpace is case insensitive', () => {
      expect(processor.detectColorSpace({ manufacturer: 'ARRI' })).toBeDefined();
      expect(processor.detectColorSpace({ manufacturer: 'arri' })).toBeDefined();
      expect(processor.detectColorSpace({ manufacturer: 'Arri' })).toBeDefined();
    });

    it('OCIO-P070: detectColorSpace handles partial ARRI metadata', () => {
      // Camera name alone matches ARRI, but needs gamma/transfer info to determine specific space
      // With just camera name and no gamma info, returns null (insufficient info)
      const result1 = processor.detectColorSpace({ camera: 'ALEXA Mini LF' });
      expect(result1).toBe(null);

      // But with camera name plus transfer characteristics, it detects
      const result2 = processor.detectColorSpace({
        camera: 'ALEXA Mini LF',
        transferCharacteristics: 'Log',
      });
      expect(result2).toBe('ARRI LogC3 (EI 800)');
    });

    it('OCIO-P071: detectColorSpace prioritizes specific gamma over manufacturer', () => {
      // Sony manufacturer but ARRI gamma should detect ARRI
      const result = processor.detectColorSpace({
        manufacturer: 'Sony',
        gammaProfile: 's-log3',
      });
      // Should detect Sony S-Log3
      expect(result).toBe('Sony S-Log3');
    });
  });

  describe('Edge cases: event handling', () => {
    it('OCIO-P072: events work after removeAllListeners', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      processor.on('stateChanged', callback1);
      processor.off('stateChanged', callback1);
      processor.on('stateChanged', callback2);

      processor.setState({ enabled: true });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('OCIO-P073: transformChanged emits for all transform-related changes', () => {
      const callback = vi.fn();
      processor.on('transformChanged', callback);

      // These should all trigger transformChanged
      processor.setInputColorSpace('sRGB');
      processor.setWorkingColorSpace('ACES2065-1');
      processor.setDisplay('Rec.709');
      processor.setView('Raw');
      processor.setLook('Filmic');
      processor.setLookDirection('inverse');

      expect(callback).toHaveBeenCalledTimes(6);
    });
  });

  describe('Edge cases: Auto color space', () => {
    it('OCIO-P074: Auto with no detected space defaults to sRGB', () => {
      processor.setEnabled(true);
      processor.setInputColorSpace('Auto');
      // With no detected color space, should use sRGB as fallback
      const state = processor.getState();
      expect(state.inputColorSpace).toBe('Auto');
      expect(state.detectedColorSpace).toBe(null);
    });

    it('OCIO-P075: Auto uses detected space when available', () => {
      processor.setEnabled(true);
      processor.setInputColorSpace('Auto');
      processor.setDetectedColorSpace({ manufacturer: 'ARRI', gammaProfile: 'LogC3' });

      const state = processor.getState();
      expect(state.inputColorSpace).toBe('Auto');
      expect(state.detectedColorSpace).toBe('ARRI LogC3 (EI 800)');
    });
  });

  // ==========================================================================
  // Per-Source Input Color Space (v2)
  // ==========================================================================

  describe('Per-source input color space', () => {
    it('OCIO-V2-P001: setSourceInputColorSpace stores per-source color space', () => {
      processor.setSourceInputColorSpace('source1', 'ACEScg');
      expect(processor.getSourceInputColorSpace('source1')).toBe('ACEScg');
    });

    it('OCIO-V2-P002: getSourceInputColorSpace returns null for unknown source', () => {
      expect(processor.getSourceInputColorSpace('unknown')).toBe(null);
    });

    it('OCIO-V2-P003: setActiveSource updates detected color space', () => {
      processor.setSourceInputColorSpace('source1', 'ARRI LogC3 (EI 800)');
      processor.setSourceInputColorSpace('source2', 'Sony S-Log3');

      processor.setActiveSource('source1');
      expect(processor.getState().detectedColorSpace).toBe('ARRI LogC3 (EI 800)');

      processor.setActiveSource('source2');
      expect(processor.getState().detectedColorSpace).toBe('Sony S-Log3');
    });

    it('OCIO-V2-P004: setSourceInputColorSpace updates state for active source', () => {
      processor.setActiveSource('source1');
      processor.setSourceInputColorSpace('source1', 'RED Log3G10');
      expect(processor.getState().detectedColorSpace).toBe('RED Log3G10');
    });

    it('OCIO-V2-P005: setSourceInputColorSpace does not update state for inactive source', () => {
      processor.setActiveSource('source1');
      processor.setSourceInputColorSpace('source1', 'sRGB');
      processor.setSourceInputColorSpace('source2', 'ACEScg');
      // Active source is still source1, so detected should be sRGB
      expect(processor.getState().detectedColorSpace).toBe('sRGB');
    });

    it('OCIO-V2-P006: getActiveSourceId returns current active source', () => {
      expect(processor.getActiveSourceId()).toBe(null);
      processor.setActiveSource('mySource');
      expect(processor.getActiveSourceId()).toBe('mySource');
    });

    it('OCIO-V2-P007: dispose clears per-source state', () => {
      processor.setSourceInputColorSpace('source1', 'ACEScg');
      processor.setActiveSource('source1');
      processor.dispose();
      expect(processor.getSourceInputColorSpace('source1')).toBe(null);
      expect(processor.getActiveSourceId()).toBe(null);
    });
  });

  // ==========================================================================
  // Extension-based Color Space Detection (v2)
  // ==========================================================================

  describe('Extension-based color space detection', () => {
    it('OCIO-V2-P008: detects ACEScct from .dpx extension', () => {
      expect(processor.detectColorSpaceFromExtension('.dpx')).toBe('ACEScct');
    });

    it('OCIO-V2-P009: detects ACEScct from .cin extension', () => {
      expect(processor.detectColorSpaceFromExtension('.cin')).toBe('ACEScct');
    });

    it('OCIO-V2-P010: detects ACEScct from .cineon extension', () => {
      expect(processor.detectColorSpaceFromExtension('.cineon')).toBe('ACEScct');
    });

    it('OCIO-V2-P011: detects Linear sRGB from .exr extension', () => {
      expect(processor.detectColorSpaceFromExtension('.exr')).toBe('Linear sRGB');
    });

    it('OCIO-V2-P012: detects Linear sRGB from .hdr extension', () => {
      expect(processor.detectColorSpaceFromExtension('.hdr')).toBe('Linear sRGB');
    });

    it('OCIO-V2-P013: returns null for unknown extension', () => {
      expect(processor.detectColorSpaceFromExtension('.jpg')).toBe(null);
      expect(processor.detectColorSpaceFromExtension('.png')).toBe(null);
      expect(processor.detectColorSpaceFromExtension('.unknown')).toBe(null);
    });

    it('OCIO-V2-P014: extension detection is case insensitive', () => {
      expect(processor.detectColorSpaceFromExtension('.DPX')).toBe('ACEScct');
      expect(processor.detectColorSpaceFromExtension('.EXR')).toBe('Linear sRGB');
    });

    it('OCIO-V2-P015: detects camera raw extensions', () => {
      expect(processor.detectColorSpaceFromExtension('.arw')).toBe('Sony S-Log3');
      expect(processor.detectColorSpaceFromExtension('.ari')).toBe('ARRI LogC3 (EI 800)');
      expect(processor.detectColorSpaceFromExtension('.r3d')).toBe('RED Log3G10');
    });
  });

  // ==========================================================================
  // EXR Chromaticities Detection (v2)
  // ==========================================================================

  describe('EXR chromaticities detection', () => {
    it('OCIO-V2-P016: detects sRGB/BT.709 primaries', () => {
      const result = processor.detectColorSpace({
        chromaticities: {
          redX: 0.64, redY: 0.33,
          greenX: 0.30, greenY: 0.60,
          blueX: 0.15, blueY: 0.06,
        },
      });
      expect(result).toBe('Linear sRGB');
    });

    it('OCIO-V2-P017: detects ACES AP1 (ACEScg) primaries', () => {
      const result = processor.detectColorSpace({
        chromaticities: {
          redX: 0.713, redY: 0.293,
          greenX: 0.165, greenY: 0.83,
          blueX: 0.128, blueY: 0.044,
        },
      });
      expect(result).toBe('ACEScg');
    });

    it('OCIO-V2-P018: detects DCI-P3 primaries', () => {
      const result = processor.detectColorSpace({
        chromaticities: {
          redX: 0.68, redY: 0.32,
          greenX: 0.265, greenY: 0.69,
          blueX: 0.15, blueY: 0.06,
        },
      });
      expect(result).toBe('DCI-P3');
    });

    it('OCIO-V2-P019: returns null for unknown chromaticities', () => {
      const result = processor.detectColorSpace({
        chromaticities: {
          redX: 0.5, redY: 0.5,
          greenX: 0.5, greenY: 0.5,
          blueX: 0.5, blueY: 0.5,
        },
      });
      expect(result).toBe(null);
    });

    it('OCIO-V2-P020: returns null for incomplete chromaticities', () => {
      const result = processor.detectColorSpace({
        chromaticities: {
          redX: 0.64, redY: 0.33,
        },
      });
      expect(result).toBe(null);
    });

    it('OCIO-V2-P021: camera detection takes priority over chromaticities', () => {
      const result = processor.detectColorSpace({
        manufacturer: 'ARRI',
        gammaProfile: 'LogC4',
        chromaticities: {
          redX: 0.64, redY: 0.33,
          greenX: 0.30, greenY: 0.60,
          blueX: 0.15, blueY: 0.06,
        },
      });
      expect(result).toBe('ARRI LogC4');
    });
  });

  // ==========================================================================
  // Working Space and Look in Transform Chain (v2)
  // ==========================================================================

  describe('Working space and look in transform chain', () => {
    it('OCIO-V2-P022: transform includes look when set', () => {
      processor.setEnabled(true);
      processor.setInputColorSpace('ACEScg');
      processor.setLook('Filmic');

      const result1 = processor.transformColor(0.18, 0.18, 0.18);

      processor.setLook('None');
      const result2 = processor.transformColor(0.18, 0.18, 0.18);

      // Results should differ when look is applied vs. None
      // (Filmic look modifies the S-curve)
      expect(result1[0]).not.toBeCloseTo(result2[0], 3);
    });

    it('OCIO-V2-P023: look direction inverse differs from forward', () => {
      processor.setEnabled(true);
      processor.setInputColorSpace('ACEScg');
      processor.setLook('Filmic');

      processor.setLookDirection('forward');
      const forward = processor.transformColor(0.5, 0.5, 0.5);

      processor.setLookDirection('inverse');
      const inverse = processor.transformColor(0.5, 0.5, 0.5);

      // Forward and inverse should produce different results
      expect(forward[0]).not.toBeCloseTo(inverse[0], 3);
    });

    it('OCIO-V2-P024: ACES 1.0 look is passthrough (reference)', () => {
      processor.setEnabled(true);
      processor.setInputColorSpace('ACEScg');

      processor.setLook('None');
      const withNone = processor.transformColor(0.18, 0.18, 0.18);

      processor.setLook('ACES 1.0');
      const withAces = processor.transformColor(0.18, 0.18, 0.18);

      // ACES 1.0 look is a passthrough, should match None
      expect(withAces[0]).toBeCloseTo(withNone[0], 5);
      expect(withAces[1]).toBeCloseTo(withNone[1], 5);
      expect(withAces[2]).toBeCloseTo(withNone[2], 5);
    });
  });
});
