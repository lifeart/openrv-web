/**
 * OCIOStateManager Tests
 *
 * Tests for OCIO state management, including applyPreset, getState, setState,
 * enable/disable, and state persistence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OCIOStateManager } from './OCIOStateManager';
import { OCIOProcessor } from '../../color/OCIOProcessor';
import { WORKFLOW_PRESETS, getPresetById } from '../../color/OCIOPresets';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('OCIOStateManager', () => {
  let manager: OCIOStateManager;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    manager = new OCIOStateManager();
  });

  describe('basic state management', () => {
    it('OCIO-SM-001: getState returns current state', () => {
      const state = manager.getState();
      expect(state).toBeDefined();
      expect(state.configName).toBeTruthy();
    });

    it('OCIO-SM-002: setState updates state', () => {
      manager.setState({ display: 'Rec.709' });
      expect(manager.getState().display).toBe('Rec.709');
    });

    it('OCIO-SM-003: isEnabled returns false by default', () => {
      expect(manager.isEnabled()).toBe(false);
    });

    it('OCIO-SM-004: setEnabled enables OCIO', () => {
      manager.setEnabled(true);
      expect(manager.isEnabled()).toBe(true);
    });

    it('OCIO-SM-005: setEnabled(false) disables OCIO', () => {
      manager.setEnabled(true);
      manager.setEnabled(false);
      expect(manager.isEnabled()).toBe(false);
    });

    it('OCIO-SM-006: reset returns to defaults', () => {
      manager.setEnabled(true);
      manager.setState({ display: 'Rec.709' });
      manager.reset();
      expect(manager.isEnabled()).toBe(false);
    });
  });

  describe('applyPreset', () => {
    it('OCIO-SM-010: applyPreset with valid ID sets full pipeline state', () => {
      const preset = getPresetById('arri-logc3-709')!;
      manager.applyPreset('arri-logc3-709');

      const state = manager.getState();
      expect(state.enabled).toBe(true);
      expect(state.configName).toBe(preset.state.configName);
      expect(state.inputColorSpace).toBe(preset.state.inputColorSpace);
      expect(state.workingColorSpace).toBe(preset.state.workingColorSpace);
      expect(state.display).toBe(preset.state.display);
      expect(state.view).toBe(preset.state.view);
      expect(state.look).toBe(preset.state.look);
    });

    it('OCIO-SM-011: applyPreset with unknown ID is a no-op', () => {
      const stateBefore = { ...manager.getState() };
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      manager.applyPreset('nonexistent');

      expect(manager.getState().enabled).toBe(stateBefore.enabled);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent'));
      warnSpy.mockRestore();
    });

    it('OCIO-SM-012: applyPreset with empty ID is a no-op', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      manager.applyPreset('');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('OCIO-SM-013: applyPreset enables OCIO even if previously disabled', () => {
      manager.setEnabled(false);
      expect(manager.isEnabled()).toBe(false);

      manager.applyPreset('linear-srgb');

      expect(manager.isEnabled()).toBe(true);
    });

    it('OCIO-SM-014: applyPreset emits stateChanged', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);

      manager.applyPreset('acescct-srgb');

      expect(callback).toHaveBeenCalled();
      const emittedState = callback.mock.calls[0][0];
      expect(emittedState.enabled).toBe(true);
      expect(emittedState.inputColorSpace).toBe('ACEScct');
    });

    it('OCIO-SM-015: all presets can be applied without error', () => {
      for (const preset of WORKFLOW_PRESETS) {
        expect(() => manager.applyPreset(preset.id)).not.toThrow();
        expect(manager.getState().enabled).toBe(true);
      }
    });
  });

  describe('processor access', () => {
    it('OCIO-SM-020: getProcessor returns OCIOProcessor', () => {
      const processor = manager.getProcessor();
      expect(processor).toBeInstanceOf(OCIOProcessor);
    });
  });

  describe('individual setters', () => {
    it('OCIO-SM-030: setInputColorSpace updates state', () => {
      manager.setInputColorSpace('Rec.2020');
      expect(manager.getState().inputColorSpace).toBe('Rec.2020');
    });

    it('OCIO-SM-031: setDisplay updates state', () => {
      manager.setDisplay('Rec.709');
      expect(manager.getState().display).toBe('Rec.709');
    });

    it('OCIO-SM-032: setView updates state', () => {
      manager.setView('Raw');
      expect(manager.getState().view).toBe('Raw');
    });

    it('OCIO-SM-033: setLook updates state', () => {
      manager.setLook('None');
      expect(manager.getState().look).toBe('None');
    });

    it('OCIO-SM-034: setWorkingColorSpace updates state', () => {
      manager.setWorkingColorSpace('ACES2065-1');
      expect(manager.getState().workingColorSpace).toBe('ACES2065-1');
    });

    it('OCIO-SM-035: setLookDirection updates state', () => {
      manager.setLookDirection('inverse');
      expect(manager.getState().lookDirection).toBe('inverse');
    });
  });

  describe('config management', () => {
    it('OCIO-SM-040: getAvailableConfigs returns non-empty array', () => {
      const configs = manager.getAvailableConfigs();
      expect(configs.length).toBeGreaterThan(0);
    });

    it('OCIO-SM-041: loadConfig switches config', () => {
      manager.loadConfig('srgb');
      expect(manager.getState().configName).toBe('srgb');
    });
  });

  describe('per-source color space persistence', () => {
    it('OCIO-SM-050: persists per-source color spaces to localStorage', () => {
      const processor = manager.getProcessor();
      processor.setSourceInputColorSpace('test.exr', 'Linear sRGB');
      processor.setSourceInputColorSpace('clip.dpx', 'ACEScct');

      // Flush the debounced save
      manager.flushPerSourceSave();

      const stored = localStorageMock.getItem('openrv-ocio-per-source');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed['test.exr']).toBe('Linear sRGB');
      expect(parsed['clip.dpx']).toBe('ACEScct');
    });

    it('OCIO-SM-051: loads per-source color spaces from localStorage on init', () => {
      // Pre-populate localStorage with per-source mappings
      localStorageMock.setItem(
        'openrv-ocio-per-source',
        JSON.stringify({ 'video.mov': 'Rec.709', 'scan.dpx': 'ACEScct' })
      );

      const newManager = new OCIOStateManager();
      const processor = newManager.getProcessor();

      expect(processor.getSourceInputColorSpace('video.mov')).toBe('Rec.709');
      expect(processor.getSourceInputColorSpace('scan.dpx')).toBe('ACEScct');
    });

    it('OCIO-SM-052: handles invalid per-source data in localStorage gracefully', () => {
      localStorageMock.setItem('openrv-ocio-per-source', 'not valid json{{{');

      expect(() => new OCIOStateManager()).not.toThrow();
    });

    it('OCIO-SM-053: handles non-object per-source data gracefully', () => {
      localStorageMock.setItem('openrv-ocio-per-source', JSON.stringify([1, 2, 3]));

      const newManager = new OCIOStateManager();
      const processor = newManager.getProcessor();
      expect(processor.getSourceInputColorSpace('anything')).toBe(null);
    });

    it('OCIO-SM-054: handles null per-source data gracefully', () => {
      localStorageMock.setItem('openrv-ocio-per-source', JSON.stringify(null));

      expect(() => new OCIOStateManager()).not.toThrow();
    });

    it('OCIO-SM-055: debounces per-source saves', () => {
      const processor = manager.getProcessor();
      processor.setSourceInputColorSpace('source1', 'sRGB');
      processor.setSourceInputColorSpace('source2', 'ACEScg');
      processor.setSourceInputColorSpace('source3', 'Rec.709');

      // At this point the save should be debounced, not yet written
      // (only the initial empty save from construction may be present)
      // Flush to verify all three are saved together
      manager.flushPerSourceSave();

      const stored = localStorageMock.getItem('openrv-ocio-per-source');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed['source1']).toBe('sRGB');
      expect(parsed['source2']).toBe('ACEScg');
      expect(parsed['source3']).toBe('Rec.709');
    });

    it('OCIO-SM-056: per-source mappings survive round-trip through localStorage', () => {
      const processor = manager.getProcessor();
      processor.setSourceInputColorSpace('my-file.exr', 'ACES2065-1');
      processor.setSourceInputColorSpace('clip.mov', 'Rec.2020');
      manager.flushPerSourceSave();

      // Create a new manager that should load from localStorage
      const newManager = new OCIOStateManager();
      const newProcessor = newManager.getProcessor();

      expect(newProcessor.getSourceInputColorSpace('my-file.exr')).toBe('ACES2065-1');
      expect(newProcessor.getSourceInputColorSpace('clip.mov')).toBe('Rec.2020');
    });

    it('OCIO-SM-057: flushPerSourceSave is a no-op when no pending save', () => {
      // Should not throw or error
      expect(() => manager.flushPerSourceSave()).not.toThrow();
    });

    it('OCIO-SM-058: validates per-source entries (skips non-string values)', () => {
      localStorageMock.setItem(
        'openrv-ocio-per-source',
        JSON.stringify({
          valid: 'sRGB',
          invalid: 42,
          alsoInvalid: true,
          nullVal: null,
        })
      );

      const newManager = new OCIOStateManager();
      const processor = newManager.getProcessor();
      expect(processor.getSourceInputColorSpace('valid')).toBe('sRGB');
      expect(processor.getSourceInputColorSpace('invalid')).toBe(null);
      expect(processor.getSourceInputColorSpace('alsoInvalid')).toBe(null);
      expect(processor.getSourceInputColorSpace('nullVal')).toBe(null);
    });
  });
});
