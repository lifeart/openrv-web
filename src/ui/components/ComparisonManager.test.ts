/**
 * ComparisonManager Unit Tests
 *
 * Comprehensive tests for the ComparisonManager class which manages comparison
 * state: wipe mode, A/B source, difference matte, blend modes, and quad view.
 * All features use mutual exclusion to avoid conflicting modes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ComparisonManager,
  DEFAULT_BLEND_MODE_STATE,
  DEFAULT_QUAD_VIEW_STATE,
} from './ComparisonManager';
import type {
  QuadViewState,
  CompareState,
} from './ComparisonManager';
import { DEFAULT_DIFFERENCE_MATTE_STATE } from './DifferenceMatteControl';
import { DEFAULT_STENCIL_BOX } from '../../core/types/wipe';

describe('ComparisonManager', () => {
  let manager: ComparisonManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ComparisonManager();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  // ===========================================================================
  // Initialization
  // ===========================================================================
  describe('initialization', () => {
    it('CM-001: should initialize with wipe mode off', () => {
      expect(manager.getWipeMode()).toBe('off');
    });

    it('CM-002: should initialize with wipe position 0.5', () => {
      expect(manager.getWipePosition()).toBe(0.5);
    });

    it('CM-003: should initialize with AB source A', () => {
      expect(manager.getABSource()).toBe('A');
    });

    it('CM-004: should initialize with AB not available', () => {
      expect(manager.isABAvailable()).toBe(false);
    });

    it('CM-005: should initialize with difference matte disabled', () => {
      expect(manager.isDifferenceMatteEnabled()).toBe(false);
      expect(manager.getDifferenceMatteState()).toEqual(DEFAULT_DIFFERENCE_MATTE_STATE);
    });

    it('CM-006: should initialize with blend mode off', () => {
      expect(manager.getBlendMode()).toBe('off');
      expect(manager.getBlendModeState()).toEqual(DEFAULT_BLEND_MODE_STATE);
    });

    it('CM-007: should initialize with quad view disabled', () => {
      expect(manager.isQuadViewEnabled()).toBe(false);
      expect(manager.getQuadViewState()).toEqual(DEFAULT_QUAD_VIEW_STATE);
    });

    it('CM-008: should initialize as not active', () => {
      expect(manager.isActive()).toBe(false);
    });

    it('CM-009: should initialize with default quad sources A, B, C, D', () => {
      expect(manager.getQuadSources()).toEqual(['A', 'B', 'C', 'D']);
    });

    it('CM-010: getState should return a complete initial state', () => {
      const state = manager.getState();
      expect(state.wipeMode).toBe('off');
      expect(state.wipePosition).toBe(0.5);
      expect(state.currentAB).toBe('A');
      expect(state.abAvailable).toBe(false);
      expect(state.differenceMatte).toEqual(DEFAULT_DIFFERENCE_MATTE_STATE);
      expect(state.blendMode).toEqual(DEFAULT_BLEND_MODE_STATE);
      expect(state.quadView.enabled).toBe(false);
      expect(state.quadView.sources).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  // ===========================================================================
  // Wipe Mode
  // ===========================================================================
  describe('wipe mode', () => {
    it('CM-011: setWipeMode should update wipe mode to horizontal', () => {
      manager.setWipeMode('horizontal');
      expect(manager.getWipeMode()).toBe('horizontal');
    });

    it('CM-012: setWipeMode should update wipe mode to vertical', () => {
      manager.setWipeMode('vertical');
      expect(manager.getWipeMode()).toBe('vertical');
    });

    it('CM-013: setWipeMode should update wipe mode to splitscreen-h', () => {
      manager.setWipeMode('splitscreen-h');
      expect(manager.getWipeMode()).toBe('splitscreen-h');
    });

    it('CM-014: setWipeMode should update wipe mode to splitscreen-v', () => {
      manager.setWipeMode('splitscreen-v');
      expect(manager.getWipeMode()).toBe('splitscreen-v');
    });

    it('CM-015: setWipeMode to off should turn off wipe', () => {
      manager.setWipeMode('horizontal');
      manager.setWipeMode('off');
      expect(manager.getWipeMode()).toBe('off');
    });

    it('CM-016: setWipeMode should not emit if mode is unchanged', () => {
      manager.setWipeMode('horizontal');
      const callback = vi.fn();
      manager.on('wipeModeChanged', callback);
      manager.setWipeMode('horizontal');
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-017: setWipeMode should emit wipeModeChanged event', () => {
      const callback = vi.fn();
      manager.on('wipeModeChanged', callback);
      manager.setWipeMode('vertical');
      expect(callback).toHaveBeenCalledWith('vertical');
    });

    it('CM-018: setWipeMode should emit stateChanged event', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);
      manager.setWipeMode('horizontal');
      expect(callback).toHaveBeenCalledTimes(1);
      const emittedState = callback.mock.calls[0][0] as CompareState;
      expect(emittedState.wipeMode).toBe('horizontal');
    });

    it('CM-019: setWipeMode should mark manager as active', () => {
      manager.setWipeMode('horizontal');
      expect(manager.isActive()).toBe(true);
    });

    it('CM-020: setWipeMode to off should mark manager as not active (all else default)', () => {
      manager.setWipeMode('horizontal');
      manager.setWipeMode('off');
      expect(manager.isActive()).toBe(false);
    });
  });

  // ===========================================================================
  // Wipe Mode Cycling
  // ===========================================================================
  describe('wipe mode cycling', () => {
    it('CM-021: cycleWipeMode should cycle off -> horizontal', () => {
      manager.cycleWipeMode();
      expect(manager.getWipeMode()).toBe('horizontal');
    });

    it('CM-022: cycleWipeMode should cycle horizontal -> vertical', () => {
      manager.setWipeMode('horizontal');
      manager.cycleWipeMode();
      expect(manager.getWipeMode()).toBe('vertical');
    });

    it('CM-023: cycleWipeMode should cycle vertical -> splitscreen-h', () => {
      manager.setWipeMode('vertical');
      manager.cycleWipeMode();
      expect(manager.getWipeMode()).toBe('splitscreen-h');
    });

    it('CM-024: cycleWipeMode should cycle splitscreen-h -> splitscreen-v', () => {
      manager.setWipeMode('splitscreen-h');
      manager.cycleWipeMode();
      expect(manager.getWipeMode()).toBe('splitscreen-v');
    });

    it('CM-025: cycleWipeMode should wrap splitscreen-v -> off', () => {
      manager.setWipeMode('splitscreen-v');
      manager.cycleWipeMode();
      expect(manager.getWipeMode()).toBe('off');
    });

    it('CM-026: cycleWipeMode full cycle returns to off', () => {
      for (let i = 0; i < 5; i++) {
        manager.cycleWipeMode();
      }
      expect(manager.getWipeMode()).toBe('off');
    });
  });

  // ===========================================================================
  // Wipe Position
  // ===========================================================================
  describe('wipe position', () => {
    it('CM-027: setWipePosition should update position', () => {
      manager.setWipePosition(0.3);
      expect(manager.getWipePosition()).toBe(0.3);
    });

    it('CM-028: setWipePosition should clamp below 0', () => {
      manager.setWipePosition(-0.5);
      expect(manager.getWipePosition()).toBe(0);
    });

    it('CM-029: setWipePosition should clamp above 1', () => {
      manager.setWipePosition(1.5);
      expect(manager.getWipePosition()).toBe(1);
    });

    it('CM-030: setWipePosition at 0 should be valid', () => {
      manager.setWipePosition(0);
      expect(manager.getWipePosition()).toBe(0);
    });

    it('CM-031: setWipePosition at 1 should be valid', () => {
      manager.setWipePosition(1);
      expect(manager.getWipePosition()).toBe(1);
    });

    it('CM-032: setWipePosition should not emit if position unchanged', () => {
      const callback = vi.fn();
      manager.on('wipePositionChanged', callback);
      manager.setWipePosition(0.5); // default is 0.5
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-033: setWipePosition should emit wipePositionChanged event', () => {
      const callback = vi.fn();
      manager.on('wipePositionChanged', callback);
      manager.setWipePosition(0.7);
      expect(callback).toHaveBeenCalledWith(0.7);
    });

    it('CM-034: setWipePosition should emit stateChanged event', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);
      manager.setWipePosition(0.2);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('CM-035: setWipePosition emits clamped value for out-of-range input', () => {
      const callback = vi.fn();
      manager.on('wipePositionChanged', callback);
      manager.setWipePosition(2.0);
      expect(callback).toHaveBeenCalledWith(1);
    });
  });

  // ===========================================================================
  // A/B Source
  // ===========================================================================
  describe('A/B source', () => {
    it('CM-036: setABSource should update current source', () => {
      manager.setABSource('B');
      expect(manager.getABSource()).toBe('B');
    });

    it('CM-037: setABSource should accept C and D sources', () => {
      manager.setABSource('C');
      expect(manager.getABSource()).toBe('C');
      manager.setABSource('D');
      expect(manager.getABSource()).toBe('D');
    });

    it('CM-038: setABSource should not emit if unchanged', () => {
      const callback = vi.fn();
      manager.on('abSourceChanged', callback);
      manager.setABSource('A'); // already A
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-039: setABSource should emit abSourceChanged event', () => {
      const callback = vi.fn();
      manager.on('abSourceChanged', callback);
      manager.setABSource('B');
      expect(callback).toHaveBeenCalledWith('B');
    });

    it('CM-040: setABSource should emit stateChanged event', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);
      manager.setABSource('C');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('CM-041: toggleAB should toggle from A to B when available', () => {
      manager.setABAvailable(true);
      manager.toggleAB();
      expect(manager.getABSource()).toBe('B');
    });

    it('CM-042: toggleAB should toggle from B to A when available', () => {
      manager.setABAvailable(true);
      manager.setABSource('B');
      manager.toggleAB();
      expect(manager.getABSource()).toBe('A');
    });

    it('CM-043: toggleAB should not toggle if AB not available', () => {
      manager.toggleAB();
      expect(manager.getABSource()).toBe('A');
    });

    it('CM-044: toggleAB should emit abToggled event', () => {
      manager.setABAvailable(true);
      const callback = vi.fn();
      manager.on('abToggled', callback);
      manager.toggleAB();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('CM-045: toggleAB should not emit abToggled if not available', () => {
      const callback = vi.fn();
      manager.on('abToggled', callback);
      manager.toggleAB();
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-046: toggleAB from C should toggle to A', () => {
      manager.setABAvailable(true);
      manager.setABSource('C');
      manager.toggleAB();
      expect(manager.getABSource()).toBe('A');
    });

    it('CM-047: toggleAB from D should toggle to A', () => {
      manager.setABAvailable(true);
      manager.setABSource('D');
      manager.toggleAB();
      expect(manager.getABSource()).toBe('A');
    });
  });

  // ===========================================================================
  // A/B Availability
  // ===========================================================================
  describe('A/B availability', () => {
    it('CM-048: setABAvailable should update availability', () => {
      manager.setABAvailable(true);
      expect(manager.isABAvailable()).toBe(true);
    });

    it('CM-049: setABAvailable should not change if same value', () => {
      manager.setABAvailable(false);
      expect(manager.isABAvailable()).toBe(false);
    });

    it('CM-050: setABAvailable true then false should be false', () => {
      manager.setABAvailable(true);
      manager.setABAvailable(false);
      expect(manager.isABAvailable()).toBe(false);
    });

    it('CM-051: isActive should be true when B selected and available', () => {
      manager.setABAvailable(true);
      manager.setABSource('B');
      expect(manager.isActive()).toBe(true);
    });

    it('CM-052: isActive should be false when B selected but not available', () => {
      manager.setABSource('B');
      expect(manager.isActive()).toBe(false);
    });
  });

  // ===========================================================================
  // Difference Matte
  // ===========================================================================
  describe('difference matte', () => {
    it('CM-053: toggleDifferenceMatte should enable when disabled', () => {
      manager.toggleDifferenceMatte();
      expect(manager.isDifferenceMatteEnabled()).toBe(true);
    });

    it('CM-054: toggleDifferenceMatte should disable when enabled', () => {
      manager.toggleDifferenceMatte();
      manager.toggleDifferenceMatte();
      expect(manager.isDifferenceMatteEnabled()).toBe(false);
    });

    it('CM-055: toggleDifferenceMatte should emit differenceMatteChanged', () => {
      const callback = vi.fn();
      manager.on('differenceMatteChanged', callback);
      manager.toggleDifferenceMatte();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({ enabled: true });
    });

    it('CM-056: toggleDifferenceMatte should emit stateChanged', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);
      manager.toggleDifferenceMatte();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('CM-057: setDifferenceMatteEnabled should enable difference matte', () => {
      manager.setDifferenceMatteEnabled(true);
      expect(manager.isDifferenceMatteEnabled()).toBe(true);
    });

    it('CM-058: setDifferenceMatteEnabled should disable difference matte', () => {
      manager.setDifferenceMatteEnabled(true);
      manager.setDifferenceMatteEnabled(false);
      expect(manager.isDifferenceMatteEnabled()).toBe(false);
    });

    it('CM-059: setDifferenceMatteEnabled should not emit if unchanged', () => {
      const callback = vi.fn();
      manager.on('differenceMatteChanged', callback);
      manager.setDifferenceMatteEnabled(false); // already false
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-060: setDifferenceMatteGain should update gain', () => {
      manager.setDifferenceMatteGain(5.0);
      expect(manager.getDifferenceMatteState().gain).toBe(5.0);
    });

    it('CM-061: setDifferenceMatteGain should clamp below 1.0', () => {
      manager.setDifferenceMatteGain(0.5);
      expect(manager.getDifferenceMatteState().gain).toBe(1.0);
    });

    it('CM-062: setDifferenceMatteGain should clamp above 10.0', () => {
      manager.setDifferenceMatteGain(15.0);
      expect(manager.getDifferenceMatteState().gain).toBe(10.0);
    });

    it('CM-063: setDifferenceMatteGain should not emit if unchanged', () => {
      const callback = vi.fn();
      manager.on('differenceMatteChanged', callback);
      manager.setDifferenceMatteGain(1.0); // already 1.0
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-064: setDifferenceMatteGain should emit differenceMatteChanged', () => {
      const callback = vi.fn();
      manager.on('differenceMatteChanged', callback);
      manager.setDifferenceMatteGain(3.0);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({ gain: 3.0 });
    });

    it('CM-065: toggleDifferenceMatteHeatmap should enable heatmap', () => {
      manager.toggleDifferenceMatteHeatmap();
      expect(manager.getDifferenceMatteState().heatmap).toBe(true);
    });

    it('CM-066: toggleDifferenceMatteHeatmap should disable heatmap when enabled', () => {
      manager.toggleDifferenceMatteHeatmap();
      manager.toggleDifferenceMatteHeatmap();
      expect(manager.getDifferenceMatteState().heatmap).toBe(false);
    });

    it('CM-067: setDifferenceMatteHeatmap should set heatmap', () => {
      manager.setDifferenceMatteHeatmap(true);
      expect(manager.getDifferenceMatteState().heatmap).toBe(true);
    });

    it('CM-068: setDifferenceMatteHeatmap should not emit if unchanged', () => {
      const callback = vi.fn();
      manager.on('differenceMatteChanged', callback);
      manager.setDifferenceMatteHeatmap(false); // already false
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-069: setDifferenceMatteHeatmap should emit differenceMatteChanged', () => {
      const callback = vi.fn();
      manager.on('differenceMatteChanged', callback);
      manager.setDifferenceMatteHeatmap(true);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({ heatmap: true });
    });

    it('CM-070: getDifferenceMatteState should return a copy', () => {
      const state1 = manager.getDifferenceMatteState();
      const state2 = manager.getDifferenceMatteState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('CM-071: isActive should be true when difference matte is enabled', () => {
      manager.setDifferenceMatteEnabled(true);
      expect(manager.isActive()).toBe(true);
    });
  });

  // ===========================================================================
  // Difference Matte - Mutual Exclusion
  // ===========================================================================
  describe('difference matte mutual exclusion', () => {
    it('CM-072: enabling difference matte should disable wipe mode', () => {
      manager.setWipeMode('horizontal');
      manager.toggleDifferenceMatte();
      expect(manager.getWipeMode()).toBe('off');
    });

    it('CM-073: enabling difference matte should emit wipeModeChanged off', () => {
      manager.setWipeMode('horizontal');
      const callback = vi.fn();
      manager.on('wipeModeChanged', callback);
      manager.toggleDifferenceMatte();
      expect(callback).toHaveBeenCalledWith('off');
    });

    it('CM-074: enabling difference matte should disable quad view', () => {
      manager.setQuadViewEnabled(true);
      manager.setDifferenceMatteEnabled(true);
      expect(manager.isQuadViewEnabled()).toBe(false);
    });

    it('CM-075: enabling difference matte should emit quadViewChanged', () => {
      manager.setQuadViewEnabled(true);
      const callback = vi.fn();
      manager.on('quadViewChanged', callback);
      manager.setDifferenceMatteEnabled(true);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
    });

    it('CM-076: enabling difference matte should not affect wipe if already off', () => {
      const callback = vi.fn();
      manager.on('wipeModeChanged', callback);
      manager.toggleDifferenceMatte();
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-077: disabling difference matte should not re-enable wipe mode', () => {
      manager.setWipeMode('horizontal');
      manager.toggleDifferenceMatte(); // enables, disables wipe
      manager.toggleDifferenceMatte(); // disables diff matte
      expect(manager.getWipeMode()).toBe('off');
    });

    it('CM-078: setDifferenceMatteEnabled true should disable wipe', () => {
      manager.setWipeMode('vertical');
      manager.setDifferenceMatteEnabled(true);
      expect(manager.getWipeMode()).toBe('off');
    });

    it('CM-079: setDifferenceMatteEnabled true should disable quad view', () => {
      manager.setQuadViewEnabled(true);
      manager.setDifferenceMatteEnabled(true);
      expect(manager.isQuadViewEnabled()).toBe(false);
    });
  });

  // ===========================================================================
  // Blend Modes
  // ===========================================================================
  describe('blend modes', () => {
    it('CM-080: setBlendMode should update blend mode', () => {
      manager.setBlendMode('onionskin');
      expect(manager.getBlendMode()).toBe('onionskin');
    });

    it('CM-081: setBlendMode should support flicker', () => {
      manager.setBlendMode('flicker');
      expect(manager.getBlendMode()).toBe('flicker');
    });

    it('CM-082: setBlendMode should support blend', () => {
      manager.setBlendMode('blend');
      expect(manager.getBlendMode()).toBe('blend');
    });

    it('CM-083: setBlendMode off should turn off blend', () => {
      manager.setBlendMode('onionskin');
      manager.setBlendMode('off');
      expect(manager.getBlendMode()).toBe('off');
    });

    it('CM-084: setBlendMode should not emit if unchanged', () => {
      const callback = vi.fn();
      manager.on('blendModeChanged', callback);
      manager.setBlendMode('off'); // already off
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-085: setBlendMode should emit blendModeChanged', () => {
      const callback = vi.fn();
      manager.on('blendModeChanged', callback);
      manager.setBlendMode('onionskin');
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({ mode: 'onionskin' });
    });

    it('CM-086: setBlendMode should emit stateChanged', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);
      manager.setBlendMode('blend');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('CM-087: toggleBlendMode should enable a blend mode when off', () => {
      manager.toggleBlendMode('onionskin');
      expect(manager.getBlendMode()).toBe('onionskin');
    });

    it('CM-088: toggleBlendMode should turn off if same mode is active', () => {
      manager.setBlendMode('onionskin');
      manager.toggleBlendMode('onionskin');
      expect(manager.getBlendMode()).toBe('off');
    });

    it('CM-089: toggleBlendMode should switch from one mode to another', () => {
      manager.setBlendMode('onionskin');
      manager.toggleBlendMode('flicker');
      expect(manager.getBlendMode()).toBe('flicker');
    });

    it('CM-090: getBlendModeState should return a copy', () => {
      const state1 = manager.getBlendModeState();
      const state2 = manager.getBlendModeState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('CM-091: isActive should be true when blend mode is active', () => {
      manager.setBlendMode('blend');
      expect(manager.isActive()).toBe(true);
    });
  });

  // ===========================================================================
  // Blend Mode - Mutual Exclusion
  // ===========================================================================
  describe('blend mode mutual exclusion', () => {
    it('CM-092: enabling blend mode should disable wipe', () => {
      manager.setWipeMode('horizontal');
      manager.setBlendMode('onionskin');
      expect(manager.getWipeMode()).toBe('off');
    });

    it('CM-093: enabling blend mode should emit wipeModeChanged off', () => {
      manager.setWipeMode('horizontal');
      const callback = vi.fn();
      manager.on('wipeModeChanged', callback);
      manager.setBlendMode('onionskin');
      expect(callback).toHaveBeenCalledWith('off');
    });

    it('CM-094: enabling blend mode should disable difference matte', () => {
      manager.setDifferenceMatteEnabled(true);
      manager.setBlendMode('blend');
      expect(manager.isDifferenceMatteEnabled()).toBe(false);
    });

    it('CM-095: enabling blend mode should emit differenceMatteChanged', () => {
      manager.setDifferenceMatteEnabled(true);
      const callback = vi.fn();
      manager.on('differenceMatteChanged', callback);
      manager.setBlendMode('blend');
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({ enabled: false });
    });

    it('CM-096: enabling blend mode should disable quad view', () => {
      manager.setQuadViewEnabled(true);
      manager.setBlendMode('onionskin');
      expect(manager.isQuadViewEnabled()).toBe(false);
    });

    it('CM-097: enabling blend mode should emit quadViewChanged', () => {
      manager.setQuadViewEnabled(true);
      const callback = vi.fn();
      manager.on('quadViewChanged', callback);
      manager.setBlendMode('blend');
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
    });

    it('CM-098: blend mode off should not disable other modes', () => {
      manager.setWipeMode('horizontal');
      manager.setBlendMode('off'); // already off, no-op
      expect(manager.getWipeMode()).toBe('horizontal');
    });

    it('CM-099: switching blend modes should not re-enable conflicting modes', () => {
      manager.setWipeMode('horizontal');
      manager.setBlendMode('onionskin'); // disables wipe
      manager.setBlendMode('blend'); // switch blend type
      expect(manager.getWipeMode()).toBe('off');
    });

    it('CM-100: enabling blend mode should not emit wipeChanged if wipe already off', () => {
      const callback = vi.fn();
      manager.on('wipeModeChanged', callback);
      manager.setBlendMode('onionskin');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Onion Skin Opacity
  // ===========================================================================
  describe('onion skin opacity', () => {
    it('CM-101: setOnionOpacity should update opacity', () => {
      manager.setOnionOpacity(0.3);
      expect(manager.getOnionOpacity()).toBe(0.3);
    });

    it('CM-102: setOnionOpacity should clamp below 0', () => {
      manager.setOnionOpacity(-0.5);
      expect(manager.getOnionOpacity()).toBe(0);
    });

    it('CM-103: setOnionOpacity should clamp above 1', () => {
      manager.setOnionOpacity(1.5);
      expect(manager.getOnionOpacity()).toBe(1);
    });

    it('CM-104: setOnionOpacity should not emit if unchanged', () => {
      const callback = vi.fn();
      manager.on('blendModeChanged', callback);
      manager.setOnionOpacity(0.5); // default is 0.5
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-105: setOnionOpacity should emit blendModeChanged', () => {
      const callback = vi.fn();
      manager.on('blendModeChanged', callback);
      manager.setOnionOpacity(0.8);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({ onionOpacity: 0.8 });
    });

    it('CM-106: default onion opacity should be 0.5', () => {
      expect(manager.getOnionOpacity()).toBe(0.5);
    });
  });

  // ===========================================================================
  // Flicker Rate
  // ===========================================================================
  describe('flicker rate', () => {
    it('CM-107: setFlickerRate should update rate', () => {
      manager.setFlickerRate(10);
      expect(manager.getFlickerRate()).toBe(10);
    });

    it('CM-108: setFlickerRate should clamp below 1', () => {
      manager.setFlickerRate(0);
      expect(manager.getFlickerRate()).toBe(1);
    });

    it('CM-109: setFlickerRate should clamp above 30', () => {
      manager.setFlickerRate(50);
      expect(manager.getFlickerRate()).toBe(30);
    });

    it('CM-110: setFlickerRate should round to integer', () => {
      manager.setFlickerRate(5.7);
      expect(manager.getFlickerRate()).toBe(6);
    });

    it('CM-111: setFlickerRate should not emit if unchanged', () => {
      const callback = vi.fn();
      manager.on('blendModeChanged', callback);
      manager.setFlickerRate(4); // default is 4
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-112: setFlickerRate should emit blendModeChanged', () => {
      const callback = vi.fn();
      manager.on('blendModeChanged', callback);
      manager.setFlickerRate(8);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({ flickerRate: 8 });
    });

    it('CM-113: default flicker rate should be 4', () => {
      expect(manager.getFlickerRate()).toBe(4);
    });
  });

  // ===========================================================================
  // Flicker Interval (Timer-based)
  // ===========================================================================
  describe('flicker interval', () => {
    it('CM-114: flicker frame should start at 0', () => {
      expect(manager.getFlickerFrame()).toBe(0);
    });

    it('CM-115: setting flicker mode should start flicker interval', () => {
      manager.setBlendMode('flicker');
      // Default rate is 4Hz = 250ms interval
      expect(manager.getFlickerFrame()).toBe(0);
      vi.advanceTimersByTime(250);
      expect(manager.getFlickerFrame()).toBe(1);
    });

    it('CM-116: flicker should alternate between 0 and 1', () => {
      manager.setBlendMode('flicker');
      vi.advanceTimersByTime(250);
      expect(manager.getFlickerFrame()).toBe(1);
      vi.advanceTimersByTime(250);
      expect(manager.getFlickerFrame()).toBe(0);
      vi.advanceTimersByTime(250);
      expect(manager.getFlickerFrame()).toBe(1);
    });

    it('CM-117: flicker should emit blendModeChanged on each tick', () => {
      manager.setBlendMode('flicker');
      const callback = vi.fn();
      manager.on('blendModeChanged', callback);
      vi.advanceTimersByTime(250);
      expect(callback).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(250);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('CM-118: switching away from flicker should stop interval', () => {
      manager.setBlendMode('flicker');
      vi.advanceTimersByTime(250);
      expect(manager.getFlickerFrame()).toBe(1);
      manager.setBlendMode('off');
      expect(manager.getFlickerFrame()).toBe(0);
      vi.advanceTimersByTime(500);
      // Frame should remain 0 since interval was stopped
      expect(manager.getFlickerFrame()).toBe(0);
    });

    it('CM-119: changing flicker rate while active should restart interval', () => {
      manager.setBlendMode('flicker');
      // Default 4Hz = 250ms
      vi.advanceTimersByTime(125); // half-way through first tick
      manager.setFlickerRate(10); // 10Hz = 100ms
      // Old interval was cleared, new one started
      vi.advanceTimersByTime(100);
      expect(manager.getFlickerFrame()).toBe(1);
    });

    it('CM-120: changing flicker rate when not in flicker mode should not start interval', () => {
      manager.setFlickerRate(10);
      vi.advanceTimersByTime(500);
      expect(manager.getFlickerFrame()).toBe(0);
    });

    it('CM-121: dispose should stop flicker interval', () => {
      manager.setBlendMode('flicker');
      vi.advanceTimersByTime(250);
      expect(manager.getFlickerFrame()).toBe(1);
      manager.dispose();
      vi.advanceTimersByTime(1000);
      // After dispose, no more ticks should happen
      // The frame was reset to 0 by stopFlicker in dispose
      expect(manager.getFlickerFrame()).toBe(0);
    });

    it('CM-122: switching from flicker to onionskin should stop flicker', () => {
      manager.setBlendMode('flicker');
      vi.advanceTimersByTime(250);
      expect(manager.getFlickerFrame()).toBe(1);
      manager.setBlendMode('onionskin');
      expect(manager.getFlickerFrame()).toBe(0);
      vi.advanceTimersByTime(1000);
      expect(manager.getFlickerFrame()).toBe(0);
    });

    it('CM-123: toggling flicker off should stop interval', () => {
      manager.toggleBlendMode('flicker');
      vi.advanceTimersByTime(250);
      expect(manager.getFlickerFrame()).toBe(1);
      manager.toggleBlendMode('flicker'); // toggle off
      expect(manager.getFlickerFrame()).toBe(0);
    });
  });

  // ===========================================================================
  // Blend Ratio
  // ===========================================================================
  describe('blend ratio', () => {
    it('CM-124: setBlendRatio should update ratio', () => {
      manager.setBlendRatio(0.3);
      expect(manager.getBlendRatio()).toBe(0.3);
    });

    it('CM-125: setBlendRatio should clamp below 0', () => {
      manager.setBlendRatio(-0.5);
      expect(manager.getBlendRatio()).toBe(0);
    });

    it('CM-126: setBlendRatio should clamp above 1', () => {
      manager.setBlendRatio(1.5);
      expect(manager.getBlendRatio()).toBe(1);
    });

    it('CM-127: setBlendRatio should not emit if unchanged', () => {
      const callback = vi.fn();
      manager.on('blendModeChanged', callback);
      manager.setBlendRatio(0.5); // default is 0.5
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-128: setBlendRatio should emit blendModeChanged', () => {
      const callback = vi.fn();
      manager.on('blendModeChanged', callback);
      manager.setBlendRatio(0.8);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({ blendRatio: 0.8 });
    });

    it('CM-129: default blend ratio should be 0.5', () => {
      expect(manager.getBlendRatio()).toBe(0.5);
    });
  });

  // ===========================================================================
  // Quad View
  // ===========================================================================
  describe('quad view', () => {
    it('CM-130: setQuadViewEnabled should enable quad view', () => {
      manager.setQuadViewEnabled(true);
      expect(manager.isQuadViewEnabled()).toBe(true);
    });

    it('CM-131: setQuadViewEnabled should disable quad view', () => {
      manager.setQuadViewEnabled(true);
      manager.setQuadViewEnabled(false);
      expect(manager.isQuadViewEnabled()).toBe(false);
    });

    it('CM-132: setQuadViewEnabled should not emit if unchanged', () => {
      const callback = vi.fn();
      manager.on('quadViewChanged', callback);
      manager.setQuadViewEnabled(false); // already false
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-133: setQuadViewEnabled should emit quadViewChanged', () => {
      const callback = vi.fn();
      manager.on('quadViewChanged', callback);
      manager.setQuadViewEnabled(true);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({ enabled: true });
    });

    it('CM-134: setQuadViewEnabled should emit stateChanged', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);
      manager.setQuadViewEnabled(true);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('CM-135: toggleQuadView should enable when disabled', () => {
      manager.toggleQuadView();
      expect(manager.isQuadViewEnabled()).toBe(true);
    });

    it('CM-136: toggleQuadView should disable when enabled', () => {
      manager.setQuadViewEnabled(true);
      manager.toggleQuadView();
      expect(manager.isQuadViewEnabled()).toBe(false);
    });

    it('CM-137: setQuadSource should update a quadrant source', () => {
      manager.setQuadSource(0, 'D');
      expect(manager.getQuadSources()[0]).toBe('D');
    });

    it('CM-138: setQuadSource should update each quadrant independently', () => {
      manager.setQuadSource(0, 'B');
      manager.setQuadSource(1, 'C');
      manager.setQuadSource(2, 'D');
      manager.setQuadSource(3, 'A');
      expect(manager.getQuadSources()).toEqual(['B', 'C', 'D', 'A']);
    });

    it('CM-139: setQuadSource should not emit if unchanged', () => {
      const callback = vi.fn();
      manager.on('quadViewChanged', callback);
      manager.setQuadSource(0, 'A'); // already A
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-140: setQuadSource should emit quadViewChanged', () => {
      const callback = vi.fn();
      manager.on('quadViewChanged', callback);
      manager.setQuadSource(1, 'D');
      expect(callback).toHaveBeenCalledTimes(1);
      const emitted = callback.mock.calls[0][0] as QuadViewState;
      expect(emitted.sources[1]).toBe('D');
    });

    it('CM-141: getQuadSources should return a copy', () => {
      const sources1 = manager.getQuadSources();
      const sources2 = manager.getQuadSources();
      expect(sources1).toEqual(sources2);
      expect(sources1).not.toBe(sources2);
    });

    it('CM-142: getQuadViewState should return a copy', () => {
      const state1 = manager.getQuadViewState();
      const state2 = manager.getQuadViewState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('CM-143: isActive should be true when quad view is enabled', () => {
      manager.setQuadViewEnabled(true);
      expect(manager.isActive()).toBe(true);
    });
  });

  // ===========================================================================
  // Quad View - Mutual Exclusion
  // ===========================================================================
  describe('quad view mutual exclusion', () => {
    it('CM-144: enabling quad view should disable wipe mode', () => {
      manager.setWipeMode('horizontal');
      manager.setQuadViewEnabled(true);
      expect(manager.getWipeMode()).toBe('off');
    });

    it('CM-145: enabling quad view should emit wipeModeChanged off', () => {
      manager.setWipeMode('vertical');
      const callback = vi.fn();
      manager.on('wipeModeChanged', callback);
      manager.setQuadViewEnabled(true);
      expect(callback).toHaveBeenCalledWith('off');
    });

    it('CM-146: enabling quad view should disable blend mode', () => {
      manager.setBlendMode('onionskin');
      manager.setQuadViewEnabled(true);
      expect(manager.getBlendMode()).toBe('off');
    });

    it('CM-147: enabling quad view should emit blendModeChanged off', () => {
      manager.setBlendMode('blend');
      const callback = vi.fn();
      manager.on('blendModeChanged', callback);
      manager.setQuadViewEnabled(true);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({ mode: 'off' });
    });

    it('CM-148: enabling quad view should disable difference matte', () => {
      manager.setDifferenceMatteEnabled(true);
      manager.setQuadViewEnabled(true);
      expect(manager.isDifferenceMatteEnabled()).toBe(false);
    });

    it('CM-149: enabling quad view should emit differenceMatteChanged', () => {
      manager.setDifferenceMatteEnabled(true);
      const callback = vi.fn();
      manager.on('differenceMatteChanged', callback);
      manager.setQuadViewEnabled(true);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toMatchObject({ enabled: false });
    });

    it('CM-150: enabling quad view should stop flicker interval', () => {
      manager.setBlendMode('flicker');
      vi.advanceTimersByTime(250);
      expect(manager.getFlickerFrame()).toBe(1);
      manager.setQuadViewEnabled(true);
      expect(manager.getFlickerFrame()).toBe(0);
      vi.advanceTimersByTime(1000);
      expect(manager.getFlickerFrame()).toBe(0);
    });

    it('CM-151: disabling quad view should not re-enable other modes', () => {
      manager.setWipeMode('horizontal');
      manager.setQuadViewEnabled(true); // disables wipe
      manager.setQuadViewEnabled(false); // disables quad view
      expect(manager.getWipeMode()).toBe('off');
    });

    it('CM-152: enabling quad view should not emit wipeChanged if wipe already off', () => {
      const callback = vi.fn();
      manager.on('wipeModeChanged', callback);
      manager.setQuadViewEnabled(true);
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-153: enabling quad view should not emit blendChanged if blend already off', () => {
      const callback = vi.fn();
      manager.on('blendModeChanged', callback);
      manager.setQuadViewEnabled(true);
      expect(callback).not.toHaveBeenCalled();
    });

    it('CM-154: enabling quad view should not emit diffMatteChanged if already disabled', () => {
      const callback = vi.fn();
      manager.on('differenceMatteChanged', callback);
      manager.setQuadViewEnabled(true);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Wipe Mode - Mutual Exclusion with Quad View
  // ===========================================================================
  describe('wipe mode mutual exclusion with quad view', () => {
    it('CM-155: enabling wipe mode should disable quad view', () => {
      manager.setQuadViewEnabled(true);
      manager.setWipeMode('horizontal');
      expect(manager.isQuadViewEnabled()).toBe(false);
    });

    it('CM-156: enabling wipe mode should emit quadViewChanged', () => {
      manager.setQuadViewEnabled(true);
      const callback = vi.fn();
      manager.on('quadViewChanged', callback);
      manager.setWipeMode('vertical');
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
    });

    it('CM-157: setting wipe to off should not emit quadViewChanged', () => {
      manager.setQuadViewEnabled(true);
      // Set wipe to horizontal first, which disables quad
      manager.setWipeMode('horizontal');
      const callback = vi.fn();
      manager.on('quadViewChanged', callback);
      manager.setWipeMode('off');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // computeStencilBoxes
  // ===========================================================================
  describe('computeStencilBoxes', () => {
    it('CM-158: should return full boxes when wipe is off', () => {
      const [boxA, boxB] = manager.computeStencilBoxes();
      expect(boxA).toEqual([...DEFAULT_STENCIL_BOX]);
      expect(boxB).toEqual([...DEFAULT_STENCIL_BOX]);
    });

    it('CM-159: should compute horizontal wipe boxes at 0.5', () => {
      manager.setWipeMode('horizontal');
      const [boxA, boxB] = manager.computeStencilBoxes();
      expect(boxA).toEqual([0, 0.5, 0, 1]);
      expect(boxB).toEqual([0.5, 1, 0, 1]);
    });

    it('CM-160: should compute horizontal wipe boxes at 0.3', () => {
      manager.setWipeMode('horizontal');
      manager.setWipePosition(0.3);
      const [boxA, boxB] = manager.computeStencilBoxes();
      expect(boxA).toEqual([0, 0.3, 0, 1]);
      expect(boxB).toEqual([0.3, 1, 0, 1]);
    });

    it('CM-161: should compute vertical wipe boxes at 0.5', () => {
      manager.setWipeMode('vertical');
      const [boxA, boxB] = manager.computeStencilBoxes();
      expect(boxA).toEqual([0, 1, 0, 0.5]);
      expect(boxB).toEqual([0, 1, 0.5, 1]);
    });

    it('CM-162: should compute vertical wipe boxes at 0.7', () => {
      manager.setWipeMode('vertical');
      manager.setWipePosition(0.7);
      const [boxA, boxB] = manager.computeStencilBoxes();
      expect(boxA).toEqual([0, 1, 0, 0.7]);
      expect(boxB).toEqual([0, 1, 0.7, 1]);
    });

    it('CM-163: should compute splitscreen-h boxes (same as horizontal)', () => {
      manager.setWipeMode('splitscreen-h');
      const [boxA, boxB] = manager.computeStencilBoxes();
      expect(boxA).toEqual([0, 0.5, 0, 1]);
      expect(boxB).toEqual([0.5, 1, 0, 1]);
    });

    it('CM-164: should compute splitscreen-v boxes (same as vertical)', () => {
      manager.setWipeMode('splitscreen-v');
      const [boxA, boxB] = manager.computeStencilBoxes();
      expect(boxA).toEqual([0, 1, 0, 0.5]);
      expect(boxB).toEqual([0, 1, 0.5, 1]);
    });

    it('CM-165: horizontal wipe at position 0 should give A no space, B full', () => {
      manager.setWipeMode('horizontal');
      manager.setWipePosition(0);
      const [boxA, boxB] = manager.computeStencilBoxes();
      expect(boxA).toEqual([0, 0, 0, 1]);
      expect(boxB).toEqual([0, 1, 0, 1]);
    });

    it('CM-166: horizontal wipe at position 1 should give A full, B no space', () => {
      manager.setWipeMode('horizontal');
      manager.setWipePosition(1);
      const [boxA, boxB] = manager.computeStencilBoxes();
      expect(boxA).toEqual([0, 1, 0, 1]);
      expect(boxB).toEqual([1, 1, 0, 1]);
    });

    it('CM-167: vertical wipe at position 0 should give A no space, B full', () => {
      manager.setWipeMode('vertical');
      manager.setWipePosition(0);
      const [boxA, boxB] = manager.computeStencilBoxes();
      expect(boxA).toEqual([0, 1, 0, 0]);
      expect(boxB).toEqual([0, 1, 0, 1]);
    });

    it('CM-168: vertical wipe at position 1 should give A full, B no space', () => {
      manager.setWipeMode('vertical');
      manager.setWipePosition(1);
      const [boxA, boxB] = manager.computeStencilBoxes();
      expect(boxA).toEqual([0, 1, 0, 1]);
      expect(boxB).toEqual([0, 1, 1, 1]);
    });
  });

  // ===========================================================================
  // getWipeState (WipeControl compatibility)
  // ===========================================================================
  describe('getWipeState', () => {
    it('CM-169: should return mode off by default', () => {
      const wipeState = manager.getWipeState();
      expect(wipeState.mode).toBe('off');
    });

    it('CM-170: should return current position', () => {
      manager.setWipePosition(0.3);
      const wipeState = manager.getWipeState();
      expect(wipeState.position).toBe(0.3);
    });

    it('CM-171: showOriginal should be left for horizontal wipe', () => {
      manager.setWipeMode('horizontal');
      const wipeState = manager.getWipeState();
      expect(wipeState.showOriginal).toBe('left');
    });

    it('CM-172: showOriginal should be left for splitscreen-h', () => {
      manager.setWipeMode('splitscreen-h');
      const wipeState = manager.getWipeState();
      expect(wipeState.showOriginal).toBe('left');
    });

    it('CM-173: showOriginal should be top for vertical wipe', () => {
      manager.setWipeMode('vertical');
      const wipeState = manager.getWipeState();
      expect(wipeState.showOriginal).toBe('top');
    });

    it('CM-174: showOriginal should be top for splitscreen-v', () => {
      manager.setWipeMode('splitscreen-v');
      const wipeState = manager.getWipeState();
      expect(wipeState.showOriginal).toBe('top');
    });

    it('CM-175: showOriginal should be top for off mode', () => {
      // off mode falls into the else branch
      const wipeState = manager.getWipeState();
      expect(wipeState.showOriginal).toBe('top');
    });

    it('CM-176: should reflect current wipe mode', () => {
      manager.setWipeMode('vertical');
      const wipeState = manager.getWipeState();
      expect(wipeState.mode).toBe('vertical');
    });
  });

  // ===========================================================================
  // isSplitScreenMode
  // ===========================================================================
  describe('isSplitScreenMode', () => {
    it('CM-177: should return false when off', () => {
      expect(manager.isSplitScreenMode()).toBe(false);
    });

    it('CM-178: should return false for horizontal wipe', () => {
      manager.setWipeMode('horizontal');
      expect(manager.isSplitScreenMode()).toBe(false);
    });

    it('CM-179: should return false for vertical wipe', () => {
      manager.setWipeMode('vertical');
      expect(manager.isSplitScreenMode()).toBe(false);
    });

    it('CM-180: should return true for splitscreen-h', () => {
      manager.setWipeMode('splitscreen-h');
      expect(manager.isSplitScreenMode()).toBe(true);
    });

    it('CM-181: should return true for splitscreen-v', () => {
      manager.setWipeMode('splitscreen-v');
      expect(manager.isSplitScreenMode()).toBe(true);
    });
  });

  // ===========================================================================
  // toggleSplitScreen
  // ===========================================================================
  describe('toggleSplitScreen', () => {
    it('CM-182: from off should go to splitscreen-h', () => {
      manager.toggleSplitScreen();
      expect(manager.getWipeMode()).toBe('splitscreen-h');
    });

    it('CM-183: from horizontal should go to splitscreen-h', () => {
      manager.setWipeMode('horizontal');
      manager.toggleSplitScreen();
      expect(manager.getWipeMode()).toBe('splitscreen-h');
    });

    it('CM-184: from vertical should go to splitscreen-h', () => {
      manager.setWipeMode('vertical');
      manager.toggleSplitScreen();
      expect(manager.getWipeMode()).toBe('splitscreen-h');
    });

    it('CM-185: from splitscreen-h should go to splitscreen-v', () => {
      manager.setWipeMode('splitscreen-h');
      manager.toggleSplitScreen();
      expect(manager.getWipeMode()).toBe('splitscreen-v');
    });

    it('CM-186: from splitscreen-v should go to off', () => {
      manager.setWipeMode('splitscreen-v');
      manager.toggleSplitScreen();
      expect(manager.getWipeMode()).toBe('off');
    });

    it('CM-187: full cycle: off -> splitscreen-h -> splitscreen-v -> off', () => {
      manager.toggleSplitScreen();
      expect(manager.getWipeMode()).toBe('splitscreen-h');
      manager.toggleSplitScreen();
      expect(manager.getWipeMode()).toBe('splitscreen-v');
      manager.toggleSplitScreen();
      expect(manager.getWipeMode()).toBe('off');
    });
  });

  // ===========================================================================
  // isActive
  // ===========================================================================
  describe('isActive', () => {
    it('CM-188: should be false with all defaults', () => {
      expect(manager.isActive()).toBe(false);
    });

    it('CM-189: should be true with wipe mode on', () => {
      manager.setWipeMode('horizontal');
      expect(manager.isActive()).toBe(true);
    });

    it('CM-190: should be true with B selected and available', () => {
      manager.setABAvailable(true);
      manager.setABSource('B');
      expect(manager.isActive()).toBe(true);
    });

    it('CM-191: should be false with B selected but not available', () => {
      manager.setABSource('B');
      expect(manager.isActive()).toBe(false);
    });

    it('CM-192: should be false with A selected and available', () => {
      manager.setABAvailable(true);
      expect(manager.isActive()).toBe(false);
    });

    it('CM-193: should be true with difference matte enabled', () => {
      manager.setDifferenceMatteEnabled(true);
      expect(manager.isActive()).toBe(true);
    });

    it('CM-194: should be true with blend mode on', () => {
      manager.setBlendMode('onionskin');
      expect(manager.isActive()).toBe(true);
    });

    it('CM-195: should be true with quad view enabled', () => {
      manager.setQuadViewEnabled(true);
      expect(manager.isActive()).toBe(true);
    });

    it('CM-196: should be false after disabling all active features', () => {
      manager.setWipeMode('horizontal');
      manager.setWipeMode('off');
      expect(manager.isActive()).toBe(false);
    });
  });

  // ===========================================================================
  // dispose
  // ===========================================================================
  describe('dispose', () => {
    it('CM-197: dispose should stop flicker interval', () => {
      manager.setBlendMode('flicker');
      vi.advanceTimersByTime(250);
      expect(manager.getFlickerFrame()).toBe(1);
      manager.dispose();
      vi.advanceTimersByTime(1000);
      expect(manager.getFlickerFrame()).toBe(0);
    });

    it('CM-198: dispose is safe to call without active flicker', () => {
      expect(() => manager.dispose()).not.toThrow();
    });

    it('CM-199: dispose is safe to call multiple times', () => {
      manager.setBlendMode('flicker');
      expect(() => {
        manager.dispose();
        manager.dispose();
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // Complex Mutual Exclusion Scenarios
  // ===========================================================================
  describe('complex mutual exclusion scenarios', () => {
    it('CM-200: enabling wipe then blend should leave only blend active', () => {
      manager.setWipeMode('horizontal');
      manager.setBlendMode('onionskin');
      expect(manager.getWipeMode()).toBe('off');
      expect(manager.getBlendMode()).toBe('onionskin');
    });

    it('CM-201: enabling diff matte then quad view should leave only quad active', () => {
      manager.setDifferenceMatteEnabled(true);
      manager.setQuadViewEnabled(true);
      expect(manager.isDifferenceMatteEnabled()).toBe(false);
      expect(manager.isQuadViewEnabled()).toBe(true);
    });

    it('CM-202: enabling blend then diff matte should leave only diff matte active', () => {
      manager.setBlendMode('blend');
      manager.toggleDifferenceMatte();
      // diff matte disables wipe and quad, but not blend directly
      // Actually - diff matte only disables wipe and quad, not blend
      // But blend disables diff matte
      // toggleDifferenceMatte enables diff matte which disables wipe and quad
      expect(manager.isDifferenceMatteEnabled()).toBe(true);
      // blend is still on since diff matte doesn't disable blend
      expect(manager.getBlendMode()).toBe('blend');
    });

    it('CM-203: enabling quad view should disable everything else', () => {
      manager.setWipeMode('horizontal');
      manager.setBlendMode('onionskin'); // this also disables wipe
      manager.setDifferenceMatteEnabled(true); // this doesn't disable blend
      manager.setQuadViewEnabled(true); // this disables everything
      expect(manager.getWipeMode()).toBe('off');
      expect(manager.getBlendMode()).toBe('off');
      expect(manager.isDifferenceMatteEnabled()).toBe(false);
      expect(manager.isQuadViewEnabled()).toBe(true);
    });

    it('CM-204: rapid toggles should maintain consistent state', () => {
      manager.setWipeMode('horizontal');
      manager.toggleDifferenceMatte(); // enables diff, disables wipe
      manager.toggleDifferenceMatte(); // disables diff
      manager.setBlendMode('flicker');
      manager.setQuadViewEnabled(true); // disables flicker
      manager.setQuadViewEnabled(false);
      expect(manager.getWipeMode()).toBe('off');
      expect(manager.isDifferenceMatteEnabled()).toBe(false);
      expect(manager.getBlendMode()).toBe('off');
      expect(manager.isQuadViewEnabled()).toBe(false);
      expect(manager.isActive()).toBe(false);
    });

    it('CM-205: quad view disabling flicker should stop the interval', () => {
      manager.setBlendMode('flicker');
      vi.advanceTimersByTime(250);
      expect(manager.getFlickerFrame()).toBe(1);
      manager.setQuadViewEnabled(true);
      expect(manager.getBlendMode()).toBe('off');
      expect(manager.getFlickerFrame()).toBe(0);
      vi.advanceTimersByTime(1000);
      expect(manager.getFlickerFrame()).toBe(0);
    });

    it('CM-206: blend mode disabling all conflicts emits correct events', () => {
      manager.setWipeMode('horizontal');
      manager.setDifferenceMatteEnabled(true); // disables wipe
      // Re-enable wipe for test setup via a different path:
      // Actually wipe is already off due to diff matte. Let's set up fresh.
      const manager2 = new ComparisonManager();
      manager2.setQuadViewEnabled(true);

      const wipeCallback = vi.fn();
      const diffCallback = vi.fn();
      const quadCallback = vi.fn();
      const blendCallback = vi.fn();
      manager2.on('wipeModeChanged', wipeCallback);
      manager2.on('differenceMatteChanged', diffCallback);
      manager2.on('quadViewChanged', quadCallback);
      manager2.on('blendModeChanged', blendCallback);

      manager2.setBlendMode('onionskin');
      // Quad was on, so quadViewChanged should be emitted
      expect(quadCallback).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
      // Wipe was off, so no wipeModeChanged
      expect(wipeCallback).not.toHaveBeenCalled();
      // Diff matte was off, so no differenceMatteChanged
      expect(diffCallback).not.toHaveBeenCalled();
      // Blend itself changed
      expect(blendCallback).toHaveBeenCalled();

      manager2.dispose();
    });
  });

  // ===========================================================================
  // Event Emission Order and Completeness
  // ===========================================================================
  describe('event emission details', () => {
    it('CM-207: setWipeMode emits wipeModeChanged before stateChanged', () => {
      const order: string[] = [];
      manager.on('wipeModeChanged', () => order.push('wipeModeChanged'));
      manager.on('stateChanged', () => order.push('stateChanged'));
      manager.setWipeMode('horizontal');
      expect(order).toEqual(['wipeModeChanged', 'stateChanged']);
    });

    it('CM-208: setWipePosition emits wipePositionChanged before stateChanged', () => {
      const order: string[] = [];
      manager.on('wipePositionChanged', () => order.push('wipePositionChanged'));
      manager.on('stateChanged', () => order.push('stateChanged'));
      manager.setWipePosition(0.3);
      expect(order).toEqual(['wipePositionChanged', 'stateChanged']);
    });

    it('CM-209: setABSource emits abSourceChanged before stateChanged', () => {
      const order: string[] = [];
      manager.on('abSourceChanged', () => order.push('abSourceChanged'));
      manager.on('stateChanged', () => order.push('stateChanged'));
      manager.setABSource('B');
      expect(order).toEqual(['abSourceChanged', 'stateChanged']);
    });

    it('CM-210: toggleAB emits abSourceChanged, then abToggled', () => {
      manager.setABAvailable(true);
      const order: string[] = [];
      manager.on('abSourceChanged', () => order.push('abSourceChanged'));
      manager.on('abToggled', () => order.push('abToggled'));
      manager.on('stateChanged', () => order.push('stateChanged'));
      manager.toggleAB();
      expect(order).toEqual(['abSourceChanged', 'stateChanged', 'abToggled']);
    });

    it('CM-211: toggleDifferenceMatte emits differenceMatteChanged before stateChanged', () => {
      const order: string[] = [];
      manager.on('differenceMatteChanged', () => order.push('differenceMatteChanged'));
      manager.on('stateChanged', () => order.push('stateChanged'));
      manager.toggleDifferenceMatte();
      expect(order).toEqual(['differenceMatteChanged', 'stateChanged']);
    });

    it('CM-212: setBlendMode emits blendModeChanged before stateChanged', () => {
      const order: string[] = [];
      manager.on('blendModeChanged', () => order.push('blendModeChanged'));
      manager.on('stateChanged', () => order.push('stateChanged'));
      manager.setBlendMode('onionskin');
      expect(order).toEqual(['blendModeChanged', 'stateChanged']);
    });

    it('CM-213: enabling wipe with quad active emits quadViewChanged then wipeModeChanged then stateChanged', () => {
      manager.setQuadViewEnabled(true);
      const order: string[] = [];
      manager.on('quadViewChanged', () => order.push('quadViewChanged'));
      manager.on('wipeModeChanged', () => order.push('wipeModeChanged'));
      manager.on('stateChanged', () => order.push('stateChanged'));
      manager.setWipeMode('horizontal');
      expect(order).toEqual(['quadViewChanged', 'wipeModeChanged', 'stateChanged']);
    });

    it('CM-214: stateChanged payload should reflect current state snapshot', () => {
      const callback = vi.fn();
      manager.on('stateChanged', callback);
      manager.setWipeMode('horizontal');
      manager.setWipePosition(0.3);
      manager.setABSource('B');
      expect(callback).toHaveBeenCalledTimes(3);
      // Last call should have all updated fields
      const lastState = callback.mock.calls[2][0] as CompareState;
      expect(lastState.wipeMode).toBe('horizontal');
      expect(lastState.wipePosition).toBe(0.3);
      expect(lastState.currentAB).toBe('B');
    });
  });

  // ===========================================================================
  // State Immutability
  // ===========================================================================
  describe('state immutability', () => {
    it('CM-215: getState should return a shallow copy', () => {
      const state1 = manager.getState();
      const state2 = manager.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('CM-216: mutating getState result should not affect internal state', () => {
      const state = manager.getState();
      state.wipeMode = 'horizontal';
      state.wipePosition = 0.1;
      state.currentAB = 'D';
      expect(manager.getWipeMode()).toBe('off');
      expect(manager.getWipePosition()).toBe(0.5);
      expect(manager.getABSource()).toBe('A');
    });

    it('CM-217: mutating getQuadSources result should not affect internal state', () => {
      const sources = manager.getQuadSources();
      sources[0] = 'D';
      expect(manager.getQuadSources()[0]).toBe('A');
    });

    it('CM-218: mutating getBlendModeState result should not affect internal state', () => {
      const state = manager.getBlendModeState();
      state.mode = 'flicker';
      state.onionOpacity = 0.9;
      expect(manager.getBlendMode()).toBe('off');
      expect(manager.getOnionOpacity()).toBe(0.5);
    });

    it('CM-219: mutating getDifferenceMatteState result should not affect internal state', () => {
      const state = manager.getDifferenceMatteState();
      state.enabled = true;
      state.gain = 10;
      expect(manager.isDifferenceMatteEnabled()).toBe(false);
      expect(manager.getDifferenceMatteState().gain).toBe(1.0);
    });

    it('CM-220: mutating getQuadViewState result should not affect internal state', () => {
      const state = manager.getQuadViewState();
      state.enabled = true;
      state.sources[0] = 'D';
      expect(manager.isQuadViewEnabled()).toBe(false);
      expect(manager.getQuadSources()[0]).toBe('A');
    });
  });
});
