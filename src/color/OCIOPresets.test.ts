/**
 * OCIOPresets Tests
 *
 * Tests for workflow preset data validation, lookup helpers,
 * and OCIOStateManager.applyPreset integration.
 */

import { describe, it, expect } from 'vitest';
import {
  WORKFLOW_PRESETS,
  getPresetById,
  getPresetsByCategory,
  type WorkflowPreset,
} from './OCIOPresets';

describe('WORKFLOW_PRESETS', () => {
  it('PRESET-U001: contains 8 presets', () => {
    expect(WORKFLOW_PRESETS).toHaveLength(8);
  });

  it('PRESET-U002: all presets have unique IDs', () => {
    const ids = WORKFLOW_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('PRESET-U003: all presets have required fields', () => {
    for (const preset of WORKFLOW_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(['camera', 'aces', 'display', 'hdr']).toContain(preset.category);
      expect(preset.state.configName).toBeTruthy();
      expect(preset.state.inputColorSpace).toBeTruthy();
      expect(preset.state.workingColorSpace).toBeTruthy();
      expect(preset.state.display).toBeTruthy();
      expect(preset.state.view).toBeTruthy();
      expect(typeof preset.state.look).toBe('string');
    }
  });

  it('PRESET-U004: all camera presets use aces_1.2 config', () => {
    const cameraPresets = WORKFLOW_PRESETS.filter((p) => p.category === 'camera');
    expect(cameraPresets.length).toBeGreaterThan(0);
    for (const preset of cameraPresets) {
      expect(preset.state.configName).toBe('aces_1.2');
    }
  });

  it('PRESET-U005: linear-srgb preset uses srgb config', () => {
    const preset = WORKFLOW_PRESETS.find((p) => p.id === 'linear-srgb');
    expect(preset).toBeDefined();
    expect(preset!.state.configName).toBe('srgb');
  });

  it('PRESET-U006: all presets have look set to None', () => {
    for (const preset of WORKFLOW_PRESETS) {
      expect(preset.state.look).toBe('None');
    }
  });
});

describe('getPresetById', () => {
  it('PRESET-U010: returns correct preset for known ID', () => {
    const preset = getPresetById('arri-logc3-709');
    expect(preset).toBeDefined();
    expect(preset!.name).toBe('ARRI LogC3 \u2192 709');
    expect(preset!.state.inputColorSpace).toBe('ARRI LogC3 (EI 800)');
  });

  it('PRESET-U011: returns undefined for unknown ID', () => {
    expect(getPresetById('nonexistent')).toBeUndefined();
  });

  it('PRESET-U012: returns undefined for empty string', () => {
    expect(getPresetById('')).toBeUndefined();
  });

  it('PRESET-U013: returns each preset by its ID', () => {
    for (const preset of WORKFLOW_PRESETS) {
      const found = getPresetById(preset.id);
      expect(found).toBe(preset);
    }
  });
});

describe('getPresetsByCategory', () => {
  it('PRESET-U020: returns 4 camera presets', () => {
    const presets = getPresetsByCategory('camera');
    expect(presets).toHaveLength(4);
    for (const p of presets) {
      expect(p.category).toBe('camera');
    }
  });

  it('PRESET-U021: returns 1 aces preset', () => {
    const presets = getPresetsByCategory('aces');
    expect(presets).toHaveLength(1);
    expect(presets[0]!.category).toBe('aces');
  });

  it('PRESET-U022: returns 3 display presets', () => {
    const presets = getPresetsByCategory('display');
    expect(presets).toHaveLength(3);
    for (const p of presets) {
      expect(p.category).toBe('display');
    }
  });

  it('PRESET-U023: returns 0 hdr presets', () => {
    const presets = getPresetsByCategory('hdr');
    expect(presets).toHaveLength(0);
  });

  it('PRESET-U024: total across all categories equals total presets', () => {
    const categories: WorkflowPreset['category'][] = ['camera', 'aces', 'display', 'hdr'];
    const total = categories.reduce((sum, c) => sum + getPresetsByCategory(c).length, 0);
    expect(total).toBe(WORKFLOW_PRESETS.length);
  });
});
